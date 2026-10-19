/**
 * tests/test-hidden-objects-selection.js
 * Test Suite: Validación de bloqueo de selección para objetos ocultos en visor 3D y Outliner
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('--- TEST SUITE: NO SELECCIÓN DE OBJETOS OCULTOS (VISOR 3D & OUTLINER) ---');

// Mock mínimo global
global.window = global;
global.document = {
  getElementById: function() { return null; },
  createElement: function() { return { style: {} }; }
};
global.showToast = function(title, msg, type) {
  // console.log(`[Toast] ${title}: ${msg}`);
};

// Cargar módulos necesarios
require('../js/project-hierarchy.js');
require('../js/obstacles.js');
require('../js/wind-turbine.js');

// 1. VERIFICACIÓN DE OBSTÁCULOS OCULTOS
console.log('1. Test: Obstáculos ocultos');
global.obstacles = [
  { id: 'obs_1', name: 'Chimenea', visible: true, w: 1, l: 1, h: 2, cartesian: { x: 10, y: 10, z: 10 } },
  { id: 'obs_2', name: 'HVAC', visible: false, w: 2, l: 2, h: 1, cartesian: { x: 20, y: 20, z: 20 } }
];
global.selectedObstacleId = null;

// Intentar seleccionar obstáculo oculto
global.ProjectHierarchy.selectObstacle('obs_2', false);
assert.strictEqual(global.selectedObstacleId, null, 'No debe seleccionar un obstáculo con visible === false desde ProjectHierarchy');

global.selectObstacle('obs_2');
assert.strictEqual(global.selectedObstacleId, null, 'No debe seleccionar un obstáculo con visible === false desde selectObstacle');

// Seleccionar obstáculo visible
global.ProjectHierarchy.selectObstacle('obs_1', false);
assert.strictEqual(global.selectedObstacleId, 'obs_1', 'Debe seleccionar un obstáculo visible');

// Ocultar obstáculo actualmente seleccionado -> debe deseleccionarse automáticamente
global.ProjectHierarchy.toggleVisibility('obstacle', 'obs_1');
assert.strictEqual(global.obstacles[0].visible, false, 'El obstáculo debe estar ahora oculto');
assert.strictEqual(global.selectedObstacleId, null, 'El obstáculo seleccionado debe deseleccionarse automáticamente al ocultarse');
console.log('  ✓ PASS: Obstáculos ocultos no seleccionables y deselección automática al ocultar');

// 2. VERIFICACIÓN DE EDIFICIOS OCULTOS
console.log('2. Test: Edificios ocultos');
global.buildings = [
  { id: 'bld_1', name: 'Nave A', visible: true, height: 6, points: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { x: 10, y: 10, z: 0 }] },
  { id: 'bld_2', name: 'Nave B', visible: false, height: 8, points: [{ x: 20, y: 20, z: 0 }, { x: 30, y: 20, z: 0 }, { x: 30, y: 30, z: 0 }] }
];
global.selectedBuildingId = null;

global.ProjectHierarchy.selectBuilding('bld_2', false);
assert.strictEqual(global.selectedBuildingId, null, 'No debe seleccionar un edificio con visible === false');

global.ProjectHierarchy.selectBuilding('bld_1', false);
assert.strictEqual(global.selectedBuildingId, 'bld_1', 'Debe seleccionar un edificio visible');

global.ProjectHierarchy.toggleVisibility('building', 'bld_1');
assert.strictEqual(global.buildings[0].visible, false, 'El edificio debe estar ahora oculto');
assert.strictEqual(global.selectedBuildingId, null, 'El edificio debe deseleccionarse automáticamente al ocultarse');
console.log('  ✓ PASS: Edificios ocultos no seleccionables y deselección automática al ocultar');

// 3. VERIFICACIÓN DE FALDONES / POLILÍNEAS Y PANELES
console.log('3. Test: Faldones y Paneles ocultos');
global.WP = {
  activePlaneIdx: 0,
  selectedPolyIdx: -1,
  selectedVtxIdx: -1,
  polylines: [
    { index: 0, name: 'Faldón Sur', visible: true, points: [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }, { x: 5, y: 5, z: 0 }] },
    { index: 1, name: 'Faldón Norte', visible: false, points: [{ x: 10, y: 10, z: 0 }, { x: 15, y: 10, z: 0 }, { x: 15, y: 15, z: 0 }] }
  ],
  planes: [
    { index: 0, name: 'Plano 1', visible: true }
  ]
};
global.simulatedPanelEntities = [
  { id: 'pv_panel_pool_0', polyIdx: 0, show: true },
  { id: 'pv_panel_pool_1', polyIdx: 1, show: false }
];
global.selectedPanelIndex = -1;
global.selectedPanelIndices = [];

global.ProjectHierarchy.selectPolyline(1, false);
assert.strictEqual(global.WP.selectedPolyIdx, -1, 'No debe seleccionar un faldón con visible === false');

global.ProjectHierarchy.selectPolyline(0, false);
assert.strictEqual(global.WP.selectedPolyIdx, 0, 'Debe seleccionar un faldón visible');

// Ocultar faldón 0 -> debe deseleccionar el faldón y los paneles asociados
global.ProjectHierarchy.toggleVisibility('polyline', 0);
assert.strictEqual(global.WP.polylines[0].visible, false, 'El faldón 0 debe estar ahora oculto');
assert.strictEqual(global.WP.selectedPolyIdx, -1, 'El faldón debe deseleccionarse automáticamente al ocultarse');
assert.strictEqual(global.simulatedPanelEntities[0].show, false, 'Los paneles del faldón oculto deben tener show === false');
console.log('  ✓ PASS: Faldones ocultos no seleccionables y paneles sincronizados con show: false');

// 4. VERIFICACIÓN DE EQUIPOS ELÉCTRICOS
console.log('4. Test: Equipos eléctricos ocultos');
global.inverterEquipmentState = {
  entity: { id: 'inverter', show: true },
  batteryEntity: { id: 'battery', show: false },
  position: { x: 5, y: 5, z: 0 },
  batteryPosition: { x: 6, y: 6, z: 0 }
};
global.selectedElectricalId = null;

global.ProjectHierarchy.selectElectrical('battery', false);
assert.strictEqual(global.selectedElectricalId, null, 'No debe seleccionar un equipo eléctrico con show === false');

global.ProjectHierarchy.selectElectrical('inverter', false);
assert.strictEqual(global.selectedElectricalId, 'inverter', 'Debe seleccionar un equipo eléctrico visible');

global.ProjectHierarchy.toggleVisibility('electrical', 'inverter');
assert.strictEqual(global.inverterEquipmentState.entity.show, false, 'El inversor debe estar ahora oculto');
assert.strictEqual(global.selectedElectricalId, null, 'El equipo eléctrico debe deseleccionarse automáticamente al ocultarse');
console.log('  ✓ PASS: Equipos eléctricos ocultos no seleccionables y deselección automática al ocultar');

// 5. VERIFICACIÓN DE AEROGENERADORES (WIND TURBINE)
console.log('5. Test: Aerogeneradores ocultos');
global.obstacles.push({
  id: 'wt_1',
  type: 'wind_turbine',
  name: 'Aerogenerador 1',
  visible: true,
  mastHeight: 12,
  bladeRadius: 4
});

global.selectedObstacleId = 'wt_1';
assert.strictEqual(global.selectedObstacleId, 'wt_1');

global.ProjectHierarchy.toggleVisibility('wind_turbine', 'wt_1');
const wtObj = global.obstacles.find(o => o.id === 'wt_1');
assert.strictEqual(wtObj.visible, false, 'El aerogenerador debe estar ahora oculto');
assert.strictEqual(global.selectedObstacleId, null, 'El aerogenerador debe deseleccionarse al ocultarse');

global.selectObstacle('wt_1');
assert.strictEqual(global.selectedObstacleId, null, 'No debe permitir seleccionar el aerogenerador mientras está oculto');
console.log('  ✓ PASS: Aerogeneradores ocultos no seleccionables y deselección automática al ocultar');

console.log('--- TODOS LOS TESTS DE VISIBILIDAD Y SELECCIÓN PASARON CON ÉXITO AL 100% ---');
