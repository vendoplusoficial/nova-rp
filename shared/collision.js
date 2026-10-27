// Rejilla espacial de cajas GIRADAS (OBB: centro, semiejes, giro en Y, altura mín/máx).
// Usada por: servidor (línea de visión, validar posiciones),
// cliente (cámara anti-paredes, física de respaldo si Rapier no carga).
// Formato de caja: { cx, cz, hx, hz, rot, minY, maxY }  (rot igual que Object3D.rotation.y)

export class CollisionGrid {
  constructor(boxes, cell = 16) {
    this.cell = cell;
    this.boxes = boxes;
    this.map = new Map();
    this.stamp = new Uint32Array(boxes.length);
    this.stampId = 1;
    this.big = [];
    boxes.forEach((b, idx) => {
      const c = Math.cos(b.rot || 0), s = Math.sin(b.rot || 0);
      b._c = c; b._s = s;
      const ex = Math.abs(b.hx * c) + Math.abs(b.hz * s), ez = Math.abs(b.hx * s) + Math.abs(b.hz * c);
      b.minX = b.cx - ex; b.maxX = b.cx + ex; b.minZ = b.cz - ez; b.maxZ = b.cz + ez;
      const cx0 = Math.floor(b.minX / cell), cx1 = Math.floor(b.maxX / cell);
      const cz0 = Math.floor(b.minZ / cell), cz1 = Math.floor(b.maxZ / cell);
      if ((cx1 - cx0 + 1) * (cz1 - cz0 + 1) > 400) { this.big.push(idx); return; }
      for (let x = cx0; x <= cx1; x++) for (let z = cz0; z <= cz1; z++) {
        const k = x * 73856093 ^ z * 19349663;
        let arr = this.map.get(k);
        if (!arr) { arr = []; this.map.set(k, arr); }
        arr.push(idx);
      }
    });
  }

  query(minX, minZ, maxX, maxZ, cb) {
    const c = this.cell;
    const id = this.nextStamp();
    const cx0 = Math.floor(minX / c), cx1 = Math.floor(maxX / c);
    const cz0 = Math.floor(minZ / c), cz1 = Math.floor(maxZ / c);
    for (let x = cx0; x <= cx1; x++) for (let z = cz0; z <= cz1; z++) {
      const arr = this.map.get(x * 73856093 ^ z * 19349663);
      if (!arr) continue;
      for (const idx of arr) {
        if (this.stamp[idx] === id) continue;
        this.stamp[idx] = id;
        const b = this.boxes[idx];
        if (b.maxX < minX || b.minX > maxX || b.maxZ < minZ || b.minZ > maxZ) continue;
        if (cb(b) === false) return;
      }
    }
    for (const idx of this.big) cb(this.boxes[idx]);
  }

  nextStamp() {
    this.stampId++;
    if (this.stampId > 0xfffffff0) { this.stamp.fill(0); this.stampId = 1; }
    return this.stampId;
  }

  // Rayo 3D. Devuelve la distancia al primer impacto o Infinity.
  raycast(ox, oy, oz, dx, dy, dz, maxDist) {
    const ex = ox + dx * maxDist, ez = oz + dz * maxDist;
    let best = Infinity;
    this.query(Math.min(ox, ex), Math.min(oz, ez), Math.max(ox, ex), Math.max(oz, ez), (b) => {
      const c = b._c, s = b._s;
      const px = ox - b.cx, pz = oz - b.cz;
      const lox = px * c - pz * s, loz = px * s + pz * c;
      const ldx = dx * c - dz * s, ldz = dx * s + dz * c;
      const t = slab(lox, oy, loz, ldx, dy, ldz, b.hx, b.minY, b.maxY, b.hz);
      if (t >= 0 && t < best && t <= maxDist) best = t;
    });
    return best;
  }

  segmentBlocked(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) return false;
    return this.raycast(ax, ay, az, dx / len, dy / len, dz / len, len) < len - 0.05;
  }

  // Empuja un cilindro (radio r, de y a y+h) fuera de las cajas. Devuelve {x,z,hit}
  resolveCylinder(x, z, r, y, h, step = 0.45) {
    let hit = false;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      this.query(x - r, z - r, x + r, z + r, (b) => {
        if (b.maxY <= y + step || b.minY >= y + h) return;
        const c = b._c, s = b._s;
        const px = x - b.cx, pz = z - b.cz;
        const lx = px * c - pz * s, lz = px * s + pz * c;
        const nx = Math.max(-b.hx, Math.min(lx, b.hx)), nz = Math.max(-b.hz, Math.min(lz, b.hz));
        let ddx = lx - nx, ddz = lz - nz;
        const d2 = ddx * ddx + ddz * ddz;
        if (d2 >= r * r) return;
        hit = true; moved = true;
        let qx, qz;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          qx = nx + (ddx / d) * r; qz = nz + (ddz / d) * r;
        } else {
          const pl = lx + b.hx, pr = b.hx - lx, pn = lz + b.hz, ps = b.hz - lz;
          const m = Math.min(pl, pr, pn, ps);
          qx = lx; qz = lz;
          if (m === pl) qx = -b.hx - r; else if (m === pr) qx = b.hx + r; else if (m === pn) qz = -b.hz - r; else qz = b.hz + r;
        }
        x = b.cx + qx * c + qz * s;
        z = b.cz - qx * s + qz * c;
      });
      if (!moved) break;
    }
    return { x, z, hit };
  }

  // Altura de la caja más alta "pisable" bajo un círculo (fuentes, escalones...)
  groundHeight(x, z, r, yFeet, step = 0.45) {
    let g = -Infinity;
    this.query(x - r, z - r, x + r, z + r, (b) => {
      if (b.maxY > yFeet + step || b.maxY <= g) return;
      const px = x - b.cx, pz = z - b.cz;
      const lx = px * b._c - pz * b._s, lz = px * b._s + pz * b._c;
      if (Math.abs(lx) > b.hx + r * 0.5 || Math.abs(lz) > b.hz + r * 0.5) return;
      g = b.maxY;
    });
    return g;
  }

  pointInside(x, y, z) {
    let inside = false;
    this.query(x, z, x, z, (b) => {
      if (y < b.minY || y >= b.maxY) return;
      const px = x - b.cx, pz = z - b.cz;
      const lx = px * b._c - pz * b._s, lz = px * b._s + pz * b._c;
      if (Math.abs(lx) < b.hx && Math.abs(lz) < b.hz) { inside = true; return false; }
    });
    return inside;
  }
}

function slab(ox, oy, oz, dx, dy, dz, hx, minY, maxY, hz) {
  let tmin = -Infinity, tmax = Infinity;
  if (Math.abs(dx) < 1e-12) { if (ox < -hx || ox > hx) return -1; } else {
    let t1 = (-hx - ox) / dx, t2 = (hx - ox) / dx; if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
  }
  if (Math.abs(dy) < 1e-12) { if (oy < minY || oy > maxY) return -1; } else {
    let t1 = (minY - oy) / dy, t2 = (maxY - oy) / dy; if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
  }
  if (Math.abs(dz) < 1e-12) { if (oz < -hz || oz > hz) return -1; } else {
    let t1 = (-hz - oz) / dz, t2 = (hz - oz) / dz; if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
  }
  if (tmax < 0 || tmin > tmax) return -1;
  return tmin < 0 ? 0 : tmin;
}
