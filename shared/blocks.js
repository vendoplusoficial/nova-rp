// MANZANAS a partir de la red vial.
// 1) Se convierte la red en un grafo plano: cada cruce o unión en T es un nodo.
// 2) Cada cara cerrada del grafo es una manzana (rodeada de calles).
// 3) La manzana se encoge según el ancho de cada calle + banqueta: ese es el terreno edificable.
// 4) El borde de la manzana se divide en "frentes" (tramos casi rectos) donde se acomodan los lotes,
//    todos mirando a su calle. El centro que sobra se usa como patio, parque o estacionamiento.

import { segSegIntersect, segPointDist } from './roads.js';
import { pointInPoly } from './terrain.js';

const KEY = 0.5; // m: tolerancia para unir nodos

export function signedArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return a / 2;
}

// ---------------- grafo plano ----------------
export function planarFaces(net) {
  const segs = net.segs;
  // 1) puntos de corte en cada segmento
  const cuts = segs.map(() => [0, 1]);
  for (const s of segs) {
    for (const o of net.near(Math.min(s.ax, s.bx) - 2, Math.min(s.az, s.bz) - 2, Math.max(s.ax, s.bx) + 2, Math.max(s.az, s.bz) + 2)) {
      if (o.id <= s.id) continue;
      const hit = segSegIntersect([s.ax, s.az], [s.bx, s.bz], [o.ax, o.az], [o.bx, o.bz]);
      if (hit) { cuts[s.id].push(hit.t); cuts[o.id].push(hit.u); }
    }
  }
  // uniones en T: extremos de calle que tocan otra calle se proyectan sobre ella
  const snap = new Map();
  for (const r of net.roads) {
    if (r.closed) continue;
    const mine = segs.filter((q) => q.road === r);
    if (!mine.length) continue;
    for (const [end, seg, isA] of [[r.pts[0], mine[0], true], [r.pts[r.pts.length - 1], mine[mine.length - 1], false]]) {
      let best = null;
      for (const o of net.near(end[0] - 16, end[1] - 16, end[0] + 16, end[1] + 16)) {
        if (o.road === r) continue;
        const { d, t } = segPointDist(o.ax, o.az, o.bx, o.bz, end[0], end[1]);
        if (d < o.road.w / 2 + 1.6 && (!best || d < best.d)) best = { d, t, o };
      }
      if (!best) continue;
      cuts[best.o.id].push(best.t);
      const P = [best.o.ax + (best.o.bx - best.o.ax) * best.t, best.o.az + (best.o.bz - best.o.az) * best.t];
      snap.set(seg.id + (isA ? 'a' : 'b'), P);
    }
  }
  // 2) nodos
  const nodes = [];
  const grid = new Map();
  const nodeAt = (p) => {
    const gx = Math.floor(p[0] / 2), gz = Math.floor(p[1] / 2);
    for (let i = gx - 1; i <= gx + 1; i++) for (let j = gz - 1; j <= gz + 1; j++) {
      const a = grid.get(i * 100003 + j);
      if (a) for (const n of a) if (Math.abs(nodes[n].x - p[0]) < KEY && Math.abs(nodes[n].z - p[1]) < KEY) return n;
    }
    const id = nodes.length;
    nodes.push({ x: p[0], z: p[1], out: [] });
    const k = gx * 100003 + gz;
    let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(id);
    return id;
  };
  // 3) aristas
  const edges = new Map(); // "a,b" -> {a,b,road}
  const addEdge = (a, b, road) => {
    if (a === b) return;
    const k = a < b ? a + ',' + b : b + ',' + a;
    const e = edges.get(k);
    if (e) { if (road.w + road.sw * 2 > e.road.w + e.road.sw * 2) e.road = road; return; }
    edges.set(k, { a, b, road });
  };
  for (const s of segs) {
    const ts = [...new Set(cuts[s.id].map((t) => Math.round(Math.min(1, Math.max(0, t)) * 1e6) / 1e6))].sort((p, q) => p - q);
    let prev = null;
    for (const t of ts) {
      let P = [s.ax + (s.bx - s.ax) * t, s.az + (s.bz - s.az) * t];
      if (t === 0 && snap.has(s.id + 'a')) P = snap.get(s.id + 'a');
      if (t === 1 && snap.has(s.id + 'b')) P = snap.get(s.id + 'b');
      const n = nodeAt(P);
      if (prev !== null) addEdge(prev, n, s.road);
      prev = n;
    }
  }
  // extremo proyectado: une el extremo original con la proyección (pequeña arista)
  for (const e of edges.values()) {
    nodes[e.a].out.push({ to: e.b, e }); nodes[e.b].out.push({ to: e.a, e });
  }
  for (const n of nodes) n.out.sort((p, q) => Math.atan2(nodes[p.to].z - n.z, nodes[p.to].x - n.x) - Math.atan2(nodes[q.to].z - n.z, nodes[q.to].x - n.x));
  // 4) recorrido de caras (cada media arista pertenece a una cara)
  const used = new Set();
  const faces = [];
  for (let u = 0; u < nodes.length; u++) {
    for (const h of nodes[u].out) {
      const hk = u + '>' + h.to;
      if (used.has(hk)) continue;
      const poly = [], ed = [];
      let a = u, b = h.to, e = h.e, guard = 0;
      while (guard++ < 5000) {
        used.add(a + '>' + b);
        poly.push([nodes[a].x, nodes[a].z]); ed.push(e.road);
        const out = nodes[b].out;
        const idx = out.findIndex((q) => q.to === a);
        const nx = out[(idx - 1 + out.length) % out.length];
        a = b; b = nx.to; e = nx.e;
        if (a === u && b === h.to) break;
      }
      faces.push({ poly, roads: ed });
    }
  }
  return { nodes, edges: [...edges.values()], faces };
}

