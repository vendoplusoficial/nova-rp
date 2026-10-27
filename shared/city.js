// Generador determinista de la ciudad "Puerto Nova".
// Lo usan el CLIENTE (para dibujarla) y el SERVIDOR (para validar posiciones, disparos y trabajos).
// Misma semilla => misma ciudad en todos lados.
//
// ORDEN DE CONSTRUCCIÓN (siempre el mismo, como en un estudio de videojuegos):
//   1. Terreno: costa, islas, montañas, presa, río                   -> terrain.js + mapdata.js
//   2. Calles y avenidas: red conectada, sin calles sueltas           -> roads.js
//   3. Manzanas: caras cerradas de la red vial                        -> blocks.js
//   4. Terrenos: lugares importantes y lotes en cada frente de manzana
//   5. Casas, edificios y negocios según las reglas de cada barrio    -> buildings.js / landmarks.js
//   6. Detalles: semáforos, ALTO, faroles, árboles, playa, vegetación
//   7. Colisiones y valla invisible del borde del mapa

import { Rng, hashInts } from './rng.js';
import { CITY_SEED } from './constants.js';
import { Heightmap, playable, SEA_LEVEL, fenceLines, coastLines, landDist, isSandy, lakeDist, pointInPoly, inWorld } from './terrain.js';
import { DISTRICTS, districtAt } from './districts.js';
import { RoadNet, buildMainRoads, buildLocalRoads, rectContains, segDist, segPointDist } from './roads.js';
import { buildBlocks, frontages, runAt, rayToPoly, rectInPoly, insetPoly, removeLoops, signedArea } from './blocks.js';
import { SITE_DEFS, SAFE_ZONES, STREET_RULES, ROUNDABOUTS, LAKE, DAM, PIERS, P as MP } from './mapdata.js';
import { SITE_BUILDERS as BASE_BUILDERS } from './landmarks.js';
import { EXTRA_BUILDERS } from './landmarksExtra.js';
import * as B from './buildings.js';

export { DISTRICTS, districtAt };
const SITE_BUILDERS = { ...BASE_BUILDERS, ...EXTRA_BUILDERS };
export const CITY_NAME = 'Puerto Nova';

let cache = null;
export function getCity(seed = CITY_SEED) {
  if (cache && cache.seed === seed) return cache;
  cache = generateCity(seed);
  return cache;
}

// Colisiones de objetos sueltos: semiancho, semifondo, alto
export const PROP_COL = {
  round: [0.3, 0.3, 5], oak: [0.35, 0.35, 5], laurel: [0.3, 0.3, 5], pine: [0.3, 0.3, 6], jacaranda: [0.3, 0.3, 5], palm: [0.25, 0.25, 7], willow: [0.35, 0.35, 5],
  car: [0.95, 2.1, 1.5], policecar: [0.95, 2.2, 1.6], ambulance: [1.1, 2.8, 2.6], van: [1.0, 2.6, 2.3], truck: [1.3, 3.6, 3.2], truckArmy: [1.3, 3.6, 3.2], bus: [1.3, 5.6, 3.2], firetruck: [1.3, 4.0, 3.0],
  tank: [1.6, 2.4, 2.4], fountain: [3.3, 3.3, 0.9], fountainSmall: [1.6, 1.6, 0.8], rock: [1.1, 1.1, 1.4], floodlight: [0.3, 0.3, 12],
  trafficLight: [0.2, 0.2, 6.2], stopSign: [0.08, 0.08, 2.4], hydrant: [0.2, 0.2, 0.8],
  busstop: [1.7, 0.6, 2.6], swing: [1.6, 0.8, 2.4], slide: [1.6, 0.7, 2.2], dummy: [0.3, 0.3, 1.8], lifeguard: [1.1, 1.1, 3.6],
  crane: [5, 5, 30], containers: [1.3, 3.1, 2.7], bush: [0, 0, 0], plane: [8, 7, 4], plane2: [5, 4.5, 3], hayBale: [0.6, 0.6, 1.2], tractor: [1.0, 1.8, 2.4],
};

// Medidas de lote por arquitectura: ancho, fondo, separación entre lotes
const ARCH = {
  casaHumilde: { w: [7.5, 10.5], d: [11, 14], gap: 0 },
  casaMedia: { w: [13, 16], d: [19, 23], gap: 0.3 },
  casaRural: { w: [14, 18], d: [16, 22], gap: 14 },
  villa: { w: [28, 36], d: [28, 34], gap: 2 },
  hacienda: { w: [28, 34], d: [28, 34], gap: 2 },
  apartamentos: { w: [16, 22], d: [18, 22], gap: 1 },
  restaurante: { w: [14, 20], d: [17, 22], gap: 0.8 },
  tienda: { w: [10, 16], d: [14, 18], gap: 0.4 },
  oficina: { w: [18, 28], d: [18, 28], gap: 1.5 },
  torre: { w: [22, 30], d: [22, 30], gap: 2 },
  hotel: { w: [22, 30], d: [26, 34], gap: 2 },
  bodega: { w: [30, 46], d: [26, 36], gap: 3 },
  fabrica: { w: [36, 46], d: [30, 40], gap: 4 },
  taller: { w: [14, 20], d: [16, 22], gap: 1 },
  concesionario: { w: [24, 32], d: [22, 30], gap: 2 },
};
// Fondo preferido (con patio trasero) para casas: llenan la manzana espalda con espalda
const DEEP = { casaHumilde: 20, casaMedia: 32, villa: 46, hacienda: 44, casaRural: 28 };
const RURAL = new Set(['montana', 'presa', 'campo', 'isla']);
const HOMES = new Set(['casaHumilde', 'casaMedia', 'villa', 'hacienda', 'apartamentos', 'casaRural']);
const CENTER = MP(800, 300); // Plaza Central

