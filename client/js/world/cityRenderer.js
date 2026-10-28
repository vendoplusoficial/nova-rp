// Dibuja Puerto Nova por MOSAICOS de 64 m: solo se construye lo cercano a la cámara.
//  - Base (todo mosaico visible): terreno, calles, edificios, árboles y objetos grandes.
//  - Detalle (solo cerca): mobiliario pequeño, adornos y letreros.
// Cada mosaico usa 2-4 llamadas de dibujo (geometría fusionada).

import * as THREE from 'three';
import { GeoBuilder, shade, lin, mixHex } from './geometry.js';
import { PROTO, FAR_SKIP } from './props.js';
import { drawHighwayPiece, drawPier } from './highwayRenderer.js';
import { renderParts } from './parts.js';
import { getAtlas, getAtlasNight } from './atlas.js';
import { WORLD_MIN_X, WORLD_MIN_Z, WORLD_MAX_X, WORLD_MAX_Z, regionAt, lakeShape, lakeLevel, riverAt, playable, landDist, lakeDist, isSandy, coastLines, LAKE_LEVEL, fbm } from '/shared/terrain.js';
import { LAKE } from '/shared/mapdata.js';
import { LAKES_PLAN, RIVERS_PLAN } from '/shared/worldplan.js';
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
const UP = [0, 1, 0], BLACK = [0, 0, 0];
// faroles: dónde está la cabeza (m hacia +Z local), radio y color del charco de luz
const LAMP_HEADS = {
  lamp: { at: [1.75], r: 6.5, c: 0xc8975a }, lampDouble: { at: [1.95, -1.95], r: 7, c: 0xc8975a }, lampColonial: { at: [0], r: 5, c: 0xd0965a },
  lampWood: { at: [1.3], r: 6, c: 0xc08a50 }, floodlight: { at: [3], r: 11, c: 0x9a9a9a },
};
// orilla de lago (arena/grava) o ribera del río; null si no hay agua cerca
function planShore(x, z, h) {
  for (const L of LAKES_PLAN) {
    if (Math.abs(x - L.center[0]) > L.rx * 1.6 || Math.abs(z - L.center[1]) > L.rz * 1.6) continue;
    const r = lakeShape(L, x, z);
    if (r < 1.3 && h < lakeLevel(L) + 1.6) return L.region === 'desierto' ? 0xd9c08a : 0xc2b089;
  }
  for (const R of RIVERS_PLAN) { const rv = riverAt(R, x, z); if (rv && rv.d < R.width / 2 + 7) return 0x8e8a76; }
  return null;
}
const inFineArea = (x, z) => x > -960 && x < 960 && z > -960 && z < 896;
const clampI = (v, a, b) => (v < a ? a : v > b ? b : v);
const smoothstepC = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const DETAIL_PROPS = new Set(['bench', 'bin', 'umbrellaBeach', 'towel', 'volleyball', 'buoy', 'mailbox', 'grill', 'lounger', 'crates', 'planter']);

