# Plano maestro insular de Nova RP

Referencia visual: **Distrito costero tropical desarrollado.png** (1536 × 1024 píxeles).
El trazado es una adaptación manual de esa imagen, no una reconstrucción exacta de cada edificio o calle.

## Escala y orientación

- Área del mundo: 6000 × 6000 metros, con límites X/Z de −3000 a +3000.
- Un metro del juego equivale a un metro del plano.
- Escala uniforme: 6000 / 1536 = 3.90625 metros por píxel en ambos ejes.
- X positivo al este; Z positivo al sur; Y positivo hacia arriba; mar en Y = 0.
- La imagen ocupa 6000 × 4000 metros centrados en el mundo. El espacio restante es mar: no se deforma la referencia para volverla cuadrada.
- Conversión: `M(px, py) = [(px − 768) × 3.90625, (py − 512) × 3.90625]`.
- `unM(x, z)` realiza la transformación inversa.

## Geografía y calles

`shared/masterMap.js` contiene la costa de la isla principal, la isla suroeste y tres islotes, el contorno del lago oriental, su desagüe, cuatro cruces transitables de agua, muelles, playas, cinco sierras/estribaciones y cinco colinas.

Las 27 vías exteriores se trazaron mediante puntos de control. Incluyen las autopistas del Norte y del Lago, caminos de sierra, rutas alrededor del lago, el circuito oriental y el acceso a la isla. Las curvas pasan por sus puntos de control y se integran a la red vial común.

`shared/mapdata.js` adapta los barrios y servicios existentes al núcleo costero de la referencia. Conserva su generador de calles locales y de manzanas, así como los modelos de edificios. Esta parte es una adaptación del núcleo urbano anterior: las calles locales no son una vectorización exacta de la imagen. El aeropuerto, puerto, faro, prisión, mina y otros servicios tienen nuevas posiciones para evitar que aparezcan en el mar o bloqueen las vías.

El antiguo esquema de tres islas/regiones separadas queda sustituido por distritos de la misma isla. Los identificadores `costera`, `montana` y `desierto` se mantienen para compatibilidad con el teletransporte de desarrollo; el último ahora identifica el Distrito Oriental, que tiene vegetación y no es un desierto.

## Relieve, circulación y materiales

1. La malla de 4 m genera la costa, cuencas y relieve con crestas fractales; las carreteras se nivelan antes de colocar lotes.
2. `shared/roadGrading.js` limita las diferencias de altura entre celdas de calle con una envolvente de Lipschitz y suaviza la transición al terreno vecino. Evita los escalones que dejaban los encuentros entre caminos de la sierra.
3. El terreno y las calles siguen siendo compartidos por servidor y cliente. Las barreras de agua siguen activas y los accesos a las islas son transitables.
4. `client/js/world/surfaceMaterials.js` crea una textura RGBA de 128 × 128 píxeles para hierba, roca, arena y asfalto. La proyección mundial triplanar evita costuras en las laderas. Usa mipmaps y anisotropía limitada.
5. La geometría sigue fusionada por mosaicos de 64 m, con detalle cercano y lejano. No hay sombras dinámicas ni objetos individuales para dibujar cada hoja o piedra.
6. El minimapa usa una sola capa de aproximadamente 1320 × 1320 píxeles para limitar la memoria del canvas en móviles.

Se incrementa `MAP_VERSION` a 8 para que los perfiles existentes reaparezcan en la plaza después de cambiar las coordenadas.

## Verificación y límites

- `npm test` valida la escala, los límites y regiones del plano; las apariciones, servicios, calles conectadas y lotes; ambos carriles de cada vía exterior; y el servidor con jugadores simulados.
- `tools/test-roads.js` comprueba cada vía exterior cada 4 m en tres posiciones laterales: tierra transitable, suelo sobre el agua, obstáculos y pendientes.
- El rendimiento en un Android físico y la fidelidad visual respecto de la ilustración requieren revisión en dispositivo. Una captura o una prueba en Chromium no garantizan 30 FPS en todos los teléfonos.

El comando `node tools/plan-world.js docs/plan-mundo.svg` genera un plano técnico de las polilíneas. Ese SVG es un diagnóstico del código; la referencia artística sigue siendo la imagen original.
