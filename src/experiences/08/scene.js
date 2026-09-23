import { setReadoutRegion } from "../../shared/narration-target.js";
import { createSceneAudio } from "../../shared/audio.js";
import {
  requestSceneFrame as requestAnimationFrame,
  cancelSceneFrame as cancelAnimationFrame,
} from "../../shared/animation.js";
import content from "./content.json";
const { ZONES } = content;

export function mountScene() {
  const canvas = document.getElementById("cosmic-web-spectrum");
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
  const webLayers = [];
  const voids = [];
  const walls = [];
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
  let lastZoneId = "";
  let lastFeature = -1;
  let hideTimer = 0;
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

  function clamp(value, min = 0, max = 1) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function smoothstep(a, b, x) {
    const t = clamp((x - a) / Math.max(0.00001, b - a));
    return t * t * (3 - 2 * t);
  }

  function seeded(seed) {
    let value = seed >>> 0;
    return () => {
      value = (value * 1664525 + 1013904223) >>> 0;
      return value / 4294967296;
    };
  }

  function seededPoint(seed) {
    const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  function journeyFromY(yNorm) {
    return clamp(1 - yNorm);
  }

  function zoneForJourney(progress) {
    const p = clamp(progress, 0, 0.999999);
    for (const zone of ZONES) {
      if (p >= zone.p0 && p < zone.p1) return zone;
    }
    return ZONES[ZONES.length - 1];
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

  function sceneScale() {
    return clamp(Math.min(width / 390, height / 780), 0.72, 1.72);
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
    const random = seeded(26071831);
    stars.length = 0;
    dust.length = 0;
    webLayers.length = 0;
    voids.length = 0;
    walls.length = 0;

    const starCount = Math.max(120, Math.round((width * height) / 5800));
    for (let i = 0; i < starCount; i++) {
      stars.push({
        x: random(),
        y: random(),
        r: 0.22 + random() * 1.08,
        alpha: 0.035 + random() * 0.22,
        phase: random() * TAU,
        speed: 0.18 + random() * 0.85,
        cool: random(),
      });
    }

    for (let i = 0; i < 56; i++) {
      dust.push({
        x: random(),
        y: random(),
        r: 36 + random() * 160,
        alpha: 0.004 + random() * 0.018,
        hue: random(),
        phase: random() * TAU,
      });
    }

    const layerSpecs = [
      {
        z: 0.18,
        count: 24,
        threshold: 0.37,
        k: 3,
        alpha: 0.11,
        width: 0.65,
        drift: 0.0024,
      },
      {
        z: 0.42,
        count: 29,
        threshold: 0.32,
        k: 3,
        alpha: 0.16,
        width: 0.9,
        drift: 0.0032,
      },
      {
        z: 0.68,
        count: 34,
        threshold: 0.28,
        k: 4,
        alpha: 0.22,
        width: 1.15,
        drift: 0.004,
      },
      {
        z: 0.92,
        count: 39,
        threshold: 0.255,
        k: 4,
        alpha: 0.27,
        width: 1.35,
        drift: 0.0048,
      },
    ];

    layerSpecs.forEach((spec, layerIndex) => {
      const nodes = [];
      const anchors = [
        { x: 0.15 + random() * 0.12, y: 0.12 + random() * 0.18 },
        { x: 0.48 + random() * 0.08, y: 0.18 + random() * 0.18 },
        { x: 0.78 + random() * 0.12, y: 0.1 + random() * 0.22 },
        { x: 0.24 + random() * 0.12, y: 0.44 + random() * 0.22 },
        { x: 0.59 + random() * 0.13, y: 0.43 + random() * 0.2 },
        { x: 0.84 + random() * 0.08, y: 0.5 + random() * 0.2 },
        { x: 0.15 + random() * 0.13, y: 0.72 + random() * 0.15 },
        { x: 0.46 + random() * 0.12, y: 0.7 + random() * 0.18 },
        { x: 0.75 + random() * 0.15, y: 0.75 + random() * 0.15 },
      ];

      for (let i = 0; i < spec.count; i++) {
        const a = anchors[i % anchors.length];
        const spread = 0.07 + random() * 0.12;
        const x = clamp(a.x + (random() - 0.5) * spread * 2.2, -0.08, 1.08);
        const y = clamp(a.y + (random() - 0.5) * spread * 1.9, -0.08, 1.08);
        nodes.push({
          x,
          y,
          mass: 0.45 + Math.pow(random(), 2.2) * 1.85,
          phase: random() * TAU,
          tilt: (random() - 0.5) * 0.7,
          warmth: random(),
        });
      }

      const edges = [];
      const edgeSet = new Set();
      for (let i = 0; i < nodes.length; i++) {
        const nearest = [];
        for (let j = 0; j < nodes.length; j++) {
          if (i === j) continue;
          const dx = nodes[i].x - nodes[j].x;
          const dy = (nodes[i].y - nodes[j].y) * 1.08;
          const dist = Math.hypot(dx, dy);
          if (dist <= spec.threshold) nearest.push({ j, dist });
        }
        nearest.sort((a, b) => a.dist - b.dist);
        for (const item of nearest.slice(0, spec.k)) {
          const a = Math.min(i, item.j);
          const b = Math.max(i, item.j);
          const key = `${a}:${b}`;
          if (edgeSet.has(key)) continue;
          edgeSet.add(key);
          edges.push({
            a,
            b,
            bend: (random() - 0.5) * 0.12,
            phase: random() * TAU,
            strength: 0.52 + random() * 0.65,
          });
        }
      }

      webLayers.push({ ...spec, nodes, edges, layerIndex });
    });

    const voidBands = [
      [0.37, 0.46, 5],
      [0.46, 0.58, 4],
      [0.72, 0.9, 3],
    ];
    voidBands.forEach(([top, bottom, count], band) => {
      for (let i = 0; i < count; i++) {
        const y = lerp(top, bottom, (i + 0.4 + random() * 0.35) / count);
        voids.push({
          x: 0.08 + random() * 0.84,
          y,
          rx: 0.085 + random() * 0.16,
          ry: 0.045 + random() * 0.095,
          angle: (random() - 0.5) * 0.6,
          depth: random(),
          phase: random() * TAU,
          band,
        });
      }
    });

    for (let i = 0; i < 8; i++) {
      const y = 0.44 + random() * 0.19;
      const x = 0.08 + random() * 0.8;
      const points = [];
      const count = 5 + Math.floor(random() * 4);
      for (let p = 0; p < count; p++) {
        points.push({
          x: x + (p / (count - 1) - 0.5) * (0.28 + random() * 0.25),
          y:
            y +
            Math.sin(p * 1.2 + i) * (0.025 + random() * 0.035) +
            (random() - 0.5) * 0.025,
        });
      }
      walls.push({
        points,
        width: 0.035 + random() * 0.055,
        alpha: 0.025 + random() * 0.035,
        hue: random(),
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

  function ensureAudio() {
    if (audioCtx) {
      if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
      return;
    }
    audioCtx = createSceneAudio();
    if (!audioCtx) return;
    master = audioCtx.createGain();
    master.gain.value = 0.36;

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
    droneB.frequency.value = 62.4;
    droneGain.gain.value = 0.0001;
    droneFilter.type = "lowpass";
    droneFilter.frequency.value = 1000;
    droneFilter.Q.value = 1.15;
    droneA.connect(droneFilter);
    droneB.connect(droneFilter);
    droneFilter.connect(droneGain);
    droneGain.connect(master);
    droneA.start();
    droneB.start();

    pulseOsc = audioCtx.createOscillator();
    pulseGain = audioCtx.createGain();
    pulseOsc.type = "sine";
    pulseOsc.frequency.value = 0.8;
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
    noiseFilter.frequency.value = 580;
    noiseFilter.Q.value = 0.65;
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
      s.filter * (0.86 + xNorm * 0.34),
      now,
      0.07,
    );
    droneFilter.Q.setTargetAtTime(1.05 + xNorm * 2.15, now, 0.08);
    droneGain.gain.setTargetAtTime(
      active ? 0.145 : 0.0001,
      now,
      active ? 0.05 : 0.22,
    );
    pulseOsc.frequency.setTargetAtTime(0.38 + s.pulse * 3.2, now, 0.08);
    pulseGain.gain.setTargetAtTime(
      active ? 0.012 + s.pulse * 0.03 : 0.0001,
      now,
      0.08,
    );
    noiseFilter.frequency.setTargetAtTime(240 + s.filter * 0.36, now, 0.08);
    noiseGain.gain.setTargetAtTime(active ? s.noise * 0.11 : 0.0001, now, 0.09);
    if (stereo) stereo.pan.setTargetAtTime((xNorm - 0.5) * 1.15, now, 0.07);
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
    osc.frequency.setValueAtTime(zone.sound.base * 2.9 * scale, now);
    osc.frequency.exponentialRampToValueAtTime(
      zone.sound.base * 4.7 * scale,
      now + 0.25,
    );
    filter.type = "lowpass";
    filter.frequency.value = Math.min(6200, zone.sound.filter * 1.7);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.1, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.44);
    osc.connect(filter);
    filter.connect(gain);
    if (pan) {
      pan.pan.value = (xNorm - 0.5) * 1.35;
      gain.connect(pan);
      pan.connect(master);
    } else gain.connect(master);
    osc.start(now);
    osc.stop(now + 0.48);
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
    const count = reducedMotion ? 5 : 16;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * TAU;
      const speed = 22 + Math.random() * 94;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        decay: 0.7 + Math.random() * 0.65,
        r: 0.8 + Math.random() * 2.7,
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
    zoneName.classList.toggle("compact", zone.name.length > 17);
    zoneName.classList.toggle("long", zone.name.length > 23);
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
    else if (event.key === "End") targetY = 0.035;
    else if (event.key === " " || event.key === "Enter") {
    } else handled = false;
    if (!handled) return;
    event.preventDefault();
    targetX = clamp(targetX, 0.02, 0.98);
    targetY = clamp(targetY, 0.025, 0.975);
    updateReadout(targetX * width, targetY * height, true);
    releaseInteraction(1500);
  });

  function starGlow(x, y, radius, core, mid, edge) {
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, core);
    glow.addColorStop(0.16, mid);
    glow.addColorStop(1, edge);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, TAU);
    ctx.fill();
  }

  function drawBackground(time) {
    const bg = ctx.createLinearGradient(0, height, 0, 0);
    bg.addColorStop(0, "#0b0719");
    bg.addColorStop(0.09, "#050817");
    bg.addColorStop(0.24, "#030813");
    bg.addColorStop(0.43, "#02050d");
    bg.addColorStop(0.63, "#030711");
    bg.addColorStop(0.82, "#050819");
    bg.addColorStop(1, "#02040c");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    const bottomBasin = ctx.createRadialGradient(
      width * 0.5,
      height * 1.02,
      0,
      width * 0.5,
      height * 1.02,
      Math.max(width, height) * 0.64,
    );
    bottomBasin.addColorStop(0, "rgba(183,119,255,.14)");
    bottomBasin.addColorStop(0.28, "rgba(87,140,255,.08)");
    bottomBasin.addColorStop(0.64, "rgba(24,41,92,.025)");
    bottomBasin.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = bottomBasin;
    ctx.fillRect(0, height * 0.7, width, height * 0.3);

    const topField = ctx.createRadialGradient(
      width * 0.5,
      -height * 0.03,
      0,
      width * 0.5,
      0,
      Math.max(width, height) * 0.74,
    );
    topField.addColorStop(0, "rgba(153,198,255,.09)");
    topField.addColorStop(0.42, "rgba(83,107,187,.025)");
    topField.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = topField;
    ctx.fillRect(0, 0, width, height * 0.55);

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const star of stars) {
      const twinkle = reducedMotion
        ? 1
        : 0.77 + Math.sin(time * 0.001 * star.speed + star.phase) * 0.23;
      const px = star.x * width;
      const py = star.y * height;
      const alpha = star.alpha * twinkle;
      ctx.fillStyle =
        star.cool > 0.64
          ? `rgba(182,215,255,${alpha})`
          : `rgba(255,244,225,${alpha * 0.78})`;
      ctx.beginPath();
      ctx.arc(px, py, star.r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const cloud of dust) {
      const pulse = reducedMotion
        ? 1
        : 0.9 + Math.sin(time * 0.00023 + cloud.phase) * 0.1;
      const x = cloud.x * width;
      const y = cloud.y * height;
      const r = cloud.r * sceneScale() * pulse;
      const c = cloud.hue > 0.55 ? "104,138,232" : "164,104,224";
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${c},${cloud.alpha})`);
      g.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.restore();
  }

  function depthProject(node, layer, time) {
    const parallaxX = (pointerX - 0.5) * (layer.z - 0.45) * width * 0.042;
    const parallaxY = (pointerY - 0.5) * (layer.z - 0.45) * height * 0.022;
    const slow = reducedMotion
      ? 0
      : Math.sin(time * layer.drift + node.phase) * 2.1 * layer.z;
    const cx = width * 0.5;
    const cy = height * 0.5;
    const depthScale = 0.78 + layer.z * 0.34;
    return {
      x: cx + (node.x * width - cx) * depthScale + parallaxX + slow,
      y:
        cy +
        (node.y * height - cy) * depthScale +
        parallaxY +
        Math.cos(time * layer.drift * 0.63 + node.phase) * 1.35 * layer.z,
    };
  }

  function edgeVisibility(yNorm, layerIndex) {
    const p = 1 - yNorm;
    const local = smoothstep(0.11, 0.31, p);
    const deep = smoothstep(0.62, 0.93, p);
    const topSoft = 1 - smoothstep(0.94, 1.02, p) * 0.18;
    return (
      clamp(0.42 + local * 0.28 + deep * (0.12 + layerIndex * 0.045), 0, 1) *
      topSoft
    );
  }

  function drawFilament(edge, layer, points, time) {
    const a = points[edge.a];
    const b = points[edge.b];
    if (!a || !b) return;

    const mx = (a.x + b.x) * 0.5;
    const my = (a.y + b.y) * 0.5;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 2 || len > Math.max(width, height) * 0.52) return;

    const normalX = -dy / len;
    const normalY = dx / len;
    const bend = edge.bend * Math.min(width, height);
    const cx = mx + normalX * bend;
    const cy = my + normalY * bend;
    const yNorm = ((a.y + b.y) * 0.5) / height;
    const visibility = edgeVisibility(yNorm, layer.layerIndex);
    const shimmer = reducedMotion
      ? 1
      : 0.88 + Math.sin(time * 0.00038 + edge.phase) * 0.12;
    const alpha = layer.alpha * edge.strength * visibility * shimmer;
    const topBias = smoothstep(0.72, 1, 1 - yNorm);
    const r = Math.round(lerp(92, 171, layer.z) + topBias * 18);
    const g = Math.round(lerp(148, 220, layer.z) + topBias * 7);
    const bcol = 255;

    ctx.save();
    ctx.lineCap = "round";
    ctx.globalCompositeOperation = "screen";

    ctx.strokeStyle = `rgba(${r},${g},${bcol},${alpha * 0.15})`;
    ctx.lineWidth = layer.width * (6.5 + layer.z * 4.5);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(cx, cy, b.x, b.y);
    ctx.stroke();

    ctx.strokeStyle = `rgba(${r},${g},${bcol},${alpha * 0.34})`;
    ctx.lineWidth = layer.width * (2.2 + layer.z * 1.3);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(cx, cy, b.x, b.y);
    ctx.stroke();

    ctx.strokeStyle = `rgba(228,242,255,${alpha * 0.53})`;
    ctx.lineWidth = Math.max(0.45, layer.width * 0.62);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(cx, cy, b.x, b.y);
    ctx.stroke();

    ctx.restore();
  }

  function drawNode(node, layer, point, time) {
    const yNorm = point.y / height;
    const p = 1 - yNorm;
    const nodeBand = 0.52 + smoothstep(0.22, 0.36, p) * 0.4;
    const topEvening = 1 - smoothstep(0.9, 1, p) * 0.28;
    const alpha = layer.alpha * node.mass * nodeBand * topEvening;
    const pulse = reducedMotion
      ? 1
      : 0.96 + Math.sin(time * 0.00075 + node.phase) * 0.04;
    const radius =
      (2.6 + node.mass * 5.2) * (0.7 + layer.z * 0.5) * sceneScale() * pulse;
    const warm = node.warmth > 0.72;
    const core = warm
      ? `rgba(255,238,210,${Math.min(0.8, alpha * 0.9)})`
      : `rgba(229,245,255,${Math.min(0.82, alpha)})`;
    const mid = warm
      ? `rgba(255,174,103,${alpha * 0.36})`
      : `rgba(105,197,255,${alpha * 0.4})`;

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    starGlow(point.x, point.y, radius * 3.9, core, mid, "rgba(0,0,0,0)");

    const galaxyCount = node.mass > 1.45 ? 8 : node.mass > 0.95 ? 5 : 3;
    for (let i = 0; i < galaxyCount; i++) {
      const a = i * 2.399 + node.phase;
      const rr = radius * (0.35 + (i % 4) * 0.31);
      const gx = point.x + Math.cos(a) * rr;
      const gy = point.y + Math.sin(a) * rr * 0.55;
      ctx.fillStyle =
        warm && i % 3 === 0
          ? `rgba(255,219,181,${alpha * 0.52})`
          : `rgba(218,237,255,${alpha * 0.46})`;
      ctx.beginPath();
      ctx.ellipse(
        gx,
        gy,
        0.55 + (i % 2) * 0.35,
        0.22 + (i % 3) * 0.08,
        a,
        0,
        TAU,
      );
      ctx.fill();
    }
    ctx.restore();
  }

  function drawWeb(time) {
    const sorted = [...webLayers].sort((a, b) => a.z - b.z);
    for (const layer of sorted) {
      const points = layer.nodes.map((node) => depthProject(node, layer, time));
      for (const edge of layer.edges) drawFilament(edge, layer, points, time);
      for (let i = 0; i < layer.nodes.length; i++)
        drawNode(layer.nodes[i], layer, points[i], time);
    }
  }

  function drawVoids(time) {
    ctx.save();
    for (const v of voids) {
      const x = v.x * width;
      const y = v.y * height;
      const pulse = reducedMotion
        ? 1
        : 0.98 + Math.sin(time * 0.0003 + v.phase) * 0.02;
      const rx = v.rx * width * pulse;
      const ry = v.ry * height * pulse;
      const darkness = 0.18 + v.depth * 0.18;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(v.angle);

      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(rx, ry));
      g.addColorStop(0, `rgba(0,1,8,${darkness})`);
      g.addColorStop(0.62, `rgba(0,2,10,${darkness * 0.8})`);
      g.addColorStop(0.88, "rgba(26,42,87,.025)");
      g.addColorStop(1, "rgba(98,132,216,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
      ctx.fill();

      ctx.globalCompositeOperation = "screen";
      ctx.strokeStyle = `rgba(112,145,221,${0.025 + v.depth * 0.03})`;
      ctx.lineWidth = 0.7;
      ctx.setLineDash([3, 10]);
      ctx.beginPath();
      ctx.ellipse(0, 0, rx * 1.02, ry * 1.02, 0, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
    ctx.restore();
  }

  function drawWalls(time) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const wall of walls) {
      const pts = wall.points.map((p) => ({ x: p.x * width, y: p.y * height }));
      const phase = reducedMotion
        ? 0
        : Math.sin(time * 0.00034 + wall.phase) * 2;
      const c = wall.hue > 0.5 ? "169,126,255" : "92,180,255";

      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const nx = i === 0 ? pts[1].y - p.y : p.y - pts[i - 1].y;
        const ny = i === 0 ? p.x - pts[1].x : pts[i - 1].x - p.x;
        const nlen = Math.hypot(nx, ny) || 1;
        const x = p.x + (nx / nlen) * wall.width * height + phase;
        const y = p.y + (ny / nlen) * wall.width * height;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      for (let i = pts.length - 1; i >= 0; i--) {
        const p = pts[i];
        const nx =
          i === pts.length - 1 ? p.y - pts[i - 1].y : pts[i + 1].y - p.y;
        const ny =
          i === pts.length - 1 ? pts[i - 1].x - p.x : p.x - pts[i + 1].x;
        const nlen = Math.hypot(nx, ny) || 1;
        ctx.lineTo(
          p.x - (nx / nlen) * wall.width * height + phase,
          p.y - (ny / nlen) * wall.width * height,
        );
      }
      ctx.closePath();

      const grad = ctx.createLinearGradient(
        pts[0].x,
        pts[0].y,
        pts.at(-1).x,
        pts.at(-1).y,
      );
      grad.addColorStop(0, `rgba(${c},0)`);
      grad.addColorStop(0.5, `rgba(${c},${wall.alpha})`);
      grad.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.strokeStyle = `rgba(${c},${wall.alpha * 1.7})`;
      ctx.lineWidth = 0.65;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawLaniakeaMemory(time) {
    const x = width * 0.5;
    const y = height * 0.955;
    const r = Math.min(width * 0.28, height * 0.13);
    const pulse = reducedMotion ? 1 : 1 + Math.sin(time * 0.00055) * 0.015;

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (let ring = 0; ring < 5; ring++) {
      const rr = r * (0.45 + ring * 0.22) * pulse;
      ctx.strokeStyle = `rgba(${ring % 2 ? "193,137,255" : "113,174,255"},${0.12 - ring * 0.017})`;
      ctx.lineWidth = ring === 0 ? 1.2 : 0.75;
      ctx.setLineDash(ring > 2 ? [4, 8] : []);
      ctx.beginPath();
      ctx.ellipse(
        x + Math.sin(ring) * r * 0.04,
        y,
        rr * 1.32,
        rr * 0.35,
        -0.08 + ring * 0.035,
        Math.PI * 1.03,
        Math.PI * 1.97,
      );
      ctx.stroke();
    }
    ctx.setLineDash([]);

    for (let i = 0; i < 15; i++) {
      const a = i * 2.399;
      const rr = r * (0.22 + seededPoint(i + 20) * 0.9);
      const gx = x + Math.cos(a) * rr;
      const gy = y + Math.sin(a) * rr * 0.28;
      starGlow(
        gx,
        gy,
        2.5 + (i % 4),
        "rgba(244,235,255,.42)",
        "rgba(155,118,255,.15)",
        "rgba(0,0,0,0)",
      );
    }
    ctx.restore();

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = "rgba(214,207,255,.46)";
    ctx.shadowBlur = 12;
    ctx.shadowColor = "rgba(136,105,255,.3)";
    ctx.font = `800 ${Math.max(8, Math.min(11, width * 0.024))}px Inter, system-ui, sans-serif`;
    ctx.fillText(
      "LANIAKEA · UNA CUENCA ENTRE MUCHAS",
      x,
      height - Math.max(8, height * 0.012),
    );
    ctx.restore();
  }

  function drawScaleOfHomogeneity(time) {
    const top = height * 0.045;
    const bottom = height * 0.14;
    ctx.save();
    ctx.globalCompositeOperation = "screen";

    for (let row = 0; row < 7; row++) {
      const y = lerp(top, bottom, row / 6);
      for (let col = 0; col < 17; col++) {
        const x = width * ((col + 0.5 + (row % 2) * 0.5) / 17);
        const jitterX = (seededPoint(row * 31 + col * 7) - 0.5) * width * 0.025;
        const jitterY =
          (seededPoint(row * 23 + col * 13 + 9) - 0.5) * height * 0.012;
        const pulse = reducedMotion
          ? 1
          : 0.88 + Math.sin(time * 0.00042 + row + col) * 0.12;
        const alpha = 0.065 * pulse;
        starGlow(
          x + jitterX,
          y + jitterY,
          4.5,
          `rgba(225,239,255,${alpha * 2.3})`,
          `rgba(124,183,255,${alpha})`,
          "rgba(0,0,0,0)",
        );
      }
    }

    const veil = ctx.createLinearGradient(0, 0, width, 0);
    veil.addColorStop(0, "rgba(148,184,255,0)");
    veil.addColorStop(0.5, "rgba(148,184,255,.035)");
    veil.addColorStop(1, "rgba(148,184,255,0)");
    ctx.fillStyle = veil;
    ctx.fillRect(0, top, width, bottom - top);
    ctx.restore();
  }

  function drawTopTransition() {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.shadowBlur = 15;
    ctx.shadowColor = "rgba(153,190,255,.36)";
    ctx.fillStyle = "rgba(224,232,255,.54)";
    ctx.font = `800 ${Math.max(8, Math.min(11, width * 0.023))}px Inter, system-ui, sans-serif`;
    ctx.fillText("MÁS ALLÁ", width * 0.5, Math.max(7, height * 0.008));
    ctx.fillStyle = "rgba(224,235,255,.7)";
    ctx.font = `900 ${Math.max(8, Math.min(12, width * 0.026))}px Inter, system-ui, sans-serif`;
    ctx.fillText(
      "LUZ ANTIGUA · HORIZONTE CÓSMICO",
      width * 0.5,
      Math.max(21, height * 0.028),
    );
    ctx.fillStyle = "rgba(190,211,255,.52)";
    ctx.font = `760 ${Math.max(7, Math.min(10, width * 0.021))}px Inter, system-ui, sans-serif`;
    ctx.fillText(
      "UNIVERSO OBSERVABLE",
      width * 0.5,
      Math.max(37, height * 0.05),
    );
    ctx.restore();
  }

  function drawScientificCue() {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(188,211,255,.18)";
    ctx.font = `700 ${Math.max(7, Math.min(9, width * 0.018))}px Inter, system-ui, sans-serif`;
    ctx.fillText(
      "LOS TRAZOS REPRESENTAN DISTRIBUCIÓN DE MATERIA · NO TUBOS FÍSICOS",
      width * 0.5,
      height * 0.315,
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
      ctx.fillStyle = `rgba(${r},${g},${b},${p.life * 0.7})`;
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
      ctx.strokeStyle = `rgba(${r},${g},${b},${wave.life * 0.4})`;
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
    drawWalls(time);
    drawWeb(time);
    // Los vacíos oscurecen parcialmente la red para formar verdaderas celdas,
    // sin convertir sus bordes en barreras físicas.
    drawVoids(time);
    drawScaleOfHomogeneity(time);
    drawLaniakeaMemory(time);
    drawScientificCue();
    drawTopTransition();
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
