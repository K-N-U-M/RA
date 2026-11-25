# FASE 4 (Auditoría Externa v2) — Arquitectura Modular, Vite/ESM, Store Único y SDK B2B

> **Origen:** Auditoría Externa Clean-Room v2 (2026-11-25) · Rama evaluada: `feat/remediacion-aaa`  
> **Protocolo para IAs:** Consulta [00-INDICE.md](./00-INDICE.md) y registra cada avance en [99-REGISTRO-AVANCES.md](./99-REGISTRO-AVANCES.md).

---

## Métricas Verificadas de Línea Base (2026-11-25)

| Métrica | Valor Real Medido | Evidencia |
| :--- | :--- | :--- |
| Archivos JS en `js/` | **102 archivos** (**103.919 líneas**) | Top 5 monolitos suman **31.042 líneas (29,9 %)** |
| Monolitos principales | `app-main.js` (8.650), `working-plane.js` (8.313), `financials.js` (7.483), `proposal-style-studio.js` (3.391), `docs-generator.js` (3.205) | Siguientes 5: `cable-engine.js` (3.129), `project-config.js` (3.090), `solar-heatmap.js` (3.060), `electrical-engine.js` (2.983), `project-storage.js` (2.824) |
| Cáscara HTML | `index.html`: **4.130 líneas** (396,8 KB) | **100** `<script>` (99 `defer`, 0 `type="module"`), **101** `?v=`, **496** `on*`, **1.511** `style=` |
| Globales `window.*` | **1.052 asignaciones** · **517 símbolos únicos** · **5.869 referencias** | `WP` (2.073 refs/42 archivos), `solarProjectConfig` (652/33), `allRenderedPanels` (294/33), `obstacles` (280/23) |
| Bloques `catch` vacíos/silenciosos | **484** en **74** archivos | `project-storage.js` (93), `app-main.js` (51), `working-plane.js` (42), `financials.js` (32), `company-branding.js` (15) |
| Adopción de capas modernas | `RA.Store`: **4/102** (3,9 %) · `RA.EventBus`: **14/102** (13,7 %) · `RA.AIService`: **1/5** clientes Gemini · ESM: **0 %** | `vite.config.js` existe pero `vite` no está en `package.json`; `tsconfig.json` con `checkJs: false` y solo 1 `@ts-check` |

---

## Tabla de Tickets Accionables — Fase 4

| ID | Título | Sev. | Esf. | Dependencias | Estado |
| :--- | :--- | :---: | :---: | :--- | :---: |
| **V2-F4-01** | Activar Vite real + ESM bootstrap único y migrar Workers a ESM sin `importScripts` ni `?v=` | P0 | L | Fases 0–3 v2 | `[Pendiente]` |
| **V2-F4-02** | Consolidar `RA.Store` v2 serializable (sin entidades Cesium) y retirar `window._lastFinModel` / `RA_App` | P0 | XL | V2-F4-01 | `[Pendiente]` |
| **V2-F4-03** | Extraer capa `packages/core-domain/` pura (0 DOM, 0 Cesium) troceando `financials.js`, `working-plane.js` y `app-main.js` | P0 | XL | V2-F4-02 | `[Pendiente]` |
| **V2-F4-04** | Cobertura completa de `RA.EventBus` y retirada de `CustomEvent` aislados | P1 | M | V2-F4-01 | `[Pendiente]` |
| **V2-F4-05** | Erradicar los 484 `catch` silenciosos con telemetría estructurada en `RA_ErrorHandler` y regla lint anti-catch vacío | P1 | L | V2-F4-01 | `[Pendiente]` |
| **V2-F4-06** | Unificar `@ra/sdk` sobre `packages/core-domain/` (fin dual-truth) + dual ESM/CJS + `.d.ts` + `checkJs` incremental | P2 | L | V2-F4-03 | `[Pendiente]` |

---

### `V2-F4-01` — Cutover Real a Vite + ESM y Workers Modulares
- **Estado:** `[Pendiente]`
- **Evidencia:** `vite.config.js:18-20` define `worker: { format: 'es' }` pero `vite` no está en `package.json:21-26`; `js/solar-worker.js:13` usa `importScripts('radiation-engine.js?v=20261124_f3', ...)` con deriva frente a `index.html:45` (`?v=20261118_t3`); `js/wind/wind-worker.js:20-24,207` mezcla `<script defer>` con auto-spawn `new Worker(...)`; `js/solar-heatmap.js:1035` usa ruta fija con `?v=`.
- **Plan técnico:**
  1. Añadir `vite` a `devDependencies`, crear punto de entrada único `src/main.js` que reemplace los 99 `<script defer>` y 101 `?v=` por bundles con hash de contenido.
  2. Separar `js/wind/wind-worker.js` en cliente + worker puro e importar física vía `import` ESM en `solar-worker.js` y `wind-worker.js` mediante `new Worker(new URL(..., import.meta.url), { type: 'module' })`.
  3. Sustituir la copia manual de `functions/wasp-parser.js` (`scripts/inject-build-meta.mjs:9`) por dependencia de workspace compartido.
- **Criterios de aceptación:** `npm run build` genera `dist/` funcional con 0 etiquetas `?v=` manuales y ambos Workers ejecutan en modo ESM sin errores.

