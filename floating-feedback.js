(() => {
  "use strict";

  const readout = document.getElementById("readout");
  if (!readout) return;

  const style = document.createElement("style");
  style.textContent = `
    #floating-feedback {
      position: fixed;
      inset: 0;
      z-index: 12;
      width: 100%;
      height: 100%;
      display: block;
      pointer-events: none;
    }

    #readout,
    #readout.visible {
      position: fixed !important;
      width: 1px !important;
      height: 1px !important;
      min-width: 0 !important;
      max-width: none !important;
      padding: 0 !important;
      margin: -1px !important;
      overflow: hidden !important;
      clip: rect(0, 0, 0, 0) !important;
      clip-path: inset(50%) !important;
      border: 0 !important;
      opacity: 0 !important;
      transform: none !important;
      filter: none !important;
      box-shadow: none !important;
      backdrop-filter: none !important;
      pointer-events: none !important;
      white-space: nowrap !important;
    }
  `;
  document.head.appendChild(style);

  const canvas = document.createElement("canvas");
  canvas.id = "floating-feedback";
  canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  const floatingTexts = [];
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const point = { x: window.innerWidth * 0.5, y: window.innerHeight * 0.5 };

  let dpr = 1;
  let width = 1;
  let height = 1;
  let animationFrame = 0;
  let lastFrameTime = performance.now();
  let lastSignature = "";
  let feedbackVisible = false;
  let settleTimer = 0;
  let settleAnchor = null;
  let settleSignature = "";
  let activePointer = null;
  const shownSignaturesThisTouch = new Set();

  function resizeFeedbackCanvas() {
    width = window.innerWidth;
    height = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function textFrom(id) {
    return document.getElementById(id)?.textContent?.trim() || "";
  }

  function currentTouchPoint() {
    const orb = document.getElementById("touch-orb");
    const x = Number.parseFloat(orb?.style.left);
    const y = Number.parseFloat(orb?.style.top);
    return {
      x: Number.isFinite(x) ? x : point.x,
      y: Number.isFinite(y) ? y : point.y
    };
  }

  function accentColor() {
    return getComputedStyle(document.documentElement)
      .getPropertyValue("--accent")
      .trim() || "#f59e0b";
  }

  function showFloatingText({ title, feature, metric, fact, x, y, color }) {
    const life = reducedMotion.matches ? 1.15 : 1.85;
    const maxWidth = Math.min(420, Math.max(200, (width - 48) / 1.12));
    const estimatedHeight = fact ? 150 : 112;
    const startsBelowTouch = y < height * 0.34;
    const startY = startsBelowTouch ? y + 78 : y - estimatedHeight;

    floatingTexts.push({
      title,
      feature,
      metric,
      fact,
      x: Math.max(maxWidth * 0.5 + 12, Math.min(width - maxWidth * 0.5 - 12, x)),
      y: Math.max(48, Math.min(height - estimatedHeight - 20, startY)),
      color,
      maxWidth,
      life,
      maxLife: life,
      angle: (Math.random() - 0.5) * 0.045
    });

    if (!animationFrame) {
      lastFrameTime = performance.now();
      animationFrame = requestAnimationFrame(animateFloatingTexts);
    }
  }

  function clearFloatingTexts() {
    floatingTexts.length = 0;
    feedbackVisible = false;
    ctx.clearRect(0, 0, width, height);
  }

  function readoutSignature() {
    return `${textFrom("zone-name")}\u0000${textFrom("feature-name")}`;
  }

  function showReadoutFeedback(force = false, touchOverride = null, dedupeTouch = false) {
    const evidence = textFrom("evidence-class");
    const title = textFrom("zone-name");
    const feature = textFrom("feature-name");
    const metric = textFrom("metric");
    const fact = textFrom("fact");
    if (!title && !feature) return;

    const signature = `${title}\u0000${feature}`;
    if (dedupeTouch && shownSignaturesThisTouch.has(signature)) return;
    if (!force && signature === lastSignature && feedbackVisible) return;

    const touch = touchOverride || currentTouchPoint();
    const descriptor = {
      title: title || feature,
      feature: title ? feature : "",
      color: accentColor()
    };
    clearFloatingTexts();
    showFloatingText({
      ...descriptor,
      metric,
      fact,
      x: touch.x,
      y: touch.y
    });
    window.dispatchEvent(new CustomEvent("spectrum:learning-target", {
      detail: {
        parts: [evidence, descriptor.title, descriptor.feature, metric, fact],
        x: touch.x,
        y: touch.y,
        color: descriptor.color
      }
    }));
    lastSignature = signature;
    if (dedupeTouch) shownSignaturesThisTouch.add(signature);
    feedbackVisible = true;
  }

  function feedbackJitterRadius() {
    return Math.min(42, Math.max(28, Math.min(width, height) * .07));
  }

  function movedBeyondFeedbackJitter(x, y) {
    if (!settleAnchor) {
      settleAnchor = { x, y };
      return true;
    }
    const deltaX = x - settleAnchor.x;
    const deltaY = y - settleAnchor.y;
    const radius = feedbackJitterRadius();
    if (deltaX * deltaX + deltaY * deltaY <= radius * radius) return false;
    settleAnchor.x = x;
    settleAnchor.y = y;
    return true;
  }

  function scheduleSettledFeedback(reset = false) {
    const signature = readoutSignature();
    const targetChanged = signature !== settleSignature;
    if (targetChanged) settleSignature = signature;
    if (shownSignaturesThisTouch.has(signature)) {
      clearTimeout(settleTimer);
      settleTimer = 0;
      return;
    }
    if (!reset && !targetChanged && (settleTimer || feedbackVisible)) return;
    clearTimeout(settleTimer);
    settleTimer = window.setTimeout(() => {
      settleTimer = 0;
      if (readoutSignature() !== settleSignature) {
        scheduleSettledFeedback(true);
        return;
      }
      showReadoutFeedback(false, null, true);
    }, 400);
  }

  function updateFloatingTexts(dt) {
    floatingTexts.forEach(text => {
      text.life -= dt;
      if (!reducedMotion.matches) text.y -= 40 * dt;
    });
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
      if (floatingTexts[i].life <= 0) floatingTexts.splice(i, 1);
    }
  }

  function fitFont(text, preferredSize, minSize, maxWidth, fontFamily) {
    let size = preferredSize;
    while (size > minSize) {
      ctx.font = `bold ${size}px ${fontFamily}`;
      if (ctx.measureText(text).width <= maxWidth) break;
      size -= 2;
    }
    return size;
  }

  function wrappedLines(text, maxWidth, maxLines = 2) {
    if (!text) return [];
    const words = text.split(/\s+/);
    const lines = [];
    let line = "";

    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = word;
        if (lines.length === maxLines) break;
      } else {
        line = candidate;
      }
    }

    if (lines.length < maxLines && line) lines.push(line);
    if (lines.length === maxLines && words.join(" ") !== lines.join(" ")) {
      let last = lines[maxLines - 1];
      while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) {
        last = last.slice(0, -1);
      }
      lines[maxLines - 1] = `${last.trim()}…`;
    }
    return lines;
  }

  function drawFloatingTexts() {
    ctx.clearRect(0, 0, width, height);

    floatingTexts.forEach(text => {
      const progress = 1 - text.life / text.maxLife;
      const alpha = Math.max(0, Math.min(1, text.life / (text.maxLife * 0.58)));
      const scale = reducedMotion.matches ? 1 : 1 + progress * 0.12;
      const handFont = 'Caveat, "Segoe Print", "Bradley Hand", cursive';

      ctx.save();
      ctx.translate(text.x, text.y);
      ctx.rotate(text.angle * (1 - progress * 0.35));
      ctx.scale(scale, scale);
      ctx.globalAlpha = alpha;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      ctx.shadowColor = text.color;
      ctx.shadowBlur = 20;

      const preferredTitleSize = Math.min(56, Math.max(32, width * 0.052));
      const titleSize = fitFont(text.title.toUpperCase(), preferredTitleSize, 22, text.maxWidth, handFont);
      ctx.font = `bold ${titleSize}px ${handFont}`;
      ctx.lineWidth = Math.max(4, titleSize * 0.105);
      ctx.strokeStyle = "rgba(5,7,14,.84)";
      ctx.strokeText(text.title.toUpperCase(), 0, 0);
      ctx.fillStyle = text.color;
      ctx.fillText(text.title.toUpperCase(), 0, 0);

      let lineY = titleSize * 0.72;
      if (text.feature) {
        const featureSize = fitFont(text.feature.toUpperCase(), Math.max(16, titleSize * 0.43), 13, text.maxWidth, handFont);
        ctx.font = `bold ${featureSize}px ${handFont}`;
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(5,7,14,.88)";
        ctx.strokeText(text.feature.toUpperCase(), 0, lineY);
        ctx.fillStyle = "rgba(255,255,255,.94)";
        ctx.fillText(text.feature.toUpperCase(), 0, lineY);
        lineY += featureSize * 1.22;
      }

      if (text.metric) {
        const metricSize = Math.max(12, Math.min(15, width * 0.018));
        ctx.font = `750 ${metricSize}px Inter, ui-rounded, system-ui, sans-serif`;
        ctx.shadowBlur = 9;
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = "rgba(5,7,14,.9)";
        ctx.strokeText(text.metric, 0, lineY);
        ctx.fillStyle = text.color;
        ctx.fillText(text.metric, 0, lineY);
        lineY += metricSize * 1.45;
      }

      if (text.fact) {
        const factSize = Math.max(11, Math.min(14, width * 0.016));
        ctx.font = `600 ${factSize}px Inter, ui-rounded, system-ui, sans-serif`;
        ctx.shadowBlur = 7;
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = "rgba(5,7,14,.92)";
        ctx.fillStyle = "rgba(255,255,255,.82)";
        for (const line of wrappedLines(text.fact, text.maxWidth, 2)) {
          ctx.strokeText(line, 0, lineY);
          ctx.fillText(line, 0, lineY);
          lineY += factSize * 1.28;
        }
      }

      ctx.restore();
    });
  }

  function animateFloatingTexts(now) {
    const dt = Math.min(0.033, (now - lastFrameTime) / 1000);
    lastFrameTime = now;
    updateFloatingTexts(dt);
    drawFloatingTexts();

    if (floatingTexts.length) {
      animationFrame = requestAnimationFrame(animateFloatingTexts);
    } else {
      animationFrame = 0;
      feedbackVisible = false;
    }
  }

  document.addEventListener("pointerdown", event => {
    activePointer = event.pointerId;
    shownSignaturesThisTouch.clear();
    point.x = event.clientX;
    point.y = event.clientY;
    settleAnchor = { x: point.x, y: point.y };
    settleSignature = "";
    clearFloatingTexts();
    scheduleSettledFeedback(true);
  }, true);

  document.addEventListener("pointermove", event => {
    if (event.pointerId !== activePointer) return;
    point.x = event.clientX;
    point.y = event.clientY;
    if (movedBeyondFeedbackJitter(point.x, point.y)) {
      clearFloatingTexts();
      scheduleSettledFeedback(true);
    } else {
      scheduleSettledFeedback(false);
    }
  }, true);

  function finishPointer(event) {
    if (event.pointerId !== activePointer) return;
    activePointer = null;
    settleAnchor = null;
    point.x = event.clientX;
    point.y = event.clientY;
    clearTimeout(settleTimer);
    settleTimer = 0;
    const releasePoint = { x: point.x, y: point.y };
    window.setTimeout(() => {
      showReadoutFeedback(false, releasePoint, true);
      shownSignaturesThisTouch.clear();
    }, 0);
  }

  document.addEventListener("pointerup", finishPointer, true);
  document.addEventListener("pointercancel", finishPointer, true);

  const observer = new MutationObserver(() => {
    if (activePointer === null) showReadoutFeedback(false, null, shownSignaturesThisTouch.size > 0);
    else scheduleSettledFeedback(false);
  });
  observer.observe(readout, { childList: true, characterData: true, subtree: true });

  window.addEventListener("resize", () => {
    clearTimeout(settleTimer);
    settleTimer = 0;
    settleAnchor = null;
    settleSignature = "";
    shownSignaturesThisTouch.clear();
    clearFloatingTexts();
    resizeFeedbackCanvas();
  }, { passive: true });

  resizeFeedbackCanvas();
})();
