// ============================================================================
// TEST SUITE: MODO ESTAMPAR POLILÍNEA / FALDÓN COMPLETO (OPCIÓN 2)
// ============================================================================
const assert = require('assert');
const fs = require('fs');

console.log('═════════════════════════════════════════════════════════════════════');
console.log('⚡ TEST SUITE: DUPLICADO DE POLILÍNEA EN MODO ESTAMPAR (STAMP MODE)');
console.log('═════════════════════════════════════════════════════════════════════');

// Mock Cesium environment
const Cesium = {
  Cartesian3: class {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    static clone(p) { return new Cesium.Cartesian3(p.x, p.y, p.z); }
    static add(a, b, r = new Cesium.Cartesian3()) { r.x = a.x + b.x; r.y = a.y + b.y; r.z = a.z + b.z; return r; }
    static subtract(a, b, r = new Cesium.Cartesian3()) { r.x = a.x - b.x; r.y = a.y - b.y; r.z = a.z - b.z; return r; }
    static multiplyByScalar(a, s, r = new Cesium.Cartesian3()) { r.x = a.x * s; r.y = a.y * s; r.z = a.z * s; return r; }
    static divideByScalar(a, s, r = new Cesium.Cartesian3()) { r.x = a.x / s; r.y = a.y / s; r.z = a.z / s; return r; }
    static distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }
    static midpoint(a, b, r = new Cesium.Cartesian3()) {
      r.x = (a.x + b.x) / 2; r.y = (a.y + b.y) / 2; r.z = (a.z + b.z) / 2;
      return r;
    }
    static magnitude(a) { return Math.hypot(a.x, a.y, a.z); }
    static normalize(a, r = new Cesium.Cartesian3()) {
      const mag = Math.hypot(a.x, a.y, a.z) || 1;
      r.x = a.x / mag; r.y = a.y / mag; r.z = a.z / mag;
      return r;
    }
    static dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
    static cross(a, b, r = new Cesium.Cartesian3()) {
      r.x = a.y * b.z - a.z * b.y;
      r.y = a.z * b.x - a.x * b.z;
      r.z = a.x * b.y - a.y * b.x;
      return r;
    }
  },
  Cartesian2: class {
    constructor(x = 0, y = 0) { this.x = x; this.y = y; }
  },
  PolygonHierarchy: class {
    constructor(positions = []) { this.positions = positions; }
  },
  Color: class {
    constructor(r, g, b, a = 1) { this.r = r; this.g = g; this.b = b; this.a = a; }
    static fromCssColorString() { return new Cesium.Color(0, 1, 0, 1); }
    withAlpha(a) { return new Cesium.Color(this.r, this.g, this.b, a); }
  },
  ColorMaterialProperty: class {
    constructor(c) { this.color = c; }
  },
  CallbackProperty: class {
    constructor(cb, isConstant) { this.cb = cb; this.isConstant = isConstant; }
    getValue() { return this.cb(); }
  },
  LabelStyle: { FILL_AND_OUTLINE: 2 },
  VerticalOrigin: { BOTTOM: 1 },
  ArcType: { NONE: 0 },
  ShadowMode: { DISABLED: 0, ENABLED: 1 },
  Matrix4: class {
    static multiplyByPoint(m, p, r = new Cesium.Cartesian3()) {
      r.x = p.x; r.y = p.y; r.z = p.z; return r;
    }
    static inverse(m, r) { return r || new Cesium.Matrix4(); }
  }
};

global.Cesium = Cesium;
global.window = global;
global.window.addEventListener = () => {};
global.document = {
  body: { appendChild: () => {} },
  getElementById: () => null,
  querySelectorAll: () => [],
  createElement: () => ({ getContext: () => ({ resetTransform: () => {}, scale: () => {} }), style: {} })
};

