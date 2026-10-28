// Red vial entre regiones: autopistas, carreteras y periféricos de las ciudades nuevas.
// A partir del plano (worldplan.js) construye para cada vía:
//   1. Trazo: esquinas redondeadas con radio mínimo (curvas que un auto puede tomar) y estaciones cada 4 m.
//   2. Rasante: sigue el terreno suavizado con pendiente máxima por tipo de vía; sobre el agua sube a
//      la altura del puente y baja con rampas.
//   3. Nivelación: corta y rellena el terreno bajo la vía (taludes suaves a los lados).
//   4. Puentes: tablero, pilas, barandal y faroles; se pueden pisar (colisiones y zona jugable).
// Determinista: cliente y servidor obtienen exactamente la misma red.

import { inFine, planWaterAt, lakeDist, landDist, smoothstep, distToPolyline, registerDecks, LAKE_LEVEL } from './terrain.js';
import { HIGHWAYS_PLAN, RINGS_PLAN } from './worldplan.js';
import { routeFromCity } from './routing.js';

const ST = 4;   // separación de estaciones (m)
export const ROAD_SPEC = {
  autopista: { w: 15, sh: 2, grade: 0.06, rmin: 150, mark: 'autopista', color: 0x3c4045 },
  periferico: { w: 13, sh: 1.5, grade: 0.07, rmin: 90, mark: 'autopista', color: 0x3f4348 },
  carretera: { w: 10, sh: 1.5, grade: 0.08, rmin: 70, mark: 'carretera', color: 0x43474c },
  secundaria: { w: 8, sh: 1, grade: 0.1, rmin: 40, mark: 'carretera', color: 0x45494d },
  terraceria: { w: 6, sh: 0.8, grade: 0.13, rmin: 25, mark: 'none', color: 0x9a8064, dirt: true },
};
const SEA_CLEAR = 9, RIVER_CLEAR = 5;      // altura libre mínima del tablero sobre el agua
const DECK_T = 1.4;                         // espesor del tablero
export const PIER_EVERY = 44;

