// Arquitectura de los lotes: cada estilo genera "piezas" en coordenadas locales del lote.
// Lote: centro (0,0), ancho w (eje X local), fondo d (eje Z local). El FRENTE (la calle) está en +Z.
//
// Tipos de pieza (k):
//  box   cuerpo (s: 'plain' | 'win' | 'house' | 'glass'); col=1 => colisiona
//  gable / hip   techo a dos o cuatro aguas sobre (w,d) a la altura y (rh = altura del techo)
//  slab  losa delgada (aleros, toldos planos, terrazas)
//  awn   toldo inclinado con franjas (c, c2)
//  cyl / cone   cilindro / cono (r, r2, h, seg)
//  door / win   puerta / ventana sobre una fachada (r = hacia dónde mira; 0 = +Z)
//  sign  letrero con texto
//  decal suelo pintado (pasto, patio, estacionamiento, agua...)
//  fence barda / reja / seto / cerca de madera entre (x,z) y (x2,z2)
//  prop  objeto (árbol, banca, mesa, sombrilla, auto, tinaco, maceta...)
// det=1 => detalle (solo se dibuja de cerca). Todo es determinista según la semilla del lote.

import { PALETTES } from './districts.js';

export const NAMES = {
  pizzeria: ['Pizzería Vesubio', 'Pizza Nova', 'La Trattoria', 'Pizzería Don Gino', 'Horno de Leña'],
  taqueria: ['Tacos El Faro', 'Taquería Los Primos', 'Tacos Don Chuy', 'El Trompo Loco', 'Taquería La Güera'],
  cafe: ['Café Central', 'Café de la Bahía', 'La Tostadora', 'Café Brisa', 'Café Mirador'],
  burger: ['Burger Puerto', 'Nova Burger', 'Big Wave Burgers', 'Burger Brava'],
  sushi: ['Sushi Bahía', 'Sakura Sushi', 'Kaito Sushi Bar', 'Sushi Nami'],
  mariscos: ['Mariscos El Ancla', 'La Palapa del Güero', 'Mariscos La Ola', 'El Pescador'],
  tienda: ['Abarrotes Doña Luz', 'Tienda La Esquinita', 'Abarrotes El Sol', 'Miscelánea Lupita', 'Tienda Don Beto', 'Abarrotes La Fe'],
  farmacia: ['Farmacia Nova', 'Farmacia del Ahorro', 'Farmacia San José'],
  shop: ['Boutique Marina', 'Zapatería Paso', 'Electro Bahía', 'Ferretería Tornillo', 'Libros & Café', 'Florería Brisa', 'Óptica Visión', 'Panadería Sol', 'Heladería Polar', 'Pastelería Luna'],
  taller: ['Taller El Pistón', 'Llantera Don Toño', 'Taller Hermanos Ruiz', 'Hojalatería La Curva', 'Mofles y Frenos Nova', 'Taller El Turbo'],
  concesionario: ['Autos Bahía', 'Seminuevos del Sur', 'Motores Nova', 'Autos Costa Azul'],
  hotel: ['Hotel Gran Bahía', 'Hotel Costa Azul', 'Hotel Nova Plaza', 'Hotel Mar de Plata', 'Hotel Las Palmas'],
};

const SIGN_BG = { taller: '#263238', concesionario: '#0d47a1', pizzeria: '#b71c1c', taqueria: '#ff6f00', cafe: '#2e5e3e', burger: '#d32f2f', sushi: '#212121', mariscos: '#0d47a1', tienda: '#f9a825', farmacia: '#2e7d32', shop: '#37474f', hotel: '#0b2a3c' };

// ---------- ayudantes ----------
const box = (x, z, w, d, h, c, o = {}) => ({ k: 'box', x, z, y: o.y || 0, w, d, h, c, s: o.s || 'plain', col: o.col ?? 1, r: o.r || 0, det: o.det ? 1 : 0, c2: o.c2, f: o.f, gf: o.gf, fh: o.fh, cw: o.cw, par: o.par, rc: o.rc, gfH: o.gfH, gfc: o.gfc, noBalc: o.noBalc, noFins: o.noFins, noPar: o.noPar });
// panel con textura del atlas (vitrinas, ventanales, aire acondicionado...). r = hacia dónde mira
const panel = (cell, x, z, y, w, h, o = {}) => ({ k: 'panel', cell, x, z, y, w, h, r: o.r || 0, c: o.c, fc: o.fc, det: o.det ? 1 : 0 });
const deco = (x, z, w, d, h, c, o = {}) => box(x, z, w, d, h, c, { ...o, col: 0, det: o.det ?? 1 });
const decal = (x, z, w, d, c, o = {}) => ({ k: 'decal', x, z, w, d, c, y: o.y || 0, r: o.r || 0, det: o.det ? 1 : 0 });
const prop = (type, x, z, o = {}) => ({ k: 'prop', type, x, z, y: o.y || 0, r: o.r || 0, sc: o.sc || 1, c: o.c, col: o.col ?? 0, det: o.det ?? 0 });
const fence = (x, z, x2, z2, style, h, c, o = {}) => ({ k: 'fence', x, z, x2, z2, s: style, h, c, col: o.col ?? 1, det: o.det ?? 0 });
const door = (x, z, w, h, c, r = 0, o = {}) => ({ k: 'door', x, z, y: o.y || 0, w, h, c, r, cell: o.cell, glass: o.glass ? 1 : 0 });
const win = (x, z, y, w, h, r = 0, o = {}) => ({ k: 'win', x, z, y, w, h, r, c: o.c ?? 0x2f4555, bars: o.bars ? 1 : 0, f: o.f ?? 0xeeeeee, det: o.det ?? 0, cell: o.cell, sill: o.sillC });
const sign = (x, z, y, w, h, text, bg, fg = '#ffffff', r = 0) => ({ k: 'sign', x, z, y, w, h, text, bg, fg, r });
const shade = (hex, f) => {
  const r = Math.min(255, ((hex >> 16) & 255) * f) | 0, g = Math.min(255, ((hex >> 8) & 255) * f) | 0, b = Math.min(255, (hex & 255) * f) | 0;
  return (r << 16) | (g << 8) | b;
};

// Cerca frontal a lo ancho del lote con huecos (accesos)
function frontFence(P, w, fy, gaps, style, h, c) {
  gaps = gaps.slice().sort((a, b) => a[0] - b[0]);
  let x = -w / 2 + 0.2;
  for (const [g0, g1] of gaps) {
    if (g0 - x > 0.6) P.push(fence(x, fy, g0, fy, style, h, c));
    x = Math.max(x, g1);
  }
  if (w / 2 - 0.2 - x > 0.6) P.push(fence(x, fy, w / 2 - 0.2, fy, style, h, c));
}

// Ventanas repartidas a lo largo de una fachada
function facadeWindows(parts, cx, cz, len, faceR, floors, floorH, opts = {}) {
  const n = Math.max(1, Math.floor(len / (opts.spacing || 3)));
  const step = len / n;
  for (let f = 0; f < floors; f++) {
    for (let i = 0; i < n; i++) {
      if (opts.skip && f === 0 && opts.skip(i, n)) continue;
      const off = -len / 2 + step * (i + 0.5);
      // dirección a lo largo de la fachada
      const ax = Math.cos(faceR), az = -Math.sin(faceR);
      parts.push(win(cx + ax * off, cz + az * off, f * floorH + (opts.sill ?? 1.0), opts.w || 1.2, opts.h || 1.3, faceR, opts));
    }
  }
}

// =============================================================
// CASAS
// =============================================================

