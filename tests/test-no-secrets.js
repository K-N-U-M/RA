/**
 * tests/test-no-secrets.js
 * [AUD-2026 · B-04] Contrato: ninguna credencial en archivos versionados.
 *
 * Las claves viven en `js/ra-env.js` (ignorado por git) y se consumen vía `window.RA_ENV`.
 * Este test falla si aparece un literal de Google/Cesium/Firebase fuera de ese archivo.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SCAN_EXT = new Set(['.js', '.html', '.json', '.rules', '.md']);
const SKIP_DIRS = new Set(['node_modules', '.git', '.firebase', 'tests']);
const SKIP_FILES = new Set(['ra-env.js', 'ra-env.example.js']);

const PATTERNS = [
  { name: 'Google API key', re: /AIza[0-9A-Za-z_-]{20,}/ },
  { name: 'Cesium Ion JWT', re: /eyJhbGciOiJIUzI1NiIs[A-Za-z0-9._-]{20,}/ },
  { name: 'Firebase apiKey literal', re: /apiKey\s*:\s*["'][^"']{30,}["']/ }
];

const findings = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.gitignore') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(full);
      continue;
    }
    if (SKIP_FILES.has(entry.name)) continue;
    if (!SCAN_EXT.has(path.extname(entry.name))) continue;
    const text = fs.readFileSync(full, 'utf8');
    for (const p of PATTERNS) {
      const m = text.match(p.re);
      if (m) findings.push({ file: path.relative(ROOT, full), pattern: p.name, sample: m[0].slice(0, 12) + '…' });
    }
  }
}

console.log('═════════════════════════════════════════════════════════════════════');
console.log('⚡ TEST SUITE: AUSENCIA DE CREDENCIALES EN ARCHIVOS VERSIONADOS');
console.log('═════════════════════════════════════════════════════════════════════');

walk(ROOT);

assert.deepStrictEqual(findings, [], 'Credenciales encontradas en archivos versionados:\n' +
  findings.map(f => `  · ${f.file} → ${f.pattern} (${f.sample})`).join('\n'));
console.log('  ✓ PASS: sin literales de Google/Cesium/Firebase fuera de js/ra-env.js');

// El archivo de credenciales debe estar ignorado y existir una plantilla.
const gitignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
assert.ok(/^js\/ra-env\.js\s*$/m.test(gitignore), '.gitignore debe excluir js/ra-env.js');
assert.ok(fs.existsSync(path.join(ROOT, 'doc/ra-env.example.js')), 'Debe existir doc/ra-env.example.js');
console.log('  ✓ PASS: js/ra-env.js ignorado por git y plantilla disponible');

// Los consumidores deben leer del entorno, no de literales.
const configSrc = fs.readFileSync(path.join(ROOT, 'js/config.js'), 'utf8');
assert.ok(/window\.RA_ENV/.test(configSrc), 'config.js debe leer window.RA_ENV');
assert.ok(/RA_CONFIG_KEYS/.test(configSrc), 'config.js debe exponer RA_CONFIG_KEYS');

const fbSrc = fs.readFileSync(path.join(ROOT, 'js/firebase-service.js'), 'utf8');
assert.ok(/RA_ENV\s*&&\s*window\.RA_ENV\.firebase/.test(fbSrc), 'firebase-service debe leer la config de RA_ENV');

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
assert.ok(html.indexOf('js/ra-env.js') !== -1, 'index.html debe cargar js/ra-env.js');
assert.ok(html.indexOf('js/ra-env.js') < html.indexOf('js/config.js'), 'ra-env.js debe cargarse antes que config.js');
console.log('  ✓ PASS: consumidores leen el entorno y el orden de carga es correcto');

// Documentación mínima de rotación.
const example = fs.readFileSync(path.join(ROOT, 'doc/ra-env.example.js'), 'utf8');
assert.ok(/restringir por HTTP referrer/i.test(example), 'la plantilla debe explicar la restricción de claves');
assert.ok(/Rotación/i.test(example), 'la plantilla debe explicar la rotación');
console.log('  ✓ PASS: plantilla con instrucciones de restricción y rotación');

console.log('═════════════════════════════════════════════════════════════════════');
console.log('🎉 GESTIÓN DE CREDENCIALES: TODAS LAS COMPROBACIONES PASARON');
console.log('═════════════════════════════════════════════════════════════════════');
