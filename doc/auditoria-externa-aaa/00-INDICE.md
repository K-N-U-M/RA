# Auditoría Externa Integral y Hoja de Ruta Calidad AAA — Índice Maestro

> **Proyecto auditado:** RA Solar 3D (`ra-solar-3d`) — Rama base `main` · Versión `3.2.0` (`package.json`)  
> **Fecha de auditoría:** 2026-11-24  
> **Semáforo Global Actual:** 🔴 **ROJO — Aplicación funcional y muy rica en dominio, pero con deuda arquitectónica crítica, fallos normativos/eléctricos P0, inconsistencias contables multi-documento y superficie XSS abierta que impiden considerarla apta para producción empresarial AAA sin estabilización previa.**

---

## 1. Resumen Ejecutivo y Diagnóstico Objetivo

La auditoría externa independiente se ejecutó en paralelo sobre los **213 archivos** del proyecto (**82 módulos JS** con **99.696 líneas / ~4,80 MB** en bruto, `index.html` de **4.222 líneas** y `css/styles.css` de **3.356 líneas**) cubriendo 6 disciplinas especializadas: Motor 3D/WebGL, Ingeniería FV/Eléctrica/Eólica, Arquitectura, Limpieza/Duplicación, UI/UX/Accesibilidad y Seguridad/Persistencia/Finanzas/DevOps.

### Cifras Clave Verificadas en Código
- **Monolitismo y acoplamiento:** Tres archivos JS (`app-main.js`, `working-plane.js`, `financials.js`) suman **26.338 líneas**; `index.html` carga **78 `<script defer>`** con **37 cadenas manuales `?v=`** (con *version skew* activo en Web Workers), **495 handlers `on*` inline**, **1.514 `style="..."` inline** (**2.640** sumando plantillas JS), **749 símbolos en `window.*`** y **0 ES Modules (`import`/`export`)**.
- **Contaminación de capas:** **2.084** operaciones DOM y **5.217** referencias a `Cesium.`/`viewer.` repartidas incluso dentro de motores de cálculo (`financials.js`: 222 DOM, `solar-engine.js`: 45 DOM, `electrical-engine.js`: 14 DOM), junto a **451 bloques `catch` silenciosos**.
- **Riesgos críticos (P0) inmediatos:**
  - **Eléctrica y Normativa:** colapso `vmpStr = 12.0 V` (`70 mm²` falso en cables por unidades `%/°C`); omisión de diferencial `Clase B` en inversores sin transformador; doble conteo `2×` de longitud DC; bug aritmético capaz de superar `V_dc_max` del inversor; validaciones MPPT/Isc incompletas.
  - **Finanzas y Documentos:** salida literal `"100.0 %"` o `"null %"` en TIR, `"25.0 años"` con proyecto negativo, aplicación improcedente de IVA `10%`, sobreestimación de beneficio IS B2B y divergencias numéricas entre pantalla, memoria, presupuesto oficial, propuesta vertical y dossier.
  - **Seguridad y Persistencia:** **32 módulos** escribiendo HTML dinámico sin pasar por `sanitizer.js`, `iframe` sin `sandbox`, `js/ra-env.js` no excluido en `firebase.json`, CSP meramente decorativa, pérdida silenciosa de autoguardado por límite ~5 MB de `localStorage` y bloqueo Firestore `> 1 MiB` por imágenes base64.
  - **Motor 3D, UI y Accesibilidad:** corrupción de Undo/Redo en vértices/polilíneas, primitivas huérfanas tras borrar diseños, `pickFromRay` ciego ante edificios/obstáculos CAD, reset incompleto tras pérdida de contexto WebGL, `12` `CallbackProperty` activos bloqueando el reposo GPU, tecla `Tab` secuestrada por 3D, cierre `Escape` roto en modales anidados, `:focus-visible` suprimido, **993 textos `< 11px`** y **6 `aria-label` corruptos** de hasta `5.380` caracteres.
- **Limpieza y QA:** **~1.800+ líneas muertas** verificadas (`solar-engine.js` ~950 L, `wind-turbine.js` 789 L, `app-main.js` >500 L, `styles.css` >300 L), >30 IDs DOM huérfanos, `39/63` tests dependientes de mocks desfasados, `41,5%` de módulos sin cobertura y `0` tests E2E o con Firebase Emulator.

---

## 2. Mapa de Fases e Implementación Incremental

