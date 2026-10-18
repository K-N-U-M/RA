/**
 * ═════════════════════════════════════════════════════════════════════════
 * test-project-storage.js — Batería de Pruebas Automatizadas de Persistencia
 * Validación de Serialización, Rehidratación Cartesian3, Gemelo Digital y Cámara
 * ═════════════════════════════════════════════════════════════════════════
 */

const assert = require('assert');
const fs = require('fs');

console.log('═════════════════════════════════════════════════════════════════════════');
console.log('📦 INICIANDO TEST SUITE: PERSISTENCIA, GUARDADO Y CARGA (.raproject)');
console.log('═════════════════════════════════════════════════════════════════════════');

// 1. Mock de Cesium
class MockCartesian3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
  static clone(c) {
    return new MockCartesian3(c.x, c.y, c.z);
  }
  static distance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  static subtract(a, b, res) {
    const r = res || new MockCartesian3();
    r.x = a.x - b.x;
    r.y = a.y - b.y;
    r.z = a.z - b.z;
    return r;
  }
  static add(a, b, res) {
    const r = res || new MockCartesian3();
    r.x = a.x + b.x;
    r.y = a.y + b.y;
    r.z = a.z + b.z;
    return r;
  }
  static multiplyByScalar(a, s, res) {
    const r = res || new MockCartesian3();
    r.x = a.x * s;
    r.y = a.y * s;
    r.z = a.z * s;
    return r;
  }
  static normalize(a, res) {
    const mag = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z) || 1;
    const r = res || new MockCartesian3();
    r.x = a.x / mag;
    r.y = a.y / mag;
    r.z = a.z / mag;
    return r;
  }
  static cross(a, b, res) {
    const r = res || new MockCartesian3();
    r.x = a.y * b.z - a.z * b.y;
    r.y = a.z * b.x - a.x * b.z;
    r.z = a.x * b.y - a.y * b.x;
    return r;
  }
  static magnitude(a) {
    return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
  }
}

global.Cesium = {
  Cartesian3: MockCartesian3,
  Math: {
    toDegrees: r => r * 180 / Math.PI,
    toRadians: d => d * Math.PI / 180
  },
  ConstantPositionProperty: function(pos) { this.position = pos; }
};

// 2. Mock de Entorno Global y DOM
global.window = global;
global.document = {
  getElementById: function(id) {
    if (!this._elements) this._elements = {};
    if (!this._elements[id]) {
      this._elements[id] = {
        id: id,
        value: '',
        textContent: '',
        style: {},
        classList: {
          contains: () => false,
          toggle: () => {},
          add: () => {},
          remove: () => {}
        }
      };
    }
    return this._elements[id];
  },
  createElement: function(tag) {
    return {
      tagName: tag,
      style: {},
      innerHTML: '',
      appendChild: () => {}
    };
  },
  head: { appendChild: () => {} },
  body: { appendChild: () => {}, removeChild: () => {} }
};

let lastCameraSetView = null;
global.viewer = {
  camera: {
    position: new MockCartesian3(4800000, 300000, 4100000),
    direction: new MockCartesian3(-0.6, -0.2, -0.7),
    up: new MockCartesian3(0.1, 0.9, -0.4),
    heading: 1.25,
    pitch: -0.65,
    roll: 0.01,
    positionCartographic: { longitude: 0.035, latitude: 0.72, height: 120 },
    setView: function(opts) {
      lastCameraSetView = opts;
    }
  },
  entities: {
    remove: () => {},
    add: (obj) => ({ ...obj, id: obj.id || 'ent_' + Math.random() })
  },
  scene: {
    primitives: {
      remove: () => {},
      add: (obj) => obj
    },
    requestRender: () => {}
  }
};

// Cargar script de project-storage
const code = fs.readFileSync('js/project-storage.js', 'utf8');
eval(code);

assert.strictEqual(typeof global.raExportProjectData, 'function', 'raExportProjectData debe estar exportada');
assert.strictEqual(typeof global.raImportProjectData, 'function', 'raImportProjectData debe estar exportada');

