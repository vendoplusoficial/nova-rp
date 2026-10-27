// Paneles: Ajustes, Personaje/Inventario, Mapa y editor de posición de botones.

import { ITEMS, JOBS } from '/shared/constants.js';
import { QUALITY } from '../engine/renderer.js';

const $ = (id) => document.getElementById(id);

export class Panels {
  constructor(game) {
    this.game = game;
    this.settings = game.settings;
    this.open = null;
    document.querySelectorAll('.panel [data-close]').forEach((b) => b.addEventListener('click', () => this.close()));
    this.buildSettings();
    this.setupLayoutEditor();
  }

  toggle(name) { this.open === name ? this.close() : this.show(name); }

  show(name) {
    this.close();
    this.open = name;
    $('panel-' + name).classList.remove('hidden');
    if (name === 'inv') this.renderInventory();
    if (name === 'map') requestAnimationFrame(() => this.game.drawBigMap());
    this.game.setUiBlocking('panel', true);
  }

  close() {
    if (!this.open) return;
    $('panel-' + this.open).classList.add('hidden');
    this.open = null;
    this.game.setUiBlocking('panel', false);
  }

  // ---------------- Ajustes ----------------
  buildSettings() {
    const body = $('settings-body');
    const s = this.settings;
    body.innerHTML = '';
    const group = (t) => { const d = document.createElement('div'); d.className = 'set-group'; d.textContent = t; body.appendChild(d); };
    const range = (key, label, min, max, step, fmt = (v) => v.toFixed(2)) => {
      const row = document.createElement('label'); row.className = 'set-row';
      const span = document.createElement('span'); span.textContent = label;
      const input = document.createElement('input'); input.type = 'range'; input.min = min; input.max = max; input.step = step; input.value = s.get(key);
      const val = document.createElement('span'); val.className = 'val'; val.textContent = fmt(s.get(key));
      input.addEventListener('input', () => { const v = parseFloat(input.value); val.textContent = fmt(v); s.set(key, v); });
      row.append(span, input, val); body.appendChild(row);
    };
    const toggle = (key, label) => {
      const row = document.createElement('label'); row.className = 'set-row';
      const span = document.createElement('span'); span.textContent = label;
      const input = document.createElement('input'); input.type = 'checkbox'; input.className = 'switch'; input.checked = !!s.get(key);
      input.addEventListener('change', () => s.set(key, input.checked));
      row.append(span, input); body.appendChild(row);
    };
    const select = (key, label, options, onChange) => {
      const row = document.createElement('label'); row.className = 'set-row';
      const span = document.createElement('span'); span.textContent = label;
      const sel = document.createElement('select');
      for (const [v, t] of options) { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); }
      sel.value = s.get(key);
      sel.addEventListener('change', () => { s.set(key, sel.value); onChange?.(sel.value); });
      row.append(span, sel); body.appendChild(row);
    };
    const button = (label, fn, ghost = true) => {
      const b = document.createElement('button'); b.className = 'btn-chip' + (ghost ? ' ghost' : ''); b.textContent = label; b.type = 'button';
      b.addEventListener('click', fn); return b;
    };

    group('Cámara y apuntado');
    range('sens', 'Sensibilidad de cámara', 0.3, 2.5, 0.05);
    range('aimSens', 'Sensibilidad al apuntar', 0.3, 1.2, 0.05);
    range('autoAim', 'Autoapuntado', 0, 1, 0.05, (v) => (v === 0 ? 'No' : Math.round(v * 100) + '%'));
    range('camDist', 'Distancia de cámara', 0.75, 1.4, 0.05);
    toggle('invertY', 'Invertir eje vertical');
    select('aimMode', 'Botón apuntar', [['toggle', 'Tocar (activar/desactivar)'], ['hold', 'Mantener presionado']]);

    group('Controles');
    select('joystick', 'Joystick', [['float', 'Flotante (donde toques)'], ['fixed', 'Fijo']]);
    range('btnScale', 'Tamaño de botones', 0.7, 1.5, 0.05);
    range('btnOpacity', 'Opacidad de botones', 0.3, 1, 0.05);
    const r1 = document.createElement('div'); r1.className = 'btn-row';
    r1.append(button('Personalizar posición de botones', () => { this.close(); this.startLayoutEditor(); }, false));
    body.appendChild(r1);

    group('Gráficos y sonido');
    select('quality', 'Calidad gráfica', [['auto', 'Automática (recomendada)'], ['low', QUALITY.low.label], ['medium', QUALITY.medium.label], ['high', QUALITY.high.label]],
      () => this.game.hud.toast('La calidad se aplicará al recargar el juego.'));
    toggle('showFps', 'Mostrar FPS y ping');
    range('volume', 'Volumen', 0, 1, 0.05, (v) => Math.round(v * 100) + '%');

