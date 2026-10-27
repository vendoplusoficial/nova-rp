// Red de calles de Puerto Nova.
// 1) Avenidas y caminos principales DISEÑADOS A MANO (shared/mapdata.js), con curvas suaves,
//    glorietas, malecones, puentes y caminos de montaña.
// 2) Calles de barrio: cada barrio tiene su propia trama (orientación, separación, ancho y
//    ondulación). Las calles se cortan en los límites del barrio y se unen a las avenidas.
// 3) Verificación: ninguna calle queda suelta ni aislada (se prolonga, se une o se recorta), y
//    solo se conservan las calles conectadas con la red principal.

import { playable, pointInPoly, polyDist } from './terrain.js';
import { MAIN_ROADS, ROUNDABOUTS, STREET_RULES, ZONES } from './mapdata.js';

export const ROAD_CLASSES = {
  avenida: { w: 15, sw: 4, mark: 'yellow2' },
  boulevard: { w: 14, sw: 6, mark: 'yellow2' },
  glorieta: { w: 11, sw: 3.5, mark: 'none' },
  calle: { w: 9, sw: 3, mark: 'dashed' },
  subida: { w: 8, sw: 1.2, mark: 'dashed' },
  callejon: { w: 4.5, sw: 0, mark: 'none' },
};
// compatibilidad
export const ZOCALO = 0;

const CELL = 40;

// ---------------- utilidades geométricas ----------------
export function segDist(ax, az, bx, bz, px, pz) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-9;
  let t = ((px - ax) * dx + (pz - az) * dz) / L2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = px - (ax + dx * t), ez = pz - (az + dz * t);
  return Math.sqrt(ex * ex + ez * ez);
}

export function segPointDist(ax, az, bx, bz, px, pz) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-9;
  let t = ((px - ax) * dx + (pz - az) * dz) / L2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return { d: Math.hypot(px - (ax + dx * t), pz - (az + dz * t)), t };
}

export function segSegIntersect(a, b, c, d) {
  const r1 = b[0] - a[0], r2 = b[1] - a[1], s1 = d[0] - c[0], s2 = d[1] - c[1];
  const den = r1 * s2 - r2 * s1;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * s2 - (c[1] - a[1]) * s1) / den;
  const u = ((c[0] - a[0]) * r2 - (c[1] - a[1]) * r1) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { t, u, x: a[0] + r1 * t, z: a[1] + r2 * t };
}

// Recorta la recta P(t)=A+t(B-A), t∈[0,1] contra un rectángulo girado. Devuelve [t0,t1] o null
export function clipToRect(ax, az, bx, bz, rect) {
  // rect: {cx, cz, ux, uz (eje largo unitario), hl (semilargo), hw (semiancho)}
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  const px = ax - rect.cx, pz = az - rect.cz;
  for (let k = 0; k < 4; k++) {
    const nx = k === 0 ? rect.ux : k === 1 ? -rect.ux : k === 2 ? -rect.uz : rect.uz;
    const nz = k === 0 ? rect.uz : k === 1 ? -rect.uz : k === 2 ? rect.ux : -rect.ux;
    const h = k < 2 ? rect.hl : rect.hw;
    const num = h - (nx * px + nz * pz);
    const den = nx * dx + nz * dz;
    if (den > -1e-12 && den < 1e-12) { if (num < 0) return null; continue; }
    const t = num / den;
    if (den > 0) { if (t < t1) t1 = t; } else if (t > t0) t0 = t;
    if (t0 > t1) return null;
  }
  return [t0, t1];
}

// ---------------- red ----------------
export class RoadNet {
  constructor() {
    this.roads = [];
    this.segs = [];
    this.hash = new Map();
    this.qid = 0;
  }

  add(name, cls, pts, opts = {}) {
    const C = ROAD_CLASSES[cls] || ROAD_CLASSES.calle;
    const road = { id: this.roads.length, name, cls, w: opts.w ?? C.w, sw: opts.sw ?? C.sw, mark: opts.mark ?? C.mark, pts, district: opts.district || null, closed: !!opts.closed, caps: [], bridge: !!opts.bridge };
    if (road.cls === 'calle' && road.w < 8) road.mark = 'none';
    this.roads.push(road);
    this.addSegs(road);
    return road;
  }

