// Generador urbano de las ciudades nuevas (Ciudad Desértica, Ciudad Montañosa...).
// Mismo proceso que Puerto Nova pero con su propio plano (shared/citiesPlan.js), su propia red de
// calles y su propia malla fina de 4 m:
//   1. malla fina tomada del terreno ya nivelado (periférico incluido)
//   2. avenidas diseñadas + glorietas, aplanadas; luego calles de barrio con la trama de cada barrio
//      (orientación, separación, ondulación), sin calles sueltas y todas unidas al periférico
//   3. manzanas -> lugares importantes -> lotes en cada frente -> edificios (mismas reglas por barrio)
//   4. señales, faroles y árboles de banqueta
// Los lotes, lugares y retornos se agregan a la ciudad (city.lots/sites/caps) marcados con `city`.

import { RoadNet, smoothPath, cutByCircle, resolveDeadEnds, keepConnected, segSegIntersect, rectContains } from './roads.js';
import { buildBlocks, frontages, runAt, rayToPoly, rectInPoly } from './blocks.js';
import { Heightmap, playable, pointInPoly, polyDist } from './terrain.js';
import { Rng, hashInts } from './rng.js';
import * as B from './buildings.js';
import { flattenRoads, buildCap, chooseArch, fitSite, intersectionSigns, streetFurniture, freeRects, interiorKind, dropOnRoad, obbOverlap, toWorld, buildColliders, ARCH, DEEP, CENTER, SITE_BUILDERS } from './city.js';
import { URBAN_PLANS } from './citiesPlan.js';

