(() => {
  "use strict";

  const script = document.currentScript;
  const filename = decodeURIComponent(location.pathname.split("/").pop() || "");
  const appMatch = filename.match(/^(\d{2})_/);
  if (!script?.src || !appMatch) return;

  const appId = appMatch[1];
  const baseUrl = new URL(".", script.src);
  const supportedLocales = new Set(["en", "fi"]);
  const browserLanguages = [...(navigator.languages || []), navigator.language || ""];
  const locale = browserLanguages
    .map(language => language.toLowerCase().split("-")[0])
    .find(language => supportedLocales.has(language)) || "en";
  const speechLocale = locale === "fi"
    ? "fi-FI"
    : browserLanguages.find(language => /^en(?:-|$)/i.test(language)) || "en-US";
  const languageLabel = locale === "fi" ? "SUOMI" : "ENGLISH";
  const HOLD_DELAY_MS = 900;
  const JITTER_MIN = 28;
  const JITTER_MAX = 42;

  let activePointer = null;
  let interactionUnlocked = false;
  let anchor = null;
  let target = null;
  let holdTimer = 0;
  let runToken = 0;
  let animationFrame = 0;
  let hideTimer = 0;
  let catalog = Object.create(null);
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

  const languageElement = overlay.querySelector(".learning-narration__language");
  const linesElement = overlay.querySelector(".learning-narration__lines");

  const catalogReady = new Promise(resolve => {
    const catalogScript = document.createElement("script");
    catalogScript.src = new URL(`learning-translations/${locale}/${appId}.js`, baseUrl).href;
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

  function jitterRadius() {
    return Math.min(JITTER_MAX, Math.max(JITTER_MIN, Math.min(innerWidth, innerHeight) * .07));
  }

  function cancelHold() {
    clearTimeout(holdTimer);
    holdTimer = 0;
  }

  function stopNarration(hide = true) {
    runToken += 1;
    cancelHold();
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    clearTimeout(hideTimer);
    if ("speechSynthesis" in window) speechSynthesis.cancel();
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

  function speakChunk(text, language, onProgress, token) {
    return new Promise(resolve => {
      if (token !== runToken || !text) return resolve(false);
      if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
        onProgress(text.length);
        return window.setTimeout(() => resolve(token === runToken), 500);
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
      utterance.onerror = event => finish(event.error === "interrupted" ? false : true);

      try {
        speechSynthesis.speak(utterance);
      } catch (_) {
        finish(true);
      }
    });
  }

  async function speakPhase(parts, phase, label, language, token) {
    if (token !== runToken) return false;
    languageElement.textContent = phase === "spanish" ? "ESPAÑOL" : `ESPAÑOL → ${label}`;
    overlay.classList.remove("learning-narration--complete");

    for (let index = 0; index < parts.length; index += 1) {
      if (token !== runToken) return false;
      const part = parts[index];
      const line = narrationLine(index);
      if (!line) continue;
      if (phase === "translation") line.classList.add("learning-narration__line--translating");
      line.querySelector(".learning-narration__ink").textContent = "";
      line.classList.add("learning-narration__line--speaking");
      const spokenPart = /[.!?…:]$/.test(part) ? part : `${part}.`;
      const ok = await speakChunk(spokenPart, language, progress => revealLine(index, part, progress), token);
      if (!ok) return false;
      revealLine(index, part, part.length);
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
    const parts = cleanParts(capturedTarget.parts);
    if (!parts.length) return;

    narratedSignaturesThisTouch.add(capturedTarget.signature);
    stopNarration(false);
    const token = runToken;
    showRestingPointer(capturedTarget, capturedTarget.color);

    await catalogReady;
    if (token !== runToken) return;
    const translated = translatedParts(parts);
    setOverlayLines(parts, translated, capturedTarget.color, capturedTarget);

    const spanishDone = await speakPhase(parts, "spanish", "ESPAÑOL", "es-ES", token);
    if (!spanishDone || token !== runToken) {
      if (token === runToken) stopNarration();
      return;
    }

    const translationDone = await speakPhase(translated, "translation", languageLabel, speechLocale, token);
    if (!translationDone || token !== runToken) {
      if (token === runToken) stopNarration();
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

  window.addEventListener("spectrum:learning-target", event => {
    const detail = event.detail || {};
    const parts = cleanParts(detail.parts || [detail.text]);
    if (!parts.length) return;
    const signature = parts.join("\u0000");
    const nextTarget = {
      parts,
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
    stopNarration();
    interactionUnlocked = true;
    narratedSignaturesThisTouch.clear();
    activePointer = event.pointerId;
    anchor = { x: event.clientX, y: event.clientY };
    target = null;
    try { speechSynthesis.resume(); } catch (_) {}
  }, true);

  document.addEventListener("keydown", event => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", " "].includes(event.key)) {
      interactionUnlocked = true;
      if (activePointer === null) narratedSignaturesThisTouch.clear();
    }
  }, true);

  document.addEventListener("pointermove", event => {
    if (event.pointerId !== activePointer || !anchor) return;
    const dx = event.clientX - anchor.x;
    const dy = event.clientY - anchor.y;
    const radius = jitterRadius();
    if (dx * dx + dy * dy <= radius * radius) return;
    anchor = { x: event.clientX, y: event.clientY };
    target = null;
    stopNarration();
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
    stopNarration();
  }, true);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopNarration();
  });
  addEventListener("pagehide", () => stopNarration());

  window.SpectrumLearningNarration = Object.freeze({
    locale,
    appId,
    speakCurrent() {
      if (target) narrate(target);
    }
  });
})();
