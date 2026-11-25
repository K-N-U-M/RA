# FASE 1 (Auditoría Externa v2) — Motor CAD 3D, Geometría y Rendimiento WebGL

> **Objetivo:** Corregir desconexiones críticas en herramientas CAD 3D, eliminar bloqueos `O(N²)` en plantas de 5.000–10.000 paneles, alinear coordenadas de overlay y sanear edificios en L.  
> **Protocolo para IAs:** Ver [00-INDICE.md](./00-INDICE.md) y registrar cierre en [99-REGISTRO-AVANCES.md](./99-REGISTRO-AVANCES.md).

---

## Tabla de Tickets — Fase 1

| ID | Título | Sev. | Esf. | Dependencias | Estado |
| :--- | :--- | :---: | :---: | :--- | :---: |
| **V2-F1-01** | Cablear `RACadOsnap` (OSNAP, Polar, Numérico) en trazado y cinta métrica | P0 | M | — | `[Hecho]` |
| **V2-F1-02** | Aplicar Section Planes a Google 3D Tiles, OBB SAT real y persistir `deletedPanels` en Clash | P0 | M | — | `[Hecho]` |
| **V2-F1-03** | Eliminar bucles `O(N²)` en render/clash/cinta y pasar PBR a `asynchronous: true` | P1 | L | V2-F0-08 | `[Hecho]` |
| **V2-F1-04** | Particionar Quadtree `RASpatialDsm` por faldón y muestrear alturas reales en Google 3D Tiles | P1 | M | V2-F1-03 | `[Hecho]` |
| **V2-F1-05** | Unificar `toCanvasCoords`, reparar cumbrera L asimétrica y hacer ligero `UndoManager.commitDrag()` | P1 | M | — | `[Hecho]` |
| **V2-F1-06** | Pulidos CAD/Render: `postRender`, `RALodManager`, atajo `E`, captura `RAMeasureTool`, recolor PBR y `SkyBox` | P2 | M | V2-F1-03 | `[Hecho]` |

---

### `V2-F1-01` — Integración Real de `RACadOsnap` en Flujo Activo de Dibujo y Medición
- **Estado:** `[Hecho]`
- **Evidencia:** `RACadOsnap` (`js/cad-osnap-polar.js:86-172,210-278`) solo es invocado por `js/ux-aaa-workspace.js:81,480,536-545`. Ni `wpFindSnapTarget` (`js/working-plane.js:297-325`), ni `js/cad-events-controller.js:426-460,500-520,1007-1025`, ni `js/measure-tool.js:267-314` llaman a `resolveSnap2D()`. Además `applyNumericEdge()` solo dibuja dos entidades decorativas y no añade el vértice a `WP.activePolyPts` ni `activeBuildingPts`.
- **Plan:** Llamar `RACadOsnap.resolveSnap2D(cursorUV, lastVertexUV)` en `MOUSE_MOVE` y `LEFT_CLICK` de `draw-poly`, `draw-building`, drag de vértices y `RAMeasureTool`; hacer que `applyNumericEdge()` confirme el punto 3D en el comando de dibujo activo si existe.
- **Criterios de aceptación:** Activar Midpoint/Intersection/Polar en el panel afecta inmediatamente el imán al dibujar faldones y edificios, y proyectar una arista numérica inserta el vértice exacto.

### `V2-F1-02` — Planos de Sección sobre 3D Tiles, Colisión OBB SAT Real y Persistencia
- **Estado:** `[Hecho]`
- **Evidencia:** `applySectionPlane()` (`js/cad-clash-section.js:268-291`) solo asigna `scene.globe.clippingPlanes`, mientras `loadGoogle3D()` (`js/viewer.js:367,395,411`) oculta el globo (`globe.show = false`). Además `runClashDetection` (`:109-119`) ignora rotaciones `p.rot`/`obs.rot`, usa radio esférico entre faldones cuando falta `obs.polyIdx`, y `autoResolveCriticalClashes()` (`:212-250`) no empuja snapshot a `RAundo` ni añade paneles a `poly.deletedPanels`.
- **Plan:** Aplicar `ClippingPlaneCollection` también a `google3DTileset` y `cesiumOsmBuildings` (limpiándolos en `clearSectionPlane`); sustituir el AABB de choque por SAT 2D sobre las 4 esquinas rotadas + `getObstaclePolygon2DForRoof` + intervalo Z; registrar snapshot en `RAundo` y `poly.deletedPanels` al auto-resolver.
- **Criterios de aceptación:** El corte seccional secciona edificios Google 3D Tiles y la resolución automática de choques persiste tras recalcular y se puede deshacer con `Ctrl+Z`.

