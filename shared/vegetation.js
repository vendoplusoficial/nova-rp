// Vegetación natural de las regiones nuevas (fuera de Puerto Nova):
//   Montañosa: bosques de pino en manchas, encinos en lo bajo, pinos ralos en las cumbres
//   Costera:   campo abierto con encinos sueltos, arboledas y palmeras cerca del mar
//   Desértica: cactus, agaves y matorral seco; palmeras alrededor del oasis
// Deja libres las carreteras del plano, las ciudades y pueblos (se urbanizan en otra etapa),
// el agua y las pendientes fuertes. Determinista: mismo resultado en cliente y servidor.

import { hashInts } from './rng.js';
import { playable, inFine, fbm, landDist, regionAt, planWaterAt, lakeShape, distToPolyline, polyDist, WORLD } from './terrain.js';
import { CITIES, TOWNS, ROADS_PLAN, LAKES_PLAN } from './worldplan.js';

const STEP = 12;                 // rejilla de muestreo (m)
const ROAD_CLEAR = 16;           // distancia libre a cada lado de los caminos del plano aún sin construir
const TOWN_CLEAR = { pueblo: 170, rancho: 90 };

// índice espacial de los tramos de carretera del plano (celdas de 128 m)
function roadIndex() {
  const C = 128, cells = new Map();
  const lines = ROADS_PLAN;
  for (const r of lines) {
    const pts = r.closed ? [...r.pts, r.pts[0]] : r.pts;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], seg = [a, b];
      const x0 = Math.floor((Math.min(a[0], b[0]) - ROAD_CLEAR) / C), x1 = Math.floor((Math.max(a[0], b[0]) + ROAD_CLEAR) / C);
      const z0 = Math.floor((Math.min(a[1], b[1]) - ROAD_CLEAR) / C), z1 = Math.floor((Math.max(a[1], b[1]) + ROAD_CLEAR) / C);
      for (let i2 = x0; i2 <= x1; i2++) for (let j = z0; j <= z1; j++) {
        const k = i2 + ',' + j;
        if (!cells.has(k)) cells.set(k, []);
        cells.get(k).push(seg);
      }
    }
  }
  return (x, z) => {
    const list = cells.get(Math.floor(x / C) + ',' + Math.floor(z / C));
    if (!list) return Infinity;
    let d = Infinity;
    for (const s of list) d = Math.min(d, distToPolyline(s, x, z));
    return d;
  };
}

// zonas que se urbanizarán (ciudades nuevas con su puerto, pueblos y lugares)
function urbanTest() {
  const polys = [];
  for (const c of CITIES) for (const k of ['urban', 'port']) if (c[k]) polys.push(c[k]);
  const towns = TOWNS.map((t) => ({ x: t.at[0], z: t.at[1], r: TOWN_CLEAR[t.size] ?? 70 }));
  return (x, z) => polys.some((p) => polyDist(p, x, z) > -25) || towns.some((t) => Math.hypot(x - t.x, z - t.z) < t.r);
}

// onRoad(x,z): distancia a la orilla de las vías ya construidas (highways.js)
export function regionVegetation(city, seed, onRoad = () => Infinity) {
  const roadDist = roadIndex(), urban = urbanTest();
  const oasis = LAKES_PLAN.filter((l) => l.region === 'desierto');
  const H = city.height;
  let n = 0;
  for (let gz = WORLD.z0; gz < WORLD.z1; gz += STEP) {
    for (let gx = WORLD.x0; gx < WORLD.x1; gx += STEP) {
      const h = hashInts(seed, gx, gz, 7717);
      const x = gx + ((h % 1000) / 1000 - 0.5) * STEP * 0.9;
      const z = gz + (((h >>> 10) % 1000) / 1000 - 0.5) * STEP * 0.9;
      if (inFine(x, z)) continue;                                   // Puerto Nova tiene su propia vegetación
      const reg = regionAt(x, z);
      if (!reg || !playable(x, z, 3) || planWaterAt(x, z, 6)) continue;
      const y = H(x, z);
      if (y < 1.4 || landDist(x, z) < 8) continue;
      if (onRoad(x, z) < 5 || roadDist(x, z) < ROAD_CLEAR || urban(x, z)) continue;
      // pendiente (en 4 m): en los riscos no crecen árboles
      const slope = Math.max(Math.abs(H(x + 4, z) - H(x - 4, z)), Math.abs(H(x, z + 4) - H(x, z - 4))) / 8;
      if (slope > 0.85) continue;
      const roll = ((h >>> 20) % 1000) / 1000, pick = (h >>> 4);
      const patch = fbm(x * 0.0045, z * 0.0045, 77, 3);             // manchas de bosque (-0.5..0.5, mediana ~0)
      let density = 0, kinds = null, big = 1;
      if (reg === 'montana') {
        if (y > 175) { density = 0.08; kinds = ['pine']; }                                   // cumbres: pinos ralos
        else if (patch > 0) { density = 0.55; kinds = y < 70 ? ['pine', 'pine', 'oak', 'pine'] : ['pine']; big = 1.3; }   // bosque
        else { density = 0.1; kinds = y < 70 ? ['oak', 'pine', 'bush', 'round'] : ['pine', 'bush']; }   // claros y praderas
        if (slope > 0.6) density *= 0.4;
      } else if (reg === 'costera') {
        const coast = landDist(x, z);
        if (coast < 60) { density = 0.1; kinds = ['palm', 'palm', 'bush']; }
        else if (patch > 0.2) { density = 0.38; kinds = ['oak', 'round', 'oak', 'bush']; big = 1.2; }  // arboledas
        else { density = 0.035; kinds = ['oak', 'round', 'bush', 'bush']; }                   // campo abierto
      } else {
        const nearOasis = oasis.some((l) => lakeShape(l, x, z) < 2.2);
        if (nearOasis) { density = 0.45; kinds = ['palm', 'palm', 'shrubDry']; }
        else { density = 0.05 + (patch > 0.15 ? 0.04 : 0); kinds = ['cactus', 'shrubDry', 'shrubDry', 'agave', 'cactus']; }
      }
      if (roll > density) continue;
      const type = kinds[pick % kinds.length];
      const sc = (0.85 + ((h >>> 7) % 50) / 100) * (type === 'bush' || type === 'shrubDry' || type === 'agave' ? 1 : big);
      city.props.push({ type, x, z, y, r: (h % 628) / 100, sc, col: type === 'bush' || type === 'shrubDry' || type === 'agave' ? 0 : 1 });
      n++;
    }
  }
  return n;
}
