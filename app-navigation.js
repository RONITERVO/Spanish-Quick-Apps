(() => {
  "use strict";

  const APP_FILES = [
    "01_espectro_colores_espanol.html",
    "02_espectro_musical_tactil.html",
    "03_espectro_tierra_profunda.html",
    "04_espectro_sistema_solar_es_global.html",
    "05_espectro_via_lactea_es_global.html",
    "06_espectro_grupo_local_es_global.html",
    "07_espectro_laniakea_es_global.html",
    "08_espectro_red_cosmica_es_global.html",
    "09_espectro_universo_observable_es_global.html",
    "10_espectro_universo_temprano_es_global.html",
    "11_espectro_evidencia_cosmica_es_global.html",
    "12_espectro_futuro_universo_es_global.html",
    "13_espectro_materia_energia_es_global.html",
    "14_espectro_espacio_tiempo_es_global.html",
    "15_espectro_complejidad_es_global.html",
    "16_espectro_vida_es_global.html",
    "17_espectro_mente_es_global.html",
    "18_espectro_cultura_es_global.html",
    "19_espectro_tecnologia_es_global.html",
    "20_espectro_futuros_es_global.html",
    "21_espectro_vida_cosmica_es_global.html",
    "22_espectro_contacto_cosmico_es_global.html",
    "23_espectro_perspectivas_cosmicas_es_global.html",
    "24_espectro_significado_cosmico_es_global.html",
    "25_espectro_horizonte_final_es_global.html"
  ];

  const filename = decodeURIComponent(location.pathname.split("/").pop() || "");
  const currentIndex = APP_FILES.indexOf(filename);
  if (currentIndex < 0) return;

  const embedded = window.parent !== window;
  const targetOrigin = location.origin === "null" ? "*" : location.origin;
  const canGoForward = currentIndex < APP_FILES.length - 1;
  const hintDirection = canGoForward ? "up" : "down";
  const feedActive = !embedded;
  let idleTimer = 0;
  let hideTimer = 0;
  let activePointer = null;
  let pointerStart = null;
  let lastWheelNavigation = 0;
  let wheelDistance = 0;
  let wheelResetTimer = 0;
  let lastMovementActivity = 0;
  let navigating = false;

  const style = document.createElement("style");
  style.textContent = `
    #spectrum-scroll-hint {
      position: fixed;
      z-index: 2147483645;
      left: 50%;
      bottom: max(24px, calc(env(safe-area-inset-bottom) + 18px));
      display: grid;
      place-items: center;
      gap: 2px;
      width: max-content;
      max-width: calc(100vw - 40px);
      color: rgba(255, 255, 255, .96);
      font-family: Caveat, "Segoe Print", "Comic Sans MS", cursive;
      font-size: clamp(20px, 5.5vw, 28px);
      font-weight: 700;
      letter-spacing: .02em;
      line-height: 1;
      text-align: center;
      text-shadow: 0 2px 4px rgba(0, 0, 0, .92), 0 0 14px rgba(0, 0, 0, .72);
      opacity: 0;
      transform: translate(-50%, 18px);
      transition: opacity .35s ease, transform .35s ease;
      pointer-events: none;
      user-select: none;
    }
    #spectrum-scroll-hint.spectrum-scroll-hint--visible {
      opacity: 1;
      transform: translate(-50%, 0);
    }
    #spectrum-scroll-hint .spectrum-scroll-hint__chevrons {
      display: grid;
      height: 25px;
      font-family: Arial, sans-serif;
      font-size: 25px;
      line-height: 13px;
      animation: spectrum-hint-up 1.15s ease-in-out infinite;
    }
    #spectrum-scroll-hint[data-direction="down"] .spectrum-scroll-hint__chevrons {
      transform: rotate(180deg);
      animation-name: spectrum-hint-down;
    }
    html.spectrum-page-leaving body {
      opacity: 0;
      transition: opacity .18s ease, transform .18s ease;
    }
    html.spectrum-page-leaving--up body { transform: translateY(-7vh) scale(.985); }
    html.spectrum-page-leaving--down body { transform: translateY(7vh) scale(.985); }
    @keyframes spectrum-hint-up {
      0%, 100% { translate: 0 5px; opacity: .55; }
      50% { translate: 0 -4px; opacity: 1; }
    }
    @keyframes spectrum-hint-down {
      0%, 100% { translate: 0 -5px; opacity: .55; }
      50% { translate: 0 4px; opacity: 1; }
    }
    @media (prefers-reduced-motion: reduce) {
      #spectrum-scroll-hint,
      #spectrum-scroll-hint .spectrum-scroll-hint__chevrons,
      html.spectrum-page-leaving body {
        animation: none;
        transition-duration: .01ms;
      }
    }
  `;
  document.head.appendChild(style);

  const hint = document.createElement("div");
  hint.id = "spectrum-scroll-hint";
  hint.dataset.direction = hintDirection;
  hint.setAttribute("aria-hidden", "true");
  hint.innerHTML = canGoForward
    ? '<span>Desliza hacia arriba</span><span class="spectrum-scroll-hint__chevrons">⌃<br>⌃</span>'
    : '<span>Desliza hacia abajo para volver</span><span class="spectrum-scroll-hint__chevrons">⌃<br>⌃</span>';
  document.body.appendChild(hint);

  function postToFeed(type, extra = {}) {
    if (!embedded) return;
    window.parent.postMessage({ type, appIndex: currentIndex, ...extra }, targetOrigin);
  }

  function hideHint() {
    hint.classList.remove("spectrum-scroll-hint--visible");
    clearTimeout(hideTimer);
  }

  function showHint() {
    if (!feedActive || document.hidden || activePointer !== null || navigating) return;
    hint.classList.add("spectrum-scroll-hint--visible");
    clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      hideHint();
      scheduleHint(10500);
    }, 4400);
  }

  function scheduleHint(delay = 6500) {
    clearTimeout(idleTimer);
    if (!feedActive) return;
    idleTimer = window.setTimeout(showHint, delay);
  }

  function markActivity() {
    hideHint();
    scheduleHint();
    postToFeed("spectrum-feed:activity");
  }

  function navigate(delta) {
    if (navigating) return;
    const targetIndex = currentIndex + delta;
    if (targetIndex < 0 || targetIndex >= APP_FILES.length) {
      scheduleHint(1200);
      return;
    }

    navigating = true;
    hideHint();
    if (embedded) {
      postToFeed("spectrum-feed:navigate", { delta });
      window.setTimeout(() => { navigating = false; }, 650);
      return;
    }

    document.documentElement.classList.add(
      "spectrum-page-leaving",
      delta > 0 ? "spectrum-page-leaving--up" : "spectrum-page-leaving--down"
    );
    window.setTimeout(() => {
      location.href = new URL(APP_FILES[targetIndex], location.href).href;
    }, 180);
  }

  function createPointerGesture(event, now) {
    return {
      x: event.clientX,
      y: event.clientY,
      time: now,
      lastX: event.clientX,
      lastY: event.clientY,
      lastSampleTime: now,
      intentX: event.clientX,
      intentY: event.clientY,
      intentTime: now,
      lastIntentMoveTime: now,
      lastIntentDy: 0,
      sampleInterval: 16,
      totalPath: 0,
      totalVertical: 0,
      velocityY: 0
    };
  }

  function addPointerSample(gesture, x, y, now) {
    const deltaX = x - gesture.lastX;
    const deltaY = y - gesture.lastY;
    const elapsed = Math.max(1, now - gesture.lastSampleTime);
    const segmentLength = Math.hypot(deltaX, deltaY);

    if (segmentLength > .5) {
      gesture.totalPath += segmentLength;
      gesture.totalVertical += Math.abs(deltaY);
    }
    gesture.sampleInterval = gesture.sampleInterval * .8 + Math.min(80, elapsed) * .2;
    gesture.lastX = x;
    gesture.lastY = y;
    gesture.lastSampleTime = now;

    const intentDx = x - gesture.intentX;
    const intentDy = y - gesture.intentY;
    if (Math.hypot(intentDx, intentDy) < 6) return;

    if (Math.abs(intentDy) >= 6 && Math.abs(intentDy) >= Math.abs(intentDx) * .65) {
      const intentElapsed = Math.max(1, now - gesture.intentTime);
      const segmentVelocityY = intentDy / intentElapsed;
      if (Math.abs(segmentVelocityY) >= .08) {
        gesture.velocityY = gesture.lastIntentDy === 0
          ? segmentVelocityY
          : gesture.velocityY * .55 + segmentVelocityY * .45;
        gesture.lastIntentDy = intentDy;
        gesture.lastIntentMoveTime = now;
      }
    }
    gesture.intentX = x;
    gesture.intentY = y;
    gesture.intentTime = now;
  }

  function isNavigationSwipe(gesture, endX, endY, releaseTime, viewportHeight) {
    const deltaX = endX - gesture.x;
    const deltaY = endY - gesture.y;
    const distanceY = Math.abs(deltaY);
    const netDistance = Math.hypot(deltaX, deltaY);
    const duration = Math.max(1, releaseTime - gesture.time);
    const releasePause = releaseTime - gesture.lastIntentMoveTime;
    const releaseWindow = Math.min(140, Math.max(70, gesture.sampleInterval * 2.8));
    const verticalEfficiency = distanceY / Math.max(distanceY, gesture.totalVertical);
    const pathEfficiency = netDistance / Math.max(netDistance, gesture.totalPath);
    const direction = Math.sign(deltaY);
    const finishingVelocity = gesture.velocityY * direction;

    return distanceY >= viewportHeight / 3 &&
      distanceY >= Math.abs(deltaX) * 1.35 &&
      duration <= 1500 &&
      releasePause <= releaseWindow &&
      verticalEfficiency >= .72 &&
      pathEfficiency >= .64 &&
      gesture.lastIntentDy * deltaY > 0 &&
      finishingVelocity >= .08 &&
      distanceY / duration >= .18;
  }

  document.addEventListener("pointerdown", event => {
    if (!event.isPrimary || activePointer !== null) return;
    activePointer = event.pointerId;
    pointerStart = createPointerGesture(event, performance.now());
    markActivity();
  }, true);

  document.addEventListener("pointermove", event => {
    if (event.pointerId !== activePointer) return;
    hideHint();
    const now = performance.now();
    addPointerSample(pointerStart, event.clientX, event.clientY, now);
    if (now - lastMovementActivity >= 400) {
      lastMovementActivity = now;
      markActivity();
    }
  }, true);

  function finishPointer(event, cancelled = false) {
    if (event.pointerId !== activePointer) return;
    const start = pointerStart;
    const releaseTime = performance.now();
    if (start) addPointerSample(start, event.clientX, event.clientY, releaseTime);
    activePointer = null;
    pointerStart = null;
    scheduleHint();
    if (cancelled || !start) return;

    const deltaY = event.clientY - start.y;
    if (isNavigationSwipe(start, event.clientX, event.clientY, releaseTime, innerHeight)) {
      navigate(deltaY < 0 ? 1 : -1);
    }
  }

  document.addEventListener("pointerup", event => finishPointer(event), true);
  document.addEventListener("pointercancel", event => finishPointer(event, true), true);

  document.addEventListener("wheel", event => {
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    markActivity();
    const now = performance.now();
    if (now - lastWheelNavigation < 700) return;
    wheelDistance += event.deltaY;
    clearTimeout(wheelResetTimer);
    wheelResetTimer = window.setTimeout(() => { wheelDistance = 0; }, 180);
    if (Math.abs(wheelDistance) < 90) return;
    lastWheelNavigation = now;
    const delta = wheelDistance > 0 ? 1 : -1;
    wheelDistance = 0;
    navigate(delta);
  }, { passive: true, capture: true });

  document.addEventListener("keydown", event => {
    if (event.key !== "PageDown" && event.key !== "PageUp") {
      markActivity();
      return;
    }
    event.preventDefault();
    markActivity();
    navigate(event.key === "PageDown" ? 1 : -1);
  }, true);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      clearTimeout(idleTimer);
      hideHint();
    } else {
      scheduleHint();
    }
  });

  postToFeed("spectrum-feed:ready", { title: document.title });
  scheduleHint();
})();
