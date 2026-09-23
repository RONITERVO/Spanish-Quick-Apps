import { createSceneAudio } from "../../shared/audio.js";
import {
  requestSceneFrame as requestAnimationFrame,
  cancelSceneFrame as cancelAnimationFrame,
} from "../../shared/animation.js";
import content from "./content.json";
const { ZONES } = content;

export function mountScene() {
  const canvas = document.getElementById("observable-universe-spectrum");
  const ctx = canvas.getContext("2d", { alpha: false });
  const root = document.documentElement;
  const readout = document.getElementById("readout");
  const zoneName = document.getElementById("zone-name");
  const featureName = document.getElementById("feature-name");
  const metric = document.getElementById("metric");
  const fact = document.getElementById("fact");
  const touchOrb = document.getElementById("touch-orb");
  const journeyScale = document.getElementById("journey-scale");
  const scaleValue = document.getElementById("scale-value");
  const scaleDot = document.getElementById("scale-dot");
  const hint = document.getElementById("hint");

  const TAU = Math.PI * 2;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const stars = [];
  const galaxies = [];
  const webNodes = [];
  const webEdges = [];
  const quasars = [];
  const protoGalaxies = [];
  const ionizedBubbles = [];
  const densitySeeds = [];
  const cmbSpots = [];
  const particles = [];
  const waves = [];

  let width = 1;
  let height = 1;
  let dpr = 1;
  let activePointer = null;
  let pointerX = 0.5;
  let pointerY = 0.94;
  let targetX = 0.5;
  let targetY = 0.94;
  let lastZoneId = "";
  let lastFeature = -1;
  let hideTimer = 0;
  let lastTime = performance.now();
  let raf = 0;

  let audioCtx = null;
  let master = null;
  let droneA = null;
  let droneB = null;
  let droneGain = null;
  let droneFilter = null;
  let pulseOsc = null;
  let pulseGain = null;
  let noiseSource = null;
  let noiseGain = null;
  let noiseFilter = null;
  let stereo = null;

  function clamp(value, min = 0, max = 1) {
    return Math.min(max, Math.max(min, value));
  }
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }
  function smoothstep(a, b, x) {
    const t = clamp((x - a) / Math.max(0.00001, b - a));
    return t * t * (3 - 2 * t);
  }
  function seeded(seed) {
    let value = seed >>> 0;
    return () => {
      value += 0x6d2b79f5;
      let t = value;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function seededPoint(seed) {
    const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  }
  function journeyFromY(yNorm) {
    return clamp(1 - yNorm);
  }
  function zoneForJourney(progress) {
    const p = clamp(progress, 0, 0.999999);
    return ZONES.find((zone) => p >= zone.p0 && p < zone.p1) || ZONES.at(-1);
  }
  function featureFor(zone, xNorm) {
    const index = Math.min(
      zone.features.length - 1,
      Math.floor(clamp(xNorm, 0, 0.999999) * zone.features.length),
    );
    return {
      index,
      name: zone.features[index][0],
      fact: zone.features[index][1],
    };
  }
  function sceneScale() {
    return Math.sqrt(Math.min(width, height) / 720);
  }

  function setCssPoint(x, y) {
    root.style.setProperty("--scan-x", `${x}px`);
    root.style.setProperty("--scan-y", `${y}px`);
  }
  function setAccent(zone) {
    const [r, g, b] = zone.color;
    root.style.setProperty("--accent", `rgb(${r} ${g} ${b})`);
    root.style.setProperty("--accent-soft", `rgb(${r} ${g} ${b} / .34)`);
  }

  function buildStaticScene() {
    stars.length =
      galaxies.length =
      webNodes.length =
      webEdges.length =
      quasars.length =
        0;
    protoGalaxies.length =
      ionizedBubbles.length =
      densitySeeds.length =
      cmbSpots.length =
        0;
    const random = seeded(18072643);

    const starCount = Math.max(95, Math.round((width * height) / 7600));
    for (let i = 0; i < starCount; i++) {
      stars.push({
        x: random(),
        y: 0.18 + random() * 0.82,
        r: 0.25 + random() * 1.15,
        a: 0.08 + random() * 0.44,
        phase: random() * TAU,
        speed: 0.45 + random() * 1.6,
      });
    }

    const anchors = [
      [0.02, 0.95],
      [0.15, 0.87],
      [0.29, 0.94],
      [0.44, 0.84],
      [0.58, 0.94],
      [0.72, 0.86],
      [0.91, 0.93],
      [0.08, 0.77],
      [0.25, 0.73],
      [0.41, 0.78],
      [0.61, 0.71],
      [0.78, 0.76],
      [0.97, 0.69],
      [0.18, 0.64],
      [0.37, 0.62],
      [0.54, 0.65],
      [0.72, 0.59],
      [0.9, 0.62],
    ];
    for (let i = 0; i < anchors.length; i++) {
      const [ax, ay] = anchors[i];
      webNodes.push({
        x: clamp(ax + (random() - 0.5) * 0.045, -0.03, 1.03),
        y: clamp(ay + (random() - 0.5) * 0.035, 0.55, 1.03),
        mass: 0.65 + random() * 1.25,
        phase: random() * TAU,
        warm: random(),
      });
    }
    for (let i = 0; i < webNodes.length; i++) {
      const near = [];
      for (let j = 0; j < webNodes.length; j++)
        if (i !== j) {
          const dx = webNodes[i].x - webNodes[j].x;
          const dy = (webNodes[i].y - webNodes[j].y) * 1.45;
          near.push({ j, d: Math.hypot(dx, dy) });
        }
      near.sort((a, b) => a.d - b.d);
      for (const item of near.slice(0, i % 3 === 0 ? 3 : 2)) {
        const a = Math.min(i, item.j),
          b = Math.max(i, item.j);
        if (!webEdges.some((e) => e.a === a && e.b === b) && item.d < 0.32) {
          webEdges.push({
            a,
            b,
            bend: (random() - 0.5) * 0.055,
            phase: random() * TAU,
            strength: 0.45 + random() * 0.55,
          });
        }
      }
    }

    const galaxyCount = Math.max(150, Math.round((width * height) / 4300));
    for (let i = 0; i < galaxyCount; i++) {
      const y = 0.24 + Math.pow(random(), 0.74) * 0.52;
      const age = clamp((0.76 - y) / 0.52);
      galaxies.push({
        x: random(),
        y,
        size: (0.65 + random() * 2.7) * (1 - age * 0.45),
        a: 0.18 + random() * 0.58,
        angle: random() * TAU,
        hue: random(),
        irregular: age * (0.35 + random() * 0.65),
        phase: random() * TAU,
      });
    }

    for (let i = 0; i < 18; i++) {
      quasars.push({
        x: 0.035 + random() * 0.93,
        y: 0.55 + random() * 0.105,
        r: 1.2 + random() * 2.8,
        a: 0.52 + random() * 0.42,
        beam: random() > 0.56,
        angle: random() * TAU,
        phase: random() * TAU,
      });
    }

    for (let i = 0; i < 48; i++) {
      protoGalaxies.push({
        x: 0.025 + random() * 0.95,
        y: 0.435 + random() * 0.13,
        r: 0.55 + random() * 1.7,
        a: 0.22 + random() * 0.48,
        pieces: 2 + Math.floor(random() * 4),
        phase: random() * TAU,
      });
    }

    for (let i = 0; i < 19; i++) {
      ionizedBubbles.push({
        x: -0.05 + random() * 1.1,
        y: 0.335 + random() * 0.115,
        rx: 0.035 + random() * 0.105,
        ry: 0.018 + random() * 0.055,
        a: 0.045 + random() * 0.11,
        phase: random() * TAU,
        warm: random(),
      });
    }

    for (let i = 0; i < 75; i++) {
      densitySeeds.push({
        x: random(),
        y: 0.225 + random() * 0.115,
        r: 0.25 + random() * 1.05,
        a: 0.05 + random() * 0.16,
        phase: random() * TAU,
      });
    }

    const cols = Math.max(16, Math.round(width / 28));
    const rows = Math.max(8, Math.round((height * 0.205) / 22));
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const seed = row * 997 + col * 37;
        const x = (col + 0.5 + (seededPoint(seed) - 0.5) * 0.85) / cols;
        const y =
          0.018 +
          ((row + 0.5 + (seededPoint(seed + 7) - 0.5) * 0.75) / rows) * 0.205;
        const v = seededPoint(seed + 21);
        cmbSpots.push({
          x,
          y,
          rx: (0.7 + seededPoint(seed + 31) * 1.8) / cols,
          ry: ((0.6 + seededPoint(seed + 41) * 1.5) / rows) * 0.18,
          v,
          phase: seededPoint(seed + 51) * TAU,
        });
      }
    }
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildStaticScene();
    setCssPoint(targetX * width, targetY * height);
  }

  function ensureAudio() {
    if (audioCtx) {
      if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
      return;
    }
    audioCtx = createSceneAudio();
    if (!audioCtx) return;
    master = audioCtx.createGain();
    master.gain.value = 0;
    const compressor = audioCtx.createDynamicsCompressor();
    compressor.threshold.value = -22;
    compressor.knee.value = 18;
    compressor.ratio.value = 6;
    master.connect(compressor).connect(audioCtx.destination);

    droneA = audioCtx.createOscillator();
    droneB = audioCtx.createOscillator();
    droneA.type = "sine";
    droneB.type = "triangle";
    droneGain = audioCtx.createGain();
    droneGain.gain.value = 0.0001;
    droneFilter = audioCtx.createBiquadFilter();
    droneFilter.type = "lowpass";
    droneFilter.frequency.value = 900;
    droneFilter.Q.value = 0.8;
    stereo = audioCtx.createStereoPanner
      ? audioCtx.createStereoPanner()
      : audioCtx.createGain();
    droneA.connect(droneGain);
    droneB.connect(droneGain);
    droneGain.connect(droneFilter).connect(stereo).connect(master);
    droneA.start();
    droneB.start();

    pulseOsc = audioCtx.createOscillator();
    pulseOsc.type = "sine";
    pulseGain = audioCtx.createGain();
    pulseGain.gain.value = 0.0001;
    pulseOsc.connect(pulseGain).connect(master);
    pulseOsc.start();

    const noiseBuffer = audioCtx.createBuffer(
      1,
      audioCtx.sampleRate * 2,
      audioCtx.sampleRate,
    );
    const ch = noiseBuffer.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    noiseSource = audioCtx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;
    noiseGain = audioCtx.createGain();
    noiseGain.gain.value = 0.0001;
    noiseFilter = audioCtx.createBiquadFilter();
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.value = 1200;
    noiseFilter.Q.value = 0.55;
    noiseSource.connect(noiseFilter).connect(noiseGain).connect(master);
    noiseSource.start();
  }

  function setAudioFor(zone, xNorm, yNorm, active) {
    if (!audioCtx || !master) return;
    const now = audioCtx.currentTime,
      s = zone.sound;
    const vertical = 0.91 + (1 - yNorm) * 0.34,
      horizontal = 0.94 + xNorm * 0.13;
    const base = s.base * vertical * horizontal;
    droneA.type = s.type;
    droneB.type = s.type === "sawtooth" ? "triangle" : "sine";
    droneA.frequency.setTargetAtTime(base, now, 0.055);
    droneB.frequency.setTargetAtTime(base * 1.503, now, 0.07);
    droneFilter.frequency.setTargetAtTime(
      s.filter * (0.82 + xNorm * 0.35),
      now,
      0.08,
    );
    droneGain.gain.setTargetAtTime(active ? 0.024 : 0.0001, now, 0.07);
    pulseOsc.frequency.setTargetAtTime(base * (2.01 + s.pulse), now, 0.05);
    pulseGain.gain.setTargetAtTime(active ? 0.0065 : 0.0001, now, 0.08);
    noiseFilter.frequency.setTargetAtTime(s.filter * 1.28, now, 0.08);
    noiseGain.gain.setTargetAtTime(
      active * s.noise * 0.12 || 0.0001,
      now,
      0.08,
    );
    if (stereo.pan) stereo.pan.setTargetAtTime((xNorm - 0.5) * 0.8, now, 0.05);
    master.gain.setTargetAtTime(active ? 0.34 : 0.0001, now, 0.07);
  }

  function ping(zone, xNorm, featureIndex = 0) {
    if (!audioCtx || !master) return;
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator(),
      gain = audioCtx.createGain(),
      filter = audioCtx.createBiquadFilter();
    const pan = audioCtx.createStereoPanner
      ? audioCtx.createStereoPanner()
      : null;
    const scale = [1, 1.125, 1.25, 1.5, 1.6875][featureIndex % 5];
    osc.type = zone.sound.type;
    osc.frequency.setValueAtTime(zone.sound.base * 4.2 * scale, now);
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(45, zone.sound.base * 1.7),
      now + 0.42,
    );
    filter.type = "lowpass";
    filter.frequency.value = zone.sound.filter * 1.8;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.045, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    osc.connect(filter).connect(gain);
    if (pan) {
      pan.pan.value = (xNorm - 0.5) * 1.5;
      gain.connect(pan).connect(master);
    } else gain.connect(master);
    osc.start(now);
    osc.stop(now + 0.55);
  }

  function addRipple(x, y) {
    const node = document.createElement("div");
    node.className = "ripple";
    node.style.left = `${x}px`;
    node.style.top = `${y}px`;
    document.body.appendChild(node);
    node.addEventListener("animationend", () => node.remove(), { once: true });
  }
  function addBurst(x, y, zone) {
    const count = reducedMotion ? 5 : 14;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU,
        s = 20 + Math.random() * 90;
      particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        r: 1 + Math.random() * 2.6,
        life: 1,
        decay: 1.1 + Math.random() * 0.7,
        color: zone.color,
      });
    }
    waves.push({ x, y, radius: 5, life: 1, color: zone.color });
  }

  function updateReadout(x, y, isNewPress = false) {
    const xNorm = clamp(x / width, 0, 0.999999),
      yNorm = clamp(y / height, 0, 0.999999);
    const progress = journeyFromY(yNorm),
      zone = zoneForJourney(progress),
      feature = featureFor(zone, xNorm);
    targetX = xNorm;
    targetY = yNorm;
    setCssPoint(x, y);
    setAccent(zone);
    root.style.setProperty("--progress", `${progress * 100}%`);
    root.style.setProperty("--home-y", `${y}px`);
    scaleDot.style.top = `${(1 - progress) * 100}%`;
    scaleValue.textContent =
      progress < 0.16
        ? "La red cercana se reduce"
        : progress < 0.55
          ? "Más distancia · luz más antigua"
          : progress < 0.77
            ? "Antes de las galaxias maduras"
            : progress < 0.9
              ? "Luz fósil del universo temprano"
              : "Límite de observación · no pared física";

    zoneName.textContent = zone.name;
    zoneName.className =
      zone.name.length > 26 ? "long" : zone.name.length > 18 ? "compact" : "";
    featureName.textContent = feature.name;
    metric.textContent = zone.metric;
    fact.textContent = feature.fact;
    readout.classList.add("visible");
    touchOrb.classList.add("visible");
    journeyScale.classList.add("visible");
    touchOrb.style.left = `${x}px`;
    touchOrb.style.top = `${y}px`;
    document.body.classList.add("active");
    hint.classList.add("hidden");

    const zoneChanged = zone.id !== lastZoneId,
      featureChanged = feature.index !== lastFeature;
    if (isNewPress || zoneChanged || featureChanged) {
      ping(zone, xNorm, feature.index);
      if (isNewPress) addBurst(x, y, zone);
    }
    setAudioFor(zone, xNorm, yNorm, true);
    lastZoneId = zone.id;
    lastFeature = feature.index;
    clearTimeout(hideTimer);
  }

  function releaseInteraction(delay = 900) {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      readout.classList.remove("visible");
      touchOrb.classList.remove("visible");
      journeyScale.classList.remove("visible");
      document.body.classList.remove("active");
      if (audioCtx)
        setAudioFor(
          zoneForJourney(journeyFromY(targetY)),
          targetX,
          targetY,
          false,
        );
    }, delay);
  }
  function pointerPosition(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: clamp(event.clientX - rect.left, 0, width),
      y: clamp(event.clientY - rect.top, 0, height),
    };
  }
  canvas.addEventListener("pointerdown", (event) => {
    activePointer = event.pointerId;
    canvas.setPointerCapture?.(event.pointerId);
    ensureAudio();
    const p = pointerPosition(event);
    addRipple(p.x, p.y);
    updateReadout(p.x, p.y, true);
    event.preventDefault();
  });
  canvas.addEventListener("pointermove", (event) => {
    if (activePointer !== event.pointerId) return;
    const p = pointerPosition(event);
    updateReadout(p.x, p.y, false);
    event.preventDefault();
  });
  function endPointer(event) {
    if (activePointer !== event.pointerId) return;
    activePointer = null;
    canvas.releasePointerCapture?.(event.pointerId);
    releaseInteraction();
  }
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.addEventListener("lostpointercapture", () => {
    activePointer = null;
    releaseInteraction();
  });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener("keydown", (event) => {
    const step = event.shiftKey ? 0.09 : 0.035;
    let handled = true;
    if (event.key === "ArrowUp") targetY = clamp(targetY - step, 0, 1);
    else if (event.key === "ArrowDown") targetY = clamp(targetY + step, 0, 1);
    else if (event.key === "ArrowLeft") targetX = clamp(targetX - step, 0, 1);
    else if (event.key === "ArrowRight") targetX = clamp(targetX + step, 0, 1);
    else if (event.key === " " || event.key === "Enter") {
    } else handled = false;
    if (handled) {
      ensureAudio();
      updateReadout(
        targetX * width,
        targetY * height,
        event.key === " " || event.key === "Enter",
      );
      releaseInteraction(1500);
      event.preventDefault();
    }
  });

  function glow(x, y, r, core, mid, edge = "rgba(0,0,0,0)") {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, core);
    g.addColorStop(0.2, core);
    g.addColorStop(0.52, mid);
    g.addColorStop(1, edge);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }

  function drawBackground(time) {
    const bg = ctx.createLinearGradient(0, height, 0, 0);
    bg.addColorStop(0, "#020613");
    bg.addColorStop(0.22, "#05071b");
    bg.addColorStop(0.42, "#080818");
    bg.addColorStop(0.58, "#08050f");
    bg.addColorStop(0.73, "#02040b");
    bg.addColorStop(0.82, "#171119");
    bg.addColorStop(1, "#3f3027");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    const bottom = ctx.createRadialGradient(
      width * 0.5,
      height * 1.02,
      0,
      width * 0.5,
      height * 1.02,
      Math.max(width, height) * 0.68,
    );
    bottom.addColorStop(0, "rgba(60,126,210,.18)");
    bottom.addColorStop(0.42, "rgba(63,58,151,.08)");
    bottom.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = bottom;
    ctx.fillRect(0, 0, width, height);

    for (const s of stars) {
      const tw = reducedMotion
        ? 1
        : 0.78 + Math.sin(time * 0.001 * s.speed + s.phase) * 0.22;
      ctx.fillStyle = `rgba(210,229,255,${s.a * tw})`;
      ctx.beginPath();
      ctx.arc(s.x * width, s.y * height, s.r * sceneScale(), 0, TAU);
      ctx.fill();
    }
  }

  function project(x, y, z, time, phase = 0) {
    const px = (pointerX - 0.5) * (z - 0.5) * width * 0.035;
    const py = (pointerY - 0.5) * (z - 0.5) * height * 0.018;
    const drift = reducedMotion
      ? 0
      : Math.sin(time * 0.00013 + phase) * 1.5 * z;
    return { x: x * width + px + drift, y: y * height + py };
  }

  function drawCosmicWeb(time) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const points = webNodes.map((n, i) =>
      project(n.x, n.y, 0.88, time, n.phase),
    );
    for (const e of webEdges) {
      const a = points[e.a],
        b = points[e.b],
        dx = b.x - a.x,
        dy = b.y - a.y,
        len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len,
        ny = dx / len,
        bend = e.bend * Math.min(width, height);
      const cx = (a.x + b.x) / 2 + nx * bend,
        cy = (a.y + b.y) / 2 + ny * bend;
      const shimmer = reducedMotion
        ? 1
        : 0.84 + Math.sin(time * 0.00042 + e.phase) * 0.16;
      ctx.strokeStyle = `rgba(92,177,255,${0.09 * e.strength * shimmer})`;
      ctx.lineWidth = 4.5 * sceneScale();
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(cx, cy, b.x, b.y);
      ctx.stroke();
      ctx.strokeStyle = `rgba(179,224,255,${0.28 * e.strength * shimmer})`;
      ctx.lineWidth = 0.7 * sceneScale();
      ctx.stroke();
    }
    webNodes.forEach((n, i) => {
      const p = points[i],
        pulse = reducedMotion
          ? 1
          : 0.94 + Math.sin(time * 0.0007 + n.phase) * 0.06,
        r = (2 + n.mass * 3.2) * sceneScale() * pulse;
      const warm = n.warm > 0.72;
      glow(
        p.x,
        p.y,
        r * 3,
        warm ? "rgba(255,236,210,.42)" : "rgba(230,247,255,.48)",
        warm ? "rgba(255,157,98,.12)" : "rgba(87,184,255,.16)",
      );
    });
    ctx.restore();
  }

  function drawGalaxies(time) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const g of galaxies) {
      const depth = clamp((g.y - 0.24) / 0.52),
        p = project(g.x, g.y, 0.35 + depth * 0.45, time, g.phase);
      const pulse = reducedMotion
        ? 1
        : 0.94 + Math.sin(time * 0.00034 + g.phase) * 0.06;
      const r = g.size * sceneScale() * pulse;
      const early = clamp((0.58 - g.y) / 0.34);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(
        g.angle +
          (reducedMotion ? 0 : Math.sin(time * 0.00007 + g.phase) * 0.03),
      );
      if (g.irregular > 0.42) {
        for (let k = 0; k < 3; k++) {
          const a = k * 2.19 + g.phase,
            rr = r * (0.25 + k * 0.31);
          glow(
            Math.cos(a) * rr,
            Math.sin(a) * rr * 0.55,
            r * (0.65 - k * 0.1),
            `rgba(235,221,255,${g.a * 0.7})`,
            `rgba(158,99,255,${g.a * 0.14})`,
          );
        }
      } else {
        ctx.scale(1, 0.42 + early * 0.18);
        glow(
          0,
          0,
          r * 2.6,
          `rgba(247,241,224,${g.a * 0.72})`,
          g.hue > 0.5
            ? `rgba(133,160,255,${g.a * 0.14})`
            : `rgba(255,159,112,${g.a * 0.12})`,
        );
        ctx.strokeStyle = `rgba(214,229,255,${g.a * 0.22})`;
        ctx.lineWidth = 0.45;
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 2.2, r * 0.72, 0, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  function drawQuasars(time) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const q of quasars) {
      const p = project(q.x, q.y, 0.42, time, q.phase),
        pulse = reducedMotion
          ? 1
          : 0.82 + Math.sin(time * 0.002 + q.phase) * 0.18,
        r = q.r * sceneScale() * pulse;
      glow(
        p.x,
        p.y,
        r * 7,
        `rgba(255,250,225,${q.a})`,
        `rgba(255,133,63,${q.a * 0.17})`,
      );
      ctx.fillStyle = `rgba(255,255,245,${q.a})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.7, r * 0.42), 0, TAU);
      ctx.fill();
      if (q.beam) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(q.angle);
        const beam = ctx.createLinearGradient(-r * 18, 0, r * 18, 0);
        beam.addColorStop(0, "rgba(111,171,255,0)");
        beam.addColorStop(0.5, `rgba(214,238,255,${q.a * 0.16})`);
        beam.addColorStop(1, "rgba(111,171,255,0)");
        ctx.fillStyle = beam;
        ctx.fillRect(-r * 18, -r * 0.18, r * 36, r * 0.36);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  function drawProtoGalaxies(time) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const g of protoGalaxies) {
      const p = project(g.x, g.y, 0.34, time, g.phase),
        pulse = reducedMotion
          ? 1
          : 0.9 + Math.sin(time * 0.0008 + g.phase) * 0.1;
      for (let k = 0; k < g.pieces; k++) {
        const a = k * 2.399 + g.phase,
          rr = g.r * (0.3 + k * 0.22) * sceneScale();
        glow(
          p.x + Math.cos(a) * rr,
          p.y + Math.sin(a) * rr * 0.6,
          g.r * 2.1 * sceneScale() * pulse,
          `rgba(255,236,191,${g.a * 0.5})`,
          `rgba(255,143,83,${g.a * 0.11})`,
        );
      }
    }
    ctx.restore();
  }

  function drawReionization(time) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const b of ionizedBubbles) {
      const pulse = reducedMotion
        ? 1
        : 0.96 + Math.sin(time * 0.00043 + b.phase) * 0.04;
      const x = b.x * width,
        y = b.y * height,
        rx = b.rx * width * pulse,
        ry = b.ry * height * pulse;
      ctx.save();
      ctx.translate(x, y);
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(rx, ry));
      const c = b.warm > 0.5 ? "255,128,176" : "124,170,255";
      grad.addColorStop(0, `rgba(${c},${b.a * 0.72})`);
      grad.addColorStop(0.68, `rgba(${c},${b.a * 0.2})`);
      grad.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = `rgba(${c},${b.a * 0.55})`;
      ctx.lineWidth = 0.65;
      ctx.setLineDash([2, 6]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
    const neutral = ctx.createLinearGradient(
      0,
      height * 0.325,
      0,
      height * 0.46,
    );
    neutral.addColorStop(0, "rgba(3,8,20,.56)");
    neutral.addColorStop(0.5, "rgba(10,6,18,.12)");
    neutral.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = neutral;
    ctx.fillRect(0, height * 0.325, width, height * 0.14);
    ctx.restore();
  }

  function drawDarkAges(time) {
    const top = height * 0.225,
      bottom = height * 0.335;
    const veil = ctx.createLinearGradient(0, top, 0, bottom);
    veil.addColorStop(0, "rgba(0,1,7,.58)");
    veil.addColorStop(0.48, "rgba(0,1,8,.86)");
    veil.addColorStop(1, "rgba(2,5,14,.46)");
    ctx.fillStyle = veil;
    ctx.fillRect(0, top, width, bottom - top);
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const s of densitySeeds) {
      const pulse = reducedMotion
        ? 1
        : 0.88 + Math.sin(time * 0.0004 + s.phase) * 0.12;
      glow(
        s.x * width,
        s.y * height,
        s.r * 3 * sceneScale(),
        `rgba(124,151,204,${s.a * 0.55 * pulse})`,
        `rgba(77,94,155,${s.a * 0.1})`,
      );
    }
    ctx.restore();
  }

  function drawCMB(time) {
    const top = 0,
      bottom = height * 0.235;
    const base = ctx.createLinearGradient(0, top, 0, bottom);
    base.addColorStop(0, "#5c4737");
    base.addColorStop(0.48, "#3d2e2b");
    base.addColorStop(1, "rgba(22,15,21,.96)");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, width, bottom);
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const s of cmbSpots) {
      const pulse = reducedMotion
        ? 1
        : 0.96 + Math.sin(time * 0.00018 + s.phase) * 0.04;
      const x = s.x * width,
        y = s.y * height,
        rx = s.rx * width * 1.4,
        ry = s.ry * height * 1.3;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(1, ry / Math.max(1, rx));
      const warm = s.v > 0.52,
        c = warm ? "255,190,112" : "104,152,229",
        a = (0.035 + Math.abs(s.v - 0.5) * 0.11) * pulse;
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
      g.addColorStop(0, `rgba(${c},${a})`);
      g.addColorStop(0.72, `rgba(${c},${a * 0.45})`);
      g.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, rx, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    const fade = ctx.createLinearGradient(0, height * 0.17, 0, height * 0.25);
    fade.addColorStop(0, "rgba(57,40,37,0)");
    fade.addColorStop(1, "rgba(1,3,9,1)");
    ctx.fillStyle = fade;
    ctx.fillRect(0, height * 0.17, width, height * 0.09);
  }

  function drawHorizonCue(time) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const pulse = reducedMotion ? 1 : 0.92 + Math.sin(time * 0.00045) * 0.08;
    for (let i = 0; i < 4; i++) {
      const y = height * (0.012 + i * 0.014),
        alpha = (0.12 - i * 0.022) * pulse;
      const g = ctx.createLinearGradient(0, y, width, y);
      g.addColorStop(0, "rgba(255,231,202,0)");
      g.addColorStop(0.5, `rgba(255,234,207,${alpha})`);
      g.addColorStop(1, "rgba(255,231,202,0)");
      ctx.strokeStyle = g;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.quadraticCurveTo(width * 0.5, y + Math.sin(i) * 2, width, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawScientificCues() {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(208,223,255,.17)";
    ctx.font = `700 ${Math.max(7, Math.min(9, width * 0.018))}px Inter,system-ui,sans-serif`;
    ctx.fillText(
      "CUANTO MÁS LEJOS OBSERVAMOS, MÁS ANTIGUA ES LA LUZ",
      width * 0.5,
      height * 0.515,
    );
    ctx.fillStyle = "rgba(255,232,205,.22)";
    ctx.fillText(
      "EL HORIZONTE ES UN LÍMITE DE OBSERVACIÓN · NO UNA PARED",
      width * 0.5,
      height * 0.105,
    );
    ctx.restore();
  }

  function drawBottomContinuity() {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.shadowBlur = 12;
    ctx.shadowColor = "rgba(86,179,255,.3)";
    ctx.fillStyle = "rgba(191,224,255,.48)";
    ctx.font = `800 ${Math.max(8, Math.min(11, width * 0.023))}px Inter,system-ui,sans-serif`;
    ctx.fillText(
      "LA RED CÓSMICA CONTINÚA DEBAJO",
      width * 0.5,
      height - Math.max(8, height * 0.012),
    );
    ctx.restore();
  }

  function drawTopTransition() {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.shadowBlur = 15;
    ctx.shadowColor = "rgba(255,219,180,.36)";
    ctx.fillStyle = "rgba(255,236,215,.6)";
    ctx.font = `800 ${Math.max(8, Math.min(11, width * 0.023))}px Inter,system-ui,sans-serif`;
    ctx.fillText(
      "MÁS ALLÁ DE LA LUZ",
      width * 0.5,
      Math.max(8, height * 0.008),
    );
    ctx.fillStyle = "rgba(255,245,229,.76)";
    ctx.font = `900 ${Math.max(8, Math.min(12, width * 0.026))}px Inter,system-ui,sans-serif`;
    ctx.fillText(
      "INFLACIÓN · ORIGEN CÓSMICO",
      width * 0.5,
      Math.max(22, height * 0.03),
    );
    ctx.fillStyle = "rgba(244,225,207,.55)";
    ctx.font = `760 ${Math.max(7, Math.min(10, width * 0.021))}px Inter,system-ui,sans-serif`;
    ctx.fillText(
      "UNIVERSO NO OBSERVABLE · INFERENCIA, NO DESTINO ESPACIAL",
      width * 0.5,
      Math.max(39, height * 0.052),
    );
    ctx.restore();
  }

  function drawParticles(dt) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= p.decay * dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.pow(0.09, dt);
      p.vy *= Math.pow(0.09, dt);
      const [r, g, b] = p.color;
      ctx.fillStyle = `rgba(${r},${g},${b},${p.life * 0.7})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (0.4 + p.life), 0, TAU);
      ctx.fill();
    }
    for (let i = waves.length - 1; i >= 0; i--) {
      const w = waves[i];
      w.life -= dt * 1.25;
      if (w.life <= 0) {
        waves.splice(i, 1);
        continue;
      }
      w.radius += dt * 128;
      const [r, g, b] = w.color;
      ctx.strokeStyle = `rgba(${r},${g},${b},${w.life * 0.4})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(w.x, w.y, w.radius, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  function draw(time) {
    const dt = Math.min(0.05, Math.max(0, (time - lastTime) / 1000));
    lastTime = time;
    if (!reducedMotion) {
      pointerX += (targetX - pointerX) * 0.08;
      pointerY += (targetY - pointerY) * 0.08;
    } else {
      pointerX = targetX;
      pointerY = targetY;
    }
    drawBackground(time);
    drawCosmicWeb(time);
    drawGalaxies(time);
    drawQuasars(time);
    drawProtoGalaxies(time);
    drawReionization(time);
    drawDarkAges(time);
    drawCMB(time);
    drawHorizonCue(time);
    drawScientificCues();
    drawBottomContinuity();
    drawTopTransition();
    drawParticles(dt);
    raf = requestAnimationFrame(draw);
  }

  function init() {
    resize();
    addEventListener("resize", resize, { passive: true });
    addEventListener("orientationchange", () => setTimeout(resize, 120), {
      passive: true,
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && audioCtx?.state === "running")
        audioCtx.suspend().catch(() => {});
    });
    canvas.focus({ preventScroll: true });
    raf = requestAnimationFrame(draw);
  }
  init();
}
