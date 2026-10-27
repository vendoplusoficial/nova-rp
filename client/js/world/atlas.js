// Atlas de texturas pintado por código al iniciar (sin descargas): ventanas, puertas, cocheras,
// vitrinas y fachadas de vidrio. UNA sola textura de 1024x1024 para toda la ciudad cercana
// (1 llamada de dibujo extra por mosaico).
//
// Celdas "sin tinte": se usan con color de vértice blanco (ventanas, puertas...).
// Celdas "con tinte": la pared está pintada de blanco y se tiñe con el color del edificio.

import * as THREE from 'three';

const S = 1024;
// nombre -> [x, y, w, h] en píxeles
const R = {};
let texture = null, nightTexture = null;

function rect(name, x, y, w, h) { R[name] = [x, y, w, h]; }

// Fachadas repetibles (2 columnas x 4 pisos por celda)
rect('glassBlue', 0, 0, 128, 256);
rect('glassTeal', 128, 0, 128, 256);
rect('glassBronze', 256, 0, 128, 256);
rect('officePunch', 384, 0, 128, 256);   // con tinte
rect('officeBand', 512, 0, 128, 256);    // con tinte
rect('aptGrid', 640, 0, 128, 256);       // con tinte
rect('hotelGrid', 768, 0, 128, 256);     // con tinte
rect('glassDark', 896, 0, 128, 256);
// Ventanas sueltas
['winApt', 'winApt2', 'winHouse', 'winHouseShutter', 'winBars', 'winOffice', 'balconyDoor', 'railGlass'].forEach((n, i) => rect(n, i * 128, 256, 128, 128));
// Puertas y vitrinas
['doorWood', 'doorWood2', 'doorGlass', 'doorMetal', 'garage', 'rollup', 'shopWindow', 'shopWindow2'].forEach((n, i) => rect(n, i * 128, 384, 128, 128));
// Varios
['winHumble', 'acUnit', 'winArch', 'winShop', 'vent', 'doorDouble', 'winLarge', 'winSmall'].forEach((n, i) => rect(n, i * 128, 512, 128, 128));

const PAD = 4; // px de margen interno (evita que se mezclen celdas al alejarse)

export function atlasUV(name) {
  const r = R[name] || R.winApt;
  const u0 = (r[0] + PAD) / S, u1 = (r[0] + r[2] - PAD) / S;
  const v1 = 1 - (r[1] + PAD) / S, v0 = 1 - (r[1] + r[3] - PAD) / S;
  return [u0, v0, u1, v1];
}

// Sub-rectángulo de la celda (fx0..fx1, fy0..fy1 en 0..1 desde abajo-izquierda)
export function atlasSub(name, fx0, fy0, fx1, fy1) {
  const [u0, v0, u1, v1] = atlasUV(name);
  return [u0 + (u1 - u0) * fx0, v0 + (v1 - v0) * fy0, u0 + (u1 - u0) * fx1, v0 + (v1 - v0) * fy1];
}

export function getAtlas(renderer) {
  if (texture) return texture;
  const cv = document.createElement('canvas');
  cv.width = S; cv.height = S;
  const g = cv.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, S, S);
  // mapa de noche: negro, con las ventanas encendidas (se pinta a la par del atlas de día)
  const cn = document.createElement('canvas');
  cn.width = S; cn.height = S;
  gn = cn.getContext('2d');
  gn.fillStyle = '#000000'; gn.fillRect(0, 0, S, S);
  paint(g);
  gn = null;
  texture = new THREE.CanvasTexture(cv);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer ? Math.min(4, renderer.capabilities.getMaxAnisotropy()) : 1;
  nightTexture = new THREE.CanvasTexture(cn);
  nightTexture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Ventanas encendidas de noche (emisivo del mismo atlas)
export function getAtlasNight(renderer) { getAtlas(renderer); return nightTexture; }

// ---------------- pintura ----------------
let seed = 12345;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

// noche: contexto del mapa emisivo, probabilidad de que una ventana esté encendida y sus tonos
let gn = null, lit = 0.5;
let seedN = 777;
const rndN = () => { seedN = (seedN * 16807) % 2147483647; return seedN / 2147483647; };
const WARM = ['#ffd98a', '#ffc870', '#ffe6b0', '#fff1cf', '#ffcf9a', '#bcd7ff'];
function nightPane(x, y, w, h) {
  if (!gn || rndN() >= lit) return;
  gn.fillStyle = lit >= 1 ? (rndN() < 0.5 ? '#e8c890' : '#f0d8a8') : lit < 0.4 ? (rndN() < 0.6 ? '#b8a77e' : '#a9b3bd') : WARM[Math.floor(rndN() * WARM.length)];
  gn.fillRect(x, y, w, h);
}