export function casaHumilde(rng, w, d) {
  const P = [];
  const col = rng.pick(PALETTES.humilde);
  const twoFloors = rng.chance(0.42);
  const bw = w - 0.3, bd = Math.min(d - 2.5, rng.float(7.5, 10));
  const fz = d / 2 - 0.25;            // fachada pegada a la banqueta
  const bz = fz - bd / 2;
  const h1 = 2.9;
  P.push(box(0, bz, bw, bd, h1, col));
  P.push(deco(0, fz + 0.02, bw, 0.06, 0.7, shade(col, 0.72), { det: 1 }));         // guardapolvo
  let topH = h1;
  if (twoFloors) {
    const unfinished = rng.chance(0.3);
    const w2 = unfinished ? bw * rng.float(0.5, 0.75) : bw;
    const x2 = (bw - w2) / 2 * (rng.chance(0.5) ? 1 : -1);
    const d2 = unfinished ? bd * 0.7 : bd;
    P.push(box(x2, bz - (bd - d2) / 2, w2, d2, 2.7, unfinished ? 0x9e9e9e : rng.chance(0.5) ? col : rng.pick(PALETTES.humilde), { y: h1 }));
    topH = h1 + 2.7;
    if (!unfinished) facadeWindows(P, x2, fz + 0.03, w2, 0, 1, 2.7, { w: 1.1, h: 1.1, sill: h1 + 0.9, bars: true, f: 0x555555, cell: rng.chance(0.5) ? 'winHumble' : 'winBars' });
    if (unfinished) for (let i = 0; i < 4; i++) P.push(deco(x2 - w2 / 2 + 0.3 + i * (w2 - 0.6) / 3, bz - (bd - d2) / 2 + d2 / 2 - 0.3, 0.06, 0.06, 0.9, 0x6d4c41, { y: topH }));
  }
  P.push({ k: 'slab', x: 0, z: bz, y: h1, w: bw + 0.1, d: bd + 0.1, h: 0.15, c: 0xbdbdbd, det: 1 });
  // tinaco y varillas
  if (rng.chance(0.75)) P.push({ k: 'cyl', x: rng.float(-bw / 4, bw / 4), z: bz - bd / 4, y: topH, r: 0.55, r2: 0.55, h: 1.2, seg: 8, c: 0x1e1e1e, det: 0 });
  if (rng.chance(0.35)) P.push(deco(bw / 2 - 0.6, bz - bd / 2 + 0.5, 1.1, 1.1, 1.0, 0x8d8d8d, { y: topH }));
  // puerta y ventanas con protecciones
  const shop = rng.chance(0.13);
  const doorX = rng.chance(0.5) ? -bw / 4 : bw / 4;
  if (shop) {
    P.push(panel('rollup', 0, fz + 0.02, 0, bw * 0.7, 2.4, { fc: 0x9aa1a6 }));          // cortina metálica
    P.push(prop('crates', bw * 0.42, fz + 0.9, { det: 1 }));
    P.push(prop('cooler', -bw * 0.42, fz + 0.7, { det: 1, col: 0 }));
  } else {
    P.push(door(doorX, fz + 0.03, 1.0, 2.1, rng.pick([0x5d4037, 0x37474f, 0x8d6e63, 0x263238]), 0, { cell: rng.chance(0.6) ? 'doorMetal' : 'doorWood2' }));
    P.push(win(-doorX, fz + 0.03, 1.0, 1.2, 1.1, 0, { bars: true, f: 0x555555, cell: rng.chance(0.5) ? 'winHumble' : 'winBars' }));
  }
  // patio trasero
  const yardD = bz - bd / 2 + d / 2;
  if (yardD > 1.5) P.push(decal(0, -d / 2 + yardD / 2, bw, yardD, rng.chance(0.5) ? 0x9e9a8f : 0x7f9a5a, { det: 1 }));
  if (rng.chance(0.25)) P.push(prop('laundry', 0, -d / 2 + yardD / 2, { det: 1 }));
  if (rng.chance(0.35) && yardD > 3) P.push(prop(rng.pick(['round', 'palm', 'bush']), rng.float(-bw / 3, bw / 3), -d / 2 + 1.5, { col: 1 }));
  return { parts: P, door: [shop ? 0 : doorX, fz], shop, top: topH };
}

