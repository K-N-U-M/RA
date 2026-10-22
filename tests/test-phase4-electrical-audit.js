/**
 * Test Suite Forense — Fase 4: Ingeniería Eléctrica, Equipos y Casación Inteligente
 * Verifica las 6 correcciones electrotécnicas y normativas (IEC 62548, REBT ITC-BT-40, IEC 60947-3, IEC 61643-31):
 * 1. Cálculo riguroso de Voc_cold con gammaVoc y salto a 1500V en seccionador/SPD a -15°C.
 * 2. Coeficiente de sobrecorriente IEC 62548 (1.56 × Isc) en seccionador DC y fusibles gPV.
 * 3. Desequilibrio vectorial real por fase en red trifásica (REBT ITC-BT-40: 2x 3kW permitido, 1x 6kW bloqueado).
 * 4. Particionado simétrico (ΔN = 0) y bloqueo duro de configuración (Paso 5) ante strings asimétricos en paralelo.
 * 5. Consistencia sin condición de carrera entre matchInvertersFromCatalog y wpComputeAutoSizing.
 * 6. Aislamiento del Inversor Virtual ("Equipo Recomendado Fuera de Catálogo") y registro en 1 clic en BD comercial.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function runAuditTests() {
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('⚡ AUDITORÍA FORENSE FASE 4: TEST SUITE ELECTROTÉCNICO (IEC 62548 / REBT)');
  console.log('═══════════════════════════════════════════════════════════════════════════');

  const elements = {};
  const mockDoc = {
    readyState: 'complete',
    activeElement: null,
    addEventListener: () => {},
    getElementById: (id) => {
      if (!elements[id]) {
        elements[id] = {
          id,
          value: '',
          innerHTML: '',
          textContent: '',
          style: {},
          classList: {
            toggle: () => {},
            add: () => {},
            remove: () => {}
          },
          removeAttribute: () => {}
        };
      }
      return elements[id];
    },
    getElementsByName: () => []
  };

  const context = {
    window: null,
    globalThis: null,
    document: mockDoc,
    console,
    Math,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Map,
    Set,
    Date,
    parseFloat,
    parseInt,
    isNaN,
    isFinite,
    localStorage: {
      getItem: () => null,
      setItem: () => {}
    },
    RA: {},
    panelConfig: { potencia: 500, voc: 50.0, vmp: 42.0, isc: 14.0, imp: 13.1, gammaVoc: -0.0030 }
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);

  const loadScript = (relPath) => {
    const code = fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
    vm.runInContext(code, context);
  };

  loadScript('js/electrical-engine.js');
  loadScript('js/workflow-orchestrator.js');
  loadScript('js/project-config.js');
  loadScript('js/engineering-explainer.js');

  const Elec = context.RA.Electrical;

  // ── 1. BUG 1: Voc en frío a -15°C con gammaVoc y escalado de Seccionador DC a 1500V ──
  console.log('\n[1/6] Verificando cálculo térmico Voc_cold (-15°C) y tensión de corte Ue (IEC 60947-3)...');
  const protCold = Elec.calculateElectricalProtections({
    module: { voc: 50.0, isc: 14.0, gammaVoc: -0.0030 },
    inverter: { vDcMax: 1500, kw: 25 },
    climParams: { Tmin: -15 },
    stringModules: 18,
    parallelStrings: 1
  });
  // A -15°C (ΔT = -40K), Voc_Tmin = 50 * (1 + 0.0030 * 40) = 56.0 V -> 18 módulos = 1008.0 V
  // Ue_min = 1008.0 * 1.20 = 1209.6 V > 1200 V -> Debe prescribir calibre 1500 V (antes daba 1200 V con fallback 1.10)
  assert.strictEqual(protCold.dc.vocCold, 1008.0, `Voc_cold a -15°C debe ser 1008.0 V, obtenido: ${protCold.dc.vocCold}`);
  assert.strictEqual(protCold.dc.seccionador.ueV, 1500, `Seccionador DC debe escalar a 1500 V (Ue_min=1209.6V), obtenido: ${protCold.dc.seccionador.ueV}`);
  assert.strictEqual(protCold.dc.spd.ucpvV, 1500, `SPD DC debe escalar a 1500 V, obtenido: ${protCold.dc.spd.ucpvV}`);
  console.log(`  ✓ Voc_cold = ${protCold.dc.vocCold} V -> Seccionador y SPD dimensionados a ${protCold.dc.seccionador.ueV} V.`);

  // ── 2. BUG 2: Coeficiente IEC 62548 (1.56 × Isc) en Seccionador DC y Fusibles gPV ──
  console.log('\n[2/6] Verificando factor de sobrecorriente IEC 62548 (1.56 × Isc) en DC Switch y Fusibles gPV...');
  const protParallel = Elec.calculateElectricalProtections({
    module: { voc: 49.5, isc: 14.0, seriesFuseRating: 30 },
    inverter: { vDcMax: 1000, kw: 15, iMaxScA: 60 },
    stringModules: 12,
    parallelStrings: 3
  });
  // Para Isc = 14.0 A y 3 strings en paralelo:
  // Ie_min = 14.0 * 1.56 * 3 = 65.52 A -> Calibre comercial inmediatamente superior = 80 A (con 1.25 daba 52.5 A -> 63 A)
  // Fuse_min = ceil(14.0 * 1.56) = 22 A -> Calibre comercial gPV = 25 A (con 1.50 daba 21 A)
  assert.strictEqual(protParallel.dc.seccionador.ieA, 80, `Seccionador DC para 3x14A con factor 1.56 debe ser 80A, obtenido: ${protParallel.dc.seccionador.ieA}A`);
  assert.strictEqual(protParallel.dc.fusibles.requerido, true, 'Con 3 strings en paralelo los fusibles gPV deben ser obligatorios');
  assert.strictEqual(protParallel.dc.fusibles.inA, 25, `Fusible gPV para Isc=14A con factor 1.56 debe ser 25A, obtenido: ${protParallel.dc.fusibles.inA}A`);
  console.log(`  ✓ Seccionador Ie = ${protParallel.dc.seccionador.ieA} A, Fusibles gPV In = ${protParallel.dc.fusibles.inA} A.`);

  // ── 3. BUG 3: Desequilibrio de fases en red trifásica (REBT ITC-BT-40 Punto 4.2) ──
  console.log('\n[3/6] Verificando desequilibrio vectorial por fase en red trifásica (REBT ITC-BT-40)...');
  const mono3kwCatalog = [
    { id: 'inv_mono_3k', brand: 'Huawei', model: 'SUN2000-3KTL-L1', kw: 3.0, type: 'Monofásico', mppt: 2, iMaxScA: 19.5, maxOverload: 1.35, price: 750 }
  ];
  const match2x3kw = Elec.matchInvertersFromCatalog({
    invertersCatalog: mono3kwCatalog,
    module: { wp: 450, isc: 13.8, voc: 41.5, vmp: 34.5 },
    totalPanels: 15,
    totalKwp: 6.75,
    gridSupply: 'three_phase',
    distinctOrientations: 2
  });
  // 2 inversores monofásicos de 3 kW en red trifásica -> Fase R: 3 kW, Fase S: 3 kW, Fase T: 0 kW -> Desequilibrio máx = 3 kW <= 5 kW (LEGAL)
  assert.strictEqual(match2x3kw.hasCatalogMatch, true, '2x 3kW monofásicos en red trifásica tienen desequilibrio de 3kW <= 5kW y DEBEN ser admitidos');
  assert.strictEqual(match2x3kw.bestCatalogMatch.count, 2, 'Debe seleccionar 2 unidades de 3 kW');

  const mono6kwCatalog = [
    { id: 'inv_mono_6k', brand: 'Huawei', model: 'SUN2000-6KTL-L1', kw: 6.0, type: 'Monofásico', mppt: 2, iMaxScA: 19.5, maxOverload: 1.35, price: 1050 }
  ];
  const match1x6kw = Elec.matchInvertersFromCatalog({
    invertersCatalog: mono6kwCatalog,
    module: { wp: 450, isc: 13.8, voc: 41.5, vmp: 34.5 },
    totalPanels: 15,
    totalKwp: 6.75,
    gridSupply: 'three_phase',
    distinctOrientations: 1
  });
  // 1 inversor monofásico de 6 kW en red trifásica -> Desequilibrio = 6 kW > 5 kW (PROHIBIDO POR REBT ITC-BT-40)
  assert.strictEqual(match1x6kw.hasCatalogMatch, false, '1x 6kW monofásico en red trifásica genera desequilibrio de 6kW > 5kW y DEBE rechazarse');
  console.log('  ✓ 2x 3kW monofásico admitido (ΔP=3kW ≤ 5kW) y 1x 6kW monofásico bloqueado (ΔP=6kW > 5kW).');

  // ── 4. BUG 4: Particionado simétrico (ΔN = 0) y Bloqueo de Configuración en Paso 5 ──
  console.log('\n[4/6] Verificando particionado simétrico (ΔN = 0) y bloqueo duro ante strings asimétricos...');
  // Crear 24 paneles dispuestos en 3 filas trapezoidales (10 + 8 + 6 = 24 paneles)
  const trapPanels = [];
  [10, 8, 6].forEach((rowLen, rIdx) => {
    for (let c = 0; c < rowLen; c++) {
      trapPanels.push({
        gridA: (3 - rIdx) * 2.0,
        gridB: c * 1.1,
        w: 1.05,
        h: 2.10
      });
    }
  });
  const partStrings = Elec.partitionPanelsIntoMPPTStrings(trapPanels, { Ns_min: 5, Ns_max: 14, Voc_Tmin: 55, Vmp_Tmax: 35 });
  assert.strictEqual(partStrings.length, 2, '24 paneles con Ns_max=14 deben dividirse en 2 strings');
  assert.strictEqual(partStrings[0].numPanels, 12, `String 1 debe tener exactamente 12 paneles (ΔN=0), obtenido: ${partStrings[0].numPanels}`);
  assert.strictEqual(partStrings[1].numPanels, 12, `String 2 debe tener exactamente 12 paneles (ΔN=0), obtenido: ${partStrings[1].numPanels}`);
  console.log(`  ✓ Cubierta trapezoidal (10+8+6=24 módulos) particionada simétricamente en ${partStrings[0].numPanels} + ${partStrings[1].numPanels} módulos (ΔN = 0).`);

  // Verificar bloqueo de configuración cuando 2 strings de distinta longitud (12 y 10) comparten el mismo MPPT
  const asymPanels = [];
  for (let i = 0; i < 12; i++) asymPanels.push({ stringName: 'S1', mpptId: 1, polyIdx: 0, tiltDeg: 30, azimuthDeg: 180 });
  for (let i = 0; i < 10; i++) asymPanels.push({ stringName: 'S2', mpptId: 1, polyIdx: 1, tiltDeg: 30, azimuthDeg: 180 });

  const homCheck = Elec.validateMPPTHomogeneity(asymPanels);
  assert.strictEqual(homCheck.valid, false, 'Dos strings de 12 y 10 módulos en el mismo MPPT deben invalidar la homogeneidad');
  assert.strictEqual(homCheck.violations[0].blocking, true, 'La violación ΔN != 0 debe estar marcada como blocking: true');

  context.allRenderedPanels = asymPanels;
  context.solarProjectConfig.selectedTopology = 'inverter';
  context.solarProjectConfig.selectedInverterId = 'inv_huawei_10k';
  context.solarProjectConfig.mpptHomogeneity = homCheck;

  const step5Guard = context.WorkflowOrchestrator.canEnterStep(5);
  assert.strictEqual(step5Guard.allowed, false, 'WorkflowOrchestrator debe BLOQUEAR el paso a Entrega (Paso 5) cuando existe asimetría ΔN != 0 en MPPT');
  assert(step5Guard.reason.includes('BLOQUEO NORMATIVO MPPT'), `El motivo de bloqueo debe citar el fallo normativo MPPT, obtenido: ${step5Guard.reason}`);
  console.log(`  ✓ Bloqueo de configuración Paso 5 verificado: "${step5Guard.reason.slice(0, 85)}..."`);

  // ── 5. BUG 5: Sincronización sin condición de carrera entre matchInvertersFromCatalog y wpComputeAutoSizing ──
  console.log('\n[5/6] Verificando sincronización entre wpAutoSelectOptimalEngineering y wpComputeAutoSizing...');
  const symPanels = [];
  for (let i = 0; i < 14; i++) symPanels.push({ stringName: 'S1', mpptId: 1, polyIdx: 0, tiltDeg: 30, azimuthDeg: 180 });
  for (let i = 0; i < 14; i++) symPanels.push({ stringName: 'S2', mpptId: 2, polyIdx: 0, tiltDeg: 30, azimuthDeg: 180 });
  context.allRenderedPanels = symPanels; // 28 paneles * 450 Wp = 12.6 kWp
  context.solarProjectConfig.mpptHomogeneity = { valid: true, violations: [] };

  context.equipmentCatalog = {
    modules: [{ id: 'mod_450', brand: 'JA Solar', model: 'JAM54S30', wp: 450, voc: 41.5, vmp: 34.5, isc: 13.8, imp: 13.0, l: 1.72, w: 1.13, price: 115 }],
    inverters: [
      { id: 'inv_10k', brand: 'Huawei', model: 'SUN2000-10KTL-M1', kw: 10.0, type: 'Trifásico', mppt: 2, inputsPerMppt: 1, iMaxScA: 19.5, maxOverload: 1.35, price: 1450 }
    ],
    microinverters: [{ id: 'mi_800', brand: 'Hoymiles', model: 'HMS-800', kw: 0.8, price: 175 }],
    batteries: [{ id: 'bat_none', brand: 'Sin Batería', model: 'N/A', kwh: 0, price: 0 }]
  };
  context.solarProjectConfig.selectedModuleId = 'mod_450';
  context.solarProjectConfig.userManuallySelectedInverter = false;

  const autoMatch = context.wpAutoSelectOptimalEngineering(true);
  // 12.6 kWp sobre inversor de 10 kW (sobrecarga 126% <= 135%):
  // Antes, matchInvertersFromCatalog elegía 1x 10kW y wpComputeAutoSizing (con 1.30) o discrepancia lo cambiaba.
  assert.strictEqual(autoMatch.bestCatalogMatch.count, 1, 'matchInvertersFromCatalog debe seleccionar 1 inversor de 10 kW para 12.6 kWp (126% <= 135%)');
  assert.strictEqual(context.solarProjectConfig.autoSizing.inverters.count, 1, 'wpComputeAutoSizing debe mantener exactamente 1 inversor sin condición de carrera');
  console.log('  ✓ Sincronización exacta: matchInvertersFromCatalog = 1 ud, wpComputeAutoSizing = 1 ud (126% DC/AC).');

  // ── 6. BUG 6: Aislamiento del Inversor Virtual y Registro en 1 Clic en BD Comercial ──
  console.log('\n[6/6] Verificando aislamiento del Inversor Virtual y botón 1-Clic de alta en BD comercial...');
  const bigPanels = [];
  for (let i = 0; i < 120; i++) {
    bigPanels.push({
      stringName: 'S' + (Math.floor(i / 15) + 1),
      mpptId: (Math.floor(i / 15) % 4) + 1,
      polyIdx: 0,
      tiltDeg: 20,
      azimuthDeg: 180
    });
  }
  context.allRenderedPanels = bigPanels; // 120 paneles * 450 Wp = 54.0 kWp (Catálogo solo tiene 10kW con max 4 unidades = 40kW AC)
  // Forzar catálogo con solo un inversor residencial de 3 kW para obligar a generar inversor virtual
  context.equipmentCatalog.inverters = [
    { id: 'inv_3k_only', brand: 'Huawei', model: 'SUN2000-3KTL', kw: 3.0, type: 'Monofásico', mppt: 2, inputsPerMppt: 1, iMaxScA: 15.0, maxOverload: 1.35, price: 700 }
  ];

  const virtualMatch = context.wpAutoSelectOptimalEngineering(true);
  assert.strictEqual(virtualMatch.hasCatalogMatch, false, 'No debe haber coincidencia en catálogo residencial de 3kW para 54 kWp');
  assert(context.solarProjectConfig.lastVirtualInverter && context.solarProjectConfig.lastVirtualInverter.isVirtual, 'Debe haberse almacenado lastVirtualInverter aislado');
  assert.strictEqual(context.equipmentCatalog.inverters.length, 1, 'El catálogo comercial NO debe contaminarse automáticamente con el inversor virtual');

  const bannerHtml = elements['step4-auto-engineering-banner'].innerHTML;
  assert(bannerHtml.includes('EQUIPO RECOMENDADO FUERA DE CATÁLOGO'), 'El banner debe mostrar la alerta destacada "EQUIPO RECOMENDADO FUERA DE CATÁLOGO"');
  assert(bannerHtml.includes('AÑADIR A BASE DE DATOS COMERCIAL (1 CLIC)'), 'El banner debe incluir el botón de alta en 1 clic');

  // Ejecutar alta en 1 clic de modelo comercial sugerido
  context.wpAddSuggestedCommercialModelToCatalog(0);
  assert.strictEqual(context.equipmentCatalog.inverters.length, 2, 'Tras pulsar el botón 1-clic, el nuevo equipo comercial debe quedar registrado en catalog.inverters');
  assert.strictEqual(context.solarProjectConfig.lastVirtualInverter, undefined, 'Tras registrar el equipo en catálogo, lastVirtualInverter debe limpiarse');
  console.log(`  ✓ Aislamiento verificado y alta en 1 clic completada: "${context.equipmentCatalog.inverters[1].brand} ${context.equipmentCatalog.inverters[1].model}" añadido al catálogo.`);

  // ── 7. SEGUNDA PASADA AAA: Telemetría REBT Dinámica (1.5% / 2.5%) y Coherencia Térmica en RACableEngine ──
  console.log('\n[7/7] Verificando coherencia térmica CTE en RACableEngine y badges REBT dinámicos (1.5% tramo / 2.5% global)...');
  loadScript('js/cable-engine.js');
  context.inverterEquipmentState = {
    L_dc_measured: 20,
    L_ac_measured: 15,
    dV_dc_pct: 0.7,
    dV_ac_pct: 0.5,
    dcNonCompliantWarning: false,
    acNonCompliantWarning: false,
    globalNonCompliantWarning: false
  };
  context.wpUpdateStep4Checklist();
  assert(elements['step4-chk-rebt'].textContent.includes('✓ REBT: ΔV ≤ 1.5%'), 'Con ΔV DC=0.7% y AC=0.5%, el badge REBT debe estar en verde conforme');
  assert.strictEqual(elements['step4-chk-rebt'].style.color, '#10B981');

  // Caso caída global > 2.5% (ej. DC = 1.4%, AC = 1.3% -> Total = 2.7% > 2.5%)
  context.inverterEquipmentState.dV_dc_pct = 1.4;
  context.inverterEquipmentState.dV_ac_pct = 1.3;
  context.inverterEquipmentState.globalNonCompliantWarning = true;
  context.wpUpdateStep4Checklist();
  assert(elements['step4-chk-rebt'].textContent.includes('> 2.5%'), 'Con ΔV DC=1.4% y AC=1.3% (Total 2.7%), el checklist debe alertar de ΔV Total > 2.5%');
  assert.strictEqual(elements['step4-chk-rebt'].style.color, '#F59E0B');

  // Caso incumplimiento de tramo > 1.5% (ej. DC = 1.9%)
  context.inverterEquipmentState.dV_dc_pct = 1.9;
  context.inverterEquipmentState.dcNonCompliantWarning = true;
  context.wpUpdateStep4Checklist();
  assert(elements['step4-chk-rebt'].textContent.includes('ΔV > 1.5%'), 'Con ΔV DC=1.9%, el checklist debe mostrar alerta roja ΔV > 1.5%');
  assert.strictEqual(elements['step4-chk-rebt'].style.color, '#EF4444');

  // Verificar que updateElectricalSizingAndHUD actualiza #inverter-stat-rebt-badge dinámicamente
  context.RACableEngine.updateElectricalSizingAndHUD(18, 12);
  assert(elements['inverter-stat-rebt-badge'].textContent.includes('CONFORME'), 'El badge #inverter-stat-rebt-badge debe actualizarse dinámicamente desde RACableEngine');
  console.log(`  ✓ Badges REBT dinámicos verificados: "${elements['inverter-stat-rebt-badge'].textContent}" y control de límite global 2.5%.`);

  console.log('\n═══════════════════════════════════════════════════════════════════════════');
  console.log('✓ TODOS LOS TESTS DE LA AUDITORÍA FORENSE DE FASE 4 (CALIDAD AAA) SUPERADOS AL 100%');
  console.log('═══════════════════════════════════════════════════════════════════════════');
}

try {
  runAuditTests();
} catch (err) {
  console.error('\n❌ FALLO EN AUDITORÍA FASE 4:', err);
  process.exit(1);
}
