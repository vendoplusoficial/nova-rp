// Mundo del servidor: jugadores conectados, vehículos, trabajos, combate y chat.
// El servidor es la autoridad sobre: dinero, salud, inventario, trabajo, vehículos
// y valida que el movimiento enviado por los clientes sea posible.

import { getCity } from '../shared/city.js';
import { playable } from '../shared/terrain.js';
import { CollisionGrid } from '../shared/collision.js';
import { NET, LIMITS, COMBAT, ANIM, ITEMS, VEHICLES, MOVE, MAP_VERSION } from '../shared/constants.js';
import { hashString } from '../shared/rng.js';
import { DeliveryJob } from './jobs/delivery.js';
import { CONFIG } from './config.js';
import { DevTeleport } from './devTeleport.js';   // DEV-TP

const SHIRTS = ['#e53935', '#1e88e5', '#43a047', '#fb8c00', '#8e24aa', '#00acc1', '#fdd835', '#6d4c41', '#3949ab', '#d81b60', '#00897b', '#5e35b1'];
const VEH_CODE = { bike: 1 };

const r2 = (v) => Math.round(v * 100) / 100;
const finite = (...v) => v.every((n) => typeof n === 'number' && Number.isFinite(n));

export class World {
  constructor(db) {
    this.db = db;
    this.city = getCity();
    this.grid = new CollisionGrid(this.city.colliders);
    this.players = new Map();   // id -> player
    this.vehicles = new Map();  // id -> vehicle
    this.nextId = 1;
    this.nextVehId = 1;
    this.jobs = { delivery: new DeliveryJob(this.city) };
    this.devTp = new DevTeleport(this);   // DEV-TP
    this.lastSave = Date.now();
    this.tickTimer = setInterval(() => this.tick(), 1000 / NET.SERVER_SNAPSHOT_HZ);
  }

  // ---------------- conexión ----------------

  onConnection(ws, ip) {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    let player = null;
    const helloTimeout = setTimeout(() => { if (!player) ws.close(4000, 'auth timeout'); }, 10000);

    ws.on('message', (data) => {
      let msg;
      try { msg = JSON.parse(data); } catch { return; }
      if (!msg || typeof msg.t !== 'string') return;
      if (!player) {
        if (msg.t !== 'hello') return;
        const user = this.db.userByToken(String(msg.token || ''));
        if (!user) { this.send(ws, { t: 'auth_fail', m: 'Sesión expirada. Vuelve a iniciar sesión.' }); ws.close(4001, 'bad token'); return; }
        if (this.players.size >= NET.MAX_PLAYERS && !this.findByName(user.name)) {
          this.send(ws, { t: 'auth_fail', m: 'El servidor está lleno.' }); ws.close(4002, 'full'); return;
        }
        clearTimeout(helloTimeout);
        player = this.join(ws, user);
        return;
      }
      try { this.handle(player, msg); } catch (e) { console.error('[game] error manejando', msg.t, e); }
    });

    ws.on('close', () => { clearTimeout(helloTimeout); if (player) this.leave(player); });
    ws.on('error', () => {});
  }

  findByName(name) {
    for (const p of this.players.values()) if (p.name.toLowerCase() === name.toLowerCase()) return p;
    return null;
  }

