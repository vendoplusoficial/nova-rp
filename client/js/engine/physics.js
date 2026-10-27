// Física y colisiones.
// Principal: Rapier (controlador cinemático de personaje: desliza por paredes, sube escalones y pendientes).
//   - Terreno: malla de triángulos idéntica a la que se dibuja (colinas, playa, calles).
//   - Edificios, muros, árboles, autos: cajas giradas.
// Respaldo: rejilla de cajas propia + altura del terreno (si Rapier no carga en un teléfono
// muy antiguo, el juego sigue siendo jugable). El cambio es automático.

import { CollisionGrid } from '/shared/collision.js';
import { MOVE } from '/shared/constants.js';

const HALF = MOVE.CAPSULE_HALF_HEIGHT;
const RADIUS = MOVE.CAPSULE_RADIUS;
const CENTER_OFFSET = HALF + RADIUS; // de los pies al centro de la cápsula

export class Physics {
  constructor(city) {
    this.city = city;
    this.hm = city.hm;
    this.grid = new CollisionGrid(city.colliders);
    this.backend = 'simple';
    this.R = null;
    this.world = null;
  }

  async init({ timeoutMs = 12000, onStatus } = {}) {
    try {
      onStatus?.('Cargando físicas (Rapier)...');
      const mod = await withTimeout(import('@dimforge/rapier3d-compat'), timeoutMs);
      const R = mod.default || mod;
      await withTimeout(R.init(), timeoutMs);
      this.R = R;
      this.world = new R.World({ x: 0, y: -9.81, z: 0 });
      onStatus?.('Creando el terreno...');
      this.world.createCollider(this.terrainCollider(R));
      for (const b of this.city.colliders) {
        const hy = (b.maxY - b.minY) / 2;
        if (b.hx <= 0 || b.hz <= 0 || hy <= 0) continue;
        const rot = b.rot || 0;
        this.world.createCollider(
          R.ColliderDesc.cuboid(b.hx, hy, b.hz)
            .setTranslation(b.cx, (b.minY + b.maxY) / 2, b.cz)
            .setRotation({ x: 0, y: Math.sin(rot / 2), z: 0, w: Math.cos(rot / 2) }),
        );
      }
      this.controller = this.world.createCharacterController(0.02);
      this.controller.setUp({ x: 0, y: 1, z: 0 });
      this.controller.setMaxSlopeClimbAngle((48 * Math.PI) / 180);
      this.controller.setMinSlopeSlideAngle((58 * Math.PI) / 180);
      this.controller.enableAutostep(0.42, 0.25, false);
      this.controller.enableSnapToGround(0.5);
      this.controller.setSlideEnabled(true);
      this.world.step();
      this.backend = 'rapier';
      this.verify(R);
      console.info('[física] Rapier activo');
    } catch (e) {
      console.warn('[física] Rapier no disponible, usando física de respaldo:', e);
      this.backend = 'simple';
    }
    return this.backend;
  }

