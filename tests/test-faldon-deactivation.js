/**
 * tests/test-faldon-deactivation.js
 * Test Suite: Desactivación / Exclusión de mesas de placas del árbol de proyecto,
 * verificando desacoplamiento estricto entre Visibilidad 3D y Cómputo de Presupuesto/Producción.
 */

const assert = require('assert');

console.log('--- TEST SUITE: DESACTIVACIÓN DE MESAS FV DE MEDICIONES Y PRESUPUESTO ---');

// Mock global
const globalObj = {
  WP: {
    planes: [{ id: 'plane_0', name: 'Cubierta Nave', visible: true }],
    polylines: [
      {
        id: 'poly_0',
        name: 'Mesa Sur 1',
        planeIdx: 0,
        visible: true,
        panelsVisible: true,
        panelsDisabled: false,
        area: 120,
        roofInfo: {
          area3D: 120,
          panels: [
            { panelId: 'pan_0_0', polyIdx: 0, deleted: false },
            { panelId: 'pan_0_1', polyIdx: 0, deleted: false },
            { panelId: 'pan_0_2', polyIdx: 0, deleted: false },
            { panelId: 'pan_0_3', polyIdx: 0, deleted: false }
          ]
        }
      },
      {
        id: 'poly_1',
        name: 'Mesa Sur 2',
        planeIdx: 0,
        visible: true,
        panelsVisible: true,
        panelsDisabled: false,
        area: 120,
        roofInfo: {
          area3D: 120,
          panels: [
            { panelId: 'pan_1_0', polyIdx: 1, deleted: false },
            { panelId: 'pan_1_1', polyIdx: 1, deleted: false },
            { panelId: 'pan_1_2', polyIdx: 1, deleted: false },
            { panelId: 'pan_1_3', polyIdx: 1, deleted: false }
          ]
        }
      }
    ],
    selectedPolyIdx: 0,
    activePlaneIdx: 0
  },
  allRenderedPanels: [
    { panelId: 'pan_0_0', polyIdx: 0, deleted: false, disabled: false },
    { panelId: 'pan_0_1', polyIdx: 0, deleted: false, disabled: false },
    { panelId: 'pan_0_2', polyIdx: 0, deleted: false, disabled: false },
    { panelId: 'pan_0_3', polyIdx: 0, deleted: false, disabled: false },
    { panelId: 'pan_1_0', polyIdx: 1, deleted: false, disabled: false },
    { panelId: 'pan_1_1', polyIdx: 1, deleted: false, disabled: false },
    { panelId: 'pan_1_2', polyIdx: 1, deleted: false, disabled: false },
    { panelId: 'pan_1_3', polyIdx: 1, deleted: false, disabled: false }
  ],
  buildings: [],
  obstacles: [],
  equipmentCatalog: {
    modules: [{ id: 'mod1', wp: 500, price: 150, weightKg: 24, model: 'Tier-1 500W' }],
    inverters: [{ id: 'inv1', acKw: 5.0, price: 800, model: 'Inversor 5kW' }],
    batteries: [],
    structures: []
  },
  panelConfig: { potencia: 500, wp: 500, precio: 150 },
  solarProjectConfig: { selectedModule: { wp: 500 }, projectName: 'Planta Test' }
};

// Cargar módulos
global.window = globalObj;
global.global = globalObj;
Object.assign(global, globalObj);

const ProjectHierarchy = require('../js/project-hierarchy.js');
const RAModulesBreakdown = require('../js/modules-breakdown.js');
const BOMTreeEngine = require('../js/bom-tree.js');

// 1. Estado inicial con ambas mesas activas (8 paneles en total, 4 kWp)
console.log('1. Verificando estado inicial activo (2 mesas de 4 placas = 8 placas)...');
let tree = ProjectHierarchy.getTree();
assert.strictEqual(tree.totals.panelsCount, 8, 'Debe haber 8 paneles activos');
assert.strictEqual(tree.totals.totalKwp, 4.0, 'Debe haber 4.0 kWp activos');

let mb = RAModulesBreakdown.getProjectModulesBreakdown({ polylines: globalObj.WP.polylines, allRenderedPanels: globalObj.allRenderedPanels });
assert.strictEqual(mb.totalPanels, 8, 'RAModulesBreakdown debe registrar 8 paneles');
assert.strictEqual(mb.totalKwp, 4.0, 'RAModulesBreakdown debe registrar 4 kWp');

let bom = BOMTreeEngine.computeBOMTree();
assert.strictEqual(bom.summary.totalPanels, 8, 'BOMTreeEngine debe computar 8 paneles');
console.log('   OK: Ambas mesas activas computan al 100%');

// 2. Comprobar que OCULTAR gráficamente la mesa 0 NO altera el presupuesto ni potencia
console.log('2. Verificando que ocultar visualmente (ojo) NO reduce el presupuesto ni la producción...');
ProjectHierarchy.toggleVisibility('poly_panels', 0);
assert.strictEqual(globalObj.WP.polylines[0].panelsVisible, false, 'La mesa 0 debe estar oculta visualmente');

tree = ProjectHierarchy.getTree();
assert.strictEqual(tree.totals.panelsCount, 8, 'Ocultar NO debe restar paneles del proyecto');
assert.strictEqual(tree.totals.totalKwp, 4.0, 'Ocultar NO debe restar potencia');

mb = RAModulesBreakdown.getProjectModulesBreakdown({ polylines: globalObj.WP.polylines, allRenderedPanels: globalObj.allRenderedPanels });
assert.strictEqual(mb.totalPanels, 8, 'El presupuesto debe seguir contando los 8 paneles');
console.log('   OK: Desacoplamiento confirmado: la visibilidad visual no deforma el presupuesto');

