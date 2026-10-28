// ⚠ SOLO DESARROLLO: teletransporte entre las tres ciudades para explorar el mapa mientras se construye.
// Apagado por defecto. Se activa al arrancar el servidor con:
//   npm run dev:tp            (o  NOVA_DEV_TP=1 npm start)
// Opcional: NOVA_DEV_USERS=ana,beto  → solo esas cuentas lo pueden usar.
// Para quitarlo del juego: borra este archivo, client/js/dev/teleport.js y las líneas marcadas "DEV-TP".

import { CITIES } from '../shared/worldplan.js';
import { playable, regionAt } from '../shared/terrain.js';

const ENABLED = process.env.NOVA_DEV_TP === '1' || process.argv.includes('--dev-tp');
const USERS = (process.env.NOVA_DEV_USERS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const COOLDOWN_MS = 1500;

export class DevTeleport {
  constructor(world) {
    this.world = world;
    this.enabled = ENABLED;
    this.cache = new Map();   // destino -> punto seguro (el mapa es determinista)
    this.dests = CITIES.map((c) => ({ id: c.id, name: c.name }));
    if (this.enabled) console.log(`  ⚠ Teletransporte de desarrollo ACTIVADO${USERS.length ? ` (solo: ${USERS.join(', ')})` : ' (todas las cuentas)'}`);
  }

  allowed(p) { return this.enabled && (!USERS.length || USERS.includes(p.name.toLowerCase())); }

  // tras el "welcome": solo los permitidos reciben la lista de destinos (el cliente muestra el botón)
  onJoin(p) {
    if (this.allowed(p)) this.world.send(p.ws, { t: 'dev', dests: this.dests });
  }

  onTeleport(p, m) {
    if (!this.allowed(p)) return;
    const now = Date.now();
    if (now - (p.lastDevTp || 0) < COOLDOWN_MS) return;
    p.lastDevTp = now;
    const toast = (msg) => this.world.send(p.ws, { t: 'toast', m: msg });
    if (p.dead) return toast('No puedes teletransportarte estando herido.');
    if (p.veh) return toast('Bájate del vehículo para teletransportarte.');
    const city = CITIES.find((c) => c.id === m.to);
    if (!city) return;
    const spot = this.spotFor(city);
    if (!spot) return toast(`No se encontró un lugar seguro en ${city.name}.`);
    // el servidor mueve al jugador: la validación normal de movimiento sigue intacta
    p.x = spot.x; p.y = spot.y; p.z = spot.z; p.ry = spot.ry;
    p.budget = 0; p.lastMoveT = now;
    this.world.send(p.ws, { t: 'dev_tp', x: spot.x, y: spot.y, z: spot.z, ry: spot.ry, name: city.name });
    console.log(`[dev-tp] ${p.name} → ${city.name} (${spot.x.toFixed(0)}, ${spot.z.toFixed(0)})`);
  }

  spotFor(city) {
    if (!this.cache.has(city.id)) {
      // Puerto Nova: alrededor de la Plaza Central; ciudades nuevas: su centro en el plano
      const sp = city.existing && this.world.city.spawnPoints[0];
      const c = sp ? [sp.x, sp.z] : city.center;
      this.cache.set(city.id, findSafeSpot(this.world, c[0], c[1], city.region));
    }
    return this.cache.get(city.id);
  }
}

// Busca en espiral un punto de tierra firme: dentro de la región, lejos del agua, casi plano
// y sin colisionadores (edificios, rocas, postes) en el espacio del personaje.
export function findSafeSpot(world, cx, cz, region) {
  const { city, grid } = world;
  for (let r = 0; r <= 600; r += 6) {
    const n = r === 0 ? 1 : Math.ceil((2 * Math.PI * r) / 6);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (regionAt(x, z) !== region || !playable(x, z, 4)) continue;
      const h = city.height(x, z);
      let ok = true;
      for (let k = 0; k < 8 && ok; k++) {   // pendiente: menos de ~18° en 3 m
        const b = (k / 8) * Math.PI * 2;
        if (Math.abs(city.height(x + Math.cos(b) * 3, z + Math.sin(b) * 3) - h) > 1) ok = false;
      }
      for (let dx = -1.5; dx <= 1.5 && ok; dx += 1.5) for (let dz = -1.5; dz <= 1.5 && ok; dz += 1.5) {
        const g = city.height(x + dx, z + dz);
        for (const y of [0.3, 1, 1.8, 2.6]) if (grid.pointInside(x + dx, g + y, z + dz)) { ok = false; break; }
      }
      if (ok) return { x: Math.round(x * 100) / 100, y: Math.round((h + 0.3) * 100) / 100, z: Math.round(z * 100) / 100, ry: 0 };
    }
  }
  return null;
}
