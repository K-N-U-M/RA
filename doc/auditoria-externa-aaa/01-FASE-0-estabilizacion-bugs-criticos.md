# FASE 0 — Estabilización, Bugs Críticos (P0), Seguridad y Fiabilidad de Datos

> **Objetivo de la fase:** Cerrar inmediatamente los fallos críticos (**P0** y **P1 bloqueantes**) que comprometen la seguridad (XSS, exposición potencial de claves/CSP decorativa), corrompen cálculos eléctricos/normativos (`12 V` DC, omisión de diferencial `Clase B`, sobretensión de strings), destruyen coherencia financiera al cliente (`TIR 100%`/`null%`, IVA `10%`, IS inflado), pierden proyectos en silencio (cuota `localStorage`/Firestore) o rompen el editor CAD 3D (Undo/Redo, entidades huérfanas, reset WebGL).
> **Regla de ejecución:** Estas tareas tienen **máxima prioridad** y deben abordarse antes de refactorizar arquitectura (Fase 4) o lanzar nuevas capacidades (Fase 7).
> **Protocolo para IAs:** Revisa [00-INDICE.md](./00-INDICE.md). Antes de empezar, marca `Estado` como `[En curso]`, crea una rama dedicada desde `main` y al cerrar registra el resultado en [99-REGISTRO-AVANCES.md](./99-REGISTRO-AVANCES.md).

---

## Tabla de Tareas — Fase 0

| ID | Título | Severidad | Esfuerzo | Dependencias | Origen | Estado |
| :--- | :--- | :---: | :---: | :--- | :--- | :--- |
| **F0-01** | Reparar desincronización de Undo/Redo CAD en vértices de edificio, polilíneas, rutas y rebuild de paneles | P0 | M | Ninguna | A-01 | `[Hecho]` |
| **F0-02** | Limpiar primitivas GPU huérfanas al borrar último diseño en Paso 1 y proteger `lastRoofInfo` | P0 | S | Ninguna | A-02 | `[Hecho]` |
| **F0-03** | Implementar recuperación real tras `webglcontextlost` / `webglcontextrestored` | P0 | L | Ninguna | A-04 | `[Hecho]` |
| **F0-04** | Corregir bugs CAD/interacción: gimbal flip en obstáculos, teclado congelado bajo `requestRenderMode`, colisión de atajos `C`/`X`/`M` y alabeo en edificios en L | P1 | L | Ninguna | A-05 + A-06 + A-07 + A-10 | `[Parcial]` |
| **F0-05** | Corregir bug de unidades `%/°C` en `cable-engine.js` que colapsa `vmpStr = 12 V` y dispara cables a `70 mm²` | P0 | S | Ninguna | B-01 | `[Hecho]` |
| **F0-06** | Corregir omisión normativa de diferencial `Clase B` (`rcmuIntegrated !== false`) y doble conteo `2×` en lazo DC | P0 | M | F0-05 | B-02 + B-03 | `[Hecho]` |
| **F0-07** | Blindar validaciones MPPT (`inputsPerMppt`, `Voc_cold`, `Isc`, MLPE selectivos) y corregir overflow `Ns > Ns_max` en `computeSizingEngineering` | P0 | M | Ninguna | B-04 + B-05 | `[Hecho]` |
| **F0-08** | Erradicar XSS almacenado/DOM en visor (`32` módulos sin sanitizador) y documentos/visor/iframe generados | P0 | L | Ninguna | F-01 + F-03 | `[Pendiente]` |
| **F0-09** | Excluir archivo local de entorno del despliegue, endurecer CSP y retirar claves IA de `localStorage` | P0 | M | F0-08 | F-02 | `[Hecho]` |
| **F0-10** | Blindar persistencia: migración de autoguardado a IndexedDB, límites Firestore `< 250 KB`, UUID por proyecto, migrador `2.2->2.4` y cero `0 € -> default` | P0 | L | Ninguna | F-07 + F-08 + F-09 + F-10 | `[Parcial]` |
| **F0-11** | Corregir errores bancables en TIR/Payback/IVA 10%/IS y reconciliar cifras entre pantalla, memoria, presupuesto, propuesta y dossier | P0 | L | Ninguna | F-11 + F-12 + F-13 + F-14 | `[Parcial]` |

*(Nota: los fallos P0 adicionales de interfaz/accesibilidad [`E-01`..`E-04`] y raycasting 3D [`A-03`] están detallados con trazabilidad completa en `F5-01`..`F5-03` y `F1-03`, respectivamente, y listados en la matriz P0 de `00-INDICE.md` para permitir ataque paralelo sin solapamientos).*

---

## Detalle Técnico por Tarea

### `F0-01` — Reparar desincronización de Undo/Redo CAD en vértices de edificio, polilíneas, rutas y rebuild de paneles

| Campo | Valor |
| :--- | :--- |
| **Categoría** | Bug CAD 3D |
| **Severidad** | P0 (Crítico) |
| **Esfuerzo** | M (2–8 horas) |
| **Dependencias** | Ninguna |
| **Origen** | A-01 |
| **Rama sugerida** | `fix/cad-undo-redo-sync` |
| **Estado** | `[Hecho]` |

