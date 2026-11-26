# 🧭 Plan Maestro de Auditoría Técnica Quirúrgica — Proyecto RA (Visor Solar 3D)

> **Versión:** 2.0 (Auditoría Externa Quirúrgica)  
> **Fecha:** 2026-11-26  
> **Inventario real medido:** **86 archivos JS** (`72` en `js/` + `14` en `js/wind/`), `index.html` (`4.243` líneas, `81` `<script defer>`), `css/styles.css` (`3.363` líneas), `104.878` LOC totales.  
> **Estado de pruebas base (`node tests/run-all.js`):** `61/63` superadas · `2` fallidas por timeout (`test-electrical-rebt.js`, `test-faldon-deactivation.js`).

---

## 📊 Radiografía Cuantitativa de Hallazgos

| Área Auditada | Métrica / Hallazgo Crítico | Impacto |
|---|---|---|
| **Rendimiento 3D / FPS** | `google3DTileset.shadows = ENABLED` + `CallbackProperty(..., false)` rompiendo `requestRenderMode` + `scene.postRender` repintando tríada/gizmo en cada frame + `pickTranslucentDepth = true` + doble `pickPosition` (`gl.readPixels`) | 🔴 Lag severo vs Google Earth |
| **Motor Solar (Worker)** | 4 `ReferenceError` activos en `js/solar-worker.js` (`penumbraAttenuation`, `hourStepDt`, `climateZone`, `minPenumbra`) + `tiltDeg === 0` forzado a `20°` | 🔴 Crash silencioso del Worker en cada simulación |
| **Ingeniería FV / REBT** | Clipping subestimado ~30× (`solar-engine.js`), regresión Diferencial Tipo B (`electrical-engine.js`), `betaVmp` ignorado en sizing, acimut mezclado (`N=0` vs `S=0`), doble conteo de pérdidas | 🔴 Errores normativos y energéticos |
| **CAD 3D & Undo** | `undo-manager.js` desalineado (`polyline`, `route_vertex`, `vertex` vs `building_vertex`), rama muerta en gizmo, normal de superficie rota por throttle 140 ms | 🟠 Corrupción de Undo/Redo y snapping |
| **Código Muerto y Duplicados** | **101 funciones inalcanzables**, **17 pares con bloques idénticos**, **453 `catch` vacíos** de 838, **713 símbolos globales** en `window`, 3 God Files (`8k–10k` LOC) | 🟡 Deuda técnica extrema |
| **UI/UX y Diseño Visual** | **6 `aria-label` corruptos** (3.000 chars de DOM volcados), `outline: none !important` WCAG, **1.514 `style="..."`**, **331 `!important`**, colisiones de `z-index` y atajos (`C`/`H`/`M`), controles duplicados | 🟠 UX fragmentada y rota en móvil |

---

## 🗺️ Hoja de Ruta por Fases Independientes

Cada fichero `.md` está diseñado para que **cualquier IA de programación pueda ejecutarlo de forma autónoma**, verificar con tests y registrar su progreso sin necesitar contexto previo de otras conversaciones.

| Fase | Fichero | Objetivo Principal | Riesgo |
| :---: | :--- | :--- | :---: |
| **1** | [`FASE-1-ESTABILIZACION-Y-BUGS-CRITICOS.md`](./FASE-1-ESTABILIZACION-Y-BUGS-CRITICOS.md) | Suite `63/63`, reparar crash del Worker solar, Undo/Gizmo/Picking CAD, colisiones de atajos UI y bootstrap `window.RA` | 🔴 Crítica |
| **2** | [`FASE-2-RENDIMIENTO-CAD-Y-WEBGL.md`](./FASE-2-RENDIMIENTO-CAD-Y-WEBGL.md) | Desacoplar sombras de Google 3D Tiles, erradicar `CallbackProperty(..., false)` y `postRender` continuo, eliminar `gl.readPixels` en drag y fugas de listeners | 🔴 Alta (FPS) |
| **3** | [`FASE-3-PRECISION-SOLAR-Y-INGENIERIA-FV.md`](./FASE-3-PRECISION-SOLAR-Y-INGENIERIA-FV.md) | Corregir física Perez/Hay-Davies/Clipping, SSOT Worker↔Fallback, REBT/IEC 62548, eólico/híbrido + evolución AAA (8760h, bifacial, 1-diodo I-V) | 🟠 Alta |
| **4** | [`FASE-4-ARQUITECTURA-Y-DEUDA-TECNICA.md`](./FASE-4-ARQUITECTURA-Y-DEUDA-TECNICA.md) | Purgar 101 funciones muertas, consolidar 17 duplicaciones, trocear 3 God Files (`26.451` LOC), erradicar 453 `catch` vacíos y modernizar bundling | 🟡 Media |
| **5** | [`FASE-5-UI-UX-Y-FUNCIONALIDADES-AAA.md`](./FASE-5-UI-UX-Y-FUNCIONALIDADES-AAA.md) | Reparar `aria-label` y foco WCAG, sistema de diseño Dark CAD (Linear/Aurora), workspace de 3 zonas sin duplicados y responsive móvil real | 🟢 Producto AAA |

---

## 🤖 Protocolo Estricto para Agentes de Programación

1. **Leer `AGENTS.md`** antes de editar (flujo canónico de **5 pasos**, regla de congelación del inline, normativa REBT/IEC 62548, `window.*` hooks).
2. **Ejecutar baseline antes y después** de cada sub-tarea:
   - `node tests/test-js-syntax.js`
   - `node tests/run-all.js`
3. **Abordar tareas en el orden de fases** (Fase 1 antes que Fase 4; no podar funciones en Fase 4 sin verificar con `rg` que no tienen consumidores en `index.html`, `js/` ni `tests/`).
4. **Actualizar el archivo `FASE-X-*.md` correspondiente** al completar cada tarea: marcar `[x]` en el checklist y añadir entrada en **Registro de Avances** (fecha, agente, archivos tocados, resultado de tests).
