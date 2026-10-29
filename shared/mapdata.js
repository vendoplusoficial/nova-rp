// Plano maestro insular. La geografía y las vías exteriores se trazan en masterMap.js.
// P conserva los puntos de los barrios y servicios existentes dentro de la ciudad costera.
import { M, MASTER_ROADS } from './masterMap.js';
export { MASTER_BOUNDS as WORLD, MAINLAND, ISLANDS, LAKE, DAM, RIVER, CAUSEWAYS, PIERS, SANDY, RIDGES, HILLS, PLATEAUS } from './masterMap.js';
export const S = 6000 / 1536;
export const P = (px, py) => M(300 + (px - 262) * 0.70, 450 + (py - 193) * 0.38);
const PL = (list) => list.map(([x, y]) => P(x, y));

// ---------------- BARRIOS ----------------
export const ZONES = [
  { id: 'isla', pts: [M(0,735),M(480,735),M(480,1000),M(0,1000)] },
  { id: 'montana', pts: [M(390,30),M(900,30),M(900,395),M(650,440),M(480,330)] },
  { id: 'residencial', pts: [M(120,150),M(440,150),M(580,400),M(300,435),M(120,310)] },
  { id: 'media', pts: [M(980,275),M(1250,275),M(1260,370),M(1050,370)] },
  { id: 'industrial', pts: [M(1160,180),M(1390,180),M(1390,300),M(1160,300)] },
  { id: 'exclusiva', pts: [M(1000,590),M(1370,590),M(1400,800),M(1050,800)] },
  { id: 'centro', pts: PL([[540, 205], [1000, 212], [1060, 228], [1105, 245], [1165, 315], [1186, 415], [1188, 445], [992, 448], [733, 470], [500, 470], [480, 350], [470, 222]]) },
  { id: 'media', pts: PL([[262, 405], [300, 300], [400, 240], [470, 222], [480, 350], [500, 470], [262, 470]]) },
  { id: 'comercial', pts: PL([[733, 470], [992, 448], [1188, 445], [1185, 535], [1158, 636], [1000, 668], [735, 665], [740, 560]]) },
  { id: 'popular', pts: PL([[262, 470], [500, 470], [733, 470], [740, 560], [735, 665], [640, 672], [540, 680], [420, 672], [318, 650], [262, 520]]) },
  { id: 'residencial', pts: PL([[318, 650], [420, 672], [540, 680], [735, 665], [760, 700], [755, 815], [690, 822], [560, 805], [460, 765], [370, 705]]) },
  { id: 'sur', pts: PL([[735, 665], [1000, 668], [1158, 636], [1095, 715], [980, 778], [830, 808], [755, 815], [760, 700]]) },
  { id: 'costa', pts: PL([[1186, 415], [1235, 395], [1400, 420], [1345, 442], [1360, 560], [1330, 616], [1275, 652], [1158, 636], [1185, 535]]) },
  { id: 'puerto', pts: PL([[1158, 636], [1275, 652], [1300, 840], [1125, 790], [1095, 715]]) },
  { id: 'playa', pts: PL([[1095, 715], [1125, 790], [1110, 870], [1040, 900], [880, 930], [760, 960], [650, 1015], [560, 940], [520, 895], [440, 805], [460, 765], [560, 805], [690, 822], [830, 808], [980, 778]]) },
  { id: 'industrial', pts: PL([[1105, 245], [1180, 232], [1432, 182], [1470, 300], [1465, 402], [1400, 420], [1235, 395], [1186, 415], [1165, 315]]) },
  { id: 'aeropuerto', pts: PL([[1105, 245], [1130, -40], [1250, -20], [1400, -20], [1520, 40], [1520, 200], [1432, 190], [1180, 232]]) },
  { id: 'exclusiva', pts: PL([[850, 198], [860, 140], [960, 105], [1060, 70], [1130, -40], [1105, 245], [1000, 212]]) },
  { id: 'presa', pts: PL([[540, 205], [570, 160], [570, -40], [880, -40], [860, 140], [850, 198]]) },
  { id: 'montana', pts: PL([[150, -60], [570, -60], [570, 160], [540, 205], [400, 240], [300, 300], [262, 405], [150, 405]]) },
  { id: 'isla', pts: PL([[200, 800], [420, 790], [420, 980], [200, 980]]) },
  { id: 'isla', pts: PL([[1080, 900], [1270, 900], [1270, 1030], [1080, 1030]]) },
  { id: 'prision', pts: PL([[1360, 820], [1540, 820], [1540, 980], [1360, 980]]) },
];

