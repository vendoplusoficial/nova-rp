# NOVA RP — GTA Roleplay Lite para navegador móvil

Juego multijugador de roleplay urbano en 3D para celulares (y PC), con identidad propia:
ciudad **Puerto Nova**, controles estilo shooter móvil (joystick + deslizar cámara) y servidor
Node.js con WebSockets.

- **Gráficos:** Three.js (low-poly, una sola textura, geometría fusionada por mosaicos)
- **Física:** Rapier (controlador de personaje) + física de respaldo automática
- **Red:** Node.js + WebSockets, servidor con autoridad y validación anti-trampas
- **Guardado:** archivo `data/db.json` (cuentas, dinero, inventario, trabajo, posición y bici)

---

## 1. Requisitos

- **Node.js 18 o superior** (recomendado la versión LTS): https://nodejs.org
- Una computadora (Windows, macOS o Linux) para el servidor.
- Para jugar: celular Android con **Chrome** (recomendado) o iPhone con Safari, en la **misma red Wi-Fi** que la computadora.

## 2. Instalar y ejecutar (en tu computadora)

1. Descomprime la carpeta `nova-rp`.
2. Abre una terminal **dentro** de la carpeta:
   - Windows: abre la carpeta, escribe `cmd` en la barra de direcciones y pulsa Enter.
   - macOS: clic derecho en la carpeta → *Nuevo terminal en la carpeta*.
3. Instala las dependencias (solo la primera vez, necesita internet):
   ```
   npm install
   ```
4. Inicia el servidor:
   ```
   npm start
   ```
5. Verás algo así:
   ```
   NOVA RP - servidor iniciado
   PC:       http://localhost:3000
   Celular:  http://192.168.1.50:3000   (misma red Wi-Fi)
   ```
6. En la PC abre **http://localhost:3000** para probar con teclado y ratón.

Para detener el servidor: `Ctrl + C` (guarda a todos los jugadores antes de cerrar).

## 3. Probar desde tu celular

1. Conecta el celular a la **misma red Wi-Fi** que la computadora.
2. En Chrome (Android) escribe la dirección **Celular** que mostró la terminal, por ejemplo `http://192.168.1.50:3000`.
3. Crea una cuenta (usuario y contraseña) y pulsa **JUGAR EN PANTALLA COMPLETA**.
4. Gira el teléfono en horizontal.

**Si el celular no carga la página:**
- En Windows, la primera vez que ejecutas `npm start` aparece un aviso del Firewall: pulsa **Permitir acceso** (redes privadas). Si lo cerraste, busca *"Permitir una aplicación a través del Firewall"* y habilita **Node.js**.
- Comprueba que usas la IP que empieza por `192.168.` o `10.` (no `localhost`).
- Algunas redes públicas o de invitados bloquean la comunicación entre dispositivos; usa la red de tu casa o el hotspot del propio celular.

**iPhone:** Safari no permite pantalla completa en páginas web. Para jugar sin barras:
botón **Compartir** → **Agregar a inicio**, y abre *Nova RP* desde el ícono.

**Multijugador:** abre el juego en dos dispositivos (o PC + celular) con cuentas distintas.
El servidor admite hasta 20 jugadores (configurable en `shared/constants.js`, `NET.MAX_PLAYERS`).

### Jugar con amigos fuera de tu Wi-Fi
- **Rápido (túnel):** instala *cloudflared* y ejecuta `cloudflared tunnel --url http://localhost:3000`. Te da una dirección `https://...trycloudflare.com` que puedes compartir. Con HTTPS además funciona la instalación como app (PWA).
- **Permanente:** súbelo a un hosting de Node.js (Render, Railway, Fly.io, un VPS...). Comando de inicio: `npm start`. El puerto se toma de la variable `PORT`. Importante: configura un **disco persistente** para la carpeta `data/` (variable `DATA_DIR`), o las cuentas se borrarán al reiniciar.

## 4. Controles

