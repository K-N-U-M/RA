# 📝 MEMORY.MD — Memoria del Proyecto RA (Visor Solar 3D)

> **Última actualización:** 2026-10-01  
> **Propósito:** Registro vivo de decisiones de diseño, estado del proyecto y contexto acumulado para agentes IA.

---

## 1. Estado Actual del Proyecto

### Arquitectura
- **Monolito cliente:** HTML/CSS/JS puro, sin backend, sin bundler.
- **Visor 3D:** CesiumJS + Google Photorealistic 3D Tiles.
- **Persistencia:** `localStorage` (proyectos, catálogo, branding).
- **Flujo:** 5 pasos canónicos (Emplazamiento → Campo Solar → Análisis → Ingeniería → Entrega).

### Módulos JS Activos
| Módulo | Responsabilidad | SSOT |
|---|---|---|
| `working-plane.js` | Planos de trabajo, faldones, tríada CAD | `window.WP` |
| `solar-engine.js` | Física astronómica, vector solar | `window.solarProjectConfig` |
| `solar-heatmap.js` | Simulación anual 192 instantes | `window.RA.solarStats`, `solarSimState` |
| `electrical-engine.js` | Strings MPPT, cableado REBT | `getProjectCalcs()` |
| `financials.js` | CAPEX/OPEX, VAN, TIR, oferta comercial PDF | `calculateFinancialModel()` |
| `docs-generator.js` | Memoria técnica, presupuesto BOE, unifilar | `getProjectCalcs()` |
| `bill-auditor.js` | Doble motor auditoría (IA multimodal Gemini + Local Datadis/Regex) | `window.RA.billAuditor` |
| `buildings.js` | Edificios 3D y extrusión | `window.WP.buildings` |
| `obstacles.js` | Obstáculos 3D | `window.WP.obstacles` |
| `capture-mode.js` | Modo captura limpia (tecla C) | `window.RACapture` |
| `undo-manager.js` | Sistema universal Undo/Redo (Ctrl+Z / Ctrl+Y) con arrastres Gizmo, creaciones y borrados | `window.RAundo` |
| `bom-tree.js` | Árbol de materiales (BOM) | `BOMTreeEngine` |
| `project-hierarchy.js` | Scene graph jerárquico | — |
| `ui-outliner.js` | Outliner de objetos | — |
| `wind-turbine.js` | Generadores eólicos 3D (HAWT/VAWT) paramétricos | `window.RAWindTurbine` |
| `measure-tool.js` | Cinta métrica 3D con desglose físico y snap magnético | `window.RAMeasureTool` |
| `ui-viewport-controls.js` | Alertas toast, carga y controles de visualización 3D | `window.UIViewportControls` |
| `company-branding.js` | Identidad corporativa, logo y Gemini API | `window.RACompanyBranding` |
| `equipment-ai-importer.js` | Importador inteligente de fichas técnicas con IA Multimodal | `window.RAEquipmentAIImporter` |

---

## 2. Historial de Decisiones de Diseño

### 2026-09-30: Refactor Faldones — Patrón Master-Detail
- **Problema:** N tarjetas dinámicas HTML por faldón → duplicación DOM masiva, 3 funciones de selección solapadas.
- **Solución:** Dropdown selector (`#faldon-selector-dropdown`) + tarjeta única con IDs estables (`#faldon-edit-card`).
- **Funciones nuevas:** `wpPopulateFaldonCard()` (presentación pura), `wpSelectFaldon(idx)` (selección unificada).
- **Commit:** `173121f`

### 2026-10-06: Sincronización SSOT, Métricas Reactivas y Física de Cables
- **Problema 1 (Heatmap):** El texto "192 INSTANTES" era estático a pesar de cambiar la calidad en ajustes.
- **Solución 1:** Sincronización reactiva del UI con `window.raHeatmapResolution`. El badge ahora es interactivo y abre el modal.
- **Problema 2 (Descuadre Producción):** El HUD (Producción Neta) difería del Histograma BOM (ej. 8698 vs 7287 kWh) por una doble multiplicación errónea del Performance Ratio (`pr`) en el array mensual `monthlyYields`.
- **Solución 2:** Eliminado el `* pr` sobrante en el `map()` del array mensual (línea 6666 aprox).
- **Problema 3 (Métricas Estáticas):** Al mover equipos (Cuadro DC, Inversor, Contador AC), no se actualizaban ni los metros en el BOM ni las pérdidas de sistema en el HUD.
- **Solución 3:**
  - El enrutamiento de cables DC ahora apunta al Cuadro DC (`dcProtectionPosition`) si existe.
  - La caída de tensión real (ΔV) calculada en `wpCalculateAndRenderInverterCables` se inyecta dinámicamente en `window.solarLossConfig.wiring`.
  - Se llama a `recalculateSolarYield()` y `BOMTreeEngine.refresh()` en cascada al evento `LEFT_UP` del Gizmo.

---

### 2026-10-07: Solucion a Crash WebGL en Zoom Extremo (_target)
- **Problema:** Al hacer zoom extremo sobre un cuadro electrico u obstaculo, el motor de sombras de Cesium JS (v1.118) perdia referencias a texturas internas. Esto provocaba un cuelgue critico.
- **Solucion Final:** Inyeccion de un *Watchdog* de bajo nivel en index.html que intercepta el prototipo UniformSampler en los shaders de la GPU. Si Cesium intenta usar una textura undefined, el watchdog inyecta ctx.defaultTexture (fallback 1x1 blanco), previniendo el cuelgue sin afectar la fidelidad visual.

### 2026-10-10/11: Aerogeneradores 3D y Transiciones UI
- **Problema 1 (Flickering SVG):** Al actualizar la inclinación/producción, el histograma se destruía repintando un SVG en negro (DOM replacement).
- **Solución 1:** Reescritura del `renderSolarBarChart()` para mantener nodos SVG e inyectar `style.transition`. Modificación en `bom-tree.js` para extraer el node SVG, actualizar el DOM del panel, y reinyectarlo (preservando estado y CSS). Etiqueta del eje Y optimizada en tamaño (13px, negrita).

### 2026-10-14: Importador Modular de Datasheets con IA Multimodal (`RAEquipmentAIImporter`)
- **Problema:** La introducción manual de módulos, inversores y baterías al catálogo requería transcribir decenas de parámetros técnicos propensos a errores humanos.
- **Solución:** Módulo independiente `js/equipment-ai-importer.js` que procesa PDFs e imágenes con Gemini Multimodal API con esquema JSON estricto, inspector de coherencia física (normalización mm a m, comprobación Voc > Vmp, potencias y límites) y revisión interactiva.
- **Integración:** Pestaña `✨ IMPORTAR CON IA` en el modal de catálogo oficial y botones de acceso directo en Paso 2 y Paso 4.
- **Problema 2 (Obstáculos Paramétricos):** Añadir aerogeneradores requería parámetros dinámicos (radio, altura, HAWT/VAWT) distintos al cubo/árbol, pero con mismo comportamiento UI de inserción.
- **Solución 2:** Patrón de Módulo Aislado (`wind-turbine.js`). En lugar de alterar la lógica central en `obstacles.js`, se aplican function wrappers sobre métodos clave de render/arrastre (`render3DObstaclesInCesium`, `updateObstacleLiveModelMatrix`) interceptando el tipo `wind_turbine` y calculando su propia geometría Cesium, e inyectando un bloque UI propio dinámicamente en `#obstacle-selected-editor`.


### 2026-10-14: Auditoría Integral AAA y Resolución de Desviaciones P0 (Fase 1)
- **Problema 1 (Límites Inversor):** `computeElectricalSizingEngineering` hardcodeaba 1000V/850V ignorando el catálogo activo (riesgo sobretensión IEC 62548).
- **Solución 1:** Desacoplado dinámico desde `solarProjectConfig.selectedInverterId` y `equipmentCatalog.inverters`.
- **Problema 2 (Coeficiente Térmico):** `Vmp_hot` usaba `betaVoc` en vez del coeficiente térmico de potencia/tensión en caliente.
- **Solución 2:** Inyección de `cfg.betaVmp || cfg.gammaPmp || -0.0035`.
- **Problema 3 (Techo Legal Excedentes):** `financials.js` liquidaba excedentes sin el límite mensual del término de energía facturado (RD 244/2019).
- **Solución 3:** Techo regulatorio aplicado (`Math.min(ingresoExcedente, costeRed)`) con conmutación para Batería Virtual (`hasVirtualBattery`).
- **Problema 4 (Heatmap Dirty):** `getProjectCalcs()` utilizaba caché de producción obsoleto aunque `annualHeatmapDirty` estuviera activo.
- **Solución 4:** Detección estricta de `solarSimState.annualHeatmapDirty` y bypass de caché desactualizado.
- **Problema 5 (Paneles Fantasma):** Sin paneles trazados, `getProjectCalcs()` sintetizaba módulos ficticios dividiendo área útil.
- **Solución 5:** Fallback a 0 paneles estricto sin layout CAD.
- **Problema 6 (Clobbering UI):** `config.js` sobreescribía 6 funciones UI de `ui-viewport-controls.js`.
- **Solución 6:** Eliminación de funciones duplicadas en `config.js`.