  addSegs(road) {
    const pts = road.pts;
    const n = road.closed ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 0.5) continue;
      const seg = { id: this.segs.length, road, ax: a[0], az: a[1], bx: b[0], bz: b[1], L, ux: (b[0] - a[0]) / L, uz: (b[1] - a[1]) / L, half: road.w / 2 + road.sw };
      this.segs.push(seg);
      this.index(seg);
    }
  }

  // Vuelve a indexar todo (tras recortar, extender o quitar calles)
  rebuild() {
    const old = this.roads;
    this.roads = []; this.segs = []; this.hash = new Map();
    for (const r of old) {
      if (r.removed || r.pts.length < 2) continue;
      r.id = this.roads.length;
      this.roads.push(r);
      this.addSegs(r);
    }
  }

  index(seg) {
    const m = seg.half + 2;
    const i0 = Math.floor((Math.min(seg.ax, seg.bx) - m) / CELL), i1 = Math.floor((Math.max(seg.ax, seg.bx) + m) / CELL);
    const j0 = Math.floor((Math.min(seg.az, seg.bz) - m) / CELL), j1 = Math.floor((Math.max(seg.az, seg.bz) + m) / CELL);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = i * 100003 + j;
      let arr = this.hash.get(k);
      if (!arr) { arr = []; this.hash.set(k, arr); }
      arr.push(seg);
    }
  }

  near(x0, z0, x1, z1) {
    const out = [];
    const q = ++this.qid;
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) {
      for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) {
        const arr = this.hash.get(i * 100003 + j);
        if (arr) for (const s of arr) if (s.q !== q) { s.q = q; out.push(s); }
      }
    }
    return out;
  }

  // Distancia desde un punto al borde de la calle más cercana (negativa = dentro del corredor)
  clearance(x, z, filter) {
    let best = Infinity, bestSeg = null;
    for (const s of this.near(x - 30, z - 30, x + 30, z + 30)) {
      if (filter && !filter(s)) continue;
      const c = segDist(s.ax, s.az, s.bx, s.bz, x, z) - s.half;
      if (c < best) { best = c; bestSeg = s; }
    }
    return { c: best, seg: bestSeg };
  }

  // ¿Un rectángulo girado (lote) choca con algún corredor de calle (con margen)?
  rectHitsRoad(cx, cz, hx, hz, rot, margin) {
    const c = Math.cos(rot), s = Math.sin(rot);
    const ext = Math.abs(hx * c) + Math.abs(hz * s) + 14, exz = Math.abs(hx * s) + Math.abs(hz * c) + 14;
    const corners = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([lx, lz]) => [cx + lx * c + lz * s, cz - lx * s + lz * c]);
    const R = Math.hypot(hx, hz);
    for (const sg of this.near(cx - ext, cz - exz, cx + ext, cz + exz)) {
      const lim = sg.half + margin;
      if (segDist(sg.ax, sg.az, sg.bx, sg.bz, cx, cz) > R + lim) continue;   // lejos: no puede tocar
      // distancia entre el segmento de calle y el polígono del lote
      for (let k = 0; k < 4; k++) {
        const p = corners[k], q = corners[(k + 1) % 4];
        if (segSegDist(p, q, [sg.ax, sg.az], [sg.bx, sg.bz]) < lim) return true;
      }
      // segmento totalmente dentro del lote
      const mx = (sg.ax + sg.bx) / 2 - cx, mz = (sg.az + sg.bz) / 2 - cz;
      if (Math.abs(mx * c - mz * s) < hx && Math.abs(mx * s + mz * c) < hz) return true;
    }
    return false;
  }

  // Intervalos (en t∈[0,1]) de la línea del segmento A desplazada "off" metros a su izquierda
  // que quedan dentro del corredor de OTRAS calles. extra = margen adicional.
  blockedIntervals(A, off, extra = 0) {
    const nx = -A.uz, nz = A.ux;
    const ax = A.ax + nx * off, az = A.az + nz * off, bx = A.bx + nx * off, bz = A.bz + nz * off;
    const out = [];
    const m = 30;
    for (const B of this.near(Math.min(ax, bx) - m, Math.min(az, bz) - m, Math.max(ax, bx) + m, Math.max(az, bz) + m)) {
      if (B.road === A.road) continue;
      const rect = { cx: (B.ax + B.bx) / 2, cz: (B.az + B.bz) / 2, ux: B.ux, uz: B.uz, hl: B.L / 2 + 0.01, hw: B.half + extra };
      const iv = clipToRect(ax, az, bx, bz, rect);
      if (iv) out.push(iv);
    }
    return mergeIntervals(out);
  }
}

