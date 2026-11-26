# 🔴 FASE 1: Estabilización y Bugs Críticos

> **Objetivo:** Dejar la suite de pruebas en `63/63` verde y cerrar bugs funcionales, de seguridad y de renderizado de sombras.

---

## Tareas

### 1.1. Reparar las 18 pruebas fallidas en `tests/run-all.js`
- **Estado actual:** `45/63` superadas, `18` fallidas:
  - `test-docs-generator-ssot.js` (`ReferenceError: getProjectCalcs is not defined`)
  - `test-document-integrity.js` (`AssertionError: La tabla fiscal debe separar desembolso inicial e inversión neta`)
  - `test-ai-commercial-summary.js`, `test-cable-engine-improvements.js`, `test-cad-selection-suite.js`, `test-cel-opportunity.js`, `test-electrical-contract.js`, `test-electrical-rebt.js`, `test-electrical-sizing.js`, `test-faldon-deactivation.js`, `test-hidden-objects-selection.js`, `test-incremental-faldon-render.js`, `test-loss-monotonicity.js`, `test-module-wiring.js`, `test-mppt-parity.js`, `test-phase4-electrical-audit.js`, `test-ra-full-workflow.js`, `test-rd1699-grid-phase.js`.
- **Acción:** Ejecutar individualmente cada test fallido (`node tests/<nombre>.js`), corregir la causa raíz en el módulo correspondiente y verificar `63/63` en `node tests/run-all.js`.
- **Criterio de aceptación:** `node tests/run-all.js` finaliza con `63/63` pruebas superadas.

### 1.2. Corregir Guard roto en Paso 1 → Paso 2
- **Evidencia:** `js/workflow-orchestrator.js:211-212`:
  `const hasSite = !!(hasPlane || hasPolys || hasWind || (global.RAWind && typeof global.RAWindUI !== 'undefined'));`
- **Problema:** Al estar `RAWind` y `RAWindUI` cargados globalmente, `hasSite` siempre es `true` y permite avanzar sin emplazamiento.
- **Acción:** Eliminar `(global.RAWind && typeof global.RAWindUI !== 'undefined')` de `hasSite`.
- **Criterio de aceptación:** No se puede entrar al Paso 2 sin al menos 1 plano, faldón o aerogenerador real en escena.

### 1.3. Unificar configuración de ShadowMap (`_fitNearFar = false`)
- **Evidencia:** `js/shadow-settings.js:106` y `js/solar-engine.js:1901-1914` establecen `_fitNearFar = true` y sobreescriben `size`, `maximumDistance` y `_primitiveBias`.
- **Acción:** Delegar 100% la configuración de `shadowMap` en `ShadowSettings.configureCesiumShadowMap` con `_fitNearFar = false` y eliminar la sobreescritura en `solar-engine.js`.
- **Criterio de aceptación:** Una única fuente de verdad para sombras; sin clipping en rotaciones/zoom.

### 1.4. Sanitizar `showStatus` contra XSS
- **Evidencia:** `js/ui-viewport-controls.js:240` inyecta `msg` directamente en `innerHTML` sin escapar (a diferencia de `showToast` que usa `_toastEsc`).
- **Acción:** Escapar `msg` con `_toastEsc` o usar `textContent`.
- **Criterio de aceptación:** Ningún HTML no confiable se interpreta en `#status-bar` / `showStatus`.

### 1.5. Manejar `QuotaExceededError` en `localStorage`
- **Evidencia:** `js/project-storage.js:1782-1784`, `2222`, `2237` tienen bloques `catch (_) {}` vacíos.
- **Acción:** Capturar errores de cuota, notificar con `showToast(..., 'warning')` y evitar fallo silencioso al guardar logos o recientes.
- **Criterio de aceptación:** Al superar cuota de `localStorage`, el usuario recibe aviso claro.

---

## Checklist de Avance
- [x] 1.1. Suite `tests/run-all.js` al 100% (`63/63`)
- [x] 1.2. Guard Paso 1 → Paso 2 corregido
- [x] 1.3. ShadowMap unificado (`_fitNearFar = false`)
- [x] 1.4. `showStatus` sanitizado
- [x] 1.5. `QuotaExceededError` manejado en `project-storage.js`

## Registro de Avances
- **2026-11-26 (Agente Auditor):** Completadas tareas 1.2, 1.3, 1.4 y 1.5.
- **2026-11-26 (3 Agentes en paralelo):** Reparados los 18 tests fallidos de la tarea 1.1. Suite completa verificada al 100% (`63/63` superadas).