// 3. DESACTIVAR operativamente la mesa 0
console.log('3. Desactivando operativamente la Mesa 0 (exclusión de presupuesto y potencia)...');
ProjectHierarchy.togglePanelsActive(0);
assert.strictEqual(globalObj.WP.polylines[0].panelsDisabled, true, 'La mesa 0 debe estar desactivada');
assert.strictEqual(globalObj.allRenderedPanels[0].disabled, true, 'Los paneles de mesa 0 deben marcarse como disabled');
assert.strictEqual(globalObj.allRenderedPanels[1].disabled, true);
assert.strictEqual(globalObj.allRenderedPanels[4].disabled, false, 'Los paneles de mesa 1 deben seguir activos');

// 4. Verificar que el árbol de proyecto descuenta la mesa desactivada
console.log('4. Verificando recálculo en Árbol de Proyecto...');
tree = ProjectHierarchy.getTree();
assert.strictEqual(tree.totals.panelsCount, 4, 'El total del proyecto debe ser ahora de solo 4 paneles activos');
assert.strictEqual(tree.totals.totalKwp, 2.0, 'La potencia total debe reducirse exactamente a 2.0 kWp');

const pNode = tree.planes[0].polylines[0];
assert.strictEqual(pNode.panelsDisabled, true, 'El nodo de mesa 0 debe figurar como panelsDisabled: true');
assert.strictEqual(pNode.panelsCount, 0, 'La mesa 0 debe aportar 0 paneles activos');
assert.strictEqual(pNode.totalPanelsCount, 4, 'La mesa 0 conserva su metrado físico de 4 placas');
assert.strictEqual(pNode.kwp, 0, 'La mesa 0 debe aportar 0 kWp');
console.log('   OK: Árbol de proyecto refleja exactamente la exclusión');

// 5. Verificar que el desglose de módulos y el BOM tree excluyen la mesa desactivada
console.log('5. Verificando exclusión en desglose de materiales y presupuesto BOM...');
mb = RAModulesBreakdown.getProjectModulesBreakdown({ polylines: globalObj.WP.polylines, allRenderedPanels: globalObj.allRenderedPanels });
assert.strictEqual(mb.totalPanels, 4, 'Desglose de módulos debe reportar solo 4 paneles');
assert.strictEqual(mb.totalKwp, 2.0, 'Desglose de módulos debe reportar 2.0 kWp');

bom = BOMTreeEngine.computeBOMTree();
assert.strictEqual(bom.summary.totalPanels, 4, 'El presupuesto BOM debe computar solo 4 paneles');
assert.strictEqual(bom.roofs[0].panelCount, 0, 'El faldón 0 en el BOM debe tener 0 paneles computados');
assert.strictEqual(bom.roofs[0].disabled, true, 'El faldón 0 debe estar marcado como disabled');
assert.strictEqual(bom.roofs[1].panelCount, 4, 'El faldón 1 en el BOM mantiene sus 4 paneles');
console.log('   OK: Presupuesto y desgloses excluyen estrictamente las placas desactivadas');

// 6. Reactivar la mesa 0
console.log('6. Reactivando la Mesa 0 (botón ON)...');
ProjectHierarchy.togglePanelsActive(0);
assert.strictEqual(globalObj.WP.polylines[0].panelsDisabled, false, 'La mesa 0 debe volver a estar activa');
assert.strictEqual(globalObj.allRenderedPanels[0].disabled, false, 'Los paneles vuelven a activarse');

tree = ProjectHierarchy.getTree();
assert.strictEqual(tree.totals.panelsCount, 8, 'El total del proyecto vuelve a 8 paneles');
assert.strictEqual(tree.totals.totalKwp, 4.0, 'La potencia total vuelve a 4.0 kWp');

bom = BOMTreeEngine.computeBOMTree();
assert.strictEqual(bom.summary.totalPanels, 8, 'El presupuesto BOM vuelve a computar los 8 paneles');
console.log('   OK: Reactivación completa y retorno a estado original');

// 7. Desactivar TODAS las mesas y verificar que el HUD e indicadores caen estrictamente a 0
console.log('7. Verificando desactivación total (todas las mesas OFF) en HUD y métricas...');
require('../js/project-status-hud.js');
ProjectHierarchy.togglePanelsActive(0);
ProjectHierarchy.togglePanelsActive(1);
assert.strictEqual(globalObj.WP.polylines[0].panelsDisabled, true);
assert.strictEqual(globalObj.WP.polylines[1].panelsDisabled, true);

tree = ProjectHierarchy.getTree();
assert.strictEqual(tree.totals.panelsCount, 0, 'Árbol debe reportar exactamente 0 paneles cuando todo está OFF');
assert.strictEqual(tree.totals.totalKwp, 0.0, 'Árbol debe reportar 0 kWp');

const hudState = globalObj.RAProjectStatusHUD.inspect();
assert.strictEqual(hudState.numPanels, 0, 'HUD debe reflejar 0 paneles activos cuando todo está apagado');
assert.strictEqual(hudState.kwp, 0, 'HUD debe reflejar 0 kWp');
assert.strictEqual(hudState.annualKWh, 0, 'HUD no debe inventar energía neta cuando todo está OFF');
assert.strictEqual(hudState.theoreticalAnnualKWh, 0, 'HUD no debe mostrar energía teórica cuando todo está OFF');
console.log('   OK: Desactivación total pone a cero rigurosamente todos los marcadores del HUD');

console.log('--- TODOS LOS TESTS DE DESACTIVACIÓN DE MESAS PASARON CON ÉXITO ---');