export function mergeIntervals(list) {
  list.sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const iv of list) {
    if (out.length && iv[0] <= out[out.length - 1][1]) out[out.length - 1][1] = Math.max(out[out.length - 1][1], iv[1]);
    else out.push([iv[0], iv[1]]);
  }
  return out;
}

// Complemento de intervalos dentro de [0,1]
export function freeIntervals(blocked) {
  const out = [];
  let t = 0;
  for (const [a, b] of blocked) { if (a > t) out.push([t, a]); t = Math.max(t, b); }
  if (t < 1) out.push([t, 1]);
  return out;
}

function segSegDist(p, q, a, b) {
  if (segSegIntersect(p, q, a, b)) return 0;
  return Math.min(
    segDist(a[0], a[1], b[0], b[1], p[0], p[1]), segDist(a[0], a[1], b[0], b[1], q[0], q[1]),
    segDist(p[0], p[1], q[0], q[1], a[0], a[1]), segDist(p[0], p[1], q[0], q[1], b[0], b[1]),
  );
}

// ---------------- trazado ----------------

// Curva Catmull-Rom centrípeta: pasa EXACTAMENTE por los puntos dados (los cruces coinciden)
export function smoothPath(pts, closed = false, step = 7) {
  const n = pts.length;
  if (n < 3) return pts.slice();
  const get = (i) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  const out = [];
  const spans = closed ? n : n - 1;
  for (let i = 0; i < spans; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    const d = (a, b) => Math.max(1e-3, Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]), 0.5));
    const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
    const L = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const m = Math.max(1, Math.ceil(L / step));
    for (let k = 0; k < m; k++) {
      const t = t1 + ((t2 - t1) * k) / m;
      const A1 = lerpP(p0, p1, (t - t0) / (t1 - t0 || 1)), A2 = lerpP(p1, p2, (t - t1) / (t2 - t1 || 1)), A3 = lerpP(p2, p3, (t - t2) / (t3 - t2 || 1));
      const B1 = lerpP(A1, A2, (t - t0) / (t2 - t0 || 1)), B2 = lerpP(A2, A3, (t - t1) / (t3 - t1 || 1));
      out.push(k === 0 ? [p1[0], p1[1]] : lerpP(B1, B2, (t - t1) / (t2 - t1 || 1)));
    }
  }
  if (!closed) out.push([pts[n - 1][0], pts[n - 1][1]]);
  return out;
}
const lerpP = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

// Quita de una polilínea las partes dentro de un círculo; devuelve tramos que terminan en el círculo
function cutByCircle(pts, cx, cz, R) {
  const inside = (p) => Math.hypot(p[0] - cx, p[1] - cz) < R;
  const cross = (a, b) => {
    const dx = b[0] - a[0], dz = b[1] - a[1], fx = a[0] - cx, fz = a[1] - cz;
    const A = dx * dx + dz * dz, B = 2 * (fx * dx + fz * dz), C = fx * fx + fz * fz - R * R;
    const disc = Math.sqrt(Math.max(0, B * B - 4 * A * C));
    for (const t of [(-B - disc) / (2 * A), (-B + disc) / (2 * A)]) if (t >= 0 && t <= 1) return lerpP(a, b, t);
    return lerpP(a, b, 0.5);
  };
  const pieces = [];
  let cur = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (!inside(p)) {
      if (!cur.length && i > 0 && inside(pts[i - 1])) cur.push(cross(pts[i - 1], p));
      cur.push(p);
    } else if (cur.length) { cur.push(cross(pts[i - 1], p)); pieces.push(cur); cur = []; }
  }
  if (cur.length) pieces.push(cur);
  return pieces.filter((q) => q.length >= 2);
}

