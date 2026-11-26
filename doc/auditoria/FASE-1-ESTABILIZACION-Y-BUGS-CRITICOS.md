# 🔴 FASE 1: Estabilización Crítica, Crash del Worker y Bugs Funcionales

> **Objetivo:** Conseguir `63/63` en `tests/run-all.js`, eliminar los 4 `ReferenceError` que tumban `js/solar-worker.js`, reparar bugs activos de Undo/Gizmo/Picking, resolver colisiones de atajos y blindar el arranque.

---

## 1.A. Ya Resuelto (Verificado)
- [x] Guard Paso 1 → Paso 2 corregido en `js/workflow-orchestrator.js:212` (eliminado check global de `RAWind`/`RAWindUI`).
- [x] `shadowMap._fitNearFar = false` unificado entre `js/shadow-settings.js:106` y `js/solar-engine.js:1901-1915`.
- [x] `showStatus` sanitizado con `_toastEsc(msg)` en `js/ui-viewport-controls.js:240`.
- [x] `QuotaExceededError` capturado con aviso al usuario en `js/project-storage.js:1782-1800`.

---

## 1.B. Tareas Pendientes Críticas

### 1.1. Dejar `tests/run-all.js` al 100% (`63/63` sin timeouts)
- **Evidencia:**
  1. `tests/test-electrical-rebt.js` pasa todas sus aserciones pero se cuelga 120 s porque evalúa `js/bom-tree.js:34` sin `js/project-hierarchy.js` y `bindHierarchy()` (`js/bom-tree.js:1526-1549`) entra en polling infinito `setTimeout(bindHierarchy, 400)`.
  2. `tests/test-faldon-deactivation.js` pasa todas sus aserciones pero se cuelga 120 s porque `require('../js/project-status-hud.js')` arranca `setInterval(..., 5000)` en `js/project-status-hud.js:854-857` sin `.unref()` ni teardown.
- **Solución:**
  - En `js/bom-tree.js:1526-1549`: limitar los reintentos de `bindHierarchy` (ej. máx 15 intentos o escuchar evento de inicialización) y exponer teardown.
  - En `js/project-status-hud.js:854-857`: llamar `if (timerId && typeof timerId.unref === 'function') timerId.unref();` y exponer `stopSync()`.
- **Aceptación:** `node tests/run-all.js` finaliza en <15 s con `63/63 pruebas superadas`.

### 1.2. Reparar 4 `ReferenceError` y bugs físicos base en `js/solar-worker.js`
- **Evidencia:** El Web Worker falla silenciosamente (`onerror`) en cada simulación anual y cae al fallback del hilo principal debido a 4 variables no declaradas:
  1. `js/solar-worker.js:364`: `penumbraAttenuation: penumbraAttenuation` (variable no definida).
  2. `js/solar-worker.js:423`: `hourStepDt` en `(GHI_daily_Wh / (_sinAltSum * hourStepDt))` (solo existe `hourWeights`).
  3. `js/solar-worker.js:552`: `_T_AMP_TABLE[climateZone]` (el parámetro de entrada en `L182` es `climaticZone`).
  4. `js/solar-worker.js:686`: `effectiveLossFraction * minPenumbra` (`minPenumbra` no declarada en ese scope).
- **Bugs asociados en el mismo archivo:**
  - `js/solar-worker.js:344`: `tiltRad = (pData.tiltDeg || 20) * Math.PI / 180` convierte `0°` (cubierta plana) en `20°`. Usar `(typeof pData.tiltDeg === 'number' && !isNaN(pData.tiltDeg)) ? pData.tiltDeg : 20`.
  - `js/solar-worker.js:400-423`: `_sinAltSum` suma `sinAlt` sin ponderar por `hourWeights[_hs]`; usar la integral ponderada `sum(sinAlt * hourWeights[h])` para que `GHI_instant` sea consistente con la integración en `L565`.
- **Aceptación:** Simulación anual ejecutada 100% dentro del Worker sin disparos de `onerror` ni fallback al hilo principal; módulos a `0°` mantienen `tiltRad = 0`.

### 1.3. Corregir `undo-manager.js`, rama muerta en `universal-gizmo-3d.js` y normal CAD
- **Evidencia:**
  1. `js/undo-manager.js:538-577`: `beginDrag(targetType)` cae por defecto en `'obstacles'`, ignora `'polyline'` y `'route_vertex'`, y busca `'building_vertex'` cuando `universal-gizmo-3d.js:128` + `cad-events-controller.js:300` pasan `targetType = 'vertex'` (con `subType = 'building_vertex'`).
  2. `js/universal-gizmo-3d.js:1284-1325`: bloque `else if (target.type === 'polyline' && target.rawObj)` duplicado e inalcanzable dentro de la misma cadena `else if` que `L1224` (y dentro del bloque de rotación donde `newPos` es `null`).
  3. `js/working-plane.js:1583-1620`: `cursorGizmoSurfaceNormal` llama 5 veces a `get3DPosition` en el mismo tick; el throttle de `140 ms` (`js/app-main.js:1987-1991`) devuelve el mismo `_lastSmooth3DPos` para los 4 vecinos (`vH = 0, vV = 0`), rompiendo el cálculo de la normal por diferencias finitas.
  4. `js/buildings.js:65`: usa `{ polygonOffset: true, polygonOffsetFactor: 2.0, polygonOffsetUnits: 2.0 }` en lugar de `{ polygonOffset: { enabled: true, factor: 2.0, units: 2.0 } }`.
