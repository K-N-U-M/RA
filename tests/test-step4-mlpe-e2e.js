/**
 * test-step4-mlpe-e2e.js
 * Verificación end-to-end de los automatismos de MLPE y Microinversores en Paso 4:
 * 1. Campo limpio (sin sombras, orientaciones <= 2) -> Selecciona Inversor String puro.
 * 2. Sombras parciales moderadas (8-25%, <=35% campo) -> Selecciona Optimizadores DC (Tigo).
 * 3. Sombras severas (>35% campo residencial) -> Selecciona Microinversores descentralizados.
 * 4. Cubierta compleja residencial con >=3 orientaciones distintas -> Selecciona Microinversores.
 * 5. Cubierta industrial (>25 kWp) con sombras o >=3 orientaciones -> Descarta microinversores y mantiene Inversor String Multi-MPPT.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

const elements = {};
const mockDoc = {
  readyState: 'complete',
  activeElement: null,
  addEventListener: () => {},
  getElementById: (id) => {
    if (!elements[id]) {
      elements[id] = {
        id,
        value: '',
        innerHTML: '',
        textContent: '',
        style: {},
        classList: { toggle: () => {}, add: () => {}, remove: () => {} },
        removeAttribute: () => {}
      };
    }
    return elements[id];
  },
  getElementsByName: () => []
};

const ctx = {
  window: null,
  globalThis: null,
  document: mockDoc,
  console,
  Math,
  Number,
  String,
  Boolean,
  Array,
  Object,
  Map,
  Set,
  Date,
  isFinite,
  parseFloat,
  parseInt,
  setTimeout: () => {},
  clearTimeout: () => {},
  lucide: { createIcons: () => {} }
};
ctx.window = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);

// Cargar motores
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/electrical-engine.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/project-config.js'), 'utf8'), ctx);

console.log('═════════════════════════════════════════════════════════════════════');
console.log('⚡ TEST SUITE: AUTOMATISMOS MLPE, OPTIMIZADORES Y MICROINVERSORES');
console.log('═════════════════════════════════════════════════════════════════════');

const invertersCatalog = [
  { id: 'inv_huawei_5ktl', brand: 'Huawei', model: 'SUN2000-5KTL-L1', kw: 5, mppt: 2, inputsPerMppt: 1, type: 'Monofásico', maxOverload: 1.35, price: 950 },
  { id: 'inv_huawei_10ktl', brand: 'Huawei', model: 'SUN2000-10KTL-M1', kw: 10, mppt: 2, inputsPerMppt: 1, type: 'Trifásico', maxOverload: 1.35, price: 1650 },
  { id: 'inv_huawei_30ktl', brand: 'Huawei', model: 'SUN2000-30KTL-M3', kw: 30, mppt: 4, inputsPerMppt: 2, type: 'Trifásico', maxOverload: 1.35, price: 2800 }
];
const mod = { wp: 450, voc: 41.5, vmp: 34.5, isc: 13.8, imp: 13.05 };

// ESCENARIO 1: Campo limpio (sin sombras, 1 orientación) -> Inversor String
console.log('\n[TEST 1] Campo despejado (1 orientación, 0 sombras)...');
const res1 = ctx.RA.Electrical.matchInvertersFromCatalog({
  invertersCatalog,
  module: mod,
  totalPanels: 20,
  totalKwp: 9.0,
  gridSupply: 'three_phase',
  distinctOrientations: 1,
  shadingDiagnostics: null
});
assert.strictEqual(res1.recommendedTopology, 'inverter', 'Debe recomendar Inversor String');
console.log('  ✓ PASS: Recomienda "inverter" (String Convencional) sin sobrecostes MLPE.');

// ESCENARIO 2: Sombras parciales moderadas (8-25% en <= 35% módulos) -> Optimizadores
console.log('\n[TEST 2] Campo residencial con sombra parcial moderada (3 placas de 20)...');
const shadingPartial = {
  totalPanels: 20,
  criticalLossPanelsCount: 3,
  unviablePanelsCount: 0,
  recommendation: 'selective_optimizers'
};
const res2 = ctx.RA.Electrical.matchInvertersFromCatalog({
  invertersCatalog,
  module: mod,
  totalPanels: 20,
  totalKwp: 9.0,
  gridSupply: 'three_phase',
  distinctOrientations: 1,
  shadingDiagnostics: shadingPartial
});
assert.strictEqual(res2.recommendedTopology, 'optimizer', 'Debe recomendar Optimizadores DC');
console.log(`  ✓ PASS: Recomienda "optimizer" (${res2.topologyRationale})`);

// ESCENARIO 3: Sombras severas (>35% campo) en residencial (<25 kWp) -> Microinversores
console.log('\n[TEST 3] Campo residencial con sombra crítica severa (>35% módulos)...');
const shadingSevere = {
  totalPanels: 20,
  criticalLossPanelsCount: 8,
  unviablePanelsCount: 0,
  recommendation: 'microinverters_or_full_mlpe'
};
const res3 = ctx.RA.Electrical.matchInvertersFromCatalog({
  invertersCatalog,
  module: mod,
  totalPanels: 20,
  totalKwp: 9.0,
  gridSupply: 'three_phase',
  distinctOrientations: 1,
  shadingDiagnostics: shadingSevere
});
assert.strictEqual(res3.recommendedTopology, 'microinverter', 'Debe recomendar Microinversores');
console.log(`  ✓ PASS: Recomienda "microinverter" (${res3.topologyRationale})`);

// ESCENARIO 4: Cubierta residencial compleja (3 orientaciones distintas) -> Microinversores
console.log('\n[TEST 4] Cubierta residencial compleja con 3 orientaciones distintas...');
const res4 = ctx.RA.Electrical.matchInvertersFromCatalog({
  invertersCatalog,
  module: mod,
  totalPanels: 20,
  totalKwp: 9.0,
  gridSupply: 'three_phase',
  distinctOrientations: 3,
  shadingDiagnostics: null
});
assert.strictEqual(res4.recommendedTopology, 'microinverter', 'Debe recomendar Microinversores por cubiertas múltiples');
console.log(`  ✓ PASS: Recomienda "microinverter" (${res4.topologyRationale})`);

// ESCENARIO 5: Instalación Industrial C&I (>25 kWp, e.g. 36 kWp) con sombras o 3 orientaciones -> Mantiene Inversor String Multi-MPPT
console.log('\n[TEST 5] Instalación Industrial C&I (36 kWp) con sombras severas...');
const res5 = ctx.RA.Electrical.matchInvertersFromCatalog({
  invertersCatalog,
  module: mod,
  totalPanels: 80,
  totalKwp: 36.0,
  gridSupply: 'three_phase',
  distinctOrientations: 3,
  shadingDiagnostics: shadingSevere
});
assert.strictEqual(res5.recommendedTopology, 'inverter', 'En C&I debe mantener Inversor String Multi-MPPT por viabilidad económica');
console.log(`  ✓ PASS: Descarta microinversores en C&I y mantiene "inverter" (${res5.topologyRationale})`);

console.log('\n═════════════════════════════════════════════════════════════════════');
console.log('🎉 TODOS LOS CASOS DE AUTOMATISMOS MLPE/MICROINVERSORES VERIFICADOS');
console.log('═════════════════════════════════════════════════════════════════════');
