// Malla del personaje humano: low-poly estilizado con proporciones reales.
// Se construye por "secciones" (anillos elípticos) unidas con sombreado suave, más piezas de
// caras planas (manos, tenis, nariz, orejas, ojos, pelo). Cada vértice va pegado a 1 o 2 huesos
// (mezcla en codos, rodillas, hombros y cuello) para que las animaciones existentes funcionen igual.
//
// Huesos (índices de character.js): 0 cadera, 1 columna, 2 pecho, 3 cuello, 4 cabeza,
// 5 brazoI, 6 antebrazoI, 7 brazoD, 8 antebrazoD, 9 musloI, 10 piernaI, 11 musloD, 12 piernaD.
// "I" (izquierda) está en +X. El personaje mira hacia +Z.

import * as THREE from 'three';

const HIPS = 0, SPINE = 1, CHEST = 2, NECK = 3, HEAD = 4;

function lin(hex) {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}
function shade(hex, f) {
  const r = Math.min(255, ((hex >> 16) & 255) * f) | 0, g = Math.min(255, ((hex >> 8) & 255) * f) | 0, b = Math.min(255, (hex & 255) * f) | 0;
  return (r << 16) | (g << 8) | b;
}

class MeshBuilder {
  constructor() { this.P = []; this.N = []; this.C = []; this.SI = []; this.SW = []; this.I = []; }
  get count() { return this.P.length / 3; }

  vert(p, n, hex, bw) {
    const i = this.count;
    this.P.push(p[0], p[1], p[2]);
    this.N.push(n[0], n[1], n[2]);
    const c = lin(hex);
    this.C.push(c[0], c[1], c[2]);
    const b0 = bw[0], b1 = bw[1] || [b0[0], 0];
    const tot = b0[1] + b1[1] || 1;
    this.SI.push(b0[0], b1[0], 0, 0);
    this.SW.push(b0[1] / tot, b1[1] / tot, 0, 0);
    return i;
  }

  // Sección suave: anillos {y, x, z, rx, rz, col, bw, dy(a)} con 'seg' lados
  loft(rings, seg, opts = {}) {
    const start = this.count;
    const rows = [];
    const ph = opts.phase ?? Math.PI / seg;
    for (const r of rings) {
      const row = [];
      for (let k = 0; k < seg; k++) {
        const a = (k / seg) * Math.PI * 2 + ph;
        const sx = Math.sin(a), cz = Math.cos(a);
        const pinch = r.flatBack && cz < 0 ? 0.85 : 1;
        const p = [r.x + sx * r.rx, r.y + (r.dy ? r.dy(a) : 0), r.z + cz * r.rz * pinch];
        row.push(this.vert(p, [0, 0, 0], typeof r.col === 'function' ? r.col(a) : r.col, r.bw));
      }
      rows.push(row);
    }
    const tris = [];
    const P = this.P;
    const ctr = (i) => [rings[i].x, rings[i].y, rings[i].z];
    // orienta cada triángulo hacia fuera (sirve para secciones que suben o bajan)
    const push = (t, ref) => {
      const n = this.faceN(t[0], t[1], t[2]);
      const m = [0, 1, 2].map((q) => (P[t[0] * 3 + q] + P[t[1] * 3 + q] + P[t[2] * 3 + q]) / 3 - ref[q]);
      tris.push(n[0] * m[0] + n[1] * m[1] + n[2] * m[2] < 0 ? [t[0], t[2], t[1]] : t);
    };
    for (let i = 0; i < rows.length - 1; i++) {
      const c0 = ctr(i), c1 = ctr(i + 1), ref = [(c0[0] + c1[0]) / 2, (c0[1] + c1[1]) / 2, (c0[2] + c1[2]) / 2];
      for (let k = 0; k < seg; k++) {
        const a = rows[i][k], b = rows[i][(k + 1) % seg], c = rows[i + 1][(k + 1) % seg], d = rows[i + 1][k];
        push([a, b, c], ref); push([a, c, d], ref);
      }
    }
    const capV = (ring, row, nb, dir) => {
      const r = rings[ring];
      const c = this.vert([r.x, r.y + dir, r.z], [0, 0, 0], typeof r.col === 'function' ? r.col(0) : r.col, r.bw);
      const ref = ctr(nb);
      for (let k = 0; k < seg; k++) push([c, row[k], row[(k + 1) % seg]], ref);
    };
    const asc = rings[rings.length - 1].y >= rings[0].y ? 1 : -1;
    if (opts.capBottom) capV(0, rows[0], 1, -asc * (opts.capBotY ?? 0));
    if (opts.capTop) capV(rings.length - 1, rows[rows.length - 1], rings.length - 2, asc * (opts.capTopY ?? 0));
    // normales suaves
    const acc = new Float32Array((this.count - start) * 3);
    for (const [a, b, c] of tris) {
      this.I.push(a, b, c);
      const n = this.faceN(a, b, c);
      for (const v of [a, b, c]) { const o = (v - start) * 3; acc[o] += n[0]; acc[o + 1] += n[1]; acc[o + 2] += n[2]; }
    }
    for (let v = start; v < this.count; v++) {
      const o = (v - start) * 3;
      const l = Math.hypot(acc[o], acc[o + 1], acc[o + 2]) || 1;
      this.N[v * 3] = acc[o] / l; this.N[v * 3 + 1] = acc[o + 1] / l; this.N[v * 3 + 2] = acc[o + 2] / l;
    }
    return rows;
  }