// Mock Viewer & Entities
const removedEntities = [];
const addedEntities = [];
global.viewer = {
  entities: {
    add: (ent) => { addedEntities.push(ent); return ent; },
    remove: (ent) => { removedEntities.push(ent); return true; },
    getById: () => null
  },
  scene: {
    canvas: { style: { cursor: 'default' } },
    requestRender: () => {}
  }
};

// Mock Undo & Hierarchy
const undoSnaps = [];
global.RAundo = {
  snapPolylines: (label) => undoSnaps.push({ type: 'polylines', label }),
  snapObstacles: (label) => undoSnaps.push({ type: 'obstacles', label })
};

const hierarchyEvents = [];
global.ProjectHierarchy = {
  notify: (ev, data) => hierarchyEvents.push({ ev, data })
};

global.addPolylineEntity = () => ({});
global.addPolygonFillEntity = () => ({});
global.addActiveShapeCoordinates = () => ({});
global.addPointEntity = () => ({});
global.addLabelEntity = () => ({});
global.cesiumColor = () => new Cesium.Color();
global.showToast = () => {};
global.wpPolylineArea3D = () => 150.0;
global.wpRenderAllPolylines = () => {};
global.wpUpdateUI = () => {};
global.recalculateLayoutAndObstacles = (idx) => { global._lastRecalcIdx = idx; };
global.wpFastRenderSimulatedPanels = (skipCam, idx) => { global._lastFastRenderIdx = idx; };
global.computeSinglePolylineRoofInfo = (pts, poly) => {
  const pIdx = (WP && Array.isArray(WP.polylines)) ? WP.polylines.indexOf(poly) : 0;
  const targetIdx = pIdx >= 0 ? pIdx : 1;
  return {
    uVec: new Cesium.Cartesian3(1, 0, 0),
    vVec: new Cesium.Cartesian3(0, 1, 0),
    normal: new Cesium.Cartesian3(0, 0, 1),
    transform: new Cesium.Matrix4(),
    invTransform: new Cesium.Matrix4(),
    panels: [
      {
        panelId: 'pan_' + targetIdx + '_0',
        polyIdx: targetIdx,
        layoutIndex: 0,
        u: 2, v: 2, w: 1, h: 2,
        annualLossPct: 2.0
      },
      {
        panelId: 'pan_' + targetIdx + '_1',
        polyIdx: targetIdx,
        layoutIndex: 1,
        u: 4, v: 2, w: 1, h: 2,
        annualLossPct: 15.0
      }
    ]
  };
};

// Setup initial faldon
global.WP = {
  mode: 'idle',
  activePlaneIdx: 0,
  selectedPolyIdx: 0,
  activePolyPts: [],
  ents: { polys: [], vtx: [], triad: [] },
  planes: [
    {
      origin: new Cesium.Cartesian3(0, 0, 10),
      uVec: new Cesium.Cartesian3(1, 0, 0),
      vVec: new Cesium.Cartesian3(0, 1, 0),
      normal: new Cesium.Cartesian3(0, 0, 1)
    }
  ],
  polylines: [
    {
      id: 'wp_poly_orig',
      name: 'Faldon Principal',
      planeIdx: 0,
      points: [
        new Cesium.Cartesian3(0, 0, 10),
        new Cesium.Cartesian3(10, 0, 10),
        new Cesium.Cartesian3(10, 10, 10),
        new Cesium.Cartesian3(0, 10, 10)
      ],
      area: 100,
      orientationPref: 'portrait',
      modTilt: 25,
      modAzimuth: 180,
      structureType: 'triangles_custom',
      hasWalkway: true,
      obstacleSetback: 0.60
    }
  ]
};

// Interior obstacle
global.obstacles = [
  {
    id: 'obs_chimenea',
    name: 'Chimenea Test',
    cartesian: new Cesium.Cartesian3(5, 5, 10),
    u: 5,
    v: 5,
    w: 1,
    l: 1,
    h: 1.5
  }
];