// ---------- trazo ----------
// Redondea cada esquina con un arco del mayor radio posible (hasta 2x el mínimo de la vía)
function fillet(pts, rmin, closed) {
  const n = pts.length, out = [];
  const get = (i) => pts[(i + n) % n];
  if (!closed) out.push(pts[0]);
  for (let i = closed ? 0 : 1; i < (closed ? n : n - 1); i++) {
    const p = get(i), a = get(i - 1), b = get(i + 1);
    const ax = a[0] - p[0], az = a[1] - p[1], bx = b[0] - p[0], bz = b[1] - p[1];
    const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz);
    const ua = [ax / la, az / la], ub = [bx / lb, bz / lb];
    const cos = Math.max(-1, Math.min(1, ua[0] * ub[0] + ua[1] * ub[1]));
    const theta = Math.acos(cos);                         // ángulo interior
    if (Math.PI - theta < 0.02) { out.push(p); continue; }  // casi recto
    const tanHalf = Math.tan(theta / 2);
    const tmax = Math.min(la, lb) * 0.48;                 // la tangente no puede pasar la mitad del tramo
    const R = Math.min(rmin * 2, tmax * tanHalf);
    const t = R / tanHalf;
    const p0 = [p[0] + ua[0] * t, p[1] + ua[1] * t], p1 = [p[0] + ub[0] * t, p[1] + ub[1] * t];
    // centro del arco sobre la bisectriz
    const bis = [ua[0] + ub[0], ua[1] + ub[1]], bl = Math.hypot(bis[0], bis[1]);
    const dc = R / Math.sin(theta / 2);
    const c = [p[0] + (bis[0] / bl) * dc, p[1] + (bis[1] / bl) * dc];
    let a0 = Math.atan2(p0[1] - c[1], p0[0] - c[0]), a1 = Math.atan2(p1[1] - c[1], p1[0] - c[0]);
    let da = a1 - a0;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    const k = Math.max(2, Math.ceil((Math.abs(da) * R) / ST));
    for (let s = 0; s <= k; s++) { const ang = a0 + (da * s) / k; out.push([c[0] + Math.cos(ang) * R, c[1] + Math.sin(ang) * R]); }
  }
  if (!closed) out.push(pts[n - 1]);
  return out;
}
function resample(pts, step, closed) {
  const P = closed ? [...pts, pts[0]] : pts;
  let L = 0;
  const cum = [0];
  for (let i = 1; i < P.length; i++) { L += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); cum.push(L); }
  const n = Math.max(2, Math.round(L / step)), out = [];
  let j = 0;
  for (let k = 0; k <= (closed ? n - 1 : n); k++) {
    const s = (k / n) * L;
    while (j < cum.length - 2 && cum[j + 1] < s) j++;
    const t = (s - cum[j]) / (cum[j + 1] - cum[j] || 1);
    out.push([P[j][0] + (P[j + 1][0] - P[j][0]) * t, P[j][1] + (P[j + 1][1] - P[j][1]) * t]);
  }
  return out;
}
// Suaviza el trazo (cada punto se acerca al promedio de sus vecinos): abre las curvas cerradas.
// No se aleja más de 80 m del trazo original ni entra donde free(x,z) es falso; los extremos no se mueven.
function relax(pts, closed, free = () => true, iters = 400) {
  const n = pts.length, orig = pts.map((p) => [p[0], p[1]]), P = pts.map((p) => [p[0], p[1]]);
  for (let it = 0; it < iters; it++) {
    for (let i = closed ? 0 : 2; i < (closed ? n : n - 2); i++) {
      const a = P[(i - 1 + n) % n], b = P[(i + 1) % n];
      const x = P[i][0] + 0.5 * ((a[0] + b[0]) / 2 - P[i][0]), z = P[i][1] + 0.5 * ((a[1] + b[1]) / 2 - P[i][1]);
      if (Math.hypot(x - orig[i][0], z - orig[i][1]) > 80 || !free(x, z)) continue;
      P[i][0] = x; P[i][1] = z;
    }
  }
  return P;
}
// punto de la vía más cercano a (x,z); con maxD solo busca en las celdas vecinas (rápido)
function nearestOn(road, x, z, maxD = Infinity) {
  let best = null;
  const n = road.pts.length, m = road.closed ? n : n - 1;
  let list = null;
  if (maxD <= 64 && road.cells) {
    list = [];
    const cx = Math.floor(x / 64), cz = Math.floor(z / 64);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const i of road.cells.get(cx + a + ',' + (cz + b)) || []) list.push(i);
    if (!list.length) return null;
  }
  for (const i of list || Array.from({ length: m }, (_, k) => k)) {
    const a = road.pts[i], b = road.pts[(i + 1) % n];
    const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2));
    const px = a[0] + dx * t, pz = a[1] + dz * t, d = Math.hypot(x - px, z - pz);
    if (!best || d < best.d) best = { d, x: px, z: pz, y: road.y[i] + (road.y[(i + 1) % n] - road.y[i]) * t, i, t };
  }
  return best;
}

// ---------- rasante ----------
// Cumple SIEMPRE la pendiente máxima g (por estación): promedia el "relleno mínimo" y el "corte mínimo"
// del terreno suavizado (ambos con pendiente <= g), no baja del piso de los puentes y llega exacta a
// los cruces. Toda combinación por máximo, mínimo o promedio de perfiles con pendiente <= g la conserva.
function lipschitz(v, g, closed, raise) {
  const n = v.length, out = Float32Array.from(v);
  const op = raise ? (a, b) => Math.max(a, b - g) : (a, b) => Math.min(a, b + g);
  for (let rep = 0; rep < (closed ? 2 : 1); rep++) {
    for (let k = 1; k < (closed ? n + 1 : n); k++) { const i = k % n; out[i] = op(out[i], out[(k - 1) % n]); }
    for (let k = closed ? n - 1 : n - 2; k >= (closed ? -1 : 0); k--) { const i = (k + n) % n; out[i] = op(out[i], out[(k + 1) % n]); }
  }
  return out;
}
function profile(t, floor, pins, g, closed) {
  const n = t.length, W = 10;
  const sm = new Float32Array(n);
  for (let i = 0; i < n; i++) {   // terreno suavizado (±40 m)
    let s = 0, c = 0;
    for (let k = -W; k <= W; k++) { let j = i + k; if (closed) j = (j + n) % n; else if (j < 0 || j >= n) continue; s += t[j]; c++; }
    sm[i] = s / c;
  }
  const up = lipschitz(sm, g, closed, true), lo = lipschitz(sm, g, closed, false);
  const L = lipschitz(floor.map((f) => (f === -Infinity ? -1e9 : f)), g, closed, true);
  let y = new Float32Array(n);
  for (let i = 0; i < n; i++) y[i] = Math.max((up[i] + lo[i]) / 2, L[i]);
  for (let it = 0; it < 4; it++) {   // curvas verticales suaves
    const c = Float32Array.from(y);
    for (let i = 0; i < n; i++) {
      const a = closed ? c[(i - 1 + n) % n] : c[Math.max(0, i - 1)], b = closed ? c[(i + 1) % n] : c[Math.min(n - 1, i + 1)];
      y[i] = Math.max((a + 2 * c[i] + b) / 4, L[i]);
    }
  }
  if (pins.length) {   // llegar exacto a cada cruce: conos de pendiente g alrededor de los puntos fijos
    const hi = new Float32Array(n).fill(1e9), lo = new Float32Array(n).fill(-1e9);
    for (const p of pins) { hi[p.i] = Math.min(hi[p.i], p.y); lo[p.i] = Math.max(lo[p.i], p.y); }
    const H = lipschitz(hi, g, closed, false), Lo = lipschitz(lo, g, closed, true);
    for (let i = 0; i < n; i++) y[i] = Math.min(Math.max(y[i], Lo[i]), H[i]);
  }
  return y;
}

