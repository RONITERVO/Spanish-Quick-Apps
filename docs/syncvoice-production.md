# SyncVoice production workflow

Spanish Quick Apps uses the `Kore` narrator for the held-target learning overlay in all 25 apps. Each Spanish phase and its browser-selected English or Finnish phase first tries a committed SyncVoice MP3 plus its synchronized cue transcript. Browser speech remains a diagnostic fallback only when a catalog entry, transcript, audio file, decode, or playback attempt is genuinely unavailable or broken.

## Casting and runtime inventory

| Surface | Locale | Speaker / role | Voice | Direction | Delivery |
| --- | --- | --- | --- | --- | --- |
| Shared learning overlay, Spanish phase | `es-ES` | `narrator` | `Kore` | Warm, patient educational narration; clear neutral Spanish, unhurried pacing, and gentle emphasis on key terms. | Committed MP3 + cues; browser fallback on asset failure |
| Shared learning overlay, English phase | `en-US` | `narrator` | `Kore` | Warm, patient educational narration for a school audience; clear neutral American English, unhurried pacing, and gentle emphasis on key terms. | Committed MP3 + cues; browser fallback on asset failure |
| Shared learning overlay, Finnish phase | `fi-FI` | `narrator` | `Kore` | Warm, patient educational narration for a school audience; clear neutral Finnish, unhurried pacing, and gentle emphasis on key terms. | Committed MP3 + cues; browser fallback on asset failure |
| Immediate interaction labels in apps that define local speech | Existing app locale | Existing browser narrator | Best locale match | Existing per-app settings | Existing browser speech; unchanged |

Every app loads `learning-narration.js`. Apps 01 and 02 publish purpose-built learning targets. The shared semantic readout bridge publishes the common `feature-name`, `metric`, and `fact` target used by apps 03–25. Signature deduplication prevents duplicate narration.

Visible text and spoken text may intentionally differ when a value is calculated continuously. Set `data-learning-narration` on `feature-name`, `metric`, or `fact` to a stable Spanish catalog key. Custom `spectrum:learning-target` publishers can provide the equivalent `detail.narrationParts` array aligned with `detail.parts`. The overlay shows the live value while production lookup, translation, and audio use the stable Spanish source key.

Finite dynamic labels must be explicit catalog rows. App 02 therefore includes all four possible octave labels (`octava 3` through `octava 6`) in both translation catalogs. Do not enumerate unbounded measurements or use fuzzy asset matching.

## Canonical files and identity

- `.syncvoice/project.json` is the atomically generated version-1 production manifest. Commit it.
- `learning-translations/en/01.js` through `25.js` and `learning-translations/fi/01.js` through `25.js` are the exact checked-in text sources.
- The Spanish object key in each translation row is the stable source key. English and Finnish manifest text is copied exactly from that row's value.
- `assets/syncvoice/catalogs/<app>.js` maps `es-ES`, `en-US`, and `fi-FI` plus the stable Spanish source key to an `externalId`. Commit these generated catalogs.
- Spanish `assets/syncvoice/audio/<externalId>.mp3` and `assets/syncvoice/transcripts/<externalId>.json` remain in this repository.
- Full-quality English and Finnish audio, transcripts, and their generation receipt live in the public companion repository `RONITERVO/Spanish-Quick-Apps-audio`. Its GitHub Pages site is the runtime asset origin.
- `assets/syncvoice/manifest.json` is a tracked generation receipt written by the approved production runner. It is not the canonical extraction input.

Existing Spanish identity is unchanged: `sq-es` IDs remain the SHA-256-derived ID over manifest version, `es-ES`, and the complete Spanish source key. This preserves all existing Spanish paths and assets.

English and Finnish keys are app-scoped because a Spanish key can intentionally have different checked-in translations in different app contexts. Their deterministic identity is manifest version + production locale + `app-<nn>` + the complete stable Spanish source key, with `sq-en` or `sq-fi` prefixes. Array position and translated text are never part of identity. Text or casting can therefore be regenerated at the same stable path, while adding or reordering catalog rows does not renumber anything.

## Refresh and generate

Run from the repository root:

```powershell
node scripts/extract-syncvoice.mjs
node scripts/validate-syncvoice.mjs
git diff -- .syncvoice/project.json assets/syncvoice/catalogs
```

The default validation requires exactly `es-ES`, `en-US`, and `fi-FI`, exact English/Finnish key parity in every app, exact manifest text equality with checked-in translation values, deterministic IDs, and exact catalog/manifest parity.

Then use the approved offline production runner. English and Finnish are generated as a locale shard into the companion repository without changing the 96 kbps MPEG Layer III encoding:

```powershell
npm run agent:generate -- --manifest D:/Projects/Spanish-Quick-Apps/.syncvoice/project.json --env D:/Projects/tempTestKeys/.env --locale en-US,fi-FI --asset-root D:/Projects/Spanish-Quick-Apps-audio/assets/syncvoice
```