| Orden | Documento | Foco Principal | Tickets | Severidades Clave |
| :---: | :--- | :--- | :---: | :--- |
| **0** | [01-FASE-0-estabilizacion-bugs-criticos.md](./01-FASE-0-estabilizacion-bugs-criticos.md) | Estabilización P0: Seguridad XSS/Secrets, Persistencia, Finanzas/Docs, Bugs CAD y Eléctrica/REBT | **F0-01 .. F0-11** (11) | `10 P0`, `1 P1` |
| **1** | [02-FASE-1-rendimiento-motor-3d.md](./02-FASE-1-rendimiento-motor-3d.md) | Motor 3D/WebGL: Idle 0 FPS real, GPU Instancing, Raycast CAD `O(log N)`, fugas y Skybox | **F1-01 .. F1-07** (7) | `1 P0`, `2 P1`, `4 P2` |
| **2** | [03-FASE-2-correccion-ingenieria-fv-electrica.md](./03-FASE-2-correccion-ingenieria-fv-electrica.md) | Ingeniería FV/Eólica: Unificación motor solar Perez, Worker, despacho 8760h, REBT ITC-BT-18/04 y Unifilares/DXF | **F2-01 .. F2-12** (12) | `7 P1`, `4 P2`, `1 P3` |
| **3** | [04-FASE-3-codigo-muerto-y-duplicado.md](./04-FASE-3-codigo-muerto-y-duplicado.md) | Higiene: Deduplicación WAsP/Solar/IA, purga de `wind-turbine.js` y código/CSS/DOM muerto | **F3-01 .. F3-11** (11) | `7 P1`, `3 P2`, `1 P3` |
| **4** | [05-FASE-4-arquitectura-modular.md](./05-FASE-4-arquitectura-modular.md) | Arquitectura: Vite + ESM, TS incremental, Store + Event Bus único, Pure Engines sin DOM/Cesium, fin monolitos | **F4-01 .. F4-08** (8) | `4 P0`, `3 P1`, `1 P2` |
| **5** | [06-FASE-5-ui-ux-accesibilidad.md](./06-FASE-5-ui-ux-accesibilidad.md) | UI/UX & WCAG 2.2 AA: Teclado (`Tab`/`Escape`/focus), contrastes, Design Tokens, escala ≥11px y responsive | **F5-01 .. F5-10** (10) | `3 P0`, `7 P1` |
| **6** | [07-FASE-6-calidad-testing-devops.md](./07-FASE-6-calidad-testing-devops.md) | QA & DevOps: Paridad proxy cloud, Rules/Indexes Firebase, DOCX seguro, Playwright E2E, CI/CD con Auto-Deploy Stamp | **F6-01 .. F6-05** (5) | `4 P1`, `1 P2` |
| **7** | [08-FASE-7-nuevas-funciones-AAA.md](./08-FASE-7-nuevas-funciones-AAA.md) | Nivel Software AAA: Instancing 10k, BVH/LiDAR, OSNAP CAD, I-V Bishop, P50/P90, `.PAN`/`.OND`, SDK/B2B, UX Studio | **F7-01 .. F7-14** (14) | Roadmap AAA |
| **∞** | [99-REGISTRO-AVANCES.md](./99-REGISTRO-AVANCES.md) | Bitácora cronológica compartida por todas las IAs | — | Registro vivo |

*(Total de tickets accionables: **78** — 64 de saneamiento/estabilización/arquitectura en Fases 0–6 + 14 épicas AAA en Fase 7).*

---

## 3. Protocolo Obligatorio para Cualquier IA Ejecutora

Cualquier IA o desarrollador que tome trabajo de esta auditoría **DEBE** seguir estrictamente estos pasos para trabajar de forma segura y paralelizable sin pisar otras entregas:

