// Synthesized ambience is optional. Narration uses its own persistent media
// element and continues to work when the Web Audio API is unavailable.
const contexts = new Set();

export function createSceneAudio() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  try {
    const context = new AudioContext();
    contexts.add(context);
    return context;
  } catch {
    return null;
  }
}

window.addEventListener("spectrum:scene-inactive", () => {
  for (const context of contexts) {
    if (context.state === "running") context.suspend().catch(() => {});
  }
});
window.addEventListener("pagehide", () => {
  for (const context of contexts) context.suspend().catch(() => {});
});
