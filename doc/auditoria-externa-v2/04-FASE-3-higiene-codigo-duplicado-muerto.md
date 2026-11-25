# FASE 3 (Auditoría Externa v2) — Higiene, Deduplicación y Purga de Código Muerto

> **Objetivo:** Eliminar **~1.440–1.510 LOC** de código duplicado, divergente o muerto verificado estáticamente antes de la migración modular.  
> **Protocolo para IAs:** Ver [00-INDICE.md](./00-INDICE.md) y registrar cierre en [99-REGISTRO-AVANCES.md](./99-REGISTRO-AVANCES.md).

---

## Tabla de Tickets — Fase 3

| ID | Título | Sev. | Esf. | Dependencias | Estado |
| :--- | :--- | :---: | :---: | :--- | :---: |
| **V2-F3-01** | Centralizar los 4 clientes Gemini en `RA.AIService` y añadir descubrimiento real (~210 LOC) | P1 | M | — | `[Pendiente]` |
| **V2-F3-02** | Extraer fórmula única 25a VAN/TIR y retirar IVA `21%` fijo en `project-calcs.js` (~90 LOC) | P1 | M | V2-F0-06 | `[Pendiente]` |
| **V2-F3-03** | Compartir kernel térmico-astronómico entre `solar-worker.js` y `solar-heatmap.js` (~420 LOC) | P1 | M | V2-F2-04 | `[Pendiente]` |
| **V2-F3-04** | Consolidar 36 escapes HTML, 6 `_num()` y 7 `setVal()` sobre utilidades canónicas (~150 LOC) | P2 | S | — | `[Pendiente]` |
| **V2-F3-05** | Purgar 29 funciones muertas (459 LOC), 94 `getElementById` huérfanos y CSS muerto/duplicado (~620 LOC) | P2 | M | V2-F0-01 | `[Pendiente]` |

---

### `V2-F3-01` — Unificación Real de Clientes Gemini en `RA.AIService`
- **Estado:** `[Pendiente]`
- **Evidencia:** `js/ai-service.js:34-36` invoca `root.discoverAvailableModels` inexistente como función global (siempre cae a `DEFAULT_MODELS`), mientras `bill-auditor.js:480-496` (que prueba `gemini-3.8-flash` / `3.5-flash` generando 404 antes de `2.5-flash`), `equipment-ai-importer.js:157-265`, `equipment-web-search.js:30,186-220` y `company-branding.js:540-555` duplican clientes directos saltándose el adaptador BFF.
- **Plan:** Implementar `discoverAvailableModels()` dentro de `js/ai-service.js`, alinear una única lista de modelos vigentes sin 404 y migrar las 4 llamadas directas a `RAAIService` (~210 LOC eliminadas).
- **Criterios de aceptación:** Solo `js/ai-service.js` construye peticiones a Gemini/BFF en toda la carpeta `js/`.

### `V2-F3-02` — Fuente Única para Flujo de Caja 25 Años, VAN/TIR e IVA Dinámico
- **Estado:** `[Pendiente]`
- **Evidencia:** Existen 4 motores VAN/TIR independientes con hipótesis contradictorias (`financials.js:6873-7020` con 3 % inflación, `scenario-comparator.js:117-131` con 0 % inflación, `ra-sdk-plugins.js:98-114` con 2 %, `bankable-p50-p90.js:116-149`), y `project-calcs.js:216` fija `iva = subtotal * 0.21` ignorando tipos 10 % / 0 %.
- **Plan:** Extraer helper puro parametrizado `computeNpvIrrCashflow(params)` y reutilizarlo desde los 4 puntos, leyendo `ivaRate` del SSOT fiscal.
- **Criterios de aceptación:** Misma tasa de inflación, degradación y bisección en comparador, SDK, análisis bancable y financiero principal.

