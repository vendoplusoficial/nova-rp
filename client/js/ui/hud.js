// HUD: dinero, salud, munición, objetivo, avisos, mira, botón de interacción y estados.

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.el = $('hud');
    this.money = $('money');
    this.healthFill = $('health-fill');
    this.healthText = $('health-text');
    this.ammo = $('ammo');
    this.clock = $('clock');
    this.objective = $('objective');
    this.objTitle = this.objective.querySelector('.obj-title');
    this.objSub = this.objective.querySelector('.obj-sub');
    this.toasts = $('toasts');
    this.cross = $('crosshair');
    this.hit = $('hitmarker');
    this.flash = $('damage-flash');
    this.interactBtn = document.querySelector('[data-btn="interact"]');
    this.interactLabel = $('interact-label');
    this.controls = $('controls');
    this.death = $('death');
    this.deathCount = $('death-count');
    this.net = $('netstatus');
    this.fpsEl = $('fps');
    this.moneyValue = null;
    this.lastObj = '';
    this.lastInteract = null;
    this.crossState = '';
  }

  // Aviso de zona segura (no se puede disparar) y botones de arma atenuados
  setSafeZone(name) {
    if ((name || null) === (this.safeName || null)) return;
    this.safeName = name || null;
    if (!this.safeEl) {
      this.safeEl = document.createElement('div');
      this.safeEl.id = 'safezone';
      this.safeEl.className = 'hidden';
      this.el.appendChild(this.safeEl);
    }
    this.safeEl.textContent = name ? `ZONA SEGURA · ${name}` : '';
    this.safeEl.classList.toggle('hidden', !name);
    this.controls.classList.toggle('safe', !!name);
  }

  show() { this.el.classList.remove('hidden'); }
  hide() { this.el.classList.add('hidden'); }

  setMoney(v) {
    if (this.moneyValue !== null && v > this.moneyValue) {
      this.money.classList.remove('bump'); void this.money.offsetWidth; this.money.classList.add('bump');
    }
    this.moneyValue = v;
    this.money.textContent = '$' + v.toLocaleString('es-MX');
  }

  setHealth(v) {
    const p = Math.max(0, Math.min(100, v));
    this.healthFill.style.width = p + '%';
    this.healthText.textContent = String(Math.round(p));
  }

  setClock(text) { if (this.clock.textContent !== text) this.clock.textContent = text; }
  setAmmo(a, mag) { this.ammo.textContent = `Pistola ${a}/${mag}`; }

  setObjective(title, sub) {
    const key = title + '|' + sub;
    if (key === this.lastObj) return;
    this.lastObj = key;
    if (!title) { this.objective.classList.add('hidden'); return; }
    this.objective.classList.remove('hidden');
    this.objTitle.textContent = title;
    this.objSub.textContent = sub || '';
  }

  toast(msg, good = false, ms = 3200) {
    const d = document.createElement('div');
    d.className = 'toast' + (good ? ' good' : '');
    d.textContent = msg;
    this.toasts.appendChild(d);
    while (this.toasts.children.length > 3) this.toasts.firstChild.remove();
    setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 450); }, ms);
  }

  setInteract(label) {
    if (label === this.lastInteract) return;
    this.lastInteract = label;
    if (!label) { this.interactBtn.classList.remove('show'); return; }
    this.interactLabel.textContent = label;
    this.interactBtn.classList.add('show');
  }

  setCrosshair(state) {
    if (state === this.crossState) return;
    this.crossState = state;
    this.cross.className = state;
  }

  hitmarker(kill) {
    this.hit.classList.remove('show', 'kill');
    void this.hit.offsetWidth;
    this.hit.classList.add('show');
    if (kill) this.hit.classList.add('kill');
  }

  damageFlash() {
    this.flash.classList.add('on');
    clearTimeout(this.flashT);
    this.flashT = setTimeout(() => this.flash.classList.remove('on'), 80);
  }

  setVehicleMode(on) { this.controls.classList.toggle('vehicle', !!on); }

  showDeath(seconds) {
    this.controls.classList.add('dead');
    this.death.classList.remove('hidden');
    let s = seconds;
    this.deathCount.textContent = String(s);
    clearInterval(this.deathTimer);
    this.deathTimer = setInterval(() => { s = Math.max(0, s - 1); this.deathCount.textContent = String(s); }, 1000);
  }

  hideDeath() {
    clearInterval(this.deathTimer);
    this.controls.classList.remove('dead');
    this.death.classList.add('hidden');
  }

  setNet(state) { this.net.classList.toggle('hidden', state === 'online'); this.net.textContent = state === 'offline' ? 'Desconectado' : 'Reconectando…'; }

  setFps(text) {
    if (text === null) { this.fpsEl.classList.add('hidden'); return; }
    this.fpsEl.classList.remove('hidden');
    this.fpsEl.textContent = text;
  }
}
