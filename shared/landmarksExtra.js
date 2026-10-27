// Lugares de la nueva Puerto Nova (complementan landmarks.js): edificios de gobierno, servicios,
// transporte, campo, puerto, glorietas y corazones de manzana.
// Mismas reglas: coordenadas locales del sitio, +Z = fachada principal (hacia la calle).

import * as B from './buildings.js';
import { Rng } from './rng.js';

const box = (x, z, w, d, h, c, o = {}) => ({ k: 'box', x, z, y: o.y || 0, w, d, h, c, s: o.s || 'plain', col: o.col ?? 1, r: o.r || 0, det: o.det ? 1 : 0, colH: o.colH, f: o.f, gf: o.gf, fh: o.fh, gfH: o.gfH, gfc: o.gfc, par: o.par, noBalc: o.noBalc, noFins: o.noFins, noPar: o.noPar });
const panel = (cell, x, z, y, w, h, o = {}) => ({ k: 'panel', cell, x, z, y, w, h, r: o.r || 0, c: o.c, fc: o.fc, det: o.det ? 1 : 0 });
const deco = (x, z, w, d, h, c, o = {}) => box(x, z, w, d, h, c, { ...o, col: 0, det: o.det ?? 1 });
const decal = (x, z, w, d, c, o = {}) => ({ k: 'decal', x, z, w, d, c, y: o.y || 0, r: o.r || 0, det: o.det ? 1 : 0 });
const prop = (type, x, z, o = {}) => ({ k: 'prop', type, x, z, y: o.y || 0, r: o.r || 0, sc: o.sc || 1, c: o.c, col: o.col ?? 0, det: o.det ?? 0 });
const fence = (x, z, x2, z2, style, h, c, o = {}) => ({ k: 'fence', x, z, x2, z2, s: style, h, c, col: o.col ?? 1, det: o.det ?? 0, colH: o.colH });
const door = (x, z, w, h, c, r = 0, o = {}) => ({ k: 'door', x, z, y: o.y || 0, w, h, c, r, cell: o.cell });
const win = (x, z, y, w, h, r = 0, o = {}) => ({ k: 'win', x, z, y, w, h, r, c: o.c ?? 0x2f4555, bars: o.bars ? 1 : 0, f: o.f ?? 0xeeeeee, det: o.det ?? 0, cell: o.cell });
const sign = (x, z, y, w, h, text, bg, fg = '#ffffff', r = 0) => ({ k: 'sign', x, z, y, w, h, text, bg, fg, r });
const cyl = (x, z, y, r, r2, h, seg, c, o = {}) => ({ k: 'cyl', x, z, y, r, r2, h, seg, c, col: o.col ?? 0, det: o.det ?? 0 });
const gable = (x, z, y, w, d, rh, c, over = 0.4) => ({ k: 'gable', x, z, y, w, d, rh, c, over });
const slab = (x, z, y, w, d, h, c, o = {}) => ({ k: 'slab', x, z, y, w, d, h, c, det: o.det ? 1 : 0 });

// Muro/reja alrededor del sitio con un acceso al frente (+Z)
function perimeter(P, hx, hz, h, c, gate, style = 'wall', o = {}) {
  P.push(fence(-hx, -hz, hx, -hz, style, h, c, o));
  P.push(fence(-hx, -hz, -hx, hz, style, h, c, o));
  P.push(fence(hx, -hz, hx, hz, style, h, c, o));
  if (gate > 0) {
    P.push(fence(-hx, hz, -gate / 2, hz, style, h, c, o));
    P.push(fence(gate / 2, hz, hx, hz, style, h, c, o));
  } else P.push(fence(-hx, hz, hx, hz, style, h, c, o));
}
// Bandera en asta (tres franjas verticales)
function flag(P, x, z, y, w, h) {
  [0x2e7d32, 0xf5f5f5, 0xc62828].forEach((c, i) => P.push(deco(x + 0.15 + w / 6 + (i * w) / 3, z, w / 3, 0.05, h, c, { y, det: 0 })));
}
// Columnas de un pórtico
function colonnade(P, x0, x1, z, n, h, c, r = 0.32) {
  for (let i = 0; i < n; i++) P.push(cyl(x0 + ((x1 - x0) * i) / (n - 1), z, 0, r, r * 0.9, h, 8, c, { col: 1 }));
}
// Cajones de estacionamiento pintados (vacíos: los autos solo se compran en los concesionarios)
function parking(P, x, z, w, d, rot = 0) {
  P.push(decal(x, z, w, d, 0x4f5459, { r: rot }));
  const n = Math.floor(w / 2.8);
  const c = Math.cos(rot), s = Math.sin(rot);
  for (let i = 0; i <= n; i++) {
    const lx = -w / 2 + (w / n) * i;
    for (const sz of [-1, 1]) if (d > 10 || sz < 0) {
      const lz = d > 10 ? sz * (d / 2 - 2.6) : 0;
      P.push(decal(x + lx * c + lz * s, z - lx * s + lz * c, 0.14, 5, 0xffffff, { y: 0.01, r: rot, det: 1 }));
    }
  }
}
// Avión hecho de piezas (fuselaje, alas, cola)
function airplane(P, x, z, rot, sc, livery) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  const L = 30 * sc;
  let p = at(0, 0); P.push(box(p[0], p[1], 3.4 * sc, L, 3.4 * sc, 0xf5f5f5, { y: 1.2 * sc, r: rot, colH: 4.6 * sc }));
  p = at(0, L / 2 + 1.2 * sc); P.push(deco(p[0], p[1], 2.6 * sc, 2.4 * sc, 2.4 * sc, 0xeceff1, { y: 1.6 * sc, r: rot, det: 0 }));
  p = at(0, L / 2 + 1.9 * sc); P.push(deco(p[0], p[1], 2.2 * sc, 0.1, 0.6 * sc, 0x263238, { y: 3.0 * sc, r: rot, det: 1 }));
  p = at(0, 1 * sc); P.push(deco(p[0], p[1], 30 * sc, 4.5 * sc, 0.35 * sc, 0xe0e0e0, { y: 2.0 * sc, r: rot, det: 0 }));
  p = at(0, -L / 2 + 1.6 * sc); P.push(deco(p[0], p[1], 11 * sc, 2.6 * sc, 0.3 * sc, 0xe0e0e0, { y: 4.2 * sc, r: rot, det: 0 }));
  p = at(0, -L / 2 + 2 * sc); P.push(deco(p[0], p[1], 0.35 * sc, 4 * sc, 5.5 * sc, livery, { y: 4.4 * sc, r: rot, det: 0 }));
  p = at(0, 0); P.push(deco(p[0], p[1], 3.45 * sc, L * 0.92, 0.5 * sc, livery, { y: 2.6 * sc, r: rot, det: 0 }));
  for (const sx of [-1, 1]) { p = at(sx * 6 * sc, 2.4 * sc); P.push(cyl(p[0], p[1], 0.6 * sc, 0.9 * sc, 0.9 * sc, 1.4 * sc, 8, 0x9e9e9e, { det: 1 })); }
}
// Árboles en hilera a lo largo de un lado
function treeRow(P, x0, z0, x1, z1, n, type, sc = 1) {
  for (let i = 0; i < n; i++) { const t = n > 1 ? i / (n - 1) : 0.5; P.push(prop(type, x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, { col: 1, sc })); }
}

