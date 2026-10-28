/**
 * tests/test-document-integrity.js
 * [AUD-2026 · A-01/A-02/A-03/A-05/B-08] Integridad de los documentos comerciales.
 *
 * Regla de oro: ningún documento puede inventar una métrica financiera ni publicar
 * un VAN sin signo. Si no hay modelo, se dice «N/D».
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

// ── Entorno mínimo para evaluar el dossier ────────────────────────────────────
global.window = global;
global.document = {
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => ({ style: {}, appendChild: () => {}, setAttribute: () => {} }),
  addEventListener: () => {}
};
global.localStorage = { getItem: () => null, setItem: () => {} };

const dossierSrc = fs.readFileSync(path.join(ROOT, 'js/commercial-proposal-dossier.js'), 'utf8');
vm.runInThisContext(dossierSrc, { filename: 'commercial-proposal-dossier.js' });

const Dossier = global.CommercialProposalDossier;
assert.ok(Dossier && Dossier._audit, 'El dossier debe exponer su superficie de auditoría');

console.log('═════════════════════════════════════════════════════════════════════');
console.log('⚡ TEST SUITE: INTEGRIDAD DE DOCUMENTOS COMERCIALES');
console.log('═════════════════════════════════════════════════════════════════════');

// 1. VAN: signo real, sin fabricación.
const { computeVanLabel } = Dossier._audit;
const digits = (s) => String(s).replace(/\D/g, '');

const vanNeg = computeVanLabel({ van: -8000 });
assert.ok(vanNeg.startsWith('-'), `Un VAN negativo debe llevar signo (${vanNeg})`);
assert.strictEqual(digits(vanNeg), '8000', 'El importe debe ser 8.000 €');
assert.strictEqual(computeVanLabel({ van: 0 }), '0 €', 'Un VAN nulo debe imprimirse como 0 €');
assert.strictEqual(digits(computeVanLabel({ van: 19065.63 })), '19066', 'Un VAN positivo se redondea');
assert.strictEqual(computeVanLabel(null), 'N/D', 'Sin modelo financiero: N/D');
assert.strictEqual(computeVanLabel({}), 'N/D', 'Sin campo van: N/D');
assert.strictEqual(computeVanLabel({ van: NaN }), 'N/D', 'NaN no es un VAN');
console.log('  ✓ PASS: VAN con signo real y «N/D» cuando no hay modelo');

// El archivo no debe contener la fórmula de emergencia que positivizaba el VAN.
assert.ok(!/Math\.max\(0,\s*ahorro25/.test(dossierSrc), 'No debe quedar la fórmula que fabricaba el VAN');
assert.ok(!/van\s*>\s*0\s*\?/.test(dossierSrc), 'La etiqueta de VAN no debe condicionarse a van > 0');
console.log('  ✓ PASS: sin rama de VAN fabricado en el código');

// 2. Reparto de CAPEX: los módulos no pueden valer el precio unitario.
const { computeCapexBreakdown } = Dossier._audit;
const designCosts = {
  directCostTotal: 10000,
  panelPrice: 95,
  panelTotalCost: 95 * 24,   // 24 módulos
  invPrice: 1650, batPrice: 0, estPrice: 1320,
  cabPrice: 900, moPrice: 3000
};
const totalCost = 12000; // con margen
const parts = computeCapexBreakdown(designCosts, totalCost, 24);
const sum = parts.panPart + parts.invPart + parts.estPart + parts.cabPart + parts.moPart + parts.legPart;

assert.strictEqual(sum, Math.round(totalCost), 'La suma de capítulos debe cerrar contra el total (±1 €)');
assert.ok(parts.panPart > 2000, `La partida de módulos debe ser el total (${parts.panPart} €), no el unitario`);
// El reparto se escala con el margen comercial: 2.280 € de módulos sobre 10.000 € directos
// → 22,8 % del total (2.736 € sobre 12.000 €). El unitario "a pelo" habría dado ~114 €.
const panelShare = parts.panPart / totalCost;
assert.ok(Math.abs(panelShare - 0.228) < 0.01, `Los módulos deben pesar ~22,8 % del CAPEX (${(panelShare * 100).toFixed(1)} %)`);
assert.ok(parts.legPart < totalCost * 0.2, `Legalizaciones no puede absorber el descuadre (${parts.legPart} €)`);

// Con 24 módulos a 95 € el precio unitario "a pelo" habría dado ~95 €.
assert.notStrictEqual(parts.panPart, Math.round(95 * (totalCost / designCosts.directCostTotal)),
  'Regresión A-02: la partida de módulos vuelve a usar el precio unitario');
console.log('  ✓ PASS: CAPEX por capítulos cierra y los módulos usan el coste total');

// 3. docs-generator: sin constantes de escaparate.
const docsSrc = fs.readFileSync(path.join(ROOT, 'js/docs-generator.js'), 'utf8');
assert.ok(!/:\s*'16\.4'\s*;/.test(docsSrc), "docs-generator no debe contener la TIR de relleno '16.4'");
assert.ok(!/:\s*'4\.2'\s*;/.test(docsSrc), "docs-generator no debe contener el payback de relleno '4.2'");
assert.ok(!/\*\s*2\.8\)/.test(docsSrc), 'docs-generator no debe fabricar el VAN con ×2,8');
assert.ok(!/\*\s*15\.6/.test(docsSrc), 'docs-generator no debe fabricar el VAN con ×15,6');
assert.ok(docsSrc.includes("'N/D'"), 'docs-generator debe declarar N/D cuando falta el modelo');
assert.ok(docsSrc.includes('DOCUMENTO EMITIDO SIN MODELO FINANCIERO'), 'debe avisar en el documento sin modelo');
console.log('  ✓ PASS: la memoria/presupuesto no inventan TIR, VAN ni payback');

// 4. CEL: apagada por defecto en las tres rutas.
const finSrc = fs.readFileSync(path.join(ROOT, 'js/financials.js'), 'utf8');
assert.ok(/includeCEL:\s*false/.test(finSrc), 'La CEL debe nacer desactivada en la configuración');
assert.ok(!/includeCEL:\s*true/.test(finSrc), 'No debe quedar ningún default includeCEL: true');
assert.ok(!/certificada CEL-Ready/.test(finSrc), 'No se debe afirmar certificación CEL sin fuente');
console.log('  ✓ PASS: CEL desactivada por defecto y sin afirmación de certificación');

// 5. Sanitizador: sin DOM degrada a texto escapado (nunca ejecuta).
const sanitizerSrc = fs.readFileSync(path.join(ROOT, 'js/sanitizer.js'), 'utf8');
vm.runInThisContext(sanitizerSrc, { filename: 'sanitizer.js' });
assert.ok(global.RASanitize && typeof global.RASanitize.richText === 'function', 'RASanitize debe exportarse');
const dirty = 'Hola <img src=x onerror="alert(1)"> <b>mundo</b>';
const clean = global.RASanitize.richText(dirty);
assert.ok(!/<img/i.test(clean), 'El sanitizador no debe dejar pasar <img>');
// En Node (sin DOMParser) el fallback escapa todo: no debe quedar ninguna etiqueta viva.
if (typeof DOMParser !== 'function') {
  assert.ok(clean.indexOf('<') === -1, 'Sin DOM, el fallback debe escapar todas las etiquetas');
}
assert.ok(clean.includes('Hola'), 'El texto legítimo debe conservarse');
console.log('  ✓ PASS: sanitizador elimina etiquetas/atributos peligrosos');

console.log('═════════════════════════════════════════════════════════════════════');
console.log('🎉 INTEGRIDAD DOCUMENTAL: TODAS LAS COMPROBACIONES PASARON');
console.log('═════════════════════════════════════════════════════════════════════');