// Mock wpCheckObstacleInsideRoof returning inside for the obstacle
global.wpCheckObstacleInsideRoof = (obs) => {
  if (obs.id === 'obs_chimenea') {
    return { isInside: true, polyIdx: 0, polyName: 'Faldon Principal' };
  }
  return { isInside: false, polyIdx: -1, polyName: null };
};

// Load working-plane.js
const wpCode = fs.readFileSync('js/working-plane.js', 'utf8');
eval(wpCode);

// ----------------------------------------------------------------------------
// TEST 1: Verificar existencia de funciones de estampado
// ----------------------------------------------------------------------------
console.log('▶ TEST 1: Verificando registro y tipos de funciones...');
assert.strictEqual(typeof wpStartStampPolyline, 'function', 'wpStartStampPolyline debe estar definida');
assert.strictEqual(typeof wpUpdateStampPolylinePreview, 'function', 'wpUpdateStampPolylinePreview debe estar definida');
assert.strictEqual(typeof wpCommitStampPolyline, 'function', 'wpCommitStampPolyline debe estar definida');
assert.strictEqual(typeof wpCancelStampPolyline, 'function', 'wpCancelStampPolyline debe estar definida');
console.log('✔ TEST 1 PASADO: Todas las funciones existen y son invocables.');

// ----------------------------------------------------------------------------
// TEST 2: Iniciar modo estampar (wpStartStampPolyline)
// ----------------------------------------------------------------------------
console.log('\n▶ TEST 2: Iniciar modo estampar sobre Faldon 0...');
const started = wpStartStampPolyline(0);
assert.strictEqual(started, true, 'wpStartStampPolyline debe retornar true');
assert.strictEqual(WP.mode, 'stamp-poly', 'WP.mode debe ser stamp-poly');
assert.ok(WP.stampState, 'WP.stampState debe estar inicializado');
assert.strictEqual(WP.stampState.sourcePolyIdx, 0, 'sourcePolyIdx debe ser 0');
assert.strictEqual(WP.stampState.centroid.x, 5, 'Centroide X debe ser 5 (promedio 0, 10, 10, 0)');
assert.strictEqual(WP.stampState.centroid.y, 5, 'Centroide Y debe ser 5 (promedio 0, 0, 10, 10)');
assert.strictEqual(WP.stampState.centroid.z, 10, 'Centroide Z debe ser 10');
assert.strictEqual(WP.stampState.relObs.length, 1, 'Debe haber 1 obstáculo interior detectado');
assert.strictEqual(WP.stampState.relObs[0].obs.id, 'obs_chimenea', 'El obstáculo detectado debe ser la chimenea');
assert.strictEqual(WP.stampState.previewEntities.length, 3, 'Deben crearse 3 entidades de preview (fill, outline, label)');
console.log('✔ TEST 2 PASADO: Modo estampar iniciado correctamente con centroide, entidades y obstáculos.');

// ----------------------------------------------------------------------------
// TEST 3: Actualizar posición del cursor en preview
// ----------------------------------------------------------------------------
console.log('\n▶ TEST 3: Actualizar preview con movimiento del cursor...');
const cursorTarget = new Cesium.Cartesian3(25, 30, 10);
wpUpdateStampPolylinePreview(cursorTarget);
assert.strictEqual(WP.stampState.curTargetPos.x, 25, 'curTargetPos X debe ser 25');
assert.strictEqual(WP.stampState.curTargetPos.y, 30, 'curTargetPos Y debe ser 30');
console.log('✔ TEST 3 PASADO: Preview sincronizado con el cursor.');

// ----------------------------------------------------------------------------
// TEST 4: Estampar / Fijar faldón en nueva posición (wpCommitStampPolyline)
// ----------------------------------------------------------------------------
console.log('\n▶ TEST 4: Fijar faldón duplicado en posición (25, 30, 10)...');
const committed = wpCommitStampPolyline(cursorTarget);
assert.strictEqual(committed, true, 'wpCommitStampPolyline debe retornar true');
assert.strictEqual(WP.mode, 'idle', 'WP.mode debe volver a idle tras el commit');
assert.strictEqual(WP.stampState, null, 'WP.stampState debe limpiarse a null');
assert.strictEqual(WP.polylines.length, 2, 'Deben existir 2 faldones ahora');

