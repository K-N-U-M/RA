/**
 * tests/test-shadow-flicker-sampling.js
 * [AUD-2026 · E-02] El parpadeo se evalúa todos los días y con ventana solar amplia.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
global.window = global;
global.RAWind = {};

for (const f of ['wind-constants.js', 'wind-shadow-flicker.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'js/wind', f), 'utf8'), { filename: f });
}

const F = global.RAWind.ShadowFlicker;
assert.ok(F && typeof F.evaluateAnnualShadowFlicker === 'function');

console.log('═════════════════════════════════════════════════════════════════════');
console.log('⚡ TEST SUITE: MUESTREO DE SHADOW FLICKER');
console.log('═════════════════════════════════════════════════════════════════════');

const DEG = Math.PI / 180;
const lat = 40.4, lon = -3.7;
const turbine = {
  id: 'wt1',
  positionCartographic: { longitudeRad: lon * DEG, latitudeRad: lat * DEG, altitudeM: 600 },
  supportStructure: { hubHeightM: 18 },
  _catalog: { rotorDiameterM: 6.4, bladeCount: 3, ratedPowerW: 25000, hubHeightsAvailableM: [18] }
};

// Receptor a ~45 m al este (dentro del radio de sombra y en el lindero típico).
const receptors = [{ id: 'r1', name: 'Vivienda', latDeg: lat, lonDeg: lon + 45 / (111320 * Math.cos(lat * DEG)), altitudeM: 600 }];

const t0 = Date.now();
const res = F.evaluateAnnualShadowFlicker(turbine, receptors, null);
const elapsed = Date.now() - t0;

assert.ok(res, 'Debe devolver resultado');
assert.strictEqual(res.sampling.stepDays, 1, 'Debe muestrear todos los días (antes 1 de cada 5)');
assert.strictEqual(res.sampling.daysEvaluated, 365, 'Debe cubrir 365 días');
assert.deepStrictEqual(res.sampling.windowUtcHours, [3, 22], 'Ventana solar amplia (03-22 UTC)');
assert.strictEqual(res.sampling.stepMinutes, 10, 'Paso de 10 minutos');
assert.strictEqual(res.monthlyHours.length, 12, 'Debe devolver 12 meses');
assert.ok(res.worstHoursYear >= 0 && Number.isFinite(res.worstHoursYear), 'Horas anuales numéricas');
assert.ok(typeof res.maxMinutesPerDay === 'number', 'Máximo diario numérico');
assert.ok(elapsed < 5000, `El cálculo anual debe ser asumible (${elapsed} ms)`);

console.log(`  ✓ PASS: 365 días · ventana 03-22 UTC · ${elapsed} ms · máx ${res.maxMinutesPerDay.toFixed(1)} min/día · ${res.worstHoursYear.toFixed(1)} h/año`);

// El peor receptor está identificado y la distancia es coherente (~45 m).
assert.strictEqual(res.worstReceiverName, 'Vivienda');
assert.ok(res.worstReceiverDistanceM > 30 && res.worstReceiverDistanceM < 70, `Distancia coherente (${res.worstReceiverDistanceM} m)`);
assert.ok(res.maxMinutesPerDay > 0, 'Un receptor a 45 m debe recibir algún parpadeo en el año');
console.log(`  ✓ PASS: receptor "${res.worstReceiverName}" a ${res.worstReceiverDistanceM} m con parpadeo detectado`);

// Sin turbina, respuesta vacía y consistente.
const empty = F.evaluateAnnualShadowFlicker(null, [], null);
assert.strictEqual(empty.totalHoursYear, 0);
assert.strictEqual(empty.maxMinutesDay, 0);
console.log('  ✓ PASS: sin turbina devuelve resultado vacío');

console.log('═════════════════════════════════════════════════════════════════════');
console.log('🎉 SHADOW FLICKER: TODAS LAS COMPROBACIONES PASARON');
console.log('═════════════════════════════════════════════════════════════════════');
