// Plano urbano de las ciudades nuevas (coordenadas del mundo, metros). Lo usa shared/urban.js.
// Cada ciudad: su malla fina (box, alineada a mosaicos de 64 m), el periférico que la rodea
// (ya construido en highways.js), avenidas diseñadas a mano, glorietas, barrios con su trama de
// calles (mismos tipos de barrio que Puerto Nova) y lugares importantes.

// Ciudad Desértica: llanura entre 7 y 10 m. Cinco avenidas salen de la Glorieta del Sol hacia el
// periférico (aeropuerto, mina, oasis); centro de edificios medianos, comercio a lo largo del
// bulevar, barrios residenciales al sur y al noreste, colonia popular al noroeste, zona industrial
// al sureste (junto al camino minero) y residencias amplias al norte.
const DESIERTO = {
  id: 'desierto', name: 'Ciudad Desértica', ring: 'P-desierto', seed: 7101,
  box: { x0: 576, z0: -3008, x1: 1984, z1: -1792 },
  center: [1275, -2397],
  mains: [
    { name: 'Bulevar del Sol', cls: 'boulevard', pts: [[560, -2440], [900, -2415], [1275, -2397], [1640, -2372], [2000, -2345]] },
    { name: 'Av. de las Dunas', cls: 'avenida', pts: [[1265, -3020], [1285, -2700], [1275, -2397], [1250, -2100], [1225, -1760]] },
    { name: 'Av. del Aeropuerto', cls: 'avenida', pts: [[1275, -2397], [1520, -2475], [1740, -2525], [2000, -2545]] },
    { name: 'Calzada Minera', cls: 'avenida', pts: [[1275, -2397], [1470, -2245], [1680, -2070], [2000, -1880]] },
    { name: 'Av. del Oasis', cls: 'avenida', pts: [[1275, -2397], [1080, -2580], [860, -2790], [620, -3010]] },
  ],
  roundabouts: [{ at: [1275, -2397], r: 26, name: 'Glorieta del Sol', deco: 'fuente' }],
  zones: [
    { id: 'centro', pts: [[1060, -2580], [1290, -2640], [1500, -2575], [1530, -2280], [1290, -2200], [1060, -2250]] },
    { id: 'comercial', pts: [[600, -2560], [1060, -2580], [1060, -2250], [600, -2290]] },
    { id: 'comercial', pts: [[1500, -2575], [1960, -2490], [1960, -2300], [1530, -2280]] },
    { id: 'popular', pts: [[590, -3000], [1080, -3000], [1060, -2580], [600, -2560]] },
    { id: 'exclusiva', pts: [[1080, -3000], [1520, -3000], [1500, -2575], [1290, -2640], [1060, -2580]] },
    { id: 'media', pts: [[1520, -3000], [1970, -3000], [1960, -2490], [1500, -2575]] },
    { id: 'residencial', pts: [[600, -2290], [1060, -2250], [1290, -2200], [1250, -1790], [590, -1790]] },
    { id: 'industrial', pts: [[1290, -2200], [1530, -2280], [1960, -2300], [1970, -1790], [1250, -1790]] },
  ],
  // trama de cada barrio: orientación (grados), separación entre calles, ancho, banqueta, ondulación
  rules: {
    centro: { angle: -3, spacing: [70, 62], w: 10, sw: 3.5, warp: 0 },
    comercial: { angle: -4, spacing: [96, 80], w: 11, sw: 3, warp: 0 },
    popular: { angle: 14, spacing: [52, 44], w: 7, sw: 1.6, warp: 5 },
    exclusiva: { angle: 30, spacing: [120, 100], w: 7.5, sw: 1.6, warp: 18 },
    media: { angle: -20, spacing: [74, 60], w: 8.5, sw: 2.5, warp: 8 },
    residencial: { angle: 8, spacing: [66, 54], w: 8, sw: 2.2, warp: 9 },
    industrial: { angle: 32, spacing: [110, 96], w: 11, sw: 1.5, warp: 0 },
  },
  sites: [
    { id: 'des_plaza', kind: 'plaza', name: 'Plaza del Desierto', at: [1340, -2330], hx: 36, hz: 30 },
    { id: 'des_parque', kind: 'parque', name: 'Parque Los Cactus', at: [1300, -2800], hx: 34, hz: 28 },
  ],
};

export const URBAN_PLANS = [DESIERTO];