export function generateUrban(city, plan) {
  const seed = plan.seed;
  const ring = city.highways.roads.find((r) => r.id === plan.ring);
  // ---------- 1. malla fina sobre el terreno ya nivelado ----------
  const hm = Heightmap.sampled(plan.box, 4, (x, z) => city.height(x, z));
  // el periférico ya está nivelado: sus celdas no se tocan y las calles que llegan toman su altura
  const ringHalf = ring.spec.w / 2 + ring.spec.sh + 1;
  for (let i = 0; i < ring.pts.length; i++) {
    const [x, z] = ring.pts[i];
    for (let dz = -ringHalf; dz <= ringHalf; dz += 2) for (let dx = -ringHalf; dx <= ringHalf; dx += 2) {
      const gi = Math.round((x + dx - hm.x0) / hm.res), gj = Math.round((z + dz - hm.z0) / hm.res);
      if (gi < 0 || gj < 0 || gi >= hm.nx || gj >= hm.nz) continue;
      const px = hm.x0 + gi * hm.res, pz = hm.z0 + gj * hm.res;
      if (Math.hypot(px - x, pz - z) < ringHalf) hm.mask[gj * hm.nx + gi] = 1;
    }
  }
  const ringPoly = ring.pts;
  const insideRing = ringDistance(hm, ringPoly);   // (x, z, m): dentro del periférico con margen m

  // ---------- 2. calles ----------
  const net = new RoadNet();
  const ringRoad = net.add(ring.name, 'avenida', ring.pts.map((p) => [p[0], p[1]]), { closed: true, w: ring.spec.w, sw: ring.spec.sh });
  ringRoad.external = true; ringRoad.flat = true;   // lo construye y dibuja highways.js
  const reserved = plan.sites.map((s) => ({ id: s.id, cx: s.at[0], cz: s.at[1], hx: s.hx + 3, hz: s.hz + 3, rot: 0, kind: s.kind }));
  for (const m of plan.mains) {
    let pieces = [clipToPoly(smoothPath(m.pts, false), ringPoly)];
    for (const g of plan.roundabouts) pieces = pieces.flatMap((pc) => { const cut = cutByCircle(pc, g.at[0], g.at[1], g.r); return cut.length ? cut : [pc]; });
    for (const pc of pieces) if (pc.length >= 2) net.add(m.name, m.cls, pc, { district: null }).main = true;
  }
  for (const g of plan.roundabouts) {
    const pts = [];
    for (let k = 0; k < 28; k++) { const a = (k / 28) * Math.PI * 2; pts.push([g.at[0] + Math.sin(a) * g.r, g.at[1] + Math.cos(a) * g.r]); }
    net.add(g.name, 'glorieta', pts, { closed: true }).roundabout = g;
  }
  flattenRoads(hm, net.roads.filter((r) => !r.external));
  for (const r of net.roads) r.flat = true;
  const slopeAt = (x, z, dx, dz) => Math.abs(hm.height(x + dx * 4, z + dz * 4) - hm.height(x, z)) / 4;
  localStreets(net, plan, reserved, insideRing, slopeAt);
  const okPath = (x, z, dx, dz) => insideRing(x, z, 6) && playable(x, z, 6) && !reserved.some((r) => rectContains(r, x, z, 3)) && slopeAt(x, z, dx, dz) < 0.2;
  resolveDeadEnds(net, reserved, okPath);
  keepConnected(net, ring.name);
  flattenRoads(hm, net.roads.filter((r) => !r.flat && !r.external));
  for (const r of net.roads) for (const cp of r.caps) city.caps.push({ ...buildCap(r, cp, hm), city: plan.id });

  // ---------- 3. manzanas ----------
  const zoneAt = (x, z) => { for (const zn of plan.zones) if (pointInPoly(zn.pts, x, z)) return zn.id; return 'residencial'; };
  for (const r of net.roads) if (!r.district) { const m = r.pts[Math.floor(r.pts.length / 2)]; r.district = r.external ? null : zoneAt(m[0], m[1]); }
  const { blocks, graph } = buildBlocks(net);
  for (const b of blocks) {
    let cx = 0, cz = 0;
    for (const p of b.poly) { cx += p[0] / b.poly.length; cz += p[1] / b.poly.length; }
    b.cx = cx; b.cz = cz; b.district = zoneAt(cx, cz);
  }
  // índice de terrenos ocupados
  const lotIndex = new Map(), LCELL = 32;
  const cells = (q, fn) => { const r = Math.hypot(q.hx, q.hz); for (let i = Math.floor((q.cx - r) / LCELL); i <= Math.floor((q.cx + r) / LCELL); i++) for (let j = Math.floor((q.cz - r) / LCELL); j <= Math.floor((q.cz + r) / LCELL); j++) fn(i * 7919 + j); };
  const overlaps = (q, m = 0.12) => { let hit = false; cells(q, (k) => { const a = lotIndex.get(k); if (!hit && a) for (const o of a) if (obbOverlap(q, o, m)) { hit = o; break; } }); return hit; };
  const addIndex = (q) => cells(q, (k) => { let a = lotIndex.get(k); if (!a) lotIndex.set(k, (a = [])); a.push(q); });
  for (const cp of city.caps) if (cp.city === plan.id) addIndex({ cx: cp.cx, cz: cp.cz, hx: cp.clear, hz: cp.clear, rot: cp.rot, tag: 'cap' });

  // ---------- 4a. lugares importantes ----------
  const placed = [];
  for (const def of plan.sites) {
    const q = fitSite(def, blocks, overlaps, net);
    if (!q) continue;
    addIndex({ ...q, hx: q.hx + 1, hz: q.hz + 1, tag: 'site' });
    q.y0 = Math.max(1.4, hm.averageRect(q.cx, q.cz, q.hx, q.hz, q.rot).avg);
    hm.flattenRect(q.cx, q.cz, q.hx + 1, q.hz + 1, q.rot, q.y0, 6, true);
    placed.push({ def, q });
  }

  // ---------- 4b. lotes en los frentes de cada manzana ----------
  const lots = [];
  const validLot = (q, b, type) => {
    if (!rectInPoly(b.poly, q, 0.2) || overlaps(q, -0.08)) return false;
    if (net.rectHitsRoad(q.cx, q.cz, q.hx - 0.25, q.hz - 0.25, q.rot, 0)) return false;
    const c = Math.cos(q.rot), s = Math.sin(q.rot);
    for (const [fx, fz] of [[0, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const x = q.cx + fx * q.hx * c + fz * q.hz * s, z = q.cz - fx * q.hx * s + fz * q.hz * c;
      if (!playable(x, z, 0.5) || !insideRing(x, z, 2)) return false;
    }
    const st = hm.averageRect(q.cx, q.cz, q.hx, q.hz, q.rot);
    const maxSlope = type === 'villa' || type === 'hacienda' ? 8 : type === 'casaMedia' || type === 'casaHumilde' ? 5 : 3.5;
    return st.max - st.min <= maxSlope && st.min >= 0.9;
  };
  // el "centro" de esta ciudad cuenta como el de Puerto Nova para elegir torres (más bajas: x1.6)
  const asPN = (b) => ({ cx: CENTER[0] + (b.cx - plan.center[0]) * 1.6, cz: CENTER[1] + (b.cz - plan.center[1]) * 1.6 });
  for (const b of blocks) {
    const runs = frontages(b);
    runs.forEach((run, ri) => {
      if (run.len < 8) return;
      let s = 0.6;
      while (s < run.len - 6) {
        const corner = s < 3 || s > run.len - 17;
        const h = hashInts(seed, b.id, Math.round(s * 10), ri);
        const arch = chooseArch(b.district, { corner, road: run.road, b: asPN(b), h });
        if (!arch) { s += 12; continue; }
        const A = ARCH[arch.type];
        const rng = new Rng(h ^ 0x5bd1e995);
        const w0 = rng.float(A.w[0], A.w[1]);
        const want = DEEP[arch.type] ? Math.max(rng.float(A.d[0], A.d[1]), DEEP[arch.type]) : rng.float(A.d[0], A.d[1]);
        let ok = false;
        for (const wf of [1, 0.82, 0.68]) {
          let w = Math.max(A.w[0] * 0.8, w0 * wf);
          if (s + w > run.len - 0.4) { w = run.len - 0.4 - s; if (w < A.w[0] * 0.8) break; }
          const c = runAt(run, s + w / 2, b.sgn);
          const avail = rayToPoly(b.poly, c.x + c.nx * 0.3, c.z + c.nz * 0.3, c.nx, c.nz);
          const maxD = avail > A.d[0] * 2 + 2 ? avail / 2 - 0.2 : avail - 0.6;
          let d = Math.min(want, maxD);
          for (let tries = 0; tries < 4 && !ok && d >= A.d[0] * 0.75; tries++) {
            const q = { cx: c.x + c.nx * (d / 2 + 0.05), cz: c.z + c.nz * (d / 2 + 0.05), hx: w / 2, hz: d / 2, rot: Math.atan2(-c.nx, -c.nz) };
            if (validLot(q, b, arch.type)) {
              const st = hm.averageRect(q.cx, q.cz, q.hx, q.hz, q.rot);
              lots.push({ type: arch.type, sub: arch.sub, district: b.district, block: b.id, cx: q.cx, cz: q.cz, rot: q.rot, w, d, y0: Math.max(1.0, st.avg), seed: rng.int(0, 1e9), corner, city: plan.id });
              q.tag = 'lot'; addIndex(q);
              s += w + A.gap;
              ok = true;
            } else d *= 0.85;
          }
          if (ok) break;
        }
        if (!ok) s += 1.5;
      }
    });
  }

  // ---------- 5. edificios ----------
  for (const lot of lots) hm.flattenRect(lot.cx, lot.cz, lot.w / 2, lot.d / 2, lot.rot, lot.y0, 3, true);
  const counters = {};
  const nextName = (type) => { const list = B.NAMES[type] || B.NAMES.shop; counters[type] = (counters[type] || 0) + 1; return list[(counters[type] * 7 + seed) % list.length]; };
  for (const lot of lots) {
    const res = lotParts(lot, new Rng(lot.seed), nextName);
    lot.parts = res.parts;
    lot.access = [res.door[0], ...(res.drive || [])];
    if (lot.type === 'casaHumilde' && res.shop) {
      lot.name = nextName('tienda');
      lot.parts.push({ k: 'sign', x: 0, z: lot.d / 2 - 0.1, y: 2.45, w: Math.min(lot.w * 0.8, 5), h: 0.6, text: lot.name, bg: '#f9a825', fg: '#3e2723', r: 0 });
    }
    lot.id = city.lots.length;
    city.lots.push(lot);
  }
  // corazón de manzana: patios, estacionamientos, parques y canchas
  for (const b of blocks) {
    if (b.area < 500) continue;
    for (const q of freeRects(b, city, lotIndex, LCELL)) {
      const kind = interiorKind(b.district, q);
      if (!kind) continue;
      const st = hm.averageRect(q.cx, q.cz, q.hx, q.hz, q.rot);
      if (st.max - st.min > 4.5 || !playable(q.cx, q.cz, 1) || !insideRing(q.cx, q.cz, 4) || net.rectHitsRoad(q.cx, q.cz, q.hx, q.hz, q.rot, 0.2)) continue;
      q.tag = 'int'; addIndex(q);
      hm.flattenRect(q.cx, q.cz, q.hx, q.hz, q.rot, st.avg, 2, true);
      q.y0 = st.avg;
      placed.push({ def: { id: `${plan.id}_int${b.id}_${placed.length}`, kind, name: '', interior: true }, q });
    }
  }
  for (const { def, q } of placed) {
    const fn = SITE_BUILDERS[def.kind];
    if (!fn) continue;
    const s = { id: def.id, kind: def.kind, name: def.name, interior: def.interior, cx: q.cx, cz: q.cz, hx: q.hx, hz: q.hz, rot: q.rot };
    const res = fn(s, new Rng(hashInts(seed, Math.round(q.cx), Math.round(q.cz))));
    city.sites.push({ ...s, parts: dropOnRoad(net, s, res.parts), y0: q.y0 ?? hm.height(q.cx, q.cz), city: plan.id });
  }
  for (const g of plan.roundabouts) {
    const road = net.roads.find((r) => r.roundabout === g);
    const inner = g.r - (road ? road.w / 2 : 5.5) - 0.6;
    const site = { id: `${plan.id}_glorieta`, kind: 'glorieta', name: g.name, cx: g.at[0], cz: g.at[1], hx: inner, hz: inner, rot: 0, deco: g.deco, interior: true, city: plan.id };
    site.parts = SITE_BUILDERS.glorieta(site).parts;
    site.y0 = hm.height(g.at[0], g.at[1]);
    city.sites.push(site);
  }

  // ---------- 6. señales, faroles y árboles (con la red de esta ciudad) ----------
  const sub = Object.create(city);
  sub.net = net; sub._ph = undefined; sub._lh = undefined;
  intersectionSigns(sub, graph);
  streetFurniture(sub, { ...net, roads: net.roads.filter((r) => !r.external), segs: net.segs, near: net.near.bind(net), blockedIntervals: net.blockedIntervals.bind(net) }, seed);
  for (const p of city.props) if (p.y === undefined && hm.x0 <= p.x && p.x <= hm.x0 + (hm.nx - 1) * hm.res && hm.z0 <= p.z && p.z <= hm.z0 + (hm.nz - 1) * hm.res) p.y = hm.height(p.x, p.z);

  city.world.addFine(hm);
  return { id: plan.id, name: plan.name, box: plan.box, center: plan.center, hm, net, blocks: blocks.map((b) => ({ id: b.id, poly: b.poly, district: b.district, area: b.area })), lots: lots.length };
}

// ---------- generación en segundo plano (Web Worker del cliente) ----------
// Lo que necesita el worker: el plano, el periférico y las alturas de la malla gruesa en el área
export function urbanInput(city, plan) {
  const ring = city.highways.roads.find((r) => r.id === plan.ring), C = city.world.coarse;
  const box = { x0: plan.box.x0 - C.res, z0: plan.box.z0 - C.res, x1: plan.box.x1 + C.res, z1: plan.box.z1 + C.res };
  const sub = Heightmap.sampled(box, C.res, (x, z) => C.h[Math.round((z - C.z0) / C.res) * C.nx + Math.round((x - C.x0) / C.res)]);
  return { planId: plan.id, ring: { id: ring.id, name: ring.name, spec: ring.spec, pts: ring.pts }, coarse: { box, h: sub.h } };
}
// En el worker: genera la ciudad sola (sin el resto del mundo) y devuelve datos simples
export function generateUrbanStandalone(input) {
  const plan = URBAN_PLANS.find((p) => p.id === input.planId);
  const C = Heightmap.sampled(input.coarse.box, 8, () => 0);
  C.h.set(input.coarse.h);
  const ctx = { height: (x, z) => C.height(x, z), highways: { roads: [input.ring] }, lots: [], sites: [], caps: [], props: [], world: { addFine() {} } };
  const u = generateUrban(ctx, plan);
  const roads = u.net.roads.map((r) => ({ name: r.name, cls: r.cls, w: r.w, sw: r.sw, mark: r.mark, pts: r.pts, closed: r.closed, district: r.district, caps: r.caps, external: !!r.external, main: !!r.main, roundabout: r.roundabout || null }));
  const hm = { x0: u.hm.x0, z0: u.hm.z0, res: u.hm.res, nx: u.hm.nx, nz: u.hm.nz, h: u.hm.h, mask: u.hm.mask };
  return { id: u.id, name: u.name, box: u.box, center: u.center, blocks: u.blocks, hm, roads, lots: ctx.lots, sites: ctx.sites, caps: ctx.caps, props: ctx.props };
}
// En el cliente: integra el resultado del worker a la ciudad (terreno, calles, lotes, objetos y
// colisiones). Devuelve las colisiones nuevas (ya agregadas a city.colliders).
export function mergeUrban(city, pkg) {
  const hm = Object.assign(Object.create(Heightmap.prototype), pkg.hm);
  const net = new RoadNet();
  for (const r of pkg.roads) {
    const road = net.add(r.name, r.cls, r.pts, { closed: r.closed, w: r.w, sw: r.sw, mark: r.mark, district: r.district });
    road.caps = r.caps; road.external = r.external; road.main = r.main; road.roundabout = r.roundabout;
  }
  for (const lot of pkg.lots) { lot.id = city.lots.length; city.lots.push(lot); }
  city.sites.push(...pkg.sites);
  city.caps.push(...pkg.caps);
  city.props.push(...pkg.props);
  city.world.addFine(hm);
  const start = city.colliders.length;
  buildColliders(city, { lots: pkg.lots, sites: pkg.sites, caps: pkg.caps, props: pkg.props });
  const u = { id: pkg.id, name: pkg.name, box: pkg.box, center: pkg.center, hm, net, blocks: pkg.blocks, lots: pkg.lots.length };
  city.urban.push(u);
  return { urban: u, colliderStart: start };
}

// Distancia (con signo) al periférico en la malla fina: + adentro. Se calcula una vez por
// renglones (cruces con el polígono) y estampando los tramos del anillo hasta 48 m.
function ringDistance(hm, poly) {
  const { nx, nz, x0, z0, res } = hm, D = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) {
    const z = z0 + j * res, xs = [];
    for (let k = 0; k < poly.length; k++) {
      const a = poly[k], b = poly[(k + 1) % poly.length];
      if ((a[1] > z) !== (b[1] > z)) xs.push(a[0] + ((z - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
    }
    xs.sort((p, q) => p - q);
    for (let i = 0, c = 0; i < nx; i++) {
      const x = x0 + i * res;
      while (c < xs.length && xs[c] < x) c++;
      D[j * nx + i] = c % 2 ? 48 : -48;
    }
  }
  for (let k = 0; k < poly.length; k++) {
    const a = poly[k], b = poly[(k + 1) % poly.length];
    const i0 = Math.max(0, Math.floor((Math.min(a[0], b[0]) - 48 - x0) / res)), i1 = Math.min(nx - 1, Math.ceil((Math.max(a[0], b[0]) + 48 - x0) / res));
    const j0 = Math.max(0, Math.floor((Math.min(a[1], b[1]) - 48 - z0) / res)), j1 = Math.min(nz - 1, Math.ceil((Math.max(a[1], b[1]) + 48 - z0) / res));
    const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = x0 + i * res, z = z0 + j * res;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2));
      const d = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t), q = j * nx + i;
      if (d < Math.abs(D[q])) D[q] = D[q] > 0 ? d : -d;
    }
  }
  return (x, z, m) => {
    const i = Math.round((x - x0) / res), j = Math.round((z - z0) / res);
    return i >= 0 && j >= 0 && i < nx && j < nz && D[j * nx + i] > m;
  };
}

