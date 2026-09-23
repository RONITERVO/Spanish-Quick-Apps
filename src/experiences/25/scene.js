import { createSceneAudio } from "../../shared/audio.js";
import { clamp, mix, smooth, fract, seeded, rgba } from "../../shared/math.js";
import {
  requestSceneFrame as requestAnimationFrame,
  cancelSceneFrame as cancelAnimationFrame,
} from "../../shared/animation.js";
import content from "./content.json";
const { ZONES } = content;

export function mountScene() {
  const canvas = document.getElementById("final-horizon-spectrum");
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
      active ? 0.012 - progress * 0.005 : 0.0001,
      now,
      0.09,
    );
    pulseOsc.frequency.setTargetAtTime(base * (1.985 + s.pulse), now, 0.08);
    pulseGain.gain.setTargetAtTime(
      active ? 0.003 - progress * 0.0018 : 0.0001,
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
    master.gain.setTargetAtTime(
      active ? 0.25 - progress * 0.08 : 0.0001,
      now,
      0.09,
    );
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
    filter.frequency.value = Math.max(520, 1800 - zone.scene * 48);
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
      dim = 1 - progress * 0.72,
      motion = 1 - progress * 0.87,
      dark = c.map((v) => Math.round(v * (0.055 + dim * 0.035))),
      mid = c.map((v) => Math.round(v * (0.14 + dim * 0.14)));
    const g = ctx.createLinearGradient(0, height, 0, 0);
    g.addColorStop(
      0,
      `rgb(${Math.max(2, dark[0] - 5)} ${Math.max(3, dark[1] - 4)} ${Math.max(5, dark[2] - 2)})`,
    );
    g.addColorStop(0.56, `rgb(${mid[0]} ${mid[1]} ${mid[2]})`);
    g.addColorStop(
      1,
      `rgb(${Math.round(c[0] * (0.35 + dim * 0.2))} ${Math.round(c[1] * (0.35 + dim * 0.2))} ${Math.round(c[2] * (0.35 + dim * 0.2))})`,
    );
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
    softHalo(
      width * (0.48 + 0.06 * Math.sin(time * 0.035 * motion)),
      height * (0.74 - progress * 0.53),
      Math.max(width, height) * (0.76 - progress * 0.18),
      c,
      0.11 * dim,
    );
    const visibleFraction = 1 - progress * 0.82;
    for (let index = 0; index < particles.length; index++) {
      if (index / particles.length > visibleFraction + 0.08) continue;
      const p = particles[index],
        x =
          fract(p.x + time * 0.0017 * p.speed * motion) * width +
          Math.sin(time * 0.13 * motion + p.phase) * 3,
        y =
          fract(p.y - time * 0.001 * p.speed * motion) * height +
          Math.cos(time * 0.11 * motion + p.phase) * 3,
        col =
          p.kind % 3 === 0
            ? c
            : p.kind % 3 === 1
              ? [255, 244, 215]
              : [132, 226, 255],
        flicker = 0.5 + 0.5 * Math.sin(time * p.speed * motion + p.phase);
      circle(
        x,
        y,
        p.r * (0.72 + (1 - progress) * 0.28),
        rgba(col, (0.035 + 0.15 * flicker) * dim),
      );
    }
    for (let k = 1; k < 8; k++)
      line(
        (k / 8) * width,
        0,
        (k / 8) * width,
        height,
        `rgba(255,255,255,${0.014 * dim})`,
      );
    if (progress > 0.58) {
      const hp = smooth((progress - 0.58) / 0.42),
        y = height * (0.19 + hp * 0.08);
      ctx.setLineDash([2, 8 + hp * 18]);
      line(
        width * 0.06,
        y,
        width * 0.94,
        y,
        rgba([235, 232, 218], 0.08 + hp * 0.14),
        1,
      );
      ctx.setLineDash([]);
    }
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

  function horizonLabels(z) {
    return z.features.map((feature) => {
      const value = feature[0].toLocaleUpperCase("es-ES");
      return value.length > 13 ? `${value.slice(0, 12)}…` : value;
    });
  }

  function drawHorizonPackets(z, time, y = 0.8) {
    const labels = horizonLabels(z),
      selected = selectedFrame(labels),
      s = Math.min(width, height);
    for (let i = 0; i < labels.length; i++) {
      const x = width * (0.085 + i * 0.166);
      drawPacket(
        x,
        height * y,
        s * (i === selected ? 0.069 : 0.054),
        z,
        labels[i],
        i === selected ? 0.94 : 0.27,
      );
    }
    return selected;
  }

  function horizonColor(i) {
    return [
      [246, 220, 180],
      [128, 228, 210],
      [120, 188, 244],
      [190, 150, 240],
      [242, 146, 204],
      [226, 232, 244],
    ][i % 6];
  }

  function drawIdentityCopies(z, selected, time) {
    const s = Math.min(width, height),
      originX = width * 0.5,
      originY = height * 0.68;
    drawAbstractBody(originX, originY, s * 0.075, z, time, selected);
    for (let i = 0; i < 6; i++) {
      const x = width * (0.09 + i * 0.164),
        y = height * (0.24 + Math.abs(i - 2.5) * 0.025),
        chosen = i === selected;
      ctx.strokeStyle = rgba(
        chosen ? [255, 244, 208] : z.color,
        chosen ? 0.7 : 0.14,
      );
      ctx.lineWidth = chosen ? 3 : 1.2;
      ctx.beginPath();
      ctx.moveTo(originX, originY - s * 0.07);
      ctx.bezierCurveTo(
        originX,
        height * 0.49,
        x,
        height * 0.5,
        x,
        y + s * 0.06,
      );
      ctx.stroke();
      drawAbstractBody(
        x,
        y,
        s * (chosen ? 0.056 : 0.043),
        { ...z, color: horizonColor(i) },
        time * (0.7 + i * 0.05),
        i,
      );
    }
  }

  function drawDysonSwarm(cx, cy, r, z, time, selected = 0) {
    drawStar(cx, cy, r * 0.26, [255, 220, 135], time);
    for (let ring = 0; ring < 4; ring++) {
      const rr = r * (0.46 + ring * 0.17),
        count = 10 + ring * 4;
      ctx.strokeStyle = rgba(z.color, 0.1 + ring * 0.025);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rr, rr * (0.46 + ring * 0.05), ring * 0.22, 0, TAU);
      ctx.stroke();
      for (let i = 0; i < count; i++) {
        const a = (i / count) * TAU + time * (0.012 - ring * 0.0015),
          ca = Math.cos(a),
          sa = Math.sin(a),
          rot = ring * 0.22,
          x0 = ca * rr,
          y0 = sa * rr * (0.46 + ring * 0.05),
          x = cx + x0 * Math.cos(rot) - y0 * Math.sin(rot),
          y = cy + x0 * Math.sin(rot) + y0 * Math.cos(rot);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(a + rot);
        ctx.fillStyle = rgba(
          ring === selected % 4 ? [255, 245, 205] : z.color,
          ring === selected % 4 ? 0.78 : 0.32,
        );
        ctx.fillRect(-r * 0.035, -r * 0.012, r * 0.07, r * 0.024);
        ctx.restore();
      }
    }
  }

  function drawBlackHole(cx, cy, r, z, time, active = 0) {
    softHalo(cx, cy, r * 2.3, z.color, 0.1);
    for (let i = 5; i >= 0; i--) {
      const rr = r * (0.72 + i * 0.13),
        squeeze = 0.25 + i * 0.025;
      ctx.strokeStyle = rgba(
        i === active ? [255, 235, 190] : z.color,
        i === active ? 0.72 : 0.14 + i * 0.025,
      );
      ctx.lineWidth = i === active ? 3 : 1.3;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rr, rr * squeeze, time * 0.018 + i * 0.09, 0, TAU);
      ctx.stroke();
    }
    const g = ctx.createRadialGradient(
      cx - r * 0.18,
      cy - r * 0.18,
      0,
      cx,
      cy,
      r * 0.62,
    );
    g.addColorStop(0, "rgba(12,16,24,.98)");
    g.addColorStop(0.72, "rgba(0,0,0,1)");
    g.addColorStop(1, "rgba(0,0,0,.75)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.62, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = rgba([255, 225, 165], 0.42);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.64, 0, TAU);
    ctx.stroke();
  }

  function drawSimulationLayers(z, selected, time) {
    const s = Math.min(width, height),
      layers = 6;
    for (let i = layers - 1; i >= 0; i--) {
      const w = width * (0.28 + i * 0.085),
        h = height * (0.18 + i * 0.045),
        x = width * 0.5 - w * 0.5,
        y = height * (0.18 + i * 0.034),
        chosen = i === selected;
      ctx.fillStyle = rgba(z.color, chosen ? 0.12 : 0.025);
      ctx.strokeStyle = rgba(
        chosen ? [255, 242, 205] : z.color,
        chosen ? 0.7 : 0.14,
      );
      ctx.lineWidth = chosen ? 3 : 1;
      roundedRectPath(x, y, w, h, Math.min(w, h) * 0.06);
      ctx.fill();
      ctx.stroke();
      drawGlyphField(
        x + w * 0.08,
        y + h * 0.14,
        w * 0.84,
        h * 0.56,
        z,
        time * 0.25 + i,
        i,
      );
    }
  }

  function drawWorldPanels(z, selected, time) {
    const s = Math.min(width, height);
    for (let i = 0; i < 6; i++) {
      const col = i % 3,
        row = Math.floor(i / 3),
        w = width * 0.25,
        h = height * 0.22,
        x = width * (0.08 + col * 0.31),
        y = height * (0.18 + row * 0.3),
        active = i === selected;
      drawLensPanel(x, y, w, h, z, horizonLabels(z)[i], active, i, time * 0.35);
    }
  }

  function drawCausalHorizon(z, selected, time) {
    const s = Math.min(width, height),
      cx = width * 0.5,
      cy = height * 0.45;
    for (let i = 0; i < 6; i++) {
      const r = s * (0.065 + i * 0.047),
        active = i === selected;
      ctx.setLineDash(active ? [] : [2, 7 + i * 2]);
      ctx.strokeStyle = rgba(
        active ? [255, 244, 210] : z.color,
        active ? 0.72 : 0.11,
      );
      ctx.lineWidth = active ? 3 : 1.1;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, TAU);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    circle(cx, cy, s * 0.018, rgba([255, 244, 210], 0.8));
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU,
        rr = s * (0.05 + seeded(i + 760) * 0.32),
        fade = 1 - clamp((rr - s * 0.18) / (s * 0.2), 0, 1);
      circle(
        cx + Math.cos(a) * rr,
        cy + Math.sin(a) * rr * 0.75,
        1 + seeded(i + 780) * 2,
        rgba(z.color, 0.08 + 0.28 * fade),
      );
    }
  }

  function drawEnergyBudget(z, selected, time) {
    const s = Math.min(width, height),
      baseY = height * 0.67;
    for (let i = 0; i < 6; i++) {
      const x = width * (0.1 + i * 0.16),
        active = i === selected,
        h = s * (0.11 + 0.28 * (1 - i / 6));
      ctx.fillStyle = rgba(
        active ? [255, 239, 196] : z.color,
        active ? 0.55 : 0.15,
      );
      ctx.fillRect(x - s * 0.025, baseY - h, s * 0.05, h);
      line(x - s * 0.035, baseY, x + s * 0.035, baseY, rgba(z.color, 0.3), 1.5);
      const p = fract(time * (0.05 - i * 0.005) + i * 0.12);
      circle(
        x,
        baseY - h * p,
        s * (active ? 0.013 : 0.008),
        rgba([255, 245, 210], active ? 0.85 : 0.35),
      );
    }
  }

  function drawEntropyField(z, selected, time) {
    const s = Math.min(width, height),
      count = 56;
    for (let i = 0; i < count; i++) {
      const order = 1 - selected / 7,
        gx = (i % 8) / 7,
        gy = Math.floor(i / 8) / 6,
        x =
          width * (0.12 + 0.76 * gx) +
          Math.sin(i * 2.3 + time * 0.03) * s * 0.012 * (1 - order),
        y =
          height * (0.18 + 0.48 * gy) +
          Math.cos(i * 1.7 + time * 0.025) * s * 0.012 * (1 - order),
        alpha = 0.06 + 0.32 * (1 - gy) * (1 - selected / 8);
      circle(
        x,
        y,
        s * (0.004 + 0.006 * seeded(i + 991)),
        rgba(i % 5 ? z.color : [255, 235, 195], alpha),
      );
    }
    ctx.strokeStyle = rgba(z.color, 0.12);
    ctx.beginPath();
    for (let i = 0; i <= 60; i++) {
      const p = i / 60,
        x = width * (0.1 + 0.8 * p),
        y = height * (0.69 - 0.28 * Math.exp(-p * (2 + selected * 0.5)));
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
  }

  function drawHistoryTrace(z, selected, time) {
    const s = Math.min(width, height),
      xs = [0.08, 0.2, 0.32, 0.44, 0.56, 0.68, 0.8, 0.92];
    for (let i = 0; i < xs.length; i++) {
      const x = width * xs[i],
        y = height * (0.6 - 0.045 * i),
        alpha = 0.22 + 0.07 * i;
      if (i === 0) drawStar(x, y, s * 0.032, [255, 220, 145], time);
      else if (i === 1) drawMolecule(x, y, s * 0.042, z, time, 6);
      else if (i === 2) drawPlanet(x, y, s * 0.042, z, time, true);
      else if (i === 3) drawCell(x, y, s * 0.045, z, time, 1);
      else if (i === 4) drawAbstractBody(x, y, s * 0.045, z, time, selected);
      else if (i === 5) drawCivilization(x, y, s * 0.052, z, time, 1);
      else if (i === 6) drawGear(x, y, s * 0.045, 10, z.color, time * 0.02);
      else {
        for (let ring = 0; ring < 4; ring++) {
          ctx.strokeStyle = rgba([232, 228, 210], 0.18 + ring * 0.06);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(x, y, s * (0.018 + ring * 0.012), 0, TAU);
          ctx.stroke();
        }
        circle(x, y, s * 0.008, rgba([245, 240, 218], 0.78));
      }
      if (i < xs.length - 1)
        line(
          x + s * 0.035,
          y,
          width * xs[i + 1] - s * 0.035,
          height * (0.6 - 0.045 * (i + 1)),
          rgba(z.color, alpha),
          1.8,
        );
    }
  }

  function drawBoundaryField(z, selected, time) {
    const s = Math.min(width, height),
      y = height * 0.36;
    ctx.save();
    const g = ctx.createLinearGradient(width * 0.08, 0, width * 0.92, 0);
    g.addColorStop(0, rgba(z.color, 0.05));
    g.addColorStop(0.5, rgba([245, 240, 218], 0.38));
    g.addColorStop(1, rgba(z.color, 0.05));
    ctx.strokeStyle = g;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([2, 8 + selected * 3]);
    ctx.beginPath();
    for (let i = 0; i <= 100; i++) {
      const p = i / 100,
        x = width * (0.07 + 0.86 * p),
        jitter =
          Math.sin(p * TAU * (4 + selected) + time * 0.02) *
          s *
          0.012 *
          (1 - p * 0.6),
        yy = y + jitter;
      i ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy);
    }
    ctx.stroke();
    ctx.restore();
    ctx.setLineDash([]);
    for (let i = 0; i < 36; i++) {
      const x = width * (0.08 + 0.84 * seeded(i + 1180)),
        yy = y - s * (0.02 + 0.24 * seeded(i + 1210)),
        fade = 1 - seeded(i + 1240) * 0.85;
      circle(
        x,
        yy,
        1 + seeded(i + 1260) * 2,
        rgba(i % 4 ? z.color : [255, 245, 220], 0.04 + 0.18 * fade),
      );
    }
    ctx.fillStyle = "rgba(0,0,0,.36)";
    ctx.fillRect(0, y + s * 0.035, width, height - y);
  }

  function drawHorizonScene(z, time, mode) {
    const labels = horizonLabels(z),
      selected = selectedFrame(labels),
      s = Math.min(width, height);
    switch (mode) {
      case 0: {
        drawBranching(
          width * 0.5,
          height * 0.72,
          height * 0.2,
          z,
          time,
          7,
          0.88,
        );
        for (let i = 0; i < 6; i++) {
          const x = width * (0.09 + i * 0.164),
            active = i === selected;
          drawCivilization(
            x,
            height * 0.72,
            s * (active ? 0.067 : 0.047),
            { ...z, color: horizonColor(i) },
            time + i,
            i % 3,
          );
          labelAt(
            labels[i],
            x,
            height * 0.86,
            s * 0.011,
            `rgba(255,255,255,${active ? 0.88 : 0.28})`,
          );
        }
        drawPacket(width * 0.5, height * 0.72, s * 0.09, z, "HISTORIA", 0.86);
        footerLabel("NINGÚN FUTURO ES INEVITABLE", z);
        break;
      }
      case 1: {
        drawCell(width * 0.34, height * 0.42, s * 0.14, z, time, selected % 3);
        drawGear(
          width * 0.66,
          height * 0.42,
          s * 0.12,
          12,
          z.color,
          time * 0.035,
        );
        for (let i = 0; i < 8; i++) {
          const p = fract(time * 0.025 + i / 8);
          circle(
            mix(width * 0.42, width * 0.58, p),
            height * 0.42 + Math.sin(p * TAU * 2 + i) * s * 0.035,
            2,
            rgba([255, 242, 205], 0.48),
          );
        }
        drawHorizonPackets(z, time, 0.8);
        footerLabel("SUPERAR UN LÍMITE CREA NUEVAS DEPENDENCIAS", z);
        break;
      }
      case 2: {
        drawAbstractBody(
          width * 0.5,
          height * 0.38,
          s * 0.12,
          z,
          time,
          selected,
        );
        for (let i = 0; i < 6; i++) {
          const r = s * (0.09 + i * 0.043),
            active = i === selected;
          ctx.strokeStyle = rgba(
            active ? [255, 242, 204] : z.color,
            active ? 0.72 : 0.12,
          );
          ctx.lineWidth = active ? 3 : 1;
          ctx.beginPath();
          ctx.arc(width * 0.5, height * 0.38, r, 0, TAU);
          ctx.stroke();
        }
        drawWaveform(
          width * 0.12,
          height * 0.64,
          width * 0.76,
          height * 0.12,
          z,
          time,
          selected % 4,
        );
        drawHorizonPackets(z, time, 0.83);
        footerLabel("REDISEÑAR LA MENTE CAMBIA TAMBIÉN SUS VALORES", z);
        break;
      }
      case 3: {
        drawIdentityCopies(z, selected, time);
        drawHorizonPackets(z, time, 0.84);
        footerLabel("COPIAR UN PATRÓN NO PRUEBA CONTINUIDAD SUBJETIVA", z);
        break;
      }
      case 4: {
        const xs = [0.13, 0.28, 0.43, 0.58, 0.73, 0.88];
        for (let i = 0; i < 6; i++) {
          const x = width * xs[i],
            active = i === selected;
          if (i < 2)
            drawCell(
              x,
              height * 0.42,
              s * (active ? 0.075 : 0.055),
              { ...z, color: horizonColor(i) },
              time,
              i,
            );
          else if (i < 4)
            drawAbstractBody(
              x,
              height * 0.42,
              s * (active ? 0.07 : 0.052),
              { ...z, color: horizonColor(i) },
              time,
              i,
            );
          else
            drawNetwork(
              x,
              height * 0.42,
              s * (active ? 0.085 : 0.062),
              { ...z, color: horizonColor(i) },
              time,
              12 + i,
            );
          if (i < 5)
            line(
              x + s * 0.06,
              height * 0.42,
              width * xs[i + 1] - s * 0.06,
              height * 0.42,
              rgba(z.color, 0.19),
              2,
            );
        }
        drawHorizonPackets(z, time, 0.8);
        footerLabel("DURABILIDAD NO EQUIVALE AUTOMÁTICAMENTE A PROGRESO", z);
        break;
      }
      case 5: {
        const cx = width * 0.5,
          cy = height * 0.42;
        for (let i = 0; i < 6; i++) {
          const r = s * (0.065 + i * 0.047),
            active = i === selected;
          ctx.strokeStyle = rgba(
            active ? [255, 244, 210] : z.color,
            active ? 0.7 : 0.12,
          );
          ctx.lineWidth = active ? 3 : 1;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, TAU);
          ctx.stroke();
          const p = fract(time * (0.09 / (i + 1)) + i * 0.13);
          circle(
            cx + Math.cos(p * TAU) * r,
            cy + Math.sin(p * TAU) * r,
            s * (active ? 0.015 : 0.009),
            rgba([255, 242, 205], active ? 0.85 : 0.38),
          );
        }
        drawHorizonPackets(z, time, 0.81);
        footerLabel("UNA VIDA PUEDE DESVINCULARSE DEL RITMO BIOLÓGICO", z);
        break;
      }
      case 6: {
        drawNetwork(width * 0.5, height * 0.42, s * 0.31, z, time * 0.4, 36);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU - Math.PI / 2,
            x = width * 0.5 + Math.cos(a) * s * 0.31,
            y = height * 0.42 + Math.sin(a) * s * 0.22,
            active = i === selected;
          drawCivilization(
            x,
            y,
            s * (active ? 0.06 : 0.042),
            { ...z, color: horizonColor(i) },
            time + i,
            i % 3,
          );
        }
        drawHorizonPackets(z, time, 0.82);
        footerLabel("UNA GALAXIA CONECTADA NO PUEDE SER SINCRÓNICA", z);
        break;
      }
      case 7: {
        drawDysonSwarm(width * 0.5, height * 0.42, s * 0.28, z, time, selected);
        drawHorizonPackets(z, time, 0.82);
        footerLabel("REORGANIZAR MATERIA NO ABOLIR LAS LEYES FÍSICAS", z);
        break;
      }
      case 8: {
        drawBlackHole(width * 0.28, height * 0.4, s * 0.12, z, time, selected);
        drawSimulationLayers(z, selected, time * 0.35);
        drawHorizonPackets(z, time, 0.84);
        footerLabel("EL MUNDO VIVIDO Y EL SUSTRATO SON CAPAS DISTINTAS", z);
        break;
      }
      case 9: {
        drawWorldPanels(z, selected, time);
        footerLabel("EL CONCEPTO DE MUNDO SE VUELVE PLURAL", z);
        break;
      }
      case 10: {
        drawAbstractBody(
          width * 0.28,
          height * 0.4,
          s * 0.09,
          z,
          time,
          selected,
        );
        drawAbstractBody(
          width * 0.72,
          height * 0.4,
          s * 0.09,
          { ...z, color: [242, 160, 210] },
          -time,
          5 - selected,
        );
        drawNetwork(width * 0.5, height * 0.4, s * 0.18, z, time * 0.4, 22);
        for (let i = 0; i < 6; i++) {
          const y = height * (0.2 + i * 0.085),
            active = i === selected;
          ctx.strokeStyle = rgba(
            active ? [255, 244, 210] : z.color,
            active ? 0.7 : 0.1,
          );
          ctx.lineWidth = active ? 3 : 1;
          ctx.beginPath();
          ctx.moveTo(width * 0.36, y);
          ctx.bezierCurveTo(
            width * 0.44,
            y + s * 0.035 * Math.sin(i),
            width * 0.56,
            y - s * 0.035 * Math.sin(i),
            width * 0.64,
            y,
          );
          ctx.stroke();
        }
        drawHorizonPackets(z, time, 0.82);
        footerLabel("INDIVIDUO Y COLECTIVO DEJAN DE SER FRONTERAS FIJAS", z);
        break;
      }
      case 11: {
        for (let i = 0; i < 6; i++) {
          const x = width * (0.09 + i * 0.164),
            active = i === selected;
          drawLensPanel(
            x - s * 0.06,
            height * 0.25,
            s * 0.12,
            s * 0.28,
            z,
            labels[i],
            active,
            i,
            time * 0.25,
          );
        }
        drawWaveform(
          width * 0.1,
          height * 0.66,
          width * 0.8,
          height * 0.1,
          z,
          time,
          selected % 4,
        );
        footerLabel("DETECTAR NO ES LO MISMO QUE PODER EXPERIMENTAR", z);
        break;
      }
      case 12: {
        ctx.save();
        ctx.globalAlpha = 0.3;
        drawGlyphField(
          width * 0.08,
          height * 0.13,
          width * 0.84,
          height * 0.48,
          z,
          time * 0.2,
          selected,
        );
        ctx.restore();
        for (let i = 0; i < 6; i++) {
          const x = width * (0.1 + i * 0.16),
            h = s * (0.08 + 0.19 * (1 - i / 7)),
            active = i === selected;
          ctx.strokeStyle = rgba(
            active ? [255, 244, 205] : z.color,
            active ? 0.75 : 0.15,
          );
          ctx.lineWidth = active ? 3 : 1;
          ctx.strokeRect(x - s * 0.035, height * 0.68 - h, s * 0.07, h);
        }
        drawHorizonPackets(z, time, 0.84);
        footerLabel("MÁS INTELIGENCIA NO PRODUCE OMNISCIENCIA", z);
        break;
      }
      case 13: {
        drawCausalHorizon(z, selected, time);
        drawHorizonPackets(z, time, 0.82);
        footerLabel("NO SABIDO TODAVÍA ≠ INACCESIBLE EN PRINCIPIO", z);
        break;
      }
      case 14: {
        const cx = width * 0.48,
          cy = height * 0.44;
        for (let i = 0; i < 32; i++) {
          const a = (i / 32) * TAU,
            rr = s * (0.08 + seeded(i + 1410) * 0.3),
            fade = 1 - clamp((rr - s * 0.17) / (s * 0.22), 0, 1);
          circle(
            cx + Math.cos(a) * rr,
            cy + Math.sin(a) * rr * 0.68,
            1 + seeded(i + 1430) * 3,
            rgba(i % 5 ? z.color : [255, 235, 190], 0.04 + 0.45 * fade),
          );
        }
        ctx.strokeStyle = rgba([242, 236, 215], 0.5);
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(cx, cy, s * 0.19, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = "rgba(0,0,0,.38)";
        ctx.fillRect(cx + s * 0.2, 0, width - (cx + s * 0.2), height);
        drawHorizonPackets(z, time, 0.82);
        footerLabel("EL UNIVERSO OBSERVABLE PUEDE ENCOGER LOCALMENTE", z);
        break;
      }
      case 15: {
        const islands = [
          [0.2, 0.42],
          [0.5, 0.28],
          [0.8, 0.48],
        ];
        for (let k = 0; k < 3; k++) {
          drawNetwork(
            width * islands[k][0],
            height * islands[k][1],
            s * 0.09,
            { ...z, color: horizonColor(k * 2) },
            time * 0.2,
            12,
          );
          circle(
            width * islands[k][0],
            height * islands[k][1],
            s * 0.12,
            "rgba(0,0,0,0)",
            rgba(z.color, 0.18),
            1,
          );
        }
        for (let k = 0; k < 2; k++) {
          ctx.setLineDash([3, 12]);
          line(
            width * islands[k][0] + s * 0.1,
            height * islands[k][1],
            width * islands[k + 1][0] - s * 0.1,
            height * islands[k + 1][1],
            rgba(z.color, 0.11),
            1,
          );
          ctx.setLineDash([]);
        }
        drawHorizonPackets(z, time, 0.83);
        footerLabel(
          "UN COSMOS COMPARTIDO PUEDE VOLVERSE MUCHOS COSMOS AISLADOS",
          z,
        );
        break;
      }
      case 16: {
        drawEnergyBudget(z, selected, time);
        drawHorizonPackets(z, time, 0.82);
        footerLabel("ENERGÍA TOTAL NO EQUIVALE A TRABAJO DISPONIBLE", z);
        break;
      }
      case 17: {
        drawStar(
          width * 0.18,
          height * 0.35,
          s * 0.055,
          [255, 182, 120],
          time * 0.2,
        );
        drawPlanet(
          width * 0.36,
          height * 0.44,
          s * 0.045,
          { ...z, color: [150, 170, 190] },
          time,
          false,
        );
        drawBlackHole(
          width * 0.68,
          height * 0.4,
          s * 0.09,
          z,
          time * 0.15,
          selected % 6,
        );
        for (let i = 0; i < 12; i++) {
          const x = width * (0.08 + 0.84 * seeded(i + 1500)),
            y = height * (0.18 + 0.48 * seeded(i + 1530));
          circle(
            x,
            y,
            1 + seeded(i + 1560) * 2,
            rgba(z.color, 0.09 + 0.13 * (1 - i / 12)),
          );
        }
        drawHorizonPackets(z, time, 0.82);
        footerLabel("LA INTELIGENCIA ACTÚA DENTRO DEL DECLIVE CÓSMICO", z);
        break;
      }
      case 18: {
        drawBlackHole(
          width * 0.5,
          height * 0.4,
          s * 0.12,
          z,
          time * 0.12,
          selected,
        );
        for (let i = 0; i < 18; i++) {
          const p = fract(time * 0.012 + i / 18),
            a = p * TAU * 1.3,
            x = width * 0.5 + Math.cos(a) * s * (0.14 + 0.18 * p),
            y = height * 0.4 + Math.sin(a) * s * (0.05 + 0.08 * p);
          circle(
            x,
            y,
            1.4,
            rgba(i % 3 ? z.color : [255, 236, 190], 0.18 + 0.3 * (1 - p)),
          );
        }
        ctx.save();
        ctx.globalAlpha = 0.22;
        drawGlyphField(
          width * 0.1,
          height * 0.64,
          width * 0.8,
          height * 0.1,
          z,
          time * 0.1,
          selected,
        );
        ctx.restore();
        drawHorizonPackets(z, time, 0.84);
        footerLabel("PRESERVAR UN PATRÓN NO GARANTIZA PODER RECUPERARLO", z);
        break;
      }
      case 19: {
        drawEntropyField(z, selected, time);
        drawHorizonPackets(z, time, 0.82);
        footerLabel("LA MUERTE TÉRMICA ES PÉRDIDA DE GRADIENTES ÚTILES", z);
        break;
      }
      case 20: {
        drawBranching(
          width * 0.5,
          height * 0.7,
          height * 0.22,
          z,
          time * 0.08,
          6,
          0.86,
        );
        softHalo(width * 0.5, height * 0.18, s * 0.2, z.color, 0.06);
        ctx.save();
        ctx.globalAlpha = 0.26;
        drawGlyphField(
          width * 0.13,
          height * 0.16,
          width * 0.74,
          height * 0.31,
          z,
          time * 0.08,
          selected,
        );
        ctx.restore();
        drawHorizonPackets(z, time, 0.84);
        footerLabel("INCERTIDUMBRE NO ES UNA PROMESA DE ESCAPE", z);
        break;
      }
      case 21: {
        for (let i = 0; i < 24; i++) {
          const x = seeded(i + 1650) * width,
            y = seeded(i + 1680) * height * 0.64 + height * 0.08,
            fade = (1 - i / 24) * 0.28;
          circle(
            x,
            y,
            1 + seeded(i + 1710) * 2.5,
            rgba(i % 4 ? z.color : [230, 225, 205], fade),
          );
        }
        ctx.setLineDash([2, 14]);
        line(
          width * 0.08,
          height * 0.68,
          width * 0.92,
          height * 0.68,
          rgba(z.color, 0.14),
          1,
        );
        ctx.setLineDash([]);
        drawHorizonPackets(z, time, 0.82);
        footerLabel("LOS PROCESOS CONTINÚAN AUNQUE NADIE LOS VIVA", z);
        break;
      }
      case 22: {
        const icons = [0, 1, 2, 3, 4, 5];
        for (let i = 0; i < 6; i++) {
          const x = width * (0.09 + i * 0.164),
            active = i === selected;
          if (i === 0)
            drawBranching(
              x,
              height * 0.53,
              height * 0.31,
              { ...z, color: horizonColor(i) },
              time * 0.08,
              3,
              0.11,
            );
          else if (i === 1)
            drawGlyphField(
              x - s * 0.05,
              height * 0.35,
              s * 0.1,
              s * 0.16,
              { ...z, color: horizonColor(i) },
              time * 0.08,
              i,
            );
          else if (i === 2)
            drawCell(
              x,
              height * 0.45,
              s * (active ? 0.055 : 0.04),
              { ...z, color: horizonColor(i) },
              time,
              i,
            );
          else if (i === 3)
            drawDysonSwarm(
              x,
              height * 0.44,
              s * 0.07,
              { ...z, color: horizonColor(i) },
              time * 0.08,
              i,
            );
          else if (i === 4)
            drawAbstractBody(
              x,
              height * 0.44,
              s * (active ? 0.055 : 0.042),
              { ...z, color: horizonColor(i) },
              time,
              i,
            );
          else
            drawPlanet(
              x,
              height * 0.44,
              s * (active ? 0.05 : 0.038),
              { ...z, color: horizonColor(i) },
              time,
              true,
            );
        }
        drawHorizonPackets(z, time, 0.8);
        footerLabel("UNA CONSECUENCIA REAL NO NECESITA SER ETERNA", z);
        break;
      }
      case 23: {
        drawHistoryTrace(z, selected, time * 0.12);
        drawHorizonPackets(z, time, 0.82);
        footerLabel(
          "UNA SOLA HISTORIA · MUCHOS NIVELES · LÍMITES DESDE DENTRO",
          z,
        );
        break;
      }
      case 24: {
        drawBoundaryField(z, selected, time * 0.08);
        softHalo(width * 0.5, height * 0.25, s * 0.2, [245, 240, 218], 0.05);
        drawHorizonPackets(z, time, 0.81);
        footerLabel(
          "LA EXISTENCIA PERMANECE INCOMPLETA PARA TODA PERSPECTIVA INTERIOR",
          z,
        );
        break;
      }
    }
  }

  function colorsForMeaning(i) {
    return horizonColor(i);
  }

  const SCENES = Array.from(
    { length: ZONES.length },
    (_, index) => (zone, time) => drawHorizonScene(zone, time, index),
  );

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
      SCENES[z.scene](z, time * (1 - 0.82 * z.p0));
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
