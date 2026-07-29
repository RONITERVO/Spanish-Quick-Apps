#!/usr/bin/env node

import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import {
  FINITE_DYNAMIC_SOURCE_KEYS,
  LOCALES,
  REQUIRED_LOCALES,
  SPEAKER,
  VOICE,
  externalIdFor
} from "./extract-syncvoice.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "..");
const MANIFEST_PATH = path.join(ROOT, ".syncvoice", "project.json");
const ASSET_ROOT = path.join(ROOT, "assets", "syncvoice");
const ASSET_ROOT_ARGUMENT = process.argv.find(argument => argument.startsWith("--asset-root="));
const VALIDATION_ASSET_ROOT = ASSET_ROOT_ARGUMENT
  ? path.resolve(ROOT, ASSET_ROOT_ARGUMENT.slice(ASSET_ROOT_ARGUMENT.indexOf("=") + 1))
  : ASSET_ROOT;
const REQUIRE_ASSETS_ARGUMENT = process.argv.find(argument => argument === "--require-assets" || argument.startsWith("--require-assets="));
const REQUIRED_ASSET_LOCALES = REQUIRE_ASSETS_ARGUMENT?.includes("=")
  ? REQUIRE_ASSETS_ARGUMENT.slice(REQUIRE_ASSETS_ARGUMENT.indexOf("=") + 1).split(",")
  : REQUIRE_ASSETS_ARGUMENT
    ? REQUIRED_LOCALES
    : [];
const REQUIRED_ENTRY_FIELDS = ["externalId", "scene", "speaker", "text", "locale", "voice", "direction"];

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

async function loadSourceCatalog(appId, locale) {
  const config = LOCALES[locale];
  const sourcePath = path.join(ROOT, "learning-translations", config.sourceDirectory, `${appId}.js`);
  const source = await readFile(sourcePath, "utf8");
  const context = vm.createContext({ window: Object.create(null) });
  vm.runInContext(source, context, { filename: sourcePath, timeout: 1000 });
  const values = context.window.SpectrumLearningTranslations?.[appId]?.[config.translationKey];
  invariant(values && typeof values === "object" && !Array.isArray(values), `App ${appId}: missing ${locale} source catalog`);
  return { sourcePath, values };
}

async function loadRuntimeCatalog(appId) {
  const source = await readFile(path.join(ASSET_ROOT, "catalogs", `${appId}.js`), "utf8");
  const context = vm.createContext({ window: Object.create(null), Object });
  vm.runInContext(source, context, { filename: `${appId}.js`, timeout: 1000 });
  return context.window.SpectrumSyncVoiceCatalogs?.[appId];
}

function validateTranscript(transcript, entry) {
  invariant(transcript?.version === 1, `${entry.externalId}: transcript version must be 1`);
  invariant(transcript.externalId === entry.externalId, `${entry.externalId}: transcript externalId mismatch`);
  invariant(transcript.text === entry.text, `${entry.externalId}: transcript text mismatch`);
  invariant(Number.isFinite(transcript.durationMs) && transcript.durationMs > 0, `${entry.externalId}: invalid durationMs`);
  invariant(Array.isArray(transcript.cues) && transcript.cues.length > 0, `${entry.externalId}: transcript has no cues`);

  let previousEndMs = 0;
  let previousEndChar = 0;
  for (const cue of transcript.cues) {
    invariant(Number.isFinite(cue.startMs) && cue.startMs === previousEndMs, `${entry.externalId}: cue timeline is not contiguous`);
    invariant(Number.isFinite(cue.endMs) && cue.endMs >= cue.startMs && cue.endMs <= transcript.durationMs, `${entry.externalId}: invalid cue endMs`);
    invariant(Number.isInteger(cue.startChar) && cue.startChar === previousEndChar, `${entry.externalId}: invalid cue startChar`);
    invariant(Number.isInteger(cue.endChar) && cue.endChar > cue.startChar && cue.endChar <= entry.text.length, `${entry.externalId}: invalid cue endChar`);
    previousEndMs = cue.endMs;
    previousEndChar = cue.endChar;
  }
  invariant(previousEndMs === transcript.durationMs, `${entry.externalId}: cues do not cover the complete audio duration`);
  invariant(previousEndChar === entry.text.length, `${entry.externalId}: cues do not cover the complete text`);
}