// ---------- red completa ----------
export function buildHighways(city) {
  const H0 = city.height;   // terreno antes de nivelar
  const roads = [];
  const defs = [
    ...RINGS_PLAN.map((r) => ({ id: 'P-' + r.city, name: r.name, cls: 'periferico', pts: r.pts, closed: true })),
    ...HIGHWAYS_PLAN.map((h) => ({ id: h.id, name: h.name, cls: h.cls, pts: h.pts })),
  ];
  const exits = [], keepFine = makeKeepFine(city);
  for (const def of defs) {
    const spec = ROAD_SPEC[def.cls];
    let pts = def.pts.map((p) => [p[0], p[1]]);
    // salida de Puerto Nova: se busca por terreno libre desde las avenidas (sin tocar lotes ni sitios)
    if (!def.closed && inFine(pts[0][0], pts[0][1])) {
      const k = pts.findIndex((p) => !inFine(p[0], p[1]));
      const route = routeFromCity(city, { sources: city.net.roads.filter((r) => r.cls === 'avenida'), target: pts[k], avoid: exits });
      if (route) { pts = [...route, ...pts.slice(k + 1)]; exits.push(route); def.exitFrom = route.from; def.free = route.free; }
    }
    // los extremos se pegan a la vía ya construida más cercana (cruce real, misma altura)
    const pins = [];
    if (!def.closed) {
      for (const end of [0, pts.length - 1]) {
        const p = pts[end];
        let best = null;
        for (const r of roads) { const q = nearestOn(r, p[0], p[1]); if (q.d < 90 && (!best || q.d < best.q.d)) best = { r, q }; }
        if (best) { pts[end] = [best.q.x, best.q.z]; pins.push({ end, y: best.q.y, to: best.r.id }); }
        else if (inFine(p[0], p[1])) pins.push({ end, y: H0(p[0], p[1]), to: def.exitFrom || 'Puerto Nova' });
      }
    }
    const smooth = resample(fillet(pts, spec.rmin, def.closed), 8, def.closed);
    const line = resample(def.closed ? smooth : relax(smooth, false, def.free), ST, def.closed);   // los periféricos ya son curvas amplias
    const n = line.length;
    const road = { id: def.id, name: def.name, cls: def.cls, spec, closed: !!def.closed, pts: line, joins: pins.map((p) => p.to) };
    // ---------- agua bajo la vía ----------
    const water = new Uint8Array(n), floor = new Float32Array(n).fill(-Infinity);
    for (let i = 0; i < n; i++) {
      const [x, z] = line[i];
      const g = H0(x, z);
      if (inFine(x, z)) { if (lakeDist(x, z) > -3) { water[i] = 2; floor[i] = LAKE_LEVEL + RIVER_CLEAR + 1; } continue; }   // lago de la presa
      if (g < 0.8 || landDist(x, z) < 3) { water[i] = 1; floor[i] = SEA_CLEAR; }
      else if (planWaterAt(x, z, 3)) { water[i] = 2; floor[i] = g + RIVER_CLEAR + 2; }
    }
    // puente = tramos de agua (unidos si los separa poca tierra) + estribos de 12 m
    const deck = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (water[i]) for (let k = -3; k <= 3; k++) { const j = i + k; if (j >= 0 && j < n) deck[j] = 1; }
    for (let i = 1; i < n; i++) if (!deck[i] && deck[i - 1]) { let j = i; while (j < n && !deck[j]) j++; if (j < n && j - i < 8) for (let k = i; k < j; k++) deck[k] = 1; }
    for (let i = 0; i < n; i++) if (deck[i] && !water[i]) floor[i] = Math.max(floor[i], ...[-3, -2, -1, 1, 2, 3].map((k) => floor[i + k] ?? -Infinity));
    // ---------- rasante ----------
    const t = new Float32Array(n);
    for (let i = 0; i < n; i++) t[i] = water[i] ? floor[i] : H0(line[i][0], line[i][1]);
    const pinArr = pins.map((p) => ({ i: p.end === 0 ? 0 : n - 1, y: p.y }));
    // sobre otra vía ya construida (el cruce) la rasante es la de esa vía: su terreno ya quedó nivelado
    for (let i = 0; i < n; i++) for (const r of roads) {
      const q = nearestOn(r, line[i][0], line[i][1], 30);
      if (q && q.d < r.spec.w / 2 + r.spec.sh + 9) { pinArr.push({ i, y: q.y }); break; }   // franja nivelada de esa vía
    }
    // donde el terreno de Puerto Nova no se puede nivelar (junto a calles y lotes), la vía lo sigue
    for (let i = 0; i < n; i++) if (inFine(line[i][0], line[i][1]) && !water[i] && keepFine(line[i][0], line[i][1])) pinArr.push({ i, y: H0(line[i][0], line[i][1]) });
    const y = profile(t, floor, pinArr, spec.grade * ST, !!def.closed);
    road.y = y;
    road.ground = t;   // terreno original (para medir cortes y rellenos)
    road.floor = floor;
    road.deck = deck;
    road.water = water;
    road.tan = line.map((_, i) => {
      const a = line[Math.max(0, i - 1)], b = line[Math.min(n - 1, i + 1)];
      const ca = def.closed ? line[(i - 1 + n) % n] : a, cb = def.closed ? line[(i + 1) % n] : b;
      const dx = cb[0] - ca[0], dz = cb[1] - ca[1], l = Math.hypot(dx, dz) || 1;
      return [dx / l, dz / l];
    });
    road.cells = new Map();   // índice espacial de los tramos (celdas de 64 m)
    for (let i = 0; i < (road.closed ? n : n - 1); i++) {
      const k = Math.floor(line[i][0] / 64) + ',' + Math.floor(line[i][1] / 64);
      if (!road.cells.has(k)) road.cells.set(k, []);
      road.cells.get(k).push(i);
    }
    roads.push(road);
  }
  const net = { roads, ST, DECK_T };
  gradeTerrain(city, net);
  net.decks = deckSegments(net);
  registerDecks((x, z, margin) => deckAt(net, x, z, margin) !== null);
  net.deckAt = (x, z) => deckAt(net, x, z, 0);
  net.deckNear = (x, z, m) => deckAt(net, x, z, -m) !== null;
  net.piers = piers(net, H0);
  net.pieces = pieces(net);
  return net;
}

