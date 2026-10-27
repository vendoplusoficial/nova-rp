// Dibuja Puerto Nova por MOSAICOS de 64 m: solo se construye lo cercano a la cámara.
//  - Base (todo mosaico visible): terreno, calles, edificios, árboles y objetos grandes.
//  - Detalle (solo cerca): mobiliario pequeño, adornos y letreros.
// Cada mosaico usa 2-4 llamadas de dibujo (geometría fusionada).

import * as THREE from 'three';
import { GeoBuilder, shade } from './geometry.js';
import { PROTO, FAR_SKIP } from './props.js';
import { renderParts } from './parts.js';
import { getAtlas } from './atlas.js';
import { TERRAIN_MIN, TERRAIN_MAX_X, TERRAIN_MAX_Z, playable, landDist, lakeDist, isSandy, coastLines, LAKE_LEVEL, fbm } from '/shared/terrain.js';
import { LAKE } from '/shared/mapdata.js';
import { districtAt } from '/shared/districts.js';
import { mergeIntervals, freeIntervals } from '/shared/roads.js';

const TILE = 64;
const NEAR = 150;          // radio para construir el detalle
const LOD_IN = 125, LOD_OUT = 165; // base en alta calidad dentro de LOD_IN (con histéresis)
const ASPHALT = 0x3f4348, CONCRETE = 0x8f8b84, SIDEWALK = 0xc4bfb5, CURB = 0xd6d2c9, JOINT = 0xa9a49a;
const LINE_W = 0xe9e9e4, LINE_Y = 0xe8c547;

// Color del suelo por barrio (se ve entre lotes, en camellones y en el campo)
const GROUND = {
  centro: 0xb5ad9e, comercial: 0xaaa597, media: 0x74a454, popular: 0x99916a, residencial: 0x70a250, sur: 0xa59f8c,
  costa: 0x8aa85f, playa: 0x93ad66, puerto: 0x8e8c86, industrial: 0x939089, aeropuerto: 0x86a05a, exclusiva: 0x67a84b,
  presa: 0x5f9a45, montana: 0x6b8f48, isla: 0x78a452, prision: 0x9a978c, campo: 0x6e9b4a,
};
const DETAIL_PROPS = new Set(['bench', 'bin', 'umbrellaBeach', 'towel', 'volleyball', 'buoy', 'mailbox', 'grill', 'lounger', 'crates', 'planter']);

