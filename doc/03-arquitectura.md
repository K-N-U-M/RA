# 03. Arquitectura del Sistema

> **VERSIÓN CANÓNICA v3.0** — El flujo de trabajo es de **5 pasos**. Ver `AGENTS.md` para el detalle.

## 1. Visión de conjunto

La aplicación es un **monolito cliente** organizado en capas lógicas accesibles desde `window`. No existe backend ni microservicios.

```
┌──────────────────────────────────────────────────────────────┐
│  UI / Interacción   index.html  (estado global, HTML, CSS,   │
│                     eventos, gizmos universales)             │
├──────────────────────────────────────────────────────────────┤
│  Orquestador        js/workflow-orchestrator.js              │
│                     Máquina de estados (5 pasos), guards     │
├──────────────────────────────────────────────────────────────┤
│  Motores JS         js/*.js  (working-plane, buildings,      │
│                     obstacles, wind-turbine, solar-engine,   │
│                     electrical, financials, docs-generator)  │
├──────────────────────────────────────────────────────────────┤
│  Render 3D          CesiumJS (WebGL) — único motor 3D         │
│  Overlay 2D         canvas#ra-triad-overlay (z-index 999999)  │
├──────────────────────────────────────────────────────────────┤
│  Persistencia       localStorage                             │
└──────────────────────────────────────────────────────────────┘
```

## 2. Capas y responsabilidades

### 2.1 Capa de presentación / estado (index.html)
- Declara y mantiene el **estado global de la sesión**.
- Registra los handlers de Cesium (`new Cesium.ScreenSpaceEventHandler(scene.canvas)`).
- Implementa la manipulación directa: `universalGizmoState`, `renderUniversalGizmo2D`, `checkUniversalGizmoHit`, `getUniversalSelectedTarget`, `deleteUniversalSelectedObject`.
- El workflow de pasos es gestionado por `workflow-orchestrator.js` y la función `wpGoToStep(n)` donde n ∈ {1, 2, 3, 4, 5}.

### 2.2 Orquestador (`js/workflow-orchestrator.js`)
- **Máquina de estados centralizada:** gestiona las transiciones entre los 5 pasos, aplica guards de validación (faldón cerrado, paneles generados, objetivo definido, inversor seleccionado) y emite eventos a los demás módulos.

### 2.3 Motores JS (`js/`)
Funciones y objetos modulares por dominio. Interactúan con Cesium a través del visor global `viewer`/`viewer.scene`/`viewer.camera` (nunca referencias directas a `scene` o `camera` declaradas en otro scope) y se registran en `window` para interoperar con `index.html`.

### 2.4 Render
- **CesiumJS:** globos, tiles, terreno, primitivas 3D (edificios, obstáculos, paneles, sombras). Es el **único motor 3D**; no hay Three.js.
- **Overlay 2D:** `canvas#ra-triad-overlay` con `position:fixed`, `100vw×100vh`, `pointer-events:none`. En este canvas se dibujan: cursor CAD/fallback, tríada ortogonal, gizmo de vértice y **gizmo universal**.

## 3. Estado global clave

| Objeto | Ubicación | Descripción |
| :--- | :--- | :--- |
| `viewer`, `scene`, `camera` | `js/viewer.js` | Singleton del visor Cesium. |
| `WP` | `js/working-plane.js` | Planos de trabajo, polilíneas, modo (`mode`), paso activo, cursor. |
| `triadState` | `js/working-plane.js` | Estado de la tríada del cursor (pos3D, ejes U/V/N, escala, snapTarget). |
| `window.solarProjectConfig` | `js/project-config.js` | Equipos seleccionados y auto-dimensionamiento (catálogo). |
| `buildings[]` | `js/buildings.js` | Edificios con `points`, huella, extrusión y tipologías. |
| `bldFootprintState` | `js/buildings.js` | Edición de huella: vértice seleccionado (`selectedVtxIdx`), modo edición. |
| `universalGizmoState` | `index.html` (inline) | Gizmo universal: `active`, `mode`, `screen`, `startPos`, `startMouse`, `wp`. |
| `selectedObstacleId`, `selectedPanelIndex`, `selectedElectricalId` | `index.html` (inline) | Selección activa de objetos 3D. |
| `obstacles[]` | `js/obstacles.js` | Mallas de datos 3D de los obstáculos de escena. |
| paneles / equipos | dominios | Mallas de datos 3D de escena. |

