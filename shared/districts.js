// Barrios de Puerto Nova (zonas del plano de referencia). Cada barrio tiene su propia trama de
// calles, tamaño de lote, arquitectura, paleta de colores y vegetación.

import { ZONES, WORLD } from './mapdata.js';
import { pointInPoly } from './terrain.js';

export const DISTRICTS = {
  centro: { id: 'centro', name: 'Centro Urbano', mapColor: '#7d8696', trees: ['laurel', 'palm', 'laurel'] },
  comercial: { id: 'comercial', name: 'Zona Comercial', mapColor: '#8d8a9a', trees: ['palm', 'laurel', 'round'] },
  media: { id: 'media', name: 'Barrio Jardines (clase media)', mapColor: '#8aa07a', trees: ['jacaranda', 'round', 'round', 'oak'] },
  popular: { id: 'popular', name: 'Barrio Popular Las Flores', mapColor: '#a99079', trees: ['round', 'palm'] },
  residencial: { id: 'residencial', name: 'Zona Residencial Sur', mapColor: '#93a586', trees: ['round', 'jacaranda', 'palm'] },
  sur: { id: 'sur', name: 'Zona Sur', mapColor: '#9a948a', trees: ['palm', 'round'] },
  costa: { id: 'costa', name: 'Zona Costera', mapColor: '#c9b68a', trees: ['palm'] },
  puerto: { id: 'puerto', name: 'Puerto', mapColor: '#7f8186', trees: [] },
  playa: { id: 'playa', name: 'Zona de Playa Sur', mapColor: '#d6c493', trees: ['palm'] },
  industrial: { id: 'industrial', name: 'Zona Industrial', mapColor: '#85858a', trees: [] },
  aeropuerto: { id: 'aeropuerto', name: 'Aeropuerto', mapColor: '#8f9399', trees: [] },
  exclusiva: { id: 'exclusiva', name: 'Zona Exclusiva Las Lomas', mapColor: '#88a876', trees: ['palm', 'pine', 'round'] },
  presa: { id: 'presa', name: 'Presa y Lago', mapColor: '#6f9a64', trees: ['pine', 'oak'] },
  montana: { id: 'montana', name: 'Zona de Montañas', mapColor: '#6a8a58', trees: ['pine', 'oak'] },
  isla: { id: 'isla', name: 'Isla del Faro', mapColor: '#7d9f6a', trees: ['palm', 'oak'] },
  prision: { id: 'prision', name: 'Isla Prisión', mapColor: '#8a8a80', trees: [] },
  campo: { id: 'campo', name: 'Campo', mapColor: '#6f8f5c', trees: ['oak', 'pine'] },
};

// Barrio en un punto (búsqueda en una rejilla de 8 m precalculada)
const CELL = 8;
const GX = Math.ceil((WORLD.x1 - WORLD.x0) / CELL) + 1, GZ = Math.ceil((WORLD.z1 - WORLD.z0) / CELL) + 1;
const IDS = Object.keys(DISTRICTS);
let grid = null;
function build() {
  grid = new Uint8Array(GX * GZ);
  const campo = IDS.indexOf('campo');
  for (let j = 0; j < GZ; j++) for (let i = 0; i < GX; i++) {
    const x = WORLD.x0 + i * CELL, z = WORLD.z0 + j * CELL;
    let id = campo;
    for (const zn of ZONES) if (pointInPoly(zn.pts, x, z)) { id = IDS.indexOf(zn.id); break; }
    grid[j * GX + i] = id;
  }
}
export function districtAt(x, z) {
  if (!grid) build();
  const i = Math.round((x - WORLD.x0) / CELL), j = Math.round((z - WORLD.z0) / CELL);
  if (i < 0 || j < 0 || i >= GX || j >= GZ) return 'campo';
  return IDS[grid[j * GX + i]];
}

// Paletas por estilo de arquitectura
export const PALETTES = {
  humilde: [0xe57373, 0xf06292, 0x4fc3f7, 0x81c784, 0xffd54f, 0xffb74d, 0xba68c8, 0x4db6ac, 0xf5f5dc, 0xaed581, 0xff8a65, 0x90caf9],
  medio: [0xf3e5d0, 0xe8d5b5, 0xd7c4a3, 0xcfd8dc, 0xe6ccb2, 0xd9e4d0, 0xf0e2c8, 0xc9b9a6, 0xe9d8c4, 0xdfe7ec],
  medioRoof: [0x6b5a4e, 0x5a4a40, 0x7d4a36, 0x4f5459, 0x8a5a44, 0x6e6259, 0x7a3f30],
  exclusivo: [0xf7f4ee, 0xece7df, 0xe3ddd3, 0xd8d3cb, 0xf2ece1],
  hacienda: [0xf4ead9, 0xefe0c6, 0xe9d6b8],
  comercial: [0xe9dcc6, 0xdccbb0, 0xf0e6d6, 0xd9c2a3, 0xcfc7bb, 0xe3d3bd, 0xc9b49a, 0xbfc7c9, 0xd8cfc0],
  torre: [0x8fa3b8, 0x9db4c0, 0x7d8fa3, 0xb0bec5, 0xa3b5c7, 0x6f8499, 0xc5cdd3, 0x94a7a0, 0xa9a29a, 0x8c9eb0],
  industrial: [0x8a8d8f, 0x9e9a8f, 0x7b8a8b, 0x8f8a80, 0xa0a4a6],
  rural: [0xe8dcc0, 0xd9c7a2, 0xc8a27a, 0xb5895f, 0xf0e6d0],
};
