import { setReadoutRegion } from "../../shared/narration-target.js";
import { createSceneAudio } from "../../shared/audio.js";
import {
  requestSceneFrame as requestAnimationFrame,
  cancelSceneFrame as cancelAnimationFrame,
} from "../../shared/animation.js";
import content from "./content.json";
const { ZONES } = content;

export function mountScene() {
  const canvas = document.getElementById("cosmic-future-spectrum");
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

  const galaxies = [];
  const webNodes = [];
  const nebulae = [];
  const fieldStars = [];
  const redDwarfs = [];
  const lastStars = [];
  const remnants = [];
  const blackHoles = [];
  const darkQuanta = [];
  const uncertaintyBranches = [];
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
    const t = clamp((x - a) / (b - a));
    return t * t * (3 - 2 * t);
  }
  function seeded(seed) {
    let x = Math.sin(seed * 91.733 + 13.17) * 43758.5453123;
    return x - Math.floor(x);
  }
  function futureFromY(yNorm) {
    return clamp(1 - yNorm);
  }
  function zoneForFuture(progress) {
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
    galaxies.length = webNodes.length = nebulae.length = fieldStars.length = 0;
    redDwarfs.length =
      lastStars.length =
      remnants.length =
      blackHoles.length =
        0;
    darkQuanta.length = uncertaintyBranches.length = 0;

    for (let i = 0; i < 22; i++) {
      webNodes.push({
        x: 0.035 + seeded(i + 1) * 0.93,
        y: 0.845 + seeded(i + 41) * 0.125,
        r: 1.4 + seeded(i + 81) * 3.7,
        a: 0.16 + seeded(i + 121) * 0.3,
      });
    }
    for (let i = 0; i < 14; i++) {
      galaxies.push({
        x: 0.04 + seeded(i + 201) * 0.92,
        y: 0.755 + seeded(i + 251) * 0.205,
        r: 7 + seeded(i + 301) * 22,
        tilt: (seeded(i + 351) - 0.5) * 1.25,
        arms: 2 + Math.floor(seeded(i + 401) * 3),
        phase: seeded(i + 451) * TAU,
        warmth: seeded(i + 501),
      });
    }
    for (let i = 0; i < 18; i++) {
      nebulae.push({
        x: 0.03 + seeded(i + 601) * 0.94,
        y: 0.67 + seeded(i + 651) * 0.2,
        r: 18 + seeded(i + 701) * 42,
        a: 0.025 + seeded(i + 751) * 0.045,
        phase: seeded(i + 801) * TAU,
      });
    }
    for (let i = 0; i < 460; i++) {
      const y = seeded(i + 901);
      const density = Math.pow(y, 0.72);
      fieldStars.push({
        x: seeded(i + 951),
        y: 0.08 + density * 0.88,
        r: 0.25 + seeded(i + 1001) * 1.25,
        a: 0.06 + seeded(i + 1051) * 0.38,
        phase: seeded(i + 1101) * TAU,
        temp: seeded(i + 1151),
      });
    }
    for (let i = 0; i < 105; i++) {
      redDwarfs.push({
        x: 0.025 + seeded(i + 1201) * 0.95,
        y: 0.555 + seeded(i + 1301) * 0.16,
        r: 0.7 + seeded(i + 1401) * 2.6,
        a: 0.12 + seeded(i + 1501) * 0.48,
        phase: seeded(i + 1601) * TAU,
      });
    }
    for (let i = 0; i < 18; i++) {
      lastStars.push({
        x: 0.03 + seeded(i + 1701) * 0.94,
        y: 0.445 + seeded(i + 1801) * 0.13,
        r: 1.1 + seeded(i + 1901) * 3.5,
        a: 0.34 + seeded(i + 2001) * 0.5,
        phase: seeded(i + 2101) * TAU,
      });
    }
    const types = ["white", "neutron", "brown", "planet"];
    for (let i = 0; i < 82; i++) {
      remnants.push({
        x: 0.025 + seeded(i + 2201) * 0.95,
        y: 0.29 + seeded(i + 2301) * 0.205,
        r: 0.5 + seeded(i + 2401) * 2.8,
        a: 0.12 + seeded(i + 2501) * 0.36,
        type: types[Math.floor(seeded(i + 2601) * types.length)],
        phase: seeded(i + 2701) * TAU,
      });
    }
    for (let i = 0; i < 13; i++) {
      blackHoles.push({
        x: 0.055 + seeded(i + 2801) * 0.89,
        y: 0.14 + seeded(i + 2901) * 0.205,
        r: 6 + seeded(i + 3001) * 18,
        a: 0.22 + seeded(i + 3101) * 0.38,
        spin: seeded(i + 3201) * TAU,
        supermassive: seeded(i + 3301) > 0.72,
        phase: seeded(i + 3401) * TAU,
      });
    }
    for (let i = 0; i < 66; i++) {
      darkQuanta.push({
        x: seeded(i + 3501),
        y: 0.035 + seeded(i + 3601) * 0.13,
        r: 0.3 + seeded(i + 3701) * 1.5,
        a: 0.025 + seeded(i + 3801) * 0.13,
        drift: (seeded(i + 3901) - 0.5) * 0.008,
        phase: seeded(i + 4001) * TAU,
        kind: i % 3,
      });
    }
    const branchNames = [
      "EXPANSIÓN",
      "ENERGÍA OSCURA",
      "VACÍO",
      "MATERIA",
      "NUEVA FÍSICA",
    ];
    for (let i = 0; i < branchNames.length; i++) {
      uncertaintyBranches.push({
        name: branchNames[i],
        x0: 0.5,
        y0: 0.045,
        x1: 0.08 + i * 0.21,
        y1: 0.006 + (i % 2) * 0.012,
        bend: (i - 2) * 0.025,
        phase: seeded(i + 4101) * TAU,
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
    const future = futureFromY(yNorm);
    const quieting = 1 - future * 0.62;
    const base = s.base * (0.93 + xNorm * 0.12);
    droneA.type = s.type;
    droneB.type = s.type === "sawtooth" ? "triangle" : "sine";
    droneA.frequency.setTargetAtTime(base, now, 0.08);
    droneB.frequency.setTargetAtTime(base * 1.497, now, 0.1);
    droneFilter.frequency.setTargetAtTime(
      s.filter * (0.82 + xNorm * 0.26),
      now,
      0.1,
    );
    droneGain.gain.setTargetAtTime(
      active ? 0.018 * quieting : 0.0001,
      now,
      0.09,
    );
    pulseOsc.frequency.setTargetAtTime(base * (1.99 + s.pulse), now, 0.07);
    pulseGain.gain.setTargetAtTime(
      active ? 0.0042 * quieting : 0.0001,
      now,
      0.1,
    );
    noiseFilter.frequency.setTargetAtTime(s.filter * 1.15, now, 0.1);
    noiseGain.gain.setTargetAtTime(
      active ? Math.max(0.0001, s.noise * 0.085 * quieting) : 0.0001,
      now,
      0.1,
    );
    if (stereo.pan) stereo.pan.setTargetAtTime((xNorm - 0.5) * 0.72, now, 0.07);
    master.gain.setTargetAtTime(active ? 0.34 : 0.0001, now, 0.09);
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
    const scale = [1, 1.125, 1.25, 1.5, 1.667, 2][featureIndex % 6];
    osc.type = zone.sound.type;
    osc.frequency.setValueAtTime(
      Math.max(30, zone.sound.base * 3.3 * scale),
      now,
    );
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(28, zone.sound.base * 1.25),
      now + 0.58,
    );
    filter.type = "lowpass";
    filter.frequency.value = Math.max(240, zone.sound.filter * 1.7);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.035, now + 0.014);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.64);
    osc.connect(filter).connect(gain);
    if (pan) {
      pan.pan.value = (xNorm - 0.5) * 1.4;
      gain.connect(pan).connect(master);
    } else gain.connect(master);
    osc.start(now);
    osc.stop(now + 0.7);
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
    const progress = futureFromY(yNorm);
    const zone = zoneForFuture(progress);
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
        zone.name.length > 28 ? "long" : zone.name.length > 19 ? "compact" : "";
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
      const zone = zoneForFuture(futureFromY(targetY));
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
    gradient.addColorStop(0, "#010207");
    gradient.addColorStop(0.055, "#060914");
    gradient.addColorStop(0.12, "#090b19");
    gradient.addColorStop(0.2, "#100d21");
    gradient.addColorStop(0.31, "#171126");
    gradient.addColorStop(0.43, "#1d1422");
    gradient.addColorStop(0.56, "#21161f");
    gradient.addColorStop(0.69, "#241723");
    gradient.addColorStop(0.82, "#15203a");
    gradient.addColorStop(0.94, "#09162b");
    gradient.addColorStop(1, "#03060d");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    const px = pointerX * width;
    const py = pointerY * height;
    const local = ctx.createRadialGradient(
      px,
      py,
      0,
      px,
      py,
      Math.max(width, height) * 0.48,
    );
    local.addColorStop(0, "rgba(138,174,255,.055)");
    local.addColorStop(0.45, "rgba(116,83,166,.018)");
    local.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = local;
    ctx.fillRect(0, 0, width, height);

    if (!reducedMotion) {
      const haze = 0.012 + Math.sin(time * 0.00009) * 0.004;
      ctx.fillStyle = `rgba(93,74,128,${haze})`;
      ctx.fillRect(0, height * 0.1, width, height * 0.62);
    }
  }

  function drawEpochBands() {
    ctx.save();
    for (let i = 1; i < ZONES.length; i++) {
      const y = (1 - ZONES[i].p0) * height;
      const [r, g, b] = ZONES[i].color;
      const gradient = ctx.createLinearGradient(0, y - 14, 0, y + 14);
      gradient.addColorStop(0, `rgba(${r},${g},${b},0)`);
      gradient.addColorStop(0.5, `rgba(${r},${g},${b},.045)`);
      gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, y - 14, width, 28);
      ctx.strokeStyle = `rgba(${r},${g},${b},.045)`;
      ctx.lineWidth = 0.5;
      ctx.setLineDash([2, 7]);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawFieldStars(time) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const star of fieldStars) {
      const fade =
        clamp((star.y - 0.12) / 0.8) * (1 - smoothstep(0.61, 0.86, 1 - star.y));
      const twinkle = reducedMotion
        ? 1
        : 0.68 + Math.sin(time * 0.0011 + star.phase) * 0.23;
      const yProgress = 1 - star.y;
      const survival = 1 - smoothstep(0.18, 0.62, yProgress);
      const alpha =
        star.a * twinkle * Math.max(0.05, survival) * (0.45 + fade * 0.55);
      const rgb =
        star.temp > 0.72
          ? "173,213,255"
          : star.temp < 0.25
            ? "255,184,126"
            : "244,239,222";
      ctx.fillStyle = `rgba(${rgb},${alpha})`;
      ctx.beginPath();
      ctx.arc(star.x * width, star.y * height, star.r * sceneScale(), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawSpiralGalaxy(galaxy, time, age = 0) {
    const x = galaxy.x * width;
    const y = galaxy.y * height;
    const radius = galaxy.r * sceneScale();
    const warm = clamp(galaxy.warmth + age * 0.7);
    const blue = Math.round(220 - warm * 90);
    const green = Math.round(205 - warm * 60);
    const red = 210 + Math.round(warm * 42);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(galaxy.tilt);
    ctx.scale(1, 0.38);
    ctx.globalCompositeOperation = "screen";
    glow(
      0,
      0,
      radius * 0.92,
      `rgba(${red},${green},${blue},.22)`,
      `rgba(${red},${green},${blue},.06)`,
    );
    ctx.strokeStyle = `rgba(${red},${green},${blue},${0.13 - age * 0.035})`;
    ctx.lineWidth = 0.7;
    for (let arm = 0; arm < galaxy.arms; arm++) {
      ctx.beginPath();
      for (let step = 0; step < 40; step++) {
        const t = step / 39;
        const angle =
          galaxy.phase +
          (arm * TAU) / galaxy.arms +
          t * 4.8 +
          (reducedMotion ? 0 : time * 0.000025);
        const r = radius * (0.08 + t * 0.84);
        const sx = Math.cos(angle) * r;
        const sy = Math.sin(angle) * r;
        if (step === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.stroke();
    }
    glow(0, 0, radius * 0.22, "rgba(255,246,220,.55)", "rgba(255,184,122,.11)");
    ctx.restore();
  }

  function drawCurrentUniverse(time) {
    const top = height * 0.8;
    const bottom = height * 0.975;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.strokeStyle = "rgba(101,189,255,.075)";
    ctx.lineWidth = 0.55;
    for (let i = 0; i < webNodes.length; i++) {
      const a = webNodes[i];
      for (let j = i + 1; j < webNodes.length; j++) {
        const b = webNodes[j];
        const dx = (a.x - b.x) * width;
        const dy = (a.y - b.y) * height;
        const dist = Math.hypot(dx, dy);
        if (dist < width * 0.22) {
          ctx.globalAlpha = clamp(1 - dist / (width * 0.22)) * 0.65;
          ctx.beginPath();
          ctx.moveTo(a.x * width, a.y * height);
          ctx.quadraticCurveTo(
            (a.x + b.x) * width * 0.5 + Math.sin(i * 3.1) * 7,
            (a.y + b.y) * height * 0.5,
            b.x * width,
            b.y * height,
          );
          ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;
    for (const node of webNodes)
      glow(
        node.x * width,
        node.y * height,
        node.r * 4 * sceneScale(),
        `rgba(132,211,255,${node.a})`,
        "rgba(66,127,255,.018)",
      );
    ctx.restore();

    for (const nebula of nebulae) {
      const pulse = reducedMotion
        ? 1
        : 0.86 + Math.sin(time * 0.00035 + nebula.phase) * 0.14;
      glow(
        nebula.x * width,
        nebula.y * height,
        nebula.r * sceneScale(),
        `rgba(111,190,255,${nebula.a * pulse})`,
        `rgba(205,79,173,${nebula.a * 0.35})`,
      );
    }
    for (const galaxy of galaxies) {
      const age = clamp((top - galaxy.y * height) / (bottom - top) + 0.55);
      drawSpiralGalaxy(galaxy, time, age * 0.48);
    }
  }

  function drawStellarDecline(time) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const top = height * 0.685;
    const bottom = height * 0.83;
    const gradient = ctx.createLinearGradient(0, top, 0, bottom);
    gradient.addColorStop(0, "rgba(255,99,70,.008)");
    gradient.addColorStop(0.55, "rgba(255,125,70,.04)");
    gradient.addColorStop(1, "rgba(86,153,255,.015)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, top, width, bottom - top);

    for (let i = 0; i < galaxies.length; i += 2) {
      const g = galaxies[i];
      const shifted = {
        ...g,
        y: 0.69 + seeded(i + 4201) * 0.12,
        r: g.r * 0.8,
        warmth: 0.72 + seeded(i + 4251) * 0.28,
      };
      drawSpiralGalaxy(shifted, time, 0.75);
    }
    for (const nebula of nebulae) {
      if (nebula.y < 0.7 || nebula.y > 0.82) continue;
      const pulse = reducedMotion
        ? 1
        : 0.45 + Math.sin(time * 0.00023 + nebula.phase) * 0.14;
      glow(
        nebula.x * width,
        nebula.y * height,
        nebula.r * 0.65 * sceneScale(),
        `rgba(255,125,82,${nebula.a * pulse})`,
        "rgba(255,70,50,.004)",
      );
    }
    ctx.restore();
  }

  function drawRedDwarfEra(time) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const star of redDwarfs) {
      const pulse = reducedMotion
        ? 1
        : 0.78 + Math.sin(time * 0.00055 + star.phase) * 0.16;
      const x = star.x * width;
      const y = star.y * height;
      glow(
        x,
        y,
        star.r * 6.5 * sceneScale(),
        `rgba(255,88,68,${star.a * 0.19 * pulse})`,
        "rgba(255,45,31,.008)",
      );
      ctx.fillStyle = `rgba(255,139,106,${star.a * pulse})`;
      ctx.beginPath();
      ctx.arc(x, y, star.r * sceneScale(), 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(255,114,90,.12)";
    ctx.font = `850 ${Math.max(7, Math.min(10, width * 0.02))}px Inter,system-ui,sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(
      "LA LUZ DURA MUCHO MÁS QUE EL RITMO DE CAMBIO",
      width * 0.5,
      height * 0.64,
    );
    ctx.restore();
  }

  function drawLastStars(time) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const star of lastStars) {
      const pulse = reducedMotion
        ? 1
        : 0.7 + Math.abs(Math.sin(time * 0.00032 + star.phase)) * 0.3;
      const x = star.x * width;
      const y = star.y * height;
      glow(
        x,
        y,
        star.r * 10 * sceneScale(),
        `rgba(255,229,169,${star.a * 0.22 * pulse})`,
        "rgba(255,149,84,.007)",
      );
      ctx.fillStyle = `rgba(255,241,199,${star.a * pulse})`;
      ctx.beginPath();
      ctx.arc(x, y, star.r * sceneScale(), 0, TAU);
      ctx.fill();
      if (star.r > 3.6) {
        ctx.strokeStyle = `rgba(255,218,150,${star.a * 0.17})`;
        ctx.lineWidth = 0.55;
        ctx.beginPath();
        ctx.moveTo(x - star.r * 4, y);
        ctx.lineTo(x + star.r * 4, y);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawRemnants(time) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const remnant of remnants) {
      const x = remnant.x * width;
      const y = remnant.y * height;
      const pulse = reducedMotion
        ? 1
        : 0.72 + Math.sin(time * 0.00022 + remnant.phase) * 0.14;
      if (remnant.type === "white") {
        glow(
          x,
          y,
          remnant.r * 6 * sceneScale(),
          `rgba(205,226,255,${remnant.a * 0.18 * pulse})`,
          "rgba(123,166,255,.005)",
        );
        ctx.fillStyle = `rgba(221,237,255,${remnant.a * pulse})`;
      } else if (remnant.type === "neutron") {
        ctx.fillStyle = `rgba(156,202,255,${remnant.a * pulse})`;
        ctx.strokeStyle = `rgba(137,190,255,${remnant.a * 0.32})`;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(x, y - remnant.r * 6);
        ctx.lineTo(x, y + remnant.r * 6);
        ctx.stroke();
      } else if (remnant.type === "brown") {
        ctx.fillStyle = `rgba(151,86,64,${remnant.a * 0.55})`;
      } else {
        ctx.fillStyle = `rgba(94,113,137,${remnant.a * 0.42})`;
      }
      ctx.beginPath();
      ctx.arc(x, y, remnant.r * sceneScale(), 0, TAU);
      ctx.fill();
    }
    ctx.setLineDash([3, 8]);
    ctx.strokeStyle = "rgba(191,211,239,.055)";
    ctx.lineWidth = 0.55;
    ctx.beginPath();
    ctx.moveTo(width * 0.5, height * 0.49);
    ctx.lineTo(width * 0.5, height * 0.3);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(209,222,242,.12)";
    ctx.font = `800 ${Math.max(7, Math.min(9, width * 0.019))}px Inter,system-ui,sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("¿PROTÓN ESTABLE?", width * 0.39, height * 0.392);
    ctx.fillText("¿PROTÓN INESTABLE?", width * 0.62, height * 0.355);
    ctx.restore();
  }

  function drawOneBlackHole(hole, time) {
    const x = hole.x * width;
    const y = hole.y * height;
    const radius = hole.r * sceneScale() * (hole.supermassive ? 1.35 : 1);
    const progress = 1 - hole.y;
    const evaporation = smoothstep(0.79, 0.92, progress);
    const visualRadius = radius * (1 - evaporation * 0.58);
    const pulse = reducedMotion
      ? 1
      : 0.88 + Math.sin(time * 0.00017 + hole.phase) * 0.08;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(hole.spin + (reducedMotion ? 0 : time * 0.000015));
    ctx.globalCompositeOperation = "screen";
    const ringAlpha = hole.a * (0.24 + evaporation * 0.32) * pulse;
    ctx.strokeStyle = `rgba(${Math.round(154 + evaporation * 88)},${Math.round(118 + evaporation * 92)},255,${ringAlpha})`;
    ctx.lineWidth = Math.max(0.55, visualRadius * 0.085);
    ctx.beginPath();
    ctx.ellipse(0, 0, visualRadius * 1.7, visualRadius * 0.46, 0, 0, TAU);
    ctx.stroke();
    glow(
      0,
      0,
      visualRadius * 2.2,
      `rgba(117,89,220,${hole.a * 0.12})`,
      "rgba(78,48,168,.008)",
    );
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(0,0,2,.98)";
    ctx.beginPath();
    ctx.arc(0, 0, visualRadius, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = `rgba(211,183,255,${hole.a * (0.15 + evaporation * 0.3)})`;
    ctx.lineWidth = 0.65;
    ctx.beginPath();
    ctx.arc(0, 0, visualRadius * 1.05, 0, TAU);
    ctx.stroke();
    ctx.restore();

    if (evaporation > 0.02) {
      const count = 2 + Math.floor(evaporation * 8);
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      for (let i = 0; i < count; i++) {
        const angle =
          hole.phase + i * 2.399 + (reducedMotion ? 0 : time * 0.00018);
        const distance = visualRadius * (1.5 + i * 0.28);
        const px = x + Math.cos(angle) * distance;
        const py = y + Math.sin(angle) * distance;
        ctx.fillStyle = `rgba(235,203,255,${0.07 + evaporation * 0.22})`;
        ctx.beginPath();
        ctx.arc(px, py, 0.45 + evaporation * 1.15, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawBlackHoleEra(time) {
    for (const hole of blackHoles) drawOneBlackHole(hole, time);
  }

  function drawDarkEra(time) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const q of darkQuanta) {
      const drift = reducedMotion
        ? 0
        : Math.sin(time * 0.00008 + q.phase) * q.drift;
      const x = ((q.x + drift + 1) % 1) * width;
      const y = q.y * height;
      const pulse = reducedMotion
        ? 0.7
        : 0.32 + Math.abs(Math.sin(time * 0.00019 + q.phase)) * 0.68;
      const rgb =
        q.kind === 0
          ? "137,181,255"
          : q.kind === 1
            ? "194,164,255"
            : "174,220,229";
      ctx.fillStyle = `rgba(${rgb},${q.a * pulse})`;
      ctx.beginPath();
      ctx.arc(x, y, q.r * sceneScale(), 0, TAU);
      ctx.fill();
      if (q.kind === 1 && q.r > 1.1) {
        ctx.strokeStyle = `rgba(${rgb},${q.a * 0.3 * pulse})`;
        ctx.lineWidth = 0.45;
        ctx.beginPath();
        ctx.moveTo(x - q.r * 4, y);
        ctx.lineTo(x + q.r * 4, y);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawUncertainFuture(time) {
    const bottom = height * 0.058;
    const veil = ctx.createLinearGradient(0, 0, 0, bottom * 1.25);
    veil.addColorStop(0, "rgba(1,2,7,.98)");
    veil.addColorStop(0.62, "rgba(13,16,28,.72)");
    veil.addColorStop(1, "rgba(15,17,30,0)");
    ctx.fillStyle = veil;
    ctx.fillRect(0, 0, width, bottom * 1.35);

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const branch of uncertaintyBranches) {
      const x0 = branch.x0 * width;
      const y0 = branch.y0 * height;
      const x1 = branch.x1 * width;
      const y1 = branch.y1 * height;
      const pulse = reducedMotion
        ? 1
        : 0.68 + Math.sin(time * 0.00031 + branch.phase) * 0.22;
      const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
      gradient.addColorStop(0, `rgba(220,224,255,${0.2 * pulse})`);
      gradient.addColorStop(1, "rgba(220,224,255,0)");
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 0.65;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(
        (x0 + x1) * 0.5 + branch.bend * width,
        (y0 + y1) * 0.5,
        x1,
        y1,
      );
      ctx.stroke();
      glow(
        x1,
        y1,
        5 * sceneScale(),
        `rgba(232,235,255,${0.15 * pulse})`,
        "rgba(150,154,255,.008)",
      );
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(231,234,255,.15)";
    ctx.font = `800 ${Math.max(5.5, Math.min(8.5, width * 0.016))}px Inter,system-ui,sans-serif`;
    uncertaintyBranches.forEach((branch) =>
      ctx.fillText(
        branch.name,
        branch.x1 * width,
        Math.max(3, branch.y1 * height + 4),
      ),
    );
    ctx.restore();
  }

  function drawContinuity() {
    const top = height * 0.955;
    const gradient = ctx.createLinearGradient(0, top, 0, height);
    gradient.addColorStop(0, "rgba(208,218,255,0)");
    gradient.addColorStop(0.48, "rgba(208,218,255,.055)");
    gradient.addColorStop(1, "rgba(222,228,255,.11)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, top, width, height - top);
    ctx.save();
    ctx.setLineDash([2, 5]);
    ctx.strokeStyle = "rgba(224,229,255,.12)";
    ctx.lineWidth = 0.55;
    ctx.beginPath();
    ctx.moveTo(0, height * 0.968);
    ctx.lineTo(width, height * 0.968);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = "rgba(234,239,255,.56)";
    ctx.font = `850 ${Math.max(7, Math.min(10, width * 0.021))}px Inter,system-ui,sans-serif`;
    ctx.fillText(
      "LA FRONTERA DE LO CONOCIBLE CONTINÚA DEBAJO",
      width * 0.5,
      height - Math.max(8, height * 0.011),
    );
    ctx.restore();
  }

  function drawScientificCues() {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `850 ${Math.max(6.5, Math.min(9.5, width * 0.019))}px Inter,system-ui,sans-serif`;
    ctx.fillStyle = "rgba(153,216,255,.145)";
    ctx.fillText("PRESENTE OBSERVADO", width * 0.5, height * 0.895);
    ctx.fillStyle = "rgba(255,180,120,.13)";
    ctx.fillText("EVOLUCIÓN MODELADA", width * 0.5, height * 0.742);
    ctx.fillStyle = "rgba(255,128,104,.13)";
    ctx.fillText("FUTURO PROBABLE", width * 0.5, height * 0.625);
    ctx.fillStyle = "rgba(193,208,235,.13)";
    ctx.fillText("FUTURO CONDICIONAL", width * 0.5, height * 0.38);
    ctx.fillStyle = "rgba(218,198,255,.13)";
    ctx.fillText("PREDICCIÓN TEÓRICA", width * 0.5, height * 0.155);
    ctx.restore();
  }

  function drawTopMessage() {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.shadowBlur = 15;
    ctx.shadowColor = "rgba(182,191,255,.28)";
    ctx.fillStyle = "rgba(242,244,255,.76)";
    ctx.font = `930 ${Math.max(7, Math.min(10.5, width * 0.021))}px Inter,system-ui,sans-serif`;
    ctx.fillText(
      "NO HAY UN FINAL ÚNICO CONFIRMADO",
      width * 0.5,
      Math.max(22, height * 0.028),
    );
    ctx.fillStyle = "rgba(221,226,245,.49)";
    ctx.font = `760 ${Math.max(6.5, Math.min(8.5, width * 0.017))}px Inter,system-ui,sans-serif`;
    ctx.fillText(
      "EL FUTURO SE RAMIFICA DONDE TERMINA LA EVIDENCIA",
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
    drawEpochBands();
    drawFieldStars(time);
    drawCurrentUniverse(time);
    drawStellarDecline(time);
    drawRedDwarfEra(time);
    drawLastStars(time);
    drawRemnants(time);
    drawBlackHoleEra(time);
    drawDarkEra(time);
    drawUncertainFuture(time);
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
    });
    canvas.focus({ preventScroll: true });
    requestAnimationFrame(draw);
  }

  init();
}
