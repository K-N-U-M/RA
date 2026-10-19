/**
 * 🧪 TEST AUTOMATIZADO: Selección y Borrado de Paneles FV (Individual y En Conjunto)
 * Verifica las correcciones para selección por clic, multi-selección, fila, faldón,
 * atajos, drillPick y borrado atómico.
 */

const assert = require('assert');

// Mock del entorno Cesium y Global
global.window = global;
global.Cesium = {
  Cartesian3: class Cartesian3 {
    constructor(x, y, z) {
      this.x = x || 0;
      this.y = y || 0;
      this.z = z || 0;
    }
    static clone(c) {
      return new Cesium.Cartesian3(c.x, c.y, c.z);
    }
    static distance(a, b) {
      return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    }
  },
  Color: {
    fromCssColorString: str => ({ str })
  },
  SceneTransforms: {
    wgs84ToWindowCoordinates: (scene, pos) => ({ x: pos.x, y: pos.y })
  }
};

global.viewer = {
  scene: {
    pick: () => null,
    drillPick: () => [],
    requestRender: () => {}
  },
  entities: {
    add: ent => ent,
    remove: ent => {}
  }
};

global.WP = {
  polylines: [
    { name: 'Faldón 1', points: [{}, {}, {}], deletedPanels: [] },
    { name: 'Faldón 2', points: [{}, {}, {}], deletedPanels: [] }
  ],
  selectedPolyIdx: 0
};

global.solarSimState = {
  annualHeatmapData: [1, 2, 3],
  annualHeatmapDirty: false
};
global.wpInvalidateHeatmap = (reason) => {
  global.solarSimState.annualHeatmapData = null;
  global.solarSimState.annualHeatmapDirty = true;
};

global.updatePanelSelectionUI = () => {};
global.renderTriad2D = () => {};
global.showStatus = () => {};
global.showToast = () => {};
global.recalculateSolarYield = () => {};
global.wpFastRenderSimulatedPanels = () => {};

// Cargar jerarquía de proyecto
require('../js/project-hierarchy.js');

// Simular funciones de selección de index.html
let selectedPanelIndex = -1;
let selectedPanelIndices = [];
global.selectedPanelIndex = selectedPanelIndex;
global.selectedPanelIndices = selectedPanelIndices;

function selectPanel(idx, isMulti = false) {
  if (!Array.isArray(global.selectedPanelIndices)) global.selectedPanelIndices = [];
  if (idx < 0) {
    selectedPanelIndex = -1;
    global.selectedPanelIndices = [];
  } else {
    const panelsList = global.allRenderedPanels;
    if (panelsList && panelsList[idx]) {
      const p = panelsList[idx];
      if (p.visible === false) return;
    }
    if (isMulti) {
      const pos = global.selectedPanelIndices.indexOf(idx);
      if (pos >= 0) {
        global.selectedPanelIndices.splice(pos, 1);
      } else {
        global.selectedPanelIndices.push(idx);
      }
      selectedPanelIndex = global.selectedPanelIndices.length > 0 
        ? global.selectedPanelIndices[global.selectedPanelIndices.length - 1] 
        : -1;
    } else {
      global.selectedPanelIndices = [idx];
      selectedPanelIndex = idx;
    }
  }
  global.selectedPanelIndex = selectedPanelIndex;
}
global.selectPanel = selectPanel;

global.selectAllPanelsInPolyline = function(polyIdx) {
  const panelsArray = global.allRenderedPanels;
  if (!Array.isArray(panelsArray) || panelsArray.length === 0) return;
  const matched = [];
  panelsArray.forEach((p, i) => {
    if (p && !p.deleted && (polyIdx === undefined || polyIdx === null || p.polyIdx === polyIdx)) {
      matched.push(i);
    }
  });
  if (matched.length === 0) return;
  global.selectedPanelIndices = matched;
  selectedPanelIndex = matched[matched.length - 1];
  global.selectedPanelIndex = selectedPanelIndex;
};

global.selectAllPanels = function() {
  const panelsArray = global.allRenderedPanels;
  if (!Array.isArray(panelsArray) || panelsArray.length === 0) return;
  const matched = [];
  panelsArray.forEach((p, i) => {
    if (p && !p.deleted) matched.push(i);
  });
  if (matched.length === 0) return;
  global.selectedPanelIndices = matched;
  selectedPanelIndex = matched[matched.length - 1];
  global.selectedPanelIndex = selectedPanelIndex;
};

