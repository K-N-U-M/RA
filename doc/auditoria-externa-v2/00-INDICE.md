# Auditoría Externa Clean-Room v2 y Hoja de Ruta AAA — Índice Maestro

> **Proyecto auditado:** RA Solar 3D (`ra-solar-3d`) — Rama evaluada `feat/remediacion-aaa` · Versión `3.2.0` (`package.json`)  
> **Fecha de auditoría:** 2026-11-25 (Inspección independiente sin estado previo en 6 disciplinas en paralelo)  
> **Semáforo Global Actual:** 🟡 **AMARILLO — Estabilización funcional avanzada, pero con bloqueantes P0 reales de DOM (`#ra-doc-modal` comentado en `index.html`), despliegue (`public: "."` en vez de `dist/`), física/normativa (`solar-engine.js` Faiman viento 24/29 m/s, `electrical-engine.js` `S_earth=6 mm²`, `financials.js` arbitraje/IS B2B), rendimiento 3D y CI roto detectados en inspección limpia.**

---

## 1. Resumen Ejecutivo y Cifras Verificadas en Código

Esta segunda auditoría externa ("clean-room", sin asumir conocimiento previo del proyecto) inspeccionó de forma independiente y en paralelo **6 frentes**: Motor CAD 3D/WebGL, Ingeniería FV/Eléctrica/Eólica/Finanzas, Arquitectura de Software, Higiene/Código Muerto/Duplicado, UI/UX/WCAG 2.2 AA y AppSec/Persistencia/DevOps.

### Métricas Reales Medidas (2026-11-25)
- **Volumen JS:** **102 archivos** en `js/**/*.js` (**103.919 líneas**). Top 5 monolitos = **31.042 líneas (29,9 %)**: `app-main.js` (8.650), `working-plane.js` (8.313), `financials.js` (7.483), `proposal-style-studio.js` (3.391) y `docs-generator.js` (3.205).
- **Shell HTML/CSS:** `index.html` (**4.130 líneas**, 396,8 KB) con **100** `<script>` (**99** `defer`, **0** `type="module"`), **101** `?v=`, **496** handlers `on*` inline (**742** sumando JS) y **1.511** `style=""` inline; `css/styles.css` (**3.738 líneas**) con >18 sistemas de botones compitiendo.
- **Acoplamiento y Deuda Estructural:** **1.052** asignaciones a `window.*` (**517** símbolos únicos, **5.869** referencias), **484** bloques `catch` vacíos/silenciosos en **74** archivos, **0 % ESM**, `RA.Store` adoptado solo en **4/102** archivos (**3,9 %**), `RA.EventBus` en **14/102** (**13,7 %**) y `RA.AIService` en **1/5** clientes Gemini.
- **Código Muerto y Duplicado:** **~1.440–1.510 LOC** consolidables/eliminables (29 funciones JS sin llamadores = 459 LOC; 94 `getElementById` huérfanos = ~120 LOC; 4 fórmulas NPV/IRR divergentes; loop térmico/astronómico duplicado entre `solar-heatmap.js` y `solar-worker.js`; 36 escapes HTML locales; 4 clientes Gemini duplicados).
- **Bloqueantes P0 Inmediatos Detectados:**
  1. `index.html:3781,4130`: comentario HTML roto comenta todo `#ra-doc-modal` (formularios de documentación técnica desaparecidos del DOM) y deja un comentario sin cerrar al final del archivo.
  2. `firebase.json:3,19-20` + CI: hosting sirve `.` en vez de `dist/` y `test-security-contract.js` / `run-all.js` rompen la pipeline actual.
  3. **Física, REBT y Finanzas P0:** `solar-engine.js:541` pasa 24/29 m/s como velocidad del viento a Faiman (`yield` +3,5–5%); `electrical-engine.js:2832` fija `S_earth = 6 mm²` ignorando ITC-BT-18 Tabla 2 (`project-calcs.js:363` imprime `T_min = -10 °C`); `financials.js:6702-6722` carga y descarga batería simultáneamente en arbitraje; IVA/IS B2B en `financials.js:6466-6936` sobreestima VAN/TIR; `commercial-proposal-dossier.js:280` clasifica residenciales 2.0TD como Comercial (`indexOf('6.')` sin `!== -1`); `bankable-p50-p90.js` vs `docs-generator.js:1255-1277` se contradicen en la misma página.
  4. **CAD 3D & UX P0:** `RACadOsnap` (`cad-osnap-polar.js`) está 100 % desconectado del trazado; Section Planes (`cad-clash-section.js:268`) solo cortan `globe` (`show=false` en Google 3D Tiles); render incremental (`app-main.js:6279`) desincroniza picking/recoloración; `undo-manager.js:239` pasa firma errónea; `cesium-safety.js:112-135` no reconstruye obstáculos al perder contexto WebGL; tab MPPT del drawer (`ux-aaa-workspace.js:716-729`) clona HTML muerto; Outliner/Dropzone/Rosa inoperables por teclado.

