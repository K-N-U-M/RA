# FASE 2 — Corrección de Ingeniería Fotovoltaica, Normativa Eléctrica y Despacho Eólico/Híbrido

> **Objetivo de la fase:** Unificar los motores físicos solares y de despacho eléctrico/híbrido divergentes, eliminar desviaciones normativas (`REBT ITC-BT-40/18/04`, `RD 1699/2011`, `IEC 62548`) y asegurar coherencia matemática 1:1 entre motor eléctrico, trazado 3D, BOM, unifilares SVG/DXF y memoria técnica.
> **Prerrequisitos recomendados:** Completar antes las correcciones críticas **P0** eléctricas (`F0-05`, `F0-06`, `F0-07`) incluidas en [01-FASE-0-estabilizacion-bugs-criticos.md](./01-FASE-0-estabilizacion-bugs-criticos.md).
> **Protocolo para IAs:** Ver reglas en [00-INDICE.md](./00-INDICE.md) y registrar cada entrega en [99-REGISTRO-AVANCES.md](./99-REGISTRO-AVANCES.md).

---

## Tabla de Tareas — Fase 2

| ID | Título | Severidad | Esfuerzo | Dependencias | Origen | Estado |
| :--- | :--- | :---: | :---: | :--- | :--- | :--- |
| **F2-01** | Unificar realimentación de pérdidas óhmicas y suprimir doble descuento de bypass en PR/BOS | P1 | M | F0-05, F0-06 | B-06 | `[Hecho]` |
| **F2-02** | Converger los 4 motores de producción solar en un único motor SSOT Perez + Faiman/TMY | P1 | L | F2-01 | B-07 | `[Hecho]` |
| **F2-03** | Corregir fuga de paneles fantasma/eliminados al Solar Worker, etiquetas de resolución y ciclo térmico | P1 | M | F2-02 | B-08 | `[Hecho]` |
| **F2-04** | Unificar despacho híbrido `8760h` (FV POA + Eólica ERA5 + BESS) y eliminar doble conteo en arbitraje | P1 | L | F2-02 | B-09 | `[Hecho]` |
| **F2-05** | Subsanar incumplimientos REBT/RD1699: tierra ITC-BT-18, umbral AC Proyecto/MTD, límite 1F y `cosφ` | P1 | S | Ninguna | B-10 | `[Hecho]` |
| **F2-06** | Unificar renderizadores unifilares (UI Paso 4, SVG EPLAN y DXF) soportando microinversores, >3 strings y BESS | P1 | L | F0-05, F0-07 | B-11 | `[Hecho]` |
| **F2-07** | Corregir desajustes de catálogo (`isc < imp`), ratio microinversores 1:1/4:1, resumen por faldón y `balasto` BOM | P1 | M | Ninguna | B-12 | `[Hecho]` |
| **F2-08** | Integrar protecciones DC (`1000V/1500V`) con ganancia bifacial en BOM y cálculos eléctricos | P2 | S | F0-06, F0-07 | B-13 | `[Hecho]` |
| **F2-09** | Alinear módulo eléctrico eólico con constantes REBT, término reactivo `X` y `Voc_overspeed` | P2 | S | Ninguna | B-14 | `[Hecho]` |
| **F2-10** | Corregir geometría exacta de paso entre filas (PVsyst vector) y proyección rayo-plano en obstáculos | P2 | M | Ninguna | B-15 | `[Hecho]` |
| **F2-11** | Corregir Monte Carlo P50/P90, flags de auto-ingeniería por ID fijo, multi-turbina flicker y latitud hardcodeada | P2 | M | F2-02 | B-16 + B-17 | `[Hecho]` |
| **F2-12** | Ampliar perfil de horizonte `< 6°` y acoplar diodos de bypass por string en sombreado parcial | P3 | L | F2-02, F2-03 | B-18 | `[Hecho]` |

---

## Detalle Técnico por Tarea

### `F2-01` — Unificar realimentación de pérdidas óhmicas y suprimir doble descuento de bypass en PR/BOS

| Campo | Valor |
| :--- | :--- |
| **Categoría** | Bug / Física Solar |
| **Severidad** | P1 (Alto) |
| **Esfuerzo** | M (2–8 horas) |
| **Dependencias** | F0-05, F0-06 (unidades `%/°C` y longitud DC loop) |
| **Origen** | B-06 |
| **Rama sugerida** | `fix/solar-pr-wiring-bypass-double-count` |
| **Estado** | `[Pendiente]` |