export function generateCity(seed = CITY_SEED) {
  const t0 = Date.now();
  const hm = new Heightmap();
  const city = {
    seed, hm, seaLevel: SEA_LEVEL, lots: [], sites: [], props: [], colliders: [], pois: {}, pickups: [], drops: [],
    spawnPoints: [], dummies: [], ponds: [], beach: [], caps: [], blocks: [], safeZones: [], lake: LAKE,
    height: (x, z) => hm.height(x, z),
  };

  // ---------- 0. terrenos reservados para lugares importantes (las calles de barrio los rodean) ----------
  const ruleRot = (x, z) => { const r = STREET_RULES[districtAt(x, z)]; return r ? (-r.angle * Math.PI) / 180 : 0; };
  const reserved = SITE_DEFS.map((s) => ({ id: s.id, cx: s.at[0], cz: s.at[1], hx: s.hx + 3, hz: s.hz + 3, rot: s.rot ?? ruleRot(s.at[0], s.at[1]), kind: s.kind }));

  // ---------- 1-2. calles y avenidas ----------
  const net = new RoadNet();
  // primero las avenidas (ya aplanadas): así las calles de barrio ven sus terraplenes y no se
  // trazan conectores imposibles (rampas de 10 m en 15 m)
  buildMainRoads(net);
  flattenRoads(hm, net.roads);
  for (const r of net.roads) r.flat = true;
  buildLocalRoads(net, reserved, (x, z, dx, dz) => Math.abs(hm.height(x + dx * 4, z + dz * 4) - hm.height(x, z)) / 4);
  city.net = net;
  city.roads = net.roads;
  flattenRoads(hm, net.roads.filter((r) => !r.flat));
  // una calle que termina en la entrada de un lugar (puerto, mina...) no lleva valla: el lugar es su destino
  const fixedRects = SITE_DEFS.filter((d) => d.fixed).map((d) => (d.kind === 'puerto' ? pierSite(PIERS.find((p) => p.id === 'puerto')) : { cx: d.at[0], cz: d.at[1], hx: d.hx, hz: d.hz, rot: d.rot || 0 }));
  for (const road of net.roads) for (const cp of road.caps) {
    if (fixedRects.some((r) => rectContains(r, cp.x, cp.z, 18))) continue;
    city.caps.push(buildCap(road, cp, hm));
  }

  // ---------- 3. manzanas ----------
  const { blocks, graph } = buildBlocks(net);
  const ring = net.roads.find((r) => r.name === 'Anillo Periférico');
  for (const b of blocks) {
    let cx = 0, cz = 0;
    for (const p of b.poly) { cx += p[0] / b.poly.length; cz += p[1] / b.poly.length; }
    b.cx = cx; b.cz = cz;
    b.district = districtAt(cx, cz);
    // manzanas urbanas (dentro del Anillo) que tocan la sierra: toman el barrio vecino hacia el centro
    if (RURAL.has(b.district) && ring && pointInPoly(ring.pts, cx, cz)) {
      const L = Math.hypot(CENTER[0] - cx, CENTER[1] - cz) || 1;
      for (let t = 20; t < L; t += 20) { const d = districtAt(cx + ((CENTER[0] - cx) * t) / L, cz + ((CENTER[1] - cz) * t) / L); if (!RURAL.has(d)) { b.district = d; break; } }
    }
    b.lots = [];
  }
  city.blocks = blocks.map((b) => ({ id: b.id, poly: b.poly, district: b.district, area: b.area }));

  // índice espacial de terrenos ocupados (para no encimar lotes)
  const lotIndex = new Map();
  const LCELL = 32;
  const cells = (q, fn) => { const r = Math.hypot(q.hx, q.hz); for (let i = Math.floor((q.cx - r) / LCELL); i <= Math.floor((q.cx + r) / LCELL); i++) for (let j = Math.floor((q.cz - r) / LCELL); j <= Math.floor((q.cz + r) / LCELL); j++) fn(i * 7919 + j); };
  const overlaps = (q, m = 0.12) => { let hit = false; cells(q, (k) => { const a = lotIndex.get(k); if (!hit && a) for (const o of a) if (obbOverlap(q, o, m)) { hit = o; break; } }); return hit; };
  const addIndex = (q) => cells(q, (k) => { let a = lotIndex.get(k); if (!a) lotIndex.set(k, (a = [])); a.push(q); });
  for (const cp of city.caps) addIndex({ cx: cp.cx, cz: cp.cz, hx: cp.clear, hz: cp.clear, rot: cp.rot, tag: 'cap' });

  // ---------- 4a. lugares importantes: cada uno ocupa su terreno en una manzana, de frente a la calle ----------
  const placed = [];
  city.missingSites = [];
  for (const def of SITE_DEFS) {
    let q;
    if (def.kind === 'presa') q = damSite(hm);
    else if (def.kind === 'puerto') q = pierSite(PIERS.find((p) => p.id === 'puerto'));
    else if (def.fixed) q = { cx: def.at[0], cz: def.at[1], hx: def.hx, hz: def.hz, rot: def.rot || 0 };
    else q = fitSite(def, blocks, overlaps, net);
    if (!q) { city.missingSites.push(def.id); continue; }
    addIndex({ ...q, hx: q.hx + 1, hz: q.hz + 1, tag: 'site' });
    placed.push({ def, q });
  }
  for (const { def, q } of placed) {
    const a = hm.averageRect(q.cx, q.cz, q.hx, q.hz, q.rot);
    q.y0 = def.kind === 'mirador' || def.kind === 'faro' ? a.max : def.kind === 'presa' ? LAKE.level + 2 : Math.max(1.4, a.avg);
    if (def.kind !== 'aeropuerto' && def.kind !== 'presa' && def.kind !== 'puerto') hm.flattenRect(q.cx, q.cz, q.hx + 1, q.hz + 1, q.rot, q.y0, def.fixed ? 12 : 6, true);
    else if (def.kind === 'aeropuerto') hm.flattenRect(q.cx, q.cz, q.hx + 2, q.hz + 2, q.rot, q.y0, 20, true);
  }

  // ---------- 4b. lotes a lo largo de los frentes de cada manzana ----------
  const REJ = (city.rej = {});
  let curDist = '';
  const rej = (k) => { k = curDist + ':' + k; REJ[k] = (REJ[k] || 0) + 1; return false; };
  const validLot = (q, b, type) => {
    if (!rectInPoly(b.poly, q, 0.2)) return rej('poly');
    { const o = overlaps(q, -0.08); if (o) return rej('over_' + (o.tag || 'x')); }
    if (net.rectHitsRoad(q.cx, q.cz, q.hx - 0.25, q.hz - 0.25, q.rot, 0)) return rej('road');
    if (!playable(q.cx, q.cz, 1)) return rej('play');
    const c = Math.cos(q.rot), s = Math.sin(q.rot);
    for (const [fx, fz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const x = q.cx + fx * q.hx * c + fz * q.hz * s, z = q.cz - fx * q.hx * s + fz * q.hz * c;
      if (!playable(x, z, 0.5)) return rej('play2');
      if (isSandy(x, z) && landDist(x, z) < 26) return rej('sand'); // la arena de la playa no se construye
    }
    const st = hm.averageRect(q.cx, q.cz, q.hx, q.hz, q.rot);
    const maxSlope = type === 'villa' || type === 'hacienda' ? 8 : type === 'casaRural' ? 6 : type === 'casaMedia' || type === 'casaHumilde' ? 5 : 3.5;
    if (st.max - st.min > maxSlope) return rej('slope');
    if (st.min < 0.9) return rej('low');
    return true;
  };
  for (const b of blocks) {
    const dist = b.district;
    curDist = dist;
    if (dist === 'aeropuerto' || dist === 'prision') continue;
    const runs = frontages(b);
    runs.forEach((run, ri) => {
      if (run.len < 8) return;
      let s = 0.6;
      while (s < run.len - 6) {
        const corner = s < 3 || s > run.len - 17;
        const h = hashInts(seed, b.id, Math.round(s * 10), ri);
        const arch = chooseArch(dist, { corner, road: run.road, b, h });
        if (!arch) { s += 12; continue; }
        const A = ARCH[arch.type];
        const rng = new Rng(h ^ 0x5bd1e995);
        const w0 = rng.float(A.w[0], A.w[1]);
        const want = DEEP[arch.type] ? Math.max(rng.float(A.d[0], A.d[1]), DEEP[arch.type]) : rng.float(A.d[0], A.d[1]);
        let ok = false;
        // primero el ancho elegido; si no cabe, uno más angosto (así no quedan huecos en la cuadra)
        for (const wf of [1, 0.82, 0.68]) {
          let w = Math.max(A.w[0] * 0.8, w0 * wf);
          if (s + w > run.len - 0.4) { w = run.len - 0.4 - s; if (w < A.w[0] * 0.8) break; }
          const c = runAt(run, s + w / 2, b.sgn);
          // fondo disponible hasta el otro lado de la manzana (si es amplia, espalda con espalda)
          const avail = rayToPoly(b.poly, c.x + c.nx * 0.3, c.z + c.nz * 0.3, c.nx, c.nz);
          const maxD = avail > A.d[0] * 2 + 2 ? avail / 2 - 0.2 : avail - 0.6;
          let d = Math.min(want, maxD);
          for (let tries = 0; tries < 4 && !ok && d >= A.d[0] * 0.75; tries++) {
            const q = { cx: c.x + c.nx * (d / 2 + 0.05), cz: c.z + c.nz * (d / 2 + 0.05), hx: w / 2, hz: d / 2, rot: Math.atan2(-c.nx, -c.nz) };
            if (validLot(q, b, arch.type)) {
              const st = hm.averageRect(q.cx, q.cz, q.hx, q.hz, q.rot);
              const lot = { id: city.lots.length, type: arch.type, sub: arch.sub, district: dist, block: b.id, cx: q.cx, cz: q.cz, rot: q.rot, w, d, y0: Math.max(1.0, st.avg), seed: rng.int(0, 1e9), corner };
              city.lots.push(lot); b.lots.push(lot);
              q.tag = 'lot'; addIndex(q);
              s += w + (RURAL.has(dist) ? rng.float(A.gap, A.gap * 2.5) : A.gap);
              ok = true;
            } else d *= 0.85;
          }
          if (ok) break;
        }
        if (!ok) s += 1.5;
      }
    });
  }

  // ---------- 4c. fuera de la ciudad: casas de campo y residencias a orilla de carretera ----------
  const ROADSIDE = new Set(['exclusiva', 'montana', 'presa', 'campo', 'isla']);
  const inBlock = (x, z) => blocks.some((bb) => Math.abs(bb.cx - x) < 260 && Math.abs(bb.cz - z) < 260 && pointInPoly(bb.poly, x, z));
  for (const road of net.roads) {
    if (road.cls === 'glorieta' || road.bridge) continue;
    const pts = resample(road.pts, 2, road.closed);
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const at = (sv) => { let i = 1; while (i < cum.length - 1 && cum[i] < sv) i++; const a = pts[i - 1], b2 = pts[i], L = cum[i] - cum[i - 1] || 1, t = (sv - cum[i - 1]) / L; return { x: a[0] + (b2[0] - a[0]) * t, z: a[1] + (b2[1] - a[1]) * t, ux: (b2[0] - a[0]) / L, uz: (b2[1] - a[1]) / L }; };
    const total = cum[cum.length - 1];
    for (const side of [1, -1]) {
      let sv = 14;
      while (sv < total - 14) {
        const c = at(sv);
        const nx = -c.uz * side, nz = c.ux * side;
        const off = road.w / 2 + road.sw + 1.2;
        const px = c.x + nx * (off + 10), pz = c.z + nz * (off + 10);
        const dist = districtAt(px, pz);
        if (!ROADSIDE.has(dist) || inBlock(px, pz)) { sv += 8; continue; }
        const h = hashInts(seed, road.id, Math.round(sv), side + 3);
        const arch = chooseArch(dist, { corner: false, road, b: { cx: px, cz: pz }, h });
        if (!arch) { sv += 30; continue; }
        const A = ARCH[arch.type];
        const rng = new Rng(h ^ 0x2545f491);
        const w = rng.float(A.w[0], A.w[1]), d = rng.float(A.d[0], A.d[1]);
        const m = at(Math.min(total, sv + w / 2));
        const mx = -m.uz * side, mz = m.ux * side;
        const q = { cx: m.x + mx * (off + d / 2), cz: m.z + mz * (off + d / 2), hx: w / 2, hz: d / 2, rot: Math.atan2(-mx, -mz) };
        let ok = playable(q.cx, q.cz, 3) && !inBlock(q.cx, q.cz) && !net.rectHitsRoad(q.cx, q.cz, q.hx, q.hz, q.rot, 0.4) && !overlaps(q, 1.5);
        if (ok) {
          const cs = Math.cos(q.rot), sn = Math.sin(q.rot);
          for (const [fx, fz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) if (!playable(q.cx + fx * q.hx * cs + fz * q.hz * sn, q.cz - fx * q.hx * sn + fz * q.hz * cs, 1)) ok = false;
        }
        const st = ok ? hm.averageRect(q.cx, q.cz, q.hx, q.hz, q.rot) : null;
        if (ok && st.max - st.min < (dist === 'exclusiva' ? 9 : 7) && st.min > 1) {
          const lot = { id: city.lots.length, type: arch.type, sub: arch.sub, district: dist, block: -1, cx: q.cx, cz: q.cz, rot: q.rot, w, d, y0: st.avg, seed: rng.int(0, 1e9), corner: false };
          city.lots.push(lot);
          q.tag = 'lot'; addIndex(q);
          sv += w + (dist === 'exclusiva' ? rng.float(4, 10) : rng.float(18, 40));
        } else sv += 6;
      }
    }
  }

  // ---------- 5. arquitectura de cada lote ----------
  for (const lot of city.lots) hm.flattenRect(lot.cx, lot.cz, lot.w / 2, lot.d / 2, lot.rot, lot.y0, 3, true);
  const counters = {};
  const nextName = (type) => { const list = B.NAMES[type] || B.NAMES.shop; counters[type] = (counters[type] || 0) + 1; return list[(counters[type] - 1) % list.length]; };
  for (const lot of city.lots) {
    const rng = new Rng(lot.seed);
    let res;
    switch (lot.type) {
      case 'casaHumilde': res = B.casaHumilde(rng, lot.w, lot.d); break;
      case 'casaMedia': res = B.casaMedia(rng, lot.w, lot.d); break;
      case 'casaRural': res = B.casaRural(rng, lot.w, lot.d); break;
      case 'villa': res = B.villaModerna(rng, lot.w, lot.d); break;
      case 'hacienda': res = B.villaHacienda(rng, lot.w, lot.d); break;
      case 'apartamentos': res = B.apartamentos(rng, lot.w, lot.d, rng.int(3, 5)); break;
      case 'restaurante': lot.name = nextName(lot.sub); res = B.restaurante(rng, lot.w, lot.d, lot.sub, lot.name); break;
      case 'tienda': lot.name = nextName(lot.sub); res = B.tienda(rng, lot.w, lot.d, lot.sub, lot.name); break;
      case 'oficina': res = B.oficina(rng, lot.w, lot.d, 9, 24); break;
      case 'torre': res = B.oficina(rng, lot.w, lot.d, 26, lot.sub === 'alta' ? 92 : 60); break;
      case 'hotel': lot.name = nextName('hotel'); res = B.hotel(rng, lot.w, lot.d, lot.name); break;
      case 'taller': lot.name = nextName('taller'); res = B.taller(rng, lot.w, lot.d, lot.name); break;
      case 'concesionario': lot.name = nextName('concesionario'); res = B.concesionario(rng, lot.w, lot.d, lot.name); break;
      case 'fabrica': res = B.fabrica(rng, lot.w, lot.d); break;
      default: res = B.bodega(rng, lot.w, lot.d); break;
    }
    lot.parts = res.parts;
    lot.access = [res.door[0], ...(res.drive || [])];
    const front = toWorld(lot, res.door[0], lot.d / 2 + 1.2);
    if (lot.type === 'restaurante' || lot.type === 'tienda' || (lot.type === 'casaHumilde' && res.shop)) {
      const name = lot.name || nextName('tienda');
      lot.name = name;
      if (lot.type === 'casaHumilde') lot.parts.push({ k: 'sign', x: 0, z: lot.d / 2 - 0.1, y: 2.45, w: Math.min(lot.w * 0.8, 5), h: 0.6, text: name, bg: '#f9a825', fg: '#3e2723', r: 0 });
      city.pickups.push({ id: city.pickups.length, x: front[0], z: front[1], name });
    } else if (HOMES.has(lot.type)) {
      city.drops.push({ id: city.drops.length, x: front[0], z: front[1], label: `${streetName(net, front[0], front[1])} #${100 + city.drops.length}` });
    }
  }

  // ---------- 5b. corazón de manzana: patios, estacionamientos, parques, huertas (nada de terrenos baldíos) ----------
  for (const b of blocks) {
    if (b.area < 500) continue;
    const kindFor = (q) => interiorKind(b.district, q);
    for (const q of freeRects(b, city, lotIndex, LCELL)) {
      const kind = kindFor(q);
      if (!kind) continue;
      const st = hm.averageRect(q.cx, q.cz, q.hx, q.hz, q.rot);
      if (st.max - st.min > 4.5 || !playable(q.cx, q.cz, 1) || net.rectHitsRoad(q.cx, q.cz, q.hx, q.hz, q.rot, 0.2)) continue;
      q.tag = 'int'; addIndex(q);
      hm.flattenRect(q.cx, q.cz, q.hx, q.hz, q.rot, st.avg, 2, true);
      q.y0 = st.avg;
      placed.push({ def: { id: 'int' + b.id + '_' + placed.length, kind, name: '', interior: true }, q });
    }
  }

  // ---------- 5c. arquitectura de los lugares importantes y glorietas ----------
  for (const { def, q } of placed) {
    const fn = SITE_BUILDERS[def.kind];
    if (!fn) continue;
    const s = { id: def.id, kind: def.kind, name: def.name, brand: def.brand, interior: def.interior, cx: q.cx, cz: q.cz, hx: q.hx, hz: q.hz, rot: q.rot, lakeSide: q.lakeSide, drop: q.drop };
    const res = fn(s, new Rng(hashInts(seed, Math.round(q.cx), Math.round(q.cz))));
    const site = { ...s, parts: dropOnRoad(net, s, res.parts), y0: q.y0 ?? hm.height(q.cx, q.cz) };
    city.sites.push(site);
    registerSite(city, site, res.points || {});
    if (res.pond) {
      const pc = toWorld(site, res.pond.x, res.pond.z);
      city.ponds.push({ x: pc[0], z: pc[1], rx: res.pond.rx, rz: res.pond.rz, rot: site.rot, y: site.y0 + 0.05 });
    }
  }
  for (const g of ROUNDABOUTS) {
    const ring = net.roads.find((r) => r.cls === 'glorieta' && Math.hypot(r.pts[0][0] - g.at[0], r.pts[0][1] - g.at[1]) < g.r + 8);
    const inner = g.r - (ring ? ring.w / 2 : 5.5) - 0.6;
    const site = { id: 'glorieta', kind: 'glorieta', name: g.name, cx: g.at[0], cz: g.at[1], hx: inner, hz: inner, rot: 0, deco: g.deco, interior: true };
    site.parts = SITE_BUILDERS.glorieta(site).parts;
    site.y0 = hm.height(g.at[0], g.at[1]);
    city.sites.push(site);
  }

  // ---------- zonas seguras (no se puede disparar) y punto de inicio ----------
  for (const z of SAFE_ZONES) {
    if (z.site) {
      const s = city.sites.find((q) => q.id === z.site);
      if (s) city.safeZones.push({ id: z.site, x: s.cx, z: s.cz, r: z.r, name: s.name });
    } else city.safeZones.push({ id: z.name, x: z.at[0], z: z.at[1], r: z.r, name: z.name });
  }
  if (!city.spawnPoints.length) {
    const p = city.pois.park || { x: CENTER[0], z: CENTER[1] };
    for (let i = 0; i < 6; i++) city.spawnPoints.push({ x: p.x + Math.cos(i) * 12, z: p.z + Math.sin(i) * 12 });
  }

  // ---------- 6. detalles urbanos, playa y vegetación ----------
  intersectionSigns(city, graph);
  streetFurniture(city, net, seed);
  beachAndSea(city, seed);
  vegetation(city, net, seed);
  for (const p of city.props) if (p.y === undefined) p.y = hm.height(p.x, p.z);

  // ---------- 7. colisiones y valla invisible ----------
  buildColliders(city);
  city.fence = fenceLines();
  for (const line of city.fence) {
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i], b = line[i + 1];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 0.3) continue;
      city.colliders.push({ cx: (a[0] + b[0]) / 2, cz: (a[1] + b[1]) / 2, hx: L / 2 + 0.4, hz: 0.8, rot: Math.atan2(-(b[1] - a[1]), b[0] - a[0]), minY: -20, maxY: 160, fence: 1 });
    }
  }
  city.coast = coastLines();
  delete city._ph; delete city._lh;
  city.genMs = Date.now() - t0;
  return city;
}

