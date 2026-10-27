// Convierte las "piezas" de un lote o sitio (shared/buildings.js, shared/landmarks.js) en geometría.
// P = constructor sin textura, W = fachadas con ventanas, signs = lista de letreros a dibujar.

import { PROTO, FAR_SKIP } from './props.js';
import { shade } from './geometry.js';
import { atlasUV, atlasSub } from './atlas.js';

const WIN = { sx: 3.2, sy: 3.3 };

const FAR_SKIP_KINDS = new Set(['win', 'door', 'flags', 'cross']);

// T = constructor con el atlas de texturas (solo de cerca): ventanas, puertas y fachadas detalladas
export function renderParts(P, W, obj, parts, detail, signs, far = false, T = null) {
  P.setFrame(obj.cx, obj.y0, obj.cz, obj.rot || 0);
  if (W) W.setFrame(obj.cx, obj.y0, obj.cz, obj.rot || 0);
  if (T) T.setFrame(obj.cx, obj.y0, obj.cz, obj.rot || 0);
  const seed = ((obj.seed ?? Math.round(obj.cx * 7 + obj.cz * 13)) >>> 0) || 1;
  let layer = 0;
  for (const p of parts) {
    if ((p.det ? 1 : 0) !== (detail ? 1 : 0)) continue;
    if (far) {
      if (FAR_SKIP_KINDS.has(p.k)) continue;
      if (p.k === 'prop' && FAR_SKIP.has(p.type)) continue;
      if (p.k === 'fence' && p.s !== 'wall' && p.s !== 'hedge') continue;
    }
    switch (p.k) {
      case 'box': {
        const ground = (p.y || 0) === 0;
        const bottom = ground ? -1.5 : p.y;
        const top = (p.y || 0) + p.h;
        if (p.r) { P.boxR(p.x, (bottom + top) / 2, p.z, p.w, top - bottom, p.d, p.r, p.c, { top: shade(p.c, 0.9) }); break; }
        const x0 = p.x - p.w / 2, x1 = p.x + p.w / 2, z0 = p.z - p.d / 2, z1 = p.z + p.d / 2;
        const roof = p.rc ?? shade(p.c, 0.72);
        if (T && !far && (p.f || p.s === 'win')) {
          P.boxAO(x0, bottom, z0, x1, top, z1, p.c, { ground: p.y || 0, top: roof, band: Math.min(2.6, p.h * 0.5), ao: ground ? 0.66 : 0.8 });
          facade(T, P, p, x0, x1, z0, z1, top, seed);
        } else if ((p.s === 'win' || p.f) && W) {
          W.box(x0, bottom, z0, x1, top, z1, p.c, { noTop: true, win: { sx: WIN.sx, sy: WIN.sy, v0: p.y || 0 } });
          P.rectXZ(x0, z0, x1, z1, top, roof);
        } else if (!far && p.h >= 1.2 && !p.det) {
          P.boxAO(x0, bottom, z0, x1, top, z1, p.c, { ground: p.y || 0, top: shade(p.c, 0.88), band: Math.min(2.2, p.h * 0.6), ao: ground ? 0.7 : 0.84 });
        } else {
          P.box(x0, bottom, z0, x1, top, z1, p.c, { top: shade(p.c, 0.88) });
        }
        break;
      }
      case 'slab':
        P.box(p.x - p.w / 2, p.y, p.z - p.d / 2, p.x + p.w / 2, p.y + p.h, p.z + p.d / 2, p.c, { bottom: true });
        break;
      case 'gable':
        P.gableRoof(p.x - p.w / 2, p.z - p.d / 2, p.x + p.w / 2, p.z + p.d / 2, p.y, p.rh, p.c, p.over ?? 0.35);
        break;
      case 'hip':
        P.hipRoof(p.x - p.w / 2, p.z - p.d / 2, p.x + p.w / 2, p.z + p.d / 2, p.y, p.rh, p.c, p.over ?? 0.35);
        break;
      case 'awn': {
        const n = Math.max(2, Math.round(p.w / 0.6));
        const sw = p.w / n;
        const zb = p.z - p.d / 2, zf = p.z + p.d / 2;
        for (let i = 0; i < n; i++) {
          const xa = p.x - p.w / 2 + i * sw, xb = xa + sw;
          P.quad2([xa, p.y - 0.7, zf], [xb, p.y - 0.7, zf], [xb, p.y, zb], [xa, p.y, zb], [0, 1, 0.5], i % 2 ? (p.c2 ?? p.c) : p.c);
        }
        P.quad([p.x - p.w / 2, p.y - 0.95, zf], [p.x + p.w / 2, p.y - 0.95, zf], [p.x + p.w / 2, p.y - 0.7, zf], [p.x - p.w / 2, p.y - 0.7, zf], [0, 0, 1], p.c);
        break;
      }
      case 'cyl':
        P.cylinder(p.x, p.y || 0, p.z, p.r, p.r2 ?? p.r, p.h, p.seg || 8, p.c);
        break;
      case 'cone':
        P.cylinder(p.x, p.y || 0, p.z, p.r, 0, p.h, p.seg || 8, p.c);
        break;
      case 'door': {
        const r = p.r || 0;
        if (T && !far) {
          const cell = p.cell || (p.w >= 3.6 ? 'rollup' : p.w >= 2.4 && p.h <= 2.8 ? 'garage' : p.glass ? 'doorGlass' : p.w >= 1.6 ? 'doorDouble' : (seed + Math.round(p.x * 10)) % 3 === 0 ? 'doorWood2' : 'doorWood');
          T.panel(p.x, p.z, p.y || 0, (p.y || 0) + p.h, p.w, r, atlasUV(cell), 0xffffff, 0.05);
          const fx = Math.sin(r), fz = Math.cos(r);
          if (!(p.y > 0.2)) P.boxR(p.x + fx * 0.3, 0.06, p.z + fz * 0.3, p.w + 0.5, 0.12, 0.6, r, 0xc9c4ba);  // escalón
          P.boxR(p.x + fx * 0.02, (p.y || 0) + p.h + 0.07, p.z + fz * 0.02, p.w + 0.3, 0.14, 0.12, r, 0xeeeeee);   // dintel
        } else P.boxR(p.x, (p.y || 0) + p.h / 2, p.z, p.w, p.h, 0.12, p.r || 0, p.c);
        break;
      }
      case 'win': {
        const r = p.r || 0, fx = Math.sin(r), fz = Math.cos(r);
        if (T && !far) {
          const cell = p.cell || (p.bars ? 'winBars' : (seed + Math.round(p.x * 3)) % 4 === 0 ? 'winHouseShutter' : 'winHouse');
          const ww = cell === 'winHouseShutter' ? p.w * 1.7 : p.w;
          T.panel(p.x, p.z, p.y, p.y + p.h, ww, r, atlasUV(cell), 0xffffff, 0.05);
          P.boxR(p.x + fx * 0.07, p.y - 0.06, p.z + fz * 0.07, p.w + 0.24, 0.1, 0.18, r, p.sill ?? 0xf2f2f0);   // alféizar
          break;
        }
        P.boxR(p.x, p.y + p.h / 2, p.z, p.w + 0.18, p.h + 0.18, 0.06, r, p.f ?? 0xeeeeee);
        P.boxR(p.x + fx * 0.03, p.y + p.h / 2, p.z + fz * 0.03, p.w, p.h, 0.06, r, p.c);
        if (p.bars) {
          const ax = Math.cos(r), az = -Math.sin(r);
          for (let i = -1; i <= 1; i++) P.boxR(p.x + fx * 0.08 + ax * i * p.w * 0.3, p.y + p.h / 2, p.z + fz * 0.08 + az * i * p.w * 0.3, 0.05, p.h, 0.05, r, 0x444444);
        }
        break;
      }
      case 'panel': {   // panel texturizado libre (vitrinas, ventanales, unidades de aire)
        if (T && !far) T.panel(p.x, p.z, p.y || 0, (p.y || 0) + p.h, p.w, p.r || 0, atlasUV(p.cell), p.c ?? 0xffffff, p.off ?? 0.05);
        else if (!far || p.h > 2) P.boxR(p.x, (p.y || 0) + p.h / 2, p.z, p.w, p.h, 0.06, p.r || 0, p.fc ?? 0x3c556b);
        break;
      }
      case 'sign':
        if (signs) {
          const c = Math.cos(obj.rot || 0), s = Math.sin(obj.rot || 0);
          signs.push({ x: obj.cx + p.x * c + p.z * s, y: obj.y0 + p.y, z: obj.cz - p.x * s + p.z * c, ry: (obj.rot || 0) + (p.r || 0), w: p.w, h: p.h, text: p.text, bg: p.bg, fg: p.fg });
        }
        break;
      case 'decal':
        layer++;
        P.rectR(p.x, p.z, p.w, p.d, p.r || 0, (p.y || 0) + 0.035 + (layer % 4) * 0.004, p.c);
        break;
      case 'pool': {
        const t = 0.35, y = (p.y || 0);
        P.box(p.x - p.w / 2 - t, y, p.z - p.d / 2 - t, p.x + p.w / 2 + t, y + 0.3, p.z - p.d / 2, 0xf5f5f5);
        P.box(p.x - p.w / 2 - t, y, p.z + p.d / 2, p.x + p.w / 2 + t, y + 0.3, p.z + p.d / 2 + t, 0xf5f5f5);
        P.box(p.x - p.w / 2 - t, y, p.z - p.d / 2, p.x - p.w / 2, y + 0.3, p.z + p.d / 2, 0xf5f5f5);
        P.box(p.x + p.w / 2, y, p.z - p.d / 2, p.x + p.w / 2 + t, y + 0.3, p.z + p.d / 2, 0xf5f5f5);
        P.rectXZ(p.x - p.w / 2, p.z - p.d / 2, p.x + p.w / 2, p.z + p.d / 2, y + 0.18, p.c ?? 0x29b6f6);
        break;
      }
      case 'pond':
        P.disc(p.x, p.z, p.rx + 1.5, p.rz + 1.5, 0.03, 22, 0xa89f8c);
        P.disc(p.x, p.z, p.rx, p.rz, 0.08, 22, p.c);
        break;
      case 'fence':
        fence(P, p);
        break;
      case 'prop': {
        const proto = PROTO(p.type, p.c, far, p.v ?? ((Math.round(p.x * 7.3) * 31 + Math.round(p.z * 5.1) + seed) >>> 0));
        if (proto) P.addProto(proto, p.x, p.y || 0, p.z, p.r || 0, p.sc || 1);
        break;
      }
      case 'flags': {
        const cols = p.colors;
        const n = Math.max(4, Math.round(p.w / 0.6));
        for (let i = 0; i < n; i++) {
          const x = p.x - p.w / 2 + (i + 0.5) * (p.w / n);
          const sag = Math.sin((i / (n - 1)) * Math.PI) * 0.35;
          P.quad2([x - 0.22, p.y - sag, p.z], [x + 0.22, p.y - sag, p.z], [x + 0.22, p.y - sag - 0.35, p.z], [x - 0.22, p.y - sag - 0.35, p.z], [0, 0, 1], cols[i % cols.length]);
        }
        break;
      }
      case 'cross': {
        const s = p.big ? 4 : 0.9, t = s * 0.3;
        P.boxR(p.x, p.y + s / 2, p.z, t, s, p.big ? t : 0.15, 0, p.c);
        P.boxR(p.x, p.y + s / 2, p.z, s, t, p.big ? t : 0.15, 0, p.c);
        break;
      }
      default: break;
    }
  }
  P.clearFrame();
  if (W) W.clearFrame();
  if (T) T.clearFrame();
}

