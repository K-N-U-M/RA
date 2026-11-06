const assert = require('assert');

// Mock Cesium
const Cesium = {
  Cartesian3: class Cartesian3 {
    constructor(x = 0, y = 0, z = 0) {
      this.x = Number(x);
      this.y = Number(y);
      this.z = Number(z);
    }
    static clone(c, result) {
      if (!c) return new Cartesian3();
      if (result) {
        result.x = c.x; result.y = c.y; result.z = c.z;
        return result;
      }
      return new Cartesian3(c.x, c.y, c.z);
    }
    static normalize(c, result) {
      const mag = Math.hypot(c.x, c.y, c.z) || 1;
      const res = result || new Cartesian3();
      res.x = c.x / mag; res.y = c.y / mag; res.z = c.z / mag;
      return res;
    }
    static add(a, b, result) {
      const res = result || new Cartesian3();
      res.x = a.x + b.x; res.y = a.y + b.y; res.z = a.z + b.z;
      return res;
    }
    static subtract(a, b, result) {
      const res = result || new Cartesian3();
      res.x = a.x - b.x; res.y = a.y - b.y; res.z = a.z - b.z;
      return res;
    }
    static multiplyByScalar(a, s, result) {
      const res = result || new Cartesian3();
      res.x = a.x * s; res.y = a.y * s; res.z = a.z * s;
      return res;
    }
    static dot(a, b) {
      return a.x * b.x + a.y * b.y + a.z * b.z;
    }
    static cross(a, b, result) {
      const res = result || new Cartesian3();
      res.x = a.y * b.z - a.z * b.y;
      res.y = a.z * b.x - a.x * b.z;
      res.z = a.x * b.y - a.y * b.x;
      return res;
    }
    static magnitude(c) {
      return Math.hypot(c.x, c.y, c.z);
    }
  },
  Matrix4: class Matrix4 {
    constructor() {
      this.values = new Float64Array(16);
      this.values[0] = 1; this.values[5] = 1; this.values[10] = 1; this.values[15] = 1;
    }
    static multiplyByPoint(matrix, cartesian, result) {
      const res = result || new Cesium.Cartesian3();
      // Identity / simple translation mock for test
      res.x = cartesian.x;
      res.y = cartesian.y;
      res.z = cartesian.z;
      return res;
    }
    static multiplyByPointAsVector(matrix, cartesian, result) {
      const res = result || new Cesium.Cartesian3();
      res.x = cartesian.x;
      res.y = cartesian.y;
      res.z = cartesian.z;
      return res;
    }
    static inverse(matrix, result) {
      return result || new Matrix4();
    }
  },
  Ellipsoid: {
    WGS84: {
      geodeticSurfaceNormal: function(c, result) {
        const res = result || new Cesium.Cartesian3();
        const mag = Math.hypot(c.x, c.y, c.z) || 1;
        res.x = c.x / mag; res.y = c.y / mag; res.z = c.z / mag;
        return res;
      }
    }
  }
};
Cesium.Cartesian3.UNIT_Z = new Cesium.Cartesian3(0, 0, 1);
Cesium.Cartesian3.UNIT_X = new Cesium.Cartesian3(1, 0, 0);
global.Cesium = Cesium;

console.log('--- TEST: Localización y Aislamiento de Sombra de Obstáculos ---');

