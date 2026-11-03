# Plan de Acción — Auditoría de Arquitectura e Ingeniería AAA (RA)

**Fecha:** 03/11/2026  
**Rol:** Dirección de Arquitectura CAD de Ingenierías Renovables, Física Aplicada e Ingeniería Industrial (Fotovoltaica y Eólica)  
**Objetivo:** Erradicar desviaciones físicas, eléctricas, normativas, financieras y de arquitectura 3D/CAD detectadas en la auditoría integral, garantizando una única fuente de verdad (SSOT) y rendimiento de producción AAA.

---

## Catálogo de Desviaciones Detectadas (27 Hallazgos)

### Bloque A — Física Solar, Radiación, Sombras y Óptica
1. **[CRÍTICA] Divergencia física masiva entre `solar-worker.js` y el hilo principal (`solar-heatmap.js` / `radiation-engine.js`)**:
   - **Coordenadas incompatibles ENU vs ECEF**: `runHeatmapInDedicatedWorker` envía `normalWorld` en coordenadas geocéntricas ECEF (ignorando además `getPanelNormalWorld` para estructuras inclinadas), pero el Worker calcula el producto escalar con `sp.sunVecENU` (Este-Norte-Arriba), corrompiendo el ángulo de incidencia $\cos\theta$.
   - **Omisión de sombras inter-fila y entorno 3D en el Worker**: El Worker no ejecuta `generateInterRowShadowQuads2D` ni `isPanelOccludedBy3DEnvironment`.
   - **Multiplicación falsa por `heatmapStride`**: En plantas de $>400$ paneles, el Worker procesa todos los paneles (`stride = 1`), pero al recibir el resultado el hilo principal multiplica `radAnual` y `radMensual` por `heatmapStride` (2x, 3x o 4x) y sobrescribe paneles con `heatmapSample === false`.
   - **GHI sintético fijo y modelo Hay-Davies/IAM divergente en el Worker**: Ignora la caché NASA POWER, calcula $A_i = G_{DNI}\sin\alpha / G_{HI}$ en vez de $G_{DNI}/I_0$, omite IAM ASHRAE y difiere en ganancia bifacial y penalización eléctrica de diodos bypass.
2. **[CRÍTICA] Bug de unidades en curva horaria diaria (`solar-engine.js`)**:
   - En `showDailyCurve`, la irradiancia `GHI` ($\text{W/m}^2$) se multiplica por la potencia de la planta `kwp`, saturando el recorte en $1.5 \times \text{kWp}$ durante todo el día.
3. **[ALTA] Convención de azimut contradictoria Sur=0° vs Sur=180° (`solar-engine.js`)**:
   - `runPhysicalModel` resta `180°` a `azimutDeg`, mientras `runEnergyComparison` y `runPVGISCalc` usan `0° = Sur`. Con `azimutDeg = 0` (Sur), el motor físico propio simula los paneles orientados al Norte (`-180°`).
4. **[ALTA] Ambigüedad UTC vs Tiempo Solar en `computeHighPrecisionSolarPosition` (`solar-engine.js`)**:
   - El parámetro `solarDecimalHour` recibe internamente la corrección `(4 * lonDeg + Et) / 60` como si fuera hora UTC, duplicando el desfase longitudinal cuando se le pasa hora solar o corrompiendo el mediodía solar.
5. **[ALTA] Firma de caché incompleta en SSOT (`production-source.js`)**:
   - `signature(o)` omite `pAcNominalW` (clipping del inversor), `tecnologia` (coeficiente térmico), `monthlyGHI` y `solarLossConfig`.
6. **[MEDIA] Bugs secundarios en mapas de radiación y optimizador (`solar-heatmap.js`, `solar-optimizer.js`)**:
   - Variable `d` no definida en `solar-heatmap.js` al construir `shadowRects`, descuento del factor de sombra directa sobre toda la irradiancia (incluyendo difusa y albedo), y recurso solar fijo en `solar-optimizer.js`.

---

