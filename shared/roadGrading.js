// Proyecta la malla de calles sobre una pendiente acotada antes de colocar los lotes.
// Resuelve también los cruces cercanos: ningún punto fijo de otra calle puede dejar un escalón.
export function settleRoadGrid(hm, maxSlope = 0.05) {
  const { nx, nz, h, mask, res } = hm, ids = [];
  for (let j = 1; j < nz - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const k = j * nx + i;
    if (mask[k]) ids.push(k);
  }
  const before = Float32Array.from(h), limit = maxSlope * res;
  // Envolvente inferior de Lipschitz (Dijkstra multifuente). Convergencia exacta, sin un
  // número arbitrario de pasadas que deje escalones en los encuentros de la sierra.
  const heap = [];
  const push = (k, value) => {
    const item = [value, k]; heap.push(item); let i = heap.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= value) break; heap[i] = heap[p]; i = p; }
    heap[i] = item;
  };
  const pop = () => {
    const out = heap[0], last = heap.pop();
    if (heap.length) {
      let i = 0;
      while (i * 2 + 1 < heap.length) {
        let j = i * 2 + 1;
        if (j + 1 < heap.length && heap[j + 1][0] < heap[j][0]) j++;
        if (heap[j][0] >= last[0]) break;
        heap[i] = heap[j]; i = j;
      }
      heap[i] = last;
    }
    return out;
  };
  for (const k of ids) push(k, h[k]);
  const neighbors = [[-1,1],[1,1],[-nx,1],[nx,1],[-nx-1,Math.SQRT2],[-nx+1,Math.SQRT2],[nx-1,Math.SQRT2],[nx+1,Math.SQRT2]];
  while (heap.length) {
    const [value,k] = pop();
    if (value > h[k] + 0.0001) continue;
    for (const [d,scale] of neighbors) {
      const q = k + d, candidate = value + limit * scale;
      if (!mask[q] || h[q] <= candidate + 0.0001) continue;
      h[q] = candidate; push(q, h[q]);
    }
  }
  // Transición fuera del corredor, en cuatro anillos; no modifica la costa ni el fondo del lago.
  let frontier = ids, seen = Uint8Array.from(mask);
  for (let ring = 0; ring < 4; ring++) {
    const next = [];
    for (const k of frontier) for (const d of [-1, 1, -nx, nx]) {
      const q = k + d;
      if (q < nx || q >= h.length - nx || seen[q] || before[q] < 0.5) continue;
      seen[q] = 1; next.push(q);
      h[q] += (h[k] - before[k]) * 0.65;
    }
    frontier = next;
  }
}
