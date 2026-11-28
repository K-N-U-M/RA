// Test unitario y de integración: Fase 3 - Sincronización Física Solar y Caché Energética
const assert = require('assert');
const fs = require('fs');

global.window = {
  solarProjectConfig: {
    lat: 40.4168,
    lng: -3.7038,
    selectedInverterId: 'inv_huawei_5ktl'
  },
  solarLossConfig: {
    soiling: 0.025,
    iamAngular: 0.028,
    mismatch: 0.02,
    wiring: 0.015,
    inverter: 0.025
  },
  equipmentCatalog: {
    modules: [{ id: 'mod_topcon_450', wp: 450 }],
    inverters: []
  }
};
global.document = {
  getElementById: () => null
};

// Cargar motores
eval(fs.readFileSync('js/config.js', 'utf8'));
eval(fs.readFileSync('js/solar-engine.js', 'utf8'));
eval(fs.readFileSync('js/production-source.js', 'utf8'));
eval(fs.readFileSync('js/solar-optimizer.js', 'utf8'));

console.log('═════════════════════════════════════════════════════════════════════');
console.log('⚡ TEST SUITE: FASE 3 - FÍSICA SOLAR, RAYTRACING Y CACHÉ ENERGÉTICA');
console.log('═════════════════════════════════════════════════════════════════════');

// TEST 1: Azimut Sur=0° vs Sur=180° produce idéntica radiación POA y no orienta al Norte
const resAz0 = window.runPhysicalModel(5.0, 40.4, -3.7, 30, 0, { pAcNominalW: 5000 });
const resAz180 = window.runPhysicalModel(5.0, 40.4, -3.7, 30, 180, { pAcNominalW: 5000 });
assert.ok(resAz0 && resAz0.annualKWh > 6000, 'Producción orientada al Sur a 30° debe ser > 6000 kWh/año (~1400-1600 kWh/kWp)');
assert.strictEqual(resAz0.annualKWh, resAz180.annualKWh, 'runPhysicalModel debe dar la misma producción con 0° (Sur) que con 180° (brújula)');
console.log('✔ PASS 1: Convención de azimut normalizada (0°=Sur y 180°=Sur coinciden: ' + resAz0.annualKWh + ' kWh/año).');

// TEST 2: computeHighPrecisionSolarPosition distingue hora UTC de hora Solar
const spUtc = window.computeHighPrecisionSolarPosition(40.4, -3.7, 172, 12.0, true);
const spSolar = window.computeHighPrecisionSolarPosition(40.4, -3.7, 172, 12.0, false);
assert.ok(spUtc && spSolar, 'Ambas llamadas deben retornar posición solar válida');
assert.ok(spSolar.elevDeg > 70, 'Al mediodía solar (12:00) en solsticio de verano, la elevación en Madrid es ~73°');
assert.notStrictEqual(spUtc.elevDeg, spSolar.elevDeg, 'Hora UTC y hora solar deben diferir por la ecuación del tiempo y longitud');
console.log('✔ PASS 2: Hora solar vs UTC desacoplada correctamente (Elevación solar mediodía: ' + spSolar.elevDeg.toFixed(1) + '°).');

// TEST 3: Firma de caché en production-source.js reactiva a cambios de inversor y pérdidas
const sig1 = window.RA.Production.signature({ kwp: 5, lat: 40.4, lon: -3.7, tilt: 30, azimuth: 0, cfg: { pAcNominalW: 5000 } });
const sig2 = window.RA.Production.signature({ kwp: 5, lat: 40.4, lon: -3.7, tilt: 30, azimuth: 0, cfg: { pAcNominalW: 3000 } }); // Menor inversor
assert.notStrictEqual(sig1, sig2, 'La firma de caché DEBE cambiar al modificar el límite AC del inversor (clipping)');

window.solarLossConfig.soiling = 0.05; // 5% ensuciamiento
const sig3 = window.RA.Production.signature({ kwp: 5, lat: 40.4, lon: -3.7, tilt: 30, azimuth: 0, cfg: { pAcNominalW: 5000 } });
assert.notStrictEqual(sig1, sig3, 'La firma de caché DEBE cambiar al modificar la configuración de pérdidas');
console.log('✔ PASS 3: Firma de caché SSOT blindada ante cambios de inversor y factores de pérdidas.');

// TEST 4: solar-optimizer calcula recurso solar adaptado a la latitud
global.WP = {
  polylines: [{
    points: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 15 }, { x: 0, y: 15 }],
    roofInfo: { lat: 40.4, lng: -3.7, tiltDeg: 0, azDeg: 180, areaM2: 300, coplanar: true, panels: Array(20).fill({}) }
  }]
};
global.computeSinglePolylineRoofInfo = (pts, poly) => poly.roofInfo;
global.calculateOptimalPanelPlacement = () => ({ count: 20, layout: { centers: [] } });
const optResult = window.RASolarOptimizer.benchmarkFaldon(0);
assert.ok(optResult && optResult.allScenarios && optResult.allScenarios.length > 0, 'benchmarkFaldon debe generar escenarios');
assert.ok(optResult.bestEnergy.kwhYear > 0, 'Escenario de máxima energía debe tener kWh/año positivo');
console.log('✔ PASS 4: Optimizador multivariable ejecutado con recurso solar geolocalizado (' + optResult.bestEnergy.kwhYear + ' kWh/año).');

// TEST 5: Normalización de gammaPmp/tempCoeffPmax y loadFrac post-pérdidas DC
{
  const resPct = window.runPhysicalModel(5.0, 40.4, -3.7, 30, 180, { pAcNominalW: 5000, gammaPmp: -0.45 });
  const resFrac = window.runPhysicalModel(5.0, 40.4, -3.7, 30, 180, { pAcNominalW: 5000, tempCoeffPmax: -0.0045 });
  const resDefault = window.runPhysicalModel(5.0, 40.4, -3.7, 30, 180, { pAcNominalW: 5000, tecnologia: 'N-Type' });
  assert.strictEqual(resPct.annualKWh, resFrac.annualKWh, 'gammaPmp en % (-0.45) y tempCoeffPmax en fracción (-0.0045) deben ser idénticos');
  assert.ok(resPct.annualKWh < resDefault.annualKWh, 'Un coeficiente más negativo (-0.45%/°C) debe reducir la producción respecto al N-Type (-0.28%/°C)');
  console.log('✔ PASS 5: Normalización gammaPmp/tempCoeffPmax verificada (' + resPct.annualKWh + ' vs N-Type ' + resDefault.annualKWh + ' kWh/año).');
}

console.log('═════════════════════════════════════════════════════════════════════');
console.log('🎉 TODOS LOS TESTS DE FASE 3 PASARON EXITOSAMENTE!');
console.log('═════════════════════════════════════════════════════════════════════');