    group('Cuenta');
    const r2 = document.createElement('div'); r2.className = 'btn-row';
    r2.append(
      button('Pantalla completa', () => this.game.requestFullscreen()),
      button('Recargar juego', () => location.reload()),
      button('Cerrar sesión', () => this.game.logout()),
    );
    body.appendChild(r2);
    const help = document.createElement('p'); help.className = 'muted small';
    help.textContent = 'PC: WASD mover · ratón cámara (clic para capturar) · clic izq. disparar · clic der./Q apuntar · Espacio saltar · Shift correr · C agacharse · E interactuar · R recargar · G pedir bici · Enter chat · M mapa · I inventario.';
    body.appendChild(help);
  }

  // ---------------- Personaje / inventario ----------------
  renderInventory() {
    const g = this.game;
    const body = $('inv-body');
    body.innerHTML = '';
    const kv = document.createElement('div'); kv.className = 'kv';
    const add = (k, v) => { const a = document.createElement('span'); a.textContent = k; const b = document.createElement('span'); b.textContent = v; kv.append(a, b); };
    add('Nombre', g.me.name);
    add('Dinero', '$' + g.me.money.toLocaleString('es-MX'));
    add('Salud', Math.round(g.me.health) + ' / 100');
    add('Trabajo', JOBS[g.me.job]?.name || 'Desempleado');
    add('Entregas', String(g.me.stats?.deliveries || 0));
    body.appendChild(kv);

    const h = document.createElement('div'); h.className = 'set-group'; h.textContent = 'Inventario'; body.appendChild(h);
    const inv = g.me.inv || {};
    const keys = Object.keys(inv).filter((k) => inv[k] > 0);
    if (!keys.length) { const p = document.createElement('p'); p.className = 'muted'; p.textContent = 'Vacío'; body.appendChild(p); }
    for (const k of keys) {
      const def = ITEMS[k] || { name: k };
      const row = document.createElement('div'); row.className = 'inv-item';
      const t = document.createElement('span'); t.textContent = `${def.name} × ${inv[k]}`;
      row.appendChild(t);
      if (def.usable) {
        const b = document.createElement('button'); b.className = 'btn-chip'; b.textContent = `Usar (+${def.heal})`;
        b.addEventListener('click', () => g.net.send({ t: 'use', item: k }));
        row.appendChild(b);
      }
      body.appendChild(row);
    }

    const h2 = document.createElement('div'); h2.className = 'set-group'; h2.textContent = 'Acciones'; body.appendChild(h2);
    const row = document.createElement('div'); row.className = 'btn-row';
    const btn = (label, fn, ghost) => { const b = document.createElement('button'); b.className = 'btn-chip' + (ghost ? ' ghost' : ''); b.textContent = label; b.addEventListener('click', fn); row.appendChild(b); };
    btn('Pedir mi bicicleta', () => { g.net.send({ t: 'veh_spawn' }); this.close(); });
    btn('Ver mapa', () => this.show('map'), true);
    if (g.me.job !== 'none') btn('Dejar trabajo', () => { g.net.send({ t: 'job_quit' }); this.close(); }, true);
    body.appendChild(row);
    const tip = document.createElement('p'); tip.className = 'muted small';
    tip.textContent = 'Consigue trabajo de Repartidor en el Centro de Trabajos (marcador naranja en la Zona Comercial). Próximamente: Fabricante de armas, Médico y Policía.';
    body.appendChild(tip);
  }

  // ---------------- Editor de botones ----------------
  setupLayoutEditor() {
    this.editor = $('layout-editor');
    this.draft = null;
    const scale = $('le-scale'), opacity = $('le-opacity');
    scale.addEventListener('input', () => { this.settings.set('btnScale', parseFloat(scale.value)); this.game.touch.relayout(this.draft); });
    opacity.addEventListener('input', () => { this.settings.set('btnOpacity', parseFloat(opacity.value)); this.game.touch.relayout(this.draft); });
    $('le-reset').addEventListener('click', () => {
      this.draft = {};
      this.settings.set('btnScale', 1); this.settings.set('btnOpacity', 0.85);
      scale.value = 1; opacity.value = 0.85;
      this.game.touch.relayout(this.draft);
    });
    $('le-save').addEventListener('click', () => this.stopLayoutEditor(true));

    const controls = $('controls');
    let drag = null;
    controls.addEventListener('pointerdown', (e) => {
      if (!this.draft) return;
      const el = e.target.closest('[data-btn]');
      if (!el) return;
      e.preventDefault();
      drag = { id: el.dataset.btn, pid: e.pointerId };
      controls.setPointerCapture?.(e.pointerId);
    });
    controls.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.pid) return;
      this.draft[drag.id] = { x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight };
      this.game.touch.relayout(this.draft);
    });
    const end = (e) => { if (drag && e.pointerId === drag.pid) drag = null; };
    controls.addEventListener('pointerup', end);
    controls.addEventListener('pointercancel', end);
  }

  startLayoutEditor() {
    this.draft = JSON.parse(JSON.stringify(this.settings.get('layout') || {}));
    $('le-scale').value = this.settings.get('btnScale');
    $('le-opacity').value = this.settings.get('btnOpacity');
    this.editor.classList.remove('hidden');
    $('hud').classList.add('editing');
    this.game.touch.editing = true;
    this.game.touch.releaseAll();
    this.game.setUiBlocking('editor', true);
  }

  stopLayoutEditor(save) {
    if (save && this.draft) this.settings.set('layout', this.draft);
    this.draft = null;
    this.editor.classList.add('hidden');
    $('hud').classList.remove('editing');
    this.game.touch.editing = false;
    this.game.touch.relayout();
    this.game.setUiBlocking('editor', false);
    this.game.hud.toast('Controles guardados.', true);
  }
}
