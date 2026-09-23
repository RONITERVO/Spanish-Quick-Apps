import { createSceneAudio } from "../../shared/audio.js";
import {
  requestSceneFrame as requestAnimationFrame,
  cancelSceneFrame as cancelAnimationFrame,
} from "../../shared/animation.js";
import content from "./content.json";
const { ZONES, LANDMARKS } = content;

export function mountScene() {
  const canvas = document.getElementById("laniakea-spectrum");
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
  const fieldGalaxies = [];
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
    const random = seeded(18072031);
    stars.length = 0;
    dust.length = 0;
    cosmicRays.length = 0;
    fieldGalaxies.length = 0;

    const starCount = Math.max(150, Math.round((width * height) / 5000));
    for (let i = 0; i < starCount; i++) {
      const y = random();
      stars.push({
        x: random(),
        y,
        r: 0.25 + random() * 1.2,
        alpha: (0.07 + random() * 0.36) * (0.8 + Math.abs(y - 0.5) * 0.5),
        phase: random() * TAU,
        speed: 0.35 + random() * 1.5,
        warmth: random(),
      });
    }

    for (let i = 0; i < 78; i++) {
      dust.push({
        x: random(),
        y: random(),
        r: 24 + random() * 120,
        alpha: 0.006 + random() * 0.025,
        phase: random() * TAU,
        hue: random(),
      });
    }

    for (let i = 0; i < 18; i++) {
      cosmicRays.push({
        x: random(),
        y: random(),
        len: 18 + random() * 84,
        speed: 0.000009 + random() * 0.000024,
        alpha: 0.035 + random() * 0.085,
        phase: random() * TAU,
      });
    }

    const galaxyCount = Math.max(
      72,
      Math.min(150, Math.round((width * height) / 7000)),
    );
    for (let i = 0; i < galaxyCount; i++) {
      const y = 0.08 + random() * 0.84;
      const attractorBias = Math.pow(random(), 1.6);
      fieldGalaxies.push({
        x: random(),
        y,
        r: 0.7 + random() * 1.7 + attractorBias * 1.2,
        angle: random() * TAU,
        alpha: 0.08 + random() * 0.22,
        warm: random() > 0.72,
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
    const wave = Math.sin(progress * Math.PI * 2.08 - 0.55) * width * 0.075;
    const basinTurn = Math.sin(progress * Math.PI * 5.35 + 0.8) * width * 0.016;
    const attraction =
      Math.exp(-Math.pow((progress - 0.805) / 0.16, 2)) * width * 0.045;
    return width * 0.48 + wave + basinTurn + attraction;
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
    bg.addColorStop(0, "#0b081a");
    bg.addColorStop(0.16, "#050712");
    bg.addColorStop(0.43, "#020712");
    bg.addColorStop(0.68, "#07091a");
    bg.addColorStop(1, "#0e0b24");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    const localGlow = ctx.createRadialGradient(
      width * 0.46,
      height * 1.04,
      0,
      width * 0.46,
      height * 1.04,
      Math.max(width, height) * 0.58,
    );
    localGlow.addColorStop(0, "rgba(183,172,255,.31)");
    localGlow.addColorStop(0.18, "rgba(96,151,255,.12)");
    localGlow.addColorStop(0.5, "rgba(32,58,125,.035)");
    localGlow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = localGlow;
    ctx.fillRect(0, height * 0.44, width, height * 0.56);

    const attractor = landmarkPoint(
      LANDMARKS.find((item) => item.id === "great-attractor"),
    );
    const fieldGlow = ctx.createRadialGradient(
      attractor.x,
      attractor.y,
      8,
      attractor.x,
      attractor.y,
      Math.max(width, height) * 0.45,
    );
    fieldGlow.addColorStop(0, "rgba(255,158,83,.1)");
    fieldGlow.addColorStop(0.24, "rgba(176,76,130,.045)");
    fieldGlow.addColorStop(0.62, "rgba(73,72,169,.025)");
    fieldGlow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = fieldGlow;
    ctx.fillRect(0, 0, width, height * 0.7);

    const webGlow = ctx.createRadialGradient(
      width * 0.52,
      -height * 0.08,
      0,
      width * 0.52,
      -height * 0.08,
      Math.max(width, height) * 0.5,
    );
    webGlow.addColorStop(0, "rgba(202,190,255,.25)");
    webGlow.addColorStop(0.22, "rgba(95,178,255,.11)");
    webGlow.addColorStop(0.62, "rgba(83,55,164,.035)");
    webGlow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = webGlow;
    ctx.fillRect(0, 0, width, height * 0.42);

    for (const star of stars) {
      const flicker =
        0.76 + Math.sin(time * 0.00095 * star.speed + star.phase) * 0.24;
      const x = star.x * width;
      const y = star.y * height;
      const alpha = star.alpha * flicker;
      ctx.fillStyle =
        star.warmth > 0.9
          ? `rgba(255,224,184,${alpha})`
          : `rgba(206,224,255,${alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, star.r, 0, TAU);
      ctx.fill();
    }

    for (const mote of dust) {
      const drift = reducedMotion
        ? 0
        : Math.sin(time * 0.00008 + mote.phase) * 7;
      const x = mote.x * width + drift;
      const y = mote.y * height;
      const violet = mote.hue > 0.47;
      const glow = ctx.createRadialGradient(x, y, 0, x, y, mote.r);
      glow.addColorStop(
        0,
        violet
          ? `rgba(176,112,255,${mote.alpha})`
          : `rgba(65,179,218,${mote.alpha})`,
      );
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(x - mote.r, y - mote.r, mote.r * 2, mote.r * 2);
    }

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const galaxy of fieldGalaxies) {
      const x = galaxy.x * width;
      const y = galaxy.y * height;
      const twinkle = 0.78 + Math.sin(time * 0.0007 + galaxy.phase) * 0.22;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(galaxy.angle);
      ctx.scale(1, 0.34);
      ctx.fillStyle = galaxy.warm
        ? `rgba(255,210,156,${galaxy.alpha * twinkle})`
        : `rgba(163,207,255,${galaxy.alpha * twinkle})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, galaxy.r * 2.7, galaxy.r, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    for (const ray of cosmicRays) {
      const x = (((ray.x + time * ray.speed) % 1.14) - 0.07) * width;
      const y =
        ray.y * height +
        (reducedMotion ? 0 : Math.sin(time * 0.0002 + ray.phase) * 7);
      ctx.strokeStyle = `rgba(151,211,255,${ray.alpha})`;
      ctx.lineWidth = 0.52;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + ray.len * 0.26, y - ray.len);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawJourneyPath(time) {
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const pathGrad = ctx.createLinearGradient(0, height, 0, 0);
    pathGrad.addColorStop(0, "rgba(201,194,255,.42)");
    pathGrad.addColorStop(0.25, "rgba(84,218,225,.34)");
    pathGrad.addColorStop(0.48, "rgba(255,172,134,.31)");
    pathGrad.addColorStop(0.72, "rgba(255,154,104,.48)");
    pathGrad.addColorStop(1, "rgba(188,211,255,.5)");
    ctx.strokeStyle = pathGrad;
    ctx.lineWidth = Math.max(1.35, Math.min(width, height) * 0.003);
    ctx.shadowBlur = 18;
    ctx.shadowColor = "rgba(147,185,255,.32)";
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
      fade.addColorStop(0.3, `rgba(${r},${g},${b},.055)`);
      fade.addColorStop(0.5, `rgba(${r},${g},${b},.17)`);
      fade.addColorStop(0.7, `rgba(${r},${g},${b},.055)`);
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
      Math.min(width, height) * 0.3,
    );
    exitGlow.addColorStop(0, "rgba(206,211,255,.31)");
    exitGlow.addColorStop(0.25, "rgba(91,184,255,.11)");
    exitGlow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = exitGlow;
    ctx.fillRect(0, 0, width, height * 0.32);

    const pulseP = clamp(journeyFromY(pointerY));
    const pulseX = routeX(pulseP);
    const pulseY = routeY(pulseP);
    const pulse = 4.7 + Math.sin(time * 0.004) * 2.1;
    ctx.fillStyle = "rgba(255,255,255,.94)";
    ctx.shadowBlur = 18;
    ctx.shadowColor = "rgba(171,215,255,.9)";
    ctx.beginPath();
    ctx.arc(pulseX, pulseY, pulse, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function starGlow(x, y, radius, inner, middle, outer) {
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, inner);
    glow.addColorStop(0.2, middle);
    glow.addColorStop(1, outer);
    ctx.fillStyle = glow;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  function miniGalaxy(
    time,
    x,
    y,
    r,
    rotation,
    color = "164,206,255",
    alpha = 0.8,
    core = "255,230,190",
  ) {
    const breathe =
      1 + (reducedMotion ? 0 : Math.sin(time * 0.0008 + rotation * 7) * 0.035);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.scale(breathe, breathe);
    ctx.globalCompositeOperation = "screen";
    const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.2);
    halo.addColorStop(0, `rgba(${core},${alpha * 0.54})`);
    halo.addColorStop(0.24, `rgba(${color},${alpha * 0.2})`);
    halo.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = halo;
    ctx.fillRect(-r * 2.3, -r * 2.3, r * 4.6, r * 4.6);
    ctx.scale(1, 0.33);
    ctx.fillStyle = `rgba(${color},${alpha * 0.6})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.85, r, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = `rgba(${core},${alpha})`;
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(0.55, r * 0.33), 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function seededPoint(seed) {
    const a = Math.sin(seed * 91.17) * 43758.5453;
    return a - Math.floor(a);
  }

  function cubicPoint(a, b, c, d, t) {
    const u = 1 - t;
    return {
      x:
        u * u * u * a.x +
        3 * u * u * t * b.x +
        3 * u * t * t * c.x +
        t * t * t * d.x,
      y:
        u * u * u * a.y +
        3 * u * u * t * b.y +
        3 * u * t * t * c.y +
        t * t * t * d.y,
    };
  }

  function flowGeometry(index) {
    const attractor = landmarkPoint(
      LANDMARKS.find((item) => item.id === "great-attractor"),
    );
    const side = index % 2 ? 1 : -1;
    const rank = Math.floor(index / 2);
    const start = {
      x:
        width * (0.5 + side * (0.18 + (rank % 4) * 0.095)) +
        Math.sin(index * 2.1) * width * 0.025,
      y: height * (0.72 - (rank % 3) * 0.105),
    };
    const controlA = {
      x: start.x - side * width * (0.035 + (rank % 3) * 0.02),
      y: height * (0.54 - (rank % 2) * 0.05),
    };
    const controlB = {
      x: attractor.x + side * width * (0.16 + (rank % 4) * 0.035),
      y: attractor.y + height * (0.08 + (rank % 3) * 0.025),
    };
    const convergenceWidth = Math.min(width, height) * 0.105;
    const end = {
      x: attractor.x + Math.sin(index * 2.13 + 0.4) * convergenceWidth,
      y: attractor.y + Math.cos(index * 1.71) * convergenceWidth * 0.34,
    };
    return { start, controlA, controlB, end };
  }

  function drawGlobalFlows(time) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.lineCap = "round";
    const count = width < 520 ? 10 : 14;
    for (let index = 0; index < count; index++) {
      const g = flowGeometry(index);
      const grad = ctx.createLinearGradient(
        g.start.x,
        g.start.y,
        g.end.x,
        g.end.y,
      );
      grad.addColorStop(0, "rgba(75,192,235,0)");
      grad.addColorStop(
        0.23,
        `rgba(${index % 3 === 0 ? "83,223,224" : "114,177,255"},.09)`,
      );
      grad.addColorStop(0.72, "rgba(255,177,116,.17)");
      grad.addColorStop(1, "rgba(255,198,134,.03)");
      ctx.strokeStyle = grad;
      ctx.lineWidth = 0.72 + (index % 4) * 0.28;
      ctx.beginPath();
      for (let step = 0; step <= 32; step++) {
        const p = cubicPoint(g.start, g.controlA, g.controlB, g.end, step / 32);
        if (!step) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();

      const movers = width < 520 ? 2 : 3;
      for (let mover = 0; mover < movers; mover++) {
        const speed = reducedMotion
          ? 0
          : time * (0.000025 + index * 0.00000045);
        const t =
          (speed + mover / movers + seededPoint(index * 11 + mover)) % 1;
        const p = cubicPoint(g.start, g.controlA, g.controlB, g.end, t);
        const next = cubicPoint(
          g.start,
          g.controlA,
          g.controlB,
          g.end,
          Math.min(1, t + 0.01),
        );
        const angle = Math.atan2(next.y - p.y, next.x - p.x);
        miniGalaxy(
          time,
          p.x,
          p.y,
          1.4 + ((index + mover) % 3) * 0.42,
          angle,
          index % 3 ? "133,197,255" : "105,225,220",
          0.48,
        );
      }
    }
    ctx.restore();
  }

  function drawLocalGroupLimit(time, landmark) {
    const { x, y } = landmarkPoint(landmark);
    const r = Math.min(
      landmark.size * sceneScale(),
      Math.min(width, height) * 0.25,
    );
    ctx.save();
    ctx.strokeStyle = "rgba(199,194,255,.24)";
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 8]);
    ctx.beginPath();
    ctx.ellipse(
      x,
      y + r * 0.08,
      r * 1.12,
      r * 0.44,
      -0.04,
      Math.PI * 1.06,
      Math.PI * 1.94,
    );
    ctx.stroke();
    ctx.setLineDash([]);
    miniGalaxy(
      time,
      x - r * 0.28,
      y + r * 0.27,
      r * 0.13,
      -0.18,
      "173,177,255",
      0.68,
    );
    miniGalaxy(
      time,
      x + r * 0.32,
      y + r * 0.19,
      r * 0.16,
      0.22,
      "255,196,138",
      0.72,
    );
    starGlow(
      x,
      y - r * 0.02,
      r * 0.18,
      "rgba(220,219,255,.42)",
      "rgba(144,164,255,.09)",
      "rgba(0,0,0,0)",
    );
    ctx.restore();
  }

  function drawLocalVolume(time, landmark) {
    const { x, y } = landmarkPoint(landmark);
    const r = Math.min(
      landmark.size * sceneScale(),
      Math.min(width, height) * 0.18,
    );
    ctx.save();
    for (let i = 0; i < 23; i++) {
      const a = i * 2.399 + 0.4;
      const rr = r * (0.15 + seededPoint(i + 3) * 0.92);
      const px = x + Math.cos(a) * rr * 1.25;
      const py = y + Math.sin(a * 1.07) * rr * 0.72;
      miniGalaxy(
        time,
        px,
        py,
        1.6 + (i % 4) * 0.55,
        a,
        i % 5 === 0 ? "255,202,150" : "139,199,255",
        0.42 + (i % 3) * 0.08,
      );
    }
    ctx.strokeStyle = "rgba(130,190,255,.09)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.35, r * 0.78, 0.1, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  function drawLocalSheet(time, landmark) {
    const { x, y } = landmarkPoint(landmark);
    const r = Math.min(
      landmark.size * sceneScale(),
      Math.min(width, height) * 0.25,
    );
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.08);
    ctx.globalCompositeOperation = "screen";
    const band = ctx.createLinearGradient(-r * 1.7, 0, r * 1.7, 0);
    band.addColorStop(0, "rgba(70,220,222,0)");
    band.addColorStop(0.22, "rgba(74,221,221,.085)");
    band.addColorStop(0.5, "rgba(166,236,241,.16)");
    band.addColorStop(0.78, "rgba(77,205,228,.085)");
    band.addColorStop(1, "rgba(70,220,222,0)");
    ctx.fillStyle = band;
    ctx.beginPath();
    ctx.moveTo(-r * 1.75, -r * 0.08);
    ctx.quadraticCurveTo(0, -r * 0.2, r * 1.75, -r * 0.04);
    ctx.lineTo(r * 1.75, r * 0.08);
    ctx.quadraticCurveTo(0, r * 0.2, -r * 1.75, r * 0.04);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(134,238,236,.19)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-r * 1.62, 0);
    ctx.bezierCurveTo(-r * 0.58, -r * 0.08, r * 0.55, r * 0.08, r * 1.62, 0);
    ctx.stroke();
    for (let i = 0; i < 20; i++) {
      const px = -r * 1.34 + (i / 19) * r * 2.68;
      const py =
        Math.sin(i * 2.05) * r * 0.08 + (seededPoint(i + 44) - 0.5) * r * 0.09;
      miniGalaxy(
        time,
        px,
        py,
        1.7 + (i % 4) * 0.42,
        i * 0.43,
        i % 5 === 0 ? "255,213,164" : "114,224,226",
        0.54,
      );
    }
    ctx.restore();
  }

  function drawVirgoCluster(time, landmark) {
    const { x, y } = landmarkPoint(landmark);
    const r = Math.min(
      landmark.size * sceneScale(),
      Math.min(width, height) * 0.19,
    );
    starGlow(
      x,
      y,
      r * 1.3,
      "rgba(255,209,147,.15)",
      "rgba(255,161,111,.055)",
      "rgba(0,0,0,0)",
    );
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (let i = 0; i < 48; i++) {
      const a = i * 2.399 + 0.2;
      const rr =
        r * Math.sqrt((i + 0.5) / 48) * (0.8 + seededPoint(i + 72) * 0.32);
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr * 0.72;
      miniGalaxy(
        time,
        px,
        py,
        1.2 + (i % 5) * 0.45,
        a * 0.6,
        i % 7 === 0 ? "255,191,132" : "178,205,255",
        0.42 + (i % 4) * 0.07,
      );
    }
    const core = ctx.createRadialGradient(x, y, 0, x, y, r * 0.22);
    core.addColorStop(0, "rgba(255,247,218,.9)");
    core.addColorStop(0.22, "rgba(255,207,151,.42)");
    core.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.ellipse(x, y, r * 0.22, r * 0.15, -0.2, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawVirgoSupercluster(time, landmark) {
    const { x, y } = landmarkPoint(landmark);
    const r = Math.min(
      landmark.size * sceneScale(),
      Math.min(width, height) * 0.23,
    );
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.lineCap = "round";
    for (let branch = 0; branch < 6; branch++) {
      const side = branch % 2 ? 1 : -1;
      const sy = y + (branch - 2.5) * r * 0.14;
      const ex = x + side * r * (1.02 + (branch % 3) * 0.13);
      const ey = y - r * (0.12 + branch * 0.04);
      const grad = ctx.createLinearGradient(x, y, ex, ey);
      grad.addColorStop(0, "rgba(255,150,187,.18)");
      grad.addColorStop(1, "rgba(107,187,255,0)");
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1 + (branch % 3) * 0.35;
      ctx.beginPath();
      ctx.moveTo(x - side * r * 0.12, sy);
      ctx.bezierCurveTo(
        x + side * r * 0.25,
        sy - r * 0.2,
        ex - side * r * 0.24,
        ey + r * 0.12,
        ex,
        ey,
      );
      ctx.stroke();
      for (let j = 1; j <= 5; j++) {
        const t = j / 6;
        const px =
          (1 - t) * (x - side * r * 0.12) +
          t * ex +
          Math.sin(t * Math.PI) * side * r * 0.16;
        const py = (1 - t) * sy + t * ey - Math.sin(t * Math.PI) * r * 0.08;
        miniGalaxy(
          time,
          px,
          py,
          1.4 + (j % 3) * 0.55,
          branch + j,
          branch % 2 ? "255,155,194" : "122,194,255",
          0.46,
        );
      }
    }
    starGlow(
      x,
      y,
      r * 0.36,
      "rgba(255,211,173,.47)",
      "rgba(255,127,182,.12)",
      "rgba(0,0,0,0)",
    );
    ctx.restore();
  }

  function drawGalaxyFlows(time, landmark) {
    const { x, y } = landmarkPoint(landmark);
    const r = Math.min(
      landmark.size * sceneScale(),
      Math.min(width, height) * 0.25,
    );
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (let ring = 0; ring < 3; ring++) {
      ctx.strokeStyle = `rgba(104,208,255,${0.055 + ring * 0.025})`;
      ctx.lineWidth = 0.8;
      ctx.setLineDash([2 + ring, 7 + ring * 2]);
      ctx.beginPath();
      ctx.ellipse(
        x,
        y,
        r * (1.1 - ring * 0.18),
        r * (0.42 - ring * 0.045),
        -0.16,
        0.12,
        Math.PI * 1.8,
      );
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawLocalVoid(time, landmark) {
    const { x, y } = landmarkPoint(landmark);
    const r = Math.min(
      landmark.size * sceneScale(),
      Math.min(width, height) * 0.22,
    );
    ctx.save();
    const voidGradient = ctx.createRadialGradient(
      x - r * 0.12,
      y - r * 0.06,
      0,
      x,
      y,
      r * 1.12,
    );
    voidGradient.addColorStop(0, "rgba(0,1,8,.92)");
    voidGradient.addColorStop(0.58, "rgba(4,7,23,.78)");
    voidGradient.addColorStop(0.82, "rgba(52,65,162,.08)");
    voidGradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = voidGradient;
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.18, r * 0.86, -0.14, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(117,142,244,.14)";
    ctx.lineWidth = 1.1;
    ctx.setLineDash([3, 9]);
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.12, r * 0.82, -0.14, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU;
      const px = x + Math.cos(a) * r * 1.05;
      const py = y + Math.sin(a) * r * 0.77;
      miniGalaxy(time, px, py, 1.4 + (i % 3) * 0.38, a, "121,151,244", 0.28);
    }
    ctx.restore();
  }

  function drawGreatAttractor(time, landmark) {
    const { x, y } = landmarkPoint(landmark);
    const r = Math.min(
      landmark.size * sceneScale(),
      Math.min(width, height) * 0.34,
    );
    const pulse = 1 + (reducedMotion ? 0 : Math.sin(time * 0.00115) * 0.025);
    ctx.save();
    ctx.globalCompositeOperation = "screen";

    const leftField = ctx.createRadialGradient(
      x - r * 0.16,
      y + r * 0.02,
      0,
      x - r * 0.16,
      y + r * 0.02,
      r * 0.92 * pulse,
    );
    leftField.addColorStop(0, "rgba(255,186,118,.075)");
    leftField.addColorStop(0.28, "rgba(255,137,94,.08)");
    leftField.addColorStop(0.68, "rgba(177,79,145,.035)");
    leftField.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = leftField;
    ctx.fillRect(x - r * 1.2, y - r, r * 2.4, r * 2);

    const rightField = ctx.createRadialGradient(
      x + r * 0.18,
      y - r * 0.04,
      0,
      x + r * 0.18,
      y - r * 0.04,
      r * 0.78 * pulse,
    );
    rightField.addColorStop(0, "rgba(255,221,171,.055)");
    rightField.addColorStop(0.35, "rgba(236,128,157,.055)");
    rightField.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = rightField;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);

    for (let ring = 0; ring < 9; ring++) {
      const rr = r * (0.16 + ring * 0.095) * pulse;
      const alpha = 0.16 - ring * 0.012;
      const shiftX = Math.sin(ring * 1.7) * r * 0.045;
      const shiftY = Math.cos(ring * 1.23) * r * 0.022;
      ctx.strokeStyle = `rgba(${ring < 4 ? "255,194,130" : "221,131,177"},${alpha})`;
      ctx.lineWidth = ring % 3 === 0 ? 1.15 : 0.72;
      ctx.setLineDash(ring % 2 ? [3, 8] : [1, 6]);
      ctx.beginPath();
      ctx.ellipse(
        x + shiftX,
        y + shiftY,
        rr * (1.18 + ring * 0.022),
        rr * (0.48 + ring * 0.018),
        -0.23 + ring * 0.043,
        0.18 + ring * 0.025,
        TAU - 0.28 + ring * 0.018,
      );
      ctx.stroke();
    }
    ctx.setLineDash([]);

    for (let spoke = 0; spoke < 18; spoke++) {
      const a = (spoke / 18) * TAU + 0.13;
      const outer = r * (0.58 + (spoke % 5) * 0.1);
      const inner = r * (0.08 + (spoke % 3) * 0.018);
      const sx = x + Math.cos(a) * outer;
      const sy = y + Math.sin(a) * outer * 0.56;
      const spread = r * 0.13;
      const ex = x + Math.cos(a * 1.7 + spoke) * spread;
      const ey = y + Math.sin(a * 1.3 + spoke * 0.7) * spread * 0.42;
      const grad = ctx.createLinearGradient(sx, sy, ex, ey);
      grad.addColorStop(0, "rgba(128,181,255,0)");
      grad.addColorStop(0.52, "rgba(255,168,108,.085)");
      grad.addColorStop(1, "rgba(255,221,175,.2)");
      ctx.strokeStyle = grad;
      ctx.lineWidth = 0.75 + (spoke % 4) * 0.2;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(
        x + Math.cos(a + 0.6) * r * 0.3,
        y + Math.sin(a + 0.6) * r * 0.18,
        ex,
        ey,
      );
      ctx.stroke();
    }

    // No central body is drawn: the destination is a broad convergence field.
    ctx.restore();
  }

  function drawLaniakeaBasin(time, landmark) {
    const { x, y } = landmarkPoint(landmark);
    const r = Math.min(
      landmark.size * sceneScale(),
      Math.min(width, height) * 0.43,
    );
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.lineCap = "round";
    for (let contour = 0; contour < 7; contour++) {
      const spread = r * (1 - contour * 0.09);
      const alpha = 0.04 + contour * 0.012;
      ctx.strokeStyle = `rgba(${contour % 2 ? "201,145,255" : "134,193,255"},${alpha})`;
      ctx.lineWidth = 0.75 + (contour % 3) * 0.28;
      ctx.setLineDash(contour < 2 ? [6, 10] : []);
      ctx.beginPath();
      ctx.moveTo(x - spread * 1.35, y + spread * 0.35);
      ctx.bezierCurveTo(
        x - spread * 0.92,
        y - spread * 0.6,
        x - spread * 0.18,
        y - spread * 0.72,
        x,
        y - spread * 0.26,
      );
      ctx.bezierCurveTo(
        x + spread * 0.27,
        y - spread * 0.82,
        x + spread * 1.18,
        y - spread * 0.49,
        x + spread * 1.34,
        y + spread * 0.12,
      );
      ctx.bezierCurveTo(
        x + spread * 0.94,
        y + spread * 0.58,
        x + spread * 0.2,
        y + spread * 0.72,
        x - spread * 0.38,
        y + spread * 0.5,
      );
      ctx.bezierCurveTo(
        x - spread * 0.77,
        y + spread * 0.7,
        x - spread * 1.16,
        y + spread * 0.64,
        x - spread * 1.35,
        y + spread * 0.35,
      );
      ctx.stroke();
    }
    ctx.setLineDash([]);
    for (let i = 0; i < 32; i++) {
      const a = i * 2.399;
      const rr = r * (0.2 + seededPoint(i + 180) * 1.12);
      const px = x + Math.cos(a) * rr * 1.14;
      const py = y + Math.sin(a) * rr * 0.48;
      miniGalaxy(
        time,
        px,
        py,
        1.2 + (i % 4) * 0.35,
        a,
        i % 6 === 0 ? "226,161,255" : "132,195,255",
        0.24 + (i % 3) * 0.045,
      );
    }
    ctx.restore();
  }

  function drawBoundary(time, landmark) {
    const { x, y } = landmarkPoint(landmark);
    const r = Math.min(
      landmark.size * sceneScale(),
      Math.min(width, height) * 0.38,
    );
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.strokeStyle = "rgba(197,213,255,.2)";
    ctx.lineWidth = 1.2;
    ctx.setLineDash([5, 9]);
    ctx.beginPath();
    ctx.ellipse(
      x,
      y + r * 0.2,
      r * 1.35,
      r * 0.54,
      -0.02,
      Math.PI * 0.1,
      Math.PI * 0.9,
      true,
    );
    ctx.stroke();
    ctx.setLineDash([]);

    for (let strand = 0; strand < 9; strand++) {
      const startX = width * (-0.05 + strand * 0.14);
      const endX =
        width * (0.02 + strand * 0.125) +
        Math.sin(strand * 1.8) * width * 0.035;
      const color =
        strand % 3 === 0
          ? "214,159,255"
          : strand % 3 === 1
            ? "105,207,255"
            : "164,201,255";
      ctx.strokeStyle = `rgba(${color},${0.055 + (strand % 3) * 0.018})`;
      ctx.lineWidth = 1 + (strand % 4) * 0.3;
      ctx.beginPath();
      ctx.moveTo(startX, height * 0.145);
      ctx.bezierCurveTo(
        startX + width * 0.07,
        height * 0.095,
        endX - width * 0.04,
        height * 0.055,
        endX,
        -height * 0.06,
      );
      ctx.stroke();
      if (strand % 2 === 0) {
        const nodeY = height * (0.055 + (strand % 3) * 0.02);
        starGlow(
          endX,
          nodeY,
          12 + (strand % 3) * 4,
          "rgba(224,235,255,.42)",
          `rgba(${color},.12)`,
          "rgba(0,0,0,0)",
        );
      }
    }
    ctx.restore();

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.shadowBlur = 14;
    ctx.shadowColor = "rgba(153,190,255,.32)";
    ctx.fillStyle = "rgba(224,230,255,.5)";
    ctx.font = `800 ${Math.max(8, Math.min(11, width * 0.023))}px Inter, system-ui, sans-serif`;
    ctx.fillText("MÁS ALLÁ", width * 0.5, Math.max(7, height * 0.009));
    ctx.fillStyle = "rgba(213,224,255,.65)";
    ctx.font = `900 ${Math.max(9, Math.min(13, width * 0.027))}px Inter, system-ui, sans-serif`;
    ctx.fillText(
      "FILAMENTOS · VACÍOS · NODOS",
      width * 0.5,
      Math.max(21, height * 0.03),
    );
    ctx.restore();
  }

  function drawLandmarks(time) {
    drawLaniakeaBasin(
      time,
      LANDMARKS.find((item) => item.id === "laniakea-basin"),
    );
    drawGlobalFlows(time);
    drawLocalGroupLimit(
      time,
      LANDMARKS.find((item) => item.id === "local-group-limit"),
    );
    drawLocalVolume(
      time,
      LANDMARKS.find((item) => item.id === "local-volume"),
    );
    drawLocalSheet(
      time,
      LANDMARKS.find((item) => item.id === "local-sheet"),
    );
    drawVirgoCluster(
      time,
      LANDMARKS.find((item) => item.id === "virgo-cluster"),
    );
    drawVirgoSupercluster(
      time,
      LANDMARKS.find((item) => item.id === "virgo-supercluster"),
    );
    drawGalaxyFlows(
      time,
      LANDMARKS.find((item) => item.id === "galaxy-flows"),
    );
    drawLocalVoid(
      time,
      LANDMARKS.find((item) => item.id === "local-void"),
    );
    drawGreatAttractor(
      time,
      LANDMARKS.find((item) => item.id === "great-attractor"),
    );
    drawBoundary(
      time,
      LANDMARKS.find((item) => item.id === "boundary"),
    );
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
