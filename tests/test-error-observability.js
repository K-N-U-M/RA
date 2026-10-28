/**
 * tests/test-error-observability.js
 * [AUD-2026 · F-06] El manejador de errores debe dejar rastro exportable.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

const listeners = {};
const sandbox = {
  console: { warn: () => {}, error: () => {} },
  navigator: { userAgent: 'node-test' },
  localStorage: { getItem: () => 'proj_demo' },
  addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
  setInterval: () => 0,
  clearInterval: () => {},
  Date: Date,
  JSON: JSON,
  String: String,
  setTimeout: setTimeout
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/error-handler.js'), 'utf8'), sandbox, { filename: 'error-handler.js' });

const EH = sandbox.RA_ErrorHandler;
assert.ok(EH && typeof EH.handle === 'function', 'Debe exponerse RA_ErrorHandler');
assert.strictEqual(sandbox.RAErrors, EH, 'Debe existir el alias RAErrors');

console.log('═════════════════════════════════════════════════════════════════════');
console.log('⚡ TEST SUITE: OBSERVABILIDAD DE ERRORES');
console.log('═════════════════════════════════════════════════════════════════════');

// 1. handle() registra contexto, mensaje y paso.
sandbox.wpCurrentStep = 4;
EH.handle(new Error('Fallo de prueba'), 'guardado');
assert.strictEqual(EH.count(), 1, 'Debe registrarse una entrada');
const e1 = EH.entries()[0];
assert.strictEqual(e1.message, 'Fallo de prueba');
assert.strictEqual(e1.context, 'guardado');
assert.strictEqual(e1.step, 4);
assert.strictEqual(e1.projectId, 'proj_demo');
assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(e1.ts), 'Debe llevar marca temporal ISO');
console.log('  ✓ PASS: handle() guarda mensaje, contexto, proyecto y paso');

// 2. Los hooks globales capturan error y promesa rechazada.
assert.ok(listeners['error'] && listeners['error'].length >= 1, 'Debe registrar hook de error');
assert.ok(listeners['unhandledrejection'], 'Debe registrar hook de promesa rechazada');
listeners['error'][0]({ message: 'Boom global', error: new Error('Boom global') });
listeners['unhandledrejection'][0]({ reason: new Error('Promesa rota') });
assert.strictEqual(EH.count(), 3, 'Deben acumularse las tres entradas');
assert.ok(EH.entries().some(e => e.message === 'Promesa rota'));
console.log('  ✓ PASS: hooks globales de error y unhandledrejection');

// 3. Buffer circular acotado.
for (let i = 0; i < 80; i++) EH.handle(new Error('e' + i), 'loop');
assert.ok(EH.count() <= 50, `El buffer debe estar acotado (${EH.count()})`);
console.log(`  ✓ PASS: buffer circular acotado (${EH.count()} entradas)`);

// 4. Informe exportable y limpieza.
const report = JSON.parse(EH.exportJSON());
assert.ok(report.generatedAt && Array.isArray(report.entries), 'El informe debe tener fecha y lista');
assert.ok(report.entries.length > 0);
assert.strictEqual(report.userAgent, 'node-test');
EH.clear();
assert.strictEqual(EH.count(), 0);
console.log('  ✓ PASS: exportJSON() produce informe válido y clear() vacía');

console.log('═════════════════════════════════════════════════════════════════════');
console.log('🎉 OBSERVABILIDAD: TODAS LAS COMPROBACIONES PASARON');
console.log('═════════════════════════════════════════════════════════════════════');
