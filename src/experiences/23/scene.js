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
  const canvas = document.getElementById("cosmic-perspectives-spectrum");
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
    nodes = [],
    structures = [],
    packets = [],
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
      nodes.length =
      structures.length =
      packets.length =
      glyphs.length =
        0;
    const count = reducedMotion
      ? 90
      : Math.round(clamp((width * height) / 4800, 150, 380));
    for (let i = 0; i < count; i++)
      particles.push({
        x: seeded(i + 1),
        y: seeded(i + 1000),
        r: 0.5 + seeded(i + 2000) * 2.4,
        phase: seeded(i + 3000) * TAU,
        speed: 0.12 + seeded(i + 4000) * 0.9,
        kind: i % 11,
      });
    for (let i = 0; i < 70; i++)
      nodes.push({
        x: 0.05 + seeded(i + 5000) * 0.9,
        y: 0.07 + seeded(i + 6000) * 0.86,
        r: 2 + seeded(i + 7000) * 5,
        phase: seeded(i + 8000) * TAU,
        kind: i % 9,
      });
    for (let i = 0; i < 46; i++)
      structures.push({
        x: 0.03 + seeded(i + 9000) * 0.94,
        y: 0.08 + seeded(i + 10000) * 0.84,
        w: 0.025 + seeded(i + 11000) * 0.09,
        h: 0.03 + seeded(i + 12000) * 0.16,
        phase: seeded(i + 13000) * TAU,
        kind: i % 10,
      });
    for (let i = 0; i < 62; i++)
      packets.push({
        x1: seeded(i + 14000),
        y1: seeded(i + 15000),
        x2: seeded(i + 16000),
        y2: seeded(i + 17000),
        phase: seeded(i + 18000) * TAU,
        speed: 0.16 + seeded(i + 18100) * 0.55,
        kind: i % 7,
      });
    const chars = "01λΣΔAI{}<>→∞⊕◌⌁✦?";
    for (let i = 0; i < 80; i++)
      glyphs.push({
        x: 0.04 + seeded(i + 19000) * 0.92,
        y: 0.06 + seeded(i + 20000) * 0.86,
        char: chars[i % chars.length],
        size: 9 + seeded(i + 21000) * 22,
        phase: seeded(i + 22000) * TAU,
        speed: 0.2 + seeded(i + 23000) * 0.9,
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
      active ? 0.01 + progress * 0.006 : 0.0001,
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
      active ? Math.max(0.0001, s.noise * 0.052) : 0.0001,
      now,
      0.1,
    );
    if (stereo.pan) stereo.pan.setTargetAtTime((xNorm - 0.5) * 0.7, now, 0.08);
    master.gain.setTargetAtTime(active ? 0.25 : 0.0001, now, 0.09);
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
    filter.frequency.value = 1800 + zone.scene * 105;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.065, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.48);
    osc.connect(filter).connect(gain);
    if (pan) {
      pan.pan.value = (xNorm - 0.5) * 1.25;
      gain.connect(pan).connect(master);
    } else gain.connect(master);
    osc.start(now);
    osc.stop(now + 0.54);
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
    node.addEventListener("animationend", () => node.remove(), {
      once: true,
    });
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
    if (isNewPress) {
      currentProgress = progress;
      pointerX = xNorm;
      pointerY = yNorm;
    }
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
  function polygon(points, fill, stroke = null, lw = 1) {
    ctx.beginPath();
    points.forEach((p, i) =>
      i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]),
    );
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lw;
      ctx.stroke();
    }
  }
  function drawGear(cx, cy, r, teeth, color, rotation = 0) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.strokeStyle = color;
    ctx.fillStyle = "rgba(0,0,0,.15)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 0; i < teeth * 2; i++) {
      const a = (i / (teeth * 2)) * TAU,
        rr = i % 2 ? r : r * 0.76;
      const x = Math.cos(a) * rr,
        y = Math.sin(a) * rr;
      if (!i) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    circle(0, 0, r * 0.27, "rgba(0,0,0,.42)", color, 1.2);
    ctx.restore();
  }
  function drawGlobe(cx, cy, r, z, time, network = true) {
    softHalo(cx, cy, r * 2.15, z.color, 0.2);
    const g = ctx.createRadialGradient(
      cx - r * 0.38,
      cy - r * 0.43,
      r * 0.04,
      cx,
      cy,
      r,
    );
    g.addColorStop(0, "rgba(205,248,255,.98)");
    g.addColorStop(0.42, "rgba(63,173,222,.94)");
    g.addColorStop(1, "rgba(8,39,92,.97)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.clip();
    ctx.fillStyle = "rgba(86,186,114,.67)";
    for (let i = 0; i < 12; i++) {
      const a = seeded(i + 300) * TAU,
        rr = seeded(i + 330) * r * 0.77,
        x = cx + Math.cos(a) * rr,
        y = cy + Math.sin(a) * rr * 0.78;
      ctx.beginPath();
      ctx.ellipse(
        x,
        y,
        r * (0.055 + seeded(i + 350) * 0.13),
        r * (0.025 + seeded(i + 370) * 0.065),
        a,
        0,
        TAU,
      );
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(255,255,255,.15)";
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      ctx.arc(
        cx - r * 0.24 + i * r * 0.075,
        cy - r * 0.13 + i * r * 0.035,
        r * (0.47 + i * 0.05),
        0.18,
        2.55,
      );
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = "rgba(190,240,255,.55)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.stroke();
    if (network) {
      for (let i = 0; i < 27; i++) {
        const a = (i / 27) * TAU + time * 0.01,
          x = cx + Math.cos(a) * r * 0.82,
          y = cy + Math.sin(a) * r * 0.82;
        circle(
          x,
          y,
          1.5 + (i % 3),
          rgba(i % 4 ? z.color : [255, 240, 185], 0.46),
        );
      }
    }
  }
  function drawBuilding(x, ground, w, h, color, lit = 0.45) {
    ctx.fillStyle = "rgba(8,14,25,.58)";
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.fillRect(x - w * 0.5, ground - h, w, h);
    ctx.strokeRect(x - w * 0.5, ground - h, w, h);
    let row = 0;
    for (let ry = 0; ry < h - w * 0.2; ry += Math.max(10, w * 0.38), row++)
      for (let c = -1; c <= 1; c++) {
        const on =
          fract(Math.sin((x + row * 17 + c * 31) * 12.9898) * 43758.5453) < lit;
        circle(
          x + c * w * 0.23,
          ground - h + w * 0.22 + ry,
          1.25,
          on ? "rgba(255,230,145,.45)" : "rgba(120,220,255,.2)",
        );
      }
  }
  function drawTool(x, y, len, angle, type, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.lineCap = "round";
    if (type === "hammer") {
      line(-len * 0.42, 0, len * 0.35, 0, "rgba(180,120,73,.9)", len * 0.1);
      ctx.fillStyle = color;
      roundedRectPath(
        len * 0.17,
        -len * 0.18,
        len * 0.34,
        len * 0.36,
        len * 0.05,
      );
      ctx.fill();
    } else if (type === "knife") {
      line(-len * 0.42, 0, -len * 0.1, 0, "rgba(156,96,55,.9)", len * 0.12);
      polygon(
        [
          [-len * 0.1, -len * 0.08],
          [len * 0.45, -len * 0.03],
          [len * 0.28, len * 0.12],
          [-len * 0.1, len * 0.08],
        ],
        "rgba(220,240,250,.75)",
        color,
        1,
      );
    } else if (type === "needle") {
      line(-len * 0.45, 0, len * 0.45, 0, color, 2);
      circle(-len * 0.36, 0, len * 0.055, "rgba(0,0,0,.2)", color, 1);
    } else if (type === "rope") {
      ctx.strokeStyle = color;
      ctx.lineWidth = len * 0.045;
      ctx.beginPath();
      for (let i = 0; i <= 30; i++) {
        const xx = -len * 0.45 + (i / 30) * len * 0.9,
          yy = Math.sin(i * 0.7) * len * 0.04;
        i ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy);
      }
      ctx.stroke();
    } else {
      line(-len * 0.42, 0, len * 0.42, 0, color, len * 0.06);
      circle(len * 0.34, 0, len * 0.12, "rgba(0,0,0,.2)", color, 2);
    }
    ctx.restore();
  }

  function drawBackground(progress, time) {
    const f = clamp(progress * (ZONES.length - 1), 0, ZONES.length - 1),
      i = Math.floor(f),
      j = Math.min(ZONES.length - 1, i + 1),
      t = smooth(f - i),
      a = ZONES[i].color,
      b = ZONES[j].color;
    const c = a.map((v, k) => Math.round(mix(v, b[k], t))),
      dark = c.map((v) => Math.round(v * 0.09)),
      mid = c.map((v) => Math.round(v * 0.29));
    const g = ctx.createLinearGradient(0, height, 0, 0);
    g.addColorStop(
      0,
      `rgb(${Math.max(3, dark[0] - 4)} ${Math.max(5, dark[1] - 2)} ${Math.max(8, dark[2])})`,
    );
    g.addColorStop(0.56, `rgb(${mid[0]} ${mid[1]} ${mid[2]})`);
    g.addColorStop(
      1,
      `rgb(${Math.min(255, c[0] * 0.62)} ${Math.min(255, c[1] * 0.62)} ${Math.min(255, c[2] * 0.62)})`,
    );
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
    softHalo(
      width * (0.44 + 0.1 * Math.sin(time * 0.05)),
      height * (0.74 - progress * 0.46),
      Math.max(width, height) * 0.72,
      c,
      0.105 + progress * 0.05,
    );
    for (const p of particles) {
      const x =
          fract(p.x + time * 0.0018 * p.speed) * width +
          Math.sin(time * 0.19 + p.phase) * 4,
        y =
          fract(p.y - time * 0.0011 * p.speed) * height +
          Math.cos(time * 0.15 + p.phase) * 4,
        col =
          p.kind % 3 === 0
            ? c
            : p.kind % 3 === 1
              ? [255, 244, 215]
              : [132, 226, 255];
      circle(
        x,
        y,
        p.r * (0.72 + progress * 0.38),
        rgba(
          col,
          0.07 + 0.15 * (0.5 + 0.5 * Math.sin(time * p.speed + p.phase)),
        ),
      );
    }
    for (let k = 1; k < 8; k++)
      line(
        (k / 8) * width,
        0,
        (k / 8) * width,
        height,
        "rgba(255,255,255,.016)",
      );
  }

  function drawPlanet(cx, cy, r, z, time, land = true) {
    softHalo(cx, cy, r * 2.2, z.color, 0.18);
    const g = ctx.createRadialGradient(
      cx - r * 0.32,
      cy - r * 0.38,
      r * 0.03,
      cx,
      cy,
      r,
    );
    g.addColorStop(0, "rgba(225,250,255,.98)");
    g.addColorStop(0.38, rgba(z.color, 0.78));
    g.addColorStop(1, "rgba(7,20,55,.98)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.clip();
    if (land) {
      ctx.fillStyle = "rgba(105,207,145,.58)";
      for (let i = 0; i < 10; i++) {
        const a = seeded(i + 310) * TAU,
          rr = seeded(i + 340) * r * 0.72;
        ctx.beginPath();
        ctx.ellipse(
          cx + Math.cos(a) * rr,
          cy + Math.sin(a) * rr * 0.78,
          r * (0.055 + seeded(i + 370) * 0.14),
          r * (0.026 + seeded(i + 390) * 0.07),
          a,
          0,
          TAU,
        );
        ctx.fill();
      }
    }
    ctx.strokeStyle = "rgba(255,255,255,.13)";
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.ellipse(
        cx,
        cy,
        r * (0.35 + i * 0.11),
        r * (0.12 + i * 0.035),
        time * 0.006 + i * 0.27,
        0,
        TAU,
      );
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = "rgba(215,245,255,.55)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.stroke();
  }
  function drawStar(cx, cy, r, color, time) {
    softHalo(cx, cy, r * 3, color, 0.2);
    const g = ctx.createRadialGradient(
      cx - r * 0.25,
      cy - r * 0.3,
      0,
      cx,
      cy,
      r,
    );
    g.addColorStop(0, "rgba(255,255,240,1)");
    g.addColorStop(0.38, rgba(color, 0.96));
    g.addColorStop(1, rgba([255, 128, 70], 0.48));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r * (1 + 0.025 * Math.sin(time * 1.8)), 0, TAU);
    ctx.fill();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + time * 0.025,
        lineR = r * (1.25 + (i % 3) * 0.2);
      line(
        cx + Math.cos(a) * r * 1.05,
        cy + Math.sin(a) * r * 1.05,
        cx + Math.cos(a) * lineR,
        cy + Math.sin(a) * lineR,
        rgba(color, 0.22),
        1.3,
      );
    }
  }
  function drawSatellite(x, y, s, z, angle = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = "rgba(220,235,245,.68)";
    roundedRectPath(-s * 0.12, -s * 0.08, s * 0.24, s * 0.16, s * 0.035);
    ctx.fill();
    ctx.strokeStyle = rgba(z.color, 0.7);
    ctx.stroke();
    ctx.fillStyle = rgba(z.color, 0.28);
    ctx.fillRect(-s * 0.42, -s * 0.07, s * 0.25, s * 0.14);
    ctx.fillRect(s * 0.17, -s * 0.07, s * 0.25, s * 0.14);
    line(0, -s * 0.08, 0, -s * 0.22, "rgba(255,255,255,.52)", 1.5);
    circle(0, -s * 0.25, s * 0.025, rgba(z.color, 0.78));
    ctx.restore();
  }
  function drawHabitat(x, y, s, z, domes = 3) {
    line(x - s * 0.42, y, x + s * 0.42, y, rgba(z.color, 0.35), 3);
    for (let i = 0; i < domes; i++) {
      const dx = (i - (domes - 1) / 2) * s * 0.27,
        r = s * (0.095 + (i % 2) * 0.018);
      ctx.fillStyle = rgba(z.color, 0.12);
      ctx.strokeStyle = rgba(z.color, 0.65);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(x + dx, y, r, Math.PI, TAU);
      ctx.lineTo(x + dx + r, y);
      ctx.lineTo(x + dx - r, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      for (let k = -1; k <= 1; k++)
        circle(
          x + dx + k * r * 0.38,
          y - r * 0.42,
          1.4,
          "rgba(255,235,160,.62)",
        );
    }
  }
  function drawNetwork(cx, cy, r, z, time, count = 18) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU + seeded(i + 900) * 0.5,
        rr = r * (0.36 + seeded(i + 930) * 0.64),
        x = cx + Math.cos(a) * rr,
        y = cy + Math.sin(a) * rr * 0.72;
      nodes[i]._x = x;
      nodes[i]._y = y;
      circle(x, y, 2 + (i % 3), rgba(i % 4 ? z.color : [255, 240, 180], 0.68));
    }
    for (let i = 0; i < count * 2; i++) {
      const a = nodes[i % count],
        b = nodes[(i * 7 + 3) % count];
      line(a._x, a._y, b._x, b._y, rgba(z.color, 0.075 + (i % 4) * 0.018), 1);
      const p = fract(time * (0.07 + (i % 3) * 0.012) + i * 0.053);
      circle(
        mix(a._x, b._x, p),
        mix(a._y, b._y, p),
        1.3,
        rgba([255, 250, 220], 0.5),
      );
    }
  }
  function drawBranching(
    originX,
    originY,
    targetY,
    z,
    time,
    branches = 9,
    spread = 0.82,
  ) {
    for (let i = 0; i < branches; i++) {
      const ex = width * ((1 - spread) / 2 + (i / (branches - 1)) * spread),
        cx =
          originX + (ex - originX) * 0.36 + Math.sin(i * 2.1) * width * 0.035;
      ctx.strokeStyle = rgba(
        i % 3 === 0 ? [255, 170, 190] : i % 3 === 1 ? z.color : [140, 255, 176],
        0.2 + i * 0.012,
      );
      ctx.lineWidth = 1.7 + (i % 3);
      ctx.beginPath();
      ctx.moveTo(originX, originY);
      ctx.bezierCurveTo(
        cx,
        mix(originY, targetY, 0.32),
        cx,
        mix(originY, targetY, 0.7),
        ex,
        targetY,
      );
      ctx.stroke();
      const p = fract(time * (0.045 + i * 0.004) + i * 0.09),
        u = 1 - p,
        x =
          u * u * u * originX +
          3 * u * u * p * cx +
          3 * u * p * p * cx +
          p * p * p * ex,
        y =
          u * u * u * originY +
          3 * u * u * p * mix(originY, targetY, 0.32) +
          3 * u * p * p * mix(originY, targetY, 0.7) +
          p * p * p * targetY;
      circle(x, y, 2 + (i % 2), rgba([255, 250, 225], 0.54));
      circle(
        ex,
        targetY,
        3 + (i % 3),
        rgba(i % 2 ? z.color : [255, 184, 130], 0.46),
      );
    }
  }
  function drawRiskSymbol(x, y, r, z, type) {
    ctx.strokeStyle = rgba(z.color, 0.75);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.stroke();
    ctx.font = `900 ${r * 0.95}px system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = rgba(z.color, 0.8);
    ctx.fillText(type, x, y + r * 0.05);
    ctx.textBaseline = "alphabetic";
  }

  function drawOrbitalRing(
    cx,
    cy,
    rx,
    ry,
    angle,
    color,
    alpha = 0.35,
    lw = 1.2,
  ) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.strokeStyle = rgba(color, alpha);
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
  function drawMolecule(cx, cy, r, z, time, count = 7) {
    const pts = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU + time * 0.025,
        rr = r * (0.45 + seeded(i + 61) * 0.5);
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.7]);
    }
    for (let i = 0; i < count; i++) {
      const a = pts[i],
        b = pts[(i * 3 + 2) % count];
      line(a[0], a[1], b[0], b[1], rgba(z.color, 0.18), 1.6);
    }
    pts.forEach((p, i) => {
      softHalo(p[0], p[1], r * 0.18, i % 3 ? z.color : [255, 215, 130], 0.09);
      circle(
        p[0],
        p[1],
        r * (0.035 + (i % 3) * 0.012),
        rgba(i % 3 ? z.color : [255, 225, 155], 0.68),
        rgba([255, 255, 255], 0.5),
        1,
      );
    });
  }
  function drawCell(cx, cy, r, z, time, kind = 0) {
    softHalo(cx, cy, r * 1.8, z.color, 0.16);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(time * 0.015 + kind);
    ctx.fillStyle = rgba(z.color, 0.16);
    ctx.strokeStyle = rgba(z.color, 0.72);
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * TAU,
        rr = r * (1 + 0.055 * Math.sin(a * (3 + (kind % 4)) + time * 0.7));
      const x = Math.cos(a) * rr,
        y = Math.sin(a) * rr * 0.82;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    circle(
      0,
      0,
      r * 0.27,
      "rgba(10,30,42,.7)",
      rgba([255, 245, 185], 0.55),
      1.4,
    );
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + time * 0.03,
        rr = r * (0.4 + seeded(i + 201) * 0.3);
      circle(
        Math.cos(a) * rr,
        Math.sin(a) * rr * 0.75,
        r * (0.025 + (i % 3) * 0.01),
        rgba(i % 2 ? z.color : [255, 190, 130], 0.52),
      );
    }
    ctx.restore();
  }
  function drawSpectrum(x, y, w, h, z, time, peaks = 8) {
    line(x, y + h, x + w, y + h, "rgba(255,255,255,.32)", 1);
    for (let i = 0; i < peaks; i++) {
      const px = x + w * (0.07 + (i / (peaks - 1)) * 0.86),
        ph = h * (0.2 + seeded(i + 300) * 0.72);
      line(
        px,
        y + h,
        px,
        y + h - ph,
        rgba(i % 3 ? z.color : [255, 210, 120], 0.62),
        1.5 + (i % 2),
      );
      softHalo(px, y + h - ph, w * 0.035, z.color, 0.07);
    }
    ctx.strokeStyle = rgba([255, 255, 255], 0.2);
    ctx.beginPath();
    for (let i = 0; i <= 60; i++) {
      const u = i / 60,
        yy =
          y +
          h * 0.65 -
          Math.sin(u * TAU * 2 + time * 0.2) * h * 0.05 -
          (0.5 + 0.5 * Math.sin(u * TAU * 7 + time * 0.1)) * h * 0.12;
      i ? ctx.lineTo(x + u * w, yy) : ctx.moveTo(x + u * w, yy);
    }
    ctx.stroke();
  }
  function drawSignal(cx, cy, r, z, time, rings = 7) {
    for (let i = 0; i < rings; i++) {
      const p = fract(time * 0.14 + i / rings),
        rr = r * (0.12 + p),
        ctxAlpha = (1 - p) * 0.38;
      ctx.strokeStyle = rgba(z.color, ctxAlpha);
      ctx.lineWidth = 1.1 + (i % 2);
      ctx.beginPath();
      ctx.arc(cx, cy, rr, 0, TAU);
      ctx.stroke();
    }
    circle(cx, cy, r * 0.035, rgba([255, 245, 200], 0.8));
  }
  function drawIceMoon(cx, cy, r, z, time) {
    drawPlanet(cx, cy, r, { color: [175, 225, 255] }, time, false);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.clip();
    ctx.strokeStyle = "rgba(255,255,255,.5)";
    for (let i = 0; i < 15; i++) {
      const y = cy - r + i * r * 0.14;
      ctx.beginPath();
      ctx.moveTo(cx - r, y);
      for (let x = cx - r; x <= cx + r; x += r * 0.12)
        ctx.lineTo(x, y + Math.sin(x * 0.05 + i) * r * 0.025);
      ctx.stroke();
    }
    ctx.restore();
  }
  function drawAbstractBody(cx, cy, r, z, time, mode) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(time * 0.012 + mode * 0.4);
    ctx.strokeStyle = rgba(z.color, 0.62);
    ctx.fillStyle = rgba(z.color, 0.12);
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    const n = 5 + (mode % 5);
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU,
        rr = r * (0.65 + 0.32 * Math.sin(a * (2 + (mode % 4)) + mode));
      const x = Math.cos(a) * rr,
        y = Math.sin(a) * rr;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + time * 0.02,
        rr = r * 0.48;
      circle(
        Math.cos(a) * rr,
        Math.sin(a) * rr,
        r * 0.045,
        rgba(i % 2 ? z.color : [255, 230, 160], 0.58),
      );
    }
    ctx.restore();
  }
  function footerLabel(text, z) {
    const alpha = footerLabel.alpha || 0;
    if (!footerLabel.pending || alpha >= footerLabel.pending.alpha)
      footerLabel.pending = { text, z, alpha };
  }
  function paintFooter() {
    const item = footerLabel.pending;
    if (!item) return;
    const s = Math.min(width, height);
    ctx.font = `900 ${s * 0.023}px system-ui`;
    ctx.textAlign = "center";
    ctx.fillStyle = `rgba(255,255,255,${0.57 * clamp(item.alpha * 1.5, 0, 1)})`;
    ctx.fillText(item.text, width * 0.5, height * 0.86);
  }

  function drawWaveform(x, y, w, h, z, time, mode = 0) {
    ctx.save();
    ctx.strokeStyle = rgba(z.color, 0.62);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i <= 100; i++) {
      const u = i / 100;
      let v =
        Math.sin(u * TAU * (3 + mode) + time * 0.7) * 0.18 +
        Math.sin(u * TAU * (11 + mode * 2) - time * 0.22) * 0.07;
      if (mode === 2) v += Math.floor(u * 18) % 2 ? -0.16 : 0.16;
      if (mode === 3) v *= 0.35 + 0.65 * (Math.floor(u * 12) % 3 === 0);
      const px = x + u * w,
        py = y + h * 0.5 - v * h;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.stroke();
    line(x, y + h, x + w, y + h, "rgba(255,255,255,.16)", 1);
    ctx.restore();
  }
  function drawDish(x, y, s, z, angle = 0, active = true) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.strokeStyle = rgba(z.color, active ? 0.72 : 0.25);
    ctx.fillStyle = rgba(z.color, active ? 0.12 : 0.04);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.34, 0.16 * Math.PI, 0.84 * Math.PI);
    ctx.lineTo(0, s * 0.03);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    line(0, s * 0.03, 0, s * 0.34, rgba(z.color, 0.55), 2);
    line(-s * 0.17, s * 0.34, s * 0.17, s * 0.34, rgba(z.color, 0.4), 2);
    circle(0, 0, s * 0.025, rgba([255, 245, 200], 0.8));
    ctx.restore();
  }
  function drawPacket(x, y, s, z, label, alpha = 0.8) {
    softHalo(x, y, s * 1.25, z.color, 0.08 * alpha);
    ctx.fillStyle = rgba(z.color, 0.12 * alpha);
    ctx.strokeStyle = rgba(z.color, 0.62 * alpha);
    ctx.lineWidth = 1.2;
    roundedRectPath(x - s * 0.55, y - s * 0.25, s * 1.1, s * 0.5, s * 0.12);
    ctx.fill();
    ctx.stroke();
    ctx.font = `900 ${Math.max(8, s * 0.19)}px system-ui`;
    ctx.textAlign = "center";
    ctx.fillStyle = `rgba(255,255,255,${0.72 * alpha})`;
    ctx.fillText(label, x, y + s * 0.065);
  }
  function drawGlyphField(x, y, w, h, z, time, variant = 0) {
    const chars = ["01", "λ", "Σ", "△", "○", "↔", "⊕", "⋮", "?", "∞", "⌁", "✦"];
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    for (let i = 0; i < 36; i++) {
      const col = i % 6,
        row = Math.floor(i / 6),
        px = x + ((col + 0.5) * w) / 6,
        py = y + ((row + 0.5) * h) / 6;
      ctx.font = `800 ${Math.max(10, Math.min(w, h) * (0.075 + (i % 3) * 0.015))}px system-ui`;
      ctx.textAlign = "center";
      ctx.fillStyle = rgba(
        i % 4 ? z.color : [255, 235, 180],
        0.25 + 0.28 * (0.5 + 0.5 * Math.sin(time * 0.4 + i)),
      );
      ctx.fillText(chars[(i * 3 + variant) % chars.length], px, py);
    }
    ctx.restore();
  }
  function drawChoiceBranches(z, time, labels) {
    const s = Math.min(width, height),
      selected = Math.min(
        labels.length - 1,
        Math.floor(pointerX * labels.length),
      );
    for (let i = 0; i < labels.length; i++) {
      const x = width * (0.08 + ((i + 0.5) * 0.84) / labels.length),
        chosen = i === selected;
      ctx.strokeStyle = rgba(
        chosen ? [255, 245, 195] : z.color,
        chosen ? 0.72 : 0.18,
      );
      ctx.lineWidth = chosen ? 3 : 1.2;
      ctx.beginPath();
      ctx.moveTo(width * 0.5, height * 0.72);
      ctx.quadraticCurveTo(x, height * 0.48, x, height * 0.27);
      ctx.stroke();
      circle(
        x,
        height * 0.25,
        s * (chosen ? 0.026 : 0.018),
        rgba(chosen ? [255, 245, 195] : z.color, chosen ? 0.65 : 0.27),
      );
      ctx.font = `900 ${Math.max(8, s * 0.014)}px system-ui`;
      ctx.textAlign = "center";
      ctx.fillStyle = `rgba(255,255,255,${chosen ? 0.8 : 0.35})`;
      ctx.fillText(labels[i], x, height * 0.19);
    }
    circle(width * 0.5, height * 0.74, s * 0.025, rgba(z.color, 0.72));
  }
  function drawCivilization(cx, cy, r, z, time, variant = 0) {
    softHalo(cx, cy, r * 2, z.color, 0.13);
    if (variant % 3 === 0) {
      drawNetwork(cx, cy, r, z, time, 14);
    } else if (variant % 3 === 1) {
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * TAU + time * 0.015,
          rr = r * (0.35 + (i % 3) * 0.22);
        circle(
          cx + Math.cos(a) * rr,
          cy + Math.sin(a) * rr * 0.72,
          r * 0.055,
          rgba(i % 2 ? z.color : [255, 225, 160], 0.55),
        );
        line(
          cx,
          cy,
          cx + Math.cos(a) * rr,
          cy + Math.sin(a) * rr * 0.72,
          rgba(z.color, 0.13),
          1,
        );
      }
      circle(cx, cy, r * 0.13, rgba(z.color, 0.45));
    } else {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + time * 0.01,
          rr = r * 0.62;
        polygon(
          [
            [cx + Math.cos(a) * rr - r * 0.09, cy + Math.sin(a) * rr * 0.65],
            [cx + Math.cos(a) * rr + r * 0.09, cy + Math.sin(a) * rr * 0.65],
            [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.65 - r * 0.16],
          ],
          rgba(z.color, 0.14),
          rgba(z.color, 0.55),
          1.2,
        );
      }
    }
  }

  function selectedFrame(labels) {
    return Math.min(labels.length - 1, Math.floor(pointerX * labels.length));
  }
  function labelAt(text, x, y, size, color = "rgba(255,255,255,.55)") {
    ctx.font = `900 ${Math.max(8, size)}px system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.textBaseline = "alphabetic";
  }
  function drawLensPanel(x, y, w, h, z, label, active, variant, time) {
    ctx.fillStyle = rgba(z.color, active ? 0.12 : 0.035);
    ctx.strokeStyle = rgba(
      active ? [255, 248, 215] : z.color,
      active ? 0.72 : 0.2,
    );
    ctx.lineWidth = active ? 2.2 : 1;
    roundedRectPath(x, y, w, h, Math.min(w, h) * 0.12);
    ctx.fill();
    ctx.stroke();
    const cx = x + w * 0.5,
      cy = y + h * 0.48,
      r = Math.min(w, h) * 0.2;
    if (variant === 0) drawStar(cx, cy, r, [255, 218, 130], time);
    else if (variant === 1) {
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * TAU;
        drawOrbitalRing(
          cx,
          cy,
          r * (0.45 + i * 0.07),
          r * (0.18 + i * 0.03),
          a * 0.18,
          z.color,
          0.15 + i * 0.018,
          1,
        );
      }
    } else if (variant === 2) {
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * TAU + time * 0.01,
          rr = r * (0.35 + (i % 6) * 0.12);
        circle(
          cx + Math.cos(a) * rr,
          cy + Math.sin(a) * rr * 0.7,
          1.3 + (i % 3),
          rgba(i % 4 ? z.color : [255, 235, 175], 0.55),
        );
      }
    } else if (variant === 3) {
      drawWaveform(x + w * 0.14, y + h * 0.27, w * 0.72, h * 0.42, z, time, 2);
    } else if (variant === 4) {
      drawGlyphField(
        x + w * 0.08,
        y + h * 0.16,
        w * 0.84,
        h * 0.58,
        z,
        time,
        variant,
      );
    } else {
      drawNetwork(cx, cy, r * 1.15, z, time, 15);
    }
    labelAt(
      label,
      cx,
      y + h * 0.84,
      Math.min(w, h) * 0.075,
      `rgba(255,255,255,${active ? 0.85 : 0.42})`,
    );
  }

  function sceneAnotherPerspective(z, time) {
    const s = Math.min(width, height),
      labels = ["LUZ", "CAMPO", "PROB.", "QUÍMICA", "MEMORIA", "RED"],
      sel = selectedFrame(labels);
    drawPacket(
      width * 0.5,
      height * 0.78,
      s * 0.13,
      z,
      "MENSAJE RECIBIDO",
      0.78,
    );
    for (let i = 0; i < 6; i++) {
      const x = width * (0.09 + i * 0.164),
        y = height * (0.25 + 0.05 * (i % 2));
      ctx.setLineDash([4, 8]);
      line(
        width * 0.5,
        height * 0.7,
        x,
        y + height * 0.08,
        rgba(z.color, i === sel ? 0.48 : 0.12),
        i === sel ? 2.4 : 1,
      );
      ctx.setLineDash([]);
      drawLensPanel(
        x - width * 0.065,
        y - height * 0.07,
        width * 0.13,
        height * 0.23,
        z,
        labels[i],
        i === sel,
        i,
        time,
      );
    }
    footerLabel("EL MENSAJE SE ABRE EN VARIAS FORMAS DE REALIDAD", z);
  }
  function sceneHumanPerspective(z, time) {
    const labels = ["OBJETO", "ESPACIO", "TIEMPO", "CAUSA", "YO", "MENTE"],
      sel = selectedFrame(labels),
      s = Math.min(width, height);
    drawPlanet(width * 0.5, height * 0.5, s * 0.16, z, time, true);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU - Math.PI / 2,
        x = width * 0.5 + Math.cos(a) * s * 0.31,
        y = height * 0.5 + Math.sin(a) * s * 0.25;
      drawPacket(
        x,
        y,
        s * (i === sel ? 0.085 : 0.065),
        z,
        labels[i],
        i === sel ? 0.95 : 0.42,
      );
      line(
        width * 0.5,
        height * 0.5,
        x,
        y,
        rgba(z.color, i === sel ? 0.35 : 0.08),
        i === sel ? 2 : 1,
      );
    }
    footerLabel("LO EVIDENTE TAMBIÉN TIENE HISTORIA BIOLÓGICA", z);
  }
  function sceneTerrestrialSenses(z, time) {
    const labels = [
        "VISIBLE",
        "SONIDO",
        "QUÍMICA",
        "TACTO",
        "EQUILIBRIO",
        "DURACIÓN",
      ],
      sel = selectedFrame(labels),
      s = Math.min(width, height);
    const y = height * 0.56;
    ctx.fillStyle = "rgba(255,255,255,.055)";
    ctx.fillRect(width * 0.08, y - s * 0.025, width * 0.84, s * 0.05);
    const bands = [
      [0.08, 0.2, [105, 80, 255]],
      [0.2, 0.34, [70, 190, 255]],
      [0.34, 0.52, [90, 245, 170]],
      [0.52, 0.68, [255, 225, 85]],
      [0.68, 0.82, [255, 120, 80]],
      [0.82, 0.92, [235, 90, 210]],
    ];
    bands.forEach((b, i) => {
      ctx.fillStyle = rgba(b[2], i === sel ? 0.72 : 0.22);
      ctx.fillRect(
        width * b[0],
        y - s * (i === sel ? 0.04 : 0.025),
        width * (b[1] - b[0]),
        s * (i === sel ? 0.08 : 0.05),
      );
    });
    drawAbstractBody(width * 0.5, height * 0.3, s * 0.11, z, time, sel);
    drawPacket(width * 0.5, height * 0.77, s * 0.12, z, labels[sel], 0.9);
    footerLabel("LOS SENTIDOS MUESTREAN · NO COPIAN EL UNIVERSO", z);
  }
  function sceneBrainPerception(z, time) {
    const labels = [
        "ATENCIÓN",
        "PREDICCIÓN",
        "CONSTANCIA",
        "MEMORIA",
        "ACCIÓN",
        "ILUSIÓN",
      ],
      sel = selectedFrame(labels),
      s = Math.min(width, height),
      cx = width * 0.5,
      cy = height * 0.53;
    for (let i = 0; i < 6; i++) {
      const y = height * (0.18 + i * 0.095),
        x = width * 0.14;
      drawPacket(x, y, s * 0.065, z, labels[i], i === sel ? 0.9 : 0.32);
      ctx.strokeStyle = rgba(z.color, i === sel ? 0.48 : 0.08);
      ctx.lineWidth = i === sel ? 3 : 1;
      ctx.beginPath();
      ctx.moveTo(x + s * 0.045, y);
      ctx.bezierCurveTo(width * 0.34, y, width * 0.36, cy, cx - s * 0.1, cy);
      ctx.stroke();
    }
    drawNetwork(cx, cy, s * 0.16, z, time, 20);
    drawPacket(width * 0.78, cy, s * 0.11, z, "MODELO", 0.82);
    line(cx + s * 0.1, cy, width * 0.7, cy, rgba([255, 245, 200], 0.35), 2);
    footerLabel("PERCIBIR = DATOS + MODELO + CORRECCIÓN", z);
  }
  function sceneLanguage(z, time) {
    const labels = [
        "NOMBRES",
        "VERBOS",
        "TIEMPO",
        "METÁFORA",
        "CONTEXTO",
        "NUEVO",
      ],
      sel = selectedFrame(labels),
      s = Math.min(width, height);
    drawGlyphField(
      width * 0.08,
      height * 0.18,
      width * 0.84,
      height * 0.44,
      z,
      time,
      sel,
    );
    for (let i = 0; i < 6; i++) {
      const x = width * (0.1 + i * 0.16);
      drawPacket(
        x,
        height * 0.72,
        s * 0.064,
        z,
        labels[i],
        i === sel ? 0.9 : 0.35,
      );
    }
    ctx.strokeStyle = rgba([255, 245, 200], 0.28);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(width * 0.1, height * 0.62);
    for (let i = 1; i <= 50; i++) {
      const u = i / 50;
      ctx.lineTo(
        width * (0.1 + 0.8 * u),
        height * 0.62 - Math.sin(u * TAU * (2 + sel)) * s * 0.015,
      );
    }
    ctx.stroke();
    footerLabel("NOMBRAR ESTABILIZA UNA MANERA DE DIVIDIR", z);
  }
  function sceneCulture(z, time) {
    const labels = [
        "RELATO",
        "VALOR",
        "INSTIT.",
        "TÉCNICA",
        "HISTORIA",
        "PLURAL",
      ],
      sel = selectedFrame(labels),
      s = Math.min(width, height);
    drawStar(width * 0.5, height * 0.43, s * 0.055, [255, 220, 130], time);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + time * 0.004,
        x = width * 0.5 + Math.cos(a) * s * 0.29,
        y = height * 0.46 + Math.sin(a) * s * 0.2;
      drawCivilization(
        x,
        y,
        s * (i === sel ? 0.09 : 0.065),
        z,
        time + i,
        i % 3,
      );
      drawPacket(
        x,
        y + s * 0.105,
        s * 0.055,
        z,
        labels[i],
        i === sel ? 0.82 : 0.3,
      );
    }
    footerLabel("UNA MISMA ESTRELLA ENTRA EN HISTORIAS DISTINTAS", z);
  }
  function sceneScientificModels(z, time) {
    const labels = [
        "MEDIR",
        "IDEALIZAR",
        "PREDECIR",
        "ESCALA",
        "ERROR",
        "REVISAR",
      ],
      sel = selectedFrame(labels),
      s = Math.min(width, height);
    drawStar(width * 0.5, height * 0.38, s * 0.065, [255, 220, 135], time);
    for (let i = 0; i < 6; i++) {
      const x = width * (0.08 + i * 0.168),
        y = height * (0.64 + 0.035 * (i % 2));
      ctx.setLineDash([4, 8]);
      line(
        width * 0.5,
        height * 0.43,
        x,
        y - s * 0.04,
        rgba(z.color, i === sel ? 0.48 : 0.1),
        i === sel ? 2.2 : 1,
      );
      ctx.setLineDash([]);
      drawPacket(x, y, s * 0.07, z, labels[i], i === sel ? 0.92 : 0.33);
    }
    for (let i = 0; i < 4; i++)
      drawOrbitalRing(
        width * 0.5,
        height * 0.38,
        s * (0.11 + i * 0.03),
        s * (0.035 + i * 0.011),
        i * 0.35,
        z.color,
        0.12 + i * 0.07,
        1 + i * 0.3,
      );
    footerLabel("MODELOS DISTINTOS · CONSECUENCIAS COMPARABLES", z);
  }
  function sceneCognitiveLimits(z, time) {
    const labels = [
        "MEMORIA",
        "ATENCIÓN",
        "DIMENSIÓN",
        "SESGO",
        "INSTRUM.",
        "LÍMITE",
      ],
      sel = selectedFrame(labels),
      s = Math.min(width, height);
    drawNetwork(width * 0.5, height * 0.48, s * 0.25, z, time, 26);
    ctx.fillStyle = "rgba(0,0,0,.58)";
    if (sel === 0)
      ctx.fillRect(width * 0.08, height * 0.15, width * 0.84, height * 0.18);
    if (sel === 1) {
      ctx.fillRect(0, 0, width * 0.38, height);
      ctx.fillRect(width * 0.62, 0, width * 0.38, height);
    }
    if (sel === 2)
      for (let i = 0; i < 8; i++)
        line(
          width * 0.1,
          height * (0.2 + i * 0.07),
          width * 0.9,
          height * (0.2 + ((i * 3) % 8) * 0.07),
          rgba(z.color, 0.12),
          1,
        );
    if (sel === 3)
      softHalo(width * 0.35, height * 0.42, s * 0.18, [255, 150, 120], 0.18);
    if (sel === 4)
      drawDish(width * 0.75, height * 0.62, s * 0.2, z, -0.45, true);
    if (sel === 5) {
      ctx.strokeStyle = rgba([255, 245, 200], 0.35);
      ctx.strokeRect(width * 0.22, height * 0.25, width * 0.56, height * 0.43);
      labelAt(
        "?",
        width * 0.5,
        height * 0.47,
        s * 0.2,
        "rgba(255,255,255,.12)",
      );
    }
    drawPacket(width * 0.5, height * 0.79, s * 0.12, z, labels[sel], 0.85);
    footerLabel("TODA INTELIGENCIA SELECCIONA Y COMPRIME", z);
  }
  function sceneAlienPerspective(z, time) {
    const labels = [
        "OCÉANO",
        "BLOQUEADO",
        "ATMÓSFERA",
        "SUBSUELO",
        "BINARIA",
        "COLMENA",
      ],
      sel = selectedFrame(labels),
      s = Math.min(width, height);
    drawPlanet(
      width * 0.5,
      height * 0.48,
      s * 0.2,
      z,
      time,
      sel !== 0 && sel !== 3,
    );
    if (sel === 0) {
      for (let i = 0; i < 12; i++)
        drawOrbitalRing(
          width * 0.5,
          height * 0.49,
          s * (0.08 + i * 0.012),
          s * (0.025 + i * 0.005),
          time * 0.01 + i * 0.18,
          [90, 220, 255],
          0.18,
          1,
        );
    }
    if (sel === 1) {
      ctx.fillStyle = "rgba(0,0,0,.48)";
      ctx.fillRect(width * 0.5, height * 0.26, s * 0.22, height * 0.44);
    }
    if (sel === 2)
      for (let i = 0; i < 9; i++)
        circle(
          width * 0.3 + seeded(i) * width * 0.4,
          height * 0.25 + seeded(i + 33) * height * 0.45,
          s * 0.012,
          rgba(z.color, 0.35),
        );
    if (sel === 3) {
      ctx.fillStyle = "rgba(0,0,0,.62)";
      ctx.fillRect(width * 0.22, height * 0.15, width * 0.56, height * 0.22);
      for (let i = 0; i < 9; i++)
        line(
          width * 0.3 + i * s * 0.04,
          height * 0.7,
          width * 0.34 + i * s * 0.03,
          height * 0.34,
          rgba(z.color, 0.18),
          1,
        );
    }
    if (sel === 4) {
      drawStar(width * 0.27, height * 0.26, s * 0.045, [255, 190, 110], time);
      drawStar(width * 0.73, height * 0.24, s * 0.035, [160, 210, 255], time);
    }
    if (sel === 5)
      drawNetwork(width * 0.5, height * 0.48, s * 0.17, z, time, 25);
    drawPacket(width * 0.5, height * 0.79, s * 0.12, z, labels[sel], 0.88);
    footerLabel("OTRO MUNDO CAMBIA QUÉ RESULTA PRIMARIO", z);
  }
  function sceneUnknownSenses(z, time) {
    const labels = [
        "MAGNETISMO",
        "POLARIZ.",
        "ELÉCTRICO",
        "QUÍMICO",
        "RADIO",
        "GRAVEDAD",
      ],
      sel = selectedFrame(labels),
      s = Math.min(width, height),
      cx = width * 0.5,
      cy = height * 0.46;
    drawPlanet(cx, cy, s * 0.13, z, time, true);
    if (sel === 0)
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * TAU;
        ctx.strokeStyle = rgba(z.color, 0.18 + i * 0.015);
        ctx.beginPath();
        ctx.ellipse(
          cx,
          cy,
          s * (0.16 + i * 0.009),
          s * (0.05 + i * 0.004),
          a * 0.1,
          0,
          TAU,
        );
        ctx.stroke();
      }
    if (sel === 1)
      for (let i = 0; i < 30; i++) {
        const a = (i / 30) * TAU;
        line(
          cx,
          cy,
          cx + Math.cos(a) * s * 0.32,
          cy + Math.sin(a) * s * 0.24,
          rgba(i % 2 ? z.color : [255, 220, 150], 0.08 + i * 0.006),
          1,
        );
      }
    if (sel === 2)
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU + time * 0.03;
        drawSignal(
          cx + Math.cos(a) * s * 0.22,
          cy + Math.sin(a) * s * 0.15,
          s * 0.025,
          z,
          time + i,
          3,
        );
      }
    if (sel === 3)
      for (let i = 0; i < 70; i++) {
        const x = seeded(i + 4) * width,
          y = seeded(i + 84) * height;
        circle(
          x,
          y,
          1 + seeded(i + 8) * 3,
          rgba(
            i % 3 ? z.color : [255, 210, 145],
            0.05 + 0.25 * (1 - Math.abs(x - cx) / width),
          ),
        );
      }
    if (sel === 4)
      drawWaveform(
        width * 0.12,
        height * 0.24,
        width * 0.76,
        height * 0.42,
        z,
        time,
        3,
      );
    if (sel === 5)
      for (let i = 0; i < 9; i++)
        drawOrbitalRing(
          cx,
          cy,
          s * (0.16 + i * 0.022),
          s * (0.16 + i * 0.022),
          0,
          z.color,
          0.08 + i * 0.025,
          1,
        );
    drawPacket(cx, height * 0.79, s * 0.13, z, labels[sel], 0.9);
    footerLabel("LO INSTRUMENTAL PARA NOSOTROS PUEDE SER SENSACIÓN", z);
  }
  function sceneDifferentTimes(z, time) {
    const labels = [
        "BREVE",
        "MILENARIA",
        "ESTACIONAL",
        "HEREDADA",
        "DIGITAL",
        "SECULAR",
      ],
      sel = selectedFrame(labels),
      s = Math.min(width, height);
    for (let i = 0; i < 6; i++) {
      const y = height * (0.2 + i * 0.095),
        speed = [2.6, 0.12, 0.45, 0.32, 5.2, 0.06][i],
        count = [18, 5, 8, 10, 28, 4][i];
      line(
        width * 0.12,
        y,
        width * 0.88,
        y,
        rgba(z.color, i === sel ? 0.4 : 0.1),
        i === sel ? 2.5 : 1,
      );
      for (let k = 0; k < count; k++) {
        const p = fract(time * speed * 0.04 + k / count);
        circle(
          width * (0.12 + 0.76 * p),
          y,
          1.4 + (i === sel ? 1.8 : 0),
          rgba(i === sel ? [255, 245, 200] : z.color, i === sel ? 0.72 : 0.22),
        );
      }
      labelAt(
        labels[i],
        width * 0.08,
        y,
        s * 0.018,
        `rgba(255,255,255,${i === sel ? 0.8 : 0.3})`,
      );
    }
    drawPacket(
      width * 0.5,
      height * 0.83,
      s * 0.12,
      z,
      "¿QUÉ ES UN ACONTECIMIENTO?",
      0.82,
    );
    footerLabel("LA DURACIÓN CAMBIA EL TAMAÑO DEL PRESENTE", z);
  }
  function sceneOtherIndividuality(z, time) {
    const labels = [
        "UNO",
        "COLONIA",
        "SIMBIOSIS",
        "COPIAS",
        "TEMPORAL",
        "MEMORIA",
      ],
      sel = selectedFrame(labels),
      s = Math.min(width, height),
      cx = width * 0.5,
      cy = height * 0.47;
    if (sel === 0) drawAbstractBody(cx, cy, s * 0.16, z, time, 1);
    if (sel === 1)
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * TAU,
          rr = s * (0.08 + (i % 4) * 0.025);
        circle(
          cx + Math.cos(a) * rr,
          cy + Math.sin(a) * rr * 0.75,
          s * 0.018,
          rgba(z.color, 0.55),
        );
      }
    if (sel === 2) {
      drawAbstractBody(cx - s * 0.07, cy, s * 0.11, z, time, 2);
      drawAbstractBody(
        cx + s * 0.07,
        cy,
        s * 0.11,
        { color: [255, 220, 140] },
        -time,
        4,
      );
    }
    if (sel === 3)
      for (let i = 0; i < 5; i++)
        drawAbstractBody(
          width * (0.25 + i * 0.125),
          cy,
          s * 0.07,
          z,
          time + i,
          i,
        );
    if (sel === 4) {
      for (let i = 0; i < 14; i++) {
        const p = fract(time * 0.08 + i / 14);
        circle(
          cx + Math.cos(p * TAU) * s * 0.18,
          cy + Math.sin(p * TAU * 2) * s * 0.1,
          s * 0.012,
          rgba(z.color, (1 - p) * 0.7),
        );
      }
    }
    if (sel === 5) drawNetwork(cx, cy, s * 0.22, z, time, 30);
    drawPacket(cx, height * 0.79, s * 0.12, z, labels[sel], 0.9);
    footerLabel("¿DÓNDE TERMINA EL INTERLOCUTOR?", z);
  }
  function sceneCollective(z, time) {
    const labels = [
        "ENJAMBRE",
        "SEÑALES",
        "CONSENSO",
        "ESPECIAL.",
        "CONFLICTO",
        "VOZ",
      ],
      sel = selectedFrame(labels),
      s = Math.min(width, height);
    drawNetwork(width * 0.5, height * 0.45, s * 0.28, z, time, 34);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU - time * 0.006,
        x = width * 0.5 + Math.cos(a) * s * 0.32,
        y = height * 0.46 + Math.sin(a) * s * 0.22;
      drawPacket(x, y, s * 0.06, z, labels[i], i === sel ? 0.92 : 0.3);
      line(
        width * 0.5,
        height * 0.45,
        x,
        y,
        rgba(z.color, i === sel ? 0.38 : 0.07),
        i === sel ? 2 : 1,
      );
    }
    drawPacket(width * 0.5, height * 0.78, s * 0.12, z, "DECISIÓN GLOBAL", 0.8);
    footerLabel("NINGÚN NODO NECESITA CONTENER EL TODO", z);
  }
  function sceneArtificial(z, time) {
    const labels = [
        "VELOCIDAD",
        "COPIA",
        "ARCHIVO",
        "OBJETIVO",
        "CUERPO",
        "CAMBIO",
      ],
      sel = selectedFrame(labels),
      s = Math.min(width, height);
    const cols = 10,
      rows = 7;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const x = width * (0.18 + c * 0.071),
          y = height * (0.22 + r * 0.07),
          v =
            0.5 +
            0.5 * Math.sin(time * (sel === 0 ? 2.6 : 0.35) + r * 1.7 + c * 0.8);
        circle(
          x,
          y,
          2 + ((c + r) % 3),
          rgba((c + r) % 4 ? z.color : [255, 235, 170], 0.12 + 0.5 * v),
        );
        if (c < cols - 1)
          line(x, y, x + width * 0.071, y, rgba(z.color, 0.055 + 0.08 * v), 1);
        if (r < rows - 1)
          line(x, y, x, y + height * 0.07, rgba(z.color, 0.04 + 0.07 * v), 1);
      }
    if (sel === 1)
      for (let i = 0; i < 4; i++)
        ctx.strokeRect(
          width * (0.28 + i * 0.04),
          height * (0.3 + i * 0.03),
          width * 0.32,
          height * 0.26,
        );
    if (sel === 2)
      drawPacket(
        width * 0.5,
        height * 0.72,
        s * 0.14,
        z,
        "MEMORIA EXTERNA",
        0.82,
      );
    if (sel === 3) drawChoiceBranches(z, time, ["A", "B", "C", "D", "E", "F"]);
    if (sel === 4)
      for (let i = 0; i < 4; i++)
        drawAbstractBody(
          width * (0.32 + i * 0.12),
          height * 0.72,
          s * 0.045,
          z,
          time,
          i,
        );
    if (sel === 5)
      drawWaveform(
        width * 0.2,
        height * 0.72,
        width * 0.6,
        height * 0.08,
        z,
        time,
        2,
      );
    footerLabel("ARQUITECTURA DISTINTA · PERSPECTIVA TODAVÍA SITUADA", z);
  }
  function scenePlanetary(z, time) {
    const labels = [
        "BIOSFERA",
        "HONGOS",
        "OCÉANO",
        "TÉCNICA",
        "GEO-RITMO",
        "MÚLTIPLE",
      ],
      sel = selectedFrame(labels),
      s = Math.min(width, height),
      cx = width * 0.5,
      cy = height * 0.46;
    drawGlobe(cx, cy, s * 0.19, z, time, true);
    const count = sel === 4 ? 8 : 24;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU + time * (sel === 4 ? 0.002 : 0.012),
        rr = s * (0.23 + (i % 4) * 0.018);
      circle(
        cx + Math.cos(a) * rr,
        cy + Math.sin(a) * rr * 0.65,
        2 + (i % 3),
        rgba(i % 3 ? z.color : [255, 230, 160], 0.3),
      );
    }
    drawPacket(cx, height * 0.79, s * 0.13, z, labels[sel], 0.88);
    footerLabel("UN MUNDO PUEDE SER SISTEMA, HÁBITAT E INTERLOCUTOR", z);
  }
  function sceneDistributed(z, time) {
    const labels = [
        "PLANETAS",
        "ESTELAR",
        "VERSIONES",
        "CONSENSO",
        "FRAGMENTO",
        "PÉRDIDA",
      ],
      sel = selectedFrame(labels),
      s = Math.min(width, height);
    const pts = [];
    for (let i = 0; i < 12; i++) {
      const x = width * (0.1 + seeded(i + 50) * 0.8),
        y = height * (0.18 + seeded(i + 90) * 0.48);
      pts.push([x, y]);
      drawCivilization(x, y, s * 0.045, z, time + i, i % 3);
    }
    for (let i = 0; i < 20; i++) {
      const a = pts[i % pts.length],
        b = pts[(i * 5 + 3) % pts.length];
      ctx.setLineDash([4, 9]);
      line(a[0], a[1], b[0], b[1], rgba(z.color, 0.08 + (i % 4) * 0.025), 1);
      ctx.setLineDash([]);
      const p = fract(time * (sel === 1 ? 0.008 : 0.03) + i * 0.07);
      circle(
        mix(a[0], b[0], p),
        mix(a[1], b[1], p),
        1.5,
        rgba([255, 245, 205], 0.45),
      );
    }
    if (sel === 5) {
      ctx.fillStyle = "rgba(0,0,0,.65)";
      ctx.fillRect(width * 0.58, height * 0.12, width * 0.35, height * 0.56);
    }
    drawPacket(width * 0.5, height * 0.8, s * 0.13, z, labels[sel], 0.9);
    footerLabel("LA UNIDAD SOBREVIVE A DEMORAS Y VERSIONES LOCALES", z);
  }
  function sceneUntranslatable(z, time) {
    const labels = [
        "MULTISENT.",
        "MEMORIA",
        "NO LINEAL",
        "PROBABIL.",
        "PROCESO",
        "LENTO",
      ],
      sel = selectedFrame(labels),
      s = Math.min(width, height);
    drawGlyphField(
      width * 0.1,
      height * 0.14,
      width * 0.8,
      height * 0.46,
      z,
      time,
      sel,
    );
    for (let i = 0; i < 6; i++) {
      const y = height * (0.24 + i * 0.065),
        bend = Math.sin(i * 1.8 + time * 0.2) * height * 0.03;
      ctx.setLineDash([3, 7]);
      line(
        width * 0.15,
        y,
        width * 0.85,
        y + bend,
        rgba(i === sel ? [255, 245, 195] : z.color, i === sel ? 0.45 : 0.1),
        i === sel ? 2 : 1,
      );
      ctx.setLineDash([]);
    }
    drawPacket(
      width * 0.5,
      height * 0.75,
      s * 0.14,
      z,
      "CONSTRUIR CONCEPTO",
      0.85,
    );
    footerLabel("TRADUCIR PUEDE CAMBIAR A QUIEN TRADUCE", z);
  }
  function sceneMultipleMath(z, time) {
    const labels = [
        "NOTACIÓN",
        "GEOMETRÍA",
        "CONTINUO",
        "PROBABIL.",
        "PRUEBA",
        "CLASIFIC.",
      ],
      sel = selectedFrame(labels),
      s = Math.min(width, height),
      cx = width * 0.5,
      cy = height * 0.45;
    if (sel === 0) {
      labelAt("2 · 3 · 5 · 7 · 11", cx, cy, s * 0.08, "rgba(255,255,255,.72)");
      drawGlyphField(
        width * 0.18,
        height * 0.2,
        width * 0.64,
        height * 0.42,
        z,
        time,
        1,
      );
    }
    if (sel === 1)
      for (let i = 0; i < 9; i++)
        drawOrbitalRing(
          cx,
          cy,
          s * (0.06 + i * 0.018),
          s * (0.018 + i * 0.009),
          i * 0.38,
          z.color,
          0.13 + i * 0.035,
          1,
        );
    if (sel === 2)
      drawWaveform(
        width * 0.12,
        height * 0.28,
        width * 0.76,
        height * 0.3,
        z,
        time,
        1,
      );
    if (sel === 3)
      for (let i = 0; i < 70; i++) {
        const x = width * (0.15 + seeded(i) * 0.7),
          y = height * (0.2 + seeded(i + 80) * 0.45);
        circle(
          x,
          y,
          1 + seeded(i + 4) * 3,
          rgba(z.color, 0.08 + 0.55 * seeded(i + 7)),
        );
      }
    if (sel === 4) {
      for (let i = 0; i < 6; i++) {
        drawPacket(
          width * (0.18 + i * 0.13),
          height * (0.25 + (i % 2) * 0.24),
          s * 0.055,
          z,
          String(i + 1),
          0.55,
        );
        if (i)
          line(
            width * (0.18 + (i - 1) * 0.13),
            height * (0.25 + ((i - 1) % 2) * 0.24),
            width * (0.18 + i * 0.13),
            height * (0.25 + (i % 2) * 0.24),
            rgba(z.color, 0.25),
            2,
          );
      }
    }
    if (sel === 5) drawNetwork(cx, cy, s * 0.23, z, time, 24);
    drawPacket(cx, height * 0.78, s * 0.12, z, labels[sel], 0.9);
    footerLabel("MISMAS RELACIONES · ORGANIZACIONES FORMALES DISTINTAS", z);
  }
  function sceneCausality(z, time) {
    const labels = [
        "CADENA",
        "RED",
        "BUCLE",
        "PROBABIL.",
        "NIVELES",
        "AGENCIA",
      ],
      sel = selectedFrame(labels),
      s = Math.min(width, height);
    const pts = [];
    for (let i = 0; i < 7; i++) {
      const x = width * (0.14 + i * 0.12),
        y = height * (0.3 + 0.18 * Math.sin(i * 0.9 + sel));
      pts.push([x, y]);
      drawPacket(
        x,
        y,
        s * 0.055,
        z,
        String.fromCharCode(65 + i),
        0.55 + (i === sel % 7 ? 0.3 : 0),
      );
    }
    if (sel === 0)
      for (let i = 0; i < 6; i++)
        line(...pts[i], ...pts[i + 1], rgba(z.color, 0.45), 2);
    if (sel === 1)
      for (let i = 0; i < 14; i++)
        line(...pts[i % 7], ...pts[(i * 3 + 2) % 7], rgba(z.color, 0.15), 1.4);
    if (sel === 2) {
      for (let i = 0; i < 6; i++)
        line(...pts[i], ...pts[i + 1], rgba(z.color, 0.3), 1.5);
      line(...pts[6], ...pts[1], rgba([255, 225, 160], 0.45), 2.3);
    }
    if (sel === 3)
      for (let i = 0; i < 18; i++) {
        const a = pts[i % 7],
          b = pts[(i + 1) % 7];
        const p = fract(time * 0.08 + i * 0.11);
        circle(
          mix(a[0], b[0], p),
          mix(a[1], b[1], p),
          1.5 + (i % 2),
          rgba(z.color, 0.5 * (1 - p)),
        );
      }
    if (sel === 4)
      for (let i = 0; i < 4; i++) {
        ctx.strokeStyle = rgba(z.color, 0.18 + i * 0.08);
        ctx.strokeRect(
          width * (0.2 + i * 0.05),
          height * (0.2 + i * 0.05),
          width * (0.6 - i * 0.1),
          height * (0.4 - i * 0.1),
        );
      }
    if (sel === 5) {
      drawChoiceBranches(z, time, ["A", "B", "C", "D", "E", "F"]);
    }
    drawPacket(width * 0.5, height * 0.78, s * 0.13, z, labels[sel], 0.88);
    footerLabel("CORRELACIÓN NO BASTA · INTERVENIR Y PREDECIR", z);
  }
  function sceneCosmologies(z, time) {
    const labels = [
        "ESTRELLAS",
        "OCÉANO",
        "CAMPO",
        "MICRO",
        "CÓMPUTO",
        "MENTE",
      ],
      sel = selectedFrame(labels),
      s = Math.min(width, height);
    drawStar(width * 0.5, height * 0.42, s * 0.065, [255, 220, 130], time);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU - time * 0.004,
        x = width * 0.5 + Math.cos(a) * s * 0.3,
        y = height * 0.44 + Math.sin(a) * s * 0.22;
      drawLensPanel(
        x - s * 0.06,
        y - s * 0.06,
        s * 0.12,
        s * 0.15,
        z,
        labels[i],
        i === sel,
        i,
        time,
      );
      line(
        width * 0.5,
        height * 0.42,
        x,
        y,
        rgba(z.color, i === sel ? 0.32 : 0.065),
        i === sel ? 2 : 1,
      );
    }
    footerLabel("UN UNIVERSO · VARIAS HISTORIAS HACIA SU DESCRIPCIÓN", z);
  }
  function sceneSharedTruths(z, time) {
    const labels = [
        "REGULAR",
        "INVARIAR",
        "REPLICAR",
        "OPERAR",
        "PREDECIR",
        "ERROR",
      ],
      sel = selectedFrame(labels),
      s = Math.min(width, height),
      cx = width * 0.5,
      cy = height * 0.46;
    ctx.fillStyle = rgba([100, 200, 255], 0.13);
    ctx.beginPath();
    ctx.arc(cx - s * 0.08, cy, s * 0.18, 0, TAU);
    ctx.fill();
    ctx.fillStyle = rgba([255, 170, 220], 0.13);
    ctx.beginPath();
    ctx.arc(cx + s * 0.08, cy, s * 0.18, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = rgba(z.color, 0.42);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx - s * 0.08, cy, s * 0.18, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + s * 0.08, cy, s * 0.18, 0, TAU);
    ctx.stroke();
    drawStar(cx, cy, s * 0.055, [255, 225, 145], time);
    for (let i = 0; i < 6; i++)
      drawPacket(
        width * (0.1 + i * 0.16),
        height * 0.76,
        s * 0.06,
        z,
        labels[i],
        i === sel ? 0.88 : 0.3,
      );
    footerLabel("ACUERDO ÚTIL = CONSECUENCIAS QUE AMBOS PUEDEN PROBAR", z);
  }
  function sceneDisagreements(z, time) {
    const labels = [
        "CONCIENCIA",
        "TIEMPO",
        "INDIVIDUO",
        "MATEMÁT.",
        "ORIGEN",
        "DIRECCIÓN",
      ],
      sel = selectedFrame(labels),
      s = Math.min(width, height);
    drawCivilization(width * 0.23, height * 0.46, s * 0.15, z, time, 0);
    drawCivilization(
      width * 0.77,
      height * 0.46,
      s * 0.15,
      { color: [255, 175, 215] },
      -time,
      2,
    );
    for (let i = 0; i < 6; i++) {
      const y = height * (0.22 + i * 0.085),
        bend = Math.sin(i * 1.6) * height * 0.04;
      ctx.strokeStyle = rgba(
        i === sel ? [255, 245, 195] : z.color,
        i === sel ? 0.58 : 0.11,
      );
      ctx.lineWidth = i === sel ? 2.5 : 1;
      ctx.beginPath();
      ctx.moveTo(width * 0.34, y);
      ctx.bezierCurveTo(
        width * 0.44,
        y + bend,
        width * 0.56,
        y - bend,
        width * 0.66,
        y,
      );
      ctx.stroke();
      labelAt(
        labels[i],
        width * 0.5,
        y,
        s * 0.015,
        `rgba(255,255,255,${i === sel ? 0.78 : 0.25})`,
      );
    }
    footerLabel("NO TODO DESACUERDO DESAPARECE CON MÁS DATOS", z);
  }
  function sceneComplementary(z, time) {
    const labels = [
        "SENSOR",
        "DISTINCIÓN",
        "UNIFICAR",
        "LÍMITE",
        "HÍBRIDO",
        "PREDICCIÓN",
      ],
      sel = selectedFrame(labels),
      s = Math.min(width, height);
    drawLensPanel(
      width * 0.1,
      height * 0.2,
      width * 0.32,
      height * 0.42,
      z,
      "HUMANO",
      sel === 1,
      0,
      time,
    );
    drawLensPanel(
      width * 0.58,
      height * 0.2,
      width * 0.32,
      height * 0.42,
      { ...z, color: [255, 170, 220] },
      "ALIENO",
      sel === 0,
      2,
      time,
    );
    for (let i = 0; i < 14; i++) {
      const p = fract(time * 0.035 + i / 14),
        x = mix(width * 0.4, width * 0.6, p),
        y = height * (0.38 + 0.06 * Math.sin(p * TAU * 2 + i));
      circle(x, y, 1.5 + (i % 2), rgba(i % 2 ? z.color : [255, 220, 160], 0.5));
    }
    drawPacket(
      width * 0.5,
      height * 0.72,
      s * 0.15,
      z,
      sel === 5 ? "NUEVA PREDICCIÓN" : "MODELO COMBINADO",
      0.9,
    );
    footerLabel("COMBINAR PERSPECTIVAS CAMBIA EL MAPA DEL PROBLEMA", z);
  }
  function sceneManyObservers(z, time) {
    const labels = [
        "BIOLÓGICO",
        "COLECTIVO",
        "ARTIFICIAL",
        "PLANETARIO",
        "LENTO",
        "ACELERADO",
      ],
      sel = selectedFrame(labels),
      gap = width * 0.012,
      w = (width * 0.92 - gap * 5) / 6,
      h = height * 0.54,
      y = height * 0.18;
    for (let i = 0; i < 6; i++)
      drawLensPanel(
        width * 0.04 + i * (w + gap),
        y,
        w,
        h,
        z,
        labels[i],
        i === sel,
        i,
        time * (i === 5 ? 5 : i === 4 ? 0.15 : 1),
      );
    footerLabel(
      "MISMO FENÓMENO · REPRESENTACIONES PARCIALMENTE SUPERPUESTAS",
      z,
    );
  }
  function scenePlural(z, time) {
    const labels = [
        "CUERPO",
        "CULTURA",
        "ÉPOCA",
        "INSTRUM.",
        "RECURSOS",
        "CRÍTICA",
      ],
      sel = selectedFrame(labels),
      s = Math.min(width, height),
      cx = width * 0.5,
      cy = height * 0.45;
    for (let ring = 0; ring < 6; ring++) {
      const rr = s * (0.07 + ring * 0.045);
      ctx.strokeStyle = rgba(colorsForPlural(ring), ring === sel ? 0.5 : 0.13);
      ctx.lineWidth = ring === sel ? 3 : 1.2;
      ctx.beginPath();
      ctx.arc(cx, cy, rr, 0, TAU);
      ctx.stroke();
      for (let i = 0; i < 8 + ring * 2; i++) {
        const a = (i / (8 + ring * 2)) * TAU + time * (0.004 + ring * 0.002);
        circle(
          cx + Math.cos(a) * rr,
          cy + Math.sin(a) * rr,
          1.3 + (ring === sel ? 1.4 : 0),
          rgba(colorsForPlural(ring), ring === sel ? 0.72 : 0.28),
        );
      }
    }
    drawStar(cx, cy, s * 0.045, [255, 235, 175], time);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU - Math.PI / 2,
        x = cx + Math.cos(a) * s * 0.34,
        y = cy + Math.sin(a) * s * 0.27;
      drawPacket(x, y, s * 0.065, z, labels[i], i === sel ? 0.9 : 0.34);
    }
    footerLabel(
      "NINGUNA VISTA DESDE NINGUNA PARTE · MUCHAS VISTAS QUE SE CORRIGEN",
      z,
    );
  }
  function colorsForPlural(i) {
    return [
      [110, 210, 255],
      [100, 245, 190],
      [255, 220, 115],
      [255, 145, 195],
      [185, 145, 255],
      [240, 245, 255],
    ][i % 6];
  }

  const SCENES = [
    sceneAnotherPerspective,
    sceneHumanPerspective,
    sceneTerrestrialSenses,
    sceneBrainPerception,
    sceneLanguage,
    sceneCulture,
    sceneScientificModels,
    sceneCognitiveLimits,
    sceneAlienPerspective,
    sceneUnknownSenses,
    sceneDifferentTimes,
    sceneOtherIndividuality,
    sceneCollective,
    sceneArtificial,
    scenePlanetary,
    sceneDistributed,
    sceneUntranslatable,
    sceneMultipleMath,
    sceneCausality,
    sceneCosmologies,
    sceneSharedTruths,
    sceneDisagreements,
    sceneComplementary,
    sceneManyObservers,
    scenePlural,
  ];

  function zoneWeight(progress, p0, p1, feather = 0.035) {
    const enter = smooth(clamp((progress - (p0 - feather)) / feather, 0, 1)),
      exit = 1 - smooth(clamp((progress - p1) / feather, 0, 1));
    return enter * exit;
  }
  function drawScene(progress, time) {
    footerLabel.pending = null;
    for (const z of ZONES) {
      const alpha = zoneWeight(progress, z.p0, z.p1, 0.012);
      if (alpha < 0.003) continue;
      footerLabel.alpha = alpha;
      ctx.save();
      ctx.globalAlpha = alpha;
      SCENES[z.scene](z, time);
      ctx.restore();
    }
    paintFooter();
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
