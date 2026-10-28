// PLANO MAESTRO DEL MUNDO DE NOVA RP (etapa 1: planificación; todavía no se usa en el juego).
//
// Todo está trazado sobre la imagen de referencia (1323 x 1189 px) y se convierte a metros con W():
//   x (este) = (px - 692) * 4.4 - 45      z (sur) = (py - 850) * 4.4 + 76
// Con esta escala (4.4 m por píxel de la imagen) la Ciudad Costera actual cae exactamente donde
// la imagen dibuja la Ciudad Costera (puerto e islas incluidos): el mundo mide ~5.8 x 5.2 km,
// compacto como San Andreas. (La barra de escala dibujada en la imagen daría ~25 km: se descarta.)
//
// Ejes: +X = este, +Z = sur (norte de la imagen = -Z). Nivel del mar = 0.

import { P } from './mapdata.js';

export const PX_M = 4.4;
export const W = (px, py) => [(px - 692) * PX_M - 45, (py - 850) * PX_M + 76];
const WL = (list) => list.map(([a, b]) => W(a, b));
export const WORLD_PLAN_BOUNDS = { x0: W(0, 0)[0], x1: W(1323, 0)[0], z0: W(0, 0)[1], z1: W(0, 1189)[1] };

// ---------------- REGIONES (tierra firme) ----------------
// Región 1 = la ciudad actual (shared/mapdata.js MAINLAND, sin cambios en su costa sur y este)
// UNIDA a este territorio nuevo: campo, pueblos, rancho y planta eléctrica alrededor de la ciudad.
// El polígono se traslapa a propósito con la ciudad actual (la unión no crea mar).
export const REGIONS = [
  {
    id: 'costera', name: 'Región Costera', style: 'costera',
    keepCityMainland: true,
    coast: WL([[841, 809], [900, 825], [960, 850], [1040, 872], [1120, 862], [1172, 830], [1192, 770], [1186, 700], [1140, 640], [1070, 600],
      [1000, 580], [940, 570], [860, 555], [780, 540], [700, 525], [620, 515], [560, 520], [500, 540], [420, 560], [330, 565], [260, 575],
      [200, 560], [150, 512], [80, 520], [56, 560], [72, 612], [122, 642], [160, 700], [156, 780], [192, 832], [262, 862], [332, 882],
      [392, 906], [445, 940], [500, 955], [545, 890]]),
  },
  {
    id: 'montana', name: 'Región Montañosa', style: 'montana',
    coast: WL([[60, 95], [120, 45], [200, 22], [330, 14], [450, 30], [540, 48], [610, 80], [650, 130], [655, 200], [640, 260], [610, 320],
      [580, 380], [545, 440], [520, 480], [470, 500], [430, 490], [425, 420], [400, 400], [330, 396], [270, 398], [245, 410], [240, 450],
      [220, 465], [180, 440], [130, 400], [90, 370], [50, 330], [25, 270], [22, 190], [35, 130]]),
  },
  {
    id: 'desierto', name: 'Región Desértica', style: 'desierto',
    coast: WL([[720, 55], [790, 25], [900, 15], [1010, 12], [1110, 25], [1180, 70], [1250, 100], [1300, 170], [1312, 280], [1300, 380],
      [1310, 470], [1305, 560], [1260, 600], [1170, 600], [1080, 580], [1020, 540], [985, 490], [940, 460], [870, 440], [800, 430],
      [760, 410], [745, 360], [735, 300], [740, 250], [725, 180], [715, 110]]),
  },
];

