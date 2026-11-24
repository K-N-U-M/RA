# FASE 3 — Eliminación de Código Muerto, Duplicado y Residuos CSS/DOM

> **Objetivo de la fase:** Consolidar código duplicado con deriva activa entre cliente, Web Workers y backend (`WAsP`, geometría 2D, física solar, clientes IA, sanitización y constantes), purgar >1.800 líneas de código JS/CSS/HTML muerto y detectar desajustes DOM que provocan fallos silenciosos en UI.
> **Prerrequisitos recomendados:** Idealmente tras estabilizar los P0 de Fase 0, y **antes** de modularizar a Vite/ESM (Fase 4) para no empaquetar ni migrar archivos/funciones muertas.
> **Protocolo para IAs:** Verifica [00-INDICE.md](./00-INDICE.md) y documenta cada limpieza verificada en [99-REGISTRO-AVANCES.md](./99-REGISTRO-AVANCES.md).

---

## Métricas Baseline Verificadas

- **Alcance revisado:** 89 archivos en producto/assets (82 JS con 99.777 líneas, `index.html` 4.223 L, `styles.css` 3.357 L, `server.js` 340 L, `functions/index.js` 196 L).
- **Controles limpios ya verificados:** `0` bloques `if (false)`/`if (0)`, `0` handlers HTML rotos, `0` IDs duplicados en `index.html`, `0` archivos huérfanos en `assets/`.
- **Hallazgos verificados:** **16** (`7 P1`, `7 P2`, `2 P3`), con ~950 L muertas en `solar-engine.js`, `789` L en `wind-turbine.js`, `>500` L en `app-main.js`, `>300` L CSS muerto en `styles.css` y 6 grandes bloques duplicados.

---

## Tabla de Tareas — Fase 3

| ID | Título | Severidad | Esfuerzo | Dependencias | Origen | Estado |
| :--- | :--- | :---: | :---: | :--- | :--- | :--- |
| **F3-01** | Consolidar `parseWAsPLib`, `lanczosGamma` y `fetchTextLimited` entre `server.js`, `functions/index.js` y `wind-resource.js` | P1 | M | F0-09 (o junto a F6-01) | D-01 | `[Pendiente]` |
| **F3-02** | Retirar archivo huérfano `js/wind-turbine.js` (789 L) y arreglar Undo/Redo roto (`renderAllInCesium` -> `renderAll`) | P1 | M | Ninguna | D-02 | `[Pendiente]` |
| **F3-03** | Unificar geometría 2D, sub-strings y física solar duplicadas con deriva entre main thread y `solar-worker.js` | P1 | M | Ninguna | D-04 | `[Pendiente]` |
| **F3-04** | Consolidar `ensureRoofGeometry` duplicada entre `project-storage.js` y `solar-heatmap.js` | P1 | S | Ninguna | D-05 | `[Pendiente]` |
| **F3-05** | Consolidar 4 `_aiFetch`, 2 `getApiKey`, normalización `wind_turbines` y 2 `escapeHtml` duplicados | P1 | M | F0-08 | D-06 | `[Pendiente]` |
| **F3-06** | Purgar subsistema UI muerto "Análisis Energético Comparativo" (~950 L en `solar-engine.js` y `app-main.js`) | P1 | S | Ninguna | D-09 | `[Pendiente]` |
| **F3-07** | Auditar y resolver 30+ IDs DOM huérfanos (restaurar `#btn-redo`, `#label-2d3d`, `#fin-tou-tarifa` o limpiar obsoletos) | P1 | L | F3-02, F3-09 | D-14 | `[Pendiente]` |
| **F3-08** | Consolidar constantes eléctrico-solares, fórmulas manuales de `Voc`/`ΔV` y helpers duplicados en storage/config/SVG/hex | P2 | M | F0-05, F0-06 | D-07 + D-08 | `[Pendiente]` |
| **F3-09** | Purgar código muerto JS en `app-main.js` (>500 L), `working-plane.js` (12 funciones), `_initTriadOnce`, wrapper shadow y aliases | P2 | M | F3-06 | D-10 + D-11 + D-12 | `[Pendiente]` |
| **F3-10** | Fusionar selectores CSS duplicados (`.solar-mode-btn`), retirar `<style>` de `index.html` y purgar >300 L CSS muerto | P2 | M | F3-07 | D-15 + D-16 | `[Pendiente]` |
| **F3-11** | Mover plantilla `ra-env.example.js` fuera de `js/` y migrar los 7 `console.log`/`info` directos de cliente a `RA.log` | P3 | S | Ninguna | D-03 + D-13 | `[Pendiente]` |

