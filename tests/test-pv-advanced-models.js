/**
 * tests/test-pv-advanced-models.js
 * Pruebas unitarias de Fase 3.5 (window.RAPVAdvanced):
 *   1. Solver numérico 1-diodo (5 parámetros De Soto / Bishop) por 3 sub-strings con diodo bypass
 *   2. Modelo Bifacial 2D por Factores de Vista (altura libre h, GCR/pitch, albedo)
 *   3. Pérdidas desacopladas bancables (Soiling por lluvia, LID/LeTID Año 1 vs degradación lineal)
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
global.window = global;
global.RA = global.RA || {};

vm.runInThisContext(
  fs.readFileSync(path.join(ROOT, 'js/pv-advanced-models.js'), 'utf8'),
  { filename: 'pv-advanced-models.js' }
);

const PV = global.RAPVAdvanced;
assert.ok(PV && global.RA.PVAdvanced === PV, 'window.RAPVAdvanced debe quedar expuesto');

console.log('═════════════════════════════════════════════════════════════════════');
console.log('🔬 TEST SUITE: MODELOS AVANZADOS FV AAA (I-V / BIFACIAL / LID+SOILING)');
console.log('═════════════════════════════════════════════════════════════════════');

// ── 1. Solver 1-Diodo (De Soto / Bishop) + 3 Sub-strings Bypass ──────────────
const trina450 = { voc: 52.9, isc: 10.74, vmp: 44.6, imp: 10.09, tempCoeffVoc: -0.24, tempCoeffPmax: -0.30 };
const aiko455  = { voc: 40.8, isc: 14.10, vmp: 34.2, imp: 13.30, tempCoeffVoc: -0.22, tempCoeffPmax: -0.26 };

const stcTrina = PV.extractDeSotoParameters(trina450);
assert.ok(stcTrina.iLRef > 10 && stcTrina.i0Ref > 0 && stcTrina.rsRef > 0 && stcTrina.rshRef > 20, '5 parámetros De Soto válidos');

const ivStc = PV.computeModuleIVCurve(trina450, { subIrradiances: [1000, 1000, 1000], subTempsC: 25 });
assert.ok(Math.abs(ivStc.voc - trina450.voc) < 0.5, `Voc STC coherente (${ivStc.voc} vs ${trina450.voc})`);
assert.ok(Math.abs(ivStc.isc - trina450.isc) < 0.25, `Isc STC coherente (${ivStc.isc} vs ${trina450.isc})`);
const nomPmp = trina450.vmp * trina450.imp;
assert.ok(Math.abs(ivStc.pmp - nomPmp) / nomPmp < 0.015, `Pmp STC calibrada <1.5% (${ivStc.pmp} vs ${nomPmp.toFixed(2)})`);
assert.ok(ivStc.ff > 0.72 && ivStc.ff < 0.86, `Fill Factor realista (${ivStc.ff})`);
console.log(`  ✓ PASS: Calibración STC De Soto Trina 450W -> Pmp=${ivStc.pmp} W, Voc=${ivStc.voc} V, Isc=${ivStc.isc} A, FF=${ivStc.ff}`);

// Verificar también módulo 54 células (Aiko)
const ivAiko = PV.computeModuleIVCurve(aiko455, { subIrradiances: 1000, subTempsC: 25 });
const nomAiko = aiko455.vmp * aiko455.imp;
assert.ok(Math.abs(ivAiko.pmp - nomAiko) / nomAiko < 0.015, `Pmp STC Aiko calibrada (${ivAiko.pmp} vs ${nomAiko.toFixed(2)})`);

// Sensibilidad térmica (55 °C vs 25 °C)
const ivHot = PV.computeModuleIVCurve(trina450, { subIrradiances: [1000, 1000, 1000], subTempsC: 55 });
assert.ok(ivHot.voc < ivStc.voc - 2.0, `Voc a 55°C (${ivHot.voc}V) debe caer respecto a STC (${ivStc.voc}V)`);
assert.ok(ivHot.pmp < ivStc.pmp * 0.94, `Pmp a 55°C (${ivHot.pmp}W) debe sufrir pérdida térmica`);
console.log(`  ✓ PASS: Derating térmico 55°C -> Voc=${ivHot.voc} V, Pmp=${ivHot.pmp} W`);

// Sombreado parcial en 1 de 3 sub-strings ([1000, 1000, 200]): bypass activo y multi-pico P-V
const ivShade1 = PV.computeModuleIVCurve(trina450, { subIrradiances: [1000, 1000, 200], subTempsC: 25 });
assert.ok(ivShade1.localPeaks.length >= 2, `Sombreado parcial debe generar >=2 picos P-V (obtenidos ${ivShade1.localPeaks.length})`);
// Sin bypass, la potencia estaría limitada al 20% (~90 W); con bypass de 2/3 activos debe superar ~250 W
assert.ok(ivShade1.pmp > nomPmp * 0.55 && ivShade1.pmp < nomPmp * 0.72, `Diodo bypass rescata ~2/3 de potencia (${ivShade1.pmp} W)`);
console.log(`  ✓ PASS: Sombreado parcial [1000,1000,200] -> ${ivShade1.localPeaks.length} picos P-V, Pmp=${ivShade1.pmp} W (bypass activo)`);

// Sombreado escalonado en 3 sub-strings ([1000, 600, 200])
const ivShade3 = PV.computeModuleIVCurve(trina450, { subIrradiances: [1000, 600, 200], subTempsC: 25 });
assert.ok(ivShade3.localPeaks.length >= 2, `Sombreado escalonado [1000,600,200] genera múltiples picos (${ivShade3.localPeaks.length})`);

// Comparativa String vs MLPE (8 módulos, 2 con sombra parcial)
const strMods = [
  { moduleSpec: trina450, subIrradiances: [1000, 1000, 1000] },
  { moduleSpec: trina450, subIrradiances: [1000, 1000, 1000] },
  { moduleSpec: trina450, subIrradiances: [1000, 1000, 1000] },
  { moduleSpec: trina450, subIrradiances: [1000, 1000, 1000] },
  { moduleSpec: trina450, subIrradiances: [1000, 1000, 1000] },
  { moduleSpec: trina450, subIrradiances: [1000, 1000, 1000] },
  { moduleSpec: trina450, subIrradiances: [450, 350, 250] },
  { moduleSpec: trina450, subIrradiances: [400, 300, 200] }
];
const cmp = PV.computeStringComparison(strMods);
assert.ok(cmp.mlpeTotalPmpW > cmp.stringGlobalPmpW, `MLPE (${cmp.mlpeTotalPmpW}W) debe superar a string bajo sombra heterogénea (${cmp.stringGlobalPmpW}W)`);
assert.ok(cmp.mlpeGainPct > 1.0, `Ganancia MLPE positiva (${cmp.mlpeGainPct}%)`);
console.log(`  ✓ PASS: String (${cmp.stringGlobalPmpW} W) vs MLPE (${cmp.mlpeTotalPmpW} W) -> Ganancia MLPE +${cmp.mlpeGainPct}%`);

// ── 2. Modelo Bifacial 2D por Factores de Vista ──────────────────────────────
const vfBase = PV.computeBifacialViewFactors({
  tiltDeg: 25,
  clearanceHeightM: 0.80,
  moduleLengthM: 2.0,
  pitchM: 4.5,
  albedo: 0.35,
  ghi: 850,
  dhi: 180,
  dni: 780,
  sunElevDeg: 52,
  sunAzSurDeg: 0,
  panelAzSurDeg: 0,
  bifacialityFactor: 0.80
});
const vfSum = vfBase.vfRearToSky + vfBase.vfRearToGround + vfBase.vfRearToAdjacentRows;
assert.ok(Math.abs(vfSum - 1.0) < 0.025, `Conservación de energía en Factores de Vista (sum=${vfSum.toFixed(4)})`);
assert.ok(vfBase.gRear > 20 && vfBase.bifacialGain > 0.03 && vfBase.bifacialGain < 0.30, `Ganancia bifacial realista (${vfBase.bifacialGainPct}%)`);

// Monotonía en altura libre h
const vfLowH = PV.computeBifacialViewFactors({ tiltDeg: 25, clearanceHeightM: 0.15, moduleLengthM: 2.0, pitchM: 4.5, albedo: 0.35, ghi: 850, dhi: 180, dni: 780, sunElevDeg: 52 });
const vfHighH = PV.computeBifacialViewFactors({ tiltDeg: 25, clearanceHeightM: 1.50, moduleLengthM: 2.0, pitchM: 4.5, albedo: 0.35, ghi: 850, dhi: 180, dni: 780, sunElevDeg: 52 });
assert.ok(vfHighH.gRear > vfBase.gRear && vfBase.gRear > vfLowH.gRear, `G_rear crece con altura h (${vfLowH.gRear} < ${vfBase.gRear} < ${vfHighH.gRear})`);

// Monotonía en albedo
const vfWhiteRoof = PV.computeBifacialViewFactors({ tiltDeg: 25, clearanceHeightM: 0.80, moduleLengthM: 2.0, pitchM: 4.5, albedo: 0.65, ghi: 850, dhi: 180, dni: 780, sunElevDeg: 52 });
assert.ok(vfWhiteRoof.gRear > vfBase.gRear, `Mayor albedo aumenta G_rear (${vfWhiteRoof.gRear} > ${vfBase.gRear})`);

// Monotonía en GCR / pitch
const vfDenseGcr = PV.computeBifacialViewFactors({ tiltDeg: 25, clearanceHeightM: 0.80, moduleLengthM: 2.0, gcr: 0.78, albedo: 0.35, ghi: 850, dhi: 180, dni: 780, sunElevDeg: 52 });
assert.ok(vfDenseGcr.gRear < vfBase.gRear, `Mayor GCR (pitch compacto) reduce G_rear (${vfDenseGcr.gRear} < ${vfBase.gRear})`);
console.log(`  ✓ PASS: View Factors 2D (ΣVF=${vfSum.toFixed(3)}, G_rear=${vfBase.gRear} W/m², Gain=+${vfBase.bifacialGainPct}%, monociclos h/albedo/GCR OK)`);

// ── 3. Pérdidas Desacopladas Bancables (Soiling lluvia + LID/LeTID vs Lineal) ──
const soilAtlantic = PV.computeRainDependentSoiling({ climateZone: 'atlantico', tiltDeg: 25, environment: 'urban' });
const soilArid     = PV.computeRainDependentSoiling({ climateZone: 'arido', tiltDeg: 25, environment: 'urban' });
const soilFlat     = PV.computeRainDependentSoiling({ climateZone: 'interior', tiltDeg: 3, environment: 'urban' });
const soilSteep    = PV.computeRainDependentSoiling({ climateZone: 'interior', tiltDeg: 35, environment: 'urban' });

assert.strictEqual(soilAtlantic.monthlySoilingLoss.length, 12);
assert.ok(soilArid.annualSoilingLoss > soilAtlantic.annualSoilingLoss, `Clima árido (${soilArid.annualSoilingLoss}) ensucia más que atlántico (${soilAtlantic.annualSoilingLoss})`);
assert.ok(soilFlat.annualSoilingLoss > soilSteep.annualSoilingLoss, `Menor inclinación (${soilFlat.annualSoilingLoss}) ensucia más que 35° (${soilSteep.annualSoilingLoss})`);
assert.ok(soilArid.monthlySoilingLoss[6] > soilArid.monthlySoilingLoss[10], 'Julio seco tiene mayor soiling que noviembre lluvioso');
console.log(`  ✓ PASS: Soiling dinámico por lluvia (Atlántico ${(soilAtlantic.annualSoilingLoss*100).toFixed(2)}% vs Árido ${(soilArid.annualSoilingLoss*100).toFixed(2)}%)`);

const degPerc   = PV.computeLidAndDegradation({ technology: 'PERC', years: 25 });
const degTopcon = PV.computeLidAndDegradation({ technology: 'TOPCON', years: 25 });
const degHjt    = PV.computeLidAndDegradation({ technology: 'HJT', years: 25 });

assert.ok(degPerc.year1CombinedLoss > degTopcon.year1CombinedLoss && degTopcon.year1CombinedLoss > degHjt.year1CombinedLoss, 'LID/LeTID Año 1: PERC > TOPCon > HJT');
assert.strictEqual(degTopcon.schedule.length, 25);
assert.strictEqual(degTopcon.schedule[0].linearAgingFactor, 1, 'Año 1 aplica LID/LeTID separado sin doble degradación lineal');
assert.ok(Math.abs(degTopcon.schedule[0].retainedFactor - (1 - degTopcon.year1CombinedLoss)) < 1e-4, 'Año 1 coincide con paso LID+LeTID');
assert.ok(Math.abs(degTopcon.schedule[1].linearAgingFactor - (1 - degTopcon.annualLinearDeg)) < 1e-4, 'Año 2 aplica pendiente lineal anual');

const lossTree = PV.computeBankableLossTree({ climateZone: 'interior', tiltDeg: 20, technology: 'TOPCON', hasMlpe: false });
assert.ok(lossTree.prYear1 < lossTree.prOperational && lossTree.prYear1 > 0.65 && lossTree.prOperational < 0.92,
  `Árbol bancable coherente (PR_op=${lossTree.prOperational}, PR_Y1=${lossTree.prYear1})`);
console.log(`  ✓ PASS: LID/LeTID desacoplado + Árbol bancable (PR_op=${(lossTree.prOperational*100).toFixed(1)}%, PR_Y1=${(lossTree.prYear1*100).toFixed(1)}%)`);

console.log('═════════════════════════════════════════════════════════════════════');
console.log('🎉 MODELOS AVANZADOS FV: TODAS LAS COMPROBACIONES PASARON');
console.log('═════════════════════════════════════════════════════════════════════');
