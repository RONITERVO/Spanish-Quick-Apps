#!/usr/bin/env node

import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { DIRECTION, LOCALE, SPEAKER, VOICE, externalIdFor } from "./extract-syncvoice.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "..");
const MANIFEST_PATH = path.join(ROOT, ".syncvoice", "project.json");
const ASSET_ROOT = path.join(ROOT, "assets", "syncvoice");
const REQUIRE_ASSETS = process.argv.includes("--require-assets");
const REQUIRED_ENTRY_FIELDS = ["externalId", "scene", "speaker", "text", "locale", "voice", "direction"];

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

async function loadSourceCatalog(appId) {
  const source = await readFile(path.join(ROOT, "learning-translations", "en", `${appId}.js`), "utf8");
  const context = vm.createContext({ window: Object.create(null) });
  vm.runInContext(source, context, { filename: `${appId}.js`, timeout: 1000 });
  return Object.keys(context.window.SpectrumLearningTranslations?.[appId]?.en || {});
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

  let previousStart = -1;
  let previousEndChar = 0;
  for (const cue of transcript.cues) {
    invariant(Number.isFinite(cue.startMs) && cue.startMs >= previousStart, `${entry.externalId}: cues are not time-sorted`);
    invariant(Number.isFinite(cue.endMs) && cue.endMs >= cue.startMs && cue.endMs <= transcript.durationMs, `${entry.externalId}: invalid cue endMs`);
    invariant(Number.isInteger(cue.startChar) && cue.startChar === previousEndChar, `${entry.externalId}: invalid cue startChar`);
    invariant(Number.isInteger(cue.endChar) && cue.endChar > cue.startChar && cue.endChar <= entry.text.length, `${entry.externalId}: invalid cue endChar`);
    previousStart = cue.startMs;
    previousEndChar = cue.endChar;
  }
  invariant(previousEndChar === entry.text.length, `${entry.externalId}: cues do not cover the complete text`);
}

async function validateAssets(entries) {
  for (const entry of entries) {
    const audioPath = path.join(ASSET_ROOT, "audio", `${entry.externalId}.mp3`);
    const transcriptPath = path.join(ASSET_ROOT, "transcripts", `${entry.externalId}.json`);
    await access(audioPath);
    const transcript = JSON.parse(await readFile(transcriptPath, "utf8"));
    validateTranscript(transcript, entry);
  }
}

async function main() {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  invariant(manifest.version === 1, "Manifest version must be 1");
  invariant(manifest.project?.assetRoot === "assets/syncvoice", "Unexpected asset root");
  invariant(Array.isArray(manifest.entries), "Manifest entries must be an array");

  const ids = new Set();
  const texts = new Set();
  let previousId = "";
  for (const entry of manifest.entries) {
    for (const field of REQUIRED_ENTRY_FIELDS) invariant(typeof entry[field] === "string" && entry[field], `${entry.externalId || "entry"}: missing ${field}`);
    invariant(entry.locale === LOCALE, `${entry.externalId}: expected locale ${LOCALE}`);
    invariant(entry.speaker === SPEAKER, `${entry.externalId}: expected speaker ${SPEAKER}`);
    invariant(entry.voice === VOICE, `${entry.externalId}: expected voice ${VOICE}`);
    invariant(entry.direction === DIRECTION, `${entry.externalId}: direction drifted`);
    invariant(entry.externalId === externalIdFor(entry.text), `${entry.externalId}: externalId is not deterministic`);
    invariant(entry.externalId > previousId, `${entry.externalId}: entries are not in stable externalId order`);
    invariant(!ids.has(entry.externalId), `${entry.externalId}: duplicate externalId`);
    invariant(!texts.has(entry.text), `${entry.externalId}: duplicate Spanish text`);
    ids.add(entry.externalId);
    texts.add(entry.text);
    previousId = entry.externalId;
  }

  const appIds = (await readdir(path.join(ROOT, "learning-translations", "en")))
    .filter(fileName => /^\d{2}\.js$/.test(fileName))
    .map(fileName => fileName.slice(0, 2))
    .sort();
  invariant(appIds.length === 25, `Expected 25 apps, found ${appIds.length}`);

  let sourceCount = 0;
  const sourceTextsAcrossApps = new Set();
  for (const appId of appIds) {
    const sourceTexts = await loadSourceCatalog(appId);
    const runtimeCatalog = await loadRuntimeCatalog(appId);
    invariant(runtimeCatalog && typeof runtimeCatalog === "object", `App ${appId}: missing runtime catalog`);
    invariant(Object.keys(runtimeCatalog).length === sourceTexts.length, `App ${appId}: runtime catalog size mismatch`);
    sourceCount += sourceTexts.length;
    for (const text of sourceTexts) {
      sourceTextsAcrossApps.add(text);
      const externalId = runtimeCatalog[text];
      invariant(ids.has(externalId), `App ${appId}: ${JSON.stringify(text)} has an unknown externalId`);
      invariant(externalId === externalIdFor(text), `App ${appId}: ${JSON.stringify(text)} maps to the wrong externalId`);
    }
  }
  invariant(sourceTextsAcrossApps.size === manifest.entries.length, `Manifest has ${manifest.entries.length} entries but source catalogs have ${sourceTextsAcrossApps.size} unique keys`);
  for (const entry of manifest.entries) invariant(sourceTextsAcrossApps.has(entry.text), `${entry.externalId}: text is no longer present in the source catalogs`);

  if (REQUIRE_ASSETS) await validateAssets(manifest.entries);
  console.log(`Validated ${manifest.entries.length} entries across ${appIds.length} apps (${sourceCount} source keys).`);
  console.log(REQUIRE_ASSETS ? "Audio and transcript assets are complete." : "Asset presence skipped; use --require-assets after generation.");
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