function inner(name) { const r = R[name]; return [r[0] + PAD, r[1] + PAD, r[2] - PAD * 2, r[3] - PAD * 2]; }

// Vidrio con degradado de cielo y reflejo diagonal
function glass(g, x, y, w, h, top, mid, bot, streak = 0.14) {
  nightPane(x, y, w, h);
  const grd = g.createLinearGradient(x, y, x + w * 0.35, y + h);
  grd.addColorStop(0, top); grd.addColorStop(0.45, mid); grd.addColorStop(1, bot);
  g.fillStyle = grd; g.fillRect(x, y, w, h);
  g.save();
  g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.fillStyle = `rgba(255,255,255,${streak})`;
  g.beginPath(); g.moveTo(x + w * 0.15, y + h); g.lineTo(x + w * 0.55, y); g.lineTo(x + w * 0.75, y); g.lineTo(x + w * 0.35, y + h); g.fill();
  g.fillStyle = `rgba(255,255,255,${streak * 0.5})`;
  g.beginPath(); g.moveTo(x + w * 0.5, y + h); g.lineTo(x + w * 0.9, y); g.lineTo(x + w * 0.97, y); g.lineTo(x + w * 0.57, y + h); g.fill();
  g.restore();
}

function frame(g, x, y, w, h, t, col) {
  for (const c of gn ? [g, gn] : [g]) { c.fillStyle = c === gn ? '#000000' : col; c.fillRect(x, y, w, t); c.fillRect(x, y + h - t, w, t); c.fillRect(x, y, t, h); c.fillRect(x + w - t, y, t, h); }
}

function noise(g, x, y, w, h, amt, n = 300) {
  for (let i = 0; i < n; i++) {
    const v = rnd() < 0.5 ? 0 : 255;
    g.fillStyle = `rgba(${v},${v},${v},${amt * rnd()})`;
    g.fillRect(x + rnd() * w, y + rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2);
  }
}

// Ventana con marco, vidrio y alféizar (dentro de una caja de x,y,w,h)
function windowPane(g, x, y, w, h, o = {}) {
  const fc = o.frame || '#f4f4f2', t = o.t || Math.max(3, w * 0.07);
  glass(g, x, y, w, h, o.top || '#9fc3dd', o.mid || '#45698a', o.bot || '#1f3347', o.streak ?? 0.16);
  if (o.curtain) { g.fillStyle = o.curtain; g.fillRect(x + t, y + t, w * 0.22, h - 2 * t); g.fillRect(x + w - t - w * 0.18, y + t, w * 0.18, h - 2 * t); }
  if (o.blind) { g.fillStyle = o.blind; g.fillRect(x + t, y + t, w - 2 * t, h * o.blindH); }
  frame(g, x, y, w, h, t, fc);
  if (o.cross) { g.fillStyle = fc; g.fillRect(x + w / 2 - t / 2, y, t, h); g.fillRect(x, y + h * 0.42, w, t * 0.8); }
  else if (o.vbar !== false) { g.fillStyle = fc; g.fillRect(x + w / 2 - t / 2, y, t * 0.8, h); }
}

