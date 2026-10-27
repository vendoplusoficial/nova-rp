# Mapa nuevo de Puerto Nova: estado del trabajo (26 oct 2026)

Reconstrucción del mapa desde cero siguiendo el plano de referencia (montañas, presa y lago, zona exclusiva,
aeropuerto, zona industrial con puerto, centro, barrios, zona comercial, costa, playa sur e islas).

## Cómo se construye (orden obligatorio)
1. **Terreno** (`shared/terrain.js` + `shared/mapdata.js`): tierra firme, islas, sierra, lomas, presa/lago, río, playas, calzadas y muelles.
2. **Calles y avenidas** (`shared/roads.js`): avenidas trazadas a mano por nodos compartidos (curvas que pasan exactamente por los cruces), 3 glorietas y calles de barrio con trama propia. `resolveDeadEnds` + `keepConnected`: ninguna calle suelta.
3. **Manzanas** (`shared/blocks.js`): caras cerradas del grafo vial, encogidas por el ancho de calle + banqueta.
4. **Terrenos**: los lugares importantes ocupan su terreno en la manzana más cercana a su punto del plano, de frente a la avenida; después se reparten lotes a lo largo de cada frente (esquinas con comercio) y el centro de la manzana se aprovecha (patios, estacionamientos, parques, canchas, huertas).
5. **Edificios** según las reglas de cada barrio (`chooseArch` en `shared/city.js`).
6. **Detalles**: semáforos y ALTO en los nodos del grafo vial, faroles por barrio, árboles de banqueta, hidrantes, bancas, autos estacionados, playa (sombrillas, salvavidas, palapas) y bosques en la sierra.

## Zonas seguras y aparición
- `SAFE_ZONES` en `shared/mapdata.js`. Se aparece en la Plaza Central (zona segura).
- Servidor: no procesa disparos desde una zona segura ni hace daño a quien está en una.
- Cliente: aviso "ZONA SEGURA" y botones de arma atenuados; círculos verdes en el mapa.
- `MAP_VERSION` (constants.js): al cambiarlo, los jugadores guardados reaparecen en la plaza y su bici vuelve a casa.

## Pendiente (siguientes etapas)
- Trabajos nuevos en los lugares (aeropuerto, puerto, mina, granja, taller...). Hoy solo existen las estructuras.
- Interiores.
- Más calles internas en la Zona Exclusiva (las lomas son muy empinadas; hoy las mansiones están sobre el Camino Real y el Paseo de los Pinos).
