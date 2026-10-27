// Ajustes del jugador (se guardan en este dispositivo).

const KEY = 'novarp.settings.v1';

export const DEFAULTS = {
  sens: 1.0,          // sensibilidad de cámara
  aimSens: 0.65,      // sensibilidad al apuntar (multiplicador)
  invertY: false,
  autoAim: 0.6,       // 0 = apagado, 1 = máximo
  camDist: 1.0,       // multiplicador de distancia de cámara
  joystick: 'float',  // 'float' (flotante) | 'fixed' (fijo)
  aimMode: 'toggle',  // 'toggle' (tocar) | 'hold' (mantener)
  quality: 'auto',    // 'low' | 'medium' | 'high' | 'auto'
  showFps: false,
  volume: 0.6,
  btnScale: 1.0,
  btnOpacity: 0.85,
  layout: {},         // posiciones personalizadas { id: {x: fracciónX, y: fracciónY} }
};

export function safeGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
export function safeSet(key, val) { try { localStorage.setItem(key, val); } catch { /* modo privado */ } }
export function safeDel(key) { try { localStorage.removeItem(key); } catch { /* nada */ } }

export class Settings {
  constructor() {
    this.data = { ...DEFAULTS, layout: {} };
    this.listeners = new Set();
    try {
      const raw = safeGet(KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        for (const k of Object.keys(DEFAULTS)) if (saved[k] !== undefined && typeof saved[k] === typeof DEFAULTS[k]) this.data[k] = saved[k];
      }
    } catch { /* ajustes dañados: usar valores por defecto */ }
  }
  get(k) { return this.data[k]; }
  set(k, v) { this.data[k] = v; this.save(); for (const fn of this.listeners) fn(k, v); }
  onChange(fn) { this.listeners.add(fn); }
  save() { safeSet(KEY, JSON.stringify(this.data)); }
}