console.log('✓ Script js/project-storage.js cargado e inicializado correctamente.');

// --- TEST 1: Exportación Completa ---
global.WP = {
  activePlaneIdx: 0,
  selectedPolyIdx: 0,
  planes: [
    {
      id: 'plane_sur',
      name: 'Faldón Principal Sur',
      origin: new MockCartesian3(100, 200, 300),
      normal: new MockCartesian3(0, 0, 1),
      uVec: new MockCartesian3(1, 0, 0),
      vVec: new MockCartesian3(0, 1, 0),
      tiltDeg: 25,
      azimuthDeg: 180,
      area: 85.5
    }
  ],
  polylines: [
    {
      id: 'faldon_1',
      name: 'Cubierta Sur Teja',
      planeIdx: 0,
      structureType: 'coplanar_teja',
      orientationPref: 'portrait',
      modTilt: 'auto',
      modAzimuth: 'auto',
      area: 85.5,
      points: [
        new MockCartesian3(100, 200, 300),
        new MockCartesian3(110, 200, 300),
        new MockCartesian3(110, 210, 300),
        new MockCartesian3(100, 210, 300)
      ],
      color: '#38bdf8',
      deletedPanels: [],
      roofInfo: {
        area: 85.5,
        tilt: 25,
        azimuth: 180,
        panels: [
          {
            u: 2.0, v: 3.0, w: 1.134, h: 2.278,
            orientation: 'portrait',
            tiltDeg: 25, azimuthDeg: 180,
            stringId: 'STR-1',
            panelId: 'MOD-1',
            annualKwh: 685.2,
            shadePct: 2.4,
            center: new MockCartesian3(105, 205, 300),
            corners: [
              new MockCartesian3(104, 204, 300),
              new MockCartesian3(106, 204, 300),
              new MockCartesian3(106, 206, 300),
              new MockCartesian3(104, 206, 300)
            ]
          }
        ]
      }
    }
  ]
};

global.obstacles = [
  {
    id: 'obs_chimenea',
    type: 'chimney',
    name: 'Chimenea Obra',
    cartesian: new MockCartesian3(102, 204, 301),
    w: 0.6, l: 0.6, h: 1.2,
    rot: 15
  },
  {
    id: 'obs_aerogenerador',
    type: 'wind_turbine',
    name: 'Aerogenerador HAWT',
    cartesian: new MockCartesian3(108, 208, 300),
    turbineType: 'hawt',
    mastHeight: 8.0,
    bladeRadius: 2.5,
    w: 5.0, l: 5.0, h: 10.5,
    rot: 0
  }
];

global.buildings = [
  {
    id: 'bld_nave',
    name: 'Nave Industrial',
    isRectangular: true,
    ladoA: 30.0, ladoB: 15.0,
    wallHeight: 7.0, roofHeight: 9.0, parapetHeight: 0.5,
    roofType: 'gable',
    facadeColor: '#F1F5F9',
    roofColor: '#E2E8F0',
    points: [
      new MockCartesian3(50, 50, 0),
      new MockCartesian3(80, 50, 0),
      new MockCartesian3(80, 65, 0),
      new MockCartesian3(50, 65, 0)
    ]
  }
];

global.solarProjectConfig = {
  selectedModuleId: 'mod_aiko_450',
  selectedInverterId: 'inv_huawei_sun2000_10ktl',
  selectedBatteryId: 'bat_luna2000_10kwh',
  selectedTopology: 'inverter',
  selectedObjective: 'max_roof',
  targetKwp: 10.0
};

global.solarSimState = {
  monthIdx: 6,
  hour: 13,
  viewMode: 'heatmap'
};

