// Pistola: apuntar, disparar, recargar, autoapuntado suave y efectos (trazadoras, fogonazo, impactos).
// El impacto contra jugadores lo confirma el SERVIDOR (anti-trampas).

import * as THREE from 'three';
import { COMBAT } from '/shared/constants.js';
import { angleDiff, clamp } from '../util/math.js';

const TRACERS = 8;

export class Weapon {
  constructor(game) {
    this.game = game;
    this.mag = COMBAT.PISTOL_MAG;
    this.ammo = this.mag;
    this.reloading = 0;
    this.cooldown = 0;
    this.aimToggle = false;
    this.aiming = false;
    this.lastFire = -10;
    this.time = 0;
    this.overTarget = false;
    this.assistTarget = null;
    this.losCache = new Map();
    this.buildEffects(game.scene);
  }

  get recentlyFired() { return this.time - this.lastFire < 0.6; }

  buildEffects(scene) {
    const geo = new THREE.BoxGeometry(0.025, 0.025, 1).translate(0, 0, 0.5);
    this.tracers = [];
    for (let i = 0; i < TRACERS; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0, depthWrite: false, fog: false }));
      m.visible = false;
      m.userData.life = 0;
      scene.add(m);
      this.tracers.push(m);
    }
    this.tracerIdx = 0;
    const flashTex = radialTexture('rgba(255,236,170,1)', 'rgba(255,160,40,0)');
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.flash.scale.setScalar(0.45);
    this.flash.visible = false;
    scene.add(this.flash);
    const puffTex = radialTexture('rgba(220,220,220,0.9)', 'rgba(160,160,160,0)');
    this.puffs = [];
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false }));
      s.visible = false; s.userData.life = 0;
      scene.add(s);
      this.puffs.push(s);
    }
    this.puffIdx = 0;
    this.flashLife = 0;
  }

  // Lista de objetivos: jugadores remotos vivos + muñecos del campo de tiro
  targets() {
    const out = [];
    for (const r of this.game.remotes.list()) if (!r.dead) out.push({ kind: 'player', id: r.id, x: r.x, y: r.y, z: r.z, h: r.crouch ? 1.2 : 1.8 });
    for (const d of this.game.dummies) out.push({ kind: 'dummy', id: 0, x: d.x, y: d.y || 0, z: d.z, h: 2.0 });
    return out;
  }

  update(dt, input, cam, player) {
    this.time += dt;
    this.cooldown -= dt;
    const blocked = player.dead || !!player.vehicle || !!this.game.safeZone;
    if (this.game.safeZone && !player.dead && !player.vehicle && (input.isHeld('fire') || input.isHeld('aim')) && this.time - (this.safeMsgT || -9) > 3) {
      this.safeMsgT = this.time;
      this.game.hud.toast('Zona segura: aquí no se puede disparar.');
    }
    const mode = this.game.settings.get('aimMode');
    if (input.consume('aim')) { if (mode === 'toggle') this.aimToggle = !this.aimToggle; }
    if (blocked) this.aimToggle = false;
    this.aiming = !blocked && (mode === 'toggle' ? this.aimToggle : input.isHeld('aim'));
    if (player.sprint && this.aiming) player.sprint = false;

    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) { this.ammo = this.mag; this.game.hud.setAmmo(this.ammo, this.mag); }
    }
    if (!blocked && input.consume('reload') && this.ammo < this.mag && this.reloading <= 0) this.startReload();

    const firing = !blocked && input.isHeld('fire');
    this.assist(dt, input, cam, firing);
    if (firing && this.cooldown <= 0 && this.reloading <= 0) {
      if (this.ammo > 0) this.fire(cam, player);
      else this.startReload();
    }

    // Mira roja si apuntas a alguien
    if ((this.frameN = (this.frameN || 0) + 1) % 3 === 0) {
      const r = cam.aimRay();
      this.overTarget = !!this.pick(r, false).target;
    }
    this.updateEffects(dt);
  }

  startReload() {
    if (this.reloading > 0) return;
    this.reloading = COMBAT.RELOAD_TIME;
    this.game.hud.setAmmo('…', this.mag);
    this.game.audio.reload();
  }

  // Autoapuntado suave: gira la cámara poco a poco hacia el objetivo más cercano a la mira
  assist(dt, input, cam, firing) {
    const strength = this.game.settings.get('autoAim');
    cam.sensMul = 1;
    if (strength <= 0 || (!this.aiming && !firing && !this.recentlyFired)) { this.assistTarget = null; return; }
    const r = cam.aimRay();
    const cone = 0.09 + 0.09 * strength;
    let best = null, bestAng = cone;
    for (const t of this.targets()) {
      const tx = t.x - r.ox, ty = t.y + t.h * 0.62 - r.oy, tz = t.z - r.oz;
      const d = Math.hypot(tx, ty, tz);
      if (d > 45 || d < 1) continue;
      const dot = (tx * r.dx + ty * r.dy + tz * r.dz) / d;
      const ang = Math.acos(clamp(dot, -1, 1));
      if (ang < bestAng && this.visible(t, r)) { best = { t, tx, ty, tz, d, ang }; bestAng = ang; }
    }
    this.assistTarget = best?.t || null;
    if (!best) return;
    const wantYaw = Math.atan2(best.tx, best.tz);
    const wantPitch = Math.atan2(-best.ty, Math.hypot(best.tx, best.tz));
    const manual = 1 / (1 + input.lookActivity * 0.08);
    const k = (1 - Math.exp(-dt * 7 * strength)) * manual;
    const maxStep = 2.2 * strength * dt;
    cam.addAssist(clamp(angleDiff(cam.yaw, wantYaw) * k, -maxStep, maxStep), clamp((wantPitch - cam.pitch) * k, -maxStep, maxStep));
    if (best.ang < 0.04) cam.sensMul = 1 - 0.35 * strength; // "fricción" sobre el objetivo
  }

  visible(t, r) {
    const key = t.kind + t.id + (t.kind === 'dummy' ? t.x : '');
    const now = this.time;
    const c = this.losCache.get(key);
    if (c && now - c.t < 0.15) return c.v;
    const v = !this.game.physics.grid.segmentBlocked(r.ox, r.oy, r.oz, t.x, t.y + t.h * 0.62, t.z);
    this.losCache.set(key, { t: now, v });
    return v;
  }

  // Busca qué golpea el rayo: objetivo más cercano o pared/suelo
  pick(r, magnet) {
    const wall = this.game.physics.raycast(r.ox, r.oy, r.oz, r.dx, r.dy, r.dz, 120);
    let best = null, bestT = wall;
    const hd = Math.hypot(r.dx, r.dz) || 1e-6;
    for (const t of this.targets()) {
      // punto del rayo más cercano al eje vertical del objetivo
      const s = ((t.x - r.ox) * r.dx + (t.z - r.oz) * r.dz) / (hd * hd);
      if (s <= 0 || s >= bestT) continue;
      const px = r.ox + r.dx * s, py = r.oy + r.dy * s, pz = r.oz + r.dz * s;
      if (Math.hypot(px - t.x, pz - t.z) < 0.42 && py > t.y + 0.05 && py < t.y + t.h) { best = t; bestT = s; }
    }
    if (!best && magnet) {
      const strength = this.game.settings.get('autoAim');
      const lim = 0.012 + 0.03 * strength;
      for (const t of this.targets()) {
        const tx = t.x - r.ox, ty = t.y + t.h * 0.6 - r.oy, tz = t.z - r.oz;
        const d = Math.hypot(tx, ty, tz);
        if (d > 60 || d >= wall) continue;
        const ang = Math.acos(clamp((tx * r.dx + ty * r.dy + tz * r.dz) / d, -1, 1));
        if (ang < lim) { best = t; bestT = d; }
      }
    }
    const t = Math.min(bestT, 120);
    return { target: best, point: new THREE.Vector3(r.ox + r.dx * t, best ? r.oy + r.dy * t : r.oy + r.dy * t, r.oz + r.dz * t), dist: t };
  }

  fire(cam, player) {
    this.cooldown = COMBAT.FIRE_INTERVAL;
    this.ammo--;
    this.lastFire = this.time;
    this.game.hud.setAmmo(this.ammo, this.mag);
    const r = cam.aimRay();
    const hit = this.pick(r, true);
    let point = hit.point;
    if (hit.target) point = new THREE.Vector3(hit.target.x, hit.target.y + hit.target.h * 0.6, hit.target.z);
    // boca del cañón aproximada (mano derecha)
    const f = player.facing;
    const mx = player.x + Math.sin(f) * 0.55 - Math.cos(f) * 0.26;
    const mz = player.z + Math.cos(f) * 0.55 + Math.sin(f) * 0.26;
    const my = player.y + (player.crouch ? 1.1 : 1.42);
    const muzzle = new THREE.Vector3(mx, my, mz);
    const dir = point.clone().sub(muzzle).normalize();
    this.effects(muzzle, point, !hit.target);
    player.character.fire();
    cam.kick += 0.012;
    this.game.audio.shot(0);
    try { navigator.vibrate?.(hit.target ? [10, 30, 18] : 10); } catch { /* sin vibración */ }
    if (hit.target) {
      if (hit.target.kind === 'dummy') this.game.hud.hitmarker(false);
      this.game.audio.hit();
    }
    this.game.net.send({
      t: 'shoot', tid: hit.target?.kind === 'player' ? hit.target.id : 0,
      o: [r2(mx), r2(my), r2(mz)], d: [r3(dir.x), r3(dir.y), r3(dir.z)],
    });
    if (this.ammo <= 0) setTimeout(() => this.startReload(), 250);
  }

  // Efectos visuales: también se usan para disparos de otros jugadores
  effects(from, to, impact) {
    const tr = this.tracers[this.tracerIdx++ % TRACERS];
    tr.position.copy(from);
    tr.lookAt(to);
    tr.scale.set(1, 1, Math.max(0.1, from.distanceTo(to)));
    tr.material.opacity = 0.9;
    tr.visible = true;
    tr.userData.life = 0.08;
    this.flash.position.copy(from);
    this.flash.visible = true;
    this.flashLife = 0.05;
    if (impact) {
      const p = this.puffs[this.puffIdx++ % this.puffs.length];
      p.position.copy(to);
      p.scale.setScalar(0.3);
      p.material.opacity = 0.9;
      p.visible = true;
      p.userData.life = 0.35;
    }
  }

  updateEffects(dt) {
    for (const tr of this.tracers) {
      if (!tr.visible) continue;
      tr.userData.life -= dt;
      tr.material.opacity = Math.max(0, tr.userData.life / 0.08) * 0.9;
      if (tr.userData.life <= 0) tr.visible = false;
    }
    if (this.flash.visible) { this.flashLife -= dt; if (this.flashLife <= 0) this.flash.visible = false; }
    for (const p of this.puffs) {
      if (!p.visible) continue;
      p.userData.life -= dt;
      p.scale.setScalar(0.3 + (0.35 - p.userData.life) * 1.6);
      p.material.opacity = Math.max(0, p.userData.life / 0.35) * 0.8;
      if (p.userData.life <= 0) p.visible = false;
    }
  }
}

function r2(v) { return Math.round(v * 100) / 100; }
function r3(v) { return Math.round(v * 1000) / 1000; }

function radialTexture(inner, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, inner);
  grd.addColorStop(1, outer);
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
