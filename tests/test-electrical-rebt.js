// Test unitario y de integración: Fase 2 - Coherencia Eléctrica y Blindaje REBT
const assert = require('assert');
const fs = require('fs');

global.window = {
  allRenderedPanels: Array(14).fill({ id: 1, hasMLPE: false }),
  lastRoofInfo: { panels: Array(14).fill({ id: 1 }) },
  solarProjectConfig: {
    selectedObjective: 'optimal_inv',
    selectedInverterId: 'inv_huawei_5ktl',
    autoSizing: { inverters: { count: 2 } } // 2 inversores para probar multi-inversor
  },
  equipmentCatalog: {
    modules: [{ id: 'mod_topcon_450', fullName: 'Tiger Neo N-Type 450W', potencia: 450, voc: 41.5, vmp: 34.5, isc: 13.8, imp: 13.05, bifacial: true }],
    inverters: [{ id: 'inv_huawei_5ktl', fullName: 'Huawei SUN2000-5KTL-L1', kw: 5.0, vDcMax: 600, vMpptMin: 90, vMpptMax: 560, phases: 1, cosPhi: 1.0 }],
    batteries: []
  },
  RA: {}
};
global.document = {
  getElementById: () => null,
  querySelectorAll: () => [],
  querySelector: () => null
};
global.localStorage = { getItem: () => null, setItem: () => {} };
global.sessionStorage = { getItem: () => null, setItem: () => {} };

// Cargar motores
eval(fs.readFileSync('js/config.js', 'utf8'));
eval(fs.readFileSync('js/electrical-engine.js', 'utf8'));
eval(fs.readFileSync('js/cable-engine.js', 'utf8'));
eval(fs.readFileSync('js/project-calcs.js', 'utf8'));
global.getProjectCalcs = window.getProjectCalcs;
eval(fs.readFileSync('js/bom-tree.js', 'utf8'));
eval(fs.readFileSync('js/financials.js', 'utf8'));
eval(fs.readFileSync('js/docs-generator.js', 'utf8'));

console.log('═════════════════════════════════════════════════════════════════════');
console.log('⚡ TEST SUITE: FASE 2 - COHERENCIA ELÉCTRICA Y REBT');
console.log('═════════════════════════════════════════════════════════════════════');

// TEST 1: calculateDynamicMPPTStringLimits normaliza coeficientes % y exporta alias
const limits = window.RA.Electrical.calculateDynamicMPPTStringLimits(
  { Voc: 41.5, Vmp: 34.5, betaVoc: -0.28, gammaPmp: -0.35 }, // En porcentaje directo
  { Vmax: 1000, VmpptMin: 160, VmpptMax: 850 },
  { Tmin: -10, TmaxCell: 65 }
);
assert.ok(limits.Voc_Tmin > 41.5 && limits.Voc_Tmin < 60, 'Voc_Tmin debe estar en rango físico coherente (~45.5V)');
assert.strictEqual(limits.vocCold, limits.Voc_Tmin, 'Alias vocCold debe coincidir con Voc_Tmin');
assert.strictEqual(limits.vmpHot, limits.Vmp_Tmax, 'Alias vmpHot debe coincidir con Vmp_Tmax');
console.log('✔ PASS 1: Coeficientes térmicos normalizados y alias vocCold/vmpHot exportados correctamente.');

// TEST 2: Multi-inversor en computeSizingEngineering
const multiEng = window.RA.Electrical.computeSizingEngineering({
  numPanels: 40,
  invCount: 4,
  cfg: { potencia: 500, voc: 42.0, vmp: 35.0, isc: 14.0, imp: 13.0 },
  tiltDeg: 25,
  azimutDeg: 180,
  latDeg: 40.4
});
assert.strictEqual(multiEng.invCount, 4, 'invCount debe ser 4');
assert.strictEqual(multiEng.P_ac_kW, 20, 'Potencia total AC debe contemplar 4 inversores (4 x 5 kW = 20 kW)');
assert.strictEqual(multiEng.total_P_ac_kW, 20, 'total_P_ac_kW debe ser 20 kW');
assert.strictEqual(multiEng.monofasico, false, 'Instalación > 15 kW debe ser forzada a trifásica (RD 1699/2011)');
assert.strictEqual(multiEng.rcdType, 'Clase B', 'Instalación sin RCMU certificado debe exigir RCD Clase B conservador');
console.log('✔ PASS 2: Multi-inversor, trifásica obligatoria (>15kW) y RCD Clase B verificados.');