---

## Detalle Técnico por Tarea

### `F3-01` — Consolidar `parseWAsPLib`, `lanczosGamma` y `fetchTextLimited` entre `server.js`, `functions/index.js` y `wind-resource.js`

| Campo | Valor |
| :--- | :--- |
| **Categoría** | Código Duplicado |
| **Severidad** | P1 (Alto) |
| **Esfuerzo** | M (2–8 horas) |
| **Dependencias** | Coordinar con `F6-01` para no pisar trabajo de backend |
| **Origen** | D-01 |
| **Rama sugerida** | `clean/dedup-wasp-parser` |
| **Estado** | `[Pendiente]` |

#### Contexto y Problema
El parser WAsP `.lib` y `lanczosGamma` están triplicados en `server.js`, `functions/index.js` y `js/wind/wind-resource.js`, con deriva grave de guardas: solo `server.js` valida `isInt`, longitud mínima y `if (!h10 || !h50)`; `functions/index.js` omite `if (!h10 || !h50)` y `wind-resource.js` omite ambas, exponiendo `NaN`/`Infinity`/`TypeError` ante un `.lib` malformado.

#### Evidencia Verificada
- `server.js:24-163` (`lanczosGamma` 24-37, `parseWAsPLib` 39-121, `fetchTextLimited` 126-163)
- `functions/index.js:10-143`
- `js/wind/wind-resource.js:120-145, 909-979`

#### Pasos de Implementación
1. Extraer `lanczosGamma` y `parseWAsPLib` (conservando todas las guardas estrictas `isInt`, límites de línea y `if (!h10 || !h50)`) a un módulo UMD único `js/wind/wasp-parser.js` cargable desde navegador, `server.js` (`require`) y `functions/` (mediante copia sincronizada en hook/predeploy o workspace compartido).
2. Alinear `fetchTextLimited` compartiendo lógica de timeout y límite de bytes entre `server.js` y `functions/index.js`.

#### Criterios de Aceptación
- Un único algoritmo canónico en las 3 capas.
- Ficheros `.lib` sin alturas `10m/50m` o con cabeceras corruptas son rechazados de forma idéntica en cliente, local y cloud function.

---

### `F3-02` — Retirar archivo huérfano `js/wind-turbine.js` (789 L) y arreglar Undo/Redo roto (`renderAllInCesium` -> `renderAll`)

| Campo | Valor |
| :--- | :--- |
| **Categoría** | Archivo Huérfano / Bug |
| **Severidad** | P1 (Alto) |
| **Esfuerzo** | M (2–8 horas) |
| **Dependencias** | Ninguna |
| **Origen** | D-02 |
| **Rama sugerida** | `clean/remove-legacy-wind-turbine` |
| **Estado** | `[Pendiente]` |

#### Contexto y Problema
`js/wind-turbine.js` (789 L) se carga en `index.html:57`, pero `renderAll()` (`L518-521`) aborta siempre porque `RAWindVisualizer` y `RAWind.Entity` cargan después (`L68, 70`), dejando sus `331-462` y UI `#wt-turbine-controls` muertas mientras duplica geometría 3D HAWT/VAWT y mantiene IDs huérfanos (`#obs-scale-summary`). Como bug colateral encontrado durante la verificación, `undo-manager.js:386-387` llama a `RAWindVisualizer.renderAllInCesium()`, método inexistente (`RAWindVisualizer` solo define `renderAll()`).

