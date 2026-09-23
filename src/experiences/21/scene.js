import { createSceneAudio } from "../../shared/audio.js";
import { clamp, mix, smooth, fract, seeded, rgba } from "../../shared/math.js";
import {
  requestSceneFrame as requestAnimationFrame,
  cancelSceneFrame as cancelAnimationFrame,
} from "../../shared/animation.js";
import content from "./content.json";
const { ZONES } = content;

export function mountScene() {
  const canvas = document.getElementById("cosmic-life-spectrum");
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
    const s = Math.min(width, height);
    ctx.font = `900 ${s * 0.023}px system-ui`;
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,.57)";
    ctx.fillText(text, width * 0.5, height * 0.86);
  }

  function sceneUnknownHorizon(z, time) {
    const s = Math.min(width, height);
    for (let i = 0; i < 85; i++) {
      const x = seeded(i + 40) * width,
        y = seeded(i + 90) * height,
        r = 0.5 + seeded(i + 140) * 2.1;
      circle(
        x,
        y,
        r,
        rgba(i % 7 ? z.color : [255, 220, 160], 0.15 + 0.35 * seeded(i + 190)),
      );
    }
    for (let i = 0; i < 6; i++) {
      const x = width * (0.1 + i * 0.16),
        y = height * (0.25 + 0.1 * Math.sin(i * 1.7));
      drawSignal(x, y, s * 0.08, z, time + i, 4);
    }
    drawBranching(width * 0.5, height * 0.82, height * 0.18, z, time, 9, 0.88);
    footerLabel("DE NUESTRO FUTURO A OTRAS POSIBILIDADES", z);
  }
  function sceneIngredients(z, time) {
    const s = Math.min(width, height);
    drawStar(width * 0.18, height * 0.28, s * 0.07, [255, 206, 110], time);
    drawStar(width * 0.82, height * 0.22, s * 0.05, [150, 205, 255], time);
    for (let i = 0; i < 4; i++) {
      drawMolecule(
        width * (0.2 + i * 0.2),
        height * (0.6 + (i % 2) * 0.12),
        s * (0.1 + i * 0.008),
        z,
        time + i,
        5 + i,
      );
    }
    for (let i = 0; i < 26; i++) {
      const p = fract(time * 0.025 + i * 0.037);
      circle(
        mix(width * 0.14, width * 0.86, p),
        height * 0.42 + Math.sin(p * TAU + i) * s * 0.08,
        1 + (i % 3),
        rgba(z.color, 0.36 * (1 - p)),
      );
    }
    footerLabel("INGREDIENTES COMUNES · ORGANIZACIÓN INCIERTA", z);
  }
  function sceneStellar(z, time) {
    const s = Math.min(width, height),
      x = width * (0.5 + (pointerX - 0.5) * 0.3);
    drawStar(x, height * 0.42, s * 0.12, z.color, time);
    for (let i = 0; i < 5; i++) {
      drawOrbitalRing(
        x,
        height * 0.42,
        s * (0.17 + i * 0.055),
        s * (0.055 + i * 0.017),
        time * 0.004 + i * 0.3,
        z.color,
        0.2,
      );
      const a = time * (0.05 - i * 0.005) + i * 1.7;
      circle(
        x + Math.cos(a) * s * (0.17 + i * 0.055),
        height * 0.42 + Math.sin(a) * s * (0.055 + i * 0.017),
        s * (0.012 + i * 0.003),
        rgba(i % 2 ? [115, 190, 255] : [255, 165, 100], 0.66),
      );
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + time * 0.22;
      line(
        x + Math.cos(a) * s * 0.14,
        height * 0.42 + Math.sin(a) * s * 0.14,
        x + Math.cos(a) * s * 0.25,
        height * 0.42 + Math.sin(a) * s * 0.25,
        rgba([255, 120, 100], 0.15 + 0.08 * (i % 2)),
        2,
      );
    }
    footerLabel("ENERGÍA DURADERA · ACTIVIDAD CAMBIANTE", z);
  }
  function scenePlanetarySystems(z, time) {
    const s = Math.min(width, height),
      cx = width * 0.5,
      cy = height * 0.5;
    softHalo(cx, cy, s * 0.35, z.color, 0.12);
    drawStar(cx, cy, s * 0.055, [255, 220, 120], time);
    for (let i = 0; i < 7; i++) {
      const rx = s * (0.11 + i * 0.045),
        ry = rx * (0.35 + 0.12 * seeded(i + 4));
      drawOrbitalRing(cx, cy, rx, ry, i * 0.22, z.color, 0.17, 1);
      const a = time * (0.08 / (1 + i * 0.25)) + i;
      circle(
        cx + Math.cos(a) * rx,
        cy + Math.sin(a) * ry,
        s * (0.009 + i * 0.003),
        rgba(
          i < 3 ? [195, 145, 110] : i < 5 ? [100, 165, 255] : [160, 205, 230],
          0.78,
        ),
      );
    }
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * TAU + time * 0.01,
        rr = s * (0.31 + seeded(i + 9) * 0.035);
      circle(
        cx + Math.cos(a) * rr,
        cy + Math.sin(a) * rr * 0.42,
        1.1,
        rgba(z.color, 0.28),
      );
    }
    footerLabel("LOS SISTEMAS CAMBIAN MIENTRAS SE FORMAN", z);
  }
  function sceneHabitableZone(z, time) {
    const s = Math.min(width, height),
      cx = width * 0.24,
      cy = height * 0.5;
    drawStar(cx, cy, s * 0.09, [255, 220, 105], time);
    const inner = s * (0.18 + 0.035 * Math.sin(time * 0.12)),
      outer = s * (0.4 + 0.025 * Math.cos(time * 0.1));
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.08);
    ctx.strokeStyle = rgba([80, 255, 160], 0.34);
    ctx.lineWidth = s * 0.08;
    ctx.beginPath();
    ctx.ellipse(0, 0, (inner + outer) / 2, (inner + outer) * 0.28, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
    for (let i = 0; i < 4; i++) {
      const rr = s * (0.14 + i * 0.1),
        a = time * 0.045 + i * 1.6;
      circle(
        cx + Math.cos(a) * rr,
        cy + Math.sin(a) * rr * 0.28,
        s * (0.016 + i * 0.005),
        rgba(i === 2 ? z.color : [160, 180, 210], 0.72),
      );
    }
    footerLabel("ZONA HABITABLE ≠ PLANETA HABITADO", z);
  }
  function sceneRealHabitability(z, time) {
    const s = Math.min(width, height),
      cx = width * 0.5,
      cy = height * 0.55,
      r = s * 0.22;
    drawPlanet(cx, cy, r, z, time, true);
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = rgba(
        i === 0
          ? [140, 220, 255]
          : i === 1
            ? [110, 255, 180]
            : i === 2
              ? [255, 220, 120]
              : z.color,
        0.16,
      );
      ctx.lineWidth = 2 + i * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r * (1.08 + i * 0.08), 0, TAU);
      ctx.stroke();
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + time * 0.02;
      line(
        cx + Math.cos(a) * r * 0.4,
        cy + Math.sin(a) * r * 0.4,
        cx + Math.cos(a) * r * 0.86,
        cy + Math.sin(a) * r * 0.86,
        rgba(z.color, 0.15),
        1,
      );
    }
    footerLabel("ATMÓSFERA · CLIMA · GEOLOGÍA · ENERGÍA", z);
  }
  function scenePrebiotic(z, time) {
    const s = Math.min(width, height);
    for (let i = 0; i < 6; i++)
      drawMolecule(
        width * (0.12 + i * 0.15),
        height * (0.26 + (i % 3) * 0.23),
        s * 0.075,
        z,
        time + i,
        5 + (i % 4),
      );
    for (let i = 0; i < 12; i++) {
      const p = fract(time * 0.04 + i * 0.08),
        x = mix(width * 0.08, width * 0.92, p),
        y = height * 0.82 - Math.sin(p * Math.PI) * s * 0.16;
      circle(x, y, 2 + (i % 2), rgba(i % 3 ? z.color : [255, 170, 110], 0.48));
    }
    ctx.strokeStyle = rgba(z.color, 0.22);
    ctx.beginPath();
    ctx.moveTo(0, height * 0.84);
    for (let x = 0; x <= width; x += 8)
      ctx.lineTo(
        x,
        height * 0.84 - Math.sin(x * 0.03 + time * 0.15) * s * 0.035,
      );
    ctx.stroke();
    footerLabel("ORGÁNICO NO SIGNIFICA VIVO", z);
  }
  function sceneOrigin(z, time) {
    const s = Math.min(width, height);
    drawCell(width * 0.5, height * 0.55, s * 0.23, z, time, 1);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + time * 0.03,
        x = width * 0.5 + Math.cos(a) * s * 0.31,
        y = height * 0.55 + Math.sin(a) * s * 0.22;
      drawMolecule(x, y, s * 0.045, z, time + i, 5);
    }
    drawBranching(width * 0.5, height * 0.53, height * 0.15, z, time, 7, 0.72);
    footerLabel("HERENCIA + VARIACIÓN + SELECCIÓN", z);
  }
  function sceneSimpleBiospheres(z, time) {
    const s = Math.min(width, height);
    for (let i = 0; i < 18; i++) {
      const x = width * (0.06 + seeded(i + 500) * 0.88),
        y = height * (0.18 + seeded(i + 550) * 0.64),
        r = s * (0.02 + seeded(i + 600) * 0.035);
      drawCell(x, y, r, z, time + i, i % 4);
    }
    const g = ctx.createLinearGradient(0, height * 0.72, 0, height);
    g.addColorStop(0, "rgba(30,105,90,.05)");
    g.addColorStop(1, rgba(z.color, 0.18));
    ctx.fillStyle = g;
    ctx.fillRect(0, height * 0.7, width, height * 0.3);
    footerLabel("UN MUNDO VIVO PUEDE SER MICROSCÓPICO", z);
  }
  function sceneComplexLife(z, time) {
    const s = Math.min(width, height);
    for (let i = 0; i < 7; i++) {
      const x = width * (0.12 + i * 0.13),
        y = height * (0.56 + 0.12 * Math.sin(i));
      drawAbstractBody(x, y, s * (0.055 + i * 0.004), z, time, i);
    }
    drawBranching(width * 0.5, height * 0.84, height * 0.18, z, time, 9, 0.86);
    for (let i = 0; i < 10; i++) {
      const x = width * (0.08 + i * 0.09),
        h = s * (0.07 + seeded(i + 800) * 0.16);
      line(x, height * 0.84, x, height * 0.84 - h, rgba(z.color, 0.24), 2);
      circle(
        x,
        height * 0.84 - h,
        s * 0.012,
        rgba(i % 2 ? z.color : [255, 200, 120], 0.58),
      );
    }
    footerLabel("COMPLEJIDAD: POSIBILIDAD, NO DESTINO", z);
  }
  function sceneExtremophiles(z, time) {
    const s = Math.min(width, height),
      cols = [
        [255, 115, 75],
        [120, 205, 255],
        [255, 220, 140],
        [205, 130, 255],
      ];
    for (let i = 0; i < 4; i++) {
      const x = width * (0.14 + i * 0.24),
        y = height * 0.5;
      softHalo(x, y, s * 0.15, cols[i], 0.13);
      ctx.strokeStyle = rgba(cols[i], 0.45);
      ctx.strokeRect(x - s * 0.09, y - s * 0.2, s * 0.18, s * 0.4);
      for (let k = 0; k < 5; k++)
        drawCell(
          x + (seeded(i * 10 + k) - 0.5) * s * 0.11,
          y + (seeded(i * 10 + k + 40) - 0.5) * s * 0.27,
          s * 0.018,
          z,
          time + k,
          i + k,
        );
    }
    footerLabel("ADAPTACIÓN EXTREMA · ORIGEN NO DEMOSTRADO", z);
  }
  function sceneMars(z, time) {
    const s = Math.min(width, height),
      h = height * 0.68;
    const g = ctx.createLinearGradient(0, h, 0, height);
    g.addColorStop(0, "rgba(150,63,42,.18)");
    g.addColorStop(1, "rgba(90,32,25,.75)");
    ctx.fillStyle = g;
    ctx.fillRect(0, h, width, height - h);
    ctx.strokeStyle = rgba(z.color, 0.45);
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= width; x += width / 18)
      ctx.lineTo(
        x,
        h - seeded(x + 30) * s * 0.1 - Math.sin(x * 0.015) * s * 0.035,
      );
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    for (let i = 0; i < 5; i++) {
      const p = fract(time * 0.04 + i * 0.2),
        x = width * (0.08 + p * 0.84),
        y = h - s * (0.04 + 0.2 * Math.sin(p * Math.PI));
      circle(x, y, s * 0.012, "rgba(225,220,205,.7)", rgba(z.color, 0.7), 1);
      line(
        x,
        y + s * 0.012,
        x - s * 0.015,
        y + s * 0.055,
        "rgba(220,220,220,.5)",
        2,
      );
      line(
        x,
        y + s * 0.012,
        x + s * 0.015,
        y + s * 0.055,
        "rgba(220,220,220,.5)",
        2,
      );
    }
    footerLabel("AGUA ANTIGUA · EVIDENCIA BIOLÓGICA NO CONFIRMADA", z);
  }
  function sceneOceanWorlds(z, time) {
    const s = Math.min(width, height),
      cx = width * 0.5,
      cy = height * 0.48,
      r = s * 0.24;
    drawIceMoon(cx, cy, r, z, time);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.82, 0, Math.PI);
    ctx.clip();
    ctx.fillStyle = "rgba(20,110,170,.5)";
    ctx.fillRect(cx - r, cy - r * 0.1, r * 2, r);
    for (let i = 0; i < 8; i++) {
      const x = cx - r * 0.72 + i * r * 0.2;
      line(
        x,
        cy + r * 0.48,
        x + Math.sin(i) * r * 0.05,
        cy + r * 0.15,
        rgba([255, 170, 100], 0.35),
        2,
      );
      softHalo(x, cy + r * 0.16, r * 0.12, [255, 145, 90], 0.08);
    }
    ctx.restore();
    for (let i = 0; i < 5; i++) {
      const p = fract(time * 0.07 + i * 0.2);
      circle(
        cx + r * 0.65,
        cy - r * 0.5 - p * s * 0.22,
        2 + (i % 2),
        rgba([220, 245, 255], 0.55 * (1 - p)),
      );
    }
    footerLabel("OCÉANOS OCULTOS BAJO KILÓMETROS DE HIELO", z);
  }
  function sceneExoplanets(z, time) {
    const s = Math.min(width, height),
      sx = width * 0.32,
      sy = height * 0.45;
    drawStar(sx, sy, s * 0.11, [255, 225, 135], time);
    const p = fract(time * 0.075),
      px = mix(width * 0.08, width * 0.9, p);
    circle(px, sy, s * 0.035, "rgba(10,18,32,.95)", rgba(z.color, 0.7), 1.3);
    ctx.strokeStyle = rgba(z.color, 0.55);
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 80; i++) {
      const u = i / 80,
        d = Math.exp(-Math.pow((u - 0.5) / 0.085, 2)) * 0.28;
      const x = width * 0.08 + u * width * 0.84,
        y = height * 0.82 - d * s * 0.3;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
    drawSpectrum(
      width * 0.52,
      height * 0.16,
      width * 0.4,
      height * 0.22,
      z,
      time,
      7,
    );
    footerLabel("MUNDOS INFERIDOS A PARTIR DE SU LUZ", z);
  }
  function sceneBiosignatures(z, time) {
    const s = Math.min(width, height);
    drawPlanet(width * 0.28, height * 0.56, s * 0.17, z, time, true);
    drawSpectrum(
      width * 0.48,
      height * 0.22,
      width * 0.43,
      height * 0.32,
      z,
      time,
      10,
    );
    const labels = ["O₂", "O₃", "CH₄", "H₂O"];
    for (let i = 0; i < labels.length; i++) {
      const x = width * (0.54 + i * 0.1),
        y = height * 0.68;
      circle(
        x,
        y,
        s * 0.036,
        rgba(i % 2 ? z.color : [255, 205, 120], 0.2),
        rgba(i % 2 ? z.color : [255, 205, 120], 0.62),
        1.3,
      );
      ctx.font = `900 ${s * 0.025}px system-ui`;
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(255,255,255,.7)";
      ctx.fillText(labels[i], x, y + s * 0.009);
    }
    footerLabel("UNA SEÑAL AISLADA NO BASTA", z);
  }
  function sceneFalsePositives(z, time) {
    const s = Math.min(width, height),
      ox = width * 0.5,
      oy = height * 0.78;
    drawBranching(ox, oy, height * 0.2, z, time, 8, 0.88);
    const symbols = ["BIO", "UV", "VOL", "MIN", "ERR", "?"];
    for (let i = 0; i < 6; i++) {
      const x = width * (0.1 + i * 0.16),
        y = height * 0.19;
      circle(
        x,
        y,
        s * 0.045,
        rgba(i === 0 ? [90, 255, 170] : [255, 160, 100], 0.16),
        rgba(i === 0 ? [90, 255, 170] : [255, 160, 100], 0.58),
        1.4,
      );
      ctx.font = `900 ${s * 0.018}px system-ui`;
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(255,255,255,.64)";
      ctx.fillText(symbols[i], x, y + s * 0.006);
    }
    footerLabel("SEÑAL → ALTERNATIVAS → VERIFICACIÓN", z);
  }
  function sceneEvolutionaryIntelligence(z, time) {
    const s = Math.min(width, height);
    for (let i = 0; i < 6; i++) {
      const x = width * (0.1 + i * 0.16),
        y = height * (0.65 - 0.06 * Math.sin(i));
      drawAbstractBody(x, y, s * 0.07, z, time, i);
      const nodesN = 3 + i;
      for (let k = 0; k < nodesN; k++) {
        const a = (k / nodesN) * TAU + time * 0.03;
        circle(
          x + Math.cos(a) * s * 0.09,
          y + Math.sin(a) * s * 0.06,
          2,
          rgba(z.color, 0.5),
        );
      }
    }
    drawBranching(width * 0.5, height * 0.84, height * 0.2, z, time, 10, 0.9);
    footerLabel("LA EVOLUCIÓN NO TIENE UNA ESCALERA ÚNICA", z);
  }
  function sceneAlienForms(z, time) {
    const s = Math.min(width, height);
    for (let i = 0; i < 8; i++) {
      const x = width * (0.1 + (i % 4) * 0.265),
        y = height * (0.3 + Math.floor(i / 4) * 0.36);
      drawAbstractBody(x, y, s * 0.08, z, time, i + 2);
      if (i === 1 || i === 5) drawNetwork(x, y, s * 0.1, z, time, 10 + i);
    }
    footerLabel("¿RECONOCERÍAMOS OTRA FORMA DE MENTE?", z);
  }
  function sceneTechnosignatures(z, time) {
    const s = Math.min(width, height);
    drawStar(width * 0.28, height * 0.42, s * 0.08, [255, 220, 120], time);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU + time * 0.025,
        rr = s * (0.13 + (i % 3) * 0.025),
        x = width * 0.28 + Math.cos(a) * rr,
        y = height * 0.42 + Math.sin(a) * rr * 0.55;
      polygon(
        [
          [x - s * 0.01, y],
          [x + s * 0.01, y],
          [x + s * 0.015, y + s * 0.007],
          [x - s * 0.015, y + s * 0.007],
        ],
        rgba(z.color, 0.48),
        rgba([255, 255, 255], 0.35),
        1,
      );
    }
    drawSignal(width * 0.74, height * 0.4, s * 0.22, z, time, 9);
    drawSpectrum(
      width * 0.48,
      height * 0.66,
      width * 0.42,
      height * 0.15,
      z,
      time,
      6,
    );
    footerLabel("TECNOLOGÍA POSIBLE · INTENCIÓN DESCONOCIDA", z);
  }
  function sceneFermi(z, time) {
    const s = Math.min(width, height);
    for (let i = 0; i < 120; i++) {
      const x = seeded(i + 2400) * width,
        y = seeded(i + 2500) * height * 0.72,
        r = 0.4 + seeded(i + 2600) * 1.8;
      circle(
        x,
        y,
        r,
        rgba(i % 9 ? z.color : [255, 225, 160], 0.12 + 0.3 * seeded(i + 2700)),
      );
    }
    const cx = width * 0.5,
      cy = height * 0.52;
    for (let i = 0; i < 6; i++) {
      ctx.strokeStyle = rgba(z.color, 0.08);
      ctx.beginPath();
      ctx.arc(cx, cy, s * (0.08 + i * 0.055), 0, TAU);
      ctx.stroke();
    }
    ctx.font = `900 ${s * 0.11}px system-ui`;
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,.12)";
    ctx.fillText("?", cx, cy + s * 0.035);
    footerLabel("MUCHOS MUNDOS · NINGUNA SEÑAL CONFIRMADA", z);
  }
  function sceneGreatFilter(z, time) {
    const s = Math.min(width, height);
    for (let i = 0; i < 8; i++) {
      const x = width * (0.08 + i * 0.12),
        h = s * (0.14 + seeded(i + 2800) * 0.28);
      ctx.strokeStyle = rgba(i < 4 ? z.color : [255, 220, 150], 0.35);
      ctx.strokeRect(x, height * 0.5 - h * 0.5, s * 0.045, h);
      const p = fract(time * 0.035 + i * 0.11);
      circle(
        x + s * 0.022,
        height * 0.5 + h * 0.5 - p * h,
        2 + (i % 2),
        rgba([255, 245, 210], 0.48),
      );
    }
    drawBranching(width * 0.5, height * 0.86, height * 0.14, z, time, 8, 0.85);
    footerLabel("¿QUÉ TRANSICIÓN ES REALMENTE RARA?", z);
  }
  function sceneAlienCivilizations(z, time) {
    const s = Math.min(width, height);
    const centers = [
      [0.18, 0.56],
      [0.5, 0.34],
      [0.8, 0.6],
    ];
    centers.forEach((p, i) => {
      const x = width * p[0],
        y = height * p[1];
      softHalo(
        x,
        y,
        s * 0.17,
        i === 0 ? [100, 230, 180] : i === 1 ? z.color : [255, 180, 115],
        0.13,
      );
      if (i === 0) drawHabitat(x, y + s * 0.08, s * 0.38, z, 3);
      if (i === 1) drawNetwork(x, y, s * 0.15, z, time, 20);
      if (i === 2) {
        for (let k = 0; k < 9; k++) {
          const a = (k / 9) * TAU + time * 0.02,
            rr = s * 0.11;
          polygon(
            [
              [x + Math.cos(a) * rr - s * 0.012, y + Math.sin(a) * rr * 0.6],
              [x + Math.cos(a) * rr + s * 0.012, y + Math.sin(a) * rr * 0.6],
              [x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.6 - s * 0.026],
            ],
            rgba(z.color, 0.32),
            rgba([255, 255, 255], 0.4),
            1,
          );
        }
      }
    });
    footerLabel("MISMA FÍSICA · HISTORIAS Y VALORES DISTINTOS", z);
  }
  function sceneCommunication(z, time) {
    const s = Math.min(width, height);
    drawStar(width * 0.18, height * 0.35, s * 0.05, [255, 220, 120], time);
    drawStar(width * 0.82, height * 0.62, s * 0.05, [150, 205, 255], time);
    ctx.setLineDash([7, 10]);
    line(
      width * 0.22,
      height * 0.37,
      width * 0.78,
      height * 0.6,
      rgba(z.color, 0.3),
      1.5,
    );
    ctx.setLineDash([]);
    for (let i = 0; i < 7; i++) {
      const p = fract(time * 0.035 + i / 7),
        x = mix(width * 0.22, width * 0.78, p),
        y = mix(height * 0.37, height * 0.6, p);
      circle(x, y, 2 + (i % 2), rgba([255, 245, 190], 0.55));
    }
    drawSignal(width * 0.18, height * 0.35, s * 0.11, z, time, 5);
    drawSignal(width * 0.82, height * 0.62, s * 0.11, z, -time, 5);
    footerLabel("PREGUNTA HOY · RESPUESTA EN OTRA GENERACIÓN", z);
  }
  function sceneUncertainContact(z, time) {
    const s = Math.min(width, height),
      cx = width * 0.5,
      cy = height * 0.36;
    drawSignal(cx, cy, s * 0.18, z, time, 8);
    const stations = 8;
    for (let i = 0; i < stations; i++) {
      const a = (i / stations) * TAU + time * 0.005,
        x = cx + Math.cos(a) * s * 0.29,
        y = cy + Math.sin(a) * s * 0.18;
      circle(x, y, s * 0.026, "rgba(10,20,35,.55)", rgba(z.color, 0.55), 1.2);
      line(cx, cy, x, y, rgba(z.color, 0.12), 1);
      ctx.font = `800 ${s * 0.015}px system-ui`;
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(255,255,255,.48)";
      ctx.fillText(i % 2 ? "DATOS" : "REV", x, y + s * 0.006);
    }
    drawBranching(cx, height * 0.72, height * 0.9, z, time, 7, 0.8);
    footerLabel("CONTACTO PUEDE SIGNIFICAR SOLO DATOS", z);
  }
  function sceneUnknownCosmicLife(z, time) {
    const s = Math.min(width, height);
    const g = ctx.createLinearGradient(0, height, 0, 0);
    g.addColorStop(0, "rgba(5,9,22,.98)");
    g.addColorStop(0.55, "rgba(45,60,90,.36)");
    g.addColorStop(1, "rgba(225,240,255,.16)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
    for (let i = 0; i < 65; i++) {
      const x = seeded(i + 3100) * width,
        y = seeded(i + 3200) * height * 0.74,
        r = 0.5 + seeded(i + 3300) * 2.1;
      circle(
        x,
        y,
        r,
        rgba(i % 8 ? z.color : [255, 220, 160], 0.13 + 0.32 * seeded(i + 3400)),
      );
    }
    for (let i = 0; i < 7; i++) {
      const x = width * (0.08 + i * 0.14),
        y = height * (0.22 + 0.09 * Math.sin(i * 2.3));
      const mode = i % 3;
      if (mode === 0) drawMolecule(x, y, s * 0.055, z, time + i, 6);
      else if (mode === 1) drawAbstractBody(x, y, s * 0.055, z, time, i);
      else drawSignal(x, y, s * 0.07, z, time + i, 4);
    }
    for (let i = 0; i < 4; i++) {
      const x = width * (0.24 + i * 0.18),
        y = height * 0.66;
      ctx.strokeStyle = rgba(z.color, 0.16);
      ctx.beginPath();
      ctx.arc(x, y, s * (0.025 + i * 0.012), 0, TAU);
      ctx.stroke();
      ctx.font = `900 ${s * 0.045}px system-ui`;
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(255,255,255,.15)";
      ctx.fillText("?", x, y + s * 0.014);
    }
    footerLabel("MÁS ALLÁ: EL CONTACTO CÓSMICO", z);
  }

  const SCENES = [
    sceneUnknownHorizon,
    sceneIngredients,
    sceneStellar,
    scenePlanetarySystems,
    sceneHabitableZone,
    sceneRealHabitability,
    scenePrebiotic,
    sceneOrigin,
    sceneSimpleBiospheres,
    sceneComplexLife,
    sceneExtremophiles,
    sceneMars,
    sceneOceanWorlds,
    sceneExoplanets,
    sceneBiosignatures,
    sceneFalsePositives,
    sceneEvolutionaryIntelligence,
    sceneAlienForms,
    sceneTechnosignatures,
    sceneFermi,
    sceneGreatFilter,
    sceneAlienCivilizations,
    sceneCommunication,
    sceneUncertainContact,
    sceneUnknownCosmicLife,
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