// Quita de un sitio los objetos sueltos (árboles, postes, canastas, vallas, vehículos) que caen
// sobre el asfalto de una calle: el sitio se acomoda a la calle, nunca al revés.
function dropOnRoad(net, o, parts) {
  const onRoad = (lx, lz, m) => {
    const [x, z] = toWorld(o, lx, lz);
    for (const sg of net.near(x - 25, z - 25, x + 25, z + 25)) if (segDist(sg.ax, sg.az, sg.bx, sg.bz, x, z) < sg.road.w / 2 + m) return true;
    return false;
  };
  return parts.filter((p) => {
    if (p.k === 'prop' || p.k === 'cyl' || p.k === 'cone') return !onRoad(p.x, p.z, p.k === 'prop' ? 0.6 : 0.3);
    if (p.k === 'fence') { for (let t = 0; t <= 1; t += 0.125) if (onRoad(p.x + (p.x2 - p.x) * t, p.z + (p.z2 - p.z) * t, 0.2)) return false; }
    return true;
  });
}

// Cortina de la presa: a lo largo de la línea DAM; el lago queda de un lado y el río del otro
function damSite(hm) {
  const [ax, az] = DAM.a, [bx, bz] = DAM.b;
  const L = Math.hypot(bx - ax, bz - az);
  const rot = Math.atan2(-(bz - az), bx - ax);
  const cx = (ax + bx) / 2, cz = (az + bz) / 2;
  const fx = Math.sin(rot), fz = Math.cos(rot);           // dirección local +Z
  const lakeSide = lakeDist(cx + fx * 20, cz + fz * 20) > lakeDist(cx - fx * 20, cz - fz * 20) ? 1 : -1;
  const down = hm.height(cx - fx * lakeSide * 14, cz - fz * lakeSide * 14);
  return { cx, cz, hx: L / 2 + 6, hz: 4, rot, lakeSide, drop: Math.max(6, LAKE.level + 2 - down) };
}

// Muelle de carga: el sitio se alinea con el muelle (frente +Z hacia tierra)
function pierSite(pier) {
  const a = pier.pts[0], b = pier.pts[pier.pts.length - 1];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const dx = (b[0] - a[0]) / L, dz = (b[1] - a[1]) / L;
  return { cx: (a[0] + b[0]) / 2 + dx * 6, cz: (a[1] + b[1]) / 2 + dz * 6, hx: pier.width / 2 - 1.5, hz: L / 2 - 8, rot: Math.atan2(-dx, -dz) };
}

// ¿Está el punto dentro de una zona segura?
export function safeZoneAt(city, x, z) {
  for (const s of city.safeZones) if ((s.x - x) ** 2 + (s.z - z) ** 2 < s.r * s.r) return s;
  return null;
}

// ---------------- utilidades ----------------

export function toWorld(o, lx, lz) {
  const c = Math.cos(o.rot || 0), s = Math.sin(o.rot || 0);
  return [o.cx + lx * c + lz * s, o.cz - lx * s + lz * c];
}

function resample(pts, step, closed) {
  const src = closed ? [...pts, pts[0]] : pts;
  const out = [src[0]];
  for (let i = 1; i < src.length; i++) {
    const a = src[i - 1], b = src[i];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.round(L / step));
    for (let k = 1; k <= n; k++) out.push([a[0] + (b[0] - a[0]) * (k / n), a[1] + (b[1] - a[1]) * (k / n)]);
  }
  if (closed) out.pop();
  return out;
}