#### Evidencia Verificada
- `js/wind-turbine.js:143, 331-462, 518-521, 633-699` y `index.html:57, 68, 70, 1132`
- `js/obstacles.js:1127, 1142, 1181, 1376`, `js/project-hierarchy.js:787-788`, `js/project-storage.js:931, 1234, 1290, 2378`
- `js/undo-manager.js:386-387` (`renderAllInCesium` inexistente)
- `tests/test-hidden-objects-selection.js:25`, `tests/test-project-storage.js:323, 361`

#### Pasos de Implementación
1. Corregir inmediatamente `js/undo-manager.js:386-387` llamando a `global.RAWindVisualizer.renderAll()`.
2. Asegurar en `project-storage.js` un migrador liviano si un `.raproject` antiguo contiene obstáculos `type === 'wind_turbine'`, convirtiéndolos a entidades `RAWind.Entity`.
3. Borrar `js/wind-turbine.js`, quitar `<script src="js/wind-turbine.js">` de `index.html:57`, limpiar los puentes residuales en `obstacles.js`, `project-hierarchy.js`, `project-storage.js` y actualizar los dos archivos de test referenciados.

#### Criterios de Aceptación
- `js/wind-turbine.js` y `RAWindTurbine` eliminados sin errores de carga ni regresión al abrir proyectos antiguos con turbinas.
- Undo/Redo sobre un aerogenerador vuelve a dibujarlo correctamente en el visor 3D.

---

### `F3-03` — Unificar geometría 2D, sub-strings y física solar duplicadas con deriva entre main thread y `solar-worker.js`

| Campo | Valor |
| :--- | :--- |
| **Categoría** | Código Duplicado |
| **Severidad** | P1 (Alto) |
| **Esfuerzo** | M (2–8 horas) |
| **Dependencias** | Ninguna |
| **Origen** | D-04 |
| **Rama sugerida** | `clean/dedup-solar-geometry-and-worker` |
| **Estado** | `[Pendiente]` |

#### Contexto y Problema
Coexisten copias divergentes en tres puntos:
1. Geometría 2D (`isPointInPolygon2D`, `segmentsIntersect2D`, `polygonsIntersect2D`, `convexHull2D`): `polygon-shadow-math.js` implementa `orient` + `onSeg` (colinealidad) mientras `solar-worker.js` usa `ccw` simple.
2. `dividePanelIntoSubstrings2D`: duplicada en `solar-heatmap.js` y `solar-worker.js`.
3. Física solar: `solar-worker.js` ya hace `importScripts('radiation-engine.js...')`, pero mantiene ~250 L de fallbacks duplicados omitiendo clamp `maxDni = 1150`; y `solar-engine.js` duplica funciones de `radiation-engine.js` con firma divergente en `solarDeclination` (`solarDecimalHour` omitida).

#### Evidencia Verificada
- `js/polygon-shadow-math.js:5-87` vs `js/solar-worker.js:29-92`
- `js/solar-heatmap.js:1599-1628` vs `js/solar-worker.js:94-123`
- `js/solar-worker.js:13-25, 127-204` vs `js/radiation-engine.js:28-196`
- `js/solar-engine.js:27-35, 113-125, 313-460, 476-540, 579-598` vs `js/radiation-engine.js:28-369`

#### Pasos de Implementación
1. Mover `dividePanelIntoSubstrings2D` dentro de `js/polygon-shadow-math.js`, hacer `importScripts('polygon-shadow-math.js')` desde `js/solar-worker.js` y eliminar los clones 2D de `solar-worker.js` y `solar-heatmap.js`.
2. Garantizar que `js/radiation-engine.js` esté siempre cargado en Worker y antes de `js/solar-engine.js` (`index.html:43` antes de `L53`), eliminando `_T_AMB_TABLE`, `computeSolarPositionWorker`, `decomposeErbsWorker` duplicados en el worker y las funciones repetidas en `solar-engine.js`.

