# Spanish Quick Apps

[Open the app](https://ronitervo.github.io/Spanish-Quick-Apps/): 25 full-screen touch experiences for exploring concepts in Spanish, from colors and music to the cosmos. Swipe vertically between experiences, use Page Up/Page Down, or open any of the original numbered URLs directly.

Hold one place to hear each Spanish line followed immediately by its translation, before the next Spanish line. The translation writes over that same Spanish line, keeping the Spanish faintly visible underneath. Translation follows the browser language: English is the fallback; Finnish is also supported. Recorded SyncVoice audio and synchronized cues are preferred, with browser speech as a fallback. Spanish recordings are included here; English and Finnish recordings remain on the companion audio site's existing origin.

Use the speaker/speed selector at the top left to set narration from 1× to 3× in 0.25× steps. Recorded speech changes speed immediately, preserves pitch, and keeps captions synchronized. The setting is remembered across experiences and visits. Browser speech fallback uses the selected speed from its next spoken segment.

When exploring nearby items in the same region, fully heard headings and shared context stay visible without being spoken again. Both the Spanish and translation must finish before a shared line can be skipped. Item names, explanations, and changed context still play. Moving to another region or experience, leaving the tab, or reloading clears this temporary memory.

## Development

Requires Node 24 or newer.

```sh
npm ci
npm run dev
```

Open the printed localhost URL. Source changes rebuild automatically; refresh the browser to see them. For a production preview, run `npm run build` and `npm run preview`.

The app is authored as modules, content files, and styles under `src/`. A small static build generates `dist/`, including all original HTML routes. There are no runtime npm dependencies. Do not edit generated files or serve the repository root as the application.

```sh
npm run check
npx playwright install chromium webkit
npm run test:e2e
```

Pull requests run the same checks in GitHub Actions. Merges to `main` deploy the verified artifact to the existing GitHub Pages address. See [architecture and deployment](docs/architecture.md), [contributing](CONTRIBUTING.md), and [audio production](docs/syncvoice-production.md).
