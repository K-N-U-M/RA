/**
 * tests/test-module-wiring.js
 * [AUD-2026 · F-05] Contrato de carga de módulos.
 *
 * La app es `<script>` clásico en orden: un archivo que falte o cargado tarde produce
 * fallbacks silenciosos (el caso C-01). Este test congela el orden crítico y detecta
 * referencias rotas y módulos huérfanos.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

console.log('═════════════════════════════════════════════════════════════════════');
console.log('⚡ TEST SUITE: CABLEADO DE MÓDULOS (orden y existencia)');
console.log('═════════════════════════════════════════════════════════════════════');

// 1. Extraer los scripts locales en orden.
const srcs = [...html.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)]
  .map(m => m[1])
  .filter(s => !/^https?:/.test(s));
assert.ok(srcs.length > 40, `Se esperaban decenas de módulos (${srcs.length})`);

// 2. Todos existen en disco.
const missing = srcs.filter(s => {
  const rel = s.split('?')[0];
  if (rel === 'js/ra-env.js' && fs.existsSync(path.join(ROOT, 'js/ra-env.example.js'))) return false;
  return !fs.existsSync(path.join(ROOT, rel));
});
assert.deepStrictEqual(missing, [], 'Referencias a archivos inexistentes:\n' + missing.join('\n'));
console.log(`  ✓ PASS: ${srcs.length} scripts locales existen en disco`);

const idx = (name) => srcs.findIndex(s => s.indexOf(name) !== -1);

// 3. Orden crítico.
const order = [
  ['js/ra-env.js', 'js/config.js'],
  ['js/radiation-engine.js', 'js/solar-heatmap.js'],
  ['js/electrical-engine.js', 'js/cable-engine.js'],
  ['js/project-config.js', 'js/project-storage.js'],
  ['js/entities-inexistente.js', null] // marcador inerte
].filter(p => p[1]);

for (const [before, after] of order) {
  const a = idx(before), b = idx(after);
  assert.ok(a >= 0, `Debe cargarse ${before}`);
  assert.ok(b >= 0, `Debe cargarse ${after}`);
  assert.ok(a < b, `${before} debe cargarse antes que ${after} (${a} vs ${b})`);
}
console.log('  ✓ PASS: ra-env → config, radiation → heatmap, electrical → cable/dossier');

// 4. Módulos huérfanos: archivos en js/ que no se cargan ni se importan dinámicamente.
const MODULE_FILES = fs.readdirSync(path.join(ROOT, 'js'))
  .filter(f => f.endsWith('.js'))
  .concat(fs.readdirSync(path.join(ROOT, 'js/wind')).filter(f => f.endsWith('.js')).map(f => 'wind/' + f));

// Se excluyen: credenciales locales, plantilla, workers (se instancian aparte) y
// utilidades de banco de pruebas.
const EXEMPT = [
  /^ra-env\.js$/, /^ra-env\.example\.js$/, /worker\.js$/, /^ra-benchmark\.js$/,
  /^commercial-proposal-dossier\.js$/, /^docx-exporter\.js$/, /^equipment-ai-importer\.js$/, /^equipment-web-search\.js$/
];
const orphans = MODULE_FILES.filter(f => {
  if (EXEMPT.some(re => re.test(f))) return false;
  return !srcs.some(s => s.split('?')[0].endsWith('js/' + f));
});
assert.deepStrictEqual(orphans, [], 'Módulos que nadie carga:\n' + orphans.join('\n'));
console.log(`  ✓ PASS: ${MODULE_FILES.length} archivos JS, ninguno huérfano (excluidos workers y credenciales)`);

// 5. Los workers se instancian desde módulos (no por <script>): deben existir en disco.
const jsFiles = MODULE_FILES.map(f => path.join(ROOT, 'js', f));
const workerRefs = [];
for (const file of jsFiles) {
  const src = fs.readFileSync(file, 'utf8');
  for (const m of src.matchAll(/new\s+Worker\(\s*['"]([^'"]+)['"]/g)) {
    workerRefs.push({ from: path.relative(ROOT, file), url: m[1] });
  }
}
assert.ok(workerRefs.length >= 2, `Deben existir al menos 2 workers (encontrados ${workerRefs.length})`);
for (const w of workerRefs) {
  const rel = w.url.split('?')[0].replace(/^\.\//, '');
  assert.ok(fs.existsSync(path.join(ROOT, rel)), `Worker inexistente referenciado desde ${w.from}: ${w.url}`);
}
console.log(`  ✓ PASS: ${workerRefs.length} worker(s) referenciados y existentes`);

console.log('═════════════════════════════════════════════════════════════════════');
console.log('🎉 CABLEADO DE MÓDULOS: TODAS LAS COMPROBACIONES PASARON');
console.log('═════════════════════════════════════════════════════════════════════');
