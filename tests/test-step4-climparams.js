/**
 * tests/test-step4-climparams.js
 * [AUD-2026 · H1] Los parámetros climáticos llegan de verdad al motor de strings.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

const ctx = { console, Math, Date, JSON, Number, String, Array, Object, isFinite, parseFloat, parseInt };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/electrical-engine.js'), 'utf8'), ctx);
const E = ctx.RA.Electrical;

console.log('═════════════════════════════════════════════════════════════════════');
console.log('⚡ TEST SUITE: CLIMPARAMS DEL PASO 4 (tempMinC/tempMaxCellC)');
console.log('═════════════════════════════════════════════════════════════════════');

const mod = { potencia: 450, Voc: 50.0, Vmp: 42.0, Isc: 11.5, Imp: 10.84, tempCoeffVoc: -0.0030, tempCoeffVmp: -0.0031 };
const inv = { vDcMax: 600, vMpptMin: 200, vMpptMax: 550, kw: 10, mppt: 2 };

// 1. El motor reacciona a la temperatura mínima.
const cold5 = E.calculateDynamicMPPTStringLimits(mod, inv, { Tmin: -5, TmaxCell: 70 });
const cold30 = E.calculateDynamicMPPTStringLimits(mod, inv, { Tmin: -30, TmaxCell: 70 });
assert.ok(cold30.Ns_max < cold5.Ns_max,
  `Más frío debe reducir Ns_max (${cold5.Ns_max} → ${cold30.Ns_max})`);
console.log(`  ✓ PASS: Ns_max reacciona a Tmin (−5 °C → ${cold5.Ns_max}, −30 °C → ${cold30.Ns_max})`);

// 2. matchInvertersFromCatalog traduce tempMinC/tempMaxCellC → climParams.
const engSrc = fs.readFileSync(path.join(ROOT, 'js/electrical-engine.js'), 'utf8');
assert.ok(/Tmin: options\.tempMinC/.test(engSrc), 'Debe mapear tempMinC a climParams.Tmin');
assert.ok(/TmaxCell: options\.tempMaxCellC/.test(engSrc), 'Debe mapear tempMaxCellC a climParams.TmaxCell');
console.log('  ✓ PASS: matchInvertersFromCatalog traduce tempMinC/tempMaxCellC a climParams');

// 3. Los llamadores ya no fuerzan un −5 °C por defecto (que además no se aplicaba).
const pc = fs.readFileSync(path.join(ROOT, 'js/project-config.js'), 'utf8');
const wp = fs.readFileSync(path.join(ROOT, 'js/working-plane.js'), 'utf8');
assert.ok(!/tempMinC: cfg\.tempMinC \?\? -5/.test(pc), 'project-config no debe forzar −5');
assert.ok(!/tempMinC: cfg\.tempMinC \?\? -5/.test(wp), 'working-plane no debe forzar −5');
console.log('  ✓ PASS: sin default muerto de −5 °C en los llamadores');

// 4. cable-engine pasa climParams como objeto (antes pasaba un número posicional).
const ce = fs.readFileSync(path.join(ROOT, 'js/cable-engine.js'), 'utf8');
assert.ok(/\{ Tmin: climColdC, TmaxCell: climHotC \}/.test(ce), 'cable-engine debe pasar climParams como objeto');
assert.ok(!/\(-5 - 25\)/.test(ce), 'El fallback local de frío debe estar alineado a −10 °C');
console.log('  ✓ PASS: cable-engine usa climParams objeto y −10 °C en su fallback');

console.log('═════════════════════════════════════════════════════════════════════');
console.log('🎉 CLIMPARAMS: TODAS LAS COMPROBACIONES PASARON');
console.log('═════════════════════════════════════════════════════════════════════');