#### Contexto y Problema
1. `config.js:105` inicializa `window.solarLossConfig.wiring = 0.015`. En `cable-engine.js:2952`, la condición `if (!global.solarLossConfig.userCustomizedWiring && typeof global.solarLossConfig.wiring === 'undefined')` resulta siempre `false`, impidiendo que el cálculo real de pérdidas en cable alimente `solarLossConfig.wiring` y el PR.
2. Tanto `solar-worker.js` como el fallback de `solar-heatmap.js` descuentan paso a paso pérdidas de sub-cadena por sombreado parcial (`mismatchBonus` `10%–14%` sin MLPE), pero al cerrar la simulación aplican además `prBOS`, que vuelve a descontar un `2.5%` fijo de bypass aunque las placas ya hayan descontado sombras (o tengan `0%` sombra) y fija la eficiencia del inversor en `2.5%` estático sin usar su curva ni el recorte por clipping AC.

#### Evidencia Verificada
- `js/config.js:105, 122-158` (`solarLossConfig` y `raCalculateSystemPR`)
- `js/cable-engine.js:2950-2954`
- `js/solar-heatmap.js:2031-2055, 2106-2140`
- `js/solar-worker.js:699-759`

#### Pasos de Implementación
1. Introducir propiedad `wiringSource: 'default' | 'engine' | 'user'` en `solarLossConfig` y actualizar `solarLossConfig.wiring = wiringCalculated` siempre que `wiringSource !== 'user'` (poniendo `wiringSource = 'user'` solo si el usuario edita manualmente el campo en ajustes de pérdidas).
2. Desdoblar `raCalculateSystemPR` en pérdidas **independientes de sombreado** (`soiling`, `wiring`, `availability`, `spectral`, `mismatchStc`) frente a pérdidas simuladas por hora (`bypass` por sombra y `iam`). Cuando el cálculo provenga del motor térmico horario con sub-strings, establecer el bypass adicional de `prBOS` a `0` para eliminar el doble descuento; si `annualShadedLoss === 0`, bypass debe ser exactamente `0%`.
3. Sustituir la pérdida fija del inversor (`2.5%`) por la curva `calculateInverterEfficiencyAndClipping` del inversor elegido (`pAcNominalW` / `pAcMaxW` y curva de eficiencia europea/máxima).

#### Criterios de Aceptación
- Modificar longitudes DC/AC de `10 m` a `80 m` en 3D actualiza automáticamente `solarLossConfig.wiring` y reduce el `PR` en HUD y PDF proporcionalmente.
- Con `0%` sombreado anual y sin optimizadores, el descuento de bypass adicional aplicado por `prBOS` es `0.0%`.

---

### `F2-02` — Converger los 4 motores de producción solar en un único motor SSOT Perez + Faiman/TMY

| Campo | Valor |
| :--- | :--- |
| **Categoría** | Física Solar |
| **Severidad** | P1 (Alto) |
| **Esfuerzo** | L (1–3 días) |
| **Dependencias** | F2-01 |
| **Origen** | B-07 |
| **Rama sugerida** | `refactor/solar-single-physics-engine` |
| **Estado** | `[Pendiente]` |

#### Contexto y Problema
Coexisten **4 modelos incompatibles** que producen cifras de producción distintas según qué pantalla se mire:
1. `solar-worker.js`: Perez (168/192 instantes).
2. `solar-engine.js:651-740` (`runPhysicalModel`): 12 días tipo con curva sinusoidal perfecta (destruye estadística horaria de nubes y subestima clipping AC), modelo Hay-Davies y NOCT fijo sin usar `computeCellTemperature(u0, u1, wind)` ya definida en `L429-439`.
3. `solar-yield-controller.js:210-252`: evalúa ganancia POA con **un solo instante diario al mediodía** usando modelo isótropo Liu & Jordan sin Erbs ni IAM.
4. `solar-optimizer.js:351-410` (`benchmarkFaldon`): aplica cuadrática empírica sobre `GHI * 0.80` y `0.915` fijo a Este-Oeste sin transposición real.
5. `project-calcs.js:98-118`: fallback estático `SOLAR_RAD` evaluado a `50°` fijos. Además `radiation-engine.js:232` (`getPerezDiffuse`) omite el factor de excentricidad orbital `e0` en `I0` al calcular brillo cenital `delta`.

#### Evidencia Verificada
- `js/radiation-engine.js:232, 336-357`
- `js/solar-engine.js:429-439, 549-562, 651-740`
- `js/solar-yield-controller.js:210-252`
- `js/solar-optimizer.js:351-410`
- `js/project-calcs.js:98-118`

#### Pasos de Implementación
1. Corregir `getPerezDiffuse` en `js/radiation-engine.js:232` multiplicando `I0` extraterrestre por `e0` (corrección excentricidad orbital por día del año) y asegurando clamp seguro de masa de aire `am`.
2. Convertir `js/radiation-engine.js` en el motor solar único SSOT con simulación horaria `8760h` (consumiendo serie horaria real TMY PVGIS/NASA POWER cuando exista o desagregación horaria realista con perfil de nubosidad `kt`, nunca senoides lisas de 12 días).
3. Conectar `computeCellTemperature` (modelo térmico Faiman diferenciando `coplanar` aislado `Uc` menor vs `open-rack` ventilado) con velocidad de viento ERA5/TMY dentro del cálculo principal de `solar-engine.js` y `radiation-engine.js`.
4. Sustituir las fórmulas simplificadas en `solar-yield-controller.js:214-243`, `solar-optimizer.js:351-410` y el fallback `project-calcs.js:98-118` por llamadas al servicio único SSOT (cacheado por clave `(lat, lng, tilt, azimuth, mountingType)`).