## 3. Fuentes de Verdad (SSOT Map)

```
getProjectCalcs()          ← Definición canónica en index.html (~L10954)
  ├── window.WP            ← Faldones, planos, geometría
  ├── solarProjectConfig   ← IDs de equipos seleccionados, topología
  ├── equipmentCatalog     ← Catálogo completo (módulos, inversores, baterías, microinversores)
  ├── RA.solarStats        ← Producción solar simulada
  ├── RA.billAuditor       ← Auditoría de factura del cliente
  └── RA.branding          ← Logo, nombre empresa, CIF, garantías

calculateFinancialModel()  ← Definición canónica en financials.js (~L491)
  ├── CAPEX/OPEX desglosados
  ├── VAN, TIR, LCOE, Payback
  ├── Financiación (cuota mensual)
  ├── Degradación TOPCon/PERC
  └── Autarquía y perfiles tarifarios
```

---

## 4. Convenciones y Reglas Vivas

1. **Congelación inline:** Ningún código nuevo en `<script>` inline de `index.html` (desde ~L2230). Todo en `js/*.js`.
2. **CRLF:** `index.html` usa `\r\n`. Usar `\r?\n` en scripts.
3. **Hooks globales:** Funciones llamadas desde `onclick` HTML deben estar en `window`.
4. **Invalidación heatmap:** Mutar geometría → `wpInvalidateHeatmap(reason)`.
5. **SSOT producción:** `getProjectCalcs().annualKWh` es la producción canónica; `kwp × 1450` solo fallback.
6. **5 pasos siempre (en revisión).** Posible fusión de Paso 1 y Paso 2 debido a duplicación de UI.

---

## 5. Problemas Conocidos y Deuda Técnica

| Prioridad | Problema | Dónde |
|---|---|---|
| ✅ Resuelto | ~~Oferta comercial con textos genéricos para inversor/batería~~ | `financials.js` — `resolveEquipmentNames()` |
| ✅ Resuelto | ~~Descuadre Histograma vs HUD por doble aplicación de PR~~ | `index.html` — `recalculateSolarYield()` |
| ✅ Resuelto | ~~Pérdidas del sistema y BOM estáticos al arrastrar Cuadros~~ | `index.html` — `wpCalculateAndRenderInverterCables()` |
| 🔴 Alta | **Paso 2 redundante:** Sus controles (módulo, layout, azimuth) están duplicados en la nueva tarjeta Master-Detail del Faldón (Paso 1). | `index.html` (Flujo Stepper) |
| 🟡 Media | `#wp-polyline-list-report` tiene filas clickables redundantes con el nuevo dropdown | `working-plane.js` (wpUpdateUI) |
| 🟢 Baja | CRLF warning en git para working-plane.js | line endings |

---

## 6. Integración IA (Gemini)

- **Estado:** ✅ Implementada (commit `ae75e0f`)
- **Enfoque:** Híbrido — plantilla determinista por defecto + enriquecimiento Gemini opcional
- **API:** REST API directa (`fetch()`) a `generativelanguage.googleapis.com/v1beta`
- **Modelo:** `gemini-2.0-flash` (rápido, económico)
- **API Key:** Almacenada en `localStorage('ra_gemini_api_key')`, nunca en código fuente
- **UI:** Campo en modal de branding (`modal-cfg-gemini-apikey`) con botón PROBAR
- **Flujo:** `generatePropuestaComercialPDF()` → muestra plantilla → `enrichSummaryWithGemini()` async → reemplaza texto si OK → fallo silencioso mantiene plantilla
- **Funciones clave:**
  - `resolveEquipmentNames()` — lee SSOT del catálogo
  - `generateCommercialSummary(d, m, equipment)` — plantilla determinista
  - `enrichSummaryWithGemini(targetWindow, d, m, equipment)` — llamada async Gemini
  - `testGeminiApiKey()` — validación de conexión desde el modal

---

## 7. Motor de Cableado Ortogonal 3D y Sombras (`RACableEngine` — Octubre 2026)

- **Estado:** ✅ Implementado y modularizado en `js/cable-engine.js`.
- **Cero Catenarias:** Sustitución de curvas catenarias irreales por trazado ortogonal estricto a 90° (Manhattan 3D) descompuesto en los ejes U, V y N de la cubierta y bajantes verticales por fachada.
- **Geometría 3D Volumétrica con Sombras:** Uso de `Cesium.PolylineVolumeGraphics` con perfiles extruidos (tubo cilíndrico r=1.8cm para DC, r=2.5cm para AC y bandeja en U 8x3cm) con `shadows: Cesium.ShadowMode.ENABLED`. Proyecta sombras físicas reales en tiempo real según la posición solar sobre tejas y fachadas.
- **Cotas Reglamentarias:** +0.35m (DC+) y +0.45m (DC- / retorno compensado) sobre el faldón.
- **Colores Planos Sólidos:** `#EF4444` (DC+), `#0284C7` (DC-), `#10B981` (Combiner troncal), `#38BDF8` (AC), `#64748B` (Bandeja), sin shaders procedurales ni efectos glow inestables.
- **Tipologías Soportadas:** Serie pura (1S), Paralelo en cubierta con conectores Y (2S), Combiner Box y Línea de Evacuación AC.
- **Snapping Magnético y Auto-Trazado Zero-Click:** Generación automática al entrar en Paso 4 con codos editables y enganche a terminales de string.
- **Limpieza Inline:** ~26.000 caracteres de código legacy retirados de `index.html`, delegando limpiamente en `RACableEngine`.
- **Verificación:** Suite de pruebas en `tests/test-cable-engine.html` y consola `window.RACableEngine.runSelfTests()`.





---

## 8. Motor de Estructuras 3D Parametricas y Angulo Adaptativo (Octubre 2026)

- **Estado:** Implementado y sincronizado con WP.polylines[i].structureType y WP.polylines[i].modTilt.
- **Migracion a GPU Primitive:** Renderizado directo en GPU via viewer.scene.primitives (Cesium.PolylineCollection), garantizando visibilidad incondicional frente a 3D Tiles fotogrametricos.
- **Geometria A-Frame Cerrada:** Escuadras triangulares cerradas por lateral: Arista baja -> Zapata de lastre en suelo -> Montante trasero vertical -> Cierre inclinado, con travesano de arriostramiento horizontal frontal.
- **Inclinacion Adaptativa al Angulo Seleccionado:**
  - 	riangles_30: Fijo a 30 grados orientacion Sur (180 grados).
  - 	riangles_15_ew: Fijo a 15 grados Este-Oeste (90 grados / 270 grados).
  - 	riangles_custom: Triangulo A-Frame adaptable a cualquier angulo elegido (1 a 60 grados) dinamicamente mediante el slider de inclinacion o el selector de estructura.
  - coplanar_teja / coplanar_chapa: Railes de aluminio longitudinales paralelos al plano de cubierta (-0.025m del modulo).
  - pergola: Pilares verticales en las 4 esquinas descendiendo a cubierta.
- **Sincronizacion Bidireccional:** El slider de inclinacion sincroniza el selector de estructuras y viceversa, regenerando el layout 3D y el desglose BOM en tiempo real.

---

## 9. Auditoría de Simulación Anual y Heatmap Solar (Octubre 2026)

