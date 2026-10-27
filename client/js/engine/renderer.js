// Configuración del render con Three.js, calidad gráfica y resolución adaptativa.

import * as THREE from 'three';
import { GeoBuilder } from '../world/geometry.js';

export const QUALITY = {
  low: { pr: 0.85, aa: false, dist: 170, label: 'Bajo' },
  medium: { pr: 1.25, aa: false, dist: 230, label: 'Medio' },
  high: { pr: 2.0, aa: true, dist: 300, label: 'Alto' },
};

function detectQuality() {
  const mem = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  if (mem <= 2 || cores <= 4) return 'low';
  return 'medium';
}

const SKY_TOP = 0x3f84d6;
const SKY_MID = 0x86b8e6;
const SKY_HORIZON = 0xd3e5f2;

export class Renderer {
  constructor(container, settings) {
    this.settings = settings;
    const qName = settings.get('quality');
    this.auto = qName === 'auto';
    this.qName = this.auto ? detectQuality() : qName;
    this.q = QUALITY[this.qName] || QUALITY.medium;

    this.renderer = new THREE.WebGLRenderer({
      antialias: this.q.aa, powerPreference: 'high-performance', alpha: false, stencil: false, depth: true,
    });
    this.maxPR = Math.min(window.devicePixelRatio || 1, this.q.pr);
    this.pixelRatio = this.maxPR;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.canvas = this.renderer.domElement;
    container.appendChild(this.canvas);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(SKY_HORIZON);
    this.viewDist = this.q.dist;
    this.scene.fog = new THREE.Fog(SKY_HORIZON, this.viewDist * 0.5, this.viewDist);

    this.camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.3, this.viewDist + 80);
    this.scene.add(this.camera);

    // cielo azul que rellena las sombras + sol cálido de media tarde
    const hemi = new THREE.HemisphereLight(0xdcebff, 0x8a7d66, 1.45);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff0d6, 2.15);
    sun.position.set(0.55, 1, 0.35);
    this.scene.add(sun);
    this.scene.add(sun.target);

    this.addSkyDome();

    this.fpsAcc = 0; this.fpsFrames = 0; this.fps = 60; this.lowStreak = 0; this.highStreak = 0;
    this.onResize = this.onResize.bind(this);
    window.addEventListener('resize', this.onResize);
    window.addEventListener('orientationchange', () => setTimeout(this.onResize, 250));
    this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.contextLost = true; });
  }

  addSkyDome() {
    // cúpula con degradado (azul intenso arriba, bruma clara en el horizonte)
    const geo = new THREE.SphereGeometry(1, 24, 12);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const top = new THREE.Color(SKY_TOP), mid = new THREE.Color(SKY_MID), hor = new THREE.Color(SKY_HORIZON), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y < 0.12) c.copy(hor).lerp(mid, Math.max(0, y) / 0.12);
      else c.copy(mid).lerp(top, Math.min(1, (y - 0.12) / 0.6));
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false });
    this.sky = new THREE.Mesh(geo, mat);
    this.sky.renderOrder = -2;
    this.sky.frustumCulled = false;
    this.sky.scale.setScalar(this.viewDist + 40);
    this.scene.add(this.sky);
    // montañas lejanas entre la bruma (siguen a la cámara; casi no hay hacia el mar)
    const b = new GeoBuilder(false);
    const ring = (rr, hMul, colTop, colBot, seed) => {
      const N = 120;
      let prev = null;
      for (let k = 0; k <= N; k++) {
        const a = (k / N) * Math.PI * 2;
        const land = landWeight(a);
        const h = (0.1 + 0.07 * Math.sin(a * 3 + seed) + 0.045 * Math.sin(a * 7.3 + seed * 2) + 0.02 * Math.sin(a * 17 + seed)) * hMul * land + 0.006;
        const x = Math.sin(a) * rr, z = Math.cos(a) * rr;
        const cur = [[x, -0.02, z], [x, h, z]];
        if (prev) b.quadC(prev[0], cur[0], cur[1], prev[1], [-x, 0, -z], [colBot, colBot, colTop, colTop]);
        prev = cur;
      }
    };
    ring(0.97, 1.0, 0xbccbd7, 0xd3e5f2, 1.3);
    ring(0.93, 0.75, 0xa6b8c6, 0xd0e1ee, 4.1);
    const mm = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, depthWrite: false });
    this.mountains = new THREE.Mesh(b.build(), mm);
    this.mountains.renderOrder = -1;
    this.mountains.frustumCulled = false;
    this.sky.add(this.mountains);
  }

  onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  // Resolución adaptativa: si los FPS bajan, se reduce la resolución interna (sin congelar el juego)
  trackPerformance(dt) {
    this.fpsAcc += dt; this.fpsFrames++;
    if (this.fpsAcc < 1.0) return;
    this.fps = this.fpsFrames / this.fpsAcc;
    this.fpsAcc = 0; this.fpsFrames = 0;
    if (!this.auto || document.hidden) return;
    if (this.fps < 27) { this.lowStreak++; this.highStreak = 0; } else if (this.fps > 52) { this.highStreak++; this.lowStreak = 0; } else { this.lowStreak = 0; this.highStreak = 0; }
    if (this.lowStreak >= 2) {
      this.lowStreak = 0;
      if (this.pixelRatio > 0.6) this.setPixelRatio(this.pixelRatio - 0.12);
      else if (this.viewDist > 150) this.setViewDistance(this.viewDist - 30);
    } else if (this.highStreak >= 5) {
      this.highStreak = 0;
      if (this.pixelRatio < this.maxPR) this.setPixelRatio(Math.min(this.maxPR, this.pixelRatio + 0.06));
    }
  }

  setPixelRatio(pr) {
    this.pixelRatio = Math.max(0.5, pr);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  setViewDistance(d) {
    this.viewDist = d;
    this.scene.fog.near = d * 0.42;
    this.scene.fog.far = d;
    this.camera.far = d + 80;
    this.camera.updateProjectionMatrix();
    this.sky.scale.setScalar(d + 40);
    this.onViewDistance?.(d);
  }

  render() {
    this.sky.position.copy(this.camera.position);
    this.mountains.position.y = -this.camera.position.y / this.sky.scale.y; // base de las montañas al nivel del mar
    this.renderer.render(this.scene, this.camera);
  }

  get drawCalls() { return this.renderer.info.render.calls; }
}

// Montañas del horizonte: la sierra está al noroeste; hacia el mar casi no hay
function landWeight(a) {
  let d = Math.abs(((a - 3.93) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
  return 0.12 + 0.88 * Math.max(0, 1 - d / 1.5);
}