#### Contexto y Problema
Cuatro flujos de arrastre CAD rompen `RAundo`:
1. Arrastrar vértice de edificio llama `RAundo.beginDrag('vertex')`, pero `undo-manager.js` separa `'vertex'` (`polylines`) de `'building_vertex'` (`buildings`): el Undo ignora el edificio y corrompe/mueve faldones.
2. Arrastrar `'polyline'` llama a `beginDrag('polyline')` (clave no mapeada que cae en `'obstacles'`) y encima apila `snapPolylines()` + `snapObstacles()` generando hasta 3 entradas en la pila por un solo drag.
3. Arrastrar `'route_vertex'` tampoco existe en `beginDrag`, cayendo en `'obstacles'`.
4. Restaurar `'vertex'` reasigna `poly.points` y re-renderiza sin invalidar `poly._calcSig` / `roofPanelsCache.sig` ni recalcular `computeSinglePolylineRoofInfo` / `recalculateLayoutAndObstacles()`, dejando paneles flotando respecto al borde modificado.

#### Evidencia Verificada
- `js/cad-events-controller.js:59-98, 292-296, 682-695`
- `js/universal-gizmo-3d.js:127-138, 1393-1410`
- `js/undo-manager.js:121-131, 221-236, 538-578`

#### Pasos de Implementación
1. En `cad-events-controller.js:295-296`, asignar `'building_vertex'` cuando el vértice pertenezca a un edificio y pasar `uTarget.subType || uTarget.type` a `RAundo.beginDrag(...)`.
2. Añadir en `undo-manager.js:beginDrag` (`L538-578`) los casos explícitos `'polyline'` (capturando `polylines` y obstáculos acoplados como transacción única) y `'route_vertex'` (capturando estado de rutas eléctricas), retirando `snapPolylines()`/`snapObstacles()` redundantes dentro de `LEFT_DOWN` (`cad-events-controller.js:77-94`).
3. En `undo-manager.js:221-236` (`restoreState` de `'vertex'` y `'polyline'`), limpiar `poly._calcSig = null`, `poly._geometryDirty = true`, invalidar `roofPanelsCache.sig = ''` e invocar `computeSinglePolylineRoofInfo` + `recalculateLayoutAndObstacles(pIdx)` antes de renderizar cables y paneles.

#### Criterios de Aceptación
- Arrastrar vértice de edificio, faldón con obstáculos, codo de ruta eléctrica o vértice de faldón con placas genera exactamente **1** entrada en `undoStack`.
- `Ctrl+Z` y `Ctrl+Y` restauran exactamente la geometría 3D, paneles recalculados dentro de la nueva cubierta y trazado de cables.

---

### `F0-02` — Limpiar primitivas GPU huérfanas al borrar último diseño en Paso 1 y proteger `lastRoofInfo`

| Campo | Valor |
| :--- | :--- |
| **Categoría** | Bug CAD 3D |
| **Severidad** | P0 (Crítico) |
| **Esfuerzo** | S (<2 horas) |
| **Dependencias** | Ninguna |
| **Origen** | A-02 |
| **Rama sugerida** | `fix/orphan-gpu-primitives-and-roofinfo` |
| **Estado** | `[Hecho]` |

#### Contexto y Problema
1. En `wpFastRenderSimulatedPanelsAsync` (`app-main.js:7625-7637`), el retorno por gating en Paso 1 (`!_hasExistingDesign`) ocurre **antes** de `wpCleanupAllSolarPrimitives(...)`. Al borrar el último edificio o faldón, el visor deja primitivas GPU fantasma flotando en escena vacía.
2. En `app-main.js:8564-8567`, se sobrescribe `lastRoofInfo` global con `{ panels, orientation }` destruyendo `.poly2D`, `.origin`, `.normal`, `.uVec`, `.vVec`, `.transform`, provocando abortos o rotaciones fuera de cubierta en `movePanelTo()` y `rotateSelectedPanel()`.

#### Evidencia Verificada
- `js/app-main.js:2849-2928, 7625-7637, 8564-8567`
- `js/building-footprint-cad.js:888-890`

#### Pasos de Implementación
1. Ejecutar `wpCleanupAllSolarPrimitives(isIncrementalTarget ? targetPolyIdx : null)` y limpiar/filtrar `window.allRenderedPanels` **antes** del guard de gating en `app-main.js:7625`.
2. Preservar los campos geométricos de `lastRoofInfo` (o migrar `movePanelTo`/`rotateSelectedPanel` a leer directamente `WP.polylines[p.polyIdx].roofInfo`).

#### Criterios de Aceptación
- Borrar el último edificio con faldón/paneles desde Paso 1 deja cero primitivas `_isRAPanelPrimitive` / `_isRASupportPrimitive` / `_isRAPergolaPrimitive` en `viewer.scene.primitives`.

---

### `F0-03` — Implementar recuperación real tras `webglcontextlost` / `webglcontextrestored`

| Campo | Valor |
| :--- | :--- |
| **Categoría** | Bug WebGL / Estabilidad |
| **Severidad** | P0 (Crítico) |
| **Esfuerzo** | L (1–3 días) |
| **Dependencias** | Ninguna |
| **Origen** | A-04 |
| **Rama sugerida** | `fix/webgl-context-recovery` |
| **Estado** | `[Hecho]` |

#### Contexto y Problema
Cuando el driver gráfico resetea el contexto WebGL (`webglcontextlost`), la app no detiene `solarSimState.playInterval` ni bloquea renders síncronos; al volver (`webglcontextrestored`), `cesium-safety.js` solo muestra un toast y pide `requestRender()`, dejando en negro o corruptas todas las texturas procedurales (`solarPanelTextureCanvas`, skybox cubemap, `ShadowMap` y primitivas GPU personalizadas). Además intercepta globalmente `HTMLCanvasElement.prototype.getContext`.

