// Constructor de geometría low-poly.
// Junta muchas piezas en UN solo BufferGeometry (una sola llamada de dibujo), clave del
// rendimiento en celulares. Soporta un "marco" local (posición + giro en Y) para construir
// edificios girados con coordenadas locales.

import * as THREE from 'three';

const colorCache = new Map();
const tmpColor = new THREE.Color();
export function lin(hex) {
  let c = colorCache.get(hex);
  if (!c) {
    tmpColor.set(hex); // sRGB -> lineal
    c = [tmpColor.r, tmpColor.g, tmpColor.b];
    colorCache.set(hex, c);
  }
  return c;
}

// Color "luz": valores mayores que 1. De día se ve como un color claro saturado; de noche el
// material de la ciudad lo hace brillar (focos, faroles, semáforos).
export function glow(hex, k = 2.6) { return lin(hex).map((v) => v * k); }

export function mixHex(a, b, t) {
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * t);
  const g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * t);
  const bl = (a & 255) + (((b & 255) - (a & 255)) * t);
  return ((r | 0) << 16) | ((g | 0) << 8) | (bl | 0);
}

export function shade(hex, f) {
  const r = Math.min(255, ((hex >> 16) & 255) * f) | 0, g = Math.min(255, ((hex >> 8) & 255) * f) | 0, b = Math.min(255, (hex & 255) * f) | 0;
  return (r << 16) | (g << 8) | b;
}

// Búfer de floats que crece (evita millones de arrays temporales)
class FBuf {
  constructor(n = 4096) { this.a = new Float32Array(n); this.n = 0; }
  ensure(k) { if (this.n + k > this.a.length) { const b = new Float32Array(Math.max(this.a.length * 2, this.n + k)); b.set(this.a.subarray(0, this.n)); this.a = b; } }
  view() { return this.a.slice(0, this.n); }
}

export class GeoBuilder {
  constructor(withUV = false) {
    this.P = new FBuf(); this.N = new FBuf(); this.C = new FBuf(); this.U = withUV ? new FBuf(2730) : null;
    this.fr = null; // marco local {x,y,z,c,s}
  }

  get vertexCount() { return this.P.n / 3; }

  setFrame(x, y, z, rot) { this.fr = { x, y, z, c: Math.cos(rot), s: Math.sin(rot) }; }
  clearFrame() { this.fr = null; }

  vert(x, y, z, nx, ny, nz, col, u, v) {
    const f = this.fr;
    if (f) {
      const X = f.x + x * f.c + z * f.s, Z = f.z - x * f.s + z * f.c;
      const NX = nx * f.c + nz * f.s, NZ = -nx * f.s + nz * f.c;
      x = X; z = Z; y += f.y; nx = NX; nz = NZ;
    }
    const P = this.P, N = this.N, C = this.C;
    P.ensure(3); N.ensure(3); C.ensure(3);
    P.a[P.n++] = x; P.a[P.n++] = y; P.a[P.n++] = z;
    N.a[N.n++] = nx; N.a[N.n++] = ny; N.a[N.n++] = nz;
    C.a[C.n++] = col[0]; C.a[C.n++] = col[1]; C.a[C.n++] = col[2];
    if (this.U) { this.U.ensure(2); this.U.a[this.U.n++] = u || 0; this.U.a[this.U.n++] = v || 0; }
  }