### `V2-F4-02` — Store Único Serializable (`RA.Store` v2) y Time-Travel Completo
- **Estado:** `[Pendiente]`
- **Evidencia:** `RA.Store` (`js/ra-store.js:1-144`) solo se usa en 4/102 archivos y dual-escribe `window._lastFinModel` (`:119-121`); el estado real vive mutado en `WP`, `solarProjectConfig`, `allRenderedPanels`, `obstacles`, `buildings`, `panelConfig`; `js/collab-timetravel.js:33-51,99-118` solo captura un subconjunto hardware superficial y raspa `#tit-nombre` del DOM.
- **Plan técnico:**
  1. Definir slices tipados y 100 % serializables (planos, polilíneas, paneles, obstáculos, edificios, hardware, finanzas, simulación) sin ninguna referencia a entidades GPU/Cesium.
  2. Hacer que `project-storage.js` y `collab-timetravel.js` serialicen/restauren directamente instantáneas completas del Store (eliminando la necesidad de `_raSanitizeForExport` en `js/project-storage.js:90-110`).
  3. Retirar `window._lastFinModel`, `window.RA_App` (`index.html:25`, `js/error-handler.js:139`) y encapsular los accesos directos a `localStorage` de 30 archivos tras un repositorio unificado.
- **Criterios de aceptación:** Restaurar una instantánea de `collab-timetravel.js` reconstruye también geometría 3D, obstáculos y hardware; 0 entidades Cesium dentro del estado de dominio.

### `V2-F4-03` — Extracción de `packages/core-domain/` y Desmantelamiento de Monolitos
- **Estado:** `[Pendiente]`
- **Evidencia:** `js/working-plane.js` (269 DOM / 599 Cesium / 764 `window.*`), `js/financials.js` (199 DOM / 458 `window.*` / 6 llamadas directas a `getProjectCalcs()`), `js/project-storage.js` (75 DOM / 24 Cesium), `js/cable-engine.js` (10 DOM / 596 Cesium), `js/solar-heatmap.js` (37 DOM / 192 Cesium).
- **Plan técnico:**
  1. Separar `financials.js` en motor financiero puro (`packages/core-domain/financial`) + vistas DOM/PDF (`src/ui/financial/`).
  2. Separar `working-plane.js` en matemática de planos/polígonos/layout (`packages/core-domain/geometry`) + adaptador Cesium (`src/infrastructure/cesium/`) + overlay 2D (`src/ui/triad/`).
  3. Descomponer `app-main.js` en bootstrap, adaptador de visor y controladores por paso, retirando los 742 handlers `on*` inline y 1.511 `style=` para desbloquear CSP estricta.
- **Criterios de aceptación:** Ningún archivo de `packages/core-domain/` referencia `document`, `window` ni `Cesium`; ningún módulo JS supera 1.500 líneas.

### `V2-F4-04` — Cobertura Completa de `RA.EventBus`
- **Estado:** `[Pendiente]`
- **Evidencia:** `RA.EventBus` (`js/ra-event-bus.js`) cubre solo 14/102 archivos (13,7 %); persisten `CustomEvent`/`dispatchEvent` directos en `js/bill-auditor.js` (4 llamadas) y `js/scenario-comparator.js` (1), mientras la mayor parte de módulos invoca funciones globales directamente (`js/collab-timetravel.js:112-114`).
- **Plan técnico:** Migrar todos los `CustomEvent` aislados y llamadas cruzadas entre pasos/paneles al catálogo tipado de `RA.Events`.
- **Criterios de aceptación:** 0 `dispatchEvent(new CustomEvent(...))` fuera de `ra-event-bus.js`.

### `V2-F4-05` — Observabilidad Real y Erradicación de 484 `catch` Silenciosos
- **Estado:** `[Pendiente]`
- **Evidencia:** 484 `catch` vacíos/silenciosos en 74 archivos (`project-storage.js`: 93, `app-main.js`: 51, `working-plane.js`: 42, `financials.js`: 32); `RA_ErrorHandler` (`js/error-handler.js`) solo se usa en 12/102 archivos y los listeners wildcard de `ra-event-bus.js:86` y `ra-store.js:66` tragan excepciones sin aviso.
- **Plan técnico:** Canalizar errores operativos a `RA.ErrorHandler.handle(err, ctx)` con contexto estructurado, añadir regla de lint `no-empty` para `catch` en CI y ampliar el buffer de diagnóstico.
- **Criterios de aceptación:** 0 bloques `catch` vacíos en los 5 archivos críticos y reporte centralizado activo en EventBus/Store.

### `V2-F4-06` — `@ra/sdk` Sin Dual-Truth y TypeScript Incremental
- **Estado:** `[Pendiente]`
- **Evidencia:** `js/ra-sdk-plugins.js:98-203` reimplementa heurísticas simplificadas (`defaultYieldKwhKwp`, `unitCapexEurWp`, `_computeIrr`) en vez de delegar en los motores canónicos, garantizando divergencias entre cotizaciones B2B y la app web; `packages/ra-sdk/` solo exporta CJS sin `.d.ts`.
- **Plan técnico:** Reconstruir `@ra/sdk` como fachada fina sobre `packages/core-domain/`, publicar dual ESM/CJS con declaraciones `.d.ts` y activar `checkJs: true` en `tsconfig.json`.
- **Criterios de aceptación:** Mismo proyecto evaluado vía `@ra/sdk` en Node y vía web devuelve resultados idénticos al céntimo y al kWh.
