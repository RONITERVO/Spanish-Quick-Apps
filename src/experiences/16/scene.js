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
  const canvas = document.getElementById("life-spectrum");
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
  let targetY = 0.94;
  let pointerX = 0.5;
  let pointerY = 0.94;
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
  let currentProgress = 0.03;
  let touchEnergy = 0;

  const motes = [];
  const cells = [];
  const genes = [];
  const organisms = [];
  const neurons = [];
  const ecosystemNodes = [];
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
    cells.length = 0;
    genes.length = 0;
    organisms.length = 0;
    neurons.length = 0;
    ecosystemNodes.length = 0;

    const moteCount = reducedMotion
      ? 85
      : Math.round(clamp((width * height) / 5600, 120, 280));
    for (let i = 0; i < moteCount; i++) {
      motes.push({
        x: seeded(i + 1),
        y: seeded(i + 1000),
        vx: (seeded(i + 2000) - 0.5) * 0.035,
        vy: (seeded(i + 3000) - 0.5) * 0.035,
        r: 0.8 + seeded(i + 4000) * 2.7,
        phase: seeded(i + 5000) * TAU,
        kind: i % 9,
      });
    }

    for (let i = 0; i < 24; i++) {
      cells.push({
        x: 0.08 + seeded(i + 6000) * 0.84,
        y: 0.12 + seeded(i + 7000) * 0.76,
        r: 0.022 + seeded(i + 8000) * 0.045,
        phase: seeded(i + 9000) * TAU,
        type: i % 6,
        drift: 0.4 + seeded(i + 10000) * 0.9,
      });
    }

    for (let i = 0; i < 36; i++) {
      genes.push({
        t: i / 35,
        phase: seeded(i + 11000) * TAU,
        mutation: seeded(i + 12000) > 0.88,
        variant: i % 5,
      });
    }

    for (let i = 0; i < 16; i++) {
      organisms.push({
        x: 0.08 + seeded(i + 13000) * 0.84,
        y: 0.18 + seeded(i + 14000) * 0.64,
        size: 0.018 + seeded(i + 15000) * 0.045,
        phase: seeded(i + 16000) * TAU,
        type: i % 8,
        direction: seeded(i + 17000) > 0.5 ? 1 : -1,
      });
    }

    for (let i = 0; i < 55; i++) {
      const a = seeded(i + 18000) * TAU;
      const r = Math.sqrt(seeded(i + 19000)) * 0.45;
      neurons.push({
        x: 0.5 + Math.cos(a) * r,
        y: 0.5 + Math.sin(a) * r * 0.78,
        r: 1.7 + seeded(i + 20000) * 4.2,
        phase: seeded(i + 21000) * TAU,
        hub: seeded(i + 22000) > 0.82,
      });
    }

    for (let i = 0; i < 31; i++) {
      ecosystemNodes.push({
        x: 0.06 + seeded(i + 23000) * 0.88,
        y: 0.12 + seeded(i + 24000) * 0.76,
        r: 2 + seeded(i + 25000) * 6,
        phase: seeded(i + 26000) * TAU,
        level: i % 4,
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
        [2, 11, 14],
        [5, 34, 29],
      ],
      [
        [3, 18, 21],
        [7, 48, 36],
      ],
      [
        [4, 23, 19],
        [25, 58, 31],
      ],
      [
        [18, 24, 16],
        [74, 60, 21],
      ],
      [
        [31, 21, 17],
        [96, 42, 31],
      ],
      [
        [29, 13, 31],
        [90, 30, 77],
      ],
      [
        [18, 20, 50],
        [38, 58, 112],
      ],
      [
        [10, 31, 48],
        [25, 101, 116],
      ],
      [
        [20, 23, 68],
        [86, 55, 132],
      ],
      [
        [37, 23, 60],
        [139, 88, 130],
      ],
      [
        [45, 34, 46],
        [170, 124, 78],
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
      0.5,
      `rgb(${Math.round((bottom[0] + top[0]) * 0.45)} ${Math.round((bottom[1] + top[1]) * 0.45)} ${Math.round((bottom[2] + top[2]) * 0.45)})`,
    );
    g.addColorStop(1, `rgb(${top[0]} ${top[1]} ${top[2]})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);

    const horizon = mix(height * 0.78, height * 0.28, progress);
    const glow = ctx.createRadialGradient(
      width * 0.5,
      horizon,
      0,
      width * 0.5,
      horizon,
      Math.max(width, height) * 0.72,
    );
    glow.addColorStop(
      0,
      `rgba(${90 + progress * 135},${220 - progress * 35},${172 + progress * 50},${0.08 + progress * 0.07})`,
    );
    glow.addColorStop(0.55, "rgba(90,170,160,.025)");
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    for (let i = 0; i < motes.length; i++) {
      const m = motes[i];
      m.x = fract(m.x + m.vx * 0.0025);
      m.y = fract(m.y + m.vy * 0.0025);
      const x = m.x * width + Math.sin(time * 0.12 + m.phase) * 7;
      const y = m.y * height + Math.cos(time * 0.09 + m.phase) * 6;
      const twinkle = 0.16 + 0.22 * (1 + Math.sin(time * 0.7 + m.phase)) * 0.5;
      const color =
        m.kind % 3 === 0
          ? [110, 255, 195]
          : m.kind % 3 === 1
            ? [255, 190, 115]
            : [180, 170, 255];
      ctx.fillStyle = rgba(color, twinkle * (0.65 + progress * 0.4));
      ctx.beginPath();
      ctx.arc(x, y, m.r * (0.65 + progress * 0.3), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawMembrane(
    cx,
    cy,
    r,
    color,
    time,
    phase = 0,
    thickness = 1.5,
    fillAlpha = 0.045,
  ) {
    ctx.save();
    const fill = ctx.createRadialGradient(
      cx - r * 0.3,
      cy - r * 0.3,
      0,
      cx,
      cy,
      r * 1.15,
    );
    fill.addColorStop(0, rgba(color, fillAlpha * 2.4));
    fill.addColorStop(1, rgba(color, fillAlpha * 0.25));
    ctx.fillStyle = fill;
    ctx.beginPath();
    for (let k = 0; k <= 64; k++) {
      const a = (k / 64) * TAU;
      const wobble =
        1 +
        0.035 * Math.sin(a * 5 + time * 0.55 + phase) +
        0.02 * Math.sin(a * 9 - time * 0.35 + phase);
      const x = cx + Math.cos(a) * r * wobble;
      const y = cy + Math.sin(a) * r * wobble;
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = rgba(color, 0.48);
    ctx.lineWidth = thickness;
    ctx.stroke();
    ctx.restore();
  }

  function drawThreshold(progress, time, alpha) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const s = Math.min(width, height);
    const cx = width * 0.5;
    const cy = height * 0.52;
    const r = s * (0.16 + 0.012 * Math.sin(time * 0.55));
    const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 3);
    halo.addColorStop(0, "rgba(99,255,190,.2)");
    halo.addColorStop(0.4, "rgba(72,220,190,.07)");
    halo.addColorStop(1, "rgba(50,220,180,0)");
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, width, height);
    drawMembrane(cx, cy, r, [99, 255, 190], time, 0, 2.1, 0.07);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU + time * (0.04 + (i % 4) * 0.01);
      const rr = r * (0.13 + 0.67 * seeded(i + 30000));
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      const c =
        i % 4 === 0
          ? [255, 135, 188]
          : i % 3 === 0
            ? [255, 221, 91]
            : [92, 240, 193];
      ctx.fillStyle = rgba(c, 0.58);
      ctx.beginPath();
      ctx.arc(x, y, 1.7 + (i % 3), 0, TAU);
      ctx.fill();
      const j = (i + 7) % 24;
      const aj = (j / 24) * TAU + time * (0.04 + (j % 4) * 0.01);
      const rrj = r * (0.13 + 0.67 * seeded(j + 30000));
      ctx.strokeStyle = "rgba(130,255,205,.08)";
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(cx + Math.cos(aj) * rrj, cy + Math.sin(aj) * rrj);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCellPopulation(progress, time, alpha) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const s = Math.min(width, height);
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      const x =
        c.x * width + Math.sin(time * 0.18 * c.drift + c.phase) * s * 0.02;
      const y =
        c.y * height + Math.cos(time * 0.15 * c.drift + c.phase) * s * 0.015;
      const r = c.r * s * (1 + 0.08 * Math.sin(time * 0.6 + c.phase));
      const col =
        c.type % 3 === 0
          ? [64, 232, 198]
          : c.type % 3 === 1
            ? [97, 232, 145]
            : [99, 204, 255];
      drawMembrane(x, y, r, col, time, c.phase, 1.1, 0.035);
      for (let k = 0; k < 4 + (c.type % 4); k++) {
        const a = c.phase + k * 1.7 + time * 0.12;
        const rr = r * (0.18 + 0.5 * seeded(i * 17 + k + 31000));
        ctx.fillStyle =
          k % 2 ? rgba([255, 194, 94], 0.48) : rgba([118, 245, 199], 0.52);
        ctx.beginPath();
        ctx.arc(
          x + Math.cos(a) * rr,
          y + Math.sin(a) * rr,
          1.3 + (k % 3),
          0,
          TAU,
        );
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawMetabolism(progress, time, alpha) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const cx = width * 0.5,
      cy = height * 0.5,
      s = Math.min(width, height),
      r = s * 0.23;
    drawMembrane(cx, cy, r, [104, 236, 111], time, 0.5, 1.7, 0.03);
    for (let path = 0; path < 7; path++) {
      ctx.strokeStyle =
        path % 2 ? "rgba(254,220,85,.28)" : "rgba(105,244,139,.28)";
      ctx.lineWidth = 1.2 + (path % 3) * 0.45;
      ctx.beginPath();
      for (let k = 0; k <= 60; k++) {
        const t = k / 60;
        const a =
          t * TAU * (1.2 + path * 0.08) + path + time * (0.08 + path * 0.006);
        const rr = r * (0.15 + 0.7 * t) * (1 - 0.35 * t);
        const x = cx + Math.cos(a) * rr + Math.sin(t * 8 + path) * r * 0.08;
        const y = cy + Math.sin(a * 0.88) * rr;
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      const t = fract(time * (0.1 + path * 0.009) + path * 0.14);
      const a =
        t * TAU * (1.2 + path * 0.08) + path + time * (0.08 + path * 0.006);
      const rr = r * (0.15 + 0.7 * t) * (1 - 0.35 * t);
      ctx.fillStyle =
        path % 2 ? "rgba(255,230,105,.82)" : "rgba(121,255,159,.78)";
      ctx.beginPath();
      ctx.arc(
        cx + Math.cos(a) * rr + Math.sin(t * 8 + path) * r * 0.08,
        cy + Math.sin(a * 0.88) * rr,
        3.2,
        0,
        TAU,
      );
      ctx.fill();
    }
    for (let i = 0; i < 16; i++) {
      const side = i % 2 ? -1 : 1;
      const y = height * (0.14 + (i / 16) * 0.72);
      const x = cx + side * r * (1.05 + 0.22 * Math.sin(time + i));
      ctx.strokeStyle =
        i % 3 ? "rgba(120,255,155,.22)" : "rgba(255,173,90,.25)";
      ctx.beginPath();
      ctx.moveTo(x + side * s * 0.08, y);
      ctx.lineTo(x, y + Math.sin(time + i) * 8);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawGenetics(progress, time, alpha) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const left = width * 0.17,
      right = width * 0.83,
      cy = height * 0.5;
    for (let i = 0; i < genes.length; i++) {
      const g = genes[i];
      const x = mix(left, right, g.t);
      const amp = height * (0.11 + 0.018 * Math.sin(g.t * TAU));
      const phase = g.t * TAU * 3.2 + time * 0.65;
      const y1 = cy + Math.sin(phase) * amp;
      const y2 = cy - Math.sin(phase) * amp;
      const mutation = g.mutation && Math.sin(time * 1.7 + g.phase) > 0.15;
      ctx.strokeStyle = mutation
        ? "rgba(255,96,146,.75)"
        : "rgba(202,244,89,.32)";
      ctx.lineWidth = mutation ? 2.2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, y1);
      ctx.lineTo(x, y2);
      ctx.stroke();
      ctx.fillStyle = mutation
        ? "rgba(255,106,153,.9)"
        : "rgba(205,246,100,.68)";
      ctx.beginPath();
      ctx.arc(x, y1, mutation ? 4 : 2.5, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "rgba(113,232,170,.63)";
      ctx.beginPath();
      ctx.arc(x, y2, 2.5, 0, TAU);
      ctx.fill();
      if (i > 0) {
        const prev = genes[i - 1];
        const px = mix(left, right, prev.t);
        const pp = prev.t * TAU * 3.2 + time * 0.65;
        ctx.strokeStyle = "rgba(220,245,120,.2)";
        ctx.beginPath();
        ctx.moveTo(px, cy + Math.sin(pp) * amp);
        ctx.lineTo(x, y1);
        ctx.stroke();
        ctx.strokeStyle = "rgba(113,232,170,.18)";
        ctx.beginPath();
        ctx.moveTo(px, cy - Math.sin(pp) * amp);
        ctx.lineTo(x, y2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawEvolution(progress, time, alpha) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const roots = 8;
    for (let i = 0; i < roots; i++) {
      const x0 = width * (0.08 + (i / (roots - 1)) * 0.84);
      const y0 = height * 0.86;
      ctx.strokeStyle = `rgba(${210 + i * 4},${180 + i * 6},${75 + i * 10},${0.14 + i * 0.012})`;
      ctx.lineWidth = 1.1 + (i % 3) * 0.5;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      let x = x0;
      for (let k = 1; k <= 15; k++) {
        const t = k / 15;
        const y = mix(y0, height * 0.12, t);
        x =
          x0 +
          Math.sin(t * 8 + i * 1.2) * width * 0.035 +
          (seeded(i * 22 + k + 32000) - 0.5) * width * 0.035 * t;
        ctx.lineTo(x, y);
        if ((k + i) % 5 === 0) {
          const bx = x + (seeded(i * 43 + k + 33000) - 0.5) * width * 0.16;
          ctx.moveTo(x, y);
          ctx.lineTo(bx, y - height * (0.05 + seeded(k + i) * 0.05));
          ctx.moveTo(x, y);
        }
      }
      ctx.stroke();
      const pulse = fract(time * 0.07 + i / roots);
      const py = mix(y0, height * 0.12, pulse);
      const px = x0 + Math.sin(pulse * 8 + i * 1.2) * width * 0.035;
      ctx.fillStyle = "rgba(255,226,92,.68)";
      ctx.beginPath();
      ctx.arc(px, py, 2.4 + Math.sin(pulse * Math.PI) * 2, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPhotosynthesis(progress, time, alpha) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const sunX = width * 0.5,
      sunY = -height * 0.08,
      sunR = Math.min(width, height) * 0.23;
    const sun = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR * 3.5);
    sun.addColorStop(0, "rgba(255,244,160,.36)");
    sun.addColorStop(0.25, "rgba(255,185,70,.12)");
    sun.addColorStop(1, "rgba(255,160,50,0)");
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, width, height);
    for (let i = 0; i < 16; i++) {
      const x = width * (i / 15);
      ctx.strokeStyle = `rgba(255,216,112,${0.045 + (i % 3) * 0.02})`;
      ctx.lineWidth = 2 + (i % 4);
      ctx.beginPath();
      ctx.moveTo(sunX, sunY);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    const seaY = height * 0.58;
    const sea = ctx.createLinearGradient(0, seaY, 0, height);
    sea.addColorStop(0, "rgba(28,102,98,.2)");
    sea.addColorStop(1, "rgba(4,35,42,.5)");
    ctx.fillStyle = sea;
    ctx.fillRect(0, seaY, width, height - seaY);
    for (let i = 0; i < 34; i++) {
      const x = width * (0.04 + seeded(i + 34000) * 0.92);
      const baseY = height * (0.72 + seeded(i + 35000) * 0.25);
      const h = height * (0.02 + seeded(i + 36000) * 0.08);
      ctx.fillStyle = i % 3 ? "rgba(115,225,91,.23)" : "rgba(225,181,63,.2)";
      ctx.fillRect(x, baseY - h, 3 + (i % 5), h);
      const bubbleT = fract(
        time * (0.05 + (i % 7) * 0.004) + seeded(i + 37000),
      );
      const by = mix(baseY - h, seaY - height * 0.2, bubbleT);
      ctx.strokeStyle = `rgba(171,234,255,${0.1 + 0.34 * Math.sin(bubbleT * Math.PI)})`;
      ctx.beginPath();
      ctx.arc(x + Math.sin(bubbleT * 7 + i) * 7, by, 2 + (i % 3), 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawEukaryote(progress, time, alpha) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const s = Math.min(width, height),
      cx = width * 0.5,
      cy = height * 0.5,
      r = s * 0.28;
    drawMembrane(cx, cy, r, [255, 131, 86], time, 0.7, 2, 0.045);
    drawMembrane(
      cx - r * 0.08,
      cy - r * 0.04,
      r * 0.31,
      [178, 124, 255],
      time,
      1.8,
      1.6,
      0.06,
    );
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + time * 0.08;
      const rr = r * (0.4 + 0.2 * seeded(i + 38000));
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr * 0.72;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a + time * 0.1);
      ctx.strokeStyle = "rgba(255,161,92,.55)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.12, r * 0.055, 0, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,213,104,.32)";
      ctx.beginPath();
      for (let k = -2; k <= 2; k++) {
        ctx.moveTo(-r * 0.08, k * r * 0.013);
        ctx.bezierCurveTo(
          -r * 0.03,
          k * r * 0.03,
          r * 0.03,
          -k * r * 0.03,
          r * 0.08,
          k * r * 0.013,
        );
      }
      ctx.stroke();
      ctx.restore();
    }
    ctx.strokeStyle = "rgba(255,151,115,.16)";
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 11; i++) {
      ctx.beginPath();
      const y0 = cy + (i - 5) * r * 0.07;
      ctx.moveTo(cx - r * 0.55, y0);
      ctx.bezierCurveTo(
        cx - r * 0.25,
        y0 - r * 0.18,
        cx + r * 0.15,
        y0 + r * 0.2,
        cx + r * 0.55,
        y0 - r * 0.04,
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawRecombination(progress, time, alpha) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const cy = height * 0.5;
    for (let side = -1; side <= 1; side += 2) {
      const col = side < 0 ? [255, 105, 152] : [120, 180, 255];
      ctx.strokeStyle = rgba(col, 0.34);
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= 80; i++) {
        const t = i / 80;
        const x =
          side < 0
            ? mix(width * 0.04, width * 0.5, t)
            : mix(width * 0.96, width * 0.5, t);
        const y =
          cy +
          side * Math.sin(t * TAU * 2 + time * 0.5) * height * 0.15 * (1 - t) +
          Math.sin(t * 9 + time) * 8;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      for (let i = 0; i < 14; i++) {
        const t = fract(time * 0.06 + i / 14);
        const x =
          side < 0
            ? mix(width * 0.04, width * 0.5, t)
            : mix(width * 0.96, width * 0.5, t);
        const y =
          cy +
          side * Math.sin(t * TAU * 2 + time * 0.5) * height * 0.15 * (1 - t) +
          Math.sin(t * 9 + time) * 8;
        ctx.fillStyle = rgba(col, 0.62 * Math.sin(t * Math.PI));
        ctx.beginPath();
        ctx.arc(x, y, 2.5 + (i % 3), 0, TAU);
        ctx.fill();
      }
    }
    const r = Math.min(width, height) * (0.12 + 0.008 * Math.sin(time));
    drawMembrane(width * 0.5, cy, r, [255, 115, 162], time, 2, 1.7, 0.05);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU;
      const rr = r * (0.2 + 0.55 * seeded(i + 39000));
      ctx.fillStyle = i % 2 ? "rgba(120,181,255,.65)" : "rgba(255,121,165,.65)";
      ctx.beginPath();
      ctx.arc(
        width * 0.5 + Math.cos(a + time * 0.08) * rr,
        cy + Math.sin(a + time * 0.08) * rr,
        2.4,
        0,
        TAU,
      );
      ctx.fill();
    }
    ctx.restore();
  }

  function drawMulticellular(progress, time, alpha) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const s = Math.min(width, height);
    const cols = Math.max(7, Math.floor(width / 75));
    const rows = Math.max(9, Math.floor(height / 70));
    const dx = width / (cols + 1),
      dy = height / (rows + 1);
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const x = dx * (i + 1) + Math.sin(time * 0.22 + i * 0.7 + j) * 4;
        const y = dy * (j + 1) + Math.cos(time * 0.19 + j * 0.8 + i) * 4;
        const region = j / Math.max(1, rows - 1);
        const col =
          region < 0.33
            ? [246, 102, 205]
            : region < 0.66
              ? [180, 110, 245]
              : [112, 175, 255];
        const r = s * (0.018 + 0.004 * Math.sin(i + j + time));
        drawMembrane(x, y, r, col, time, i + j, 0.8, 0.03);
        if (i < cols - 1) {
          ctx.strokeStyle = rgba(col, 0.1);
          ctx.beginPath();
          ctx.moveTo(x + r, y);
          ctx.lineTo(x + dx - r, y + Math.sin(i + j) * 4);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  function drawDevelopment(progress, time, alpha) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const s = Math.min(width, height),
      cx = width * 0.5,
      cy = height * 0.5;
    for (let layer = 0; layer < 4; layer++) {
      const r = s * (0.08 + layer * 0.07);
      const count = 9 + layer * 7;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * TAU + time * (0.025 + layer * 0.006);
        const wobble = 1 + 0.08 * Math.sin(a * (3 + layer) + time * 0.4);
        const x = cx + Math.cos(a) * r * wobble;
        const y = cy + Math.sin(a) * r * 0.78 * wobble;
        const col =
          layer === 0
            ? [255, 183, 102]
            : layer === 1
              ? [238, 101, 203]
              : layer === 2
                ? [174, 109, 246]
                : [111, 172, 255];
        ctx.fillStyle = rgba(col, 0.36 + layer * 0.06);
        ctx.beginPath();
        ctx.arc(x, y, 5 + layer * 1.1, 0, TAU);
        ctx.fill();
      }
    }
    const grad = ctx.createLinearGradient(width * 0.15, 0, width * 0.85, 0);
    grad.addColorStop(0, "rgba(255,112,196,.05)");
    grad.addColorStop(0.5, "rgba(180,110,245,.2)");
    grad.addColorStop(1, "rgba(105,178,255,.05)");
    ctx.fillStyle = grad;
    ctx.fillRect(width * 0.1, height * 0.15, width * 0.8, height * 0.7);
    ctx.restore();
  }

  function drawOrganisms(progress, time, alpha) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const s = Math.min(width, height);
    for (let i = 0; i < organisms.length; i++) {
      const o = organisms[i];
      const x = o.x * width + Math.sin(time * 0.18 + o.phase) * s * 0.025;
      const y = o.y * height + Math.cos(time * 0.15 + o.phase) * s * 0.02;
      const r = o.size * s;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(o.direction, 1);
      const col =
        o.type % 3 === 0
          ? [104, 201, 255]
          : o.type % 3 === 1
            ? [255, 145, 120]
            : [185, 127, 255];
      ctx.fillStyle = rgba(col, 0.18);
      ctx.strokeStyle = rgba(col, 0.48);
      ctx.lineWidth = 1.3;
      if (o.type % 4 === 0) {
        ctx.beginPath();
        ctx.ellipse(
          0,
          0,
          r * 1.5,
          r * 0.6,
          Math.sin(time + o.phase) * 0.15,
          0,
          TAU,
        );
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-r * 1.2, 0);
        ctx.lineTo(-r * 2, -r * 0.55);
        ctx.lineTo(-r * 1.8, r * 0.55);
        ctx.closePath();
        ctx.stroke();
      } else if (o.type % 4 === 1) {
        ctx.beginPath();
        ctx.arc(0, -r * 0.4, r * 0.55, 0, TAU);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, r * 1.5);
        ctx.moveTo(0, r * 0.6);
        ctx.lineTo(-r, r * 1.2);
        ctx.moveTo(0, r * 0.6);
        ctx.lineTo(r, r * 1.2);
        ctx.stroke();
      } else if (o.type % 4 === 2) {
        ctx.beginPath();
        ctx.moveTo(0, r);
        ctx.quadraticCurveTo(-r * 1.2, 0, 0, -r * 1.4);
        ctx.quadraticCurveTo(r * 1.2, 0, 0, r);
        ctx.stroke();
        for (let k = 0; k < 4; k++) {
          ctx.beginPath();
          ctx.moveTo(0, r * 0.5);
          ctx.quadraticCurveTo(
            (k - 1.5) * r,
            r * 1.4,
            (k - 1.5) * r * 0.7,
            r * 2,
          );
          ctx.stroke();
        }
      } else {
        ctx.beginPath();
        ctx.ellipse(0, 0, r, r * 1.4, 0, 0, TAU);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-r * 0.8, -r * 0.5);
        ctx.lineTo(-r * 1.8, -r * 1.2);
        ctx.moveTo(r * 0.8, -r * 0.5);
        ctx.lineTo(r * 1.8, -r * 1.2);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  function drawEcosystem(progress, time, alpha) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    for (let i = 0; i < ecosystemNodes.length; i++) {
      const a = ecosystemNodes[i];
      for (let j = i + 1; j < ecosystemNodes.length; j++) {
        const b = ecosystemNodes[j];
        const dx = (a.x - b.x) * width,
          dy = (a.y - b.y) * height;
        const d = Math.hypot(dx, dy);
        if (
          d < Math.min(width, height) * 0.24 &&
          Math.abs(a.level - b.level) <= 2
        ) {
          ctx.strokeStyle = `rgba(${70 + a.level * 45},${190 + b.level * 13},${255 - a.level * 40},${0.045 + (1 - d / (Math.min(width, height) * 0.24)) * 0.1})`;
          ctx.lineWidth = 0.7 + (a.level === b.level ? 0.2 : 0.6);
          ctx.beginPath();
          ctx.moveTo(a.x * width, a.y * height);
          ctx.lineTo(b.x * width, b.y * height);
          ctx.stroke();
        }
      }
    }
    for (let i = 0; i < ecosystemNodes.length; i++) {
      const n = ecosystemNodes[i];
      const x = n.x * width + Math.sin(time * 0.15 + n.phase) * 5;
      const y = n.y * height + Math.cos(time * 0.12 + n.phase) * 5;
      const colors = [
        [91, 231, 129],
        [255, 219, 94],
        [255, 126, 113],
        [138, 147, 255],
      ];
      ctx.fillStyle = rgba(
        colors[n.level],
        0.42 + 0.2 * Math.sin(time * 0.7 + n.phase),
      );
      ctx.beginPath();
      ctx.arc(x, y, n.r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawMovement(progress, time, alpha) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    for (let i = 0; i < organisms.length; i++) {
      const o = organisms[i];
      const x =
        fract(o.x + time * 0.006 * o.direction * (1 + o.type * 0.08)) * width;
      const y = o.y * height + Math.sin(time * 0.8 + o.phase) * height * 0.04;
      const r = o.size * Math.min(width, height) * 0.7;
      ctx.strokeStyle = "rgba(73,220,240,.1)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - o.direction * r * 5, y);
      ctx.quadraticCurveTo(
        x - o.direction * r * 2,
        y + Math.sin(time + o.phase) * r,
        x,
        y,
      );
      ctx.stroke();
      ctx.fillStyle = "rgba(88,226,240,.38)";
      ctx.beginPath();
      ctx.ellipse(x, y, r * 1.5, r * 0.55, 0, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x - o.direction * r * 1.2, y);
      ctx.lineTo(x - o.direction * r * 2, y - r * 0.7);
      ctx.lineTo(x - o.direction * r * 1.8, y + r * 0.7);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawSenses(progress, time, alpha) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const cx = width * 0.5,
      cy = height * 0.5,
      s = Math.min(width, height);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + time * 0.06;
      const sx = cx + Math.cos(a) * s * 0.38;
      const sy = cy + Math.sin(a) * s * 0.3;
      const color =
        i % 3 === 0
          ? [255, 226, 105]
          : i % 3 === 1
            ? [80, 232, 215]
            : [131, 179, 255];
      for (let ring = 1; ring <= 4; ring++) {
        const rr =
          s * (0.018 + ring * 0.025 + fract(time * 0.12 + i * 0.13) * 0.02);
        ctx.strokeStyle = rgba(color, 0.13 / ring);
        ctx.beginPath();
        ctx.arc(sx, sy, rr, 0, TAU);
        ctx.stroke();
      }
      ctx.fillStyle = rgba(color, 0.6);
      ctx.beginPath();
      ctx.arc(sx, sy, 3.5, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = rgba(color, 0.13);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(cx, cy);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(115,244,214,.48)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, s * 0.18, s * 0.11, 0, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = "rgba(115,244,214,.22)";
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.055, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.75)";
    ctx.beginPath();
    ctx.arc(cx + Math.sin(time) * s * 0.012, cy, s * 0.018, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawNeuralNetwork(progress, time, alpha) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const threshold = Math.min(width, height) * 0.19;
    for (let i = 0; i < neurons.length; i++) {
      const a = neurons[i];
      for (let j = i + 1; j < neurons.length; j++) {
        const b = neurons[j];
        const dx = (a.x - b.x) * width,
          dy = (a.y - b.y) * height;
        const d = Math.hypot(dx, dy);
        if (d < threshold) {
          const strength = 1 - d / threshold;
          ctx.strokeStyle = `rgba(128,207,255,${0.035 + strength * 0.11})`;
          ctx.lineWidth = 0.6 + strength * (a.hub || b.hub ? 1.5 : 0.55);
          ctx.beginPath();
          ctx.moveTo(a.x * width, a.y * height);
          ctx.lineTo(b.x * width, b.y * height);
          ctx.stroke();
          const pulse = fract(
            time * (0.12 + (i % 7) * 0.008) + (i + j) * 0.037,
          );
          if (pulse < strength * 0.33) {
            const px =
              mix(a.x, b.x, pulse / Math.max(0.001, strength * 0.33)) * width;
            const py =
              mix(a.y, b.y, pulse / Math.max(0.001, strength * 0.33)) * height;
            ctx.fillStyle = "rgba(220,244,255,.75)";
            ctx.beginPath();
            ctx.arc(px, py, 1.6 + strength * 2, 0, TAU);
            ctx.fill();
          }
        }
      }
    }
    for (let i = 0; i < neurons.length; i++) {
      const n = neurons[i];
      const pulse = 0.6 + 0.4 * Math.sin(time * 0.8 + n.phase);
      ctx.fillStyle = n.hub
        ? `rgba(182,190,255,${0.42 * pulse})`
        : `rgba(112,208,255,${0.32 * pulse})`;
      ctx.beginPath();
      ctx.arc(n.x * width, n.y * height, n.r * (n.hub ? 1.5 : 1), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBrain(progress, time, alpha) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const cx = width * 0.5,
      cy = height * 0.5,
      s = Math.min(width, height),
      r = s * 0.27;
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.2);
    glow.addColorStop(0, "rgba(170,160,255,.18)");
    glow.addColorStop(1, "rgba(120,100,255,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "rgba(187,176,255,.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.85);
    ctx.bezierCurveTo(
      cx - r * 0.6,
      cy - r * 1.05,
      cx - r * 1.05,
      cy - r * 0.45,
      cx - r * 0.85,
      cy,
    );
    ctx.bezierCurveTo(
      cx - r * 1.05,
      cy + r * 0.5,
      cx - r * 0.42,
      cy + r * 0.95,
      cx,
      cy + r * 0.68,
    );
    ctx.bezierCurveTo(
      cx + r * 0.42,
      cy + r * 0.95,
      cx + r * 1.05,
      cy + r * 0.5,
      cx + r * 0.85,
      cy,
    );
    ctx.bezierCurveTo(
      cx + r * 1.05,
      cy - r * 0.45,
      cx + r * 0.6,
      cy - r * 1.05,
      cx,
      cy - r * 0.85,
    );
    ctx.closePath();
    ctx.stroke();
    for (let i = 0; i < 18; i++) {
      const side = i % 2 ? -1 : 1;
      const y = cy - r * 0.66 + (i / 17) * r * 1.25;
      ctx.strokeStyle = `rgba(${170 + i * 3},${158 + i * 2},255,${0.12 + (i % 4) * 0.03})`;
      ctx.beginPath();
      ctx.moveTo(cx, y);
      ctx.bezierCurveTo(
        cx + side * r * 0.2,
        y - r * 0.18,
        cx + side * r * 0.58,
        y + r * 0.12,
        cx + side * r * (0.68 + 0.08 * Math.sin(i)),
        y + r * 0.02,
      );
      ctx.stroke();
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + time * 0.11;
      const rr = r * (0.2 + 0.56 * seeded(i + 40000));
      ctx.fillStyle =
        i % 3 === 0 ? "rgba(255,220,145,.75)" : "rgba(196,185,255,.58)";
      ctx.beginPath();
      ctx.arc(
        cx + Math.cos(a) * rr,
        cy + Math.sin(a) * rr * 0.72,
        2.5 + (i % 3),
        0,
        TAU,
      );
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPerception(progress, time, alpha) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const cx = width * 0.5,
      cy = height * 0.5,
      s = Math.min(width, height);
    for (let i = 0; i < 7; i++) {
      const r = s * (0.07 + i * 0.045);
      const hue = i / 6;
      const col =
        hue < 0.33
          ? [224, 157, 255]
          : hue < 0.66
            ? [111, 205, 255]
            : [255, 212, 142];
      ctx.strokeStyle = rgba(col, 0.14 + (6 - i) * 0.02);
      ctx.lineWidth = 1 + (i % 3) * 0.45;
      ctx.beginPath();
      for (let k = 0; k <= 100; k++) {
        const a = (k / 100) * TAU;
        const wobble =
          1 + 0.08 * Math.sin(a * (3 + i) + time * (0.32 + i * 0.03));
        const x = cx + Math.cos(a) * r * wobble;
        const y = cy + Math.sin(a) * r * 0.72 * wobble;
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }
    const frameW = s * 0.44,
      frameH = s * 0.28;
    ctx.strokeStyle = "rgba(255,255,255,.19)";
    ctx.strokeRect(cx - frameW / 2, cy - frameH / 2, frameW, frameH);
    ctx.fillStyle = "rgba(255,206,120,.12)";
    ctx.beginPath();
    ctx.arc(cx + frameW * 0.2, cy - frameH * 0.18, s * 0.04, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "rgba(82,180,255,.13)";
    ctx.beginPath();
    ctx.moveTo(cx - frameW * 0.45, cy + frameH * 0.45);
    ctx.lineTo(cx - frameW * 0.1, cy - frameH * 0.2);
    ctx.lineTo(cx + frameW * 0.12, cy + frameH * 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(170,110,255,.12)";
    ctx.beginPath();
    ctx.moveTo(cx - frameW * 0.08, cy + frameH * 0.45);
    ctx.lineTo(cx + frameW * 0.18, cy - frameH * 0.12);
    ctx.lineTo(cx + frameW * 0.45, cy + frameH * 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawConsciousness(progress, time, alpha) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const cx = width * 0.5,
      cy = height * 0.5,
      s = Math.min(width, height),
      r = s * 0.18;
    const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 4);
    halo.addColorStop(0, "rgba(255,231,184,.28)");
    halo.addColorStop(0.22, "rgba(228,169,255,.13)");
    halo.addColorStop(0.52, "rgba(120,190,255,.06)");
    halo.addColorStop(1, "rgba(255,220,164,0)");
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, width, height);
    for (let ring = 0; ring < 9; ring++) {
      const rr = r * (0.45 + ring * 0.23);
      ctx.strokeStyle = `rgba(${255 - ring * 10},${223 - ring * 4},${174 + ring * 7},${0.2 - ring * 0.014})`;
      ctx.lineWidth = 1.1 + (ring % 3) * 0.35;
      ctx.beginPath();
      for (let k = 0; k <= 110; k++) {
        const a = (k / 110) * TAU;
        const w =
          1 + 0.05 * Math.sin(a * (2 + ring) + time * (0.24 + ring * 0.02));
        const x = cx + Math.cos(a) * rr * w;
        const y = cy + Math.sin(a) * rr * 0.72 * w;
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(255,241,214,.6)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.16, cy - r * 0.65);
    ctx.bezierCurveTo(
      cx - r * 0.6,
      cy - r * 0.35,
      cx - r * 0.58,
      cy + r * 0.25,
      cx - r * 0.15,
      cy + r * 0.62,
    );
    ctx.bezierCurveTo(
      cx + r * 0.2,
      cy + r * 0.4,
      cx + r * 0.26,
      cy + r * 0.08,
      cx + r * 0.5,
      cy - r * 0.02,
    );
    ctx.bezierCurveTo(
      cx + r * 0.7,
      cy - r * 0.45,
      cx + r * 0.32,
      cy - r * 0.75,
      cx - r * 0.16,
      cy - r * 0.65,
    );
    ctx.stroke();
    ctx.fillStyle = "rgba(255,244,221,.88)";
    ctx.beginPath();
    ctx.arc(cx + r * 0.18, cy - r * 0.18, 3.3 + Math.sin(time) * 0.8, 0, TAU);
    ctx.fill();
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * TAU + time * 0.035;
      const rr = r * (1.15 + 0.9 * seeded(i + 41000));
      ctx.fillStyle =
        i % 4 === 0
          ? "rgba(255,221,165,.62)"
          : i % 3 === 0
            ? "rgba(221,171,255,.52)"
            : "rgba(138,207,255,.42)";
      ctx.beginPath();
      ctx.arc(
        cx + Math.cos(a) * rr,
        cy + Math.sin(a) * rr * 0.72,
        1.5 + (i % 3),
        0,
        TAU,
      );
      ctx.fill();
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
    drawThreshold(
      currentProgress,
      elapsed,
      zoneWeight(currentProgress, 0, 0.075, 0.04),
    );
    drawCellPopulation(
      currentProgress,
      elapsed,
      zoneWeight(currentProgress, 0.045, 0.19, 0.045),
    );
    drawMetabolism(
      currentProgress,
      elapsed,
      zoneWeight(currentProgress, 0.13, 0.235, 0.045),
    );
    drawGenetics(
      currentProgress,
      elapsed,
      zoneWeight(currentProgress, 0.195, 0.29, 0.04),
    );
    drawEvolution(
      currentProgress,
      elapsed,
      zoneWeight(currentProgress, 0.245, 0.345, 0.045),
    );
    drawPhotosynthesis(
      currentProgress,
      elapsed,
      zoneWeight(currentProgress, 0.31, 0.4, 0.04),
    );
    drawEukaryote(
      currentProgress,
      elapsed,
      zoneWeight(currentProgress, 0.36, 0.46, 0.045),
    );
    drawRecombination(
      currentProgress,
      elapsed,
      zoneWeight(currentProgress, 0.415, 0.51, 0.04),
    );
    drawMulticellular(
      currentProgress,
      elapsed,
      zoneWeight(currentProgress, 0.47, 0.565, 0.045),
    );
    drawDevelopment(
      currentProgress,
      elapsed,
      zoneWeight(currentProgress, 0.525, 0.62, 0.045),
    );
    drawOrganisms(
      currentProgress,
      elapsed,
      zoneWeight(currentProgress, 0.58, 0.68, 0.045),
    );
    drawEcosystem(
      currentProgress,
      elapsed,
      zoneWeight(currentProgress, 0.63, 0.725, 0.045),
    );
    drawMovement(
      currentProgress,
      elapsed,
      zoneWeight(currentProgress, 0.69, 0.775, 0.04),
    );
    drawSenses(
      currentProgress,
      elapsed,
      zoneWeight(currentProgress, 0.735, 0.825, 0.04),
    );
    drawNeuralNetwork(
      currentProgress,
      elapsed,
      zoneWeight(currentProgress, 0.785, 0.875, 0.04),
    );
    drawBrain(
      currentProgress,
      elapsed,
      zoneWeight(currentProgress, 0.835, 0.93, 0.04),
    );
    drawPerception(
      currentProgress,
      elapsed,
      zoneWeight(currentProgress, 0.895, 0.975, 0.035),
    );
    drawConsciousness(
      currentProgress,
      elapsed,
      smooth(clamp((currentProgress - 0.945) / 0.055, 0, 1)),
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
