/**
 * js/datadis-tariff-optimizer.js — Gemelo 8760h + CSV Cuartohorario Datadis + Optimizador P1..P6 [F7-10]
 * ======================================================================================================
 * Motor puro desacoplado de la UI que:
 * 1. Importa curvas reales de consumo horario o cuartohorario (CSV de Datadis, i-DE, e-distribución, UFD).
 * 2. Clasifica periodos tarifarios CNMC españoles (2.0TD P1..P3 / 3.0TD y 6.1TD P1..P6).
 * 3. Acopla generación horaria solar 8760h (+ eólica híbrida si existe) y despacho BESS (autoconsumo/TOU/RD244).
 * 4. Optimiza las potencias contratadas P1..P6 sobre el maxímetro cuartohorario real post-FV+BESS.
 */
(function (global) {
  'use strict';

  // Precios de referencia España (peajes + cargos + término energía típico €/kWh y potencia €/kW·año)
  var TARIFF_DEFAULTS = {
    '2.0TD': {
      name: '2.0TD (Residencial / Pequeño Negocio <= 15 kW)',
      periods: 3,
      powerPeriods: 2,
      energyEurKwh: [0.215, 0.145, 0.095],
      powerEurKwYear: [30.67, 4.18],
      surplusEurKwh: 0.065
    },
    '3.0TD': {
      name: '3.0TD (Comercial / Industrial BT > 15 kW)',
      periods: 6,
      powerPeriods: 6,
      energyEurKwh: [0.195, 0.172, 0.148, 0.128, 0.112, 0.094],
      powerEurKwYear: [26.80, 21.50, 14.90, 11.40, 7.60, 4.10],
      surplusEurKwh: 0.058
    },
    '6.1TD': {
      name: '6.1TD (Industrial Media Tensión)',
      periods: 6,
      powerPeriods: 6,
      energyEurKwh: [0.175, 0.155, 0.135, 0.118, 0.102, 0.086],
      powerEurKwYear: [22.90, 18.40, 12.10, 9.20, 6.10, 3.20],
      surplusEurKwh: 0.052
    }
  };

  // Temporadas CNMC Península (mes 1..12 -> 'A' Alta, 'B' Media-Alta, 'B1' Media, 'C' Baja)
  var CNMC_SEASON_BY_MONTH = {
    1: 'A', 2: 'A', 7: 'A', 12: 'A',
    3: 'B', 11: 'B',
    6: 'B1', 8: 'B1', 9: 'B1',
    4: 'C', 5: 'C', 10: 'C'
  };

  function _num(v, fb) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : fb;
    if (typeof v === 'string') {
      var clean = v.trim().replace(/\s+/g, '');
      // Si tiene coma y punto, decidir separador decimal
      if (clean.indexOf(',') !== -1 && clean.indexOf('.') !== -1) {
        if (clean.lastIndexOf(',') > clean.lastIndexOf('.')) {
          clean = clean.replace(/\./g, '').replace(',', '.');
        } else {
          clean = clean.replace(/,/g, '');
        }
      } else if (clean.indexOf(',') !== -1) {
        clean = clean.replace(',', '.');
      }
      var n = parseFloat(clean);
      return Number.isFinite(n) ? n : fb;
    }
    return fb;
  }

  function _parseDateFlexible(raw) {
    if (!raw) return null;
    var s = String(raw).trim().replace(/^"|"$/g, '');
    // dd/mm/yyyy o dd-mm-yyyy
    var m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (m) {
      return { y: parseInt(m[3], 10), m: parseInt(m[2], 10), d: parseInt(m[1], 10) };
    }
    // yyyy-mm-dd o yyyy/mm/dd
    m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (m) {
      return { y: parseInt(m[1], 10), m: parseInt(m[2], 10), d: parseInt(m[3], 10) };
    }
    return null;
  }

  function _parseHourAndQuarter(rawHour, rawDateFull) {
    var h = 0;
    var q = 0;
    var s = String(rawHour || '').trim().replace(/^"|"$/g, '');
    if (!s && rawDateFull && rawDateFull.indexOf(' ') !== -1) {
      s = rawDateFull.split(/\s+/)[1] || '';
    }
    var mTime = s.match(/^(\d{1,2}):(\d{2})/);
    if (mTime) {
      h = parseInt(mTime[1], 10);
      var mins = parseInt(mTime[2], 10);
      if (h === 24) { h = 23; q = 3; }
      else q = Math.min(3, Math.floor(mins / 15));
      return { hour: Math.max(0, Math.min(23, h)), quarter: q };
    }
    var numH = parseInt(s, 10);
    if (Number.isFinite(numH)) {
      // Datadis usa horas 1..24 -> 0..23
      if (numH >= 1 && numH <= 24) h = numH - 1;
      else h = Math.max(0, Math.min(23, numH));
    }
    return { hour: h, quarter: q };
  }

  function _dayOfYear(y, m, d) {
    var dt = new Date(Date.UTC(y || 2025, (m || 1) - 1, d || 1));
    var start = new Date(Date.UTC(y || 2025, 0, 1));
    var diff = Math.floor((dt - start) / 86400000);
    return Math.max(0, Math.min(364, diff));
  }

  function _dayOfWeek(y, m, d) {
    return new Date(Date.UTC(y || 2025, (m || 1) - 1, d || 1)).getUTCDay(); // 0=Dom, 6=Sab
  }

  /**
   * Clasificación de periodo tarifario CNMC (1-indexed: 1..3 en 2.0TD, 1..6 en 3.0TD/6.1TD)
   */
  function getCnmcPeriod(tariff, month, dayOfWeek, hour) {
    var isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
    if (tariff === '2.0TD') {
      if (isWeekend || hour < 8) return 3; // Valle
      if ((hour >= 10 && hour < 14) || (hour >= 18 && hour < 22)) return 1; // Punta
      return 2; // Llano
    }
    // 3.0TD / 6.1TD (Circular CNMC 3/2020 Península)
    if (isWeekend || hour < 8) return 6;
    var season = CNMC_SEASON_BY_MONTH[month] || 'B';
    var isPuntaBlock = (hour >= 9 && hour < 14) || (hour >= 18 && hour < 22);
    if (season === 'A') return isPuntaBlock ? 1 : 2;
    if (season === 'B') return isPuntaBlock ? 2 : 3;
    if (season === 'B1') return isPuntaBlock ? 3 : 4;
    return isPuntaBlock ? 4 : 5;
  }

  function getPowerPeriodIndex(tariff, energyPeriod) {
    if (tariff === '2.0TD') {
      return energyPeriod === 3 ? 1 : 0; // P1 Punta/Llano, P2 Valle
    }
    return Math.max(0, Math.min(5, energyPeriod - 1));
  }

  /**
   * Parsea un CSV de Datadis / distribuidora eléctrica española.
   * Devuelve matriz 8760h de energía (kWh) y maxímetro cuartohorario real (kW) por hora.
   */
  function parseDatadisCsv(csvText) {
    var text = String(csvText || '').replace(/^\uFEFF/, '');
    var lines = text.split(/\r?\n/).filter(function (l) { return l.trim().length > 0; });
    if (lines.length < 2) {
      throw new Error('El archivo CSV está vacío o tiene menos de 2 líneas.');
    }

    // Detectar delimitador predominante en la cabecera
    var headerLine = lines[0];
    var sep = (headerLine.split(';').length >= headerLine.split(',').length) ? ';' : ',';
    var headers = headerLine.split(sep).map(function (h) {
      return h.trim().toLowerCase().replace(/^"|"$/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    });

    var idxDate = headers.findIndex(function (h) { return h.indexOf('fecha') !== -1 || h.indexOf('date') !== -1; });
    var idxHour = headers.findIndex(function (h) { return h.indexOf('hora') !== -1 || h.indexOf('hour') !== -1 || h.indexOf('time') !== -1; });
    var idxCons = headers.findIndex(function (h) {
      return h.indexOf('consumo') !== -1 || h.indexOf('activa') !== -1 || h.indexOf('ae_kwh') !== -1 || h.indexOf('kwh') !== -1 || h.indexOf('valor') !== -1;
    });
    var idxCups = headers.findIndex(function (h) { return h.indexOf('cups') !== -1; });

    // Fallback posicional clásico Datadis: CUPS;Fecha;Hora;Consumo_kWh;Metodo
    if (idxDate === -1 && headers.length >= 4) idxDate = 1;
    if (idxHour === -1 && headers.length >= 4) idxHour = 2;
    if (idxCons === -1 && headers.length >= 4) idxCons = 3;

    var hourlyKwh = new Float64Array(8760);
    var hourlyPeakKw = new Float64Array(8760);
    var hourlyCounts = new Uint8Array(8760);
    var seenQuarterKeys = new Set();
    var hasSubHourMinutes = false;
    var detectedYear = null;
    var cups = '';
    var validRows = 0;

    for (var i = 1; i < lines.length; i++) {
      var cols = lines[i].split(sep);
      if (cols.length <= idxCons) continue;
      if (!cups && idxCups >= 0 && cols[idxCups]) cups = cols[idxCups].trim().replace(/^"|"$/g, '');

      var dt = _parseDateFlexible(cols[idxDate]);
      if (!dt) continue;
      if (detectedYear === null) detectedYear = dt.y;
      // Si el CSV contiene más de un año civil, restringir al año más reciente/inicial para evitar sumar 2× anual
      if (dt.y !== detectedYear) continue;
      var tq = _parseHourAndQuarter(idxHour >= 0 ? cols[idxHour] : '', cols[idxDate]);
      if (tq.quarter > 0) hasSubHourMinutes = true;
      var kwh = _num(cols[idxCons], NaN);
      if (!Number.isFinite(kwh) || kwh < 0) continue;

      if (headers[idxCons] && headers[idxCons].indexOf('wh') !== -1 && headers[idxCons].indexOf('kwh') === -1) {
        kwh = kwh / 1000;
      }

      var doy = _dayOfYear(dt.y, dt.m, dt.d);
      var hIdx = doy * 24 + tq.hour;
      if (hIdx < 0 || hIdx >= 8760) continue;

      // Deduplicar posibles filas repetidas (ej. cambio de hora o bisiesto 31-dic)
      var slotKey = hIdx * 4 + tq.quarter;
      if (seenQuarterKeys.has(slotKey)) continue;
      seenQuarterKeys.add(slotKey);

      hourlyKwh[hIdx] += kwh;
      hourlyCounts[hIdx]++;
      validRows++;
    }

    if (validRows === 0) {
      throw new Error('No se encontraron registros válidos de fecha/consumo en el CSV.');
    }

    var isQuarterHourly = hasSubHourMinutes;
    var quarterPeakKw = new Float32Array(35040);
    if (isQuarterHourly) {
      var seenPass2 = new Set();
      for (var i2 = 1; i2 < lines.length; i2++) {
        var cols2 = lines[i2].split(sep);
        if (cols2.length <= idxCons) continue;
        var dt2 = _parseDateFlexible(cols2[idxDate]);
        if (!dt2 || dt2.y !== detectedYear) continue;
        var tq2 = _parseHourAndQuarter(idxHour >= 0 ? cols2[idxHour] : '', cols2[idxDate]);
        var kwh2 = _num(cols2[idxCons], NaN);
        if (!Number.isFinite(kwh2) || kwh2 < 0) continue;
        if (headers[idxCons] && headers[idxCons].indexOf('wh') !== -1 && headers[idxCons].indexOf('kwh') === -1) kwh2 /= 1000;
        var hIdx2 = _dayOfYear(dt2.y, dt2.m, dt2.d) * 24 + tq2.hour;
        var sk2 = hIdx2 * 4 + tq2.quarter;
        if (hIdx2 >= 0 && hIdx2 < 8760 && sk2 >= 0 && sk2 < 35040 && !seenPass2.has(sk2)) {
          seenPass2.add(sk2);
          var kw15 = kwh2 * 4.0;
          quarterPeakKw[sk2] = kw15;
          if (kw15 > hourlyPeakKw[hIdx2]) hourlyPeakKw[hIdx2] = kw15;
        }
      }
    } else {
      for (var h = 0; h < 8760; h++) {
        hourlyPeakKw[h] = hourlyKwh[h];
        var qBase = h * 4;
        quarterPeakKw[qBase] = hourlyKwh[h];
        quarterPeakKw[qBase + 1] = hourlyKwh[h];
        quarterPeakKw[qBase + 2] = hourlyKwh[h];
        quarterPeakKw[qBase + 3] = hourlyKwh[h];
      }
    }

    // Extrapolar días huecos si el CSV cubre menos de 365 días (ej. 1-6 meses)
    var filledHours = 0;
    var sumKwh = 0;
    var maxPeakKw = 0;
    for (var k = 0; k < 8760; k++) {
      if (hourlyCounts[k] > 0) {
        filledHours++;
        sumKwh += hourlyKwh[k];
        if (hourlyPeakKw[k] > maxPeakKw) maxPeakKw = hourlyPeakKw[k];
      }
    }
    var coveragePct = (filledHours / 8760) * 100;
    if (filledHours > 24 && filledHours < 8600) {
      // Rellenar horas faltantes con el promedio de esa misma hora del día
      var hourSums = new Float64Array(24);
      var hourPeaks = new Float64Array(24);
      var hourCnts = new Uint16Array(24);
      for (var k2 = 0; k2 < 8760; k2++) {
        if (hourlyCounts[k2] > 0) {
          var hd = k2 % 24;
          hourSums[hd] += hourlyKwh[k2];
          hourPeaks[hd] = Math.max(hourPeaks[hd], hourlyPeakKw[k2]);
          hourCnts[hd]++;
        }
      }
      for (var k3 = 0; k3 < 8760; k3++) {
        if (hourlyCounts[k3] === 0) {
          var hd2 = k3 % 24;
          hourlyKwh[k3] = hourCnts[hd2] > 0 ? (hourSums[hd2] / hourCnts[hd2]) : 0;
          hourlyPeakKw[k3] = hourCnts[hd2] > 0 ? (hourPeaks[hd2] * 0.85) : 0;
        }
      }
    }

    var annualTotalKwh = 0;
    for (var t = 0; t < 8760; t++) annualTotalKwh += hourlyKwh[t];

    return {
      cups: cups || 'ES0000000000000000XX',
      year: detectedYear || 2025,
      validRows: validRows,
      isQuarterHourly: isQuarterHourly,
      coveragePct: Number(coveragePct.toFixed(1)),
      annualKwh: Math.round(annualTotalKwh),
      maxPeakKw: Number(maxPeakKw.toFixed(2)),
      hourlyKwh: hourlyKwh,
      hourlyPeakKw: hourlyPeakKw,
      quarterPeakKw: quarterPeakKw,
      suggestedTariff: maxPeakKw > 15 ? (maxPeakKw > 450 ? '6.1TD' : '3.0TD') : '2.0TD'
    };
  }

  /**
   * Genera una curva solar + eólica 8760h realista sincronizada con el proyecto activo.
   */
  function buildProjectSolarHourly8760(annualSolarKwh, latDeg, calcs) {
    var out = new Float64Array(8760);
    var windAnnualKwh = (calcs && calcs.wind && Number(calcs.wind.annualKwh) > 0) ? Number(calcs.wind.annualKwh) : 0;
    var totalTarget = _num(annualSolarKwh, 0);
    if (!(totalTarget > 0) && !(windAnnualKwh > 0)) return out;
    var lat = _num(latDeg, 40.4) * Math.PI / 180;
    var tiltRad = _num(calcs && calcs.tiltDeg, 20) * Math.PI / 180;
    var azRad = (_num(calcs && calcs.azimuthDeg, 180) - 180) * Math.PI / 180;
    var monthDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    var rawMonthSums = new Float64Array(12);
    var rawSum = 0;
    var dayCursor = 0;
    for (var m = 0; m < 12; m++) {
      for (var d = 0; d < monthDays[m]; d++, dayCursor++) {
        var decl = 23.45 * Math.PI / 180 * Math.sin(2 * Math.PI * (284 + dayCursor) / 365);
        var cloud = 0.82 + 0.18 * Math.sin(dayCursor * 0.71 + 1.3) * Math.cos(dayCursor * 0.29);
        for (var hr = 0; hr < 24; hr++) {
          var omega = (hr + 0.5 - 12) * 15 * Math.PI / 180;
          var sinAlt = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(omega);
          if (sinAlt > 0.02) {
            var cosAlt = Math.sqrt(Math.max(0, 1 - sinAlt * sinAlt));
            var cosInc = Math.max(0.05, sinAlt * Math.cos(tiltRad) + cosAlt * Math.sin(tiltRad) * Math.cos(omega - azRad));
            var val = Math.pow(cosInc, 1.05) * Math.max(0.35, cloud);
            out[dayCursor * 24 + hr] = val;
            rawMonthSums[m] += val;
            rawSum += val;
          }
        }
      }
    }
    var monthlySolar = (calcs && Array.isArray(calcs.monthlySolarKWh) && calcs.monthlySolarKWh.length === 12) ? calcs.monthlySolarKWh : null;
    if (monthlySolar) {
      var dCur2 = 0;
      for (var m2 = 0; m2 < 12; m2++) {
        var mScale = rawMonthSums[m2] > 0 ? (_num(monthlySolar[m2], 0) / rawMonthSums[m2]) : 0;
        for (var d2 = 0; d2 < monthDays[m2]; d2++, dCur2++) {
          for (var hr2 = 0; hr2 < 24; hr2++) out[dCur2 * 24 + hr2] *= mScale;
        }
      }
    } else if (rawSum > 0 && totalTarget > 0) {
      var scale = totalTarget / rawSum;
      for (var i = 0; i < 8760; i++) out[i] *= scale;
    }
    if (windAnnualKwh > 0) {
      var monthlyWind = (calcs && calcs.wind && Array.isArray(calcs.wind.monthlyKwh) && calcs.wind.monthlyKwh.length === 12) ? calcs.wind.monthlyKwh : null;
      var dCurW = 0;
      for (var mw = 0; mw < 12; mw++) {
        var mWindKwh = monthlyWind ? _num(monthlyWind[mw], 0) : (windAnnualKwh * (monthDays[mw] / 365));
        var hWindAvg = mWindKwh / (monthDays[mw] * 24);
        for (var dw = 0; dw < monthDays[mw]; dw++, dCurW++) {
          for (var hrw = 0; hrw < 24; hrw++) out[dCurW * 24 + hrw] += hWindAvg;
        }
      }
    }
    return out;
  }

  /**
   * Evalúa el coste anual del término de potencia según Circular CNMC 3/2020 (12 meses × cuartos de hora).
   * periodPeaksList[p] puede ser un array de 12 arrays mensuales de cuartos de hora o un array plano.
   */
  function evaluatePowerBillForVector(tariff, contractedKw, periodPeaksList, powerPrices, periodIndices) {
    var nP = contractedKw.length;
    var fixedCost = 0;
    var excessPenalty = 0;
    var is30 = tariff !== '2.0TD';
    var kpTable = [1.0, 0.5, 0.37, 0.37, 0.37, 0.17];
    var TEP_CNMC = 1.4064;
    for (var p = 0; p < nP; p++) {
      var realPeriodIdx = (Array.isArray(periodIndices) && typeof periodIndices[p] === 'number') ? periodIndices[p] : p;
      var pc = Math.max(0.1, contractedKw[p]);
      var priceYear = powerPrices[p] || 10;
      fixedCost += pc * priceYear;
      var peaksEntry = periodPeaksList[p] || [];
      if (is30) {
        // Circular CNMC 3/2020 exacta: Σ_mes (K_p · tep · √(Σ_{cuarto en mes} (Pd_i - Pc_p)²))
        var kp = kpTable[realPeriodIdx] || 0.37;
        if (peaksEntry.length === 12 && Array.isArray(peaksEntry[0])) {
          for (var m = 0; m < 12; m++) {
            var mPeaks = peaksEntry[m];
            var sumSqM = 0;
            for (var q = 0; q < mPeaks.length; q++) {
              if (mPeaks[q] > pc) {
                var diffM = mPeaks[q] - pc;
                sumSqM += diffM * diffM;
              }
            }
            if (sumSqM > 0) excessPenalty += TEP_CNMC * kp * Math.sqrt(sumSqM);
          }
        } else {
          var sumSqFlat = 0;
          for (var j = 0; j < peaksEntry.length; j++) {
            if (peaksEntry[j] > pc) {
              var diff = peaksEntry[j] - pc;
              sumSqFlat += diff * diff;
            }
          }
          if (sumSqFlat > 0) excessPenalty += TEP_CNMC * kp * Math.sqrt(sumSqFlat);
        }
      } else {
        var maxP = 0;
        if (peaksEntry.length === 12 && Array.isArray(peaksEntry[0])) {
          for (var m2 = 0; m2 < 12; m2++) {
            for (var q2 = 0; q2 < peaksEntry[m2].length; q2++) {
              if (peaksEntry[m2][q2] > maxP) maxP = peaksEntry[m2][q2];
            }
          }
        } else {
          for (var j2 = 0; j2 < peaksEntry.length; j2++) if (peaksEntry[j2] > maxP) maxP = peaksEntry[j2];
        }
        if (maxP > pc * 1.05) {
          excessPenalty += (maxP - pc) * priceYear * 3.5;
        }
      }
    }
    return {
      fixedCostEur: fixedCost,
      excessPenaltyEur: excessPenalty,
      totalPowerEur: fixedCost + excessPenalty
    };
  }

  /**
   * Simulación integral 8760h + optimización de potencias contratadas P1..P6.
   */
  function simulateAndOptimize(parsedCurve, opts) {
    var cfg = opts || {};
    var calcs = null;
    try { if (typeof global.getProjectCalcs === 'function') calcs = global.getProjectCalcs(); } catch (_) {}

    var tariff = cfg.tariff || parsedCurve.suggestedTariff || '3.0TD';
    var tDef = TARIFF_DEFAULTS[tariff] || TARIFF_DEFAULTS['3.0TD'];
    var annualSolarKwh = _num(cfg.annualSolarKwh, (calcs && calcs.annualKWh) || 0);
    var bessKwh = _num(cfg.bessKwh, (calcs && calcs.battery && calcs.battery.totalKwh) || 0);
    var bessKw = _num(cfg.bessKw, bessKwh > 0 ? Math.max(3, bessKwh * 0.5) : 0);
    var zeroExport = Boolean(cfg.zeroExport);

    var solar8760 = buildProjectSolarHourly8760(annualSolarKwh, cfg.latDeg || (calcs && calcs.latNum) || 40.4, calcs);
    var load8760 = parsedCurve.hourlyKwh;
    var peak8760 = parsedCurve.hourlyPeakKw;
    var jan1Dow = new Date(Date.UTC(parsedCurve.year || 2025, 0, 1)).getUTCDay();
    var monthlyEnergyCostAfter = new Float64Array(12);
    var monthlySurplusCredit = new Float64Array(12);

    var soc = bessKwh * 0.2;
    var socMin = bessKwh * 0.1;
    var socMax = bessKwh * 0.95;
    var sqrtEff = Math.sqrt(0.92);

    var totalLoadKwh = 0;
    var totalSolarKwh = 0;
    var totalSelfConsumedKwh = 0;
    var totalSurplusKwh = 0;
    var totalGridImportBefore = 0;
    var totalGridImportAfter = 0;
    var energyCostBefore = 0;
    var energyCostAfter = 0;
    var surplusCredit = 0;

    var nPow = tDef.powerPeriods;
    var peaksBeforeByPeriod = [];
    var peaksAfterByPeriod = [];
    var peaksAfterByPeriodMonth = [];
    var qPeaks35k = (parsedCurve && parsedCurve.quarterPeakKw && parsedCurve.quarterPeakKw.length === 35040)
      ? parsedCurve.quarterPeakKw : null;
    for (var pp = 0; pp < nPow; pp++) {
      peaksBeforeByPeriod.push([]);
      peaksAfterByPeriod.push([]);
      var mArr = [];
      for (var mm = 0; mm < 12; mm++) mArr.push([]);
      peaksAfterByPeriodMonth.push(mArr);
    }

    var monthDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    var dayToMonth = new Uint8Array(365);
    var dCursor = 0;
    for (var mo = 0; mo < 12; mo++) {
      for (var md = 0; md < monthDays[mo]; md++) {
        if (dCursor < 365) dayToMonth[dCursor++] = mo + 1;
      }
    }

    for (var h = 0; h < 8760; h++) {
      var day = Math.floor(h / 24);
      var hr = h % 24;
      var month = dayToMonth[day] || 1;
      var dow = (day + jan1Dow) % 7;
      var ePeriod = getCnmcPeriod(tariff, month, dow, hr);
      var pIdx = getPowerPeriodIndex(tariff, ePeriod);
      var ePrice = tDef.energyEurKwh[ePeriod - 1] || 0.14;

      var load = load8760[h] || 0;
      var peakBefore = Math.max(load, peak8760[h] || load);
      var pv = solar8760[h] || 0;

      totalLoadKwh += load;
      totalSolarKwh += pv;
      totalGridImportBefore += load;
      energyCostBefore += load * ePrice;
      peaksBeforeByPeriod[pIdx].push(peakBefore);

      // Despacho horario FV + BESS
      var directSelf = Math.min(load, pv);
      var remLoad = load - directSelf;
      var remPv = pv - directSelf;

      // Cargar batería con excedente FV (o arbitraje nocturno en P6/P3 si tarifa barata y batería vacía)
      if (bessKwh > 0 && remPv > 0 && soc < socMax) {
        var canCharge = Math.min(remPv, bessKw, (socMax - soc) / sqrtEff);
        soc += canCharge * sqrtEff;
        remPv -= canCharge;
      }
      // Descargar batería contra demanda restante (priorizando periodos caros P1..P4)
      var bessDisch = 0;
      if (bessKwh > 0 && remLoad > 0 && soc > socMin) {
        var canDisch = Math.min(remLoad, bessKw, (soc - socMin) * sqrtEff);
        soc -= canDisch / sqrtEff;
        bessDisch = canDisch;
        remLoad -= canDisch;
      }

      var selfH = directSelf + bessDisch;
      var exportedH = zeroExport ? 0 : remPv;
      totalSelfConsumedKwh += selfH;
      totalSurplusKwh += exportedH;
      totalGridImportAfter += remLoad;
      var hCostAfter = remLoad * ePrice;
      var hCredit = exportedH * tDef.surplusEurKwh;
      energyCostAfter += hCostAfter;
      surplusCredit += hCredit;
      monthlyEnergyCostAfter[month - 1] += hCostAfter;
      monthlySurplusCredit[month - 1] += hCredit;

      // Maxímetro post-FV+BESS (4 cuartos de hora por hora, agrupados por mes y periodo según CNMC 3/2020)
      var peakReduction = Math.min(peakBefore, directSelf * 0.75 + bessDisch);
      var peakAfter = Math.max(0, peakBefore - peakReduction);
      peaksAfterByPeriod[pIdx].push(peakAfter);
      var mBucket = peaksAfterByPeriodMonth[pIdx][month - 1];
      if (qPeaks35k) {
        var qOff = h * 4;
        for (var qi = 0; qi < 4; qi++) {
          var qRaw = qPeaks35k[qOff + qi] || peakBefore;
          mBucket.push(Math.max(0, qRaw - peakReduction));
        }
      } else {
        mBucket.push(peakAfter, peakAfter, peakAfter, peakAfter);
      }
    }

    // Estimar potencias contratadas actuales (si el usuario no las pasa: P98 del maxímetro pre-FV)
    var currentContracted = [];
    var optimalContracted = [];
    var maxPeaksBefore = [];
    var maxPeaksAfter = [];

    for (var p = 0; p < nPow; p++) {
      var arrB = peaksBeforeByPeriod[p].slice().sort(function (a, b) { return a - b; });
      var arrA = peaksAfterByPeriod[p].slice().sort(function (a, b) { return a - b; });
      var maxB = arrB.length ? arrB[arrB.length - 1] : 0;
      var maxA = arrA.length ? arrA[arrA.length - 1] : 0;
      maxPeaksBefore.push(Number(maxB.toFixed(2)));
      maxPeaksAfter.push(Number(maxA.toFixed(2)));

      var curP = (cfg.currentContractedKw && cfg.currentContractedKw[p] > 0)
        ? cfg.currentContractedKw[p]
        : Math.max(tariff === '2.0TD' ? 3.45 : (p === nPow - 1 ? 15.1 : 5.0), Math.ceil(maxB * 1.05 * 2) / 2);
      currentContracted.push(Number(curP.toFixed(2)));

      // Búsqueda en rejilla fina usando el índice real `p` para aplicar el Kp normativo de P1..P6
      var bestKw = curP;
      var bestCost = Infinity;
      var minCand = tariff === '2.0TD' ? 2.3 : Math.max(p === nPow - 1 ? 15.1 : 5.0, maxA * 0.55);
      var maxCand = Math.max(minCand + 1, maxA * 1.12);
      var step = Math.max(0.5, (maxCand - minCand) / 28);
      for (var cand = minCand; cand <= maxCand + 0.01; cand += step) {
        var rEval = evaluatePowerBillForVector(tariff, [cand], [peaksAfterByPeriodMonth[p]], [tDef.powerEurKwYear[p]], [p]);
        if (rEval.totalPowerEur < bestCost) {
          bestCost = rEval.totalPowerEur;
          bestKw = cand;
        }
      }
      optimalContracted.push(Number((Math.round(bestKw * 10) / 10).toFixed(1)));
    }

    // En 3.0TD y 6.1TD se debe cumplir Pn <= Pn+1 y al menos P6 > 15 kW
    if (tariff !== '2.0TD') {
      for (var m = 1; m < nPow; m++) {
        if (optimalContracted[m] < optimalContracted[m - 1]) {
          optimalContracted[m] = optimalContracted[m - 1];
        }
        if (currentContracted[m] < currentContracted[m - 1]) {
          currentContracted[m] = currentContracted[m - 1];
        }
      }
      if (optimalContracted[nPow - 1] <= 15.0) optimalContracted[nPow - 1] = 15.1;
      if (currentContracted[nPow - 1] <= 15.0) currentContracted[nPow - 1] = 15.1;
    }

    var powerBefore = evaluatePowerBillForVector(tariff, currentContracted, peaksBeforeByPeriod, tDef.powerEurKwYear);
    var powerAfterOpt = evaluatePowerBillForVector(tariff, optimalContracted, peaksAfterByPeriod, tDef.powerEurKwYear);

    // Tope de compensación simplificada RD 244 aplicado MENSUALMENTE (no puede superar el término de energía de cada mes)
    var effectiveSurplusCredit = 0;
    for (var mc = 0; mc < 12; mc++) {
      effectiveSurplusCredit += Math.min(monthlySurplusCredit[mc], monthlyEnergyCostAfter[mc]);
    }
    var energySavingsEur = (energyCostBefore - energyCostAfter) + effectiveSurplusCredit;
    var powerSavingsEur = Math.max(0, powerBefore.totalPowerEur - powerAfterOpt.totalPowerEur);
    var totalAnnualSavingsEur = energySavingsEur + powerSavingsEur;

    var periodRows = [];
    for (var r = 0; r < nPow; r++) {
      periodRows.push({
        period: 'P' + (r + 1),
        maxBeforeKw: maxPeaksBefore[r],
        maxAfterKw: maxPeaksAfter[r],
        currentKw: currentContracted[r],
        optimalKw: optimalContracted[r],
        deltaKw: Number((optimalContracted[r] - currentContracted[r]).toFixed(1)),
        priceEurKwYear: tDef.powerEurKwYear[r]
      });
    }

    return {
      tariff: tariff,
      tariffName: tDef.name,
      cups: parsedCurve.cups,
      isQuarterHourly: parsedCurve.isQuarterHourly,
      coveragePct: parsedCurve.coveragePct,
      annualLoadKwh: Math.round(totalLoadKwh),
      annualSolarKwh: Math.round(totalSolarKwh),
      selfConsumedKwh: Math.round(totalSelfConsumedKwh),
      surplusKwh: Math.round(totalSurplusKwh),
      gridImportAfterKwh: Math.round(totalGridImportAfter),
      selfConsumptionPct: totalSolarKwh > 0 ? Number(((totalSelfConsumedKwh / totalSolarKwh) * 100).toFixed(1)) : 0,
      selfSufficiencyPct: totalLoadKwh > 0 ? Number(((totalSelfConsumedKwh / totalLoadKwh) * 100).toFixed(1)) : 0,
      energyCostBeforeEur: Math.round(energyCostBefore),
      energyCostAfterEur: Math.round(Math.max(0, energyCostAfter - effectiveSurplusCredit)),
      surplusCreditEur: Math.round(effectiveSurplusCredit),
      energySavingsEur: Math.round(energySavingsEur),
      powerCostBeforeEur: Math.round(powerBefore.totalPowerEur),
      powerCostAfterOptEur: Math.round(powerAfterOpt.totalPowerEur),
      powerSavingsEur: Math.round(powerSavingsEur),
      totalAnnualSavingsEur: Math.round(totalAnnualSavingsEur),
      periodRows: periodRows
    };
  }

  /**
   * Genera un CSV cuartohorario realista de muestra (nave industrial 3.0TD) para demostración/validación 1-clic.
   */
  function generateSampleIndustrialCsv() {
    var lines = ['CUPS;Fecha;Hora;Consumo_kWh;Metodo'];
    var cups = 'ES0021000008421903KV';
    var monthDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    for (var m = 0; m < 12; m++) {
      var seasonBoost = (m === 6 || m === 7 || m === 0) ? 1.18 : 1.0;
      for (var d = 1; d <= monthDays[m]; d++) {
        var dow = new Date(Date.UTC(2025, m, d)).getUTCDay();
        var isWk = (dow === 0 || dow === 6);
        var dd = (d < 10 ? '0' : '') + d;
        var mm = (m + 1 < 10 ? '0' : '') + (m + 1);
        var dateStr = dd + '/' + mm + '/2025';
        for (var h = 0; h < 24; h++) {
          var baseKw = isWk ? 8.5 : ((h >= 8 && h < 19) ? 46.0 * seasonBoost : 11.0);
          for (var q = 0; q < 4; q++) {
            var ripple = 1 + 0.14 * Math.sin(h * 1.7 + d * 0.9 + q * 1.3);
            var kwh15 = (baseKw * ripple) / 4.0;
            var hh = (h < 10 ? '0' : '') + h;
            var mins = ['00', '15', '30', '45'][q];
            lines.push(cups + ';' + dateStr + ';' + hh + ':' + mins + ';' + kwh15.toFixed(3).replace('.', ',') + ';R');
          }
        }
      }
    }
    return lines.join('\n');
  }

  function buildReportHTML(res) {
    var esc = (global.RASanitize && global.RASanitize.escapeHtml)
      ? global.RASanitize.escapeHtml
      : function (s) {
          return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        };

    if (!res) {
      return '<div style="padding:12px;border:1px dashed rgba(148,163,184,0.3);border-radius:8px;color:#94A3B8;font-size:12px;">Importa un CSV horario o cuartohorario de Datadis / distribuidora (o pulsa «Cargar muestra industrial 3.0TD») para simular las 8.760 h reales y optimizar las potencias contratadas P1..P6.</div>';
    }

    var rowsHtml = res.periodRows.map(function (r) {
      var deltaColor = r.deltaKw < 0 ? '#34D399' : (r.deltaKw > 0 ? '#FBBF24' : '#94A3B8');
      var deltaTxt = (r.deltaKw > 0 ? '+' : '') + r.deltaKw.toFixed(1) + ' kW';
      return '<tr style="border-top:1px solid rgba(255,255,255,0.08);">' +
        '<td style="padding:6px 8px;font-weight:800;color:#38BDF8;">' + esc(r.period) + '</td>' +
        '<td style="padding:6px 8px;text-align:right;font-family:var(--font-mono);">' + r.maxBeforeKw.toFixed(1) + ' kW</td>' +
        '<td style="padding:6px 8px;text-align:right;font-family:var(--font-mono);color:#34D399;">' + r.maxAfterKw.toFixed(1) + ' kW</td>' +
        '<td style="padding:6px 8px;text-align:right;font-family:var(--font-mono);">' + r.currentKw.toFixed(1) + ' kW</td>' +
        '<td style="padding:6px 8px;text-align:right;font-family:var(--font-mono);font-weight:800;color:#F8FAFC;">' + r.optimalKw.toFixed(1) + ' kW</td>' +
        '<td style="padding:6px 8px;text-align:right;font-family:var(--font-mono);font-weight:700;color:' + deltaColor + ';">' + deltaTxt + '</td>' +
      '</tr>';
    }).join('');

    return '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:8px;margin-bottom:10px;">' +
      '<div class="ra-drawer-kpi"><span>Tarifa / Resolución</span><strong>' + esc(res.tariff) + ' · ' + (res.isQuarterHourly ? '15 min' : '1 h') + '</strong></div>' +
      '<div class="ra-drawer-kpi"><span>Consumo Real Anual</span><strong>' + res.annualLoadKwh.toLocaleString('es-ES') + ' kWh</strong></div>' +
      '<div class="ra-drawer-kpi"><span>Autoconsumo / Cobertura</span><strong style="color:#34D399;">' + res.selfConsumptionPct + '% / ' + res.selfSufficiencyPct + '%</strong></div>' +
      '<div class="ra-drawer-kpi"><span>Ahorro Energía + Exc.</span><strong style="color:#38BDF8;">' + res.energySavingsEur.toLocaleString('es-ES') + ' €/año</strong></div>' +
      '<div class="ra-drawer-kpi"><span>Ahorro Potencia P1–P6</span><strong style="color:#FBBF24;">' + res.powerSavingsEur.toLocaleString('es-ES') + ' €/año</strong></div>' +
      '<div class="ra-drawer-kpi"><span>Ahorro Total Combinado</span><strong style="color:#34D399;">' + res.totalAnnualSavingsEur.toLocaleString('es-ES') + ' €/año</strong></div>' +
    '</div>' +
    '<div style="overflow-x:auto;border:1px solid rgba(255,255,255,0.1);border-radius:8px;background:rgba(15,23,42,0.7);">' +
      '<table style="width:100%;border-collapse:collapse;font-size:12px;color:#F1F5F9;">' +
        '<thead><tr style="background:rgba(56,189,248,0.12);font-size:11px;text-transform:uppercase;">' +
          '<th scope="col" style="padding:7px 8px;text-align:left;">Periodo</th>' +
          '<th scope="col" style="padding:7px 8px;text-align:right;">Maxímetro Pre-FV</th>' +
          '<th scope="col" style="padding:7px 8px;text-align:right;">Maxímetro Post-FV</th>' +
          '<th scope="col" style="padding:7px 8px;text-align:right;">Contratada Base</th>' +
          '<th scope="col" style="padding:7px 8px;text-align:right;">Óptima P1..P6</th>' +
          '<th scope="col" style="padding:7px 8px;text-align:right;">Ajuste</th>' +
        '</tr></thead>' +
        '<tbody>' + rowsHtml + '</tbody>' +
      '</table>' +
    '</div>' +
    '<div style="margin-top:6px;font-size:11px;color:#94A3B8;">CUPS: ' + esc(res.cups) + ' · Cobertura CSV: ' + res.coveragePct + '% · Excedentes compensados: ' + res.surplusCreditEur.toLocaleString('es-ES') + ' €/año · Factura potencia: ' + res.powerCostBeforeEur.toLocaleString('es-ES') + ' € → ' + res.powerCostAfterOptEur.toLocaleString('es-ES') + ' €/año.</div>';
  }

  var _lastResult = null;

  global.RADatadisOptimizer = {
    TARIFF_DEFAULTS: TARIFF_DEFAULTS,
    parseCsv: parseDatadisCsv,
    simulateAndOptimize: function (parsedCurve, opts) {
      _lastResult = simulateAndOptimize(parsedCurve, opts);
      // Sincronizar resumen con billAuditor si está disponible
      if (global.RA && global.RA.billAuditor) {
        global.RA.billAuditor.datadis8760 = _lastResult;
      }
      return _lastResult;
    },
    generateSampleIndustrialCsv: generateSampleIndustrialCsv,
    buildReportHTML: buildReportHTML,
    getLastResult: function () { return _lastResult; }
  };

  if (global.RA) global.RA.DatadisOptimizer = global.RADatadisOptimizer;
})(typeof window !== 'undefined' ? window : this);