1. **Seleccionar un único ticket** de estado `[Pendiente]` verificando antes que todas sus **Dependencias** figuren como `[Hecho]` (salvo tickets independientes que pueden ejecutarse en paralelo por ramas separadas).
2. **Bloquear el estado antes de editar:** cambiar `Estado` de `[Pendiente]` a `[En curso]` tanto en el archivo de la fase correspondiente como en la tabla maestra de este `00-INDICE.md` (o crear su rama dedicada con el nombre sugerido en el ticket desde `main` actualizada).
3. **Respetar el alcance estricto (Scope Lock):** modificar exclusivamente lo descrito en el ticket. Si aparece un bug relacionado fuera de alcance, registrarlo como nota o nuevo ticket sin refactorizar ficheros ajenos. Mantener intacta la evidencia y verificar cada cambio manualmente contra los **Criterios de aceptación** del ticket (sin disparar baterías masivas automáticas no autorizadas si hay restricción de proyecto).
4. **Cerrar y documentar el avance:**
   - Actualizar `Estado` a `[Hecho]` en el fichero de su fase y en `00-INDICE.md`.
   - Añadir una nueva fila al final de [99-REGISTRO-AVANCES.md](./99-REGISTRO-AVANCES.md) indicando fecha ISO, ID, rama, commit, nombre del agente/modelo, resultado y detalle de verificación.

### Mapa de Paralelización Recomendado (Sin Conflictos de Ficheros)
Pueden lanzarse en paralelo de forma inmediata en ramas aisladas:
- **Track Seguridad & Datos:** `F0-08` (XSS) + `F0-09` (Hosting/CSP) + `F0-10` (Persistencia/IDB/UUID)
- **Track Eléctrica P0:** `F0-05` (unidades `%/°C`) → `F0-06` (`Clase B` + lazo DC) + `F0-07` (validación MPPT / `Ns_max`)
- **Track Finanzas/Docs P0:** `F0-11` (TIR/IVA10/IS/paridad documentos)
- **Track CAD 3D & Render:** `F0-01` (Undo/Redo) + `F0-02` (primitivas huérfanas) + `F0-03` (WebGL context) + `F1-01` (idle 0 FPS / `CallbackProperty`)
- **Track Accesibilidad P0:** `F5-01` (`Tab`/`Escape`) + `F5-02` (`focus-visible`/viewport) + `F5-03` (`aria-label`/labels)
- **Track Limpieza Independiente:** `F3-01` (WAsP parser) + `F3-02` (`wind-turbine.js`) + `F3-06` (`solar-engine` UI muerta)

*(⚠️ **Precaución:** antes de abordar la Fase 4 [`F4-01..F4-07` — migración a Vite/Store/descomposición de monolitos], se recomienda cerrar Fases 0 y 3 para evitar conflictos masivos de merge sobre `app-main.js`, `working-plane.js`, `financials.js` e `index.html`).*

---

## 4. Ruta Crítica de Todos los Bloqueantes P0 (Vista Rápida)

| Prioridad | ID | Ubicación Fase | Resumen del Bloqueante P0 | Estado |
| :---: | :--- | :--- | :--- | :--- |
| 1 | `F0-05` | Fase 0 | Colapso `vmpStr = 12 V` y secciones `70 mm²` falsas por unidades `%/°C` | `[Pendiente]` |
| 2 | `F0-06` | Fase 0 | Omisión de diferencial `Clase B` + doble conteo `2×` en caída de tensión DC | `[Pendiente]` |
| 3 | `F0-07` | Fase 0 | Bug aritmético `Ns > Ns_max` (sobretensión) + bypass validaciones MPPT/`Isc` | `[Pendiente]` |
| 4 | `F0-08` | Fase 0 | Superficie XSS generalizada (`32` módulos sin sanitizador) + documentos/`iframe` | `[Pendiente]` |
| 5 | `F0-09` | Fase 0 | `ra-env.js` no ignorado en `firebase.json` + CSP decorativa + clave IA en `localStorage` | `[Pendiente]` |
| 6 | `F0-10` | Fase 0 | Pérdida silenciosa de autoguardado + bloqueo Firestore `>1 MiB` + colisión entre proyectos | `[Pendiente]` |
| 7 | `F0-11` | Fase 0 | TIR `"100%"`/`"null %"` + IVA 10% / IS inflado + cifras divergentes entre documentos | `[Pendiente]` |
| 8 | `F0-01` | Fase 0 | Corrupción de Undo/Redo CAD en vértices de edificio, polilíneas y rutas | `[Pendiente]` |
| 9 | `F0-02` | Fase 0 | Primitivas GPU huérfanas tras borrar diseño y destrucción de `lastRoofInfo` | `[Pendiente]` |
| 10 | `F0-03` | Fase 0 | Pantalla negra/corrupta tras pérdida de contexto WebGL | `[Pendiente]` |
| 11 | `F1-03` | Fase 1 | Caché de exclusión de raycasting y ceguera de sombras frente a edificios/obstáculos CAD | `[Pendiente]` |
| 12 | `F5-01` | Fase 5 | Tecla `Tab` bloqueada en UI tras mover ratón + stack `Escape` modal roto | `[Pendiente]` |
| 13 | `F5-02` | Fase 5 | `:focus-visible` suprimido globalmente y zoom móvil bloqueado | `[Pendiente]` |
| 14 | `F5-03` | Fase 5 | 6 `aria-label` corruptos (hasta 5.380 chars) y 4 `<label for>` apuntando a otro campo | `[Pendiente]` |
| 15 | `F4-03`..`F4-07` | Fase 4 | Deuda estructural P0: Store SSOT, ciclo `calcs<->fin`, 749 globals, SoC y 3 monolitos (ejecución ordenada post-Fase 3) | `[Pendiente]` |