// ---------------- fachadas con el atlas ----------------
// Estilos (p.f):
//  glassBlue/glassTeal/glassBronze/glassDark  muro cortina (sin tinte)
//  officePunch/officeBand/aptGrid/hotelGrid  ventanas sobre la pared (con tinte = color del edificio)
//  apt / hotel   frente con balcones de vidrio, resto con aptGrid/hotelGrid
// p.gf: planta baja 'shop' (vitrinas) | 'lobby' (puerta de vidrio y ventanales) ; p.fh altura de piso
const GLASS = new Set(['glassBlue', 'glassTeal', 'glassBronze', 'glassDark']);

function facade(T, P, p, x0, x1, z0, z1, top, seed) {
  const style = p.f || 'aptGrid';
  const base = p.y || 0;
  const fh = p.fh || (GLASS.has(style) ? 3.7 : style === 'officePunch' || style === 'officeBand' ? 3.6 : 3.1);
  const gfH = p.gf ? (p.gfH || Math.max(3.6, fh)) : 0;
  const par = p.par ?? (GLASS.has(style) ? 0.9 : 0.5);
  const yA = base + gfH + (GLASS.has(style) ? 0 : 0.05), yB = top - par;
  const faces = [
    { cx: (x0 + x1) / 2, cz: z1, ry: 0, L: x1 - x0, front: true },
    { cx: (x0 + x1) / 2, cz: z0, ry: Math.PI, L: x1 - x0 },
    { cx: x1, cz: (z0 + z1) / 2, ry: Math.PI / 2, L: z1 - z0 },
    { cx: x0, cz: (z0 + z1) / 2, ry: -Math.PI / 2, L: z1 - z0 },
  ];
  const tint = GLASS.has(style) ? 0xffffff : p.c;
  for (const fc of faces) {
    if (fc.L < 2) continue;
    const ax = Math.cos(fc.ry), az = -Math.sin(fc.ry);
    const balc = fc.front && (style === 'apt' || style === 'hotel') && !p.noBalc;
    const fillCell = style === 'apt' ? 'aptGrid' : style === 'hotel' ? 'hotelGrid' : style;
    if (balc) balconies(T, P, p, fc, ax, az, yA, yB, fh, style === 'hotel', seed);
    else if (yB - yA > 1.2) fill(T, fc, ax, az, yA, yB, fillCell, p.cw || 3.0, fh, GLASS.has(fillCell) ? 0xffffff : tint);
    // aletas verticales en torres de vidrio
    if (GLASS.has(style) && fc.L > 8 && !p.noFins) {
      const n = Math.max(2, Math.round(fc.L / 6));
      for (let i = 0; i <= n; i++) {
        const off = -fc.L / 2 + (fc.L * i) / n;
        P.boxR(fc.cx + ax * off + Math.sin(fc.ry) * 0.15, (yA + top) / 2, fc.cz + az * off + Math.cos(fc.ry) * 0.15, 0.35, top - yA, 0.3, fc.ry, shade(p.c, 1.1));
      }
    }
    // planta baja
    if (p.gf && fc.front) groundFloor(T, P, p, fc, ax, az, base, gfH, seed);
    else if (p.gf && gfH > 0) fill(T, fc, ax, az, base + 0.3, base + gfH - 0.5, 'winOffice', 3.2, gfH - 0.8, 0xffffff, true);
  }
  // pretil en la azotea
  if (par > 0.2 && !p.noPar) {
    const t = 0.25, c = shade(p.c, 0.92), y = top;
    P.box(x0, y, z0, x1, y + 0.7, z0 + t, c);
    P.box(x0, y, z1 - t, x1, y + 0.7, z1, c);
    P.box(x0, y, z0 + t, x0 + t, y + 0.7, z1 - t, c);
    P.box(x1 - t, y, z0 + t, x1, y + 0.7, z1 - t, c);
  }
}

