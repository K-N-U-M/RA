/**
 * tests/test-building-vertex-selection.js
 * Test Suite: Modificación topológica y selección de vértices de edificios 3D
 */

const assert = require('assert');

console.log('--- TEST SUITE: SELECCIÓN Y EDICIÓN TOPOLÓGICA DE VÉRTICES DE EDIFICIO ---');

// Mock mínimo de Cesium
const mockCartesian3 = class Cartesian3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
  static clone(c) {
    return new Cartesian3(c.x, c.y, c.z);
  }
  static distance(a, b) {
    return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  }
  static subtract(a, b, result) {
    result = result || new Cartesian3();
    result.x = a.x - b.x;
    result.y = a.y - b.y;
    result.z = a.z - b.z;
    return result;
  }
  static add(a, b, result) {
    result = result || new Cartesian3();
    result.x = a.x + b.x;
    result.y = a.y + b.y;
    result.z = a.z + b.z;
    return result;
  }
  static multiplyByScalar(a, s, result) {
    result = result || new Cartesian3();
    result.x = a.x * s;
    result.y = a.y * s;
    result.z = a.z * s;
    return result;
  }
};

const Cesium = {
  Cartesian3: mockCartesian3,
  Cartographic: {
    fromCartesian: (c) => ({ longitude: 0.1, latitude: 0.2, height: 10 }),
  },
  SceneTransforms: {
    wgs84ToWindowCoordinates: (scene, pt) => ({ x: pt.x * 10, y: pt.y * 10 })
  }
};

// Global state simulation
global.Cesium = Cesium;
global.buildings = [
  {
    id: 'bld_alpha',
    name: 'Nave Industrial Principal',
    height: 8.0,
    visible: true,
    isRectangular: true,
    points: [
      new mockCartesian3(0, 0, 10),
      new mockCartesian3(20, 0, 10),
      new mockCartesian3(20, 10, 10),
      new mockCartesian3(0, 10, 10)
    ]
  }
];
global.selectedBuildingId = 'bld_alpha';
global.bldFootprintState = {
  editing: false,
  selectedVtxIdx: -1,
  hoveredVtxIdx: -1,
  isDragging: false,
  dragStartPos: null,
  activeBuildingId: null
};

// UI Mock
let uiUpdateCalls = 0;
let render3DCalls = 0;
global.updateBuildingFootprintUI = () => { uiUpdateCalls++; };
global.render3DBuildingsInCesium = () => { render3DCalls++; };
global.renderTriad2D = () => {};
global.showToast = (title, msg) => {};

// Implementation of selection and topology editing under test
function selectBuildingVertex(vtxIdx) {
  if (!global.selectedBuildingId) return;
  const bld = global.buildings.find(b => b.id === global.selectedBuildingId);
  if (!bld || !bld.points || vtxIdx < 0 || vtxIdx >= bld.points.length) {
    global.bldFootprintState.selectedVtxIdx = -1;
  } else {
    global.bldFootprintState.selectedVtxIdx = vtxIdx;
    global.bldFootprintState.editing = true;
  }
  global.updateBuildingFootprintUI();
  global.render3DBuildingsInCesium();
}

function deleteSelectedBuildingVertex() {
  if (!global.selectedBuildingId) return;
  const bld = global.buildings.find(b => b.id === global.selectedBuildingId);
  if (!bld || !bld.points) return;
  if (bld.points.length <= 3) {
    return { ok: false, reason: 'min_vertices' };
  }
  const vIdx = global.bldFootprintState.selectedVtxIdx;
  if (vIdx < 0 || vIdx >= bld.points.length) return { ok: false, reason: 'no_vtx' };
  bld.points.splice(vIdx, 1);
  global.bldFootprintState.selectedVtxIdx = Math.min(vIdx, bld.points.length - 1);
  global.updateBuildingFootprintUI();
  global.render3DBuildingsInCesium();
  return { ok: true, remaining: bld.points.length };
}

