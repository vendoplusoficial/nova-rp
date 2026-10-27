// Jugador local: movimiento a pie (caminar/correr/esprintar/agacharse/saltar),
// montar y bajar de la bici, y el estado que se envía al servidor.
// Todo usa suavizado exponencial para que el control sea fluido pero inmediato.

import { MOVE, ANIM } from '/shared/constants.js';
import { Character } from './character.js';
import { BikeController, BikeModel } from './bike.js';
import { damp, dampAngle, clamp, lerp } from '../util/math.js';
import { hashString } from '/shared/rng.js';

export class LocalPlayer {
  constructor(game, { x, y, z, ry, color, name }) {
    this.game = game;
    this.physics = game.physics;
    this.color = color;
    this.ch = this.physics.createCharacter(x, y, z);
    this.character = new Character({ shirt: color, seed: hashString(name) });
    game.scene.add(this.character.root);
    this.vx = 0; this.vz = 0; this.vy = 0;
    this.facing = ry || 0;
    this.grounded = true;
    this.coyote = 0; this.jumpBuf = 0; this.airTime = 0;
    this.crouch = false; this.sprint = false; this.idleTime = 0;
    this.anim = ANIM.IDLE;
    this.speed = 0;          // velocidad real (suavizada) para animación y red
    this.dead = false;
    this.vehicle = null;
    this.bikeModel = null;
    this.aiming = false;
    this.gunVisibleT = 0;
  }

  get x() { return this.ch.x; }
  get y() { return this.ch.y; }
  get z() { return this.ch.z; }

  update(dt, input, cam, weapon) {
    this.aiming = !!weapon?.aiming && !this.vehicle && !this.dead;
    if (this.dead) {
      this.anim = ANIM.DEAD;
      this.vx = this.vz = 0;
    } else if (this.vehicle) {
      this.updateVehicle(dt, input);
    } else {
      this.updateFoot(dt, input, cam, weapon);
    }
    this.updateVisual(dt, cam, weapon);
  }

  updateFoot(dt, input, cam, weapon) {
    const mv = input.getMove();
    if (input.consume('crouch') && this.grounded) { this.crouch = !this.crouch; if (this.crouch) this.sprint = false; }
    if (input.consume('sprint')) { this.sprint = !this.sprint; if (this.sprint) this.crouch = false; }
    if (input.consume('jump')) this.jumpBuf = 0.15;

    const aiming = this.aiming;
    const faceCam = aiming || weapon?.recentlyFired;
    if (mv.mag < 0.08) { this.idleTime += dt; if (this.idleTime > 0.35) this.sprint = false; } else this.idleTime = 0;
    if (aiming) this.sprint = false;

    let target = 0;
    if (mv.mag >= 0.02) {
      if (this.crouch) target = MOVE.CROUCH * Math.min(1, mv.mag * 1.2);
      else if (aiming) target = MOVE.WALK * 1.15 * Math.min(1, mv.mag * 1.3);
      else if (this.sprint) target = MOVE.SPRINT;
      else if (mv.mag < 0.55) target = MOVE.WALK * (mv.mag / 0.55);
      else target = lerp(MOVE.WALK, MOVE.RUN, clamp((mv.mag - 0.55) / 0.35, 0, 1));
    }
    const yaw = cam.yaw;
    const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -Math.cos(yaw), rz = Math.sin(yaw);
    let dx = fx * mv.y + rx * mv.x, dz = fz * mv.y + rz * mv.x;
    const dl = Math.hypot(dx, dz);
    if (dl > 1e-4) { dx /= dl; dz /= dl; }
    const accel = this.grounded ? MOVE.ACCEL_GROUND : MOVE.ACCEL_AIR;
    this.vx = damp(this.vx, dx * target, accel, dt);
    this.vz = damp(this.vz, dz * target, accel, dt);

    const hs = Math.hypot(this.vx, this.vz);
    if (faceCam) this.facing = dampAngle(this.facing, yaw, 22, dt);
    else if (hs > 0.25 && target > 0) this.facing = dampAngle(this.facing, Math.atan2(this.vx, this.vz), MOVE.TURN_SPEED, dt);

    // Salto con "coyote time" y búfer (se siente más responsivo)
    this.coyote = this.grounded ? 0.12 : this.coyote - dt;
    this.jumpBuf -= dt;
    if (this.jumpBuf > 0 && this.coyote > 0) {
      this.vy = MOVE.JUMP_VELOCITY; this.jumpBuf = 0; this.coyote = 0; this.crouch = false; this.grounded = false;
      this.game.audio?.click();
    } else if (this.grounded && this.vy <= 0) {
      this.vy = -2;
    } else {
      this.vy -= MOVE.GRAVITY * dt;
    }

    const px = this.ch.x, py = this.ch.y, pz = this.ch.z;
    this.physics.move(this.ch, this.vx * dt, this.vy * dt, this.vz * dt, dt);
    if (this.vy > 0 && this.ch.y - py < this.vy * dt * 0.3) this.vy = 0; // techo
    this.grounded = this.ch.grounded;
    if (this.grounded && this.vy < 0) this.vy = -2;
    this.airTime = this.grounded ? 0 : this.airTime + dt;

    // Velocidad real (si chocas contra una pared no "corres en el sitio")
    const real = Math.hypot(this.ch.x - px, this.ch.z - pz) / Math.max(dt, 1e-4);
    this.speed = damp(this.speed, Math.min(real, target + 0.5), 12, dt);

    const s = this.speed;
    if (!this.grounded && this.airTime > 0.08) this.anim = this.vy > 0 ? ANIM.JUMP : ANIM.FALL;
    else if (this.crouch) this.anim = s > 0.3 ? ANIM.CROUCH_WALK : ANIM.CROUCH;
    else if (s < 0.3) this.anim = ANIM.IDLE;
    else if (s < 3.4) this.anim = ANIM.WALK;
    else if (s < 6.3) this.anim = ANIM.RUN;
    else this.anim = ANIM.SPRINT;
  }

