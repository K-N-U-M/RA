/**
 * ===============================================================================
 * TEST SUITE: IMPORTADOR DE DATASHEETS CON IA (RAEquipmentAIImporter)
 * ===============================================================================
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('--- TEST SUITE: IMPORTADOR DE DATASHEETS CON IA ---');

// Mock DOM y almacenamiento local
const mockLocalStorage = {};
global.localStorage = {
  getItem: (k) => mockLocalStorage[k] || null,
  setItem: (k, v) => { mockLocalStorage[k] = String(v); },
  removeItem: (k) => { delete mockLocalStorage[k]; }
};

global.window = global;
global.root = global;

// Mock del catálogo de equipos oficial
global.equipmentCatalog = {
  modules: [
    { id: 'mod_1', brand: 'JA Solar', model: 'JAM54S30-415/GR', wp: 415, eff: 21.3, l: 1.722, w: 1.134, th: 0.030, price: 98 }
  ],
  inverters: [
    { id: 'inv_1', brand: 'Huawei', model: 'SUN2000-5KTL-L1', kw: 5.0, mppt: 2, vDcMax: 600, price: 950 }
  ],
  batteries: [],
  microinverters: []
};

global.saveEquipmentCatalog = function() {
  global.catalogSaved = true;
};
global.showStatus = function(msg) {
  global.lastStatus = msg;
};
global.onSelectModuleFromDropdown = function(id) {
  global.lastSelectedModule = id;
};
global.applyInverterFromCatalog = function(id) {
  global.lastAppliedInverter = id;
};

// Cargar el módulo
require('../js/equipment-ai-importer.js');

const Importer = global.RAEquipmentAIImporter;
assert(Importer, 'El objeto RAEquipmentAIImporter debe estar exportado');
assert(global.RA && global.RA.EquipmentAI === Importer, 'RA.EquipmentAI debe coincidir');

console.log('✓ Módulo importado y exportado en window / RA correctamente');

// ── 1. TEST DE PROMPT Y ESQUEMA ──────────────────────────────────────────────
const prompt = Importer.getExtractionPrompt('auto');
assert(prompt.includes('modules'), 'El prompt debe contemplar modules');
assert(prompt.includes('inverters'), 'El prompt debe contemplar inverters');
assert(prompt.includes('batteries'), 'El prompt debe contemplar batteries');
assert(prompt.includes('microinverters'), 'El prompt debe contemplar microinverters');
console.log('✓ Prompt de extracción electrotécnica verificado');

// ── 2. TEST DE SANITIZACIÓN Y COHERENCIA: MÓDULOS FV ─────────────────────────
const rawModule = {
  category: 'modules',
  brand: 'Aiko Solar',
  model: 'Neostar 2P 455W ABC',
  specs: {
    wp: 455,
    l: 1722, // Milímetros -> Debe convertirse a 1.722 m
    w: 1134, // Milímetros -> Debe convertirse a 1.134 m
    th: 30,  // Milímetros -> Debe convertirse a 0.030 m
    voc: 33.0, // Invertido a propósito para probar corrección física
    vmp: 39.0, // Voc debe ser mayor que Vmp
    isc: 13.5,
    imp: 14.2, // Imp mayor que Isc a propósito para probar corrección
    tempCoeffPmax: -0.26
  },
  priceEstimatedEur: 125,
  summaryNotes: 'Módulo N-Type All-Back-Contact de altísima eficiencia'
};

const cleanModule = Importer.sanitizeAndValidate(rawModule, 'aiko-455w.pdf');
assert.strictEqual(cleanModule.category, 'modules');
assert.strictEqual(cleanModule.brand, 'Aiko Solar');
assert.strictEqual(cleanModule.wp, 455);
assert.strictEqual(cleanModule.l, 1.722, 'La longitud debe convertirse a metros');
assert.strictEqual(cleanModule.w, 1.134, 'La anchura debe convertirse a metros');
assert.strictEqual(cleanModule.th, 0.030, 'El grosor debe convertirse a metros');
assert(cleanModule.voc > cleanModule.vmp, 'El inspector físico debe corregir Voc > Vmp');
assert(cleanModule.isc > cleanModule.imp, 'El inspector físico debe corregir Isc > Imp');
assert.strictEqual(cleanModule.price, 125);
console.log('✓ Inspector físico de Módulos FV verificado (conversión mm->m y Voc>Vmp)');

// ── 3. TEST DE SANITIZACIÓN: INVERSORES ───────────────────────────────────────
const rawInverter = {
  category: 'inverters',
  brand: 'Fronius',
  model: 'Primo GEN24 6.0 Plus',
  specs: {
    kw: 6000, // En Watios -> Debe convertirse a 6.0 kW
    mppt: 2,
    vMpptMin: 65,
    vMpptMax: 530,
    vDcMax: 500, // Menor que vMpptMax -> Debe autoajustarse
    iMaxOperA: 22.0,
    iMaxScA: 33.0
  }
};

const cleanInv = Importer.sanitizeAndValidate(rawInverter, 'fronius-gen24.pdf');
assert.strictEqual(cleanInv.category, 'inverters');
assert.strictEqual(cleanInv.kw, 6.0, 'La potencia de 6000 W debe convertirse a 6.0 kW');
assert.strictEqual(cleanInv.mppt, 2);
assert(cleanInv.vDcMax >= cleanInv.vMpptMax, 'vDcMax debe ser mayor o igual a vMpptMax');
assert(cleanInv.price > 0, 'Debe asignar precio estimado si no viene dado');
console.log('✓ Inspector físico de Inversores verificado (W->kW y rango MPPT)');

// ── 4. TEST DE SANITIZACIÓN: BATERÍAS Y MICROINVERSORES ──────────────────────
const rawBattery = {
  category: 'batteries',
  brand: 'BYD',
  model: 'Battery-Box HVS 7.7',
  specs: {
    kwh: 7.68,
    type: 'LFP Alto Voltaje',
    vNom: 307
  }
};
const cleanBat = Importer.sanitizeAndValidate(rawBattery, 'byd.pdf');
assert.strictEqual(cleanBat.category, 'batteries');
assert.strictEqual(cleanBat.kwh, 7.68);
assert(cleanBat.price > 0);
console.log('✓ Inspector de Baterías verificado');

// ── 5. TEST DE INSERCIÓN Y PERSISTENCIA EN EL CATÁLOGO ───────────────────────
const initialModuleCount = global.equipmentCatalog.modules.length;
Importer.commitToCatalog(cleanModule);

assert.strictEqual(global.equipmentCatalog.modules.length, initialModuleCount + 1, 'Debe haber añadido el módulo a la lista');
assert.strictEqual(global.lastSelectedModule, cleanModule.id, 'Debe activar el nuevo módulo en el selector del Paso 2');
assert.strictEqual(global.catalogSaved, true, 'Debe haber llamado a saveEquipmentCatalog()');

console.log('✓ Inserción, guardado y sincronización reactiva en caliente verificados');

// ── 6. TEST DE DETECCIÓN DE API KEY ──────────────────────────────────────────
mockLocalStorage['ra_gemini_api_key'] = 'AIzaSyMockTestKey12345';
assert.strictEqual(Importer.getApiKey(), 'AIzaSyMockTestKey12345', 'Debe leer la API Key de localStorage');

console.log('✓ Gestión de credenciales API Key verificada');
console.log('--- TODOS LOS TESTS DEL IMPORTADOR IA PASARON CON ÉXITO AL 100% ---');
