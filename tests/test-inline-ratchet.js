/**
 * tests/test-inline-ratchet.js
 * [AUD-2026 · F-01] Trinquete del monolito.
 *
 * El bloque inline de index.html no puede crecer. Este test fija el techo actual y
 * falla si aparece una función nueva, un duplicado más o líneas adicionales.
 * Para reducirlo: extraer a un módulo `js/*.js` y bajar la constante BASE.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// Techos congelados (2026-10-28). Solo pueden bajar.
const BASE = {
  inlineLines: 16414,
  inlineFunctions: 237,
  duplicateDeclarations: 0,
  namesSharedWithModules: 16
};

console.log('═════════════════════════════════════════════════════════════════════');
console.log('⚡ TEST SUITE: TRINQUETE DEL BLOQUE INLINE');
console.log('═════════════════════════════════════════════════════════════════════');

const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
const inline = blocks.join('\n');
const inlineLines = inline.split(/\r?\n/).length;

const decl = [...inline.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m => m[1]);
const counts = {};
decl.forEach(n => { counts[n] = (counts[n] || 0) + 1; });
const duplicates = Object.entries(counts).filter(([, v]) => v > 1);

const moduleNames = new Set();
for (const dir of ['js', path.join('js', 'wind')]) {
  for (const f of fs.readdirSync(path.join(ROOT, dir))) {
    if (!f.endsWith('.js')) continue;
    const src = fs.readFileSync(path.join(ROOT, dir, f), 'utf8');
    for (const m of src.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)) moduleNames.add(m[1]);
  }
}
const shared = [...new Set(decl)].filter(n => moduleNames.has(n)).sort();

const report = {
  inlineLines,
  inlineFunctions: decl.length,
  duplicateDeclarations: duplicates.length,
  namesSharedWithModules: shared.length
};
console.log('  Métricas:', JSON.stringify(report));

assert.ok(inlineLines <= BASE.inlineLines,
  `El inline creció ${inlineLines - BASE.inlineLines} líneas (${inlineLines} > ${BASE.inlineLines}). ` +
  'Extrae la lógica a js/*.js; no añadas código al monolito.');

assert.ok(decl.length <= BASE.inlineFunctions,
  `Hay ${decl.length} funciones inline (techo ${BASE.inlineFunctions}).`);

assert.deepStrictEqual(duplicates, [], 'Funciones declaradas dos veces en el inline: ' +
  duplicates.map(([n, v]) => `${n}×${v}`).join(', '));

assert.ok(shared.length <= BASE.namesSharedWithModules,
  `Nombres compartidos inline↔módulos: ${shared.length} > ${BASE.namesSharedWithModules}. ` +
  'Nuevos duplicados: ' + shared.join(', '));

console.log(`  ✓ PASS: ${inlineLines} líneas (techo ${BASE.inlineLines}) · ${shared.length} nombres compartidos (techo ${BASE.namesSharedWithModules})`);

// Los duplicados conocidos deben delegar o ser utilidades triviales justificadas.
const KNOWN = new Set([
  '_initTriadOnce', 'setElemText', 'get3DPosition', 'getSelectedPanel', 'deleteSelectedPanel',
  'isPointInPolygon2D', 'calculateDynamicMPPTStringLimits', 'partitionPanelsIntoMPPTStrings',
  'segmentsIntersect2D', 'polygonsIntersect2D', 'convexHull2D', 'cross', 'getProjectCalcs',
  'getPolylineStringColor', 'getSnakeOrderedPanels', 'initUnifiedWorkPlaneSystem'
]);
const unexpected = shared.filter(n => !KNOWN.has(n));
assert.deepStrictEqual(unexpected, [], 'Duplicados nuevos no inventariados: ' + unexpected.join(', '));
console.log('  ✓ PASS: sin duplicados nuevos fuera del inventario conocido');

console.log('═════════════════════════════════════════════════════════════════════');
console.log('🎉 TRINQUETE INLINE: TODAS LAS COMPROBACIONES PASARON');
console.log('═════════════════════════════════════════════════════════════════════');