---

## 2. Protocolo Obligatorio para Cualquier IA Ejecutora

1. **Seleccionar un único ticket** en `[Pendiente]` tras confirmar que sus **Dependencias** figuran como `[Hecho]`.
2. **Bloquear antes de editar:** cambiar su `Estado` a `[En curso]` en su ficha de fase y en la tabla maestra de este `00-INDICE.md` (rama dedicada o rama de trabajo acordada).
3. **Alcance estricto (Scope Lock):** tocar únicamente los módulos del ticket; respetar prohibiciones activas de ejecución masiva de tests si aplica.
4. **Cerrar y documentar:** actualizar `[Hecho]` en ambos sitios y añadir fila al final de [99-REGISTRO-AVANCES.md](./99-REGISTRO-AVANCES.md) con fecha ISO, ID, rama, commit, modelo/IA, resultado y detalle de verificación.

### Mapa de Paralelización Sin Conflictos de Archivo
- **Track P0 DOM + Despliegue/CI:** `V2-F0-01` (`index.html`) · `V2-F0-02` (`firebase.json`, `scripts/inject-build-meta.mjs`) · `V2-F0-03` (`tests/*`, `.github/workflows/tests.yml`).
- **Track P0 Física / REBT / Finanzas:** `V2-F0-04` (`solar-engine.js`) · `V2-F0-05` (`electrical-engine.js`, `project-calcs.js`) · `V2-F0-06` (`financials.js`, `commercial-proposal-dossier.js`) · `V2-F0-07` (`bankable-p50-p90.js`, `docs-generator.js`).
- **Track CAD 3D / WebGL:** `V2-F1-01` (`cad-osnap-polar.js`, `measure-tool.js`) → `V2-F1-03` → `V2-F1-04` (`spatial-index-dsm.js`). En paralelo: `V2-F1-02` (`cad-clash-section.js`) y `V2-F1-05` (`l-building-parametric.js`, `undo-manager.js`).
- **Track UI/UX & AppSec:** `V2-F0-09` / `V2-F5-01..03` (accesibilidad/contraste) en paralelo con `V2-F6-01..04` (`storage.rules`, `firestore.rules`, `functions/index.js`, `autosave-manager.js`).

---

## 3. Inventario Maestro de Tickets (48 Tickets en 8 Fases)