  join(ws, user) {
    const old = this.findByName(user.name);
    if (old) { this.send(old.ws, { t: 'kicked', m: 'Se inició sesión desde otro dispositivo.' }); old.ws.close(4003, 'dup'); this.leave(old); }

    const prof = user.profile;
    let pos = prof.pos;
    // mapa nuevo: todos empiezan en la Plaza Central (zona social segura) y las bicis vuelven a casa
    if (prof.mapVer !== MAP_VERSION) {
      pos = null;
      for (const v of prof.vehicles || []) delete v.parked;
      prof.mapVer = MAP_VERSION;
    }
    if (!pos || !finite(pos.x, pos.y, pos.z) || !playable(pos.x, pos.z, 0.5) || this.grid.pointInside(pos.x, Math.max(pos.y, this.city.height(pos.x, pos.z)) + 0.9, pos.z)) pos = this.spawnPoint();
    const id = this.nextId++;
    const p = {
      id, ws, user, name: user.name,
      color: SHIRTS[hashString(user.name) % SHIRTS.length],
      x: pos.x, y: Math.max(this.city.height(pos.x, pos.z), pos.y || 0), z: pos.z, ry: pos.ry || 0,
      anim: ANIM.IDLE, sp: 0, veh: 0,
      budget: LIMITS.MAX_FOOT_SPEED, lastMoveT: Date.now(),
      lastShot: 0, lastChat: 0, lastVehSpawn: 0, violations: 0,
      dead: false, deadUntil: 0, task: null,
    };
    if (prof.health <= 0) prof.health = 100;
    this.players.set(id, p);

    // Restaurar bici estacionada
    const restored = [];
    for (const v of prof.vehicles || []) {
      if (v.parked && finite(v.parked.x, v.parked.z)) restored.push(this.spawnVehicle(p, v.type, v.parked.x, Math.max(v.parked.y || 0, this.city.height(v.parked.x, v.parked.z)), v.parked.z, v.parked.ry || 0, false));
    }
    if (prof.job === 'delivery') p.task = this.jobs.delivery.newTask(p);

    this.send(ws, {
      t: 'welcome', id, name: p.name, color: p.color, clock: Date.now(),
      money: prof.money, health: prof.health, inv: prof.inv, job: prof.job, task: p.task,
      pos: { x: p.x, y: p.y, z: p.z, ry: p.ry },
      vehiclesOwned: (prof.vehicles || []).map((v) => v.type),
      players: [...this.players.values()].filter((o) => o !== p).map((o) => ({ id: o.id, name: o.name, color: o.color })),
      vehicles: [...this.vehicles.values()].map((v) => this.vehPublic(v)),
      stats: prof.stats,
    });
    this.devTp.onJoin(p);   // DEV-TP
    this.broadcast({ t: 'pj', id, name: p.name, color: p.color }, p);
    for (const v of restored) this.broadcast({ t: 'vadd', v: this.vehPublic(v) }, p);
    this.systemChat(`${p.name} se conectó.`);
    console.log(`[game] + ${p.name} (${this.players.size} en línea)`);
    return p;
  }

  leave(p) {
    if (!this.players.has(p.id)) return;
    this.players.delete(p.id);
    // Guardar posición y estacionar vehículos
    const prof = p.user.profile;
    prof.pos = { x: r2(p.x), y: r2(p.y), z: r2(p.z), ry: r2(p.ry) };
    if (p.dead) { const h = this.city.pois.hospital; prof.pos = { x: h.x, y: this.city.height(h.x, h.z), z: h.z, ry: 0 }; prof.health = 100; }
    for (const v of [...this.vehicles.values()]) {
      if (v.owner !== p.id) continue;
      if (v.driver && v.driver !== p.id) { const d = this.players.get(v.driver); if (d) d.veh = 0; }
      const rec = (prof.vehicles || []).find((x) => x.type === v.type);
      if (rec) rec.parked = v.driver === p.id ? { x: r2(p.x), y: r2(p.y), z: r2(p.z), ry: r2(p.ry) } : { x: r2(v.x), y: r2(v.y), z: r2(v.z), ry: r2(v.ry) };
      this.vehicles.delete(v.id);
      this.broadcast({ t: 'vdel', id: v.id });
    }
    this.db.save();
    this.broadcast({ t: 'pl', id: p.id });
    this.systemChat(`${p.name} se desconectó.`);
    console.log(`[game] - ${p.name} (${this.players.size} en línea)`);
  }

  spawnPoint() {
    const sp = this.city.spawnPoints;
    const s = sp[Math.floor(Math.random() * sp.length)];
    return { x: s.x, y: this.city.height(s.x, s.z), z: s.z, ry: 0 };
  }

  // ---------------- mensajes ----------------

