# FASE 1 — Rendimiento del Motor 3D, WebGL y Memoria GPU

> **Objetivo de la fase:** Reducir drásticamente la carga en CPU/GPU tanto en reposo (`0 FPS` reales) como durante la manipulación de escenas grandes (>1.500 módulos, decenas de edificios y obstáculos), eliminar compilaciones síncronas bloqueantes y sanear fugas de memoria/listeners.
> **Prerrequisitos recomendados:** Completar antes los P0 críticos de [01-FASE-0-estabilizacion-bugs-criticos.md](./01-FASE-0-estabilizacion-bugs-criticos.md) (especialmente gestión de primitivas huérfanas, Undo/Redo y pérdida de contexto WebGL).
> **Protocolo para IAs:** Consulta [00-INDICE.md](./00-INDICE.md) antes de iniciar una tarea. Cambia `Estado` a `[En curso]` / `[Hecho]`, no modifiques lógica ajena al ticket y documenta el avance en [99-REGISTRO-AVANCES.md](./99-REGISTRO-AVANCES.md).

---

## Tabla de Tareas — Fase 1

| ID | Título | Severidad | Esfuerzo | Dependencias | Origen | Estado |
| :--- | :--- | :---: | :---: | :--- | :--- | :--- |
| **F1-01** | Erradicar `CallbackProperty` residuales, bucles `rAF` en reposo y renders múltiples por frame | P1 | L | Ninguna | A-09 | `[Pendiente]` |
| **F1-02** | Migrar paneles, edificios y obstáculos de rebuild `O(N)` síncrono a instanciación/batching incremental | P1 | XL | Ninguna | A-08 | `[Pendiente]` |
| **F1-03** | Corregir caché de exclusión 3D y ceguera del raycasting de sombras frente a edificios/obstáculos CAD | P0 | L | F1-02 | A-03 | `[Pendiente]` |
| **F1-04** | Corregir `Mode Captura Limpia` frente a zoom LOD, multi-selección y previews temporales | P2 | S | F0-04 | A-11 | `[Pendiente]` |
| **F1-05** | Optimizar Skybox procedural mediante `modelMatrix` sin regeneración JPEG continua | P2 | M | Ninguna | A-12 | `[Pendiente]` |
| **F1-06** | Indexar picking/snapping en espacio local/BVH (`O(log N)`) y unificar registro de listeners | P2 | L | F0-04 | A-13 | `[Pendiente]` |
| **F1-07** | Purgar fugas de `_raScaledBoxes`, selección multi-panel batched, shadow map inicial y código muerto de render | P2 | M | F1-02 | A-14 | `[Pendiente]` |

---

## Detalle Técnico por Tarea

### `F1-01` — Erradicar `CallbackProperty` residuales, bucles `rAF` en reposo y renders múltiples por frame

| Campo | Valor |
| :--- | :--- |
| **Categoría** | Rendimiento/WebGL |
| **Severidad** | P1 (Alto) |
| **Esfuerzo** | L (1–3 días) |
| **Dependencias** | Ninguna (se recomienda haber resuelto F0-04 para interacción teclado) |
| **Origen** | A-09 |
| **Rama sugerida** | `perf/webgl-idle-zero-fps` |
| **Estado** | `[Pendiente]` |

#### Contexto y Problema
Aunque `viewer` intenta usar `requestRenderMode: true`, múltiples mecanismos fuerzan repintado continuo a 60 FPS o sobrecargan cada frame de cámara:
1. Persisten **12 `new Cesium.CallbackProperty(..., false)`** (`isConstant = false`). En cuanto cualquiera de esas entidades existe en `viewer.entities` (herramienta rectángulo/estampado sin cerrar o entidad legacy), Cesium inhabilita el modo reposo y renderiza continuamente.
2. Cuando `RABenchmark` está expandido, mantiene un `requestAnimationFrame` infinito incluso con el motor gráfico dormido, reconstruye 30 barras HTML cada segundo con `innerHTML = ''` y reporta `'60 FPS'` ficticios en estado `SLEEP`.
3. `renderTriad2D()` se invoca hasta 4 veces redundantes en el mismo fotograma (desde `postRender`, `camera.changed` + `rAF`, `MOUSE_MOVE` síncrono y hover) usando además `triadCtx.shadowBlur` (desenfoque por software muy costoso en Canvas 2D).
4. Tres `setInterval` de arranque en LOD, benchmark y planos esperan indefinidamente cada 100–250 ms si `viewer` falla al inicializar.