The source repository retains the resumable `.syncvoice/generation-state.json`; the companion repository contains only public production deliverables. This avoids GitHub Pages' 1 GiB per-site limit while keeping browser playback on a `github.io` origin. Git LFS is intentionally not used because GitHub Pages does not serve LFS objects.

The production contract is:

1. Import `.syncvoice/project.json`.
2. Generate only new or changed entries. Keep `speaker`, `locale`, `voice`, and `direction` from each manifest row.
3. Export 96 kbps MPEG Layer III audio to the selected asset root at `audio/<externalId>.mp3`.
4. Export Gemini-observed timing by default to `transcripts/<externalId>.json`. Add `--normalize-cues` only when deterministic full-duration pacing is preferred.
5. Update the selected asset root's tracked `manifest.json` generation receipt.
6. Require all three locales and inspect the asset diff:

```powershell
node scripts/validate-syncvoice.mjs --require-assets=es-ES
node scripts/validate-syncvoice.mjs --require-assets=en-US,fi-FI --asset-root=../Spanish-Quick-Apps-audio/assets/syncvoice
git status --short
git diff --stat
```

During the transition before English/Finnish production is delivered, existing Spanish assets can be checked independently:

```powershell
node scripts/validate-syncvoice.mjs --require-assets=es-ES
```

No API key belongs in this repository. Authentication and raw provider checkpoints stay in the approved runner. Same-directory `*.tmp`, `*.partial`, generation-state, log, lock, and checkpoint files are ignored. Canonical manifests, runtime catalogs, MP3s, transcript JSON, and the generation receipt are tracked.

## Transcript and cache contract

Each UTF-8 sidecar uses JavaScript string offsets into the exact manifest `text`:

```json
{
  "version": 1,
  "externalId": "sq-en-0123456789abcdef01234567",
  "text": "Exact checked-in text.",
  "durationMs": 1450,
  "cues": [
    { "startMs": 0, "endMs": 420, "startChar": 0, "endChar": 6 },
    { "startMs": 420, "endMs": 980, "startChar": 6, "endChar": 14 },
    { "startMs": 980, "endMs": 1450, "startChar": 14, "endChar": 22 }
  ]
}
```

Cues must be time-ordered, contiguous in character space, within `durationMs`, and cover the complete text including whitespace and terminal punctuation. Provider-observed timing may contain natural temporal gaps or finish before the audio does. The optional normalizer produces a contiguous full-duration timeline. The validator accepts both modes and rejects mismatched IDs/text, invalid ordering, invalid character coverage, missing audio, and missing sidecars.

## Local browser development

For the VS Code Live Server button, open `D:\Projects` as the served workspace and launch `Spanish-Quick-Apps/index.html`. The app and sibling `Spanish-Quick-Apps-audio` checkout are then available on the same localhost origin. English and Finnish first try the hosted Pages library and automatically retry `../Spanish-Quick-Apps-audio/assets/syncvoice/` if it is unavailable, avoiding CORS entirely.

To use another local asset directory, add `?syncvoice-assets=<same-origin-path-or-url>` before the app hash, or set `localStorage["syncvoice.assetBaseUrl"]`. An explicit override is tried first. Browser speech begins only after every configured, hosted, and automatic local asset candidate fails.

All 25 HTML entry points version the shared runtime. The runtime also versions translation modules, per-app SyncVoice catalogs, transcripts, and audio URLs; audio URLs include transcript duration so a regenerated clip cannot be shadowed by an older GitHub Pages browser cache. Increment the shared revision in `learning-narration.js` and all HTML `learning-narration.js?v=` references whenever cache-sensitive runtime/catalog behavior changes.

For QA, `window.SpectrumLearningNarration.diagnostics()` reports generated-asset plays, browser fallbacks, the last locale, and the concrete failure reason. Cancellation is not recorded as an asset failure and never starts fallback speech.

## Registering a future locale

1. Add one translation module per app under `learning-translations/<language>/01.js` through `25.js`, using exact parity with the existing stable Spanish keys.
2. Add the production locale, ID prefix, source directory, translation property, and locale-specific school-appropriate direction to `LOCALES` in `scripts/extract-syncvoice.mjs`.
3. Add browser locale selection and a display label in `learning-narration.js`.
4. Run extraction and validation; review the new locale rows and per-app catalogs before generation.
5. Choose a stable asset origin. If the projected Pages site would approach 1 GiB, generate the locale shard into a companion Pages repository and add its URL to `project.assetOrigins` and the runtime routing table.
6. Produce and commit MP3s, cue sidecars, and the updated generation receipt; run `--require-assets` against the matching local asset root.
7. Increment the runtime/catalog cache revision and all HTML runtime query versions.

Never reuse another locale's prefix or change an existing locale identity rule. A future locale is additive; existing source IDs are a permanent API.
