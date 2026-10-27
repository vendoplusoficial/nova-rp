// Trabajo: REPARTIDOR
// Flujo: tomar trabajo en la Central de Repartos -> recoger pedido en un negocio ->
// entregarlo en una casa -> cobrar -> siguiente pedido.
// Todo se valida en el servidor (distancia real y tiempo mínimo de viaje).

import { LIMITS } from '../../shared/constants.js';

const dist2d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export class DeliveryJob {
  constructor(city) {
    this.city = city;
    this.id = 'delivery';
    this.name = 'Repartidor';
  }

  canTake(player) {
    const jc = this.city.pois.jobcenter;
    return dist2d(player, jc) <= LIMITS.INTERACT_RADIUS * 1.6;
  }

  newTask(player) {
    const { pickups, drops } = this.city;
    const near = pickups.filter((p) => { const d = dist2d(p, player); return d > 40 && d < 420; });
    const pickup = (near.length ? near : pickups)[Math.floor(Math.random() * (near.length || pickups.length))];
    const far = drops.filter((d) => { const dd = dist2d(d, pickup); return dd > 110 && dd < 480; });
    const pool = far.length ? far : drops;
    const drop = pool[Math.floor(Math.random() * pool.length)];
    const d = dist2d(pickup, drop);
    return {
      job: 'delivery', stage: 'pickup',
      pickup: { x: pickup.x, z: pickup.z, name: pickup.name },
      drop: { x: drop.x, z: drop.z, name: drop.label },
      pay: Math.round(45 + d * 0.22),
      dist: Math.round(d),
      pickedAt: 0,
    };
  }

  // Devuelve {ok, msg, pay?}
  pickup(player, task) {
    if (!task || task.stage !== 'pickup') return { ok: false, msg: 'No tienes un pedido por recoger.' };
    if (dist2d(player, task.pickup) > LIMITS.INTERACT_RADIUS) return { ok: false, msg: 'Acércate al negocio para recoger el pedido.' };
    task.stage = 'deliver';
    task.pickedAt = Date.now();
    return { ok: true, msg: `Pedido recogido en ${task.pickup.name}. Llévalo a ${task.drop.name}.` };
  }

  deliver(player, task) {
    if (!task || task.stage !== 'deliver') return { ok: false, msg: 'No llevas ningún pedido.' };
    if (dist2d(player, task.drop) > LIMITS.INTERACT_RADIUS) return { ok: false, msg: 'Acércate a la puerta para entregar.' };
    const minTime = (task.dist / LIMITS.MAX_VEHICLE_SPEED.bike) * 1000 * 0.8;
    if (Date.now() - task.pickedAt < minTime) return { ok: false, msg: 'Entrega rechazada (demasiado rápida).' };
    return { ok: true, pay: task.pay, msg: `¡Entrega completada! +$${task.pay}` };
  }
}
