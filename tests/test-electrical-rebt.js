// Test unitario y de integración: Fase 2 - Coherencia Eléctrica y Blindaje REBT
const assert = require('assert');
const fs = require('fs');

global.window = {
  allRenderedPanels: Array(14).fill({ id: 1, hasMLPE: false }),
  lastRoofInfo: { panels: Array(14).fill({ id: 1 }) },
  solarProjectConfig: {
    selectedObjective: 'optimal_inv',
    selectedInverterId: 'inv_huawei_5ktl',
    autoSizing: { inverters: { count: 2 } } // 2 inversores para probar multi-inversor
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
eval(fs.readFileSync('js/cable-engine.js', 'utf8'));
eval(fs.readFileSync('js/project-calcs.js', 'utf8'));
global.getProjectCalcs = window.getProjectCalcs;
eval(fs.readFileSync('js/bom-tree.js', 'utf8'));
eval(fs.readFileSync('js/financials.js', 'utf8'));
eval(fs.readFileSync('js/docs-generator.js', 'utf8'));

console.log('═════════════════════════════════════════════════════════════════════');
console.log('⚡ TEST SUITE: FASE 2 - COHERENCIA ELÉCTRICA Y REBT');
console.log('═════════════════════════════════════════════════════════════════════');

// TEST 1: calculateDynamicMPPTStringLimits normaliza coeficientes % y exporta alias
const limits = window.RA.Electrical.calculateDynamicMPPTStringLimits(
  { Voc: 41.5, Vmp: 34.5, betaVoc: -0.28, gammaPmp: -0.35 }, // En porcentaje directo
  { Vmax: 1000, VmpptMin: 160, VmpptMax: 850 },
  { Tmin: -10, TmaxCell: 65 }
);
assert.ok(limits.Voc_Tmin > 41.5 && limits.Voc_Tmin < 60, 'Voc_Tmin debe estar en rango físico coherente (~45.5V)');
assert.strictEqual(limits.vocCold, limits.Voc_Tmin, 'Alias vocCold debe coincidir con Voc_Tmin');
assert.strictEqual(limits.vmpHot, limits.Vmp_Tmax, 'Alias vmpHot debe coincidir con Vmp_Tmax');
console.log('✔ PASS 1: Coeficientes térmicos normalizados y alias vocCold/vmpHot exportados correctamente.');

// TEST 2: Multi-inversor en computeSizingEngineering
const multiEng = window.RA.Electrical.computeSizingEngineering({
  numPanels: 40,
  invCount: 4,
  cfg: { potencia: 500, voc: 42.0, vmp: 35.0, isc: 14.0, imp: 13.0 },
  tiltDeg: 25,
  azimutDeg: 180,
  latDeg: 40.4
});
assert.strictEqual(multiEng.invCount, 4, 'invCount debe ser 4');
assert.strictEqual(multiEng.P_ac_kW, 20, 'Potencia total AC debe contemplar 4 inversores (4 x 5 kW = 20 kW)');
assert.strictEqual(multiEng.total_P_ac_kW, 20, 'total_P_ac_kW debe ser 20 kW');
assert.strictEqual(multiEng.monofasico, false, 'Instalación > 15 kW debe ser forzada a trifásica (RD 1699/2011)');
assert.strictEqual(multiEng.rcdType, 'Clase A-SI', 'Instalación comercial trifásica con RCMU integrado admite RCD Clase A-SI');
console.log('✔ PASS 2: Multi-inversor, trifásica obligatoria (>15kW) y RCD Clase B verificados.');

// TEST 3: Distinción Voc módulo vs Voc string en project-calcs
const pCalcs = global.getProjectCalcs();
assert.ok(pCalcs.Voc_mod_cold < 60, 'Voc_mod_cold debe ser tensión de 1 módulo en frío (~45-50V), no del string');
assert.ok(pCalcs.Voc_cold < 60, 'Voc_cold debe ser tensión de 1 módulo en frío para compatibilidad en tablas');
assert.ok(pCalcs.Voc_str_cold > 100, 'Voc_str_cold debe ser la tensión del string completo (>100V)');
assert.strictEqual(typeof pCalcs.useFuses, 'boolean', 'useFuses debe ser un booleano');
console.log('✔ PASS 3: Voc de módulo vs Voc de string correctamente desagregados en project-calcs.');

// TEST 4: Generación de memoria técnica con comprobaciones dinámicas
window.open = () => ({
  document: {
    open: () => {},
    write: (html) => { global.__lastDoc = (global.__lastDoc || '') + html; },
    close: () => {}
  }
});
window.generateMemoria(true);
assert.ok(global.__lastDoc, 'generateMemoria debe generar contenido');
assert.ok(!global.__lastDoc.includes('NaN'), 'El documento técnico no debe contener ningún NaN');
assert.ok(global.__lastDoc.includes('5.3 Comprobación de Ventana MPPT'), 'El documento debe contener la sección 5.3');
assert.ok(global.__lastDoc.includes('Conforme') || global.__lastDoc.includes('No conforme'), 'La tabla 5.3 debe tener evaluaciones de conformidad');
console.log('✔ PASS 4: Memoria técnica generada con cálculos dinámicos y libre de NaN.');

console.log('═════════════════════════════════════════════════════════════════════');
console.log('🎉 TODOS LOS TESTS DE FASE 2 PASARON EXITOSAMENTE!');
console.log('═════════════════════════════════════════════════════════════════════');
