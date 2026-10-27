// DISEÑO DEL MAPA de Puerto Nova (hecho a mano, a partir del plano de referencia).
// Todo está escrito en "píxeles del plano" y se convierte a metros con P(px, py):
//   x (este) = (px - 870) * 1.15     z (sur) = (py - 512) * 1.15
// Norte = arriba del plano = -Z. El mar está al este y al sur; las montañas al norte y noroeste.

export const S = 1.15;
export const P = (px, py) => [(px - 870) * S, (py - 512) * S];
const PL = (list) => list.map(([a, b]) => P(a, b));

// Límites del mundo (todo lo de fuera es montaña o mar abierto)
export const WORLD = { x0: P(222, 0)[0], x1: P(1530, 0)[0], z0: P(0, 4)[1], z1: P(0, 1020)[1] };

// ---------------- GEOGRAFÍA ----------------
// Tierra firme (horario desde el noroeste). El borde norte continúa fuera del mapa (montañas).
export const MAINLAND = PL([
  [228, -60], [236, 60], [240, 130], [234, 260], [228, 420], [232, 560], [244, 655], [268, 715], [330, 742], [398, 758],
  [440, 798], [470, 858], [520, 888], [556, 928], [590, 988], [652, 1008], [720, 994], [760, 952], [800, 930], [880, 918],
  [960, 904], [1040, 888], [1100, 858], [1118, 800], [1125, 748], [1160, 706], [1215, 676], [1275, 652], [1330, 616],
  [1360, 560], [1355, 500], [1345, 442], [1400, 420], [1465, 402], [1472, 322], [1490, 250], [1505, 160], [1508, 70],
  [1485, 10], [1400, -12], [1300, -12], [1215, 0], [1165, 16], [1125, -60],   // relleno del aeropuerto al noreste
]);
export const ISLANDS = [
  { id: 'faro', pts: PL([[238, 832], [298, 806], [362, 818], [398, 856], [384, 918], [322, 952], [256, 934], [222, 884]]), peak: 22, peakAt: P(300, 880) },
  { id: 'sur', pts: PL([[1090, 945], [1150, 920], [1222, 935], [1258, 968], [1235, 1012], [1150, 1022], [1092, 995]]), peak: 14, peakAt: P(1175, 985) },
  { id: 'prision', pts: PL([[1380, 862], [1440, 836], [1505, 858], [1522, 910], [1490, 958], [1418, 965], [1378, 925]]), peak: 9, peakAt: P(1455, 905) },
  { id: 'este', pts: PL([[1380, 650], [1430, 618], [1495, 636], [1512, 690], [1470, 738], [1405, 730]]), peak: 20, peakAt: P(1450, 675) },
];
// Presa (lago entre montañas) y río que baja de la cortina al mar del noreste
export const LAKE = { level: 14, pts: PL([[595, 30], [640, 12], [700, 8], [752, 22], [785, 55], [790, 95], [772, 118], [730, 128], [680, 122], [630, 110], [600, 85], [588, 55]]) };
export const DAM = { a: P(772, 114), b: P(796, 92) };          // cortina de la presa
export const RIVER = { width: 15, pts: PL([[798, 108], [850, 112], [915, 98], [985, 74], [1050, 50], [1110, 28], [1150, 0], [1170, -40]]) };
// Calzadas sobre el mar (puentes con terraplén) y muelles sólidos
export const CAUSEWAYS = [
  { id: 'puenteFaro', width: 16, pts: PL([[455, 815], [415, 835], [372, 858]]) },
  { id: 'calzadaSur', width: 16, pts: PL([[1068, 838], [1110, 895], [1150, 945]]) },
  { id: 'puentePrision', width: 15, pts: PL([[1200, 968], [1240, 960], [1320, 935], [1392, 905]]) },
];
export const PIERS = [
  { id: 'puerto', width: 46, pts: PL([[1150, 735], [1205, 770], [1262, 812]]), h: 1.6 },
  { id: 'muelleCostera', width: 9, pts: PL([[1338, 590], [1395, 585]]), h: 1.3 },
  { id: 'muelleSur', width: 8, pts: PL([[880, 915], [895, 960]]), h: 1.2 },
  { id: 'muellePresa', width: 7, pts: PL([[650, 117], [652, 92]]), h: 15.2 },
];
// Playas de arena (el resto de la costa es rocosa)
export const SANDY = [
  PL([[1230, 380], [1380, 400], [1390, 670], [1180, 690], [1200, 560]]),
  PL([[690, 860], [1120, 820], [1130, 900], [960, 940], [700, 960]]),
  PL([[440, 780], [560, 860], [530, 910], [430, 830]]),
  PL([[1095, 930], [1160, 915], [1170, 945], [1110, 960]]),
];
// Montañas: cordilleras (polilínea + ancho + altura) y cerros sueltos
export const RIDGES = [
  { pts: PL([[200, 30], [290, 55], [380, 25], [470, 10], [560, 30]]), w: 160, h: 105 },
  { pts: PL([[215, 100], [228, 200], [232, 300]]), w: 70, h: 52 },
  { pts: PL([[560, -20], [700, -25], [840, -10], [900, 30]]), w: 95, h: 85 },
  { pts: PL([[1110, -60], [1150, -45], [1190, -50]]), w: 55, h: 44 },
  { pts: PL([[236, 330], [240, 470], [246, 620]]), w: 34, h: 14 },
];
export const HILLS = [
  { at: P(930, 145), r: 85, h: 20 }, { at: P(1035, 130), r: 70, h: 24 }, { at: P(990, 195), r: 55, h: 9 },
  { at: P(700, 965), r: 60, h: 11 }, { at: P(330, 140), r: 90, h: 10 },
];
// Mesetas (altura base elevada con borde suave): zona de montaña y alrededores de la presa
export const PLATEAUS = [
  { pts: PL([[300, 80], [600, 70], [610, 170], [560, 190], [420, 220], [330, 210], [290, 160]]), h: 20, edge: 70 },
  { pts: PL([[585, 0], [820, 0], [830, 150], [760, 160], [600, 160]]), h: 17, edge: 45 },
];