#### Criterios de Aceptación
- Cero duplicados de geometría 2D o fórmulas astronómicas/Erbs fuera de `polygon-shadow-math.js` y `radiation-engine.js`.
- Worker y fallback main thread producen resultados matemáticos idénticos.

---

### `F3-04` — Consolidar `ensureRoofGeometry` duplicada entre `project-storage.js` y `solar-heatmap.js`

| Campo | Valor |
| :--- | :--- |
| **Categoría** | Código Duplicado |
| **Severidad** | P1 (Alto) |
| **Esfuerzo** | S (<2 horas) |
| **Dependencias** | Ninguna |
| **Origen** | D-05 |
| **Rama sugerida** | `clean/dedup-ensure-roof-geometry` |
| **Estado** | `[Pendiente]` |

#### Contexto y Problema
Bloque casi idéntico de ~60 líneas que reconstruye `polygonAnalysis`, proyección a base `uVec`/`vVec`/`normal` y `poly.roofInfo`.

#### Evidencia Verificada
- `js/project-storage.js:1129-1189`
- `js/solar-heatmap.js:660-734`

#### Pasos de Implementación
1. Exponer `ensureRoofGeometry` canónica (ya cargada en `solar-heatmap.js` antes que `project-storage.js` en `index.html:44` vs `94`).
2. Reemplazar `js/project-storage.js:1129-1189` por invocación directa a la función compartida.

#### Criterios de Aceptación
- Una única definición de `ensureRoofGeometry` y carga intacta de proyectos `.raproject` con múltiples faldones inclinados.

---

### `F3-05` — Consolidar 4 `_aiFetch`, 2 `getApiKey`, normalización `wind_turbines` y 2 `escapeHtml` duplicados

| Campo | Valor |
| :--- | :--- |
| **Categoría** | Código Duplicado |
| **Severidad** | P1 (Alto) |
| **Esfuerzo** | M (2–8 horas) |
| **Dependencias** | F0-08 (coordinar sobre `RASanitize` y handlers XSS) |
| **Origen** | D-06 |
| **Rama sugerida** | `clean/dedup-ai-fetch-and-escape` |
| **Estado** | `[Pendiente]` |

#### Contexto y Problema
Cuatro `_aiFetch` distintos (`financials.js` sin `AbortController`/timeout), dos `getApiKey` con decodificación `enc:`, mapeo duplicado de turbinas importadas e implementaciones locales de `escapeHtml` duplicando `sanitizer.js`.

#### Evidencia Verificada
- `js/company-branding.js:45-60, 92-115, 574-579` (`RA.getGeminiApiKey`, `RA.geminiFetch`)
- `js/bill-auditor.js:25-33`, `js/equipment-ai-importer.js:17-51, 531-566`, `js/equipment-web-search.js:16-48, 421-463`, `js/financials.js:7-15`
- `js/docs-generator.js:71-82`, `js/mppt-matrix-controller.js:29-36` vs `js/sanitizer.js:44-76, 119-122`

#### Pasos de Implementación
1. Usar exclusivamente `RA.getGeminiApiKey` y `RA.geminiFetch` (con timeout obligatorio) eliminando los clones en `bill-auditor`, `equipment-ai-importer`, `equipment-web-search` y `financials`.
2. Extraer `normalizeImportedWindTurbine(raw)` compartido para `equipment-ai-importer.js` y `equipment-web-search.js`.
3. Retirar `escapeHtml` locales de `docs-generator.js` y `mppt-matrix-controller.js`, llamando directamente a `RASanitize.plain` / `RASanitize.escapeHtml` (cargado primero en `index.html:35`).

#### Criterios de Aceptación
- Cero `_aiFetch` o `escapeHtml` locales duplicados; todas las peticiones IA usan timeout `AbortController`.

---

### `F3-06` — Purgar subsistema UI muerto "Análisis Energético Comparativo" (~950 L en `solar-engine.js` y `app-main.js`)