- **Estado:** ✅ Auditado y corregido en `js/solar-heatmap.js` e `index.html`.
- **Cancelación Atómica (Race Condition):** Introducido `_activeSimGenerationId` que aborta inmediatamente simulaciones obsoletas cuando el usuario modifica la escena o relanza el cálculo, evitando acumulaciones dobles en `p.annualTotalPotential`.
- **Preservación SSOT de Paneles (`poly.roofInfo`):** Asegurada la sincronización de referencias antes del cómputo para garantizar que los paneles en memoria coincidan con los paneles renderizados en Cesium.
- **Integración Temporal Dimensional ($\Delta t$):** Corregido el escalado de irradiancia en calidades Media y Rápida multiplicando por `hourStepDt`, evitando subestimaciones de producción anual al variar la densidad de muestreo.
- **Normales 3D ECEF y Optimización GC:** Eliminada la doble rotación matricial en `getPanelNormalWorld` y reutilizados vectores temporales Cesium scratch para mitigar la presión del recolector de basura de JavaScript.
- **Pérdida por Sombra Directa Rigurosa:** La pérdida instantánea en paneles sombreados bloquea la componente de haz directo (`G_beam * tempFactor`) conservando la captación difusa de cielo.
- **AABB Broadphase en Sombras 2D:** Implementado descarte previo por caja envolvente que reduce las evaluaciones polinomiales en un ~50% por iteración.
- **Armonización SSOT de Producción:** Cuando existe un cálculo de heatmap activo y válido, `recalculateSolarYield()` respeta y suma los `p.annualKwh` individuales del raycasting en lugar de sobreescribirlos con promedios planos globales.

---

## 10. Motor de Aerogeneradores Paramétricos AAA (Octubre 2026)

- **Estado:** ✅ Refactorizado y auditado en `js/wind-turbine.js`, `js/obstacles.js` e `index.html`.
- **Zero-Recreation en Drag:** Erradicada la destrucción de primitivas GPU durante eventos continuos `MOUSE_MOVE`. El arrastre en vivo actualiza únicamente matrices matemáticas de transformación (`modelMatrix`), garantizando 60 FPS estables sin saturación del Garbage Collector.
- **Batching WebGL (Draw Call Consolidation):** Agrupación de todas las subgeometrías (mástil, góndola, hub, aspas) bajo una única `Cesium.Primitive` por aerogenerador mediante un array de `GeometryInstance` locales, reduciendo en un 83% el número de draw calls.
- **Orientación Adaptativa:** Cálculo formal del marco de referencia en cubierta (`getObstacleFrame`), respetando si el obstáculo eólico es vertical a plomo o coplanar al faldón.
- **Sombra Analítica 2D Esbelta:** Sombra sobre cubierta ajustada a la sección cilíndrica real del mástil en lugar de una caja maciza de exclusión, evitando pérdidas ficticias por sombra en el heatmap anual.
- **Desacoplamiento Limpio:** Eliminada la mutación destructiva del array canónico `obstacles` (`splice` temporal) en los hooks de renderizado.

---

## 11. Máxima Canónica de Comunicación con el Usuario (Obligatoria)

- **Estilo de Respuesta:** Explicaciones sencillas, directas y conceptuales, SIN referencias a nombres de archivos, rutas de código ni jerga técnica innecesaria.
- **Sin Tests en el Chat:** No ejecutar ni volcar baterías de pruebas, salidas de terminal o scripts de verificación en la respuesta al usuario.
- **Rol Permanente:** Arquitecto e ingeniero senior de software y director de proyectos de herramientas globales de la competencia (calidad AAA): implacable para encontrar fallos, incoherencias operativas e ineficiencias de negocio/diseño, verificando siempre la exactitud de los objetivos de la aplicación.

---

## 12. Soluciones del Bloque 1 de Producto: Tejado y Obstáculos (Octubre 2026)

- **Estado:** ✅ Implementado y verificado en `js/working-plane.js`, `js/obstacles.js` e `index.html`.
- **Enderezador Rápido de Pendiente en 1 Clic (`wpSetPlaneTilt`):**
  - Botones directos de nivelación a estándares constructivos reales: 0° (Plana / Azotea), 15° (Nave industrial), 25° (Teja estándar) y 30° (Tejado tradicional).
  - Recálculo vectorial riguroso de la normal geocéntrica proyectando sobre el vector radial terrestre y el rumbo de caída original, regenerando la base ortonormal `uVec` y `vVec`.
  - Sincronización reactiva con faldones coplanares (`poly.roofInfo.moduleTiltDeg`), regeneración del layout, recálculo de producción e invalidación automática del heatmap solar anual (`wpInvalidateHeatmap`).
- **Detección de Contorno de Cubierta (`wpCheckObstacleInsideRoof`):**
  - Algoritmo de contención 2D (punto en polígono sobre faldones de `WP.polylines`) ejecutado reactivamente al seleccionar, editar o arrastrar obstáculos.
  - Actualización del indicador visual `#obs-inside-roof-badge` (`✓ En cubierta` en verde esmeralda con nombre de faldón / `⚠️ Fuera de cubierta` en rojo).
  - Alerta inmediata en pantalla si se suelta un obstáculo fuera del perímetro de la cubierta en `LEFT_UP`.
- **Imán a Cubierta (`wpSnapObstacleToRoof`):**
  - Botón `#obs-snap-roof-btn` de recuperación automática cuando el obstáculo queda fuera del tejado.
  - Calcula el centroide 3D del faldón activo, proyecta las coordenadas locales `(u, v)` y recoloca instantáneamente el objeto en el tejado, actualizando primitivas GPU y evitando objetos flotando en el vacío.

---

## 13. Soluciones del Bloque 2 de Producto: Campo Solar y Paneles (Octubre 2026)

- **Estado:** ✅ Implementado y verificado en `js/working-plane.js` e `index.html`.
- **Pasillos Centrales de Mantenimiento (`wpTogglePolyWalkway`, `wpApplyPolyWalkwayToAll`):**
  - Botón interactivo por faldón y acción global "A TODOS" para reservar un pasillo libre de 0.80 m (normativa de seguridad y limpieza en obra).
  - Integrado en el empaquetado de `evaluateModuleLayouts`: evalúa el eje mediano de las columnas y excluye las placas que invaden la franja central `[midB - 0.40m, midB + 0.40m]`, dividiendo el campo en dos bloques geométricamente accesibles.
  - Reactivo con invalidación de caché de paneles, renderizado GPU instantáneo e invalidación del mapa de calor solar.
- **Comparador Visual Inmediato Vertical vs Horizontal (`wpGetFaldonOrientationComparison`):**
  - Evaluación analítica instantánea de ambas alternativas (portrait y landscape) sin obligar al usuario a hacer pruebas a ciegas.
  - Tarjeta `#faldon-orient-compare-box` con recuento de módulos y potencia kWp en cada botón (`X mods · P.P kWp`).
  - Badge de recomendación comercial (`#faldon-orient-recommend-badge`) destacando la orientación que aprovecha mejor el espacio (ej. `💡 Horizontal gana: +2 mods (+0.90 kWp)`).
  - Conmutación y resaltado del botón activo en 1 clic con refresco bidireccional de toda la interfaz.

---

## 14. Cinta Métrica 3D y Medición Física con Snap Conmutable (Octubre 2026)

- **Estado:** ✅ Implementado y verificado en `js/measure-tool.js` e `index.html`.
- **Módulo Autónomo y Desacoplado (`RAMeasureTool`):**
  - Ubicación: `js/measure-tool.js`. Singleton `window.RAMeasureTool`, función global `toggleMeasureTool()`.
  - Botón flotante `#btn-toggle-measure-tool` en la botonera inferior derecha del visor 3D (`#ra-floating-tools-container`): botón circular con icono SVG exclusivo (sin texto), con conmutación dinámica de color (slate en reposo, cian brillante con resplandor activo).
  - Atajos de teclado: `M` para alternar la herramienta de medición, `S` para conmutar el snapping magnético mientras está activa, y `Escape` para cancelar tramo o salir.
- **Desglose Físico en 3 Componentes:**
  - Distancia 3D Real (en línea sobre la pendiente del tejado o fachada).
  - Distancia Horizontal 2D (proyección en plano horizontal, útil para retranqueos y lindes).
  - Desnivel Vertical $\Delta H$ y ángulo de inclinación $\alpha^\circ$ (diferencia de cota barométrica/altimétrica).
- **Imán Magnético Conmutable (Snapping ON/OFF):**
  - Atracción en pantalla a $\le 24\text{ px}$ sobre vértices de faldones (`WP.polylines`), planos (`WP.planes`), esquinas de módulos solares (`corners`), obstáculos (`obstacles`), edificios (`buildings`) y cuadros/inversores.
  - Conmutador interactivo con badge en mini-HUD (`🧲 SNAP: [ON / OFF]`) o tecla `S`.
  - Modo sin snap: medición libre por raycast sobre cualquier punto de la superficie 3D.
