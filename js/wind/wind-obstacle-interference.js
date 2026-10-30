/**
 * wind-obstacle-interference.js
 * Evaluador Modular de Interferencias Aerodinámicas y Sombras de Viento 3D
 * según modelos analíticos de WAsP / Taylor (obstáculos porosos y sólidos).
 * 
 * Evalúa árboles, chimeneas, edificios y obstáculos modelados sobre la escena
 * de forma universal (apoyo agnóstico: suelo o cubierta).
 * 
 * @version 1.0.1 2026-10-30
 */
(function (global) {
  'use strict';

  var RAWind = global.RAWind || (global.RAWind = {});

  /**
   * Extrae la posición tridimensional en metros locales (o cartesiana) y dimensiones
   * de todos los obstáculos activos en la escena.
   */
  function extractSceneObstacles() {
    var list = [];
    var rawObs = (typeof global.obstacles !== 'undefined' && Array.isArray(global.obstacles))
      ? global.obstacles
      : [];

    rawObs.forEach(function (o) {
      if (!o || o.visible === false) return;
      var isTree = (o.type === 'tree' || o.isTree);
      var w = Math.max(0.4, Number(o.w || (isTree ? 3.0 : 1.0)));
      var l = Math.max(0.4, Number(o.l || (isTree ? 3.0 : 1.0)));
      var h = Math.max(0.5, Number(o.h || (isTree ? 6.0 : 1.5)));

      // Extraer posición Cartográfica o Cartesiana WGS84
      var cartesian = null;
      var carto = null;

      if (o.cartesian && typeof o.cartesian.x === 'number') {
        cartesian = o.cartesian;
      } else if (typeof global.Cesium !== 'undefined' && typeof global.getObstacleActivePlane === 'function') {
        try {
          var wp = global.getObstacleActivePlane(o);
          if (wp && wp.origin && wp.normal && wp.uVec && wp.vVec) {
            var Cesium = global.Cesium;
            var uVec = Cesium.Cartesian3.normalize(wp.uVec, new Cesium.Cartesian3());
            var vVec = Cesium.Cartesian3.normalize(wp.vVec, new Cesium.Cartesian3());
            var bc = Cesium.Cartesian3.add(
              wp.origin,
              Cesium.Cartesian3.add(
                Cesium.Cartesian3.multiplyByScalar(uVec, o.u || 0, new Cesium.Cartesian3()),
                Cesium.Cartesian3.multiplyByScalar(vVec, o.v || 0, new Cesium.Cartesian3()),
                new Cesium.Cartesian3()
              ),
              new Cesium.Cartesian3()
            );
            cartesian = bc;
          }
        } catch (eWp) {}
      }

      if (cartesian && typeof global.Cesium !== 'undefined' && global.Cesium.Cartographic) {
        try {
          carto = global.Cesium.Cartographic.fromCartesian(cartesian);
        } catch (eCarto) {}
      }

      list.push({
        id: o.id || ('obs_' + Math.random().toString(36).substr(2, 7)),
        type: isTree ? 'tree' : (o.type || 'solid'),
        isTree: isTree,
        name: o.name || (isTree ? 'Árbol' : 'Obstáculo'),
        w: w,
        l: l,
        h: h,
        radiusM: isTree ? (w / 2) : (Math.max(w, l) / 2),
        cartesian: cartesian,
        carto: carto,
        porosity: isTree ? 0.40 : 0.05 // 40% porosidad en copas arbóreas, 5% en sólidos
      });
    });

    // Añadir edificios modelados en la escena si existen y no están en obstacles
    var rawBlds = (typeof global.buildings !== 'undefined' && Array.isArray(global.buildings))
      ? global.buildings
      : [];
    rawBlds.forEach(function (b, bIdx) {
      if (!b || b.visible === false) return;
      var bH = Math.max(2.5, Number(b.height || b.h || 6.0));
      var bW = Math.max(4.0, Number(b.width || b.w || 15.0));
      var bL = Math.max(4.0, Number(b.length || b.l || 20.0));
      var bCarto = null;
      var bCartesian = null;

      if (b.cartesian) {
        bCartesian = b.cartesian;
      } else if (b.positionCartographic) {
        bCarto = b.positionCartographic;
      } else if (Array.isArray(b.polygonPoints) && b.polygonPoints.length > 0 && typeof global.Cesium !== 'undefined') {
        try {
          var p0 = b.polygonPoints[0];
          if (p0 instanceof global.Cesium.Cartesian3) {
            bCartesian = p0;
            bCarto = global.Cesium.Cartographic.fromCartesian(p0);
          }
        } catch (eBld) {}
      }

      list.push({
        id: b.id || ('bld_' + bIdx),
        type: 'building',
        isTree: false,
        name: b.name || ('Edificio #' + (bIdx + 1)),
        w: bW,
        l: bL,
        h: bH,
        radiusM: Math.max(bW, bL) / 2,
        cartesian: bCartesian,
        carto: bCarto,
        porosity: 0.0
      });
    });

    return list;
  }

  /**
   * Distancia euclidiana aproximada horizontal (metros) entre dos coordenadas geográficas o cartesianas
   */
  function computeHorizontalDistanceM(p1, p2) {
    if (!p1 || !p2) return 999999;
    // 1. Si tienen coordenadas geográficas (lat/lon en radianes)
    var lat1 = (p1.latitudeRad !== undefined) ? p1.latitudeRad : (p1.carto ? p1.carto.latitude : null);
    var lon1 = (p1.longitudeRad !== undefined) ? p1.longitudeRad : (p1.carto ? p1.carto.longitude : null);
    var lat2 = (p2.latitudeRad !== undefined) ? p2.latitudeRad : (p2.carto ? p2.carto.latitude : null);
    var lon2 = (p2.longitudeRad !== undefined) ? p2.longitudeRad : (p2.carto ? p2.carto.longitude : null);

    if (lat1 !== null && lat2 !== null && lon1 !== null && lon2 !== null) {
      var R = 6371000.0;
      var dLat = lat2 - lat1;
      var dLon = (lon2 - lon1) * Math.cos((lat1 + lat2) / 2);
      return Math.sqrt(dLat * dLat + dLon * dLon) * R;
    }

    // 2. Si ambos tienen cartesiano Cesium directo
    var c1 = p1.cartesian || (p1 instanceof (global.Cesium && global.Cesium.Cartesian3 || Object) ? p1 : null);
    var c2 = p2.cartesian || (p2 instanceof (global.Cesium && global.Cesium.Cartesian3 || Object) ? p2 : null);
    if (c1 && c2 && typeof c1.x === 'number' && typeof c2.x === 'number') {
      var dx = c1.x - c2.x;
      var dy = c1.y - c2.y;
      var dz = c1.z - c2.z;
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    return 999999;
  }

  /**
   * Ángulo de rumbo / acimut en grados [0..360) desde el obstáculo hacia la turbina
   */
  function computeBearingDeg(fromPt, toPt) {
    var lat1 = (fromPt.latitudeRad !== undefined) ? fromPt.latitudeRad : (fromPt.carto ? fromPt.carto.latitude : 0);
    var lon1 = (fromPt.longitudeRad !== undefined) ? fromPt.longitudeRad : (fromPt.carto ? fromPt.carto.longitude : 0);
    var lat2 = (toPt.latitudeRad !== undefined) ? toPt.latitudeRad : (toPt.carto ? toPt.carto.latitude : 0);
    var lon2 = (toPt.longitudeRad !== undefined) ? toPt.longitudeRad : (toPt.carto ? toPt.carto.longitude : 0);

    var dLon = lon2 - lon1;
    var y = Math.sin(dLon) * Math.cos(lat2);
    var x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    var brngRad = Math.atan2(y, x);
    var deg = (brngRad * 180.0 / Math.PI + 360.0) % 360.0;
    return deg;
  }

  /**
   * Evalúa la interferencia aerodinámica de todos los obstáculos circundantes sobre una turbina dada.
   * Retorna déficit de velocidad, severidad y geometría 2D para visualización de sombra.
   * 
   * @param {Object} turbineInstance - Instancia del aerogenerador
   * @param {number} windDirectionDeg - Dirección de donde viene el viento (acimut meteorológico)
   * @param {Array} [optCustomObstacles] - Lista opcional para inyección en pruebas
   */
  function evaluateTurbineObstacleInterference(turbineInstance, windDirectionDeg, optCustomObstacles) {
    if (!turbineInstance) return null;

    var obstacles = optCustomObstacles || extractSceneObstacles();
    var turbPos = turbineInstance.positionCartographic || {};
    var hubH = (turbineInstance.supportStructure && turbineInstance.supportStructure.hubHeightM) || 12;
    var rotorD = (turbineInstance._catalog && turbineInstance._catalog.rotorDiameterM) || 5.0;

    var windDir = (windDirectionDeg !== undefined && windDirectionDeg !== null)
      ? Number(windDirectionDeg)
      : 270;

    // Dirección hacia donde viaja el flujo de viento (aguas abajo)
    var downwindDir = (windDir + 180) % 360;

    var maxVelocityDeficit = 0.0;
    var totalTurbulenceBoost = 0.0;
    var criticalObstacle = null;
    var affectedObstacles = [];

    obstacles.forEach(function (obs) {
      var distM = computeHorizontalDistanceM(obs, turbPos);
      if (distM < 0.1 || distM > 250) return; // Fuera del radio de influencia

      var obsH = obs.h || 5.0;
      // El alcance de la perturbación de un obstáculo llega hasta 20 veces su altura aguas abajo
      var maxWakeDist = Math.max(15.0, 20.0 * obsH);
      if (distM > maxWakeDist) return;

      // Ángulo desde el obstáculo hacia la turbina
      var bearingFromObs = computeBearingDeg(obs, turbPos);

      // Comprobar si la turbina está aguas abajo del obstáculo
      // Diferencia angular entre el vector del viento aguas abajo y la posición de la turbina
      var angleDiffDeg = Math.abs((bearingFromObs - downwindDir + 540) % 360 - 180);

      // Ángulo de apertura de la estela turbulenta del obstáculo (ensanchamiento cónico ~ 15° a 25°)
      var halfWakeAngleDeg = Math.max(12.0, Math.min(28.0, 18.0 + (obs.radiusM / Math.max(2.0, distM)) * 30.0));

      if (angleDiffDeg <= halfWakeAngleDeg) {
        // Evaluación analítica vertical tridimensional:
        // Consideramos la cota absoluta WGS84 del buje vs la cota de la cúspide del obstáculo
        var turbBaseAlt = Number(turbPos.altitudeM) || (turbPos.carto ? turbPos.carto.height : 0) || 0;
        var turbHubAbsAlt = turbBaseAlt + hubH;
        var obsBaseAlt = (obs.carto && typeof obs.carto.height === "number")
          ? obs.carto.height
          : (obs.cartesian && global.Cesium && global.Cesium.Cartographic ? (global.Cesium.Cartographic.fromCartesian(obs.cartesian).height || 0) : turbBaseAlt);
        var obsTopAbsAlt = obsBaseAlt + obsH;

        // Despeje vertical neto sobre la cúspide del obstáculo:
        var verticalClearanceM = turbHubAbsAlt - obsTopAbsAlt;
        var distRel = distM / Math.max(1.0, obsH);

        // Modelo de decaimiento vertical de WAsP / Taylor:
        // Si el buje está por debajo de la cúspide (clearance <= 0), sufre sombra directa.
        // Si está por encima, la estela se disipa exponencialmente y se anula si supera 1.5 * obsH sobre la copa.
        var verticalDecay = 1.0;
        if (verticalClearanceM <= 0) {
          verticalDecay = 1.0;
        } else if (verticalClearanceM < 1.5 * obsH) {
          verticalDecay = Math.max(0.0, 1.0 - (verticalClearanceM / (1.5 * obsH)));
        } else {
          verticalDecay = 0.0;
        }

        var zRel = turbHubAbsAlt / Math.max(1.0, obsTopAbsAlt);
        var porosityFactor = 1.0 - (obs.porosity || 0.35); // 0.60 para árboles, 0.95 para muros
        var distDecay = Math.max(0.0, 1.0 - (distRel / 20.0));
        var obstacleDeficit = 0.55 * porosityFactor * distDecay * verticalDecay;

        if (obstacleDeficit > 0.02) {
          var addedTurb = 0.35 * porosityFactor * distDecay * (zRel < 1.3 ? 1.0 : 0.4);
          if (obstacleDeficit > maxVelocityDeficit) {
            maxVelocityDeficit = obstacleDeficit;
            criticalObstacle = obs;
          }
          totalTurbulenceBoost += addedTurb;

          affectedObstacles.push({
            obstacle: obs,
            distanceM: Number(distM.toFixed(1)),
            deficitPct: Number((obstacleDeficit * 100).toFixed(1)),
            inDirectShadow: zRel <= 1.1,
            wakeAngleDiffDeg: Number(angleDiffDeg.toFixed(1))
          });
        }
      }
    });

    // Factor neto de velocidad efectiva (1.0 = sin afección, <1.0 = frenado por obstáculo)
    var effectiveSpeedFactor = Math.max(0.35, 1.0 - maxVelocityDeficit);
    var hasSevereInterference = maxVelocityDeficit >= 0.20;
    var hasModerateInterference = maxVelocityDeficit >= 0.08 && maxVelocityDeficit < 0.20;

    return {
      effectiveSpeedFactor: Number(effectiveSpeedFactor.toFixed(3)),
      maxVelocityDeficitPct: Number((maxVelocityDeficit * 100).toFixed(1)),
      addedTurbulence: Number(Math.min(0.40, totalTurbulenceBoost).toFixed(3)),
      hasInterference: maxVelocityDeficit >= 0.05,
      hasSevereInterference: hasSevereInterference,
      hasModerateInterference: hasModerateInterference,
      criticalObstacle: criticalObstacle,
      affectedObstacles: affectedObstacles,
      windDirectionDeg: windDir
    };
  }

  var WindObstacleInterference = {
    extractSceneObstacles: extractSceneObstacles,
    computeHorizontalDistanceM: computeHorizontalDistanceM,
    computeBearingDeg: computeBearingDeg,
    evaluateTurbineObstacleInterference: evaluateTurbineObstacleInterference
  };

  RAWind.ObstacleInterference = WindObstacleInterference;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = WindObstacleInterference;
  }
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : global));
