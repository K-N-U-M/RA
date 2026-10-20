/**
 * ============================================================================
 * TEST SUITE: MOTOR DE DESGLOSE MULTI-MÓDULO POR FALDÓN
 * ============================================================================
 */

const assert = require('assert');
const path = require('path');

// Cargar motor RAModulesBreakdown
const RAModulesBreakdown = require('../js/modules-breakdown.js');

console.log('═════════════════════════════════════════════════════════════════════');
console.log('⚡ INICIANDO TEST SUITE: DESGLOSE MULTI-MÓDULO POR FALDÓN');
console.log('═════════════════════════════════════════════════════════════════════');

const mockCatalog = {
  modules: [
    {
      id: 'ja_550',
      brand: 'JA Solar',
      model: 'JAM72S30-550/MR',
      wp: 550,
      voc: 49.9,
      vmp: 41.97,
      isc: 14.0,
      imp: 13.11,
      efficiency: 21.3,
      tempCoeffPmax: -0.35,
      l: 2.279,
      w: 1.134,
      weightKg: 28.6,
      tecnologia: 'Monocristalino N-Type TOPCon',
      price: 135.0
    },
    {
      id: 'longi_410',
      brand: 'Longi Solar',
      model: 'Hi-MO 5m 410W',
      wp: 410,
      voc: 37.25,
      vmp: 31.25,
      isc: 13.88,
      imp: 13.12,
      efficiency: 21.0,
      tempCoeffPmax: -0.34,
      l: 1.722,
      w: 1.134,
      weightKg: 20.8,
      tecnologia: 'Monocristalino PERC',
      price: 110.0
    }
  ]
};

// ── TEST 1: Instalación mono-módulo convencional ─────────────────────────────
console.log('\n▶ TEST 1: Instalación mono-módulo convencional (1 faldón, 1 modelo)...');
const singleRoofData = {
  catalog: mockCatalog,
  polylines: [
    {
      id: 'poly_0',
      name: 'Cubierta Sur',
      moduleId: 'ja_550',
      panelCount: 10,
      tiltDeg: 25,
      azimuthDeg: 180,
      structureType: 'coplanar_teja',
      structureMfg: 'sunfer',
      roofInfo: { area3D: 45.0, tiltDeg: 25, azimuthDeg: 180, panels: new Array(10).fill({ polyIdx: 0 }) }
    }
  ]
};

const res1 = RAModulesBreakdown.getProjectModulesBreakdown(singleRoofData);
assert.strictEqual(res1.totalPanels, 10, 'Debe contar 10 paneles');
assert.strictEqual(res1.totalKwp, 5.5, '10 paneles de 550Wp deben sumar 5.50 kWp');
assert.strictEqual(res1.totalPanelsCost, 1350.0, '10 paneles a 135€ deben costar 1350€');
assert.strictEqual(res1.uniqueModelsCount, 1, 'Debe haber exactamente 1 modelo');
assert.strictEqual(res1.isMultiModule, false, 'No debe ser multi-módulo');
assert.strictEqual(res1.byRoof.length, 1, 'Debe haber 1 subcampo');
console.log('✔ TEST 1 PASADO: Instalación mono-módulo resuelta correctamente.');

// ── TEST 2: Instalación multi-módulo heterogénea (2 faldones, 2 modelos) ────
console.log('\n▶ TEST 2: Instalación multi-módulo heterogénea (Faldón 1: 14x 550Wp, Faldón 2: 8x 410Wp)...');
const multiRoofData = {
  catalog: mockCatalog,
  polylines: [
    {
      id: 'poly_sur',
      name: 'Faldón Sur (Principal)',
      moduleId: 'ja_550',
      tiltDeg: 22,
      azimuthDeg: 180,
      structureType: 'coplanar_teja',
      structureMfg: 'sunfer',
      roofInfo: { area3D: 55.0, tiltDeg: 22, azimuthDeg: 180, panels: new Array(14).fill({ polyIdx: 0, moduleId: 'ja_550' }) }
    },
    {
      id: 'poly_este',
      name: 'Faldón Este (Secundario)',
      moduleId: 'longi_410',
      tiltDeg: 15,
      azimuthDeg: 90,
      structureType: 'triangles_15_ew',
      structureMfg: 'k2',
      roofInfo: { area3D: 30.0, tiltDeg: 15, azimuthDeg: 90, panels: new Array(8).fill({ polyIdx: 1, moduleId: 'longi_410' }) }
    }
  ]
};