#### Evidencia Verificada
- `js/app-main.js:2009, 2055, 3006` (`CallbackProperty(..., false)`)
- `js/working-plane.js:867, 913, 924` (`triadCtx.shadowBlur`), `js/working-plane.js:3628-3645` (`CallbackProperty`), `js/working-plane.js:7430` (`setInterval`)
- `js/buildings.js:1739, 1795, 1804` (`CallbackProperty`)
- `js/building-footprint-cad.js:251` (`CallbackProperty`)
- `js/cad-events-controller.js:137` (`CallbackProperty`), `js/cad-events-controller.js:1212, 1230, 1278-1281, 1855-1863` (disparos múltiples de `renderTriad2D`)
- `js/universal-gizmo-3d.js:1427` (`CallbackProperty`)
- `js/cad-selection-suite.js:365` (`renderTriad2D` en hover) y `376-381` (técnica ligera alternativa sin `shadowBlur`)
- `js/ra-benchmark.js:254, 298-367` (`setInterval` + bucle `rAF` en expandido + `spark.innerHTML = ''` + FPS ficticio)
- `js/ra-lod-manager.js:44` (`setInterval` infinito)

#### Pasos de Implementación
1. Reemplazar los 12 `new Cesium.CallbackProperty(..., false)` de previews/drags por `Cesium.ConstantProperty` o una `Cesium.PolylineCollection` dedicada actualizada únicamente dentro de `MOUSE_MOVE` (coalescido en un único `rAF` que invoca `scene.requestRender()`).
2. En `js/ra-benchmark.js`, eliminar el loop `requestAnimationFrame` perpetuo cuando no haya frames activos: suscribirse a `scene.postRender` para medir fotogramas reales + un timeout de inactividad que marque `isGpuSleeping = true` y muestre `'0 FPS (SLEEP)'`. Reemplazar `spark.innerHTML = ''` por un pool reutilizable de 30 elementos DOM actualizados por índice (`bars[i].style.height`).
3. Centralizar todos los llamadores de `renderTriad2D()` tras un único scheduler coalescido `scheduleTriad2DRender()` (1 ejecución máximo por frame). Eliminar `triadCtx.shadowBlur` en `js/working-plane.js` y replicar el doble trazo translúcido ya usado en `js/cad-selection-suite.js:376-381`.
4. Añadir contador `maxRetries` con fallo limpio (o sustituir por evento/promesa `viewerReady`) en los tres `setInterval` de bootstrap (`ra-lod-manager.js:44`, `ra-benchmark.js:254`, `working-plane.js:7430`).

#### Criterios de Aceptación
- Con la escena abierta y el ratón quieto (incluso con el HUD de `RABenchmark` desplegado o una herramienta de dibujo en espera), `scene.postRender` registra **0 disparos/s** durante >10 segundos seguidos y el perfilador de rendimiento muestra **0% carga JS/GPU idle**.
- Orbitando la cámara, `renderTriad2D()` se ejecuta como máximo 1 vez por frame.
- `rg "CallbackProperty.*false"` en los módulos 3D devuelve `0` coincidencias activas.

#### Riesgos y Precauciones
- Al sustituir `CallbackProperty` en previsualizaciones de líneas/edificios, verificar que al actualizar `positions = new Cesium.ConstantProperty(...)` se llame siempre a `viewer.scene.requestRender()`, o el preview se verá congelado hasta el siguiente evento de cámara.

