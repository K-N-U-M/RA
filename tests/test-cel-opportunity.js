/**
 * Test: Comunidad Energética Local (CEL) & Monetización de Excedentes 5 km (RDL 7/2026)
 * Verifica el cálculo de métricas financieras y regulatorias de CEL,
 * así como la generación del módulo visual en la propuesta comercial.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Mock DOM environment if not present
if (typeof window === 'undefined') {
  global.window = {
    allRenderedPanels: [],
    solarProjectConfig: {},
    equipmentCatalog: { inverters: [], batteries: [], modules: [] }
  };
  global.document = {
    getElementById: () => null,
    querySelectorAll: () => []
  };
  global.localStorage = {
    _data: {},
    getItem(k) { return this._data[k] || null; },
    setItem(k, v) { this._data[k] = String(v); }
  };
}

const financials = require('../js/financials.js');

console.log('🧪 Iniciando tests de Comunidad Energética Local (CEL · RDL 7/2026)...');

// ── TEST 1: Verificar función calculateCELMetrics y marco regulatorio de 5 km ──
console.log('\n--- TEST 1: Métricas de ingeniería y económicas de CEL ---');
assert.strictEqual(typeof financials.calculateCELMetrics, 'function', 'calculateCELMetrics debe ser una función');

const mockD = {
  refNum: 'PROP-2026-TEST',
  annualKWh: 8000,
  numPanels: 12,
  tit: { nombre: 'García Pérez', mun: 'Getafe', prov: 'Madrid' }
};

const mockM = {
  annualYieldKWh: 8000,
  autoconsumoDirecto: 3800,
  bateriaKWh: 0,
  excedenteKWh: 4200,
  capexBruto: 7500,
  capexNeto: 4800,
  ahorroLuzAnio1: 850,
  paybackYears: 5.6
};

const cel = financials.calculateCELMetrics(mockD, mockM, 0.11);
console.log('Métricas calculadas:', {
  excedenteKWh: cel.excKWh,
  ingresoPoolAnual: cel.ingresoPoolAnual,
  ingresoCELAnual: cel.ingresoCELAnual,
  beneficioExtraCEL: cel.beneficioExtraCEL,
  paybackTradicional: cel.paybackTradicional,
  paybackCEL: cel.paybackCEL,
  reduccionPaybackAnios: cel.reduccionPaybackAnios,
  familiasBeneficiadas: cel.familiasBeneficiadas,
  distanciaMaxKm: cel.distanciaMaxKm,
  areaKm2: cel.areaKm2,
  normativa: cel.normativa
});

// Verificación normativa estricta
assert.strictEqual(cel.distanciaMaxKm, 5, 'El radio máximo debe ser de 5 km');
assert.strictEqual(cel.distanciaMaxMetros, 5000, 'La distancia en metros debe ser 5.000 m');
assert.strictEqual(cel.areaKm2, 78.5, 'El área de cobertura debe ser de 78,5 km² (pi * 5^2)');
assert.ok(cel.normativa.includes('Real Decreto-ley 7/2026'), 'Debe citar Real Decreto-ley 7/2026');
assert.ok(cel.ordenTED.includes('Orden TED/1247/2021'), 'Debe citar Orden TED/1247/2021');

// Verificación económica
assert.strictEqual(cel.precioPool, 0.05, 'El precio pool mayorista de referencia debe ser 0,05 €/kWh');
assert.strictEqual(cel.precioCEL, 0.11, 'El precio CEL de referencia debe ser 0,11 €/kWh');
assert.strictEqual(cel.ingresoPoolAnual, Math.round(4200 * 0.05), 'Ingreso pool correcto (210 €)');
assert.strictEqual(cel.ingresoCELAnual, Math.round(4200 * 0.11), 'Ingreso CEL correcto (462 €)');
assert.strictEqual(cel.beneficioExtraCEL, cel.ingresoCELAnual - cel.ingresoPoolAnual, 'Beneficio extra debe ser la diferencia (252 €)');
assert.ok(cel.paybackCEL < cel.paybackTradicional, 'El payback con CEL debe ser significativamente menor al tradicional');
assert.ok(cel.reduccionPaybackAnios >= 0.5, 'La reducción de payback debe ser de al menos 0.5 años');
assert.ok(cel.familiasBeneficiadas >= 1, 'Debe abastecer a 1 o más familias/locales');
console.log('✅ TEST 1 superado con éxito.');

// ── TEST 2: Generación visual de hoja CEL (HTML & SVG) ──
console.log('\n--- TEST 2: Maquetación visual e infográfica de la hoja CEL ---');
assert.strictEqual(typeof financials.buildCELPageHTML, 'function', 'buildCELPageHTML debe ser una función');

const pal = { primary: '#059669', light: '#d1fae5', accent: '#10b981', dark: '#065f46' };
const html = financials.buildCELPageHTML(mockD, mockM, pal, cel, 5, 7, 'SOLAR 3D PRO');

assert.ok(html.includes('class="page-sheet"'), 'Debe generar una hoja page-sheet');
assert.ok(html.includes('COMUNIDAD ENERGÉTICA LOCAL'), 'Debe incluir el título de Comunidad Energética');
assert.ok(html.includes('Real Decreto-ley 7/2026') || html.includes('RDL 7/2026'), 'Debe citar RDL 7/2026 en el cuerpo');
assert.ok(html.includes('5.000 m') || html.includes('5.000 metros') || html.includes('5 km'), 'Debe indicar radio de 5 km / 5.000 m');
assert.ok(html.includes('78,5 km²'), 'Debe indicar 78,5 km² de área de cobertura');
assert.ok(html.includes('0,11 €/kWh'), 'Debe mostrar el precio destacado de 0,11 €/kWh');
assert.ok(html.includes('0,05 €/kWh'), 'Debe mostrar el precio pool tradicional de 0,05 €/kWh');
assert.ok(html.includes('Tope Legal Mensual a 0 €'), 'Debe explicar la restricción del tope legal mensual');
assert.ok(html.includes('TU HUB GENERADOR'), 'El radar SVG debe contener TU HUB GENERADOR');
assert.ok(html.includes('viewBox="0 0 560 260"') || html.includes('viewBox="0 0 440 200"'), 'El radar SVG debe tener viewBox definido');
assert.ok(html.includes('HOMOLOGADO CEL-READY'), 'Debe contener el sello de ingeniería CEL-Ready');
assert.ok(html.includes('TED/1247/2021'), 'Debe citar los coeficientes dinámicos de la Orden TED/1247/2021');

console.log('✅ TEST 2 superado con éxito.');

// ── TEST 3: Resumen comercial (plantilla determinista) y gating de la CEL ──
// [AUD-2026 · A-05] La CEL pasó a ser una hipótesis OPCIONAL: por defecto no se anuncia.
console.log('\n--- TEST 3: Integración en el resumen comercial para cliente ---');
const summaryDefault = financials.generateCommercialSummary(mockD, mockM, { hasBat: false });
assert.ok(!summaryDefault.includes('CEL-Ready'), 'Sin activación, el resumen NO debe afirmar certificación CEL');
assert.ok(!summaryDefault.includes('5 km'), 'Sin activación, el resumen no debe prometer radio de 5 km');

financials.RAPricing.saveCommercialConfig({ includeCEL: true, celPriceEur: 0.11 });
const summaryCel = financials.generateCommercialSummary(mockD, mockM, { hasBat: false });
console.log('Extracto del resumen comercial con CEL activa:\n', summaryCel);
assert.ok(summaryCel.includes('Comunidad Energética Local'), 'Con CEL activa debe mencionar la comunidad energética');
assert.ok(summaryCel.includes('verificación jurídica'), 'Debe condicionar la promesa a verificación jurídica');
financials.RAPricing.saveCommercialConfig({ includeCEL: false, celPriceEur: 0.11 });
console.log('✅ TEST 3 superado con éxito.');

// ── TEST 4: Configuración comercial en RAPricing ──
console.log('\n--- TEST 4: Configuración en RAPricing ---');
const commCfg = financials.RAPricing.getCommercialConfig();
assert.strictEqual(commCfg.includeCEL, false, 'includeCEL debe estar deshabilitado por defecto');
assert.strictEqual(commCfg.celPriceEur, 0.11, 'celPriceEur de referencia debe ser 0.11 €/kWh (solo si se activa)');
console.log('✅ TEST 4 superado con éxito.');

console.log('\n🎉 TODOS LOS TESTS DE COMUNIDAD ENERGÉTICA LOCAL (RDL 7/2026 · 5 KM) PASARON SATISFACTORIAMENTE!');
