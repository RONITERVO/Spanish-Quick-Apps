import { setReadoutRegion } from "../../shared/narration-target.js";
import { createSceneAudio } from "../../shared/audio.js";
import { clamp, mix, smooth, fract, seeded, rgba } from "../../shared/math.js";
import {
  requestSceneFrame as requestAnimationFrame,
  cancelSceneFrame as cancelAnimationFrame,
} from "../../shared/animation.js";
import content from "./content.json";
const { ZONES } = content;

export function mountScene() {
  const canvas = document.getElementById("complexity-spectrum");
  const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
  const root = document.documentElement;
  const readout = document.getElementById("readout");
  const certaintyClass = document.getElementById("certainty-class");
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
  let targetY = 0.94;
  let pointerX = 0.5;
  let pointerY = 0.94;
  let shownX = width * 0.5;
  let shownY = height * 0.94;
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
  let currentProgress = 0.03;
  let touchEnergy = 0;

  const fieldParticles = [];
  const networkNodes = [];
  const molecules = [];
  const cells = [];
  const bursts = [];
  const waves = [];
  const patternSeeds = [];
  const lineages = [];

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
    for (let i = 0; i < ZONES.length; i++) {
      if (p >= ZONES[i].p0 && p < ZONES[i].p1) return ZONES[i];
    }
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
    fieldParticles.length = 0;
    networkNodes.length = 0;
    molecules.length = 0;
    cells.length = 0;
    patternSeeds.length = 0;
    lineages.length = 0;

    const particleCount = reducedMotion
      ? 90
      : Math.round(clamp((width * height) / 6200, 110, 240));
    for (let i = 0; i < particleCount; i++) {
      fieldParticles.push({
        x: seeded(i + 1),
        y: seeded(i + 1000),
        vx: (seeded(i + 2000) - 0.5) * 0.04,
        vy: (seeded(i + 3000) - 0.5) * 0.04,
        r: 1.1 + seeded(i + 4000) * 2.5,
        phase: seeded(i + 5000) * TAU,
        group: i % 7,
      });
    }

    const nodeCount = reducedMotion ? 28 : 48;
    for (let i = 0; i < nodeCount; i++) {
      const angle = seeded(i + 6000) * TAU;
      const radius = Math.sqrt(seeded(i + 7000)) * 0.43;
      networkNodes.push({
        x: 0.5 + Math.cos(angle) * radius,
        y: 0.5 + Math.sin(angle) * radius * 0.78,
        vx: (seeded(i + 8000) - 0.5) * 0.015,
        vy: (seeded(i + 9000) - 0.5) * 0.015,
        r: 2 + seeded(i + 10000) * 5,
        phase: seeded(i + 11000) * TAU,
        hub: seeded(i + 12000) > 0.84,
        group: i % 5,
      });
    }

    for (let i = 0; i < 30; i++) {
      molecules.push({
        angle: (i / 30) * TAU,
        radius: 0.16 + seeded(i + 13000) * 0.22,
        phase: seeded(i + 14000) * TAU,
        kind: i % 6,
        r: 3 + seeded(i + 15000) * 4,
      });
    }

    for (let i = 0; i < 13; i++) {
      cells.push({
        x: 0.12 + seeded(i + 16000) * 0.76,
        y: 0.2 + seeded(i + 17000) * 0.62,
        r: 0.045 + seeded(i + 18000) * 0.055,
        phase: seeded(i + 19000) * TAU,
        wobble: 0.08 + seeded(i + 20000) * 0.13,
        type: i % 4,
      });
    }

    for (let i = 0; i < 8; i++) {
      patternSeeds.push({
        x: seeded(i + 21000),
        y: seeded(i + 22000),
        phase: seeded(i + 23000) * TAU,
      });
    }

    for (let i = 0; i < 9; i++) {
      lineages.push({
        x: 0.08 + i * 0.105,
        phase: seeded(i + 24000) * TAU,
        branch: seeded(i + 25000),
        variant: i % 5,
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
      active ? 0.013 + progress * 0.006 : 0.0001,
      now,
      0.09,
    );
    pulseOsc.frequency.setTargetAtTime(base * (1.985 + s.pulse), now, 0.08);
    pulseGain.gain.setTargetAtTime(
      active ? 0.0028 + progress * 0.002 : 0.0001,
      now,
      0.1,
    );
    noiseFilter.frequency.setTargetAtTime(s.filter * 1.12, now, 0.1);
    noiseGain.gain.setTargetAtTime(
      active ? Math.max(0.0001, s.noise * 0.065) : 0.0001,
      now,
      0.1,
    );
    if (stereo.pan) stereo.pan.setTargetAtTime((xNorm - 0.5) * 0.7, now, 0.08);
    master.gain.setTargetAtTime(active ? 0.28 : 0.0001, now, 0.09);
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
    const scale = [1, 1.125, 1.25, 1.5, 1.667, 2, 2.25, 2.5][featureIndex % 8];
    osc.type = zone.sound.type;
    osc.frequency.setValueAtTime(
      Math.max(36, zone.sound.base * 2.65 * scale),
      now,
    );
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(34, zone.sound.base * 1.18),
      now + 0.48,
    );
    filter.type = "lowpass";
    filter.frequency.value = Math.max(350, zone.sound.filter * 1.45);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.027, now + 0.012);
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
    root.style.setProperty("--progress-number", `${progress}`);
    scaleDot.style.bottom = `${48 + progress * Math.max(0, height - 96)}px`;

    touchOrb.style.left = `${x}px`;
    touchOrb.style.top = `${y}px`;
    scaleValue.textContent = zone.className;

    const changed = zone.id !== lastZoneId || feature.index !== lastFeature;
    if (changed || isNewPress) {
      certaintyClass.textContent = zone.className;
      setReadoutRegion(readout, zone.id);
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
    if (!pointerDown && event.pointerType === "mouse" && event.buttons === 0) {
      targetX = clamp(event.clientX / width, 0, 1);
      targetY = clamp(event.clientY / height, 0, 1);
      return;
    }
    event.preventDefault();
    updateReadout(event.clientX, event.clientY, false);
  });

  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.addEventListener("lostpointercapture", () => {
    pointerDown = false;
  });
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  canvas.addEventListener("keydown", (event) => {
    const keys = [
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      " ",
      "Enter",
    ];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    speechUnlocked = true;
    ensureAudio();
    const stepY = event.shiftKey ? 0.075 : 0.032;
    const stepX = event.shiftKey ? 0.12 : 0.065;
    if (event.key === "ArrowUp") targetY = clamp(targetY - stepY, 0.005, 0.995);
    if (event.key === "ArrowDown")
      targetY = clamp(targetY + stepY, 0.005, 0.995);
    if (event.key === "ArrowLeft")
      targetX = clamp(targetX - stepX, 0.005, 0.995);
    if (event.key === "ArrowRight")
      targetX = clamp(targetX + stepX, 0.005, 0.995);
    updateReadout(targetX * width, targetY * height, true);
    if (event.key === " " || event.key === "Enter")
      addRipple(targetX * width, targetY * height);
    releaseInteraction(1450);
  });

  function drawBackground(progress, time) {
    const zone = zoneForDepth(progress);
    const idx = ZONES.indexOf(zone);
    const next = ZONES[Math.min(ZONES.length - 1, idx + 1)];
    const local = smooth(
      clamp((progress - zone.p0) / Math.max(0.0001, zone.p1 - zone.p0), 0, 1),
    );
    const c = [
      mix(zone.color[0], next.color[0], local),
      mix(zone.color[1], next.color[1], local),
      mix(zone.color[2], next.color[2], local),
    ];

    const g = ctx.createLinearGradient(0, height, 0, 0);
    g.addColorStop(
      0,
      `rgb(${Math.floor(c[0] * 0.025 + 2)},${Math.floor(c[1] * 0.025 + 2)},${Math.floor(c[2] * 0.035 + 6)})`,
    );
    g.addColorStop(
      0.46,
      `rgb(${Math.floor(c[0] * 0.04 + 2)},${Math.floor(c[1] * 0.035 + 2)},${Math.floor(c[2] * 0.055 + 6)})`,
    );
    g.addColorStop(
      1,
      `rgb(${Math.floor(c[0] * 0.075 + 2)},${Math.floor(c[1] * 0.08 + 3)},${Math.floor(c[2] * 0.07 + 7)})`,
    );
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);

    const px = pointerX * width;
    const py = pointerY * height;
    const glow = ctx.createRadialGradient(
      px,
      py,
      0,
      px,
      py,
      Math.max(width, height) * 0.7,
    );
    glow.addColorStop(0, rgba(c, 0.11 + touchEnergy * 0.09));
    glow.addColorStop(0.4, rgba(c, 0.045));
    glow.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    const topGlow = ctx.createRadialGradient(
      width * 0.5,
      -height * 0.08,
      0,
      width * 0.5,
      0,
      height * 0.72,
    );
    topGlow.addColorStop(0, `rgba(130,255,178,${0.035 + progress * 0.09})`);
    topGlow.addColorStop(1, "rgba(130,255,178,0)");
    ctx.fillStyle = topGlow;
    ctx.fillRect(0, 0, width, height);

    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = rgba(c, 0.18);
    ctx.lineWidth = 1;
    const spacing = Math.max(34, Math.min(78, width / 9));
    const drift = (time * 8) % spacing;
    for (let y = height + drift; y > -spacing; y -= spacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y - progress * spacing * 0.55);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawRuleField(progress, time, alpha) {
    if (alpha <= 0.001) return;
    const cols = Math.max(8, Math.floor(width / 64));
    const rows = Math.max(12, Math.floor(height / 58));
    const cellW = width / cols;
    const cellH = height / rows;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 1;
    for (let r = 0; r <= rows; r++) {
      ctx.strokeStyle = `rgba(125,181,255,${0.08 + 0.02 * Math.sin(time + r)})`;
      ctx.beginPath();
      for (let c = 0; c <= cols; c++) {
        const x = c * cellW;
        const y = r * cellH + Math.sin(c * 0.7 + r * 0.35 + time * 0.7) * 2;
        if (c === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    for (let c = 0; c <= cols; c++) {
      ctx.strokeStyle = "rgba(178,215,255,.065)";
      ctx.beginPath();
      ctx.moveTo(c * cellW, 0);
      ctx.lineTo(c * cellW + Math.sin(c + time) * 3, height);
      ctx.stroke();
    }

    const centerX = width * 0.5;
    const centerY = height * 0.56;
    for (let k = 0; k < 4; k++) {
      const rr =
        Math.min(width, height) *
        (0.09 + k * 0.07 + 0.008 * Math.sin(time * 0.8 + k));
      ctx.strokeStyle = `rgba(176,212,255,${0.14 - k * 0.02})`;
      ctx.beginPath();
      ctx.arc(centerX, centerY, rr, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawSymmetryBreaking(progress, time, alpha) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const size = Math.max(30, Math.min(52, width / 9));
    const cols = Math.ceil(width / size) + 1;
    const rows = Math.ceil(height / size) + 1;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * size + size * 0.5;
        const y = r * size + size * 0.5;
        const n = Math.sin(
          c * 0.83 + r * 0.61 + Math.sin(r * 0.29) * 2.2 + time * 0.05,
        );
        const domain = n > 0.18 ? 1 : n < -0.18 ? -1 : 0;
        const angle =
          domain * 0.72 + Math.sin(c * 0.21 + r * 0.17 + time * 0.5) * 0.08;
        ctx.strokeStyle =
          domain > 0
            ? "rgba(126,125,255,.35)"
            : domain < 0
              ? "rgba(92,224,240,.3)"
              : "rgba(255,255,255,.18)";
        ctx.lineWidth = domain === 0 ? 1 : 1.6;
        ctx.beginPath();
        ctx.moveTo(
          x - Math.cos(angle) * size * 0.23,
          y - Math.sin(angle) * size * 0.23,
        );
        ctx.lineTo(
          x + Math.cos(angle) * size * 0.23,
          y + Math.sin(angle) * size * 0.23,
        );
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(
          x + Math.cos(angle) * size * 0.23,
          y + Math.sin(angle) * size * 0.23,
          2.2,
          0,
          TAU,
        );
        ctx.fillStyle = ctx.strokeStyle;
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawMatter(progress, time, alpha) {
    if (alpha <= 0.001) return;
    const phase = clamp((progress - 0.18) / 0.065, 0, 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    for (let i = 0; i < fieldParticles.length; i++) {
      const p = fieldParticles[i];
      let x;
      let y;
      const gridCols = Math.max(
        12,
        Math.floor(Math.sqrt((fieldParticles.length * width) / height)),
      );
      const gridRows = Math.ceil(fieldParticles.length / gridCols);
      const gx = ((i % gridCols) + 0.5) / gridCols;
      const gy = (Math.floor(i / gridCols) + 0.5) / gridRows;
      const solidMix = 1 - smooth(clamp(phase * 1.8, 0, 1));
      const liquidMix = 1 - Math.abs(phase - 0.5) * 2;
      x = mix(p.x, gx, solidMix);
      y = mix(p.y, gy, solidMix);
      x +=
        Math.sin(time * (1.1 + p.group * 0.05) + p.phase) *
        (0.004 + 0.016 * phase) *
        (liquidMix + phase);
      y +=
        Math.cos(time * (1.25 + p.group * 0.04) + p.phase) *
        (0.004 + 0.014 * phase) *
        (liquidMix + phase);
      const px = x * width;
      const py = y * height;
      const r = p.r * (1 + phase * 0.25);
      ctx.fillStyle = `rgba(89,211,237,${0.18 + 0.25 * (1 - phase * 0.4)})`;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, TAU);
      ctx.fill();
      if (solidMix > 0.35 && i % 2 === 0) {
        const j = i + 1;
        if (j < fieldParticles.length && j % gridCols !== 0) {
          ctx.strokeStyle = `rgba(113,220,240,${0.08 * solidMix})`;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(
            (((j % gridCols) + 0.5) / gridCols) * width,
            ((Math.floor(j / gridCols) + 0.5) / gridRows) * height,
          );
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  function drawEnergyFlow(progress, time, alpha) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const lanes = 10;
    for (let i = 0; i < lanes; i++) {
      const x0 = ((i + 0.5) / lanes) * width;
      ctx.beginPath();
      for (let k = 0; k <= 28; k++) {
        const t = k / 28;
        const y = height * (1.05 - t * 1.12);
        const x =
          x0 +
          Math.sin(t * TAU * 1.8 + time * 0.9 + i * 0.8) *
            width *
            (0.018 + 0.014 * t);
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      const grad = ctx.createLinearGradient(0, height, 0, 0);
      grad.addColorStop(0, "rgba(255,116,72,.05)");
      grad.addColorStop(0.48, "rgba(66,232,206,.34)");
      grad.addColorStop(1, "rgba(105,255,177,.04)");
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.2 + (i % 3) * 0.55;
      ctx.stroke();
    }
    for (let i = 0; i < 32; i++) {
      const t = fract(time * (0.05 + (i % 5) * 0.006) + seeded(i + 26000));
      const lane = i % lanes;
      const y = height * (1.04 - t * 1.1);
      const x0 = ((lane + 0.5) / lanes) * width;
      const x =
        x0 +
        Math.sin(t * TAU * 1.8 + time * 0.9 + lane * 0.8) *
          width *
          (0.018 + 0.014 * t);
      ctx.fillStyle = `rgba(81,242,202,${0.18 + 0.35 * Math.sin(t * Math.PI)})`;
      ctx.beginPath();
      ctx.arc(x, y, 1.4 + 2 * Math.sin(t * Math.PI), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawFluctuations(progress, time, alpha) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    for (let i = 0; i < fieldParticles.length; i += 2) {
      const p = fieldParticles[i];
      const x =
        p.x * width + Math.sin(time * 4.3 + p.phase) * (4 + p.group * 1.5);
      const y =
        p.y * height +
        Math.cos(time * 3.7 + p.phase * 1.7) * (4 + p.group * 1.2);
      const pulse = 0.5 + 0.5 * Math.sin(time * 6 + p.phase);
      ctx.fillStyle = `rgba(93,247,184,${0.05 + 0.24 * pulse})`;
      ctx.beginPath();
      ctx.arc(x, y, 0.7 + p.r * pulse, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPatterns(progress, time, alpha) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const step = Math.max(9, Math.min(18, width / 32));
    const mode = clamp((progress - 0.365) / 0.07, 0, 1);
    for (let y = -step; y <= height + step; y += step) {
      for (let x = -step; x <= width + step; x += step) {
        const nx = x / Math.max(width, 1);
        const ny = y / Math.max(height, 1);
        const stripes = Math.sin(
          nx * 29 + Math.sin(ny * 9 + time * 0.35) * 2.8,
        );
        const spots =
          Math.sin(nx * 20 + Math.sin(ny * 16)) +
          Math.cos(ny * 23 - time * 0.25);
        const spiralAngle = Math.atan2(ny - 0.5, nx - 0.5);
        const spiralRadius = Math.hypot((nx - 0.5) * 1.25, ny - 0.5);
        const spiral = Math.sin(
          spiralAngle * 4 + spiralRadius * 35 - time * 1.4,
        );
        const v = mix(stripes, mix(spots * 0.5, spiral, mode), mode);
        if (v > 0.2) {
          const a = clamp((v - 0.2) * 0.22, 0.02, 0.24);
          ctx.fillStyle = `rgba(164,246,108,${a})`;
          const r = step * (0.14 + 0.25 * clamp(v, 0, 1));
          ctx.beginPath();
          ctx.arc(x, y, r, 0, TAU);
          ctx.fill();
        }
      }
    }
    for (const seed of patternSeeds) {
      const x = seed.x * width;
      const y = seed.y * height;
      for (let k = 0; k < 3; k++) {
        const r =
          fract(time * 0.08 + seed.phase / TAU + k / 3) *
          Math.min(width, height) *
          0.25;
        ctx.strokeStyle = `rgba(151,246,116,${0.2 * (1 - r / (Math.min(width, height) * 0.25))})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawFeedback(progress, time, alpha) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const cx = width * 0.5;
    const cy = height * 0.52;
    const maxR = Math.min(width, height) * 0.37;
    for (let i = 0; i < 7; i++) {
      const r =
        maxR *
        (0.18 + i * 0.115) *
        (1 + 0.035 * Math.sin(time * (1.2 + i * 0.05) + i));
      ctx.strokeStyle = i % 2 ? "rgba(247,232,83,.22)" : "rgba(255,167,80,.2)";
      ctx.lineWidth = 1.2 + (i % 3) * 0.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI * 0.2, Math.PI * 1.54);
      ctx.stroke();
      const a = time * (0.35 + i * 0.03) + i;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      ctx.fillStyle = "rgba(255,239,96,.72)";
      ctx.beginPath();
      ctx.arc(x, y, 2.2 + (i % 2), 0, TAU);
      ctx.fill();
    }
    const signal = 0.5 + 0.5 * Math.sin(time * 2.2);
    ctx.fillStyle = `rgba(255,224,92,${0.07 + signal * 0.17})`;
    ctx.beginPath();
    ctx.arc(cx, cy, maxR * (0.1 + signal * 0.055), 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawNetwork(progress, time, alpha) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const pts = networkNodes;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const ax = a.x * width + Math.sin(time * 0.32 + a.phase) * width * 0.008;
      const ay =
        a.y * height + Math.cos(time * 0.27 + a.phase) * height * 0.008;
      let links = 0;
      for (let j = i + 1; j < pts.length; j++) {
        const b = pts[j];
        const bx =
          b.x * width + Math.sin(time * 0.32 + b.phase) * width * 0.008;
        const by =
          b.y * height + Math.cos(time * 0.27 + b.phase) * height * 0.008;
        const dx = bx - ax;
        const dy = by - ay;
        const dist = Math.hypot(dx, dy);
        const threshold =
          Math.min(width, height) * (a.hub || b.hub ? 0.25 : 0.155);
        if (dist < threshold && links < (a.hub ? 8 : 4)) {
          const pulse = fract(time * 0.11 + seeded(i * 91 + j * 17));
          ctx.strokeStyle = `rgba(255,173,78,${0.04 + (1 - dist / threshold) * 0.17})`;
          ctx.lineWidth = 0.7 + (a.hub || b.hub ? 0.6 : 0);
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.stroke();
          const sx = mix(ax, bx, pulse);
          const sy = mix(ay, by, pulse);
          ctx.fillStyle = `rgba(255,208,106,${0.18 + 0.4 * Math.sin(pulse * Math.PI)})`;
          ctx.beginPath();
          ctx.arc(sx, sy, 1.2, 0, TAU);
          ctx.fill();
          links++;
        }
      }
    }
    for (const n of pts) {
      const x = n.x * width + Math.sin(time * 0.32 + n.phase) * width * 0.008;
      const y = n.y * height + Math.cos(time * 0.27 + n.phase) * height * 0.008;
      const pulse = 0.7 + 0.3 * Math.sin(time * 1.1 + n.phase);
      ctx.fillStyle = n.hub
        ? `rgba(255,192,82,${0.48 * pulse})`
        : `rgba(255,144,94,${0.28 * pulse})`;
      ctx.beginPath();
      ctx.arc(x, y, n.r * (n.hub ? 1.35 : 1), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawSelfOrganization(progress, time, alpha) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const centerX = width * (0.5 + 0.06 * Math.sin(time * 0.17));
    const centerY = height * (0.5 + 0.04 * Math.cos(time * 0.2));
    const count = reducedMotion ? 36 : 74;
    for (let i = 0; i < count; i++) {
      const phase = seeded(i + 27000) * TAU;
      const radius =
        Math.sqrt(seeded(i + 28000)) * Math.min(width, height) * 0.34;
      const angle =
        phase +
        time * (0.12 + seeded(i + 29000) * 0.16) +
        Math.sin(time * 0.3 + phase) * 0.25;
      const x =
        centerX +
        Math.cos(angle) * radius * (1 + 0.09 * Math.sin(time + phase));
      const y = centerY + Math.sin(angle) * radius * 0.68;
      const heading = angle + Math.PI * 0.54;
      const size = 3 + seeded(i + 30000) * 5;
      ctx.fillStyle = `rgba(255,137,95,${0.13 + 0.28 * seeded(i + 31000)})`;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(heading) * size, y + Math.sin(heading) * size);
      ctx.lineTo(
        x + Math.cos(heading + 2.45) * size * 0.68,
        y + Math.sin(heading + 2.45) * size * 0.68,
      );
      ctx.lineTo(
        x + Math.cos(heading - 2.45) * size * 0.68,
        y + Math.sin(heading - 2.45) * size * 0.68,
      );
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawFunctionalInformation(progress, time, alpha) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const bands = 5;
    for (let b = 0; b < bands; b++) {
      const y0 = height * (0.25 + b * 0.13);
      ctx.strokeStyle = `rgba(255,104,139,${0.12 + b * 0.015})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let i = 0; i <= 70; i++) {
        const t = i / 70;
        const x = t * width;
        const y =
          y0 +
          Math.sin(t * TAU * (2 + b * 0.45) + time * (0.55 + b * 0.08)) *
            (13 + b * 2);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      for (let i = 0; i < 22; i++) {
        const t = fract(i / 22 + time * (0.018 + b * 0.002));
        const x = t * width;
        const y =
          y0 +
          Math.sin(t * TAU * (2 + b * 0.45) + time * (0.55 + b * 0.08)) *
            (13 + b * 2);
        const bit = seeded(i + b * 100 + 32000) > 0.5;
        ctx.fillStyle = bit ? "rgba(255,123,166,.58)" : "rgba(255,211,226,.32)";
        ctx.fillRect(x - 2, y - 2, 4, 4);
      }
    }
    const cx = width * 0.5;
    const cy = height * 0.5;
    const r = Math.min(width, height) * 0.08;
    ctx.strokeStyle = "rgba(255,150,183,.3)";
    ctx.beginPath();
    ctx.arc(cx, cy, r * (1 + 0.08 * Math.sin(time * 1.4)), 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  function drawOrganizedChemistry(progress, time, alpha) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const cx = width * 0.5;
    const cy = height * 0.51;
    const scale = Math.min(width, height);
    for (let i = 0; i < molecules.length; i++) {
      const m = molecules[i];
      const angle = m.angle + time * (0.08 + (m.kind % 3) * 0.025);
      const rr = m.radius * scale * (1 + 0.04 * Math.sin(time + m.phase));
      const x = cx + Math.cos(angle) * rr;
      const y = cy + Math.sin(angle) * rr * 0.72;
      const next = molecules[(i + 1) % molecules.length];
      const na = next.angle + time * (0.08 + (next.kind % 3) * 0.025);
      const nr = next.radius * scale * (1 + 0.04 * Math.sin(time + next.phase));
      const nx = cx + Math.cos(na) * nr;
      const ny = cy + Math.sin(na) * nr * 0.72;
      if (i % 2 === 0) {
        ctx.strokeStyle = "rgba(236,91,196,.12)";
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(cx, cy, nx, ny);
        ctx.stroke();
      }
      const colors = [
        "rgba(239,91,195,.55)",
        "rgba(134,116,255,.48)",
        "rgba(255,174,88,.46)",
        "rgba(99,231,198,.42)",
      ];
      ctx.fillStyle = colors[m.kind % colors.length];
      ctx.beginPath();
      ctx.arc(x, y, m.r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.38)";
      ctx.beginPath();
      ctx.arc(
        x - m.r * 0.28,
        y - m.r * 0.25,
        Math.max(0.7, m.r * 0.23),
        0,
        TAU,
      );
      ctx.fill();
    }
    for (let k = 0; k < 4; k++) {
      const r = scale * (0.09 + k * 0.055);
      const start = time * (0.2 + k * 0.04) + k;
      ctx.strokeStyle = `rgba(245,101,200,${0.15 - k * 0.02})`;
      ctx.beginPath();
      ctx.arc(cx, cy, r, start, start + Math.PI * 1.5);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawReplication(progress, time, alpha) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const rows = 5;
    for (let r = 0; r < rows; r++) {
      const y = height * (0.2 + r * 0.15);
      const copyOffset = Math.sin(time * 0.35 + r) * 8;
      for (let i = 0; i < 24; i++) {
        const x = width * (0.08 + (i / 26) * 0.84);
        const bit = seeded(r * 100 + i + 33000) > 0.48;
        const mutation = i === (r * 7 + 5) % 24 && r > 1;
        ctx.fillStyle = mutation
          ? "rgba(255,223,94,.85)"
          : bit
            ? "rgba(195,103,241,.62)"
            : "rgba(114,146,255,.42)";
        const yy =
          y + Math.sin(i * 0.55 + time * 0.7 + r) * 4 + copyOffset * 0.2;
        ctx.beginPath();
        ctx.arc(x, yy, mutation ? 4.4 : 3.1, 0, TAU);
        ctx.fill();
        if (i > 0) {
          const px = width * (0.08 + ((i - 1) / 26) * 0.84);
          const py =
            y +
            Math.sin((i - 1) * 0.55 + time * 0.7 + r) * 4 +
            copyOffset * 0.2;
          ctx.strokeStyle = "rgba(199,122,241,.18)";
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(x, yy);
          ctx.stroke();
        }
      }
      if (r < rows - 1) {
        const t = fract(time * 0.1 + r * 0.21);
        ctx.strokeStyle = `rgba(210,126,242,${0.16 * Math.sin(t * Math.PI)})`;
        ctx.beginPath();
        ctx.moveTo(width * (0.18 + t * 0.62), y + 12);
        ctx.lineTo(width * (0.22 + t * 0.58), y + height * 0.15 - 12);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawProtocells(progress, time, alpha) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const scale = Math.min(width, height);
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      const x = c.x * width + Math.sin(time * 0.22 + c.phase) * scale * 0.015;
      const y = c.y * height + Math.cos(time * 0.19 + c.phase) * scale * 0.012;
      const r = c.r * scale * (1 + c.wobble * Math.sin(time * 0.6 + c.phase));
      ctx.strokeStyle = `rgba(138,136,255,${0.25 + (i % 3) * 0.05})`;
      ctx.lineWidth = 1.4 + (i % 2) * 0.7;
      ctx.beginPath();
      const steps = 48;
      for (let k = 0; k <= steps; k++) {
        const a = (k / steps) * TAU;
        const wobble =
          1 + 0.07 * Math.sin(a * (3 + c.type) + time * 0.55 + c.phase);
        const px = x + Math.cos(a) * r * wobble;
        const py = y + Math.sin(a) * r * wobble;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
      const fill = ctx.createRadialGradient(
        x - r * 0.25,
        y - r * 0.3,
        0,
        x,
        y,
        r,
      );
      fill.addColorStop(0, "rgba(173,158,255,.14)");
      fill.addColorStop(1, "rgba(96,113,255,.025)");
      ctx.fillStyle = fill;
      ctx.fill();
      for (let k = 0; k < 6 + c.type; k++) {
        const a =
          c.phase + (k / (6 + c.type)) * TAU + time * (0.2 + c.type * 0.02);
        const rr = r * (0.2 + 0.48 * seeded(i * 40 + k + 34000));
        ctx.fillStyle =
          k % 3 === 0 ? "rgba(247,112,196,.55)" : "rgba(95,231,198,.43)";
        ctx.beginPath();
        ctx.arc(
          x + Math.cos(a) * rr,
          y + Math.sin(a) * rr,
          1.6 + (k % 2) * 1.3,
          0,
          TAU,
        );
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawChemicalEvolution(progress, time, alpha) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    for (let i = 0; i < lineages.length; i++) {
      const l = lineages[i];
      const startX = l.x * width;
      const bottomY = height * 0.86;
      const topY = height * 0.12;
      ctx.strokeStyle = `rgba(${95 + l.variant * 25},${175 + (l.variant % 2) * 30},255,${0.15 + i * 0.004})`;
      ctx.lineWidth = 1.2 + (i % 3) * 0.45;
      ctx.beginPath();
      ctx.moveTo(startX, bottomY);
      let x = startX;
      for (let k = 1; k <= 14; k++) {
        const t = k / 14;
        x =
          startX +
          Math.sin(t * 7 + l.phase) * width * 0.035 +
          (t > 0.55 ? (l.branch - 0.5) * width * 0.1 : 0);
        const y = mix(bottomY, topY, t);
        ctx.lineTo(x, y);
        if ((k + i) % 5 === 0) {
          ctx.moveTo(x, y);
          ctx.lineTo(
            x + (seeded(i * 20 + k + 35000) - 0.5) * width * 0.12,
            y - height * 0.07,
          );
          ctx.moveTo(x, y);
        }
      }
      ctx.stroke();
      const pulse = fract(time * 0.06 + i / lineages.length);
      const y = mix(bottomY, topY, pulse);
      const px =
        startX +
        Math.sin(pulse * 7 + l.phase) * width * 0.035 +
        (pulse > 0.55 ? (l.branch - 0.5) * width * 0.1 : 0);
      ctx.fillStyle = `rgba(113,190,255,${0.3 + 0.35 * Math.sin(pulse * Math.PI)})`;
      ctx.beginPath();
      ctx.arc(px, y, 2.5 + 2 * Math.sin(pulse * Math.PI), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawLifeThreshold(progress, time, alpha) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const cx = width * 0.5;
    const cy = height * 0.48;
    const scale = Math.min(width, height);
    const r = scale * (0.15 + 0.012 * Math.sin(time * 0.55));
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.8);
    glow.addColorStop(0, "rgba(127,255,171,.22)");
    glow.addColorStop(0.36, "rgba(105,230,177,.08)");
    glow.addColorStop(1, "rgba(105,230,177,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 2.8, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = "rgba(141,255,182,.52)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let k = 0; k <= 90; k++) {
      const a = (k / 90) * TAU;
      const wobble =
        1 +
        0.045 * Math.sin(a * 5 + time * 0.7) +
        0.025 * Math.sin(a * 9 - time * 0.4);
      const x = cx + Math.cos(a) * r * wobble;
      const y = cy + Math.sin(a) * r * wobble;
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();

    const inner = 18;
    for (let i = 0; i < inner; i++) {
      const a = (i / inner) * TAU + time * (0.08 + (i % 4) * 0.01);
      const rr = r * (0.16 + 0.62 * seeded(i + 36000));
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      ctx.fillStyle =
        i % 4 === 0
          ? "rgba(255,129,192,.7)"
          : i % 3 === 0
            ? "rgba(255,221,91,.62)"
            : "rgba(113,235,194,.58)";
      ctx.beginPath();
      ctx.arc(x, y, 2 + (i % 3), 0, TAU);
      ctx.fill();
      const j = (i + 5) % inner;
      const aj = (j / inner) * TAU + time * (0.08 + (j % 4) * 0.01);
      const rrj = r * (0.16 + 0.62 * seeded(j + 36000));
      ctx.strokeStyle = "rgba(149,255,187,.1)";
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(cx + Math.cos(aj) * rrj, cy + Math.sin(aj) * rrj);
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

    drawRuleField(
      currentProgress,
      elapsed,
      zoneWeight(currentProgress, 0, 0.12, 0.05),
    );
    drawSymmetryBreaking(
      currentProgress,
      elapsed,
      zoneWeight(currentProgress, 0.09, 0.2, 0.045),
    );
    drawMatter(
      currentProgress,
      elapsed,
      zoneWeight(currentProgress, 0.16, 0.27, 0.04),
    );
    drawEnergyFlow(
      currentProgress,
      elapsed,
      zoneWeight(currentProgress, 0.22, 0.35, 0.045),
    );
    drawFluctuations(
      currentProgress,
      elapsed,
      zoneWeight(currentProgress, 0.29, 0.39, 0.04),
    );
    drawPatterns(
      currentProgress,
      elapsed,
      zoneWeight(currentProgress, 0.34, 0.46, 0.045),
    );
    drawFeedback(
      currentProgress,
      elapsed,
      zoneWeight(currentProgress, 0.41, 0.53, 0.045),
    );
    drawNetwork(
      currentProgress,
      elapsed,
      zoneWeight(currentProgress, 0.47, 0.59, 0.045),
    );
    drawSelfOrganization(
      currentProgress,
      elapsed,
      zoneWeight(currentProgress, 0.55, 0.67, 0.045),
    );
    drawFunctionalInformation(
      currentProgress,
      elapsed,
      zoneWeight(currentProgress, 0.61, 0.74, 0.045),
    );
    drawOrganizedChemistry(
      currentProgress,
      elapsed,
      zoneWeight(currentProgress, 0.68, 0.81, 0.045),
    );
    drawReplication(
      currentProgress,
      elapsed,
      zoneWeight(currentProgress, 0.75, 0.87, 0.045),
    );
    drawProtocells(
      currentProgress,
      elapsed,
      zoneWeight(currentProgress, 0.82, 0.93, 0.045),
    );
    drawChemicalEvolution(
      currentProgress,
      elapsed,
      zoneWeight(currentProgress, 0.89, 0.985, 0.035),
    );
    drawLifeThreshold(
      currentProgress,
      elapsed,
      smooth(clamp((currentProgress - 0.95) / 0.05, 0, 1)),
    );

    drawBursts(dt);

    if (!pointerDown) {
      const zone = zoneForDepth(currentProgress);
      setAccent(zone);
    }
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
  root.style.setProperty("--progress-number", ".03");
  requestAnimationFrame(render);
}
