// Minimapa (gira con la cámara) y mapa completo de Puerto Nova.

import { DISTRICTS, districtAt } from '/shared/districts.js';
import { playable, isSandy, landDist, lakeDist, TERRAIN_MIN, TERRAIN_MAX_X, TERRAIN_MAX_Z, WORLD } from '/shared/terrain.js';

const POI_STYLE = {
  park: ['#3ddc97', 'P'], jobcenter: ['#e07a2c', '$'], hospital: ['#e53935', 'H'], police: ['#3b6fd8', 'C'],
  jail: ['#607d8b', 'X'], gunshop: ['#f57c00', 'A'], range: ['#a1887f', 'T'], mall: ['#2e7d32', 'S'],
  mercado: ['#8e2424', 'M'], banco: ['#1b3a5c', 'B'], ayuntamiento: ['#8d4b32', 'G'], terminal: ['#00695c', 'Bus'],
  aeropuerto: ['#0d47a1', '✈'], puerto: ['#455a64', '⚓'], presa: ['#2f8fc4', 'L'], club: ['#1b5e20', 'G'],
  deportiva: ['#43a047', 'D'], mirador: ['#6d4c41', 'V'], faro: ['#c62828', 'F'], disco: ['#c2185b', '♪'],
  concesionario: ['#283593', 'Au'], taller: ['#5d4037', 'T'], gas1: ['#d32f2f', 'G'], gas2: ['#d32f2f', 'G'], gas3: ['#d32f2f', 'G'],
};
const GREEN_SITES = new Set(['lago', 'deportiva', 'parque', 'parqueBarrio', 'plazuela', 'plaza', 'mirador', 'cancha', 'canchita', 'club', 'glorieta', 'patio']);
export class Minimap {
  constructor(canvas, bigCanvas, city) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.big = bigCanvas;
    this.city = city;
    // dos capas: Puerto Nova en detalle (0.8 px/m, con edificios) y el mundo completo ligero
    // (0.22 px/m) para las otras regiones y el mapa grande
    const layer = this.renderBase(WORLD, 0.22, 8, true);
    this.layers = { city: layer, world: layer };
    this.use(this.layers.city);
    this.zoom = 0.75;
  }

  // Se agregó una ciudad nueva: se vuelve a dibujar la capa del mundo
  refreshWorld() {
    const cur = this.layer;
    this.layers.world = this.renderBase({ x0: WORLD.x0, z0: WORLD.z0, x1: WORLD.x1, z1: WORLD.z1 }, 0.22, 8, false);
    this.use(cur === this.layers.city ? this.layers.city : this.layers.world);
  }

  use(L) { this.base = L.cv; this.X0 = L.X0; this.Z0 = L.Z0; this.scale = L.scale; this.layer = L; }

  mx(x) { return (x - this.X0) * this.scale; }
  mz(z) { return (z - this.Z0) * this.scale; }

  // Dibuja una sola vez un área del mapa en un canvas fuera de pantalla
  renderBase(B, scale, step, detail) {
    const c = this.city;
    const L = { X0: B.x0, Z0: B.z0, scale, W: B.x1 - B.x0, H: B.z1 - B.z0 };
    this.X0 = L.X0; this.Z0 = L.Z0; this.scale = scale;
    const s = scale;
    const cw = Math.ceil(L.W * s), ch = Math.ceil(L.H * s);
    const cv = document.createElement('canvas');
    cv.width = cw; cv.height = ch;
    L.cv = cv;
    const g = cv.getContext('2d');
    // terreno a baja resolución y escalado con suavizado
    const tw = Math.ceil(L.W / step), th = Math.ceil(L.H / step);
    const low = document.createElement('canvas');
    low.width = tw; low.height = th;
    const lg = low.getContext('2d');
    const img = lg.createImageData(tw, th);
    for (let j = 0; j < th; j++) for (let i = 0; i < tw; i++) {
      const x = L.X0 + i * step, z = L.Z0 + j * step;
      const h = c.height(x, z);
      let col;
      if (h < 0.05) col = [38, 92, 128];
      else if (lakeDist(x, z) > 0) col = [47, 120, 150];
      else if (isSandy(x, z) && landDist(x, z) < 70 && h < 4) col = [216, 201, 154];
      else if (!playable(x, z, -2)) col = h > 40 ? [92, 108, 82] : [70, 102, 66];
      else {
        const d = districtAt(x, z);
        col = hexRgb(DISTRICTS[d]?.mapColor || '#6f7f6a');
        col = col.map((v) => Math.round(v * 0.82 + 30));
      }
      // Relieve sombreado: la sierra y las colinas se leen también en el mapa completo.
      if (h > 4 && lakeDist(x,z) < -4) {
        const dx = (c.height(x+8,z)-c.height(x-8,z))/16;
        const dz = (c.height(x,z+8)-c.height(x,z-8))/16;
        const slope = Math.hypot(dx,dz);
        const shade = Math.max(0.55,Math.min(1.18,(0.92-dx*0.28-dz*0.2)/Math.sqrt(1+slope*slope)));
        if (h > 35) {
          const rock = Math.min(0.8,Math.max(0,(h-50)/180)+Math.max(0,slope-0.35)*0.4);
          col = col.map((v,k)=>v*(1-rock)+[130,126,110][k]*rock);
        }
        col=col.map(v=>Math.round(v*shade));
      }
      const o = (j * tw + i) * 4;
      img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
    }
    lg.putImageData(img, 0, 0);
    g.imageSmoothingEnabled = true;
    g.drawImage(low, 0, 0, cw, ch);
    // parques y áreas verdes
    for (const site of c.sites) {
      if (!GREEN_SITES.has(site.kind)) continue;
      this.rect(g, site, site.hx, site.hz, site.kind === 'plaza' ? '#cfc4ad' : '#5f9e4d');
    }
    for (const p of c.ponds) { g.fillStyle = '#3a8fc0'; g.beginPath(); g.ellipse(this.mx(p.x), this.mz(p.z), p.rx * s, p.rz * s, -p.rot, 0, Math.PI * 2); g.fill(); }
    // zonas seguras (no se puede disparar)
    g.fillStyle = 'rgba(61, 220, 151, 0.16)'; g.strokeStyle = 'rgba(61, 220, 151, 0.55)'; g.lineWidth = 2;
    for (const z of c.safeZones || []) { g.beginPath(); g.arc(this.mx(z.x), this.mz(z.z), z.r * s, 0, Math.PI * 2); g.fill(); g.stroke(); }
    // calles: primero el borde (banquetas), luego el asfalto
    g.lineCap = 'round'; g.lineJoin = 'round';
    const roads = [...c.roads, ...(c.urban || []).flatMap((u) => u.net.roads.filter((r) => !r.external))].sort((a, b) => a.w - b.w);
    for (const pass of [0, 1]) {
      for (const r of roads) {
        const main = ['autopista','avenida', 'boulevard'].includes(r.cls);
        g.strokeStyle = pass === 0 ? 'rgba(0,0,0,0.25)' : main ? '#f3d98f' : r.cls === 'callejon' ? '#cfcac0' : '#ecebe6';
        g.lineWidth = Math.max(1.5, (pass === 0 ? r.w + 2 : r.w) * s);
        g.beginPath();
        r.pts.forEach(([x, z], i) => (i ? g.lineTo(this.mx(x), this.mz(z)) : g.moveTo(this.mx(x), this.mz(z))));
        if (r.closed) g.closePath();
        g.stroke();
      }
    }
    // autopistas, carreteras y periféricos entre regiones (los puentes, un poco más claros)
    const HW = { autopista: '#f0b45a', periferico: '#f3d98f', carretera: '#ecebe6', secundaria: '#ecebe6', terraceria: '#c9b48f' };
    for (const pass of [0, 1]) {
      for (const r of c.highways?.roads || []) {
        g.strokeStyle = pass === 0 ? 'rgba(0,0,0,0.3)' : HW[r.cls];
        g.lineWidth = Math.max(pass === 0 ? 3 : 2, (pass === 0 ? r.spec.w + 3 : r.spec.w) * s);
        g.beginPath();
        r.pts.forEach(([x, z], i) => (i ? g.lineTo(this.mx(x), this.mz(z)) : g.moveTo(this.mx(x), this.mz(z))));
        if (r.closed) g.closePath();
        g.stroke();
      }
    }
    // edificios
    const drawParts = (o, fill) => {
      for (const p of o.parts) {
        if (p.k !== 'box' || !p.col || (p.y || 0) !== 0) continue;
        const cc = Math.cos(o.rot || 0), ss = Math.sin(o.rot || 0);
        this.rect(g, { cx: o.cx + p.x * cc + p.z * ss, cz: o.cz - p.x * ss + p.z * cc, rot: (o.rot || 0) + (p.r || 0) }, p.w / 2, p.d / 2, fill);
      }
    };
    const LOT = { casaHumilde: '#d6b9a4', bodega: '#a9a9a3', fabrica: '#a9a9a3', torre: '#c9d3dd', oficina: '#d5dbe0', casaRural: '#dcc9a8' };
    if (detail) {
      for (const l of c.lots) drawParts(l, LOT[l.type] || '#e6e1d8');
      for (const st of c.sites) drawParts(st, '#f4f1ea');
    }
    return L;
  }

  rect(g, o, hx, hz, fill) {
    const c = Math.cos(o.rot || 0), s = Math.sin(o.rot || 0);
    g.fillStyle = fill;
    g.beginPath();
    [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].forEach(([lx, lz], i) => {
      const x = this.mx(o.cx + lx * c + lz * s), z = this.mz(o.cz - lx * s + lz * c);
      i ? g.lineTo(x, z) : g.moveTo(x, z);
    });
    g.closePath();
    g.fill();
  }

  // yaw = rumbo de la cámara; facing = rumbo del jugador
  draw(px, pz, yaw, facing, others, target, myBike) {
    const cityL = this.layers.city;
    const inCity = px > cityL.X0 + 150 && px < cityL.X0 + cityL.W - 150 && pz > cityL.Z0 + 150 && pz < cityL.Z0 + cityL.H - 150;
    this.use(inCity ? cityL : this.layers.world);
    const g = this.ctx;
    const W = this.canvas.width, H = this.canvas.height, R = W / 2;
    g.save();
    g.clearRect(0, 0, W, H);
    g.beginPath(); g.arc(R, R, R, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#26566f'; g.fillRect(0, 0, W, H);
    g.translate(R, R);
    g.rotate(yaw - Math.PI);
    const k = (this.zoom * (W / 160)) / this.scale;
    g.scale(k, k);
    g.translate(-this.mx(px), -this.mz(pz));
    g.drawImage(this.base, 0, 0);
    const ik = 1 / k;
    for (const [key, p] of Object.entries(this.city.pois)) {
      const st = POI_STYLE[key];
      if (!st) continue;
      g.save();
      g.translate(this.mx(p.x), this.mz(p.z));
      g.rotate(-(yaw - Math.PI));
      dot(g, 0, 0, 10 * ik, st[0], st[1], 12 * ik);
      g.restore();
    }
    if (myBike) { g.fillStyle = '#39b6ff'; g.beginPath(); g.arc(this.mx(myBike.x), this.mz(myBike.z), 5 * ik, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#ffffff';
    for (const o of others) { g.beginPath(); g.arc(this.mx(o.x), this.mz(o.z), 4.5 * ik, 0, Math.PI * 2); g.fill(); }
    g.restore();

    if (target) {
      const kk = this.zoom * (W / 160);
      const dx = (target.x - px) * kk, dz = (target.z - pz) * kk;
      const a = yaw - Math.PI;
      let sx = dx * Math.cos(a) - dz * Math.sin(a), sy = dx * Math.sin(a) + dz * Math.cos(a);
      const d = Math.hypot(sx, sy), lim = R - 9;
      if (d > lim) { sx *= lim / d; sy *= lim / d; }
      g.fillStyle = '#ffc444'; g.strokeStyle = '#1b1b1b'; g.lineWidth = 2;
      g.beginPath(); g.arc(R + sx, R + sy, 7, 0, Math.PI * 2); g.fill(); g.stroke();
    }
    g.save();
    g.translate(R, R);
    g.rotate(yaw - facing);
    g.fillStyle = '#3ddc97'; g.strokeStyle = '#0b0f12'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, -10); g.lineTo(7, 7); g.lineTo(0, 3); g.lineTo(-7, 7); g.closePath(); g.fill(); g.stroke();
    g.restore();
    g.save();
    g.translate(R, R);
    g.rotate(yaw - Math.PI);
    g.translate(0, -(R - 12));
    g.rotate(-(yaw - Math.PI));
    g.fillStyle = '#ffffff'; g.font = 'bold 15px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('N', 0, 0);
    g.restore();
  }

  drawBig(px, pz, facing, target, others, myBike) {
    this.use(this.layers.world);
    const cv = this.big;
    const parent = cv.parentElement;
    const legend = parent.querySelector('.map-legend');
    const lw = legend && legend.offsetWidth ? legend.offsetWidth + 20 : 0;
    const avW = Math.max(100, parent.clientWidth - 12 - lw), avH = Math.max(100, parent.clientHeight - 12);
    const ratio = this.base.width / this.base.height;
    let cwCss = avW, chCss = avW / ratio;
    if (chCss > avH) { chCss = avH; cwCss = avH * ratio; }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(cwCss * dpr); cv.height = Math.round(chCss * dpr);
    cv.style.width = cwCss + 'px'; cv.style.height = chCss + 'px';
    const g = cv.getContext('2d');
    const k = cv.width / this.base.width;
    g.drawImage(this.base, 0, 0, cv.width, cv.height);
    const X = (x) => this.mx(x) * k, Z = (z) => this.mz(z) * k;
    for (const [key, p] of Object.entries(this.city.pois)) {
      const st = POI_STYLE[key];
      if (st) dot(g, X(p.x), Z(p.z), 9 * dpr, st[0], st[1], 11 * dpr);
    }
    if (myBike) { g.fillStyle = '#39b6ff'; g.beginPath(); g.arc(X(myBike.x), Z(myBike.z), 5 * dpr, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#fff';
    for (const o of others) { g.beginPath(); g.arc(X(o.x), Z(o.z), 3.5 * dpr, 0, Math.PI * 2); g.fill(); }
    if (target) {
      g.fillStyle = '#ffc444'; g.strokeStyle = '#111'; g.lineWidth = 2 * dpr;
      g.beginPath(); g.arc(X(target.x), Z(target.z), 8 * dpr, 0, Math.PI * 2); g.fill(); g.stroke();
    }
    g.save();
    g.translate(X(px), Z(pz));
    g.rotate(Math.PI - facing);
    g.fillStyle = '#3ddc97'; g.strokeStyle = '#0b0f12'; g.lineWidth = 2 * dpr;
    const s = dpr * 1.3;
    g.beginPath(); g.moveTo(0, -10 * s); g.lineTo(7 * s, 7 * s); g.lineTo(0, 3 * s); g.lineTo(-7 * s, 7 * s); g.closePath(); g.fill(); g.stroke();
    g.restore();
  }
}

function dot(g, x, y, r, color, letter, font) {
  g.fillStyle = color;
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = r * 0.18; g.stroke();
  g.fillStyle = '#fff';
  g.font = `bold ${font}px system-ui`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(letter, x, y + 0.5);
}

function hexRgb(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