#### Evidencia Verificada
- `js/cesium-safety.js:100-150`
- `js/procedural-skybox.js:5, 184, 233-239`
- `js/solar-engine.js:2458-2463`
- `js/app-main.js:906, 5088` (`scene.render()` síncrono)

#### Pasos de Implementación
1. En `webglcontextlost`: marcar `window.RA._webglContextLost = true`, pausar `solarSimState.playInterval`, suspender `RALodManager` / `RABenchmark` y evitar llamadas síncronas a `scene.render()`.
2. En `webglcontextrestored`: limpiar caches GPU (`_raSkyboxCache`, texturas de panel, framebuffers), re-emitir reconstrucción completa (`render3DBuildingsInCesium`, `render3DObstaclesInCesium`, `wpFastRenderSimulatedPanels(true)`, `RACableEngine.renderAllCables()`, `wpUpdateAtmosphericSky()`, `ShadowSettings.apply()`). Si `scene.context` queda irrecuperable en Cesium, ofrecer recarga controlada preservando borrador inmediato en IndexedDB.
3. Limitar el wrapper `getContext` de `cesium-safety.js:133-139` únicamente al canvas de Cesium tras inicializar `viewer`.

#### Criterios de Aceptación
- Simular pérdida/restauración vía `WEBGL_lose_context` en DevTools pausa bucles activos sin lanzar excepciones continuas y al restaurar vuelve a dibujar terreno/tiles, edificios, obstáculos, paneles, cables y cielo.

---

### `F0-04` — Corregir bugs CAD/interacción: gimbal flip en obstáculos, teclado congelado bajo `requestRenderMode`, colisión de atajos `C`/`X`/`M` y alabeo en edificios en L

| Campo | Valor |
| :--- | :--- |
| **Categoría** | Bug CAD 3D / UX 3D |
| **Severidad** | P1 (Alto, urgente de usabilidad 3D) |
| **Esfuerzo** | L (1–3 días) |
| **Dependencias** | Ninguna |
| **Origen** | A-05 + A-06 + A-07 + A-10 |
| **Rama sugerida** | `fix/cad-obstacles-keys-lbuilding` |
| **Estado** | `[Parcial]` *(pendiente intersección independiente de cumbreras en `l_gable` cuando `wA !== wB`)* |

#### Contexto y Problema
Cuatro defectos directos en CAD diario:
1. **Gimbal flip y Z en obstáculos (`A-05`)**: `computeObstacleRotationMatrix` invierte ejes (`dot < 0`) provocando saltos de 180° al pasar ±90°; `updateObstacleLiveModelMatrix` ignora `obs.elevation` cuando existe `obs.cartesian`, causando saltos verticales al soltar tras arrastrar en Z.
2. **Navegación por teclado rota en reposo (`A-06`)**: con `shouldAnimate: false` y `requestRenderMode: true`, `clock.onTick` no corre si no hay movimiento de ratón, congelando `autoRotate` (`Space`) y teclas `WASD`/flechas; falta limpieza en `window.blur`/`visibilitychange` de `keys` y `_raIsShiftDown`.
3. **Colisión de teclas (`A-07`)**: `C` dispara a la vez auditoría de cables y Modo Captura; `X` en cinta métrica alterna también snap global CAD; `M` dispara Mover Faldón y Medir a la vez; tooltip en `measure-tool.js:600` dice erróneamente `(Atajo: S)`.
4. **Faldones no coplanares en edificios L (`A-10`)**: en `l_gable` con anchos distintos (`wA !== wB`) o ángulos distintos de 90°, las cumbreras comparten altura produciendo caras alabeadas y extracción errónea por 3 puntos en `wpComputePlaneFrom3Points`.

#### Evidencia Verificada
- `js/obstacles.js:612-639, 646-682`, `js/universal-gizmo-3d.js:1184-1196, 1567-1571`, `js/cad-events-controller.js:1147-1156`
- `js/app-main.js:476-478, 4506-4600, 4641-4646`, `js/building-footprint-cad.js:148-159`
- `js/cad-events-controller.js:1871-1880, 2002-2007`, `js/capture-mode.js:300-314`, `js/measure-tool.js:600, 918-954`, `js/app-main.js:103, 239-248`
- `js/l-building-parametric.js:398-431, 502-523, 834-846`, `js/buildings.js:2384-2426`

#### Pasos de Implementación
1. **Obstáculos**: Eliminar inversión `dot(normVec, normal) < 0` en `computeObstacleRotationMatrix` usando composición pura de cuaterniones sobre marco ortonormal; crear helper único `resolveObstacleBaseCenter(obs, wp)` usado tanto en drag vivo como en rebuild.
2. **Teclado y cámara**: Pasar movimiento `WASD`/flechas/`autoRotate` de `clock.onTick` a `rAF` auto-terminante activo solo mientras `autoRotate || keys.size > 0` con `dt` y `scene.requestRender()`. Limpiar `keys.clear()` y `_raIsShiftDown = false` en `blur`/`visibilitychange`.
3. **Input Arbiter**: Unificar escucha de atajos en un registro único con prioridad modal/herramienta (`measure-tool` > dibujo > gizmo > cámara), separar conflicto `C` (`V` o `Shift+C` para cables, `C` para Captura) y corregir tooltip `S` -> `X` en `measure-tool.js:600`.
4. **Edificios en L**: Calcular cumbreras independientes e intersección real de planos inclinados en `l_gable` cuando `wA !== wB` o `angleDeg !== 90°` (o triangular caras no coplanares antes de exportar), y usar ajuste por normal de Newell sobre todos los vértices en `buildings.js:2388-2405`.

