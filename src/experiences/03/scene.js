import { setReadoutRegion } from "../../shared/narration-target.js";
import { createSceneAudio } from "../../shared/audio.js";
import {
  requestSceneFrame as requestAnimationFrame,
  cancelSceneFrame as cancelAnimationFrame,
} from "../../shared/animation.js";
import content from "./content.json";
const { ZONES } = content;

export function mountScene() {
  const canvas = document.getElementById("earth-spectrum");
  const ctx = canvas.getContext("2d", { alpha: false });
  const root = document.documentElement;
  const readout = document.getElementById("readout");
  const zoneName = document.getElementById("zone-name");
  const featureName = document.getElementById("feature-name");
  const metric = document.getElementById("metric");
  const fact = document.getElementById("fact");
  const touchOrb = document.getElementById("touch-orb");
  const scaleReadout = document.getElementById("scale-readout");
  const scaleText = document.getElementById("scale-text");
  const hint = document.getElementById("hint");

  const TAU = Math.PI * 2;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const spanishNumberOneDecimal = new Intl.NumberFormat("es-ES", {
    maximumFractionDigits: 1,
  });
  const spanishNumberTwoDecimals = new Intl.NumberFormat("es-ES", {
    maximumFractionDigits: 2,
  });

  const stars = [];
  const motes = [];
  const bubbles = [];
  const clouds = [];
  const cloudSprites = [];
  const cracks = [];
  const sparks = [];
  const activeRipples = [];
  const staticDetailLayer = document.createElement("canvas");

  let width = 1;
  let height = 1;
  let dpr = 1;
  let activePointer = null;
  let pointerX = 0.5;
  let pointerY = 0.46;
  let targetX = 0.5;
  let targetY = 0.46;
  let lastZone = "";
  let hideTimer = 0;
  let raf = 0;
  let lastTime = performance.now();
  let lastDrawTime = 0;
  let hasInteracted = false;

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
    const random = seeded(20260718);
    stars.length = 0;
    motes.length = 0;
    bubbles.length = 0;
    clouds.length = 0;
    cracks.length = 0;

    for (let i = 0; i < 170; i++) {
      stars.push({
        x: random(),
        y: random() * 0.19,
        r: 0.35 + random() * 1.7,
        a: 0.18 + random() * 0.75,
        twinkle: random() * TAU,
      });
    }

    for (let i = 0; i < 95; i++) {
      motes.push({
        x: random(),
        y: 0.08 + random() * 0.31,
        r: 0.4 + random() * 1.4,
        drift: 0.08 + random() * 0.35,
        phase: random() * TAU,
      });
    }

    for (let i = 0; i < 55; i++) {
      bubbles.push({
        x: random(),
        y: 0.64 + random() * 0.29,
        r: 2 + random() * 8,
        phase: random() * TAU,
        speed: 0.15 + random() * 0.4,
      });
    }

    for (let i = 0; i < 18; i++) {
      clouds.push({
        x: random(),
        y: 0.397 + random() * 0.052,
        scale: 0.45 + random() * 1.2,
        speed: 0.002 + random() * 0.007,
        alpha: 0.14 + random() * 0.22,
        phase: random() * TAU,
      });
    }

    for (let i = 0; i < 26; i++) {
      cracks.push({
        x: random(),
        y: 0.505 + random() * 0.12,
        len: 0.025 + random() * 0.07,
        lean: -0.05 + random() * 0.1,
        forks: 1 + Math.floor(random() * 3),
      });
    }
  }

  function prepareLayer(layer) {
    const layerDpr = Math.min(dpr, 1.25);
    layer.width = Math.max(1, Math.round(width * layerDpr));
    layer.height = Math.max(1, Math.round(height * layerDpr));
    const layerCtx = layer.getContext("2d");
    layerCtx.setTransform(layerDpr, 0, 0, layerDpr, 0, 0);
    layerCtx.clearRect(0, 0, width, height);
    return layerCtx;
  }

  function buildCloudSprites() {
    cloudSprites.length = 0;
    const baseSize = Math.min(width, height) * 0.03;

    for (const cloud of clouds) {
      const s = baseSize * cloud.scale;
      const spriteWidth = Math.max(8, Math.ceil(s * 5.2));
      const spriteHeight = Math.max(6, Math.ceil(s * 2.2));
      const sprite = document.createElement("canvas");
      sprite.width = Math.max(1, Math.round(spriteWidth * dpr));
      sprite.height = Math.max(1, Math.round(spriteHeight * dpr));

      const spriteCtx = sprite.getContext("2d");
      spriteCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cx = spriteWidth * 0.5;
      const cy = spriteHeight * 0.5;
      const grad = spriteCtx.createRadialGradient(cx, cy, 0, cx, cy, s * 2.3);
      grad.addColorStop(0, `rgba(255,255,255,${cloud.alpha})`);
      grad.addColorStop(0.45, `rgba(230,250,255,${cloud.alpha * 0.55})`);
      grad.addColorStop(1, "rgba(255,255,255,0)");
      spriteCtx.fillStyle = grad;
      spriteCtx.beginPath();
      spriteCtx.ellipse(cx, cy, s * 2.5, s, 0, 0, TAU);
      spriteCtx.fill();
      cloudSprites.push({
        canvas: sprite,
        width: spriteWidth,
        height: spriteHeight,
      });
    }
  }

  function buildStaticLayers() {
    const detailCtx = prepareLayer(staticDetailLayer);
    drawCrust(detailCtx);
    drawBoundaries(detailCtx);
  }

  function resize() {
    width = innerWidth;
    height = innerHeight;
    dpr = Math.min(devicePixelRatio || 1, 1.5);

    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    buildStaticScene();
    buildCloudSprites();
    buildStaticLayers();
  }

  function zoneForNormalizedY(n) {
    const y = Math.max(0, Math.min(0.999999, n));
    for (const zone of ZONES) {
      if (y >= zone.y0 && y < zone.y1) return zone;
    }
    return ZONES[ZONES.length - 1];
  }

  function colorCss(zone, alpha = 1) {
    return `rgba(${zone.color[0]}, ${zone.color[1]}, ${zone.color[2]}, ${alpha})`;
  }

  function localRatio(zone, n) {
    return Math.max(0, Math.min(1, (n - zone.y0) / (zone.y1 - zone.y0)));
  }

  function physicalValue(zone, n) {
    const t = localRatio(zone, n);
    if (zone.unit === "altitude") {
      if (zone.low === 0) return zone.high * (1 - t);
      const high = Math.max(zone.high, zone.low);
      const low = Math.min(zone.high, zone.low);
      return Math.exp(Math.log(high) + (Math.log(low) - Math.log(high)) * t);
    }
    return zone.high + (zone.low - zone.high) * t;
  }

  function formatNumber(value) {
    const abs = Math.abs(value);
    if (abs >= 10000) return Math.round(value / 1000) * 1000;
    if (abs >= 1000) return Math.round(value / 10) * 10;
    if (abs >= 100) return Math.round(value);
    if (abs >= 10) return Math.round(value * 10) / 10;
    return Math.round(value * 100) / 100;
  }

  function formatMetric(zone, n) {
    const value = physicalValue(zone, n);
    const formatter =
      value < 10 ? spanishNumberTwoDecimals : spanishNumberOneDecimal;
    const formatted = formatter.format(Math.abs(formatNumber(value)));

    if (zone.unit === "altitude")
      return `${formatted} km de altura · ${zone.material}`;
    if (zone.unit === "depth")
      return `${formatted} km de profundidad · ${zone.material}`;

    if (value >= 0)
      return `${formatted} km sobre el nivel del mar · ${zone.material}`;
    return `${formatted} km bajo el nivel del mar · ${zone.material}`;
  }

  function setTextIfChanged(element, value) {
    if (element.textContent !== value) element.textContent = value;
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
    compressor.threshold.value = -18;
    compressor.knee.value = 18;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.01;
    compressor.release.value = 0.35;

    stereo = audioCtx.createStereoPanner ? audioCtx.createStereoPanner() : null;
    droneFilter = audioCtx.createBiquadFilter();
    droneFilter.type = "lowpass";
    droneFilter.Q.value = 1.2;
    droneGain = audioCtx.createGain();
    droneGain.gain.value = 0.065;

    droneA = audioCtx.createOscillator();
    droneB = audioCtx.createOscillator();
    droneA.type = "sine";
    droneB.type = "sine";
    droneA.frequency.value = 110;
    droneB.frequency.value = 110.8;

    pulseOsc = audioCtx.createOscillator();
    pulseOsc.type = "sine";
    pulseOsc.frequency.value = 33;
    pulseGain = audioCtx.createGain();
    pulseGain.gain.value = 0.015;

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
    noiseGain.gain.value = 0.02;

    droneA.connect(droneFilter);
    droneB.connect(droneFilter);
    droneFilter.connect(droneGain);
    pulseOsc.connect(pulseGain);
    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);

    const mix = audioCtx.createGain();
    droneGain.connect(mix);
    pulseGain.connect(mix);
    noiseGain.connect(mix);

    if (stereo) {
      mix.connect(stereo);
      stereo.connect(master);
    } else {
      mix.connect(master);
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
    const p = zone.sound;
    const local = localRatio(zone, yNorm);
    const freq = p.base * Math.pow(2, (0.5 - local) * 0.12);

    droneA.type = p.type;
    droneB.type = p.type;
    droneA.frequency.setTargetAtTime(freq, now, 0.055);
    droneB.frequency.setTargetAtTime(freq * 1.006, now, 0.055);
    droneFilter.frequency.setTargetAtTime(p.filter, now, 0.075);
    droneGain.gain.setTargetAtTime(
      active ? 0.038 + p.pulse * 0.035 : 0.0001,
      now,
      0.08,
    );

    pulseOsc.frequency.setTargetAtTime(Math.max(24, p.base * 0.38), now, 0.08);
    pulseGain.gain.setTargetAtTime(active ? p.pulse * 0.055 : 0.0001, now, 0.1);

    noiseFilter.frequency.setTargetAtTime(
      Math.max(140, p.filter * 0.58),
      now,
      0.08,
    );
    noiseGain.gain.setTargetAtTime(active ? p.noise * 0.12 : 0.0001, now, 0.1);

    if (stereo) stereo.pan.setTargetAtTime(xNorm * 2 - 1, now, 0.06);
    master.gain.setTargetAtTime(
      active ? 0.72 : 0.0001,
      now,
      active ? 0.06 : 0.22,
    );
  }

  function ping(zone, strength = 1) {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();
    osc.type = zone.id.includes("core") ? "sine" : "triangle";
    osc.frequency.setValueAtTime(Math.max(38, zone.sound.base * 2.1), now);
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(28, zone.sound.base * 1.35),
      now + 0.18,
    );
    filter.type = "lowpass";
    filter.frequency.value = Math.max(450, zone.sound.filter * 1.3);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.045 * strength, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + 0.38);
  }

  function addRipple(x, y, zone) {
    const element = document.createElement("div");
    element.className = "ripple";
    element.style.left = x + "px";
    element.style.top = y + "px";
    element.style.borderColor = colorCss(zone, 0.9);
    element.style.boxShadow = `0 0 28px ${colorCss(zone, 0.45)}`;
    document.body.appendChild(element);
    element.addEventListener("animationend", () => element.remove(), {
      once: true,
    });

    activeRipples.push({
      x,
      y,
      r: 6,
      age: 0,
      life: 0.95,
      color: zone.color,
    });
  }

  function addSparks(x, y, zone, count = 16) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * TAU;
      const speed = 30 + Math.random() * 130;
      sparks.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: 1 + Math.random() * 3.3,
        age: 0,
        life: 0.38 + Math.random() * 0.62,
        color: zone.color,
      });
    }
  }

  function updateReadout(x, y, makeRipple = false) {
    const xNorm = Math.max(0, Math.min(0.999999, x / width));
    const yNorm = Math.max(0, Math.min(0.999999, y / height));
    const zone = zoneForNormalizedY(yNorm);
    const feature = featureFor(zone, xNorm);
    const accent = colorCss(zone);
    const accentSoft = colorCss(zone, 0.38);

    root.style.setProperty("--accent", accent);
    root.style.setProperty("--accent-soft", accentSoft);
    root.style.setProperty("--scan-x", x + "px");
    root.style.setProperty("--scan-y", y + "px");

    setReadoutRegion(readout, zone.id);
    setTextIfChanged(zoneName, zone.name);
    setTextIfChanged(featureName, feature[0]);
    setTextIfChanged(metric, formatMetric(zone, yNorm));
    metric.dataset.learningNarration = zone.material;
    setTextIfChanged(fact, feature[1] || zone.fact);
    setTextIfChanged(
      scaleText,
      zone.unit === "altitude"
        ? "hacia el espacio"
        : zone.unit === "depth"
          ? "hacia el centro"
          : "superficie terrestre",
    );

    const panelAbove = y > height * 0.67;
    const panelBelow = y < height * 0.28;
    const panelY = panelAbove
      ? Math.max(120, y - Math.min(190, height * 0.25))
      : panelBelow
        ? Math.min(height - 120, y + Math.min(190, height * 0.25))
        : height * 0.5;
    const panelX = Math.max(width * 0.5, Math.min(width * 0.5, x));

    readout.style.left = panelX + "px";
    readout.style.top = panelY + "px";
    touchOrb.style.left = x + "px";
    touchOrb.style.top = y + "px";

    readout.classList.add("visible");
    touchOrb.classList.add("visible");
    scaleReadout.classList.add("visible");
    document.body.classList.add("active");

    if (zone.id !== lastZone) {
      if (lastZone) {
        ping(zone, 0.72);
        if (navigator.vibrate) navigator.vibrate(12);
      }
      addSparks(x, y, zone, 12);
      lastZone = zone.id;
    }

    if (makeRipple) {
      addRipple(x, y, zone);
      addSparks(x, y, zone, 22);
      ping(zone, 1);
      if (navigator.vibrate) navigator.vibrate(18);
    }

    setAudioFor(zone, xNorm, yNorm, true);
  }

  function hideReadoutSoon() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      readout.classList.remove("visible");
      touchOrb.classList.remove("visible");
      scaleReadout.classList.remove("visible");
      document.body.classList.remove("active");
      const zone = zoneForNormalizedY(pointerY);
      setAudioFor(zone, pointerX, pointerY, false);
    }, 620);
  }

  function drawGradientBackdrop(drawCtx = ctx) {
    const gradient = drawCtx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0.0, "#01020a");
    gradient.addColorStop(0.07, "#060923");
    gradient.addColorStop(0.155, "#071b3d");
    gradient.addColorStop(0.24, "#093d68");
    gradient.addColorStop(0.31, "#166e9c");
    gradient.addColorStop(0.385, "#42a8d9");
    gradient.addColorStop(0.455, "#9ed7e7");
    gradient.addColorStop(0.47, "#508e80");
    gradient.addColorStop(0.505, "#72432b");
    gradient.addColorStop(0.57, "#5e2f24");
    gradient.addColorStop(0.625, "#742517");
    gradient.addColorStop(0.695, "#a62b11");
    gradient.addColorStop(0.75, "#c8330d");
    gradient.addColorStop(0.845, "#dd4a0d");
    gradient.addColorStop(0.935, "#f5a51f");
    gradient.addColorStop(1.0, "#fff0b4");
    drawCtx.fillStyle = gradient;
    drawCtx.fillRect(0, 0, width, height);
  }

  function drawStars(time) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.shadowBlur = 0;
    for (const star of stars) {
      const twinkle =
        star.a * (0.7 + 0.3 * Math.sin(time * 0.0012 + star.twinkle));
      ctx.fillStyle = `rgba(210,226,255,${twinkle})`;
      ctx.beginPath();
      ctx.arc(star.x * width, star.y * height, star.r, 0, TAU);
      ctx.fill();
    }

    ctx.shadowBlur = 7;
    ctx.shadowColor = "rgba(120,160,255,.72)";
    for (let i = 0; i < stars.length; i += 10) {
      const star = stars[i];
      const twinkle =
        star.a * (0.72 + 0.28 * Math.sin(time * 0.0012 + star.twinkle));
      ctx.fillStyle = `rgba(220,234,255,${twinkle})`;
      ctx.beginPath();
      ctx.arc(star.x * width, star.y * height, star.r * 1.08, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawMagnetosphere(time) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.lineWidth = 1.1;
    for (let i = 0; i < 5; i++) {
      const y = height * (0.065 + i * 0.015);
      const sway = Math.sin(time * 0.00055 + i) * width * 0.018;
      ctx.strokeStyle = `rgba(120,145,255,${0.08 + i * 0.018})`;
      ctx.beginPath();
      ctx.moveTo(-width * 0.05, y + sway * 0.12);
      ctx.bezierCurveTo(
        width * 0.22,
        y - 20 - sway,
        width * 0.7,
        y + 25 + sway,
        width * 1.08,
        y - 4,
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawUpperAtmosphere(time) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";

    for (const mote of motes) {
      const x = ((mote.x + time * 0.000002 * mote.drift) % 1) * width;
      const y = mote.y * height + Math.sin(time * 0.001 + mote.phase) * 4;
      const zone = zoneForNormalizedY(mote.y);
      ctx.fillStyle = colorCss(zone, 0.18);
      ctx.beginPath();
      ctx.arc(x, y, mote.r, 0, TAU);
      ctx.fill();
    }

    const auroraTop = height * 0.163;
    const auroraBottom = height * 0.236;
    for (let band = 0; band < 5; band++) {
      const hue = band % 2 ? "110,255,185" : "78,225,255";
      const alpha = 0.038 + band * 0.014;
      ctx.beginPath();
      for (let x = -30; x <= width + 30; x += 20) {
        const wave =
          Math.sin(x * 0.015 + time * 0.0012 + band * 0.9) * 10 +
          Math.sin(x * 0.031 - time * 0.00055) * 4;
        const y = auroraTop + band * 5 + wave;
        if (x === -30) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      for (let x = width + 30; x >= -30; x -= 20) {
        const wave =
          Math.sin(x * 0.015 + time * 0.0012 + band * 0.9) * 10 +
          Math.sin(x * 0.031 - time * 0.00055) * 4;
        const y = auroraBottom + band * 2 + wave * 0.35;
        ctx.lineTo(x, y);
      }
      ctx.closePath();
      const aurora = ctx.createLinearGradient(0, auroraTop, 0, auroraBottom);
      aurora.addColorStop(0, `rgba(${hue},${alpha * 2.4})`);
      aurora.addColorStop(0.55, `rgba(${hue},${alpha})`);
      aurora.addColorStop(1, `rgba(${hue},0)`);
      ctx.fillStyle = aurora;
      ctx.fill();
    }

    ctx.restore();
  }

  function drawMeteors(time) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (let i = 0; i < 4; i++) {
      const cycle = (time * 0.000055 + i * 0.26) % 1;
      const x = width * (1.1 - cycle * 1.35);
      const y = height * (0.245 + cycle * 0.06 + i * 0.008);
      const len = 35 + i * 8;
      const grad = ctx.createLinearGradient(x, y, x + len, y - len * 0.46);
      grad.addColorStop(0, "rgba(255,255,255,.9)");
      grad.addColorStop(0.25, "rgba(125,210,255,.52)");
      grad.addColorStop(1, "rgba(125,210,255,0)");
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.2 + i * 0.25;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + len, y - len * 0.46);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawOzone(time) {
    const y0 = height * 0.325;
    const y1 = height * 0.362;
    const grad = ctx.createLinearGradient(0, y0, width, y1);
    grad.addColorStop(0, "rgba(93,111,255,.07)");
    grad.addColorStop(0.45, "rgba(151,95,255,.16)");
    grad.addColorStop(1, "rgba(74,196,255,.08)");
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = grad;
    ctx.fillRect(0, y0 + Math.sin(time * 0.0006) * 2, width, y1 - y0);
    ctx.restore();
  }

  function drawClouds(time) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (let i = 0; i < clouds.length; i++) {
      const cloud = clouds[i];
      const sprite = cloudSprites[i];
      const x =
        (((cloud.x + time * cloud.speed * 0.00002) % 1.15) - 0.08) * width;
      const y = cloud.y * height + Math.sin(time * 0.00045 + cloud.phase) * 3;
      if (sprite) {
        ctx.drawImage(
          sprite.canvas,
          x - sprite.width * 0.5,
          y - sprite.height * 0.5,
          sprite.width,
          sprite.height,
        );
      }
    }
    ctx.restore();
  }

  function drawSurface(time) {
    const sea = height * 0.474;
    const surface = height * 0.482;

    ctx.save();
    const skyGlow = ctx.createLinearGradient(0, height * 0.42, 0, surface);
    skyGlow.addColorStop(0, "rgba(255,255,255,0)");
    skyGlow.addColorStop(1, "rgba(255,245,204,.22)");
    ctx.fillStyle = skyGlow;
    ctx.fillRect(0, height * 0.42, width, surface - height * 0.42);

    const mountainGrad = ctx.createLinearGradient(
      0,
      surface - 80,
      0,
      surface + 5,
    );
    mountainGrad.addColorStop(0, "#72918a");
    mountainGrad.addColorStop(0.45, "#56756b");
    mountainGrad.addColorStop(1, "#2d4b3e");
    ctx.fillStyle = mountainGrad;
    ctx.beginPath();
    ctx.moveTo(0, surface + 18);
    ctx.lineTo(0, surface - height * 0.012);
    const points = [
      [0.0, 0.0],
      [0.08, -0.02],
      [0.15, -0.012],
      [0.23, -0.05],
      [0.31, -0.015],
      [0.4, -0.075],
      [0.49, -0.022],
      [0.58, -0.056],
      [0.67, -0.015],
      [0.76, -0.035],
      [0.84, -0.01],
      [0.92, -0.025],
      [1.0, 0.005],
    ];
    for (const [px, py] of points)
      ctx.lineTo(px * width, surface + py * height);
    ctx.lineTo(width, surface + 26);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(89,194,226,.45)";
    ctx.beginPath();
    ctx.moveTo(width * 0.64, sea);
    for (let x = width * 0.64; x <= width; x += 12) {
      const y =
        sea +
        Math.sin(x * 0.028 + time * 0.0018) * 1.8 +
        Math.sin(x * 0.011 - time * 0.001) * 1.2;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(width, surface + 26);
    ctx.lineTo(width * 0.64, surface + 26);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = width * 0.64; x <= width; x += 12) {
      const y =
        sea +
        Math.sin(x * 0.028 + time * 0.0018) * 1.8 +
        Math.sin(x * 0.011 - time * 0.001) * 1.2;
      if (x === width * 0.64) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawCrust(drawCtx = ctx) {
    const top = height * 0.487;
    const bottom = height * 0.625;
    drawCtx.save();

    for (let i = 0; i < 9; i++) {
      const y = top + (bottom - top) * (i / 9);
      drawCtx.strokeStyle = `rgba(255,221,183,${0.035 + i * 0.008})`;
      drawCtx.lineWidth = 1;
      drawCtx.beginPath();
      drawCtx.moveTo(0, y);
      for (let x = 0; x <= width; x += 20) {
        drawCtx.lineTo(x, y + Math.sin(x * 0.018 + i * 1.8) * (2 + i * 0.28));
      }
      drawCtx.stroke();
    }

    drawCtx.strokeStyle = "rgba(255,214,166,.2)";
    drawCtx.lineWidth = 1.15;
    for (const crack of cracks) {
      let x = crack.x * width;
      let y = crack.y * height;
      drawCtx.beginPath();
      drawCtx.moveTo(x, y);
      for (let j = 1; j <= 4; j++) {
        x += crack.lean * width * 0.18 + Math.sin(j * 7.3 + crack.x * 13) * 8;
        y += (crack.len * height) / 4;
        drawCtx.lineTo(x, y);
      }
      drawCtx.stroke();
    }
    drawCtx.restore();
  }

  function drawMantle(time) {
    const top = height * 0.625;
    const bottom = height * 0.845;
    ctx.save();
    ctx.globalCompositeOperation = "screen";

    for (let column = 0; column < 7; column++) {
      const cx = width * ((column + 0.5) / 7);
      const phase = column * 1.4;
      const direction = column % 2 ? -1 : 1;
      ctx.strokeStyle =
        column % 2 ? "rgba(255,188,73,.10)" : "rgba(255,83,33,.11)";
      ctx.lineWidth = Math.max(7, width * 0.012);
      ctx.lineCap = "round";
      ctx.beginPath();
      for (let i = 0; i <= 26; i++) {
        const n = i / 26;
        const y = top + n * (bottom - top);
        const x =
          cx +
          Math.sin(n * TAU * 1.25 + time * 0.00032 * direction + phase) *
            width *
            0.035;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    for (const bubble of bubbles) {
      const yRange = 0.21;
      const yNorm =
        0.635 +
        ((bubble.y - 0.635 - time * 0.000003 * bubble.speed + yRange) % yRange);
      const x = bubble.x * width + Math.sin(time * 0.0008 + bubble.phase) * 8;
      const y = yNorm * height;
      const zone = zoneForNormalizedY(yNorm);
      ctx.fillStyle = colorCss(zone, 0.09);
      ctx.beginPath();
      ctx.arc(x, y, bubble.r, 0, TAU);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawCore(time) {
    const outerTop = height * 0.845;
    const innerTop = height * 0.935;

    ctx.save();
    ctx.globalCompositeOperation = "screen";

    for (let i = 0; i < 9; i++) {
      const y = outerTop + (innerTop - outerTop) * ((i + 0.5) / 9);
      const amp = 10 + i * 1.8;
      ctx.strokeStyle = `rgba(255,211,88,${0.07 + i * 0.009})`;
      ctx.lineWidth = 2 + i * 0.25;
      ctx.beginPath();
      for (let x = -20; x <= width + 20; x += 20) {
        const wave =
          Math.sin(x * 0.018 + time * 0.0011 * (i % 2 ? -1 : 1) + i) * amp;
        if (x === -20) ctx.moveTo(x, y + wave);
        else ctx.lineTo(x, y + wave);
      }
      ctx.stroke();
    }

    const centerX = width * 0.5;
    const centerY = height * 1.02;
    const maxR = Math.max(width, height) * 0.58;
    for (let i = 0; i < 7; i++) {
      const r = maxR * (0.22 + i * 0.075);
      ctx.strokeStyle = `rgba(255,235,167,${0.045 + i * 0.011})`;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.ellipse(centerX, centerY, r * 1.45, r * 0.44, 0, Math.PI, TAU);
      ctx.stroke();
    }

    const glow = ctx.createRadialGradient(
      width * 0.5,
      height * 1.01,
      0,
      width * 0.5,
      height * 1.01,
      height * 0.22,
    );
    glow.addColorStop(0, "rgba(255,255,228,.78)");
    glow.addColorStop(0.2, "rgba(255,230,144,.42)");
    glow.addColorStop(0.6, "rgba(255,178,49,.11)");
    glow.addColorStop(1, "rgba(255,178,49,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, height * 0.9, width, height * 0.1);
    ctx.restore();
  }

  function drawBoundaries(drawCtx = ctx) {
    drawCtx.save();
    for (const zone of ZONES) {
      const y = zone.y0 * height;
      if (y <= 0) continue;
      const zoneColor = colorCss(zone, 0.22);
      const grad = drawCtx.createLinearGradient(0, y, width, y);
      grad.addColorStop(0, "rgba(255,255,255,0)");
      grad.addColorStop(0.2, zoneColor);
      grad.addColorStop(0.8, zoneColor);
      grad.addColorStop(1, "rgba(255,255,255,0)");
      drawCtx.strokeStyle = grad;
      drawCtx.lineWidth = zone.id === "surface" ? 1.5 : 0.7;
      drawCtx.beginPath();
      drawCtx.moveTo(0, y);
      drawCtx.lineTo(width, y);
      drawCtx.stroke();
    }

    const surfaceY = height * 0.46;
    drawCtx.strokeStyle = "rgba(255,255,255,.33)";
    drawCtx.lineWidth = 1.1;
    drawCtx.beginPath();
    drawCtx.moveTo(0, surfaceY);
    drawCtx.lineTo(width, surfaceY);
    drawCtx.stroke();
    drawCtx.restore();
  }

  function drawPointerGlow(time) {
    if (!document.body.classList.contains("active")) return;
    const zone = zoneForNormalizedY(pointerY);
    const x = pointerX * width;
    const y = pointerY * height;
    const pulse = 35 + Math.sin(time * 0.012) * 5;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const glow = ctx.createRadialGradient(x, y, 0, x, y, pulse * 3.2);
    glow.addColorStop(0, colorCss(zone, 0.72));
    glow.addColorStop(0.24, colorCss(zone, 0.22));
    glow.addColorStop(1, colorCss(zone, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, pulse * 3.2, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawEffects(dt) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";

    for (let i = activeRipples.length - 1; i >= 0; i--) {
      const ripple = activeRipples[i];
      ripple.age += dt;
      ripple.r += dt * 210;
      const alpha = Math.max(0, 1 - ripple.age / ripple.life);
      ctx.strokeStyle = `rgba(${ripple.color[0]},${ripple.color[1]},${ripple.color[2]},${alpha * 0.35})`;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(ripple.x, ripple.y, ripple.r, 0, TAU);
      ctx.stroke();
      if (ripple.age >= ripple.life) activeRipples.splice(i, 1);
    }

    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i];
      p.age += dt;
      p.vx *= Math.pow(0.976, dt * 60);
      p.vy *= Math.pow(0.976, dt * 60);
      p.vy += 18 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const alpha = Math.max(0, 1 - p.age / p.life);
      ctx.fillStyle = `rgba(${p.color[0]},${p.color[1]},${p.color[2]},${alpha})`;
      ctx.shadowBlur = 15;
      ctx.shadowColor = `rgba(${p.color[0]},${p.color[1]},${p.color[2]},.75)`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * alpha, 0, TAU);
      ctx.fill();
      if (p.age >= p.life) sparks.splice(i, 1);
    }
    ctx.restore();
  }

  function animate(now) {
    if (document.hidden) {
      raf = 0;
      return;
    }

    const isBusy =
      document.body.classList.contains("active") ||
      activeRipples.length ||
      sparks.length;
    const frameInterval = isBusy ? 1000 / 60 : 1000 / 30;
    if (now - lastDrawTime < frameInterval - 1) {
      raf = requestAnimationFrame(animate);
      return;
    }

    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    lastDrawTime = now;

    pointerX += (targetX - pointerX) * (reducedMotion ? 1 : 0.24);
    pointerY += (targetY - pointerY) * (reducedMotion ? 1 : 0.24);

    drawGradientBackdrop();
    drawStars(now);
    drawMagnetosphere(now);
    drawUpperAtmosphere(now);
    drawMeteors(now);
    drawOzone(now);
    drawClouds(now);
    drawSurface(now);
    drawMantle(now);
    drawCore(now);
    ctx.drawImage(staticDetailLayer, 0, 0, width, height);
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
    targetX = Math.max(0.02, Math.min(0.98, targetX + dx));
    targetY = Math.max(0.005, Math.min(0.995, targetY + dy));
    pointerX = targetX;
    pointerY = targetY;
    clearTimeout(hideTimer);
    updateReadout(targetX * width, targetY * height, false);
    hideReadoutSoon();
  }

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
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      cancelAnimationFrame(raf);
      raf = 0;
      return;
    }

    lastTime = performance.now();
    lastDrawTime = 0;
    if (!raf) raf = requestAnimationFrame(animate);
  });
  window.addEventListener("blur", () => {
    activePointer = null;
    readout.classList.remove("visible");
    touchOrb.classList.remove("visible");
    scaleReadout.classList.remove("visible");
    document.body.classList.remove("active");
    if (audioCtx)
      setAudioFor(zoneForNormalizedY(pointerY), pointerX, pointerY, false);
  });
  document.addEventListener("contextmenu", (event) => event.preventDefault());

  resize();
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(animate);
}
