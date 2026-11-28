/**
 * ============================================================================
 * 🔬 RA - MODELOS FOTOVOLTAICOS AVANZADOS NIVEL AAA (FASE 3.5)
 * ============================================================================
 * Archivo: js/pv-advanced-models.js
 * API Pública: window.RAPVAdvanced / window.RA.PVAdvanced
 *
 * Incluye:
 *   1. Solver Numérico de 1 Diodo (5 parámetros De Soto 2006 + avalancha Bishop 1988)
 *      por sub-string (3 sub-strings con diodo de bypass) para curvas I-V / P-V
 *      bajo sombreado parcial y cuantificación rigurosa String vs MLPE.
 *   2. Modelo Bifacial 2D por Factores de Vista (View Factors) para irradiancia
 *      trasera G_rear en función de altura libre h, pitch/GCR, inclinación β y albedo.
 *   3. Modelo de Pérdidas Desacopladas Bancables:
 *      - Soiling dinámico dependiente de precipitación mensual (Kimber et al.)
 *      - LID / LeTID Año 1 estrictamente separado de degradación lineal anual
 *      - Árbol completo de pérdidas sin doble conteo.
 *
 * Estándar UMD/IIFE sin dependencias DOM (compatible Navegador, Worker y Node.js).
 * ============================================================================
 */