---

## 5. Inventario Maestro de Tickets y Estado Global

### Fase 0 — Estabilización y Bugs Críticos
| ID | Título | Sev. | Esf. | Dependencias | Origen | Estado |
| :--- | :--- | :---: | :---: | :--- | :--- | :--- |
| `F0-01` | Reparar Undo/Redo CAD en vértices de edificio, polilíneas, rutas y rebuild | P0 | M | — | A-01 | `[Pendiente]` |
| `F0-02` | Limpiar primitivas huérfanas al borrar último diseño y proteger `lastRoofInfo` | P0 | S | — | A-02 | `[Pendiente]` |
| `F0-03` | Implementar recuperación real tras `webglcontextlost`/`restored` | P0 | L | — | A-04 | `[Pendiente]` |
| `F0-04` | Corregir gimbal flip obstáculos, teclado en `requestRenderMode`, atajos `C`/`X`/`M` y L-buildings | P1 | L | — | A-05..A-07, A-10 | `[Pendiente]` |
| `F0-05` | Corregir unidades `%/°C` en `cable-engine.js` (`vmpStr = 12 V` / `70 mm²`) | P0 | S | — | B-01 | `[Pendiente]` |
| `F0-06` | Corregir diferencial `Clase B` (`rcmuIntegrated !== false`) y doble conteo `2×` DC | P0 | M | F0-05 | B-02, B-03 | `[Pendiente]` |
| `F0-07` | Blindar validaciones MPPT/Isc/MLPE y overflow `Ns > Ns_max` en `computeSizingEngineering` | P0 | M | — | B-04, B-05 | `[Pendiente]` |
| `F0-08` | Erradicar XSS DOM en visor (`32` módulos) y en documentos/`iframe` | P0 | L | — | F-01, F-03 | `[Pendiente]` |
| `F0-09` | Excluir entorno local de hosting, endurecer CSP y retirar claves IA de `localStorage` | P0 | M | F0-08 | F-02 | `[Pendiente]` |
| `F0-10` | Blindar persistencia: IDB, Firestore `<250 KB`, UUID proyecto, migrador y ceros `0 €` | P0 | L | — | F-07..F-10 | `[Pendiente]` |
| `F0-11` | Corregir TIR/Payback/IVA 10%/IS y reconciliar cifras entre todos los documentos | P0 | L | — | F-11..F-14 | `[Pendiente]` |

### Fase 1 — Rendimiento Motor 3D / WebGL
| ID | Título | Sev. | Esf. | Dependencias | Origen | Estado |
| :--- | :--- | :---: | :---: | :--- | :--- | :--- |
| `F1-01` | Erradicar 12 `CallbackProperty`, `rAF` idle en `RABenchmark` y renders múltiples `Triad2D` | P1 | L | — | A-09 | `[Pendiente]` |
| `F1-02` | Migrar paneles, edificios y obstáculos de rebuild `O(N)` síncrono a instancing/batching | P1 | XL | — | A-08 | `[Pendiente]` |
| `F1-03` | Corregir caché de exclusión 3D y ceguera de `pickFromRay` ante edificios/obstáculos CAD | P0 | L | F1-02 | A-03 | `[Pendiente]` |
| `F1-04` | Corregir Modo Captura Limpia frente a zoom LOD, multi-selección y previews | P2 | S | F0-04 | A-11 | `[Pendiente]` |
| `F1-05` | Optimizar Skybox procedural sin regeneración JPEG continua al mover reloj solar | P2 | M | — | A-12 | `[Pendiente]` |
| `F1-06` | Indexar picking/snapping `O(log N)` y unificar listeners bajo `RA.addListener` | P2 | L | F0-04 | A-13 | `[Pendiente]` |
| `F1-07` | Purgar `_raScaledBoxes`, multi-selección batched, `ShadowMap` inicial y código muerto render | P2 | M | F1-02 | A-14 | `[Pendiente]` |

