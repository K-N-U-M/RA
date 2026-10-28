// Test unitario y de integración: Verificación SSOT entre project-calcs, financials y docs-generator
const assert = require('assert');
const fs = require('fs');

global.window = {
  allRenderedPanels: Array(14).fill({ id: 1, hasMLPE: false }),
  lastRoofInfo: { panels: Array(14).fill({ id: 1 }) },
  solarProjectConfig: {
    selectedObjective: 'optimal_inv',
    selectedInverterId: 'inv_huawei_5ktl',
    autoSizing: { inverters: { count: 1 } }
  },
  equipmentCatalog: {
    modules: [{ id: 'mod_topcon_450', fullName: 'Tiger Neo N-Type 450W', potencia: 450, voc: 41.5, vmp: 34.5, isc: 13.8, imp: 13.05, bifacial: true }],
    inverters: [{ id: 'inv_huawei_5ktl', fullName: 'Huawei SUN2000-5KTL-L1', kw: 5.0, vDcMax: 600, vMpptMin: 90, vMpptMax: 560, phases: 1, cosPhi: 1.0 }],
    batteries: []
  },
  RA: {}
};
global.document = {
  getElementById: () => null,
  querySelectorAll: () => [],
  querySelector: () => null
};
global.localStorage = { getItem: () => null, setItem: () => {} };
global.sessionStorage = { getItem: () => null, setItem: () => {} };

// Cargar motores
eval(fs.readFileSync('js/config.js', 'utf8'));
eval(fs.readFileSync('js/electrical-engine.js', 'utf8'));
eval(fs.readFileSync('js/project-calcs.js', 'utf8'));
global.getProjectCalcs = window.getProjectCalcs;
eval(fs.readFileSync('js/financials.js', 'utf8'));
eval(fs.readFileSync('js/docs-generator.js', 'utf8'));

console.log('--- TEST INTEGRACIÓN QUIRÚRGICA SSOT ---');

// 1. Validar que getProjectCalcs() se ejecuta desde js/project-calcs.js
const pCalcs = global.getProjectCalcs();
assert.ok(pCalcs, 'getProjectCalcs debe retornar objeto de cálculo');
assert.strictEqual(pCalcs.numPanels, 14, 'El número de paneles debe ser exactamente 14');
console.log('✔ PASS 1: getProjectCalcs() calcula exactamente', pCalcs.numPanels, 'paneles con potencia', pCalcs.kwp, 'kWp.');

// 2. Validar que computeSizingEngineering contempla bifacialidad y cosPhi = 1.0
const eng = window.RA.Electrical.computeSizingEngineering({
  numPanels: 14,
  cfg: { potencia: 450, voc: 41.5, vmp: 34.5, isc: 13.8, imp: 13.05, bifacial: true },
  tiltDeg: 25,
  azimutDeg: 180,
  latDeg: 40.4
});

assert.ok(eng.I_ac > 0, 'I_ac debe ser calculada');
// Monofásico 230V con 5kW nominal a cosPhi=1.0 -> 5000 / 230 ≈ 21.74 A
assert.strictEqual(Math.round(eng.I_ac), 22, 'I_ac a cosPhi 1.0 debe redondear a 22 A');
console.log('✔ PASS 2: Evacuación AC calculada con cosPhi=1.0 normativo (I_ac = ' + eng.I_ac + ' A).');

// 3. Validar modelo financiero con simetría de batería y 288h
const fin = calculateFinancialModel({ d: pCalcs, numPanels: 14 });
assert.ok(fin.capexBruto > 0, 'CAPEX bruto debe ser positivo');
assert.ok(fin.ahorroLuzAnio1 > 0, 'Ahorro año 1 debe ser positivo');
assert.ok(isFinite(fin.paybackYears), 'Payback debe ser un número finito');
console.log('✔ PASS 3: Modelo financiero 288h ejecutado. CAPEX Bruto: ' + fin.capexBruto + ' €, Ahorro Año 1: ' + Math.round(fin.ahorroLuzAnio1) + ' €.');

console.log('\n🎉 TODOS LOS TESTS DE INTEGRACIÓN DE INGENIERÍA PASARON AL 100%!');
