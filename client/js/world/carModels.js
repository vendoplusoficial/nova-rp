// Autos con forma (no cajas): la carrocería se "lofta" por secciones a lo largo del auto
// (defensa, cofre, parabrisas, techo, medallón, cajuela), con salpicaderas, rines, faros que
// brillan de noche, parrilla, placas, espejos y líneas de puertas.
// Todo se fusiona en el prototipo del objeto: una sola geometría por modelo y color.
//
// Ejes locales: +Z = frente del auto, +X = derecha, Y = arriba (piso en 0).

import { shade, glow } from './geometry.js';

const GLASS = 0x1f2a33, TRIM = 0x1b1d1f, CHROME = 0xc9cdd1, TIRE = 0x161616;

// Sección: [z, cintura (y), techo (y), semiancho en cintura, semiancho arriba]
// Cada tramo i -> i+1 lleva { side: vidrio lateral, top: vidrio arriba }
const MODELS = {
  compact: {
    L: 3.9, sill: 0.3, wheel: 0.31, axle: [-1.25, 1.3],
    S: [[-1.95, 0.72, 0.86, 0.84, 0.78], [-1.85, 0.9, 1.3, 0.86, 0.7], [-1.45, 0.92, 1.48, 0.86, 0.7], [0.25, 0.92, 1.5, 0.86, 0.7], [0.95, 0.9, 1.0, 0.86, 0.8], [1.72, 0.82, 0.88, 0.84, 0.8], [1.95, 0.6, 0.7, 0.78, 0.72]],
    G: [[0, 0], [1, 1], [1, 0], [1, 1], [0, 0], [0, 0]],
  },
  sedan: {
    L: 4.6, sill: 0.3, wheel: 0.33, axle: [-1.45, 1.45],
    S: [[-2.3, 0.7, 0.8, 0.86, 0.8], [-2.08, 0.86, 0.95, 0.9, 0.84], [-1.5, 0.9, 0.98, 0.9, 0.84], [-0.95, 0.9, 1.42, 0.9, 0.72], [0.35, 0.9, 1.45, 0.9, 0.72], [1.1, 0.88, 0.98, 0.9, 0.82], [1.95, 0.82, 0.86, 0.88, 0.8], [2.3, 0.6, 0.7, 0.8, 0.74]],
    G: [[0, 0], [0, 0], [1, 1], [1, 0], [1, 1], [0, 0], [0, 0]],
  },
  suv: {
    L: 4.75, sill: 0.48, wheel: 0.4, axle: [-1.5, 1.5],
    S: [[-2.37, 0.95, 1.05, 0.92, 0.86], [-2.28, 1.15, 1.82, 0.94, 0.8], [-1.9, 1.17, 1.9, 0.94, 0.8], [0.5, 1.17, 1.92, 0.94, 0.8], [1.25, 1.15, 1.3, 0.94, 0.88], [2.1, 1.08, 1.15, 0.92, 0.86], [2.37, 0.82, 0.98, 0.86, 0.8]],
    G: [[0, 0], [1, 1], [1, 0], [1, 1], [0, 0], [0, 0]],
  },
  sport: {
    L: 4.4, sill: 0.24, wheel: 0.33, axle: [-1.38, 1.4],
    S: [[-2.2, 0.62, 0.72, 0.92, 0.86], [-2.0, 0.76, 0.84, 0.97, 0.9], [-1.3, 0.78, 0.88, 0.97, 0.88], [-0.55, 0.76, 1.16, 0.95, 0.66], [0.2, 0.76, 1.18, 0.95, 0.66], [0.95, 0.74, 0.82, 0.96, 0.86], [1.9, 0.62, 0.68, 0.92, 0.84], [2.2, 0.42, 0.52, 0.84, 0.76]],
    G: [[0, 0], [0, 0], [1, 1], [1, 0], [1, 1], [0, 0], [0, 0]],
  },
  lux: {
    L: 5.1, sill: 0.32, wheel: 0.36, axle: [-1.62, 1.6],
    S: [[-2.55, 0.72, 0.84, 0.9, 0.84], [-2.3, 0.9, 1.0, 0.94, 0.88], [-1.6, 0.94, 1.02, 0.94, 0.88], [-1.0, 0.94, 1.48, 0.94, 0.74], [0.45, 0.94, 1.5, 0.94, 0.74], [1.25, 0.92, 1.02, 0.94, 0.86], [2.2, 0.86, 0.92, 0.92, 0.84], [2.55, 0.64, 0.76, 0.86, 0.78]],
    G: [[0, 0], [0, 0], [1, 1], [1, 0], [1, 1], [0, 0], [0, 0]],
  },
  pickup: {
    L: 5.3, sill: 0.5, wheel: 0.42, axle: [-1.75, 1.6],
    // la batea se agrega aparte (de -2.65 a -0.55)
    S: [[-0.55, 1.15, 1.2, 0.95, 0.9], [-0.45, 1.17, 1.92, 0.95, 0.8], [0.6, 1.17, 1.92, 0.95, 0.8], [1.2, 1.15, 1.3, 0.95, 0.9], [2.35, 1.1, 1.18, 0.94, 0.88], [2.65, 0.85, 1.0, 0.88, 0.82]],
    G: [[0, 0], [1, 0], [1, 1], [0, 0], [0, 0]],
  },
};
export const CAR_TYPES = Object.keys(MODELS);