export function casaMedia(rng, w, d) {
  // Casa residencial: muros claros, techo a cuatro aguas con alero, cochera, porche, jardín y seto
  const P = [];
  const col = rng.pick(PALETTES.medio);
  const roofC = rng.pick(PALETTES.medioRoof);
  const floors = rng.chance(0.3) ? 2 : 1;
  const fh = 3.1;
  const bw = Math.min(w - 5.2, rng.float(8.5, 10)), bd = rng.float(8, 10);
  const setback = rng.float(4.6, 5.6);
  const fz = d / 2 - setback;
  const bz = fz - bd / 2;
  const gSide = rng.chance(0.5) ? 1 : -1;
  const bx = -gSide * (w / 2 - bw / 2 - 0.6);
  const H = floors * fh;
  P.push(box(bx, bz, bw, bd, H, col));
  // zoclo de piedra al frente
  P.push(deco(bx, fz + 0.03, bw, 0.08, 0.55, shade(col, 0.7), { det: 0 }));
  const roofType = rng.chance(0.65) ? 'hip' : 'gable';
  P.push({ k: roofType, x: bx, z: bz, y: H, w: bw, d: bd, rh: rng.float(1.7, 2.3), c: roofC, over: 0.6 });
  P.push({ k: 'slab', x: bx, z: bz, y: H - 0.18, w: bw + 0.5, d: bd + 0.5, h: 0.22, c: 0xf4f2ee });   // fascia blanca
  // cochera
  const gw = 3.6, gd = 6.4, gx = bx + gSide * (bw / 2 + gw / 2), gz = fz - gd / 2 + 0.4;
  P.push(box(gx, gz, gw, gd, 2.8, shade(col, 0.96)));
  P.push({ k: roofType === 'hip' ? 'hip' : 'gable', x: gx, z: gz, y: 2.8, w: gw, d: gd, rh: 1.1, c: roofC, over: 0.4 });
  P.push(door(gx, gz + gd / 2 + 0.03, 2.9, 2.25, 0xf2f2f2, 0, { cell: 'garage' }));
  P.push(decal(gx, (gz + gd / 2 + d / 2) / 2, 3.2, d / 2 - (gz + gd / 2), 0xcfcac0));           // entrada de autos
  // porche con columnas
  const dx = bx + (gSide > 0 ? -bw / 4 : bw / 4);
  P.push({ k: 'slab', x: dx, z: fz + 1.0, y: 2.65, w: 3.4, d: 2.0, h: 0.16, c: 0xf5f5f5 });
  P.push(deco(dx - 1.5, fz + 1.85, 0.2, 0.2, 2.65, 0xf5f5f5));
  P.push(deco(dx + 1.5, fz + 1.85, 0.2, 0.2, 2.65, 0xf5f5f5));
  P.push(decal(dx, fz + 1.0, 3.4, 2.0, 0xd9d3c7, { y: 0.06 }));
  P.push(door(dx, fz + 0.03, 1.05, 2.2, 0x6d4c41, 0, { cell: rng.chance(0.5) ? 'doorWood' : 'doorWood2' }));
  // ventanas del frente
  const wx = dx + (gSide > 0 ? -2.3 : 2.3);
  P.push(win(wx, fz + 0.03, 0.95, 1.6, 1.35, 0, { f: 0xffffff }));
  if (Math.abs(bx - wx) < bw / 2 - 1.2 && bw > 9) P.push(win(bx - (wx - bx) * 0.2, fz + 0.03, 0.95, 1.1, 1.35, 0, { f: 0xffffff, cell: 'winHouse' }));
  if (floors === 2) facadeWindows(P, bx, fz + 0.03, bw, 0, 1, fh, { sill: fh + 0.9, w: 1.3, h: 1.25, spacing: 3.2, f: 0xffffff });
  facadeWindows(P, bx - gSide * (bw / 2) - gSide * 0.03, bz, bd, -gSide * Math.PI / 2, floors, fh, { w: 1.1, h: 1.25, spacing: 3.4, f: 0xffffff, det: 1 });
  facadeWindows(P, bx, bz - bd / 2 - 0.03, bw, Math.PI, floors, fh, { w: 1.1, h: 1.2, spacing: 3.6, f: 0xffffff, det: 1 });
  // jardín delantero, caminito y arbustos al pie de la fachada
  P.push(decal(0, (fz + d / 2) / 2, w, d / 2 - fz, rng.chance(0.8) ? 0x6aa84f : 0x7fb05e));
  P.push(decal(dx, (fz + 2 + d / 2) / 2, 1.2, d / 2 - fz - 2, 0xd8d2c6, { y: 0.01 }));
  for (let i = 0; i < 3; i++) P.push(prop('bush', wx - 1.0 + i * 1.0, fz + 0.6, { det: 1, sc: 0.75 }));
  P.push(prop('hedgeBall', dx - 1.9, fz + 2.3, { det: 1, sc: 0.8 }));
  P.push(prop('hedgeBall', dx + 1.9, fz + 2.3, { det: 1, sc: 0.8 }));
  // cerca baja o seto
  const fs = rng.float();
  const fy = d / 2 - 0.2;
  if (fs < 0.4) frontFence(P, w, fy, [[dx - 0.8, dx + 0.8], [gx - 1.9, gx + 1.9]], 'hedge', 0.95, 0x3f7a35);
  else if (fs < 0.7) frontFence(P, w, fy, [[dx - 0.8, dx + 0.8], [gx - 1.9, gx + 1.9]], 'picket', 1.0, 0xfafafa);
  else frontFence(P, w, fy, [[dx - 0.9, dx + 0.9], [gx - 1.9, gx + 1.9]], 'wall', 0.7, 0xe9e4da);
  // árbol o palmera del jardín
  P.push(prop(rng.pick(['round', 'palm', 'jacaranda', 'round', 'palm']), bx - gSide * (bw / 2 - 1.5), (fz + d / 2) / 2 + 0.6, { col: 1, sc: rng.float(0.85, 1.1) }));
  P.push(prop('mailbox', dx + 1.0, d / 2 - 0.6, { det: 1 }));
  if (rng.chance(0.55)) P.push(prop('car', gx, d / 2 - 3.0, { r: 0, c: rng.pick([0xc0392b, 0x2c3e50, 0xecf0f1, 0x7f8c8d, 0x2980b9, 0x16a085, 0x1b1b1b, 0xb0b5b9]), col: 1 }));
  // patio trasero con barda, árboles y asador
  const backD = Math.max(0.5, bz - bd / 2 + d / 2);
  P.push(decal(0, -d / 2 + backD / 2, w, backD, 0x6ea556, { det: 1 }));
  if (backD > 5 && rng.chance(0.25)) P.push({ k: 'pool', x: rng.float(-w / 5, w / 5), z: -d / 2 + backD / 2, w: Math.min(6, w - 4), d: Math.min(3.2, backD - 2.5), c: 0x29b6f6, det: 1 });
  if (backD > 3) P.push(prop(rng.pick(['round', 'oak', 'jacaranda', 'palm']), rng.float(-w / 3, w / 3), -d / 2 + Math.min(3, backD / 2), { col: 1 }));
  if (rng.chance(0.3)) P.push(prop('grill', bx, -d / 2 + 2.0, { det: 1 }));
  P.push(fence(-w / 2, -d / 2 + 0.1, w / 2, -d / 2 + 0.1, 'wall', 1.9, 0xd9d2c4, { det: 0, col: 1 }));
  P.push(fence(-w / 2 + 0.1, -d / 2 + 0.1, -w / 2 + 0.1, bz - bd / 2, 'wall', 1.9, 0xd9d2c4, { det: 1, col: 1 }));
  P.push(fence(w / 2 - 0.1, -d / 2 + 0.1, w / 2 - 0.1, bz - bd / 2, 'wall', 1.9, 0xd9d2c4, { det: 1, col: 1 }));
  return { parts: P, door: [dx, fz], drive: [gx], top: H };
}

export function villaModerna(rng, w, d) {
  const P = [];
  const col = rng.pick(PALETTES.exclusivo);
  const wood = rng.pick([0x8d5a3b, 0x6d4c41, 0xa1887f]);
  const glass = 0x2c3e4c;
  const setback = 7;
  const fz = d / 2 - setback;
  const gw = rng.float(15, 19), gd = rng.float(9, 11);
  const gz = fz - gd / 2;
  P.push(box(0, gz, gw, gd, 3.5, col));
  // planta alta en voladizo
  const uw = rng.float(10, 14), ud = gd - 1;
  const ux = rng.chance(0.5) ? gw / 2 - uw / 2 + 1.5 : -(gw / 2 - uw / 2 + 1.5);
  P.push(box(ux, gz + 0.6, uw, ud, 3.2, rng.chance(0.4) ? wood : col, { y: 3.5 }));
  P.push({ k: 'slab', x: 0, z: gz, y: 3.5, w: gw + 0.6, d: gd + 0.6, h: 0.25, c: 0xf0f0f0 });
  P.push({ k: 'slab', x: ux, z: gz + 0.6, y: 6.7, w: uw + 0.8, d: ud + 0.8, h: 0.25, c: 0xf0f0f0 });
  // ventanales
  for (let i = 0; i < 3; i++) P.push(panel('winLarge', -gw / 4 - gw * 0.14 + i * gw * 0.14, fz + 0.02, 0.25, gw * 0.14, 2.9, { fc: glass }));
  for (let i = 0; i < 3; i++) P.push(panel('winLarge', ux - uw * 0.27 + i * uw * 0.27, gz + 0.6 + ud / 2 + 0.02, 3.85, uw * 0.27, 2.5, { fc: glass }));
  P.push(panel('winLarge', ux, gz + 0.6 - ud / 2 - 0.02, 3.85, uw * 0.8, 2.5, { r: Math.PI, fc: glass, det: 1 }));
  P.push(deco(gw / 4 + 1, fz + 0.05, 2.2, 0.08, 3.2, wood, { y: 0.1 }));
  P.push(door(gw / 4 + 1, fz + 0.1, 1.4, 2.5, 0x3e2723));
  // cochera doble
  const cx = -gw / 2 - 3.2;
  if (cx - 3.2 > -w / 2) {
    P.push(box(cx, fz - 3.2, 6.2, 6.4, 3.0, col));
    P.push(door(cx, fz + 0.03, 5.4, 2.4, 0x424242, 0, { cell: 'garage' }));
    P.push(decal(cx, (fz + d / 2) / 2, 5.6, d / 2 - fz, 0xbdb5a6));
  }
  // jardín, alberca, palmeras
  P.push(decal(0, (fz + d / 2) / 2, w, d / 2 - fz, 0x5fa24a));
  P.push(decal(gw / 4 + 1, (fz + d / 2) / 2, 1.6, d / 2 - fz, 0xd7cfc2, { y: 0.01 }));
  const backZ = gz - gd / 2;
  const yard = backZ + d / 2;
  P.push(decal(0, -d / 2 + yard / 2, w, yard, 0x5aa046, { det: 1 }));
  if (yard > 6) {
    P.push({ k: 'pool', x: rng.float(-3, 3), z: -d / 2 + yard / 2, w: rng.float(7, 10), d: Math.min(4.5, yard - 3), c: 0x29b6f6 });
    P.push(decal(0, -d / 2 + yard / 2, 12, Math.min(7, yard - 0.5), 0xbcaaa4, { y: 0.005, det: 1 }));
    P.push(prop('lounger', -4.5, -d / 2 + yard / 2 + 2.6, { det: 1 }));
    P.push(prop('lounger', -6.2, -d / 2 + yard / 2 + 2.6, { det: 1 }));
  }
  for (let i = 0; i < 3; i++) P.push(prop('palm', rng.float(-w / 2 + 2, w / 2 - 2), d / 2 - rng.float(1.5, setback - 1), { col: 1, sc: rng.float(0.9, 1.3) }));
  P.push(prop('bush', gw / 4 - 0.6, fz + 0.8, { det: 1 }));
  P.push(prop('bush', gw / 4 + 2.6, fz + 0.8, { det: 1 }));
  // barda frontal con portón y setos laterales
  const fy = d / 2 - 0.3;
  P.push(fence(-w / 2, fy, cx - 3, fy, 'wall', 1.4, 0xe8e2d6));
  P.push(fence(cx + 3, fy, gw / 4, fy, 'wall', 1.4, 0xe8e2d6));
  P.push(fence(gw / 4 + 2, fy, w / 2, fy, 'wall', 1.4, 0xe8e2d6));
  P.push(fence(-w / 2 + 0.3, fy, -w / 2 + 0.3, -d / 2 + 0.3, 'hedge', 1.7, 0x3f7a35));
  P.push(fence(w / 2 - 0.3, fy, w / 2 - 0.3, -d / 2 + 0.3, 'hedge', 1.7, 0x3f7a35));
  P.push(fence(-w / 2, -d / 2 + 0.3, w / 2, -d / 2 + 0.3, 'hedge', 1.7, 0x3f7a35, { det: 1 }));
  P.push(prop('lampgarden', -2, fy - 1, { det: 1 }));
  P.push(prop('lampgarden', w / 2 - 3, fy - 1, { det: 1 }));
  return { parts: P, door: [gw / 4 + 1, fz], drive: [-gw / 2 - 3.2], top: 6.9 };
}

