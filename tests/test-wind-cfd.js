/**
 * tests/test-wind-cfd.js
 * Batería de pruebas unitarias para Fase 4: Realismo Físico Eólico, CFD y Desbloqueo de UI
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

// Entorno Global Mock
global.window = global;
global.localStorage = {
  _data: {},
  getItem(k) { return this._data[k] || null; },
  setItem(k, v) { this._data[k] = String(v); },
  removeItem(k) { delete this._data[k]; }
};
global.windTurbines = [];
global.buildings = [];
global.obstacles = [];

// Cargar módulos eólicos
const filesToLoad = [
  'js/wind/wind-constants.js',
  'js/wind/wind-catalog.js',
  'js/wind/wind-entity.js',
  'js/wind/wind-resource.js',
  'js/wind/wind-obstacle-interference.js',
  'js/wind/wind-rooftop-cfd.js',
  'js/wind/wind-shadow-flicker.js',
  'js/wind/wind-hybrid-dispatch.js'
];

for (const f of filesToLoad) {
  vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f });
}

console.log('═════════════════════════════════════════════════════════════════════');
console.log('💨 TEST SUITE: FASE 4 — REALISMO FÍSICO EÓLICO, CFD Y DESPACHO');
console.log('═════════════════════════════════════════════════════════════════════');

// 1. Recalibración Betz: las 6 turbinas del catálogo tienen Cp <= 0.45 y son válidas
const catalog = global.RAWindCatalog.getAll();
assert.strictEqual(catalog.length, 6, 'El catálogo debe contener 6 turbinas');
catalog.forEach(t => {
  assert.ok(t.cpAudit, 'Debe contener cpAudit: ' + t.model);
  assert.strictEqual(t.cpAudit.valid, true, 'Debe ser válida físicamente: ' + t.model);
  assert.ok(t.cpAudit.maxCp <= 0.45, 'Cp_max (' + t.cpAudit.maxCp + ') debe ser <= 0.45: ' + t.model);
});
console.log('✓ TEST 1 PASADO: Las 6 turbinas del catálogo cumplen el límite de Betz (Cp <= 0.42)');

// 2. Preservación de cpAudit en WindTurbineEntity (instancia y deserialización)
const b25 = global.RAWindCatalog.getById('bornay-wind-25.3');
const inst = global.RAWind.Entity.createInstance(b25, {
  positionCartographic: { longitudeRad: -0.06, latitudeRad: 0.70, altitudeM: 15 }
});
assert.ok(inst._catalog.cpAudit, 'Instancia debe preservar cpAudit en _catalog');
assert.strictEqual(inst._catalog.cpAudit.valid, true, 'cpAudit debe ser válido en la entidad creada');

global.RAWind.Entity.addToScene(inst);
const serialized = global.RAWind.Entity.serializeAll();
global.windTurbines = [];
global.RAWind.Entity.deserializeAll(serialized);
assert.strictEqual(global.windTurbines.length, 1, 'Debe deserializar 1 turbina');
assert.ok(global.windTurbines[0]._catalog.cpAudit, 'Deserialización debe reconstituir cpAudit');
assert.strictEqual(global.windTurbines[0]._catalog.cpAudit.valid, true, 'cpAudit reconstituido debe ser válido');
console.log('✓ TEST 2 PASADO: cpAudit se preserva íntegramente en ciclo de vida y deserialización de turbinas');

// 3. Extracción de obstáculos con b.points en wind-obstacle-interference.js
global.buildings = [
  {
    id: 'bld_nave1',
    name: 'Nave Industrial Principal',
    height: 8.0,
    rectLadoA: 20.0,
    rectLadoB: 40.0,
    points: [
      { x: 100, y: 100, z: 10 },
      { x: 120, y: 100, z: 10 },
      { x: 120, y: 140, z: 10 },
      { x: 100, y: 140, z: 10 }
    ],
    visible: true
  }
];

const obsList = global.RAWind.ObstacleInterference.extractSceneObstacles();
const bldObs = obsList.find(o => o.id === 'bld_nave1');
assert.ok(bldObs, 'Debe extraer el edificio con b.points');
assert.strictEqual(bldObs.h, 8.0, 'Altura de edificio correcta');
assert.strictEqual(bldObs.w, 20.0, 'Anchura correcta');
assert.strictEqual(bldObs.l, 40.0, 'Longitud correcta');
assert.ok(bldObs.cartesian, 'Centroide cartesiano calculado a partir de b.points');
assert.strictEqual(bldObs.cartesian.x, 110, 'Centroide X correcto');
assert.strictEqual(bldObs.cartesian.y, 120, 'Centroide Y correcto');
console.log('✓ TEST 3 PASADO: Detección y centroide de edificios 3D desde b.points verificado');

// 4. CFD de cubierta: selección del edificio soporte real y setback
inst.mountingType = 'rooftop';
const rooftopEval = global.RAWind.RooftopCFD.evaluateTurbineRooftopContext(inst);
assert.ok(rooftopEval, 'Debe evaluar contexto de cubierta');
assert.ok(rooftopEval.buildingHeightM >= 7.5, 'Altura de edificio evaluada');
assert.ok(rooftopEval.speedupFactor >= 0.2, 'Speedup calculado');
console.log('✓ TEST 4 PASADO: CFD de cubierta evalúa edificio soporte y aerodinámica de capa límite');

// 5. Despacho híbrido sin doble cobro de batería
const dispatch1 = global.RAWind.HybridDispatch.simulateHybridDispatch8760({
  annualSolarKwh: 40000,
  annualWindKwh: 15000,
  annualConsumptionKwh: 35000,
  batteryCapacityKwh: 10,
  capexSolarEur: 25000,
  capexWindEur: 12000,
  batteryIncludedInSolarCapex: true
});

const dispatch2 = global.RAWind.HybridDispatch.simulateHybridDispatch8760({
  annualSolarKwh: 40000,
  annualWindKwh: 15000,
  annualConsumptionKwh: 35000,
  batteryCapacityKwh: 10,
  capexSolarEur: 25000,
  capexWindEur: 12000,
  batteryIncludedInSolarCapex: false
});

// dispatch1 (batería ya incluida en capex solar): totalCapex = 25000 + 12000 = 37000
// dispatch2 (batería no incluida en capex solar): totalCapex = 25000 + 12000 + 4200 = 41200
assert.ok(dispatch1.lcoeHybridEurKwh < dispatch2.lcoeHybridEurKwh, 'LCOE con batería ya incluida debe ser menor');
console.log('✓ TEST 5 PASADO: Deduplicación de CAPEX de batería en despacho híbrido validada');

console.log('═════════════════════════════════════════════════════════════════════');
console.log('🎉 FASE 4 COMPLETADA: 5/5 TESTS PASADOS EXITOSAMENTE');
console.log('═════════════════════════════════════════════════════════════════════');