export class CityRenderer {
  constructor(scene, city, renderer) {
    this.scene = scene;
    this.city = city;
    this.hm = city.hm;
    this.loadRadius = 260;
    const [winDay, winNight] = makeWindowTexture();
    this.winTex = winDay;
    this.winTex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    // de noche las ventanas encendidas brillan (mapa emisivo) y los focos de vértice "luz" también
    this.matWin = new THREE.MeshLambertMaterial({ vertexColors: true, map: this.winTex, emissive: 0xffffff, emissiveMap: winNight, emissiveIntensity: 0 });
    this.matPlain = glowMaterial(new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.matAtlas = new THREE.MeshLambertMaterial({ vertexColors: true, map: getAtlas(renderer), emissive: 0xffffff, emissiveMap: getAtlasNight(renderer), emissiveIntensity: 0 });
    // charcos de luz bajo los faroles (aditivos; solo de noche)
    this.matGlow = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.night = 0;
    this.matFoliage = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }); // hojas de palmera
    this.root = new THREE.Group();
    scene.add(this.root);
    // mosaicos sobre el mundo completo (las tres regiones)
    this.nx = Math.ceil((WORLD_MAX_X - WORLD_MIN_X) / TILE);
    this.nz = Math.ceil((WORLD_MAX_Z - WORLD_MIN_Z) / TILE);
    this.tiles = new Map();
    this.queue = [];
    this.frame = 0;
    this.index();
    this.addWater();
  }

  setViewDistance(d) { this.loadRadius = d + 40; }

  // 0 = pleno día, 1 = noche cerrada (lo controla el ciclo de horario)
  setNight(n) {
    this.night = n;
    // las luces se encienden de verdad ya entrada la tarde-noche (curva, no lineal)
    this.matAtlas.emissiveIntensity = n * n * 0.95;
    this.matWin.emissiveIntensity = n * n * 0.8;
    this.matPlain.userData.uNight.value = n;
    this.matGlow.opacity = n;
    this.matGlow.visible = n > 0.02;
  }

  tileKey(x, z) {
    const i = Math.floor((x - WORLD_MIN_X) / TILE), j = Math.floor((z - WORLD_MIN_Z) / TILE);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return null;
    return i + ',' + j;
  }

  tile(key) {
    let t = this.tiles.get(key);
    if (!t) {
      const [i, j] = key.split(',').map(Number);
      const x0 = WORLD_MIN_X + i * TILE, z0 = WORLD_MIN_Z + j * TILE;
      // malla del terreno: la fina de Puerto Nova (4 m) o la gruesa del mundo (8 m)
      t = { key, i, j, x0, z0, grid: this.city.world.gridFor(x0, z0, x0 + TILE, z0 + TILE), lots: [], sites: [], props: [], pieces: [], caps: [], hw: [], piers: [], base: null, detail: null };
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
    for (const pc of this.city.highways?.pieces || []) add(pc.cx, pc.cz, 'hw', pc);
    for (const pr of this.city.highways?.piers || []) add(pr.x, pr.z, 'piers', pr);
    const net = this.city.net;
    // en los quiebres de una calle las orillas se cortan a inglete: el lado interior se acorta y el
    // exterior se alarga lo justo para que asfalto y banqueta sigan la curva sin dientes ni huecos
    const segs = net.segs;
    for (let k = 0; k < segs.length; k++) {
      const seg = segs[k], road = seg.road;
      let prev = segs[k - 1], next = segs[k + 1];
      if (!prev || prev.road !== road || Math.hypot(prev.bx - seg.ax, prev.bz - seg.az) > 0.01) prev = road.closed ? segs.find((q) => q.road === road && Math.hypot(q.bx - seg.ax, q.bz - seg.az) < 0.01) : null;
      if (!next || next.road !== road || Math.hypot(next.ax - seg.bx, next.az - seg.bz) > 0.01) next = road.closed ? segs.find((q) => q.road === road && Math.hypot(q.ax - seg.bx, q.az - seg.bz) < 0.01) : null;
      const turn = (a, b) => { const phi = Math.atan2(a.ux * b.uz - a.uz * b.ux, a.ux * b.ux + a.uz * b.uz); return Math.tan(Math.max(-1.1, Math.min(1.1, phi)) / 2); };
      seg.tA = prev ? turn(prev, seg) : 0;    // giro al llegar al tramo
      seg.tB = next ? turn(seg, next) : 0;    // giro al salir del tramo
    }
    for (const seg of net.segs) {
      const road = seg.road;
      const half = road.w / 2;
      seg.free = {
        c: freeIntervals(net.blockedIntervals(seg, 0, 1.5)),
      };
      // banquetas: su orilla interior y exterior se recortan por separado contra el ASFALTO de
      // las otras calles; así la esquina queda cerrada y sigue el ángulo del cruce
      seg.walk = { l: road.sw > 0 ? walkPieces(net, seg, 1) : [], r: road.sw > 0 ? walkPieces(net, seg, -1) : [] };
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
      for (const pc of t.hw) drawHighwayPiece(P, this.city, pc, far);
      for (const pr of t.piers) drawPier(P, pr, far);
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
      const G = new GeoBuilder(false);
      for (const p of t.props) this.lightPool(G, p);
      if (G.vertexCount) { const m = staticMesh(G.build(), this.matGlow); m.renderOrder = 1; group.add(m); }
    }
    if (P.vertexCount) group.add(staticMesh(P.build(), this.matPlain));
    if (T && T.vertexCount) group.add(staticMesh(T.build(), this.matAtlas));
    if (P.F.vertexCount) group.add(staticMesh(P.F.build(), this.matFoliage));
    this.root.add(group);
    if (t[kind]) this.unload(t, kind); // reemplazo sin huecos al cambiar de calidad
    t[kind] = group;
    if (kind === 'base') t.lod = lod;
  }

  // Charco de luz cálida en el piso bajo la cabeza de cada farol (y de los reflectores)
  lightPool(G, p) {
    const L = LAMP_HEADS[p.type];
    if (!L) return;
    const r = p.r || 0, c = Math.cos(r), s = Math.sin(r);
    for (const lz of L.at) {
      const x = p.x + lz * s, z = p.z + lz * c;
      const ground = p.deck ? () => p.y - 1.0 : (gx, gz) => this.city.height(gx, gz);   // en los puentes: el tablero
      const y = ground(x, z) + 0.2;
      const n = 12, R = L.r;
      const mid = [x, y, z], col = lin(L.c);
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
        const e0 = [x + Math.sin(a0) * R, ground(x + Math.sin(a0) * R, z + Math.cos(a0) * R) + 0.2, z + Math.cos(a0) * R];
        const e1 = [x + Math.sin(a1) * R, ground(x + Math.sin(a1) * R, z + Math.cos(a1) * R) + 0.2, z + Math.cos(a1) * R];
        G.triV(mid, e0, e1, UP, UP, UP, col, BLACK, BLACK);
      }
    }
  }

  prop(P, p, far = false) {
    const proto = PROTO(p.type, p.c, far, p.v ?? ((Math.round(p.x * 7.3) * 31 + Math.round(p.z * 5.1)) >>> 0));
    if (proto) P.addProto(proto, p.x, p.y ?? this.city.height(p.x, p.z), p.z, p.r || 0, p.sc || 1);
  }

  // ---------- terreno ----------
  // Malla continua con normal y color POR VÉRTICE: las laderas se ven suaves (sin triángulos
  // sueltos de otro color) y los mosaicos vecinos coinciden exactamente en el borde.
  terrain(P, t, far = false) {
    const hm = t.grid, st = far ? 2 : 1;
    const i0 = Math.round((t.x0 - hm.x0) / hm.res), j0 = Math.round((t.z0 - hm.z0) / hm.res);
    const n = TILE / hm.res;
    // bajo calles y banquetas el terreno se dibuja más bajo: nunca asoma por el asfalto
    if (!t.low) t.low = this.lowered(t, i0, j0, n);
    const low = t.low, ln = n + 1;
    const raw = (i, j) => hm.h[clampI(j, 0, hm.nz - 1) * hm.nx + clampI(i, 0, hm.nx - 1)];
    const m = n / st + 1;
    const V = new Array(m * m), Nn = new Array(m * m), C = new Array(m * m);
    const holes = hm === this.city.world.coarse && this.city.highways?.holes.size ? this.city.highways.holes : null;   // celda -> altura de la losa
    const hasHole = (i, j) => { for (let q = 0; q < st; q++) for (let p = 0; p < st; p++) if (holes.has((j + q) * hm.nx + i + p)) return true; return false; };
    for (let b = 0; b < m; b++) for (let a = 0; a < m; a++) {
      const i = i0 + a * st, j = j0 + b * st;
      const x = hm.x0 + i * hm.res, z = hm.z0 + j * hm.res;
      const h = raw(i, j);
      // normal suave por diferencias centrales (8 m)
      const gx = (raw(i + 1, j) - raw(i - 1, j)) / (2 * hm.res), gz = (raw(i, j + 1) - raw(i, j - 1)) / (2 * hm.res);
      const L = Math.hypot(gx, 1, gz);
      const k = b * m + a;
      V[k] = [x, h - low[Math.min(j - j0, n) * ln + Math.min(i - i0, n)], z];
      Nn[k] = [-gx / L, 1 / L, -gz / L];
      C[k] = lin(this.groundColor(x, z, h, Math.hypot(gx, gz)));
    }
    for (let b = 0; b < m - 1; b++) {
      for (let a = 0; a < m - 1; a++) {
        const k00 = b * m + a, k10 = k00 + 1, k01 = k00 + m, k11 = k01 + 1;
        if (V[k00][1] < -3 && V[k10][1] < -3 && V[k01][1] < -3 && V[k11][1] < -3) continue; // fondo marino profundo
        if (holes && hasHole(i0 + a * st, j0 + b * st)) continue;                              // boca de un túnel
        // dos triángulos, diagonal (i,j)-(i+1,j+1) igual que la física
        P.triV(V[k00], V[k11], V[k10], Nn[k00], Nn[k11], Nn[k10], C[k00], C[k11], C[k10]);
        P.triV(V[k00], V[k01], V[k11], Nn[k00], Nn[k01], Nn[k11], C[k00], C[k01], C[k11]);
      }
    }
    // bocas de túnel: el hueco se tapa con una losa (visera) y muros de roca hasta el terreno vecino;
    // de frente queda abierta la boca (dentro del ancho del túnel)
    if (holes) {
      for (let cj = j0; cj < j0 + n; cj++) for (let ci = i0; ci < i0 + n; ci++) {
        const H = holes.get(cj * hm.nx + ci);
        if (!H) continue;
        const pt = (i, j, y) => [hm.x0 + i * hm.res, y ?? raw(i, j), hm.z0 + j * hm.res];
        // losa de doble cara (se ve desde arriba y desde la boca)
        for (const ny of [1, -1]) P.quad(pt(ci, cj, H.slab), pt(ci + 1, cj, H.slab), pt(ci + 1, cj + 1, H.slab), pt(ci, cj + 1, H.slab), [0, ny, 0], 0x8a8478);
        [[0, 0, 1, 0, 0, -1], [1, 0, 1, 1, 1, 0], [1, 1, 0, 1, 0, 1], [0, 1, 0, 0, -1, 0]].forEach(([a0, b0, a1, b1, ni, nj], e) => {
          if (holes.has((cj + nj) * hm.nx + ci + ni) || H.open[e]) return;   // borde interior o la boca
          const A = pt(ci + a0, cj + b0), Bv = pt(ci + a1, cj + b1);
          for (const s of [1, -1]) P.quad(A, Bv, [Bv[0], H.slab, Bv[2]], [A[0], H.slab, A[2]], [ni * s, 0, nj * s], 0x7a7062);
        });
      }
    }
    // faldón: franja vertical bajo el borde del mosaico; tapa las grietas entre mosaicos de
    // distinta calidad (cerca/lejos), sobre todo en montañas
    const D = hm.res >= 8 ? 6 : 1.5;
    const edges = [[0, 1, 0, 0], [0, 1, m - 1, 0], [0, 0, 0, 1], [m - 1, 0, 0, 1]];   // [a0, da, b0, db]
    for (const [a0, da, b0, db] of edges) {
      for (let q = 0; q < m - 1; q++) {
        const ka = (b0 + db * q) * m + (a0 + da * q), kb = (b0 + db * (q + 1)) * m + (a0 + da * (q + 1));
        const A = V[ka], Bv = V[kb];
        if (A[1] < -3 && Bv[1] < -3) continue;
        const A2 = [A[0], A[1] - D, A[2]], B2 = [Bv[0], Bv[1] - D, Bv[2]];
        P.triV(A, Bv, B2, Nn[ka], Nn[kb], Nn[kb], C[ka], C[kb], C[kb], [da ? 0 : (a0 ? 1 : -1), 0, db ? 0 : (b0 ? 1 : -1)]);
        P.triV(A, B2, A2, Nn[ka], Nn[kb], Nn[ka], C[ka], C[kb], C[ka], [da ? 0 : (a0 ? 1 : -1), 0, db ? 0 : (b0 ? 1 : -1)]);
      }
    }
  }

  // Cuánto se baja (solo visualmente) cada vértice del terreno de un mosaico
  lowered(t, i0, j0, n) {
    const hm = t.grid, net = this.city.net, ln = n + 1;
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

  // slope = pendiente (desnivel / distancia). Roca y tierra se mezclan poco a poco con el pasto.
  groundColor(x, z, h, slope) {
    const n = fbm(x * 0.03, z * 0.03, 5, 2);
    let base, reg, shore;
    const ld = landDist(x, z);
    if (h < 0.15) base = 0xbfae82;                                         // fondo cerca de la orilla
    else if (isSandy(x, z) && ld < 70 && h < 4) base = mixHex(0xd9c693, 0xe6d6a8, smoothstepC(0.5, 1.1, h));   // playa
    else if (lakeDist(x, z) > -4 && h < LAKE_LEVEL + 1.5) base = 0xa99d7c;  // orilla del lago
    else if (!inFineArea(x, z) && (shore = planShore(x, z, h))) base = shore;               // orillas de lagos y río
    else if ((reg = regionAt(x, z)) === 'desierto') {
      // desierto: arena dorada, tierra ocre y roca rojiza en las laderas y terrazas
      const k = fbm(x * 0.004, z * 0.004, 91, 3);
      base = mixHex(0xd8b878, 0xc9a066, smoothstepC(-0.2, 0.3, k));
      base = mixHex(base, 0xe3c58b, smoothstepC(0.15, 0.45, fbm(x * 0.012, z * 0.012, 93, 2)));
      base = mixHex(base, 0xb5784a, smoothstepC(0.25, 0.6, slope));
      base = mixHex(base, 0x8a5136, smoothstepC(0.7, 1.2, slope));
      base = mixHex(base, 0xa86a42, smoothstepC(25, 70, h) * 0.5);                             // estratos altos más rojizos
      if (ld < 30 && h < 3) base = mixHex(0xe6d3a0, base, ld / 30);
    } else if (reg === 'montana' && !inFineArea(x, z)) {
      // montaña: pastizal en los valles, bosque oscuro en las laderas, roca y pradera alpina arriba
      base = h > 140 ? mixHex(0x5e7a45, 0x8f9a7a, smoothstepC(140, 220, h)) : mixHex(0x5f8f45, 0x3c6a37, smoothstepC(20, 80, h));
      base = mixHex(base, 0x4f7536, smoothstepC(-0.1, 0.4, fbm(x * 0.008, z * 0.008, 95, 2)) * 0.5);
      base = mixHex(base, 0x878274, smoothstepC(0.85, 1.35, slope) * (0.6 + 0.4 * smoothstepC(60, 160, h)));
      base = mixHex(base, 0xb9bcb8, smoothstepC(200, 235, h) * 0.6);                       // cumbres claras
      if (ld < 14 && h < 5) base = 0x9a9077;
    } else if (!playable(x, z, -2)) {
      // sierra: bosque abajo, pasto alpino arriba y roca en lo empinado
      base = h > 55 ? mixHex(0x6f8c4c, 0x8a9466, smoothstepC(55, 75, h)) : mixHex(0x5f8a45, 0x6f8c4c, smoothstepC(22, 40, h));
      base = mixHex(base, 0x8b8778, smoothstepC(0.55, 1.0, slope));
      if (ld < 14 && h < 5) base = 0x9a9077;                               // acantilado / costa rocosa
    } else {
      const d = districtAt(x, z);
      base = GROUND[d] ?? 0x6e9f4c;
      // barrio popular y campo: manchas de pasto entre la tierra (no un llano uniforme)
      if (d === 'popular' || d === 'campo' || d === 'montana') base = mixHex(base, d === 'popular' ? 0x86a058 : 0x7f9a50, smoothstepC(-0.05, 0.15, fbm(x * 0.06, z * 0.06, 9, 2)));
      // taludes: con pasto (no pavimento) y tierra en lo muy empinado
      base = mixHex(base, 0x6f9c4b, smoothstepC(0.18, 0.45, slope));
      base = mixHex(base, 0x9a8f74, smoothstepC(0.75, 1.2, slope));
    }
    return shade(base, 0.94 + n * 0.12);
  }

  // ---------- calles ----------
  roadPiece(P, pc, far = false) {
    const { seg, s0, s1 } = pc;
    const road = seg.road;
    const hm = { height: this.city.height };
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
    // inicio y fin de cada franja según su desplazamiento (inglete en los quiebres)
    const S0 = (off) => (s0 <= 0.001 ? miterA(seg, off) : s0), S1 = (off) => (s1 >= seg.L - 0.001 ? miterB(seg, off) : s1);
    const steps = Math.max(1, Math.ceil((s1 - s0) / (far ? 12 : 3)));
    let prev = null;
    for (let k = 0; k <= steps; k++) {
      const row = [];
      for (let ci = 0; ci <= cols; ci++) {
        const off = half - (road.w * ci) / cols, a0 = S0(off);
        const q = at(a0 + ((S1(off) - a0) * k) / steps, off); q[1] += lift; row.push(q);
      }
      if (prev) for (let ci = 0; ci < cols; ci++) P.quad(row[ci + 1], row[ci], prev[ci], prev[ci + 1], [0, 1, 0], asphalt);
      prev = row;
    }
    // banquetas con bordillo (trapecios: la orilla interior y la exterior terminan donde empieza
    // el asfalto de la calle que cruza)
    if (road.sw > 0) {
      const lo = s0 <= 0.001 ? -Infinity : s0, hi = s1 >= seg.L - 0.001 ? Infinity : s1;
      for (const side of [1, -1]) {
        for (const [i0, i1, o0, o1] of seg.walk[side > 0 ? 'l' : 'r']) {
          // parámetro u∈[0,1] a lo largo de la pieza; este mosaico dibuja la parte cuyo centro cae en [s0,s1)
          const m0 = (i0 + o0) / 2, dm = (i1 + o1) / 2 - m0;
          if (dm < 0.05) continue;
          const ua = Math.max(0, (lo - m0) / dm), ub = Math.min(1, (hi - m0) / dm);
          if (ub - ua < 1e-4) continue;
          const st = Math.max(1, Math.ceil(((ub - ua) * dm) / (far ? 12 : 4)));
          const IN = (u) => i0 + (i1 - i0) * u, OUT = (u) => o0 + (o1 - o0) * u;
          for (let k = 0; k < st; k++) {
            const u0 = ua + ((ub - ua) * k) / st, u1 = ua + ((ub - ua) * (k + 1)) / st;
            const ia = at(IN(u0), side * half), ib = at(IN(u1), side * half);
            const oa = at(OUT(u0), side * (half + road.sw)), ob = at(OUT(u1), side * (half + road.sw));
            for (const p of [ia, ib, oa, ob]) p[1] += lift + 0.075;
            P.quad(ia, ib, ob, oa, [0, 1, 0], SIDEWALK);
            if (far) continue;
            P.quad([ia[0], ia[1] - 0.12, ia[2]], [ib[0], ib[1] - 0.12, ib[2]], ib, ia, [-nx * side, 0, -nz * side], CURB);
            // bordillo claro
            const f = 0.22 / road.sw;
            const ca = at(IN(u0) + (OUT(u0) - IN(u0)) * f, side * (half + 0.22)), cb = at(IN(u1) + (OUT(u1) - IN(u1)) * f, side * (half + 0.22));
            ca[1] = ia[1] + 0.006; cb[1] = ib[1] + 0.006;
            P.quad([ia[0], ia[1] + 0.006, ia[2]], [ib[0], ib[1] + 0.006, ib[2]], cb, ca, [0, 1, 0], CURB);
          }
          // juntas cada ~2.5 m
          if (!far && road.sw >= 1.5) {
            const du = 2.5 / dm;
            for (let u = Math.ceil(ua / du) * du; u < ub; u += du) {
              const si = IN(u) + (OUT(u) - IN(u)) * (0.22 / road.sw), so = OUT(u);
              const j0 = at(si, side * (half + 0.22)), j1 = at(so, side * (half + road.sw)), j2 = at(so + 0.06, side * (half + road.sw)), j3 = at(si + 0.06, side * (half + 0.22));
              for (const pp of [j0, j1, j2, j3]) pp[1] += lift + 0.081;
              P.quad(j0, j3, j2, j1, [0, 1, 0], JOINT);
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
    const hm = { height: this.city.height }, R = cp.R, sw = cp.sw;
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
    const geo = new THREE.PlaneGeometry(16000, 16000, 1, 1).rotateX(-Math.PI / 2);
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
    // lagos y río de las regiones nuevas (alturas absolutas: cada uno tiene su nivel)
    for (const L of LAKES_PLAN) {
      const lv = lakeLevel(L) - LAKE_LEVEL, G2 = 6;
      for (let z = L.center[1] - L.rz * 1.4; z < L.center[1] + L.rz * 1.4; z += G2) for (let x = L.center[0] - L.rx * 1.4; x < L.center[0] + L.rx * 1.4; x += G2) {
        if (Math.min(lakeShape(L, x, z), lakeShape(L, x + G2, z), lakeShape(L, x, z + G2), lakeShape(L, x + G2, z + G2)) > 1.08) continue;
        lb.quad([x, lv, z], [x, lv, z + G2], [x + G2, lv, z + G2], [x + G2, lv, z], [0, 1, 0], L.region === 'desierto' ? 0x2f9aa0 : 0x2f8a9c);
      }
    }
    for (const R of RIVERS_PLAN) {
      // cinta de agua siguiendo el cauce (baja hacia el mar)
      let prev = null;
      const pts = [];
      for (let i = 0; i < R.pts.length - 1; i++) { const a = R.pts[i], b = R.pts[i + 1], n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 8); for (let k = 0; k < n; k++) pts.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]); }
      pts.push(R.pts[R.pts.length - 1]);
      pts.forEach((p, i) => {
        const q = pts[Math.min(pts.length - 1, i + 1)], o = pts[Math.max(0, i - 1)];
        let tx = q[0] - o[0], tz = q[1] - o[1]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
        const rv = riverAt(R, p[0], p[1]), y = (rv ? rv.water : 0) - LAKE_LEVEL, w = R.width / 2 + 2;
        const cur = [[p[0] - tz * w, y, p[1] + tx * w], [p[0] + tz * w, y, p[1] - tx * w]];
        if (landDist(p[0], p[1]) < -4) { prev = null; return; }   // la desembocadura ya es mar
        if (prev) lb.quad(prev[0], prev[1], cur[1], cur[0], [0, 1, 0], 0x3a8fa8);
        prev = cur;
      });
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

// Corte a inglete: dónde empieza/termina la línea desplazada "off" (izquierda +) de un tramo
const miterA = (seg, off) => off * (seg.tA || 0);
const miterB = (seg, off) => seg.L - off * (seg.tB || 0);

// Piezas de banqueta de un lado del tramo: [ini, fin] de la orilla interior y de la exterior (m)
function walkPieces(net, seg, side) {
  const road = seg.road, half = road.w / 2;
  const toM = (list) => list.map(([a, b]) => [a * seg.L, b * seg.L]);
  const inner = toM(freeIntervals(net.blockedIntervals(seg, side * (half + 0.05), 0.05, true)));
  const outer = toM(freeIntervals(net.blockedIntervals(seg, side * (half + road.sw), 0.05, true)));
  const out = [];
  const slack = road.sw * 2.5;
  for (const I of inner) for (const O of outer) {
    if (O[1] < I[0] - slack || O[0] > I[1] + slack) continue;
    const i0 = Math.max(I[0], O[0] - slack), i1 = Math.min(I[1], O[1] + slack);
    const o0 = Math.max(O[0], I[0] - slack), o1 = Math.min(O[1], I[1] + slack);
    if (i1 - i0 < 0.3 && o1 - o0 < 0.3) continue;
    const offI = side * half, offO = side * (half + road.sw);
    out.push([i0 <= 0.001 ? miterA(seg, offI) : i0, i1 >= seg.L - 0.001 ? miterB(seg, offI) : i1, o0 <= 0.001 ? miterA(seg, offO) : o0, o1 >= seg.L - 0.001 ? miterB(seg, offO) : o1]);
  }
  return out;
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
  cv.width = 528; cv.height = rows * 64;
  const g = cv.getContext('2d');
  g.fillStyle = '#4a4f54'; g.fillRect(512, 0, 16, rows * 64);   // reverso gris de los letreros
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
    const u1 = pw / 528, v0 = 1 - (i + 1) / rows, v1 = 1 - i / rows;
    const c = Math.cos(sg.ry), s = Math.sin(sg.ry);
    const hw = sg.w / 2;
    const P = (lx, ly) => [sg.x + lx * c, sg.y + ly, sg.z - lx * s];
    b.quad(P(-hw, -sg.h / 2), P(hw, -sg.h / 2), P(hw, sg.h / 2), P(-hw, sg.h / 2), [s, 0, c], 0xffffff, [[0, v0], [u1, v0], [u1, v1], [0, v1]]);
    const ub = 520 / 528, B = (lx, ly) => [sg.x + lx * c - s * 0.01, sg.y + ly, sg.z - lx * s - c * 0.01];
    b.quad(B(hw, -sg.h / 2), B(-hw, -sg.h / 2), B(-hw, sg.h / 2), B(hw, sg.h / 2), [-s, 0, -c], 0xffffff, [[ub, 0.5], [ub, 0.5], [ub, 0.5], [ub, 0.5]]);
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
  const cn = document.createElement('canvas');
  cn.width = 256; cn.height = 256;
  const gn = cn.getContext('2d');
  gn.fillStyle = '#000000';
  gn.fillRect(0, 0, 256, 256);
  const warm = ['#ffd98a', '#ffc870', '#ffe6b0', '#bcd7ff'];
  for (let gy = 0; gy < 4; gy++) {
    for (let gx = 0; gx < 4; gx++) {
      const x = gx * 64, y = gy * 64;
      if (rnd() < 0.5) { gn.fillStyle = warm[Math.floor(rnd() * warm.length)]; gn.fillRect(x + 11, y + 13, 42, 37); }
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
  const mk = (cv) => { const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t; };
  return [mk(c), mk(cn)];
}

// Material de la ciudad: los colores de vértice mayores que 1 (focos) brillan de noche
function glowMaterial(mat) {
  const uNight = { value: 0 };
  mat.userData.uNight = uNight;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = uNight;
    sh.fragmentShader = 'uniform float uNight;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vColor * clamp(max(vColor.r, max(vColor.g, vColor.b)) - 1.0, 0.0, 1.0) * uNight;');
  };
  return mat;
}

export { mergeIntervals };
