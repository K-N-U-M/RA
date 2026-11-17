/**
 * ═══════════════════════════════════════════════════════════════════════
 * wind-acoustics.js — Propagación Acústica ISO 9613-2 y Cumplimiento
 *                     Normativo RD 1367/2007 (Zonificación e Isófonas)
 * ═══════════════════════════════════════════════════════════════════════
 * Modela la propagación semiesférica del sonido emitido por los
 * aerogeneradores:
 *   Lp(d) = LwA - [20·log10(d) + 11 + α_atm·d + A_gr + A_bar]
 *   Lp_total = 10·log10( Σ 10^(Lp_i / 10) )
 * Evalúa automáticamente el cumplimiento de los límites del Real Decreto
 * 1367/2007 en área residencial/industrial (45 dBA Día / 35 dBA Noche) y
 * calcula los radios de isófona 3D sobre terreno.
 * @version 2.0.0  2026-10-24
 */
(function (global) {
  'use strict';

  var RAWind = global.RAWind || (global.RAWind = {});

  /**
   * Coeficiente de atenuación atmosférica α (dB/m) según ISO 9613-1
   * en función de la frecuencia central de banda de octava (Hz), temperatura (°C) y humedad (%).
   */
  function getAtmosphericAbsorption(freqHz, tempC, relHumidity) {
    var f = Number(freqHz) || 500;
    var T = (Number(tempC) !== undefined && !isNaN(Number(tempC))) ? Number(tempC) : 15;
    var hr = Math.max(10, Math.min(100, Number(relHumidity) || 70));

    // Tabla base a 15°C y 70% HR (ISO 9613-1) en dB/m
    var baseAlpha = 0.0028;
    if (f <= 63) baseAlpha = 0.0001;
    else if (f <= 125) baseAlpha = 0.0004;
    else if (f <= 250) baseAlpha = 0.0010;
    else if (f <= 500) baseAlpha = 0.0028;
    else if (f <= 1000) baseAlpha = 0.0050;
    else if (f <= 2000) baseAlpha = 0.0090;
    else if (f <= 4000) baseAlpha = 0.0230;
    else baseAlpha = 0.0590;

    // Ligero ajuste por temperatura y humedad
    var tempFactor = 1.0 + 0.006 * (T - 15);
    var humFactor = 1.0 - 0.003 * (hr - 70);
    return Math.max(0.00005, baseAlpha * tempFactor * humFactor);
  }

  /**
   * Calcula el nivel de presión sonora Lp (dBA) a una distancia tridimensional `distanceM`
   * según ISO 9613-2:
   *   A_div = 20·log10(d) + 11
   *   A_atm = α(f, T, HR) · d
   *   A_gr  = 4.8 - (2·hm/d)·[17 + (300/d)] >= 0  (ponderado por factor de suelo G)
   */
  function calculateOctaveSoundLevel(LwA, distanceM, freqHz, tempC, relHumidity, groundFactor, meanHeightM, barrierAttenDb) {
    var d = Math.max(distanceM || 1.0, 1.0);
    var lwaVal = Number(LwA) || 100;
    var G = (groundFactor !== undefined && !isNaN(Number(groundFactor))) ? Number(groundFactor) : 0.5;
    var hm = Math.max(2.0, Number(meanHeightM) || 10.0);
    var aBar = Math.max(0, Number(barrierAttenDb) || 0);

    // 1. Divergencia geométrica esférica (A_div)
    var A_div = 20 * (Math.log(d) / Math.LN10) + 11.0;

    // 2. Absorción atmosférica (A_atm)
    var alpha = getAtmosphericAbsorption(freqHz || 500, tempC, relHumidity);
    var A_atm = alpha * d;

    // 3. Efecto del suelo ISO 9613-2 §7.3.2 (fórmula alternativa global)
    var A_gr = Math.max(0, 4.8 - (2 * hm / d) * (17 + (300 / d)));

    var totalAttenuation = A_div + A_atm + A_gr + aBar;
    return lwaVal - totalAttenuation;
  }

  /**
   * Calcula la presión sonora Lp (dBA) de un aerogenerador a una distancia horizontal `horizDistanceM`
   * considerando la altura real del buje (zHub) y la altura del receptor (1.5 m sobre el suelo).
   */
  function calculateTurbineSoundPressureAtDistance(turbineInstance, horizDistanceM, options) {
    if (!turbineInstance) return 0;
    if (turbineInstance.operationalState && turbineInstance.operationalState.enabled === false) {
      return 0;
    }
    options = options || {};
    var cat = turbineInstance._catalog || {};
    var LwA = Number(cat.acousticPowerLwaDba) || 100;
    var hubH = (turbineInstance.supportStructure && turbineInstance.supportStructure.hubHeightM) || 18;
    var receptorH = Number(options.receptorHeightM) || 1.5;

    var dh = Math.max(1.0, Number(horizDistanceM) || 1.0);
    var dz = Math.max(0, hubH - receptorH);
    var slantDistM = Math.sqrt(dh * dh + dz * dz);
    var meanPropHeightM = 0.5 * (hubH + receptorH);

    // Si tiene modo nocturno (curtailmentRulesActive), el giro a bajas RPM reduce ~3.5 dBA la potencia acústica
    var curtailmentReduction = (turbineInstance.operationalState && turbineInstance.operationalState.curtailmentRulesActive)
      ? 3.5
      : 0;

    return calculateOctaveSoundLevel(
      LwA - curtailmentReduction,
      slantDistM,
      options.freqHz || 500,
      options.tempC !== undefined ? options.tempC : 15,
      options.relHumidity || 70,
      options.groundFactor !== undefined ? options.groundFactor : 0.5,
      meanPropHeightM,
      options.barrierAttenDb || 0
    );
  }

  /**
   * Suma logarítmica energética de múltiples niveles de presión sonora (dBA):
   * Lp_total = 10 · log10( Σ 10^(Lp_i / 10) )
   */
  function combineSoundLevels(levelsDba) {
    if (!Array.isArray(levelsDba) || levelsDba.length === 0) return 0;
    var energySum = 0;
    var validCount = 0;
    for (var i = 0; i < levelsDba.length; i++) {
      var val = Number(levelsDba[i]);
      if (val > 0) {
        energySum += Math.pow(10, val / 10);
        validCount++;
      }
    }
    if (validCount === 0 || energySum <= 0) return 0;
    return Number((10 * (Math.log(energySum) / Math.LN10)).toFixed(1));
  }

  /**
   * Encuentra mediante bisección el radio horizontal sobre terreno (m) donde el nivel de presión
   * sonora de una turbina cae exactamente hasta `targetDba` (ej. 45 dBA Día o 35 dBA Noche).
   */
  function findIsophoneRadiusM(LwA, targetDba, hubHeightM, options) {
    var lwaVal = Number(LwA) || 100;
    var target = Number(targetDba) || 45;
    var hubH = Math.max(2.0, Number(hubHeightM) || 18);
    if (lwaVal <= target + 11) return 1.0;

    var low = 1.0;
    var high = 2500.0;
    var dummyTurbine = {
      operationalState: {
        enabled: true,
        curtailmentRulesActive: !!(options && options.curtailmentRulesActive)
      },
      supportStructure: { hubHeightM: hubH },
      _catalog: { acousticPowerLwaDba: lwaVal }
    };

    for (var iter = 0; iter < 28; iter++) {
      var mid = 0.5 * (low + high);
      var lp = calculateTurbineSoundPressureAtDistance(dummyTurbine, mid, options);
      if (lp > target) {
        low = mid;
      } else {
        high = mid;
      }
    }
    return Number((0.5 * (low + high)).toFixed(1));
  }

  /**
   * Evalúa el cumplimiento acústico del parque completo según el Real Decreto 1367/2007
   * (Zonificación Acústica: Límite Diurno 45 dBA / Límite Nocturno 35 dBA en receptor/lindero).
   */
  function evaluateComplianceRD1367(turbines, receptorDistanceM) {
    var list = Array.isArray(turbines) ? turbines : (global.windTurbines || []);
    var cfg = (RAWind.Resource && RAWind.Resource.getConfig) ? RAWind.Resource.getConfig() : {};
    var distM = Math.max(2.0, Number(receptorDistanceM) || Number(cfg.receptorDistanceM) || 35.0);

    var C = RAWind.CONSTANTS || {};
    var limitDayDba = C.ACOUSTIC_LIMIT_DAY_DBA || 45;
    var limitNightDba = C.ACOUSTIC_LIMIT_NIGHT_DBA || 35;

    var individualLevels = [];
    var perTurbine = [];

    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      if (!t) continue;
      var isEn = !(t.operationalState && t.operationalState.enabled === false);
      var lwa = (t._catalog && t._catalog.acousticPowerLwaDba) ? t._catalog.acousticPowerLwaDba : 100;
      var hubH = (t.supportStructure && t.supportStructure.hubHeightM) ? t.supportStructure.hubHeightM : 18;
      var curtailed = !!(t.operationalState && t.operationalState.curtailmentRulesActive);

      var lpAtReceptor = isEn ? calculateTurbineSoundPressureAtDistance(t, distM) : 0;
      if (isEn && lpAtReceptor > 0) {
        individualLevels.push(lpAtReceptor);
      }

      var radiusDay45M = isEn ? findIsophoneRadiusM(lwa, limitDayDba, hubH, { curtailmentRulesActive: curtailed }) : 0;
      var radiusNight35M = isEn ? findIsophoneRadiusM(lwa, limitNightDba, hubH, { curtailmentRulesActive: curtailed }) : 0;

      var tAudit = {
        id: t.id,
        name: t.name,
        LwA: lwa,
        lpAtReceptorDba: Number(lpAtReceptor.toFixed(1)),
        radiusDay45M: radiusDay45M,
        radiusNight35M: radiusNight35M,
        compliesDay: !isEn || lpAtReceptor <= limitDayDba,
        compliesNight: !isEn || lpAtReceptor <= limitNightDba
      };
      t._acousticAudit = tAudit;
      perTurbine.push(tAudit);
    }

    var combinedLpDba = combineSoundLevels(individualLevels);
    var compliesDay = combinedLpDba <= limitDayDba;
    var compliesNight = combinedLpDba <= limitNightDba;

    // Distancia mínima libre recomendada al lindero considerando suma energética multi-turbina (10·log10 N)
    var minSafeNightDistanceM = 0;
    var enabledLwas = perTurbine.filter(function (p) { return p.enabled; }).map(function (p) { return p.lwaDba; });
    if (enabledLwas.length > 1) {
      var eqLwa = combineSoundLevels(enabledLwas);
      var reqAtten = eqLwa - limitNightDba;
      minSafeNightDistanceM = Math.max(1.0, Math.pow(10, (reqAtten - 11.0) / 20.0));
    } else {
      for (var j = 0; j < perTurbine.length; j++) {
        if (perTurbine[j].radiusNight35M > minSafeNightDistanceM) {
          minSafeNightDistanceM = perTurbine[j].radiusNight35M;
        }
      }
    }

    return {
      receptorDistanceM: distM,
      combinedLpDba: combinedLpDba,
      limitDayDba: limitDayDba,
      limitNightDba: limitNightDba,
      marginDayDb: Number((limitDayDba - combinedLpDba).toFixed(1)),
      marginNightDb: Number((limitNightDba - combinedLpDba).toFixed(1)),
      compliesDay: compliesDay,
      compliesNight: compliesNight,
      requiresNightCurtailment: compliesDay && !compliesNight,
      minSafeNightDistanceM: Number(minSafeNightDistanceM.toFixed(1)),
      perTurbine: perTurbine
    };
  }

  /**
   * Genera una malla 2D de niveles de presión sonora (Float32Array) en coordenadas locales (metros)
   * alrededor del centro del parque eólico, apta para ser transferida por Web Worker (Zero-Copy).
   */
  function computeAcousticGrid(turbines, gridResolutionM, halfExtentM) {
    var list = Array.isArray(turbines) ? turbines : (global.windTurbines || []);
    var resM = Math.max(2.0, Number(gridResolutionM) || 5.0);
    var extent = Math.max(25.0, Number(halfExtentM) || 100.0);
    var steps = Math.floor((2 * extent) / resM) + 1;
    var grid = new Float32Array(steps * steps);

    if (list.length === 0) {
      return { width: steps, height: steps, resolutionM: resM, halfExtentM: extent, data: grid };
    }

    var enabledList = list.filter(function (t) {
      return t && (!t.operationalState || t.operationalState.enabled !== false);
    });
    if (enabledList.length === 0) {
      return { width: steps, height: steps, resolutionM: resM, halfExtentM: extent, data: grid };
    }
    var refLon = enabledList[0].positionCartographic ? enabledList[0].positionCartographic.longitudeRad : 0;
    var refLat = enabledList[0].positionCartographic ? enabledList[0].positionCartographic.latitudeRad : 0;
    var cosLat = Math.cos(refLat || 0.7);

    var localTurbines = list.filter(function (t) {
      return t && (!t.operationalState || t.operationalState.enabled !== false);
    }).map(function (t) {
      var pos = t.positionCartographic || {};
      return {
        instance: t,
        xM: ((pos.longitudeRad || 0) - refLon) * 6371000 * cosLat,
        yM: ((pos.latitudeRad || 0) - refLat) * 6371000
      };
    });

    var idx = 0;
    for (var iy = 0; iy < steps; iy++) {
      var y = -extent + iy * resM;
      for (var ix = 0; ix < steps; ix++) {
        var x = -extent + ix * resM;
        var energySum = 0;
        for (var k = 0; k < localTurbines.length; k++) {
          var lt = localTurbines[k];
          var dx = x - lt.xM;
          var dy = y - lt.yM;
          var dHoriz = Math.sqrt(dx * dx + dy * dy);
          var lp = calculateTurbineSoundPressureAtDistance(lt.instance, dHoriz);
          if (lp > 0) {
            energySum += Math.pow(10, lp / 10);
          }
        }
        grid[idx++] = energySum > 0 ? (10 * (Math.log(energySum) / Math.LN10)) : 0;
      }
    }

    return {
      width: steps,
      height: steps,
      resolutionM: resM,
      halfExtentM: extent,
      data: grid
    };
  }

  var Acoustics = {
    getAtmosphericAbsorption: getAtmosphericAbsorption,
    calculateOctaveSoundLevel: calculateOctaveSoundLevel,
    calculateTurbineSoundPressureAtDistance: calculateTurbineSoundPressureAtDistance,
    combineSoundLevels: combineSoundLevels,
    findIsophoneRadiusM: findIsophoneRadiusM,
    evaluateComplianceRD1367: evaluateComplianceRD1367,
    computeAcousticGrid: computeAcousticGrid
  };

  RAWind.Acoustics = Acoustics;
  RAWind.calculateOctaveSoundLevel = calculateOctaveSoundLevel;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Acoustics;
  }

})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : global));
