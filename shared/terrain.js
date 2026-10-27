// Terreno de Puerto Nova a partir del diseño del mapa (shared/mapdata.js):
// tierra firme e islas, playas de arena y costa rocosa, montañas al norte y noroeste, mesetas,
// presa con lago, río hacia el mar, calzadas sobre el agua y muelles.
// Determinista: cliente y servidor calculan exactamente el mismo terreno.
//
// Ejes: +X = este, +Z = sur. Nivel del mar = 0.

import { WORLD, MAINLAND, ISLANDS, LAKE, RIVER, CAUSEWAYS, PIERS, SANDY, RIDGES, HILLS, PLATEAUS } from './mapdata.js';

export const SEA_LEVEL = 0;
export const TERRAIN_RES = 4;                 // metros por celda del mapa de alturas
export const TERRAIN_MIN = -960, TERRAIN_MAX_X = 960, TERRAIN_MAX_Z = 880;
export { WORLD };

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// ---------- ruido determinista ----------
function hash2(ix, iz, seed) {
  let h = (ix * 374761393 + iz * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function valueNoise(x, z, seed = 1) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed), c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uz) * 2 - 1;
}
export function fbm(x, z, seed = 1, oct = 4) {
  let s = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += valueNoise(x * f, z * f, seed + i * 17) * amp; amp *= 0.5; f *= 2.03; }
  return s;
}

// ---------- geometría ----------
export function distToPolyline(pts, x, z, closed = false) {
  let best = Infinity;
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1e-9;
    let t = ((x - a[0]) * dx + (z - a[1]) * dz) / L2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = x - a[0] - dx * t, ez = z - a[1] - dz * t;
    const d = ex * ex + ez * ez;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}
