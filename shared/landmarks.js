// Arquitectura de los lugares emblemáticos (coordenadas locales del sitio; +Z = fachada principal).
// Cada uno devuelve { parts, points } donde points son lugares importantes en coordenadas locales.

const box = (x, z, w, d, h, c, o = {}) => ({ k: 'box', x, z, y: o.y || 0, w, d, h, c, s: o.s || 'plain', col: o.col ?? 1, r: o.r || 0, det: o.det ? 1 : 0, colH: o.colH, f: o.f, gf: o.gf, fh: o.fh, gfH: o.gfH, gfc: o.gfc, par: o.par, noBalc: o.noBalc, noFins: o.noFins, noPar: o.noPar });
const panel = (cell, x, z, y, w, h, o = {}) => ({ k: 'panel', cell, x, z, y, w, h, r: o.r || 0, c: o.c, fc: o.fc, det: o.det ? 1 : 0 });
const deco = (x, z, w, d, h, c, o = {}) => box(x, z, w, d, h, c, { ...o, col: 0, det: o.det ?? 1 });
const decal = (x, z, w, d, c, o = {}) => ({ k: 'decal', x, z, w, d, c, y: o.y || 0, r: o.r || 0, det: o.det ? 1 : 0 });
const prop = (type, x, z, o = {}) => ({ k: 'prop', type, x, z, y: o.y || 0, r: o.r || 0, sc: o.sc || 1, c: o.c, col: o.col ?? 0, det: o.det ?? 0 });
const fence = (x, z, x2, z2, style, h, c, o = {}) => ({ k: 'fence', x, z, x2, z2, s: style, h, c, col: o.col ?? 1, det: o.det ?? 0, colH: o.colH });
const door = (x, z, w, h, c, r = 0, o = {}) => ({ k: 'door', x, z, y: o.y || 0, w, h, c, r, cell: o.cell });
const win = (x, z, y, w, h, r = 0, o = {}) => ({ k: 'win', x, z, y, w, h, r, c: o.c ?? 0x2f4555, bars: o.bars ? 1 : 0, f: o.f ?? 0xeeeeee, det: o.det ?? 0 });
const sign = (x, z, y, w, h, text, bg, fg = '#ffffff', r = 0) => ({ k: 'sign', x, z, y, w, h, text, bg, fg, r });
const cyl = (x, z, y, r, r2, h, seg, c, o = {}) => ({ k: 'cyl', x, z, y, r, r2, h, seg, c, col: o.col ?? 0, det: o.det ?? 0 });

// Anillo de vallas (polígono regular o elipse)
function ring(P, cx, cz, rx, rz, n, style, h, c, gapAt = null, o = {}) {
  for (let i = 0; i < n; i++) {
    if (gapAt !== null && i === gapAt) continue;
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    P.push(fence(cx + Math.sin(a0) * rx, cz + Math.cos(a0) * rz, cx + Math.sin(a1) * rx, cz + Math.cos(a1) * rz, style, h, c, o));
  }
}
// Muro perimetral con portón en el frente (+Z)
function perimeter(P, hx, hz, h, c, gate, style = 'wall', o = {}) {
  P.push(fence(-hx, -hz, hx, -hz, style, h, c, o));
  P.push(fence(-hx, -hz, -hx, hz, style, h, c, o));
  P.push(fence(hx, -hz, hx, hz, style, h, c, o));
  if (gate > 0) {
    P.push(fence(-hx, hz, -gate / 2, hz, style, h, c, o));
    P.push(fence(gate / 2, hz, hx, hz, style, h, c, o));
  } else P.push(fence(-hx, hz, hx, hz, style, h, c, o));
}

