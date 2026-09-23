import { createSceneAudio } from "../../shared/audio.js";
import {
  requestSceneFrame as requestAnimationFrame,
  cancelSceneFrame as cancelAnimationFrame,
} from "../../shared/animation.js";
import content from "./content.json";
const { ZONES } = content;

export function mountScene() {
  const canvas = document.getElementById("spacetime-spectrum");
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

  const stars = [];
  const clocks = [];
  const events = [];
  const worldlines = [];
  const masses = [];
  const testParticles = [];
  const galaxies = [];
  const planckCells = [];
  const quantumNodes = [];
  const approachBranches = [];
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
  function bandCenter(id) {
    const zone = ZONES.find((z) => z.id === id);
    return bandY((zone.p0 + zone.p1) * 0.5);
  }
  function zoneAlpha(id, progress) {
    const z = ZONES.find((v) => v.id === id);
    const feather = Math.min(0.02, (z.p1 - z.p0) * 0.28);
    return (
      smoothstep(z.p0 - feather, z.p0 + feather, progress) *
      (1 - smoothstep(z.p1 - feather, z.p1 + feather, progress))
    );
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
      clocks.length =
      events.length =
      worldlines.length =
      masses.length =
        0;
    testParticles.length =
      galaxies.length =
      planckCells.length =
      quantumNodes.length =
        0;
    approachBranches.length = 0;

    for (let i = 0; i < 150; i++) {
      stars.push({
        x: seeded(i + 5),
        y: seeded(i + 105),
        r: 0.25 + seeded(i + 205) * 1.25,
        a: 0.025 + seeded(i + 305) * 0.18,
        phase: seeded(i + 405) * TAU,
      });
    }
    for (let i = 0; i < 15; i++) {
      clocks.push({
        x: 0.05 + seeded(i + 600) * 0.9,
        y: 0.89 + seeded(i + 700) * 0.045,
        r: 7 + seeded(i + 800) * 8,
        phase: seeded(i + 900) * TAU,
        speed: 0.6 + seeded(i + 1000) * 0.9,
        a: 0.2 + seeded(i + 1100) * 0.4,
      });
    }
    for (let i = 0; i < 22; i++) {
      events.push({
        x: 0.04 + seeded(i + 1200) * 0.92,
        y: 0.765 + seeded(i + 1300) * 0.045,
        r: 1.2 + seeded(i + 1400) * 2.6,
        phase: seeded(i + 1500) * TAU,
        a: 0.22 + seeded(i + 1600) * 0.45,
      });
    }
    for (let i = 0; i < 13; i++) {
      worldlines.push({
        x: 0.06 + seeded(i + 1700) * 0.88,
        y: 0.705 + seeded(i + 1800) * 0.04,
        tilt: (seeded(i + 1900) - 0.5) * 0.16,
        bend: (seeded(i + 2000) - 0.5) * 0.06,
        phase: seeded(i + 2100) * TAU,
        a: 0.14 + seeded(i + 2200) * 0.32,
      });
    }
    for (let i = 0; i < 8; i++) {
      masses.push({
        x: 0.1 + seeded(i + 2300) * 0.8,
        y: 0.565 + seeded(i + 2400) * 0.055,
        r: 7 + seeded(i + 2500) * 16,
        strength: 0.5 + seeded(i + 2600) * 1.2,
        phase: seeded(i + 2700) * TAU,
        a: 0.25 + seeded(i + 2800) * 0.45,
      });
    }
    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * TAU;
      testParticles.push({
        angle,
        phase: seeded(i + 2900) * TAU,
        r: 18 + seeded(i + 3000) * 24,
      });
    }
    for (let i = 0; i < 34; i++) {
      galaxies.push({
        x: 0.04 + seeded(i + 3100) * 0.92,
        y: 0.335 + seeded(i + 3200) * 0.045,
        r: 1.5 + seeded(i + 3300) * 4.5,
        phase: seeded(i + 3400) * TAU,
        arms: 2 + Math.floor(seeded(i + 3500) * 3),
        a: 0.18 + seeded(i + 3600) * 0.46,
      });
    }
    for (let i = 0; i < 112; i++) {
      planckCells.push({
        x: seeded(i + 3700),
        y: 0.17 + seeded(i + 3800) * 0.07,
        s: 2 + seeded(i + 3900) * 8,
        phase: seeded(i + 4000) * TAU,
        rot: seeded(i + 4100) * TAU,
        a: 0.035 + seeded(i + 4200) * 0.14,
        mode: i % 5,
      });
    }
    for (let i = 0; i < 36; i++) {
      quantumNodes.push({
        x: 0.035 + seeded(i + 4300) * 0.93,
        y: 0.045 + seeded(i + 4400) * 0.075,
        r: 1.3 + seeded(i + 4500) * 4.2,
        phase: seeded(i + 4600) * TAU,
        a: 0.16 + seeded(i + 4700) * 0.48,
        group: i % 6,
      });
    }
    const branchNames = [
      "CUERDAS",
      "BUCLES",
      "TRIANGULACIONES",
      "SEGURIDAD",
      "CAUSALIDAD",
      "HOLOGRAFÍA",
      "EMERGENCIA",
      "SEMICLÁSICA",
    ];
    branchNames.forEach((name, i) =>
      approachBranches.push({
        name,
        x0: 0.5,
        y0: 0.145,
        x1: 0.04 + i * (0.92 / (branchNames.length - 1)),
        y1: 0.102 + (i % 2) * 0.016,
        bend: (i - 3.5) * 0.012,
        phase: seeded(i + 4800) * TAU,
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
    droneB.type =
      s.type === "sawtooth" || s.type === "square" ? "triangle" : "sine";
    droneA.frequency.setTargetAtTime(base, now, 0.08);
    droneB.frequency.setTargetAtTime(base * (1.495 + depth * 0.008), now, 0.1);
    droneFilter.frequency.setTargetAtTime(
      s.filter * (0.82 + xNorm * 0.28),
      now,
      0.1,
    );
    droneGain.gain.setTargetAtTime(
      active ? 0.013 + depth * 0.006 : 0.0001,
      now,
      0.09,
    );
    pulseOsc.frequency.setTargetAtTime(base * (1.99 + s.pulse), now, 0.07);
    pulseGain.gain.setTargetAtTime(
      active ? 0.0032 + depth * 0.0018 : 0.0001,
      now,
      0.1,
    );
    noiseFilter.frequency.setTargetAtTime(s.filter * 1.1, now, 0.1);
    noiseGain.gain.setTargetAtTime(
      active ? Math.max(0.0001, s.noise * 0.07) : 0.0001,
      now,
      0.1,
    );
    if (stereo.pan) stereo.pan.setTargetAtTime((xNorm - 0.5) * 0.72, now, 0.07);
    master.gain.setTargetAtTime(active ? 0.29 : 0.0001, now, 0.09);
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
      Math.max(34, zone.sound.base * 2.7 * scale),
      now,
    );
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(32, zone.sound.base * 1.17),
      now + 0.5,
    );
    filter.type = "lowpass";
    filter.frequency.value = Math.max(300, zone.sound.filter * 1.5);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.028, now + 0.012);
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
      zoneName.textContent = zone.name;
      zoneName.className =
        zone.name.length > 31 ? "long" : zone.name.length > 21 ? "compact" : "";
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

  function line(x1, y1, x2, y2, color, widthValue = 1) {
    ctx.strokeStyle = color;
    ctx.lineWidth = widthValue;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  function drawBackground(time) {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#02030a");
    gradient.addColorStop(0.035, "#080a18");
    gradient.addColorStop(0.09, "#071423");
    gradient.addColorStop(0.16, "#111229");
    gradient.addColorStop(0.24, "#24132f");
    gradient.addColorStop(0.34, "#171d42");
    gradient.addColorStop(0.45, "#2e2336");
    gradient.addColorStop(0.56, "#1d3441");
    gradient.addColorStop(0.68, "#111d3b");
    gradient.addColorStop(0.79, "#0b2438");
    gradient.addColorStop(0.89, "#0b2830");
    gradient.addColorStop(0.955, "#081723");
    gradient.addColorStop(1, "#02050b");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const star of stars) {
      const twinkle = 0.65 + Math.sin(time * 0.0007 + star.phase) * 0.35;
      ctx.globalAlpha = star.a * twinkle * (0.45 + star.y * 0.55);
      ctx.fillStyle = star.y < 0.25 ? "#d9e5ff" : "#9ed7ff";
      ctx.beginPath();
      ctx.arc(star.x * width, star.y * height, star.r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    const haloX = pointerX * width;
    const haloY = pointerY * height;
    glow(
      haloX,
      haloY,
      Math.max(width, height) * 0.32,
      "rgba(101,168,255,.035)",
      "rgba(32,68,124,.008)",
    );
  }

  function drawBands() {
    ctx.save();
    ctx.setLineDash([2, 8]);
    for (let i = 1; i < ZONES.length; i++) {
      const y = bandY(ZONES[i].p0);
      ctx.strokeStyle =
        i >= 12 ? "rgba(230,236,255,.065)" : "rgba(255,255,255,.043)";
      ctx.lineWidth = 0.55;
      ctx.beginPath();
      ctx.moveTo(width * 0.045, y);
      ctx.lineTo(width * 0.955, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawInheritedFrontier(time) {
    const y0 = bandY(0.055);
    const y1 = height;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, "rgba(150,205,255,.01)");
    g.addColorStop(1, "rgba(103,178,225,.15)");
    ctx.fillStyle = g;
    ctx.fillRect(0, y0, width, y1 - y0);
    for (let i = 0; i < 34; i++) {
      const x = seeded(i + 5100) * width;
      const y = y0 + seeded(i + 5200) * (y1 - y0);
      const pulse = 0.35 + 0.65 * Math.sin(time * 0.001 + i);
      glow(
        x,
        y,
        3 + seeded(i + 5300) * 11,
        `rgba(160,222,255,${0.025 + pulse * 0.045})`,
        "rgba(79,154,230,.004)",
      );
    }
    ctx.strokeStyle = "rgba(190,225,255,.28)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(width * 0.06, y0 + 1);
    for (let x = width * 0.06; x <= width * 0.94; x += 9) {
      ctx.lineTo(x, y0 + Math.sin(x * 0.027 + time * 0.00035) * 2.5);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawEveryday(time) {
    const zone = ZONES.find((z) => z.id === "everyday");
    const top = bandY(zone.p1),
      bottom = bandY(zone.p0);
    ctx.save();
    ctx.globalAlpha = 0.24;
    ctx.strokeStyle = "rgba(154,231,240,.42)";
    ctx.lineWidth = 0.65;
    const spacing = Math.max(23, width / 16);
    for (let x = -spacing; x < width + spacing; x += spacing)
      line(x, top, x, bottom, ctx.strokeStyle, 0.65);
    for (let y = top + 8; y < bottom; y += 18)
      line(0, y, width, y, ctx.strokeStyle, 0.65);
    ctx.globalCompositeOperation = "screen";
    for (const clock of clocks) {
      const x = clock.x * width;
      const y = clock.y * height;
      const r = clock.r * sceneScale();
      ctx.globalAlpha = clock.a;
      ctx.strokeStyle = "rgba(214,250,255,.7)";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.stroke();
      const angle = time * 0.0012 * clock.speed + clock.phase;
      line(
        x,
        y,
        x + Math.cos(angle) * r * 0.62,
        y + Math.sin(angle) * r * 0.62,
        "rgba(235,255,255,.78)",
        1,
      );
      glow(x, y, r * 1.8, "rgba(130,229,241,.08)", "rgba(70,170,220,.005)");
    }
    ctx.restore();
  }

  function drawSpecialRelativity(time) {
    const yTop = bandY(0.19),
      yBottom = bandY(0.12);
    const cy = (yTop + yBottom) * 0.5;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const observerX = [width * 0.22, width * 0.5, width * 0.78];
    const velocities = [-0.55, 0, 0.55];
    observerX.forEach((x, i) => {
      const tilt = velocities[i] * (yBottom - yTop) * 0.28;
      line(
        x - tilt,
        yBottom,
        x + tilt,
        yTop,
        i === 1 ? "rgba(245,251,255,.62)" : "rgba(115,188,255,.56)",
        1.3,
      );
      const yy = cy + Math.sin(time * 0.001 + i) * 2;
      glow(x, yy, 13, "rgba(191,229,255,.19)", "rgba(70,140,255,.006)");
      ctx.strokeStyle = "rgba(225,245,255,.52)";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(x, yy, 6.5, 0, TAU);
      ctx.stroke();
      const contracted = 34 * (1 - Math.abs(velocities[i]) * 0.32);
      line(
        x - contracted,
        yy + 12,
        x + contracted,
        yy + 12,
        "rgba(137,213,255,.45)",
        2,
      );
    });
    for (let i = 0; i < 7; i++) {
      const y = yTop + ((i + 0.6) / 7.2) * (yBottom - yTop);
      const skew = (y - cy) * 0.28;
      line(
        width * 0.08 + skew,
        y,
        width * 0.92 + skew,
        y,
        "rgba(138,196,255,.11)",
        0.7,
      );
    }
    ctx.setLineDash([4, 7]);
    line(width * 0.08, cy, width * 0.92, cy, "rgba(240,251,255,.22)", 0.8);
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawCausality(time) {
    const yTop = bandY(0.255),
      yBottom = bandY(0.19);
    const cx = width * 0.5;
    const cy = (yTop + yBottom) * 0.5;
    const coneW = Math.min(width * 0.29, (yBottom - yTop) * 1.65);
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const future = ctx.createLinearGradient(0, cy, 0, yTop);
    future.addColorStop(0, "rgba(113,232,255,.2)");
    future.addColorStop(1, "rgba(70,150,255,.015)");
    ctx.fillStyle = future;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx - coneW, yTop);
    ctx.lineTo(cx + coneW, yTop);
    ctx.closePath();
    ctx.fill();
    const past = ctx.createLinearGradient(0, cy, 0, yBottom);
    past.addColorStop(0, "rgba(113,232,255,.16)");
    past.addColorStop(1, "rgba(70,150,255,.008)");
    ctx.fillStyle = past;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx - coneW, yBottom);
    ctx.lineTo(cx + coneW, yBottom);
    ctx.closePath();
    ctx.fill();
    line(cx, cy, cx - coneW, yTop, "rgba(191,250,255,.55)", 1);
    line(cx, cy, cx + coneW, yTop, "rgba(191,250,255,.55)", 1);
    line(cx, cy, cx - coneW, yBottom, "rgba(191,250,255,.4)", 1);
    line(cx, cy, cx + coneW, yBottom, "rgba(191,250,255,.4)", 1);
    glow(cx, cy, 14, "rgba(230,255,255,.42)", "rgba(90,220,255,.02)");
    for (const ev of events) {
      const pulse = 0.65 + Math.sin(time * 0.002 + ev.phase) * 0.35;
      ctx.globalAlpha = ev.a * pulse;
      glow(
        ev.x * width,
        ev.y * height,
        ev.r * 4,
        "rgba(144,235,255,.22)",
        "rgba(50,150,255,.002)",
      );
    }
    ctx.restore();
  }

  function drawSpacetime(time) {
    const yTop = bandY(0.325),
      yBottom = bandY(0.255);
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.strokeStyle = "rgba(140,178,255,.12)";
    ctx.lineWidth = 0.65;
    for (let i = 0; i < 12; i++) {
      const x = (width * (i + 0.5)) / 12;
      ctx.beginPath();
      ctx.moveTo(x, yBottom);
      ctx.bezierCurveTo(
        x - 10,
        lerp(yBottom, yTop, 0.35),
        x + 10,
        lerp(yBottom, yTop, 0.65),
        x,
        yTop,
      );
      ctx.stroke();
    }
    for (let j = 0; j < 7; j++) {
      const y = lerp(yBottom, yTop, (j + 0.5) / 7);
      line(width * 0.03, y, width * 0.97, y, "rgba(150,189,255,.09)", 0.65);
    }
    for (const w of worldlines) {
      const x = w.x * width;
      const y = w.y * height;
      const h = yBottom - yTop;
      const drift = w.tilt * width;
      ctx.globalAlpha = w.a;
      ctx.strokeStyle = "rgba(198,219,255,.75)";
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(x - drift * 0.5, yBottom);
      ctx.bezierCurveTo(
        x - drift * 0.2 + Math.sin(time * 0.0004 + w.phase) * 4,
        y + h * 0.15,
        x + drift * 0.2,
        y - h * 0.15,
        x + drift * 0.5,
        yTop,
      );
      ctx.stroke();
      const t = (time * 0.00008 + w.phase / TAU) % 1;
      const py = lerp(yBottom, yTop, t);
      const px =
        lerp(x - drift * 0.5, x + drift * 0.5, t) +
        Math.sin(t * Math.PI) * w.bend * width;
      glow(px, py, 7, "rgba(226,238,255,.3)", "rgba(90,140,255,.006)");
    }
    ctx.restore();
  }

  function drawEquivalence(time) {
    const yTop = bandY(0.395),
      yBottom = bandY(0.325);
    const cy = (yTop + yBottom) * 0.5;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const centers = [width * 0.2, width * 0.5, width * 0.8];
    centers.forEach((cx, i) => {
      const w = Math.min(width * 0.18, 90);
      const h = (yBottom - yTop) * 0.72;
      ctx.strokeStyle = "rgba(175,242,228,.35)";
      ctx.lineWidth = 0.8;
      ctx.strokeRect(cx - w * 0.5, cy - h * 0.5, w, h);
      const ballY =
        i === 0
          ? cy + h * 0.18
          : i === 1
            ? cy - h * 0.18 + ((time * 0.025) % (h * 0.36))
            : cy + Math.sin(time * 0.0012) * h * 0.19;
      glow(cx, ballY, 7, "rgba(208,255,241,.36)", "rgba(91,217,190,.008)");
      if (i === 0) {
        line(
          cx - w * 0.34,
          cy + h * 0.28,
          cx + w * 0.34,
          cy + h * 0.28,
          "rgba(216,255,244,.38)",
          1.4,
        );
        for (let a = -1; a <= 1; a++)
          line(
            cx + a * 12,
            cy - h * 0.25,
            cx + a * 12,
            cy - h * 0.05,
            "rgba(122,242,210,.22)",
            0.8,
          );
      } else if (i === 1) {
        for (let a = -1; a <= 1; a++)
          line(
            cx + a * 12,
            cy - h * 0.25,
            cx + a * 12,
            cy - h * 0.05,
            "rgba(122,242,210,.22)",
            0.8,
          );
      } else {
        ctx.setLineDash([3, 5]);
        line(cx - w * 0.4, cy, cx + w * 0.4, cy, "rgba(205,255,244,.24)", 0.8);
        ctx.setLineDash([]);
      }
    });
    ctx.restore();
  }

  function warpedPoint(x, y, sources, scale = 1) {
    let dx = 0,
      dy = 0;
    for (const m of sources) {
      const mx = m.x * width,
        my = m.y * height;
      const vx = mx - x,
        vy = my - y;
      const d2 = vx * vx + vy * vy + 500;
      const strength = (m.strength * 980 * scale) / d2;
      dx += vx * strength;
      dy += vy * strength;
    }
    return [x + dx, y + dy];
  }

  function drawCurvature(time) {
    const zone = ZONES.find((z) => z.id === "curvature");
    const yTop = bandY(zone.p1),
      yBottom = bandY(zone.p0);
    const sources = masses.filter(
      (m) => m.y * height >= yTop - 20 && m.y * height <= yBottom + 20,
    );
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.strokeStyle = "rgba(255,209,137,.15)";
    ctx.lineWidth = 0.65;
    for (let i = 0; i <= 14; i++) {
      const x0 = (width * i) / 14;
      ctx.beginPath();
      for (let s = 0; s <= 36; s++) {
        const y = lerp(yTop, yBottom, s / 36);
        const [xw, yw] = warpedPoint(x0, y, sources, 1.35);
        if (s === 0) ctx.moveTo(xw, yw);
        else ctx.lineTo(xw, yw);
      }
      ctx.stroke();
    }
    for (let j = 0; j <= 7; j++) {
      const y0 = lerp(yTop, yBottom, j / 7);
      ctx.beginPath();
      for (let s = 0; s <= 48; s++) {
        const x = (width * s) / 48;
        const [xw, yw] = warpedPoint(x, y0, sources, 1.35);
        if (s === 0) ctx.moveTo(xw, yw);
        else ctx.lineTo(xw, yw);
      }
      ctx.stroke();
    }
    for (const m of sources) {
      const x = m.x * width,
        y = m.y * height;
      const pulse = 0.9 + Math.sin(time * 0.001 + m.phase) * 0.1;
      glow(
        x,
        y,
        m.r * 3.2 * pulse,
        "rgba(255,211,145,.22)",
        "rgba(255,109,56,.006)",
      );
      ctx.fillStyle = "rgba(255,231,187,.75)";
      ctx.beginPath();
      ctx.arc(x, y, m.r * 0.3, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(191,226,255,.22)";
      ctx.lineWidth = 0.75;
      ctx.beginPath();
      ctx.arc(x, y, m.r * 1.5, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, m.r * 2.25, 0, TAU);
      ctx.stroke();
    }
    const lensX = width * 0.67,
      lensY = (yTop + yBottom) * 0.5;
    ctx.strokeStyle = "rgba(210,239,255,.4)";
    ctx.lineWidth = 1;
    for (let k = -1; k <= 1; k++) {
      ctx.beginPath();
      ctx.moveTo(width * 0.08, lensY + k * 12);
      ctx.quadraticCurveTo(
        lensX,
        lensY + k * 6 + (k === 0 ? -18 : k * -5),
        width * 0.93,
        lensY + k * 12,
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBlackHoles(time) {
    const yTop = bandY(0.55),
      yBottom = bandY(0.475);
    const cy = (yTop + yBottom) * 0.5;
    const holes = [
      { x: width * 0.23, r: Math.min(width, height) * 0.028, spin: 1 },
      { x: width * 0.54, r: Math.min(width, height) * 0.038, spin: -1 },
      { x: width * 0.81, r: Math.min(width, height) * 0.023, spin: 1 },
    ];
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const h of holes) {
      const x = h.x;
      const r = Math.max(11, h.r);
      glow(x, cy, r * 4.2, "rgba(255,109,70,.13)", "rgba(109,34,50,.004)");
      ctx.save();
      ctx.translate(x, cy);
      ctx.rotate(time * 0.00012 * h.spin);
      ctx.scale(1.8, 0.42);
      const ring = ctx.createLinearGradient(-r * 2.8, 0, r * 2.8, 0);
      ring.addColorStop(0, "rgba(255,81,37,.04)");
      ring.addColorStop(0.24, "rgba(255,185,72,.58)");
      ring.addColorStop(0.51, "rgba(255,248,214,.82)");
      ring.addColorStop(0.76, "rgba(255,112,45,.4)");
      ring.addColorStop(1, "rgba(91,27,56,.02)");
      ctx.strokeStyle = ring;
      ctx.lineWidth = Math.max(2, r * 0.18);
      ctx.beginPath();
      ctx.arc(0, 0, r * 2.15, 0, TAU);
      ctx.stroke();
      ctx.restore();
      ctx.globalCompositeOperation = "source-over";
      const shadow = ctx.createRadialGradient(
        x - r * 0.25,
        cy - r * 0.25,
        0,
        x,
        cy,
        r * 1.18,
      );
      shadow.addColorStop(0, "#000");
      shadow.addColorStop(0.78, "#000");
      shadow.addColorStop(1, "rgba(0,0,0,.1)");
      ctx.fillStyle = shadow;
      ctx.beginPath();
      ctx.arc(x, cy, r * 1.18, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = "screen";
      ctx.strokeStyle = "rgba(236,239,255,.22)";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(x, cy, r * 1.2, 0, TAU);
      ctx.stroke();
      if (h.spin < 0) {
        ctx.strokeStyle = "rgba(255,151,99,.17)";
        ctx.beginPath();
        ctx.ellipse(x, cy, r * 1.75, r * 1.32, 0, 0, TAU);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawGravitationalWaves(time) {
    const yTop = bandY(0.62),
      yBottom = bandY(0.55);
    const cy = (yTop + yBottom) * 0.5;
    const cx = width * 0.5;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const orbit = Math.min(width, height) * 0.038;
    const a = time * 0.0018;
    const x1 = cx + Math.cos(a) * orbit,
      y1 = cy + Math.sin(a) * orbit * 0.35;
    const x2 = cx - Math.cos(a) * orbit,
      y2 = cy - Math.sin(a) * orbit * 0.35;
    glow(x1, y1, 15, "rgba(218,178,255,.34)", "rgba(131,78,255,.007)");
    glow(x2, y2, 13, "rgba(198,132,255,.3)", "rgba(93,54,255,.006)");
    for (let i = 0; i < 10; i++) {
      const phase = (time * 0.00022 + i / 10) % 1;
      const rx = 22 + phase * width * 0.48;
      const alpha = (1 - phase) * 0.19;
      ctx.strokeStyle = `rgba(197,157,255,${alpha})`;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, rx * 0.18, 0, 0, TAU);
      ctx.stroke();
    }
    const ringR = Math.min(width * 0.22, (yBottom - yTop) * 0.44);
    const strain = 0.14 * Math.sin(time * 0.0025);
    for (const p of testParticles) {
      const ex = ringR * (1 + strain);
      const ey = ringR * 0.34 * (1 - strain);
      const x = cx + Math.cos(p.angle) * ex;
      const y = cy + Math.sin(p.angle) * ey;
      glow(x, y, 4.5, "rgba(230,209,255,.28)", "rgba(160,115,255,.003)");
    }
    ctx.restore();
  }

  function drawDynamicUniverse(time) {
    const yTop = bandY(0.69),
      yBottom = bandY(0.62);
    const cy = (yTop + yBottom) * 0.5;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const expansion = 1 + 0.035 * Math.sin(time * 0.00035);
    ctx.strokeStyle = "rgba(120,157,255,.12)";
    ctx.lineWidth = 0.6;
    for (let i = 0; i < 9; i++) {
      const x = (width * (i + 0.5)) / 9;
      const offset = (x - width * 0.5) * (expansion - 1);
      line(x + offset, yTop, x + offset, yBottom, ctx.strokeStyle, 0.6);
    }
    for (let j = 0; j < 5; j++) {
      const y = lerp(yTop, yBottom, (j + 0.5) / 5);
      line(width * 0.02, y, width * 0.98, y, ctx.strokeStyle, 0.6);
    }
    for (const g of galaxies) {
      const x = width * 0.5 + (g.x * width - width * 0.5) * expansion;
      const y = cy + (g.y * height - cy) * expansion;
      ctx.globalAlpha = g.a;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(g.phase + time * 0.00004);
      ctx.scale(1.6, 0.55);
      ctx.strokeStyle = "rgba(181,203,255,.65)";
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.arc(0, 0, g.r * 2.5, 0, TAU);
      ctx.stroke();
      ctx.restore();
      glow(x, y, g.r * 4, "rgba(154,184,255,.16)", "rgba(60,90,255,.002)");
    }
    ctx.restore();
  }

  function drawHorizonThermo(time) {
    const yTop = bandY(0.76),
      yBottom = bandY(0.69);
    const cy = (yTop + yBottom) * 0.5;
    const cx = width * 0.5;
    const r = Math.min(width * 0.11, (yBottom - yTop) * 0.36);
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    glow(cx, cy, r * 4, "rgba(255,180,68,.1)", "rgba(77,32,44,.002)");
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = "screen";
    const segments = 36;
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * TAU;
      const a1 = ((i + 0.72) / segments) * TAU;
      const pulse = 0.3 + 0.7 * Math.sin(time * 0.001 + i * 1.7) ** 2;
      ctx.strokeStyle = `rgba(255,213,121,${0.08 + pulse * 0.26})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.08, a0, a1);
      ctx.stroke();
    }
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU + time * 0.00015;
      const rr = r * (1.4 + ((time * 0.00008 + seeded(i + 5400)) % 1) * 2.2);
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr * 0.38;
      glow(x, y, 3.5, "rgba(255,226,154,.25)", "rgba(255,128,50,.002)");
    }
    for (let i = 0; i < 7; i++) {
      const x = width * (0.08 + i * 0.14);
      const y = cy + Math.sin(i * 1.7) * (yBottom - yTop) * 0.27;
      ctx.strokeStyle = "rgba(255,218,142,.13)";
      ctx.lineWidth = 0.7;
      ctx.strokeRect(x - 5, y - 5, 10, 10);
    }
    ctx.restore();
  }

  function drawPlanck(time) {
    const yTop = bandY(0.835),
      yBottom = bandY(0.76);
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const intensity = reducedMotion ? 0 : 1;
    for (const cell of planckCells) {
      const baseX = cell.x * width;
      const baseY = cell.y * height;
      const jitter =
        Math.sin(time * 0.004 + cell.phase) * cell.s * 0.28 * intensity;
      const x = baseX + jitter;
      const y =
        baseY + Math.cos(time * 0.0032 + cell.phase) * cell.s * 0.2 * intensity;
      ctx.globalAlpha =
        cell.a * (0.55 + 0.45 * Math.sin(time * 0.002 + cell.phase) ** 2);
      ctx.strokeStyle =
        cell.mode % 2 ? "rgba(231,239,255,.75)" : "rgba(185,207,255,.58)";
      ctx.lineWidth = 0.55;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(cell.rot + time * 0.0002 * (cell.mode - 2));
      if (cell.mode === 0) {
        ctx.strokeRect(-cell.s * 0.5, -cell.s * 0.5, cell.s, cell.s);
      } else if (cell.mode === 1) {
        ctx.beginPath();
        ctx.moveTo(0, -cell.s);
        ctx.lineTo(cell.s, cell.s);
        ctx.lineTo(-cell.s, cell.s);
        ctx.closePath();
        ctx.stroke();
      } else if (cell.mode === 2) {
        ctx.beginPath();
        ctx.arc(0, 0, cell.s * 0.65, 0, TAU);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(-cell.s, 0);
        ctx.quadraticCurveTo(
          0,
          Math.sin(time * 0.004 + cell.phase) * cell.s,
          cell.s,
          0,
        );
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.strokeStyle = "rgba(236,242,255,.15)";
    ctx.lineWidth = 0.7;
    for (let i = 0; i < 7; i++) {
      const y = lerp(yTop, yBottom, (i + 0.5) / 7);
      ctx.beginPath();
      for (let x = 0; x <= width; x += 9) {
        const yy = y + Math.sin(x * 0.038 + i + time * 0.002) * (2 + i * 0.5);
        if (x === 0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function curvedBranch(branch, time) {
    const x0 = branch.x0 * width,
      y0 = branch.y0 * height;
    const x1 = branch.x1 * width,
      y1 = branch.y1 * height;
    const cx = (x0 + x1) * 0.5 + branch.bend * width;
    const cy = (y0 + y1) * 0.5 - Math.abs(x1 - x0) * 0.08;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(cx, cy, x1, y1);
    ctx.stroke();
    const t = (time * 0.00009 + branch.phase / TAU) % 1;
    const omt = 1 - t;
    const px = omt * omt * x0 + 2 * omt * t * cx + t * t * x1;
    const py = omt * omt * y0 + 2 * omt * t * cy + t * t * y1;
    glow(px, py, 5, "rgba(229,195,255,.28)", "rgba(144,83,255,.003)");
  }

  function drawApproaches(time) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    glow(
      width * 0.5,
      height * 0.145,
      22,
      "rgba(225,194,255,.18)",
      "rgba(113,61,255,.004)",
    );
    ctx.strokeStyle = "rgba(216,164,255,.28)";
    ctx.lineWidth = 0.85;
    for (const branch of approachBranches) curvedBranch(branch, time);
    ctx.fillStyle = "rgba(232,218,255,.26)";
    ctx.font = `${Math.max(6, Math.min(9, width * 0.012))}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    for (const branch of approachBranches) {
      if (width > 620 || branch.name.length < 9)
        ctx.fillText(branch.name, branch.x1 * width, branch.y1 * height - 5);
    }
    ctx.restore();
  }

  function drawEmergent(time) {
    const nodes = quantumNodes;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      const ax = a.x * width,
        ay = a.y * height;
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const dx = (a.x - b.x) * width;
        const dy = (a.y - b.y) * height;
        const dist = Math.hypot(dx, dy);
        const linked =
          a.group === b.group || dist < Math.min(width, height) * 0.105;
        if (!linked) continue;
        const strength = a.group === b.group ? 0.13 : 0.045;
        const pulse = 0.55 + 0.45 * Math.sin(time * 0.0012 + a.phase - b.phase);
        line(
          ax,
          ay,
          b.x * width,
          b.y * height,
          `rgba(120,234,255,${strength * pulse})`,
          0.55,
        );
      }
    }
    for (const n of nodes) {
      const pulse = 0.7 + 0.3 * Math.sin(time * 0.0018 + n.phase);
      glow(
        n.x * width,
        n.y * height,
        n.r * 3.2 * pulse,
        `rgba(155,245,255,${n.a * 0.38})`,
        "rgba(73,199,255,.002)",
      );
      ctx.globalAlpha = n.a;
      ctx.fillStyle = "rgba(232,255,255,.72)";
      ctx.beginPath();
      ctx.arc(n.x * width, n.y * height, n.r * 0.42, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawOrigin(time) {
    const yTop = 0,
      yBottom = bandY(0.97);
    const cx = width * 0.5;
    const cy = Math.max(14, (yTop + yBottom) * 0.48);
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const pulse = 0.88 + Math.sin(time * 0.0008) * 0.12;
    glow(
      cx,
      cy,
      Math.max(width, height) * 0.18 * pulse,
      "rgba(243,247,255,.11)",
      "rgba(146,170,255,.004)",
    );
    ctx.strokeStyle = "rgba(239,244,255,.23)";
    ctx.lineWidth = 0.7;
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * TAU + time * 0.00003;
      const r = 8 + i * 3.2;
      ctx.beginPath();
      ctx.arc(
        cx + Math.cos(a) * r * 0.18,
        cy + Math.sin(a) * r * 0.08,
        r,
        a,
        a + Math.PI * 1.35,
      );
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(249,251,255,.74)";
    ctx.font = `900 ${Math.max(15, Math.min(28, width * 0.045))}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("?", cx, cy);
    ctx.restore();
  }

  function drawContinuity(time) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const x = width * 0.5;
    const gradient = ctx.createLinearGradient(0, height, 0, 0);
    gradient.addColorStop(0, "rgba(120,202,240,.18)");
    gradient.addColorStop(0.35, "rgba(255,194,113,.16)");
    gradient.addColorStop(0.65, "rgba(195,143,255,.13)");
    gradient.addColorStop(1, "rgba(241,247,255,.2)");
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 0.75;
    ctx.setLineDash([1.5, 10]);
    ctx.beginPath();
    ctx.moveTo(x, height);
    for (let y = height; y >= 0; y -= 10) {
      const amp = 2 + (1 - y / height) * 8;
      ctx.lineTo(x + Math.sin(y * 0.025 + time * 0.00025) * amp, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawScientificCues() {
    if (width < 680) return;
    const cues = [
      ["APROXIMACIÓN", 0.91, 0.1],
      ["RELATIVIDAD COMPROBADA", 0.64, 0.08],
      ["HORIZONTES Y CUÁNTICA", 0.285, 0.08],
      ["RÉGIMEN INACCESIBLE", 0.205, 0.08],
      ["MODELOS CANDIDATOS", 0.135, 0.08],
      ["ORIGEN DESCONOCIDO", 0.024, 0.08],
    ];
    ctx.save();
    ctx.fillStyle = "rgba(228,239,255,.16)";
    ctx.font = `800 ${Math.max(7, Math.min(10, width * 0.009))}px system-ui, sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.letterSpacing = "0.08em";
    for (const [label, y, x] of cues)
      ctx.fillText(label, width * x, height * y);
    ctx.restore();
  }

  function drawTopMessage() {
    if (height < 520) return;
    const maxW = Math.min(width * 0.78, 760);
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(239,246,255,.38)";
    ctx.font = `800 ${Math.max(8, Math.min(12, width * 0.015))}px system-ui, sans-serif`;
    ctx.fillText(
      "EL ORIGEN DEL ESPACIO Y DEL TIEMPO",
      width * 0.5,
      Math.max(5, height * 0.006),
      maxW,
    );
    ctx.fillStyle = "rgba(216,231,255,.24)";
    ctx.font = `650 ${Math.max(7, Math.min(10, width * 0.012))}px system-ui, sans-serif`;
    ctx.fillText(
      "Más allá: información cuántica, leyes emergentes y naturaleza de la realidad",
      width * 0.5,
      Math.max(19, height * 0.026),
      maxW,
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
      p.vx *= 0.985;
      p.vy *= 0.985;
      const [r, g, b] = p.color;
      ctx.fillStyle = `rgba(${r},${g},${b},${p.life * 0.68})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * p.life, 0, TAU);
      ctx.fill();
    }
    for (let i = waves.length - 1; i >= 0; i--) {
      const w = waves[i];
      w.life -= dt * 1.3;
      w.radius += dt * 86;
      if (w.life <= 0) {
        waves.splice(i, 1);
        continue;
      }
      const [r, g, b] = w.color;
      ctx.strokeStyle = `rgba(${r},${g},${b},${w.life * 0.34})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(w.x, w.y, w.radius, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  function draw(time) {
    const dt = Math.min(0.034, (time - lastTime) / 1000 || 0);
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
    drawInheritedFrontier(time);
    drawEveryday(time);
    drawSpecialRelativity(time);
    drawCausality(time);
    drawSpacetime(time);
    drawEquivalence(time);
    drawCurvature(time);
    drawBlackHoles(time);
    drawGravitationalWaves(time);
    drawDynamicUniverse(time);
    drawHorizonThermo(time);
    drawPlanck(time);
    drawApproaches(time);
    drawEmergent(time);
    drawOrigin(time);
    drawContinuity(time);
    drawScientificCues();
    drawTopMessage();
    drawParticles(dt);
    requestAnimationFrame(draw);
  }

  window.addEventListener("resize", resize, { passive: true });
  window.addEventListener("orientationchange", () => setTimeout(resize, 120), {
    passive: true,
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && audioCtx && master)
      master.gain.setTargetAtTime(0.0001, audioCtx.currentTime, 0.05);
  });

  resize();
  setAccent(ZONES[0]);
  setCssPoint(width * targetX, height * targetY);
  root.style.setProperty("--progress", "4%");
  requestAnimationFrame(draw);
}
