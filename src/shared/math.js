// Shared deterministic drawing primitives; preserve the original scene math.
export const clamp = (value, min = 0, max = 1) =>
  Math.max(min, Math.min(max, value));
export const mix = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
export const fract = (value) => value - Math.floor(value);
export const seeded = (value) =>
  fract(Math.sin(value * 127.1 + 311.7) * 43758.5453123);
export const rgba = (color, alpha) =>
  `rgba(${color[0]},${color[1]},${color[2]},${alpha})`;