- **Renderizado Técnico No Destructivo y Visibilidad sobre 3D Tiles:**
  - Trazado de cota elevado a cota rasante (+0.12 m) con `Cesium.ArcType.NONE` y `clampToGround: false` para evitar oclusión por fotogrametría.
  - Puntos terminales con `disableDepthTestDistance: Number.POSITIVE_INFINITY` para visualización garantizada de extremos.
  - Sincronización explícita con el motor de renderizado mediante `requestRender()` en movimiento y clics (`requestRenderMode`).
  - Botón de purga inmediata (`🗑️ Limpiar`) y soporte para medición continua por tramos.
---

## 15. Modularización Fase 2 — Bloque 2.3: Alertas, Pantalla de Carga y Controles de Visor (Octubre 2026)

- **Estado:** ✅ Implementado y verificado en `js/ui-viewport-controls.js` e `index.html`.
- **Módulo Autónomo (`UIViewportControls` / `RA.UI`):**
  - Ubicación: `js/ui-viewport-controls.js`.
  - Exportaciones: `global.UIViewportControls`, `global.RA.UI`.
  - Hooks canónicos globales preservados en `window`:
    - Notificaciones Toast: `showToast(title, message, type, duration)`.
    - Indicadores de carga y geometría 3D: `setLoad(pct, msg)`, `hideLoading()`, `show3DTilesLoading(msg, count)`, `hide3DTilesLoading(delay)`.
    - Banners superiores y HUD: `showStatus(msg, ms)`, `hideStatus()`.
    - Conmutador de texturas de paneles: `togglePhotorealisticPanelsTexture()`.
    - Conmutador de etiquetas 3D/2D: `toggleLabelsVisibility()`.
    - Popover flotante de configuración y motores: `toggleSettingsPopover(force)`.
- **Aligeramiento de `index.html`:**
  - Extraídas más de 200 líneas de lógica del bloque inline principal.
  - Eliminado el último bloque `<script>` inline huérfano al final del archivo (`toggleSettingsPopover`).
  - Carga temprana en `<head>` previa a motores y capas Cesium para erradicar condiciones de carrera en toasts y estados de carga.

---

## 16. Modularización SSOT: Identidad Corporativa y Persistencia de Logotipo (Octubre 2026)

- **Estado:** ✅ Implementado y verificado en `js/company-branding.js`, `js/financials.js` e `index.html`.
- **Diagnóstico de Bugs Erradicados:**
  1. *Fuga de Logo en Carga Dual:* `handleModalCompanyLogoUpload` persistía en clave aislada `ra_company_logo` sin actualizar la estructura principal `ra_company_branding` ni la variable en memoria. Al editar cualquier campo de texto, el guardado de branding sobreescribía la propiedad `logo` con cadena vacía.
  2. *Desfase de IDs de DOM:* Funciones de lectura leían de identificadores prefijados de sidebar inexistentes (`cfg-company-*`), mientras el modal usaba `modal-cfg-company-*`, impidiendo la recarga del logo y previsualización.
  3. *Lector Roto en Generación PDF:* El generador de la oferta comercial (`generatePropuestaComercialPDF`) no disponía de fallback a la clave directa `ra_company_logo` cuando el objeto de branding estaba presente pero con logotipo en blanco.
  4. *Duplicación de Código Inline:* Existían dos implementaciones concurrentes y desfasadas para la subida y borrado del logotipo en el código inline de `index.html`.
- **Módulo Autónomo (`RACompanyBranding` / `RA.branding`):**
  - Ubicación: `js/company-branding.js`.
  - Encapsula: `DEFAULT_BRANDING`, `getBranding()`, `loadCompanyBranding()`, `saveCompanyBranding()`, `handleLogoUpload()`, `clearLogo()`, `openModal()`, `closeModal()`, `syncModalInput()`, `updateLogoPreview()` y `testGeminiApiKey()`.
  - Conexión reactiva instantánea: subida de logotipo sincroniza simultáneamente la memoria en vivo (`window.customCompanyLogoBase64`), la clave de rescate `ra_company_logo` y la estructura `ra_company_branding`.
  - Fallbacks canónicos jerárquicos en `js/financials.js` garantizan que cualquier propuesta comercial cuente siempre con los datos e imagen corporativa configurados por el usuario.
- **Congelación Inline:** Retiradas más de 200 líneas de código legacy del bloque inline de `index.html`, delegando limpiamente en el nuevo módulo.

---

## 17. Auditoría de Facturas Eléctricas — Doble Motor (IA Multimodal + Local Offline) (Octubre 2026)

- **Estado:** ✅ Implementado y verificado en `js/bill-auditor.js` e `index.html`.
- **Arquitectura de Doble Motor Canónico:**
  1. **Motor IA Multimodal (`AIBillParser`):**
     - Alimentado por Google Gemini API (`gemini-2.0-flash` con degradación a `gemini-1.5-flash`).
     - Extracción nativa de documentos PDF oficiales (digitales y escaneados) e imágenes fotográficas tomadas con smartphone (JPG, PNG, WebP) mediante carga en base64 `inlineData`.
     - Extracción profunda y estructurada en JSON garantizado (`responseMimeType: "application/json"`): CUPS, distribuidora, comercializadora, tarifa de acceso, días facturados, potencias contratadas por periodo (P1/P2/P3), consumos por periodo (P1/P2/P3), precios unitarios reales de energía (€/kWh), término fijo, término variable, impuestos y total.
     - **Extracción de Histórico Anual de 12 Meses:** Detecta la gráfica de barras del último año presente en las facturas españolas, calculando el consumo anual real acumulado `consumoAnualEstimadoKWh` para erradicar el error de estacionalidad (1 mes $\times$ 12).
     - **Diagnóstico Comercial Inteligente:** Evalúa si la potencia contratada está sobredimensionada o si el precio del kWh es ventajoso frente al mercado solar.
  2. **Motor Local Determinista (`BillParser`):**
     - 100% offline, local y de ejecución instantánea (<5 ms).
     - Procesamiento de curvas horarias de distribuidora Datadis (CSV), volcados JSON y texto copiado directo mediante expresiones regulares multiformato (Iberdrola, Endesa, Naturgy, PVPC, Repsol, TotalEnergies, Octopus).
- **Experiencia de Usuario Glassmorphic:**
  - Selector segmentado en cabecera: `[🔄 Auto (Recomendado)]`, `[🧠 Motor IA (Gemini)]` y `[⚡ Local (CSV / Reglas)]`.
  - Enrutamiento inteligente: arrastrar un PDF o foto activa automáticamente el motor IA; arrastrar un CSV activa el motor local.
  - Indicador interactivo de conexión de clave de IA (`✨ IA Gemini Conectada` / `⚠️ Conectar IA Gemini`) con mini panel desplegable para introducir o modificar la API Key sin salir del visor ni interrumpir el flujo de trabajo.
  - Animación de carga y progreso con micro-spinner durante el análisis de documentos IA.
  - Tarjetas destacadas de diagnóstico IA y de histórico anual detectado.
  - Sincronización inmediata con el estudio solar (`applyBillToBudget`): inyecta el consumo anual y la factura media en el presupuesto y dimensionamiento de paneles.

---

## 18. Etiquetas 2D On-Hover con Fade In (150ms) y Fade Out (300ms) (Zero Clutter Architecture) (Octubre 2026)

- **Estado:** ✅ Implementado y verificado en js/working-plane.js e index.html.
- **Objetivo y Filosofía Zero Clutter:**
  - Erradicado el apiñamiento visual de múltiples rótulos técnicos simultáneos en la cubierta 3D (planos de trabajo, faldón activo, cuadro DC, inversor, combiner box, contador CGMP).
  - En reposo, la escena se mantiene 100% limpia sin textos superpuestos sobre fotogrametría ni paneles fotovoltaicos.
- **Cinemática Temporal de Alta Precisión:**
  - **Aparición (*Fade In*):** 150 ms (dt / 0.15), con respuesta instantánea y táctil al posar el cursor sobre el elemento o su rótulo.
  - **Desvanecimiento (*Fade Out*):** 300 ms (dt / 0.30), ofreciendo una salida progresiva y suave sin cortes bruscos.
