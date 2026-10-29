// Recorre la red REAL que dibuja el cliente, también los distritos exteriores del plano insular.
import assert from 'node:assert/strict';
import { getCity } from '../shared/city.js';
import { CollisionGrid } from '../shared/collision.js';
import { playable } from '../shared/terrain.js';
import { MASTER_ROADS, unM } from '../shared/masterMap.js';
const city = getCity(), grid = new CollisionGrid(city.colliders);
let samples = 0, maxGrade = 0;
for (const def of MASTER_ROADS) {
  const roads = city.roads.filter((r) => r.name === def.name);
  assert.ok(roads.length, `vía del plano ausente: ${def.name}`);
  for (const r of roads) {
    const n = r.pts.length, count = r.closed ? n : n - 1;
    let prev = null;
    for (let i = 0; i < count; i++) {
      const a = r.pts[i], b = r.pts[(i + 1) % n];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 0.01) continue;
      const steps = Math.max(1, Math.ceil(len / 4));
      for (let j = 0; j < steps; j++) {
        const t = j / steps, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
        const h = city.surface(x, z), where = `${def.name} en ${unM(x,z).map((v)=>v.toFixed(1)).join(',')}`;
        for (const off of [-r.w * 0.3, 0, r.w * 0.3]) {
          const px = x - (b[1] - a[1]) / len * off, pz = z + (b[0] - a[0]) / len * off;
          const y = city.surface(px,pz);
          assert.ok(playable(px,pz,0), `agua o barrera en ${where}`);
          assert.ok(y > 0.3, `suelo sumergido en ${where}`);
          assert.ok(!grid.pointInside(px,y + 1,pz), `carril bloqueado en ${where}`);
          samples++;
        }
        if (prev) {
          const dist = Math.hypot(x-prev.x,z-prev.z);
          if (dist > 0.001) {
            const grade = Math.abs(h-prev.h)/dist;
            maxGrade = Math.max(maxGrade,grade);
            assert.ok(grade <= (r.cls === 'autopista' ? 0.085 : 0.125), `pendiente ${(grade*100).toFixed(1)}% en ${where}`);
          }
        }
        prev = {x,z,h};
      }
    }
  }
}
// Los puntos de control no pueden desaparecer al limpiar las calles.
for (const def of MASTER_ROADS) for (const [x,z] of def.pts) {
  const near = city.net.clearance(x,z);
  assert.ok(near.c < 2, `punto del plano sin vía: ${def.name}`);
}
console.log(`OK: ${MASTER_ROADS.length} vías exteriores, ${samples} muestras de carril libres, pendiente máxima ${(maxGrade*100).toFixed(1)}%`);
