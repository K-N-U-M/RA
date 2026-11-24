# FASE 4 — Refactorización hacia Arquitectura Modular (ESM, Vite, Store Central y Desacoplamiento)

> **Objetivo de la fase:** Desmantelar progresivamente los monolitos (`app-main.js` 10.003 L, `working-plane.js` 8.172 L, `financials.js` 8.163 L, `index.html` 4.222 L), eliminar el ecosistema global de 749 símbolos `window.*` y unificar el estado en un Store puro serializable con capas Engine (sin DOM/Cesium), Adapters 3D y UI.
> **Prerrequisitos recomendados:** Haber limpiado código muerto/duplicado en [04-FASE-3-codigo-muerto-y-duplicado.md](./04-FASE-3-codigo-muerto-y-duplicado.md) para no migrar código zombi ni funciones clonadas.
> **Protocolo para IAs:** Consulta [00-INDICE.md](./00-INDICE.md) y documenta cada hito incremental en [99-REGISTRO-AVANCES.md](./99-REGISTRO-AVANCES.md). **No reescribir todo en "Big Bang"**: seguir estrictamente el Strangler Pattern incremental para mantener la app funcional tras cada PR.

---

## Métricas Baseline Verificadas (Punto de Partida)

- **Volumen total:** 82 archivos `.js` (**99.696 líneas**, ~4,80 MB sin minificar) + `index.html` (4.222 L) + `styles.css` (3.356 L).
- **Top 3 monolitos JS:** `js/app-main.js` (10.003 L), `js/working-plane.js` (8.172 L), `js/financials.js` (8.163 L) → **26.338 líneas** en solo 3 ficheros.
- **Carga en navegador:** 78 `<script defer>` + 1 inline en `index.html`; **0** módulos ES (`import`/`export`); **74** cadenas manuales `?v=...` en **37** versiones distintas (con *version skew* real entre hilo principal y `wind-worker.js`).
- **Scope global:** **17/82** archivos sin IIFE; **749** símbolos asignados en `window` (1.641 escrituras / 5.638 lecturas); **79** mutados desde múltiples archivos.
- **Violación SoC:** **2.084** ops DOM en `js/` (incluyendo `financials.js` 222, `bill-auditor.js` 97, `solar-engine.js` 45, `electrical-engine.js` 14, `bom-tree.js` 14, `cable-engine.js` 10) y **5.217** referencias directas a `Cesium.` / `viewer.`.
- **Resiliencia/Tipado:** **0** archivos con `@ts-check` o `tsconfig.json`; **451** bloques `catch` vacíos/silenciosos; **3** buses de eventos desconectados compitiendo (con evento fantasma `'ra:project-updated'` vs `'ra-project-changed'`).

---

## Tabla de Tareas — Fase 4

| ID | Título | Severidad | Esfuerzo | Dependencias | Origen | Estado |
| :--- | :--- | :---: | :---: | :--- | :--- | :--- |
| **F4-01** | Introducir Vite + ES Modules base y eliminar `?v=` manuales / version skew en Workers | P1 | L | Fase 3 | C-06 + C-07 | `[Parcial]` |
| **F4-02** | Configurar TypeScript incremental (`allowJs`, `checkJs`) y contratos compartidos `@ra/contracts` | P1 | L | F4-01 | C-09 | `[Hecho]` |
| **F4-03** | Implantar Store Centralizado + Typed Event Bus único (Strangler Bridge + fin ciclo calcs↔fin) | P0 | XL | F4-01 | C-05 | `[Hecho]` |
| **F4-04** | Unificar telemetría/errores, erradicar 451 `catch` vacíos y eliminar timers ciegos / doble mutex | P1 | M | F4-01, F4-03 | C-08 + C-10 | `[Parcial]` |
| **F4-05** | Encapsular 749 globales `window.*`, IIFEs pendientes y orden implícito de scripts | P0 | L | F4-01, F4-03 | C-02 + C-03 | `[Parcial]` |
| **F4-06** | Extraer motores puros sin DOM ni Cesium (`@ra/solar`, `@ra/electrical`, `@ra/financial`, `@ra/cad`) | P0 | XL | F4-02, F4-03 | C-04 | `[Pendiente]` |
| **F4-07** | Desmantelar los 3 monolitos (`app-main`, `working-plane`, `financials`) e inline handlers de `index.html` | P0 | XL | F4-03..F4-06 | C-01 | `[Parcial]` |
| **F4-08** | Aislar servicio IA/APIs externas en adaptador BFF (retirar Gemini `fetch` de `financials.js`) | P2 | M | F0-09, F4-06 | C-11 | `[Hecho]` |