export const SITE_BUILDERS = {
  plaza(site) {
    const P = [];
    const { hx, hz } = site;
    P.push(decal(0, 0, hx * 2, hz * 2, 0xd3c8b4));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      P.push(decal(sx * 24, sz * 24, 24, 24, 0x6aa84f, { y: 0.01 }));
      P.push(cyl(sx * 24, sz * 24, 0, 3.2, 3.2, 0.45, 10, 0xb9ad99, { col: 0 }));
      P.push(cyl(sx * 24, sz * 24, 0.45, 2.9, 2.9, 0.08, 10, 0xd84f6b, { det: 1 }));
      for (const [ox, oz] of [[-8, -8], [8, -8], [-8, 8], [8, 8]]) P.push(prop('laurel', sx * 24 + ox, sz * 24 + oz, { col: 1 }));
      P.push(prop('lampColonial', sx * 13, sz * 13));
      P.push(prop('bench', sx * 13, sz * 4.5, { r: sx > 0 ? -Math.PI / 2 : Math.PI / 2, det: 1 }));
      P.push(prop('bench', sx * 4.5, sz * 13, { r: sz > 0 ? Math.PI : 0, det: 1 }));
    }
    // Kiosco: plataforma octagonal con escalón, columnas, barandal (con dos entradas), plafón claro,
    // techo con moldura y linternilla
    P.push(cyl(0, 0, 0, 7.3, 7.3, 0.35, 8, 0xc9bfae, { col: 1 }));
    P.push(cyl(0, 0, 0, 6.6, 6.6, 0.8, 8, 0xe2d8c8, { col: 1 }));
    P.push(cyl(0, 0, 0.8, 6.7, 6.7, 0.08, 8, 0xb5a58c));
    const R = 5.8;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8, b = ((i + 1) / 8) * Math.PI * 2 + Math.PI / 8;
      const x = Math.sin(a) * R, z = Math.cos(a) * R;
      P.push(cyl(x, z, 0.88, 0.32, 0.32, 0.35, 8, 0xf2ede4));                      // base de la columna
      P.push(cyl(x, z, 0.88, 0.2, 0.17, 3.5, 8, 0xfaf7f2, { col: 1 }));
      P.push(cyl(x, z, 4.3, 0.3, 0.36, 0.25, 8, 0xf2ede4));                        // capitel
      // barandal entre columnas (menos en las dos entradas)
      if (i === 1 || i === 5) continue;
      const mx = (Math.sin(a) + Math.sin(b)) / 2 * R, mz = (Math.cos(a) + Math.cos(b)) / 2 * R;
      const L = 2 * R * Math.sin(Math.PI / 8) - 0.4, r = Math.atan2(Math.sin(b) - Math.sin(a), Math.cos(b) - Math.cos(a)) - Math.PI / 2;
      P.push(deco(mx, mz, L, 0.12, 0.1, 0x1f5e2a, { y: 1.8, r, det: 0 }));
      P.push(box(mx, mz, L, 0.1, 0.08, 0x1f5e2a, { y: 1.0, r, colH: 1.0 }));   // pasamanos inferior (también es la colisión)
      for (let k = 1; k < 6; k++) {
        const t = k / 6 - 0.5, bx = mx + Math.cos(r) * L * t, bz = mz - Math.sin(r) * L * t;
        P.push(deco(bx, bz, 0.05, 0.05, 0.8, 0x1f5e2a, { y: 1.0 }));
      }
    }
    P.push({ k: 'cyl', x: 0, z: 0, y: 4.5, r: 7.6, r2: 7.6, h: 0.4, seg: 8, c: 0xf5f1ea, col: 0, det: 0, bc: 0xf1ebe0 });   // moldura y plafón
    P.push({ k: 'cone', x: 0, z: 0, y: 4.9, r: 7.7, h: 2.6, seg: 8, c: 0x2f7d3a, bc: 0xf1ebe0 });
    P.push(cyl(0, 0, 7.2, 1.0, 1.0, 1.1, 8, 0xf5f1ea));
    P.push({ k: 'cone', x: 0, z: 0, y: 8.3, r: 1.4, h: 1.2, seg: 8, c: 0x2f7d3a, bc: 0xf1ebe0 });
    P.push(cyl(0, 0, 9.5, 0.06, 0.03, 1.1, 5, 0xd4a85a));
    // escalones de las entradas
    for (const i of [1, 5]) {
      const a = ((i + 0.5) / 8) * Math.PI * 2 + Math.PI / 8;
      for (let st = 0; st < 2; st++) P.push(deco(Math.sin(a) * (7.0 + st * 0.5), Math.cos(a) * (7.0 + st * 0.5), 2.6, 0.5, 0.55 - st * 0.27, 0xd9cfbd, { r: a, det: 0 }));
    }
    // Fuente y monumento
    P.push(prop('fountain', 0, 30, { col: 1 }));
    P.push(box(0, -30, 3.2, 3.2, 3.0, 0xbcae97));
    P.push(cyl(0, -30, 3.0, 0.7, 0.55, 2.6, 8, 0x6d6d6d, { col: 0 }));
    P.push(cyl(0, -30, 5.6, 0.45, 0.2, 0.9, 6, 0x6d6d6d));
    for (const [x, z] of [[-38, 0], [38, 0], [0, 38], [0, -38]]) P.push(prop('lampColonial', x, z));
    const spawns = [];
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2 + 0.2; spawns.push([Math.sin(a) * 11.5, Math.cos(a) * 11.5]); }
    return { parts: P, points: { spawns } };
  },

  catedral() {
    const P = [];
    const stone = 0xe8dcc4, stone2 = 0xdccdb0;
    P.push(decal(0, 0, 34, 44, 0xcbbfa8));
    P.push(box(0, -5, 18, 28, 15, stone));
    P.push({ k: 'gable', x: 0, z: -5, y: 15, w: 18, d: 28, rh: 5, c: 0x9e8f7a, over: 0.3 });
    P.push(box(0, 11, 9, 4, 18, stone2));
    for (const sx of [-1, 1]) {
      P.push(box(sx * 7.5, 11, 6, 6, 24, stone2));
      P.push(box(sx * 7.5, 11, 4.4, 4.4, 4, stone, { y: 24 }));
      P.push(deco(sx * 7.5, 13.25, 1.4, 0.1, 2.4, 0x3e2f22, { y: 25, det: 0 }));
      P.push({ k: 'cone', x: sx * 7.5, z: 11, y: 28, r: 3.0, h: 4.5, seg: 8, c: 0xc9b48f });
      P.push(deco(sx * 7.5, 11, 0.15, 0.15, 1.6, 0x444444, { y: 32.4, det: 0 }));
      P.push(deco(sx * 7.5, 11, 0.8, 0.15, 0.15, 0x444444, { y: 33.4, det: 0 }));
    }
    P.push(door(0, 13.06, 3.4, 5.8, 0x4e342e));
    P.push(win(0, 13.06, 9.5, 2.6, 2.6, 0, { c: 0x7e57c2, f: 0xd7c7a8 }));
    for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) P.push(win(sx * 9.05, -15 + i * 6, 5, 1.4, 4, sx * Math.PI / 2, { c: 0x5c6bc0, f: 0xd7c7a8 }));
    // cúpula
    P.push(cyl(0, -12, 15, 4.6, 4.6, 3.2, 12, stone2, { col: 0 }));
    P.push({ k: 'cone', x: 0, z: -12, y: 18.2, r: 4.9, h: 4.4, seg: 12, c: 0xd4a85a });
    P.push(cyl(0, -12, 22.4, 0.7, 0.4, 1.8, 8, stone));
    // escalinata
    P.push(deco(0, 14.6, 13, 1.2, 0.3, 0xcfc3ab, { det: 0 }));
    P.push(deco(0, 14.0, 13, 1.2, 0.6, 0xcfc3ab, { det: 0 }));
    P.push(prop('palm', -14, 16, { col: 1, sc: 1.2 }));
    P.push(prop('palm', 14, 16, { col: 1, sc: 1.2 }));
    return { parts: P, points: {} };
  },

  repartos(site) {
    const P = [];
    const orange = 0xe07a2c;
    P.push(decal(0, 0, site.hx * 2, site.hz * 2, 0xb9b3a7));
    P.push(box(0, -2, 34, 17, 7.5, 0xf2ebe2, { f: 'officeBand', fh: 3.4, par: 0.6 }));
    P.push(deco(0, -2, 34.1, 17.1, 1.1, orange, { y: 6.2, det: 0 }));
    for (let i = 0; i < 4; i++) if (i !== 1) P.push(panel('winLarge', -10.5 + i * 3.25, 6.53, 0.3, 3.1, 2.9, { fc: 0x2c3e50 }));
    P.push(door(-4, 6.55, 2.6, 2.7, 0x1b1b1b, 0, { cell: 'doorGlass' }));
    P.push(sign(4, 6.66, 4.3, 16, 1.7, (site.name || 'Centro de Trabajos').toUpperCase(), '#e07a2c'));
    for (let i = 0; i < 3; i++) P.push(door(17.05, -6 + i * 4.5, 3.8, 3.6, 0x90a4ae, Math.PI / 2, { cell: 'rollup' }));
    P.push({ k: 'slab', x: -4, z: 8, y: 3.4, w: 10, d: 3, h: 0.2, c: orange });
    for (let i = 0; i < 4; i++) P.push(prop('scooter', -14 + i * 1.6, 9.5, { r: 0, det: 0 }));
    P.push(prop('van', 12, 10, { c: orange, col: 1, r: 0 }));
    P.push(prop('planter', -11, 8.2, { det: 1 }));
    return { parts: P, points: { job: [-4, site.hz + 2.2] } };
  },

  comisaria(site) {
    const P = [];
    const navy = 0x16326b;
    P.push(decal(0, 0, site.hx * 2, site.hz * 2, 0xa9adb1));
    P.push(box(-2, -3, 30, 15, 8, 0xeef2f5, { f: 'officePunch', fh: 4, par: 0.5 }));
    P.push(deco(-2, -3, 30.1, 15.1, 1.0, navy, { y: 3.4, det: 0 }));
    P.push(deco(-2, -3, 30.1, 15.1, 0.8, navy, { y: 7.4, det: 0 }));
    P.push(box(-2, 6, 8, 3, 4.2, 0x30475e));
    P.push(door(-2, 7.55, 2.6, 2.6, 0x0d1b2a, 0, { cell: 'doorGlass' }));
    for (const sx of [-1, 1]) P.push(panel('winLarge', -2 + sx * 2.6, 7.53, 0.4, 1.6, 2.4, { fc: 0x2c3e50 }));
    P.push(sign(-2, 7.62, 3.0, 7, 0.9, 'POLICÍA', '#16326b'));
    P.push(sign(-2, 4.62, 8.6, 14, 1.4, 'COMISARÍA DE POLICÍA', '#16326b'));
    P.push(cyl(14, 8, 0, 0.12, 0.08, 10, 6, 0xdddddd, { col: 0 }));
    P.push(deco(15.1, 8, 2.2, 0.05, 1.3, 0x2e7d32, { y: 8.6, det: 0 }));
    for (let i = 0; i < 3; i++) P.push(prop('policecar', -14 + i * 5, 9.5, { col: 1, r: Math.PI / 2 }));
    return { parts: P, points: { door: [-2, site.hz + 2] } };
  },

  carcel(site) {
    // Prisión estilo GTA: muro perimetral con alambre de púas, cerca interior, torres de vigilancia
    // con cabina de vidrio y reflector, acceso con caseta y pluma, dos módulos de celdas de tres
    // pisos con ventanas enrejadas, edificio de administración y patio con cancha.
    const P = [];
    const { hx, hz } = site;
    const CONC = 0xb3b0a6, CONC2 = 0x9c9a92, TRIM = 0x5f6368;
    P.push(decal(0, 0, hx * 2, hz * 2, 0x8a8a84));
    // muro perimetral (con hueco de acceso al frente) y alambre de púas
    perimeter(P, hx - 0.6, hz - 0.6, 6, CONC, 9, 'wall');
    for (const [x0, z0, x1, z1] of [[-hx + 0.6, -hz + 0.6, hx - 0.6, -hz + 0.6], [-hx + 0.6, -hz + 0.6, -hx + 0.6, hz - 0.6], [hx - 0.6, -hz + 0.6, hx - 0.6, hz - 0.6], [-hx + 0.6, hz - 0.6, -4.5, hz - 0.6], [4.5, hz - 0.6, hx - 0.6, hz - 0.6]]) {
      const L = Math.hypot(x1 - x0, z1 - z0), r = Math.atan2(-(z1 - z0), x1 - x0);
      for (const [y, o] of [[6.25, 0.08], [6.55, -0.08], [6.85, 0]]) P.push(deco((x0 + x1) / 2 - Math.sin(r) * o, (z0 + z1) / 2 - Math.cos(r) * o, L, 0.05, 0.05, 0x6d6d6d, { y, r, det: 0 }));
      const n = Math.max(2, Math.round(L / 2.5));
      for (let k = 0; k <= n; k++) { const t = k / n; P.push(deco(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, 0.06, 0.06, 1.0, 0x4a4a4a, { y: 6, det: 1 })); }
    }
    perimeter(P, hx - 4, hz - 4, 4, 0x8d949a, 9, 'rail', { colH: 4 });                  // cerca interior
    // torres de vigilancia en las esquinas
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx * (hx - 1.8), z = sz * (hz - 1.8);
      P.push(box(x, z, 3.2, 3.2, 9, CONC2));
      P.push({ k: 'slab', x, z, y: 9, w: 4.8, d: 4.8, h: 0.3, c: TRIM });
      P.push(box(x, z, 4.2, 4.2, 2.6, 0xd9dcdf, { y: 9.3, col: 0 }));
      for (const r of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) P.push(panel('winOffice', x + Math.sin(r) * 2.12, z + Math.cos(r) * 2.12, 9.7, 3.4, 1.7, { r, fc: 0x2c3e50 }));
      P.push({ k: 'hip', x, z, y: 11.9, w: 4.6, d: 4.6, rh: 1.1, c: 0x37474f, over: 0.35 });
      P.push(prop('floodlight', x - sx * 1.2, z - sz * 1.2, { y: 0, r: Math.atan2(-sx, -sz) }));
      for (let k = 0; k < 6; k++) P.push(deco(x + sx * 1.62, z - 1.2 + k * 0.5, 0.06, 0.06, 0.05, 0x333333, { y: 0.8 + k * 1.4, det: 1 }));   // escalera
    }
    // acceso: caseta, pluma, portón y letrero
    P.push(box(7.5, hz - 3, 4, 3.4, 3.2, 0xe0e2e4));
    P.push(panel('winOffice', 7.5, hz - 1.28, 1.1, 3.2, 1.5, { fc: 0x2c3e50 }));
    P.push({ k: 'slab', x: 7.5, z: hz - 3, y: 3.2, w: 5, d: 4.4, h: 0.3, c: 0x37474f });
    P.push(deco(0, hz + 0.4, 8, 0.12, 0.14, 0xd32f2f, { y: 1.0, det: 0 }));
    for (let k = 0; k < 4; k++) P.push(deco(-3 + k * 2, hz + 0.41, 0.9, 0.13, 0.15, 0xffffff, { y: 1.0, det: 0 }));
    P.push(deco(-4.4, hz + 0.4, 0.3, 0.3, 1.1, 0x37474f, { det: 0 }));
    for (const sx of [-1, 1]) P.push(box(sx * 5.1, hz - 0.6, 1.3, 1.3, 8.8, CONC2));                 // pilares del arco de acceso
    P.push(deco(0, hz - 0.6, 11.5, 1.1, 1.6, CONC2, { y: 7.2, det: 0 }));
    P.push(deco(0, hz - 0.6, 11.7, 1.2, 0.2, TRIM, { y: 8.8, det: 0 }));
    P.push(sign(0, hz - 0.03, 8.0, 10.5, 1.2, (site.name || 'Prisión').toUpperCase(), '#263238'));
    // módulos de celdas
    const cell = (cx, cz, w, d, rot) => {
      P.push(box(cx, cz, w, d, 9.6, CONC, { r: rot }));
      P.push({ k: 'slab', x: cx, z: cz, y: 9.6, w: rot ? d + 0.6 : w + 0.6, d: rot ? w + 0.6 : d + 0.6, h: 0.4, c: TRIM });
      for (let f = 0; f < 3; f++) {
        P.push(deco(cx, cz, rot ? d + 0.1 : w + 0.1, rot ? w + 0.1 : d + 0.1, 0.18, CONC2, { y: 3.1 + f * 3.1, det: 0 }));
        const n = Math.floor(w / 2.4);
        for (let k = 0; k < n; k++) {
          const off = -w / 2 + (k + 0.5) * (w / n);
          for (const side of [1, -1]) {
            const lx = rot ? side * (d / 2 + 0.02) : off, lz = rot ? off : side * (d / 2 + 0.02);
            const r = rot ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : (side > 0 ? 0 : Math.PI);
            P.push(panel('winBars', cx + lx, cz + lz, 1.2 + f * 3.1, 0.9, 1.3, { r, fc: 0x2b2b2b }));
          }
        }
      }
      for (let k = 0; k < 3; k++) P.push(deco(cx + (rot ? 0 : -w / 3 + k * w / 3), cz + (rot ? -w / 3 + k * w / 3 : 0), 1.2, 1.2, 0.9, 0x8d9399, { y: 10, det: 1 }));
    };
    cell(-6, -hz + 9, 26, 8, 0);
    cell(hx - 10, 1, 14, 8, 1);
    // administración con bandera
    P.push(box(-hx + 11, hz - 9, 14, 8, 7, 0xe8e4dc, { f: 'officePunch', fh: 3.5, par: 0.5 }));
    P.push(door(-hx + 11, hz - 4.95, 2.4, 2.6, 0x37474f, 0, { cell: 'doorGlass' }));
    P.push(cyl(-hx + 19, hz - 6, 0, 0.08, 0.06, 9, 5, 0xdddddd));
    for (const [k, c] of [[0, 0x2e7d32], [1, 0xf5f5f5], [2, 0xc62828]]) P.push(deco(-hx + 19.2 + 0.4 + k * 0.8, hz - 6, 0.8, 0.05, 1.4, c, { y: 7.4, det: 0 }));
    // patio: cancha, canastas, bancas
    P.push(decal(-1, 5, 18, 10, 0x6d7378, { y: 0.01 }));
    P.push(decal(-1, 5, 17, 0.12, 0xffffff, { y: 0.02, det: 1 }));
    P.push(decal(-1, 5, 0.12, 9, 0xffffff, { y: 0.02, det: 1 }));
    P.push(prop('hoop', -9.5, 5, { r: Math.PI / 2 }));
    P.push(prop('hoop', 7.5, 5, { r: -Math.PI / 2 }));
    for (let k = 0; k < 3; k++) P.push(prop('bench', -6 + k * 5, 11.5, { r: Math.PI }));
    return { parts: P, points: { jail: [-1, 3] } };
  },

  mercado(site) {
    const P = [];
    P.push(decal(0, 0, site.hx * 2, site.hz * 2, 0xc4b59a));
    P.push(box(0, -3, 34, 18, 6.5, 0xf4e1c1));
    P.push({ k: 'gable', x: 0, z: -3, y: 6.5, w: 34, d: 18, rh: 3.2, c: 0x7b5b45, over: 0.5 });
    P.push(box(0, -3, 30, 5, 1.8, 0xf4e1c1, { y: 8.3, col: 0 }));
    P.push({ k: 'gable', x: 0, z: -3, y: 10.1, w: 30, d: 5, rh: 1.2, c: 0x7b5b45, over: 0.3 });
    for (let i = 0; i < 5; i++) P.push(door(-12 + i * 6, 6.05, 3.8, 4.2, 0x5d4037, 0, { cell: i % 2 ? 'rollup' : 'doorDouble' }));
    P.push(sign(0, 6.12, 5.0, 15, 1.4, 'MERCADO MUNICIPAL', '#8e2424'));
    const stalls = [];
    const cols = [[0xe53935, 0xffffff], [0xfdd835, 0x43a047], [0x1e88e5, 0xffffff], [0xfb8c00, 0xfff176], [0x8e24aa, 0xffffff]];
    for (let i = 0; i < 5; i++) {
      const x = -14 + i * 7;
      P.push(box(x, 10, 3.2, 2, 1.1, 0x8d6e63));
      P.push(deco(x - 1.5, 9.2, 0.1, 0.1, 2.4, 0x5d4037, { det: 0 }));
      P.push(deco(x + 1.5, 9.2, 0.1, 0.1, 2.4, 0x5d4037, { det: 0 }));
      P.push({ k: 'awn', x, z: 10, y: 2.4, w: 3.6, d: 2.8, c: cols[i][0], c2: cols[i][1] });
      P.push(prop('crates', x, 10.2, { y: 1.1, det: 1 }));
      stalls.push([x, 12]);
    }
    return { parts: P, points: { stalls } };
  },

  hospital(site) {
    const P = [];
    const { hx, hz } = site;
    P.push(decal(0, 0, hx * 2, hz * 2, 0xbdbab3));
    P.push(box(0, -8, 52, 20, 16, 0xf6f8f9, { f: 'officeBand', fh: 4, par: 0.6 }));
    P.push(deco(0, -8, 52.1, 20.1, 0.7, 0x1e88e5, { y: 4.2, det: 0 }));
    P.push(box(4, 7, 26, 10, 6, 0xeef3f6, { gf: 'lobby', gfH: 4.4, f: 'officePunch', fh: 1.6, par: 0.4 }));
    P.push(sign(0, 2.05, 13.2, 20, 2.2, 'HOSPITAL GENERAL', '#c62828'));
    P.push({ k: 'cross', x: 0, z: -8, y: 16.2, c: 0xd32f2f, big: 1 });
    P.push(decal(16, -8, 10, 10, 0x37474f, { y: 16.02 }));
    // urgencias
    P.push({ k: 'slab', x: -19, z: 10, y: 4, w: 10, d: 7, h: 0.3, c: 0xffffff });
    P.push(deco(-23.5, 13, 0.3, 0.3, 4, 0xffffff, { det: 0 }));
    P.push(deco(-14.5, 13, 0.3, 0.3, 4, 0xffffff, { det: 0 }));
    P.push(sign(-19, 13.6, 4.5, 7, 0.9, 'URGENCIAS', '#d32f2f'));
    P.push(decal(-19, 15.5, 12, 10, 0xd6d9db, { y: 0.01 }));
    P.push(prop('ambulance', -22, 15.5, { col: 1, r: 0 }));
    P.push(prop('ambulance', -16, 15.5, { col: 1, r: 0 }));
    for (const x of [-30, 24, 30]) P.push(prop('round', x, 18, { col: 1 }));
    return { parts: P, points: { door: [4, hz + 2], medics: [-19, 19] } };
  },

  armeria(site) {
    const P = [];
    const { hx, hz } = site;
    P.push(decal(0, 0, hx * 2, hz * 2, 0xa59f8f));
    P.push(box(0, 18, 24, 12, 5.5, 0x2b2f33));
    P.push(deco(0, 24.05, 24.1, 0.1, 0.8, 0xf57c00, { y: 4.6, det: 0 }));
    for (const x of [-8, 8]) P.push(win(x, 24.06, 1.0, 4, 2.0, 0, { bars: true, c: 0x1c262d, f: 0x777777 }));
    P.push(door(0, 24.06, 2.2, 2.6, 0x111111));
    P.push(sign(0, 24.12, 3.2, 12, 1.4, 'ARMERÍA NOVA', '#f57c00', '#111111'));
    P.push(cyl(9.5, 24.5, 5.5, 1.1, 1.1, 0.15, 16, 0xffffff, { det: 1 }));
    P.push(cyl(9.5, 24.5, 5.65, 0.7, 0.7, 0.15, 16, 0xd32f2f, { det: 1 }));
    // campo de tiro
    P.push(fence(-hx + 1, 11, -hx + 1, -hz + 1, 'wall', 2.6, 0x6d5c4b));
    P.push(fence(hx - 1, 11, hx - 1, -hz + 1, 'wall', 2.6, 0x6d5c4b));
    P.push(box(0, -hz + 2, hx * 2 - 2, 3, 4, 0x7a6a53));
    P.push({ k: 'slab', x: 0, z: 9, y: 2.7, w: 30, d: 4, h: 0.2, c: 0x455a64 });
    for (let i = 0; i < 6; i++) P.push(deco(-12.5 + i * 5, 9, 0.1, 3, 2.7, 0x607d8b, { det: 1 }));
    const dummies = [];
    for (let i = 0; i < 6; i++) { const x = -12.5 + i * 5, z = -18 + (i % 2) * 6; P.push(prop('dummy', x, z, { col: 1, r: 0 })); dummies.push([x, z]); }
    return { parts: P, points: { door: [0, hz + 2], range: [0, 6], dummies } };
  },

  base(site) {
    const P = [];
    const { hx, hz } = site;
    const olive = 0x6b705c;
    P.push(decal(0, 0, hx * 2, hz * 2, 0x9b8a64));
    perimeter(P, hx - 1, hz - 1, 3.6, olive, 14);
    P.push(box(-9.5, hz + 1, 3, 3, 3, 0x7d8466));
    P.push({ k: 'slab', x: -9.5, z: hz + 1, y: 3, w: 4, d: 4, h: 0.3, c: 0x4f5443 });
    P.push(deco(0, hz - 1, 12, 0.2, 0.2, 0xd32f2f, { y: 1.1, det: 0 }));
    P.push(sign(10, hz - 0.85, 2.4, 10, 1.2, 'ARMY DUTY', '#2f3a24', '#e8e2c8'));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      P.push(box(sx * (hx - 2), sz * (hz - 2), 4, 4, 9, 0x5d6150));
      P.push({ k: 'slab', x: sx * (hx - 2), z: sz * (hz - 2), y: 9, w: 5, d: 5, h: 0.3, c: 0x3f4434 });
    }
    P.push(box(0, -22, 36, 24, 10, olive));
    P.push({ k: 'gable', x: 0, z: -22, y: 10, w: 36, d: 24, rh: 3.5, c: 0x4f5443, over: 0.3 });
    P.push(door(0, -9.95, 14, 8, 0x4a4f3c));
    P.push(sign(0, -9.85, 8.8, 18, 1.6, 'BASE MILITAR · ARMY DUTY', '#2f3a24', '#e8e2c8'));
    for (const sx of [-1, 1]) {
      P.push(box(sx * 40, 14, 10, 26, 5, 0x7f8566));
      P.push({ k: 'gable', x: sx * 40, z: 14, y: 5, w: 10, d: 26, rh: 1.8, c: 0x4f5443, over: 0.3 });
      for (let i = 0; i < 4; i++) P.push(win(sx * (40 - sx * 5.03), 4 + i * 6, 1.2, 1.2, 1.2, -sx * Math.PI / 2, { det: 1 }));
    }
    P.push(decal(-30, -28 + 50, 14, 14, 0x4b5040, { y: 0.01 }));
    P.push(prop('tank', 20, 20, { col: 1, r: 0.6 }));
    P.push(prop('tank', 28, 4, { col: 1, r: -0.3 }));
    P.push(prop('truckArmy', -18, 30, { col: 1, r: 0 }));
    P.push(cyl(-8, 32, 0, 0.12, 0.08, 11, 6, 0xdddddd));
    P.push(deco(-6.9, 32, 2.2, 0.05, 1.3, 0x2e7d32, { y: 9.6, det: 0 }));
    for (let i = 0; i < 8; i++) P.push(deco(-hx + 6 + i * 1.3, hz - 4, 1.2, 0.6, 0.5, 0xa1906b, { y: (i % 2) * 0.5 }));
    return { parts: P, points: { gate: [0, hz + 4] } };
  },

  lago(site) {
    const P = [];
    const { hx, hz } = site;
    P.push(decal(0, 0, hx * 2, hz * 2, 0x6aa84f));
    const rx = 42, rz = 26, pz = -8;
    P.push({ k: 'pond', x: 0, z: pz, rx, rz, c: 0x3a8fc0 });
    // borde de piedra (colisión alta: no se puede saltar al agua)
    ring(P, 0, pz, rx + 1, rz + 1, 20, 'stone', 0.55, 0xa8a196, null, { colH: 3 });
    // senderos alrededor
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const x = Math.sin(a) * (rx + 7), z = pz + Math.cos(a) * (rz + 7);
      P.push(decal(x, z, 8.6, 3.2, 0xd8cba8, { r: Math.atan2(Math.sin(a) * (rz + 7), Math.cos(a) * (rx + 7)), y: 0.01 }));
    }
    P.push(decal(0, hz - (hz - (pz + rz + 7)) / 2, 4, hz - (pz + rz + 7), 0xd8cba8, { y: 0.01 }));
    // árboles, bancas, faroles
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + 0.17;
      const r1 = 1.32 + (i % 3) * 0.12;
      P.push(prop(i % 3 === 0 ? 'willow' : i % 3 === 1 ? 'round' : 'pine', Math.sin(a) * rx * r1, pz + Math.cos(a) * rz * (r1 + 0.2), { col: 1, sc: 1.1 + (i % 2) * 0.2 }));
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.4;
      P.push(prop('bench', Math.sin(a) * (rx + 10), pz + Math.cos(a) * (rz + 10), { r: a + Math.PI, det: 1 }));
      P.push(prop('lampColonial', Math.sin(a + 0.2) * (rx + 10), pz + Math.cos(a + 0.2) * (rz + 10)));
    }
    for (const [x, z] of [[-70, 40], [70, 40], [-75, -50], [72, -48], [-50, -55], [45, 52], [-30, 55], [85, 10], [-86, 0]]) P.push(prop('round', x, z, { col: 1, sc: 1.3 }));
    for (let i = 0; i < 3; i++) P.push(prop('rowboat', -12 + i * 11, pz - 4 + i * 3, { r: i, det: 1, y: 0.05 }));
    // kiosco de nieves y pérgola
    P.push(box(30, hz - 12, 4, 3, 2.6, 0xfff3e0));
    P.push({ k: 'awn', x: 30, z: hz - 10.6, y: 2.6, w: 4.6, d: 1.4, c: 0xec407a, c2: 0xffffff });
    P.push(sign(30, hz - 10.4, 1.9, 3.6, 0.55, 'Nieves del Lago', '#ad1457'));
    P.push({ k: 'slab', x: -32, z: hz - 14, y: 3, w: 8, d: 5, h: 0.25, c: 0x8d6e63 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.push(deco(-32 + sx * 3.6, hz - 14 + sz * 2.2, 0.25, 0.25, 3, 0x8d6e63, { det: 0 }));
    return { parts: P, points: { kiosk: [30, hz - 9.5] }, pond: { x: 0, z: pz, rx, rz } };
  },

  deportiva(site) {
    const P = [];
    const { hx, hz } = site;
    P.push(decal(0, 0, hx * 2, hz * 2, 0x8fb069));
    const fx = -16, fw = 58, fd = 38;
    P.push(decal(fx, 0, fw, fd, 0x4caf50, { y: 0.01 }));
    const L = (x, z, w, d) => P.push(decal(fx + x, z, w, d, 0xffffff, { y: 0.02 }));
    L(0, -fd / 2 + 1, fw - 2, 0.2); L(0, fd / 2 - 1, fw - 2, 0.2); L(-fw / 2 + 1, 0, 0.2, fd - 2); L(fw / 2 - 1, 0, 0.2, fd - 2); L(0, 0, 0.2, fd - 2);
    L(-fw / 2 + 7, 0, 0.2, 16); L(fw / 2 - 7, 0, 0.2, 16);
    for (const s of [-1, 1]) {
      const gx = fx + s * (fw / 2 - 1);
      P.push(deco(gx, -3.6, 0.15, 0.15, 2.4, 0xffffff, { det: 0 }));
      P.push(deco(gx, 3.6, 0.15, 0.15, 2.4, 0xffffff, { det: 0 }));
      P.push(deco(gx, 0, 0.15, 7.3, 0.15, 0xffffff, { y: 2.3, det: 0 }));
    }
    // gradas
    for (let i = 0; i < 4; i++) P.push(box(fx, -fd / 2 - 2.5 - i * 1.1, 30, 1.1, 0.5 + i * 0.5, 0x90a4ae));
    // canchas de básquet
    for (const sz of [-1, 1]) {
      const cz = sz * 9;
      P.push(decal(31, cz, 14, 16, 0xd8743c, { y: 0.01 }));
      P.push(decal(31, cz, 13, 0.2, 0xffffff, { y: 0.02 }));
      P.push(prop('hoop', 31 - 6.3, cz, { r: Math.PI / 2 }));
      P.push(prop('hoop', 31 + 6.3, cz, { r: -Math.PI / 2 }));
    }
    for (const [x, z] of [[-hx + 2, -hz + 2], [hx - 2, -hz + 2], [-hx + 2, hz - 2], [hx - 2, hz - 2]]) P.push(prop('floodlight', x, z, { col: 1 }));
    for (const x of [-40, -20, 0, 20, 40]) P.push(prop('round', x, hz - 2, { col: 1 }));
    return { parts: P, points: {} };
  },

  mirador() {
    const P = [];
    P.push(cyl(0, 0, -0.5, 15, 15, 0.8, 16, 0xcfc6b5, { col: 0 }));
    ring(P, 0, 0, 14.5, 14.5, 16, 'rail', 1.1, 0x5d4037, 12, { colH: 2.2 });
    P.push(prop('telescope', 6, -9, { r: Math.PI }));
    P.push(prop('telescope', -6, -9, { r: Math.PI }));
    for (const a of [-1.2, -0.4, 0.4, 1.2]) P.push(prop('bench', Math.sin(a + Math.PI) * 10, Math.cos(a + Math.PI) * 10, { r: a, det: 1 }));
    P.push(box(0, 6, 3, 0.6, 1.4, 0xb0a48f));
    P.push(sign(0, 6.32, 0.5, 2.8, 0.8, 'MIRADOR', '#3e2723'));
    for (const a of [0.9, 2.2, 3.5, 4.8]) P.push(prop('lampColonial', Math.sin(a) * 13, Math.cos(a) * 13));
    return { parts: P, points: {} };
  },

  faro() {
    const P = [];
    P.push(decal(0, 0, 32, 32, 0x9e9a8a));
    P.push(cyl(0, 0, 0, 3.3, 2.4, 18, 12, 0xfafafa, { col: 1 }));
    P.push(cyl(0, 0, 5, 3.08, 2.95, 2.2, 12, 0xd32f2f));
    P.push(cyl(0, 0, 11, 2.82, 2.7, 2.2, 12, 0xd32f2f));
    P.push(cyl(0, 0, 18, 3.1, 3.1, 0.4, 12, 0x37474f));
    P.push(cyl(0, 0, 18.4, 1.8, 1.8, 2.4, 10, 0xfff59d));
    P.push({ k: 'cone', x: 0, z: 0, y: 20.8, r: 2.3, h: 1.8, seg: 10, c: 0xc62828 });
    P.push(door(0, 3.25, 1.2, 2.2, 0x5d4037));
    P.push(box(-9, 5, 7, 6, 3.2, 0xf5f5f5));
    P.push({ k: 'gable', x: -9, z: 5, y: 3.2, w: 7, d: 6, rh: 1.6, c: 0xc62828, over: 0.3 });
    for (const [x, z, s] of [[8, 7, 1.4], [10, -4, 1.8], [-4, -10, 1.5], [6, -11, 1.1], [-11, -6, 1.3], [12, 3, 1]]) P.push(prop('rock', x, z, { sc: s, col: 1 }));
    return { parts: P, points: {} };
  },

  gasolinera(site) {
    const P = [];
    const brand = [[0xd32f2f, '#d32f2f'], [0x2e7d32, '#2e7d32'], [0x1565c0, '#1565c0']][site.brand || 0];
    P.push(decal(0, 0, site.hx * 2, site.hz * 2, 0x55595e));
    P.push({ k: 'slab', x: -3, z: 4, y: 5, w: 20, d: 10, h: 0.6, c: 0xf5f5f5 });
    P.push(deco(-3, 4, 20.1, 10.1, 0.35, brand[0], { y: 5.1, det: 0 }));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.push(box(-3 + sx * 8.5, 4 + sz * 3.5, 0.5, 0.5, 5, 0xdddddd));
    for (const sx of [-6, 0]) P.push(box(-3 + sx + 3, 4, 1.0, 0.7, 1.6, brand[0]));
    P.push(box(10, -6, 12, 8, 4, 0xf5f5f5));
    for (let i = 0; i < 3; i++) P.push(panel(i % 2 ? 'shopWindow2' : 'shopWindow', 6.2 + i * 2.6, -1.97, 0.4, 2.5, 2.4, { fc: 0x34495e }));
    P.push(door(14.2, -1.95, 1.6, 2.4, 0x263238, 0, { cell: 'doorGlass' }));
    P.push(sign(10, -1.85, 3.3, 9, 0.8, 'TIENDA 24 H', brand[1]));
    P.push(cyl(-15, 10, 0, 0.2, 0.2, 7, 6, 0x9e9e9e, { col: 1 }));
    P.push(sign(-15, 10.25, 6, 3.4, 1.6, site.name.replace('Gasolinera ', ''), brand[1]));
    return { parts: P, points: { shop: [10, 0] } };
  },

  super(site) {
    const P = [];
    const { hx, hz } = site;
    P.push(decal(0, 0, hx * 2, hz * 2, 0x50555b));
    for (let i = -5; i <= 5; i++) P.push(decal(i * 4.5, hz - 7, 0.15, 5, 0xffffff, { y: 0.01, det: 1 }));
    P.push(box(0, -7, hx * 2 - 6, 26, 8, 0xeee8dc));
    P.push(deco(0, -7, hx * 2 - 5.9, 26.1, 1.2, 0x2e7d32, { y: 6.8, det: 0 }));
    for (let i = 0; i < 6; i++) if (i !== 2 && i !== 3) P.push(panel(i % 2 ? 'shopWindow' : 'shopWindow2', -7.5 + i * 3, 6.03, 0.4, 2.9, 2.8, { fc: 0x2c3e50 }));
    P.push({ k: 'slab', x: 0, z: 8, y: 3.6, w: 14, d: 4, h: 0.3, c: 0x2e7d32 });
    P.push(door(0, 6.06, 4.4, 2.8, 0x1b1b1b, 0, { cell: 'doorGlass' }));
    P.push(sign(0, 6.12, 5.6, 16, 1.6, site.name.toUpperCase(), '#2e7d32'));
    P.push(prop('carts', 14, 10, { det: 1 }));
    return { parts: P, points: { door: [0, 9] } };
  },

  parque(site) {
    const P = [];
    const { hx, hz } = site;
    P.push(decal(0, 0, hx * 2, hz * 2, 0x67a64d));
    P.push(decal(0, 0, hx * 2, 3, 0xd8cba8, { y: 0.01 }));
    P.push(decal(0, 0, 3, hz * 2, 0xd8cba8, { y: 0.01 }));
    P.push(prop('fountainSmall', 0, 0, { col: 1 }));
    P.push(decal(-14, -12, 12, 9, 0xd7b98e, { y: 0.01 }));
    P.push(prop('swing', -16, -12, { col: 1 }));
    P.push(prop('slide', -10, -12, { col: 1 }));
    for (const [x, z] of [[-22, 10], [-10, 18], [12, 16], [22, 6], [20, -14], [8, -18], [-24, -2], [25, 18]]) P.push(prop(x % 3 ? 'jacaranda' : 'round', x, z, { col: 1, sc: 1.15 }));
    for (const [x, z, r] of [[6, 3, Math.PI], [-6, -3, 0], [3, 8, -Math.PI / 2]]) P.push(prop('bench', x, z, { r, det: 1 }));
    P.push(prop('lampColonial', 4, 4)); P.push(prop('lampColonial', -4, -4));
    return { parts: P, points: {} };
  },

  plazuela(site) {
    const P = [];
    const { hx, hz } = site;
    P.push(decal(0, 0, hx * 2, hz * 2, 0xb8b0a2));
    P.push(decal(-6, 0, 14, 12, 0x3f7fbf, { y: 0.01 }));
    P.push(decal(-6, 0, 13, 0.15, 0xffffff, { y: 0.02 }));
    P.push(prop('hoop', -12.5, 0, { r: Math.PI / 2 }));
    P.push(prop('hoop', 0.5, 0, { r: -Math.PI / 2 }));
    for (const [x, z] of [[12, -10], [14, 8], [-16, 12], [-16, -12], [6, 12]]) P.push(prop('round', x, z, { col: 1 }));
    P.push(prop('bench', 10, 0, { r: -Math.PI / 2, det: 1 }));
    P.push(box(12, -2, 2.2, 1.6, 2.2, 0xffcc80));
    P.push({ k: 'awn', x: 12, z: -0.8, y: 2.2, w: 2.8, d: 1.2, c: 0xfdd835, c2: 0xe53935 });
    P.push(sign(12, -0.6, 1.5, 2.6, 0.45, 'Elotes Don Pepe', '#e65100'));
    return { parts: P, points: { stand: [12, 1.2] } };
  },
};
