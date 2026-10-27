// Vehículos estacionados (los que nadie conduce). Los que van en movimiento
// se dibujan junto a su conductor (ver remotePlayers.js / localPlayer.js).

import { BikeModel } from './bike.js';

export class Vehicles {
  constructor(scene) {
    this.scene = scene;
    this.map = new Map(); // id -> { data, model }
  }

  upsert(v, colorOf) {
    let e = this.map.get(v.id);
    if (!e) {
      e = { data: v, model: new BikeModel(colorOf(v.owner)) };
      this.scene.add(e.model.root);
      this.map.set(v.id, e);
    }
    e.data = v;
    e.model.setPose(v.x, v.y || 0, v.z, v.ry || 0, 0);
    e.model.root.visible = !v.driver;
    return e;
  }

  remove(id) {
    const e = this.map.get(id);
    if (!e) return;
    this.scene.remove(e.model.root);
    this.map.delete(id);
  }

  clear() { for (const id of [...this.map.keys()]) this.remove(id); }

  // Bici propia estacionada más cercana
  nearestOwned(myId, x, z, maxDist) {
    let best = null, bd = maxDist;
    for (const e of this.map.values()) {
      if (e.data.owner !== myId || e.data.driver) continue;
      const d = Math.hypot(e.data.x - x, e.data.z - z);
      if (d < bd) { bd = d; best = e.data; }
    }
    return best;
  }

  owned(myId) {
    for (const e of this.map.values()) if (e.data.owner === myId) return e.data;
    return null;
  }

  list() { return [...this.map.values()].map((e) => e.data); }
}
