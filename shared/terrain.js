// Terreno del mundo de Nova RP (shared/mapdata.js = Puerto Nova; shared/worldplan.js = las tres regiones):
// tierra firme e islas, playas de arena y costa rocosa, montañas, mesetas, presa con lago, río,
// calzadas sobre el agua y muelles.
// Dos resoluciones: una malla fina de 4 m sobre Puerto Nova (la de siempre) y una malla de 8 m para
// el resto del mundo. En el borde ambas tienen exactamente las mismas alturas (sin grietas).
// Determinista: cliente y servidor calculan exactamente el mismo terreno.
//
// Ejes: +X = este, +Z = sur. Nivel del mar = 0.

import { MAINLAND, ISLANDS, LAKE, RIVER, CAUSEWAYS, PIERS, SANDY, RIDGES, HILLS, PLATEAUS } from './mapdata.js';
import { REGIONS, WORLD_PLAN_BOUNDS, RANGES_PLAN, LAKES_PLAN, RIVERS_PLAN, BEACHES_PLAN } from './worldplan.js';

export const SEA_LEVEL = 0;
export const TERRAIN_RES = 4;                 // metros por celda de la malla fina (Puerto Nova)
export const TERRAIN_MIN = -960, TERRAIN_MAX_X = 960, TERRAIN_MAX_Z = 896;
// malla gruesa del mundo completo (8 m), alineada con la fina y con los mosaicos de 64 m
export const COARSE_RES = 8;
export const WORLD_MIN_X = -3136, WORLD_MIN_Z = -3712, WORLD_MAX_X = 2752, WORLD_MAX_Z = 1536;
// zona jugable del mundo (la valla invisible va en la orilla; esto solo limita el mar abierto)
export const WORLD = { x0: WORLD_PLAN_BOUNDS.x0 + 30, x1: WORLD_PLAN_BOUNDS.x1 - 30, z0: WORLD_PLAN_BOUNDS.z0 + 30, z1: WORLD_PLAN_BOUNDS.z1 - 30 };
// ¿(x,z) está dentro de la malla fina de Puerto Nova?
export const inFine = (x, z) => x >= TERRAIN_MIN && x <= TERRAIN_MAX_X && z >= TERRAIN_MIN && z <= TERRAIN_MAX_Z;

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

// ---------- campos precalculados (tierra, lago, arena y distancias a la orilla) ----------
// Una "malla de campos" por resolución: la fina (Puerto Nova, 4 m) y la gruesa (mundo, 8 m).
function makeGrid(x0, z0, x1, z1, res) {
  return { x0, z0, res, nx: Math.round((x1 - x0) / res) + 1, nz: Math.round((z1 - z0) / res) + 1 };
}
const FINE = makeGrid(TERRAIN_MIN, TERRAIN_MIN, TERRAIN_MAX_X, TERRAIN_MAX_Z, TERRAIN_RES);
const COARSE = makeGrid(WORLD_MIN_X, WORLD_MIN_Z, WORLD_MAX_X, WORLD_MAX_Z, COARSE_RES);