#### Criterios de Aceptación
- Para un faldón Sur `30°` en Madrid sin obstáculos, la producción específica bruta (`kWh/kWp`) reportada por `solar-yield-controller`, `solar-optimizer`, `runPhysicalModel` y `solar-heatmap` converge dentro de `±1.5%`.
- Con ratio DC/AC = `1.45` en modo TMY horario vs TMY PVGIS oficial, la estimación de clipping AC difiere en **< 10%**.

---

### `F2-03` — Corregir fuga de paneles fantasma/eliminados al Solar Worker, etiquetas de resolución y ciclo térmico

| Campo | Valor |
| :--- | :--- |
| **Categoría** | Bug / Física Solar / Rendimiento Cálculo |
| **Severidad** | P1 (Alto) |
| **Esfuerzo** | M (2–8 horas) |
| **Dependencias** | F2-02 |
| **Origen** | B-08 |
| **Rama sugerida** | `fix/solar-worker-ghost-panels-thermal` |
| **Estado** | `[Pendiente]` |

#### Contexto y Problema
1. `runHeatmapInDedicatedWorker` envía todos los paneles de `pList` incluidos `deleted`, `disabled` e `isGhost` (ej. modo "Ahorro Justo"), acumulando energía de módulos fantasma en `solarSimState.monthlyKwh`, mientras el fallback sí los filtra.
2. `shadow-settings.js` etiqueta como `"48h"` / `"72h"` modos que ejecutan `16` (`4 días × [9,12,15,17]`) y `168` instantes; el modo `fast` integra paso irregular como si fuera `2.67 h` uniforme y pondera Enero `90` días repartiendo luego con curva sintética en lugar de `getRobustMonthlyGHI`.
3. En fallback `>400` paneles, se aplica una única `pKwp` global ignorando cubiertas mixtas y se clona sombra al vecino más cercano; ambos caminos fijan `tAmbMonth` constante sin ciclo diurno, ignoran `raShadowSimConfig` en el worker, aplican albedo fijo `0.20` sin sombra propia del suelo bajo filas bifaciales, omiten sol `< 5°` y envían `occlusion3D: null`.

#### Evidencia Verificada
- `js/solar-heatmap.js:940-957, 1232-1318, 1514-1569, 1853-1855, 2174-2230`
- `js/solar-worker.js:247-265, 458, 617, 744, 768`
- `js/shadow-settings.js:438-452`

#### Pasos de Implementación
1. Filtrar `!p || p.deleted || p.disabled || p.isGhost` en `solar-heatmap.js:1232` antes de postear el mensaje al Web Worker, y acumular `_monthlyNetWh` por la potencia individual `p.wp` de cada módulo (`solar-worker.js:768`).
2. Corregir las etiquetas en `shadow-settings.js:438-452` para reflejar el muestreo real (y reemplazar el modo `fast` irregular de 4 horas por mínimo `12 meses × paso horario uniforme` con ponderación exacta de días de cada mes vía `getRobustMonthlyGHI`).
3. Pasar `raShadowSimConfig` y `albedo` configurado al worker; aplicar perfil térmico diurno `T_amb(h)` alrededor de `tAmbMonth` (con amplitud térmica diaria estándar o dato ERA5/PVGIS) y factor de vista/sombra propia de suelo en ganancia trasera bifacial.
4. En fallback `>400` paneles, emplear muestreo espacial estratificado por faldón/fila usando la `wp` real de cada módulo e interpolando solo irradiancia difusa/clara, sin propagar sombras binarias duras entre vecinos.

#### Criterios de Aceptación
- Con 20 módulos activos + 10 `isGhost` / `deleted`, `sum(solarSimState.monthlyKwh)` iguala la suma de `p.annualKwh` de los 20 activos (`±1%`) tanto en Worker como en fallback.

---

### `F2-04` — Unificar despacho híbrido `8760h` (FV POA + Eólica ERA5 + BESS) y eliminar doble conteo en arbitraje

| Campo | Valor |
| :--- | :--- |
| **Categoría** | Física Solar/Eólica / Bug |
| **Severidad** | P1 (Alto) |
| **Esfuerzo** | L (1–3 días) |
| **Dependencias** | F2-02 |
| **Origen** | B-09 |
| **Rama sugerida** | `fix/hybrid-dispatch-unified-8760h` |
| **Estado** | `[Pendiente]` |