export class CityRenderer {
  constructor(scene, city, renderer) {
    this.scene = scene;
    this.city = city;
    this.hm = city.hm;
    this.loadRadius = 260;
    this.winTex = makeWindowTexture();
    this.winTex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    this.matWin = new THREE.MeshLambertMaterial({ vertexColors: true, map: this.winTex });
    this.matPlain = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.matAtlas = new THREE.MeshLambertMaterial({ vertexColors: true, map: getAtlas(renderer) });
    this.matFoliage = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }); // hojas de palmera
    this.root = new THREE.Group();
    scene.add(this.root);
    this.nx = Math.ceil((TERRAIN_MAX_X - TERRAIN_MIN) / TILE);
    this.nz = Math.ceil((TERRAIN_MAX_Z - TERRAIN_MIN) / TILE);
    this.tiles = new Map();
    this.queue = [];
    this.frame = 0;
    this.index();
    this.addWater();
  }

  setViewDistance(d) { this.loadRadius = d + 40; }

  tileKey(x, z) {
    const i = Math.floor((x - TERRAIN_MIN) / TILE), j = Math.floor((z - TERRAIN_MIN) / TILE);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return null;
    return i + ',' + j;
  }

  tile(key) {
    let t = this.tiles.get(key);
    if (!t) {
      const [i, j] = key.split(',').map(Number);
      t = { key, i, j, x0: TERRAIN_MIN + i * TILE, z0: TERRAIN_MIN + j * TILE, lots: [], sites: [], props: [], pieces: [], caps: [], base: null, detail: null };
      this.tiles.set(key, t);
    }
    return t;
  }

  // Reparte todo en mosaicos y precalcula intersecciones de calles
  index() {
    for (let i = 0; i < this.nx; i++) for (let j = 0; j < this.nz; j++) this.tile(i + ',' + j);
    const add = (x, z, list, item) => { const k = this.tileKey(x, z); if (k) this.tile(k)[list].push(item); };
    for (const l of this.city.lots) add(l.cx, l.cz, 'lots', l);
    for (const s of this.city.sites) add(s.cx, s.cz, 'sites', s);
    for (const p of this.city.props) add(p.x, p.z, 'props', p);
    for (const cp of this.city.caps || []) add(cp.cx, cp.cz, 'caps', cp);
    const net = this.city.net;
    // en los quiebres de una calle los tramos se alargan un poco para no dejar cuñas abiertas
    const segs = net.segs;
    for (let k = 0; k < segs.length; k++) {
      const seg = segs[k], road = seg.road, half = road.w / 2 + road.sw;
      const ext = (o) => {
        if (!o || o.road !== road) return 0;
        const cos = Math.max(-1, Math.min(1, o.ux * seg.ux + o.uz * seg.uz));
        return Math.min(3, half * Math.tan(Math.acos(cos) / 2)) + 0.05;
      };
      let prev = segs[k - 1], next = segs[k + 1];
      if (!prev || prev.road !== road || Math.hypot(prev.bx - seg.ax, prev.bz - seg.az) > 0.01) prev = road.closed ? segs.find((q) => q.road === road && Math.hypot(q.bx - seg.ax, q.bz - seg.az) < 0.01) : null;
      if (!next || next.road !== road || Math.hypot(next.ax - seg.bx, next.az - seg.bz) > 0.01) next = road.closed ? segs.find((q) => q.road === road && Math.hypot(q.ax - seg.bx, q.az - seg.bz) < 0.01) : null;
      seg.extA = ext(prev); seg.extB = ext(next);
    }
    for (const seg of net.segs) {
      const road = seg.road;
      const half = road.w / 2;
      seg.free = {
        c: freeIntervals(net.blockedIntervals(seg, 0, 1.5)),
        l: road.sw > 0 ? freeIntervals(net.blockedIntervals(seg, half + road.sw / 2, 0)) : [],
        r: road.sw > 0 ? freeIntervals(net.blockedIntervals(seg, -(half + road.sw / 2), 0)) : [],
      };
      const n = Math.max(1, Math.ceil(seg.L / 12));
      for (let k = 0; k < n; k++) {
        const s0 = (k / n) * seg.L, s1 = ((k + 1) / n) * seg.L;
        const m = (s0 + s1) / 2;
        add(seg.ax + seg.ux * m, seg.az + seg.uz * m, 'pieces', { seg, s0, s1 });
      }
    }
  }

  distToTile(t, x, z) {
    const dx = Math.max(t.x0 - x, 0, x - (t.x0 + TILE));
    const dz = Math.max(t.z0 - z, 0, z - (t.z0 + TILE));
    return Math.hypot(dx, dz);
  }

  update(x, z, budgetMs = 4) {
    this.frame++;
    if (this.frame % 8 === 1) {
      const want = [];
      for (const t of this.tiles.values()) {
        const d = this.distToTile(t, x, z);
        if (d <= this.loadRadius) {
          const lod = d <= LOD_IN ? 'near' : d >= LOD_OUT ? 'far' : (t.lod || 'far');
          if (!t.base || t.lod !== lod) want.push({ t, d: t.base ? d + 20 : d, kind: 'base', lod });
          if (d <= NEAR && !t.detail) want.push({ t, d: d + 5, kind: 'detail' });
        } else if (t.base && d > this.loadRadius + 60) this.unload(t, 'base');
        if (t.detail && d > NEAR + 40) this.unload(t, 'detail');
      }
      want.sort((a, b) => a.d - b.d);
      this.queue = want;
    }
    const t0 = performance.now();
    while (this.queue.length) {
      const job = this.queue.shift();
      if (job.kind === 'base' ? (job.t.base && job.t.lod === job.lod) : job.t[job.kind]) continue;
      this.build(job.t, job.kind, job.lod);
      if (performance.now() - t0 > budgetMs) break;
    }
  }

  async preload(x, z, onProgress) {
    const list = [];
    for (const t of this.tiles.values()) {
      const d = this.distToTile(t, x, z);
      if (d <= Math.min(this.loadRadius, 190)) list.push({ t, d });
    }
    list.sort((a, b) => a.d - b.d);
    for (let k = 0; k < list.length; k++) {
      this.build(list[k].t, 'base', list[k].d <= LOD_IN ? 'near' : 'far');
      if (list[k].d <= NEAR) this.build(list[k].t, 'detail');
      if (k % 3 === 2) { onProgress?.(k / list.length); await new Promise((r) => setTimeout(r, 0)); }
    }
    onProgress?.(1);
  }

  unload(t, kind) {
    const g = t[kind];
    if (!g) return;
    this.root.remove(g);
    g.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose();
        if (o.userData.ownMaterial) { o.material.map?.dispose(); o.material.dispose(); }
      }
    });
    t[kind] = null;
  }

  build(t, kind, lod = 'near') {
    const group = new THREE.Group();
    const P = new GeoBuilder(false);
    P.F = new GeoBuilder(false); // follaje de doble cara
    const T = kind === 'detail' || lod === 'near' ? new GeoBuilder(true) : null; // ventanas/puertas con textura (cerca)
    if (kind === 'base') {
      const far = lod === 'far';
      const W = new GeoBuilder(true);
      this.terrain(P, t, far);
      for (const pc of t.pieces) this.roadPiece(P, pc, far);
      for (const l of t.lots) renderParts(P, W, l, l.parts, false, null, far, T);
      for (const s of t.sites) renderParts(P, W, s, s.parts, false, null, far, T);
      for (const cp of t.caps) { this.capPiece(P, cp, far); renderParts(P, W, cp, cp.parts, false, null, far, T); }
      for (const p of t.props) if (!p.det && !DETAIL_PROPS.has(p.type) && !(far && FAR_SKIP.has(p.type))) this.prop(P, p, far);
      if (W.vertexCount) group.add(staticMesh(W.build(), this.matWin));
    } else {
      const signs = [];
      for (const l of t.lots) renderParts(P, null, l, l.parts, true, signs, false, T);
      for (const s of t.sites) renderParts(P, null, s, s.parts, true, signs, false, T);
      for (const l of t.lots) collectSigns(l, signs);
      for (const s of t.sites) collectSigns(s, signs);
      for (const cp of t.caps) { renderParts(P, null, cp, cp.parts, true, signs, false, T); collectSigns(cp, signs); }
      for (const p of t.props) if (p.det || DETAIL_PROPS.has(p.type)) this.prop(P, p);
      if (signs.length) group.add(signMesh(signs));
    }
    if (P.vertexCount) group.add(staticMesh(P.build(), this.matPlain));
    if (T && T.vertexCount) group.add(staticMesh(T.build(), this.matAtlas));
    if (P.F.vertexCount) group.add(staticMesh(P.F.build(), this.matFoliage));
    this.root.add(group);
    if (t[kind]) this.unload(t, kind); // reemplazo sin huecos al cambiar de calidad
    t[kind] = group;
    if (kind === 'base') t.lod = lod;
  }

  prop(P, p, far = false) {
    const proto = PROTO(p.type, p.c, far, p.v ?? ((Math.round(p.x * 7.3) * 31 + Math.round(p.z * 5.1)) >>> 0));
    if (proto) P.addProto(proto, p.x, p.y ?? this.hm.height(p.x, p.z), p.z, p.r || 0, p.sc || 1);
  }

  // ---------- terreno ----------
  terrain(P, t, far = false) {
    const hm = this.hm, st = far ? 2 : 1, res = hm.res * st;
    const i0 = Math.round((t.x0 - hm.x0) / hm.res), j0 = Math.round((t.z0 - hm.z0) / hm.res);
    const n = TILE / hm.res;
    // bajo calles y banquetas el terreno se dibuja más bajo: nunca asoma por el asfalto
    if (!t.low) t.low = this.lowered(t, i0, j0, n);
    const low = t.low, ln = n + 1;
    const H = (i, j) => hm.h[Math.min(j, hm.nz - 1) * hm.nx + Math.min(i, hm.nx - 1)] - low[Math.min(j - j0, n) * ln + Math.min(i - i0, n)];
    for (let j = j0; j < j0 + n && j < hm.nz - 1; j += st) {
      for (let i = i0; i < i0 + n && i < hm.nx - 1; i += st) {
        const x = hm.x0 + i * hm.res, z = hm.z0 + j * hm.res;
        const h00 = H(i, j), h10 = H(i + st, j), h01 = H(i, j + st), h11 = H(i + st, j + st);
        if (h00 < -3 && h10 < -3 && h01 < -3 && h11 < -3) continue; // fondo marino profundo
        const a = [x, h00, z], b = [x + res, h10, z], c = [x + res, h11, z + res], d = [x, h01, z + res];
        // dos triángulos, diagonal (i,j)-(i+1,j+1) igual que la física
        const c1 = this.groundColor(x + res * 0.66, z + res * 0.33, (h00 + h10 + h11) / 3, Math.abs(h10 - h00) + Math.abs(h11 - h10));
        const c2 = this.groundColor(x + res * 0.33, z + res * 0.66, (h00 + h01 + h11) / 3, Math.abs(h01 - h00) + Math.abs(h11 - h01));
        P.tri(a, c, b, faceNormal(a, c, b), c1);
        P.tri(a, d, c, faceNormal(a, d, c), c2);
      }
    }
  }

  // Cuánto se baja (solo visualmente) cada vértice del terreno de un mosaico
  lowered(t, i0, j0, n) {
    const hm = this.hm, net = this.city.net, ln = n + 1;
    const out = new Float32Array(ln * ln);
    const caps = this.city.caps || [];
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
      const x = hm.x0 + (i0 + i) * hm.res, z = hm.z0 + (j0 + j) * hm.res;
      const { c } = net.clearance(x, z);
      let on = c < 0.4;
      if (!on) for (const cp of caps) if (cp.type === 'street' && Math.hypot(x - cp.cx, z - cp.cz) < cp.R + cp.sw + 0.4) { on = true; break; }
      out[j * ln + i] = on ? 0.3 : 0;
    }
    return out;
  }

  groundColor(x, z, h, slope) {
    const n = fbm(x * 0.03, z * 0.03, 5, 2);
    let base;
    const ld = landDist(x, z);
    if (h < 0.15) base = 0xbfae82;                                         // fondo cerca de la orilla
    else if (isSandy(x, z) && ld < 70 && h < 4) base = h < 0.8 ? 0xd9c693 : 0xe6d6a8;   // playa
    else if (lakeDist(x, z) > -4 && h < LAKE_LEVEL + 1.5) base = 0xa99d7c;  // orilla del lago
    else if (!playable(x, z, -2)) {
      // sierra: roca en lo empinado, pasto alpino arriba, bosque abajo
      base = slope > 2.4 ? 0x8b8778 : h > 55 ? 0x8a9466 : h > 30 ? 0x6f8c4c : 0x5f8a45;
      if (ld < 14 && h < 5) base = 0x9a9077;                               // acantilado / costa rocosa
    } else {
      const d = districtAt(x, z);
      base = GROUND[d] ?? 0x6e9f4c;
      // barrio popular y campo: manchas de pasto entre la tierra (no un llano uniforme)
      if ((d === 'popular' || d === 'campo' || d === 'montana') && fbm(x * 0.06, z * 0.06, 9, 2) > 0.05) base = d === 'popular' ? 0x86a058 : 0x7f9a50;
      if (slope > 2.6) base = 0x8b8778;
    }
    return shade(base, 0.93 + n * 0.14);
  }

  // ---------- calles ----------
  roadPiece(P, pc, far = false) {
    const { seg, s0, s1 } = pc;
    const road = seg.road;
    const hm = this.hm;
    const half = road.w / 2;
    const ux = seg.ux, uz = seg.uz, nx = -uz, nz = ux;
    const at = (s, off) => { const x = seg.ax + ux * s + nx * off, z = seg.az + uz * s + nz * off; return [x, hm.height(x, z), z]; };
    const asphalt = road.cls === 'callejon' ? CONCRETE : road.cls === 'boulevard' ? 0x4b4f55 : ASPHALT;
    // en pendiente el terreno se curva entre muestras: elevamos un poco más para que no asome
    // altura constante sobre el terreno: continua entre tramos (el terreno de abajo ya se dibuja más bajo)
    const lift = 0.04;
    this.lift = lift;
    // franjas a lo ancho (cerca: cada ~2.5 m) para que la calle siga al terreno sin que asome el pasto
    const cols = far ? 2 : Math.max(2, Math.ceil(road.w / 2.5));
    const e0 = s0 <= 0.001 ? s0 - (seg.extA || 0) : s0, e1 = s1 >= seg.L - 0.001 ? s1 + (seg.extB || 0) : s1;
    const steps = Math.max(1, Math.ceil((e1 - e0) / (far ? 12 : 3)));
    let prev = null;
    for (let k = 0; k <= steps; k++) {
      const a = e0 + ((e1 - e0) * k) / steps;
      const row = [];
      for (let ci = 0; ci <= cols; ci++) { const q = at(a, half - (road.w * ci) / cols); q[1] += lift; row.push(q); }
      if (prev) for (let ci = 0; ci < cols; ci++) P.quad(row[ci + 1], row[ci], prev[ci], prev[ci + 1], [0, 1, 0], asphalt);
      prev = row;
    }
    // banquetas con bordillo
    if (road.sw > 0) {
      for (const side of [1, -1]) {
        for (const [f0, f1] of seg.free[side > 0 ? 'l' : 'r']) {
          let a = Math.max(s0, f0 * seg.L), b = Math.min(s1, f1 * seg.L);
          if (b - a < 0.3) continue;
          if (a <= 0.001) a -= seg.extA || 0;
          if (b >= seg.L - 0.001) b += seg.extB || 0;
          const st = Math.max(1, Math.ceil((b - a) / (far ? 12 : 4)));
          for (let k = 0; k < st; k++) {
            const sa = a + ((b - a) * k) / st, sb = a + ((b - a) * (k + 1)) / st;
            const ia = at(sa, side * half), ib = at(sb, side * half);
            const oa = at(sa, side * (half + road.sw)), ob = at(sb, side * (half + road.sw));
            for (const p of [ia, ib, oa, ob]) p[1] += lift + 0.075;
            P.quad(ia, ib, ob, oa, [0, 1, 0], SIDEWALK);
            if (!far) {
              P.quad([ia[0], ia[1] - 0.12, ia[2]], [ib[0], ib[1] - 0.12, ib[2]], ib, ia, [-nx * side, 0, -nz * side], CURB);
              // bordillo claro y juntas de la banqueta cada ~2.5 m
              const ca = at(sa, side * (half + 0.22)), cb = at(sb, side * (half + 0.22));
              ca[1] = ia[1] + 0.006; cb[1] = ib[1] + 0.006;
              P.quad([ia[0], ia[1] + 0.006, ia[2]], [ib[0], ib[1] + 0.006, ib[2]], cb, ca, [0, 1, 0], CURB);
              if (road.sw >= 1.5) for (let q = Math.ceil(sa / 2.5) * 2.5; q < sb; q += 2.5) {
                const j0 = at(q, side * (half + 0.22)), j1 = at(q, side * (half + road.sw)), j2 = at(q + 0.06, side * (half + road.sw)), j3 = at(q + 0.06, side * (half + 0.22));
                for (const pp of [j0, j1, j2, j3]) pp[1] += lift + 0.081;
                P.quad(j0, j3, j2, j1, [0, 1, 0], JOINT);
              }
            }
          }
        }
      }
    }
    if (far) return;
    // marcas viales
    if (road.mark !== 'none') {
      for (const [f0, f1] of seg.free.c) {
        const a = Math.max(s0, f0 * seg.L + 1.5), b = Math.min(s1, f1 * seg.L - 1.5);
        if (b - a < 0.5) continue;
        if (road.mark === 'yellow2') {
          for (const off of [-0.16, 0.16]) this.stripe(P, at, a, b, off, 0.12, LINE_Y);
          // carriles: línea discontinua entre carriles y línea de orilla continua
          if (road.w >= 13) for (const off of [-road.w / 4, road.w / 4]) for (let s = Math.ceil(a / 9) * 9; s < b; s += 9) this.stripe(P, at, s, Math.min(s + 4.5, b), off, 0.13, LINE_W);
        } else {
          for (let s = Math.ceil(a / 6) * 6; s < b; s += 6) this.stripe(P, at, s, Math.min(s + 3, b), 0, 0.14, LINE_W);
        }
        if (road.w >= 8.5) for (const off of [-(half - 0.35), half - 0.35]) this.stripe(P, at, a, b, off, 0.11, 0xd9d9d2);
      }
    }
    // pasos de cebra a la entrada de los cruces
    if (road.cls !== 'callejon' && road.cls !== 'subida' && road.w >= 8 && seg.L >= 20) {
      for (const [f0, f1] of seg.free.c) {
        for (const [edge, dir] of [[f0 * seg.L, 1], [f1 * seg.L, -1]]) {
          if (edge <= 0.5 && dir > 0) continue;
          if (edge >= seg.L - 0.5 && dir < 0) continue;
          const z0 = edge + dir * 1.2, z1 = edge + dir * 4.2;
          const mid = (z0 + z1) / 2;
          if (mid < s0 || mid >= s1) continue;
          for (let off = -half + 0.8; off < half - 0.5; off += 1.2) this.stripe(P, at, Math.min(z0, z1), Math.max(z0, z1), off + 0.3, 0.6, LINE_W);
        }
      }
    }
  }

  // Retorno de calle cerrada: disco de asfalto con banqueta y bordillo en el lado del fondo
  capPiece(P, cp, far = false) {
    if (cp.type !== 'street') return;
    const hm = this.hm, R = cp.R, sw = cp.sw;
    const c = Math.cos(cp.rot), s = Math.sin(cp.rot);
    const W = (lx, lz, dy) => { const x = cp.cx + lx * c + lz * s, z = cp.cz - lx * s + lz * c; return [x, hm.height(x, z) + dy, z]; };
    const n = far ? 10 : 20, lift = 0.03;
    const ctr = W(0, 0, lift);
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      P.tri(ctr, W(Math.sin(a0) * R, Math.cos(a0) * R, lift), W(Math.sin(a1) * R, Math.cos(a1) * R, lift), [0, 1, 0], ASPHALT);
    }
    if (sw <= 0) return;
    const m = far ? 6 : 12;
    for (let i = 0; i < m; i++) {
      const a0 = -Math.PI / 2 + (i / m) * Math.PI, a1 = -Math.PI / 2 + ((i + 1) / m) * Math.PI;
      const ia = W(Math.sin(a0) * R, Math.cos(a0) * R, lift + 0.075), ib = W(Math.sin(a1) * R, Math.cos(a1) * R, lift + 0.075);
      const oa = W(Math.sin(a0) * (R + sw), Math.cos(a0) * (R + sw), lift + 0.075), ob = W(Math.sin(a1) * (R + sw), Math.cos(a1) * (R + sw), lift + 0.075);
      P.quad(ia, ib, ob, oa, [0, 1, 0], SIDEWALK);
      if (!far) P.quad([ia[0], ia[1] - 0.1, ia[2]], [ib[0], ib[1] - 0.1, ib[2]], ib, ia, [-(Math.sin((a0 + a1) / 2) * c + Math.cos((a0 + a1) / 2) * s), 0, -(-Math.sin((a0 + a1) / 2) * s + Math.cos((a0 + a1) / 2) * c)], CURB);
    }
  }

  stripe(P, at, a, b, off, w, col) {
    const p1 = at(a, off - w / 2), p2 = at(a, off + w / 2), p3 = at(b, off + w / 2), p4 = at(b, off - w / 2);
    for (const p of [p1, p2, p3, p4]) p[1] += (this.lift || 0.05) + 0.02;
    P.quad(p1, p4, p3, p2, [0, 1, 0], col);
  }

  // ---------- mar ----------
  addWater() {
    const geo = new THREE.PlaneGeometry(6000, 6000, 1, 1).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshLambertMaterial({ color: 0x2b86b8, transparent: true, opacity: 0.86, depthWrite: false });
    this.water = new THREE.Mesh(geo, mat);
    this.water.position.y = this.city.seaLevel ?? 0;
    this.water.renderOrder = 2;
    this.scene.add(this.water);
    // espuma en la orilla del mar (siguiendo el contorno de la costa)
    const b = new GeoBuilder(false);
    for (const line of coastLines()) {
      let prev = null;
      for (let i = 0; i < line.length; i++) {
        const p = line[i], q = line[Math.min(line.length - 1, i + 1)], o = line[Math.max(0, i - 1)];
        let tx = q[0] - o[0], tz = q[1] - o[1];
        const L = Math.hypot(tx, tz) || 1; tx /= L; tz /= L;
        // normal hacia el mar
        let nx = -tz, nz = tx;
        if (landDist(p[0] + nx * 3, p[1] + nz * 3) > landDist(p[0] - nx * 3, p[1] - nz * 3)) { nx = -nx; nz = -nz; }
        const inner = [p[0] - nx * 1.4, 0.05, p[1] - nz * 1.4], outer = [p[0] + nx * 1.0, 0.05, p[1] + nz * 1.0];
        if (prev) b.quad(prev[0], prev[1], outer, inner, [0, 1, 0], 0xf2fbff);
        prev = [inner, outer];
      }
    }
    // lago de la presa (agua dulce, un poco más verde)
    // (rejilla de 8 m sobre el vaso del lago; la orilla del terreno tapa los bordes)
    const lb = new GeoBuilder(false);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of LAKE.pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const G = 8, Y = 0;
    for (let z = z0 - 16; z < z1 + 16; z += G) for (let x = x0 - 16; x < x1 + 16; x += G) {
      if (Math.max(lakeDist(x, z), lakeDist(x + G, z), lakeDist(x, z + G), lakeDist(x + G, z + G)) < -6) continue;
      lb.quad([x, Y, z], [x, Y, z + G], [x + G, Y, z + G], [x + G, Y, z], [0, 1, 0], 0x2f8a9c);
    }
    const lakeGeo = lb.build();
    this.lake = new THREE.Mesh(lakeGeo, new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.88, depthWrite: false }));
    this.lake.position.y = LAKE_LEVEL;
    this.lake.renderOrder = 2;
    this.scene.add(this.lake);
    const foam = new THREE.Mesh(b.build(), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }));
    foam.renderOrder = 3;
    this.scene.add(foam);
  }
}