// Rellena (por filas) los vértices dentro de un polígono
function scanFill(G, mask, pts, val) {
  let zmin = Infinity, zmax = -Infinity;
  for (const p of pts) { zmin = Math.min(zmin, p[1]); zmax = Math.max(zmax, p[1]); }
  const j0 = Math.max(0, Math.ceil((zmin - G.z0) / G.res)), j1 = Math.min(G.nz - 1, Math.floor((zmax - G.z0) / G.res));
  for (let j = j0; j <= j1; j++) {
    const z = G.z0 + j * G.res;
    const xs = [];
    for (let i = 0, k = pts.length - 1; i < pts.length; k = i++) {
      const a = pts[k], b = pts[i];
      if ((a[1] > z) !== (b[1] > z)) xs.push(a[0] + ((z - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
    }
    xs.sort((p, q) => p - q);
    for (let q = 0; q + 1 < xs.length; q += 2) {
      const i0 = Math.max(0, Math.ceil((xs[q] - G.x0) / G.res)), i1 = Math.min(G.nx - 1, Math.floor((xs[q + 1] - G.x0) / G.res));
      for (let i = i0; i <= i1; i++) mask[j * G.nx + i] = val;
    }
  }
}
function stampLine(G, mask, pts, halfW, val) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
  const i0 = Math.max(0, Math.floor((x0 - halfW - G.x0) / G.res)), i1 = Math.min(G.nx - 1, Math.ceil((x1 + halfW - G.x0) / G.res));
  const j0 = Math.max(0, Math.floor((z0 - halfW - G.z0) / G.res)), j1 = Math.min(G.nz - 1, Math.ceil((z1 + halfW - G.z0) / G.res));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    if (distToPolyline(pts, G.x0 + i * G.res, G.z0 + j * G.res) <= halfW) mask[j * G.nx + i] = val;
  }
}
// Distancia (aprox. euclidiana, chaflán 3-4) de cada vértice al borde de la máscara; + dentro, - fuera
function signedDistance(G, mask) {
  const NX = G.nx, NZ = G.nz, RES = G.res;
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

// Tierra: Puerto Nova + islas + las tres regiones del plano; calzadas y muelles; el río corta
function buildFields(G) {
  const n = G.nx * G.nz;
  const land = new Uint8Array(n), lake = new Uint8Array(n), sandy = new Uint8Array(n), region = new Uint8Array(n);
  scanFill(G, land, MAINLAND, 1);
  for (const r of REGIONS) scanFill(G, land, r.coast, 1);
  REGIONS.forEach((r, i) => scanFill(G, region, r.coast, i + 1));
  scanFill(G, region, MAINLAND, 1);
  for (const is of ISLANDS) scanFill(G, land, is.pts, 1);
  for (const c of CAUSEWAYS) stampLine(G, land, c.pts, c.width / 2, 1);
  for (const p of PIERS) if (p.h < 5) stampLine(G, land, p.pts, p.width / 2, 1);
  stampLine(G, land, RIVER.pts, RIVER.width / 2, 0);
  scanFill(G, lake, LAKE.pts, 1);
  for (const s of SANDY) scanFill(G, sandy, s, 1);
  for (const b of BEACHES_PLAN) scanFill(G, sandy, b.pts, 1);
  const desert = REGIONS.find((r) => r.id === 'desierto');
  if (desert) scanFill(G, sandy, desert.coast, 1);              // el desierto es todo arena
  return { G, land, lake, sandy, region, dist: signedDistance(G, land), lakeD: signedDistance(G, lake) };
}
let FF = null, FC = null;
const fineFields = () => FF || (FF = buildFields(FINE));
const coarseFields = () => FC || (FC = buildFields(COARSE));
const fieldsAt = (x, z) => (inFine(x, z) ? fineFields() : coarseFields());

function sample(F, arr, x, z) {
  const G = F.G;
  const fx = clamp((x - G.x0) / G.res, 0, G.nx - 1.001), fz = clamp((z - G.z0) / G.res, 0, G.nz - 1.001);
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
  const k = j * G.nx + i;
  return (arr[k] * (1 - u) + arr[k + 1] * u) * (1 - v) + (arr[k + G.nx] * (1 - u) + arr[k + G.nx + 1] * u) * v;
}
function nearest(F, arr, x, z) {
  const G = F.G;
  const i = clamp(Math.round((x - G.x0) / G.res), 0, G.nx - 1), j = clamp(Math.round((z - G.z0) / G.res), 0, G.nz - 1);
  return arr[j * G.nx + i];
}

// Distancia a la orilla del mar (+ tierra, - agua)
export function landDist(x, z) { const F = fieldsAt(x, z); return sample(F, F.dist, x, z); }
// Distancia a la orilla del lago (+ dentro del agua)
export function lakeDist(x, z) { const F = fieldsAt(x, z); return sample(F, F.lakeD, x, z); }
// Región del plano en un punto: 'costera' | 'montana' | 'desierto' | null (mar)
const REGION_IDS = [null, ...REGIONS.map((r) => r.id)];
export function regionAt(x, z) { const F = fieldsAt(x, z); return REGION_IDS[nearest(F, F.region, x, z)] ?? null; }
export function isSandy(x, z) { const F = fieldsAt(x, z); return nearest(F, F.sandy, x, z) === 1; }
export function inWorld(x, z, margin = 0) { return x > WORLD.x0 + margin && x < WORLD.x1 - margin && z > WORLD.z0 + margin && z < WORLD.z1 - margin; }

// Cajas envolventes para descartar rápido las formas lejanas
const bbox = (pts, m) => { let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity; for (const p of pts) { a = Math.min(a, p[0]); b = Math.max(b, p[0]); c = Math.min(c, p[1]); d = Math.max(d, p[1]); } return [a - m, b + m, c - m, d + m]; };
const inBox = (bb, x, z) => x >= bb[0] && x <= bb[1] && z >= bb[2] && z <= bb[3];
for (const pl of PLATEAUS) pl.bb = bbox(pl.pts, pl.edge);
for (const r of RIDGES) r.bb = bbox(r.pts, r.w);
for (const c of CAUSEWAYS) c.bb = bbox(c.pts, c.width / 2 + 8);
for (const p of PIERS) p.bb = bbox(p.pts, p.width / 2 + 4);
const RIVER_BB = bbox(RIVER.pts, RIVER.width / 2 + 17);

// ---------- relieve de las regiones nuevas (etapa 2b) ----------
// Ruido "de crestas": líneas de cumbre y valles en lugar de bultos redondos (cordilleras naturales)
function ridged(x, z, seed, oct = 4) {
  let s = 0, amp = 0.55, f = 1, w = 1;
  for (let i = 0; i < oct; i++) {
    let n = 1 - Math.abs(valueNoise(x * f, z * f, seed + i * 31));
    n *= n * w;
    w = clamp(n * 1.6, 0, 1);              // las crestas altas tienen más detalle que los valles
    s += n * amp; amp *= 0.5; f *= 2.1;
  }
  return s;                                 // ~0..1
}
for (const r of RANGES_PLAN) r.bb = bbox(r.pts, r.w);
// Se desvanece cerca de Puerto Nova: la ciudad y su malla fina no cambian
const fineFade = (x, z) => {
  const ox = Math.max(TERRAIN_MIN - x, 0, x - TERRAIN_MAX_X), oz = Math.max(TERRAIN_MIN - z, 0, z - TERRAIN_MAX_Z);
  return smoothstep(0, 180, Math.hypot(ox, oz));
};
const REG = { 1: 'costera', 2: 'montana', 3: 'desierto' };
function regionRelief(x, z, d, rid) {
  const reg = REG[rid];
  if (!reg) return 0;
  const fade = fineFade(x, z);
  if (fade <= 0) return 0;
  let h = 0;
  if (reg === 'montana') {
    // región de colinas: la ciudad queda sobre lomas de 10-30 m; tierra adentro sube
    h += smoothstep(0, 260, d) * (14 + 16 * fbm(x * 0.0016, z * 0.0016, 21, 3)) + 6 * fbm(x * 0.006, z * 0.006, 23, 2) * smoothstep(0, 120, d);
  } else if (reg === 'desierto') {
    h += smoothstep(0, 220, d) * (5 + 4 * fbm(x * 0.0018, z * 0.0018, 31, 3));
    // campos de dunas (crestas asimétricas, onduladas por el viento) donde el ruido lo indica
    const field = smoothstep(0.05, 0.3, fbm(x * 0.0012, z * 0.0012, 37, 2));
    if (field > 0) {
      const warp = 26 * fbm(x * 0.004, z * 0.004, 41, 2);
      const ph = ((x * 0.72 + z * 0.31 + warp * 4) / 58) % 1;
      const crest = Math.pow(1 - Math.abs(2 * (ph < 0 ? ph + 1 : ph) - 1), 1.6);
      h += field * smoothstep(40, 160, d) * (3.2 + 2.2 * fbm(x * 0.01, z * 0.01, 43, 2)) * crest;
    }
  } else {
    // campo de la región costera: lomas suaves
    h += smoothstep(0, 180, d) * (3 + 6 * (0.5 + 0.5 * fbm(x * 0.0022, z * 0.0022, 51, 3)));
  }
  for (const r of RANGES_PLAN) {
    if (REGION_ID[r.region] !== rid || !inBox(r.bb, x, z)) continue;
    const dd = distToPolyline(r.pts, x, z);
    if (dd >= r.w) continue;
    const t0 = 1 - dd / r.w, t = t0 * t0 * (3 - 2 * t0);
    if (r.kind === 'cordillera' || r.kind === 'cerros') {
      // cumbres irregulares y laderas con valles (no pirámides)
      const rn = ridged(x * 0.0035, z * 0.0035, 61, 4);
      h += r.h * t * (0.35 + 0.85 * rn) + r.h * 0.12 * t * fbm(x * 0.02, z * 0.02, 67, 2);
    } else if (r.kind === 'arida' || r.kind === 'canones') {
      // montaña árida en terrazas (estratos) y mesetas
      const rn = ridged(x * 0.0055, z * 0.0055, 71, 4);
      let v = r.h * t * (0.3 + 0.95 * rn);
      // cimas aplanadas en mesetas (nada de pirámides): por encima del tope sube muy poco
      const top = r.h * (0.5 + 0.2 * fbm(x * 0.002, z * 0.002, 75, 2));
      if (v > top) v = top + (v - top) * 0.12;
      const step = 14, q = Math.floor(v / step), fr = v / step - q;
      v = (q + smoothstep(0.42, 0.58, fr)) * step;                // escalones de roca bien marcados
      if (r.kind === 'canones') {
        // cañón serpenteante que corta la meseta
        const off = distToPolyline(r.pts, x + 60 * fbm(x * 0.003, z * 0.003, 73, 2), z + 60 * fbm(x * 0.003 + 9, z * 0.003, 79, 2));
        v *= 0.35 + 0.65 * smoothstep(10, 34, off);
      }
      h += v;
    } else {
      h += r.h * t * (0.7 + 0.3 * fbm(x * 0.005, z * 0.005, 83, 2));    // colinas
    }
  }
  return h * fade * smoothstep(0, 25, d);
}
const REGION_ID = { costera: 1, montana: 2, desierto: 3 };

function baseCore(x, z) {
  const f = fieldsAt(x, z);
  const d = sample(f, f.dist, x, z);
  let h;
  if (d < 0) h = -1.2 - Math.min(9, -d * 0.12);
  else if (nearest(f, f.sandy, x, z)) h = 0.25 + 1.5 * smoothstep(0, 45, d) + 1.6 * smoothstep(40, 80, d);   // playa ancha
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
    h += regionRelief(x, z, d, nearest(f, f.region, x, z));
  }
  // lago de la presa
  const ld = sample(f, f.lakeD, x, z);
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

// ---------- agua de las regiones nuevas (etapa 2c): lagos con orilla irregular y río ----------
// Forma del lago: elipse deformada con ruido (orillas irregulares). < 1 = agua
export function lakeShape(L, x, z) {
  const dx = (x - L.center[0]) / L.rx, dz = (z - L.center[1]) / L.rz;
  const r = Math.hypot(dx, dz);
  if (r > 2.2) return r;
  const a = Math.atan2(dz, dx), c = Math.cos(a), s = Math.sin(a);
  const k = 1 + 0.16 * valueNoise(c * 1.8 + 7, s * 1.8, 97) + 0.07 * valueNoise(c * 4.5, s * 4.5 + 3, 101);
  return r / k;
}
// Nivel del agua: un poco abajo del punto más bajo de la orilla (el lago ocupa la depresión)
export function lakeLevel(L) {
  if (L.level !== undefined) return L.level;
  let mn = Infinity;
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    for (const f of [1.05, 1.2]) {
      // punto sobre la orilla real (busca el radio donde lakeShape = f)
      let lo = 0.2, hi = 2.2;
      for (let k = 0; k < 18; k++) { const m = (lo + hi) / 2; const x = L.center[0] + Math.cos(a) * L.rx * m, z = L.center[1] + Math.sin(a) * L.rz * m; if (lakeShape(L, x, z) < f) lo = m; else hi = m; }
      mn = Math.min(mn, baseCore(L.center[0] + Math.cos(a) * L.rx * lo, L.center[1] + Math.sin(a) * L.rz * lo));
    }
  }
  return (L.level = Math.max(1.6, mn - 0.8));
}
// Perfil del río: el lecho baja siempre hacia la desembocadura (nunca sube)
function riverProfile(R) {
  if (R.prof) return R.prof;
  const pts = [], cum = [0];
  for (let i = 0; i < R.pts.length - 1; i++) {
    const a = R.pts[i], b = R.pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / 8));
    for (let k = 0; k < n; k++) pts.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  pts.push(R.pts[R.pts.length - 1]);
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const bed = pts.map(([x, z]) => baseCore(x, z) - 3.2);
  for (let i = 1; i < bed.length; i++) bed[i] = Math.min(bed[i], bed[i - 1] - 0.05);
  for (let i = 0; i < bed.length; i++) bed[i] = Math.min(bed[i], lerp(bed[0], -2.4, cum[i] / cum[cum.length - 1]) + 6);   // pendiente regular
  bed[bed.length - 1] = Math.min(bed[bed.length - 1], -2.4);
  return (R.prof = { pts, cum, bed });
}
// Lecho y superficie del agua del río en el punto más cercano (null si está lejos)
export function riverAt(R, x, z) {
  if (!inBox(R.bb, x, z)) return null;
  const P = riverProfile(R);
  let best = Infinity, bi = 0, bt = 0;
  for (let i = 0; i < P.pts.length - 1; i++) {
    const a = P.pts[i], b = P.pts[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1;
    const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / L2, 0, 1);
    const d = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
    if (d < best) { best = d; bi = i; bt = t; }
  }
  const bed = P.bed[bi] + (P.bed[bi + 1] - P.bed[bi]) * bt;
  return { d: best, bed, water: Math.max(0, bed + 1.6) };
}
for (const L of LAKES_PLAN) L.bb = [L.center[0] - L.rx * 2.2, L.center[0] + L.rx * 2.2, L.center[1] - L.rz * 2.2, L.center[1] + L.rz * 2.2];
for (const R of RIVERS_PLAN) R.bb = bbox(R.pts, R.width / 2 + 45);
// ¿Hay agua de lago o río del plano en (x,z)? (margin > 0 = más tierra adentro)
export function planWaterAt(x, z, margin = 0) {
  for (const L of LAKES_PLAN) if (inBox(L.bb, x, z) && lakeShape(L, x, z) < 1 + margin / Math.min(L.rx, L.rz)) return true;
  for (const R of RIVERS_PLAN) { const r = riverAt(R, x, z); if (r && r.d < R.width / 2 + margin) return true; }
  return false;
}