// ---------------- CIUDADES PRINCIPALES (una por región) ----------------
// zona urbana = rectángulo aproximado; el periférico la rodea
export const CITIES = [
  { id: 'costera', region: 'costera', name: 'Puerto Nova', existing: true, center: W(692, 850) },
  { id: 'montana', region: 'montana', name: 'Ciudad Montañosa', center: W(292, 305), urban: WL([[170, 232], [418, 232], [418, 380], [175, 380]]), port: WL([[250, 390], [420, 390], [420, 500], [250, 500]]), style: 'colinas' },
  { id: 'desierto', region: 'desierto', name: 'Ciudad Desértica', center: W(992, 288), urban: WL([[850, 165], [1135, 165], [1135, 410], [850, 410]]), style: 'desierto' },
];

// ---------------- PUEBLOS Y LUGARES FUERA DE LAS CIUDADES ----------------
export const TOWNS = [
  // Región costera
  { id: 'pueblo_lago', region: 'costera', name: 'Pueblo del Lago', at: W(360, 712), size: 'pueblo', near: 'lago_costero' },
  { id: 'pueblo_costero', region: 'costera', name: 'Pueblo Costero', at: W(372, 852), size: 'pueblo', coast: true },
  { id: 'pueblo_rural', region: 'costera', name: 'Pueblo Rural', at: W(860, 655), size: 'pueblo' },
  { id: 'rancho', region: 'costera', name: 'Rancho', at: W(655, 635), size: 'rancho' },
  { id: 'planta_electrica', region: 'costera', name: 'Planta Eléctrica', at: W(1090, 775), size: 'instalacion' },
  // Región montañosa
  { id: 'pueblo_alto', region: 'montana', name: 'Pueblo Alto', at: W(140, 118), size: 'pueblo', elevated: true },
  { id: 'pueblo_bosque', region: 'montana', name: 'Pueblo del Bosque', at: W(470, 100), size: 'pueblo', forest: true },
  { id: 'pueblo_lago_verde', region: 'montana', name: 'Pueblo Lago Verde', at: W(128, 255), size: 'pueblo', near: 'lago_verde' },
  { id: 'mirador', region: 'montana', name: 'Mirador', at: W(615, 135), size: 'mirador' },
  { id: 'hidroelectrica', region: 'montana', name: 'Central Hidroeléctrica', at: W(585, 318), size: 'instalacion', river: 'rio_montana' },
  // Región desértica
  { id: 'pueblo_oasis', region: 'desierto', name: 'Pueblo Oasis', at: W(872, 135), size: 'pueblo', near: 'oasis' },
  { id: 'pueblo_ruta', region: 'desierto', name: 'Pueblo Ruta', at: W(1250, 330), size: 'pueblo', roadside: true },
  { id: 'pueblo_minero', region: 'desierto', name: 'Pueblo Minero', at: W(1235, 455), size: 'pueblo' },
  { id: 'mina_desierto', region: 'desierto', name: 'Mina del Desierto', at: W(1185, 520), size: 'instalacion' },
  { id: 'aeropuerto', region: 'desierto', name: 'Aeropuerto Internacional', at: W(1205, 205), size: 'aeropuerto', runway: WL([[1140, 210], [1272, 214]]) },
];

// ---------------- AGUA DENTRO DE LAS REGIONES ----------------
export const LAKES_PLAN = [
  { id: 'lago_costero', region: 'costera', center: W(420, 672), rx: 50 * PX_M, rz: 30 * PX_M },
  { id: 'lago_verde', region: 'montana', center: W(105, 215), rx: 26 * PX_M, rz: 20 * PX_M },
  { id: 'oasis', region: 'desierto', center: W(915, 132), rx: 22 * PX_M, rz: 30 * PX_M },
];
export const RIVERS_PLAN = [
  { id: 'rio_montana', region: 'montana', width: 14, pts: WL([[540, 160], [568, 240], [590, 300], [606, 335], [628, 348]]) },
];

// playas de arena de las regiones nuevas (en el desierto toda la costa es de arena)
export const BEACHES_PLAN = [
  { region: 'costera', pts: WL([[290, 845], [410, 850], [450, 905], [390, 925], [300, 890], [250, 860]]) },
  { region: 'costera', pts: WL([[60, 545], [130, 520], [160, 560], [90, 600]]) },
  { region: 'montana', pts: WL([[30, 200], [60, 170], [70, 260], [35, 270]]) },
];