  faceN(a, b, c) {
    const P = this.P;
    const e1 = [P[b * 3] - P[a * 3], P[b * 3 + 1] - P[a * 3 + 1], P[b * 3 + 2] - P[a * 3 + 2]];
    const e2 = [P[c * 3] - P[a * 3], P[c * 3 + 1] - P[a * 3 + 1], P[c * 3 + 2] - P[a * 3 + 2]];
    return [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  }

  // Triángulo de caras planas; 'out' = punto de referencia hacia dentro (se orienta hacia fuera)
  ftri(a, b, c, hex, bw, inside) {
    let n = cross(sub(b, a), sub(c, a));
    if (inside) {
      const m = [(a[0] + b[0] + c[0]) / 3 - inside[0], (a[1] + b[1] + c[1]) / 3 - inside[1], (a[2] + b[2] + c[2]) / 3 - inside[2]];
      if (dot(n, m) < 0) { const t = b; b = c; c = t; n = [-n[0], -n[1], -n[2]]; }
    }
    const l = Math.hypot(...n) || 1; n = n.map((v) => v / l);
    const i = this.vert(a, n, hex, bw), j = this.vert(b, n, hex, bw), k = this.vert(c, n, hex, bw);
    this.I.push(i, j, k);
  }
  fquad(a, b, c, d, hex, bw, inside) { this.ftri(a, b, c, hex, bw, inside); this.ftri(a, c, d, hex, bw, inside); }

  // Caja deformada de 8 esquinas: abajo (-x-z, +x-z, +x+z, -x+z) y arriba igual
  hexa(v, hex, bw, cols = null) {
    const ctr = v.reduce((s, p) => [s[0] + p[0] / 8, s[1] + p[1] / 8, s[2] + p[2] / 8], [0, 0, 0]);
    const F = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
    F.forEach((f, i) => this.fquad(v[f[0]], v[f[1]], v[f[2]], v[f[3]], cols ? cols[i] : hex, bw, ctr));
  }

  // Lámina plana sobre la cara (ojos, cejas, boca) mirando hacia n
  decal(cx, cy, cz, w, h, n, hex, bw, tilt = 0) {
    const up = [0, 1, 0];
    let rt = cross(up, n); const l = Math.hypot(...rt) || 1; rt = rt.map((v) => v / l);
    const u2 = cross(n, rt);
    const ct = Math.cos(tilt), st = Math.sin(tilt);
    const R = [rt[0] * ct + u2[0] * st, rt[1] * ct + u2[1] * st, rt[2] * ct + u2[2] * st];
    const U = [u2[0] * ct - rt[0] * st, u2[1] * ct - rt[1] * st, u2[2] * ct - rt[2] * st];
    const P = (sx, sy) => [cx + R[0] * sx * w / 2 + U[0] * sy * h / 2, cy + R[1] * sx * w / 2 + U[1] * sy * h / 2, cz + R[2] * sx * w / 2 + U[2] * sy * h / 2];
    const a = P(-1, -1), b = P(1, -1), c = P(1, 1), d = P(-1, 1);
    const i = this.vert(a, n, hex, bw), j = this.vert(b, n, hex, bw), k = this.vert(c, n, hex, bw), m = this.vert(d, n, hex, bw);
    this.I.push(i, j, k, i, k, m);
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.SI, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.SW, 4));
    g.setIndex(new THREE.Uint16BufferAttribute(this.I, 1));
    g.computeBoundingSphere();
    return g;
  }
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };

