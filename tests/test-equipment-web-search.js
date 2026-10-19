/**
 * ===============================================================================
 * TEST SUITE: BUSCADOR WEB DE EQUIPOS CON IA (RAEquipmentWebSearch)
 * ===============================================================================
 */

const assert = require('assert');

console.log('--- TEST SUITE: BUSCADOR WEB DE EQUIPOS CON IA ---');

// Mock DOM y almacenamiento
const mockLocalStorage = {};
global.localStorage = {
  getItem: (k) => mockLocalStorage[k] || null,
  setItem: (k, v) => { mockLocalStorage[k] = String(v); },
  removeItem: (k) => { delete mockLocalStorage[k]; }
};

global.window = global;
global.root = global;

// Mock del catálogo de equipos
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

global.saveEquipmentCatalog = function () {
  global.catalogSaved = true;
};
global.showStatus = function (msg) {
  global.lastStatus = msg;
};
global.showToast = function (t, m, type) {
  global.lastToast = { title: t, msg: m, type };
};
global.onSelectModuleFromDropdown = function (id) {
  global.lastSelectedModule = id;
};

// Cargar el módulo
require('../js/equipment-web-search.js');

const WebSearch = global.RAEquipmentWebSearch;
assert(WebSearch, 'El objeto RAEquipmentWebSearch debe estar exportado');
assert(global.RA && global.RA.EquipmentWebSearch === WebSearch, 'RA.EquipmentWebSearch debe coincidir');

console.log('✓ Módulo importado y exportado en window / RA correctamente');

// ── 1. TEST DE PROMPT TÉCNICO ──────────────────────────────────────────────────
const prompt = WebSearch.buildSearchPrompt('Aiko Neostar', 'modules');
assert(prompt.includes('Aiko Neostar'), 'El prompt debe incluir la consulta');
assert(prompt.includes('modules'), 'El prompt debe incluir la categoría solicitada');
assert(prompt.includes('voc') && prompt.includes('vmp'), 'El prompt debe requerir parámetros electrotécnicos');
console.log('✓ Generador de prompt electrotécnico verificado');

// ── 2. TEST DE SANITIZACIÓN: MÓDULO FV ─────────────────────────────────────────
const rawMod = {
  category: 'modules',
  brand: 'Aiko',
  model: 'Neostar 2S+ 455W All-Black',
  wp: 455,
  eff: 22.8,
  l: 1722, // en mm, debe convertirse a metros
  w: 1134,
  voc: 40.5,
  vmp: 34.0,
  isc: 14.2,
  imp: 13.38,
  price: 125
};
const cleanMod = WebSearch.sanitizeItem(rawMod, 0);
assert.strictEqual(cleanMod.category, 'modules');
assert.strictEqual(cleanMod.wp, 455);
assert(cleanMod.l > 1.5 && cleanMod.l < 2.5, 'Dimensiones deben estar en metros');
assert(cleanMod.voc > cleanMod.vmp, 'Voc debe ser mayor que Vmp');
assert(cleanMod.isc > cleanMod.imp, 'Isc debe ser mayor que Imp');
console.log('✓ Inspector físico y electrotécnico de Módulos verificado');

// ── 3. TEST DE SANITIZACIÓN: INVERSOR ──────────────────────────────────────────
const rawInv = {
  category: 'inverters',
  brand: 'Fronius',
  model: 'Primo GEN24 6.0 Plus',
  kw: 6.0,
  mppt: 2,
  vDcMax: 1000,
  vStart: 80,
  price: 1850
};
const cleanInv = WebSearch.sanitizeItem(rawInv, 0);
assert.strictEqual(cleanInv.category, 'inverters');
assert.strictEqual(cleanInv.kw, 6.0);
assert.strictEqual(cleanInv.mppt, 2);
assert(cleanInv.vDcMax >= 1000);
assert(cleanInv.vMpptMax > cleanInv.vMpptMin);
console.log('✓ Inspector de Inversores verificado');

// ── 4. TEST DE SANITIZACIÓN: BATERÍA Y MICROINVERSOR ─────────────────────────
const rawBat = {
  category: 'batteries',
  brand: 'BYD',
  model: 'Battery-Box HVS 10.2',
  kwh: 10.24,
  price: 5200
};
const cleanBat = WebSearch.sanitizeItem(rawBat, 0);
assert.strictEqual(cleanBat.category, 'batteries');
assert.strictEqual(cleanBat.kwh, 10.24);

const rawMi = {
  category: 'microinverters',
  brand: 'Enphase',
  model: 'IQ8HC',
  kw: 0.384,
  price: 170
};
const cleanMi = WebSearch.sanitizeItem(rawMi, 0);
assert.strictEqual(cleanMi.category, 'microinverters');
assert.strictEqual(cleanMi.kw, 0.384);
console.log('✓ Inspector de Baterías y Microinversores verificado');

// ── 5. TEST DE INCORPORACIÓN REACTIVA AL CATÁLOGO ────────────────────────────
const initialModCount = global.equipmentCatalog.modules.length;
const savedModId = WebSearch.addToCatalog(cleanMod);
assert(savedModId.startsWith('mod_web_'), 'El id asignado debe llevar prefijo mod_web_');
assert.strictEqual(global.equipmentCatalog.modules.length, initialModCount + 1, 'Debe añadirse al catálogo');
assert.strictEqual(global.catalogSaved, true, 'Debe persistirse el catálogo');
assert.strictEqual(global.lastSelectedModule, savedModId, 'Debe auto-seleccionarse en Paso 2');

const initialBatCount = global.equipmentCatalog.batteries.length;
const savedBatId = WebSearch.addToCatalog(cleanBat);
assert(savedBatId.startsWith('bat_web_'), 'El id de batería debe llevar prefijo bat_web_');
assert.strictEqual(global.equipmentCatalog.batteries.length, initialBatCount + 1, 'Debe añadirse la batería');

console.log('✓ Incorporación reactiva y persistencia en caliente verificadas');

// ── 6. TEST DE GESTIÓN DE API KEY Y MODELOS ──────────────────────────────────
mockLocalStorage['ra_gemini_api_key'] = 'AIzaSyWebSearchKey123';
assert.strictEqual(WebSearch.getApiKey(), 'AIzaSyWebSearchKey123');

const modelsPromise = WebSearch.discoverAvailableModels('key');
assert(modelsPromise instanceof Promise, 'discoverAvailableModels debe ser asíncrono');

console.log('✓ Detección de credenciales y modelos verificada');
console.log('--- TODOS LOS TESTS DEL BUSCADOR WEB CON IA PASARON CON ÉXITO AL 100% ---');
