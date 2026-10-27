// Bicicleta: modelo low-poly (3 llamadas de dibujo) y controlador de conducción arcade.
// Controles: joystick = dirección (y adelante = pedalear), botón ACELERAR, FRENAR (y reversa), TURBO.

import * as THREE from 'three';
import { GeoBuilder } from '../world/geometry.js';
import { VEHICLES, MOVE } from '/shared/constants.js';
import { damp, clamp } from '../util/math.js';

const CFG = VEHICLES.bike;
const WHEEL_R = 0.33;
let wheelGeo = null, mat = null, shadowGeo = null, shadowMat = null;
const frameCache = new Map();

function frameGeometry(color) {
  if (frameCache.has(color)) return frameCache.get(color);
  const b = new GeoBuilder(false);
  const t = 0.045;
  const crank = [0, 0.33, -0.05], seatTop = [0, 0.86, -0.2], headTop = [0, 0.93, 0.42], headBot = [0, 0.72, 0.47];
  const rear = [0, 0.34, -0.55], front = [0, 0.34, 0.56];
  b.beam(0, crank, seatTop, t, color);
  b.beam(0, seatTop, headTop, t, color);
  b.beam(0, crank, headBot, t * 1.2, color);
  b.beam(0, headBot, headTop, t * 1.1, color);
  for (const x of [-0.065, 0.065]) {
    b.beam(x, crank, rear, t * 0.7, color, t * 0.6);
    b.beam(x, seatTop, rear, t * 0.7, color, t * 0.6);
    b.beam(x, headBot, front, t * 0.8, 0x9aa0a6, t * 0.6);
  }
  b.beam(0, seatTop, [0, 0.95, -0.24], 0.03, 0x333333);
  b.box(-0.08, 0.95, -0.38, 0.08, 1.0, -0.12, 0x1e1e1e);                 // asiento
  b.beam(0, headTop, [0, 1.03, 0.38], 0.035, 0x333333);
  b.box(-0.3, 1.01, 0.36, 0.3, 1.045, 0.395, 0x2a2a2a);                  // manubrio
  b.box(-0.3, 1.0, 0.35, -0.22, 1.055, 0.405, 0x111111);
  b.box(0.22, 1.0, 0.35, 0.3, 1.055, 0.405, 0x111111);
  b.box(-0.16, 0.3, -0.09, 0.16, 0.36, -0.01, 0x333333);                 // pedales/biela
  b.box(-0.03, 0.18, -0.12, 0.03, 0.48, 0.02, 0x555555);
  b.box(-0.07, 0.5, 0.62, 0.07, 0.6, 0.66, 0xf5f2d0);                    // faro
  const g = b.build();
  frameCache.set(color, g);
  return g;
}

function wheelGeometry() {
  if (wheelGeo) return wheelGeo;
  const b = new GeoBuilder(false);
  const n = 16;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    b.beam(0, [0, Math.cos(a0) * WHEEL_R, Math.sin(a0) * WHEEL_R], [0, Math.cos(a1) * WHEEL_R, Math.sin(a1) * WHEEL_R], 0.055, 0x1b1b1b, 0.05);
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI;
    b.beam(0, [0, Math.cos(a) * WHEEL_R, Math.sin(a) * WHEEL_R], [0, -Math.cos(a) * WHEEL_R, -Math.sin(a) * WHEEL_R], 0.012, 0xb0b5b9, 0.012);
  }
  b.box(-0.05, -0.04, -0.04, 0.05, 0.04, 0.04, 0x777777);
  wheelGeo = b.build();
  return wheelGeo;
}

function colorHex(c) { return typeof c === 'number' ? c : parseInt(String(c || '#2bb5a0').replace('#', ''), 16); }

