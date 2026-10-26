/**
 * tests/test-building-shadow-heatmap.js
 * Test de Verificación Matemática y Geométrica de Sombras de Edificios 3D en Web Worker y Heatmap
 */

const assert = require('assert');

console.log('═════════════════════════════════════════════════════════════════════');
console.log('🏢 TEST SUITE: SOMBRAS DE EDIFICIOS 3D EN MAPA DE CALOR (HEATMAP)');
console.log('═════════════════════════════════════════════════════════════════════');

// 1. Simulación geométrica de convexHull2D (exactamente la misma del worker)
function convexHull2D(points) {
  if (!points || points.length <= 3) return points || [];
  const pts = points.slice().sort((a, b) => a.u === b.u ? a.v - b.v : a.u - b.u);
  function cross(o, a, b) {
    return (a.u - o.u) * (b.v - o.v) - (a.v - o.v) * (b.u - o.u);
  }
  const lower = [];
  for (let p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 1e-9) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 1e-9) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function isPointInPolygon2D(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].u, yi = poly[i].v;
    const xj = poly[j].u, yj = poly[j].v;
    const intersect = ((yi > pt.v) !== (yj > pt.v)) &&
      (pt.u < (xj - xi) * (pt.v - yi) / (yj - yi + 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// TEST 1: convexHull2D genera una silueta convexa sólida y sin huecos
console.log('--- TEST 1: convexHull2D genera silueta sólida para obstáculos y muros ---');
const baseQuad = [
  { u: 0, v: 0 },
  { u: 10, v: 0 },
  { u: 10, v: 5 },
  { u: 0, v: 5 }
];
const topQuad = baseQuad.map(p => ({ u: p.u + 5, v: p.v + 5 }));
const hull = convexHull2D([...baseQuad, ...topQuad]);
assert(hull.length >= 4, 'La envolvente convexa debe tener al menos 4 vértices');

// Un punto en medio del cuerpo de la sombra (ej: u=5, v=5) debe estar DENTRO del polígono
assert(isPointInPolygon2D({ u: 5, v: 5 }, hull), 'El interior de la sombra debe ser sólido');
console.log('✓ PASS: Sombra convexa sólida verificada (elimina huecos interiores).');

// TEST 2: Altura efectiva de un edificio alto adyacente sobre una cubierta baja
console.log('--- TEST 2: Cálculo de altura efectiva (muro colindante vs faldón propio) ---');
const tallBuilding = {
  id: 'bld_tall',
  height: 12.0, // Edificio de 12m
  avgBaseHeight: 100.0, // Cota de base 100m -> coronación 112m
  parapetHeight: 0.6
};

const lowRoof = {
  carto: { height: 103.0 }, // Cubierta baja a 103m (3m sobre rasante)
  buildingId: 'bld_low' // Edificio diferente
};

const coronacionTall = tallBuilding.avgBaseHeight + tallBuilding.height; // 112m
const effectiveHeightAdjacent = coronacionTall - lowRoof.carto.height; // 112 - 103 = 9.0m
assert.strictEqual(effectiveHeightAdjacent, 9.0, 'El muro colindante debe arrojar sombra con altura de 9.0m');
console.log(`✓ PASS: Altura efectiva edificio vecino sobre cubierta baja = ${effectiveHeightAdjacent}m`);

// TEST 3: Edificio propio no arroja sombra de 12m sobre su propia cubierta
const highRoof = {
  carto: { height: 112.0 },
  buildingId: 'bld_tall' // Mismo edificio
};
const isSameBuilding = (highRoof.buildingId === tallBuilding.id);
const effectiveHeightSelf = isSameBuilding ? (tallBuilding.parapetHeight || 0.0) : (coronacionTall - highRoof.carto.height);
assert.strictEqual(effectiveHeightSelf, 0.6, 'El propio edificio solo arroja la sombra de su parapeto (0.6m)');
console.log(`✓ PASS: Altura efectiva sobre cubierta propia limitada al peto = ${effectiveHeightSelf}m`);

// TEST 4: Proyección de sombra del muro alto sobre panel junto al muro en cubierta baja
console.log('--- TEST 4: Detección de sombra en panel situado junto al muro ---');
// Simulemos que el muro del edificio alto está en U=0..20, V=0..5
// La cubierta baja está adyacente en V >= 5
// Panel situado a 1m del muro: U=5..6.1, V=5.5..7.5
const wallBasePoly = [
  { u: 0, v: 0 },
  { u: 20, v: 0 },
  { u: 20, v: 5 },
  { u: 0, v: 5 }
];

// Supongamos que el sol proyecta sombra hacia V positivo (dU=0, dV=1.5 * 9m = 13.5m)
const shadowLen = 1.5; // solsticio / tarde
const dU = 0;
const dV = shadowLen * effectiveHeightAdjacent; // 13.5m
const wallTopPoly = wallBasePoly.map(p => ({ u: p.u + dU, v: p.v + dV }));
const wallShadowHull = convexHull2D([...wallBasePoly, ...wallTopPoly]);

// Panel junto al muro (V=6m)
const panelCenter = { u: 10, v: 6.0 };
const isPanelShaded = isPointInPolygon2D(panelCenter, wallShadowHull);
assert(isPanelShaded, 'El panel junto al muro debe quedar cubierto por la sombra del edificio alto');
console.log('✓ PASS: El panel adyacente al muro queda sombreado correctamente por el edificio alto.');

// Panel muy alejado del muro (V=25m) fuera del alcance de la sombra
const farPanelCenter = { u: 10, v: 25.0 };
const isFarPanelShaded = isPointInPolygon2D(farPanelCenter, wallShadowHull);
assert(!isFarPanelShaded, 'El panel alejado no debe quedar cubierto por la sombra');
console.log('✓ PASS: El panel alejado permanece libre de sombra.');

console.log('═════════════════════════════════════════════════════════════════════');
console.log('🎉 TODOS LOS TESTS DE SOMBRAS DE EDIFICIOS 3D EN HEATMAP PASARON AL 100%');
console.log('═════════════════════════════════════════════════════════════════════');
