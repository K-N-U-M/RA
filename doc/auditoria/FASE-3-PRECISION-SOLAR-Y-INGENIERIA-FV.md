# 🟠 FASE 3: Precisión Solar, Física FV, Normativa Eléctrica y SSOT

> **Objetivo:** Corregir los errores matemáticos/normativos en radiación, clipping, acimut, protecciones REBT y motores eólico/híbrido, consolidar una Única Fuente de Verdad (SSOT) y elevar el motor al estándar AAA (8760h, bifacial, I-V).

---

## 3.A. Ya Resuelto en `js/solar-worker.js` (Base)
- [x] Modelo térmico Faiman + ciclo sinusoidal diurno horario implementado (`js/solar-worker.js`).
- [x] Pesos trapezoidales no uniformes (`hourWeights`) implementados para modo `fast`.
- [x] Bitmask entero `subMask` para sub-strings e `importScripts('polygon-shadow-math.js')`.
*(Nota: revisar Fase 1 tarea 1.2 para corregir los 4 `ReferenceError` y `tiltDeg === 0` antes de validar el Worker).*

---

## 3.B. Bugs Físicos, SSOT y Normativos Detectados

### 3.1. Física Solar y Radiación (`radiation-engine.js`, `solar-engine.js`, `solar-yield-controller.js`, `solar-optimizer.js`)
- **Excentricidad orbital $E_0$ omitida (`js/radiation-engine.js:232, 293`):**
  - `getPerezDiffuse` (`L232`) usa `SOLAR_CONST_WM2` (`1367`) en `delta = (dhi * airMass) / SOLAR_CONST_WM2` sin multiplicar por `e0` (aunque `decomposeErbs` en `L179` sí usa `e0`).
  - `transposeComponents` (`L293`) calcula `Ai = dni / SOLAR_CONST_WM2` también sin `e0`.
  - Los ángulos efectivos IAM para difusa (`60°`) y albedo (`68°`) son constantes en lugar de usar las correlaciones de Brandemuehl dependientes de $\beta$.
- **Clipping anual subestimado ~30× (`js/solar-engine.js:710, 715-718`):**
  - `totalClippedWh += P_ac - pAcNominal;` no multiplica por `nDays` (a diferencia de `totalWiringLoss` y `totalInvLoss` en `L727-737`).
  - `loadFrac` (`L710`) divide entre `pAcNominal * 1.1` en lugar de `pAcNominal`, desplazando la curva de eficiencia del inversor.
- **Modelo aproximado al mediodía (`js/solar-yield-controller.js:143-246`):**
  - Fija `avgAmbTempC = 18.5` y `avgPoaIrradW_m2 = 650.0` sin usar `latFactor` (`L150`) y calcula `poaFactor` solo al mediodía astronómico (`alphaMid`), fallando físicamente en orientaciones E/O/N.
- **Optimizador (`js/solar-optimizer.js:337, 360`):**
  - `L360` multiplica GHI horizontal por `0.80` sin transposición POA; `L337` etiqueta `east_west_12` con `tilt: 12` pero `structureType: 'triangles_15_ew'`.

### 3.2. Divergencias SSOT y Doble Descuento de Pérdidas
- **Worker vs Fallback Main-Thread (`js/solar-heatmap.js` vs `js/solar-worker.js`):**
  1. `solar-heatmap.js:1232` envía `pList` al worker sin filtrar `p.deleted || p.disabled || p.isGhost` (el fallback sí filtra en `L1855`).
  2. `solar-worker.js:323` encoge `activeCellPoly` `0.045 m`; `solar-heatmap.js:1972` no.
  3. `solar-heatmap.js:1807, 2026` respeta `raShadowSimConfig` (`includeObstacles`, `includeBuildings`, `includeInterRow`, `shadowWeightPct`); `solar-worker.js` los ignora.
  4. `solar-heatmap.js:2185` escala `_monthlyNetWh` por un `pKwp` global único en lugar del `p.wp` individual del panel/faldón (`L2135`).
- **Doble descuento de pérdidas (`solar-heatmap.js:1896-1934, 2111` + `solar-yield-controller.js:303, 341`):**
  - El bucle horario ya descuenta IAM, temperatura y sombras/bypass, y después vuelve a aplicarse `prBOS` (`js/config.js:137-140`) que incluye `bypass` (`0.025`).
- **Convención de acimut mezclada (`js/working-plane.js:7614`):**
  - `azimuthDeg` de plano/faldón usa **Norte=0°, Sur=180°**, mientras `moduleAzimuthDeg` usa **Sur=0°**. `L7614-7616` compara ambos valores sin normalizar, separando erróneamente paneles Sur (`180°` vs `0°`) en grupos MPPT distintos.
- **Parámetros geográficos hardcodeados:**
  - `js/cable-engine.js:2715-2722` y `js/bom-tree.js:713-720` llaman a `computeSizingEngineering` con `tiltDeg: 15, azimutDeg: 0, latDeg: 40.4` fijos; `js/project-calcs.js:105-110` fija elevación solar `50°` y azimut `0°`.

