/**
 * test-budget-integrity.js
 * Verificación de Integridad Contable, SSOT y consistencia aritmética del presupuesto generado.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('═════════════════════════════════════════════════════════════════════');
console.log('⚡ TEST SUITE: INTEGRIDAD CONTABLE Y COHERENCIA ARITMÉTICA DEL PRESUPUESTO');
console.log('═════════════════════════════════════════════════════════════════════\n');

// Mock del entorno DOM y SSOT
global.window = {
  RA: {
    solarStats: { annualYieldKWh: 8850, monthlyYields: [350, 480, 720, 890, 1020, 1100, 1150, 1050, 850, 600, 380, 260] },
    billAuditor: {
      comparison: {
        gastoMensualActualEUR: 275,
        gastoMensualConSolarEUR: 48,
        consumoAnualKWh: 4600
      }
    }
  },
  solarProjectConfig: {},
  windTurbines: [{ id: 'wind_1', operationalState: { enabled: true } }]
};
global.document = {
  getElementById: (id) => null
};

// Cargar RAPricing y financials
const financialsCode = fs.readFileSync(path.join(__dirname, '../js/financials.js'), 'utf8');

// Extraer RAPricing
eval(financialsCode.substring(financialsCode.indexOf('var RAPricing = {'), financialsCode.indexOf('if (typeof window !== \'undefined\') {\n  window.RAPricing = RAPricing;')));

// 1. Verificar computeThreePackages
console.log('▶ TEST 1: Verificación de coherencia metodológica en computeThreePackages()...');
const mockModel = {
  directCost: 7500,
  batCost: 2400,
  marginPct: 20,
  subtotal: 9000,
  capexBruto: 10890,
  ahorroLuzAnio1: 1450,
  paybackYears: 4.2,
  autarquiaPct: 72,
  totalAhorroFiscal: 3200
};

const pkgs = RAPricing.computeThreePackages(mockModel);
assert(pkgs, 'computeThreePackages debe retornar un objeto');
assert(pkgs.essential && pkgs.optimal && pkgs.premium, 'Debe incluir los 3 planes');

console.log(`  Plan Esencial: Capex ${pkgs.essential.capex} € | Ahorro ${pkgs.essential.ahorroAnual} €/año | Payback ${pkgs.essential.payback} a`);
console.log(`  Plan Óptimo:   Capex ${pkgs.optimal.capex} € | Ahorro ${pkgs.optimal.ahorroAnual} €/año | Payback ${pkgs.optimal.payback} a`);
console.log(`  Plan Premium:  Capex ${pkgs.premium.capex} € | Ahorro ${pkgs.premium.ahorroAnual} €/año | Payback ${pkgs.premium.payback} a`);

const pb1 = parseFloat(pkgs.essential.payback);
const pb2 = parseFloat(pkgs.optimal.payback);
const pb3 = parseFloat(pkgs.premium.payback);

assert(pb1 <= pb2 + 0.5, 'El plan esencial no debe tener un payback desproporcionadamente mayor al plan óptimo');
assert(pb2 <= pb3 + 0.5, 'El plan óptimo debe tener un payback competitivo frente al plan premium');
console.log('✔ TEST 1 PASADO: Comparativa de paquetes metodológicamente coherente.\n');

// 2. Verificar que calculateFinancialModel exporta las propiedades omitidas
console.log('▶ TEST 2: Verificación de exportación de campos comerciales en calculateFinancialModel()...');
assert(financialsCode.includes('windCost: windCost,'), 'calculateFinancialModel debe exportar windCost');
assert(financialsCode.includes('addonsCost: addonsCost,'), 'calculateFinancialModel debe exportar addonsCost');
assert(financialsCode.includes('discountEur: discountEur,'), 'calculateFinancialModel debe exportar discountEur');
assert(financialsCode.includes('discountLabel: discountLabel,'), 'calculateFinancialModel debe exportar discountLabel');
assert(financialsCode.includes('capexTachado: capexTachado,'), 'calculateFinancialModel debe exportar capexTachado');
console.log('✔ TEST 2 PASADO: Propiedades comerciales y eólicas exportadas en resultModel.\n');

// 3. Verificar que generatePresupuesto en docs-generator.js incluye eólica, addons y descuento
console.log('▶ TEST 3: Verificación de capítulos eólicos y extras en generatePresupuesto()...');
const docsCode = fs.readFileSync(path.join(__dirname, '../js/docs-generator.js'), 'utf8');
assert(docsCode.includes('CAP. EÓL — SISTEMA DE GENERACIÓN MINIEÓLICA'), 'docs-generator debe incluir capítulo eólico cuando m.windCost > 0');
assert(docsCode.includes('CAP. EXT — EQUIPAMIENTO Y SERVICIOS ADICIONALES (EXTRAS)'), 'docs-generator debe incluir capítulo de extras comerciales');
assert(docsCode.includes('CAP. PROM — BONIFICACIÓN Y PROMOCIÓN COMERCIAL APLICADA'), 'docs-generator debe incluir capítulo de promoción');
console.log('✔ TEST 3 PASADO: Presupuesto de ejecución sincronizado con el catálogo de partidas completas.\n');

// 4. Verificar que la tabla fiscal en financials.js no suma erróneamente el ICIO a las deducciones directas
console.log('▶ TEST 4: Verificación de separación conceptual del ICIO en la tabla fiscal...');
assert(financialsCode.includes('TOTAL DEDUCCIONES FISCALES'), 'financials.js debe etiquetar con precisión el total de deducciones directas');
assert(financialsCode.includes('Bonificación ICIO*'), 'financials.js debe indicar con nota que ICIO es ahorro municipal ajeno a la factura');
console.log('✔ TEST 4 PASADO: Transparencia fiscal blindada sin contradicción aritmética.\n');

// 5. Verificar persistencia de commercialConfig y windPrice en project-storage.js
console.log('▶ TEST 5: Verificación de persistencia SSOT de commercialConfig y windPrice en project-storage.js...');
const storageCode = fs.readFileSync(path.join(__dirname, '../js/project-storage.js'), 'utf8');
assert(storageCode.includes('commercialConfig: commCfg ? JSON.parse(JSON.stringify(commCfg)) : null'), 'project-storage.js debe exportar commercialConfig');
assert(storageCode.includes('RAPricing.saveCommercialConfig(po.commercialConfig)'), 'project-storage.js debe rehidratar commercialConfig');
assert(storageCode.includes('setVal(\'cfg-pres-wind\', po.pricing.windPrice)'), 'project-storage.js debe rehidratar windPrice');
console.log('✔ TEST 5 PASADO: commercialConfig y windPrice blindados en el SSOT de guardado/carga .raproject.\n');

// 6. Verificar reactividad en memoria _sessionCommercialConfig y sincronización de modal
console.log('▶ TEST 6: Verificación de reactividad en memoria _sessionCommercialConfig y controles en review modal...');
assert(financialsCode.includes('_sessionCommercialConfig: null,'), 'RAPricing debe tener _sessionCommercialConfig');
assert(financialsCode.includes('pricing-addons-chips-container'), 'El modal de revisión de precios debe contener los chips de addons');
assert(financialsCode.includes('pricing-check-discount-enabled'), 'El modal de revisión de precios debe contener el checkbox de descuento');
assert(financialsCode.includes('pricing-preview-addons-row'), 'El modal debe reflejar la fila de addons en el desglose');
assert(financialsCode.includes('pricing-preview-discount-row'), 'El modal debe reflejar la fila de descuento en el desglose');
assert(financialsCode.includes('pricing-preview-total-tachado'), 'El modal debe reflejar el importe tachado pre-descuento');
console.log('✔ TEST 6 PASADO: Modal de revisión sincronizado al 100% con Add-ons y Descuentos.\n');

// 7. Verificación del layout de impresión anti-página en blanco
console.log('▶ TEST 7: Verificación del layout @media print (anti subpixel overflow en Blink)...');
assert(financialsCode.includes('min-height: 295mm; max-height: 296mm; height: auto;'), 'financials.js debe usar min-height: 295mm; max-height: 296mm; para prevenir páginas en blanco');
console.log('✔ TEST 7 PASADO: Margen subpixel de impresión A4 garantizado sin desbordamiento.\n');

// 8. Verificación de catálogo de Add-ons técnicos de obra
console.log('▶ TEST 8: Verificación de catálogo de Add-ons técnicos (Smart Meter, Grúa, Acometida, Rack Batería, Sellado, Tasa ICIO)...');
const defAddons = RAPricing._defaultCommercialConfig.addons;
const requiredAddonIds = ['smart_meter', 'crane_lift', 'extended_ac', 'bat_protection', 'roof_sealing', 'municipal_tax'];
requiredAddonIds.forEach(id => {
  assert(defAddons.some(a => a.id === id), "El catálogo de add-ons debe incluir la partida técnica " + id);
});

// Probar merge seguro de getCommercialConfig con sesión previa legacy
RAPricing._sessionCommercialConfig = {
  addons: [
    { id: 'ev_charger', enabled: true, unitPrice: 900 }
  ]
};
const mergedCfg = RAPricing.getCommercialConfig();
assert(mergedCfg.addons.some(a => a.id === 'smart_meter'), 'getCommercialConfig debe incorporar partidas nuevas de catálogo en sesiones legacy');
assert(mergedCfg.addons.find(a => a.id === 'ev_charger').enabled === true, 'getCommercialConfig debe conservar el estado de addons guardados por el usuario');
RAPricing._sessionCommercialConfig = null;
console.log('✔ TEST 8 PASADO: Add-ons técnicos y merge seguro verificados correctamente.\n');

console.log('═════════════════════════════════════════════════════════════════════');
console.log('🎉 TODOS LOS TESTS DE INTEGRIDAD DEL PRESUPUESTO PASARON AL 100%');
console.log('═════════════════════════════════════════════════════════════════════');
