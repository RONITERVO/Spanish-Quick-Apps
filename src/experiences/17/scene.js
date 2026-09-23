import { createSceneAudio } from "../../shared/audio.js";
import { clamp, mix, smooth, fract, seeded, rgba } from "../../shared/math.js";
import {
  requestSceneFrame as requestAnimationFrame,
  cancelSceneFrame as cancelAnimationFrame,
} from "../../shared/animation.js";
import content from "./content.json";
const { ZONES } = content;

export function mountScene() {
  const canvas = document.getElementById("mind-spectrum");
  const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
  const root = document.documentElement;
  const readout = document.getElementById("readout");
  const evidenceClass = document.getElementById("evidence-class");
  const zoneName = document.getElementById("zone-name");
  const featureName = document.getElementById("feature-name");
  const metric = document.getElementById("metric");
  const fact = document.getElementById("fact");
  const touchOrb = document.getElementById("touch-orb");
  const scaleValue = document.getElementById("scale-value");
  const scaleDot = document.getElementById("scale-dot");
  const hint = document.getElementById("hint");

  const TAU = Math.PI * 2;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let width = 1;
  let height = 1;
  let dpr = 1;
  let pointerDown = false;
  let targetX = 0.5;
  let targetY = 0.965;
  let pointerX = 0.5;
  let pointerY = 0.965;
  let shownX = 0.5;
  let shownY = 0.94;
  let lastZoneId = "";
  let lastFeature = -1;
  let hideTimer = 0;
  let speechTimer = 0;
  let lastSpoken = "";
  window.addEventListener("spectrum:cancel-tts", () => {
    clearTimeout(speechTimer);
    speechTimer = 0;
  });
  let speechUnlocked = false;
  let lastFrame = performance.now();
  let elapsed = 0;
  let currentProgress = 0.018;
  let touchEnergy = 0;

  const motes = [];
  const signals = [];
  const memories = [];
  const nodes = [];
  const branches = [];
  const glyphs = [];
  const people = [];
  const bursts = [];
  const waves = [];

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

  function depthFromY(yNorm) {
    return clamp(1 - yNorm, 0, 1);
  }

  function zoneForDepth(p) {
    for (let i = 0; i < ZONES.length; i++)
      if (p >= ZONES[i].p0 && p < ZONES[i].p1) return ZONES[i];
    return ZONES[ZONES.length - 1];
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

  function setAccent(zone) {
    root.style.setProperty(
      "--accent",
      `${zone.color[0]} ${zone.color[1]} ${zone.color[2]}`,
    );
  }

  function setCssPoint(x, y) {
    root.style.setProperty("--scan-x", `${x}px`);
    root.style.setProperty("--scan-y", `${y}px`);
  }

  function buildScene() {
    motes.length = 0;
    signals.length = 0;
    memories.length = 0;
    nodes.length = 0;
    branches.length = 0;
    glyphs.length = 0;
    people.length = 0;

    const moteCount = reducedMotion
      ? 90
      : Math.round(clamp((width * height) / 5200, 130, 310));
    for (let i = 0; i < moteCount; i++) {
      motes.push({
        x: seeded(i + 1),
        y: seeded(i + 1000),
        vx: (seeded(i + 2000) - 0.5) * 0.034,
        vy: (seeded(i + 3000) - 0.5) * 0.032,
        r: 0.7 + seeded(i + 4000) * 2.5,
        phase: seeded(i + 5000) * TAU,
        kind: i % 11,
      });
    }

    for (let i = 0; i < 56; i++) {
      signals.push({
        x: seeded(i + 6000),
        y: seeded(i + 7000),
        phase: seeded(i + 8000) * TAU,
        speed: 0.25 + seeded(i + 9000) * 0.85,
        band: i % 7,
        amp: 0.25 + seeded(i + 10000) * 0.75,
      });
    }

    for (let i = 0; i < 28; i++) {
      memories.push({
        x: 0.08 + seeded(i + 11000) * 0.84,
        y: 0.12 + seeded(i + 12000) * 0.76,
        w: 0.045 + seeded(i + 13000) * 0.095,
        h: 0.035 + seeded(i + 14000) * 0.075,
        phase: seeded(i + 15000) * TAU,
        age: seeded(i + 16000),
        kind: i % 6,
      });
    }

    for (let i = 0; i < 72; i++) {
      const a = seeded(i + 17000) * TAU;
      const r = Math.sqrt(seeded(i + 18000)) * 0.46;
      nodes.push({
        x: 0.5 + Math.cos(a) * r,
        y: 0.5 + Math.sin(a) * r * 0.8,
        r: 1.5 + seeded(i + 19000) * 4.7,
        phase: seeded(i + 20000) * TAU,
        group: i % 9,
        hub: seeded(i + 21000) > 0.83,
      });
    }

    for (let i = 0; i < 19; i++) {
      branches.push({
        x: 0.1 + seeded(i + 22000) * 0.8,
        bias: (seeded(i + 23000) - 0.5) * 0.44,
        phase: seeded(i + 24000) * TAU,
        weight: 0.45 + seeded(i + 25000) * 0.9,
        kind: i % 5,
      });
    }

    const chars = "Aa¿?∞≈ΣΔidea123abc✦";
    for (let i = 0; i < 46; i++) {
      glyphs.push({
        x: 0.06 + seeded(i + 26000) * 0.88,
        y: 0.08 + seeded(i + 27000) * 0.84,
        char: chars[i % chars.length],
        size: 10 + seeded(i + 28000) * 26,
        phase: seeded(i + 29000) * TAU,
        speed: 0.3 + seeded(i + 30000) * 0.9,
      });
    }

    for (let i = 0; i < 34; i++) {
      people.push({
        x: 0.06 + seeded(i + 31000) * 0.88,
        y: 0.1 + seeded(i + 32000) * 0.78,
        r: 3 + seeded(i + 33000) * 7,
        phase: seeded(i + 34000) * TAU,
        group: i % 6,
        role: i % 4,
      });
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
    buildScene();
    shownX = targetX * width;
    shownY = targetY * height;
    setCssPoint(shownX, shownY);
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
    compressor.threshold.value = -24;
    compressor.knee.value = 20;
    compressor.ratio.value = 5;
    master.connect(compressor).connect(audioCtx.destination);

    droneA = audioCtx.createOscillator();
    droneB = audioCtx.createOscillator();
    droneGain = audioCtx.createGain();
    droneFilter = audioCtx.createBiquadFilter();
    stereo = audioCtx.createStereoPanner
      ? audioCtx.createStereoPanner()
      : audioCtx.createGain();
    droneA.type = "sine";
    droneB.type = "triangle";
    droneGain.gain.value = 0.0001;
    droneFilter.type = "lowpass";
    droneFilter.frequency.value = 850;
    droneFilter.Q.value = 0.8;
    droneA.connect(droneGain);
    droneB.connect(droneGain);
    droneGain.connect(droneFilter).connect(stereo).connect(master);
    droneA.start();
    droneB.start();

    pulseOsc = audioCtx.createOscillator();
    pulseGain = audioCtx.createGain();
    pulseOsc.type = "sine";
    pulseGain.gain.value = 0.0001;
    pulseOsc.connect(pulseGain).connect(master);
    pulseOsc.start();

    const noiseBuffer = audioCtx.createBuffer(
      1,
      audioCtx.sampleRate * 2,
      audioCtx.sampleRate,
    );
    const channel = noiseBuffer.getChannelData(0);
    for (let i = 0; i < channel.length; i++) channel[i] = Math.random() * 2 - 1;
    noiseSource = audioCtx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;
    noiseFilter = audioCtx.createBiquadFilter();
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.value = 1100;
    noiseFilter.Q.value = 0.5;
    noiseGain = audioCtx.createGain();
    noiseGain.gain.value = 0.0001;
    noiseSource.connect(noiseFilter).connect(noiseGain).connect(master);
    noiseSource.start();
  }

  function setAudioFor(zone, xNorm, progress, active) {
    if (!audioCtx || !master) return;
    const now = audioCtx.currentTime;
    const s = zone.sound;
    const base = s.base * (0.93 + xNorm * 0.15);
    droneA.type = s.type;
    droneB.type =
      s.type === "sawtooth" || s.type === "square" ? "triangle" : "sine";
    droneA.frequency.setTargetAtTime(base, now, 0.08);
    droneB.frequency.setTargetAtTime(
      base * (1.498 + progress * 0.009),
      now,
      0.1,
    );
    droneFilter.frequency.setTargetAtTime(
      s.filter * (0.84 + xNorm * 0.28),
      now,
      0.1,
    );
    droneGain.gain.setTargetAtTime(
      active ? 0.012 + progress * 0.006 : 0.0001,
      now,
      0.09,
    );
    pulseOsc.frequency.setTargetAtTime(base * (1.985 + s.pulse), now, 0.08);
    pulseGain.gain.setTargetAtTime(
      active ? 0.0026 + progress * 0.002 : 0.0001,
      now,
      0.1,
    );
    noiseFilter.frequency.setTargetAtTime(s.filter * 1.12, now, 0.1);
    noiseGain.gain.setTargetAtTime(
      active ? Math.max(0.0001, s.noise * 0.06) : 0.0001,
      now,
      0.1,
    );
    if (stereo.pan) stereo.pan.setTargetAtTime((xNorm - 0.5) * 0.7, now, 0.08);
    master.gain.setTargetAtTime(active ? 0.27 : 0.0001, now, 0.09);
  }

  function ping(zone, xNorm, featureIndex = 0) {
    if (!audioCtx || !master) return;
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();
    const pan = audioCtx.createStereoPanner
      ? audioCtx.createStereoPanner()
      : null;
    const scale = [1, 1.125, 1.25, 1.5, 1.667, 2, 2.25, 2.5, 2.75][
      featureIndex % 9
    ];
    osc.type = zone.sound.type;
    osc.frequency.setValueAtTime(
      Math.max(38, zone.sound.base * 2.5 * scale),
      now,
    );
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(36, zone.sound.base * 1.2),
      now + 0.48,
    );
    filter.type = "lowpass";
    filter.frequency.value = Math.max(380, zone.sound.filter * 1.42);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.026, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.56);
    osc.connect(filter).connect(gain);
    if (pan) {
      pan.pan.value = (xNorm - 0.5) * 1.35;
      gain.connect(pan).connect(master);
    } else gain.connect(master);
    osc.start(now);
    osc.stop(now + 0.62);
  }

  function queueSpeech(label) {
    if (
      !speechUnlocked ||
      !("speechSynthesis" in window) ||
      !label ||
      label === lastSpoken
    )
      return;
    clearTimeout(speechTimer);
    speechTimer = setTimeout(() => {
      try {
        speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(label);
        utterance.lang = "es-ES";
        utterance.rate = 0.86;
        utterance.pitch = 1;
        const voices = speechSynthesis.getVoices();
        const voice =
          voices.find((v) => /^es(-|_)/i.test(v.lang)) ||
          voices.find((v) => /spanish|español/i.test(v.name));
        if (voice) utterance.voice = voice;
        speechSynthesis.speak(utterance);
        lastSpoken = label;
      } catch (_) {}
    }, 360);
  }

  function addRipple(x, y) {
    const node = document.createElement("div");
    node.className = "ripple";
    node.style.left = `${x}px`;
    node.style.top = `${y}px`;
    document.body.appendChild(node);
    node.addEventListener("animationend", () => node.remove(), { once: true });
  }

  function addBurst(x, y, color) {
    const count = reducedMotion ? 5 : 13;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * TAU;
      const speed = 18 + Math.random() * 72;
      bursts.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: 0.8 + Math.random() * 2.4,
        life: 1,
        decay: 1 + Math.random() * 0.8,
        color,
      });
    }
    waves.push({ x, y, radius: 5, life: 1, color });
  }

  function updateReadout(x, y, isNewPress = false) {
    const xNorm = clamp(x / width, 0, 0.999999);
    const yNorm = clamp(y / height, 0, 0.999999);
    const progress = depthFromY(yNorm);
    const zone = zoneForDepth(progress);
    const feature = featureFor(zone, xNorm);

    targetX = xNorm;
    targetY = yNorm;
    touchEnergy = 1;
    setCssPoint(x, y);
    setAccent(zone);
    root.style.setProperty("--progress", `${Math.max(1.2, progress * 100)}%`);
    scaleDot.style.bottom = `${48 + progress * Math.max(0, height - 96)}px`;
    touchOrb.style.left = `${x}px`;
    touchOrb.style.top = `${y}px`;
    scaleValue.textContent = zone.className;

    const changed = zone.id !== lastZoneId || feature.index !== lastFeature;
    if (changed || isNewPress) {
      evidenceClass.textContent = zone.className;
      zoneName.textContent = zone.name;
      zoneName.className =
        zone.name.length > 31 ? "long" : zone.name.length > 21 ? "compact" : "";
      featureName.textContent = feature.name;
      metric.textContent = zone.metric;
      fact.textContent = feature.fact || zone.fact;
      ping(zone, xNorm, feature.index);
      addBurst(x, y, zone.color);
      lastZoneId = zone.id;
      lastFeature = feature.index;
    }

    readout.classList.add("visible");
    touchOrb.classList.add("visible");
    document.body.classList.add("active");
    hint.style.display = "none";
    setAudioFor(zone, xNorm, progress, true);
  }

  function releaseInteraction(delay = 1050) {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      readout.classList.remove("visible");
      touchOrb.classList.remove("visible");
      document.body.classList.remove("active");
      const zone = zoneForDepth(depthFromY(targetY));
      setAudioFor(zone, targetX, depthFromY(targetY), false);
    }, delay);
  }

  function endPointer() {
    pointerDown = false;
    releaseInteraction();
  }

  canvas.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    pointerDown = true;
    speechUnlocked = true;
    ensureAudio();
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch (_) {}
    updateReadout(event.clientX, event.clientY, true);
    addRipple(event.clientX, event.clientY);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!pointerDown && event.pointerType !== "mouse") return;
    if (!pointerDown && event.buttons === 0) {
      targetX = clamp(event.clientX / width, 0, 1);
      targetY = clamp(event.clientY / height, 0, 1);
      return;
    }
    event.preventDefault();
    updateReadout(event.clientX, event.clientY);
  });

  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.addEventListener("lostpointercapture", endPointer);

  canvas.addEventListener("keydown", (event) => {
    const keys = [
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "Enter",
      " ",
    ];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    speechUnlocked = true;
    ensureAudio();
    const step = event.shiftKey ? 0.09 : 0.035;
    if (event.key === "ArrowUp") targetY = clamp(targetY - step, 0.005, 0.995);
    if (event.key === "ArrowDown")
      targetY = clamp(targetY + step, 0.005, 0.995);
    if (event.key === "ArrowLeft")
      targetX = clamp(targetX - step, 0.005, 0.995);
    if (event.key === "ArrowRight")
      targetX = clamp(targetX + step, 0.005, 0.995);
    updateReadout(
      targetX * width,
      targetY * height,
      event.key === "Enter" || event.key === " ",
    );
    releaseInteraction(1600);
  });

  function gradientStops(progress) {
    const stops = [
      [
        [18, 11, 20],
        [88, 57, 49],
      ],
      [
        [8, 22, 34],
        [24, 101, 126],
      ],
      [
        [17, 16, 50],
        [89, 74, 151],
      ],
      [
        [28, 24, 25],
        [136, 118, 43],
      ],
      [
        [48, 13, 25],
        [156, 54, 62],
      ],
      [
        [10, 24, 52],
        [44, 92, 150],
      ],
      [
        [8, 34, 30],
        [45, 120, 85],
      ],
      [
        [23, 17, 61],
        [80, 66, 146],
      ],
      [
        [43, 14, 57],
        [145, 62, 151],
      ],
      [
        [10, 34, 56],
        [45, 112, 160],
      ],
      [
        [52, 29, 11],
        [173, 94, 34],
      ],
      [
        [39, 18, 65],
        [132, 66, 163],
      ],
      [
        [52, 20, 38],
        [160, 67, 100],
      ],
      [
        [5, 39, 43],
        [34, 130, 119],
      ],
      [
        [24, 29, 45],
        [113, 135, 167],
      ],
      [
        [5, 34, 50],
        [40, 116, 153],
      ],
      [
        [57, 25, 12],
        [171, 85, 39],
      ],
      [
        [57, 48, 39],
        [197, 171, 126],
      ],
    ];
    const pos = clamp(progress, 0, 0.9999) * (stops.length - 1);
    const i = Math.floor(pos);
    const t = smooth(pos - i);
    const next = Math.min(stops.length - 1, i + 1);
    return [
      stops[i][0].map((v, k) => Math.round(mix(v, stops[next][0][k], t))),
      stops[i][1].map((v, k) => Math.round(mix(v, stops[next][1][k], t))),
    ];
  }

  function drawBackground(progress, time) {
    const [bottom, top] = gradientStops(progress);
    const g = ctx.createLinearGradient(0, height, 0, 0);
    g.addColorStop(0, `rgb(${bottom[0]} ${bottom[1]} ${bottom[2]})`);
    g.addColorStop(
      0.48,
      `rgb(${Math.round((bottom[0] + top[0]) * 0.43)} ${Math.round((bottom[1] + top[1]) * 0.43)} ${Math.round((bottom[2] + top[2]) * 0.43)})`,
    );
    g.addColorStop(1, `rgb(${top[0]} ${top[1]} ${top[2]})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);

    const focusY = mix(height * 0.78, height * 0.25, progress);
    const focusX = mix(
      width * 0.42,
      width * 0.58,
      0.5 + 0.5 * Math.sin(time * 0.08),
    );
    const glow = ctx.createRadialGradient(
      focusX,
      focusY,
      0,
      focusX,
      focusY,
      Math.max(width, height) * 0.74,
    );
    glow.addColorStop(
      0,
      `rgba(${150 + progress * 90},${120 + progress * 100},${190 + progress * 55},${0.08 + progress * 0.08})`,
    );
    glow.addColorStop(0.5, "rgba(110,150,220,.025)");
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    for (let i = 0; i < motes.length; i++) {
      const m = motes[i];
      m.x = fract(m.x + m.vx * 0.0022);
      m.y = fract(m.y + m.vy * 0.0022);
      const x = m.x * width + Math.sin(time * 0.13 + m.phase) * 6;
      const y = m.y * height + Math.cos(time * 0.1 + m.phase) * 6;
      const twinkle =
        0.11 +
        0.2 * (0.5 + 0.5 * Math.sin(time * (0.45 + progress * 0.35) + m.phase));
      const palette =
        m.kind % 4 === 0
          ? [255, 221, 170]
          : m.kind % 4 === 1
            ? [117, 215, 255]
            : m.kind % 4 === 2
              ? [217, 154, 255]
              : [127, 244, 190];
      ctx.fillStyle = rgba(palette, twinkle * (0.6 + progress * 0.5));
      ctx.beginPath();
      ctx.arc(x, y, m.r * (0.72 + progress * 0.32), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function softHalo(cx, cy, radius, color, alpha) {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    g.addColorStop(0, rgba(color, alpha));
    g.addColorStop(0.35, rgba(color, alpha * 0.42));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  }

  function roundedRectPath(x, y, w, h, r) {
    const rr = Math.min(r, w * 0.5, h * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function drawConsciousField(progress, time, alpha) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const s = Math.min(width, height),
      cx = width * 0.5,
      cy = height * 0.52;
    softHalo(cx, cy, s * 0.5, [255, 221, 174], 0.22);
    for (let ring = 0; ring < 9; ring++) {
      const rr = s * (0.055 + ring * 0.031);
      ctx.strokeStyle =
        ring % 2 ? "rgba(224,171,255,.22)" : "rgba(255,232,191,.28)";
      ctx.lineWidth = 1 + (ring % 3) * 0.35;
      ctx.beginPath();
      for (let k = 0; k <= 96; k++) {
        const a = (k / 96) * TAU;
        const wobble =
          1 + 0.045 * Math.sin(a * (2 + ring) + time * (0.24 + ring * 0.018));
        const x = cx + Math.cos(a) * rr * wobble;
        const y = cy + Math.sin(a) * rr * 0.74 * wobble;
        if (!k) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(255,244,222,.62)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.035, cy - s * 0.13);
    ctx.bezierCurveTo(
      cx - s * 0.13,
      cy - s * 0.07,
      cx - s * 0.125,
      cy + s * 0.07,
      cx - s * 0.03,
      cy + s * 0.14,
    );
    ctx.bezierCurveTo(
      cx + s * 0.055,
      cy + s * 0.095,
      cx + s * 0.055,
      cy + s * 0.025,
      cx + s * 0.11,
      cy - s * 0.005,
    );
    ctx.bezierCurveTo(
      cx + s * 0.145,
      cy - s * 0.095,
      cx + s * 0.07,
      cy - s * 0.155,
      cx - s * 0.035,
      cy - s * 0.13,
    );
    ctx.stroke();
    ctx.fillStyle = "rgba(255,248,231,.9)";
    ctx.beginPath();
    ctx.arc(cx + s * 0.035, cy - s * 0.038, 3.1 + Math.sin(time) * 0.7, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawSensation(progress, time, alpha) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const s = Math.min(width, height),
      cx = width * 0.5,
      cy = height * 0.52;
    softHalo(cx, cy, s * 0.46, [107, 218, 255], 0.17);
    for (let band = 0; band < 7; band++) {
      const y0 = height * (0.2 + band * 0.1);
      ctx.strokeStyle =
        band % 3 === 0
          ? "rgba(255,210,128,.34)"
          : band % 3 === 1
            ? "rgba(112,224,255,.32)"
            : "rgba(208,155,255,.3)";
      ctx.lineWidth = 1 + band * 0.13;
      ctx.beginPath();
      for (let k = 0; k <= 90; k++) {
        const t = k / 90;
        const amp = s * (0.015 + band * 0.003);
        const x = t * width;
        const y =
          y0 +
          Math.sin(t * TAU * (2 + band * 0.55) + time * (0.8 + band * 0.08)) *
            amp;
        if (!k) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    const receptorR = s * 0.09;
    ctx.strokeStyle = "rgba(190,239,255,.52)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, receptorR, 0, TAU);
    ctx.stroke();
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * TAU + time * 0.04;
      const rr = receptorR * (1.25 + 0.12 * Math.sin(time + i));
      ctx.strokeStyle =
        i % 2 ? "rgba(120,226,255,.25)" : "rgba(255,220,150,.23)";
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * receptorR, cy + Math.sin(a) * receptorR);
      ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPerception(progress, time, alpha) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const s = Math.min(width, height),
      cx = width * 0.5,
      cy = height * 0.5;
    softHalo(cx, cy, s * 0.52, [173, 157, 255], 0.15);
    const shift = (shownX / Math.max(1, width) - 0.5) * s * 0.06;
    const a = s * 0.15;
    ctx.lineWidth = 2.1;
    ctx.strokeStyle = "rgba(215,204,255,.52)";
    ctx.beginPath();
    ctx.moveTo(cx - a + shift, cy - a * 0.55);
    ctx.lineTo(cx + a * 0.1 + shift, cy - a);
    ctx.lineTo(cx + a + shift, cy - a * 0.35);
    ctx.lineTo(cx + a * 0.35 + shift, cy + a * 0.68);
    ctx.lineTo(cx - a * 0.72 + shift, cy + a * 0.5);
    ctx.closePath();
    ctx.stroke();
    ctx.strokeStyle = "rgba(112,217,255,.47)";
    ctx.beginPath();
    ctx.moveTo(cx - a * 0.42 - shift, cy - a * 0.92);
    ctx.lineTo(cx + a * 0.68 - shift, cy - a * 0.47);
    ctx.lineTo(cx + a * 0.55 - shift, cy + a * 0.52);
    ctx.lineTo(cx - a * 0.55 - shift, cy + a * 0.85);
    ctx.lineTo(cx - a * 0.95 - shift, cy - a * 0.03);
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = "rgba(255,234,174,.12)";
    ctx.beginPath();
    ctx.ellipse(cx - s * 0.06, cy, s * 0.055, s * 0.15, 0.2, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "rgba(160,127,255,.12)";
    ctx.beginPath();
    ctx.ellipse(cx + s * 0.06, cy, s * 0.055, s * 0.15, -0.2, 0, TAU);
    ctx.fill();
    for (let i = 0; i < 8; i++) {
      ctx.strokeStyle = `rgba(215,195,255,${0.08 + i * 0.018})`;
      ctx.beginPath();
      ctx.arc(cx, cy, s * (0.05 + i * 0.035), 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawAttention(progress, time, alpha) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const fx = shownX || width * 0.5,
      fy = shownY || height * 0.5;
    ctx.fillStyle = "rgba(0,0,0,.38)";
    ctx.fillRect(0, 0, width, height);
    const r = Math.min(width, height) * (0.16 + touchEnergy * 0.04);
    const beam = ctx.createRadialGradient(fx, fy, 0, fx, fy, r * 1.7);
    beam.addColorStop(0, "rgba(255,249,202,.4)");
    beam.addColorStop(0.45, "rgba(255,226,116,.12)");
    beam.addColorStop(1, "rgba(255,228,122,0)");
    ctx.fillStyle = beam;
    ctx.fillRect(0, 0, width, height);
    for (let i = 0; i < signals.length; i++) {
      const q = signals[i];
      const x = q.x * width,
        y = q.y * height;
      const d = Math.hypot(x - fx, y - fy);
      const vis = clamp(1 - d / (r * 1.75), 0, 1);
      ctx.fillStyle = `rgba(255,244,174,${0.05 + vis * 0.65})`;
      ctx.beginPath();
      ctx.arc(x, y, 1.2 + q.band * 0.45 + vis * 2, 0, TAU);
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(255,247,205,.42)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(fx, fy, r, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  function drawEmotion(progress, time, alpha) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const s = Math.min(width, height),
      cx = width * 0.5,
      cy = height * 0.52;
    const beat = 1 + 0.045 * Math.sin(time * 2.15);
    softHalo(cx, cy, s * 0.5, [255, 106, 126], 0.2);
    ctx.fillStyle = "rgba(255,113,133,.15)";
    ctx.beginPath();
    ctx.moveTo(cx, cy + s * 0.17);
    ctx.bezierCurveTo(
      cx - s * 0.26,
      cy + s * 0.01,
      cx - s * 0.17,
      cy - s * 0.22,
      cx,
      cy - s * 0.07,
    );
    ctx.bezierCurveTo(
      cx + s * 0.17,
      cy - s * 0.22,
      cx + s * 0.26,
      cy + s * 0.01,
      cx,
      cy + s * 0.17,
    );
    ctx.fill();
    ctx.strokeStyle = "rgba(255,175,160,.58)";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    for (let k = 0; k <= 130; k++) {
      const t = k / 130,
        x = t * width;
      const spike = Math.exp(-Math.pow((t - 0.5) * 18, 2));
      const y =
        cy +
        Math.sin(t * TAU * 3 + time * 0.35) * s * 0.018 -
        spike * s * 0.12 +
        Math.exp(-Math.pow((t - 0.57) * 26, 2)) * s * 0.16;
      if (!k) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    for (let i = 0; i < 7; i++) {
      ctx.strokeStyle =
        i % 2 ? "rgba(255,205,105,.18)" : "rgba(255,125,160,.2)";
      ctx.beginPath();
      ctx.arc(cx, cy, s * (0.06 + i * 0.038) * beat, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawMemory(progress, time, alpha) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const s = Math.min(width, height);
    softHalo(width * 0.5, height * 0.5, s * 0.55, [102, 175, 255], 0.13);
    for (let i = 0; i < memories.length; i++) {
      const m = memories[i];
      const x = m.x * width + Math.sin(time * 0.12 + m.phase) * s * 0.01;
      const y = m.y * height + Math.cos(time * 0.1 + m.phase) * s * 0.008;
      const w = m.w * s,
        h = m.h * s;
      const clarity =
        0.2 + 0.65 * (1 - m.age) + 0.12 * Math.sin(time * 0.4 + m.phase);
      ctx.fillStyle = `rgba(${90 + m.kind * 18},${150 + m.kind * 12},255,${0.035 + clarity * 0.08})`;
      roundedRectPath(x - w / 2, y - h / 2, w, h, 8);
      ctx.fill();
      ctx.strokeStyle = `rgba(155,205,255,${0.11 + clarity * 0.33})`;
      ctx.lineWidth = 1;
      roundedRectPath(x - w / 2, y - h / 2, w, h, 8);
      ctx.stroke();
      if (i % 4 === 0) {
        ctx.strokeStyle = "rgba(255,230,170,.17)";
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(width * 0.5, height * 0.5);
        ctx.stroke();
      }
    }
    ctx.fillStyle = "rgba(225,238,255,.82)";
    ctx.beginPath();
    ctx.arc(width * 0.5, height * 0.5, 4 + Math.sin(time) * 1.2, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawLearning(progress, time, alpha) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const s = Math.min(width, height),
      cx = width * 0.5,
      cy = height * 0.5;
    softHalo(cx, cy, s * 0.52, [105, 235, 153], 0.14);
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i],
        x = a.x * width,
        y = a.y * height;
      const j = (i * 7 + 5) % nodes.length,
        b = nodes[j];
      const pulse =
        0.5 + 0.5 * Math.sin(time * (0.5 + a.group * 0.035) + a.phase);
      ctx.strokeStyle = `rgba(112,240,164,${0.025 + pulse * 0.11})`;
      ctx.lineWidth = 0.7 + (a.hub ? 1.1 : 0);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(b.x * width, b.y * height);
      ctx.stroke();
    }
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i],
        pulse = 0.5 + 0.5 * Math.sin(time * 0.8 + n.phase);
      ctx.fillStyle = n.hub
        ? `rgba(218,255,226,${0.45 + pulse * 0.35})`
        : `rgba(116,244,169,${0.18 + pulse * 0.27})`;
      ctx.beginPath();
      ctx.arc(n.x * width, n.y * height, n.r * (n.hub ? 1.45 : 1), 0, TAU);
      ctx.fill();
    }
    const t = fract(time * 0.12);
    const start = nodes[3],
      end = nodes[42];
    ctx.fillStyle = "rgba(255,247,176,.9)";
    ctx.beginPath();
    ctx.arc(
      mix(start.x, end.x, t) * width,
      mix(start.y, end.y, t) * height,
      3.5,
      0,
      TAU,
    );
    ctx.fill();
    ctx.restore();
  }

  function drawConcepts(progress, time, alpha) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const s = Math.min(width, height);
    const centers = [
      [0.28, 0.35],
      [0.66, 0.31],
      [0.5, 0.67],
    ];
    const cols = [
      [140, 132, 255],
      [110, 205, 255],
      [234, 151, 255],
    ];
    for (let c = 0; c < centers.length; c++) {
      const cx = centers[c][0] * width,
        cy = centers[c][1] * height;
      softHalo(cx, cy, s * 0.22, cols[c], 0.12);
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * TAU + time * 0.03 * (c + 1),
          rr = s * (0.035 + 0.12 * seeded(c * 100 + i + 41000));
        const x = cx + Math.cos(a) * rr,
          y = cy + Math.sin(a) * rr * 0.75;
        ctx.strokeStyle = rgba(cols[c], 0.13);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.fillStyle = rgba(cols[c], 0.35 + 0.25 * Math.sin(time * 0.4 + i));
        ctx.beginPath();
        ctx.arc(x, y, 2 + (i % 3), 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = rgba(cols[c], 0.75);
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, TAU);
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(235,224,255,.18)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(centers[0][0] * width, centers[0][1] * height);
    ctx.lineTo(centers[1][0] * width, centers[1][1] * height);
    ctx.lineTo(centers[2][0] * width, centers[2][1] * height);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  function drawLanguage(progress, time, alpha) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const s = Math.min(width, height);
    softHalo(width * 0.5, height * 0.5, s * 0.55, [233, 140, 255], 0.12);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "700 18px system-ui, sans-serif";
    for (let i = 0; i < glyphs.length; i++) {
      const g = glyphs[i];
      const x =
        g.x * width + Math.sin(time * 0.16 * g.speed + g.phase) * s * 0.015;
      const y =
        g.y * height + Math.cos(time * 0.13 * g.speed + g.phase) * s * 0.012;
      const focus =
        1 - clamp(Math.abs(g.x - shownX / Math.max(1, width)) * 2.5, 0, 1);
      ctx.font = `${Math.round(g.size * (0.72 + focus * 0.38))}px system-ui, sans-serif`;
      ctx.fillStyle = `rgba(247,195,255,${0.08 + focus * 0.4})`;
      ctx.fillText(g.char, x, y);
    }
    const y = height * 0.52;
    ctx.strokeStyle = "rgba(255,217,255,.3)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(width * 0.16, y);
    ctx.bezierCurveTo(
      width * 0.35,
      y - s * 0.1,
      width * 0.65,
      y + s * 0.1,
      width * 0.84,
      y,
    );
    ctx.stroke();
    for (let i = 0; i < 7; i++) {
      const t = i / 6,
        x = mix(width * 0.17, width * 0.83, t),
        yy = y + Math.sin(t * TAU + time * 0.2) * s * 0.055;
      ctx.fillStyle = i % 2 ? "rgba(130,218,255,.72)" : "rgba(248,171,255,.78)";
      ctx.beginPath();
      ctx.arc(x, yy, 4 + (i % 2), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawReasoning(progress, time, alpha) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const s = Math.min(width, height),
      left = width * 0.14,
      right = width * 0.86,
      top = height * 0.18,
      bottom = height * 0.82;
    softHalo(width * 0.5, height * 0.5, s * 0.55, [96, 196, 255], 0.12);
    const pts = [];
    for (let i = 0; i < 9; i++)
      pts.push([
        mix(left, right, seeded(i + 43000)),
        mix(top, bottom, seeded(i + 44000)),
      ]);
    for (let i = 0; i < pts.length; i++) {
      const j = (i * 3 + 2) % pts.length;
      ctx.strokeStyle =
        i % 2 ? "rgba(105,207,255,.23)" : "rgba(220,228,255,.18)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(...pts[i]);
      ctx.lineTo(...pts[j]);
      ctx.stroke();
    }
    for (let i = 0; i < pts.length; i++) {
      ctx.fillStyle =
        i === 8 ? "rgba(255,237,174,.9)" : "rgba(137,218,255,.68)";
      ctx.beginPath();
      ctx.arc(pts[i][0], pts[i][1], i === 8 ? 6 : 3.5, 0, TAU);
      ctx.fill();
    }
    const t = fract(time * 0.1);
    const a = pts[Math.floor(t * 8)],
      b = pts[Math.min(8, Math.floor(t * 8) + 1)],
      lt = fract(t * 8);
    ctx.fillStyle = "rgba(255,250,224,.95)";
    ctx.beginPath();
    ctx.arc(mix(a[0], b[0], lt), mix(a[1], b[1], lt), 3, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawDecisions(progress, time, alpha) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const s = Math.min(width, height),
      cx = width * 0.5,
      y0 = height * 0.82;
    softHalo(cx, height * 0.48, s * 0.56, [255, 178, 82], 0.13);
    for (let i = 0; i < branches.length; i++) {
      const b = branches[i],
        tx = b.x * width,
        ty = height * 0.14 + Math.abs(b.bias) * height * 0.2;
      const selected =
        1 - clamp(Math.abs(b.x - shownX / Math.max(1, width)) * 4, 0, 1);
      ctx.strokeStyle = `rgba(${255 - b.kind * 15},${172 + b.kind * 9},${75 + b.kind * 15},${0.07 + selected * 0.43})`;
      ctx.lineWidth = 0.7 + b.weight + selected * 2;
      ctx.beginPath();
      ctx.moveTo(cx, y0);
      ctx.bezierCurveTo(
        cx + b.bias * width,
        y0 - height * 0.25,
        tx - b.bias * width * 0.2,
        ty + height * 0.18,
        tx,
        ty,
      );
      ctx.stroke();
      ctx.fillStyle = `rgba(255,220,154,${0.18 + selected * 0.66})`;
      ctx.beginPath();
      ctx.arc(tx, ty, 2.5 + selected * 3, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(255,239,198,.92)";
    ctx.beginPath();
    ctx.arc(cx, y0, 6, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawImagination(progress, time, alpha) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const s = Math.min(width, height),
      cx = width * 0.5,
      cy = height * 0.5;
    softHalo(cx, cy, s * 0.62, [203, 126, 255], 0.15);
    for (let layer = 0; layer < 8; layer++) {
      ctx.strokeStyle = `rgba(${205 + layer * 4},${132 + layer * 8},255,${0.11 + layer * 0.013})`;
      ctx.lineWidth = 1 + layer * 0.12;
      ctx.beginPath();
      for (let k = 0; k <= 120; k++) {
        const a = (k / 120) * TAU,
          rr =
            s *
            (0.055 + layer * 0.025) *
            (1 +
              0.16 * Math.sin(a * (3 + layer) + time * (0.2 + layer * 0.03)));
        const x = cx + Math.cos(a) * rr * (1 + layer * 0.05),
          y = cy + Math.sin(a) * rr * 0.72;
        if (!k) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }
    const shapes = 5;
    for (let i = 0; i < shapes; i++) {
      const a = (i / shapes) * TAU + time * 0.07,
        rr = s * 0.28;
      ctx.fillStyle = i % 2 ? "rgba(255,205,136,.14)" : "rgba(120,214,255,.14)";
      ctx.beginPath();
      ctx.arc(
        cx + Math.cos(a) * rr,
        cy + Math.sin(a) * rr * 0.65,
        s * (0.025 + i * 0.004),
        0,
        TAU,
      );
      ctx.fill();
    }
    ctx.restore();
  }

  function drawIdentity(progress, time, alpha) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const s = Math.min(width, height),
      cx = width * 0.5,
      cy = height * 0.47;
    softHalo(cx, cy, s * 0.55, [255, 147, 178], 0.13);
    ctx.strokeStyle = "rgba(255,210,220,.54)";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(cx, cy - s * 0.11, s * 0.07, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy - s * 0.04);
    ctx.bezierCurveTo(
      cx - s * 0.13,
      cy + s * 0.02,
      cx - s * 0.12,
      cy + s * 0.24,
      cx,
      cy + s * 0.29,
    );
    ctx.bezierCurveTo(
      cx + s * 0.12,
      cy + s * 0.24,
      cx + s * 0.13,
      cy + s * 0.02,
      cx,
      cy - s * 0.04,
    );
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,184,205,.22)";
    ctx.beginPath();
    ctx.moveTo(width * 0.12, height * 0.77);
    for (let k = 0; k <= 80; k++) {
      const t = k / 80,
        x = mix(width * 0.12, width * 0.88, t),
        y =
          height * 0.77 -
          Math.sin(t * Math.PI) * height * 0.45 +
          Math.sin(t * TAU * 4 + time * 0.1) * s * 0.012;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
    for (let i = 0; i < 9; i++) {
      const t = i / 8,
        x = mix(width * 0.12, width * 0.88, t),
        y = height * 0.77 - Math.sin(t * Math.PI) * height * 0.45;
      ctx.fillStyle = i % 2 ? "rgba(255,214,165,.7)" : "rgba(255,156,190,.65)";
      ctx.beginPath();
      ctx.arc(x, y, 3 + (i % 3), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawIntelligence(progress, time, alpha) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const s = Math.min(width, height);
    softHalo(width * 0.5, height * 0.5, s * 0.57, [84, 232, 210], 0.13);
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i],
        j = (i * 11 + 9) % nodes.length,
        m = nodes[j];
      const active = (i + Math.floor(time * 2)) % 13 === 0;
      ctx.strokeStyle = active
        ? "rgba(255,243,174,.58)"
        : "rgba(93,231,216,.08)";
      ctx.lineWidth = active ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(n.x * width, n.y * height);
      ctx.lineTo(m.x * width, m.y * height);
      ctx.stroke();
    }
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i],
        active = (i + Math.floor(time * 2)) % 13 === 0;
      ctx.fillStyle = active
        ? "rgba(255,247,200,.9)"
        : n.hub
          ? "rgba(155,255,237,.66)"
          : "rgba(83,221,207,.24)";
      ctx.beginPath();
      ctx.arc(n.x * width, n.y * height, n.r * (n.hub ? 1.45 : 1), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawMetacognition(progress, time, alpha) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const s = Math.min(width, height),
      cx = width * 0.5,
      cy = height * 0.5;
    softHalo(cx, cy, s * 0.58, [203, 221, 255], 0.15);
    for (let ring = 0; ring < 10; ring++) {
      const rr = s * (0.045 + ring * 0.028);
      ctx.strokeStyle =
        ring % 2 ? "rgba(120,210,255,.18)" : "rgba(225,235,255,.23)";
      ctx.lineWidth = 1 + ring * 0.08;
      ctx.beginPath();
      ctx.arc(
        cx,
        cy,
        rr,
        Math.sin(time * 0.08 + ring) * 0.25,
        TAU - Math.cos(time * 0.07 + ring) * 0.3,
      );
      ctx.stroke();
    }
    const angle = time * 0.22;
    ctx.strokeStyle = "rgba(255,245,205,.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(
      cx + Math.cos(angle) * s * 0.27,
      cy + Math.sin(angle) * s * 0.27,
    );
    ctx.stroke();
    ctx.fillStyle = "rgba(255,248,221,.92)";
    ctx.beginPath();
    ctx.arc(
      cx + Math.cos(angle) * s * 0.27,
      cy + Math.sin(angle) * s * 0.27,
      4,
      0,
      TAU,
    );
    ctx.fill();
    ctx.fillStyle = "rgba(218,231,255,.9)";
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawConnected(progress, time, alpha) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const s = Math.min(width, height);
    softHalo(width * 0.5, height * 0.5, s * 0.62, [90, 204, 255], 0.13);
    for (let i = 0; i < people.length; i++) {
      const a = people[i],
        j = (i * 5 + 7) % people.length,
        b = people[j];
      const pulse = 0.5 + 0.5 * Math.sin(time * 0.35 + a.phase);
      ctx.strokeStyle = `rgba(104,211,255,${0.035 + pulse * 0.12})`;
      ctx.lineWidth = 0.8 + (a.role === 0 ? 0.8 : 0);
      ctx.beginPath();
      ctx.moveTo(a.x * width, a.y * height);
      ctx.quadraticCurveTo(
        width * 0.5,
        height * 0.5,
        b.x * width,
        b.y * height,
      );
      ctx.stroke();
    }
    for (let i = 0; i < people.length; i++) {
      const p = people[i],
        x = p.x * width,
        y = p.y * height;
      ctx.fillStyle =
        p.role === 0
          ? "rgba(255,231,171,.78)"
          : p.group % 2
            ? "rgba(116,220,255,.58)"
            : "rgba(193,170,255,.55)";
      ctx.beginPath();
      ctx.arc(x, y, p.r * 0.45, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(214,237,255,.22)";
      ctx.beginPath();
      ctx.arc(x, y + p.r, p.r * 0.8, Math.PI, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCulture(progress, time, alpha) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const s = Math.min(width, height);
    softHalo(width * 0.5, height * 0.5, s * 0.65, [255, 153, 89], 0.14);
    const rows = 5,
      cols = 7;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const x = width * (0.13 + (c / (cols - 1)) * 0.74),
          y = height * (0.18 + (r / (rows - 1)) * 0.64);
        const q = (r * cols + c) % 6;
        ctx.strokeStyle =
          q % 2 ? "rgba(255,184,111,.28)" : "rgba(229,139,255,.2)";
        ctx.lineWidth = 1.2;
        if (q === 0) {
          ctx.beginPath();
          ctx.arc(x, y, s * 0.025, 0, TAU);
          ctx.stroke();
        } else if (q === 1) {
          ctx.strokeRect(x - s * 0.022, y - s * 0.022, s * 0.044, s * 0.044);
        } else if (q === 2) {
          ctx.beginPath();
          ctx.moveTo(x, y - s * 0.03);
          ctx.lineTo(x + s * 0.028, y + s * 0.025);
          ctx.lineTo(x - s * 0.028, y + s * 0.025);
          ctx.closePath();
          ctx.stroke();
        } else if (q === 3) {
          ctx.beginPath();
          ctx.moveTo(x - s * 0.03, y);
          ctx.lineTo(x + s * 0.03, y);
          ctx.moveTo(x, y - s * 0.03);
          ctx.lineTo(x, y + s * 0.03);
          ctx.stroke();
        } else if (q === 4) {
          ctx.beginPath();
          ctx.arc(x, y, s * 0.028, 0, Math.PI);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.moveTo(x - s * 0.025, y + s * 0.02);
          ctx.quadraticCurveTo(x, y - s * 0.04, x + s * 0.025, y + s * 0.02);
          ctx.stroke();
        }
        if (c < cols - 1) {
          ctx.strokeStyle = "rgba(255,204,143,.07)";
          ctx.beginPath();
          ctx.moveTo(x + s * 0.04, y);
          ctx.lineTo(
            width * (0.13 + ((c + 1) / (cols - 1)) * 0.74) - s * 0.04,
            y,
          );
          ctx.stroke();
        }
      }
    ctx.restore();
  }

  function drawKnowledge(progress, time, alpha) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const s = Math.min(width, height),
      cx = width * 0.5,
      cy = height * 0.5;
    softHalo(cx, cy, s * 0.85, [255, 242, 210], 0.22);
    const rings = 11;
    for (let r = 0; r < rings; r++) {
      const rr = s * (0.04 + r * 0.027);
      ctx.strokeStyle = `rgba(255,${225 + r * 2},${176 + r * 5},${0.11 + r * 0.014})`;
      ctx.lineWidth = 1 + r * 0.09;
      ctx.beginPath();
      ctx.arc(cx, cy, rr, 0, TAU);
      ctx.stroke();
      const count = 5 + r;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * TAU + time * (0.018 + r * 0.002),
          x = cx + Math.cos(a) * rr,
          y = cy + Math.sin(a) * rr;
        ctx.fillStyle =
          i % 3 ? "rgba(244,232,207,.46)" : "rgba(126,214,255,.66)";
        ctx.beginPath();
        ctx.arc(x, y, 1.5 + (r % 3), 0, TAU);
        ctx.fill();
      }
    }
    ctx.fillStyle = "rgba(255,250,230,.95)";
    ctx.beginPath();
    ctx.arc(cx, cy, 7 + Math.sin(time * 0.6), 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,249,224,.2)";
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU + time * 0.01;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * s * 0.42, cy + Math.sin(a) * s * 0.42);
      ctx.stroke();
    }
    ctx.restore();
  }

  function zoneWeight(progress, p0, p1, feather = 0.045) {
    const enter = smooth(clamp((progress - (p0 - feather)) / feather, 0, 1));
    const exit = 1 - smooth(clamp((progress - p1) / feather, 0, 1));
    return enter * exit;
  }

  function drawBursts(dt) {
    for (let i = bursts.length - 1; i >= 0; i--) {
      const p = bursts[i];
      p.life -= dt * p.decay;
      if (p.life <= 0) {
        bursts.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.pow(0.94, dt * 60);
      p.vy *= Math.pow(0.94, dt * 60);
      ctx.fillStyle = rgba(p.color, p.life * 0.55);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (0.5 + p.life), 0, TAU);
      ctx.fill();
    }
    for (let i = waves.length - 1; i >= 0; i--) {
      const w = waves[i];
      w.life -= dt * 1.05;
      if (w.life <= 0) {
        waves.splice(i, 1);
        continue;
      }
      w.radius += dt * Math.min(width, height) * 0.24;
      ctx.strokeStyle = rgba(w.color, w.life * 0.25);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(w.x, w.y, w.radius, 0, TAU);
      ctx.stroke();
    }
  }

  function render(now) {
    const dt = Math.min(0.04, Math.max(0.001, (now - lastFrame) / 1000));
    lastFrame = now;
    elapsed += reducedMotion ? dt * 0.24 : dt;
    pointerX += (targetX - pointerX) * (1 - Math.pow(0.001, dt));
    pointerY += (targetY - pointerY) * (1 - Math.pow(0.001, dt));
    currentProgress +=
      (depthFromY(pointerY) - currentProgress) * (1 - Math.pow(0.005, dt));
    shownX += (pointerX * width - shownX) * (1 - Math.pow(0.001, dt));
    shownY += (pointerY * height - shownY) * (1 - Math.pow(0.001, dt));
    touchEnergy *= Math.pow(0.075, dt);

    drawBackground(currentProgress, elapsed);
    drawConsciousField(
      currentProgress,
      elapsed,
      zoneWeight(currentProgress, 0.0, 0.072, 0.035),
    );
    drawSensation(
      currentProgress,
      elapsed,
      zoneWeight(currentProgress, 0.035, 0.13, 0.035),
    );
    drawPerception(
      currentProgress,
      elapsed,
      zoneWeight(currentProgress, 0.09, 0.19, 0.036),
    );
    drawAttention(
      currentProgress,
      elapsed,
      zoneWeight(currentProgress, 0.145, 0.245, 0.036),
    );
    drawEmotion(
      currentProgress,
      elapsed,
      zoneWeight(currentProgress, 0.2, 0.3, 0.036),
    );
    drawMemory(
      currentProgress,
      elapsed,
      zoneWeight(currentProgress, 0.255, 0.355, 0.036),
    );
    drawLearning(
      currentProgress,
      elapsed,
      zoneWeight(currentProgress, 0.31, 0.41, 0.036),
    );
    drawConcepts(
      currentProgress,
      elapsed,
      zoneWeight(currentProgress, 0.365, 0.465, 0.036),
    );
    drawLanguage(
      currentProgress,
      elapsed,
      zoneWeight(currentProgress, 0.42, 0.525, 0.036),
    );
    drawReasoning(
      currentProgress,
      elapsed,
      zoneWeight(currentProgress, 0.48, 0.585, 0.036),
    );
    drawDecisions(
      currentProgress,
      elapsed,
      zoneWeight(currentProgress, 0.535, 0.64, 0.036),
    );
    drawImagination(
      currentProgress,
      elapsed,
      zoneWeight(currentProgress, 0.59, 0.695, 0.036),
    );
    drawIdentity(
      currentProgress,
      elapsed,
      zoneWeight(currentProgress, 0.645, 0.75, 0.036),
    );
    drawIntelligence(
      currentProgress,
      elapsed,
      zoneWeight(currentProgress, 0.7, 0.805, 0.036),
    );
    drawMetacognition(
      currentProgress,
      elapsed,
      zoneWeight(currentProgress, 0.755, 0.86, 0.036),
    );
    drawConnected(
      currentProgress,
      elapsed,
      zoneWeight(currentProgress, 0.81, 0.915, 0.036),
    );
    drawCulture(
      currentProgress,
      elapsed,
      zoneWeight(currentProgress, 0.865, 0.97, 0.034),
    );
    drawKnowledge(
      currentProgress,
      elapsed,
      smooth(clamp((currentProgress - 0.925) / 0.075, 0, 1)),
    );

    drawBursts(dt);
    if (!pointerDown) setAccent(zoneForDepth(currentProgress));
    requestAnimationFrame(render);
  }

  window.addEventListener("resize", resize, { passive: true });
  window.addEventListener("orientationchange", () => setTimeout(resize, 120), {
    passive: true,
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && audioCtx && audioCtx.state === "running")
      audioCtx.suspend().catch(() => {});
  });

  resize();
  setAccent(ZONES[0]);
  requestAnimationFrame(render);
}