  // Malla de colisión del terreno (zona jugable + margen)
  terrainCollider(R) {
    const hm = this.hm;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const line of this.city.fence) for (const [x, z] of line) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
    const i0 = Math.max(0, Math.floor((minX - 24 - hm.x0) / hm.res)), i1 = Math.min(hm.nx - 1, Math.ceil((maxX + 24 - hm.x0) / hm.res));
    const j0 = Math.max(0, Math.floor((minZ - 24 - hm.z0) / hm.res)), j1 = Math.min(hm.nz - 1, Math.ceil((maxZ + 24 - hm.z0) / hm.res));
    const cols = i1 - i0 + 1, rows = j1 - j0 + 1;
    const verts = new Float32Array(cols * rows * 3);
    let k = 0;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      verts[k++] = hm.x0 + i * hm.res; verts[k++] = hm.h[j * hm.nx + i]; verts[k++] = hm.z0 + j * hm.res;
    }
    const idx = new Uint32Array((cols - 1) * (rows - 1) * 6);
    k = 0;
    for (let j = 0; j < rows - 1; j++) for (let i = 0; i < cols - 1; i++) {
      const a = j * cols + i, b = a + 1, c = a + cols + 1, d = a + cols;
      // misma diagonal que el dibujo: (i,j)-(i+1,j+1)
      idx[k++] = a; idx[k++] = c; idx[k++] = b;
      idx[k++] = a; idx[k++] = d; idx[k++] = c;
    }
    return R.ColliderDesc.trimesh(verts, idx);
  }

  // Comprueba con un rayo que el terreno quedó donde debe; si no, usa la física de respaldo
  verify(R) {
    try {
      const sp = this.city.spawnPoints[0];
      const h = this.hm.height(sp.x, sp.z);
      const hit = this.world.castRay(new R.Ray({ x: sp.x, y: h + 20, z: sp.z }, { x: 0, y: -1, z: 0 }), 60, true);
      if (!hit) throw new Error('el rayo de prueba no tocó el terreno');
      const toi = hit.timeOfImpact ?? hit.toi;
      if (typeof toi === 'number' && Math.abs((h + 20 - toi) - h) > 0.8) throw new Error(`terreno desalineado (${toi})`);
    } catch (e) {
      if (/desalineado|no tocó/.test(String(e.message))) { this.fallback(e); return; }
      console.info('[física] verificación omitida:', e.message);
    }
  }

  createCharacter(x, y, z) {
    const ch = { x, y, z, grounded: true, body: null, collider: null };
    if (this.backend === 'rapier') {
      try {
        const R = this.R;
        ch.body = this.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y + CENTER_OFFSET, z));
        ch.collider = this.world.createCollider(R.ColliderDesc.capsule(HALF, RADIUS), ch.body);
      } catch (e) { this.fallback(e); }
    }
    return ch;
  }

  // Mueve el personaje con colisiones. dx,dy,dz = desplazamiento deseado este frame.
  move(ch, dx, dy, dz, dt) {
    if (this.backend === 'rapier') {
      try {
        this.controller.computeColliderMovement(ch.collider, { x: dx, y: dy, z: dz });
        const m = this.controller.computedMovement();
        ch.x += m.x; ch.y += m.y; ch.z += m.z;
        ch.grounded = this.controller.computedGrounded();
        const g = this.hm.height(ch.x, ch.z);
        if (ch.y < g - 0.6) { ch.y = g; ch.grounded = true; } // seguridad: nunca atravesar el suelo
        ch.body.setNextKinematicTranslation({ x: ch.x, y: ch.y + CENTER_OFFSET, z: ch.z });
        this.world.timestep = Math.min(Math.max(dt, 1 / 120), 1 / 20);
        this.world.step();
        return ch;
      } catch (e) {
        this.fallback(e);
      }
    }
    return this.moveSimple(ch, dx, dy, dz);
  }

  groundAt(x, z, yFeet) {
    return Math.max(this.hm.height(x, z), this.grid.groundHeight(x, z, RADIUS, yFeet));
  }

  moveSimple(ch, dx, dy, dz) {
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (RADIUS * 0.8)));
    let x = ch.x, z = ch.z;
    const wasGrounded = ch.grounded;
    for (let i = 0; i < steps; i++) {
      const px = x, pz = z;
      x += dx / steps; z += dz / steps;
      // pendientes demasiado empinadas bloquean el paso
      const rise = this.hm.height(x, z) - this.hm.height(px, pz);
      const run = Math.hypot(x - px, z - pz) || 1e-6;
      if (rise / run > 1.15 && rise > 0.05) { x = px; z = pz; break; }
      const r = this.grid.resolveCylinder(x, z, RADIUS, ch.y, CENTER_OFFSET * 2);
      x = r.x; z = r.z;
    }
    ch.x = x; ch.z = z;
    const ground = this.groundAt(x, z, ch.y);
    let y = ch.y + dy;
    if (y <= ground) { y = ground; ch.grounded = true; } else if (wasGrounded && dy <= 0 && y - ground < 0.55) {
      y = ground; ch.grounded = true; // bajar pendientes sin "volar"
    } else ch.grounded = false;
    if (dy > 0 && this.grid.pointInside(x, y + CENTER_OFFSET * 2, z)) y = ch.y;
    ch.y = y;
    return ch;
  }

  teleport(ch, x, y, z) {
    y = Math.max(y, this.hm.height(x, z));
    ch.x = x; ch.y = y; ch.z = z;
    if (this.backend === 'rapier' && ch.body) {
      try {
        ch.body.setTranslation({ x, y: y + CENTER_OFFSET, z }, true);
        ch.body.setNextKinematicTranslation({ x, y: y + CENTER_OFFSET, z });
        this.world.step();
      } catch (e) { this.fallback(e); }
    }
  }

  // Distancia libre a lo largo de un rayo (cámara y disparos): edificios + terreno
  raycast(ox, oy, oz, dx, dy, dz, maxDist) {
    let d = this.grid.raycast(ox, oy, oz, dx, dy, dz, maxDist);
    const t = this.terrainRay(ox, oy, oz, dx, dy, dz, Math.min(d, maxDist));
    return Math.min(d, t);
  }

  terrainRay(ox, oy, oz, dx, dy, dz, maxDist) {
    const hm = this.hm;
    const step = maxDist > 12 ? 2 : 0.75;
    let prev = 0;
    if (oy < hm.height(ox, oz)) return 0;
    for (let t = step; t <= maxDist + 1e-6; t += step) {
      const x = ox + dx * t, y = oy + dy * t, z = oz + dz * t;
      if (y < hm.height(x, z)) {
        let a = prev, b = t;
        for (let k = 0; k < 6; k++) {
          const m = (a + b) / 2;
          if (oy + dy * m < hm.height(ox + dx * m, oz + dz * m)) b = m; else a = m;
        }
        return a;
      }
      prev = t;
    }
    return Infinity;
  }

  fallback(e) {
    if (this.backend !== 'rapier') return;
    console.warn('[física] error en Rapier, cambiando a física de respaldo', e);
    this.backend = 'simple';
  }
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}
