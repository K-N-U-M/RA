# FASE 0 (Auditoría Externa v2) — Emergencias P0, DOM Roto, Despliegue y Bugs Críticos

> **Objetivo:** Cerrar los **9 bloqueantes P0** verificados en código actual antes de cualquier evolución.  
> **Protocolo para IAs:** Ver [00-INDICE.md](./00-INDICE.md) y registrar cierre en [99-REGISTRO-AVANCES.md](./99-REGISTRO-AVANCES.md).

---

## Tabla de Tickets — Fase 0

| ID | Título | Sev. | Esf. | Dependencias | Estado |
| :--- | :--- | :---: | :---: | :--- | :---: |
| **V2-F0-01** | Restaurar `#ra-doc-modal` comentado y cerrar `index.html` | P0 | S | — | `[Pendiente]` |
| **V2-F0-02** | Servir `dist/` en `firebase.json` (`ra-env.js`, excluir `dist/`) y endurecer secret CI | P0 | S | — | `[Pendiente]` |
| **V2-F0-03** | Reparar `tests/test-security-contract.js` y aislamiento Emulador en `tests/run-all.js` | P0 | S | — | `[Pendiente]` |
| **V2-F0-04** | Corregir paso de argumentos de viento 24/29 m/s en `computeCellTemperature` (`solar-engine.js`) | P0 | S | — | `[Pendiente]` |
| **V2-F0-05** | Corregir `S_earth = 6 mm²` (`electrical-engine.js:2832`) y `T_min` (`project-calcs.js:363`) | P0 | S | — | `[Pendiente]` |
| **V2-F0-06** | Corregir arbitraje BESS simultáneo, IVA/IS B2B y clasificación residencial `indexOf('6.')` | P0 | M | — | `[Pendiente]` |
| **V2-F0-07** | Alinear `RABankableRisk` con `calculateFinancialModel()` y §6.0 de Memoria PDF | P0 | M | — | `[Pendiente]` |
| **V2-F0-08** | Arreglar render incremental (`app-main.js:6279`), `undo-manager.js:239` y `webglcontextrestored` | P0 | M | — | `[Pendiente]` |
| **V2-F0-09** | Reparar tab MPPT vivo en Engineering Drawer y accesibilidad teclado en Outliner/Dropzone/Rosa | P0 | M | — | `[Pendiente]` |

---

### `V2-F0-01` — Restauración de `#ra-doc-modal` y Etiquetas Finales en `index.html`
- **Estado:** `[Pendiente]`
- **Evidencia:** `index.html:3781` abre `<!-- Módulos principales extraídos a js/cost-modal-ui.js y js/app-main.js?v=20261125_f5c"ra-doc-modal" role="dialog" ...` sin `-->` y sobrescribiendo `<div id=`; el siguiente cierre `-->` está en `:3864`, ocultando del DOM todo `#ra-doc-modal` (`#doc-nombre`, `#doc-cups`, botones de emisión). Además `index.html:4130` acaba con un comentario sin cerrar y sin `</body></html>`.
- **Plan:** Reparar el comentario y `<div id="ra-doc-modal" role="dialog" ...>` en `:3781` y cerrar correctamente `<!-- ... -->` y `</body></html>` al final del archivo.
- **Criterios de aceptación:** `document.getElementById('ra-doc-modal')` y `#doc-nombre` existen en DOM y el HTML valida sin comentarios truncados.

### `V2-F0-02` — Configuración de Hosting `dist/` y Seguridad de Secretos CI
- **Estado:** `[Pendiente]`
- **Evidencia:** `firebase.json:3,19-20` define `"public": "."` e ignora `**/ra-env.js`, dejando fuera el artefacto generado por `scripts/inject-build-meta.mjs --out-dir dist --stamp-html --generate-env` (`.github/workflows/tests.yml:118,152,159`) y exponiendo `/dist/` como subruta pública. Además `.github/workflows/tests.yml:158-160` interpola `${{ secrets.FIREBASE_SERVICE_ACCOUNT_RA_SOLAR_3D }}` directo en bash sin `env:` ni limpieza garantizada en fallo.
- **Plan:** Apuntar `hosting.public` a `"dist"` (retirando `**/ra-env.js` del `ignore` de hosting cuando se sirva `dist/`), y mover el secreto del workflow a variable `env:` con limpieza `if: always()`.
- **Criterios de aceptación:** `dist/index.html` y `dist/js/ra-env.js` se despliegan en `/` sin exponer `/dist/` ni filtrar secretos en logs CI.