  handle(p, m) {
    switch (m.t) {
      case 'st': return this.onState(p, m);
      case 'chat': return this.onChat(p, m);
      case 'ping': return this.send(p.ws, { t: 'pong', c: m.c });
      case 'veh_spawn': return this.onVehSpawn(p);
      case 'veh_enter': return this.onVehEnter(p, m);
      case 'veh_exit': return this.onVehExit(p, m);
      case 'job_take': return this.onJobTake(p, m);
      case 'job_quit': return this.onJobQuit(p);
      case 'job_pickup': return this.onJobPickup(p);
      case 'job_deliver': return this.onJobDeliver(p);
      case 'shoot': return this.onShoot(p, m);
      case 'use': return this.onUse(p, m);
      case 'respawn_req': return null;
      case 'dev_tp': return this.devTp.onTeleport(p, m);   // DEV-TP
      default: return null;
    }
  }

  onState(p, m) {
    const now = Date.now();
    const dt = Math.min(5, (now - p.lastMoveT) / 1000);
    p.lastMoveT = now;
    if (p.dead) return;
    const { x, y, z, ry } = m;
    if (!finite(x, y, z, ry)) return;
    const veh = p.veh ? this.vehicles.get(p.veh) : null;
    const maxSpeed = veh ? LIMITS.MAX_VEHICLE_SPEED[veh.type] : LIMITS.MAX_FOOT_SPEED;
    const cap = maxSpeed * LIMITS.MOVE_BUDGET_SECONDS + 3;
    p.budget = Math.min(p.budget + maxSpeed * dt, cap);
    const d = Math.hypot(x - p.x, z - p.z);
    const ground = this.city.height(x, z);
    const outside = !playable(x, z, -1.5) || y < ground - 2.5 || y > ground + 14;
    const insideWall = this.grid.pointInside(x, y + 1.0, z);
    if (d > p.budget || outside || insideWall) {
      p.violations++;
      p.budget = maxSpeed * 0.5;
      this.send(p.ws, { t: 'corr', x: p.x, y: p.y, z: p.z });
      if (p.violations % 10 === 1) console.log(`[anti-trampas] corrección a ${p.name} (d=${d.toFixed(1)} budget=${p.budget.toFixed(1)}${insideWall ? ' dentro de pared' : ''})`);
      return;
    }
    p.budget -= d;
    p.x = x; p.y = y; p.z = z; p.ry = ry;
    // a = código de animación (bits 0-3) + bandera "apuntando" (bit 4 = 16)
    p.anim = Number.isInteger(m.a) && m.a >= 0 && m.a < 32 && (m.a & 15) <= 10 ? m.a : 0;
    p.sp = finite(m.sp) ? Math.max(0, Math.min(20, m.sp)) : 0;
    if (veh) { veh.x = x; veh.y = y; veh.z = z; veh.ry = ry; p.anim = ANIM.RIDE; }
    else if ((p.anim & 15) === ANIM.RIDE || (p.anim & 15) === ANIM.DEAD) p.anim = ANIM.IDLE;
  }

  onChat(p, m) {
    const now = Date.now();
    if (now - p.lastChat < LIMITS.CHAT_MIN_INTERVAL_MS) return;
    p.lastChat = now;
    let text = String(m.m || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, LIMITS.CHAT_MAX_LEN);
    if (!text) return;
    if (text.startsWith('/')) return this.command(p, text);
    this.broadcast({ t: 'chat', n: p.name, c: p.color, m: text });
  }

  command(p, text) {
    const cmd = text.split(/\s+/)[0].toLowerCase();
    const reply = (m) => this.send(p.ws, { t: 'chat', sys: true, m });
    switch (cmd) {
      case '/ayuda': case '/help':
        return reply('Comandos: /ayuda, /jugadores, /dinero, /bici, /trabajo, /dejartrabajo');
      case '/jugadores':
        return reply(`En línea (${this.players.size}): ${[...this.players.values()].map((o) => o.name).join(', ')}`);
      case '/dinero': return reply(`Tienes $${p.user.profile.money}`);
      case '/bici': return this.onVehSpawn(p);
      case '/trabajo': return reply(`Trabajo actual: ${p.user.profile.job === 'delivery' ? 'Repartidor' : 'Ninguno'}. Ve al Centro de Trabajos (Zona Comercial).`);
      case '/dejartrabajo': return this.onJobQuit(p);
      default: return reply('Comando desconocido. Escribe /ayuda');
    }
  }

  // ---------------- vehículos ----------------

  vehPublic(v) { return { id: v.id, type: v.type, owner: v.owner, ownerName: this.players.get(v.owner)?.name || '', x: r2(v.x), y: r2(v.y), z: r2(v.z), ry: r2(v.ry), driver: v.driver }; }

