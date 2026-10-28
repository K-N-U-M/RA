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
assert.deepStrictEqual(E.SECCIONES.dc, [4, 6, 10, 16, 25]);
assert.strictEqual(E.SECCIONES.dc.length, E.SECCIONES.dcIz.length, 'DC: sección e Iz deben tener la misma longitud');
assert.strictEqual(E.SECCIONES.ac.length, E.SECCIONES.acIz.length, 'AC: sección e Iz deben tener la misma longitud');
const asc = (arr) => arr.every((v, i) => i === 0 || v > arr[i - 1]);
assert.ok(asc(E.SECCIONES.dc) && asc(E.SECCIONES.ac), 'Las secciones deben ser crecientes');
assert.ok(asc(E.SECCIONES.dcIz) && asc(E.SECCIONES.acIz), 'Las Iz deben ser crecientes');
console.log('  ✓ PASS: tablas DC/AC canónicas, coherentes y crecientes');

// 2. La copia inline consume la tabla del módulo (no una copia literal).
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
assert.ok(/_RA_SEC\s*&&\s*Array\.isArray\(_RA_SEC\.dc\)/.test(html), 'El inline debe leer _RA_SEC.dc');
assert.ok(/_RA_SEC\s*&&\s*Array\.isArray\(_RA_SEC\.ac\)/.test(html), 'El inline debe leer _RA_SEC.ac');
const inlineDcLiterals = (html.match(/const SEC_DC_AVAIL = \[4, 6, 10, 16, 25\]/g) || []).length;
assert.strictEqual(inlineDcLiterals, 0, 'No debe quedar la tabla DC literal en el inline');
console.log('  ✓ PASS: el inline delega en la tabla única del motor');

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