| Fase | Documento | Foco | Tickets | Severidad | Estado |
| :---: | :--- | :--- | :---: | :---: | :---: |
| **0** | [01-FASE-0-emergencias-p0-y-despliegue.md](./01-FASE-0-emergencias-p0-y-despliegue.md) | Emergencias P0: DOM roto, deploy/CI, física/REBT/finanzas críticos, render 3D y A11y P0 | `V2-F0-01..09` (9) | `9 P0` | `0/9` |
| **1** | [02-FASE-1-cad-3d-y-rendimiento-webgl.md](./02-FASE-1-cad-3d-y-rendimiento-webgl.md) | Motor 3D/CAD: OSNAP real, Section/OBB, fin `O(N²)`, 3D Tiles DSM, L-buildings y pulidos | `V2-F1-01..06` (6) | `2 P0, 3 P1, 1 P2` | `0/6` |
| **2** | [03-FASE-2-ingenieria-fv-electrica-tarifas.md](./03-FASE-2-ingenieria-fv-electrica-tarifas.md) | Ingeniería: Isc 1.25×, ΔV 2.5%, CNMC 3/2020 mensual, eólica, `solar-worker`, `.OND`/Bishop e integración SSOT | `V2-F2-01..06` (6) | `5 P1, 1 P2` | `0/6` |
| **3** | [04-FASE-3-higiene-codigo-duplicado-muerto.md](./04-FASE-3-higiene-codigo-duplicado-muerto.md) | Higiene (~1.500 LOC): Gemini SSOT, NPV/IRR único, kernel solar único, escapes/helpers y purga código/DOM/CSS muerto | `V2-F3-01..05` (5) | `3 P1, 2 P2/P3` | `0/5` |
| **4** | [05-FASE-4-arquitectura-modular.md](./05-FASE-4-arquitectura-modular.md) | Arquitectura: Vite/ESM/Workers reales, Store v2 serializable, `core-domain`, EventBus/AIService, fin `catch` vacíos y `@ra/sdk` | `V2-F4-01..06` (6) | `3 P0, 2 P1, 1 P2` | `0/6` |
| **5** | [06-FASE-5-ui-ux-design-system-wcag.md](./06-FASE-5-ui-ux-design-system-wcag.md) | UI/UX & WCAG 2.2 AA: ARIA Combobox/Tabs, contrastes AA, Escape/z-index, responsive móvil, Design System y UX Studio/Onboarding | `V2-F5-01..05` (5) | `1 P0, 3 P1, 1 P2/AAA` | `0/5` |
| **6** | [07-FASE-6-seguridad-persistencia-devops.md](./07-FASE-6-seguridad-persistencia-devops.md) | AppSec/Cloud/QA: CSP estricta, BFF+AppCheck real, Rules/DOCX, IDB/Firestore/multi-tab y ESLint/`npm ci`/E2E | `V2-F6-01..05` (5) | `1 P0, 3 P1, 1 P2` | `0/5` |
| **7** | [08-FASE-7-roadmap-software-aaa.md](./08-FASE-7-roadmap-software-aaa.md) | Nivel AAA: VCB SketchUp, Instancing 10k–50k + BVH, RANSAC 3D Tiles + Straight-Skeleton, Co-Sim 8760h, Monte Carlo B2B + Icc/I²t, Interop PVsyst/DXF | `V2-F7-01..06` (6) | `6 AAA` | `0/6` |