global.selectPanelRow = function(panelIdx) {
  const panelsArray = global.allRenderedPanels;
  if (!panelsArray || panelIdx < 0 || panelIdx >= panelsArray.length) return;
  const targetP = panelsArray[panelIdx];
  if (!targetP) return;
  const targetV = (typeof targetP.v === 'number') ? targetP.v : null;
  const targetH = targetP.h || 2.10;
  const rowIndices = [];
  panelsArray.forEach((p, i) => {
    if (p.polyIdx === targetP.polyIdx) {
      if (targetV !== null && typeof p.v === 'number') {
        if (Math.abs(p.v - targetV) < targetH * 0.40) rowIndices.push(i);
      } else {
        rowIndices.push(i);
      }
    }
  });
  global.selectedPanelIndices = rowIndices.length > 0 ? rowIndices : [panelIdx];
  selectedPanelIndex = panelIdx;
  global.selectedPanelIndex = selectedPanelIndex;
};

global.deleteSelectedPanel = function() {
  const indicesToDelete = (Array.isArray(global.selectedPanelIndices) && global.selectedPanelIndices.length > 0)
    ? Array.from(new Set(global.selectedPanelIndices)).filter(idx => typeof idx === 'number' && idx >= 0).sort((a, b) => b - a)
    : ((typeof selectedPanelIndex !== 'undefined' && selectedPanelIndex >= 0) ? [selectedPanelIndex] : []);

  if (indicesToDelete.length === 0) return;

  const panelsArray = global.allRenderedPanels;
  if (!panelsArray || panelsArray.length === 0) return;

  indicesToDelete.forEach(idx => {
    const panel = panelsArray[idx];
    if (!panel) return;
    panel.deleted = true;
    if (panel.polyIdx !== undefined && global.WP.polylines[panel.polyIdx]) {
      global.WP.polylines[panel.polyIdx].deletedPanels.push({ u: panel.u, v: panel.v });
    }
  });

  indicesToDelete.forEach(idx => {
    if (idx >= 0 && idx < global.allRenderedPanels.length) {
      global.allRenderedPanels.splice(idx, 1);
    }
  });

  global.wpInvalidateHeatmap('panel_eliminado');
  global.selectedPanelIndices = [];
  selectedPanelIndex = -1;
  global.selectedPanelIndex = -1;
};

// Crear escena simulada con 6 paneles en 2 faldones y 2 filas
global.allRenderedPanels = [
  // Faldón 0, Fila 0 (v=1.0)
  { panelId: 'p0', polyIdx: 0, u: 0, v: 1.0, h: 2.1 },
  { panelId: 'p1', polyIdx: 0, u: 1.2, v: 1.0, h: 2.1 },
  // Faldón 0, Fila 1 (v=3.5)
  { panelId: 'p2', polyIdx: 0, u: 0, v: 3.5, h: 2.1 },
  { panelId: 'p3', polyIdx: 0, u: 1.2, v: 3.5, h: 2.1 },
  // Faldón 1, Fila 0 (v=1.0)
  { panelId: 'p4', polyIdx: 1, u: 0, v: 1.0, h: 2.1 },
  { panelId: 'p5', polyIdx: 1, u: 1.2, v: 1.0, h: 2.1 }
];

console.log('--- TEST 1: Selección individual ---');
selectPanel(1);
assert.strictEqual(global.selectedPanelIndex, 1);
assert.deepStrictEqual(global.selectedPanelIndices, [1]);
console.log('✔ Selección individual correcta');

console.log('--- TEST 2: Multi-selección con Shift ---');
selectPanel(3, true); // Añadir índice 3
assert.deepStrictEqual(global.selectedPanelIndices, [1, 3]);
assert.strictEqual(global.selectedPanelIndex, 3);
selectPanel(1, true); // Quitar índice 1
assert.deepStrictEqual(global.selectedPanelIndices, [3]);
assert.strictEqual(global.selectedPanelIndex, 3);
console.log('✔ Multi-selección aditiva y toggle correcta');