#### Criterios de Aceptación
- Rotar obstáculos 0°→360° es continuo y soltar en eje Z no altera cota; `Space`/`WASD` rotan/mueven suavemente sin tocar el ratón y Alt+Tab libera teclas; `C`/`X`/`M` disparan exactamente una acción; todo vértice de `extractSolarFaces` queda a `< 0.01 m` del plano `WP.planes` generado.

---

### `F0-05` — Corregir bug de unidades `%/°C` en `cable-engine.js` que colapsa `vmpStr = 12 V` y dispara cables a `70 mm²`

| Campo | Valor |
| :--- | :--- |
| **Categoría** | Bug / Normativa Eléctrica |
| **Severidad** | P0 (Crítico) |
| **Esfuerzo** | S (<2 horas) |
| **Dependencias** | Ninguna |
| **Origen** | B-01 |
| **Rama sugerida** | `fix/cable-engine-gamma-pmp-units` |
| **Estado** | `[Hecho]` |

#### Contexto y Problema
El catálogo guarda `tempCoeffPmax` en `%/°C` (`-0.35`). `onSelectModuleFromDropdown` y `step2SelectModule` lo copian en bruto en `panelConfig.gammaPmp`. `updateElectricalSizingAndHUD` (`cable-engine.js:2782`) multiplica directamente `-0.35 * 45` dando tensión negativa clampada a `vmpStr = 12.0 V`. Al dividir la caída de tensión DC entre `12 V` en vez de `~350–400 V`, `dV_dc_pct` se multiplica por `33×`, marca falso incumplimiento REBT y escala las secciones recomendadas hasta `70 mm²` en HUD, `project-calcs` y Pliego.

#### Evidencia Verificada
- `js/cable-engine.js:2569-2573, 2782-2817`
- `js/working-plane.js:6596-6602, 6753-6756`
- `js/project-config.js:525-528`
- `js/project-calcs.js:423`, `js/docs-generator.js:1412`

#### Pasos de Implementación
1. Definir `normalizeThermalCoeff(raw, defaultVal)` en `js/electrical-engine.js` (`Math.abs(v) > 0.05 ? v / 100.0 : v`) y normalizar obligatoriamente al asignar `panelConfig.tempCoeffPmax` / `gammaPmp` / `tempCoeffVoc`.
2. Aplicar `normalizeThermalCoeff` en `js/cable-engine.js:2782-2784` usando la temperatura máxima de célula real de `climParams` en lugar de `70 °C` hardcodeado.

#### Criterios de Aceptación
- Con `ja_550` (`vmp = 41.96 V`, `tempCoeffPmax = -0.35`), `10` paneles en serie (`L_dc = 25 m`, `Imp = 13.11 A`), `vmpStr` arroja `≈ 353.5 V` a `70 °C`, `dV_dc_pct < 1.0%` en `6 mm²` y `S_dc_recommended` en `4` ó `6 mm²` (nunca `70 mm²`).

---

### `F0-06` — Corregir omisión normativa de diferencial `Clase B` (`rcmuIntegrated !== false`) y doble conteo `2×` en lazo DC

| Campo | Valor |
| :--- | :--- |
| **Categoría** | Normativa Eléctrica / Bug / Coherencia BOM |
| **Severidad** | P0 (Crítico) |
| **Esfuerzo** | M (2–8 horas) |
| **Dependencias** | F0-05 |
| **Origen** | B-02 + B-03 |
| **Rama sugerida** | `fix/rcd-class-b-and-dc-loop-length` |
| **Estado** | `[Hecho]` |

#### Contexto y Problema
1. **RCD Clase B (`B-02`)**: `raResolveRcdSpec` evalúa `inv.rcmuIntegrated !== false`. Ningún inversor del catálogo define esa propiedad (`undefined !== false === true`), por lo que la app asume RCMU integrado y prescribe diferencial `Clase A-SI` en vez de `Clase B` en inversores sin transformador (riesgo de cegado magnético DC, violación IEC 62109-2 / REBT ITC-BT-40).
2. **Doble conteo DC (`B-03`)**: `L_dc_string_measured` ya suma ida + vuelta + retorno + inter-módulo (`fullLoopM`), pero `cable-engine.js:2800` y `electrical-engine.js:2585,2623` multiplican por `2` al calcular `dV_dc`, duplicando la caída y haciendo divergir `S_str` de `S_dc_real` entre Memoria, Pliego y Unifilar.

#### Evidencia Verificada
- `js/electrical-engine.js:642-655, 1264-1290, 2585, 2623-2628`
- `js/working-plane.js:6605-6613`, `js/bom-tree.js:767-775`
- `js/cable-engine.js:2288-2295, 2543-2545, 2592-2598, 2800`
- `js/project-calcs.js:344-345, 423`, `js/docs-generator.js:1145, 1412, 2103`