// Rellena una cara con una celda de 2 columnas x 4 pisos (con piezas parciales al final)
function fill(T, fc, ax, az, yA, yB, cell, colW, fh, tint, single = false) {
  const cols = Math.max(1, Math.round(fc.L / colW));
  const cw = fc.L / cols;
  const floors = Math.max(1, Math.round((yB - yA) / fh));
  const ff = (yB - yA) / floors;
  const perX = single ? 1 : 2, perY = single ? 1 : 4;
  for (let c0 = 0; c0 < cols; c0 += perX) {
    const nc = Math.min(perX, cols - c0);
    const off = -fc.L / 2 + cw * (c0 + nc / 2);
    for (let f0 = 0; f0 < floors; f0 += perY) {
      const nf = Math.min(perY, floors - f0);
      const uv = single ? atlasUV(cell) : atlasSub(cell, 0, 0, nc / perX, nf / perY);
      T.panel(fc.cx + ax * off, fc.cz + az * off, yA + f0 * ff, yA + (f0 + nf) * ff, nc * cw, fc.ry, uv, tint, 0.035);
    }
  }
}

// Frente con balcones de vidrio (departamentos y hoteles)
function balconies(T, P, p, fc, ax, az, yA, yB, fh, all, seed) {
  const cols = Math.max(1, Math.round(fc.L / 3.2));
  const cw = fc.L / cols;
  const floors = Math.max(1, Math.round((yB - yA) / fh));
  const ff = (yB - yA) / floors;
  const fx = Math.sin(fc.ry), fz = Math.cos(fc.ry);
  for (let f = 0; f < floors; f++) {
    const y = yA + f * ff;
    for (let i = 0; i < cols; i++) {
      const off = -fc.L / 2 + cw * (i + 0.5);
      const x = fc.cx + ax * off, z = fc.cz + az * off;
      const hasB = all || (i % 2 === (seed % 2)) || cols === 1;
      if (hasB) {
        T.panel(x, z, y + 0.05, y + Math.min(2.45, ff - 0.35), cw * 0.62, fc.ry, atlasUV('balconyDoor'), 0xffffff, 0.04);
        const bw = cw * 0.92, bd = 1.25;
        P.boxR(x + fx * bd / 2, y - 0.04, z + fz * bd / 2, bw, 0.16, bd, fc.ry, 0xf2f2f0);                // losa
        T.panel(x + fx * (bd - 0.04), z + fz * (bd - 0.04), y + 0.05, y + 1.05, bw, fc.ry, atlasUV('railGlass'), 0xffffff, 0);
        P.boxR(x + fx * bd, y + 1.08, z + fz * bd, bw, 0.06, 0.08, fc.ry, 0xdfe3e5);                     // pasamanos
        for (const s of [-1, 1]) P.boxR(x + ax * s * (bw / 2 - 0.03) + fx * bd / 2, y + 0.55, z + az * s * (bw / 2 - 0.03) + fz * bd / 2, 0.05, 1.05, bd, fc.ry, 0xdfe3e5);
      } else {
        const cell = (seed + f * 3 + i) % 3 === 0 ? 'winApt2' : 'winApt';
        const ww = Math.min(1.6, cw * 0.55);
        T.panel(x, z, y + 0.85, y + Math.min(2.35, ff - 0.45), ww, fc.ry, atlasUV(cell), 0xffffff, 0.04);
        P.boxR(x + fx * 0.06, y + 0.8, z + fz * 0.06, ww + 0.2, 0.08, 0.14, fc.ry, 0xeeeeee);
      }
    }
  }
}