### Bloque B — Física Eólica, Aerodinámica, CFD y Despacho Híbrido
7. **[CRÍTICA] Violación del Límite de Betz ($C_p > 0.593$) en las 6 turbinas de `wind-catalog.js` + pérdida de `cpAudit` (`wind-entity.js`)**:
   - Las 6 turbinas de `DEFAULT_TURBINES` declaran potencias entre $6\text{ y }8\text{ m/s}$ que superan la energía cinética total del viento para sus áreas de barrido ($C_p$ de $0.65$ a $2.17$). Además, `wind-entity.js` no copia `cpAudit` al instanciar o deserializar.
8. **[CRÍTICA] Bloqueo síncrono del hilo principal en `renderStep2Panel` (`wind-ui.js`)**:
   - Ejecuta síncronamente en cada refresco de UI: `recalculateAllEngineering`, 5 barridos de `computeTurbineAEP`, `simulateHybridDispatch8760` (8.760 h) y `evaluateAnnualShadowFlicker` (41.610 pasos trigonométricos por turbina).
9. **[ALTA] `wind-worker.js` incompleto y deformación métrica longitudinal**:
   - No importa `wind-obstacle-interference.js`, `wind-shadow-flicker.js` ni `wind-hybrid-dispatch.js`, y convierte metros a grados de longitud sin dividir por $\cos(\text{lat})$.
10. **[ALTA] Edificios 3D ignorados en estela turbulenta eólica (`wind-obstacle-interference.js`)**:
    - Lee `b.polygonPoints[0]` en lugar de `b.points`, por lo que los edificios nunca generan oclusión ni turbulencia sobre aerogeneradores.
11. **[ALTA] CFD de cubierta estático (`wind-rooftop-cfd.js`)**:
    - Usa siempre `blds[0]` y un retranqueo fijo `xSetback = 3.5` m sin calcular la distancia real de la turbina al borde de barlovento del edificio sobre el que apoya.
12. **[ALTA] Aerogeneradores (`window.windTurbines`) no proyectan sombra sobre paneles solares (`polygon-shadow-math.js`)**:
    - `getObstacleShadowPolygons2DForRoof` solo inspecciona `window.obstacles`, ignorando las entidades de `window.windTurbines`.
13. **[MEDIA] Doble contabilización de CAPEX de batería en `wind-hybrid-dispatch.js` y constante de resistividad Cu duplicada en `wind-electrical.js`**.

---

### Bloque C — Ingeniería Eléctrica, Cableado y Normativa REBT
14. **[CRÍTICA] Nombres de propiedades erróneos en límites MPPT y explosión por coeficientes térmicos en `%` (`cable-engine.js`)**:
    - `cable-engine.js` lee `dynLim.vmpHot` y `dynLim.vocCold` (inexistentes; `electrical-engine.js` devuelve `Vmp_Tmax` y `Voc_Tmin`), activando un fallback que multiplica `modCfg.tempCoeffPmax` (`-0.35` en `%`) sin dividir entre 100, generando tensiones negativas (`-14.75x`) o diez veces mayores (`10.45x`) en la Tabla 5.2 de la Memoria Técnica.
15. **[CRÍTICA] Divergencia tripartita entre `electrical-engine.js`, `cable-engine.js` y `docs-generator.js`**:
    - Distinta tensión de referencia DC para caída de tensión (`Vmp_str_hot` vs `Vmp_STC`), distinta longitud DC (`homerunLength` vs `maxLdc`), distintos factores de diseño bifacial (`1.4375x` vs `1.6848x`), y `computeSizingEngineering` ignora `invCount` en sistemas multi-inversor (dimensionando línea AC, IGA y esquema unifilar para 1 solo inversor).
16. **[CRÍTICA] Cinco errores normativos en Memoria Técnica (`docs-generator.js` / `project-calcs.js`)**:
    - `d.Voc_cold` almacena la tensión de todo el string (`Voc_str_max`) pero se imprime como tensión de 1 módulo individual y se multiplica de nuevo por `modsActual` en las fórmulas.
    - `d.useFuses` nunca se define en `project-calcs.js` (solo `fuse_std`), por lo que el texto afirma siempre "Sin fusibles" mientras el unifilar dibuja siempre fusibles.
    - La Tabla 5.2 de verificación normativa estampa siempre `✓ Conforme` fijo.
    - El diferencial AC se imprime fijo como `30 mA Clase A` contradiciendo el cálculo del motor (Clase B o 300 mA industrial).
    - La sobrecarga estructural lee `t.structuralLoads.maxWeightPerSqmKg` (inexistente) en vez de `t.summary.maxLoadKgM2`, mostrando siempre `12.5 kg/m²`.
