#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "..");
const TRANSLATIONS_ROOT = path.join(ROOT, "learning-translations");
const MANIFEST_PATH = path.join(ROOT, ".syncvoice", "project.json");
const CATALOG_DIR = path.join(ROOT, "assets", "syncvoice", "catalogs");

const SPEAKER = "narrator";
const VOICE = "Kore";
const LOCALES = Object.freeze({
  "es-ES": Object.freeze({
    prefix: "sq-es",
    sourceDirectory: "en",
    translationKey: null,
    direction: "Warm, patient educational narration; clear neutral Spanish, unhurried pacing, and gentle emphasis on key terms."
  }),
  "en-US": Object.freeze({
    prefix: "sq-en",
    sourceDirectory: "en",
    translationKey: "en",
    direction: "Warm, patient educational narration for a school audience; clear neutral American English, unhurried pacing, and gentle emphasis on key terms."
  }),
  "fi-FI": Object.freeze({
    prefix: "sq-fi",
    sourceDirectory: "fi",
    translationKey: "fi",
    direction: "Warm, patient educational narration for a school audience; clear neutral Finnish, unhurried pacing, and gentle emphasis on key terms."
  })
});
const REQUIRED_LOCALES = Object.freeze(Object.keys(LOCALES));
const FINITE_DYNAMIC_SOURCE_KEYS = Object.freeze({
  "02": Object.freeze(["octava 3", "octava 4", "octava 5", "octava 6"])
});

function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function externalIdFor(locale, sourceKey, appId = null) {
  const config = LOCALES[locale];
  if (!config) throw new Error(`Unsupported SyncVoice locale: ${locale}`);
  if (locale !== "es-ES" && !/^\d{2}$/.test(appId || "")) {
    throw new Error(`Locale ${locale} requires a stable two-digit app scope`);
  }
  const stableSourceKey = locale === "es-ES"
    ? sourceKey
    : `app-${appId}:${sourceKey}`;
  const sourceIdentity = `syncvoice:v1:${locale}:localization-key:${stableSourceKey}`;
  return `${config.prefix}-${createHash("sha256").update(sourceIdentity).digest("hex").slice(0, 24)}`;
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

async function loadTranslationModule(appId, locale) {
  const config = LOCALES[locale];
  const sourcePath = path.join(TRANSLATIONS_ROOT, config.sourceDirectory, `${appId}.js`);
  const source = await readFile(sourcePath, "utf8");
  const context = vm.createContext({ window: Object.create(null) });
  vm.runInContext(source, context, { filename: sourcePath, timeout: 1000 });

  const catalog = context.window.SpectrumLearningTranslations?.[appId]?.[config.translationKey];
  if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) {
    throw new Error(`Catalog ${sourcePath} did not register app ${appId} / ${config.translationKey}`);
  }
  return {
    sourceFile: toPosix(path.relative(ROOT, sourcePath)),
    values: catalog
  };
}

async function readCatalog(fileName) {
  const appId = path.basename(fileName, ".js");
  if (!/^\d{2}$/.test(appId)) throw new Error(`Unexpected catalog filename: ${fileName}`);

  const en = await loadTranslationModule(appId, "en-US");
  const fi = await loadTranslationModule(appId, "fi-FI");
  const sourceKeys = Object.keys(en.values);
  const fiSourceKeys = Object.keys(fi.values);
  const missingFinnish = sourceKeys.filter(sourceKey => !(sourceKey in fi.values));
  const extraFinnish = fiSourceKeys.filter(sourceKey => !(sourceKey in en.values));
  if (missingFinnish.length || extraFinnish.length) {
    throw new Error(
      `App ${appId}: en/fi source-key parity failed ` +
      `(missing fi: ${missingFinnish.length}, extra fi: ${extraFinnish.length})`
    );
  }
  for (const sourceKey of sourceKeys) {
    if (!sourceKey.trim()) throw new Error(`App ${appId}: empty Spanish source key`);
    if (!String(en.values[sourceKey]).trim()) throw new Error(`App ${appId}: empty en-US value for ${JSON.stringify(sourceKey)}`);
    if (!String(fi.values[sourceKey]).trim()) throw new Error(`App ${appId}: empty fi-FI value for ${JSON.stringify(sourceKey)}`);
  }
  for (const sourceKey of FINITE_DYNAMIC_SOURCE_KEYS[appId] || []) {
    if (!(sourceKey in en.values) || !(sourceKey in fi.values)) {
      throw new Error(`App ${appId}: missing finite dynamic label ${JSON.stringify(sourceKey)}`);
    }
  }

  return { appId, sourceKeys, en, fi };
}

function catalogModule(appId, mappings) {
  const sortedMappings = Object.fromEntries(REQUIRED_LOCALES.map(locale => [
    locale,
    Object.fromEntries(
      [...mappings[locale]].sort(([left], [right]) => left.localeCompare(right, "es"))
    )
  ]));
  return `(() => {\n  "use strict";\n  const root = window.SpectrumSyncVoiceCatalogs ||= {};\n  const catalog = ${JSON.stringify(sortedMappings, null, 2)};\n  for (const locale of Object.keys(catalog)) Object.freeze(catalog[locale]);\n  root[${JSON.stringify(appId)}] = Object.freeze(catalog);\n})();\n`;
}

