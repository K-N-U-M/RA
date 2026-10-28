/**
 * tests/test-building-rect.js
 * Test Suite: Motor de Huella Rectangular CAD Asistida en 2 Clics e Inspector Paramétrico
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('--- TEST SUITE: HUELLA RECTANGULAR CAD ASISTIDA (OPCIÓN 2) ---');

// Mock mínimo de Cesium y DOM para entorno Node.js
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
  static cross(a, b, result) {
    result = result || new Cartesian3();
    result.x = a.y * b.z - a.z * b.y;
    result.y = a.z * b.x - a.x * b.z;
    result.z = a.x * b.y - a.y * b.x;
    return result;
  }
  static dot(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  }
  static magnitude(a) {
    return Math.hypot(a.x, a.y, a.z);
  }
  static normalize(a, result) {
    result = result || new Cartesian3();
    const mag = Math.hypot(a.x, a.y, a.z) || 1;
    result.x = a.x / mag;
    result.y = a.y / mag;
    result.z = a.z / mag;
    return result;
  }
  static negate(a, result) {
    result = result || new Cartesian3();
    result.x = -a.x;
    result.y = -a.y;
    result.z = -a.z;
    return result;
  }
  static fromRadians(lon, lat, height, ellipsoid, result) {
    // Aproximación determinista suficiente para los cálculos en espacio local del test.
    result = result || new Cartesian3();
    result.x = lon * 6378137;
    result.y = lat * 6378137;
    result.z = height || 0;
    return result;
  }
};

class mockColor {
  constructor(r=1, g=1, b=1, a=1) { this.r = r; this.g = g; this.b = b; this.a = a; }
  withAlpha() { return this; }
  darken(amt, res) { return res || new mockColor(); }
  static fromCssColorString() { return new mockColor(); }
}
mockColor.WHITE = new mockColor();

// Constantes unitarias que usa `computeBuildingConstructionAxes` en su rama de respaldo.
// (Contrato real de Cesium: son Cartesian3 estáticos, no undefined.)
mockCartesian3.UNIT_X = new mockCartesian3(1, 0, 0);
mockCartesian3.UNIT_Y = new mockCartesian3(0, 1, 0);
mockCartesian3.UNIT_Z = new mockCartesian3(0, 0, 1);

global.Cesium = {
  Cartesian3: mockCartesian3,
  // Matriz ENU identidad: permite ejercitar la rama principal en Node sin Cesium real.
  Transforms: {
    eastNorthUpToFixedFrame: () => ([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    ])
  },
  Color: mockColor,
  ColorMaterialProperty: class {},
  PolylineDashMaterialProperty: class {},
  CallbackProperty: class { constructor(fn) { this.fn = fn; } },
  PolygonHierarchy: class {},
  ArcType: { NONE: 0 },
  Cartographic: {
    fromCartesian: () => ({ longitude: 0, latitude: 0, height: 0 })
  },
  Ellipsoid: {
    WGS84: {
      geodeticSurfaceNormal: () => new mockCartesian3(0, 0, 1)
    }
  }
};

global.window = global;
global.buildings = [];
global.WP = { mode: 'idle' };
global.viewer = {
  entities: {
    add: () => ({ id: 'mock_entity' }),
    remove: () => {}
  },
  scene: {
    requestRender: () => {},
    screenSpaceCameraController: { enableLook: true }
  }
};
global.RA = {};
global.RAundo = {
  snapBuildings: () => {}
};
global.showToast = () => {};
global.showStatus = () => {};

// Cargar módulo js/buildings.js
const code = fs.readFileSync(path.join(__dirname, '../js/buildings.js'), 'utf8');
eval(code);

// 1. Verificación de exportaciones
assert.strictEqual(typeof window.startDrawingBuildingRect, 'function', 'startDrawingBuildingRect debe estar en window');
assert.strictEqual(typeof window.handleBuildingRectClick, 'function', 'handleBuildingRectClick debe estar en window');
assert.strictEqual(typeof window.updateBuildingRectPreview, 'function', 'updateBuildingRectPreview debe estar en window');
assert.strictEqual(typeof window.finishBuildingRect, 'function', 'finishBuildingRect debe estar en window');
assert.strictEqual(typeof window.cancelBuildingRect, 'function', 'cancelBuildingRect debe estar en window');
assert.strictEqual(typeof window.getBuildingRectDimensions, 'function', 'getBuildingRectDimensions debe estar en window');
assert.strictEqual(typeof window.updateBuildingRectDimensions, 'function', 'updateBuildingRectDimensions debe estar en window');
assert.strictEqual(typeof window.RA.buildings.startDrawingBuildingRect, 'function', 'RA.buildings.startDrawingBuildingRect debe existir');
console.log('✓ Funciones del Rectángulo CAD exportadas correctamente en window y RA.buildings');

// 2. Simulación interactiva de 2 clics (P1 -> P2 -> Fondo Lado B)
window.startDrawingBuildingRect();
assert.strictEqual(window.WP.mode, 'draw-building-rect', 'El modo debe ser draw-building-rect');

// Clic 1: P1 en (0, 0, 0)
const p1 = new mockCartesian3(0, 0, 0);
window.handleBuildingRectClick(p1);

// Clic 2: P2 en (30, 0, 0) -> Fachada Lado A de 30m en eje X
const p2 = new mockCartesian3(30, 0, 0);
window.handleBuildingRectClick(p2);

// Cursor en (30, 15, 0) -> Fondo Lado B de 15m en eje Y
const cursorFondo = new mockCartesian3(30, 15, 0);
window.updateBuildingRectPreview(cursorFondo);

// Confirmar creación con Clic 3 o Enter
window.finishBuildingRect();

assert.strictEqual(window.buildings.length, 1, 'Debe haberse añadido 1 edificio');
const bld = window.buildings[0];
assert.strictEqual(bld.isRectangular, true, 'El edificio debe marcarse como isRectangular: true');
assert.strictEqual(bld.points.length, 4, 'La huella debe tener exactamente 4 esquinas');

const d12 = mockCartesian3.distance(bld.points[0], bld.points[1]);
const d23 = mockCartesian3.distance(bld.points[1], bld.points[2]);
const d34 = mockCartesian3.distance(bld.points[2], bld.points[3]);
const d41 = mockCartesian3.distance(bld.points[3], bld.points[0]);
const diag = mockCartesian3.distance(bld.points[0], bld.points[2]);

assert.ok(Math.abs(d12 - 30.0) < 0.001, `Lado A debe ser 30m, obtenido: ${d12}`);
assert.ok(Math.abs(d23 - 15.0) < 0.001, `Lado B debe ser 15m, obtenido: ${d23}`);
assert.ok(Math.abs(d34 - 30.0) < 0.001, `Lado C debe ser 30m, obtenido: ${d34}`);
assert.ok(Math.abs(d41 - 15.0) < 0.001, `Lado D debe ser 15m, obtenido: ${d41}`);

// Verificación de ortogonalidad exacta de 90° (Pitágoras y Dot Product)
const expectedDiag = Math.hypot(30, 15);
assert.ok(Math.abs(diag - expectedDiag) < 0.001, `Diagonal debe ser ${expectedDiag}, obtenido: ${diag}`);

const vA = mockCartesian3.subtract(bld.points[1], bld.points[0]);
const vB = mockCartesian3.subtract(bld.points[3], bld.points[0]);
const dotP = mockCartesian3.dot(vA, vB);
assert.ok(Math.abs(dotP) < 0.001, `Producto escalar de aristas debe ser 0.0 (90.0° puros), obtenido: ${dotP}`);
console.log(`✓ Geometría de Nave Rectangular verificada: 30.0m × 15.0m con ángulos de 90.0° exactos`);

// 3. Verificación del Inspector Paramétrico (Lectura y Redimensionamiento)
const dims = window.getBuildingRectDimensions(bld);
assert.ok(dims, 'getBuildingRectDimensions debe devolver objeto de dimensiones');
assert.ok(Math.abs(dims.ladoA - 30) < 0.01, 'dims.ladoA debe ser 30');
assert.ok(Math.abs(dims.ladoB - 15) < 0.01, 'dims.ladoB debe ser 15');
assert.ok(Math.abs(dims.area - 450) < 0.01, 'dims.area debe ser 450 m²');

// Redimensionar paramétricamente a 50m × 25m
const updated = window.updateBuildingRectDimensions(bld.id, 50, 25);
assert.strictEqual(updated, true, 'updateBuildingRectDimensions debe retornar true');

const d12_new = mockCartesian3.distance(bld.points[0], bld.points[1]);
const d23_new = mockCartesian3.distance(bld.points[1], bld.points[2]);
const dimsNew = window.getBuildingRectDimensions(bld);

assert.ok(Math.abs(d12_new - 50.0) < 0.001, `Nuevo Lado A debe ser 50m, obtenido: ${d12_new}`);
assert.ok(Math.abs(d23_new - 25.0) < 0.001, `Nuevo Lado B debe ser 25m, obtenido: ${d23_new}`);
assert.ok(Math.abs(dimsNew.area - 1250.0) < 0.001, `Nueva área debe ser 1250 m², obtenido: ${dimsNew.area}`);
console.log(`✓ Redimensionamiento paramétrico en caliente verificado: 50.0m × 25.0m (1250 m²) sin deformar ortogonalidad`);

console.log('--- TODOS LOS TESTS DEL RECTÁNGULO CAD ASISTIDO PASARON AL 100% ---');