## 4. Patrones arquitectónicos

1. **Namespace global explícito.** Todo lo invocable desde HTML o entre módulos se expone en `window` (p. ej. `window.selectBuildingVertex`, `window.renderUniversalGizmo2D`).
2. **Módulos por dominio.** Un archivo JS = un dominio (planos, edificios, obstáculos, eléctrico…).
3. **Funciones puras y aisladas.** El cálculo geométrico/matemático se mantiene en funciones puras dentro de los módulos, testeable y reusable.
4. **Render por overlays.** El canvas 2D por encima de WebGL separa el HUD/manipuladores (baja frecuencia) del render 3D (alta frecuencia).
5. **Throttling de GPU.** Los `pick` del ratón se limitan (~32 ms, máx ~30/s) y se saltan durante `panning` para mantener 60 FPS.

## 5. Flujo de datos (selección → render)

1. `ScreenSpaceEventHandler` (cesium) o listener de `document` captura el evento (MOVE, LEFT_DOWN, LEFT_CLICK, LEFT_UP).
2. La lógica determina el objetivo seleccionado mediante predictores: `getUniversalSelectedTarget()` (unicidad de selección: vértice de edificio > vértice de polilínea > eléctrico > obstáculo > panel > edificio).
3. El gizmo universal se dibuja en el overlay: `renderUniversalGizmo2D()` → proyecta `target.pos` con `wgs84ToWindowCoordinates` y traza ejes U/V/Z, halo, centroide y badge.
4. `Left-down` sobre un manipulador activa el modo de arrastre (`center-drag`, `u-axis`, `v-axis`, `z-axis`, `rotate-ring`) y **bloquea la cámara**.
5. `MOUSE_MOVE` recalcula la posición (rayo-plano para `center-drag`; proyección sobre eje para ejes), actualiza el modelo de datos y redibuja 3D + overlay.
6. `LEFT_UP` restaura la cámara y re-renderiza.

## 6. Renderizado del overlay (orden de dibujo en `renderTriad2D`)

1. `clearRect` sobre el overlay.
2. Si `triadState.active`: tríada del cursor (diana, ejes X/Y/Z proyectados, gizmo de vértice, badge HUD). Envuelto en `try/catch` propio.
3. **Siempre:** gizmo universal si existe objetivo seleccionado (`getUniversalSelectedTarget()`).

> Tras cada frame de cámara, `scene.postRender` redibuja el overlay, incluido el gizmo universal aunque `triadState.active === false` (cursor fuera de Cesium o sobre UI).

## 7. Ciclo de persistencia

```
Catálogo ────► localStorage["ra_equipment_catalog"] ────► populateStep4EquipmentSelectors()
Proyecto ────► localStorage (proyecto/etapa)           ────► restauración al cargar
```
Los cambios en el modal de catálogo (`saveEditedEquipment`) se aplican en caliente a la sesión activa.

## 8. Auditoría y trazabilidad

- Los archivos con lógica sensible mantienen **comentarios estructurales** que delimitan bloques (ej. `// 1. OBTENER INFORMACIÓN DEL OBJETO SELECTADO`).
- Los bloques que pueden fallar en runtime de overlays usan `try/catch` local sin interrumpir el resto del frame.
- `console.warn("[Triad] …")` / `console.warn("[catch silenciado]", …)` preservan la causa raíz en consola sin romper UX.