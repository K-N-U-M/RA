/**
 * tests/test-production-source.js
 * [AUD-2026 · D-01/D-02/D-06] Trazabilidad y coherencia del dato de producción.
 *
 * - El motor físico debe devolver 12 meses coherentes con el total anual.
 * - `getProjectCalcs` debe declarar de dónde sale el kWh/año.
 * - Sin modelo financiero no se inventa ahorro.
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

const ctx = { window: global, document: global.document, localStorage: global.localStorage, console, Math, Date };
ctx.window = global;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/solar-engine.js'), 'utf8'), ctx);

const runPhysicalModel = ctx.runPhysicalModel || global.runPhysicalModel;
assert.strictEqual(typeof runPhysicalModel, 'function', 'runPhysicalModel debe estar disponible');

console.log('═════════════════════════════════════════════════════════════════════');
console.log('⚡ TEST SUITE: FUENTE DE PRODUCCIÓN Y COHERENCIA MENSUAL');
console.log('═════════════════════════════════════════════════════════════════════');

// 1. Motor físico: 12 meses, suma ≈ anual, perfil estacional creíble.
const ph = runPhysicalModel(5, 40.4, -3.7, 30, 180, { potencia: 450, tecnologia: 'N-Type' }, null);
assert.ok(ph && Number.isFinite(ph.annualKWh) && ph.annualKWh > 3000, `Producción física creíble (${ph.annualKWh} kWh)`);
assert.strictEqual(ph.monthlyKWh.length, 12, 'Debe devolver 12 meses');
assert.ok(ph.monthlyKWh.every(v => Number.isFinite(v) && v >= 0), 'Meses numéricos');
const sumM = ph.monthlyKWh.reduce((a, b) => a + b, 0);
assert.ok(Math.abs(sumM - ph.annualKWh) / ph.annualKWh < 0.02, `Suma mensual (${sumM}) ≈ anual (${ph.annualKWh})`);
assert.ok(ph.monthlyKWh[6] > ph.monthlyKWh[0] * 1.5, 'Julio debe superar claramente a enero en el hemisferio norte');
console.log(`  ✓ PASS: ${ph.annualKWh} kWh/año · julio ${ph.monthlyKWh[6]} vs enero ${ph.monthlyKWh[0]}`);

// 2. Fuente declarada en el SSOT y resolución externalizada (F-01).
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
assert.ok(/let productionSource = 'fallback-seasonal'/.test(html), 'Debe inicializarse la fuente como fallback');
assert.ok(/RAProduction\.resolve\(/.test(html), 'getProjectCalcs debe delegar la prioridad en RAProduction');
assert.ok(/productionSource = _prodResolved\.source/.test(html), 'La fuente resuelta debe propagarse');
assert.ok(/productionSource,/.test(html), 'La fuente debe viajar en getProjectCalcs()');

const prodSrc = fs.readFileSync(path.join(ROOT, 'js/production-source.js'), 'utf8');
assert.ok(/source: 'simulation'/.test(prodSrc) && /source: 'physical'/.test(prodSrc), 'El módulo debe declarar ambas fuentes');
assert.ok(/function signature\(/.test(prodSrc) && /_cache\[sig\]/.test(prodSrc), 'El modelo físico debe memoizarse');
assert.ok(/root\.runPhysicalModel/.test(prodSrc), 'Debe usar el motor físico del proyecto');
console.log('  ✓ PASS: prioridad simulation → physical → fallback externalizada y memoizada');

// 3. El documento refleja la fuente.
const docs = fs.readFileSync(path.join(ROOT, 'js/docs-generator.js'), 'utf8');
assert.ok(/productionSource === 'simulation'/.test(docs), 'La memoria debe distinguir simulación');
assert.ok(/fuente: /.test(docs), 'La memoria debe imprimir la fuente de producción');
console.log('  ✓ PASS: la memoria técnica imprime la procedencia del dato');

// 4. Sin modelo financiero no se inventa ahorro.
assert.ok(!/Math\.round\(annualKWh \* 0\.14\)/.test(html), 'No debe quedar el ahorro de reserva con 0,14 €/kWh');
assert.ok(/const ahorro_anual = \(_cachedFin/.test(html), 'El ahorro debe venir del modelo financiero');
console.log('  ✓ PASS: sin modelo no hay ahorro inventado');

console.log('═════════════════════════════════════════════════════════════════════');
console.log('🎉 FUENTE DE PRODUCCIÓN: TODAS LAS COMPROBACIONES PASARON');
console.log('═════════════════════════════════════════════════════════════════════');
