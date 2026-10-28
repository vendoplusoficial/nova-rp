// Núcleo del juego: crea todos los sistemas, recibe mensajes del servidor y ejecuta el bucle principal.

import * as THREE from 'three';
import { getCity, safeZoneAt } from '/shared/city.js';
import { NET, ANIM, COMBAT } from '/shared/constants.js';
import { Renderer } from './engine/renderer.js';
import { DayCycle } from './engine/daycycle.js';
import { Physics } from './engine/physics.js';
import { CityRenderer } from './world/cityRenderer.js';
import { Markers } from './world/markers.js';
import { LocalPlayer } from './entities/localPlayer.js';
import { RemotePlayers } from './entities/remotePlayers.js';
import { Vehicles } from './entities/vehicles.js';
import { ThirdPersonCamera } from './camera/thirdPerson.js';
import { Weapon } from './combat/weapon.js';
import { Input, TouchControls, KeyboardMouse } from './input/input.js';
import { Net } from './net/network.js';
import { Hud } from './ui/hud.js';
import { Minimap } from './ui/minimap.js';
import { Chat } from './ui/chat.js';
import { Panels } from './ui/panels.js';
import { applyIcons } from './ui/icons.js';
import { DeliveryClient } from './jobs/deliveryClient.js';
import { installDevTeleport } from './dev/teleport.js';   // DEV-TP
import { loadUrbanCities } from './world/urbanLoader.js';

export class Game {
  constructor({ settings, audio, session, onLogout, requestFullscreen }) {
    this.settings = settings;
    this.audio = audio;
    this.session = session;
    this.onLogout = onLogout;
    this.requestFullscreen = requestFullscreen;
    this.blockers = new Set();
    this.me = null;
    this.myId = 0;
    this.running = false;
    this.interactCd = 0;
    this.sendAcc = 0;
    this.mapAcc = 0;
    this.fpsAcc = 0;
    this.frame = this.frame.bind(this);
  }

  async init(progress) {
    progress(0.05, 'Generando la ciudad…');
    this.city = getCity(undefined, { urban: false });   // las ciudades nuevas llegan después (urbanLoader)
    this.dummies = this.city.dummies;

    progress(0.12, 'Preparando gráficos…');
    this.renderer = new Renderer(document.getElementById('viewport'), this.settings);
    this.scene = this.renderer.scene;
    this.camera = this.renderer.camera;

    progress(0.2, 'Cargando físicas…');
    this.physics = new Physics(this.city);
    await this.physics.init({ onStatus: (t) => progress(0.25, t) });

    progress(0.35, 'Construyendo el mundo…');
    this.cityRenderer = new CityRenderer(this.scene, this.city, this.renderer.renderer);
    this.cityRenderer.setViewDistance(this.renderer.viewDist);
    this.renderer.onViewDistance = (d) => this.cityRenderer.setViewDistance(d);
    this.dayCycle = new DayCycle(this.renderer, this.cityRenderer);
    this.dayCycle.update(0, true);
    this.markers = new Markers(this.scene, (x, z) => this.city.height(x, z));
    const jc = this.city.pois.jobcenter;
    this.markers.addStatic(jc.x, jc.z, 0xe07a2c);
    this.remotes = new RemotePlayers(this.scene, (x, z) => this.city.surface(x, z));
    this.vehicles = new Vehicles(this.scene);
    this.delivery = new DeliveryClient(this);

    // Interfaz y controles
    this.hud = new Hud();
    applyIcons(document.getElementById('hud'));
    this.input = new Input(this.settings);
    this.touch = new TouchControls(this.input, document.getElementById('controls'), this.settings);
    this.keys = new KeyboardMouse(this.input, this.renderer.canvas, {
      onChat: () => this.chat.open(),
      onMap: () => this.panels.toggle('map'),
      onInv: () => this.panels.toggle('inv'),
      onEscape: () => { this.chat.close(); this.panels.close(); },
      canLock: () => this.blockers.size === 0,
    });
    this.chat = new Chat({ onSend: (m) => this.net.send({ t: 'chat', m }), onOpenChange: (o) => this.setUiBlocking('chat', o) });
    this.minimap = new Minimap(document.getElementById('minimap'), document.getElementById('bigmap'), this.city);
    this.panels = new Panels(this);
    this.bindHudButtons();
    this.settings.onChange((k) => {
      if (k === 'btnScale' || k === 'btnOpacity' || k === 'joystick') this.touch.relayout(this.panels.draft || undefined);
      if (k === 'volume') this.audio.applyVolume();
    });
    window.addEventListener('resize', () => { this.touch.measureSafeArea(); this.touch.relayout(this.panels.draft || undefined); });

    progress(0.4, 'Conectando al servidor…');
    this.net = new Net();
    this.registerHandlers();
    installDevTeleport(this);   // DEV-TP
    const welcome = await this.net.connect(this.session.token);

    this.applyWelcome(welcome, true);
    this.cam = new ThirdPersonCamera(this.camera, this.physics, this.settings);
    this.cam.reset(this.player.x, this.player.y, this.player.z, this.player.facing);
    this.weapon = new Weapon(this);
    this.hud.setAmmo(this.weapon.ammo, this.weapon.mag);

    await this.cityRenderer.preload(this.player.x, this.player.z, (p) => progress(0.55 + p * 0.4, 'Construyendo el mundo…'));
    progress(1, '¡Listo!');
  }

