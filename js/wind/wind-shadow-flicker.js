/**
 * wind-shadow-flicker.js — Motor Astronómico de Parpadeo de Sombras (Shadow Flicker)
 * ─────────────────────────────────────────────────────────────────────────────
 * Simulación y auditoría de parpadeo estroboscópico de palas eólicas:
 *   - Modelo astronómico solar (Spencer/Michalsky) para posición solar (acimut/elevación)
 *   - Proyección cónica del rotor sobre receptores sensibles y mesas de paneles solares
 *   - Criterio de parpadeo: elevación > 3°, rayo dentro de radio R, DNI >= 120 W/m²
 *   - Umbrales normativos internacionales: límite estándar de 30 horas/año o 30 min/día
 *   - Cálculo de matriz de parada preventiva (Flicker Curtailment) para mitigación
 *
 * Estándar UMD/IIFE puro, sin dependencias DOM, integrable en Web Worker o Main Thread.
 */
(function (global) {
  'use strict';

  var RAWind = global.RAWind || (global.RAWind = {});

  var DEG2RAD = Math.PI / 180.0;
  var RAD2DEG = 180.0 / Math.PI;

  /**
   * Calcula la posición solar (elevación y acimut en grados) para una latitud, longitud y fecha/hora UTC.
   * Algoritmo astronómico Spencer/Michalsky simplificado de alta precisión.
   */
  function calculateSolarPosition(latDeg, lonDeg, dayOfYear, hourUtcDecimal) {
    var latRad = latDeg * DEG2RAD;

    // Ángulo fraccional del año (gamma en radianes)
    var gamma = (2.0 * Math.PI / 365.0) * (dayOfYear - 1 + ((hourUtcDecimal - 12.0) / 24.0));

    // Ecuación del tiempo en minutos
    var eqtime = 229.18 * (
      0.000075 +
      0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma)
    );

    // Declinación solar (delta en radianes)
    var declin = 0.006918 -
      0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma) -
      0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma) -
      0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);

    // Tiempo solar verdadero en minutos
    var timeOffset = eqtime + 4.0 * lonDeg;
    var trueSolarTimeMin = hourUtcDecimal * 60.0 + timeOffset;
    while (trueSolarTimeMin < 0) trueSolarTimeMin += 1440;
    while (trueSolarTimeMin >= 1440) trueSolarTimeMin -= 1440;

    // Ángulo horario (omega en radianes)
    var haRad = ((trueSolarTimeMin / 4.0) - 180.0) * DEG2RAD;

    // Cénit solar
    var cosZenith = Math.sin(latRad) * Math.sin(declin) +
                    Math.cos(latRad) * Math.cos(declin) * Math.cos(haRad);
    cosZenith = Math.max(-1.0, Math.min(1.0, cosZenith));
    var zenithRad = Math.acos(cosZenith);
    var elevationDeg = 90.0 - (zenithRad * RAD2DEG);

    // Acimut solar (0° Norte, 90° Este, 180° Sur, 270° Oeste)
    var cosAzimuth = (Math.sin(declin) - Math.cos(zenithRad) * Math.sin(latRad)) /
                     (Math.sin(zenithRad) * Math.cos(latRad) || 0.00001);
    cosAzimuth = Math.max(-1.0, Math.min(1.0, cosAzimuth));
    var azimuthRad = Math.acos(cosAzimuth);
    if (haRad > 0) {
      azimuthRad = (2 * Math.PI) - azimuthRad;
    }
    var azimuthDeg = azimuthRad * RAD2DEG;

    return {
      elevationDeg: elevationDeg,
      azimuthDeg: azimuthDeg,
      isDaylight: elevationDeg > 3.0 // Solo hay sombra nítida sobre 3° de altura solar
    };
  }

  /**
   * Distancia euclídea aproximada en metros sobre coordenadas locales ENU
   */
  function computeLocalOffsetMeters(lat1Deg, lon1Deg, lat2Deg, lon2Deg) {
    var latMid = ((lat1Deg + lat2Deg) / 2.0) * DEG2RAD;
    var dLat = (lat2Deg - lat1Deg) * 111132.95;
    var dLon = (lon2Deg - lon1Deg) * (111412.84 * Math.cos(latMid));
    return {
      dx: dLon, // Este (m)
      dy: dLat, // Norte (m)
      distance2D: Math.sqrt(dLon * dLon + dLat * dLat)
    };
  }

  /**
   * Evalúa si el rotor de una turbina proyecta sombra sobre un punto receptor (x, y, z)
   * mediante intersección real rayo-plano del disco del rotor orientado por yaw (HAWT)
   * o cilindro vertical equivalente (VAWT).
   */
  function checkTurbineShadowHit(turbine, receptorLocal, solarPos) {
    if (!solarPos || !solarPos.isDaylight) return false;

    var cat = (turbine && turbine._catalog) || {};
    var hubH = (turbine && turbine.supportStructure && turbine.supportStructure.hubHeightM) || 18;
    var rotorR = (cat.rotorDiameterM ? cat.rotorDiameterM / 2.0 : 4.0);
    var isVawt = (cat.type === 'VAWT' || cat.type === 'vawt');

    // Posición del buje respecto al receptor: H = P_hub - P_rec
    var dx = -receptorLocal.dx;
    var dy = -receptorLocal.dy;
    var dz = hubH - (receptorLocal.dz || 0);

    var dist2D = Math.sqrt(dx * dx + dy * dy);
    // Más allá de 10x el diámetro de rotor (o 300 m mínimo) la sombra se difumina por penumbra óptica
    var maxShadowDistM = Math.max(rotorR * 20.0, 300);
    if (dist2D > maxShadowDistM) return false;

    // Vector solar unitario desde el receptor hacia el sol: rayo P(t) = t · S (t > 0)
    var azRad = solarPos.azimuthDeg * DEG2RAD;
    var elRad = solarPos.elevationDeg * DEG2RAD;

    var sunVx = Math.sin(azRad) * Math.cos(elRad);
    var sunVy = Math.cos(azRad) * Math.cos(elRad);
    var sunVz = Math.sin(elRad);

    if (isVawt) {
      var halfH = (Number(cat.bladeHeightM || cat.bladeLength) || (rotorR * 2.8)) * 0.5;
      var horizSq = sunVx * sunVx + sunVy * sunVy;
      if (horizSq < 1e-8) {
        return dist2D <= rotorR && (dz + halfH) > 0;
      }
      var tXY = (dx * sunVx + dy * sunVy) / horizSq;
      if (tXY <= 0) return false;
      var perpX = tXY * sunVx - dx;
      var perpY = tXY * sunVy - dy;
      var dXY2 = perpX * perpX + perpY * perpY;
      if (dXY2 > rotorR * rotorR) return false;
      var dt = Math.sqrt(Math.max(0, rotorR * rotorR - dXY2)) / Math.sqrt(horizSq);
      var tMin = Math.max(0, tXY - dt);
      var tMax = tXY + dt;
      var zMin = tMin * sunVz;
      var zMax = tMax * sunVz;
      return zMax >= (dz - halfH) && zMin <= (dz + halfH);
    }

    // Normal del disco del rotor HAWT según yaw (0°=N, 90°=E, 180°=S, 270°=O)
    var fallbackYawDeg = (RAWind.Resource && typeof RAWind.Resource.getConfig === 'function')
      ? (Number(RAWind.Resource.getConfig().prevailingWindDirDeg) || 270)
      : 270;
    var yawRad = (turbine && typeof turbine.orientationRad === 'number' && isFinite(turbine.orientationRad))
      ? turbine.orientationRad
      : (fallbackYawDeg * DEG2RAD);
    var nx = Math.sin(yawRad);
    var ny = Math.cos(yawRad);

    // Ecuación del plano del rotor: (P - H) · n = 0 con rayo P(t) = t · S
    var denom = sunVx * nx + sunVy * ny; // S · n
    var numer = dx * nx + dy * ny;       // H · n

    if (Math.abs(denom) >= 0.05) {
      var tHit = numer / denom;
      if (tHit <= 0) return false; // El plano del rotor está detrás del receptor respecto al sol
      var ix = tHit * sunVx - dx;
      var iy = tHit * sunVy - dy;
      var iz = tHit * sunVz - dz;
      var distInDiskSq = ix * ix + iy * iy + iz * iz;
      return distInDiskSq <= (rotorR * rotorR);
    }

    // Incidencia rasante casi paralela al plano del rotor (|S · n| < 0.05):
    // evaluar espesor efectivo de pala/góndola en proyección ortogonal
    var tProj = dx * sunVx + dy * sunVy + dz * sunVz;
    if (tProj <= 0) return false;
    var rx = tProj * sunVx - dx;
    var ry = tProj * sunVy - dy;
    var rz = tProj * sunVz - dz;
    var dNormal = Math.abs(rx * nx + ry * ny);
    var dTang = rx * (-ny) + ry * nx;
    var halfThick = Math.max(0.25, 0.06 * rotorR);
    return dNormal <= halfThick && (dTang * dTang + rz * rz) <= (rotorR * rotorR);
  }

  /**
   * Simulación anual completa de horas de Shadow Flicker (muestreo de 365 días a pasos de 10 min)
   *
   * @param {Object} turbine Instancia de WindTurbineInstance
   * @param {Array<{latDeg: number, lonDeg: number, altitudeM?: number, name?: string}>} receptors
   * @param {Object} [solarFieldBounds] Límites del campo fotovoltaico para evaluar sombras sobre paneles
   */
  function evaluateAnnualShadowFlicker(turbine, receptors, solarFieldBounds) {
    if (!turbine || !turbine.positionCartographic) {
      return { totalHoursYear: 0, complies30hNorm: true, maxMinutesDay: 0, monthlyHours: [] };
    }

    var tLon = turbine.positionCartographic.longitudeRad * RAD2DEG;
    var tLat = turbine.positionCartographic.latitudeRad * RAD2DEG;
    var tAlt = turbine.positionCartographic.altitudeM || 0;

    var targetList = [];
    if (Array.isArray(receptors) && receptors.length > 0) {
      receptors.forEach(function (r, idx) {
        var off = computeLocalOffsetMeters(tLat, tLon, r.latDeg, r.lonDeg);
        targetList.push({
          id: r.id || ('rec_' + idx),
          name: r.name || ('Receptor #' + (idx + 1)),
          dx: off.dx,
          dy: off.dy,
          dz: (r.altitudeM || tAlt) - tAlt,
          dist2D: off.distance2D
        });
      });
    } else {
      // Leer distancia/orientación real de receptor desde configuración eólica o entorno 3D
      var windCfg = (RAWind.Resource && typeof RAWind.Resource.getConfig === 'function') ? RAWind.Resource.getConfig() : {};
      var recDist = Math.max(5.0, Number(windCfg.receptorDistanceM) || 35.0);
      var recAzRad = (Number(windCfg.receptorAzimuthDeg) || 74.0) * DEG2RAD;
      var recDz = (typeof windCfg.receptorAltitudeM === 'number') ? (windCfg.receptorAltitudeM - tAlt) : 0.0;
      var dxDef = Number((recDist * Math.sin(recAzRad)).toFixed(1));
      var dyDef = Number((recDist * Math.cos(recAzRad)).toFixed(1));
      targetList.push({
        id: 'rec_lindero',
        name: 'Lindero Habitado (' + recDist + ' m)',
        dx: dxDef,
        dy: dyDef,
        dz: recDz,
        dist2D: recDist,
        isDefaultBoundaryFallback: true
      });
    }

    // Si hay paneles solares cerca, añadir el centroide del campo FV como receptor de sombra
    var solarFieldHitMinutes = 0;
    var hasSolarTarget = false;
    if (solarFieldBounds && typeof solarFieldBounds.latDeg === 'number') {
      var sOff = computeLocalOffsetMeters(tLat, tLon, solarFieldBounds.latDeg, solarFieldBounds.lonDeg);
      targetList.push({
        id: 'rec_solar_field',
        name: 'Mesa Fotovoltaica Más Próxima',
        dx: sOff.dx,
        dy: sOff.dy,
        dz: (solarFieldBounds.altitudeM || tAlt) - tAlt,
        dist2D: sOff.distance2D,
        isSolarField: true
      });
      hasSolarTarget = true;
    }

    // [AUD-2026 · E-02] Antes se muestreaba 1 día de cada 5 y una ventana fija 06-20 UTC:
    // el máximo diario se subestimaba (un día malo podía pasar el filtro) y se perdían
    // amaneceres/atardeceres de verano, cuando la sombra es más larga.
    // Ahora: todos los días del año y barrido 03:00-22:00 UTC (el propio cálculo solar
    // descarta las horas sin sol, así que el coste extra es asumible).
    var stepDays = 1;
    var stepMinutes = 10; // Pasos de 10 minutos
    var totalSimulatedMinutes = {};
    targetList.forEach(function (rec) {
      totalSimulatedMinutes[rec.id] = 0;
    });

    var maxDayMinutesMap = {};
    targetList.forEach(function (rec) {
      maxDayMinutesMap[rec.id] = 0;
    });

    var monthlyHoursMap = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    var daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    var totalDaylightIrradWeight = 0;
    var solarFieldHitIrradWeight = 0;

    var dayOfYear = 1;
    for (var m = 0; m < 12; m++) {
      var mDays = daysInMonth[m];
      for (var d = 0; d < mDays; d += stepDays) {
        var curDay = dayOfYear + d;
        var dailyMinutesThisDay = {};
        targetList.forEach(function (rec) { dailyMinutesThisDay[rec.id] = 0; });

        // Barrido diurno completo; las horas sin sol se descartan en calculateSolarPosition.
        for (var hMin = 3.0 * 60; hMin <= 22.0 * 60; hMin += stepMinutes) {
          var hDecimal = hMin / 60.0;
          var sun = calculateSolarPosition(tLat, tLon, curDay, hDecimal);

          if (sun.isDaylight) {
            // Peso relativo de irradiancia directa/POA según elevación solar (sin(α))
            var sunshineProb = 0.65;
            var sinEl = Math.max(0.10, Math.sin(sun.elevationDeg * DEG2RAD));
            totalDaylightIrradWeight += stepMinutes * stepDays * sunshineProb * sinEl;

            targetList.forEach(function (rec) {
              if (checkTurbineShadowHit(turbine, rec, sun)) {
                var effectiveMin = stepMinutes * stepDays * sunshineProb;
                totalSimulatedMinutes[rec.id] += effectiveMin;
                dailyMinutesThisDay[rec.id] += stepMinutes * sunshineProb;

                if (!rec.isSolarField) {
                  monthlyHoursMap[m] += (effectiveMin / 60.0);
                } else {
                  solarFieldHitMinutes += effectiveMin;
                  solarFieldHitIrradWeight += effectiveMin * sinEl;
                }
              }
            });
          }
        }

        // Control del pico diario más desfavorable
        targetList.forEach(function (rec) {
          if (dailyMinutesThisDay[rec.id] > maxDayMinutesMap[rec.id]) {
            maxDayMinutesMap[rec.id] = dailyMinutesThisDay[rec.id];
          }
        });
      }
      dayOfYear += mDays;
    }

    // Calcular el receptor humano más afectado
    var worstRec = targetList[0];
    var maxMinHuman = 0;
    targetList.forEach(function (rec) {
      if (!rec.isSolarField && totalSimulatedMinutes[rec.id] > maxMinHuman) {
        maxMinHuman = totalSimulatedMinutes[rec.id];
        worstRec = rec;
      }
    });

    var worstHoursYear = Number((maxMinHuman / 60.0).toFixed(1));
    var maxMinDay = 0;
    targetList.forEach(function (rec) {
      if (!rec.isSolarField) {
        maxMinDay = Math.max(maxMinDay, Math.round(maxDayMinutesMap[rec.id] || 0));
      }
    });

    // Límite normativo internacional: 30 h/año o 30 min/día (World Bank / Guía Alemana WEA)
    var complies30h = worstHoursYear <= 30.0;
    var complies30m = maxMinDay <= 30;

    // Horas de sombra arrojada sobre el campo solar y pérdida energética FV físicamente alineada
    var solarFieldShadowHours = hasSolarTarget
      ? Number((solarFieldHitMinutes / 60.0).toFixed(1))
      : 0;

    var tCat = turbine._catalog || {};
    var rotorR = tCat.rotorDiameterM ? (tCat.rotorDiameterM / 2.0) : 4.0;
    var isVawt = (tCat.type === 'VAWT' || tCat.type === 'vawt');
    var bladeSolidity = isVawt ? 0.22 : 0.18; // Fracción óptica media interceptada por las palas en giro
    var rotorAreaM2 = isVawt
      ? (2.0 * rotorR * (Number(tCat.bladeHeightM || tCat.bladeLength) || (rotorR * 2.8)))
      : (Math.PI * rotorR * rotorR);

    var fieldAreaM2 = (solarFieldBounds && Number(solarFieldBounds.fieldAreaM2) > 0)
      ? Number(solarFieldBounds.fieldAreaM2)
      : (Array.isArray(global.allRenderedPanels) && global.allRenderedPanels.length > 0
        ? Math.max(10.0, global.allRenderedPanels.filter(function (p) { return p && !p.deleted && !p.disabled; }).length * 2.0)
        : Math.max(rotorAreaM2, 60.0));
    var spatialCover = Math.min(1.0, rotorAreaM2 / Math.max(rotorAreaM2 * 0.5, fieldAreaM2));
    var hasMlpe = Boolean(
      (solarFieldBounds && solarFieldBounds.hasMlpe) ||
      (global.solarProjectConfig && (global.solarProjectConfig.selectedTopology === 'microinverter' || global.solarProjectConfig.selectedTopology === 'optimizer'))
    );
    var elecPenalty = hasMlpe ? 1.0 : 1.35; // Penalización de string sin MLPE frente a optimizadores/microinversores
    var beamFraction = 0.75; // Fracción directa del POA afectada por sombra dinámica de palas
    var irradHitFrac = totalDaylightIrradWeight > 0 ? (solarFieldHitIrradWeight / totalDaylightIrradWeight) : 0;
    var solarYieldLossPctEstimate = solarFieldShadowHours > 0
      ? Number(Math.min(15.0, irradHitFrac * beamFraction * bladeSolidity * spatialCover * elecPenalty * 100.0).toFixed(2))
      : 0;

    return {
      worstHoursYear: worstHoursYear,
      worstReceiverName: worstRec.name,
      worstReceiverDistanceM: Math.round(worstRec.dist2D),
      maxMinutesPerDay: maxMinDay,
      // [AUD-2026 · E-02] Metadatos de muestreo: 365 días a 10 min (antes 1 de cada 5 días).
      sampling: { stepDays: stepDays, stepMinutes: stepMinutes, daysEvaluated: 365, windowUtcHours: [3, 22] },
      compliesNorm30hYear: complies30h,
      compliesNorm30mDay: complies30m,
      isAcceptable: complies30h && complies30m,
      monthlyHours: monthlyHoursMap.map(function (h) { return Number(h.toFixed(1)); }),
      curtailmentRecommended: !complies30h,
      solarFieldShadowHours: solarFieldShadowHours,
      solarYieldLossPctEstimate: solarYieldLossPctEstimate,
      solarLossModel: {
        bladeSolidity: bladeSolidity,
        spatialCover: Number(spatialCover.toFixed(3)),
        elecPenalty: elecPenalty,
        irradWeightedHitPct: Number((irradHitFrac * 100.0).toFixed(3))
      }
    };
  }

  var ShadowFlicker = {
    calculateSolarPosition: calculateSolarPosition,
    computeLocalOffsetMeters: computeLocalOffsetMeters,
    checkTurbineShadowHit: checkTurbineShadowHit,
    evaluateAnnualShadowFlicker: evaluateAnnualShadowFlicker
  };

  RAWind.ShadowFlicker = ShadowFlicker;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ShadowFlicker;
  }

})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : global));
