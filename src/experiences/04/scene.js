import { setReadoutRegion } from "../../shared/narration-target.js";
import { createSceneAudio } from "../../shared/audio.js";
import {
  requestSceneFrame as requestAnimationFrame,
  cancelSceneFrame as cancelAnimationFrame,
} from "../../shared/animation.js";
import content from "./content.json";
const { ZONES, BODY_LAYOUT } = content;

export function mountScene() {
  const canvas = document.getElementById("solar-spectrum");
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
  const MILLION_KM_PER_AU = 149.5978707;
  const LIGHT_MINUTES_PER_AU = 8.316746;

  // x is compressed educational progress: 0 = Sun/bottom, 1 = Pluto/top.
  // Distances and sizes are intentionally not to scale so every world remains touchable.

  const stars = [];
  const dust = [];
  const asteroids = [];
  const kuiperObjects = [];
  const particles = [];
  const waves = [];

  let width = 1;
  let height = 1;
  let dpr = 1;
  let activePointer = null;
  let pointerX = 0.5;
  let pointerY = 0.705;
  let targetX = 0.5;
  let targetY = 0.705;
  let hasInteracted = false;
  let hideTimer = 0;
  let lastZoneId = "";
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
    const random = seeded(18072026);
    stars.length = 0;
    dust.length = 0;
    asteroids.length = 0;
    kuiperObjects.length = 0;

    const starCount = Math.max(160, Math.round((width * height) / 5200));
    for (let i = 0; i < starCount; i++) {
      stars.push({
        x: random(),
        y: random(),
        r: 0.25 + random() * 1.6,
        a: 0.12 + random() * 0.7,
        phase: random() * TAU,
        warmth: random(),
      });
    }

    for (let i = 0; i < 90; i++) {
      dust.push({
        x: random(),
        y: 0.16 + random() * 0.68,
        r: 0.45 + random() * 1.8,
        phase: random() * TAU,
        speed: 0.2 + random() * 0.7,
      });
    }

    for (let i = 0; i < 150; i++) {
      asteroids.push({
        x: 0.432 + random() * 0.086,
        y: 0.08 + random() * 0.84,
        r: 0.55 + random() * 2.2,
        angle: random() * TAU,
        spin: (random() - 0.5) * 0.001,
        shade: 105 + Math.round(random() * 90),
      });
    }

    for (let i = 0; i < 82; i++) {
      kuiperObjects.push({
        x: 0.902 + random() * 0.094,
        y: 0.07 + random() * 0.86,
        r: 0.45 + random() * 1.8,
        phase: random() * TAU,
        ice: 150 + Math.round(random() * 80),
      });
    }
  }

  function resize() {
    width = innerWidth;
    height = innerHeight;
    dpr = Math.min(devicePixelRatio || 1, 2);

    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    buildStaticScene();
    root.style.setProperty(
      "--home-y",
      `${Math.max(120, routeY(0.295) - 92)}px`,
    );
  }

  function zoneForJourney(n) {
    const progress = Math.max(0, Math.min(0.999999, n));
    for (const zone of ZONES) {
      if (progress >= zone.x0 && progress < zone.x1) return zone;
    }
    return ZONES[ZONES.length - 1];
  }

  function zoneColor(zone, alpha = 1) {
    return `rgba(${zone.color[0]},${zone.color[1]},${zone.color[2]},${alpha})`;
  }

  function localRatio(zone, xNorm) {
    return Math.max(0, Math.min(1, (xNorm - zone.x0) / (zone.x1 - zone.x0)));
  }

  function journeyFromY(yNorm) {
    // Must be the exact inverse of routeY(), including its safe top/bottom margins.
    return Math.max(0, Math.min(0.999999, (0.94 - yNorm) / 0.88));
  }

  function auAt(zone, xNorm) {
    const t = localRatio(zone, xNorm);
    return zone.au0 + (zone.au1 - zone.au0) * t;
  }

  function formatSpanish(value, digits = 1) {
    return new Intl.NumberFormat("es", {
      maximumFractionDigits: digits,
      minimumFractionDigits: 0,
    }).format(value);
  }

  function formatMetric(zone, xNorm) {
    if (zone.metricMode === "sun") {
      return `${zone.distanceLabel} · estrella · fuente de luz y energía`;
    }

    if (zone.rangeLabel) {
      return `${zone.rangeLabel} · ${zone.typeLabel}`;
    }

    const au = zone.distanceAu ?? auAt(zone, xNorm);
    const millionKm = au * MILLION_KM_PER_AU;
    const lightMinutes = au * LIGHT_MINUTES_PER_AU;
    const lightText =
      lightMinutes >= 60
        ? `${formatSpanish(lightMinutes / 60, 1)} h luz`
        : `${formatSpanish(lightMinutes, 1)} min luz`;
    const home = zone.metricMode === "earth" ? " · estás aquí" : "";

    return `${zone.typeLabel} · ${formatSpanish(au, au < 10 ? 2 : 1)} UA · ${formatSpanish(millionKm, 0)} millones km · ${lightText}${home}`;
  }

  function featureFor(zone, xNorm) {
    const index = Math.min(
      zone.features.length - 1,
      Math.max(0, Math.floor(xNorm * zone.features.length)),
    );
    return zone.features[index];
  }

  function initAudio() {
    if (audioCtx) {
      if (audioCtx.state === "suspended") audioCtx.resume();
      return;
    }

    audioCtx = createSceneAudio();
    if (!audioCtx) return;

    master = audioCtx.createGain();
    master.gain.value = 0.0001;

    const compressor = audioCtx.createDynamicsCompressor();
    compressor.threshold.value = -20;
    compressor.knee.value = 18;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.012;
    compressor.release.value = 0.38;

    stereo = audioCtx.createStereoPanner ? audioCtx.createStereoPanner() : null;

    droneFilter = audioCtx.createBiquadFilter();
    droneFilter.type = "lowpass";
    droneFilter.Q.value = 1.15;

    droneGain = audioCtx.createGain();
    droneGain.gain.value = 0.055;

    droneA = audioCtx.createOscillator();
    droneB = audioCtx.createOscillator();
    droneA.type = "sine";
    droneB.type = "sine";
    droneA.frequency.value = 110;
    droneB.frequency.value = 110.8;

    pulseOsc = audioCtx.createOscillator();
    pulseOsc.type = "sine";
    pulseOsc.frequency.value = 32;
    pulseGain = audioCtx.createGain();
    pulseGain.gain.value = 0.012;

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
    noiseFilter.frequency.value = 900;
    noiseFilter.Q.value = 0.65;

    noiseGain = audioCtx.createGain();
    noiseGain.gain.value = 0.01;

    droneA.connect(droneFilter);
    droneB.connect(droneFilter);
    droneFilter.connect(droneGain);
    pulseOsc.connect(pulseGain);
    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);

    if (stereo) {
      droneGain.connect(stereo);
      pulseGain.connect(stereo);
      noiseGain.connect(stereo);
      stereo.connect(master);
    } else {
      droneGain.connect(master);
      pulseGain.connect(master);
      noiseGain.connect(master);
    }

    master.connect(compressor);
    compressor.connect(audioCtx.destination);

    droneA.start();
    droneB.start();
    pulseOsc.start();
    noiseSource.start();
  }

  function setAudioFor(zone, xNorm, yNorm, active) {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const s = zone.sound;
    const vertical = 0.82 + (1 - yNorm) * 0.36;
    const horizontal = 0.88 + xNorm * 0.22;
    const base = s.base * vertical * horizontal;

    droneA.type = s.type;
    droneB.type = s.type;
    droneA.frequency.setTargetAtTime(base, now, 0.05);
    droneB.frequency.setTargetAtTime(base * 1.008, now, 0.05);
    droneFilter.frequency.setTargetAtTime(
      s.filter * (0.72 + (1 - yNorm) * 0.5),
      now,
      0.06,
    );
    pulseOsc.frequency.setTargetAtTime(
      Math.max(18, s.base * s.pulse),
      now,
      0.08,
    );
    pulseGain.gain.setTargetAtTime(
      active ? 0.008 + s.pulse * 0.018 : 0.0001,
      now,
      0.08,
    );
    noiseFilter.frequency.setTargetAtTime(200 + s.filter * 0.42, now, 0.07);
    noiseGain.gain.setTargetAtTime(
      active ? 0.003 + s.noise * 0.045 : 0.0001,
      now,
      0.08,
    );
    master.gain.setTargetAtTime(
      active ? 0.38 : 0.0001,
      now,
      active ? 0.06 : 0.22,
    );

    if (stereo) stereo.pan.setTargetAtTime(xNorm * 1.7 - 0.85, now, 0.05);
  }

  function arrivalChime(zone, xNorm) {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();
    const pan = audioCtx.createStereoPanner
      ? audioCtx.createStereoPanner()
      : null;

    osc.type = "sine";
    osc.frequency.setValueAtTime(zone.sound.base * 3, now);
    osc.frequency.exponentialRampToValueAtTime(
      zone.sound.base * 4.5,
      now + 0.32,
    );
    filter.type = "lowpass";
    filter.frequency.value = 4800;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.055, now + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.52);

    osc.connect(filter);
    filter.connect(gain);
    if (pan) {
      pan.pan.value = xNorm * 2 - 1;
      gain.connect(pan);
      pan.connect(master);
    } else {
      gain.connect(master);
    }

    osc.start(now);
    osc.stop(now + 0.56);
  }

  function createRipple(x, y, zone) {
    const node = document.createElement("div");
    node.className = "ripple";
    node.style.left = x + "px";
    node.style.top = y + "px";
    node.style.borderColor = zoneColor(zone, 0.9);
    node.style.boxShadow = `0 0 28px ${zoneColor(zone, 0.45)}`;
    document.body.appendChild(node);
    node.addEventListener("animationend", () => node.remove(), { once: true });

    waves.push({ x, y, radius: 8, age: 0, life: 0.9, color: zone.color });

    const count = reducedMotion ? 5 : 18;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * TAU;
      const speed = 25 + Math.random() * 115;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        age: 0,
        life: 0.45 + Math.random() * 0.75,
        r: 1 + Math.random() * 3,
        color: zone.color,
      });
    }
  }

  function hideReadoutSoon() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      readout.classList.remove("visible");
      touchOrb.classList.remove("visible");
      journeyScale.classList.remove("visible");
      document.body.classList.remove("active");
      setAudioFor(
        zoneForJourney(journeyFromY(pointerY)),
        pointerX,
        pointerY,
        false,
      );
    }, 1050);
  }

  function updateReadout(x, y, makeRipple = false) {
    const xNorm = Math.max(0, Math.min(0.999999, x / width));
    const yNorm = Math.max(0, Math.min(0.999999, y / height));
    const journey = journeyFromY(yNorm);
    const zone = zoneForJourney(journey);
    const feature = featureFor(zone, xNorm);
    const accent = `rgb(${zone.color[0]} ${zone.color[1]} ${zone.color[2]})`;

    root.style.setProperty("--accent", accent);
    root.style.setProperty(
      "--accent-soft",
      `rgb(${zone.color[0]} ${zone.color[1]} ${zone.color[2]} / .35)`,
    );
    root.style.setProperty("--scan-x", x + "px");
    root.style.setProperty("--scan-y", y + "px");
    root.style.setProperty("--progress", `${journey * 100}%`);
    scaleDot.style.bottom = `${20 + journey * Math.max(0, journeyScale.clientHeight - 40)}px`;

    setReadoutRegion(readout, zone.id);
    zoneName.textContent = zone.name;
    featureName.textContent = feature[0];
    metric.textContent = formatMetric(zone, journey);
    metric.dataset.learningNarration = zone.typeLabel;
    fact.textContent = feature[1];
    scaleValue.textContent =
      zone.metricMode === "sun"
        ? "Sol · centro del sistema"
        : zone.rangeLabel
          ? zone.rangeLabel.replace("Aprox. ", "")
          : `${formatSpanish(zone.distanceAu ?? auAt(zone, journey), (zone.distanceAu ?? auAt(zone, journey)) < 10 ? 2 : 1)} UA del Sol`;

    touchOrb.style.left = x + "px";
    touchOrb.style.top = y + "px";

    readout.classList.add("visible");
    touchOrb.classList.add("visible");
    journeyScale.classList.add("visible");
    document.body.classList.add("active");

    setAudioFor(zone, xNorm, yNorm, true);

    if (zone.id !== lastZoneId) {
      arrivalChime(zone, xNorm);
      lastZoneId = zone.id;
    }

    if (makeRipple) createRipple(x, y, zone);
  }

  function drawBackground(time) {
    const bg = ctx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, "#02030a");
    bg.addColorStop(0.22, "#03050d");
    bg.addColorStop(0.56, "#050817");
    bg.addColorStop(0.82, "#0a1020");
    bg.addColorStop(1, "#21150d");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.globalCompositeOperation = "screen";

    // The lower edge is now the Sun, the correct origin of planetary order.
    const sunGlow = ctx.createRadialGradient(
      width * 0.5,
      height * 1.06,
      0,
      width * 0.5,
      height * 1.06,
      Math.max(width, height) * 0.72,
    );
    sunGlow.addColorStop(0, "rgba(255,250,220,.70)");
    sunGlow.addColorStop(0.12, "rgba(255,214,105,.32)");
    sunGlow.addColorStop(0.34, "rgba(255,166,54,.12)");
    sunGlow.addColorStop(0.68, "rgba(255,137,38,.025)");
    sunGlow.addColorStop(1, "rgba(255,137,38,0)");
    ctx.fillStyle = sunGlow;
    ctx.fillRect(0, height * 0.38, width, height * 0.62);

    const rayFade = ctx.createLinearGradient(0, height, 0, height * 0.28);
    rayFade.addColorStop(0, "rgba(255,232,151,.15)");
    rayFade.addColorStop(0.5, "rgba(255,201,92,.035)");
    rayFade.addColorStop(1, "rgba(255,201,92,0)");
    ctx.fillStyle = rayFade;
    const rayPhase = Math.sin(time * 0.00012) * width * 0.008;
    const rays = [
      [-0.42, -0.22],
      [-0.22, -0.08],
      [-0.08, 0.04],
      [0.07, 0.18],
      [0.2, 0.42],
    ];
    for (const [a, b] of rays) {
      ctx.beginPath();
      ctx.moveTo(width * (0.5 + a * 0.18) + rayPhase, height * 1.02);
      ctx.lineTo(width * (0.5 + b), height * 0.25);
      ctx.lineTo(width * (0.5 + b + 0.04), height * 0.25);
      ctx.closePath();
      ctx.fill();
    }

    // A cool threshold above Pluto prepares the next app: stars and the wider galaxy.
    const galactic = ctx.createRadialGradient(
      width * 0.48,
      -height * 0.18,
      0,
      width * 0.48,
      -height * 0.18,
      height * 0.58,
    );
    galactic.addColorStop(0, "rgba(145,115,255,.12)");
    galactic.addColorStop(0.38, "rgba(80,129,255,.04)");
    galactic.addColorStop(1, "rgba(80,129,255,0)");
    ctx.fillStyle = galactic;
    ctx.fillRect(0, 0, width, height * 0.44);
    ctx.restore();

    for (const star of stars) {
      const flicker = 0.72 + Math.sin(time * 0.0014 + star.phase) * 0.28;
      const x = star.x * width;
      const y = star.y * height;
      const warm = star.warmth > 0.92;
      ctx.fillStyle = warm
        ? `rgba(255,220,178,${star.a * flicker})`
        : `rgba(218,232,255,${star.a * flicker})`;
      ctx.beginPath();
      ctx.arc(x, y, star.r, 0, TAU);
      ctx.fill();
    }

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const mote of dust) {
      const x = ((mote.x + time * 0.0000018 * mote.speed) % 1) * width;
      const y = mote.y * height + Math.sin(time * 0.00055 + mote.phase) * 5;
      ctx.fillStyle = `rgba(135,165,220,${0.025 + mote.r * 0.018})`;
      ctx.beginPath();
      ctx.arc(x, y, mote.r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function routeX(progress) {
    return (
      width *
      (0.5 +
        Math.sin(progress * Math.PI * 2.15 + 0.35) * 0.055 +
        Math.sin(progress * Math.PI * 5.2) * 0.018)
    );
  }

  function routeY(progress) {
    return height * (0.94 - progress * 0.88);
  }

  function bodyPoint(body) {
    return {
      x: routeX(body.x) + (body.lane || 0) * Math.min(width, 620),
      y: routeY(body.x),
    };
  }

  function drawJourneyPath(time) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";

    const pathGrad = ctx.createLinearGradient(0, height, 0, 0);
    pathGrad.addColorStop(0, "rgba(255,202,83,.34)");
    pathGrad.addColorStop(0.24, "rgba(88,204,255,.25)");
    pathGrad.addColorStop(0.56, "rgba(233,188,137,.20)");
    pathGrad.addColorStop(0.82, "rgba(72,111,255,.19)");
    pathGrad.addColorStop(1, "rgba(235,195,165,.30)");
    ctx.strokeStyle = pathGrad;
    ctx.lineWidth = 1.45;
    ctx.setLineDash([3, 9]);
    ctx.lineDashOffset = time * 0.012;
    ctx.beginPath();
    for (let p = 0; p <= 1.0001; p += 0.008) {
      const x = routeX(p);
      const y = routeY(p);
      if (p === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    for (const zone of ZONES) {
      if (zone.x0 <= 0) continue;
      const y = routeY(zone.x0);
      const grad = ctx.createLinearGradient(0, y, width, y);
      grad.addColorStop(0, "rgba(255,255,255,0)");
      grad.addColorStop(0.44, zoneColor(zone, 0.085));
      grad.addColorStop(0.56, zoneColor(zone, 0.085));
      grad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.strokeStyle = grad;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Earth is the handoff point from the previous atmosphere app.
    const earthBody = BODY_LAYOUT.find((body) => body.id === "earth");
    const earth = bodyPoint(earthBody);
    const homePulse = 13 + Math.sin(time * 0.004) * 3;
    ctx.strokeStyle = "rgba(110,220,255,.42)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(earth.x, earth.y, homePulse, 0, TAU);
    ctx.stroke();
    ctx.font = "800 9px system-ui, sans-serif";
    ctx.textAlign = earth.x < width * 0.5 ? "left" : "right";
    ctx.textBaseline = "middle";
    if (hasInteracted) {
      ctx.fillStyle = "rgba(184,239,255,.76)";
      ctx.fillText(
        "CONTINÚA AQUÍ",
        earth.x + (earth.x < width * 0.5 ? 18 : -18),
        earth.y,
      );
    }

    // Soft exit gate above Pluto: visually hands the journey to the future galaxy app.
    const exitY = routeY(0.995);
    const exitGlow = ctx.createRadialGradient(
      routeX(0.995),
      exitY,
      0,
      routeX(0.995),
      exitY,
      Math.min(width, height) * 0.24,
    );
    exitGlow.addColorStop(0, "rgba(178,164,255,.10)");
    exitGlow.addColorStop(0.55, "rgba(102,137,255,.035)");
    exitGlow.addColorStop(1, "rgba(102,137,255,0)");
    ctx.fillStyle = exitGlow;
    ctx.fillRect(0, 0, width, height * 0.24);

    ctx.restore();
  }

  function ellipseOrbit(cx, cy, rx, ry, rotation, alpha = 0.12) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.strokeStyle = `rgba(180,205,255,${alpha})`;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  function sphere(x, y, r, stops, glow = null) {
    const grad = ctx.createRadialGradient(
      x - r * 0.34,
      y - r * 0.38,
      r * 0.05,
      x,
      y,
      r * 1.06,
    );
    for (const stop of stops) grad.addColorStop(stop[0], stop[1]);
    ctx.fillStyle = grad;
    if (glow) {
      ctx.shadowBlur = r * 1.2;
      ctx.shadowColor = glow;
    }
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  function drawSun(time, body) {
    const point = bodyPoint(body);
    const x = point.x;
    const y = Math.max(point.y, height * 1.005);
    const r = Math.max(72, Math.min(body.r, Math.min(width, height) * 0.18));
    const pulse = 1 + Math.sin(time * 0.0012) * 0.018;

    const corona = ctx.createRadialGradient(x, y, r * 0.55, x, y, r * 2.25);
    corona.addColorStop(0, "rgba(255,245,190,.46)");
    corona.addColorStop(0.28, "rgba(255,196,70,.22)");
    corona.addColorStop(0.66, "rgba(255,137,40,.055)");
    corona.addColorStop(1, "rgba(255,137,40,0)");
    ctx.fillStyle = corona;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.25, 0, TAU);
    ctx.fill();

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(pulse, pulse);
    sphere(
      0,
      0,
      r,
      [
        [0, "#fffbd7"],
        [0.24, "#ffe376"],
        [0.68, "#ff9e2f"],
        [1, "#b92f18"],
      ],
      "rgba(255,185,58,.65)",
    );
    ctx.globalAlpha = 0.34;
    ctx.strokeStyle = "rgba(255,250,210,.8)";
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 7; i++) {
      const yy = -r * 0.68 + i * r * 0.22;
      ctx.beginPath();
      ctx.arc(
        0,
        yy,
        r * (0.78 - Math.abs(yy / r) * 0.2),
        0.1 + i * 0.08,
        2.9 + i * 0.06,
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawMercury(time, body) {
    const point = bodyPoint(body);
    const x = point.x;
    const y = point.y + Math.sin(time * 0.00072) * 1.2;
    const r = Math.max(6, Math.min(body.r, height * 0.016));
    sphere(x, y, r, [
      [0, "#eee5d6"],
      [0.42, "#9b9184"],
      [1, "#302e31"],
    ]);
    ctx.fillStyle = "rgba(55,50,49,.45)";
    for (let i = 0; i < 4; i++) {
      const a = i * 1.7 + 0.4;
      ctx.beginPath();
      ctx.arc(
        x + Math.cos(a) * r * 0.46,
        y + Math.sin(a) * r * 0.42,
        r * (0.12 + i * 0.018),
        0,
        TAU,
      );
      ctx.fill();
    }
  }

  function drawVenus(time, body) {
    const point = bodyPoint(body);
    const x = point.x;
    const y = point.y + Math.sin(time * 0.00058 + 0.8) * 1.5;
    const r = Math.max(12, Math.min(body.r, height * 0.032));
    sphere(
      x,
      y,
      r,
      [
        [0, "#fff2ba"],
        [0.35, "#e8a857"],
        [0.76, "#9f5c32"],
        [1, "#382226"],
      ],
      "rgba(255,183,92,.3)",
    );
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.clip();
    ctx.strokeStyle = "rgba(255,238,186,.42)";
    ctx.lineWidth = Math.max(1, r * 0.08);
    for (let i = -3; i <= 3; i++) {
      const yy = y + i * r * 0.22 + Math.sin(time * 0.0004 + i) * 1.1;
      ctx.beginPath();
      ctx.moveTo(x - r, yy);
      ctx.bezierCurveTo(x - r * 0.35, yy - 4, x + r * 0.3, yy + 4, x + r, yy);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawEarth(time, body) {
    const point = bodyPoint(body);
    const x = point.x;
    const y = point.y + Math.sin(time * 0.00065) * 2;
    const r = Math.max(19, Math.min(body.r, height * 0.058));

    const glow = ctx.createRadialGradient(x, y, r * 0.85, x, y, r * 2.4);
    glow.addColorStop(0, "rgba(86,190,255,.23)");
    glow.addColorStop(1, "rgba(86,190,255,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.4, 0, TAU);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.clip();

    const ocean = ctx.createRadialGradient(
      x - r * 0.35,
      y - r * 0.35,
      r * 0.05,
      x,
      y,
      r * 1.1,
    );
    ocean.addColorStop(0, "#bfeeff");
    ocean.addColorStop(0.16, "#4fb8ee");
    ocean.addColorStop(0.6, "#1760a5");
    ocean.addColorStop(1, "#071d45");
    ctx.fillStyle = ocean;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);

    ctx.translate(x, y);
    ctx.rotate(-0.18);
    const spin = time * 0.00006;
    ctx.fillStyle = "rgba(80,170,103,.92)";
    for (let i = -1; i <= 1; i++) {
      const offset = (((spin + i * 0.71) % 2) - 1) * r * 1.7;
      ctx.beginPath();
      ctx.ellipse(offset, -r * 0.18, r * 0.42, r * 0.19, 0.25, 0, TAU);
      ctx.ellipse(
        offset + r * 0.22,
        r * 0.2,
        r * 0.28,
        r * 0.14,
        -0.35,
        0,
        TAU,
      );
      ctx.fill();
    }

    ctx.strokeStyle = "rgba(255,255,255,.62)";
    ctx.lineWidth = Math.max(1, r * 0.035);
    for (let i = 0; i < 4; i++) {
      const yy = -r * 0.55 + i * r * 0.34 + Math.sin(time * 0.00035 + i) * 2;
      ctx.beginPath();
      ctx.arc(0, yy, r * (0.75 - Math.abs(yy / r) * 0.25), 0.2, 2.9);
      ctx.stroke();
    }
    ctx.restore();

    ctx.strokeStyle = "rgba(158,226,255,.62)";
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(x, y, r + 1, 0, TAU);
    ctx.stroke();

    const moonOrbit = r * 1.65;
    const moonAngle = time * 0.00016 + 0.8;
    ellipseOrbit(x, y, moonOrbit, moonOrbit * 0.34, -0.32, 0.13);
    sphere(
      x + Math.cos(moonAngle) * moonOrbit,
      y + Math.sin(moonAngle) * moonOrbit * 0.34,
      Math.max(4, r * 0.24),
      [
        [0, "#f5f3e9"],
        [0.46, "#aaaeb5"],
        [1, "#353943"],
      ],
    );
  }

  function drawMars(time, body) {
    const point = bodyPoint(body);
    const x = point.x;
    const y = point.y + Math.sin(time * 0.00055 + 1) * 1.8;
    const r = Math.max(12, Math.min(body.r, height * 0.035));
    sphere(
      x,
      y,
      r,
      [
        [0, "#ffd0a2"],
        [0.23, "#e6784d"],
        [0.67, "#9c3d2e"],
        [1, "#3b1720"],
      ],
      "rgba(238,112,70,.36)",
    );

    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = "#7c2f28";
    ctx.beginPath();
    ctx.ellipse(x + r * 0.15, y + r * 0.08, r * 0.48, r * 0.16, -0.3, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "rgba(255,244,226,.8)";
    ctx.beginPath();
    ctx.ellipse(x, y - r * 0.76, r * 0.34, r * 0.11, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawAsteroidBelt(time) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const rock of asteroids) {
      const x = rock.y * width + Math.sin(time * rock.spin + rock.angle) * 4;
      const y =
        routeY(rock.x) + Math.cos(time * rock.spin * 0.8 + rock.angle) * 6;
      ctx.fillStyle = `rgba(${rock.shade},${rock.shade - 10},${rock.shade - 24},${0.16 + rock.r * 0.08})`;
      ctx.beginPath();
      ctx.ellipse(
        x,
        y,
        rock.r * 1.3,
        rock.r,
        rock.angle + time * rock.spin,
        0,
        TAU,
      );
      ctx.fill();
    }
    ctx.restore();
  }

  function drawJupiter(time, body) {
    const point = bodyPoint(body);
    const x = point.x;
    const y = point.y + Math.sin(time * 0.0004 + 0.4) * 2.3;
    const r = Math.max(26, Math.min(body.r, height * 0.075));

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.clip();

    const base = ctx.createRadialGradient(
      x - r * 0.3,
      y - r * 0.35,
      0,
      x,
      y,
      r * 1.1,
    );
    base.addColorStop(0, "#fff4d4");
    base.addColorStop(0.46, "#c99b70");
    base.addColorStop(1, "#4f3028");
    ctx.fillStyle = base;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);

    const bands = [
      [-0.72, 0.18, "rgba(117,66,50,.62)"],
      [-0.48, 0.13, "rgba(241,215,174,.66)"],
      [-0.28, 0.16, "rgba(143,80,58,.55)"],
      [-0.06, 0.18, "rgba(255,232,190,.67)"],
      [0.18, 0.17, "rgba(128,70,54,.56)"],
      [0.41, 0.14, "rgba(239,208,162,.58)"],
      [0.63, 0.16, "rgba(108,60,49,.55)"],
    ];
    for (const band of bands) {
      const wobble = Math.sin(time * 0.0005 + band[0] * 7) * 1.5;
      ctx.fillStyle = band[2];
      ctx.fillRect(x - r, y + band[0] * r + wobble, r * 2, band[1] * r);
    }

    ctx.fillStyle = "rgba(178,68,48,.84)";
    ctx.beginPath();
    ctx.ellipse(x + r * 0.35, y + r * 0.28, r * 0.22, r * 0.11, -0.08, 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = "rgba(255,232,193,.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.stroke();

    const moonR = Math.max(2.3, r * 0.065);
    for (let i = 0; i < 4; i++) {
      const orbitR = r * (1.35 + i * 0.23);
      const angle = time * (0.00016 + i * 0.000025) + i * 1.6;
      ellipseOrbit(x, y, orbitR, orbitR * 0.16, -0.08, 0.07);
      sphere(
        x + Math.cos(angle) * orbitR,
        y + Math.sin(angle) * orbitR * 0.16,
        moonR * (i === 2 ? 1.25 : 1),
        [
          [0, i === 0 ? "#ffd6a1" : "#e8e3d7"],
          [1, "#5c5c66"],
        ],
      );
    }
  }

  function drawSaturn(time, body) {
    const point = bodyPoint(body);
    const x = point.x;
    const y = point.y + Math.sin(time * 0.00045 + 2) * 2;
    const r = Math.max(22, Math.min(body.r, height * 0.058));
    const tilt = -0.2;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    ctx.strokeStyle = "rgba(238,220,174,.38)";
    ctx.lineWidth = Math.max(5, r * 0.2);
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.9, r * 0.47, 0, Math.PI, TAU);
    ctx.stroke();
    ctx.strokeStyle = "rgba(166,139,97,.34)";
    ctx.lineWidth = Math.max(1.5, r * 0.055);
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.48, r * 0.36, 0, Math.PI, TAU);
    ctx.stroke();
    ctx.restore();

    sphere(
      x,
      y,
      r,
      [
        [0, "#fff3be"],
        [0.32, "#e7c87f"],
        [0.75, "#a67d4d"],
        [1, "#4e382d"],
      ],
      "rgba(244,218,151,.3)",
    );

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    ctx.strokeStyle = "rgba(252,231,181,.72)";
    ctx.lineWidth = Math.max(5, r * 0.2);
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.9, r * 0.47, 0, 0, Math.PI);
    ctx.stroke();
    ctx.strokeStyle = "rgba(120,91,61,.55)";
    ctx.lineWidth = Math.max(1.5, r * 0.055);
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.48, r * 0.36, 0, 0, Math.PI);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.clip();
    for (let i = -3; i <= 3; i++) {
      ctx.fillStyle = i % 2 ? "rgba(119,83,52,.16)" : "rgba(255,247,205,.14)";
      ctx.fillRect(x - r, y + i * r * 0.18, r * 2, r * 0.1);
    }
    ctx.restore();
  }

  function drawIceGiant(time, body, palette, ring = false) {
    const point = bodyPoint(body);
    const x = point.x;
    const y = point.y + Math.sin(time * 0.00042 + body.x * 9) * 1.8;
    const r = Math.max(17, Math.min(body.r, height * 0.044));

    if (ring) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(1.28);
      ctx.strokeStyle = "rgba(180,231,230,.28)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.65, r * 0.34, 0, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    sphere(x, y, r, palette, palette[1][1]);

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.clip();
    for (let i = -2; i <= 2; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.025 + (i + 2) * 0.01})`;
      ctx.fillRect(
        x - r,
        y + i * r * 0.25 + Math.sin(time * 0.0003 + i) * 1.3,
        r * 2,
        r * 0.1,
      );
    }
    ctx.restore();
  }

  function drawKuiper(time) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const obj of kuiperObjects) {
      const x = obj.y * width + Math.sin(time * 0.0002 + obj.phase) * 3;
      const y = routeY(obj.x) + Math.cos(time * 0.00018 + obj.phase) * 5;
      ctx.fillStyle = `rgba(${obj.ice},${Math.min(245, obj.ice + 8)},255,${0.07 + obj.r * 0.055})`;
      ctx.beginPath();
      ctx.arc(x, y, obj.r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPluto(time, body) {
    const point = bodyPoint(body);
    const x = point.x;
    const y = point.y + Math.sin(time * 0.0004 + 4) * 1.4;
    const r = Math.max(9, Math.min(body.r, height * 0.022));

    sphere(
      x,
      y,
      r,
      [
        [0, "#fff0dc"],
        [0.34, "#cfa27e"],
        [0.72, "#7e594d"],
        [1, "#302730"],
      ],
      "rgba(235,195,165,.35)",
    );

    ctx.save();
    ctx.fillStyle = "rgba(247,224,203,.74)";
    ctx.beginPath();
    ctx.moveTo(x - r * 0.34, y - r * 0.13);
    ctx.bezierCurveTo(
      x - r * 0.62,
      y - r * 0.52,
      x - r * 0.18,
      y - r * 0.66,
      x,
      y - r * 0.26,
    );
    ctx.bezierCurveTo(
      x + r * 0.19,
      y - r * 0.62,
      x + r * 0.57,
      y - r * 0.38,
      x + r * 0.37,
      y,
    );
    ctx.bezierCurveTo(
      x + r * 0.17,
      y + r * 0.37,
      x - r * 0.14,
      y + r * 0.33,
      x - r * 0.34,
      y - r * 0.13,
    );
    ctx.fill();
    ctx.restore();

    const orbitR = r * 2.45;
    const angle = time * 0.00022 + 1.1;
    ellipseOrbit(x, y, orbitR, orbitR * 0.44, -0.3, 0.14);
    sphere(
      x + Math.cos(angle) * orbitR,
      y + Math.sin(angle) * orbitR * 0.44,
      r * 0.48,
      [
        [0, "#d8d1c7"],
        [1, "#4d4650"],
      ],
    );
  }

  function drawBodies(time) {
    const lookup = Object.fromEntries(
      BODY_LAYOUT.map((body) => [body.id, body]),
    );
    drawSun(time, lookup.sun);
    drawMercury(time, lookup.mercury);
    drawVenus(time, lookup.venus);
    drawEarth(time, lookup.earth);
    drawMars(time, lookup.mars);
    drawJupiter(time, lookup.jupiter);
    drawSaturn(time, lookup.saturn);
    drawIceGiant(
      time,
      lookup.uranus,
      [
        [0, "#d7ffff"],
        [0.36, "#8de7e4"],
        [0.78, "#3e939e"],
        [1, "#18384c"],
      ],
      true,
    );
    drawIceGiant(
      time,
      lookup.neptune,
      [
        [0, "#d4e0ff"],
        [0.32, "#5c8cff"],
        [0.74, "#2346b4"],
        [1, "#10164b"],
      ],
      false,
    );
    drawPluto(time, lookup.pluto);
  }

  function drawPointerGlow(time) {
    if (!document.body.classList.contains("active")) return;
    const zone = zoneForJourney(journeyFromY(pointerY));
    const x = pointerX * width;
    const y = pointerY * height;
    const pulse = 34 + Math.sin(time * 0.012) * 5;

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const glow = ctx.createRadialGradient(x, y, 0, x, y, pulse * 3.2);
    glow.addColorStop(0, zoneColor(zone, 0.68));
    glow.addColorStop(0.24, zoneColor(zone, 0.2));
    glow.addColorStop(1, zoneColor(zone, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, pulse * 3.2, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawEffects(dt) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";

    for (let i = waves.length - 1; i >= 0; i--) {
      const wave = waves[i];
      wave.age += dt;
      wave.radius += dt * 200;
      const alpha = Math.max(0, 1 - wave.age / wave.life);
      ctx.strokeStyle = `rgba(${wave.color[0]},${wave.color[1]},${wave.color[2]},${alpha * 0.38})`;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(wave.x, wave.y, wave.radius, 0, TAU);
      ctx.stroke();
      if (wave.age >= wave.life) waves.splice(i, 1);
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age += dt;
      p.vx *= Math.pow(0.975, dt * 60);
      p.vy *= Math.pow(0.975, dt * 60);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const alpha = Math.max(0, 1 - p.age / p.life);
      ctx.fillStyle = `rgba(${p.color[0]},${p.color[1]},${p.color[2]},${alpha})`;
      ctx.shadowBlur = 14;
      ctx.shadowColor = `rgba(${p.color[0]},${p.color[1]},${p.color[2]},.72)`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * alpha, 0, TAU);
      ctx.fill();
      if (p.age >= p.life) particles.splice(i, 1);
    }

    ctx.restore();
  }

  function animate(now) {
    const dt = Math.min(0.033, (now - lastTime) / 1000);
    lastTime = now;

    pointerX += (targetX - pointerX) * (reducedMotion ? 1 : 0.24);
    pointerY += (targetY - pointerY) * (reducedMotion ? 1 : 0.24);

    drawBackground(now);
    drawJourneyPath(now);
    drawAsteroidBelt(now);
    drawKuiper(now);
    drawBodies(now);
    drawPointerGlow(now);
    drawEffects(dt);

    raf = requestAnimationFrame(animate);
  }

  function movePointer(event, ripple = false) {
    const x = Math.max(0, Math.min(width, event.clientX));
    const y = Math.max(0, Math.min(height, event.clientY));
    targetX = x / width;
    targetY = y / height;
    pointerX = targetX;
    pointerY = targetY;
    updateReadout(x, y, ripple);
  }

  function onPointerDown(event) {
    event.preventDefault();
    initAudio();
    activePointer = event.pointerId;
    canvas.setPointerCapture?.(event.pointerId);
    clearTimeout(hideTimer);
    if (!hasInteracted) {
      hasInteracted = true;
      hint.classList.add("hidden");
    }
    movePointer(event, true);
  }

  function onPointerMove(event) {
    if (event.pointerId !== activePointer) return;
    event.preventDefault();
    movePointer(event, false);
  }

  function onPointerEnd(event) {
    if (event.pointerId !== activePointer) return;
    event.preventDefault();
    activePointer = null;
    hideReadoutSoon();
  }

  function keyboardMove(dx, dy) {
    initAudio();
    hasInteracted = true;
    hint.classList.add("hidden");
    targetX = Math.max(0.005, Math.min(0.995, targetX + dx));
    targetY = Math.max(0.005, Math.min(0.995, targetY + dy));
    pointerX = targetX;
    pointerY = targetY;
    clearTimeout(hideTimer);
    updateReadout(targetX * width, targetY * height, false);
    hideReadoutSoon();
  }

  canvas.addEventListener("focus", () => {
    if (!hasInteracted)
      root.style.setProperty(
        "--home-y",
        `${Math.max(120, routeY(0.295) - 92)}px`,
      );
  });
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerEnd);
  canvas.addEventListener("pointercancel", onPointerEnd);
  canvas.addEventListener("lostpointercapture", () => {
    activePointer = null;
    hideReadoutSoon();
  });

  window.addEventListener("keydown", (event) => {
    const step = event.shiftKey ? 0.045 : 0.015;
    if (event.key === "ArrowUp") {
      event.preventDefault();
      keyboardMove(0, -step);
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      keyboardMove(0, step);
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      keyboardMove(-step, 0);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      keyboardMove(step, 0);
    }
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      initAudio();
      updateReadout(targetX * width, targetY * height, true);
      hideReadoutSoon();
    }
  });

  window.addEventListener("resize", resize, { passive: true });
  window.addEventListener("blur", () => {
    activePointer = null;
    readout.classList.remove("visible");
    touchOrb.classList.remove("visible");
    journeyScale.classList.remove("visible");
    document.body.classList.remove("active");
    if (audioCtx)
      setAudioFor(
        zoneForJourney(journeyFromY(pointerY)),
        pointerX,
        pointerY,
        false,
      );
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && audioCtx?.state === "running") audioCtx.suspend();
  });
  document.addEventListener("contextmenu", (event) => event.preventDefault());

  resize();
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(animate);
}