function staticMesh(geo, mat) {
  const m = new THREE.Mesh(geo, mat);
  m.matrixAutoUpdate = false;
  return m;
}

function faceNormal(a, b, c) {
  const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  if (n[1] < 0) n = n.map((v) => -v);
  return n;
}

function collectSigns(obj, signs) {
  for (const p of obj.parts) {
    if (p.k !== 'sign' || p.det) continue;
    const c = Math.cos(obj.rot || 0), s = Math.sin(obj.rot || 0);
    signs.push({ x: obj.cx + p.x * c + p.z * s, y: obj.y0 + p.y, z: obj.cz - p.x * s + p.z * c, ry: (obj.rot || 0) + (p.r || 0), w: p.w, h: p.h, text: p.text, bg: p.bg, fg: p.fg });
  }
}

// Todos los letreros de un mosaico en una sola textura (1 llamada de dibujo)
function signMesh(signs) {
  const list = signs.slice(0, 16);
  const rows = list.length <= 4 ? 4 : list.length <= 8 ? 8 : 16;
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = rows * 64;
  const g = cv.getContext('2d');
  const b = new GeoBuilder(true);
  list.forEach((sg, i) => {
    const aspect = sg.w / sg.h;
    const pw = Math.min(512, Math.round(64 * aspect));
    const y = i * 64;
    g.fillStyle = sg.bg; g.fillRect(0, y, pw, 64);
    g.fillStyle = sg.fg || '#ffffff';
    let size = 40;
    const font = (s) => `800 ${s}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
    g.font = font(size);
    while (g.measureText(sg.text).width > pw * 0.9 && size > 10) { size -= 2; g.font = font(size); }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(sg.text, pw / 2, y + 33);
    const u1 = pw / 512, v0 = 1 - (i + 1) / rows, v1 = 1 - i / rows;
    const c = Math.cos(sg.ry), s = Math.sin(sg.ry);
    const hw = sg.w / 2;
    const P = (lx, ly) => [sg.x + lx * c, sg.y + ly, sg.z - lx * s];
    b.quad(P(-hw, -sg.h / 2), P(hw, -sg.h / 2), P(hw, sg.h / 2), P(-hw, sg.h / 2), [s, 0, c], 0xffffff, [[0, v0], [u1, v0], [u1, v1], [0, v1]]);
  });
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 2;
  const m = new THREE.Mesh(b.build(), new THREE.MeshBasicMaterial({ map: tex }));
  m.userData.ownMaterial = true;
  m.matrixAutoUpdate = false;
  return m;
}

// Textura de fachada: 4x4 ventanas con variaciones sobre pared blanca (se tiñe con el color del edificio)
function makeWindowTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 256);
  const glass = ['#3e5163', '#4a6178', '#56708a', '#40566b', '#5f7a93', '#6d8aa3'];
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let gy = 0; gy < 4; gy++) {
    for (let gx = 0; gx < 4; gx++) {
      const x = gx * 64, y = gy * 64;
      g.fillStyle = '#d9d9d9';
      g.fillRect(x + 9, y + 11, 46, 41);
      const base = glass[Math.floor(rnd() * glass.length)];
      const grd = g.createLinearGradient(x + 11, y + 13, x + 53, y + 50);
      grd.addColorStop(0, base);
      grd.addColorStop(0.55, rnd() < 0.3 ? '#8fb0c9' : base);
      grd.addColorStop(1, '#2c3a47');
      g.fillStyle = grd;
      g.fillRect(x + 11, y + 13, 42, 37);
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.fillRect(x + 31, y + 13, 2, 37);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export { mergeIntervals };