### `V2-F1-03` — Erradicación de Cuellos `O(N²)` en Escenas de 5.000–10.000 Paneles
- **Estado:** `[Hecho]`
- **Evidencia:**
  - `js/app-main.js:6305-6332` ejecuta hasta 5 `.find()` lineales sobre `prevPanelsMap` por cada panel (`O(5·N²)`).
  - `js/cad-clash-section.js:137-158` ejecuta doble bucle panel-vs-panel `O(N²)`.
  - `js/measure-tool.js:189-213` duplica las esquinas desde `WP.polylines` **y** `allRenderedPanels` (80.000 candidatos para 10k placas) recorridos linealmente en cada `MOUSE_MOVE`.
  - `js/app-main.js:6840` crea la primitiva PBR con `asynchronous: false` en el hilo principal.
- **Plan:** Indexar `prevPanelsMap` por `Map<panelId>`/`Map<layoutIndex>`; usar el árbol espacial por faldón en colisiones; deduplicar candidatos en `measure-tool.js`; cambiar PBR a `asynchronous: true`.
- **Criterios de aceptación:** Re-renderizado y movimiento de ratón en escena de 10.000 paneles sin bloqueos multi-segundo ni comprobaciones cuadráticas.

### `V2-F1-04` — Quadtree `RASpatialDsm` por Faldón y Muestreo Real sobre 3D Tiles
- **Estado:** `[Hecho]`
- **Evidencia:** `js/spatial-index-dsm.js:83-96` mezcla paneles de distintos `polyIdx` en un único árbol `(u,v)` y nunca se conecta con `pickPanelUnderCursor` ni `cad-clash-section.js`. Además `sampleDsmAndDetectRoof()` (`:239-251`) consulta `globe.getHeight()` cuando `globe.show = false` bajo Google 3D Tiles, devolviendo siempre plano horizontal `0°`.
- **Plan:** Mantener un `QuadNode` por `polyIdx` (o coordenadas ENU unificadas) consumido por picking y colisiones; muestrear elevación real de 3D Tiles mediante `scene.sampleHeight` / `clampToHeightMostDetailed` o malla multi-rayo `pickPosition`.
- **Criterios de aceptación:** "Detectar Plano DSM" sobre un tejado inclinado en Google 3D Tiles estima su inclinación/azimut reales y el Quadtree acelera búsqueda/clash por faldón.

### `V2-F1-05` — Coordenadas de Overlay, Edificios en L Asimétricos y Undo Ligero
- **Estado:** `[Hecho]`
- **Evidencia:**
  - `js/cad-events-controller.js:1028` pasa coords de canvas a `updateTriadAtMouse` (`working-plane.js:147-152`) que vuelve a restar `rect.left/top`; `js/cad-selection-suite.js:702,728,758` pasa `clientX/clientY` sin convertir frente a `wgs84ToWindowCoordinates`.
  - `js/l-building-parametric.js:400-424` usa punto medio creando faldones alabeados e inclinaciones erróneas (~38,6° en vez de 25°) cuando `wA !== wB`; `extractSolarFaces` (`:834-846`) pierde `overhang` y no fuerza orientación CCW.
  - `js/undo-manager.js:145,561-583,608-610` clona y serializa dos veces todo `roofInfo.panels` en cada `commitDrag()`.
- **Plan:** Unificar helper `toCanvasCoords(clientX, clientY)`; calcular intersección analítica 2D de cumbreras A/B con `hA`/`hB` y `computeBuildingRoofCartoList` + CCW en `extractSolarFaces`; añadir `roofInfo` y `panels` derivados a `SKIP_KEYS` de `UndoManager`.
- **Criterios de aceptación:** Picking/Triad exacto con barras o desplazamientos; edificio L `main_annex` (`12×7 m`) con planos coplanares a pendiente exacta; `commitDrag()` sin congelamientos en 10k paneles.

### `V2-F1-06` — Consolidación de Render Overlay, LOD, Atajos y Skybox
- **Estado:** `[Hecho]`
- **Evidencia:** `cad-events-controller.js:1273,1850` agenda `renderTriad2D()` duplicado en `postRender` y `camera.changed`; `ra-lod-manager.js:124-198,245-250` restaura SSE obsoleto tras cambiar calidad e ignora `_faldonSupportCollections`; `[E]` rota (`cad-events-controller.js:1941`) excluye polilíneas/workplanes/turbinas soportados en `universal-gizmo-3d.js`; `RAMeasureTool.setVisible(false)` (`measure-tool.js:902`) deja visibles `previewPinA/B/Ring/Label`; `l-angle-drag` (`cad-events-controller.js:1121`) congela malla hasta soltar; `wpRecolorSimulatedPanelsInPlace` (`app-main.js:6991`) falta en PBR; `procedural-skybox.js:66,195` recrea `Cesium.SkyBox` y sube 6 cubemaps en cache hit.
- **Plan:** Consolidar renderizado 2D en `postRender`, completar mapa de soportes/previews/targets gizmo `[E]`, añadir wireframe en drag, soportar recolor o reconstrucción rápida en PBR y cachear la instancia `Cesium.SkyBox` por modo.
- **Criterios de aceptación:** Cero entidades huérfanas en captura limpia, giro `[E]` operativo en todo objeto editable, y cambio solar sin subidas redundantes de textura cubemap.
