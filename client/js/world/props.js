// Biblioteca de objetos low-poly (se calculan una vez y se "estampan" en la geometría de cada zona).
// Todos miran hacia +Z y su base está en y=0. Varios tienen VARIANTES (v = 0..2) para que no se repitan.

import { makeProto, shade, mixHex, glow } from './geometry.js';
import { carModel } from './carModels.js';

const cache = new Map();

// ---------- ayudantes ----------
// Caja deformada: 4 esquinas de abajo (-x-z, +x-z, +x+z, -x+z) y 4 de arriba en el mismo orden
const hx = (b, v, c) => b.hexa([v[0], v[1], v[5], v[4], v[3], v[2], v[6], v[7]], c);
const TRUNK = 0x6e5038, TRUNK_D = 0x5a412d;
const LEAF = [0x4f8f3a, 0x5a9a3f, 0x47853a];

function trunkWithBranches(b, h, r, v, col = TRUNK) {
  const lean = [0.12, -0.1, 0.05][v % 3];
  b.tube([[0, 0, 0], [lean * 0.4, h * 0.55, 0], [lean, h, 0.05]], [r * 1.25, r, r * 0.75], 6, [col, shade(col, 0.92)]);
  // dos ramas que entran a la copa
  b.tube([[lean * 0.5, h * 0.7, 0], [lean + 0.9, h + 0.7, 0.3]], [r * 0.5, r * 0.3], 4, col);
  b.tube([[lean * 0.5, h * 0.75, 0], [lean - 0.7, h + 0.8, -0.5]], [r * 0.45, r * 0.28], 4, col);
}

// Palmera: tronco curvo anillado, corona con cocos y hojas arqueadas (dos caras)
function palm(b, v = 0, far = false, fb = null) {
  const H = [7.6, 8.4, 6.9][v % 3], bend = [1.1, 0.6, 1.5][v % 3];
  const N = far ? 3 : 5;
  const pts = [], rad = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    pts.push([bend * Math.pow(t, 1.7), H * t, 0]);
    rad.push(i === 0 ? 0.36 : 0.27 - t * 0.09);
  }
  b.tube(pts, rad, far ? 4 : 6, [0x8a6d4e, 0x75593e]);
  const top = pts[N];
  if (!far) {
    b.cylinder(top[0], top[1] - 0.45, 0, 0.3, 0.42, 0.6, 6, 0x6b7f3a);
    for (let k = 0; k < 3; k++) { const a = k * 2.1 + v; b.boxR(top[0] + Math.sin(a) * 0.28, top[1] - 0.35, Math.cos(a) * 0.28, 0.26, 0.28, 0.26, a, 0x7a5a2a); }
  }
  const nF = far ? 6 : 9;
  for (let k = 0; k < nF; k++) {
    const a = (k / nF) * Math.PI * 2 + v * 0.4 + (k % 2) * 0.15;
    const dx = Math.sin(a), dz = Math.cos(a);
    const L = (far ? 3.6 : 3.4 + ((k * 7 + v) % 5) * 0.18);
    const rise = k % 3 === 0 ? 1.4 : 0.9, droop = k % 3 === 0 ? 2.6 : 3.4;
    const segs = far ? 2 : 3;
    const sp = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      sp.push([top[0] + dx * L * t, top[1] + rise * t - droop * t * t, dz * L * t]);
    }
    const px = -dz, pz = dx; // perpendicular horizontal
    const base = LEAF[k % 3], tip = shade(base, 1.22);
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs, t1 = (i + 1) / segs;
      const w0 = 0.62 * Math.sin(Math.PI * Math.max(0.12, t0)) ** 0.7 * (1 - 0.35 * t0), w1 = 0.62 * Math.sin(Math.PI * Math.min(0.96, t1)) ** 0.7 * (1 - 0.35 * t1);
      const s0 = sp[i], s1 = sp[i + 1];
      const c0 = mixHex(shade(base, 0.85), tip, t0), c1 = mixHex(shade(base, 0.85), tip, t1);
      for (const side of [1, -1]) {
        // hoja en "V": el borde cae un poco respecto a la nervadura
        const e0 = [s0[0] + px * w0 * side, s0[1] - w0 * 0.35, s0[2] + pz * w0 * side];
        const e1 = [s1[0] + px * w1 * side, s1[1] - w1 * 0.35, s1[2] + pz * w1 * side];
        (fb || b).quadC(s0, s1, e1, e0, [0, 1, 0], [c0, c1, c1, c0]);
        if (!fb) b.quadC(s0, s1, e1, e0, [0, -1, 0], [shade(c0, 0.8), shade(c1, 0.8), shade(c1, 0.8), shade(c0, 0.8)]);
      }
    }
  }
}

