// Valida y dibuja el plano maestro del mundo (shared/worldplan.js).
//   node tools/plan-world.js [salida.svg]
// Validaciones de la etapa de planificación:
//  - cada región es un polígono válido y no se encima con otra (están separadas por mar)
//  - los tramos de puente empiezan y terminan en tierra y su centro va sobre el agua
//  - los tramos normales de autopistas y caminos van sobre tierra (no cruzan el mar)
//  - grafo vial: desde cada ciudad se llega a las otras dos, y cada pueblo/lugar tiene acceso

import fs from 'node:fs';
import { REGIONS, CITIES, TOWNS, LAKES_PLAN, RIVERS_PLAN, RANGES_PLAN, HIGHWAYS_PLAN, RINGS_PLAN, ROADS_PLAN, WORLD_PLAN_BOUNDS, W } from '../shared/worldplan.js';
import { MAINLAND, ISLANDS, MAIN_ROADS } from '../shared/mapdata.js';
import { pointInPoly } from '../shared/terrain.js';

let errors = 0;
const fail = (m) => { console.error('ERROR:', m); errors++; };
let mark = 0;
const ok = (m) => { if (errors === mark) console.log('  ✔', m); mark = errors; };

const landPolys = [...REGIONS.map((r) => r.coast), MAINLAND, ...ISLANDS.map((i) => i.pts)];
const onLand = (x, z) => landPolys.some((p) => pointInPoly(p, x, z));
const inLake = (x, z) => LAKES_PLAN.some((l) => ((x - l.center[0]) / l.rx) ** 2 + ((z - l.center[1]) / l.rz) ** 2 < 1);
const regionAt = (x, z) => { if (pointInPoly(MAINLAND, x, z)) return 'costera'; const r = REGIONS.find((q) => pointInPoly(q.coast, x, z)); return r ? r.id : null; };

// ---------- 1. regiones separadas ----------
console.log('[1] Regiones');
for (const a of REGIONS) for (const b of REGIONS) {
  if (a.id >= b.id) continue;
  if (a.coast.some(([x, z]) => pointInPoly(b.coast, x, z)) || b.coast.some(([x, z]) => pointInPoly(a.coast, x, z))) fail(`las regiones ${a.id} y ${b.id} se enciman (deben estar separadas por mar)`);
}
ok(`${REGIONS.length} regiones separadas por mar`);
for (const c of CITIES) if (regionAt(c.center[0], c.center[1]) !== c.region) fail(`la ciudad ${c.name} no está dentro de su región`);
ok('cada ciudad está dentro de su región');
for (const t of TOWNS) if (regionAt(t.at[0], t.at[1]) !== t.region) fail(`${t.name} no está en tierra de su región`);
ok('cada pueblo y lugar está en tierra de su región');

// ---------- 2. carreteras sobre tierra, puentes sobre agua ----------
console.log('[2] Carreteras y puentes');
const sampleSeg = (a, b, step = 10) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const n = Math.max(1, Math.ceil(L / step)); const out = []; for (let k = 0; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]); return out; };
let bridges = 0;
const allRoads = [...HIGHWAYS_PLAN, ...RINGS_PLAN.map((r) => ({ ...r, closed: true, id: r.name })), ...ROADS_PLAN.map((r) => ({ ...r, id: r.name }))];
for (const r of allRoads) {
  const n = r.closed ? r.pts.length : r.pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = r.pts[i], b = r.pts[(i + 1) % r.pts.length];
    const isBridge = r.bridge && i >= r.bridge[0] && i < r.bridge[1];
    if (isBridge) continue;
    const wet = sampleSeg(a, b).filter(([x, z]) => !onLand(x, z) || inLake(x, z)).length;
    if (wet > 1) fail(`${r.id}: el tramo ${i} cruza agua sin puente (${wet} muestras)`);
  }
  if (r.bridge) {
    bridges++;
    const s = r.pts[r.bridge[0]], e = r.pts[r.bridge[1]];
    if (!onLand(s[0], s[1])) fail(`${r.id}: el puente empieza en el agua`);
    if (!onLand(e[0], e[1])) fail(`${r.id}: el puente termina en el agua`);
    const mids = [];
    for (let i = r.bridge[0]; i < r.bridge[1]; i++) mids.push(...sampleSeg(r.pts[i], r.pts[i + 1], 20));
    if (!mids.some(([x, z]) => !onLand(x, z))) fail(`${r.id}: el "puente" no cruza agua`);
    const len = mids.length * 20;
    console.log(`  · puente ${r.id} ${r.name || ''}: ~${Math.round(len)} m`);
  }
}
ok(`carreteras sobre tierra; ${bridges} puentes con ambos extremos en tierra`);

