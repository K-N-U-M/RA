/**
 * tests/test-wind-structural.js
 * [AUD-2026 · E-03] El dictamen estructural no puede declarar "seguro" sin geotecnia.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
global.window = global;
global.RAWind = {};

vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'js/wind/wind-constants.js'), 'utf8'), { filename: 'wind-constants.js' });
vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'js/wind/wind-structural.js'), 'utf8'), { filename: 'wind-structural.js' });

const S = global.RAWind.Structural;
assert.ok(S && typeof S.evaluateStructuralSafety === 'function');

console.log('═════════════════════════════════════════════════════════════════════');
console.log('⚡ TEST SUITE: DICTAMEN ESTRUCTURAL EÓLICO (geotecnia)');
console.log('═════════════════════════════════════════════════════════════════════');

function makeTurbine(extra) {
  return Object.assign({
    mountingType: 'ground',
    supportStructure: { hubHeightM: 18 },
    _catalog: {
      ratedPowerW: 25000,
      rotorDiameterM: 6.4,
      bladeCount: 3,
      survivalSpeedMs: 59.5,
      ratedSpeedMs: 11,
      structural: { nacelleMassKg: 280, rotorMassKg: 95, maxThrustKn: 18, naturalFrequencyHz: 0.8 }
    }
  }, extra || {});
}

// 1. Sin geotecnia: nunca "segura", pero sí predimensionable.
const noGeo = S.evaluateStructuralSafety(makeTurbine(), null);
assert.ok(noGeo, 'Debe devolver informe');
assert.strictEqual(noGeo.isSafe, false, 'Sin presión admisible no puede declararse segura');
assert.strictEqual(noGeo.requiresGeotechnicalStudy, true, 'Debe exigir estudio geotécnico');
assert.ok(/geot[eé]cnico/i.test(noGeo.structuralWarning || ''), 'El aviso debe explicar la falta de geotecnia');
assert.ok(typeof noGeo.foundation.eccentricityM === 'number', 'Debe publicar la excentricidad');
assert.ok(typeof noGeo.foundation.coreLimitM === 'number', 'Debe publicar el límite del núcleo L/6');
assert.strictEqual(noGeo.foundation.hasUpliftRisk, noGeo.foundation.eccentricityM > noGeo.foundation.coreLimitM,
  'El despegue debe derivarse de e > L/6');
console.log(`  ✓ PASS: sin geotecnia isSafe=false · e=${noGeo.foundation.eccentricityM} m vs L/6=${noGeo.foundation.coreLimitM} m · despegue=${noGeo.foundation.hasUpliftRisk}`);

// 2. Con geotecnia: se evalúa de verdad.
const withGeo = S.evaluateStructuralSafety(makeTurbine({ bearingCapacityKpa: 300 }), null);
assert.strictEqual(withGeo.requiresGeotechnicalStudy, false, 'Con dato geotécnico no debe exigirlo');
assert.strictEqual(withGeo.foundation.bearingCapacityKpa, 300);
assert.strictEqual(typeof withGeo.foundation.meetsBearingCapacity, 'boolean');
console.log(`  ✓ PASS: con 300 kPa se calcula presión (cumple=${withGeo.foundation.meetsBearingCapacity}) · isSafe=${withGeo.isSafe}`);

// 3. Coherencia: isSafe implica estabilidad preliminar y geotecnia.
assert.ok(!withGeo.isSafe || (withGeo.preliminarilyStable === true), 'isSafe no puede ser true sin estabilidad preliminar');
assert.ok(!noGeo.isSafe, 'Sin geotecnia isSafe debe ser siempre false');
console.log('  ✓ PASS: isSafe nunca contradice la estabilidad preliminar');

console.log('═════════════════════════════════════════════════════════════════════');
console.log('🎉 DICTAMEN ESTRUCTURAL: TODAS LAS COMPROBACIONES PASARON');
console.log('═════════════════════════════════════════════════════════════════════');