// TEST 3: Distinción Voc módulo vs Voc string en project-calcs
const pCalcs = global.getProjectCalcs();
assert.ok(pCalcs.Voc_mod_cold < 60, 'Voc_mod_cold debe ser tensión de 1 módulo en frío (~45-50V), no del string');
assert.ok(pCalcs.Voc_cold < 60, 'Voc_cold debe ser tensión de 1 módulo en frío para compatibilidad en tablas');
assert.ok(pCalcs.Voc_str_cold > 100, 'Voc_str_cold debe ser la tensión del string completo (>100V)');
assert.strictEqual(typeof pCalcs.useFuses, 'boolean', 'useFuses debe ser un booleano');
console.log('✔ PASS 3: Voc de módulo vs Voc de string correctamente desagregados en project-calcs.');

// TEST 4: Generación de memoria técnica con comprobaciones dinámicas
window.open = () => ({
  document: {
    open: () => {},
    write: (html) => { global.__lastDoc = (global.__lastDoc || '') + html; },
    close: () => {}
  }
});
window.generateMemoria(true);
assert.ok(global.__lastDoc, 'generateMemoria debe generar contenido');
assert.ok(!global.__lastDoc.includes('NaN'), 'El documento técnico no debe contener ningún NaN');
assert.ok(global.__lastDoc.includes('5.3 Comprobación de Ventana MPPT'), 'El documento debe contener la sección 5.3');
assert.ok(global.__lastDoc.includes('Conforme') || global.__lastDoc.includes('No conforme'), 'La tabla 5.3 debe tener evaluaciones de conformidad');
console.log('✔ PASS 4: Memoria técnica generada con cálculos dinámicos y libre de NaN.');

// TEST 5: Zonificación térmica dinámica CTE en computeSizingEngineering
{
  const southEng = window.RA.Electrical.computeSizingEngineering({
    numPanels: 10,
    cfg: { potencia: 450, voc: 41.5, vmp: 34.5, isc: 13.8, imp: 13.05, betaVoc: -0.28 },
    tiltDeg: 25,
    azimutDeg: 180,
    latDeg: 36.7,
    lonDeg: -4.4 // Costal Sur (-4°C)
  });
  const mesetaEng = window.RA.Electrical.computeSizingEngineering({
    numPanels: 10,
    cfg: { potencia: 450, voc: 41.5, vmp: 34.5, isc: 13.8, imp: 13.05, betaVoc: -0.28 },
    tiltDeg: 25,
    azimutDeg: 180,
    latDeg: 40.9,
    lonDeg: -4.1 // Meseta Central elevada (-14°C)
  });
  assert.ok(southEng.Voc_mod_cold < mesetaEng.Voc_mod_cold,
    `Voc_mod_cold sur (${southEng.Voc_mod_cold}V) debe ser menor que meseta (${mesetaEng.Voc_mod_cold}V)`);
  const explicitEng = window.RA.Electrical.computeSizingEngineering({
    numPanels: 10,
    cfg: { potencia: 450, voc: 41.5, vmp: 34.5, isc: 13.8, imp: 13.05, betaVoc: -0.28 },
    tiltDeg: 25,
    azimutDeg: 180,
    latDeg: 36.7,
    lonDeg: -4.4,
    climParams: { Tmin: -20 }
  });
  assert.ok(explicitEng.Voc_mod_cold > mesetaEng.Voc_mod_cold, 'climParams.Tmin explícito debe prevalecer sobre zonificación');
  console.log('✔ PASS 5: Zonificación térmica dinámica CTE y override climParams.Tmin verificados.');
}