#### Pasos de Implementación
1. Cambiar `raResolveRcdSpec` (`electrical-engine.js:644`) a comprobación positiva estricta (`inv.rcmu === true || inv.hasRcmu === true || inv.rcmuCertified === true || inv.rcmuIntegrated === true`) y documentar explícitamente `rcmuCertified: true/false` e `isolatedTransformer: true/false` en el catálogo.
2. Separar claramente `L_dc_oneway` vs `L_dc_loop_m` en `cable-engine.js` y calcular `dV_dc = (rho90 * L_dc_loop_m * I_dc) / s` mediante función única compartida en `electrical-engine.js` sin factor `2×` extra cuando el argumento sea longitud de lazo completo.
3. Unificar en `project-calcs.js` una única fuente de verdad de sección DC consumida por HUD, BOM, Memoria, Pliego y Unifilar.

#### Criterios de Aceptación
- Inversor sin transformador ni `rcmuCertified: true` recibe obligatoriamente `Clase B` en motor eléctrico, BOM y Memoria.
- Con lazo medido `L_dc_loop = 40 m` (`13 A`, `6 mm²`, `350 V`), `electrical-engine`, `cable-engine` y `docs-generator` coinciden en `dV = 1.99 V` (`0.57%`) y en idéntica sección nominal.

---

### `F0-07` — Blindar validaciones MPPT (`inputsPerMppt`, `Voc_cold`, `Isc`, MLPE selectivos) y corregir overflow `Ns > Ns_max` en `computeSizingEngineering`

| Campo | Valor |
| :--- | :--- |
| **Categoría** | Normativa Eléctrica / Bug |
| **Severidad** | P0 (Crítico) |
| **Esfuerzo** | M (2–8 horas) |
| **Dependencias** | Ninguna |
| **Origen** | B-04 + B-05 |
| **Rama sugerida** | `fix/mppt-electrical-safety-limits` |
| **Estado** | `[Hecho]` |

#### Contexto y Problema
1. `matchInvertersFromCatalog` nunca valida `_stringsPerMppt <= _inputsPerMppt`.
2. `validateMPPTHomogeneity` solo mira simetría entre strings paralelos; omite `Voc_cold > vDcMax`, `Vmp_hot < vMpptMin`, `Isc * 1.25 > iMaxScA`, exceso de entradas y mezcla serie sin MLPE 100%; `mppt-matrix-controller.js` tampoco verifica `iMaxScA` y usa parámetros globales en vez de los del módulo del faldón.
3. `workflow-orchestrator.js:244` anula cualquier bloqueo MPPT cuando `selectedTopology === 'optimizer'`, incluso con optimizadores parciales/selectivos.
4. `computeSizingEngineering` (`L2505-2506`) contiene bug aritmético que al ajustar `modsPerString < minModsPerString` reduce `numStrings` y recalcula `modsPerString > maxModsPerString`, provocando **sobretensión DC**, fuerza `Tmin: -10` ignorando la zonificación CTE (`-4/-6/-10/-14 °C`), omite `betaVmp` e ignora los strings reales trazados.

#### Evidencia Verificada
- `js/electrical-engine.js:59, 69-86, 699-710, 1837-1870, 2454-2508`
- `js/mppt-matrix-controller.js:294-306`
- `js/workflow-orchestrator.js:244-249`

#### Pasos de Implementación
1. En `computeSizingEngineering:2501-2507`, sustituir el ajuste ingenuo por partición segura que respete siempre el techo estricto `Ns <= Ns_max` (o emita error de incompatibilidad si `[Ns_min, Ns_max]` no cubre `numPanels`), consumir `Tmin` de zonificación CTE y `betaVmp` reales, alinear `V_mppt_min` fallback a `200`, y leer los strings reales de `RACableEngine`/`mppt-matrix-controller` cuando existan.
2. En `matchInvertersFromCatalog`, validar `_stringsPerMppt <= _inputsPerMppt` en `evaluateConfiguration`.
3. Crear validador completo `validateElectricalDesignRules` (llamado por `validateMPPTHomogeneity`, `RAMPPTMatrix.checkStringElectricalSafety` y `workflow-orchestrator`) que bloquee `Voc_cold > vDcMax`, `Isc_canal * 1.25 * (bifacial?1.15:1) > iMaxScA`, `stringsEnMppt > inputsPerMppt` y heterogeneidad sin cobertura MLPE **al 100%** de los módulos del string/canal.

#### Criterios de Aceptación
- Con `numPanels = 13`, `Ns_max = 12`, `Ns_min = 8`, `computeSizingEngineering` jamás devuelve `modsPerString > 12`.
- En Madrid vs Ávila (`>900 m`), aplica `-10 °C` vs `-14 °C` respectivamente.
- Sobretensión, sobrecorriente `Isc`, exceso de entradas MPPT o asimetría parcial sin cobertura 100% MLPE disparan semáforo rojo bloqueante e impiden avanzar al Paso 5 (`canEnterStep(5).allowed === false`).

---

### `F0-08` — Erradicar XSS almacenado/DOM en visor (`32` módulos sin sanitizador) y documentos/visor/iframe generados

| Campo | Valor |
| :--- | :--- |
| **Categoría** | Seguridad (OWASP A03) |
| **Severidad** | P0 (Crítico) |
| **Esfuerzo** | L (1–3 días) |
| **Dependencias** | Ninguna |
| **Origen** | F-01 + F-03 *(nota: D-06 trata limpieza del `escapeHtml` duplicado; coordinar usando `RASanitize` único)* |
| **Rama sugerida** | `sec/xss-dom-and-documents-sanitization` |
| **Estado** | `[Pendiente]` |