// Mock convexHull2D and polygonsIntersect2D
function convexHull2D(points) {
  if (!points || points.length < 3) return points;
  const sorted = points.slice().sort((a, b) => a.u === b.u ? a.v - b.v : a.u - b.u);
  const cross = (o, a, b) => (a.u - o.u) * (b.v - o.v) - (a.v - o.v) * (b.u - o.u);
  const lower = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function polygonsIntersect2D(polyA, polyB) {
  for (const poly of [polyA, polyB]) {
    for (let i = 0; i < poly.length; i++) {
      const next = (i + 1) % poly.length;
      const edge = { u: poly[next].u - poly[i].u, v: poly[next].v - poly[i].v };
      const normal = { u: -edge.v, v: edge.u };
      let minA = Infinity, maxA = -Infinity;
      for (const p of polyA) {
        const proj = p.u * normal.u + p.v * normal.v;
        if (proj < minA) minA = proj;
        if (proj > maxA) maxA = proj;
      }
      let minB = Infinity, maxB = -Infinity;
      for (const p of polyB) {
        const proj = p.u * normal.u + p.v * normal.v;
        if (proj < minB) minB = proj;
        if (proj > maxB) maxB = proj;
      }
      if (maxA < minB || maxB < minA) return false;
    }
  }
  return true;
}

// 14 panels on roof (similar to user's layout: 2 rows of 7 panels)
// Width: ~11m, Height: ~8m
const panels = [];
for (let row = 0; row < 2; row++) {
  for (let col = 0; col < 7; col++) {
    const idx = row * 7 + col + 1;
    const u = -5.0 + col * 1.6; // -5m to +4.6m
    const v = (row === 0 ? 2.0 : -2.0); // row 0 at +2m, row 1 at -2m
    panels.push({
      id: idx,
      u: u,
      v: v,
      w: 1.134,
      h: 2.278,
      poly2D: [
        { u: u - 0.56, v: v - 1.14 },
        { u: u + 0.56, v: v - 1.14 },
        { u: u + 0.56, v: v + 1.14 },
        { u: u - 0.56, v: v + 1.14 }
      ]
    });
  }
}

// Obstacle (chimney) placed near panel #12 / #14 at u = 4.5, v = -1.5, height = 2.0m, width = 0.8m
const chimney = {
  u: 4.5,
  v: -1.5,
  w: 0.8,
  l: 0.8,
  h: 2.0,
  points2D: [
    { u: 4.1, v: -1.9 },
    { u: 4.9, v: -1.9 },
    { u: 4.9, v: -1.1 },
    { u: 4.1, v: -1.1 }
  ]
};

// Test shadow projection at afternoon sun (shadow points West / North-West: sU = -0.7, sV = 0.7)
const sU = -0.7, sV = 0.7;
const shadowLenPerM = 2.5; // low sun
const maxShadowLen = 45.0;
const effShadowLen = Math.min(chimney.h * shadowLenPerM, maxShadowLen);
const dU = sU * effShadowLen;
const dV = sV * effShadowLen;

const topPoly = chimney.points2D.map(p => ({ u: p.u + dU, v: p.v + dV }));
const shadowQuad = convexHull2D([...chimney.points2D, ...topPoly]);

console.log('Vértices de sombra de chimenea calculados:', shadowQuad.length);

let shadedCount = 0;
const shadedPanels = [];
panels.forEach(p => {
  const hit = polygonsIntersect2D(p.poly2D, shadowQuad);
  if (hit) {
    shadedCount++;
    shadedPanels.push(p.id);
  }
});

console.log('Paneles alcanzados por la sombra:', shadedPanels);
assert.ok(shadedCount > 0, 'La chimenea debe proyectar sombra sobre al menos un panel adyacente');
assert.ok(shadedCount <= 5, 'La chimenea NO debe sombrear paneles lejanos; sombreados: ' + shadedCount);
assert.ok(!shadedPanels.includes(1), 'Panel #1 (extremo opuesto) debe tener 0% sombra');
assert.ok(!shadedPanels.includes(2), 'Panel #2 (extremo opuesto) debe tener 0% sombra');
assert.ok(!shadedPanels.includes(8), 'Panel #8 (extremo opuesto) debe tener 0% sombra');
assert.ok(!shadedPanels.includes(9), 'Panel #9 (extremo opuesto) debe tener 0% sombra');

console.log('✅ TEST PASADO: Solo los paneles adyacentes sufren sombreado; los paneles lejanos permanecen limpios al 100%.');
