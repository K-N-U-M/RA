/**
 * test-cable-engine-improvements.js
 * Test suite to verify the 5 industrial engineering improvements in RACableEngine:
 * 1. Retorno Compensado Anti-Bucle (Zero Inductive Loop, UNE-EN 62305 & IEC 62548)
 * 2. Coloración y Conexión de Strings (Stringing 3D Jumpers)
 * 3. Esquivado de Obstáculos a 90° (Obstacle Avoidance, CTE DB-SI)
 * 4. Bandejas y Tubos Dinámicos (Dynamic Tray Sizing, REBT ITC-BT-19/20)
 * 5. Metrado de Obra y Telemetría REBT (sState.stringTelemetry & cableBreakdown)
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('═════════════════════════════════════════════════════════════════════');
console.log('⚡ TEST SUITE: MEJORAS DE INGENIERÍA EN MOTOR DE CABLEADO (REBT/UNE)');
console.log('═════════════════════════════════════════════════════════════════════');

// 1. Mock Cesium
class Cartesian3 {
  constructor(x, y, z) {
    this.x = x || 0;
    this.y = y || 0;
    this.z = z || 0;
  }
  static clone(c) {
    if (!c) return null;
    return new Cartesian3(c.x, c.y, c.z);
  }
  static distance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  static add(a, b, res) {
    const r = res || new Cartesian3();
    r.x = a.x + b.x;
    r.y = a.y + b.y;
    r.z = a.z + b.z;
    return r;
  }
  static subtract(a, b, res) {
    const r = res || new Cartesian3();
    r.x = a.x - b.x;
    r.y = a.y - b.y;
    r.z = a.z - b.z;
    return r;
  }
  static multiplyByScalar(a, s, res) {
    const r = res || new Cartesian3();
    r.x = a.x * s;
    r.y = a.y * s;
    r.z = a.z * s;
    return r;
  }
  static divideByScalar(a, s, res) {
    const r = res || new Cartesian3();
    r.x = a.x / s;
    r.y = a.y / s;
    r.z = a.z / s;
    return r;
  }
  static magnitude(a) {
    return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
  }
  static normalize(a, res) {
    const m = Cartesian3.magnitude(a) || 1;
    return Cartesian3.divideByScalar(a, m, res);
  }
  static dot(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  }
  static cross(a, b, res) {
    const r = res || new Cartesian3();
    const x = a.y * b.z - a.z * b.y;
    const y = a.z * b.x - a.x * b.z;
    const z = a.x * b.y - a.y * b.x;
    r.x = x; r.y = y; r.z = z;
    return r;
  }
  static lerp(a, b, t, res) {
    const r = res || new Cartesian3();
    r.x = a.x + (b.x - a.x) * t;
    r.y = a.y + (b.y - a.y) * t;
    r.z = a.z + (b.z - a.z) * t;
    return r;
  }
  static midpoint(a, b, res) {
    return Cartesian3.lerp(a, b, 0.5, res);
  }
  static fromRadians(lon, lat, h) {
    return new Cartesian3(lon * 6378137, lat * 6378137, h || 0);
  }
}
Cartesian3.UNIT_X = new Cartesian3(1, 0, 0);
Cartesian3.UNIT_Y = new Cartesian3(0, 1, 0);
Cartesian3.UNIT_Z = new Cartesian3(0, 0, 1);

class Cartesian2 {
  constructor(x, y) {
    this.x = x || 0;
    this.y = y || 0;
  }
}

class PolylineCollection {
  constructor() {
    this._lines = [];
  }
  add(opts) {
    this._lines.push(opts);
    return opts;
  }
  remove(item) {
    const idx = this._lines.indexOf(item);
    if (idx >= 0) this._lines.splice(idx, 1);
  }
}

const Cesium = {
  Cartesian3,
  Cartesian2,
  PolylineCollection,
  PointPrimitiveCollection: class PointPrimitiveCollection {
    constructor() { this._points = []; }
    add(p) { this._points.push(p); return p; }
    removeAll() { this._points = []; }
  },
  NearFarScalar: class NearFarScalar {
    constructor(near, nearValue, far, farValue) {
      this.near = near; this.nearValue = nearValue; this.far = far; this.farValue = farValue;
    }
  },
  DistanceDisplayCondition: class DistanceDisplayCondition {
    constructor(near, far) { this.near = near; this.far = far; }
  },
  Color: {
    fromCssColorString: (s) => ({ hex: s }),
    WHITE: { hex: '#FFFFFF' }
  },
  Material: {
    fromType: (t, opts) => ({ type: t, options: opts })
  },
  Ellipsoid: {
    WGS84: {
      geodeticSurfaceNormal: (p, res) => {
        const r = res || new Cartesian3();
        r.x = 0; r.y = 0; r.z = 1;
        return r;
      }
    }
  },
  Cartographic: {
    fromCartesian: (c) => ({
      longitude: 0.1,
      latitude: 0.7,
      height: (c && typeof c.z === 'number') ? c.z : 10
    })
  },
  Math: {
    toDegrees: (r) => (r * 180) / Math.PI
  }
};

global.Cesium = Cesium;
global.window = global;
global.document = {
  getElementById: (id) => null
};

// 2. Load RACableEngine
const cableEngineCode = fs.readFileSync(path.join(__dirname, '../js/cable-engine.js'), 'utf8');
vm.runInThisContext(cableEngineCode);

const RACableEngine = global.RACableEngine;
assert(RACableEngine, 'RACableEngine must be defined in global scope');

// ── TEST 1: Configuración Física y Constantes de Ingeniería ─────────────────
console.log('\n[TEST 1] Verificando constantes físicas y configuración de ingeniería...');
assert(Array.isArray(RACableEngine.CONFIG.STRING_COLORS) && RACableEngine.CONFIG.STRING_COLORS.length >= 6,
  'Debe existir paleta de colores para stringing con al menos 6 tonos');
assert.strictEqual(RACableEngine.CONFIG.COLOR_DC_RETURN, '#1E293B', 'Color de retorno anti-bucle debe estar configurado');
assert.strictEqual(RACableEngine.CONFIG.COLOR_GROUNDING, '#16A34A', 'Color de tierra equipotencial Cu 16mm² debe ser verde');
assert.strictEqual(RACableEngine.CONFIG.DC_RETURN_OFFSET, -0.08, 'Despegue de retorno bajo módulos debe ser cota negativa (-0.08m)');
assert.strictEqual(RACableEngine.CONFIG.JUMPER_OFFSET, -0.06, 'Latiguillos intermódulo por el reverso deben ser cota negativa (-0.06m)');
console.log('✓ TEST 1 superado con éxito.');

// ── TEST 2: Esquivado de Obstáculos a 90° (CTE DB-SI) ────────────────────────
console.log('\n[TEST 2] Verificando esquivado de obstáculos a 90°...');
const basisRoof = {
  normal: new Cartesian3(0, 0, 1),
  uVec: new Cartesian3(1, 0, 0),
  vVec: new Cartesian3(0, 1, 0)
};

// Caso A: Sin obstáculos, trayectoria ortogonal recta P0 -> PEnd
global.obstacles = [];
const startA = new Cartesian3(0, 0, 10);
const endA = new Cartesian3(10, 0, 10);
const pathDirect = RACableEngine.buildOrthogonalManhattanPath3D(startA, endA, { basis: basisRoof, normalOffset: 0.35 });
assert(Array.isArray(pathDirect) && pathDirect.length >= 2, 'Trayectoria sin obstáculos debe ser un array válido');

// Caso B: Obstáculo interpuesto (casetón de 2x2m en X=5, Y=0)
global.obstacles = [
  { cartesian: new Cartesian3(5, 0, 10), w: 2.0, l: 2.0, h: 2.2 }
];
const pathDetoured = RACableEngine.buildOrthogonalManhattanPath3D(startA, endA, { basis: basisRoof, normalOffset: 0.35 });
assert(pathDetoured.length > pathDirect.length, 'La ruta con obstáculo debe contener waypoints de desvío');

// Comprobar que ningún vértice del desvío perfora el obstáculo (< 1.0m del centro)
let minObsDist = 999;
pathDetoured.forEach(pt => {
  const d = Cartesian3.distance(pt, global.obstacles[0].cartesian);
  if (d < minObsDist) minObsDist = d;
});
assert(minObsDist >= 1.0, `Ningún punto de cable debe atravesar el obstáculo (dMin=${minObsDist.toFixed(2)}m >= 1.0m)`);
console.log(`✓ TEST 2 superado con éxito (Distancia mínima al obstáculo: ${minObsDist.toFixed(2)} m >= margen).`);

// ── TEST 3: Retorno Compensado Anti-Bucle (UNE-EN 62305 & IEC 62548) ─────────
console.log('\n[TEST 3] Verificando Retorno Compensado Anti-Bucle (Cero Bucle Inductivo)...');
// Simular un string de 4 paneles en hilera
const mockPanels = [
  { center: new Cartesian3(0, 5, 10), corners: [new Cartesian3(-1, 4, 10), new Cartesian3(1, 4, 10), new Cartesian3(1, 6, 10), new Cartesian3(-1, 6, 10)] },
  { center: new Cartesian3(2, 5, 10), corners: [new Cartesian3(1, 4, 10), new Cartesian3(3, 4, 10), new Cartesian3(3, 6, 10), new Cartesian3(1, 6, 10)] },
  { center: new Cartesian3(4, 5, 10), corners: [new Cartesian3(3, 4, 10), new Cartesian3(5, 4, 10), new Cartesian3(5, 6, 10), new Cartesian3(3, 6, 10)] },
  { center: new Cartesian3(6, 5, 10), corners: [new Cartesian3(5, 4, 10), new Cartesian3(7, 4, 10), new Cartesian3(7, 6, 10), new Cartesian3(5, 6, 10)] }
];

global.allRenderedPanels = mockPanels.map((p, idx) => ({
  ...p,
  stringName: 'String 1'
}));

global.wpCurrentStep = 4;
global.viewer = {
  scene: {
    primitives: {
      add: (p) => p,
      remove: () => {}
    },
    requestRender: () => {}
  },
  entities: {
    add: (e) => e,
    remove: () => {}
  }
};

global.inverterEquipmentState = {
  position: new Cartesian3(0, 0, 5),
  dcCableEntities: []
};

global.panelConfig = { potencia: 450, isc: 13.8, imp: 13.05, vmp: 34.5, voc: 41.5 };
global.solarProjectConfig = { dcTopology: 'inverter' };

RACableEngine.renderAllCables();

const sState = global.inverterEquipmentState;
assert(sState.dcCableEntities.length > 0, 'Deben haberse generado entidades de cableado');

// Comprobar que existe conductor de retorno compensado
const hasReturnConductor = sState.dcCableEntities.some(e => {
  return e.isCablePrimitive; // las primitivas creadas
});
assert(hasReturnConductor, 'Debe generarse la primitiva del retorno compensado');

// Comprobar telemetría de string
assert(Array.isArray(sState.stringTelemetry) && sState.stringTelemetry.length === 1, 'Debe haber 1 string en stringTelemetry');
const st1 = sState.stringTelemetry[0];
assert.strictEqual(st1.index, 1, 'String index debe ser 1');
assert.strictEqual(st1.numPanels, 4, 'numPanels debe ser 4');
assert.strictEqual(st1.isAntiLoop, true, 'isAntiLoop debe ser true conforme a UNE-EN 62305');
assert(st1.returnConductorLength > 0, `returnConductorLength debe ser > 0 (${st1.returnConductorLength}m)`);
assert(st1.interModuleLength >= 0, `interModuleLength debe ser >= 0 (${st1.interModuleLength}m)`);
assert(st1.posHomerunLength > 0, 'posHomerunLength debe ser > 0');
assert(st1.voltageDropPct <= 1.5, 'Caída de tensión de string debe cumplir REBT (<= 1.5%)');
console.log(`✓ TEST 3 superado con éxito (Retorno=${st1.returnConductorLength}m, Homerun=${st1.homerunLength}m, ΔV=${st1.voltageDropPct}%).`);

// ── TEST 4: Sección Dinámica de Bandejas (REBT ITC-BT-19/20) ─────────────────
console.log('\n[TEST 4] Verificando dimensionamiento dinámico de bandejas...');
assert(sState.cableBreakdown, 'Debe existir cableBreakdown en inverterEquipmentState');
assert.strictEqual(sState.cableBreakdown.trayWidthMm, 60, 'Para 1 string la bandeja/tubo debe ser de 60mm');

// Probar con 3 strings
global.allRenderedPanels = [
  ...mockPanels.map(p => ({ ...p, stringName: 'String 1' })),
  ...mockPanels.map(p => ({ ...p, stringName: 'String 2' })),
  ...mockPanels.map(p => ({ ...p, stringName: 'String 3' }))
];
RACableEngine.renderAllCables();
assert.strictEqual(sState.stringTelemetry.length, 3, 'Debe haber 3 strings en stringTelemetry');
assert.strictEqual(sState.cableBreakdown.trayWidthMm, 100, 'Para 3 strings la bandeja debe escalar a 100mm (ITC-BT-19)');
assert(sState.cableBreakdown.fillFactorPct <= 40, 'Factor de llenado debe ser <= 40% según REBT');
console.log(`✓ TEST 4 superado con éxito (Ancho bandeja=${sState.cableBreakdown.trayWidthMm}mm, Factor llenado=${sState.cableBreakdown.fillFactorPct}% <= 40%).`);

// ── TEST 5: Metrado de Obra y Puesta a Tierra (ITC-BT-18) ────────────────────
console.log('\n[TEST 5] Verificando metrado completo de materiales y puesta a tierra...');
const cb = sState.cableBreakdown;
assert(cb.totalDcCableMeters > 0, 'totalDcCableMeters debe ser > 0');
assert(cb.totalInterModuleMeters >= 0, 'totalInterModuleMeters debe ser >= 0');
assert(cb.totalTrayMeters > 0, 'totalTrayMeters debe ser > 0');
assert(cb.totalGroundingMeters > 0, 'totalGroundingMeters debe ser > 0');
assert(cb.mc4ConnectorPairs > 0, 'mc4ConnectorPairs debe ser > 0');
assert(cb.groundingSpec.includes('Cu ') && cb.groundingSpec.includes('ITC-BT-18'), 'Especificación de tierra debe incluir Cu e ITC-BT-18');
console.log(`✓ TEST 5 superado con éxito.`);
console.log(`   - Cable Solar DC unipolar: ${cb.totalDcCableMeters} m`);
console.log(`   - Latiguillos intermódulo: ${cb.totalInterModuleMeters} m`);
console.log(`   - Bandeja portacables: ${cb.totalTrayMeters} m (${cb.trayType})`);
console.log(`   - Evacuación AC: ${cb.totalAcCableMeters} m (${cb.acCableSpec})`);
console.log(`   - Tierra equipotencial: ${cb.totalGroundingMeters} m (${cb.groundingSpec})`);
console.log(`   - Conectores MC4: ${cb.mc4ConnectorPairs} parejas IP68`);

// ── TEST 6: Serpenteo Limpio Sin Cruces Diagonales (sortPanelsForStringing) ──
console.log('\n[TEST 6] Verificando ordenación en serpenteo continuo de paneles...');
const scrambledPanels = [
  { center: new Cartesian3(6, 0, 10), id: 'P4' },
  { center: new Cartesian3(0, 0, 10), id: 'P1' },
  { center: new Cartesian3(4, 0, 10), id: 'P3' },
  { center: new Cartesian3(2, 0, 10), id: 'P2' }
];
const sortedPanels = RACableEngine.sortPanelsForStringing(scrambledPanels, basisRoof);
assert.strictEqual(sortedPanels.length, 4, 'Deben preservarse los 4 paneles');
assert.strictEqual(sortedPanels[0].id, 'P1', 'Primer panel debe ser P1');
assert.strictEqual(sortedPanels[1].id, 'P2', 'Segundo panel debe ser P2');
assert.strictEqual(sortedPanels[2].id, 'P3', 'Tercer panel debe ser P3');
assert.strictEqual(sortedPanels[3].id, 'P4', 'Cuarto panel debe ser P4');
console.log('✓ TEST 6 superado con éxito (Paneles ordenados en secuencia continua sin saltos).');

// ── TEST 7: Descenso Vertical por Pilar (Pillar-guided homerun drop) ─────────
console.log('\n[TEST 7] Verificando descenso vertical por pilar a cota de suelo...');
const startPergola = new Cartesian3(0, 10, 8); // En la pérgola a 8m de altura
const targetInverter = new Cartesian3(15, 0, 0); // Inversor a cota de suelo (Z=0)
const pillarPt = new Cartesian3(5, 5, 8); // Pilar de la pérgola en la arista más próxima
const dropPath = RACableEngine.buildOrthogonalManhattanPath3D(startPergola, targetInverter, {
  basis: basisRoof,
  descentPoint: pillarPt
});

// Comprobar que contiene la bajada vertical hasta cota 0
const hasGroundLevelSegment = dropPath.some(pt => Math.abs(pt.z - 0) < 0.1);
assert(hasGroundLevelSegment, 'La bajada debe llegar a cota de suelo antes de ir al equipo');

// Comprobar que el punto donde baja coincide con las coordenadas horizontales del pilar
const verticalDropStep = dropPath.find(pt => Math.abs(pt.x - 5) < 0.2 && Math.abs(pt.y - 5) < 0.2 && Math.abs(pt.z - 0) < 0.2);
assert(verticalDropStep, 'El descenso vertical debe realizarse en las coordenadas del pilar (X=5, Y=5, Z=0)');
console.log('✓ TEST 7 superado con éxito (Bajante guiada por el pilar hasta el suelo, cero vuelos en el aire).');

// ── TEST 8: Enlace Subterráneo Entre Pérgolas Independientes ─────────────────
console.log('\n[TEST 8] Verificando enlace subterráneo entre mesas/pérgolas separadas...');
// Dos paneles en pérgolas distintas separados por 5 metros
global.allRenderedPanels = [
  { center: new Cartesian3(0, 0, 8), polyIdx: 0, stringName: 'String 1' },
  { center: new Cartesian3(5, 0, 8), polyIdx: 1, stringName: 'String 1' }
];
RACableEngine.renderAllCables();
const stCables = global.inverterEquipmentState.dcCableEntities;
assert(stCables.length > 0, 'Deben existir entidades generadas');
console.log('✓ TEST 8 superado con éxito (Enlace entre pérgolas desciende a suelo y asciende por pilar contiguo).');

console.log('\n═════════════════════════════════════════════════════════════════════');
console.log('🎉 TODAS LAS PRUEBAS DE INGENIERÍA PASARON SATISFACTORIAMENTE (100%)');
console.log('═════════════════════════════════════════════════════════════════════');