// Aplana el terreno bajo las calles. El perfil de TODA la red se resuelve junto (como un estudio
// de topografía): cada calle es suave a lo largo, sigue al terreno de lejos, y en cada cruce las
// dos calles comparten la misma altura (sin escalones ni rampas bruscas al entrar a una avenida).
function flattenRoads(hm, list) {
  const roads = list.filter((r) => r.pts.length >= 2);
  const R = [];
  let N = 0;
  for (const road of roads) {
    const pts = resample(road.pts, 4, road.closed);
    R.push({ road, pts, off: N });
    N += pts.length;
  }
  const X = new Float32Array(N), Z = new Float32Array(N), raw = new Float32Array(N), h = new Float32Array(N), alpha = new Float32Array(N), minH = new Float32Array(N), owner = new Int32Array(N), fixed = new Uint8Array(N);
  const links = Array.from({ length: N }, () => []);
  const link = (a, b, w) => { links[a].push(b, w); links[b].push(a, w); };
  R.forEach((rr, ri) => {
    const { road, pts, off } = rr;
    // rigidez: las avenidas son más planas; los caminos de montaña siguen más al cerro
    const a = road.cls === 'avenida' || road.cls === 'boulevard' ? 0.006 : road.cls === 'subida' ? 0.03 : road.cls === 'glorieta' ? 0.002 : 0.012;
    let avg = 0;
    pts.forEach(([x, z], k) => { avg += hm.height(x, z) / pts.length; });
    pts.forEach(([x, z], k) => {
      const i = off + k;
      X[i] = x; Z[i] = z; owner[i] = ri;
      raw[i] = road.cls === 'glorieta' ? avg : hm.height(x, z);   // la glorieta tiende a ser plana
      minH[i] = road.bridge ? 2.2 : 1.2;
      if (hm.masked(x, z)) { fixed[i] = 1; raw[i] = hm.height(x, z); }  // sobre una calle ya aplanada
      h[i] = Math.max(minH[i], raw[i]);
      alpha[i] = a;
      if (k > 0) link(i - 1, i, 1);
    });
    if (road.closed && pts.length > 2) link(off + pts.length - 1, off, 1);
  });
  // cruces: un punto dentro del corredor de otra calle toma la altura de esa calle
  const CS = 8, grid = new Map();
  for (let i = 0; i < N; i++) { const k = Math.floor(X[i] / CS) * 92821 + Math.floor(Z[i] / CS); let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(i); }
  for (let i = 0; i < N; i++) {
    const A = R[owner[i]].road;
    const best = new Map();
    const gi = Math.floor(X[i] / CS), gj = Math.floor(Z[i] / CS);
    for (let di = -2; di <= 2; di++) for (let dj = -2; dj <= 2; dj++) {
      for (const j of grid.get((gi + di) * 92821 + gj + dj) || []) {
        if (owner[j] === owner[i] || j < i) continue;
        const B = R[owner[j]].road;
        const d = Math.hypot(X[j] - X[i], Z[j] - Z[i]);
        if (d > Math.max(A.w / 2 + A.sw, B.w / 2 + B.sw) + 2.5) continue;
        const o = best.get(owner[j]);
        if (!o || d < o[1]) best.set(owner[j], [j, d]);
      }
    }
    for (const [j] of best.values()) link(i, j, 10);
  }
  // Gauss-Seidel: altura = promedio de vecinos (suavidad) + un poco del terreno original
  for (let it = 0; it < 900; it++) {
    for (let i = 0; i < N; i++) {
      if (fixed[i]) continue;
      const L = links[i];
      let s = alpha[i] * raw[i], w = alpha[i];
      for (let k = 0; k < L.length; k += 2) { s += h[L[k]] * L[k + 1]; w += L[k + 1]; }
      h[i] = Math.max(minH[i], s / w);
    }
  }
  // aplanado: las avenidas primero. Cada calle respeta EXACTAMENTE lo ya aplanado en los cruces
  // y se acomoda a esa altura con una transición suave (sin escalón en la orilla del cruce).
  const order = R.map((rr, ri) => ri).sort((a, b) => rank(R[a].road) - rank(R[b].road));
  for (const ri of order) {
    const { road, pts, off } = R[ri];
    const n = pts.length;
    const target = h.subarray(off, off + n);
    const pin = pts.map(([x, z]) => hm.masked(x, z));
    const hs = pts.map(([x, z], k) => (pin[k] ? hm.height(x, z) : target[k]));
    if (pin.some(Boolean)) {
      for (let it = 0; it < 300; it++) for (let k = 0; k < n; k++) {
        if (pin[k]) continue;
        const p = road.closed ? hs[(k - 1 + n) % n] : hs[Math.max(0, k - 1)];
        const q = road.closed ? hs[(k + 1) % n] : hs[Math.min(n - 1, k + 1)];
        const nb = !road.closed && k === 0 ? q : !road.closed && k === n - 1 ? p : (p + q) / 2;
        hs[k] = Math.max(minH[off + k], nb * 0.94 + target[k] * 0.06);
      }
    }
    // pendiente máxima (12% en calles, 16% en caminos de montaña); si el cerro es más empinado
    // la calle va en corte o en terraplén. Luego un suavizado puro (no aumenta la pendiente).
    const g = (road.cls === 'subida' ? 0.16 : 0.12) * 4;
    const lim = (k, ref) => { if (!pin[k]) hs[k] = clamp(hs[k], hs[ref] - g, hs[ref] + g); };
    for (let rep = 0; rep < 4; rep++) {
      for (let k = 1; k < n; k++) lim(k, k - 1);
      for (let k = n - 2; k >= 0; k--) lim(k, k + 1);
      for (let it = 0; it < 6; it++) for (let k = 1; k < n - 1; k++) if (!pin[k]) hs[k] = (hs[k - 1] + 2 * hs[k] + hs[k + 1]) / 4;
    }
    for (let k = 0; k < n; k++) hs[k] = Math.max(minH[off + k], hs[k]);
    const core = road.bridge ? road.w / 2 + road.sw + 1.5 : road.w / 2 + road.sw + 4;
    hm.flattenRoad(pts, hs, road.closed, core, road.bridge ? 2 : 6, true);
  }
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
// las avenidas fijan su altura primero; las calles de barrio se acomodan a ellas
const rank = (r) => (r.cls === 'avenida' ? 0 : r.cls === 'boulevard' ? 1 : r.cls === 'glorieta' ? 2 : r.district ? 4 : 3);

export function obbOverlap(a, b, m) {
  const axes = [];
  for (const o of [a, b]) { const c = Math.cos(o.rot), s = Math.sin(o.rot); axes.push([c, -s], [s, c]); }
  const proj = (o, ax) => {
    const c = Math.cos(o.rot), s = Math.sin(o.rot);
    const center = o.cx * ax[0] + o.cz * ax[1];
    const r = Math.abs(c * ax[0] - s * ax[1]) * (o.hx + m) + Math.abs(s * ax[0] + c * ax[1]) * (o.hz + m);
    return [center - r, center + r];
  };
  for (const ax of axes) {
    const p = proj(a, ax), q = proj(b, ax);
    if (p[1] < q[0] || q[1] < p[0]) return false;
  }
  return true;
}

// Espacio libre dentro de una manzana (lo que no ocupan lotes ni sitios), como rectángulos grandes
// alineados al frente más largo. Rejilla de 2 m + "mayor rectángulo en histograma".
function freeRects(b, city, lotIndex, LCELL) {
  const runs = frontages(b);
  if (!runs.length) return [];
  const r0 = runs[0], p0 = r0.pts[0], p1 = r0.pts[r0.pts.length - 1];
  const ang = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
  const rot = -ang, c = Math.cos(rot), s = Math.sin(rot);
  const toL = (x, z) => [x * c - z * s, x * s + z * c];
  const toW = (lx, lz) => [lx * c + lz * s, -lx * s + lz * c];
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of b.poly) { const [lx, lz] = toL(p[0], p[1]); x0 = Math.min(x0, lx); x1 = Math.max(x1, lx); z0 = Math.min(z0, lz); z1 = Math.max(z1, lz); }
  const G = 2, NX = Math.ceil((x1 - x0) / G), NZ = Math.ceil((z1 - z0) / G);
  if (NX < 3 || NZ < 3 || NX * NZ > 40000) return [];
  const free = new Uint8Array(NX * NZ);
  const occ = [];
  const seen = new Set();
  let bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity;
  for (const p of b.poly) { bx0 = Math.min(bx0, p[0]); bx1 = Math.max(bx1, p[0]); bz0 = Math.min(bz0, p[1]); bz1 = Math.max(bz1, p[1]); }
  for (let i = Math.floor((bx0 - 4) / LCELL); i <= Math.floor((bx1 + 4) / LCELL); i++) for (let j = Math.floor((bz0 - 4) / LCELL); j <= Math.floor((bz1 + 4) / LCELL); j++) {
    const a = lotIndex.get(i * 7919 + j);
    if (a) for (const o of a) if (!seen.has(o)) {
      seen.add(o);
      const r = Math.hypot(o.hx, o.hz) + 2;
      if (o.cx + r > bx0 && o.cx - r < bx1 && o.cz + r > bz0 && o.cz - r < bz1) occ.push(o);
    }
  }
  // índice local por celda de 8 m
  const OC = new Map();
  for (const o of occ) {
    const r = Math.hypot(o.hx, o.hz) + 1.5;
    for (let i = Math.floor((o.cx - r) / 8); i <= Math.floor((o.cx + r) / 8); i++) for (let j = Math.floor((o.cz - r) / 8); j <= Math.floor((o.cz + r) / 8); j++) { const k = i * 4099 + j; let a = OC.get(k); if (!a) OC.set(k, (a = [])); a.push(o); }
  }
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const [x, z] = toW(x0 + (i + 0.5) * G, z0 + (j + 0.5) * G);
    if (!pointInPoly(b.poly, x, z)) continue;
    let hit = false;
    for (const o of OC.get(Math.floor(x / 8) * 4099 + Math.floor(z / 8)) || []) {
      const dx = x - o.cx, dz = z - o.cz, oc = Math.cos(o.rot), os = Math.sin(o.rot);
      if (Math.abs(dx * oc - dz * os) < o.hx + 1.3 && Math.abs(dx * os + dz * oc) < o.hz + 1.3) { hit = true; break; }
    }
    if (!hit) free[j * NX + i] = 1;
  }
  const out = [];
  for (let k = 0; k < 10; k++) {
    // mayor rectángulo de celdas libres
    const hgt = new Int32Array(NX);
    let best = null;
    for (let j = 0; j < NZ; j++) {
      for (let i = 0; i < NX; i++) hgt[i] = free[j * NX + i] ? hgt[i] + 1 : 0;
      const st = [];
      for (let i = 0; i <= NX; i++) {
        const hh = i < NX ? hgt[i] : 0;
        let start = i;
        while (st.length && st[st.length - 1][1] >= hh) {
          const [si, sh] = st.pop();
          const wcells = i - si, area = wcells * sh;
          if (sh >= 3 && wcells >= 3 && (!best || area > best.area)) best = { area, i0: si, i1: i, j0: j - sh + 1, j1: j + 1 };
          start = si;
        }
        st.push([start, hh]);
      }
    }
    if (!best || best.area * G * G < 90) break;
    // máximo 56 x 40 m por pieza: un patio enorme se parte en varios
    const MW = 28, MH = 20;
    if (best.i1 - best.i0 > MW) best.i1 = best.i0 + MW;
    if (best.j1 - best.j0 > MH) best.j1 = best.j0 + MH;
    for (let j = best.j0; j < best.j1; j++) for (let i = best.i0; i < best.i1; i++) free[j * NX + i] = 0;
    const lcx = x0 + ((best.i0 + best.i1) / 2) * G, lcz = z0 + ((best.j0 + best.j1) / 2) * G;
    const [cx, cz] = toW(lcx, lcz);
    out.push({ cx, cz, hx: ((best.i1 - best.i0) * G) / 2 - 0.4, hz: ((best.j1 - best.j0) * G) / 2 - 0.4, rot });
  }
  void city;
  return out;
}

