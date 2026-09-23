# Contributing

Use Node 24 or newer. Run `npm ci`, then `npm run dev`, and open the printed local URL. The server rebuilds when source or translations change; refresh the browser after a successful build.

Each experience lives in `src/experiences/<id>/`:

- `content.json`: educational zones, features, sound palettes, and static layouts.
- `scene.js`: that experience's custom drawing and interaction code.
- `style.css`: its visual presentation.
- `view.html`: its accessible markup, without a document wrapper or scripts.

Start with the smallest appropriate file. Preserve Spanish source keys unless changing the actual wording: translations and recorded narration identify content by those exact keys. Follow [the audio workflow](docs/syncvoice-production.md) when changing narrated content. Do not regenerate audio for a code-only change.

Shared navigation, narration, feedback, audio capability handling, animation scheduling, and drawing helpers live in `src/shared/`. Import `requestSceneFrame` and `cancelSceneFrame` instead of using the browser's animation functions directly. Create synthesized audio with `createSceneAudio()` and handle its `null` result. These boundaries keep off-screen experiences quiet and still.

`src/registry.json` is the ordered route and metadata registry. IDs and filenames are public compatibility contracts. To add an experience, choose a new two-digit ID and filename, create the four experience files, register the metadata, and supply its English/Finnish translations and SyncVoice catalog. The build generates its page and includes it in navigation automatically. Do not copy a complete generated HTML page. The original 25-app preservation assertions should be deliberately extended when the collection grows.

Before opening a PR:

```sh
npm run format
npm run check
npx playwright install chromium webkit
npm run test:e2e
```

The browser suite covers every original URL and compares interaction text with original-app fixtures at mobile and desktop sizes. It also exercises feed navigation, off-screen lifecycle, recorded narration, and locale selection in Chromium and WebKit. CI runs these checks before deploying. Tests never submit user data or regenerate paid audio.

The content hashes in `tests/fixtures/preservation.json` and readouts in `tests/fixtures/readouts.json` document the original experience. For intentional educational changes, update the relevant expectations with reviewed content; never refresh them simply to silence a failing test. A renderer change should also be inspected visually in both portrait and landscape.

Commit source and the npm lockfile. `dist/` is disposable output and is never edited or committed. Monthly Dependabot PRs group development-tool updates; CI remains the release gate.
