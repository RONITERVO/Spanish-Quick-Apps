import { setReadoutRegion } from "../../shared/narration-target.js";
import { createSceneAudio } from "../../shared/audio.js";
import {
  requestSceneFrame as requestAnimationFrame,
  cancelSceneFrame as cancelAnimationFrame,
} from "../../shared/animation.js";
import content from "./content.json";
const { ZONES } = content;

export function mountScene() {
  const canvas = document.getElementById("early-universe-spectrum");
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
  const hint = document.getElementById("hint");

  const TAU = Math.PI * 2;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const cmbSpots = [];
  const atoms = [];
  const plasmaParticles = [];
  const photonPaths = [];
  const nuclei = [];
  const leptonTracks = [];
  const quarks = [];
  const fieldLines = [];
  const inflationSeeds = [];
  const uncertainty = [];
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
    cmbSpots.length =
      atoms.length =
      plasmaParticles.length =
      photonPaths.length =
        0;
    nuclei.length = leptonTracks.length = quarks.length = fieldLines.length = 0;
    inflationSeeds.length = uncertainty.length = 0;

    const random = seeded(26071803);

    const cols = Math.max(18, Math.round(width / 25));
    const rows = Math.max(7, Math.round((height * 0.105) / 18));
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const seed = row * 997 + col * 37;
        cmbSpots.push({
          x: (col + 0.5 + (seededPoint(seed) - 0.5) * 0.9) / cols,
          y:
            0.895 +
            ((row + 0.5 + (seededPoint(seed + 7) - 0.5) * 0.8) / rows) * 0.105,
          rx: (0.75 + seededPoint(seed + 31) * 2.1) / cols,
          ry: ((0.6 + seededPoint(seed + 41) * 1.7) / rows) * 0.105,
          v: seededPoint(seed + 21),
          phase: seededPoint(seed + 51) * TAU,
        });
      }
    }

    for (let i = 0; i < 44; i++) {
      atoms.push({
        x: 0.02 + random() * 0.96,
        y: 0.79 + random() * 0.115,
        r: 2.5 + random() * 5,
        a: 0.14 + random() * 0.34,
        phase: random() * TAU,
        tilt: random() * TAU,
        hydrogen: random() > 0.2,
      });
    }

    const plasmaCount = Math.max(160, Math.round((width * height) / 4100));
    for (let i = 0; i < plasmaCount; i++) {
      plasmaParticles.push({
        x: random(),
        y: 0.62 + random() * 0.19,
        r: 0.45 + random() * 1.75,
        charge: random() > 0.5 ? 1 : -1,
        a: 0.12 + random() * 0.45,
        phase: random() * TAU,
        speed: 0.3 + random() * 1.4,
      });
    }

    for (let i = 0; i < 28; i++) {
      photonPaths.push({
        x: random(),
        y: 0.63 + random() * 0.25,
        length: 0.025 + random() * 0.08,
        bends: 3 + Math.floor(random() * 5),
        phase: random() * TAU,
        a: 0.08 + random() * 0.18,
      });
    }

    for (let i = 0; i < 39; i++) {
      const count = 2 + Math.floor(random() * 6);
      const parts = [];
      for (let j = 0; j < count; j++) {
        const a = random() * TAU;
        const rr = random() * (2 + count * 0.55);
        parts.push({
          a,
          rr,
          neutron: random() > 0.48,
          r: 1.2 + random() * 1.4,
        });
      }
      nuclei.push({
        x: 0.025 + random() * 0.95,
        y: 0.49 + random() * 0.145,
        parts,
        a: 0.25 + random() * 0.53,
        phase: random() * TAU,
        size: 0.75 + random() * 1.45,
      });
    }

    for (let i = 0; i < 64; i++) {
      leptonTracks.push({
        x: random(),
        y: 0.37 + random() * 0.135,
        angle: random() * TAU,
        length: 0.012 + random() * 0.055,
        curve: (random() - 0.5) * 0.04,
        kind: Math.floor(random() * 3),
        a: 0.12 + random() * 0.42,
        phase: random() * TAU,
        speed: 0.3 + random() * 1.8,
      });
    }

    const quarkCount = Math.max(115, Math.round((width * height) / 5600));
    for (let i = 0; i < quarkCount; i++) {
      quarks.push({
        x: random(),
        y: 0.255 + random() * 0.135,
        r: 0.7 + random() * 2.15,
        family: Math.floor(random() * 3),
        a: 0.2 + random() * 0.54,
        phase: random() * TAU,
        speed: 0.6 + random() * 2,
      });
    }

    for (let i = 0; i < 18; i++) {
      fieldLines.push({
        y: 0.15 + (i / 18) * 0.125,
        amp: 0.004 + random() * 0.015,
        freq: 1.2 + random() * 3.5,
        phase: random() * TAU,
        a: 0.06 + random() * 0.15,
        split: random(),
      });
    }

    const inflCols = Math.max(9, Math.round(width / 65));
    const inflRows = Math.max(4, Math.round((height * 0.11) / 36));
    for (let row = 0; row < inflRows; row++) {
      for (let col = 0; col < inflCols; col++) {
        inflationSeeds.push({
          x: (col + 0.5 + (random() - 0.5) * 0.35) / inflCols,
          y: 0.045 + ((row + 0.5 + (random() - 0.5) * 0.3) / inflRows) * 0.115,
          phase: random() * TAU,
          a: 0.08 + random() * 0.2,
          r: 0.6 + random() * 1.8,
        });
      }
    }

    for (let i = 0; i < 70; i++) {
      uncertainty.push({
        x: random(),
        y: random() * 0.065,
        length: 0.006 + random() * 0.035,
        angle: random() * TAU,
        phase: random() * TAU,
        a: 0.04 + random() * 0.18,
        width: 0.35 + random() * 1.1,
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
    const vertical = 0.91 + (1 - yNorm) * 0.37;
    const horizontal = 0.94 + xNorm * 0.13;
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
    droneGain.gain.setTargetAtTime(active ? 0.022 : 0.0001, now, 0.07);
    pulseOsc.frequency.setTargetAtTime(base * (2.01 + s.pulse), now, 0.05);
    pulseGain.gain.setTargetAtTime(active ? 0.006 : 0.0001, now, 0.08);
    noiseFilter.frequency.setTargetAtTime(s.filter * 1.28, now, 0.08);
    noiseGain.gain.setTargetAtTime(
      active ? Math.max(0.0001, s.noise * 0.12) : 0.0001,
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
    const scale = [1, 1.125, 1.25, 1.5, 1.6875][featureIndex % 5];
    osc.type = zone.sound.type;
    osc.frequency.setValueAtTime(zone.sound.base * 4.1 * scale, now);
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(45, zone.sound.base * 1.65),
      now + 0.42,
    );
    filter.type = "lowpass";
    filter.frequency.value = zone.sound.filter * 1.8;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.043, now + 0.012);
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
    const count = reducedMotion ? 5 : 14;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU;
      const speed = 20 + Math.random() * 90;
      particles.push({
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        r: 1 + Math.random() * 2.6,
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
    const progress = journeyFromY(yNorm);
    const zone = zoneForJourney(progress);
    const feature = featureFor(zone, xNorm);

    targetX = xNorm;
    targetY = yNorm;
    setCssPoint(x, y);
    setAccent(zone);
    root.style.setProperty("--progress", `${Math.max(1.2, progress * 100)}%`);

    touchOrb.style.left = `${x}px`;
    touchOrb.style.top = `${y}px`;
    scaleValue.textContent = zone.name;

    const changed = zone.id !== lastZoneId || feature.index !== lastFeature;
    if (changed || isNewPress) {
      setReadoutRegion(readout, zone.id);
      zoneName.textContent = zone.name;
      zoneName.className =
        zone.name.length > 25 ? "long" : zone.name.length > 17 ? "compact" : "";
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
      const zone = zoneForJourney(journeyFromY(targetY));
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
    g.addColorStop(0, "#08020e");
    g.addColorStop(0.055, "#140522");
    g.addColorStop(0.15, "#211039");
    g.addColorStop(0.26, "#1d1745");
    g.addColorStop(0.39, "#12203e");
    g.addColorStop(0.5, "#24302e");
    g.addColorStop(0.63, "#4b201f");
    g.addColorStop(0.77, "#552326");
    g.addColorStop(0.89, "#39261f");
    g.addColorStop(1, "#5f4938");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);

    const pulse = reducedMotion ? 1 : 0.92 + Math.sin(time * 0.00024) * 0.08;
    const haze = ctx.createRadialGradient(
      width * 0.5,
      height * 0.57,
      0,
      width * 0.5,
      height * 0.57,
      Math.max(width, height) * 0.85,
    );
    haze.addColorStop(0, `rgba(255,112,91,${0.055 * pulse})`);
    haze.addColorStop(0.52, "rgba(102,63,177,.026)");
    haze.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, width, height);
  }

  function drawCMB(time) {
    const top = height * 0.885;
    const base = ctx.createLinearGradient(0, top, 0, height);
    base.addColorStop(0, "rgba(43,27,24,.18)");
    base.addColorStop(0.28, "rgba(84,57,43,.82)");
    base.addColorStop(1, "rgba(105,79,56,.98)");
    ctx.fillStyle = base;
    ctx.fillRect(0, top, width, height - top);

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const s of cmbSpots) {
      const pulse = reducedMotion
        ? 1
        : 0.96 + Math.sin(time * 0.0002 + s.phase) * 0.04;
      const x = s.x * width;
      const y = s.y * height;
      const rx = s.rx * width * 1.45;
      const ry = s.ry * height * 1.6;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(1, ry / Math.max(1, rx));
      const warm = s.v > 0.52;
      const color = warm ? "255,186,103" : "105,151,222";
      const alpha = (0.035 + Math.abs(s.v - 0.5) * 0.12) * pulse;
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
      grad.addColorStop(0, `rgba(${color},${alpha})`);
      grad.addColorStop(0.72, `rgba(${color},${alpha * 0.45})`);
      grad.addColorStop(1, `rgba(${color},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, rx, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();

    const boundary = ctx.createLinearGradient(
      0,
      height * 0.865,
      0,
      height * 0.91,
    );
    boundary.addColorStop(0, "rgba(255,197,142,0)");
    boundary.addColorStop(0.62, "rgba(255,210,165,.17)");
    boundary.addColorStop(1, "rgba(255,197,142,0)");
    ctx.fillStyle = boundary;
    ctx.fillRect(0, height * 0.865, width, height * 0.055);
  }

  function drawRecombination(time) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const atom of atoms) {
      const drift = reducedMotion
        ? 0
        : Math.sin(time * 0.00035 * (1 + atom.r * 0.05) + atom.phase) * 2.3;
      const x = atom.x * width + drift;
      const y = atom.y * height + Math.cos(time * 0.00028 + atom.phase) * 1.8;
      const r = atom.r * sceneScale();
      const fade =
        smoothstep(0.79, 0.845, atom.y) * (1 - smoothstep(0.88, 0.91, atom.y));
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(atom.tilt + (reducedMotion ? 0 : time * 0.00003));
      ctx.strokeStyle = `rgba(255,224,195,${atom.a * fade})`;
      ctx.lineWidth = 0.55;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 2.15, r * 0.7, 0, 0, TAU);
      ctx.stroke();
      glow(
        0,
        0,
        r * 1.65,
        `rgba(255,177,102,${atom.a * 0.85 * fade})`,
        `rgba(255,101,72,${atom.a * 0.18 * fade})`,
      );
      const electronX =
        Math.cos(atom.phase + time * (reducedMotion ? 0 : 0.0011)) * r * 2.15;
      const electronY =
        Math.sin(atom.phase + time * (reducedMotion ? 0 : 0.0011)) * r * 0.7;
      glow(
        electronX,
        electronY,
        r * 0.55,
        `rgba(151,221,255,${atom.a * fade})`,
        `rgba(76,167,255,${atom.a * 0.12 * fade})`,
      );
      ctx.restore();
    }
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const escapeCount = 14;
    for (let i = 0; i < escapeCount; i++) {
      const x = ((i + 0.5) / escapeCount) * width;
      const phase = i * 1.77;
      const y = height * (0.8 + Math.sin(time * 0.00055 + phase) * 0.008);
      const len = height * (0.025 + (i % 3) * 0.006);
      const grad = ctx.createLinearGradient(x, y, x, y + len);
      grad.addColorStop(0, "rgba(255,243,221,0)");
      grad.addColorStop(0.5, "rgba(255,235,201,.24)");
      grad.addColorStop(1, "rgba(255,221,180,0)");
      ctx.strokeStyle = grad;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.sin(phase) * 5, y + len);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPrimordialPlasma(time) {
    const top = height * 0.61;
    const bottom = height * 0.815;
    const fog = ctx.createLinearGradient(0, top, 0, bottom);
    fog.addColorStop(0, "rgba(108,27,35,.1)");
    fog.addColorStop(0.32, "rgba(255,82,68,.16)");
    fog.addColorStop(0.74, "rgba(255,137,92,.24)");
    fog.addColorStop(1, "rgba(255,181,123,.08)");
    ctx.fillStyle = fog;
    ctx.fillRect(0, top, width, bottom - top);

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const p of plasmaParticles) {
      const dx = reducedMotion
        ? 0
        : Math.sin(time * 0.00046 * p.speed + p.phase) * 4.5;
      const dy = reducedMotion
        ? 0
        : Math.cos(time * 0.00039 * p.speed + p.phase) * 3;
      const x = p.x * width + dx;
      const y = p.y * height + dy;
      const r = p.r * sceneScale();
      const positive = p.charge > 0;
      glow(
        x,
        y,
        r * 4.6,
        positive
          ? `rgba(255,196,119,${p.a * 0.52})`
          : `rgba(128,207,255,${p.a * 0.58})`,
        positive
          ? `rgba(255,73,57,${p.a * 0.1})`
          : `rgba(75,113,255,${p.a * 0.1})`,
      );
      ctx.fillStyle = positive
        ? `rgba(255,228,181,${p.a})`
        : `rgba(210,243,255,${p.a})`;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(0.35, r * 0.55), 0, TAU);
      ctx.fill();
    }

    for (const path of photonPaths) {
      ctx.strokeStyle = `rgba(255,246,213,${path.a})`;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      let x = path.x * width;
      let y = path.y * height;
      ctx.moveTo(x, y);
      const segment = (path.length * width) / path.bends;
      for (let j = 1; j <= path.bends; j++) {
        const a = path.phase + j * 2.31 + (reducedMotion ? 0 : time * 0.0002);
        x += Math.cos(a) * segment;
        y += Math.sin(a) * segment * 0.55;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawNucleosynthesis(time) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const nucleus of nuclei) {
      const x =
        nucleus.x * width +
        (reducedMotion ? 0 : Math.sin(time * 0.00042 + nucleus.phase) * 2.4);
      const y =
        nucleus.y * height +
        (reducedMotion ? 0 : Math.cos(time * 0.00037 + nucleus.phase) * 1.8);
      const scale = nucleus.size * sceneScale();
      for (const part of nucleus.parts) {
        const px =
          x +
          Math.cos(part.a + time * (reducedMotion ? 0 : 0.00002)) *
            part.rr *
            scale;
        const py =
          y +
          Math.sin(part.a + time * (reducedMotion ? 0 : 0.00002)) *
            part.rr *
            scale;
        const r = part.r * scale;
        const color = part.neutron ? [126, 190, 255] : [255, 208, 99];
        glow(
          px,
          py,
          r * 3.1,
          `rgba(${color[0]},${color[1]},${color[2]},${nucleus.a * 0.66})`,
          `rgba(${color[0]},${color[1]},${color[2]},${nucleus.a * 0.1})`,
        );
        ctx.fillStyle = `rgba(255,249,229,${nucleus.a * 0.78})`;
        ctx.beginPath();
        ctx.arc(px, py, Math.max(0.4, r * 0.5), 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawLeptonEra(time) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const t of leptonTracks) {
      const motion = reducedMotion ? 0 : (time * 0.00002 * t.speed) % 1;
      const x = ((t.x + motion) % 1) * width;
      const y =
        t.y * height + Math.sin(time * 0.0007 * t.speed + t.phase) * 2.2;
      const len = t.length * width;
      const angle = t.angle + Math.sin(time * 0.00025 + t.phase) * 0.2;
      const color =
        t.kind === 0
          ? "129,229,255"
          : t.kind === 1
            ? "255,155,225"
            : "202,248,255";
      ctx.strokeStyle = `rgba(${color},${t.a})`;
      ctx.lineWidth = t.kind === 2 ? 0.45 : 0.7;
      ctx.beginPath();
      ctx.moveTo(
        x - Math.cos(angle) * len * 0.5,
        y - Math.sin(angle) * len * 0.5,
      );
      ctx.quadraticCurveTo(
        x + Math.cos(angle + Math.PI / 2) * t.curve * width,
        y + Math.sin(angle + Math.PI / 2) * t.curve * height,
        x + Math.cos(angle) * len * 0.5,
        y + Math.sin(angle) * len * 0.5,
      );
      ctx.stroke();
      glow(
        x,
        y,
        (t.kind === 2 ? 1.2 : 2.1) * sceneScale(),
        `rgba(${color},${t.a * 0.72})`,
        `rgba(${color},${t.a * 0.08})`,
      );
    }
    ctx.restore();
  }

  function drawQuarkEra(time) {
    const top = height * 0.245;
    const bottom = height * 0.4;
    ctx.save();
    const fluid = ctx.createLinearGradient(0, top, 0, bottom);
    fluid.addColorStop(0, "rgba(101,42,145,.08)");
    fluid.addColorStop(0.5, "rgba(181,57,186,.14)");
    fluid.addColorStop(1, "rgba(62,59,132,.08)");
    ctx.fillStyle = fluid;
    ctx.fillRect(0, top, width, bottom - top);
    ctx.globalCompositeOperation = "screen";

    for (const q of quarks) {
      const x =
        q.x * width +
        (reducedMotion
          ? 0
          : Math.sin(time * 0.00062 * q.speed + q.phase) * 3.2);
      const y =
        q.y * height +
        (reducedMotion
          ? 0
          : Math.cos(time * 0.00054 * q.speed + q.phase) * 2.6);
      const r = q.r * sceneScale();
      const palette =
        q.family === 0
          ? [255, 96, 121]
          : q.family === 1
            ? [94, 212, 255]
            : [255, 221, 89];
      glow(
        x,
        y,
        r * 4.2,
        `rgba(${palette[0]},${palette[1]},${palette[2]},${q.a * 0.56})`,
        `rgba(${palette[0]},${palette[1]},${palette[2]},${q.a * 0.1})`,
      );
      ctx.fillStyle = `rgba(255,255,244,${q.a * 0.76})`;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(0.4, r * 0.42), 0, TAU);
      ctx.fill();
    }

    ctx.strokeStyle = "rgba(238,188,255,.065)";
    ctx.lineWidth = 0.6;
    for (let i = 0; i < quarks.length - 1; i += 3) {
      const a = quarks[i];
      const b = quarks[(i + 5) % quarks.length];
      if (Math.abs(a.y - b.y) > 0.05 || Math.abs(a.x - b.x) > 0.14) continue;
      ctx.beginPath();
      ctx.moveTo(a.x * width, a.y * height);
      ctx.quadraticCurveTo(
        (a.x + b.x) * width * 0.5,
        (a.y + b.y) * height * 0.5 + Math.sin(i) * 4,
        b.x * width,
        b.y * height,
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawElectroweak(time) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const line of fieldLines) {
      const y0 = line.y * height;
      const amp = line.amp * height;
      const phase = line.phase + (reducedMotion ? 0 : time * 0.00025);
      ctx.strokeStyle = `rgba(153,178,255,${line.a})`;
      ctx.lineWidth = 0.55;
      ctx.beginPath();
      const segments = 44;
      for (let i = 0; i <= segments; i++) {
        const x = (i / segments) * width;
        const unified = 1 - smoothstep(0.15, 0.27, line.y);
        const splitWave =
          Math.sin((i / segments) * TAU * line.freq + phase) * amp;
        const second =
          Math.sin((i / segments) * TAU * (line.freq * 0.5) - phase * 0.7) *
          amp *
          line.split *
          (1 - unified);
        const y = y0 + splitWave + second;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    const nodeCount = 13;
    for (let i = 0; i < nodeCount; i++) {
      const x = ((i + 0.5) / nodeCount) * width;
      const y =
        height *
        (0.19 + Math.sin(i * 1.9 + time * (reducedMotion ? 0 : 0.0002)) * 0.02);
      glow(
        x,
        y,
        8 * sceneScale(),
        "rgba(187,205,255,.19)",
        "rgba(103,112,255,.035)",
      );
    }
    ctx.restore();
  }

  function drawInflation(time) {
    const top = height * 0.04;
    const bottom = height * 0.17;
    const phase = reducedMotion ? 0.5 : (time * 0.000035) % 1;
    const stretch = 1 + phase * 1.4;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, top, width, bottom - top);
    ctx.clip();
    ctx.globalCompositeOperation = "screen";

    for (let i = 0; i < 11; i++) {
      const baseX = (i / 10) * width;
      const x = width * 0.5 + (baseX - width * 0.5) * stretch;
      const alpha = 0.085 * (1 - phase * 0.45);
      const grad = ctx.createLinearGradient(x, top, x, bottom);
      grad.addColorStop(0, "rgba(208,179,255,0)");
      grad.addColorStop(0.5, `rgba(208,179,255,${alpha})`);
      grad.addColorStop(1, "rgba(208,179,255,0)");
      ctx.strokeStyle = grad;
      ctx.lineWidth = 0.55;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
      ctx.stroke();
    }

    for (let j = 0; j < 7; j++) {
      const baseY = top + (j / 6) * (bottom - top);
      const center = (top + bottom) * 0.5;
      const y = center + (baseY - center) * (1 + phase * 0.8);
      ctx.strokeStyle = `rgba(196,172,255,${0.06 * (1 - phase * 0.35)})`;
      ctx.lineWidth = 0.55;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    for (const seed of inflationSeeds) {
      const sx = width * 0.5 + (seed.x * width - width * 0.5) * stretch;
      const syCenter = height * 0.105;
      const sy = syCenter + (seed.y * height - syCenter) * (1 + phase * 0.8);
      const pulse = reducedMotion
        ? 1
        : 0.86 + Math.sin(time * 0.0009 + seed.phase) * 0.14;
      glow(
        sx,
        sy,
        seed.r * 8 * sceneScale() * pulse,
        `rgba(234,217,255,${seed.a * 0.65})`,
        `rgba(164,102,255,${seed.a * 0.1})`,
      );
    }

    const veil = ctx.createLinearGradient(0, top, 0, bottom);
    veil.addColorStop(0, "rgba(13,3,22,.34)");
    veil.addColorStop(0.5, "rgba(178,96,255,.055)");
    veil.addColorStop(1, "rgba(31,17,63,.1)");
    ctx.fillStyle = veil;
    ctx.fillRect(0, top, width, bottom - top);
    ctx.restore();
  }

  function drawUncertainty(time) {
    const top = 0;
    const bottom = height * 0.07;
    const veil = ctx.createLinearGradient(0, top, 0, bottom);
    veil.addColorStop(0, "rgba(2,0,7,.96)");
    veil.addColorStop(0.55, "rgba(26,9,42,.74)");
    veil.addColorStop(1, "rgba(25,8,45,0)");
    ctx.fillStyle = veil;
    ctx.fillRect(0, top, width, bottom);

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const u of uncertainty) {
      const x =
        u.x * width +
        (reducedMotion ? 0 : Math.sin(time * 0.0003 + u.phase) * 5);
      const y = u.y * height;
      const len = u.length * width;
      ctx.strokeStyle = `rgba(235,220,255,${u.a})`;
      ctx.lineWidth = u.width;
      ctx.beginPath();
      ctx.moveTo(
        x - Math.cos(u.angle) * len * 0.5,
        y - Math.sin(u.angle) * len * 0.5,
      );
      ctx.lineTo(
        x + Math.cos(u.angle) * len * 0.5,
        y + Math.sin(u.angle) * len * 0.5,
      );
      ctx.stroke();
    }
    ctx.restore();

    const fade = ctx.createLinearGradient(0, height * 0.018, 0, height * 0.085);
    fade.addColorStop(0, "rgba(255,255,255,.035)");
    fade.addColorStop(0.4, "rgba(220,194,255,.018)");
    fade.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, width, height * 0.09);
  }

  function drawScientificCues() {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(255,230,209,.19)";
    ctx.font = `800 ${Math.max(7, Math.min(9, width * 0.018))}px Inter,system-ui,sans-serif`;
    ctx.fillText(
      "ANTES DEL FONDO CÓSMICO, LA HISTORIA SE RECONSTRUYE MEDIANTE EVIDENCIAS",
      width * 0.5,
      height * 0.69,
    );
    ctx.fillStyle = "rgba(215,201,255,.21)";
    ctx.fillText(
      "LA INFLACIÓN EXPANDE EL ESPACIO EN TODAS PARTES · NO EXPLOTA DESDE UN CENTRO",
      width * 0.5,
      height * 0.115,
    );
    ctx.restore();
  }

  function drawBottomContinuity() {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.shadowBlur = 12;
    ctx.shadowColor = "rgba(255,171,111,.32)";
    ctx.fillStyle = "rgba(255,229,205,.57)";
    ctx.font = `850 ${Math.max(8, Math.min(11, width * 0.023))}px Inter,system-ui,sans-serif`;
    ctx.fillText(
      "EL FONDO CÓSMICO CONTINÚA DEBAJO",
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
    ctx.shadowColor = "rgba(188,139,255,.4)";
    ctx.fillStyle = "rgba(245,231,255,.67)";
    ctx.font = `850 ${Math.max(7, Math.min(10, width * 0.021))}px Inter,system-ui,sans-serif`;
    ctx.fillText(
      "MÁS ALLÁ DE LA EVIDENCIA ACTUAL",
      width * 0.5,
      Math.max(7, height * 0.006),
    );
    ctx.fillStyle = "rgba(255,248,255,.82)";
    ctx.font = `950 ${Math.max(8, Math.min(12, width * 0.026))}px Inter,system-ui,sans-serif`;
    ctx.fillText(
      "GRAVEDAD CUÁNTICA · CONDICIONES INICIALES · ORIGEN",
      width * 0.5,
      Math.max(21, height * 0.028),
    );
    ctx.fillStyle = "rgba(229,211,244,.53)";
    ctx.font = `760 ${Math.max(7, Math.min(9, width * 0.019))}px Inter,system-ui,sans-serif`;
    ctx.fillText(
      "PREGUNTAS ABIERTAS · NO UN PRIMER MOMENTO OBSERVADO",
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
    drawInflation(time);
    drawElectroweak(time);
    drawQuarkEra(time);
    drawLeptonEra(time);
    drawNucleosynthesis(time);
    drawPrimordialPlasma(time);
    drawRecombination(time);
    drawCMB(time);
    drawUncertainty(time);
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