#### Contexto y Problema
1. **Visor principal (`F-01`)**: `306` asignaciones `.innerHTML` en `41` archivos (`32` módulos operan sin `sanitizer.js`). Outliner, catálogo, selectores, aerogeneradores, barra superior y resultados de IA/Web interpolan nombres/modelos crudos dentro de HTML y atributos `onclick="... '${id}' ..."`.
2. **Documentos y frames (`F-03`)**: Memoria Técnica, Presupuesto, Propuesta Vertical y Dossier interpolan referencias, modelos de inversor/batería/turbina, extras comerciales, logos sin validar `data:image/` y JSON embebido dentro de `<script>` sin escapar `</script>`; `iframe` de previsualización carece de atributo `sandbox`; la restauración de borradores WYSIWYG usa una lista negra incompleta.

#### Evidencia Verificada
- `js/ui-outliner.js:193-552`, `js/wind/wind-ui.js:779-787, 1269-1279`, `js/working-plane.js:6207-6211, 6322-6338, 6975-7065`, `js/project-config.js:80-148`, `js/ui-viewport-controls.js:235-241`, `js/equipment-web-search.js:454, 486`, `js/equipment-ai-importer.js:637`
- `js/docs-generator.js:734, 750, 760, 1011, 1065-1111, 1184, 1436, 1543, 1556, 1708-1718, 2528`
- `js/financials.js:4688, 5190, 5370-5408, 5580-5895, 5952, 6757, 6783, 6817`
- `js/commercial-proposal-dossier.js:161, 595, 862-867, 903, 1639-1645, 1896, 2279-2303`

#### Pasos de Implementación
1. Garantizar que `js/sanitizer.js` exponga helpers claros (`escapeHtml`, `escapeAttr`, `safeImageUri`, `safeJsonForScript`, `sanitizeRichHtml` por lista blanca) y unificar los `escapeHtml` duplicados de `docs-generator.js` y `mppt-matrix-controller.js`.
2. En el visor y modales, sustituir `onclick="fn('${raw}')"` por delegación `data-action` + `data-id` seguros; usar `textContent` en textos puros o escapar cada interpolación en HTML de catálogo/outliner/status/IA/web-search.
3. En `docs-generator.js`, `financials.js` y `commercial-proposal-dossier.js`: escapar **todos** los campos de proyecto, catálogo, extras y marca; neutralizar `<`, `>`, `&` en serialización JSON incrustada (`safeJsonForScript`); retirar interpolación de datos dentro de bloques `<script>` en propuesta vertical (pasar vía `data-*` attributes); validar logos con `safeImageUri`; añadir `sandbox="allow-same-origin allow-modals"` (mínimo necesario sin `allow-scripts` si es estático o restringido) al iframe de visor incrustado; y reemplazar limpiador lista negra de borradores por `sanitizeRichHtml` (lista blanca).

#### Criterios de Aceptación
- Importar `.raproject` o equipo IA con `"><img src=x onerror=alert(1)>` y `</script><script>alert(1)</script>` en nombre de cubierta, modelo inversor, extra o título de documento no ejecuta JS alguno ni en la app principal ni en memoria/presupuesto/propuesta/dossier/visor iframe.

---

### `F0-09` — Excluir archivo local de entorno del despliegue, endurecer CSP y retirar claves IA de `localStorage`

| Campo | Valor |
| :--- | :--- |
| **Categoría** | Seguridad |
| **Severidad** | P0 (Crítico) |
| **Esfuerzo** | M (2–8 horas) |
| **Dependencias** | F0-08 (ideal tras limpiar scripts/eventos inline en fases siguientes para CSP estricto) |
| **Origen** | F-02 |
| **Rama sugerida** | `sec/hosting-ignore-csp-and-ai-keys` |
| **Estado** | `[Hecho]` |

#### Contexto y Problema
1. `firebase.json` **no incluye `js/ra-env.js` en `hosting.ignore`**: cualquier `firebase deploy` ejecutado desde una máquina local donde exista `js/ra-env.js` lo publica abiertamente en `ra-solar-3d.web.app`.
2. La CSP configurada en `firebase.json` y `server.js` es decorativa: falta `default-src`, `script-src`, `object-src` (o incompleta en restricciones de conexión `connect-src`) dejando pasar scripts inline arbitrarios y exfiltración hacia cualquier dominio.
3. La API Key de Gemini introducida por usuarios se almacena en `localStorage` con un simple `btoa` (`enc:` reversible), expuesta a cualquier fuga o XSS.

#### Evidencia Verificada
- `firebase.json:1-58`, `server.js:226`, `index.html:18-47`
- `js/company-branding.js:29-75`, `js/equipment-ai-importer.js:22-75`

