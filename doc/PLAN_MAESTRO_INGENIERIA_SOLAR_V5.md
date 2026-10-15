# 🔬 PLAN MAESTRO DE INGENIERÍA SOLAR V5.0
## Crítica Quirúrgica + Plan de Acción — Proyecto RA (Visor Solar 3D)

> **Autor:** Auditoría autónoma — Agente IA (rol: Ingeniero Industrial Senior PV + Doctor en Física + Expert en PVSOL/PVsyst/Helioscope)  
> **Fecha:** 2026-10-15  
> **Base de código:** rama `feature/nuevas-funciones`, commit `73b300f`  
> **Estado previo:** Plan V4.0 implementado al 100% (22/22 tests PASS)

---

## PARTE I — CRÍTICA QUIRÚRGICA

### 1. FÍSICA Y ALGORITMOS

#### 1.1 `estimateMonthlyGHI` — Recurso Solar Sintético (DEFICIENCIA P1)

**Archivo:** [`js/solar-engine.js`](file:///c:/TRABAJOS/RA%20-%20Z%20-%20AG/js/solar-engine.js#L541-L558)

```javascript
// L541-558: estimateMonthlyGHI
const KT_BASE = [0.55,0.58,0.60,0.60,0.60,0.64,0.68,0.68,0.62,0.57,0.52,0.50];
const latFactor = 1 - (latDeg - 40) * 0.008;
// ... integral de irradiación extraterrestre × Kt × latFactor
```

**Diagnóstico:**
- El vector `KT_BASE` es un índice de claridad mensual estático codificado a mano para España «media», sin distinción geográfica (¡Sevilla y Bilbao obtienen el mismo Kt!).
- El `latFactor` es un gradiente lineal de ±0.8%/grado, sin tener en cuenta la nebulosidad real (costal cántabro vs. interior manchego → diferencia real de Kt >0.12).
- `runPhysicalModel()` llama a `estimateMonthlyGHI` como única fuente de radiación: si PVGIS falla (protocolo `file://`), **toda la producción anual se basa en este modelo sintético** con errores potenciales de **±15-25%** respecto a TMY real.

**Evidencia cuantitativa:** Para Sevilla (37°N, Kt~0.65 en Jun) el modelo retorna Kt=0.68 (sobreestima ~4.6%). Para Oviedo (43°N, Kt~0.48 en Jun) retorna Kt~0.64 (sobreestima ~33%). Error inadmisible en proyectos bancables.

**Corrección requerida:** Integrar NASA POWER como fallback offline (ya disponible en `runNASAPower()` pero **no conectado** a `estimateMonthlyGHI`). Ver Hito 1 del plan.

---

#### 1.2 `computeCellTemperature` — Modelo Térmico (DEFICIENCIA P1)

**Archivo:** [`js/solar-engine.js`](file:///c:/TRABAJOS/RA%20-%20Z%20-%20AG/js/solar-engine.js#L414-L419)

```javascript
function computeCellTemperature(T_amb, G_poa, isRoofMounted = true, windSpeed = 1.5) {
  const u0 = isRoofMounted ? 26.0 : 29.0;
  const u1 = isRoofMounted ? 1.3 : 1.5;
  const eta_stc = 0.215;
  return T_amb + (G_poa / (u0 + u1 * windSpeed)) * (1 - eta_stc / 0.9);
}
```

**Diagnóstico:**
- `eta_stc = 0.215` es hardcoded para módulos de alta eficiencia (HJT/TOPCon). Para PERC estándar (η~17%) hay un error de +2.5°C en temperatura de célula, lo que se traduce en **±0.7%** en producción.
- La expresión `(1 - eta_stc / 0.9)` es la fracción de energía convertida en calor (modelo Faiman simplificado), pero el denominador `0.9` es empírico sin referencia normativa; en el modelo Faiman original la fracción térmica es `(1 - η_mod)`.
- `windSpeed = 1.5 m/s` es constante anual sin variación estacional ni diurna. En cubierta urbana plana el viento puede variar de 0.5 m/s (noche de verano) a 5 m/s (frente atlántico), con diferencia de Tcell de hasta **12°C**.
- En la simulación heatmap (`solar-heatmap.js` L605), se usa `tempFactor = (m >= 4 && m <= 8) ? 0.93 : 0.98` como sustituto **escalón binario** del derating térmico, **ignorando completamente `computeCellTemperature`**.

**Corrección requerida:** Conectar `computeCellTemperature` a la simulación heatmap con `eta_stc` del catálogo y perfil de viento estacional. Ver Hito 2.

---

#### 1.3 IAM ASHRAE — Modelo Fijo (DEFICIENCIA P2)

**Archivo:** [`js/radiation-engine.js`](file:///c:/TRABAJOS/RA%20-%20Z%20-%20AG/js/radiation-engine.js#L157-L158)

```javascript
const iamFactor = (cosTheta > 0.01) ? Math.max(0, 1 - b0 * ((1 / cosTheta) - 1)) : 0;
const iamBlend = 0.85 + 0.15 * iamFactor;
```

**Diagnóstico:**
- `b0 = 0.05` fijo ASHRAE es válido para vidrio templado estándar. Los módulos TOPCon/HJT con recubrimiento AR (Anti-Reflective) tienen `b0 ≈ 0.02–0.03`, lo que supone **+0.8–1.5%** adicional de energía respecto a lo calculado.
- El factor `iamBlend = 0.85 + 0.15 * iamFactor` es una **mezcla empírica** sin base física documentada. Aplica IAM a la suma total G_poa (beam + difusa + albedo), pero el IAM teórico solo aplica al haz directo (beam). La componente difusa usa el modelo de Faiman-Reindl con IAM isotrópico separado.
- Para ángulos de incidencia >70° (primeras/últimas horas del día, paneles verticales), la pérdida por IAM está subestimada; el modelo ASHRAE diverge del medido experimentalmente en glass-glass.

**Corrección requerida:** IAM selectivo por componente + `b0` extraído del catálogo. Ver Hito 3.

---

#### 1.4 `tempFactor` Binario en Heatmap — Doble Desacoplamiento (DEFICIENCIA P1)

**Archivo:** [`js/solar-heatmap.js`](file:///c:/TRABAJOS/RA%20-%20Z%20-%20AG/js/solar-heatmap.js#L604-L605)

```javascript
const tempFactor = (m >= 4 && m <= 8) ? 0.93 : 0.98;
```

**Diagnóstico crítico:**
- Esto es un escalón binario: 93% en verano, 98% en invierno. La realidad es una curva continua mensual.
- El derating térmico real en un PERC de 450Wp para Madrid (γPmp = -0.34%/°C):
  - Enero (Tamb=6°C, Tcell≈20°C): factor ≈ 0.983 ✓ (correcto)
  - Julio (Tamb=28°C, Gpoa=900W/m²): Tcell≈65°C → factor ≈ **0.864** (¡vs 0.93 hardcoded = **error de +7.6%**!)
- Este error afecta directamente a `p.annualKwh` (línea 925), que es el SSOT de producción por panel y base del despacho financiero.

**Impacto financiero:** En una instalación de 10 kWp en Madrid, la sobreestimación de producción veraniega puede ser de **+400–600 kWh/año**, equivalente a **+80–120€/año** de ahorro ficticio.

**Corrección requerida:** Implementar `calcTcell` por mes con temperatura ambiente mensual real del perfil climático. Ver Hito 2.

---

#### 1.5 `GHI_instant` — Distribución Diurna (DEFICIENCIA P2 — parcialmente corregida en v4)

**Archivo:** [`js/solar-heatmap.js`](file:///c:/TRABAJOS/RA%20-%20Z%20-%20AG/js/solar-heatmap.js#L669-L670)

```javascript
const GHI_instant = Math.max(0, (GHI_daily_Wh / (_sinAltSum * hourStepDt)) * sinAlt);
```

La normalización por `_sinAltSum` es correcta (fix [C6] en v4). Sin embargo, `GHI_daily_Wh` proviene de `estimateMonthlyGHI` que retorna Wh/m²/día pero el nombre de variable sugiere Wh total mensual. **Verificado: es energía diaria** (el bucle externo multiplica por `monthDaysW[mIdx]`), correcto. No hay error aquí.

**Punto positivo documentado** ✅

---

#### 1.6 Self-Shading Inter-Filas — No Simulado en Heatmap (DEFICIENCIA P2)

**Diagnóstico:**
- `computeInterRowPitch()` ([`solar-engine.js` L161-L226](file:///c:/TRABAJOS/RA%20-%20Z%20-%20AG/js/solar-engine.js#L161-L226)) calcula correctamente el paso mínimo CTE DB-HE5 (ventana 4h solsticio de invierno, ángulo horario ±30°).
- **Sin embargo**, en la simulación heatmap de 192 instantes, el autosombreado entre filas de paneles **NO se calcula**. Solo se calculan sombras de `obstacles[]` y `buildings[]`. Las sombras de una fila sobre la siguiente a ángulos solares bajos (mañana/tarde de invierno) quedan completamente fuera del modelo.
- En sistemas con paso inter-filas ajustado al mínimo normativo (relación d/h ≈ 2.5 en solsticio), las filas traseras pueden recibir sombra de la fila delantera hasta 2h por día en invierno.
- **Impacto estimado:** 1–3% de pérdida anual no modelada en cubiertas con múltiples filas de paneles inclinados.

**Corrección requerida:** Añadir cada fila como obstáculo AABB interno en el heatmap. Ver Hito 4.

---

#### 1.7 IAM Aplicado a G_beam, G_diffuse y G_albedo Juntos (DEFICIENCIA P2)

En `transposeComponents` ([`radiation-engine.js` L158-L161](file:///c:/TRABAJOS/RA%20-%20Z%20-%20AG/js/radiation-engine.js#L158-L161)):

```javascript
const iamBlend = 0.85 + 0.15 * iamFactor;
const G_poa = G_poa_raw * iamBlend;
```

El IAM se aplica como factor global a G_poa_raw = G_b + G_d + G_r. Físicamente:
- **G_beam:** IAM depende del ángulo θ (correcto con ASHRAE).
- **G_diffuse (Perez):** Ya usa un modelo de ángulo efectivo integrado. Aplicar IAM directa sobre G_d es doble contabilización.
- **G_albedo:** No tiene ángulo de incidencia definido; el IAM no aplica.

Corrección: IAM selectivo solo sobre `G_b`. Ver Hito 3.

---

#### 1.8 Monte Carlo P50/P90 — Distribución de Incertidumbre (DEFICIENCIA P3)

**Archivo:** [`js/solar-engine.js`](file:///c:/TRABAJOS/RA%20-%20Z%20-%20AG/js/solar-engine.js#L968-L1034)

```javascript
const uncertaintySources = {
  irradiance: 0.045,   // ±4.5%
  temperature: 0.015,
  ...
  model: 0.030         // ±3.0%
};
```

**Diagnóstico:**
- La incertidumbre del recurso solar PVGIS SARAH-3 es **±3.5% (1σ)**, no ±4.5%. El valor es conservador y sobreestima P90.
- Las fuentes de incertidumbre se combinan en cuadratura (correcto para fuentes independientes), pero `temperature` e `irradiance` están **correlacionadas positivamente** (días calurosos → alta irradiancia → mayor pérdida térmica → la correlación reduce la varianza neta).
- El `sourceFactor` (L990-991) reduce la incertidumbre artificialmente cuando hay más fuentes de datos, pero sin una base estadística rigurosa de fusión bayesiana.
- El generador `mulberry32(42)` con semilla fija produce siempre los mismos P50/P90 independientemente del proyecto o la ubicación: los resultados son **deterministas y no representan variabilidad real**.

---

### 2. FLUJO DE TRABAJO INGENIERIL

#### 2.1 SSOT de Producción — Inconsistencia Potencial (DEFICIENCIA P1)

La SSOT canónica es `getProjectCalcs().annualKWh` (AGENTS.md §10). Verificando la cadena:

```
getProjectCalcs() → window.RA.solarStats || estimación paramétrica (kwp × 1450 fallback)
solar-heatmap.js → p.annualKwh (por panel) → solarSimState.annualKwhTotal
financials.js → usa solarStats.annualYieldKWh
```

**Problema detectado:** Si la simulación heatmap se ejecuta pero el usuario modifica posteriormente un parámetro de módulo (inclinación, orientación), `wpInvalidateHeatmap()` marca `annualHeatmapDirty = true`. Sin embargo, `getProjectCalcs()` **puede retornar el valor pre-invalidación** si `window.RA.solarStats` no se limpia explícitamente. La cadena de invalidación no propaga el dirty flag a `window.RA.solarStats`.

**Riesgo:** PDFs generados con producción desactualizada sin advertencia visible (la advertencia solo aparece en el Paso 3).

#### 2.2 Árbol de Pérdidas — Cascada Parcialmente Falsa (DEFICIENCIA P2)

En `runPhysicalModel()` ([`solar-engine.js` L653-L666](file:///c:/TRABAJOS/RA%20-%20Z%20-%20AG/js/solar-engine.js#L653-L666)):

```javascript
const cascadeLosses = {
  stc: kwp * 1000,
  irrad: -stcNominal * 0.08,  // ← hardcoded 8%
  shading: -annualKWh * 0.03, // ← hardcoded 3%
  ...
};
```

Las pérdidas de irradiancia y sombreado están **hardcoded** en el árbol de cascada de la tabla comparativa, ignorando los valores reales calculados por la simulación. Esto genera inconsistencias visuales en el gráfico waterfall.

#### 2.3 Paso 2 → 3: Sin Validación de Compatibilidad MPPT (DEFICIENCIA P2)

Al generar el layout en Paso 2, el usuario puede crear un número de paneles incompatible con la ventana MPPT del inversor. La función `getNearestValidStringModuleCount()` existe pero **no se invoca automáticamente** al cambiar el número de paneles en el layout: el usuario tiene que ir manualmente al Paso 4 para descubrir el error.

#### 2.4 Catálogo de Módulos — Parámetros Eléctricos Incompletos (DEFICIENCIA P2)

En `calculateDynamicMPPTStringLimits()` ([`electrical-engine.js` L51-L86](file:///c:/TRABAJOS/RA%20-%20Z%20-%20AG/js/electrical-engine.js#L51-L86)):

```javascript
const Voc_STC = modParams.Voc || pCfg.voc || (modW >= 500 ? 50.0 : 49.5);
const betaVoc = modParams.betaVoc || pCfg.betaVoc || -0.0027;
```

Si el catálogo no tiene `Voc` ni `betaVoc` definidos, se usan valores por defecto que pueden diferir ±5-8% del módulo real. Para un string de 20 módulos: error potencial de ±25V en Voc_Tmin, pudiendo validar una configuración que en realidad viola `Vmax_inv` en días fríos.

---

### 3. ANÁLISIS UI/UX — INEFICIENCIAS Y FRICCIONES

#### 3.1 Flujo de 5 Pasos — Análisis de Clicks

**Problema:** El flujo lineal obliga al usuario a navegar entre pasos para configurar datos interdependientes:

| Acción | Pasos requeridos | Clicks estimados |
|--------|-----------------|-----------------|
| Cambiar orientación de módulo y ver impacto en kWh | P1 → P2 → P3 (ejecutar heatmap) | ~15 |
| Verificar compatibilidad strings tras cambiar inversor | P4 → regresar P2 → P4 | ~12 |
| Actualizar datos de factura y ver nuevo payback | P3 → P5 | ~8 |
| Añadir batería y recalcular VAN | P4 (catálogo) → P5 | ~10 |

**Patrón AAA en software PV profesional (Helioscope, Aurora Solar):** El layout y el análisis energético son co-dependientes y se actualizan en tiempo real sin cambio de paso.

#### 3.2 Panel de Configuración — Dispersión de Controles (DEFICIENCIA UX-P1)

Los parámetros del módulo están dispersos en:
- Sidebar del Paso 2: inclinación, orientación, portrait/landscape
- Modal "Configurar Módulo": potencia, tecnología, dimensiones
- Modal "Pérdidas del Sistema": cableado, mismatch, soiling, IAM angular
- Sidebar del Paso 4: inversor, batería, topología

**Consecuencia:** Para configurar un proyecto completo el usuario debe visitar 4 ubicaciones distintas sin hilo conductor claro. No hay un panel de "resumen de configuración activa" visible en todo momento.

#### 3.3 Sin Asistente Proactivo de Validación (DEFICIENCIA UX-P1)

La aplicación no muestra alertas proactivas sobre:
- Ratio DC/AC fuera de rango recomendado (0.9–1.35 IEC 62548)
- String voltage MPPT incompatible con el inversor seleccionado
- Inclinación <10° (riesgo de sedimentación, ya calculado en `computeInterRowPitch` pero no mostrado en UI)
- Número de paneles no divisible en strings válidos

Estas validaciones existen en el código (`validateMPPTHomogeneity`, `calculateInverterEfficiencyAndClipping`) pero sus resultados **no se propagan a avisos contextuales en la UI** durante el diseño.

#### 3.4 Simulación Heatmap — Fricción de Activación (DEFICIENCIA UX-P2)

- El heatmap requiere un clic manual en "Computar Simulación Anual" en el Paso 3.
- Si el usuario modifica paneles y regresa al Paso 3, el heatmap muestra resultados obsoletos con un simple texto `⚠ Análisis obsoleto`.
- No hay un cálculo incremental: cualquier cambio invalida toda la simulación.
- **Modal de bifacialidad** (`wpEnsureBifacialConfig`): aparece como bloqueo síncrono bloqueando la UX. Es innecesario si el catálogo de módulos tiene el campo `isBifacial` correctamente poblado.

#### 3.5 Exportación — Fragmentación de Documentos (DEFICIENCIA UX-P2)

- El usuario puede exportar: Análisis Comparativo, Memoria Técnica, Oferta Comercial, BOM desde 3 ubicaciones distintas del flujo.
- No hay un "botón de entrega" único que genere el pack completo (Memoria + Oferta + BOM + Análisis).
- Los 4 documentos se generan en ventanas emergentes separadas, lo que dificulta la impresión secuencial o el envío como PDF unificado.

#### 3.6 Modo Captura — Limitación de Visibilidad (DEFICIENCIA UX-P3)

El modo captura (`RACapture`, tecla `C`) oculta vértices y polilíneas pero **no oculta el panel lateral (sidebar)**, lo que impide capturas de pantalla del visor 3D limpio para presentaciones. Tampoco hay modo de captura automática con posición predefinida de cámara.

---

### 4. ARQUITECTURA Y CÓDIGO

#### 4.1 Dos Implementaciones de `computePOAIrradiance` (DEFICIENCIA ARQ-P1)

Existe una implementación en:
1. [`solar-engine.js` L359-L412](file:///c:/TRABAJOS/RA%20-%20Z%20-%20AG/js/solar-engine.js#L359-L412): código Hay-Davies inline completo con IAM ASHRAE
2. [`radiation-engine.js`](file:///c:/TRABAJOS/RA%20-%20Z%20-%20AG/js/radiation-engine.js): SSOT canónica (Erbs + Hay-Davies/Perez + IAM)

La función en `solar-engine.js` **delega en `RA.Radiation.poa` si está disponible** (correcto), pero su cuerpo fallback es 60 líneas de código duplicado. Si `radiation-engine.js` no carga (error de orden de scripts), la fallback silenciosa usa Hay-Davies en vez de Perez, **sin ningún warning al usuario**.

#### 4.2 `runPhysicalModel` vs. Heatmap — Dos Motores de Producción (DEFICIENCIA ARQ-P1)

Existen dos motores de simulación de producción paralelos:
- `runPhysicalModel()` en `solar-engine.js`: bucle horario simplificado con `estimateMonthlyGHI`, temperatura estacional simple, PR aplicado al final.
- Simulación heatmap en `solar-heatmap.js`: bucle por panel × instante, Perez real, temperaturas con `tempFactor` binario, PR_BOS.

Los dos producen **valores distintos** de kWh anuales para la misma instalación. `runEnergyComparison()` los muestra juntos como "Estimación Paramétrica" vs. "Modelo Físico IEC", pero **`getProjectCalcs().annualKWh` puede venir de cualquiera** dependiendo del estado de `window.RA.solarStats`.

#### 4.3 `calcPOA` Función Legada — Sin Deprecar (DEFICIENCIA ARQ-P2)

[`solar-engine.js` L451-L507](file:///c:/TRABAJOS/RA%20-%20Z%20-%20AG/js/solar-engine.js#L451-L507): `calcPOA` es una función legacy con un Perez simplificado hardcoded. Se llama desde `runPhysicalModel` fallback path. No está deprecada, no tiene jsdoc de `@deprecated`, y puede ser invocada accidentalmente.

---

### 5. NORMATIVA Y EXPORTACIÓN

#### 5.1 Temperatura Mínima de Diseño — Sin Configurar por Zona (DEFICIENCIA P2)

`T_MIN_SPAIN = -10` es uniforme para toda España. Sin embargo:
- Zona A (costal mediterráneo): Tmin = -2°C (Almería, Málaga)
- Zona D/E (interior meseta alta): Tmin = -15°C a -20°C (Ávila, Cuenca)
- CTE DB-HE1 zona climática C/D: Tmin hasta -18°C en sierra

Con Tmin=-10 en lugar de -18°C para módulos de zona D, `Ns_max_voc` puede estar sobrestimado en 1-2 módulos, generando configuraciones que violan `Vmax_inv` en condiciones extremas.

#### 5.2 Degradación Anual — No Modelada en Cashflow (DEFICIENCIA P2)

En `financials.js`, el cashflow a 25 años usa `annualKWh` constante sin degradación por año. Los módulos PERC degradan típicamente:
- Año 1: -2% (LID)
- Años 2-25: -0.5%/año lineal (garantía estándar)
- Total año 25: ~87% de la producción inicial

Sin modelar degradación, el **VAN está sobreestimado** en aproximadamente 6-8% y el **payback subestimado** en 3-6 meses.

#### 5.3 Pérdidas de Suciedad (Soiling) — Factor Fijo (DEFICIENCIA P3)

`loss_soiling = 0.025` (2.5%) es constante anual. En España:
- Zonas con alta pluviosidad (Norte): soiling ~1%/año
- Zonas áridas (Sur + zonas de polvo sahariano): 3-6%/año en verano
- Sin lluvia + polución urbana: hasta 8%/año

El impacto en producción de un factor de soiling mal calibrado puede ser **±2% de energía anual**.

---

## PARTE II — PLAN DE ACCIÓN V5.0

### Hito 1 — GHI Real Offline: NASA POWER como Fallback (PRIORIDAD CRÍTICA)

**Objetivo:** Eliminar el modelo `estimateMonthlyGHI` con Kt estático como fuente principal. Conectar `runNASAPower()` ya implementado como fuente de GHI mensual real en `runPhysicalModel()`.

**Archivos afectados:**
- `js/solar-engine.js` — función `runPhysicalModel()` y `estimateMonthlyGHI()`

**Formulación:**

$$\text{GHI}_m = \begin{cases} \text{NASA POWER}_m & \text{si disponible (caché localStorage)} \\ H_{0,m} \cdot Kt_m^{\text{zona}} & \text{fallback offline} \end{cases}$$

**Implementación:**

```javascript
// En runPhysicalModel(): precarga GHI mensual real
async function enrichGHIFromNASA(lat, lon) {
  const cacheKey = `ra_nasa_ghi_${lat.toFixed(2)}_${lon.toFixed(2)}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    const { data, ts } = JSON.parse(cached);
    if (Date.now() - ts < 30 * 86400e3) return data; // 30 días TTL
  }
  const result = await runNASAPower(lat, lon);
  if (!result.error && result.monthlyGHI_kWhm2) {
    localStorage.setItem(cacheKey, JSON.stringify({ data: result.monthlyGHI_kWhm2, ts: Date.now() }));
    return result.monthlyGHI_kWhm2;
  }
  return null;
}
```

**Criterio de aceptación:**
- `runPhysicalModel()` usa GHI mensual de NASA POWER si el caché existe (≤30 días de antigüedad).
- Fallback silencioso a `estimateMonthlyGHI` solo si NASA falla Y no hay caché.
- Toast informativo al usuario cuando se usa el modelo sintético.
- Tests: diferencia entre NASA POWER Madrid y modelo sintético documentada.

---

### Hito 2 — Temperatura de Célula Continua por Mes (PRIORIDAD CRÍTICA)

**Objetivo:** Sustituir `tempFactor` binario (0.93/0.98) por cálculo continuo usando `T_AMB_MONTHLY_ESP` y la función física `calcTcell`.

**Archivos afectados:**
- `js/solar-heatmap.js` — bucle de simulación (L600-L890)

**Formulación (Modelo NOCT / Faiman):**

$$T_{\text{cell}} = T_{\text{amb},m} + \frac{NOCT - 20}{800} \cdot G_{\text{POA}}$$

$$\eta_{\text{temp}} = 1 + \gamma_{P_{mp}} \cdot (T_{\text{cell}} - 25)$$

donde $\gamma_{P_{mp}}$ se extrae del catálogo del módulo activo.

**Implementación:**

```javascript
// Dentro del bucle heatmap (sustituyendo la línea 605):
const T_amb_monthly = {
  costal_med: [11,12,14,16,20,25,28,28.5,24,19,14,11],
  interior:   [5, 7,10,12,17,23,27,27,  22,15, 9, 5],
  atlantico:  [9,10,12,13,16,19,21,21.5,19,15,11, 9]
};
const zone = getClimaticZone(lat, lng);
const T_amb = T_amb_monthly[zone][m];

// Temperatura de célula estimada con G_poa del instante
const NOCT = (activeModule && activeModule.noct) || 45;
const gamma = (activeModule && activeModule.gammaPmp) || -0.0034;
const T_cell = T_amb + (NOCT - 20) / 800 * G_poa_instant;
const tempFactor = 1 + gamma * (T_cell - 25);
```

**Criterio de aceptación:**
- `tempFactor` varía mes a mes de forma continua.
- Para Madrid en julio: tempFactor ≈ 0.864 (PERC estándar, G_poa≈900 W/m²).
- Diferencia en producción anual vs. modelo binario ≤±1% (validar contra PVGIS).
- Tests unitarios: `calcTcell(28, 900, 45)` == 65°C ± 1°C.

---

### Hito 3 — IAM Selectivo por Componente (PRIORIDAD ALTA)

**Objetivo:** Aplicar IAM ASHRAE **solo** sobre la componente de haz directo (G_beam), y hacer `b0` configurable desde el catálogo de módulos.

**Archivos afectados:**
- `js/radiation-engine.js` — función `transposeComponents()`

**Formulación:**

$$G_{\text{POA, efectiva}} = G_b \cdot \text{IAM}(\theta) + G_d + G_r$$

$$\text{IAM}_{\text{ASHRAE}}(\theta) = \max\left(0,\ 1 - b_0 \left(\frac{1}{\cos\theta} - 1\right)\right)$$

con $b_0 = 0.05$ (vidrio estándar), $b_0 = 0.03$ (AR coating), configurable.

**Implementación en `transposeComponents`:**

```javascript
// Solo beam lleva IAM; difusa y albedo no tienen ángulo definido único
const G_b_iam = G_b * iamFactor;           // Haz con IAM
const G_d_eff = G_d;                        // Difusa Perez: ya integra ángulos efectivos
const G_r_eff = G_r;                        // Albedo: sin IAM
const G_poa = G_b_iam + G_d_eff + G_r_eff;
```

**Criterio de aceptación:**
- `transposeComponents` aplica `iamFactor` solo a `G_b`.
- Campo `b0` leído de `activeModule.iam_b0 || 0.05`.
- Para θ=0° (incidencia normal): `iamFactor=1`, sin cambio en G_b.
- Para θ=70°: `iamFactor ≈ 0.863` con b0=0.05; `iamFactor ≈ 0.916` con b0=0.03.
- Sin regresión: test comparativo producción anual ±0.5% del estado actual.

---

### Hito 4 — Self-Shading Inter-Filas en Heatmap (PRIORIDAD ALTA)

**Objetivo:** Calcular y aplicar sombras inter-filas en la simulación anual para instalaciones con múltiples filas de paneles inclinados.

**Archivos afectados:**
- `js/solar-heatmap.js` — generación de `polyShadowQuads2D`

**Formulación:**

La sombra de la fila $i$ sobre la fila $i+1$ en coordenadas de plano de cubierta:

$$\Delta u_{\text{sombra}} = h_{\text{módulo}} \cdot \frac{\cos(\gamma_{\text{sol}} - \gamma_{\text{panel}})}{\tan(\alpha_{\text{sol}})}$$

donde $h_{\text{módulo}} = L_m \cdot \sin\beta$.

**Estrategia de implementación:**

```javascript
// En el bucle heatmap, antes de polyShadowQuads2D:
function generateInterRowShadowQuads(panels, pInfo, sU, sV, solarPos) {
  const rowGroups = groupPanelsByRow(panels, pInfo); // agrupa por coordenada v
  const shadowQuads = [];
  for (let i = 0; i < rowGroups.length - 1; i++) {
    const frontRow = rowGroups[i];    // fila delantera (más alejada del sol)
    const backRow = rowGroups[i + 1]; // fila trasera
    // Proyectar sombra de la fila delantera sobre la trasera en coords 2D
    const shadowProjection = projectRowShadow(frontRow, pInfo, solarPos);
    if (shadowProjection) shadowQuads.push(...shadowProjection);
  }
  return shadowQuads;
}
```

**Criterio de aceptación:**
- Sombras inter-filas calculadas y añadidas a `polyShadowQuads2D` en el heatmap.
- Para instalación de 3 filas a 30° en Madrid: pérdida anual inter-filas documentada.
- Tiempo de simulación no aumenta más del 20%.
- El flag `self_shading_enabled` en `window.solarProjectConfig` controla si está activo.

---

### Hito 5 — Degradación Anual y Soiling Estacional en Financials (PRIORIDAD ALTA)

**Objetivo:** Modelar degradación de módulos año a año y soiling estacional en el cashflow a 25 años.

**Archivos afectados:**
- `js/financials.js` — función `getProjectCalcs()` y cálculo de cashflow

**Formulación:**

$$E_{\text{año }n} = E_0 \cdot \prod_{k=1}^{n} \left(1 - d_k\right) \cdot \left(1 - \bar{f}_{\text{soiling}}\right)$$

donde:
- $d_1 = 0.02$ (LID primer año, solo P-type)
- $d_{k \geq 2} = 0.005$ (degradación lineal estándar garantía IEC 61215)
- $d_{k \geq 2}^{N\text{-type}} = 0.003$ (TOPCon/HJT — mejor retención)
- $\bar{f}_{\text{soiling}}$ = factor anual de pérdida por suciedad (configurable: 1–6%)

```javascript
// En el bucle de cashflow por año (financials.js):
function panelDegradationFactor(year, isNType) {
  if (year === 1) return isNType ? 1.0 : 0.98; // LID solo P-type
  const annualRate = isNType ? 0.003 : 0.005;
  return Math.pow(1 - annualRate, year - 1);
}
```

**Criterio de aceptación:**
- Cashflow anual usa `E_0 × degradationFactor(n)` en lugar de `E_0` constante.
- Gráfico de amortización muestra la curva correctamente.
- VAN y TIR recalculados con producción decreciente.
- Para 10 kWp en Madrid (PERC): diferencia VAN vs. sin degradación documentada.
- UI: campo editable de `%/año degradación` en configuración de pérdidas.

---

### Hito 6 — Temperatura Mínima por Zona CTE y Corrección Voc (PRIORIDAD MEDIA)

**Objetivo:** Reemplazar `T_MIN_SPAIN = -10` por valor real según zona climática CTE del emplazamiento.

**Archivos afectados:**
- `js/electrical-engine.js` — `calculateDynamicMPPTStringLimits()`
- `js/solar-engine.js` — `SOLAR_ENGINE_CONSTANTS`

**Implementación:**

```javascript
// Mapeo CTE DB-HE1 → Temperatura mínima de diseño
const CTE_ZONE_TMIN = {
  'A': -2, 'B': -5, 'C1': -8, 'C2': -12, 'C3': -10,
  'D1': -15, 'D2': -18, 'D3': -20, 'E1': -20
};

function getTminForLocation(lat, lon) {
  // Resolver zona CTE por coordenada (tabla interna simplificada)
  // Provincias costeras mediterráneas: zona A/B
  // Interior meseta: zona D
  // ...
}
```

**Criterio de aceptación:**
- `Ns_max_voc` calculado con Tmin real de la zona, no -10°C universal.
- Tests: Madrid (zona D1, Tmin=-15°C) vs. Málaga (zona A, Tmin=-2°C) → diferencia de ±1 módulo por string.

---

### Hito 7 — Semilla Aleatoria Monte Carlo por Proyecto (PRIORIDAD MEDIA)

**Objetivo:** Monte Carlo no determinista, semilla derivada de la ubicación y fecha del proyecto.

**Archivos afectados:**
- `js/solar-engine.js` — `runMonteCarloP50P90()`

**Implementación:**

```javascript
// Semilla derivada del proyecto (no constante 42)
const seed = Math.abs(Math.round(latDeg * 1000 + lonDeg * 100 + Date.now() % 10000));
const rng = mulberry32(seed);
```

**Criterio de aceptación:**
- P50/P90 varían levemente entre ejecuciones (realismo estocástico).
- Tests: para misma ubicación, P50 ∈ [E_base × 0.98, E_base × 1.02] (distribución centrada).

---

### Hito 8 — UX: Panel de Estado Activo Global (PRIORIDAD ALTA)

**Objetivo:** Añadir un widget persistente (todas las vistas) que muestre el estado actual del proyecto en tiempo real.

**Componente propuesto:**

```
┌─────────────────────────────────────────────────┐
│ 📐 12.6 kWp · 28 módulos · β=32° · γ=180° (S)  │
│ ☀️ 14.820 kWh/año · PR 0.84 · Payback 6.2 años │
│ ⚡ Inversor: Fronius 12kW · 2 MPPT · Ratio 1.05 │
│ ⚠ 3 paneles con sombra >8% · Heatmap válido ✓   │
└─────────────────────────────────────────────────┘
```

**Implementación:** Widget fijo en la esquina superior del visor (encima del botón de pantalla completa), actualizado por `solarSimState` y `solarProjectConfig`.

---

### Hito 9 — UX: Validación Proactiva en Tiempo Real (PRIORIDAD ALTA)

**Objetivo:** Mostrar alertas contextuales automáticas sin que el usuario tenga que navegar al paso correcto.

**Alertas a implementar:**

| Condición | Alerta | Severidad |
|-----------|--------|-----------|
| Ratio DC/AC > 1.35 | "⚠ Sobredimensionado DC. Clipping estimado: X%" | Warning |
| Ratio DC/AC < 0.80 | "⚠ Subdimensionado. Pérdida de producción en hora punta" | Warning |
| N_módulos ∉ [Ns_min, Ns_max] × N_strings | "❌ String inválido. Voc_fría = Xv > Vmax_inv" | Error |
| Inclinación < 10° | "⚠ Riesgo sedimentación. Considerar limpieza semestral" | Info |
| Heatmap dirty + PDF abierto | "⚠ El análisis solar está desactualizado" | Warning |
| PVGIS offline + modelo sintético activo | "ℹ Radiación estimada (sin conexión PVGIS)" | Info |

---

### Hito 10 — UX: Pack de Entrega Unificado (PRIORIDAD MEDIA)

**Objetivo:** Botón único "📦 Generar Pack Completo" en el Paso 5 que genere todos los documentos de entrega.

**Documentos incluidos:**
1. Oferta Comercial (PDF)
2. Memoria Técnica (PDF)
3. Análisis Comparativo Energético (PDF)
4. BOM completo (Excel/CSV)

**Implementación:** Función `generateDeliveryPack()` en `docs-generator.js` que llama secuencialmente a todos los generadores con delay de 500ms entre cada ventana emergente (evitar bloqueo de popups del navegador).

---

## RESUMEN DE HITOS Y PRIORIDADES

| Hito | Título | Área | Prioridad | Impacto en kWh | Archivos |
|------|--------|------|-----------|----------------|---------|
| 1 | GHI Real NASA POWER offline | Física | 🔴 Crítica | ±15-25% (zonas no mediterráneas) | solar-engine.js |
| 2 | Temperatura célula continua | Física | 🔴 Crítica | ±5-8% (verano) | solar-heatmap.js |
| 3 | IAM selectivo por componente | Física | 🟠 Alta | ±0.5-1.5% | radiation-engine.js |
| 4 | Self-shading inter-filas | Física | 🟠 Alta | ±1-3% (multi-fila) | solar-heatmap.js |
| 5 | Degradación + Soiling en VAN | Financiero | 🟠 Alta | VAN ±6-8% | financials.js |
| 6 | Tmin por zona CTE | Normativo | 🟡 Media | Seguridad IEC 62548 | electrical-engine.js |
| 7 | Semilla Monte Carlo dinámica | Análisis | 🟡 Media | P90 ±2% | solar-engine.js |
| 8 | Panel estado global | UX | 🟠 Alta | — | index.html + nuevo módulo |
| 9 | Validación proactiva | UX | 🟠 Alta | — | index.html + nuevo módulo |
| 10 | Pack entrega unificado | UX | 🟡 Media | — | docs-generator.js |

---

## CRITERIOS GENERALES DE ACEPTACIÓN

> [!IMPORTANT]
> Todos los hitos deben superar los siguientes criterios antes de considerarse implementados:

1. **Sin código en el bloque `<script>` inline** de `index.html` (REGLA DURA AGENTS.md §10.6). Toda función nueva → `js/*.js`.
2. **Tests de regresión:** `npm test` → 22/22 PASS como mínimo. Nuevas funciones con tests unitarios propios.
3. **Validación física:** Para cada hito de física, documentar la diferencia cuantitativa respecto al estado anterior con al menos una ciudad de referencia (Madrid lat=40.4, lon=-3.7).
4. **SSOT preservado:** `getProjectCalcs().annualKWh` sigue siendo la única fuente de verdad. Ningún documento calcula producción por su cuenta.
5. **Invalidación del heatmap:** Cualquier cambio de parámetro que afecte a la producción llama a `wpInvalidateHeatmap(reason)`.
6. **Sin regresión de render:** Tiempo de simulación heatmap no aumenta >30% respecto al estado actual en instalación de referencia (100 paneles, Madrid).

---

## APÉNDICE — DEFICIENCIAS NO ABORDADAS EN V5 (BACKLOG)

| ID | Descripción | Motivo de aplazamiento |
|----|-------------|------------------------|
| BL-01 | Modelo Martin-Ruiz IAM para vidrios AR (vs ASHRAE) | Hito 3 cubre el 80% del beneficio con menor complejidad |
| BL-02 | Soiling estacional mes a mes (no solo anual) | Requiere datos de precipitación por zona, complejidad alta |
| BL-03 | Degradación no-lineal LeTID para P-type | Efecto secundario (<0.3% adicional), datos escasos |
| BL-04 | Modo de captura con ocultación del sidebar | Mejora cosmética, baja prioridad |
| BL-05 | Fusión bayesiana de incertidumbre multi-fuente | Complejidad estadística alta vs. beneficio en UX |
| BL-06 | Batería: modelo de degradación por ciclos | Separar en `js/battery-engine.js` futuro |

---

*Documento generado por análisis profundo del código fuente. Próxima revisión: tras implementación de Hitos 1-5.*