export const EXTRA_BUILDERS = {
  // ---------------- gobierno y servicios del centro ----------------
  banco(site) {
    const P = [];
    const { hx, hz } = site;
    const stone = 0xe8e0d0;
    P.push(decal(0, 0, hx * 2, hz * 2, 0xcfc8ba));
    const bw = hx * 2 - 4, bd = hz * 2 - 8, bz = -2;
    P.push(box(0, bz, bw, bd, 11, stone, { f: 'officePunch', fh: 3.6, par: 0.8 }));
    // pórtico neoclásico
    for (let i = 0; i < 3; i++) P.push(box(0, bz + bd / 2 + 1.5 + i * 0.5, bw * 0.7 + 2 - i, 0.5, 0.3 * (3 - i), 0xd7cfbf, { y: 0 }));
    colonnade(P, -bw * 0.3, bw * 0.3, bz + bd / 2 + 1.0, 6, 8.2, 0xf3eee4);
    P.push(slab(0, bz + bd / 2 + 1.0, 8.2, bw * 0.7, 2.6, 0.8, stone));
    P.push(gable(0, bz + bd / 2 + 1.0, 9.0, bw * 0.7, 2.6, 2.0, 0xe2d9c7, 0.1));
    P.push(door(0, bz + bd / 2 + 0.04, 2.6, 4.2, 0x3e2723, 0, { cell: 'doorWood' }));
    P.push(sign(0, bz + bd / 2 + 2.35, 9.2, 8, 0.9, site.name.toUpperCase(), '#1b3a5c', '#f5e6b8'));
    P.push(panel('acUnit', bw / 2 - 2, bz + bd / 2 + 0.03, 1.1, 0.9, 1.4, { fc: 0x37474f, det: 1 })); // cajero
    for (const s of [-1, 1]) P.push(prop('planter', s * (bw * 0.35 + 1.5), hz - 1.5, { det: 1 }));
    return { parts: P, points: { door: [0, hz + 1.5] } };
  },

  ayuntamiento(site) {
    const P = [];
    const { hx, hz } = site;
    const wall = 0xf0e3c8, trim = 0xb8854f;
    P.push(decal(0, 0, hx * 2, hz * 2, 0xd3c8b4));
    const bw = hx * 2 - 2, bd = hz * 2 - 10, bz = -4;
    P.push(box(0, bz, bw, bd, 10, wall));
    P.push(deco(0, bz, bw + 0.2, bd + 0.2, 0.6, trim, { y: 4.6, det: 0 }));
    P.push(deco(0, bz, bw + 0.3, bd + 0.3, 0.8, trim, { y: 9.6, det: 0 }));
    // portales (arcos) en planta baja y balcones arriba
    const n = Math.floor(bw / 4);
    for (let i = 0; i < n; i++) {
      const x = -bw / 2 + (bw / n) * (i + 0.5);
      P.push(win(x, bz + bd / 2 + 0.03, 0.2, 2.6, 3.8, 0, { cell: 'winArch', f: trim }));
      P.push(win(x, bz + bd / 2 + 0.03, 6.0, 1.4, 2.6, 0, { cell: 'balconyDoor', f: 0xffffff }));
      P.push(deco(x, bz + bd / 2 + 0.5, 2.0, 1.0, 0.15, 0x5d4037, { y: 5.9 }));
    }
    // torre del reloj
    P.push(box(0, bz + bd / 2 - 3, 6, 6, 18, wall));
    P.push(cyl(0, bz + bd / 2 + 0.04, 13.5, 1.6, 1.6, 0.1, 16, 0xffffff, { det: 0 }));
    P.push({ k: 'hip', x: 0, z: bz + bd / 2 - 3, y: 18, w: 6, d: 6, rh: 3.6, c: 0x8d4b32, over: 0.3 });
    P.push(door(0, bz + bd / 2 + 0.04, 2.6, 3.6, 0x4e342e, 0, { cell: 'doorWood' }));
    P.push(sign(0, bz + bd / 2 + 0.1, 10.6, 12, 1.1, 'PALACIO MUNICIPAL', '#5d2e1f', '#f5e6b8'));
    // explanada con asta bandera
    P.push(decal(0, hz - 4, bw, 8, 0xe2d6bf, { y: 0.01 }));
    P.push(cyl(0, hz - 3, 0, 0.14, 0.08, 14, 6, 0xdddddd, { col: 1 }));
    flag(P, 0, hz - 3, 12.2, 3.2, 1.9);
    for (const s of [-1, 1]) { P.push(prop('laurel', s * (bw / 2 - 3), hz - 3.5, { col: 1 })); P.push(prop('lampColonial', s * 6, hz - 2)); }
    return { parts: P, points: { door: [0, hz + 1.5] } };
  },

  juzgado(site) {
    const P = [];
    const { hx, hz } = site;
    const stone = 0xdedad2;
    P.push(decal(0, 0, hx * 2, hz * 2, 0xc9c3b6));
    const bw = hx * 2 - 4, bd = hz * 2 - 9, bz = -2.5;
    P.push(box(0, bz, bw, bd, 13, stone, { f: 'officePunch', fh: 4.2, par: 0.6 }));
    for (let i = 0; i < 4; i++) P.push(box(0, bz + bd / 2 + 1 + i * 0.6, bw - 2 - i * 1.2, 0.6, 1.2 - i * 0.3, 0xcfc9bd));
    colonnade(P, -bw / 2 + 2, bw / 2 - 2, bz + bd / 2 + 0.7, 8, 10, 0xf2efe8, 0.4);
    P.push(slab(0, bz + bd / 2 + 0.7, 10, bw - 1, 2.2, 1.0, stone));
    P.push(sign(0, bz + bd / 2 + 1.85, 10.2, 12, 0.8, 'PALACIO DE JUSTICIA', '#3e3a33', '#f0e6cc'));
    P.push(door(0, bz + bd / 2 + 0.04, 3, 4.4, 0x3e2723, 0, { cell: 'doorWood' }));
    for (const s of [-1, 1]) P.push(prop('laurel', s * (hx - 2.5), hz - 2, { col: 1 }));
    return { parts: P, points: { door: [0, hz + 1.5] } };
  },

  bomberos(site) {
    const P = [];
    const { hx, hz } = site;
    const brick = 0xa8452f;
    P.push(decal(0, 0, hx * 2, hz * 2, 0x8f9397));
    const bw = hx * 2 - 2, bd = hz * 2 - 9, bz = -3.5;
    P.push(box(0, bz, bw, bd, 8, brick));
    P.push(deco(0, bz, bw + 0.2, bd + 0.2, 0.6, 0xf5f5f5, { y: 7.6, det: 0 }));
    const n = 3;
    for (let i = 0; i < n; i++) {
      const x = -bw / 2 + 4 + (bw - 12) / (n - 1) * i;
      P.push(door(x, bz + bd / 2 + 0.04, 4.0, 4.6, 0xb71c1c, 0, { cell: 'rollup' }));
      P.push(prop('firetruck', x, hz - 3.5, { col: 1, r: 0 }));
    }
    P.push(box(bw / 2 - 2.5, bz, 4, 4, 15, brick));
    P.push({ k: 'hip', x: bw / 2 - 2.5, z: bz, y: 15, w: 4, d: 4, rh: 1.6, c: 0x37474f, over: 0.2 });
    P.push(sign(-2, bz + bd / 2 + 0.12, 6.2, 12, 1.0, 'H. CUERPO DE BOMBEROS', '#b71c1c'));
    P.push(decal(0, hz - 3.5, bw, 7, 0x6f7377, { y: 0.01 }));
    return { parts: P, points: {} };
  },

  // ---------------- comercio y servicios ----------------
  // Concesionario por gama (site.tier): 'economico' (seminuevos), 'medio' (agencia) o 'lujo'.
  // Sala de exhibición al fondo, autos en exhibición de frente a la calle y acceso al centro.
  concesionario(site, rng = new Rng(7)) {
    const P = [];
    const { hx, hz } = site;
    const tier = site.tier || 'medio';
    const T = {
      economico: { floor: 0x7d7f80, wall: 0xf1e3c4, band: 0xf9a825, signBg: '#f9a825', signFg: '#3e2723', glass: null, cars: ['carCompact', 'carSedan', 'carPickup', 'carCompact', 'carSedan'], colors: [0xb03a2e, 0x6c7a89, 0xd6c9a8, 0x2e4053, 0x7d6608, 0x5d6d7e] },
      medio: { floor: 0x9a9da0, wall: 0xeceff1, band: 0x0d47a1, signBg: '#0d47a1', signFg: '#ffffff', glass: 'glassBlue', cars: ['carSedan', 'carSUV', 'carCompact', 'carPickup', 'carSedan', 'carSUV'], colors: [0xc0392b, 0xecf0f1, 0x2980b9, 0x1b1b1b, 0x7f8c8d, 0x16a085] },
      lujo: { floor: 0xdedbd5, wall: 0xeeeae2, band: 0xc9a227, signBg: '#111111', signFg: '#e2c25a', glass: 'glassDark', cars: ['carLux', 'carSport', 'carSUV', 'carSport', 'carLux'], colors: [0x111111, 0xf1f1f1, 0xb71c1c, 0x1a237e, 0xc9a227, 0x546e7a] },
    }[tier];
    P.push(decal(0, 0, hx * 2, hz * 2, T.floor));
    // sala de exhibición
    const bw = hx * 2 - 6, bd = Math.min(14, hz), bz = -hz + bd / 2 + 2, bh = tier === 'lujo' ? 8 : tier === 'medio' ? 7 : 4.2;
    if (T.glass) {
      P.push(box(0, bz, bw, bd, bh, T.wall, { f: T.glass, fh: bh, gf: 'lobby', gfH: bh - 1.2, gfc: T.band, par: 0.6 }));
      P.push(deco(0, bz, bw + 0.3, bd + 0.3, 1.0, T.band, { y: bh - 1.0, det: 0 }));
      P.push(slab(0, bz + bd / 2 + 2.5, bh - 1.6, bw * 0.45, 5, 0.35, tier === 'lujo' ? 0x1c1c1c : 0xf5f5f5));         // marquesina
      for (const sx of [-1, 1]) P.push(cyl(sx * bw * 0.2, bz + bd / 2 + 4.6, 0, 0.2, 0.2, bh - 1.6, 8, tier === 'lujo' ? 0xc9a227 : 0xcfd8dc, { col: 1 }));
    } else {
      // seminuevos: oficina sencilla, toldo y banderines
      P.push(box(-bw / 4, bz, bw / 2, bd - 4, bh, T.wall));
      P.push(door(-bw / 4, bz + (bd - 4) / 2 + 0.03, 1.2, 2.2, 0x37474f, 0, { cell: 'doorGlass' }));
      P.push(panel('winLarge', -bw / 4 + 3.2, bz + (bd - 4) / 2 + 0.04, 0.9, 3.4, 1.8, { fc: 0x2c3e50 }));
      P.push(panel('winLarge', -bw / 4 - 3.2, bz + (bd - 4) / 2 + 0.04, 0.9, 3.4, 1.8, { fc: 0x2c3e50 }));
      P.push({ k: 'awn', x: -bw / 4, z: bz + (bd - 4) / 2 + 0.9, y: 3.2, w: bw / 2 - 1, d: 1.8, c: 0xf9a825, c2: 0xffffff });
      for (let i = 0; i < 4; i++) P.push({ k: 'flags', x: 0, z: -hz + 6 + i * (hz * 2 - 10) / 3, y: 4.6, w: hx * 2 - 4, colors: [0xe53935, 0xfdd835, 0x1e88e5, 0x43a047], det: 1 });
      for (const sx of [-1, 1]) P.push(cyl(sx * (hx - 1.2), -hz + 4, 0, 0.08, 0.06, 5, 5, 0xb0b0b0));
    }
    P.push(sign(0, bz + bd / 2 + 0.15, bh - 0.55, Math.min(bw * 0.6, 16), 1.1, site.name.toUpperCase(), T.signBg, T.signFg));
    // autos en exhibición (dos filas en diagonal hacia la calle), con tarima en lujo
    const n = Math.max(3, Math.floor((hx * 2 - 6) / 5.4));
    for (let row = 0; row < 2; row++) {
      const z = bz + bd / 2 + 7 + row * 7.5;
      if (z > hz - 3) break;
      for (let i = 0; i < n; i++) {
        const x = -hx + 3.5 + (i + 0.5) * ((hx * 2 - 7) / n);
        if (row === 0 && Math.abs(x) < 3.5) continue;                       // pasillo a la entrada
        const type = T.cars[(i + row * 2) % T.cars.length], c = T.colors[(i * 3 + row) % T.colors.length];
        if (tier === 'lujo') P.push(cyl(x, z, 0, 2.9, 2.9, 0.18, 12, 0xf5f5f5));
        P.push(prop(type, x, z, { y: tier === 'lujo' ? 0.18 : 0, r: row ? -0.5 : 0.5, c, col: 1 }));
        if (tier !== 'lujo') P.push(deco(x + 1.7, z + 1.6, 0.6, 0.04, 0.4, 0xffffff, { y: 1.0 }));          // letrero de precio
      }
    }
    // cerca y acceso
    perimeter(P, hx - 0.3, hz - 0.3, tier === 'lujo' ? 1.0 : 1.4, tier === 'lujo' ? 0x2b2d30 : 0x9e9e9e, 9, tier === 'lujo' ? 'wall' : 'rail');
    if (tier === 'lujo') {
      for (const sx of [-1, 1]) { P.push(prop('palm', sx * (hx - 2.5), hz - 2.5, { col: 1, sc: 1.2 })); P.push(prop('palm', sx * (hx - 2.5), -hz + 3, { col: 1, sc: 1.1 })); }
      for (let i = 0; i < 4; i++) P.push(prop('lampgarden', -hx + 3 + i * ((hx * 2 - 6) / 3), hz - 1.2));
    } else {
      for (const sx of [-1, 1]) P.push(prop('lamp', sx * (hx - 1.5), hz - 1.5, { r: Math.PI }));
    }
    return { parts: P, points: { door: [0, hz + 1.5] } };
  },
  taller(site, rng = new Rng(8)) {
    const res = B.taller(rng, site.hx * 2, site.hz * 2, site.name);
    return { parts: res.parts, points: { door: [0, site.hz + 1.5] } };
  },
  fabrica(site, rng = new Rng(9)) {
    const res = B.fabrica(rng, site.hx * 2, site.hz * 2);
    res.parts.push(sign(-site.hx + 7, site.hz - 4.8, 7.0, 9, 1.0, site.name.toUpperCase(), '#37474f'));
    return { parts: res.parts, points: {} };
  },

  terminal(site) {
    const P = [];
    const { hx, hz } = site;
    P.push(decal(0, 0, hx * 2, hz * 2, 0x55595e));
    // edificio de la terminal al fondo
    const bw = hx * 2 - 6;
    P.push(box(0, -hz + 6, bw, 10, 7, 0xeee6d8, { gf: 'lobby', gfH: 4.4, f: 'officeBand', fh: 2.6 }));
    P.push(deco(0, -hz + 6, bw + 0.2, 10.2, 0.8, 0x00695c, { y: 6.4, det: 0 }));
    P.push(sign(0, -hz + 11.1, 5.4, 18, 1.2, 'TERMINAL DE AUTOBUSES', '#00695c'));
    P.push(door(0, -hz + 11.05, 3.6, 2.8, 0x263238, 0, { cell: 'doorGlass' }));
    // andenes techados
    P.push(slab(0, -hz + 15, 4.6, bw, 7, 0.3, 0xeceff1));
    for (let i = 0; i < 6; i++) P.push(cyl(-bw / 2 + 1 + (bw - 2) * i / 5, -hz + 18, 0, 0.18, 0.18, 4.6, 6, 0x90a4ae, { col: 1 }));
    for (let i = 0; i < 5; i++) {
      const x = -bw / 2 + 4 + (bw - 8) * i / 4;
      P.push(decal(x, -hz + 24, 3.6, 12, 0x63676c, { y: 0.01, det: 1 }));
      if (i % 2 === 0 || i === 3) P.push(prop('bus', x, -hz + 24, { col: 1, r: 0, c: [0x00897b, 0xf9a825, 0x1565c0, 0xd84315][i % 4] }));
    }
    for (const s of [-1, 1]) P.push(prop('palm', s * (hx - 2), hz - 2, { col: 1, sc: 1.2 }));
    return { parts: P, points: { door: [0, -hz + 13] } };
  },

  escuela(site) {
    const P = [];
    const { hx, hz } = site;
    const wall = 0xf2e6c9, band = 0x2e7d32;
    P.push(decal(0, 0, hx * 2, hz * 2, 0xc9bfa6));
    perimeter(P, hx - 0.3, hz - 0.3, 2.2, 0x9e9e9e, 6, 'rail');
    // edificio en L de dos pisos
    P.push(box(-hx / 2 + 1, -hz + 6, hx + 4, 9, 7, wall, { f: 'officePunch', fh: 3.5 }));
    P.push(box(hx - 7, -2, 9, hz * 2 - 10, 7, wall, { f: 'officePunch', fh: 3.5 }));
    P.push(deco(-hx / 2 + 1, -hz + 6, hx + 4.2, 9.2, 0.6, band, { y: 3.3, det: 0 }));
    P.push(deco(hx - 7, -2, 9.2, hz * 2 - 9.8, 0.6, band, { y: 3.3, det: 0 }));
    P.push(sign(-hx / 2 + 1, -hz + 10.6, 5.6, 14, 1.0, site.name.toUpperCase(), '#2e7d32'));
    // cancha y patio cívico
    P.push(decal(-6, 4, 16, 12, 0x3f7fbf, { y: 0.01 }));
    P.push(decal(-6, 4, 15, 0.15, 0xffffff, { y: 0.02 }));
    P.push(prop('hoop', -13.5, 4, { r: Math.PI / 2 }));
    P.push(prop('hoop', 1.5, 4, { r: -Math.PI / 2 }));
    P.push(cyl(-hx + 4, hz - 4, 0, 0.12, 0.08, 10, 6, 0xdddddd, { col: 1 }));
    flag(P, -hx + 4, hz - 4, 8.3, 2.8, 1.7);
    for (const x of [-hx + 4, 4]) P.push(prop('jacaranda', x, hz - 8, { col: 1 }));
    return { parts: P, points: {} };
  },

  iglesia(site) {
    const P = [];
    const { hx, hz } = site;
    const wall = 0xf3e7cf, trim = 0xc9a066;
    P.push(decal(0, 0, hx * 2, hz * 2, 0xd9cdb4));
    const nw = 10, nd = hz * 2 - 9, nz = -3.5;
    P.push(box(0, nz, nw, nd, 9, wall));
    P.push(gable(0, nz, 9, nw, nd, 3.2, 0x9c4a2f, 0.4));
    // fachada con espadaña y campanario
    P.push(box(0, nz + nd / 2 - 0.6, nw + 1, 1.4, 12.5, wall));
    P.push(deco(0, nz + nd / 2 + 0.15, nw + 1.2, 0.2, 0.5, trim, { y: 9, det: 0 }));
    P.push(win(0, nz + nd / 2 + 0.12, 7.5, 1.6, 1.6, 0, { cell: 'winArch', f: trim }));
    P.push(door(0, nz + nd / 2 + 0.12, 2.4, 4.0, 0x4e342e, 0, { cell: 'doorWood' }));
    P.push(box(nw / 2 + 2, nz + nd / 2 - 2, 4, 4, 16, wall));
    P.push(box(nw / 2 + 2, nz + nd / 2 - 2, 3.2, 3.2, 3, 0xece0c5, { y: 16, col: 0 }));
    for (const r of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) P.push(win(nw / 2 + 2 + Math.sin(r) * 1.62, nz + nd / 2 - 2 + Math.cos(r) * 1.62, 16.5, 1.1, 1.8, r, { cell: 'winArch', f: trim, c: 0x1b1b1b, det: 1 }));
    P.push({ k: 'cone', x: nw / 2 + 2, z: nz + nd / 2 - 2, y: 19, r: 2.2, h: 3.2, seg: 8, c: 0x9c4a2f });
    P.push({ k: 'cross', x: 0, z: nz + nd / 2 - 0.6, y: 12.5, c: 0xf0e0b0 });
    for (let i = 0; i < 3; i++) P.push(win(-nw / 2 - 0.04, nz - nd / 2 + 4 + i * 5, 3.5, 1.2, 3, -Math.PI / 2, { cell: 'winArch', f: trim, det: 1 }));
    // atrio con barda baja y árboles
    P.push(fence(-hx + 0.5, hz - 0.5, -2, hz - 0.5, 'wall', 1.1, wall));
    P.push(fence(2, hz - 0.5, hx - 0.5, hz - 0.5, 'wall', 1.1, wall));
    for (const s of [-1, 1]) P.push(prop('laurel', s * (hx - 2.5), hz - 4, { col: 1 }));
    P.push(prop('bench', -hx + 2, hz - 7, { r: Math.PI / 2, det: 1 }));
    return { parts: P, points: {} };
  },

  cancha(site) {
    const P = [];
    const { hx, hz } = site;
    P.push(decal(0, 0, hx * 2, hz * 2, 0x9c8a6a));
    const fw = hx * 2 - 8, fd = hz * 2 - 10;
    P.push(decal(0, -1, fw, fd, 0x5aa04a, { y: 0.01 }));
    const L = (x, z, w, d) => P.push(decal(x, z - 1, w, d, 0xffffff, { y: 0.02 }));
    L(0, -fd / 2 + 0.6, fw - 1, 0.2); L(0, fd / 2 - 0.6, fw - 1, 0.2); L(-fw / 2 + 0.6, 0, 0.2, fd - 1); L(fw / 2 - 0.6, 0, 0.2, fd - 1); L(0, 0, 0.2, fd - 1);
    for (const s of [-1, 1]) {
      const gx = s * (fw / 2 - 0.6);
      P.push(deco(gx, -3.5, 0.15, 0.15, 2.2, 0xffffff, { det: 0 }));
      P.push(deco(gx, 1.5, 0.15, 0.15, 2.2, 0xffffff, { det: 0 }));
      P.push(deco(gx, -1, 0.15, 5.1, 0.15, 0xffffff, { y: 2.1, det: 0 }));
    }
    perimeter(P, hx - 0.5, hz - 0.5, 3.2, 0x7d8a8f, 4, 'rail');
    for (let i = 0; i < 3; i++) P.push(box(0, hz - 3 + i * 0.8, fw * 0.5, 0.8, 0.45 + i * 0.45, 0x9e9e9e));
    for (const [x, z] of [[-hx + 1.5, -hz + 1.5], [hx - 1.5, -hz + 1.5], [-hx + 1.5, hz - 1.5], [hx - 1.5, hz - 1.5]]) P.push(prop('floodlight', x, z, { col: 1, sc: 0.8 }));
    return { parts: P, points: {} };
  },

  gimnasio(site) {
    const P = [];
    const { hx, hz } = site;
    P.push(decal(0, 0, hx * 2, hz * 2, 0x63676c));
    const bw = hx * 2 - 2, bd = hz * 2 - 7, bz = -2.5;
    P.push(box(0, bz, bw, bd, 8, 0x2b2f33));
    for (let i = 0; i < 4; i++) P.push(panel('winLarge', -bw / 2 + 2 + i * (bw - 4) / 3, bz + bd / 2 + 0.03, 0.4, (bw - 6) / 4, 5.6, { fc: 0x111111 }));
    P.push(deco(0, bz + bd / 2 + 0.05, bw, 0.1, 0.9, 0xffc107, { y: 6.6, det: 0 }));
    P.push(sign(0, bz + bd / 2 + 0.15, 6.9, 12, 1.0, site.name.toUpperCase(), '#111111', '#ffc107'));
    P.push(door(bw / 2 - 2.5, bz + bd / 2 + 0.06, 2, 2.6, 0x111111, 0, { cell: 'doorGlass' }));
    P.push(decal(0, hz - 2.5, bw, 5, 0x55595e, { y: 0.01 }));
    return { parts: P, points: { door: [bw / 2 - 2.5, hz + 1.5] } };
  },

  disco(site) {
    const P = [];
    const { hx, hz } = site;
    P.push(decal(0, 0, hx * 2, hz * 2, 0x3a3d42));
    const bw = hx * 2 - 2, bd = hz * 2 - 6, bz = -2;
    P.push(box(0, bz, bw, bd, 9, 0x1c1c24));
    for (const [y, c] of [[2.6, 0xff00aa], [5.2, 0x00e5ff], [7.8, 0x7c4dff]]) P.push(deco(0, bz, bw + 0.15, bd + 0.15, 0.25, c, { y, det: 0 }));
    P.push(sign(0, bz + bd / 2 + 0.12, 6.2, 11, 1.4, 'NEÓN', '#1c1c24', '#ff4fd8'));
    P.push(door(0, bz + bd / 2 + 0.06, 2.6, 2.8, 0x111111, 0, { cell: 'doorMetal' }));
    P.push(slab(0, bz + bd / 2 + 1.2, 3.0, 5, 2.4, 0.2, 0xff00aa));
    for (let i = 0; i < 6; i++) P.push(cyl(-4 + i * 1.6, hz - 2, 0, 0.06, 0.06, 1.0, 5, 0xd4af37, { det: 1 }));
    P.push(fence(-4, hz - 2, 4, hz - 2, 'rail', 0.9, 0xb71c1c, { col: 0, det: 1 }));
    for (const s of [-1, 1]) P.push(prop('palm', s * (hx - 1.5), hz - 1.5, { col: 1, sc: 1.2 }));
    return { parts: P, points: { door: [0, hz + 1.5] } };
  },

  // ---------------- transporte ----------------
  aeropuerto(site) {
    // Aeropuerto internacional: pista al fondo (norte), calle de rodaje paralela, plataforma con
    // aviones, terminal con pasillos telescópicos, torre de control, hangares, carga y combustible.
    // El frente (+Z) da a la Av. del Aeropuerto: estacionamiento y acceso.
    const P = [];
    const { hx, hz } = site;
    const ASPH = 0x3a3e43, CONC = 0x8f9296, YEL = 0xf2c230;
    P.push(decal(0, 0, hx * 2, hz * 2, 0x8fa06e));
    // ---- pista 2 aguas: 2*hx-20 de largo, 32 m de ancho ----
    const rz = -hz + 24, RL = hx * 2 - 20;
    P.push(decal(0, rz, RL + 6, 38, 0x6f7a5a, { y: 0.005 }));            // franja de seguridad
    P.push(decal(0, rz, RL, 32, ASPH, { y: 0.01 }));
    for (let x = -RL / 2 + 40; x < RL / 2 - 40; x += 24) P.push(decal(x, rz, 12, 0.7, 0xffffff, { y: 0.02 }));
    for (const s of [-1, 1]) {
      P.push(decal(0, rz + s * 15, RL - 4, 0.45, 0xffffff, { y: 0.02 }));            // orillas
      for (let i = 0; i < 8; i++) P.push(decal(s * (RL / 2 - 9), rz - 12.5 + i * 3.6, 12, 1.6, 0xffffff, { y: 0.02 }));   // umbral
      P.push(decal(s * (RL / 2 - 34), rz - 6, 16, 3.5, 0xffffff, { y: 0.02 }));      // zona de toma de contacto
      P.push(decal(s * (RL / 2 - 34), rz + 6, 16, 3.5, 0xffffff, { y: 0.02 }));
      P.push(decal(s * (RL / 2 + 1), rz, 1.2, 32, 0xffffff, { y: 0.02 }));
    }
    // luces de orilla de pista
    for (let x = -RL / 2; x <= RL / 2; x += 30) for (const s of [-1, 1]) P.push(deco(x, rz + s * 17.5, 0.35, 0.35, 0.45, s > 0 ? 0xfff59d : 0xe0e0e0, { det: 1 }));
    // ---- calle de rodaje paralela y conexiones ----
    const tz = rz + 44;
    P.push(decal(0, tz, RL - 30, 16, ASPH, { y: 0.01 }));
    P.push(decal(0, tz, RL - 34, 0.35, YEL, { y: 0.02 }));
    for (const x of [-RL / 2 + 20, 0, RL / 2 - 20]) {
      P.push(decal(x, (rz + tz) / 2, 18, tz - rz, ASPH, { y: 0.012 }));
      P.push(decal(x, (rz + tz) / 2, 0.35, tz - rz, YEL, { y: 0.022 }));
    }
    // ---- plataforma (apron) ----
    const az0 = tz + 8, az1 = hz - 58;
    P.push(decal(-hx * 0.05, (az0 + az1) / 2, hx * 1.5, az1 - az0, CONC, { y: 0.008 }));
    for (let i = -3; i <= 3; i++) P.push(decal(i * 26 - hx * 0.05, (az0 + az1) / 2, 0.3, az1 - az0 - 4, YEL, { y: 0.02, det: 1 }));
    // ---- terminal ----
    const tw = 120, td = 30, tcz = hz - 42, th = 14;
    P.push(box(0, tcz, tw, td, th, 0xe6ebee, { f: 'glassBlue', fh: 4.6, par: 0.6 }));
    P.push(box(0, tcz - 2, tw * 0.55, td - 6, 5, 0xd5dde2, { y: th, f: 'glassTeal', fh: 5, par: 0.4 }));
    P.push(slab(0, tcz, th + 0.1, tw + 10, td + 10, 1.0, 0xcfd8dc));                    // gran alero
    P.push(slab(0, tcz + td / 2 + 7, 5.4, tw * 0.8, 10, 0.5, 0xeceff1));                 // marquesina de llegada
    for (let i = 0; i < 9; i++) P.push(cyl(-tw * 0.38 + i * (tw * 0.76 / 8), tcz + td / 2 + 11, 0, 0.35, 0.3, 5.4, 8, 0xb0bec5, { col: 1 }));
    P.push(sign(0, tcz + td / 2 + 0.2, th - 3.2, 40, 2.2, 'AEROPUERTO INTERNACIONAL PUERTO NOVA', '#0d47a1'));
    // pasillos telescópicos hacia los aviones
    for (const x of [-38, 0, 38]) {
      P.push(box(x, tcz - td / 2 - 9, 3.2, 18, 3.0, 0xcfd8dc, { y: 4.2, colH: 7.2 }));
      P.push(deco(x, tcz - td / 2 - 18.5, 4.2, 3.2, 3.6, 0x90a4ae, { y: 3.9, det: 0 }));
      P.push(cyl(x, tcz - td / 2 - 16, 0, 0.35, 0.35, 4.2, 6, 0x78909c, { col: 1 }));
    }
    airplane(P, -38, tcz - td / 2 - 36, Math.PI, 1.15, 0x1565c0);
    airplane(P, 0, tcz - td / 2 - 36, Math.PI, 1.0, 0xc62828);
    airplane(P, 38, tcz - td / 2 - 36, Math.PI, 1.1, 0x2e7d32);
    airplane(P, hx * 0.42, tz, -Math.PI / 2, 1.0, 0xef6c00);                          // rodando
    // torre de control
    const cx = tw / 2 + 22, cz = tcz - 4;
    P.push(box(cx, cz, 10, 10, 6, 0xe0e0e0, { f: 'officeBand', fh: 3 }));
    P.push(cyl(cx, cz, 6, 2.8, 2.3, 30, 12, 0xeceff1, { col: 1 }));
    P.push(cyl(cx, cz, 36, 5.2, 5.6, 1.0, 12, 0xcfd8dc));
    P.push(cyl(cx, cz, 37, 5.0, 5.4, 4, 12, 0x37474f));
    P.push(cyl(cx, cz, 37.3, 5.1, 5.5, 3.3, 12, 0x4fc3f7));
    P.push(cyl(cx, cz, 41, 5.8, 3.6, 0.9, 12, 0xeceff1));
    P.push(cyl(cx, cz, 41.9, 0.12, 0.06, 4.5, 5, 0xb0b4b8));
    P.push(cyl(cx + 9, cz + 4, 0, 3.4, 3.4, 9, 12, 0xeceff1, { col: 1 }));          // radar
    P.push({ k: 'cyl', x: cx + 9, z: cz + 4, y: 9, r: 3.6, r2: 0.4, h: 3.4, seg: 12, c: 0xffffff, col: 0, det: 0 });
    // hangares (oeste), puertas hacia la plataforma
    for (let i = 0; i < 3; i++) {
      const x = -hx + 34 + i * 46, z = az0 + 22;
      P.push(box(x, z, 40, 30, 12, 0xb7c3c9));
      P.push({ k: 'gable', x, z, y: 12, w: 40, d: 30, rh: 4, c: 0x6f8794, over: 0.4 });
      P.push(door(x, z - 15.05, 32, 10.5, 0x90a4ae, Math.PI, { cell: 'rollup' }));
      P.push(sign(x, z - 15.1, 11, 14, 1.6, 'HANGAR ' + (i + 1), '#263238', '#ffffff', Math.PI));
      P.push(decal(x, z - 26, 30, 22, CONC, { y: 0.009 }));
    }
    airplane(P, -hx + 34, az0 - 2, 0, 0.55, 0x6a1b9a);
    // carga y tanques de combustible (este)
    const ex = hx - 40;
    P.push(box(ex, az0 + 20, 44, 26, 10, 0xc8b99a, { f: 'officeBand', fh: 5 }));
    P.push(sign(ex, az0 + 20 - 13.1, 8.5, 16, 1.6, 'CARGA AÉREA', '#bf360c', '#ffffff', Math.PI));
    for (let i = 0; i < 3; i++) {
      P.push(cyl(ex - 14 + i * 12, az1 + 14, 0, 4.2, 4.2, 7, 12, 0xeceff1, { col: 1 }));
      P.push(cyl(ex - 14 + i * 12, az1 + 14, 7, 4.3, 3.2, 0.9, 12, 0xcfd8dc));
    }
    // estacionamiento y vialidad de acceso al frente
    parking(P, -hx * 0.45, hz - 12, 90, 14, 0);
    parking(P, hx * 0.45, hz - 12, 90, 14, 0);
    P.push(decal(0, hz - 14, 26, 28, ASPH, { y: 0.006 }));
    P.push(decal(0, tcz + td / 2 + 8, tw * 0.9, 9, ASPH, { y: 0.007 }));
    // jardín frente a la terminal, manga de viento y cerca
    for (let i = 0; i < 8; i++) P.push(prop('palm', -tw / 2 + 6 + i * ((tw - 12) / 7), hz - 24, { col: 1 }));
    P.push(cyl(-hx + 12, rz + 24, 0, 0.08, 0.08, 6, 5, 0xbdbdbd));
    P.push({ k: 'cyl', x: -hx + 12.9, z: rz + 24, y: 5.6, r: 0.4, r2: 0.15, h: 1.8, seg: 6, c: 0xff6d00, col: 0, det: 0 });
    perimeter(P, hx - 0.5, hz - 0.5, 2.6, 0x9e9e9e, 30, 'rail', { colH: 3 });
    for (let x = -hx * 0.7; x <= hx * 0.7; x += 35) P.push(prop('floodlight', x, az1 - 2, { col: 1 }));
    return { parts: P, points: { door: [0, hz + 2] } };
  },

  // ---------------- presa y campo ----------------
  presa(site) {
    // La cortina corre a lo largo del eje local X; el lago queda del lado site.lakeSide (+1 = +Z)
    const P = [];
    const { hx } = site;
    const ls = site.lakeSide || -1;
    const drop = site.drop || 14;
    const concrete = 0xbdb8ac;
    // la corona de la cortina está a la altura del sitio (y = 0)
    P.push(box(0, 0, hx * 2, 6, drop + 2, concrete, { y: -drop - 2 }));
    P.push(box(0, -ls * 5, hx * 2 - 4, 4, drop - 2, 0xa9a397, { y: -drop - 2 }));            // contrafuerte
    P.push(deco(0, 0, hx * 2 + 0.1, 6.2, 0.3, 0x8d877b, { y: -0.3, det: 0 }));
    for (const s of [-1, 1]) P.push(fence(-hx + 1, s * 2.8, hx - 1, s * 2.8, 'rail', 1.1, 0x607d8b, { colH: 1.6 }));
    // vertedor y cascada
    const wf = Math.min(14, hx);
    P.push(deco(0, -ls * 3.2, wf, 0.6, drop + 1.6, 0xa8dcf0, { y: -drop - 2, det: 0 }));
    P.push(deco(0, -ls * 3.6, wf * 0.92, 0.3, drop + 1.0, 0xe1f5fe, { y: -drop - 1.6, det: 0 }));
    P.push(decal(0, -ls * 9, wf + 6, 8, 0xe3f2fd, { y: -drop - 1.2 }));
    // casetas de control
    for (const s of [-1, 1]) {
      P.push(box(s * (hx - 3), 0, 4, 4, 3.2, 0xeceff1));
      P.push({ k: 'hip', x: s * (hx - 3), z: 0, y: 3.2, w: 4, d: 4, rh: 1.2, c: 0x455a64, over: 0.3 });
    }
    P.push(sign(0, -ls * 3.05, -1.8, 12, 1.0, site.name.toUpperCase(), '#37474f', '#ffffff', ls > 0 ? Math.PI : 0));
    return { parts: P, points: {} };
  },

  mina(site) {
    const P = [];
    const { hx, hz } = site;
    P.push(decal(0, 0, hx * 2, hz * 2, 0xa48a6a));
    // tajo escalonado
    for (let i = 0; i < 4; i++) P.push(decal(-6, -6, (hx * 2 - 18) - i * 9, (hz * 2 - 18) - i * 7, [0x9c7f5d, 0x8e7252, 0x80664a, 0x725b41][i], { y: 0.01 + i * 0.01 }));
    // castillete y banda
    P.push(deco(hx - 10, -hz + 10, 0.5, 0.5, 16, 0x5d4037, { det: 0 }));
    for (const [x, z] of [[hx - 14, -hz + 10], [hx - 10, -hz + 14], [hx - 14, -hz + 14]]) P.push(deco(x, z, 0.5, 0.5, 16, 0x5d4037, { det: 0 }));
    P.push(box(hx - 12, -hz + 12, 6, 6, 2, 0x6d4c41, { y: 14, col: 0 }));
    P.push(cyl(hx - 12, -hz + 12, 16, 1.4, 1.4, 0.5, 10, 0x37474f));
    P.push(box(hx - 20, -hz + 12, 14, 2, 1, 0x455a64, { y: 7, col: 0 }));
    P.push(box(hx - 26, -hz + 12, 2, 2, 7, 0x455a64));
    // galpón y pilas de material
    P.push(box(-hx + 9, hz - 8, 14, 10, 6, 0x8d8d8d));
    P.push(gable(-hx + 9, hz - 8, 6, 14, 10, 1.6, 0x6d6d6d, 0.3));
    P.push(sign(-hx + 9, hz - 2.9, 4, 10, 1, site.name.toUpperCase(), '#5d4037'));
    for (const [x, z, s] of [[8, hz - 8, 2.4], [14, hz - 6, 1.8], [-hx + 22, -6, 2.2], [hx - 8, 6, 2.6], [hx - 14, 10, 1.6]]) P.push(prop('rock', x, z, { sc: s, col: 1 }));
    P.push(prop('truck', 0, hz - 6, { col: 1, r: 0.4, c: 0xf9a825 }));
    P.push(prop('truck', hx - 8, -2, { col: 1, r: 2.6, c: 0xf9a825 }));
    perimeter(P, hx - 0.5, hz - 0.5, 1.6, 0x795548, 8, 'wood', { det: 1 });
    return { parts: P, points: {} };
  },

  granja(site) {
    const P = [];
    const { hx, hz } = site;
    P.push(decal(0, 0, hx * 2, hz * 2, 0x8b9b5a));
    // parcelas sembradas (surcos)
    for (let k = 0; k < 2; k++) {
      const px = -hx / 2 - 2 + k * (hx + 2), pz = -hz / 2 - 1;
      const pw = hx - 6, pd = hz - 4;
      P.push(decal(px, pz, pw, pd, k ? 0x9a7b4f : 0x7d6a42, { y: 0.01 }));
      for (let i = 0; i < Math.floor(pw / 2.4); i++) P.push(decal(px - pw / 2 + 1.2 + i * 2.4, pz, 0.9, pd - 1, k ? 0xc9b458 : 0x6e9b3e, { y: 0.02, det: 1 }));
    }
    // granero rojo y silos
    P.push(box(-hx / 2, hz / 2, 16, 12, 7, 0xa33b2a));
    P.push(gable(-hx / 2, hz / 2, 7, 16, 12, 4.2, 0x4e4e4e, 0.5));
    P.push(door(-hx / 2, hz / 2 + 6.05, 5, 5, 0xf5f5f5, 0, { cell: 'doorDouble' }));
    P.push(deco(-hx / 2, hz / 2 + 6.05, 5.4, 0.05, 0.3, 0xf5f5f5, { y: 5.2, det: 0 }));
    for (let i = 0; i < 2; i++) {
      P.push(cyl(-hx / 2 + 11 + i * 5, hz / 2 - 2, 0, 2.1, 2.1, 12, 12, 0xcfd8dc, { col: 1 }));
      P.push({ k: 'cone', x: -hx / 2 + 11 + i * 5, z: hz / 2 - 2, y: 12, r: 2.3, h: 1.6, seg: 12, c: 0x90a4ae });
    }
    // casa del granjero y corral
    P.push(box(hx / 2, hz / 2 + 2, 10, 7, 3.2, 0xf0e2c4));
    P.push(gable(hx / 2, hz / 2 + 2, 3.2, 10, 7, 1.6, 0x8d4b32, 0.6));
    P.push(door(hx / 2, hz / 2 + 5.55, 1.1, 2.2, 0x5d4037, 0, { cell: 'doorWood2' }));
    P.push(sign(hx / 2, hz / 2 + 5.6, 2.6, 6, 0.6, site.name, '#5d4037'));
    for (const [x0, z0, x1, z1] of [[2, 4, 14, 4], [14, 4, 14, 14], [2, 14, 14, 14]]) P.push(fence(x0, z0, x1, z1, 'wood', 1.2, 0x8d6e63, { det: 1 }));
    for (const [x, z] of [[-hx / 2 + 6, hz / 2 - 9], [-hx / 2 + 8, hz / 2 - 10], [4, 10]]) P.push(prop('hayBale', x, z, { col: 1 }));
    P.push(prop('tractor', -4, hz / 2 + 4, { col: 1, r: 0.6 }));
    perimeter(P, hx - 0.4, hz - 0.4, 1.2, 0x8d6e63, 7, 'wood', { det: 1 });
    treeRow(P, -hx + 2, hz - 2, hx - 2, hz - 2, 7, 'oak', 1.1);
    return { parts: P, points: {} };
  },

  club(site) {
    const P = [];
    const { hx, hz } = site;
    P.push(decal(0, 0, hx * 2, hz * 2, 0x5f9e45));
    // calles del campo de golf, greens y bunkers
    P.push(decal(-hx / 3, -hz / 3, hx * 1.1, 16, 0x79b85a, { y: 0.01, r: 0.3 }));
    P.push(decal(hx / 3, -hz / 2.5, hx * 0.9, 14, 0x79b85a, { y: 0.01, r: -0.4 }));
    for (const [x, z] of [[-hx + 12, -hz + 10], [hx - 12, -hz + 8], [6, -4]]) {
      P.push(cyl(x, z, 0, 5, 5, 0.08, 14, 0x8fd16a, { det: 0 }));
      P.push(cyl(x, z, 0, 0.05, 0.05, 2.4, 4, 0xffffff, { det: 1 }));
      P.push(deco(x + 0.4, z, 0.8, 0.04, 0.5, 0xd32f2f, { y: 1.9 }));
    }
    for (const [x, z] of [[-hx + 20, -hz + 14], [hx - 18, -hz + 14], [0, -10]]) P.push(cyl(x, z, 0, 2.8, 2.8, 0.06, 10, 0xe8d9a8, { det: 1 }));
    P.push(cyl(-8, -hz + 10, 0, 6, 6, 0.06, 14, 0x4fa3d1, { det: 0 }));
    // casa club
    P.push(box(0, hz - 12, 26, 12, 4.2, 0xf7f4ee, { gf: 'lobby', gfH: 3.6 }));
    P.push(slab(0, hz - 12, 4.2, 30, 15, 0.35, 0xe0dbd1));
    P.push(box(-7, hz - 13, 10, 8, 3.6, 0xf7f4ee, { y: 4.55 }));
    P.push(slab(-7, hz - 13, 8.15, 12, 9.5, 0.3, 0xe0dbd1));
    P.push(sign(0, hz - 5.9, 3.0, 12, 0.9, site.name.toUpperCase(), '#1b5e20'));
    P.push(door(0, hz - 5.95, 2.6, 2.6, 0x263238, 0, { cell: 'doorGlass' }));
    P.push({ k: 'pool', x: 16, z: hz - 12, w: 9, d: 6, c: 0x29b6f6 });
    for (let i = 0; i < 3; i++) P.push(prop('lounger', 13 + i * 2.6, hz - 7.6, { det: 1, r: Math.PI }));
    treeRow(P, -hx + 2, hz - 1.5, hx - 2, hz - 1.5, 9, 'palm', 1.2);
    for (const [x, z] of [[-hx + 4, -4], [hx - 5, 2], [-14, 6], [18, -2], [-hx + 6, -hz + 3], [hx - 6, -hz + 3]]) P.push(prop('pine', x, z, { col: 1, sc: 1.2 }));
    return { parts: P, points: { door: [0, hz + 2] } };
  },

  // ---------------- puerto, reciclaje ----------------
  puerto(site) {
    const P = [];
    const { hx, hz } = site;
    P.push(decal(0, 0, hx * 2, hz * 2, 0x6d7177));
    P.push(decal(hx - 1.2, 0, 0.4, hz * 2, 0xfdd835, { y: 0.01, det: 1 }));
    // grúas pórtico sobre el borde del muelle
    for (let i = 0; i < 3; i++) P.push(prop('crane', hx - 5, -hz + 18 + i * 36, { col: 1, r: -Math.PI / 2 }));
    // contenedores apilados
    const cc = [0xb03a2e, 0x1e6091, 0x2e7d32, 0xf9a825, 0x6d4c41, 0x546e7a];
    for (let row = 0; row < 3; row++) for (let i = 0; i < 9; i++) {
      if ((i * 7 + row * 3) % 5 === 0) continue;
      const x = -hx + 5 + row * 3.0, z = -hz + 10 + i * 7;
      P.push(prop('containers', x, z, { col: 1, c: cc[(i + row) % cc.length] }));
      if ((i + row) % 3 === 0) P.push(prop('containers', x, z, { y: 2.7, c: cc[(i + row + 2) % cc.length] }));
    }
    // bodega del puerto y caseta
    P.push(box(-hx + 9, hz - 12, 16, 18, 9, 0x90a4ae));
    P.push(gable(-hx + 9, hz - 12, 9, 16, 18, 1.4, 0x607d8b, 0.3));
    P.push(sign(-hx + 9, hz - 2.9, 7, 12, 1.1, 'PUERTO DE CARGA', '#0d47a1'));
    for (let i = 0; i < 8; i++) P.push(cyl(hx - 0.6, -hz + 4 + i * 15, 0, 0.3, 0.25, 0.7, 6, 0x37474f, { det: 1 }));
    P.push(prop('truck', 2, hz - 8, { col: 1, r: 0, c: 0x1565c0 }));
    P.push(prop('ship', hx + 16, 0, { y: -1.6, r: 0 }));
    return { parts: P, points: {} };
  },

  reciclaje(site) {
    const P = [];
    const { hx, hz } = site;
    P.push(decal(0, 0, hx * 2, hz * 2, 0x6f6a60));
    perimeter(P, hx - 0.5, hz - 0.5, 2.6, 0x8d8d8d, 8, 'wall');
    P.push(box(-hx / 2, -hz / 2, hx - 4, hz - 6, 7, 0x8a9a8f));
    P.push(gable(-hx / 2, -hz / 2, 7, hx - 4, hz - 6, 1.2, 0x5d6b62, 0.3));
    P.push(sign(0, hz - 0.3, 2.6, 12, 1.0, site.name.toUpperCase(), '#2e7d32'));
    const rust = [0x8d5b3a, 0x6d4c41, 0x7b8a8b, 0x9e7b5a, 0x5d6168];
    for (let i = 0; i < 14; i++) {
      const x = hx / 3 + ((i * 37) % 17) - 8, z = -hz / 2 + ((i * 53) % 23) - 10;
      P.push(box(x, z, 2 + (i % 3), 2 + ((i + 1) % 3), 1 + (i % 4) * 0.5, rust[i % rust.length], { r: i * 0.7, col: 1 }));
    }
    for (let i = 0; i < 3; i++) P.push(prop('containers', -hx + 6 + i * 6, hz - 6, { col: 1, r: Math.PI / 2, c: [0x2e7d32, 0x1565c0, 0xf9a825][i] }));
    P.push(prop('truck', hx / 2, hz - 7, { col: 1, r: 0, c: 0x2e7d32 }));
    return { parts: P, points: {} };
  },

  // ---------------- glorietas ----------------
  glorieta(site) {
    const P = [];
    const r = site.hx;
    P.push(cyl(0, 0, 0, r, r, 0.3, 24, 0xbdb6a6, { col: 0 }));                     // guarnición
    P.push(cyl(0, 0, 0.3, r - 0.5, r - 0.5, 0.05, 24, 0x6aa84f, { col: 0 }));       // pasto
    if (site.deco === 'monumento') {
      P.push(cyl(0, 0, 0.3, 5, 5, 1.0, 12, 0xd9d2c4, { col: 1 }));
      P.push(box(0, 0, 4.4, 4.4, 4, 0xe6dfd0, { y: 1.3 }));
      P.push(cyl(0, 0, 5.3, 1.0, 0.8, 16, 12, 0xeae3d4, { col: 1 }));
      P.push(cyl(0, 0, 21.3, 1.4, 1.4, 1.2, 12, 0xe6dfd0));
      P.push(cyl(0, 0, 22.5, 0.5, 0.25, 2.6, 8, 0xd4af37));                         // ángel dorado
      P.push(deco(0, 0, 3.2, 0.25, 1.0, 0xd4af37, { y: 24.0 }));
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; P.push(prop('palm', Math.sin(a) * (r - 4), Math.cos(a) * (r - 4), { col: 1, sc: 1.1 })); }
    } else if (site.deco === 'fuente') {
      P.push(cyl(0, 0, 0.3, 8, 8, 0.7, 16, 0xd8d0c0, { col: 1 }));
      P.push(cyl(0, 0, 0.95, 7.3, 7.3, 0.06, 16, 0x4fb3d9));
      P.push(prop('fountain', 0, 0, { y: 0.3, col: 1 }));
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; P.push(prop(i % 2 ? 'bush' : 'hedgeBall', Math.sin(a) * (r - 2.5), Math.cos(a) * (r - 2.5), { det: 1 })); }
    } else {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        P.push(cyl(Math.sin(a) * (r * 0.45), Math.cos(a) * (r * 0.45), 0.35, 2.4, 2.4, 0.08, 10, [0xd84f6b, 0xffd54f, 0xba68c8][i % 3], { det: 1 }));
      }
      P.push(prop('jacaranda', 0, 0, { col: 1, sc: 1.4 }));
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 + 0.3; P.push(prop('palm', Math.sin(a) * (r - 3.5), Math.cos(a) * (r - 3.5), { col: 1 })); }
    }
    return { parts: P, points: {} };
  },

  // ---------------- corazones de manzana ----------------
  patio(site, rng = new Rng(1)) {
    const P = [];
    const { hx, hz } = site;
    P.push(decal(0, 0, hx * 2, hz * 2, 0x6ea556));
    const n = Math.max(2, Math.round((hx * hz) / 60));
    for (let i = 0; i < n; i++) P.push(prop(rng.pick(['round', 'jacaranda', 'oak', 'palm', 'round']), rng.float(-hx + 2, hx - 2), rng.float(-hz + 2, hz - 2), { col: 1, sc: rng.float(0.85, 1.2) }));
    if (hx > 8 && rng.chance(0.5)) P.push({ k: 'pool', x: rng.float(-hx / 3, hx / 3), z: rng.float(-hz / 3, hz / 3), w: 6, d: 3.4, c: 0x29b6f6, det: 1 });
    if (rng.chance(0.6)) P.push(prop('grill', rng.float(-hx + 2, hx - 2), rng.float(-hz + 2, hz - 2), { det: 1 }));
    return { parts: P, points: {} };
  },
  patioPopular(site, rng = new Rng(2)) {
    const P = [];
    const { hx, hz } = site;
    P.push(decal(0, 0, hx * 2, hz * 2, 0x9c8f72));
    for (let i = 0; i < Math.max(2, Math.round((hx * hz) / 50)); i++) {
      const x = rng.float(-hx + 1.5, hx - 1.5), z = rng.float(-hz + 1.5, hz - 1.5);
      const k = rng.int(0, 4);
      if (k === 0) P.push(prop('laundry', x, z, { det: 1, r: rng.float(0, 3) }));
      else if (k === 1) P.push(prop('crates', x, z, { det: 1 }));
      else if (k === 2) P.push(decal(x, z, rng.float(3, 6), rng.float(3, 6), 0x7f9a5a, { y: 0.01, det: 1 }));
      else P.push(prop(rng.pick(['round', 'palm', 'bush']), x, z, { col: 1 }));
    }
    return { parts: P, points: {} };
  },
  canchita(site) {
    const P = [];
    const { hx, hz } = site;
    P.push(decal(0, 0, hx * 2, hz * 2, 0xa79476));
    const w = Math.min(hx * 2 - 3, 26), d = Math.min(hz * 2 - 3, 15);
    P.push(decal(0, 0, w, d, 0x3f7fbf, { y: 0.01 }));
    P.push(decal(0, 0, 0.15, d - 1, 0xffffff, { y: 0.02 }));
    P.push(prop('hoop', -w / 2 + 0.8, 0, { r: Math.PI / 2 }));
    P.push(prop('hoop', w / 2 - 0.8, 0, { r: -Math.PI / 2 }));
    P.push(fence(-hx + 0.5, -hz + 0.5, hx - 0.5, -hz + 0.5, 'rail', 2.6, 0x7d8a8f, { det: 1 }));
    P.push(prop('round', -hx + 2, hz - 2, { col: 1 }));
    return { parts: P, points: {} };
  },
  parqueBarrio(site, rng = new Rng(3)) {
    // parque de barrio que se adapta al tamaño disponible
    const P = [];
    const { hx, hz } = site;
    P.push(decal(0, 0, hx * 2, hz * 2, 0x67a64d));
    P.push(decal(0, 0, hx * 2, 2.4, 0xd8cba8, { y: 0.01 }));
    P.push(decal(0, 0, 2.4, hz * 2, 0xd8cba8, { y: 0.01 }));
    P.push(prop('fountainSmall', 0, 0, { col: 1 }));
    if (hx > 12 && hz > 9) {
      P.push(decal(-hx / 2, -hz / 2, Math.min(12, hx - 3), Math.min(9, hz - 3), 0xd7b98e, { y: 0.01 }));
      P.push(prop('swing', -hx / 2 - 2, -hz / 2, { col: 1 }));
      P.push(prop('slide', -hx / 2 + 3, -hz / 2, { col: 1 }));
    }
    const n = Math.max(4, Math.round((hx * hz) / 45));
    for (let i = 0; i < n; i++) {
      const x = rng.float(-hx + 2, hx - 2), z = rng.float(-hz + 2, hz - 2);
      if (Math.abs(x) < 3 || Math.abs(z) < 3) continue;
      P.push(prop(rng.pick(['jacaranda', 'round', 'oak', 'round']), x, z, { col: 1, sc: rng.float(0.9, 1.25) }));
    }
    for (const [x, z, r] of [[4, 2, Math.PI], [-4, -2, 0]]) P.push(prop('bench', x, z, { r, det: 1 }));
    P.push(prop('lampColonial', 3, 3)); P.push(prop('lampColonial', -3, -3));
    return { parts: P, points: {} };
  },
  estacionamiento(site, rng = new Rng(4)) {
    const P = [];
    const { hx, hz } = site;
    parking(P, 0, 0, hx * 2, hz * 2, 0);
    for (const s of [-1, 1]) P.push(prop('lamp', s * (hx - 1), 0));
    return { parts: P, points: {} };
  },
  patioIndustrial(site, rng = new Rng(5)) {
    const P = [];
    const { hx, hz } = site;
    P.push(decal(0, 0, hx * 2, hz * 2, 0x5c6166));
    const cc = [0xb03a2e, 0x1e6091, 0x2e7d32, 0xf9a825, 0x546e7a];
    for (let i = 0; i < Math.max(1, Math.floor(hx / 5)); i++) if (rng.chance(0.7)) P.push(prop('containers', -hx + 3 + i * 5, -hz + 4, { col: 1, c: rng.pick(cc) }));
    if (hz > 8) P.push(prop('truck', rng.float(-hx / 2, hx / 2), hz / 3, { col: 1, r: Math.PI / 2 }));
    return { parts: P, points: {} };
  },
  huerta(site, rng = new Rng(6)) {
    const P = [];
    const { hx, hz } = site;
    P.push(decal(0, 0, hx * 2, hz * 2, 0x7d6a42));
    for (let i = 0; i < Math.floor((hx * 2) / 2.4); i++) P.push(decal(-hx + 1.2 + i * 2.4, 0, 0.9, hz * 2 - 1.5, rng.chance(0.5) ? 0x6e9b3e : 0xc9b458, { y: 0.01, det: 1 }));
    P.push(fence(-hx, -hz, hx, -hz, 'wood', 1.1, 0x8d6e63, { det: 1 }));
    P.push(fence(-hx, hz, hx, hz, 'wood', 1.1, 0x8d6e63, { det: 1 }));
    return { parts: P, points: {} };
  },
};