// Recorta una línea al interior del periférico (de su primer a su último cruce con él)
function clipToPoly(path, poly) {
  const hits = [];
  let acc = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let k = 0; k < poly.length; k++) {
      const h = segSegIntersect(a, b, poly[k], poly[(k + 1) % poly.length]);
      if (h) hits.push({ s: acc + h.t * L, p: [h.x, h.z], i });
    }
    acc += L;
  }
  const inside0 = pointInPoly(poly, path[0][0], path[0][1]), inside1 = pointInPoly(poly, path[path.length - 1][0], path[path.length - 1][1]);
  hits.sort((p, q) => p.s - q.s);
  const first = inside0 ? null : hits[0], last = inside1 ? null : hits[hits.length - 1];
  const out = [];
  if (first) out.push(first.p);
  for (let i = 0; i < path.length; i++) {
    if (first && i <= first.i) continue;
    if (last && i > last.i) break;
    out.push(path[i]);
  }
  if (last) out.push(last.p);
  return out;
}

// Calles de barrio: familias de líneas paralelas (y perpendiculares) con la trama de cada barrio
function localStreets(net, plan, reserved, insideRing, slopeAt) {
  const mains = new Set(net.segs);
  const isReserved = (x, z, m) => reserved.some((r) => rectContains(r, x, z, m));
  const nearParallelMain = (x, z, ux, uz) => {
    for (const s of net.near(x - 40, z - 40, x + 40, z + 40)) {
      if (!mains.has(s)) continue;
      const d = segDistP(s, x, z);
      if (d < s.half + 22 && Math.abs(s.ux * ux + s.uz * uz) > 0.85) return true;
      if (d < s.half + 3) return true;
    }
    return false;
  };
  for (const zn of plan.zones) {
    const rule = plan.rules[zn.id];
    if (!rule) continue;
    const poly = zn.pts;
    let ox = 0, oz = 0;
    for (const p of poly) { ox += p[0] / poly.length; oz += p[1] / poly.length; }
    const th = (rule.angle * Math.PI) / 180;
    const ux = Math.cos(th), uz = Math.sin(th), vx = -uz, vz = ux;
    const inside = (x, z) => pointInPoly(poly, x, z) && polyDist(poly, x, z) > 9 && insideRing(x, z, 16) && playable(x, z, 12) && !isReserved(x, z, 6);
    const family = (dx, dz, px, pz, spacing, phase) => {
      for (let k = -16; k <= 16; k++) {
        const off = k * spacing;
        let cur = [];
        const flush = () => {
          if (cur.length * 4 >= 30) {
            const run = [cur[0], ...cur.filter((_, i) => i > 0 && i < cur.length - 1 && i % 3 === 0), cur[cur.length - 1]];
            net.add('Calle', 'calle', snapEnds(net, run, spacing * 0.7), { district: zn.id, w: rule.w, sw: rule.sw });
          }
          cur = [];
        };
        for (let t = -800; t <= 800; t += 4) {
          const wv = rule.warp ? Math.sin((t / (spacing * 2.2)) * Math.PI * 2 + k * 1.7 + phase) * rule.warp : 0;
          const x = ox + px * off + dx * t + px * wv, z = oz + pz * off + dz * t + pz * wv;
          if (inside(x, z) && !nearParallelMain(x, z, dx, dz) && slopeAt(x, z, dx, dz) < 0.17) cur.push([x, z]); else flush();
        }
        flush();
      }
    };
    family(ux, uz, vx, vz, rule.spacing[1], 0);
    if (rule.spacing[0] < 900) family(vx, vz, ux, uz, rule.spacing[0], 1.3);
  }
}
function segDistP(s, x, z) {
  const dx = s.bx - s.ax, dz = s.bz - s.az, L2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / L2));
  return Math.hypot(x - s.ax - dx * t, z - s.az - dz * t);
}
// Extiende los extremos de una calle hasta la calle más cercana (si está cerca)
function snapEnds(net, run, maxExt = 18) {
  const ext = (p, q) => {
    const L = Math.hypot(p[0] - q[0], p[1] - q[1]) || 1;
    const dx = (p[0] - q[0]) / L, dz = (p[1] - q[1]) / L;
    let best = null;
    const ex = p[0] + dx * maxExt, ez = p[1] + dz * maxExt;
    for (const s of net.near(Math.min(p[0], ex) - 2, Math.min(p[1], ez) - 2, Math.max(p[0], ex) + 2, Math.max(p[1], ez) + 2)) {
      const hit = segSegIntersect(p, [ex, ez], [s.ax, s.az], [s.bx, s.bz]);
      if (hit && (!best || hit.t < best.t)) best = hit;
    }
    return best ? [best.x, best.z] : p;
  };
  const out = run.slice();
  out[0] = ext(run[0], run[1]);
  out[out.length - 1] = ext(run[run.length - 1], run[run.length - 2]);
  return out;
}