---

## Arquitectura Objetivo AAA (Diagrama de Referencia)

```text
+-------------------------------------------------------------------------+
|                           PRESENTATION / UI LAYER                       |
|  Módulos UI delegados (data-action) · Sidebar 5 Pasos · Modales · HUD   |
|  Consumo exclusivo vía Selectores + Dispatch de Acciones al Store       |
+------------------------------------+------------------------------------+
                                     | suscripción reactiva / acciones
+------------------------------------v------------------------------------+
|                         APPLICATION / STATE LAYER                       |
|  - Store Unificado (SSOT serializable JSON v3, sin refs Cesium/DOM)     |
|  - Typed Event Bus único (step:changed, geometry:mutated, hw:changed)   |
|  - Command / Undo-Redo Stack (patches inmutables)                       |
|  - Workflow FSM desacoplada del DOM                                     |
+------------------+-----------------------------------+------------------+
                   | DTOs puros                        | puertos / eventos
+------------------v------------------+ +--------------v------------------+
|        PURE DOMAIN ENGINE           | |     INFRASTRUCTURE ADAPTERS     |
|  (Zero DOM, Zero Cesium, Isomórfico)| |                                 |
|  - solar-physics (Perez/TMY/POA)    | |  - CesiumSceneAdapter           |
|  - cad-geometry (2D/3D, packer)     | |    (Map<id, Entity/Primitive>,  |
|  - electrical-rebt (MPPT/ΔV/RCD)    | |     SceneRenderScheduler)       |
|  - financial (CAPEX/VAN/TIR/LIVA)   | |  - PersistenceAdapter           |
|  - wind (CFD/AEP/Acoustics/Dispatch)| |    (IndexedDB/Storage/Firestore)|
|  - bom (Mediciones & Cargas CTE)    | |  - DocumentRendererAdapter      |
+------------------+------------------+ |  - ExternalAPIAdapter (BFF/IA)  |
                   |                    |  - TelemetryService             |
+------------------v------------------+ +---------------------------------+
|      COMPUTE WORKERS (Module)       |
|  - solar.worker.ts / wind.worker.ts |
+-------------------------------------+
```

---

## Detalle Técnico por Tarea

### `F4-01` — Introducir Vite + ES Modules base y eliminar `?v=` manuales / version skew en Workers

| Campo | Valor |
| :--- | :--- |
| **Categoría** | Build/Empaquetado |
| **Severidad** | P1 (Alto) |
| **Esfuerzo** | L (1–3 días) |
| **Dependencias** | Fase 3 completada |
| **Origen** | C-06 + C-07 |
| **Rama sugerida** | `arch/vite-bundler-esm` |
| **Estado** | `[Pendiente]` |

#### Contexto y Problema
La app sirve 78 scripts sin bundling (>5 MB en bruto), `firebase.json` fuerza `no-cache` en todos los assets por ausencia de content-hash y **37 versiones distintas `?v=`** provocan *version skew* activo: `index.html:58,69` carga `wind-constants.js?v=20261024b` mientras `wind-worker.js:141,144` importa `?v=20261118_t3`. Además `js/error-handler.js` y `js/ra-env.js` carecen de versión.

#### Evidencia Verificada
- `package.json:1-13` (0 dependencias)
- `index.html:9-115` (78 `<script defer>`, 74 `?v=`)
- `js/lazy-loader.js:87, 98, 110, 122, 128`
- `js/solar-heatmap.js:1028`, `js/solar-worker.js:14`
- `js/wind/wind-worker.js:141, 144` vs `index.html:58, 69`
- `firebase.json:79-85`

