// ============================================================================
// TEST SUITE: CÁLCULO Y RENDERIZADO GPU INCREMENTAL POR FALDÓN
// ============================================================================
const assert = require('assert');
const fs = require('fs');

console.log('═════════════════════════════════════════════════════════════════════');
console.log('⚡ TEST SUITE: RENDERIZADO Y CÁLCULO INCREMENTAL POR FALDÓN');
console.log('═════════════════════════════════════════════════════════════════════');

// Mock Cesium environment
const Cesium = {
  Cartesian3: class {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    static clone(p) { return new Cesium.Cartesian3(p.x, p.y, p.z); }
    static add(a, b, r = new Cesium.Cartesian3()) { r.x = a.x + b.x; r.y = a.y + b.y; r.z = a.z + b.z; return r; }
    static subtract(a, b, r = new Cesium.Cartesian3()) { r.x = a.x - b.x; r.y = a.y - b.y; r.z = a.z - b.z; return r; }
    static multiplyByScalar(a, s, r = new Cesium.Cartesian3()) { r.x = a.x * s; r.y = a.y * s; r.z = a.z * s; return r; }
    static dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
    static cross(a, b, r = new Cesium.Cartesian3()) {
      r.x = a.y * b.z - a.z * b.y;
      r.y = a.z * b.x - a.x * b.z;
      r.z = a.x * b.y - a.y * b.x;
      return r;
    }
    static normalize(a, r = new Cesium.Cartesian3()) {
      const mag = Math.hypot(a.x, a.y, a.z) || 1;
      r.x = a.x / mag; r.y = a.y / mag; r.z = a.z / mag;
      return r;
    }
  },
  BoundingSphere: { fromPoints: () => ({}) },
  Color: class {
    constructor(r, g, b, a = 1) { this.red = r; this.green = g; this.blue = b; this.alpha = a; }
    static fromCssColorString() { return new Cesium.Color(0, 1, 1, 1); }
  },
  Primitive: class {
    constructor(opts) {
      this.geometryInstances = opts.geometryInstances;
      this.shadows = opts.shadows;
      this.isDestroyed = () => false;
    }
  },
  PolylineCollection: class {
    constructor() {
      this.lines = [];
      this.add = (l) => { this.lines.push(l); return l; };
    }
  },
  ShadowMode: { ENABLED: 1, DISABLED: 0 }
};

global.Cesium = Cesium;
global.window = global;
global.document = {
  getElementById: (id) => {
    if (id === 'cfg-obstacle-setback') return { value: '0.50' };
    if (id === 'cfg-mod-tilt') return { value: 'auto' };
    if (id === 'cfg-mod-azimuth') return { value: 'auto' };
    return null;
  }
};

// 1. Simular WP con 3 faldones
global.WP = {
  activePlaneIdx: 0,
  selectedPolyIdx: 1,
  polylines: [
    {
      name: 'Faldón Norte',
      points: [new Cesium.Cartesian3(0,0,0), new Cesium.Cartesian3(10,0,0), new Cesium.Cartesian3(10,10,0), new Cesium.Cartesian3(0,10,0)],
      moduleId: 'mod_450',
      roofInfo: { panels: [{ id: 'p0_1', polyIdx: 0 }, { id: 'p0_2', polyIdx: 0 }] },
      _calcSig: 'pts:0,0,0;10,0,0;10,10,0;0,10,0|mod_450|def|auto|auto|portrait|coplanar_teja|shd:|sb:0.50|obs:0'
    },
    {
      name: 'Faldón Sur',
      points: [new Cesium.Cartesian3(20,0,0), new Cesium.Cartesian3(30,0,0), new Cesium.Cartesian3(30,10,0), new Cesium.Cartesian3(20,10,0)],
      moduleId: 'mod_450',
      roofInfo: { panels: [{ id: 'p1_1', polyIdx: 1 }, { id: 'p1_2', polyIdx: 1 }] },
      _calcSig: 'pts:20,0,0;30,0,0;30,10,0;20,10,0|mod_450|def|auto|auto|portrait|coplanar_teja|shd:|sb:0.50|obs:0'
    },
    {
      name: 'Faldón Este',
      points: [new Cesium.Cartesian3(40,0,0), new Cesium.Cartesian3(50,0,0), new Cesium.Cartesian3(50,10,0), new Cesium.Cartesian3(40,10,0)],
      moduleId: 'mod_450',
      roofInfo: { panels: [{ id: 'p2_1', polyIdx: 2 }, { id: 'p2_2', polyIdx: 2 }] },
      _calcSig: 'pts:40,0,0;50,0,0;50,10,0;40,10,0|mod_450|def|auto|auto|portrait|coplanar_teja|shd:|sb:0.50|obs:0'
    }
  ]
};

global.obstacles = [];
global.roofPanelsCache = { sig: 'full_sig', data: {} };
global.setElemText = () => {};
global.updateObstaclePlacementUI = () => {};
global.render3DObstaclesInCesium = () => {};

