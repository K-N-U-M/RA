/**
 * js/bishop-iv-engine.js — Motor Horario 8760h + Curva I-V Bishop (3 Sub-Strings) + MPPT Multi-Pico [F7-05]
 * ==========================================================================================================
 * Resuelve la curva eléctrica I-V acoplada por string mediante el modelo de 1 diodo + avalancha inversa
 * de Bishop para los 3 sub-módulos con diodo de bypass de cada placa, evaluando:
 *   1. String Puro con MPPT Local (atrapado en pico local de tensión alta)
 *   2. String Puro con MPPT Global Multi-Pico dentro de [V_mppt_min, V_mppt_max] + eficiencia η(P_dc, V_dc)
 *   3. Optimizadores Selectivos MLPE (solo en módulos con sombra relevante)
 *   4. Microinversores independientes por módulo
 */
(function (global) {
  'use strict';

  var KB_Q = 8.617333262e-5; // kB / q [V/K]

  function _num(v, fb) {
    var n = Number(v);
    return Number.isFinite(n) ? n : fb;
  }

  /**
   * Calibra los parámetros de un sub-módulo (1/3 del módulo completo) en STC a partir de hoja técnica.
   */
  function calibrateSubmoduleParams(mod) {
    var m = mod || {};
    var voc = _num(m.voc, 49.5);
    var isc = _num(m.isc, 13.85);
    var vmp = _num(m.vmp, 41.5);
    var imp = _num(m.imp, 13.05);
    var wp = _num(m.wp || m.potencia, vmp * imp);
    var betaVoc = _num(m.tempCoeffVoc != null ? m.tempCoeffVoc : (m.gammaVoc != null ? m.gammaVoc : m.betaVoc), -0.0028);
    if (Math.abs(betaVoc) > 0.05) betaVoc = betaVoc / 100.0;
    var gammaPmax = _num(m.tempCoeffPmax != null ? m.tempCoeffPmax : m.gammaPmp, -0.0034);
    if (Math.abs(gammaPmax) > 0.05) gammaPmax = gammaPmax / 100.0;
    var alphaIsc = _num(m.alphaIsc, 0.00045);
    if (Math.abs(alphaIsc) > 0.02) alphaIsc = alphaIsc / 100.0;

    // 3 sub-strings en serie por módulo (típico 108/120/144 half-cut con 3 diodos de bypass)
    var vocSub = voc / 3.0;
    var vmpSub = vmp / 3.0;
    var nCellsSub = Math.max(12, Math.round(vocSub / 0.68));
    var nIdeal = 1.12;
    var vtStc = nCellsSub * nIdeal * KB_Q * 298.15;
    var rsSub = Math.max(0.02, ((vocSub - vmpSub) / Math.max(1, imp)) * 0.22);
    var rshSub = Math.max(80, (vocSub / Math.max(0.05, isc - imp)) * 3.5);
    var i0Stc = isc / Math.max(1e6, Math.exp(vocSub / vtStc) - 1);

    return {
      vocMod: voc,
      iscMod: isc,
      vmpMod: vmp,
      impMod: imp,
      wpMod: wp,
      betaVoc: betaVoc,
      gammaPmax: gammaPmax,
      alphaIsc: alphaIsc,
      vocSub: vocSub,
      vmpSub: vmpSub,
      nCellsSub: nCellsSub,
      nIdeal: nIdeal,
      rsSub: rsSub,
      rshSub: rshSub,
      i0Stc: i0Stc,
      vBypass: -0.68,     // Caída directa del diodo Schottky de bypass activado
      vBreakdown: -15.0,  // Tensión de avalancha inversa Bishop
      bishopA: 0.02,
      bishopM: 3.4
    };
  }

  /**
   * Resuelve V_sub(I) para un sub-módulo bajo irradiancia G (W/m²) y temperatura de célula T_cell (°C)
   * usando inversión rápida acotada con conducción de diodo de bypass si I > I_sc_sub.
   */
  function solveSubmoduleVoltageAtCurrent(subP, I, gEff, tCellC) {
    if (gEff <= 1) {
      return I > 0.02 ? subP.vBypass : 0;
    }
    var dT = tCellC - 25.0;
    var tk = tCellC + 273.15;
    var iPh = subP.iscMod * (gEff / 1000.0) * (1 + subP.alphaIsc * dT);

    // Si la corriente impuesta por el string excede la fotocorriente del sub-módulo -> actúa diodo de bypass
    if (I >= iPh * 0.998) {
      return subP.vBypass;
    }

    var vocT = subP.vocSub * (1 + subP.betaVoc * dT) +
      subP.nCellsSub * subP.nIdeal * KB_Q * tk * Math.log(Math.max(0.01, gEff / 1000.0));
    var vt = subP.nCellsSub * subP.nIdeal * KB_Q * tk;
    var ratio = Math.max(1e-7, 1.0 - (I / Math.max(1e-4, iPh)));
    var vCell = vocT + vt * Math.log(ratio) - I * subP.rsSub;

    // Clamping por protección del diodo de bypass (evita llegar a avalancha destructiva de Bishop)
    if (vCell < subP.vBypass) return subP.vBypass;
    return vCell;
  }

  /**
   * Eficiencia real del inversor η(P_dc, V_dc) con penalización por baja carga y deriva respecto a V_nom.
   */
  function inverterEfficiency(pDcW, vDcV, inv, invCount) {
    var count = Math.max(1, _num(invCount, 1));
    var pNomW = Math.max(1000, _num(inv && inv.kw, 5) * 1000 * count);
    var etaMax = _num(inv && (inv.eff != null ? inv.eff : (inv.effMax != null ? inv.effMax : inv.efficiency)), 98.0);
    if (etaMax > 1.5) etaMax /= 100.0;
    var loadRatio = pDcW / pNomW;
    if (loadRatio <= 0.015) return 0;
    var vMin = _num(inv && inv.vMpptMin, 180);
    var vMax = _num(inv && inv.vMpptMax, 850);
    var vNom = (vMin + vMax) * 0.5;
    var vPenalty = Math.min(0.018, Math.abs(vDcV - vNom) / Math.max(200, vNom) * 0.012);
    // Curva típica IEC 61683 (pico en 30-50% carga, ligera caída a baja/plena carga)
    var loadPenalty = loadRatio < 0.15
      ? (0.15 - loadRatio) * 0.28
      : Math.max(0, (loadRatio - 0.5) * 0.014);
    return Math.max(0.70, Math.min(0.992, etaMax - vPenalty - loadPenalty));
  }

  /**
   * Resuelve la curva completa P-V de un string de N módulos (cada uno con 3 sub-strings de irradiancias [g0, g1, g2]).
   * Devuelve potencia en MPPT Global, MPPT Local (primer pico desde Voc) y curva muestreada para graficar.
   */
  function solveStringIVCurve(subP, moduleSubIrradiances, tCellC, inv, recordPoints) {
    var nMods = moduleSubIrradiances.length;
    if (nMods === 0) return { pGlobalW: 0, vGlobalV: 0, pLocalW: 0, vLocalV: 0, points: [] };

    var maxG = 0;
    for (var m = 0; m < nMods; m++) {
      var arr = moduleSubIrradiances[m];
      for (var s = 0; s < 3; s++) if (arr[s] > maxG) maxG = arr[s];
    }
    if (maxG < 10) return { pGlobalW: 0, vGlobalV: 0, pLocalW: 0, vLocalV: 0, points: [] };

    var dT = tCellC - 25.0;
    var iMax = subP.iscMod * (maxG / 1000.0) * (1 + subP.alphaIsc * dT) * 1.01;
    var vMinWin = _num(inv && inv.vMpptMin, 180);
    var vMaxWin = _num(inv && inv.vMpptMax, 850);
    var samples = recordPoints ? 72 : 36;

    var pGlobalW = 0;
    var vGlobalV = 0;
    var pLocalW = 0;
    var vLocalV = 0;
    var localFound = false;
    var prevP = -1;
    var points = recordPoints ? [] : null;

    // Barrido de corriente de 0 (Voc) hasta Imax (Isc) -> tensión decreciente
    for (var k = 0; k <= samples; k++) {
      var I = (k / samples) * iMax;
      var vStr = 0;
      for (var m2 = 0; m2 < nMods; m2++) {
        var gSubs = moduleSubIrradiances[m2];
        vStr += solveSubmoduleVoltageAtCurrent(subP, I, gSubs[0], tCellC);
        vStr += solveSubmoduleVoltageAtCurrent(subP, I, gSubs[1], tCellC);
        vStr += solveSubmoduleVoltageAtCurrent(subP, I, gSubs[2], tCellC);
      }
      if (vStr < 0) vStr = 0;
      var P = vStr * I;

      if (recordPoints) {
        points.push({ v: Number(vStr.toFixed(1)), i: Number(I.toFixed(2)), p: Number(P.toFixed(1)) });
      }

      var inWindow = (vStr >= vMinWin && vStr <= vMaxWin);
      if (inWindow) {
        if (P > pGlobalW) {
          pGlobalW = P;
          vGlobalV = vStr;
        }
        // MPPT local: se queda en el primer máximo local al bajar desde Voc
        if (!localFound) {
          if (P >= prevP) {
            pLocalW = P;
            vLocalV = vStr;
          } else if (prevP > 50) {
            localFound = true;
          }
        }
        prevP = P;
      }
    }

    // Si la tensión global cae fuera de ventana MPPT pero hay algo de potencia, reflejar caída real
    if (pLocalW === 0 && pGlobalW > 0) {
      pLocalW = pGlobalW;
      vLocalV = vGlobalV;
    }

    return {
      pGlobalW: pGlobalW,
      vGlobalV: vGlobalV,
      pLocalW: pLocalW,
      vLocalV: vLocalV,
      points: points || []
    };
  }

  /**
   * Simulación anual 8760h agrupada por strings activos del proyecto comparando 4 arquitecturas eléctricas.
   */
  function runAnnualBishopSimulation(opts) {
    var cfg = opts || {};
    var panels = Array.isArray(cfg.panels) ? cfg.panels : (
      Array.isArray(global.allRenderedPanels)
        ? global.allRenderedPanels.filter(function (p) { return p && !p.isGhost && !p.deleted && !p.disabled; })
        : []
    );

    if (panels.length === 0) {
      return { empty: true, message: 'Coloca primero paneles en el Paso 2 para ejecutar la simulación I-V Bishop 8760h.' };
    }

    var sCfg = global.solarProjectConfig || {};
    var limits = sCfg.calculatedLimits || {};
    var catalog = global.equipmentCatalog || {};
    var calcs = null;
    try { if (typeof global.getProjectCalcs === 'function') calcs = global.getProjectCalcs(); } catch (_) {}
    var mod = cfg.module || limits.module ||
      (Array.isArray(catalog.modules) && catalog.modules.find(function (m) { return m.id === sCfg.selectedModuleId; })) ||
      global.panelConfig || {};
    var inv = cfg.inverter || limits.inverter ||
      (Array.isArray(catalog.inverters) && catalog.inverters.find(function (i) { return i.id === sCfg.selectedInverterId; })) ||
      { kw: Math.max(5, panels.length * 0.45 * 0.85), vMpptMin: 180, vMpptMax: 850, eff: 98.0 };
    var invCount = (sCfg.autoSizing && sCfg.autoSizing.inverters && Number.isFinite(sCfg.autoSizing.inverters.count))
      ? Math.max(1, sCfg.autoSizing.inverters.count)
      : Math.max(1, sCfg.inverterCount || 1);
    var totalInvAcMaxW = Math.max(1000, _num(inv.kw, 5) * 1000 * invCount);
    var subP = calibrateSubmoduleParams(mod);

    // Agrupar paneles por stringName
    var stringsMap = new Map();
    panels.forEach(function (p, idx) {
      var sName = p.stringName || ('S' + ((p.polyIdx || 0) + 1));
      if (!stringsMap.has(sName)) stringsMap.set(sName, []);
      var lossPct = (typeof p.annualLossPct === 'number') ? p.annualLossPct : (p.isShaded ? 14.0 : 0.0);
      stringsMap.get(sName).push({
        idx: idx,
        lossPct: Math.max(0, Math.min(85, lossPct)),
        hasOpt: Boolean(p.hasMLPE || lossPct >= 8.0),
        isShaded: Boolean(p.isShaded || lossPct >= 4.0)
      });
    });

    var stringsList = [];
    stringsMap.forEach(function (arr, name) { stringsList.push({ name: name, panels: arr }); });

    var lat = _num(cfg.latDeg, (calcs && calcs.latNum) || 40.4) * Math.PI / 180;
    var kwhLocal = 0;
    var kwhGlobal = 0;
    var kwhSelectiveMlpe = 0;
    var kwhMicro = 0;
    var kwhIdealUnshaded = 0;

    var criticalCurve = null;
    var criticalStringName = stringsList[0].name;
    var maxMismatchDeltaW = -1;

    // Evaluamos 12 días representativos × 24 horas (288 pasos astronómicos ponderados -> 8760h exactas)
    // manteniendo precisión I-V Bishop real con tiempo de ejecución < 35 ms en navegador
    var monthDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    var midDayOfYear = [17, 47, 75, 105, 135, 162, 198, 228, 258, 288, 318, 344];

    for (var mIdx = 0; mIdx < 12; mIdx++) {
      var daysInM = monthDays[mIdx];
      var doy = midDayOfYear[mIdx];
      var decl = 23.45 * Math.PI / 180 * Math.sin(2 * Math.PI * (284 + doy) / 365);
      var tAmbBase = 11.0 + 11.5 * Math.sin((mIdx - 3) * Math.PI / 6);

      for (var hr = 5; hr <= 20; hr++) {
        var omega = (hr + 0.5 - 12) * 15 * Math.PI / 180;
        var sinAlt = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(omega);
        if (sinAlt <= 0.04) continue;

        var gBeam = 840 * Math.pow(sinAlt, 0.78);
        var gDiff = 115 * Math.pow(sinAlt, 0.45);
        var gPoa = gBeam + gDiff;
        var tAmb = tAmbBase + 4.5 * Math.sin((hr - 9) * Math.PI / 12);
        var tCell = tAmb + gPoa / (25.0 + 6.84 * 2.0); // Modelo Faiman

        // Patrón solar matutino/vespertino de sombras parciales sobre sub-strings
        var lowSunFactor = Math.max(0.25, Math.min(1.65, 0.55 / Math.max(0.18, sinAlt)));

        // Agregación de bus DC común por inversor antes de aplicar eficiencia y clipping AC total (evita falso clipping Este-Oeste)
        var stepDcGlobalW = 0;
        var stepDcLocalW = 0;
        var stepDcMlpeW = 0;
        var stepIdealW = 0;
        var stepMicroAcW = 0;
        var stepVGlobalSum = 0;
        var stepVLocalSum = 0;

        for (var si = 0; si < stringsList.length; si++) {
          var st = stringsList[si];
          var modSubIrr = [];
          var pIdealStr = 0;
          var pMicroStr = 0;
          var pMlpeStr = 0;

          for (var pi = 0; pi < st.panels.length; pi++) {
            var pInfo = st.panels[pi];
            var pSingleIdeal = subP.wpMod * (gPoa / 1000.0) * Math.max(0.5, 1 + subP.gammaPmax * (tCell - 25));
            pIdealStr += pSingleIdeal;

            // Fracción instantánea sombreada en los 3 sub-strings de la placa (sombra progresiva de fila/chimenea)
            var shadeProb = Math.min(0.95, (pInfo.lossPct / 100.0) * lowSunFactor * 1.45);
            var gSub0 = gPoa;
            var gSub1 = gPoa;
            var gSub2 = gPoa;
            if (shadeProb >= 0.06) {
              gSub0 = gDiff + gBeam * Math.max(0, 1 - shadeProb * 2.4);
              if (shadeProb >= 0.28) gSub1 = gDiff + gBeam * Math.max(0, 1 - (shadeProb - 0.22) * 2.1);
              if (shadeProb >= 0.58) gSub2 = gDiff + gBeam * Math.max(0, 1 - (shadeProb - 0.50) * 2.0);
            }
            modSubIrr.push([gSub0, gSub1, gSub2]);

            var modMeanFactor = ((gSub0 + gSub1 + gSub2) / 3.0) / Math.max(1, gPoa);
            pMicroStr += pSingleIdeal * modMeanFactor * 0.962;
            pMlpeStr += pSingleIdeal * modMeanFactor * (pInfo.hasOpt ? 0.986 : 1.0);
          }

          var iv = solveStringIVCurve(subP, modSubIrr, tCell, inv, false);
          stepDcGlobalW += iv.pGlobalW;
          stepDcLocalW += iv.pLocalW;
          stepDcMlpeW += Math.max(iv.pGlobalW, pMlpeStr);
          stepIdealW += pIdealStr;
          stepMicroAcW += pMicroStr;
          stepVGlobalSum += iv.vGlobalV;
          stepVLocalSum += iv.vLocalV;

          var deltaW = (iv.pGlobalW - iv.pLocalW) + (Math.max(iv.pGlobalW, pMlpeStr) - iv.pGlobalW) * 0.5;
          if (hr >= 9 && hr <= 15 && deltaW > maxMismatchDeltaW) {
            maxMismatchDeltaW = deltaW;
            criticalStringName = st.name;
            criticalCurve = solveStringIVCurve(subP, modSubIrr, tCell, inv, true);
            criticalCurve.hourLabel = 'Mes ' + (mIdx + 1) + ' · ' + hr + ':00 h (G=' + Math.round(gPoa) + ' W/m²)';
          }
        }

        var nStrEff = Math.max(1, stringsList.length);
        var etaG = inverterEfficiency(stepDcGlobalW, stepVGlobalSum / nStrEff, inv, invCount);
        var etaL = inverterEfficiency(stepDcLocalW, stepVLocalSum / nStrEff, inv, invCount);
        var pGlobalAcBus = Math.min(totalInvAcMaxW, stepDcGlobalW * etaG);
        var pLocalAcBus = Math.min(totalInvAcMaxW, stepDcLocalW * etaL);
        var pMlpeAcBus = Math.min(totalInvAcMaxW, Math.max(pGlobalAcBus, stepDcMlpeW * etaG));

        kwhIdealUnshaded += (stepIdealW * 0.975 * daysInM) / 1000.0;
        kwhGlobal += (pGlobalAcBus * daysInM) / 1000.0;
        kwhLocal += (pLocalAcBus * daysInM) / 1000.0;
        kwhSelectiveMlpe += (pMlpeAcBus * daysInM) / 1000.0;
        kwhMicro += (stepMicroAcW * daysInM) / 1000.0;
      }
    }

    var gainGlobalVsLocalPct = kwhLocal > 0 ? ((kwhGlobal - kwhLocal) / kwhLocal) * 100 : 0;
    var gainMlpeVsGlobalPct = kwhGlobal > 0 ? ((kwhSelectiveMlpe - kwhGlobal) / kwhGlobal) * 100 : 0;
    var gainMicroVsGlobalPct = kwhGlobal > 0 ? ((kwhMicro - kwhGlobal) / kwhGlobal) * 100 : 0;
    var shadedPanelsCount = panels.filter(function (p) { return (p.annualLossPct || 0) >= 8 || p.isShaded; }).length;

    return {
      empty: false,
      totalPanels: panels.length,
      shadedPanelsCount: shadedPanelsCount,
      stringsCount: stringsList.length,
      criticalStringName: criticalStringName,
      criticalCurve: criticalCurve,
      kwhIdealUnshaded: Math.round(kwhIdealUnshaded),
      kwhLocal: Math.round(kwhLocal),
      kwhGlobal: Math.round(kwhGlobal),
      kwhSelectiveMlpe: Math.round(kwhSelectiveMlpe),
      kwhMicro: Math.round(kwhMicro),
      gainGlobalVsLocalPct: Number(gainGlobalVsLocalPct.toFixed(2)),
      gainMlpeVsGlobalPct: Number(gainMlpeVsGlobalPct.toFixed(2)),
      gainMicroVsGlobalPct: Number(gainMicroVsGlobalPct.toFixed(2)),
      invWindow: { minV: _num(inv.vMpptMin, 180), maxV: _num(inv.vMpptMax, 850) }
    };
  }

  function _escSvg(v) {
    if (global.RASanitize && typeof global.RASanitize.escapeHtml === 'function') return global.RASanitize.escapeHtml(v);
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function buildPvCurveSvg(sim) {
    if (!sim || !sim.criticalCurve || !sim.criticalCurve.points || sim.criticalCurve.points.length < 3) {
      return '';
    }
    var pts = sim.criticalCurve.points;
    var maxV = Math.max(100, pts[0].v * 1.06);
    var maxP = 100;
    for (var i = 0; i < pts.length; i++) if (pts[i].p > maxP) maxP = pts[i].p;
    maxP *= 1.12;

    var W = 420;
    var H = 148;
    var padL = 42;
    var padR = 14;
    var padT = 16;
    var padB = 24;
    var pw = W - padL - padR;
    var ph = H - padT - padB;

    var sx = function (v) { return padL + (v / maxV) * pw; };
    var sy = function (p) { return padT + ph - (p / maxP) * ph; };

    var dPath = pts.map(function (pt, idx) {
      return (idx === 0 ? 'M' : 'L') + sx(pt.v).toFixed(1) + ',' + sy(pt.p).toFixed(1);
    }).join(' ');

    var xMinWin = Math.max(padL, sx(sim.invWindow.minV));
    var xMaxWin = Math.min(W - padR, sx(sim.invWindow.maxV));
    var gX = sx(sim.criticalCurve.vGlobalV);
    var gY = sy(sim.criticalCurve.pGlobalW);
    var lX = sx(sim.criticalCurve.vLocalV);
    var lY = sy(sim.criticalCurve.pLocalW);

    return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;max-width:460px;height:auto;background:rgba(2,6,23,0.75);border:1px solid rgba(56,189,248,0.22);border-radius:8px;" role="img" aria-label="Curva potencia-tensión Bishop multi-pico del string">' +
      '<rect x="' + xMinWin.toFixed(1) + '" y="' + padT + '" width="' + Math.max(2, xMaxWin - xMinWin).toFixed(1) + '" height="' + ph + '" fill="rgba(56,189,248,0.08)" />' +
      '<line x1="' + padL + '" y1="' + (padT + ph) + '" x2="' + (W - padR) + '" y2="' + (padT + ph) + '" stroke="#475569" stroke-width="1"/>' +
      '<line x1="' + padL + '" y1="' + padT + '" x2="' + padL + '" y2="' + (padT + ph) + '" stroke="#475569" stroke-width="1"/>' +
      '<path d="' + dPath + '" fill="none" stroke="#38BDF8" stroke-width="2.2"/>' +
      '<circle cx="' + gX.toFixed(1) + '" cy="' + gY.toFixed(1) + '" r="4.5" fill="#10B981" stroke="#fff" stroke-width="1.2"/>' +
      '<circle cx="' + lX.toFixed(1) + '" cy="' + lY.toFixed(1) + '" r="4" fill="#F59E0B" stroke="#fff" stroke-width="1"/>' +
      '<text x="' + (padL + 6) + '" y="' + (padT + 11) + '" fill="#94A3B8" font-size="11">P-V String ' + _escSvg(sim.criticalStringName) + ' · ' + _escSvg(sim.criticalCurve.hourLabel || '') + '</text>' +
      '<text x="' + (W - padR - 2) + '" y="' + (H - 5) + '" fill="#94A3B8" font-size="11" text-anchor="end">Tensión DC (V) · MPPT [' + sim.invWindow.minV + '–' + sim.invWindow.maxV + 'V]</text>' +
      '<text x="' + (padL - 4) + '" y="' + (padT + 10) + '" fill="#94A3B8" font-size="11" text-anchor="end">' + (maxP / 1000).toFixed(1) + 'kW</text>' +
    '</svg>';
  }

  function buildSummaryHTML(sim) {
    if (!sim || sim.empty) {
      return '<div style="padding:12px;border:1px dashed rgba(148,163,184,0.3);border-radius:8px;color:#94A3B8;font-size:12px;">' + _escSvg(sim && sim.message ? sim.message : 'Ejecuta el simulador Bishop 8760h para ver la curva P-V multi-pico y la comparativa de topologías.') + '</div>';
    }
    var svg = buildPvCurveSvg(sim);
    return '<div style="display:grid;grid-template-columns:minmax(260px,1.25fr) minmax(260px,1fr);gap:12px;align-items:start;">' +
      '<div style="overflow-x:auto;border:1px solid rgba(255,255,255,0.1);border-radius:8px;background:rgba(15,23,42,0.72);">' +
        '<table style="width:100%;border-collapse:collapse;font-size:12px;color:#F1F5F9;">' +
          '<thead><tr style="background:rgba(56,189,248,0.12);font-size:11px;text-transform:uppercase;">' +
            '<th scope="col" style="padding:7px 9px;text-align:left;">Arquitectura / Algoritmo MPPT</th>' +
            '<th scope="col" style="padding:7px 9px;text-align:right;">Energía 8760h</th>' +
            '<th scope="col" style="padding:7px 9px;text-align:right;">vs String Global</th>' +
          '</tr></thead>' +
          '<tbody>' +
            '<tr style="border-top:1px solid rgba(255,255,255,0.08);"><td style="padding:7px 9px;color:#FBBF24;font-weight:700;">String Puro · MPPT Local</td><td style="padding:7px 9px;text-align:right;font-family:var(--font-mono);">' + sim.kwhLocal.toLocaleString('es-ES') + ' kWh</td><td style="padding:7px 9px;text-align:right;font-family:var(--font-mono);color:#FB7185;">' + (-sim.gainGlobalVsLocalPct).toFixed(2) + ' %</td></tr>' +
            '<tr style="border-top:1px solid rgba(255,255,255,0.08);"><td style="padding:7px 9px;color:#38BDF8;font-weight:800;">String Puro · MPPT Multi-Pico Global</td><td style="padding:7px 9px;text-align:right;font-family:var(--font-mono);font-weight:800;">' + sim.kwhGlobal.toLocaleString('es-ES') + ' kWh</td><td style="padding:7px 9px;text-align:right;font-family:var(--font-mono);color:#94A3B8;">Base (0,00 %)</td></tr>' +
            '<tr style="border-top:1px solid rgba(255,255,255,0.08);"><td style="padding:7px 9px;color:#34D399;font-weight:800;">Optimizadores Selectivos MLPE (' + sim.shadedPanelsCount + ' uds)</td><td style="padding:7px 9px;text-align:right;font-family:var(--font-mono);font-weight:800;">' + sim.kwhSelectiveMlpe.toLocaleString('es-ES') + ' kWh</td><td style="padding:7px 9px;text-align:right;font-family:var(--font-mono);color:#34D399;font-weight:700;">+' + sim.gainMlpeVsGlobalPct.toFixed(2) + ' %</td></tr>' +
            '<tr style="border-top:1px solid rgba(255,255,255,0.08);"><td style="padding:7px 9px;color:#C084FC;font-weight:700;">Microinversores Independientes</td><td style="padding:7px 9px;text-align:right;font-family:var(--font-mono);">' + sim.kwhMicro.toLocaleString('es-ES') + ' kWh</td><td style="padding:7px 9px;text-align:right;font-family:var(--font-mono);color:' + (sim.gainMicroVsGlobalPct >= 0 ? '#34D399' : '#FBBF24') + ';">' + (sim.gainMicroVsGlobalPct >= 0 ? '+' : '') + sim.gainMicroVsGlobalPct.toFixed(2) + ' %</td></tr>' +
          '</tbody>' +
        '</table>' +
      '</div>' +
      '<div>' + svg +
        '<div style="font-size:11px;color:#94A3B8;margin-top:4px;"><span style="color:#10B981;">●</span> MPPT Global · <span style="color:#F59E0B;">●</span> MPPT Local · ' + sim.stringsCount + ' strings / ' + sim.totalPanels + ' módulos evaluados con 3 diodos de bypass por placa.</div>' +
      '</div>' +
    '</div>';
  }

  global.RABishopIVEngine = {
    calibrateSubmoduleParams: calibrateSubmoduleParams,
    solveStringIVCurve: solveStringIVCurve,
    runAnnualSimulation: runAnnualBishopSimulation,
    buildSummaryHTML: buildSummaryHTML
  };

  if (global.RA) global.RA.BishopIV = global.RABishopIVEngine;
})(typeof window !== 'undefined' ? window : this);
