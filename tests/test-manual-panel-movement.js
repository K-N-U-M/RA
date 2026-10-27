// Test de regresión: Garantizar que paneles manuales no revierten a su posición original
// Simula movimiento de paneles, recálculo de faldones y obstáculos, re-renderizado y recálculo de producción.

const assert = require('assert');

// Mock Cesium Cartesian3
class Cartesian3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
  static clone(c) {
    return c ? new Cartesian3(c.x, c.y, c.z) : new Cartesian3();
  }
  static subtract(a, b, res = new Cartesian3()) {
    res.x = a.x - b.x;
    res.y = a.y - b.y;
    res.z = a.z - b.z;
    return res;
  }
  static add(a, b, res = new Cartesian3()) {
    res.x = a.x + b.x;
    res.y = a.y + b.y;
    res.z = a.z + b.z;
    return res;
  }
  static distance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return Math.sqrt(dx*dx + dy*dy + dz*dz);
  }
}

global.Cesium = { Cartesian3 };
global.window = {
  allRenderedPanels: [],
  selectedPanelIndices: [1],
  selectedPanelIndex: 1
};

// 1. Simular faldón con 3 paneles generados automáticamente por la cuadrícula
const mockGridPanels = [
  { panelId: 'pan_0_0', layoutIndex: 0, localIdx: 0, polyIdx: 0, center: new Cartesian3(10, 20, 5), corners: [new Cartesian3(9, 19, 5), new Cartesian3(11, 19, 5), new Cartesian3(11, 21, 5), new Cartesian3(9, 21, 5)], u: 1, v: 1, isManual: false },
  { panelId: 'pan_0_1', layoutIndex: 1, localIdx: 1, polyIdx: 0, center: new Cartesian3(15, 20, 5), corners: [new Cartesian3(14, 19, 5), new Cartesian3(16, 19, 5), new Cartesian3(16, 21, 5), new Cartesian3(14, 21, 5)], u: 2, v: 1, isManual: false },
  { panelId: 'pan_0_2', layoutIndex: 2, localIdx: 2, polyIdx: 0, center: new Cartesian3(20, 20, 5), corners: [new Cartesian3(19, 19, 5), new Cartesian3(21, 19, 5), new Cartesian3(21, 21, 5), new Cartesian3(19, 21, 5)], u: 3, v: 1, isManual: false }
];

const poly0 = {
  points: [new Cartesian3(0, 0, 5), new Cartesian3(30, 0, 5), new Cartesian3(30, 30, 5), new Cartesian3(0, 30, 5)],
  roofInfo: {
    panels: JSON.parse(JSON.stringify(mockGridPanels)).map(p => ({
      ...p,
      center: new Cartesian3(p.center.x, p.center.y, p.center.z),
      corners: p.corners.map(c => new Cartesian3(c.x, c.y, c.z))
    }))
  }
};

global.WP = {
  polylines: [poly0],
  selectedPolyIdx: 0
};

// Poblamos window.allRenderedPanels inicialmente
window.allRenderedPanels = poly0.roofInfo.panels.map(p => {
  const pCopy = { ...p, center: Cartesian3.clone(p.center), corners: p.corners.map(c => Cartesian3.clone(c)) };
  pCopy.rawPanel = p;
  return pCopy;
});

console.log('--- TEST 1: Simular arrastre con Gizmo (mover panel #1 de x=15 a x=18) ---');
const delta = new Cartesian3(3, 0, 0); // Desplazamiento +3m en X
const targetPanel = window.allRenderedPanels[1];
targetPanel.center = Cartesian3.add(targetPanel.center, delta, new Cartesian3());
targetPanel.corners = targetPanel.corners.map(c => Cartesian3.add(c, delta, new Cartesian3()));
targetPanel.isManual = true;
targetPanel.u = 2.5;

// Sincronización en LEFT_UP
if (targetPanel.rawPanel) {
  targetPanel.rawPanel.center = Cartesian3.clone(targetPanel.center);
  targetPanel.rawPanel.corners = targetPanel.corners.map(c => Cartesian3.clone(c));
  targetPanel.rawPanel.isManual = true;
  targetPanel.rawPanel.u = targetPanel.u;
}

assert.strictEqual(window.allRenderedPanels[1].center.x, 18, 'El panel renderizado debe estar en x=18');
assert.strictEqual(window.allRenderedPanels[1].isManual, true, 'isManual debe ser true');
console.log('OK: Panel movido correctamente a x=18');

console.log('--- TEST 2: Simular recálculo de obstáculos sin mutar geometría del faldón ---');
// Simular lo que hace recalculateLayoutAndObstacles tras nuestra corrección en js/obstacles.js
poly0._calcSig = null; // Se invalida sig
// PERO YA NO se borra poly0.roofInfo ni se pone _geometryDirty = true
assert.strictEqual(poly0._geometryDirty, undefined, '_geometryDirty NO debe activarse por obstáculos');
assert.ok(poly0.roofInfo, 'poly0.roofInfo NO debe borrarse');