export function baseHeight(x, z) {
  let h = baseCore(x, z);
  for (const L of LAKES_PLAN) {
    if (!inBox(L.bb, x, z)) continue;
    const r = lakeShape(L, x, z);
    if (r > 1.8) continue;
    const lv = lakeLevel(L);
    if (r < 1) h = lv - 0.5 - 5 * (1 - r * r);                                 // vaso del lago
    else h = lerp(lv + 0.35, h, smoothstep(1, 1.8, r));                         // orilla que baja al agua
  }
  for (const R of RIVERS_PLAN) {
    const rv = riverAt(R, x, z);
    if (!rv) continue;
    const w = R.width / 2, bank = clamp((h - rv.bed) * 1.6, 10, 40);
    if (rv.d < w) h = rv.bed;
    else if (rv.d < w + bank) h = lerp(rv.bed + 1.9, h, smoothstep(w, w + bank, rv.d));
  }
  return h;
}

// ---------- mapa de alturas con aplanado ----------
export class Heightmap {
  // G = malla (por defecto la fina de Puerto Nova); passes = suavizado tierra adentro
  constructor(G = FINE, passes = 3) {
    this.res = G.res;
    this.x0 = G.x0; this.z0 = G.z0;
    this.nx = G.nx; this.nz = G.nz;
    this.h = new Float32Array(this.nx * this.nz);
    this.mask = new Uint8Array(this.nx * this.nz); // 1 = celda de calle (no la tocan los lotes)
    for (let j = 0; j < this.nz; j++) {
      const z = this.z0 + j * this.res;
      for (let i = 0; i < this.nx; i++) this.h[j * this.nx + i] = baseHeight(this.x0 + i * this.res, z);
    }
    this.smoothInland(passes);
  }