17. **[ALTA] Metrado de cableado DC/AC inflado o duplicado (`bom-tree.js`, `docs-generator.js`)**:
    - Se asigna a todos los strings la longitud del string más lejano más una partida extra de puentes MC4, y en AC se multiplica por 3 o 5 hilos una manguera multipolar.

---

### Bloque D — Motor Financiero, SSOT Económico y Documentación
18. **[CRÍTICA] Producción minieólica incluida en CAPEX/OPEX pero omitida de ahorro, VAN, TIR, Payback y LCOE (`financials.js`)**:
    - `calculateFinancialModel` suma el coste de los aerogeneradores al CAPEX y su mantenimiento al OPEX, pero no suma `windParkSummary.totalAepNetKwh` a la producción anual ni al balance de autoconsumo/excedentes, penalizando artificialmente todos los proyectos híbridos.
19. **[CRÍTICA] Cuatro motores distintos de Payback y Amortización a 25 años (`financials.js`, `project-calcs.js`, `docs-generator.js`, `commercial-proposal-dossier.js`)**:
    - `getProjectCalcs` calcula su propio retorno (70/30 fijo sin OPEX); `buildAmortizationSvg` en `docs-generator.js` no recibe `schedule25` y recalcula sin OPEX ni sustitución de inversor; y `Charts.amortization25` en `commercial-proposal-dossier.js` dibuja una rampa lineal falsa `y / 25` idéntica para cualquier instalación.
20. **[ALTA] Bug aritmético en porcentajes por capítulo del Presupuesto (`docs-generator.js`)**:
    - Divide el importe de cada capítulo entre el subtotal parcial acumulado hasta esa iteración dentro del mismo bucle `forEach`, haciendo que el Capítulo 1 muestre siempre `100.0%` y la suma supere el `250%`.
21. **[ALTA] Desconexión de estado fiscal/financiación entre `RAPricing`, `calculateFinancialModel` y `commercial-proposal-dossier.js`**:
    - `calculateFinancialModel` lee IRPF/IBI/Financiación exclusivamente del DOM (dando `0 €` si no se abrió el modal financiero); el Dossier Horizontal recalcula su propia cuota a 8 años / 5.5% TIN e intenta leer propiedades inexistentes de `bill-auditor.js` (`currentBill.tarifa`, `potenciasContratadas[0]`, `consumoAnualKwh`).
22. **[ALTA] Corrupción Quoted-Printable en exportación Word (`docx-exporter.js`)**:
    - Declara `Content-Transfer-Encoding: quoted-printable` sin escapar los signos `=` a `=3D` en atributos HTML/CSS/SVG.
23. **[MEDIA] Bucle de escalado hasta el mínimo (`0.85`) en el Guardián Anti-Desborde A4 (`proposal-style-studio.js`)**:
    - La Etapa 4 aplica `transform: scale()` pero comprueba `sheet.scrollHeight` (que no varía con transformaciones CSS), ejecutando siempre las 10 iteraciones hasta `0.85`.

---

### Bloque E — Arquitectura CAD 3D, Cesium, Estado y Persistencia
24. **[CRÍTICA] Fuga masiva de memoria en `window.labels2DRegistry` (`working-plane.js`)**:
    - `wpClearEntGroup` elimina las entidades de Cesium pero nunca limpia `window.labels2DRegistry`, acumulando miles de etiquetas huérfanas en cada `mousemove` y degradando `renderTriad2D` con detección de colisiones $O(N^2)$.
25. **[CRÍTICA] `RAundo.beginDrag()` incompleto para equipos eléctricos, planos de trabajo, aerogeneradores y vértices (`undo-manager.js`)**:
    - No reconoce `'electrical'`, `'workplane'`, `'wind_turbine_entity'` ni distingue `'building_vertex'`, cayendo en categorías erróneas y perdiendo los cambios al hacer `Ctrl+Z`.
