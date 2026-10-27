export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
// Suavizado exponencial independiente de los FPS: damp(actual, objetivo, velocidad, dt)
export const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
export const TAU = Math.PI * 2;
export function wrapAngle(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}
export const angleDiff = (from, to) => wrapAngle(to - from);
export const dampAngle = (a, b, k, dt) => a + angleDiff(a, b) * (1 - Math.exp(-k * dt));
export const lerpAngle = (a, b, t) => a + angleDiff(a, b) * t;
export function approach(v, target, delta) {
  if (v < target) return Math.min(v + delta, target);
  return Math.max(v - delta, target);
}
export const dist2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