| Acción | Celular | PC |
|---|---|---|
| Caminar / correr | Joystick izquierdo (empujar al máximo = correr) | W A S D |
| Cámara | Deslizar el dedo en la parte derecha | Ratón (clic para capturar) |
| Esprintar | Botón `»` (activa/desactiva) | Shift |
| Saltar | Botón ↑ | Espacio |
| Agacharse | Botón ↓ | C |
| Apuntar | Botón de mira (tocar = activar/desactivar) | Clic derecho o Q |
| Disparar | Botón grande rojo (mantén y desliza para mover la cámara) | Clic izquierdo |
| Recargar | Botón ⟳ | R |
| Interactuar | Botón verde contextual (aparece cerca de algo) | E |
| Pedir tu bicicleta | Ícono de bici (arriba a la derecha) | G |
| **En bici:** acelerar / frenar / turbo / bajar | Botón ⇧ / ■ / ⚡ / salir — el joystick gira y también pedalea | W / S / Shift / X o E |
| Chat | Ícono de mensaje | Enter |
| Mapa | Tocar el minimapa | M |
| Personaje / inventario | Ícono de bolsa | I |

En **Ajustes** (engrane) puedes cambiar: sensibilidad de cámara y de apuntado, autoapuntado,
distancia de cámara, invertir eje Y, joystick flotante o fijo, modo de apuntar, tamaño y
opacidad de botones, **posición de cada botón** (Personalizar posición de botones), calidad
gráfica, mostrar FPS y volumen. Se guardan en el dispositivo.

## 5. Qué incluye esta Etapa 1 (versión básica funcional)

- **Personaje** con animaciones procedurales fluidas: reposo, caminar, correr, esprintar, agacharse, saltar/caer, apuntar, disparar (retroceso), pedalear e incapacitado.
- **Controles táctiles multitáctiles** (cada dedo independiente), joystick flotante o fijo, cámara libre con seguimiento suave y anti-paredes, autoapuntado suave configurable, botones personalizables.
- **Pantalla completa** (Fullscreen API + bloqueo horizontal), **PWA** para iPhone, sin zoom ni desplazamiento accidental, aviso para girar el teléfono.
- **Mapa de Puerto Nova** (~1.5 × 1.2 km), reconstruido desde cero siguiendo el plano de referencia y generado de forma determinista (igual en cliente y servidor):
  - **Geografía:** tierra firme rodeada de mar, sierra con montañas al noroeste, lomas y bajadas, presa con lago y cascada al norte, río hacia el mar, playas al este y al sur, costa rocosa, y cuatro islas: Isla del Faro (puente), isla del sur, Isla Prisión (puente) e isla del faro este. Una valla invisible sigue la orilla.
  - **Orden de construcción** (como lo pide el diseño): 1) calles y avenidas, 2) manzanas, 3) terrenos y lotes, 4) casas, edificios y negocios, 5) señales, vegetación y decoración.
  - **Red vial conectada y sin calles cortadas:** Anillo Periférico, Av. Juárez, Av. Reforma, Av. del Sol, Calzada Oriente, Av. Poniente, Malecón Costa Azul, Malecón del Sur, Av. del Aeropuerto, carreteras de montaña (Presa, Sierra, Poniente), Camino Real de las Lomas, 3 glorietas (monumento, fuente y jardín) y puentes a las islas. Cada barrio tiene su propia trama de calles (rectas en el centro, onduladas en las colonias). Semáforos en los cruces con avenidas y señales de ALTO en los cruces de barrio.
  - **Manzanas llenas:** cada manzana se divide en lotes de frente a la calle (esquinas con comercio), y el centro de la manzana se aprovecha con patios, estacionamientos, parques de barrio, canchas o huertas.
  - **Barrios:** Centro Urbano (torres, oficinas, Plaza Central con kiosco, catedral, hospital, comisaría, banco, palacio municipal, juzgado, bomberos), Zona Comercial (plaza comercial, agencia de autos, talleres, armería, gasolineras, Centro de Trabajos, mercado), Barrio Jardines (clase media), Barrio Popular Las Flores (casas con tinaco, tienditas, cancha, parroquia), Zona Residencial Sur (gimnasio), Zona Sur (terminal de autobuses), Zona Costera (malecón, hoteles, discoteca, muelle), Zona de Playa Sur, Zona Industrial (fábricas, bodegas, reciclaje) con puerto de carga, Aeropuerto, Zona Exclusiva Las Lomas (mansiones y club de golf), Presa y Lago, y Zona de Montañas (mina, granja, casas de campo).
  - **Zonas seguras:** se aparece en la Plaza Central. Ahí, y en hospital, parques, plaza comercial, terminal, escuela, iglesias, club, faro, presa, mirador y las dos playas, no se puede disparar (aviso "ZONA SEGURA" en pantalla y círculos verdes en el mapa).
  - **Gráficos:** las ventanas, puertas, cocheras y vitrinas salen de una textura pintada por código al iniciar (no se descarga nada).
