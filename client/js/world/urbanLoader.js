// Carga en segundo plano las ciudades nuevas (Ciudad Desértica...): el juego arranca solo con Puerto
// Nova y el resto del mundo, y cada ciudad se genera después en un Web Worker y se integra al
// terreno, las calles, los edificios, la física y el minimapa. El servidor ya las tiene desde el inicio.
// Si el navegador no permite workers de módulo, se genera en el hilo principal (pausa breve).

import { URBAN_PLANS } from '/shared/citiesPlan.js';
import { urbanInput, generateUrbanStandalone, mergeUrban } from '/shared/urban.js';

export function loadUrbanCities(game, onDone) {
  const city = game.city;
  const queue = URBAN_PLANS.filter((p) => !city.urban.some((u) => u.id === p.id));
  let worker = null;
  try { worker = new Worker(new URL('./urbanWorker.js', import.meta.url), { type: 'module' }); } catch { worker = null; }

  // se integra en pasos separados (un cuadro cada uno) para no congelar el juego de golpe
  const apply = (pkg, done) => {
    const steps = [];
    let urban, colliderStart;
    steps.push(() => ({ urban, colliderStart } = mergeUrban(city, pkg)));
    steps.push(() => game.physics.addUrban(urban, colliderStart));
    steps.push(() => game.cityRenderer.addUrban(urban, pkg));
    steps.push(() => game.minimap?.refreshWorld());
    const run = () => {
      steps.shift()();
      if (steps.length) setTimeout(run, 16);
      else { console.info(`[mundo] ${urban.name} lista (${pkg.lots.length} lotes)`); done(); }
    };
    run();
  };
  const local = (input) => setTimeout(() => apply(generateUrbanStandalone(input), next), 30);
  const next = () => {
    const plan = queue.shift();
    if (!plan) { worker?.terminate(); onDone?.(); return; }
    const input = urbanInput(city, plan);
    if (!worker) return local(input);
    worker.onmessage = (e) => {
      if (e.data.ok) apply(e.data.pkg, next);
      else { console.warn('[mundo] el worker falló, se genera aquí:', e.data.error); worker.terminate(); worker = null; local(input); }
    };
    worker.onerror = (e) => { console.warn('[mundo] worker no disponible:', e.message); e.preventDefault?.(); worker = null; local(input); };
    worker.postMessage(input);
  };
  next();
}
