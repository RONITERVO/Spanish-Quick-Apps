import { createSceneAudio } from "../../shared/audio.js";
import {
  requestSceneFrame as requestAnimationFrame,
  cancelSceneFrame as cancelAnimationFrame,
} from "../../shared/animation.js";
import content from "./content.json";
const { ZONES } = content;

export function mountScene() {
  const canvas = document.getElementById("cosmic-evidence-spectrum");
  const ctx = canvas.getContext("2d", { alpha: false });
  const root = document.documentElement;
  const readout = document.getElementById("readout");
  const evidenceClass = document.getElementById("evidence-class");
  const zoneName = document.getElementById("zone-name");
  const featureName = document.getElementById("feature-name");
  const metric = document.getElementById("metric");
  const fact = document.getElementById("fact");
  const touchOrb = document.getElementById("touch-orb");
  const scaleValue = document.getElementById("scale-value");
  const hint = document.getElementById("hint");

  const TAU = Math.PI * 2;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const dataTiles = [];
  const cmbCells = [];
  const galaxyNodes = [];
  const spectra = [];
  const fossilContours = [];
  const seedPairs = [];
  const inferenceNodes = [];
  const predictionArcs = [];
  const detectorCones = [];
  const noisePoints = [];
  const candidateSignals = [];
  const quantumStrings = [];
  const quantumLoops = [];
  const causalSets = [];
  const questionBranches = [];
  const horizonCurves = [];
  const quietDust = [];
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
  function evidenceFromY(yNorm) {
    return clamp(1 - yNorm);
  }
  function zoneForEvidence(progress) {
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
    dataTiles.length =
      cmbCells.length =
      galaxyNodes.length =
      spectra.length =
        0;
    fossilContours.length = seedPairs.length = inferenceNodes.length = 0;
    predictionArcs.length =
      detectorCones.length =
      noisePoints.length =
      candidateSignals.length =
        0;
    quantumStrings.length = quantumLoops.length = causalSets.length = 0;
    questionBranches.length = horizonCurves.length = quietDust.length = 0;

    const random = seeded(26071809);

    for (let i = 0; i < 34; i++) {
      dataTiles.push({
        x: 0.04 + random() * 0.92,
        y: 0.8 + random() * 0.125,
        w: 0.025 + random() * 0.065,
        h: 0.009 + random() * 0.027,
        phase: random() * TAU,
        kind: Math.floor(random() * 4),
        a: 0.18 + random() * 0.42,
      });
    }

    const cmbCols = Math.max(16, Math.round(width / 34));
    const cmbRows = 4;
    for (let row = 0; row < cmbRows; row++) {
      for (let col = 0; col < cmbCols; col++) {
        const seed = row * 997 + col * 41;
        cmbCells.push({
          x: (col + 0.5 + (seededPoint(seed) - 0.5) * 0.85) / cmbCols,
          y:
            0.825 +
            ((row + 0.5 + (seededPoint(seed + 8) - 0.5) * 0.7) / cmbRows) *
              0.075,
          r: 0.45 + seededPoint(seed + 18) * 1.6,
          v: seededPoint(seed + 28),
          phase: seededPoint(seed + 38) * TAU,
        });
      }
    }

    for (let i = 0; i < 46; i++) {
      galaxyNodes.push({
        x: 0.02 + random() * 0.96,
        y: 0.805 + random() * 0.105,
        r: 0.6 + random() * 2,
        a: 0.16 + random() * 0.36,
        phase: random() * TAU,
      });
    }

    for (let i = 0; i < 8; i++) {
      const samples = [];
      const points = 34;
      for (let j = 0; j <= points; j++) {
        const x = j / points;
        const peak1 = Math.exp(-Math.pow((x - (0.18 + i * 0.012)) / 0.055, 2));
        const peak2 =
          0.62 * Math.exp(-Math.pow((x - (0.42 + i * 0.006)) / 0.075, 2));
        const peak3 = 0.38 * Math.exp(-Math.pow((x - 0.68) / 0.095, 2));
        samples.push((peak1 + peak2 + peak3) * (0.78 + random() * 0.18));
      }
      spectra.push({
        y: 0.77 + i * 0.012,
        samples,
        a: 0.09 + i * 0.013,
        phase: random() * TAU,
      });
    }

    for (let i = 0; i < 15; i++) {
      fossilContours.push({
        x: 0.05 + random() * 0.9,
        y: 0.66 + random() * 0.125,
        rx: 0.035 + random() * 0.095,
        ry: 0.012 + random() * 0.04,
        turns: 1 + Math.floor(random() * 3),
        phase: random() * TAU,
        a: 0.08 + random() * 0.18,
        tilt: (random() - 0.5) * 0.8,
      });
    }

    for (let i = 0; i < 36; i++) {
      seedPairs.push({
        x0: 0.03 + random() * 0.94,
        y0: 0.69 + random() * 0.09,
        x1: 0.03 + random() * 0.94,
        y1: 0.635 + random() * 0.04,
        phase: random() * TAU,
        a: 0.06 + random() * 0.15,
      });
    }

    for (let i = 0; i < 30; i++) {
      inferenceNodes.push({
        x: 0.035 + random() * 0.93,
        y: 0.5 + random() * 0.145,
        r: 1 + random() * 2.4,
        value: random(),
        phase: random() * TAU,
        a: 0.13 + random() * 0.3,
      });
    }

    for (let i = 0; i < 25; i++) {
      predictionArcs.push({
        x0: random(),
        y0: 0.39 + random() * 0.11,
        x1: random(),
        y1: 0.37 + random() * 0.115,
        bend: (random() - 0.5) * 0.12,
        phase: random() * TAU,
        dash: 3 + random() * 7,
        a: 0.06 + random() * 0.16,
      });
    }

    for (let i = 0; i < 12; i++) {
      detectorCones.push({
        x: 0.05 + random() * 0.9,
        y: 0.27 + random() * 0.095,
        spread: 0.025 + random() * 0.075,
        length: 0.035 + random() * 0.09,
        phase: random() * TAU,
        a: 0.05 + random() * 0.15,
      });
    }

    const noiseCount = Math.max(240, Math.round((width * height) / 2600));
    for (let i = 0; i < noiseCount; i++) {
      noisePoints.push({
        x: random(),
        y: 0.255 + random() * 0.12,
        r: 0.25 + random() * 1.1,
        phase: random() * TAU,
        a: 0.025 + random() * 0.11,
      });
    }

    for (let i = 0; i < 10; i++) {
      candidateSignals.push({
        x: 0.07 + random() * 0.86,
        y: 0.27 + random() * 0.08,
        width: 0.012 + random() * 0.035,
        amp: 0.004 + random() * 0.015,
        phase: random() * TAU,
        a: 0.08 + random() * 0.2,
      });
    }

    for (let i = 0; i < 18; i++) {
      quantumStrings.push({
        x: random(),
        y: 0.155 + random() * 0.1,
        length: 0.035 + random() * 0.12,
        amp: 0.003 + random() * 0.012,
        freq: 2 + Math.floor(random() * 5),
        phase: random() * TAU,
        a: 0.05 + random() * 0.15,
      });
    }

    for (let i = 0; i < 19; i++) {
      quantumLoops.push({
        x: 0.03 + random() * 0.94,
        y: 0.165 + random() * 0.085,
        r: 0.006 + random() * 0.022,
        sides: 3 + Math.floor(random() * 6),
        phase: random() * TAU,
        a: 0.05 + random() * 0.15,
      });
    }

    for (let i = 0; i < 50; i++) {
      causalSets.push({
        x: random(),
        y: 0.16 + random() * 0.095,
        r: 0.3 + random() * 1.2,
        phase: random() * TAU,
        a: 0.035 + random() * 0.12,
      });
    }

    const branchRoots = [0.15, 0.35, 0.55, 0.75, 0.9];
    for (let i = 0; i < branchRoots.length; i++) {
      const rootX = branchRoots[i];
      const branchCount = 2 + Math.floor(random() * 3);
      for (let j = 0; j < branchCount; j++) {
        questionBranches.push({
          x0: rootX,
          y0: 0.145,
          x1: clamp(rootX + (random() - 0.5) * 0.22),
          y1: 0.065 + random() * 0.045,
          bend: (random() - 0.5) * 0.13,
          phase: random() * TAU,
          a: 0.045 + random() * 0.12,
        });
      }
    }

    for (let i = 0; i < 6; i++) {
      horizonCurves.push({
        y: 0.018 + i * 0.012,
        amp: 0.002 + random() * 0.012,
        freq: 0.5 + random() * 1.8,
        phase: random() * TAU,
        a: 0.035 + random() * 0.09,
      });
    }

    for (let i = 0; i < 72; i++) {
      quietDust.push({
        x: random(),
        y: random() * 0.085,
        r: 0.25 + random() * 1.2,
        phase: random() * TAU,
        a: 0.018 + random() * 0.08,
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
    compressor.threshold.value = -23;
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
    const now = audioCtx.currentTime;
    const s = zone.sound;
    const vertical = 0.93 + (1 - yNorm) * 0.3;
    const horizontal = 0.95 + xNorm * 0.12;
    const base = s.base * vertical * horizontal;
    droneA.type = s.type;
    droneB.type = s.type === "sawtooth" ? "triangle" : "sine";
    droneA.frequency.setTargetAtTime(base, now, 0.055);
    droneB.frequency.setTargetAtTime(base * 1.498, now, 0.07);
    droneFilter.frequency.setTargetAtTime(
      s.filter * (0.82 + xNorm * 0.32),
      now,
      0.08,
    );
    droneGain.gain.setTargetAtTime(active ? 0.021 : 0.0001, now, 0.07);
    pulseOsc.frequency.setTargetAtTime(base * (2.01 + s.pulse), now, 0.05);
    pulseGain.gain.setTargetAtTime(active ? 0.0055 : 0.0001, now, 0.08);
    noiseFilter.frequency.setTargetAtTime(s.filter * 1.2, now, 0.08);
    noiseGain.gain.setTargetAtTime(
      active ? Math.max(0.0001, s.noise * 0.115) : 0.0001,
      now,
      0.08,
    );
    if (stereo.pan) stereo.pan.setTargetAtTime((xNorm - 0.5) * 0.8, now, 0.05);
    master.gain.setTargetAtTime(active ? 0.34 : 0.0001, now, 0.07);
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
    const scale = [1, 1.125, 1.25, 1.5, 1.6875, 2][featureIndex % 6];
    osc.type = zone.sound.type;
    osc.frequency.setValueAtTime(zone.sound.base * 3.7 * scale, now);
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(45, zone.sound.base * 1.6),
      now + 0.42,
    );
    filter.type = "lowpass";
    filter.frequency.value = zone.sound.filter * 1.75;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.041, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    osc.connect(filter).connect(gain);
    if (pan) {
      pan.pan.value = (xNorm - 0.5) * 1.5;
      gain.connect(pan).connect(master);
    } else {
      gain.connect(master);
    }
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
    const count = reducedMotion ? 5 : 13;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU;
      const speed = 20 + Math.random() * 85;
      particles.push({
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        r: 1 + Math.random() * 2.5,
        life: 1,
        decay: 1.1 + Math.random() * 0.7,
        color: zone.color,
      });
    }
    waves.push({ x, y, radius: 5, life: 1, color: zone.color });
  }

  function updateReadout(x, y, isNewPress = false) {
    const xNorm = clamp(x / width, 0, 0.999999);
    const yNorm = clamp(y / height, 0, 0.999999);
    const progress = evidenceFromY(yNorm);
    const zone = zoneForEvidence(progress);
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
      evidenceClass.textContent = zone.className;
      zoneName.textContent = zone.name;
      zoneName.className =
        zone.name.length > 27 ? "long" : zone.name.length > 18 ? "compact" : "";
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

  function releaseInteraction(delay = 900) {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      readout.classList.remove("visible");
      touchOrb.classList.remove("visible");
      document.body.classList.remove("active");
      const zone = zoneForEvidence(evidenceFromY(targetY));
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
    ensureAudio();
    const p = pointerPosition(event);
    addRipple(p.x, p.y);
    updateReadout(p.x, p.y, true);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (activePointer !== event.pointerId) return;
    const p = pointerPosition(event);
    updateReadout(p.x, p.y, false);
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
    releaseInteraction(1500);
  });

  function glow(x, y, r, core, mid, edge = "rgba(0,0,0,0)") {
    const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(1, r));
    g.addColorStop(0, core);
    g.addColorStop(0.38, mid);
    g.addColorStop(1, edge);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1, r), 0, TAU);
    ctx.fill();
  }

  function drawBackground(time) {
    const g = ctx.createLinearGradient(0, 0, 0, height);
    g.addColorStop(0, "#02040a");
    g.addColorStop(0.06, "#080c17");
    g.addColorStop(0.145, "#171126");
    g.addColorStop(0.255, "#26163d");
    g.addColorStop(0.375, "#321a34");
    g.addColorStop(0.5, "#3c2922");
    g.addColorStop(0.64, "#1b3d39");
    g.addColorStop(0.79, "#103a4c");
    g.addColorStop(0.94, "#122033");
    g.addColorStop(1, "#151826");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);

    const pulse = reducedMotion ? 1 : 0.93 + Math.sin(time * 0.00024) * 0.07;
    const haze = ctx.createRadialGradient(
      width * 0.48,
      height * 0.63,
      0,
      width * 0.48,
      height * 0.63,
      Math.max(width, height) * 0.8,
    );
    haze.addColorStop(0, `rgba(111,228,210,${0.045 * pulse})`);
    haze.addColorStop(0.45, "rgba(255,171,91,.028)");
    haze.addColorStop(0.74, "rgba(168,103,255,.022)");
    haze.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, width, height);
  }

  function drawEvidenceBands() {
    const bands = [
      {
        y0: 0.795,
        y1: 0.935,
        color: "96,203,255",
        label: "OBSERVADO",
        solid: true,
      },
      {
        y0: 0.65,
        y1: 0.795,
        color: "105,239,204",
        label: "HUELLA FÓSIL",
        solid: true,
      },
      {
        y0: 0.5,
        y1: 0.65,
        color: "255,216,104",
        label: "INFERIDO",
        solid: true,
      },
      {
        y0: 0.375,
        y1: 0.5,
        color: "255,159,98",
        label: "PREDICHO",
        solid: false,
      },
      {
        y0: 0.255,
        y1: 0.375,
        color: "255,108,154",
        label: "NO DETECTADO",
        solid: false,
      },
      {
        y0: 0.145,
        y1: 0.255,
        color: "169,121,255",
        label: "HIPOTÉTICO",
        solid: false,
      },
      {
        y0: 0,
        y1: 0.145,
        color: "227,229,255",
        label: "DESCONOCIDO",
        solid: false,
      },
    ];

    ctx.save();
    for (const band of bands) {
      const top = band.y0 * height;
      const bottom = band.y1 * height;
      const grad = ctx.createLinearGradient(0, top, 0, bottom);
      grad.addColorStop(0, `rgba(${band.color},0)`);
      grad.addColorStop(
        0.5,
        `rgba(${band.color},${band.solid ? 0.032 : 0.022})`,
      );
      grad.addColorStop(1, `rgba(${band.color},0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, top, width, bottom - top);

      ctx.strokeStyle = `rgba(${band.color},${band.solid ? 0.12 : 0.075})`;
      ctx.lineWidth = band.solid ? 0.8 : 0.55;
      ctx.setLineDash(band.solid ? [] : [4, 7]);
      ctx.beginPath();
      ctx.moveTo(0, top);
      ctx.lineTo(width, top);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.save();
      ctx.translate(Math.max(10, width * 0.018), (top + bottom) * 0.5);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = `rgba(${band.color},${band.solid ? 0.28 : 0.19})`;
      ctx.font = `900 ${Math.max(6, Math.min(9, width * 0.018))}px Inter,system-ui,sans-serif`;
      ctx.fillText(band.label, 0, 0);
      ctx.restore();
    }
    ctx.restore();
  }

  function drawObservedData(time) {
    const top = height * 0.79;
    const bottom = height * 0.94;
    const panel = ctx.createLinearGradient(0, top, 0, bottom);
    panel.addColorStop(0, "rgba(63,194,255,.025)");
    panel.addColorStop(0.45, "rgba(69,194,225,.08)");
    panel.addColorStop(1, "rgba(151,198,255,.035)");
    ctx.fillStyle = panel;
    ctx.fillRect(0, top, width, bottom - top);

    ctx.save();
    ctx.globalCompositeOperation = "screen";

    for (const tile of dataTiles) {
      const x = tile.x * width;
      const y = tile.y * height;
      const w = tile.w * width;
      const h = tile.h * height;
      const pulse = reducedMotion
        ? 1
        : 0.92 + Math.sin(time * 0.0008 + tile.phase) * 0.08;
      ctx.strokeStyle = `rgba(165,229,255,${tile.a * 0.45 * pulse})`;
      ctx.fillStyle = `rgba(74,185,224,${tile.a * 0.055})`;
      ctx.lineWidth = 0.7;
      ctx.fillRect(x - w / 2, y - h / 2, w, h);
      ctx.strokeRect(x - w / 2, y - h / 2, w, h);

      if (tile.kind === 0) {
        ctx.beginPath();
        for (let j = 0; j <= 9; j++) {
          const px = x - w * 0.42 + (j / 9) * w * 0.84;
          const py = y + Math.sin(j * 1.7 + tile.phase) * h * 0.22;
          if (j === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      } else if (tile.kind === 1) {
        for (let j = 0; j < 5; j++) {
          ctx.fillStyle = `rgba(174,237,255,${tile.a * (0.2 + j * 0.07)})`;
          ctx.fillRect(
            x - w * 0.38 + j * w * 0.17,
            y + h * 0.28 - j * h * 0.12,
            w * 0.08,
            j * h * 0.1 + h * 0.09,
          );
        }
      } else if (tile.kind === 2) {
        ctx.beginPath();
        ctx.arc(x, y, Math.min(w, h) * 0.28, 0, TAU);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, Math.min(w, h) * 0.12, 0, TAU);
        ctx.fillStyle = `rgba(230,249,255,${tile.a * 0.3})`;
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(x - w * 0.38, y + h * 0.18);
        ctx.lineTo(x - w * 0.12, y - h * 0.05);
        ctx.lineTo(x + w * 0.05, y + h * 0.08);
        ctx.lineTo(x + w * 0.38, y - h * 0.25);
        ctx.stroke();
      }
    }

    for (const cell of cmbCells) {
      const x = cell.x * width;
      const y = cell.y * height;
      const r = cell.r * 4.3 * sceneScale();
      const warm = cell.v > 0.5;
      const color = warm ? "255,176,102" : "99,183,255";
      glow(
        x,
        y,
        r,
        `rgba(${color},${0.1 + Math.abs(cell.v - 0.5) * 0.18})`,
        `rgba(${color},.02)`,
      );
    }

    ctx.strokeStyle = "rgba(148,225,255,.12)";
    ctx.lineWidth = 0.6;
    for (let i = 0; i < galaxyNodes.length; i++) {
      const a = galaxyNodes[i];
      const b = galaxyNodes[(i + 7) % galaxyNodes.length];
      if (Math.abs(a.x - b.x) > 0.16 || Math.abs(a.y - b.y) > 0.06) continue;
      ctx.beginPath();
      ctx.moveTo(a.x * width, a.y * height);
      ctx.lineTo(b.x * width, b.y * height);
      ctx.stroke();
    }
    for (const n of galaxyNodes) {
      const pulse = reducedMotion
        ? 1
        : 0.84 + Math.sin(time * 0.0007 + n.phase) * 0.16;
      glow(
        n.x * width,
        n.y * height,
        n.r * 5.2 * sceneScale() * pulse,
        `rgba(211,244,255,${n.a * 0.55})`,
        `rgba(87,180,255,${n.a * 0.08})`,
      );
    }

    for (const spectrum of spectra) {
      ctx.strokeStyle = `rgba(211,245,255,${spectrum.a})`;
      ctx.lineWidth = 0.55;
      ctx.beginPath();
      for (let j = 0; j < spectrum.samples.length; j++) {
        const x = (j / (spectrum.samples.length - 1)) * width;
        const y = spectrum.y * height - spectrum.samples[j] * height * 0.025;
        if (j === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawFossilTraces(time) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";

    for (const c of fossilContours) {
      const x = c.x * width;
      const y = c.y * height;
      const rx = c.rx * width;
      const ry = c.ry * height;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(
        c.tilt +
          (reducedMotion ? 0 : Math.sin(time * 0.00015 + c.phase) * 0.04),
      );
      for (let k = 0; k < c.turns + 2; k++) {
        ctx.strokeStyle = `rgba(124,255,218,${c.a * (1 - k * 0.18)})`;
        ctx.lineWidth = 0.55;
        ctx.beginPath();
        ctx.ellipse(0, 0, rx * (1 + k * 0.18), ry * (1 + k * 0.2), 0, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    }

    for (const pair of seedPairs) {
      const pulse = reducedMotion
        ? 1
        : 0.75 + Math.sin(time * 0.00055 + pair.phase) * 0.25;
      const x0 = pair.x0 * width;
      const y0 = pair.y0 * height;
      const x1 = pair.x1 * width;
      const y1 = pair.y1 * height;
      ctx.strokeStyle = `rgba(146,255,224,${pair.a * pulse})`;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(
        (x0 + x1) * 0.5,
        (y0 + y1) * 0.5 + Math.sin(pair.phase) * 8,
        x1,
        y1,
      );
      ctx.stroke();
      glow(
        x0,
        y0,
        2.5 * sceneScale(),
        `rgba(224,255,244,${pair.a * 1.5})`,
        "rgba(95,255,198,.02)",
      );
      glow(
        x1,
        y1,
        4.2 * sceneScale(),
        `rgba(180,255,227,${pair.a * 0.9})`,
        "rgba(86,255,190,.02)",
      );
    }

    const acousticY = height * 0.705;
    ctx.strokeStyle = "rgba(160,255,226,.19)";
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    const segments = 96;
    for (let i = 0; i <= segments; i++) {
      const x = (i / segments) * width;
      const y =
        acousticY +
        Math.sin(
          (i / segments) * TAU * 5.4 + (reducedMotion ? 0 : time * 0.0004),
        ) *
          height *
          0.007 +
        Math.sin((i / segments) * TAU * 11.2) * height * 0.0025;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawInference(time) {
    const top = height * 0.49;
    const bottom = height * 0.66;
    const mist = ctx.createLinearGradient(0, top, 0, bottom);
    mist.addColorStop(0, "rgba(255,203,70,.025)");
    mist.addColorStop(0.5, "rgba(255,216,107,.075)");
    mist.addColorStop(1, "rgba(255,217,114,.015)");
    ctx.fillStyle = mist;
    ctx.fillRect(0, top, width, bottom - top);

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.strokeStyle = "rgba(255,226,137,.11)";
    ctx.lineWidth = 0.55;
    for (let i = 0; i < inferenceNodes.length; i++) {
      const a = inferenceNodes[i];
      for (let j = i + 1; j < inferenceNodes.length; j++) {
        const b = inferenceNodes[j];
        const dx = a.x - b.x;
        const dy = (a.y - b.y) * 1.6;
        const dist = Math.hypot(dx, dy);
        if (dist > 0.16) continue;
        ctx.globalAlpha = (1 - dist / 0.16) * 0.7;
        ctx.beginPath();
        ctx.moveTo(a.x * width, a.y * height);
        ctx.lineTo(b.x * width, b.y * height);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    for (const n of inferenceNodes) {
      const pulse = reducedMotion
        ? 1
        : 0.86 + Math.sin(time * 0.00075 + n.phase) * 0.14;
      const warm = n.value > 0.5;
      const color = warm ? "255,231,150" : "255,193,77";
      glow(
        n.x * width,
        n.y * height,
        n.r * 6 * sceneScale() * pulse,
        `rgba(${color},${n.a * 0.5})`,
        `rgba(${color},${n.a * 0.05})`,
      );
      ctx.strokeStyle = `rgba(${color},${n.a * 0.5})`;
      ctx.lineWidth = 0.55;
      ctx.beginPath();
      ctx.arc(n.x * width, n.y * height, n.r * 2.4 * sceneScale(), 0, TAU);
      ctx.stroke();
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(255,239,185,.12)";
    ctx.font = `700 ${Math.max(8, Math.min(14, width * 0.028))}px ui-monospace,SFMono-Regular,Consolas,monospace`;
    const formulas = [
      "datos + física → reconstrucción",
      "δ inicial → gravedad → estructura",
      "abundancia ↔ densidad bariónica",
    ];
    formulas.forEach((text, i) => {
      ctx.fillText(
        text,
        width * (0.25 + i * 0.25),
        height * (0.535 + (i % 2) * 0.07),
      );
    });
    ctx.restore();
  }

  function drawPredictions(time) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.setLineDash([4, 7]);
    for (const arc of predictionArcs) {
      const x0 = arc.x0 * width;
      const y0 = arc.y0 * height;
      const x1 = arc.x1 * width;
      const y1 = arc.y1 * height;
      ctx.strokeStyle = `rgba(255,172,103,${arc.a})`;
      ctx.lineWidth = 0.65;
      ctx.lineDashOffset = reducedMotion ? 0 : -time * 0.012 + arc.phase * 4;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(
        (x0 + x1) * 0.5,
        (y0 + y1) * 0.5 + arc.bend * height,
        x1,
        y1,
      );
      ctx.stroke();
      ctx.setLineDash([arc.dash, arc.dash * 0.9]);
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    const targets = [
      { x: 0.17, y: 0.43, r: 0.018 },
      { x: 0.39, y: 0.405, r: 0.024 },
      { x: 0.62, y: 0.45, r: 0.016 },
      { x: 0.82, y: 0.4, r: 0.022 },
    ];
    targets.forEach((t, i) => {
      const pulse = reducedMotion ? 1 : 0.8 + Math.sin(time * 0.001 + i) * 0.2;
      ctx.strokeStyle = `rgba(255,204,151,${0.16 * pulse})`;
      ctx.lineWidth = 0.65;
      ctx.beginPath();
      ctx.arc(t.x * width, t.y * height, t.r * Math.min(width, height), 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(t.x * width - 8, t.y * height);
      ctx.lineTo(t.x * width + 8, t.y * height);
      ctx.moveTo(t.x * width, t.y * height - 8);
      ctx.lineTo(t.x * width, t.y * height + 8);
      ctx.stroke();
    });
    ctx.restore();
  }

  function drawUndetected(time) {
    const top = height * 0.25;
    const bottom = height * 0.38;
    const fog = ctx.createLinearGradient(0, top, 0, bottom);
    fog.addColorStop(0, "rgba(255,74,133,.02)");
    fog.addColorStop(0.5, "rgba(255,94,146,.075)");
    fog.addColorStop(1, "rgba(255,100,151,.02)");
    ctx.fillStyle = fog;
    ctx.fillRect(0, top, width, bottom - top);

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const p of noisePoints) {
      const flicker = reducedMotion
        ? 1
        : 0.35 + Math.abs(Math.sin(time * 0.0018 + p.phase)) * 0.65;
      ctx.fillStyle = `rgba(255,164,195,${p.a * flicker})`;
      ctx.beginPath();
      ctx.arc(p.x * width, p.y * height, p.r * sceneScale(), 0, TAU);
      ctx.fill();
    }

    for (const cone of detectorCones) {
      const x = cone.x * width;
      const y = cone.y * height;
      const len = cone.length * height;
      const spread = cone.spread * width;
      const grad = ctx.createLinearGradient(x, y, x, y + len);
      grad.addColorStop(0, `rgba(255,190,213,${cone.a})`);
      grad.addColorStop(1, "rgba(255,109,163,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - spread, y + len);
      ctx.lineTo(x + spread, y + len);
      ctx.closePath();
      ctx.fill();
    }

    for (const s of candidateSignals) {
      const pulse = reducedMotion
        ? 1
        : 0.55 + Math.sin(time * 0.0009 + s.phase) * 0.45;
      ctx.strokeStyle = `rgba(255,216,229,${s.a * pulse})`;
      ctx.lineWidth = 0.65;
      ctx.beginPath();
      const points = 30;
      for (let i = 0; i <= points; i++) {
        const x = (s.x - s.width + (i / points) * s.width * 2) * width;
        const center = s.y * height;
        const envelope = Math.exp(-Math.pow((i / points - 0.5) / 0.23, 2));
        const y =
          center + Math.sin(i * 1.9 + s.phase) * s.amp * height * envelope;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([2, 5]);
      ctx.strokeStyle = `rgba(255,155,190,${s.a * 0.4})`;
      ctx.beginPath();
      ctx.arc(s.x * width, s.y * height, s.width * width * 0.8, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  function drawQuantumFrameworks(time) {
    const top = height * 0.145;
    const bottom = height * 0.26;
    const veil = ctx.createLinearGradient(0, top, 0, bottom);
    veil.addColorStop(0, "rgba(99,53,173,.03)");
    veil.addColorStop(0.5, "rgba(161,98,255,.08)");
    veil.addColorStop(1, "rgba(174,111,255,.015)");
    ctx.fillStyle = veil;
    ctx.fillRect(0, top, width, bottom - top);

    ctx.save();
    ctx.globalCompositeOperation = "screen";

    ctx.beginPath();
    ctx.rect(0, top, width / 3, bottom - top);
    ctx.clip();
    for (const s of quantumStrings) {
      const x0 = s.x * width;
      const y0 = s.y * height;
      const len = s.length * width;
      ctx.strokeStyle = `rgba(205,165,255,${s.a})`;
      ctx.lineWidth = 0.55;
      ctx.beginPath();
      const segments = 34;
      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const x = x0 - len / 2 + t * len;
        const y =
          y0 +
          Math.sin(
            t * TAU * s.freq + s.phase + (reducedMotion ? 0 : time * 0.0006),
          ) *
            s.amp *
            height;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.rect(width / 3, top, width / 3, bottom - top);
    ctx.clip();
    ctx.globalCompositeOperation = "screen";
    for (const loop of quantumLoops) {
      const x = loop.x * width;
      const y = loop.y * height;
      const r = loop.r * Math.min(width, height);
      ctx.strokeStyle = `rgba(181,142,255,${loop.a})`;
      ctx.lineWidth = 0.55;
      ctx.beginPath();
      for (let i = 0; i <= loop.sides; i++) {
        const a =
          (i / loop.sides) * TAU +
          loop.phase +
          (reducedMotion ? 0 : time * 0.0001);
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.rect((width * 2) / 3, top, width / 3, bottom - top);
    ctx.clip();
    ctx.globalCompositeOperation = "screen";
    ctx.strokeStyle = "rgba(219,197,255,.08)";
    ctx.lineWidth = 0.45;
    for (let i = 0; i < causalSets.length; i++) {
      const a = causalSets[i];
      const x = a.x * width;
      const y = a.y * height;
      if (x < (width * 2) / 3) continue;
      glow(
        x,
        y,
        a.r * 2.5 * sceneScale(),
        `rgba(229,211,255,${a.a})`,
        "rgba(167,120,255,.01)",
      );
      const b = causalSets[(i + 9) % causalSets.length];
      const bx = b.x * width;
      const by = b.y * height;
      if (bx < (width * 2) / 3 || Math.abs(x - bx) > width * 0.12 || by >= y)
        continue;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(231,216,255,.17)";
    ctx.font = `850 ${Math.max(6, Math.min(9, width * 0.018))}px Inter,system-ui,sans-serif`;
    ctx.fillText("CUERDAS", width / 6, height * 0.242);
    ctx.fillText("BUCLES", width * 0.5, height * 0.242);
    ctx.fillText("OTRAS VÍAS", (width * 5) / 6, height * 0.242);
    ctx.restore();

    ctx.strokeStyle = "rgba(235,220,255,.08)";
    ctx.lineWidth = 0.5;
    ctx.setLineDash([3, 7]);
    ctx.beginPath();
    ctx.moveTo(width / 3, top);
    ctx.lineTo(width / 3, bottom);
    ctx.moveTo((width * 2) / 3, top);
    ctx.lineTo((width * 2) / 3, bottom);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawInitialQuestions(time) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const b of questionBranches) {
      const x0 = b.x0 * width;
      const y0 = b.y0 * height;
      const x1 = b.x1 * width;
      const y1 = b.y1 * height;
      const pulse = reducedMotion
        ? 1
        : 0.72 + Math.sin(time * 0.00035 + b.phase) * 0.28;
      const grad = ctx.createLinearGradient(x0, y0, x1, y1);
      grad.addColorStop(0, `rgba(224,204,255,${b.a * pulse})`);
      grad.addColorStop(1, "rgba(224,204,255,0)");
      ctx.strokeStyle = grad;
      ctx.lineWidth = 0.7;
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
        5.5 * sceneScale(),
        `rgba(239,228,255,${b.a * 0.8})`,
        "rgba(182,137,255,.02)",
      );
    }

    const qs = [
      "¿uniformidad?",
      "¿leyes?",
      "¿fluctuaciones?",
      "¿antes?",
      "¿comprobable?",
    ];
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `760 ${Math.max(7, Math.min(11, width * 0.022))}px Inter,system-ui,sans-serif`;
    qs.forEach((q, i) => {
      ctx.fillStyle = `rgba(235,224,255,${0.12 + (i % 2) * 0.035})`;
      ctx.fillText(
        q,
        width * (0.11 + i * 0.195),
        height * (0.105 + (i % 2) * 0.026),
      );
    });
    ctx.restore();
  }

  function drawKnowableFrontier(time) {
    const bottom = height * 0.075;
    const veil = ctx.createLinearGradient(0, 0, 0, bottom);
    veil.addColorStop(0, "rgba(1,3,8,.98)");
    veil.addColorStop(0.55, "rgba(13,18,30,.76)");
    veil.addColorStop(1, "rgba(24,28,44,0)");
    ctx.fillStyle = veil;
    ctx.fillRect(0, 0, width, bottom * 1.3);

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const h of horizonCurves) {
      ctx.strokeStyle = `rgba(231,237,255,${h.a})`;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      const points = 70;
      for (let i = 0; i <= points; i++) {
        const x = (i / points) * width;
        const y =
          h.y * height +
          Math.sin(
            (i / points) * TAU * h.freq +
              h.phase +
              (reducedMotion ? 0 : time * 0.00012),
          ) *
            h.amp *
            height;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    for (const d of quietDust) {
      const pulse = reducedMotion
        ? 1
        : 0.45 + Math.abs(Math.sin(time * 0.0004 + d.phase)) * 0.55;
      ctx.fillStyle = `rgba(239,243,255,${d.a * pulse})`;
      ctx.beginPath();
      ctx.arc(d.x * width, d.y * height, d.r * sceneScale(), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawHandoff() {
    const top = height * 0.93;
    const grad = ctx.createLinearGradient(0, top, 0, height);
    grad.addColorStop(0, "rgba(164,137,255,0)");
    grad.addColorStop(0.42, "rgba(171,149,255,.08)");
    grad.addColorStop(1, "rgba(225,218,255,.13)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, top, width, height - top);

    ctx.save();
    ctx.strokeStyle = "rgba(225,220,255,.13)";
    ctx.lineWidth = 0.6;
    ctx.setLineDash([2, 5]);
    ctx.beginPath();
    ctx.moveTo(0, height * 0.94);
    ctx.lineTo(width, height * 0.94);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawScientificCues() {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(218,242,255,.17)";
    ctx.font = `850 ${Math.max(7, Math.min(10, width * 0.02))}px Inter,system-ui,sans-serif`;
    ctx.fillText(
      "NO TODAS LAS IDEAS CIENTÍFICAS TIENEN EL MISMO GRADO DE EVIDENCIA",
      width * 0.5,
      height * 0.73,
    );
    ctx.fillStyle = "rgba(255,206,166,.15)";
    ctx.fillText(
      "UNA PREDICCIÓN DEBE PODER FALLAR ANTE LOS DATOS",
      width * 0.5,
      height * 0.445,
    );
    ctx.fillStyle = "rgba(222,202,255,.15)";
    ctx.fillText(
      "NINGÚN MARCO DE GRAVEDAD CUÁNTICA ES AQUÍ LA RESPUESTA CONFIRMADA",
      width * 0.5,
      height * 0.205,
    );
    ctx.restore();
  }

  function drawBottomContinuity() {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.shadowBlur = 12;
    ctx.shadowColor = "rgba(184,150,255,.32)";
    ctx.fillStyle = "rgba(232,226,255,.58)";
    ctx.font = `850 ${Math.max(8, Math.min(11, width * 0.023))}px Inter,system-ui,sans-serif`;
    ctx.fillText(
      "EL LÍMITE DE LA FÍSICA CONOCIDA CONTINÚA DEBAJO",
      width * 0.5,
      height - Math.max(8, height * 0.012),
    );
    ctx.restore();
  }

  function drawTopTransition() {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.shadowBlur = 16;
    ctx.shadowColor = "rgba(190,211,255,.32)";
    ctx.fillStyle = "rgba(237,243,255,.64)";
    ctx.font = `840 ${Math.max(7, Math.min(10, width * 0.021))}px Inter,system-ui,sans-serif`;
    ctx.fillText(
      "OTRO CAMINO A TRAVÉS DEL TIEMPO",
      width * 0.5,
      Math.max(7, height * 0.006),
    );
    ctx.fillStyle = "rgba(255,255,255,.84)";
    ctx.font = `950 ${Math.max(8, Math.min(12, width * 0.026))}px Inter,system-ui,sans-serif`;
    ctx.fillText(
      "DEL UNIVERSO ACTUAL AL FUTURO CÓSMICO",
      width * 0.5,
      Math.max(21, height * 0.028),
    );
    ctx.fillStyle = "rgba(224,232,247,.52)";
    ctx.font = `760 ${Math.max(7, Math.min(9, width * 0.019))}px Inter,system-ui,sans-serif`;
    ctx.fillText(
      "ERA ESTELAR → OSCURIDAD CÓSMICA",
      width * 0.5,
      Math.max(38, height * 0.049),
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
    drawEvidenceBands();
    drawInitialQuestions(time);
    drawQuantumFrameworks(time);
    drawUndetected(time);
    drawPredictions(time);
    drawInference(time);
    drawFossilTraces(time);
    drawObservedData(time);
    drawHandoff();
    drawKnowableFrontier(time);
    drawScientificCues();
    drawBottomContinuity();
    drawTopTransition();
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
    });
    canvas.focus({ preventScroll: true });
    requestAnimationFrame(draw);
  }

  init();
}