// vértices de la malla fina que no se tocan: calles, lotes y lugares de Puerto Nova
function makeKeepFine(city) {
  const F = city.world.fine;
  return (x, z) => {
    if (F.masked && F.masked(x, z)) return true;
    for (const l of city.lots) if (Math.hypot(l.cx - x, l.cz - z) < Math.max(l.w, l.d) / 2 + 4) return true;
    for (const s of city.sites) {
      const px = x - s.cx, pz = z - s.cz, c = Math.cos(s.rot || 0), sn = Math.sin(s.rot || 0);
      if (Math.abs(px * c - pz * sn) < (s.hx || 10) + 6 && Math.abs(px * sn + pz * c) < (s.hz || 10) + 6) return true;
    }
    return false;
  };
}

// ---------- nivelación del terreno (corte y relleno con taludes) ----------
function gradeTerrain(city, net) {
  const W = city.world, F = W.fine, C = W.coarse;
  const keepFine = makeKeepFine(city);
  const lockF = new Uint8Array(F.nx * F.nz), lockC = new Uint8Array(C.nx * C.nz);
  for (const road of net.roads) {
    const half = road.spec.w / 2 + road.spec.sh;
    for (const [G, lock, skip] of [[F, lockF, (x, z) => !inFine(x, z) || keepFine(x, z)], [C, lockC, (x, z) => inFine(x, z)]]) {
      const best = new Map();   // índice de vértice -> {d, y, h0}
      const n = road.pts.length, m = road.closed ? n : n - 1;
      for (let i = 0; i < m; i++) {
        const i2 = (i + 1) % n;
        if (road.deck[i] && road.deck[i2] && (road.water[i] || road.water[i2])) continue;   // bajo el puente no se nivela
        const a = road.pts[i], b = road.pts[i2];
        const reach = half + G.res + 42;
        const x0 = Math.min(a[0], b[0]) - reach, x1 = Math.max(a[0], b[0]) + reach, z0 = Math.min(a[1], b[1]) - reach, z1 = Math.max(a[1], b[1]) + reach;
        const i0 = Math.max(0, Math.ceil((x0 - G.x0) / G.res)), ie = Math.min(G.nx - 1, Math.floor((x1 - G.x0) / G.res));
        const j0 = Math.max(0, Math.ceil((z0 - G.z0) / G.res)), je = Math.min(G.nz - 1, Math.floor((z1 - G.z0) / G.res));
        const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1;
        for (let j = j0; j <= je; j++) for (let ii = i0; ii <= ie; ii++) {
          const x = G.x0 + ii * G.res, z = G.z0 + j * G.res;
          const tt = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2));
          const d = Math.hypot(x - a[0] - dx * tt, z - a[1] - dz * tt);
          if (d > reach) continue;
          const k = j * G.nx + ii;
          const cur = best.get(k);
          if (!cur || d < cur.d) best.set(k, { d, y: road.y[i] + (road.y[i2] - road.y[i]) * tt, x, z });
        }
      }
      for (const [k, v] of best) {
        if (lock[k] || skip(v.x, v.z)) continue;
        const h0 = G.h[k], dy = v.y - h0;
        const core = half + G.res + 0.5;   // una celda más que el acotamiento: el triángulo de la orilla queda plano
        if (v.d <= core) { G.h[k] = v.y - 0.02; lock[k] = 1; continue; }
        const bank = Math.min(40, Math.max(4, Math.abs(dy) * 1.6));   // talud ~1:1.6
        if (v.d > core + bank) continue;
        G.h[k] = v.y - 0.02 + (h0 - v.y + 0.02) * smoothstep(0, 1, (v.d - core) / bank);
      }
    }
  }
  W.seam();
}