### 3.3. Ingeniería Eléctrica (REBT ITC-BT-40, IEC 62548, Cableado 3D)
- **`betaVmp` ignorado en sizing (`js/electrical-engine.js:2464, 2484`):** `computeSizingEngineering` calcula `betaVmp` pero no lo pasa a `calculateDynamicMPPTStringLimits`, haciendo que caiga a `betaVoc * 1.05`.
- **Regresión en Diferencial Tipo B (`js/electrical-engine.js:644` vs `1267`):** `inv.rcmuIntegrated !== false` devuelve `true` para cualquier inversor del catálogo sin esa propiedad definida, burlando la exigencia conservadora de Diferencial Tipo B cuando no hay RCMU certificado.
- **Cálculo de caída de tensión (`js/electrical-engine.js:2537, 2625, 2640, 2678`):**
  - `L2640` y `L2678` hardcodean `cosPAc = 0.95` en $\Delta V_{AC}$ ignorando `cosPhiAc`.
  - `L2625` calcula `dV_dc_trk` con corriente de 1 string si la topología Combiner Box no marca `isParallelTopo`.
  - `L2501-2507` no valida límites por inversor (`invCount`, `mppt * inputsPerMppt`, `iMaxScA`, `iMaxOperA`) ni campos heterogéneos (`modulesBreakdown`).
- **Desajuste de longitud DC y bifacialidad (`cable-engine.js:2543, 2594, 2695` vs `electrical-engine.js:2560, 2585`):** Unificar `fullLoopM` vs `2 * L_dc_string_measured` y parametrizar el factor bifacial (`1 + bifacialityFactor * rearGain`) entre memoria técnica y HUD de cables.

### 3.4. Subsistema Eólico e Híbrido (`js/wind/*` y `js/financials.js`)
- `js/wind/wind-resource.js:753`: `sectorCounts[s] / nHours` subestima AEP si hay horas inválidas; `L236-246` mezcla `vMs` y `vEq` en `interpolatePowerCurve`; `L440` usa `hubH` en vez de `effectiveHubHeightM` para `kWake`.
- `js/wind/wind-shadow-flicker.js:95-141, 310`: simplifica disco de rotor sin yaw 360° y usa heurístico desconectado del heatmap FV.
- `js/wind/wind-electrical.js:109, 146`: usa `0.023` frente a `CABLE_RESISTIVITY_CU = 0.0175` en `wind-constants.js:37` y omite reactancia inductiva $X$.
- `js/wind/wind-hybrid-dispatch.js` vs `js/financials.js:7380-7505`: alinear pesos eólicos mensuales, perfil solar, perfil horario de carga y ciclo diurno eólico.

### 3.5. Evolución Técnica Nivel AAA (Roadmap Post-Correcciones)
1. **Simulación horaria real 8760h (TMY PVGIS / ERA5) en Worker único SSOT:** Reemplazar 12×16 por series horarias reales cacheadas en IndexedDB con LUT rápida de sombreado `(azimut, elevación)` (<150 ms) y consumos horarios reales (Datadis / 2.0TD / 3.0TD).
2. **Desglose desacoplado de pérdidas bancables:** Soiling dependiente de lluvia, LID/LeTID Año 1 separado de degradación lineal, y mismatch por string.
3. **Modelo Bifacial por Factores de Vista (View Factors)** para irradiancia trasera y corriente de diseño IEC.
4. **Solver Curva I-V de 1 Diodo (De Soto / Bishop)** por sub-string (3 diodos bypass) para cuantificar con rigor la ganancia real de MLPE frente a inversores string.

---

## Checklist de Avance
- [x] 3.1. Corregir `e0`/Brandemuehl en `radiation-engine.js`, clipping `* nDays` y `loadFrac` en `solar-engine.js`, yield/optimizer
- [x] 3.2. Alinear Worker vs Fallback, eliminar doble conteo de `prBOS` y normalizar convención de acimut (`working-plane.js:7614`)
- [x] 3.3. Corregir `betaVmp`, regresión Diferencial Tipo B (`electrical-engine.js:644`), `cosPhiAc`, `dV_dc_trk`, multi-inversor y paridad `cable-engine`
- [x] 3.4. Corregir `wind-resource.js`, `wind-shadow-flicker.js`, `wind-electrical.js` y unificar despacho híbrido con `financials.js`
- [x] 3.5. Evolución AAA: 8760h TMY + pérdidas desacopladas + View Factors bifacial + solver I-V 1 diodo

## Registro de Avances
- **2026-11-26 (Fase 3 inicial):** Implementado Faiman + ciclo diurno, pesos trapezoidales y bitmask en `js/solar-worker.js`.
- **2026-11-26 (Auditoría Quirúrgica):** Localizados errores físicos de `e0`, clipping 30×, doble descuento `prBOS`, mezcla de acimut `N=0`/`S=0`, regresión RCD Tipo B, `betaVmp` y divergencias híbridas eólicas.
- **2026-11-26 (3 Agentes en paralelo):** Fase 3 completada al 100%: `e0` + Brandemuehl en `radiation-engine.js`, clipping anual `* nDays` y `loadFrac` en `solar-engine.js`, yield por transposición horaria, `prBOS` sin doble conteo de `bypass`, paridad Worker↔Fallback (`shadowSimConfig`, `p.wp`, shrink 0.045m), acimut MPPT normalizado, `betaVmp` + RCD Clase B conservador + `cosPhiAc` + multi-inversor/Combiner en `electrical-engine.js`, alineación eólica/híbrida 288h/8760h y nuevo módulo AAA `js/pv-advanced-models.js` (solver I-V 1-diodo De Soto/Bishop, View Factors bifaciales, Soiling/LID desacoplados) con `tests/test-pv-advanced-models.js`.
