// Constantes compartidas entre cliente y servidor.
// Cambiar un valor aquí lo cambia en ambos lados (el servidor valida con estos mismos números).

export const GAME_NAME = 'NOVA RP';
export const CITY_NAME = 'Puerto Nova';
export const CITY_SEED = 20261026;
// Sube este número cuando cambie el mapa: los jugadores vuelven a aparecer en la Plaza Central
export const MAP_VERSION = 8;

// Ciclo de horario: un día de juego dura DAY_MINUTES minutos reales. La hora sale del reloj del
// servidor, así todos los jugadores ven la misma hora (madrugada, mañana, día, tarde, tarde-noche, noche).
export const DAY_CYCLE = { DAY_MINUTES: 48, START_HOUR: 9 };
export function gameHour(serverMs) {
  const t = serverMs / (DAY_CYCLE.DAY_MINUTES * 60000);
  return (((t - Math.floor(t)) * 24 + DAY_CYCLE.START_HOUR) % 24 + 24) % 24;
}

export const NET = {
  CLIENT_SEND_HZ: 15,        // estados por segundo que manda el cliente
  SERVER_SNAPSHOT_HZ: 15,    // snapshots por segundo que manda el servidor
  INTERP_DELAY_MS: 120,      // retraso de interpolación para jugadores remotos
  MAX_PLAYERS: 20,
};

// Velocidades en metros/segundo
export const MOVE = {
  WALK: 2.3,
  RUN: 5.0,
  SPRINT: 7.2,
  CROUCH: 1.7,
  JUMP_VELOCITY: 6.0,
  GRAVITY: 19,
  ACCEL_GROUND: 16,
  ACCEL_AIR: 5,
  TURN_SPEED: 12,           // rad/s rotación del cuerpo hacia la dirección de movimiento
  CAPSULE_RADIUS: 0.35,
  CAPSULE_HALF_HEIGHT: 0.55, // altura total = 2*(0.55+0.35) = 1.8 m
};

export const VEHICLES = {
  bike: {
    name: 'Bicicleta',
    maxSpeed: 11,      // ~40 km/h
    boostSpeed: 14.5,  // pedaleo fuerte
    reverseSpeed: 3,
    accel: 6.5,
    brake: 14,
    drag: 0.9,
    steerRate: 2.4,    // rad/s a baja velocidad
    radius: 0.45,
  },
};

// Límites que valida el servidor (anti-trampas)
export const LIMITS = {
  MAX_FOOT_SPEED: MOVE.SPRINT * 1.25,
  MAX_VEHICLE_SPEED: { bike: VEHICLES.bike.boostSpeed * 1.25 },
  MOVE_BUDGET_SECONDS: 2.0,   // tolerancia a lag (segundos acumulables de movimiento)
  CHAT_MAX_LEN: 140,
  CHAT_MIN_INTERVAL_MS: 700,
  INTERACT_RADIUS: 6,
  SHOOT_MAX_RANGE: 70,
  SHOOT_MIN_INTERVAL_MS: 220,
};

export const COMBAT = {
  PISTOL_DAMAGE: 20,
  PISTOL_MAG: 12,
  RELOAD_TIME: 1.4,
  FIRE_INTERVAL: 0.25,
  RESPAWN_SECONDS: 6,
};

export const JOBS = {
  none: { id: 'none', name: 'Desempleado' },
  delivery: { id: 'delivery', name: 'Repartidor' },
  // Próximas etapas: gunsmith (Fabricante de armas), medic (Médico), police (Policía)
};

// Códigos de animación (se sincronizan por red como números)
export const ANIM = {
  IDLE: 0, WALK: 1, RUN: 2, SPRINT: 3, CROUCH: 4, CROUCH_WALK: 5,
  JUMP: 6, FALL: 7, AIM: 8, RIDE: 9, DEAD: 10,
};

export const ITEMS = {
  pistola: { name: 'Pistola', usable: false },
  agua: { name: 'Botella de agua', usable: true, heal: 10 },
  pan: { name: 'Sándwich', usable: true, heal: 20 },
};

export const START_PROFILE = {
  money: 500,
  health: 100,
  job: 'none',
  inv: { pistola: 1, agua: 2, pan: 2 },
  vehicles: [{ type: 'bike', parked: null }],
};