// ---------- puentes ----------
function deckSegments(net) {
  const out = [];
  for (const road of net.roads) {
    const n = road.pts.length, m = road.closed ? n : n - 1;
    for (let i = 0; i < m; i++) {
      const i2 = (i + 1) % n;
      if (!road.deck[i] || !road.deck[i2]) continue;
      out.push({ road, a: road.pts[i], b: road.pts[i2], ya: road.y[i], yb: road.y[i2], hw: road.spec.w / 2 + 0.9 });
    }
  }
  // índice espacial (celdas de 64 m)
  const cells = new Map();
  for (const s of out) {
    const k = Math.floor((s.a[0] + s.b[0]) / 2 / 64) + ',' + Math.floor((s.a[1] + s.b[1]) / 2 / 64);
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k).push(s);
  }
  out.cells = cells;
  return out;
}
// altura del tablero en (x,z) o null si no hay puente
function deckAt(net, x, z, margin = 0) {
  const cx = Math.floor(x / 64), cz = Math.floor(z / 64);
  let best = null, bd = Infinity;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    for (const s of net.decks.cells.get(cx + i + ',' + (cz + j)) || []) {
      const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1], L2 = dx * dx + dz * dz || 1;
      const raw = ((x - s.a[0]) * dx + (z - s.a[1]) * dz) / L2;
      if (raw < -0.05 || raw > 1.05) continue;   // más allá del extremo del tramo
      const t = Math.max(0, Math.min(1, raw));
      const d = Math.hypot(x - s.a[0] - dx * t, z - s.a[1] - dz * t);
      if (d < s.hw - margin && d < bd) { bd = d; best = s.ya + (s.yb - s.ya) * t; }
    }
  }
  return best;
}
function piers(net, H0) {
  const out = [];
  for (const road of net.roads) {
    let acc = 0;
    for (let i = 1; i < road.pts.length; i++) {
      if (!road.deck[i] || !road.water[i]) { acc = PIER_EVERY / 2; continue; }
      acc += ST;
      if (acc < PIER_EVERY) continue;
      acc = 0;
      const [x, z] = road.pts[i];
      out.push({ road, i, x, z, top: road.y[i] - DECK_T, bottom: Math.min(H0(x, z), -1) - 1.5, tan: road.tan[i] });
    }
  }
  return out;
}

