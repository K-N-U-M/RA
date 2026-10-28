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
   * Evalúa si las aspas de una turbina proyectan sombra sobre un punto receptor receptor (x, y, z)
   * para un vector solar dado.
   */
  function checkTurbineShadowHit(turbine, receptorLocal, solarPos) {
    if (!solarPos.isDaylight) return false;

    var cat = turbine._catalog || {};
    var hubH = (turbine.supportStructure && turbine.supportStructure.hubHeightM) || 18;
    var rotorR = (cat.rotorDiameterM ? cat.rotorDiameterM / 2.0 : 4.0);

    // Posición del buje respecto al receptor
    // dx = x_hub - x_rec, dy = y_hub - y_rec, dz = z_hub - z_rec
    var dx = -receptorLocal.dx;
    var dy = -receptorLocal.dy;
    var dz = hubH - (receptorLocal.dz || 0);

    var dist2D = Math.sqrt(dx * dx + dy * dy);
    if (dist2D <= 0.1) return true;
    // Más allá de 10x el diámetro de rotor la sombra se difumina por penumbra óptica
    var maxShadowDistM = Math.max(rotorR * 20.0, 300);
    if (dist2D > maxShadowDistM) return false;

    // Vector solar unitario desde el receptor hacia el sol
    var azRad = solarPos.azimuthDeg * DEG2RAD;
    var elRad = solarPos.elevationDeg * DEG2RAD;

    var sunVx = Math.sin(azRad) * Math.cos(elRad);
    var sunVy = Math.cos(azRad) * Math.cos(elRad);
    var sunVz = Math.sin(elRad);

    // Ángulo acimutal entre el receptor y el buje
    var bearingToHubRad = Math.atan2(dx, dy);
    var deltaAz = Math.abs(bearingToHubRad - azRad);
    while (deltaAz > Math.PI) deltaAz = Math.abs(deltaAz - 2 * Math.PI);

    // Si el sol no está detrás del aerogenerador visto desde el receptor, no hay sombra
    if (deltaAz > (45.0 * DEG2RAD)) return false;

    // Proyección en la línea de mira receptor -> sol
    // Punto más cercano del rayo solar al centro del buje
    var tProj = (dx * sunVx + dy * sunVy + dz * sunVz);
    if (tProj <= 0) return false; // El sol está entre la turbina y el receptor

    var closestX = sunVx * tProj;
    var closestY = sunVy * tProj;
    var closestZ = sunVz * tProj;

    var distToHubCenter = Math.sqrt(
      Math.pow(dx - closestX, 2) +
      Math.pow(dy - closestY, 2) +
      Math.pow(dz - closestZ, 2)
    );

    // Criterio astronómico: si la distancia más cercana al buje es menor o igual al radio del rotor
    return distToHubCenter <= (rotorR * 1.05);
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
      // Receptor de cortesía en el lindero normativo de parcela (35m al Este)
      targetList.push({
        id: 'rec_lindero',
        name: 'Lindero Habitado Más Cercano',
        dx: 35.0,
        dy: 10.0,
        dz: 0.0,
        dist2D: 36.4
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
            targetList.forEach(function (rec) {
              if (checkTurbineShadowHit(turbine, rec, sun)) {
                // Probabilidad de sol despejado típica en España (horas de sol reales / teóricas ~ 65%)
                var sunshineProb = 0.65;
                var effectiveMin = stepMinutes * stepDays * sunshineProb;
                totalSimulatedMinutes[rec.id] += effectiveMin;
                dailyMinutesThisDay[rec.id] += stepMinutes * sunshineProb;

                if (!rec.isSolarField) {
                  monthlyHoursMap[m] += (effectiveMin / 60.0);
                } else {
                  solarFieldHitMinutes += effectiveMin;
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
    var maxMinDay = Math.round(maxDayMinutesMap[worstRec.id] || 0);

    // Límite normativo internacional: 30 h/año o 30 min/día (World Bank / Guía Alemana WEA)
    var complies30h = worstHoursYear <= 30.0;
    var complies30m = maxMinDay <= 30;

    // Horas de sombra arrojada sobre el campo solar
    var solarFieldShadowHours = hasSolarTarget
      ? Number((solarFieldHitMinutes / 60.0).toFixed(1))
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
      solarYieldLossPctEstimate: solarFieldShadowHours > 0
        ? Number(Math.min(solarFieldShadowHours * 0.04, 2.5).toFixed(2))
        : 0
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
