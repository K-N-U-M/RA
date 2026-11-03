/**
 * tests/test-wind-aep-guard.js
 * [AUD-2026 · E-01] Una curva con Cp > Betz no puede producir AEP.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
global.window = global;
global.RAWind = {};

for (const f of ['wind-constants.js', 'wind-catalog.js', 'wind-resource.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'js/wind', f), 'utf8'), { filename: f });
}

const R = global.RAWind.Resource;
assert.ok(R && typeof R.computeTurbineAEP === 'function');

console.log('═════════════════════════════════════════════════════════════════════');
console.log('⚡ TEST SUITE: GUARDA DE AEP ANTE CURVAS IMPOSIBLES');
console.log('═════════════════════════════════════════════════════════════════════');

const cfg = R.getConfig ? R.getConfig() : {
  vMeanRefMs: 6, refHeightM: 10, siteAltitudeM: 100, ambientTempC: 15,
  roughnessLengthM: 0.03, shearExponentAlpha: 0.143, weibullK: 2.0
};

function instance(cpAudit) {
  return {
    id: 't1',
    name: 'Turbina de prueba',
    supportStructure: { hubHeightM: 18 },
    operationalState: { enabled: true },
    _catalog: {
      id: 'c1', ratedPowerW: 25000, rotorDiameterM: 6.4, bladeCount: 3,
      cutInSpeedMs: 2.5, cutOutSpeedMs: 25, survivalSpeedMs: 59.5,
      powerCurve: [{ v: 8, p: 13500 }, { v: 11, p: 25000 }],
      cpAudit: cpAudit
    }
  };
}

// 1. Curva inválida → AEP 0 con motivo, nunca un número alto.
const bad = R.computeTurbineAEP(instance({ valid: false, maxCp: 1.34 }), [], cfg);
assert.strictEqual(bad.aepNetKwh, 0, 'AEP debe ser 0 con curva inválida');
assert.strictEqual(bad.aepGrossKwh, 0, 'AEP bruto debe ser 0');
assert.strictEqual(bad.invalidPowerCurve, true, 'Debe marcar la causa');
assert.ok(/Betz|0,593|inv[aá]lida/i.test(bad.warning), `Debe explicar el motivo (${bad.warning})`);
console.log(`  ✓ PASS: AEP bloqueado (0 kWh) · ${bad.warning.slice(0, 70)}…`);

// 2. Curva válida → cálculo normal (AEP > 0).
const good = R.computeTurbineAEP(instance({ valid: true, maxCp: 0.45 }), [], cfg);
assert.ok(good.aepNetKwh > 0, `Con curva válida debe haber AEP (${good.aepNetKwh})`);
assert.ok(!good.invalidPowerCurve, 'No debe marcarse como inválida');
console.log(`  ✓ PASS: curva válida produce ${Math.round(good.aepNetKwh)} kWh/año`);

// 3. El parque agrega la señal de curvas rechazadas.
const park = R.computeParkAEP([instance({ valid: false, maxCp: 1.34 })], cfg);
assert.strictEqual(park.hasInvalidCurves, true, 'El resumen del parque debe marcar curvas inválidas');
assert.strictEqual(park.invalidCurves.length, 1);
assert.strictEqual(park.totalAepNetKwh, 0, 'El parque no puede sumar AEP de una curva inválida');
console.log(`  ✓ PASS: parque marca ${park.invalidCurves.length} curva(s) inválida(s) y no suma AEP`);

// 4. El catálogo por defecto queda validado y genera producción coherente
const catalog = (global.RAWindCatalog && typeof global.RAWindCatalog.getAll === 'function')
  ? global.RAWindCatalog.getAll() : [];
assert.ok(catalog.length > 0, 'El catálogo por defecto debe cargarse');
const allValid = catalog.every(t => t.cpAudit && t.cpAudit.valid === true);
assert.ok(allValid, 'Todos los equipos del catálogo por defecto deben ser válidos físicamente');
console.log('  ✓ PASS: ' + catalog.length + ' equipos del catálogo auditados y físicamente coherentes');

console.log('═════════════════════════════════════════════════════════════════════');
console.log('🎉 GUARDA DE AEP: TODAS LAS COMPROBACIONES PASARON');
console.log('═════════════════════════════════════════════════════════════════════');
