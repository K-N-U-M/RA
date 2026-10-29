/**
 * tests/test-rd1699-grid-phase.js
 * Verificación de cumplimiento del Art. 12.2 del Real Decreto 1699/2011
 * (en su redacción vigente tras la modificación introducida por el RD 244/2019):
 * 
 * "Si la potencia nominal de la instalación de generación a conectar a la red de
 *  distribución es superior a 15 kW, la conexión de la instalación a la red será
 *  trifásica con un desequilibrio entre fases inferior a 5 kW."
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

console.log('═════════════════════════════════════════════════════════════════════');
console.log('⚡ TEST SUITE: CUMPLIMIENTO RD 1699/2011 ART. 12.2 (CONEXIÓN TRIFÁSICA >15 kW)');
console.log('═════════════════════════════════════════════════════════════════════\n');

// 1. Cargar electrical-engine en un entorno controlado
const eleCtx = {
  window: {},
  panelConfig: {},
  console: console
};
eleCtx.window.panelConfig = eleCtx.panelConfig;
eleCtx.window.solarProjectConfig = {};
vm.createContext(eleCtx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/electrical-engine.js'), 'utf8'), eleCtx);

const Electrical = eleCtx.window.RA.Electrical;
const matchInvertersFromCatalog = eleCtx.window.matchInvertersFromCatalog;

assert.ok(typeof matchInvertersFromCatalog === 'function', 'matchInvertersFromCatalog debe estar definida');

// Catálogo de prueba con inversores monofásicos y trifásicos
const mockInverters = [
  { id: 'inv_mono_5', brand: 'Growatt', model: 'MIN 5000TL-X', kw: 5.0, type: 'Inversor Monofásico Residencial', mppt: 2, maxOverload: 1.35, vDcMax: 550, vMpptNomMin: 100, vMpptNomMax: 500 },
  { id: 'inv_mono_8', brand: 'Solis', model: 'S6-GR1P8K', kw: 8.0, type: 'Inversor Monofásico Comercial', mppt: 2, maxOverload: 1.35, vDcMax: 600, vMpptNomMin: 120, vMpptNomMax: 520 },
  { id: 'inv_tri_10', brand: 'Huawei', model: 'SUN2000-10KTL-M1', kw: 10.0, type: 'Inversor Trifásico Híbrido', mppt: 2, maxOverload: 1.35, vDcMax: 1100, vMpptNomMin: 200, vMpptNomMax: 850 },
  { id: 'inv_tri_20', brand: 'Huawei', model: 'SUN2000-20KTL-M2', kw: 20.0, type: 'Inversor Trifásico Comercial', mppt: 4, maxOverload: 1.35, vDcMax: 1100, vMpptNomMin: 200, vMpptNomMax: 850 }
];

const mockModule = {
  id: 'mod_580',
  brand: 'Futuresun',
  model: 'FS-580N10-72',
  wp: 580,
  voc: 50.8,
  vmp: 42.4,
  isc: 14.2,
  imp: 13.68
};

// TEST 1: Instalación de 18 kWp con gridSupply = 'single_phase'
console.log('▶ TEST 1: Rechazo de conexión monofásica si P > 15 kW (RD 1699/2011 Art. 12.2)...');
{
  const result = matchInvertersFromCatalog({
    invertersCatalog: mockInverters,
    module: mockModule,
    totalPanels: 31, // 31 * 580 Wp = 17.98 kWp (~18 kWp)
    totalKwp: 17.98,
    gridSupply: 'single_phase',
    distinctOrientations: 1
  });

  assert.ok(result, 'Debe devolver resultado con diagnóstico');
  assert.strictEqual(result.hasCatalogMatch, false, 'No debe tener inversores compatibles en catálogo en monofásica para > 15 kW');
  assert.strictEqual(result.compatible.length, 0, 'La lista compatible debe estar vacía para monofásica > 15 kW');
  assert.ok(result.bottleneckReason.includes('RD 1699/2011'), 'El motivo de cuello de botella debe citar el RD 1699/2011');
  assert.ok(result.bottleneckReason.includes('trifásica'), 'Debe indicar que la conexión debe ser trifásica');
  assert.strictEqual(result.virtualInverterMatch.inverter.type.includes('Trifásico'), true, 'El inversor virtual de respaldo debe ser trifásico');
  console.log('  ✓ Correcto: Configuración monofásica bloqueada legalmente por RD 1699/2011 Art. 12.2.');
}

// TEST 2: Instalación de 18 kWp con gridSupply = 'three_phase'
console.log('▶ TEST 2: Aceptación de inversores trifásicos para P > 15 kW...');
{
  const result = matchInvertersFromCatalog({
    invertersCatalog: mockInverters,
    module: mockModule,
    totalPanels: 31,
    totalKwp: 17.98,
    gridSupply: 'three_phase',
    distinctOrientations: 1
  });

  assert.ok(result.hasCatalogMatch, 'Debe ser compatible en trifásica');
  assert.ok(result.compatible.length > 0, 'Debe encontrar opciones compatibles trifásicas');
  assert.ok(result.bestCatalogMatch.inverter.type.includes('Trifásico'), 'El mejor inversor debe ser trifásico');
  console.log('  ✓ Correcto: Inversor trifásico asignado:', result.bestCatalogMatch.inverter.model);
}

// TEST 3: Verificación del desequilibrio de fases < 5 kW en inversores monofásicos conectados a trifásica
console.log('▶ TEST 3: Control de desequilibrio entre fases < 5 kW (RD 1699/2011 / ITC-BT-40)...');
{
  // Caso A: 1 x 8 kW monofásico en red trifásica -> delta = 8 kW (> 5 kW) -> NO ADMISIBLE
  const resultUnbalanced = matchInvertersFromCatalog({
    invertersCatalog: [mockInverters[1]], // Solis 8 kW monofásico
    module: mockModule,
    totalPanels: 14, // 14 * 580 = 8.12 kWp
    totalKwp: 8.12,
    gridSupply: 'three_phase',
    distinctOrientations: 1
  });
  assert.strictEqual(resultUnbalanced.hasCatalogMatch, false, '1 x 8 kW monofásico en red trifásica no es admisible por desequilibrio > 5 kW');

  // Caso B: 3 x 5 kW monofásicos en red trifásica -> repartidos 1 por fase -> delta = 0 kW (< 5 kW) -> ADMISIBLE
  const resultBalanced = matchInvertersFromCatalog({
    invertersCatalog: [mockInverters[0]], // Growatt 5 kW monofásico
    module: mockModule,
    totalPanels: 26, // 26 * 580 = 15.08 kWp (3 x 5 kW = 15 kW AC)
    totalKwp: 15.08,
    gridSupply: 'three_phase',
    distinctOrientations: 1
  });
  // 3 unidades de 5 kW monofásicas repartidas en 3 fases: fase1=5kW, fase2=5kW, fase3=5kW -> delta = 0 kW
  const threeInvMatch = resultBalanced.compatible.find(c => c.count === 3);
  assert.ok(threeInvMatch, '3 inversores monofásicos de 5 kW perfectamente equilibrados por fase deben ser aceptados');
  console.log('  ✓ Correcto: Rechazado desequilibrio > 5 kW y admitido reparto balanceado 3x5 kW.');
}

// TEST 4: Guarda en computeSizingEngineering para inv_kW > 15 kW
console.log('▶ TEST 4: computeSizingEngineering garantiza trifásica para P > 15 kW...');
{
  const computeSizingEngineering = Electrical.computeSizingEngineering;
  assert.ok(typeof computeSizingEngineering === 'function', 'computeSizingEngineering debe estar disponible');

  const sizing = computeSizingEngineering({
    numPanels: 35, // 35 * 580 = 20.3 kWp (> 15 kW)
    cfg: { potencia: 580, voc: 50.8, vmp: 42.4, isc: 14.2, imp: 13.68 },
    tiltDeg: 30,
    azimutDeg: 0,
    latDeg: 40.4
  });

  assert.strictEqual(sizing.monofasico, false, 'Para > 15 kW monofasico debe forzarse a false');
  assert.strictEqual(sizing.V_ac, 400, 'Tensión AC debe ser 400 V');
  assert.ok(sizing.inv_kW > 15.0, 'Potencia del inversor debe superar 15 kW');
  console.log('  ✓ Correcto: Forzado de trifásica 400 V en dimensionamiento global para P > 15 kW (' + sizing.inv_kW + ' kW).');
}

// TEST 5: wpSetGridSupply y UI sync
console.log('▶ TEST 5: wpSetGridSupply bloquea monofásica para P > 15 kW en project-config.js...');
{
  const pcfgCode = fs.readFileSync(path.join(ROOT, 'js/project-config.js'), 'utf8');
  const domMock = {
    step3GridSingle: { disabled: false, classList: { add(){}, remove(){}, toggle(){} }, style: {} },
    step3GridTri: { disabled: false, classList: { add(){}, remove(){}, toggle(){} }, style: {} },
    step3Notice: { style: {}, innerHTML: '' }
  };

  const pcfgCtx = {
    window: {
      RA: {},
      equipmentCatalog: {
        modules: [mockModule],
        inverters: mockInverters
      }
    },
    document: {
      getElementById(id) {
        if (id === 'step3-grid-single-phase') return domMock.step3GridSingle;
        if (id === 'step3-grid-three-phase') return domMock.step3GridTri;
        if (id === 'step3-grid-supply-notice') return domMock.step3Notice;
        return null;
      }
    },
    console: console
  };
  vm.createContext(pcfgCtx);
  vm.runInContext(pcfgCode, pcfgCtx);

  // Configurar 35 paneles (20.3 kWp > 15 kW)
  pcfgCtx.window.solarProjectConfig.selectedModuleId = 'mod_580';
  pcfgCtx.window.solarProjectConfig.totalPanels = 35;
  pcfgCtx.window.solarProjectConfig.gridSupply = 'three_phase';

  const wpSetGridSupply = pcfgCtx.window.wpSetGridSupply;
  assert.ok(typeof wpSetGridSupply === 'function');

  // Intentar forzar monofásica con 20.3 kWp
  wpSetGridSupply('single_phase', true);

  assert.strictEqual(pcfgCtx.window.solarProjectConfig.gridSupply, 'three_phase', 'gridSupply debe permanecer en three_phase');
  assert.strictEqual(domMock.step3GridSingle.disabled, true, 'El botón monofásico debe quedar deshabilitado');
  assert.strictEqual(domMock.step3Notice.style.display, 'flex', 'El aviso de RD 1699/2011 debe mostrarse');
  assert.ok(domMock.step3Notice.innerHTML.includes('RD 1699/2011'), 'El HTML del aviso debe citar el RD 1699/2011');
  console.log('  ✓ Correcto: Bloqueo de UI y disparo de aviso reactivo al superar 15 kW.');
}

console.log('\n═════════════════════════════════════════════════════════════════════');
console.log('🎉 TODOS LOS TESTS DE CONFORMIDAD RD 1699/2011 ART. 12.2 SUPERADOS');
console.log('═════════════════════════════════════════════════════════════════════');
