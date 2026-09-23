# Architecture

The application remains a static site with 25 full-screen touch experiences. Its production URLs, page titles, Spanish educational content, canvas designs, gestures, and browser-selected English/Finnish narration are preserved.

## Source and delivery

The original self-contained HTML files are replaced by a route registry, per-experience content and renderer modules, small markup fragments, and stylesheet files. A Node build validates the registry and content, then uses esbuild to generate the original HTML routes with hashed JavaScript/CSS entry points and shared JavaScript chunks. Only public runtime files enter `dist/`; development scripts, source, production manifests, and tests are excluded.

There is no client framework, router dependency, application server, database, or runtime npm dependency. Browser-standard JavaScript modules and static HTML suit this finished collection and its existing GitHub Pages hosting. Each custom renderer stays independently editable: drawing a planet and playing a musical instrument do not need an artificial common renderer.

The feed retains iframe isolation because the experiences intentionally have different canvas, DOM, audio, and interaction state. It preloads the adjacent experiences, retains at most five loaded documents, and unloads distant scenes. The new shared animation scheduler runs only the active experience, retaining callbacks for resumption. Inactive scenes also suspend synthesized audio and cancel narration. Messages validate both origin and frame identity.

Every entry mounts feedback (where applicable), its scene, narration, and navigation in that order. The build owns this order. Contributors do not repeat script tags or maintain navigation lists in individual pages. A ready handshake hides the loading placeholder only after initialization; a failed load offers retry and the original direct URL.

## Content and audio contracts

`content.json` separates zone prose and factual material from drawing algorithms. Shared mathematical functions, animation scheduling, and audio capability checks live alongside navigation and learning features in `src/shared/`. Runtime styles are regular CSS, not strings injected from JavaScript.

The migration preserves all translation keys, all 18,898 catalog entries, and all 6,068 local Spanish recordings/transcripts. English and Finnish recordings stay on the existing companion GitHub Pages origin. Narration resolves assets relative to the HTML route, so bundling code into hashed shared chunks does not change those URLs. Its persistent media element, hold timing, synchronized cues, language selection, fallback, and cancellation behavior are retained. Asset catalog revisioning remains explicit in the narration module.

`playback-speed.js` owns the accessible narration speed selector and its local preference. Storage events keep already-loaded experiences and other tabs synchronized. Narration applies both the current and default media playback rates, preserving pitch; transcript cues follow media time rather than wall time. Browser speech uses the same multiplier at the start of each utterance. Shared gesture handlers exclude controls, and control events do not reach scene keyboard shortcuts.

Narration completes each Spanish/translation pair before advancing to the next content segment. Both recordings use the same source key and caption row: translated ink writes over the faint Spanish source. Completed rows remain visible while later pairs play, and the overlay is marked complete only after the final translation. Cancellation tokens guard every segment and language transition.

Shared context skipping is opt-in. Region-based renderers call `setReadoutRegion(readout, zone.id)` when selecting a region. Their markup gives each field an explicit `data-narration-role`: `region-heading`, `shared-context`, `item`, or `explanation`. `readNarrationTarget()` supplies the same structured segments to pointer, keyboard, and feedback narration, retaining separate display and spoken text for dynamic measurements. Custom `spectrum:learning-target` events may provide `{ regionId, segments: [{ id, role, display, narration }] }`; legacy `parts`/`narrationParts` remain supported and are always spoken.

`shared-narration-memory.js` retains only explicitly shared fields in the current region and target. A pair becomes heard after successful completion of both languages. Its identity includes field ID, role, display text, spoken text, translation, and locale; changes invalidate it. Unknown roles, missing metadata, ambiguous IDs, and a heading that also names an item default to speaking. Generation checks prevent interrupted or superseded playback from recording stale completions. Region changes reset memory immediately, including a quick move away and back without listening. Scene inactivity (including hidden tabs) and page exit also clear it. No listening history is stored persistently or shared between experiences. Skipped rows display their completed translation over the faint Spanish source while new item content plays normally.

## Validation and release

`npm run check` builds the public site, runs content and lifecycle tests, and validates the complete Spanish audio inventory and all three locales' catalog identities. Playwright exercises the actual built output in mobile Chromium, desktop Chromium, and mobile WebKit. Preservation fixtures were captured from commit `21a6ff75df64412c269489f177e8ddbad837c044` before migration.

During migration, deterministic initial renders and interaction samples were compared for all 25 experiences at 390×844 and 1280×800. Every content sample matched. Across all 50 image comparisons, fewer than 0.00023% of color channels differed by more than five intensity levels; the differences were rasterization rounding. The comparison itself is migration evidence, while committed interaction and content fixtures continue guarding behavior.

The GitHub Actions workflow verifies PRs and deploys the tested `dist/` artifact after a merge to `main`. Repository Pages settings must use **GitHub Actions** as the publishing source. `release.json` exposes the deployed commit for post-release checks. Relative asset URLs support the existing `/Spanish-Quick-Apps/` project prefix.

For a normal rollback, revert the offending PR and let the same verification/deployment workflow publish it. The pre-migration repository did not have a build workflow: rolling all the way back requires restoring the old files and switching Pages back to the original `main` branch source. Keep the prior successful Pages deployment available until the new release is verified.