export function pointInPoly(pts, x, z) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], zi = pts[i][1], xj = pts[j][0], zj = pts[j][1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
// distancia con signo a un polígono (+ dentro)
export function polyDist(pts, x, z) { const d = distToPolyline(pts, x, z, true); return pointInPoly(pts, x, z) ? d : -d; }

// ---------- campos precalculados (malla de 4 m) ----------
const RES = TERRAIN_RES;
const GX0 = TERRAIN_MIN, GZ0 = TERRAIN_MIN;
const NX = Math.round((TERRAIN_MAX_X - TERRAIN_MIN) / RES) + 1;
const NZ = Math.round((TERRAIN_MAX_Z - TERRAIN_MIN) / RES) + 1;
let F = null; // { land, dist, lakeD, sandy, hBase }

// Rellena (por filas) los vértices dentro de un polígono
function scanFill(mask, pts, val) {
  let zmin = Infinity, zmax = -Infinity;
  for (const p of pts) { zmin = Math.min(zmin, p[1]); zmax = Math.max(zmax, p[1]); }
  const j0 = Math.max(0, Math.ceil((zmin - GZ0) / RES)), j1 = Math.min(NZ - 1, Math.floor((zmax - GZ0) / RES));
  for (let j = j0; j <= j1; j++) {
    const z = GZ0 + j * RES;
    const xs = [];
    for (let i = 0, k = pts.length - 1; i < pts.length; k = i++) {
      const a = pts[k], b = pts[i];
      if ((a[1] > z) !== (b[1] > z)) xs.push(a[0] + ((z - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
    }
    xs.sort((p, q) => p - q);
    for (let q = 0; q + 1 < xs.length; q += 2) {
      const i0 = Math.max(0, Math.ceil((xs[q] - GX0) / RES)), i1 = Math.min(NX - 1, Math.floor((xs[q + 1] - GX0) / RES));
      for (let i = i0; i <= i1; i++) mask[j * NX + i] = val;
    }
  }
}
function stampLine(mask, pts, halfW, val) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
  const i0 = Math.max(0, Math.floor((x0 - halfW - GX0) / RES)), i1 = Math.min(NX - 1, Math.ceil((x1 + halfW - GX0) / RES));
  const j0 = Math.max(0, Math.floor((z0 - halfW - GZ0) / RES)), j1 = Math.min(NZ - 1, Math.ceil((z1 + halfW - GZ0) / RES));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    if (distToPolyline(pts, GX0 + i * RES, GZ0 + j * RES) <= halfW) mask[j * NX + i] = val;
  }
}
// Distancia (aprox. euclidiana, chaflán 3-4) de cada vértice al borde de la máscara; + dentro, - fuera
function signedDistance(mask) {
  const INF = 1e9;
  const inD = new Float32Array(NX * NZ), outD = new Float32Array(NX * NZ);
  for (let k = 0; k < NX * NZ; k++) { inD[k] = mask[k] ? INF : 0; outD[k] = mask[k] ? 0 : INF; }
  const a = RES, b = RES * Math.SQRT2;
  for (const D of [inD, outD]) {
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const k = j * NX + i; let v = D[k];
      if (v === 0) continue;
      if (i > 0) v = Math.min(v, D[k - 1] + a);
      if (j > 0) { v = Math.min(v, D[k - NX] + a); if (i > 0) v = Math.min(v, D[k - NX - 1] + b); if (i < NX - 1) v = Math.min(v, D[k - NX + 1] + b); }
      D[k] = v;
    }
    for (let j = NZ - 1; j >= 0; j--) for (let i = NX - 1; i >= 0; i--) {
      const k = j * NX + i; let v = D[k];
      if (v === 0) continue;
      if (i < NX - 1) v = Math.min(v, D[k + 1] + a);
      if (j < NZ - 1) { v = Math.min(v, D[k + NX] + a); if (i < NX - 1) v = Math.min(v, D[k + NX + 1] + b); if (i > 0) v = Math.min(v, D[k + NX - 1] + b); }
      D[k] = v;
    }
  }
  const out = new Float32Array(NX * NZ);
  for (let k = 0; k < NX * NZ; k++) out[k] = mask[k] ? Math.max(0, inD[k] - RES / 2) : -Math.max(0, outD[k] - RES / 2);
  return out;
}

function fields() {
  if (F) return F;
  const land = new Uint8Array(NX * NZ), lake = new Uint8Array(NX * NZ), sandy = new Uint8Array(NX * NZ);
  scanFill(land, MAINLAND, 1);
  for (const is of ISLANDS) scanFill(land, is.pts, 1);
  for (const c of CAUSEWAYS) stampLine(land, c.pts, c.width / 2, 1);
  for (const p of PIERS) if (p.h < 5) stampLine(land, p.pts, p.width / 2, 1);
  stampLine(land, RIVER.pts, RIVER.width / 2, 0);
  scanFill(lake, LAKE.pts, 1);
  for (const s of SANDY) scanFill(sandy, s, 1);
  const dist = signedDistance(land);
  const lakeD = signedDistance(lake);
  F = { land, lake, sandy, dist, lakeD };
  return F;
}

function sample(arr, x, z) {
  const fx = clamp((x - GX0) / RES, 0, NX - 1.001), fz = clamp((z - GZ0) / RES, 0, NZ - 1.001);
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
  const k = j * NX + i;
  return (arr[k] * (1 - u) + arr[k + 1] * u) * (1 - v) + (arr[k + NX] * (1 - u) + arr[k + NX + 1] * u) * v;
}
function nearest(arr, x, z) {
  const i = clamp(Math.round((x - GX0) / RES), 0, NX - 1), j = clamp(Math.round((z - GZ0) / RES), 0, NZ - 1);
  return arr[j * NX + i];
}

// Distancia a la orilla del mar (+ tierra, - agua)
export function landDist(x, z) { return sample(fields().dist, x, z); }
// Distancia a la orilla del lago (+ dentro del agua)
export function lakeDist(x, z) { return sample(fields().lakeD, x, z); }
export function isSandy(x, z) { return nearest(fields().sandy, x, z) === 1; }
export function inWorld(x, z, margin = 0) { return x > WORLD.x0 + margin && x < WORLD.x1 - margin && z > WORLD.z0 + margin && z < WORLD.z1 - margin; }

// Cajas envolventes para descartar rápido las formas lejanas
const bbox = (pts, m) => { let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity; for (const p of pts) { a = Math.min(a, p[0]); b = Math.max(b, p[0]); c = Math.min(c, p[1]); d = Math.max(d, p[1]); } return [a - m, b + m, c - m, d + m]; };
const inBox = (bb, x, z) => x >= bb[0] && x <= bb[1] && z >= bb[2] && z <= bb[3];
for (const pl of PLATEAUS) pl.bb = bbox(pl.pts, pl.edge);
for (const r of RIDGES) r.bb = bbox(r.pts, r.w);
for (const c of CAUSEWAYS) c.bb = bbox(c.pts, c.width / 2 + 8);
for (const p of PIERS) p.bb = bbox(p.pts, p.width / 2 + 4);
const RIVER_BB = bbox(RIVER.pts, RIVER.width / 2 + 17);

export function baseHeight(x, z) {
  const f = fields();
  const d = sample(f.dist, x, z);
  let h;
  if (d < 0) h = -1.2 - Math.min(9, -d * 0.12);
  else if (nearest(f.sandy, x, z)) h = 0.25 + 1.5 * smoothstep(0, 45, d) + 1.6 * smoothstep(40, 80, d);   // playa ancha
  else h = 0.35 + 2.6 * smoothstep(0, 9, d) + 0.5 * smoothstep(9, 40, d);                               // costa rocosa
  if (d > 0) {
    const inland = smoothstep(20, 120, d);
    h += fbm(x * 0.0042, z * 0.0042, 3, 3) * 1.4 * inland;
    for (const pl of PLATEAUS) {
      if (!inBox(pl.bb, x, z)) continue;
      const sd = polyDist(pl.pts, x, z);
      if (sd > -pl.edge) h += pl.h * smoothstep(-pl.edge, 0, sd);
    }
    for (const r of RIDGES) {
      if (!inBox(r.bb, x, z)) continue;
      const dd = distToPolyline(r.pts, x, z);
      // perfil de campana (cresta redondeada, sin pico) con ondulación suave a lo largo de la sierra
      if (dd < r.w) { const t = 1 - dd / r.w; h += r.h * t * t * (3 - 2 * t) * (0.8 + 0.45 * fbm(x * 0.008, z * 0.008, 11, 2)); }
    }
    for (const hl of HILLS) {
      const dd = Math.hypot(x - hl.at[0], z - hl.at[1]);
      if (dd < hl.r) { const t = 1 - dd / hl.r; h += hl.h * t * t * (3 - 2 * t); }   // loma redonda (sin punta)
    }
    for (const is of ISLANDS) {
      const dd = Math.hypot(x - is.peakAt[0], z - is.peakAt[1]);
      if (dd < 80) { const t = 1 - dd / 80; h += is.peak * t * t * (3 - 2 * t) * smoothstep(0, 12, d); }
    }
  }
  // lago de la presa
  const ld = sample(f.lakeD, x, z);
  if (ld > -24) {
    if (ld > 0) h = LAKE.level - 1.4 - Math.min(6, ld * 0.12);
    else h = lerp(LAKE.level + 0.7, Math.max(h, LAKE.level + 0.7), smoothstep(0, 24, -ld));
  }
  // río (cauce bajo el nivel del mar; el agua del mar lo llena)
  const rd = inBox(RIVER_BB, x, z) ? distToPolyline(RIVER.pts, x, z) : 1e9;
  const rw = RIVER.width / 2;
  if (rd < rw + 16) h = rd < rw ? -2.2 : lerp(0.5, h, smoothstep(rw, rw + 16, rd));
  // calzadas y muelles (terraplén plano)
  for (const c of CAUSEWAYS) {
    if (!inBox(c.bb, x, z)) continue;
    const cd = distToPolyline(c.pts, x, z);
    if (cd < c.width / 2 + 7) h = Math.max(h, cd < c.width / 2 ? 1.6 : lerp(1.6, -2, (cd - c.width / 2) / 7));
  }
  for (const p of PIERS) {
    if (!inBox(p.bb, x, z)) continue;
    const pd = distToPolyline(p.pts, x, z);
    if (pd < p.width / 2 + 3) h = pd < p.width / 2 ? p.h : Math.min(h, p.h);
  }
  return h;
}

// ---------- mapa de alturas con aplanado ----------
export class Heightmap {
  constructor() {
    this.res = RES;
    this.x0 = GX0; this.z0 = GZ0;
    this.nx = NX; this.nz = NZ;
    this.h = new Float32Array(this.nx * this.nz);
    this.mask = new Uint8Array(this.nx * this.nz); // 1 = celda de calle (no la tocan los lotes)
    for (let j = 0; j < this.nz; j++) {
      const z = this.z0 + j * this.res;
      for (let i = 0; i < this.nx; i++) this.h[j * this.nx + i] = baseHeight(this.x0 + i * this.res, z);
    }
    this.smoothInland(3);
  }

  // Suaviza el relieve tierra adentro (quita picos y escalones de 4 m). No toca la costa, el lago,
  // el río, las calzadas ni los muelles: ahí la altura tiene que ser exacta.
  smoothInland(passes) {
    const { nx, nz } = this;
    const fixed = new Uint8Array(nx * nz);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = this.x0 + i * this.res, z = this.z0 + j * this.res;
      const k = j * nx + i;
      if (this.h[k] < 2.5 || lakeDist(x, z) > -30 || landDist(x, z) < 12) { fixed[k] = 1; continue; }
      if (inBox(RIVER_BB, x, z) && distToPolyline(RIVER.pts, x, z) < RIVER.width / 2 + 20) { fixed[k] = 1; continue; }
      for (const p of PIERS) if (inBox(p.bb, x, z)) { fixed[k] = 1; break; }
    }
    const tmp = new Float32Array(nx * nz);
    for (let pass = 0; pass < passes; pass++) {
      tmp.set(this.h);
      for (let j = 1; j < nz - 1; j++) for (let i = 1; i < nx - 1; i++) {
        const k = j * nx + i;
        if (fixed[k]) continue;
        const s = 4 * tmp[k] + 2 * (tmp[k - 1] + tmp[k + 1] + tmp[k - nx] + tmp[k + nx]) + tmp[k - nx - 1] + tmp[k - nx + 1] + tmp[k + nx - 1] + tmp[k + nx + 1];
        this.h[k] = s / 16;
      }
    }
  }

  get(i, j) {
    i = clamp(i, 0, this.nx - 1); j = clamp(j, 0, this.nz - 1);
    return this.h[j * this.nx + i];
  }

  // Interpolación por triángulos (igual que la malla de terreno y el colisionador): diagonal (i,j)-(i+1,j+1)
  height(x, z) {
    const fx = (x - this.x0) / this.res, fz = (z - this.z0) / this.res;
    let i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= this.nx - 1 || j >= this.nz - 1) return baseHeight(x, z);
    const u = fx - i, v = fz - j;
    const h00 = this.h[j * this.nx + i], h10 = this.h[j * this.nx + i + 1];
    const h01 = this.h[(j + 1) * this.nx + i], h11 = this.h[(j + 1) * this.nx + i + 1];
    if (u >= v) return h00 + (h10 - h00) * u + (h11 - h10) * v;
    return h00 + (h11 - h01) * u + (h01 - h00) * v;
  }

  masked(x, z) {
    const i = Math.round((x - this.x0) / this.res), j = Math.round((z - this.z0) / this.res);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return false;
    return this.mask[j * this.nx + i] === 1;
  }

  // Aplana un corredor a lo largo de un segmento (calles). keep=true: no toca lo que ya es calle
  flattenSegment(ax, az, ah, bx, bz, bh, core, blend, keep = false) {
    const R = core + blend;
    const i0 = Math.floor((Math.min(ax, bx) - R - this.x0) / this.res), i1 = Math.ceil((Math.max(ax, bx) + R - this.x0) / this.res);
    const j0 = Math.floor((Math.min(az, bz) - R - this.z0) / this.res), j1 = Math.ceil((Math.max(az, bz) + R - this.z0) / this.res);
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
    for (let j = Math.max(0, j0); j <= Math.min(this.nz - 1, j1); j++) {
      const z = this.z0 + j * this.res;
      for (let i = Math.max(0, i0); i <= Math.min(this.nx - 1, i1); i++) {
        const x = this.x0 + i * this.res;
        const t = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1);
        const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
        if (d >= R) continue;
        const target = ah + (bh - ah) * t;
        const k = j * this.nx + i;
        if (d <= core) { if (!(keep && this.mask[k])) { this.h[k] = target; this.mask[k] = 1; } }
        else if (!this.mask[k]) this.h[k] = lerp(this.h[k], target, smoothstep(R, core, d));
      }
    }
  }

  // Aplana el corredor de una calle completa siguiendo su perfil (pts[i] -> hs[i]).
  // Cada celda toma la altura del punto MÁS CERCANO de la calle (una sola vez, sin mezclas entre
  // tramos). Fuera del núcleo, el talud se ensancha según el desnivel (máx. ~1:2) para que las
  // laderas lleguen a la calle de forma natural, sin paredes ni picos.
  flattenRoad(pts, hs, closed, core, blendMin, keep = true) {
    const n = closed ? pts.length : pts.length - 1;
    const BMAX = 34, R = core + BMAX;
    const best = new Map(); // celda -> [distancia, altura objetivo]
    for (let s = 0; s < n; s++) {
      const a = pts[s], b = pts[(s + 1) % pts.length], ah = hs[s], bh = hs[(s + 1) % pts.length];
      const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1;
      const i0 = Math.max(0, Math.floor((Math.min(a[0], b[0]) - R - this.x0) / this.res)), i1 = Math.min(this.nx - 1, Math.ceil((Math.max(a[0], b[0]) + R - this.x0) / this.res));
      const j0 = Math.max(0, Math.floor((Math.min(a[1], b[1]) - R - this.z0) / this.res)), j1 = Math.min(this.nz - 1, Math.ceil((Math.max(a[1], b[1]) + R - this.z0) / this.res));
      for (let j = j0; j <= j1; j++) {
        const z = this.z0 + j * this.res;
        for (let i = i0; i <= i1; i++) {
          const x = this.x0 + i * this.res;
          const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / L2, 0, 1);
          const d = Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t));
          if (d >= R) continue;
          const k = j * this.nx + i, o = best.get(k);
          if (!o || d < o[0]) best.set(k, [d, ah + (bh - ah) * t]);
        }
      }
    }
    for (const [k, [d, target]] of best) {
      if (d <= core) { if (!(keep && this.mask[k])) { this.h[k] = target; this.mask[k] = 1; } continue; }
      if (this.mask[k]) continue;
      const B = clamp(Math.abs(this.h[k] - target) * 2.2, blendMin, BMAX);
      if (d < core + B) this.h[k] = lerp(this.h[k], target, smoothstep(core + B, core, d));
    }
  }

  // Aplana un rectángulo girado (lotes, edificios emblemáticos)
  flattenRect(cx, cz, hx, hz, rot, target, blend, respectMask = false) {
    const c = Math.cos(rot), s = Math.sin(rot);
    const ext = Math.abs(hx * c) + Math.abs(hz * s) + blend, exz = Math.abs(hx * s) + Math.abs(hz * c) + blend;
    const i0 = Math.floor((cx - ext - this.x0) / this.res), i1 = Math.ceil((cx + ext - this.x0) / this.res);
    const j0 = Math.floor((cz - exz - this.z0) / this.res), j1 = Math.ceil((cz + exz - this.z0) / this.res);
    for (let j = Math.max(0, j0); j <= Math.min(this.nz - 1, j1); j++) {
      const z = this.z0 + j * this.res;
      for (let i = Math.max(0, i0); i <= Math.min(this.nx - 1, i1); i++) {
        const x = this.x0 + i * this.res;
        const dx = x - cx, dz = z - cz;
        const lx = dx * c - dz * s, lz = dx * s + dz * c;
        const ox = Math.max(0, Math.abs(lx) - hx), oz = Math.max(0, Math.abs(lz) - hz);
        const d = Math.hypot(ox, oz);
        if (d >= blend && (ox > 0 || oz > 0)) continue;
        const k = j * this.nx + i;
        if (respectMask && this.mask[k]) continue;
        if (d === 0) this.h[k] = target;
        else this.h[k] = lerp(this.h[k], target, smoothstep(blend, 0, d));
      }
    }
  }

  averageRect(cx, cz, hx, hz, rot) {
    const c = Math.cos(rot), s = Math.sin(rot);
    let sum = 0, n = 0, mn = Infinity, mx = -Infinity;
    for (const fx of [-1, -0.5, 0, 0.5, 1]) for (const fz of [-1, -0.5, 0, 0.5, 1]) {
      const lx = fx * hx, lz = fz * hz;
      const h = this.height(cx + lx * c + lz * s, cz - lx * s + lz * c);
      sum += h; n++; mn = Math.min(mn, h); mx = Math.max(mx, h);
    }
    return { avg: sum / n, min: mn, max: mx };
  }
}

