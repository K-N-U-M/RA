/**
 * ============================================================================
 * 🧪 TEST DE INTEGRACIÓN Y VERIFICACIÓN DE MOTORES INDUSTRIALES — PROYECTO RA
 * ============================================================================
 * Ejecuta verificación end-to-end de los motores de física solar, ingeniería
 * eléctrica REBT ITC-BT-40, algoritmos astronómicos y modelo financiero bancable.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const docMock = {
  getElementById: (id) => ({ id, value: '0', textContent: '', style: {}, classList: { add: () => {}, remove: () => {} } }),
  querySelector: () => ({ value: '0', textContent: '', style: {}, classList: { add: () => {}, remove: () => {} } }),
  querySelectorAll: () => []
};

const windowMock = {
  RA: {},
  addEventListener: () => {},
  removeEventListener: () => {},
  solarProjectConfig: {
    selectedModuleId: 'mod-450-mono',
    selectedInverterId: 'inv-10k-hybrid',
    selectedTopology: 'inverter',
    selectedObjective: 'optimal_inv'
  },
  equipmentCatalog: {
    modules: [
      { id: 'mod-450-mono', brand: 'Tier1 Tech', model: 'Ultra 450W Monocristalino', wp: 450, voc: 49.5, vmp: 41.5, isc: 11.5, imp: 10.84, length: 2.094, width: 1.038, thickness: 0.035, tempCoeffVoc: -0.27, tempCoeffPmax: -0.35, bifacial: false, price: 95 }
    ],
    inverters: [
      { id: 'inv-10k-hybrid', brand: 'SolarPro', model: 'Hybrid 10kW Tri', kw: 10, vMpptMin: 180, vMpptMax: 850, vMax: 1000, mpptCount: 2, inputsPerMppt: 1, maxCurrentPerMppt: 16, price: 1650 }
    ],
    batteries: [
      { id: 'bat-10kwh', brand: 'PowerVault', model: 'LFP 10kWh Modular', kwh: 10, dod: 0.9, price: 3200 }
    ]
  },
  document: docMock
};

const cesiumMock = {
  Ion: {},
  GoogleMaps: {},
  Cartesian3: {
    clone: (p) => ({ x: p.x, y: p.y, z: p.z }),
    distance: (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z),
    subtract: (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }),
    add: (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })
  }
};

const context = vm.createContext({
  window: windowMock,
  global: windowMock,
  globalThis: windowMock,
  document: docMock,
  Cesium: cesiumMock,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  Math: Math,
  parseFloat: parseFloat,
  parseInt: parseInt,
  isFinite: isFinite,
  isNaN: isNaN,
  Array: Array,
  Object: Object,
  String: String,
  Number: Number,
  Date: Date,
  console: console
});

console.log('═════════════════════════════════════════════════════════════════════════════');
console.log('🚀 INICIANDO BATERÍA DE PRUEBAS DE MOTORES INDUSTRIALES — PROYECTO RA');
console.log('═════════════════════════════════════════════════════════════════════════════\n');

// 1. Cargar módulos
const modulesToLoad = ['config.js', 'radiation-engine.js', 'solar-engine.js', 'electrical-engine.js', 'financials.js'];
modulesToLoad.forEach(mod => {
  const code = fs.readFileSync(path.join(__dirname, '..', 'js', mod), 'utf8');
  vm.runInContext(code, context);
  console.log(`  [CARGA] Módulo js/${mod} cargado y compilado con éxito.`);
});

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message, detail) {
  if (condition) {
    testsPassed++;
    console.log(`  ✓ PASS: ${message} ${detail ? '(' + detail + ')' : ''}`);
  } else {
    testsFailed++;
    console.error(`  ✗ FAIL: ${message} ${detail ? '(' + detail + ')' : ''}`);
  }
}

console.log('\n--- 1. PRUEBAS DE FÍSICA SOLAR Y ASTRONOMÍA (Spencer, Duffie-Beckman & Perez 1990) ---');
// Solsticio de verano (día 172) -> Declinación ~ 23.45°
const decl = context.window.solarDeclination(172);
assert(Math.abs(decl - 23.45) < 0.2, 'Declinación solar en solsticio de verano', `${decl.toFixed(2)}°`);

// Ángulo horario a mediodía solar (12h) -> 0°
const ha = context.window.hourAngle(12);
assert(ha === 0, 'Ángulo horario a mediodía solar', `${ha}°`);

// Altura solar en Madrid (lat 40.4°) en mediodía de solsticio: 90 - 40.4 + 23.45 = 73.05°
const alt = context.window.solarAltitude(40.4, decl, ha);
assert(Math.abs(alt - 73.05) < 0.5, 'Altura solar cenital en Madrid (solsticio)', `${alt.toFixed(2)}°`);

// Sombra de chimenea/obstáculo H=2m a 45° de elevación solar -> L = 2 / tan(45°) = 2m
const shadowL = context.window.obstacleShadowLength(2.0, 45);
assert(Math.abs(shadowL - 2.0) < 0.01, 'Longitud de sombra geométrica H=2m a 45°', `${shadowL.toFixed(2)}m`);

// Transposición Perez 1990 en plano inclinado 30° con sol a 45°
const perezRes = context.window.RA.Radiation.transposePerez({
  ghi: 850,
  dhi: 180,
  dni: 750,
  cosTheta: Math.cos(15 * Math.PI / 180),
  tiltRad: 30 * Math.PI / 180,
  sunElevDeg: 45
});
assert(perezRes && perezRes.G_poa > 700, 'Modelo de radiación difusa anisotrópica Perez (1990)', `G_poa = ${perezRes.G_poa.toFixed(1)} W/m²`);

console.log('\n--- 2. PRUEBAS DE INGENIERÍA ELÉCTRICA (REBT ITC-BT-40 & IEC 62548) ---');
const mod = windowMock.equipmentCatalog.modules[0];
const inv = windowMock.equipmentCatalog.inverters[0];

// Cálculo dinámico de límites MPPT
const limits = context.window.RA.Electrical.calculateDynamicMPPTStringLimits(mod, inv, { tMinCold: -10, tMaxHot: 70 });
assert(limits.Ns_max > 0 && limits.Ns_max <= 20, 'Límite máximo módulos por string (Voc en frío -10°C <= 1000V)', `Ns_max = ${limits.Ns_max}`);
assert(limits.Ns_min >= 4 && limits.Ns_min < limits.Ns_max, 'Límite mínimo módulos por string (Vmp en caliente 70°C >= Vmppt_min)', `Ns_min = ${limits.Ns_min}`);

// Ajuste inteligente al múltiplo de strings admisibles (Snap a strings válidos)
const snapCount = context.window.RA.Electrical.getNearestValidStringModuleCount(5, limits.Ns_min, limits.Ns_max, 2);
assert(snapCount >= limits.Ns_min, 'Ajuste proactivo de layout a strings válidos (Snap >= Ns_min)', `5 -> ${snapCount} módulos`);

// Particionado de campo de 24 paneles en 2 Strings MPPT
const panels = [];
for (let i = 0; i < 24; i++) {
  panels.push({ id: i, row: Math.floor(i / 12), col: i % 12, center3D: { x: (i % 12) * 1.1, y: Math.floor(i / 12) * 2.2, z: 10 } });
}
const partitioned = context.window.RA.Electrical.partitionPanelsIntoMPPTStrings(panels, limits.Ns_max, limits.Ns_min);
assert(partitioned.length === 2, 'Particionado balanceado en 2 strings simétricos', `${partitioned.length} strings`);
assert(partitioned[0].numPanels === 12 && partitioned[1].numPanels === 12, 'Distribución de 12 módulos por MPPT', `String 1: ${partitioned[0].numPanels}, String 2: ${partitioned[1].numPanels}`);

// Verificación de homogeneidad MPPT (IEC 62548)
const testPanelsHomogeneous = [
  { stringName: 'S1', mpptId: 1, tiltDeg: 30, azimuthDeg: 0 },
  { stringName: 'S2', mpptId: 1, tiltDeg: 30, azimuthDeg: 2 }
];
const checkHomog = context.window.RA.Electrical.validateMPPTHomogeneity(testPanelsHomogeneous);
assert(checkHomog.valid === true, 'Validación MPPT: strings con orientación homogénea en paralelo', 'valid: true');

const testPanelsIncompatible = [
  { stringName: 'S1', mpptId: 1, tiltDeg: 15, azimuthDeg: -90 },
  { stringName: 'S2', mpptId: 1, tiltDeg: 35, azimuthDeg: 90 }
];
const checkIncompat = context.window.RA.Electrical.validateMPPTHomogeneity(testPanelsIncompatible);
assert(checkIncompat.valid === false && checkIncompat.violations.length > 0, 'Bloqueo normativo MPPT: strings en paralelo con distinta orientación', `Violación detectada: Δβ > 5° o Δγ > 10°`);

// Topología de cableado y orientación optimizada hacia el cuadro
context.window.RA.Electrical.setStringWiringTopology('daisy_chain');
assert(context.window.solarProjectConfig.stringWiringTopology === 'daisy_chain', 'Selector de técnica de cableado conmuta a Daisy-Chain', 'daisy_chain');
context.window.RA.Electrical.setStringWiringTopology('leapfrog');
assert(context.window.solarProjectConfig.stringWiringTopology === 'leapfrog', 'Selector de técnica de cableado conmuta a Salto de Rana (Leapfrog)', 'leapfrog');

// Verificación de inicio de string orientado hacia la cota del cuadro eléctrico
context.window.inverterEquipmentState = { position: { x: 25, y: 0, z: 10 } };
const orientedStrings = context.window.RA.Electrical.partitionPanelsIntoMPPTStrings(panels, limits.Ns_max, limits.Ns_min);
const firstPanelOfStr = orientedStrings[0].panels[0];
const lastPanelOfStr = orientedStrings[0].panels[orientedStrings[0].panels.length - 1];
const pPos1 = firstPanelOfStr.center || firstPanelOfStr.center3D || { x: 0, y: 0 };
const pPos2 = lastPanelOfStr.center || lastPanelOfStr.center3D || { x: 0, y: 0 };
const dFirst = Math.hypot(pPos1.x - 25, pPos1.y - 0);
const dLast = Math.hypot(pPos2.x - 25, pPos2.y - 0);
assert(dFirst <= dLast, 'Terminal [+ IN] de string orientado hacia el inversor/cuadro más cercano', `dFirst=${dFirst.toFixed(1)}m <= dLast=${dLast.toFixed(1)}m`);

// Rendimiento dinámico del inversor y Clipping
const clipNormal = context.window.RA.Electrical.calculateInverterEfficiencyAndClipping({ pDcW: 8000, pAcNomW: 10000 });
assert(clipNormal.isClipping === false && clipNormal.eta > 0.95, 'Eficiencia del inversor a carga parcial (8kW en 10kW)', `η = ${(clipNormal.eta * 100).toFixed(1)}%`);

const clipOver = context.window.RA.Electrical.calculateInverterEfficiencyAndClipping({ pDcW: 12000, pAcNomW: 10000, pAcMaxW: 10000 });
assert(clipOver.isClipping === true && clipOver.pClipping > 1500, 'Recorte dinámico de potencia (Clipping a 10kW nominal)', `P_clipping = ${clipOver.pClipping.toFixed(0)} W`);

// Caída de tensión REBT ITC-BT-40 en CC (12 módulos, 25m, 6mm², Cu a 90°C)
const vDropDC = context.window.RA.Electrical.calculateVoltageDrop({
  lengthM: 25,
  currentA: mod.isc * 1.25, // 14.375 A
  sectionMm2: 6,
  voltageV: mod.vmp * 12,   // 498 V
  conductor: 'Cu',
  tempC: 90
});
assert(vDropDC.pct < 1.5, 'Caída de tensión CC cumple límite REBT ITC-BT-40 (<= 1.5%)', `ΔV = ${vDropDC.pct.toFixed(2)}%`);
assert(vDropDC.valid === true, 'Flag de validación normativa activa', `valid: ${vDropDC.valid}`);

console.log('\n--- 3. PRUEBAS DE MODELO FINANCIERO Y RENTABILIDAD BANCABLE (Despacho 288h) ---');
// Mock de cálculo de proyecto
const sampleProjectCalcs = () => ({
  numPanels: 24,
  cfg: { potencia: 450 },
  annualYieldKWh: 15850,
  lossesPct: 4.5
});
context.getProjectCalcs = sampleProjectCalcs;
context.window.getProjectCalcs = sampleProjectCalcs;

const finModel = context.window.calculateFinancialModel();
assert(finModel && typeof finModel === 'object', 'Generación de modelo financiero bancable a 25 años', 'Objeto OK');
assert(finModel.capexNeto > 0, 'Cálculo de CAPEX neto con deducciones fiscales', `${finModel.capexNeto.toFixed(2)} €`);
assert(finModel.van > 0, 'Valor Actual Neto (VAN a 25 años con WACC 4%) positivo', `VAN: ${finModel.van.toFixed(2)} €`);
assert(finModel.tir > 0, 'Tasa Interna de Retorno (TIR) viable para inversión', `TIR: ${finModel.tir.toFixed(1)}%`);
assert(finModel.paybackYears > 0 && finModel.paybackYears < 10, 'Periodo de retorno de inversión (Payback) acelerado', `${finModel.paybackYears.toFixed(1)} años`);
assert(finModel.autoconsumoDirecto > 0 && finModel.autarquiaPct > 0, 'Despacho estacional multi-horario (288h) con balance horario', `Autarquía: ${finModel.autarquiaPct}%`);

console.log('\n═════════════════════════════════════════════════════════════════════════════');
console.log(`📊 RESUMEN: ${testsPassed} pruebas superadas, ${testsFailed} falladas.`);
console.log('═════════════════════════════════════════════════════════════════════════════\n');

if (testsFailed > 0) {
  process.exit(1);
} else {
  console.log('🎯 TODOS LOS MOTORES INDUSTRIALES DEL PROYECTO RA OPERAN AL 100% (CALIDAD AAA).');
}