export function buildMainRoads(net) {
  const paths = MAIN_ROADS.map((r) => ({ ...r, path: r.smooth ? smoothPath(r.pts, r.closed) : r.pts.map((p) => [p[0], p[1]]) }));
  for (const r of paths) {
    let pieces = [r.path];
    let closed = !!r.closed;
    for (const g of ROUNDABOUTS) {
      const next = [];
      for (const pc of pieces) {
        const cut = cutByCircle(closed ? [...pc, pc[0]] : pc, g.at[0], g.at[1], g.r);
        if (cut.length !== 1 || cut[0].length !== (closed ? pc.length + 1 : pc.length)) closed = false;
        next.push(...(cut.length ? cut : [pc]));
      }
      pieces = next;
    }
    for (const pc of pieces) net.add(r.name, r.cls, pc, { closed, w: r.w, sw: r.sw, bridge: r.bridge });
  }
  // glorietas: anillo de calle con isla central
  for (const g of ROUNDABOUTS) {
    const pts = [];
    for (let k = 0; k < 28; k++) { const a = (k / 28) * Math.PI * 2; pts.push([g.at[0] + Math.sin(a) * g.r, g.at[1] + Math.cos(a) * g.r]); }
    const road = net.add(g.name, 'glorieta', pts, { closed: true });
    road.roundabout = g;
  }
}

// Calles de barrio
export function buildLocalRoads(net, reserved, slopeAt) {
  const mains = new Set(net.segs);
  const isReserved = (x, z, m) => reserved.some((r) => rectContains(r, x, z, m));
  const nearParallelMain = (x, z, ux, uz) => {
    for (const s of net.near(x - 40, z - 40, x + 40, z + 40)) {
      if (!mains.has(s)) continue;
      const d = segDist(s.ax, s.az, s.bx, s.bz, x, z);
      if (d < s.half + 22 && Math.abs(s.ux * ux + s.uz * uz) > 0.85) return true;
      if (d < s.half + 3) return true;     // no correr encima de una avenida
    }
    return false;
  };
  const zonesById = {};
  for (const zn of ZONES) (zonesById[zn.id] ||= []).push(zn.pts);

  for (const [id, rule] of Object.entries(STREET_RULES)) {
    for (const poly of zonesById[id] || []) {
      // ancla = centroide del barrio
      let ox = 0, oz = 0;
      for (const p of poly) { ox += p[0] / poly.length; oz += p[1] / poly.length; }
      const th = (rule.angle * Math.PI) / 180;
      const ux = Math.cos(th), uz = Math.sin(th), vx = -uz, vz = ux;
      const inside = (x, z) => pointInPoly(poly, x, z) && polyDist(poly, x, z) > 9 && playable(x, z, 12) && !isReserved(x, z, 6);
      const family = (dx, dz, px, pz, spacing, phase) => {
        for (let k = -14; k <= 14; k++) {
          const off = k * spacing;
          let cur = [];
          const flush = () => {
            if (cur.length * 4 >= 30) {
              const run = [cur[0], ...cur.filter((_, i) => i > 0 && i < cur.length - 1 && i % 3 === 0), cur[cur.length - 1]];
              net.add('Calle', 'calle', snapEnds(run, spacing * 0.7), { district: id, w: rule.w, sw: rule.sw });
            }
            cur = [];
          };
          for (let t = -700; t <= 700; t += 4) {
            const wv = rule.warp ? Math.sin((t / (spacing * 2.2)) * Math.PI * 2 + k * 1.7 + phase) * rule.warp : 0;
            const x = ox + px * off + dx * t + px * wv, z = oz + pz * off + dz * t + pz * wv;
            const ok = inside(x, z) && !nearParallelMain(x, z, dx, dz) && slopeAt(x, z, dx, dz) < 0.17;
            if (ok) cur.push([x, z]); else flush();
          }
          flush();
        }
      };
      family(ux, uz, vx, vz, rule.spacing[1], 0);
      if (rule.spacing[0] < 900) family(vx, vz, ux, uz, rule.spacing[0], 1.3);
    }
  }

  // Extiende los extremos de una calle local hasta la calle más cercana (si está cerca)
  function snapEnds(run, maxExt = 18) {
    const ext = (p, q) => {
      const L = Math.hypot(p[0] - q[0], p[1] - q[1]) || 1;
      const dx = (p[0] - q[0]) / L, dz = (p[1] - q[1]) / L;
      let best = null;
      const ex = p[0] + dx * maxExt, ez = p[1] + dz * maxExt;
      for (const s of net.near(Math.min(p[0], ex) - 2, Math.min(p[1], ez) - 2, Math.max(p[0], ex) + 2, Math.max(p[1], ez) + 2)) {
        const hit = segSegIntersect(p, [ex, ez], [s.ax, s.az], [s.bx, s.bz]);
        if (hit && (!best || hit.t < best.t)) best = hit;
      }
      return best ? [best.x, best.z] : p;
    };
    const out = run.slice();
    out[0] = ext(run[0], run[1]);
    out[out.length - 1] = ext(run[run.length - 1], run[run.length - 2]);
    return out;
  }

  const okPath = (x, z, dx, dz) => playable(x, z, 10) && !isReserved(x, z, 3) && slopeAt(x, z, dx, dz) < 0.2;
  resolveDeadEnds(net, reserved, okPath);
  keepConnected(net);
}