| Campo | Valor |
| :--- | :--- |
| **Categoría** | Código Muerto JS |
| **Severidad** | P1 (Alto) |
| **Esfuerzo** | S (<2 horas) |
| **Dependencias** | Ninguna |
| **Origen** | D-09 |
| **Rama sugerida** | `clean/remove-dead-solar-analysis-ui` |
| **Estado** | `[Pendiente]` |

#### Contexto y Problema
11 funciones (~905 líneas en `solar-engine.js`, ~35% del archivo, más 47 L en `app-main.js`) que dibujaban la antigua pestaña "Análisis Energético Comparativo" (`#btn-run-analysis`, `#analysis-*`, `#mc-dist-*`, `#daily-curve-*`, `#cfg-pvgis-*`). Todos los nodos DOM destino desaparecieron del HTML y no hay ningún llamador externo en producción ni en tests.

#### Evidencia Verificada
- `js/solar-engine.js:780-1684, 2536-2547, 2607-2624`
- `js/app-main.js:4057-4103` (`runEngineSelfTests`)

#### Pasos de Implementación
1. Verificar si alguna función matemática interna (p. ej. llamada base a PVGIS/NASA) sigue viva fuera del bloque muerto (verificado previamente en `D-09`: las 11 funciones listadas no tienen llamadores externos, conservando únicamente el fetch PVGIS/NASA que usen `radiation-engine`/`solar-yield-controller` u otros puntos si los hay).
2. Eliminar `js/solar-engine.js:780-1684`, sus exports en `2536-2547, 2607-2624` y `js/app-main.js:4057-4103` (trasladando las aserciones de `runEngineSelfTests` a `tests/` si aportan cobertura útil).

#### Criterios de Aceptación
- Reducción de ~950 líneas entre `solar-engine.js` y `app-main.js` sin referencias rotas.

---

### `F3-07` — Auditar y resolver 30+ IDs DOM huérfanos (restaurar `#btn-redo`, `#label-2d3d`, `#fin-tou-tarifa` o limpiar obsoletos)

| Campo | Valor |
| :--- | :--- |
| **Categoría** | HTML/DOM Huérfano |
| **Severidad** | P1 (Alto) |
| **Esfuerzo** | L (1–3 días) |
| **Dependencias** | F3-02, F3-09 (hacer tras borrar JS muerto para no perder tiempo en sus IDs) |
| **Origen** | D-14 |
| **Rama sugerida** | `clean/reconcile-orphan-dom-ids` |
| **Estado** | `[Pendiente]` |

#### Contexto y Problema
Módulos activos ejecutan actualizaciones DOM constantes sobre >30 IDs inexistentes en `index.html`: algunos corresponden a controles eliminados (`#sol-tilt`, `#sol-annual-yield`, `#p2-summary-kwp`), otros provocan pérdidas funcionales silenciosas (`#btn-redo`, `#label-2d3d`, `#fin-tou-tarifa` que fuerza fallback `'plana'` en `wind-ui.js`, `#chk-snap-vert`, `#nav-info-address`, `#hud-mlpe-count`, `#hud-loss-val`), y varios mantienen fallbacks `||` a IDs retirados.

#### Evidencia Verificada
- `js/undo-manager.js:421` (`#btn-redo`), `js/viewer.js:1209, 1211` (`#label-2d3d`, `#dock-label-2d3d`)
- `js/financials.js:7201` y `js/wind/wind-ui.js:1068` (`#fin-tou-tarifa`)
- `js/cad-events-controller.js:2005` (`#chk-snap-vert`), `js/project-storage.js:68, 1270` (`#nav-info-address`)
- `js/app-main.js:5072, 5195-5206`, `js/electrical-ui-bridge.js:157, 423, 429, 512` (`#btn-place-inverter`, `#btn-place-meter`, etc.)
- `js/solar-yield-controller.js:393-427`, `js/app-main.js:3043, 3110-3112, 4106-4117`, `js/solar-engine.js:1172` (`#sol-*`)
- `js/working-plane.js:4362-4368, 6316`, `js/project-config.js:556`, `js/cost-modal-ui.js:731`, `js/obstacles.js:1162, 1201`, `js/ui-viewport-controls.js:713`, `js/solar-heatmap.js:537-567`