#### Contexto y Problema
- `wind-hybrid-dispatch.js` genera vectores horarios sintéticos (campana centrada a las `13:00h` en solar y senoides deterministas en eólica) ignorando las orientaciones POA reales de los faldones y las series horarias ERA5 ya descargadas por `wind-resource.js:648`; aplica por defecto `fast_288`, deja `wkBlend` como variable muerta, reinicia días de la semana cada mes en `8760h`, modela eficiencia de batería asimétrica (`0.92` / `1.0`) sin límite AC del inversor híbrido y estima peak-shaving con `38.5 €/kW` fijo sin maxímetro.
- `financials.js:7303-7469` ejecuta un segundo despacho `288h` paralelo (asumiendo eólica plana `24h`) y en modo `batStrategy === 'arbitraje'` suma el coste de carga desde red tanto en `monthCostGrid` como en `monthGridChargeCost`, **restando dos veces el coste de recarga** en `ahorroLuzAnio1`.

#### Evidencia Verificada
- `js/wind/wind-hybrid-dispatch.js:43-78, 88-140, 179, 218, 247, 296-308, 353-386, 405`
- `js/wind/wind-resource.js:605-625, 648`
- `js/financials.js:7303-7469` (especialmente `7363, 7389-7390, 7446-7447, 7468`)

#### Pasos de Implementación
1. Corregir inmediatamente la doble contabilidad en `js/financials.js:7389-7468`: mantener `annualCosteCargaRed` solo como desglose informativo o restar únicamente el neto sin duplicarlo dentro de `annualCosteRed` en `ahorroLuzAnio1`.
2. Retirar el motor paralelo de `financials.js` y delegar todo balance energético a un único módulo `RAWind.HybridDispatch` `8760h` real alimentado por las curvas horarias POA reales por faldón + serie horaria eólica ERA5 (`wind-resource.js`), corrigiendo el calendario secuencial (`dayOfYear % 7`) y eliminando código muerto `wkBlend`.
3. Modelar batería con eficiencia bidireccional simétrica `eta = Math.sqrt(roundTripEff)`, tope de potencia de carga/descarga de batería y límite de salida AC `inv.pAcMaxW` del inversor híbrido. Calcular reducción de término de potencia con potencia contratada real y periodos tarifarios (`P1–P6`).

#### Criterios de Aceptación
- Con `batStrategy = 'arbitraje'`, cargar `5 kWh` desde red a `0.10 €/kWh` aumenta exactamente en `0.50 €` (y nunca `1.00 €`) el gasto anual de red.
- `financials.js` y `wind-hybrid-dispatch.js` reportan idéntico % de autoconsumo y ahorro anual (`±0.1%`).

---

### `F2-05` — Subsanar incumplimientos REBT/RD1699: tierra ITC-BT-18, umbral AC Proyecto/MTD, límite 1F y `cosφ`

| Campo | Valor |
| :--- | :--- |
| **Categoría** | Normativa/Eléctrica / Coherencia BOM/Unifilar |
| **Severidad** | P1 (Alto) |
| **Esfuerzo** | S (<2 horas) |
| **Dependencias** | Ninguna |
| **Origen** | B-10 |
| **Rama sugerida** | `fix/rebt-itcbt18-itcbt04-rd1699` |
| **Estado** | `[Pendiente]` |

#### Contexto y Problema
Cuatro desviaciones normativas directas en normativa española:
1. `S_earth` se fija en `6 mm²` (o `16 mm²` si hay pararrayos) independientemente de `S_ac`, violando `REBT ITC-BT-18 Tabla 2` en líneas AC `>= 10 mm²`.
2. `bom-tree.js` conmuta MTD vs Proyecto Técnico Visado usando `totalKwp > 10` (DC) en lugar de **potencia nominal AC > 10 kW** (`ITC-BT-04 Grupo c`).
3. El umbral monofásico RD 1699/2011 comprueba solo `<= 22.5 kWp` DC sin verificar si la suma de potencia nominal AC (`total_ac_kW`) excede `15 kW` o `5 kW/fase`; además `raResolveAcPhases` fuerza `1` fase aunque haya un inversor trifásico seleccionado y `computeSizingEngineering` mezcla `generator.invCount` y `autoSizing.inverters.count`.
4. `computeSizingEngineering` usa `activeInv.cosPhi || 0.95` en `L2537` pero luego hardcodea `0.95` en `L2640, 2678`.

#### Evidencia Verificada
- `js/electrical-engine.js:610, 2523-2538, 2640, 2678, 2731`
- `js/project-config.js:1723, 2013`
- `js/bom-tree.js:1051, 1118, 1146`
- `js/cable-engine.js:2837`

