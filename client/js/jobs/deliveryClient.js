// Trabajo de Repartidor (lado cliente): muestra objetivo, marcador y decide la acción contextual.
// El servidor valida cada paso; aquí solo guiamos al jugador.

export class DeliveryClient {
  constructor(game) {
    this.game = game;
  }

  // Punto objetivo actual o null
  target() {
    const me = this.game.me;
    if (me.job !== 'delivery' || !me.task) return null;
    return me.task.stage === 'pickup' ? me.task.pickup : me.task.drop;
  }

  objective(px, pz) {
    const me = this.game.me;
    const jc = this.game.city.pois.jobcenter;
    if (me.job !== 'delivery') {
      const d = Math.round(Math.hypot(jc.x - px, jc.z - pz));
      if (d < 6) return ['Centro de Trabajos', 'Toca TRABAJAR para empezar como Repartidor'];
      return ['Consigue trabajo', `Centro de Trabajos (marcador naranja) · ${d} m`];
    }
    const t = me.task;
    if (!t) return ['Repartidor', 'Esperando pedido…'];
    const p = this.target();
    const d = Math.round(Math.hypot(p.x - px, p.z - pz));
    if (t.stage === 'pickup') return [`Recoge el pedido · $${t.pay}`, `${t.pickup.name} · ${d} m`];
    return ['Entrega el pedido', `${t.drop.name} · ${d} m`];
  }

  // Acción contextual cerca del objetivo
  interaction(px, pz) {
    const t = this.target();
    if (!t) return null;
    if (Math.hypot(t.x - px, t.z - pz) > 4.5) return null;
    const stage = this.game.me.task.stage;
    if (stage === 'pickup') return { label: 'Recoger pedido', run: () => this.game.net.send({ t: 'job_pickup' }) };
    return { label: 'Entregar pedido', run: () => this.game.net.send({ t: 'job_deliver' }) };
  }
}