// ---------------- RED VIAL (diseñada a mano; pasa por los puntos indicados) ----------------
// Nodos compartidos (las calles que se cruzan usan EXACTAMENTE el mismo punto)
const N = {
  R0: [300, 300], R1: [400, 240], R2: [470, 222], R3: [540, 205], R4: [600, 197], R5: [690, 192], R6: [735, 193], R7: [820, 197],
  R8: [880, 200], R9: [1000, 212], R10: [1060, 228], R11: [1105, 245], R12: [1165, 315], R13: [1186, 415], R14: [1188, 445],
  R15: [1185, 535], R16: [1158, 636], R17: [1095, 715], R18: [980, 778], R19: [830, 808], R20: [712, 818], R21: [560, 805],
  R22: [460, 765], R23: [370, 705], R24: [318, 650], R26: [262, 520], R27: [262, 470], R28: [262, 405],
  G1: [733, 470], G2: [735, 665], G3: [500, 470], G4: [992, 448], G5: [1000, 668],
  M1: [1293, 470], M2: [352, 160], M3: [598, 158], L0: [875, 172], S0: [1068, 838], F0: [455, 815], I1: [372, 858], D0: [790, 135],
};
const n = (k) => P(...N[k]);
const pl = (...pts) => pts.map((p) => (typeof p === 'string' ? n(p) : P(p[0], p[1])));

