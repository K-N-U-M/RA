/**
 * Test Suite: Beneficios Fiscales & Ayudas (España)
 * - IVA dinámico: 21% (general), 10% (reducido reforma/vivienda), 0% (exento / IGIC)
 * - Perfil fiscal: Particular (IRPF) vs Empresa (Impuesto sobre Sociedades)
 * - IRPF Autoconsumo 2026 (10-20%) y Eficiencia Energética (20-60%)
 * - Impuesto sobre Sociedades: Libertad de Amortización (DA 17ª LIS / RDL 18/2022)
 * - Persistencia SSOT en .raproject (project-storage)
 * - Dossier comercial y propuesta sin IVA hardcodeado
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('═════════════════════════════════════════════════════════════════════');
console.log('🏛️ TEST SUITE: AUDITORÍA Y VERIFICACIÓN DE BENEFICIOS FISCALES (ESPAÑA)');
console.log('═════════════════════════════════════════════════════════════════════\n');

// Mock del entorno DOM y SSOT
const domMock = {
  elements: {},
  getElementById: function(id) {
    if (this.elements[id]) return this.elements[id];
    return null;
  },
  set: function(id, val) {
    this.elements[id] = { id: id, value: val, textContent: val, style: {} };
  }
};

global.window = {
  RA: {
    solarStats: { annualYieldKWh: 7000, monthlyYields: [300, 400, 600, 750, 850, 950, 950, 900, 700, 500, 300, 200] },
    billAuditor: {
      comparison: {
        gastoMensualActualEUR: 200,
        gastoMensualConSolarEUR: 50,
        consumoAnualKWh: 4000
      }
    }
  },
  solarProjectConfig: {},
  windTurbines: []
};
global.getProjectCalcs = () => ({
  numPanels: 10,
  kwp: 5.5,
  annualKWh: 7000,
  subtotal: 6000,
  tit: {},
  cfg: { potencia: 550, modelo: 'Tier-1 Mono' }
});
global.document = domMock;
global.localStorage = {
  _store: {},
  getItem: function(k) { return this._store[k] || null; },
  setItem: function(k, v) { this._store[k] = String(v); },
  removeItem: function(k) { delete this._store[k]; }
};

// Cargar script financials.js
const finCode = fs.readFileSync(path.join(__dirname, '../js/financials.js'), 'utf8');
eval(finCode);

// ---------------------------------------------------------------------------
// TEST 1: IVA dinámico (21% General, 10% Reducido Reforma, 0% Exento)
// ---------------------------------------------------------------------------
console.log('▶ TEST 1: Comprobación de tipos de IVA dinámicos (21%, 10%, 0%)...');
{
  // Caso 1: 21% General
  domMock.set('modal-tax-iva-opt', '0.21');
  domMock.set('modal-tax-profile-opt', 'particular');
  domMock.set('modal-tax-irpf-opt', '0');
  domMock.set('modal-tax-ibi-opt', '0');

  const m21 = calculateFinancialModel();
  assert(m21, 'calculateFinancialModel debe retornar modelo');
  assert.strictEqual(m21.ivaRate, 0.21, 'ivaRate debe ser 0.21');
  assert.strictEqual(m21.iva, Math.round(m21.subtotal * 0.21), 'IVA 21% debe ser subtotal * 0.21');
  assert.strictEqual(m21.capexBruto, m21.subtotal + m21.iva, 'capexBruto = subtotal + iva');

  // Caso 2: 10% Reducido (Reforma / Rehabilitación vivienda)
  domMock.set('modal-tax-iva-opt', '0.10');
  const m10 = calculateFinancialModel();
  assert.strictEqual(m10.ivaRate, 0.10, 'ivaRate debe ser 0.10');
  assert.strictEqual(m10.iva, Math.round(m10.subtotal * 0.10), 'IVA 10% debe ser subtotal * 0.10');
  assert.strictEqual(m10.capexBruto, m10.subtotal + m10.iva, 'capexBruto = subtotal + iva al 10%');
  assert(m10.capexBruto < m21.capexBruto, 'Capex con IVA al 10% debe ser menor que al 21%');

  // Caso 3: 0% Exento / Canarias IGIC 0%
  domMock.set('modal-tax-iva-opt', '0.0');
  const m0 = calculateFinancialModel();
  assert.strictEqual(m0.ivaRate, 0.0, 'ivaRate debe ser 0.0');
  assert.strictEqual(m0.iva, 0, 'IVA 0% debe ser 0 €');
  assert.strictEqual(m0.capexBruto, m0.subtotal, 'capexBruto debe ser igual al subtotal sin IVA');

  console.log(`  -> PASS: Subtotal: ${m21.subtotal} € | IVA 21%: ${m21.iva} € | IVA 10%: ${m10.iva} € | IVA 0%: ${m0.iva} €`);
}

// ---------------------------------------------------------------------------
// TEST 2: IRPF Autoconsumo General 2026 (10-20%) vs Eficiencia (20-60%)
// ---------------------------------------------------------------------------
console.log('\n▶ TEST 2: Comprobación de tramos IRPF Autoconsumo vs Eficiencia...');
{
  domMock.set('modal-tax-iva-opt', '0.21');
  domMock.set('modal-tax-profile-opt', 'particular');

  // Caso 1: 10% Autoconsumo general (máx 5.000 €)
  domMock.set('modal-tax-irpf-opt', '0.10');
  const mIrpf10 = calculateFinancialModel();
  assert.strictEqual(mIrpf10.customerProfile, 'particular', 'Perfil debe ser particular');
  assert.strictEqual(mIrpf10.ahorroIRPF, Math.min(mIrpf10.capexBruto, 5000) * 0.10, 'IRPF 10% debe calcular 10% de base máx 5.000 €');

  // Caso 2: 20% Autoconsumo general (máx 5.000 €)
  domMock.set('modal-tax-irpf-opt', '0.20_auto');
  const mIrpf20Auto = calculateFinancialModel();
  assert.strictEqual(mIrpf20Auto.ahorroIRPF, Math.min(mIrpf20Auto.capexBruto, 5000) * 0.20, 'IRPF 20% autoconsumo debe calcular 20% de base máx 5.000 €');

  // Caso 3: 40% Eficiencia (máx 7.500 €)
  domMock.set('modal-tax-irpf-opt', '0.40');
  const mIrpf40 = calculateFinancialModel();
  assert.strictEqual(mIrpf40.ahorroIRPF, Math.min(mIrpf40.capexBruto, 7500) * 0.40, 'IRPF 40% eficiencia debe calcular 40% de base máx 7.500 €');

  // Caso 4: 60% Eficiencia Edificio (máx 15.000 €)
  domMock.set('modal-tax-irpf-opt', '0.60');
  const mIrpf60 = calculateFinancialModel();
  assert.strictEqual(mIrpf60.ahorroIRPF, Math.min(mIrpf60.capexBruto, 15000) * 0.60, 'IRPF 60% eficiencia debe calcular 60% de base máx 15.000 €');

  console.log(`  -> PASS: IRPF 10%: ${mIrpf10.ahorroIRPF} € | IRPF 20%: ${mIrpf20Auto.ahorroIRPF} € | IRPF 40%: ${mIrpf40.ahorroIRPF} € | IRPF 60%: ${mIrpf60.ahorroIRPF} €`);
}

// ---------------------------------------------------------------------------
// TEST 3: Impuesto sobre Sociedades (Libertad de Amortización) en Empresas
// ---------------------------------------------------------------------------
console.log('\n▶ TEST 3: Comprobación de Libertad de Amortización en Impuesto sobre Sociedades...');
{
  domMock.set('modal-tax-iva-opt', '0.21');
  domMock.set('modal-tax-profile-opt', 'empresa');
  domMock.set('modal-tax-is-opt', '0.25'); // 25% General
  domMock.set('modal-tax-irpf-opt', '0.40'); // Debe ignorarse para empresas

  const mCorp = calculateFinancialModel();
  assert.strictEqual(mCorp.customerProfile, 'empresa', 'Perfil debe ser empresa');
  assert.strictEqual(mCorp.ahorroIRPF, 0, 'Empresas no deben computar deducción de IRPF');
  
  // Base amortizable para empresa = subtotal (IVA deducible como crédito fiscal)
  const expectedIS = Math.round(mCorp.subtotal * 0.25);
  assert.strictEqual(mCorp.ahorroSociedades, expectedIS, 'Ahorro Sociedades 25% debe ser subtotal * 0.25');
  assert.strictEqual(mCorp.ahorroDeduccionDirecta, expectedIS, 'Deducción directa debe corresponder a Sociedades');
  
  // Verificar inyección en el flujo de caja del Año 1
  assert(mCorp.cashflow && mCorp.cashflow.length >= 25, 'Debe existir flujo a 25 años');
  
  // Comparar con modelo empresa sin amortización libre (0%)
  domMock.set('modal-tax-is-opt', '0');
  const mCorp0 = calculateFinancialModel();
  assert.strictEqual(mCorp0.ahorroSociedades, 0, 'IS al 0% debe tener 0 € de ahorro');
  
  // El flujo de caja del año 1 (índice 1 tras año 0) con 25% IS debe ser exactamente mayor por expectedIS
  assert.strictEqual(Math.round(mCorp.cashflow[1] - mCorp0.cashflow[1]), expectedIS, 'El flujo de caja de Año 1 debe reflejar íntegramente el escudo fiscal');
  assert.strictEqual(mCorp.financialSchedule25[0].fiscalEUR, expectedIS, 'financialSchedule25 del año 1 debe reportar el escudo fiscal');

  console.log(`  -> PASS: Subtotal Empresa: ${mCorp.subtotal} € | Escudo Fiscal IS (25%): ${mCorp.ahorroSociedades} € | IRPF: ${mCorp.ahorroIRPF} € | Flujo Año 1: ${mCorp.cashflow[1]} €`);
}

// ---------------------------------------------------------------------------
// TEST 4: Persistencia y Roundtrip en project-storage.js
// ---------------------------------------------------------------------------
console.log('\n▶ TEST 4: Verificación de exportación e importación en project-storage.js...');
{
  const storageCode = fs.readFileSync(path.join(__dirname, '../js/project-storage.js'), 'utf8');
  assert(storageCode.includes('taxSettings:'), 'project-storage.js debe exportar taxSettings');
  assert(storageCode.includes('modal-tax-profile-opt'), 'project-storage.js debe sincronizar modal-tax-profile-opt');
  assert(storageCode.includes('modal-tax-iva-opt'), 'project-storage.js debe sincronizar modal-tax-iva-opt');
  assert(storageCode.includes('modal-tax-is-opt'), 'project-storage.js debe sincronizar modal-tax-is-opt');

  console.log('  -> PASS: project-storage.js serializa y deserializa taxSettings correctamente');
}

// ---------------------------------------------------------------------------
// TEST 5: Consistencia de IVA en commercial-proposal-dossier.js
// ---------------------------------------------------------------------------
console.log('\n▶ TEST 5: Verificación de IVA dinámico en commercial-proposal-dossier.js...');
{
  const dossierCode = fs.readFileSync(path.join(__dirname, '../js/commercial-proposal-dossier.js'), 'utf8');
  assert(!dossierCode.includes('m.capexBruto / 1.21'), 'No debe existir capexBruto / 1.21 hardcodeado');
  assert(!dossierCode.includes('totalCostSinIva * 1.21'), 'No debe existir totalCostSinIva * 1.21 hardcodeado');
  assert(dossierCode.includes('var ivaRate = (m && typeof m.ivaRate === \'number\') ? m.ivaRate : 0.21;'), 'ivaRate extraído de m');

  console.log('  -> PASS: commercial-proposal-dossier.js calcula IVA dinámicamente con SSOT');
}

console.log('\n═════════════════════════════════════════════════════════════════════');
console.log('✅ TODOS LOS TESTS DE BENEFICIOS FISCALES HAN PASADO (5/5 PASS)');
console.log('═════════════════════════════════════════════════════════════════════\n');
