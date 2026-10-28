# Instrucciones para asistentes de IA (ChatGPT / Codex / otros)

Este archivo lo leen automáticamente los agentes de código (por ejemplo Codex) al trabajar en
este repositorio. Describe cómo está hecho el proyecto y las reglas para modificarlo.

## Proyecto
**Nova RP**: juego multijugador de roleplay urbano 3D para navegadores móviles (prioridad Android/Chrome).
- Cliente: Three.js 0.170 (módulos ES sin empaquetador, `client/index.html` usa un *import map*).
- Física: `@dimforge/rapier3d-compat` con respaldo propio (`client/js/engine/physics.js`).
- Servidor: Node.js ≥18 + `ws`. Sin frameworks. Datos en `data/db.json`.
- Código común en `shared/` (lo importan cliente y servidor): constantes, generador de ciudad, colisiones.
- Idioma: comentarios, textos de la interfaz y mensajes en **español**.

## Comandos
- Instalar: `npm install`
- Ejecutar: `npm start` → http://localhost:3000
- Pruebas: `npm test` (deben pasar antes de terminar cualquier cambio)

## Arquitectura (resumen)
- `server/game.js` (`World`): autoridad sobre dinero, salud, inventario, trabajo, vehículos y combate.
  Valida el movimiento con un "presupuesto" de distancia por velocidad máxima (`LIMITS` en `shared/constants.js`).
- Protocolo JSON por WebSocket (`t` = tipo). Cliente→servidor: `hello, st, chat, veh_spawn, veh_enter, veh_exit,
  job_take, job_quit, job_pickup, job_deliver, shoot, use, ping`. Servidor→cliente: `welcome, snap, pj, pl, chat,
  toast, money, health, inv, corr, vadd, vupd, vdel, venter, vexit, job, shot, hitok, dead, respawn, kicked, pong`.
- `snap` = `[id, x, y, z, ry, anim, vehículo, velocidad]`; `anim` usa bits 0-3 para la animación (`ANIM`) y el bit 4 (16) para "apuntando".
- `client/js/game.js` (`Game`): bucle principal y manejadores de red.
- Ciudad: `shared/mapdata.js` es el plano (costa, islas, barrios, avenidas, lugares, zonas seguras).
  `shared/city.js` construye en este orden: terreno (`terrain.js`) → calles (`roads.js`) → manzanas (`blocks.js`)
  → lotes y lugares → edificios (`buildings.js`, `landmarks.js`, `landmarksExtra.js`) → señales y vegetación
  (Puerto Nova en `city.js`; bosques, campo y desierto de las regiones nuevas en `vegetation.js`).
  No coloques edificios sueltos: todo lote pertenece a una manzana (o a una carretera fuera de la ciudad). Los edificios se describen como "piezas"
  en coordenadas locales del lote (+Z mira a la calle); las colisiones son cajas giradas (OBB).
- Render en `client/js/world/cityRenderer.js`:
  - Mosaicos de 64 m, cada uno con una capa base (nivel de detalle cercano o lejano) y una capa de detalle (solo a menos de 150 m).
  - Geometría fusionada con `GeoBuilder` y piezas dibujadas en `parts.js`.
  - No crear un Mesh por objeto decorativo.
- Personaje: `SkinnedMesh` suave construido en `client/js/entities/humanMesh.js` (secciones elípticas con pesos en codos y rodillas), con animación procedural en `character.js`.
- Texturas: un solo atlas pintado por código (`client/js/world/atlas.js`) para ventanas, puertas y fachadas. Las fachadas usan `f:` en las piezas `box` (`glassBlue`, `apt`, `hotel`, `officePunch`...) y se dibujan en `parts.js`.
- Calles: `resolveDeadEnds` (`shared/roads.js`) prolonga, une o recorta las calles sueltas y `keepConnected` quita lo que no se une al Anillo Periférico. `npm test` verifica que no haya calles sin conexión.
- Red vial entre regiones: `shared/highways.js` (trazo con radio mínimo, rasante con pendiente máxima, nivelación
  del terreno, puentes que se pueden pisar: `city.surface` y `playable` los incluyen). Las salidas de Puerto Nova
  se buscan con `shared/routing.js` (A* que esquiva lotes, sitios y calles). Dibujo en `client/js/world/highwayRenderer.js`.
  `npm test` incluye `tools/test-roads.js` (pendientes, curvas, cruces, colisiones y suelo continuo en cada vía).
  Túneles: `road.tunnel`, `city.inTunnel` y `city.surface(x, z, y)` (piso del túnel si estás dentro); el terreno
  grueso tiene huecos solo en las bocas (`highways.holes`), que el dibujo y la física omiten.
- Ciudades nuevas (Ciudad Desértica; después Montañosa y los pueblos): plano en `shared/citiesPlan.js` (avenidas,
  glorietas, barrios con su trama, lugares) y generador en `shared/urban.js`, que reutiliza calles, manzanas, lotes y
  edificios de Puerto Nova con su propia `RoadNet` (`city.urban[i].net`, `city.netAt(x, z)`) y su propia malla fina de
  4 m (`city.world.extra`). Sus lotes, lugares y retornos van en `city.lots/sites/caps` con `city: '<id>'`.
  El servidor las genera al arrancar; el cliente arranca sin ellas (`getCity(seed, { urban: false })`) y las genera
  en un Web Worker (`client/js/world/urbanLoader.js` + `urbanWorker.js`). `npm test` verifica que ambas salgan idénticas.
- Zonas seguras: `city.safeZones` (servidor: `inSafeZone`; cliente: `safeZoneAt`). Si cambias el mapa, sube `MAP_VERSION` para que todos reaparezcan en la Plaza Central.

## Teletransporte de desarrollo (temporal)
- `npm run dev:tp` (o `NOVA_DEV_TP=1 npm start`) muestra el botón **DEV · Viajar** para ir a Puerto Nova,
  Ciudad Montañosa o Ciudad Desértica. Apagado por defecto; `NOVA_DEV_USERS=nombre1,nombre2` lo limita a esas cuentas.
- El servidor elige el punto seguro (`server/devTeleport.js`); el cliente solo pide (`client/js/dev/teleport.js`).
- Para quitarlo: borra esos dos archivos, las líneas marcadas `DEV-TP`, el script `dev:tp` y esta sección.

## Reglas
1. **Prioridad absoluta: controles fluidos y 30 FPS estables en celulares de gama media.**
   No añadir sombras dinámicas, post-procesado, texturas grandes ni modelos pesados.
2. Todo lo que afecte dinero, salud, inventario, trabajo, vehículos o daño se **valida en el servidor**.
   El cliente solo pide; nunca decide.
3. Mantener el código modular: un sistema por archivo. No volver a juntar todo en un solo archivo.
4. Constantes de juego en `shared/constants.js` (así cliente y servidor usan los mismos números).
5. Si cambias el generador de ciudad (`shared/*.js`), ejecuta `npm test` (verifica que nada quede bloqueado).
6. Mostrar texto de jugadores siempre con `textContent` (nunca `innerHTML`).
7. Probar en móvil: pantalla horizontal, multitáctil, sin zoom ni desplazamiento.

## Próximas etapas previstas
2) Moto y auto (generalizar `BikeController`), 3) Fabricante de armas, 4) Médico, 5) Policía, 6) interiores y base de datos real.