async function main() {
  const englishDirectory = path.join(TRANSLATIONS_ROOT, "en");
  const fileNames = (await readdir(englishDirectory))
    .filter(fileName => /^\d{2}\.js$/.test(fileName))
    .sort();
  if (fileNames.length !== 25) throw new Error(`Expected 25 English catalogs, found ${fileNames.length}`);

  const catalogs = [];
  const spanishProvenance = new Map();
  for (const fileName of fileNames) {
    const catalog = await readCatalog(fileName);
    catalogs.push(catalog);
    for (const sourceKey of catalog.sourceKeys) {
      if (!spanishProvenance.has(sourceKey)) {
        spanishProvenance.set(sourceKey, {
          appId: catalog.appId,
          sourceFile: catalog.en.sourceFile
        });
      }
    }
  }

  const spanishEntries = [...spanishProvenance.entries()].map(([sourceKey, source]) => ({
    externalId: externalIdFor("es-ES", sourceKey),
    scene: `app-${source.appId}`,
    speaker: SPEAKER,
    text: sourceKey,
    locale: "es-ES",
    voice: VOICE,
    direction: LOCALES["es-ES"].direction,
    sourceFile: source.sourceFile,
    sourceKey
  }));

  const translatedEntries = catalogs.flatMap(catalog => ([
    ...catalog.sourceKeys.map(sourceKey => ({
      externalId: externalIdFor("en-US", sourceKey, catalog.appId),
      scene: `app-${catalog.appId}`,
      speaker: SPEAKER,
      text: String(catalog.en.values[sourceKey]),
      locale: "en-US",
      voice: VOICE,
      direction: LOCALES["en-US"].direction,
      sourceFile: catalog.en.sourceFile,
      sourceKey
    })),
    ...catalog.sourceKeys.map(sourceKey => ({
      externalId: externalIdFor("fi-FI", sourceKey, catalog.appId),
      scene: `app-${catalog.appId}`,
      speaker: SPEAKER,
      text: String(catalog.fi.values[sourceKey]),
      locale: "fi-FI",
      voice: VOICE,
      direction: LOCALES["fi-FI"].direction,
      sourceFile: catalog.fi.sourceFile,
      sourceKey
    }))
  ]));

  const entries = [...spanishEntries, ...translatedEntries]
    .sort((left, right) => left.externalId.localeCompare(right.externalId));
  const ids = new Set(entries.map(entry => entry.externalId));
  if (ids.size !== entries.length) throw new Error("A generated externalId collision was detected");

  const manifest = {
    version: 1,
    project: {
      name: "Spanish Quick Apps",
      slug: "spanish-quick-apps",
      description: "Committed Spanish, English, and Finnish learning narration shared by all 25 interactive apps.",
      defaultLocale: "es-ES",
      locales: REQUIRED_LOCALES,
      assetRoot: "assets/syncvoice",
      assetOrigins: {
        "es-ES": "assets/syncvoice/",
        "en-US": "https://ronitervo.github.io/Spanish-Quick-Apps-audio/assets/syncvoice/",
        "fi-FI": "https://ronitervo.github.io/Spanish-Quick-Apps-audio/assets/syncvoice/"
      },
      audioFormat: "mp3",
      transcriptFormat: "syncvoice-cues-v1"
    },
    entries
  };
  await atomicWrite(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);

  const spanishIdBySourceKey = new Map(spanishEntries.map(entry => [entry.sourceKey, entry.externalId]));
  await Promise.all(catalogs.map(catalog => {
    const mappings = {
      "es-ES": catalog.sourceKeys.map(sourceKey => [sourceKey, spanishIdBySourceKey.get(sourceKey)]),
      "en-US": catalog.sourceKeys.map(sourceKey => [sourceKey, externalIdFor("en-US", sourceKey, catalog.appId)]),
      "fi-FI": catalog.sourceKeys.map(sourceKey => [sourceKey, externalIdFor("fi-FI", sourceKey, catalog.appId)])
    };
    return atomicWrite(path.join(CATALOG_DIR, `${catalog.appId}.js`), catalogModule(catalog.appId, mappings));
  }));

  const sourceCount = catalogs.reduce((sum, catalog) => sum + catalog.sourceKeys.length, 0);
  console.log(
    `Wrote ${entries.length} entries: ${spanishEntries.length} preserved Spanish IDs, ` +
    `${sourceCount} en-US entries, and ${sourceCount} fi-FI entries.`
  );
  console.log(toPosix(path.relative(ROOT, MANIFEST_PATH)));
  console.log(`${toPosix(path.relative(ROOT, CATALOG_DIR))}/01.js ... 25.js`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

export { FINITE_DYNAMIC_SOURCE_KEYS, LOCALES, REQUIRED_LOCALES, SPEAKER, VOICE, externalIdFor };
