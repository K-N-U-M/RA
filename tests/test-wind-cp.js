/**
 * tests/test-wind-cp.js
 * [AUD-2026 · E-01] Validación del límite de Betz en el catálogo eólico.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
global.window = global;
global.localStorage = { getItem: () => null, setItem: () => {} };

const vm = require('vm');
vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'js/wind/wind-catalog.js'), 'utf8'), { filename: 'wind-catalog.js' });

const Catalog = window.RAWindCatalog || window.RA.WindCatalog;
assert.ok(Catalog && typeof Catalog.validatePowerCurve === 'function', 'El catálogo debe exponer validatePowerCurve');

console.log('═════════════════════════════════════════════════════════════════════');
console.log('⚡ TEST SUITE: LÍMITE DE BETZ EN EL CATÁLOGO EÓLICO');
console.log('═════════════════════════════════════════════════════════════════════');

// 1. Una curva físicamente coherente pasa (Cp ≤ 0,593).
const good = {
  rotorDiameterM: 6.4,
  powerCurve: [
    { v: 3, p: 100 }, { v: 5, p: 900 }, { v: 8, p: 4200 }, { v: 11, p: 9000 }, { v: 25, p: 9000 }
  ]
};
const goodAudit = Catalog.validatePowerCurve(good);
assert.strictEqual(goodAudit.valid, true, `La curva coherente debe pasar (maxCp=${goodAudit.maxCp})`);
assert.ok(goodAudit.maxCp <= 0.593, 'maxCp no puede superar Betz');
console.log(`  ✓ PASS: curva coherente validada (Cp_max = ${goodAudit.maxCp})`);

// 2. El caso real del catálogo: 13,5 kW a 8 m/s con 6,4 m de rotor → Cp ≈ 1,34.
const impossible = {
  rotorDiameterM: 6.4,
  powerCurve: [{ v: 8, p: 13500 }, { v: 11, p: 25000 }]
};
const badAudit = Catalog.validatePowerCurve(impossible);
assert.strictEqual(badAudit.valid, false, 'La curva imposible debe rechazarse');
assert.ok(badAudit.maxCp > 1.0, `Debe detectar Cp > 1 (${badAudit.maxCp})`);
assert.ok(badAudit.violations.length >= 1, 'Debe listar los puntos infractores');
console.log(`  ✓ PASS: curva imposible rechazada (Cp_max = ${badAudit.maxCp}, ${badAudit.violations.length} puntos)`);

// 3. Entradas incompletas no revientan.
assert.strictEqual(Catalog.validatePowerCurve({}).valid, false);
assert.strictEqual(Catalog.validatePowerCurve({ rotorDiameterM: 0, powerCurve: [] }).valid, false);
console.log('  ✓ PASS: entradas incompletas se rechazan sin excepción');

// 4. El catálogo por defecto queda auditado y recalibrado (todos válidos con Cp <= 0.45)
const all = Catalog.getAll();
assert.ok(Array.isArray(all) && all.length > 0, 'El catálogo por defecto no puede estar vacío');
all.forEach(t => assert.ok(t.cpAudit && typeof t.cpAudit.valid === 'boolean', 'Falta cpAudit en ' + t.model));
const invalid = all.filter(t => !t.cpAudit.valid);
console.log('  ✓ PASS: ' + all.length + ' equipos auditados · ' + invalid.length + ' inválidos (todos válidos y realistas con Cp <= 0.45)');
assert.strictEqual(invalid.length, 0, 'Todas las turbinas del catálogo deben ser válidas tras la recalibración física');
all.forEach(t => assert.ok(t.cpAudit.maxCp <= 0.45, 'Cp_max (' + t.cpAudit.maxCp + ') debe ser <= 0.45 en ' + t.model));

console.log('═════════════════════════════════════════════════════════════════════');
console.log('🎉 VALIDACIÓN BETZ: TODAS LAS COMPROBACIONES PASARON');
console.log('═════════════════════════════════════════════════════════════════════');
