// Servidor de archivos estáticos con compresión gzip en memoria.
// Rutas:
//   /            -> client/index.html
//   /shared/*    -> shared/ (código común cliente-servidor)
//   /lib/three/* -> node_modules/three/build/*
//   /lib/rapier/index.js -> módulo ES de @dimforge/rapier3d-compat

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { ROOT } from './config.js';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8', '.map': 'application/json',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.webmanifest', '.svg', '.wasm', '.map']);

const CLIENT_DIR = path.join(ROOT, 'client');
const SHARED_DIR = path.join(ROOT, 'shared');

function resolvePkgDir(name) {
  try {
    const req = createRequire(path.join(ROOT, 'package.json'));
    return path.dirname(req.resolve(name + '/package.json'));
  } catch {
    const p = path.join(ROOT, 'node_modules', name);
    return fs.existsSync(p) ? p : null;
  }
}

const THREE_DIR = resolvePkgDir('three');
const RAPIER_DIR = resolvePkgDir('@dimforge/rapier3d-compat');
let RAPIER_ENTRY = null;
if (RAPIER_DIR) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(RAPIER_DIR, 'package.json'), 'utf8'));
    const cand = [pkg.module, pkg.exports?.['.']?.import, pkg.exports?.['.']?.default, 'rapier.es.js', 'rapier.mjs', pkg.main];
    for (const c of cand) {
      if (typeof c === 'string' && fs.existsSync(path.join(RAPIER_DIR, c))) { RAPIER_ENTRY = path.join(RAPIER_DIR, c); break; }
    }
  } catch { /* sin rapier: el cliente usará la física de respaldo */ }
}

export function libStatus() {
  return { three: !!THREE_DIR && fs.existsSync(path.join(THREE_DIR, 'build', 'three.module.js')), rapier: !!RAPIER_ENTRY };
}

const cache = new Map(); // filePath -> {mtime, raw, gz}

function safeJoin(base, rel) {
  const p = path.normalize(path.join(base, rel));
  if (!p.startsWith(base)) return null;
  return p;
}

function mapUrl(urlPath) {
  if (urlPath === '/' || urlPath === '') return path.join(CLIENT_DIR, 'index.html');
  if (urlPath.startsWith('/shared/')) return safeJoin(SHARED_DIR, urlPath.slice(8));
  if (urlPath.startsWith('/lib/three/')) return THREE_DIR ? safeJoin(path.join(THREE_DIR, 'build'), urlPath.slice(11)) : null;
  if (urlPath === '/lib/rapier/index.js') return RAPIER_ENTRY;
  if (urlPath.startsWith('/lib/rapier/')) return RAPIER_DIR ? safeJoin(RAPIER_DIR, urlPath.slice(12)) : null;
  return safeJoin(CLIENT_DIR, urlPath.slice(1));
}

export function serveStatic(req, res) {
  let urlPath;
  try { urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); res.end(); return; }
  const file = mapUrl(urlPath);
  if (!file) return notFound(res);
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return notFound(res);
    const ext = path.extname(file).toLowerCase();
    let entry = cache.get(file);
    if (!entry || entry.mtime !== st.mtimeMs) {
      const raw = fs.readFileSync(file);
      entry = { mtime: st.mtimeMs, raw, gz: COMPRESSIBLE.has(ext) && raw.length > 1024 ? zlib.gzipSync(raw, { level: 6 }) : null };
      cache.set(file, entry);
    }
    const isLib = urlPath.startsWith('/lib/');
    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': isLib ? 'public, max-age=86400' : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    };
    const acceptsGz = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
    let body = entry.raw;
    if (entry.gz && acceptsGz) { body = entry.gz; headers['Content-Encoding'] = 'gzip'; headers.Vary = 'Accept-Encoding'; }
    headers['Content-Length'] = body.length;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') res.end(); else res.end(body);
  });
}

function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('No encontrado');
}
