# 🟡 FASE 4: Poda de Código Muerto, Deduplicación y Arquitectura Modular

> **Objetivo:** Eliminar ~101 funciones muertas, consolidar 17 pares de duplicación en módulos SSOT, desmontar los 3 God Files (`26.451` LOC), reemplazar 453 `catch` vacíos y eliminar las 713 escrituras globales en `window`.

---

## 4.A. Ya Resuelto
- [x] Inventario documental sincronizado en `AGENTS.md` (86 archivos JS en disco, 81 `<script defer>` activos).

---

## 4.B. Tareas de Refactorización Quirúrgica

### 4.1. Poda Segura de Código Muerto (~101 funciones y ~227 líneas CSS)
*(Regla: verificar con `rg` en `index.html`, `js/` y `tests/` antes de borrar cada bloque).*
- **`js/app-main.js`:**
  - Step 6 legacy + `generatePdfReport`: `L6911-7278` (y `switchSidebarTab` `L4705-4717`).
  - Funciones huérfanas: `L555-593` (`wpOnEstructuraChange`), `L924` (`wpCapturaInforme`), `L1499-1560`, `L2098-2155`, `L2241-2272`, `L2384-2393`, `L2871-2971`, `L4079-4125`, `L4663-4676`, `L5471`, `L6796-6799`.
  - Re-exports redundantes de `project-config.js`: `L6081-6135, 6361-6374`.
- **`js/solar-engine.js` (~900 LOC muertas):**
  - Dashboard DOM inexistente: `L780-1684` (`runPVGISCalc`, `runNASAPower`, `runEnergyComparison`, `renderAnalysisResults`, `runMonteCarloP50P90`, `renderWaterfallChart`, etc.).
  - Primitivas sin uso: `L51, 55, 77-161, 269-311, 462, 542` (migrar primero `tests/test-competitor-audit-findings.js` de `calcPOA` a `RA.Radiation.poa`).
- **`js/obstacles.js` & `js/wind-turbine.js`:** Gizmos/nudges legacy `js/obstacles.js:231-426, 1136-1236, 1943-1974` + `js/wind-turbine.js:164-201, 617-619`.
- **`js/working-plane.js`:** Stubs y dead helpers `L192-216, 265-279, 573-577, 618-651, 3267-3270, 3355-3394, 6038-6070, 6565-6587, 7528, 7542-7569, 7883-7922`.
- **Otros:** `js/cable-engine.js:2999-3051, 3103-3113`, `js/undo-manager.js:654-660`, `js/solar-materials.js:196-216`, `js/project-config.js:494-551`, `js/cost-modal-ui.js:514`, y **CSS muerto** `#ra-camera-dock` (`css/styles.css:828-1054`, ~227 líneas sin HTML) + `#ra-mobile-sidebar-backdrop` si no se incorpora.
- **Aceptación:** Reducción de >1.500 LOC muertas con `tests/run-all.js` al 100%.

### 4.2. Consolidación de Código Duplicado (17 pares → Módulos SSOT)
1. **`js/ai-client.js`:** Unificar `_aiFetch` y discovery/fallback de modelos Gemini repetidos en `bill-auditor.js:25-33, 486-497`, `financials.js:7-15`, `equipment-ai-importer.js:17-25, 268-279`, `equipment-web-search.js:16-24`.
2. **Motor solar compartido:** Mover `dividePanelIntoSubstrings2D` y `precalcQuadAABB` a `js/polygon-shadow-math.js`; eliminar fallbacks duplicados en `solar-worker.js:22-28, 73-150`, `solar-heatmap.js:1599-1914` y `solar-engine.js:441-460, 579-598` delegando en `RA.Radiation`.
3. **`js/doc-popup-runtime.js`:** Extraer `_docNotify`/`_propNotify`, `_docConfirmAsync`/`_propConfirmAsync`, `exportToWordDocx`/`exportPropDocx`, `capture3DViewToDoc`/`capture3DToProposal`, y editor drag/resize compartidos por `docs-generator.js:403-705`, `financials.js:6220-6860` y `commercial-proposal-dossier.js:2356-2404` (y borrar el `_dSvg` duplicado en `commercial-proposal-dossier.js:957`).
4. **Geometría 3D eólica y utilidades:** Hacer que `wind-turbine.js:327-463` reuse `wind-visualizer.js:471-607`; extraer `rehydratePolylineRoofInfo` (`project-storage.js:1153-1204` == `solar-heatmap.js:681-733`), `getObstacleWorldFrame` (5 archivos), y usar `sanitizer.js` en lugar de 4 copias de `escapeHtml`.
- **Aceptación:** 0 bloques de >10 líneas duplicados entre módulos.

### 4.3. Desmontaje de God Files, `RA.Store` / EventBus y Fin de `catch` Vacíos
- **Trocear los 3 monolitos (`26.451` LOC):**
  - `js/financials.js` (8.252 LOC) → `financial-model.js` (puro sin DOM), `proposal-generator.js`, `financials-ui.js`.
  - `js/app-main.js` (10.026 LOC) → envolver en IIFE (eliminar 85 variables globales nivel 0) + crear `RA.Store` y `RA.events` (`viewer:ready`, `panels:updated`, `selection:changed`, `step:changed`) para **eliminar los 6 `setInterval` de polling** (`working-plane.js:7430`, `ra-benchmark.js:254`, `ra-lod-manager.js:44`, `onboarding-empty.js:109`, `project-status-hud.js:854`, `cad-status-bar.js:116`).
  - `js/working-plane.js` (8.173 LOC) → `wp-structures-ui.js`, `wp-panel-layout.js`, `wp-cad-triad.js`.
  - `js/cable-engine.js` → trocear `renderAllCables()` (954 LOC, `L1704-2658`) en 4 métodos cohesivos.
- **Encapsular los 16 scripts sin IIFE** y reducir las **713 escrituras en `window.*`** a un namespace `window.RA` + fachadas mínimas para `onclick`.
- **Erradicar 453 `catch` vacíos:** Sustituir `catch (_) {}` en `project-storage.js` (89), `app-main.js` (59), `working-plane.js` (43), `financials.js` (35), `solar-heatmap.js` (14) por `RA_ErrorHandler.handle(err, ctx)` o `console.debug`.
- **Aceptación:** Ningún archivo supera 1.500 LOC; `RA.events` sustituye todos los `setInterval` de polling.

### 4.4. Migración a Vite + ES Modules + Build CI (Opcional según despliegue)
- Eliminar las 81 etiquetas `<script defer>` con query strings manuales (`?v=...`) migrando a ES Modules + Vite, con GitHub Actions compilando a GitHub Pages automáticamente.

---

## Checklist de Avance
- [ ] 4.1. Poda segura de ~101 funciones muertas y CSS huérfano
- [ ] 4.2. Consolidación de los 17 pares duplicados (`ai-client.js`, `doc-popup-runtime.js`, `RA.Radiation`, eólica)
- [ ] 4.3. Desmontaje de God Files, `RA.Store`/`RA.events` (0 polling) y limpieza de 453 `catch` vacíos
- [x] 4.4a. Inventario documental `AGENTS.md` sincronizado
- [ ] 4.4b. Migración a Vite + ES Modules + CI (requiere aprobación de build pipeline)

## Registro de Avances
- **2026-11-26:** Sincronizado inventario en `AGENTS.md`.
- **2026-11-26 (Auditoría Quirúrgica):** Inventariadas 101 funciones inalcanzables, 17 pares duplicados, 453 `catch` vacíos de 838, 16 archivos sin IIFE y 713 símbolos globales en `window`.