// ---------- 3. grafo vial ----------
console.log('[3] Conectividad (grafo)');
// nodos: puntos de todos los caminos; aristas: tramos consecutivos y entronques a < 45 m de otro camino
// (en el plano el trazo es aproximado; en la etapa 3 los entronques se ajustan al punto exacto)
const nodes = [], adj = [];
const addNode = (p) => { nodes.push(p); adj.push([]); return nodes.length - 1; };
const lines = [];
for (const r of allRoads) {
  const ids = r.pts.map((p) => addNode(p));
  for (let i = 0; i < ids.length - 1; i++) { adj[ids[i]].push(ids[i + 1]); adj[ids[i + 1]].push(ids[i]); }
  if (r.closed) { adj[ids[0]].push(ids[ids.length - 1]); adj[ids[ids.length - 1]].push(ids[0]); }
  lines.push({ r, ids });
}
// red de la ciudad actual: un nodo por calle principal (se considera conectada internamente: ya se valida en test-city)
const cityNode = addNode(W(692, 850));
for (const mr of MAIN_ROADS) for (const p of mr.pts) { const k = addNode(p); adj[k].push(cityNode); adj[cityNode].push(k); }
const segDist = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)); return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dz * t); };
// unión de extremos con cualquier tramo cercano (cruces y entronques)
for (let k = 0; k < nodes.length; k++) {
  for (const { ids } of lines) for (let i = 0; i < ids.length - 1; i++) {
    if (ids.includes(k)) break;
    if (segDist(nodes[k], nodes[ids[i]], nodes[ids[i + 1]]) < 45) { adj[k].push(ids[i], ids[i + 1]); adj[ids[i]].push(k); adj[ids[i + 1]].push(k); }
  }
}
const nearestNode = (p) => { let b = -1, bd = Infinity; nodes.forEach((n, i) => { const d = Math.hypot(n[0] - p[0], n[1] - p[1]); if (d < bd) { bd = d; b = i; } }); return { i: b, d: bd }; };
const bfs = (s) => { const seen = new Set([s]), q = [s]; while (q.length) { const v = q.shift(); for (const w of adj[v]) if (!seen.has(w)) { seen.add(w); q.push(w); } } return seen; };
// nodo de cada ciudad: el de la ciudad actual o un vértice de su periférico
const nodeOf = (c) => (c.existing ? cityNode : lines.find((l) => l.r.city === c.id).ids[0]);
const reach = bfs(cityNode);
for (const a of CITIES) for (const b of CITIES) {
  if (a.id >= b.id) continue;
  if (!bfs(nodeOf(a)).has(nodeOf(b))) fail(`no hay ruta entre ${a.name} y ${b.name}`); else ok(`ruta ${a.name} ↔ ${b.name}`);
}
for (const t of TOWNS) {
  const n = nearestNode(t.at);
  if (n.d > 90) fail(`${t.name}: no tiene camino a menos de 90 m (${Math.round(n.d)} m)`);
  else if (!reach.has(n.i)) fail(`${t.name}: su camino no conecta con la red`);
}
ok('todos los pueblos y lugares tienen camino conectado a las tres ciudades');

