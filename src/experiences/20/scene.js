import {
  readNarrationTarget,
  setReadoutRegion,
} from "../../shared/narration-target.js";
import { createSceneAudio } from "../../shared/audio.js";
import { clamp, mix, smooth, fract, seeded, rgba } from "../../shared/math.js";
import {
  requestSceneFrame as requestAnimationFrame,
  cancelSceneFrame as cancelAnimationFrame,
} from "../../shared/animation.js";
import content from "./content.json";
const { ZONES } = content;

export function mountScene() {
  const canvas = document.getElementById("futures-spectrum");
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
      setReadoutRegion(readout, zone.id);
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
            ...readNarrationTarget(),
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

  function sceneFuturesStart(z, time) {
    const s = Math.min(width, height),
      cx = width * 0.5,
      cy = height * 0.72,
      r = s * 0.17;
    drawPlanet(cx, cy, r, z, time, true);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + time * 0.035,
        rr = r * (1.45 + (i % 2) * 0.2);
      drawSatellite(
        cx + Math.cos(a) * rr,
        cy + Math.sin(a) * rr * 0.5,
        s * 0.12,
        z,
        a + Math.PI * 0.5,
      );
    }
    drawBranching(cx, cy - r * 0.55, height * 0.15, z, time, 9, 0.85);
    ctx.font = `900 ${s * 0.026}px system-ui`;
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,.62)";
    ctx.fillText("ESCENARIOS, NO PROFECÍAS", cx, height * 0.93);
  }
  function sceneEnergy(z, time) {
    const s = Math.min(width, height),
      ground = height * 0.78;
    drawStar(width * 0.18, height * 0.25, s * 0.075, [255, 220, 100], time);
    for (let i = 0; i < 4; i++) {
      const x = width * (0.38 + i * 0.15);
      line(x, ground, x, height * 0.44, rgba([225, 235, 245], 0.52), 3);
      ctx.save();
      ctx.translate(x, height * 0.44);
      ctx.rotate(time * 0.18 + i);
      for (let k = 0; k < 3; k++) {
        ctx.rotate(TAU / 3);
        line(0, 0, s * 0.09, 0, rgba([245, 250, 255], 0.72), 3);
      }
      ctx.restore();
    }
    for (let i = 0; i < 8; i++) {
      const x = width * (0.07 + i * 0.11),
        y = ground - s * (0.01 + (i % 2) * 0.04);
      polygon(
        [
          [x - s * 0.045, y],
          [x + s * 0.045, y],
          [x + s * 0.035, y + s * 0.055],
          [x - s * 0.055, y + s * 0.055],
        ],
        rgba([70, 165, 240], 0.38),
        rgba(z.color, 0.62),
        1,
      );
    }
    const bx = width * 0.5,
      by = height * 0.2,
      w = s * 0.25,
      h = s * 0.1;
    ctx.fillStyle = "rgba(10,20,35,.55)";
    roundedRectPath(bx - w * 0.5, by - h * 0.5, w, h, h * 0.18);
    ctx.fill();
    ctx.strokeStyle = rgba(z.color, 0.7);
    ctx.stroke();
    ctx.fillStyle = rgba(z.color, 0.38);
    ctx.fillRect(
      bx - w * 0.38,
      by - h * 0.28,
      w * (0.15 + 0.6 * (0.5 + 0.5 * Math.sin(time * 0.4))),
      h * 0.56,
    );
    line(
      width * 0.08,
      ground + s * 0.06,
      width * 0.92,
      ground + s * 0.06,
      rgba(z.color, 0.34),
      4,
    );
    for (let i = 0; i < 12; i++)
      circle(
        width * (0.08 + i * 0.075),
        ground + s * 0.06,
        2 + (i % 2),
        rgba([255, 245, 190], 0.6),
      );
  }
  function sceneAutomation(z, time) {
    const s = Math.min(width, height),
      base = height * 0.76;
    line(width * 0.05, base, width * 0.95, base, rgba(z.color, 0.35), 5);
    for (let i = 0; i < 7; i++) {
      const p = fract(time * (0.08 + i * 0.008) + i * 0.14),
        x = width * (0.05 + p * 0.9),
        w = s * 0.07,
        h = s * 0.045;
      ctx.fillStyle = rgba(i % 2 ? z.color : [120, 205, 255], 0.34);
      roundedRectPath(x - w * 0.5, base - h, w, h, h * 0.18);
      ctx.fill();
      ctx.strokeStyle = rgba([255, 255, 255], 0.42);
      ctx.stroke();
    }
    const joints = [
      [width * 0.28, base],
      [width * 0.3, base - s * 0.18],
      [width * 0.48, base - s * 0.29],
      [width * 0.63, base - s * 0.2],
    ];
    ctx.lineCap = "round";
    for (let i = 0; i < joints.length - 1; i++)
      line(
        joints[i][0],
        joints[i][1],
        joints[i + 1][0],
        joints[i + 1][1],
        rgba([220, 230, 240], 0.62),
        s * 0.05,
      );
    for (const p of joints)
      circle(p[0], p[1], s * 0.04, "rgba(8,16,28,.82)", rgba(z.color, 0.72), 2);
    for (let i = 0; i < 9; i++) {
      const x = width * (0.08 + i * 0.105),
        y = height * 0.25 + Math.sin(time * 0.7 + i) * s * 0.018;
      drawGear(
        x,
        y,
        s * (0.03 + (i % 3) * 0.012),
        9 + (i % 4),
        rgba(z.color, 0.48),
        time * (i % 2 ? 0.2 : -0.16) + i,
      );
    }
  }
  function sceneAdvancedAI(z, time) {
    const s = Math.min(width, height),
      cx = width * 0.5,
      cy = height * 0.49;
    softHalo(cx, cy, s * 0.42, z.color, 0.2);
    drawNetwork(cx, cy, s * 0.33, z, time, 24);
    for (let r = 1; r <= 4; r++) {
      ctx.strokeStyle = rgba(z.color, 0.09 / r);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, s * (0.06 + r * 0.055), 0, TAU);
      ctx.stroke();
    }
    circle(cx, cy, s * 0.055, "rgba(255,255,255,.14)", rgba(z.color, 0.85), 2);
    for (let i = 0; i < 24; i++) {
      ctx.font = `800 ${s * 0.023}px ui-monospace, monospace`;
      ctx.textAlign = "center";
      ctx.fillStyle = rgba(i % 2 ? z.color : [255, 255, 255], 0.12);
      ctx.fillText(
        glyphs[i].char,
        width * (0.05 + seeded(i + 40) * 0.9),
        height * (0.08 + seeded(i + 70) * 0.82),
      );
    }
    ctx.font = `900 ${s * 0.025}px system-ui`;
    ctx.fillStyle = "rgba(255,255,255,.55)";
    ctx.fillText("CAPACIDAD ≠ CONCIENCIA ≠ CONTROL", cx, height * 0.91);
  }
  function sceneFutureBiotech(z, time) {
    const s = Math.min(width, height),
      cx = width * 0.5,
      cy = height * 0.5,
      r = s * 0.27;
    for (let i = 0; i <= 42; i++) {
      const t = i / 42,
        yy = cy - r + t * r * 2,
        phase = t * TAU * 3 + time * 0.45,
        x1 = cx + Math.sin(phase) * r * 0.38,
        x2 = cx - Math.sin(phase) * r * 0.38;
      circle(x1, yy, s * 0.011, rgba(z.color, 0.72));
      circle(x2, yy, s * 0.011, rgba([255, 195, 235], 0.67));
      if (i % 3 === 0) line(x1, yy, x2, yy, "rgba(255,255,255,.2)", 1.2);
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + time * 0.025,
        rr = s * 0.35,
        x = cx + Math.cos(a) * rr,
        y = cy + Math.sin(a) * rr * 0.66;
      circle(
        x,
        y,
        s * (0.023 + (i % 3) * 0.007),
        rgba(i % 2 ? z.color : [125, 225, 255], 0.13),
        rgba(i % 2 ? z.color : [255, 225, 245], 0.48),
        1.3,
      );
      for (let k = 0; k < 4; k++) {
        const aa = (k / 4) * TAU + time * 0.12;
        circle(
          x + Math.cos(aa) * s * 0.014,
          y + Math.sin(aa) * s * 0.014,
          s * 0.0035,
          rgba([255, 255, 255], 0.55),
        );
      }
    }
  }
  function sceneHumanMachine(z, time) {
    const s = Math.min(width, height),
      cx = width * 0.43,
      cy = height * 0.48;
    circle(
      cx,
      cy - s * 0.17,
      s * 0.065,
      "rgba(220,235,245,.16)",
      rgba(z.color, 0.7),
      2,
    );
    ctx.strokeStyle = rgba([225, 235, 245], 0.55);
    ctx.lineWidth = s * 0.04;
    ctx.lineCap = "round";
    line(cx, cy - s * 0.1, cx, cy + s * 0.17, ctx.strokeStyle, ctx.lineWidth);
    line(cx, cy, cx - s * 0.16, cy + s * 0.08, ctx.strokeStyle, ctx.lineWidth);
    line(
      cx,
      cy,
      cx + s * 0.17,
      cy + s * 0.03,
      rgba(z.color, 0.75),
      ctx.lineWidth,
    );
    line(
      cx,
      cy + s * 0.16,
      cx - s * 0.12,
      cy + s * 0.35,
      ctx.strokeStyle,
      ctx.lineWidth,
    );
    line(
      cx,
      cy + s * 0.16,
      cx + s * 0.13,
      cy + s * 0.35,
      rgba(z.color, 0.75),
      ctx.lineWidth,
    );
    for (let i = 0; i < 6; i++) {
      const x = width * 0.72 + Math.cos((i / 6) * TAU + time * 0.12) * s * 0.13,
        y = height * 0.42 + Math.sin((i / 6) * TAU + time * 0.12) * s * 0.18;
      circle(x, y, s * 0.018, rgba(z.color, 0.72));
      line(cx + s * 0.17, cy + s * 0.03, x, y, rgba(z.color, 0.12), 1.2);
    }
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + time * 0.09,
        x = cx + Math.cos(a) * s * 0.28,
        y = cy + Math.sin(a) * s * 0.22;
      circle(x, y, 2 + (i % 2), rgba([255, 245, 205], 0.52));
    }
  }
  function sceneSustainable(z, time) {
    const s = Math.min(width, height),
      ground = height * 0.8;
    for (let i = 0; i < 11; i++) {
      const x = width * (0.05 + i * 0.09),
        h = s * (0.08 + (i % 5) * 0.025);
      drawBuilding(
        x,
        ground,
        s * (0.035 + (i % 3) * 0.01),
        h,
        rgba(z.color, 0.35),
        0.58,
      );
      ctx.fillStyle = rgba([80, 205, 130], 0.4);
      ctx.fillRect(x - s * 0.018, ground - h - s * 0.015, s * 0.036, s * 0.015);
    }
    for (let i = 0; i < 7; i++) {
      const x = width * (0.12 + i * 0.13),
        y = ground + s * 0.045;
      line(x, y, x, y - s * 0.09, rgba([155, 110, 70], 0.6), 3);
      circle(
        x,
        y - s * 0.11,
        s * 0.038,
        rgba([95, 230, 135], 0.34),
        rgba(z.color, 0.55),
        1.2,
      );
    }
    const cx = width * 0.5,
      cy = height * 0.3,
      r = s * 0.15;
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = rgba(z.color, 0.36);
      ctx.lineWidth = s * 0.018;
      ctx.beginPath();
      ctx.arc(cx, cy, r, (i * TAU) / 3 + 0.35, ((i + 1) * TAU) / 3 - 0.12);
      ctx.stroke();
      const a = ((i + 1) * TAU) / 3 - 0.12;
      polygon(
        [
          [cx + Math.cos(a) * r, cy + Math.sin(a) * r],
          [
            cx + Math.cos(a - 0.23) * r * 0.9,
            cy + Math.sin(a - 0.23) * r * 0.9,
          ],
          [
            cx + Math.cos(a + 0.12) * r * 0.87,
            cy + Math.sin(a + 0.12) * r * 0.87,
          ],
        ],
        rgba(z.color, 0.48),
      );
    }
    ctx.font = `900 ${s * 0.025}px system-ui`;
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,.57)";
    ctx.fillText("BIENESTAR DENTRO DE LÍMITES", cx, height * 0.93);
  }
  function sceneInequality(z, time) {
    const s = Math.min(width, height),
      mid = width * 0.5,
      ground = height * 0.82;
    ctx.fillStyle = "rgba(255,210,120,.035)";
    ctx.fillRect(0, 0, mid, height);
    ctx.fillStyle = "rgba(20,25,40,.28)";
    ctx.fillRect(mid, 0, mid, height);
    line(mid, height * 0.08, mid, height * 0.92, "rgba(255,255,255,.22)", 2);
    for (let i = 0; i < 8; i++) {
      const x = width * (0.05 + i * 0.055),
        h = s * (0.12 + (i % 4) * 0.05);
      drawBuilding(x, ground, s * 0.042, h, rgba([255, 210, 125], 0.55), 0.8);
    }
    for (let i = 0; i < 7; i++) {
      const x = width * (0.57 + i * 0.06),
        h = s * (0.07 + (i % 3) * 0.03);
      drawBuilding(x, ground, s * 0.038, h, rgba(z.color, 0.22), 0.15);
    }
    for (let i = 0; i < 10; i++) {
      const p = fract(time * 0.08 + i * 0.1),
        y = height * (0.18 + p * 0.56);
      line(mid - s * 0.06, y, mid + s * 0.06, y, rgba(z.color, 0.26), 1.5);
    }
    ctx.font = `900 ${s * 0.028}px system-ui`;
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,.55)";
    ctx.fillText("CAPACIDAD", mid * 0.5, height * 0.16);
    ctx.fillText("ACCESO", mid + mid * 0.5, height * 0.16);
  }
  function sceneRisks(z, time) {
    const s = Math.min(width, height),
      cx = width * 0.5,
      cy = height * 0.5,
      r = s * 0.2;
    drawPlanet(cx, cy, r, z, time, true);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + time * 0.02,
        rr = s * 0.34,
        x = cx + Math.cos(a) * rr,
        y = cy + Math.sin(a) * rr * 0.72;
      drawRiskSymbol(
        x,
        y,
        s * 0.04,
        z,
        ["!", "☢", "△", "×", "⚠", "⌁", "◉", "+"][i],
      );
      line(
        cx + Math.cos(a) * r,
        cy + Math.sin(a) * r * 0.72,
        x,
        y,
        rgba(z.color, 0.16),
        1.5,
      );
    }
    for (let k = 0; k < 3; k++) {
      ctx.strokeStyle = rgba(z.color, 0.08 + k * 0.035);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(
        cx,
        cy,
        r * (1.25 + k * 0.25) + Math.sin(time * 0.7 + k) * 3,
        0,
        TAU,
      );
      ctx.stroke();
    }
  }
  function sceneGovernance(z, time) {
    const s = Math.min(width, height),
      cx = width * 0.5,
      cy = height * 0.5,
      r = s * 0.28;
    circle(cx, cy, s * 0.075, "rgba(255,255,255,.08)", rgba(z.color, 0.7), 2);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU - time * 0.025,
        x = cx + Math.cos(a) * r,
        y = cy + Math.sin(a) * r * 0.68;
      circle(
        x,
        y,
        s * 0.027,
        rgba(i % 3 ? z.color : [255, 220, 130], 0.3),
        rgba([255, 255, 255], 0.42),
        1.2,
      );
      line(x, y, cx, cy, rgba(z.color, 0.13), 1.2);
      for (let j = i + 1; j < 12; j++)
        if ((i + j) % 7 === 0) {
          const b = (j / 12) * TAU - time * 0.025;
          line(
            x,
            y,
            cx + Math.cos(b) * r,
            cy + Math.sin(b) * r * 0.68,
            rgba(z.color, 0.07),
            1,
          );
        }
    }
    ctx.font = `900 ${s * 0.027}px system-ui`;
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,.6)";
    ctx.fillText("COOPERACIÓN · LEGITIMIDAD · CUMPLIMIENTO", cx, height * 0.91);
  }
  function sceneSpaceIndustry(z, time) {
    const s = Math.min(width, height),
      cx = width * 0.35,
      cy = height * 0.6,
      r = s * 0.16;
    drawPlanet(cx, cy, r, z, time, true);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + time * (0.035 + i * 0.002),
        rr = r * (1.5 + (i % 3) * 0.25);
      drawSatellite(
        cx + Math.cos(a) * rr,
        cy + Math.sin(a) * rr * 0.55,
        s * 0.09,
        z,
        a + Math.PI * 0.5,
      );
    }
    const moonX = width * 0.78,
      moonY = height * 0.34;
    drawPlanet(moonX, moonY, s * 0.1, { color: [205, 208, 214] }, time, false);
    drawHabitat(moonX, moonY + s * 0.1, s * 0.55, z, 2);
    for (let i = 0; i < 4; i++) {
      const p = fract(time * 0.045 + i * 0.23),
        x = mix(cx, moonX, p),
        y = mix(cy, moonY, p) - Math.sin(p * Math.PI) * s * 0.2;
      polygon(
        [
          [x - s * 0.02, y],
          [x + s * 0.025, y],
          [x + s * 0.04, y + s * 0.012],
          [x - s * 0.035, y + s * 0.012],
        ],
        rgba(z.color, 0.55),
        rgba([255, 255, 255], 0.5),
        1,
      );
    }
  }
  function sceneSettlements(z, time) {
    const s = Math.min(width, height),
      horizon = height * 0.65;
    const g = ctx.createLinearGradient(0, horizon, 0, height);
    g.addColorStop(0, "rgba(120,75,55,.08)");
    g.addColorStop(1, "rgba(180,90,55,.32)");
    ctx.fillStyle = g;
    ctx.fillRect(0, horizon, width, height - horizon);
    ctx.strokeStyle = "rgba(255,200,160,.26)";
    ctx.beginPath();
    ctx.moveTo(0, horizon);
    for (let x = 0; x <= width; x += width / 12)
      ctx.lineTo(
        x,
        horizon -
          Math.sin(x * 0.018 + time * 0.05) * s * 0.035 -
          seeded(x + 5) * s * 0.04,
      );
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.stroke();
    drawHabitat(width * 0.5, horizon + s * 0.12, s * 0.95, z, 4);
    for (let i = 0; i < 6; i++) {
      const x = width * (0.13 + i * 0.15),
        y = horizon + s * (0.2 + (i % 2) * 0.04);
      circle(x, y, s * 0.018, "rgba(230,235,240,.55)", rgba(z.color, 0.55), 1);
      line(
        x,
        y + s * 0.018,
        x - s * 0.018,
        y + s * 0.07,
        rgba([220, 225, 235], 0.48),
        2,
      );
      line(
        x,
        y + s * 0.018,
        x + s * 0.018,
        y + s * 0.07,
        rgba([220, 225, 235], 0.48),
        2,
      );
    }
    ctx.font = `900 ${s * 0.024}px system-ui`;
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,.58)";
    ctx.fillText(
      "VISITA → BASE → ASENTAMIENTO → SOCIEDAD",
      width * 0.5,
      height * 0.92,
    );
  }
  function sceneMultiplanetary(z, time) {
    const s = Math.min(width, height),
      planets = [
        [width * 0.2, height * 0.68, s * 0.115, [90, 190, 255]],
        [width * 0.52, height * 0.32, s * 0.09, [255, 155, 100]],
        [width * 0.8, height * 0.69, s * 0.08, [190, 185, 220]],
      ];
    for (let i = 0; i < planets.length; i++) {
      const p = planets[i];
      drawPlanet(p[0], p[1], p[2], { color: p[3] }, time, i === 0);
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * TAU + time * 0.04,
          rr = p[2] * 1.45;
        circle(
          p[0] + Math.cos(a) * rr,
          p[1] + Math.sin(a) * rr * 0.55,
          2 + (k % 2),
          rgba(z.color, 0.55),
        );
      }
    }
    for (let i = 0; i < 3; i++)
      for (let j = i + 1; j < 3; j++) {
        const a = planets[i],
          b = planets[j];
        ctx.setLineDash([5, 8]);
        line(a[0], a[1], b[0], b[1], rgba(z.color, 0.18), 1.5);
        ctx.setLineDash([]);
        const p = fract(time * 0.055 + (i + j) * 0.27);
        circle(
          mix(a[0], b[0], p),
          mix(a[1], b[1], p),
          2.2,
          rgba([255, 245, 205], 0.67),
        );
      }
    ctx.font = `850 ${s * 0.023}px system-ui`;
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,.57)";
    ctx.fillText("LA DISTANCIA CREA AUTONOMÍA", width * 0.5, height * 0.92);
  }
  function scenePlanetaryEngineering(z, time) {
    const s = Math.min(width, height),
      cx = width * 0.5,
      cy = height * 0.52,
      r = s * 0.23;
    drawPlanet(cx, cy, r, z, time, true);
    ctx.strokeStyle = rgba(z.color, 0.42);
    ctx.lineWidth = s * 0.018;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 1.55, r * 0.55, time * 0.03, 0, TAU);
    ctx.stroke();
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + time * 0.04,
        x = cx + Math.cos(a) * r * 1.55,
        y = cy + Math.sin(a) * r * 0.55;
      polygon(
        [
          [x - s * 0.018, y],
          [x + s * 0.018, y],
          [x + s * 0.028, y + s * 0.012],
          [x - s * 0.028, y + s * 0.012],
        ],
        rgba([225, 235, 245], 0.58),
        rgba(z.color, 0.65),
        1,
      );
    }
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU + time * 0.012,
        rr = r * 1.16,
        x = cx + Math.cos(a) * rr,
        y = cy + Math.sin(a) * rr;
      line(
        x,
        y,
        x + Math.cos(a) * s * 0.035,
        y + Math.sin(a) * s * 0.035,
        rgba(z.color, 0.28),
        2,
      );
    }
    ctx.font = `900 ${s * 0.025}px system-ui`;
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,.57)";
    ctx.fillText("CAPACIDAD ≠ DERECHO ≠ LEGITIMIDAD", cx, height * 0.92);
  }
  function scenePostBiological(z, time) {
    const s = Math.min(width, height),
      cx = width * 0.5,
      cy = height * 0.5;
    drawNetwork(cx, cy, s * 0.36, z, time, 28);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + time * 0.035,
        rr = s * 0.27,
        x = cx + Math.cos(a) * rr,
        y = cy + Math.sin(a) * rr * 0.7;
      ctx.strokeStyle = rgba(z.color, 0.5);
      ctx.strokeRect(x - s * 0.035, y - s * 0.035, s * 0.07, s * 0.07);
      circle(x - s * 0.013, y - s * 0.005, s * 0.005, "rgba(255,255,255,.75)");
      circle(x + s * 0.013, y - s * 0.005, s * 0.005, "rgba(255,255,255,.75)");
      line(
        x - s * 0.015,
        y + s * 0.017,
        x + s * 0.015,
        y + s * 0.017,
        rgba(z.color, 0.65),
        1.5,
      );
    }
    for (let i = 0; i < 12; i++) {
      const p = fract(time * 0.05 + i * 0.08),
        a = (i / 12) * TAU,
        x = cx + Math.cos(a) * s * (0.08 + p * 0.34),
        y = cy + Math.sin(a) * s * (0.05 + p * 0.24);
      circle(x, y, 2, rgba([255, 245, 220], 0.5 * (1 - p)));
    }
  }
  function sceneInterstellar(z, time) {
    const s = Math.min(width, height);
    for (let i = 0; i < 90; i++) {
      const x = width * (0.03 + seeded(i + 1200) * 0.94),
        y = height * (0.04 + seeded(i + 1250) * 0.88),
        r = 0.5 + seeded(i + 1300) * 2.2;
      circle(
        x,
        y,
        r,
        rgba(i % 6 ? z.color : [255, 235, 180], 0.22 + 0.4 * seeded(i + 1350)),
      );
    }
    drawStar(width * 0.16, height * 0.25, s * 0.055, [255, 215, 120], time);
    drawStar(width * 0.84, height * 0.22, s * 0.038, [165, 210, 255], time);
    const x = width * 0.5,
      y = height * 0.58;
    polygon(
      [
        [x - s * 0.18, y],
        [x + s * 0.16, y - s * 0.03],
        [x + s * 0.24, y],
        [x + s * 0.16, y + s * 0.03],
      ],
      "rgba(205,225,240,.38)",
      rgba(z.color, 0.72),
      1.5,
    );
    ctx.fillStyle = rgba(z.color, 0.18);
    ctx.fillRect(x - s * 0.14, y - s * 0.085, s * 0.26, s * 0.17);
    for (let i = 0; i < 5; i++)
      circle(x - s * 0.08 + i * s * 0.05, y, 2, "rgba(255,230,160,.7)");
    line(
      x - s * 0.2,
      y,
      width * 0.18,
      height * 0.28,
      rgba([255, 140, 120], 0.3),
      3,
    );
    ctx.setLineDash([7, 9]);
    line(
      width * 0.2,
      height * 0.28,
      width * 0.8,
      height * 0.24,
      rgba(z.color, 0.22),
      1.4,
    );
    ctx.setLineDash([]);
    ctx.font = `900 ${s * 0.024}px system-ui`;
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,.58)";
    ctx.fillText(
      "AÑOS LUZ · GENERACIONES · MILENIOS",
      width * 0.5,
      height * 0.91,
    );
  }
  function sceneKardashev(z, time) {
    const s = Math.min(width, height);
    drawPlanet(
      width * 0.18,
      height * 0.69,
      s * 0.075,
      { color: [95, 195, 255] },
      time,
      true,
    );
    drawStar(width * 0.5, height * 0.46, s * 0.12, [255, 220, 105], time);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * TAU + time * 0.028,
        rr = s * (0.18 + (i % 3) * 0.018),
        x = width * 0.5 + Math.cos(a) * rr,
        y = height * 0.46 + Math.sin(a) * rr * 0.58;
      polygon(
        [
          [x - s * 0.012, y],
          [x + s * 0.012, y],
          [x + s * 0.018, y + s * 0.008],
          [x - s * 0.018, y + s * 0.008],
        ],
        rgba(z.color, 0.5),
        rgba([255, 255, 255], 0.36),
        1,
      );
    }
    for (let i = 0; i < 36; i++) {
      const a = seeded(i + 1700) * TAU,
        rr = s * (0.23 + seeded(i + 1750) * 0.2),
        x = width * 0.78 + Math.cos(a) * rr * 0.45,
        y = height * 0.65 + Math.sin(a) * rr * 0.2;
      circle(x, y, 1 + (i % 3), rgba(i % 5 ? z.color : [255, 230, 165], 0.42));
    }
    ctx.font = `900 ${s * 0.024}px system-ui`;
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,.58)";
    ctx.fillText("PLANETA → ESTRELLA → GALAXIA", width * 0.5, height * 0.92);
  }
  function sceneDivergent(z, time) {
    const s = Math.min(width, height),
      ox = width * 0.5,
      oy = height * 0.86;
    drawBranching(ox, oy, height * 0.16, z, time, 11, 0.9);
    for (let i = 0; i < 11; i++) {
      const x = width * (0.05 + i * 0.09),
        col =
          i % 4 === 0
            ? [120, 245, 160]
            : i % 4 === 1
              ? [255, 120, 135]
              : i % 4 === 2
                ? [145, 180, 255]
                : [255, 215, 120];
      softHalo(x, height * 0.15, s * 0.07, col, 0.12);
      circle(x, height * 0.15, s * (0.012 + (i % 3) * 0.006), rgba(col, 0.65));
    }
    ctx.font = `900 ${s * 0.027}px system-ui`;
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,.63)";
    ctx.fillText("NINGUNA RAMA ESTÁ GARANTIZADA", ox, height * 0.94);
  }
  function sceneUnknown(z, time) {
    const s = Math.min(width, height),
      h = height * 0.36;
    const g = ctx.createLinearGradient(0, height, 0, 0);
    g.addColorStop(0, "rgba(8,12,28,.98)");
    g.addColorStop(0.55, "rgba(55,60,105,.42)");
    g.addColorStop(1, "rgba(235,245,255,.24)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
    softHalo(width * 0.5, h, s * 0.45, z.color, 0.15);
    for (let i = 0; i < 13; i++) {
      const x = width * (0.03 + (i / 12) * 0.94),
        a = Math.abs(i - 6) / 6;
      ctx.strokeStyle = rgba(z.color, 0.24 * (1 - a * 0.55));
      ctx.lineWidth = 1.2 + (i % 3);
      ctx.beginPath();
      ctx.moveTo(width * 0.5, height * 0.88);
      ctx.quadraticCurveTo(
        width * 0.5 + (x - width * 0.5) * 0.35,
        height * 0.58,
        x,
        h,
      );
      ctx.stroke();
      if (i % 2 === 0) circle(x, h, 2 + (i % 3), rgba([255, 255, 255], 0.5));
    }
    for (let i = 0; i < 55; i++) {
      const x = seeded(i + 2200) * width,
        y = seeded(i + 2250) * h,
        r = 0.6 + seeded(i + 2300) * 2;
      circle(
        x,
        y,
        r,
        rgba(i % 7 ? z.color : [255, 225, 170], 0.15 + 0.36 * seeded(i + 2350)),
      );
    }
    for (let i = 0; i < 5; i++) {
      const a = time * 0.08 + (i * TAU) / 5,
        x = width * 0.5 + Math.cos(a) * s * 0.16,
        y = h + Math.sin(a) * s * 0.06;
      ctx.strokeStyle = rgba(z.color, 0.16);
      ctx.beginPath();
      ctx.arc(x, y, s * (0.025 + i * 0.008), 0, TAU);
      ctx.stroke();
    }
    ctx.font = `900 ${s * 0.025}px system-ui`;
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,.65)";
    ctx.fillText("MÁS ALLÁ: LA VIDA CÓSMICA", width * 0.5, height * 0.92);
  }

  const SCENES = [
    sceneFuturesStart,
    sceneEnergy,
    sceneAutomation,
    sceneAdvancedAI,
    sceneFutureBiotech,
    sceneHumanMachine,
    sceneSustainable,
    sceneInequality,
    sceneRisks,
    sceneGovernance,
    sceneSpaceIndustry,
    sceneSettlements,
    sceneMultiplanetary,
    scenePlanetaryEngineering,
    scenePostBiological,
    sceneInterstellar,
    sceneKardashev,
    sceneDivergent,
    sceneUnknown,
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