// Rectángulo grande dentro de un polígono convexo-ish (alineado a su lado más largo)
function fitRectInPoly(poly, sgn) {
  let best = 0, ang = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L > best) { best = L; ang = Math.atan2(b[1] - a[1], b[0] - a[0]); }
  }
  // eje local X a lo largo del lado más largo: rot tal que (cos rot, -sin rot) = (cos ang, sin ang)
  const rot = -ang;
  const c = Math.cos(rot), s = Math.sin(rot);
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of poly) {
    const lx = p[0] * c - p[1] * s, lz = p[0] * s + p[1] * c;
    x0 = Math.min(x0, lx); x1 = Math.max(x1, lx); z0 = Math.min(z0, lz); z1 = Math.max(z1, lz);
  }
  const lcx = (x0 + x1) / 2, lcz = (z0 + z1) / 2;
  const q = { cx: lcx * c + lcz * s, cz: -lcx * s + lcz * c, hx: (x1 - x0) / 2, hz: (z1 - z0) / 2, rot };
  for (let k = 0; k < 16; k++) {
    if (rectInPoly(poly, q, 0)) return q;
    q.hx *= 0.9; q.hz *= 0.9;
  }
  void sgn;
  return null;
}

// Acomoda un lugar importante en la manzana más cercana a su punto, con el frente hacia la calle
function fitSite(def, blocks, overlaps, net) {
  const at = def.at;
  const cand = blocks.filter((b) => pointInPoly(b.poly, at[0], at[1]));
  const near = blocks.map((b) => ({ b, d: Math.hypot(b.cx - at[0], b.cz - at[1]) })).sort((p, q) => p.d - q.d);
  for (const n of near.slice(0, 5)) if (n.d < 160 && !cand.includes(n.b)) cand.push(n.b);
  for (const scale of [1, 0.9, 0.8, 0.7]) {
    for (const b of cand) {
      const runs = frontages(b).filter((r) => r.len > 10);
      const scored = runs.map((r) => {
        let best = Infinity, bs = 0;
        for (let s = 0; s <= r.len; s += 2) { const p = runAt(r, s, b.sgn); const d = Math.hypot(p.x - at[0], p.z - at[1]); if (d < best) { best = d; bs = s; } }
        // se prefieren las avenidas como frente
        const bonus = r.road && (r.road.cls === 'avenida' || r.road.cls === 'boulevard') ? -12 : 0;
        return { r, d: best + bonus, s: bs };
      }).sort((p, q) => p.d - q.d);
      for (const swap of [false, true]) {
        const hx = (swap ? def.hz : def.hx) * scale, hz = (swap ? def.hx : def.hz) * scale;
        for (const { r, s } of scored) {
          if (r.len < hx * 2 + 1) continue;
          for (const off of [0, 6, -6, 12, -12, 20, -20, 30, -30, 44, -44, 60, -60]) {
            const ss = Math.max(hx + 0.5, Math.min(r.len - hx - 0.5, s + off));
            const p = runAt(r, ss, b.sgn);
            const q = { cx: p.x + p.nx * (hz + 0.3), cz: p.z + p.nz * (hz + 0.3), hx, hz, rot: Math.atan2(-p.nx, -p.nz) };
            if (rectInPoly(b.poly, q, 0) && !overlaps(q) && playable(q.cx, q.cz, 2) && !net.rectHitsRoad(q.cx, q.cz, q.hx - 0.3, q.hz - 0.3, q.rot, 0)) return q;
          }
        }
      }
    }
  }
  return null;
}

function interiorKind(d, q) {
  const big = q.hx * q.hz * 4;
  if (d === 'media' || d === 'residencial') return big > 700 ? 'parqueBarrio' : 'patio';
  if (d === 'exclusiva') return 'patio';
  if (d === 'popular') return big > 900 ? 'canchita' : 'patioPopular';
  if (d === 'centro' || d === 'comercial' || d === 'sur' || d === 'costa' || d === 'playa') return big > 900 && ((Math.round(q.cx) ^ Math.round(q.cz)) & 1) ? 'parqueBarrio' : 'estacionamiento';
  if (d === 'industrial' || d === 'puerto') return 'patioIndustrial';
  if (RURAL.has(d)) return 'huerta';
  return null;
}

// Arquitectura de cada lote según el barrio y su posición (las esquinas tienen comercios)
function chooseArch(dist, ctx) {
  const rng = new Rng(ctx.h);
  const pick = (list) => list[rng.int(0, list.length - 1)];
  const main = ctx.road && (ctx.road.cls === 'avenida' || ctx.road.cls === 'boulevard');
  switch (dist) {
    case 'centro': {
      const d = Math.hypot(ctx.b.cx - CENTER[0], ctx.b.cz - CENTER[1]);
      const k = rng.float();
      if (d < 190) {
        if (k < 0.36) return { type: 'torre', sub: d < 120 ? 'alta' : 'media' };
        if (k < 0.6) return { type: 'oficina' };
        if (k < 0.78) return { type: 'restaurante', sub: pick(['cafe', 'sushi', 'pizzeria', 'burger']) };
        if (k < 0.92) return { type: 'tienda', sub: rng.chance(0.25) ? 'farmacia' : 'shop' };
        return { type: 'hotel' };
      }
      if (k < 0.3) return { type: 'apartamentos' };
      if (k < 0.5) return { type: 'oficina' };
      if (k < 0.7) return { type: 'tienda', sub: rng.chance(0.2) ? 'farmacia' : 'shop' };
      if (k < 0.92) return { type: 'restaurante', sub: pick(['cafe', 'taqueria', 'pizzeria', 'burger']) };
      return { type: 'hotel' };
    }
    case 'comercial': {
      const k = rng.float();
      if (k < 0.3) return { type: 'tienda', sub: rng.chance(0.2) ? 'farmacia' : 'shop' };
      if (k < 0.56) return { type: 'restaurante', sub: pick(['burger', 'pizzeria', 'taqueria', 'cafe', 'sushi']) };
      if (k < 0.68) return { type: 'taller' };
      if (k < 0.76) return { type: 'concesionario' };
      if (k < 0.88) return { type: 'oficina' };
      return { type: 'apartamentos' };
    }
    case 'sur': {
      const k = rng.float();
      if (ctx.corner && rng.chance(0.5)) return { type: 'tienda', sub: rng.chance(0.3) ? 'farmacia' : 'tienda' };
      if (k < 0.34) return { type: 'apartamentos' };
      if (k < 0.5) return { type: 'casaMedia' };
      if (k < 0.66) return { type: 'tienda', sub: 'shop' };
      if (k < 0.84) return { type: 'restaurante', sub: pick(['taqueria', 'mariscos', 'pizzeria', 'cafe']) };
      if (k < 0.93) return { type: 'taller' };
      return { type: 'oficina' };
    }
    case 'costa':
    case 'playa': {
      const k = rng.float();
      if (k < 0.4) return { type: 'hotel' };
      if (k < 0.76) return { type: 'restaurante', sub: pick(['mariscos', 'cafe', 'mariscos', 'sushi', 'taqueria']) };
      if (k < 0.88) return { type: 'tienda', sub: 'shop' };
      return { type: 'apartamentos' };
    }
    case 'media': {
      if (ctx.corner && rng.chance(main ? 0.55 : 0.3)) return rng.chance(0.5) ? { type: 'tienda', sub: rng.chance(0.4) ? 'farmacia' : 'shop' } : { type: 'restaurante', sub: pick(['cafe', 'taqueria', 'pizzeria']) };
      if (main && rng.chance(0.35)) return { type: 'apartamentos' };
      return rng.chance(0.93) ? { type: 'casaMedia' } : { type: 'apartamentos' };
    }
    case 'residencial': {
      if (ctx.corner && rng.chance(main ? 0.5 : 0.22)) return rng.chance(0.6) ? { type: 'tienda', sub: rng.chance(0.4) ? 'farmacia' : 'shop' } : { type: 'restaurante', sub: pick(['cafe', 'taqueria']) };
      if (main && rng.chance(0.45)) return { type: 'apartamentos' };
      return rng.chance(0.88) ? { type: 'casaMedia' } : { type: 'apartamentos' };
    }
    case 'popular': {
      if (ctx.corner && rng.chance(main ? 0.6 : 0.35)) return rng.chance(0.75) ? { type: 'tienda', sub: 'tienda' } : { type: 'restaurante', sub: 'taqueria' };
      if (main && rng.chance(0.08)) return { type: 'taller' };
      return { type: 'casaHumilde' };
    }
    case 'exclusiva': return { type: rng.chance(0.6) ? 'villa' : 'hacienda' };
    case 'industrial': { const k = rng.float(); return { type: k < 0.3 ? 'fabrica' : k < 0.45 ? 'taller' : 'bodega' }; }
    case 'puerto': return { type: 'bodega' };
    case 'montana':
    case 'presa':
    case 'campo':
    case 'isla': return rng.chance(0.5) ? { type: 'casaRural' } : null;
    default: return null;
  }
}