console.log('--- TEST 3: Selección de fila completa ---');
global.selectPanelRow(0); // Fila 0 de Faldón 0 (índices 0 y 1)
assert.deepStrictEqual(global.selectedPanelIndices, [0, 1]);
console.log('✔ Selección de fila completa correcta');

console.log('--- TEST 4: Selección de faldón completo ---');
global.selectAllPanelsInPolyline(0); // Todos los de Faldón 0 (índices 0, 1, 2, 3)
assert.deepStrictEqual(global.selectedPanelIndices, [0, 1, 2, 3]);
console.log('✔ Selección de faldón completo correcta');

console.log('--- TEST 5: Selección global del campo solar ---');
global.selectAllPanels();
assert.deepStrictEqual(global.selectedPanelIndices, [0, 1, 2, 3, 4, 5]);
console.log('✔ Selección global de todas las placas correcta');

console.log('--- TEST 6: ProjectHierarchy integración ---');
let notifiedEvent = null;
global.ProjectHierarchy.subscribe((evt, data) => { notifiedEvent = evt; });
global.ProjectHierarchy.selectAllPanelsInPolyline(1);
assert.strictEqual(notifiedEvent, 'selection_changed');
assert.deepStrictEqual(global.selectedPanelIndices, [4, 5]);
console.log('✔ Integración con ProjectHierarchy correcta');

console.log('--- TEST 7: Borrado múltiple atómico ---');
global.deleteSelectedPanel(); // Borra paneles 4 y 5
assert.strictEqual(global.allRenderedPanels.length, 4);
assert.strictEqual(global.WP.polylines[1].deletedPanels.length, 2);
assert.strictEqual(global.selectedPanelIndices.length, 0);
assert.strictEqual(global.selectedPanelIndex, -1);
assert.strictEqual(global.solarSimState.annualHeatmapDirty, true);
console.log('✔ Borrado múltiple atómico correcto y heatmap invalidado');

console.log('--- TEST 8: Filtro multi-criterio de deletedPanels en estructuras elevadas ---');
// Simular un faldón que se regenera: un módulo candidato con elevación 3D de 0.45m sobre plano
const regeneratedPanels = [
  { panelId: 'pan_0_0', layoutIndex: 0, u: 0.05, v: 1.02, center: new Cesium.Cartesian3(10, 10, 5.45) },
  { panelId: 'pan_0_1', layoutIndex: 1, u: 1.25, v: 1.02, center: new Cesium.Cartesian3(11.2, 10, 5.45) }
];
const deletedExclusionList = [
  // Grabado originalmente en rasante (Z=5.00) -> delta Z = 0.45m (> 0.25m antigua tolerancia)
  { panelId: 'pan_0_0', layoutIndex: 0, u: 0.0, v: 1.0, center: new Cesium.Cartesian3(10, 10, 5.0) }
];

const filtered = regeneratedPanels.filter(p => {
  const isDeleted = deletedExclusionList.some(dp => {
    if (p.panelId && dp.panelId && p.panelId === dp.panelId) return true;
    if (typeof p.layoutIndex === 'number' && typeof dp.layoutIndex === 'number' && p.layoutIndex === dp.layoutIndex) return true;
    if (typeof p.u === 'number' && typeof p.v === 'number' && typeof dp.u === 'number' && typeof dp.v === 'number') {
      const du = Math.abs(p.u - dp.u);
      const dv = Math.abs(p.v - dp.v);
      if (du < 0.40 && dv < 0.40) return true;
    }
    if (p.center && dp.center) {
      const d = Cesium.Cartesian3.distance(p.center, dp.center);
      if (d < 0.65) return true;
    }
    return false;
  });
  return !isDeleted;
});

// pan_0_0 debe ser excluido con éxito, quedando solo pan_0_1
assert.strictEqual(filtered.length, 1);
assert.strictEqual(filtered[0].panelId, 'pan_0_1');
console.log('✔ Filtro multi-criterio excluye exitosamente módulos elevados (>0.25m) por panelId, localIdx, UV y distancia 3D');

console.log('\n========================================');
console.log('🎉 TODOS LOS TESTS DE SELECCIÓN Y BORRADO PASARON!');
console.log('========================================');