// Árbol de copa redonda (árbol urbano / de colina)
function roundTree(b, v = 0, far = false, palette = LEAF, opts = {}) {
  const h = opts.h ?? [2.6, 2.3, 2.9][v % 3];
  const R = opts.r ?? [2.1, 2.5, 1.9][v % 3];
  if (far) {
    b.boxR(0, h / 2, 0, 0.32, h, 0.32, 0, TRUNK);
    b.blob(0, h + R * 0.8, 0, R * 1.05, R * 0.95, R * 1.05, palette[v % palette.length], v + 1, { jitter: 0.12 });
    return;
  }
  trunkWithBranches(b, h, 0.17, v);
  // copa llena: una masa central grande y varias alrededor muy traslapadas (sin huecos)
  const blobs = [
    [[0, 1.0, 0, 1.15], [0.75, 0.75, 0.45, 0.85], [-0.7, 0.7, -0.35, 0.85], [0.1, 1.55, -0.25, 0.75], [-0.3, 0.85, 0.7, 0.75], [0.45, 0.7, -0.7, 0.7]],
    [[0, 0.95, 0, 1.2], [0.85, 0.7, -0.15, 0.82], [-0.8, 0.75, 0.25, 0.85], [0, 1.5, 0.15, 0.78], [0.15, 0.65, 0.85, 0.7]],
    [[0, 1.1, 0, 1.1], [0.7, 0.85, 0.55, 0.78], [-0.65, 0.95, -0.45, 0.8], [-0.15, 1.7, 0.05, 0.7], [0.55, 0.75, -0.65, 0.72], [-0.6, 0.65, 0.65, 0.7]],
  ][v % 3];
  blobs.forEach(([x, y, z, s], i) => {
    const col = palette[(i + v) % palette.length];
    b.blob(x * R * 0.8, h - 0.2 + y * R * 0.9, z * R * 0.8, R * s, R * s * 0.82, R * s, col, i * 7 + v * 13 + 1);
  });
}

function pineTree(b, v = 0, far = false) {
  const H = [7.5, 8.8, 6.6][v % 3];
  b.tube([[0, 0, 0], [0, H * 0.35, 0]], [0.26, 0.2], far ? 4 : 5, TRUNK_D);
  const layers = far ? 2 : 5;
  for (let i = 0; i < layers; i++) {
    const t = i / layers;
    const y = H * 0.18 + t * H * 0.66, r = 2.1 * (1 - t * 0.75), hh = H * (far ? 0.5 : 0.3);
    const col = mixHex(0x2f5f35, 0x4a8a4a, t);
    b.cylinder(0, y, 0, r, 0, hh, far ? 5 : 7, col);
    if (!far) b.cylinder(0, y, 0, r * 0.98, r * 0.6, 0.25, 7, shade(col, 0.7), { cap: false });
  }
}

