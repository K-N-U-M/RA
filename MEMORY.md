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
| `undo-manager.js` | Deshacer borrados | `window.RAundo` |
| `bom-tree.js` | Árbol de materiales (BOM) | `BOMTreeEngine` |
| `project-hierarchy.js` | Scene graph jerárquico | — |
| `ui-outliner.js` | Outliner de objetos | — |
| `wind-turbine.js` | Generadores eólicos 3D (HAWT/VAWT) paramétricos | `window.RAWindTurbine` |
| `measure-tool.js` | Cinta métrica 3D con desglose físico y snap magnético | `window.RAMeasureTool` |
| `ui-viewport-controls.js` | Alertas toast, carga y controles de visualización 3D | `window.UIViewportControls` |
| `company-branding.js` | Identidad corporativa, logo y Gemini API | `window.RACompanyBranding` |

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
  - Ubicación: `js/measure-tool.js`. Singleton `window.RAMeasureTool` / `window.RA.measureTool`, función global `toggleMeasureTool()`.
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
  - Exportaciones: `global.UIViewportControls`, `global.RA.UI`, `global.RA.viewportControls`.
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
- **Módulo Autónomo (`RACompanyBranding` / `RA.branding` / `RA.companyBranding`):**
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