// TEST 6: Soporte completo para topología microinverter en computeSizingEngineering
{
  const prevTopo = window.solarProjectConfig.selectedTopology;
  const prevMicroId = window.solarProjectConfig.selectedMicroinverterId;
  const prevMicroSizing = window.solarProjectConfig.autoSizing.microinverters;
  const prevMicroCat = window.equipmentCatalog.microinverters;

  window.equipmentCatalog.microinverters = [
    { id: 'mlpe_hoymiles_800', brand: 'Hoymiles', model: 'HMS-800-2T', kw: 0.8, type: 'Microinversor 2-en-1', price: 175 }
  ];
  window.solarProjectConfig.selectedTopology = 'microinverter';
  window.solarProjectConfig.selectedMicroinverterId = 'mlpe_hoymiles_800';
  window.solarProjectConfig.autoSizing.microinverters = { count: 5 };

  const microEng = window.RA.Electrical.computeSizingEngineering({
    numPanels: 10,
    cfg: { potencia: 450, voc: 41.5, vmp: 34.5, isc: 13.8, imp: 13.05 },
    tiltDeg: 25,
    azimutDeg: 180,
    latDeg: 40.4
  });

  window.solarProjectConfig.selectedTopology = prevTopo;
  window.solarProjectConfig.selectedMicroinverterId = prevMicroId;
  window.solarProjectConfig.autoSizing.microinverters = prevMicroSizing;
  window.equipmentCatalog.microinverters = prevMicroCat;

  assert.strictEqual(microEng.isMicroinverter, true, 'isMicroinverter debe ser true');
  assert.strictEqual(microEng.invCount, 5, 'invCount debe leer autoSizing.microinverters.count (5)');
  assert.strictEqual(microEng.P_ac_kW, 4.0, 'P_ac_kW debe ser 5 * 0.8 = 4.0 kW');
  assert.ok(microEng.I_ac > 0, 'I_ac debe ser > 0');
  assert.ok(microEng.I_iga >= 16, 'I_iga debe ser >= 16 A');
  assert.ok(microEng.S_ac >= 2.5, 'S_ac debe ser >= 2.5 mm²');
  assert.ok(microEng.dVac_pct > 0, 'dVac_pct debe ser > 0');
  assert.strictEqual(microEng.dVdc_pct, 0, 'dVdc_pct en microinversores debe ser 0');
  console.log('✔ PASS 6: Topología microinversor calculada con catálogo, count, P_ac_kW, I_ac, I_iga, S_ac y dVac_pct.');
}

// TEST 7: Lectura de strings reales particionados en window.allRenderedPanels
{
  const prevPanels = window.allRenderedPanels;
  window.allRenderedPanels = [
    ...Array.from({ length: 9 }, (_, i) => ({ id: i, stringName: 'S1', mpptId: 1 })),
    ...Array.from({ length: 7 }, (_, i) => ({ id: 9 + i, stringName: 'S2', mpptId: 2 }))
  ];
  const partEng = window.RA.Electrical.computeSizingEngineering({
    numPanels: 16,
    cfg: { potencia: 450, voc: 41.5, vmp: 34.5, isc: 13.8, imp: 13.05 },
    tiltDeg: 25,
    azimutDeg: 180,
    latDeg: 40.4
  });
  window.allRenderedPanels = prevPanels;

  assert.strictEqual(partEng.numStrings, 2, 'Debe leer los 2 strings reales de allRenderedPanels en lugar de Math.ceil(16/maxMods)=1');
  assert.strictEqual(partEng.modsPerString, 9, 'modsPerString debe reflejar el string más largo real (9)');
  console.log('✔ PASS 7: Particionado real de strings desde window.allRenderedPanels respetado.');
}

// TEST 8: Caída de tensión troncal dV_dc_trk usando L_mdc_meas cuando L_dc_trunk_measured no está definido
{
  const prevState = window.inverterEquipmentState;
  window.inverterEquipmentState = { L_dc_measured: 25, L_ac_measured: 12 }; // Sin L_dc_trunk_measured
  const trkEng = window.RA.Electrical.computeSizingEngineering({
    numPanels: 66,
    cfg: { potencia: 550, voc: 50.2, vmp: 42.1, isc: 13.9, imp: 13.1 },
    tiltDeg: 20,
    azimutDeg: 135,
    latDeg: 40.4
  });
  window.inverterEquipmentState = prevState;
  const strOnlyDv = (2 * 0.023 * 25 * 13.1) / trkEng.S_str;
  assert.ok(trkEng.dV_dc > strOnlyDv, `dV_dc (${trkEng.dV_dc}) debe incluir la caída troncal sobre L_mdc_meas (> ${strOnlyDv})`);
  console.log('✔ PASS 8: Caída troncal dV_dc_trk incluida desde L_mdc_meas cuando L_dc_trunk_measured no está fijado.');
}

console.log('═════════════════════════════════════════════════════════════════════');
console.log('🎉 TODOS LOS TESTS DE FASE 2 PASARON EXITOSAMENTE!');
console.log('═════════════════════════════════════════════════════════════════════');
