(() => {
  "use strict";

  const script = document.currentScript;
  const filename = decodeURIComponent(location.pathname.split("/").pop() || "");
  const appMatch = filename.match(/^(\d{2})_/);
  if (!script?.src || !appMatch) return;

  const appId = appMatch[1];
  const baseUrl = new URL(".", script.src);
  const syncvoiceBaseUrl = new URL("assets/syncvoice/", baseUrl);
  const remoteSyncvoiceBaseUrl = new URL("https://ronitervo.github.io/Spanish-Quick-Apps-audio/assets/syncvoice/");
  const isLocalDevelopment = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
  const localCompanionBaseUrl = new URL("../Spanish-Quick-Apps-audio/assets/syncvoice/", baseUrl);
  const supportedLocales = new Set(["en", "fi"]);
  const browserLanguages = [...(navigator.languages || []), navigator.language || ""];
  const locale = browserLanguages
    .map(language => language.toLowerCase().split("-")[0])
    .find(language => supportedLocales.has(language)) || "en";
  const speechLocale = locale === "fi" ? "fi-FI" : "en-US";
  const languageLabel = locale === "fi" ? "SUOMI" : "ENGLISH";
  const HOLD_DELAY_MS = 900;
  const JITTER_MIN = 28;
  const JITTER_MAX = 42;
  const SYNCVOICE_CATALOG_REVISION = "8";

  function configuredAssetBaseUrl() {
    const searches = [location.search];
    try { if (parent !== window) searches.unshift(parent.location.search); } catch (_) {}
    let stored = null;
    try { stored = localStorage.getItem("syncvoice.assetBaseUrl"); } catch (_) {}
    const configured = searches
      .map(search => new URLSearchParams(search).get("syncvoice-assets"))
      .find(Boolean) || stored;
    if (!configured) return null;
    try { return new URL(configured, baseUrl); } catch (_) { return null; }
  }

  function assetBaseUrls(assetLocale) {
    if (assetLocale === "es-ES") return [syncvoiceBaseUrl];
    const candidates = [];
    const configured = configuredAssetBaseUrl();
    if (configured) candidates.push(configured);
    candidates.push(remoteSyncvoiceBaseUrl);
    if (isLocalDevelopment) candidates.push(syncvoiceBaseUrl, localCompanionBaseUrl);
    return candidates.filter((candidate, index) => candidates.findIndex(item => item.href === candidate.href) === index);
  }

  function createSilentWavUrl() {
    try {
      const sampleRate = 8000;
      const sampleCount = Math.round(sampleRate * .08);
      const buffer = new ArrayBuffer(44 + sampleCount);
      const view = new DataView(buffer);
      const writeText = (offset, text) => {
        for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
      };
      writeText(0, "RIFF");
      view.setUint32(4, 36 + sampleCount, true);
      writeText(8, "WAVE");
      writeText(12, "fmt ");
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 1, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate, true);
      view.setUint16(32, 1, true);
      view.setUint16(34, 8, true);
      writeText(36, "data");
      view.setUint32(40, sampleCount, true);
      new Uint8Array(buffer, 44).fill(128);
      return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
    } catch (_) {
      return null;
    }
  }

  let activePointer = null;
  let interactionUnlocked = false;
  let anchor = null;
  let target = null;
  let holdTimer = 0;
  let runToken = 0;
  let animationFrame = 0;
  let hideTimer = 0;
  let catalog = Object.create(null);
  let assetCatalog = Object.create(null);
  const assetAudio = new Audio();
  const assetUnlockUrl = createSilentWavUrl();
  let assetAudioUnlocked = false;
  let assetUnlockPromise = null;
  let assetAudioMode = "idle";
  let activeAssetFinish = null;
  let activeAssetFrame = 0;
  let semanticPublishQueued = false;
  let semanticPoint = null;
  let lastAssetFailure = null;
  const playbackDiagnostics = {
    assetPlays: 0,
    assetStarts: 0,
    assetPlayRejections: 0,
    audioUnlocks: 0,
    audioUnlockFailures: 0,
    audioUnlocked: false,
    browserFallbacks: 0,
    spanishBrowserFallbacks: 0,
    speechFailures: 0,
    cancellations: 0,
    lastMode: null,
    lastLocale: null,
    lastText: null,
    lastFailure: null,
    lastCancellation: null
  };
  function publishPlaybackDiagnostics() {
    document.documentElement.dataset.syncvoiceAssetPlays = String(playbackDiagnostics.assetPlays);
    document.documentElement.dataset.syncvoiceAssetStarts = String(playbackDiagnostics.assetStarts);
    document.documentElement.dataset.syncvoiceAssetRejections = String(playbackDiagnostics.assetPlayRejections);
    document.documentElement.dataset.syncvoiceAudioUnlocks = String(playbackDiagnostics.audioUnlocks);
    document.documentElement.dataset.syncvoiceAudioUnlockFailures = String(playbackDiagnostics.audioUnlockFailures);
    document.documentElement.dataset.syncvoiceAudioUnlocked = String(playbackDiagnostics.audioUnlocked);
    document.documentElement.dataset.syncvoiceBrowserFallbacks = String(playbackDiagnostics.browserFallbacks);
    document.documentElement.dataset.syncvoiceSpanishFallbacks = String(playbackDiagnostics.spanishBrowserFallbacks);
    document.documentElement.dataset.syncvoiceSpeechFailures = String(playbackDiagnostics.speechFailures);
    document.documentElement.dataset.syncvoiceCancellations = String(playbackDiagnostics.cancellations);
    document.documentElement.dataset.syncvoiceLastMode = playbackDiagnostics.lastMode || "";
    document.documentElement.dataset.syncvoiceLastLocale = playbackDiagnostics.lastLocale || "";
    document.documentElement.dataset.syncvoiceLastText = playbackDiagnostics.lastText || "";
    document.documentElement.dataset.syncvoiceLastFailure = playbackDiagnostics.lastFailure || "";
    document.documentElement.dataset.syncvoiceLastCancellation = playbackDiagnostics.lastCancellation || "";
  }
  publishPlaybackDiagnostics();
  const narratedSignaturesThisTouch = new Set();

  document.documentElement.dataset.learningLocale = locale;
  document.documentElement.dataset.learningApp = appId;

  const style = document.createElement("style");
  style.textContent = `
    #learning-narration {
      position: fixed;
      z-index: 2147483644;
      left: 50%;
      top: 50%;
      width: min(88vw, 680px);
      max-height: 76vh;
      color: rgba(255, 255, 255, .98);
      font-family: Caveat, "Segoe Print", "Bradley Hand", cursive;
      font-size: clamp(20px, 5.5vw, 38px);
      font-weight: 700;
      line-height: 1.08;
      letter-spacing: .012em;
      text-align: center;
      text-wrap: balance;
      overflow: hidden;
      opacity: 0;
      transform: translate(-50%, -50%) scale(.96) rotate(-.35deg);
      transition: opacity 160ms ease, transform 220ms cubic-bezier(.16, 1, .3, 1);
      pointer-events: none;
      user-select: none;
      -webkit-user-select: none;
      filter: drop-shadow(0 3px 2px rgba(0, 0, 0, .92)) drop-shadow(0 0 13px rgba(0, 0, 0, .72));
    }
    #learning-narration.learning-narration--active {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1) rotate(-.35deg);
    }
    #learning-narration.learning-narration--leaving {
      opacity: 0;
      transform: translate(-50%, calc(-50% - 24px)) scale(1.035) rotate(.2deg);
      transition-duration: 520ms;
    }
    .learning-narration__language {
      margin-bottom: 8px;
      color: var(--learning-accent, #f59e0b);
      font: 800 clamp(10px, 2.7vw, 14px)/1 Inter, ui-rounded, system-ui, sans-serif;
      letter-spacing: .2em;
      text-shadow: 0 2px 4px rgba(0, 0, 0, .95);
    }
    .learning-narration__lines {
      display: grid;
      gap: .14em;
      overflow-wrap: anywhere;
    }
    .learning-narration__line {
      display: grid;
      min-width: 0;
    }
    .learning-narration__source,
    .learning-narration__measure,
    .learning-narration__ink {
      grid-area: 1 / 1;
      min-width: 0;
    }
    .learning-narration__source {
      color: rgba(255, 255, 255, 0);
      transition: color 180ms ease;
    }
    .learning-narration__measure {
      visibility: hidden;
    }
    .learning-narration__line--translating .learning-narration__source,
    .learning-narration__line--translated .learning-narration__source {
      color: rgba(255, 255, 255, .2);
      -webkit-text-stroke: 1px rgba(4, 6, 13, .42);
      paint-order: stroke fill;
    }
    .learning-narration__line--translated .learning-narration__source {
      color: rgba(255, 255, 255, .12);
    }
    .learning-narration__ink {
      position: relative;
      color: rgba(255, 255, 255, .98);
      -webkit-text-stroke: 1px rgba(4, 6, 13, .78);
      paint-order: stroke fill;
    }
    .learning-narration__line--speaking .learning-narration__ink::after {
      content: "";
      display: inline-block;
      width: .12em;
      height: .72em;
      margin-left: .08em;
      border-radius: 999px;
      background: var(--learning-accent, #f59e0b);
      vertical-align: -.04em;
      transform: rotate(8deg);
      opacity: .92;
    }
    #learning-narration-pointer {
      position: fixed;
      z-index: 2147483643;
      left: 50%;
      top: 50%;
      width: 38px;
      height: 38px;
      border: 2px dashed var(--learning-accent, #f59e0b);
      border-radius: 50%;
      opacity: 0;
      transform: translate(-50%, -50%) scale(.82);
      transition: opacity 180ms ease, transform 220ms ease;
      pointer-events: none;
      filter: saturate(.55) drop-shadow(0 2px 5px rgba(0, 0, 0, .75));
    }
    #learning-narration-pointer::after {
      content: "";
      position: absolute;
      inset: 13px;
      border-radius: 50%;
      background: var(--learning-accent, #f59e0b);
      opacity: .5;
    }
    #learning-narration-pointer.learning-narration-pointer--active {
      opacity: .62;
      transform: translate(-50%, -50%) scale(1);
    }
    #learning-narration-pointer.learning-narration-pointer--leaving {
      opacity: 0;
      transform: translate(-50%, -50%) scale(.72);
    }
    body.learning-narration-pointer-resting #touch-orb,
    body.learning-narration-pointer-resting .touch-ring {
      opacity: 0 !important;
    }
    #learning-narration[data-length="long"] { font-size: clamp(17px, 4.2vw, 28px); }
    #learning-narration[data-length="very-long"] { font-size: clamp(14px, 3.35vw, 22px); line-height: 1.13; }
    @media (prefers-reduced-motion: reduce) {
      #learning-narration,
      #learning-narration-pointer { transition-duration: .01ms; }
      #learning-narration { transform: translate(-50%, -50%); }
      #learning-narration.learning-narration--active { transform: translate(-50%, -50%); }
    }
  `;
  document.head.appendChild(style);

  const overlay = document.createElement("div");
  overlay.id = "learning-narration";
  overlay.setAttribute("aria-hidden", "true");
  overlay.innerHTML = `
    <div class="learning-narration__language"></div>
    <div class="learning-narration__lines"></div>`;
  document.body.appendChild(overlay);

  const restingPointer = document.createElement("div");
  restingPointer.id = "learning-narration-pointer";
  restingPointer.setAttribute("aria-hidden", "true");
  document.body.appendChild(restingPointer);

  assetAudio.preload = "auto";
  assetAudio.hidden = true;
  assetAudio.setAttribute("playsinline", "");
  assetAudio.setAttribute("aria-hidden", "true");
  document.body.appendChild(assetAudio);

  const languageElement = overlay.querySelector(".learning-narration__language");
  const linesElement = overlay.querySelector(".learning-narration__lines");

  const catalogReady = new Promise(resolve => {
    const catalogScript = document.createElement("script");
    const catalogUrl = new URL(`learning-translations/${locale}/${appId}.js`, baseUrl);
    catalogUrl.searchParams.set("v", SYNCVOICE_CATALOG_REVISION);
    catalogScript.src = catalogUrl.href;
    catalogScript.onload = () => {
      catalog = window.SpectrumLearningTranslations?.[appId]?.[locale] || Object.create(null);
      document.documentElement.dataset.learningTranslations = String(Object.keys(catalog).length);
      resolve(catalog);
    };
    catalogScript.onerror = () => {
      document.documentElement.dataset.learningTranslations = "0";
      resolve(catalog);
    };
    document.head.appendChild(catalogScript);
  });

  const assetCatalogReady = new Promise(resolve => {
    const assetCatalogScript = document.createElement("script");
    const assetCatalogUrl = new URL(`catalogs/${appId}.js`, syncvoiceBaseUrl);
    assetCatalogUrl.searchParams.set("v", SYNCVOICE_CATALOG_REVISION);
    assetCatalogScript.src = assetCatalogUrl.href;
    assetCatalogScript.onload = () => {
      assetCatalog = window.SpectrumSyncVoiceCatalogs?.[appId] || Object.create(null);
      document.documentElement.dataset.syncvoiceEntries = String(
        Object.values(assetCatalog).reduce((sum, localeCatalog) => sum + Object.keys(localeCatalog || {}).length, 0)
      );
      resolve(assetCatalog);
    };
    assetCatalogScript.onerror = () => {
      document.documentElement.dataset.syncvoiceEntries = "0";
      resolve(assetCatalog);
    };
    document.head.appendChild(assetCatalogScript);
  });

  function jitterRadius() {
    return Math.min(JITTER_MAX, Math.max(JITTER_MIN, Math.min(innerWidth, innerHeight) * .07));
  }

  function cancelHold() {
    clearTimeout(holdTimer);
    holdTimer = 0;
  }

  function errorName(error) {
    return String(error?.name || error?.code || "unknown").replace(/\s+/g, "-").toLowerCase();
  }

  function recordUnlockFailure(error) {
    playbackDiagnostics.audioUnlockFailures += 1;
    playbackDiagnostics.lastMode = "none";
    playbackDiagnostics.lastFailure = `audio-unlock-rejected:${errorName(error)}`;
    publishPlaybackDiagnostics();
  }

  function unlockAssetAudio() {
    if (assetAudioUnlocked) return Promise.resolve(true);
    if (assetUnlockPromise) return assetUnlockPromise;
    if (!assetUnlockUrl) {
      recordUnlockFailure({ name: "silent-audio-unavailable" });
      return Promise.resolve(false);
    }

    assetAudioMode = "unlock";
    assetAudio.src = assetUnlockUrl;
    try { assetAudio.currentTime = 0; } catch (_) {}
    let playback;
    try {
      playback = assetAudio.play();
    } catch (error) {
      assetAudioMode = "idle";
      recordUnlockFailure(error);
      return Promise.resolve(false);
    }

    assetUnlockPromise = Promise.resolve(playback).then(() => {
      assetAudioUnlocked = true;
      playbackDiagnostics.audioUnlocks += 1;
      playbackDiagnostics.audioUnlocked = true;
      playbackDiagnostics.lastFailure = null;
      publishPlaybackDiagnostics();
      return true;
    }, error => {
      assetAudioMode = "idle";
      assetAudio.removeAttribute("src");
      assetAudio.load();
      recordUnlockFailure(error);
      return false;
    }).finally(() => {
      assetUnlockPromise = null;
    });
    return assetUnlockPromise;
  }

  function stopAssetNarration() {
    const finish = activeAssetFinish;
    if (finish) finish(false);
    else {
      cancelAnimationFrame(activeAssetFrame);
      activeAssetFrame = 0;
    }
  }

  function stopNarration(hide = true, reason = null) {
    let speechActive = false;
    try { speechActive = Boolean(speechSynthesis.speaking || speechSynthesis.pending); } catch (_) {}
    const hadNarration = Boolean(
      holdTimer || activeAssetFinish || animationFrame || speechActive ||
      overlay.classList.contains("learning-narration--active")
    );
    runToken += 1;
    cancelHold();
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    clearTimeout(hideTimer);
    stopAssetNarration();
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    if (reason && hadNarration) {
      playbackDiagnostics.cancellations += 1;
      playbackDiagnostics.lastCancellation = reason;
      publishPlaybackDiagnostics();
    }
    if (hide) {
      overlay.classList.remove("learning-narration--active", "learning-narration--leaving");
      hideRestingPointer(true);
    }
  }

  function cleanParts(parts) {
    return (Array.isArray(parts) ? parts : [])
      .map(value => String(value || "").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .filter((value, index, values) => index === 0 || value !== values[index - 1]);
  }

  function cleanNarrationPairs(parts, narrationParts) {
    const displays = Array.isArray(parts) ? parts : [];
    const spoken = Array.isArray(narrationParts) ? narrationParts : [];
    const semanticNarration = new Map(
      ["feature-name", "metric", "fact"]
        .map(id => document.getElementById(id))
        .filter(Boolean)
        .map(element => [
          String(element.textContent || "").replace(/\s+/g, " ").trim(),
          String(element.dataset.learningNarration || "").replace(/\s+/g, " ").trim()
        ])
        .filter(([display, narration]) => display && narration)
    );
    const pairs = [];
    for (let index = 0; index < displays.length; index += 1) {
      const display = String(displays[index] || "").replace(/\s+/g, " ").trim();
      if (!display || pairs.at(-1)?.display === display) continue;
      const supplied = String(spoken[index] || "").replace(/\s+/g, " ").trim();
      const narration = supplied && supplied !== display
        ? supplied
        : semanticNarration.get(display) || supplied || display;
      pairs.push({ display, narration });
    }
    return { parts: pairs.map(pair => pair.display), narrationParts: pairs.map(pair => pair.narration) };
  }

  function joinForDisplay(parts) {
    return parts.join("\n");
  }

  function translateDynamicPart(source) {
    if (catalog[source]) return catalog[source];
    if (source.includes(" · ")) {
      return source.split(" · ").map(translateDynamicPart).join(" · ");
    }

    const rules = locale === "fi" ? [
      [/^(.+) km de altura$/i, "$1 km:n korkeudessa"],
      [/^(.+) km de profundidad$/i, "$1 km:n syvyydessä"],
      [/^(.+) km sobre el nivel del mar$/i, "$1 km merenpinnan yläpuolella"],
      [/^(.+) km bajo el nivel del mar$/i, "$1 km merenpinnan alapuolella"],
      [/^(.+) millones km$/i, "$1 miljoonaa km"],
      [/^(.+) h luz$/i, "$1 valotuntia"],
      [/^(.+) min luz$/i, "$1 valominuuttia"],
      [/^(.+) UA$/i, "$1 AU"],
      [/^octava (.+)$/i, "oktaavi $1"]
    ] : [
      [/^(.+) km de altura$/i, "$1 km high"],
      [/^(.+) km de profundidad$/i, "$1 km deep"],
      [/^(.+) km sobre el nivel del mar$/i, "$1 km above sea level"],
      [/^(.+) km bajo el nivel del mar$/i, "$1 km below sea level"],
      [/^(.+) millones km$/i, "$1 million km"],
      [/^(.+) h luz$/i, "$1 light-hours"],
      [/^(.+) min luz$/i, "$1 light-minutes"],
      [/^(.+) UA$/i, "$1 AU"],
      [/^octava (.+)$/i, "octave $1"]
    ];

    for (const [pattern, replacement] of rules) {
      if (pattern.test(source)) return source.replace(pattern, replacement);
    }
    return source;
  }

  function translatedParts(parts) {
    return parts.map(translateDynamicPart);
  }

  function chooseVoice(language) {
    const voices = speechSynthesis.getVoices();
    const normalized = language.toLowerCase();
    const base = normalized.split("-")[0];
    return voices.find(voice => voice.lang.toLowerCase() === normalized) ||
      voices.find(voice => voice.lang.toLowerCase().split(/[-_]/)[0] === base) || null;
  }

  function showRestingPointer(point, accent) {
    restingPointer.style.left = `${point.x}px`;
    restingPointer.style.top = `${point.y}px`;
    restingPointer.style.setProperty("--learning-accent", accent || "#f59e0b");
    restingPointer.classList.remove("learning-narration-pointer--leaving");
    restingPointer.classList.add("learning-narration-pointer--active");
    document.body.classList.add("learning-narration-pointer-resting");
  }

  function hideRestingPointer(immediate = false) {
    if (immediate) {
      restingPointer.classList.remove("learning-narration-pointer--active", "learning-narration-pointer--leaving");
      document.body.classList.remove("learning-narration-pointer-resting");
      return;
    }
    restingPointer.classList.remove("learning-narration-pointer--active");
    restingPointer.classList.add("learning-narration-pointer--leaving");
    document.body.classList.remove("learning-narration-pointer-resting");
  }

  function setOverlayLines(spanishParts, translated, accent, point) {
    overlay.classList.remove("learning-narration--leaving", "learning-narration--complete");
    overlay.classList.add("learning-narration--active");
    overlay.style.setProperty("--learning-accent", accent || "#f59e0b");
    languageElement.textContent = "ESPAÑOL";
    linesElement.replaceChildren(...spanishParts.map((spanish, index) => {
      const line = document.createElement("div");
      line.className = "learning-narration__line";

      const source = document.createElement("div");
      source.className = "learning-narration__source";
      source.textContent = spanish;

      const measure = document.createElement("div");
      measure.className = "learning-narration__measure";
      measure.textContent = translated[index] || spanish;

      const ink = document.createElement("div");
      ink.className = "learning-narration__ink";

      line.append(source, measure, ink);
      return line;
    }));

    const longestText = Math.max(joinForDisplay(spanishParts).length, joinForDisplay(translated).length);
    overlay.dataset.length = longestText > 520 ? "very-long" : longestText > 260 ? "long" : "short";

    requestAnimationFrame(() => {
      const bounds = overlay.getBoundingClientRect();
      const x = Math.max(bounds.width * .5 + 14, Math.min(innerWidth - bounds.width * .5 - 14, point.x));
      const preferredY = point.y > innerHeight * .52
        ? point.y - bounds.height * .5 - 70
        : point.y + bounds.height * .5 + 70;
      const y = Math.max(bounds.height * .5 + 18, Math.min(innerHeight - bounds.height * .5 - 18, preferredY));
      overlay.style.left = `${x}px`;
      overlay.style.top = `${y}px`;
    });
  }

  function narrationLine(index) {
    return linesElement.children[index] || null;
  }

  function revealLine(index, text, revealedCharacters) {
    const ink = narrationLine(index)?.querySelector(".learning-narration__ink");
    if (!ink) return;
    ink.textContent = text.slice(0, Math.max(0, Math.min(text.length, Math.round(revealedCharacters))));
  }

  function validatedTranscript(payload, externalId, text) {
    const durationMs = Number(payload?.durationMs);
    if (payload?.version !== 1 || payload.externalId !== externalId || payload.text !== text ||
        !Number.isFinite(durationMs) || durationMs <= 0 || !Array.isArray(payload.cues)) return null;
    const cues = payload.cues.map(cue => ({
      startMs: Number(cue.startMs),
      endMs: Number(cue.endMs),
      startChar: Number(cue.startChar),
      endChar: Number(cue.endChar)
    }));
    let previousStart = -1;
    let previousEndChar = 0;
    for (const cue of cues) {
      if (!Number.isFinite(cue.startMs) || cue.startMs < previousStart ||
          !Number.isFinite(cue.endMs) || cue.endMs < cue.startMs ||
          cue.endMs > durationMs ||
          !Number.isInteger(cue.startChar) || cue.startChar !== previousEndChar ||
          !Number.isInteger(cue.endChar) || cue.endChar <= cue.startChar || cue.endChar > text.length) return null;
      previousStart = cue.startMs;
      previousEndChar = cue.endChar;
    }
    return cues.length && previousEndChar === text.length ? cues : null;
  }

  function transcriptProgress(cues, elapsedMs) {
    let progress = 0;
    for (const cue of cues) {
      if (elapsedMs < cue.startMs) break;
      if (elapsedMs >= cue.endMs || cue.endMs === cue.startMs) {
        progress = cue.endChar;
        continue;
      }
      const ratio = (elapsedMs - cue.startMs) / (cue.endMs - cue.startMs);
      return cue.startChar + (cue.endChar - cue.startChar) * ratio;
    }
    return progress;
  }

  async function playAssetChunk(sourceKey, assetLocale, text, onProgress, token) {
    await assetCatalogReady;
    if (assetUnlockPromise) await assetUnlockPromise;
    if (token !== runToken) return false;
    lastAssetFailure = null;
    const externalId = assetCatalog[assetLocale]?.[sourceKey];
    if (!externalId) {
      lastAssetFailure = "missing-catalog-entry";
      return null;
    }
    for (const assetBaseUrl of assetBaseUrls(assetLocale)) {
      let cues;
      let durationMs;
      try {
        const transcriptUrl = new URL(`transcripts/${externalId}.json`, assetBaseUrl);
        transcriptUrl.searchParams.set("v", SYNCVOICE_CATALOG_REVISION);
        const response = await fetch(transcriptUrl.href, { cache: "force-cache" });
        if (!response.ok) {
          lastAssetFailure = `transcript-http-${response.status}`;
          continue;
        }
        const transcript = await response.json();
        cues = validatedTranscript(transcript, externalId, text);
        if (!cues) {
          lastAssetFailure = "invalid-transcript";
          continue;
        }
        durationMs = Number(transcript.durationMs);
      } catch (_) {
        lastAssetFailure = "transcript-unavailable";
        continue;
      }
      if (token !== runToken) return false;

      const result = await new Promise(resolve => {
        const audioUrl = new URL(`audio/${externalId}.mp3`, assetBaseUrl);
        audioUrl.searchParams.set("v", `${SYNCVOICE_CATALOG_REVISION}-${durationMs}`);
        const audio = assetAudio;
        let settled = false;
        let started = false;
        const markStarted = () => {
          if (started || settled) return;
          started = true;
          assetAudioUnlocked = true;
          playbackDiagnostics.audioUnlocked = true;
          playbackDiagnostics.assetStarts += 1;
          playbackDiagnostics.lastMode = "asset";
          playbackDiagnostics.lastLocale = assetLocale;
          playbackDiagnostics.lastText = text;
          playbackDiagnostics.lastFailure = null;
          publishPlaybackDiagnostics();
        };
        const finish = result => {
          if (settled) return;
          settled = true;
          cancelAnimationFrame(activeAssetFrame);
          activeAssetFrame = 0;
          audio.onplaying = null;
          audio.onended = null;
          audio.onerror = null;
          if (assetAudioMode === "narration") {
            audio.pause();
            if (result !== true) {
              audio.removeAttribute("src");
              audio.load();
            }
            assetAudioMode = "idle";
          }
          if (activeAssetFinish === cancel) activeAssetFinish = null;
          if (result === true) {
            onProgress(text.length);
            playbackDiagnostics.assetPlays += 1;
            playbackDiagnostics.lastMode = "asset";
            playbackDiagnostics.lastLocale = assetLocale;
            playbackDiagnostics.lastText = text;
            playbackDiagnostics.lastFailure = null;
            publishPlaybackDiagnostics();
          }
          resolve(result);
        };
        const cancel = result => finish(result === false ? false : null);
        const animate = () => {
          if (token !== runToken || settled) return finish(false);
          onProgress(transcriptProgress(cues, audio.currentTime * 1000));
          activeAssetFrame = requestAnimationFrame(animate);
        };

        audio.pause();
        audio.onplaying = null;
        audio.onended = null;
        audio.onerror = null;
        assetAudioMode = "narration";
        activeAssetFinish = cancel;
        audio.preload = "auto";
        audio.src = audioUrl.href;
        try { audio.currentTime = 0; } catch (_) {}
        audio.onplaying = markStarted;
        audio.onended = () => finish(true);
        audio.onerror = () => {
          lastAssetFailure = `audio-load-error:${audio.error?.code || "unknown"}`;
          playbackDiagnostics.lastMode = "none";
          playbackDiagnostics.lastLocale = assetLocale;
          playbackDiagnostics.lastText = text;
          playbackDiagnostics.lastFailure = lastAssetFailure;
          publishPlaybackDiagnostics();
          finish(null);
        };
        onProgress(0);
        let playback;
        try {
          playback = audio.play();
        } catch (error) {
          lastAssetFailure = `audio-play-rejected:${errorName(error)}`;
          playbackDiagnostics.assetPlayRejections += 1;
          playbackDiagnostics.lastMode = "none";
          playbackDiagnostics.lastLocale = assetLocale;
          playbackDiagnostics.lastText = text;
          playbackDiagnostics.lastFailure = lastAssetFailure;
          publishPlaybackDiagnostics();
          finish(null);
          return;
        }
        if (playback && typeof playback.then === "function") {
          playback.then(() => {
            markStarted();
            if (!settled) activeAssetFrame = requestAnimationFrame(animate);
          }, error => {
            lastAssetFailure = `audio-play-rejected:${errorName(error)}`;
            playbackDiagnostics.assetPlayRejections += 1;
            playbackDiagnostics.lastMode = "none";
            playbackDiagnostics.lastLocale = assetLocale;
            playbackDiagnostics.lastText = text;
            playbackDiagnostics.lastFailure = lastAssetFailure;
            publishPlaybackDiagnostics();
            finish(null);
          });
        } else {
          markStarted();
          activeAssetFrame = requestAnimationFrame(animate);
        }
      });
      if (result !== null) return result;
    }
    return null;
  }

  async function speakChunk(text, language, onProgress, token, sourceKey, assetLocale, assetText = text) {
    const assetResult = await playAssetChunk(sourceKey, assetLocale, assetText, onProgress, token);
    if (assetResult !== null) return assetResult;
    playbackDiagnostics.browserFallbacks += 1;
    if (assetLocale === "es-ES") {
      playbackDiagnostics.spanishBrowserFallbacks += 1;
    }
    playbackDiagnostics.lastMode = "browser";
    playbackDiagnostics.lastLocale = assetLocale;
    playbackDiagnostics.lastText = assetText;
    playbackDiagnostics.lastFailure = lastAssetFailure || "unknown";
    publishPlaybackDiagnostics();
    console.warn(
      `[SyncVoice] Browser fallback for ${assetLocale} ${JSON.stringify(sourceKey)} ` +
      `(${playbackDiagnostics.lastFailure}).`
    );

    return new Promise(resolve => {
      if (token !== runToken || !text) return resolve(false);
      if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
        playbackDiagnostics.speechFailures += 1;
        playbackDiagnostics.lastMode = "none";
        playbackDiagnostics.lastFailure = `speech-unavailable-after:${lastAssetFailure || "asset-failure"}`;
        publishPlaybackDiagnostics();
        return resolve(false);
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = language;
      utterance.rate = .84;
      utterance.pitch = 1;
      const voice = chooseVoice(language);
      if (voice) utterance.voice = voice;

      let syncAt = 0;
      let syncIndex = 0;
      let charsPerSecond = language.startsWith("fi") ? 11 : 13;
      let lastBoundaryTime = 0;
      let lastBoundaryIndex = 0;

      const animate = now => {
        if (token !== runToken) return;
        if (!syncAt) syncAt = now;
        const projected = syncIndex + ((now - syncAt) / 1000) * charsPerSecond * utterance.rate;
        onProgress(Math.min(text.length, projected));
        animationFrame = requestAnimationFrame(animate);
      };

      utterance.onstart = () => {
        const now = performance.now();
        syncAt = now;
        animationFrame = requestAnimationFrame(animate);
      };
      utterance.onboundary = event => {
        if (token !== runToken || !Number.isFinite(event.charIndex)) return;
        const elapsed = Number(event.elapsedTime) || 0;
        if (elapsed > lastBoundaryTime && event.charIndex > lastBoundaryIndex) {
          const observed = (event.charIndex - lastBoundaryIndex) / (elapsed - lastBoundaryTime);
          charsPerSecond = Math.max(6, Math.min(30, observed));
        }
        lastBoundaryTime = elapsed;
        lastBoundaryIndex = event.charIndex;
        syncIndex = Math.max(syncIndex, event.charIndex);
        syncAt = performance.now();
        onProgress(syncIndex);
      };
      const finish = success => {
        cancelAnimationFrame(animationFrame);
        animationFrame = 0;
        if (success) onProgress(text.length);
        resolve(success && token === runToken);
      };
      utterance.onend = () => finish(true);
      utterance.onerror = event => {
        playbackDiagnostics.speechFailures += 1;
        playbackDiagnostics.lastMode = "none";
        playbackDiagnostics.lastFailure = `speech-error:${event.error || "unknown"}`;
        publishPlaybackDiagnostics();
        finish(false);
      };

      try {
        speechSynthesis.speak(utterance);
      } catch (error) {
        playbackDiagnostics.speechFailures += 1;
        playbackDiagnostics.lastMode = "none";
        playbackDiagnostics.lastFailure = `speech-exception:${errorName(error)}`;
        publishPlaybackDiagnostics();
        finish(false);
      }
    });
  }

  async function speakPhase(displayParts, spokenParts, sourceKeys, phase, label, language, assetLocale, token) {
    if (token !== runToken) return false;
    languageElement.textContent = phase === "spanish" ? "ESPAÑOL" : `ESPAÑOL → ${label}`;
    overlay.classList.remove("learning-narration--complete");

    for (let index = 0; index < spokenParts.length; index += 1) {
      if (token !== runToken) return false;
      const part = spokenParts[index];
      const displayPart = displayParts[index] || part;
      const line = narrationLine(index);
      if (!line) continue;
      if (phase === "translation") line.classList.add("learning-narration__line--translating");
      line.querySelector(".learning-narration__ink").textContent = "";
      line.classList.add("learning-narration__line--speaking");
      const spokenPart = /[.!?…:]$/.test(part) ? part : `${part}.`;
      const mapProgress = progress => revealLine(index, displayPart, displayPart.length * progress / Math.max(1, part.length));
      const ok = await speakChunk(
        spokenPart,
        language,
        mapProgress,
        token,
        sourceKeys[index] || part,
        assetLocale,
        part
      );
      if (!ok) return false;
      revealLine(index, displayPart, displayPart.length);
      line.classList.remove("learning-narration__line--speaking");
      if (phase === "translation") {
        line.classList.remove("learning-narration__line--translating");
        line.classList.add("learning-narration__line--translated");
      } else {
        line.classList.add("learning-narration__line--spanish-complete");
      }
    }
    overlay.classList.add("learning-narration--complete");
    return true;
  }

  async function narrate(capturedTarget) {
    if (!capturedTarget || capturedTarget !== target) return;
    const parts = capturedTarget.parts;
    const narrationParts = capturedTarget.narrationParts;
    if (!parts.length) return;

    narratedSignaturesThisTouch.add(capturedTarget.signature);
    stopNarration(false);
    const token = runToken;
    showRestingPointer(capturedTarget, capturedTarget.color);

    await catalogReady;
    if (token !== runToken) return;
    const translated = translatedParts(narrationParts);
    setOverlayLines(parts, translated, capturedTarget.color, capturedTarget);

    const spanishDone = await speakPhase(
      parts,
      narrationParts,
      narrationParts,
      "spanish",
      "ESPAÑOL",
      "es-ES",
      "es-ES",
      token
    );
    if (!spanishDone || token !== runToken) {
      if (token === runToken) stopNarration(true, "spanish-playback-failed");
      return;
    }

    const translationDone = await speakPhase(
      translated,
      translated,
      narrationParts,
      "translation",
      languageLabel,
      speechLocale,
      speechLocale,
      token
    );
    if (!translationDone || token !== runToken) {
      if (token === runToken) stopNarration(true, "translation-playback-failed");
      return;
    }

    hideRestingPointer();
    hideTimer = window.setTimeout(() => {
      if (token !== runToken) return;
      overlay.classList.add("learning-narration--leaving");
      hideTimer = window.setTimeout(() => overlay.classList.remove("learning-narration--active", "learning-narration--leaving"), 560);
    }, 1500);
  }

  function scheduleNarration() {
    cancelHold();
    if (!target) return;
    if (activePointer === null) showRestingPointer(target, target.color);
    const capturedTarget = target;
    holdTimer = window.setTimeout(() => {
      holdTimer = 0;
      narrate(capturedTarget);
    }, HOLD_DELAY_MS);
  }

  function publishSemanticReadout(point) {
    const readout = document.getElementById("readout");
    if (!readout?.classList.contains("visible")) return;
    const elements = ["feature-name", "metric", "fact"].map(id => document.getElementById(id));
    const parts = elements.map(element => element?.textContent);
    const narrationParts = elements.map(element => element?.dataset.learningNarration || element?.textContent);
    window.dispatchEvent(new CustomEvent("spectrum:learning-target", {
      detail: {
        parts,
        narrationParts,
        x: point?.x,
        y: point?.y,
        color: getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#f59e0b"
      }
    }));
  }

  function queueSemanticReadout(x, y) {
    semanticPoint = { x, y };
    if (semanticPublishQueued) return;
    semanticPublishQueued = true;
    queueMicrotask(() => {
      semanticPublishQueued = false;
      const point = semanticPoint;
      semanticPoint = null;
      publishSemanticReadout(point);
    });
  }

  window.addEventListener("spectrum:learning-target", event => {
    const detail = event.detail || {};
    const cleaned = cleanNarrationPairs(detail.parts || [detail.text], detail.narrationParts);
    const parts = cleaned.parts;
    if (!parts.length) return;
    const narrationParts = cleaned.narrationParts;
    const signature = `${parts.join("\u0000")}\u0001${narrationParts.join("\u0000")}`;
    const nextTarget = {
      parts,
      narrationParts,
      signature,
      x: Number.isFinite(detail.x) ? detail.x : innerWidth * .5,
      y: Number.isFinite(detail.y) ? detail.y : innerHeight * .5,
      color: detail.color || getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#f59e0b"
    };
    if (target?.signature === signature) {
      target.x = nextTarget.x;
      target.y = nextTarget.y;
      target.color = nextTarget.color;
      if (holdTimer || narratedSignaturesThisTouch.has(signature)) return;
    } else {
      target = nextTarget;
    }
    if (narratedSignaturesThisTouch.has(signature)) return;
    if (interactionUnlocked) scheduleNarration();
  });

  document.addEventListener("pointerdown", event => {
    stopNarration(true, "pointerdown");
    interactionUnlocked = true;
    unlockAssetAudio();
    narratedSignaturesThisTouch.clear();
    activePointer = event.pointerId;
    anchor = { x: event.clientX, y: event.clientY };
    target = null;
    queueSemanticReadout(event.clientX, event.clientY);
    try { speechSynthesis.resume(); } catch (_) {}
  }, true);

  document.addEventListener("keydown", event => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", " "].includes(event.key)) {
      interactionUnlocked = true;
      unlockAssetAudio();
      if (activePointer === null) narratedSignaturesThisTouch.clear();
      queueSemanticReadout(innerWidth * .5, innerHeight * .5);
    }
  }, true);

  document.addEventListener("pointermove", event => {
    if (event.pointerId !== activePointer || !anchor) return;
    queueSemanticReadout(event.clientX, event.clientY);
    const dx = event.clientX - anchor.x;
    const dy = event.clientY - anchor.y;
    const radius = jitterRadius();
    if (dx * dx + dy * dy <= radius * radius) return;
    anchor = { x: event.clientX, y: event.clientY };
    target = null;
    stopNarration(true, "pointer-move");
  }, true);

  function finishPointer(event) {
    if (event.pointerId !== activePointer) return;
    activePointer = null;
    anchor = null;
    cancelHold();
  }

  document.addEventListener("pointerup", finishPointer, true);
  document.addEventListener("pointercancel", event => {
    finishPointer(event);
    stopNarration(true, "pointer-cancel");
  }, true);
  window.addEventListener("spectrum:cancel-tts", () => stopNarration(true, "feed-navigation"));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopNarration(true, "document-hidden");
  });
  addEventListener("pagehide", () => stopNarration(true, "pagehide"));

  window.SpectrumLearningNarration = Object.freeze({
    locale,
    appId,
    speakCurrent() {
      if (target) narrate(target);
    },
    diagnostics() {
      return { ...playbackDiagnostics };
    }
  });
})();
