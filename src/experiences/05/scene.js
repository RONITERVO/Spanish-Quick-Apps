import { setReadoutRegion } from "../../shared/narration-target.js";
import { createSceneAudio } from "../../shared/audio.js";
import {
  requestSceneFrame as requestAnimationFrame,
  cancelSceneFrame as cancelAnimationFrame,
} from "../../shared/animation.js";
import content from "./content.json";
const { ZONES, LANDMARKS } = content;

export function mountScene() {
  const canvas = document.getElementById("galaxy-spectrum");
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
  let pointerY = 0.91;
  let targetX = 0.5;
  let targetY = 0.91;
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
    const random = seeded(18072027);
    stars.length = 0;
    dust.length = 0;
    cosmicRays.length = 0;

    const starCount = Math.max(230, Math.round((width * height) / 3600));
    for (let i = 0; i < starCount; i++) {
      const y = Math.pow(random(), 0.78);
      const topBias = 1 - y;
      stars.push({
        x: random(),
        y,
        r: 0.32 + random() * (1.15 + topBias * 1.4),
        alpha: 0.14 + random() * (0.48 + topBias * 0.3),
        phase: random() * TAU,
        speed: 0.4 + random() * 1.8,
        warmth: random(),
      });
    }

    for (let i = 0; i < 130; i++) {
      dust.push({
        x: random(),
        y: random(),
        r: 18 + random() * 90,
        alpha: 0.012 + random() * 0.048,
        phase: random() * TAU,
        hue: random(),
      });
    }

    for (let i = 0; i < 34; i++) {
      cosmicRays.push({
        x: random(),
        y: random(),
        len: 18 + random() * 80,
        speed: 0.00002 + random() * 0.00005,
        alpha: 0.08 + random() * 0.18,
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

    setReadoutRegion(readout, zone.id);
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
    bg.addColorStop(0, "#070814");
    bg.addColorStop(0.25, "#030611");
    bg.addColorStop(0.58, "#06091a");
    bg.addColorStop(0.82, "#09091e");
    bg.addColorStop(1, "#110d24");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    const solarGlow = ctx.createRadialGradient(
      width * 0.5,
      height * 1.04,
      0,
      width * 0.5,
      height * 1.04,
      height * 0.48,
    );
    solarGlow.addColorStop(0, "rgba(255,196,76,.74)");
    solarGlow.addColorStop(0.12, "rgba(255,154,64,.25)");
    solarGlow.addColorStop(0.38, "rgba(103,135,255,.08)");
    solarGlow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = solarGlow;
    ctx.fillRect(0, height * 0.52, width, height * 0.48);

    const galacticGlow = ctx.createRadialGradient(
      width * 0.5,
      -height * 0.04,
      0,
      width * 0.5,
      -height * 0.04,
      Math.max(width, height) * 0.68,
    );
    galacticGlow.addColorStop(0, "rgba(255,213,145,.32)");
    galacticGlow.addColorStop(0.14, "rgba(174,128,255,.18)");
    galacticGlow.addColorStop(0.5, "rgba(82,93,191,.07)");
    galacticGlow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = galacticGlow;
    ctx.fillRect(0, 0, width, height * 0.62);

    ctx.save();
    ctx.translate(width * 0.51, height * 0.07);
    ctx.rotate(-0.14);
    const band = ctx.createLinearGradient(-width * 0.65, 0, width * 0.65, 0);
    band.addColorStop(0, "rgba(120,100,220,0)");
    band.addColorStop(0.25, "rgba(145,128,239,.05)");
    band.addColorStop(0.5, "rgba(255,216,161,.18)");
    band.addColorStop(0.75, "rgba(143,121,235,.05)");
    band.addColorStop(1, "rgba(120,100,220,0)");
    ctx.fillStyle = band;
    ctx.scale(1, 0.18);
    ctx.beginPath();
    ctx.arc(0, 0, width * 0.72, 0, TAU);
    ctx.fill();
    ctx.restore();

    for (const star of stars) {
      const flicker =
        0.72 + Math.sin(time * 0.0012 * star.speed + star.phase) * 0.28;
      const x = star.x * width;
      const y = star.y * height;
      const topBoost = 1 + (1 - star.y) * 0.7;
      const alpha = star.alpha * flicker * topBoost;
      const warm = star.warmth > 0.88;
      ctx.fillStyle = warm
        ? `rgba(255,223,171,${alpha})`
        : `rgba(206,225,255,${alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, star.r, 0, TAU);
      ctx.fill();
      if (star.r > 1.55) {
        ctx.strokeStyle = warm
          ? `rgba(255,221,164,${alpha * 0.38})`
          : `rgba(178,211,255,${alpha * 0.34})`;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(x - star.r * 3.3, y);
        ctx.lineTo(x + star.r * 3.3, y);
        ctx.moveTo(x, y - star.r * 3.3);
        ctx.lineTo(x, y + star.r * 3.3);
        ctx.stroke();
      }
    }

    for (const mote of dust) {
      const drift = Math.sin(time * 0.00012 + mote.phase) * 7;
      const x = mote.x * width + drift;
      const y = mote.y * height;
      const purple = mote.hue > 0.55;
      const glow = ctx.createRadialGradient(x, y, 0, x, y, mote.r);
      glow.addColorStop(
        0,
        purple
          ? `rgba(174,105,255,${mote.alpha})`
          : `rgba(78,157,255,${mote.alpha})`,
      );
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(x - mote.r, y - mote.r, mote.r * 2, mote.r * 2);
    }

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const ray of cosmicRays) {
      const x = (((ray.x + time * ray.speed) % 1.12) - 0.06) * width;
      const y = ray.y * height + Math.sin(time * 0.0003 + ray.phase) * 8;
      ctx.strokeStyle = `rgba(160,210,255,${ray.alpha})`;
      ctx.lineWidth = 0.65;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + ray.len * 0.35, y - ray.len);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawJourneyPath(time) {
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const pathGrad = ctx.createLinearGradient(0, height, 0, 0);
    pathGrad.addColorStop(0, "rgba(255,193,88,.2)");
    pathGrad.addColorStop(0.23, "rgba(105,204,255,.34)");
    pathGrad.addColorStop(0.55, "rgba(121,224,218,.3)");
    pathGrad.addColorStop(0.78, "rgba(205,119,255,.34)");
    pathGrad.addColorStop(1, "rgba(255,214,151,.44)");
    ctx.strokeStyle = pathGrad;
    ctx.lineWidth = Math.max(1.4, Math.min(width, height) * 0.0032);
    ctx.shadowBlur = 18;
    ctx.shadowColor = "rgba(128,185,255,.32)";
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
      fade.addColorStop(0.32, `rgba(${r},${g},${b},.11)`);
      fade.addColorStop(0.5, `rgba(${r},${g},${b},.25)`);
      fade.addColorStop(0.68, `rgba(${r},${g},${b},.11)`);
      fade.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.strokeStyle = fade;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    const exitP = 0.995;
    const exitX = routeX(exitP);
    const exitY = routeY(exitP);
    const glow = ctx.createRadialGradient(
      exitX,
      exitY,
      0,
      exitX,
      exitY,
      Math.min(width, height) * 0.25,
    );
    glow.addColorStop(0, "rgba(231,202,255,.34)");
    glow.addColorStop(0.18, "rgba(167,121,255,.12)");
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height * 0.32);

    const pulseP = clamp(journeyFromY(pointerY));
    const pulseX = routeX(pulseP);
    const pulseY = routeY(pulseP);
    const pulse = 5 + Math.sin(time * 0.004) * 2.3;
    ctx.fillStyle = "rgba(255,255,255,.9)";
    ctx.shadowBlur = 18;
    ctx.shadowColor = "rgba(159,203,255,.86)";
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

  function drawSun(time, landmark) {
    const { x, y } = landmarkPoint(landmark);
    const r = Math.max(7, Math.min(landmark.size, height * 0.03));
    const pulse = 1 + Math.sin(time * 0.0016) * 0.06;
    starGlow(
      x,
      y,
      r * 4.4,
      "rgba(255,255,225,.95)",
      "rgba(255,190,72,.26)",
      "rgba(255,120,30,0)",
    );
    const grad = ctx.createRadialGradient(
      x - r * 0.32,
      y - r * 0.35,
      1,
      x,
      y,
      r * pulse,
    );
    grad.addColorStop(0, "#fffce8");
    grad.addColorStop(0.35, "#ffd66d");
    grad.addColorStop(0.78, "#ff923f");
    grad.addColorStop(1, "#b93620");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r * pulse, 0, TAU);
    ctx.fill();
  }

  function drawHeliosphere(time, landmark) {
    const { x, y } = landmarkPoint(landmark);
    const r = Math.min(landmark.size, Math.min(width, height) * 0.105);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.18);
    for (let i = 0; i < 3; i++) {
      const pulse = 1 + Math.sin(time * 0.001 + i * 1.8) * 0.025;
      ctx.strokeStyle = `rgba(${90 + i * 25},${181 + i * 14},255,${0.19 - i * 0.035})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(
        0,
        0,
        r * pulse * (1 + i * 0.11),
        r * 0.62 * pulse * (1 + i * 0.08),
        0,
        0,
        TAU,
      );
      ctx.stroke();
    }
    const tail = ctx.createLinearGradient(r * 0.3, 0, r * 2.1, 0);
    tail.addColorStop(0, "rgba(82,190,255,.16)");
    tail.addColorStop(1, "rgba(82,190,255,0)");
    ctx.fillStyle = tail;
    ctx.beginPath();
    ctx.moveTo(r * 0.2, -r * 0.35);
    ctx.quadraticCurveTo(r * 1.1, -r * 0.42, r * 2.2, -r * 0.12);
    ctx.lineTo(r * 2.2, r * 0.12);
    ctx.quadraticCurveTo(r * 1.1, r * 0.42, r * 0.2, r * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    starGlow(
      x - r * 0.23,
      y,
      r * 0.42,
      "rgba(255,247,194,.9)",
      "rgba(255,176,73,.22)",
      "rgba(255,130,30,0)",
    );
  }

  function drawOort(time, landmark) {
    const { x, y } = landmarkPoint(landmark);
    const r = Math.min(landmark.size, Math.min(width, height) * 0.13);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(time * 0.000025);
    for (let ring = 0; ring < 4; ring++) {
      const count = 20 + ring * 13;
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * TAU + ring * 0.53;
        const rr =
          r * (0.38 + ring * 0.18) * (1 + Math.sin(i * 2.31 + ring) * 0.1);
        const px = Math.cos(angle) * rr;
        const py = Math.sin(angle) * rr * (0.66 + ring * 0.035);
        const alpha = 0.16 + (i % 5) * 0.035;
        ctx.fillStyle = `rgba(205,225,255,${alpha})`;
        ctx.beginPath();
        ctx.arc(px, py, 0.7 + (i % 3) * 0.28, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
    starGlow(
      x,
      y,
      r * 0.32,
      "rgba(255,248,205,.75)",
      "rgba(255,180,80,.14)",
      "rgba(0,0,0,0)",
    );
  }

  function drawInterstellarCloud(time, landmark) {
    const { x, y } = landmarkPoint(landmark);
    const r = Math.min(landmark.size, Math.min(width, height) * 0.1);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + time * 0.00004;
      const px = x + Math.cos(a * 1.3) * r * 0.4;
      const py = y + Math.sin(a) * r * 0.26;
      const cloud = ctx.createRadialGradient(
        px,
        py,
        0,
        px,
        py,
        r * (0.48 + i * 0.025),
      );
      cloud.addColorStop(0, `rgba(94,152,231,${0.07 + i * 0.005})`);
      cloud.addColorStop(0.45, `rgba(85,119,198,${0.035 + i * 0.002})`);
      cloud.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = cloud;
      ctx.fillRect(px - r, py - r, r * 2, r * 2);
    }
  }

  function drawAlphaCentauri(time, landmark) {
    const { x, y } = landmarkPoint(landmark);
    const r = Math.min(landmark.size, Math.min(width, height) * 0.055);
    const orbit = r * 0.64;
    const angle = time * 0.00018;
    const ax = x + Math.cos(angle) * orbit;
    const ay = y + Math.sin(angle) * orbit * 0.42;
    const bx = x - Math.cos(angle) * orbit;
    const by = y - Math.sin(angle) * orbit * 0.42;
    starGlow(
      ax,
      ay,
      r * 1.6,
      "rgba(255,255,230,.96)",
      "rgba(255,216,119,.26)",
      "rgba(0,0,0,0)",
    );
    starGlow(
      bx,
      by,
      r * 1.45,
      "rgba(255,245,211,.92)",
      "rgba(255,176,92,.22)",
      "rgba(0,0,0,0)",
    );
    const px = x + r * 1.45;
    const py = y + r * 0.6;
    starGlow(
      px,
      py,
      r * 0.78,
      "rgba(255,184,144,.9)",
      "rgba(255,74,56,.25)",
      "rgba(0,0,0,0)",
    );
  }

  function drawNeighborhood(time, landmark) {
    const { x, y } = landmarkPoint(landmark);
    const r = Math.min(landmark.size, Math.min(width, height) * 0.11);
    const points = [
      [-0.66, -0.2, 1.8, "255,246,212"],
      [-0.25, 0.46, 1.2, "255,130,92"],
      [0.18, -0.47, 1.45, "200,225,255"],
      [0.58, 0.12, 2.2, "190,217,255"],
      [0.05, 0.18, 0.8, "255,206,126"],
      [0.72, -0.48, 0.85, "255,120,90"],
      [-0.62, 0.48, 0.72, "210,231,255"],
    ];
    for (let i = 0; i < points.length; i++) {
      const [dx, dy, size, color] = points[i];
      const pulse = 0.86 + Math.sin(time * 0.0018 + i * 1.3) * 0.14;
      starGlow(
        x + dx * r,
        y + dy * r,
        r * 0.16 * size,
        `rgba(${color},${0.82 * pulse})`,
        `rgba(${color},${0.16 * pulse})`,
        "rgba(0,0,0,0)",
      );
    }
    ctx.strokeStyle = "rgba(189,211,255,.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.stroke();
  }

  function drawLocalBubble(time, landmark) {
    const { x, y } = landmarkPoint(landmark);
    const r = Math.min(landmark.size, Math.min(width, height) * 0.135);
    const wobble = 1 + Math.sin(time * 0.0005) * 0.025;
    const fill = ctx.createRadialGradient(
      x - r * 0.18,
      y - r * 0.2,
      0,
      x,
      y,
      r * wobble,
    );
    fill.addColorStop(0, "rgba(102,239,225,.06)");
    fill.addColorStop(0.62, "rgba(82,198,211,.035)");
    fill.addColorStop(0.82, "rgba(117,238,222,.12)");
    fill.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.18 * wobble, r * 0.72, -0.16, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(141,255,236,.18)";
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.18 * wobble, r * 0.72, -0.16, 0, TAU);
    ctx.stroke();
  }

  function drawOrionSpur(time, landmark) {
    const { x, y } = landmarkPoint(landmark);
    const r = Math.min(landmark.size, Math.min(width, height) * 0.15);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.42);
    ctx.lineCap = "round";
    for (let arm = 0; arm < 3; arm++) {
      const grad = ctx.createLinearGradient(-r, 0, r, 0);
      grad.addColorStop(0, "rgba(84,129,255,0)");
      grad.addColorStop(
        0.5,
        `rgba(${120 + arm * 20},${170 + arm * 12},255,${0.2 - arm * 0.04})`,
      );
      grad.addColorStop(1, "rgba(84,129,255,0)");
      ctx.strokeStyle = grad;
      ctx.lineWidth = 8 - arm * 2.2;
      ctx.beginPath();
      ctx.moveTo(-r * 1.15, r * (0.32 - arm * 0.12));
      ctx.bezierCurveTo(
        -r * 0.4,
        -r * (0.5 + arm * 0.02),
        r * 0.35,
        r * (0.5 - arm * 0.08),
        r * 1.15,
        -r * (0.3 + arm * 0.06),
      );
      ctx.stroke();
    }
    for (let i = 0; i < 45; i++) {
      const t = i / 44;
      const px = -r * 1.05 + t * r * 2.1;
      const py =
        Math.sin(t * Math.PI * 2.1) * r * 0.35 + Math.sin(i * 2.7) * r * 0.12;
      ctx.fillStyle =
        i % 6 === 0 ? "rgba(255,222,163,.6)" : "rgba(191,218,255,.38)";
      ctx.beginPath();
      ctx.arc(px, py, 0.8 + (i % 3) * 0.35, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawNebula(time, landmark) {
    const { x, y } = landmarkPoint(landmark);
    const r = Math.min(landmark.size, Math.min(width, height) * 0.1);
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const colors = [
      [237, 88, 255],
      [105, 124, 255],
      [72, 224, 235],
      [255, 121, 184],
    ];
    for (let i = 0; i < 11; i++) {
      const a = i * 2.13 + time * 0.000035;
      const px = x + Math.cos(a) * r * (0.2 + (i % 4) * 0.13);
      const py = y + Math.sin(a * 1.2) * r * (0.15 + (i % 3) * 0.12);
      const rr = r * (0.42 + (i % 5) * 0.12);
      const c = colors[i % colors.length];
      const cloud = ctx.createRadialGradient(px, py, 0, px, py, rr);
      cloud.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},.16)`);
      cloud.addColorStop(0.5, `rgba(${c[0]},${c[1]},${c[2]},.07)`);
      cloud.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = cloud;
      ctx.fillRect(px - rr, py - rr, rr * 2, rr * 2);
    }
    ctx.restore();
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + 0.4;
      const px = x + Math.cos(a) * r * 0.34;
      const py = y + Math.sin(a) * r * 0.22;
      starGlow(
        px,
        py,
        r * 0.13,
        "rgba(225,242,255,.86)",
        "rgba(125,183,255,.18)",
        "rgba(0,0,0,0)",
      );
    }
  }

  function drawGalacticDisk(time, landmark) {
    const { x, y } = landmarkPoint(landmark);
    const r = Math.min(landmark.size, Math.min(width, height) * 0.17);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.12);
    for (let layer = 0; layer < 5; layer++) {
      const rr = r * (1 - layer * 0.11);
      const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, rr);
      glow.addColorStop(0, `rgba(255,224,165,${0.19 - layer * 0.018})`);
      glow.addColorStop(0.2, `rgba(201,166,255,${0.12 - layer * 0.012})`);
      glow.addColorStop(0.72, `rgba(103,131,255,${0.06 - layer * 0.006})`);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.save();
      ctx.scale(1, 0.22 + layer * 0.012);
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    ctx.strokeStyle = "rgba(18,15,42,.52)";
    ctx.lineWidth = r * 0.045;
    for (let i = -2; i <= 2; i++) {
      const yy = i * r * 0.055 + Math.sin(time * 0.00018 + i) * 1.2;
      ctx.beginPath();
      ctx.moveTo(-r * 0.95, yy);
      ctx.bezierCurveTo(
        -r * 0.3,
        yy - r * 0.08,
        r * 0.25,
        yy + r * 0.08,
        r * 0.95,
        yy,
      );
      ctx.stroke();
    }
    ctx.restore();
    starGlow(
      x,
      y,
      r * 0.5,
      "rgba(255,247,211,.55)",
      "rgba(255,183,99,.11)",
      "rgba(0,0,0,0)",
    );
  }

  function drawGalacticCenter(time, landmark) {
    const { x, y } = landmarkPoint(landmark);
    const r = Math.min(landmark.size, Math.min(width, height) * 0.075);
    starGlow(
      x,
      y,
      r * 3.1,
      "rgba(255,250,221,.88)",
      "rgba(255,177,73,.2)",
      "rgba(0,0,0,0)",
    );
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(time * 0.00012);
    const disk = ctx.createRadialGradient(0, 0, r * 0.14, 0, 0, r * 1.35);
    disk.addColorStop(0, "rgba(0,0,0,.94)");
    disk.addColorStop(0.16, "rgba(0,0,0,.96)");
    disk.addColorStop(0.28, "rgba(255,247,205,.88)");
    disk.addColorStop(0.43, "rgba(255,126,44,.52)");
    disk.addColorStop(0.72, "rgba(186,65,255,.2)");
    disk.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = disk;
    ctx.save();
    ctx.scale(1, 0.32);
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.35, 0, TAU);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#010103";
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.27, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawHalo(time, landmark) {
    const { x, y } = landmarkPoint(landmark);
    const r = Math.min(landmark.size, Math.min(width, height) * 0.15);
    const halo = ctx.createRadialGradient(x, y, 0, x, y, r * 1.2);
    halo.addColorStop(0, "rgba(174,146,255,.06)");
    halo.addColorStop(0.65, "rgba(133,114,227,.035)");
    halo.addColorStop(0.92, "rgba(190,168,255,.09)");
    halo.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.16, r * 0.82, 0.1, 0, TAU);
    ctx.fill();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + time * 0.000018;
      const rr = r * (0.4 + (i % 4) * 0.15);
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr * 0.7;
      const clusterR = 3 + (i % 3) * 1.5;
      starGlow(
        px,
        py,
        clusterR * 4.5,
        "rgba(255,230,178,.62)",
        "rgba(170,145,255,.12)",
        "rgba(0,0,0,0)",
      );
      ctx.fillStyle = "rgba(255,238,203,.75)";
      for (let j = 0; j < 7; j++) {
        const aa = (j / 7) * TAU;
        ctx.beginPath();
        ctx.arc(
          px + Math.cos(aa) * clusterR,
          py + Math.sin(aa) * clusterR,
          0.55,
          0,
          TAU,
        );
        ctx.fill();
      }
    }
  }

  function drawLandmarks(time) {
    for (const landmark of LANDMARKS) {
      switch (landmark.id) {
        case "sun":
          drawSun(time, landmark);
          break;
        case "heliosphere":
          drawHeliosphere(time, landmark);
          break;
        case "oort":
          drawOort(time, landmark);
          break;
        case "interstellar":
          drawInterstellarCloud(time, landmark);
          break;
        case "alpha":
          drawAlphaCentauri(time, landmark);
          break;
        case "neighborhood":
          drawNeighborhood(time, landmark);
          break;
        case "bubble":
          drawLocalBubble(time, landmark);
          break;
        case "orion":
          drawOrionSpur(time, landmark);
          break;
        case "nebula":
          drawNebula(time, landmark);
          break;
        case "disk":
          drawGalacticDisk(time, landmark);
          break;
        case "center":
          drawGalacticCenter(time, landmark);
          break;
        case "halo":
          drawHalo(time, landmark);
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