export function villaHacienda(rng, w, d) {
  const P = [];
  const col = rng.pick(PALETTES.hacienda);
  const tile = rng.pick([0xb5562f, 0xa84b2a, 0xc0653a]);
  const setback = 6.5;
  const fz = d / 2 - setback;
  const aw = rng.float(16, 20), ad = 8.5;
  const az = fz - ad / 2;
  P.push(box(0, az, aw, ad, 4.0, col));
  P.push({ k: 'hip', x: 0, z: az, y: 4.0, w: aw, d: ad, rh: 2.2, c: tile, over: 0.7 });
  // ala lateral (forma de L)
  const side = rng.chance(0.5) ? 1 : -1;
  const lw = 7.5, ld = rng.float(10, 13);
  const lx = side * (aw / 2 - lw / 2), lz = az - ad / 2 - ld / 2 + 0.01;
  P.push(box(lx, lz, lw, ld, 4.0, col));
  P.push({ k: 'gable', x: lx, z: lz, y: 4.0, w: lw, d: ld, rh: 2.0, c: tile, over: 0.6 });
  // portal de arcos
  P.push({ k: 'slab', x: 0, z: fz + 1.4, y: 3.2, w: aw * 0.7, d: 2.8, h: 0.25, c: shade(col, 0.95) });
  for (let i = 0; i < 5; i++) P.push(deco(-aw * 0.35 + i * (aw * 0.7) / 4, fz + 2.6, 0.45, 0.45, 3.2, shade(col, 0.95)));
  P.push(door(0, fz + 0.04, 1.9, 2.8, 0x5d3a1a, 0, { cell: 'doorDouble' }));
  facadeWindows(P, 0, fz + 0.04, aw, 0, 1, 4, { spacing: 4.5, w: 1.2, h: 1.9, sill: 0.8, f: 0x5d3a1a, cell: 'winArch', sillC: 0xd8c3a5, skip: (i, n) => i === Math.floor(n / 2) });
  // patio con fuente y buganvilias
  P.push(decal(0, (fz + d / 2) / 2, w, d / 2 - fz, 0xc9a77c));
  P.push({ k: 'cyl', x: -side * 4, z: (fz + d / 2) / 2, y: 0, r: 1.3, r2: 1.3, h: 0.6, seg: 10, c: 0xb9a68e, col: 1, det: 0 });
  P.push({ k: 'cyl', x: -side * 4, z: (fz + d / 2) / 2, y: 0.55, r: 1.05, r2: 1.05, h: 0.06, seg: 10, c: 0x4fc3f7, det: 1 });
  P.push(prop('bougainvillea', aw / 2 - 1, fz + 0.7, { det: 1 }));
  P.push(prop('bougainvillea', -aw / 2 + 1, fz + 0.7, { det: 1 }));
  P.push(prop('palm', side * (w / 2 - 3), d / 2 - 3, { col: 1, sc: 1.2 }));
  P.push(prop('round', -side * (w / 2 - 3), -d / 2 + 4, { col: 1, sc: 1.3 }));
  P.push(decal(0, (-d / 2 + az - ad / 2) / 2, w, Math.max(1, az - ad / 2 + d / 2), 0x62a14b, { det: 1 }));
  const fy = d / 2 - 0.3;
  P.push(fence(-w / 2, fy, -1.6, fy, 'wall', 2.0, shade(col, 0.92)));
  P.push(fence(1.6, fy, w / 2, fy, 'wall', 2.0, shade(col, 0.92)));
  P.push(fence(-w / 2 + 0.3, fy, -w / 2 + 0.3, -d / 2 + 0.3, 'wall', 2.0, shade(col, 0.92)));
  P.push(fence(w / 2 - 0.3, fy, w / 2 - 0.3, -d / 2 + 0.3, 'wall', 2.0, shade(col, 0.92)));
  return { parts: P, door: [0, fz], top: 6.2 };
}