  // Cuadrilátero: esquinas inf-izq, inf-der, sup-der, sup-izq (vistas desde fuera); se auto-orienta
  quad(a, b, c, d, nrm, hex, uvs) {
    const col = typeof hex === 'number' ? lin(hex) : hex;
    const e1x = b[0] - a[0], e1y = b[1] - a[1], e1z = b[2] - a[2];
    const e2x = d[0] - a[0], e2y = d[1] - a[1], e2z = d[2] - a[2];
    const cx = e1y * e2z - e1z * e2y, cy = e1z * e2x - e1x * e2z, cz = e1x * e2y - e1y * e2x;
    if (cx * nrm[0] + cy * nrm[1] + cz * nrm[2] < 0) { let t = a; a = b; b = t; t = c; c = d; d = t; if (uvs) uvs = [uvs[1], uvs[0], uvs[3], uvs[2]]; }
    const len = Math.hypot(nrm[0], nrm[1], nrm[2]) || 1;
    const nx = nrm[0] / len, ny = nrm[1] / len, nz = nrm[2] / len;
    const U = uvs || Z4;
    this.vert(a[0], a[1], a[2], nx, ny, nz, col, U[0][0], U[0][1]);
    this.vert(b[0], b[1], b[2], nx, ny, nz, col, U[1][0], U[1][1]);
    this.vert(c[0], c[1], c[2], nx, ny, nz, col, U[2][0], U[2][1]);
    this.vert(a[0], a[1], a[2], nx, ny, nz, col, U[0][0], U[0][1]);
    this.vert(c[0], c[1], c[2], nx, ny, nz, col, U[2][0], U[2][1]);
    this.vert(d[0], d[1], d[2], nx, ny, nz, col, U[3][0], U[3][1]);
  }

  // Cuadrilátero con color por vértice (degradados: sombra al pie de los muros, follaje, vidrio)
  quadC(a, b, c, d, nrm, cols, uvs) {
    const C = cols.map((h) => (typeof h === 'number' ? lin(h) : h));
    const e1x = b[0] - a[0], e1y = b[1] - a[1], e1z = b[2] - a[2];
    const e2x = d[0] - a[0], e2y = d[1] - a[1], e2z = d[2] - a[2];
    const cx = e1y * e2z - e1z * e2y, cy = e1z * e2x - e1x * e2z, cz = e1x * e2y - e1y * e2x;
    let A = a, Bv = b, Cv = c, D = d, ca = C[0], cb = C[1], cc = C[2], cd = C[3], U = uvs || Z4;
    if (cx * nrm[0] + cy * nrm[1] + cz * nrm[2] < 0) { A = b; Bv = a; Cv = d; D = c; ca = C[1]; cb = C[0]; cc = C[3]; cd = C[2]; if (uvs) U = [uvs[1], uvs[0], uvs[3], uvs[2]]; }
    const len = Math.hypot(nrm[0], nrm[1], nrm[2]) || 1;
    const nx = nrm[0] / len, ny = nrm[1] / len, nz = nrm[2] / len;
    this.vert(A[0], A[1], A[2], nx, ny, nz, ca, U[0][0], U[0][1]);
    this.vert(Bv[0], Bv[1], Bv[2], nx, ny, nz, cb, U[1][0], U[1][1]);
    this.vert(Cv[0], Cv[1], Cv[2], nx, ny, nz, cc, U[2][0], U[2][1]);
    this.vert(A[0], A[1], A[2], nx, ny, nz, ca, U[0][0], U[0][1]);
    this.vert(Cv[0], Cv[1], Cv[2], nx, ny, nz, cc, U[2][0], U[2][1]);
    this.vert(D[0], D[1], D[2], nx, ny, nz, cd, U[3][0], U[3][1]);
  }

  // Rectángulo vertical texturizado del atlas: centro (x,z), ancho w, de y0 a y1, mirando hacia ry (0 = +Z)
  // uv = [u0, v0, u1, v1]; off = separación de la pared
  panel(x, z, y0, y1, w, ry, uv, hex = 0xffffff, off = 0.04) {
    const c = Math.cos(ry), s = Math.sin(ry);
    const fx = s, fz = c;                 // normal
    const ax = c, az = -s;                // eje a lo largo de la pared
    const cx = x + fx * off, cz = z + fz * off, hw = w / 2;
    this.quad([cx - ax * hw, y0, cz - az * hw], [cx + ax * hw, y0, cz + az * hw], [cx + ax * hw, y1, cz + az * hw], [cx - ax * hw, y1, cz - az * hw], [fx, 0, fz], hex,
      [[uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]]);
  }