#### Pasos de Implementación
1. Inicializar Vite en `package.json` (`vite`, `vite-plugin-static-copy` si se sirve Cesium local o manteniendo Cesium externalizado/CDN de forma explícita), creando `vite.config.js` con soporte para Web Workers ESM (`{ type: 'module' }`).
2. Crear entrypoint `src/main.js` (mientras los módulos legacy se cargan ordenadamente mediante plugin HTML o `import` secuencial) e ir retirando los 78 `<script>` y todas las query strings `?v=` de `index.html`, `lazy-loader.js`, `solar-heatmap.js`, `solar-worker.js` y `wind-worker.js`.
3. Migrar `solar-worker.js` y `wind-worker.js` a instanciación estándar `new Worker(new URL('./...', import.meta.url), { type: 'module' })` compartiendo los mismos módulos fuente (`radiation-engine`, `polygon-shadow-math`, `wind-constants`, `wind-obstacle-interference`) para erradicar el *version skew*.
4. Actualizar `firebase.json` para servir `dist/` con `Cache-Control: public, max-age=31536000, immutable` en `/assets/**` manteniendo `no-cache` solo en `index.html`.
5. Antes de borrar scripts legacy de `index.html`, capturar golden-master snapshots de `tests/` para asegurar cero regresiones.

#### Criterios de Aceptación
- `npm run build` produce `dist/` con chunks hasheados, árbol tree-shaken y bundle inicial crítico `< 300 KB` gzip (excluyendo Cesium CDN).
- `rg "\?v="` en `index.html` y `js/` devuelve **0** ocurrencias.
- Hilo principal y ambos Web Workers consumen exactamente el mismo artefacto compilado de física solar y eólica.

---

### `F4-02` — Configurar TypeScript incremental (`allowJs`, `checkJs`) y contratos compartidos `@ra/contracts`

| Campo | Valor |
| :--- | :--- |
| **Categoría** | Build/Empaquetado |
| **Severidad** | P1 (Alto) |
| **Esfuerzo** | L (1–3 días) |
| **Dependencias** | F4-01 |
| **Origen** | C-09 |
| **Rama sugerida** | `arch/typescript-contracts` |
| **Estado** | `[Pendiente]` |

#### Contexto y Problema
No existe `tsconfig.json` ni validación estática (`0/82` archivos verificados). Esto provoca errores silenciosos como **9 claves duplicadas** en un mismo literal de retorno en `project-calcs.js:298-426`, comprobaciones defensivas continuas (`wp || potencia || power`, `tiltDeg` vs `pitch`, `lng` vs `lon`, `lat` vs `latitude`) y roturas ocultas al cambiar estructuras.

#### Evidencia Verificada
- Ausencia de `tsconfig.json`/`jsconfig.json`; `82` JSDoc `@param` parciales en `99.696` líneas.
- `js/project-calcs.js:298-426` (`V_max_inv`, `V_mppt_min`, `V_mppt_max`, `I_ac_d`, `monofasico`, `numStrings`, `modsPerStr`, `Voc_string`, `P_dc_kW` declaradas dos veces).
- `js/electrical-engine.js:54, 57, 83`, `js/modules-breakdown.js:69`, `js/project-config.js:525`, `js/project-hierarchy.js:151`, `js/solar-yield-controller.js:36`.

#### Pasos de Implementación
1. Crear `tsconfig.json` con `allowJs: true`, `checkJs: false` inicialmente y activar progresivamente `// @ts-check` por archivo comenzando por motores puros y contratos.
2. Definir `src/contracts/` (`.ts` o `.d.ts` + normalizadores en frontera de entrada): `ModuleSpec`, `InverterSpec`, `RoofPolyline`, `ProjectState`, `ElectricalSizingResult`, `FinancialResult` con nombres canónicos únicos (`wp`, `lng`, `lat`, `tiltDeg`, `gammaVoc`, `betaVmp`, `alphaIsc`).
3. Eliminar las claves duplicadas en `js/project-calcs.js:298-426` preservando los valores exactos esperados por consumidores.
4. Añadir `npm run typecheck` (`tsc --noEmit`) al workflow de CI.

#### Criterios de Aceptación
- `tsc --noEmit` termina con código 0 y cubre progresivamente los módulos núcleo migrados.
- `js/project-calcs.js` no tiene ninguna clave duplicada en objetos literales ni aliases inconsistentes en modelos recién normalizados.

---

### `F4-03` — Implantar Store Centralizado + Typed Event Bus único (Strangler Bridge + fin ciclo `calcs <-> fin`)

