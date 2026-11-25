#!/usr/bin/env node
/**
 * scripts/sast-check.mjs — Comprobación estática SAST ligera para CI/CD [F6-05]
 * =============================================================================
 * Verifica sin dependencias externas las invariantes críticas de seguridad y paridad:
 *  1. Paridad exacta entre js/wind/wasp-parser.js y functions/wasp-parser.js.
 *  2. Cero llamadas nativas bloqueantes alert()/confirm()/prompt() en js/.
 *  3. Cero secretos/claves API literales (AIza...) en archivos versionados.
 *  4. Cero orígenes comodín *.web.app en CORS de Cloud Functions.
 *  5. Cero z-index manuales > 700 en css/styles.css e index.html.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const failures = [];

function walkJs(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walkJs(p, out);
    else if (p.endsWith('.js') && entry.name !== 'ra-env.js') out.push(p);
  }
  return out;
}

// 1. Paridad SSOT wasp-parser.js <-> functions/wasp-parser.js
const srcWasp = fs.readFileSync(path.join(ROOT, 'js', 'wind', 'wasp-parser.js'), 'utf8').replace(/\r\n/g, '\n');
const fnWasp = fs.readFileSync(path.join(ROOT, 'functions', 'wasp-parser.js'), 'utf8').replace(/\r\n/g, '\n');
if (srcWasp !== fnWasp) {
  failures.push('Desincronización entre js/wind/wasp-parser.js y functions/wasp-parser.js (ejecuta npm run sync:functions)');
}

// 2. Cero diálogos nativos bloqueantes en js/
for (const file of walkJs(path.join(ROOT, 'js'))) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, idx) => {
    const t = line.trim();
    if (t.startsWith('//') || t.startsWith('*')) return;
    if (/\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/.test(t) && !/raAlert|raConfirm|raPrompt|confirmAsync|promptAsync|alertdialog/i.test(t)) {
      failures.push(`Diálogo nativo bloqueante en ${path.relative(ROOT, file)}:${idx + 1}`);
    }
    if (/AIza[0-9A-Za-z\-_]{30,}/.test(t)) {
      failures.push(`Posible clave Google API hardcodeada en ${path.relative(ROOT, file)}:${idx + 1}`);
    }
  });
}

// 3. Cero comodín *.web.app en CORS de functions/index.js
const fnIndex = fs.readFileSync(path.join(ROOT, 'functions', 'index.js'), 'utf8');
if (/\[a-z0-9-\]\+\\\.web\\\.app/.test(fnIndex)) {
  failures.push('CORS de functions/index.js contiene comodín *.web.app inseguro');
}

// 4. Escala z-index <= 700 en css/styles.css e index.html
for (const rel of ['css/styles.css', 'index.html']) {
  const txt = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const matches = [...txt.matchAll(/z-index\s*:\s*(\d+)/gi)].filter((m) => parseInt(m[1], 10) > 700);
  if (matches.length > 0) {
    failures.push(`${rel} contiene ${matches.length} declaraciones z-index > 700`);
  }
}

if (failures.length > 0) {
  console.error('[SAST] Fallos detectados:');
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log('[SAST] OK — Todas las guardas de seguridad y paridad pasaron.');