### `V2-F3-03` — Kernel Dual Único Solar y Alineación de Workers
- **Estado:** `[Pendiente]`
- **Evidencia:** `js/solar-worker.js` (625 LOC) y `computeAnnualSolarHeatmap` (`js/solar-heatmap.js:1442-2060`) duplican el bucle de 168/192 instantes y la topología de 3 sub-strings; `_MONTH_START_DOY`/`doyToMonthIdx` está copiado 3 veces (`solar-heatmap.js:1057,1581`, `solar-worker.js:79`); `js/wind/wind-worker.js:207` carga `?v=20261118_t3` frente a `?v=20261124_f4` en `index.html:70`.
- **Plan:** Empaquetar el kernel físico solar como UMD compartido entre `solar-worker.js` y el fallback de hilo principal (siguiendo el patrón de `wind-worker.js`), eliminando ~420 LOC duplicadas.
- **Criterios de aceptación:** Worker y fallback ejecutan exactamente el mismo algoritmo desde un único origen y sin `?v=` desfasados.

### `V2-F3-04` — Consolidación de Escapes HTML, `_num()` y `setVal()`
- **Estado:** `[Pendiente]`
- **Evidencia:** 36 reimplementaciones de escape HTML en 18 archivos (8 de ellas incompletas sin comillas en `docs-generator.js:740`, `financials.js:580,2567,2586,2692`, `proposal-style-studio.js:732,2748,2768`), función `_num()` duplicada en 6 archivos, y `setVal()` duplicada 7 veces (4 copias dentro de `project-storage.js:1494,1594,1645,1702`), además de `trusted-security-guard.js:98` (`sanitizeHtmlTrusted`) sin llamadores externos.
- **Plan:** Reemplazar los 36 escapes por `window.RASanitize.escapeHtml` (cargado en `index.html:35`), consolidar `RA.num` / `RA.setDomVal` y conectar `sanitizeHtmlTrusted` o simplificar el guard.
- **Criterios de aceptación:** Cero escapadores parciales sin comillas en todo `js/` y ~150 LOC eliminadas.

### `V2-F3-05` — Purga Verificada de Código JS Muerto, Referencias DOM Huérfanas y CSS Duplicado
- **Estado:** `[Pendiente]`
- **Evidencia:**
  - **29 funciones JS sin llamadores (459 LOC):** 16 en `js/app-main.js` (`toggleConsumptionInputMode`, `syncConsumptionFromBill`, `syncBillFromConsumption`, `switchCostesSubtab`, `switchSidebarTab`, `gizmoAxisLength`, `selectVertex`, `deleteSelectedVertex`, `triggerSimulationFromButton`, `restorePanels`, `movePanelTo`, `rotateSelectedPanel`, `restoreSelectedPanel`, `toggleAutoRotate`, `toggleFullscreen`, `generatePdfReport`); 12 en `js/working-plane.js` (`renderFallbackCursor`, `wpElevatePointAboveSurface`, `renderVertexGizmo2D`, `checkPanelGizmoHit`, `renderPanelGizmo2D`, `wpStep3SelectPolyline`, `wpApplySelectedVtxCoords`, `wpSetPolyAzimuth`, `wpSetPanelOrientation`, `clearActivePolyline`, `wpApplyRoofPreset`, `wpApplyMLPERecommendationAction`); 1 en `js/solar-engine.js` (`solarAzimuth`).
  - **94 `getElementById` huérfanos (~120 LOC):** `#cfg-pres-consumo-anual`, `#cfg-pres-factura-mes`, `#btn-place-inverter`, `#cfg-mod-azimuth/pot/rend/precio`, `#wp-vtx-input-*`, `#ra-mobile-sidebar-backdrop`, `#hud-shaded-count/mlpe-count/loss-val`, `#step4-live-topology-svg`, `#btn-fetch-era5-wind`, `#btn-redo`, `#tit-nombre` y prefijos legados `#tax-*`.
  - **CSS (`css/styles.css` ~45 LOC):** selectores duplicados (`#cesiumContainer.brush-active/.edit-active`, `#wp-step2-gen-tabs`, `@media #ra-floating-tools-container`) y 4 IDs huérfanos (`#ra-heatmap-panel-tooltip`, `#ra-viewport-status-banner`, `#step3-loss-tree-card`, `#step4-leapfrog-card`).
- **Plan:** Verificar con búsqueda global antes de borrar cada función/selector y actualizar `body[data-ra-ui-mode="commercial"]` para apuntar a tarjetas reales.
- **Criterios de aceptación:** Cero funciones muertas listadas y ~620 LOC limpiadas sin romper flujos activos.