export class BikeModel {
  constructor(color = '#2bb5a0') {
    mat ||= new THREE.MeshLambertMaterial({ vertexColors: true });
    this.root = new THREE.Group();
    this.tilt = new THREE.Group();     // se inclina en las curvas
    this.root.add(this.tilt);
    this.frame = new THREE.Mesh(frameGeometry(colorHex(color)), mat);
    this.wheelR = new THREE.Mesh(wheelGeometry(), mat);
    this.wheelF = new THREE.Mesh(wheelGeometry(), mat);
    this.wheelR.position.set(0, 0.34, -0.55);
    this.wheelF.position.set(0, 0.34, 0.56);
    this.wheelF.rotation.order = 'YXZ'; // primero gira la rueda, luego la dirección
    this.tilt.add(this.frame, this.wheelR, this.wheelF);
    shadowGeo ||= new THREE.PlaneGeometry(0.5, 1.7).rotateX(-Math.PI / 2);
    shadowMat ||= new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false });
    this.shadow = new THREE.Mesh(shadowGeo, shadowMat);
    this.shadow.position.y = 0.025;
    this.shadow.renderOrder = 1;
    this.root.add(this.shadow);
    this.wheelAngle = 0;
  }

  setPose(x, y, z, heading, lean) {
    this.root.position.set(x, y, z);
    this.root.rotation.y = heading;
    this.tilt.rotation.z = lean;
  }

  spin(dt, speed, steer = 0) {
    this.wheelAngle += (speed / WHEEL_R) * dt;
    this.wheelR.rotation.x = this.wheelAngle;
    this.wheelF.rotation.x = this.wheelAngle;
    this.wheelF.rotation.y = -steer * 0.4;
  }
}

export class BikeController {
  constructor(id, heading) {
    this.id = id;
    this.type = 'bike';
    this.speed = 0;
    this.heading = heading;
    this.steer = 0;
    this.lean = 0;
    this.yawRate = 0;
    this.pedal = 0;
    this.vy = 0;
  }

  update(dt, input, physics, ch) {
    const mv = input.getMove();
    const accelBtn = input.isHeld('accel');
    const throttle = accelBtn ? 1 : Math.max(0, mv.y);
    const braking = input.isHeld('brake') || mv.y < -0.35;
    const boost = input.isHeld('boost');
    const steerIn = clamp(mv.x, -1, 1);
    const max = boost ? CFG.boostSpeed : CFG.maxSpeed;

    if (braking) {
      if (this.speed > 0.3) this.speed = Math.max(0, this.speed - CFG.brake * dt);
      else this.speed = Math.max(-CFG.reverseSpeed, this.speed - 3 * dt);
    } else if (throttle > 0.05) {
      const target = max * throttle;
      if (this.speed < target) this.speed = Math.min(target, this.speed + CFG.accel * (boost ? 1.3 : 1) * dt);
      else this.speed = Math.max(target, this.speed - CFG.drag * 2 * dt);
    } else {
      // rodar libre: pierde velocidad poco a poco
      const s = Math.sign(this.speed);
      this.speed -= s * (CFG.drag + Math.abs(this.speed) * 0.04) * dt;
      if (Math.sign(this.speed) !== s) this.speed = 0;
    }

    this.steer = damp(this.steer, steerIn, 9, dt);
    const sp = Math.abs(this.speed);
    const grip = clamp(sp / 2.5, 0, 1) * (1 - 0.45 * clamp(sp / CFG.boostSpeed, 0, 1));
    this.yawRate = -this.steer * CFG.steerRate * grip * (this.speed < 0 ? -1 : 1);
    this.heading += this.yawRate * dt;

    // gravedad
    if (ch.grounded) this.vy = -2; else this.vy -= MOVE.GRAVITY * dt;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const dx = fx * this.speed * dt, dz = fz * this.speed * dt;
    const px = ch.x, pz = ch.z;
    physics.move(ch, dx, this.vy * dt, dz, dt);
    // Choque: si avanzamos mucho menos de lo esperado, perdemos velocidad
    const expected = Math.abs(this.speed * dt);
    if (expected > 0.02) {
      const actual = Math.abs((ch.x - px) * fx + (ch.z - pz) * fz);
      if (actual < expected * 0.5) this.speed *= Math.pow(0.05, dt * 4);
    }

    const leanTarget = clamp(-this.yawRate * sp * 0.055, -0.42, 0.42);
    this.lean = damp(this.lean, leanTarget, 6, dt);
    if (throttle > 0.05 && this.speed > 0) this.pedal += (sp / WHEEL_R) * 0.5 * dt;
    else this.pedal += (sp / WHEEL_R) * 0.08 * dt;
  }
}
