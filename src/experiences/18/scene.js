import { createSceneAudio } from "../../shared/audio.js";
import { clamp, mix, smooth, fract, seeded, rgba } from "../../shared/math.js";
import {
  requestSceneFrame as requestAnimationFrame,
  cancelSceneFrame as cancelAnimationFrame,
} from "../../shared/animation.js";
import content from "./content.json";
const { ZONES } = content;

export function mountScene() {
  const canvas = document.getElementById("culture-spectrum");
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

  let width = 1,
    height = 1,
    dpr = 1;
  let pointerDown = false;
  let targetX = 0.5,
    targetY = 0.982,
    pointerX = 0.5,
    pointerY = 0.982;
  let shownX = 0.5,
    shownY = 0.982;
  let lastZoneId = "",
    lastFeature = -1;
  let hideTimer = 0,
    speechTimer = 0,
    lastSpoken = "",
    speechUnlocked = false;
  window.addEventListener("spectrum:cancel-tts", () => {
    clearTimeout(speechTimer);
    speechTimer = 0;
  });
  let lastFrame = performance.now(),
    elapsed = 0,
    currentProgress = 0.018,
    touchEnergy = 0;

  const particles = [],
    people = [],
    structures = [],
    routes = [],
    glyphs = [],
    bursts = [],
    waves = [];
  let audioCtx = null,
    master = null,
    droneA = null,
    droneB = null,
    droneGain = null;
  let droneFilter = null,
    pulseOsc = null,
    pulseGain = null,
    noiseSource = null;
  let noiseGain = null,
    noiseFilter = null,
    stereo = null;

  function depthFromY(yNorm) {
    return clamp(1 - yNorm, 0, 1);
  }
  function zoneForDepth(p) {
    for (const zone of ZONES) if (p >= zone.p0 && p < zone.p1) return zone;
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
    particles.length =
      people.length =
      structures.length =
      routes.length =
      glyphs.length =
        0;
    const particleCount = reducedMotion
      ? 90
      : Math.round(clamp((width * height) / 4800, 150, 360));
    for (let i = 0; i < particleCount; i++)
      particles.push({
        x: seeded(i + 1),
        y: seeded(i + 1000),
        r: 0.5 + seeded(i + 2000) * 2.4,
        phase: seeded(i + 3000) * TAU,
        speed: 0.15 + seeded(i + 4000) * 0.8,
        kind: i % 9,
      });
    for (let i = 0; i < 54; i++)
      people.push({
        x: 0.05 + seeded(i + 5000) * 0.9,
        y: 0.08 + seeded(i + 6000) * 0.82,
        r: 3 + seeded(i + 7000) * 7,
        phase: seeded(i + 8000) * TAU,
        group: i % 7,
        role: i % 5,
      });
    for (let i = 0; i < 42; i++)
      structures.push({
        x: 0.04 + seeded(i + 9000) * 0.92,
        y: 0.12 + seeded(i + 10000) * 0.74,
        w: 0.035 + seeded(i + 11000) * 0.085,
        h: 0.035 + seeded(i + 12000) * 0.12,
        phase: seeded(i + 13000) * TAU,
        kind: i % 8,
      });
    for (let i = 0; i < 34; i++)
      routes.push({
        x1: seeded(i + 14000),
        y1: seeded(i + 15000),
        x2: seeded(i + 16000),
        y2: seeded(i + 17000),
        phase: seeded(i + 18000) * TAU,
        kind: i % 5,
      });
    const chars = "AaÑ¿?123∞→≈ΣΔ✦◌⌁";
    for (let i = 0; i < 62; i++)
      glyphs.push({
        x: 0.04 + seeded(i + 19000) * 0.92,
        y: 0.06 + seeded(i + 20000) * 0.86,
        char: chars[i % chars.length],
        size: 9 + seeded(i + 21000) * 25,
        phase: seeded(i + 22000) * TAU,
        speed: 0.25 + seeded(i + 23000) * 0.8,
      });
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
    const buffer = audioCtx.createBuffer(
        1,
        audioCtx.sampleRate * 2,
        audioCtx.sampleRate,
      ),
      channel = buffer.getChannelData(0);
    for (let i = 0; i < channel.length; i++) channel[i] = Math.random() * 2 - 1;
    noiseSource = audioCtx.createBufferSource();
    noiseSource.buffer = buffer;
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
    const now = audioCtx.currentTime,
      s = zone.sound,
      base = s.base * (0.94 + xNorm * 0.13);
    droneA.type = s.type;
    droneB.type = s.type === "sawtooth" ? "triangle" : "sine";
    droneA.frequency.setTargetAtTime(base, now, 0.08);
    droneB.frequency.setTargetAtTime(
      base * (1.496 + progress * 0.012),
      now,
      0.1,
    );
    droneFilter.frequency.setTargetAtTime(
      s.filter * (0.84 + xNorm * 0.3),
      now,
      0.1,
    );
    droneGain.gain.setTargetAtTime(
      active ? 0.011 + progress * 0.006 : 0.0001,
      now,
      0.09,
    );
    pulseOsc.frequency.setTargetAtTime(base * (1.985 + s.pulse), now, 0.08);
    pulseGain.gain.setTargetAtTime(
      active ? 0.0024 + progress * 0.002 : 0.0001,
      now,
      0.1,
    );
    noiseFilter.frequency.setTargetAtTime(s.filter * 1.13, now, 0.1);
    noiseGain.gain.setTargetAtTime(
      active ? Math.max(0.0001, s.noise * 0.055) : 0.0001,
      now,
      0.1,
    );
    if (stereo.pan) stereo.pan.setTargetAtTime((xNorm - 0.5) * 0.7, now, 0.08);
    master.gain.setTargetAtTime(active ? 0.27 : 0.0001, now, 0.09);
  }

  function ping(zone, xNorm, index = 0) {
    if (!audioCtx || !master) return;
    const now = audioCtx.currentTime,
      osc = audioCtx.createOscillator(),
      gain = audioCtx.createGain(),
      filter = audioCtx.createBiquadFilter();
    const pan = audioCtx.createStereoPanner
      ? audioCtx.createStereoPanner()
      : null;
    osc.type =
      index % 3 === 0 ? "sine" : index % 3 === 1 ? "triangle" : "square";
    osc.frequency.value = zone.sound.base * (2.05 + index * 0.12);
    filter.type = "lowpass";
    filter.frequency.value = 1800 + zone.scene * 100;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.07, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.52);
    osc.connect(filter).connect(gain);
    if (pan) {
      pan.pan.value = (xNorm - 0.5) * 1.25;
      gain.connect(pan).connect(master);
    } else gain.connect(master);
    osc.start(now);
    osc.stop(now + 0.58);
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
        const u = new SpeechSynthesisUtterance(label);
        u.lang = "es-ES";
        u.rate = 0.86;
        u.pitch = 1;
        const voices = speechSynthesis.getVoices();
        const voice =
          voices.find((v) => /^es(-|_)/i.test(v.lang)) ||
          voices.find((v) => /spanish|español/i.test(v.name));
        if (voice) u.voice = voice;
        speechSynthesis.speak(u);
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
      const a = Math.random() * TAU,
        s = 18 + Math.random() * 72;
      bursts.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        r: 0.8 + Math.random() * 2.4,
        life: 1,
        decay: 1 + Math.random() * 0.8,
        color,
      });
    }
    waves.push({ x, y, radius: 5, life: 1, color });
  }

  function updateReadout(x, y, isNewPress = false) {
    const xNorm = clamp(x / width, 0, 0.999999),
      yNorm = clamp(y / height, 0, 0.999999),
      progress = depthFromY(yNorm),
      zone = zoneForDepth(progress),
      feature = featureFor(zone, xNorm);
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
      window.dispatchEvent(
        new CustomEvent("spectrum:learning-target", {
          detail: {
            parts: [feature.name, zone.metric, feature.fact || zone.fact],
            x,
            y,
            color: rgba(zone.color, 1),
          },
        }),
      );
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
      const z = zoneForDepth(depthFromY(targetY));
      setAudioFor(z, targetX, depthFromY(targetY), false);
    }, delay);
  }
  function endPointer() {
    pointerDown = false;
    releaseInteraction();
  }
  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    canvas.focus({ preventScroll: true });
    pointerDown = true;
    speechUnlocked = true;
    ensureAudio();
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (_) {}
    updateReadout(e.clientX, e.clientY, true);
    addRipple(e.clientX, e.clientY);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!pointerDown && e.pointerType !== "mouse") return;
    if (!pointerDown && e.buttons === 0) {
      targetX = clamp(e.clientX / width, 0, 1);
      targetY = clamp(e.clientY / height, 0, 1);
      return;
    }
    e.preventDefault();
    updateReadout(e.clientX, e.clientY);
  });
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.addEventListener("lostpointercapture", endPointer);
  canvas.addEventListener("keydown", (e) => {
    const keys = [
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "Enter",
      " ",
    ];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    speechUnlocked = true;
    ensureAudio();
    const step = e.shiftKey ? 0.09 : 0.035;
    if (e.key === "ArrowUp") targetY = clamp(targetY - step, 0.005, 0.995);
    if (e.key === "ArrowDown") targetY = clamp(targetY + step, 0.005, 0.995);
    if (e.key === "ArrowLeft") targetX = clamp(targetX - step, 0.005, 0.995);
    if (e.key === "ArrowRight") targetX = clamp(targetX + step, 0.005, 0.995);
    updateReadout(
      targetX * width,
      targetY * height,
      e.key === "Enter" || e.key === " ",
    );
    releaseInteraction(1600);
  });

  function softHalo(cx, cy, radius, color, alpha) {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    g.addColorStop(0, rgba(color, alpha));
    g.addColorStop(0.35, rgba(color, alpha * 0.4));
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
  function line(x1, y1, x2, y2, stroke = "rgba(255,255,255,.3)", lw = 1) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  function circle(
    x,
    y,
    r,
    fill = "rgba(255,255,255,.5)",
    stroke = null,
    lw = 1,
  ) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lw;
      ctx.stroke();
    }
  }
  function drawPerson(x, y, s, color = "rgba(255,255,255,.72)", pose = 0) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(1, s * 0.11);
    ctx.lineCap = "round";
    circle(x, y - s * 0.62, s * 0.18, color);
    line(x, y - s * 0.38, x, y + s * 0.2, color, Math.max(1, s * 0.11));
    const swing = Math.sin(pose) * s * 0.18;
    line(x, y - s * 0.15, x - s * 0.34, y + swing, color, Math.max(1, s * 0.1));
    line(x, y - s * 0.15, x + s * 0.34, y - swing, color, Math.max(1, s * 0.1));
    line(
      x,
      y + s * 0.18,
      x - s * 0.26,
      y + s * 0.62,
      color,
      Math.max(1, s * 0.1),
    );
    line(
      x,
      y + s * 0.18,
      x + s * 0.26,
      y + s * 0.62,
      color,
      Math.max(1, s * 0.1),
    );
    ctx.restore();
  }
  function drawHouse(x, y, w, h, color = "rgba(255,235,200,.5)") {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - w * 0.55, y - h * 0.12);
    ctx.lineTo(x, y - h * 0.62);
    ctx.lineTo(x + w * 0.55, y - h * 0.12);
    ctx.lineTo(x + w * 0.48, y + h * 0.52);
    ctx.lineTo(x - w * 0.48, y + h * 0.52);
    ctx.closePath();
    ctx.stroke();
    roundedRectPath(x - w * 0.1, y + h * 0.12, w * 0.2, h * 0.4, 2);
    ctx.stroke();
  }
  function drawGear(cx, cy, r, teeth, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = "rgba(0,0,0,.12)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 0; i < teeth * 2; i++) {
      const a = (i / (teeth * 2)) * TAU,
        rr = i % 2 ? r : r * 0.78;
      const x = cx + Math.cos(a) * rr,
        y = cy + Math.sin(a) * rr;
      if (!i) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    circle(cx, cy, r * 0.28, "rgba(0,0,0,.38)", color, 1.2);
    ctx.restore();
  }

  function drawBackground(progress, time) {
    const f = clamp(progress * (ZONES.length - 1), 0, ZONES.length - 1),
      i = Math.floor(f),
      j = Math.min(ZONES.length - 1, i + 1),
      t = smooth(f - i),
      a = ZONES[i].color,
      b = ZONES[j].color;
    const c = a.map((v, k) => Math.round(mix(v, b[k], t)));
    const dark = c.map((v) => Math.round(v * 0.12)),
      mid = c.map((v) => Math.round(v * 0.34));
    const g = ctx.createLinearGradient(0, height, 0, 0);
    g.addColorStop(
      0,
      `rgb(${Math.max(3, dark[0] - 5)} ${Math.max(5, dark[1] - 3)} ${Math.max(7, dark[2])})`,
    );
    g.addColorStop(0.54, `rgb(${mid[0]} ${mid[1]} ${mid[2]})`);
    g.addColorStop(
      1,
      `rgb(${Math.min(255, c[0] * 0.66)} ${Math.min(255, c[1] * 0.66)} ${Math.min(255, c[2] * 0.66)})`,
    );
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
    softHalo(
      width * (0.42 + 0.12 * Math.sin(time * 0.05)),
      height * (0.72 - progress * 0.44),
      Math.max(width, height) * 0.7,
      c,
      0.1 + progress * 0.045,
    );
    for (const p of particles) {
      const x =
          fract(p.x + time * 0.002 * p.speed) * width +
          Math.sin(time * 0.2 + p.phase) * 4,
        y =
          fract(p.y - time * 0.0012 * p.speed) * height +
          Math.cos(time * 0.15 + p.phase) * 4;
      const col =
        p.kind % 3 === 0
          ? c
          : p.kind % 3 === 1
            ? [255, 240, 205]
            : [140, 220, 255];
      circle(
        x,
        y,
        p.r * (0.75 + progress * 0.35),
        rgba(
          col,
          0.08 + 0.16 * (0.5 + 0.5 * Math.sin(time * p.speed + p.phase)),
        ),
      );
    }
    ctx.strokeStyle = "rgba(255,255,255,.025)";
    ctx.lineWidth = 1;
    for (let k = 1; k < 8; k++) {
      const x = (k / 8) * width;
      line(x, 0, x, height, "rgba(255,255,255,.018)");
    }
  }

  function sceneShared(z, time) {
    const s = Math.min(width, height),
      cx = width * 0.5,
      cy = height * 0.52;
    softHalo(cx, cy, s * 0.56, z.color, 0.19);
    for (let r = 0; r < 7; r++) {
      const rr = s * (0.06 + r * 0.045);
      ctx.strokeStyle = rgba(z.color, 0.12 + r * 0.02);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, rr, 0, TAU);
      ctx.stroke();
      const n = 5 + r * 2;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + time * (0.018 + r * 0.003),
          x = cx + Math.cos(a) * rr,
          y = cy + Math.sin(a) * rr * 0.72;
        circle(
          x,
          y,
          2 + (i % 3),
          i % 4 ? rgba([255, 246, 220], 0.55) : rgba([122, 217, 255], 0.66),
        );
        if (r > 0 && i % 3 === 0) line(x, y, cx, cy, rgba(z.color, 0.08));
      }
    }
    circle(cx, cy, 7 + Math.sin(time * 0.7), rgba([255, 250, 230], 0.95));
  }
  function sceneCommunication(z, time) {
    const s = Math.min(width, height),
      cy = height * 0.56;
    for (let i = 0; i < 5; i++) {
      const x = width * (0.14 + i * 0.18),
        pose = time * 0.9 + i;
      drawPerson(
        x,
        cy + Math.sin(i) * s * 0.04,
        s * 0.065,
        rgba([255, 255, 255], 0.72),
        pose,
      );
      for (let r = 1; r < 4; r++) {
        ctx.strokeStyle = rgba(z.color, 0.24 / r);
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.arc(
          x + (i < 2 ? 1 : -1) * s * 0.035,
          cy - s * 0.055,
          s * (0.035 + r * 0.026) + Math.sin(time * 2 + i) * 2,
          -0.7,
          0.7,
        );
        ctx.stroke();
      }
    }
    for (let i = 0; i < 4; i++)
      line(
        width * (0.19 + i * 0.18),
        cy - s * 0.04,
        width * (0.27 + i * 0.18),
        cy - s * 0.04,
        rgba(z.color, 0.15),
        1.4,
      );
  }
  function sceneLanguage(z, time) {
    const s = Math.min(width, height);
    for (let i = 0; i < glyphs.length; i++) {
      const g = glyphs[i],
        x = g.x * width,
        y = g.y * height + Math.sin(time * g.speed + g.phase) * 9;
      ctx.font = `800 ${g.size}px system-ui`;
      ctx.textAlign = "center";
      ctx.fillStyle = rgba(
        i % 4 ? z.color : [255, 248, 225],
        0.11 + (i % 5) * 0.035,
      );
      ctx.fillText(g.char, x, y);
    }
    for (let i = 0; i < 4; i++) {
      const x = width * (0.17 + i * 0.22),
        y = height * (0.34 + (i % 2) * 0.28),
        w = s * 0.2,
        h = s * 0.1;
      ctx.strokeStyle = rgba(z.color, 0.38);
      ctx.lineWidth = 1.3;
      roundedRectPath(x - w * 0.5, y - h * 0.5, w, h, h * 0.35);
      ctx.stroke();
      line(
        x - w * 0.13,
        y + h * 0.5,
        x - w * 0.05,
        y + h * 0.76,
        rgba(z.color, 0.34),
        1.2,
      );
    }
  }
  function sceneStories(z, time) {
    const s = Math.min(width, height),
      base = height * 0.72;
    softHalo(width * 0.5, base, s * 0.3, [255, 111, 69], 0.17);
    circle(width * 0.5, base, s * 0.035, "rgba(255,196,95,.88)");
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + Math.PI * 0.5,
        x = width * 0.5 + Math.cos(a) * s * 0.22,
        y = base + Math.sin(a) * s * 0.115;
      drawPerson(x, y, s * 0.044, rgba([255, 240, 220], 0.64), time + i);
    }
    ctx.strokeStyle = rgba(z.color, 0.34);
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 90; i++) {
      const x = (i / 90) * width,
        y =
          height *
          (0.22 +
            0.08 * Math.sin(i * 0.18 + time * 0.3) +
            0.035 * Math.sin(i * 0.47));
      if (!i) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    for (let i = 0; i < 6; i++)
      circle(
        width * (0.1 + i * 0.16),
        height * (0.22 + 0.08 * Math.sin(i * 2.9 + time * 0.3)),
        3 + (i % 3),
        rgba([255, 242, 203], 0.7),
      );
  }
  function sceneTeaching(z, time) {
    const s = Math.min(width, height),
      y = height * 0.55;
    drawPerson(width * 0.3, y, s * 0.09, rgba([255, 248, 220], 0.76), time);
    drawPerson(
      width * 0.7,
      y + s * 0.04,
      s * 0.075,
      rgba(z.color, 0.84),
      time + 0.8,
    );
    const bx = width * 0.5,
      by = height * 0.28,
      bw = s * 0.34,
      bh = s * 0.18;
    ctx.strokeStyle = rgba(z.color, 0.5);
    ctx.lineWidth = 1.8;
    roundedRectPath(bx - bw * 0.5, by - bh * 0.5, bw, bh, 8);
    ctx.stroke();
    for (let i = 0; i < 4; i++)
      line(
        bx - bw * 0.35,
        by - bh * 0.25 + i * bh * 0.17,
        bx + bw * 0.35,
        by - bh * 0.25 + i * bh * 0.17,
        i === 2 ? rgba([255, 244, 208], 0.45) : rgba(z.color, 0.24),
        1.2,
      );
    line(
      width * 0.37,
      y - s * 0.2,
      bx - bw * 0.22,
      by + bh * 0.22,
      rgba(z.color, 0.24),
    );
    line(
      width * 0.63,
      y - s * 0.2,
      bx + bw * 0.22,
      by + bh * 0.22,
      rgba(z.color, 0.24),
    );
  }
  function sceneCooperation(z, time) {
    const s = Math.min(width, height),
      ground = height * 0.7;
    ctx.fillStyle = rgba(z.color, 0.12);
    ctx.fillRect(width * 0.18, ground - s * 0.06, width * 0.64, s * 0.12);
    for (let i = 0; i < 6; i++) {
      const x = width * (0.17 + i * 0.13),
        yy = ground - s * (0.09 + 0.02 * (i % 2));
      drawPerson(
        x,
        yy,
        s * 0.055,
        rgba(i % 2 ? z.color : [255, 245, 220], 0.72),
        time + i,
      );
    }
    const beamY = ground - s * 0.18;
    line(
      width * 0.13,
      beamY,
      width * 0.87,
      beamY,
      rgba([255, 213, 151], 0.72),
      s * 0.035,
    );
    for (let i = 0; i < 6; i++)
      line(
        width * (0.17 + i * 0.13),
        ground - s * 0.14,
        width * (0.17 + i * 0.13),
        beamY,
        rgba(z.color, 0.45),
        2,
      );
  }
  function sceneNorms(z, time) {
    const s = Math.min(width, height),
      cx = width * 0.5,
      cy = height * 0.5,
      r = s * 0.28;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + time * 0.012,
        x = cx + Math.cos(a) * r,
        y = cy + Math.sin(a) * r * 0.72;
      drawPerson(
        x,
        y,
        s * 0.04,
        rgba(i % 3 ? z.color : [255, 245, 220], 0.66),
        a + time,
      );
    }
    circle(cx, cy, s * 0.07, "rgba(0,0,0,.14)", rgba(z.color, 0.55), 1.6);
    line(
      cx - s * 0.055,
      cy,
      cx + s * 0.055,
      cy,
      rgba([255, 248, 220], 0.72),
      3,
    );
    line(
      cx,
      cy - s * 0.055,
      cx,
      cy + s * 0.055,
      rgba([255, 248, 220], 0.72),
      3,
    );
  }
  function sceneTools(z, time) {
    const s = Math.min(width, height),
      y = height * 0.52;
    for (let i = 0; i < 6; i++) {
      const x = width * (0.1 + i * 0.16);
      ctx.save();
      ctx.translate(x, y + Math.sin(time * 0.7 + i) * 8);
      ctx.rotate((i - 2.5) * 0.08);
      ctx.strokeStyle = i % 2 ? rgba(z.color, 0.74) : "rgba(255,239,205,.68)";
      ctx.fillStyle = rgba(z.color, 0.16);
      ctx.lineWidth = 2;
      if (i === 0) {
        ctx.beginPath();
        ctx.moveTo(-s * 0.035, s * 0.055);
        ctx.lineTo(0, -s * 0.065);
        ctx.lineTo(s * 0.045, s * 0.04);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (i === 1) {
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.045, 0, TAU);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.025, 0, TAU);
        ctx.stroke();
      } else if (i === 2) {
        line(-s * 0.055, 0, s * 0.055, 0, ctx.strokeStyle, 3);
        circle(s * 0.055, 0, s * 0.012, ctx.strokeStyle);
      } else if (i === 3) {
        roundedRectPath(-s * 0.04, -s * 0.055, s * 0.08, s * 0.11, s * 0.02);
        ctx.stroke();
      } else if (i === 4) {
        line(-s * 0.02, s * 0.06, s * 0.025, -s * 0.06, ctx.strokeStyle, 4);
        line(-s * 0.045, -s * 0.02, s * 0.06, -s * 0.02, ctx.strokeStyle, 8);
      } else {
        for (let r = 0; r < 4; r++) {
          ctx.beginPath();
          ctx.arc(0, 0, s * (0.02 + r * 0.013), 0, TAU);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }
  function sceneArt(z, time) {
    const s = Math.min(width, height),
      cx = width * 0.5,
      cy = height * 0.5;
    for (let r = 0; r < 9; r++) {
      ctx.strokeStyle = rgba(
        r % 3 ? z.color : [255, 226, 144],
        0.11 + r * 0.018,
      );
      ctx.lineWidth = 1 + r * 0.18;
      ctx.beginPath();
      for (let i = 0; i <= 100; i++) {
        const a = (i / 100) * TAU,
          rr =
            s *
            (0.05 + r * 0.026) *
            (1 + 0.12 * Math.sin(a * (3 + (r % 4)) + time * 0.6));
        const x = cx + Math.cos(a) * rr,
          y = cy + Math.sin(a) * rr * 0.78;
        if (!i) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + time * 0.08,
        x = cx + Math.cos(a) * s * 0.31,
        y = cy + Math.sin(a) * s * 0.22;
      drawPerson(
        x,
        y,
        s * 0.038,
        rgba(i % 2 ? z.color : [255, 250, 225], 0.7),
        time * 1.5 + i,
      );
    }
  }
  function sceneExchange(z, time) {
    const s = Math.min(width, height),
      y = height * 0.56;
    for (let side = 0; side < 2; side++) {
      const base = side ? width * 0.73 : width * 0.27;
      for (let i = 0; i < 4; i++)
        drawPerson(
          base + (i - 1.5) * s * 0.055,
          y + (i % 2) * s * 0.035,
          s * 0.04,
          rgba(side ? z.color : [255, 239, 208], 0.68),
          time + i,
        );
    }
    ctx.strokeStyle = rgba(z.color, 0.38);
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.moveTo(width * 0.34, y - s * 0.12);
    ctx.bezierCurveTo(
      width * 0.45,
      y - s * 0.26,
      width * 0.55,
      y + s * 0.08,
      width * 0.66,
      y - s * 0.1,
    );
    ctx.stroke();
    ctx.setLineDash([]);
    for (let i = 0; i < 5; i++) {
      const t = fract(time * 0.08 + i / 5),
        x = mix(width * 0.34, width * 0.66, t),
        yy = y - s * 0.12 + Math.sin(t * Math.PI) * -s * 0.09;
      circle(x, yy, 3 + (i % 2), rgba(i % 2 ? z.color : [255, 225, 135], 0.82));
    }
  }
  function sceneAgriculture(z, time) {
    const s = Math.min(width, height),
      horizon = height * 0.28;
    ctx.fillStyle = rgba([95, 160, 72], 0.18);
    ctx.fillRect(0, horizon, width, height - horizon);
    for (let row = 0; row < 7; row++) {
      const y = horizon + ((row + 1) / 8) * (height - horizon);
      line(
        width * 0.06,
        y,
        width * 0.94,
        y,
        rgba([214, 187, 118], 0.15 + row * 0.018),
        1.4,
      );
      for (let i = 0; i < 9; i++) {
        const x = width * (0.08 + i * 0.105) + (row % 2) * 12;
        line(x, y, x, y - s * 0.035, rgba(z.color, 0.54), 1.5);
        line(
          x,
          y - s * 0.02,
          x - s * 0.015,
          y - s * 0.035,
          rgba(z.color, 0.4),
          1,
        );
        line(
          x,
          y - s * 0.026,
          x + s * 0.015,
          y - s * 0.045,
          rgba(z.color, 0.4),
          1,
        );
      }
    }
    ctx.strokeStyle = rgba([111, 202, 255], 0.45);
    ctx.lineWidth = s * 0.018;
    ctx.beginPath();
    ctx.moveTo(0, height * 0.54);
    ctx.bezierCurveTo(
      width * 0.3,
      height * 0.48,
      width * 0.7,
      height * 0.66,
      width,
      height * 0.58,
    );
    ctx.stroke();
    circle(width * 0.82, height * 0.17, s * 0.055, rgba([255, 225, 123], 0.65));
  }
  function sceneSettlement(z, time) {
    const s = Math.min(width, height),
      ground = height * 0.73;
    line(0, ground, width, ground, rgba([244, 222, 185], 0.28), 2);
    for (let i = 0; i < 8; i++) {
      const x = width * (0.08 + i * 0.12),
        w = s * (0.09 + (i % 3) * 0.015),
        h = s * (0.1 + (i % 2) * 0.02);
      drawHouse(
        x,
        ground - h * 0.35,
        w,
        h,
        i % 2 ? rgba(z.color, 0.58) : "rgba(255,234,198,.53)",
      );
    }
    ctx.strokeStyle = rgba([218, 188, 135], 0.22);
    ctx.lineWidth = s * 0.035;
    ctx.beginPath();
    ctx.moveTo(width * 0.48, height);
    ctx.bezierCurveTo(
      width * 0.42,
      height * 0.82,
      width * 0.57,
      height * 0.65,
      width * 0.5,
      height * 0.46,
    );
    ctx.stroke();
    circle(width * 0.5, height * 0.44, s * 0.018, rgba([255, 176, 81], 0.75));
  }
  function sceneWriting(z, time) {
    const s = Math.min(width, height),
      x = width * 0.5,
      y = height * 0.5,
      w = s * 0.48,
      h = s * 0.58;
    ctx.fillStyle = "rgba(25,18,14,.24)";
    ctx.strokeStyle = rgba(z.color, 0.55);
    ctx.lineWidth = 2;
    roundedRectPath(x - w * 0.5, y - h * 0.5, w, h, 12);
    ctx.fill();
    ctx.stroke();
    ctx.save();
    ctx.beginPath();
    roundedRectPath(x - w * 0.48, y - h * 0.47, w * 0.96, h * 0.94, 10);
    ctx.clip();
    for (let i = 0; i < 36; i++) {
      const g = glyphs[i],
        gx = x - w * 0.42 + (i % 6) * w * 0.165,
        gy = y - h * 0.38 + Math.floor(i / 6) * h * 0.15;
      ctx.font = `700 ${s * 0.035}px serif`;
      ctx.textAlign = "center";
      ctx.fillStyle = i % 5 ? rgba(z.color, 0.52) : "rgba(255,246,220,.72)";
      ctx.fillText(g.char, gx, gy + Math.sin(time * 0.5 + g.phase) * 2);
    }
    ctx.restore();
  }
  function sceneCity(z, time) {
    const s = Math.min(width, height),
      ground = height * 0.8;
    const grad = ctx.createLinearGradient(0, height * 0.2, 0, ground);
    grad.addColorStop(0, rgba(z.color, 0.04));
    grad.addColorStop(1, rgba(z.color, 0.18));
    ctx.fillStyle = grad;
    ctx.fillRect(0, height * 0.15, width, ground - height * 0.15);
    for (let i = 0; i < 16; i++) {
      const st = structures[i],
        x = (i / 15) * width,
        w = s * (0.035 + (i % 4) * 0.012),
        h = s * (0.11 + (i % 7) * 0.045);
      ctx.fillStyle = i % 3 ? rgba([22, 24, 31], 0.62) : rgba(z.color, 0.14);
      ctx.strokeStyle = rgba(z.color, 0.22 + (i % 3) * 0.07);
      ctx.lineWidth = 1.2;
      ctx.fillRect(x - w * 0.5, ground - h, w, h);
      ctx.strokeRect(x - w * 0.5, ground - h, w, h);
      for (let r = 0; r < Math.floor(h / (s * 0.04)); r++)
        for (let c = 0; c < 2; c++)
          circle(
            x + (c - 0.5) * w * 0.35,
            ground - h + s * 0.025 + r * s * 0.04,
            1.4,
            (r + c + i) % 4 ? "rgba(255,214,123,.35)" : "rgba(120,210,255,.35)",
          );
    }
    ctx.strokeStyle = "rgba(255,255,255,.11)";
    ctx.lineWidth = s * 0.03;
    ctx.beginPath();
    ctx.moveTo(width * 0.5, height);
    ctx.lineTo(width * 0.46, ground);
    ctx.stroke();
  }
  function sceneInstitutions(z, time) {
    const s = Math.min(width, height),
      cx = width * 0.5,
      base = height * 0.7,
      w = s * 0.5,
      h = s * 0.34;
    ctx.strokeStyle = rgba(z.color, 0.62);
    ctx.fillStyle = "rgba(5,10,22,.22)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.55, base - h * 0.72);
    ctx.lineTo(cx, base - h);
    ctx.lineTo(cx + w * 0.55, base - h * 0.72);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    for (let i = 0; i < 7; i++) {
      const x = cx - w * 0.42 + i * w * 0.14;
      ctx.fillStyle = rgba(z.color, 0.14);
      ctx.fillRect(x - s * 0.025, base - h * 0.68, s * 0.05, h * 0.65);
      ctx.strokeRect(x - s * 0.025, base - h * 0.68, s * 0.05, h * 0.65);
    }
    line(cx - w * 0.54, base, cx + w * 0.54, base, rgba(z.color, 0.62), 4);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + time * 0.01,
        x = cx + Math.cos(a) * s * 0.35,
        y = height * 0.34 + Math.sin(a) * s * 0.12;
      circle(x, y, 3 + (i % 2), rgba(i % 3 ? z.color : [255, 244, 218], 0.6));
      line(x, y, cx, base - h * 0.65, rgba(z.color, 0.09));
    }
  }
  function sceneCommerce(z, time) {
    const s = Math.min(width, height),
      cx = width * 0.5,
      cy = height * 0.5;
    ctx.strokeStyle = rgba(z.color, 0.22);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(cx, cy, s * 0.33, s * 0.25, 0, 0, TAU);
    ctx.stroke();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU,
        x = cx + Math.cos(a) * s * 0.33,
        y = cy + Math.sin(a) * s * 0.25;
      circle(x, y, 3 + (i % 3), rgba(i % 2 ? z.color : [255, 229, 171], 0.7));
      const j = (i * 5 + 3) % 12,
        a2 = (j / 12) * TAU,
        x2 = cx + Math.cos(a2) * s * 0.33,
        y2 = cy + Math.sin(a2) * s * 0.25;
      ctx.strokeStyle = rgba(z.color, 0.15);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(
        cx + Math.sin(a + i) * s * 0.12,
        cy + Math.cos(a - i) * s * 0.08,
        x2,
        y2,
      );
      ctx.stroke();
    }
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + time * 0.08,
        x = cx + Math.cos(a) * s * 0.22,
        y = cy + Math.sin(a) * s * 0.16;
      circle(x, y, 2.8, rgba([255, 242, 197], 0.8));
    }
  }
  function sceneScience(z, time) {
    const s = Math.min(width, height),
      cx = width * 0.5,
      cy = height * 0.52;
    for (let r = 0; r < 5; r++) {
      ctx.strokeStyle = rgba(
        r % 2 ? z.color : [255, 245, 214],
        0.13 + r * 0.035,
      );
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(
        cx,
        cy,
        s * (0.08 + r * 0.047),
        s * (0.04 + r * 0.022),
        r * 0.55 + time * 0.02,
        0,
        TAU,
      );
      ctx.stroke();
    }
    circle(cx, cy, s * 0.035, rgba([255, 246, 212], 0.82));
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + time * 0.16,
        r = s * (0.11 + (i % 3) * 0.055),
        x = cx + Math.cos(a) * r,
        y = cy + Math.sin(a) * r * 0.55;
      circle(x, y, 2 + (i % 3), rgba(z.color, 0.75));
    }
    const gx = width * 0.1,
      gy = height * 0.18,
      gw = width * 0.25,
      gh = height * 0.2;
    line(gx, gy + gh, gx + gw, gy + gh, "rgba(255,255,255,.28)", 1.5);
    line(gx, gy, gx, gy + gh, "rgba(255,255,255,.28)", 1.5);
    ctx.strokeStyle = rgba(z.color, 0.7);
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 30; i++) {
      const x = gx + (i / 30) * gw,
        y =
          gy +
          gh * (0.75 - 0.55 / (1 + Math.exp(-(i - 15) / 4))) +
          Math.sin(i * 0.7) * 3;
      if (!i) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  function sceneIndustry(z, time) {
    const s = Math.min(width, height),
      ground = height * 0.77;
    ctx.fillStyle = "rgba(13,15,18,.64)";
    for (let i = 0; i < 7; i++) {
      const x = width * (0.08 + i * 0.14),
        w = s * 0.09,
        h = s * (0.12 + (i % 3) * 0.07);
      ctx.fillRect(x - w * 0.5, ground - h, w, h);
      ctx.strokeStyle = rgba(z.color, 0.28);
      ctx.strokeRect(x - w * 0.5, ground - h, w, h);
    }
    for (let i = 0; i < 3; i++) {
      const x = width * (0.2 + i * 0.27);
      ctx.fillRect(x, ground - s * 0.34, s * 0.045, s * 0.34);
      const smokeY = ground - s * 0.35;
      for (let k = 0; k < 5; k++)
        circle(
          x + s * 0.022 + Math.sin(time * 0.4 + k) * s * 0.02,
          smokeY - k * s * 0.045,
          s * (0.018 + k * 0.004),
          rgba([210, 210, 210], 0.06 + k * 0.015),
        );
    }
    drawGear(width * 0.43, height * 0.58, s * 0.115, 14, rgba(z.color, 0.6));
    drawGear(
      width * 0.61,
      height * 0.61,
      s * 0.08,
      11,
      rgba([255, 224, 175], 0.48),
    );
    for (let i = 0; i < 8; i++)
      line(
        (i / 7) * width,
        ground + s * 0.04,
        ((i + 1) / 7) * width,
        ground + s * 0.04,
        rgba([255, 205, 95], 0.24),
        4,
      );
  }
  function sceneGlobal(z, time) {
    const s = Math.min(width, height),
      cx = width * 0.5,
      cy = height * 0.5,
      r = s * 0.31;
    softHalo(cx, cy, r * 1.8, z.color, 0.15);
    ctx.strokeStyle = rgba(z.color, 0.35);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.stroke();
    for (let lat = -2; lat <= 2; lat++) {
      ctx.beginPath();
      ctx.ellipse(
        cx,
        cy,
        r * Math.cos(lat * 0.24),
        r * 0.28 * Math.cos(lat * 0.24),
        0,
        0,
        TAU,
      );
      ctx.strokeStyle = rgba(z.color, 0.12);
      ctx.stroke();
    }
    for (let lon = 0; lon < 7; lon++) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, r * 0.28, r, (lon / 7) * TAU, 0, TAU);
      ctx.strokeStyle = rgba(z.color, 0.11);
      ctx.stroke();
    }
    const pts = [];
    for (let i = 0; i < 22; i++) {
      const a = seeded(i + 50) * TAU,
        rr = Math.sqrt(seeded(i + 90)) * r * 0.92,
        x = cx + Math.cos(a) * rr,
        y = cy + Math.sin(a) * rr * 0.74;
      pts.push([x, y]);
      circle(x, y, 2 + (i % 3), rgba(i % 4 ? z.color : [255, 240, 205], 0.72));
    }
    for (let i = 0; i < 28; i++) {
      const a = pts[i % pts.length],
        b = pts[(i * 7 + 5) % pts.length];
      ctx.strokeStyle = rgba(z.color, 0.09 + (i % 4) * 0.025);
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.quadraticCurveTo(
        cx + Math.sin(i) * r * 0.2,
        cy + Math.cos(i) * r * 0.15,
        b[0],
        b[1],
      );
      ctx.stroke();
    }
    for (let i = 0; i < 5; i++) {
      const a = time * 0.08 + (i / 5) * TAU,
        x = cx + Math.cos(a) * r * 1.23,
        y = cy + Math.sin(a) * r * 0.52;
      circle(x, y, 3, rgba([255, 245, 220], 0.75));
      line(
        x,
        y,
        cx + Math.cos(a) * r,
        cy + Math.sin(a) * r * 0.74,
        rgba(z.color, 0.17),
      );
    }
  }
  function scenePlanetary(z, time) {
    const s = Math.min(width, height),
      cx = width * 0.5,
      cy = height * 0.52,
      r = s * 0.27;
    softHalo(cx, cy, r * 2.2, z.color, 0.22);
    const g = ctx.createRadialGradient(
      cx - r * 0.35,
      cy - r * 0.42,
      r * 0.05,
      cx,
      cy,
      r,
    );
    g.addColorStop(0, "rgba(190,245,255,.98)");
    g.addColorStop(0.43, "rgba(68,169,220,.92)");
    g.addColorStop(1, "rgba(12,44,95,.96)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.clip();
    ctx.fillStyle = "rgba(88,184,115,.68)";
    for (let i = 0; i < 11; i++) {
      const a = seeded(i + 300) * TAU,
        rr = seeded(i + 330) * r * 0.75,
        x = cx + Math.cos(a) * rr,
        y = cy + Math.sin(a) * rr * 0.8;
      ctx.beginPath();
      ctx.ellipse(
        x,
        y,
        r * (0.07 + seeded(i + 350) * 0.13),
        r * (0.025 + seeded(i + 370) * 0.07),
        a,
        0,
        TAU,
      );
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(255,255,255,.17)";
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      ctx.arc(
        cx - r * 0.2 + i * r * 0.07,
        cy - r * 0.1 + i * r * 0.03,
        r * (0.5 + i * 0.05),
        0.2,
        2.5,
      );
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = "rgba(180,238,255,.52)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.stroke();
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * TAU + time * 0.012,
        x = cx + Math.cos(a) * r * 0.82,
        y = cy + Math.sin(a) * r * 0.82;
      circle(
        x,
        y,
        1.7 + (i % 3),
        rgba(i % 4 ? z.color : [255, 240, 185], 0.42),
      );
    }
    for (let i = 0; i < 4; i++) {
      const a = time * (0.07 + i * 0.012) + (i * TAU) / 4,
        rr = r * (1.33 + i * 0.11),
        x = cx + Math.cos(a) * rr,
        y = cy + Math.sin(a) * rr * 0.62;
      circle(x, y, 3 + i, rgba([255, 247, 218], 0.78));
      line(
        x,
        y,
        cx + Math.cos(a) * r,
        cy + Math.sin(a) * r * 0.62,
        rgba(z.color, 0.16),
      );
    }
    ctx.font = `800 ${s * 0.028}px system-ui`;
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,.6)";
    ctx.fillText(
      "TECNOLOGÍA · INFORMACIÓN · ENERGÍA · FUTUROS",
      cx,
      height * 0.91,
    );
  }

  const SCENES = [
    sceneShared,
    sceneCommunication,
    sceneLanguage,
    sceneStories,
    sceneTeaching,
    sceneCooperation,
    sceneNorms,
    sceneTools,
    sceneArt,
    sceneExchange,
    sceneAgriculture,
    sceneSettlement,
    sceneWriting,
    sceneCity,
    sceneInstitutions,
    sceneCommerce,
    sceneScience,
    sceneIndustry,
    sceneGlobal,
    scenePlanetary,
  ];
  function zoneWeight(progress, p0, p1, feather = 0.035) {
    const enter = smooth(clamp((progress - (p0 - feather)) / feather, 0, 1)),
      exit = 1 - smooth(clamp((progress - p1) / feather, 0, 1));
    return enter * exit;
  }
  function drawScene(progress, time) {
    for (const z of ZONES) {
      const alpha = zoneWeight(progress, z.p0, z.p1, 0.036);
      if (alpha < 0.003) continue;
      ctx.save();
      ctx.globalAlpha = alpha;
      SCENES[z.scene](z, time);
      ctx.restore();
    }
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
      circle(p.x, p.y, p.r * (0.5 + p.life), rgba(p.color, p.life * 0.55));
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
    drawScene(currentProgress, elapsed);
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
