#!/usr/bin/env node
/**
 * tests/run-all.js — Runner agregado de la batería RA.
 *
 * Objetivos (auditoría 2026-10-27, hallazgo A-06):
 *  - Descubrir automáticamente todos los tests `test-*.js`.
 *  - Ejecutar CADA uno en un proceso aislado, con timeout.
 *  - NO abortar en el primer fallo: agregar resultados y devolver exit 1 al final.
 *  - Informar de duración y de la última línea de error de los que fallan.
 *
 * Uso:
 *   node tests/run-all.js              # todos
 *   node tests/run-all.js --only=docs  # filtra por subcadena
 *   node tests/run-all.js --bail       # se detiene en el primer fallo (CI rápida)
 *   node tests/run-all.js --timeout=180000
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const TESTS_DIR = __dirname;
const ROOT = path.resolve(__dirname, '..');
const DEFAULT_TIMEOUT_MS = 120000;

function parseArgs(argv) {
  const opts = { only: null, bail: false, timeout: DEFAULT_TIMEOUT_MS };
  for (const a of argv.slice(2)) {
    if (a.startsWith('--only=')) opts.only = a.slice('--only='.length);
    else if (a === '--bail') opts.bail = true;
    else if (a.startsWith('--timeout=')) {
      const n = parseInt(a.slice('--timeout='.length), 10);
      if (Number.isFinite(n) && n > 0) opts.timeout = n;
    }
  }
  return opts;
}

function discover(opts) {
  return fs.readdirSync(TESTS_DIR)
    .filter(f => /^test-.*\.js$/.test(f) && f !== 'run-all.js')
    .filter(f => opts.only ? f.includes(opts.only) : f !== 'test-firebase-rules.js')
    .sort();
}

function lastMeaningfulLine(text) {
  if (!text) return '';
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const err = lines.find(l => /AssertionError|TypeError|ReferenceError|SyntaxError|Error:|✗ FAIL|FAIL:/.test(l));
  return (err || lines[lines.length - 1] || '').slice(0, 160);
}

function hr() {
  return '─'.repeat(78);
}

function main() {
  const opts = parseArgs(process.argv);
  const files = discover(opts);

  console.log(hr());
  console.log(`🧪 RA · Batería de pruebas (${files.length} archivos) · timeout ${opts.timeout} ms`);
  console.log(hr());

  const results = [];
  let failures = 0;

  for (const file of files) {
    const started = Date.now();
    const res = spawnSync(process.execPath, [path.join(TESTS_DIR, file)], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: opts.timeout,
      maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, RA_TEST_RUNNER: '1' }
    });
    const ms = Date.now() - started;
    const timedOut = res.error && res.error.code === 'ETIMEDOUT';
    const ok = !timedOut && res.status === 0;
    const output = `${res.stdout || ''}\n${res.stderr || ''}`;

    results.push({ file, ok, ms, timedOut, output });
    if (!ok) failures++;

    const mark = ok ? '✅' : (timedOut ? '⏱️' : '❌');
    console.log(`${mark} ${file.padEnd(42)} ${String(ms).padStart(6)} ms`);
    if (!ok) {
      console.log(`     ↳ ${timedOut ? `timeout tras ${opts.timeout} ms` : lastMeaningfulLine(output)}`);
      if (opts.bail) {
        console.log('\n--bail activo: deteniendo la batería en el primer fallo.');
        break;
      }
    }
  }

  console.log(hr());
  const ran = results.length;
  const passed = ran - failures;
  console.log(`📊 RESUMEN: ${passed}/${ran} pruebas superadas · ${failures} fallidas`);
  if (failures > 0) {
    console.log('Fallidas:');
    results.filter(r => !r.ok).forEach(r => console.log(`  · ${r.file}`));
  }
  console.log(hr());

  process.exit(failures > 0 ? 1 : 0);
}

main();
