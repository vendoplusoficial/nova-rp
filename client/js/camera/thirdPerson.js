// Cámara en tercera persona estilo shooter móvil:
//  - giro libre con el dedo derecho (sin suavizado de entrada = respuesta inmediata)
//  - seguimiento suave del jugador (sin temblores)
//  - vista sobre el hombro, zoom al apuntar, evita atravesar paredes
//  - en la bici se coloca sola detrás del vehículo cuando no tocas la cámara

import * as THREE from 'three';
import { clamp, damp, dampAngle } from '../util/math.js';

const BASE_SENS = 0.0046; // radianes por píxel con sensibilidad 1.0

export class ThirdPersonCamera {
  constructor(camera, physics, settings) {
    this.camera = camera;
    this.physics = physics;
    this.settings = settings;
    this.yaw = Math.PI;
    this.pitch = 0.18;
    this.pivot = new THREE.Vector3();
    this.dist = 4.2;
    this.shoulder = 0.55;
    this.fov = 68;
    this.idleLook = 10;
    this.sensMul = 1;      // el autoapuntado lo reduce un poco sobre el objetivo
    this.kick = 0;         // retroceso visual
    this.dir = new THREE.Vector3(0, 0, 1);
    this.initialized = false;
    this.tmp = new THREE.Vector3();
  }

  reset(x, y, z, yaw) {
    this.pivot.set(x, y + 1.55, z);
    this.yaw = yaw;
    this.initialized = true;
  }

  applyLook(input, aiming) {
    const [dx, dy] = input.takeLook();
    let sens = BASE_SENS * this.settings.get('sens') * this.sensMul;
    if (aiming) sens *= this.settings.get('aimSens');
    const inv = this.settings.get('invertY') ? -1 : 1;
    if (dx !== 0 || dy !== 0) this.idleLook = 0;
    this.yaw -= dx * sens;
    this.pitch = clamp(this.pitch + dy * sens * inv, -0.95, 1.15);
    return dx !== 0 || dy !== 0;
  }

  addAssist(dyaw, dpitch) {
    this.yaw += dyaw;
    this.pitch = clamp(this.pitch + dpitch, -0.95, 1.15);
  }

  // t: { x, y, z, crouch, aiming, vehicle, heading, speed, sprint, dead }
  update(dt, t) {
    this.idleLook += dt;
    if (!this.initialized) this.reset(t.x, t.y, t.z, this.yaw);

    let pivotH = t.crouch ? 1.12 : 1.55;
    let dist = 4.1, shoulder = 0.6, fov = 68;
    if (t.aiming) { dist = 2.0; shoulder = 0.75; fov = 52; pivotH = t.crouch ? 1.25 : 1.6; }
    else if (t.sprint) { fov = 74; dist = 4.4; }
    if (t.vehicle) {
      pivotH = 1.75; shoulder = 0; dist = 5.2; fov = 68 + Math.min(10, Math.abs(t.speed) * 0.7);
      // Se alinea detrás de la bici si no mueves la cámara
      if (this.idleLook > 0.9 && Math.abs(t.speed) > 1.5) {
        this.yaw = dampAngle(this.yaw, t.heading, 2.2, dt);
        this.pitch = damp(this.pitch, 0.22, 2.0, dt);
      }
    }
    if (t.dead) { dist = 5.5; pivotH = 0.6; }
    dist *= this.settings.get('camDist');

    // Seguimiento del jugador: firme en horizontal, suave en vertical (saltos)
    this.pivot.x = damp(this.pivot.x, t.x, 28, dt);
    this.pivot.z = damp(this.pivot.z, t.z, 28, dt);
    this.pivot.y = damp(this.pivot.y, t.y + pivotH, 11, dt);
    if (Math.abs(this.pivot.x - t.x) > 6 || Math.abs(this.pivot.z - t.z) > 6) { this.pivot.x = t.x; this.pivot.z = t.z; this.pivot.y = t.y + pivotH; }

    this.kick = damp(this.kick, 0, 10, dt);
    const pitch = clamp(this.pitch - this.kick, -0.95, 1.15);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    this.dir.set(sy * cp, -sp, cy * cp);
    const rx = -cy, rz = sy;

    // Hombro: evitar meter la cámara en una pared lateral
    this.shoulder = damp(this.shoulder, shoulder, 10, dt);
    let sh = this.shoulder;
    if (sh > 0.01) {
      const hitS = this.physics.raycast(this.pivot.x, this.pivot.y, this.pivot.z, rx, 0, rz, sh + 0.25);
      if (hitS < sh + 0.25) sh = Math.max(0, hitS - 0.25);
    }
    const ox = this.pivot.x + rx * sh, oy = this.pivot.y, oz = this.pivot.z + rz * sh;

    // Distancia: si hay pared detrás, acercar rápido; al liberarse, alejar suave
    const hit = this.physics.raycast(ox, oy, oz, -this.dir.x, -this.dir.y, -this.dir.z, dist + 0.3);
    const allowed = Math.max(0.6, Math.min(dist, hit - 0.3));
    this.dist = allowed < this.dist ? damp(this.dist, allowed, 30, dt) : damp(this.dist, allowed, 5, dt);
    if (this.dist > allowed + 0.05 && allowed < this.dist) this.dist = allowed;

    const cam = this.camera;
    cam.position.set(ox - this.dir.x * this.dist, Math.max(0.25, oy - this.dir.y * this.dist), oz - this.dir.z * this.dist);
    this.tmp.set(cam.position.x + this.dir.x * 10, cam.position.y + this.dir.y * 10, cam.position.z + this.dir.z * 10);
    cam.lookAt(this.tmp);

    this.fov = damp(this.fov, fov, 9, dt);
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
  }

  // Rayo desde la cámara por el centro de la pantalla (mira)
  aimRay() {
    const p = this.camera.position;
    return { ox: p.x, oy: p.y, oz: p.z, dx: this.dir.x, dy: this.dir.y, dz: this.dir.z };
  }
}
