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

  // Perfiles horarios TOU (€/kWh) alineados con financials.js (00h..23h) y compensación RD 244/2019
  var TOU_PROFILES = {
    plana:       { name: 'Tarifa Plana',        horas: new Array(24).fill(0.18), compensacion: 0.09 },
    '2periodos': { name: '2 Periodos D/N',      horas: new Array(24).fill(0.13).map(function (v, i) { return (i >= 8 && i < 23) ? 0.22 : v; }), compensacion: 0.09 },
    '3periodos': { name: '3 Periodos PVPC',     horas: [0.10,0.10,0.10,0.10,0.10,0.10,0.11,0.12,0.17,0.19,0.22,0.26,0.27,0.26,0.24,0.23,0.25,0.28,0.30,0.27,0.22,0.17,0.13,0.11], compensacion: 0.07 },
    mercado:     { name: 'Precio Mercado 2024', horas: [0.085,0.077,0.072,0.068,0.070,0.078,0.095,0.115,0.128,0.135,0.142,0.155,0.162,0.158,0.148,0.139,0.151,0.172,0.196,0.214,0.238,0.247,0.231,0.205], compensacion: 0.05 }
  };

  function _computeMonthSolarShape24h(m, latDeg) {
    var latRad = ((typeof latDeg === 'number' && !isNaN(latDeg)) ? latDeg : 40.4) * Math.PI / 180;
    // Declinación solar aproximada a mitad del mes (m=0 Ene .. m=11 Dic)
    var midDoy = [15, 45, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349][m] || 180;
    var declRad = (23.44 * Math.PI / 180) * Math.sin((2 * Math.PI / 365) * (midDoy - 81));
    var cosWs = Math.max(-0.96, Math.min(0.96, -Math.tan(latRad) * Math.tan(declRad)));
    var halfDayH = (Math.acos(cosWs) * 180 / Math.PI) / 15.0;
    // Mediodía local peninsular medio (~13.0h CET/CEST) -> Invierno Dic ~8.35h-17.65h (~9.3h), Verano Jun ~5.55h-20.45h (~14.9h)
    var noonLocal = 13.0;
    var sunrise = noonLocal - halfDayH;
    var sunset = noonLocal + halfDayH;
    var span = Math.max(sunset - sunrise, 2.0);
    var rawBell = new Array(24);
    var sumBell = 0;
    for (var h0 = 0; h0 < 24; h0++) {
      var bVal = 0;
      if (h0 + 0.5 > sunrise && h0 + 0.5 < sunset) {
        var norm = (h0 + 0.5 - sunrise) / span;
        bVal = Math.max(0, Math.sin(norm * Math.PI));
      }
      rawBell[h0] = bVal;
      sumBell += bVal;
    }
    if (sumBell <= 0) sumBell = 1;
    return rawBell.map(function (v) { return v / sumBell; });
  }

  /**
   * Genera el vector horario anual de 8760 horas para la generación solar fotovoltaica
   */
  function generateSolarHourly8760(solarAnnualKwh, monthlySolarKwh, latDeg) {
    var hourly = new Float32Array(8760);
    var annualTotal = (typeof solarAnnualKwh === 'number' && solarAnnualKwh > 0) ? solarAnnualKwh : 0;
    if (annualTotal <= 0) return hourly;

    var mKwh = Array.isArray(monthlySolarKwh) && monthlySolarKwh.length === 12
      ? monthlySolarKwh
      : MONTHLY_SOLAR_WEIGHTS.map(function (w) { return annualTotal * w; });

    var hourIdx = 0;
    for (var m = 0; m < 12; m++) {
      var days = DAYS_PER_MONTH[m];
      var dayTotal = days > 0 ? ((mKwh[m] || 0) / days) : 0;
      var shape24 = _computeMonthSolarShape24h(m, latDeg);
      for (var d = 0; d < days; d++) {
        for (var h = 0; h < 24; h++) {
          hourly[hourIdx++] = dayTotal * shape24[h];
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
    var dispatchMode = (p.dispatchMode === 'full_8760' || p.dispatchMode === '8760') ? 'full_8760' : 'fast_288';
    var annualSolar = p.annualSolarKwh || 0;
    var annualWind = p.annualWindKwh || 0;
    var annualCons = p.annualConsumptionKwh || 30000;
    var battCap = Math.max(0, p.batteryCapacityKwh || 0);
    var battMaxKw = Math.max(0, p.batteryMaxPowerKw || (battCap * 0.5));
    var gridLimitKw = (typeof p.gridExportLimitKw === 'number') ? p.gridExportLimitKw : 999999;

    // Resolver tarifa TOU y compensación de excedentes coherente con financials.js
    var fmRef = (typeof global !== 'undefined' && global._lastFinModel) ? global._lastFinModel : null;
    var touKey = p.touTariff || (fmRef && fmRef.touTarifa) || 'plana';
    var touObj = TOU_PROFILES[touKey] || TOU_PROFILES.plana;
    var touHoras = Array.isArray(p.touHoras) && p.touHoras.length === 24 ? p.touHoras : touObj.horas;
    var explicitGridPrice = (typeof p.gridPriceEurKwh === 'number' && p.gridPriceEurKwh > 0) ? p.gridPriceEurKwh : null;
    var feedInTariff = (typeof p.feedInPriceEurKwh === 'number' && p.feedInPriceEurKwh >= 0)
      ? p.feedInPriceEurKwh
      : ((fmRef && typeof fmRef.precioCompensacionEUR === 'number') ? fmRef.precioCompensacionEUR : touObj.compensacion);
    var hasVirtualBattery = !!(p.hasVirtualBattery || (fmRef && fmRef.hasVirtualBattery));

    var totalDirectSelfConsKwh = 0;
    var totalWindDirectSelfConsKwh = 0;
    var totalSolarDirectSelfConsKwh = 0;
    var totalBatteryDischargeKwh = 0;
    var totalGridImportKwh = 0;
    var totalGridExportKwh = 0;
    var totalCurtailmentKwh = 0;
    var totalGenKwh = 0;

    var currentSocKwh = 0;
    var battEff = 0.92;
    var peakDemandWithoutGenKw = 0;
    var peakDemandWithHybridKw = 0;
    var billBeforeEur = 0;
    var billEnergyAfterEur = 0;
    var rd244CapApplied = false;

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
        curtailmentKwh: 0,
        importCostEur: 0,
        exportIncomeEur: 0
      });
    }

    function stepDispatchHour(monthIdx, hourOfDay, pSolar, pWind, pDemand, dayWeight) {
      var mRep = monthlyReport[monthIdx];
      var pGenTotal = pSolar + pWind;
      var hPrice = explicitGridPrice !== null ? explicitGridPrice : (touHoras[hourOfDay] || 0.18);

      totalGenKwh += pGenTotal * dayWeight;
      mRep.solarKwh += pSolar * dayWeight;
      mRep.windKwh += pWind * dayWeight;
      mRep.hybridGenKwh += pGenTotal * dayWeight;
      mRep.demandKwh += pDemand * dayWeight;
      billBeforeEur += pDemand * hPrice * dayWeight;

      if (pDemand > peakDemandWithoutGenKw) peakDemandWithoutGenKw = pDemand;

      var directSelf = Math.min(pDemand, pGenTotal);
      totalDirectSelfConsKwh += directSelf * dayWeight;
      mRep.selfConsKwh += directSelf * dayWeight;

      if (pGenTotal > 0.001) {
        totalSolarDirectSelfConsKwh += directSelf * (pSolar / pGenTotal) * dayWeight;
        totalWindDirectSelfConsKwh += directSelf * (pWind / pGenTotal) * dayWeight;
      }

      var surplus = Math.max(0, pGenTotal - pDemand);
      var deficit = Math.max(0, pDemand - pGenTotal);

      if (battCap > 0 && surplus > 0 && currentSocKwh < battCap) {
        var maxCharge = Math.min(surplus, battMaxKw, (battCap - currentSocKwh) / battEff);
        currentSocKwh += maxCharge * battEff;
        surplus -= maxCharge;
      } else if (battCap > 0 && deficit > 0 && currentSocKwh > (battCap * 0.10)) {
        var usableBatt = currentSocKwh - (battCap * 0.10);
        var maxDischarge = Math.min(deficit, battMaxKw, usableBatt);
        currentSocKwh -= maxDischarge;
        deficit -= maxDischarge;
        totalBatteryDischargeKwh += maxDischarge * dayWeight;
        totalDirectSelfConsKwh += maxDischarge * dayWeight;
        mRep.selfConsKwh += maxDischarge * dayWeight;
      }

      if (deficit > 0) {
        totalGridImportKwh += deficit * dayWeight;
        mRep.gridImportKwh += deficit * dayWeight;
        mRep.importCostEur += deficit * hPrice * dayWeight;
        if (deficit > peakDemandWithHybridKw) peakDemandWithHybridKw = deficit;
      }

      if (surplus > 0) {
        var canExport = Math.min(surplus, gridLimitKw);
        var curtail = surplus - canExport;
        totalGridExportKwh += canExport * dayWeight;
        totalCurtailmentKwh += curtail * dayWeight;
        mRep.gridExportKwh += canExport * dayWeight;
        mRep.exportIncomeEur += canExport * feedInTariff * dayWeight;
        mRep.curtailmentKwh += curtail * dayWeight;
      }
    }

    var simulatedHours = 0;
    if (dispatchMode === 'full_8760') {
      var solarHourly = generateSolarHourly8760(annualSolar, p.monthlySolarKwh, p.latDeg);
      var windHourly = generateWindHourly8760(annualWind);
      var demandHourly = generateDemandHourly8760(annualCons, p.consumptionProfile);
      var hIndex = 0;
      for (var month = 0; month < 12; month++) {
        var days = DAYS_PER_MONTH[month];
        for (var d = 0; d < days; d++) {
          for (var h = 0; h < 24; h++) {
            stepDispatchHour(month, h, solarHourly[hIndex], windHourly[hIndex], demandHourly[hIndex], 1);
            hIndex++;
          }
        }
      }
      simulatedHours = 8760;
    } else {
      // Modo rápido por defecto: 12 días tipo mensuales × 24 horas = 288 pasos con convergencia cíclica de SoC
      var mSolarArr = Array.isArray(p.monthlySolarKwh) && p.monthlySolarKwh.length === 12
        ? p.monthlySolarKwh
        : MONTHLY_SOLAR_WEIGHTS.map(function (w) { return annualSolar * w; });
      var isRes = (p.consumptionProfile === 'residential');
      var wDay = isRes
        ? [0.02,0.015,0.015,0.015,0.018,0.025,0.045,0.065,0.060,0.045,0.040,0.040,0.055,0.060,0.050,0.045,0.045,0.050,0.070,0.085,0.090,0.080,0.055,0.030]
        : [0.020,0.020,0.020,0.020,0.022,0.025,0.038,0.060,0.075,0.080,0.082,0.080,0.075,0.065,0.068,0.072,0.075,0.070,0.055,0.040,0.030,0.025,0.023,0.020];
      var wkBlend = isRes ? ((5 + 2 * 1.05) / 7) : ((5 + 2 * 0.40) / 7);
      var sumWDay = wDay.reduce(function (a, b) { return a + b; }, 0) || 1;
      var consDayTotal = annualCons / 365.0;

      for (var mFast = 0; mFast < 12; mFast++) {
        var mDays = DAYS_PER_MONTH[mFast];
        var solarDayKwh = (mSolarArr[mFast] || 0) / mDays;
        var windDayKwh = (annualWind * MONTHLY_WIND_WEIGHTS[mFast]) / mDays;
        var shape24 = _computeMonthSolarShape24h(mFast, p.latDeg);
        var sumWind24 = DIURNAL_WIND_FACTORS.reduce(function (a, b) { return a + b; }, 0) || 24;

        // Pre-calentamiento cíclico de 1 día para estabilizar SoC sin sesgo de origen
        if (battCap > 0) {
          for (var hw = 0; hw < 24; hw++) {
            var pSw = solarDayKwh * shape24[hw];
            var pWw = windDayKwh * (DIURNAL_WIND_FACTORS[hw] / sumWind24);
            var pDw = consDayTotal * (wDay[hw] / sumWDay);
            var sNet = pSw + pWw - pDw;
            if (sNet > 0 && currentSocKwh < battCap) {
              currentSocKwh += Math.min(sNet, battMaxKw, (battCap - currentSocKwh) / battEff) * battEff;
            } else if (sNet < 0 && currentSocKwh > battCap * 0.10) {
              currentSocKwh -= Math.min(-sNet, battMaxKw, currentSocKwh - battCap * 0.10);
            }
          }
        }

        for (var hh = 0; hh < 24; hh++) {
          var pS = solarDayKwh * shape24[hh];
          var pW = windDayKwh * (DIURNAL_WIND_FACTORS[hh] / sumWind24);
          var pD = consDayTotal * (wDay[hh] / sumWDay);
          stepDispatchHour(mFast, hh, pS, pW, pD, mDays);
          simulatedHours++;
        }
      }
    }

    // Techo legal RD 244/2019 por ciclo mensual en factura (sin batería virtual no hay saldo negativo neto)
    for (var mc = 0; mc < 12; mc++) {
      var mObj = monthlyReport[mc];
      var effExpEur = hasVirtualBattery ? mObj.exportIncomeEur : Math.min(mObj.importCostEur, mObj.exportIncomeEur);
      if (!hasVirtualBattery && mObj.exportIncomeEur > mObj.importCostEur) {
        rd244CapApplied = true;
      }
      billEnergyAfterEur += (mObj.importCostEur - effExpEur);
    }

    var totalUsefulSelfConsKwh = totalDirectSelfConsKwh;
    var selfConsumptionRatio = totalGenKwh > 0 ? (totalUsefulSelfConsKwh / totalGenKwh) : 0;
    var selfSufficiencyRatio = annualCons > 0 ? (totalUsefulSelfConsKwh / annualCons) : 0;
    var peakShavingReductionKw = Math.max(0, peakDemandWithoutGenKw - peakDemandWithHybridKw);
    var peakShavingPct = peakDemandWithoutGenKw > 0 ? ((peakShavingReductionKw / peakDemandWithoutGenKw) * 100) : 0;

    var powerChargeSavingEur = peakShavingReductionKw * 38.5;
    var netAnnualSavingsEur = Math.max(0, (billBeforeEur - billEnergyAfterEur) + powerChargeSavingEur);

    // LCOE Híbrido a 25 años alineado con financials.js (degradación FV Y1+anual, eólica, OPEX indexado IPC 2%)
    var solarCapexRef = (p.capexSolarEur || 0);
    var hasSolarBatInFin = !!(fmRef && ((fmRef.batCost || 0) > 0 || (fmRef.capexBattery || 0) > 0));
    var battCost = (p.batteryIncludedInSolarCapex || (solarCapexRef > 0 && hasSolarBatInFin))
      ? 0
      : (battCap * 420);
    var totalCapex = solarCapexRef + (p.capexWindEur || 0) + battCost;
    var totalRatedKw = Number(p.totalRatedKw) || 0;
    var opexYear1 = totalCapex > 0 ? Math.max(90, Math.max(totalRatedKw * 15, totalCapex * 0.01)) : 0;
    var ipcOpex = 0.020;
    var degSolarY1 = (typeof p.degYear1 === 'number') ? p.degYear1 : 0.020;
    var degSolarAnn = (typeof p.degAnnual === 'number') ? p.degAnnual : 0.0055;
    var degWindAnn = 0.008;
    var discountRate = 0.04;
    var npvCost = totalCapex;
    var npvEnergy = 0;

    for (var yr = 1; yr <= 25; yr++) {
      var df = Math.pow(1 + discountRate, -yr);
      npvCost += (opexYear1 * Math.pow(1 + ipcOpex, yr - 1)) * df;
      var degSolar = Math.max(0.5, (1 - degSolarY1) * Math.pow(1 - degSolarAnn, Math.max(0, yr - 1)));
      var degWind = Math.pow(1 - degWindAnn, yr);
      var annualDegGen = (annualSolar * degSolar) + (annualWind * degWind);
      npvEnergy += annualDegGen * df;
    }

    var lcoeHybridEurKwh = npvEnergy > 0 ? (npvCost / npvEnergy) : 0;

    return {
      dispatchMode: dispatchMode,
      simulatedHours: simulatedHours,
      isAuditable8760: dispatchMode === 'full_8760',
      touTariff: touKey,
      touName: touObj.name,
      rd244CapApplied: rd244CapApplied,
      seriesSource: dispatchMode === 'full_8760' ? 'auditable-8760h-synthetic-weather' : 'fast-288h-representative-profile',
      isSyntheticSeries: true,
      seriesDisclaimer: dispatchMode === 'full_8760'
        ? 'Simulación horaria completa 8760h con estocasticidad sinóptica, TOU y techo RD 244/2019.'
        : 'Perfil representativo 288h (12 meses × 24h) alineado a TOU y RD 244/2019.',
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
      capexBreakdown: {
        solarEur: Math.round(solarCapexRef),
        windEur: Math.round(p.capexWindEur || 0),
        batteryEur: Math.round(battCost),
        totalEur: Math.round(totalCapex)
      },
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
