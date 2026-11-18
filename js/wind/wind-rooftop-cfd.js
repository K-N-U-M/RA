/**
 * ═══════════════════════════════════════════════════════════════════════
 * wind-rooftop-cfd.js — Modelo Analítico de Capa Límite, Burbuja de
 *                       Separación en Cubierta y Speed-Up (Wilson, 1979)
 * ═══════════════════════════════════════════════════════════════════════
 * Evalúa la envolvente turbulenta sobre cubiertas industriales o edificios
 * 3D y calcula el factor de aceleración (speed-up) e intensidad de
 * turbulencia añadida en la cota del rotor.
 * @version 2.0.0  2026-10-24
 */
(function (global) {
  'use strict';

  var RAWind = global.RAWind || (global.RAWind = {});

  /**
   * Evalúa la aerodinámica sobre una cubierta de edificio (modelo de Wilson 1979 / EN 1991-1-4).
   * @param {number} H - Altura del edificio desde el suelo (m)
   * @param {number} W - Anchura de la fachada enfrentada al viento (m)
   * @param {number} L - Longitud del edificio en la dirección del viento (m)
   * @param {number} xSetback - Distancia desde el borde de barlovento hacia el interior (m)
   * @param {number} zElevation - Altura del buje sobre el plano de la cubierta (m)
   */
  function evaluateRooftopAerodynamics(H, W, L, xSetback, zElevation) {
    H = Math.max(1.0, Number(H) || 6.0);
    W = Math.max(2.0, Number(W) || 15.0);
    L = Math.max(2.0, Number(L) || 20.0);
    xSetback = Math.max(0.0, Number(xSetback) || 0.0);
    zElevation = Math.max(0.5, Number(zElevation) || 6.0);

    var C = RAWind.CONSTANTS || {};
    var bubbleLenCoef = C.ROOFTOP_BUBBLE_LENGTH_COEF || 0.9;
    var bubbleHeightCoef = C.ROOFTOP_BUBBLE_HEIGHT_COEF || 0.22;
    var maxSpeedupEdge = C.ROOFTOP_SPEEDUP_MAX || 1.30;
    var insideBubbleSpeedup = C.ROOFTOP_INSIDE_BUBBLE_SPEEDUP || 0.35;

    // Longitud de escala característica de la cara de barlovento Sc = H^(2/3) * W^(1/3) o min/max
    var Sc = Math.pow(Math.min(H, W), 2 / 3) * Math.pow(Math.max(H, W), 1 / 3);
    var Lc = bubbleLenCoef * Sc;      // Longitud de reattachment de la burbuja (m)
    var Hc = bubbleHeightCoef * Sc;   // Altura máxima del vórtice sobre arista (m)

    var bubbleHeightAtX = 0;
    if (xSetback >= 0 && xSetback <= Lc && Lc > 0.01) {
      // Perfil parabólico de la capa de cortante separada
      var normX = xSetback / Lc;
      bubbleHeightAtX = Hc * (1 - normX * normX);
    }

    var insideSeparationBubble = zElevation <= bubbleHeightAtX;
    var speedupFactor = 1.0;

    if (!insideSeparationBubble) {
      var deltaZ = zElevation - bubbleHeightAtX;
      var decayLength = Math.max(0.5, 0.5 * Hc);
      var edgeBoost = 1.0 + (maxSpeedupEdge - 1.0) * Math.exp(-xSetback / Math.max(1.0, 0.8 * Sc));
      speedupFactor = 1.0 + (edgeBoost - 1.0) * Math.exp(-deltaZ / decayLength);
    } else {
      speedupFactor = insideBubbleSpeedup;
    }

    var addedTurbulenceIntensity = insideSeparationBubble
      ? 0.45
      : Math.min(0.35, 0.12 * (Hc / Math.max(zElevation, 0.25)));

    var minRecommendedHubHeightM = Math.ceil(Math.max(Hc * 1.35, bubbleHeightAtX + 1.5) * 2) / 2;

    return {
      characteristicScaleScM: Number(Sc.toFixed(2)),
      bubbleLengthLcM: Number(Lc.toFixed(2)),
      separationBubbleMaxHeightM: Number(Hc.toFixed(2)),
      bubbleHeightAtX: Number(bubbleHeightAtX.toFixed(2)),
      insideSeparationBubble: insideSeparationBubble,
      speedupFactor: Number(Math.max(speedupFactor, 0.2).toFixed(3)),
      addedTurbulenceIntensity: Number(addedTurbulenceIntensity.toFixed(3)),
      minRecommendedHubHeightM: minRecommendedHubHeightM,
      isRecommendedMicrositing: !insideSeparationBubble && speedupFactor >= 1.05
    };
  }

  /**
   * Detecta el contexto de cubierta/edificio para una instancia de aerogenerador.
   * Si mountingType === 'rooftop' o si la turbina está situada sobre/cerca de un edificio 3D,
   * calcula los parámetros geométricos reales (H, W, L, xSetback).
   */
  function evaluateTurbineRooftopContext(turbineInstance, customBuildingDims) {
    if (!turbineInstance) return null;

    var hubH = (turbineInstance.supportStructure && turbineInstance.supportStructure.hubHeightM)
      ? turbineInstance.supportStructure.hubHeightM
      : 12;

    // Si está en suelo firme y no se fuerza evaluación de cubierta, devolver flujo libre
    if (turbineInstance.mountingType !== 'rooftop' && !customBuildingDims) {
      return {
        isRooftop: false,
        insideSeparationBubble: false,
        bubbleHeightAtX: 0,
        separationBubbleMaxHeightM: 0,
        speedupFactor: 1.0,
        addedTurbulenceIntensity: 0.10,
        minRecommendedHubHeightM: hubH,
        isRecommendedMicrositing: true
      };
    }

    var H = 7.5;
    var W = 18.0;
    var L = 24.0;
    var xSetback = 3.5;

    function _pointInPoly2D(px, py, poly) {
      var inside = false;
      for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        var xi = poly[i].x, yi = poly[i].y;
        var xj = poly[j].x, yj = poly[j].y;
        var intersect = ((yi > py) !== (yj > py)) && (px < ((xj - xi) * (py - yi)) / ((yj - yi) || 1e-12) + xi);
        if (intersect) inside = !inside;
      }
      return inside;
    }

    function _upwindEdgeDistance(px, py, poly, vx, vy) {
      // Rayo desde (px, py) en contra del viento (-vx, -vy) hasta la arista de barlovento
      var minT = Infinity;
      var rx = -vx, ry = -vy;
      for (var i = 0; i < poly.length; i++) {
        var a = poly[i];
        var b = poly[(i + 1) % poly.length];
        var sx = b.x - a.x, sy = b.y - a.y;
        var denom = rx * sy - ry * sx;
        if (Math.abs(denom) < 1e-9) continue;
        var qpx = a.x - px, qpy = a.y - py;
        var t = (qpx * sy - qpy * sx) / denom;
        var u = (qpx * ry - qpy * rx) / denom;
        if (t >= 0 && u >= -1e-4 && u <= 1.0001 && t < minT) {
          minT = t;
        }
      }
      return isFinite(minT) ? minT : null;
    }

    if (customBuildingDims) {
      H = customBuildingDims.H || H;
      W = customBuildingDims.W || W;
      L = customBuildingDims.L || L;
      xSetback = customBuildingDims.xSetback !== undefined ? customBuildingDims.xSetback : xSetback;
    } else {
      // Detectar el edificio de soporte real mediante contención poligonal 2D real (fallback por cercanía solo en modo rooftop)
      var blds = (typeof global.buildings !== 'undefined' && Array.isArray(global.buildings))
        ? global.buildings
        : [];
      var matchedBld = null;
      var matchedPoly2D = null;
      var matchedBldCenterCarto = null;
      var matchedRoofAzDeg = null;
      var tPos = turbineInstance.positionCartographic;
      var minDist = Infinity;

      if (blds.length > 0 && tPos && typeof global.Cesium !== 'undefined' && global.Cesium.Cartographic) {
        var cosLat = Math.max(0.1, Math.cos(tPos.latitudeRad));
        for (var bi = 0; bi < blds.length; bi++) {
          var b = blds[bi];
          if (!b || b.visible === false) continue;
          var pts = Array.isArray(b.points) ? b.points : (Array.isArray(b.polygonPoints) ? b.polygonPoints : null);
          if (!pts || pts.length < 3) continue;

          try {
            var polyMeters = [];
            var sx = 0, sy = 0;
            for (var pi = 0; pi < pts.length; pi++) {
              var pc = global.Cesium.Cartographic.fromCartesian(pts[pi]);
              if (!pc) continue;
              var mx = (pc.longitude - tPos.longitudeRad) * 6371000 * cosLat;
              var my = (pc.latitude - tPos.latitudeRad) * 6371000;
              polyMeters.push({ x: mx, y: my });
              sx += pts[pi].x; sy += pts[pi].y;
            }
            if (polyMeters.length < 3) continue;
            var inside = _pointInPoly2D(0, 0, polyMeters);
            var cx = 0, cy = 0;
            polyMeters.forEach(function (m) { cx += m.x; cy += m.y; });
            cx /= polyMeters.length; cy /= polyMeters.length;
            var distM = Math.hypot(cx, cy);
            if (inside) {
              matchedBld = b;
              matchedPoly2D = polyMeters;
              matchedRoofAzDeg = (typeof b.roofAzimuth === 'number') ? b.roofAzimuth : ((typeof b.azimuthDeg === 'number') ? b.azimuthDeg : null);
              minDist = 0;
              break;
            }
            if (distM < minDist) {
              minDist = distM;
              matchedBld = b;
              matchedPoly2D = polyMeters;
              matchedRoofAzDeg = (typeof b.roofAzimuth === 'number') ? b.roofAzimuth : ((typeof b.azimuthDeg === 'number') ? b.azimuthDeg : null);
            }
          } catch (eM) {}
        }
      }

      var windDirDeg = (RAWind.Resource && typeof RAWind.Resource.getConfig === 'function')
        ? (Number(RAWind.Resource.getConfig().prevailingWindDirDeg) || 270)
        : 270;
      var windRad = windDirDeg * Math.PI / 180.0;
      // Vector hacia donde SOPLA el viento desde barlovento (windDirDeg es de donde VIENE el viento)
      var blowVx = -Math.sin(windRad);
      var blowVy = -Math.cos(windRad);

      if (matchedBld && matchedPoly2D) {
        if (Number(matchedBld.height) > 0) H = Number(matchedBld.height);
        var azRadB = ((typeof matchedRoofAzDeg === 'number') ? matchedRoofAzDeg : 0) * Math.PI / 180.0;
        var cosA = Math.cos(azRadB), sinA = Math.sin(azRadB);
        var minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
        matchedPoly2D.forEach(function (p2) {
          var u = p2.x * cosA - p2.y * sinA;
          var v = p2.x * sinA + p2.y * cosA;
          if (u < minU) minU = u; if (u > maxU) maxU = u;
          if (v < minV) minV = v; if (v > maxV) maxV = v;
        });
        var spanU = Math.max(2.0, maxU - minU);
        var spanV = Math.max(2.0, maxV - minV);
        var relWindRad = windRad - azRadB;
        W = Number(matchedBld.rectLadoA) > 0 ? Number(matchedBld.rectLadoA) : (Math.abs(Math.cos(relWindRad)) * spanU + Math.abs(Math.sin(relWindRad)) * spanV);
        L = Number(matchedBld.rectLadoB) > 0 ? Number(matchedBld.rectLadoB) : (Math.abs(Math.sin(relWindRad)) * spanU + Math.abs(Math.cos(relWindRad)) * spanV);

        var edgeDist = _upwindEdgeDistance(0, 0, matchedPoly2D, blowVx, blowVy);
        if (edgeDist !== null) {
          xSetback = Math.max(0.5, edgeDist);
        } else {
          xSetback = Math.max(1.0, L * 0.25);
        }
      } else if (global.WP && Array.isArray(global.WP.polylines) && global.WP.polylines.length > 0 && tPos && typeof global.Cesium !== 'undefined' && global.Cesium.Cartographic) {
        var matchedPolyObj = null;
        var matchedRoofPoly2D = null;
        for (var wi = 0; wi < global.WP.polylines.length; wi++) {
          var wp = global.WP.polylines[wi];
          if (!wp || !Array.isArray(wp.points) || wp.points.length < 3) continue;
          var wpM = wp.points.map(function (pt) {
            var pc2 = global.Cesium.Cartographic.fromCartesian(pt);
            var cosL2 = Math.max(0.1, Math.cos(tPos.latitudeRad));
            return {
              x: (pc2.longitude - tPos.longitudeRad) * 6371000 * cosL2,
              y: (pc2.latitude - tPos.latitudeRad) * 6371000
            };
          });
          if (_pointInPoly2D(0, 0, wpM)) {
            matchedPolyObj = wp;
            matchedRoofPoly2D = wpM;
            break;
          }
        }
        var targetPoly = matchedPolyObj || global.WP.polylines[0];
        if (targetPoly && Number(targetPoly.area) > 0) {
          var side = Math.sqrt(targetPoly.area);
          W = Math.max(6, side);
          L = Math.max(6, side);
          if (matchedRoofPoly2D) {
            var edWp = _upwindEdgeDistance(0, 0, matchedRoofPoly2D, blowVx, blowVy);
            xSetback = edWp !== null ? Math.max(0.5, edWp) : Math.max(1.0, side * 0.25);
          } else {
            xSetback = Math.max(1.0, side * 0.25);
          }
        }
      }
    }

    var res = evaluateRooftopAerodynamics(H, W, L, xSetback, hubH);
    res.isRooftop = true;
    res.buildingHeightM = H;
    res.buildingWidthM = W;
    res.buildingLengthM = L;
    res.setbackM = xSetback;
    return res;
  }

  var RooftopCFD = {
    evaluateRooftopAerodynamics: evaluateRooftopAerodynamics,
    evaluateTurbineRooftopContext: evaluateTurbineRooftopContext
  };

  RAWind.RooftopCFD = RooftopCFD;
  RAWind.evaluateRooftopAerodynamics = evaluateRooftopAerodynamics;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = RooftopCFD;
  }

})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : global));
