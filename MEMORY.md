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
| `bill-auditor.js` | Auditoría de facturas | `window.RA.billAuditor` |
| `buildings.js` | Edificios 3D y extrusión | `window.WP.buildings` |
| `obstacles.js` | Obstáculos 3D | `window.WP.obstacles` |
| `capture-mode.js` | Modo captura limpia (tecla C) | `window.RACapture` |
| `undo-manager.js` | Deshacer borrados | `window.RAundo` |
| `bom-tree.js` | Árbol de materiales (BOM) | `BOMTreeEngine` |
| `project-hierarchy.js` | Scene graph jerárquico | — |
| `ui-outliner.js` | Outliner de objetos | — |
| `wind-turbine.js` | Generadores eólicos 3D (HAWT/VAWT) paramétricos | `window.RAWindTurbine` |

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
- **Problema 2 (Obstáculos Paramétricos):** Añadir aerogeneradores requería parámetros dinámicos (radio, altura, HAWT/VAWT) distintos al cubo/árbol, pero con mismo comportamiento UI de inserción.
- **Solución 2:** Patrón de Módulo Aislado (`wind-turbine.js`). En lugar de alterar la lógica central en `obstacles.js`, se aplican function wrappers sobre métodos clave de render/arrastre (`render3DObstaclesInCesium`, `updateObstacleLiveModelMatrix`) interceptando el tipo `wind_turbine` y calculando su propia geometría Cesium, e inyectando un bloque UI propio dinámicamente en `#obstacle-selected-editor`.


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