function paint(g) {
  // ---------- muros cortina de vidrio (2 columnas x 4 pisos) ----------
  const curtain = (name, top, mid, bot, mull, span) => {
    const [x, y, w, h] = R[name];
    const fh = h / 4, cw = w / 2;
    for (let f = 0; f < 4; f++) for (let c = 0; c < 2; c++) {
      const px = x + c * cw, py = y + f * fh;
      // variación por panel (unos reflejan más que otros)
      const k = rnd();
      glass(g, px, py, cw, fh, k < 0.3 ? '#cfe3f1' : top, mid, bot, 0.1 + k * 0.12);
      g.fillStyle = span; g.fillRect(px, py + fh - fh * 0.16, cw, fh * 0.16);           // antepecho
      g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(px, py + fh - fh * 0.16, cw, 1);
    }
    g.fillStyle = mull;
    for (let c = 0; c <= 2; c++) g.fillRect(x + c * cw - 1.5, y, 3, h);
    for (let c = 0; c < 2; c++) g.fillRect(x + c * cw + cw / 2 - 1, y, 2, h);
  };
  lit = 0.3;
  curtain('glassBlue', '#a9cbe6', '#3f6f9a', '#1c3550', '#d5dde3', '#2c4258');
  curtain('glassTeal', '#b5dcdc', '#3b7d80', '#173b40', '#d9e2e2', '#28484b');
  curtain('glassBronze', '#d9c7a8', '#7a6243', '#3a2c1d', '#e2d8c8', '#4a3a28');
  curtain('glassDark', '#8aa0b4', '#2b3a49', '#11181f', '#9aa7b2', '#1b232b');

  lit = 0.55;
  // ---------- fachadas con tinte (pared blanca) ----------
  const tinted = (name, fn) => {
    const [x, y, w, h] = R[name];
    g.fillStyle = '#ffffff'; g.fillRect(x, y, w, h);
    noise(g, x, y, w, h, 0.05, 200);
    const fh = h / 4, cw = w / 2;
    for (let f = 0; f < 4; f++) for (let c = 0; c < 2; c++) fn(x + c * cw, y + f * fh, cw, fh, f, c);
  };
  tinted('officePunch', (x, y, w, h) => {
    g.fillStyle = 'rgba(0,0,0,0.10)'; g.fillRect(x + w * 0.14, y + h * 0.16, w * 0.72, h * 0.6);
    windowPane(g, x + w * 0.16, y + h * 0.18, w * 0.68, h * 0.56, { frame: '#3a4148', t: 2, vbar: true, mid: '#3c5a74' });
    g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(x + w * 0.12, y + h * 0.76, w * 0.76, 2);   // alféizar
  });
  tinted('officeBand', (x, y, w, h) => {
    windowPane(g, x, y + h * 0.22, w, h * 0.5, { frame: '#2e353b', t: 2, vbar: true, mid: '#36566f', top: '#b8d2e6' });
    g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x, y + h * 0.72, w, 2);
  });
  tinted('aptGrid', (x, y, w, h, f, c) => {
    const curt = rnd() < 0.5 ? '#e9dcc2' : null;
    windowPane(g, x + w * 0.2, y + h * 0.2, w * 0.6, h * 0.55, { curtain: curt, t: 3 });
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x + w * 0.16, y + h * 0.75, w * 0.68, 3);
    if ((f + c) % 3 === 0) { g.fillStyle = '#9aa3a8'; g.fillRect(x + w * 0.66, y + h * 0.05, w * 0.26, h * 0.12); }  // minisplit
  });
  tinted('hotelGrid', (x, y, w, h) => {
    windowPane(g, x + w * 0.12, y + h * 0.12, w * 0.76, h * 0.7, { t: 3, blind: '#f1e6d0', blindH: 0.25 });
    g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(x + w * 0.08, y + h * 0.82, w * 0.84, 3);
  });

  // ---------- ventanas sueltas ----------
  const cell = (name, fn) => { const [x, y, w, h] = inner(name); fn(x, y, w, h); };
  cell('winApt', (x, y, w, h) => windowPane(g, x, y, w, h, { t: 7 }));
  cell('winApt2', (x, y, w, h) => windowPane(g, x, y, w, h, { t: 7, curtain: '#efe4cf' }));
  cell('winHouse', (x, y, w, h) => windowPane(g, x, y, w, h, { t: 8, cross: true, curtain: '#f3ead8', top: '#b9d4e8' }));
  cell('winHouseShutter', (x, y, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(x, y, w, h);
    windowPane(g, x + w * 0.24, y, w * 0.52, h, { t: 6, cross: true });
    for (const sx of [x, x + w * 0.78]) { g.fillStyle = '#5b6e4f'; g.fillRect(sx, y, w * 0.22, h); g.fillStyle = 'rgba(0,0,0,0.2)'; for (let i = 0; i < 10; i++) g.fillRect(sx + 2, y + 6 + i * (h - 12) / 10, w * 0.22 - 4, 2); }
  });
  cell('winBars', (x, y, w, h) => {
    windowPane(g, x, y, w, h, { t: 6, frame: '#6d6d6d', mid: '#3d5568' });
    g.fillStyle = '#2b2b2b';
    for (let i = 1; i < 6; i++) g.fillRect(x + (i * w) / 6 - 2, y, 4, h);
    g.fillRect(x, y + h * 0.33, w, 3); g.fillRect(x, y + h * 0.66, w, 3);
  });
  cell('winOffice', (x, y, w, h) => windowPane(g, x, y, w, h, { t: 4, frame: '#2f363c', mid: '#30506a' }));
  cell('balconyDoor', (x, y, w, h) => {
    windowPane(g, x, y, w * 0.5, h, { t: 6, vbar: false, curtain: '#efe4cf' });
    windowPane(g, x + w * 0.5, y, w * 0.5, h, { t: 6, vbar: false });
  });
  cell('railGlass', (x, y, w, h) => {
    const grd = g.createLinearGradient(x, y, x, y + h);
    grd.addColorStop(0, '#d6eef5'); grd.addColorStop(1, '#8fbccb');
    g.fillStyle = grd; g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x + w * 0.1, y, w * 0.12, h);
    g.fillStyle = '#e8ecee'; g.fillRect(x, y, w, 8); g.fillRect(x, y, 5, h); g.fillRect(x + w - 5, y, 5, h);
  });

  // ---------- puertas y vitrinas ----------
  cell('doorWood', (x, y, w, h) => {
    g.fillStyle = '#f2f2f0'; g.fillRect(x, y, w, h);
    const grd = g.createLinearGradient(x, y, x + w, y);
    grd.addColorStop(0, '#6b4126'); grd.addColorStop(0.5, '#86552f'); grd.addColorStop(1, '#6b4126');
    g.fillStyle = grd; g.fillRect(x + 6, y + 6, w - 12, h - 6);
    g.fillStyle = 'rgba(0,0,0,0.22)';
    for (const [px, py, pw, ph] of [[0.2, 0.12, 0.25, 0.3], [0.55, 0.12, 0.25, 0.3], [0.2, 0.5, 0.25, 0.38], [0.55, 0.5, 0.25, 0.38]]) g.strokeRect(x + w * px, y + h * py, w * pw, h * ph);
    g.fillStyle = '#d9b44a'; g.fillRect(x + w * 0.8, y + h * 0.55, 6, 6);
  });
  cell('doorWood2', (x, y, w, h) => {
    g.fillStyle = '#f2f2f0'; g.fillRect(x, y, w, h);
    g.fillStyle = '#3f2a1c'; g.fillRect(x + 6, y + 6, w - 12, h - 6);
    g.fillStyle = 'rgba(255,255,255,0.08)'; for (let i = 0; i < 8; i++) g.fillRect(x + 10, y + 12 + i * (h - 20) / 8, w - 20, 2);
    glass(g, x + w * 0.4, y + h * 0.15, w * 0.2, h * 0.5, '#a9cbe6', '#3f6f9a', '#1c3550');
    g.fillStyle = '#c9c9c9'; g.fillRect(x + w * 0.78, y + h * 0.5, 5, 18);
  });
  cell('doorGlass', (x, y, w, h) => {
    windowPane(g, x, y, w / 2, h, { t: 7, frame: '#3a3f44', vbar: false, mid: '#3a6280' });
    windowPane(g, x + w / 2, y, w / 2, h, { t: 7, frame: '#3a3f44', vbar: false, mid: '#3a6280' });
    g.fillStyle = '#c0c4c8'; g.fillRect(x + w / 2 - 12, y + h * 0.45, 4, 26); g.fillRect(x + w / 2 + 8, y + h * 0.45, 4, 26);
  });
  cell('doorMetal', (x, y, w, h) => {
    g.fillStyle = '#4b5258'; g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(x + 8, y + 8, w - 16, 3);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.strokeRect(x + w * 0.15, y + h * 0.1, w * 0.7, h * 0.35); g.strokeRect(x + w * 0.15, y + h * 0.55, w * 0.7, h * 0.35);
    g.fillStyle = '#c9c9c9'; g.fillRect(x + w * 0.78, y + h * 0.5, 6, 6);
  });
  cell('garage', (x, y, w, h) => {
    g.fillStyle = '#f4f4f2'; g.fillRect(x, y, w, h);
    for (let i = 0; i < 5; i++) {
      const py = y + 4 + (i * (h - 4)) / 5;
      g.fillStyle = 'rgba(0,0,0,0.13)'; g.fillRect(x, py, w, 2);
      g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(x, py + 2, w, 2);
      for (let c = 0; c < 4; c++) { g.fillStyle = 'rgba(0,0,0,0.06)'; g.fillRect(x + 6 + c * (w - 12) / 4, py + 6, (w - 12) / 4 - 6, (h - 4) / 5 - 10); }
    }
    frame(g, x, y, w, h, 4, '#d9d9d6');
  });
  cell('rollup', (x, y, w, h) => {
    g.fillStyle = '#9aa2a8'; g.fillRect(x, y, w, h);
    for (let i = 0; i < 24; i++) { g.fillStyle = i % 2 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.12)'; g.fillRect(x, y + (i * h) / 24, w, h / 48); }
    g.fillStyle = '#6f777c'; g.fillRect(x, y, 5, h); g.fillRect(x + w - 5, y, 5, h); g.fillRect(x, y + h - 6, w, 6);
  });
  const shopWin = (x, y, w, h, frameC, goods) => {
    glass(g, x, y, w, h, '#c7dcec', '#58799a', '#2a3c4f', 0.2);
    // estantes y mercancía detrás del vidrio
    for (let r = 0; r < 3; r++) {
      const py = y + h * (0.35 + r * 0.2);
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x + 6, py, w - 12, 2);
      for (let i = 0; i < 9; i++) { g.fillStyle = goods[(i + r) % goods.length]; g.globalAlpha = 0.55; g.fillRect(x + 8 + i * (w - 16) / 9, py - 9, (w - 16) / 9 - 3, 8); g.globalAlpha = 1; }
    }
    frame(g, x, y, w, h, 5, frameC);
    g.fillStyle = frameC; g.fillRect(x + w / 2 - 2, y, 4, h); g.fillRect(x, y + h * 0.18, w, 4);
  };
  lit = 1;
  cell('shopWindow', (x, y, w, h) => shopWin(x, y, w, h, '#2f3539', ['#e53935', '#fdd835', '#43a047', '#1e88e5', '#ffffff']));
  cell('shopWindow2', (x, y, w, h) => shopWin(x, y, w, h, '#d8d8d4', ['#8d6e63', '#f5f5f5', '#ffb74d', '#90caf9']));

  lit = 0.55;
  // ---------- varios ----------
  cell('winHumble', (x, y, w, h) => {
    windowPane(g, x, y, w, h, { t: 7, frame: '#7a8a8f', mid: '#4a6273', curtain: '#d35d6e' });
    g.fillStyle = '#333333'; for (let i = 1; i < 4; i++) g.fillRect(x + (i * w) / 4 - 2, y, 3, h);
  });
  cell('acUnit', (x, y, w, h) => {
    g.fillStyle = '#e8eaeb'; g.fillRect(x, y, w, h);
    g.fillStyle = '#9aa1a6'; g.beginPath(); g.arc(x + w * 0.38, y + h * 0.5, h * 0.32, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#6e767b'; g.lineWidth = 2; for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(x + w * 0.38, y + h * 0.5, h * 0.08 * (i + 1), 0, Math.PI * 2); g.stroke(); }
    g.fillStyle = 'rgba(0,0,0,0.12)'; for (let i = 0; i < 8; i++) g.fillRect(x + w * 0.72, y + 10 + i * (h - 20) / 8, w * 0.22, 3);
  });
  cell('winArch', (x, y, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(x, y, w, h);
    g.save(); g.beginPath(); g.moveTo(x, y + h); g.lineTo(x, y + w / 2); g.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0); g.lineTo(x + w, y + h); g.closePath(); g.clip();
    windowPane(g, x, y, w, h, { t: 6, cross: true, frame: '#5d3a1a' }); g.restore();
  });
  lit = 1;
  cell('winShop', (x, y, w, h) => shopWin(x, y, w, h, '#b0b5b8', ['#ffffff', '#e0e0e0', '#ffcc80']));
  lit = 0.55;
  cell('vent', (x, y, w, h) => { g.fillStyle = '#b8bdc0'; g.fillRect(x, y, w, h); g.fillStyle = 'rgba(0,0,0,0.22)'; for (let i = 0; i < 10; i++) g.fillRect(x + 4, y + 6 + i * (h - 12) / 10, w - 8, 4); });
  cell('doorDouble', (x, y, w, h) => {
    g.fillStyle = '#5a3b22'; g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x + w / 2 - 2, y, 4, h);
    g.strokeStyle = 'rgba(0,0,0,0.3)'; for (const px of [0.1, 0.58]) { g.strokeRect(x + w * px, y + h * 0.1, w * 0.32, h * 0.35); g.strokeRect(x + w * px, y + h * 0.52, w * 0.32, h * 0.38); }
    g.fillStyle = '#d9b44a'; g.fillRect(x + w / 2 - 10, y + h * 0.5, 5, 10); g.fillRect(x + w / 2 + 5, y + h * 0.5, 5, 10);
  });
  cell('winLarge', (x, y, w, h) => windowPane(g, x, y, w, h, { t: 4, frame: '#2b2f33', vbar: true, top: '#cfe3f1', mid: '#4f7ea6', bot: '#1d3346', streak: 0.22 }));
  cell('winSmall', (x, y, w, h) => windowPane(g, x + w * 0.1, y + h * 0.1, w * 0.8, h * 0.8, { t: 8, vbar: false }));
}