#### Pasos de Implementación
1. Crear `computeProtectiveEarthSection(sAcMm2, hasExternalLightningRod)` en `electrical-engine.js`: `sAc <= 16 ? sAc : (sAc <= 35 ? 16 : Math.ceil(sAc / 2))`, tomando el máximo con `hasExternalLightningRod ? 16 : 6`, y consumirlo desde `cable-engine.js` y `bom-tree.js`.
2. En `bom-tree.js:1118, 1146`, decidir Proyecto Visado vs MTD por `totalAcKwBom > 10.0` (manteniendo nota informativa si DC > 10 kWp).
3. Validar `totalAcKw > 15.0` para bloquear `single_phase` en `wpSyncGridSupplyUI`, avisar cuando `single_phase > 5 kW` (desequilibrio distribuidora / `>15 kW` en instalaciones industriales según RD 1699 Art. 12.2) y validar congruencia real entre `gridSupply` y fases del inversor seleccionado en `raResolveAcPhases`.
4. Unificar el fuente único `invCount` y `cosPAc = activeInv.cosPhi || 0.95` en todo `computeSizingEngineering`.

#### Criterios de Aceptación
- Con `S_ac = 16 mm²` sin pararrayos, `S_earth` resulta `16 mm²`.
- Una instalación `12.6 kWp DC` con inversor `10 kW AC` genera **MTD** en el BOM (no Proyecto Técnico Visado).
- Una instalación `2× 10 kW AC` (`20 kW AC`) exige conexión trifásica aunque `kWp <= 22.5`.

---

### `F2-06` — Unificar renderizadores unifilares (UI Paso 4, SVG EPLAN y DXF) soportando microinversores, >3 strings y BESS

| Campo | Valor |
| :--- | :--- |
| **Categoría** | Coherencia BOM/Unifilar / Bug |
| **Severidad** | P1 (Alto) |
| **Esfuerzo** | L (1–3 días) |
| **Dependencias** | F0-05, F0-07 (datos eléctricos reales y topología MPPT validada) |
| **Origen** | B-11 |
| **Rama sugerida** | `feat/unifilar-unified-topology-dxf` |
| **Estado** | `[Pendiente]` |

#### Contexto y Problema
Los tres esquemas unifilares (Paso 4 UI, SVG EPLAN y AutoCAD DXF) dibujan diagramas rígidos e incoherentes respecto a la ingeniería real:
- Ignoran `selectedTopology === 'microinverter'`, pintando cuadro DC `-XDC` e inversor central cuando hay microinversores.
- En SVG colapsan `>3` strings en un bloque genérico; en DXF directamente **omiten** strings `>3` y omiten la batería `-BAT1`.
- Imprimen potencia unitaria en lugar de suma cuando `invCount > 1` (`P_ac_kW` vs `total_P_ac_kW`), muestran la fórmula falsa `P_dc × 0,95` en tabla técnica y hardcodean etiquetas estáticas (`"Voc(-10°C)"`, `"Eficiencia: 98.4%"`, `"1000V / 32A"`, `"30mA Cl. A/B"`, `"gBat 40A"`) ignorando la temperatura CTE real, clase de diferencial real y protecciones calculadas.

#### Evidencia Verificada
- `js/project-config.js:2728-2946` (`wpRenderStep4SingleLineDiagramUI`)
- `js/docs-generator.js:1136, 1972-2065, 2133-2190, 2320-2409` (`buildUnifilarSvg`, `generateUnifilarDxfString`)
- `js/project-calcs.js:364-366`

#### Pasos de Implementación
1. Definir una estructura única `buildSingleLineTopologyModel(projectCalcs, matrixState)` que devuelva los nodos reales: lista de inversores (o ramas AC de microinversores), sus canales MPPT y strings reales (con módulo, cantidad, `Voc_cold` a `T_min` real, `S_dc`), protecciones reales (`spdDcUcpv`, `dcSwitchUe`, `rcdType`, `rcdSensMa`, `piaCalibreA`), batería BESS (si existe) y aerogenerador/dump-load (si existe).
2. Refactorizar `wpRenderStep4SingleLineDiagramUI`, `buildUnifilarSvg` y `generateUnifilarDxfString` para renderizar dinámicamente a partir de ese modelo único: layout adaptable a `N` inversores y `M` strings (altura/anchura SVG y capas DXF escalables sin recortar >3 strings ni omitir `-BAT1`), con rama específica libre de `-XDC` cuando `isMicroinverter === true`.
3. Reemplazar los textos hardcodeados de Memoria Técnica y unifilares (`1136` fórmula `P_dc * 0.95`, `98.4%`, `-10°C`, `Cl. A/B`) por los valores exactos de `SingleLineTopologyModel`.

#### Criterios de Aceptación
- Con `microinverter`, ni UI ni SVG ni DXF muestran cuadro DC ni inversor string central.
- Con `2 inversores`, `6 strings` asimétricos y `1 batería`, SVG y DXF dibujan ambos inversores, los 6 strings con su `Voc` calculado a `T_min` CTE y el bloque `-BAT1` con sus protecciones reales.

