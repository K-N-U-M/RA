/**
 * ═════════════════════════════════════════════════════════════════════════
 * test-solar-live-probe.js — Suite de Pruebas: Motor de Sondeo Solar en Tiempo Real
 * ═════════════════════════════════════════════════════════════════════════
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('═════════════════════════════════════════════════════════════════════════');
console.log('🔥 TEST SUITE: LIVE SOLAR PROBE ENGINE (CAD STEP 2 INTERACTIVE HEATMAP)');
console.log('═════════════════════════════════════════════════════════════════════════');

// 1. Mocks de entorno DOM y Cesium
global.window = global;
global.window.addEventListener = () => {};
global.document = {
  elements: {},
  getElementById(id) {
    if (!this.elements[id]) {
      this.elements[id] = {
        style: {},
        classList: { toggle: () => {}, contains: () => false },
        querySelector: () => ({ textContent: '', style: {} })
      };
    }
    return this.elements[id];
  },
  addEventListener: () => {}
};

const primitivesList = [];
global.Cesium = {
  Cartesian3: class Cartesian3 {
    constructor(x=0, y=0, z=0) { this.x = x; this.y = y; this.z = z; }
    static subtract(a, b, res) { res.x = a.x - b.x; res.y = a.y - b.y; res.z = a.z - b.z; return res; }
    static add(a, b, res) { res.x = a.x + b.x; res.y = a.y + b.y; res.z = a.z + b.z; return res; }
    static cross(a, b, res) {
      res.x = a.y * b.z - a.z * b.y;
      res.y = a.z * b.x - a.x * b.z;
      res.z = a.x * b.y - a.y * b.x;
      return res;
    }
    static multiplyByScalar(a, s, res) { res.x = a.x * s; res.y = a.y * s; res.z = a.z * s; return res; }
    static magnitude(a) { return Math.sqrt(a.x*a.x + a.y*a.y + a.z*a.z); }
    static normalize(a, res) {
      const m = Math.sqrt(a.x*a.x + a.y*a.y + a.z*a.z) || 1;
      res.x = a.x / m; res.y = a.y / m; res.z = a.z / m;
      return res;
    }
    static dot(a, b) { return a.x*b.x + a.y*b.y + a.z*b.z; }
    static clone(a) { return new Cartesian3(a.x, a.y, a.z); }
  },
  Color: class Color {
    constructor(r, g, b, a) { this.red = r; this.green = g; this.blue = b; this.alpha = a; }
  },
  ColorGeometryInstanceAttribute: {
    fromColor: col => ({ value: col })
  },
  Geometry: class Geometry {
    constructor(opts) { this.attributes = opts.attributes; }
  },
  GeometryAttribute: class GeometryAttribute {
    constructor(opts) { this.values = opts.values; }
  },
  BoundingSphere: {
    fromPoints: () => ({})
  },
  PrimitiveType: { TRIANGLES: 4 },
  ComponentDatatype: { DOUBLE: 'DOUBLE', FLOAT: 'FLOAT' },
  GeometryInstance: class GeometryInstance {
    constructor(opts) { this.geometry = opts.geometry; this.attributes = opts.attributes; }
  },
  PerInstanceColorAppearance: class PerInstanceColorAppearance {
    constructor(opts) { this.translucent = opts.translucent; }
  },
  Primitive: class Primitive {
    constructor(opts) {
      this.geometryInstances = opts.geometryInstances;
      this._destroyed = false;
    }
    destroy() { this._destroyed = true; }
    isDestroyed() { return this._destroyed; }
  },
  RenderState: {
    fromCache: () => ({})
  }
};

global.viewer = {
  scene: {
    primitives: {
      add(p) { primitivesList.push(p); return p; },
      remove(p) {
        const idx = primitivesList.indexOf(p);
        if (idx >= 0) primitivesList.splice(idx, 1);
        return true;
      }
    },
    requestRender: () => {}
  }
};

// Cargar el módulo
require(path.join(__dirname, '../js/solar-live-probe.js'));

const probe = global.LiveSolarProbe;
assert.ok(probe, 'LiveSolarProbe debe exportarse globalmente');
assert.strictEqual(probe.enabled, false, 'Debe iniciar desactivado por defecto');

// Caso 1: Conmutar activación
probe.toggle();
assert.strictEqual(probe.enabled, true, 'toggle() debe encender el probe');

// Caso 2: Evaluación con cubierta limpia (sin obstáculos)
global.allRenderedPanels = [
  {
    corners: [
      new Cesium.Cartesian3(0, 0, 10),
      new Cesium.Cartesian3(1, 0, 10),
      new Cesium.Cartesian3(1, 2, 10),
      new Cesium.Cartesian3(0, 2, 10)
    ],
    polyIdx: 0,
    u: 0.5,
    v: 1.0,
    w: 1.0,
    h: 2.0
  }
];
global.wpState = {
  polylines: [
    {
      roofInfo: {
        uVec: new Cesium.Cartesian3(1, 0, 0),
        vVec: new Cesium.Cartesian3(0, 1, 0)
      }
    }
  ],
  center: { lat: 40.4168, lng: -3.7038 }
};
global.obstacles = [];
global.buildings = [];

probe.evaluate(true);
assert.ok(probe._overlayPrimitive, 'Debe generar la primitiva de superposición en el visor');
assert.strictEqual(primitivesList.length, 1, 'Debe haber 1 primitiva de overlay añadida');

// Caso 3: Evaluación con obstáculo arrojando sombra
global.obstacles = [
  {
    h: 3.0,
    poly2D: [
      { u: -0.2, v: -0.2 },
      { u: 0.2, v: -0.2 },
      { u: 0.2, v: 0.2 },
      { u: -0.2, v: 0.2 }
    ]
  }
];

probe.evaluate(true);
assert.ok(probe._overlayPrimitive, 'Debe reconstruir la primitiva de superposición con sombra');
assert.strictEqual(primitivesList.length, 1, 'Debe mantener un único overlay activo en escena');

// Caso 4: Desactivación limpia
probe.setEnabled(false);
assert.strictEqual(probe.enabled, false, 'setEnabled(false) debe apagar el probe');
assert.strictEqual(probe._overlayPrimitive, null, 'El overlay debe ser nulo tras clearOverlay');
assert.strictEqual(primitivesList.length, 0, 'La primitiva Cesium debe ser retirada del visor');

console.log('✅ Todas las pruebas de LiveSolarProbe completadas con éxito.');