| Campo | Valor |
| :--- | :--- |
| **Categoría** | Estado/SSOT |
| **Severidad** | P0 (Crítico) |
| **Esfuerzo** | XL (>3 días) |
| **Dependencias** | F4-01 |
| **Origen** | C-05 |
| **Rama sugerida** | `arch/central-store-event-bus` |
| **Estado** | `[Pendiente]` |

#### Contexto y Problema
1. El estado del proyecto vive disperso y duplicado (`solarProjectConfig`, `panelConfig`, `equipmentCatalog`, `WP.polylines`, `polygonPoints`, `lastRoofInfo`, `allRenderedPanels`, 22 claves en `localStorage`) con parches de mutación forzada tras navegar (`[AUDIT-LOCK]` en `project-storage.js:1793-1816`).
2. **Dependencia circular** activa entre `project-calcs.js:218` y `financials.js:6830` enmascarada con bandera global `_isComputingFinModel`.
3. **Tres buses desconectados** (`ProjectHierarchy.notify`, `WorkflowOrchestrator.emit`, `CustomEvent`), incluyendo un bug de nombres incompatibles: `app-main.js:759` / `bill-auditor.js:1494` emiten `'ra-project-changed'` pero `project-status-hud.js:819-820` escucha `'ra:project-updated'` (nunca se entera, forzando `setInterval` de 5 s).
4. `undo-manager.js:587-588` realiza `JSON.stringify` de árboles con entidades GPU filtradas con listas manuales `SKIP_KEYS`.

#### Evidencia Verificada
- `js/project-config.js:1-24, 513-531, 628-640, 729-747`
- `js/project-calcs.js:218-223` <-> `js/financials.js:6830-6833`
- `js/project-storage.js:44-64, 1793-1816` (`[AUDIT-LOCK]`)
- `js/project-hierarchy.js:35-39`, `js/workflow-orchestrator.js:107-117`
- `js/app-main.js:759`, `js/bill-auditor.js:1494` vs `js/project-status-hud.js:819-820, 854-857`
- `js/undo-manager.js:28-40, 587-588`

#### Pasos de Implementación
1. Crear `src/state/store.js` (~120–180 líneas, inspirado en Zustand/Redux vanilla inmutable con slices: `projectMeta`, `site`, `geometry`, `catalog`, `hardware`, `mppt`, `simulation`, `financial`, `ui`) y `src/state/eventBus.js` único con constantes tipadas de eventos.
2. Unificar los 3 buses actuales y corregir inmediatamente `'ra-project-changed'` vs `'ra:project-updated'` redirigiéndolos al `eventBus` único; retirar los parches `[AUDIT-LOCK]` y el `setInterval(..., 5000)` del HUD.
3. Romper el ciclo `project-calcs <-> financials` creando un DAG de selectores puros memoizados: `GeometrySelector -> ProductionSelector -> ElectricalSelector -> BomSelector -> FinancialSelector` (eliminando `_isComputingFinModel` y `_lastFinModel`).
4. Mantener durante la transición un `legacyStateBridge` (getters/setters `Object.defineProperty` o proxies reactivos) sobre `window.solarProjectConfig` y `WP.polylines` para que los módulos aún no migrados no rompan.
5. Mantener cualquier `Cesium.Entity`/`Primitive` fuera del Store en `Map<entityId, gpuHandle>` dentro de `CesiumSceneAdapter`, limpiando `SKIP_KEYS` y migrando `undo-manager.js` a diffs/comandos sobre el Store puro JSON.

#### Criterios de Aceptación
- Cero referencias a `Cesium.*` o nodos DOM dentro del árbol serializado del `Store`.
- Eliminada bandera `_isComputingFinModel` y ciclo entre `project-calcs` y `financials`.
- Al editar factura o geometría, el HUD recibe el evento en `< 16 ms` sin polling de 5 segundos.

---

### `F4-04` — Unificar telemetría/errores, erradicar 451 `catch` vacíos y eliminar timers ciegos / doble mutex

| Campo | Valor |
| :--- | :--- |
| **Categoría** | Arquitectura / Concurrencia |
| **Severidad** | P1 (Alto) |
| **Esfuerzo** | M (2–8 horas) |
| **Dependencias** | F4-01, F4-03 |
| **Origen** | C-08 + C-10 |
| **Rama sugerida** | `arch/telemetry-and-lifecycle-promises` |
| **Estado** | `[Pendiente]` |

