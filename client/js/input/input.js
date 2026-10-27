// Entrada unificada: táctil (joystick + deslizar para cámara + botones) y teclado/ratón.
//
// Diseño táctil (estilo Free Fire):
//  - Mitad izquierda: joystick (flotante por defecto: aparece donde pones el pulgar).
//  - Resto de la pantalla: deslizar mueve la cámara.
//  - Mantener DISPARAR y deslizar a la vez también mueve la cámara.
//  - Cada dedo se rastrea por separado (multitáctil real, sin interferencias).

import { clamp } from '../util/math.js';

const LOOK_CAPABLE = new Set(['fire', 'aim', 'accel']);

export class Input {
  constructor(settings) {
    this.settings = settings;
    this.joy = { x: 0, y: 0, active: false };
    this.keys = { x: 0, y: 0 };
    this.lookDX = 0;
    this.lookDY = 0;
    this.lookActivity = 0;  // px movidos este frame (para reducir autoapuntado mientras el jugador apunta manualmente)
    this.held = Object.create(null);
    this.pressed = new Set();
    this.enabled = true;
  }

  press(name) {
    if (!this.enabled) return;
    if (!this.held[name]) this.pressed.add(name);
    this.held[name] = true;
  }
  release(name) { this.held[name] = false; }
  consume(name) { if (this.pressed.has(name)) { this.pressed.delete(name); return true; } return false; }
  isHeld(name) { return !!this.held[name]; }

  addLook(dx, dy) {
    if (!this.enabled) return;
    this.lookDX += dx; this.lookDY += dy;
    this.lookActivity += Math.abs(dx) + Math.abs(dy);
  }
  takeLook() {
    const r = [this.lookDX, this.lookDY];
    this.lookDX = 0; this.lookDY = 0;
    return r;
  }

  getMove() {
    if (!this.enabled) return { x: 0, y: 0, mag: 0 };
    let x = this.joy.active ? this.joy.x : this.keys.x;
    let y = this.joy.active ? this.joy.y : this.keys.y;
    let mag = Math.hypot(x, y);
    if (mag > 1) { x /= mag; y /= mag; mag = 1; }
    return { x, y, mag };
  }

  endFrame() { this.pressed.clear(); this.lookActivity = 0; }

  releaseAll() {
    for (const k of Object.keys(this.held)) this.held[k] = false;
    this.pressed.clear();
    this.joy.active = false; this.joy.x = 0; this.joy.y = 0;
    this.keys.x = 0; this.keys.y = 0;
  }

  setEnabled(v) {
    this.enabled = v;
    if (!v) this.releaseAll();
  }
}

// ------------------------------------------------------------------
// Controles táctiles
// ------------------------------------------------------------------