// Solo se conservan las calles conectadas (directa o indirectamente) con el Anillo Periférico
export function keepConnected(net) {
  const roads = net.roads;
  // dos tramos se tocan si se cruzan o si el extremo de uno cae sobre el otro
  const segTouch = (s, o) => {
    if (segSegIntersect([s.ax, s.az], [s.bx, s.bz], [o.ax, o.az], [o.bx, o.bz])) return true;
    for (const p of [[s.ax, s.az], [s.bx, s.bz]]) if (segDist(o.ax, o.az, o.bx, o.bz, p[0], p[1]) < o.road.w / 2 + 1.5) return true;
    for (const p of [[o.ax, o.az], [o.bx, o.bz]]) if (segDist(s.ax, s.az, s.bx, s.bz, p[0], p[1]) < s.road.w / 2 + 1.5) return true;
    return false;
  };
  // vecinos por contacto de tramos
  const nb = new Map(roads.map((r) => [r, new Set()]));
  for (const s of net.segs) {
    for (const o of net.near(Math.min(s.ax, s.bx) - 10, Math.min(s.az, s.bz) - 10, Math.max(s.ax, s.bx) + 10, Math.max(s.az, s.bz) + 10)) {
      if (o.road === s.road || nb.get(s.road).has(o.road)) continue;
      if (segTouch(s, o)) { nb.get(s.road).add(o.road); nb.get(o.road).add(s.road); }
    }
  }
  const root = roads.find((r) => r.name === 'Anillo Periférico');
  const seen = new Set([root]);
  const st = [root];
  while (st.length) { const r = st.pop(); for (const q of nb.get(r)) if (!seen.has(q)) { seen.add(q); st.push(q); } }
  let removed = 0;
  for (const r of roads) if (!seen.has(r)) { r.removed = true; removed++; }
  if (removed) net.rebuild();
  net.disconnectedRemoved = removed;
}

export function rectContains(r, x, z, margin = 0) {
  const dx = x - r.cx, dz = z - r.cz;
  const c = Math.cos(r.rot || 0), s = Math.sin(r.rot || 0);
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  return Math.abs(lx) <= r.hx + margin && Math.abs(lz) <= r.hz + margin;
}

// ---------------- calles sin salida ----------------
// Cada extremo suelto de una calle se resuelve, en este orden:
//  1) se prolonga en línea recta hasta la calle de enfrente,
//  2) se une con una curva corta a la calle más cercana,
//  3) si es un "muñón" corto se recorta hasta el último cruce,
//  4) si nada de eso es posible queda como calle cerrada: retorno + valla + letrero "SIN SALIDA".

