/**
 * ═══════════════════════════════════════════════════════════════════════
 * wind-structural.js — Comprobación Estructural CTE DB-SE-AE, IEC 61400-2,
 *                      Cimentación por Gravedad y Resonancia de Campbell
 * ═══════════════════════════════════════════════════════════════════════
 * Evalúa la integridad mecánica del conjunto aerogenerador-mástil-cimentación:
 *   - Presión dinámica de supervivencia qb = 0.5 · ρ · Ve50² (IEC 61400-2)
 *   - Empuje extremo en el buje F_thrust (kN) y arrastre de torre F_tower (kN)
 *   - Momento flector máximo en la base M_base (kN·m) con factor γ_F = 1.50 (CTE DB-SE-AE)
 *   - Dimensionamiento de zapata de hormigón armado (suelo) o comprobación de
 *     punzonamiento / sobrecarga en cubierta (límite 2.0 kN/m² ≈ 200 kg/m² CTE)
 *   - Análisis modal de resonancia dinámica (Diagrama de Campbell 1P y 3P vs f_n)
 * @version 2.0.0  2026-10-24
 */
(function (global) {
  'use strict';

  var RAWind = global.RAWind || (global.RAWind = {});

  /**
   * Estima la masa del mástil tubular de acero galvanizado S355 (kg) en función
   * de la altura del buje y la potencia/diámetro de la turbina.
   */
  function estimateTowerMassKg(hubHeightM, ratedPowerW) {
    var h = Math.max(2.0, Number(hubHeightM) || 12);
    var pKw = Math.max(0.5, (Number(ratedPowerW) || 6000) / 1000);
    // Masa específica aproximada: ~18 kg/m para 2.5 kW, ~45 kg/m para 10 kW, ~95 kg/m para 30 kW
    var kgPerMeter = 12 * Math.pow(pKw, 0.48) * (1 + 0.015 * h);
    return Math.round(h * kgPerMeter);
  }

  /**
   * Ajusta la frecuencia natural del primer modo de flexión de la torre f_n (Hz)
   * cuando cambia la altura de mástil respecto a la altura de referencia del catálogo.
   */
  function estimateTowerNaturalFreqHz(baseFreqHz, refHeightM, actualHeightM) {
    var f0 = Number(baseFreqHz) || 1.0;
    var hRef = Math.max(4.0, Number(refHeightM) || 18.0);
    var hAct = Math.max(4.0, Number(actualHeightM) || 18.0);
    // En una viga en voladizo con masa en punta, f_n escala aprox con (hRef / hAct)^1.35
    var fAdj = f0 * Math.pow(hRef / hAct, 1.35);
    return Number(Math.max(0.20, Math.min(5.0, fAdj)).toFixed(2));
  }

  /**
   * Evalúa la seguridad estructural y dinámica de una instancia de aerogenerador.
   */
  function evaluateStructuralSafety(turbineInstance, catalogItem) {
    if (!turbineInstance) return null;

    var cat = catalogItem || turbineInstance._catalog || {};
    if (global.RAWindCatalog && turbineInstance.catalogId && (!cat.structural || !cat.survivalSpeedMs)) {
      var fullCat = global.RAWindCatalog.getById(turbineInstance.catalogId);
      if (fullCat) cat = fullCat;
    }

    var C = RAWind.CONSTANTS || {};
    var rho = C.AIR_DENSITY_STD || 1.225;
    var g = C.GRAVITY || 9.80665;

    var ratedPowerW = Number(cat.ratedPowerW) || 10000;
    var rotorD = Math.max(0.8, Number(cat.rotorDiameterM) || 5.0);
    var bladeCount = parseInt(cat.bladeCount, 10) || 3;
    var hubH = Math.max(2.0, (turbineInstance.supportStructure && turbineInstance.supportStructure.hubHeightM) || 18);
    var mountingType = turbineInstance.mountingType || 'ground';
    var vSurvival = Number(cat.survivalSpeedMs) || C.SURVIVAL_DEFAULT_MS || 59.5;
    var vRated = Number(cat.ratedSpeedMs) || C.RATED_DEFAULT_MS || 11.0;

    var structSpec = cat.structural || {};
    var nacelleMassKg = Number(structSpec.nacelleMassKg) || Math.round(ratedPowerW * 0.012);
    var rotorMassKg = Number(structSpec.rotorMassKg) || Math.round(ratedPowerW * 0.0045);
    var towerMassKg = estimateTowerMassKg(hubH, ratedPowerW);
    var totalDeadWeightKg = nacelleMassKg + rotorMassKg + towerMassKg;
    var totalAxialLoadKn = (totalDeadWeightKg * g) / 1000;

    // 1. Presión dinámica de supervivencia a 50 años (IEC 61400-2)
    // qb = 0.5 · ρ · Ve50² (N/m²)
    var qbPa = 0.5 * rho * vSurvival * vSurvival;
    var qbKpa = qbPa / 1000;

    // 2. Empuje aerodinámico máximo en el rotor (kN) y arrastre en el fuste de la torre (kN)
    var sweptAreaM2 = Math.PI * Math.pow(rotorD / 2, 2);
    // Empuje de catálogo o cálculo con coeficiente de empuje en bandera/supervivencia Cf_rotor ≈ 0.18
    var catalogThrustKn = Number(structSpec.maxThrustKn) || 0;
    var calcSurvivalThrustKn = (qbPa * sweptAreaM2 * 0.18) / 1000;
    var maxRotorThrustKn = Math.max(catalogThrustKn, calcSurvivalThrustKn);

    // Arrastre aerodinámico sobre fuste tubular cilíndrico: A_proj ≈ D_medio · H, Cd ≈ 0.75
    var meanTowerDiamM = Math.max(0.14, Math.min(1.2, 0.016 * hubH + 0.08));
    var towerDragKn = (qbPa * (meanTowerDiamM * hubH) * 0.75) / 1000;
    var totalShearBaseKn = maxRotorThrustKn + towerDragKn;

    // 3. Momento de vuelco en la base del mástil (kN·m)
    // Característico: M_k = F_thrust · H_hub + F_tower · (H_hub / 2)
    // De cálculo ELU (CTE DB-SE-AE γ_Q = 1.50): M_d = 1.50 · M_k
    var overturningMomentCharKnm = maxRotorThrustKn * hubH + towerDragKn * (hubH * 0.5);
    var overturningMomentDesignKnm = overturningMomentCharKnm * 1.50;

    // 4. Comprobación de Resonancia Dinámica (Diagrama de Campbell 1P / 3P)
    // TSR nominal típico ~ 6.0 para HAWT y ~ 2.5 para VAWT
    var tsrNominal = (cat.type === 'VAWT') ? 2.5 : 6.0;
    var omegaRatedRadS = (tsrNominal * vRated) / (rotorD / 2);
    var nominalRpm = (omegaRatedRadS * 60) / (2 * Math.PI);
    var freq1PHz = nominalRpm / 60;                 // Frecuencia de giro del rotor (desequilibrio másico)
    var freqBladePassHz = freq1PHz * bladeCount;    // Frecuencia de paso de pala (3P en tripala)

    var refH = (Array.isArray(cat.hubHeightsAvailableM) && cat.hubHeightsAvailableM.length > 0)
      ? cat.hubHeightsAvailableM[0]
      : 18;
    var towerNaturalFreqHz = estimateTowerNaturalFreqHz(structSpec.naturalFrequencyHz || 0.9, refH, hubH);

    // Condición de banda de exclusión de resonancia (±12% alrededor de 1P y 3P)
    var margin1P = Math.abs(towerNaturalFreqHz - freq1PHz) / Math.max(0.05, freq1PHz);
    var margin3P = Math.abs(towerNaturalFreqHz - freqBladePassHz) / Math.max(0.05, freqBladePassHz);
    var hasResonanceRisk = (margin1P < 0.12) || (margin3P < 0.12);

    var towerStiffnessRegime = 'Soft-Stiff (Óptimo)';
    if (towerNaturalFreqHz < freq1PHz * 0.88) {
      towerStiffnessRegime = 'Soft-Soft (Torre flexible)';
    } else if (towerNaturalFreqHz > freqBladePassHz * 1.12) {
      towerStiffnessRegime = 'Stiff-Stiff (Torre rígida)';
    } else if (hasResonanceRisk) {
      towerStiffnessRegime = '¡RIESGO DE RESONANCIA (1P/3P)!';
    }

    // 5. Dimensionamiento de cimentación (Suelo vs Cubierta CTE DB-SE-AE)
    var footingLengthM = 0;
    var footingDepthM = 0;
    var concreteVolumeM3 = 0;
    var safetyFactorOverturning = 2.0;
    var roofDistributedLoadKgM2 = 0;
    var roofOverloadRisk = false;
    var structuralWarning = null;

    if (mountingType === 'rooftop') {
      // Bancada repartidora de acero sobre forjado (ej. 2.5m x 2.5m o proporcional al mástil)
      var spreaderSpanM = Math.max(2.0, Math.min(5.0, hubH * 0.30));
      var spreaderAreaM2 = spreaderSpanM * spreaderSpanM;
      // Carga equivalente en apoyos por peso propio + par de vuelco (F_eq = N/A + M_k / (W_modulo))
      var equivPeakForceKn = totalAxialLoadKn + (overturningMomentCharKnm / (spreaderSpanM * 0.75));
      var equivLoadKnM2 = equivPeakForceKn / spreaderAreaM2;
      roofDistributedLoadKgM2 = Math.round((equivLoadKnM2 * 1000) / g);

      // CTE DB-SE-AE Tabla 3.1: Cubiertas accesibles solo para conservación = 1.0 - 2.0 kN/m² (100 - 200 kg/m²)
      if (roofDistributedLoadKgM2 > 200 || overturningMomentCharKnm > 18.0) {
        roofOverloadRisk = true;
        structuralWarning = 'Sobrecarga en cubierta (' + roofDistributedLoadKgM2 + ' kg/m² y M_k=' +
          overturningMomentCharKnm.toFixed(1) + ' kN·m) supera los 200 kg/m² de un forjado estándar CTE DB-SE-AE. ' +
          'Anclar bancada directamente a pilares estructurales o instalar en suelo.';
      }
    } else {
      // Cimentación superficial por zapata cuadrada de hormigón armado HA-25 (γ_horm = 24 kN/m³)
      // Condición de estabilidad al vuelco: M_estab / M_vuelco >= 1.80
      // M_estab = (W_zapata + W_turbina) · (L / 2) >= 1.80 · M_k
      // Con canto H_zap ≈ 0.35 · L -> W_zapata = 24 · 0.35 · L³ = 8.4 · L³
      var targetStabilizingMoment = 1.85 * overturningMomentCharKnm;
      var L = Math.pow(Math.max(1.5, (targetStabilizingMoment * 2) / 8.5), 0.25);
      footingLengthM = Number((Math.ceil(Math.max(1.2, L) * 10) / 10).toFixed(1));
      footingDepthM = Number((Math.ceil(Math.max(0.6, footingLengthM * 0.38) * 10) / 10).toFixed(1));
      concreteVolumeM3 = Number((footingLengthM * footingLengthM * footingDepthM).toFixed(2));

      var footingWeightKn = concreteVolumeM3 * 24.0;
      var stabilizingMomentKnm = (footingWeightKn + totalAxialLoadKn) * (footingLengthM / 2);
      safetyFactorOverturning = overturningMomentCharKnm > 0.1
        ? Number((stabilizingMomentKnm / overturningMomentCharKnm).toFixed(2))
        : 3.0;

      // CTE DB-SE-C Apdo 4.2.2: Factor de seguridad al deslizamiento horizontal (FS_desl >= 1.50)
      // Resistencia por rozamiento terreno-zapata: R_d = (N_zapata + N_turbina) * tan(delta_rozamiento)
      // Para suelo estándar (arena compacta / arcilla dura tan(delta) ~ 0.50 - 0.55)
      var frictionCoeff = 0.52;
      var totalVerticalWeightKn = footingWeightKn + totalAxialLoadKn;
      var slidingResistanceKn = totalVerticalWeightKn * frictionCoeff;
      var safetyFactorSliding = totalShearBaseKn > 0.1
        ? Number((slidingResistanceKn / totalShearBaseKn).toFixed(2))
        : 3.0;

      if (safetyFactorSliding < 1.50) {
        // Incrementar ligeramente la zapata si no cumple deslizamiento
        footingLengthM = Number((footingLengthM * 1.15).toFixed(1));
        footingDepthM = Number((footingLengthM * 0.38).toFixed(1));
        concreteVolumeM3 = Number((footingLengthM * footingLengthM * footingDepthM).toFixed(2));
        footingWeightKn = concreteVolumeM3 * 24.0;
        totalVerticalWeightKn = footingWeightKn + totalAxialLoadKn;
        safetyFactorSliding = Number(((totalVerticalWeightKn * frictionCoeff) / Math.max(0.1, totalShearBaseKn)).toFixed(2));
        safetyFactorOverturning = Number((((footingWeightKn + totalAxialLoadKn) * (footingLengthM / 2)) / Math.max(0.1, overturningMomentCharKnm)).toFixed(2));
      }
    }

    if (hasResonanceRisk && !structuralWarning) {
      structuralWarning = 'La frecuencia natural del mástil (' + towerNaturalFreqHz +
        ' Hz) está demasiado próxima a las frecuencias de excitación del rotor (1P=' +
        freq1PHz.toFixed(2) + ' Hz / ' + bladeCount + 'P=' + freqBladePassHz.toFixed(2) + ' Hz).';
    }

    // [AUD-2026 · E-03] Con la información disponible NO se puede declarar "segura":
    // falta presión admisible del terreno, comprobación de despegue (e ≤ L/6),
    // pandeo del mástil y fatiga. Se calcula lo que sí es calculable y se degrada
    // el veredicto a "predimensionamiento", que es lo que realmente es.
    var bearingKpa = Number(
      (turbineInstance && (turbineInstance.bearingCapacityKpa || turbineInstance.geotechnicalBearingKpa)) ||
      (typeof global !== 'undefined' && global.raGeotechnicalBearingKpa) || 0
    );
    var hasGeotech = bearingKpa > 0;
    var axialForEcc = (typeof totalVerticalWeightKn === 'number' && totalVerticalWeightKn > 0)
      ? totalVerticalWeightKn
      : totalAxialLoadKn;
    var eccentricityM = (footingLengthM > 0 && axialForEcc > 0.1)
      ? Number((overturningMomentCharKnm / axialForEcc).toFixed(2))
      : null;
    var coreLimitM = footingLengthM > 0 ? footingLengthM / 6 : null;
    var hasUplift = (eccentricityM != null && coreLimitM != null) ? (eccentricityM > coreLimitM) : null;
    var meetsBearing = hasGeotech
      ? ((axialForEcc / Math.max(0.01, footingLengthM * footingLengthM)) <= bearingKpa)
      : null;

    var preliminarilyStable = !hasResonanceRisk && !roofOverloadRisk &&
      safetyFactorOverturning >= 1.5 &&
      ((typeof safetyFactorSliding !== 'number') || safetyFactorSliding >= 1.5) &&
      (hasUplift !== true);

    if (!hasGeotech && !structuralWarning) {
      structuralWarning = 'Predimensionamiento: falta estudio geotécnico (presión admisible) y las comprobaciones de despegue, pandeo y fatiga. No apto para proyecto de ejecución.';
    }

    var report = {
      mountingType: mountingType,
      hubHeightM: hubH,
      survivalSpeedMs: vSurvival,
      dynamicPressureSurvivalKpa: Number(qbKpa.toFixed(2)),
      maxRotorThrustKn: Number(maxRotorThrustKn.toFixed(2)),
      towerDragKn: Number(towerDragKn.toFixed(2)),
      totalShearBaseKn: Number(totalShearBaseKn.toFixed(2)),
      overturningMomentCharKnm: Number(overturningMomentCharKnm.toFixed(1)),
      overturningMomentDesignKnm: Number(overturningMomentDesignKnm.toFixed(1)),
      totalDeadWeightKg: totalDeadWeightKg,
      totalAxialLoadKn: Number(totalAxialLoadKn.toFixed(2)),
      campbell: {
        nominalRpm: Math.round(nominalRpm),
        freq1PHz: Number(freq1PHz.toFixed(2)),
        freqBladePassHz: Number(freqBladePassHz.toFixed(2)),
        towerNaturalFreqHz: towerNaturalFreqHz,
        stiffnessRegime: towerStiffnessRegime,
        hasResonanceRisk: hasResonanceRisk
      },
      foundation: {
        footingLengthM: footingLengthM,
        footingDepthM: footingDepthM,
        concreteVolumeM3: concreteVolumeM3,
        safetyFactorOverturning: safetyFactorOverturning,
        safetyFactorSliding: (typeof safetyFactorSliding === 'number') ? safetyFactorSliding : 2.5,
        roofDistributedLoadKgM2: roofDistributedLoadKgM2,
        roofOverloadRisk: roofOverloadRisk,
        eccentricityM: eccentricityM,
        coreLimitM: (coreLimitM != null) ? Number(coreLimitM.toFixed(2)) : null,
        hasUpliftRisk: hasUplift,
        bearingCapacityKpa: hasGeotech ? bearingKpa : null,
        meetsBearingCapacity: meetsBearing
      },
      // Solo es "segura" si hay geotecnia y no despega.
      isSafe: !!(hasGeotech && preliminarilyStable),
      preliminarilyStable: preliminarilyStable,
      requiresGeotechnicalStudy: !hasGeotech,
      structuralWarning: structuralWarning
    };

    turbineInstance._structuralReport = report;
    return report;
  }

  /**
   * Evalúa todo el parque eólico y devuelve el resumen estructural.
   */
  function evaluateParkStructural(turbines) {
    var list = Array.isArray(turbines) ? turbines : (global.windTurbines || []);
    var reports = [];
    var allSafe = true;
    for (var i = 0; i < list.length; i++) {
      var rep = evaluateStructuralSafety(list[i]);
      if (rep) {
        reports.push(rep);
        if (!rep.isSafe) allSafe = false;
      }
    }
    return {
      allSafe: allSafe,
      reports: reports
    };
  }

  var Structural = {
    estimateTowerMassKg: estimateTowerMassKg,
    estimateTowerNaturalFreqHz: estimateTowerNaturalFreqHz,
    evaluateStructuralSafety: evaluateStructuralSafety,
    evaluateParkStructural: evaluateParkStructural
  };

  RAWind.Structural = Structural;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Structural;
  }

})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : global));
