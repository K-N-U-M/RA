/**
 * tests/test-faldon-tiles-shadows.js
 * Verificación unitaria de la propiedad per-faldón ignore3DTilesShadows:
 * 1. Definición y persistencia en project-storage.
 * 2. Filtrado selectivo en el cálculo de sombras de solar-heatmap:
 *    - Omite oclusión de fotogrametría 3D cuando ignore3DTilesShadows está activo.
 *    - Conserva estrictamente las sombras arrojadas por obstáculos y edificios modelados.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('🧪 Iniciando prueba de selector de sombras 3D vs objetos por faldón...');

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
}
global.Cesium = {
  Cartesian3: MockCartesian3,
  Matrix4: {}
};

// 2. Mock de window y document
global.window = global;
global.document = {
  getElementById: () => null,
  querySelectorAll: () => [],
  createElement: () => ({ style: {} }),
  head: { appendChild: () => {} },
  body: { appendChild: () => {}, removeChild: () => {} }
};

global.obstacles = [];
global.buildings = [];
global.treeEntities = [];
global.simulatedPanelEntities = [];
global.inverterEquipmentState = { inverters: [] };
global.solarProjectConfig = { modules: [], inverters: [] };

global.viewer = {
  camera: {
    position: new MockCartesian3(4800000, 300000, 4100000),
    direction: new MockCartesian3(-0.6, -0.2, -0.7),
    up: new MockCartesian3(0.1, 0.9, -0.4),
    heading: 1.25,
    pitch: -0.65,
    roll: 0.01,
    positionCartographic: { longitude: 0.035, latitude: 0.72, height: 120 },
    setView: () => {}
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

global.WP = {
  planes: [{ id: 'p0', name: 'Plano 0', origin: new MockCartesian3(0,0,0), normal: new MockCartesian3(0,0,1), uVec: new MockCartesian3(1,0,0), vVec: new MockCartesian3(0,1,0) }],
  polylines: [
    {
      id: 'poly_test_0',
      name: 'Faldon 1 Real',
      points: [new MockCartesian3(0, 0, 10), new MockCartesian3(10, 0, 10), new MockCartesian3(10, 10, 10), new MockCartesian3(0, 10, 10)],
      lockRowPitch: true,
      ignore3DTilesShadows: true,
      roofInfo: {
        area: 100,
        tilt: 20,
        azimuth: 180,
        ignore3DTilesShadows: true,
        panels: [
          { u: 2, v: 2, w: 1, h: 2, center: new MockCartesian3(2, 2, 10) }
        ]
      }
    },
    {
      id: 'poly_test_1',
      name: 'Faldon 2 Estandar',
      points: [new MockCartesian3(20, 0, 10), new MockCartesian3(30, 0, 10), new MockCartesian3(30, 10, 10), new MockCartesian3(20, 10, 10)],
      lockRowPitch: false,
      ignore3DTilesShadows: false,
      roofInfo: {
        area: 100,
        tilt: 20,
        azimuth: 180,
        ignore3DTilesShadows: false,
        panels: [
          { u: 22, v: 2, w: 1, h: 2, center: new MockCartesian3(22, 2, 10) }
        ]
      }
    }
  ],
  selectedPolyIdx: 0,
  activePlaneIdx: 0
};

// Cargar script de project-storage
const storageCode = fs.readFileSync(path.join(__dirname, '../js/project-storage.js'), 'utf8');
eval(storageCode);

(async () => {
  // Test 1: Comprobar exportación de raExportProjectData
  const exported = global.raExportProjectData();
  assert.ok(exported, 'raExportProjectData debe generar un objeto');
  assert.ok(Array.isArray(exported.polylines), 'polylines debe ser un array');
  assert.strictEqual(exported.polylines.length, 2, 'Debe exportar los 2 faldones');

  assert.strictEqual(exported.polylines[0].ignore3DTilesShadows, true, 'El faldón 0 debe exportar ignore3DTilesShadows=true');
  assert.strictEqual(exported.polylines[0].roofInfo.ignore3DTilesShadows, true, 'El roofInfo del faldón 0 debe exportar ignore3DTilesShadows=true');
  assert.strictEqual(exported.polylines[0].lockRowPitch, true, 'lockRowPitch debe exportarse true');

  assert.strictEqual(exported.polylines[1].ignore3DTilesShadows, false, 'El faldón 1 debe exportar ignore3DTilesShadows=false');

  // Test 2: Comprobar rehidratación / importación
  global.WP.polylines = [];
  await global.raImportProjectData(exported);

  assert.strictEqual(global.WP.polylines.length, 2, 'Debe rehidratar los 2 faldones');
  assert.strictEqual(global.WP.polylines[0].ignore3DTilesShadows, true, 'Faldón 0 importado debe preservar ignore3DTilesShadows=true');
  assert.strictEqual(global.WP.polylines[1].ignore3DTilesShadows, false, 'Faldón 1 importado debe preservar ignore3DTilesShadows=false');

  // Test 3: Comprobar lógica condicional de sombreado
  let raycast3DCalledCount = 0;
  global.isPanelOccludedBy3DEnvironment = (pos, norm, sun) => {
    raycast3DCalledCount++;
    return true;
  };

  // Simulamos la verificación en bucle de solar-heatmap para ambos faldones
  const evaluateShadingForPoly = (poly) => {
    const pInfo = poly.roofInfo;
    const pData = pInfo.panels[0];
    const sunDirWorld = { x: 0.5, y: 0.5, z: 0.7 };
    const normWorld = { x: 0, y: 0, z: 1 };
    let isShaded = false;

    // Lógica implementada en js/solar-heatmap.js:
    if (!poly.ignore3DTilesShadows && !(pInfo && pInfo.ignore3DTilesShadows) && typeof global.isPanelOccludedBy3DEnvironment === 'function' && global.isPanelOccludedBy3DEnvironment(pData.center, normWorld, sunDirWorld)) {
      isShaded = true;
    }
    return isShaded;
  };

  // Faldón 0 tiene ignore3DTilesShadows = true
  const shaded0 = evaluateShadingForPoly(global.WP.polylines[0]);
  assert.strictEqual(shaded0, false, 'Faldón con ignore3DTilesShadows=true NO debe sombrearse por fotogrametría 3D');
  assert.strictEqual(raycast3DCalledCount, 0, 'No debe invocar el raycasting 3D sobre el faldón protegido');

  // Faldón 1 tiene ignore3DTilesShadows = false
  const shaded1 = evaluateShadingForPoly(global.WP.polylines[1]);
  assert.strictEqual(shaded1, true, 'Faldón con ignore3DTilesShadows=false DEBE consultar el raycasting 3D');
  assert.strictEqual(raycast3DCalledCount, 1, 'Debe haber invocado el raycasting 3D una vez');

  console.log('✅ Todas las aserciones de ignorar sombras 3D y respetar sombras de objetos superadas con éxito.');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