// ---------------- RELIEVE ----------------
// sierras (polilínea, semiancho en m, altura en m) y zonas de terreno
export const RANGES_PLAN = [
  { region: 'montana', pts: WL([[200, 70], [300, 60], [400, 90], [470, 140]]), w: 300, h: 230, kind: 'cordillera' },
  { region: 'montana', pts: WL([[480, 40], [560, 70], [600, 120]]), w: 220, h: 160, kind: 'cordillera' },
  { region: 'montana', pts: WL([[30, 190], [45, 300]]), w: 140, h: 70, kind: 'cerros' },
  { region: 'montana', pts: WL([[520, 230], [560, 280]]), w: 120, h: 55, kind: 'cerros' },
  { region: 'desierto', pts: WL([[1030, 40], [1130, 70], [1200, 130]]), w: 240, h: 150, kind: 'arida' },
  { region: 'desierto', pts: WL([[1170, 250], [1250, 330], [1270, 420]]), w: 160, h: 90, kind: 'arida' },
  { region: 'desierto', pts: WL([[1060, 460], [1150, 500], [1250, 540]]), w: 170, h: 85, kind: 'canones' },
  { region: 'desierto', pts: WL([[770, 320], [800, 400]]), w: 120, h: 50, kind: 'arida' },
  { region: 'costera', pts: WL([[560, 560], [640, 560], [720, 575]]), w: 150, h: 35, kind: 'colinas' },
  { region: 'costera', pts: WL([[980, 640], [1080, 660], [1140, 700]]), w: 160, h: 40, kind: 'colinas' },
];

