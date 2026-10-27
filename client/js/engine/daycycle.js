// Ciclo de horario de Puerto Nova (ambientación tipo San Andreas: bruma cálida de día,
// atardeceres naranjas y noches azul marino con la ciudad encendida).
// La hora sale del reloj del servidor (shared/constants.js -> gameHour), igual para todos.
// Solo cambia luces, colores del cielo y niebla: no agrega sombras ni post-procesado.

import { gameHour } from '/shared/constants.js';

// Fotogramas clave por hora. top/mid/hor = cielo; fog = niebla y fondo; hemi = luz del cielo;
// sun = luz directa (sol o luna); night = cuánto brillan ventanas y faroles; mount = tinte de montañas
const KEYS = [
  { h: 0, name: 'Noche', top: 0x070b1f, mid: 0x111a38, hor: 0x24304f, fog: 0x18203a, hemiSky: 0x5466a6, hemiGround: 0x1c1c26, hemiI: 0.85, sunC: 0x8ea6d8, sunI: 0.32, sunDisc: 0xfff0d0, night: 1, stars: 0.9, mount: 0x2c3550, glow: 0, glowC: 0x000000 },
  { h: 4.5, name: 'Madrugada', top: 0x10173a, mid: 0x262b58, hor: 0x56496e, fog: 0x34344f, hemiSky: 0x55608c, hemiGround: 0x1c1a22, hemiI: 0.7, sunC: 0x9aa8d0, sunI: 0.3, sunDisc: 0xffb070, night: 0.92, stars: 0.6, mount: 0x45465e, glow: 0.25, glowC: 0x8a5a70 },
  { h: 6.2, name: 'Amanecer', top: 0x36558c, mid: 0x8f86a6, hor: 0xf2a070, fog: 0xd59c7c, hemiSky: 0xcab2aa, hemiGround: 0x6a5040, hemiI: 0.95, sunC: 0xffa860, sunI: 1.15, sunDisc: 0xffc080, night: 0.35, stars: 0.1, mount: 0xb7928a, glow: 0.8, glowC: 0xffa060 },
  { h: 8, name: 'Mañana', top: 0x4f8fd0, mid: 0x9cc1e0, hor: 0xf0dcc0, fog: 0xe4d5bc, hemiSky: 0xd8e4f0, hemiGround: 0x8a7458, hemiI: 1.3, sunC: 0xffe2b0, sunI: 1.95, sunDisc: 0xfff2d8, night: 0, stars: 0, mount: 0xe8e0d4, glow: 0.2, glowC: 0xffe0b0 },
  { h: 12.5, name: 'Día', top: 0x3f86d4, mid: 0x92c0e6, hor: 0xe6dcc4, fog: 0xdcd3bb, hemiSky: 0xdce8f6, hemiGround: 0x917a5a, hemiI: 1.45, sunC: 0xfff0d2, sunI: 2.2, sunDisc: 0xfffbf0, night: 0, stars: 0, mount: 0xf0ebe0, glow: 0, glowC: 0xffffff },
  { h: 16.3, name: 'Tarde', top: 0x4a82c4, mid: 0xa4bcd4, hor: 0xf2d29e, fog: 0xe8cf9f, hemiSky: 0xeadcc6, hemiGround: 0x907050, hemiI: 1.35, sunC: 0xffd08a, sunI: 2.1, sunDisc: 0xffe6b0, night: 0, stars: 0, mount: 0xf0dcc0, glow: 0.3, glowC: 0xffc070 },
  { h: 18.6, name: 'Atardecer', top: 0x2f4a7a, mid: 0xb0787a, hor: 0xff9550, fog: 0xd8885a, hemiSky: 0xd2a090, hemiGround: 0x5a4038, hemiI: 1.0, sunC: 0xff8a40, sunI: 1.45, sunDisc: 0xffa050, night: 0.25, stars: 0, mount: 0xc08070, glow: 1, glowC: 0xff7a30 },
  { h: 20.2, name: 'Tarde-noche', top: 0x161f4c, mid: 0x473868, hor: 0x9a4e68, fog: 0x553c5c, hemiSky: 0x6c6294, hemiGround: 0x2a2028, hemiI: 0.72, sunC: 0xb07890, sunI: 0.45, sunDisc: 0xff7040, night: 0.8, stars: 0.4, mount: 0x5a4060, glow: 0.45, glowC: 0xb04a50 },
  { h: 22, name: 'Noche', top: 0x080c22, mid: 0x131c3c, hor: 0x283353, fog: 0x1a223d, hemiSky: 0x5466a6, hemiGround: 0x1c1c26, hemiI: 0.85, sunC: 0x8ea6d8, sunI: 0.32, sunDisc: 0xfff0d0, night: 1, stars: 0.85, mount: 0x2e3652, glow: 0, glowC: 0x000000 },
];
const COLOR_KEYS = ['top', 'mid', 'hor', 'fog', 'hemiSky', 'hemiGround', 'sunC', 'sunDisc', 'mount', 'glowC'];
const NUM_KEYS = ['hemiI', 'sunI', 'night', 'stars', 'glow'];

