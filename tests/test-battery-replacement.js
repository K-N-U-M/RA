/**
 * test-battery-replacement.js — Verificación de reposición automática indexada de batería (Año 10)
 */
const assert = require('assert');
const fs = require('fs');

console.log('🧪 Iniciando test de reposición automática indexada de batería...');

const domMock = {
  elements: {},
  getElementById: function(id) {
    if (!this.elements[id]) {
      this.elements[id] = { value: '', textContent: '', style: {}, setAttribute: () => {}, removeAttribute: () => {} };
    }
    return this.elements[id];
  },
  set: function(id, val) {
    this.elements[id] = { id: id, value: val, textContent: val, style: {}, setAttribute: () => {}, removeAttribute: () => {} };
  }
};

global.document = domMock;
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
  kwp: 5.0,
  annualKWh: 7000,
  subtotal: 6000,
  tit: {},
  cfg: { potencia: 500, modelo: 'Tier-1 Mono' }
});

global.equipmentCatalog = {
  inverters: [{ id: 'inv_huawei_5k', kw: 5, price: 950 }],
  batteries: [{ id: 'bat_luna_5k', kwh: 5.0, price: 2200 }]
};

// Cargar financials.js
const code = fs.readFileSync('js/financials.js', 'utf8');
eval(code);

// CASO 1: Sin batería -> Año 10 debe tener 0 de reposición, Año 12 inversor
{
  global.window.solarProjectConfig = {
    selectedInverterId: 'inv_huawei_5k',
    selectedBatteryId: null,
    totalPanels: 10
  };
  global.pricing = { batPrice: 0 };
  domMock.set('cfg-pres-bat', '0');

  const mNoBat = calculateFinancialModel();
  assert.strictEqual(mNoBat.batteryReplacementCostYr10, 0, 'Sin batería el coste año 10 debe ser 0');
  assert.strictEqual(mNoBat.financialSchedule25[9].replacementEUR, 0, 'Año 10 (idx 9) no debe tener reposición');
  assert.ok(mNoBat.financialSchedule25[11].replacementEUR > 0, 'Año 12 (idx 11) debe tener reposición de inversor');
  console.log('  ✓ Caso 1 (Sin batería): Año 10 = 0 €, Año 12 = ' + mNoBat.financialSchedule25[11].replacementEUR + ' €');
}

// CASO 2: Con batería 5 kWh -> Año 10 debe incluir reposición con deflación tecnológica
{
  global.window.solarProjectConfig = {
    selectedInverterId: 'inv_huawei_5k',
    selectedBatteryId: 'bat_luna_5k',
    totalPanels: 10
  };
  global.pricing = { batPrice: 2200 };
  domMock.set('cfg-pres-bat', '2200');

  const mWithBat = calculateFinancialModel();
  assert.ok(mWithBat.batteryReplacementCostYr10 > 0, 'Con batería debe calcular reposición en año 10');
  assert.strictEqual(mWithBat.financialSchedule25[9].replacementEUR, mWithBat.batteryReplacementCostYr10, 'Año 10 en cronograma debe coincidir');
  assert.ok(mWithBat.financialSchedule25[11].replacementEUR > 0, 'Año 12 en cronograma debe mantener reposición de inversor');
  console.log('  ✓ Caso 2 (Con batería): Año 10 (batería) = ' + mWithBat.batteryReplacementCostYr10 + ' € | Año 12 (inversor) = ' + mWithBat.financialSchedule25[11].replacementEUR + ' €');
}

console.log('🎉 TEST DE REPOSICIÓN AUTOMÁTICA DE BATERÍA SUPERADO AL 100%');
