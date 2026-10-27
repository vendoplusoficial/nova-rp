// Personaje humanoide low-poly con esqueleto (SkinnedMesh = 1 llamada de dibujo)
// y animación PROCEDURAL: caminar, correr, esprintar, agacharse, saltar, caer,
// apuntar, disparar (retroceso), montar bici (pedaleo) e incapacitado.
// Las poses se mezclan suavemente, así nunca hay cambios bruscos.

import * as THREE from 'three';
import { GeoBuilder } from '../world/geometry.js';
import { buildHuman } from './humanMesh.js';
import { ANIM } from '/shared/constants.js';
import { damp, clamp } from '../util/math.js';

const B = { hips: 0, spine: 1, chest: 2, neck: 3, head: 4, uaL: 5, faL: 6, uaR: 7, faR: 8, thL: 9, shL: 10, thR: 11, shR: 12 };
const BONE_DEF = [
  // nombre, padre, posición relativa al padre
  ['hips', -1, [0, 0.95, 0]],
  ['spine', B.hips, [0, 0.12, 0]],
  ['chest', B.spine, [0, 0.25, 0]],
  ['neck', B.chest, [0, 0.2, 0]],
  ['head', B.neck, [0, 0.06, 0]],
  ['uaL', B.chest, [0.24, 0.13, 0]],
  ['faL', B.uaL, [0, -0.28, 0]],
  ['uaR', B.chest, [-0.24, 0.13, 0]],
  ['faR', B.uaR, [0, -0.28, 0]],
  ['thL', B.hips, [0.1, -0.05, 0]],
  ['shL', B.thL, [0, -0.43, 0]],
  ['thR', B.hips, [-0.1, -0.05, 0]],
  ['shR', B.thR, [0, -0.43, 0]],
];

const SKINS = [0xd9a47a, 0xc68e64, 0xe2b48c, 0xa86f48, 0x8d5a3b, 0xf0c8a4, 0xb97f56];
const HAIRS = [0x1f1712, 0x2b1d14, 0x3b2a1e, 0x14100d, 0x5a3d26, 0x241a14];
const PANTS = [0x26324a, 0x2f3d5c, 0x1f2a3d, 0x2b2b2e, 0x3b4a66, 0x34405a];
const SHOES = [0xf2f2f0, 0xe6e6e4, 0xf7f7f5, 0x2b2b2b, 0xdedfe0];
const geoCache = new Map();

let sharedMat = null;
let shadowGeo = null, shadowMat = null;
let gunGeo = null, gunMat = null;

function hexFromCss(css) { return typeof css === 'number' ? css : parseInt(String(css).replace('#', ''), 16) || 0xcccccc; }

