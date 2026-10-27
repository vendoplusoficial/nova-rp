// Marcadores 3D: columna de luz + rombo flotante (objetivo del trabajo, Central de Repartos, etc.)

import * as THREE from 'three';

let beamGeo, ringGeo, gemGeo;

class Marker {
  constructor(color, height = 3.2) {
    beamGeo ||= new THREE.CylinderGeometry(1, 1, 1, 18, 1, true).translate(0, 0.5, 0);
    ringGeo ||= new THREE.RingGeometry(0.85, 1.0, 28).rotateX(-Math.PI / 2);
    gemGeo ||= new THREE.OctahedronGeometry(0.32, 0);
    this.root = new THREE.Group();
    this.beamMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false });
    const beam = new THREE.Mesh(beamGeo, this.beamMat);
    beam.scale.set(1.0, height, 1.0);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }));
    ring.position.y = 0.05;
    this.gem = new THREE.Mesh(gemGeo, new THREE.MeshBasicMaterial({ color, fog: false }));
    this.gem.position.y = height + 0.6;
    this.root.add(beam, ring, this.gem);
    this.root.renderOrder = 2;
    this.baseY = height + 0.6;
  }
  update(t) {
    this.gem.rotation.y = t * 2;
    this.gem.position.y = this.baseY + Math.sin(t * 3) * 0.15;
    this.beamMat.opacity = 0.17 + Math.sin(t * 4) * 0.05;
  }
}

export class Markers {
  constructor(scene, heightAt = () => 0) {
    this.scene = scene;
    this.heightAt = heightAt;
    this.target = new Marker(0xffc444, 4);
    this.target.root.visible = false;
    scene.add(this.target.root);
    this.statics = [];
    this.t = 0;
  }

  addStatic(x, z, color) {
    const m = new Marker(color, 2.6);
    m.root.position.set(x, this.heightAt(x, z), z);
    this.scene.add(m.root);
    this.statics.push(m);
    return m;
  }

  setTarget(p) {
    if (!p) { this.target.root.visible = false; return; }
    this.target.root.position.set(p.x, this.heightAt(p.x, p.z), p.z);
    this.target.root.visible = true;
  }

  update(dt) {
    this.t += dt;
    if (this.target.root.visible) this.target.update(this.t);
    for (const m of this.statics) m.update(this.t);
  }
}
