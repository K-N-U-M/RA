/**
 * test-shadow-settings.js
 * Test suite for GPU Shadow Quality, Action Radius Slider, 3D Tiles/Terrain Self-Shadowing, and Persistence
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('═════════════════════════════════════════════════════════════════════');
console.log('⚡ TEST SUITE: CONFIGURACIÓN Y CALIDAD DE SOMBRAS GPU / 3D TILES');
console.log('═════════════════════════════════════════════════════════════════════\n');

// 1. Simulación del entorno de navegador
global.window = global;
const mockLocalStorage = {};
global.localStorage = {
  getItem: (k) => mockLocalStorage[k] || null,
  setItem: (k, v) => { mockLocalStorage[k] = String(v); },
  removeItem: (k) => { delete mockLocalStorage[k]; }
};

global.Cesium = {
  ShadowMode: {
    DISABLED: 0,
    ENABLED: 1,
    CAST_ONLY: 2,
    RECEIVE_ONLY: 3
  }
};

const mockDOM = {};
function createMockElement(id) {
  return {
    id,
    value: '',
    textContent: '',
    style: {},
    classList: {
      _classes: new Set(),
      add: function(c) { this._classes.add(c); },
      remove: function(c) { this._classes.delete(c); },
      toggle: function(c, force) {
        if (force === true) this._classes.add(c);
        else if (force === false) this._classes.delete(c);
        else if (this._classes.has(c)) this._classes.delete(c);
        else this._classes.add(c);
      },
      contains: function(c) { return this._classes.has(c); }
    }
  };
}

global.document = {
  getElementById: (id) => {
    if (!mockDOM[id]) mockDOM[id] = createMockElement(id);
    return mockDOM[id];
  }
};

global.showToast = (title, msg, type) => {
  // Mock toast
};

// Mock Cesium scene and viewer
global.scene = {
  shadowMap: {
    enabled: true,
    size: 2048,
    numberOfCascades: 4,
    softShadows: true,
    darkness: 0.5,
    maximumDistance: 600,
    fadingEnabled: true,
    _fitNearFar: false,
    _primitiveBias: { polygonOffset: true, normalOffset: true, depthBias: 0.0002 },
    _terrainBias: { polygonOffset: true, normalOffset: true, depthBias: 0.0002 }
  },
  globe: { shadows: Cesium.ShadowMode.ENABLED },
  requestRender: () => {}
};

global.google3DTileset = { shadows: Cesium.ShadowMode.ENABLED, skipLevelOfDetail: false };
global.cesiumOsmBuildings = { shadows: Cesium.ShadowMode.ENABLED };
global.viewer = { terrainShadows: Cesium.ShadowMode.ENABLED };

// 2. Extraer y evaluar las funciones de sombras de index.html
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// Extraer el bloque de funciones
const startMarker = '// ── Configuración Centralizada de Sombras GPU & Terreno 3D ──';
const endMarker = 'window.wpSetShadowBiasMeters = window.raSetShadowBias;';

const sIdx = indexHtml.indexOf(startMarker);
const eIdx = indexHtml.indexOf(endMarker);

assert(sIdx !== -1, 'El marcador inicial de configuración de sombras debe existir en index.html');
assert(eIdx !== -1, 'El marcador final de configuración de sombras debe existir en index.html');

const shadowCode = indexHtml.slice(sIdx, eIdx + endMarker.length);
eval(shadowCode);

// [TEST 1] Valores por defecto y auto-sombrado activo
console.log('[TEST 1] Verificando valores por defecto y auto-sombrado de 3D Tiles / Terreno...');
assert.strictEqual(window.raShadowSettings.quality, 'high', 'Calidad por defecto debe ser "high" (2K)');
assert.strictEqual(window.raShadowSettings.maxDistance, 600, 'Radio de acción por defecto debe ser 600m');
assert.strictEqual(window.raShadowSettings.tilesetMode, 'enabled', 'Auto-sombrado de 3D Tiles y Terreno debe ser "enabled" (Completo) por defecto');
assert.strictEqual(window.google3DTileset.shadows, Cesium.ShadowMode.ENABLED, '3D Tiles debe proyectar y recibir sombras completas');
assert.strictEqual(window.scene.globe.shadows, Cesium.ShadowMode.ENABLED, 'El terreno (globe) debe proyectar y recibir sombras completas');
assert.strictEqual(window.viewer.terrainShadows, Cesium.ShadowMode.ENABLED, 'terrainShadows debe estar ENABLED');
console.log('✓ TEST 1 superado: Auto-sombra completa en 3D Tiles y Terreno activada por defecto.\n');

// [TEST 2] Selector de Calidad (Presets: Ultra 4K, Alta 2K, Media 1K, Desactivada)
console.log('[TEST 2] Verificando selector de presets de calidad gráfica de sombras...');
window.raSetShadowQuality('ultra');
assert.strictEqual(scene.shadowMap.size, 4096, 'Ultra debe configurar textura de 4096px');
assert.strictEqual(scene.shadowMap.numberOfCascades, 4, 'Ultra debe configurar 4 cascadas');
assert.strictEqual(scene.shadowMap.softShadows, true, 'Ultra debe tener sombras suaves');
assert.strictEqual(scene.shadowMap.fadingEnabled, true, 'Ultra debe tener desvanecimiento de cascada activo');

window.raSetShadowQuality('medium');
assert.strictEqual(scene.shadowMap.size, 1024, 'Media debe configurar textura de 1024px');
assert.strictEqual(scene.shadowMap.numberOfCascades, 2, 'Media debe configurar 2 cascadas');

window.raSetShadowQuality('off');
assert.strictEqual(scene.shadowMap.enabled, false, 'Modo "off" debe apagar el shadowMap de Cesium');
assert.strictEqual(google3DTileset.shadows, Cesium.ShadowMode.DISABLED, 'Modo "off" debe desactivar sombras en 3D tiles');
assert.strictEqual(scene.globe.shadows, Cesium.ShadowMode.DISABLED, 'Modo "off" debe desactivar sombras en el globo');

window.raSetShadowQuality('high');
assert.strictEqual(scene.shadowMap.enabled, true, 'Modo "high" debe reactivar shadowMap');
assert.strictEqual(scene.shadowMap.size, 2048, 'Modo "high" debe usar 2048px');
console.log('✓ TEST 2 superado: Todos los presets de calidad responden adecuadamente.\n');

// [TEST 3] Deslizador de Radio de Acción de Sombras (maximumDistance)
console.log('[TEST 3] Verificando deslizador de radio de acción de sombras...');
window.raSetShadowDistance(350);
assert.strictEqual(window.raShadowSettings.maxDistance, 350, 'maxDistance en raShadowSettings debe ser 350m');
assert.strictEqual(scene.shadowMap.maximumDistance, 350, 'scene.shadowMap.maximumDistance debe sincronizarse a 350m');
assert.strictEqual(document.getElementById('shadow-distance-display').textContent, '350 m', 'Display UI debe mostrar "350 m"');

window.raSetShadowDistance(1200);
assert.strictEqual(scene.shadowMap.maximumDistance, 1200, 'maximumDistance debe subir a 1200m');
assert.strictEqual(document.getElementById('shadow-distance-display').textContent, '1200 m', 'Display UI debe mostrar "1200 m"');
console.log('✓ TEST 3 superado: Deslizador de distancia controla el radio de sombras con precisión.\n');

// [TEST 4] Modos de sombra de Edificios 3D y Terreno (Completo / Solo Recibir / Desactivado)
console.log('[TEST 4] Verificando conmutación de modos de sombra de 3D Tiles y Terreno...');
// Modo Solo Recibir
window.raSetTilesetShadowMode('receive');
assert.strictEqual(window.raShadowSettings.tilesetMode, 'receive');
assert.strictEqual(google3DTileset.shadows, Cesium.ShadowMode.RECEIVE_ONLY, '3D Tiles debe estar en RECEIVE_ONLY');
assert.strictEqual(scene.globe.shadows, Cesium.ShadowMode.RECEIVE_ONLY, 'Globe debe estar en RECEIVE_ONLY');

// Modo Completo (volver al default requerido por el usuario)
window.raSetTilesetShadowMode('enabled');
assert.strictEqual(window.raShadowSettings.tilesetMode, 'enabled');
assert.strictEqual(google3DTileset.shadows, Cesium.ShadowMode.ENABLED, '3D Tiles debe estar en ENABLED (Proyectar + Recibir)');
assert.strictEqual(scene.globe.shadows, Cesium.ShadowMode.ENABLED, 'Globe debe estar en ENABLED');
console.log('✓ TEST 4 superado: Conmutador de auto-sombrado responde sin alterar los elementos diseñados.\n');

// [TEST 5] Persistencia en localStorage
console.log('[TEST 5] Verificando persistencia de preferencias en localStorage...');
const storedRaw = localStorage.getItem('ra_shadow_settings');
assert(storedRaw, 'Debe haberse guardado un objeto ra_shadow_settings en localStorage');
const stored = JSON.parse(storedRaw);
assert.strictEqual(stored.quality, 'high');
assert.strictEqual(stored.maxDistance, 1200);
assert.strictEqual(stored.tilesetMode, 'enabled');
console.log('✓ TEST 5 superado: Persistencia en localStorage correcta.\n');

// [TEST 6] Verificación de la estructura HTML en index.html
console.log('[TEST 6] Verificando presencia de controles en el popover HTML de index.html...');
assert(indexHtml.includes('id="ra-shadow-settings-card"'), 'La tarjeta de sombras debe existir en el popover');
assert(indexHtml.includes('id="shadow-distance-slider"'), 'El slider de distancia de sombras debe existir en el HTML');
assert(indexHtml.includes('id="btn-shadow-ultra"'), 'El botón de Ultra debe existir');
assert(indexHtml.includes('id="btn-shadow-high"'), 'El botón de Alta debe existir');
assert(indexHtml.includes('id="btn-tiles-shadow-enabled"'), 'El botón de auto-sombra Completa debe existir');
assert(indexHtml.includes('id="btn-tiles-shadow-receive"'), 'El botón de Solo Recibir debe existir');
assert(indexHtml.includes('id="shadow-bias-slider"'), 'El slider de despegue de sombras debe existir');
console.log('✓ TEST 6 superado: Toda la interfaz HTML está integrada en el menú de la rueda dentada.\n');

console.log('═════════════════════════════════════════════════════════════════════');
console.log('🎉 TODAS LAS PRUEBAS DE CONFIGURACIÓN DE SOMBRAS PASARON (100%)');
console.log('═════════════════════════════════════════════════════════════════════');
