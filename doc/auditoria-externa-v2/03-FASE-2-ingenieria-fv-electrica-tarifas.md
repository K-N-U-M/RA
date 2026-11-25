# FASE 2 (Auditoría Externa v2) — Ingeniería FV, Eléctrica (REBT), Eólica y Tarifas

> **Objetivo:** Subsanar desvíos normativos y físicos (factores `Isc`/`ΔV`, CNMC 3/2020, acústica nocturna, workers, `.OND`/Bishop) y conectar los motores avanzados al SSOT del proyecto.  
> **Protocolo para IAs:** Ver [00-INDICE.md](./00-INDICE.md) y registrar cierre en [99-REGISTRO-AVANCES.md](./99-REGISTRO-AVANCES.md).

---

## Tabla de Tickets — Fase 2

| ID | Título | Sev. | Esf. | Dependencias | Estado |
| :--- | :--- | :---: | :---: | :--- | :---: |
| **V2-F2-01** | Aplicar factor `1.25× Isc` en Auto-Stringer y comprobar `DC+AC <= 2.5%` / `stringsPerTrunk` / `cosPhiAc` en REBT | P1 | M | — | `[Pendiente]` |
| **V2-F2-02** | Corregir fórmula CNMC 3/2020 mensual (35.040 cuartos de hora) en `datadis-tariff-optimizer.js` | P1 | M | — | `[Pendiente]` |
| **V2-F2-03** | Corregir `marginNightDb` (`wind-acoustics.js:243`) y generación híbrida mensual en Dossier | P1 | S | — | `[Pendiente]` |
| **V2-F2-04** | Propagar `wp`/`pNomW`/`albedo` a `solar-worker.js`, `dayOfYear` a Perez y bifacial a fallback | P1 | M | — | `[Pendiente]` |
| **V2-F2-05** | Hacer case-insensitive `.OND`, dividir `IMaxDC/nbMppt` y agregar bus AC en `bishop-iv-engine.js` | P1 | M | — | `[Pendiente]` |
| **V2-F2-06** | Integrar `Bishop`, `Datadis`, `AutoStringer`, `Bankable` y `RAEngine` (ES/PT/FR) con SSOT y PDFs | P2 | L | V2-F0-07, V2-F2-02, V2-F2-05 | `[Pendiente]` |

---

### `V2-F2-01` — Seguridad IEC 62548 (`1.25× Isc`) y Criterio Total REBT `2.5 %`
- **Estado:** `[Pendiente]`
- **Evidencia:** `js/shadow-auto-stringer.js:68-75` calcula `maxParallelByCurrent` con `iscMod` sin el factor obligatorio `1.25×` (`electrical-engine.js:739,1873`), proponiendo configuraciones bloqueadas luego por `MPPT_OVERCURRENT_ISC` (también invierte `gridA`/`gridB` en `:157-158`). En `js/electrical-engine.js:2726,2741,2765,2779,2785`: `isCompliantREBT` omite `(dVdc_pct + dVac_pct) <= 2.5`, el tronco DC subestima corriente en modo no-`parallel_y` y la caída AC fija `cosPAc = 0.95` ignorando `cosPhiAc` (`:2634`).
- **Plan:** Multiplicar `iscMod * 1.25` en `shadow-auto-stringer.js`, exigir `dVdc + dVac <= DV_MAX_TOTAL_PCT`, propagar `stringsPerTrunk` a `:2726` y usar `cosPhiAc` en los bucles AC.
- **Criterios de aceptación:** Ninguna propuesta de auto-stringing dispara violación `Isc`, e `isCompliantREBT` marca no conforme cuando `ΔVdc + ΔVac > 2,5 %`.

### `V2-F2-02` — Fórmula Oficial CNMC 3/2020 de Excesos de Potencia (12 Meses × 15 Min)
- **Estado:** `[Pendiente]`
- **Evidencia:** `js/datadis-tariff-optimizer.js:239,357,482` acumula 1 solo pico horario y aplica una raíz cuadrada anual multiplicada por `* 2.2` en vez de sumar mensualmente los 4 cuartos de hora (`Σ_m Σ_p K_p · tep · √(Σ (Pd_i - Pc_p)²)`), subestimando ~3,46× y luego distorsionando. Además la curva solar (`:303`) es horizontal plana sin inclinación/azimut ni aportación eólica.
- **Plan:** Guardar los 4 cuartos de hora por periodo y mes, evaluar los excesos exactamente mes a mes conforme a Circular CNMC 3/2020 y tomar la generación solar + eólica del proyecto activo.
- **Criterios de aceptación:** Facturación de excesos coincide con cálculo mensual por cuarto de hora para cualquier potencia contratada 3.0TD/6.1TD.