- **Solución:** Añadir casos explícitos en `undo-manager.js` (`'polyline'`, `'route_vertex'`, y `subType === 'building_vertex'`), eliminar `L1284-1325` en `universal-gizmo-3d.js`, pasar `{ bypassThrottle: true, raw: true }` en `cursorGizmoSurfaceNormal` y corregir el `renderState` de `buildings.js:65`.
- **Aceptación:** `Ctrl+Z` tras arrastrar faldón, ruta eléctrica o vértice de edificio restaura posición exacta; sin errores en consola al definir planos.

### 1.4. Corregir enlaces UI rotos y colisiones de atajos de teclado (`C`, `H`, `M`)
- **Evidencia:**
  1. `js/cad-status-bar.js:72-76`: lee `window.workflowState.currentStep` / `.workflow-step.active` (inexistentes) en lugar de `window.wpCurrentStep` / `.wp-step-btn.active`, quedando congelado en `"Paso 1"`.
  2. `js/onboarding-empty.js:39, 47-53`: el botón `"1. Buscar dirección"` busca `#search-input, #geocoder-input` en lugar de `#ra-search-input` (`index.html:504`), y `"2. Dibujar cubierta"` busca `wpStartDrawPolyline` en lugar de `startPolylineDrawMode()` (`index.html:697`).
  3. Colisiones de atajos:
     - `C`: `cad-events-controller.js:1879` (`wpToggleCableAuditElevation`) vs `capture-mode.js:301` (`RACapture.toggle`). Asignar `Shift+C` a auditoría de cables (y actualizar texto en `index.html:2390, 4202`).
     - `H`: `index.html:4197` (Heatmap) vs `project-status-hud.js:11, 202` (minimizar HUD). Reasignar minimizar HUD o heatmap a tecla libre (ej. `Alt+H` para minimizar HUD).
     - `M`: `measure-tool.js:926` / `app-main.js:239` (Cinta métrica) vs etiquetas `(M)` de Mover faldón en `index.html:1064, 1307`.
- **Aceptación:** Cada atajo ejecuta una única acción; la barra de estado refleja pasos 1–5 en tiempo real y los botones del onboarding funcionan.

### 1.5. Blindar arranque de `window.RA`, `unhandledrejection` y `ra-env.js`
- **Evidencia:**
  - `js/project-config.js:26` (`#5` en `index.html`) escribe `window.RA.projectConfig` antes de que `js/app-main.js:13` (`#80`) inicialice `RA`, dependiendo por accidente de `js/ui-viewport-controls.js:760` (`#2`).
  - Doble handler global `unhandledrejection` en `js/error-handler.js:51` y `js/config.js:165`.
  - `index.html:46` carga `js/ra-env.js` (ausente en repo, genera 404 en consola).
- **Solución:** Crear `js/ra-bootstrap.js` como primer `<script defer>` inicializando `window.RA`, eliminar handler duplicado en `js/config.js:165-174` y hacer tolerante/opcional la carga de `ra-env.js`.
- **Aceptación:** Reordenar scripts no lanza `TypeError: Cannot set properties of undefined` y 0 errores de handler duplicado.

---

## Checklist de Avance
- [x] 1.1. Suite `tests/run-all.js` al 100% (`63/63` sin timeouts)
- [x] 1.2. 4 `ReferenceError` + `tiltDeg===0` + `_sinAltSum` reparados en `js/solar-worker.js`
- [x] 1.3. `undo-manager.js`, rama muerta en `universal-gizmo-3d.js`, `cursorGizmoSurfaceNormal` y `polygonOffset` en `buildings.js`
- [x] 1.4. `cad-status-bar.js`, `onboarding-empty.js` y colisiones de atajos `C`/`H`/`M`
- [x] 1.5. `js/ra-bootstrap.js` + `unhandledrejection` único + manejo `ra-env.js`

## Registro de Avances
- **2026-11-26 (Auditoría Inicial):** Completados guard Paso 1→2, `shadowMap._fitNearFar = false`, sanitizado `showStatus`, manejo `QuotaExceededError` y reparación de 16 de 18 tests.
- **2026-11-26 (Auditoría Quirúrgica):** Detectados los 2 bloqueos por timeout (`bom-tree.js:1541`, `project-status-hud.js:854`), 4 `ReferenceError` en `solar-worker.js`, bugs en `undo-manager`/`universal-gizmo-3d`/`working-plane` y colisiones `C`/`H`/`M`.
- **2026-11-26 (3 Agentes en paralelo):** Fase 1 completada al 100%: `node tests/run-all.js` -> `63/63` pruebas superadas (0 fallidas), Worker solar sin `ReferenceError` y con `tiltDeg=0` preservado, Undo/Gizmo/Normal CAD reparados, bootstrap `js/ra-bootstrap.js` activo y atajos `C`/`Shift+C`/`H`/`Alt+H`/`M` desconflictados.