---

### `F1-02` — Migrar paneles, edificios y obstáculos de rebuild `O(N)` síncrono a instanciación/batching incremental

| Campo | Valor |
| :--- | :--- |
| **Categoría** | Rendimiento/WebGL |
| **Severidad** | P1 (Alto) |
| **Esfuerzo** | XL (>3 días) |
| **Dependencias** | Ninguna |
| **Origen** | A-08 |
| **Rama sugerida** | `perf/gpu-instancing-batching` |
| **Estado** | `[Pendiente]` |

#### Contexto y Problema
El motor 3D destruye y reconstruye completamente la geometría entera de la escena ante ediciones unitarias, realizando compilaciones de shaders e uploads síncronos en el hilo principal (**24** `Cesium.Primitive` creadas con `asynchronous: false`):
- `_wpRenderAllPolylinesNow` destruye y recrea TODOS los faldones, rellenos, cotas y vértices con IDs `Math.random()` en cada fotograma de arrastre desde el gizmo 3D.
- `render3DBuildingsInCesium` reconstruye TODOS los edificios cuando cambia uno solo, creando 4–6 primitivas separadas y un nuevo shader `PerInstanceColorAppearance` por cada edificio con `asynchronous: false`.
- `obstacles.js` emite 2–3 primitivas separadas por obstáculo sin batching y síncronas.
- `wpFastRenderSimulatedPanelsAsync` reconstruye toda la geometría de paneles para cambiar colores de heatmap/strings/selección y además instancia en bucle objetos `PolygonHierarchy` descartados en `simulatedPanelEntities`.

#### Evidencia Verificada
- `js/working-plane.js:3013-3179` (`_wpRenderAllPolylinesNow`)
- `js/universal-gizmo-3d.js:1254, 1323, 1747` (llamadas a `_wpRenderAllPolylinesNow` dentro de drag)
- `js/buildings.js:60-150, 1094-1160` (`render3DBuildingsInCesium` + `asynchronous: false` en 14 puntos)
- `js/l-building-parametric.js` (3 primitivas `asynchronous: false`)
- `js/obstacles.js:969-1120` (4 primitivas `asynchronous: false`)
- `js/app-main.js:8141-8495` (`wpFastRenderSimulatedPanelsAsync`, líneas `8321-8330` alocando `PolygonHierarchy` no usados)

#### Pasos de Implementación
1. **Paneles FV**: Construir una geometría unitaria cacheada por dimensiones de módulo y renderizar instancias por matriz `4×4` (`modelMatrix`) o pool de primitivas indexado por `polyIdx` (dirty-chunking por faldón). Implementar cambio de coloración (Heatmap, Strings, MLPE, Selección) mutando `primitive.getGeometryInstanceAttributes(id).color` in-place sin destruir ni recompilar geometrías. Eliminar la alocación muerta de `PolygonHierarchy` en `app-main.js:8321-8330`.
2. **Edificios y obstáculos**: Indexar primitivas por `bld.id` y `obs.id` con caché `geomSig` para reconstruir únicamente el edificio u obstáculo modificado; compartir una única instancia estática de `PerInstanceColorAppearance` por tipo de material; activar `asynchronous: true` en geometrías complejas y unificar aristas/aleros en una sola `Cesium.PolylineCollection` por escena en lugar de `viewer.entities.add`.
3. **Drag de faldones**: Durante `MOUSE_MOVE` en `universal-gizmo-3d.js`, mutar las posiciones de la entidad/primitiva del faldón activo in-place y diferir `_wpRenderAllPolylinesNow()` únicamente al evento `LEFT_UP`.