#### Pasos de Implementación
1. Clasificar cada ID en **Restaurar/Reapuntar** (donde exista control equivalente en `index.html`: p. ej. botón rehacer en barra, toggle 2D/3D, selector tarifa TOU para `wind-ui.js` leyendo estado SSOT real `solarProjectConfig` en lugar de `#fin-tou-tarifa`, contador MLPE/pérdidas HUD si aplica) vs **Eliminar referencia** (paneles antiguos `#sol-*`, `#p2-summary-*`, `#wp-vtx-*`, fallbacks `||` a IDs retirados).
2. Añadir un test estático HTML↔JS en `tests/` (ver también Fase 6 / Tooling) que falle si `getElementById('...')` referencia un ID ausente sin creación dinámica.

#### Criterios de Aceptación
- Cero `document.getElementById` en producción apuntando a IDs inexistentes (salvo opcionales explícitamente documentados).
- El cálculo TOU en `wind-ui.js` lee la tarifa activa real del proyecto, no el fallback `'plana'` por defecto.

---

### `F3-08` — Consolidar constantes eléctrico-solares, fórmulas manuales de `Voc`/`ΔV` y helpers duplicados en storage/config/SVG/hex

| Campo | Valor |
| :--- | :--- |
| **Categoría** | Código Duplicado |
| **Severidad** | P2 (Medio) |
| **Esfuerzo** | M (2–8 horas) |
| **Dependencias** | F0-05, F0-06 |
| **Origen** | D-07 + D-08 |
| **Rama sugerida** | `clean/dedup-constants-and-helpers` |
| **Estado** | `[Pendiente]` |

#### Contexto y Problema
Tres diccionarios paralelos de constantes (`ELEC_CONSTANTS`, `SOLAR_ENGINE_CONSTANTS`, `app-main.js:4827`), fórmulas repetidas con coeficientes distintos (`-0.0028` vs `-0.0026` vs `-0.0027`) en `engineering-explainer.js`, `project-config.js` y `cable-engine.js`, más copias de `defaultWindResourceConfig` (3×), `customEquipment` restore (2× en el mismo archivo), `hexToRgb` (con asimetría de validación), suma `area3D` y conversión SVG→Base64 para Word.

#### Evidencia Verificada
- `js/electrical-engine.js:18-31, 36-46, 90-106, 1331-1363, 2493-2499`
- `js/solar-engine.js:12-22`, `js/app-main.js:4827-4837`, `js/working-plane.js:40-50`
- `js/engineering-explainer.js:35-43`, `js/project-config.js:704-712, 1703-1730, 1996-2020, 2133-2146, 2190-2203`, `js/cable-engine.js:2569-2594`
- `js/wind/wind-resource.js:38-54`, `js/project-storage.js:962-988, 1299-1317, 1719-1745, 2389-2408`
- `js/project-calcs.js:13-27` vs `js/solar-yield-controller.js:41-55`
- `js/docs-generator.js:653-666` vs `js/financials.js:6723-6736`
- `js/commercial-proposal-dossier.js:803-808` vs `js/proposal-style-studio.js:858-864`

#### Pasos de Implementación
1. Congelar (`Object.freeze`) una única fuente de constantes físico-eléctricas en `js/electrical-engine.js` / `js/config.js` y reemplazar cálculos locales de `Voc`/`ΔV` por `RA.Electrical.calculateDynamicMPPTStringLimits` / `calculateVoltageDrop`; retirar wrapper `getPolylineStringColor` de `working-plane.js:40-50`.
2. Extraer helpers únicos para `DEFAULT_WIND_CONFIG`, `_restoreCustomEquipment`, `_computeFieldTopology`, `_saveCustomCatalog`, `_sumPolyArea3D`, `svgToPngBase64` (en `docx-exporter.js`) y `hexToRgb` robusto (con guarda `isNaN`).