---

### `F2-07` — Corregir desajustes de catálogo (`isc < imp`), ratio microinversores 1:1/4:1, resumen por faldón y `balasto` BOM

| Campo | Valor |
| :--- | :--- |
| **Categoría** | Coherencia BOM/Unifilar / Bug |
| **Severidad** | P1 (Alto) |
| **Esfuerzo** | M (2–8 horas) |
| **Dependencias** | Ninguna |
| **Origen** | B-12 |
| **Rama sugerida** | `fix/catalog-mlpe-ratio-roof-sync` |
| **Estado** | `[Pendiente]` |

#### Contexto y Problema
1. El módulo `tier1_std_450` en `DEFAULT_EQUIPMENT_CATALOG` declara `isc: 11.8` menor que `imp: 13.05` (físicamente imposible), y un optimizador DC (`mlpe_solaredge_s500`) está guardado dentro de `catalog.microinverters`.
2. Cuatro funciones UI/auto-ingeniería asumen `Math.ceil(N / 2)` ("2-en-1") fijo para microinversores, ignorando `raGetMicroinverterRatio` (1-en-1 Enphase o 4-en-1 Hoymiles).
3. `wpRenderStep4RoofScopeUI` imprime longitudes hardcoded (`10 + idx*3.5 m (ZZ-F 6mm²)`) y `"✓ Sin sombras cruzadas"` fijo, ignorando las medidas reales de `RACableEngine` y pérdidas reales del heatmap.
4. `wpSaveRoofOverride` cambia el modelo de módulo por faldón sin regenerar su geometría de paneles ni invalidar sombras; `docs-generator.js:1220` lee `maxInputCurrent` (propiedad inexistente) y `solar-optimizer.js:685` asigna `tipo = 'balasto'` que no coincide con `'balasto_bloques'`/`'ballast_blocks'` de `bom-tree.js:308`.

#### Evidencia Verificada
- `js/working-plane.js:6602, 6623-6628, 7797`
- `js/project-config.js:1754, 2047, 2575, 2600, 2648-2655, 3045-3057`
- `js/docs-generator.js:1145, 1220`
- `js/solar-optimizer.js:685` vs `js/bom-tree.js:308`

#### Pasos de Implementación
1. Corregir `isc` de `tier1_std_450` (valor real `> imp`, p. ej. `13.85 A` si `imp: 13.05 A`, verificando `wp: 450` con `vmp/imp` coherente) y mover optimizadores fuera de `microinverters` hacia su colección `optimizers` propia (con migrador para proyectos guardados).
2. Reemplazar los cálculos `Math.ceil(N / 2)` por `raGetMicroinverterRatio(inv)` en `wpAutoSelectOptimalEngineering`, `wpRefreshAutoEngineeringBanner`, `wpRenderStep4RoofScopeUI` y `wpOpenSmartInverterMatchingModal`.
3. Conectar `wpRenderStep4RoofScopeUI` a las longitudes medidas de `RACableEngine` y pérdidas de sombra reales de `solarHeatmap` por `polyIdx`; disparar `computeSinglePolylineRoofInfo` + invalidación de heatmap en `wpSaveRoofOverride`.
4. Corregir `docs-generator.js:1220` para validar `iMaxScA` (con `1.25` y paralelo) y cambiar `'balasto'` por `'balasto_bloques'` en `solar-optimizer.js:685`.

#### Criterios de Aceptación
- Elegir un microinversor `1-en-1` para 12 paneles muestra y presupuesta exactamente `12` microinversores en auto-ingeniería, Paso 4 y BOM.
- Aplicar recomendación con lastres en el Optimizador Solar calcula bloques y sobrecarga CTE DB-SE-AE en `bom-tree.js`.

---

### `F2-08` — Integrar protecciones DC (`1000V/1500V`) con ganancia bifacial en BOM y cálculos eléctricos

| Campo | Valor |
| :--- | :--- |
| **Categoría** | Normativa/Eléctrica |
| **Severidad** | P2 (Medio) |
| **Esfuerzo** | S (<2 horas) |
| **Dependencias** | F0-06, F0-07 |
| **Origen** | B-13 |
| **Rama sugerida** | `fix/dc-protections-1500v-bifacial` |
| **Estado** | `[Pendiente]` |

#### Contexto y Problema
`calculateElectricalProtections` no incluye la ganancia bifacial (`1.15`) en corrientes y además está desconectada de `computeSizingEngineering` y `bom-tree.js`. Como resultado, el BOM presupuesta cuadros y SPD DC fijos de `1000 V` aunque el diseño trabaje a `1100 V` o `1500 V` DC (`1.20 × Voc_cold > 1000 V`).

