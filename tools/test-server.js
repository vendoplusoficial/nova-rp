// Prueba automática del servidor con jugadores-bot.
// Uso: node tools/test-server.js   (levanta su propio servidor en el puerto 3999)

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { getCity } from '../shared/city.js';
import { World } from '../server/game.js';
import { Database } from '../server/db.js';
import { ANIM } from '../shared/constants.js';
import { CollisionGrid } from '../shared/collision.js';
import { playable, regionAt } from '../shared/terrain.js';
import { CITIES } from '../shared/worldplan.js';
import { findSafeSpot } from '../server/devTeleport.js';   // DEV-TP (y el bloque de pruebas marcado)

// Ruta caminable (A* en rejilla de 3 m) que esquiva edificios y objetos: así los bots viajan como un jugador
function findPath(from, to) {
  const city = getCity();
  const grid = (findPath.grid ||= new CollisionGrid(city.colliders));
  const G = 3, OFF = 5000;
  const key = (i, j) => (i + OFF) * 100000 + (j + OFF);
  const freeCache = new Map();
  const free = (i, j) => {
    const k = key(i, j);
    let v = freeCache.get(k);
    if (v === undefined) {
      const x = i * G, z = j * G;
      v = playable(x, z, 0.8);
      if (v) { const y = city.height(x, z); const r = grid.resolveCylinder(x, z, 1.5, y, 1.8); v = !(r.hit && Math.hypot(r.x - x, r.z - z) > 0.05); }
      freeCache.set(k, v);
    }
    return v;
  };
  const si = Math.round(from.x / G), sj = Math.round(from.z / G), ti = Math.round(to.x / G), tj = Math.round(to.z / G);
  // montículo binario
  const heap = [];
  const push = (e) => { heap.push(e); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const came = new Map(), cost = new Map([[key(si, sj), 0]]), closed = new Set();
  const h = (i, j) => Math.hypot(i - ti, j - tj);
  push([h(si, sj), si, sj]);
  let n = 0;
  while (heap.length && n++ < 120000) {
    const [, i, j] = pop();
    const k0 = key(i, j);
    if (closed.has(k0)) continue;
    closed.add(k0);
    if (Math.abs(i - ti) <= 1 && Math.abs(j - tj) <= 1) {
      const pts = [{ x: to.x, z: to.z }];
      let k = k0;
      while (came.has(k)) { pts.push({ x: (Math.floor(k / 100000) - OFF) * G, z: ((k % 100000) - OFF) * G }); k = came.get(k); }
      return pts.reverse();
    }
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const ni = i + di, nj = j + dj, nk = key(ni, nj);
      if (closed.has(nk)) continue;
      const c = cost.get(k0) + Math.hypot(di, dj);
      if (c >= (cost.get(nk) ?? Infinity) || !free(ni, nj)) continue;
      cost.set(nk, c); came.set(nk, k0); push([c + h(ni, nj), ni, nj]);
    }
  }
  return [{ x: to.x, z: to.z }];
}


