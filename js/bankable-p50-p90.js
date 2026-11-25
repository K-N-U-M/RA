/**
 * js/bankable-p50-p90.js — Análisis Probabilístico Bancable P50 / P75 / P90 / P99 (25 Años) [F7-08]
 * =================================================================================================
 * Motor puro desacoplado que separa incertidumbre meteorológica interanual irreducible,
 * modelo de transposición/soiling, pérdidas LID/LeTID y degradación lineal a 25 años,
 * propagando cada percentil hacia producción, ahorro anual, VAN, TIR, Payback y DSCR.
 */
(function (global) {
  'use strict';

  var Z_SCORES = [
    { label: 'P50', desc: 'Escenario Base (Mediana)', z: 0.0, color: '#34D399' },
    { label: 'P75', desc: 'Conservador Bancable', z: -0.6745, color: '#38BDF8' },
    { label: 'P90', desc: 'Estándar Financiación', z: -1.2816, color: '#FBBF24' },
    { label: 'P99', desc: 'Estrés Climático Extremo', z: -2.3263, color: '#FB7185' }
  ];

  function _num(v, fb) {
    var n = Number(v);
    return Number.isFinite(n) ? n : fb;
  }

  function _computeIrrBisection(capex, cashflows) {
    if (!(capex > 0) || !Array.isArray(cashflows) || cashflows.length === 0) return null;
    var sumCf = 0;
    for (var i = 0; i < cashflows.length; i++) sumCf += cashflows[i];
    if (sumCf <= 0) return null;
    var npvAt = function (r) {
      var val = -capex;
      for (var y = 0; y < cashflows.length; y++) {
        val += cashflows[y] / Math.pow(1 + r, y + 1);
      }
      return val;
    };
    var lo = -0.95;
    var hi = 5.0;
    if (npvAt(lo) < 0) return null;
    if (npvAt(hi) > 0) return 5.0;
    for (var iter = 0; iter < 50; iter++) {
      var mid = (lo + hi) * 0.5;
      if (npvAt(mid) > 0) lo = mid;
      else hi = mid;
    }
    return (lo + hi) * 0.5;
  }

  /**
   * Calcula el análisis bancable completo a 25 años para P50, P75, P90 y P99.
   * @param {Object} [inputOpts] Si se omite, lee automáticamente el proyecto activo.
   */
  function evaluateBankableRisk(inputOpts) {
    var opts = inputOpts || {};
    var calcs = null;
    if (typeof global.getProjectCalcs === 'function') {
      try { calcs = global.getProjectCalcs(); } catch (_) { calcs = null; }
    }
    var fin = null;
    if (typeof global.calculateFinancialModel === 'function') {
      try { fin = global.calculateFinancialModel(); } catch (_) { fin = null; }
    }

    var p50Year1Kwh = _num(opts.annualKWh, (calcs && calcs.annualKWh) || (fin && fin.annualKWh) || 0);
    var kwp = _num(opts.kwp, (calcs && calcs.P_dc_kW) || 0);
    var capexNet = _num(opts.capexNet, (fin && (fin.netInvestment || fin.totalInvestment || fin.capexTotal)) || (kwp * 1250));
    var year1SavingsBase = _num(opts.year1SavingsEur, (fin && (fin.ahorroAnual || fin.annualSavingsEur || fin.year1Savings)) || (p50Year1Kwh * 0.16));
    var opexAnnual = _num(opts.opexAnnualEur, Math.max(45, kwp * 12));
    var discountRate = _num(opts.discountRate, 0.04);
    var energyEscalation = _num(opts.energyEscalation, 0.025);
    var horizonYears = Math.max(10, Math.min(35, _num(opts.horizonYears, 25)));
    var annualDebtService = _num(opts.annualDebtServiceEur, (fin && fin.monthlyLoanPayment > 0) ? fin.monthlyLoanPayment * 12 : 0);

    // Componentes de incertidumbre cuadrática (RSS) conforme a IEC 61724 / metodología bancable PVsyst
    var sigmaMeteo = _num(opts.sigmaMeteo, 0.052);     // Variabilidad climática interanual (5.2% irreducible)
    var sigmaModel = _num(opts.sigmaModel, 0.025);     // Transposición Perez + modelo térmico Faiman (2.5%)
    var sigmaSoiling = _num(opts.sigmaSoiling, 0.018); // Suciedad, sombras locales y disponibilidad (1.8%)
    var sigmaDeg = _num(opts.sigmaDeg, 0.012);         // Incertidumbre degradación a largo plazo (1.2%)
    var lidLoss = _num(opts.lidLoss, 0.015);           // LID / LeTID año 1 (1.5%)
    var degAnnual = _num(opts.degAnnual, 0.0045);      // Degradación lineal anual (0.45%/año)

    // Incertidumbre combinada Año 1 y 25 años (la variabilidad interanual se promedia por sqrt(N), el sesgo de modelo/climático no)
    var sigmaYr1 = Math.sqrt(sigmaMeteo * sigmaMeteo + sigmaModel * sigmaModel + sigmaSoiling * sigmaSoiling);
    var sigmaClimBias = sigmaMeteo * 0.65; // Incertidumbre sistemática de base climática TMY
    var sigmaInterannual25 = (sigmaMeteo * 0.76) / Math.sqrt(horizonYears);
    var sigma25y = Math.sqrt(
      sigmaClimBias * sigmaClimBias +
      sigmaInterannual25 * sigmaInterannual25 +
      sigmaModel * sigmaModel +
      sigmaSoiling * sigmaSoiling +
      sigmaDeg * sigmaDeg
    );

    var scenarios = Z_SCORES.map(function (tier) {
      var factorYr1 = Math.max(0.55, 1 + tier.z * sigmaYr1);
      var factor25y = Math.max(0.60, 1 + tier.z * sigma25y);
      var yr1Kwh = Math.round(p50Year1Kwh * factorYr1);
      var savingsRatio = p50Year1Kwh > 0 ? (year1SavingsBase / p50Year1Kwh) : 0.16;

      var cumMwh = 0;
      var cashflows = [];
      var cumCash = -capexNet;
      var payback = null;
      var npv = -capexNet;
      var minDscr = null;

      for (var y = 1; y <= horizonYears; y++) {
        var degFactor = (1 - lidLoss) * Math.pow(1 - degAnnual, y - 1);
        var prodY = p50Year1Kwh * factor25y * degFactor;
        cumMwh += prodY / 1000.0;
        var grossSavY = prodY * savingsRatio * Math.pow(1 + energyEscalation, y - 1);
        var netCfY = grossSavY - opexAnnual * Math.pow(1.02, y - 1);
        cashflows.push(netCfY);
        npv += netCfY / Math.pow(1 + discountRate, y);

        var prevCum = cumCash;
        cumCash += netCfY;
        if (payback === null && cumCash >= 0 && netCfY > 0) {
          payback = (y - 1) + Math.max(0, -prevCum) / netCfY;
        }
        if (annualDebtService > 0 && y <= 10) {
          var dscrY = netCfY / annualDebtService;
          if (minDscr === null || dscrY < minDscr) minDscr = dscrY;
        }
      }

      var irr = _computeIrrBisection(capexNet, cashflows);
      var yr1NetSavings = Math.round(yr1Kwh * savingsRatio);

      return {
        label: tier.label,
        desc: tier.desc,
        color: tier.color,
        zScore: tier.z,
        factorYr1Pct: Number((factorYr1 * 100).toFixed(1)),
        year1Kwh: yr1Kwh,
        cum25yMwh: Number(cumMwh.toFixed(1)),
        year1SavingsEur: yr1NetSavings,
        npvEur: Math.round(npv),
        irrPct: irr !== null ? Number((irr * 100).toFixed(1)) : null,
        paybackYears: payback !== null ? Number(payback.toFixed(1)) : null,
        minDscr: minDscr !== null ? Number(minDscr.toFixed(2)) : null
      };
    });

    return {
      kwp: Number(kwp.toFixed(2)),
      p50Year1Kwh: Math.round(p50Year1Kwh),
      capexNet: Math.round(capexNet),
      horizonYears: horizonYears,
      uncertainties: {
        sigmaMeteoPct: Number((sigmaMeteo * 100).toFixed(1)),
        sigmaModelPct: Number((sigmaModel * 100).toFixed(1)),
        sigmaSoilingPct: Number((sigmaSoiling * 100).toFixed(1)),
        sigmaYr1Pct: Number((sigmaYr1 * 100).toFixed(2)),
        sigma25yPct: Number((sigma25y * 100).toFixed(2)),
        lidPct: Number((lidLoss * 100).toFixed(1)),
        degAnnualPct: Number((degAnnual * 100).toFixed(2))
      },
      scenarios: scenarios
    };
  }

  function buildBankableTableHTML(report, opts) {
    var r = report || evaluateBankableRisk();
    var isLight = Boolean(opts && opts.lightTheme);
    var bg = isLight ? '#F8FAFC' : 'rgba(15,23,42,0.75)';
    var bd = isLight ? '#CBD5E1' : 'rgba(255,255,255,0.1)';
    var txt = isLight ? '#0F172A' : '#F1F5F9';
    var muted = isLight ? '#475569' : '#94A3B8';

    if (!r || !(r.p50Year1Kwh > 0)) {
      return '<div style="padding:14px;border:1px dashed ' + bd + ';border-radius:8px;color:' + muted + ';font-size:12px;">Genera primero el campo solar en el Paso 2 para calcular la matriz probabilística bancable P50/P75/P90/P99.</div>';
    }

    var rows = r.scenarios.map(function (s) {
      var irrTxt = s.irrPct !== null ? (s.irrPct.toFixed(1) + ' %') : 'N/D';
      var pbTxt = s.paybackYears !== null ? (s.paybackYears.toFixed(1) + ' años') : '> ' + r.horizonYears + ' a';
      var dscrTxt = s.minDscr !== null ? (s.minDscr.toFixed(2) + 'x') : 'Contado';
      return '<tr style="border-top:1px solid ' + bd + ';">' +
        '<td style="padding:8px 10px;font-weight:800;color:' + s.color + ';">' + s.label + ' <span style="font-weight:500;font-size:11px;color:' + muted + ';">· ' + s.desc + '</span></td>' +
        '<td style="padding:8px 10px;text-align:right;font-family:var(--font-mono,monospace);font-weight:700;">' + s.year1Kwh.toLocaleString('es-ES') + ' kWh</td>' +
        '<td style="padding:8px 10px;text-align:right;font-family:var(--font-mono,monospace);">' + s.cum25yMwh.toLocaleString('es-ES') + ' MWh</td>' +
        '<td style="padding:8px 10px;text-align:right;font-family:var(--font-mono,monospace);">' + s.year1SavingsEur.toLocaleString('es-ES') + ' €</td>' +
        '<td style="padding:8px 10px;text-align:right;font-family:var(--font-mono,monospace);font-weight:700;color:' + (s.npvEur >= 0 ? '#34D399' : '#FB7185') + ';">' + s.npvEur.toLocaleString('es-ES') + ' €</td>' +
        '<td style="padding:8px 10px;text-align:right;font-family:var(--font-mono,monospace);font-weight:700;">' + irrTxt + '</td>' +
        '<td style="padding:8px 10px;text-align:right;font-family:var(--font-mono,monospace);">' + pbTxt + '</td>' +
        '<td style="padding:8px 10px;text-align:right;font-family:var(--font-mono,monospace);">' + dscrTxt + '</td>' +
      '</tr>';
    }).join('');

    return '<div style="background:' + bg + ';border:1px solid ' + bd + ';border-radius:10px;padding:12px;color:' + txt + ';font-size:12px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px;">' +
        '<strong style="font-size:12px;letter-spacing:0.3px;">MATRIZ PROBABILÍSTICA BANCABLE (' + r.horizonYears + ' AÑOS · LID ' + r.uncertainties.lidPct + '% · DEG ' + r.uncertainties.degAnnualPct + '%/año)</strong>' +
        '<span style="font-size:11px;color:' + muted + ';">σ Año 1: ±' + r.uncertainties.sigmaYr1Pct + '% · σ 25a: ±' + r.uncertainties.sigma25yPct + '% · CAPEX Neto: ' + r.capexNet.toLocaleString('es-ES') + ' €</span>' +
      '</div>' +
      '<div style="overflow-x:auto;">' +
        '<table style="width:100%;border-collapse:collapse;font-size:12px;">' +
          '<thead><tr style="color:' + muted + ';text-transform:uppercase;font-size:11px;text-align:right;">' +
            '<th scope="col" style="padding:6px 10px;text-align:left;">Percentil</th>' +
            '<th scope="col" style="padding:6px 10px;">Año 1</th>' +
            '<th scope="col" style="padding:6px 10px;">Acum. 25a</th>' +
            '<th scope="col" style="padding:6px 10px;">Ahorro Año 1</th>' +
            '<th scope="col" style="padding:6px 10px;">VAN (4%)</th>' +
            '<th scope="col" style="padding:6px 10px;">TIR</th>' +
            '<th scope="col" style="padding:6px 10px;">Payback</th>' +
            '<th scope="col" style="padding:6px 10px;">DSCR mín.</th>' +
          '</tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
      '</div>' +
    '</div>';
  }

  var api = {
    evaluate: evaluateBankableRisk,
    buildTableHTML: buildBankableTableHTML
  };
  global.RABankableRisk = api;
  global.RA = global.RA || {};
  global.RA.BankableRisk = api;
})(typeof window !== 'undefined' ? window : globalThis);