const clonedPoly = WP.polylines[1];
assert.strictEqual(clonedPoly.name, 'Faldon #2', 'El nuevo faldón debe llamarse Faldon #2');
assert.strictEqual(clonedPoly.modTilt, 25, 'La inclinación debe conservarse (25°)');
assert.strictEqual(clonedPoly.modAzimuth, 180, 'El azimut debe conservarse (180°)');
assert.strictEqual(clonedPoly.structureType, 'triangles_custom', 'La estructura debe conservarse');
assert.strictEqual(clonedPoly.hasWalkway, true, 'El pasillo de mantenimiento debe conservarse');
assert.strictEqual(clonedPoly.obstacleSetback, 0.60, 'El retranqueo de obstáculos debe conservarse');

// Verificar traslación de vértices: centroide original (5,5,10) -> nuevo (25,30,10) => delta = (20, 25, 0)
// V0: (0,0,10) -> (20, 25, 10)
// V1: (10,0,10) -> (30, 25, 10)
assert.strictEqual(clonedPoly.points[0].x, 20, 'Vértice 0 X debe ser 20');
assert.strictEqual(clonedPoly.points[0].y, 25, 'Vértice 0 Y debe ser 25');
assert.strictEqual(clonedPoly.points[1].x, 30, 'Vértice 1 X debe ser 30');
assert.strictEqual(clonedPoly.points[1].y, 25, 'Vértice 1 Y debe ser 25');

// Verificar clonación de obstáculo interior
assert.strictEqual(obstacles.length, 2, 'Debe haber 2 obstáculos (el original y el clonado)');
const clonedObs = obstacles[1];
assert.strictEqual(clonedObs.name, 'Chimenea Test (Copia)', 'Nombre del obstáculo clonado correcto');
assert.strictEqual(clonedObs.polyIdx, 1, 'El polyIdx del obstáculo clonado debe ser 1');
assert.strictEqual(clonedObs.cartesian.x, 25, 'Obstáculo X debe ser 25 (5 + 20)');
assert.strictEqual(clonedObs.cartesian.y, 30, 'Obstáculo Y debe ser 30 (5 + 25)');
assert.strictEqual(clonedObs.u, 25, 'Coordenada U recalculada debe ser 25');
assert.strictEqual(clonedObs.v, 30, 'Coordenada V recalculada debe ser 30');

// Verificar llamadas a layout incremental
assert.strictEqual(global._lastRecalcIdx, 1, 'recalculateLayoutAndObstacles debe haberse llamado con el nuevo índice (1)');
assert.strictEqual(global._lastFastRenderIdx, 1, 'wpFastRenderSimulatedPanels debe haberse llamado con el nuevo índice (1)');

// Verificar Undo Snapshots
assert.ok(undoSnaps.some(s => s.type === 'polylines'), 'Debe haberse guardado snapshot de polilíneas');
assert.ok(undoSnaps.some(s => s.type === 'obstacles'), 'Debe haberse guardado snapshot de obstáculos');

// Verificar notificación a jerarquía
assert.ok(hierarchyEvents.some(h => h.ev === 'polyline_added' && h.data.index === 1), 'ProjectHierarchy notificado con polyline_added');
console.log('✔ TEST 4 PASADO: Faldón y obstáculos clonados con traslación matemática exacta, undo y render incremental.');

// ----------------------------------------------------------------------------
// TEST 5: Cancelar modo estampar (wpCancelStampPolyline)
// ----------------------------------------------------------------------------
console.log('\n▶ TEST 5: Cancelar modo estampar limpiamente...');
wpStartStampPolyline(1);
assert.strictEqual(WP.mode, 'stamp-poly');
wpCancelStampPolyline(false);
assert.strictEqual(WP.mode, 'idle', 'WP.mode debe ser idle');
assert.strictEqual(WP.stampState, null, 'WP.stampState debe ser null');
console.log('✔ TEST 5 PASADO: Modo estampar cancelado y entidades liberadas.');

