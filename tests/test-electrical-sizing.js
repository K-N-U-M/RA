/**
 * tests/test-electrical-sizing.js
 * [AUD-2026 · F-01] El dimensionado eléctrico vive en el módulo y no cambia ni un número.
 *
 * El baseline se generó a partir de la implementación ORIGINAL del inline (extraída de
 * `git show HEAD:index.html`) y se verificó JSON-idéntica contra la versión modular antes
 * de sustituirla. Aquí se congela el resultado para detectar regresiones futuras.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

function buildContext(opts) {
  const o = opts || {};
  const ctx = {
    console, Math, Date, JSON, Number, String, Array, Object, isFinite, parseFloat, parseInt,
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
    localStorage: { getItem: () => null, setItem: () => {} }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/solar-engine.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/electrical-engine.js'), 'utf8'), ctx);

  ctx.SOLAR_ENGINE_CONSTANTS = o.withoutRho
    ? { T_AMB_MAX_SPAIN: 40, T_MIN_SPAIN: -10 }
    : { T_AMB_MAX_SPAIN: 40, T_MIN_SPAIN: -10, RHO_CU_90: 0.023 };

  ctx.raCalculateSystemPR = () => ({
    prTotal: 0.8,
    factors: { soiling: 0.025, wiring: 0.015, mismatch: 0.02, availability: 0.005, iamAngular: 0.028, spectral: 0.01, bypass: 0.025, inverter: 0.025 }
  });
  ctx.equipmentCatalog = {
    modules: [{ id: 'm1', wp: 450, Voc: 49.5, Vmp: 41.5, Isc: 11.5, Imp: 10.84, price: 95 }],
    inverters: [{ id: 'i1', kw: 10, vDcMax: 1000, vMpptMin: 200, vMpptMax: 850, mppt: 2, inputsPerMppt: 1, type: 'Trifásico', price: 1650 }],
    microinverters: [], batteries: []
  };
  ctx.solarProjectConfig = { selectedModuleId: 'm1', selectedInverterId: 'i1', autoSizing: { inverters: { count: 1 } } };
  ctx.inverterEquipmentState = { L_dc_measured: 25, L_ac_measured: 12 };
  return ctx;
}

const FIXTURES = [
  { numPanels: 12, cfg: { potencia: 450, voc: 49.5, vmp: 41.5, isc: 11.5, imp: 10.84 }, tiltDeg: 30, azimutDeg: 180, latDeg: 40.4 },
  { numPanels: 24, cfg: { potencia: 450, voc: 49.5, vmp: 41.5, isc: 11.5, imp: 10.84 }, tiltDeg: 35, azimutDeg: 170, latDeg: 40.4 },
  { numPanels: 66, cfg: { potencia: 550, voc: 50.2, vmp: 42.1, isc: 13.9, imp: 13.1 }, tiltDeg: 20, azimutDeg: 135, latDeg: 37.5 }
];

console.log('═════════════════════════════════════════════════════════════════════');
console.log('⚡ TEST SUITE: DIMENSIONADO ELÉCTRICO (equivalencia y regresión)');
console.log('═════════════════════════════════════════════════════════════════════');

const ctx = buildContext();
const E = ctx.RA.Electrical;
assert.strictEqual(typeof E.computeSizingEngineering, 'function', 'El motor debe exportar computeSizingEngineering');

// 1. Resultado idéntico al baseline congelado.
const baseline = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/electrical-sizing-baseline.json'), 'utf8'));
const current = FIXTURES.map(f => E.computeSizingEngineering(f));
// Los objetos nacen en otro contexto VM: se compara la forma serializada, no el prototipo.
assert.strictEqual(JSON.stringify(current), JSON.stringify(baseline), 'El dimensionado ha cambiado respecto al baseline');

for (const r of current) {
  for (const [k, v] of Object.entries(r)) {
    if (typeof v === 'number') assert.ok(Number.isFinite(v), `${k} no puede ser NaN/Infinity`);
  }
}
console.log('  ✓ PASS: 3 casos idénticos al baseline y sin NaN');

// 2. El delegado en app-main.js ya no contiene la implementación (solo delega).
const html = fs.readFileSync(path.join(ROOT, 'js/app-main.js'), 'utf8');
const start = html.indexOf('function computeElectricalSizingEngineering');
assert.ok(start > 0, 'Debe existir el delegado inline');
let d = 0, j = start, started = false;
for (; j < html.length; j++) {
  const c = html[j];
  if (c === '{') { d++; started = true; }
  else if (c === '}') { d--; if (started && d === 0) { j++; break; } }
}
const inlineBody = html.slice(start, j);
assert.ok(inlineBody.length < 1500, `El inline no debe contener la implementación (${inlineBody.length} chars)`);
assert.ok(/RA\.Electrical\.computeSizingEngineering/.test(inlineBody), 'Debe delegar en el módulo');
assert.ok(!/SEC_DC_AVAIL/.test(inlineBody), 'No debe conservar tablas de secciones');
console.log(`  ✓ PASS: inline reducido a delegado (${inlineBody.length} chars, antes 10.705)`);

// 3. Robustez: sin RHO_CU_90 no se propaga NaN.
const ctxNoRho = buildContext({ withoutRho: true });
const rNoRho = ctxNoRho.RA.Electrical.computeSizingEngineering(FIXTURES[0]);
assert.ok(Number.isFinite(rNoRho.dVdc_pct), `Sin constante debe usar 0,023 (${rNoRho.dVdc_pct})`);
assert.ok(rNoRho.S_str > 0, 'Debe elegir sección igualmente');
console.log(`  ✓ PASS: sin SOLAR_ENGINE_CONSTANTS.RHO_CU_90 no hay NaN (ΔV ${rNoRho.dVdc_pct} %)`);

console.log('═════════════════════════════════════════════════════════════════════');
console.log('🎉 DIMENSIONADO ELÉCTRICO: TODAS LAS COMPROBACIONES PASARON');
console.log('═════════════════════════════════════════════════════════════════════');
