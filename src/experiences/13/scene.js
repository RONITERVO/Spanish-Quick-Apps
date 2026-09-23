import { setReadoutRegion } from "../../shared/narration-target.js";
import { createSceneAudio } from "../../shared/audio.js";
import {
  requestSceneFrame as requestAnimationFrame,
  cancelSceneFrame as cancelAnimationFrame,
} from "../../shared/animation.js";
import content from "./content.json";
const { ZONES } = content;

export function mountScene() {
  const canvas = document.getElementById("matter-energy-spectrum");
  const ctx = canvas.getContext("2d", { alpha: false });
  const root = document.documentElement;
  const readout = document.getElementById("readout");
  const certaintyClass = document.getElementById("certainty-class");
  const zoneName = document.getElementById("zone-name");
  const featureName = document.getElementById("feature-name");
  const metric = document.getElementById("metric");
  const fact = document.getElementById("fact");
  const touchOrb = document.getElementById("touch-orb");
  const scaleValue = document.getElementById("scale-value");
  const hint = document.getElementById("hint");

  const TAU = Math.PI * 2;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const residualQuanta = [];
  const matterIcons = [];
  const molecules = [];
  const atoms = [];
  const nuclei = [];
  const nucleons = [];
  const hadrons = [];
  const fieldModes = [];
  const vacuumModes = [];
  const frontierBranches = [];
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
  let speechUnlocked = false;
  let speechTimer = 0;
  let lastSpoken = "";
  window.addEventListener("spectrum:cancel-tts", () => {
    clearTimeout(speechTimer);
    speechTimer = 0;
  });

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
    const t = clamp((x - a) / (b - a));
    return t * t * (3 - 2 * t);
  }
  function seeded(seed) {
    const x = Math.sin(seed * 91.733 + 13.17) * 43758.5453123;
    return x - Math.floor(x);
  }
  function depthFromY(yNorm) {
    return clamp(1 - yNorm);
  }
  function zoneForDepth(progress) {
    return (
      ZONES.find((zone) => progress >= zone.p0 && progress < zone.p1) ||
      ZONES[ZONES.length - 1]
    );
  }
  function featureFor(zone, xNorm) {
    const index = Math.min(
      zone.features.length - 1,
      Math.floor(xNorm * zone.features.length),
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
  function bandY(progress) {
    return (1 - progress) * height;
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
    residualQuanta.length =
      matterIcons.length =
      molecules.length =
      atoms.length =
        0;
    nuclei.length =
      nucleons.length =
      hadrons.length =
      fieldModes.length =
      vacuumModes.length =
        0;
    frontierBranches.length = 0;

    for (let i = 0; i < 82; i++) {
      residualQuanta.push({
        x: seeded(i + 10),
        y: 0.925 + seeded(i + 100) * 0.07,
        r: 0.35 + seeded(i + 200) * 1.35,
        a: 0.04 + seeded(i + 300) * 0.18,
        phase: seeded(i + 400) * TAU,
        kind: i % 4,
        drift: (seeded(i + 500) - 0.5) * 0.012,
      });
    }
    const matterKinds = ["planet", "rock", "water", "gas", "life", "metal"];
    for (let i = 0; i < 18; i++) {
      matterIcons.push({
        x: 0.035 + seeded(i + 600) * 0.93,
        y: 0.845 + seeded(i + 700) * 0.07,
        r: 9 + seeded(i + 800) * 22,
        kind: matterKinds[i % matterKinds.length],
        phase: seeded(i + 900) * TAU,
        a: 0.2 + seeded(i + 1000) * 0.45,
      });
    }
    const moleculeKinds = [
      "water",
      "oxygen",
      "co2",
      "chain",
      "ring",
      "lattice",
    ];
    for (let i = 0; i < 22; i++) {
      molecules.push({
        x: 0.03 + seeded(i + 1100) * 0.94,
        y: 0.765 + seeded(i + 1200) * 0.07,
        r: 5 + seeded(i + 1300) * 9,
        kind: moleculeKinds[i % moleculeKinds.length],
        rot: seeded(i + 1400) * TAU,
        phase: seeded(i + 1500) * TAU,
        a: 0.23 + seeded(i + 1600) * 0.46,
      });
    }
    for (let i = 0; i < 19; i++) {
      atoms.push({
        x: 0.035 + seeded(i + 1700) * 0.93,
        y: 0.68 + seeded(i + 1800) * 0.07,
        r: 12 + seeded(i + 1900) * 22,
        electrons: 1 + (i % 6),
        rot: seeded(i + 2000) * TAU,
        phase: seeded(i + 2100) * TAU,
        a: 0.2 + seeded(i + 2200) * 0.42,
      });
    }
    for (let i = 0; i < 24; i++) {
      nuclei.push({
        x: 0.035 + seeded(i + 2300) * 0.93,
        y: 0.592 + seeded(i + 2400) * 0.07,
        r: 8 + seeded(i + 2500) * 17,
        count: 4 + Math.floor(seeded(i + 2600) * 16),
        phase: seeded(i + 2700) * TAU,
        a: 0.25 + seeded(i + 2800) * 0.45,
      });
    }
    for (let i = 0; i < 15; i++) {
      nucleons.push({
        x: 0.05 + seeded(i + 2900) * 0.9,
        y: 0.51 + seeded(i + 3000) * 0.07,
        r: 11 + seeded(i + 3100) * 18,
        neutron: i % 2 === 1,
        phase: seeded(i + 3200) * TAU,
        a: 0.3 + seeded(i + 3300) * 0.48,
      });
    }
    for (let i = 0; i < 14; i++) {
      hadrons.push({
        x: 0.05 + seeded(i + 3400) * 0.9,
        y: 0.42 + seeded(i + 3500) * 0.075,
        r: 13 + seeded(i + 3600) * 20,
        neutron: i % 2 === 1,
        rot: seeded(i + 3700) * TAU,
        phase: seeded(i + 3800) * TAU,
        a: 0.3 + seeded(i + 3900) * 0.46,
      });
    }
    for (let i = 0; i < 28; i++) {
      fieldModes.push({
        y: 0.145 + seeded(i + 4000) * 0.09,
        amp: 2 + seeded(i + 4100) * 12,
        freq: 1 + Math.floor(seeded(i + 4200) * 5),
        phase: seeded(i + 4300) * TAU,
        a: 0.025 + seeded(i + 4400) * 0.09,
        hue: i % 3,
      });
    }
    for (let i = 0; i < 46; i++) {
      vacuumModes.push({
        x: seeded(i + 4500),
        y: 0.06 + seeded(i + 4600) * 0.07,
        r: 2 + seeded(i + 4700) * 10,
        phase: seeded(i + 4800) * TAU,
        a: 0.02 + seeded(i + 4900) * 0.08,
        mode: i % 4,
      });
    }
    const names = [
      "MATERIA OSCURA",
      "ENERGÍA OSCURA",
      "NEUTRINOS",
      "ANTIMATERIA",
      "GRAVEDAD CUÁNTICA",
      "ESPACIO-TIEMPO",
      "UNIFICACIÓN",
    ];
    names.forEach((name, i) =>
      frontierBranches.push({
        name,
        x0: 0.5,
        y0: 0.055,
        x1: 0.05 + i * 0.15,
        y1: 0.006 + (i % 2) * 0.012,
        bend: (i - 3) * 0.017,
        phase: seeded(i + 5000) * TAU,
      }),
    );
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
    compressor.threshold.value = -25;
    compressor.knee.value = 20;
    compressor.ratio.value = 5;
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
    droneFilter.Q.value = 0.75;
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
    const channel = noiseBuffer.getChannelData(0);
    for (let i = 0; i < channel.length; i++) channel[i] = Math.random() * 2 - 1;
    noiseSource = audioCtx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;
    noiseGain = audioCtx.createGain();
    noiseGain.gain.value = 0.0001;
    noiseFilter = audioCtx.createBiquadFilter();
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.value = 950;
    noiseFilter.Q.value = 0.45;
    noiseSource.connect(noiseFilter).connect(noiseGain).connect(master);
    noiseSource.start();
  }

  function setAudioFor(zone, xNorm, yNorm, active) {
    if (!audioCtx || !master) return;
    const now = audioCtx.currentTime;
    const s = zone.sound;
    const depth = depthFromY(yNorm);
    const base = s.base * (0.92 + xNorm * 0.16);
    droneA.type = s.type;
    droneB.type = s.type === "sawtooth" ? "triangle" : "sine";
    droneA.frequency.setTargetAtTime(base, now, 0.08);
    droneB.frequency.setTargetAtTime(base * (1.495 + depth * 0.008), now, 0.1);
    droneFilter.frequency.setTargetAtTime(
      s.filter * (0.82 + xNorm * 0.28),
      now,
      0.1,
    );
    droneGain.gain.setTargetAtTime(
      active ? 0.014 + depth * 0.006 : 0.0001,
      now,
      0.09,
    );
    pulseOsc.frequency.setTargetAtTime(base * (1.99 + s.pulse), now, 0.07);
    pulseGain.gain.setTargetAtTime(
      active ? 0.0035 + depth * 0.0018 : 0.0001,
      now,
      0.1,
    );
    noiseFilter.frequency.setTargetAtTime(s.filter * 1.1, now, 0.1);
    noiseGain.gain.setTargetAtTime(
      active ? Math.max(0.0001, s.noise * 0.075) : 0.0001,
      now,
      0.1,
    );
    if (stereo.pan) stereo.pan.setTargetAtTime((xNorm - 0.5) * 0.72, now, 0.07);
    master.gain.setTargetAtTime(active ? 0.31 : 0.0001, now, 0.09);
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
    const scale = [1, 1.125, 1.25, 1.5, 1.667, 2, 2.25][featureIndex % 7];
    osc.type = zone.sound.type;
    osc.frequency.setValueAtTime(
      Math.max(34, zone.sound.base * 2.85 * scale),
      now,
    );
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(32, zone.sound.base * 1.18),
      now + 0.5,
    );
    filter.type = "lowpass";
    filter.frequency.value = Math.max(300, zone.sound.filter * 1.5);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.031, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.57);
    osc.connect(filter).connect(gain);
    if (pan) {
      pan.pan.value = (xNorm - 0.5) * 1.4;
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

  function addBurst(x, y, zone) {
    const count = reducedMotion ? 5 : 12;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * TAU;
      const speed = 18 + Math.random() * 72;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: 0.8 + Math.random() * 2.3,
        life: 1,
        decay: 1 + Math.random() * 0.75,
        color: zone.color,
      });
    }
    waves.push({ x, y, radius: 5, life: 1, color: zone.color });
  }

  function updateReadout(x, y, isNewPress = false) {
    const xNorm = clamp(x / width, 0, 0.999999);
    const yNorm = clamp(y / height, 0, 0.999999);
    const progress = depthFromY(yNorm);
    const zone = zoneForDepth(progress);
    const feature = featureFor(zone, xNorm);

    targetX = xNorm;
    targetY = yNorm;
    setCssPoint(x, y);
    setAccent(zone);
    root.style.setProperty("--progress", `${Math.max(1.2, progress * 100)}%`);

    touchOrb.style.left = `${x}px`;
    touchOrb.style.top = `${y}px`;
    scaleValue.textContent = zone.className;

    const changed = zone.id !== lastZoneId || feature.index !== lastFeature;
    if (changed || isNewPress) {
      certaintyClass.textContent = zone.className;
      setReadoutRegion(readout, zone.id);
      zoneName.textContent = zone.name;
      zoneName.className =
        zone.name.length > 30 ? "long" : zone.name.length > 20 ? "compact" : "";
      featureName.textContent = feature.name;
      metric.textContent = zone.metric;
      fact.textContent = feature.fact || zone.fact;
      ping(zone, xNorm, feature.index);
      addBurst(x, y, zone);
      lastZoneId = zone.id;
      lastFeature = feature.index;
    }

    readout.classList.add("visible");
    touchOrb.classList.add("visible");
    document.body.classList.add("active");
    hint.style.display = "none";
    setAudioFor(zone, xNorm, yNorm, true);
  }

  function releaseInteraction(delay = 1000) {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      readout.classList.remove("visible");
      touchOrb.classList.remove("visible");
      document.body.classList.remove("active");
      const zone = zoneForDepth(depthFromY(targetY));
      setAudioFor(zone, targetX, targetY, false);
    }, delay);
  }

  function pointerPosition(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  canvas.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    activePointer = event.pointerId;
    canvas.setPointerCapture?.(event.pointerId);
    speechUnlocked = true;
    ensureAudio();
    const point = pointerPosition(event);
    addRipple(point.x, point.y);
    updateReadout(point.x, point.y, true);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (activePointer !== event.pointerId) return;
    const point = pointerPosition(event);
    updateReadout(point.x, point.y, false);
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
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  canvas.addEventListener("keydown", (event) => {
    const step = event.shiftKey ? 0.09 : 0.035;
    if (
      ![
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "Enter",
        " ",
      ].includes(event.key)
    )
      return;
    event.preventDefault();
    speechUnlocked = true;
    ensureAudio();
    if (event.key === "ArrowUp") targetY = clamp(targetY - step);
    if (event.key === "ArrowDown") targetY = clamp(targetY + step);
    if (event.key === "ArrowLeft") targetX = clamp(targetX - step);
    if (event.key === "ArrowRight") targetX = clamp(targetX + step);
    updateReadout(
      targetX * width,
      targetY * height,
      event.key === "Enter" || event.key === " ",
    );
    releaseInteraction(1600);
  });

  function glow(x, y, radius, core, mid, edge = "rgba(0,0,0,0)") {
    const gradient = ctx.createRadialGradient(
      x,
      y,
      0,
      x,
      y,
      Math.max(1, radius),
    );
    gradient.addColorStop(0, core);
    gradient.addColorStop(0.38, mid);
    gradient.addColorStop(1, edge);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1, radius), 0, TAU);
    ctx.fill();
  }

  function drawBackground(time) {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#03050b");
    gradient.addColorStop(0.06, "#08101d");
    gradient.addColorStop(0.13, "#0b1b2a");
    gradient.addColorStop(0.22, "#102c3a");
    gradient.addColorStop(0.32, "#202b49");
    gradient.addColorStop(0.43, "#3b203e");
    gradient.addColorStop(0.54, "#4b2530");
    gradient.addColorStop(0.64, "#48301f");
    gradient.addColorStop(0.75, "#153a3a");
    gradient.addColorStop(0.86, "#102c38");
    gradient.addColorStop(0.94, "#071522");
    gradient.addColorStop(1, "#02050a");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    const depth = pointerY;
    const haloX = pointerX * width;
    const haloY = pointerY * height;
    glow(
      haloX,
      haloY,
      Math.max(width, height) * 0.34,
      `rgba(${Math.round(70 + depth * 70)},${Math.round(100 + depth * 80)},${Math.round(180 + depth * 50)},.042)`,
      "rgba(34,74,112,.008)",
    );

    if (!reducedMotion) {
      ctx.save();
      ctx.globalAlpha = 0.018;
      ctx.translate(Math.sin(time * 0.00004) * width * 0.01, 0);
      for (let i = 0; i < 8; i++) {
        ctx.strokeStyle = "rgba(210,235,255,.16)";
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        const y = height * (0.05 + i * 0.125);
        for (let x = 0; x <= width; x += 14) {
          const yy =
            y + Math.sin(x * 0.012 + time * 0.00008 + i) * (2 + i * 0.35);
          if (x === 0) ctx.moveTo(x, yy);
          else ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawBands() {
    ctx.save();
    ctx.setLineDash([2, 8]);
    for (let i = 1; i < ZONES.length; i++) {
      const y = bandY(ZONES[i].p0);
      ctx.strokeStyle = "rgba(255,255,255,.045)";
      ctx.lineWidth = 0.55;
      ctx.beginPath();
      ctx.moveTo(width * 0.045, y);
      ctx.lineTo(width * 0.955, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawResidualUniverse(time) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const q of residualQuanta) {
      const drift = reducedMotion
        ? 0
        : Math.sin(time * 0.00011 + q.phase) * q.drift;
      const x = ((q.x + drift + 1) % 1) * width;
      const y = q.y * height;
      const pulse = reducedMotion
        ? 0.7
        : 0.38 + Math.abs(Math.sin(time * 0.0002 + q.phase)) * 0.62;
      if (q.kind === 0) {
        ctx.strokeStyle = `rgba(151,196,255,${q.a * pulse})`;
        ctx.lineWidth = 0.55;
        ctx.beginPath();
        for (let j = 0; j < 9; j++) {
          const xx = x + (j - 4) * 3.2;
          const yy = y + Math.sin(j * 0.9 + time * 0.001 + q.phase) * 1.4;
          if (j === 0) ctx.moveTo(xx, yy);
          else ctx.lineTo(xx, yy);
        }
        ctx.stroke();
      } else if (q.kind === 1) {
        ctx.fillStyle = `rgba(205,180,255,${q.a * pulse})`;
        ctx.beginPath();
        ctx.arc(x, y, q.r * sceneScale(), 0, TAU);
        ctx.fill();
        ctx.strokeStyle = `rgba(205,180,255,${q.a * 0.5 * pulse})`;
        ctx.beginPath();
        ctx.moveTo(x - 5, y);
        ctx.lineTo(x + 5, y);
        ctx.stroke();
      } else {
        ctx.fillStyle =
          q.kind === 2
            ? `rgba(132,231,230,${q.a * pulse})`
            : `rgba(255,188,215,${q.a * pulse})`;
        ctx.beginPath();
        ctx.arc(x, y, q.r * sceneScale(), 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawMatterIcon(icon, time) {
    const x = icon.x * width;
    const y =
      icon.y * height +
      (reducedMotion ? 0 : Math.sin(time * 0.00038 + icon.phase) * 2.2);
    const r = icon.r * sceneScale();
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = icon.a;
    ctx.globalCompositeOperation = "screen";
    if (icon.kind === "planet") {
      glow(0, 0, r * 1.5, "rgba(88,184,230,.52)", "rgba(42,110,165,.08)");
      ctx.fillStyle = "rgba(35,93,130,.75)";
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.68, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(139,224,255,.55)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * 0.25, -0.25, 0, TAU);
      ctx.stroke();
    } else if (icon.kind === "rock") {
      ctx.fillStyle = "rgba(226,191,143,.44)";
      ctx.beginPath();
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * TAU;
        const rr = r * (0.55 + seeded(i + icon.phase * 100) * 0.28);
        const px = Math.cos(a) * rr,
          py = Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    } else if (icon.kind === "water") {
      ctx.fillStyle = "rgba(83,208,255,.4)";
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.bezierCurveTo(r * 0.65, -r * 0.2, r * 0.75, r * 0.6, 0, r);
      ctx.bezierCurveTo(-r * 0.75, r * 0.6, -r * 0.65, -r * 0.2, 0, -r);
      ctx.fill();
    } else if (icon.kind === "gas") {
      ctx.strokeStyle = "rgba(181,235,240,.32)";
      ctx.lineWidth = 1.2;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        for (let j = 0; j < 14; j++) {
          const xx = (j - 7) * r * 0.11;
          const yy =
            i * r * 0.22 +
            Math.sin(j * 0.7 + time * 0.001 + icon.phase) * r * 0.1;
          if (j === 0) ctx.moveTo(xx, yy);
          else ctx.lineTo(xx, yy);
        }
        ctx.stroke();
      }
    } else if (icon.kind === "life") {
      ctx.fillStyle = "rgba(107,239,154,.35)";
      ctx.beginPath();
      ctx.ellipse(-r * 0.18, 0, r * 0.35, r * 0.8, -0.6, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(r * 0.25, r * 0.05, r * 0.32, r * 0.7, 0.58, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(183,255,202,.45)";
      ctx.beginPath();
      ctx.moveTo(0, r * 0.8);
      ctx.lineTo(0, -r * 0.7);
      ctx.stroke();
    } else {
      ctx.rotate(Math.PI / 4);
      ctx.strokeStyle = "rgba(222,237,255,.45)";
      ctx.lineWidth = 1;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(-r, i * r * 0.35);
        ctx.lineTo(r, i * r * 0.35);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(i * r * 0.35, -r);
        ctx.lineTo(i * r * 0.35, r);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawObservableMatter(time) {
    for (const icon of matterIcons) drawMatterIcon(icon, time);
  }

  function atomColor(kind) {
    if (kind === "O") return [255, 110, 96];
    if (kind === "H") return [225, 239, 255];
    if (kind === "C") return [117, 144, 169];
    if (kind === "N") return [101, 140, 255];
    return [124, 238, 190];
  }

  function drawMoleculeAtom(x, y, r, kind, alpha) {
    const [cr, cg, cb] = atomColor(kind);
    glow(
      x,
      y,
      r * 2.1,
      `rgba(${cr},${cg},${cb},${alpha * 0.32})`,
      `rgba(${cr},${cg},${cb},.008)`,
    );
    ctx.fillStyle = `rgba(${cr},${cg},${cb},${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.45})`;
    ctx.lineWidth = 0.55;
    ctx.beginPath();
    ctx.arc(x - r * 0.24, y - r * 0.25, r * 0.38, 0, TAU);
    ctx.stroke();
  }

  function drawOneMolecule(mol, time) {
    const x = mol.x * width;
    const y =
      mol.y * height +
      (reducedMotion ? 0 : Math.sin(time * 0.00055 + mol.phase) * 2.4);
    const r = mol.r * sceneScale();
    const rot =
      mol.rot +
      (reducedMotion ? 0 : Math.sin(time * 0.00012 + mol.phase) * 0.17);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.globalCompositeOperation = "screen";
    ctx.strokeStyle = `rgba(198,255,224,${mol.a * 0.62})`;
    ctx.lineWidth = Math.max(0.7, r * 0.16);
    ctx.lineCap = "round";
    const bond = (x1, y1, x2, y2) => {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    };
    if (mol.kind === "water") {
      bond(0, 0, -r * 1.05, r * 0.75);
      bond(0, 0, r * 1.05, r * 0.75);
      drawMoleculeAtom(0, 0, r * 0.58, "O", mol.a);
      drawMoleculeAtom(-r * 1.05, r * 0.75, r * 0.38, "H", mol.a);
      drawMoleculeAtom(r * 1.05, r * 0.75, r * 0.38, "H", mol.a);
    } else if (mol.kind === "oxygen") {
      bond(-r * 0.8, 0, r * 0.8, 0);
      bond(-r * 0.8, r * 0.22, r * 0.8, r * 0.22);
      drawMoleculeAtom(-r * 0.8, 0, r * 0.55, "O", mol.a);
      drawMoleculeAtom(r * 0.8, 0, r * 0.55, "O", mol.a);
    } else if (mol.kind === "co2") {
      bond(-r * 1.4, 0, 0, 0);
      bond(0, 0, r * 1.4, 0);
      drawMoleculeAtom(-r * 1.4, 0, r * 0.48, "O", mol.a);
      drawMoleculeAtom(0, 0, r * 0.52, "C", mol.a);
      drawMoleculeAtom(r * 1.4, 0, r * 0.48, "O", mol.a);
    } else if (mol.kind === "chain") {
      const pts = [
        [-1.5, 0.4],
        [-0.75, -0.4],
        [0, 0.35],
        [0.75, -0.35],
        [1.5, 0.2],
      ];
      for (let i = 0; i < pts.length - 1; i++)
        bond(
          pts[i][0] * r,
          pts[i][1] * r,
          pts[i + 1][0] * r,
          pts[i + 1][1] * r,
        );
      pts.forEach((p, i) =>
        drawMoleculeAtom(p[0] * r, p[1] * r, r * 0.4, i % 2 ? "H" : "C", mol.a),
      );
    } else if (mol.kind === "ring") {
      const pts = Array.from({ length: 6 }, (_, i) => [
        Math.cos((i / 6) * TAU) * r,
        Math.sin((i / 6) * TAU) * r,
      ]);
      for (let i = 0; i < 6; i++)
        bond(pts[i][0], pts[i][1], pts[(i + 1) % 6][0], pts[(i + 1) % 6][1]);
      pts.forEach((p) => drawMoleculeAtom(p[0], p[1], r * 0.35, "C", mol.a));
    } else {
      for (let i = -1; i <= 1; i++)
        for (let j = -1; j <= 1; j++) {
          if (i < 1) bond(i * r, j * r, (i + 1) * r, j * r);
          if (j < 1) bond(i * r, j * r, i * r, (j + 1) * r);
          drawMoleculeAtom(
            i * r,
            j * r,
            r * 0.28,
            (i + j) % 2 ? "O" : "C",
            mol.a,
          );
        }
    }
    ctx.restore();
  }

  function drawMolecules(time) {
    for (const mol of molecules) drawOneMolecule(mol, time);
  }

  function drawOneAtom(atom, time) {
    const x = atom.x * width;
    const y = atom.y * height;
    const r = atom.r * sceneScale();
    const pulse = reducedMotion
      ? 1
      : 0.86 + Math.sin(time * 0.00055 + atom.phase) * 0.08;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(atom.rot);
    ctx.globalCompositeOperation = "screen";
    for (let l = 0; l < 3; l++) {
      ctx.save();
      ctx.rotate(
        (l * Math.PI) / 3 +
          (reducedMotion
            ? 0
            : Math.sin(time * 0.00017 + atom.phase + l) * 0.18),
      );
      const cloud = ctx.createRadialGradient(0, 0, 0, 0, 0, r * (1 + l * 0.1));
      cloud.addColorStop(0, `rgba(110,195,255,${atom.a * 0.02})`);
      cloud.addColorStop(0.48, `rgba(110,195,255,${atom.a * 0.1})`);
      cloud.addColorStop(1, "rgba(110,195,255,0)");
      ctx.scale(1, 0.45 + l * 0.12);
      ctx.fillStyle = cloud;
      ctx.beginPath();
      ctx.arc(0, 0, r * pulse, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    glow(
      0,
      0,
      r * 0.25,
      `rgba(255,188,104,${atom.a * 0.72})`,
      "rgba(255,95,90,.01)",
    );
    ctx.fillStyle = `rgba(255,223,147,${atom.a * 0.75})`;
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(1, r * 0.07), 0, TAU);
    ctx.fill();
    for (let i = 0; i < atom.electrons; i++) {
      const a =
        atom.phase +
        i * 2.399 +
        (reducedMotion ? 0 : time * 0.00028 * (i % 2 ? -1 : 1));
      const rr = r * (0.45 + (i % 3) * 0.18);
      const ex = Math.cos(a) * rr;
      const ey = Math.sin(a) * rr * (0.42 + (i % 2) * 0.25);
      glow(
        ex,
        ey,
        r * 0.08,
        `rgba(196,235,255,${atom.a * 0.55})`,
        "rgba(110,195,255,0)",
      );
    }
    if (atom.electrons % 3 === 0) {
      const ray = r * 1.25;
      ctx.strokeStyle = `rgba(145,219,255,${atom.a * 0.25})`;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(r * 0.35, -r * 0.2);
      ctx.lineTo(ray, -ray * 0.42);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawAtoms(time) {
    for (const atom of atoms) drawOneAtom(atom, time);
  }

  function drawNucleonCluster(nucleus, time) {
    const x = nucleus.x * width;
    const y = nucleus.y * height;
    const r = nucleus.r * sceneScale();
    ctx.save();
    ctx.translate(x, y);
    ctx.globalCompositeOperation = "screen";
    glow(
      0,
      0,
      r * 1.5,
      `rgba(255,145,87,${nucleus.a * 0.16})`,
      "rgba(255,90,80,0)",
    );
    const small = Math.max(1.5, r * 0.18);
    for (let i = 0; i < nucleus.count; i++) {
      const a =
        i * 2.399 +
        nucleus.phase +
        (reducedMotion ? 0 : Math.sin(time * 0.0002 + i) * 0.03);
      const rr = r * 0.07 * Math.sqrt(i) * 1.9;
      const px = Math.cos(a) * rr;
      const py = Math.sin(a) * rr;
      const proton = i % 2 === 0;
      ctx.fillStyle = proton
        ? `rgba(255,112,98,${nucleus.a * 0.72})`
        : `rgba(126,183,255,${nucleus.a * 0.65})`;
      ctx.beginPath();
      ctx.arc(px, py, small, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawNuclei(time) {
    for (const nucleus of nuclei) drawNucleonCluster(nucleus, time);
  }

  function drawOneNucleon(n, time) {
    const x = n.x * width;
    const y = n.y * height;
    const r = n.r * sceneScale();
    ctx.save();
    ctx.translate(x, y);
    ctx.globalCompositeOperation = "screen";
    const c = n.neutron ? [116, 176, 255] : [255, 102, 100];
    glow(
      0,
      0,
      r * 1.5,
      `rgba(${c[0]},${c[1]},${c[2]},${n.a * 0.24})`,
      `rgba(${c[0]},${c[1]},${c[2]},0)`,
    );
    ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${n.a * 0.18})`;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();
    for (let i = 0; i < 22; i++) {
      const a =
        i * 2.399 +
        n.phase +
        (reducedMotion ? 0 : time * 0.00008 * (i % 2 ? 1 : -1));
      const rr = r * (0.15 + seeded(i + n.phase * 100) * 0.72);
      ctx.fillStyle =
        i % 3 === 0
          ? `rgba(255,220,130,${n.a * 0.24})`
          : `rgba(228,184,255,${n.a * 0.16})`;
      ctx.beginPath();
      ctx.arc(
        Math.cos(a) * rr,
        Math.sin(a) * rr,
        0.5 + seeded(i + 99) * 1.6,
        0,
        TAU,
      );
      ctx.fill();
    }
    ctx.strokeStyle = `rgba(255,255,255,${n.a * 0.3})`;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.92, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  function drawNucleons(time) {
    for (const n of nucleons) drawOneNucleon(n, time);
  }

  function drawFluxCurve(x1, y1, x2, y2, bend, alpha, time, phase) {
    ctx.strokeStyle = `rgba(255,210,130,${alpha})`;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    const mx = (x1 + x2) * 0.5 + Math.cos(time * 0.0003 + phase) * bend;
    const my = (y1 + y2) * 0.5 + Math.sin(time * 0.00026 + phase) * bend;
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(mx, my, x2, y2);
    ctx.stroke();
  }

  function drawHadron(h, time) {
    const x = h.x * width;
    const y = h.y * height;
    const r = h.r * sceneScale();
    const rot = h.rot + (reducedMotion ? 0 : time * 0.00011);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.globalCompositeOperation = "screen";
    glow(
      0,
      0,
      r * 1.55,
      `rgba(237,94,205,${h.a * 0.22})`,
      "rgba(130,70,180,0)",
    );
    ctx.strokeStyle = `rgba(245,185,255,${h.a * 0.24})`;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.stroke();
    const types = h.neutron ? ["u", "d", "d"] : ["u", "u", "d"];
    const colors = [
      [255, 90, 95],
      [90, 255, 145],
      [95, 145, 255],
    ];
    const pts = types.map((_, i) => {
      const a = (i / 3) * TAU - Math.PI / 2;
      return [Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5];
    });
    drawFluxCurve(
      pts[0][0],
      pts[0][1],
      pts[1][0],
      pts[1][1],
      r * 0.18,
      h.a * 0.4,
      time,
      h.phase,
    );
    drawFluxCurve(
      pts[1][0],
      pts[1][1],
      pts[2][0],
      pts[2][1],
      r * 0.18,
      h.a * 0.4,
      time,
      h.phase + 2,
    );
    drawFluxCurve(
      pts[2][0],
      pts[2][1],
      pts[0][0],
      pts[0][1],
      r * 0.18,
      h.a * 0.4,
      time,
      h.phase + 4,
    );
    pts.forEach((p, i) => {
      const c = colors[i];
      glow(
        p[0],
        p[1],
        r * 0.34,
        `rgba(${c[0]},${c[1]},${c[2]},${h.a * 0.5})`,
        `rgba(${c[0]},${c[1]},${c[2]},0)`,
      );
      ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${h.a * 0.72})`;
      ctx.beginPath();
      ctx.arc(p[0], p[1], r * 0.16, 0, TAU);
      ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${h.a * 0.78})`;
      ctx.font = `900 ${Math.max(5, r * 0.18)}px Inter,system-ui,sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(types[i], p[0], p[1]);
    });
    ctx.restore();
  }

  function drawQuarks(time) {
    for (const h of hadrons) drawHadron(h, time);
  }

  function drawParticleLandscape(time) {
    const y0 = height * 0.335;
    const y1 = height * 0.405;
    const labels = [
      { t: "u", x: 0.1, y: 0.35, c: "255,105,110" },
      { t: "d", x: 0.17, y: 0.38, c: "255,105,110" },
      { t: "c", x: 0.25, y: 0.35, c: "244,126,220" },
      { t: "s", x: 0.32, y: 0.38, c: "244,126,220" },
      { t: "t", x: 0.4, y: 0.35, c: "210,145,255" },
      { t: "b", x: 0.47, y: 0.38, c: "210,145,255" },
      { t: "e", x: 0.57, y: 0.35, c: "110,205,255" },
      { t: "νₑ", x: 0.64, y: 0.38, c: "140,230,255" },
      { t: "μ", x: 0.72, y: 0.35, c: "110,205,255" },
      { t: "νμ", x: 0.79, y: 0.38, c: "140,230,255" },
      { t: "τ", x: 0.87, y: 0.35, c: "110,205,255" },
      { t: "ντ", x: 0.94, y: 0.38, c: "140,230,255" },
    ];
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    labels.forEach((p, i) => {
      const x = p.x * width;
      const y =
        p.y * height + (reducedMotion ? 0 : Math.sin(time * 0.0005 + i) * 1.8);
      const r = Math.max(7, Math.min(15, width * 0.026));
      glow(x, y, r * 2, `rgba(${p.c},.18)`, `rgba(${p.c},0)`);
      ctx.fillStyle = `rgba(${p.c},.34)`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.78)";
      ctx.font = `900 ${Math.max(7, Math.min(11, width * 0.021))}px Inter,system-ui,sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(p.t, x, y);
    });
    const bosons = [
      ["γ", 0.18, "120,210,255"],
      ["g", 0.34, "255,150,95"],
      ["W", 0.5, "182,130,255"],
      ["Z", 0.66, "182,130,255"],
      ["H", 0.82, "255,210,125"],
    ];
    bosons.forEach((b, i) => {
      const x = b[1] * width,
        y = y0 + (y1 - y0) * 0.15;
      ctx.strokeStyle = `rgba(${b[2]},.28)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(6, width * 0.014), 0, TAU);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,.7)";
      ctx.font = `900 ${Math.max(7, width * 0.018)}px Inter,system-ui,sans-serif`;
      ctx.fillText(b[0], x, y);
    });
    ctx.restore();
  }

  function drawInteractions(time) {
    const y = height * 0.272;
    const xs = [0.14, 0.38, 0.62, 0.86];
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    // Gravity: curved grid, intentionally no graviton icon.
    ctx.strokeStyle = "rgba(160,184,255,.22)";
    ctx.lineWidth = 0.7;
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath();
      for (let j = 0; j <= 18; j++) {
        const xx = xs[0] * width + (j - 9) * width * 0.009;
        const yy = y + i * 4 + Math.exp(-Math.pow((j - 9) / 3.8, 2)) * 12;
        if (j === 0) ctx.moveTo(xx, yy);
        else ctx.lineTo(xx, yy);
      }
      ctx.stroke();
    }
    // Electromagnetism.
    ctx.strokeStyle = "rgba(105,220,255,.36)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let j = 0; j <= 40; j++) {
      const xx = xs[1] * width + (j - 20) * width * 0.0045;
      const yy = y + Math.sin(j * 0.55 + time * 0.001) * 9;
      if (j === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    }
    ctx.stroke();
    // Strong flux.
    drawFluxCurve(
      xs[2] * width - 24,
      y - 8,
      xs[2] * width + 24,
      y + 8,
      18,
      0.38,
      time,
      1,
    );
    drawFluxCurve(
      xs[2] * width - 24,
      y + 8,
      xs[2] * width + 24,
      y - 8,
      18,
      0.3,
      time,
      3,
    );
    // Weak decay.
    ctx.strokeStyle = "rgba(199,143,255,.34)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(xs[3] * width - 28, y);
    ctx.lineTo(xs[3] * width - 4, y);
    ctx.lineTo(xs[3] * width + 24, y - 14);
    ctx.moveTo(xs[3] * width - 4, y);
    ctx.lineTo(xs[3] * width + 24, y + 14);
    ctx.stroke();
    glow(
      xs[3] * width - 4,
      y,
      8,
      "rgba(235,194,255,.35)",
      "rgba(180,120,255,0)",
    );
    ctx.fillStyle = "rgba(235,241,255,.32)";
    ctx.font = `850 ${Math.max(6, width * 0.015)}px Inter,system-ui,sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ["GRAVEDAD", "ELECTROMAGNETISMO", "FUERTE", "DÉBIL"].forEach((t, i) =>
      ctx.fillText(t, xs[i] * width, y + 24),
    );
    ctx.restore();
  }

  function drawFields(time) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const f of fieldModes) {
      const rgb =
        f.hue === 0
          ? "95,215,255"
          : f.hue === 1
            ? "165,145,255"
            : "104,244,201";
      ctx.strokeStyle = `rgba(${rgb},${f.a})`;
      ctx.lineWidth = 0.55;
      ctx.beginPath();
      for (let x = 0; x <= width; x += 8) {
        const packet = Math.exp(
          -Math.pow((x / width - 0.5 - Math.sin(f.phase) * 0.25) / 0.18, 2),
        );
        const motion = reducedMotion ? 0 : time * 0.00024 * (f.hue + 1);
        const y =
          f.y * height +
          Math.sin((x / width) * TAU * f.freq + f.phase + motion) *
            f.amp *
            (f.hue === 2 ? packet : 1);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // Localized excitations.
    for (let i = 0; i < 7; i++) {
      const x = (0.08 + i * 0.14) * width;
      const y = (0.18 + (i % 2) * 0.022) * height;
      const pulse = reducedMotion ? 1 : 0.7 + Math.sin(time * 0.0006 + i) * 0.2;
      glow(
        x,
        y,
        18 * sceneScale(),
        `rgba(130,225,255,${0.12 * pulse})`,
        `rgba(130,225,255,0)`,
      );
    }
    ctx.restore();
  }

  function drawVacuum(time) {
    const top = height * 0.055;
    const bottom = height * 0.135;
    const g = ctx.createLinearGradient(0, top, 0, bottom);
    g.addColorStop(0, "rgba(210,234,255,.025)");
    g.addColorStop(0.5, "rgba(115,205,255,.055)");
    g.addColorStop(1, "rgba(115,205,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, top, width, bottom - top);
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const v of vacuumModes) {
      const x = v.x * width,
        y = v.y * height;
      const pulse = reducedMotion
        ? 0.7
        : 0.35 + Math.abs(Math.sin(time * 0.0004 + v.phase)) * 0.65;
      if (v.mode === 0) {
        ctx.strokeStyle = `rgba(180,226,255,${v.a * pulse})`;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.arc(x, y, v.r * sceneScale(), 0, TAU);
        ctx.stroke();
      } else if (v.mode === 1) {
        ctx.strokeStyle = `rgba(218,190,255,${v.a * pulse})`;
        ctx.beginPath();
        ctx.moveTo(x - v.r, y);
        ctx.quadraticCurveTo(x, y - v.r * 0.8, x + v.r, y);
        ctx.stroke();
      } else {
        glow(
          x,
          y,
          v.r * sceneScale(),
          `rgba(150,220,255,${v.a * pulse})`,
          `rgba(150,220,255,0)`,
        );
      }
    }
    // Higgs vacuum value as a continuous baseline, not particle rain.
    ctx.strokeStyle = "rgba(255,212,135,.13)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= width; x += 8) {
      const y =
        height * 0.104 +
        (reducedMotion ? 0 : Math.sin(x * 0.014 + time * 0.00025) * 1.5);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawFrontier(time) {
    const bottom = height * 0.062;
    const veil = ctx.createLinearGradient(0, 0, 0, bottom * 1.25);
    veil.addColorStop(0, "rgba(2,4,10,.98)");
    veil.addColorStop(0.65, "rgba(8,14,25,.72)");
    veil.addColorStop(1, "rgba(10,18,30,0)");
    ctx.fillStyle = veil;
    ctx.fillRect(0, 0, width, bottom * 1.3);
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const b of frontierBranches) {
      const x0 = b.x0 * width,
        y0 = b.y0 * height,
        x1 = b.x1 * width,
        y1 = b.y1 * height;
      const pulse = reducedMotion
        ? 1
        : 0.7 + Math.sin(time * 0.00035 + b.phase) * 0.22;
      const gr = ctx.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, `rgba(225,235,255,${0.22 * pulse})`);
      gr.addColorStop(1, "rgba(225,235,255,0)");
      ctx.strokeStyle = gr;
      ctx.lineWidth = 0.65;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(
        (x0 + x1) * 0.5 + b.bend * width,
        (y0 + y1) * 0.5,
        x1,
        y1,
      );
      ctx.stroke();
      glow(
        x1,
        y1,
        4.5 * sceneScale(),
        `rgba(238,242,255,${0.16 * pulse})`,
        `rgba(160,190,255,0)`,
      );
    }
    // Emerging space-time mesh for the next app.
    ctx.strokeStyle = "rgba(180,210,255,.075)";
    ctx.lineWidth = 0.45;
    for (let i = 0; i < 9; i++) {
      const yy = height * (0.004 + i * 0.0048);
      ctx.beginPath();
      ctx.moveTo(width * 0.08, yy);
      ctx.lineTo(width * 0.92, yy);
      ctx.stroke();
    }
    for (let i = 0; i < 11; i++) {
      const xx = width * (0.08 + i * 0.084);
      ctx.beginPath();
      ctx.moveTo(xx, height * 0.002);
      ctx.lineTo(width * 0.5 + (xx - width * 0.5) * 0.72, height * 0.048);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawContinuity() {
    const top = height * 0.952;
    const gradient = ctx.createLinearGradient(0, top, 0, height);
    gradient.addColorStop(0, "rgba(155,198,255,0)");
    gradient.addColorStop(0.5, "rgba(155,198,255,.05)");
    gradient.addColorStop(1, "rgba(155,198,255,.11)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, top, width, height - top);
    ctx.save();
    ctx.setLineDash([2, 5]);
    ctx.strokeStyle = "rgba(210,226,255,.12)";
    ctx.lineWidth = 0.55;
    ctx.beginPath();
    ctx.moveTo(0, height * 0.968);
    ctx.lineTo(width, height * 0.968);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = "rgba(224,237,255,.56)";
    ctx.font = `850 ${Math.max(7, Math.min(10, width * 0.021))}px Inter,system-ui,sans-serif`;
    ctx.fillText(
      "EL FUTURO INDETERMINADO CONTINÚA DEBAJO",
      width * 0.5,
      height - Math.max(8, height * 0.011),
    );
    ctx.restore();
  }

  function drawScientificCues() {
    ctx.save();
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = `850 ${Math.max(6.1, Math.min(8.7, width * 0.0175))}px Inter,system-ui,sans-serif`;
    const cues = [
      ["EXPERIENCIA DIRECTA", 0.9, "rgba(116,230,222,.12)"],
      ["ESTRUCTURA MEDIDA", 0.72, "rgba(120,205,255,.11)"],
      ["PARTÍCULAS COMPROBADAS", 0.42, "rgba(243,125,220,.11)"],
      ["MARCO CUÁNTICO", 0.19, "rgba(115,228,255,.12)"],
      ["FÍSICA DESCONOCIDA", 0.025, "rgba(240,243,255,.14)"],
    ];
    const cueX = Math.max(12, width * 0.035);
    cues.forEach(([text, y, fill]) => {
      ctx.fillStyle = fill;
      ctx.fillText(text, cueX, height * y);
    });
    ctx.restore();
  }

  function drawTopMessage() {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.shadowBlur = 15;
    ctx.shadowColor = "rgba(190,220,255,.3)";
    ctx.fillStyle = "rgba(244,247,255,.8)";
    ctx.font = `930 ${Math.max(7, Math.min(10.5, width * 0.021))}px Inter,system-ui,sans-serif`;
    ctx.fillText(
      "LA FRONTERA DE LA FÍSICA FUNDAMENTAL",
      width * 0.5,
      Math.max(21, height * 0.026),
    );
    ctx.fillStyle = "rgba(224,234,248,.52)";
    ctx.font = `760 ${Math.max(5.8, Math.min(8.2, width * 0.016))}px Inter,system-ui,sans-serif`;
    ctx.fillText(
      "MÁS ALLÁ: DEL MUNDO CUÁNTICO AL ORIGEN DEL ESPACIO Y DEL TIEMPO",
      width * 0.5,
      Math.max(37, height * 0.047),
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
      ctx.fillStyle = `rgba(${r},${g},${b},${p.life * 0.66})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (0.4 + p.life), 0, TAU);
      ctx.fill();
    }
    for (let i = waves.length - 1; i >= 0; i--) {
      const w = waves[i];
      w.life -= dt * 1.18;
      if (w.life <= 0) {
        waves.splice(i, 1);
        continue;
      }
      w.radius += dt * 116;
      const [r, g, b] = w.color;
      ctx.strokeStyle = `rgba(${r},${g},${b},${w.life * 0.36})`;
      ctx.lineWidth = 1.1;
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
    drawBands();
    drawResidualUniverse(time);
    drawObservableMatter(time);
    drawMolecules(time);
    drawAtoms(time);
    drawNuclei(time);
    drawNucleons(time);
    drawQuarks(time);
    drawParticleLandscape(time);
    drawInteractions(time);
    drawFields(time);
    drawVacuum(time);
    drawFrontier(time);
    drawContinuity();
    drawScientificCues();
    drawTopMessage();
    drawParticles(dt);
    requestAnimationFrame(draw);
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
      if (document.hidden && "speechSynthesis" in window)
        speechSynthesis.cancel();
    });
    canvas.focus({ preventScroll: true });
    requestAnimationFrame(draw);
  }

  init();
}