- **Detección Dual Inteligente:**
  - Detección espacial sobre el objeto 3D proyectado (polígono de faldón, triángulo de plano o proximidad a equipo eléctrico en pared/cubierta <= 42 px).
  - Detección en la caja delimitadora 2D de la propia etiqueta con margen de holgura (+8 px), garantizando lectura cómoda y continua sin parpadeos.
- **Bucle de Animación Autónomo y Cero Consumo en Reposo:**
  - Gestión centralizada de estados de opacidad interpolada _labelHoverStates (Map).
  - Ciclo de renderizado activo a 60 FPS gobernado por equestAnimationFrame solo mientras existan transiciones activas (0.0 < alpha < 1.0).
  - Desconexión total del ciclo de animación una vez estabilizadas las opacidades en 0.0 o 1.0 (cero impacto en CPU/GPU durante el reposo).
  - Las etiquetas invisibles (alpha <= 0.005) no se dibujan ni reservan espacio en el resolvedor de colisiones AABB (_drawnAABBs), permitiendo que solo los rótulos activos ocupen su espacio natural.

---

## 19. Soluciones del Bloque 3 de Producto: Inteligencia Solar y Estrategia Comercial de Factura (Paso 3) (Octubre 2026)

- **Estado:** ✅ Implementado y verificado en `js/solar-heatmap.js`, `js/project-config.js` e `index.html`.
- **Refresco Solar en 1 Clic (`wpUpdateStep3DirtyAlert`, `wpRunHeatmapAndActivateView`):**
  - Detección inmediata en tiempo real tras cualquier cambio en el gemelo digital (desplazamiento de obstáculos, alteración de inclinación/azimut, edición de faldones o cambio de modelo de panel).
  - Alerta prominente con motivo dinámico del cambio (`#step3-dirty-reason-badge`) y botón reactivo de actualización instantánea ("Actualizar Estudio de Sombras y Sol Ahora").
  - Al pulsar, recalcula la simulación de sombras anual en tiempo real (192 instantes), regenera el mapa de calor 3D, actualiza la producción neta del proyecto y oculta la alerta.
- **Estrategia Comercial de Autoconsumo Guiada por Factura (`wpSelectCommercialPath`, `wpUpdateCommercialPathsUI`):**
  - Dos caminos comerciales claros y diferenciados en tarjetas visuales interactivas:
    - **Camino A (Ahorro Justo / Autoconsumo Óptimo):** Ajusta los paneles estrictamente a la demanda anual auditada (`target_kwh`), podando los módulos con mayor sombra para maximizar la rentabilidad sin sobredimensionar la inversión. Si no hay factura vinculada, abre el auditor con llamada a la acción guiada.
    - **Camino B (Tejado Completo / Máxima Producción):** Llena el 100% de la superficie útil de la cubierta (`max_roof`) para maximizar la venta de excedentes a la red eléctrica.
  - Métricas dinámicas en vivo en ambas tarjetas: reflejan en tiempo real kWh/año, número de módulos recomendados y potencia pico (kWp).
  - Sincronización bidireccional inmediata con los selectores de criterios técnicos del proyecto y el presupuesto económico.
- **Poda Equitativa y Distribución Multi-Faldón (`wpFilterPanelsForPolyline`):**
  - Resuelto el problema de asignación per-faldón en proyectos con múltiples cubiertas: el límite de módulos de la factura se aplica de forma coordinada a nivel global de la vivienda.
  - Ordenación inteligente por calidad solar: clasifica todos los módulos de todos los faldones priorizando menor pérdida por sombra (`annualLossPct`) y mayor rendimiento (`annualKwh`), garantizando que se conserven siempre las mejores posiciones fotovoltaicas del tejado.

---

## 20. Soluciones del Bloque 4 de Producto: Asistente Eléctrico y Emplazamiento 3D (Paso 4) (Octubre 2026)

- **Estado:** ✅ Implementado y verificado en `js/electrical-engine.js` e `index.html`.
- **Asistente Proactivo de Sustitución de Inversor (`wpUpdateInverterSmartAssistantUI`, `wpApplyRecommendedInverter`):**
  - Evalúa la potencia pico total instalada contra la capacidad nominal y sobrecarga del inversor seleccionado.
  - **Inversor Insuficiente:** Si la cubierta sobrecarga el equipo (>130% DC/AC), el asistente busca en el catálogo el inversor de mayor potencia que optimice la ratio a 115-125% y ofrece el botón de sustitución directa en 1 clic ("Cambiar a X kW en 1 Clic").
  - **Sobredimensionamiento Evitado:** Si el inversor seleccionado supera en exceso la potencia de las placas (<50% carga), recomienda el modelo inferior adecuado para evitar sobrecostes innecesarios en la oferta.
  - **Multi-Inversor Auto:** Si la planta excede la capacidad del mayor inversor individual del catálogo, alerta de la necesidad de configuración multi-equipo en paralelo y calcula el reparto de unidades.
  - **Soporte Microinversores MLPE:** Evalúa la topología descentralizada computando las unidades requeridas según el número de entradas del microinversor (1, 2 o 4 módulos/ud).
- **Guía Visual de Emplazamiento de Infraestructura Eléctrica (`wpUpdateMeterPlacementGuideUI`):**
  - Diagnostica el estado de ubicación física del inversor y del contador/acometida (CGMP) en fachada.
  - Cuando están pendientes, muestra pasos guiados interactivos para tocar en la pared del modelo 3D y fijar su cota exacta.
  - Cuando ambos están ubicados, valida la medición con tarjeta de confirmación en verde indicando las tiradas reales medidas en 3D (metros de cable DC de bajante y cable de evacuación AC), garantizando presupuesto y caída de tensión REBT (ITC-BT-40) exactos al centímetro.

---

## 21. Soluciones del Bloque 5 de Producto: Presupuesto y Oferta Final (Paso 5: Entrega) (Octubre 2026)

- **Estado:** ✅ Implementado y verificado en `js/financials.js` e `index.html`.
- **Página de Cierre Comercial para el Cliente Final (`generatePropuestaComercialPDF`):**
  - **Página 1 (Decisión Ejecutiva de Alto Impacto):**
    - Responde directamente en letras grandes y diseño ultra limpio a las 4 preguntas determinantes del comprador:
      1. *Ahorro Anual en Factura (€/año y €/mes).*
      2. *Nueva Factura Mensual Proyectada (~€/mes vs gasto anterior).*
      3. *Retorno de Inversión (Payback en años y energía gratuita durante 20+ años).*
      4. *Garantías Oficiales (25 años en módulos, 10 años en inversor).*
    - Comparativa de decisión de pago: *Opción A (Llave en Mano con bonificaciones fiscales IBI/ICIO/IRPF)* frente a *Opción B (Financiación 100% sin entrada con balance neto mensual positivo desde el primer día)*.
    - Cuadro de aceptación inmediata con reserva de instalación y firma del cliente en la primera hoja.
    - Resumen ejecutivo del proyecto enriquecible vía IA Gemini multimodal / local determinista y huella ambiental (CO₂ evitado y árboles equivalentes).
  - **Páginas 2 y 3 (Especificación Técnica e Ingeniería EPC):**
    - Todo el detalle técnico, catálogo de equipos instalados, desglose económico por capítulos EPC, subvenciones fiscales, histograma mensual SVG, curva de amortización a 25 años y sellos normativos (REBT ITC-BT-40, RD 244/2019, IEC 61215).
- **Revisión Previa Interactiva de Precios y Margen (`wpOpenPricingReviewModal`, `RAPricing`):**
  - Modal rápido accesible desde la tarjeta de precios en el Paso 5 o interceptor previo a la emisión de la oferta comercial.
  - Permite validar o reajustar en segundos: *Precio unitario del módulo (€/ud)*, *Mano de obra estimada (€)* y *Margen comercial deseado (%)* con botones de acceso rápido (15%, 20%, 25%, 30%).
  - Cálculo en vivo no bloqueante de coste directo, beneficio comercial neto, base imponible y total llave en mano con IVA (21%).
  - Persistencia segura en `localStorage('ra_pricing_defaults')` para fijar los precios habituales del instalador y evitar ofertas a pérdidas.
  - Sincronización reactiva inmediata con el badge del Paso 5 (`#step5-pricing-badge`), el presupuesto general (`updateBudgetUI()`), el resumen ejecutivo de ingeniería y los inputs del desglose.

---