### `V2-F0-03` — Reparación de Suites CI Rotas
- **Estado:** `[Pendiente]`
- **Evidencia:** `tests/test-security-contract.js:36,38,47` busca regex obsoletas frente a `firestore.rules:43-51` y `storage.rules:27`; `tests/run-all.js:41-44` autodescubre `tests/test-firebase-rules.js` que exige `@firebase/rules-unit-testing` y Emulator ausentes en el job `unit-and-contracts` (`.github/workflows/tests.yml:38-50`).
- **Plan:** Actualizar aserciones de `test-security-contract.js` a las reglas vigentes y excluir `test-firebase-rules.js` de `run-all.js` (dejándolo en `npm run test:rules`).
- **Criterios de aceptación:** `npm test` y `npm run test:rules` ejecutan en sus jobs respectivos sin falsos fallos por entorno.

### `V2-F0-04` — Error de Argumentos en Modelo Térmico Faiman (`solar-engine.js`)
- **Estado:** `[Pendiente]`
- **Evidencia:** `js/solar-engine.js:320` declara `computeCellTemperature(T_amb, G_poa, isRoofMounted = true, windSpeed = 1.5)`, pero `runPhysicalModel()` en `:541` invoca `computeCellTemperature(tAmbHour, GPOA, windSpeedEst, isCoplanarMount ? 24.0 : 29.0, isCoplanarMount ? 5.0 : 6.8)`. `windSpeed` recibe **24 o 29 m/s** (~104 km/h), duplicando el denominador térmico y sobreestimando el rendimiento anual ~3,5–5 %.
- **Plan:** Aceptar coeficientes Faiman explícitos (`u0, u1, windSpeed`) o corregir la llamada en `:541` alineando `u0/u1` con `solar-worker.js:437`.
- **Criterios de aceptación:** Con 1.000 W/m², `T_amb=25 °C` y `windSpeed=1.5 m/s`, `T_cell` alcanza ~`51–56 °C` coplanar (no `~38 °C`).

### `V2-F0-05` — Puesta a Tierra REBT ITC-BT-18 y `T_min` Real en Memoria PDF
- **Estado:** `[Pendiente]`
- **Evidencia:** `js/electrical-engine.js:2832` fija `const S_earth = hasExternalLightningRod ? 16 : 6;`, haciendo que `bom-tree.js:1057` y `docs-generator.js:1163` prescriban 6 mm² Cu incluso cuando `S_ac >= 10 mm²`, ignorando `computeProtectiveEarthSection` (`electrical-engine.js:614`). Además `computeSizingEngineering` calcula `T_min` zonal CTE (`:2585`) pero no lo retorna, por lo que `project-calcs.js:363` fija `T_min: -10` impreso en `docs-generator.js:1071`.
- **Plan:** Sustituir `:2832` por `computeProtectiveEarthSection(S_ac_opt, hasExternalLightningRod)` y exportar `T_min` real hacia `project-calcs.js`.
- **Criterios de aceptación:** Proyectos con `S_ac = 16 mm²` muestran `S_earth = 16 mm²` en UI/BOM/Memoria, y la Memoria refleja el `T_min` exacto con el que se calculó `Voc_cold`.

### `V2-F0-06` — Corrección de Arbitraje BESS, Fiscalidad B2B e `indexOf('6.')` en Dossier
- **Estado:** `[Pendiente]`
- **Evidencia:**
  1. `js/financials.js:6702-6722`: en `batStrategy === 'arbitraje'` (`2..6 h`) carga la batería de red y en la misma hora la descarga contra la carga consumiendo ~8 % de pérdida fantasma; además carece de precalentamiento SoC 24h por mes (`:6659-6731`).
  2. `js/financials.js:6466-6469,6876,6936`: en `customerProfile === 'empresa'` usa `capexBruto` con IVA recuperable como desembolso Año 0, regala el 25 % de `subtotal` en Año 1 sin descontar amortización ordinaria perdida ni tributación del ahorro en IS.
  3. `js/commercial-proposal-dossier.js:280`: `tariff.indexOf('6.')` sin `!== -1` evalúa `-1` como `true`, clasificando tarifas `2.0TD` como `'Comercial & PYME'`.
- **Plan:** Hacer excluyente carga de red vs descarga en horas valle + warm-up cíclico 24h; en `empresa` usar `subtotal` ex-IVA en Año 0 y modelar diferencial fiscal EBITDA/amortización LIS DA 17ª real; añadir `!== -1` en `commercial-proposal-dossier.js:280`.
- **Criterios de aceptación:** Cero ciclos simultáneos de carga/descarga en arbitraje, coherencia fiscal B2B y etiqueta residencial correcta para `2.0TD`.