function endInfo(road, end) {
  const pts = road.pts;
  const p = end === 'a' ? pts[0] : pts[pts.length - 1];
  const q = end === 'a' ? pts[1] : pts[pts.length - 2];
  const L = Math.hypot(p[0] - q[0], p[1] - q[1]) || 1;
  return { p, dx: (p[0] - q[0]) / L, dz: (p[1] - q[1]) / L };
}

// ¿El extremo toca otra calle (o entra a un sitio emblemático)?
export function endStatus(net, road, end, reserved) {
  const { p } = endInfo(road, end);
  for (const o of net.near(p[0] - 20, p[1] - 20, p[0] + 20, p[1] + 20)) {
    if (o.road === road) continue;
    if (segDist(o.ax, o.az, o.bx, o.bz, p[0], p[1]) < o.road.w / 2 + 1.5) return 'ok';
  }
  if (reserved && reserved.some((r) => rectContains(r, p[0], p[1], 10))) return 'site';
  return 'dead';
}

function roadLength(road) {
  let L = 0;
  for (let i = 1; i < road.pts.length; i++) L += Math.hypot(road.pts[i][0] - road.pts[i - 1][0], road.pts[i][1] - road.pts[i - 1][1]);
  return L;
}

// Posiciones (longitud de arco) donde otras calles cruzan o tocan esta calle
function junctionsOf(net, road) {
  const out = [];
  const ends = [];
  for (const r of net.roads) if (r !== road && !r.closed && !r.removed) ends.push(r.pts[0], r.pts[r.pts.length - 1]);
  let acc = 0;
  for (let i = 1; i < road.pts.length; i++) {
    const a = road.pts[i - 1], b = road.pts[i];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (const o of net.near(Math.min(a[0], b[0]) - 12, Math.min(a[1], b[1]) - 12, Math.max(a[0], b[0]) + 12, Math.max(a[1], b[1]) + 12)) {
      if (o.road === road) continue;
      const hit = segSegIntersect(a, b, [o.ax, o.az], [o.bx, o.bz]);
      if (hit) out.push(acc + hit.t * L);
    }
    for (const e of ends) {
      const { d, t } = segPointDist(a[0], a[1], b[0], b[1], e[0], e[1]);
      if (d < road.w / 2 + 1.5) out.push(acc + t * L);
    }
    acc += L;
  }
  return out.sort((x, y) => x - y);
}

// Parte de la polilínea entre s0 y s1 (longitud de arco)
function sliceRoad(pts, s0, s1) {
  const out = [];
  let acc = 0;
  const pointAt = (i, s) => { const a = pts[i - 1], b = pts[i]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; const t = (s - acc) / L; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; };
  for (let i = 1; i < pts.length; i++) {
    const L = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (!out.length && acc + L >= s0) out.push(pointAt(i, s0));
    if (out.length) {
      if (acc + L >= s1) { out.push(pointAt(i, s1)); return out; }
      out.push(pts[i]);
    }
    acc += L;
  }
  return out;
}

function tryExtend(net, road, end, maxExt, ok) {
  const { p, dx, dz } = endInfo(road, end);
  for (let t = 2; t <= maxExt; t += 2) {
    const qx = p[0] + dx * t, qz = p[1] + dz * t;
    if (!ok(qx, qz, dx, dz)) return null;
    for (const o of net.near(qx - 14, qz - 14, qx + 14, qz + 14)) {
      if (o.road === road) continue;
      const d = segDist(o.ax, o.az, o.bx, o.bz, qx, qz);
      const cos = Math.abs(dx * o.ux + dz * o.uz);
      if (d < o.road.w / 2 + 0.5) {
        if (cos > 0.87) return null;
        const hit = segSegIntersect(p, [p[0] + dx * (t + 30), p[1] + dz * (t + 30)], [o.ax, o.az], [o.bx, o.bz]);
        return hit ? [hit.x, hit.z] : null;
      }
      if (cos > 0.87 && d < o.half + road.w / 2 + 1) return null; // correría pegada a otra calle
    }
  }
  return null;
}