// cuadrilátero con normal calculada (sombreado facetado creíble) orientada según "hint"
function q(b, a, bb, c, d, hint, col) {
  const ux = bb[0] - a[0], uy = bb[1] - a[1], uz = bb[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
  let n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
  if (n[0] * hint[0] + n[1] * hint[1] + n[2] * hint[2] < 0) n = [-n[0], -n[1], -n[2]];
  if (Math.hypot(n[0], n[1], n[2]) < 1e-6) return;
  b.quad(a, bb, c, d, n, col);
}

// Rueda: llanta (tubo), cara negra, rin con rayos y tapón
function wheel(b, x, z, r, sx, rim) {
  b.tube([[x - sx * 0.12, r, z], [x + sx * 0.12, r, z]], [r, r], 10, TIRE);
  const fx = x + sx * 0.125, n = 10;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    b.tri([fx, r, z], [fx, r + Math.sin(a0) * r, z + Math.cos(a0) * r], [fx, r + Math.sin(a1) * r, z + Math.cos(a1) * r], [sx, 0, 0], 0x202020);
  }
  const rr = r * 0.66, fx2 = fx + sx * 0.008;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    b.tri([fx2, r, z], [fx2, r + Math.sin(a0) * rr, z + Math.cos(a0) * rr], [fx2, r + Math.sin(a1) * rr, z + Math.cos(a1) * rr], [sx, 0, 0], i % 2 ? rim : shade(rim, 0.7));
  }
  b.boxR(fx2 + sx * 0.02, r, z, 0.03, r * 0.22, r * 0.22, 0, shade(rim, 1.1));
}

// Salpicadera: arco oscuro sobre la rueda (pozo) + labio del color del auto
function arch(b, x, z, r, sx, col) {
  const R = r + 0.09, n = 7, fx = x + sx * 0.012;
  for (let i = 0; i < n; i++) {
    const a0 = Math.PI * (i / n) - Math.PI / 2, a1 = Math.PI * ((i + 1) / n) - Math.PI / 2;
    const p0 = [fx, r + Math.cos(a0) * R, z + Math.sin(a0) * R], p1 = [fx, r + Math.cos(a1) * R, z + Math.sin(a1) * R];
    b.tri([fx, r, z], p0, p1, [sx, 0, 0], 0x0d0d0d);
    const o0 = [fx + sx * 0.03, r + Math.cos(a0) * (R + 0.07), z + Math.sin(a0) * (R + 0.07)], o1 = [fx + sx * 0.03, r + Math.cos(a1) * (R + 0.07), z + Math.sin(a1) * (R + 0.07)];
    q(b, p0, p1, o1, o0, [sx, 0.3, 0], shade(col, 0.9));
  }
}