export class TouchControls {
  constructor(input, controlsEl, settings) {
    this.input = input;
    this.el = controlsEl;
    this.settings = settings;
    this.pointers = new Map();
    this.editing = false;
    this.joyEl = controlsEl.querySelector('#joystick');
    this.joyBase = this.joyEl.querySelector('.base');
    this.joyKnob = this.joyEl.querySelector('.knob');
    this.buttons = {};
    controlsEl.querySelectorAll('[data-btn]').forEach((b) => { this.buttons[b.dataset.btn] = b; });
    this.joy = { pid: null, baseX: 0, baseY: 0, homeX: 0, homeY: 0, R: 60 };
    this.lookPid = null;
    this.layout = {};
    this.safe = { l: 0, r: 0, t: 0, b: 0 };

    this.onDown = this.onDown.bind(this);
    this.onMove = this.onMove.bind(this);
    this.onUp = this.onUp.bind(this);
    controlsEl.addEventListener('pointerdown', this.onDown, { passive: false });
    controlsEl.addEventListener('pointermove', this.onMove, { passive: false });
    controlsEl.addEventListener('pointerup', this.onUp, { passive: false });
    controlsEl.addEventListener('pointercancel', this.onUp, { passive: false });
    controlsEl.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('blur', () => this.releaseAll());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.releaseAll(); });
    this.measureSafeArea();
    this.relayout();
  }

  measureSafeArea() {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
    document.body.appendChild(probe);
    const cs = getComputedStyle(probe);
    this.safe = { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
    probe.remove();
  }

  // Posiciones por defecto, relativas al tamaño de pantalla
  defaultLayout(w, h) {
    const u = clamp(Math.min(w, h) / 390, 0.8, 1.35) * this.settings.get('btnScale');
    const R = w - this.safe.r, B = h - this.safe.b, L = this.safe.l;
    const jr = 62 * u;
    return {
      u,
      joystick: { x: L + 40 * u + jr, y: B - 34 * u - jr, r: jr },
      fire: { x: R - 108 * u, y: B - 112 * u, d: 92 * u },
      aim: { x: R - 205 * u, y: B - 62 * u, d: 62 * u },
      jump: { x: R - 52 * u, y: B - 196 * u, d: 64 * u },
      crouch: { x: R - 44 * u, y: B - 52 * u, d: 56 * u },
      sprint: { x: R - 196 * u, y: B - 158 * u, d: 56 * u },
      reload: { x: R - 118 * u, y: B - 214 * u, d: 46 * u },
      interact: { x: R - 330 * u, y: B - 150 * u, d: 0 },
      accel: { x: R - 108 * u, y: B - 112 * u, d: 92 * u },
      brake: { x: R - 212 * u, y: B - 72 * u, d: 70 * u },
      boost: { x: R - 44 * u, y: B - 52 * u, d: 56 * u },
      exit: { x: R - 52 * u, y: B - 196 * u, d: 60 * u },
    };
  }

  relayout(override) {
    const w = window.innerWidth, h = window.innerHeight;
    const def = this.defaultLayout(w, h);
    const custom = override || this.settings.get('layout') || {};
    this.layout = def;
    document.documentElement.style.setProperty('--btn-opacity', String(this.settings.get('btnOpacity')));
    for (const [id, el] of Object.entries(this.buttons)) {
      if (id === 'joystick') continue;
      const p = def[id];
      if (!p) continue;
      const c = custom[id];
      const x = c ? c.x * w : p.x, y = c ? c.y * h : p.y;
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      if (p.d) el.style.setProperty('--d', p.d + 'px');
    }
    const j = def.joystick;
    const cj = custom.joystick;
    this.joy.R = j.r;
    this.joy.homeX = cj ? cj.x * w : j.x;
    this.joy.homeY = cj ? cj.y * h : j.y;
    this.joyEl.style.setProperty('--jd', j.r * 2 + 'px');
    if (this.joy.pid === null) this.placeJoystick(this.joy.homeX, this.joy.homeY, 0, 0);
    const mm = clamp(Math.min(w, h) * 0.3, 96, 150);
    document.documentElement.style.setProperty('--mm', mm + 'px');
  }

  placeJoystick(bx, by, kx, ky) {
    this.joy.baseX = bx; this.joy.baseY = by;
    this.joyBase.style.left = bx + 'px'; this.joyBase.style.top = by + 'px';
    this.joyKnob.style.left = bx + kx + 'px'; this.joyKnob.style.top = by + ky + 'px';
  }

  onDown(e) {
    if (this.editing) return;
    if (e.pointerType === 'mouse') return; // el ratón lo maneja KeyboardMouse
    e.preventDefault();
    const x = e.clientX, y = e.clientY;
    const btnEl = e.target.closest ? e.target.closest('[data-btn]') : null;
    if (btnEl && btnEl.dataset.btn !== 'joystick') {
      const id = btnEl.dataset.btn;
      if (btnEl.classList.contains('pill') && !btnEl.classList.contains('show')) return;
      this.pointers.set(e.pointerId, { type: 'btn', id, el: btnEl, lastX: x, lastY: y, look: LOOK_CAPABLE.has(id) });
      btnEl.classList.add('on');
      this.input.press(id);
      return;
    }
    const w = window.innerWidth, h = window.innerHeight;
    const mode = this.settings.get('joystick');
    const inJoyZone = x < w * 0.45 && y > h * 0.28;
    const nearHome = Math.hypot(x - this.joy.homeX, y - this.joy.homeY) < this.joy.R * 2.2;
    if (this.joy.pid === null && ((mode === 'float' && inJoyZone) || (mode === 'fixed' && nearHome))) {
      this.joy.pid = e.pointerId;
      this.pointers.set(e.pointerId, { type: 'joy' });
      if (mode === 'float') {
        // flotante: la base aparece justo bajo el pulgar (sin movimiento involuntario al tocar)
        const R = this.joy.R;
        this.placeJoystick(clamp(x, this.safe.l + R * 0.6, w * 0.5), clamp(y, R * 0.6, h - R * 0.6), 0, 0);
      } else {
        this.placeJoystick(this.joy.homeX, this.joy.homeY, 0, 0);
      }
      this.joyEl.classList.add('active');
      this.updateJoy(x, y);
      return;
    }
    if (this.lookPid === null) {
      this.lookPid = e.pointerId;
      this.pointers.set(e.pointerId, { type: 'look', lastX: x, lastY: y });
    }
  }

  onMove(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    e.preventDefault();
    const x = e.clientX, y = e.clientY;
    if (p.type === 'joy') { this.updateJoy(x, y); return; }
    if (p.type === 'look' || p.look) {
      this.input.addLook(x - p.lastX, y - p.lastY);
      p.lastX = x; p.lastY = y;
    }
  }

  onUp(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);
    if (p.type === 'joy') {
      this.joy.pid = null;
      this.input.joy.active = false; this.input.joy.x = 0; this.input.joy.y = 0;
      this.joyEl.classList.remove('active');
      this.placeJoystick(this.joy.homeX, this.joy.homeY, 0, 0);
    } else if (p.type === 'btn') {
      p.el.classList.remove('on');
      this.input.release(p.id);
    } else if (p.type === 'look') {
      this.lookPid = null;
    }
  }

  updateJoy(x, y) {
    const R = this.joy.R;
    let dx = x - this.joy.baseX, dy = y - this.joy.baseY;
    let len = Math.hypot(dx, dy);
    // En modo flotante la base "sigue" al dedo si se pasa del borde: cambiar de dirección es inmediato
    if (this.settings.get('joystick') === 'float' && len > R * 1.3) {
      const k = (len - R * 1.3) / len;
      this.joy.baseX += dx * k; this.joy.baseY += dy * k;
      dx = x - this.joy.baseX; dy = y - this.joy.baseY; len = Math.hypot(dx, dy);
    }
    const v = Math.min(len / R, 1);
    const dead = 0.1;
    const mag = v < dead ? 0 : (v - dead) / (1 - dead);
    const nx = len > 0 ? dx / len : 0, ny = len > 0 ? dy / len : 0;
    this.input.joy.active = true;
    this.input.joy.x = nx * mag;
    this.input.joy.y = -ny * mag;
    const kl = Math.min(len, R);
    this.placeJoystick(this.joy.baseX, this.joy.baseY, nx * kl, ny * kl);
  }

  setToggled(id, on) { const b = this.buttons[id]; if (b) b.classList.toggle('toggled', !!on); }

  releaseAll() {
    for (const p of this.pointers.values()) if (p.el) p.el.classList.remove('on');
    this.pointers.clear();
    this.joy.pid = null; this.lookPid = null;
    this.joyEl.classList.remove('active');
    this.placeJoystick(this.joy.homeX, this.joy.homeY, 0, 0);
    this.input.releaseAll();
  }
}