#### Contexto y Problema
1. Existen **451 `catch` vacíos/silenciosos** (`project-storage.js` 91, `app-main.js` 59, `working-plane.js` 43, `financials.js` 35, `solar-worker.js:15`, `wind-worker.js:152`) y dos handlers globales de `unhandledrejection` compitiendo (`error-handler.js` vs `config.js`, que hace `preventDefault()`).
2. La coordinación de arranque y carga diferida usa **100 `setTimeout`** ciegos (`4000ms`, `8000ms`, `1000ms`, `50ms`), doble cargador de scripts (`lazy-loader.js` + `firebase-service.js:71`) y un **doble mutex** de render 3D (`_wpRenderSerialChain` en `panel-renderer-3d.js` puenteado por llamadas directas a `wpFastRenderSimulatedPanelsAsync` + `_raRenderActivePromise`).
3. `solar-heatmap.js` re-instancia `new Worker(...)` desde cero en cada cálculo.

#### Evidencia Verificada
- `js/error-handler.js:6-58, 102-132`, `js/config.js:165-174`, `js/app-main.js:53, 77-78`
- `js/panel-renderer-3d.js:4-39` vs `js/cable-engine.js:78-79`, `js/shadow-settings.js:285-286`, `js/app-main.js:7325-7326, 7589-7605`
- `js/app-main.js:440, 9998`, `js/ui-viewport-controls.js:737`, `js/firebase-service.js:71-78, 357-360`, `js/lazy-loader.js:28, 145, 150-191`
- `js/solar-heatmap.js:1024-1029`, `js/solar-worker.js:13-15`, `js/wind/wind-worker.js:139-154`

#### Pasos de Implementación
1. Consolidar `TelemetryService` / `ErrorBoundary` único (un solo handler `error` y `unhandledrejection`, clasificación `debug|info|warn|error|fatal`, breadcrumbs de usuario y scrubbing PII), eliminando progresivamente los 451 `catch {}` silenciosos por registro explícito o manejo degradado visible cuando afecte datos.
2. Sustituir los `setTimeout` de secuencia de arranque por promesas explícitas (`whenCesiumReady`, `whenStorageReady`, `whenUIReady`).
3. Reemplazar `lazy-loader.js` y el cargador de `firebase-service.js` por `import()` dinámico nativo de Vite (eliminando el `_isLazyProxy` parcial de 5 métodos).
4. Unificar todas las peticiones de render 3D de paneles por un único `SceneRenderScheduler` (cerrando llamadas directas a `wpFastRenderSimulatedPanelsAsync` y retirando el segundo lock `_raRenderActivePromise`) y reutilizar Workers persistentes con cancelación por `AbortController` sin silenciar errores de carga en worker.

#### Criterios de Aceptación
- Cero `catch {}` mudos en módulos de persistencia, workers y motores (regla ESLint `no-empty` activa).
- Arranque en throttling "Slow 3G" sin fallos de orden ni timers arbitrarios.
- Un único mutex/cola serial controla el render de paneles 3D.

---

### `F4-05` — Encapsular 749 globales `window.*`, IIFEs pendientes y orden implícito de scripts

| Campo | Valor |
| :--- | :--- |
| **Categoría** | Acoplamiento |
| **Severidad** | P0 (Crítico) |
| **Esfuerzo** | L (1–3 días) |
| **Dependencias** | F4-01, F4-03 |
| **Origen** | C-02 + C-03 |
| **Rama sugerida** | `arch/remove-global-pollution` |
| **Estado** | `[Pendiente]` |

#### Contexto y Problema
17 de 82 archivos no tienen siquiera un IIFE, contaminando el scope léxico global con `const viewer`, `const scene`, `const universalGizmoState`; `cad-events-controller.js:7` usa `scene` implícito; `project-config.js:26` asume que un script anterior ya creó `window.RA`; `panel-renderer-3d.js:30` llama funciones definidas 24 scripts después; existen duplicaciones de bindings (`applyInverterFromCatalog` asignado 4 veces entre `working-plane.js` y `app-main.js`), fragmentación `window.RA_App` vs `window.RA`, y **monkey-patching** de `window.wpUpdateUI` / `step3UpdateHardwareSelection` que falla cuando la función es llamada localmente dentro de una IIFE (`26` llamadas locales en `working-plane.js` saltándose el wrapper del HUD).

