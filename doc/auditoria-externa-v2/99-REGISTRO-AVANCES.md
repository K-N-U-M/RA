# Registro de Avances — Auditoría Externa Clean-Room v2

> **Propósito:** Bitácora única y cronológica donde cualquier IA o desarrollador documenta la resolución de cada ticket de `doc/auditoria-externa-v2/`.
> **Protocolo obligatorio:**
> 1. Al **tomar** un ticket, marca `Estado` como `[En curso]` en el fichero de su fase y en `00-INDICE.md`.
> 2. Implementa estrictamente el alcance del ticket sin tocar código ajeno ni inventar suposiciones.
> 3. Verifica los **Criterios de aceptación** definidos en la ficha.
> 4. Al **cerrar**, marca `[Hecho]` en el fichero de su fase y en `00-INDICE.md`, y añade una fila al final de esta tabla (nunca borres registros previos).

---

## Historial de Tareas Ejecutadas

| Fecha (ISO) | ID Tarea | Rama | Commit | Agente / IA | Resultado | Notas / Verificación realizada |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 2026-11-25 | `V2-INIT` | `feat/remediacion-aaa` | *(commit inicial)* | Auditoría Externa v2 (6 agentes en paralelo) | `[Hecho]` | Inspección independiente en modo solo lectura sobre 102 archivos JS (103.919 L), `index.html` (4.130 L), `css/styles.css` (3.738 L), reglas Firebase, Cloud Functions y suite de tests. Inventariados **48 tickets accionables** en 8 fases (`00-INDICE.md`, `01` a `08`). Semáforo inicial v2: 🟡 AMARILLO (bloqueantes P0 documentados en Fase 0). |
| 2026-11-25 | `V2-F1-01..06` | `feat/remediacion-aaa` | *(commit Fase 1)* | Gemini 4 Neon (Ejecución) | `[Hecho]` | Completada íntegramente **Fase 1 (Motor CAD 3D, Geometría y Rendimiento WebGL)**: OSNAP/Polar/Numérico cableados en trazado y cinta (`cad-osnap-polar.js`, `working-plane.js`, `cad-events-controller.js`, `building-footprint-cad.js`, `measure-tool.js`); Section Planes sobre `google3DTileset`/`cesiumOsmBuildings`, SAT 2D real y persistencia `deletedPanels`+`RAundo` en Clash (`cad-clash-section.js`); erradicados bucles `O(N²)` en re-matching de paneles, clash y cinta + PBR `asynchronous: true` (`app-main.js`, `measure-tool.js`); Quadtree `RASpatialDsm` particionado por faldón, conectado a picking y muestreo real 3D Tiles en DSM (`spatial-index-dsm.js`, `app-main.js`); unificado `raToCanvasCoords`, geometría L asimétrica analítica + CCW en `extractSolarFaces` y `UndoManager` sin clonar `roofInfo` (`working-plane.js`, `cad-selection-suite.js`, `l-building-parametric.js`, `undo-manager.js`); consolidación `postRender`, `RALodManager` (`notifyQualityChanged` + `_faldonSupportCollections`), atajo `[E]` ampliado, wireframe vivo en drag L, captura limpia cinta, recolor PBR y caché de instancia `Cesium.SkyBox` (`cad-events-controller.js`, `ra-lod-manager.js`, `procedural-skybox.js`). |

| 2026-11-25 | `V2-F2-01..06` | `feat/remediacion-aaa` | *(commit Fase 2)* | Gemini 4 Neon | `[Hecho]` | Completada **Fase 2 (Ingeniería FV, Eléctrica REBT, Eólica y Tarifas)**: factor `1.25× Isc` + `ΔV DC+AC <= 2.5%`, `stringsPerTrunkEff` y `cosPhiAc` (`shadow-auto-stringer.js`, `electrical-engine.js`); fórmula mensual CNMC 3/2020 sobre 35.040 cuartos de hora + curva híbrida solar+eólica (`datadis-tariff-optimizer.js`); margen acústico nocturno real (`wind-acoustics.js`) y generación híbrida mensual en Dossier (`commercial-proposal-dossier.js`); propagación `wp`/`pNomW`/`albedo` a `solar-worker.js`, `dayOfYear` a Perez (`radiation-engine.js`) y `groundSelfShadeFactor` en fallback (`solar-heatmap.js`); claves case-insensitive + `IMaxDC/nbMppt` + detección W/kW en `.OND` (`pvsyst-pan-ond-parser.js`) y bus AC agregado en `bishop-iv-engine.js`; integración SSOT de `datadis8760` (`financials.js`), recálculo solar+BOM al aplicar auto-stringing y límite monofásico 15 kW ES (`ra-sdk-plugins.js`). |
| 2026-11-26 | `V2-F0-01..09` | `feat/remediacion-aaa` | *(commit Fase 0)* | Antigravity Pro | `[Hecho]` | Completada íntegramente **Fase 0 (Emergencias P0, DOM Roto, Despliegue y Bugs Críticos)**: Restaurado `#ra-doc-modal` y cierre limpio de HTML (`index.html`); hosting apuntando a `dist/` y blindaje de secretos CI (`firebase.json`, `tests.yml`); aserciones de reglas y aislamiento de emulador en runner CI (`test-security-contract.js`, `run-all.js`); paso correcto de velocidad de viento al modelo Faiman (`solar-engine.js`); cálculo reglamentario de tierra ITC-BT-18 y exportación de `T_min` real (`electrical-engine.js`, `project-calcs.js`); exclusión mutua carga/descarga en arbitraje valle, precalentamiento SoC 24h, neutralidad IVA en B2B y corrección `indexOf('6.')` en Dossier (`financials.js`, `commercial-proposal-dossier.js`); alineación P50 con modelo financiero y capex neto (`bankable-p50-p90.js`); render incremental sin pérdida de paneles previos, corrección de firma en Undo y reconstrucción de GPU tras pérdida WebGL (`app-main.js`, `undo-manager.js`, `cesium-safety.js`, `buildings.js`); cuadro MPPT interactivo en drawer inferior y accesibilidad completa por teclado en outliner, dropzone de facturas y rosa de los vientos (`mppt-matrix-controller.js`, `ux-aaa-workspace.js`, `ui-outliner.js`, `bill-auditor.js`, `index.html`). |

---

## Plantilla rápida para nuevas entradas

```markdown
| YYYY-MM-DD | `V2-FX-XX` | `rama` | `abc1234` | Modelo / IA | `[Hecho]` / `[Parcial]` | Resumen de archivos modificados, evidencia verificada y dependencias desbloqueadas. |
```
