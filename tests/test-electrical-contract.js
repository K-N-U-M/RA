/**
 * tests/test-electrical-contract.js
 * [AUD-2026 · C-02/C-05] Contrato de caída de tensión y fuente única de secciones.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

global.window = global;
global.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] };
global.localStorage = { getItem: () => null, setItem: () => {} };
global.console = console;

vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'js/electrical-engine.js'), 'utf8'), { filename: 'electrical-engine.js' });
const E = window.RA.Electrical;

console.log('═════════════════════════════════════════════════════════════════════');
console.log('⚡ TEST SUITE: CONTRATO ELÉCTRICO (ΔV y secciones)');
console.log('═════════════════════════════════════════════════════════════════════');

// 1. Tablas canónicas.
assert.ok(E.SECCIONES, 'El motor debe exponer SECCIONES');
assert.deepStrictEqual(E.SECCIONES.dc, [4, 6, 10, 16, 25, 35, 50, 70]);
assert.strictEqual(E.SECCIONES.dc.length, E.SECCIONES.dcIz.length, 'DC: sección e Iz deben tener la misma longitud');
assert.strictEqual(E.SECCIONES.ac.length, E.SECCIONES.acIz.length, 'AC: sección e Iz deben tener la misma longitud');
const asc = (arr) => arr.every((v, i) => i === 0 || v > arr[i - 1]);
assert.ok(asc(E.SECCIONES.dc) && asc(E.SECCIONES.ac), 'Las secciones deben ser crecientes');
assert.ok(asc(E.SECCIONES.dcIz) && asc(E.SECCIONES.acIz), 'Las Iz deben ser crecientes');
console.log('  ✓ PASS: tablas DC/AC canónicas, coherentes y crecientes');

// 2. [F-01] Las tablas y el dimensionado viven SOLO en el módulo; el delegado en app-main.js delega.
const appMain = fs.readFileSync(path.join(ROOT, 'js/app-main.js'), 'utf8');
assert.ok(/computeElectricalSizingEngineering[\s\S]{0,900}RA\.Electrical\.computeSizingEngineering/.test(appMain),
  'El delegado debe delegar el dimensionado en el módulo');
const inlineFn = appMain.slice(appMain.indexOf('function computeElectricalSizingEngineering'));
assert.ok(!/SEC_DC_AVAIL|IMAX_DC_ZZF|_RA_SEC/.test(inlineFn.slice(0, 1200)), 'El inline no debe conservar tablas de secciones');
const modSrc = fs.readFileSync(path.join(ROOT, 'js/electrical-engine.js'), 'utf8');
assert.ok(/computeSizingEngineering: computeSizingEngineering/.test(modSrc), 'El módulo debe exportar el dimensionado');
console.log('  ✓ PASS: tablas y dimensionado solo en el motor; inline delegado');

// 3. Criterio de ΔV en dos niveles.
const ok = E.calculateGlobalVoltageDrop(1.2, 1.2);
assert.strictEqual(ok.valid, true, '2,4 % debe cumplir');
assert.strictEqual(ok.tramosExcedenTotal, false);

const corner = E.calculateGlobalVoltageDrop(1.4, 1.4);
assert.strictEqual(corner.valid, false, '2,8 % no puede cumplir el global de 2,5 %');
assert.strictEqual(corner.tramoValid, true, 'Cada tramo de 1,4 % sí cumple su límite de 1,5 %');
assert.strictEqual(corner.tramosExcedenTotal, true, 'Debe marcar el caso "tramos OK, suma no"');

const over = E.calculateGlobalVoltageDrop(1.6, 1.2);
assert.strictEqual(over.tramoValid, false, '1,6 % incumple el límite por tramo');
assert.strictEqual(over.valid, false);
assert.strictEqual(over.limitPct, 2.5);
assert.strictEqual(over.limitTramoPct, 1.5);
console.log('  ✓ PASS: regla AND por tramo (1,5 %) y global (2,5 %) con aviso del caso límite');

// 4. La atribución normativa del badge ya no inventa un 1,5 % de ITC-BT-40.
const cable = fs.readFileSync(path.join(ROOT, 'js/cable-engine.js'), 'utf8');
assert.ok(!/ΔV TOTAL ' \+ sState\.dV_total_pct\.toFixed\(1\) \+ '% > 2\.5% \(REBT ITC-BT-40\)/.test(cable),
  'El badge no debe atribuir el 2,5 % a la ITC-BT-40');
assert.ok(/criterio de proyecto DC\+AC/.test(cable), 'El badge debe declarar el criterio de proyecto');
console.log('  ✓ PASS: atribución normativa corregida en la UI');

console.log('═════════════════════════════════════════════════════════════════════');
console.log('🎉 CONTRATO ELÉCTRICO: TODAS LAS COMPROBACIONES PASARON');
console.log('═════════════════════════════════════════════════════════════════════');