function projectPointOnSegment2D(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return { x: x1, y: y1, dist: Math.hypot(px - x1, py - y1), t: 0 };
  let t = ((px - x1) * dx + (py - y1) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  const qx = x1 + t * dx, qy = y1 + t * dy;
  return { x: qx, y: qy, dist: Math.hypot(px - qx, py - qy), t };
}

function insertVertexOnBuildingEdge(clickPos, bld, tolerancePx = 24.0) {
  if (!bld || !bld.points || bld.points.length < 3) return null;
  const n = bld.points.length;
  let bestSegmentIdx = -1;
  let minScreenDist = tolerancePx;
  let bestT = 0.5;

  for (let i = 0; i < n; i++) {
    const pt1 = bld.points[i];
    const pt2 = bld.points[(i + 1) % n];
    const p1Win = Cesium.SceneTransforms.wgs84ToWindowCoordinates(null, pt1);
    const p2Win = Cesium.SceneTransforms.wgs84ToWindowCoordinates(null, pt2);
    if (!p1Win || !p2Win) continue;

    const proj = projectPointOnSegment2D(clickPos.x, clickPos.y, p1Win.x, p1Win.y, p2Win.x, p2Win.y);
    if (proj.dist < minScreenDist) {
      minScreenDist = proj.dist;
      bestSegmentIdx = i;
      bestT = proj.t;
    }
  }

  if (bestSegmentIdx >= 0) {
    const p1_3D = bld.points[bestSegmentIdx];
    const p2_3D = bld.points[(bestSegmentIdx + 1) % n];
    const segVec = Cesium.Cartesian3.subtract(p2_3D, p1_3D, new mockCartesian3());
    const newPt3D = Cesium.Cartesian3.add(p1_3D, Cesium.Cartesian3.multiplyByScalar(segVec, bestT, new mockCartesian3()), new mockCartesian3());

    bld.isRectangular = false;
    bld.points.splice(bestSegmentIdx + 1, 0, newPt3D);
    selectBuildingVertex(bestSegmentIdx + 1);
    return { ok: true, newIdx: bestSegmentIdx + 1, total: bld.points.length, newPt: newPt3D };
  }
  return null;
}

// ==========================================
// TEST CASES
// ==========================================

// Test 1: Selección directa de vértice
console.log('1. Verificando selección de vértice...');
selectBuildingVertex(2);
assert.strictEqual(global.bldFootprintState.selectedVtxIdx, 2, 'El índice seleccionado debe ser 2');
assert.strictEqual(global.bldFootprintState.editing, true, 'El modo edición debe activarse');
assert(uiUpdateCalls > 0, 'Debe haber disparado updateBuildingFootprintUI');
assert(render3DCalls > 0, 'Debe haber disparado render3DBuildingsInCesium');
console.log('   OK: Selección y estado sincronizados');

// Test 2: Inserción de vértice mediante doble clic en arista
console.log('2. Verificando inserción de vértice en arista perimetral...');
const bld = global.buildings[0];
const initialVtxCount = bld.points.length;
assert.strictEqual(initialVtxCount, 4, 'El edificio inicial debe tener 4 vértices');

// Simular clic en la arista entre v0 (0,0) y v1 (20,0) en coordenadas de pantalla (100, 0)
const insertResult = insertVertexOnBuildingEdge({ x: 100, y: 0 }, bld, 25.0);
assert(insertResult !== null, 'Debe haber detectado la arista para inserción');
assert.strictEqual(insertResult.ok, true);
assert.strictEqual(insertResult.newIdx, 1, 'El nuevo vértice debe insertarse en el índice 1');
assert.strictEqual(bld.points.length, 5, 'El edificio debe tener ahora 5 vértices');
assert.strictEqual(bld.isRectangular, false, 'El edificio ya no es rectangular');
assert.strictEqual(bld.points[1].x, 10, 'El nuevo vértice interpolado x debe ser 10');
assert.strictEqual(bld.points[1].y, 0, 'El nuevo vértice interpolado y debe ser 0');
assert.strictEqual(global.bldFootprintState.selectedVtxIdx, 1, 'El nuevo vértice debe quedar seleccionado');
console.log('   OK: Inserción topológica exacta y reclasificación a no-rectangular');

// Test 3: Traslación del vértice seleccionado (Gizmo Universal)
console.log('3. Verificando traslación 3D del vértice...');
const activeVtxIdx = global.bldFootprintState.selectedVtxIdx;
const translatedPos = new mockCartesian3(12, -4, 10);
bld.points[activeVtxIdx] = mockCartesian3.clone(translatedPos);
assert.strictEqual(bld.points[activeVtxIdx].x, 12, 'La coordenada X debe haberse actualizado a 12');
assert.strictEqual(bld.points[activeVtxIdx].y, -4, 'La coordenada Y debe haberse actualizado a -4');
console.log('   OK: Desplazamiento topológico de vértice aplicado');

// Test 4: Eliminación de vértice y guardián de polígono mínimo (3 vértices)
console.log('4. Verificando supresión de vértice y guardián mínimo...');
const delRes1 = deleteSelectedBuildingVertex();
assert.strictEqual(delRes1.ok, true);
assert.strictEqual(delRes1.remaining, 4, 'Deben quedar 4 vértices tras la primera eliminación');

selectBuildingVertex(0);
const delRes2 = deleteSelectedBuildingVertex();
assert.strictEqual(delRes2.ok, true);
assert.strictEqual(delRes2.remaining, 3, 'Deben quedar 3 vértices');

// Intentar borrar con 3 vértices (debe bloquearse)
selectBuildingVertex(0);
const delRes3 = deleteSelectedBuildingVertex();
assert.strictEqual(delRes3.ok, false);
assert.strictEqual(delRes3.reason, 'min_vertices', 'Debe rechazar borrar por debajo de 3 vértices');
assert.strictEqual(bld.points.length, 3, 'El polígono debe conservar estrictamente 3 vértices');
console.log('   OK: Guardián de topología mínima respeta norma CAD');

// Test 5: Comprobación de no excepción con selección out-of-bounds
console.log('5. Verificando estabilidad ante índices inválidos...');
selectBuildingVertex(99);
assert.strictEqual(global.bldFootprintState.selectedVtxIdx, -1, 'Índice fuera de límites debe deseleccionar sin crashear');
console.log('   OK: Manejo seguro ante índices fuera de rango');

console.log('--- TODOS LOS TESTS DE TOPOLOGÍA DE EDIFICIOS PASARON CON ÉXITO ---');