#### Criterios de Aceptación
- En una escena de prueba con **1.500 paneles, 10 edificios y 20 obstáculos**:
  - Cambiar modo Heatmap ↔ Modo String ↔ Normal tarda **< 50 ms** (0 reconstrucciones de malla).
  - Arrastrar un faldón con el gizmo 3D mantiene tiempo de frame **< 16 ms**.
  - El número total de `drawCalls` / primitivas de edificios y paneles se reduce en **≥ 70%**.

#### Riesgos y Precauciones
- Si se usa `primitive.getGeometryInstanceAttributes(id)`, cada `GeometryInstance` debe recibir un `id` determinista y `releaseGeometryInstances: false` solo en las colecciones donde se necesite pick/mutación posterior (vigilar huella RAM).

---

### `F1-03` — Corregir caché de exclusión 3D y ceguera del raycasting de sombras frente a edificios/obstáculos CAD

| Campo | Valor |
| :--- | :--- |
| **Categoría** | Bug / Precisión Física 3D |
| **Severidad** | P0 (Crítico) |
| **Esfuerzo** | L (1–3 días) |
| **Dependencias** | F1-02 (por gestión estable de referencias a primitivas `_buildingPrimitives`/`_obsPrimitives`) |
| **Origen** | A-03 |
| **Rama sugerida** | `fix/3d-raycast-occlusion-cad-buildings` |
| **Estado** | `[Pendiente]` |

#### Contexto y Problema
La evaluación de oclusión solar (`isPanelOccludedBy3DEnvironment` y `computeFieldHorizonProfileAsync`) sufre tres fallos graves:
1. `_getOcclusionExcludeList(scene)` cachea durante `1500 ms` la lista de primitivas a ignorar. Si los paneles o cables se re-renderizan en menos de 1.5 s, la caché contiene referencias muertas y **no excluye los paneles recién creados**: `pickFromRay` choca a 0.65 m contra el propio panel/soporte y devuelve `false`, cegando la detección de sombras reales detrás.
2. El filtro `is3DTile` descarta todo impacto que no sea `Cesium3DTileFeature` / `Cesium3DTileset`. Por tanto, **todos los edificios CAD (`_buildingPrimitives`) y obstáculos/árboles CAD (`_obsPrimitives`) son ignorados como oclusores**, pero al ser golpeados primero por `pickFromRay` bloquean el rayo e impiden detectar el 3D Tileset que hay detrás.
3. Depender de `scene.pickFromRay` sobre Google 3D Tiles solo ve teselas cargadas actualmente en el LOD del frustum de cámara.

#### Evidencia Verificada
- `js/app-main.js:8936-8993` (`_getOcclusionExcludeList` con TTL de `1500 ms`), `js/app-main.js:8995-9096` (`isPanelOccludedBy3DEnvironment`, filtro `is3DTile` en `9029-9038`)
- `js/solar-heatmap.js:753, 870-895` (`computeFieldHorizonProfileAsync`, filtro `is3DTile` en `872-880`)

#### Pasos de Implementación
1. Reemplazar el caché temporal de 1500 ms en `_getOcclusionExcludeList` por una versión/generación (`window._raPrimitivesGeneration++` incrementado en `wpCleanupAllSolarPrimitives` y en cada alta/baja de primitivas no oclusoras).
2. Separar claramente **elementos excluidos** (paneles, soportes, pérgolas, cables, gizmos, etiquetas) de **elementos oclusores válidos** (`Cesium3DTileFeature`/`Tileset`, `_buildingPrimitives` de edificios colindantes/propios y `_obsPrimitives`). Asegurar que `isPanelOccludedBy3DEnvironment` y `computeFieldHorizonProfileAsync` acepten impactos en `_buildingPrimitives`/`_obsPrimitives` o evalúen intersección rayo-triángulo analítica contra edificios CAD (evitando auto-oclusión del propio faldón/soporte de la placa).
3. Antes de calcular un perfil de horizonte anual (`computeFieldHorizonProfileAsync`), incluir en la exclusión todos los no-oclusores frescos y preparar evaluación determinista sobre la envolvente CAD + `pickFromRay` (con opción futura a BVH offline en Worker descrita en Fase 7).