- **Bicicleta** gratuita: se pide desde el menú, conducción arcade con inclinación en curvas, se queda estacionada y se guarda.
- **Trabajo de Repartidor:** tomar el trabajo en el Centro de Trabajos (zona comercial) → recoger el pedido en un negocio → entregarlo en una casa → cobrar. Pago según distancia.
- **Multijugador:** registro/inicio de sesión, sincronización de posición, animación, apuntado y bici, chat con comandos, dinero, salud, inventario (agua y sándwich curan), nombres sobre los jugadores.
- **Combate básico:** pistola, daño validado en el servidor, zonas seguras (no se puede disparar), incapacitado → reaparición en el hospital.
- **Anti-trampas:** el servidor rechaza teletransportes, velocidades imposibles, posiciones dentro de edificios, entregas demasiado rápidas, disparos sin línea de visión o fuera de rango, y uso de objetos que no tienes.
- **Rendimiento:** objetivo 30+ FPS en gama media. Resolución adaptativa automática y niebla y distancia de dibujado según la calidad. La ciudad se carga por mosaicos de 64 m con dos niveles de detalle, y los objetos pequeños solo aparecen cerca. Cada mosaico se dibuja con pocas llamadas, porque la geometría está fusionada y los letreros comparten una sola textura.

Comandos de chat: `/ayuda`, `/jugadores`, `/dinero`, `/bici`, `/trabajo`, `/dejartrabajo`.

## 6. Hoja de ruta (próximas etapas)

| Etapa | Contenido |
|---|---|
| **1 (esta)** | Personaje, controles, cámara, ciudad, bici, multijugador, repartidor, combate básico |
| 2 | Motocicleta y automóvil (generalizar `BikeController` a `VehicleController`), concesionario, gasolina |
| 3 | Fabricante de armas: recolectar piezas, fabricar y vender en la Armería; compra de armas |
| 4 | Médico: atender y revivir incapacitados (alargar el tiempo de incapacitado y botón "pedir médico"), traslado al hospital, cobro de servicios |
| 5 | Policía: patrullar, esposar, trasladar a la Cárcel (`city.pois.jail` ya existe), condenas |
| 6 | Interiores de casas, propiedades, base de datos SQLite/PostgreSQL, panel de administración |

## 7. Estructura del proyecto