  // Malla nueva sobre un rectángulo (alineado a la malla gruesa) tomando alturas de fn(x,z)
  static sampled(box, res, fn) {
    const hm = Object.create(Heightmap.prototype);
    hm.res = res; hm.x0 = box.x0; hm.z0 = box.z0;
    hm.nx = Math.round((box.x1 - box.x0) / res) + 1; hm.nz = Math.round((box.z1 - box.z0) / res) + 1;
    hm.h = new Float32Array(hm.nx * hm.nz);
    hm.mask = new Uint8Array(hm.nx * hm.nz);
    for (let j = 0; j < hm.nz; j++) for (let i = 0; i < hm.nx; i++) hm.h[j * hm.nx + i] = fn(hm.x0 + i * res, hm.z0 + j * res);
    return hm;
  }

  // Suaviza el relieve tierra adentro (quita picos y escalones de 4 m). No toca la costa, el lago,
  // el río, las calzadas ni los muelles: ahí la altura tiene que ser exacta.
  smoothInland(passes) {
    const { nx, nz } = this;
    const fixed = new Uint8Array(nx * nz);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = this.x0 + i * this.res, z = this.z0 + j * this.res;
      const k = j * nx + i;
      if (this.h[k] < 2.5 || lakeDist(x, z) > -30 || landDist(x, z) < 12 || planWaterAt(x, z, 25)) { fixed[k] = 1; continue; }
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

// Terreno del mundo completo: malla fina (Puerto Nova, 4 m) + malla gruesa (resto del mundo, 8 m).
export class WorldTerrain {
  constructor(fine) {
    this.fine = fine;
    this.coarse = new Heightmap(COARSE, 2);
    this.extra = [];   // mallas finas (4 m) de las ciudades nuevas
  }
  // malla fina de una ciudad nueva que contiene (x,z), o null
  extraAt(x, z) {
    for (const F of this.extra) if (x >= F.x0 && z >= F.z0 && x <= F.x0 + (F.nx - 1) * F.res && z <= F.z0 + (F.nz - 1) * F.res) return F;
    return null;
  }
  height(x, z) {
    if (inFine(x, z)) return this.fine.height(x, z);
    const F = this.extra.length ? this.extraAt(x, z) : null;
    return F ? F.height(x, z) : this.coarse.height(x, z);
  }
  // malla que dibuja/colisiona un rectángulo (una fina solo si lo contiene completo)
  gridFor(x0, z0, x1, z1) {
    if (inFine(x0, z0) && inFine(x1, z1)) return this.fine;
    const F = this.extraAt(x0, z0);
    return F && F === this.extraAt(x1, z1) ? F : this.coarse;
  }
  // agrega la malla fina de una ciudad nueva (cuadrada con la gruesa) y la cose
  addFine(F) { this.extra.push(F); this.seamGrid(F); }
  seam() { this.seamGrid(this.fine); }
  // Une las mallas sin grietas: la gruesa copia a la fina dentro de su área y, en el borde de la
  // fina, los vértices intermedios quedan en línea recta entre los de la gruesa.
  seamGrid(F) {
    const C = this.coarse, k = Math.round(C.res / F.res);
    const ci0 = Math.round((F.x0 - C.x0) / C.res), cj0 = Math.round((F.z0 - C.z0) / C.res);
    const cw = Math.floor((F.nx - 1) / k), ch = Math.floor((F.nz - 1) / k);
    for (let j = 0; j <= ch; j++) for (let i = 0; i <= cw; i++) C.h[(cj0 + j) * C.nx + ci0 + i] = F.h[j * k * F.nx + i * k];
    const fix = (idx, a, b) => { F.h[idx] = (F.h[a] + F.h[b]) / 2; };
    for (let i = 1; i < F.nx - 1; i += k) { fix(i, i - 1, i + 1); const r = (F.nz - 1) * F.nx; fix(r + i, r + i - 1, r + i + 1); }
    for (let j = 1; j < F.nz - 1; j += k) { const a = j * F.nx; fix(a, a - F.nx, a + F.nx); const b = a + F.nx - 1; fix(b, b - F.nx, b + F.nx); }
  }
}

// ¿Está dentro de la zona jugable? (margen en metros hacia adentro). Tierra firme, islas,
// calzadas y muelles; no el mar, el río ni el lago.
// Puentes: la red vial registra aquí cómo saber si (x,z) está sobre un tablero (se puede pisar sobre el agua)
let deckTest = null;
export function registerDecks(fn) { deckTest = fn; }
export function playable(x, z, margin = 0) {
  if (deckTest && deckTest(x, z, margin)) return inWorld(x, z, 4 + margin);
  return playableGround(x, z, margin);
}
// Solo tierra firme (sin puentes)
export function playableGround(x, z, margin = 0) {
  if (!inWorld(x, z, 4 + margin)) return false;
  if (landDist(x, z) < 1.2 + margin) return false;
  if (!inFine(x, z) && planWaterAt(x, z, 1.2 + margin)) return false;
  if (lakeDist(x, z) > -(1.2 + margin)) {
    // los muelles sobre el lago sí se pueden pisar
    for (const p of PIERS) if (p.h > 5 && distToPolyline(p.pts, x, z) < p.width / 2 - margin) return true;
    return false;
  }
  return true;
}

// ---------- contornos (marching squares) ----------
// Devuelve polilíneas del borde entre f(x,z)=true y false en la malla de 4 m
// box = área a recorrer; skip = celdas que se omiten (ya las recorrió una pasada más fina)
function contour(fn, step = TERRAIN_RES, box = WORLD, skip = null) {
  const nx = Math.round((box.x1 - box.x0) / step) + 3, nz = Math.round((box.z1 - box.z0) / step) + 3;
  const x0 = box.x0 - step, z0 = box.z0 - step;
  const v = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) v[j * nx + i] = fn(x0 + i * step, z0 + j * step) ? 1 : 0;
  const segs = [];
  const P = (i, j) => [x0 + i * step, z0 + j * step];
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = v[j * nx + i], b = v[j * nx + i + 1], c = v[(j + 1) * nx + i + 1], d = v[(j + 1) * nx + i];
    const code = a | (b << 1) | (c << 2) | (d << 3);
    if (code === 0 || code === 15) continue;
    if (skip && skip(x0 + (i + 0.5) * step, z0 + (j + 0.5) * step)) continue;
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
// (malla fina de 4 m sobre Puerto Nova y de 8 m en el resto del mundo)
const FINE_BOX = { x0: TERRAIN_MIN + 8, x1: TERRAIN_MAX_X - 8, z0: TERRAIN_MIN + 8, z1: TERRAIN_MAX_Z - 8 };
const inFineBox = (x, z) => x > FINE_BOX.x0 && x < FINE_BOX.x1 && z > FINE_BOX.z0 && z < FINE_BOX.z1;
export function fenceLines() {
  if (fenceCache) return fenceCache;
  const fn = (x, z) => playableGround(x, z, 0);
  return (fenceCache = [...contour(fn, TERRAIN_RES, FINE_BOX), ...contour(fn, COARSE_RES, WORLD, inFineBox)]);
}
// Línea de costa real (para la espuma de las olas)
export function coastLines() { return coastCache || (coastCache = contour((x, z) => baseHeight(x, z) > 0.05, 8)); }
export const LAKE_LEVEL = LAKE.level;
