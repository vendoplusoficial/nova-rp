// Busca por dónde sale una vía nueva de Puerto Nova sin tocar lo que ya existe.
// A* en una rejilla de 8 m: prohibido pasar por lotes, sitios, calles existentes (salvo en la
// calle de la que sale), el mar y otras vías nuevas; cuesta más subir pendientes y cruzar el lago
// (puente). Luego se "tensa" el camino (tramos rectos largos) sin que cueste mucho más.

import { landDist, lakeDist, inFine } from './terrain.js';

const CELL = 8;

export function routeFromCity(city, { sources, target, avoid = [], box }) {
  const B = box || { x0: -1110, z0: -1110, x1: 1110, z1: 1050 };
  const nx = Math.ceil((B.x1 - B.x0) / CELL) + 1, nz = Math.ceil((B.z1 - B.z0) / CELL) + 1;
  const X = (i) => B.x0 + i * CELL, Z = (j) => B.z0 + j * CELL;
  const idx = (i, j) => j * nx + i;
  const blocked = new Uint8Array(nx * nz), water = new Uint8Array(nx * nz), seed = new Uint8Array(nx * nz);
  const H = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = X(i), z = Z(j), k = idx(i, j);
    H[k] = city.height(x, z);
    if (landDist(x, z) < 6) blocked[k] = 1;                              // mar y playa
    else if (inFine(x, z) && lakeDist(x, z) > -4) water[k] = 1;          // lago de la presa y su arroyo
  }
  const mark = (x, z, r, arr = blocked) => {
    const i0 = Math.max(0, Math.floor((x - r - B.x0) / CELL)), i1 = Math.min(nx - 1, Math.ceil((x + r - B.x0) / CELL));
    const j0 = Math.max(0, Math.floor((z - r - B.z0) / CELL)), j1 = Math.min(nz - 1, Math.ceil((z + r - B.z0) / CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (Math.hypot(X(i) - x, Z(j) - z) <= r) arr[idx(i, j)] = 1;
  };
  const markSeg = (a, b, r, arr) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / 4));
    for (let k = 0; k <= n; k++) mark(a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n, r, arr);
  };
  for (const l of city.lots) mark(l.cx, l.cz, Math.max(l.w, l.d) / 2 + 20);
  for (const s of city.sites) {   // rectángulo girado del sitio + margen
    const c = Math.cos(s.rot || 0), sn = Math.sin(s.rot || 0), hx = (s.hx || 10) + 24, hz = (s.hz || 10) + 24, R = Math.hypot(hx, hz);
    const i0 = Math.max(0, Math.floor((s.cx - R - B.x0) / CELL)), i1 = Math.min(nx - 1, Math.ceil((s.cx + R - B.x0) / CELL));
    const j0 = Math.max(0, Math.floor((s.cz - R - B.z0) / CELL)), j1 = Math.min(nz - 1, Math.ceil((s.cz + R - B.z0) / CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const px = X(i) - s.cx, pz = Z(j) - s.cz;
      if (Math.abs(px * c - pz * sn) <= hx && Math.abs(px * sn + pz * c) <= hz) blocked[idx(i, j)] = 1;
    }
  }
  const isSource = (road) => sources.includes(road);
  for (const sg of city.net.segs) markSeg([sg.ax, sg.az], [sg.bx, sg.bz], sg.road.w / 2 + 16, isSource(sg.road) ? seed : blocked);
  for (const line of avoid) for (let k = 0; k < line.length - 1; k++) markSeg(line[k], line[k + 1], 34, blocked);
  // costo de un paso entre dos celdas
  const step = (a, b, len) => {
    if (blocked[b]) return Infinity;
    const slope = Math.abs(H[b] - H[a]) / len;
    return len * (1 + 40 * Math.max(0, slope - 0.04)) * (water[b] ? 6 : 1);
  };
  // A* desde todas las celdas junto a las calles de origen
  const ti = Math.round((target[0] - B.x0) / CELL), tj = Math.round((target[1] - B.z0) / CELL);
  const g = new Float32Array(nx * nz).fill(Infinity), from = new Int32Array(nx * nz).fill(-1), closed = new Uint8Array(nx * nz);
  const heap = [];
  const push = (f, k) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const hEst = (k) => Math.hypot((k % nx) - ti, Math.floor(k / nx) - tj) * CELL;
  for (let k = 0; k < nx * nz; k++) if (seed[k] && !blocked[k]) { g[k] = 0; push(hEst(k), k); }
  const tk = idx(ti, tj);
  while (heap.length) {
    const [, k] = pop();
    if (closed[k]) continue;
    closed[k] = 1;
    if (k === tk) break;
    const i = k % nx, j = Math.floor(k / nx);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
      const q = idx(ii, jj);
      if (closed[q] || seed[q]) continue;   // no se vuelve a la calle de origen
      const c = g[k] + step(k, q, CELL * Math.hypot(di, dj));
      if (c < g[q]) { g[q] = c; from[q] = k; push(c + hEst(q), q); }
    }
  }
  if (!isFinite(g[tk])) return null;
  const cells = [];
  for (let k = tk; k !== -1; k = from[k]) cells.unshift(k);
  const P = cells.map((k) => [X(k % nx), Z(Math.floor(k / nx))]);
  // tensar: saltar al punto más lejano alcanzable en línea recta sin costar más de un 25 % extra
  const lineCost = (a, b) => {
    const L = Math.hypot(P[b][0] - P[a][0], P[b][1] - P[a][1]), n = Math.max(1, Math.ceil(L / CELL));
    let c = 0, prev = cells[a];
    for (let s = 1; s <= n; s++) {
      const x = P[a][0] + ((P[b][0] - P[a][0]) * s) / n, z = P[a][1] + ((P[b][1] - P[a][1]) * s) / n;
      const k = idx(Math.round((x - B.x0) / CELL), Math.round((z - B.z0) / CELL));
      const sc = step(prev, k, L / n);
      if (!isFinite(sc)) return Infinity;
      c += sc; prev = k;
    }
    return c;
  };
  const out = [P[0]];
  let a = 0;
  while (a < P.length - 1) {
    let b = P.length - 1;
    while (b > a + 1 && lineCost(a, b) > (g[cells[b]] - g[cells[a]]) * 1.25 + 8) b--;
    out.push(P[b]);
    a = b;
  }
  // punto exacto de la calle de origen más cercano al arranque
  let best = null;
  for (const sg of city.net.segs) {
    if (!isSource(sg.road)) continue;
    const dx = sg.bx - sg.ax, dz = sg.bz - sg.az, L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((out[0][0] - sg.ax) * dx + (out[0][1] - sg.az) * dz) / L2));
    const px = sg.ax + dx * t, pz = sg.az + dz * t, d = Math.hypot(px - out[0][0], pz - out[0][1]);
    if (!best || d < best.d) best = { d, p: [px, pz], road: sg.road.name };
  }
  out.unshift(best.p);
  out.from = best.road;
  // ¿se puede mover el trazo a (x,z)? (para suavizar curvas sin acercarse a lo existente)
  out.free = (x, z) => {
    const i = Math.round((x - B.x0) / CELL), j = Math.round((z - B.z0) / CELL);
    if (i < 0 || j < 0 || i >= nx || j >= nz) return true;
    return !blocked[idx(i, j)];
  };
  return out;
}
