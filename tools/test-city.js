// Prueba del generador de ciudad: node tools/test-city.js
import { generateCity } from '../shared/city.js';
import { URBAN_PLANS } from '../shared/citiesPlan.js';
import { urbanInput, generateUrbanStandalone, mergeUrban } from '../shared/urban.js';
import { CollisionGrid } from '../shared/collision.js';
import { playable } from '../shared/terrain.js';
import { SITE_DEFS } from '../shared/mapdata.js';
import { safeZoneAt, obbOverlap } from '../shared/city.js';

const t0 = performance.now();
const city = generateCity();
const t1 = performance.now();
const grid = new CollisionGrid(city.colliders);
let errors = 0;
const fail = (m) => { console.error('ERROR:', m); errors++; };

const count = {};
for (const l of city.lots) count[l.type] = (count[l.type] || 0) + 1;
console.log(`Ciudad generada en ${(t1 - t0).toFixed(0)} ms`);
console.log(`Calles: ${city.roads.length}, lotes: ${city.lots.length}, sitios: ${city.sites.length}, objetos: ${city.props.length}, colisionadores: ${city.colliders.length}`);
console.log('Lotes por tipo:', JSON.stringify(count));
console.log(`Recogidas: ${city.pickups.length}, entregas: ${city.drops.length}, puntos de aparición: ${city.spawnPoints.length}`);
console.log('POIs:', Object.keys(city.pois).join(', '));

// Un punto es accesible si está en tierra jugable y el personaje (cilindro) cabe ahí
const reachable = (x, z) => {
  if (!playable(x, z, 0.5)) return 'fuera de la zona jugable';
  const y = city.height(x, z);
  if (y < 0.3) return 'en el agua';
  const r = grid.resolveCylinder(x, z, 0.35, y, 1.8);
  if (r.hit && Math.hypot(r.x - x, r.z - z) > 0.6) return 'dentro de una pared';
  return null;
};

for (const s of city.spawnPoints) { const e = reachable(s.x, s.z); if (e) fail(`spawn ${e} (${s.x.toFixed(1)},${s.z.toFixed(1)})`); }
let badPick = 0, badDrop = 0;
for (const p of city.pickups) { const e = reachable(p.x, p.z); if (e) { badPick++; if (badPick < 6) fail(`recogida "${p.name}" ${e}`); } }
for (const d of city.drops) { const e = reachable(d.x, d.z); if (e) { badDrop++; if (badDrop < 6) fail(`entrega ${d.label} ${e}`); } }
for (const k of ['park', 'jobcenter', 'hospital', 'police', 'gunshop', 'medics', 'range']) {
  const p = city.pois[k];
  if (!p) { fail('falta POI ' + k); continue; }
  if (k !== 'park') { const e = reachable(p.x, p.z); if (e) fail(`POI ${k} ${e}`); }
}
if (city.pickups.length < 60) fail('muy pocos negocios para recoger pedidos');
if (city.drops.length < 200) fail('muy pocas casas para entregar');

// Ninguna casa sobre una calle
let onRoad = 0;
for (const l of city.lots) if (city.netAt(l.cx, l.cz).rectHitsRoad(l.cx, l.cz, l.w / 2 - 0.3, l.d / 2 - 0.3, l.rot, 0)) onRoad++;
if (onRoad) fail(`${onRoad} lotes invaden una calle`);

// Rayo contra un edificio alto
const tower = city.lots.find((l) => l.type === 'torre');
if (tower) {
  const d = grid.raycast(tower.cx, tower.y0 + 6, tower.cz - 200, 0, 0, 1, 400);
  if (!(d < 200)) fail('el rayo no detecta la torre');
}
// Dentro de la zona jugable no hay agua (muestreo cada 6 m)
let wet = 0;
for (let x = -760; x < 770; x += 6) for (let z = -600; z < 600; z += 6) if (playable(x, z, 1) && city.height(x, z) < 0.2) wet++;
if (wet > 20) fail(`${wet} puntos con agua dentro de la zona jugable`);

// Todos los lugares del plano existen
if (city.missingSites && city.missingSites.length) fail('lugares sin terreno: ' + city.missingSites.join(', '));
for (const d of SITE_DEFS) if (!city.sites.some((s) => s.id === d.id)) fail('falta el lugar ' + d.id);

// Se aparece en una zona social segura (no se puede disparar)
for (const s of city.spawnPoints) if (!safeZoneAt(city, s.x, s.z)) fail('punto de aparición fuera de zona segura');
if (city.safeZones.length < 10) fail('muy pocas zonas seguras');

// Red vial conectada: desde el Anillo Periférico se llega a todas las calles
{
  const roads = city.roads, adj = roads.map(() => new Set());
  for (const a of city.net.segs) for (const b of city.net.near(Math.min(a.ax, a.bx) - 3, Math.min(a.az, a.bz) - 3, Math.max(a.ax, a.bx) + 3, Math.max(a.az, a.bz) + 3)) {
    if (a.road === b.road) continue;
    const near = (px, pz, s) => { const dx = s.bx - s.ax, dz = s.bz - s.az, L = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((px - s.ax) * dx + (pz - s.az) * dz) / L)); return Math.hypot(s.ax + dx * t - px, s.az + dz * t - pz); };
    if (near(a.ax, a.az, b) < b.road.w / 2 + 2 || near(a.bx, a.bz, b) < b.road.w / 2 + 2) { adj[a.road.id].add(b.road.id); adj[b.road.id].add(a.road.id); }
  }
  const start = roads.findIndex((r) => r.name === 'Anillo Periférico');
  const seen = new Set([start]), q = [start];
  while (q.length) for (const n of adj[q.pop()]) if (!seen.has(n)) { seen.add(n); q.push(n); }
  const lost = roads.filter((r) => !seen.has(r.id));
  if (lost.length) fail(`${lost.length} calles sin conexión: ${lost.slice(0, 5).map((r) => r.name).join(', ')}`);
  const caps = city.caps.length;
  console.log(`Red vial: ${roads.length} calles conectadas, ${caps} remates`);
}