  updateVehicle(dt, input) {
    const v = this.vehicle;
    v.update(dt, input, this.physics, this.ch);
    this.facing = v.heading;
    this.speed = Math.abs(v.speed);
    this.anim = ANIM.RIDE;
    this.grounded = this.ch.grounded;
    this.bikeModel.setPose(this.ch.x, this.ch.y, this.ch.z, v.heading, v.lean);
    this.bikeModel.spin(dt, v.speed, v.steer);
  }

  updateVisual(dt, cam, weapon) {
    const c = this.character;
    c.root.position.set(this.ch.x, this.ch.y, this.ch.z);
    c.root.rotation.y = this.facing;
    c.root.rotation.z = this.vehicle ? this.vehicle.lean : 0;
    const ground = this.grounded ? this.ch.y : this.physics.groundAt(this.ch.x, this.ch.z, this.ch.y);
    c.setShadowHeight(this.ch.y - ground);
    c.shadow.visible = !this.vehicle;
    if (weapon?.recentlyFired || this.aiming) this.gunVisibleT = 2.5; else this.gunVisibleT -= dt;
    c.update(dt, {
      anim: this.anim, speed: this.speed, aiming: this.aiming || !!weapon?.recentlyFired,
      aimPitch: cam.pitch, pedal: this.vehicle ? this.vehicle.pedal : 0,
      gun: this.gunVisibleT > 0 && !this.vehicle && !this.dead,
    });
  }

  enterVehicle(v) {
    this.vehicle = new BikeController(v.id, v.ry || 0);
    this.bikeModel = new BikeModel(this.color);
    this.game.scene.add(this.bikeModel.root);
    this.physics.teleport(this.ch, v.x, Math.max(0, v.y || 0), v.z);
    this.crouch = false; this.sprint = false;
    this.vx = this.vz = 0;
    this.bikeModel.setPose(v.x, v.y || 0, v.z, v.ry || 0, 0);
  }

  // Baja de la bici por el lado izquierdo (con colisión). Devuelve el rumbo de la bici.
  exitVehicle() {
    const v = this.vehicle;
    if (!v) return 0;
    const h = v.heading;
    this.vehicle = null;
    this.game.scene.remove(this.bikeModel.root);
    this.bikeModel = null;
    const lx = Math.cos(h), lz = -Math.sin(h);
    this.physics.move(this.ch, lx * 0.9, 0, lz * 0.9, 1 / 60);
    this.facing = h;
    this.vx = this.vz = 0;
    this.speed = 0;
    return h;
  }

  teleport(x, y, z) {
    this.physics.teleport(this.ch, x, y, z);
    this.vx = this.vz = this.vy = 0;
  }

  netState() {
    return {
      t: 'st',
      x: round2(this.ch.x), y: round2(this.ch.y), z: round2(this.ch.z), ry: round2(this.facing),
      a: this.anim | (this.aiming ? 16 : 0), v: this.vehicle ? 1 : 0, sp: Math.round(this.speed * 10) / 10,
    };
  }

  dispose() {
    this.game.scene.remove(this.character.root);
    this.character.dispose();
    if (this.bikeModel) this.game.scene.remove(this.bikeModel.root);
  }
}

function round2(v) { return Math.round(v * 100) / 100; }