// ---------------- encoger polígono (lados con distinta distancia) ----------------
export function insetPoly(poly, offs) {
  const n = poly.length;
  const sign = signedArea(poly) > 0 ? 1 : -1;
  const out = [];
  const maxOff = Math.max(...offs);
  for (let i = 0; i < n; i++) {
    const p0 = poly[(i - 1 + n) % n], p1 = poly[i], p2 = poly[(i + 1) % n];
    const d1 = offs[(i - 1 + n) % n], d2 = offs[i];
    let ax = p1[0] - p0[0], az = p1[1] - p0[1], bx = p2[0] - p1[0], bz = p2[1] - p1[1];
    const la = Math.hypot(ax, az) || 1, lb = Math.hypot(bx, bz) || 1;
    ax /= la; az /= la; bx /= lb; bz /= lb;
    const n1 = [-az * sign, ax * sign], n2 = [-bz * sign, bx * sign];
    // rectas desplazadas: (p1 + n1*d1) + t*a  y  (p1 + n2*d2) + s*b
    const q1 = [p1[0] + n1[0] * d1, p1[1] + n1[1] * d1], q2 = [p1[0] + n2[0] * d2, p1[1] + n2[1] * d2];
    const den = ax * bz - az * bx;
    let P;
    if (Math.abs(den) < 0.05) P = [(q1[0] + q2[0]) / 2, (q1[1] + q2[1]) / 2];
    else {
      const t = ((q2[0] - q1[0]) * bz - (q2[1] - q1[1]) * bx) / den;
      P = [q1[0] + ax * t, q1[1] + az * t];
      const m = Math.hypot(P[0] - p1[0], P[1] - p1[1]);
      if (m > maxOff * 3) { const k = (maxOff * 3) / m; P = [p1[0] + (P[0] - p1[0]) * k, p1[1] + (P[1] - p1[1]) * k]; }
    }
    out.push(P);
  }
  return out;
}

// Quita vértices repetidos, picos (callejones de ida y vuelta) y puntos casi alineados
export function cleanPoly(poly, roads) {
  let P = poly.map((p, i) => ({ p, r: roads ? roads[i] : null }));
  for (let pass = 0; pass < 4; pass++) {
    const out = [];
    for (let i = 0; i < P.length; i++) {
      const a = P[(i - 1 + P.length) % P.length].p, b = P[i].p, c = P[(i + 1) % P.length].p;
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < (pass < 2 ? 0.3 : 1.2)) continue;
      if (Math.hypot(c[0] - a[0], c[1] - a[1]) < 0.3) { i++; continue; } // pico
      out.push(P[i]);
    }
    P = out;
    if (P.length < 3) return null;
  }
  // unir puntos casi alineados (solo si la calle es la misma)
  const out = [];
  for (let i = 0; i < P.length; i++) {
    const a = P[(i - 1 + P.length) % P.length], b = P[i], c = P[(i + 1) % P.length];
    const ux = b.p[0] - a.p[0], uz = b.p[1] - a.p[1], vx = c.p[0] - b.p[0], vz = c.p[1] - b.p[1];
    const cr = Math.abs(ux * vz - uz * vx) / ((Math.hypot(ux, uz) * Math.hypot(vx, vz)) || 1);
    if (cr < 0.02 && a.r === b.r) continue;
    out.push(b);
  }
  if (out.length < 3) return null;
  return { poly: out.map((q) => q.p), roads: out.map((q) => q.r) };
}

// Quita los "rizos" que deja el encogido en esquinas cerradas o picos (cruces de lados del polígono):
// en cada cruce el polígono se parte en dos y se conserva la parte con la orientación original y más área.
export function removeLoops(poly, sign = 0) {
  let P = poly.slice();
  const sg = sign || Math.sign(signedArea(P)) || 1;
  for (let guard = 0; guard < 80; guard++) {
    const n = P.length;
    if (n < 4) return P;
    let found = false;
    outer: for (let i = 0; i < n; i++) {
      const a = P[i], b = P[(i + 1) % n];
      for (let k = 2; k <= n - 2; k++) {
        const j = (i + k) % n;
        if ((j + 1) % n === i) continue;
        const hit = segSegIntersect(a, b, P[j], P[(j + 1) % n]);
        if (!hit) continue;
        const X = [hit.x, hit.z];
        const A = [X], Bp = [X];
        for (let q = 1; q <= k; q++) A.push(P[(i + q) % n]);           // i+1 .. j
        for (let q = k + 1; q <= n; q++) Bp.push(P[(i + q) % n]);      // j+1 .. i
        const aa = signedArea(A) * sg, ab = signedArea(Bp) * sg;
        P = aa >= ab ? A : Bp;
        found = true;
        break outer;
      }
    }
    if (!found) return P;
  }
  return P;
}