### Tabla Completa de Tickets
| ID | Título Resumido | Sev. | Dependencias | Estado |
| :--- | :--- | :---: | :--- | :---: |
| `V2-F0-01` | Restaurar `#ra-doc-modal` y cierre de `index.html` (comentarios rotos `:3781,4130`) | P0 | — | `[Pendiente]` |
| `V2-F0-02` | Corregir `firebase.json` (`public: "dist"`, `ra-env.js`, `/dist/`) y CI secrets | P0 | — | `[Pendiente]` |
| `V2-F0-03` | Reparar `test-security-contract.js` y aislamiento Emulador en `tests/run-all.js` | P0 | — | `[Pendiente]` |
| `V2-F0-04` | Corregir viento Faiman 24/29 m/s en `solar-engine.js:541` | P0 | — | `[Pendiente]` |
| `V2-F0-05` | Corregir `S_earth=6` (`electrical-engine.js:2832`) y `T_min` (`project-calcs.js:363`) | P0 | — | `[Pendiente]` |
| `V2-F0-06` | Corregir arbitraje BESS simultáneo, IVA/IS B2B (`financials.js`) y `indexOf('6.')` (`commercial-proposal-dossier.js:280`) | P0 | — | `[Pendiente]` |
| `V2-F0-07` | Alinear `RABankableRisk` con `calculateFinancialModel()` y §6.0 de Memoria PDF | P0 | — | `[Pendiente]` |
| `V2-F0-08` | Arreglar render incremental (`app-main.js:6279`), `undo-manager.js:239` y `webglcontextrestored` (`cesium-safety.js`) | P0 | — | `[Pendiente]` |
| `V2-F0-09` | Reparar Drawer MPPT vivo (no clon HTML) y teclado en Outliner/Dropzone/Rosa | P0 | — | `[Pendiente]` |
| `V2-F1-01` | Conectar `RACadOsnap` al trazado 3D (`working-plane.js`, `cad-events-controller.js`, `measure-tool.js`) | P0 | — | `[Pendiente]` |
| `V2-F1-02` | Section Planes sobre `google3DTileset`, OBB SAT real y `deletedPanels` en `cad-clash-section.js` | P0 | — | `[Pendiente]` |
| `V2-F1-03` | Erradicar bucles `O(N²)` en 5k–10k paneles (`app-main.js`, `cad-clash-section.js`, `measure-tool.js`) y `asynchronous: true` PBR | P1 | V2-F0-08 | `[Pendiente]` |
| `V2-F1-04` | Particionar Quadtree `RASpatialDsm` por faldón y muestrear altura real en Google 3D Tiles | P1 | V2-F1-03 | `[Pendiente]` |
| `V2-F1-05` | Unificar `toCanvasCoords`, geometría L-building asimétrica (`l-building-parametric.js`) y Undo ligero (`SKIP_KEYS`) | P1 | — | `[Pendiente]` |
| `V2-F1-06` | Pulidos CAD/Render: `postRender`, `RALodManager`, atajo `E`, capture `RAMeasureTool`, recolor PBR y `SkyBox` cache | P2 | V2-F1-03 | `[Pendiente]` |
| `V2-F2-01` | Factor `1.25× Isc` en `shadow-auto-stringer.js` + `ΔV <= 2.5%`, `stringsPerTrunk` y `cosPhiAc` en `electrical-engine.js` | P1 | — | `[Pendiente]` |
| `V2-F2-02` | Reescribir exceso potencia CNMC 3/2020 mensual (35.040 pasos) en `datadis-tariff-optimizer.js` | P1 | — | `[Pendiente]` |
| `V2-F2-03` | Corregir `marginNightDb` (`wind-acoustics.js:243`) y tabla mensual eólica (`commercial-proposal-dossier.js:238`) | P1 | — | `[Pendiente]` |
| `V2-F2-04` | Pasar `wp`/`pNomW`/`albedo` a `solar-worker.js`, `dayOfYear` en `radiation-engine.js` y bifacial en `solar-heatmap.js` | P1 | — | `[Pendiente]` |
| `V2-F2-05` | Normalizar claves `.OND` (`VMppMax`, `IMaxDC/nbMppt`) y bus AC agregado en `bishop-iv-engine.js` | P1 | — | `[Pendiente]` |
| `V2-F2-06` | Conectar motores `Bishop`, `Datadis`, `AutoStringer`, `Bankable` y `RAEngine` al SSOT y PDFs | P2 | V2-F0-07, V2-F2-02, V2-F2-05 | `[Pendiente]` |
| `V2-F3-01` | Centralizar los 4 clientes Gemini en `RA.AIService` y añadir `discoverAvailableModels` | P1 | — | `[Pendiente]` |
| `V2-F3-02` | Extraer helper único `computeNpvIrrCashflow` y eliminar `iva = 0.21` fijo en `project-calcs.js` | P1 | V2-F0-06 | `[Pendiente]` |
| `V2-F3-03` | Compartir kernel térmico-astronómico entre `solar-worker.js` y `solar-heatmap.js` + alinear `wind-worker.js` | P1 | V2-F2-04 | `[Pendiente]` |
| `V2-F3-04` | Consolidar 36 escapes HTML sobre `RASanitize`, `_num()` y `setVal()` | P2 | — | `[Pendiente]` |
| `V2-F3-05` | Purgar 29 funciones JS muertas (459 LOC), 94 `getElementById` huérfanos y reglas/IDs muertos en `css/styles.css` | P2 | V2-F0-01 | `[Pendiente]` |
| `V2-F4-01` | Activar Vite + ESM bootstrap y Workers ESM reales (`importScripts` y 101 `?v=` fuera) | P0 | Fases 0–3 | `[Pendiente]` |
| `V2-F4-02` | Unificar estado en `RA.Store` v2 serializable (0 entidades Cesium) y Time-Travel completo | P0 | V2-F4-01 | `[Pendiente]` |
| `V2-F4-03` | Extraer `packages/core-domain/` y desmantelar `app-main.js`, `working-plane.js`, `financials.js` | P0 | V2-F4-02 | `[Pendiente]` |
| `V2-F4-04` | Cobertura completa de `RA.EventBus` y retirada de `CustomEvent` aislados | P1 | V2-F4-01 | `[Pendiente]` |
| `V2-F4-05` | Erradicar 484 `catch` silenciosos con `RA.ErrorHandler` estructurado y regla lint | P1 | V2-F4-01 | `[Pendiente]` |
| `V2-F4-06` | Rehacer `@ra/sdk` sobre `core-domain/` + dual ESM/CJS + `.d.ts` + `checkJs` | P2 | V2-F4-03 | `[Pendiente]` |
| `V2-F5-01` | Semántica ARIA completa en Command Palette, Drawer Tabs, Catálogo, Studio y Stepper | P0 | — | `[Pendiente]` |
| `V2-F5-02` | Contrastes WCAG AA (`#047857`/`#94A3B8`), `Escape` en Drawer/Settings, `aria-live` y `z-index` HUD/Settings | P1 | — | `[Pendiente]` |
| `V2-F5-03` | Responsive móvil/portátil (Auditor/Costes/Solar HUD), `<label for>` reales y tipografía `>= 11px` | P1 | — | `[Pendiente]` |
| `V2-F5-04` | Unificar 18 sistemas de botones y 2.455 estilos inline en primitives de Design System | P1 | V2-F5-02 | `[Pendiente]` |
| `V2-F5-05` | Divulgación progresiva real (Modo Comercial), checklist Paso 1 y Studio Live Preview escalado A4 | P2 | V2-F0-09, V2-F5-04 | `[Pendiente]` |
| `V2-F6-01` | Retirar `'unsafe-inline'`/`'unsafe-eval'` y proxies CORS públicos de CSP + activar Trusted Types | P0 | V2-F4-01, V2-F4-03 | `[Pendiente]` |
| `V2-F6-02` | Cablear `AI_BFF_URL` + App Check real + cuotas distribuidas y paridad `/api/ai` en `server.js` | P1 | V2-F3-01 | `[Pendiente]` |
| `V2-F6-03` | Separar `delete` en `storage.rules`/`firestore.rules`, `tenantId` claim, allowlist `/users` y cierre DOCX | P1 | — | `[Pendiente]` |
| `V2-F6-04` | Corregir banner `__idbAutosave`, guarda `< 1 MiB` + Storage offload y bloqueos multi-pestaña | P1 | — | `[Pendiente]` |
| `V2-F6-05` | Añadir `package-lock.json`/`npm ci`, ESLint/Stylelint/`knip`/`npm audit`, `typecheck` CI y E2E/Rules ampliados | P2 | V2-F0-02, V2-F0-03 | `[Pendiente]` |
| `V2-F7-01` | Motor de Comandos CAD + Glifos OSNAP 2D + Value Control Box estilo SketchUp | AAA | V2-F1-01, V2-F4-03 | `[Pendiente]` |
| `V2-F7-02` | GPU Instancing real (`ModelMatrix`/uniform buffer) + BVH 2 niveles para 10k–50k paneles | AAA | V2-F1-03, V2-F1-04 | `[Pendiente]` |
| `V2-F7-03` | Auto-Detección de Cubiertas 3D Tiles RANSAC + Straight-Skeleton + Section Box 6 planos | AAA | V2-F1-02, V2-F1-04, V2-F1-05 | `[Pendiente]` |
| `V2-F7-04` | Núcleo único `8760h`/`35040` co-simulado (TMY + Bishop + Wind + BESS + CNMC P1..P6) | AAA | V2-F2-02..06, V2-F4-03 | `[Pendiente]` |
| `V2-F7-05` | Suite Monte Carlo bancable post-impuestos + REBT `I_cc`/`I²t`/ΔV óptimo + Bifacial 2D | AAA | V2-F0-05..07, V2-F2-01 | `[Pendiente]` |
| `V2-F7-06` | Interoperabilidad `.PAN`/`.OND` curvas `ProfilPIO`, export `.PVC` y DXF IEC 60617 completo | AAA | V2-F2-05 | `[Pendiente]` |
