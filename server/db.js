// Base de datos sencilla en un archivo JSON (data/db.json).
// Suficiente para 10-20 jugadores. En el futuro se puede cambiar por SQLite/PostgreSQL
// sin tocar el resto del servidor: solo hay que mantener esta misma interfaz.

import fs from 'node:fs';
import path from 'node:path';

export class Database {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'db.json');
    this.data = { users: {}, tokens: {} };
    this.saveTimer = null;
    this.load();
  }

  load() {
    fs.mkdirSync(this.dir, { recursive: true });
    if (!fs.existsSync(this.file)) return;
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      this.data.users = parsed.users || {};
      this.data.tokens = parsed.tokens || {};
    } catch (e) {
      const backup = this.file + '.corrupt-' + Date.now();
      fs.copyFileSync(this.file, backup);
      console.error(`[db] db.json dañado, copia guardada en ${backup}. Se inicia vacía.`);
    }
    this.purgeTokens();
  }

  // Guardado atómico: escribe a .tmp y renombra (no se corrompe si se apaga el servidor)
  saveNow() {
    clearTimeout(this.saveTimer); this.saveTimer = null;
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.file);
  }

  save() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => { try { this.saveNow(); } catch (e) { console.error('[db] error al guardar', e); } }, 1000);
  }

  getUser(name) { return this.data.users[name.toLowerCase()] || null; }

  createUser(name, salt, hash, profile) {
    const u = { name, salt, hash, created: Date.now(), profile };
    this.data.users[name.toLowerCase()] = u;
    this.save();
    return u;
  }

  setToken(token, userKey, days) {
    this.data.tokens[token] = { user: userKey, exp: Date.now() + days * 86400000 };
    this.save();
  }

  userByToken(token) {
    const t = this.data.tokens[token];
    if (!t) return null;
    if (t.exp < Date.now()) { delete this.data.tokens[token]; return null; }
    return this.data.users[t.user] || null;
  }

  purgeTokens() {
    const now = Date.now();
    for (const [k, t] of Object.entries(this.data.tokens)) if (t.exp < now) delete this.data.tokens[k];
  }
}
