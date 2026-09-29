/**
 * ============================================================================
 * 📐 RA · GEOMETRY VALIDATE (P2 — validación de polígonos simples, anti "figura-8")
 * ============================================================================
 * Antes de P2 no existía NINGUNA validación de auto-intersección en la app:
 * una huella en forma de 8 se extruía en silencio y WallGeometry/PolygonGeometry
 * lanzaban errores tragados por catch silenciados (edificio invisible).
 *
 * Uso: window.isSimplePolygon(points) — acepta Cesium.Cartesian3[] o {x,y,z}[].
 * Proyecta a 2D descartando el eje de mayor rango y detecta cruces propios
 * (proper crossings) O(n²). Polígonos <4 puntos no pueden auto-intersecarse.
 * ============================================================================
 */
(function (global) {
  'use strict';

  function toXY(points) {
    if (!Array.isArray(points) || points.length < 3) return null;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
    const pts = [];
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (!p || typeof p.x !== 'number' || typeof p.y !== 'number' || typeof p.z !== 'number') return null;
      pts.push(p);
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
      if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
    }
    const rx = maxX - minX, ry = maxY - minY, rz = maxZ - minZ;
    // Proyección plana: descartar el eje de MENOR rango (dirección normal al plano del polígono).
    // Descartar el de mayor rango colapsaría polígonos planos en ese eje (p.ej. z constante).
    let drop;
    if (rx <= ry && rx <= rz) drop = 'x'; else if (ry <= rz) drop = 'y'; else drop = 'z';
    const xy = pts.map(p => drop === 'x' ? { x: p.y, y: p.z } : (drop === 'y' ? { x: p.x, y: p.z } : { x: p.x, y: p.y }));
    // Aceptar anillo cerrado (primer punto == último) sin falsos positivos
    const n = xy.length;
    if (n > 1 && Math.abs(xy[0].x - xy[n - 1].x) < 1e-9 && Math.abs(xy[0].y - xy[n - 1].y) < 1e-9) xy.pop();
    return xy;
  }

  // Cruce propio estricto: excluye toques en extremos (vértices compartidos) y colineales
  function properCross(a1, a2, b1, b2) {
    const d1x = a2.x - a1.x, d1y = a2.y - a1.y;
    const d2x = b2.x - b1.x, d2y = b2.y - b1.y;
    const denom = d1x * d2y - d1y * d2x;
    if (Math.abs(denom) < 1e-12) return false;
    const t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / denom;
    const u = ((b1.x - a1.x) * d1y - (b1.y - a1.y) * d1x) / denom;
    const E = 1e-9;
    return t > E && t < 1 - E && u > E && u < 1 - E;
  }

  function isSimplePolygon(points) {
    const xy = toXY(points);
    if (!xy || xy.length < 4) return true;
    const n = xy.length;
    for (let i = 0; i < n; i++) {
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue; // aristas adyacentes por el cierre
        if (properCross(xy[i], xy[(i + 1) % n], xy[j], xy[(j + 1) % n])) return false;
      }
    }
    return true;
  }

  if (!global.RA) global.RA = {};
  global.RA.Geometry = { isSimplePolygon: isSimplePolygon };
  global.isSimplePolygon = isSimplePolygon;

})(typeof window !== 'undefined' ? window : this);
