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

    if (customBuildingDims) {
      H = customBuildingDims.H || H;
      W = customBuildingDims.W || W;
      L = customBuildingDims.L || L;
      xSetback = customBuildingDims.xSetback !== undefined ? customBuildingDims.xSetback : xSetback;
    } else {
            // Detectar el edificio de soporte real que contiene o subyace a la turbina
      var blds = (typeof global.buildings !== 'undefined' && Array.isArray(global.buildings))
        ? global.buildings
        : [];
      var matchedBld = null;
      var tPos = turbineInstance.positionCartographic;
      var minDist = Infinity;

      if (blds.length > 0 && tPos) {
        for (var bi = 0; bi < blds.length; bi++) {
          var b = blds[bi];
          if (!b || b.visible === false) continue;
          var pts = Array.isArray(b.points) ? b.points : (Array.isArray(b.polygonPoints) ? b.polygonPoints : null);
          if (!pts || pts.length === 0) continue;

          var cx = 0, cy = 0, cz = 0;
          for (var pi = 0; pi < pts.length; pi++) {
            cx += pts[pi].x; cy += pts[pi].y; cz += pts[pi].z;
          }
          var center = { x: cx / pts.length, y: cy / pts.length, z: cz / pts.length };

          if (typeof global.Cesium !== 'undefined' && global.Cesium.Cartographic) {
            try {
              var cCarto = global.Cesium.Cartographic.fromCartesian(center);
              if (cCarto) {
                var dLatM = (tPos.latitudeRad - cCarto.latitude) * 6371000;
                var dLonM = (tPos.longitudeRad - cCarto.longitude) * 6371000 * Math.cos(tPos.latitudeRad);
                var distM = Math.sqrt(dLatM * dLatM + dLonM * dLonM);
                if (distM < minDist) {
                  minDist = distM;
                  matchedBld = b;
                }
              }
            } catch (eM) {}
          }
        }
      }

      if (!matchedBld && blds.length > 0) matchedBld = blds[0];

      if (matchedBld) {
        if (Number(matchedBld.height) > 0) H = Number(matchedBld.height);
        if (Number(matchedBld.rectLadoA) > 0) W = Number(matchedBld.rectLadoA);
        if (Number(matchedBld.rectLadoB) > 0) L = Number(matchedBld.rectLadoB);
        if (isFinite(minDist) && minDist < Math.max(W, L)) {
          xSetback = Math.max(0.5, Math.min(L * 0.85, minDist));
        } else {
          xSetback = Math.max(1.0, L * 0.25);
        }
      } else if (global.WP && Array.isArray(global.WP.polylines) && global.WP.polylines.length > 0) {
        var p0 = global.WP.polylines[0];
        if (p0 && Number(p0.area) > 0) {
          var side = Math.sqrt(p0.area);
          W = Math.max(6, side);
          L = Math.max(6, side);
          xSetback = Math.max(1.0, side * 0.25);
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