// ------------------------------------------------------------
// Persona: skin, hair, shirt, pants, shoes (colores) + estilo de pelo
// ------------------------------------------------------------
export function buildHuman(o) {
  const M = new MeshBuilder();
  const { skin, hair, shirt, pants, shoes = 0xf2f2f0, hairStyle = 0 } = o;
  const skinD = shade(skin, 0.86), shirtD = shade(shirt, 0.82), pantsD = shade(pants, 0.8);
  const b = (i, w = 1) => [i, w];

  // ---------- jeans: cadera ----------
  M.loft([
    { y: 0.80, x: 0, z: 0, rx: 0.15, rz: 0.095, col: pantsD, bw: [b(HIPS)] },
    { y: 0.88, x: 0, z: 0, rx: 0.168, rz: 0.108, col: pants, bw: [b(HIPS)] },
    { y: 0.97, x: 0, z: 0.003, rx: 0.165, rz: 0.104, col: pants, bw: [b(HIPS)] },
    { y: 1.0, x: 0, z: 0.003, rx: 0.16, rz: 0.1, col: 0x2a2420, bw: [b(HIPS)] },
  ], 12, { capBottom: true, capBotY: 0.03 });
  // cinturón con hebilla
  M.decal(0, 0.975, 0.11, 0.05, 0.035, [0, 0, 1], 0xb8a46a, [b(HIPS)]);

  // ---------- piernas (jeans) y tenis ----------
  for (const [sx, TH, SH] of [[1, 9, 10], [-1, 11, 12]]) {
    const x = 0.088 * sx;
    M.loft([
      { y: 0.93, x: x * 0.95, z: 0.0, rx: 0.088, rz: 0.095, col: pants, bw: [b(TH)] },
      { y: 0.78, x, z: 0.005, rx: 0.08, rz: 0.088, col: pants, bw: [b(TH)] },
      { y: 0.62, x, z: 0.01, rx: 0.068, rz: 0.074, col: pants, bw: [b(TH)] },
      { y: 0.5, x, z: 0.012, rx: 0.06, rz: 0.064, col: pantsD, bw: [b(TH, 0.5), b(SH, 0.5)] },
      { y: 0.42, x, z: 0.0, rx: 0.058, rz: 0.062, col: pants, bw: [b(SH)] },
      { y: 0.26, x, z: -0.01, rx: 0.054, rz: 0.058, col: pants, bw: [b(SH)] },
      { y: 0.13, x, z: 0.0, rx: 0.058, rz: 0.062, col: pantsD, bw: [b(SH)] },
    ], 10, { capBottom: true });
    // tenis: suela blanca, empeine claro, puntera redondeada y franja de color
    const sb = [b(SH)];
    const z0 = -0.075, z1 = 0.19, w = 0.058;
    M.hexa([[x - w, 0, z0], [x + w, 0, z0], [x + w * 0.95, 0, z1], [x - w * 0.95, 0, z1], [x - w, 0.035, z0], [x + w, 0.035, z0], [x + w * 0.95, 0.035, z1], [x - w * 0.95, 0.035, z1]], 0xf7f7f5, sb);
    M.hexa([[x - w * 0.95, 0.035, z0 + 0.01], [x + w * 0.95, 0.035, z0 + 0.01], [x + w * 0.9, 0.035, z1 - 0.015], [x - w * 0.9, 0.035, z1 - 0.015], [x - w * 0.85, 0.125, z0 + 0.015], [x + w * 0.85, 0.125, z0 + 0.015], [x + w * 0.6, 0.075, z1 - 0.04], [x - w * 0.6, 0.075, z1 - 0.04]], shoes, sb,
      [shoes, shoes, shade(shoes, 0.92), shade(shoes, 0.9), shoes, shade(shoes, 0.9)]);
    M.decal(x + sx * w * 0.93, 0.07, 0.055, 0.12, 0.03, [sx, 0, 0], 0x9aa3ab, sb, sx * 0.25);  // logo lateral
    M.decal(x, 0.104, 0.098, 0.07, 0.06, norm([0, 0.8, 0.6]), 0xe2e2e0, sb);                     // lengüeta
  }

  // ---------- camiseta (torso) ----------
  M.loft([
    { y: 0.93, x: 0, z: 0.002, rx: 0.172, rz: 0.11, col: shirtD, bw: [b(HIPS)] },
    { y: 1.04, x: 0, z: 0.0, rx: 0.164, rz: 0.104, col: shirt, bw: [b(SPINE)] },
    { y: 1.16, x: 0, z: 0.004, rx: 0.17, rz: 0.108, col: shirt, bw: [b(SPINE, 0.6), b(CHEST, 0.4)] },
    { y: 1.28, x: 0, z: 0.012, rx: 0.192, rz: 0.122, col: shirt, bw: [b(CHEST)] },
    { y: 1.38, x: 0, z: 0.012, rx: 0.212, rz: 0.122, col: shirt, bw: [b(CHEST)] },
    { y: 1.45, x: 0, z: 0.0, rx: 0.212, rz: 0.108, col: shirt, bw: [b(CHEST)] },
    { y: 1.5, x: 0, z: -0.004, rx: 0.13, rz: 0.085, col: shirt, bw: [b(CHEST)] },
    { y: 1.548, x: 0, z: 0.0, rx: 0.074, rz: 0.068, col: shirtD, bw: [b(CHEST, 0.5), b(NECK, 0.5)] },
  ], 12);

  // ---------- cuello y cabeza ----------
  M.loft([
    { y: 1.5, x: 0, z: 0.0, rx: 0.064, rz: 0.06, col: skinD, bw: [b(NECK)] },
    { y: 1.6, x: 0, z: 0.0, rx: 0.06, rz: 0.057, col: skin, bw: [b(NECK, 0.5), b(HEAD, 0.5)] },
    { y: 1.64, x: 0, z: 0.0, rx: 0.058, rz: 0.056, col: skin, bw: [b(HEAD)] },
  ], 8);
  const hb = [b(HEAD)];
  // cráneo y cara: mandíbula marcada, pómulos y frente
  M.loft([
    { y: 1.6, x: 0, z: 0.042, rx: 0.056, rz: 0.042, col: skinD, bw: hb },
    { y: 1.625, x: 0, z: 0.028, rx: 0.08, rz: 0.074, col: skin, bw: hb },
    { y: 1.665, x: 0, z: 0.014, rx: 0.091, rz: 0.096, col: skin, bw: hb, flatBack: true },
    { y: 1.715, x: 0, z: 0.008, rx: 0.094, rz: 0.106, col: skin, bw: hb },
    { y: 1.765, x: 0, z: 0.004, rx: 0.095, rz: 0.11, col: skin, bw: hb },
    { y: 1.815, x: 0, z: 0.0, rx: 0.09, rz: 0.106, col: skin, bw: hb },
    { y: 1.855, x: 0, z: -0.004, rx: 0.074, rz: 0.09, col: skin, bw: hb },
    { y: 1.878, x: 0, z: -0.006, rx: 0.04, rz: 0.05, col: skin, bw: hb },
  ], 12, { capTop: true, capTopY: 0.004, capBottom: true });
  // nariz (cuña)
  const nz = 0.104;
  M.hexa([[-0.015, 1.695, nz], [0.015, 1.695, nz], [0.01, 1.697, nz + 0.019], [-0.01, 1.697, nz + 0.019], [-0.008, 1.735, nz - 0.002], [0.008, 1.735, nz - 0.002], [0.004, 1.73, nz + 0.008], [-0.004, 1.73, nz + 0.008]], shade(skin, 0.97), hb);
  // orejas
  for (const sx of [1, -1]) M.hexa([[sx * 0.09, 1.69, -0.005], [sx * 0.104, 1.69, -0.012], [sx * 0.104, 1.69, 0.016], [sx * 0.09, 1.69, 0.02], [sx * 0.09, 1.755, -0.012], [sx * 0.106, 1.76, -0.02], [sx * 0.106, 1.76, 0.012], [sx * 0.09, 1.755, 0.016]], skinD, hb);
  // ojos (blanco + iris + brillo), cejas y boca
  for (const sx of [1, -1]) {
    const ex = sx * 0.037, ey = 1.732, ez = 0.1035;
    const n = norm([sx * 0.32, 0.02, 1]);
    M.decal(ex, ey, ez, 0.03, 0.016, n, 0xf4f1ea, hb);
    M.decal(ex - sx * 0.002, ey - 0.001, ez + 0.0015, 0.015, 0.015, n, 0x3b2a1e, hb);
    M.decal(ex - sx * 0.002, ey - 0.001, ez + 0.0025, 0.008, 0.008, n, 0x0d0d0d, hb);
    M.decal(ex - sx * 0.006, ey + 0.004, ez + 0.003, 0.004, 0.004, n, 0xffffff, hb);
    M.decal(ex + sx * 0.002, ey + 0.021, ez + 0.002, 0.036, 0.009, norm([sx * 0.3, 0.25, 1]), shade(hair, 0.9), hb, -sx * 0.12);
    M.decal(ex, ey - 0.012, ez - 0.001, 0.028, 0.006, n, skinD, hb);          // ojera suave
  }
  M.decal(0, 1.663, 0.1, 0.038, 0.009, [0, -0.1, 1], shade(skin, 0.68), hb);   // boca
  M.decal(0, 1.652, 0.098, 0.026, 0.006, [0, -0.3, 1], shade(skin, 0.92), hb); // labio inferior

  // ---------- pelo corto con volumen y mechones ----------
  const hr = [b(HEAD)];
  const hairC = (a) => (Math.cos(a) > 0.5 ? hair : shade(hair, 0.9));
  // nuca baja, frente alta (la línea del pelo sube al frente)
  const line = (lo, hi) => (a) => lo + (hi - lo) * Math.max(0, Math.cos(a)) ** 1.5;
  M.loft([
    { y: 1.735, x: 0, z: -0.004, rx: 0.1, rz: 0.114, col: hairC, bw: hr, dy: line(-0.05, 0.062) },
    { y: 1.8, x: 0, z: -0.002, rx: 0.103, rz: 0.12, col: hairC, bw: hr, dy: line(0, 0.03) },
    { y: 1.85, x: 0, z: 0.002, rx: 0.095, rz: 0.115, col: hair, bw: hr },
    { y: 1.885, x: 0, z: 0.006, rx: 0.07, rz: 0.088, col: hair, bw: hr },
    { y: 1.9, x: 0, z: 0.008, rx: 0.028, rz: 0.04, col: hair, bw: hr },
  ], 12, { capTop: true });
  // mechones (picos) arriba y al frente
  // mechones: picos cortos peinados hacia arriba y al frente (volumen como en la referencia)
  const tufts = hairStyle === 1
    ? [[0, 1.875, 0.075, 0.03], [0.035, 1.872, 0.06, 0.026], [-0.035, 1.872, 0.06, 0.026], [0.0, 1.895, 0.02, 0.026]]
    : [[0, 1.865, 0.095, 0.026], [0.032, 1.862, 0.088, 0.022], [-0.032, 1.862, 0.088, 0.022], [0.055, 1.875, 0.045, 0.024], [-0.055, 1.875, 0.045, 0.024], [0.015, 1.895, 0.04, 0.026], [-0.02, 1.893, 0.0, 0.024], [0.03, 1.888, -0.04, 0.022]];
  for (const [tx, ty, tz, s] of tufts) {
    const tip = [tx * 1.1, ty + s * 0.75, tz + s * 0.9];
    const base = [[tx - s, ty - s * 0.25, tz - s * 0.6], [tx + s, ty - s * 0.25, tz - s * 0.6], [tx, ty - s * 0.3, tz + s * 0.5]];
    const inside = [tx, ty - s, tz - s * 0.3];
    for (let i = 0; i < 3; i++) M.ftri(base[i], base[(i + 1) % 3], tip, i === 2 ? shade(hair, 1.2) : hair, hr, inside);
  }
  // patillas
  for (const sx of [1, -1]) M.hexa([[sx * 0.091, 1.72, 0.03], [sx * 0.097, 1.72, 0.03], [sx * 0.097, 1.72, 0.045], [sx * 0.092, 1.72, 0.045], [sx * 0.094, 1.77, 0.025], [sx * 0.101, 1.77, 0.025], [sx * 0.101, 1.77, 0.052], [sx * 0.095, 1.77, 0.052]], hair, hr);

  // ---------- brazos: manga, brazo, antebrazo y mano ----------
  for (const [sx, UA, FA] of [[1, 5, 6], [-1, 7, 8]]) {
    const x = 0.245 * sx;
    // hombro + manga corta
    M.loft([
      { y: 1.49, x: x - sx * 0.04, z: 0.0, rx: 0.04, rz: 0.05, col: shirt, bw: [b(CHEST, 0.5), b(UA, 0.5)] },
      { y: 1.455, x: x - sx * 0.01, z: 0.0, rx: 0.06, rz: 0.062, col: shirt, bw: [b(UA)] },
      { y: 1.38, x, z: 0.0, rx: 0.06, rz: 0.06, col: shirt, bw: [b(UA)] },
      { y: 1.29, x, z: 0.0, rx: 0.059, rz: 0.058, col: shirtD, bw: [b(UA)] },
    ], 8, { capTop: true, capBottom: true, capBotY: 0.005 });
    // brazo de piel
    M.loft([
      { y: 1.34, x, z: 0.0, rx: 0.046, rz: 0.048, col: skin, bw: [b(UA)] },
      { y: 1.24, x, z: 0.0, rx: 0.044, rz: 0.046, col: skin, bw: [b(UA)] },
      { y: 1.17, x, z: -0.004, rx: 0.04, rz: 0.042, col: skinD, bw: [b(UA, 0.5), b(FA, 0.5)] },
      { y: 1.11, x, z: 0.0, rx: 0.042, rz: 0.043, col: skin, bw: [b(FA)] },
      { y: 1.0, x, z: 0.004, rx: 0.034, rz: 0.036, col: skin, bw: [b(FA)] },
      { y: 0.935, x, z: 0.004, rx: 0.028, rz: 0.03, col: skin, bw: [b(FA)] },
    ], 8);
    // mano: palma + dedos juntos + pulgar
    const fb = [b(FA)];
    const hx = x, hy = 0.935;
    M.hexa([[hx - 0.022, hy - 0.085, -0.03], [hx + 0.022, hy - 0.085, -0.03], [hx + 0.022, hy - 0.085, 0.03], [hx - 0.022, hy - 0.085, 0.03], [hx - 0.026, hy + 0.005, -0.034], [hx + 0.026, hy + 0.005, -0.034], [hx + 0.026, hy + 0.005, 0.036], [hx - 0.026, hy + 0.005, 0.036]], skin, fb);
    M.hexa([[hx - 0.018, hy - 0.15, -0.024], [hx + 0.016, hy - 0.15, -0.024], [hx + 0.016, hy - 0.15, 0.022], [hx - 0.018, hy - 0.15, 0.022], [hx - 0.02, hy - 0.085, -0.028], [hx + 0.02, hy - 0.085, -0.028], [hx + 0.02, hy - 0.085, 0.028], [hx - 0.02, hy - 0.085, 0.028]], shade(skin, 0.95), fb);
    M.hexa([[hx - sx * 0.002, hy - 0.06, 0.03], [hx - sx * 0.002 - sx * 0.018, hy - 0.06, 0.03], [hx - sx * 0.022, hy - 0.06, 0.05], [hx - sx * 0.002, hy - 0.06, 0.05], [hx, hy - 0.02, 0.03], [hx - sx * 0.02, hy - 0.02, 0.03], [hx - sx * 0.02, hy - 0.02, 0.048], [hx, hy - 0.02, 0.048]], skinD, fb);
  }
  return M.build();
}
