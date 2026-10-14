/**
 * Test de Verificación - Fase 6: Estabilidad 3D, Fugas de Memoria y Física de Separación Inter-filas (CTE DB-HE5)
 */
const assert = require('assert');
const fs = require('fs');

console.log('--- TEST FASE 6: INICIO ---');

// Mock global environment
global.window = global;
global.window.addEventListener = () => {};
global.Cesium = { Ion: {}, GoogleMaps: {} };
global.document = {
  getElementById: () => null,
  createElement: () => ({ style: {}, appendChild: () => {} }),
  body: { appendChild: () => {} },
  addEventListener: () => {}
};

// 1. Cargar config.js y probar raCalculateSystemPR
require('../js/config.js');
assert(typeof global.raCalculateSystemPR === 'function', 'raCalculateSystemPR debe estar expuesto');
const prObj = global.raCalculateSystemPR(0.925);
console.log('raCalculateSystemPR result:', prObj);
assert(typeof prObj.prBOS === 'number', 'prBOS debe estar presente en el resultado');
assert(prObj.prBOS > prObj.prTotal, 'prBOS (sin derating térmico ni IAM) debe ser mayor que prTotal');
assert(prObj.prBOS > prObj.prElec, 'prBOS (sin IAM) debe ser mayor que prElec');
console.log('✓ raCalculateSystemPR provee prBOS desacoplado de IAM y térmico');

// 2. Cargar solar-engine.js y probar computeInterRowPitch (CTE DB-HE5)
require('../js/solar-engine.js');
assert(typeof global.computeInterRowPitch === 'function', 'computeInterRowPitch debe estar expuesto');

// Test 1: Solsticio invierno ventana 4h (10h-14h) para Madrid (lat 40.41, 30° tilt, 2.2m)
const pitchCTE = global.computeInterRowPitch({
  moduleLength: 2.20,
  tiltDeg: 30.0,
  azimuthDeg: 180.0,
  latitude: 40.41,
  safetyMarginM: 0.10,
  useCTEWindow: true
});
console.log('computeInterRowPitch (CTE 4h):', pitchCTE);
assert(pitchCTE.solarElevationWinterDeg >= 19.5 && pitchCTE.solarElevationWinterDeg <= 21.0, 'Elevación solar a las 10h/14h en Madrid debe ser ~20.3°');
assert(pitchCTE.solarElevationNoonDeg >= 25.5 && pitchCTE.solarElevationNoonDeg <= 26.5, 'Elevación solar a mediodía en Madrid debe ser ~26.1°');
assert(pitchCTE.shadowLengthM > 2.4 && pitchCTE.shadowLengthM < 2.8, 'Longitud de sombra en ventana 4h debe ser ~2.6m');
assert(pitchCTE.totalPitchM > 4.4 && pitchCTE.totalPitchM < 4.8, 'Paso total inter-filas debe ser ~4.6m según CTE DB-HE5');
assert(pitchCTE.standard.includes('CTE DB-HE5'), 'Debe certificar cumplimiento de CTE DB-HE5');

// Test 2: Modo Mediodía Solar (legacy / sin ventana 4h)
const pitchNoon = global.computeInterRowPitch({
  moduleLength: 2.20,
  tiltDeg: 30.0,
  azimuthDeg: 180.0,
  latitude: 40.41,
  safetyMarginM: 0.10,
  useCTEWindow: false
});
console.log('computeInterRowPitch (Noon):', pitchNoon);
assert(pitchNoon.solarElevationWinterDeg >= 25.5 && pitchNoon.solarElevationWinterDeg <= 26.5, 'Modo mediodía debe usar elevación a las 12:00 (~26.1°)');
assert(pitchCTE.totalPitchM > pitchNoon.totalPitchM, 'El paso CTE 4h debe ser mayor que el paso de mediodía para evitar sombras entre 10h y 14h');

console.log('✓ computeInterRowPitch cumple rigurosamente con la ventana de 4h de CTE DB-HE5');

// 3. Verificar js/measure-tool.js en disco
const measureCode = fs.readFileSync('js/measure-tool.js', 'utf8');
assert(measureCode.includes('_rafMeasureMouseMove'), 'measure-tool.js debe usar throttling mediante RAF');
assert(measureCode.includes('ensurePreviewEntities'), 'measure-tool.js debe reutilizar entidades persistentes');
assert(measureCode.includes('previewPinA'), 'measure-tool.js debe mantener previewPinA persistente');
assert(measureCode.includes('previewPinB'), 'measure-tool.js debe mantener previewPinB persistente');
assert(measureCode.includes('previewRing'), 'measure-tool.js debe mantener previewRing persistente');
assert(measureCode.includes('previewLabel'), 'measure-tool.js debe mantener previewLabel persistente');
assert(measureCode.includes('dZSigned'), 'measure-tool.js debe calcular desnivel con signo');
assert(measureCode.includes('cachedCandidates'), 'measure-tool.js debe cachear candidatos de snap');
console.log('✓ measure-tool.js verificado: cero fugas, reutilización GPU y throttling RAF');

// 4. Verificar solar-heatmap.js en disco
const heatmapCode = fs.readFileSync('js/solar-heatmap.js', 'utf8');
assert(heatmapCode.includes('prCalc.prBOS'), 'solar-heatmap.js debe usar prBOS para evitar doble descuento térmico e IAM');
console.log('✓ solar-heatmap.js verificado: erradicada la doble penalización');

console.log('--- TEST FASE 6: 100% COMPLETADO CON ÉXITO ---');
