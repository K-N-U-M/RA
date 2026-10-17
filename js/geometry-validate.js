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
    // 1. Proyección ortonormal exacta mediante ENU local si Cesium está presente
    if (typeof Cesium !== 'undefined' && Cesium.Transforms && typeof Cesium.Transforms.eastNorthUpToFixedFrame === 'function') {
      try {
        const center = new Cesium.Cartesian3(cx, cy, cz);
        const enu = Cesium.Transforms.eastNorthUpToFixedFrame(center);
        const inv = Cesium.Matrix4.inverse(enu, new Cesium.Matrix4());
        xy = pts.map(p => {
          const loc = Cesium.Matrix4.multiplyByPoint(inv, p, new Cesium.Cartesian3());
          return { x: loc.x, y: loc.y };
        });
      } catch (e) {
        xy = null;
      }
    }

    // 2. Fallback algebraico con normal de Newell y base ortonormal tangencial
    if (!xy) {
      let nx = 0, ny = 0, nz = 0;
      for (let i = 0; i < n; i++) {
        const cur = pts[i];
        const next = pts[(i + 1) % n];
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

      xy = pts.map(p => {
        const dx = p.x - cx, dy = p.y - cy, dz = p.z - cz;
        return {
          x: dx * ux + dy * uy + dz * uz,
          y: dx * vx + dy * vy + dz * vz
        };
      });
    }

    // Aceptar anillo cerrado (primer punto == último) sin falsos positivos
    const count = xy.length;
    if (count > 1 && Math.hypot(xy[0].x - xy[count - 1].x, xy[0].y - xy[count - 1].y) < 1e-4) {
      xy.pop();
    }
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

    // 2. Cruces propios entre aristas
    for (let i = 0; i < n; i++) {
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue; // aristas adyacentes por el cierre
        if (properCross(xy[i], xy[(i + 1) % n], xy[j], xy[(j + 1) % n])) return false;
      }
    }

    // 3. Verificación de área mínima no degenerada (fórmula de Shoelace)
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
