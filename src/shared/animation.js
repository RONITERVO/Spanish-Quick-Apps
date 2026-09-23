// One scheduler per document. Keep pending callbacks while a preloaded scene is
// off screen, so returning to it resumes its state without rebuilding the scene.
const pending = new Map();
let nextId = 0;
let nativeId = 0;
let feedActive = window.parent === window;

function schedule() {
  if (nativeId || !pending.size || document.hidden || !feedActive) return;
  nativeId = window.requestAnimationFrame((time) => {
    nativeId = 0;
    const callbacks = [...pending.entries()];
    for (const [id, callback] of callbacks) {
      if (!pending.delete(id)) continue;
      try {
        callback(time);
      } catch (error) {
        reportError(error);
      }
    }
    schedule();
  });
}

export function requestSceneFrame(callback) {
  const id = ++nextId;
  pending.set(id, callback);
  schedule();
  return id;
}

export function cancelSceneFrame(id) {
  pending.delete(id);
}

function updateActivity() {
  const active = feedActive && !document.hidden;
  document.documentElement.dataset.sceneActive = String(active);
  if (active) schedule();
  else {
    window.cancelAnimationFrame(nativeId);
    nativeId = 0;
    window.dispatchEvent(new Event("spectrum:cancel-tts"));
    window.dispatchEvent(new Event("spectrum:scene-inactive"));
  }
}

window.addEventListener("message", (event) => {
  if (
    window.parent === window ||
    event.source !== window.parent ||
    event.origin !== location.origin
  )
    return;
  if (event.data?.type !== "spectrum-feed:active") return;
  feedActive = event.data.active === true;
  updateActivity();
});
document.addEventListener("visibilitychange", updateActivity);
window.addEventListener("pagehide", () => {
  window.cancelAnimationFrame(nativeId);
  nativeId = 0;
});
window.addEventListener("pageshow", updateActivity);
updateActivity();