export class Character {
  constructor({ shirt = '#1e88e5', seed = 1 } = {}) {
    seed = Math.abs(seed | 0) >>> 0;
    sharedMat ||= new THREE.MeshLambertMaterial({ vertexColors: true });
    const skin = SKINS[seed % SKINS.length];
    const hair = HAIRS[(seed >>> 3) % HAIRS.length];
    const pants = PANTS[(seed >>> 6) % PANTS.length];
    const shirtHex = hexFromCss(shirt);

    const shoes = SHOES[(seed >>> 9) % SHOES.length];
    const hairStyle = (seed >>> 12) % 2;
    // Malla humana suave (cabeza con cara, pelo, camiseta, jeans, tenis); se comparte entre
    // personajes con la misma combinación de colores
    const key = [skin, hair, pants, shirtHex, shoes, hairStyle].join(':');
    let geo = geoCache.get(key);
    if (!geo) {
      geo = buildHuman({ skin, hair, shirt: shirtHex, pants, shoes, hairStyle });
      geoCache.set(key, geo);
    }
    void GeoBuilder;
    this.bones = BONE_DEF.map(([name, , pos]) => { const b = new THREE.Bone(); b.name = name; b.position.set(pos[0], pos[1], pos[2]); return b; });
    BONE_DEF.forEach(([, parent], i) => { if (parent >= 0) this.bones[parent].add(this.bones[i]); });
    this.mesh = new THREE.SkinnedMesh(geo, sharedMat);
    this.mesh.add(this.bones[0]);
    this.mesh.bind(new THREE.Skeleton(this.bones));
    this.mesh.frustumCulled = false;

    // Pistola en la mano derecha
    gunGeo ||= (() => {
      const gb = new GeoBuilder(false);
      gb.box(-0.025, -0.03, -0.02, 0.025, 0.03, 0.2, 0x222428);
      gb.box(-0.022, -0.13, -0.02, 0.022, -0.03, 0.05, 0x2c2c2c);
      return gb.build();
    })();
    gunMat ||= new THREE.MeshLambertMaterial({ vertexColors: true });
    this.gun = new THREE.Mesh(gunGeo, gunMat);
    this.gun.position.set(0, -0.31, 0.05);
    this.gun.rotation.x = Math.PI / 2;
    this.gun.visible = false;
    this.bones[B.faR].add(this.gun);

    // Sombra circular falsa (barata)
    shadowGeo ||= new THREE.CircleGeometry(0.42, 14).rotateX(-Math.PI / 2);
    shadowMat ||= new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false });
    this.shadow = new THREE.Mesh(shadowGeo, shadowMat);
    this.shadow.position.y = 0.03;
    this.shadow.renderOrder = 1;

    this.body = new THREE.Group();   // se inclina al morir
    this.body.add(this.mesh);
    this.root = new THREE.Group();   // posición (pies) y orientación
    this.root.add(this.body, this.shadow);

    this.cur = this.bones.map(() => [0, 0, 0]);
    this.tgt = this.bones.map(() => [0, 0, 0]);
    this.hipsY = 0;
    this.phase = 0;
    this.time = Math.random() * 10;
    this.recoil = 0;
    this.deadBlend = 0;
  }

  setShadowHeight(h) {
    this.shadow.position.y = 0.03 - h;
    const s = clamp(1 - h * 0.35, 0.4, 1);
    this.shadow.scale.set(s, 1, s);
  }

  fire() { this.recoil = 1; }

  // st: { anim, speed, aiming, aimPitch, pedal }
  update(dt, st) {
    const T = this.tgt;
    for (const t of T) { t[0] = 0; t[1] = 0; t[2] = 0; }
    this.time += dt;
    let hipsY = 0;
    const anim = st.anim;
    const speed = st.speed || 0;

    const legSwing = (A, lean) => {
      const stride = 0.75 + speed * 0.09;
      this.phase += (speed / (2 * stride)) * Math.PI * 2 * dt;
      const s = Math.sin(this.phase), co = Math.cos(this.phase);
      T[B.thL][0] = -s * A; T[B.thR][0] = s * A;
      T[B.shL][0] = A * 1.25 * Math.max(0, co) + 0.06;
      T[B.shR][0] = A * 1.25 * Math.max(0, -co) + 0.06;
      T[B.uaL][0] = s * A * 0.85; T[B.uaR][0] = -s * A * 0.85;
      T[B.uaL][2] = 0.06; T[B.uaR][2] = -0.06;
      T[B.faL][0] = T[B.faR][0] = -(0.2 + A * 1.0);
      T[B.spine][0] = lean;
      T[B.hips][1] = s * 0.1 * A; T[B.chest][1] = -s * 0.14 * A;
      T[B.head][0] = -lean * 0.6;
      hipsY = -0.035 * A + Math.abs(s) * 0.06 * A;
    };

    switch (anim) {
      case ANIM.WALK: legSwing(0.5, 0.04); break;
      case ANIM.RUN: legSwing(0.82, 0.13); break;
      case ANIM.SPRINT: legSwing(1.02, 0.22); break;
      case ANIM.CROUCH:
      case ANIM.CROUCH_WALK: {
        hipsY = -0.38;
        let sw = 0;
        if (anim === ANIM.CROUCH_WALK) { this.phase += speed * 3.2 * dt; sw = Math.sin(this.phase) * 0.28; }
        T[B.thL][0] = -1.25 + sw; T[B.thR][0] = -1.25 - sw;
        T[B.shL][0] = 1.9 - sw * 0.5; T[B.shR][0] = 1.9 + sw * 0.5;
        T[B.thL][2] = 0.08; T[B.thR][2] = -0.08;
        T[B.spine][0] = 0.35; T[B.head][0] = -0.25;
        T[B.uaL][0] = T[B.uaR][0] = -0.35; T[B.faL][0] = T[B.faR][0] = -0.9;
        break;
      }
      case ANIM.JUMP:
        T[B.thL][0] = -0.95; T[B.shL][0] = 1.25; T[B.thR][0] = 0.25; T[B.shR][0] = 0.55;
        T[B.uaL][2] = 0.55; T[B.uaR][2] = -0.55; T[B.uaL][0] = -0.5; T[B.uaR][0] = 0.35;
        T[B.faL][0] = T[B.faR][0] = -0.5;
        break;
      case ANIM.FALL:
        T[B.thL][0] = -0.45; T[B.shL][0] = 0.6; T[B.thR][0] = -0.15; T[B.shR][0] = 0.45;
        T[B.uaL][2] = 0.95; T[B.uaR][2] = -0.95; T[B.faL][0] = T[B.faR][0] = -0.3;
        break;
      case ANIM.RIDE: {
        hipsY = 0.06;
        // fase negativa: el pie sube por atrás y empuja por delante (pedaleo hacia adelante)
        const p = -(st.pedal || 0);
        T[B.thL][0] = -1.2 + Math.sin(p) * 0.4; T[B.shL][0] = 1.3 + Math.cos(p) * 0.38;
        T[B.thR][0] = -1.2 + Math.sin(p + Math.PI) * 0.4; T[B.shR][0] = 1.3 + Math.cos(p + Math.PI) * 0.38;
        T[B.spine][0] = 0.4; T[B.head][0] = -0.3;
        T[B.uaL][0] = T[B.uaR][0] = -1.05; T[B.faL][0] = T[B.faR][0] = -0.35;
        T[B.uaL][2] = -0.05; T[B.uaR][2] = 0.05;
        break;
      }
      case ANIM.DEAD:
        T[B.uaL][2] = 1.2; T[B.uaR][2] = -1.2; T[B.thL][2] = 0.15; T[B.thR][2] = -0.15; T[B.head][1] = 0.6;
        break;
      default: { // IDLE
        const b = Math.sin(this.time * 1.7);
        T[B.chest][0] = b * 0.02; T[B.head][0] = -b * 0.015;
        T[B.uaL][2] = 0.08; T[B.uaR][2] = -0.08;
        T[B.faL][0] = T[B.faR][0] = -0.12;
        hipsY = b * 0.004;
      }
    }

    // Capa superior: apuntar (las piernas siguen su animación)
    if (st.aiming && anim !== ANIM.RIDE && anim !== ANIM.DEAD) {
      const p = clamp(st.aimPitch || 0, -1.1, 1.1);
      T[B.uaR][0] = -Math.PI / 2 + p; T[B.uaR][1] = 0; T[B.uaR][2] = 0.12;
      T[B.faR][0] = 0;
      T[B.uaL][0] = -Math.PI / 2 + p + 0.12; T[B.uaL][1] = 0; T[B.uaL][2] = -0.55;
      T[B.faL][0] = -0.35;
      T[B.chest][1] = 0.12; T[B.hips][1] *= 0.3;
      T[B.head][0] = p * 0.5;
      T[B.spine][0] *= 0.4;
    }
    this.recoil = damp(this.recoil, 0, 14, dt);
    T[B.uaR][0] -= this.recoil * 0.4;
    T[B.faR][0] -= this.recoil * 0.25;

    // Mezcla suave hacia la pose objetivo
    const k = 22;
    for (let i = 0; i < this.bones.length; i++) {
      const c = this.cur[i], t = T[i];
      c[0] = damp(c[0], t[0], k, dt); c[1] = damp(c[1], t[1], k, dt); c[2] = damp(c[2], t[2], k, dt);
      this.bones[i].rotation.set(c[0], c[1], c[2]);
    }
    this.hipsY = damp(this.hipsY, hipsY, 18, dt);
    this.bones[B.hips].position.y = 0.95 + this.hipsY;

    this.deadBlend = damp(this.deadBlend, anim === ANIM.DEAD ? 1 : 0, 6, dt);
    this.body.rotation.x = -this.deadBlend * Math.PI / 2;
    this.body.position.y = this.deadBlend * 0.14;
    this.body.position.z = -this.deadBlend * 0.1;
    this.gun.visible = !!st.gun;
  }

  dispose() {
    // la geometría se comparte (caché); solo se libera el esqueleto
    this.mesh.skeleton.dispose?.();
  }
}
