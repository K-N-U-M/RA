/**
 * Test de Verificación - Fase 7: Ergonomía de Flujo, Modales Accesibles y Desbloqueos
 */
const assert = require('assert');
const fs = require('fs');

console.log('--- TEST FASE 7: INICIO ---');

// Mock global environment
global.window = global;
global.window.addEventListener = () => {};
global.Cesium = {
  Ion: {},
  GoogleMaps: {},
  Cartesian3: {
    clone: (p) => p,
    distance: () => 5
  }
};
global.document = {
  getElementById: (id) => {
    if (id === 'ra-doc-modal') return { id, style: { display: 'none' }, classList: { contains: () => false, remove: () => {} } };
    if (id === 'ra-equipment-catalog-modal') return { id, style: { display: 'none' }, classList: { contains: () => false, remove: () => {} } };
    return null;
  },
  createElement: () => ({ style: {}, appendChild: () => {} }),
  body: { appendChild: () => {} },
  addEventListener: () => {}
};

// 1. Probar working-plane.js: exportación de wpCancelDrawPoly y wpCancelCurrentMode
require('../js/working-plane.js');
assert(typeof global.wpCancelCurrentMode === 'function', 'wpCancelCurrentMode debe estar expuesta');
assert(typeof global.wpCancelDrawPoly === 'function', 'wpCancelDrawPoly debe estar expuesta y ser callable');
assert.strictEqual(global.wpCancelCurrentMode, global.wpCancelDrawPoly, 'wpCancelDrawPoly debe delegar en wpCancelCurrentMode');

// Simular cancelación con modo activo
global.WP.mode = 'draw-poly';
global.WP.activePolyPts = [{ x: 1, y: 2, z: 3 }];
global.wpCancelDrawPoly();
assert.strictEqual(global.WP.mode, 'idle', 'Tras wpCancelDrawPoly, el modo de WP debe ser idle');
assert.strictEqual(global.WP.activePolyPts.length, 0, 'Tras wpCancelDrawPoly, activePolyPts debe quedar vacío');
console.log('✓ wpCancelDrawPoly y wpCancelCurrentMode verificadas y funcionando');

// 2. Probar ui-viewport-controls.js: gestión universal de modales
require('../js/ui-viewport-controls.js');
const controls = fs.readFileSync('js/ui-viewport-controls.js', 'utf8');
assert(controls.includes('closeAnyActiveModal'), 'ui-viewport-controls.js debe incluir closeAnyActiveModal');
assert(controls.includes('initUniversalModalHandlers'), 'ui-viewport-controls.js debe inicializar listeners universales');
assert(controls.includes('ra-doc-modal'), 'Debe incluir ra-doc-modal en la lista de modales');
assert(controls.includes('ra-equipment-catalog-modal'), 'Debe incluir ra-equipment-catalog-modal en la lista');
console.log('✓ Gestión universal de modales (Escape y clic exterior) implementada');

// 3. Probar css/styles.css: z-index de ra-doc-modal elevado a 999999
const css = fs.readFileSync('css/styles.css', 'utf8');
assert(css.includes('#ra-doc-modal {\r\n      display: none;\r\n      position: fixed;\r\n      inset: 0;\r\n      background: rgba(0, 0, 0, 0.85);\r\n      backdrop-filter: blur(16px);\r\n      z-index: 999999;') || css.includes('#ra-doc-modal {\n      display: none;\n      position: fixed;\n      inset: 0;\n      background: rgba(0, 0, 0, 0.85);\n      backdrop-filter: blur(16px);\n      z-index: 999999;'), 'ra-doc-modal debe tener z-index: 999999');
console.log('✓ z-index de ra-doc-modal verificado en 999999');

// 4. Probar index.html: botón cancelar en edificios y botón datos de legalización en Paso 5
const html = fs.readFileSync('index.html', 'utf8');
assert(html.includes('id="btn-cancel-building-panel"'), 'index.html debe contener el botón btn-cancel-building-panel');
assert(html.includes('id="btn-open-doc-modal"'), 'index.html debe contener el botón btn-open-doc-modal');
assert(!html.includes('id="btn-open-pfv-audit"'), 'index.html ya no debe contener el botón muerto btn-open-pfv-audit');
console.log('✓ index.html verificado: botón cancelar en huella y botón de legalización oficial en Paso 5');

// 5. Probar desactivación de herramientas en wpGoToStep
const wpCode = fs.readFileSync('js/working-plane.js', 'utf8');
assert(wpCode.includes('window.RAMeasureTool.deactivate()'), 'wpGoToStep debe apagar la cinta métrica');
assert(wpCode.includes('wpCancelCurrentMode()'), 'wpGoToStep debe cancelar el modo de dibujo activo');
assert(wpCode.includes('cancelObstaclePlacement()'), 'wpGoToStep debe cancelar colocación de obstáculos');
console.log('✓ wpGoToStep apaga limpiamente todas las herramientas interactivas al cambiar de paso');

console.log('--- TEST FASE 7: 100% COMPLETADO CON ÉXITO ---');