global.inverterEquipmentState = {
  position: new MockCartesian3(95, 195, 290),
  rotation: 45,
  dcProtectionPosition: new MockCartesian3(95.5, 195, 290.2),
  dcProtectionRotation: 45,
  batteryPosition: new MockCartesian3(94, 195, 290),
  batteryRotation: 45,
  gridMeter: { position: new MockCartesian3(90, 190, 285), rotation: 0 },
  combinerBox: { isEnabled: true, position: new MockCartesian3(98, 198, 295), rotation: 0 },
  routes: {
    dc: [new MockCartesian3(105, 205, 300), new MockCartesian3(95, 195, 290)],
    ac: [new MockCartesian3(95, 195, 290), new MockCartesian3(90, 190, 285)]
  },
  L_dc_measured: 14.5,
  L_ac_measured: 8.2
};

global.wpCurrentStep = 4;

const exported = global.raExportProjectData();

assert.strictEqual(exported.format, 'RA_SOLAR_PROJECT', 'Formato debe ser RA_SOLAR_PROJECT');
assert.strictEqual(exported.metadata.currentStep, 4, 'currentStep debe exportarse fielmente');
assert.strictEqual(exported.workPlanes.planes.length, 1, 'Debe exportar 1 plano de trabajo');
assert.strictEqual(exported.polylines.length, 1, 'Debe exportar 1 faldón');
assert.strictEqual(exported.polylines[0].id, 'faldon_1', 'Debe preservar el id del faldón');
assert.strictEqual(exported.polylines[0].name, 'Cubierta Sur Teja', 'Debe preservar el nombre del faldón');
assert.strictEqual(exported.polylines[0].roofInfo.panels[0].annualKwh, 685.2, 'Debe preservar producción anual');
assert.strictEqual(exported.obstacles.length, 2, 'Debe exportar 2 obstáculos');
assert.strictEqual(exported.obstacles[1].type, 'wind_turbine', 'Debe exportar el aerogenerador');
assert.strictEqual(exported.buildings.length, 1, 'Debe exportar 1 edificio');
assert.strictEqual(exported.electricalInfrastructure.dcProtection.position.x, 95.5, 'Debe exportar dcProtection');
assert.strictEqual(exported.camera.heading, 1.25, 'Debe exportar heading de cámara');
assert.strictEqual(exported.camera.pitch, -0.65, 'Debe exportar pitch de cámara');

console.log('✓ PASS: Exportación completa y fidedigna (Faldones, Obstáculos, Aerogeneradores, Edificios, REBT y Cámara).');

// --- TEST 2: Serialización Limpia a JSON ---
const jsonString = JSON.stringify(exported);
const reParsed = JSON.parse(jsonString);
assert.strictEqual(typeof jsonString, 'string', 'Serialización JSON exitosa');
assert.strictEqual(reParsed.format, 'RA_SOLAR_PROJECT', 'JSON re-parseado válido');
console.log('✓ PASS: Serialización a string JSON sin referencias circulares ni fugas GPU.');

// --- TEST 3: Deserialización y Rehidratación Cartesian3 ---
// Limpiar estado vivo para verificar la restauración desde cero
global.WP.planes = [];
global.WP.polylines = [];
global.obstacles = [];
global.buildings = [];
global.solarProjectConfig = {};
global.inverterEquipmentState = {};
lastCameraSetView = null;

let windTurbinesRendered = false;
global.RAWindTurbine = {
  cleanAll: () => {},
  ensureProps: () => {},
  renderAll: () => { windTurbinesRendered = true; }
};

let batteryRendered = false;
global.wpRenderBattery3D = () => { batteryRendered = true; };

let cablesRendered = false;
global.RACableEngine = {
  renderAllCables: () => { cablesRendered = true; }
};

let stepNavigated = 0;
global.wpGoToStep = (st) => { stepNavigated = st; };

