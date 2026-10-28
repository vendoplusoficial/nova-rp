// Web Worker: genera una ciudad nueva (Ciudad Desértica...) sin trabar el juego.
// Recibe el plano y las alturas del área (urbanInput) y devuelve datos simples (generateUrbanStandalone).

import { generateUrbanStandalone } from '/shared/urban.js';

self.onmessage = (e) => {
  try {
    const pkg = generateUrbanStandalone(e.data);
    self.postMessage({ ok: true, pkg }, [pkg.hm.h.buffer, pkg.hm.mask.buffer]);
  } catch (err) {
    self.postMessage({ ok: false, error: String(err && err.stack || err) });
  }
};
