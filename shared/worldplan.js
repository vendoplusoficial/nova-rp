// El plano insular sustituye el esquema antiguo de tres islas separadas.
// No se escala la imagen por ejes: 6000/1536 metros por píxel en ambos.
import { M, METRES_PER_PIXEL, MASTER_BOUNDS } from './masterMap.js';
export const W = M;
export const PX_M = METRES_PER_PIXEL;
export const WORLD_PLAN_BOUNDS = MASTER_BOUNDS;
const L = (p) => p.map(([x,y]) => M(x,y));
export const REGIONS = [
 { id:'costera', name:'Región Costera', style:'costera', coast:L([[245,447],[935,447],[970,740],[780,755],[590,690],[300,715]]) },
 { id:'montana', name:'Región Montañosa', style:'montana', coast:L([[120,165],[480,165],[580,320],[525,420],[270,430],[130,300]]) },
 { id:'desierto', name:'Región Oriental', style:'campo', coast:L([[990,187],[1360,187],[1370,305],[1260,370],[1050,368],[960,285]]) },
];
export const CITIES = [
 {id:'costera',region:'costera',name:'Puerto Nova',existing:true,center:M(680,540)},
 {id:'montana',region:'montana',name:'Ciudad Montañosa',existing:false,center:M(340,270)},
 {id:'desierto',region:'desierto',name:'Distrito Oriental',existing:false,center:M(1200,260)},
];
export const TOWNS = [];
export const LAKES_PLAN = [];
export const RIVERS_PLAN = [];
export const RANGES_PLAN = [];
export const BEACHES_PLAN = [];
// Toda la red se define en MAIN_ROADS (mapdata.js + masterMap.js), sin rutas duplicadas.
export const HIGHWAYS_PLAN = [];
export const RINGS_PLAN = [];
export const ROADS_PLAN = [];
export const KEEP_FROM_CURRENT = { keep:['controles','sensibilidad','combate','trabajos'], move:[], becomes:[] };