const B = {
  // ---------- árboles y plantas ----------
  round: (b, c, v, far) => roundTree(b, v, far),
  oak: (b, c, v, far) => roundTree(b, v, far, [0x557f34, 0x4d7a30, 0x62893c], { h: 2.4, r: 2.8 }),
  laurel: (b) => { // laurel de plaza recortado (típico de plazas mexicanas)
    b.tube([[0, 0, 0], [0, 2.1, 0]], [0.2, 0.16], 6, TRUNK);
    b.blob(0, 3.1, 0, 1.6, 1.15, 1.6, 0x3e7a3a, 3, { jitter: 0.06, flatBottom: 0.5 });
  },
  pine: (b, c, v, far) => pineTree(b, v, far),
  jacaranda: (b, c, v, far) => roundTree(b, v, far, [0x9a82c9, 0x8b72bd, 0x5f8f3e, 0xa58fd2], { h: 2.8, r: 2.3 }),
  willow: (b, c, v, far) => {
    b.tube([[0, 0, 0], [0.2, 2.6, 0]], [0.28, 0.2], 6, TRUNK);
    for (let k = 0; k < (far ? 3 : 7); k++) {
      const a = (k / 7) * Math.PI * 2;
      b.blob(Math.sin(a) * 1.5, 2.6, Math.cos(a) * 1.5, 1.1, 2.0, 1.1, k % 2 ? 0x8bbf4f : 0x7fb048, k + v, { flatBottom: 1 });
    }
    b.blob(0.2, 3.9, 0, 1.8, 1.0, 1.8, 0x93c656, v + 9);
  },
  palm: (b, c, v, far, fb) => palm(b, v, far, fb),
  bush: (b, c, v) => {
    b.blob(0, 0.55, 0, 0.85, 0.6, 0.8, 0x4f8a3c, v + 2, { flatBottom: 0.2 });
    b.blob(0.45, 0.45, 0.3, 0.55, 0.45, 0.5, 0x5b9947, v + 5, { flatBottom: 0.2 });
  },
  hedgeBall: (b) => b.blob(0, 0.6, 0, 0.6, 0.62, 0.6, 0x3f7a35, 4, { jitter: 0.05, flatBottom: 0.3 }),
  bougainvillea: (b) => {
    b.blob(0, 0.8, 0, 0.9, 0.85, 0.8, 0x4e8a3e, 3, { flatBottom: 0.3 });
    b.blob(0.3, 1.1, 0.35, 0.65, 0.5, 0.55, 0xd81b60, 5);
    b.blob(-0.4, 1.3, -0.1, 0.5, 0.4, 0.5, 0xec407a, 8);
  },
  bamboo: (b) => { for (let i = 0; i < 5; i++) b.tube([[Math.sin(i * 1.7) * 0.25, 0, Math.cos(i * 1.7) * 0.25], [Math.sin(i * 1.7) * 0.4, 2.4 + i * 0.15, Math.cos(i * 1.7) * 0.4]], [0.05, 0.04], 4, 0x7cb342); },
  planter: (b) => {
    b.boxR(0, 0.3, 0, 1.0, 0.6, 1.0, 0, 0x9e9a92, { top: 0x6d4c3d });
    b.blob(0, 0.95, 0, 0.55, 0.45, 0.55, 0x4e8a3e, 6, { flatBottom: 0.4 });
  },
  rock: (b, c, v) => {
    b.blob(0, 0.35, 0, 1.2, 0.85, 1.0, 0x8c8a80, v + 11, { jitter: 0.25, top: 0x9f9d92, bottom: 0x6a685f, flatBottom: 0.4 });
  },
  // ---------- iluminación ----------
  lamp: (b) => { // farol moderno: poste cónico y brazo curvo con cabeza LED
    b.cylinder(0, 0, 0, 0.16, 0.16, 0.5, 8, 0x5b6167);
    b.tube([[0, 0.5, 0], [0, 7.4, 0]], [0.1, 0.07], 6, 0x6b7279);
    b.tube([[0, 7.2, 0], [0, 7.75, 0.35], [0, 7.85, 1.0], [0, 7.8, 1.6]], [0.06, 0.055, 0.05, 0.05], 5, 0x6b7279);
    b.boxR(0, 7.72, 1.75, 0.34, 0.12, 0.7, 0, 0x4f555b);
    b.boxR(0, 7.65, 1.75, 0.26, 0.02, 0.56, 0, glow(0xfff6d8), { bottom: true });
  },
  lampDouble: (b) => {
    b.cylinder(0, 0, 0, 0.2, 0.2, 0.6, 8, 0x4b5157);
    b.tube([[0, 0.6, 0], [0, 8.6, 0]], [0.13, 0.09], 6, 0x5d646b);
    for (const s of [-1, 1]) {
      b.tube([[0, 8.3, 0], [0, 8.85, s * 0.4], [0, 8.95, s * 1.2], [0, 8.9, s * 1.8]], [0.06, 0.06, 0.055, 0.05], 5, 0x5d646b);
      b.boxR(0, 8.82, s * 1.95, 0.36, 0.13, 0.75, 0, 0x4a5056);
      b.boxR(0, 8.75, s * 1.95, 0.28, 0.02, 0.6, 0, glow(0xfff6d8), { bottom: true });
    }
  },
  lampColonial: (b) => {
    b.cylinder(0, 0, 0, 0.24, 0.18, 0.7, 8, 0x1e1e1e);
    b.tube([[0, 0.7, 0], [0, 3.2, 0]], [0.07, 0.06], 6, 0x1e1e1e);
    b.cylinder(0, 3.2, 0, 0.12, 0.22, 0.12, 6, 0x1e1e1e);
    b.cylinder(0, 3.32, 0, 0.2, 0.28, 0.55, 6, glow(0xfff1b8, 2.2), { top: 0x1e1e1e });
    b.cylinder(0, 3.87, 0, 0.36, 0.06, 0.32, 6, 0x1e1e1e);
  },
  lampWood: (b) => {
    b.tube([[0, 0, 0], [0, 7.2, 0]], [0.15, 0.12], 6, 0x6d5135);
    b.boxR(0, 6.6, 0, 1.6, 0.1, 0.1, 0, 0x5d4430);
    b.tube([[0, 6.4, 0], [0, 6.75, 0.6], [0, 6.7, 1.2]], [0.04, 0.04, 0.04], 4, 0x555555);
    b.boxR(0, 6.62, 1.3, 0.3, 0.14, 0.42, 0, 0x505050);
    b.boxR(0, 6.54, 1.3, 0.22, 0.02, 0.32, 0, glow(0xfff2c4), { bottom: true });
  },
  lampgarden: (b) => { b.boxR(0, 0.35, 0, 0.16, 0.7, 0.16, 0, 0x37474f); b.boxR(0, 0.75, 0, 0.22, 0.12, 0.22, 0, glow(0xfff59d, 2)); },
  floodlight: (b) => { b.tube([[0, 0, 0], [0, 12, 0]], [0.18, 0.12], 6, 0x9e9e9e); b.boxR(0, 12, 0.3, 2.2, 1.0, 0.4, 0, 0xeceff1); b.boxR(0, 12, 0.51, 2.0, 0.8, 0.02, 0, glow(0xffffff, 2.2)); },
  // Semáforo: poste en la esquina y brazo sobre la calle (+Z); las luces miran a +X (al tráfico)
  trafficLight: (b) => {
    b.cylinder(0, 0, 0, 0.18, 0.18, 0.4, 8, 0x3d4146);
    b.tube([[0, 0.4, 0], [0, 6.2, 0]], [0.11, 0.09], 6, 0x52575c);
    b.tube([[0, 5.9, 0], [0, 6.05, 2.5], [0, 6.1, 5.2]], [0.07, 0.06, 0.05], 5, 0x52575c);
    for (const z of [2.6, 5.0]) {
      b.boxR(0, 5.4, z, 0.36, 1.05, 0.36, 0, 0x202326);
      b.boxR(0.19, 5.4, z, 0.02, 1.2, 0.5, 0, 0x2b2f33);
      b.boxR(0.2, 5.75, z, 0.04, 0.22, 0.22, 0, glow(0xff3b30, 2));
      b.boxR(0.2, 5.42, z, 0.04, 0.22, 0.22, 0, 0x5a4a14);
      b.boxR(0.2, 5.09, z, 0.04, 0.22, 0.22, 0, 0x1d4a26);
    }
    // semáforo peatonal en el poste
    b.boxR(0.15, 2.8, 0, 0.26, 0.6, 0.3, 0, 0x202326);
    b.boxR(0.29, 2.95, 0, 0.02, 0.18, 0.18, 0, glow(0xff6d3a, 2));
    b.boxR(0.29, 2.65, 0, 0.02, 0.18, 0.18, 0, 0x1b3d22);
    // señal con nombre (placa verde)
    b.boxR(0.0, 6.55, 3.6, 0.05, 0.4, 1.6, 0, 0x1b6e3a);
  },
  // Señal de ALTO: placa octagonal roja mirando a +Z (al tráfico que llega)
  stopSign: (b) => {
    b.tube([[0, 0, 0], [0, 2.05, 0]], [0.04, 0.04], 5, 0x9ea4a8);
    // placa octagonal: cara roja hacia +Z (al tráfico que llega) y reverso gris
    const oct = (r, z, hex, nz) => {
      const P = [];
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; P.push([Math.cos(a) * r, 2.05 + Math.sin(a) * r, z]); }
      const c = [0, 2.05, z];
      for (let i = 0; i < 8; i++) { const p = P[i], q = P[(i + 1) % 8]; if (nz > 0) b.tri(c, p, q, [0, 0, 1], hex); else b.tri(c, q, p, [0, 0, -1], hex); }
    };
    oct(0.44, 0.02, 0xf5f5f5, 1);
    oct(0.39, 0.03, 0xc62828, 1);
    oct(0.44, -0.01, 0x9ea4a8, -1);
    b.boxR(0, 2.05, 0.04, 0.5, 0.11, 0.01, 0, 0xffffff);
  },
  hydrant: (b) => {
    b.cylinder(0, 0, 0, 0.17, 0.15, 0.55, 8, 0xd32f2f, { top: 0xb71c1c });
    b.cylinder(0, 0.55, 0, 0.12, 0.05, 0.16, 8, 0xfdd835);
    b.tube([[-0.24, 0.38, 0], [0.24, 0.38, 0]], [0.06, 0.06], 6, 0xfdd835);
  },
  // ---------- mobiliario ----------
  bench: (b) => {
    for (let i = 0; i < 3; i++) b.boxR(0, 0.46, -0.16 + i * 0.16, 1.7, 0.05, 0.13, 0, 0x9a6a44);
    for (let i = 0; i < 2; i++) b.boxR(0, 0.68 + i * 0.16, -0.27, 1.7, 0.12, 0.04, 0, 0x9a6a44);
    for (const s of [-0.7, 0.7]) { b.boxR(s, 0.22, 0, 0.06, 0.44, 0.48, 0, 0x2f3234); b.boxR(s, 0.6, -0.27, 0.06, 0.5, 0.06, 0, 0x2f3234); }
  },
  bin: (b) => { b.cylinder(0, 0, 0, 0.28, 0.3, 0.9, 8, 0x2e7d32, { top: 0x1b4d1f }); b.cylinder(0, 0.9, 0, 0.31, 0.31, 0.06, 8, 0x37474f); },
  busstop: (b) => {
    b.boxR(0, 2.55, -0.1, 3.6, 0.1, 1.7, 0, 0x2f3a42, { bottom: true });
    b.boxR(0, 1.35, -0.75, 3.4, 2.2, 0.04, 0, 0xa9d3e6);
    for (const x of [-1.75, 1.75]) b.boxR(x, 1.27, -0.75, 0.08, 2.55, 0.08, 0, 0x4a555c);
    b.boxR(1.75, 1.35, -0.2, 0.04, 2.2, 1.1, 0, 0xa9d3e6);
    b.boxR(0, 0.47, -0.5, 2.8, 0.06, 0.38, 0, 0x8a949a);
    // anuncio iluminado
    b.boxR(-1.25, 1.4, -0.72, 1.0, 1.7, 0.1, 0, 0x2f3a42);
    b.boxR(-1.25, 1.4, -0.66, 0.85, 1.5, 0.02, 0, 0xf6e7b7);
    b.boxR(2.1, 2.3, 0, 0.06, 0.5, 0.5, 0, 0x1565c0);
  },
  mailbox: (b) => { b.boxR(0, 0.5, 0, 0.08, 1.0, 0.08, 0, 0x5d4037); b.boxR(0, 1.08, 0, 0.26, 0.28, 0.46, 0, 0x37474f); },
  grill: (b) => { b.boxR(0, 0.85, 0, 0.7, 0.3, 0.45, 0, 0x212121); for (const s of [-1, 1]) b.boxR(s * 0.3, 0.35, 0, 0.05, 0.7, 0.4, 0, 0x424242); },
  crates: (b) => { b.boxR(-0.3, 0.25, 0, 0.5, 0.5, 0.5, 0.2, 0xa1887f); b.boxR(0.35, 0.25, 0.1, 0.5, 0.5, 0.5, -0.1, 0xffb74d); b.boxR(0, 0.75, 0, 0.5, 0.5, 0.5, 0.4, 0x8bc34a); },
  cooler: (b) => { b.boxR(0, 0.7, 0, 0.8, 1.4, 0.6, 0, 0xd32f2f, { top: 0xeeeeee }); b.boxR(0, 0.85, 0.31, 0.65, 0.9, 0.02, 0, 0x90caf9); },
  laundry: (b) => {
    for (const s of [-1, 1]) b.boxR(s * 1.6, 0.9, 0, 0.06, 1.8, 0.06, 0, 0x795548);
    b.boxR(0, 1.75, 0, 3.2, 0.02, 0.02, 0, 0x9e9e9e);
    const cols = [0xe53935, 0xfdd835, 0x1e88e5, 0xffffff, 0x8e24aa];
    for (let i = 0; i < 5; i++) b.boxR(-1.2 + i * 0.6, 1.45, 0, 0.45, 0.6, 0.02, 0, cols[i]);
  },
  table: (b, c = 0xf5f5f5) => {
    b.cylinder(0, 0.72, 0, 0.45, 0.45, 0.05, 8, c);
    b.boxR(0, 0.36, 0, 0.06, 0.72, 0.06, 0, 0x555555);
    for (const s of [-1, 1]) { b.boxR(s * 0.75, 0.25, 0, 0.4, 0.45, 0.4, 0, c); b.boxR(s * 0.92, 0.65, 0, 0.06, 0.4, 0.4, 0, c); }
  },
  tableUmbrella: (b, c = 0xc62828) => {
    B.table(b, 0xf5f5f5);
    b.boxR(0, 1.4, 0, 0.05, 1.5, 0.05, 0, 0xdddddd);
    b.cylinder(0, 2.05, 0, 1.3, 0, 0.45, 8, c);
  },
  umbrellaBeach: (b, c = 0xe53935) => {
    b.boxR(0, 1.1, 0, 0.05, 2.2, 0.05, 0.3, 0xdddddd);
    b.cylinder(0, 1.95, 0, 1.4, 0, 0.45, 8, c);
    b.cylinder(0, 1.9, 0, 1.4, 1.4, 0.05, 8, shade(c, 0.85), { cap: false });
  },
  towel: (b, c = 0x26c6da) => { b.boxR(0, 0.02, 0, 0.9, 0.03, 1.8, 0, c); },
  lounger: (b) => { b.boxR(0, 0.3, 0.3, 0.7, 0.08, 1.4, 0, 0xffffff); b.bar([0, 0.3, -0.4], [0, 0.8, -0.8], 0.08, 0xffffff); },
  hoop: (b) => { b.boxR(0, 1.6, -0.6, 0.12, 3.2, 0.12, 0, 0x546e7a); b.boxR(0, 3.05, -0.35, 1.6, 1.0, 0.06, 0, 0xffffff); b.cylinder(0, 2.75, -0.05, 0.23, 0.23, 0.04, 8, 0xff5722, { cap: false }); },
  telescope: (b) => { b.boxR(0, 0.6, 0, 0.12, 1.2, 0.12, 0, 0x37474f); b.bar([0, 1.25, -0.3], [0, 1.45, 0.4], 0.16, 0x546e7a); },
  swing: (b) => {
    for (const s of [-1, 1]) { b.bar([s * 1.5, 0, -0.7], [s * 1.5, 2.3, 0], 0.1, 0xe53935); b.bar([s * 1.5, 0, 0.7], [s * 1.5, 2.3, 0], 0.1, 0xe53935); }
    b.boxR(0, 2.3, 0, 3.1, 0.1, 0.1, 0, 0xe53935);
    for (const s of [-0.6, 0.6]) { b.boxR(s, 1.45, 0, 0.03, 1.7, 0.03, 0, 0x555555); b.boxR(s, 0.6, 0, 0.5, 0.06, 0.25, 0, 0xfdd835); }
  },
  slide: (b) => {
    b.boxR(0, 1.0, -0.8, 0.8, 2.0, 0.1, 0, 0x1e88e5);
    b.boxR(0, 1.95, -0.5, 0.9, 0.1, 0.8, 0, 0x1e88e5);
    b.bar([0, 1.9, -0.1], [0, 0.15, 1.6], 0.12, 0xfdd835);
    b.boxR(0, 1.0, 1.6, 0.7, 0.05, 0.3, 0, 0xfdd835);
  },
  carts: (b) => { for (let i = 0; i < 4; i++) b.boxR(i * 0.3 - 0.45, 0.55, 0, 0.55, 0.5, 0.9, 0, 0x9e9e9e); },
  // ---------- vehículos ----------
  car: (b, c = 0xc0392b, v = 0) => carModel(b, ['sedan', 'compact', 'suv'][v % 3], c),
  carCompact: (b, c = 0xc0392b) => carModel(b, 'compact', c),
  carSedan: (b, c = 0x2c3e50) => carModel(b, 'sedan', c),
  carSUV: (b, c = 0x7f8c8d) => carModel(b, 'suv', c),
  carPickup: (b, c = 0xecf0f1) => carModel(b, 'pickup', c),
  carSport: (b, c = 0xd32f2f) => carModel(b, 'sport', c),
  carLux: (b, c = 0x1b1b1b) => carModel(b, 'lux', c),
  policecar: (b) => {
    carModel(b, 'sedan', 0xf5f5f5);
    for (const s of [-1, 1]) b.boxR(s * 0.915, 0.62, 0.05, 0.02, 0.5, 1.9, 0, 0x16326b);     // puertas azules
    b.boxR(0, 1.47, -0.3, 1.2, 0.08, 0.3, 0, 0x2b2b2b);
    b.boxR(-0.3, 1.56, -0.3, 0.55, 0.12, 0.26, 0, glow(0xd32f2f, 1.8));
    b.boxR(0.3, 1.56, -0.3, 0.55, 0.12, 0.26, 0, glow(0x1e88e5, 1.8));
  },
  ambulance: (b) => {
    b.boxR(0, 1.45, -0.4, 2.1, 2.3, 4.0, 0, 0xfafafa);
    hx(b, [[-1.0, 0.45, 1.6], [1.0, 0.45, 1.6], [1.0, 0.45, 2.85], [-1.0, 0.45, 2.85], [-1.0, 2.0, 1.6], [1.0, 2.0, 1.6], [0.95, 1.5, 2.6], [-0.95, 1.5, 2.6]], 0xfafafa);
    b.boxR(0, 1.65, 2.42, 1.7, 0.5, 0.02, 0.0, 0x26323b);
    b.boxR(0, 1.25, -0.4, 2.12, 0.35, 4.02, 0, 0xd32f2f);
    b.boxR(0, 2.65, 1.2, 1.0, 0.14, 0.3, 0, 0xd32f2f);
    wheels(b, 0.95, [-1.6, 1.9], 0.36);
  },
  van: (b, c = 0xe07a2c) => {
    b.boxR(0, 1.3, -0.3, 2.0, 2.0, 3.6, 0, c);
    hx(b, [[-0.98, 0.45, 1.5], [0.98, 0.45, 1.5], [0.98, 0.45, 2.7], [-0.98, 0.45, 2.7], [-0.98, 2.3, 1.5], [0.98, 2.3, 1.5], [0.95, 1.5, 2.55], [-0.95, 1.5, 2.55]], c);
    b.boxR(0, 1.85, 2.05, 1.7, 0.6, 0.02, 0.5, 0x26323b);
    wheels(b, 0.9, [-1.5, 1.8], 0.36);
  },
  truck: (b, c = 0x1565c0) => {
    b.boxR(0, 1.55, 2.6, 2.4, 2.5, 2.2, 0, c);
    b.boxR(0, 2.05, 3.71, 2.1, 0.8, 0.02, 0, 0x26323b);
    b.boxR(0, 1.95, -1.0, 2.5, 3.0, 5.2, 0, 0xeceff1);
    b.boxR(0, 0.55, 0.5, 2.0, 0.3, 8.2, 0, 0x2b2b2b);
    wheels(b, 1.05, [-2.6, -1.4, 2.7], 0.45);
  },
  bus: (b, c = 0x00897b) => {
    b.boxR(0, 1.75, 0, 2.5, 2.7, 11, 0, 0xf2f2f2);
    b.boxR(0, 1.0, 0, 2.52, 0.55, 11.02, 0, c);
    b.boxR(0, 2.25, 0, 2.54, 0.85, 10.2, 0, 0x26323b);
    b.boxR(0, 2.15, 5.51, 2.2, 1.3, 0.02, 0, 0x26323b);
    b.boxR(0, 3.15, 0, 2.3, 0.12, 10.6, 0, c);
    wheels(b, 1.15, [-3.6, 3.4], 0.5);
  },
  firetruck: (b) => {
    b.boxR(0, 1.7, -0.6, 2.5, 2.4, 6.0, 0, 0xc62828);
    b.boxR(0, 1.55, 3.1, 2.4, 2.1, 1.8, 0, 0xc62828);
    b.boxR(0, 2.05, 4.01, 2.1, 0.8, 0.02, 0, 0x26323b);
    b.boxR(0, 1.1, -0.6, 2.52, 0.18, 6.02, 0, 0xf5f5f5);
    b.boxR(0, 3.05, -0.8, 0.9, 0.12, 6.4, 0, 0xb0bec5);
    b.boxR(0, 2.75, 3.1, 1.0, 0.14, 0.3, 0, 0x1e88e5);
    wheels(b, 1.1, [-2.6, -1.4, 2.9], 0.5);
  },
  tractor: (b) => {
    b.boxR(0, 1.0, 0.6, 1.0, 0.8, 2.0, 0, 0x2e7d32);
    b.boxR(0, 1.8, -0.5, 1.1, 1.2, 1.1, 0, 0x2e7d32);
    b.boxR(0, 1.9, -0.5, 1.12, 0.7, 1.12, 0, 0x26323b);
    b.boxR(0, 2.45, -0.5, 1.3, 0.08, 1.3, 0, 0xfdd835);
    b.tube([[0.3, 1.4, 1.2], [0.3, 2.4, 1.2]], [0.06, 0.06], 5, 0x37474f);
    wheels(b, 0.85, [-0.6], 0.75);
    wheels(b, 0.7, [1.3], 0.42);
  },
  hayBale: (b) => {
    b.tube([[-0.6, 0.6, 0], [0.6, 0.6, 0]], [0.6, 0.6], 10, 0xd4b35a);
    b.boxR(0, 0.6, 0, 1.22, 0.06, 1.22, 0, 0xc49f45);
  },
  truckArmy: (b) => {
    b.boxR(0, 1.5, 2.6, 2.4, 2.2, 2.0, 0, 0x5d6b3f);
    b.boxR(0, 1.9, -1.0, 2.5, 2.6, 5.2, 0, 0x6b7a48);
    wheels(b, 1.05, [-2.6, -1.4, 2.7], 0.5);
  },
  tank: (b) => {
    b.boxR(0, 0.85, 0, 3.0, 1.0, 4.6, 0, 0x5d6b3f);
    b.boxR(-1.55, 0.5, 0, 0.6, 1.0, 4.8, 0, 0x2d2d2d);
    b.boxR(1.55, 0.5, 0, 0.6, 1.0, 4.8, 0, 0x2d2d2d);
    b.boxR(0, 1.7, -0.3, 2.0, 0.7, 2.2, 0, 0x55633a);
    b.boxR(0, 1.75, 1.9, 0.22, 0.22, 2.6, 0, 0x4a5733);
  },
  scooter: (b) => {
    b.boxR(0, 0.55, 0, 0.36, 0.4, 1.3, 0, 0xe07a2c);
    b.boxR(0, 0.85, -0.2, 0.32, 0.12, 0.6, 0, 0x222222);
    b.boxR(0, 0.95, 0.55, 0.08, 0.7, 0.08, 0, 0x444444);
    b.boxR(0, 1.0, -0.55, 0.5, 0.4, 0.45, 0, 0xe07a2c);
    b.boxR(0, 0.25, 0.6, 0.12, 0.5, 0.5, 0, 0x151515);
    b.boxR(0, 0.25, -0.6, 0.12, 0.5, 0.5, 0, 0x151515);
  },
  rowboat: (b) => { b.boxR(0, 0.15, 0, 1.2, 0.35, 3.0, 0, 0x8d6e63); b.boxR(0, 0.3, 0, 0.9, 0.08, 2.6, 0, 0x5d4037); },
  sailboat: (b) => {
    b.boxR(0, 0.3, 0, 2.2, 1.0, 7.0, 0, 0xfafafa, { top: 0xd7ccc8 });
    b.boxR(0, 0.95, -0.8, 1.4, 0.5, 2.2, 0, 0xeceff1);
    b.boxR(0, 5.0, 0.6, 0.14, 9, 0.14, 0, 0xbdbdbd);
    b.quad2([0, 1.2, 0.8], [0, 1.2, 3.6], [0, 9.2, 0.75], [0, 9.2, 0.7], [1, 0, 0], 0xffffff);
  },
  buoy: (b) => { b.cylinder(0, -0.2, 0, 0.45, 0.35, 0.8, 8, 0xd32f2f); b.cylinder(0, 0.6, 0, 0.12, 0.12, 0.6, 6, 0xffffff); },
  ship: (b) => {
    b.boxR(0, 1.5, 0, 9, 5, 42, 0, 0x263238, { top: 0x8d6e63 });
    b.boxR(0, 0.2, 0, 9.05, 1.2, 42.05, 0, 0xb71c1c);
    b.boxR(0, 6.5, -14, 8, 5, 8, 0, 0xfafafa);
    b.boxR(0, 10, -15, 2, 3, 2, 0, 0xe65100);
    const cols = [0xb03a2e, 0x2e86c1, 0x239b56, 0xd68910, 0x6c3483];
    for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) b.boxR(j * 3 - 1.5, 5.3, -4 + i * 4, 2.6, 2.6, 3.8, 0, cols[(i + j) % cols.length]);
  },
  // ---------- playa y puerto ----------
  lifeguard: (b) => {
    for (const sx of [-0.8, 0.8]) for (const sz of [-0.8, 0.8]) b.boxR(sx, 1.1, sz, 0.12, 2.2, 0.12, 0, 0xffffff);
    b.boxR(0, 2.3, 0, 2.2, 0.15, 2.2, 0, 0xd32f2f);
    b.boxR(0, 2.9, -0.9, 2.0, 1.2, 0.1, 0, 0xffffff);
    b.boxR(0, 3.6, 0, 2.6, 0.12, 2.6, 0, 0xd32f2f);
    b.bar([0, 0, 2.2], [0, 2.3, 1.0], 0.1, 0xffffff);
  },
  palapa: (b) => {
    for (const sx of [-2, 2]) for (const sz of [-2, 2]) b.tube([[sx, 0, sz], [sx, 2.8, sz]], [0.13, 0.11], 6, 0x8d6e63);
    b.cylinder(0, 2.8, 0, 4.2, 0, 2.2, 10, 0xc9a46a);
    b.cylinder(0, 2.55, 0, 4.2, 4.2, 0.25, 10, 0xb08d55, { cap: false });
    b.boxR(0, 0.55, -1.2, 3.0, 1.1, 0.6, 0, 0x6d4c41, { top: 0xa1887f });
    for (const x of [-1, 0, 1]) b.cylinder(x, 0, -0.4, 0.18, 0.18, 0.75, 6, 0x8d6e63);
    b.boxR(0, 1.9, -1.9, 2.6, 0.5, 0.05, 0, 0x0d47a1);
  },
  volleyball: (b) => { for (const s of [-4, 4]) b.boxR(s, 1.2, 0, 0.1, 2.4, 0.1, 0, 0xdddddd); b.boxR(0, 2.1, 0, 8, 0.8, 0.03, 0, 0xfafafa); },
  crane: (b) => {
    const c = 0xf9a825;
    for (const sx of [-4, 4]) for (const sz of [-4, 4]) b.boxR(sx, 9, sz, 0.8, 18, 0.8, 0, c);
    b.boxR(0, 18.5, 0, 9.5, 1.2, 9.5, 0, c);
    b.boxR(0, 20.5, -2, 4, 3, 4, 0, 0xeceff1);
    b.boxR(0, 23, 6, 1.2, 1.2, 34, 0, c);
    b.boxR(0, 22, -12, 1.4, 2.5, 6, 0, 0x616161);
    b.boxR(0, 14, 18, 0.1, 18, 0.1, 0, 0x424242);
    b.boxR(0, 5, 18, 2.4, 0.5, 6, 0, 0x424242);
  },
  containers: (b, c = 0xb03a2e) => {
    b.boxR(0, 1.3, 0, 2.5, 2.6, 6.1, 0, c);
    b.boxR(0, 3.9, 0, 2.5, 2.6, 6.1, 0, 0x2e86c1);
    for (let i = 0; i < 8; i++) b.boxR(1.26, 1.3, -2.8 + i * 0.8, 0.02, 2.4, 0.08, 0, shade(c, 0.75));
  },
  dummy: (b) => {
    b.boxR(0, 0.5, 0, 0.12, 1.0, 0.12, 0, 0x6b4a2f);
    b.boxR(0, 1.3, 0, 0.55, 0.75, 0.26, 0, 0xd8c49a);
    b.boxR(0, 1.84, 0, 0.28, 0.3, 0.28, 0, 0xd8c49a);
    b.boxR(0, 1.38, 0.135, 0.3, 0.3, 0.01, 0, 0xc0392b);
  },
  fountain: (b) => {
    b.cylinder(0, 0, 0, 3.3, 3.3, 0.8, 16, 0xc9c1b2, { cap: false });
    b.cylinder(0, 0.8, 0, 3.4, 3.4, 0.12, 16, 0xd8d1c4, { cap: false });
    b.cylinder(0, 0, 0, 3.0, 3.0, 0.62, 16, 0x5aa9d6);
    b.cylinder(0, 0, 0, 0.45, 0.4, 2.2, 8, 0xc9c1b2);
    b.cylinder(0, 1.9, 0, 0.5, 1.3, 0.35, 12, 0xc9c1b2, { top: 0x6db8e0 });
    b.cylinder(0, 2.25, 0, 0.25, 0.0, 0.7, 6, 0x9fd6f2);
  },
  fountainSmall: (b) => {
    b.cylinder(0, 0, 0, 1.6, 1.6, 0.6, 10, 0xc7beb0, { cap: false });
    b.cylinder(0, 0, 0, 1.4, 1.4, 0.48, 10, 0x5aa9d6);
    b.cylinder(0, 0, 0, 0.25, 0.2, 1.4, 6, 0xc7beb0);
    b.cylinder(0, 1.4, 0, 0.18, 0, 0.5, 6, 0x9fd6f2);
  },
};

