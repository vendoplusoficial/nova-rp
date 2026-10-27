// Registro e inicio de sesión. Contraseñas con scrypt + sal (nunca en texto plano).

import crypto from 'node:crypto';
import { START_PROFILE } from '../shared/constants.js';
import { CONFIG } from './config.js';

const NAME_RE = /^[A-Za-z0-9_]{3,16}$/;

function scrypt(pass, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(pass, salt, 32, (err, key) => (err ? reject(err) : resolve(key.toString('hex'))));
  });
}

export class Auth {
  constructor(db) {
    this.db = db;
    this.attempts = new Map(); // ip -> {n, t}
  }

  rateLimited(ip) {
    const now = Date.now();
    const a = this.attempts.get(ip);
    if (!a || now - a.t > 60000) { this.attempts.set(ip, { n: 1, t: now }); return false; }
    a.n++;
    return a.n > CONFIG.LOGIN_ATTEMPTS_PER_MIN;
  }

  async register(name, pass, ip) {
    if (this.rateLimited(ip)) return { ok: false, error: 'Demasiados intentos. Espera un minuto.' };
    name = String(name || '').trim();
    pass = String(pass || '');
    if (!NAME_RE.test(name)) return { ok: false, error: 'El nombre debe tener 3-16 letras, números o _ (sin espacios).' };
    if (pass.length < 4 || pass.length > 64) return { ok: false, error: 'La contraseña debe tener entre 4 y 64 caracteres.' };
    if (this.db.getUser(name)) return { ok: false, error: 'Ese nombre ya está registrado.' };
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = await scrypt(pass, salt);
    const profile = structuredClone(START_PROFILE);
    profile.pos = null;
    profile.stats = { deliveries: 0, created: Date.now() };
    this.db.createUser(name, salt, hash, profile);
    return this.issueToken(name);
  }

  async login(name, pass, ip) {
    if (this.rateLimited(ip)) return { ok: false, error: 'Demasiados intentos. Espera un minuto.' };
    const u = this.db.getUser(String(name || '').trim());
    if (!u) return { ok: false, error: 'Usuario o contraseña incorrectos.' };
    const hash = await scrypt(String(pass || ''), u.salt);
    const a = Buffer.from(hash, 'hex'), b = Buffer.from(u.hash, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, error: 'Usuario o contraseña incorrectos.' };
    return this.issueToken(u.name);
  }

  issueToken(name) {
    const token = crypto.randomBytes(24).toString('hex');
    this.db.setToken(token, name.toLowerCase(), CONFIG.TOKEN_DAYS);
    return { ok: true, token, name: this.db.getUser(name).name };
  }
}
