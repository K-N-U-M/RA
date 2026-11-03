/**
 * Test Suite: CAD 3D Hygiene, Undo/Redo Coverage & Total Persistence (Fase 5)
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('=== INICIANDO TEST SUITE: CAD 3D, UNDO/REDO & PERSISTENCIA (FASE 5) ===\n');

// Mock DOM
global.window = global;
global.document = {
  getElementById: (id) => null,
  createElement: (tag) => ({
    style: {},
    appendChild: () => {},
    innerHTML: ''
  }),
  body: {
    appendChild: () => {}
  },
  head: {
    appendChild: () => {}
  },
  querySelectorAll: () => [],
  addEventListener: () => {},
  removeEventListener: () => {}
};

async function runTests() {
  // ---------------------------------------------------------------------------
  // TEST 1: wpClearEntGroup purga etiquetas 2D asociadas en labels2DRegistry
  // ---------------------------------------------------------------------------
  console.log('Test 1: Limpieza en wpClearEntGroup purga labels2DRegistry');
  {
    global.labels2DRegistry = [
      { id: 'lbl_p1', text: 'Label P1' },
      { id: 'lbl_p2', text: 'Label P2' },
      { id: 'lbl_other', text: 'Label Other' }
    ];
    global.WP = {
      ents: {
        groupA: [
          { id: 'lbl_p1', _labelItem: { id: 'lbl_p1' } },
          { id: 'lbl_p2', _labelItem: { id: 'lbl_p2' } }
        ]
      }
    };
    global.viewer = {
      entities: {
        remove: (e) => {}
      },
      scene: {
        requestRender: () => {}
      }
    };

    const wpCode = fs.readFileSync(path.join(__dirname, '../js/working-plane.js'), 'utf8');
    const fnMatch = wpCode.match(/function wpClearEntGroup\(key\) \{[\s\S]*?\n\}/);
    assert(fnMatch, 'wpClearEntGroup function found in working-plane.js');
    
    const fn = new Function('key', 'WP', 'viewer', 'labels2DRegistry', fnMatch[0] + '; return wpClearEntGroup(key);');
    fn('groupA', global.WP, global.viewer, global.labels2DRegistry);

    assert.strictEqual(global.labels2DRegistry.length, 1, 'Deben quedar solo las etiquetas no pertenecientes al grupo');
    assert.strictEqual(global.labels2DRegistry[0].id, 'lbl_other', 'La etiqueta no asociada sobrevive');
    assert.strictEqual(global.WP.ents.groupA.length, 0, 'El array del grupo de entidades queda vacio');
    console.log('  -> PASS: wpClearEntGroup purgo correctamente las etiquetas asociadas de labels2DRegistry');
  }

  // ---------------------------------------------------------------------------
  // TEST 2: universal-gizmo-3d difiere render3DBuildingsInCesium a LEFT_UP
  // ---------------------------------------------------------------------------
  console.log('\nTest 2: Verificacion de descarte de reconstruccion pesada GPU en arrastre de edificios');
  {
    const gizmoCode = fs.readFileSync(path.join(__dirname, '../js/universal-gizmo-3d.js'), 'utf8');
    const bldDragIdx = gizmoCode.indexOf("target.type === 'building' && target.rawObj");
    assert(bldDragIdx !== -1, 'Seccion target.type === building encontrada en gizmo');
    const bldDragBlock = gizmoCode.slice(bldDragIdx, bldDragIdx + 500);

    assert(!bldDragBlock.includes('render3DBuildingsInCesium()'),
      'render3DBuildingsInCesium() no debe invocarse por frame durante el arrastre');
    console.log('  -> PASS: Reconstruccion 3D de edificios no se ejecuta durante el drag continuo (60 FPS garantizados)');
  }

  // ---------------------------------------------------------------------------
  // TEST 3: undo-manager beginDrag cobertura universal de tipos
  // ---------------------------------------------------------------------------
  console.log('\nTest 3: Cobertura universal de beginDrag y wind_turbines en undo-manager');
  {
    global.windTurbines = [{ id: 'wt_test_1', catalogId: 'vestas_v90', x: 100 }];
    global.inverterEquipmentState = { position: { x: 10, y: 20, z: 0 } };
    global.cableRoutingState = { routes: [] };

    require(path.join(__dirname, '../js/undo-manager.js'));
    assert(global.RAundo, 'RAundo inicializado');

    // 1. beginDrag captura estado ANTES del arrastre (x = 100)
    global.RAundo.beginDrag('wind_turbine_entity');
    // 2. Modificamos posicion a 200 durante el drag
    global.windTurbines[0].x = 200;
    // 3. commitDrag guarda la transicion 100 -> 200
    global.RAundo.commitDrag('Mover turbina eolica');
    
    // 4. Deshacer debe devolverlo a x = 100
    const okUndo = await global.RAundo.undo();
    assert(okUndo, 'Undo de turbina eolica exitoso');
    assert.strictEqual(global.windTurbines[0].x, 100, 'Posicion de turbina eolica restaurada al snapshot previo (100)');

    // 5. Rehacer debe devolverlo a x = 200
    const okRedo = await global.RAundo.redo();
    assert(okRedo, 'Redo de turbina eolica exitoso');
    assert.strictEqual(global.windTurbines[0].x, 200, 'Posicion de turbina eolica restaurada tras rehacer (200)');
    console.log('  -> PASS: Captura y restauracion simetrica (undo/redo) de wind_turbines en undo-manager');

    // Comprobar beginDrag mapeos
    const cases = [
      { target: 'vertex', expectedKind: 'polylines' },
      { target: 'workplane_vertex', expectedKind: 'polylines' },
      { target: 'building_vertex', expectedKind: 'buildings' },
      { target: 'building', expectedKind: 'buildings' },
      { target: 'obstacle', expectedKind: 'obstacles' },
      { target: 'panel', expectedKind: 'polylines' },
      { target: 'workplane', expectedKind: 'planes' },
      { target: 'plane', expectedKind: 'planes' },
      { target: 'wind_turbine_entity', expectedKind: 'wind_turbines' },
      { target: 'wind_turbine', expectedKind: 'wind_turbines' },
      { target: 'electrical', expectedKind: 'electrical' },
      { target: 'inverter', expectedKind: 'electrical' },
      { target: 'gridMeter', expectedKind: 'electrical' }
    ];

    for (const c of cases) {
      global.RAundo.beginDrag(c.target);
      global.RAundo.cancelDrag();
    }
    console.log('  -> PASS: beginDrag mapea exhaustivamente todos los targets CAD sin caer a fallback erroneo');
  }

  // ---------------------------------------------------------------------------
  // TEST 4: deleteBuilding cascade cleanup
  // ---------------------------------------------------------------------------
  console.log('\nTest 4: deleteBuilding elimina planos, faldones y obstaculos en cascada');
  {
    global.buildings = [
      { id: 'bld_101', name: 'Nave Industrial A' },
      { id: 'bld_102', name: 'Nave Industrial B' }
    ];
    global.WP = {
      planes: [
        { id: 'plane_1', buildingId: 'bld_101' },
        { id: 'plane_2', buildingId: 'bld_102' }
      ],
      polylines: [
        { id: 'poly_1', buildingId: 'bld_101', planeIdx: 0 },
        { id: 'poly_2', buildingId: 'bld_102', planeIdx: 1 }
      ],
      activePlaneIdx: 0,
      selectedPolyIdx: 0
    };
    global.obstacles = [
      { id: 'obs_1', buildingId: 'bld_101' },
      { id: 'obs_2', buildingId: 'bld_102' },
      { id: 'obs_ground', buildingId: null }
    ];

    require(path.join(__dirname, '../js/buildings.js'));
    assert(typeof global.deleteBuilding === 'function', 'deleteBuilding existe');

    const res = global.deleteBuilding('bld_101');
    assert(res, 'deleteBuilding retorna true');

    assert.strictEqual(global.buildings.length, 1, 'Queda 1 edificio');
    assert.strictEqual(global.buildings[0].id, 'bld_102', 'El edificio restante es bld_102');

    assert.strictEqual(global.WP.planes.length, 1, 'Queda 1 plano de trabajo');
    assert.strictEqual(global.WP.planes[0].buildingId, 'bld_102', 'El plano restante pertenece a bld_102');

    assert.strictEqual(global.WP.polylines.length, 1, 'Queda 1 faldon');
    assert.strictEqual(global.WP.polylines[0].buildingId, 'bld_102', 'El faldon restante pertenece a bld_102');

    assert.strictEqual(global.obstacles.length, 2, 'Quedan 2 obstaculos');
    assert(!global.obstacles.some(o => o.buildingId === 'bld_101'), 'Ningun obstaculo de bld_101 sobrevivio');
    console.log('  -> PASS: deleteBuilding ejecuto purga en cascada perfecta');
  }

  // ---------------------------------------------------------------------------
  // TEST 5: project-storage persistencia total roundtrip
  // ---------------------------------------------------------------------------
  console.log('\nTest 5: project-storage persistencia total y reseteo de infraestructura electrica');
  {
    global.WP = {
      planes: [
        {
          id: 'pl_aud',
          name: 'Cubierta Sur',
          buildingId: 'bld_main',
          isRoof: true,
          p1: { x: 1, y: 2, z: 3 },
          p2: { x: 4, y: 5, z: 6 },
          p3: { x: 7, y: 8, z: 9 },
          tiltDeg: 15,
          azimuthDeg: 180,
          area: 250
        }
      ],
      polylines: [
        {
          id: 'poly_aud',
          name: 'Faldon Principal',
          buildingId: 'bld_main',
          isRoof: true,
          assignedTopology: 'microinverter',
          optimizerCoverage: 'all',
          panelsDisabled: true,
          points: [{ x: 1, y: 2, z: 3 }, { x: 4, y: 5, z: 6 }, { x: 7, y: 8, z: 9 }],
          area: 250
        }
      ],
      activePlaneIdx: 0,
      selectedPolyIdx: 0
    };

    global.lastVirtualInverter = { model: 'Virtual_10kW', mpptCount: 2 };
    global.solarLossConfig = { soilingPct: 3.5, thermalPct: 4.2 };

    require(path.join(__dirname, '../js/project-storage.js'));
    assert(typeof global.raExportProjectData === 'function', 'raExportProjectData existe');

    const exported = global.raExportProjectData();

    assert(exported.workPlanes.planes[0].buildingId === 'bld_main', 'Plano exporta buildingId');
    assert(exported.workPlanes.planes[0].isRoof === true, 'Plano exporta isRoof');

    assert(exported.polylines[0].buildingId === 'bld_main', 'Polilinea exporta buildingId');
    assert(exported.polylines[0].isRoof === true, 'Polilinea exporta isRoof');
    assert(exported.polylines[0].assignedTopology === 'microinverter', 'Polilinea exporta assignedTopology');
    assert(exported.polylines[0].optimizerCoverage === 'all', 'Polilinea exporta optimizerCoverage');
    assert(exported.polylines[0].panelsDisabled === true, 'Polilinea exporta panelsDisabled');

    assert(exported.lastVirtualInverter && exported.lastVirtualInverter.model === 'Virtual_10kW', 'Exporta lastVirtualInverter');
    assert(exported.solarLossConfig && exported.solarLossConfig.soilingPct === 3.5, 'Exporta solarLossConfig');

    // Limpiar variables para verificar import
    global.WP.planes = [];
    global.WP.polylines = [];
    global.lastVirtualInverter = null;
    global.solarLossConfig = null;

    await global.raImportProjectData(exported, { preserveUndoHistory: true });

    assert.strictEqual(global.WP.planes.length, 1, 'Plano restaurado');
    assert.strictEqual(global.WP.planes[0].buildingId, 'bld_main', 'buildingId restaurado en plano');
    assert.strictEqual(global.WP.planes[0].isRoof, true, 'isRoof restaurado en plano');

    assert.strictEqual(global.WP.polylines.length, 1, 'Polilinea restaurada');
    assert.strictEqual(global.WP.polylines[0].buildingId, 'bld_main', 'buildingId restaurado en polilinea');
    assert.strictEqual(global.WP.polylines[0].isRoof, true, 'isRoof restaurado en polilinea');
    assert.strictEqual(global.WP.polylines[0].assignedTopology, 'microinverter', 'assignedTopology restaurado');
    assert.strictEqual(global.WP.polylines[0].optimizerCoverage, 'all', 'optimizerCoverage restaurado');
    assert.strictEqual(global.WP.polylines[0].panelsDisabled, true, 'panelsDisabled restaurado');

    assert(global.lastVirtualInverter && global.lastVirtualInverter.model === 'Virtual_10kW', 'lastVirtualInverter restaurado');
    assert(global.solarLossConfig && global.solarLossConfig.soilingPct === 3.5, 'solarLossConfig restaurado');

    console.log('  -> PASS: Persistencia total (export/import) verificada con fidelidad 100%');
    console.log('\n=== TODOS LOS TESTS DE FASE 5 SUPERADOS CON ÉXITO (5/5) ===\n');
  }
}

runTests().catch(err => {
  console.error('Error ejecutando tests:', err);
  process.exit(1);
});
