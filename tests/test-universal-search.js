/**
 * ===============================================================================
 * TEST SUITE: MOTOR HÍBRIDO INTEGRAL AAA DE BÚSQUEDA Y NAVEGACIÓN
 * ===============================================================================
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('--- TEST SUITE: BUSCADOR UNIVERSAL AAA (CATASTRO, GPS & MAPS) ---');

// Mock DOM
global.window = global;
const mockLocalStorage = {};
global.localStorage = {
  getItem: (k) => mockLocalStorage[k] || null,
  setItem: (k, v) => { mockLocalStorage[k] = String(v); },
  removeItem: (k) => { delete mockLocalStorage[k]; }
};

global.document = {
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {},
  removeEventListener: () => {}
};

// Cargar js/viewer.js
const viewerPath = path.join(__dirname, '..', 'js', 'viewer.js');
const viewerCode = fs.readFileSync(viewerPath, 'utf8');
eval(viewerCode);

// 1. Verificación de exports
assert.ok(typeof global.detectCadastralRef === 'function', 'detectCadastralRef debe estar exportado');
assert.ok(typeof global.parseCoordinatesOrUrl === 'function', 'parseCoordinatesOrUrl debe estar exportado');
assert.ok(typeof global.clearSearchInput === 'function', 'clearSearchInput debe estar exportado');
assert.ok(typeof global.locateUserPosition === 'function', 'locateUserPosition debe estar exportado');
assert.ok(typeof global.RA.Viewer === 'object', 'RA.Viewer namespace debe existir');
console.log('✓ Funciones exportadas correctamente en window y RA.Viewer');

// 2. Detección de Referencias Catastrales (14 y 20 caracteres)
const rc14 = '9872023VH5797S';
assert.strictEqual(global.detectCadastralRef(rc14), '9872023VH5797S', 'Debe detectar RC urbana de 14 caracteres');

const rc14WithSpaces = '9872023 VH 5797 S';
assert.strictEqual(global.detectCadastralRef(rc14WithSpaces), '9872023VH5797S', 'Debe limpiar espacios en RC de 14 caracteres');

const rc20 = '9872023VH5797S0001WX';
assert.strictEqual(global.detectCadastralRef(rc20), '9872023VH5797S0001WX', 'Debe detectar RC completa de 20 caracteres');

const notRc = 'Calle Gran Via 12, Madrid';
assert.strictEqual(global.detectCadastralRef(notRc), null, 'No debe identificar una dirección normal como RC');
console.log('✓ Detección y normalización de Referencias Catastrales superada (14 y 20 caracteres)');

// 3. Detección y parsing de coordenadas directas
const coords1 = '40.416775, -3.703790';
const parsed1 = global.parseCoordinatesOrUrl(coords1);
assert.ok(parsed1 !== null, 'Debe parsear coordenadas lat, lon decimales');
assert.strictEqual(parsed1.type, 'gps');
assert.strictEqual(parsed1.badge, 'COORDENADAS GPS');
assert.strictEqual(Math.round(parsed1.lat * 100), 4042);
assert.strictEqual(Math.round(parsed1.lon * 100), -370);

const coordsDMS = '40.4168 N, 3.7038 W';
const parsedDMS = global.parseCoordinatesOrUrl(coordsDMS);
assert.ok(parsedDMS !== null, 'Debe parsear coordenadas con sufijos N y W');
assert.strictEqual(Math.round(parsedDMS.lat * 100), 4042);
assert.strictEqual(Math.round(parsedDMS.lon * 100), -370);
console.log('✓ Parsing de coordenadas numéricas directas superado');

// 4. Detección y parsing de URLs de Google Maps
const gmapsUrl1 = 'https://www.google.com/maps/@40.416775,-3.703790,17z';
const parsedUrl1 = global.parseCoordinatesOrUrl(gmapsUrl1);
assert.ok(parsedUrl1 !== null, 'Debe extraer coordenadas de URL estándar de Google Maps');
assert.strictEqual(Math.round(parsedUrl1.lat * 100), 4042);
assert.strictEqual(Math.round(parsedUrl1.lon * 100), -370);

const gmapsUrl2 = 'https://maps.google.com/?q=40.416775,-3.703790';
const parsedUrl2 = global.parseCoordinatesOrUrl(gmapsUrl2);
assert.ok(parsedUrl2 !== null, 'Debe extraer coordenadas de URL corta ?q= de Google Maps');
assert.strictEqual(Math.round(parsedUrl2.lat * 100), 4042);
assert.strictEqual(Math.round(parsedUrl2.lon * 100), -370);
console.log('✓ Extracción de coordenadas desde enlaces de Google Maps superada');

// 5. Historial de búsqueda
global.saveToHistory({ display_name: 'Plaza Mayor, Madrid', lat: 40.4155, lon: -3.7074 });
const hist = global.getSearchHistory();
assert.ok(Array.isArray(hist) && hist.length > 0, 'El historial debe persistirse en localStorage');
assert.strictEqual(hist[0].display_name, 'Plaza Mayor, Madrid');
console.log('✓ Persistencia y recuperación de historial de búsqueda superada');

console.log('--- TODOS LOS TESTS DEL BUSCADOR UNIVERSAL PASARON CON ÉXITO AL 100% ---');