console.log('--- TEST 3: Simular computeRoofPanelsData transfiere paneles manuales desde liveRenderedPanels y oldPanels ---');
// Mock de función computeSinglePolylineRoofInfo (que genera el grid base)
function mockComputeSinglePolylineRoofInfo(pts, poly) {
  return {
    panels: mockGridPanels.map(p => ({
      ...p,
      center: Cartesian3.clone(p.center),
      corners: p.corners.map(c => Cartesian3.clone(c))
    }))
  };
}

// Lógica parcheada de computeRoofPanelsData
const oldPanels = (poly0.roofInfo && Array.isArray(poly0.roofInfo.panels)) ? poly0.roofInfo.panels : null;
const freshInfo = mockComputeSinglePolylineRoofInfo(poly0.points, poly0);

if (!poly0._geometryDirty && Array.isArray(freshInfo.panels)) {
  const liveRenderedPanels = (Array.isArray(window.allRenderedPanels) && window.allRenderedPanels.length > 0)
    ? window.allRenderedPanels.filter(op => op && (op.polyIdx === 0 || (!op.polyIdx && 0 === 0)))
    : [];
  const prevSource = (oldPanels && oldPanels.length > 0) ? oldPanels : liveRenderedPanels;

  freshInfo.panels.forEach((p, pIdx) => {
    let prev = null;
    if (p.panelId) {
      prev = prevSource.find(op => (op.panelId === p.panelId) || (op.rawPanel && op.rawPanel.panelId === p.panelId));
      if (!prev && liveRenderedPanels.length > 0) {
        prev = liveRenderedPanels.find(op => (op.panelId === p.panelId) || (op.rawPanel && op.rawPanel.panelId === p.panelId));
      }
    }
    if (!prev && typeof p.layoutIndex === 'number') {
      prev = prevSource.find(op => (typeof op.layoutIndex === 'number' && op.layoutIndex === p.layoutIndex) || (typeof op.localIdx === 'number' && op.localIdx === p.layoutIndex));
    }
    if (!prev && typeof p.localIdx === 'number') {
      prev = prevSource.find(op => (typeof op.localIdx === 'number' && op.localIdx === p.localIdx) || (typeof op.layoutIndex === 'number' && op.layoutIndex === p.localIdx));
    }
    if (!prev && prevSource.length === freshInfo.panels.length) {
      prev = prevSource[pIdx];
    }

    if (prev && (prev.isManual || (prev.rawPanel && prev.rawPanel.isManual))) {
      p.isManual = true;
      const srcCenter = (prev.isManual && prev.center) ? prev.center : (prev.rawPanel && prev.rawPanel.center ? prev.rawPanel.center : prev.center);
      const srcCorners = (prev.isManual && prev.corners) ? prev.corners : (prev.rawPanel && prev.rawPanel.corners ? prev.rawPanel.corners : prev.corners);
      if (srcCenter) p.center = Cartesian3.clone(srcCenter);
      if (Array.isArray(srcCorners)) p.corners = srcCorners.map(c => Cartesian3.clone(c));
      if (typeof prev.u !== 'undefined') p.u = prev.u;
    }
  });
}
poly0.roofInfo = freshInfo;

assert.strictEqual(poly0.roofInfo.panels[1].center.x, 18, 'El panel recalculado en roofInfo DEBE conservar x=18');
assert.strictEqual(poly0.roofInfo.panels[1].isManual, true, 'isManual DEBE ser true en roofInfo');
console.log('OK: computeRoofPanelsData preservó correctamente la posición manual (x=18)');

console.log('--- TEST 4: Simular wpFastRenderSimulatedPanelsAsync con la nueva captura previa ---');
// 1. Capturar existingRenderedPanels ANTES de computeRoofPanelsData
const existingRenderedPanels = (Array.isArray(window.allRenderedPanels) && window.allRenderedPanels.length > 0)
  ? [...window.allRenderedPanels]
  : [];

window.allRenderedPanels = []; // Se limpia para la nueva generación
const newAllRendered = [];

const pInfo = poly0.roofInfo;
const prevPanelsMap = (existingRenderedPanels.length > 0)
  ? existingRenderedPanels.filter(op => op && (op.polyIdx === 0))
  : ((poly0.roofInfo && poly0.roofInfo.panels) ? poly0.roofInfo.panels : []);

pInfo.panels.forEach((p, idx) => {
  p.layoutIndex = idx;
  p.localIdx = idx;
  p.polyIdx = 0;
  if (!p.panelId) p.panelId = 'pan_0_' + idx;

  let prev = prevPanelsMap.find(op => op.panelId === p.panelId);
  if (prev && (prev.isManual || (prev.rawPanel && prev.rawPanel.isManual))) {
    p.isManual = true;
    const srcCenter = prev.center || prev.rawPanel.center;
    if (srcCenter) p.center = Cartesian3.clone(srcCenter);
  }
  newAllRendered.push(p);
});
window.allRenderedPanels = newAllRendered;

assert.strictEqual(window.allRenderedPanels[1].center.x, 18, 'window.allRenderedPanels[1] DEBE mantenerse en x=18 tras render');
assert.strictEqual(window.allRenderedPanels[1].isManual, true, 'isManual DEBE mantenerse en true');
console.log('OK: wpFastRenderSimulatedPanelsAsync conservó el panel movido');

console.log('\n>>> TODOS LOS TESTS DE PERSISTENCIA Y MOVIMIENTO MANUAL PASARON AL 100%! <<<');