// ---------------- BARRIOS ----------------
export const ZONES = [
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
  { name: 'Anillo Periférico', cls: 'avenida', closed: true, smooth: true,
    pts: pl('R0', 'R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'R10', 'R11', 'R12', 'R13', 'R14', 'R15', 'R16', 'R17', 'R18', 'R19', 'R20', 'R21', 'R22', 'R23', 'R24', 'R26', 'R27', 'R28') },
  { name: 'Av. Juárez', cls: 'avenida', smooth: true, pts: pl('R6', [738, 280], [735, 360], 'G1', [740, 560], 'G2', [724, 745], 'R20') },
  { name: 'Av. Reforma', cls: 'avenida', smooth: true, pts: pl('R27', [380, 474], 'G3', [620, 468], 'G1', [860, 458], 'G4', [1100, 445], 'R14') },
  { name: 'Av. del Sol', cls: 'avenida', smooth: true, pts: pl('R24', [420, 672], [540, 680], [640, 672], 'G2', [860, 668], 'G5', [1100, 660], 'R16') },
  { name: 'Calzada Oriente', cls: 'avenida', smooth: true, pts: pl('R9', [1005, 330], 'G4', [998, 560], 'G5', 'R18') },
  { name: 'Av. Poniente', cls: 'avenida', smooth: true, pts: pl('R2', [480, 350], 'G3', [490, 580], [472, 690], 'R22') },
  { name: 'Malecón Costa Azul', cls: 'boulevard', smooth: true, pts: pl('R13', [1235, 400], [1282, 440], 'M1', [1305, 510], [1308, 560], [1285, 602], [1235, 630], 'R16') },
  { name: 'Calle del Mar', cls: 'calle', w: 10, sw: 3.5, pts: pl('R14', [1240, 455], 'M1') },
  { name: 'Malecón del Sur', cls: 'boulevard', smooth: true, pts: pl('R17', [1092, 780], 'S0', [1000, 866], [900, 880], [810, 892], [750, 910], [690, 925], [620, 902], [550, 868], [490, 832], 'F0', [450, 790], 'R22') },
  { name: 'Acceso al Puerto', cls: 'calle', w: 12, sw: 2, pts: pl('R17', [1130, 735], [1165, 748]) },
  { name: 'Puente del Faro', cls: 'calle', w: 10, sw: 1.5, bridge: true, pts: pl('F0', [415, 835], 'I1') },
  { name: 'Camino del Faro', cls: 'calle', w: 8, sw: 1.5, closed: true, smooth: true, pts: pl('I1', [350, 905], [300, 922], [258, 902], [252, 858], [290, 832], [340, 832]) },
  { name: 'Calzada de la Isla', cls: 'calle', w: 10, sw: 1.5, bridge: true, pts: pl('S0', [1110, 895], [1150, 945], [1200, 968]) },
  { name: 'Puente de la Prisión', cls: 'calle', w: 9, sw: 1.2, bridge: true, pts: pl([1200, 968], [1240, 960], [1320, 935], [1392, 905], [1428, 900]) },
  { name: 'Carretera de la Presa', cls: 'subida', smooth: true, pts: pl('R4', [585, 178], 'M3', [640, 150], [700, 150], [750, 148], 'D0', [835, 158], 'L0') },
  { name: 'Camino Real de las Lomas', cls: 'calle', w: 9, sw: 2, smooth: true, pts: pl('R8', 'L0', [915, 150], [985, 140], [1050, 148], [1090, 180], [1085, 215], 'R10') },
  { name: 'Paseo de los Pinos', cls: 'calle', w: 8, sw: 1.8, smooth: true, pts: pl([1050, 148], [1050, 112], [1076, 84], [1106, 96], [1110, 140], [1090, 180]) },
  { name: 'Camino de la Sierra', cls: 'subida', smooth: true, pts: pl('R1', [392, 208], [372, 180], 'M2', [337, 128], [352, 95], [400, 76], [455, 84], [505, 104], [545, 130], [580, 150], 'M3') },
  { name: 'Camino del Poniente', cls: 'subida', smooth: true, pts: pl('R0', [284, 262], [292, 222], [318, 190], 'M2') },
  { name: 'Av. del Aeropuerto', cls: 'avenida', w: 13, sw: 3, smooth: true, pts: pl('R11', [1160, 222], [1215, 208], [1290, 212], [1370, 222], [1425, 245], [1445, 300], [1430, 360], [1395, 395], [1340, 412], [1282, 440]) },
  { name: 'Acceso al Aeropuerto', cls: 'calle', w: 12, sw: 3, pts: pl([1348, 217.6], [1348, 189]) },
  { name: 'Calle de las Fábricas', cls: 'calle', w: 11, sw: 2, pts: pl('R12', [1250, 312], [1340, 306], [1445, 300]) },
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
  { id: 'faro', kind: 'faro', name: 'Faro de Punta Nova', at: P(298, 878), hx: 16, hz: 16, fixed: true },
  { id: 'mirador', kind: 'mirador', name: 'Mirador de la Isla', at: P(1172, 985), hx: 16, hz: 16, fixed: true },
  { id: 'jail', kind: 'carcel', name: 'Prisión Isla Nova', at: P(1452, 902), hx: 24, hz: 18, fixed: true, rot: -0.4 },
  { id: 'aeropuerto', kind: 'aeropuerto', name: 'Aeropuerto Internacional', at: P(1346, 112), hx: 160, hz: 90, fixed: true, rot: 0.02 },
  { id: 'presa', kind: 'presa', name: 'Presa La Esperanza', at: P(792, 128), hx: 26, hz: 14, fixed: true, rot: -0.75 },
  { id: 'mina', kind: 'mina', name: 'Mina El Cerro', at: P(300, 145), hx: 34, hz: 30, fixed: true, rot: 0.4 },
  { id: 'granja', kind: 'granja', name: 'Granja Los Pinos', at: P(440, 165), hx: 40, hz: 30, fixed: true, rot: 0.15 },
  { id: 'club', kind: 'club', name: 'Club de Golf Las Lomas', at: P(985, 105), hx: 50, hz: 34, fixed: true, rot: -0.25 },
  { id: 'puerto', kind: 'puerto', name: 'Puerto de Carga', at: P(1205, 772), hx: 22, hz: 60, fixed: true, rot: 2.18 },
  { id: 'reciclaje', kind: 'reciclaje', name: 'Centro de Reciclaje', at: P(1395, 355), hx: 28, hz: 22 },
  { id: 'fabrica', kind: 'fabrica', name: 'Fábrica Nova', at: P(1300, 262), hx: 30, hz: 20 },
];

// Zonas seguras: no se puede hacer daño (radio en metros)
export const SAFE_ZONES = [
  { site: 'plaza', r: 75 }, { site: 'hospital', r: 50 }, { site: 'parque_media', r: 42 }, { site: 'parque_sur', r: 36 },
  { site: 'jobcenter', r: 30 }, { site: 'mall', r: 50 }, { site: 'terminal', r: 45 }, { site: 'escuela', r: 40 },
  { site: 'iglesia', r: 30 }, { site: 'catedral', r: 30 }, { site: 'club', r: 70 }, { site: 'faro', r: 50 },
  { at: P(1310, 520), r: 110, name: 'Playa Costa Azul' }, { at: P(900, 905), r: 110, name: 'Playa del Sur' },
  { site: 'presa', r: 60 }, { site: 'mirador', r: 40 },
];