#### Criterios de Aceptación
- Fuente única de constantes eléctricas y Cero copias locales de `hexToRgb`, `defaultWindResourceConfig` y `customEquipment` restore.

---

### `F3-09` — Purgar código muerto JS en `app-main.js` (>500 L), `working-plane.js` (12 funciones), `_initTriadOnce`, wrapper shadow y aliases

| Campo | Valor |
| :--- | :--- |
| **Categoría** | Código Muerto JS |
| **Severidad** | P2 (Medio) |
| **Esfuerzo** | M (2–8 horas) |
| **Dependencias** | F3-06 |
| **Origen** | D-10 + D-11 + D-12 |
| **Rama sugerida** | `clean/purge-dead-js-appmain-workingplane` |
| **Estado** | `[Pendiente]` |

#### Contexto y Problema
Cientos de líneas heredadas sin ningún llamador ni elemento UI correspondiente: handlers antiguos de Paso 6 sliders, controles de estructura, consumo/subtabs, gizmo de vértices legacy, 190 L inalcanzables en `generatePdfReport`, pares casi duplicados Edit/New de aerogeneradores (`app-main.js`), 12 funciones/stubs muertos (`working-plane.js`), `wpConfigureShadowMap` sobreescrito (`shadow-settings.js` vs `app-main.js`), `_initTriadOnce` duplicado en `viewer.js`, re-exportaciones `window.*` dobles y exports sin llamadores (`exportToWord`, `undoGeometry`/`redoGeometry`, `_startPulseLoop`, etc.).

#### Evidencia Verificada
- `js/app-main.js:489-583, 900-974, 1311-1312, 1477-1538, 1739-1741, 2076-2133, 2219-2250, 2362-2371, 2752, 2849-2949, 4641-4654, 5449-5453, 6059-6349, 6889-7256`
- `js/working-plane.js:192-216, 265-279, 545-651, 3267-3270, 3355-3394, 6038-6070, 6565-6587, 6794-6802, 7528-7569, 7883-7910`
- `js/viewer.js:12-13, 1216-1243`, `tests/test-inline-ratchet.js:75`
- `js/shadow-settings.js:491`, `js/project-config.js:154, 963, 1292`, `js/project-storage.js:2261, 2267, 2749-2750`
- `js/docs-generator.js:698-700`, `js/commercial-proposal-dossier.js:2402-2404`, `js/undo-manager.js:655-660`, `js/cost-modal-ui.js:510`, `js/procedural-skybox.js:292`, `js/proposal-style-studio.js:3244`, `js/wind/wind-visualizer.js:143-153, 711-719`

#### Pasos de Implementación
1. Eliminar los bloques muertos verificados en `app-main.js` y `working-plane.js` (cuidando actualizar las 4 llamadas residuales a `wpSyncEstructuraUI` en `working-plane.js`, sustituir los 3 llamados vivos a `wpSyncStep3Metrics` por `wpUpdateStep3UI`, y revisar `selectPanelRow` usada por `tests/test-panel-selection.js`).
2. Parametrizar los 3 pares Edit/New de curvas eólicas en `app-main.js:6126-6337` bajo firma única `(mode, ...)`.
3. Retirar el wrapper muerto de `wpConfigureShadowMap`, consolidar `_initTriadOnce` actualizando `tests/test-inline-ratchet.js:75`, dejar una única asignación `window.*` canónica y eliminar stubs vacíos (`_startPulseLoop`, etc.).

#### Criterios de Aceptación
- Reducción `>= 700` líneas entre `app-main.js`, `working-plane.js` y auxiliares sin romper ningún flujo activo ni test existente.

---