export function apartamentos(rng, w, d, floors) {
  // Edificio de departamentos: balcones con barandal de vidrio, vestíbulo, pretil y palmeras
  const P = [];
  const col = rng.pick(PALETTES.comercial);
  const fh = 3.0;
  const bw = w - 2, bd = Math.min(d - 5, 14);
  const fz = d / 2 - 4;
  const bz = fz - bd / 2;
  const H = floors * fh + 0.6;
  P.push(box(0, bz, bw, bd, H, col, { f: 'apt', gf: 'lobby', fh, gfH: fh, gfc: shade(col, 0.75) }));
  // marco de color en las esquinas (como en la referencia)
  for (const s2 of [-1, 1]) P.push(deco(s2 * (bw / 2 - 0.3), fz + 0.25, 0.7, 0.5, H, shade(col, 0.82), { det: 0 }));
  // azotea: tinacos, cuarto de máquinas y minisplits
  P.push(deco(bw / 4, bz - bd / 5, 3.2, 2.6, 2.4, shade(col, 0.9), { y: H, det: 0 }));
  for (let i = 0; i < 3; i++) P.push(deco(-bw / 3 + i * 1.6, bz - bd / 4, 0.9, 0.6, 0.6, 0xd9dcde, { y: H }));
  P.push({ k: 'cyl', x: -bw / 4, z: bz + bd / 5, y: H, r: 0.6, r2: 0.6, h: 1.3, seg: 8, c: 0x2b2b2b });
  // acceso
  P.push({ k: 'slab', x: 0, z: fz + 1.0, y: 3.0, w: 4.0, d: 2.0, h: 0.18, c: 0xf2f2f0 });
  P.push(decal(0, (fz + d / 2) / 2, w, d / 2 - fz, 0xc9c3b6));
  P.push(decal(-bw / 2 + 2, (fz + d / 2) / 2, 3.2, d / 2 - fz - 0.6, 0x6aa84f, { y: 0.02 }));
  P.push(decal(bw / 2 - 2, (fz + d / 2) / 2, 3.2, d / 2 - fz - 0.6, 0x6aa84f, { y: 0.02 }));
  P.push(prop('palm', -bw / 2 + 2, (fz + d / 2) / 2, { col: 1, sc: rng.float(0.95, 1.15) }));
  P.push(prop('palm', bw / 2 - 2, (fz + d / 2) / 2, { col: 1, sc: rng.float(0.95, 1.15) }));
  P.push(fence(-bw / 2 + 0.4, fz + 0.9, -2.4, fz + 0.9, 'hedge', 0.8, 0x3f7a35, { det: 1, col: 0 }));
  P.push(fence(2.4, fz + 0.9, bw / 2 - 0.4, fz + 0.9, 'hedge', 0.8, 0x3f7a35, { det: 1, col: 0 }));
  return { parts: P, door: [0, fz], top: H };
}

// =============================================================
// COMERCIOS
// =============================================================

function storefront(P, rng, bw, fz, h, opts) {
  // vitrinas con mercancía, puerta de vidrio y toldo
  const n = Math.max(2, Math.round((bw * 0.82) / 2.6));
  const ww = (bw * 0.82) / n;
  const doorI = Math.max(0, Math.min(n - 1, Math.round((bw * 0.25 + bw * 0.41) / ww - 0.5)));
  for (let i = 0; i < n; i++) {
    const x = -bw * 0.41 + ww * (i + 0.5);
    if (i === doorI) P.push(door(x, fz + 0.03, Math.min(2.2, ww - 0.2), 2.5, 0x263238, 0, { cell: 'doorGlass' }));
    else P.push(panel(opts.cell || (i % 2 ? 'shopWindow' : 'shopWindow2'), x, fz + 0.02, 0.4, ww - 0.15, 2.3, { fc: 0x34495e }));
  }
  P.push(deco(0, fz + 0.06, bw * 0.86, 0.1, 0.14, 0xdddddd, { y: 2.85 }));
  if (opts.awning) P.push({ k: 'awn', x: 0, z: fz + 0.9, y: 3.05, w: bw * 0.85, d: 1.7, c: opts.awning[0], c2: opts.awning[1] });
  return doorI;
}

export function restaurante(rng, w, d, type, name) {
  const P = [];
  const fz = d / 2 - (type === 'mariscos' ? 1.5 : 4.5);
  const bw = w - 2, bd = Math.min(d - 6, rng.float(10, 13));
  const bz = fz - bd / 2;
  let h = 4.4;
  let pick = [0, fz];
  const bg = SIGN_BG[type];
  switch (type) {
    case 'pizzeria': {
      P.push(box(0, bz, bw, bd, h, 0xefe3cf));
      P.push(deco(0, fz + 0.03, bw, 0.08, 1.2, 0x9c4a32, { det: 0 }));
      storefront(P, rng, bw, fz, h, { awning: [0xc62828, 0xffffff] });
      P.push({ k: 'cyl', x: bw / 2 - 1.5, z: bz - bd / 4, y: h, r: 0.45, r2: 0.4, h: 2.2, seg: 8, c: 0x8d4a32, col: 0 });
      break;
    }
    case 'taqueria': {
      const c = rng.pick([0xff7043, 0xffca28, 0x26c6da, 0xec407a, 0x66bb6a]);
      P.push(box(0, bz, bw, bd, 3.8, c));
      h = 3.8;
      storefront(P, rng, bw, fz, h, { awning: [0x2e7d32, 0xfff176] });
      P.push({ k: 'flags', x: 0, z: fz + 3.6, y: 3.4, w: bw + 1, colors: [0xe53935, 0xfdd835, 0x43a047, 0x1e88e5, 0xec407a], det: 1 });
      break;
    }
    case 'cafe': {
      P.push(box(0, bz, bw, bd, h, rng.pick([0xf5efe6, 0xe9e1d4, 0xdfe7df])));
      storefront(P, rng, bw, fz, h, { awning: [0x2e5e3e, 0x2e5e3e] });
      for (const s of [-1, 1]) P.push(prop('planter', s * (bw / 2 - 0.6), fz + 0.6, { det: 1 }));
      break;
    }
    case 'burger': {
      P.push(box(0, bz, bw, bd, h, 0xffc107));
      P.push(deco(0, fz + 0.03, bw, 0.08, 1.4, 0xd32f2f, { y: h - 1.4, det: 0 }));
      storefront(P, rng, bw, fz, h, {});
      // hamburguesa gigante en el techo
      const by = h + 0.6;
      P.push({ k: 'cyl', x: 0, z: bz, y: h, r: 0.18, r2: 0.18, h: 0.8, seg: 6, c: 0x555555 });
      P.push({ k: 'cyl', x: 0, z: bz, y: by + 0.2, r: 1.6, r2: 1.6, h: 0.35, seg: 12, c: 0xd9a35b });
      P.push({ k: 'cyl', x: 0, z: bz, y: by + 0.55, r: 1.7, r2: 1.7, h: 0.3, seg: 12, c: 0x5d3a1a });
      P.push({ k: 'cyl', x: 0, z: bz, y: by + 0.85, r: 1.75, r2: 1.75, h: 0.1, seg: 12, c: 0x7cb342 });
      P.push({ k: 'cyl', x: 0, z: bz, y: by + 0.95, r: 1.6, r2: 0.6, h: 0.8, seg: 12, c: 0xe0a95e });
      P.push(decal(0, (fz + d / 2) / 2, w, d / 2 - fz, 0x50555b));
      break;
    }
    case 'sushi': {
      P.push(box(0, bz, bw, bd, h, 0x3e2723));
      P.push(deco(0, fz + 0.04, bw * 0.8, 0.06, 2.2, 0xf3e9dc, { y: 0.6, det: 0 }));
      P.push(door(0, fz + 0.08, 1.6, 2.4, 0x1b1b1b, 0, { cell: 'doorWood2' }));
      P.push({ k: 'slab', x: 0, z: bz + 0.5, y: h, w: bw + 1.6, d: bd + 2.4, h: 0.3, c: 0x212121 });
      for (const s of [-1, 1]) {
        P.push({ k: 'cyl', x: s * bw * 0.35, z: fz + 0.6, y: 2.5, r: 0.25, r2: 0.25, h: 0.5, seg: 8, c: 0xe53935, det: 1 });
        P.push(prop('bamboo', s * (bw / 2 - 0.5), fz + 0.5, { det: 1 }));
      }
      break;
    }
    case 'mariscos': {
      // palapa: techo de palma sobre columnas
      P.push(box(0, bz - bd / 4, bw * 0.6, bd / 2, 3.0, 0xe3f2fd));
      P.push(deco(0, bz - bd / 4, bw * 0.6 + 0.05, bd / 2 + 0.05, 0.6, 0x1565c0, { det: 0 }));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.push(box(sx * (bw / 2 - 0.5), bz + sz * (bd / 2 - 0.5), 0.3, 0.3, 3.2, 0x8d6e63));
      P.push({ k: 'cone', x: 0, z: bz, y: 3.2, r: Math.max(bw, bd) * 0.62, h: 3.2, seg: 8, c: 0xc9a46a });
      for (let i = 0; i < 3; i++) P.push(prop('table', -bw / 3 + i * bw / 3, bz + bd / 4, { det: 1 }));
      h = 3.2;
      pick = [0, bz + bd / 2];
      break;
    }
    default: break;
  }
  // letrero sobre la fachada
  if (type !== 'mariscos') P.push(sign(0, fz + 0.12, h - 1.0, Math.min(bw * 0.85, 9), 0.95, name, bg, type === 'burger' ? '#ffeb3b' : '#ffffff'));
  else P.push(sign(0, bz + bd / 2 + 0.2, 2.2, Math.min(bw * 0.8, 7), 0.8, name, bg));
  // terraza
  if (type !== 'mariscos' && type !== 'burger') {
    const tz = (fz + d / 2) / 2 + 0.3;
    P.push(decal(0, (fz + d / 2) / 2, w - 0.5, d / 2 - fz, type === 'taqueria' ? 0xb0a48f : 0xc8b9a2));
    const n = Math.max(1, Math.floor(bw / 4));
    for (let i = 0; i < n; i++) {
      const x = -bw / 2 + 2 + i * ((bw - 4) / Math.max(1, n - 1 || 1));
      P.push(prop(type === 'cafe' || type === 'pizzeria' ? 'tableUmbrella' : 'table', x, tz, { det: 1, c: type === 'taqueria' ? 0xd32f2f : type === 'pizzeria' ? 0xc62828 : 0xf5f5f5 }));
    }
  }
  return { parts: P, door: pick, top: h };
}