26. **[ALTA] Reconstrucción WebGL síncrona en cada `mousemove` (`universal-gizmo-3d.js`, `working-plane.js`) y borrado de edificios sin cascada (`buildings.js`)**:
    - Trasladar un edificio con el Gizmo reconstruye todos los edificios en cada frame; `wpUpdateUI()` reconstruye todos los obstáculos 3D; y borrar un edificio con `Supr` (`deleteBuilding`) deja planos, paneles y obstáculos flotando en el aire.
27. **[ALTA] Condición de carrera en `undo()`/`redo()` y persistencia incompleta en `project-storage.js`**:
    - `restoreSnapshot('project')` invoca `raImportProjectData` sin `await`; y al exportar/importar se pierden `buildingId`/`isRoof` en planos, configuraciones quirúrgicas de faldones (`assignedTopology`, `optimizerCoverage`, `panelsDisabled`), `lastVirtualInverter`, `solarLossConfig` y la limpieza previa de `window.inverterEquipmentState`.

---

## Plan de Ejecución en 5 Fases

### Fase 1 — Unificación Financiera, Presupuestaria y Documental (SSOT Económico)
- [ ] **1.1. Integración de producción minieólica en `calculateFinancialModel` (`js/financials.js`)**: Sumar `windParkSummary.totalAepNetKwh` (con su perfil horario complementario/nocturno) al balance energético, ahorro anual, VAN, TIR, Payback, LCOE y tabla de 25 años (`schedule25`).
- [ ] **1.2. Unificación de los 4 motores de Payback y Amortización (`js/project-calcs.js`, `js/docs-generator.js`, `js/commercial-proposal-dossier.js`)**: Conectar `getProjectCalcs`, `buildAmortizationSvg` y `Charts.amortization25` directamente a `finModel.schedule25` y métricas SSOT de `calculateFinancialModel`.
- [ ] **1.3. Sincronización de estado fiscal/financiación y lector de facturas (`js/financials.js`, `js/commercial-proposal-dossier.js`)**: Hacer que `calculateFinancialModel` tenga fallback al estado persistido de proyecto cuando los inputs del DOM no existan/no se hayan abierto, y alinear el Dossier Horizontal con la estructura real de `bill-auditor.js` y la financiación de `calculateFinancialModel`.
- [ ] **1.4. Corrección de porcentajes por capítulo del Presupuesto (`js/docs-generator.js`)**: Calcular primero `totalPEM` antes del bucle de renderizado de capítulos para que cada porcentaje divida entre el PEM total real y sumen `100.0%`.
- [ ] **1.5. Corrección de metrado de cableado en BOM y Presupuesto (`js/bom-tree.js`, `js/docs-generator.js`)**: Usar la suma real de longitudes de cada string (`totalLdc`) sin duplicar puentes MC4 y medir metros de manguera multipolar AC sin multiplicar por el número de conductores internos.
- [ ] **1.6. Corrección de exportación Word y Guardián A4 (`js/docx-exporter.js`, `js/proposal-style-studio.js`)**: Codificar correctamente en Base64 o escapar Quoted-Printable en `docx-exporter.js`, y corregir la medición de altura efectiva al aplicar escala en `proposal-style-studio.js`.

### Fase 2 — Coherencia Eléctrica y Blindaje de Memoria Técnica REBT
- [ ] **2.1. Corrección de propiedades térmicas MPPT y coeficientes en `%` (`js/cable-engine.js`)**: Leer `Vmp_Tmax` y `Voc_Tmin` de `dynLim` y dividir coeficientes térmicos porcentuales entre 100 en los fallbacks.
- [ ] **2.2. Unificación tripartita DC/AC y soporte multi-inversor (`js/electrical-engine.js`, `js/cable-engine.js`, `js/docs-generator.js`)**: Unificar tensión de diseño DC, longitud por tramo, factor bifacial ITC-BT-40, y multiplicar corriente/potencia AC por `invCount` en `computeSizingEngineering`.
- [ ] **2.3. Blindaje de los 5 puntos normativos de la Memoria Técnica (`js/project-calcs.js`, `js/docs-generator.js`)**: Separar `Voc_mod_cold` de `Voc_str_cold`, propagar `useFuses` real, evaluar conformidad real en Tabla 5.2, inyectar diferencial calculado (`rcdType`/`rcdSensMa`) y leer `t.summary.maxLoadKgM2`.