### `V2-F0-07` — Reconciliación de `RABankableRisk` (P50/P75/P90/P99) con SSOT Financiero
- **Estado:** `[Pendiente]`
- **Evidencia:** `js/docs-generator.js:1255-1277` muestra VAN/TIR de `calculateFinancialModel()` en §6.0 y la fila `P50 (Escenario Base)` de `RABankableRisk.evaluate()` en §6.2 con distinta escalada (3 % vs 2,5 %), sin reemplazos ni flujos fiscales y aplicando otro `1,5 %` de LID (`bankable-p50-p90.js:76-77`); además `ux-aaa-workspace.js:691` usa `capexNeto` y `docs-generator.js:1274` pasa `capexBruto`, y `yr1Kwh` (`:106`) usa `sigmaYr1` mientras `cashflows[0]` (`:118`) usa `sigma25y`.
- **Plan:** Escalar la serie 25 años canónica de `calculateFinancialModel()` desde `RABankableRisk` (evitando doble descuento de LID) y alinear la base CAPEX entre UI y Memoria.
- **Criterios de aceptación:** La fila `P50` de §6.2 y del Drawer coincide con §6.0.

### `V2-F0-08` — Render Incremental 3D, Firma de Undo y Recuperación WebGL
- **Estado:** `[Pendiente]`
- **Evidencia:**
  1. `js/app-main.js:6279,6777-6942` reinicia `window.allRenderedPanels = []` en render incremental (`targetPolyIdx >= 0`) desfasando IDs `"pv_panel_instance_" + i` y duplicando `simulatedPanelEntities`, mientras `js/panel-renderer-3d.js:13-24` descarta llamadas de otro `targetPolyIdx`.
  2. `js/undo-manager.js:239` llama `computeSinglePolylineRoofInfo(pIdx)` en lugar de `poly.roofInfo = computeSinglePolylineRoofInfo(poly.points, poly)`.
  3. `js/cesium-safety.js:112-135` lee `playInterval`/`playing` (reales: `animTimer`/`isPlaying`), llama `RABenchmark.pause()` inexistente y `render3DObstaclesInCesium()` omite reconstrucción por `geomSig` (`js/obstacles.js:881-886`); tampoco invalida `_raBldMatteAppearanceCache` (`js/buildings.js:60-74`).
- **Plan:** Indexar instancias GPU por `panelId` estable + acumular `Set` de faldones sucios en `panel-renderer-3d.js`; corregir firma en `undo-manager.js:239`; exponer reset de cachés de obstáculos y edificios para `webglcontextrestored`.
- **Criterios de aceptación:** Recalcular un faldón no corrompe picking en otros; Ctrl+Z en vértices recalcula paneles; tras perder contexto WebGL se reconstruyen obstáculos, edificios y mediciones.

### `V2-F0-09` — Drawer MPPT Vivo y Operabilidad por Teclado de Núcleo CAD/Factura
- **Estado:** `[Pendiente]`
- **Evidencia:**
  1. `js/ux-aaa-workspace.js:716,726-729` copia `innerHTML` muerto de `#step4-mppt-matrix-card` cuyos eventos delegados están atados solo al elemento original (`js/mppt-matrix-controller.js:1238-1240`), además oculto en modo Comercial (`css/styles.css:3442`).
  2. `js/ui-outliner.js:229..601` usa `<div data-outliner-act>` sin `role`, `tabindex` ni `keydown` (y envuelve botones hijos).
  3. `js/bill-auditor.js:1077,1848` (`#bill-dropzone`) e `index.html:374` (`#ra-rosa`) son `<div>` sin `role="button"`, `tabindex="0"` ni teclado.
- **Plan:** Montar/reparentar el nodo vivo de `RAMPPTMatrix` en el host activo (sidebar o drawer) o enlazar delegación por instancia; sustituir tarjetas `<div data-outliner-act>` por `<button>` hermanos de las acciones (sin anidar controles); añadir `role="button" tabindex="0"` y `Enter/Space` a `#bill-dropzone` y `#ra-rosa`.
- **Criterios de aceptación:** Todos los controles de Matriz MPPT funcionan dentro del Drawer inferior y Outliner, Dropzone y Rosa son 100 % operables con `Tab` + `Intro`.