### `V2-F2-03` — Margen Acústico Nocturno Eólico y Tabla Mensual Híbrida en Dossier
- **Estado:** `[Pendiente]`
- **Evidencia:** `js/wind/wind-acoustics.js:243` calcula `limitNightDba - combinedLpDba` (nivel diurno) en lugar de `combinedLpNightDba` (nivel nocturno con curtailment). En `js/commercial-proposal-dossier.js:238-243`, `gKwh` prioriza `monthlySolarKwh[i]` sobre `_fmRow.generationKWh` (`solar + wind`), ocultando la generación eólica de la tabla mensual del Dossier Horizontal.
- **Plan:** Usar `combinedLpNightDba` en `wind-acoustics.js:243` y priorizar `_fmRow.generationKWh` cuando sea `> 0` en el Dossier.
- **Criterios de aceptación:** Proyectos híbridos FV+Eólica reflejan el total generado en Dossier y `marginNightDb` evalúa el nivel acústico nocturno real.

### `V2-F2-04` — Coherencia Física entre `solar-worker.js`, `radiation-engine.js` y Fallback
- **Estado:** `[Pendiente]`
- **Evidencia:** `js/solar-worker.js:585,431` lee `p.wp`, `pNomW` y `albedo` sin haber sido transferidos en `preparedPanels`/config (fijando ponderación igualitaria y albedo `0.20`); `js/radiation-engine.js:294` omite `o.dayOfYear` al llamar a `getPerezDiffuse()` congelando la excentricidad orbital en el día 172 (±3,3 % sesgo invernal); `js/solar-heatmap.js:1886` omite `groundSelfShadeFactor` provocando desvíos del +22 %..+122 % en bifacial frente al worker.
- **Plan:** Transferir `wp`, `pNomW` y `albedo` al worker, reenviar `o.dayOfYear` en `radiation-engine.js:294,356` y unificar la fórmula de ganancia trasera bifacial.
- **Criterios de aceptación:** Idéntico resultado de producción anual e índice bifacial ejecutando en Web Worker o en fallback de hilo principal.

### `V2-F2-05` — Robustez `.OND` PVsyst y Bus AC Agregado en Simulador Bishop I-V
- **Estado:** `[Pendiente]`
- **Evidencia:** `js/pvsyst-pan-ond-parser.js:19,127,133,137,162` busca claves con sensibilidad a mayúsculas (`VMPPMax` falla frente a `VMppMax`), asigna `IMaxDC` total del inversor a un único MPPT sin dividir por `nbMppt`, y convierte `> 10000` fallando para inversores en vatios `<= 10 kW` (`5000 W` -> `5000 kW`). Por su parte `js/bishop-iv-engine.js:276-280,298,318-321` recorta cada string independientemente contra `P_ac / N_strings` (falso clipping Este-Oeste) y usa cielo despejado sintético en vez de POA real y `rSerie`/`rShunt`.
- **Plan:** Indexar claves `.PAN/.OND` en minúsculas, dividir `IMaxDC` entre `nbMppt` salvo `IMaxDC_MPPT`, detectar vatios cuando `VAbsMax <= 1100 && PNomConv > 500`, y en Bishop agregar la potencia DC de los strings por inversor antes de aplicar `inverterEfficiency()` y clipping AC total.
- **Criterios de aceptación:** Importar cualquier `.OND` comercial puebla `vMpptMax`, `kw` e `iMaxOperA` correctos, y simulaciones Este-Oeste no sufren falso clipping por string.

### `V2-F2-06` — Cableado de Motores Avanzados al SSOT y Documentos Entregables
- **Estado:** `[Pendiente]`
- **Evidencia:** Los motores añadidos (`RABishopIVEngine`, `RADatadisOptimizer`, `RAShadowAutoStringer`, `RAEngine`) operan aislados dentro de `ux-aaa-workspace.js`: `financials.js:6542` nunca lee `RA.billAuditor.datadis8760`, `RAShadowAutoStringer.applyProposal()` no actualiza `recalculateSolarYield()` ni `BOMTreeEngine.refresh()`, `commercial-proposal-dossier.js` omite P50/P90, y `RAEngine` (`ra-sdk-plugins.js`) fija `singlePhaseMaxKw: 5.0` (vs 15 kW RD 1699) sin gobernar los cálculos web.
- **Plan:** Conectar `datadis8760` en el motor horario de `financials.js`, disparar recálculo solar + BOM al aplicar auto-stringing, incorporar resumen P50/P90 en Dossier y unificar límites del país activo (`ES/PT/FR`) como parámetro SSOT.
- **Criterios de aceptación:** Los cálculos del cajón inferior alimentan el modelo económico y los informes impresos sin contradicciones.