### Fase 2 — Ingeniería FV, Normativa Eléctrica y Eólica
| ID | Título | Sev. | Esf. | Dependencias | Origen | Estado |
| :--- | :--- | :---: | :---: | :--- | :--- | :--- |
| `F2-01` | Unificar feedback pérdidas óhmicas en cable y suprimir doble descuento bypass PR | P1 | M | F0-05, F0-06 | B-06 | `[Pendiente]` |
| `F2-02` | Converger los 4 motores de producción solar en único motor SSOT Perez + Faiman/TMY | P1 | L | F2-01 | B-07 | `[Pendiente]` |
| `F2-03` | Corregir fuga de paneles fantasma al Solar Worker, etiquetas de resolución y ciclo térmico | P1 | M | F2-02 | B-08 | `[Pendiente]` |
| `F2-04` | Unificar despacho híbrido `8760h` (FV+ERA5+BESS) y arreglar doble cobro en arbitraje | P1 | L | F2-02 | B-09 | `[Pendiente]` |
| `F2-05` | Subsanar tierra ITC-BT-18, umbral AC Proyecto/MTD, límite 1F RD1699 y `cosφ` | P1 | S | — | B-10 | `[Pendiente]` |
| `F2-06` | Unificar unifilares UI Paso 4, SVG EPLAN y DXF (microinversores, >3 strings, BESS) | P1 | L | F0-05, F0-07 | B-11 | `[Pendiente]` |
| `F2-07` | Corregir `isc < imp` en catálogo, ratio microinversores 1:1/4:1, scope y `balasto` BOM | P1 | M | — | B-12 | `[Pendiente]` |
| `F2-08` | Integrar protecciones DC `1000V/1500V` con ganancia bifacial en BOM y cálculos | P2 | S | F0-06, F0-07 | B-13 | `[Pendiente]` |
| `F2-09` | Alinear eléctrico eólico con constantes REBT, término reactivo `X` y `Voc_overspeed` | P2 | S | — | B-14 | `[Pendiente]` |
| `F2-10` | Corregir paso entre filas vectorial y proyección rayo-plano en obstáculos | P2 | M | — | B-15 | `[Pendiente]` |
| `F2-11` | Corregir Monte Carlo P50/P90, flags auto-ingeniería, multi-turbina flicker y latitud | P2 | M | F2-02 | B-16, B-17 | `[Pendiente]` |
| `F2-12` | Ampliar perfil de horizonte `< 6°` y acoplar diodos de bypass por string en sombras | P3 | L | F2-02, F2-03 | B-18 | `[Pendiente]` |

### Fase 3 — Código Muerto y Duplicado
| ID | Título | Sev. | Esf. | Dependencias | Origen | Estado |
| :--- | :--- | :---: | :---: | :--- | :--- | :--- |
| `F3-01` | Consolidar `parseWAsPLib` / `lanczosGamma` entre `server.js`, `functions` y cliente | P1 | M | F0-09 | D-01 | `[Pendiente]` |
| `F3-02` | Retirar archivo huérfano `js/wind-turbine.js` (789 L) y arreglar Undo `renderAll()` | P1 | M | — | D-02 | `[Pendiente]` |
| `F3-03` | Unificar geometría 2D, sub-strings y física solar duplicada entre main y `solar-worker.js` | P1 | M | — | D-04 | `[Pendiente]` |
| `F3-04` | Consolidar `ensureRoofGeometry` entre `project-storage.js` y `solar-heatmap.js` | P1 | S | — | D-05 | `[Pendiente]` |
| `F3-05` | Consolidar 4 `_aiFetch`, 2 `getApiKey`, mapeo turbinas y 2 `escapeHtml` | P1 | M | F0-08 | D-06 | `[Pendiente]` |
| `F3-06` | Purgar subsistema UI muerto "Análisis Energético Comparativo" (~950 L) | P1 | S | — | D-09 | `[Pendiente]` |
| `F3-07` | Auditar y resolver 30+ IDs DOM huérfanos (`#btn-redo`, `#label-2d3d`, `#fin-tou-tarifa`, etc.) | P1 | L | F3-02, F3-09 | D-14 | `[Pendiente]` |
| `F3-08` | Consolidar constantes eléctrico-solares, fórmulas `Voc`/`ΔV` y helpers duplicados | P2 | M | F0-05, F0-06 | D-07, D-08 | `[Pendiente]` |
| `F3-09` | Purgar código muerto JS en `app-main.js`, `working-plane.js`, `_initTriadOnce` y aliases | P2 | M | F3-06 | D-10..D-12 | `[Pendiente]` |
| `F3-10` | Fusionar `.solar-mode-btn`, retirar `<style>` de `index.html` y purgar >300 L CSS muerto | P2 | M | F3-07 | D-15, D-16 | `[Pendiente]` |
| `F3-11` | Mover `ra-env.example.js` fuera de `js/` y migrar 7 `console.log`/`info` a `RA.log` | P3 | S | — | D-03, D-13 | `[Pendiente]` |

