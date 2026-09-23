import { createSceneAudio } from "../../shared/audio.js";
import { clamp, mix, smooth, fract, seeded, rgba } from "../../shared/math.js";
import {
  requestSceneFrame as requestAnimationFrame,
  cancelSceneFrame as cancelAnimationFrame,
} from "../../shared/animation.js";
import content from "./content.json";
const { ZONES } = content;

export function mountScene() {
  const canvas = document.getElementById("technology-spectrum");
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
    const chars = "01λΣΔAI{}<>→∞⊕◌⌁";
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

  function scenePlanetary(z, time) {
    const s = Math.min(width, height),
      cx = width * 0.5,
      cy = height * 0.51,
      r = s * 0.25;
    drawGlobe(cx, cy, r, z, time, true);
    for (let i = 0; i < 5; i++) {
      const a = time * (0.065 + i * 0.012) + (i * TAU) / 5,
        rr = r * (1.35 + i * 0.1),
        x = cx + Math.cos(a) * rr,
        y = cy + Math.sin(a) * rr * 0.58;
      circle(x, y, 3 + i * 0.5, rgba([255, 248, 220], 0.78));
      line(
        x,
        y,
        cx + Math.cos(a) * r,
        cy + Math.sin(a) * r * 0.58,
        rgba(z.color, 0.16),
      );
    }
    const ground = height * 0.9;
    for (let i = 0; i < 12; i++)
      drawBuilding(
        width * (0.04 + i * 0.085),
        ground,
        s * (0.035 + (i % 3) * 0.012),
        s * (0.08 + (i % 6) * 0.024),
        rgba(z.color, 0.24),
        0.35,
      );
  }
  function sceneTools(z, time) {
    const s = Math.min(width, height),
      cx = width * 0.5,
      cy = height * 0.51;
    softHalo(cx, cy, s * 0.48, z.color, 0.18);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + Math.sin(time * 0.35 + i) * 0.05,
        rr = s * (0.15 + (i % 2) * 0.08),
        x = cx + Math.cos(a) * rr,
        y = cy + Math.sin(a) * rr * 0.72;
      drawTool(
        x,
        y,
        s * 0.22,
        a + Math.PI * 0.5,
        ["knife", "hammer", "rope", "needle", "lever"][i % 5],
        rgba(i % 3 ? z.color : [235, 246, 255], 0.72),
      );
    }
    circle(cx, cy, s * 0.07, "rgba(255,230,185,.19)", rgba(z.color, 0.62), 2);
    for (let i = 0; i < 5; i++)
      line(
        cx,
        cy,
        cx + Math.cos((i / 5) * TAU) * s * 0.28,
        cy + Math.sin((i / 5) * TAU) * s * 0.2,
        rgba(z.color, 0.12),
      );
  }
  function sceneMachines(z, time) {
    const s = Math.min(width, height),
      ground = height * 0.74;
    line(width * 0.08, ground, width * 0.92, ground, rgba(z.color, 0.32), 3);
    drawGear(
      width * 0.62,
      height * 0.51,
      s * 0.12,
      14,
      rgba(z.color, 0.7),
      time * 0.22,
    );
    drawGear(
      width * 0.77,
      height * 0.58,
      s * 0.075,
      11,
      "rgba(255,235,190,.55)",
      -time * 0.34,
    );
    const pivot = [width * 0.28, ground - s * 0.03];
    polygon(
      [
        [pivot[0] - s * 0.05, ground],
        [pivot[0], ground - s * 0.1],
        [pivot[0] + s * 0.05, ground],
      ],
      "rgba(0,0,0,.28)",
      rgba(z.color, 0.55),
      1.5,
    );
    ctx.save();
    ctx.translate(...pivot);
    ctx.rotate(Math.sin(time * 0.8) * 0.08 - 0.08);
    line(-s * 0.25, 0, s * 0.28, 0, "rgba(230,204,153,.75)", s * 0.035);
    circle(
      -s * 0.22,
      -s * 0.035,
      s * 0.055,
      "rgba(104,129,154,.7)",
      rgba(z.color, 0.5),
    );
    circle(s * 0.25, -s * 0.055, s * 0.025, "rgba(255,225,155,.7)");
    ctx.restore();
    for (let i = 0; i < 3; i++) {
      const x = width * (0.15 + i * 0.12),
        top = height * 0.24;
      circle(x, top, s * 0.045, "rgba(0,0,0,.25)", rgba(z.color, 0.56), 2);
      line(
        x - s * 0.035,
        top,
        x - s * 0.035,
        ground - s * 0.13,
        rgba(z.color, 0.4),
        2,
      );
      line(
        x + s * 0.035,
        top,
        x + s * 0.035,
        ground - s * 0.06,
        rgba(z.color, 0.4),
        2,
      );
    }
  }
  function sceneMeasurement(z, time) {
    const s = Math.min(width, height),
      m = s * 0.08;
    for (let x = m; x < width - m; x += s * 0.055)
      line(x, height * 0.18, x, height * 0.82, "rgba(255,255,255,.035)");
    for (let y = height * 0.18; y < height * 0.82; y += s * 0.055)
      line(m, y, width - m, y, "rgba(255,255,255,.035)");
    const cx = width * 0.5,
      cy = height * 0.5,
      r = s * 0.25;
    ctx.strokeStyle = rgba(z.color, 0.68);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI, TAU);
    ctx.stroke();
    for (let i = 0; i <= 18; i++) {
      const a = Math.PI + (i / 18) * Math.PI,
        x1 = cx + Math.cos(a) * r,
        y1 = cy + Math.sin(a) * r,
        x2 = cx + Math.cos(a) * (r - s * (i % 3 ? 0.015 : 0.03)),
        y2 = cy + Math.sin(a) * (r - s * (i % 3 ? 0.015 : 0.03));
      line(x1, y1, x2, y2, rgba(z.color, 0.55), 1.2);
    }
    line(
      cx,
      cy,
      cx + Math.cos(-0.65 + Math.sin(time * 0.3) * 0.1) * r * 0.8,
      cy + Math.sin(-0.65 + Math.sin(time * 0.3) * 0.1) * r * 0.8,
      "rgba(255,248,220,.85)",
      3,
    );
    for (let i = 0; i < 8; i++) {
      const x = width * 0.12 + (i / 7) * width * 0.76;
      line(
        x,
        height * 0.78,
        x,
        height * 0.78 - s * (i % 2 ? 0.025 : 0.045),
        rgba(z.color, 0.7),
        2,
      );
    }
    ctx.font = `800 ${s * 0.035}px ui-monospace, monospace`;
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,.68)";
    ctx.fillText("± 0,01", cx, height * 0.74);
  }
  function sceneMaterials(z, time) {
    const s = Math.min(width, height),
      base = height * 0.73;
    for (let i = 0; i < 7; i++) {
      const x = width * (0.11 + i * 0.13),
        w = s * 0.095,
        h = s * (0.15 + (i % 3) * 0.035),
        col =
          i % 3 === 0
            ? [170, 185, 200]
            : i % 3 === 1
              ? z.color
              : [234, 168, 95];
      const g = ctx.createLinearGradient(
        x - w * 0.5,
        base - h,
        x + w * 0.5,
        base,
      );
      g.addColorStop(0, rgba([255, 255, 255], 0.36));
      g.addColorStop(0.25, rgba(col, 0.72));
      g.addColorStop(1, rgba(col, 0.2));
      ctx.fillStyle = g;
      polygon(
        [
          [x - w * 0.5, base],
          [x - w * 0.42, base - h * 0.7],
          [x - w * 0.08, base - h],
          [x + w * 0.42, base - h * 0.76],
          [x + w * 0.5, base],
        ],
        ctx.fillStyle,
        rgba(col, 0.65),
        1.4,
      );
      for (let k = 0; k < 5; k++)
        circle(
          x + (seeded(i * 20 + k) - 0.5) * w * 0.7,
          base - h * (0.2 + seeded(i * 30 + k) * 0.65),
          1.5 + (k % 2),
          rgba([255, 245, 218], 0.38),
        );
    }
    for (let i = 0; i < 18; i++) {
      const a = seeded(i + 800) * TAU,
        rr = s * (0.14 + seeded(i + 830) * 0.18),
        x = width * 0.5 + Math.cos(a) * rr,
        y =
          height * 0.28 + Math.sin(a) * rr * 0.28 + Math.sin(time * 2 + i) * 2;
      circle(x, y, 1 + (i % 3), rgba([255, 208, 119], 0.55));
    }
  }
  function sceneAgriculture(z, time) {
    const s = Math.min(width, height),
      horizon = height * 0.36;
    const sky = ctx.createLinearGradient(0, horizon, 0, height);
    sky.addColorStop(0, rgba(z.color, 0.03));
    sky.addColorStop(1, rgba(z.color, 0.22));
    ctx.fillStyle = sky;
    ctx.fillRect(0, horizon, width, height - horizon);
    for (let i = 0; i < 18; i++) {
      const x = (i / 17) * width,
        spread = (i - 8.5) / 8.5;
      line(width * 0.5, horizon, x, height, rgba([191, 151, 83], 0.19), 2);
      for (let j = 0; j < 9; j++) {
        const y = horizon + (j / 9) * (height - horizon),
          xx = width * 0.5 + (x - width * 0.5) * (j / 9);
        circle(
          xx,
          y,
          1.7 + j * 0.12,
          rgba(i % 2 ? z.color : [255, 225, 117], 0.38),
        );
      }
    }
    const canalY = height * 0.63;
    ctx.strokeStyle = rgba([106, 211, 255], 0.6);
    ctx.lineWidth = s * 0.045;
    ctx.beginPath();
    ctx.moveTo(width * 0.06, canalY);
    ctx.bezierCurveTo(
      width * 0.35,
      canalY - s * 0.06,
      width * 0.62,
      canalY + s * 0.07,
      width * 0.94,
      canalY - s * 0.02,
    );
    ctx.stroke();
    for (let i = 0; i < 5; i++) {
      const x = width * (0.14 + i * 0.18),
        y = horizon - s * 0.025;
      line(x, y, x, height * 0.28, rgba([205, 205, 215], 0.5), 2);
      ctx.save();
      ctx.translate(x, height * 0.28);
      ctx.rotate(time * 0.22 + i);
      for (let k = 0; k < 3; k++) {
        ctx.rotate(TAU / 3);
        line(0, 0, s * 0.09, 0, rgba([255, 248, 220], 0.68), 3);
      }
      ctx.restore();
    }
  }
  function sceneEngines(z, time) {
    const s = Math.min(width, height),
      cx = width * 0.5,
      cy = height * 0.51;
    softHalo(cx, cy, s * 0.5, z.color, 0.18);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + time * 0.36,
        rr = s * 0.2,
        x = cx + Math.cos(a) * rr,
        y = cy + Math.sin(a) * rr;
      polygon(
        [
          [cx, cy],
          [
            x + Math.cos(a + 0.65) * s * 0.055,
            y + Math.sin(a + 0.65) * s * 0.055,
          ],
          [
            x + Math.cos(a - 0.65) * s * 0.055,
            y + Math.sin(a - 0.65) * s * 0.055,
          ],
        ],
        rgba(z.color, 0.24),
        rgba(z.color, 0.58),
        1,
      );
    }
    circle(
      cx,
      cy,
      s * 0.075,
      "rgba(8,12,18,.72)",
      rgba([255, 245, 215], 0.68),
      2,
    );
    for (let i = 0; i < 26; i++) {
      const t = fract(time * 0.2 + i / 26),
        a = t * TAU,
        x = cx + Math.cos(a) * s * (0.31 + t * 0.15),
        y = cy + Math.sin(a) * s * (0.17 + t * 0.07);
      circle(
        x,
        y,
        1.5 + (i % 3),
        rgba(i % 2 ? z.color : [255, 203, 98], 0.44 * (1 - t)),
      );
    }
    for (let i = 0; i < 4; i++) {
      const y = height * (0.25 + i * 0.16);
      line(
        width * 0.07,
        y,
        width * 0.27,
        y,
        rgba([255, 255, 255], 0.12),
        s * 0.02,
      );
      circle(
        width * 0.29,
        y,
        s * 0.022,
        rgba(i % 2 ? z.color : [255, 225, 140], 0.6),
      );
    }
  }
  function sceneIndustry(z, time) {
    const s = Math.min(width, height),
      ground = height * 0.78;
    ctx.fillStyle = "rgba(9,13,18,.65)";
    for (let i = 0; i < 10; i++) {
      const x = width * (0.03 + i * 0.105),
        w = s * (0.055 + (i % 3) * 0.012),
        h = s * (0.11 + (i % 5) * 0.045);
      ctx.fillRect(x, ground - h, w, h);
      ctx.strokeStyle = rgba(z.color, 0.25);
      ctx.strokeRect(x, ground - h, w, h);
    }
    for (let i = 0; i < 3; i++) {
      const x = width * (0.18 + i * 0.29);
      ctx.fillRect(x, ground - s * 0.34, s * 0.045, s * 0.34);
      for (let k = 0; k < 6; k++)
        circle(
          x + s * 0.022 + Math.sin(time * 0.35 + k) * s * 0.02,
          ground - s * 0.37 - k * s * 0.04,
          s * (0.016 + k * 0.004),
          rgba([220, 225, 230], 0.05 + k * 0.012),
        );
    }
    drawGear(
      width * 0.43,
      height * 0.58,
      s * 0.115,
      14,
      rgba(z.color, 0.62),
      time * 0.2,
    );
    drawGear(
      width * 0.61,
      height * 0.61,
      s * 0.08,
      11,
      rgba([255, 224, 175], 0.5),
      -time * 0.28,
    );
    line(
      0,
      ground + s * 0.045,
      width,
      ground + s * 0.045,
      rgba([255, 205, 95], 0.25),
      s * 0.032,
    );
    for (let i = 0; i < 12; i++) {
      const x = fract(time * 0.08 + i / 12) * width;
      roundedRectPath(x - s * 0.025, ground + s * 0.018, s * 0.05, s * 0.04, 3);
      ctx.fillStyle = rgba(i % 3 ? z.color : [255, 220, 140], 0.42);
      ctx.fill();
    }
  }
  function sceneElectricity(z, time) {
    const s = Math.min(width, height),
      left = width * 0.13,
      right = width * 0.87,
      mid = height * 0.5;
    for (let i = 0; i < 5; i++) {
      const y = height * (0.22 + i * 0.14);
      line(left, y, right, y, rgba(z.color, 0.12 + i * 0.025), 1 + i * 0.2);
      for (let k = 0; k < 7; k++) {
        const x = left + (k / 6) * (right - left),
          phase = fract(time * 0.35 + i * 0.13 + k * 0.1);
        circle(
          x + (phase * (right - left)) / 6,
          y,
          2 + (i % 2),
          rgba([255, 249, 205], 0.5),
        );
      }
    }
    for (let i = 0; i < 4; i++) {
      const x = width * (0.2 + i * 0.2),
        base = height * 0.82,
        top = height * 0.25 + (i % 2) * s * 0.05;
      line(x, base, x, top, rgba([210, 230, 245], 0.5), 3);
      line(
        x - s * 0.06,
        top + s * 0.05,
        x + s * 0.06,
        top + s * 0.05,
        rgba([210, 230, 245], 0.5),
        2,
      );
      line(
        x - s * 0.045,
        top + s * 0.1,
        x + s * 0.045,
        top + s * 0.1,
        rgba([210, 230, 245], 0.5),
        2,
      );
    }
    const cx = width * 0.5,
      cy = mid;
    ctx.strokeStyle = rgba(z.color, 0.75);
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i <= 100; i++) {
      const x = width * 0.22 + (i / 100) * width * 0.56,
        y = cy + Math.sin((i / 100) * TAU * 3 - time * 2.2) * s * 0.05;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
    circle(
      cx,
      cy,
      s * 0.05,
      "rgba(10,20,35,.7)",
      rgba([255, 249, 210], 0.75),
      2,
    );
    ctx.font = `900 ${s * 0.035}px system-ui`;
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,.65)";
    ctx.fillText("GENERACIÓN  →  RED  →  USO", cx, height * 0.91);
  }
  function sceneTelecom(z, time) {
    const s = Math.min(width, height),
      cx = width * 0.5,
      base = height * 0.74,
      top = height * 0.28;
    line(cx, base, cx, top, rgba([225, 235, 245], 0.68), 4);
    for (let i = 0; i < 4; i++) {
      const y = top + i * s * 0.08,
        w = s * (0.04 + i * 0.025);
      line(cx - w, y, cx + w, y, rgba([225, 235, 245], 0.55), 2);
    }
    for (let r = 1; r < 8; r++) {
      ctx.strokeStyle = rgba(z.color, (0.28 / r) * 0.9);
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(cx, top, s * (0.045 + r * 0.05), Math.PI * 1.08, Math.PI * 1.92);
      ctx.stroke();
    }
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU,
        x = cx + Math.cos(a) * s * 0.32,
        y = height * 0.55 + Math.sin(a) * s * 0.2;
      circle(x, y, 3 + (i % 3), rgba(i % 2 ? z.color : [255, 242, 215], 0.66));
      const p = fract(time * 0.3 + i * 0.13);
      line(
        cx + (x - cx) * p,
        top + (y - top) * p,
        cx + (x - cx) * (p + 0.02),
        top + (y - top) * (p + 0.02),
        rgba([255, 255, 255], 0.78),
        3,
      );
    }
    line(
      width * 0.08,
      height * 0.86,
      width * 0.92,
      height * 0.86,
      rgba([115, 211, 255], 0.45),
      s * 0.018,
    );
  }
  function sceneElectronics(z, time) {
    const s = Math.min(width, height),
      mx = width * 0.08,
      my = height * 0.16,
      bw = width * 0.84,
      bh = height * 0.68;
    ctx.fillStyle = "rgba(7,43,37,.46)";
    roundedRectPath(mx, my, bw, bh, s * 0.03);
    ctx.fill();
    ctx.strokeStyle = rgba(z.color, 0.4);
    ctx.lineWidth = 2;
    ctx.stroke();
    for (let i = 0; i < packets.length; i++) {
      const p = packets[i],
        x1 = mx + p.x1 * bw,
        y1 = my + p.y1 * bh,
        x2 = mx + p.x2 * bw,
        y2 = my + p.y2 * bh;
      ctx.strokeStyle = rgba(z.color, 0.055 + (i % 3) * 0.03);
      ctx.lineWidth = 1 + (i % 4 === 0);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    for (let i = 0; i < 18; i++) {
      const n = nodes[i],
        x = mx + n.x * bw,
        y = my + n.y * bh,
        r = s * (0.012 + (i % 3) * 0.007);
      ctx.fillStyle = i % 4 ? "rgba(18,25,35,.7)" : rgba(z.color, 0.22);
      roundedRectPath(x - r * 1.7, y - r, r * 3.4, r * 2, 3);
      ctx.fill();
      ctx.strokeStyle = rgba(i % 3 ? z.color : [255, 225, 150], 0.6);
      ctx.stroke();
      for (let k = -1; k <= 1; k++) {
        line(
          x - r * 2,
          y + k * r * 0.55,
          x - r * 1.7,
          y + k * r * 0.55,
          rgba([220, 235, 240], 0.55),
          1,
        );
        line(
          x + r * 1.7,
          y + k * r * 0.55,
          x + r * 2,
          y + k * r * 0.55,
          rgba([220, 235, 240], 0.55),
          1,
        );
      }
    }
    const pulse = fract(time * 0.5);
    circle(
      mx + pulse * bw,
      my + bh * 0.48,
      s * 0.012,
      rgba([255, 250, 210], 0.85),
    );
  }
  function sceneComputing(z, time) {
    const s = Math.min(width, height),
      mx = width * 0.08,
      my = height * 0.15,
      bw = width * 0.84,
      bh = height * 0.7;
    for (let i = 0; i < 9; i++) {
      const n = nodes[i],
        x = mx + (((i % 3) + 0.5) / 3) * bw,
        y = my + ((Math.floor(i / 3) + 0.5) / 3) * bh,
        w = s * 0.12,
        h = s * 0.075;
      ctx.fillStyle = "rgba(5,12,26,.5)";
      roundedRectPath(x - w * 0.5, y - h * 0.5, w, h, h * 0.24);
      ctx.fill();
      ctx.strokeStyle = rgba(i % 2 ? z.color : [255, 238, 195], 0.58);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.font = `900 ${s * 0.026}px system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(255,255,255,.72)";
      ctx.fillText(
        ["AND", "OR", "NOT", "XOR", "MEM", "CPU", "IN", "OUT", "ALG"][i],
        x,
        y,
      );
      if (i < 8) {
        const x2 = mx + ((((i + 1) % 3) + 0.5) / 3) * bw,
          y2 = my + ((Math.floor((i + 1) / 3) + 0.5) / 3) * bh;
        line(x + w * 0.5, y, x2 - w * 0.5, y2, rgba(z.color, 0.18), 2);
        const p = fract(time * 0.32 + i * 0.11),
          px = mix(x + w * 0.5, x2 - w * 0.5, p),
          py = mix(y, y2, p);
        circle(px, py, s * 0.009, rgba([255, 250, 212], 0.82));
      }
    }
    for (let i = 0; i < 24; i++) {
      ctx.font = `800 ${s * 0.022}px ui-monospace, monospace`;
      ctx.fillStyle = rgba(i % 2 ? z.color : [255, 255, 255], 0.13);
      ctx.fillText(
        i % 2 ? "1" : "0",
        width * (0.03 + seeded(i) * 0.94),
        height * (0.04 + seeded(i + 33) * 0.92),
      );
    }
  }
  function sceneSoftware(z, time) {
    const s = Math.min(width, height),
      cx = width * 0.5,
      base = height * 0.78;
    for (let i = 0; i < 7; i++) {
      const w = s * (0.54 - i * 0.045),
        h = s * 0.075,
        y = base - i * s * 0.075,
        x = cx - w * 0.5;
      ctx.fillStyle = rgba(i % 2 ? z.color : [115, 180, 255], 0.08 + i * 0.035);
      roundedRectPath(x, y - h, w, h, h * 0.18);
      ctx.fill();
      ctx.strokeStyle = rgba(
        i % 2 ? z.color : [255, 235, 205],
        0.25 + i * 0.04,
      );
      ctx.lineWidth = 1.3;
      ctx.stroke();
      ctx.font = `800 ${s * 0.024}px system-ui`;
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(255,255,255,.62)";
      ctx.fillText(
        [
          "HARDWARE",
          "CÓDIGO MÁQUINA",
          "SISTEMA OPERATIVO",
          "BIBLIOTECAS",
          "DATOS",
          "APLICACIONES",
          "INTERFAZ",
        ][i],
        cx,
        y - h * 0.35,
      );
    }
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU + time * 0.08,
        rr = s * 0.35,
        x = cx + Math.cos(a) * rr,
        y = height * 0.45 + Math.sin(a) * rr * 0.35;
      ctx.font = `850 ${s * 0.025}px ui-monospace, monospace`;
      ctx.fillStyle = rgba(i % 2 ? z.color : [255, 255, 255], 0.22);
      ctx.fillText(glyphs[i].char, x, y);
    }
  }
  function sceneInternet(z, time) {
    const s = Math.min(width, height),
      cx = width * 0.5,
      cy = height * 0.5,
      r = s * 0.29;
    ctx.strokeStyle = rgba(z.color, 0.28);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.stroke();
    for (let i = 0; i < 22; i++) {
      const a = seeded(i + 50) * TAU,
        rr = Math.sqrt(seeded(i + 90)) * r * 0.92,
        x = cx + Math.cos(a) * rr,
        y = cy + Math.sin(a) * rr * 0.72;
      nodes[i]._x = x;
      nodes[i]._y = y;
      circle(x, y, 2 + (i % 3), rgba(i % 4 ? z.color : [255, 240, 205], 0.72));
    }
    for (let i = 0; i < 36; i++) {
      const a = nodes[i % 22],
        b = nodes[(i * 7 + 5) % 22];
      ctx.strokeStyle = rgba(z.color, 0.08 + (i % 4) * 0.023);
      ctx.beginPath();
      ctx.moveTo(a._x, a._y);
      ctx.quadraticCurveTo(
        cx + Math.sin(i) * r * 0.2,
        cy + Math.cos(i) * r * 0.15,
        b._x,
        b._y,
      );
      ctx.stroke();
      const p = fract(time * (0.18 + (i % 3) * 0.04) + i * 0.071),
        x = mix(a._x, b._x, p),
        y = mix(a._y, b._y, p);
      circle(x, y, 1.8 + (i % 2), rgba([255, 250, 218], 0.6));
    }
    for (let i = 0; i < 6; i++) {
      const x = width * (0.07 + i * 0.17),
        y = height * 0.87,
        w = s * 0.09,
        h = s * 0.06;
      ctx.fillStyle = "rgba(5,12,28,.5)";
      roundedRectPath(x, y, w, h, 5);
      ctx.fill();
      ctx.strokeStyle = rgba(z.color, 0.4);
      ctx.stroke();
    }
  }
  function sceneRobotics(z, time) {
    const s = Math.min(width, height),
      base = height * 0.78,
      cx = width * 0.48;
    ctx.save();
    ctx.lineCap = "round";
    const joints = [
      [cx - s * 0.18, base],
      [cx - s * 0.16, base - s * 0.18],
      [cx + s * 0.02, base - s * 0.29],
      [cx + s * 0.18, base - s * 0.19],
    ];
    for (let i = 0; i < joints.length - 1; i++)
      line(
        joints[i][0],
        joints[i][1],
        joints[i + 1][0],
        joints[i + 1][1],
        rgba([220, 230, 240], 0.66),
        s * 0.055,
      );
    for (const p of joints)
      circle(
        p[0],
        p[1],
        s * 0.045,
        "rgba(12,24,34,.75)",
        rgba(z.color, 0.74),
        2,
      );
    ctx.restore();
    ctx.save();
    ctx.translate(joints[3][0], joints[3][1]);
    ctx.rotate(Math.sin(time * 0.8) * 0.15);
    line(0, 0, s * 0.09, -s * 0.055, rgba(z.color, 0.75), s * 0.025);
    line(0, 0, s * 0.09, s * 0.055, rgba(z.color, 0.75), s * 0.025);
    ctx.restore();
    for (let i = 0; i < 5; i++) {
      const a = time * (0.18 + i * 0.02) + (i * TAU) / 5,
        x = width * 0.5 + Math.cos(a) * s * 0.32,
        y = height * 0.35 + Math.sin(a) * s * 0.13;
      polygon(
        [
          [x - s * 0.035, y],
          [x + s * 0.035, y],
          [x + s * 0.055, y + s * 0.015],
          [x - s * 0.055, y + s * 0.015],
        ],
        rgba(z.color, 0.28),
        rgba([255, 255, 255], 0.55),
        1,
      );
      for (let k = -1; k <= 1; k += 2) {
        line(
          x + k * s * 0.04,
          y,
          x + k * s * 0.08,
          y - s * 0.018,
          rgba(z.color, 0.5),
          2,
        );
        line(
          x + k * s * 0.04,
          y,
          x + k * s * 0.08,
          y + s * 0.018,
          rgba(z.color, 0.5),
          2,
        );
      }
    }
    line(
      width * 0.08,
      base + s * 0.045,
      width * 0.92,
      base + s * 0.045,
      rgba(z.color, 0.2),
      3,
    );
  }
  function sceneBiotech(z, time) {
    const s = Math.min(width, height),
      cx = width * 0.5,
      cy = height * 0.5,
      r = s * 0.24;
    for (let i = 0; i <= 36; i++) {
      const t = i / 36,
        yy = cy - r + t * r * 2,
        phase = t * TAU * 2.5 + time * 0.5,
        x1 = cx + Math.sin(phase) * r * 0.42,
        x2 = cx - Math.sin(phase) * r * 0.42;
      circle(x1, yy, s * 0.012, rgba(z.color, 0.7));
      circle(x2, yy, s * 0.012, rgba([255, 210, 245], 0.65));
      if (i % 3 === 0) line(x1, yy, x2, yy, rgba([255, 255, 255], 0.22), 1.4);
    }
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + time * 0.04,
        rr = s * 0.34,
        x = cx + Math.cos(a) * rr,
        y = cy + Math.sin(a) * rr * 0.64;
      circle(
        x,
        y,
        s * (0.025 + (i % 3) * 0.008),
        rgba(i % 2 ? z.color : [155, 225, 255], 0.13),
        rgba(i % 2 ? z.color : [255, 225, 245], 0.45),
        1.4,
      );
      for (let k = 0; k < 5; k++) {
        const aa = (k / 5) * TAU + time * 0.18;
        circle(
          x + Math.cos(aa) * s * 0.016,
          y + Math.sin(aa) * s * 0.016,
          s * 0.004,
          rgba([255, 255, 255], 0.5),
        );
      }
    }
  }
  function sceneAI(z, time) {
    const s = Math.min(width, height),
      layers = [5, 8, 10, 8, 5],
      mx = width * 0.13,
      bw = width * 0.74,
      top = height * 0.21,
      bh = height * 0.58,
      pos = [];
    for (let l = 0; l < layers.length; l++) {
      pos[l] = [];
      const x = mx + (l / (layers.length - 1)) * bw;
      for (let i = 0; i < layers[l]; i++) {
        const y = top + ((i + 0.5) / layers[l]) * bh;
        pos[l].push([x, y]);
      }
    }
    for (let l = 0; l < layers.length - 1; l++)
      for (let i = 0; i < pos[l].length; i++)
        for (let j = 0; j < pos[l + 1].length; j++) {
          if ((i * 3 + j * 5 + l) % 3) continue;
          const a = pos[l][i],
            b = pos[l + 1][j];
          line(
            a[0],
            a[1],
            b[0],
            b[1],
            rgba(z.color, 0.055 + ((i + j) % 4) * 0.02),
            1,
          );
          const p = fract(time * (0.14 + l * 0.02) + i * 0.07 + j * 0.03),
            x = mix(a[0], b[0], p),
            y = mix(a[1], b[1], p);
          circle(x, y, 1.3, rgba([255, 252, 225], 0.45));
        }
    for (let l = 0; l < pos.length; l++)
      for (let i = 0; i < pos[l].length; i++) {
        const a = pos[l][i],
          pulse = 0.5 + 0.5 * Math.sin(time * 1.4 + l + i * 0.6);
        circle(
          a[0],
          a[1],
          s * (0.008 + (l === 2 ? 0.007 : 0)),
          rgba(l === 2 ? [255, 205, 246] : z.color, 0.35 + pulse * 0.35),
          rgba([255, 255, 255], 0.25),
          1,
        );
      }
    for (let i = 0; i < 16; i++) {
      ctx.font = `800 ${s * 0.024}px ui-monospace, monospace`;
      ctx.textAlign = "center";
      ctx.fillStyle = rgba(i % 2 ? z.color : [255, 255, 255], 0.15);
      ctx.fillText(
        glyphs[i].char,
        width * (0.04 + seeded(i + 81) * 0.92),
        height * (0.07 + seeded(i + 95) * 0.86),
      );
    }
  }
  function sceneAutonomy(z, time) {
    const s = Math.min(width, height),
      roadY = height * 0.73;
    for (let i = 0; i < 5; i++) {
      const y = roadY + i * s * 0.03;
      line(
        width * 0.04,
        y,
        width * 0.96,
        y,
        rgba([225, 235, 245], i === 0 ? 0.28 : 0.08),
        i === 0 ? 4 : 1,
      );
    }
    for (let i = 0; i < 7; i++) {
      const p = fract(time * (0.06 + i * 0.005) + i * 0.15),
        x = width * (0.08 + p * 0.84),
        y = roadY - s * (0.03 + (i % 3) * 0.055),
        w = s * 0.075,
        h = s * 0.038;
      ctx.fillStyle = rgba(i % 2 ? z.color : [130, 210, 255], 0.34);
      roundedRectPath(x - w * 0.5, y - h * 0.5, w, h, h * 0.25);
      ctx.fill();
      ctx.strokeStyle = rgba([255, 255, 255], 0.45);
      ctx.stroke();
      circle(
        x - w * 0.28,
        y + h * 0.48,
        h * 0.2,
        "rgba(5,8,15,.85)",
        rgba(z.color, 0.5),
      );
      circle(
        x + w * 0.28,
        y + h * 0.48,
        h * 0.2,
        "rgba(5,8,15,.85)",
        rgba(z.color, 0.5),
      );
      for (let r = 1; r < 4; r++) {
        ctx.strokeStyle = rgba(z.color, 0.12 / r);
        ctx.beginPath();
        ctx.arc(x, y, s * (0.05 + r * 0.035), Math.PI, TAU);
        ctx.stroke();
      }
    }
    const cx = width * 0.5,
      cy = height * 0.32;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + time * 0.09,
        x = cx + Math.cos(a) * s * 0.25,
        y = cy + Math.sin(a) * s * 0.12;
      circle(x, y, 3 + (i % 3), rgba(i % 2 ? z.color : [255, 240, 210], 0.7));
      line(x, y, cx, cy, rgba(z.color, 0.14));
    }
    circle(cx, cy, s * 0.035, "rgba(255,255,255,.18)", rgba(z.color, 0.7), 2);
  }
  function scenePlanetaryTech(z, time) {
    const s = Math.min(width, height),
      cx = width * 0.5,
      cy = height * 0.52,
      r = s * 0.25;
    drawGlobe(cx, cy, r, z, time, true);
    for (let i = 0; i < 7; i++) {
      const a = time * (0.055 + i * 0.008) + (i * TAU) / 7,
        rr = r * (1.33 + (i % 3) * 0.16),
        x = cx + Math.cos(a) * rr,
        y = cy + Math.sin(a) * rr * 0.57;
      polygon(
        [
          [x - s * 0.012, y],
          [x + s * 0.012, y],
          [x + s * 0.026, y + s * 0.009],
          [x - s * 0.026, y + s * 0.009],
        ],
        rgba([220, 235, 245], 0.6),
        rgba(z.color, 0.65),
        1,
      );
      line(x - s * 0.05, y, x - s * 0.025, y, rgba(z.color, 0.6), 3);
      line(x + s * 0.025, y, x + s * 0.05, y, rgba(z.color, 0.6), 3);
      line(
        x,
        y,
        cx + Math.cos(a) * r,
        cy + Math.sin(a) * r * 0.57,
        rgba(z.color, 0.13),
      );
    }
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU,
        rr = r * 0.7,
        x = cx + Math.cos(a) * rr,
        y = cy + Math.sin(a) * rr;
      const val = 0.5 + 0.5 * Math.sin(time * 0.7 + i);
      circle(
        x,
        y,
        s * (0.008 + val * 0.007),
        rgba(i % 3 ? z.color : [255, 220, 120], 0.35 + val * 0.25),
      );
    }
    ctx.font = `800 ${s * 0.024}px system-ui`;
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,.58)";
    ctx.fillText(
      "TÉCNICA · ECONOMÍA · SOCIEDAD · LEGITIMIDAD",
      cx,
      height * 0.91,
    );
  }
  function sceneFutures(z, time) {
    const s = Math.min(width, height),
      origin = [width * 0.5, height * 0.82],
      horizon = height * 0.18;
    softHalo(width * 0.5, horizon, s * 0.4, z.color, 0.16);
    const colors = [
      [120, 230, 255],
      [255, 145, 190],
      [150, 255, 160],
      [235, 210, 255],
      [255, 210, 120],
      [155, 170, 255],
      [255, 115, 105],
      [225, 245, 255],
    ];
    for (let i = 0; i < 8; i++) {
      const endX = width * (0.08 + (i / 7) * 0.84),
        controlX =
          width * 0.5 + (endX - width * 0.5) * 0.35 + Math.sin(i) * s * 0.06;
      ctx.strokeStyle = rgba(colors[i], 0.28 + i * 0.018);
      ctx.lineWidth = 2 + (i % 3);
      ctx.beginPath();
      ctx.moveTo(...origin);
      ctx.bezierCurveTo(
        controlX,
        height * 0.62,
        controlX,
        height * 0.36,
        endX,
        horizon,
      );
      ctx.stroke();
      const p = fract(time * (0.08 + i * 0.006) + i * 0.11),
        t = p,
        x =
          (1 - t) ** 3 * origin[0] +
          3 * (1 - t) ** 2 * t * controlX +
          3 * (1 - t) * t * t * controlX +
          t ** 3 * endX,
        y =
          (1 - t) ** 3 * origin[1] +
          3 * (1 - t) ** 2 * t * height * 0.62 +
          3 * (1 - t) * t * t * height * 0.36 +
          t ** 3 * horizon;
      circle(x, y, 2.5 + (i % 2), rgba(colors[i], 0.72));
      circle(
        endX,
        horizon,
        s * (0.018 + (i % 3) * 0.007),
        rgba(colors[i], 0.52),
        rgba([255, 255, 255], 0.45),
        1.3,
      );
    }
    ctx.font = `900 ${s * 0.03}px system-ui`;
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,.66)";
    ctx.fillText(
      "NINGÚN FUTURO ESTÁ PREDETERMINADO",
      width * 0.5,
      height * 0.93,
    );
  }

  const SCENES = [
    scenePlanetary,
    sceneTools,
    sceneMachines,
    sceneMeasurement,
    sceneMaterials,
    sceneAgriculture,
    sceneEngines,
    sceneIndustry,
    sceneElectricity,
    sceneTelecom,
    sceneElectronics,
    sceneComputing,
    sceneSoftware,
    sceneInternet,
    sceneRobotics,
    sceneBiotech,
    sceneAI,
    sceneAutonomy,
    scenePlanetaryTech,
    sceneFutures,
  ];
  function zoneWeight(progress, p0, p1, feather = 0.035) {
    const enter = smooth(clamp((progress - (p0 - feather)) / feather, 0, 1)),
      exit = 1 - smooth(clamp((progress - p1) / feather, 0, 1));
    return enter * exit;
  }
  function drawScene(progress, time) {
    for (const z of ZONES) {
      const alpha = zoneWeight(progress, z.p0, z.p1, 0.016);
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
