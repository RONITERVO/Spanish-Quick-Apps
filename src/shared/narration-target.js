// Renderers supply stable region IDs; markup explicitly labels the meaning of
// each line. Unlabelled/custom targets remain ordinary, always-spoken content.
export function setReadoutRegion(readout, regionId) {
  const next = typeof regionId === "string" ? regionId : "";
  if (readout.dataset.narrationRegion === next) return;
  readout.dataset.narrationRegion = next;
  window.dispatchEvent(
    new CustomEvent("spectrum:narration-region", {
      detail: { regionId: next },
    }),
  );
}

export function readNarrationTarget() {
  const readout = document.getElementById("readout");
  return {
    regionId: readout?.dataset.narrationRegion,
    segments: ["evidence-class", "zone-name", "feature-name", "metric", "fact"]
      .map((id) => document.getElementById(id))
      .filter(Boolean)
      .map((element) => ({
        id: element.id,
        role: element.dataset.narrationRole,
        display: element.textContent,
        narration: element.dataset.learningNarration || element.textContent,
      })),
  };
}
