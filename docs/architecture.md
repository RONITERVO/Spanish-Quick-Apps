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

## Validation and release

`npm run check` builds the public site, runs content and lifecycle tests, and validates the complete Spanish audio inventory and all three locales' catalog identities. Playwright exercises the actual built output in mobile Chromium, desktop Chromium, and mobile WebKit. Preservation fixtures were captured from commit `21a6ff75df64412c269489f177e8ddbad837c044` before migration.

During migration, deterministic initial renders and interaction samples were compared for all 25 experiences at 390×844 and 1280×800. Every content sample matched. Across all 50 image comparisons, fewer than 0.00023% of color channels differed by more than five intensity levels; the differences were rasterization rounding. The comparison itself is migration evidence, while committed interaction and content fixtures continue guarding behavior.

The GitHub Actions workflow verifies PRs and deploys the tested `dist/` artifact after a merge to `main`. Repository Pages settings must use **GitHub Actions** as the publishing source. `release.json` exposes the deployed commit for post-release checks. Relative asset URLs support the existing `/Spanish-Quick-Apps/` project prefix.

For a normal rollback, revert the offending PR and let the same verification/deployment workflow publish it. The pre-migration repository did not have a build workflow: rolling all the way back requires restoring the old files and switching Pages back to the original `main` branch source. Keep the prior successful Pages deployment available until the new release is verified.