// Ciudades nuevas: calles conectadas a su periférico, lotes y lugares
for (const u of city.urban) {
  const roads = u.net.roads, adj = new Map(roads.map((r) => [r, new Set()]));
  for (const a of u.net.segs) for (const b of u.net.near(Math.min(a.ax, a.bx) - 3, Math.min(a.az, a.bz) - 3, Math.max(a.ax, a.bx) + 3, Math.max(a.az, a.bz) + 3)) {
    if (a.road === b.road) continue;
    const near = (px, pz, s) => { const dx = s.bx - s.ax, dz = s.bz - s.az, L = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((px - s.ax) * dx + (pz - s.az) * dz) / L)); return Math.hypot(s.ax + dx * t - px, s.az + dz * t - pz); };
    if (near(a.ax, a.az, b) < b.road.w / 2 + 2 || near(a.bx, a.bz, b) < b.road.w / 2 + 2) { adj.get(a.road).add(b.road); adj.get(b.road).add(a.road); }
  }
  const start = roads.find((r) => r.external), seen = new Set([start]), q = [start];
  while (q.length) for (const n of adj.get(q.pop())) if (!seen.has(n)) { seen.add(n); q.push(n); }
  const lost = roads.filter((r) => !seen.has(r));
  if (lost.length) fail(`${u.name}: ${lost.length} calles sin conexión con el periférico`);
  const lots = city.lots.filter((l) => l.city === u.id), sites = city.sites.filter((s) => s.city === u.id);
  if (lots.length < 400) fail(`${u.name}: muy pocos lotes (${lots.length})`);
  console.log(`${u.name}: ${roads.length - 1} calles conectadas al periférico, ${u.blocks.length} manzanas, ${lots.length} lotes, ${sites.length} lugares`);
}

// Manzanas llenas: cada lote pertenece a una manzana (o a una carretera fuera de la ciudad) y no se enciman
{
  let over = 0;
  const L = city.lots;
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
    const a = L[i], b = L[j];
    if (Math.abs(a.cx - b.cx) > 60 || Math.abs(a.cz - b.cz) > 60) continue;
    if (obbOverlap({ cx: a.cx, cz: a.cz, hx: a.w / 2 - 0.3, hz: a.d / 2 - 0.3, rot: a.rot }, { cx: b.cx, cz: b.cz, hx: b.w / 2 - 0.3, hz: b.d / 2 - 0.3, rot: b.rot }, 0)) over++;
  }
  if (over) fail(`${over} lotes encimados`);
  // el frente de cada lote da a una calle (a menos de 12 m)
  let blind = 0;
  for (const l of L) {
    const fx = l.cx + Math.sin(l.rot) * (l.d / 2), fz = l.cz + Math.cos(l.rot) * (l.d / 2);
    if (city.netAt(fx, fz).clearance(fx, fz).c > 12) blind++;
  }
  if (blind > L.length * 0.01) fail(`${blind} lotes sin frente a la calle`);
  const inBlocks = L.filter((l) => l.block >= 0).length;
  console.log(`Manzanas: ${city.blocks.length}, lotes en manzana: ${inBlocks}, a orilla de carretera: ${L.length - inBlocks}, lotes de frente a la calle: ${L.length - blind}/${L.length}`);
}
// El cliente genera las ciudades nuevas aparte (Web Worker): deben salir idénticas a las del servidor
{
  const base = generateCity(undefined, { urban: false });
  for (const plan of URBAN_PLANS) mergeUrban(base, structuredClone(generateUrbanStandalone(urbanInput(base, plan))));
  const sig = (c) => c.lots.filter((l) => l.city).map((l) => `${l.type}:${l.cx.toFixed(3)}:${l.cz.toFixed(3)}:${l.y0.toFixed(3)}`).join('|');
  let hd = 0;
  for (const u of city.urban) for (let x = u.box.x0 + 3; x < u.box.x1; x += 9.7) for (let z = u.box.z0 + 3; z < u.box.z1; z += 9.3) if (Math.abs(city.height(x, z) - base.height(x, z)) > 1e-4) hd++;
  if (sig(base) !== sig(city)) fail('las ciudades nuevas generadas en el cliente no coinciden con las del servidor (lotes)');
  if (hd) fail(`las ciudades nuevas generadas en el cliente no coinciden con las del servidor (${hd} alturas)`);
  if (base.colliders.length !== city.colliders.length) fail(`colisiones distintas cliente/servidor: ${base.colliders.length} / ${city.colliders.length}`);
  if (!hd && sig(base) === sig(city)) console.log('Ciudades nuevas: la versión del cliente (en segundo plano) coincide con la del servidor');
}
if (errors) { console.error(`${errors} errores`); process.exit(1); }
console.log('OK: ciudad válida');