// Edificio de un lote (mismas arquitecturas que Puerto Nova; la etapa 5 les dará estilo regional)
function lotParts(lot, rng, nextName) {
  switch (lot.type) {
    case 'casaHumilde': return B.casaHumilde(rng, lot.w, lot.d);
    case 'casaMedia': return B.casaMedia(rng, lot.w, lot.d);
    case 'casaRural': return B.casaRural(rng, lot.w, lot.d);
    case 'villa': return B.villaModerna(rng, lot.w, lot.d);
    case 'hacienda': return B.villaHacienda(rng, lot.w, lot.d);
    case 'apartamentos': return B.apartamentos(rng, lot.w, lot.d, rng.int(3, 5));
    case 'restaurante': lot.name = nextName(lot.sub); return B.restaurante(rng, lot.w, lot.d, lot.sub, lot.name);
    case 'tienda': lot.name = nextName(lot.sub); return B.tienda(rng, lot.w, lot.d, lot.sub, lot.name);
    case 'oficina': return B.oficina(rng, lot.w, lot.d, 9, 24);
    case 'torre': return B.oficina(rng, lot.w, lot.d, 26, lot.sub === 'alta' ? 92 : 60);
    case 'hotel': lot.name = nextName('hotel'); return B.hotel(rng, lot.w, lot.d, lot.name);
    case 'taller': lot.name = nextName('taller'); return B.taller(rng, lot.w, lot.d, lot.name);
    case 'fabrica': return B.fabrica(rng, lot.w, lot.d);
    default: return B.bodega(rng, lot.w, lot.d);
  }
}