## 22. Auditoría Integral de Arquitectura, Código y UI/UX (Octubre 2026)

- **Diagnóstico General:** Despliegue de 4 subagentes especializados para auditar UI/UX, motor 3D/física solar, ingeniería eléctrica/finanzas y código muerto.
- **Limpieza del Repositorio:**
  - Purgados y eliminados 60 ficheros huérfanos/temporales de la raíz (36 scripts `.py` desechables, `add_script.js`, directorio `__pycache__/` y 23 ficheros `.txt`).
  - Purgados 23 scripts temporales en `scratch/` (scripts de inyección y pruebas efímeras), preservando únicamente la suite de pruebas automatizadas.
  - Archivados 5 documentos históricos de auditorías pasadas en `doc/historico_auditorias/` para mantener una raíz de repositorio limpia y canónica.
- **Auditoría Especializada Multi-Agente (Octubre 2026):**
  - **Física Solar y Motor 3D (Subagente 2):** Identificado factor erróneo `* 1000` en `GHI_instant` (`solar-engine.js:552`) que reducía la producción anual a 90-600 kWh/año; inversión 180° Norte/Sur en `calcPOA`; fuga de entidades en `wpRenderAllPolylines` por identificadores aleatorios sin grupo; overhead de CPU en cinta métrica (`measure-tool.js`) en `MOUSE_MOVE`; doble cómputo de pérdidas térmicas/IAM en heatmap anual.
  - **Ingeniería Eléctrica y Finanzas (Subagente 3):** `vmpStr` hardcodeado a 12 módulos en `cable-engine.js:718`; fallback mudo a 6mm²/10mm² si se sobrepasa la caída del 1.5%; corriente no sumada en bajantes con conectores Y; división por cero en amortización a 0 meses (`financials.js:1527`).
  - **UI/UX y Flujo de 5 Pasos (Subagente 1):** `wpCancelDrawPoly` inexistente al pulsar `Escape` en dibujo de faldón; herramientas interactivas no reseteadas en `wpGoToStep`; botón muerto `VER AUDITORIA MATEMATICA PFV`; modal `#ra-doc-modal` sin botón en interfaz y con z-index tapado; modales sin cierre con `Escape` o clic exterior.
  - **Estabilidad, Persistencia y Deshacer (Subagente 4):** Función inexistente `wpRenderAllWorkingPlanes` en `undo-manager.js:250` que dejaba mallas zombi al deshacer planos; omisión de `planeIdx` y `structureType` en exportación/importación `.raproject` en `project-storage.js`; race condition en autosave debounced (1500 ms) y generación de PDF durante simulación activa.
- **Ejecución del Plan por Fases:**
  - **Fase 1 (P0 - Críticos) [Commit `0714a96`]:** Normalización del vector Este en `wpComputePlaneFrom3Points` y `cursorGizmoShowAt` (eliminación de ~8° de error de acimut); corrección de `vDcMax` en inversores para cumplimiento IEC 62548; blindaje de división por cero con 0 paneles; sincronización de hardware seleccionado con catálogo; inversión de rayo solar en `rayCastingIsShaded`; corrección de batería fantasma.
  - **Fase 2 (P1 - Rendimiento y Multi-Inversor) [Commit `0c06465`]:** Broadphase 2D por faldón en `_flushHeatmapPanelHover` a 60 FPS; pool de entidades reutilizables `panelShadowOverlayPool` erradicando churn de GC; cancelación atómica en `wpInvalidateHeatmap` con `_activeSimGenerationId++`; dimensionamiento acumulado multi-inversor en cable AC (`RACableEngine`); balance de MPPTs multi-inversor (`electrical-engine.js`); límite de longitud de sombra CTE DB-HE5.
  - **Fase 3 (P2/P3 - Ergonomía Visual, Unificación y Limpieza) [Commit `ff1c204`]:** Unificación de botones de Memoria Técnica en Paso 5 apuntando canónicamente a `docs-generator.js` (`generateMemoria()`); ocultación del bloque redundante `#p2-advanced-disposition` en Paso 2 para evitar controles compitiendo; resolución de colisiones visuales CSS (`#ra-confirm-bar` a `bottom: 96px;` y `#ra-bom-tree-hud` a `top: 170px;` despejando la rosa de los vientos `#ra-rosa`); preservación de la catenaria canónica inter-panel en `buildOrganicCatenary` y delegación limpia de ordenación de strings.
  - **Fase 4 (P2 - Lenguaje de Instalador y Portátiles de Obra) [Commit `5ca3db6`]:** Humanización de textos en UI ("Tríada CAD" → "Tamaño de Ejes 3D", "Diagnóstico MLPE" → "Ver Optimizadores / Mitigación", "Shadow Bias" → "Despegue de Sombras Anti-Parpadeo"); ajuste responsivo `@media (max-width: 1400px)` en `#ra-shortcuts-hud` para erradicar solapamiento con el control solar en pantallas de portátiles.
  - **Corrección de Bloqueo de Polilíneas y Barra de Confirmación [Commit `fcfb1a5`]:** Ocultación obligatoria de `#ra-confirm-bar` al terminar o cancelar la extrusión de edificios; desbloqueo de `btnDraw` ("Dibujar Polilínea en Plano") para auto-detectar edificios 3D y convertir su cubierta en plano solar automáticamente sin fricción; cierre del modo de edición de huella (`bldFootprintState`) al confirmar o cerrar polilíneas.
  - **Fase 5 (P0 - Física Solar, Seguridad Eléctrica y Guardado) [Ejecutada y Verificada]:**
    - Corrección de factor 1.000x y convención de acimut (-180°) en radiación física solar (`solar-engine.js`), normalizando la producción anual de un tejado Sur a 8.441 kWh/año (1.688 kWh/kWp, PR 84.8%) frente a los 595 kWh/año previos.
    - Caída de tensión DC calculada con los paneles reales del circuito y corriente duplicada en bajantes troncales con conectores en Y (`cable-engine.js`), dimensionando correctamente conductores a 10 mm² con telemetría de alerta en rojo ante no cumplimientos del 1.5%.
    - Rebalanceo de canales MPPT al modificar inversores en `step3UpdateHardwareSelection` (`project-config.js` y `electrical-engine.js`).
    - Persistencia integral de `planeIdx` y `structureType` en exportación/importación `.raproject`, y limpieza in-place en `raNewProjectConfirm` cancelando autoguardados huérfanos (`project-storage.js`).
    - Erradicación de mallas zombi al deshacer planos con `Ctrl+Z` invocando `wpRenderActivePlaneGizmo()` (`undo-manager.js`).
    - Blindaje de divisiones por cero en amortización a 0 meses (`financials.js`) y consumos de 0 kWh en auditoría de facturas (`bill-auditor.js`).
  - **Fase 6 (P1/P2 - Estabilidad 3D Cesium, Memoria y Física de Separación CTE) [Ejecutada y Verificada]:**
    - Erradicación de fugas de memoria en `working-plane.js`: registro estricto de las entidades `line` y `fill` en `WP.ents.polys` asegurando su destrucción limpia al redibujar o limpiar tejados.
    - Cinta métrica 3D a 60 FPS sin asignaciones de memoria (`measure-tool.js`): reutilización de pines A y B, halo magnético y etiqueta con visibilidad condicional (`show`); limitación de refresco de ratón con `requestAnimationFrame`; filtrado angular con producto escalar de cámara; y flechas indicadoras de sentido de desnivel (`↑ (sube)` / `↓ (baja)`).
    - Desacoplamiento de `prBOS` en `config.js` y `solar-heatmap.js`, eliminando el doble descuento de pérdidas térmicas y angulares (IAM) en la producción anual neta del mapa de calor.
    - Cumplimiento estricto de la ventana de 4 horas en solsticio de invierno (10:00 a 14:00 hora solar) según CTE DB-HE5 / IDAE en `computeInterRowPitch` (`solar-engine.js`), garantizando que la separación entre filas no produzca autosombreados invernales (paso total $\sim 4.60\text{ m}$ para módulos de $2.20\text{ m}$ a $30^\circ$ en latitud $40.4^\circ$).
  - **Próximas Fases Programadas:** Fase 7 (Ergonomía de Flujo, Modales Accesibles y Desbloqueos).

---

## 23. Auditoría Integral v3.0 y Limpieza de Repositorio (Octubre 2026)

