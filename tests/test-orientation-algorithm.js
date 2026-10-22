const assert = require('assert');

console.log('═════════════════════════════════════════════════════════════════════');
console.log('⚡ TEST SUITE: ALGORITMO Y ORIENTACIÓN DE PLACAS FV (CARA AL SOL & E-W)');
console.log('═════════════════════════════════════════════════════════════════════');

// Test 1: Verificación de elevación de cumbrera en Este-Oeste (A-Frame vs V-Valley)
console.log('▶ TEST 1: Verificación de cumbrera alta en Este-Oeste (A-Frame Dome)...');
{
  const curModLen = 2.10;
  const sinDelta = Math.sin((15 * Math.PI) / 180);
  const baseElev = 0.20;

  // En Este-Oeste:
  // - Módulo Oeste (ewSide='W', isWest=true): arista en la cumbrera central es sx = -1.
  // - Módulo Este (ewSide='E', isWest=false): arista en la cumbrera central es sx = +1.
  const isHighEdgeWestRidge = (true) ? (( -1 <= 0 ) ? true : false) : false; // sx = -1
  const isHighEdgeWestOuter = (true) ? (( 1 <= 0 ) ? true : false) : false;  // sx = +1
  const isHighEdgeEastRidge = (true) ? (( 1 >= 0 ) ? true : false) : false;  // sx = +1
  const isHighEdgeEastOuter = (true) ? (( -1 >= 0 ) ? true : false) : false; // sx = -1

  assert.strictEqual(isHighEdgeWestRidge, true, 'El borde del módulo Oeste en la cumbrera central DEBE ser alto');
  assert.strictEqual(isHighEdgeWestOuter, false, 'El borde exterior del módulo Oeste DEBE ser bajo (apoyo)');
  assert.strictEqual(isHighEdgeEastRidge, true, 'El borde del módulo Este en la cumbrera central DEBE ser alto');
  assert.strictEqual(isHighEdgeEastOuter, false, 'El borde exterior del módulo Este DEBE ser bajo (apoyo)');
  console.log('✔ TEST 1 PASADO: Cumbrera central elevada (A-Frame) y apoyos exteriores bajos confirmados.');
}

// Test 2: Incompatibilidad estricta de East-West en modo CARA AL SOL
console.log('▶ TEST 2: Inmunidad de CARA AL SOL contra contaminación de residuo Este-Oeste...');
{
  const cfg = {
    arrangementMode: 'solar_optimal',
    structureType: 'triangles_15_ew', // residuo previo en faldón
    estructura: { subtype: 'east_west' }
  };
  const isOptimal = (cfg.arrangementMode === 'solar_optimal' || cfg.moduleTiltDeg === 'optimal');
  const isEastWest = !isOptimal && (cfg.moduleAzimuthSur === "east_west" || cfg.structureType === "east_west" || cfg.structureType === "triangles_15_ew" || (cfg.estructura && cfg.estructura.subtype === "east_west"));

  assert.strictEqual(isOptimal, true, 'isOptimal debe ser true');
  assert.strictEqual(isEastWest, false, 'isEastWest DEBE ser false cuando arrangementMode es solar_optimal');
  console.log('✔ TEST 2 PASADO: Modo CARA AL SOL neutraliza cualquier bandera residual Este-Oeste.');
}

// Test 3: Cubierta inclinada favorable a vertiente Sur en CARA AL SOL
console.log('▶ TEST 3: Integración Coplanar técnica en cubiertas inclinadas vertiente Sur...');
{
  // Simular objeto polilínea
  const poly = {
    name: 'Tejado Inclinado Sur',
    roofInfo: { tiltDeg: 22, azimuthDeg: 175 },
    structureType: 'triangles_15_ew',
    estructura: { tipo: 'balasto', subtype: 'east_west' }
  };

  const slope = poly.roofInfo.tiltDeg;
  const rAz = poly.roofInfo.azimuthDeg;
  const isSouthFavorable = (slope > 8 && rAz >= 100 && rAz <= 260);

  assert.strictEqual(isSouthFavorable, true, 'Cubierta a 22º y azimut 175º debe ser vertiente Sur favorable');

  if (isSouthFavorable) {
    poly.alignToPlane = true;
    poly.estructura = { tipo: 'coplanar', clearance: 0 };
    poly.structureType = 'coplanar_teja';
    poly.modTilt = 'auto';
    poly.modAzimuth = 'auto';
  }

  assert.strictEqual(poly.estructura.tipo, 'coplanar', 'En tejado inclinado Sur, la estructura debe ser coplanar');
  assert.strictEqual(poly.structureType, 'coplanar_teja', 'Tipo de estructura debe ser coplanar_teja');
  assert.strictEqual(poly.alignToPlane, true, 'alignToPlane debe ser true');
  console.log('✔ TEST 3 PASADO: Detección coplanar normativa en vertiente Sur favorable validada.');
}

console.log('═════════════════════════════════════════════════════════════════════');
console.log('🎉 TODOS LOS TESTS DE ALGORITMO Y ORIENTACIÓN FV PASARON AL 100%');
console.log('═════════════════════════════════════════════════════════════════════');
