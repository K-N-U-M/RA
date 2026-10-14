/**
 * ============================================================================
 * 🧪 TEST DE VERIFICACIÓN DE FASE 1: DESVIACIONES P0 Y CLOBBERING RESUELTOS
 * ============================================================================
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

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

console.log('═════════════════════════════════════════════════════════════════════════════');
console.log('🚀 TEST DE REGRESIÓN: RESOLUCIÓN DE DESVIACIONES P0 (FASE 1 AUDITORÍA)');
console.log('═════════════════════════════════════════════════════════════════════════════\n');

// 1. Probar financials.js con y sin Virtual Battery (RD 244/2019)
const finCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'financials.js'), 'utf8');

const baseWindow = {
  RA: {},
  solarProjectConfig: {
    hasVirtualBattery: false
  },
  equipmentCatalog: {
    modules: [],
    inverters: []
  },
  document: {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => []
  }
};

const finContext = vm.createContext({
  window: baseWindow,
  global: baseWindow,
  globalThis: baseWindow,
  document: baseWindow.document,
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

vm.runInContext(finCode, finContext);

// Mock getProjectCalcs with surplus
finContext.getProjectCalcs = () => ({
  numPanels: 20,
  kwp: 9.0,
  annualKWh: 14000,
  cfg: { potencia: 450, precio: 120, modelo: 'Tier1 TOPCon' },
  monthly: Array(12).fill({ mes: 'Mes', dias: 30, hsp: '4.5', kWh: 1166 }),
  tit: { consumoKWh: 3000, precioLuz: 0.18, tarifa: 'plana' }
});

const modelSinBateriaVirtual = finContext.window.calculateFinancialModel();
assert(modelSinBateriaVirtual !== null, 'calculateFinancialModel retorna objeto válido');
assert(modelSinBateriaVirtual.hasVirtualBattery === false, 'hasVirtualBattery es false por defecto');
assert(modelSinBateriaVirtual.ingresoExcedenteEfectivo <= modelSinBateriaVirtual.costeRedAnual, 
  'Compensación efectiva acotada al coste de red anual según RD 244/2019', 
  `Efectivo: ${modelSinBateriaVirtual.ingresoExcedenteEfectivo}€ <= Red: ${modelSinBateriaVirtual.costeRedAnual}€`);

// Ahora con Virtual Battery = true
baseWindow.solarProjectConfig.hasVirtualBattery = true;
const modelConBateriaVirtual = finContext.window.calculateFinancialModel();
assert(modelConBateriaVirtual.hasVirtualBattery === true, 'hasVirtualBattery es true');
assert(modelConBateriaVirtual.ingresoExcedenteEfectivo >= modelSinBateriaVirtual.ingresoExcedenteEfectivo,
  'Con Batería Virtual se permite compensación integra de excedentes acumulados',
  `Con BV: ${modelConBateriaVirtual.ingresoExcedenteEfectivo}€ >= Sin BV: ${modelSinBateriaVirtual.ingresoExcedenteEfectivo}€`);

// 2. Verificar config.js y ui-viewport-controls.js sin colisión
const uiviewCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'ui-viewport-controls.js'), 'utf8');
const configCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'config.js'), 'utf8');

const uiContext = vm.createContext({
  window: { RA: {}, addEventListener: () => {} },
  global: { RA: {}, addEventListener: () => {} },
  document: {
    getElementById: (id) => ({ id, style: {}, classList: { add: () => {}, remove: () => {} } }),
    body: { appendChild: () => {} }
  },
  Cesium: {
    Ion: {},
    GoogleMaps: {}
  },
  setTimeout: () => 1,
  clearTimeout: () => {},
  console: console
});

vm.runInContext(uiviewCode, uiContext);
const showStatusOriginal = uiContext.window.showStatus;
assert(typeof showStatusOriginal === 'function', 'ui-viewport-controls define showStatus');

// Cargar config.js después
vm.runInContext(configCode, uiContext);
assert(uiContext.window.showStatus === showStatusOriginal, 
  'config.js no sobreescribe showStatus de ui-viewport-controls.js');

console.log(`\n=============================================================================`);
console.log(`📊 RESULTADO FASE 1: ${testsPassed} pruebas superadas, ${testsFailed} falladas.`);
console.log(`=============================================================================`);

if (testsFailed > 0) process.exit(1);
