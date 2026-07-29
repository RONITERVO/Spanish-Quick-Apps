# SyncVoice production workflow

Spanish Quick Apps uses one production narrator across all 25 apps. Spanish is generated as offline audio; the English or Finnish translation continues to use browser speech. The shared runtime always tries the generated Spanish asset first and preserves the existing browser-speech path when the catalog, transcript, audio, or playback permission is unavailable.

## Casting and runtime inventory

| Surface | Locale | Speaker / role | Voice | Direction | Delivery |
| --- | --- | --- | --- | --- | --- |
| Shared learning overlay in apps 01–25 | `es-ES` | `narrator` | `Kore` | Warm, patient educational narration; clear neutral Spanish, unhurried pacing, and gentle emphasis on key terms. | Offline SyncVoice MP3 plus cue transcript, then browser Spanish fallback |
| Shared translated overlay | browser-selected `en-*` or `fi-FI` | browser narrator | best locale match | Existing rate and pitch settings | Browser speech synthesis |
| Immediate interaction labels in apps that define local speech | `es-ES` | browser narrator | best Spanish match | Existing per-app settings | Browser speech; canceled when the shared held-target narration begins |

Every app loads `learning-narration.js`. Apps 01 and 02 publish their purpose-built learning targets directly. The central semantic readout bridge publishes the common `feature-name`, `metric`, and `fact` target used by apps 03–25, including apps that already publish the event themselves. Signature deduplication prevents duplicate narration.

## Canonical files

- `.syncvoice/project.json` is the generated, version-1 production manifest. Commit it.
- `learning-translations/en/01.js` through `25.js` are the extraction source. Their Spanish object keys are the stable semantic source keys; English values are not narrated by SyncVoice.
- `assets/syncvoice/catalogs/<app>.js` maps each app's source keys to canonical `externalId` values. Commit these generated catalogs.
- `assets/syncvoice/audio/<externalId>.mp3` is the required production audio path. Production audio is committed so the experience works offline.
- `assets/syncvoice/transcripts/<externalId>.json` is the required normalized timing path. Commit these sidecars.

The extractor deduplicates identical Spanish source keys across apps. The external ID is a deterministic SHA-256-derived identifier over manifest version, locale, and the complete localization key. It does not depend on array order or the first app containing the phrase. Therefore unchanged source text keeps its ID and asset path. A changed phrase receives a new ID; obsolete binary assets can be removed only after reviewing the manifest diff.

## Refresh and generate

Run these commands from the repository root:

```powershell
node scripts/extract-syncvoice.mjs
node scripts/validate-syncvoice.mjs
git diff -- .syncvoice/project.json assets/syncvoice/catalogs
```

Then perform the production generation in the approved SyncVoice runner:

1. Import `.syncvoice/project.json` as a version-1 project manifest.
2. Regenerate new or changed entries only. Do not recast unchanged entries. The manifest supplies `speaker`, `locale`, `voice`, and `direction` for every entry.
3. Export MPEG Layer III audio at `assets/syncvoice/audio/<externalId>.mp3`.
4. Export word or phrase timing, normalized to the transcript contract below, at `assets/syncvoice/transcripts/<externalId>.json`.
5. Validate the complete offline delivery and inspect the asset diff:

```powershell
node scripts/validate-syncvoice.mjs --require-assets
git status --short
git diff --stat
```

No API key belongs in this repository. Authentication and raw provider checkpoints remain in the approved production runner. Same-directory `*.tmp`, `*.partial`, and checkpoint files are ignored; canonical manifests, catalogs, MP3s, and transcript JSON are tracked.

## Transcript contract

The checked-in sidecar is UTF-8 JSON with character offsets into the exact manifest `text` (JavaScript string indexing semantics):

```json
{
  "version": 1,
  "externalId": "sq-es-0123456789abcdef01234567",
  "text": "Texto español exacto.",
  "durationMs": 1450,
  "cues": [
    { "startMs": 0, "endMs": 420, "startChar": 0, "endChar": 6 },
    { "startMs": 420, "endMs": 980, "startChar": 6, "endChar": 14 },
    { "startMs": 980, "endMs": 1450, "startChar": 14, "endChar": 21 }
  ]
}
```

Cues must be ordered, non-overlapping in character space, within `durationMs`, and together cover the complete text. Whitespace and terminal punctuation must be included in the offsets. The validator rejects mismatched IDs/text, gaps at the end, invalid ordering, missing audio, and missing sidecars.

## Failure behavior

Missing or malformed production data is not fatal. For each Spanish phrase the runtime loads its cue sidecar, attempts the corresponding MP3, and uses cue times to reveal the transcript. Any lookup, fetch, validation, decode, or playback failure immediately returns that phrase to the existing Spanish `SpeechSynthesisUtterance` path. Translation narration is unchanged.
