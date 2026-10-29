/**
 * tests/test-step4-no-placeholder.js
 * [AUD-2026 · H3] El Paso 4 no muestra cifras falsas como valores iniciales.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

console.log('═════════════════════════════════════════════════════════════════════');
console.log('⚡ TEST SUITE: SIN CIFRAS DE RELLENO EN EL PASO 4');
console.log('═════════════════════════════════════════════════════════════════════');

// Los ids del semáforo y la telemetría no deben nacer con números plausibles.
const FORBIDDEN = [
  ['step3-spec-nmax', /Máx\.\s*\d+/],
  ['step3-spec-nmin', /Mín\.\s*\d+/],
  ['step3-spec-totmax', /\d+\s*placas\s*\(\d/],
  ['step3-spec-imp-check', /\d+\.\d\s*A\s*≤/],
  ['step3-spec-isc-check', /\d+\.\d\s*A\s*≤/],
  ['step3-spec-roof-load', /~\d+\.\d+\s*kg/],
  ['inverter-stat-sec-dc', /\d+\s*mm²\s*·\s*ΔV/],
  ['inverter-stat-sec-ac', /\d+\s*mm²\s*·\s*ΔV/]
];

function elementBody(id) {
  const m = html.match(new RegExp('id="' + id + '"[^>]*>([\\s\\S]*?)<\\/'));
  return m ? m[1] : '';
}

for (const [id, re] of FORBIDDEN) {
  const body = elementBody(id);
  assert.ok(!re.test(body), `${id} no debe contener un valor numérico de relleno (recibido: "${body.trim().slice(0, 40)}")`);
}
console.log('  ✓ PASS: semáforo y telemetría sin cifras de relleno');

// El estado inicial debe ser neutral ("—" / "Calculando…"), no un dato concreto.
assert.ok(elementBody('step3-spec-nmax').includes('Calculando'), 'nmax debe iniciar en "Calculando…"');
assert.ok(elementBody('inverter-stat-sec-dc').includes('—'), 'sec-dc debe iniciar en "—"');
console.log('  ✓ PASS: valores iniciales neutrales');

console.log('═════════════════════════════════════════════════════════════════════');
console.log('🎉 PASO 4 SIN PLACEHOLDERS: TODAS LAS COMPROBACIONES PASARON');
console.log('═════════════════════════════════════════════════════════════════════');