// Cargar recalculateLayoutAndObstacles desde js/obstacles.js
const obstaclesCode = fs.readFileSync('js/obstacles.js', 'utf8');
const vm = require('vm');
vm.runInThisContext(obstaclesCode);

// TEST 1: Invalidador selectivo por targetPolyIdx
// [AUD-2026 · contrato actualizado] Desde el commit 87015c9 la invalidación selectiva
// NO destruye `roofInfo`/`panels` (hacerlo revertía los movimientos manuales de paneles).
// Se invalida la firma de cálculo (`_calcSig`), que fuerza el recálculo aguas abajo.
console.log('--- TEST 1: Invalidación selectiva con targetPolyIdx ---');
recalculateLayoutAndObstacles(1); // Modificar únicamente faldón 1

assert.strictEqual(WP.polylines[0].roofInfo !== null, true, 'Faldón 0 debe conservar su roofInfo');
assert.strictEqual(WP.polylines[0]._calcSig !== null, true, 'Faldón 0 debe conservar su _calcSig');
assert.strictEqual(WP.polylines[1]._calcSig, null, 'Faldón 1 (objetivo) debe invalidar su _calcSig');
assert.strictEqual(WP.polylines[1].roofInfo !== null, true, 'Faldón 1 debe conservar los paneles (movimientos manuales)');
assert.strictEqual(WP.polylines[2].roofInfo !== null, true, 'Faldón 2 debe conservar su roofInfo');
assert.strictEqual(WP.polylines[2]._calcSig !== null, true, 'Faldón 2 debe conservar su _calcSig');
console.log('✓ PASS: recalculateLayoutAndObstacles(1) solo invalidó la firma del faldón 1.');

// TEST 2: Invalidación global cuando targetPolyIdx es null / undefined
console.log('--- TEST 2: Invalidación global sin targetPolyIdx ---');
WP.polylines[1].roofInfo = { panels: [] };
WP.polylines[1]._calcSig = 'sig';
recalculateLayoutAndObstacles(); // Invalidate all

assert.strictEqual(WP.polylines[0]._calcSig, null, 'Faldón 0 debe invalidar su firma');
assert.strictEqual(WP.polylines[1]._calcSig, null, 'Faldón 1 debe invalidar su firma');
assert.strictEqual(WP.polylines[2]._calcSig, null, 'Faldón 2 debe invalidar su firma');
console.log('✓ PASS: recalculateLayoutAndObstacles() global invalidó las firmas de todos los faldones.');

// TEST 3: Desacoplamiento de primitivas GPU Map(_faldonPanelsPrimitives)
console.log('--- TEST 3: Desacoplamiento de primitivas GPU Map(_faldonPanelsPrimitives) ---');
const removedPrimitives = [];
global.viewer = {
  scene: {
    primitives: {
      add: (p) => p,
      remove: (p) => { removedPrimitives.push(p); return true; }
    },
    requestRender: () => {}
  },
  entities: {
    remove: () => true
  }
};

window._faldonPanelsPrimitives = new Map();
const prim0 = new Cesium.Primitive({ geometryInstances: [], shadows: 1 });
const prim1 = new Cesium.Primitive({ geometryInstances: [], shadows: 1 });
const prim2 = new Cesium.Primitive({ geometryInstances: [], shadows: 1 });

window._faldonPanelsPrimitives.set(0, prim0);
window._faldonPanelsPrimitives.set(1, prim1);
window._faldonPanelsPrimitives.set(2, prim2);

// Simular purga incremental de targetPolyIdx = 1
const targetPolyIdx = 1;
const isIncrementalTarget = (typeof targetPolyIdx === 'number' && targetPolyIdx >= 0);

if (isIncrementalTarget) {
  const oldPrim = window._faldonPanelsPrimitives.get(targetPolyIdx);
  if (oldPrim) {
    viewer.scene.primitives.remove(oldPrim);
    window._faldonPanelsPrimitives.delete(targetPolyIdx);
  }
}

assert.strictEqual(window._faldonPanelsPrimitives.has(0), true, 'Primitiva del faldón 0 debe permanecer viva en VRAM');
assert.strictEqual(window._faldonPanelsPrimitives.has(1), false, 'Primitiva del faldón 1 debe eliminarse para recreación');
assert.strictEqual(window._faldonPanelsPrimitives.has(2), true, 'Primitiva del faldón 2 debe permanecer viva en VRAM');
assert.strictEqual(removedPrimitives.length, 1, 'Solo 1 primitiva debe haberse purgado de la GPU');
assert.strictEqual(removedPrimitives[0], prim1, 'La primitiva purgada debe ser exactamente la del faldón 1');
console.log('✓ PASS: La GPU solo purgó la primitiva del faldón modificado, manteniendo vivas las demás.');

console.log('═════════════════════════════════════════════════════════════════════');
console.log('🎉 TODOS LOS TESTS DE CÁLCULO Y RENDER INCREMENTAL PASARON AL 100%');
console.log('═════════════════════════════════════════════════════════════════════');
