Collection of quick apps to study Spanish basics. Open `index.html` to explore all 25 full-screen touch experiences as a mobile, vertically swiped feed. Each app can still be opened directly, and the shared navigation supports swipe gestures, Page Up/Page Down, and an idle scroll hint.

Hold one place after navigating to hear the complete Spanish readout, followed by a translation chosen from the browser language. English is the fallback and Finnish is also supported; there is no language selector. `learning-narration.js` prefers checked-in SyncVoice audio and cue timing for Spanish, then gracefully uses browser speech when a production asset is absent. Per-app catalogs keep runtime loading scoped to the current app.

Voice producers: see [`docs/syncvoice-production.md`](docs/syncvoice-production.md) for deterministic extraction, the Kore casting contract, asset paths, transcript timing, and validation commands.