function streetName(net, x, z) {
  const { seg } = net.clearance(x, z, (s) => s.road.cls !== 'glorieta');
  return seg ? seg.road.name : 'Calle';
}

// Registra puntos de interés, recogidas y puntos de aparición de cada lugar
function registerSite(city, site, pt) {
  const w = (p) => toWorld(site, p[0], p[1]);
  const poi = (k, type, p, extra = {}) => { const q = p ? w(p) : [site.cx, site.cz]; city.pois[k] = { type, name: site.name, x: q[0], z: q[1], ...extra }; };
  switch (site.kind) {
    case 'plaza':
      poi('park', 'park', null, { safe: 75 });
      for (const p of pt.spawns || []) { const q = w(p); city.spawnPoints.push({ x: q[0], z: q[1] }); }
      break;
    case 'repartos': poi('jobcenter', 'jobcenter', pt.job, { safe: 30 }); break;
    case 'comisaria': poi('police', 'police', pt.door); break;
    case 'carcel': poi('jail', 'jail', pt.jail); break;
    case 'hospital': poi('hospital', 'hospital', pt.door, { safe: 50 }); poi('medics', 'medics', pt.medics); city.pois.medics.name = 'Zona de Médicos'; break;
    case 'armeria':
      poi('gunshop', 'gunshop', pt.door); poi('range', 'range', pt.range); city.pois.range.name = 'Campo de tiro';
      for (const d of pt.dummies || []) { const q = w(d); city.dummies.push({ x: q[0], z: q[1], y: site.y0 }); }
      break;
    case 'mercado':
      (pt.stalls || []).forEach((p, i) => { const q = w(p); city.pickups.push({ id: city.pickups.length, x: q[0], z: q[1], name: ['Frutas Doña Mary', 'Jugos Naturales', 'Tortillería La Güera', 'Pollería El Gallo', 'Dulces Típicos'][i % 5] }); });
      poi('mercado', 'mercado', null);
      break;
    case 'gasolinera': { const q = w([pt.shop[0], pt.shop[1] + 2]); city.pickups.push({ id: city.pickups.length, x: q[0], z: q[1], name: `Tienda 24h ${site.name.replace('Gasolinera ', '')}` }); poi(site.id, 'gas', null); break; }
    case 'super': { const q = w(pt.door); city.pickups.push({ id: city.pickups.length, x: q[0], z: q[1], name: site.name }); poi('mall', 'mall', pt.door, { safe: 50 }); break; }
    case 'plazuela': if (pt.stand) { const q = w(pt.stand); city.pickups.push({ id: city.pickups.length, x: q[0], z: q[1], name: 'Elotes Don Pepe' }); } poi(site.id, 'parque', null); break;
    case 'parque': if (!site.interior) poi(site.id, 'parque', null); break;
    case 'catedral': poi('catedral', 'iglesia', pt.door); break;
    case 'presa': poi('presa', 'presa', null); break;
    default:
      if (!site.interior) poi(site.id, site.kind, pt.door || null);
      break;
  }
}

// ---------------- calles cerradas (solo si quedara alguna) ----------------
function buildCap(road, cp, hm) {
  const half = road.w / 2;
  const rot = Math.atan2(cp.dx, cp.dz);
  const y0 = hm.height(cp.x, cp.z);
  const parts = [];
  let R = 0;
  if (cp.type === 'street') {
    R = half + 1.8;
    const sw = road.sw;
    hm.flattenRect(cp.x + cp.dx * R * 0.5, cp.z + cp.dz * R * 0.5, R + sw + 1, R * 0.5 + sw + 1, rot, y0, 6);
    const zb = R + 0.35;
    const wb = Math.min(R * 0.9, 6.5);
    parts.push({ k: 'fence', s: 'barricade', x: -wb, z: zb, x2: wb, z2: zb, h: 1.15, c: 0xd32f2f, c2: 0xf5f5f5, col: 1 });
    parts.push({ k: 'box', x: -wb - 0.25, z: zb, y: 0, w: 0.35, d: 0.35, h: 1.5, c: 0xf5f5f5 });
    parts.push({ k: 'box', x: wb + 0.25, z: zb, y: 0, w: 0.35, d: 0.35, h: 1.5, c: 0xf5f5f5 });
    parts.push({ k: 'sign', x: 0, z: zb - 0.12, y: 1.55, w: 2.8, h: 0.6, text: 'SIN SALIDA', bg: '#ffd600', fg: '#111111', r: Math.PI });
  } else if (cp.type === 'bollards') {
    const n = Math.max(3, Math.round((road.w + 1) / 1.5));
    for (let i = 0; i < n; i++) {
      const x = -road.w / 2 + (road.w * i) / (n - 1);
      parts.push({ k: 'cyl', x, z: 0.5, y: 0, r: 0.13, h: 0.85, seg: 6, c: 0x5d6168, col: 1 });
      parts.push({ k: 'cyl', x, z: 0.5, y: 0.85, r: 0.15, h: 0.12, seg: 6, c: 0xfbc02d });
    }
  }
  return { cx: cp.x, cz: cp.z, rot, y0, R, sw: road.sw, half, type: cp.type, road: road.id, parts, clear: R + road.sw + 1.5 };
}

// ---------------- índices espaciales ----------------
function nearProps(city, x, z) {
  const H = city._ph || (city._ph = { n: 0, m: new Map() });
  for (; H.n < city.props.length; H.n++) {
    const p = city.props[H.n], k = Math.floor(p.x / 16) * 4096 + Math.floor(p.z / 16);
    let a = H.m.get(k); if (!a) H.m.set(k, (a = [])); a.push(p);
  }
  const out = [], i0 = Math.floor(x / 16), j0 = Math.floor(z / 16);
  for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) { const a = H.m.get(i * 4096 + j); if (a) out.push(...a); }
  return out;
}
function nearLots(city, x, z) {
  if (!city._lh) {
    city._lh = new Map();
    for (const l of [...city.lots, ...city.sites]) {
      const r = Math.hypot(l.hx ?? l.w / 2, l.hz ?? l.d / 2);
      for (let i = Math.floor((l.cx - r) / 48); i <= Math.floor((l.cx + r) / 48); i++) for (let j = Math.floor((l.cz - r) / 48); j <= Math.floor((l.cz + r) / 48); j++) {
        const k = i * 4096 + j; let a = city._lh.get(k); if (!a) city._lh.set(k, (a = [])); a.push(l);
      }
    }
  }
  return city._lh.get(Math.floor(x / 48) * 4096 + Math.floor(z / 48)) || [];
}

// ¿Se puede poner un árbol/objeto aquí? (no frente a puertas ni cocheras, ni dentro de lotes o sitios)
function spotOK(city, x, z, front = 3, minGap = 2.6) {
  for (const sg of city.net.near(x - 12, z - 12, x + 12, z + 12)) {
    if (segDist(sg.ax, sg.az, sg.bx, sg.bz, x, z) < sg.road.w / 2 + 0.55) return false;
  }
  for (const p of nearProps(city, x, z)) {
    if (Math.abs(p.x - x) > 7 || Math.abs(p.z - z) > 7) continue;
    const d = Math.hypot(p.x - x, p.z - z);
    const min = p.type === 'busstop' ? 6 : p.type.startsWith('lamp') ? 3.2 : p.type === 'trafficLight' ? 4 : p.type === 'stopSign' ? 2.5 : minGap;
    if (d < min) return false;
  }
  for (const l of nearLots(city, x, z)) {
    const dx = x - l.cx, dz = z - l.cz;
    const c = Math.cos(l.rot), s = Math.sin(l.rot);
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    const hx = l.hx ?? l.w / 2, hz = l.hz ?? l.d / 2;
    if (Math.abs(lx) < hx + 0.6 && Math.abs(lz) < hz + 0.6) return false;
    if (l.access && Math.abs(lx) < hx + 0.5 && lz > hz - 2 && lz < hz + front + 2) {
      for (const ax of l.access) if (Math.abs(lx - ax) < 2.6) return false;
    }
  }
  for (const cp of city.caps) if (Math.hypot(cp.cx - x, cp.cz - z) < cp.clear + 2) return false;
  return true;
}

