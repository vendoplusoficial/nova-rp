// Dibujo de la red vial entre regiones (shared/highways.js): asfalto pegado al terreno nivelado,
// acotamientos, rayas, y puentes (tablero, barandal y pilas). Todo se fusiona en la geometría del
// mosaico, como las calles de Puerto Nova.

import { inFine } from '/shared/terrain.js';

const CONCRETE = 0xa7a29a, PARAPET = 0xc9c4ba, PIER = 0x9c978f, GRAVEL = 0x8b8577, DIRT_EDGE = 0x8d7a60;
const LINE_W = 0xe9e9e4, LINE_Y = 0xe8c547;
const LIFT = 0.06, LIFT_PN = 0.16;

// Un trozo de vía (estaciones i0..i1) dentro de un mosaico
export function drawHighwayPiece(P, city, pc, far) {
  const road = pc.road, n = road.pts.length, spec = road.spec, hw = spec.w / 2, sh = spec.sh;
  const st = far ? 2 : 1;
  const I = (i) => (road.closed ? (i + n) % n : Math.min(n - 1, i));
  // posición de un punto de la sección: estación i, desplazamiento lateral off
  const at = (i, off) => {
    const k = I(i), [x0, z0] = road.pts[k], [ux, uz] = road.tan[k];
    const x = x0 - uz * off, z = z0 + ux * off;
    // en Puerto Nova el terreno junto a las calles no se nivela: un poco más de altura para que no asome
    const y = road.deck[k] ? road.y[k] : city.height(x, z) + (inFine(x, z) ? LIFT_PN : LIFT);
    return [x, y, z];
  };
  const idx = [];
  for (let i = pc.i0; i < pc.i1; i += st) idx.push(i);
  idx.push(pc.i1);
  // ---- calzada y acotamientos ----
  // columnas de la sección cada ~2.5 m (sigue mejor al terreno) y orillas exactas de la calzada
  const nIn = Math.max(2, Math.ceil(spec.w / 2.5));
  const cols = far ? [hw + sh, -(hw + sh)] : [hw + sh, ...Array.from({ length: nIn + 1 }, (_, k) => hw - (spec.w * k) / nIn), -(hw + sh)];
  const colColor = (c0, c1) => (Math.abs(c0) > hw + 0.01 || Math.abs(c1) > hw + 0.01 ? (spec.dirt ? DIRT_EDGE : GRAVEL) : spec.color);
  let prev = null;
  for (const i of idx) {
    const row = cols.map((off) => at(i, off));
    if (prev) for (let c = 0; c < cols.length - 1; c++) P.quad(row[c + 1], row[c], prev[c], prev[c + 1], [0, 1, 0], far ? spec.color : colColor(cols[c], cols[c + 1]));
    prev = row;
  }
  if (!far) marks(P, road, pc, at, hw);
  bridge(P, road, pc, far, hw);
}

function stripe(P, at, i, off, w, col) {
  const a0 = at(i, off - w / 2), a1 = at(i, off + w / 2), b0 = at(i + 1, off - w / 2), b1 = at(i + 1, off + w / 2);
  for (const p of [a0, a1, b0, b1]) p[1] += 0.015;
  P.quad(a0, a1, b1, b0, [0, 1, 0], col);
}
function marks(P, road, pc, at, hw) {
  const m = road.spec.mark;
  if (m === 'none') return;
  for (let i = pc.i0; i < pc.i1; i++) {
    const dash = i % 3 < 2;   // 8 m pintado, 4 m sin pintar
    if (m === 'autopista') {
      for (const off of [-0.18, 0.18]) stripe(P, at, i, off, 0.14, LINE_Y);
      if (dash) for (const off of [-hw / 2, hw / 2]) stripe(P, at, i, off, 0.14, LINE_W);
    } else if (dash) stripe(P, at, i, 0, 0.14, LINE_Y);
    for (const off of [-(hw - 0.35), hw - 0.35]) stripe(P, at, i, off, 0.12, LINE_W);
  }
}

// tablero, barandal y pilas de los tramos sobre el agua
function bridge(P, road, pc, far, hw) {
  const n = road.pts.length;
  const I = (i) => (road.closed ? (i + n) % n : Math.min(n - 1, i));
  const T = 1.4, edge = hw + 0.9;
  const P3 = (k, off, dy) => { const [x, z] = road.pts[k], [ux, uz] = road.tan[k]; return [x - uz * off, road.y[k] + dy, z + ux * off]; };
  for (let i = pc.i0; i < pc.i1; i++) {
    const a = I(i), b = I(i + 1);
    if (!road.deck[a] || !road.deck[b]) continue;
    const [ux, uz] = road.tan[a];
    for (const s of [1, -1]) {
      const nx = -uz * s, nz = ux * s;
      // banqueta de concreto entre la calzada y el barandal
      P.quad(P3(a, s * hw, 0.08), P3(a, s * (edge - 0.4), 0.08), P3(b, s * (edge - 0.4), 0.08), P3(b, s * hw, 0.08), [0, 1, 0], CONCRETE);
      // barandal: cara interior, superior y exterior (la exterior baja hasta el fondo del tablero)
      P.quad(P3(a, s * (edge - 0.4), 0.08), P3(b, s * (edge - 0.4), 0.08), P3(b, s * (edge - 0.4), 1.0), P3(a, s * (edge - 0.4), 1.0), [-nx, 0, -nz], PARAPET);
      P.quad(P3(a, s * (edge - 0.4), 1.0), P3(b, s * (edge - 0.4), 1.0), P3(b, s * edge, 1.0), P3(a, s * edge, 1.0), [0, 1, 0], PARAPET);
      P.quad(P3(a, s * edge, 1.0), P3(b, s * edge, 1.0), P3(b, s * edge, -T), P3(a, s * edge, -T), [nx, 0, nz], CONCRETE);
    }
    if (!far || i % 2 === 0) P.quad(P3(a, edge, -T), P3(a, -edge, -T), P3(b, -edge, -T), P3(b, edge, -T), [0, -1, 0], 0x7d7973);   // panza del tablero
    // tapa del extremo del puente
    if (!road.deck[I(i - 1)] || i === 0) P.quad(P3(a, edge, 1.0), P3(a, -edge, 1.0), P3(a, -edge, -T), P3(a, edge, -T), [-ux, 0, -uz], CONCRETE);
  }
}

// pila: columna doble con cabezal bajo el tablero
export function drawPier(P, p, far) {
  const [ux, uz] = p.tan, rot = Math.atan2(ux, uz);
  const w = p.road.spec.w / 2 + 0.6, h = p.top - p.bottom;
  P.boxR(p.x, p.top - 0.5, p.z, w * 2, 1.0, 2.2, rot, PIER);   // cabezal (atraviesa la vía)
  for (const s of far ? [0] : [-1, 1]) {
    const ox = -uz * s * (w - 2), oz = ux * s * (w - 2);
    P.boxR(p.x + ox, p.bottom + h / 2 - 0.5, p.z + oz, far ? w * 1.6 : 1.8, h - 1, 1.8, rot, PIER);
  }
}