// Planta baja: vitrinas de tienda o vestíbulo con puerta de vidrio
function groundFloor(T, P, p, fc, ax, az, base, gfH, seed) {
  const fx = Math.sin(fc.ry), fz = Math.cos(fc.ry);
  const n = Math.max(1, Math.round(fc.L / 3.4));
  const w = fc.L / n;
  const mid = Math.floor(n / 2);
  for (let i = 0; i < n; i++) {
    const off = -fc.L / 2 + w * (i + 0.5);
    const x = fc.cx + ax * off, z = fc.cz + az * off;
    let cell;
    if (i === mid) cell = 'doorGlass';
    else if (p.gf === 'shop') cell = (seed + i) % 2 ? 'shopWindow' : 'shopWindow2';
    else cell = 'winLarge';
    const h = Math.min(gfH - 0.6, cell === 'doorGlass' ? 2.6 : 3.0);
    T.panel(x, z, base + 0.15, base + 0.15 + h, w - 0.3, fc.ry, atlasUV(cell), 0xffffff, 0.04);
  }
  // marquesina / cornisa sobre la planta baja
  P.boxR(fc.cx + fx * 0.45, base + gfH - 0.25, fc.cz + fz * 0.45, fc.L + 0.2, 0.22, 0.9, fc.ry, p.gfc ?? shade(p.c, 0.8));
}