  spawnVehicle(owner, type, x, y, z, ry, announce = true) {
    const v = { id: this.nextVehId++, type, owner: owner.id, x, y, z, ry, driver: 0 };
    this.vehicles.set(v.id, v);
    if (announce) this.broadcast({ t: 'vadd', v: this.vehPublic(v) });
    return v;
  }

  onVehSpawn(p) {
    const now = Date.now();
    const reply = (m) => this.send(p.ws, { t: 'toast', m });
    if (p.dead) return;
    if (p.veh) return reply('Ya estás en un vehículo.');
    if (now - p.lastVehSpawn < 4000) return reply('Espera unos segundos para volver a pedir tu bici.');
    const owned = (p.user.profile.vehicles || []).find((v) => v.type === 'bike');
    if (!owned) return reply('No tienes bicicleta.');
    // Buscar un lugar libre junto al jugador
    let spot = null;
    for (let k = 0; k < 12 && !spot; k++) {
      const a = p.ry + Math.PI / 2 + k * (Math.PI / 6);
      const sx = p.x + Math.sin(a) * 1.8, sz = p.z + Math.cos(a) * 1.8;
      const sy = this.city.height(sx, sz);
      if (!playable(sx, sz, 0.5) || Math.abs(sy - p.y) > 1.2) continue;
      const r = this.grid.resolveCylinder(sx, sz, 0.6, sy, 1.2);
      if (!r.hit) spot = { x: sx, y: sy, z: sz };
    }
    if (!spot) return reply('No hay espacio para tu bici aquí.');
    p.lastVehSpawn = now;
    for (const v of [...this.vehicles.values()]) {
      if (v.owner === p.id && v.type === 'bike' && !v.driver) { this.vehicles.delete(v.id); this.broadcast({ t: 'vdel', id: v.id }); }
    }
    this.spawnVehicle(p, 'bike', spot.x, spot.y, spot.z, p.ry);
    owned.parked = null;
    reply('Tu bicicleta está junto a ti. Toca SUBIR para montar.');
  }

  onVehEnter(p, m) {
    const v = this.vehicles.get(Number(m.id));
    if (!v || p.dead || p.veh) return;
    if (v.owner !== p.id) return this.send(p.ws, { t: 'toast', m: 'Este vehículo tiene seguro (no es tuyo).' });
    if (v.driver) return;
    if (Math.hypot(v.x - p.x, v.z - p.z) > 4) return this.send(p.ws, { t: 'toast', m: 'Estás demasiado lejos.' });
    v.driver = p.id; p.veh = v.id;
    p.budget = LIMITS.MAX_VEHICLE_SPEED[v.type];
    this.send(p.ws, { t: 'venter', id: v.id, type: v.type, x: v.x, y: v.y, z: v.z, ry: v.ry });
    this.broadcast({ t: 'vupd', v: this.vehPublic(v) });
  }

  onVehExit(p, m) {
    const v = p.veh ? this.vehicles.get(p.veh) : null;
    if (!v) { p.veh = 0; return; }
    v.driver = 0; p.veh = 0;
    v.x = p.x; v.y = p.y; v.z = p.z;
    if (finite(m.ry)) v.ry = m.ry;
    p.budget = Math.min(p.budget, LIMITS.MAX_FOOT_SPEED * 2);
    this.send(p.ws, { t: 'vexit', id: v.id });
    this.broadcast({ t: 'vupd', v: this.vehPublic(v) });
  }

  // ---------------- trabajos ----------------

  sendJob(p) { this.send(p.ws, { t: 'job', job: p.user.profile.job, task: p.task }); }

  onJobTake(p, m) {
    const job = this.jobs[m.job];
    if (!job) return;
    if (p.user.profile.job === job.id) return this.send(p.ws, { t: 'toast', m: 'Ya trabajas como ' + job.name + '.' });
    if (!job.canTake(p)) return this.send(p.ws, { t: 'toast', m: 'Ve al Centro de Trabajos para tomar el trabajo.' });
    p.user.profile.job = job.id;
    p.task = job.newTask(p);
    this.db.save();
    this.send(p.ws, { t: 'toast', m: `Ahora eres ${job.name}. Recoge el pedido en ${p.task.pickup.name}.` });
    this.sendJob(p);
  }

