// Punto de entrada del servidor: HTTP (archivos + API de cuentas) y WebSocket (juego).
// Ejecuta:  npm start   y abre http://localhost:3000

import http from 'node:http';
import os from 'node:os';
import { WebSocketServer } from 'ws';
import { CONFIG } from './config.js';
import { Database } from './db.js';
import { Auth } from './auth.js';
import { World } from './game.js';
import { serveStatic, libStatus } from './static.js';
import { GAME_NAME, NET } from '../shared/constants.js';

const db = new Database(CONFIG.DATA_DIR);
const auth = new Auth(db);
const world = new World(db);

function readJson(req, limit = 2048) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > limit) { req.destroy(); resolve(null); } });
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve(null); } });
    req.on('error', () => resolve(null));
  });
}

function json(res, code, obj) {
  const s = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(s) });
  res.end(s);
}

function clientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?';
}

const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];
  if (req.method === 'POST' && (url === '/api/register' || url === '/api/login')) {
    const body = await readJson(req);
    if (!body) return json(res, 400, { ok: false, error: 'Solicitud inválida' });
    const fn = url === '/api/register' ? auth.register.bind(auth) : auth.login.bind(auth);
    try {
      const r = await fn(body.user, body.pass, clientIp(req));
      return json(res, r.ok ? 200 : 400, r);
    } catch (e) {
      console.error(e);
      return json(res, 500, { ok: false, error: 'Error del servidor' });
    }
  }
  if (req.method === 'GET' && url === '/api/status') {
    return json(res, 200, { ok: true, game: GAME_NAME, players: world.players.size, max: NET.MAX_PLAYERS, libs: libStatus() });
  }
  if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res);
  res.writeHead(405); res.end();
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 8 * 1024, perMessageDeflate: false });
wss.on('connection', (ws, req) => world.onConnection(ws, clientIp(req)));

server.listen(CONFIG.PORT, CONFIG.HOST, () => {
  const libs = libStatus();
  console.log('');
  console.log(`  ${GAME_NAME} - servidor iniciado`);
  console.log(`  PC:       http://localhost:${CONFIG.PORT}`);
  for (const ip of lanIps()) console.log(`  Celular:  http://${ip}:${CONFIG.PORT}   (misma red Wi-Fi)`);
  if (!libs.three) console.log('  ⚠ Falta three.js: ejecuta  npm install');
  if (!libs.rapier) console.log('  ⚠ Falta Rapier: ejecuta  npm install  (el juego usará física de respaldo)');
  console.log('');
});

function lanIps() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) out.push(i.address);
  }
  return out;
}

function shutdown() {
  console.log('\nGuardando y cerrando...');
  try { world.shutdown(); } catch (e) { console.error(e); }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