  // Cuadrilátero visible por ambos lados (toldos, velas, banderines)
  quad2(a, b, c, d, nrm, hex) {
    this.quad(a, b, c, d, nrm, hex);
    this.quad(a, b, c, d, [-nrm[0], -nrm[1], -nrm[2]], hex);
  }

  tri(a, b, c, nrm, hex) {
    const col = typeof hex === 'number' ? lin(hex) : hex;
    const e1x = b[0] - a[0], e1y = b[1] - a[1], e1z = b[2] - a[2], e2x = c[0] - a[0], e2y = c[1] - a[1], e2z = c[2] - a[2];
    if ((e1y * e2z - e1z * e2y) * nrm[0] + (e1z * e2x - e1x * e2z) * nrm[1] + (e1x * e2y - e1y * e2x) * nrm[2] < 0) { const t = b; b = c; c = t; }
    const len = Math.hypot(nrm[0], nrm[1], nrm[2]) || 1;
    const nx = nrm[0] / len, ny = nrm[1] / len, nz = nrm[2] / len;
    this.vert(a[0], a[1], a[2], nx, ny, nz, col);
    this.vert(b[0], b[1], b[2], nx, ny, nz, col);
    this.vert(c[0], c[1], c[2], nx, ny, nz, col);
  }

  // Triángulo con normal y color por vértice (terreno suave). Se orienta hacia "up".
  triV(a, b, c, na, nb, nc, ca, cb, cc, up = [0, 1, 0]) {
    const e1x = b[0] - a[0], e1y = b[1] - a[1], e1z = b[2] - a[2], e2x = c[0] - a[0], e2y = c[1] - a[1], e2z = c[2] - a[2];
    if ((e1y * e2z - e1z * e2y) * up[0] + (e1z * e2x - e1x * e2z) * up[1] + (e1x * e2y - e1y * e2x) * up[2] < 0) { let t = b; b = c; c = t; t = nb; nb = nc; nc = t; t = cb; cb = cc; cc = t; }
    this.vert(a[0], a[1], a[2], na[0], na[1], na[2], ca);
    this.vert(b[0], b[1], b[2], nb[0], nb[1], nb[2], cb);
    this.vert(c[0], c[1], c[2], nc[0], nc[1], nc[2], cc);
  }