### Fase 4 — Arquitectura Modular
| ID | Título | Sev. | Esf. | Dependencias | Origen | Estado |
| :--- | :--- | :---: | :---: | :--- | :--- | :--- |
| `F4-01` | Introducir Vite + ESM base y eliminar 74 `?v=` manuales / version skew en Workers | P1 | L | Fase 3 | C-06, C-07 | `[Pendiente]` |
| `F4-02` | Configurar TypeScript incremental (`allowJs`, `checkJs`) y contratos `@ra/contracts` | P1 | L | F4-01 | C-09 | `[Pendiente]` |
| `F4-03` | Implantar Store Centralizado + Typed Event Bus y romper ciclo `calcs <-> fin` | P0 | XL | F4-01 | C-05 | `[Pendiente]` |
| `F4-04` | Unificar telemetría, erradicar 451 `catch` vacíos y retirar timers/doble mutex | P1 | M | F4-01, F4-03 | C-08, C-10 | `[Pendiente]` |
| `F4-05` | Encapsular 749 globales `window.*`, 17 sin IIFE y monkey-patching en runtime | P0 | L | F4-01, F4-03 | C-02, C-03 | `[Pendiente]` |
| `F4-06` | Extraer motores puros sin DOM ni Cesium (`solar`, `electrical`, `financial`, `cad`) | P0 | XL | F4-02, F4-03 | C-04 | `[Pendiente]` |
| `F4-07` | Desmantelar los 3 monolitos (`app-main`, `working-plane`, `financials`) y 495 `on*` inline | P0 | XL | F4-03..F4-06 | C-01 | `[Pendiente]` |
| `F4-08` | Aislar servicio IA/APIs externas en adaptador BFF (retirar Gemini de `financials.js`) | P2 | M | F0-09, F4-06 | C-11 | `[Pendiente]` |

### Fase 5 — UI/UX, Design System y Accesibilidad
| ID | Título | Sev. | Esf. | Dependencias | Origen | Estado |
| :--- | :--- | :---: | :---: | :--- | :--- | :--- |
| `F5-01` | Liberar `Tab` para UI, unificar tooltip `Ctrl+B` y arreglar stack `Escape` en modales | P0 | M | — | E-01, E-02 | `[Pendiente]` |
| `F5-02` | Restaurar `:focus-visible` de alto contraste y desbloquear zoom `meta viewport` | P0 | S | — | E-03 | `[Pendiente]` |
| `F5-03` | Reparar 6 `aria-label` corruptos, 4 `<label for>` cruzados y 22 labels huérfanos | P0 | S | — | E-04 | `[Pendiente]` |
| `F5-04` | Sustituir `prompt`/`confirm` nativos y añadir bloqueo/spinner `aria-busy` en acciones largas | P1 | M | F5-01 | E-05, E-06 | `[Pendiente]` |
| `F5-05` | Desacoplar toggle Outliner e implantar escala única `z-index` (8 tokens) | P1 | M | F5-01 | E-07 | `[Pendiente]` |
| `F5-06` | Explicar pasos bloqueados (`aria-disabled`), footer sticky en Paso 1 y limpiar `#tab-btn-*` | P1 | M | F5-02 | E-08 | `[Pendiente]` |
| `F5-07` | Declarar 9 variables CSS faltantes, corregir contrastes AA y extraer estilos inline | P1 | XL | — | E-09, E-13 | `[Pendiente]` |
| `F5-08` | Erradicar microtipografía `< 11px` (993 ocurrencias) fijando escala legible | P1 | L | F5-07 | E-10 | `[Pendiente]` |
| `F5-09` | Corregir desbordamientos responsive móvil (`<=768px`) y portátiles (`1280×720`/`1366×768`) | P1 | L | F5-05, F5-07 | E-11 | `[Pendiente]` |
| `F5-10` | Teclado en `#ra-hud-energy`/tooltips, desanidar controles, landmarks, `<th>` y labels | P1 | L | F5-02, F5-07 | E-12, E-14..E-16 | `[Pendiente]` |