// clase: avenida | boulevard | calle | subida (camino de montaña) ; smooth = curva suave por los puntos
export const MAIN_ROADS = [
  ...MASTER_ROADS,
  { name: 'Anillo Periférico', cls: 'avenida', closed: true, smooth: true,
    pts: pl('R0', 'R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'R10', 'R11', 'R12', 'R13', 'R14', 'R15', 'R16', 'R17', 'R18', 'R19', 'R20', 'R21', 'R22', 'R23', 'R24', 'R26', 'R27', 'R28') },
  { name: 'Av. Juárez', cls: 'avenida', smooth: true, pts: pl('R6', [738, 280], [735, 360], 'G1', [740, 560], 'G2', [724, 745], 'R20') },
  { name: 'Av. Reforma', cls: 'avenida', smooth: true, pts: pl('R27', [380, 474], 'G3', [620, 468], 'G1', [860, 458], 'G4', [1100, 445], 'R14') },
  { name: 'Av. del Sol', cls: 'avenida', smooth: true, pts: pl('R24', [420, 672], [540, 680], [640, 672], 'G2', [860, 668], 'G5', [1100, 660], 'R16') },
  { name: 'Calzada Oriente', cls: 'avenida', smooth: true, pts: pl('R9', [1005, 330], 'G4', [998, 560], 'G5', 'R18') },
  { name: 'Av. Poniente', cls: 'avenida', smooth: true, pts: pl('R2', [480, 350], 'G3', [490, 580], [472, 690], 'R22') },
  { name: 'Malecón Costa Azul', cls: 'boulevard', smooth: true, pts: pl('R13', [1235, 400], [1282, 440], 'M1', [1305, 510], [1308, 560], [1285, 602], [1235, 630], 'R16') },
  { name: 'Calle del Mar', cls: 'calle', w: 10, sw: 3.5, pts: pl('R14', [1240, 455], 'M1') },
  { name:'Malecón del Sur', cls:'boulevard', smooth:true,
    pts:[P(1095,715),M(875,720),M(830,726),M(780,718),M(730,706),M(680,688),M(630,674),M(575,668),M(520,665),M(460,682),M(420,688),M(380,680),P(460,765)] },
  { name: 'Acceso al Puerto', cls: 'calle', w: 12, sw: 2, pts: pl('R17', [1130, 735], [1165, 748]) },

];
export const ROUNDABOUTS = [
  { at: n('G1'), r: 24, name: 'Glorieta de la Independencia', deco: 'monumento' },
  { at: n('G5'), r: 22, name: 'Glorieta del Sol', deco: 'fuente' },
  { at: n('G3'), r: 20, name: 'Glorieta Poniente', deco: 'jardin' },
];

// Calles de barrio: trama por barrio (orientación en grados, separación, ancho, ondulación)
export const STREET_RULES = {
  centro: { angle: 2, spacing: [64, 58], w: 10, sw: 3.5, warp: 0 },
  comercial: { angle: -3, spacing: [92, 76], w: 11, sw: 3, warp: 0 },
  media: { angle: 18, spacing: [72, 58], w: 8.5, sw: 2.5, warp: 7 },
  popular: { angle: -6, spacing: [50, 42], w: 7, sw: 1.6, warp: 3 },
  residencial: { angle: 12, spacing: [66, 54], w: 8, sw: 2.2, warp: 10 },
  sur: { angle: -8, spacing: [80, 66], w: 10, sw: 3, warp: 0 },
  industrial: { angle: -3, spacing: [96, 84], w: 11, sw: 1.5, warp: 0 },
  exclusiva: { angle: 25, spacing: [120, 96], w: 7.5, sw: 1.6, warp: 16 },
  costa: { angle: 75, spacing: [70, 999], w: 9, sw: 3, warp: 0 },
  playa: { angle: 90, spacing: [999, 74], w: 9, sw: 3, warp: 0 },
};

// ---------------- LUGARES ----------------
// kind = constructor en landmarks.js ; at = punto aproximado (se acomoda a la manzana) ; hx/hz tamaño
export const SITE_DEFS = [
  { id: 'plaza', kind: 'plaza', name: 'Plaza Central', at: P(800, 300), hx: 40, hz: 36 },
  { id: 'catedral', kind: 'catedral', name: 'Catedral de Nova', at: P(800, 246), hx: 17, hz: 22 },
  { id: 'hospital', kind: 'hospital', name: 'Hospital General', at: P(668, 262), hx: 32, hz: 24 },
  { id: 'police', kind: 'comisaria', name: 'Comisaría Principal', at: P(668, 335), hx: 21, hz: 12 },
  { id: 'banco', kind: 'banco', name: 'Banco Nova', at: P(880, 360), hx: 14, hz: 12 },
  { id: 'ayuntamiento', kind: 'ayuntamiento', name: 'Ayuntamiento', at: P(780, 405), hx: 24, hz: 16 },
  { id: 'juzgado', kind: 'juzgado', name: 'Palacio de Justicia', at: P(900, 300), hx: 18, hz: 14 },
  { id: 'bomberos', kind: 'bomberos', name: 'Estación de Bomberos', at: P(940, 410), hx: 16, hz: 12 },
  { id: 'jobcenter', kind: 'repartos', name: 'Centro de Trabajos', at: P(960, 615), hx: 21, hz: 12 },
  { id: 'mall', kind: 'super', name: 'Plaza Comercial Nova', at: P(865, 515), hx: 34, hz: 24 },
  // concesionarios por gama: económico en el barrio popular (Av. del Sol), medio en la zona
  // comercial junto a la plaza comercial (Av. Reforma) y de lujo en el Malecón Costa Azul
  { id: 'concesionario', kind: 'concesionario', tier: 'medio', name: 'Autos Nova', at: P(790, 540), hx: 24, hz: 18 },
  { id: 'conc_economico', kind: 'concesionario', tier: 'economico', name: 'Seminuevos El Ahorro', at: P(600, 640), hx: 22, hz: 16 },
  { id: 'conc_lujo', kind: 'concesionario', tier: 'lujo', name: 'Prestige Motors', at: P(1240, 470), hx: 24, hz: 18 },
  { id: 'taller', kind: 'taller', name: 'Taller Mecánico El Pistón', at: P(905, 600), hx: 14, hz: 11 },
  { id: 'gunshop', kind: 'armeria', name: 'Armería Nova', at: P(1100, 585), hx: 30, hz: 28 },
  { id: 'gas1', kind: 'gasolinera', name: 'Gasolinera Nova', at: P(1060, 500), hx: 18, hz: 12, brand: 0 },
  { id: 'gas2', kind: 'gasolinera', name: 'Gasolinera Poniente', at: P(370, 455), hx: 18, hz: 12, brand: 2 },
  { id: 'gas3', kind: 'gasolinera', name: 'Gasolinera del Sur', at: P(880, 760), hx: 18, hz: 12, brand: 1 },
  { id: 'terminal', kind: 'terminal', name: 'Terminal de Autobuses', at: P(830, 728), hx: 30, hz: 18 },
  { id: 'escuela', kind: 'escuela', name: 'Escuela Benito Juárez', at: P(420, 420), hx: 24, hz: 18 },
  { id: 'parque_media', kind: 'parque', name: 'Parque Jardines', at: P(390, 330), hx: 30, hz: 24 },
  { id: 'iglesia', kind: 'iglesia', name: 'Parroquia de San Juan', at: P(590, 560), hx: 14, hz: 18 },
  { id: 'cancha', kind: 'cancha', name: 'Cancha Las Flores', at: P(470, 600), hx: 28, hz: 20 },
  { id: 'mercado', kind: 'mercado', name: 'Mercado Popular', at: P(660, 520), hx: 21, hz: 14 },
  { id: 'gimnasio', kind: 'gimnasio', name: 'Gimnasio Titán', at: P(660, 780), hx: 14, hz: 11 },
  { id: 'parque_sur', kind: 'plazuela', name: 'Jardín del Sur', at: P(560, 740), hx: 24, hz: 20 },
  { id: 'deportiva', kind: 'deportiva', name: 'Unidad Deportiva', at: P(380, 560), hx: 50, hz: 34 },
  { id: 'disco', kind: 'disco', name: 'Discoteca Neón', at: P(1255, 545), hx: 14, hz: 12 },
  { id: 'faro', kind: 'faro', name: 'Faro de Punta Nova', at: M(92, 843), hx: 16, hz: 16, fixed: true },
  { id: 'mirador', kind: 'mirador', name: 'Mirador de la Sierra', at: M(635, 80), hx: 16, hz: 16, fixed: true },
  { id: 'jail', kind: 'carcel', name: 'Prisión Isla Nova', at: M(350, 870), hx: 24, hz: 18, fixed: true, rot: -0.4 },
  { id: 'aeropuerto', kind: 'aeropuerto', name: 'Aeropuerto Internacional', at: M(1250, 225), hx: 160, hz: 90, fixed: true, rot: 0 },
  { id: 'mina', kind: 'mina', name: 'Mina El Cerro', at: M(770, 280), hx: 34, hz: 30, fixed: true, rot: 0.4 },
  { id: 'granja', kind: 'granja', name: 'Granja Los Pinos', at: M(1040, 220), hx: 40, hz: 30, fixed: true, rot: 0.15 },
  { id: 'club', kind: 'club', name: 'Club de Golf Las Lomas', at: M(1160, 670), hx: 50, hz: 34, fixed: true, rot: -0.25 },
  { id: 'puerto', kind: 'puerto', name: 'Puerto de Carga', at: M(880, 795), hx: 22, hz: 60, fixed: true, rot: 0 },
  { id: 'reciclaje', kind: 'reciclaje', name: 'Centro de Reciclaje', at: M(1280, 745), hx: 28, hz: 22, fixed: true },
  { id: 'fabrica', kind: 'fabrica', name: 'Fábrica Nova', at: M(1345, 750), hx: 30, hz: 20, fixed: true },
];

// Zonas seguras: no se puede hacer daño (radio en metros)
export const SAFE_ZONES = [
  { site: 'plaza', r: 75 }, { site: 'hospital', r: 50 }, { site: 'parque_media', r: 42 }, { site: 'parque_sur', r: 36 },
  { site: 'jobcenter', r: 30 }, { site: 'mall', r: 50 }, { site: 'terminal', r: 45 }, { site: 'escuela', r: 40 },
  { site: 'iglesia', r: 30 }, { site: 'catedral', r: 30 }, { site: 'club', r: 70 }, { site: 'faro', r: 50 },
  { at: P(1310, 520), r: 110, name: 'Playa Costa Azul' }, { at: P(900, 905), r: 110, name: 'Playa del Sur' },
  { site: 'presa', r: 60 }, { site: 'mirador', r: 40 },
];