// ---------------- semáforos y señales de ALTO en los cruces del grafo vial ----------------
const MAJOR = new Set(['avenida', 'boulevard']);
function intersectionSigns(city, graph) {
  const { nodes } = graph;
  const segsOf = new Map();
  for (const sg of city.net.segs) { let a = segsOf.get(sg.road); if (!a) segsOf.set(sg.road, (a = [])); a.push(sg); }
  for (const n of nodes) {
    if (!n.out || n.out.length < 3) continue;
    const roads = n.out.map((o) => o.e.road);
    if (roads.some((r) => r.cls === 'glorieta')) continue;
    const anyMajor = roads.some((r) => MAJOR.has(r.cls));
    const count = (r) => roads.filter((q) => q === r).length;
    const minorIds = roads.filter((r) => count(r) >= 2).map((r) => r.id);
    const lowest = minorIds.length ? Math.min(...minorIds) : -1;
    for (const o of n.out) {
      const r = o.e.road;
      const to = nodes[o.to];
      const L = Math.hypot(to.x - n.x, to.z - n.z);
      if (L < 6) continue;
      const other = roads.filter((q) => q !== r).reduce((m, q) => Math.max(m, q.w / 2 + q.sw), 0);
      // se camina por la calle REAL (no en línea recta: en curvas el poste caería sobre el asfalto)
      const spot = (back) => alongRoad(segsOf.get(r) || [], n.x, n.z, to.x - n.x, to.z - n.z, back);
      const sp = spot(Math.min(L - 2, other + 2.2));
      if (!sp) continue;
      const kind = anyMajor ? (MAJOR.has(r.cls) || r.w >= 9 ? 'light' : 'stop') : null;
      // cruce con avenida: semáforos; las calles angostas de barrio llevan ALTO
      // cruce entre calles: ALTO a la calle que termina (T); en cruces de 4, a la de menor jerarquía
      const through = count(r) >= 2, allThrough = roads.every((q) => count(q) >= 2);
      const want = kind || (!through || (allThrough && r.id === lowest) ? 'stop' : null);
      if (!want) continue;
      for (const extra of [0, 1.5, 3, 5]) {
        const p = extra ? spot(Math.min(L - 1, other + 2.2 + extra)) : sp;
        if (p && (want === 'light' ? addLight(city, p, r) : addStop(city, p, r))) break;
      }
    }
  }
}
// Punto a "dist" metros del cruce (x,z) caminando por los tramos de la calle hacia (dx,dz).
// Devuelve posición, dirección del tráfico que LLEGA al cruce y lado derecho de ese tráfico.
function alongRoad(segs, x, z, dx, dz, dist) {
  let best = null;
  segs.forEach((sg, k) => { const { d, t } = segPointDist(sg.ax, sg.az, sg.bx, sg.bz, x, z); if (!best || d < best.d) best = { d, t, k }; });
  if (!best || best.d > 12) return null;
  const dir = segs[best.k].ux * dx + segs[best.k].uz * dz >= 0 ? 1 : -1;
  let k = best.k, s = best.t * segs[k].L, left = dist;
  for (;;) {
    const sg = segs[k];
    const room = dir > 0 ? sg.L - s : s;
    if (left <= room) {
      const sp = s + dir * left;
      const ux = -sg.ux * dir, uz = -sg.uz * dir;           // hacia el cruce
      return { x: sg.ax + sg.ux * sp, z: sg.az + sg.uz * sp, dx: ux, dz: uz, rx: -uz, rz: ux };
    }
    left -= room;
    let nk = k + dir;
    if (sg.road.closed) nk = (nk + segs.length) % segs.length;
    if (nk < 0 || nk >= segs.length) return null;
    const nxt = segs[nk];
    if (Math.hypot((dir > 0 ? nxt.ax : nxt.bx) - (dir > 0 ? sg.bx : sg.ax), (dir > 0 ? nxt.az : nxt.bz) - (dir > 0 ? sg.bz : sg.az)) > 0.5) return null;
    k = nk; s = dir > 0 ? 0 : nxt.L;
  }
}
// El poste debe quedar sobre la banqueta (o el acotamiento), nunca sobre el asfalto de NINGUNA calle
function curbSpotOK(city, x, z, margin) {
  if (!playable(x, z, 0) || city.sites.some((st) => rectContains(st, x, z, 0.5))) return false;
  for (const sg of city.net.near(x - 20, z - 20, x + 20, z + 20)) if (segDist(sg.ax, sg.az, sg.bx, sg.bz, x, z) < sg.road.w / 2 + margin) return false;
  return true;
}
function addLight(city, p, r) {
  const off = r.w / 2 + Math.max(0.6, Math.min(1.0, r.sw * 0.4));
  const x = p.x + p.rx * off, z = p.z + p.rz * off;
  if (!curbSpotOK(city, x, z, 0.45)) return false;
  if (nearProps(city, x, z).some((q) => q.type === 'trafficLight' && Math.hypot(q.x - x, q.z - z) < 7)) return true;
  city.props.push({ type: 'trafficLight', x, z, r: Math.atan2(-p.rx, -p.rz), col: 1 });
  return true;
}
function addStop(city, p, r) {
  const off = r.w / 2 + Math.max(0.5, Math.min(1.0, r.sw * 0.5));
  const x = p.x + p.rx * off, z = p.z + p.rz * off;
  if (!curbSpotOK(city, x, z, 0.3)) return false;
  if (nearProps(city, x, z).some((q) => q.type === 'stopSign' && Math.hypot(q.x - x, q.z - z) < 4)) return true;
  city.props.push({ type: 'stopSign', x, z, r: Math.atan2(-p.dx, -p.dz), col: 1 });
  return true;
}

// ---------------- faroles, árboles de banqueta, paradas, bancas, hidrantes y autos estacionados ----------------
const CAR_COLORS = [0xc0392b, 0x2c3e50, 0xecf0f1, 0x7f8c8d, 0x2980b9, 0x16a085, 0x8e44ad, 0xf39c12, 0x1b1b1b, 0xd35400];
function streetFurniture(city, net, seed) {
  const segsOf = new Map();
  for (const sg of net.segs) { let a = segsOf.get(sg.road); if (!a) segsOf.set(sg.road, (a = [])); a.push(sg); }
  for (const road of net.roads) {
    if (road.cls === 'glorieta') continue;
    const mid = road.pts[Math.floor(road.pts.length / 2)];
    const dist = road.district || districtAt(mid[0], mid[1]);
    const main = MAJOR.has(road.cls);
    const rural = RURAL.has(dist) || road.cls === 'subida';
    const lampGap = main ? 30 : rural ? 48 : 34;
    const style = road.cls === 'boulevard' ? 'lampDouble' : dist === 'centro' && !main ? 'lampColonial' : (dist === 'popular' || rural || dist === 'industrial' || dist === 'puerto') ? 'lampWood' : 'lamp';
    let sLamp = 4, sTree = 7, sBus = 120, sHyd = 30, acc = 0;
    for (const seg of segsOf.get(road) || []) {
      const half = road.w / 2;
      const swMid = half + road.sw / 2;
      const blockedL = net.blockedIntervals(seg, swMid, 2);
      const blockedR = net.blockedIntervals(seg, -swMid, 2);
      const isFree = (t, side) => !(side > 0 ? blockedL : blockedR).some(([a, b]) => t >= a - 0.02 && t <= b + 0.02);
      const at = (s, off, side) => [seg.ax + seg.ux * s - seg.uz * off * side, seg.az + seg.uz * s + seg.ux * off * side];
      // faroles (alternando lados)
      for (let s = sLamp; s < seg.L; s += lampGap) {
        const side = Math.floor((acc + s) / lampGap) % 2 === 0 ? 1 : -1;
        if (!isFree(s / seg.L, side)) continue;
        const off = road.sw >= 1.2 ? half + road.sw - 0.5 : half + 0.8;
        const [x, z] = at(s, off, side);
        if (!road.bridge && !playable(x, z, 0)) continue;
        if (road.bridge ? city.net.near(x - 20, z - 20, x + 20, z + 20).some((sg) => segDist(sg.ax, sg.az, sg.bx, sg.bz, x, z) < sg.road.w / 2 + 0.4) : !curbSpotOK(city, x, z, 0.4)) continue;
        if (nearProps(city, x, z).some((q) => (q.type === 'trafficLight' || q.type === 'stopSign') && Math.hypot(q.x - x, q.z - z) < 6)) continue;
        city.props.push({ type: style, x, z, r: Math.atan2(seg.uz * side, -seg.ux * side) + Math.PI, col: 0 });
      }
      sLamp = (((sLamp - seg.L) % lampGap) + lampGap) % lampGap;
      // árboles de banqueta (junto al bordillo, lejos de cruces y entradas)
      if (road.sw >= 2.4 && !road.bridge) {
        const D = DISTRICTS[dist] || {};
        const kinds = road.cls === 'boulevard' ? ['palm'] : D.trees || [];
        const gap = dist === 'centro' || dist === 'comercial' ? 12 : 15;
        if (kinds.length) {
          const bl = net.blockedIntervals(seg, swMid, 9), br = net.blockedIntervals(seg, -swMid, 9);
          const treeFree = (t, side) => !(side > 0 ? bl : br).some(([a, b]) => t >= a && t <= b);
          for (let s = sTree; s < seg.L; s += gap) {
            for (const side of [1, -1]) {
              if (!treeFree(s / seg.L, side)) continue;
              const h = hashInts(seed, Math.round((seg.ax + s) * 3), Math.round(seg.az * 3), side);
              if (h % 10 < 3) continue;
              const [x, z] = at(s, half + Math.min(1.1, road.sw * 0.4), side);
              if (!playable(x, z, 0) || !spotOK(city, x, z, road.sw)) continue;
              // el tronco se inclina hacia la banqueta (lado contrario a la calle), nunca sobre los carriles
              const ox = -seg.uz * side, oz = seg.ux * side;
              const lean = Math.atan2(-oz, ox) + ((h % 60) - 30) / 100;
              city.props.push({ type: kinds[h % kinds.length], x, z, r: lean, sc: 0.85 + (h % 30) / 100, col: 1, street: 1 });
            }
          }
        }
        sTree = (((sTree - seg.L) % gap) + gap) % gap;
      }
      // paradas de autobús sobre las avenidas
      if (main) {
        for (let s = sBus; s < seg.L; s += 220) {
          if (!isFree(s / seg.L, 1)) continue;
          const [x, z] = at(s, half + road.sw * 0.5, 1);
          if (!playable(x, z, 0) || !spotOK(city, x, z, 1, 3)) continue;
          city.props.push({ type: 'busstop', x, z, r: Math.atan2(seg.uz, -seg.ux) + Math.PI, col: 1 });
        }
        sBus = (((sBus - seg.L) % 220) + 220) % 220;
      }
      // hidrantes en las banquetas de la ciudad
      if (road.sw >= 1.5 && !rural) {
        for (let s = sHyd; s < seg.L; s += 75) {
          if (!isFree(s / seg.L, -1)) continue;
          const [x, z] = at(s, half + 0.75, -1);
          if (spotOK(city, x, z, 2, 1.5)) city.props.push({ type: 'hydrant', x, z, r: 0, det: 1, col: 0 });
        }
        sHyd = (((sHyd - seg.L) % 75) + 75) % 75;
      }
      // bancas y basureros en el centro y los malecones
      if ((dist === 'centro' || dist === 'costa' || road.cls === 'boulevard') && road.sw >= 3) {
        for (let s = 11; s < seg.L; s += 40) {
          if (!isFree(s / seg.L, -1)) continue;
          const [x, z] = at(s, half + road.sw - 0.6, -1);
          if (!spotOK(city, x, z, 2, 2)) continue;
          city.props.push({ type: 'bench', x, z, r: Math.atan2(-seg.uz, seg.ux) + Math.PI / 2, det: 1, col: 0 });
          const [bx, bz] = at(s + 2, half + road.sw - 0.6, -1);
          city.props.push({ type: 'bin', x: bx, z: bz, det: 1, col: 0 });
        }
      }
      // autos estacionados junto a la banqueta en calles de barrio
      if (road.district && road.w >= 7 && !rural && dist !== 'industrial') {
        for (let s = 9; s < seg.L - 9; s += 11) {
          const h = hashInts(seed, Math.round(seg.ax * 7 + s), Math.round(seg.az * 7), 77);
          if (h % 100 > (dist === 'popular' ? 30 : 22)) continue;
          const side = h % 2 ? 1 : -1;
          const off = half - 1.1;
          if (net.blockedIntervals(seg, off * side, 6).some(([a, b]) => s / seg.L >= a - 0.05 && s / seg.L <= b + 0.05)) continue;
          const [x, z] = at(s, off, side);
          city.props.push({ type: 'car', x, z, r: Math.atan2(seg.ux, seg.uz) + (side > 0 ? 0 : Math.PI), c: CAR_COLORS[h % CAR_COLORS.length], v: h % 3, col: 1 });
        }
      }
      acc += seg.L;
    }
  }
}

