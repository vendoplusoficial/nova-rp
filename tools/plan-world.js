// Valida y dibuja el plano maestro insular a escala uniforme.
// node tools/plan-world.js [salida.svg]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { M, unM, METRES_PER_PIXEL, MASTER_BOUNDS, MAINLAND, ISLANDS, LAKE, RIDGES, CAUSEWAYS, MASTER_ROADS } from '../shared/masterMap.js';
import { MAIN_ROADS } from '../shared/mapdata.js';
import { CITIES } from '../shared/worldplan.js';
import { pointInPoly, regionAt } from '../shared/terrain.js';
const B=MASTER_BOUNDS;
assert.equal(B.x1-B.x0,6000); assert.equal(B.z1-B.z0,6000);
assert.equal(M(1,0)[0]-M(0,0)[0],M(0,1)[1]-M(0,0)[1]);
for(const p of [[0,0],[1536,1024],[768,512]]) {
  const q=unM(...M(...p)); assert.ok(Math.hypot(q[0]-p[0],q[1]-p[1])<1e-9);
}
for(const poly of [MAINLAND,LAKE.pts,...ISLANDS.map(i=>i.pts)]) {
 assert.ok(poly.length>=3);
 for(const [x,z] of poly) assert.ok(Number.isFinite(x)&&Number.isFinite(z)&&x>B.x0&&x<B.x1&&z>B.z0&&z<B.z1,'polígono fuera de los 6 km');
}
assert.ok(LAKE.pts.every(([x,z])=>pointInPoly(MAINLAND,x,z)),'el lago debe estar dentro de la isla');
for(const c of CITIES)assert.equal(regionAt(...c.center),c.region,`región incorrecta para ${c.name}`);
assert.ok(MASTER_ROADS.length>=20,'faltan las vías exteriores del mapa');
assert.ok(RIDGES.length>=4,'faltan la sierra y sus estribaciones');
const onLand=(p)=>[MAINLAND,...ISLANDS.map(i=>i.pts)].some(poly=>pointInPoly(poly,...p));
for(const c of CAUSEWAYS)assert.ok(onLand(c.pts[0])&&onLand(c.pts.at(-1)),`enlace sin extremos en tierra: ${c.id}`);
console.log(`OK: área 6 × 6 km, escala ${METRES_PER_PIXEL} m/px, ${ISLANDS.length} islas, ${MASTER_ROADS.length} vías exteriores, ${CAUSEWAYS.length} cruces de agua`);
if(process.argv[2]) {
 const path=(pts,closed=false)=>'M'+pts.map(([x,z])=>`${(x+3000)*.2},${(z+3000)*.2}`).join('L')+(closed?'Z':'');
 let svg='<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200"><rect width="1200" height="1200" fill="#12465b"/>';
 for(const poly of [MAINLAND,...ISLANDS.map(i=>i.pts)]) svg+=`<path d="${path(poly,true)}" fill="#78805a" stroke="#c6b38a" stroke-width="3"/>`;
 for(const r of RIDGES)svg+=`<path d="${path(r.pts)}" fill="none" stroke="#5b5d4e" stroke-linecap="round" stroke-width="${r.w*.3}"/>`;
 svg+=`<path d="${path(LAKE.pts,true)}" fill="#286f89"/>`;
 for(const r of MAIN_ROADS)svg+=`<path d="${path(r.pts,r.closed)}" fill="none" stroke="${r.cls==='autopista'?'#ecd493':r.cls==='subida'?'#b19a74':'#d1cebd'}" stroke-width="${r.cls==='autopista'?3:1.5}"/>`;
 svg+='</svg>'; fs.writeFileSync(process.argv[2],svg);
}