async function validateAssets(entries) {
  for (const locale of REQUIRED_ASSET_LOCALES) invariant(REQUIRED_LOCALES.includes(locale), `Unknown asset locale ${locale}`);
  const requiredEntries = entries.filter(entry => REQUIRED_ASSET_LOCALES.includes(entry.locale));
  for (const entry of requiredEntries) {
    const audioPath = path.join(VALIDATION_ASSET_ROOT, "audio", `${entry.externalId}.mp3`);
    const transcriptPath = path.join(VALIDATION_ASSET_ROOT, "transcripts", `${entry.externalId}.json`);
    await access(audioPath);
    const transcript = JSON.parse(await readFile(transcriptPath, "utf8"));
    validateTranscript(transcript, entry);
  }
  return requiredEntries.length;
}

async function main() {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  invariant(manifest.version === 1, "Manifest version must be 1");
  invariant(manifest.project?.assetRoot === "assets/syncvoice", "Unexpected asset root");
  invariant(manifest.project?.assetOrigins?.["es-ES"] === "assets/syncvoice/", "Unexpected Spanish asset origin");
  invariant(manifest.project?.assetOrigins?.["en-US"] === "https://ronitervo.github.io/Spanish-Quick-Apps-audio/assets/syncvoice/", "Unexpected English asset origin");
  invariant(manifest.project?.assetOrigins?.["fi-FI"] === manifest.project.assetOrigins["en-US"], "Finnish and English must share the companion asset origin");
  invariant(
    JSON.stringify(manifest.project?.locales) === JSON.stringify(REQUIRED_LOCALES),
    `Manifest locales must be exactly ${REQUIRED_LOCALES.join(", ")}`
  );
  invariant(Array.isArray(manifest.entries), "Manifest entries must be an array");

  const entriesById = new Map();
  const localeCounts = Object.fromEntries(REQUIRED_LOCALES.map(locale => [locale, 0]));
  let previousId = "";
  for (const entry of manifest.entries) {
    for (const field of REQUIRED_ENTRY_FIELDS) {
      invariant(typeof entry[field] === "string" && entry[field], `${entry.externalId || "entry"}: missing ${field}`);
    }
    invariant(REQUIRED_LOCALES.includes(entry.locale), `${entry.externalId}: unexpected locale ${entry.locale}`);
    invariant(entry.speaker === SPEAKER, `${entry.externalId}: expected speaker ${SPEAKER}`);
    invariant(entry.voice === VOICE, `${entry.externalId}: expected voice ${VOICE}`);
    invariant(entry.direction === LOCALES[entry.locale].direction, `${entry.externalId}: direction drifted`);
    invariant(entry.externalId > previousId, `${entry.externalId}: entries are not in stable externalId order`);
    invariant(!entriesById.has(entry.externalId), `${entry.externalId}: duplicate externalId`);
    entriesById.set(entry.externalId, entry);
    localeCounts[entry.locale] += 1;
    previousId = entry.externalId;
  }

  const appIds = (await readdir(path.join(ROOT, "learning-translations", "en")))
    .filter(fileName => /^\d{2}\.js$/.test(fileName))
    .map(fileName => fileName.slice(0, 2))
    .sort();
  invariant(appIds.length === 25, `Expected 25 apps, found ${appIds.length}`);

  let sourceCount = 0;
  const spanishSourceKeys = new Set();
  const expectedEntryIds = new Set();
  for (const appId of appIds) {
    const en = await loadSourceCatalog(appId, "en-US");
    const fi = await loadSourceCatalog(appId, "fi-FI");
    const sourceKeys = Object.keys(en.values);
    invariant(Object.keys(fi.values).length === sourceKeys.length, `App ${appId}: en/fi source-key count mismatch`);
    invariant(sourceKeys.every(sourceKey => sourceKey in fi.values), `App ${appId}: en/fi source-key parity mismatch`);
    invariant(Object.keys(fi.values).every(sourceKey => sourceKey in en.values), `App ${appId}: fi/en source-key parity mismatch`);
    for (const sourceKey of FINITE_DYNAMIC_SOURCE_KEYS[appId] || []) {
      invariant(sourceKey in en.values && sourceKey in fi.values, `App ${appId}: missing finite dynamic label ${JSON.stringify(sourceKey)}`);
    }

    const runtimeCatalog = await loadRuntimeCatalog(appId);
    invariant(runtimeCatalog && typeof runtimeCatalog === "object", `App ${appId}: missing runtime catalog`);
    invariant(
      JSON.stringify(Object.keys(runtimeCatalog)) === JSON.stringify(REQUIRED_LOCALES),
      `App ${appId}: runtime locales must be exactly ${REQUIRED_LOCALES.join(", ")}`
    );
    sourceCount += sourceKeys.length;

    for (const locale of REQUIRED_LOCALES) {
      const localeCatalog = runtimeCatalog[locale];
      invariant(localeCatalog && typeof localeCatalog === "object", `App ${appId}: missing ${locale} runtime catalog`);
      invariant(Object.keys(localeCatalog).length === sourceKeys.length, `App ${appId}: ${locale} runtime catalog size mismatch`);
      invariant(Object.keys(localeCatalog).every(sourceKey => sourceKey in en.values), `App ${appId}: ${locale} runtime key parity mismatch`);
    }

    for (const sourceKey of sourceKeys) {
      spanishSourceKeys.add(sourceKey);
      const expectedTexts = {
        "es-ES": sourceKey,
        "en-US": String(en.values[sourceKey]),
        "fi-FI": String(fi.values[sourceKey])
      };
      for (const locale of REQUIRED_LOCALES) {
        const expectedId = externalIdFor(locale, sourceKey, locale === "es-ES" ? null : appId);
        const runtimeId = runtimeCatalog[locale][sourceKey];
        const entry = entriesById.get(expectedId);
        expectedEntryIds.add(expectedId);
        invariant(runtimeId === expectedId, `App ${appId}: ${locale} ${JSON.stringify(sourceKey)} maps to the wrong externalId`);
        invariant(entry, `App ${appId}: ${locale} ${JSON.stringify(sourceKey)} has no manifest entry`);
        invariant(entry.locale === locale, `${expectedId}: locale mismatch`);
        invariant(entry.text === expectedTexts[locale], `${expectedId}: text does not match the checked-in ${locale} value`);
        invariant(entry.sourceKey === sourceKey, `${expectedId}: sourceKey mismatch`);
        if (locale !== "es-ES") {
          invariant(entry.scene === `app-${appId}`, `${expectedId}: translated scene mismatch`);
          const expectedSourceSuffix = `learning-translations/${LOCALES[locale].sourceDirectory}/${appId}.js`;
          invariant(entry.sourceFile === expectedSourceSuffix, `${expectedId}: translated sourceFile mismatch`);
        }
      }
    }
  }

  invariant(localeCounts["es-ES"] === spanishSourceKeys.size, `Expected ${spanishSourceKeys.size} es-ES entries, found ${localeCounts["es-ES"]}`);
  invariant(localeCounts["en-US"] === sourceCount, `Expected ${sourceCount} en-US entries, found ${localeCounts["en-US"]}`);
  invariant(localeCounts["fi-FI"] === sourceCount, `Expected ${sourceCount} fi-FI entries, found ${localeCounts["fi-FI"]}`);
  invariant(expectedEntryIds.size === manifest.entries.length, "Manifest contains entries not referenced by the three-locale runtime catalogs");

  let assetCount = 0;
  if (REQUIRED_ASSET_LOCALES.length) assetCount = await validateAssets(manifest.entries);
  console.log(
    `Validated ${manifest.entries.length} entries across ${appIds.length} apps and all three locales ` +
    `(${sourceCount} source keys; ${JSON.stringify(localeCounts)}).`
  );
  console.log(
    REQUIRED_ASSET_LOCALES.length
      ? `Audio and transcript assets are complete for ${REQUIRED_ASSET_LOCALES.join(", ")} (${assetCount} entries).`
      : "Asset presence skipped; use --require-assets after three-locale generation."
  );
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