#### Criterios de Aceptación
- Colocar un edificio CAD al sur de un faldón de paneles genera sombras reales reflejadas en el mapa térmico anual y en la vista de instante horario.
- Re-renderizar paneles inmediatamente antes (`< 100 ms`) de invocar `isPanelOccludedBy3DEnvironment` produce exactamente la misma matriz de oclusión que tras 5 segundos.

#### Riesgos y Precauciones
- Evitar que la cubierta sobre la que reposa el panel genere auto-oclusión por error numérico `epsilon`: exigir distancia mínima de impacto > `0.25 m` y/o excluir el propio edificio anfitrión cuando la normal de impacto es coplanar/inferior al panel.

---

### `F1-04` — Corregir `Modo Captura Limpia` frente a zoom LOD, multi-selección y previews temporales

| Campo | Valor |
| :--- | :--- |
| **Categoría** | UX 3D |
| **Severidad** | P2 (Medio) |
| **Esfuerzo** | S (<2 horas) |
| **Dependencias** | F0-04 (desconflictar atajo `C`) |
| **Origen** | A-11 |
| **Rama sugerida** | `fix/capture-mode-lod-cleanup` |
| **Estado** | `[Pendiente]` |

#### Contexto y Problema
Al activar Modo Captura Limpia (`RACapture`), hacer zoom cruzando los 85 m dispara `RALodManager.applyLod()`, que vuelve a encender `_panelNumberLabelCollection.show = true` ignorando `RACapture.enabled`. Adicionalmente, `capture-mode.js` intenta ocultar el antiguo `panelOutlineEntity` singular pero omite el array actual `window.panelOutlineEntities`, además de faltar prefijos recientes (`ra_live_route_preview`, `temp_bld_`) en `HIDE_ID_PREFIXES`.

#### Evidencia Verificada
- `js/ra-lod-manager.js:107, 196, 207-249`
- `js/capture-mode.js:31-48, 127-165`
- `js/app-main.js:2563-2598` (`panelOutlineEntities`)
- `js/universal-gizmo-3d.js:1424-1425` (`ra_live_route_preview`)
- `js/building-footprint-cad.js:232, 268` (`temp_bld_`)

#### Pasos de Implementación
1. En `js/ra-lod-manager.js`, dentro de `applyLod()` (`L224-249`), comprobar `const isCapture = !!(global.RACapture && global.RACapture.enabled);` y forzar `showLabels = !isCapture && ...` cuando el modo captura esté activo.
2. En `js/capture-mode.js:32-47`, añadir `'ra_live_route_preview'` y `'temp_bld_'` a `HIDE_ID_PREFIXES`, y en `sweepEntities()` (`L127-165`) iterar sobre `global.panelOutlineEntities` además de `panelOutlineEntity`.

#### Criterios de Aceptación
- Con múltiples paneles seleccionados y una ruta activa, entrar en Modo Captura Limpia y hacer zoom de 200 m a 20 m y viceversa mantiene ocultos el 100% de números de panel, contornos de selección y guías temporales hasta salir de Captura Limpia.

---

### `F1-05` — Optimizar Skybox procedural mediante `modelMatrix` sin regeneración JPEG continua

| Campo | Valor |
| :--- | :--- |
| **Categoría** | Rendimiento/WebGL |
| **Severidad** | P2 (Medio) |
| **Esfuerzo** | M (2–8 horas) |
| **Dependencias** | Ninguna |
| **Origen** | A-12 |
| **Rama sugerida** | `perf/procedural-skybox-rotation` |
| **Estado** | `[Pendiente]` |