// ----------------------------------------------------------------------------
// TEST 6: Inclusión de faldón duplicado en simulación de sombras y heatmap
// ----------------------------------------------------------------------------
console.log('\n▶ TEST 6: Verificar inclusión de paneles duplicados en estudio de sombras...');
// Cargar motor de simulación solar y heatmap
const heatmapCode = fs.readFileSync('js/solar-heatmap.js', 'utf8');
eval(heatmapCode);

// Asignar paneles al faldón 0
WP.polylines[0].panels = [
  { panelId: 'pan_0_0', polyIdx: 0, layoutIndex: 0, annualLossPct: 1.0 },
  { panelId: 'pan_0_1', polyIdx: 0, layoutIndex: 1, annualLossPct: 3.0 }
];
WP.polylines[0].roofInfo = { panels: WP.polylines[0].panels };

// Comprobar que el faldón duplicado (índice 1) tiene paneles válidos
assert.ok(WP.polylines[1], 'El faldón duplicado debe existir en WP.polylines');
assert.ok(Array.isArray(WP.polylines[1].panels) && WP.polylines[1].panels.length > 0, 'El faldón duplicado debe tener paneles asociados');
assert.strictEqual(WP.polylines[1].panels[0].polyIdx, 1, 'Los paneles duplicados deben pertenecer al faldón 1');

// Evaluar diagnóstico MLPE
const evalResult = wpEvaluateMLPENecessity(WP);
assert.strictEqual(evalResult.totalPanels, 4, 'El diagnóstico MLPE debe contabilizar los paneles de ambos faldones (2 + 2 = 4)');
assert.strictEqual(evalResult.criticalLossPanelsCount, 1, 'Debe detectar el panel con 15% de pérdidas en el faldón duplicado');

// Sincronización de resultados de Web Worker hacia paneles del faldón duplicado
const mockResults = [
  { id: 'pan_0_0', polyIdx: 0, layoutIndex: 0, annualTotalPotential: 1000, annualShadedLoss: 10, annualLossPct: 1.0, annualYieldPct: 99.0 },
  { id: 'pan_0_1', polyIdx: 0, layoutIndex: 1, annualTotalPotential: 1000, annualShadedLoss: 30, annualLossPct: 3.0, annualYieldPct: 97.0 },
  { id: 'pan_1_0', polyIdx: 1, layoutIndex: 0, annualTotalPotential: 1000, annualShadedLoss: 20, annualLossPct: 2.0, annualYieldPct: 98.0 },
  { id: 'pan_1_1', polyIdx: 1, layoutIndex: 1, annualTotalPotential: 1000, annualShadedLoss: 150, annualLossPct: 15.0, annualYieldPct: 85.0 }
];
applyWorkerHeatmapResults(WP.polylines, mockResults, [], []);

assert.strictEqual(WP.polylines[1].panels[0].annualLossPct, 2.0, 'Panel pan_1_0 recibe pérdidas correctas del worker');
assert.strictEqual(WP.polylines[1].panels[1].annualLossPct, 15.0, 'Panel pan_1_1 recibe pérdidas correctas del worker');
assert.strictEqual(WP.polylines[1].panels[1].annualYieldPct, 85.0, 'Panel pan_1_1 recibe rendimiento correcto del worker');
console.log('✔ TEST 6 PASADO: Paneles de faldón duplicado integrados al 100% en estudio de sombras y heatmap.');

console.log('\n═════════════════════════════════════════════════════════════════════');
console.log('🎉 TODOS LOS TESTS DE DUPLICADO / ESTAMPAR HAN PASADO AL 100%!');
console.log('═════════════════════════════════════════════════════════════════════');