const mixC = (a, b, t) => {
  const r = ((a >> 16) & 255) + (((b >> 16) & 255) - ((a >> 16) & 255)) * t;
  const g = ((a >> 8) & 255) + (((b >> 8) & 255) - ((a >> 8) & 255)) * t;
  const bl = (a & 255) + ((b & 255) - (a & 255)) * t;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
};
const smooth = (t) => t * t * (3 - 2 * t);

export class DayCycle {
  constructor(renderer, cityRenderer) {
    this.r = renderer;
    this.city = cityRenderer;
    this.offset = 0;          // reloj del servidor - reloj local (ms)
    this.acc = 1;
    this.hour = 12;
    this.state = null;
    this.fixedHour = null;    // para pruebas: hora fija
  }

  sync(serverMs) { if (Number.isFinite(serverMs)) this.offset = serverMs - Date.now(); }

  // Nombre de la etapa del día y hora "HH:MM" (para el HUD)
  get label() {
    const h = Math.floor(this.hour), m = Math.floor((this.hour - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  get phase() {
    const h = this.hour;
    return h < 5 ? 'Madrugada' : h < 11 ? 'Mañana' : h < 15 ? 'Día' : h < 18.5 ? 'Tarde' : h < 21 ? 'Tarde-noche' : 'Noche';
  }

  update(dt, force = false) {
    this.acc += dt;
    if (!force && this.acc < 0.25) return;   // 4 veces por segundo basta: el cielo cambia despacio
    this.acc = 0;
    this.hour = this.fixedHour ?? gameHour(Date.now() + this.offset);
    const st = this.compute(this.hour);
    this.state = st;
    this.r.setAtmosphere(st);
    this.city?.setNight(st.night);
  }

  compute(hour) {
    let i = KEYS.length - 1;
    for (let k = 0; k < KEYS.length; k++) if (KEYS[k].h <= hour) i = k;
    const A = KEYS[i], B = KEYS[(i + 1) % KEYS.length];
    const span = ((B.h - A.h) + 24) % 24 || 24;
    const t = smooth(Math.min(1, (((hour - A.h) + 24) % 24) / span));
    const out = {};
    for (const k of COLOR_KEYS) out[k] = mixC(A[k], B[k], t);
    for (const k of NUM_KEYS) out[k] = A[k] + (B[k] - A[k]) * t;
    // el sol sale por el este (+X) a las 6 y se pone por el oeste a las 19
    const a = ((hour - 6) / 13) * Math.PI;
    const sunDir = norm([Math.cos(a), Math.sin(a) * 0.95, 0.32]);
    out.sunDir = sunDir;
    // la luz directa viene del sol de día y de la luna de noche (nunca desde abajo)
    const day = sunDir[1] > 0.02;
    out.lightDir = day ? [sunDir[0], Math.max(0.25, sunDir[1]), sunDir[2]] : norm([-sunDir[0], Math.max(0.35, -sunDir[1]), 0.4]);
    out.glowC = [((out.glowC >> 16) & 255) / 255, ((out.glowC >> 8) & 255) / 255, (out.glowC & 255) / 255].map((v) => v * v); // a lineal
    out.sunDiscC = out.sunDisc;
    return out;
  }
}

function norm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
