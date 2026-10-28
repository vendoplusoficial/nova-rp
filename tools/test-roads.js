// Validación física de la red vial entre regiones (shared/highways.js).
// Uso: node tools/test-roads.js
// Recorre cada vía cada 4 m (centro y ambos carriles) y comprueba:
//   pendiente máxima, radio de curva, cruces a la misma altura (o fin en un pueblo), suelo continuo (sin escalones ni
//   huecos), que nada la bloquee (edificios, valla invisible, árboles), que se pueda pisar (zona
//   jugable, también sobre los puentes), altura libre de los puentes y que Puerto Nova no cambió.

import { getCity } from '../shared/city.js';
import { CollisionGrid } from '../shared/collision.js';
import { playable } from '../shared/terrain.js';
import { TOWNS } from '../shared/worldplan.js';

const city = getCity();
const net = city.highways;
const grid = new CollisionGrid(city.colliders);
let errors = 0;
const fail = (m) => { errors++; console.log('  ✘ ' + m); };
const ok = (m) => console.log('  ✔ ' + m);
const RAMP = 250;   // m desde un cruce donde se permiten curvas de enlace más cerradas
const RAMP_RMIN = 50;   // (o el 60 % del radio de la vía si es menor: caminos secundarios)

console.log(`Red vial: ${net.roads.length} vías, ${net.piers.length} pilas de puente`);
for (const r of net.roads) {
  const n = r.pts.length, m = r.closed ? n : n - 1, ST = net.ST;
  const before = errors;
  // pendiente
  let maxG = 0;
  for (let i = 0; i < m; i++) maxG = Math.max(maxG, Math.abs(r.y[(i + 1) % n] - r.y[i]) / ST);
  if (maxG > r.spec.grade + 0.002) fail(`${r.id}: pendiente ${(maxG * 100).toFixed(1)}% > ${r.spec.grade * 100}%`);
  // radio de curva (tres puntos separados 20 m)
  const K = 5;
  let minR = Infinity, minRamp = Infinity;
  for (let i = r.closed ? 0 : K; i < (r.closed ? n : n - K); i++) {
    const a = r.pts[(i - K + n) % n], b = r.pts[i], d = r.pts[(i + K) % n];
    const ab = Math.hypot(b[0] - a[0], b[1] - a[1]), bd = Math.hypot(d[0] - b[0], d[1] - b[1]), ad = Math.hypot(d[0] - a[0], d[1] - a[1]);
    const cross = Math.abs((b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]));
    const R = cross < 1e-6 ? Infinity : (ab * bd * ad) / (2 * cross);
    const nearEnd = !r.closed && Math.min(i, n - 1 - i) * ST < RAMP;
    if (nearEnd) minRamp = Math.min(minRamp, R); else minR = Math.min(minR, R);
  }
  if (minR < r.spec.rmin * 0.7) fail(`${r.id}: curva de radio ${minR.toFixed(0)} m (mínimo ${r.spec.rmin})`);
  const rampMin = Math.min(RAMP_RMIN, r.spec.rmin * 0.6);
  if (minRamp < rampMin) fail(`${r.id}: curva de enlace de radio ${minRamp.toFixed(0)} m (mínimo ${rampMin})`);
  // recorrido físico
  let blocked = 0, unplay = 0, steps = 0, gap = 0, firstBad = null;
  let prevS = null;
  for (let i = 0; i < n; i++) {
    const [x, z] = r.pts[i], [ux, uz] = r.tan[i], y = r.y[i];
    for (const off of [-(r.spec.w / 2 - 1), 0, r.spec.w / 2 - 1]) {
      const px = x - uz * off, pz = z + ux * off;
      const s = city.surface(px, pz, y + 0.5);
      if (Math.abs(s - y) > 1.3) { gap++; firstBad ||= [px, pz, 'suelo']; }
      if (grid.pointInside(px, s + 1.0, pz) || grid.pointInside(px, s + 0.5, pz)) { blocked++; firstBad ||= [px, pz, 'bloqueo']; }
      if (!playable(px, pz, 0)) { unplay++; firstBad ||= [px, pz, 'no jugable']; }
    }
    const s0 = city.surface(x, z, y + 0.5);
    if (prevS !== null && Math.abs(s0 - prevS) > r.spec.grade * ST + 0.25) { steps++; firstBad ||= [x, z, 'escalón']; }
    prevS = s0;
  }
  if (blocked) fail(`${r.id}: ${blocked} puntos bloqueados por colisiones`);
  if (unplay) fail(`${r.id}: ${unplay} puntos fuera de la zona jugable`);
  if (gap) fail(`${r.id}: ${gap} puntos donde el suelo no coincide con la rasante`);
  if (steps) fail(`${r.id}: ${steps} escalones (más que la pendiente permitida + 25 cm)`);
  if (firstBad) console.log(`    primer problema: ${firstBad[2]} en (${firstBad[0].toFixed(0)}, ${firstBad[1].toFixed(0)})`);
  // puentes: altura libre sobre el agua
  for (let i = 0; i < n; i++) if (r.water[i] === 1 && r.y[i] < 8.9) { fail(`${r.id}: puente sobre el mar a solo ${r.y[i].toFixed(1)} m`); break; }
  // cruces: el extremo coincide con la vía a la que llega
  if (!r.closed) for (const k of [0, n - 1]) {
    const [x, z] = r.pts[k];
    const other = net.roads.find((o) => o !== r && o.pts.some((p, j) => Math.hypot(p[0] - x, p[1] - z) < 6 && Math.abs(o.y[j] - r.y[k]) < 0.6));
    const pn = city.net.segs.some((sg) => { const dx = sg.bx - sg.ax, dz = sg.bz - sg.az, L2 = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((x - sg.ax) * dx + (z - sg.az) * dz) / L2)); return Math.hypot(x - sg.ax - dx * t, z - sg.az - dz * t) < 1 && Math.abs(city.height(x, z) - r.y[k]) < 0.6; });
    const town = TOWNS.find((t) => Math.hypot(t.at[0] - x, t.at[1] - z) < 200);   // termina en un pueblo o lugar
    if (!other && !pn && !town) fail(`${r.id}: el extremo (${x.toFixed(0)}, ${z.toFixed(0)}) no llega a otra vía ni a un pueblo`);
  }
  if (errors === before) ok(`${r.name} (${r.id}): ${(n * ST / 1000).toFixed(2)} km, pendiente máx ${(maxG * 100).toFixed(1)}%, radio mín ${isFinite(minR) ? minR.toFixed(0) + ' m' : 'recta'}, enlaces ${[...r.joins, ...r.towns].join(' / ') || '—'}`);
}
// cruces entre vías fuera de sus extremos: deben estar a la misma altura (o uno pasa por un puente)
let crossings = 0;
const segsOf = (r) => { const out = [], n = r.pts.length; for (let i = 0; i < (r.closed ? n : n - 1); i++) out.push([i, r.pts[i], r.pts[(i + 1) % n]]); return out; };
const inter = (a, b, c, d) => {
  const den = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0]);
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / den, u = ((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
};
for (let a = 0; a < net.roads.length; a++) for (let b = a + 1; b < net.roads.length; b++) {
  const A = net.roads[a], Bv = net.roads[b];
  for (const [i, p, q] of segsOf(A)) for (const [j, s, t] of segsOf(Bv)) {
    if (Math.max(p[0], q[0]) < Math.min(s[0], t[0]) || Math.min(p[0], q[0]) > Math.max(s[0], t[0])) continue;
    const tt = inter(p, q, s, t);
    if (tt === null) continue;
    const ya = A.y[i], yb = Bv.y[j];
    if (Math.abs(ya - yb) > 0.4 && !(A.deck[i] && ya - yb > 5) && !(Bv.deck[j] && yb - ya > 5)) { crossings++; if (crossings < 4) fail(`${A.id} y ${Bv.id} se cruzan a distinta altura (${ya.toFixed(1)} / ${yb.toFixed(1)} m) en (${p[0].toFixed(0)}, ${p[1].toFixed(0)})`); }
  }
}
if (!crossings) ok('todos los cruces entre vías están a la misma altura');

// Puerto Nova no cambia
const pnLots = city.lots.filter((l) => !l.city).length, pnSites = city.sites.filter((s) => !s.city).length;
if (pnLots !== 925 || pnSites !== 189) fail(`Puerto Nova cambió: ${pnLots} lotes, ${pnSites} sitios`);
else ok('Puerto Nova intacto (925 lotes, 189 sitios)');

if (errors) { console.log(`\n${errors} ERROR(ES) en la red vial`); process.exit(1); }
console.log('\nOK: red vial válida');