#### Evidencia Verificada
- `js/electrical-engine.js:1140-1225, 2560-2564, 2725-2735`
- `js/bom-tree.js:783-794`

#### Pasos de Implementación
1. Añadir soporte `bifacialGainFactor` a `calculateElectricalProtections` e invocarla desde `computeSizingEngineering`, exponiendo `protections.dcSwitchUe` y `protections.spdDcUcpv`.
2. Actualizar `bom-tree.js:783-794` para seleccionar cuadro DC / SPD de `1000 V`, `1200 V` o `1500 V` según `Math.max(1.20 * Voc_cold, vDcMaxInversor)`.

#### Criterios de Aceptación
- Un string de `Voc_cold = 960 V` en inversor `1100 V` (`1.20 × 960 = 1152 V > 1000 V`) escala automáticamente la aparamenta DC en Memoria y BOM a `>= 1200 V / 1500 V CC`.

---

### `F2-09` — Alinear módulo eléctrico eólico con constantes REBT, término reactivo `X` y `Voc_overspeed`

| Campo | Valor |
| :--- | :--- |
| **Categoría** | Normativa/Eléctrica / Bug |
| **Severidad** | P2 (Medio) |
| **Esfuerzo** | S (<2 horas) |
| **Dependencias** | Ninguna |
| **Origen** | B-14 |
| **Rama sugerida** | `fix/wind-electrical-rebt-parity` |
| **Estado** | `[Pendiente]` |

#### Contexto y Problema
`wind-electrical.js` duplica tablas de secciones, usa `0.023` hardcodeado ignorando `CABLE_RESISTIVITY_CU` de `wind-constants.js:37`, omite la reactancia inductiva `X` en AC de larga tirada, no comprueba `Voc_overspeed` del generador PMSG sobre el bus DC/dump-load y carece de coordinación diferencial para inversores eólicos en red.

#### Evidencia Verificada
- `js/wind/wind-constants.js:37`
- `js/wind/wind-electrical.js:25-40, 109, 146, 161, 171, 206-211`

#### Pasos de Implementación
1. Consumir `ELEC_CONSTANTS.STANDARD_SECTIONS` y resistividades de `electrical-engine.js` (y alinear o retirar `CABLE_RESISTIVITY_CU` no usado).
2. Añadir término reactivo `(R * cosφ + X * sinφ)` en líneas AC eólicas (`X ≈ 0.08 Ω/km`).
3. Verificar `Voc_overspeed <= dumpLoadMaxV` e integrar especificación RCD (`Clase A-SI` / `Clase B` según inversor eólico) en salida eléctrica eólica.

#### Criterios de Aceptación
- Un aerogenerador `10 kW / 400 V` a `60 m` arroja idéntica sección y `ΔV` bajo igualdad de corriente que la función REBT FV en `electrical-engine.js`.

---

### `F2-10` — Corregir geometría exacta de paso entre filas (PVsyst vector) y proyección rayo-plano en obstáculos

| Campo | Valor |
| :--- | :--- |
| **Categoría** | Física Solar |
| **Severidad** | P2 (Medio) |
| **Esfuerzo** | M (2–8 horas) |
| **Dependencias** | Ninguna |
| **Origen** | B-15 |
| **Rama sugerida** | `fix/row-pitch-ray-plane-projection` |
| **Estado** | `[Pendiente]` |

#### Contexto y Problema
1. `calculatePVsystRowPitch` impone un suelo arbitrario `cosAzProj >= 0.35` (penalizando configuraciones Este-Oeste) y divide `(footprintA + shadowDist) / cosRoof` proyectando sombra horizontal en vez de intersectar el rayo solar con el plano inclinado de cubierta (sobrestimando separación en faldones al Sur).
2. `solar-heatmap.js` evalúa la cota de coronación del obstáculo usando solo su primer vértice `corners3D[0]`, y el fallback principal proyecta horizontalmente mientras el worker usa intersección rayo-plano inclinado.

#### Evidencia Verificada
- `js/app-main.js:3516-3550`
- `js/solar-heatmap.js:1107-1118, 1818`
- `js/solar-worker.js:513-526`

#### Pasos de Implementación
1. Resolver analíticamente la intersección rayo-plano en 3D usando el vector normal del faldón y vector solar para `calculatePVsystRowPitch`, eliminando el clamp `0.35` cuando el montaje sea Este-Oeste o perpendicular al rayo sin sombra inter-fila hacia atrás.
2. Evaluar la altura relativa respecto al plano usando todos los vértices superiores del obstáculo en `solar-heatmap.js:1108`, y compartir la misma fórmula de proyección rayo-plano entre worker y fallback (eliminando la divergencia con `1818`).

#### Criterios de Aceptación
- Faldón `15° Sur` + mesas `30°` coincide dentro de `±1 cm` con la fórmula trigonométrica exacta sobre plano inclinado.
- Worker y fallback proyectan idéntica poligonal de sombra de obstáculo sobre cubierta inclinada.