```
nova-rp/
├─ package.json            dependencias y comandos (npm start, npm test)
├─ server/                 SERVIDOR (Node.js)
│  ├─ index.js             HTTP + API de cuentas + WebSocket
│  ├─ game.js              mundo: jugadores, vehículos, combate, chat, anti-trampas
│  ├─ auth.js              registro / inicio de sesión (scrypt + token)
│  ├─ db.js                guardado en data/db.json (atómico)
│  ├─ static.js            sirve el cliente, three.js y rapier (con gzip)
│  ├─ config.js            puerto, carpeta de datos, autoguardado
│  └─ jobs/delivery.js     trabajo de repartidor (validado en servidor)
├─ shared/                 CÓDIGO COMÚN cliente-servidor
│  ├─ constants.js         velocidades, límites anti-trampas, objetos, trabajos
│  ├─ city.js              generador determinista de la ciudad (orquesta los módulos siguientes)
│  ├─ mapdata.js           EL PLANO: costa, islas, montañas, lago, barrios, avenidas, glorietas, lugares y zonas seguras
│  ├─ terrain.js           mapa de alturas (montañas, lomas, playas, lago, río) y valla del borde
│  ├─ districts.js         barrios, sus colores y paletas
│  ├─ roads.js             avenidas, calles de barrio y conexión de toda la red vial
│  ├─ blocks.js            manzanas (caras cerradas de la red vial) y sus frentes
│  ├─ buildings.js         arquitectura de casas, negocios, oficinas, hoteles, talleres, fábricas
│  ├─ landmarks.js         plaza, hospital, comisaría, armería, mercado, faro…
│  ├─ landmarksExtra.js    banco, ayuntamiento, terminal, aeropuerto, presa, puerto, club, glorietas, patios…
│  ├─ collision.js         rejilla de colisiones con cajas giradas (línea de visión, física de respaldo)
│  └─ rng.js               aleatorio con semilla
├─ client/                 CLIENTE (navegador)
│  ├─ index.html, css/style.css, manifest.webmanifest, sw.js, icons/
│  └─ js/
│     ├─ main.js           inicio de sesión, pantalla completa, carga
│     ├─ game.js           bucle principal y mensajes de red
│     ├─ settings.js       ajustes guardados en el dispositivo
│     ├─ input/input.js    joystick, cámara táctil, botones, teclado/ratón
│     ├─ camera/thirdPerson.js  cámara en tercera persona
│     ├─ entities/         personaje (esqueleto + animación), jugador local,
│     │                    jugadores remotos (interpolación), bici, vehículos
│     ├─ combat/weapon.js  pistola, autoapuntado, efectos
│     ├─ world/            render por mosaicos (cityRenderer), geometría, objetos (props),
│     │                    piezas de edificios (parts), marcadores
│     ├─ engine/           render (calidad adaptativa), física (Rapier/respaldo), audio
│     ├─ net/network.js    WebSocket con reconexión automática
│     ├─ jobs/             lógica de trabajos en el cliente
│     └─ ui/               HUD, minimapa, chat, paneles, íconos
└─ tools/                  pruebas automáticas (npm test)
```

### Cómo agregar cosas (para futuras etapas)
- **Nuevo trabajo:** crea `server/jobs/<trabajo>.js` (como `delivery.js`), regístralo en `World.jobs` (`server/game.js`), añade los mensajes en `World.handle`, y la parte visual en `client/js/jobs/`.
- **Nuevo vehículo:** define sus números en `shared/constants.js` (`VEHICLES` y `LIMITS.MAX_VEHICLE_SPEED`), crea su modelo y controlador en `client/js/entities/`, y permite su tipo en el servidor (`VEH_CODE`).
- **Cambiar la ciudad:** cliente y servidor usan el mismo generador, así que siempre coinciden. Después de cualquier cambio, ejecuta `npm test`.
  - Plano (costa, barrios, avenidas, lugares, zonas seguras): `shared/mapdata.js`. Las coordenadas están en píxeles del plano de referencia y `P(px, py)` las convierte a metros.
  - Reglas de cada barrio (qué se construye en cada lote): `chooseArch` en `shared/city.js`.
  - Forma de los lugares: `shared/landmarks.js` y `shared/landmarksExtra.js`.
  - Nuevos tipos de edificio: `shared/buildings.js`.

## 8. Pruebas automáticas

```
npm test
```
Genera la ciudad y verifica que todos los puntos de aparición, recogida y entrega sean
accesibles; luego levanta un servidor de prueba con jugadores-bot y comprueba registro,
sincronización, anti-trampas, chat, bicicleta, trabajo, combate y guardado.

## 9. Solución de problemas

| Problema | Solución |
|---|---|
| La terminal dice *Falta three.js* | Ejecuta `npm install` dentro de la carpeta del proyecto. |
| Pantalla negra en el celular | Actualiza Chrome. Verifica que WebGL esté activo (chrome://gpu). Prueba calidad *Bajo*. |
| Va lento | Ajustes → Calidad *Bajo*. Cierra otras apps. La calidad *Automática* reduce la resolución sola si bajan los FPS. |
| "Reconectando…" | El servidor se detuvo o perdiste la red; el juego se reconecta solo al volver. |
| El chat dice *física de respaldo* | Rapier no cargó (reinstala con `npm install`). El juego sigue funcionando con colisiones propias. |
| Olvidé mi contraseña | Por ahora no hay recuperación; borra el usuario en `data/db.json` (con el servidor detenido). |

En Ajustes → *Mostrar FPS y ping* verás FPS, latencia, llamadas de dibujo y el motor de física activo.
Desde la consola del navegador, `window.__novarp` da acceso al estado del juego para depurar.