// trozos de ~32 m para repartir en los mosaicos del dibujo
function pieces(net) {
  const out = [];
  for (const road of net.roads) {
    const n = road.pts.length, m = road.closed ? n : n - 1;
    for (let i = 0; i < m; i += 8) {
      const i1 = Math.min(m, i + 8);
      const mid = road.pts[Math.min(n - 1, Math.floor((i + i1) / 2))];
      out.push({ road, i0: i, i1, cx: mid[0], cz: mid[1] });
    }
  }
  return out;
}

// distancia al eje de la vía más cercana (para despejar árboles y validar)
export function roadDistance(net) {
  const C = 64, cells = new Map();
  for (const road of net.roads) {
    const n = road.pts.length, m = road.closed ? n : n - 1;
    for (let i = 0; i < m; i++) {
      const a = road.pts[i], b = road.pts[(i + 1) % n];
      const k = Math.floor((a[0] + b[0]) / 2 / C) + ',' + Math.floor((a[1] + b[1]) / 2 / C);
      if (!cells.has(k)) cells.set(k, []);
      cells.get(k).push({ a, b, hw: road.spec.w / 2 + road.spec.sh });
    }
  }
  return (x, z) => {
    const cx = Math.floor(x / C), cz = Math.floor(z / C);
    let best = Infinity;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const s of cells.get(cx + i + ',' + (cz + j)) || []) best = Math.min(best, distToPolyline([s.a, s.b], x, z) - s.hw);
    return best;   // < 0: sobre la vía
  };
}

// ---------- colisiones y faroles de los puentes ----------
// Tablero: cajas cortas (una por estación) marcadas deck=1; Rapier usa en su lugar una malla exacta.
// Barandales: muros bajos a los dos lados; pilas: columnas bajo el tablero.
export function highwayColliders(net) {
  const cols = [];
  for (const road of net.roads) {
    const n = road.pts.length, m = road.closed ? n : n - 1, hw = road.spec.w / 2 + 0.9;
    for (let i = 0; i < m; i++) {
      const i2 = (i + 1) % n;
      if (!road.deck[i] || !road.deck[i2]) continue;
      const a = road.pts[i], b = road.pts[i2];
      const cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2, L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const rot = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
      const top = (road.y[i] + road.y[i2]) / 2;
      cols.push({ cx, cz, hx: L / 2 + 0.05, hz: hw, rot, minY: top - DECK_T, maxY: top, deck: 1 });
      const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
      for (const side of [1, -1]) {
        const ox = -uz * side * (hw - 0.2), oz = ux * side * (hw - 0.2);
        cols.push({ cx: cx + ox, cz: cz + oz, hx: L / 2 + 0.05, hz: 0.2, rot, minY: top - 0.2, maxY: top + 1.0 });
      }
    }
  }
  for (const p of net.piers) {
    const rot = Math.atan2(-p.tan[1], p.tan[0]);
    cols.push({ cx: p.x, cz: p.z, hx: 1.2, hz: p.road.spec.w / 2 - 1, rot, minY: p.bottom, maxY: p.top });
  }
  return cols;
}
export function bridgeLamps(net) {
  const out = [];
  for (const road of net.roads) {
    const hw = road.spec.w / 2 + 0.9;
    let acc = 0, side = 1;
    for (let i = 0; i < road.pts.length; i++) {
      if (!road.deck[i]) { acc = 20; continue; }
      if ((acc += ST) < 40) continue;
      acc = 0; side = -side;
      const [x, z] = road.pts[i], [ux, uz] = road.tan[i], nx = -uz, nz = ux;
      out.push({ type: 'lamp', x: x + nx * side * (hw - 0.25), z: z + nz * side * (hw - 0.25), y: road.y[i] + 1.0, r: Math.atan2(-nx * side, -nz * side), deck: 1, col: 1 });
    }
  }
  return out;
}