// ---------------- playas y costa ----------------
function beachAndSea(city, seed) {
  let k = 0;
  const palapas = ['Palapa El Coco', 'Palapa Brisa Marina', 'Palapa La Sirena', 'Palapa Sol y Mar', 'Palapa El Delfín', 'Palapa Las Olas', 'Palapa Coral', 'Palapa El Pelícano'];
  let nPal = 0;
  for (const line of city.coast || coastLines()) {
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1], b = line[i];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let s = 0; s < L; s += 7) {
        k++;
        const x = a[0] + (b[0] - a[0]) * (s / L), z = a[1] + (b[1] - a[1]) * (s / L);
        if (!inWorld(x, z, 10)) continue;
        // normal hacia tierra (gradiente de la distancia a la costa)
        let nx = landDist(x + 3, z) - landDist(x - 3, z), nz = landDist(x, z + 3) - landDist(x, z - 3);
        const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
        const h = hashInts(seed, k, 31);
        const at = (d) => [x + nx * d, z + nz * d];
        const sandy = isSandy(x + nx * 12, z + nz * 12);
        if (sandy) {
          if (h % 3 === 0) {
            const [ux, uz] = at(10 + (h % 14));
            if (playable(ux, uz, 0) && spotOK(city, ux, uz, 1, 3)) {
              city.props.push({ type: 'umbrellaBeach', x: ux, z: uz, r: Math.atan2(nx, nz), c: [0xe53935, 0xfdd835, 0x1e88e5, 0x43a047, 0xff7043, 0xffffff][h % 6], det: 1, col: 0 });
              city.props.push({ type: 'towel', x: ux + nz * 1.4, z: uz - nx * 1.4, r: Math.atan2(nx, nz), c: [0x26c6da, 0xf06292, 0xffee58, 0x9575cd][h % 4], det: 1, col: 0 });
            }
          }
          if (k % 17 === 5) { const [lx, lz] = at(20); if (playable(lx, lz, 0) && spotOK(city, lx, lz, 1, 4)) city.props.push({ type: 'lifeguard', x: lx, z: lz, r: Math.atan2(-nx, -nz), col: 1 }); }
          if (k % 23 === 11) {
            const [px, pz] = at(30);
            if (playable(px, pz, 2) && isSandy(px, pz) && spotOK(city, px, pz, 1, 6) && city.net.clearance(px, pz).c > 6 && !city.blocks.some((b) => pointInPoly(b.poly, px, pz))) {
              const name = palapas[nPal++ % palapas.length];
              city.props.push({ type: 'palapa', x: px, z: pz, r: Math.atan2(-nx, -nz), col: 1, name });
              city.pickups.push({ id: city.pickups.length, x: px + nx * 6, z: pz + nz * 6, name });
            }
          }
          if (k % 2 === 0) { const [qx, qz] = at(36 + (h % 12)); if (playable(qx, qz, 0) && spotOK(city, qx, qz, 1, 5)) city.props.push({ type: 'palm', x: qx, z: qz, r: h % 6, sc: 1.05 + (h % 40) / 100, col: 1 }); }
          if (h % 19 === 0) { const [bx, bz] = at(-45 - (h % 50)); if (landDist(bx, bz) < -20) city.props.push({ type: 'sailboat', x: bx, z: bz, y: 0, r: (h % 628) / 100, col: 0 }); }
          if (k % 9 === 0) { const [bx, bz] = at(-14); city.props.push({ type: 'buoy', x: bx, z: bz, y: 0, col: 0, det: 1 }); }
        } else if (h % 4 === 0) {
          // costa rocosa
          const [rx, rz] = at(-1 + (h % 4));
          if (city.net.clearance(rx, rz).c > 2) city.props.push({ type: 'rock', x: rx, z: rz, r: h % 6, sc: 0.7 + ((h >>> 8) % 100) / 90, col: 0 });
        }
      }
    }
  }
}

// ---------------- vegetación natural (bosques en la sierra, jardines en los barrios) ----------------
const DENSITY = { montana: 0.3, presa: 0.3, exclusiva: 0.12, campo: 0.24, isla: 0.2, media: 0.02, residencial: 0.03, popular: 0.015, centro: 0, comercial: 0, sur: 0.01, industrial: 0.01, costa: 0.02, playa: 0.02, aeropuerto: 0, puerto: 0, prision: 0.03 };
function vegetation(city, net, seed) {
  const hm = city.hm;
  const STEP = 13;
  const ends = [];
  for (const r of net.roads) if (!r.closed) ends.push(r.pts[0], r.pts[r.pts.length - 1]);
  const nearEnd = (x, z) => ends.some((e) => Math.abs(e[0] - x) < 14 && Math.abs(e[1] - z) < 14);
  for (let gz = -640; gz < 620; gz += STEP) {
    for (let gx = -780; gx < 800; gx += STEP) {
      const h = hashInts(seed, gx, gz, 9001);
      const x = gx + ((h % 1000) / 1000 - 0.5) * STEP * 0.9;
      const z = gz + (((h >>> 10) % 1000) / 1000 - 0.5) * STEP * 0.9;
      if (!inWorld(x, z, -40)) continue;
      const y = hm.height(x, z);
      if (y < 1.6 || lakeDist(x, z) > -3) continue;
      const inside = playable(x, z, 2);
      let density, kinds;
      if (!inside) {
        if (landDist(x, z) < 6) continue;
        density = 0.45; kinds = ['pine', 'pine', 'oak', 'pine', 'bush'];
      } else {
        const dist = districtAt(x, z);
        density = DENSITY[dist] ?? 0.1;
        const t = DISTRICTS[dist] && DISTRICTS[dist].trees;
        kinds = t && t.length ? [...t, 'bush'] : ['round', 'bush'];
        if (isSandy(x, z)) continue;
      }
      if (((h >>> 20) % 1000) / 1000 > density) continue;
      if (inside) {
        if (net.clearance(x, z).c < 3.5) continue;
        if (nearEnd(x, z)) continue;
        if (!spotOK(city, x, z, 3, 2.5)) continue;
      }
      const type = kinds[(h >>> 4) % kinds.length];
      city.props.push({ type, x, z, y, r: (h % 628) / 100, sc: 0.85 + ((h >>> 7) % 50) / 100 + (inside ? 0 : 0.3), col: inside && type !== 'bush' ? 1 : 0 });
    }
  }
}

function buildColliders(city) {
  const cols = city.colliders;
  const addPart = (o, p, y0) => {
    const c = Math.cos(o.rot || 0), s = Math.sin(o.rot || 0);
    const wx = o.cx + p.x * c + p.z * s, wz = o.cz - p.x * s + p.z * c;
    const base = y0 + (p.y || 0);
    if (p.k === 'box') {
      cols.push({ cx: wx, cz: wz, hx: p.w / 2, hz: p.d / 2, rot: (o.rot || 0) + (p.r || 0), minY: (p.y || 0) === 0 ? base - 1.5 : base, maxY: base + Math.max(p.h, p.colH || 0) });
    } else if (p.k === 'cyl') {
      cols.push({ cx: wx, cz: wz, hx: p.r * 0.85, hz: p.r * 0.85, rot: 0, minY: base - 1, maxY: base + p.h });
    } else if (p.k === 'fence') {
      const x1 = o.cx + p.x * c + p.z * s, z1 = o.cz - p.x * s + p.z * c;
      const x2 = o.cx + p.x2 * c + p.z2 * s, z2 = o.cz - p.x2 * s + p.z2 * c;
      const L = Math.hypot(x2 - x1, z2 - z1);
      if (L < 0.2) return;
      const th = p.s === 'hedge' ? 0.45 : p.s === 'wall' ? 0.25 : 0.12;
      cols.push({ cx: (x1 + x2) / 2, cz: (z1 + z2) / 2, hx: L / 2, hz: th, rot: Math.atan2(-(z2 - z1), x2 - x1), minY: base - 1, maxY: base + Math.max(p.h, p.colH || 0) });
    } else if (p.k === 'prop') {
      const pc = PROP_COL[p.type];
      if (!pc || pc[0] === 0) return;
      const sc = p.sc || 1;
      cols.push({ cx: wx, cz: wz, hx: pc[0] * sc, hz: pc[1] * sc, rot: (o.rot || 0) + (p.r || 0), minY: base - 0.5, maxY: base + pc[2] * sc });
    }
  };
  for (const lot of city.lots) for (const p of lot.parts) if (p.col) addPart(lot, p, lot.y0);
  for (const site of city.sites) for (const p of site.parts) if (p.col) addPart(site, p, site.y0);
  for (const cp of city.caps) for (const p of cp.parts) if (p.col) addPart(cp, p, cp.y0);
  for (const pr of city.props) {
    if (!pr.col) continue;
    if (pr.type === 'palapa') { cols.push({ cx: pr.x, cz: pr.z, hx: 0.4, hz: 0.4, rot: 0, minY: pr.y - 1, maxY: pr.y + 3 }); continue; }
    const pc = PROP_COL[pr.type];
    if (!pc || pc[0] === 0) continue;
    const sc = pr.sc || 1;
    const scale = ['car', 'containers', 'crane', 'busstop', 'lifeguard', 'bus', 'plane'].includes(pr.type) ? 1 : Math.min(sc, 1.3);
    cols.push({ cx: pr.x, cz: pr.z, hx: pc[0] * scale, hz: pc[1] * scale, rot: pr.r || 0, minY: pr.y - 0.5, maxY: pr.y + pc[2] * scale });
  }
}