---

### `F2-11` — Corregir Monte Carlo P50/P90, flags de auto-ingeniería por ID fijo, multi-turbina flicker y latitud hardcodeada

| Campo | Valor |
| :--- | :--- |
| **Categoría** | Física Solar/Eólica / Bug |
| **Severidad** | P2 (Medio) |
| **Esfuerzo** | M (2–8 horas) |
| **Dependencias** | F2-02 |
| **Origen** | B-16 + B-17 |
| **Rama sugerida** | `fix/p50-p90-flicker-autosizing-flags` |
| **Estado** | `[Pendiente]` |

#### Contexto y Problema
1. `runMonteCarloP50P90` (`B-16`) reduce artificialmente la desviación estándar interanual climática (`sourceFactor`) por el simple hecho de consultar más APIs satelitales y perturba escalarmente sin propagar degradación ni variabilidad horaria.
2. `wpAutoSelectOptimalEngineering` (`B-17`) bloquea futuras re-optimizaciones al marcar `userManuallySelectedInverter = true` si el ID no es `inv_huawei_5k`/`inv_huawei_5ktl_l1`.
3. `wind-worker.js` en `COMPUTE_SHADOW_FLICKER` evalúa solo `turbines[0]`.
4. `cable-engine.js` y `bom-tree.js` llaman a `computeSizingEngineering` con `tiltDeg: 15, azimutDeg: 0, latDeg: 40.4` fijos en vez de los reales del proyecto.

#### Evidencia Verificada
- `js/solar-engine.js:1083-1152`
- `js/project-config.js:1687-1691`
- `js/wind/wind-worker.js:101-106`
- `js/cable-engine.js:2715-2722`
- `js/bom-tree.js:712-721`

#### Pasos de Implementación
1. Separar incertidumbre meteorológica interanual irreducible (`~3.5%` o varianza satelital del sitio) de incertidumbre epistémica entre fuentes en `runMonteCarloP50P90`.
2. Quitar el chequeo por ID hardcodeado en `js/project-config.js:1687` dejando que mande únicamente la bandera explícita `userManuallySelectedInverter`.
3. Iterar sobre todas las turbinas activas y acumular horas de parpadeo en `js/wind/wind-worker.js:102-105`.
4. Pasar `lat`, `lng`, `alt` y orientaciones reales de los faldones al llamar `computeSizingEngineering` desde `cable-engine.js` y `bom-tree.js`.

#### Criterios de Aceptación
- Con todas las fuentes climáticas activas, `σ_irradiance` nunca cae por debajo de la variabilidad climática real configurada.
- Añadir/quitar placas después de un auto-dimensionado previo a `inv_huawei_10k` vuelve a optimizar libremente.
- Parque con 2 aerogeneradores acumula sombra de parpadeo de ambos.

---

### `F2-12` — Ampliar perfil de horizonte `< 6°` y acoplar diodos de bypass por string en sombreado parcial

| Campo | Valor |
| :--- | :--- |
| **Categoría** | Física Solar |
| **Severidad** | P3 (Bajo) |
| **Esfuerzo** | L (1–3 días) |
| **Dependencias** | F2-02, F2-03 |
| **Origen** | B-18 |
| **Rama sugerida** | `feat/horizon-low-angle-string-iv-bypass` |
| **Estado** | `[Pendiente]` |

#### Contexto y Problema
`computeFieldHorizonProfileAsync` comienza su barrido angular en `6°` de elevación solar (`probeLevels = [6, 14, 24, 38, 54]`), dejando invisible cualquier edificio u orografía entre `0°` y `6°` (crítico en solsticio de invierno o zonas montañosas). Además, el modelo de sombreado aplica un factor lineal independiente por módulo sin acoplar la caída conjunta de tensión por activación de diodos de bypass a nivel de string frente a `V_mppt_min`.

#### Evidencia Verificada
- `js/solar-heatmap.js:940-957, 2031-2045`
- `js/solar-worker.js:699-711, 752-759`

#### Pasos de Implementación
1. Ampliar `probeLevels` a `[1.5, 3.5, 6, 12, 22, 36, 54]` y bajar el umbral de elevación útil en `solar-worker.js` desde `5°` a `1.5°` (con límite de masa de aire segura).
2. Tras calcular las sombras instantáneas por módulo en el worker, agrupar los módulos por `stringName` y evaluar si los sub-strings no sombreados activos conservan tensión conjunta `>= V_mppt_min` del inversor (modelo agrupado de diodos de bypass antes de pasar al modelo I-V completo en Fase 7).

#### Criterios de Aceptación
- Un obstáculo lejano que bloquee `4°` al suroeste queda reflejado en el perfil `horizonMap` y reduce la producción directa invernal en `solar-worker.js`.
