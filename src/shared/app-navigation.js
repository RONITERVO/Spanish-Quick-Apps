import "./app-navigation.css";
import registry from "../registry.json";
import {
  requestSceneFrame as requestAnimationFrame,
  cancelSceneFrame as cancelAnimationFrame,
} from "./animation.js";

export function mountNavigation() {
  const APP_FILES = registry.map((app) => app.file);

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
  let lastWheelNavigation = -Infinity;
  let wheelDistance = 0;
  let wheelResetTimer = 0;
  let lastMovementActivity = 0;
  let navigating = false;

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
    window.parent.postMessage(
      { type, appIndex: currentIndex, ...extra },
      targetOrigin,
    );
  }

  function hideHint() {
    hint.classList.remove("spectrum-scroll-hint--visible");
    clearTimeout(hideTimer);
  }

  function showHint() {
    if (!feedActive || document.hidden || activePointer !== null || navigating)
      return;
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

  function cancelTts() {
    window.dispatchEvent(new Event("spectrum:cancel-tts"));
    if ("speechSynthesis" in window) speechSynthesis.cancel();
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
      window.setTimeout(() => {
        navigating = false;
      }, 650);
      return;
    }

    document.documentElement.classList.add(
      "spectrum-page-leaving",
      delta > 0 ? "spectrum-page-leaving--up" : "spectrum-page-leaving--down",
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
      velocityY: 0,
    };
  }

  function addPointerSample(gesture, x, y, now) {
    const deltaX = x - gesture.lastX;
    const deltaY = y - gesture.lastY;
    const elapsed = Math.max(1, now - gesture.lastSampleTime);
    const segmentLength = Math.hypot(deltaX, deltaY);

    if (segmentLength > 0.5) {
      gesture.totalPath += segmentLength;
      gesture.totalVertical += Math.abs(deltaY);
    }
    gesture.sampleInterval =
      gesture.sampleInterval * 0.8 + Math.min(80, elapsed) * 0.2;
    gesture.lastX = x;
    gesture.lastY = y;
    gesture.lastSampleTime = now;

    const intentDx = x - gesture.intentX;
    const intentDy = y - gesture.intentY;
    if (Math.hypot(intentDx, intentDy) < 6) return;

    if (
      Math.abs(intentDy) >= 6 &&
      Math.abs(intentDy) >= Math.abs(intentDx) * 0.65
    ) {
      const intentElapsed = Math.max(1, now - gesture.intentTime);
      const segmentVelocityY = intentDy / intentElapsed;
      if (Math.abs(segmentVelocityY) >= 0.08) {
        gesture.velocityY =
          gesture.lastIntentDy === 0
            ? segmentVelocityY
            : gesture.velocityY * 0.55 + segmentVelocityY * 0.45;
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
    const releaseWindow = Math.min(
      140,
      Math.max(70, gesture.sampleInterval * 2.8),
    );
    const verticalEfficiency =
      distanceY / Math.max(distanceY, gesture.totalVertical);
    const pathEfficiency =
      netDistance / Math.max(netDistance, gesture.totalPath);
    const direction = Math.sign(deltaY);
    const finishingVelocity = gesture.velocityY * direction;

    return (
      distanceY >= viewportHeight / 4 &&
      distanceY >= Math.abs(deltaX) * 1.35 &&
      duration <= 1500 &&
      releasePause <= releaseWindow &&
      verticalEfficiency >= 0.72 &&
      pathEfficiency >= 0.64 &&
      gesture.lastIntentDy * deltaY > 0 &&
      finishingVelocity >= 0.08 &&
      distanceY / duration >= 0.18
    );
  }

  document.addEventListener(
    "pointerdown",
    (event) => {
      if (!event.isPrimary || activePointer !== null) return;
      activePointer = event.pointerId;
      pointerStart = createPointerGesture(event, performance.now());
      markActivity();
    },
    true,
  );

  document.addEventListener(
    "pointermove",
    (event) => {
      if (event.pointerId !== activePointer) return;
      hideHint();
      const now = performance.now();
      addPointerSample(pointerStart, event.clientX, event.clientY, now);
      if (now - lastMovementActivity >= 400) {
        lastMovementActivity = now;
        markActivity();
      }
    },
    true,
  );

  function finishPointer(event, cancelled = false) {
    if (event.pointerId !== activePointer) return;
    const start = pointerStart;
    const releaseTime = performance.now();
    if (start)
      addPointerSample(start, event.clientX, event.clientY, releaseTime);
    activePointer = null;
    pointerStart = null;
    scheduleHint();
    if (cancelled || !start) return;

    const deltaY = event.clientY - start.y;
    if (
      isNavigationSwipe(
        start,
        event.clientX,
        event.clientY,
        releaseTime,
        innerHeight,
      )
    ) {
      cancelTts();
      navigate(deltaY < 0 ? 1 : -1);
    }
  }

  document.addEventListener("pointerup", (event) => finishPointer(event), true);
  document.addEventListener(
    "pointercancel",
    (event) => finishPointer(event, true),
    true,
  );

  document.addEventListener(
    "wheel",
    (event) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      cancelTts();
      markActivity();
      const now = performance.now();
      if (now - lastWheelNavigation < 700) return;
      wheelDistance += event.deltaY;
      clearTimeout(wheelResetTimer);
      wheelResetTimer = window.setTimeout(() => {
        wheelDistance = 0;
      }, 180);
      if (Math.abs(wheelDistance) < 90) return;
      lastWheelNavigation = now;
      const delta = wheelDistance > 0 ? 1 : -1;
      wheelDistance = 0;
      navigate(delta);
    },
    { passive: true, capture: true },
  );

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "PageDown" && event.key !== "PageUp") {
        markActivity();
        return;
      }
      event.preventDefault();
      cancelTts();
      markActivity();
      navigate(event.key === "PageDown" ? 1 : -1);
    },
    true,
  );

  window.addEventListener("message", (event) => {
    if (
      !embedded ||
      event.source !== window.parent ||
      event.data?.type !== "spectrum-feed:cancel-tts"
    )
      return;
    cancelTts();
  });

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
}