#### Evidencia Verificada
- 17 archivos sin IIFE: `js/app-main.js:463, 484`, `js/project-config.js:1-3064`, `js/universal-gizmo-3d.js:6`, `js/panel-renderer-3d.js:4-5, 30`, etc.
- `js/cad-events-controller.js:7`, `js/project-config.js:26`, `js/workflow-orchestrator.js:65-69`
- `js/working-plane.js:6142, 6798-6800, 7905-7907` vs `js/app-main.js:13-21, 6109-6111, 6342-6348`
- `js/project-status-hud.js:836-843`, `js/mppt-matrix-controller.js:1444-1452`
- `index.html:25`, `js/error-handler.js:137-140` (`RA_App` vs `RA`)

#### Pasos de Implementación
1. Convertir los 17 archivos sin IIFE en módulos ES (`export`/`import`) pasando un objeto explícito `AppContext` (`viewer`, `store`, `eventBus`, `telemetry`) en lugar de variables léxicas `scene`/`viewer`.
2. Unificar namespace retirando `window.RA_App` a favor de `window.RA` (durante la transición) y eliminar las asignaciones repetidas de `applyInverterFromCatalog` / `applyBatteryFromCatalog` / `deleteCatalogItem`.
3. Reemplazar los wrappers de monkey-patching (`project-status-hud.js` sobre `wpUpdateUI`, `mppt-matrix-controller.js` sobre `step3UpdateHardwareSelection`) por suscripciones limpias al `eventBus` único (`ui:refreshed`, `hardware:updated`).

#### Criterios de Aceptación
- ESLint `no-undef` y `no-redeclare` pasan en verde sobre todos los módulos migrados.
- Cero `monkey-patching` sobre funciones `window.*` y cero dependencias implícitas de orden en `<script>`.

---

### `F4-06` — Extraer motores puros sin DOM ni Cesium (`@ra/solar`, `@ra/electrical`, `@ra/financial`, `@ra/cad`)

| Campo | Valor |
| :--- | :--- |
| **Categoría** | Arquitectura (SoC) |
| **Severidad** | P0 (Crítico) |
| **Esfuerzo** | XL (>3 días) |
| **Dependencias** | F4-02, F4-03 |
| **Origen** | C-04 |
| **Rama sugerida** | `arch/pure-domain-engines` |
| **Estado** | `[Pendiente]` |

#### Contexto y Problema
Los motores de ingeniería mezclan cálculo físico/normativo/financiero con manipulación directa del DOM (**2.084** ops DOM totales, destacando `financials.js` 222, `bill-auditor.js` 97, `solar-engine.js` 45, `electrical-engine.js` 14, `bom-tree.js` 14, `cable-engine.js` 10, `solar-optimizer.js` 9) y Cesium (`5.217` referencias). Esto impide ejecutar cálculos puros en Node/Workers sin mocks ni reutilizarlos en API backend.

#### Evidencia Verificada
- `js/financials.js:6879-6903` (lee y muta DOM dentro de `calculateFinancialModel`)
- `js/project-calcs.js:166-169, 430-442` (`document.getElementById`)
- `js/electrical-engine.js:1928-2244` (generación HTML + `lucide.createIcons()`)
- `js/cable-engine.js:2741-2948`, `js/solar-engine.js:794-797, 934-1060`, `js/solar-optimizer.js:497-715`, `js/bom-tree.js:1173-1425`

#### Pasos de Implementación
1. Definir `src/engine/` con regla absoluta **Cero `document`, Cero `window`, Cero `Cesium`** (usar interfaces geométricas puras `Vec2`/`Vec3`/`Mat4` en lugar de `Cesium.Cartesian3`).
2. Extraer por sub-fases en orden: (a) `src/engine/electrical` + `src/engine/bom`, (b) `src/engine/solar` + `src/engine/wind`, (c) `src/engine/financial`, (d) `src/engine/cad` (offsets, rejillas de módulos, intersecciones).
3. Mover todo renderizado HTML de tarjetas/asistentes/tablas a `src/ui/` y toda construcción de entidades/primitivas 3D a `src/adapters/cesium/`.

#### Criterios de Aceptación
- El directorio `src/engine/` supera `node` + Web Worker unit tests sin mockear `window`, `document` ni `Cesium`.
- Los cálculos regresan DTOs idénticos a los golden-master snapshots antes de la extracción.

