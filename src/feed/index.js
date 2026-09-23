import registry from "../registry.json";
import "./style.css";

const feed = document.getElementById("app-feed");
const position = document.getElementById("feed-position");
const hint = document.getElementById("feed-scroll-hint");
const hintLabel = hint.querySelector(".feed-scroll-hint__label");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const targetOrigin = location.origin;
const parseHash = () => {
  const match = location.hash.match(/^#app-(\d{2})$/);
  return Math.max(
    0,
    registry.findIndex((app) => app.id === match?.[1]),
  );
};
let current = parseHash();
let navigationLocked = false;
let unlockTimer;
let idleTimer;
let hideTimer;
if ("scrollRestoration" in history) history.scrollRestoration = "manual";

function hideHint() {
  hint.classList.remove("is-visible");
  clearTimeout(hideTimer);
}
function scheduleHint(delay = 6500) {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (document.hidden) return;
    hint.classList.add("is-visible");
    hideTimer = setTimeout(() => {
      hideHint();
      scheduleHint(10500);
    }, 4400);
  }, delay);
}
function activity() {
  hideHint();
  scheduleHint();
}

const slides = registry.map((app, index) => {
  const section = document.createElement("section");
  section.className = "app-slide";
  section.dataset.index = index;
  section.setAttribute("aria-label", `${app.id}: ${app.label}`);
  const frame = document.createElement("iframe");
  frame.title = app.label;
  frame.allow = "autoplay";
  const placeholder = document.createElement("div");
  placeholder.className = "app-placeholder";
  const title = document.createElement("strong");
  title.textContent = app.label;
  const status = document.createElement("span");
  const retry = document.createElement("button");
  retry.textContent = "Volver a intentar";
  retry.hidden = true;
  const link = document.createElement("a");
  link.textContent = "Abrir directamente";
  link.href = app.file;
  link.hidden = true;
  placeholder.append(title, status, retry, link);
  section.append(frame, placeholder);
  feed.appendChild(section);
  const slide = { section, frame, status, retry, link, timer: null };
  retry.addEventListener("click", () => {
    unload(slide);
    load(index);
  });
  frame.addEventListener("load", () => postActivity(slide, index));
  return slide;
});

function postActivity(slide, index) {
  const active = index === current && !document.hidden;
  slide.section.inert = index !== current;
  slide.frame.contentWindow?.postMessage(
    { type: "spectrum-feed:active", active },
    targetOrigin,
  );
}
function updateActivity() {
  slides.forEach(postActivity);
}
function cancelNarration() {
  for (const { frame } of slides) {
    if (frame.hasAttribute("src"))
      frame.contentWindow?.postMessage(
        { type: "spectrum-feed:cancel-tts" },
        targetOrigin,
      );
  }
}
function load(index) {
  const slide = slides[index];
  if (!slide || slide.frame.hasAttribute("src")) return;
  slide.status.textContent = `Cargando espectro ${registry[index].id}…`;
  slide.retry.hidden = slide.link.hidden = true;
  slide.frame.src = registry[index].file;
  slide.timer = setTimeout(() => {
    slide.status.textContent = "No se pudo cargar el espectro.";
    slide.retry.hidden = slide.link.hidden = false;
  }, 15000);
}
function unload(slide) {
  clearTimeout(slide.timer);
  slide.frame.removeAttribute("src");
  delete slide.frame.dataset.loaded;
}
function keepNearby(index) {
  for (
    let i = Math.max(0, index - 1);
    i <= Math.min(registry.length - 1, index + 1);
    i++
  )
    load(i);
  slides.forEach((slide, i) => {
    if (Math.abs(i - index) > 2) unload(slide);
  });
}
function setCurrent(index) {
  if (index < 0 || index >= registry.length) return;
  if (current !== index) cancelNarration();
  current = index;
  keepNearby(index);
  updateActivity();
  const atEnd = index === registry.length - 1;
  hint.dataset.direction = atEnd ? "down" : "up";
  hintLabel.textContent = atEnd
    ? "Desliza hacia abajo para volver"
    : "Desliza hacia arriba";
  activity();
  position.textContent = `${registry[index].id} / ${registry.length}`;
  document.title = `${registry[index].label} · Espectros en Español`;
  history.replaceState(null, "", `#app-${registry[index].id}`);
}
function goTo(index, smooth = true) {
  if (!Number.isInteger(index) || index < 0 || index >= registry.length) return;
  cancelNarration();
  clearTimeout(unlockTimer);
  smooth = smooth && !reducedMotion.matches;
  navigationLocked = smooth;
  setCurrent(index);
  slides[index].section.scrollIntoView({
    behavior: smooth ? "smooth" : "instant",
    block: "start",
  });
  unlockTimer = setTimeout(
    () => {
      navigationLocked = false;
    },
    smooth ? 650 : 50,
  );
}

const observer = new IntersectionObserver(
  (entries) => {
    if (navigationLocked) return;
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (visible?.intersectionRatio >= 0.55)
      setCurrent(Number(visible.target.dataset.index));
  },
  { root: feed, threshold: [0.55, 0.75] },
);
slides.forEach((slide) => observer.observe(slide.section));
feed.addEventListener("scroll", cancelNarration, { passive: true });
window.addEventListener("message", (event) => {
  if (
    event.origin !== targetOrigin ||
    !event.data ||
    typeof event.data !== "object"
  )
    return;
  const source = slides.findIndex(
    (slide) => slide.frame.contentWindow === event.source,
  );
  if (source < 0) return;
  if (event.data.type === "spectrum-feed:ready") {
    const slide = slides[source];
    clearTimeout(slide.timer);
    slide.frame.dataset.loaded = "true";
    postActivity(slide, source);
  } else if (
    source === current &&
    event.data.type === "spectrum-feed:navigate" &&
    !navigationLocked
  ) {
    const delta = event.data.delta;
    if (delta === 1 || delta === -1) goTo(source + delta);
  } else if (source === current && event.data.type === "spectrum-feed:activity")
    activity();
});
document.addEventListener("visibilitychange", () => {
  updateActivity();
  if (document.hidden) {
    cancelNarration();
    clearTimeout(idleTimer);
    hideHint();
  } else scheduleHint();
});
document.addEventListener("keydown", (event) => {
  if (!["PageDown", "PageUp", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  if (event.key === "Home") goTo(0);
  else if (event.key === "End") goTo(registry.length - 1);
  else if (!navigationLocked)
    goTo(current + (event.key === "PageDown" ? 1 : -1));
});
window.addEventListener("hashchange", () => goTo(parseHash(), false));
window.addEventListener("resize", () => goTo(current, false));
goTo(current, false);
