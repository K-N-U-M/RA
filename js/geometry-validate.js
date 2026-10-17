/**
 * ============================================================================
 * 📐 RA · GEOMETRY VALIDATE (P2 — validación de polígonos simples, anti "figura-8")
 * ============================================================================
 * Antes de P2 no existía NINGUNA validación de auto-intersección en la app:
 * una huella en forma de 8 se extruía en silencio y WallGeometry/PolygonGeometry
 * lanzaban errores tragados por catch silenciados (edificio invisible).
 *
 * Uso: window.isSimplePolygon(points) — acepta Cesium.Cartesian3[] o {x,y,z}[].
 * Proyecta a 2D descartando el eje de menor rango y detecta cruces propios
 * (proper crossings) O(n²). Polígonos <4 puntos no pueden auto-intersecarse.
 * ============================================================================
 */
(function (global) {
  'use strict';

  function toXY(points) {
    if (!Array.isArray(points) || points.length < 3) return null;
    const pts = [];
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (!p || typeof p.x !== 'number' || typeof p.y !== 'number' || typeof p.z !== 'number') return null;
      pts.push(p);
      cx += p.x; cy += p.y; cz += p.z;
    }
    const n = pts.length;
    cx /= n; cy /= n; cz /= n;

    let xy = null;
    // Proyección ortonormal exacta al plano propio del polígono (Newell 3D en marco local)
    // Resuelve distorsiones y colapsos en faldones inclinados (30°-60°) o paramentos verticales
    let localPts = null;
    if (typeof Cesium !== 'undefined' && Cesium.Transforms && typeof Cesium.Transforms.eastNorthUpToFixedFrame === 'function') {
      try {
        const center = new Cesium.Cartesian3(cx, cy, cz);
        const enu = Cesium.Transforms.eastNorthUpToFixedFrame(center);
        const inv = Cesium.Matrix4.inverse(enu, new Cesium.Matrix4());
        localPts = pts.map(p => {
          const loc = Cesium.Matrix4.multiplyByPoint(inv, p, new Cesium.Cartesian3());
          return { x: loc.x, y: loc.y, z: loc.z };
        });
      } catch (e) {
        localPts = null;
      }
    }
    if (!localPts) {
      localPts = pts.map(p => ({ x: p.x - cx, y: p.y - cy, z: p.z - cz }));
    }

    // Normal de Newell sobre los puntos locales para hallar la base ortonormal del polígono
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < n; i++) {
      const cur = localPts[i];
      const next = localPts[(i + 1) % n];
      nx += (cur.y - next.y) * (cur.z + next.z);
      ny += (cur.z - next.z) * (cur.x + next.x);
      nz += (cur.x - next.x) * (cur.y + next.y);
    }
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-9) return null;
    nx /= len; ny /= len; nz /= len;

    let ux = (Math.abs(nz) < 0.9) ? -ny : 0;
    let uy = (Math.abs(nz) < 0.9) ? nx : -nz;
    let uz = (Math.abs(nz) < 0.9) ? 0 : ny;
    const uLen = Math.hypot(ux, uy, uz) || 1;
    ux /= uLen; uy /= uLen; uz /= uLen;

    const vx = ny * uz - nz * uy;
    const vy = nz * ux - nx * uz;
    const vz = nx * uy - ny * ux;

    xy = localPts.map(p => ({
      x: p.x * ux + p.y * uy + p.z * uz,
      y: p.x * vx + p.y * vy + p.z * vz
    }));

    // Aceptar anillo cerrado (primer punto == último) sin falsos positivos
    const count = xy.length;
    if (count > 1 && Math.hypot(xy[0].x - xy[count - 1].x, xy[0].y - xy[count - 1].y) < 1e-4) {
      xy.pop();
    }
    return xy;
  }

  // Verifica si dos segmentos colineales no adyacentes se solapan
  function segmentsOverlapCollinear(a1, a2, b1, b2) {
    const d1x = a2.x - a1.x, d1y = a2.y - a1.y;
    const len1Sq = d1x * d1x + d1y * d1y;
    if (len1Sq < 1e-12) return false;
    const crossB1 = Math.abs((b1.x - a1.x) * d1y - (b1.y - a1.y) * d1x);
    const crossB2 = Math.abs((b2.x - a1.x) * d1y - (b2.y - a1.y) * d1x);
    if (crossB1 > 1e-4 || crossB2 > 1e-4) return false;
    const tB1 = ((b1.x - a1.x) * d1x + (b1.y - a1.y) * d1y) / len1Sq;
    const tB2 = ((b2.x - a1.x) * d1x + (b2.y - a1.y) * d1y) / len1Sq;
    const minB = Math.min(tB1, tB2);
    const maxB = Math.max(tB1, tB2);
    const E = 1e-4;
    return maxB > E && minB < 1 - E;
  }

  function distSqPointToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-12) return (px - x1) * (px - x1) + (py - y1) * (py - y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const qx = x1 + t * dx, qy = y1 + t * dy;
    return (px - qx) * (px - qx) + (py - qy) * (py - qy);
  }

  // Cruce propio estricto: detecta intersecciones propias y solapes colineales
  function properCross(a1, a2, b1, b2) {
    const d1x = a2.x - a1.x, d1y = a2.y - a1.y;
    const d2x = b2.x - b1.x, d2y = b2.y - b1.y;
    const denom = d1x * d2y - d1y * d2x;
    if (Math.abs(denom) < 1e-12) {
      return segmentsOverlapCollinear(a1, a2, b1, b2);
    }
    const t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / denom;
    const u = ((b1.x - a1.x) * d1y - (b1.y - a1.y) * d1x) / denom;
    const E = 1e-5;
    return t > E && t < 1 - E && u > E && u < 1 - E;
  }

  function isSimplePolygon(points) {
    const xy = toXY(points);
    if (!xy || xy.length < 3) return false;
    const n = xy.length;

    // 1. Detección de vértices no consecutivos coincidentes (pinzamiento en 8 / lazo interior)
    for (let i = 0; i < n; i++) {
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue;
        if (Math.hypot(xy[i].x - xy[j].x, xy[i].y - xy[j].y) < 0.05) {
          return false; // Vértice coincidente no consecutivo
        }
      }
    }

    // 2. Cruces propios entre aristas o solapes colineales
    for (let i = 0; i < n; i++) {
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue; // aristas adyacentes por el cierre
        if (properCross(xy[i], xy[(i + 1) % n], xy[j], xy[(j + 1) % n])) return false;
      }
    }

    // 3. Proximidad crítica punto-arista no adyacente (evita pinzamientos casi tangentes < 0.03 m)
    for (let i = 0; i < n; i++) {
      const pt = xy[i];
      for (let j = 0; j < n; j++) {
        // Excluir las dos aristas incidentes al vértice i
        if (j === i || (j + 1) % n === i) continue;
        const dSq = distSqPointToSegment(pt.x, pt.y, xy[j].x, xy[j].y, xy[(j + 1) % n].x, xy[(j + 1) % n].y);
        if (dSq < 0.0009) { // 0.03 m al cuadrado = 0.0009
          return false;
        }
      }
    }

    // 4. Verificación de área mínima no degenerada (fórmula de Shoelace)
    let area2D = 0;
    for (let i = 0; i < n; i++) {
      const cur = xy[i], next = xy[(i + 1) % n];
      area2D += (cur.x * next.y - next.x * cur.y);
    }
    if (Math.abs(area2D) * 0.5 < 0.10) {
      return false; // Área menor a 0.10 m² (polígono colapsado)
    }

    return true;
  }

  if (!global.RA) global.RA = {};
  global.RA.Geometry = { isSimplePolygon: isSimplePolygon };
  global.isSimplePolygon = isSimplePolygon;

})(typeof window !== 'undefined' ? window : this);