---

### `F4-07` — Desmantelar los 3 monolitos (`app-main`, `working-plane`, `financials`) e inline handlers de `index.html`

| Campo | Valor |
| :--- | :--- |
| **Categoría** | Arquitectura |
| **Severidad** | P0 (Crítico) |
| **Esfuerzo** | XL (>3 días) |
| **Dependencias** | F4-03, F4-04, F4-05, F4-06 |
| **Origen** | C-01 |
| **Rama sugerida** | `arch/decompose-monoliths-and-inline-handlers` |
| **Estado** | `[Pendiente]` |

#### Contexto y Problema
Tres ficheros concentran **26.338 líneas** (`app-main.js` 10.003, `working-plane.js` 8.172, `financials.js` 8.163), mezclando `'use strict'` inválido a mitad de `app-main.js:443` y fragmentos residuales (`L9971-10003`). Paralelamente, `index.html` suma 4.222 líneas con **495 handlers `on*` inline** que bloquean cualquier endurecimiento de CSP y atan la UI a funciones globales.

#### Evidencia Verificada
- `js/app-main.js:1-10003` (`L443` `'use strict'` inválido, `L9971-10003` fragmento residual)
- `js/working-plane.js:1-8172`, `js/financials.js:1-8163`
- `index.html:1-4222` (`495` handlers `on*` ej. `L479-529, 3877-3894`)

#### Pasos de Implementación
1. Trocear `app-main.js`, `working-plane.js` y `financials.js` por dominios cohesivos de **< 600–800 líneas** cada uno (`viewerBootstrap`, `cameraController`, `panelPlacementEngine`, `catalogService`, `equipmentCrudModal`, `financialEngine`, `financialModalUI`, etc.).
2. Sustituir gradualmente los 495 atributos `on*` inline de `index.html` por delegación de eventos `data-action="..."` sobre los contenedores principales (sidebar, header, cada modal) gestionados desde `src/ui/actionsRegistry.js`.
3. Separar modales extensos de `index.html` en plantillas/componentes UI cargados bajo demanda y retirar el pseudo-bloque `L443` al pasar a ESM (estricto por definición).

#### Criterios de Aceptación
- Ningún archivo JS fuente supera las **800–1.000 líneas**.
- **0** atributos `on*` inline en `index.html`.
- `legacy-bridge.js` eliminado al quedar todos los disparadores migrados a ESM + delegación.

---

### `F4-08` — Aislar servicio IA/APIs externas en adaptador BFF (retirar Gemini `fetch` de `financials.js`)

| Campo | Valor |
| :--- | :--- |
| **Categoría** | Arquitectura / Seguridad |
| **Severidad** | P2 (Medio) |
| **Esfuerzo** | M (2–8 horas) |
| **Dependencias** | F0-09 (proxy/reglas backend), F4-06 |
| **Origen** | C-11 |
| **Rama sugerida** | `arch/ai-adapter-bff` |
| **Estado** | `[Pendiente]` |

#### Contexto y Problema
`financials.js:545-557` ejecuta peticiones directas contra Gemini mezcladas con lógica financiera, y tres módulos distintos (`bill-auditor.js`, `equipment-ai-importer.js`, `equipment-web-search.js`) leen directamente la clave desde `localStorage` con prompts y parsing ad-hoc dispersos.

#### Evidencia Verificada
- `js/financials.js:545-557`
- `js/bill-auditor.js:341-364`, `js/equipment-ai-importer.js:44`, `js/equipment-web-search.js:41`
- `js/ra-env.js:1-16`

#### Pasos de Implementación
1. Crear `src/adapters/aiService.js` único que centralice prompts tipados, retry/backoff, parseo JSON validado y selección transparente entre endpoint autenticado Cloud Function BFF (producción SaaS) y proveedor BYOK opcional en entorno local.
2. Retirar todas las llamadas `fetch` a `generativelanguage.googleapis.com` y lecturas directas de claves API fuera de `aiService.js`.

#### Criterios de Aceptación
- `financials.js`, `bill-auditor.js`, `equipment-ai-importer.js` y `equipment-web-search.js` delegan al adaptador `aiService.js` sin construir URLs ni cabeceras de API key por su cuenta.