function tryConnect(net, road, end, maxD, ok) {
  const { p, dx, dz } = endInfo(road, end);
  let best = null;
  for (const o of net.near(p[0] - maxD, p[1] - maxD, p[0] + maxD, p[1] + maxD)) {
    if (o.road === road) continue;
    const { d, t } = segPointDist(o.ax, o.az, o.bx, o.bz, p[0], p[1]);
    if (d > maxD || d < 2 || (best && d >= best.d)) continue;
    const T = [o.ax + (o.bx - o.ax) * t, o.az + (o.bz - o.az) * t];
    const vx = (T[0] - p[0]) / d, vz = (T[1] - p[1]) / d;
    if (vx * dx + vz * dz < 0.3) continue;            // hacia adelante (máx. ~72° de giro)
    if (Math.abs(vx * o.ux + vz * o.uz) > 0.8) continue; // que llegue de frente, no rozando
    let fine = true;
    for (let k = 2; k < d - o.road.w / 2 && fine; k += 2) {
      const x = p[0] + vx * k, z = p[1] + vz * k;
      if (!ok(x, z, vx, vz)) { fine = false; break; }
      for (const q of net.near(x - 12, z - 12, x + 12, z + 12)) {
        if (q.road === road || q.road === o.road) continue;
        if (segDist(q.ax, q.az, q.bx, q.bz, x, z) < q.half + 1) { fine = false; break; }
      }
    }
    if (fine) best = { d, T };
  }
  return best ? best.T : null;
}

export function resolveDeadEnds(net, reserved, ok) {
  const open = () => net.roads.filter((r) => !r.closed && !r.removed && r.district); // solo calles de barrio (las principales están diseñadas)
  // 1-2) prolongar o conectar
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    for (const road of open()) {
      for (const end of ['a', 'b']) {
        if (endStatus(net, road, end, null) !== 'dead') continue;
        const alley = road.cls === 'callejon';
        const ext = tryExtend(net, road, end, alley ? 44 : 90, ok) || tryConnect(net, road, end, alley ? 30 : 60, ok);
        if (!ext) continue;
        if (end === 'a') road.pts.unshift(ext); else road.pts.push(ext);
        changed = true;
      }
    }
    net.rebuild();
    if (!changed) break;
  }
  // 3) recortar muñones cortos y quitar calles aisladas
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    for (const road of open()) {
      const deadA = endStatus(net, road, 'a', null) === 'dead', deadB = endStatus(net, road, 'b', null) === 'dead';
      if (!deadA && !deadB) continue;
      const J = junctionsOf(net, road);
      const total = roadLength(road);
      if (!J.length) { road.removed = true; changed = true; continue; }
      const maxStub = Infinity; // ninguna calle sin salida: se recorta hasta el último cruce
      let s0 = 0, s1 = total;
      if (deadA && J[0] <= maxStub) s0 = J[0];
      if (deadB && total - J[J.length - 1] <= maxStub) s1 = J[J.length - 1];
      if (s0 === 0 && s1 === total) continue;
      if (s1 - s0 < 8) { road.removed = true; changed = true; continue; }
      road.pts = sliceRoad(road.pts, s0, s1);
      changed = true;
    }
    net.rebuild();
    if (!changed) break;
  }
  // 4) las que quedan: calle cerrada con retorno y valla (o bolardos si entra a un parque)
  const PARKS = new Set(['parque', 'plazuela', 'lago', 'deportiva', 'plaza']);
  for (const road of net.roads) {
    road.caps = [];
    if (road.closed) continue;
    for (const end of ['a', 'b']) {
      const st = endStatus(net, road, end, road.district ? null : reserved);
      if (st === 'ok') continue;
      const { p, dx, dz } = endInfo(road, end);
      if (st === 'site') {
        const r = reserved.find((rr) => rectContains(rr, p[0], p[1], 10));
        if (r && PARKS.has(r.kind)) road.caps.push({ end, x: p[0], z: p[1], dx, dz, type: 'bollards' });
        continue;
      }
      road.caps.push({ end, x: p[0], z: p[1], dx, dz, type: road.cls === 'callejon' ? 'alley' : 'street' });
    }
  }
}