const res2 = RAModulesBreakdown.getProjectModulesBreakdown(multiRoofData);
assert.strictEqual(res2.totalPanels, 22, 'Debe sumar 22 paneles');
// 14 * 550 = 7700 Wp = 7.7 kWp; 8 * 410 = 3280 Wp = 3.28 kWp -> 10.98 kWp
assert.strictEqual(res2.totalKwp, 10.98, 'Debe sumar exactamente 10.98 kWp');
// Costes: 14 * 135€ = 1890€; 8 * 110€ = 880€ -> 2770€
assert.strictEqual(res2.totalPanelsCost, 2770.0, 'Debe sumar exactamente 2770€ de paneles');
assert.strictEqual(res2.uniqueModelsCount, 2, 'Debe detectar 2 modelos únicos');
assert.strictEqual(res2.isMultiModule, true, 'Debe marcar isMultiModule = true');
assert.strictEqual(res2.byModel.length, 2, 'Debe devolver 2 agrupaciones de modelo');
assert.strictEqual(res2.byRoof.length, 2, 'Debe devolver 2 subcampos de cubierta');

const modJA = res2.byModel.find(m => m.moduleId === 'ja_550');
assert.strictEqual(modJA.count, 14, 'JA Solar debe tener 14 unidades');
assert.strictEqual(modJA.kwp, 7.7, 'JA Solar debe sumar 7.7 kWp');

const modLongi = res2.byModel.find(m => m.moduleId === 'longi_410');
assert.strictEqual(modLongi.count, 8, 'Longi debe tener 8 unidades');
assert.strictEqual(modLongi.kwp, 3.28, 'Longi debe sumar 3.28 kWp');
console.log('✔ TEST 2 PASADO: Agregación multi-módulo exacta en potencia, conteo y costes.');

// ── TEST 3: Generación de textos y tablas analíticas ─────────────────────────
console.log('\n▶ TEST 3: Generación de tablas de subcampos y comparativas multi-modelo...');
const summaryText = RAModulesBreakdown.formatModuleSummaryText(res2);
assert.ok(summaryText.includes('22 módulos'), 'Texto debe mencionar 22 módulos');
assert.ok(summaryText.includes('10.98 kWp'), 'Texto debe mencionar 10.98 kWp');
assert.ok(summaryText.includes('JA Solar') && summaryText.includes('Longi Solar'), 'Debe citar ambas marcas');

const subfieldsHtml = RAModulesBreakdown.renderSubfieldsTableHTML(res2, { includeCost: true });
assert.ok(subfieldsHtml.includes('Faldón Sur (Principal)'), 'Debe incluir nombre de Faldón Sur');
assert.ok(subfieldsHtml.includes('Faldón Este (Secundario)'), 'Debe incluir nombre de Faldón Este');
assert.ok(subfieldsHtml.includes('7.70 kWp') && subfieldsHtml.includes('3.28 kWp'), 'Debe incluir potencias parciales');
assert.ok(subfieldsHtml.includes('10.98 kWp'), 'Debe incluir total kWp');
assert.ok(subfieldsHtml.includes('2770') || subfieldsHtml.includes('2.770'), 'Debe incluir coste total formateado');

const specsTableHtml = RAModulesBreakdown.renderMultiModelSpecsTableHTML(res2);
assert.ok(specsTableHtml.includes('JAM72S30-550/MR') && specsTableHtml.includes('Hi-MO 5m 410W'), 'Tabla técnica debe incluir ambos modelos');
assert.ok(specsTableHtml.includes('49.90 V') && specsTableHtml.includes('37.25 V'), 'Debe incluir Voc de cada modelo');
assert.ok(specsTableHtml.includes('41.97 V') && specsTableHtml.includes('31.25 V'), 'Debe incluir Vmp de cada modelo');
console.log('✔ TEST 3 PASADO: Renderizado de tablas HTML de subcampos y comparativa técnica validado.');

// ── TEST 4: Fallback de catálogo cuando un modelo no está registrado ─────────
console.log('\n▶ TEST 4: Resistencia a fallos ante modelos no listados en catálogo...');
const missingModData = {
  catalog: { modules: [] },
  polylines: [
    {
      id: 'poly_unknown',
      name: 'Cubierta Nave',
      moduleId: 'unregistered_panel_id',
      panelCount: 6,
      roofInfo: { area3D: 20.0, panels: new Array(6).fill({}) }
    }
  ]
};
const res4 = RAModulesBreakdown.getProjectModulesBreakdown(missingModData);
assert.strictEqual(res4.totalPanels, 6, 'Debe procesar los 6 paneles');
assert.ok(res4.totalKwp > 0, 'Debe calcular potencia con fallback seguro');
assert.ok(res4.totalPanelsCost > 0, 'Debe calcular coste con fallback seguro');
console.log('✔ TEST 4 PASADO: Resiliencia ante catálogo incompleto verificada.');

console.log('\n═════════════════════════════════════════════════════════════════════');
console.log('🎉 TODOS LOS TESTS DE DESGLOSE MULTI-MÓDULO PASARON AL 100%');
console.log('═════════════════════════════════════════════════════════════════════');