// ---------------- RED DE CARRETERAS PRINCIPAL ----------------
// cls: autopista (2 carriles por sentido, acotamientos) | carretera (principal) | secundaria | terraceria (tierra)
// bridge: [i, j] = el tramo entre los puntos i..j va sobre el agua (puente con soportes y barandal)
export const HIGHWAYS_PLAN = [
  // sale del Anillo Periférico de Puerto Nova (nodo R28), rodea el lago por el sur y cruza al noroeste
  { id: 'A1', name: 'Autopista del Poniente', cls: 'autopista', from: 'costera', to: 'montana',
    pts: [P(262, 405), ...WL([[480, 760], [420, 742], [340, 722], [260, 662], [180, 612], [125, 575], [112, 532], [140, 398], [162, 340], [163, 310]])], bridge: [7, 8] },
  // sale del Anillo por el norte (nodo R6 / Av. Juárez), pasa junto al rancho y cruza al sureste de la montaña
  { id: 'A2', name: 'Autopista Central', cls: 'autopista', from: 'costera', to: 'montana',
    pts: [P(735, 193), ...WL([[690, 680], [660, 610], [610, 575], [598, 545], [530, 452], [500, 420], [460, 380], [424, 345]])], bridge: [4, 5] },
  // cruza el río de la montaña (puente corto) y el mar hacia el desierto (puente largo)
  { id: 'A3', name: 'Autopista del Norte', cls: 'autopista', from: 'montana', to: 'desierto',
    pts: WL([[420, 238], [500, 215], [550, 209], [565, 207], [580, 205], [638, 222], [700, 245], [760, 265], [830, 275], [845, 290]]), bridge: [5, 7], bridges: [[2, 3]] },
  // sale del Anillo por el noreste (nodo R12), pasa por el Pueblo Rural y cruza al desierto
  { id: 'A4', name: 'Autopista del Oriente', cls: 'autopista', from: 'costera', to: 'desierto',
    pts: [P(1165, 315), ...WL([[880, 735], [940, 700], [1000, 660], [1010, 620], [982, 592], [1010, 525], [1035, 472], [1040, 420], [1000, 415]])], bridge: [5, 7] },
  { id: 'C1', name: 'Carretera de la Hidroeléctrica', cls: 'carretera', from: 'montana', to: 'desierto',
    pts: WL([[424, 330], [520, 330], [590, 332], [680, 362], [765, 392], [845, 400]]), bridge: [2, 4] },
];
// periféricos (anillos cerrados alrededor de cada ciudad nueva; el de Puerto Nova ya existe)
export const RINGS_PLAN = [
  { city: 'montana', name: 'Periférico de la Sierra', pts: WL([[170, 230], [300, 222], [420, 230], [425, 320], [420, 385], [300, 388], [178, 385], [160, 320]]) },
  { city: 'desierto', name: 'Circuito del Desierto', pts: WL([[848, 168], [990, 160], [1138, 168], [1142, 290], [1138, 412], [990, 418], [848, 412], [842, 290]]) },
];
// caminos a pueblos, miradores y lugares (los de tierra son explorables)
export const ROADS_PLAN = [
  { name: 'Camino a Pueblo Costero', cls: 'secundaria', pts: [P(262, 520), ...WL([[470, 835], [400, 848], [372, 852]])] },
  { name: 'Camino del Lago', cls: 'secundaria', pts: WL([[340, 722], [360, 712], [350, 760], [372, 852]]) },
  { name: 'Camino al Rancho', cls: 'terraceria', pts: WL([[668, 625], [655, 635], [620, 650]]) },
  { name: 'Carretera Pueblo Rural', cls: 'secundaria', pts: WL([[880, 735], [865, 690], [860, 655], [900, 625], [960, 600]]) },
  { name: 'Carretera a la Planta', cls: 'secundaria', pts: [P(1186, 415), ...WL([[960, 792], [1050, 782], [1090, 775]])] },
  { name: 'Camino de Pueblo Alto', cls: 'secundaria', pts: WL([[164, 300], [150, 220], [140, 160], [140, 118]]) },
  { name: 'Camino Lago Verde', cls: 'terraceria', pts: WL([[150, 220], [128, 255], [100, 245]]) },
  { name: 'Camino del Bosque', cls: 'secundaria', pts: WL([[420, 250], [450, 180], [470, 100]]) },
  { name: 'Subida al Mirador', cls: 'terraceria', pts: WL([[580, 205], [598, 175], [608, 150], [615, 135]]) },
  { name: 'Ruta de la Sierra', cls: 'terraceria', pts: WL([[140, 118], [250, 120], [350, 150], [470, 100]]), tunnel: [1, 2] },
  { name: 'Camino al Oasis', cls: 'secundaria', pts: WL([[848, 200], [860, 160], [872, 135]]) },
  { name: 'Acceso al Aeropuerto', cls: 'carretera', pts: WL([[1138, 260], [1175, 235], [1205, 215]]) },
  { name: 'Carretera Pueblo Ruta', cls: 'carretera', pts: WL([[1140, 330], [1200, 330], [1250, 330]]) },
  { name: 'Camino Minero', cls: 'terraceria', pts: WL([[1140, 400], [1200, 438], [1235, 455], [1190, 515], [1185, 520]]) },
  { name: 'Ruta del Desierto', cls: 'terraceria', pts: WL([[1250, 330], [1275, 400], [1235, 455]]) },
];

// ---------------- QUÉ PASA CON LA CIUDAD ACTUAL ----------------
export const KEEP_FROM_CURRENT = {
  keep: ['toda la ciudad (barrios, calles, sitios)', 'puerto', 'playas', 'islas del faro y de la prisión', 'presa y su lago', 'concesionarios'],
  move: [{ id: 'aeropuerto', to: 'Región Desértica (como en la imagen)' }],
  becomes: [{ what: 'terreno del aeropuerto actual (noreste)', into: 'zona industrial y de carga junto al Pueblo Rural' }],
};