// Ejecutar importación
(async () => {
  const ok = await global.raImportProjectData(reParsed);
  assert.strictEqual(ok, true, 'raImportProjectData debe retornar true');

  // Verificar Rehidratación de Cartesian3
  assert.strictEqual(global.WP.planes.length, 1, 'Plano restaurado');
  assert.ok(global.WP.planes[0].origin instanceof MockCartesian3, 'Plano origin debe ser Cartesian3');
  assert.ok(global.WP.planes[0].normal instanceof MockCartesian3, 'Plano normal debe ser Cartesian3');

  assert.strictEqual(global.WP.polylines.length, 1, 'Faldón restaurado');
  assert.strictEqual(global.WP.polylines[0].id, 'faldon_1', 'Faldón ID preservado');
  assert.strictEqual(global.WP.polylines[0].name, 'Cubierta Sur Teja', 'Faldón nombre preservado');
  assert.ok(global.WP.polylines[0].points[0] instanceof MockCartesian3, 'Faldón point debe ser Cartesian3');
  assert.ok(global.WP.polylines[0].roofInfo.panels[0].center instanceof MockCartesian3, 'Panel center debe ser Cartesian3');
  assert.ok(global.WP.polylines[0].roofInfo.panels[0].corners[0] instanceof MockCartesian3, 'Panel corner debe ser Cartesian3');

  // Verificar Obstáculos y Aerogeneradores
  assert.strictEqual(global.obstacles.length, 2, 'Obstáculos restaurados');
  assert.ok(global.obstacles[0].cartesian instanceof MockCartesian3, 'Obstáculo cartesian debe ser Cartesian3');
  assert.ok(global.obstacles[1].cartesian instanceof MockCartesian3, 'Aerogenerador cartesian debe ser Cartesian3');
  assert.strictEqual(windTurbinesRendered, true, 'RAWindTurbine.renderAll debe haberse ejecutado');

  // Verificar Edificios
  assert.strictEqual(global.buildings.length, 1, 'Edificio restaurado');
  assert.ok(global.buildings[0].points[0] instanceof MockCartesian3, 'Puntos de edificio deben ser Cartesian3');
  assert.strictEqual(global.buildings[0].ladoA, 30.0, 'Parámetro ladoA intacto');

  // Verificar Gemelo Eléctrico
  assert.ok(batteryRendered, 'wpRenderBattery3D debe haberse ejecutado');
  assert.ok(cablesRendered, 'RACableEngine.renderAllCables debe haberse ejecutado');

  // Verificar Catálogo y Configuración
  assert.strictEqual(global.solarProjectConfig.selectedInverterId, 'inv_huawei_sun2000_10ktl', 'Inversor restaurado');
  assert.strictEqual(global.solarProjectConfig.selectedModuleId, 'mod_aiko_450', 'Módulo restaurado');

  // Verificar Simulación Solar y Hora
  assert.strictEqual(global.solarSimState.monthIdx, 6, 'Mes solar restaurado');
  assert.strictEqual(global.solarSimState.hour, 13, 'Hora solar restaurada');

  // Verificar Navegación al Paso Objetivo
  assert.strictEqual(stepNavigated, 4, 'Debe navegar al paso 4 guardado en el proyecto');

  // Verificar Fijación Final de Cámara (Lock)
  assert.ok(lastCameraSetView, 'Cámara setView debe haberse ejecutado');
  assert.ok(lastCameraSetView.destination instanceof MockCartesian3, 'Cámara destination debe ser Cartesian3');
  assert.strictEqual(lastCameraSetView.orientation.heading, 1.25, 'Cámara heading exacto');
  assert.strictEqual(lastCameraSetView.orientation.pitch, -0.65, 'Cámara pitch exacto');
  assert.strictEqual(lastCameraSetView.orientation.roll, 0.01, 'Cámara roll exacto');

  console.log('✓ PASS: Deserialización completa, rehidratación Cartesian3, Gemelo Digital y bloqueo exacto de cámara.');
  console.log('═════════════════════════════════════════════════════════════════════════');
  console.log('🎉 TODOS LOS TESTS DE PERSISTENCIA Y CARGA DE PROYECTOS PASARON AL 100%');
  console.log('═════════════════════════════════════════════════════════════════════════');
})();