(function (root) {
  'use strict';

  var DEG2RAD = Math.PI / 180.0;
  var KB_EV_K = 8.617333262e-5; // Constante de Boltzmann en eV/K
  var KB_J_K = 1.380649e-23;    // Constante de Boltzmann en J/K
  var Q_E = 1.602176634e-19;    // Carga elemental en C
  var T_STC_K = 298.15;         // 25 °C en Kelvin
  var G_STC = 1000.0;           // W/m² STC
  var EG_REF_SI = 1.121;        // Bandgap Si a 25 °C (eV)

  // Precipitación mensual media por zona climática española (mm/mes, AEMET referencia)
  var MONTHLY_RAIN_CLIMATE_MM = {
    costa_med:  [38, 34, 35, 42, 34, 18, 8,  16, 48, 65, 52, 42],
    costal_med: [38, 34, 35, 42, 34, 18, 8,  16, 48, 65, 52, 42],
    interior:   [33, 35, 32, 45, 48, 26, 11, 12, 28, 52, 48, 44],
    atlantico:  [135, 115, 105, 110, 92, 58, 38, 48, 82, 130, 148, 145],
    canarias:   [32, 26, 22, 12, 5,  1,  0,  1,  6,  20, 36, 38],
    arido:      [18, 18, 20, 22, 16, 6,  2,  3,  18, 28, 24, 20]
  };

  var DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. SOLVER DE 1 DIODO (5 PARÁMETROS DE SOTO / BISHOP) + 3 SUB-STRINGS BYPASS
  // ═══════════════════════════════════════════════════════════════════════════

  function _inferNsFromVoc(voc) {
    var candidates = [54, 60, 66, 72, 96];
    var est = voc / 0.70;
    var best = 60;
    var minDiff = Infinity;
    for (var i = 0; i < candidates.length; i++) {
      var d = Math.abs(candidates[i] - est);
      if (d < minDiff) {
        minDiff = d;
        best = candidates[i];
      }
    }
    return best;
  }

  /**
   * Resuelve (iL, i0, rs, rsh) dado un parámetro de idealidad modificado aRef = n * Ns * Vth.
   * Garantiza exactamente I(0)=Isc, I(Voc)=0, I(Vmp)=Imp y evalúa dP/dV en (Vmp, Imp).
   */
  function _solveRsForGivenA(voc, isc, vmp, imp, a) {
    var rsMax = Math.max(1e-4, ((voc - vmp) / Math.max(0.1, imp)) * 0.92);

    function evalTrial(rs) {
      var eOc = Math.expm1(voc / a);
      var eSc = Math.expm1((isc * rs) / a);
      var eMp = Math.expm1((vmp + imp * rs) / a);
      var dE = eOc - eSc;
      if (!(dE > 0) || !isFinite(eOc) || !isFinite(eMp)) return null;

      var ratio = (eOc - eMp) / dE;
      var numGsh = imp - isc * ratio;
      var denGsh = (voc - vmp - imp * rs) - (voc - isc * rs) * ratio;
      if (Math.abs(denGsh) < 1e-12) return null;

      var gsh = numGsh / denGsh;
      if (!(gsh > 1e-6) || gsh > 0.5) return null; // Rsh en [2 Ω, 1 MΩ]

      var i0 = (isc - (voc - isc * rs) * gsh) / dE;
      if (!(i0 > 0) || !isFinite(i0)) return null;

      var iL = i0 * eOc + voc * gsh;
      if (!(iL > 0) || !isFinite(iL)) return null;

      var gDiodeMp = (i0 / a) * (eMp + 1.0);
      var gTot = gDiodeMp + gsh;
      var dIdV = -gTot / (1.0 + rs * gTot);
      var dPdV = imp + vmp * dIdV;

      return { rs: rs, rsh: 1.0 / gsh, gsh: gsh, i0: i0, iL: iL, a: a, dPdV: dPdV };
    }

    // Muestrear Rs en [0.001, rsMax] buscando cambio de signo de dPdV
    var samples = 40;
    var validTrials = [];
    for (var k = 0; k <= samples; k++) {
      var rsTry = 0.0005 + (rsMax - 0.0005) * (k / samples);
      var res = evalTrial(rsTry);
      if (res) validTrials.push(res);
    }
    if (validTrials.length === 0) return null;

    // Buscar intervalo con cruce por cero de dPdV
    var lo = null, hi = null;
    for (var j = 0; j < validTrials.length - 1; j++) {
      if (validTrials[j].dPdV * validTrials[j + 1].dPdV <= 0) {
        lo = validTrials[j];
        hi = validTrials[j + 1];
        break;
      }
    }

    if (lo && hi) {
      var rLo = lo.rs;
      var rHi = hi.rs;
      var fLo = lo.dPdV;
      var best = lo;
      for (var iter = 0; iter < 40; iter++) {
        var rMid = 0.5 * (rLo + rHi);
        var mRes = evalTrial(rMid);
        if (!mRes) break;
        best = mRes;
        if (Math.abs(mRes.dPdV) < 1e-7) break;
        if (fLo * mRes.dPdV <= 0) {
          rHi = rMid;
        } else {
          rLo = rMid;
          fLo = mRes.dPdV;
        }
      }
      return best;
    }

    // Si no hubo cruce exacto para este n, devolver el más cercano a dPdV = 0
    validTrials.sort(function (x, y) { return Math.abs(x.dPdV) - Math.abs(y.dPdV); });
    return validTrials[0];
  }

  /**
   * Extrae los 5 parámetros del modelo de 1 diodo (De Soto) en STC a partir de la hoja técnica.
   * @param {Object} moduleSpec { voc, isc, vmp, imp, ns?, tempCoeffIsc?, tempCoeffVoc?, tempCoeffPmax?, nSubstrings? }
   */
  function extractDeSotoParameters(moduleSpec) {
    var spec = moduleSpec || {};
    var voc = Number(spec.voc) > 5 ? Number(spec.voc) : 45.0;
    var isc = Number(spec.isc) > 1 ? Number(spec.isc) : 11.0;
    var vmp = Number(spec.vmp) > 3 && Number(spec.vmp) < voc ? Number(spec.vmp) : voc * 0.82;
    var imp = Number(spec.imp) > 0.5 && Number(spec.imp) < isc ? Number(spec.imp) : isc * 0.93;
    var ns = Number(spec.ns) > 0 ? Math.round(Number(spec.ns)) : _inferNsFromVoc(voc);
    var nSubstrings = Number(spec.nSubstrings) >= 1 ? Math.round(Number(spec.nSubstrings)) : 3;

    // Coeficientes térmicos: convertir %/K a unidades absolutas si vienen en %/°C
    var rawAlpha = (typeof spec.tempCoeffIsc === 'number') ? spec.tempCoeffIsc : 0.045;
    var alphaIsc = Math.abs(rawAlpha) < 0.005 ? rawAlpha : (rawAlpha / 100.0) * isc; // A/K
    var rawBeta = (typeof spec.tempCoeffVoc === 'number') ? spec.tempCoeffVoc : -0.26;
    var betaVoc;
    if (spec.tempCoeffVocUnit === '%/C' || spec.tempCoeffVocUnit === '%/°C' || spec.tempCoeffVocUnit === '%/K') {
      betaVoc = (rawBeta / 100.0) * voc;
    } else if (spec.tempCoeffVocUnit === 'V/K' || spec.tempCoeffVocUnit === 'V/C') {
      betaVoc = rawBeta;
    } else if (Math.abs(rawBeta) <= 0.02) {
      betaVoc = rawBeta * voc; // 1/K -> V/K
    } else if (Math.abs(rawBeta) > 0.18) {
      betaVoc = (rawBeta / 100.0) * voc; // %/°C -> V/K
    } else {
      betaVoc = rawBeta; // V/K directo
    }
    var rawGamma = (typeof spec.tempCoeffPmax === 'number') ? spec.tempCoeffPmax : -0.32;
    var gammaPmp = Math.abs(rawGamma) > 0.02 ? (rawGamma / 100.0) : rawGamma; // 1/K

    var vThRef = (KB_J_K * T_STC_K) / Q_E; // ~0.0256926 V
    var bestSol = null;
    var bestN = 1.15;

    // Barrer factor de idealidad típico de Si cristalino n ∈ [0.95, 1.45]
    for (var nTry = 0.95; nTry <= 1.451; nTry += 0.05) {
      var aTry = nTry * ns * vThRef;
      var sol = _solveRsForGivenA(voc, isc, vmp, imp, aTry);
      if (!sol) continue;
      if (!bestSol || Math.abs(sol.dPdV) < Math.abs(bestSol.dPdV)) {
        bestSol = sol;
        bestN = Number(nTry.toFixed(2));
      }
      if (Math.abs(sol.dPdV) < 1e-4) break;
    }

    if (!bestSol) {
      // Fallback analítico robusto si la ficha técnica tuviera valores atípicos
      var aFb = 1.15 * ns * vThRef;
      var rsFb = Math.max(0.05, ((voc - vmp) / imp) * 0.25);
      var rshFb = Math.max(100, voc / Math.max(0.01, isc - imp));
      var i0Fb = isc / Math.max(1.0, Math.expm1(voc / aFb));
      bestSol = { iL: isc, i0: i0Fb, a: aFb, rs: rsFb, rsh: rshFb, dPdV: 0 };
    }

    return {
      iLRef: bestSol.iL,
      i0Ref: bestSol.i0,
      aRef: bestSol.a,
      rsRef: bestSol.rs,
      rshRef: bestSol.rsh,
      ns: ns,
      nId: bestN,
      nSubstrings: nSubstrings,
      voc: voc,
      isc: isc,
      vmp: vmp,
      imp: imp,
      pmp: vmp * imp,
      alphaIsc: alphaIsc,
      betaVoc: betaVoc,
      gammaPmp: gammaPmp
    };
  }

  /**
   * Traduce los 5 parámetros STC a condiciones reales de operación (G, Tc) según De Soto (2006).
   */
  function translateDeSotoParams(stcParams, irradianceWm2, cellTempC) {
    var G = Math.max(0, Number(irradianceWm2) || 0);
    var Tc = (typeof cellTempC === 'number' && isFinite(cellTempC)) ? cellTempC : 25.0;
    var Tk = Math.max(180.0, Tc + 273.15);
    var dT = Tk - T_STC_K;

    var egT = EG_REF_SI * (1.0 - 0.0002677 * dT);
    var a = stcParams.aRef * (Tk / T_STC_K);
    var gRatio = G / G_STC;

    var iL = gRatio * Math.max(0, stcParams.iLRef + stcParams.alphaIsc * dT);
    // De Soto Eq. (6): I0(T) = I0_ref * (T/Tref)^3 * exp((1/kB)*(Eg_ref/Tref - Eg(T)/T))
    var expArg = (1.0 / (KB_EV_K * stcParams.nId)) * ((EG_REF_SI / T_STC_K) - (egT / Tk));
    // Acotar exponente por seguridad numérica
    expArg = Math.max(-60, Math.min(60, expArg));
    var i0 = stcParams.i0Ref * Math.pow(Tk / T_STC_K, 3) * Math.exp(expArg);
    var rs = stcParams.rsRef;
    var rsh = stcParams.rshRef * (G_STC / Math.max(10.0, G));

    return {
      G: G,
      cellTempC: Tc,
      iL: iL,
      i0: i0,
      a: a,
      rs: rs,
      rsh: rsh
    };
  }

  /**
   * Resuelve el voltaje V_k de un sub-string a corriente fija I usando el modelo 1-diodo +
   * avalancha inversa de Bishop (1988) + diodo de bypass anti-paralelo.
   */
  function solveSubstringVoltageAtCurrent(subParams, currentA, options) {
    var opts = options || {};
    var vBypass = (typeof opts.bypassVoltageV === 'number') ? opts.bypassVoltageV : 0.65;
    var vBr = (typeof opts.breakdownVoltageV === 'number') ? opts.breakdownVoltageV : -18.0;
    var kBishop = (typeof opts.kBishop === 'number') ? opts.kBishop : 0.10;
    var mBishop = (typeof opts.mBishop === 'number') ? opts.mBishop : 3.0;
    var vThBp = 0.035; // pendiente térmica suave del diodo Schottky de bypass

    var iL = subParams.iL;
    var i0 = subParams.i0;
    var a = Math.max(1e-4, subParams.a);
    var rs = Math.max(1e-4, subParams.rs);
    var rsh = Math.max(1.0, subParams.rsh);
    var I = currentA;

    // Corriente inversa de saturación del diodo de bypass calibrada a vBypass a 10 A
    var i0Bp = 10.0 / Math.max(1.0, Math.expm1(vBypass / vThBp));

    function evalF(V) {
      var vj = V + I * rs;
      // Rama exponencial célula
      var expCellArg = Math.min(80.0, vj / a);
      var iDiode = i0 * Math.expm1(expCellArg);
      var dDiode = (i0 / a) * Math.exp(expCellArg);

      // Rama shunt + avalancha Bishop (1988) cuando vj < 0
      var bishopFactor = 1.0;
      var dBishop = 0.0;
      if (vj < 0 && vBr < -1.0) {
        var denomBr = Math.max(0.05, 1.0 - vj / vBr);
        var invPow = Math.pow(denomBr, -mBishop);
        bishopFactor = 1.0 + kBishop * invPow;
        dBishop = kBishop * (mBishop / (-vBr)) * Math.pow(denomBr, -(mBishop + 1));
      }
      var iShunt = (vj / rsh) * bishopFactor;
      var dShunt = (bishopFactor + vj * dBishop) / rsh;

      // Diodo de bypass en anti-paralelo (conduce cuando V < 0)
      var expBpArg = Math.min(60.0, -V / vThBp);
      var iBp = (V < 0) ? (i0Bp * Math.expm1(expBpArg)) : 0.0;
      var dBp = (V < 0) ? (-(i0Bp / vThBp) * Math.exp(expBpArg)) : 0.0;

      // Ecuación de corriente: I_sub(V) + I_bp(-V) - I = 0
      var f = (iL - iDiode - iShunt + iBp) - I;
      var df = -(dDiode + dShunt) + dBp; // estrictamente negativo (< 0)
      return { f: f, df: df };
    }

    var vLo = -(vBypass + 0.6);
    var vHi = a * Math.log(Math.max(1.0, (iL / Math.max(1e-18, i0)) + 1.0)) + 2.0;

    // Comprobar cotas para garantizar bracket válido
    if (evalF(vLo).f < 0) {
      vLo -= 2.0;
    }
    var V = (I <= iL) ? Math.max(0.0, 0.75 * vHi) : -vBypass;

    for (var iter = 0; iter < 32; iter++) {
      var ev = evalF(V);
      if (Math.abs(ev.f) < 1e-7) break;
      if (ev.f > 0) vLo = Math.max(vLo, V);
      else vHi = Math.min(vHi, V);

      var vNext = (Math.abs(ev.df) > 1e-12) ? (V - ev.f / ev.df) : 0.5 * (vLo + vHi);
      if (!isFinite(vNext) || vNext <= vLo || vNext >= vHi) {
        vNext = 0.5 * (vLo + vHi);
      }
      V = vNext;
      if ((vHi - vLo) < 1e-7) break;
    }

    return V;
  }

  /**
   * Calcula la curva I-V y P-V completa de un módulo con 3 sub-strings bajo sombreado parcial.
   *
   * @param {Object} moduleSpec Parámetros de ficha técnica del módulo
   * @param {Object} [options]
   * @param {number[]|number} [options.subIrradiances=[1000,1000,1000]] Irradiancia en cada sub-string (W/m²)
   * @param {number[]|number} [options.subTempsC=25] Temperatura de célula (°C)
   * @param {number} [options.points=150] Resolución de puntos
   * @param {number} [options.bypassVoltageV=0.65] Tensión umbral del diodo de bypass (V)
   */
  function computeModuleIVCurve(moduleSpec, options) {
    var opts = options || {};
    var stc = extractDeSotoParameters(moduleSpec);
    var nSub = stc.nSubstrings;

    var irrArr;
    if (Array.isArray(opts.subIrradiances) && opts.subIrradiances.length > 0) {
      irrArr = [];
      for (var s = 0; s < nSub; s++) {
        irrArr.push(Math.max(0, Number(opts.subIrradiances[Math.min(s, opts.subIrradiances.length - 1)]) || 0));
      }
    } else {
      var gUniform = (typeof opts.subIrradiances === 'number') ? Math.max(0, opts.subIrradiances) : 1000.0;
      irrArr = new Array(nSub).fill(gUniform);
    }

    var tempArr;
    if (Array.isArray(opts.subTempsC) && opts.subTempsC.length > 0) {
      tempArr = [];
      for (var st = 0; st < nSub; st++) {
        var tVal = Number(opts.subTempsC[Math.min(st, opts.subTempsC.length - 1)]);
        tempArr.push(isFinite(tVal) ? tVal : 25.0);
      }
    } else {
      var tUni = (typeof opts.subTempsC === 'number' && isFinite(opts.subTempsC)) ? opts.subTempsC : 25.0;
      tempArr = new Array(nSub).fill(tUni);
    }

    // Construir parámetros por sub-string (1/nSub de a, rs, rsh, voc)
    var subParamsList = [];
    var iMaxSweep = 0;
    for (var k = 0; k < nSub; k++) {
      var modCond = translateDeSotoParams(stc, irrArr[k], tempArr[k]);
      var subP = {
        iL: modCond.iL,
        i0: modCond.i0,
        a: modCond.a / nSub,
        rs: modCond.rs / nSub,
        rsh: modCond.rsh / nSub
      };
      subParamsList.push(subP);
      if (subP.iL > iMaxSweep) iMaxSweep = subP.iL;
    }

    if (iMaxSweep < 1e-4) {
      return {
        curve: [{ v: 0, i: 0, p: 0, vSub: new Array(nSub).fill(0) }],
        isc: 0, voc: 0, vmp: 0, imp: 0, pmp: 0, ff: 0,
        localPeaks: [], stcParams: stc, subIrradiances: irrArr, subTempsC: tempArr
      };
    }

    // Construir rejilla adaptativa de corriente concentrando puntos en los codos de cada sub-string
    var nPts = Math.max(60, Math.min(400, Number(opts.points) || 160));
    var iMaxLim = iMaxSweep * 1.03;
    var iSamples = [];
    for (var p = 0; p <= nPts; p++) {
      iSamples.push((p / nPts) * iMaxLim);
    }
    // Añadir puntos finos alrededor de cada iL[k] y del zona MPP (~0.88..0.96 * iL)
    for (var kk = 0; kk < nSub; kk++) {
      var ik = subParamsList[kk].iL;
      [0.86, 0.90, 0.92, 0.94, 0.96, 0.98, 0.995, 1.005, 1.02].forEach(function (f) {
        var val = ik * f;
        if (val > 0 && val <= iMaxLim) iSamples.push(val);
      });
    }
    iSamples.sort(function (a, b) { return a - b; });
    // Deduplicar muy cercanos
    var uniqueI = [];
    for (var u = 0; u < iSamples.length; u++) {
      if (uniqueI.length === 0 || (iSamples[u] - uniqueI[uniqueI.length - 1]) > 1e-4) {
        uniqueI.push(iSamples[u]);
      }
    }

    var rawCurve = [];
    for (var idx = 0; idx < uniqueI.length; idx++) {
      var curI = uniqueI[idx];
      var vSum = 0;
      var vSub = [];
      for (var sk = 0; sk < nSub; sk++) {
        var vk = solveSubstringVoltageAtCurrent(subParamsList[sk], curI, opts);
        vSub.push(vk);
        vSum += vk;
      }
      rawCurve.push({ v: vSum, i: curI, p: vSum * curI, vSub: vSub });
    }

    // Recortar en V >= 0 interpolando el punto exacto de cortocircuito Isc (V = 0)
    var curve = [];
    var iscVal = 0;
    for (var c = 0; c < rawCurve.length; c++) {
      var pt = rawCurve[c];
      if (pt.v >= 0) {
        curve.push({
          v: Number(pt.v.toFixed(4)),
          i: Number(pt.i.toFixed(4)),
          p: Number(Math.max(0, pt.p).toFixed(4)),
          vSub: pt.vSub
        });
        iscVal = pt.i;
      } else {
        if (c > 0 && rawCurve[c - 1].v > 0) {
          var prev = rawCurve[c - 1];
          var fracZero = prev.v / (prev.v - pt.v);
          iscVal = prev.i + fracZero * (pt.i - prev.i);
          curve.push({
            v: 0,
            i: Number(iscVal.toFixed(4)),
            p: 0,
            vSub: pt.vSub
          });
        }
        break;
      }
    }

    // Ordenar de menor a mayor voltaje (V = 0 .. Voc) para lectura estándar I-V / P-V
    curve.sort(function (a, b) { return a.v - b.v; });
    var vocVal = curve.length > 0 ? curve[curve.length - 1].v : 0;

    // Buscar Global MPP y picos locales en P(V)
    var pmp = 0, vmp = 0, imp = 0;
    var localPeaks = [];
    for (var m = 0; m < curve.length; m++) {
      if (curve[m].p > pmp) {
        pmp = curve[m].p;
        vmp = curve[m].v;
        imp = curve[m].i;
      }
      if (m > 0 && m < curve.length - 1) {
        if (curve[m].p > curve[m - 1].p && curve[m].p >= curve[m + 1].p && curve[m].p > 1.0) {
          localPeaks.push({ v: curve[m].v, i: curve[m].i, p: curve[m].p });
        }
      }
    }

    var ff = (vocVal * iscVal > 1e-4) ? (pmp / (vocVal * iscVal)) : 0;

    return {
      curve: curve,
      isc: Number(iscVal.toFixed(3)),
      voc: Number(vocVal.toFixed(3)),
      vmp: Number(vmp.toFixed(3)),
      imp: Number(imp.toFixed(3)),
      pmp: Number(pmp.toFixed(2)),
      ff: Number(ff.toFixed(4)),
      localPeaks: localPeaks,
      stcParams: stc,
      subIrradiances: irrArr,
      subTempsC: tempArr
    };
  }

  /**
   * Conecta en serie N módulos bajo distintas condiciones de sombra y compara
   * la potencia extraída por un inversor string (Global MPPT vs local) frente a MLPE.
   *
   * @param {Array<{moduleSpec?: Object, subIrradiances: number[], subTempsC?: number[]}>} moduleConditions
   * @param {Object} [options] { mlpeEfficiency?: 0.992, points?: 160 }
   */
  function computeStringComparison(moduleConditions, options) {
    var opts = options || {};
    var list = Array.isArray(moduleConditions) ? moduleConditions : [];
    if (list.length === 0) {
      return { stringGlobalPmpW: 0, mlpeTotalPmpW: 0, mlpeGainW: 0, mlpeGainPct: 0, moduleResults: [], stringCurve: [] };
    }

    var mlpeEff = (typeof opts.mlpeEfficiency === 'number') ? opts.mlpeEfficiency : 0.992;
    var moduleResults = [];
    var iMaxGlobal = 0;
    var mlpeRawSum = 0;

    for (var m = 0; m < list.length; m++) {
      var item = list[m];
      var res = computeModuleIVCurve(item.moduleSpec || opts.moduleSpec || {}, {
        subIrradiances: item.subIrradiances,
        subTempsC: item.subTempsC,
        points: opts.points || 140,
        bypassVoltageV: opts.bypassVoltageV
      });
      moduleResults.push(res);
      mlpeRawSum += res.pmp;
      if (res.isc > iMaxGlobal) iMaxGlobal = res.isc;
    }

    // Evaluar suma serie V_string(I) = Σ V_m(I) interpolando las curvas I-V de cada módulo
    function interpVAtI(curve, targetI) {
      // curve está ordenado por v creciente (i decreciente)
      if (curve.length === 0) return 0;
      if (targetI <= 0) return curve[curve.length - 1].v;
      if (targetI >= curve[0].i) return 0;
      for (var j = 0; j < curve.length - 1; j++) {
        var c0 = curve[j];     // i mayor, v menor
        var c1 = curve[j + 1]; // i menor, v mayor
        if (targetI <= c0.i && targetI >= c1.i) {
          var di = c0.i - c1.i;
          var t = di > 1e-7 ? (c0.i - targetI) / di : 0;
          return c0.v + t * (c1.v - c0.v);
        }
      }
      return 0;
    }

    var nSamples = 180;
    var stringCurve = [];
    var strPmp = 0, strVmp = 0, strImp = 0;
    for (var s = 0; s <= nSamples; s++) {
      var curI = (s / nSamples) * iMaxGlobal;
      var vSum = 0;
      for (var k = 0; k < moduleResults.length; k++) {
        vSum += interpVAtI(moduleResults[k].curve, curI);
      }
      if (vSum < 0) vSum = 0;
      var pVal = vSum * curI;
      stringCurve.push({ v: Number(vSum.toFixed(3)), i: Number(curI.toFixed(3)), p: Number(pVal.toFixed(2)) });
      if (pVal > strPmp) {
        strPmp = pVal;
        strVmp = vSum;
        strImp = curI;
      }
    }

    var mlpeNetPmp = mlpeRawSum * mlpeEff;
    var mlpeGainW = Math.max(0, mlpeNetPmp - strPmp);
    var mlpeGainPct = strPmp > 1.0 ? (mlpeGainW / strPmp) * 100.0 : 0;

    return {
      moduleCount: list.length,
      stringGlobalPmpW: Number(strPmp.toFixed(2)),
      stringGlobalVmpV: Number(strVmp.toFixed(2)),
      stringGlobalImpA: Number(strImp.toFixed(2)),
      mlpeRawSumPmpW: Number(mlpeRawSum.toFixed(2)),
      mlpeTotalPmpW: Number(mlpeNetPmp.toFixed(2)),
      mlpeGainW: Number(mlpeGainW.toFixed(2)),
      mlpeGainPct: Number(mlpeGainPct.toFixed(2)),
      moduleResults: moduleResults,
      stringCurve: stringCurve
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. MODELO BIFACIAL 2D POR FACTORES DE VISTA (VIEW FACTORS)
  // ═══════════════════════════════════════════════════════════════════════════

  function _segmentsIntersect2D(ax, az, bx, bz, cx, cz, dx, dz) {
    var rX = bx - ax, rZ = bz - az;
    var sX = dx - cx, sZ = dz - cz;
    var denom = rX * sZ - rZ * sX;
    if (Math.abs(denom) < 1e-10) return false;
    var qpx = cx - ax, qpz = cz - az;
    var t = (qpx * sZ - qpz * sX) / denom;
    var u = (qpx * rZ - qpz * rX) / denom;
    return (t > 1e-4 && t < 1 - 1e-4 && u > 1e-4 && u < 1 - 1e-4);
  }

  /**
   * Calcula los factores de vista 2D e irradiancia trasera G_rear para módulos bifaciales.
   * Geometría 2D de filas infinitas de longitud inclinada L, paso P (o GCR = L/P),
   * altura libre inferior h, inclinación β y albedo ρ_g.
   *
   * @param {Object} params
   * @param {number} [params.tiltDeg=25]               Inclinación β (°)
   * @param {number} [params.clearanceHeightM=0.50]    Altura libre del borde inferior sobre suelo (m)
   * @param {number} [params.moduleLengthM=2.0]        Longitud inclinada de la mesa/módulo L (m)
   * @param {number} [params.pitchM]                   Paso entre filas P (m). Si se omite, se deriva de GCR
   * @param {number} [params.gcr=0.45]                 Ground Coverage Ratio (L/P) si no se pasa pitchM
   * @param {number} [params.albedo=0.25]              Albedo del suelo (0.05 .. 0.90)
   * @param {number} [params.ghi=800]                  Irradiancia global horizontal (W/m²)
   * @param {number} [params.dhi=180]                  Irradiancia difusa horizontal (W/m²)
   * @param {number} [params.dni=750]                  Irradiancia directa normal (W/m²)
   * @param {number} [params.gFront]                   Irradiancia frontal POA (si ya calculada)
   * @param {number} [params.sunElevDeg=50]            Elevación solar (°)
   * @param {number} [params.sunAzSurDeg=0]            Acimut solar respecto al Sur (°)
   * @param {number} [params.panelAzSurDeg=0]          Acimut del módulo respecto al Sur (°)
   * @param {number} [params.bifacialityFactor=0.80]   Factor de bifacialidad φ (0.65 .. 0.90)
   * @param {number} [params.structureShadingFactor=0.06] Sombreado estructural trasero (raíles/caja)
   */
  function computeBifacialViewFactors(params) {
    var p = params || {};
    var tiltDeg = Math.max(0.5, Math.min(89.5, (typeof p.tiltDeg === 'number') ? p.tiltDeg : 25.0));
    var beta = tiltDeg * DEG2RAD;
    var L = Math.max(0.5, Number(p.moduleLengthM) || 2.0);
    var h = Math.max(0.02, (typeof p.clearanceHeightM === 'number') ? p.clearanceHeightM : 0.50);

    var pitchM;
    if (typeof p.pitchM === 'number' && p.pitchM > 0.2) {
      pitchM = Math.max(L * Math.cos(beta) + 0.05, p.pitchM);
    } else {
      var gcrIn = Math.max(0.05, Math.min(0.95, Number(p.gcr) || 0.45));
      pitchM = L / gcrIn;
    }
    var gcr = Math.min(1.0, L / pitchM);

    var albedo = Math.max(0.0, Math.min(0.95, (typeof p.albedo === 'number') ? p.albedo : 0.25));
    var phi = Math.max(0.0, Math.min(1.0, (typeof p.bifacialityFactor === 'number') ? p.bifacialityFactor : 0.80));
    var fStruct = Math.max(0.0, Math.min(0.40, (typeof p.structureShadingFactor === 'number') ? p.structureShadingFactor : 0.06));

    var ghi = Math.max(0, (typeof p.ghi === 'number') ? p.ghi : 800.0);
    var dhi = Math.max(0, (typeof p.dhi === 'number') ? p.dhi : 180.0);
    var dni = Math.max(0, (typeof p.dni === 'number') ? p.dni : 750.0);
    var sunElevDeg = (typeof p.sunElevDeg === 'number') ? p.sunElevDeg : 50.0;
    var sunAzSurDeg = (typeof p.sunAzSurDeg === 'number') ? p.sunAzSurDeg : 0.0;
    var panelAzSurDeg = (typeof p.panelAzSurDeg === 'number') ? p.panelAzSurDeg : 0.0;

    // Coordenadas 2D sección transversal: fila k de (k*P, h) a (k*P + L*cosβ, h + L*sinβ)
    var cosB = Math.cos(beta);
    var sinB = Math.sin(beta);
    var rowIndices = [-2, -1, 0, 1, 2];
    var rows = rowIndices.map(function (k) {
      return {
        k: k,
        x0: k * pitchM,
        z0: h,
        x1: k * pitchM + L * cosB,
        z1: h + L * sinB
      };
    });

    // Sombra proyectada sobre el suelo z = 0 en la sección 2D
    var shadowIntervals = [];
    if (sunElevDeg > 0.5) {
      var elRad = sunElevDeg * DEG2RAD;
      var dAzRad = (sunAzSurDeg - panelAzSurDeg) * DEG2RAD;
      // En sección 2D: frente apunta hacia -x (panelAzSurDeg), atrás hacia +x
      var sx = -Math.cos(elRad) * Math.cos(dAzRad);
      var sz = Math.sin(elRad);
      var slope = sx / Math.max(0.01, sz);
      for (var rIdx = 0; rIdx < rows.length; rIdx++) {
        var rw = rows[rIdx];
        var xSh0 = rw.x0 - rw.z0 * slope;
        var xSh1 = rw.x1 - rw.z1 * slope;
        shadowIntervals.push([Math.min(xSh0, xSh1), Math.max(xSh0, xSh1)]);
      }
    }

    function isGroundShaded(xg) {
      if (sunElevDeg <= 0.5) return true;
      for (var s = 0; s < shadowIntervals.length; s++) {
        if (xg >= shadowIntervals[s][0] && xg <= shadowIntervals[s][1]) return true;
      }
      return false;
    }

    // Factor de vista medio del suelo hacia el cielo (integrado sobre un paso [0, P])
    var nGndSamples = 48;
    var vfGndSkySum = 0;
    var sunlitGndCount = 0;
    for (var g = 0; g < nGndSamples; g++) {
      var xg = (g + 0.5) * (pitchM / nGndSamples);
      if (!isGroundShaded(xg)) sunlitGndCount++;
      // Máximo ángulo de bloqueo izquierdo (hacia -x) y derecho (hacia +x) por las filas
      var angLeft = Math.PI;
      var angRight = 0;
      for (var rk = 0; rk < rows.length; rk++) {
        var row = rows[rk];
        var pts = [[row.x0, row.z0], [row.x1, row.z1]];
        for (var ptIdx = 0; ptIdx < 2; ptIdx++) {
          var dx = pts[ptIdx][0] - xg;
          var dz = pts[ptIdx][1];
          var ang = Math.atan2(dz, dx); // en (0, π)
          if (dx >= 0) {
            if (ang > angRight) angRight = ang;
          } else {
            if (ang < angLeft) angLeft = ang;
          }
        }
      }
      // Para puntos bajo una fila, el propio panel bloquea la banda angular que subtiende
      var blockedSky = 0;
      // Integración angular rápida por 36 rayos en [0, π] desde (xg, 0)
      var nRaysG = 36;
      var skyWeightG = 0;
      for (var rg = 0; rg < nRaysG; rg++) {
        var phiG = ((rg + 0.5) / nRaysG) * Math.PI;
        var dPhiG = Math.PI / nRaysG;
        var rayEndX = xg + 100.0 * Math.cos(phiG);
        var rayEndZ = 100.0 * Math.sin(phiG);
        var hit = false;
        for (var rk2 = 0; rk2 < rows.length; rk2++) {
          var r2 = rows[rk2];
          if (_segmentsIntersect2D(xg, 0.001, rayEndX, rayEndZ, r2.x0, r2.z0, r2.x1, r2.z1)) {
            hit = true;
            break;
          }
        }
        if (!hit) {
          skyWeightG += 0.5 * Math.sin(phiG) * dPhiG;
        }
      }
      vfGndSkySum += Math.max(0, Math.min(1, skyWeightG));
    }
    var vfGroundToSky = vfGndSkySum / nGndSamples;
    var sunlitGroundFraction = sunlitGndCount / nGndSamples;

    // Integración angular desde la cara trasera de la fila 0 (normal φ_n = β - π/2)
    // El hemisferio trasero abarca θ_rel ∈ [-π/2, +π/2] alrededor de la normal φ_n
    var nSeg = 10;
    var nRays = 90;
    var phiNormal = beta - Math.PI * 0.5;
    var vfSkyAcc = 0;
    var vfGndSunAcc = 0;
    var vfGndShdAcc = 0;
    var vfRowAcc = 0;

    for (var seg = 0; seg < nSeg; seg++) {
      var sFrac = (seg + 0.5) / nSeg;
      // Desplazar punto ligeramente hacia la normal trasera (+0.002 m) para evitar auto-intersección numérica
      var rx = sFrac * L * cosB + 0.002 * sinB;
      var rz = h + sFrac * L * sinB - 0.002 * cosB;

      for (var r = 0; r < nRays; r++) {
        var th1 = -Math.PI * 0.5 + (r / nRays) * Math.PI;
        var th2 = -Math.PI * 0.5 + ((r + 1) / nRays) * Math.PI;
        var dVF = 0.5 * (Math.sin(th2) - Math.sin(th1));
        var thMid = 0.5 * (th1 + th2);
        var rayAng = phiNormal + thMid;
        var ux = Math.cos(rayAng);
        var uz = Math.sin(rayAng);

        if (uz >= 0) {
          // Rayo hacia el cielo: comprobar si choca con filas adyacentes (k != 0)
          var rayXEnd = rx + ux * 200.0;
          var rayZEnd = rz + uz * 200.0;
          var hitRow = false;
          for (var rr = 0; rr < rows.length; rr++) {
            if (rows[rr].k === 0) continue;
            if (_segmentsIntersect2D(rx, rz, rayXEnd, rayZEnd, rows[rr].x0, rows[rr].z0, rows[rr].x1, rows[rr].z1)) {
              hitRow = true;
              break;
            }
          }
          if (hitRow) vfRowAcc += dVF;
          else vfSkyAcc += dVF;
        } else {
          // Rayo hacia abajo: calcular intersección con suelo z = 0
          var tGnd = -rz / uz;
          var xgHit = rx + ux * tGnd;
          // Comprobar si una fila adyacente intercepta antes del suelo
          var hitBeforeGnd = false;
          for (var rr2 = 0; rr2 < rows.length; rr2++) {
            if (rows[rr2].k === 0) continue;
            if (_segmentsIntersect2D(rx, rz, xgHit, 0.0, rows[rr2].x0, rows[rr2].z0, rows[rr2].x1, rows[rr2].z1)) {
              hitBeforeGnd = true;
              break;
            }
          }
          if (hitBeforeGnd) {
            vfRowAcc += dVF;
          } else if (isGroundShaded(xgHit)) {
            vfGndShdAcc += dVF;
          } else {
            vfGndSunAcc += dVF;
          }
        }
      }
    }

    var vfRearToSky = vfSkyAcc / nSeg;
    var vfRearToGroundSunlit = vfGndSunAcc / nSeg;
    var vfRearToGroundShaded = vfGndShdAcc / nSeg;
    var vfRearToGround = vfRearToGroundSunlit + vfRearToGroundShaded;
    var vfRearToAdjacentRows = vfRowAcc / nSeg;

    // Irradiancia en suelo soleado vs sombreado
    var sinSunEl = sunElevDeg > 0 ? Math.sin(sunElevDeg * DEG2RAD) : 0;
    var gGndShaded = dhi * vfGroundToSky;
    var gGndSunlit = Math.max(gGndShaded, dni * sinSunEl + gGndShaded);

    var gRearSky = dhi * vfRearToSky;
    var gRearGround = albedo * (gGndSunlit * vfRearToGroundSunlit + gGndShaded * vfRearToGroundShaded);

    // Componente directa trasera si el sol incide por detrás del módulo (cosTheta_front < 0)
    var cosThetaFront = Math.sin(sunElevDeg * DEG2RAD) * cosB +
      Math.cos(sunElevDeg * DEG2RAD) * sinB * Math.cos((sunAzSurDeg - panelAzSurDeg) * DEG2RAD);
    var cosThetaRear = Math.max(0, -cosThetaFront);
    var gRearBeam = (sunElevDeg > 0 && cosThetaRear > 0)
      ? (dni * cosThetaRear * Math.max(0, 1.0 - gcr * 0.5))
      : 0;

    var gRearRaw = gRearSky + gRearGround + gRearBeam;
    var gRear = gRearRaw * (1.0 - fStruct);

    // Irradiancia frontal de referencia si no se pasó explícita
    var gFront = (typeof p.gFront === 'number' && p.gFront >= 0)
      ? p.gFront
      : (Math.max(0, dni * Math.max(0, cosThetaFront)) + dhi * ((1.0 + cosB) * 0.5) + ghi * albedo * ((1.0 - cosB) * 0.5));

    var gEffective = gFront + phi * gRear;
    var bifacialGain = gFront > 1.0 ? ((phi * gRear) / gFront) : 0;

    return {
      tiltDeg: tiltDeg,
      clearanceHeightM: h,
      moduleLengthM: L,
      pitchM: Number(pitchM.toFixed(3)),
      gcr: Number(gcr.toFixed(4)),
      albedo: albedo,
      bifacialityFactor: phi,
      structureShadingFactor: fStruct,
      vfRearToSky: Number(vfRearToSky.toFixed(4)),
      vfRearToGround: Number(vfRearToGround.toFixed(4)),
      vfRearToGroundSunlit: Number(vfRearToGroundSunlit.toFixed(4)),
      vfRearToGroundShaded: Number(vfRearToGroundShaded.toFixed(4)),
      vfRearToAdjacentRows: Number(vfRearToAdjacentRows.toFixed(4)),
      vfGroundToSky: Number(vfGroundToSky.toFixed(4)),
      sunlitGroundFraction: Number(sunlitGroundFraction.toFixed(4)),
      gFront: Number(gFront.toFixed(2)),
      gRearSky: Number(gRearSky.toFixed(2)),
      gRearGround: Number(gRearGround.toFixed(2)),
      gRearBeam: Number(gRearBeam.toFixed(2)),
      gRear: Number(gRear.toFixed(2)),
      gEffective: Number(gEffective.toFixed(2)),
      bifacialGain: Number(bifacialGain.toFixed(4)),
      bifacialGainPct: Number((bifacialGain * 100.0).toFixed(2)),
      iecCurrentFactor: Number((1.0 + bifacialGain).toFixed(4))
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. PÉRDIDAS DESACOPLADAS BANCABLES (SOILING LLUVIA + LID/LeTID + LINEAL)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Calcula las pérdidas mensuales y anuales por ensuciamiento (soiling) en función
   * de la lluvia mensual (modelo Kimber et al. 2006) e inclinación del módulo.
   */
  function computeRainDependentSoiling(params) {
    var p = params || {};
    var zone = p.climateZone || 'interior';
    var defaultRain = MONTHLY_RAIN_CLIMATE_MM[zone] || MONTHLY_RAIN_CLIMATE_MM.interior;
    var monthlyRainMm = (Array.isArray(p.monthlyRainMm) && p.monthlyRainMm.length === 12)
      ? p.monthlyRainMm.map(function (v) { return Math.max(0, Number(v) || 0); })
      : defaultRain.slice();

    var tiltDeg = Math.max(0, Math.min(90, (typeof p.tiltDeg === 'number') ? p.tiltDeg : 20.0));
    var env = p.environment || 'urban';
    var baseRates = { clean: 0.0004, urban: 0.0010, rural: 0.0018, industrial: 0.0015, coastal: 0.0012 };
    var dailyRateBase = (typeof p.dailyAccumulationRate === 'number' && p.dailyAccumulationRate >= 0)
      ? p.dailyAccumulationRate
      : (baseRates[env] || 0.0010);

    // Módulos muy planos (<10°) acumulan ~30% más suciedad que inclinados (≥30°)
    var tiltFactor = 1.0 + 0.30 * Math.cos(tiltDeg * DEG2RAD);
    var dailyRate = dailyRateBase * tiltFactor;

    // Umbral de lluvia limpiadora (mm/evento): menor cuanto más inclinado está el módulo
    var cleanThreshMm = (typeof p.cleaningThresholdMm === 'number')
      ? p.cleaningThresholdMm
      : Math.max(3.0, 6.0 - 0.05 * tiltDeg);

    var maxSoil = Math.max(0.02, Math.min(0.25, (typeof p.maxSoilingLoss === 'number') ? p.maxSoilingLoss : 0.10));
    var residualSoil = 0.002; // 0.2% residuo tras lavado natural
    var manualCleanings = Math.max(0, Math.round(Number(p.manualCleaningsPerYear) || 0));

    // Simulación continua de 2 años (año 1 de calentamiento para estado estacionario cíclico, año 2 reportado)
    var curSoil = residualSoil;
    var monthlySoilingLoss = new Array(12).fill(0);
    var totalCleaningEvents = 0;

    for (var pass = 0; pass < 2; pass++) {
      for (var m = 0; m < 12; m++) {
        var days = DAYS_IN_MONTH[m];
        var rainM = monthlyRainMm[m];
        // Número estimado de eventos significativos de lluvia en el mes (~8 mm por evento típico)
        var estRainEvents = Math.floor(rainM / Math.max(cleanThreshMm * 1.4, 5.0));
        // Añadir limpieza manual si toca en verano (Julio/Agosto) cuando manualCleanings > 0
        var hasManualClean = (manualCleanings >= 1 && m === 6) || (manualCleanings >= 2 && m === 1);
        var eventsThisMonth = Math.min(days, estRainEvents + (hasManualClean ? 1 : 0));

        var monthSoilAcc = 0;
        var spacing = eventsThisMonth > 0 ? Math.floor(days / (eventsThisMonth + 1)) : 999;
        for (var d = 1; d <= days; d++) {
          if (eventsThisMonth > 0 && spacing > 0 && (d % spacing === 0) && (d / spacing <= eventsThisMonth)) {
            curSoil = residualSoil;
            if (pass === 1) totalCleaningEvents++;
          } else {
            curSoil = Math.min(maxSoil, curSoil + dailyRate);
          }
          monthSoilAcc += curSoil;
        }
        if (pass === 1) {
          monthlySoilingLoss[m] = Number((monthSoilAcc / days).toFixed(4));
        }
      }
    }

    var annualDays = 365;
    var weightedSum = 0;
    for (var i = 0; i < 12; i++) {
      weightedSum += monthlySoilingLoss[i] * DAYS_IN_MONTH[i];
    }
    var annualSoilingLoss = Number((weightedSum / annualDays).toFixed(4));

    return {
      climateZone: zone,
      environment: env,
      tiltDeg: tiltDeg,
      cleaningThresholdMm: Number(cleanThreshMm.toFixed(2)),
      monthlyRainMm: monthlyRainMm,
      monthlySoilingLoss: monthlySoilingLoss,
      annualSoilingLoss: annualSoilingLoss,
      cleaningEventsPerYear: totalCleaningEvents
    };
  }

  /**
   * Modela de forma estrictamente desacoplada las pérdidas iniciales Año 1 (LID + LeTID)
   * y la degradación lineal anual posterior (Años 2..N) según tecnología celular.
   */
  function computeLidAndDegradation(params) {
    var p = params || {};
    var techRaw = String(p.technology || 'TOPCON').toUpperCase();
    var tech = 'TOPCON';
    if (techRaw.indexOf('HJT') !== -1 || techRaw.indexOf('HETERO') !== -1) tech = 'HJT';
    else if (techRaw.indexOf('PERC') !== -1 || techRaw.indexOf('P-TYPE') !== -1) tech = 'PERC';

    var presets = {
      PERC:   { lidLoss: 0.015, letidLoss: 0.005, annualLinearDeg: 0.0055 },
      TOPCON: { lidLoss: 0.004, letidLoss: 0.003, annualLinearDeg: 0.0040 },
      HJT:    { lidLoss: 0.002, letidLoss: 0.001, annualLinearDeg: 0.0030 }
    };
    var base = presets[tech];

    var lidLoss = (typeof p.lidLoss === 'number' && p.lidLoss >= 0) ? p.lidLoss : base.lidLoss;
    var letidLoss = (typeof p.letidLoss === 'number' && p.letidLoss >= 0) ? p.letidLoss : base.letidLoss;
    var annualLinearDeg = (typeof p.annualLinearDeg === 'number' && p.annualLinearDeg >= 0) ? p.annualLinearDeg : base.annualLinearDeg;
    var years = Math.max(1, Math.min(40, Math.round(Number(p.years) || 25)));

    var year1StepFactor = (1.0 - lidLoss) * (1.0 - letidLoss);
    var year1CombinedLoss = Number((1.0 - year1StepFactor).toFixed(5));

    function getFactorAtYear(yr) {
      var y = Math.max(1, Number(yr) || 1);
      // Año 1: aplica LID + LeTID (paso inicial no lineal); Años >= 2: degradación lineal acumulada desde Año 1
      var linearFactor = Math.pow(1.0 - annualLinearDeg, Math.max(0, y - 1));
      return Math.max(0.5, year1StepFactor * linearFactor);
    }

    var schedule = [];
    for (var y = 1; y <= years; y++) {
      var linF = Math.pow(1.0 - annualLinearDeg, y - 1);
      var totF = Math.max(0.5, year1StepFactor * linF);
      schedule.push({
        year: y,
        lidLetidFactor: Number(year1StepFactor.toFixed(5)),
        linearAgingFactor: Number(linF.toFixed(5)),
        retainedFactor: Number(totF.toFixed(5)),
        retainedPct: Number((totF * 100.0).toFixed(2))
      });
    }

    return {
      technology: tech,
      lidLoss: lidLoss,
      letidLoss: letidLoss,
      year1CombinedLoss: year1CombinedLoss,
      annualLinearDeg: annualLinearDeg,
      getFactorAtYear: getFactorAtYear,
      schedule: schedule
    };
  }

  /**
   * Árbol bancable completo de pérdidas desacopladas sin doble conteo.
   */
  function computeBankableLossTree(params) {
    var p = params || {};
    var soilingRes = computeRainDependentSoiling(p);
    var degRes = computeLidAndDegradation(p);

    var hasMlpe = Boolean(p.hasMlpe);
    var iamLoss = (typeof p.iamLoss === 'number') ? p.iamLoss : 0.025;
    var spectralLoss = (typeof p.spectralLoss === 'number') ? p.spectralLoss : 0.008;
    var thermalLoss = (typeof p.thermalLoss === 'number') ? p.thermalLoss : 0.072;
    var shadingBypassLoss = (typeof p.shadingBypassLoss === 'number')
      ? p.shadingBypassLoss
      : (hasMlpe ? 0.005 : 0.022);
    var stringMismatchLoss = (typeof p.stringMismatchLoss === 'number')
      ? p.stringMismatchLoss
      : (hasMlpe ? 0.003 : 0.015);
    var dcOhmicLoss = (typeof p.dcOhmicLoss === 'number') ? p.dcOhmicLoss : 0.012;
    var acOhmicLoss = (typeof p.acOhmicLoss === 'number') ? p.acOhmicLoss : 0.006;
    var inverterLoss = (typeof p.inverterLoss === 'number') ? p.inverterLoss : 0.024;
    var clippingLoss = (typeof p.clippingLoss === 'number') ? p.clippingLoss : 0.003;
    var availabilityLoss = (typeof p.availabilityLoss === 'number') ? p.availabilityLoss : 0.005;

    var prOperational = (1 - soilingRes.annualSoilingLoss) *
      (1 - iamLoss) *
      (1 - spectralLoss) *
      (1 - thermalLoss) *
      (1 - shadingBypassLoss) *
      (1 - stringMismatchLoss) *
      (1 - dcOhmicLoss) *
      (1 - acOhmicLoss) *
      (1 - inverterLoss) *
      (1 - clippingLoss) *
      (1 - availabilityLoss);

    var prYear1 = prOperational * (1.0 - degRes.year1CombinedLoss);

    return {
      prOperational: Number(prOperational.toFixed(4)),
      prYear1: Number(prYear1.toFixed(4)),
      soiling: soilingRes,
      degradation: degRes,
      breakdown: {
        soilingAnnual: soilingRes.annualSoilingLoss,
        iam: iamLoss,
        spectral: spectralLoss,
        thermal: thermalLoss,
        shadingBypass: shadingBypassLoss,
        stringMismatch: stringMismatchLoss,
        lidYear1: degRes.lidLoss,
        letidYear1: degRes.letidLoss,
        annualLinearDeg: degRes.annualLinearDeg,
        dcOhmic: dcOhmicLoss,
        acOhmic: acOhmicLoss,
        inverterEff: inverterLoss,
        clipping: clippingLoss,
        availability: availabilityLoss
      }
    };
  }

  var RAPVAdvanced = {
    extractDeSotoParameters: extractDeSotoParameters,
    translateDeSotoParams: translateDeSotoParams,
    solveSubstringVoltageAtCurrent: solveSubstringVoltageAtCurrent,
    computeModuleIVCurve: computeModuleIVCurve,
    computeStringComparison: computeStringComparison,
    computeBifacialViewFactors: computeBifacialViewFactors,
    computeRainDependentSoiling: computeRainDependentSoiling,
    computeLidAndDegradation: computeLidAndDegradation,
    computeBankableLossTree: computeBankableLossTree,
    MONTHLY_RAIN_CLIMATE_MM: MONTHLY_RAIN_CLIMATE_MM
  };

  if (!root.RA) root.RA = {};
  root.RA.PVAdvanced = RAPVAdvanced;
  root.RAPVAdvanced = RAPVAdvanced;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = RAPVAdvanced;
  }

})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : global));