### Fase 6 — Calidad, Testing y DevOps
| ID | Título | Sev. | Esf. | Dependencias | Origen | Estado |
| :--- | :--- | :---: | :---: | :--- | :--- | :--- |
| `F6-01` | Unificar validación SSRF/CORS y parser eólico entre `functions/index.js` y `server.js` | P1 | M | F0-09 | F-04 | `[Pendiente]` |
| `F6-02` | Endurecer `firestore.rules`, `storage.rules`, índice compuesto y `firebase-service.js` | P1 | M | F0-09 | F-05 | `[Pendiente]` |
| `F6-03` | Saneo DOCX/MHTML contra XSS DOM y fugas URL externas al abrir en Word | P2 | S | F0-08 | F-06 | `[Pendiente]` |
| `F6-04` | Reparar tests con mocks obsoletos, declarar Playwright + Emulator y cubrir 41,5% ciego | P1 | L | F6-05 | F-15 | `[Pendiente]` |
| `F6-05` | Pipeline CI/CD: build `dist/`, auto-inyección fecha/SHA/versión, SAST y Firebase Preview PR | P1 | M | F0-09 | F-16 | `[Pendiente]` |

### Fase 7 — Nuevas Funciones y Plataforma Nivel AAA
| ID | Título | Esf. | Dependencias | Estado |
| :--- | :--- | :---: | :--- | :--- |
| `F7-01` | Instanciación real GPU (`InstanceMatrix`) para >10.000 paneles a 60–120 FPS | L | F1-02 | `[Pendiente]` |
| `F7-02` | Índice Espacial (`BVH + Quadtree ENU`) + Raytracer solar Worker offline | XL | F1-03, F1-06 | `[Pendiente]` |
| `F7-03` | Suite CAD OSNAP completa + Polar Tracking + entrada numérica `Tab` | L | F1-06, F0-04 | `[Pendiente]` |
| `F7-04` | Gizmo 3D GPU viewport-space + Planos de Sección y Clash Detection 3D | L | F1-02 | `[Pendiente]` |
| `F7-05` | Motor horario `8760h` + Curva I-V Bishop (3 sub-strings) + MPPT multi-pico | XL | F2-02, F4-06 | `[Pendiente]` |
| `F7-06` | Auto-stringing inteligente consciente de sombras 3D e `inputsPerMppt` | L | F2-03, F0-07 | `[Pendiente]` |
| `F7-07` | Import/Export `.PAN`/`.OND` (PVsyst) y DXF IEC 60617 multi-topología + acotado | L | F2-06 | `[Pendiente]` |
| `F7-08` | Análisis probabilístico bancable P50/P75/P90/P99 a 25 años | M | F2-11, F0-11 | `[Pendiente]` |
| `F7-09` | Ingesta LiDAR/DSM PNOA-IGN `0.5 m` y detección semiautomática de cubiertas | XL | F7-02 | `[Pendiente]` |
| `F7-10` | Gemelo único `8760h` + CSV cuartohorario Datadis + optimización P1..P6 | L | F2-04 | `[Pendiente]` |
| `F7-11` | Headless SDK `@ra/sdk`, Plugin API multi-país y Comparador multi-variante paralelo | XL | F4-06, F4-07 | `[Pendiente]` |
| `F7-12` | Colaboración multi-pestaña/CRDT, historial en nube y Time-Travel Debugging | XL | F4-03, F4-04 | `[Pendiente]` |
| `F7-13` | UX AAA: Command Palette `Ctrl+K`, Split-View Drawer, Chuleta `?`, Modo Dual y Studio Live | XL | F5-07..F5-10 | `[Pendiente]` |
| `F7-14` | Seguridad AAA: BFF App Check sin API keys en cliente, Playwright visual + Tooling CI | L | F6-01..F6-05 | `[Pendiente]` |