export function carModel(b, type = 'sedan', c = 0xc0392b) {
  const M = MODELS[type] || MODELS.sedan;
  const S = M.S, sill = M.sill, low = sill - 0.12;
  const body = c, dark = shade(c, 0.7), rim = type === 'lux' || type === 'sport' ? 0xd6dadf : type === 'pickup' || type === 'suv' ? 0x8f969c : 0xb3b9bf;
  // ---- carrocería por secciones ----
  for (let i = 0; i < S.length - 1; i++) {
    const [z0, b0, t0, w0, u0] = S[i], [z1, b1, t1, w1, u1] = S[i + 1];
    const [sideG, topG] = M.G[i];
    for (const s of [-1, 1]) {
      // costado bajo (puertas) con ligera curva hacia adentro abajo
      q(b, [s * (w0 - 0.04), low, z0], [s * (w1 - 0.04), low, z1], [s * w1, b1, z1], [s * w0, b0, z0], [s, 0, 0], body);
      // costado alto: ventanas o carrocería
      q(b, [s * w0, b0, z0], [s * w1, b1, z1], [s * u1, t1, z1], [s * u0, t0, z0], [s, 0.4, 0], sideG ? GLASS : body);
      if (sideG) q(b, [s * (w0 + 0.005), b0 - 0.05, z0], [s * (w1 + 0.005), b1 - 0.05, z1], [s * (w1 + 0.005), b1, z1], [s * (w0 + 0.005), b0, z0], [s, 0, 0], TRIM);
    }
    // techo / cofre / cajuela / parabrisas
    q(b, [-u0, t0, z0], [u0, t0, z0], [u1, t1, z1], [-u1, t1, z1], [0, 1, 0], topG ? GLASS : body);
    // fondo
    q(b, [-w0 + 0.04, low, z0], [w0 - 0.04, low, z0], [w1 - 0.04, low, z1], [-w1 + 0.04, low, z1], [0, -1, 0], TRIM);
  }
  // pilares entre vidrios (A y C): franjas de carrocería sobre el vidrio lateral
  // tapas de frente y atrás
  for (const [idx, dir] of [[0, -1], [S.length - 1, 1]]) {
    const [z, bl, t, w, u] = S[idx];
    q(b, [-w + 0.04, low, z], [w - 0.04, low, z], [w, bl, z], [-w, bl, z], [0, 0, dir], body);
    q(b, [-w, bl, z], [w, bl, z], [u, t, z], [-u, t, z], [0, 0.3, dir], body);
  }
  // ---- batea de la pick-up ----
  if (type === 'pickup') {
    const z0 = -2.65, z1 = S[0][0], top = 1.18, w = 0.95;
    for (const s of [-1, 1]) {
      q(b, [s * (w - 0.04), low, z0], [s * (w - 0.04), low, z1], [s * w, top, z1], [s * w, top, z0], [s, 0, 0], body);
      q(b, [s * (w - 0.08), 0.75, z0], [s * (w - 0.08), 0.75, z1], [s * (w - 0.08), top, z1], [s * (w - 0.08), top, z0], [-s, 0, 0], dark);
      b.boxR(s * (w - 0.04), top + 0.02, (z0 + z1) / 2, 0.1, 0.04, z1 - z0, 0, shade(c, 1.1));
    }
    q(b, [-w, low, z0], [w, low, z0], [w, top, z0], [-w, top, z0], [0, 0, -1], body);       // compuerta
    q(b, [-w + 0.08, 0.75, z0 + 0.05], [w - 0.08, 0.75, z0 + 0.05], [w - 0.08, 0.75, z1], [-w + 0.08, 0.75, z1], [0, 1, 0], 0x2a2a2a);
    q(b, [-w + 0.08, 0.75, z1 - 0.02], [w - 0.08, 0.75, z1 - 0.02], [w - 0.08, top, z1 - 0.02], [-w + 0.08, top, z1 - 0.02], [0, 0, -1], dark);
    q(b, [-w + 0.04, low, z0], [w - 0.04, low, z0], [w - 0.04, low, z1], [-w + 0.04, low, z1], [0, -1, 0], TRIM);
    b.boxR(0, 0.6, z0 - 0.06, 1.9, 0.18, 0.12, 0, CHROME);
    for (const s of [-1, 1]) b.boxR(s * 0.72, 0.95, z0 - 0.02, 0.22, 0.32, 0.03, 0, glow(0xd32f2f, 1.3));
  }
  // ---- frente: parrilla, faros, defensa, placa ----
  const F = S[S.length - 1], R0 = S[0];
  const zf = F[0] + 0.012, yb = F[1], wf = F[3];
  const lux = type === 'lux', sport = type === 'sport';
  b.boxR(0, yb - 0.22, zf, wf * (sport ? 0.9 : 0.75), sport ? 0.12 : 0.24, 0.03, 0, lux ? CHROME : TRIM);            // parrilla
  if (lux) for (let i = 0; i < 5; i++) b.boxR(0, yb - 0.34 + i * 0.06, zf + 0.012, wf * 0.72, 0.015, 0.02, 0, 0x2a2d30);
  for (const s of [-1, 1]) {
    b.boxR(s * wf * 0.72, yb - 0.05, zf, wf * 0.42, sport ? 0.08 : 0.13, 0.03, 0, glow(0xfaf6e6, 1.6));           // faros
    b.boxR(s * wf * 0.72, yb - 0.05, zf - 0.005, wf * 0.46, sport ? 0.11 : 0.17, 0.02, 0, TRIM);
  }
  b.boxR(0, low + 0.14, zf + 0.04, wf * 2 - 0.06, 0.2, 0.12, 0, type === 'pickup' || lux ? CHROME : dark);           // defensa
  b.boxR(0, low + 0.2, zf + 0.11, 0.5, 0.12, 0.01, 0, 0xf2f2f2);                                                      // placa
  // ---- atrás: calaveras, defensa, placa ----
  if (type !== 'pickup') {
    const zb = R0[0] - 0.012, ybk = R0[1], wb = R0[3];
    for (const s of [-1, 1]) b.boxR(s * wb * 0.72, ybk + 0.02, zb, wb * 0.45, 0.14, 0.03, 0, glow(0xd32f2f, 1.3));
    if (lux || sport) b.boxR(0, ybk + 0.02, zb, wb * 0.55, 0.05, 0.03, 0, glow(0xb71c1c, 1.2));
    b.boxR(0, low + 0.14, zb - 0.04, wb * 2 - 0.06, 0.2, 0.12, 0, dark);
    b.boxR(0, ybk - 0.18, zb - 0.01, 0.5, 0.12, 0.01, 0, 0xf2f2f2);
    if (sport) b.boxR(0, R0[2] + 0.12, R0[0] + 0.25, wb * 1.7, 0.04, 0.3, 0, dark);                                  // alerón
  }
  // ---- detalles laterales: manijas, línea de puertas, espejos, moldura ----
  // base del parabrisas = fin del último tramo con vidrio arriba; cintura de la cabina
  let wi = 0;
  M.G.forEach((g, i) => { if (g[1]) wi = i; });
  const zA = S[wi + 1][0], cab = S[wi];
  for (const s of [-1, 1]) {
    const w = cab[3] + 0.01;
    b.boxR(s * (w + 0.03), cab[1] + 0.02, zA - 0.25, 0.08, 0.06, 0.08, 0, dark);                                       // brazo del espejo
    b.boxR(s * (w + 0.1), cab[1] + 0.1, zA - 0.25, 0.1, 0.16, 0.24, 0, dark);                                          // espejo
    b.boxR(s * (w + 0.105), cab[1] + 0.1, zA - 0.37, 0.07, 0.12, 0.01, 0, CHROME);
    const doors = type === 'sport' ? [zA - 1.25] : type === 'compact' ? [zA - 1.15] : [zA - 1.15, zA - 2.15];
    for (const dz of doors) {
      b.boxR(s * (w - 0.005), (low + cab[1]) / 2 + 0.05, dz, 0.012, cab[1] - low - 0.05, 0.02, 0, shade(c, 0.6));     // línea de puerta
      b.boxR(s * (w + 0.01), cab[1] - 0.12, dz - 0.25, 0.03, 0.05, 0.18, 0, lux ? CHROME : dark);                       // manija
    }
    if (lux) b.boxR(s * (w + 0.008), cab[1] - 0.02, (S[0][0] + F[0]) / 2, 0.012, 0.03, M.L * 0.8, 0, CHROME);
    b.boxR(s * (w - 0.02), low + 0.06, (M.axle[0] + M.axle[1]) / 2, 0.06, 0.1, M.axle[1] - M.axle[0] - 1.0, 0, TRIM);   // estribo
  }
  // ---- ruedas y salpicaderas ----
  for (const s of [-1, 1]) for (const z of M.axle) {
    const sec = S.reduce((a, q2) => (Math.abs(q2[0] - z) < Math.abs(a[0] - z) ? q2 : a), S[0]);
    const w = type === 'pickup' && z < -0.55 ? 0.95 : sec[3];
    arch(b, s * w, z, M.wheel, s, c);
    wheel(b, s * (w - 0.1), z, M.wheel, s, rim);     // la cara de la llanta asoma por fuera de la carrocería
  }
}