  onJobQuit(p) {
    if (p.user.profile.job === 'none') return;
    p.user.profile.job = 'none'; p.task = null;
    this.db.save();
    this.send(p.ws, { t: 'toast', m: 'Dejaste tu trabajo.' });
    this.sendJob(p);
  }

  onJobPickup(p) {
    if (p.user.profile.job !== 'delivery' || p.dead) return;
    const r = this.jobs.delivery.pickup(p, p.task);
    this.send(p.ws, { t: 'toast', m: r.msg });
    if (r.ok) this.sendJob(p);
  }

  onJobDeliver(p) {
    if (p.user.profile.job !== 'delivery' || p.dead) return;
    const r = this.jobs.delivery.deliver(p, p.task);
    this.send(p.ws, { t: 'toast', m: r.msg, good: r.ok });
    if (!r.ok) return;
    const prof = p.user.profile;
    prof.money += r.pay;
    prof.stats = prof.stats || {};
    prof.stats.deliveries = (prof.stats.deliveries || 0) + 1;
    this.send(p.ws, { t: 'money', v: prof.money, d: r.pay });
    p.task = this.jobs.delivery.newTask(p);
    this.db.save();
    this.sendJob(p);
  }

  // ---------------- combate ----------------

  // Zonas seguras (plaza, hospital, parques, playas...): no se puede disparar ni hacer daño
  inSafeZone(x, z) {
    for (const s of this.city.safeZones || []) if ((x - s.x) ** 2 + (z - s.z) ** 2 < s.r * s.r) return true;
    return false;
  }

  onShoot(p, m) {
    const now = Date.now();
    if (p.dead || p.veh) return;
    if (now - p.lastShot < LIMITS.SHOOT_MIN_INTERVAL_MS) return;
    if (this.inSafeZone(p.x, p.z)) {
      if (now - (p.lastSafeMsg || 0) > 3000) { p.lastSafeMsg = now; this.send(p.ws, { t: 'toast', m: 'Zona segura: aquí no se puede disparar.' }); }
      return;
    }
    p.lastShot = now;
    const o = m.o, d = m.d;
    if (!Array.isArray(o) || !Array.isArray(d) || !finite(o[0], o[1], o[2], d[0], d[1], d[2])) return;
    if (Math.hypot(o[0] - p.x, o[1] - (p.y + 1.4), o[2] - p.z) > 3) return;
    const len = Math.hypot(d[0], d[1], d[2]);
    if (len < 0.5) return;
    const dx = d[0] / len, dy = d[1] / len, dz = d[2] / len;
    let range = Math.min(LIMITS.SHOOT_MAX_RANGE, this.grid.raycast(o[0], o[1], o[2], dx, dy, dz, LIMITS.SHOOT_MAX_RANGE));
    let end = [o[0] + dx * range, o[1] + dy * range, o[2] + dz * range];

    const t = m.tid ? this.players.get(Number(m.tid)) : null;
    if (t && t !== p && !t.dead) {
      const ta = t.anim & 15;
      const tc = [t.x, t.y + (ta === ANIM.CROUCH || ta === ANIM.CROUCH_WALK ? 0.8 : 1.15), t.z];
      const vx = tc[0] - o[0], vy = tc[1] - o[1], vz = tc[2] - o[2];
      const tdist = Math.hypot(vx, vy, vz);
      const along = vx * dx + vy * dy + vz * dz;
      const perp = Math.sqrt(Math.max(0, tdist * tdist - along * along));
      const tolerance = 1.0 + tdist * 0.035;  // tolerancia por latencia / autoapuntado
      const visible = !this.grid.segmentBlocked(o[0], o[1], o[2], tc[0], tc[1], tc[2]);
      if (tdist <= LIMITS.SHOOT_MAX_RANGE && along > 0 && perp <= tolerance && visible) {
        end = tc;
        if (this.inSafeZone(t.x, t.z) || this.inSafeZone(p.x, p.z)) {
          this.send(p.ws, { t: 'toast', m: 'Zona segura: no se puede hacer daño aquí.' });
        } else {
          this.damage(t, COMBAT.PISTOL_DAMAGE, p);
          this.send(p.ws, { t: 'hitok', id: t.id, k: t.dead ? 1 : 0 });
        }
      }
    }
    this.broadcast({ t: 'shot', id: p.id, o: o.map(r2), e: end.map(r2) }, p);
  }