// ------------------------------------------------------------------
// Teclado y ratón (para probar en PC)
// ------------------------------------------------------------------

const KEYMAP = {
  Space: 'jump', KeyC: 'crouch', ControlLeft: 'crouch', ShiftLeft: 'sprint', ShiftRight: 'sprint',
  KeyE: 'interact', KeyF: 'interact', KeyR: 'reload', KeyQ: 'aim', KeyX: 'exit', KeyG: 'bike',
};

export class KeyboardMouse {
  constructor(input, canvas, hooks) {
    this.input = input;
    this.canvas = canvas;
    this.hooks = hooks; // { onChat, onMap, onInv, onSettings, onEscape }
    this.down = new Set();
    this.locked = false;
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    document.addEventListener('mousedown', (e) => {
      if (!this.locked) {
        const t = e.target;
        const onControls = t && t.closest && t.closest('#controls') && !t.closest('[data-btn]');
        if (onControls && this.hooks.canLock?.() && matchMedia('(pointer: fine)').matches) canvas.requestPointerLock?.();
        return;
      }
      if (e.button === 0) this.input.press('fire');
      if (e.button === 2) this.input.press('aim');
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.input.release('fire');
      if (e.button === 2) this.input.release('aim');
    });
    document.addEventListener('contextmenu', (e) => { if (this.locked) e.preventDefault(); });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; });
    document.addEventListener('mousemove', (e) => {
      if (this.locked) this.input.addLook(e.movementX * 0.6, e.movementY * 0.6);
    });
  }

  onKey(e, isDown) {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
    const code = e.code;
    if (isDown && !e.repeat) {
      if (code === 'Enter' || code === 'KeyT') { e.preventDefault(); this.hooks.onChat?.(); return; }
      if (code === 'KeyM') { this.hooks.onMap?.(); return; }
      if (code === 'KeyI' || code === 'Tab') { e.preventDefault(); this.hooks.onInv?.(); return; }
      if (code === 'Escape') { this.hooks.onEscape?.(); return; }
    }
    if (isDown) this.down.add(code); else this.down.delete(code);
    const k = this.down;
    this.input.keys.x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    this.input.keys.y = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    // En vehículo: W acelera, S frena, Shift = pedalear fuerte
    if (code === 'KeyW' || code === 'ArrowUp') isDown ? this.input.press('accel') : this.input.release('accel');
    if (code === 'KeyS' || code === 'ArrowDown') isDown ? this.input.press('brake') : this.input.release('brake');
    if (code === 'ShiftLeft' || code === 'ShiftRight') isDown ? this.input.press('boost') : this.input.release('boost');
    const action = KEYMAP[code];
    if (action) {
      if (code === 'Space') e.preventDefault();
      if (isDown && !e.repeat) this.input.press(action);
      if (!isDown) this.input.release(action);
    }
  }
}
