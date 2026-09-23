import "./playback-speed.css";

const STORAGE_KEY = "spectrum.narrationSpeed";
const RATES = [1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3];

function validRate(value) {
  const rate = Number(value);
  return RATES.includes(rate) ? rate : 1;
}

export function isControlEvent(event) {
  return (
    event.target instanceof Element &&
    Boolean(event.target.closest("[data-spectrum-control]"))
  );
}

export function mountPlaybackSpeed(onChange, locale) {
  let rate = 1;
  try {
    rate = validRate(localStorage.getItem(STORAGE_KEY));
  } catch (_) {}

  const control = document.createElement("label");
  control.className = "playback-speed";
  control.lang = locale;
  control.dataset.spectrumControl = "";
  const label = locale === "fi" ? "Kerronnan nopeus" : "Narration speed";
  control.title = label;
  control.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 9v6h4l5 4V5L8 9H4Zm13-1a6 6 0 0 1 0 8" /></svg>`;
  const select = document.createElement("select");
  select.id = "playback-speed";
  select.setAttribute("aria-label", label);
  for (const value of RATES) {
    select.add(new Option(`${value}×`, String(value)));
  }
  control.appendChild(select);
  document.body.appendChild(control);

  function apply(value) {
    rate = validRate(value);
    select.value = String(rate);
    onChange(rate);
  }
  apply(rate);
  select.addEventListener("change", () => {
    apply(select.value);
    try {
      localStorage.setItem(STORAGE_KEY, String(rate));
    } catch (_) {}
  });

  // Loaded feed neighbours and other tabs follow the same preference. Newly
  // loaded experiences read it above, without involving the feed in narration.
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY || event.key === null) apply(event.newValue);
  });

  // Native select keyboard/pointer behaviour must not reach scene shortcuts.
  for (const type of [
    "keydown",
    "keyup",
    "pointerdown",
    "pointerup",
    "pointercancel",
    "wheel",
  ]) {
    control.addEventListener(type, (event) => event.stopPropagation());
  }
  return { getRate: () => rate };
}