  // Caja alineada (en el marco actual). opts: { top, bottom, noTop, win:{sx,sy,v0} }
  box(x0, y0, z0, x1, y1, z1, hex, opts = {}) {
    const top = opts.top ?? hex;
    const win = opts.win;
    const v0 = win ? (win.v0 || 0) : 0;
    const uv = (len, ya, yb) => (win ? [[0, (ya - v0) / win.sy * 0.25], [len / win.sx * 0.25, (ya - v0) / win.sy * 0.25], [len / win.sx * 0.25, (yb - v0) / win.sy * 0.25], [0, (yb - v0) / win.sy * 0.25]] : null);
    const wx = x1 - x0, wz = z1 - z0;
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], hex, uv(wx, y0, y1));
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], hex, uv(wx, y0, y1));
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], hex, uv(wz, y0, y1));
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], hex, uv(wz, y0, y1));
    if (!opts.noTop) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], top, null);
    if (opts.bottom) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], hex, null);
  }

  // Caja con oclusión ambiental falsa: los muros se oscurecen al pie (da peso y "contacto" con el suelo)
  // g = altura del suelo (por defecto y0), band = alto de la franja oscura
  boxAO(x0, y0, z0, x1, y1, z1, hex, opts = {}) {
    const top = opts.top ?? hex;
    const gy = opts.ground ?? y0, band = opts.band ?? 2.2;
    const dark = shade(hex, opts.ao ?? 0.68);
    const yb = Math.min(y1, gy + band);
    const faces = [
      [[x0, z1], [x1, z1], [0, 0, 1]], [[x1, z0], [x0, z0], [0, 0, -1]],
      [[x1, z1], [x1, z0], [1, 0, 0]], [[x0, z0], [x0, z1], [-1, 0, 0]],
    ];
    for (const [p, q, n] of faces) {
      if (yb > y0) {
        // franja inferior con degradado (bajo el suelo: oscuro)
        if (gy > y0) this.quad([p[0], y0, p[1]], [q[0], y0, q[1]], [q[0], gy, q[1]], [p[0], gy, p[1]], n, dark);
        const ya = Math.max(y0, gy);
        const mid = Math.min(1, (yb - ya) / band);
        const ct = mixHex(dark, hex, mid);
        this.quadC([p[0], ya, p[1]], [q[0], ya, q[1]], [q[0], yb, q[1]], [p[0], yb, p[1]], n, [dark, dark, ct, ct]);
      }
      if (y1 > yb) this.quad([p[0], yb, p[1]], [q[0], yb, q[1]], [q[0], y1, q[1]], [p[0], y1, p[1]], n, hex);
    }
    if (!opts.noTop) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], top);
  }

  // Masa de follaje low-poly (icosaedro deformado, caras planas, más claro arriba)
  blob(cx, cy, cz, rx, ry, rz, hex, seed = 1, opts = {}) {
    const t = 1.618;
    const V = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
    let r = seed * 9301 + 49297;
    const rnd = () => { r = (r * 233280 + 49297) % 233280; return r / 233280; };
    const jit = opts.jitter ?? 0.18;
    const P = V.map(([x, y, z]) => {
      const l = Math.hypot(x, y, z), k = 1 + (rnd() - 0.5) * 2 * jit;
      return [cx + (x / l) * rx * k, cy + (y / l) * ry * k * (y < 0 ? (opts.flatBottom ?? 0.7) : 1), cz + (z / l) * rz * k];
    });
    const F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    const top = opts.top ?? shade(hex, 1.18), bot = opts.bottom ?? shade(hex, 0.62);
    for (const [a, b, c] of F) {
      const A = P[a], Bp = P[b], Cp = P[c];
      const e1 = [Bp[0] - A[0], Bp[1] - A[1], Bp[2] - A[2]], e2 = [Cp[0] - A[0], Cp[1] - A[1], Cp[2] - A[2]];
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const nl = Math.hypot(...n) || 1;
      const ny = n[1] / nl;
      let col = ny > 0.35 ? mixHex(hex, top, (ny - 0.35) / 0.65) : mixHex(bot, hex, (ny + 1) / 1.35);
      col = shade(col, 0.92 + rnd() * 0.16);
      this.tri(A, Bp, Cp, n, col);
    }
  }

  // Tubo por una lista de puntos con radios (troncos curvos de palmera, ramas)
  tube(pts, radii, seg, cols) {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const L = Math.hypot(...d) || 1;
      const u = [d[0] / L, d[1] / L, d[2] / L];
      const ref = Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      let p = [u[1] * ref[2] - u[2] * ref[1], u[2] * ref[0] - u[0] * ref[2], u[0] * ref[1] - u[1] * ref[0]];
      const pl = Math.hypot(...p); p = p.map((v) => v / pl);
      const q = [u[1] * p[2] - u[2] * p[1], u[2] * p[0] - u[0] * p[2], u[0] * p[1] - u[1] * p[0]];
      const ring = (c, r, k) => { const an = (k / seg) * Math.PI * 2; return [c[0] + (p[0] * Math.cos(an) + q[0] * Math.sin(an)) * r, c[1] + (p[1] * Math.cos(an) + q[1] * Math.sin(an)) * r, c[2] + (p[2] * Math.cos(an) + q[2] * Math.sin(an)) * r]; };
      const col = Array.isArray(cols) ? cols[i % cols.length] : cols;
      for (let k = 0; k < seg; k++) {
        const a0 = ring(a, radii[i], k), a1 = ring(a, radii[i], k + 1), b1 = ring(b, radii[i + 1], k + 1), b0 = ring(b, radii[i + 1], k);
        const an = ((k + 0.5) / seg) * Math.PI * 2;
        const n = [p[0] * Math.cos(an) + q[0] * Math.sin(an), p[1] * Math.cos(an) + q[1] * Math.sin(an), p[2] * Math.cos(an) + q[2] * Math.sin(an)];
        this.quad(a0, a1, b1, b0, n, col);
      }
    }
  }

  // Caja centrada (cx,cz) con giro propio en Y
  boxR(cx, cy, cz, sx, sy, sz, ry, hex, opts = {}) {
    const c = Math.cos(ry), s = Math.sin(ry);
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const P = (x, y, z) => [cx + x * c + z * s, cy + y, cz - x * s + z * c];
    const N = (x, y, z) => [x * c + z * s, y, -x * s + z * c];
    const a = P(-hx, -hy, hz), b = P(hx, -hy, hz), cc = P(hx, hy, hz), d = P(-hx, hy, hz);
    const e = P(hx, -hy, -hz), f = P(-hx, -hy, -hz), g = P(-hx, hy, -hz), h = P(hx, hy, -hz);
    const top = opts.top ?? hex;
    this.quad(a, b, cc, d, N(0, 0, 1), hex);
    this.quad(e, f, g, h, N(0, 0, -1), hex);
    this.quad(b, e, h, cc, N(1, 0, 0), hex);
    this.quad(f, a, d, g, N(-1, 0, 0), hex);
    this.quad(d, cc, h, g, N(0, 1, 0), top);
    if (opts.bottom) this.quad(f, e, b, a, N(0, -1, 0), hex);
  }

  rectXZ(x0, z0, x1, z1, y, hex) { this.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 1, 0], hex); }

  // Rectángulo horizontal centrado y girado
  rectR(cx, cz, w, d, ry, y, hex) {
    const c = Math.cos(ry), s = Math.sin(ry), hx = w / 2, hz = d / 2;
    const P = (x, z) => [cx + x * c + z * s, y, cz - x * s + z * c];
    this.quad(P(-hx, hz), P(hx, hz), P(hx, -hz), P(-hx, -hz), [0, 1, 0], hex);
  }

  // Faldón de techo de la orilla (e0,e1) a la cumbrera (r0,r1). Con detalle: hileras de teja
  // (franjas de tono alterno) en lugar de una sola lámina plana.
  roofSlope(e0, e1, r0, r1, nrm, hex, rows) {
    if (rows <= 1) { this.quad(e0, e1, r1, r0, nrm, hex); return; }
    const L = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const alt = shade(hex, 0.9);
    for (let i = 0; i < rows; i++) {
      const t0 = i / rows, t1 = (i + 1) / rows;
      this.quad(L(e0, r0, t0), L(e1, r1, t0), L(e1, r1, t1), L(e0, r0, t1), nrm, i % 2 ? alt : hex);
    }
  }

  // Grosor del techo: frontis (orilla) y plafón (vista desde abajo), para que no parezca de papel
  roofEdge(x0, z0, x1, z1, y, hex) {
    const t = 0.2, f = shade(hex, 0.72);
    this.quad([x0, y - t, z1], [x1, y - t, z1], [x1, y, z1], [x0, y, z1], [0, 0, 1], f);
    this.quad([x1, y - t, z0], [x0, y - t, z0], [x0, y, z0], [x1, y, z0], [0, 0, -1], f);
    this.quad([x1, y - t, z1], [x1, y - t, z0], [x1, y, z0], [x1, y, z1], [1, 0, 0], f);
    this.quad([x0, y - t, z0], [x0, y - t, z1], [x0, y, z1], [x0, y, z0], [-1, 0, 0], f);
    this.quad([x0, y - t, z0], [x1, y - t, z0], [x1, y - t, z1], [x0, y - t, z1], [0, -1, 0], 0xe6e1d8);
  }

  // Techo a dos aguas (cumbrera en el eje más largo). detail: tejas, grosor y caballete
  gableRoof(x0, z0, x1, z1, y, rh, hex, over = 0.35, detail = false) {
    x0 -= over; z0 -= over; x1 += over; z1 += over;
    const top = y + rh;
    const rows = detail ? Math.max(2, Math.round(Math.hypot(rh, Math.min(x1 - x0, z1 - z0) / 2) / 0.45)) : 1;
    if (detail) this.roofEdge(x0, z0, x1, z1, y, hex);
    if (x1 - x0 >= z1 - z0) {
      const cz = (z0 + z1) / 2;
      this.roofSlope([x1, y, z0], [x0, y, z0], [x1, top, cz], [x0, top, cz], [0, (z1 - z0) / 2, -rh], hex, rows);
      this.roofSlope([x0, y, z1], [x1, y, z1], [x0, top, cz], [x1, top, cz], [0, (z1 - z0) / 2, rh], hex, rows);
      this.tri([x0 + over, y, z0 + over], [x0 + over, y, z1 - over], [x0 + over, top, cz], [-1, 0, 0], hex);
      this.tri([x1 - over, y, z1 - over], [x1 - over, y, z0 + over], [x1 - over, top, cz], [1, 0, 0], hex);
      if (detail) this.box(x0, top - 0.06, cz - 0.14, x1, top + 0.1, cz + 0.14, shade(hex, 0.8));
    } else {
      const cx = (x0 + x1) / 2;
      this.roofSlope([x0, y, z0], [x0, y, z1], [cx, top, z0], [cx, top, z1], [-rh, (x1 - x0) / 2, 0], hex, rows);
      this.roofSlope([x1, y, z1], [x1, y, z0], [cx, top, z1], [cx, top, z0], [rh, (x1 - x0) / 2, 0], hex, rows);
      this.tri([x0 + over, y, z1 - over], [x1 - over, y, z1 - over], [cx, top, z1 - over], [0, 0, 1], hex);
      this.tri([x1 - over, y, z0 + over], [x0 + over, y, z0 + over], [cx, top, z0 + over], [0, 0, -1], hex);
      if (detail) this.box(cx - 0.14, top - 0.06, z0, cx + 0.14, top + 0.1, z1, shade(hex, 0.8));
    }
  }

  // Techo a cuatro aguas
  hipRoof(x0, z0, x1, z1, y, rh, hex, over = 0.35, detail = false) {
    x0 -= over; z0 -= over; x1 += over; z1 += over;
    const top = y + rh, w = x1 - x0, d = z1 - z0;
    const inset = Math.min(w, d) / 2;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    let r0, r1;
    if (w >= d) { r0 = [x0 + inset, top, cz]; r1 = [x1 - inset, top, cz]; } else { r0 = [cx, top, z0 + inset]; r1 = [cx, top, z1 - inset]; }
    const shade2 = shade(hex, 0.9);
    const rows = detail ? Math.max(2, Math.round(Math.hypot(rh, inset) / 0.45)) : 1;
    if (detail) this.roofEdge(x0, z0, x1, z1, y, hex);
    if (w >= d) {
      this.roofSlope([x1, y, z0], [x0, y, z0], r1, r0, [0, d / 2, -rh], hex, rows);
      this.roofSlope([x0, y, z1], [x1, y, z1], r0, r1, [0, d / 2, rh], hex, rows);
      this.roofSlope([x0, y, z0], [x0, y, z1], r0, r0, [-rh, w / 2, 0], shade2, rows);
      this.roofSlope([x1, y, z1], [x1, y, z0], r1, r1, [rh, w / 2, 0], shade2, rows);
      if (detail && r1[0] - r0[0] > 0.3) this.box(r0[0], top - 0.06, cz - 0.14, r1[0], top + 0.1, cz + 0.14, shade(hex, 0.8));
    } else {
      this.roofSlope([x0, y, z0], [x0, y, z1], r0, r1, [-rh, w / 2, 0], hex, rows);
      this.roofSlope([x1, y, z1], [x1, y, z0], r1, r0, [rh, w / 2, 0], hex, rows);
      this.roofSlope([x0, y, z1], [x1, y, z1], r1, r1, [0, d / 2, rh], shade2, rows);
      this.roofSlope([x1, y, z0], [x0, y, z0], r0, r0, [0, d / 2, -rh], shade2, rows);
      if (detail && r1[2] - r0[2] > 0.3) this.box(cx - 0.14, top - 0.06, r0[2], cx + 0.14, top + 0.1, r1[2], shade(hex, 0.8));
    }
  }

  // Cilindro / cono vertical (low-poly, sombreado plano). rx/rz permiten elipses
  cylinder(cx, cy, cz, rBot, rTop, h, seg, hex, opts = {}) {
    const topHex = opts.top ?? hex;
    const sx = opts.sx || 1, sz = opts.sz || 1;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2, am = (a0 + a1) / 2;
      const p0b = [cx + Math.sin(a0) * rBot * sx, cy, cz + Math.cos(a0) * rBot * sz];
      const p1b = [cx + Math.sin(a1) * rBot * sx, cy, cz + Math.cos(a1) * rBot * sz];
      const p1t = [cx + Math.sin(a1) * rTop * sx, cy + h, cz + Math.cos(a1) * rTop * sz];
      const p0t = [cx + Math.sin(a0) * rTop * sx, cy + h, cz + Math.cos(a0) * rTop * sz];
      const slope = (rBot - rTop) / (h || 1e-3);
      const nrm = [Math.sin(am) / sx, slope, Math.cos(am) / sz];
      if (h > 0.001 && opts.side !== false) {
        if (rTop < 1e-4) this.tri(p0b, p1b, [cx, cy + h, cz], nrm, hex);
        else this.quad(p0b, p1b, p1t, p0t, nrm, hex);
      }
      if (rTop > 1e-4 && opts.cap !== false) this.tri(p0t, p1t, [cx, cy + h, cz], [0, 1, 0], topHex);
    }
  }

  // Caja arbitraria con 8 esquinas (---, +--, ++-, -+-, --+, +-+, +++, -++)
  hexa(v, hex) {
    let cx = 0, cy = 0, cz = 0;
    for (const p of v) { cx += p[0]; cy += p[1]; cz += p[2]; }
    cx /= 8; cy /= 8; cz /= 8;
    for (const f of FACES) {
      const fx = (v[f[0]][0] + v[f[1]][0] + v[f[2]][0] + v[f[3]][0]) / 4, fy = (v[f[0]][1] + v[f[1]][1] + v[f[2]][1] + v[f[3]][1]) / 4, fz = (v[f[0]][2] + v[f[1]][2] + v[f[2]][2] + v[f[3]][2]) / 4;
      this.quad(v[f[0]], v[f[1]], v[f[2]], v[f[3]], [fx - cx, fy - cy, fz - cz], hex);
    }
  }

  // Barra entre dos puntos del plano Y-Z a una x dada (t = grosor, tx = ancho en X)
  beam(x, a, b, t, hex, tx = t) {
    const dy = b[1] - a[1], dz = b[2] - a[2];
    const L = Math.hypot(dy, dz) || 1;
    const py = (-dz / L) * (t / 2), pz = (dy / L) * (t / 2);
    const hx = tx / 2;
    const P = (end, sx, sp) => [x + sx * hx, end[1] + sp * py, end[2] + sp * pz];
    this.hexa([P(a, -1, -1), P(a, 1, -1), P(a, 1, 1), P(a, -1, 1), P(b, -1, -1), P(b, 1, -1), P(b, 1, 1), P(b, -1, 1)], hex);
  }

  // Barra entre dos puntos cualesquiera (sección cuadrada t)
  bar(a, b, t, hex) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const L = Math.hypot(dx, dy, dz) || 1;
    const u = [dx / L, dy / L, dz / L];
    const ref = Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let p = [u[1] * ref[2] - u[2] * ref[1], u[2] * ref[0] - u[0] * ref[2], u[0] * ref[1] - u[1] * ref[0]];
    const pl = Math.hypot(...p); p = p.map((v) => (v / pl) * (t / 2));
    let q = [u[1] * p[2] - u[2] * p[1], u[2] * p[0] - u[0] * p[2], u[0] * p[1] - u[1] * p[0]];
    const ql = Math.hypot(...q) || 1; q = q.map((v) => (v / ql) * (t / 2));
    const C = (e, s1, s2) => [e[0] + p[0] * s1 + q[0] * s2, e[1] + p[1] * s1 + q[1] * s2, e[2] + p[2] * s1 + q[2] * s2];
    this.hexa([C(a, -1, -1), C(a, 1, -1), C(a, 1, 1), C(a, -1, 1), C(b, -1, -1), C(b, 1, -1), C(b, 1, 1), C(b, -1, 1)], hex);
  }

  // Disco / elipse horizontal (agua de estanques, alfombras circulares)
  disc(cx, cz, rx, rz, y, seg, hex) {
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      this.tri([cx, y, cz], [cx + Math.sin(a0) * rx, y, cz + Math.cos(a0) * rz], [cx + Math.sin(a1) * rx, y, cz + Math.cos(a1) * rz], [0, 1, 0], hex);
    }
  }

  // Inserta un prototipo precalculado girado en Y, escalado y trasladado (respeta el marco actual).
  // Si el prototipo tiene follaje de una sola cara (hojas de palmera) va al constructor this.F
  // (material de doble cara); si no hay F, se agrega por ambos lados.
  addProto(proto, tx, ty, tz, ry = 0, s = 1) {
    this._addRaw(proto.p, proto.n, proto.c, tx, ty, tz, ry, s, false);
    if (proto.fp) {
      if (this.F) { const keep = this.F.fr; this.F.fr = this.fr; this.F._addRaw(proto.fp, proto.fn, proto.fc, tx, ty, tz, ry, s, false); this.F.fr = keep; }
      else { this._addRaw(proto.fp, proto.fn, proto.fc, tx, ty, tz, ry, s, false); this._addRaw(proto.fp, proto.fn, proto.fc, tx, ty, tz, ry, s, true); }
    }
  }

  _addRaw(P, N, C, tx, ty, tz, ry, s, flip) {
    const c = Math.cos(ry), sn = Math.sin(ry);
    const col = this._col || (this._col = [0, 0, 0]);
    const k = flip ? -1 : 1;
    for (let t = 0; t < P.length; t += 9) {
      for (let q = 0; q < 3; q++) {
        const i = t + (flip ? [0, 6, 3][q] : q * 3);
        const x = P[i] * s, y = P[i + 1] * s, z = P[i + 2] * s;
        const nx = N[i] * k, nz = N[i + 2] * k;
        col[0] = C[i]; col[1] = C[i + 1]; col[2] = C[i + 2];
        this.vert(tx + x * c + z * sn, ty + y, tz - x * sn + z * c, nx * c + nz * sn, N[i + 1] * k, -nx * sn + nz * c, col);
      }
    }
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P.view(), 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N.view(), 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C.view(), 3));
    if (this.U) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.U.view(), 2));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

const Z4 = [[0, 0], [0, 0], [0, 0], [0, 0]];
const FACES = [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0]];

export function makeProto(fn) {
  const b = new GeoBuilder(false), f = new GeoBuilder(false);
  fn(b, f);
  const out = { p: b.P.view(), n: b.N.view(), c: b.C.view() };
  if (f.vertexCount) { out.fp = f.P.view(); out.fn = f.N.view(); out.fc = f.C.view(); }
  return out;
}
