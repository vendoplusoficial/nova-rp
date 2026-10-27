// Jugadores remotos: interpolación entre snapshots del servidor (movimiento suave aunque la red tenga saltos),
// etiqueta con nombre, bici cuando van montados y animación según su estado.

import * as THREE from 'three';
import { NET, ANIM } from '/shared/constants.js';
import { Character } from './character.js';
import { BikeModel } from './bike.js';
import { hashString } from '/shared/rng.js';
import { lerp, lerpAngle, damp, angleDiff, clamp } from '../util/math.js';

class RemotePlayer {
  constructor(scene, id, name, color) {
    this.scene = scene;
    this.id = id; this.name = name; this.color = color;
    this.character = new Character({ shirt: color, seed: hashString(name) });
    scene.add(this.character.root);
    this.buf = [];
    this.x = 0; this.y = 0; this.z = 0; this.ry = 0;
    this.anim = ANIM.IDLE; this.aiming = false; this.veh = 0; this.sp = 0;
    this.dead = false; this.crouch = false;
    this.bike = null; this.lean = 0; this.pedal = 0; this.prevRy = 0;
    this.gunT = 0;
    this.tag = makeNameTag(name, color);
    this.tag.position.y = 2.15;
    this.character.root.add(this.tag);
    this.visible = false;
    this.character.root.visible = false;
  }

  push(ts, s) {
    this.buf.push({ t: ts, x: s[1], y: s[2], z: s[3], ry: s[4], a: s[5], v: s[6], sp: s[7] });
    if (this.buf.length > 30) this.buf.splice(0, this.buf.length - 30);
  }

  update(dt, renderTs, camPos) {
    const b = this.buf;
    if (!b.length) return;
    let s;
    if (renderTs <= b[0].t) s = b[0];
    else if (renderTs >= b[b.length - 1].t) {
      const last = b[b.length - 1], prev = b[b.length - 2];
      const ahead = Math.min(renderTs - last.t, 150);
      if (prev && last.t > prev.t && ahead > 0) {
        const k = ahead / (last.t - prev.t);
        s = { ...last, x: last.x + (last.x - prev.x) * k, z: last.z + (last.z - prev.z) * k };
      } else s = last;
    } else {
      let i = b.length - 2;
      while (i > 0 && b[i].t > renderTs) i--;
      const A = b[i], B = b[i + 1];
      const k = (renderTs - A.t) / Math.max(1, B.t - A.t);
      s = { x: lerp(A.x, B.x, k), y: lerp(A.y, B.y, k), z: lerp(A.z, B.z, k), ry: lerpAngle(A.ry, B.ry, k), a: k < 0.5 ? A.a : B.a, v: B.v, sp: lerp(A.sp, B.sp, k) };
      if (i > 2) b.splice(0, i - 2);
    }
    // Teletransporte (reaparición): no interpolar a través del mapa
    if (Math.hypot(s.x - this.x, s.z - this.z) > 25) { this.x = s.x; this.z = s.z; }
    this.x = s.x; this.y = s.y; this.z = s.z;
    const turn = angleDiff(this.ry, s.ry);
    this.ry = s.ry;
    this.anim = s.a & 15;
    this.aiming = (s.a & 16) !== 0;
    this.veh = s.v; this.sp = s.sp;
    this.dead = this.anim === ANIM.DEAD;
    this.crouch = this.anim === ANIM.CROUCH || this.anim === ANIM.CROUCH_WALK;

    const dist = Math.hypot(camPos.x - this.x, camPos.z - this.z);
    const vis = dist < 220;
    if (vis !== this.visible) { this.visible = vis; this.character.root.visible = vis; if (this.bike) this.bike.root.visible = vis && this.veh; }
    if (!vis) return;

    const root = this.character.root;
    root.position.set(this.x, this.y, this.z);
    root.rotation.y = this.ry;
    if (this.veh) {
      if (!this.bike) { this.bike = new BikeModel(this.color); this.scene.add(this.bike.root); }
      this.bike.root.visible = true;
      const yawRate = dt > 0 ? turn / dt : 0;
      this.lean = damp(this.lean, clamp(-yawRate * this.sp * 0.05, -0.4, 0.4), 6, dt);
      this.bike.setPose(this.x, this.y, this.z, this.ry, this.lean);
      this.bike.spin(dt, this.sp, 0);
      this.pedal += (this.sp / 0.33) * 0.45 * dt;
      root.rotation.z = this.lean;
    } else {
      if (this.bike) this.bike.root.visible = false;
      root.rotation.z = 0;
    }
    this.character.shadow.visible = !this.veh;
    this.gunT -= dt;
    this.tag.visible = dist < 38 && !this.dead;
    this.character.update(dt, {
      anim: this.veh ? ANIM.RIDE : this.anim, speed: this.sp, aiming: this.aiming || this.gunT > 0,
      aimPitch: 0, pedal: this.pedal, gun: (this.aiming || this.gunT > 0) && !this.veh,
    });
    this.character.setShadowHeight(Math.max(0, this.y - this.heightAt(this.x, this.z)));
  }

  onShot() { this.gunT = 1.2; this.character.fire(); }

  dispose() {
    this.scene.remove(this.character.root);
    this.character.dispose();
    this.tag.material.map.dispose();
    this.tag.material.dispose();
    if (this.bike) this.scene.remove(this.bike.root);
  }
}

export class RemotePlayers {
  constructor(scene, heightAt = () => 0) {
    this.scene = scene;
    this.heightAt = heightAt;
    this.map = new Map();
    this.offset = null; // reloj del servidor - reloj local
  }

  add(id, name, color) {
    if (this.map.has(id)) return this.map.get(id);
    const r = new RemotePlayer(this.scene, id, name, color);
    r.heightAt = this.heightAt;
    this.map.set(id, r);
    return r;
  }

  remove(id) {
    const r = this.map.get(id);
    if (!r) return;
    r.dispose();
    this.map.delete(id);
  }

  clear() { for (const id of [...this.map.keys()]) this.remove(id); }

  onSnap(msg, myId) {
    const now = performance.now();
    const sample = msg.ts - now;
    if (this.offset === null || sample - this.offset > 500 || sample - this.offset < -2000) this.offset = sample;
    else this.offset += (sample - this.offset) * (sample > this.offset ? 0.2 : 0.02);
    for (const s of msg.p) {
      if (s[0] === myId) continue;
      const r = this.map.get(s[0]);
      if (r) r.push(msg.ts, s);
    }
  }

  update(dt, camPos) {
    if (this.offset === null) return;
    const renderTs = performance.now() + this.offset - NET.INTERP_DELAY_MS;
    for (const r of this.map.values()) r.update(dt, renderTs, camPos);
  }

  get(id) { return this.map.get(id); }
  list() { return [...this.map.values()].filter((r) => r.buf.length); }
}

function makeNameTag(name, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = '700 30px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
  const w = Math.min(240, g.measureText(name).width + 34);
  g.fillStyle = 'rgba(10,14,18,0.6)';
  roundRect(g, (256 - w) / 2, 10, w, 44, 12);
  g.fill();
  g.fillStyle = color;
  g.beginPath(); g.arc((256 - w) / 2 + 16, 32, 6, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffffff';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(name, 128 + 8, 33);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  s.scale.set(1.5, 0.375, 1);
  s.renderOrder = 5;
  return s;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