  damage(t, amount, by) {
    const prof = t.user.profile;
    prof.health = Math.max(0, prof.health - amount);
    this.send(t.ws, { t: 'health', v: prof.health, by: by?.id || 0 });
    if (prof.health <= 0 && !t.dead) {
      t.dead = true;
      t.deadUntil = Date.now() + COMBAT.RESPAWN_SECONDS * 1000;
      t.anim = ANIM.DEAD;
      if (t.veh) this.onVehExit(t, {});
      this.send(t.ws, { t: 'dead', s: COMBAT.RESPAWN_SECONDS, by: by?.name || '' });
      this.systemChat(`${t.name} quedó incapacitado.`);
    }
  }

  onUse(p, m) {
    const item = String(m.item || '');
    const def = ITEMS[item];
    const prof = p.user.profile;
    if (!def || !def.usable || p.dead) return;
    if (!(prof.inv[item] > 0)) return;
    if (prof.health >= 100) return this.send(p.ws, { t: 'toast', m: 'Tu salud ya está completa.' });
    prof.inv[item]--;
    if (prof.inv[item] <= 0) delete prof.inv[item];
    prof.health = Math.min(100, prof.health + def.heal);
    this.db.save();
    this.send(p.ws, { t: 'inv', inv: prof.inv });
    this.send(p.ws, { t: 'health', v: prof.health });
    this.send(p.ws, { t: 'toast', m: `Usaste ${def.name} (+${def.heal} salud).` });
  }

  // ---------------- bucle ----------------

  tick() {
    const now = Date.now();
    const snap = [];
    for (const p of this.players.values()) {
      if (p.dead && now >= p.deadUntil) this.respawn(p);
      const v = p.veh ? this.vehicles.get(p.veh) : null;
      snap.push([p.id, r2(p.x), r2(p.y), r2(p.z), r2(p.ry), p.dead ? ANIM.DEAD : p.anim, v ? VEH_CODE[v.type] : 0, Math.round(p.sp * 10) / 10]);
    }
    if (snap.length) this.broadcast({ t: 'snap', ts: now, p: snap });

    // Keepalive
    if (!this._lastPing || now - this._lastPing > 10000) {
      this._lastPing = now;
      for (const p of this.players.values()) {
        if (p.ws.isAlive === false) { p.ws.terminate(); continue; }
        p.ws.isAlive = false;
        try { p.ws.ping(); } catch { /* ignorar */ }
      }
    }
    if (now - this.lastSave > CONFIG.AUTOSAVE_SECONDS * 1000) {
      this.lastSave = now;
      for (const p of this.players.values()) p.user.profile.pos = { x: r2(p.x), y: r2(p.y), z: r2(p.z), ry: r2(p.ry) };
      this.db.save();
    }
  }

  respawn(p) {
    const h = this.city.pois.hospital;
    p.dead = false;
    p.user.profile.health = 100;
    p.x = h.x + (Math.random() - 0.5) * 4; p.z = h.z + (Math.random() - 0.5) * 2; p.y = this.city.height(p.x, p.z);
    p.anim = ANIM.IDLE;
    p.budget = LIMITS.MAX_FOOT_SPEED;
    this.send(p.ws, { t: 'respawn', x: p.x, y: p.y, z: p.z, health: 100 });
  }

  // ---------------- utilidades ----------------

  send(ws, obj) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
  }

  broadcast(obj, except = null) {
    const s = JSON.stringify(obj);
    for (const p of this.players.values()) if (p !== except && p.ws.readyState === 1) p.ws.send(s);
  }

  systemChat(m) { this.broadcast({ t: 'chat', sys: true, m }); }

  shutdown() {
    clearInterval(this.tickTimer);
    for (const p of [...this.players.values()]) this.leave(p);
    this.db.saveNow();
  }
}

export const _internals = { MOVE, VEHICLES };
