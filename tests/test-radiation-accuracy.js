/**
 * tests/test-radiation-accuracy.js
 * [AUD-2026 · D-04/D-05] Excentricidad orbital en Erbs y rango físico de kt.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
global.window = global;
vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'js/radiation-engine.js'), 'utf8'), { filename: 'radiation-engine.js' });

const R = global.RA.Radiation;
assert.ok(R && typeof R.decomposeErbs === 'function');

console.log('═════════════════════════════════════════════════════════════════════');
console.log('⚡ TEST SUITE: PRECISIÓN DE RADIACIÓN (Erbs + excentricidad)');
console.log('═════════════════════════════════════════════════════════════════════');

const GHI = 500;
const ELEV = 30;

// 1. La corrección de excentricidad cambia kt según el día del año.
const jan = R.decomposeErbs(GHI, ELEV, 1);
const jul = R.decomposeErbs(GHI, ELEV, 182);
const noDoy = R.decomposeErbs(GHI, ELEV);

assert.ok(jan.e0 > 1 && jul.e0 < 1, `e0 debe oscilar alrededor de 1 con perihelio en enero (ene ${jan.e0.toFixed(3)}, jul ${jul.e0.toFixed(3)})`);
// Para la MISMA GHI y elevación, en enero el extraterrestre es mayor => kt menor.
assert.ok(jan.kt < jul.kt, `kt en enero (${jan.kt.toFixed(4)}) debe ser menor que en julio (${jul.kt.toFixed(4)})`);
const ratio = jul.kt / jan.kt;
assert.ok(ratio > 1.04 && ratio < 1.10, `La diferencia estacional debe rondar el 6-7 % (${((ratio - 1) * 100).toFixed(1)} %)`);
assert.ok(Math.abs(noDoy.e0 - 1) < 1e-9, 'Sin día del año, e0 = 1 (compatibilidad)');
console.log(`  ✓ PASS: kt enero ${jan.kt.toFixed(4)} vs julio ${jul.kt.toFixed(4)} (${((ratio - 1) * 100).toFixed(1)} % mayor en julio)`);

// 2. kt es un índice físico acotado.
const extreme = R.decomposeErbs(2000, 80, 182);
assert.ok(extreme.kt <= 1.0, `kt no puede superar 1 (${extreme.kt})`);
assert.ok(extreme.kt >= 0, 'kt no puede ser negativo');
const night = R.decomposeErbs(0, -5, 100);
assert.strictEqual(night.kt, 0);
assert.strictEqual(night.dhi, 0);
console.log('  ✓ PASS: kt acotado a [0, 1] y noche a cero');

// 3. La transposición usa el mismo día (no solo la desagregación).
// Se usa una GHI que no sature kt (con 700 W/m² a 25° ambos días caen en kt=1).
const pJan = R.poa(400, 40.4, 30, 0, 30, 0, 0.2, 1);
const pJul = R.poa(400, 40.4, 30, 0, 30, 0, 0.2, 182);
assert.ok(Math.abs(pJan.G_poa - pJul.G_poa) > 0.5, `La POA debe notar la corrección estacional (${pJan.G_poa.toFixed(2)} vs ${pJul.G_poa.toFixed(2)})`);
console.log(`  ✓ PASS: POA enero ${pJan.G_poa.toFixed(1)} vs julio ${pJul.G_poa.toFixed(1)} W/m²`);

// 4. Sin día del año el resultado es el histórico (no rompe llamadas existentes).
const pLegacy = R.poa(700, 40.4, 30, 0, 25, 0, 0.2);
const pNoon = R.poa(700, 40.4, 30, 0, 25, 0, 0.2, null);
assert.ok(Math.abs(pLegacy.G_poa - pNoon.G_poa) < 1e-9, 'Llamadas sin fecha deben ser idénticas');
console.log('  ✓ PASS: compatibilidad con llamadas sin fecha');

console.log('═════════════════════════════════════════════════════════════════════');
console.log('🎉 RADIACIÓN: TODAS LAS COMPROBACIONES PASARON');
console.log('═════════════════════════════════════════════════════════════════════');