export function tienda(rng, w, d, type, name) {
  const P = [];
  const fz = d / 2 - 2;
  const bw = w - 1.5, bd = Math.min(d - 4, rng.float(9, 13));
  const bz = fz - bd / 2;
  const floors = rng.chance(0.5) ? 2 : 1;
  const h = floors === 2 ? 7 : 4.2;
  const tc = rng.pick(PALETTES.comercial);
  if (floors === 2) {
    P.push(box(0, bz, bw, bd, 4.2, tc));
    P.push(box(0, bz, bw, bd, 2.8, shade(tc, 1.04), { y: 4.2, f: 'aptGrid', fh: 2.8, par: 0.3 }));
  } else P.push(box(0, bz, bw, bd, h, tc));
  const aw = type === 'farmacia' ? [0x2e7d32, 0xffffff] : [rng.pick([0x1565c0, 0x6a1b9a, 0x00838f, 0xef6c00, 0x455a64]), 0xffffff];
  storefront(P, rng, bw, fz, h, { awning: rng.chance(0.7) ? aw : null });
  P.push(sign(0, fz + 0.12, 3.3, Math.min(bw * 0.8, 8), 0.8, name, SIGN_BG[type] || '#37474f'));
  if (type === 'farmacia') P.push({ k: 'cross', x: bw / 2 - 0.3, z: fz + 0.6, y: 3.6, c: 0x43a047 });
  P.push(decal(0, (fz + d / 2) / 2, w, d / 2 - fz, 0xc2bcb0));
  P.push({ k: 'slab', x: 0, z: bz, y: h, w: bw + 0.3, d: bd + 0.3, h: 0.3, c: 0x9e9e9e });
  P.push(panel('acUnit', bw / 2 - 1.2, bz - bd / 2 - 0.02, 2.6, 0.9, 0.7, { r: Math.PI, det: 1 }));
  for (const s2 of [-1, 1]) P.push(prop('planter', s2 * (bw / 2 - 0.6), fz + 0.7, { det: 1 }));
  return { parts: P, door: [bw * 0.25, fz], top: h };
}

export function oficina(rng, w, d, hMin, hMax) {
  // Oficinas y torres: muro cortina de vidrio con aletas o ventanas en piedra; vestíbulo de vidrio
  const P = [];
  const fz = d / 2 - 3.5;
  const bw = w - 2, bd = Math.min(d - 5.5, w);
  const bz = fz - bd / 2;
  const H = rng.float(hMin, hMax);
  const c = rng.pick(PALETTES.torre);
  const tall = H >= 30;
  const glassStyles = ['glassBlue', 'glassTeal', 'glassBronze', 'glassDark', 'glassBlue'];
  const style = tall ? (rng.chance(0.75) ? rng.pick(glassStyles) : 'officeBand') : rng.pick(['officePunch', 'officeBand', 'officePunch', 'glassBlue']);
  const stone = rng.pick([0xe3dccf, 0xd6d0c4, 0xc9c6bf, 0xeae5dc, 0xb9b4aa]);
  const wall = style.startsWith('glass') ? c : stone;
  if (!tall || rng.chance(0.45)) {
    P.push(box(0, bz, bw, bd, H, wall, { f: style, gf: 'lobby', gfH: 4.4, gfc: 0x3a4148 }));
    P.push({ k: 'slab', x: 0, z: bz, y: H, w: bw + 0.4, d: bd + 0.4, h: 0.5, c: shade(wall, 0.75) });
  } else {
    // escalonada (basamento de piedra + torre de vidrio + remate)
    const h1 = H * 0.55, h2 = H * 0.3, h3 = H * 0.15;
    P.push(box(0, bz, bw, bd, h1, wall, { f: style, gf: 'lobby', gfH: 4.4, gfc: 0x3a4148 }));
    P.push(box(0, bz, bw * 0.78, bd * 0.78, h2, wall, { f: style, y: h1 }));
    P.push(box(0, bz, bw * 0.55, bd * 0.55, h3, shade(wall, 1.05), { f: style, y: h1 + h2, noFins: true }));
    P.push({ k: 'cyl', x: 0, z: bz, y: H, r: 0.25, r2: 0.08, h: 8, seg: 6, c: 0xb0bec5, col: 0 });
  }
  if (rng.chance(0.6)) P.push(deco(bw / 4, bz - bd / 4, 3.4, 3.4, 2.4, 0x9aa4aa, { y: H }));
  P.push({ k: 'slab', x: 0, z: fz + 1.6, y: 4.0, w: 7, d: 3.2, h: 0.22, c: 0xeceff1 });
  P.push(decal(0, (fz + d / 2) / 2, w, d / 2 - fz, 0xc4beb2));
  P.push(prop('planter', -4.2, fz + 1.6, { det: 1 }));
  P.push(prop('planter', 4.2, fz + 1.6, { det: 1 }));
  if (rng.chance(0.6)) for (const s2 of [-1, 1]) P.push(prop('palm', s2 * (bw / 2 - 1.2), d / 2 - 1.5, { col: 1, sc: 1.1 }));
  return { parts: P, door: [0, fz], top: H };
}