export function selfIntersects(poly) {
  const n = poly.length;
  if (n > 160) return false;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const c = poly[j], d = poly[(j + 1) % n];
      if (segSegIntersect(a, b, c, d)) return true;
    }
  }
  return false;
}

// Manzanas: caras interiores encogidas por el ancho de calle + banqueta
export function buildBlocks(net) {
  const graph = planarFaces(net);
  const { faces } = graph;
  const blocks = [];
  // la cara exterior (una por componente) tiene el signo contrario al de la mayoría
  let pos = 0, neg = 0;
  for (const f of faces) { const a = signedArea(f.poly); if (Math.abs(a) < 2e5) (a > 0 ? pos++ : neg++); }
  const sgn = pos >= neg ? 1 : -1;
  for (const f of faces) {
    const area = signedArea(f.poly) * sgn;
    if (area < 120) continue;
    const c = cleanPoly(f.poly, f.roads);
    if (!c) continue;
    const offs = c.roads.map((r) => r.w / 2 + r.sw + 0.35);
    let inner = removeLoops(insetPoly(c.poly, offs), Math.sign(signedArea(c.poly)));
    const ia = signedArea(inner) * sgn;
    if (ia < 80 || selfIntersects(inner)) continue;
    blocks.push({ id: blocks.length, raw: c.poly, poly: inner, roads: c.roads, area: ia, sgn });
  }
  return { blocks, graph };
}

// Frentes: tramos casi rectos del borde de la manzana (para acomodar lotes en fila)
export function frontages(block) {
  const P = block.poly, n = P.length;
  // empezar en una esquina marcada
  const turn = (i) => {
    const a = P[(i - 1 + n) % n], b = P[i], c = P[(i + 1) % n];
    const u = Math.atan2(b[1] - a[1], b[0] - a[0]), v = Math.atan2(c[1] - b[1], c[0] - b[0]);
    let d = Math.abs(v - u); if (d > Math.PI) d = 2 * Math.PI - d;
    return d;
  };
  let start = 0, best = -1;
  for (let i = 0; i < n; i++) { const t = turn(i); if (t > best) { best = t; start = i; } }
  const runs = [];
  let cur = [P[start]];
  for (let k = 1; k <= n; k++) {
    const i = (start + k) % n;
    cur.push(P[i]);
    if (k === n || turn(i) > 0.42) { if (cur.length >= 2) runs.push({ pts: cur, road: block.roads[(i - 1 + n) % n] }); cur = [P[i]]; }
  }
  for (const r of runs) {
    r.len = 0;
    for (let i = 1; i < r.pts.length; i++) r.len += Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]);
  }
  return runs.sort((a, b) => b.len - a.len);
}

// Punto, dirección y normal hacia ADENTRO de la manzana a una distancia s del inicio del frente
export function runAt(run, s, sgn) {
  let acc = 0;
  for (let i = 1; i < run.pts.length; i++) {
    const a = run.pts[i - 1], b = run.pts[i];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (acc + L >= s || i === run.pts.length - 1) {
      const t = Math.min(1, Math.max(0, (s - acc) / (L || 1)));
      const ux = (b[0] - a[0]) / (L || 1), uz = (b[1] - a[1]) / (L || 1);
      return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, ux, uz, nx: -uz * sgn, nz: ux * sgn };
    }
    acc += L;
  }
  return null;
}

// Distancia desde un punto, en una dirección, hasta el borde del polígono
export function rayToPoly(poly, x, z, dx, dz, maxD = 400) {
  let best = maxD;
  const e = [x + dx * maxD, z + dz * maxD];
  for (let i = 0; i < poly.length; i++) {
    const hit = segSegIntersect([x, z], e, poly[i], poly[(i + 1) % poly.length]);
    if (hit && hit.t * maxD > 0.5 && hit.t * maxD < best) best = hit.t * maxD;
  }
  return best;
}

export function rectInPoly(poly, q, tol = 0.3) {
  const c = Math.cos(q.rot), s = Math.sin(q.rot);
  for (const [fx, fz] of [[1, 1], [-1, 1], [1, -1], [-1, -1], [0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const lx = fx * (q.hx - tol), lz = fz * (q.hz - tol);
    if (!pointInPoly(poly, q.cx + lx * c + lz * s, q.cz - lx * s + lz * c)) return false;
  }
  return true;
}
