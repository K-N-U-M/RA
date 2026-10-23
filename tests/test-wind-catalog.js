/**
 * ═══════════════════════════════════════════════════════════════════════
 * test-wind-catalog.js — Batería de pruebas unitarias para RA-Wind (Fase 1)
 * ═══════════════════════════════════════════════════════════════════════
 */
const assert = require('assert');

// Mock global
const mockGlobal = {
  windTurbines: [],
  localStorage: {
    _data: {},
    getItem(k) { return this._data[k] || null; },
    setItem(k, v) { this._data[k] = String(v); },
    removeItem(k) { delete this._data[k]; }
  }
};
global.localStorage = mockGlobal.localStorage;
global.windTurbines = mockGlobal.windTurbines;

const RAWindConstants = require('../js/wind/wind-constants.js');
const RAWindCatalog = require('../js/wind/wind-catalog.js');
const RAWindEntity = require('../js/wind/wind-entity.js');

console.log('═════════════════════════════════════════════════════════════════════');
console.log('💨 INICIANDO TEST SUITE: RA-WIND CATÁLOGO Y ENTIDAD (FASE 1)');
console.log('═════════════════════════════════════════════════════════════════════');

// 1. Constantes
assert(RAWindConstants.AIR_DENSITY_STD === 1.225, 'Densidad estándar debe ser 1.225');
assert(RAWindConstants.ACOUSTIC_LIMIT_DAY_DBA === 45, 'Límite acústico día 45 dBA');
console.log('✓ TEST 1 PASADO: Constantes normativas y físicas cargadas correctamente');

// 2. Catálogo por defecto
const turbines = RAWindCatalog.getAll();
assert(Array.isArray(turbines), 'Catálogo debe devolver array');
assert(turbines.length >= 6, 'Debe incluir al menos 6 turbinas por defecto');
const bornay25 = RAWindCatalog.getById('bornay-wind-25.3');
assert(bornay25 !== null, 'Bornay Wind 25.3 debe existir');
assert(bornay25.ratedPowerW === 25000, 'Potencia nominal 25kW');
assert(bornay25.manufacturer.includes('Bornay'), 'Fabricante Bornay');
console.log('✓ TEST 2 PASADO: Catálogo por defecto cargado con 6 modelos españoles (Bornay, Enair, Kliux)');

// 3. Sanitización desde IA
const aiRaw = {
  manufacturer: '  Test Wind Corp  ',
  model: 'TW-50',
  type: 'HAWT',
  ratedPowerW: '50000',
  rotorDiameterM: '12.5',
  bladeCount: '3',
  priceEur: '45000'
};
const sanitized = RAWindCatalog.sanitizeFromAI(aiRaw);
assert(sanitized !== null, 'Sanitización IA debe ser exitosa');
assert(sanitized.id === 'test-wind-corp-tw-50', 'ID canónico generado');
assert(sanitized.ratedPowerW === 50000, 'Potencia numérica correcta');
assert(sanitized.rotorDiameterM === 12.5, 'Diámetro numérico correcto');
console.log('✓ TEST 3 PASADO: Sanitización de respuesta IA y generación de IDs canónicos');

// 4. Creación y adición de instancia a la escena
const inst = RAWindEntity.createInstance(bornay25, {
  positionCartographic: { longitudeRad: -0.06, latitudeRad: 0.70, altitudeM: 15 }
});
assert(inst.id.startsWith('wt_'), 'ID de instancia válido');
assert(inst.supportStructure.hubHeightM > 0, 'Altura de buje asignada');
RAWindEntity.addToScene(inst);
assert(global.windTurbines.length === 1, 'Turbina añadida a escena');
console.log('✓ TEST 4 PASADO: Creación de instancia WindTurbineInstance y adición a escena');

// 5. Verificación de distancias mínimas (checkRotorClearance)
const inst2 = RAWindEntity.createInstance(bornay25, {
  // Muy cerca (misma lon/lat)
  positionCartographic: { longitudeRad: -0.06, latitudeRad: 0.70, altitudeM: 15 }
});
const clearanceIssues = RAWindEntity.checkRotorClearance(inst2);
assert(clearanceIssues.length > 0, 'Debe detectar proximidad excesiva < 3D');
console.log('✓ TEST 5 PASADO: Detección preventiva de distancia entre rotores (< 3D)');

// 6. Serialización y deserialización roundtrip
const serialized = RAWindEntity.serializeAll();
assert(Array.isArray(serialized) && serialized.length === 1, 'Serialización correcta');
assert(!serialized[0]._catalog, 'No debe serializar referencias redundantes');
global.windTurbines = [];
RAWindEntity.deserializeAll(serialized);
assert(global.windTurbines.length === 1, 'Deserialización restablece colección');
assert(global.windTurbines[0].catalogId === 'bornay-wind-25.3', 'Enlace a catálogo reconstituido');
console.log('✓ TEST 6 PASADO: Serialización y deserialización para .raproject completada con éxito');

console.log('═════════════════════════════════════════════════════════════════════');
console.log('🎉 TODOS LOS TESTS DE RA-WIND HAN PASADO AL 100%');
console.log('═════════════════════════════════════════════════════════════════════');