// ruedas: llanta negra con tapa lateral y rin claro (eje en X)
function wheelFace(b, x, y, z, r, col, sx, n = 8) {
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    b.tri([x, y, z], [x, y + Math.sin(a0) * r, z + Math.cos(a0) * r], [x, y + Math.sin(a1) * r, z + Math.cos(a1) * r], [sx, 0, 0], col);
  }
}
function wheels(b, x, zs, r) {
  for (const sx of [-x, x]) for (const z of zs) {
    const sg = Math.sign(sx);
    b.tube([[sx - 0.13, r, z], [sx + 0.13, r, z]], [r, r], 8, 0x151515);
    wheelFace(b, sx + sg * 0.13, r, z, r, 0x1c1c1c, sg);
    wheelFace(b, sx + sg * 0.135, r, z, r * 0.58, 0xb8bec4, sg, 6);
  }
}


// Objetos que se omiten en mosaicos lejanos (pequeños)
export const FAR_SKIP = new Set(['stopSign', 'hydrant', 'hayBale', 'lamp', 'lampColonial', 'lampDouble', 'lampWood', 'lampgarden', 'busstop', 'car', 'carCompact', 'carSedan', 'carSUV', 'carPickup', 'carSport', 'carLux', 'policecar', 'mailbox', 'bin', 'bench', 'scooter', 'bush', 'hedgeBall', 'bougainvillea', 'planter', 'bamboo', 'crates', 'cooler', 'laundry', 'grill', 'table', 'tableUmbrella', 'lounger', 'hoop', 'telescope', 'dummy', 'carts', 'towel', 'buoy', 'trafficLight']);
// Objetos con versión simplificada lejos
const HAS_LOD = new Set(['round', 'oak', 'jacaranda', 'willow', 'pine', 'palm']);
const VARIANTS = { round: 3, oak: 3, jacaranda: 3, willow: 1, pine: 3, palm: 3, bush: 3, rock: 3, car: 3 };

export function PROTO(type, color, far = false, variant = 0) {
  const fn = B[type];
  if (!fn) return null;
  const v = VARIANTS[type] ? (variant >>> 0) % VARIANTS[type] : 0;
  const lod = far && HAS_LOD.has(type);
  const key = `${type}:${color ?? ''}:${v}:${lod ? 1 : 0}`;
  let p = cache.get(key);
  if (!p) {
    p = makeProto((b, f) => fn(b, color, v, lod, f));
    cache.set(key, p);
  }
  return p;
}
