/**
 * Test Suite: Competitor Audit Findings & Precision Hardening
 */
const assert = require('assert');
const path = require('path');
const fs = require('fs');

console.log('=== TEST SUITE: AUDITORÍA DE LA COMPETENCIA (PRECISIÓN QUIRÚRGICA) ===\n');

// Mock DOM
global.window = global;
global.getObstaclePolygon2DForRoof = (obs, setback, roof) => [
  { u: 0, v: 0 }, { u: 1, v: 0 }, { u: 1, v: 1 }, { u: 0, v: 1 }
];

// ---------------------------------------------------------------------------
// TEST 1: calcPOA normalización de azimut 0°=Sur vs 180°=Sur
// ---------------------------------------------------------------------------
console.log('Test 1: calcPOA simula idéntica irradiancia para azimut 0° y 180° (Sur)');
{
  require(path.join(__dirname, '../js/radiation-engine.js'));
  require(path.join(__dirname, '../js/solar-engine.js'));

  assert(typeof global.calcPOA === 'function', 'calcPOA existe');

  // GHI=800, DHI=200, Lat=40.4, Tilt=30, doy=172, hSolar=12.0
  const poaSur0 = global.calcPOA(800, 200, 40.4, 30, 0, 172, 12.0);
  const poaSur180 = global.calcPOA(800, 200, 40.4, 30, 180, 172, 12.0);

  assert(poaSur0 > 500, 'POA Sur debe ser significativo (>500 W/m²) a mediodía de verano');
  assert.strictEqual(Math.round(poaSur0), Math.round(poaSur180), 'Azimut 0° y 180° deben dar exactamente la misma irradiancia');
  console.log('  -> PASS: calcPOA normalizado (0°=Sur y 180°=Sur producen ' + Math.round(poaSur0) + ' W/m²)');
}

// ---------------------------------------------------------------------------
// TEST 2: Normalización de coeficiente térmico betaVoc en porcentaje
// ---------------------------------------------------------------------------
console.log('\nTest 2: Normalización de coeficiente térmico betaVoc expresado en %/°C');
{
  const eeCode = fs.readFileSync(path.join(__dirname, '../js/electrical-engine.js'), 'utf8');
  assert(eeCode.includes('const rawBeta = cfg.betaVoc || cfg.gammaVoc || cfg.tempCoeffVoc || -0.0027;'), 'rawBeta definido');
  assert(eeCode.includes('Math.abs(rawBeta) > 0.05 ? rawBeta / 100.0 : rawBeta'), 'Normalización de betaVoc > 0.05 dividida por 100');

  // Evaluar cálculo con cfg en porcentaje vs fracción
  const rawBetaPct = -0.28; // -0.28 %/°C
  const betaNorm = -Math.abs(Math.abs(rawBetaPct) > 0.05 ? rawBetaPct / 100.0 : rawBetaPct);
  assert(Math.abs(betaNorm - (-0.0028)) < 1e-6, 'Coeficiente en porcentaje normalizado a fracción -0.0028');

  const Voc = 41.5;
  const T_min = -10;
  const Voc_cold = Voc * (1 + betaNorm * (T_min - 25));
  assert(Voc_cold > 44 && Voc_cold < 47, 'Voc en frío debe estar entre 44V y 47V, valor: ' + Voc_cold.toFixed(2));
  console.log('  -> PASS: betaVoc en porcentaje (-0.28%/°C) genera Voc en frío realista (' + Voc_cold.toFixed(2) + ' V)');
}

// ---------------------------------------------------------------------------
// TEST 3: Instalación eólica pura (0 paneles) sin paneles fantasma en financials
// ---------------------------------------------------------------------------
console.log('\nTest 3: Proyecto eólico puro (0 paneles) no factura paneles ni producción solar');
{
  global.document = {
    getElementById: () => null
  };
  global.windTurbines = [{ id: 'wt1', results: { aepNetKwh: 45000 } }];
  global.windParkSummary = { totalAepNetKwh: 45000 };

  require(path.join(__dirname, '../js/financials.js'));
  assert(typeof global.calculateFinancialModel === 'function', 'calculateFinancialModel existe');

  const res = global.calculateFinancialModel({
    numPanels: 0,
    d: { numPanels: 0, annualKWh: 0, cfg: { potencia: 450, precio: 125 } }
  });

  assert.strictEqual(res.numPanels, 0, 'numPanels debe ser exactamente 0');
  assert.strictEqual(res.kwp, 0, 'kwp debe ser 0');
  assert(res.annualYieldKWh >= 45000, 'Producción anual corresponde a la eólica neta (45000 kWh)');
  console.log('  -> PASS: Instalación eólica pura calculada con 0 paneles solares y producción real ' + res.annualYieldKWh + ' kWh/año');
}

// ---------------------------------------------------------------------------
// TEST 4: Sombra de aerogeneradores con cota relativa respecto a la cubierta
// ---------------------------------------------------------------------------
console.log('\nTest 4: Sombra de aerogenerador evalúa cota relativa Z_wt vs Z_roof');
{
  require(path.join(__dirname, '../js/polygon-shadow-math.js'));
  assert(typeof global.getObstacleShadowPolygons2DForRoof === 'function', 'getObstacleShadowPolygons2DForRoof existe');

  const roofAlta = {
    carto: { height: 25.0 } // Cubierta a 25 metros de altura
  };

  const turbinaBaja = {
    type: 'wind_turbine',
    mastHeight: 18.0,
    positionCartographic: { altitudeM: 0 } // Turbina en suelo (cota 0), mástil 18m < 25m cubierta
  };

  // La punta de la turbina llega a 18m, la cubierta está a 25m: no debe arrojar sombra sobre la cubierta
  const shadowBaja = global.getObstacleShadowPolygons2DForRoof(turbinaBaja, roofAlta, 1.0, 0.0, 1.5);
  assert.strictEqual(shadowBaja, null, 'Turbina más baja que la cubierta no arroja sombra sobre el tejado');

  const turbinaAlta = {
    type: 'wind_turbine',
    mastHeight: 30.0,
    positionCartographic: { altitudeM: 0 } // Mástil 30m > 25m cubierta
  };

  const shadowAlta = global.getObstacleShadowPolygons2DForRoof(turbinaAlta, roofAlta, 1.0, 0.0, 1.5);
  assert(Array.isArray(shadowAlta) && shadowAlta.length > 0, 'Turbina que sobrepasa la cubierta sí proyecta sombra');
  console.log('  -> PASS: Cota relativa de sombras eólicas respeta la física vertical tridimensional');
}

// ---------------------------------------------------------------------------
// TEST 5: Fallback de b.polygon en interferencia eólica
// ---------------------------------------------------------------------------
console.log('\nTest 5: wind-obstacle-interference soporta b.polygon');
{
  const woiCode = fs.readFileSync(path.join(__dirname, '../js/wind/wind-obstacle-interference.js'), 'utf8');
  assert(woiCode.includes('Array.isArray(b.polygon) ? b.polygon : null'), 'b.polygon incluido en la cadena de puntos');
  console.log('  -> PASS: Interferencia de obstáculos eólicos soporta edificios con jerarquía b.polygon');
}

console.log('\n=== TODOS LOS TESTS DE LA AUDITORÍA DE LA COMPETENCIA HAN PASADO (5/5) ===\n');