// ¿Está dentro de la zona jugable? (margen en metros hacia adentro). Tierra firme, islas,
// calzadas y muelles; no el mar, el río ni el lago.
export function playable(x, z, margin = 0) {
  if (!inWorld(x, z, 4 + margin)) return false;
  if (landDist(x, z) < 1.2 + margin) return false;
  if (lakeDist(x, z) > -(1.2 + margin)) {
    // los muelles sobre el lago sí se pueden pisar
    for (const p of PIERS) if (p.h > 5 && distToPolyline(p.pts, x, z) < p.width / 2 - margin) return true;
    return false;
  }
  return true;
}

// ---------- contornos (marching squares) ----------
// Devuelve polilíneas del borde entre f(x,z)=true y false en la malla de 4 m
function contour(fn, step = RES) {
  const nx = Math.round((WORLD.x1 - WORLD.x0) / step) + 3, nz = Math.round((WORLD.z1 - WORLD.z0) / step) + 3;
  const x0 = WORLD.x0 - step, z0 = WORLD.z0 - step;
  const v = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) v[j * nx + i] = fn(x0 + i * step, z0 + j * step) ? 1 : 0;
  const segs = [];
  const P = (i, j) => [x0 + i * step, z0 + j * step];
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = v[j * nx + i], b = v[j * nx + i + 1], c = v[(j + 1) * nx + i + 1], d = v[(j + 1) * nx + i];
    const code = a | (b << 1) | (c << 2) | (d << 3);
    if (code === 0 || code === 15) continue;
    const T = mid(P(i, j), P(i + 1, j)), Rr = mid(P(i + 1, j), P(i + 1, j + 1)), B = mid(P(i, j + 1), P(i + 1, j + 1)), L = mid(P(i, j), P(i, j + 1));
    const add = (p, q) => segs.push([p, q]);
    switch (code) {
      case 1: case 14: add(L, T); break;
      case 2: case 13: add(T, Rr); break;
      case 3: case 12: add(L, Rr); break;
      case 4: case 11: add(Rr, B); break;
      case 6: case 9: add(T, B); break;
      case 7: case 8: add(L, B); break;
      case 5: add(L, T); add(Rr, B); break;
      case 10: add(T, Rr); add(L, B); break;
      default: break;
    }
  }
  // encadenar segmentos en polilíneas
  const key = (p) => Math.round(p[0] * 4) + ',' + Math.round(p[1] * 4);
  const adj = new Map();
  segs.forEach((s, k) => { for (const e of [0, 1]) { const kk = key(s[e]); let a = adj.get(kk); if (!a) adj.set(kk, (a = [])); a.push(k); } });
  const used = new Uint8Array(segs.length);
  const lines = [];
  for (let s0 = 0; s0 < segs.length; s0++) {
    if (used[s0]) continue;
    used[s0] = 1;
    const line = [segs[s0][0], segs[s0][1]];
    for (const dir of [1, 0]) {
      for (;;) {
        const end = dir ? line[line.length - 1] : line[0];
        const cand = (adj.get(key(end)) || []).find((k) => !used[k]);
        if (cand === undefined) break;
        used[cand] = 1;
        const s = segs[cand];
        const nxt = key(s[0]) === key(end) ? s[1] : s[0];
        if (dir) line.push(nxt); else line.unshift(nxt);
      }
    }
    lines.push(simplify(line, 0.8));
  }
  return lines;
}
function simplify(pts, eps) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop();
    let md = 0, mi = -1;
    for (let i = a + 1; i < b; i++) { const d = distToPolyline([pts[a], pts[b]], pts[i][0], pts[i][1]); if (d > md) { md = d; mi = i; } }
    if (md > eps) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

let fenceCache = null, coastCache = null;
// Valla invisible: borde de la zona jugable (orilla del mar, lago, río y límites del mundo)
export function fenceLines() { return fenceCache || (fenceCache = contour((x, z) => playable(x, z, 0))); }
// Línea de costa real (para la espuma de las olas)
export function coastLines() { return coastCache || (coastCache = contour((x, z) => baseHeight(x, z) > 0.05, 8)); }
export const LAKE_LEVEL = LAKE.level;