### `F3-10` — Fusionar selectores CSS duplicados (`.solar-mode-btn`), retirar `<style>` de `index.html` y purgar >300 L CSS muerto

| Campo | Valor |
| :--- | :--- |
| **Categoría** | CSS Duplicado/Muerto |
| **Severidad** | P2 (Medio) |
| **Esfuerzo** | M (2–8 horas) |
| **Dependencias** | F3-07 |
| **Origen** | D-15 + D-16 |
| **Rama sugerida** | `clean/dedup-and-purge-dead-css` |
| **Estado** | `[Pendiente]` |

#### Contexto y Problema
1. `.solar-mode-btn`, `:hover` y `.active` están declaradas dos veces en `css/styles.css` (la segunda pisa a la primera con `!important` y colores opuestos); `.wp-step-icon` es huérfana y se repite dos veces; `index.html` incrusta 3 bloques `<style>` compitiendo con `styles.css` y mutaciones inline de `wpSwitchGenTab`.
2. `css/styles.css` retiene >300 líneas muertas (`#ra-camera-dock` de `821-1047`, `.mode-pills-group`, `.gizmo-axis-row`, `#btn-place-inverter`, `.costes-subtab-*`, etc.) cuyos elementos ya no existen.

#### Evidencia Verificada
- `css/styles.css:85-99, 547-570, 785-788, 821-1058, 1279-1311, 1351-1428, 1939-1988, 2202-2226, 2406-2442, 2587-2709, 2756-3158`
- `index.html:116-181, 199-209, 3974-4008, 4204`
- `js/app-main.js:6072-6101` (`wpSwitchGenTab`)

#### Pasos de Implementación
1. Fusionar las dos definiciones de `.solar-mode-btn*` en `css/styles.css`, mover las reglas válidas de los bloques `<style>` de `index.html` hacia `css/styles.css` (alternando clases `.active` en `wpSwitchGenTab` en lugar de mutar `style.*`).
2. Purgar en lotes por bloque los selectores muertos tras verificar las decisiones de `F3-07`.

#### Criterios de Aceptación
- Reducción `> 300` líneas en `css/styles.css`, **0** bloques `<style>` duplicados en `index.html` y aspecto visual inalterado en desktop/móvil.

---

### `F3-11` — Mover plantilla `ra-env.example.js` fuera de `js/` y migrar los 7 `console.log`/`info` directos de cliente a `RA.log`

| Campo | Valor |
| :--- | :--- |
| **Categoría** | Higiene / Archivo Huérfano / Logging |
| **Severidad** | P3 (Bajo) |
| **Esfuerzo** | S (<2 horas) |
| **Dependencias** | Ninguna |
| **Origen** | D-03 + D-13 |
| **Rama sugerida** | `clean/env-example-location-and-logs` |
| **Estado** | `[Pendiente]` |

#### Contexto y Problema
1. `js/ra-env.example.js` es la única plantilla documental dentro del árbol de código runtime `js/`.
2. Existen 7 llamadas directas a `console.log` / `console.info` en `js/` fuera de `RA.log`.

#### Evidencia Verificada
- `js/ra-env.example.js` (`config.js:28`, `ra-env.js:3`, `tests/test-no-secrets.js:17, 58, 75`)
- `js/app-main.js:8840`, `js/cable-engine.js:2648, 3049`, `js/cad-selection-suite.js:929`, `js/cesium-safety.js:116, 152`, `js/firebase-service.js:90`

#### Pasos de Implementación
1. Mover `js/ra-env.example.js` a `doc/ra-env.example.js` (o raíz) actualizando referencias en `config.js:28`, `ra-env.js:3`, `README.md` y `tests/test-no-secrets.js`.
2. Reemplazar los 7 `console.log`/`info` de cliente por `RA.log.info(...)` o eliminar logs meramente de arranque redundantes.

#### Criterios de Aceptación
- `js/` solo contiene scripts runtime/worker; `0` `console.log`/`info`/`debug` directos en `js/`; `tests/test-no-secrets.js` verde.