#### Contexto y Problema
`_resolveSkyboxZenithTeme()` transforma el cenit local ENU al marco TEME dependiente de `clock.currentTime`. En cuanto el usuario arrastra el deslizador horario solar o reproduce la animación (>8 minutos / ~2° de rotación terrestre), se invalida `_raSkyboxCache[mode]`, se destruye el `SkyBox` y se regeneran en CPU las 6 caras `128×128` con trigonometría por píxel y 6 llamadas síncronas a `canvas.toDataURL('image/jpeg', 0.92)`, provocando tirones y fuga de texturas GPU.

#### Evidencia Verificada
- `js/procedural-skybox.js:5-50, 61-75, 172-187, 190-242`

#### Pasos de Implementación
1. Cachear las 4 texturas de cubemap (`day`, `golden`, `twilight`, `night`) generadas en coordenadas locales ENU o Fixed sin depender de la hora sideral en el píxel; pasar los elementos `HTMLCanvasElement` directamente a `Cesium.SkyBox` evitando `canvas.toDataURL('image/jpeg', 0.92)` (`toDataURL` decodifica de nuevo a PNG/JPEG innecesariamente).
2. Orientar el skybox respecto al cenit de la escena actualizando únicamente `skyBox.modelMatrix` (si el `SkyBox` personalizado o shader/transform lo soporta) o regenerar solo cuando cambie la **latitud/longitud > 1°** o cambie el **modo** (`day`/`golden`/`twilight`/`night`). Verificar compatibilidad de orientación TEME de `Cesium.SkyBox` antes de retirar rotación en textura (en Cesium, `SkyBox` rota en TEME: ajustar o desacoplar rotación en shader/cubo si es necesario, o reducir recalculado a cambio de ángulo > 5° usando canvas directo en memoria sin JPEG).

#### Criterios de aceptación
- Arrastrar suavemente el deslizador solar de 06:00 a 20:00 o reproducir el día completo ejecuta **0 llamadas** a `toDataURL` y no excede **4 compilaciones de textura** (una por banda horaria) sin tirones perceptibles en el profiler.

---

### `F1-06` — Indexar picking/snapping en espacio local/BVH (`O(log N)`) y unificar registro de listeners

| Campo | Valor |
| :--- | :--- |
| **Categoría** | Rendimiento/WebGL |
| **Severidad** | P2 (Medio) |
| **Esfuerzo** | L (1–3 días) |
| **Dependencias** | F0-04 (input arbiter) |
| **Origen** | A-13 |
| **Rama sugerida** | `perf/spatial-index-picking-snap` |
| **Estado** | `[Pendiente]` |

#### Contexto y Problema
Tanto el hover/picking de fallback (`pickPanelUnderCursor`) como el snapping en `MOUSE_MOVE` (`findSnapPoint` / `collectCandidateSnapPoints`) iteran linealmente sobre el 100% de paneles, vértices, obstáculos y edificios ejecutando `SceneTransforms.wgs84ToWindowCoordinates` por candidato en cada frame de movimiento del ratón. Además, `cad-selection-suite.js` añade 5 listeners `pointerdown`/`pointerup` independientes fuera del registro `window.RA.addListener`.

#### Evidencia Verificada
- `js/app-main.js:55-74, 2483-2531, 4782-4797` (`pickPanelUnderCursor`, listeners fuera de `RA.addListener`)
- `js/cad-selection-suite.js:124-127, 158-349, 645-760` (`evaluateHoverTarget`, 3 `pointerup` + 2 `pointerdown` sueltos)
- `js/measure-tool.js:205-302` (`collectCandidateSnapPoints`, `findSnapPoint`)

