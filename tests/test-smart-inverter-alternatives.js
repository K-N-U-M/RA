/**
 * Test de verificación industrial para la casación inteligente de inversores:
 * Alternativas de 1x Inversor Centralizado vs Nx Inversores Modulares (cálculo de N equipos y redundancia).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function runTest() {
  console.log('--- INICIANDO TEST SUITE: CASACIÓN INTELIGENTE DE INVERSORES (1X VS NX MODULAR) ---');

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
    throw new Error('matchInvertersFromCatalog no exportado en window.RA.Electrical');
  }

  // Catálogo comercial con inversores de varias potencias: 6 kW, 10 kW, 15 kW, 20 kW
  const commercialCatalog = [
    { id: 'inv_huawei_6k', brand: 'Huawei', model: 'SUN2000-6KTL-M1', kw: 6.0, type: 'Trifásico', mppt: 2, iMaxScA: 19.5, maxOverload: 1.35, price: 1100 },
    { id: 'inv_huawei_10k', brand: 'Huawei', model: 'SUN2000-10KTL-M1', kw: 10.0, type: 'Trifásico', mppt: 2, iMaxScA: 19.5, maxOverload: 1.35, price: 1450 },
    { id: 'inv_sungrow_15k', brand: 'Sungrow', model: 'SG15RT', kw: 15.0, type: 'Trifásico', mppt: 2, iMaxScA: 25.0, maxOverload: 1.35, price: 1850 },
    { id: 'inv_sma_20k', brand: 'SMA', model: 'Sunny Tripower X 20', kw: 20.0, type: 'Trifásico', mppt: 3, iMaxScA: 24.0, maxOverload: 1.35, price: 2400 }
  ];

  // =========================================================================
  // PRUEBA 1: Proyecto de 18 kWp con catálogo variado
  // Debe ofrecer:
  // - Opción A: 1x Inversor (ej. 1x 15 kW o 1x 20 kW con N=1)
  // - Opción B: Nx Inversores (ej. 2x 10 kW = 20 kW AC, o 2x 8 kW, etc. con N=2 y redundancia 50%)
  // =========================================================================
  console.log('\n--- PRUEBA 1: Proyecto 18 kWp con catálogo completo ---');
  const res18k = matchInvertersFromCatalog({
    invertersCatalog: commercialCatalog,
    module: { wp: 450, isc: 13.8, voc: 41.5, vmp: 34.5, imp: 13.0 },
    totalPanels: 40,
    totalKwp: 18.0,
    gridSupply: 'three_phase',
    distinctOrientations: 2
  });

  console.log('Candidatos compatibles:', res18k.compatible.length);
  res18k.compatible.forEach(c => {
    console.log(`  - ${c.count}x ${c.inverter.brand} ${c.inverter.model} (${c.totalAcKw} kW AC) | Sobrecarga: ${c.overloadPct}% | Redundancia: ${c.redundancyPct}%`);
  });

  const scA1 = res18k.recommendedScenarioA;
  const scB1 = res18k.recommendedScenarioB;

  if (!scA1 || scA1.count !== 1) {
    throw new Error(`Opción A debe ser exactamente 1x inversor. Obtenido count: ${scA1 ? scA1.count : 'null'}`);
  }
  console.log(`✓ Opción A verificada: 1x ${scA1.inverter.brand} ${scA1.inverter.model} (${scA1.totalAcKw} kW AC, sobrecarga ${scA1.overloadPct}%)`);

  if (!scB1 || scB1.count < 2) {
    throw new Error(`Opción B debe ser modular distribuida (N >= 2). Obtenido count: ${scB1 ? scB1.count : 'null'}`);
  }
  if (scB1.redundancyPct !== 50 && scB1.redundancyPct !== 66.7) {
    throw new Error(`Redundancia de opción B debe calcularse según N (ej. 50% para N=2). Obtenido: ${scB1.redundancyPct}%`);
  }
  console.log(`✓ Opción B verificada: ${scB1.count}x ${scB1.inverter.brand} ${scB1.inverter.model} (${scB1.totalAcKw} kW AC, redundancia ${scB1.redundancyPct}%)`);

  // =========================================================================
  // PRUEBA 2: Proyecto de 30 kWp con catálogo que SOLO contiene inversores pequeños (10 kW)
  // El sistema DEBE calcular automáticamente que hacen falta N = 3 inversores de 10 kW
  // =========================================================================
  console.log('\n--- PRUEBA 2: Proyecto 30 kWp con inversores de 10 kW ---');
  const smallOnlyCatalog = [
    { id: 'inv_10k', brand: 'Fronius', model: 'Symo 10.0', kw: 10.0, type: 'Trifásico', mppt: 2, iMaxScA: 20.0, maxOverload: 1.35, price: 1600 }
  ];

  const res30k = matchInvertersFromCatalog({
    invertersCatalog: smallOnlyCatalog,
    module: { wp: 500, isc: 13.5, voc: 42.0 },
    totalPanels: 60,
    totalKwp: 30.0,
    gridSupply: 'three_phase',
    distinctOrientations: 2
  });

  const scB2 = res30k.recommendedScenarioB;
  if (!scB2 || scB2.count !== 3) {
    throw new Error(`El cálculo de N equipos para 30 kWp con inversores de 10 kW debe ser exactamente 3 uds. Obtenido: ${scB2 ? scB2.count : 'null'}`);
  }
  if (scB2.totalAcKw !== 30.0) {
    throw new Error(`Potencia total AC debe ser 30 kW. Obtenido: ${scB2.totalAcKw}`);
  }
  if (scB2.redundancyPct < 66.0 || scB2.redundancyPct > 67.0) {
    throw new Error(`Redundancia con 3 equipos debe ser 66.7%. Obtenido: ${scB2.redundancyPct}`);
  }
  console.log(`✓ Cálculo de equipos N verificado: ${scB2.count}x inversores de 10 kW satisfacen 30 kWp (30 kW AC, sobrecarga ${scB2.overloadPct}%, redundancia ${scB2.redundancyPct}%)`);

  // La opción A para 30 kWp con catálogo de 10kW debe generar el inversor central ideal con modelo de mercado
  const scA2 = res30k.recommendedScenarioA;
  if (!scA2 || scA2.count !== 1) {
    throw new Error(`Opción A debe ofrecer alternativa 1x inversor central. Obtenido count: ${scA2 ? scA2.count : 'null'}`);
  }
  console.log(`✓ Opción A virtual generada: 1x ${scA2.inverter.brand} ${scA2.inverter.model} (${scA2.totalAcKw} kW AC)`);

  // =========================================================================
  // PRUEBA 3: Verificación de Microinversores (Opción C)
  // =========================================================================
  console.log('\n--- PRUEBA 3: Verificación de Opción C (MLPE / Microinversores) ---');
  const scC = res18k.recommendedScenarioC;
  if (!scC || scC.type !== 'MLPE' || scC.estimatedUnits !== 20) {
    throw new Error(`Opción C debe calcular unidades de microinversores (40 paneles / 2 = 20 micros). Obtenido: ${scC ? scC.estimatedUnits : 'null'}`);
  }
  console.log(`✓ Opción C verificada: ${scC.estimatedUnits}x Microinversores 2-en-1 (${scC.totalAcKw} kW AC)`);

  // =========================================================================
  // PRUEBA 4: Proyecto de 18 kWp con 2 strings de 20 módulos (coincidencia directa 1x Sungrow 15k)
  // =========================================================================
  console.log('\n--- PRUEBA 4: Coincidencia directa de 1x inversor en catálogo (2 strings de 20) ---');
  const res18kDirect = matchInvertersFromCatalog({
    invertersCatalog: commercialCatalog,
    module: { wp: 450, isc: 13.8, voc: 41.5, vmp: 34.5, imp: 13.0 },
    totalPanels: 40,
    modulesPerString: 20,
    totalKwp: 18.0,
    gridSupply: 'three_phase',
    distinctOrientations: 2
  });

  const scADirect = res18kDirect.recommendedScenarioA;
  const scBDirect = res18kDirect.recommendedScenarioB;

  if (!scADirect || scADirect.count !== 1 || scADirect.isVirtual) {
    throw new Error(`Opción A debe ser inversor comercial directo de catálogo (1x 15 kW). Obtenido: ${scADirect ? scADirect.inverter.model : 'null'}`);
  }
  console.log(`✓ Opción A directa de catálogo: 1x ${scADirect.inverter.brand} ${scADirect.inverter.model} (${scADirect.totalAcKw} kW AC, sobrecarga ${scADirect.overloadPct}%)`);

  if (!scBDirect || scBDirect.count < 2) {
    throw new Error(`Opción B debe ser modular distribuida (N >= 2). Obtenido: ${scBDirect ? scBDirect.count : 'null'}`);
  }
  console.log(`✓ Opción B directa de catálogo: ${scBDirect.count}x ${scBDirect.inverter.brand} ${scBDirect.inverter.model} (${scBDirect.totalAcKw} kW AC, redundancia ${scBDirect.redundancyPct}%)`);

  // =========================================================================
  // PRUEBA 5: Proyecto Industrial C&I (154 kWp) con sombreado severo (>35%) o max_roof
  // El sistema DEBE recomendar Inversor String Multi-MPPT (C&I) en lugar de microinversores masivos
  // =========================================================================
  console.log('\n--- PRUEBA 5: Proyecto Industrial 154 kWp con sombreado >35% o Llenado Máximo ---');
  const res154kShaded = matchInvertersFromCatalog({
    invertersCatalog: commercialCatalog,
    module: { wp: 550, isc: 14.5, voc: 49.5 },
    totalPanels: 280,
    totalKwp: 154.0,
    gridSupply: 'three_phase',
    distinctOrientations: 2,
    shadingDiagnostics: { recommendation: 'microinverters_or_full_mlpe' },
    selectedObjective: 'max_roof'
  });

  if (res154kShaded.recommendedTopology !== 'inverter') {
    throw new Error(`En planta industrial de 154 kWp con max_roof la topología recomendada debe ser 'inverter', no '${res154kShaded.recommendedTopology}'`);
  }
  if (!res154kShaded.topologyRationale.includes('Industrial') && !res154kShaded.topologyRationale.includes('Llenado Máximo')) {
    throw new Error(`El rationale debe indicar escala industrial o llenado máximo. Obtenido: ${res154kShaded.topologyRationale}`);
  }
  console.log(`✓ Regla Industrial C&I verificada: ${res154kShaded.recommendedTopology} recomendado (${res154kShaded.topologyRationale})`);

  // Verificación de selección manual explícita
  const resManualTopo = matchInvertersFromCatalog({
    invertersCatalog: commercialCatalog,
    module: { wp: 450, isc: 13.8, voc: 41.5 },
    totalPanels: 40,
    totalKwp: 18.0,
    selectedTopology: 'inverter'
  });
  if (resManualTopo.recommendedTopology !== 'inverter') {
    throw new Error(`Cuando se especifica selectedTopology='inverter', debe devolver 'inverter'`);
  }
  console.log(`✓ Respeto a topología explícita verificada: ${resManualTopo.recommendedTopology}`);

  console.log('\n============================================================');
  console.log('  TODOS LOS TESTS DE CASACIÓN INTELIGENTE 1X VS NX PASARON AL 100%');
  console.log('============================================================');
}

try {
  runTest();
} catch (e) {
  console.error('\n❌ ERROR EN TEST:', e.message);
  process.exit(1);
}