- **Diagnóstico:** nueva auditoría multi-agente sobre 5 dominios (UI/UX y flujo, física solar, ingeniería eléctrica y persistencia, finanzas/IA/documentos, repositorio y documentación). Plan vigente en `AUDITORIA_INTEGRAL_Y_PLAN_DE_RESOLUCION_2026.md`.
- **Hallazgos verificados más graves:**
  - El desplegable "Estructura de Montaje" del faldón llama a `wpSetPolyStructure`, **no publicada en `window`** (el módulo `working-plane.js` es una IIFE): el `onchange` lanza error y no aplica cambios.
  - La TIR de la **Oferta Comercial** se multiplica **×100 dos veces** (`docs-generator.js` aplica `m.tir * 100` sobre un valor que `financials.js` ya devuelve en %), mostrando cifras absurdas (p. ej. 1500 %); la Memoria Técnica sí la muestra correcta.
  - La conclusión de la Memoria Técnica lee `d.roi` (campo **inexistente**) → imprime siempre "undefined años".
  - Copia de respaldo de cálculo eléctrico y de configuraciones de panel duplicada entre `index.html` (inline) y los módulos; claves de Google/Cesium **duplicadas** en `index.html` y `js/config.js`.
- **Limpieza ejecutada:**
  - Eliminados 6 scripts de verificación de un solo uso en `scratch/` (fases 1/5/6/7, dirty-state, model-discovery).
  - Movidas 3 pruebas reutilizables de `scratch/` a `tests/` (`test-js-syntax.js`, `test-ra-full-workflow.js`, `test-equipment-ai-importer.js`).
  - Archivados 4 planes superados en `doc/historico_auditorias/` (`PLAN_MAESTRO_REESTRUCTURACION_FLUJO`, `MIGRATION_PLAN`, `PLAN_DE_ACCION_AUDITORIA_INTEGRAL_2026`, `PLAN_IMPLEMENTACION_IMPORTADOR_DATASHEETS_IA`).
  - Renombrado `agents.md` → `AGENTS.md` (coincidencia exacta con las referencias; portabilidad Linux).
- **Documentación corregida:** `doc/01` (13→16 h, 156→192 instantes), `doc/02` y `doc/03` (eliminada capa inexistente `src/*.ts` y Three.js; inventario de 30 módulos; rutas de pruebas), `doc/04` (script names), `README.md` (módulos y atajos), `AGENTS.md` (referencias a documentación).

## 24. Resolución de la Auditoría Integral v3.0 — Fases A–E (Octubre 2026)

- **Fase A (P0):** publicado `wpSetPolyStructure` en `window`; corregido el ×100 doble de la TIR en la oferta; leído el campo correcto del plazo de retorno; restaurados los campos de panel/faldón al abrir; claves centralizadas fuera del código.
- **Fase B (P0–P1):** duración del día por mes + curva diaria; migración de versiones `.raproject`; **motor de radiación único** `js/radiation-engine.js` (`RA.Radiation`: Erbs + Hay-Davies + IAM ASHRAE) consumido por comparador de escenarios y mapa de calor (anual canónico 6033 → 6044 kWh/año, **+0.18%**; paridad exacta verificada, Δ=0 en vivo).
- **Fase C (P1):** corriente en paralelo y etiqueta de topología, elección de inversor por suma de corrientes, fase del inversor como dato propio, fuente única de obstáculos, migración de `.raproject`, corrección térmica/agrupamiento de cables.
- **Fase D (P1–P2):** clave IA en cabecera `x-goog-api-key` con almacenamiento ofuscado (prefijo `enc:`) y helper `RA.getGeminiApiKey`; timeout + cancelación en llamadas IA; anti-doble-fire del mapa de calor; estado unificado del mapa de calor; distinguir "0 real" de "vacío" en costes.
- **Fase E — E1 (P2–P3, alcance Grupo A = solo código muerto):** eliminados el historial de deshacer inline duplicado de 25 pasos en `index.html` (pila write-only, `window.RAundo` de 30 es el real) y sus llamadas `pushUndoState()`; stacks muertos de `js/obstacles.js`; clones locales sin llamantes `generateSnakeWiringPositions` (`index.html`) y `buildOrganicCatenary` (guard inline): se conservan las exportaciones canónicas de `js/electrical-engine.js` y `js/solar-materials.js`; eliminado el doble literal de `window.solarProjectConfig` (SSOT en `js/project-config.js`; inline con guard de una línea). Verificado: **31/31 sintaxis + 15/15 workflow + IA importer 100%**.
  - **Deuda pendiente (Grupo B, divergencias de comportamiento):** unificar constantes de tensión (`Tmax` 70 °C/γVoc −0.0027 vs 65 °C/−0.0028; recomendado **70 °C/−0.0027** con ventana real de Vmppt del inversor); `window.panelConfig` (módulo, nunca mutado) vs `panelConfig` léxico de `index.html` (mutado) → posibles Voc/Vmp obsoletos en límites MPPT; indexado de color de serie (`polyIdx*10+sIdx` vs `strIdx++`); `computeOptimalStringRouting` reimplementa partición/serpiente en vez de consumir `RA.Electrical`.
- **Fase E — E2 (M15, fachadas y llamadas muertas):** eliminadas las exportaciones-ventana sin consumidores (`RA.bomEngine`, `RA.CesiumSafety`, `RA.companyBranding`, `RA.viewportControls`, `RA.viewerUtils`, `RA.projectStorage`, `RA.measureTool`, `toggleMeasureSnapping`, `handleCompanyLogoUpload`, `clearCompanyLogo`, `updateCompanyLogoPreview`, `wpPopulateEngineeringEquipment`, `wpUpdateEngineeringHardware`, `wpUpdateDesignObjective`) y el bloque de alias `step4*`/`populateEngineeringEquipmentSelectors` de `index.html`. Corregidos crash `wpNavStep(2)` → `wpGoToStep(2)` guardado y typo `toggleBuildingFootprintEdit`→`toggleBuildingFootprintEditing`.
- **Fase E — E3 (G11):** eliminada la gemela inerte `wpSelectPolylineForStep3` (+ llamada guardada) y exportaciones sin uso `wpApplyRoofPreset`/`wpApplyMLPERecommendationAction`/`wpTogglePolyOrientation`; expuesta `RAMeasureTool.invalidateSnapCandidates()` y enganchada a `window.wpInvalidateHeatmap` para limpiar el caché del imán al mutar geometría.
- **Fase E — E4 (M16):** `package.json` sin dependencias; `npm run lint` (gate de sintaxis) y `npm test` (sintaxis + motores + importador IA).
- **Fase E — E5 (m1–m9, pulido):** **m1** orden de argumentos de `showToast` corregido en `error-handler.js`; **m2** proyectos recientes con guardado resistente a cuota + aviso; **m3** comentario de `geometry-validate.js` corregido ("menor rango"); **m4** retirados `console.log` de arranque (`wind-turbine.js`, `workflow-orchestrator.js`); **m8** listas de modelos Gemini reordenadas a reales primero (`gemini-2.5-flash`…); **m9** etiqueta "192 instantes" → "192 instantes nominales, sol ≥ 10°". Revisados sin cambio: **m5** (a11y de botones icono), **m6** (botón "Memoria Técnica" duplicado en Paso 5, decisión de UI), **m7** (bloques ocultos, mayormente legítimos). Verificado: **31/31 + 15/15 + IA 100%**.

## 25. Autocompletado de datos del cliente/titular desde la factura (Octubre 2026)

- **`js/bill-auditor.js`:** el esquema del prompt IA (`analyzeDocument`) y el parser local (`extractBillFromText`/`parseText`) ahora extraen la identidad del titular (`titularNombre`, `titularNIF`, `direccionSuministro`, `codigoPostal`, `municipio`, `provincia`, `telefono`, `email`), normalizada por `normalizeAIData` como `currentBill.titular = { nombre, nif, direccion, cp, municipio, provincia, telefono, email }` (viaja en el `.raproject` exportado y en los recientes). `parseJSON` acepta `obj.titular` o claves planas equivalentes.
- **Vista previa editable** en el modal auditor (`#bill-titular-block`, inputs `bill-edit-tit-*`); recogida al vuelo por `collectTitularFromModal()` (botón aplicar y botón recalcular).
- **`applyBillToBudget()`** vuelca a los campos de documentación `#doc-cups`, `#doc-nombre`, `#doc-nif`, `#doc-tel`, `#doc-email`, `#doc-dir`, `#doc-mun`, `#doc-prov`, `#doc-cp`, y a `#doc-potcontr` (P1+P2) y `#doc-dist` (select casado por texto), **solo si el campo está vacío o conserva su valor por defecto** (comparación con `HTMLInputElement.defaultValue`) — nunca sobrescribe datos ya introducidos. Corregido el id inexistente `#tit-cups` → `#doc-cups` (auto-relleno de CUPS roto). No modifica el nombre del proyecto.
- **Verificado:** 31/31 sintaxis, 15/15 workflow, importador IA 100%.

