import { createSceneAudio } from "../../shared/audio.js";
import {
  requestSceneFrame as requestAnimationFrame,
  cancelSceneFrame as cancelAnimationFrame,
} from "../../shared/animation.js";
import content from "./content.json";
const { ZONES, LANDMARKS } = content;

export function mountScene() {
  const canvas = document.getElementById("local-group-spectrum");
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
  const scaleDot = document.getElementById("scale-dot");
  const hint = document.getElementById("hint");

  const TAU = Math.PI * 2;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const stars = [];
  const dust = [];
  const cosmicRays = [];
  const particles = [];
  const waves = [];

  let width = 1;
  let height = 1;
  let dpr = 1;
  let activePointer = null;
  let pointerX = 0.5;
  let pointerY = 0.935;
  let targetX = 0.5;
  let targetY = 0.935;
  let hasInteracted = false;
  let hideTimer = 0;
  let lastZoneId = "";
  let lastFeature = -1;
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

  function seeded(seed) {
    let value = seed >>> 0;
    return () => {
      value = (value * 1664525 + 1013904223) >>> 0;
      return value / 4294967296;
    };
  }

  function buildStaticScene() {
    const random = seeded(18072028);
    stars.length = 0;
    dust.length = 0;
    cosmicRays.length = 0;

    const starCount = Math.max(190, Math.round((width * height) / 4100));
    for (let i = 0; i < starCount; i++) {
      const y = random();
      const middleQuiet = 0.48 + Math.abs(y - 0.48) * 1.04;
      stars.push({
        x: random(),
        y,
        r: 0.3 + random() * (1.1 + Math.abs(y - 0.5) * 1.25),
        alpha: (0.11 + random() * 0.46) * middleQuiet,
        phase: random() * TAU,
        speed: 0.35 + random() * 1.65,
        warmth: random(),
      });
    }

    for (let i = 0; i < 96; i++) {
      dust.push({
        x: random(),
        y: random(),
        r: 20 + random() * 102,
        alpha: 0.009 + random() * 0.034,
        phase: random() * TAU,
        hue: random(),
      });
    }

    for (let i = 0; i < 24; i++) {
      cosmicRays.push({
        x: random(),
        y: random(),
        len: 22 + random() * 96,
        speed: 0.000012 + random() * 0.000032,
        alpha: 0.055 + random() * 0.12,
        phase: random() * TAU,
      });
    }
  }

  function resize() {
    width = Math.max(1, innerWidth);
    height = Math.max(1, innerHeight);
    dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildStaticScene();
  }

  function clamp(value, min = 0, max = 1) {
    return Math.max(min, Math.min(max, value));
  }

  function journeyFromY(yNorm) {
    return clamp(1 - yNorm);
  }

  function yFromJourney(progress) {
    return clamp(1 - progress);
  }

  function zoneForJourney(progress) {
    const p = clamp(progress, 0, 0.999999);
    for (const zone of ZONES) {
      if (p >= zone.p0 && p < zone.p1) return zone;
    }
    return ZONES[ZONES.length - 1];
  }

  function localRatio(zone, progress) {
    return clamp((progress - zone.p0) / Math.max(0.0001, zone.p1 - zone.p0));
  }

  function featureFor(zone, xNorm) {
    const index = Math.min(
      zone.features.length - 1,
      Math.floor(clamp(xNorm, 0, 0.99999) * zone.features.length),
    );
    return {
      index,
      name: zone.features[index][0],
      fact: zone.features[index][1],
    };
  }

  function routeX(progress) {
    const wave = Math.sin(progress * Math.PI * 2.42 - 0.8) * width * 0.085;
    const fine = Math.sin(progress * Math.PI * 7.1 + 0.4) * width * 0.018;
    return width * 0.5 + wave + fine;
  }

  function routeY(progress) {
    return height * (0.962 - progress * 0.922);
  }

  function landmarkPoint(landmark) {
    return {
      x: routeX(landmark.p) + landmark.lane * Math.min(width * 0.56, 520),
      y: routeY(landmark.p),
    };
  }

  function sceneScale() {
    return clamp(Math.sqrt((width * height) / (390 * 844)), 0.86, 1.8);
  }

  function setCssPoint(x, y) {
    root.style.setProperty("--scan-x", x + "px");
    root.style.setProperty("--scan-y", y + "px");
  }

  function setAccent(zone) {
    const [r, g, b] = zone.color;
    root.style.setProperty("--accent", `rgb(${r} ${g} ${b})`);
    root.style.setProperty("--accent-soft", `rgb(${r} ${g} ${b} / .34)`);
  }

  function ensureAudio() {
    if (audioCtx) {
      if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
      return;
    }
    audioCtx = createSceneAudio();
    if (!audioCtx) return;
    master = audioCtx.createGain();
    master.gain.value = 0.16;

    const compressor = audioCtx.createDynamicsCompressor();
    compressor.threshold.value = -22;
    compressor.knee.value = 24;
    compressor.ratio.value = 8;
    compressor.attack.value = 0.006;
    compressor.release.value = 0.22;

    stereo = audioCtx.createStereoPanner ? audioCtx.createStereoPanner() : null;
    if (stereo) {
      master.connect(stereo);
      stereo.connect(compressor);
    } else {
      master.connect(compressor);
    }
    compressor.connect(audioCtx.destination);

    droneA = audioCtx.createOscillator();
    droneB = audioCtx.createOscillator();
    droneGain = audioCtx.createGain();
    droneFilter = audioCtx.createBiquadFilter();
    droneA.type = "sine";
    droneB.type = "triangle";
    droneA.frequency.value = 62;
    droneB.frequency.value = 62.5;
    droneGain.gain.value = 0.0001;
    droneFilter.type = "lowpass";
    droneFilter.frequency.value = 1000;
    droneFilter.Q.value = 1.1;
    droneA.connect(droneFilter);
    droneB.connect(droneFilter);
    droneFilter.connect(droneGain);
    droneGain.connect(master);
    droneA.start();
    droneB.start();

    pulseOsc = audioCtx.createOscillator();
    pulseGain = audioCtx.createGain();
    pulseOsc.type = "sine";
    pulseOsc.frequency.value = 1.5;
    pulseGain.gain.value = 0.0001;
    pulseOsc.connect(pulseGain);
    pulseGain.connect(master);
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
    noiseFilter.frequency.value = 620;
    noiseFilter.Q.value = 0.7;
    noiseGain = audioCtx.createGain();
    noiseGain.gain.value = 0.0001;
    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(master);
    noiseSource.start();
  }

  function setAudioFor(zone, xNorm, yNorm, active) {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const s = zone.sound;
    const vertical = 0.9 + (1 - yNorm) * 0.34;
    const horizontal = 0.92 + xNorm * 0.18;
    const base = s.base * vertical * horizontal;

    droneA.type = s.type;
    droneB.type = s.type === "sawtooth" ? "triangle" : "sine";
    droneA.frequency.setTargetAtTime(base, now, 0.06);
    droneB.frequency.setTargetAtTime(base * 1.006, now, 0.07);
    droneFilter.frequency.setTargetAtTime(
      s.filter * (0.86 + xNorm * 0.35),
      now,
      0.07,
    );
    droneFilter.Q.setTargetAtTime(1.1 + xNorm * 2.2, now, 0.08);
    droneGain.gain.setTargetAtTime(
      active ? 0.16 : 0.0001,
      now,
      active ? 0.045 : 0.2,
    );

    pulseOsc.frequency.setTargetAtTime(0.45 + s.pulse * 3.8, now, 0.08);
    pulseGain.gain.setTargetAtTime(
      active ? 0.018 + s.pulse * 0.035 : 0.0001,
      now,
      0.08,
    );

    noiseFilter.frequency.setTargetAtTime(250 + s.filter * 0.38, now, 0.08);
    noiseGain.gain.setTargetAtTime(active ? s.noise * 0.12 : 0.0001, now, 0.09);
    if (stereo) stereo.pan.setTargetAtTime((xNorm - 0.5) * 1.2, now, 0.07);
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
    osc.type = featureIndex % 2 ? "triangle" : "sine";
    osc.frequency.setValueAtTime(zone.sound.base * 3.2 * scale, now);
    osc.frequency.exponentialRampToValueAtTime(
      zone.sound.base * 5.1 * scale,
      now + 0.24,
    );
    filter.type = "lowpass";
    filter.frequency.value = Math.min(6200, zone.sound.filter * 1.8);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.11, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
    osc.connect(filter);
    filter.connect(gain);
    if (pan) {
      pan.pan.value = (xNorm - 0.5) * 1.4;
      gain.connect(pan);
      pan.connect(master);
    } else {
      gain.connect(master);
    }
    osc.start(now);
    osc.stop(now + 0.46);
  }

  function addRipple(x, y) {
    const node = document.createElement("div");
    node.className = "ripple";
    node.style.left = x + "px";
    node.style.top = y + "px";
    document.body.appendChild(node);
    node.addEventListener("animationend", () => node.remove(), { once: true });
  }

  function addBurst(x, y, zone) {
    const count = reducedMotion ? 5 : 18;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * TAU;
      const speed = 25 + Math.random() * 115;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        decay: 0.65 + Math.random() * 0.7,
        r: 1 + Math.random() * 3,
        color: zone.color,
      });
    }
    waves.push({ x, y, radius: 10, life: 1, color: zone.color });
  }

  function updateReadout(x, y, isNewPress = false) {
    const xNorm = clamp(x / width, 0, 0.999999);
    const yNorm = clamp(y / height, 0, 0.999999);
    const progress = journeyFromY(yNorm);
    const zone = zoneForJourney(progress);
    const feature = featureFor(zone, xNorm);

    pointerX = xNorm;
    pointerY = yNorm;
    targetX = xNorm;
    targetY = yNorm;

    setCssPoint(x, y);
    setAccent(zone);
    root.style.setProperty("--progress", `${(progress * 100).toFixed(2)}%`);

    const trackHeight = Math.max(1, height - 40);
    scaleDot.style.bottom = `${20 + progress * trackHeight}px`;
    scaleValue.textContent = zone.metric;

    zoneName.textContent = zone.name;
    zoneName.classList.toggle("compact", zone.name.length > 15);
    zoneName.classList.toggle("long", zone.name.length > 20);
    featureName.textContent = feature.name;
    metric.textContent = zone.metric;
    fact.textContent = feature.fact;

    touchOrb.style.left = x + "px";
    touchOrb.style.top = y + "px";
    touchOrb.classList.add("visible");
    readout.classList.add("visible");
    journeyScale.classList.add("visible");
    document.body.classList.add("active");

    ensureAudio();
    setAudioFor(zone, xNorm, yNorm, true);

    const zoneChanged = zone.id !== lastZoneId;
    const featureChanged = feature.index !== lastFeature;
    if (zoneChanged || (isNewPress && featureChanged)) {
      ping(zone, xNorm, feature.index);
      addBurst(x, y, zone);
    }
    if (isNewPress) addRipple(x, y);

    lastZoneId = zone.id;
    lastFeature = feature.index;
    hasInteracted = true;
    hint.classList.add("hidden");
    clearTimeout(hideTimer);
  }

  function releaseInteraction(delay = 900) {
    document.body.classList.remove("active");
    setAudioFor(
      zoneForJourney(journeyFromY(pointerY)),
      pointerX,
      pointerY,
      false,
    );
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      readout.classList.remove("visible");
      touchOrb.classList.remove("visible");
      journeyScale.classList.remove("visible");
    }, delay);
  }

  function pointerPosition(event) {
    return {
      x: clamp(event.clientX, 0, width),
      y: clamp(event.clientY, 0, height),
    };
  }

  canvas.addEventListener("pointerdown", (event) => {
    activePointer = event.pointerId;
    try {
      canvas.setPointerCapture?.(event.pointerId);
    } catch {}
    const point = pointerPosition(event);
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
    try {
      canvas.releasePointerCapture?.(event.pointerId);
    } catch {}
    releaseInteraction();
  }

  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  canvas.addEventListener("keydown", (event) => {
    const step = event.shiftKey ? 0.09 : 0.035;
    let handled = true;
    if (event.key === "ArrowUp") targetY -= step;
    else if (event.key === "ArrowDown") targetY += step;
    else if (event.key === "ArrowLeft") targetX -= step;
    else if (event.key === "ArrowRight") targetX += step;
    else if (event.key === "Home") targetY = 0.96;
    else if (event.key === "End") targetY = 0.04;
    else if (event.key === " " || event.key === "Enter") {
    } else handled = false;
    if (!handled) return;
    event.preventDefault();
    targetX = clamp(targetX, 0.02, 0.98);
    targetY = clamp(targetY, 0.025, 0.975);
    updateReadout(targetX * width, targetY * height, true);
    releaseInteraction(1500);
  });

  function drawBackground(time) {
    const bg = ctx.createLinearGradient(0, height, 0, 0);
    bg.addColorStop(0, "#0b0715");
    bg.addColorStop(0.17, "#05040e");
    bg.addColorStop(0.44, "#02040b");
    bg.addColorStop(0.72, "#060719");
    bg.addColorStop(1, "#100b24");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    const milkyGlow = ctx.createRadialGradient(
      width * 0.46,
      height * 1.04,
      0,
      width * 0.46,
      height * 1.04,
      Math.max(width, height) * 0.6,
    );
    milkyGlow.addColorStop(0, "rgba(255,224,171,.34)");
    milkyGlow.addColorStop(0.15, "rgba(213,147,255,.18)");
    milkyGlow.addColorStop(0.42, "rgba(93,112,255,.07)");
    milkyGlow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = milkyGlow;
    ctx.fillRect(0, height * 0.46, width, height * 0.54);

    const nextScaleGlow = ctx.createRadialGradient(
      width * 0.54,
      -height * 0.06,
      0,
      width * 0.54,
      -height * 0.06,
      Math.max(width, height) * 0.55,
    );
    nextScaleGlow.addColorStop(0, "rgba(210,188,255,.28)");
    nextScaleGlow.addColorStop(0.2, "rgba(105,176,255,.13)");
    nextScaleGlow.addColorStop(0.55, "rgba(97,67,180,.05)");
    nextScaleGlow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = nextScaleGlow;
    ctx.fillRect(0, 0, width, height * 0.45);

    for (const star of stars) {
      const flicker =
        0.73 + Math.sin(time * 0.0011 * star.speed + star.phase) * 0.27;
      const x = star.x * width;
      const y = star.y * height;
      const alpha = star.alpha * flicker;
      const warm = star.warmth > 0.9;
      ctx.fillStyle = warm
        ? `rgba(255,226,181,${alpha})`
        : `rgba(211,227,255,${alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, star.r, 0, TAU);
      ctx.fill();
      if (star.r > 1.62) {
        ctx.strokeStyle = warm
          ? `rgba(255,216,159,${alpha * 0.3})`
          : `rgba(180,210,255,${alpha * 0.28})`;
        ctx.lineWidth = 0.55;
        ctx.beginPath();
        ctx.moveTo(x - star.r * 3.2, y);
        ctx.lineTo(x + star.r * 3.2, y);
        ctx.moveTo(x, y - star.r * 3.2);
        ctx.lineTo(x, y + star.r * 3.2);
        ctx.stroke();
      }
    }

    for (const mote of dust) {
      const drift = Math.sin(time * 0.0001 + mote.phase) * 8;
      const x = mote.x * width + drift;
      const y = mote.y * height;
      const violet = mote.hue > 0.53;
      const glow = ctx.createRadialGradient(x, y, 0, x, y, mote.r);
      glow.addColorStop(
        0,
        violet
          ? `rgba(177,114,255,${mote.alpha})`
          : `rgba(76,174,224,${mote.alpha})`,
      );
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(x - mote.r, y - mote.r, mote.r * 2, mote.r * 2);
    }

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const ray of cosmicRays) {
      const x = (((ray.x + time * ray.speed) % 1.16) - 0.08) * width;
      const y = ray.y * height + Math.sin(time * 0.00024 + ray.phase) * 9;
      ctx.strokeStyle = `rgba(161,213,255,${ray.alpha})`;
      ctx.lineWidth = 0.58;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + ray.len * 0.3, y - ray.len);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawJourneyPath(time) {
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const pathGrad = ctx.createLinearGradient(0, height, 0, 0);
    pathGrad.addColorStop(0, "rgba(231,183,255,.36)");
    pathGrad.addColorStop(0.25, "rgba(121,184,255,.32)");
    pathGrad.addColorStop(0.48, "rgba(85,225,225,.28)");
    pathGrad.addColorStop(0.72, "rgba(255,199,139,.4)");
    pathGrad.addColorStop(1, "rgba(202,197,255,.48)");
    ctx.strokeStyle = pathGrad;
    ctx.lineWidth = Math.max(1.4, Math.min(width, height) * 0.0031);
    ctx.shadowBlur = 18;
    ctx.shadowColor = "rgba(150,184,255,.34)";
    ctx.beginPath();
    for (let p = 0; p <= 1.0001; p += 0.008) {
      const x = routeX(p);
      const y = routeY(p);
      if (p === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    for (const zone of ZONES) {
      const y = routeY(zone.p0);
      const [r, g, b] = zone.color;
      const fade = ctx.createLinearGradient(0, y, width, y);
      fade.addColorStop(0, `rgba(${r},${g},${b},0)`);
      fade.addColorStop(0.32, `rgba(${r},${g},${b},.085)`);
      fade.addColorStop(0.5, `rgba(${r},${g},${b},.21)`);
      fade.addColorStop(0.68, `rgba(${r},${g},${b},.085)`);
      fade.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.strokeStyle = fade;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    const exitX = routeX(0.995);
    const exitY = routeY(0.995);
    const exitGlow = ctx.createRadialGradient(
      exitX,
      exitY,
      0,
      exitX,
      exitY,
      Math.min(width, height) * 0.29,
    );
    exitGlow.addColorStop(0, "rgba(214,203,255,.35)");
    exitGlow.addColorStop(0.22, "rgba(120,171,255,.12)");
    exitGlow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = exitGlow;
    ctx.fillRect(0, 0, width, height * 0.34);

    const pulseP = clamp(journeyFromY(pointerY));
    const pulseX = routeX(pulseP);
    const pulseY = routeY(pulseP);
    const pulse = 5 + Math.sin(time * 0.004) * 2.3;
    ctx.fillStyle = "rgba(255,255,255,.92)";
    ctx.shadowBlur = 18;
    ctx.shadowColor = "rgba(166,211,255,.88)";
    ctx.beginPath();
    ctx.arc(pulseX, pulseY, pulse, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function starGlow(x, y, radius, inner, middle, outer) {
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, inner);
    glow.addColorStop(0.18, middle);
    glow.addColorStop(1, outer);
    ctx.fillStyle = glow;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  function drawSpiralGalaxy(
    time,
    x,
    y,
    r,
    rotation,
    flattening,
    arms,
    palette,
    detail = 82,
    opacity = 1,
  ) {
    const [core, warm, cool] = palette;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = opacity;

    for (let layer = 0; layer < 5; layer++) {
      const rr = r * (1 - layer * 0.1);
      const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, rr);
      halo.addColorStop(0, `rgba(${core},${0.17 - layer * 0.017})`);
      halo.addColorStop(0.22, `rgba(${warm},${0.105 - layer * 0.01})`);
      halo.addColorStop(0.72, `rgba(${cool},${0.052 - layer * 0.004})`);
      halo.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = halo;
      ctx.save();
      ctx.scale(1, flattening + layer * 0.006);
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    for (let arm = 0; arm < arms; arm++) {
      for (let i = 0; i < detail; i++) {
        const t = i / (detail - 1);
        const angle = (arm / arms) * TAU + t * TAU * 1.72 + time * 0.000018;
        const rr = r * (0.06 + t * 0.9);
        const jitter = Math.sin(i * 5.41 + arm * 2.7) * r * 0.018;
        const px = Math.cos(angle) * (rr + jitter);
        const py = Math.sin(angle) * (rr + jitter) * flattening;
        const a = (0.11 + (1 - t) * 0.18) * opacity;
        ctx.fillStyle =
          i % 7 === 0 ? `rgba(${warm},${a * 1.7})` : `rgba(${cool},${a})`;
        ctx.beginPath();
        ctx.arc(px, py, 0.55 + (i % 5) * 0.16 + (1 - t) * 0.42, 0, TAU);
        ctx.fill();
      }
    }

    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = opacity;
    ctx.strokeStyle = `rgba(6,5,17,${0.48 * opacity})`;
    ctx.lineCap = "round";
    for (let lane = -1; lane <= 1; lane++) {
      ctx.lineWidth = Math.max(1.2, r * 0.018);
      ctx.beginPath();
      ctx.moveTo(-r * 0.93, lane * r * 0.025);
      ctx.bezierCurveTo(
        -r * 0.38,
        -r * (0.105 - lane * 0.016),
        r * 0.31,
        r * (0.12 + lane * 0.018),
        r * 0.93,
        lane * r * 0.025,
      );
      ctx.stroke();
    }

    const coreGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.29);
    coreGlow.addColorStop(0, `rgba(${core},${0.95 * opacity})`);
    coreGlow.addColorStop(0.22, `rgba(${warm},${0.57 * opacity})`);
    coreGlow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = coreGlow;
    ctx.save();
    ctx.scale(1, Math.max(0.42, flattening * 1.8));
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.3, 0, TAU);
    ctx.fill();
    ctx.restore();
    ctx.restore();
  }

  function drawDwarfGalaxy(
    time,
    x,
    y,
    r,
    rotation,
    color = "181,204,255",
    alpha = 0.72,
  ) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.globalCompositeOperation = "screen";
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    glow.addColorStop(0, `rgba(255,239,207,${alpha * 0.6})`);
    glow.addColorStop(0.23, `rgba(${color},${alpha * 0.28})`);
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.save();
    ctx.scale(1, 0.42 + Math.sin(time * 0.0003 + rotation) * 0.025);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();
    ctx.restore();
    for (let i = 0; i < 16; i++) {
      const a = i * 2.399 + rotation;
      const rr = r * (0.08 + ((i * 37) % 100) / 125);
      ctx.fillStyle = `rgba(${color},${alpha * (0.35 + (i % 4) * 0.09)})`;
      ctx.beginPath();
      ctx.arc(
        Math.cos(a) * rr,
        Math.sin(a) * rr * 0.42,
        0.45 + (i % 3) * 0.25,
        0,
        TAU,
      );
      ctx.fill();
    }
    ctx.restore();
  }

  function drawIrregularCloud(time, x, y, r, rotation, colors) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.globalCompositeOperation = "screen";
    for (let i = 0; i < 13; i++) {
      const a = i * 2.17 + time * 0.000028;
      const px = Math.cos(a) * r * (0.12 + (i % 5) * 0.11);
      const py = Math.sin(a * 1.27) * r * (0.08 + (i % 4) * 0.08);
      const rr = r * (0.22 + (i % 4) * 0.07);
      const color = colors[i % colors.length];
      const glow = ctx.createRadialGradient(px, py, 0, px, py, rr);
      glow.addColorStop(0, `rgba(${color},.23)`);
      glow.addColorStop(0.55, `rgba(${color},.075)`);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(px - rr, py - rr, rr * 2, rr * 2);
    }
    for (let i = 0; i < 34; i++) {
      const a = i * 2.399;
      const rr = r * (0.05 + ((i * 31) % 97) / 125);
      const px = Math.cos(a) * rr;
      const py = Math.sin(a * 1.1) * rr * 0.48;
      ctx.fillStyle =
        i % 6 === 0 ? "rgba(255,218,176,.72)" : "rgba(192,221,255,.44)";
      ctx.beginPath();
      ctx.arc(px, py, 0.45 + (i % 4) * 0.18, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawMilkyWayEdge(time, landmark) {
    const { x, y } = landmarkPoint(landmark);
    const r = Math.min(
      landmark.size * sceneScale(),
      Math.min(width, height) * 0.42,
    );
    drawSpiralGalaxy(
      time,
      x,
      y + r * 0.24,
      r,
      -0.12,
      0.22,
      4,
      ["255,250,220", "255,186,113", "152,166,255"],
      94,
      0.9,
    );
    const halo = ctx.createRadialGradient(x, y, r * 0.25, x, y, r * 1.23);
    halo.addColorStop(0, "rgba(159,129,255,.02)");
    halo.addColorStop(0.7, "rgba(157,126,255,.035)");
    halo.addColorStop(0.96, "rgba(210,181,255,.12)");
    halo.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.18, r * 0.78, -0.08, 0, TAU);
    ctx.fill();
  }

  function drawOuterHalo(time, landmark) {
    const { x, y } = landmarkPoint(landmark);
    const r = Math.min(
      landmark.size * sceneScale(),
      Math.min(width, height) * 0.24,
    );
    const halo = ctx.createRadialGradient(x, y, 0, x, y, r * 1.35);
    halo.addColorStop(0, "rgba(142,121,255,.025)");
    halo.addColorStop(0.65, "rgba(132,111,232,.035)");
    halo.addColorStop(0.9, "rgba(195,170,255,.1)");
    halo.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.26, r * 0.76, 0.17, 0, TAU);
    ctx.fill();
    ctx.save();
    ctx.strokeStyle = "rgba(176,157,255,.11)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 7]);
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.05, r * 0.6, 0.17, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * TAU + time * 0.000012;
      const rr = r * (0.4 + (i % 4) * 0.16);
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr * 0.58;
      starGlow(
        px,
        py,
        7 + (i % 3) * 2,
        "rgba(255,238,194,.58)",
        "rgba(165,145,255,.12)",
        "rgba(0,0,0,0)",
      );
    }
    ctx.restore();
  }

  function drawDwarfs(time, landmark) {
    const { x, y } = landmarkPoint(landmark);
    const r = Math.min(
      landmark.size * sceneScale(),
      Math.min(width, height) * 0.18,
    );
    const positions = [
      [-0.74, 0.2, 0.31, -0.28],
      [-0.37, -0.34, 0.22, 0.45],
      [-0.08, 0.3, 0.18, -0.55],
      [0.28, -0.16, 0.27, 0.18],
      [0.58, 0.32, 0.2, -0.36],
      [0.77, -0.28, 0.16, 0.7],
    ];
    positions.forEach((v, i) =>
      drawDwarfGalaxy(
        time,
        x + v[0] * r,
        y + v[1] * r,
        r * v[2],
        v[3],
        i % 2 ? "160,204,255" : "213,175,255",
        0.78,
      ),
    );
    ctx.save();
    ctx.strokeStyle = "rgba(150,186,255,.105)";
    ctx.lineWidth = 1;
    for (let i = 0; i < positions.length - 1; i++) {
      ctx.beginPath();
      ctx.moveTo(x + positions[i][0] * r, y + positions[i][1] * r);
      ctx.quadraticCurveTo(
        x,
        y + Math.sin(i) * r * 0.18,
        x + positions[i + 1][0] * r,
        y + positions[i + 1][1] * r,
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawIntergalactic(time, landmark) {
    const { x, y } = landmarkPoint(landmark);
    const r = Math.min(
      landmark.size * sceneScale(),
      Math.min(width, height) * 0.2,
    );
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.lineCap = "round";
    for (let strand = 0; strand < 5; strand++) {
      const yy = y + (strand - 2) * r * 0.18;
      const grad = ctx.createLinearGradient(x - r, yy, x + r, yy);
      grad.addColorStop(0, "rgba(74,214,225,0)");
      grad.addColorStop(0.45, `rgba(83,222,224,${0.055 + strand * 0.01})`);
      grad.addColorStop(0.65, "rgba(140,186,255,.08)");
      grad.addColorStop(1, "rgba(74,214,225,0)");
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.2 + strand * 0.28;
      ctx.beginPath();
      ctx.moveTo(x - r, yy);
      ctx.bezierCurveTo(
        x - r * 0.38,
        yy - r * (0.28 - strand * 0.06),
        x + r * 0.28,
        yy + r * (0.24 - strand * 0.04),
        x + r,
        yy - r * 0.06,
      );
      ctx.stroke();
    }
    for (let i = 0; i < 18; i++) {
      const a = i * 2.37 + time * 0.000025;
      const rr = r * (0.16 + (i % 7) * 0.1);
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a * 1.18) * rr * 0.5;
      ctx.fillStyle = `rgba(117,235,231,${0.08 + (i % 4) * 0.025})`;
      ctx.beginPath();
      ctx.arc(px, py, 0.55 + (i % 3) * 0.25, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawMagellanic(time, landmark) {
    const { x, y } = landmarkPoint(landmark);
    const r = Math.min(
      landmark.size * sceneScale(),
      Math.min(width, height) * 0.19,
    );
    drawIrregularCloud(time, x - r * 0.28, y + r * 0.05, r * 0.62, -0.2, [
      "255,110,184",
      "117,176,255",
      "255,194,135",
    ]);
    drawIrregularCloud(time, x + r * 0.5, y - r * 0.24, r * 0.38, 0.32, [
      "177,138,255",
      "99,202,255",
      "255,151,199",
    ]);
    ctx.save();
    ctx.strokeStyle = "rgba(118,191,255,.15)";
    ctx.lineWidth = 2;
    ctx.setLineDash([2, 7]);
    ctx.beginPath();
    ctx.moveTo(x - r * 0.8, y + r * 0.18);
    ctx.bezierCurveTo(
      x - r * 0.05,
      y + r * 0.55,
      x + r * 0.42,
      y - r * 0.55,
      x + r * 0.82,
      y - r * 0.28,
    );
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawTriangulum(time, landmark) {
    const { x, y } = landmarkPoint(landmark);
    const r = Math.min(
      landmark.size * sceneScale(),
      Math.min(width, height) * 0.14,
    );
    drawSpiralGalaxy(
      time,
      x,
      y,
      r,
      0.18,
      0.46,
      3,
      ["255,244,211", "255,181,119", "112,190,255"],
      64,
      0.92,
    );
    starGlow(
      x + r * 0.42,
      y - r * 0.16,
      r * 0.17,
      "rgba(178,238,255,.88)",
      "rgba(82,187,255,.25)",
      "rgba(0,0,0,0)",
    );
  }

  function drawAndromeda(time, landmark) {
    const { x, y } = landmarkPoint(landmark);
    const r = Math.min(
      landmark.size * sceneScale(),
      Math.min(width, height) * 0.42,
    );
    starGlow(
      x,
      y,
      r * 1.32,
      "rgba(255,232,183,.16)",
      "rgba(185,143,255,.07)",
      "rgba(0,0,0,0)",
    );
    drawSpiralGalaxy(
      time,
      x,
      y,
      r,
      -0.2,
      0.25,
      4,
      ["255,252,225", "255,189,111", "156,179,255"],
      108,
      1,
    );
    drawDwarfGalaxy(
      time,
      x - r * 0.53,
      y - r * 0.08,
      r * 0.11,
      -0.1,
      "236,208,255",
      0.88,
    );
    drawDwarfGalaxy(
      time,
      x + r * 0.58,
      y + r * 0.11,
      r * 0.16,
      0.22,
      "205,217,255",
      0.8,
    );
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const beam = ctx.createLinearGradient(x - r, y, x + r, y);
    beam.addColorStop(0, "rgba(255,207,137,0)");
    beam.addColorStop(0.5, "rgba(255,232,192,.13)");
    beam.addColorStop(1, "rgba(255,207,137,0)");
    ctx.strokeStyle = beam;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(x - r * 1.08, y);
    ctx.lineTo(x + r * 1.08, y);
    ctx.stroke();
    ctx.restore();
  }

  function drawLocalCenter(time, landmark) {
    const { x, y } = landmarkPoint(landmark);
    const r = Math.min(
      landmark.size * sceneScale(),
      Math.min(width, height) * 0.18,
    );
    const points = [
      { x: x - r * 0.7, y: y + r * 0.28, c: "255,204,132" },
      { x: x + r * 0.54, y: y - r * 0.22, c: "179,158,255" },
      { x: x + r * 0.06, y: y + r * 0.48, c: "104,201,255" },
    ];
    ctx.save();
    ctx.strokeStyle = "rgba(204,178,255,.16)";
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 7]);
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.quadraticCurveTo(
        x + Math.sin(i * 2) * r * 0.18,
        y + Math.cos(i) * r * 0.12,
        x,
        y,
      );
      ctx.stroke();
    }
    ctx.setLineDash([]);
    const pulse = 1 + Math.sin(time * 0.0018) * 0.08;
    starGlow(
      x,
      y,
      r * 0.7 * pulse,
      "rgba(255,255,255,.72)",
      "rgba(201,161,255,.2)",
      "rgba(0,0,0,0)",
    );
    ctx.strokeStyle = "rgba(255,255,255,.64)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.13 * pulse, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - r * 0.23, y);
    ctx.lineTo(x + r * 0.23, y);
    ctx.moveTo(x, y - r * 0.23);
    ctx.lineTo(x, y + r * 0.23);
    ctx.stroke();
    for (const p of points)
      starGlow(
        p.x,
        p.y,
        r * 0.17,
        `rgba(${p.c},.64)`,
        `rgba(${p.c},.14)`,
        "rgba(0,0,0,0)",
      );
    ctx.restore();
  }

  function drawBoundary(time, landmark) {
    const { x, y } = landmarkPoint(landmark);
    const r = Math.min(
      landmark.size * sceneScale(),
      Math.min(width, height) * 0.5,
    );
    ctx.save();
    ctx.strokeStyle = "rgba(196,205,255,.2)";
    ctx.lineWidth = 1.3;
    ctx.setLineDash([5, 9]);
    ctx.beginPath();
    ctx.ellipse(
      x,
      y + r * 0.08,
      r * 1.2,
      r * 0.55,
      -0.04,
      Math.PI * 0.08,
      Math.PI * 0.92,
      true,
    );
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.globalCompositeOperation = "screen";
    ctx.lineCap = "round";
    for (let strand = 0; strand < 6; strand++) {
      const startX = width * (0.1 + strand * 0.16);
      const endX =
        width * (0.18 + strand * 0.13) + Math.sin(strand * 2.1) * width * 0.05;
      const alpha = 0.055 + (strand % 3) * 0.018;
      ctx.strokeStyle = `rgba(${strand % 2 ? "163,137,255" : "112,196,255"},${alpha})`;
      ctx.lineWidth = 1.1 + (strand % 3) * 0.45;
      ctx.beginPath();
      ctx.moveTo(startX, height * 0.14);
      ctx.bezierCurveTo(
        startX + Math.sin(strand) * width * 0.08,
        height * 0.09,
        endX,
        height * 0.035,
        endX,
        -height * 0.05,
      );
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.shadowBlur = 14;
    ctx.shadowColor = "rgba(161,179,255,.36)";
    ctx.fillStyle = "rgba(224,226,255,.5)";
    ctx.font = `800 ${Math.max(8, Math.min(11, width * 0.023))}px Inter, system-ui, sans-serif`;
    ctx.fillText("MÁS ALLÁ", width * 0.5, Math.max(8, height * 0.012));
    ctx.fillStyle = "rgba(219,213,255,.62)";
    ctx.font = `900 ${Math.max(10, Math.min(14, width * 0.03))}px Inter, system-ui, sans-serif`;
    ctx.fillText("VIRGO · LANIAKEA", width * 0.5, Math.max(23, height * 0.034));
    ctx.restore();
  }

  function drawLandmarks(time) {
    for (const landmark of LANDMARKS) {
      switch (landmark.id) {
        case "milky-edge":
          drawMilkyWayEdge(time, landmark);
          break;
        case "outer-halo":
          drawOuterHalo(time, landmark);
          break;
        case "dwarfs":
          drawDwarfs(time, landmark);
          break;
        case "intergalactic":
          drawIntergalactic(time, landmark);
          break;
        case "magellanic":
          drawMagellanic(time, landmark);
          break;
        case "triangulum":
          drawTriangulum(time, landmark);
          break;
        case "andromeda":
          drawAndromeda(time, landmark);
          break;
        case "center":
          drawLocalCenter(time, landmark);
          break;
        case "boundary":
          drawBoundary(time, landmark);
          break;
      }
    }
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
      ctx.fillStyle = `rgba(${r},${g},${b},${p.life * 0.72})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (0.4 + p.life), 0, TAU);
      ctx.fill();
    }

    for (let i = waves.length - 1; i >= 0; i--) {
      const wave = waves[i];
      wave.life -= dt * 1.25;
      if (wave.life <= 0) {
        waves.splice(i, 1);
        continue;
      }
      wave.radius += dt * 128;
      const [r, g, b] = wave.color;
      ctx.strokeStyle = `rgba(${r},${g},${b},${wave.life * 0.42})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(wave.x, wave.y, wave.radius, 0, TAU);
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
    drawJourneyPath(time);
    drawLandmarks(time);
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