### Fase 3 — Sincronización Física Solar y Caché Energética
- [ ] **3.1. Sincronización física entre `solar-worker.js` y `solar-heatmap.js`**: Pasar normales en base local ENU (incluyendo inclinación `getPanelNormalWorld`), incluir sombras inter-fila y obstáculos 3D, usar `monthlyGHI` real, corregir índice de anisotropía Hay-Davies ($G_{DNI}/I_0$) e IAM ASHRAE, y eliminar la multiplicación espuria por `heatmapStride`.
- [ ] **3.2. Corrección de `showDailyCurve`, convención de azimut Sur=0° y tiempo solar (`js/solar-engine.js`)**: Eliminar el factor `kwp` de `GHI` en `showDailyCurve`, unificar `0° = Sur` en `runPhysicalModel`, y clarificar hora solar vs UTC en `computeHighPrecisionSolarPosition`.
- [ ] **3.3. Firma completa en caché de producción y corrección de sombras en mapa de calor (`js/production-source.js`, `js/solar-heatmap.js`, `js/solar-optimizer.js`)**: Añadir `pAcNominalW`, `tecnologia`, `monthlyGHI` y `solarLossConfig` a `signature(o)`, definir `d` en `shadowRects` y aplicar el factor de sombra directa únicamente a la componente directa.

### Fase 4 — Realismo Físico Eólico, CFD y Desbloqueo de Interfaz
- [ ] **4.1. Recalibración Betz del catálogo eólico y propagación de `cpAudit` (`js/wind-catalog.js`, `js/wind-entity.js`)**: Ajustar las curvas de las 6 turbinas por debajo de $C_p \le 0.45$ (físicamente realista para minieólica) y preservar `cpAudit` en `WindTurbineEntity`.
- [ ] **4.2. Conexión de edificios 3D a turbulencia, CFD de cubierta y sombras solares (`js/wind-obstacle-interference.js`, `js/wind-rooftop-cfd.js`, `js/polygon-shadow-math.js`)**: Leer `b.points` en interferencia de obstáculos, identificar el edificio soporte real y distancia a barlovento en CFD de cubierta, e incluir `window.windTurbines` en sombras sobre paneles solares.
- [ ] **4.3. Desbloqueo de `renderStep2Panel` y corrección métrica en `wind-worker.js` (`js/wind-ui.js`, `js/wind-worker.js`, `js/wind-hybrid-dispatch.js`)**: Cachear y diferir cálculos pesados (AEP multi-escenario, despacho 8760h y shadow flicker), corregir $\cos(\text{lat})$ en longitud y eliminar doble contabilización de CAPEX de batería.

### Fase 5 — Higiene CAD 3D, Historial Undo/Redo y Persistencia Total
- [ ] **5.1. Limpieza de `window.labels2DRegistry` y optimización de arrastre 3D (`js/working-plane.js`, `js/universal-gizmo-3d.js`)**: Purgar etiquetas asociadas al borrar entidades en `wpClearEntGroup` y diferir `rebuildAllBuildings` / `rebuildAllObstacles` al finalizar el arrastre (`mouseup`).
- [ ] **5.2. Cobertura total y bloqueo asíncrono en `undo-manager.js` (`js/undo-manager.js`)**: Soportar `'electrical'`, `'workplane'`, `'wind_turbine_entity'` y `'building_vertex'` en `beginDrag`, y añadir `await` + guardia `_isRestoring` en `restoreSnapshot`.
- [ ] **5.3. Borrado en cascada de edificios y persistencia íntegra (`js/buildings.js`, `js/project-storage.js`)**: Unificar `deleteBuilding` con limpieza en cascada de planos/paneles/obstáculos asociados, y serializar/restaurar `buildingId`, `isRoof`, configuración quirúrgica de faldones, `lastVirtualInverter` y `solarLossConfig`.