function fence(P, p) {
  const dx = p.x2 - p.x, dz = p.z2 - p.z;
  const L = Math.hypot(dx, dz);
  if (L < 0.1) return;
  const ry = Math.atan2(-dz, dx);
  const mx = (p.x + p.x2) / 2, mz = (p.z + p.z2) / 2;
  const h = p.h, c = p.c;
  const posts = (gap, w, col) => {
    const n = Math.max(1, Math.round(L / gap));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      P.boxR(p.x + dx * t, h / 2, p.z + dz * t, w, h, w, ry, col);
    }
  };
  switch (p.s) {
    case 'wall':
      P.boxR(mx, h / 2 - 0.5, mz, L, h + 1, 0.25, ry, c, { top: shade(c, 0.85) });
      break;
    case 'hedge':
      P.boxR(mx, h / 2 - 0.3, mz, L, h + 0.6, 0.8, ry, c, { top: shade(c, 1.15) });
      break;
    case 'wood':
      P.boxR(mx, h / 2, mz, L, h, 0.08, ry, c);
      posts(2.4, 0.12, shade(c, 0.8));
      break;
    case 'picket':
      P.boxR(mx, h * 0.35, mz, L, 0.08, 0.05, ry, c);
      P.boxR(mx, h * 0.8, mz, L, 0.08, 0.05, ry, c);
      posts(1.5, 0.09, c);
      break;
    case 'rail':
      P.boxR(mx, h, mz, L, 0.08, 0.08, ry, c);
      P.boxR(mx, h * 0.55, mz, L, 0.05, 0.05, ry, c);
      posts(2.2, 0.1, c);
      break;
    case 'barricade': {
      // valla de franjas (calle cerrada): dos tablones con franjas alternadas sobre postes
      const n = Math.max(2, Math.round(L / 0.7));
      for (const yy of [h * 0.55, h * 0.9]) {
        for (let i = 0; i < n; i++) {
          const t0 = i / n, t1 = (i + 1) / n;
          P.boxR(p.x + dx * (t0 + t1) / 2, yy, p.z + dz * (t0 + t1) / 2, L / n, 0.24, 0.07, ry, i % 2 ? (p.c2 ?? 0xffffff) : c);
        }
      }
      posts(Math.max(1.5, L / 4), 0.09, 0x9e9e9e);
      break;
    }
    case 'stone':
      P.boxR(mx, h / 2 - 0.2, mz, L + 0.3, h + 0.4, 0.7, ry, c, { top: shade(c, 1.1) });
      break;
    default:
      P.boxR(mx, h / 2, mz, L, h, 0.1, ry, c);
  }
}