  start() {
    this.hud.show();
    this.touch.relayout();
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.frame);
    this.chat.add({ sys: true, m: `Bienvenido a Puerto Nova. Escribe /ayuda para ver comandos.` });
    setTimeout(() => loadUrbanCities(this), 1500);   // ciudades nuevas en segundo plano
    if (this.physics.backend !== 'rapier') this.chat.add({ sys: true, m: 'Aviso: usando física de respaldo (Rapier no cargó).' });
  }

  // ---------------- red ----------------

  registerHandlers() {
    const n = this.net;
    n.onStatus = (s, code) => {
      this.hud?.setNet(s);
      if (s === 'offline' && code === 4003) this.hud?.toast('Se inició sesión con tu cuenta en otro dispositivo.', false, 8000);
      if (s === 'offline' && code === 4001) this.onLogout?.('Tu sesión expiró. Vuelve a entrar.');
    };
    n.on('welcome', (m) => this.applyWelcome(m, false));
    n.on('snap', (m) => this.remotes?.onSnap(m, this.myId));
    n.on('pj', (m) => this.remotes.add(m.id, m.name, m.color));
    n.on('pl', (m) => this.remotes.remove(m.id));
    n.on('chat', (m) => this.chat.add(m));
    n.on('toast', (m) => this.hud.toast(m.m, !!m.good));
    n.on('money', (m) => {
      if (!this.me) return;
      this.me.money = m.v; this.hud.setMoney(m.v);
      if (m.d > 0) this.audio.cash();
      this.refreshPanel();
    });
    n.on('health', (m) => {
      if (!this.me) return;
      if (m.v < this.me.health) { this.hud.damageFlash(); this.audio.hurt(); }
      this.me.health = m.v; this.hud.setHealth(m.v); this.refreshPanel();
    });
    n.on('inv', (m) => { if (!this.me) return; this.me.inv = m.inv; this.refreshPanel(); });
    n.on('corr', (m) => {
      if (!this.player) return;
      this.player.teleport(m.x, m.y, m.z);
      if (this.player.vehicle) this.player.vehicle.speed = 0;
    });
    n.on('vadd', (m) => this.vehicles.upsert(m.v, (o) => this.colorOf(o)));
    n.on('vupd', (m) => this.vehicles.upsert(m.v, (o) => this.colorOf(o)));
    n.on('vdel', (m) => {
      this.vehicles.remove(m.id);
      if (this.player?.vehicle?.id === m.id) { this.player.exitVehicle(); this.hud.setVehicleMode(false); }
    });
    n.on('venter', (m) => {
      if (!this.player) return;
      this.player.enterVehicle(m);
      this.hud.setVehicleMode(true);
      this.audio.click();
    });
    n.on('vexit', () => {});
    n.on('job', (m) => {
      if (!this.me) return;
      this.me.job = m.job; this.me.task = m.task;
      this.markers.setTarget(this.delivery.target());
      if (m.task?.stage === 'pickup' || m.task?.stage === 'deliver') this.audio.bell();
      this.refreshPanel();
    });
    n.on('shot', (m) => {
      if (!this.player || !this.weapon) return;
      const r = this.remotes.get(m.id);
      r?.onShot();
      const from = new THREE.Vector3(m.o[0], m.o[1], m.o[2]), to = new THREE.Vector3(m.e[0], m.e[1], m.e[2]);
      this.weapon.effects(from, to, true);
      this.audio.shot(Math.hypot(from.x - this.player.x, from.z - this.player.z));
    });
    n.on('hitok', (m) => { this.hud.hitmarker(!!m.k); this.audio.hit(); });
    n.on('dead', (m) => {
      if (!this.player) return;
      this.player.dead = true;
      if (this.player.vehicle) { this.player.exitVehicle(); this.hud.setVehicleMode(false); }
      this.hud.showDeath(m.s || COMBAT.RESPAWN_SECONDS);
      this.input.releaseAll();
    });
    n.on('respawn', (m) => {
      if (!this.player) return;
      this.player.dead = false;
      this.player.teleport(m.x, m.y, m.z);
      this.me.health = m.health; this.hud.setHealth(m.health);
      this.hud.hideDeath();
      this.hud.toast('Reapareciste en el Hospital General.');
    });
    n.on('kicked', (m) => this.hud?.toast(m.m, false, 8000));
  }

  applyWelcome(m, first) {
    this.myId = m.id;
    this.dayCycle?.sync(m.clock);
    this.me = { name: m.name, color: m.color, money: m.money, health: m.health, inv: m.inv, job: m.job, task: m.task, stats: m.stats };
    if (first) {
      this.player = new LocalPlayer(this, { x: m.pos.x, y: m.pos.y, z: m.pos.z, ry: m.pos.ry, color: m.color, name: m.name });
    } else {
      // Reconexión: el servidor estacionó la bici al desconectar
      if (this.player.vehicle) { this.player.exitVehicle(); this.hud.setVehicleMode(false); }
      this.player.dead = false; this.hud.hideDeath();
      this.player.teleport(m.pos.x, m.pos.y, m.pos.z);
      this.hud.toast('Reconectado.', true);
    }
    this.remotes.clear();
    for (const p of m.players) this.remotes.add(p.id, p.name, p.color);
    this.vehicles.clear();
    for (const v of m.vehicles) this.vehicles.upsert(v, (o) => this.colorOf(o));
    this.hud.setMoney(m.money);
    this.hud.setHealth(m.health);
    this.markers.setTarget(this.delivery.target());
  }

  colorOf(ownerId) {
    if (ownerId === this.myId) return this.me.color;
    return this.remotes.get(ownerId)?.color || '#2bb5a0';
  }

  refreshPanel() { if (this.panels?.open === 'inv') this.panels.renderInventory(); }

  // ---------------- interfaz ----------------

  bindHudButtons() {
    document.querySelectorAll('#topbuttons [data-ui]').forEach((b) => {
      b.addEventListener('click', () => {
        this.audio.click();
        const id = b.dataset.ui;
        if (id === 'chat') this.chat.toggle();
        else if (id === 'bike') this.net.send({ t: 'veh_spawn' });
        else if (id === 'inv') this.panels.toggle('inv');
        else if (id === 'settings') this.panels.toggle('settings');
      });
    });
    document.getElementById('minimap').addEventListener('click', () => this.panels.toggle('map'));
  }

  drawBigMap() {
    const p = this.player;
    this.minimap.drawBig(p.x, p.z, p.facing, this.delivery.target(), this.remotes.list(), this.vehicles.owned(this.myId));
  }

  setUiBlocking(key, on) {
    if (on) this.blockers.add(key); else this.blockers.delete(key);
    const blocked = this.blockers.size > 0;
    this.input.setEnabled(!blocked);
    if (blocked) { this.touch.releaseAll(); if (document.pointerLockElement) document.exitPointerLock?.(); }
  }

  logout() {
    this.net.close();
    this.onLogout?.();
  }

  // ---------------- bucle ----------------

  frame(now) {
    if (!this.running) return;
    requestAnimationFrame(this.frame);
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (!(dt > 0)) return;
    dt = Math.min(dt, 0.05);
    if (this.renderer.contextLost) return;

    const input = this.input, p = this.player, cam = this.cam;
    cam.applyLook(input, this.weapon.aiming);
    this.weapon.update(dt, input, cam, p);

    // Bajar de la bici
    if (p.vehicle && (input.consume('exit') || input.consume('interact'))) {
      this.net.send(p.netState());
      const heading = p.exitVehicle();
      this.net.send({ t: 'veh_exit', ry: Math.round(heading * 100) / 100 });
      this.hud.setVehicleMode(false);
    }
    if (input.consume('bike')) this.net.send({ t: 'veh_spawn' });

    p.update(dt, input, cam, this.weapon);
    cam.update(dt, {
      x: p.x, y: p.y, z: p.z, crouch: p.crouch && !p.vehicle, aiming: this.weapon.aiming, sprint: p.anim === ANIM.SPRINT,
      vehicle: !!p.vehicle, heading: p.vehicle ? p.vehicle.heading : p.facing, speed: p.vehicle ? p.vehicle.speed : p.speed, dead: p.dead,
    });

    this.updateInteraction(dt);
    this.remotes.update(dt, this.camera.position);
    this.markers.update(dt);
    this.cityRenderer.update(this.camera.position.x, this.camera.position.z);

    // Enviar estado al servidor (15 veces por segundo)
    this.sendAcc += dt;
    if (this.sendAcc >= 1 / NET.CLIENT_SEND_HZ) {
      this.sendAcc = 0;
      if (!p.dead) this.net.send(p.netState());
    }

    // HUD
    this.touch.setToggled('sprint', p.sprint);
    this.touch.setToggled('crouch', p.crouch);
    this.touch.setToggled('aim', this.weapon.aiming);
    if (p.vehicle || p.dead) this.hud.setCrosshair('hide');
    else this.hud.setCrosshair((this.weapon.aiming ? 'aim' : '') + (this.weapon.overTarget ? ' target' : ''));
    this.mapAcc += dt;
    if (this.mapAcc > 0.1) {
      this.mapAcc = 0;
      const sz = p.dead ? null : safeZoneAt(this.city, p.x, p.z);
      this.safeZone = sz;
      this.hud.setSafeZone(sz ? sz.name : null);
      const [title, sub] = this.delivery.objective(p.x, p.z);
      this.hud.setObjective(title, sub);
      this.minimap.draw(p.x, p.z, cam.yaw, p.facing, this.remotes.list(), this.delivery.target(), this.vehicles.owned(this.myId));
      if (this.panels.open === 'map') this.drawBigMap();
    }
    this.fpsAcc += dt;
    if (this.fpsAcc > 0.5) {
      this.fpsAcc = 0;
      this.hud.setFps(this.settings.get('showFps')
        ? `${Math.round(this.renderer.fps)} FPS · ${Math.round(this.net.rtt)} ms · ${this.renderer.drawCalls} draws · ${this.physics.backend}`
        : null);
    }

    this.dayCycle.update(dt);
    if (this.mapAcc === 0) this.hud.setClock(`${this.dayCycle.label} · ${this.dayCycle.phase}`);
    input.endFrame();
    this.renderer.render();
    this.renderer.trackPerformance(dt);
  }

  updateInteraction(dt) {
    this.interactCd -= dt;
    const p = this.player;
    let action = null;
    if (!p.dead && !p.vehicle) {
      action = this.delivery.interaction(p.x, p.z);
      if (!action) {
        const bike = this.vehicles.nearestOwned(this.myId, p.x, p.z, 2.8);
        if (bike) action = { label: 'Subir a la bici', run: () => this.net.send({ t: 'veh_enter', id: bike.id }) };
      }
      if (!action) {
        const jc = this.city.pois.jobcenter;
        if (Math.hypot(jc.x - p.x, jc.z - p.z) < 5) {
          action = this.me.job === 'delivery'
            ? { label: 'Dejar trabajo', run: () => this.net.send({ t: 'job_quit' }) }
            : { label: 'Trabajar de Repartidor', run: () => this.net.send({ t: 'job_take', job: 'delivery' }) };
        }
      }
    }
    this.hud.setInteract(action ? action.label : null);
    if (this.input.consume('interact') && action && this.interactCd <= 0) {
      this.interactCd = 0.6;
      this.audio.click();
      action.run();
    }
  }
}