#### Pasos de Implementación
1. Construir una estructura espacial ligera (por faldón: `BoundingSphere` mundial + Quadtree/grilla 2D en coordenadas `(u, v)` locales del plano, regenerada solo al cambiar geometría).
2. En `findSnapPoint` y `pickPanelUnderCursor`, intersectar el rayo del cursor contra el plano de cada faldón visible (`rayPlaneIntersection`) o descartar grupos enteros por `BoundingSphere` en cámara antes de consultar únicamente los `< 9` vecinos de la celda local y llamar a `wgs84ToWindowCoordinates`.
3. Consolidar los 5 listeners `pointerdown`/`pointerup` de `cad-selection-suite.js` en una máquina de estados única y registrar todos los listeners globales (`app-main`, `cad-selection-suite`, `capture-mode`, `ra-lod-manager`) mediante `window.RA.addListener` para garantizar limpieza total en `window.RA.cleanup()`.

#### Criterios de Aceptación
- Con **3.000 paneles** en escena, mover el cursor por el visor inspecciona **< 5%** de candidatos y toma **< 1 ms/frame** en `findSnapPoint` y hover.
- Invocar `window.RA.cleanup()` libera el 100% de listeners globales registrados.

---

### `F1-07` — Purgar fugas de `_raScaledBoxes`, selección multi-panel batched, shadow map inicial y código muerto de render

| Campo | Valor |
| :--- | :--- |
| **Categoría** | Fuga memoria / Rendimiento |
| **Severidad** | P2 (Medio) |
| **Esfuerzo** | M (2–8 horas) |
| **Dependencias** | F1-02 |
| **Origen** | A-14 |
| **Rama sugerida** | `fix/memory-leaks-selection-shadows` |
| **Estado** | `[Pendiente]` |

#### Contexto y Problema
1. `_raScaledBoxes` retiene `ConstantProperty` con referencias a equipos eléctricos destruidos al no purgarse dentro de `wpClearInverterAndCables()`.
2. `updatePanelSelectionUI` añade N entidades individuales a `viewer.entities` al seleccionar múltiples paneles (`Ctrl+A` / Marquee sobre 1.000 módulos crea 1.000 entidades sin batching).
3. El arranque contradice su propia configuración (`shadows: false` en el `Viewer` mientras `wpConfigureShadowMap` activa `4096×4096 × 4` cascadas y `pickTranslucentDepth = true` aunque no haya geometría aún).
4. Existen bloques muertos/inalcanzables en rutas calientes de renderizado y gizmo (`else if (target.type === 'polyline')` sombreado en `universal-gizmo-3d.js`, `depthMat` no usado y raíles coplanares tras `return;` en `app-main.js`).

#### Evidencia Verificada
- `js/app-main.js:474, 489-524, 840-842, 1171, 1766-1767, 2563-2599, 5117-5177, 8603-8605, 8794-8824`
- `js/universal-gizmo-3d.js:1224-1324`

#### Pasos de Implementación
1. Asociar `entityId` en `_raScaledBoxes` (`app-main.js:5117-5177`) y depurar sus entradas dentro de `wpClearInverterAndCables()` y antes de re-instanciar equipos.
2. Reescribir `updatePanelSelectionUI` (`app-main.js:2563-2599`) usando una única `Cesium.PolylineCollection` batched reutilizable (y actualizar `RACapture` en F1-04 si se sustituye `panelOutlineEntities`).
3. Diferir la activación del `ShadowMap` a alta resolución (o usar `2048px` por defecto si no es modo simulación activa) hasta que existan paneles/edificios o el usuario active sombras, y desactivar `scene.pickTranslucentDepth = false` salvo en pasos que requieran picking sobre materiales translúcidos.
4. Eliminar la asignación inútil `depthMat` (`1766-1767`), resolver si el bloque `8794-8824` de raíles coplanares debe quedar o reactivarse bajo condición explícita (verificándolo antes de borrar), y retirar el `else if (target.type === 'polyline')` sombreado en `universal-gizmo-3d.js:1284-1324`.

#### Criterios de Aceptación
- Tras crear y borrar equipos 20 veces seguidas, `_raScaledBoxes.length === 0` al limpiar equipos.
- Seleccionar 1.000 paneles con `Ctrl+A` genera **1** `PolylineCollection` y **0** entidades individuales por panel en `viewer.entities`.
