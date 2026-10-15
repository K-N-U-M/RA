/**
 * Test de validación para la gestión de catálogo insuficiente y generación
 * del Inversor Paramétrico Virtual Ideal en RA.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function runTest() {
  console.log('--- INICIANDO TEST: INVERSOR PARAMÉTRICO VIRTUAL (CATÁLOGO INSUFICIENTE) ---');

  const context = {
    window: {},
    globalThis: {},
    console: console,
    Math: Math,
    parseFloat: parseFloat,
    parseInt: parseInt,
    Array: Array
  };
  context.window = context;
  vm.createContext(context);

  // 1. Cargar electrical-engine.js
  const electricalCode = fs.readFileSync(path.join(__dirname, '../js/electrical-engine.js'), 'utf8');
  vm.runInContext(electricalCode, context);

  const matchInvertersFromCatalog = context.window.RA.Electrical.matchInvertersFromCatalog;
  if (typeof matchInvertersFromCatalog !== 'function') {
    throw new Error('matchInvertersFromCatalog no está exportado en window.RA.Electrical');
  }

  // CASO 1: Catálogo vacío
  const resEmptyCatalog = matchInvertersFromCatalog({
    invertersCatalog: [],
    module: { wp: 500, isc: 13.5, voc: 42.0 },
    totalPanels: 30,
    totalKwp: 15.0,
    gridSupply: 'three_phase',
    distinctOrientations: 2
  });

  console.log('Caso 1 (Catálogo vacío):');
  console.log('  compatible count:', resEmptyCatalog.compatible.length);
  console.log('  hasCatalogMatch:', resEmptyCatalog.hasCatalogMatch);
  console.log('  bottleneckReason:', resEmptyCatalog.bottleneckReason);
  console.log('  virtualInverter:', resEmptyCatalog.virtualInverterMatch ? resEmptyCatalog.virtualInverterMatch.inverter.model : 'NULL');

  if (resEmptyCatalog.compatible.length !== 0) throw new Error('compatible debería ser 0');
  if (resEmptyCatalog.hasCatalogMatch !== false) throw new Error('hasCatalogMatch debería ser false');
  if (!resEmptyCatalog.virtualInverterMatch) throw new Error('virtualInverterMatch no se generó');
  if (resEmptyCatalog.virtualInverterMatch.inverter.kw <= 0) throw new Error('kw del inversor virtual debe ser > 0');
  if (resEmptyCatalog.virtualInverterMatch.suggestedCommercialModels.length === 0) throw new Error('Debería incluir modelos de mercado');

  // CASO 2: Catálogo con inversores residenciales de 5kW, pero proyecto industrial de 150 kWp
  const limitedCatalog = [
    { id: 'inv_5k', brand: 'Generic', model: '5K', kw: 5.0, type: 'Trifásico', mppt: 2, iMaxScA: 15.0, maxOverload: 1.30, price: 900 }
  ];

  const resIndustrial = matchInvertersFromCatalog({
    invertersCatalog: limitedCatalog,
    module: { wp: 550, isc: 14.5, voc: 49.5 },
    totalPanels: 280,
    totalKwp: 154.0,
    gridSupply: 'three_phase',
    distinctOrientations: 3
  });

  console.log('\nCaso 2 (Proyecto industrial 154 kWp con catálogo residencial limitado):');
  console.log('  compatible count:', resIndustrial.compatible.length);
  console.log('  hasCatalogMatch:', resIndustrial.hasCatalogMatch);
  console.log('  bottleneckReason:', resIndustrial.bottleneckReason);
  console.log('  virtualInverter units:', resIndustrial.virtualInverterMatch ? resIndustrial.virtualInverterMatch.count : 0);
  console.log('  virtualInverter unitKw:', resIndustrial.virtualInverterMatch ? resIndustrial.virtualInverterMatch.inverter.kw : 0);
  console.log('  virtualInverter totalAcKw:', resIndustrial.virtualInverterMatch ? resIndustrial.virtualInverterMatch.totalAcKw : 0);
  console.log('  commercial suggestions:', resIndustrial.virtualInverterMatch ? resIndustrial.virtualInverterMatch.suggestedCommercialModels.map(m => m.brand + ' ' + m.model).join(', ') : '');

  if (!resIndustrial.virtualInverterMatch) throw new Error('virtualInverterMatch no se generó para proyecto industrial');
  if (resIndustrial.virtualInverterMatch.totalAcKw < 100) throw new Error('Potencia AC del virtual inverter debe concordar con 154 kWp');

  console.log('\n✓ TODAS LAS COMPROBACIONES DE INVERSOR PARAMÉTRICO VIRTUAL HAN SIDO SATISFACTORIAS.');
}

try {
  runTest();
} catch (e) {
  console.error('ERROR EN TEST:', e.message);
  process.exit(1);
}