#### Pasos de Implementación
1. Añadir inmediatamente `"js/ra-env.js"` (y `**/ra-env.js`) a `"ignore"` en `firebase.json` (generando la configuración pública exclusivamente en CI/CD con secretos restringidos por HTTP referrer, ver F6-05), y añadir comprobación en `tests/test-no-secrets.js`.
2. Endurecer CSP en `firebase.json` y `server.js` añadiendo directivas explícitas (`default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, `connect-src` restringida a los endpoints reales de Cesium/Google Tiles/PVGIS/NASA/OpenMeteo/Firebase/Proxy IA; preparar ruta para retirar `'unsafe-inline'` en `script-src` conforme avance F4-07).
3. En `company-branding.js` / `equipment-ai-importer.js` / `bill-auditor.js`: migrar llamadas de producción a Cloud Function proxy autenticada (Firebase Auth + App Check) sin persistir clave en `localStorage`; si se soporta modo BYOK local temporal, guardarla solo en memoria de sesión (`sessionStorage` o variable JS en RAM sin persistencia indefinida en `localStorage`) con aviso explícito al usuario.

#### Criterios de Aceptación
- `firebase deploy --only hosting` (o emulación de empaquetado hosting) nunca incluye archivos locales de entorno no versionados si hay secretos, o solo despliega config pública generada por build.
- La cabecera CSP incluye `connect-src`, `object-src 'none'`, `base-uri 'self'` y `frame-ancestors 'none'` sin bloquear tiles 3D ni APIs solares legítimas.
- Ninguna API Key privada de Gemini se escribe persistentemente en `localStorage`.

---

### `F0-10` — Blindar persistencia: migración de autoguardado a IndexedDB, límites Firestore `< 250 KB`, UUID por proyecto, migrador `2.2->2.4` y cero `0 € -> default`

| Campo | Valor |
| :--- | :--- |
| **Categoría** | Persistencia / Integridad de Datos |
| **Severidad** | P0 (Crítico) |
| **Esfuerzo** | L (1–3 días) |
| **Dependencias** | Ninguna |
| **Origen** | F-07 + F-08 + F-09 + F-10 |
| **Rama sugerida** | `fix/persistence-idb-uuid-schema-races` |
| **Estado** | `[Parcial]` (`73e7313`: invalidación `dbPromise` en `storage-cache.js`; autoguardado con IndexedDB + guardia `_raSuspendAutosave` y alerta cuota en `app-main.js`; UUID estable por proyecto aislando fotos/borradores WYSIWYG/recientes/Nuevo Proyecto; redimensionado de logos `<=512px` y captura 3D `<=1600px`; migrador semántico por tuplas `[major, minor]` `2.2->2.3->2.4` y preservación de ceros `0 €`/`0 %`. Pendiente: desacoplar blobs pesados a Firebase Storage `<250 KB` sujeto a reglas desplegadas en bucket). |

#### Contexto y Problema
1. **Pérdida silenciosa de trabajo (`F-07`)**: logos y fotografías base64 se guardan sin redimensionado dentro del JSON. El autoguardado escribe solo en `localStorage` (~5 MB) tragando `QuotaExceededError`, y Firestore intenta guardar el proyecto entero superando el tope estricto de `1 MiB` (falla guardado en la nube).
2. **Contaminación cruzada (`F-08`)**: fotografías y borradores WYSIWYG usan claves compartidas globales o código de oferta en vez de un UUID inmutable de proyecto, pisando assets de un cliente con los de otro; crear proyecto nuevo no purga estilos/extras previos.
3. **Migrador roto y corrupción de ceros (`F-09`)**: compara versiones como floats (rompe `2.10` vs `2.4`), carece de reglas `2.2 -> 2.3 -> 2.4` y usa truthiness (`val || default`) borrando legítimos `0 €` / `0 %` fiscales (IBI, ICIO).
4. **Carreras (`F-10`)**: `raImportProjectData` suelta el lock antes de restaurar UI disparando autoguardado intermedio mezclado; historial reciente duplica fichas por cambios menores de nombre; `storage-cache.js` cachea promesas fallidas de IndexedDB permanentemente.

#### Evidencia Verificada
- `js/app-main.js:291-326`, `js/company-branding.js:300-314, 339-378`, `js/financials.js:6589-6611`, `js/firebase-service.js:176-202`
- `js/project-storage.js:347-361, 477-486, 520-649, 801-843, 1333-1460, 1748-1761, 2031-2130, 2514-2588`
- `js/commercial-proposal-dossier.js:1895-1896, 2246-2265`, `js/proposal-style-studio.js:16, 738-747`
- `js/storage-cache.js:20-44`, `js/undo-manager.js:57-77, 173-177`

#### Pasos de Implementación
1. **Activos y cuota**: Comprimir/escalar logos (`<= 512px`) y fotografías (`<= 1600px JPEG/WebP`) al subir; mover almacenamiento principal de autoguardado y blobs de imagen a `IndexedDB` indexado por `projectUuid`, y en nube subir imágenes a Firebase Storage guardando solo rutas/URLs en Firestore (`doc < 250 KB`). Notificar toast/alerta visible ante cualquier error de cuota.
2. **Aislamiento por UUID**: Asignar `project.uuid = crypto.randomUUID()` estable desde el nacimiento o importación del proyecto; indexar fotos, borradores WYSIWYG y recientes por `project.uuid`; limpiar todo estado de oferta/branding local específico al pulsar Nuevo Proyecto.
3. **Migrador semántico y ceros**: Implementar comparador `(a, b)` por tupla `[major, minor]`, escribir pasos explícitos `2.2 -> 2.3` y `2.3 -> 2.4` y reemplazar checks `x || def` en campos numéricos/fiscales por `(x !== null && x !== undefined && x !== '') ? Number(x) : def`.
4. **Concurrencia**: Suspender explícitamente autoguardado durante todo ciclo `import -> render -> restore` (`try { _suspendAutosave = true; ... } finally { _suspendAutosave = false; }`) e invalidar la promesa de conexión de `storage-cache.js` en `.catch()` y `onblocked`/`onversionchange`.

#### Criterios de Aceptación
- Proyecto con logo, 4 fotos HD y 200 módulos se autoguarda en local sin errores y ocupa `< 250 KB` en Firestore.
- Alternar entre proyectos A y B mantiene fotos y borradores WYSIWYG aislados; parámetros explícitos `0 €` y `0 %` sobreviven export-import; historial reciente no duplica un proyecto al renombrarlo.

---

### `F0-11` — Corregir errores bancables en TIR/Payback/IVA 10%/IS y reconciliar cifras entre pantalla, memoria, presupuesto, propuesta y dossier

| Campo | Valor |
| :--- | :--- |
| **Categoría** | Finanzas / Documentos |
| **Severidad** | P0 (Crítico) |
| **Esfuerzo** | L (1–3 días) |
| **Dependencias** | Ninguna |
| **Origen** | F-11 + F-12 + F-13 + F-14 |
| **Rama sugerida** | `fix/financial-irr-iva10-is-doc-parity` |
| **Estado** | `[Parcial]` (`8712205`: corregido rango bisección TIR `-99%`, separación `tir > 500%` / `paybackYears = null` sin `null %` ni `100.0 %` ni `25.0 años`, coma decimal y retorno `> 25 años` en dossier/memoria/presupuesto, plazo préstamo `120` meses unificado y paso automático a `IVA 21%` si incumple LIVA. Pendiente para siguiente iteración: tipificación de extras material/servicio y amortización lineal diferencial IS en B2B, recálculo financiero completo + escala eólica ante override manual de precio en dossier y desglose ocultar-margen/tabla mensual única en Presupuesto/Memoria). |

#### Contexto y Problema
1. **Bugs TIR/Payback (`F-11`)**: si TIR `> 500%`, el modelo pone etiqueta `>500%` pero número `100.0`, imprimiendo `"100.0 %"` en presupuesto/memoria y `">500%"` en oferta comercial; bisección limitada a `-10%` devuelve `null` imprimiendo literal `"null %"` en presupuesto oficial; retorno se inicializa a `25` e imprime `"25.0 años"` aunque el flujo a 25 años siga negativo; dossier parsea comas europeas fallando a `"Año 4"`.
2. **Riesgo fiscal IVA 10% e IS (`F-12`)**: sumar margen solo en mano de obra y meter todos los extras en materiales distorsiona la regla del `40%` (Art. 91.Uno.2.10º LIVA), y el presupuesto sigue emitiendo al 10% aunque falle la validación; en perfil empresa, suma el 100% del tipo IS sobre todo el CAPEX en año 1 ignorando el escudo fiscal de amortización ordinaria (inflando VAN/TIR).
3. **Divergencias multi-documento (`F-13`, `F-14`)**: plazo de préstamo por defecto distinto (`96` vs `120` meses); saldo mensual financiado diverge entre propuesta y motor; override manual de precio en dossier olvida eólica y congela VAN/TIR/cuotas/renting; presupuesto oficial ignora "ocultar margen", hardcodea precio eléctrico y falla cuadres; memoria técnica pinta tabla mensual actualizada pero gráfico de barras con serie base sin sombras y omite deducciones netas; tabla 25 años no cuadra por redondeos independientes.

#### Evidencia Verificada
- `js/financials.js:4531-4545, 5829, 5973-5977, 7008-7024, 7153-7169, 7577-7719, 7903, 8020`
- `js/docs-generator.js:907-911, 977-979, 1196, 1256, 1424-1597, 1676-1694`
- `js/commercial-proposal-dossier.js:179, 303, 318-320, 515, 548, 844-860, 882-889, 1639-1655`
- `js/cost-modal-ui.js:570`, `js/company-branding.js:286`, `js/project-storage.js:486`

#### Pasos de Implementación
1. **TIR / Payback / Parsing**: Ampliar bisección de TIR hasta `-99%`, separar campo numérico exacto vs string formateado (`"No recuperable en 25 años"`, `"> 500 %"`, `"N/D"` sin imprimir jamás `null %` ni `100.0 %`), y normalizar parseo decimal `,`→`.` en gráficas del dossier.
2. **Fiscalidad**: Tipificar cada extra (`material` vs `servicio`), calcular regla `40%` sobre precio real facturado y conmutar a `21%` automático (con aviso) si incumple condiciones o perfil es empresa; en IS B2B, modelar exclusivamente el diferencial de valor temporal frente a amortización lineal ordinaria.
3. **Snapshot Económico-Energético Único**: Unificar default de préstamo (`120` meses) y fórmulas de saldo mensual; hacer que override de precio en dossier re-escale todas las partidas (incluida eólica) y re-ejecute el cálculo económico completo (VAN/TIR/retorno/cuotas/renting/aislado); hacer que Presupuesto y Memoria consuman 100% ese snapshot (respetando ocultar/repartir margen, precio real de red y serie mensual simulada única para tabla y gráfico) y ajustar residuo de redondeo en tabla a 25 años para que `Ingreso - Gasto === Flujo Neto`.

#### Criterios de Aceptación
- Para proyectos rentables extremos (`>500%`), inviables (`VAN < 0`), empresas (`IS`) y con descuento/margen oculto/sombras simuladas: pantalla, memoria técnica, presupuesto oficial, propuesta vertical y dossier presentan **exactamente los mismos números**, cero `"null %"`, cero IVA 10% improcedente y cuadre exacto fila a fila a 25 años.
