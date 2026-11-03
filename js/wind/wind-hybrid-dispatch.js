/**
 * wind-hybrid-dispatch.js — Motor de Despacho Horario Híbrido 8760h (Solar FV + Eólica + BESS)
 * ─────────────────────────────────────────────────────────────────────────────
 * Calcula la simulación energética horaria de las 8760 horas del año:
 *   - Despacho horario coordinado FV + Mini-Eólica + Almacenamiento (BESS)
 *   - Balance neto horario: autoconsumo directo, carga/descarga BESS, excedentes y red
 *   - Algoritmo de Peak Shaving tarifario (término de potencia 3.0TD / 6.1TD)
 *   - LCOE Híbrido, grado de autosuficiencia y factor de capacidad agregado
 *
 * Estándar UMD/IIFE puro, cero dependencias DOM, listo para Web Worker o Main Thread.
 */
(function (global) {
  'use strict';

  var RAWind = global.RAWind || (global.RAWind = {});

  // Perfil horario sintético diurno de viento en la península ibérica
  // (Mayor recurso en madrugadas/noches y brisas de tarde)
  var DIURNAL_WIND_FACTORS = [
    1.18, 1.20, 1.22, 1.20, 1.15, 1.10, // 00h - 05h (noche profunda / brisas de drenaje)
    1.00, 0.92, 0.85, 0.82, 0.84, 0.88, // 06h - 11h (valle matutino)
    0.95, 1.02, 1.08, 1.12, 1.15, 1.14, // 12h - 17h (brisas térmicas de tarde)
    1.12, 1.10, 1.11, 1.14, 1.16, 1.17  // 18h - 23h (atardecer y anochecer)
  ];

  // Pesos mensuales estacionales de viento en España (invierno/primavera > verano)
  var MONTHLY_WIND_WEIGHTS = [
    0.105, 0.098, 0.095, 0.088, 0.078, 0.068,
    0.064, 0.064, 0.070, 0.082, 0.090, 0.098
  ];

  // Pesos mensuales solares de referencia peninsular
  var MONTHLY_SOLAR_WEIGHTS = [
    0.045, 0.058, 0.082, 0.098, 0.118, 0.126,
    0.132, 0.120, 0.095, 0.068, 0.046, 0.032
  ];

  var DAYS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  /**
   * Genera el vector horario anual de 8760 horas para la generación eólica
   */
  function generateWindHourly8760(annualWindKwh) {
    var kwhTotal = (typeof annualWindKwh === 'number' && annualWindKwh > 0) ? annualWindKwh : 0;
    var hourly = new Float32Array(8760);
    if (kwhTotal <= 0) return hourly;

    var hourIdx = 0;
    var rawSum = 0;
    var rawValues = new Float32Array(8760);

    for (var m = 0; m < 12; m++) {
      var days = DAYS_PER_MONTH[m];
      var mWeight = MONTHLY_WIND_WEIGHTS[m];
      var baseFactor = mWeight / (days * 24);

      for (var d = 0; d < days; d++) {
        // Pseudo-variación sinóptica climática (ciclos de borrascas de 3 a 5 días)
        var synopticNoise = 0.85 + 0.30 * Math.sin((d + m * 30) * 0.45) + 0.15 * Math.cos((d * 1.8));
        if (synopticNoise < 0.2) synopticNoise = 0.2;

        for (var h = 0; h < 24; h++) {
          var val = baseFactor * DIURNAL_WIND_FACTORS[h] * synopticNoise;
          rawValues[hourIdx] = val;
          rawSum += val;
          hourIdx++;
        }
      }
    }

    // Normalizar a la energía neta anual exacta
    var scale = rawSum > 0 ? (kwhTotal / rawSum) : 0;
    for (var i = 0; i < 8760; i++) {
      hourly[i] = rawValues[i] * scale;
    }

    return hourly;
  }

  /**
   * Genera o adapta el vector de generación solar fotovoltaica a 8760 horas
   */
  function generateSolarHourly8760(solarAnnualKwh, monthlySolarKwh) {
    var hourly = new Float32Array(8760);
    var annualTotal = (typeof solarAnnualKwh === 'number' && solarAnnualKwh > 0) ? solarAnnualKwh : 0;
    if (annualTotal <= 0) return hourly;

    var mKwh = Array.isArray(monthlySolarKwh) && monthlySolarKwh.length === 12
      ? monthlySolarKwh
      : MONTHLY_SOLAR_WEIGHTS.map(function (w) { return annualTotal * w; });

    var hourIdx = 0;
    for (var m = 0; m < 12; m++) {
      var days = DAYS_PER_MONTH[m];
      var mTotal = mKwh[m] || 0;
      var dayTotal = days > 0 ? (mTotal / days) : 0;

      // Duración solar aproximada por mes (de 9h en dic a 15h en jun)
      var sunrise = 8.5 - 2.5 * Math.sin(((m - 2) / 12) * Math.PI * 2);
      var sunset = 17.5 + 3.5 * Math.sin(((m - 2) / 12) * Math.PI * 2);
      var daylightHours = Math.max(sunset - sunrise, 6);

      for (var d = 0; d < days; d++) {
        for (var h = 0; h < 24; h++) {
          var val = 0;
          if (h >= sunrise && h <= sunset) {
            var norm = (h - sunrise) / daylightHours; // 0..1
            var bell = Math.sin(norm * Math.PI);
            val = (dayTotal / (daylightHours * 0.6366)) * Math.max(0, bell);
          }
          hourly[hourIdx++] = val;
        }
      }
    }

    return hourly;
  }

  /**
   * Genera el perfil de consumo horario de demanda según tipo de consumidor
   */
  function generateDemandHourly8760(annualConsumptionKwh, profileType) {
    var kwh = (typeof annualConsumptionKwh === 'number' && annualConsumptionKwh > 0) ? annualConsumptionKwh : 30000;
    var profile = profileType || 'commercial_industrial'; // industrial, commercial, residential
    var hourly = new Float32Array(8760);

    // Curvas normalizadas por hora típica de día laborable
    var weekdayWeights;
    var weekendFactor = 0.40;

    if (profile === 'residential') {
      weekdayWeights = [
        0.02, 0.015, 0.015, 0.015, 0.018, 0.025, // 00h - 05h
        0.045, 0.065, 0.060, 0.045, 0.040, 0.040, // 06h - 11h
        0.055, 0.060, 0.050, 0.045, 0.045, 0.050, // 12h - 17h
        0.070, 0.085, 0.090, 0.080, 0.055, 0.030  // 18h - 23h
      ];
      weekendFactor = 1.05;
    } else {
      // Comercial e Industrial (picos de 08h a 19h)
      weekdayWeights = [
        0.020, 0.020, 0.020, 0.020, 0.022, 0.025,
        0.038, 0.060, 0.075, 0.080, 0.082, 0.080,
        0.075, 0.065, 0.068, 0.072, 0.075, 0.070,
        0.055, 0.040, 0.030, 0.025, 0.023, 0.020
      ];
    }

    var hourIdx = 0;
    var rawSum = 0;
    var raw = new Float32Array(8760);

    for (var m = 0; m < 12; m++) {
      var days = DAYS_PER_MONTH[m];
      for (var d = 0; d < days; d++) {
        var dayOfWeek = (d + 2) % 7; // aproximación arbitraria
        var isWeekend = (dayOfWeek === 5 || dayOfWeek === 6);
        var fDay = isWeekend ? weekendFactor : 1.0;

        for (var h = 0; h < 24; h++) {
          var v = weekdayWeights[h] * fDay;
          raw[hourIdx] = v;
          rawSum += v;
          hourIdx++;
        }
      }
    }

    var scale = rawSum > 0 ? (kwh / rawSum) : 0;
    for (var i = 0; i < 8760; i++) {
      hourly[i] = raw[i] * scale;
    }

    return hourly;
  }

  /**
   * Ejecuta el despacho energético horario de las 8760 horas del año.
   *
   * @param {Object} params
   * @param {number} params.annualSolarKwh
   * @param {number[]} [params.monthlySolarKwh]
   * @param {number} params.annualWindKwh
   * @param {number} params.annualConsumptionKwh
   * @param {number} [params.batteryCapacityKwh=0]
   * @param {number} [params.batteryMaxPowerKw=0]
   * @param {number} [params.gridExportLimitKw=100]
   * @param {number} [params.capexSolarEur=0]
   * @param {number} [params.capexWindEur=0]
   * @param {number} [params.gridPriceEurKwh=0.16]
   * @param {number} [params.feedInPriceEurKwh=0.06]
   */
  function simulateHybridDispatch8760(params) {
    var p = params || {};
    var annualSolar = p.annualSolarKwh || 0;
    var annualWind = p.annualWindKwh || 0;
    var annualCons = p.annualConsumptionKwh || 30000;
    var battCap = Math.max(0, p.batteryCapacityKwh || 0);
    var battMaxKw = Math.max(0, p.batteryMaxPowerKw || (battCap * 0.5));
    var gridLimitKw = (typeof p.gridExportLimitKw === 'number') ? p.gridExportLimitKw : 999999;
    var gridTariff = p.gridPriceEurKwh || 0.16;
    var feedInTariff = p.feedInPriceEurKwh || 0.06;

    var solarHourly = generateSolarHourly8760(annualSolar, p.monthlySolarKwh);
    var windHourly = generateWindHourly8760(annualWind);
    var demandHourly = generateDemandHourly8760(annualCons, p.consumptionProfile);

    var totalDirectSelfConsKwh = 0;
    var totalWindDirectSelfConsKwh = 0;
    var totalSolarDirectSelfConsKwh = 0;
    var totalBatteryDischargeKwh = 0;
    var totalGridImportKwh = 0;
    var totalGridExportKwh = 0;
    var totalCurtailmentKwh = 0;
    var totalGenKwh = 0;

    var currentSocKwh = battCap * 0.20; // 20% inicial
    var battEff = 0.92; // Eficiencia ciclo redondo 92%

    var peakDemandWithoutGenKw = 0;
    var peakDemandWithHybridKw = 0;

    // Resumen mensual
    var monthlyReport = [];
    for (var m = 0; m < 12; m++) {
      monthlyReport.push({
        solarKwh: 0,
        windKwh: 0,
        hybridGenKwh: 0,
        demandKwh: 0,
        selfConsKwh: 0,
        gridImportKwh: 0,
        gridExportKwh: 0,
        curtailmentKwh: 0
      });
    }

    var hIndex = 0;
    for (var month = 0; month < 12; month++) {
      var days = DAYS_PER_MONTH[month];
      var mRep = monthlyReport[month];

      for (var d = 0; d < days; d++) {
        for (var h = 0; h < 24; h++) {
          var pSolar = solarHourly[hIndex];
          var pWind = windHourly[hIndex];
          var pDemand = demandHourly[hIndex];
          var pGenTotal = pSolar + pWind;

          totalGenKwh += pGenTotal;
          mRep.solarKwh += pSolar;
          mRep.windKwh += pWind;
          mRep.hybridGenKwh += pGenTotal;
          mRep.demandKwh += pDemand;

          if (pDemand > peakDemandWithoutGenKw) {
            peakDemandWithoutGenKw = pDemand;
          }

          var directSelf = Math.min(pDemand, pGenTotal);
          totalDirectSelfConsKwh += directSelf;
          mRep.selfConsKwh += directSelf;

          // Prorrateo del autoconsumo entre fuentes
          if (pGenTotal > 0.001) {
            totalSolarDirectSelfConsKwh += directSelf * (pSolar / pGenTotal);
            totalWindDirectSelfConsKwh += directSelf * (pWind / pGenTotal);
          }

          var surplus = Math.max(0, pGenTotal - pDemand);
          var deficit = Math.max(0, pDemand - pGenTotal);

          // Gestión de Batería BESS
          if (battCap > 0 && surplus > 0 && currentSocKwh < battCap) {
            var maxCharge = Math.min(surplus, battMaxKw, (battCap - currentSocKwh) / battEff);
            currentSocKwh += maxCharge * battEff;
            surplus -= maxCharge;
          } else if (battCap > 0 && deficit > 0 && currentSocKwh > (battCap * 0.10)) {
            var usableBatt = currentSocKwh - (battCap * 0.10);
            var maxDischarge = Math.min(deficit, battMaxKw, usableBatt);
            currentSocKwh -= maxDischarge;
            deficit -= maxDischarge;
            totalBatteryDischargeKwh += maxDischarge;
            totalDirectSelfConsKwh += maxDischarge;
            mRep.selfConsKwh += maxDischarge;
          }

          // Balance final con la red
          if (deficit > 0) {
            totalGridImportKwh += deficit;
            mRep.gridImportKwh += deficit;
            if (deficit > peakDemandWithHybridKw) {
              peakDemandWithHybridKw = deficit;
            }
          }

          if (surplus > 0) {
            var canExport = Math.min(surplus, gridLimitKw);
            var curtail = surplus - canExport;
            totalGridExportKwh += canExport;
            totalCurtailmentKwh += curtail;
            mRep.gridExportKwh += canExport;
            mRep.curtailmentKwh += curtail;
          }

          hIndex++;
        }
      }
    }

    var totalUsefulSelfConsKwh = totalDirectSelfConsKwh;
    var totalCoverageKwh = totalUsefulSelfConsKwh;
    var selfConsumptionRatio = totalGenKwh > 0 ? (totalUsefulSelfConsKwh / totalGenKwh) : 0;
    var selfSufficiencyRatio = annualCons > 0 ? (totalUsefulSelfConsKwh / annualCons) : 0;
    var peakShavingReductionKw = Math.max(0, peakDemandWithoutGenKw - peakDemandWithHybridKw);
    var peakShavingPct = peakDemandWithoutGenKw > 0 ? ((peakShavingReductionKw / peakDemandWithoutGenKw) * 100) : 0;

    // Métricas económicas anuales
    var billBeforeEur = annualCons * gridTariff;
    var billEnergyAfterEur = (totalGridImportKwh * gridTariff) - (totalGridExportKwh * feedInTariff);
    // Ahorro adicional por peak-shaving en término de potencia (~38 €/kW/año en 3.0TD/6.1TD)
    var powerChargeSavingEur = peakShavingReductionKw * 38.5;
    var netAnnualSavingsEur = Math.max(0, (billBeforeEur - billEnergyAfterEur) + powerChargeSavingEur);

    // LCOE Híbrido a 25 años (Tasa descuento 4%, degradación FV 0.5%/a, eólica 0.8%/a, OPEX 1.5% CAPEX)
    var battCost = (p.batteryIncludedInSolarCapex || (p.capexSolarEur && global._lastFinModel && Math.abs(global._lastFinModel.capexTotal - p.capexSolarEur) < 1.0 && global._lastFinModel.capexBattery > 0))
      ? 0
      : (battCap * 420);
    var totalCapex = (p.capexSolarEur || 0) + (p.capexWindEur || 0) + battCost;
    var opexAnnual = totalCapex * 0.015;
    var discountRate = 0.04;
    var npvCost = totalCapex;
    var npvEnergy = 0;

    for (var yr = 1; yr <= 25; yr++) {
      var df = Math.pow(1 + discountRate, -yr);
      npvCost += opexAnnual * df;
      var degSolar = Math.pow(1 - 0.005, yr);
      var degWind = Math.pow(1 - 0.008, yr);
      var annualDegGen = (annualSolar * degSolar) + (annualWind * degWind);
      npvEnergy += annualDegGen * df;
    }

    var lcoeHybridEurKwh = npvEnergy > 0 ? (npvCost / npvEnergy) : 0;

    return {
      // [AUD-2026 · E-04] Trazabilidad: la serie horaria es SINTÉTICA (senos normalizados
      // a la energía anual), no un año meteorológico real. Los KPIs de autonomía y ahorro
      // deben presentarse como estimación de despacho, no como simulación bancable.
      seriesSource: 'synthetic-monthly-profile',
      isSyntheticSeries: true,
      seriesDisclaimer: 'Serie horaria sintética normalizada al anual; no sustituye a ERA5/PVGIS horario.',
      annualSolarKwh: Math.round(annualSolar),
      annualWindKwh: Math.round(annualWind),
      annualHybridGenKwh: Math.round(totalGenKwh),
      annualConsumptionKwh: Math.round(annualCons),
      totalSelfConsumptionKwh: Math.round(totalUsefulSelfConsKwh),
      solarSelfConsumptionKwh: Math.round(totalSolarDirectSelfConsKwh),
      windSelfConsumptionKwh: Math.round(totalWindDirectSelfConsKwh),
      batteryDischargeKwh: Math.round(totalBatteryDischargeKwh),
      gridImportKwh: Math.round(totalGridImportKwh),
      gridExportKwh: Math.round(totalGridExportKwh),
      curtailmentKwh: Math.round(totalCurtailmentKwh),
      selfConsumptionRatio: Number(selfConsumptionRatio.toFixed(3)),
      selfSufficiencyRatio: Number(selfSufficiencyRatio.toFixed(3)),
      peakDemandWithoutGenKw: Number(peakDemandWithoutGenKw.toFixed(1)),
      peakDemandWithHybridKw: Number(peakDemandWithHybridKw.toFixed(1)),
      peakShavingReductionKw: Number(peakShavingReductionKw.toFixed(1)),
      peakShavingPct: Number(peakShavingPct.toFixed(1)),
      annualSavingsEur: Math.round(netAnnualSavingsEur),
      lcoeHybridEurKwh: Number(lcoeHybridEurKwh.toFixed(4)),
      monthlyReport: monthlyReport
    };
  }

  var HybridDispatch = {
    generateWindHourly8760: generateWindHourly8760,
    generateSolarHourly8760: generateSolarHourly8760,
    generateDemandHourly8760: generateDemandHourly8760,
    simulateHybridDispatch8760: simulateHybridDispatch8760
  };

  RAWind.HybridDispatch = HybridDispatch;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = HybridDispatch;
  }

})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : global));