export function hotel(rng, w, d, name) {
  const P = [];
  const fz = d / 2 - 5;
  const bw = w - 3, bd = Math.min(d - 8, 13);
  const bz = fz - bd / 2;
  const floors = rng.int(6, 11);
  const fh = 3.1;
  const c = rng.pick([0xfafafa, 0xf3eee4, 0xe3f2fd, 0xfff3e0]);
  P.push(box(0, bz, bw, bd, floors * fh, c, { f: 'hotel', gf: 'lobby', fh, gfH: fh, gfc: 0x546e7a }));
  P.push({ k: 'slab', x: 0, z: bz, y: floors * fh, w: bw + 0.6, d: bd + 0.6, h: 0.4, c: 0x546e7a });
  P.push(sign(0, fz + 0.12, floors * fh - 2.2, Math.min(bw * 0.8, 12), 1.4, name, SIGN_BG.hotel, '#ffe082'));
  P.push({ k: 'slab', x: 0, z: fz + 2, y: 3.6, w: 8, d: 4, h: 0.25, c: 0xffffff });
  P.push(deco(-3.6, fz + 3.8, 0.25, 0.25, 3.6, 0xffffff));
  P.push(deco(3.6, fz + 3.8, 0.25, 0.25, 3.6, 0xffffff));
  P.push(decal(0, (fz + d / 2) / 2, w, d / 2 - fz, 0xd7ccc8));
  for (const s of [-1, 1]) P.push(prop('palm', s * (bw / 2 - 1), d / 2 - 2, { col: 1, sc: 1.3 }));
  const back = bz - bd / 2 + d / 2;
  if (back > 7) {
    P.push({ k: 'pool', x: 0, z: -d / 2 + back / 2, w: Math.min(bw - 4, 14), d: Math.min(back - 3, 6), c: 0x26c6da });
    for (let i = 0; i < 4; i++) P.push(prop('umbrellaBeach', -bw / 3 + i * bw / 4.5, -d / 2 + 1.5, { det: 1, c: 0xffffff }));
  }
  return { parts: P, door: [0, fz], top: floors * fh };
}

export function bodega(rng, w, d) {
  const P = [];
  const fz = d / 2 - 6;
  const bw = w - 3, bd = d - 9;
  const bz = fz - bd / 2;
  const c = rng.pick(PALETTES.industrial);
  const h = rng.float(8, 11);
  P.push(box(0, bz, bw, bd, h, c));
  P.push({ k: 'gable', x: 0, z: bz, y: h, w: bw, d: bd, rh: 1.6, c: shade(c, 0.78), over: 0.3 });
  P.push(deco(0, fz + 0.05, bw, 0.1, 0.6, shade(c, 0.7), { y: h - 0.8, det: 0 }));
  P.push(door(-bw / 2 + 2, fz + 0.04, 1.0, 2.2, 0x37474f, 0, { cell: 'doorMetal' }));
  const n = Math.max(1, Math.floor(bw / 9));
  for (let i = 0; i < n; i++) {
    const x = -bw / 2 + (bw / n) * (i + 0.5);
    P.push(door(x, fz + 0.04, 4, 4.5, 0x78909c, 0, { cell: 'rollup' }));
    P.push(deco(x, fz + 0.6, 4.4, 1.2, 1.1, 0x616161));
    P.push(panel('vent', x, fz + 0.02, h - 2.2, 3.0, 0.9, { det: 1 }));
  }
  P.push(decal(0, (fz + d / 2) / 2, w, d / 2 - fz, 0x5c6166));
  if (rng.chance(0.6)) P.push(prop('truck', -bw / 4, (fz + d / 2) / 2 + 0.5, { col: 1, r: 0 }));
  return { parts: P, door: [0, fz], top: h };
}

// =============================================================
// CAMPO, TALLERES, AGENCIAS Y FÁBRICAS
// =============================================================

// Casa de campo: adobe o madera, techo de teja a dos aguas, portal con vigas, cerca de madera y corral
export function casaRural(rng, w, d) {
  const P = [];
  const col = rng.pick(PALETTES.rural);
  const roofC = rng.pick([0x9c4a2f, 0x8a3f28, 0x6d4c41, 0x7b5b45]);
  const bw = Math.min(w - 4, rng.float(8, 11)), bd = rng.float(6.5, 8);
  const fz = d / 2 - rng.float(5, 7);
  const bz = fz - bd / 2;
  const bx = rng.float(-(w - bw) / 2 + 1, (w - bw) / 2 - 1);
  P.push(box(bx, bz, bw, bd, 3.0, col));
  P.push(deco(bx, fz + 0.03, bw, 0.08, 0.6, shade(col, 0.68), { det: 0 }));
  P.push({ k: 'gable', x: bx, z: bz, y: 3.0, w: bw, d: bd, rh: 1.6, c: roofC, over: 0.6 });
  // portal de vigas al frente
  P.push({ k: 'slab', x: bx, z: fz + 1.2, y: 2.6, w: bw, d: 2.4, h: 0.14, c: 0x8d6e63 });
  for (const sx of [-1, 0, 1]) P.push(deco(bx + sx * (bw / 2 - 0.2), fz + 2.3, 0.2, 0.2, 2.6, 0x6d4c41, { det: 0 }));
  P.push(decal(bx, fz + 1.2, bw, 2.4, 0xb08b6a, { y: 0.05 }));
  P.push(door(bx, fz + 0.03, 1.1, 2.15, 0x5d4037, 0, { cell: 'doorWood2' }));
  for (const s of [-1, 1]) P.push(win(bx + s * bw / 3.2, fz + 0.03, 1.0, 1.0, 1.0, 0, { f: 0x6d4c41, cell: 'winHumble' }));
  if (rng.chance(0.5)) P.push(prop('bench', bx + bw / 3, fz + 1.4, { det: 1, r: Math.PI }));
  if (rng.chance(0.4)) P.push(prop('bougainvillea', bx - bw / 2 + 0.4, fz + 0.5, { det: 1 }));
  // terreno: tierra con pasto, cerca de madera, corral y árboles
  P.push(decal(0, 0, w, d, rng.chance(0.5) ? 0x8a9a5b : 0x9c8f68));
  const fy = d / 2 - 0.3, gx = bx;
  frontFence(P, w, fy, [[gx - 1.6, gx + 1.6]], 'picket', 1.1, 0x8d6e63);
  P.push(fence(-w / 2 + 0.2, fy, -w / 2 + 0.2, -d / 2 + 0.3, 'picket', 1.1, 0x8d6e63, { det: 1 }));
  P.push(fence(w / 2 - 0.2, fy, w / 2 - 0.2, -d / 2 + 0.3, 'picket', 1.1, 0x8d6e63, { det: 1 }));
  P.push(decal(gx, (fz + 2.4 + d / 2) / 2, 2.2, Math.max(0.5, d / 2 - fz - 2.4), 0xb59a72, { y: 0.01 }));
  const back = bz - bd / 2 + d / 2;
  if (back > 4) {
    if (rng.chance(0.5)) {
      P.push(fence(-w / 2 + 1, -d / 2 + 0.6, -w / 2 + 6, -d / 2 + 0.6, 'picket', 1.2, 0x795548, { det: 1 }));
      P.push(fence(-w / 2 + 6, -d / 2 + 0.6, -w / 2 + 6, -d / 2 + Math.min(5, back - 0.5), 'picket', 1.2, 0x795548, { det: 1 }));
      P.push(prop('hayBale', -w / 2 + 3, -d / 2 + 2.2, { det: 1, col: 1 }));
    } else P.push(prop('tractor', w / 2 - 3, -d / 2 + 2.5, { r: 0.4, col: 1 }));
  }
  P.push(prop(rng.pick(['oak', 'pine', 'oak']), -w / 2 + 2, d / 2 - 2.2, { col: 1, sc: rng.float(0.9, 1.2) }));
  if (rng.chance(0.6)) P.push(prop(rng.pick(['oak', 'pine']), w / 2 - 2, -d / 2 + 2, { col: 1 }));
  P.push({ k: 'cyl', x: bx + bw / 2 - 1, z: bz - bd / 2 - 1.2, y: 0, r: 0.7, r2: 0.7, h: 2.2, seg: 8, c: 0x9e9e9e, col: 1, det: 1 }); // aljibe
  return { parts: P, door: [bx, fz], drive: [gx], top: 4.6 };
}

