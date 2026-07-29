#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "..");
const TRANSLATIONS_DIR = path.join(ROOT, "learning-translations", "en");
const MANIFEST_PATH = path.join(ROOT, ".syncvoice", "project.json");
const CATALOG_DIR = path.join(ROOT, "assets", "syncvoice", "catalogs");

const LOCALE = "es-ES";
const SPEAKER = "narrator";
const VOICE = "Kore";
const DIRECTION = "Warm, patient educational narration; clear neutral Spanish, unhurried pacing, and gentle emphasis on key terms.";

function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function externalIdFor(text) {
  const sourceIdentity = `syncvoice:v1:${LOCALE}:localization-key:${text}`;
  return `sq-es-${createHash("sha256").update(sourceIdentity).digest("hex").slice(0, 24)}`;
}

async function atomicWrite(filePath, contents) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(temporaryPath, contents, "utf8");
    await rename(temporaryPath, filePath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

async function readCatalog(fileName) {
  const appId = path.basename(fileName, ".js");
  if (!/^\d{2}$/.test(appId)) throw new Error(`Unexpected catalog filename: ${fileName}`);

  const sourcePath = path.join(TRANSLATIONS_DIR, fileName);
  const source = await readFile(sourcePath, "utf8");
  const context = vm.createContext({ window: Object.create(null) });
  vm.runInContext(source, context, { filename: sourcePath, timeout: 1000 });

  const catalog = context.window.SpectrumLearningTranslations?.[appId]?.en;
  if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) {
    throw new Error(`Catalog ${fileName} did not register app ${appId} / en`);
  }

  return {
    appId,
    sourceFile: toPosix(path.relative(ROOT, sourcePath)),
    texts: Object.keys(catalog)
  };
}

function catalogModule(appId, entries) {
  const mapping = Object.fromEntries(
    [...entries]
      .sort(([left], [right]) => left.localeCompare(right, "es"))
      .map(([text, externalId]) => [text, externalId])
  );
  return `(() => {\n  "use strict";\n  const root = window.SpectrumSyncVoiceCatalogs ||= {};\n  root[${JSON.stringify(appId)}] = Object.freeze(${JSON.stringify(mapping, null, 2)});\n})();\n`;
}

async function main() {
  const fileNames = (await readdir(TRANSLATIONS_DIR))
    .filter(fileName => /^\d{2}\.js$/.test(fileName))
    .sort();
  if (fileNames.length !== 25) throw new Error(`Expected 25 English catalogs, found ${fileNames.length}`);

  const catalogs = [];
  const provenance = new Map();
  for (const fileName of fileNames) {
    const catalog = await readCatalog(fileName);
    catalogs.push(catalog);
    for (const text of catalog.texts) {
      if (!text.trim()) throw new Error(`Empty localization key in ${catalog.sourceFile}`);
      if (!provenance.has(text)) provenance.set(text, catalog);
    }
  }

  const entries = [...provenance.entries()]
    .map(([text, source]) => ({
      externalId: externalIdFor(text),
      scene: `app-${source.appId}`,
      speaker: SPEAKER,
      text,
      locale: LOCALE,
      voice: VOICE,
      direction: DIRECTION,
      sourceFile: source.sourceFile,
      sourceKey: text
    }))
    .sort((left, right) => left.externalId.localeCompare(right.externalId));

  const ids = new Set(entries.map(entry => entry.externalId));
  if (ids.size !== entries.length) throw new Error("A generated externalId collision was detected");

  const manifest = {
    version: 1,
    project: {
      name: "Spanish Quick Apps",
      slug: "spanish-quick-apps",
      description: "Offline Spanish learning narration shared by all 25 interactive apps.",
      defaultLocale: LOCALE,
      assetRoot: "assets/syncvoice",
      audioFormat: "mp3",
      transcriptFormat: "syncvoice-cues-v1"
    },
    entries
  };

  await atomicWrite(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);

  const idByText = new Map(entries.map(entry => [entry.text, entry.externalId]));
  await Promise.all(catalogs.map(catalog => {
    const catalogEntries = catalog.texts.map(text => [text, idByText.get(text)]);
    return atomicWrite(path.join(CATALOG_DIR, `${catalog.appId}.js`), catalogModule(catalog.appId, catalogEntries));
  }));

  const sourceCount = catalogs.reduce((sum, catalog) => sum + catalog.texts.length, 0);
  console.log(`Wrote ${entries.length} deduplicated entries from ${sourceCount} localization keys.`);
  console.log(toPosix(path.relative(ROOT, MANIFEST_PATH)));
  console.log(`${toPosix(path.relative(ROOT, CATALOG_DIR))}/01.js ... 25.js`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

export { DIRECTION, LOCALE, SPEAKER, VOICE, externalIdFor };