## 26. Resolución Quirúrgica Integral v3.0 (Octubre 2026)

- **Fase 1: Seguridad (P0/P1):**
  - **Saneamiento DOM XSS:** En `js/docs-generator.js`, función `escapeHtml()` aplicada a todos los campos del titular y promotor (`readTitular()`), neutralizando inyecciones en `generateMemoria()`, `generatePropuestaComercialPDF()`, `buildUnifilarSvg()`, etc.
  - **Protección de API Keys:** Eliminado el paso de credenciales por URL (`?key=`) en `js/financials.js`, `js/bill-auditor.js` y `js/equipment-ai-importer.js`; tráfico centralizado mediante cabecera segura `x-goog-api-key`.
  - **Persistencia Ofuscada:** Corregido `getApiKey()` y `setApiKey()` para soportar prefijo `enc:` y evitar guardado plano involuntario.
  - **Saneamiento de Salidas IA e Interfaz:** Limpieza de etiquetas en el resumen financiero de `js/financials.js` y reemplazo de `innerHTML` por `textContent` en `js/company-branding.js`.

- **Fase 2: Arquitectura y Sincronización de Estado (P1/P2):**
  - **Desacoplamiento de `panelConfig`:** Eliminado el split-brain por shadowing léxico en `index.html`; enlazado reactivamente al SSOT global `window.panelConfig`.
  - **Paleta Canónica de Strings:** Unificada la definición de `window.RA_STRING_PALETTE` a 12 colores distintivos en `js/config.js` y su fallback en `js/working-plane.js`.

- **Fase 3: Rendimiento y Optimización GPU (P1/P2):**
  - **Optimización de Raycasting 3D:** En `index.html` (`isPanelOccludedBy3DEnvironment`), asignación fija de vectores scratch (`_scratchNormScaled`, `_scratchRayOrigin`), descarte por producto escalar de la normal del panel (`dot <= 0.01`), y caché temporal de primitivas con TTL de 3s.
  - **Culling de Sombra en Simulación Anual:** En `js/solar-heatmap.js`, descarte directo de raycast cuando la irradiancia directa de haz es nula (`G_beam <= 0.1`).
  - **Throttling de Cursor CAD:** Hoisting de variables de dirty flag y función actualizadora fuera del callback de `MOUSE_MOVE`, eliminando la creación masiva de closures y garantizando bloqueo a 60 FPS con rAF.

- **Fase 4: Coherencia Electrotécnica y Lógica (P1/P2):**
  - **Coloración de Series Multi-Cubierta:** En `index.html`, corregida la fórmula de indexado de color de strings para evitar colisiones idénticas entre polilíneas adyacentes (`(polyIdx * 4 + sIdx)`).
  - **Unificación de Límites MPPT:** En `getProjectCalcs()`, delegación canónica en `RA.Electrical.calculateDynamicMPPTStringLimits()` y alineación de coeficientes térmicos ($\beta_{Voc} = -0.0027$, $T_{cell,max} = 70^\circ\text{C}$).

- **Fase 5: UI/UX y Accesibilidad (P2/P3):**
  - **Accesibilidad WCAG / ARIA:** Incorporación de atributos `aria-label` descriptivos en más de 15 botones con solo iconos (buscador, steppers de hardware, borrado y cancelación de cableado, cierres de modales y herramientas flotantes).
  - **Clarificación de Documentación en Paso 5:** Asignación de semántica y etiquetas diferenciadas al botón de descarga en el grid legal de legalización.
  - **Diseño Responsivo:** Reglas CSS en `css/styles.css` para viewports `< 1280px` (sidebar adaptativo a 350px, modales delimitados a 94-95vw/vh, reposicionamiento ergonómico de controles flotantes).

- **Fase 6: Verificación y QA:**
  - 31/31 módulos JS validados sin errores de sintaxis.
  - 15/15 pruebas automatizadas de física astronómica, ingeniería eléctrica y modelo financiero aprobadas al 100%.
  - Suite de importador de datasheets con IA verificada al 100%.

## 27. Implementación Plan Maestro v4.0 — Física Solar y Despacho Bancable (Octubre 2026)

- **Hito 1 — Dimensionamiento Proactivo y Snap de Strings:**
  - En `js/electrical-engine.js`, función `getNearestValidStringModuleCount(targetCount, nsMin, nsMax, maxStrings)` que calcula la combinación de módulos que respeta la ventana térmica de tensión MPPT $[N_{s,\min}, N_{s,\max}]$.
  - Enlazado en `js/solar-heatmap.js` (`filterPanelsByObjective`) para que al definir objetivos en Paso 2 / Paso 3 el layout se ajuste automáticamente a strings válidos sin dejar cadenas fuera de normativa.
- **Hito 2 — Modelo Anisotrópico de Radiación Perez (1990):**
  - Implementado en `js/radiation-engine.js` (`getPerezDiffuse`, `transposePerez`, `transposeComponents` con `diffuseModel: 'perez'`) con los 8 bins de claridad atmosférica $\varepsilon$, brillo cenital $\Delta$ y masa de aire óptica relativa (Kasten-Young 1989).
  - Activado en la simulación anual de `js/solar-heatmap.js` (192 instantes) para transposición de componentes directa, difusa circunsolar y de horizonte.
- **Hito 3 — Microfísica de Sub-módulos y Diodos de Bypass (IEC 61215):**
  - En `js/solar-heatmap.js`, función `dividePanelIntoSubstrings2D()` que divide el cuadrilátero del panel en 3 sub-cadenas independientes correspondientes a las ramas de diodos de bypass de paneles estándar y half-cut.
  - La oclusión de sombra evalúa cada tercio independientemente: si se sombrea 1 sub-cadena, el diodo entra en conducción y el panel mantiene el 66.7% de su radiación de haz; si se sombrean 2, mantiene el 33.3%; solo oclusiones completas pierden el 100% del haz, eliminando penalizaciones irreales por sombras puntuales.
- **Hito 4 — Inversor Dinámico, Curvas de Carga, Clipping y Homogeneidad MPPT:**
  - En `js/electrical-engine.js`, `calculateInverterEfficiencyAndClipping()` modela la curva de eficiencia a carga parcial (umbral cut-in al 5%, rendimiento europeo nominal y saturación térmica) y calcula el recorte físico de potencia (*clipping*) cuando $P_{\text{ac,teorica}} > P_{\text{ac,max}}$.
  - `validateMPPTHomogeneity()` comprueba strings en paralelo sobre el mismo MPPT: si difieren en inclinación ($|\Delta\beta| > 5^\circ$) o azimut ($|\Delta\gamma| > 10^\circ$), emite advertencia técnica crítica y marca `valid: false` según IEC 62548.
- **Hito 5 — Matriz de Despacho Horario Anual (288h) y Batería Física:**
  - En `js/financials.js`, sustitución del día medio estático por simulación horaria en los 12 meses del año (288 instantes) con estacionalidad de demanda peninsular y horas solares reales (salida/puesta de sol variables según latitud 40°N).
  - Modelo de batería con límite de potencia C-rate ($P_{\max} = C/2$), eficiencia de ciclo completo (92%) y profundidad de descarga ($DOD = 90\%$).
  - Ahorro de factura anual Año 1 calculado rigurosamente como $\Delta\text{Factura} = \text{CosteSinFV} - \text{CosteConFV}$.
- **Verificación y QA:**
  - 31/31 módulos JS validados sin errores de sintaxis (`node tests/test-js-syntax.js`).
  - 22/22 pruebas unitarias y de integración end-to-end superadas con 100% de éxito (`tests/test-ra-full-workflow.js`), incluyendo validación física de Perez 1990 ($G_{\text{poa}} = 964.7\,\text{W/m}^2$), snap de strings, homogeneidad MPPT, clipping ($P_{\text{clip}} = 1642\,\text{W}$) y balance horario de autarquía.
  - Test suite de importador de datasheets con IA al 100%.