// Taller mecánico: nave con portones abiertos, rampa, llantas y letrero
export function taller(rng, w, d, name) {
  const P = [];
  const c = rng.pick([0xe0d6c4, 0xcfd8dc, 0xd7ccc8, 0xbcaaa4, 0xe8e0cf]);
  const fz = d / 2 - 4.5;
  const bw = w - 1.2, bd = Math.min(d - 5.5, rng.float(10, 13));
  const bz = fz - bd / 2;
  const h = rng.float(5.2, 6.2);
  P.push(box(0, bz, bw, bd, h, c));
  P.push(deco(0, fz + 0.04, bw, 0.1, 1.1, rng.pick([0xd32f2f, 0x1565c0, 0xf9a825, 0x2e7d32]), { y: h - 1.3, det: 0 }));
  const n = Math.max(1, Math.floor(bw / 5.5));
  for (let i = 0; i < n; i++) {
    const x = -bw / 2 + (bw / n) * (i + 0.5);
    P.push(door(x, fz + 0.04, 3.6, 3.6, 0x37474f, 0, { cell: i % 2 ? 'rollup' : 'doorDouble' }));
  }
  P.push(sign(0, fz + 0.14, h - 0.8, Math.min(bw * 0.85, 10), 1.0, name, SIGN_BG.taller, '#ffca28'));
  P.push(decal(0, (fz + d / 2) / 2, w, d / 2 - fz, 0x6b6f73));
  P.push(decal(0, (fz + d / 2) / 2, w * 0.9, 0.12, 0xfdd835, { y: 0.01, det: 1 }));
  for (let i = 0; i < 3; i++) P.push({ k: 'cyl', x: bw / 2 - 0.7, z: fz + 0.6 + i * 0.05, y: i * 0.32, r: 0.42, r2: 0.42, h: 0.3, seg: 10, c: 0x1b1b1b, det: 1 });
  P.push(prop('crates', -bw / 2 + 0.8, fz + 0.8, { det: 1 }));
  P.push(prop('car', rng.chance(0.5) ? -bw / 4 : bw / 4, (fz + d / 2) / 2 + 0.3, { r: rng.chance(0.5) ? 0 : Math.PI, c: rng.pick([0x7f8c8d, 0xc0392b, 0x2c3e50, 0xf39c12]), col: 1 }));
  P.push({ k: 'slab', x: 0, z: bz, y: h, w: bw + 0.2, d: bd + 0.2, h: 0.25, c: 0x8d8d8d });
  return { parts: P, door: [0, fz], drive: [-bw / 4, bw / 4], top: h };
}

// Agencia de autos: sala de exhibición de vidrio, autos en el lote, banderines
export function concesionario(rng, w, d, name) {
  const P = [];
  const fz = d / 2 - 9;
  const bw = w - 4, bd = Math.min(d - 10, 12);
  const bz = fz - bd / 2;
  const brand = rng.pick([['#0d47a1', 0x0d47a1], ['#b71c1c', 0xb71c1c], ['#263238', 0x263238]]);
  P.push(box(0, bz, bw, bd, 6.5, 0xeceff1, { f: 'glassBlue', fh: 6.5, gf: 'lobby', gfH: 4.8, gfc: 0x37474f }));
  P.push(deco(0, bz, bw + 0.2, bd + 0.2, 0.9, brand[1], { y: 6.2, det: 0 }));
  P.push(sign(0, fz + 0.14, 5.0, Math.min(bw * 0.7, 12), 1.1, name, brand[0]));
  P.push(decal(0, (fz + d / 2) / 2, w, d / 2 - fz, 0x55595e));
  const colors = [0xc0392b, 0xecf0f1, 0x1b1b1b, 0x2980b9, 0xf1c40f, 0x7f8c8d, 0x16a085];
  const nCar = Math.max(2, Math.floor((w - 4) / 4.2));
  for (let i = 0; i < nCar; i++) P.push(prop('car', -w / 2 + 2.6 + i * ((w - 5.2) / Math.max(1, nCar - 1)), fz + 4.2, { r: 0.35, c: colors[(i + rng.int(0, 6)) % colors.length], col: 1 }));
  for (const s of [-1, 1]) {
    P.push({ k: 'cyl', x: s * (w / 2 - 0.8), z: d / 2 - 0.8, y: 0, r: 0.08, r2: 0.06, h: 6, seg: 5, c: 0xcfd8dc, col: 0 });
    P.push(deco(s * (w / 2 - 0.8) - s * 0.5, d / 2 - 0.8, 1.0, 0.04, 2.2, brand[1], { y: 3.6, det: 1 }));
  }
  return { parts: P, door: [0, fz], drive: [0], top: 7 };
}

// Fábrica: nave alta con techo de diente de sierra, chimenea, oficinas al frente y patio de maniobras
export function fabrica(rng, w, d) {
  const P = [];
  const c = rng.pick(PALETTES.industrial);
  const fz = d / 2 - 8;
  const bw = w - 3, bd = d - 11;
  const bz = fz - bd / 2;
  const h = rng.float(9, 12);
  P.push(box(0, bz, bw, bd, h, c));
  const teeth = Math.max(2, Math.floor(bd / 7));
  for (let i = 0; i < teeth; i++) {
    const z = bz - bd / 2 + (bd / teeth) * (i + 0.5);
    P.push({ k: 'gable', x: 0, z, y: h, w: bw, d: bd / teeth, rh: 1.8, c: i % 2 ? shade(c, 0.8) : shade(c, 0.72), over: 0 });
  }
  // oficinas al frente
  P.push(box(-bw / 2 + 6, fz + 1.5, 11, 3.2, 6.4, 0xe6e2da, { f: 'officeBand', fh: 3.2 }));
  P.push(door(-bw / 2 + 6, fz + 3.12, 2.2, 2.4, 0x263238, 0, { cell: 'doorGlass' }));
  for (let i = 0; i < Math.max(1, Math.floor((bw - 14) / 8)); i++) P.push(door(bw / 2 - 5 - i * 8, fz + 0.04, 4.5, 5, 0x78909c, 0, { cell: 'rollup' }));
  // chimenea
  const sx = bw / 2 - 3, sz = bz - bd / 2 + 3;
  P.push({ k: 'cyl', x: sx, z: sz, y: 0, r: 1.3, r2: 1.0, h: h + 12, seg: 8, c: 0xa1887f, col: 1 });
  P.push({ k: 'cyl', x: sx, z: sz, y: h + 10, r: 1.06, r2: 1.06, h: 1, seg: 8, c: 0xd32f2f, det: 1 });
  // tanques
  if (rng.chance(0.6)) for (let i = 0; i < 2; i++) P.push({ k: 'cyl', x: -bw / 2 + 2.5, z: bz - bd / 2 + 3 + i * 5, y: 0, r: 2, r2: 2, h: 7, seg: 10, c: 0xcfd8dc, col: 1 });
  P.push(decal(0, (fz + d / 2) / 2, w, d / 2 - fz, 0x5c6166));
  P.push(prop('truck', bw / 4, (fz + d / 2) / 2 + 0.5, { col: 1, r: 0 }));
  P.push(prop('containers', -bw / 6, (fz + d / 2) / 2 + 1, { col: 1, r: Math.PI / 2, c: rng.pick([0xb03a2e, 0x1e6091, 0x2e7d32]) }));
  return { parts: P, door: [-bw / 2 + 6, fz + 3], drive: [bw / 4], top: h };
}
