// Test unitario: Verificar que la propuesta comercial se genera y su script interno no tiene errores de sintaxis
const assert = require('assert');
const fs = require('fs');

global.document = {
  getElementById: () => null,
  querySelectorAll: () => [],
  querySelector: () => null
};

global.window = {
  allRenderedPanels: [{ id: 1 }],
  lastRoofInfo: { panels: [{ id: 1 }] },
  solarProjectConfig: { selectedObjective: 'optimal_inv' },
  RA: { billAuditor: null },
  RA_SvgCatalog: { render: () => '<svg></svg>' },
  equipmentCatalog: { modules: [], inverters: [], batteries: [] }
};
global.localStorage = { getItem: () => null };
global.sessionStorage = { getItem: () => null };

// Load financials
const content = fs.readFileSync('js/financials.js', 'utf8');
eval(content);

global.getProjectCalcs = () => ({
  numPanels: 12,
  kwp: 5.4,
  produccionAnual: 8000,
  refNum: 'TEST-PROPUESTA-1',
  fechaStr: '28/10/2026',
  monthly: Array(12).fill({ kWh: 600 }),
  tit: { nombre: 'Juan Perez', nif: '12345678Z', cups: 'ES0001', dir: 'Madrid', mun: 'Madrid', prov: 'Madrid', tecnico: 'Ingeniero', titulacion: 'Ingeniero', ncol: '123' },
  cfg: { potencia: 450, ancho: 1.13, largo: 1.72 }
});

global.calculateFinancialModel = () => ({
  capexBruto: 6000,
  ahorroAnualLuz: 950,
  ahorroMensualLuz: 79,
  van25: 12000,
  tirPct: 18.5,
  paybackSimple: 5.2,
  lcoe: 0.045,
  consumoAnual: 4500,
  precioRedEUR: 0.18,
  monthlyYields: [400, 500, 650, 750, 850, 900, 950, 900, 750, 600, 450, 350],
  cashflowAcum: [-6000, -5000, -4000, -3000, -2000, -1000, 0, 1000, 2000, 3000],
  decisionMatrix: { recomendacion: 'ALTA RENTABILIDAD' },
  ahorroAcum25: 25000
});

let generatedHtml = '';
global.window.open = (url, name) => ({
  document: {
    open: () => {},
    write: (h) => { generatedHtml += h; },
    close: () => {}
  }
});
global.enrichSummaryWithGemini = () => {};

// Generar propuesta
window.generatePropuestaComercialPDF(true);

assert.ok(generatedHtml.length > 50000, 'El HTML de la propuesta debe generarse');
assert.ok(generatedHtml.includes('closeProposalViewer()'), 'El botón cerrar debe llamar a closeProposalViewer()');
assert.ok(generatedHtml.includes('getOpenerWindow()'), 'Debe existir el helper getOpenerWindow()');

// Extraer el bloque <script> y verificar que compila sin errores en el motor JS
const sStart = generatedHtml.indexOf('<script>');
const sEnd = generatedHtml.indexOf('</script>', sStart);
const scriptCode = generatedHtml.substring(sStart + 8, sEnd);

try {
  new Function(scriptCode);
  console.log('PASS: El script embebido en la propuesta compila al 100% sin SyntaxError!');
} catch (e) {
  console.error('FAIL: Error de sintaxis en script de propuesta:', e);
  process.exit(1);
}

// Verificar que las funciones clave están definidas en el script
const expectedFunctions = [
  'getOpenerWindow',
  'closeProposalViewer',
  'setDocTheme',
  'capture3DToProposal',
  'togglePropEdit',
  'exportPropDocx',
  'exportPropWord',
  'exportPropHtml'
];

expectedFunctions.forEach(fn => {
  assert.ok(scriptCode.includes('function ' + fn), `La función ${fn} debe estar definida en el script embebido`);
});
console.log('PASS: Todas las funciones de la botonera (' + expectedFunctions.join(', ') + ') están definidas.');

console.log('TODO EL TEST DE LA BOTONERA DE LA PROPUESTA PASÓ AL 100%');