// ---------- 4. dibujo ----------
const out = process.argv[2];
if (out) {
  const B = WORLD_PLAN_BOUNDS, S = 0.2; // px por metro
  const X = (x) => ((x - B.x0) * S).toFixed(1), Y = (z) => ((z - B.z0) * S).toFixed(1);
  const path = (pts, close) => 'M' + pts.map(([x, z]) => `${X(x)},${Y(z)}`).join('L') + (close ? 'Z' : '');
  const col = { costera: '#79a85a', montana: '#4f8a45', desierto: '#d9b878' };
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${((B.x1 - B.x0) * S).toFixed(0)}" height="${((B.z1 - B.z0) * S).toFixed(0)}" style="background:#2a6f9e;font-family:sans-serif">`;
  for (const r of REGIONS) svg += `<path d="${path(r.coast, true)}" fill="${col[r.id]}" stroke="#e8dcb0" stroke-width="2"/>`;
  svg += `<path d="${path(MAINLAND, true)}" fill="#8fae6a" stroke="#e8dcb0" stroke-width="2"/>`;
  for (const i of ISLANDS) svg += `<path d="${path(i.pts, true)}" fill="#8fae6a" stroke="#e8dcb0"/>`;
  for (const r of RANGES_PLAN) svg += `<path d="${path(r.pts)}" fill="none" stroke="${r.region === 'desierto' ? '#a5743f' : '#5d4b3a'}" stroke-opacity="0.55" stroke-width="${(r.w * S * 1.2).toFixed(0)}" stroke-linecap="round"/>`;
  for (const l of LAKES_PLAN) svg += `<ellipse cx="${X(l.center[0])}" cy="${Y(l.center[1])}" rx="${(l.rx * S).toFixed(1)}" ry="${(l.rz * S).toFixed(1)}" fill="#3b8fc4"/>`;
  for (const r of RIVERS_PLAN) svg += `<path d="${path(r.pts)}" fill="none" stroke="#3b8fc4" stroke-width="4"/>`;
  for (const c of CITIES) if (c.urban) svg += `<path d="${path(c.urban, true)}" fill="#b9b6b0" fill-opacity="0.85"/>`;
  for (const mr of MAIN_ROADS) svg += `<path d="${path(mr.pts, mr.closed)}" fill="none" stroke="#e0e0e0" stroke-width="2"/>`;
  const rc = { autopista: ['#d32f2f', 5], carretera: ['#f9a825', 3.5], secundaria: ['#ffffff', 2.5], terraceria: ['#8d6e63', 2] };
  for (const r of RINGS_PLAN) svg += `<path d="${path(r.pts, true)}" fill="none" stroke="#f9a825" stroke-width="3.5"/>`;
  for (const r of [...ROADS_PLAN, ...HIGHWAYS_PLAN]) {
    const [c, w] = rc[r.cls];
    svg += `<path d="${path(r.pts)}" fill="none" stroke="${c}" stroke-width="${w}" ${r.cls === 'terraceria' ? 'stroke-dasharray="6 4"' : ''}/>`;
    if (r.bridge) svg += `<path d="${path(r.pts.slice(r.bridge[0], r.bridge[1] + 1))}" fill="none" stroke="#111" stroke-width="${w + 4}" stroke-opacity="0.6"/><path d="${path(r.pts.slice(r.bridge[0], r.bridge[1] + 1))}" fill="none" stroke="#fff" stroke-width="${w}"/>`;
  }
  const label = (p, t, big) => `<text x="${X(p[0])}" y="${Y(p[1])}" font-size="${big ? 22 : 13}" font-weight="700" fill="#fff" stroke="#000" stroke-width="${big ? 4 : 3}" paint-order="stroke" text-anchor="middle">${t}</text>`;
  for (const t of TOWNS) svg += `<circle cx="${X(t.at[0])}" cy="${Y(t.at[1])}" r="5" fill="#ffeb3b" stroke="#000"/>` + label([t.at[0], t.at[1] - 40], t.name);
  for (const c of CITIES) svg += label(c.center, c.name.toUpperCase(), true);
  svg += '</svg>';
  fs.writeFileSync(out, svg);
  console.log('plano:', out);
}
console.log(errors ? `\n${errors} errores en el plano` : '\nOK: plano válido');
process.exit(errors ? 1 : 0);