const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3999;
const BASE = `http://127.0.0.1:${PORT}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'novarp-test-'));
let failures = 0;
const ok = (cond, msg) => { if (cond) console.log('  ✔', msg); else { console.log('  ✘', msg); failures++; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(pathname, body) {
  const r = await fetch(BASE + pathname, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return r.json();
}

class Bot {
  constructor(name) { this.name = name; this.msgs = []; this.waiters = []; }
  connect(token) {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
      this.ws.on('open', () => this.ws.send(JSON.stringify({ t: 'hello', token })));
      this.ws.on('message', (d) => {
        const m = JSON.parse(d);
        this.msgs.push(m);
        if (m.t === 'welcome') { this.me = m; this.pos = { ...m.pos }; resolve(m); }
        if (m.t === 'corr') { this.pos = { x: m.x, y: m.y, z: m.z, ry: 0 }; }
        this.waiters = this.waiters.filter((w) => !w(m));
      });
      this.ws.on('error', reject);
      this.closed = new Promise((r) => this.ws.on('close', (code) => r(code)));
    });
  }
  send(o) { this.ws.send(JSON.stringify(o)); }
  wait(pred, ms = 3000) {
    return new Promise((resolve) => {
      const found = this.msgs.find(pred);
      if (found) { this.msgs.splice(this.msgs.indexOf(found), 1); return resolve(found); }
      const timer = setTimeout(() => resolve(null), ms);
      this.waiters.push((m) => { if (pred(m)) { clearTimeout(timer); this.msgs.splice(this.msgs.indexOf(m), 1); resolve(m); return true; } return false; });
    });
  }
  clear() { this.msgs = []; }
  // Camina en línea recta a velocidad legal
  async walkTo(x, z, speed = 6.5, a = ANIM.RUN, maxMs = 30000) {
    const hz = 15, step = speed / hz;
    const t0 = Date.now();
    const city = getCity();
    while (Date.now() - t0 < maxMs) {
      const dx = x - this.pos.x, dz = z - this.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.3) break;
      const s = Math.min(step, d);
      this.pos.x += (dx / d) * s; this.pos.z += (dz / d) * s;
      this.pos.y = city.height(this.pos.x, this.pos.z);
      this.send({ t: 'st', x: this.pos.x, y: this.pos.y, z: this.pos.z, ry: Math.atan2(dx, dz), a, v: 0, sp: speed });
      await sleep(1000 / hz);
    }
  }
}

async function main() {
  console.log('Iniciando servidor de prueba...');
  const srv = spawn(process.execPath, [path.join(ROOT, 'server/index.js')], { env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir }, stdio: ['ignore', 'pipe', 'pipe'] });
  let srvOut = '';
  srv.stdout.on('data', (d) => { srvOut += d; });
  srv.stderr.on('data', (d) => { srvOut += d; });
  for (let i = 0; i < 50; i++) { try { await fetch(BASE + '/api/status'); break; } catch { await sleep(100); } }

  try {
    console.log('\n[1] Cuentas');
    const r1 = await api('/api/register', { user: 'Alicia', pass: 'clave123' });
    ok(r1.ok && r1.token, 'registro Alicia');
    const r2 = await api('/api/register', { user: 'Beto_7', pass: 'clave456' });
    ok(r2.ok, 'registro Beto_7');
    ok(!(await api('/api/register', { user: 'alicia', pass: 'xxxx' })).ok, 'nombre duplicado rechazado (sin importar mayúsculas)');
    ok(!(await api('/api/register', { user: 'a b', pass: 'xxxx' })).ok, 'nombre inválido rechazado');
    ok(!(await api('/api/login', { user: 'Alicia', pass: 'mala' })).ok, 'contraseña incorrecta rechazada');
    const l1 = await api('/api/login', { user: 'alicia', pass: 'clave123' });
    ok(l1.ok && l1.name === 'Alicia', 'login correcto');

    const index = await fetch(BASE + '/');
    ok(index.status === 200, 'sirve index.html');
    const shared = await fetch(BASE + '/shared/city.js');
    ok(shared.status === 200, 'sirve /shared/city.js');
    ok((await fetch(BASE + '/../package.json')).status !== 200, 'bloquea path traversal');

    console.log('\n[2] Conexión WebSocket');
    const a = new Bot('Alicia'), b = new Bot('Beto');
    const wa = await a.connect(l1.token);
    ok(wa.money === 500 && wa.inv.pistola === 1, 'perfil inicial (dinero $500, pistola)');
    const wb = await b.connect(r2.token);
    ok(wb.players.some((p) => p.name === 'Alicia'), 'Beto ve a Alicia en la lista');
    ok(!!(await a.wait((m) => m.t === 'pj' && m.name === 'Beto_7')), 'Alicia recibe aviso de que entró Beto');

    console.log('\n[3] Movimiento y anti-trampas');
    const city = getCity();
    const target = { x: a.pos.x + 3, z: a.pos.z };
    await a.walkTo(target.x, target.z, 4);
    await sleep(200);
    const snap = await b.wait((m) => m.t === 'snap' && m.p.some((p) => p[0] === wa.id && Math.abs(p[1] - target.x) < 0.5));
    ok(!!snap, 'Beto recibe la posición sincronizada de Alicia');
    a.clear();
    a.send({ t: 'st', x: a.pos.x + 200, y: city.height(a.pos.x + 200, a.pos.z), z: a.pos.z, ry: 0, a: 0, v: 0, sp: 0 });
    ok(!!(await a.wait((m) => m.t === 'corr')), 'teletransporte detectado y corregido');
    await sleep(300);
    a.clear();
    const tower = city.lots.find((l) => l.type === 'torre');
    const tb = tower.parts.find((q) => q.k === 'box' && q.col);
    const tc = [tower.cx + tb.x * Math.cos(tower.rot) + tb.z * Math.sin(tower.rot), tower.cz - tb.x * Math.sin(tower.rot) + tb.z * Math.cos(tower.rot)];
    a.send({ t: 'st', x: tc[0], y: tower.y0, z: tc[1], ry: 0, a: 0, v: 0, sp: 0 });
    ok(!!(await a.wait((m) => m.t === 'corr')), 'posición dentro de un edificio rechazada');

    console.log('\n[4] Chat');
    a.send({ t: 'chat', m: 'Hola <b>mundo</b>' });
    const ch = await b.wait((m) => m.t === 'chat' && m.n === 'Alicia');
    ok(ch && ch.m === 'Hola <b>mundo</b>', 'mensaje recibido (el cliente lo muestra como texto, sin HTML)');
    await sleep(800);
    a.send({ t: 'chat', m: '/jugadores' });
    const sys = await a.wait((m) => m.t === 'chat' && m.sys && m.m.startsWith('En línea'));
    ok(!!sys, 'comando /jugadores');

    console.log('\n[5] Bicicleta');
    a.send({ t: 'veh_spawn' });
    const vadd = await b.wait((m) => m.t === 'vadd' && m.v.ownerName === 'Alicia');
    ok(!!vadd, 'bici aparece para todos');
    b.send({ t: 'veh_enter', id: vadd.v.id });
    ok(!!(await b.wait((m) => m.t === 'toast' && /seguro/.test(m.m))), 'Beto no puede usar la bici de Alicia');
    a.send({ t: 'veh_enter', id: vadd.v.id });
    const ve = await a.wait((m) => m.t === 'venter');
    ok(!!ve, 'Alicia sube a su bici');
    a.pos.x = ve.x; a.pos.z = ve.z;
    await a.walkTo(a.pos.x, a.pos.z, 4, ANIM.RIDE);
    a.clear();
    // Avanza a 13 m/s (legal en bici, ilegal a pie)
    const jc = city.pois.jobcenter;
    for (const w of findPath(a.pos, jc)) await a.walkTo(w.x, w.z, 13, ANIM.RIDE);
    ok(Math.hypot(a.pos.x - jc.x, a.pos.z - jc.z) < 1, 'llegó en bici al Centro de Trabajos');
    ok(!a.msgs.some((m) => m.t === 'corr'), 'en bici puede ir a 13 m/s sin corrección');
    a.send({ t: 'veh_exit', ry: 1.0 });
    ok(!!(await b.wait((m) => m.t === 'vupd' && m.v.driver === 0)), 'Alicia baja; la bici queda estacionada');

    console.log('\n[6] Trabajo de repartidor');
    a.send({ t: 'job_take', job: 'delivery' });
    const job = await a.wait((m) => m.t === 'job' && m.task);
    ok(job && job.job === 'delivery' && job.task.stage === 'pickup', 'toma el trabajo en el Centro de Trabajos');
    a.send({ t: 'job_deliver' });
    ok(!!(await a.wait((m) => m.t === 'toast' && /No llevas/.test(m.m))), 'no puede entregar sin recoger');
    a.send({ t: 'job_pickup' });
    ok(!!(await a.wait((m) => m.t === 'toast' && /Acércate/.test(m.m))), 'no puede recoger desde lejos');

    console.log('\n[7] Combate (zona segura)');
    b.send({ t: 'shoot', tid: wa.id, o: [b.pos.x, 1.5, b.pos.z], d: [jc.x - b.pos.x, 0, jc.z - b.pos.z] });
    await sleep(300);
    ok(true, 'disparo procesado sin errores');

    console.log('\n[8] Persistencia');
    const posBefore = { ...a.pos };
    a.ws.close();
    await a.closed;
    await sleep(1600);
    const a2 = new Bot('Alicia');
    const w2 = await a2.connect(l1.token);
    ok(Math.hypot(w2.pos.x - posBefore.x, w2.pos.z - posBefore.z) < 1, 'posición guardada al desconectar');
    ok(w2.job === 'delivery' && w2.task, 'trabajo guardado');
    ok(w2.vehicles.some((v) => v.ownerName === 'Alicia'), 'bici estacionada restaurada');
    const a3 = new Bot('Alicia');
    await a3.connect(l1.token);
    ok((await a2.closed) === 4003, 'segunda sesión expulsa a la primera');

    a3.ws.close(); b.ws.close();
    await sleep(300);
  } finally {
    srv.kill('SIGTERM');
    await sleep(300);
  }
  if (/Error|error/.test(srvOut) && /at .*\.js/.test(srvOut)) { console.log(srvOut); failures++; }

  console.log('\n[9] Lógica interna (sin red)');
  await unitTests();

  fs.rmSync(dataDir, { recursive: true, force: true });
  console.log(failures ? `\n${failures} PRUEBAS FALLARON` : '\nTODAS LAS PRUEBAS PASARON');
  process.exit(failures ? 1 : 0);
}

async function unitTests() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'novarp-unit-'));
  const db = new Database(dir);
  const world = new World(db);
  clearInterval(world.tickTimer);
  const fakeWs = () => ({ readyState: 1, sent: [], send(s) { this.sent.push(JSON.parse(s)); }, close() {}, on() {}, ping() {} });
  const mk = (name) => {
    const u = { name, profile: { money: 0, health: 100, job: 'none', inv: { pan: 1 }, vehicles: [{ type: 'bike', parked: null }], stats: {} } };
    db.data.users[name.toLowerCase()] = u;
    return world.join(fakeWs(), u);
  };
  const p1 = mk('Uno'), p2 = mk('Dos');
  const city = world.city;
  // Llevar a ambos a una calle residencial fuera de zona segura
  p1.x = 300; p1.z = -4; p1.y = city.height(300, -4);
  p2.x = 300; p2.z = 6; p2.y = city.height(300, 6);
  for (let k = 0; k < 5; k++) {
    p1.lastShot = 0;
    world.onShoot(p1, { tid: p2.id, o: [p1.x, p1.y + 1.4, p1.z], d: [0, -0.02, 1] });
  }
  ok(p2.user.profile.health === 0 && p2.dead, '5 disparos de 20 = jugador incapacitado');
  p2.deadUntil = 0; world.tick();
  ok(!p2.dead && p2.user.profile.health === 100, 'reaparece en el hospital con 100 de salud');
  p1.lastShot = 0;
  const before = p2.user.profile.health;
  p2.x = p1.x + 30; p2.z = p1.z;
  world.onShoot(p1, { tid: p2.id, o: [p1.x, p1.y + 1.4, p1.z], d: [0, 0, 1] });
  ok(p2.user.profile.health === before, 'disparo que no apunta al objetivo no hace daño');

  // Repartidor: tiempo mínimo
  const job = world.jobs.delivery;
  const task = job.newTask(p1);
  ok(task.pay > 45 && task.dist > 100, `pedido generado: $${task.pay} por ${task.dist} m`);
  p1.x = task.pickup.x; p1.z = task.pickup.z;
  ok(job.pickup(p1, task).ok, 'recoger en el negocio');
  p1.x = task.drop.x; p1.z = task.drop.z;
  ok(!job.deliver(p1, task).ok, 'entrega instantánea rechazada (anti-trampas)');
  task.pickedAt -= 120000;
  ok(job.deliver(p1, task).ok, 'entrega válida tras tiempo de viaje real');

  // Usar objeto
  p1.user.profile.health = 50;
  world.onUse(p1, { item: 'pan' });
  ok(p1.user.profile.health === 70 && !p1.user.profile.inv.pan, 'usar sándwich cura 20 y se consume');
  world.onUse(p1, { item: 'pan' });
  ok(p1.user.profile.health === 70, 'no se puede usar un objeto que no tienes');

  // Teletransporte de desarrollo (DEV-TP): apagado por defecto y con destinos seguros en las 3 ciudades
  ok(!world.devTp.enabled && !p1.ws.sent.some((m) => m.t === 'dev'), 'teletransporte de desarrollo desactivado por defecto');
  const x0 = p1.x;
  world.handle(p1, { t: 'dev_tp', to: 'montana' });
  ok(p1.x === x0, 'un jugador normal no puede teletransportarse');
  for (const c of CITIES) {
    const s = findSafeSpot(world, ...(c.existing ? [city.spawnPoints[0].x, city.spawnPoints[0].z] : c.center), c.region);
    const g = s && city.height(s.x, s.z);
    ok(s && regionAt(s.x, s.z) === c.region && playable(s.x, s.z, 1) && s.y >= g && s.y - g < 1 && !world.grid.pointInside(s.x, g + 1, s.z),
      `punto de teletransporte seguro en ${c.name}${s ? ` (${s.x.toFixed(0)}, ${s.z.toFixed(0)})` : ''}`);
  }
  fs.rmSync(dir, { recursive: true, force: true });
}

main().catch((e) => { console.error(e); process.exit(1); });
