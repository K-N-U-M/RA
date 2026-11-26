/**
 * ============================================================================
 * 📊 RA · MOTOR FINANCIERO PURO (SIN DOM) — SSOT
 * ============================================================================
 * Archivo: js/financial-model.js
 * Rol: Funciones puras de cálculo financiero y energético bancable a 25 años
 *      (CAPEX, OPEX, despacho 12×24h, escudo fiscal, VAN, TIR, LCOE, payback,
 *      financiación bancaria TAE, paquetes comerciales y métricas CEL).
 *      Sin dependencias de DOM ni efectos secundarios sobre document/window UI.
 * ============================================================================
 */
(function (root) {
  'use strict';

  var TOU_PROFILES = {
    plana:       { name: 'Tarifa Plana',        horas: new Array(24).fill(0.18), compensacion: 0.09 },
    '2periodos': { name: '2 Periodos D/N',      horas: new Array(24).fill(0.13).map(function (v, i) { return (i >= 8 && i < 23) ? 0.22 : v; }), compensacion: 0.09 },
    '3periodos': { name: '3 Periodos PVPC',     horas: [0.10,0.10,0.10,0.10,0.10,0.10,0.11,0.12,0.17,0.19,0.22,0.26,0.27,0.26,0.24,0.23,0.25,0.28,0.30,0.27,0.22,0.17,0.13,0.11], compensacion: 0.07 },
    mercado:     { name: 'Precio Mercado 2024', horas: [0.085,0.077,0.072,0.068,0.070,0.078,0.095,0.115,0.128,0.135,0.142,0.155,0.162,0.158,0.148,0.139,0.151,0.172,0.196,0.214,0.238,0.247,0.231,0.205], compensacion: 0.05 }
  };

  var MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  var DEFAULT_SOLAR_PROFILE = [0.00,0.00,0.00,0.00,0.00,0.00,0.02,0.05,0.08,0.10,0.11,0.11,0.10,0.09,0.08,0.06,0.04,0.02,0.00,0.00,0.00,0.00,0.00,0.00];

  function calcNPV(cashflow, rate) {
    if (!Array.isArray(cashflow) || cashflow.length === 0) return 0;
    var npv = Number(cashflow[0]) || 0;
    for (var t = 1; t < cashflow.length; t++) {
      npv += (Number(cashflow[t]) || 0) / Math.pow(1 + rate, t);
    }
    return npv;
  }

  function calcIRR(cashflow) {
    var low = -0.1;
    var high = 1.0;
    var tir = null;
    var tirString = 'N/D';
    var npvLow = calcNPV(cashflow, low);
    var npvHigh = calcNPV(cashflow, high);

    if (isFinite(npvLow) && isFinite(npvHigh)) {
      if (npvHigh > 0) {
        high = 5.0;
        npvHigh = calcNPV(cashflow, high);
        if (npvHigh > 0) {
          tir = 5.0;
          tirString = '> 500 %';
        }
      }
      if (tir === null) {
        if (npvLow * npvHigh < 0) {
          for (var iter = 0; iter < 45; iter++) {
            var mid = (low + high) / 2;
            var vMid = calcNPV(cashflow, mid);
            if (Math.abs(vMid) < 1) { tir = mid; break; }
            if (vMid > 0) low = mid; else high = mid;
            tir = mid;
          }
          if (tir != null && isFinite(tir)) {
            tirString = (tir * 100).toFixed(1) + ' %';
          }
        } else if (npvLow < 0 && npvHigh < 0) {
          tir = null;
          tirString = 'No rentable';
        }
      }
    }
    return { tir: tir, tirString: tirString };
  }

  function calcPayback(acumulado) {
    var paybackYears = 25;
    if (!Array.isArray(acumulado) || acumulado.length < 2) return paybackYears;
    for (var y = 1; y < acumulado.length; y++) {
      if (acumulado[y] >= 0) {
        var prev = acumulado[y - 1];
        var diff = acumulado[y] - prev;
        paybackYears = diff > 0 ? (y - 1) + (-prev / diff) : y;
        break;
      }
    }
    return paybackYears;
  }

  function calcFinancedPayback(acumuladoFinanciado) {
    if (!Array.isArray(acumuladoFinanciado) || acumuladoFinanciado.length < 2) return null;
    var dippedBelowZero = false;
    for (var y = 1; y < acumuladoFinanciado.length; y++) {
      if (acumuladoFinanciado[y] < 0) {
        dippedBelowZero = true;
        break;
      }
    }
    if (dippedBelowZero) {
      var wasNegative = false;
      for (var y2 = 1; y2 < acumuladoFinanciado.length; y2++) {
        if (acumuladoFinanciado[y2] < 0) {
          wasNegative = true;
        } else if (wasNegative && acumuladoFinanciado[y2] >= 0) {
          var prev = acumuladoFinanciado[y2 - 1];
          var diff = acumuladoFinanciado[y2] - prev;
          return diff > 0 ? (y2 - 1) + (-prev / diff) : y2;
        }
      }
      return null;
    }
    if (acumuladoFinanciado[0] < 0) {
      for (var y3 = 1; y3 < acumuladoFinanciado.length; y3++) {
        if (acumuladoFinanciado[y3] >= 0) {
          var prev3 = acumuladoFinanciado[y3 - 1];
          var diff3 = acumuladoFinanciado[y3] - prev3;
          return diff3 > 0 ? (y3 - 1) + (-prev3 / diff3) : y3;
        }
      }
      return null;
    }
    return 0;
  }

  function computeWindTurbineCostBreakdown(turbines, deps) {
    deps = deps || {};
    var list = Array.isArray(turbines) ? turbines.filter(function (t) {
      return t && (!t.operationalState || t.operationalState.enabled !== false);
    }) : [];

    if (list.length === 0) {
      return {
        turbineCount: 0,
        totalKw: 0,
        turbineEquipmentEur: 0,
        mastStructureEur: 0,
        foundationCivilEur: 0,
        inverterPowerElecEur: 0,
        electricalInstallEur: 0,
        engineeringCommissioningEur: 0,
        totalEur: 0,
        concreteVolumeTotalM3: 0,
        avgHubHeightM: 0
      };
    }

    var getById = typeof deps.getCatalogById === 'function' ? deps.getCatalogById : null;
    var evalStruct = typeof deps.evaluateStructuralSafety === 'function' ? deps.evaluateStructuralSafety : null;

    var totalKw = 0;
    var sumTurbineEq = 0;
    var sumMast = 0;
    var sumFoundation = 0;
    var sumElecInverter = 0;
    var sumElectricalInstall = 0;
    var sumEngCommissioning = 0;
    var sumConcreteM3 = 0;
    var sumHeights = 0;

    list.forEach(function (t) {
      var freshCat = (getById && t.catalogId) ? getById(t.catalogId) : null;
      var c = Object.assign({}, t._catalog || {}, freshCat || {});
      var pKw = c.ratedPowerW ? (c.ratedPowerW / 1000) : (t.ratedPowerKw || 5.0);
      var hubH = (t.supportStructure && t.supportStructure.hubHeightM) || 18;
      var mount = t.mountingType || 'ground';
      totalKw += pKw;
      sumHeights += hubH;

      var costTurbine = (typeof c.priceEur === 'number' && c.priceEur > 0) ? c.priceEur : Math.round(pKw * 1450);
      sumTurbineEq += costTurbine;

      var mastCost = Math.max(1800, Math.min(6500, Math.round(1600 + (hubH * 115) + (pKw * 45))));
      sumMast += mastCost;

      var concreteM3 = 0;
      if (evalStruct) {
        try {
          var sRep = evalStruct(t);
          if (sRep && sRep.foundation && typeof sRep.foundation.concreteVolumeM3 === 'number') {
            concreteM3 = sRep.foundation.concreteVolumeM3;
          }
        } catch (eStr) {
          if (typeof console !== 'undefined' && typeof console.debug === 'function') {
            console.debug('[RAFinancialModel.windBreakdown]', eStr);
          }
        }
      }
      if (!concreteM3) {
        concreteM3 = Math.round(Math.max(1.8, Math.pow(hubH / 5.5, 1.35) * (pKw / 5)) * 10) / 10;
      }
      sumConcreteM3 += concreteM3;

      var foundationCost = (mount === 'rooftop')
        ? Math.max(1500, Math.min(3200, Math.round(1500 + (pKw * 120))))
        : Math.max(1500, Math.min(4500, Math.round(1200 + (concreteM3 * 250))));
      sumFoundation += foundationCost;

      var invElecCost = Math.max(1500, Math.min(3800, Math.round(1350 + (pKw * 135))));
      sumElecInverter += invElecCost;

      var elecInstallCost = Math.max(1000, Math.min(2500, Math.round(950 + (hubH * 22) + (pKw * 40))));
      sumElectricalInstall += elecInstallCost;

      var engMontageCost = Math.max(2000, Math.min(4800, Math.round(1800 + (hubH * 65) + (pKw * 60))));
      sumEngCommissioning += engMontageCost;
    });

    var totalAll = sumTurbineEq + sumMast + sumFoundation + sumElecInverter + sumElectricalInstall + sumEngCommissioning;

    return {
      turbineCount: list.length,
      totalKw: Math.round(totalKw * 10) / 10,
      turbineEquipmentEur: sumTurbineEq,
      mastStructureEur: sumMast,
      foundationCivilEur: sumFoundation,
      inverterPowerElecEur: sumElecInverter,
      electricalInstallEur: sumElectricalInstall,
      engineeringCommissioningEur: sumEngCommissioning,
      totalEur: totalAll,
      concreteVolumeTotalM3: Math.round(sumConcreteM3 * 10) / 10,
      avgHubHeightM: list.length > 0 ? Math.round(sumHeights / list.length) : 0
    };
  }

  function computeThreePackages(m) {
    if (!m) return null;
    var baseDirect = m.directCost || 10000;
    var mgPct = (typeof m.marginPct === 'number') ? m.marginPct : 20;
    var ivaRate = (typeof m.ivaRate === 'number') ? m.ivaRate : 0.21;

    var p1Direct = Math.round(baseDirect - (m.batCost || 0));
    var p1Subtotal = Math.round(p1Direct * (1 + mgPct / 100));
    var p1Capex = Math.round(p1Subtotal * (1 + ivaRate));
    var p1Ahorro = Math.round((m.ahorroLuzAnio1 || 1200) * (m.batCost > 0 ? 0.65 : 1.0));

    var p2Capex = Math.round(m.capexBruto);
    var p2Ahorro = Math.round(m.ahorroLuzAnio1);

    var batExtra = (m.batCost > 0) ? 2200 : 3800;
    var p3Direct = baseDirect + batExtra;
    var p3Subtotal = Math.round(p3Direct * (1 + mgPct / 100));
    var p3Capex = Math.round(p3Subtotal * (1 + ivaRate));
    var p3Ahorro = Math.round(p2Ahorro * 1.25);

    var p2PaybackNum = (typeof m.paybackYears === 'number' && isFinite(m.paybackYears) && m.paybackYears > 0) ? m.paybackYears : 4.5;
    var simpleRatioP2 = (p2Ahorro > 0 && p2Capex > 0) ? (p2Capex / p2Ahorro) : 6.0;
    var dynamicFactor = (simpleRatioP2 > 0) ? Math.min(1.0, p2PaybackNum / simpleRatioP2) : 0.75;
    var p1PaybackVal = Math.max(1.8, (p1Ahorro > 0 ? (p1Capex / p1Ahorro) * dynamicFactor : 4.0));
    var p3PaybackVal = Math.max(2.5, (p3Ahorro > 0 ? (p3Capex / p3Ahorro) * dynamicFactor : 5.0));

    return {
      essential: {
        title: 'Plan Esencial (Ahorro Diurno)',
        capex: p1Capex,
        ahorroAnual: p1Ahorro,
        payback: p1PaybackVal.toFixed(1),
        autarquia: Math.round(Math.min(50, m.autarquiaPct || 45)),
        desc: 'Autoconsumo solar directo sin almacenamiento para máxima economía.'
      },
      optimal: {
        title: 'Plan Óptimo (Tu Diseño 3D)',
        capex: p2Capex,
        ahorroAnual: p2Ahorro,
        payback: p2PaybackNum.toFixed(1),
        autarquia: m.autarquiaPct || 70,
        desc: 'Equilibrio perfecto entre inversión, independencia y retorno garantizado.'
      },
      premium: {
        title: 'Plan Independencia Total',
        capex: p3Capex,
        ahorroAnual: p3Ahorro,
        payback: p3PaybackVal.toFixed(1),
        autarquia: Math.min(92, Math.max(82, (m.autarquiaPct || 70) + 18)),
        desc: 'Máxima acumulación LFP para no depender de la red eléctrica día y noche.'
      }
    };
  }

  function calculateCELMetrics(d, m, customCelPrice, opts) {
    d = d || {};
    m = m || {};
    opts = opts || {};
    var genKWh = Math.round(m.annualYieldKWh || (d && d.annualKWh) || 0);
    var autoKWh = Math.round(m.autoconsumoDirecto || (genKWh * (m.autarquiaPct || 65) / 100));
    var batKWh = Math.round(m.bateriaKWh || 0);
    var excKWh = Math.round(m.excedenteKWh != null ? m.excedenteKWh : Math.max(0, genKWh - autoKWh - batKWh));
    if (excKWh <= 0 && genKWh > 0) {
      excKWh = Math.round(genKWh * 0.35);
    }

    var precioPool = (m && typeof m.precioCompensacionEUR === 'number' && m.precioCompensacionEUR > 0)
      ? m.precioCompensacionEUR
      : 0.05;
    var precioCEL = (typeof customCelPrice === 'number' && customCelPrice > 0) ? customCelPrice : 0.11;

    var ingresoPoolAnual = Math.round(excKWh * precioPool);
    var ingresoCELAnual = Math.round(excKWh * precioCEL);
    var beneficioExtraCEL = Math.max(0, ingresoCELAnual - ingresoPoolAnual);
    var ahorroTotalConCEL = Math.round((m.ahorroLuzAnio1 || 0) + beneficioExtraCEL);

    var paybackTradicional = 25;
    if (m && Array.isArray(m.cashflowAcumSinCEL) && m.cashflowAcumSinCEL.length > 1) {
      paybackTradicional = calcPayback(m.cashflowAcumSinCEL);
    } else if (m.paybackYears && isFinite(m.paybackYears) && m.paybackYears > 0) {
      paybackTradicional = m.paybackYears;
    } else {
      paybackTradicional = 6.5;
    }

    var paybackCEL = 25;
    if (m && Array.isArray(m.cashflowAcum) && m.cashflowAcum.length > 1) {
      paybackCEL = calcPayback(m.cashflowAcum);
    }
    if (!paybackCEL || paybackCEL >= 25) {
      var capexNeto = (m.capexNeto && isFinite(m.capexNeto) && m.capexNeto > 0) ? m.capexNeto : (m.capexBruto || 6000);
      paybackCEL = (capexNeto > 0 && ahorroTotalConCEL > 0)
        ? Math.round((capexNeto / ahorroTotalConCEL) * 10) / 10
        : Math.round(paybackTradicional * 0.72 * 10) / 10;
    } else {
      paybackCEL = Math.round(paybackCEL * 10) / 10;
    }
    paybackTradicional = Math.round(paybackTradicional * 10) / 10;

    var reduccionPaybackAnios = Math.max(0.2, Math.round((paybackTradicional - paybackCEL) * 10) / 10);
    var familiasBeneficiadas = Math.max(1, Math.round((excKWh / 1800) * 10) / 10);
    var co2Factor = (typeof opts.co2Factor === 'number' && opts.co2Factor > 0) ? opts.co2Factor : 0.259;
    var co2EvitadoKg = Math.round(excKWh * co2Factor);

    var autoPct = genKWh > 0 ? Math.round((autoKWh / genKWh) * 100) : 55;
    var batPct = (genKWh > 0 && batKWh > 0) ? Math.round((batKWh / genKWh) * 100) : 0;
    var excPct = Math.max(0, 100 - autoPct - batPct);

    return {
      genKWh: genKWh,
      autoKWh: autoKWh,
      batKWh: batKWh,
      excKWh: excKWh,
      autoPct: autoPct,
      batPct: batPct,
      excPct: excPct,
      precioPool: precioPool,
      precioCEL: precioCEL,
      ingresoPoolAnual: ingresoPoolAnual,
      ingresoCELAnual: ingresoCELAnual,
      beneficioExtraCEL: beneficioExtraCEL,
      ahorroTotalConCEL: ahorroTotalConCEL,
      paybackTradicional: paybackTradicional,
      paybackCEL: paybackCEL,
      reduccionPaybackAnios: reduccionPaybackAnios,
      familiasBeneficiadas: familiasBeneficiadas,
      co2EvitadoKg: co2EvitadoKg,
      distanciaMaxKm: 5,
      distanciaMaxMetros: 5000,
      areaKm2: 78.5,
      normativa: 'Real Decreto-ley 7/2026',
      normativaCompleta: 'Real Decreto-ley 7/2026 (amplía el radio de autoconsumo colectivo a 5 km)',
      ordenTED: 'Orden TED/1247/2021 (Coeficientes horarios dinámicos βh)'
    };
  }

  function computeFinancialModelFromParams(p) {
    p = p || {};
    var numPanels = p.numPanels || 0;
    var kwp = p.kwp || 0;
    var annualYieldKWh = p.annualYieldKWh || 0;
    var panCost = p.panCost || 0;
    var est = p.est || 0;
    var inv = p.inv || 0;
    var bat = p.bat || 0;
    var cab = p.cab || 0;
    var mo = p.mo || 0;
    var leg = p.leg || 0;
    var windCost = p.windCost || 0;
    var mlpeCost = p.mlpeCost || 0;
    var unitPanelPrice = p.unitPanelPrice || 125;

    var directCost = Math.round(panCost + est + inv + bat + cab + mo + leg + windCost);
    var marginPct = (typeof p.marginPct === 'number') ? p.marginPct : 20;
    var marginEur = directCost * (marginPct / 100.0);
    var addonsCost = p.addonsCost || 0;
    var subtotalPreDiscount = directCost + marginEur + addonsCost;

    var commercialCfg = p.commercialCfg || null;
    var discountEur = 0;
    var discountLabel = (commercialCfg && commercialCfg.discountLabel) || 'Descuento Comercial Especial';
    if (commercialCfg && commercialCfg.discountEnabled) {
      if (commercialCfg.discountType === 'percent') {
        discountEur = subtotalPreDiscount * (Math.max(0, Number(commercialCfg.discountValue) || 0) / 100.0);
      } else {
        discountEur = Math.max(0, Number(commercialCfg.discountValue) || 0);
      }
    }

    var commTax = (commercialCfg && commercialCfg.taxShield) ? commercialCfg.taxShield : {};
    var ivaOptRaw = p.ivaOptRaw || '';
    var ivaRate = p.ivaRate;
    if (!Number.isFinite(ivaRate)) ivaRate = 0.21;

    var subtotal = Math.max(100, Math.round(subtotalPreDiscount - discountEur));
    var iva = Math.round(subtotal * ivaRate);
    var capexBruto = subtotal + iva;
    var capexTachado = (discountEur > 0) ? Math.round(subtotalPreDiscount * (1 + ivaRate)) : null;

    var isOffGrid = Boolean(p.isOffGrid);
    var soilType = p.soilType || 'urbano';
    var customerProfile = p.customerProfile || 'particular';

    var isRehab10 = (ivaOptRaw === '0.10_rehab');
    var isRenovacion10 = (Math.abs(ivaRate - 0.10) < 0.001 && !isRehab10);
    var homeAge2Years = Boolean(p.homeAge2Years);
    var marginOnLaborOnly = Boolean(p.marginOnLaborOnly);

    var costeMaterialesDirecto = Math.round(panCost + est + inv + bat + cab + windCost + addonsCost);
    var costeServiciosDirecto = Math.round(mo + leg);
    var discScale = (subtotalPreDiscount > 0) ? (subtotal / subtotalPreDiscount) : 1;

    var baseMateriales = 0;
    if (marginOnLaborOnly) {
      baseMateriales = Math.min(subtotal, Math.max(0, Math.round(costeMaterialesDirecto * discScale)));
    } else {
      var totalDirectWithAddons = Math.max(1, costeMaterialesDirecto + costeServiciosDirecto);
      baseMateriales = Math.min(subtotal, Math.max(0, Math.round(subtotal * (costeMaterialesDirecto / totalDirectWithAddons))));
    }
    var baseServicios = Math.max(0, subtotal - baseMateriales);
    var pctMateriales = subtotal > 0 ? (baseMateriales / subtotal) * 100 : 0;
    var maxMateriales40Eur = Math.floor(subtotal * 0.40);
    var excesoMaterialesEur = Math.max(0, baseMateriales - maxMateriales40Eur);

    var ivaReasons = [];
    if (isRenovacion10) {
      if (customerProfile !== 'particular') {
        ivaReasons.push('Cliente figura como Empresa/Pyme (se exige Persona Física uso particular)');
      }
      if (!homeAge2Years) {
        ivaReasons.push('Vivienda con menos de 2 años desde construcción o rehabilitación');
      }
      if (pctMateriales > 40.001) {
        ivaReasons.push('Materiales aportados (' + pctMateriales.toFixed(1) + '%) superan el 40% de la Base Imponible (+' + excesoMaterialesEur.toLocaleString('es-ES') + ' € sobre tope de ' + maxMateriales40Eur.toLocaleString('es-ES') + ' €)');
      }
    }

    var ivaCompliance = {
      ivaOpt: ivaOptRaw || String(ivaRate),
      ivaRate: ivaRate,
      isRenovacion10: isRenovacion10,
      isRehab10: isRehab10,
      homeAge2Years: homeAge2Years,
      marginOnLaborOnly: marginOnLaborOnly,
      costeMaterialesDirecto: costeMaterialesDirecto,
      costeServiciosDirecto: costeServiciosDirecto,
      baseMateriales: baseMateriales,
      baseServicios: baseServicios,
      pctMateriales: pctMateriales,
      maxMateriales40Eur: maxMateriales40Eur,
      excesoMaterialesEur: excesoMaterialesEur,
      isCompliant: isRenovacion10 ? (ivaReasons.length === 0) : true,
      reasons: ivaReasons
    };

    var ibiCuota = (p.ibiCuota != null) ? p.ibiCuota : 650;
    var ibiOpt = p.ibiOpt || '0.50_3';
    var ahorroIBITotal = 0;
    var ibiFormulaStr = '';
    if (soilType === 'rustico') {
      ahorroIBITotal = 0;
      ibiFormulaStr = 'IBI: 0 € (Finca rústica / Suelo no urbano sin bonificación municipal)';
    } else if (commTax.ibiEnabled === false || ibiOpt === '0') {
      ahorroIBITotal = 0;
      ibiFormulaStr = 'IBI: 0% sin bonificación municipal';
    } else if (ibiOpt === '0.50_3') {
      ahorroIBITotal = Math.round(ibiCuota * 0.50 * 3);
      ibiFormulaStr = 'IBI: ' + ibiCuota + ' €/año × 50% × 3 años = ' + ahorroIBITotal + ' €';
    } else if (ibiOpt === '0.50_5') {
      ahorroIBITotal = Math.round(ibiCuota * 0.50 * 5);
      ibiFormulaStr = 'IBI: ' + ibiCuota + ' €/año × 50% × 5 años = ' + ahorroIBITotal + ' €';
    } else if (ibiOpt === '0.50_10') {
      ahorroIBITotal = Math.round(ibiCuota * 0.50 * 10);
      ibiFormulaStr = 'IBI: ' + ibiCuota + ' €/año × 50% × 10 años (TRLRHL) = ' + ahorroIBITotal + ' €';
    } else if (ibiOpt === '0.30_3') {
      ahorroIBITotal = Math.round(ibiCuota * 0.30 * 3);
      ibiFormulaStr = 'IBI: ' + ibiCuota + ' €/año × 30% × 3 años = ' + ahorroIBITotal + ' €';
    } else if (ibiOpt === '0.25_5') {
      ahorroIBITotal = Math.round(ibiCuota * 0.25 * 5);
      ibiFormulaStr = 'IBI: ' + ibiCuota + ' €/año × 25% × 5 años = ' + ahorroIBITotal + ' €';
    } else if (commTax.ibiBonifPct && commTax.ibiYears) {
      ahorroIBITotal = Math.round(ibiCuota * (commTax.ibiBonifPct / 100.0) * commTax.ibiYears);
      ibiFormulaStr = 'IBI: ' + ibiCuota + ' €/año × ' + commTax.ibiBonifPct + '% × ' + commTax.ibiYears + ' años = ' + ahorroIBITotal + ' €';
    }

    var irpfOptVal = p.irpfOptVal || '';
    var irpfPct = Number.isFinite(p.irpfPct) ? p.irpfPct : 0;
    var maxBaseIrpf = 5000;
    if (irpfOptVal === '0.60' || (!irpfOptVal && irpfPct >= 0.50)) maxBaseIrpf = 15000;
    else if (irpfOptVal === '0.40' || (!irpfOptVal && irpfPct >= 0.30)) maxBaseIrpf = 7500;
    if (!irpfOptVal && commTax.irpfMaxBaseEur && commTax.irpfMaxBaseEur > 0) maxBaseIrpf = commTax.irpfMaxBaseEur;

    var baseIrpfEstatal = Math.min(capexBruto, maxBaseIrpf);
    var ahorroIRPFEstatal = (commTax.irpfEnabled === false || customerProfile === 'empresa') ? 0 : Math.round(baseIrpfEstatal * irpfPct);

    var regionOpt = p.regionOpt || 'estatal_only';
    var ahorroIRPFAutonomico = 0;
    var autoFormulaStr = '';
    if (customerProfile === 'particular' && regionOpt !== 'estatal_only') {
      if (regionOpt === 'valencia') {
        var bVal = Math.min(capexBruto, 8000);
        ahorroIRPFAutonomico = Math.round(bVal * 0.40);
        autoFormulaStr = 'IRPF Comunitat Valenciana: 40% s/ base máx. ' + bVal.toLocaleString('es-ES') + ' € = ' + ahorroIRPFAutonomico + ' €';
      } else if (regionOpt === 'galicia') {
        var bGal = Math.min(capexBruto, 9000);
        ahorroIRPFAutonomico = Math.round(bGal * 0.20);
        autoFormulaStr = 'IRPF Galicia: 20% s/ base máx. ' + bGal.toLocaleString('es-ES') + ' € = ' + ahorroIRPFAutonomico + ' €';
      } else if (regionOpt === 'baleares') {
        var bBal = Math.min(capexBruto, 10000);
        ahorroIRPFAutonomico = Math.round(bBal * 0.50);
        autoFormulaStr = 'IRPF Illes Balears: 50% s/ base máx. ' + bBal.toLocaleString('es-ES') + ' € = ' + ahorroIRPFAutonomico + ' €';
      } else if (regionOpt === 'murcia') {
        var bMur = Math.min(capexBruto, 10000);
        ahorroIRPFAutonomico = Math.min(Math.round(bMur * 0.10), 1000);
        autoFormulaStr = 'IRPF Región de Murcia: 10% (tope 1.000 €) = ' + ahorroIRPFAutonomico + ' €';
      } else if (regionOpt === 'castillaleon') {
        var bCyl = Math.min(capexBruto, 10000);
        ahorroIRPFAutonomico = Math.min(Math.round(bCyl * 0.15), 2000);
        autoFormulaStr = 'IRPF Castilla y León: 15% (tope 2.000 €) = ' + ahorroIRPFAutonomico + ' €';
      }
    }
    var ahorroIRPF = ahorroIRPFEstatal + ahorroIRPFAutonomico;

    var isRate = Number.isFinite(p.isRate) ? p.isRate : (customerProfile === 'empresa' ? 0.25 : 0);
    var ahorroSociedades = 0;
    var isFormulaStr = '';
    if (customerProfile === 'empresa' && isRate > 0) {
      ahorroSociedades = Math.round(subtotal * isRate);
      isFormulaStr = 'Sociedades (LIS DA 17ª): Subtotal ' + subtotal.toLocaleString('es-ES') + ' € × ' + Math.round(isRate * 100) + '% = ' + ahorroSociedades + ' €';
    }

    var icioPct = (p.icioPct != null) ? p.icioPct : 0.95;
    var tasaICIO = (p.designCosts && p.designCosts.icioTaxEur > 0) ? p.designCosts.icioTaxEur : Math.round(directCost * 0.035);
    var ahorroICIO = Math.round(tasaICIO * icioPct);
    var icioFormulaStr = 'ICIO: Tasa estimada ' + tasaICIO + ' € × ' + Math.round(icioPct * 100) + '% bonif. = ' + ahorroICIO + ' €';
    var ahorroCAE = p.ahorroCAE || 0;

    var ahorroDeduccionDirecta = (customerProfile === 'empresa') ? ahorroSociedades : ahorroIRPF;
    var totalAhorroFiscal = ahorroIBITotal + ahorroDeduccionDirecta + ahorroCAE;
    var capexNeto = Math.max(capexBruto - totalAhorroFiscal, 100);

    var taxFormulaLines = [];
    if (isRenovacion10) {
      taxFormulaLines.push('IVA Reducido 10% (Art. 91.Uno.2.10º LIVA): Materiales = ' + baseMateriales.toLocaleString('es-ES') + ' € (' + pctMateriales.toFixed(1) + '% s/ B.I. ' + subtotal.toLocaleString('es-ES') + ' € · Tope legal ≤40%: ' + maxMateriales40Eur.toLocaleString('es-ES') + ' €) → ' + (ivaCompliance.isCompliant ? 'CUMPLE' : 'EXCEDE TOPE / REVISAR'));
    } else if (isRehab10) {
      taxFormulaLines.push('IVA Reducido 10% (Rehabilitación Estructural / Obra Nueva Promotor): Sin tope del 40% en materiales (' + pctMateriales.toFixed(1) + '% s/ B.I.)');
    }
    if (customerProfile === 'particular') {
      if (irpfPct > 0) {
        taxFormulaLines.push('IRPF Estatal (RD-ley 19/2021): ' + Math.round(irpfPct * 100) + '% s/ base máx. ' + baseIrpfEstatal.toLocaleString('es-ES') + ' € = ' + ahorroIRPFEstatal.toLocaleString('es-ES') + ' €');
        if (isOffGrid) taxFormulaLines.push('Aviso Aislada: Deducción IRPF condicionada a CEE previo o sustitución de grupo electrógeno');
      } else {
        taxFormulaLines.push('IRPF Estatal: 0 € (Sin certificado CEE seleccionado)');
      }
      if (autoFormulaStr) taxFormulaLines.push(autoFormulaStr);
    } else {
      taxFormulaLines.push(isFormulaStr || 'Sociedades: Sin libertad de amortización');
    }
    if (ibiFormulaStr) taxFormulaLines.push(ibiFormulaStr);
    if (ahorroCAE > 0) taxFormulaLines.push('Ayudas / CAEs: Subvención directa asignada = ' + ahorroCAE.toLocaleString('es-ES') + ' €');
    taxFormulaLines.push(icioFormulaStr);

    var batCap = p.batCap || 0;
    var batCapCount = p.batCapCount || 1;
    var tou = TOU_PROFILES[p.touTarifa] || TOU_PROFILES.plana;
    var batStrategy = p.batStrategy || 'autoconsumo';
    var hdRef = p.hdRef || null;

    var rawLoadProfile = (hdRef && hdRef.LOAD_PROFILES)
      ? ((customerProfile === 'empresa') ? hdRef.LOAD_PROFILES.commercial_industrial : hdRef.LOAD_PROFILES.residential)
      : ((customerProfile === 'empresa')
        ? [0.015,0.014,0.014,0.014,0.015,0.018,0.028,0.052,0.078,0.088,0.088,0.086,0.082,0.072,0.068,0.072,0.070,0.064,0.052,0.038,0.028,0.022,0.018,0.016]
        : [0.030,0.025,0.022,0.020,0.020,0.028,0.040,0.050,0.045,0.035,0.032,0.035,0.038,0.032,0.030,0.038,0.050,0.065,0.070,0.062,0.052,0.048,0.042,0.036]);
    var sumRawLoad = rawLoadProfile.reduce(function (a, b) { return a + b; }, 0) || 1;
    var LOAD_PROFILE = rawLoadProfile.map(function (v) { return v / sumRawLoad; });

    var consumoAnual = p.consumoAnual || 0;
    var monthlyConsKwh = p.monthlyConsKwh;
    var monthlyConsSource = p.monthlyConsSource || 'seasonal_weights';
    var monthlySolarKwh = p.monthlySolarKwh;
    var monthlyWindKwh = p.monthlyWindKwh;

    var rawDiurnalWind = (hdRef && Array.isArray(hdRef.DIURNAL_WIND_FACTORS) && hdRef.DIURNAL_WIND_FACTORS.length === 24)
      ? hdRef.DIURNAL_WIND_FACTORS
      : [1.18,1.20,1.22,1.20,1.15,1.10,1.00,0.92,0.85,0.82,0.84,0.88,0.95,1.02,1.08,1.12,1.15,1.14,1.12,1.10,1.11,1.14,1.16,1.17];
    var sumDiurnalWind = rawDiurnalWind.reduce(function (a, b) { return a + b; }, 0) || 24;
    var WIND_HOURLY_PROFILE = rawDiurnalWind.map(function (v) { return v / sumDiurnalWind; });

    var siteLat = (typeof p.siteLat === 'number' && !isNaN(p.siteLat)) ? p.siteLat : 40.4;
    function getMonthlySolarProfile(m) {
      if (hdRef && typeof hdRef.getMonthlySolarShape24h === 'function') {
        return hdRef.getMonthlySolarShape24h(m, siteLat);
      }
      var latRad = siteLat * Math.PI / 180;
      var midDoy = [15, 45, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349][m] || 180;
      var declRad = (23.44 * Math.PI / 180) * Math.sin((2 * Math.PI / 365) * (midDoy - 81));
      var cosWs = Math.max(-0.96, Math.min(0.96, -Math.tan(latRad) * Math.tan(declRad)));
      var halfDayLen = (Math.acos(cosWs) * 180 / Math.PI) / 15.0;
      var isDST = (m >= 3 && m <= 9);
      var solarNoonClock = isDST ? 14.15 : 13.25;
      var sunrise = solarNoonClock - halfDayLen;
      var sunset = solarNoonClock + halfDayLen;
      var span = Math.max(sunset - sunrise, 2.0);
      var profile = new Array(24).fill(0);
      var sum = 0;
      for (var h = 0; h < 24; h++) {
        if (h + 0.5 > sunrise && h + 0.5 < sunset) {
          var val = Math.sin(Math.PI * (h + 0.5 - sunrise) / span);
          if (val > 0) {
            profile[h] = Math.pow(val, 1.2);
            sum += profile[h];
          }
        }
      }
      return sum > 0 ? profile.map(function (v) { return v / sum; }) : DEFAULT_SOLAR_PROFILE;
    }

    var batEff = 0.92;
    var batEffHalf = Math.sqrt(batEff);
    var batDOD = 0.90;
    var maxBatCap = batCap * batDOD;
    var pBatMaxKw = Math.max(3.0, batCap * 0.5);
    var batSoC = 0.0;
    var hasVirtualBattery = Boolean(p.hasVirtualBattery);

    var annualAutoconsumoDirecto = 0;
    var annualBateriaKWh = 0;
    var annualExcedenteKWh = 0;
    var annualCosteRed = 0;
    var annualCosteCargaRed = 0;
    var annualIngresoExcedente = 0;
    var annualIngresoExcedenteEfectivo = 0;
    var annualCosteSinFV = 0;
    var monthlyEnergyBreakdown = [];
    var minTouPrice = Math.min.apply(null, tou.horas);

    for (var m = 0; m < 12; m++) {
      var daysInMonth = MONTH_DAYS[m];
      var solarMonthKwh = monthlySolarKwh[m] || 0;
      var windMonthKwh = monthlyWindKwh[m] || 0;
      var solarDailyKwh = solarMonthKwh / daysInMonth;
      var windDailyKwh = windMonthKwh / daysInMonth;
      var solarHourlyProfile = getMonthlySolarProfile(m);

      var loadMonthKwh = Math.max(0, Number(monthlyConsKwh[m]) || 0);
      var loadDailyKwh = loadMonthKwh / daysInMonth;

      var monthDirect = 0, monthBattery = 0, monthSurplus = 0, monthGridBuy = 0;
      var monthCostGrid = 0, monthGridChargeCost = 0, monthSurplusIncome = 0, monthCostSinFV = 0;

      for (var h = 0; h < 24; h++) {
        var pv = (solarDailyKwh * solarHourlyProfile[h]) + (windDailyKwh * WIND_HOURLY_PROFILE[h]);
        var load = loadDailyKwh * LOAD_PROFILE[h];
        var price = tou.horas[h];
        var isValley = price <= minTouPrice * 1.15;

        monthCostSinFV += load * price;

        var direct = Math.min(pv, load);
        var surplus = pv - direct;
        var fromBattery = 0;
        var gridBuy = 0;

        if (surplus > 0 && maxBatCap > 0 && batSoC < maxBatCap) {
          var space = maxBatCap - batSoC;
          var charge = Math.min(surplus, space, pBatMaxKw);
          batSoC += charge * batEffHalf;
          surplus -= charge;
        }

        if (batStrategy === 'arbitraje' && maxBatCap > 0 && batSoC < maxBatCap && isValley && h >= 2 && h <= 6) {
          var spaceArb = maxBatCap - batSoC;
          var gridCharge = Math.min(spaceArb, pBatMaxKw, load * 0.5);
          batSoC += gridCharge * batEffHalf;
          monthCostGrid += gridCharge * price;
          monthGridChargeCost += gridCharge * price;
        }

        if (direct < load) {
          var need = load - direct;
          if (batSoC > 0.01) {
            var reqFromSoC = need / batEffHalf;
            var dischargeFromSoC = Math.min(reqFromSoC, batSoC, pBatMaxKw / batEffHalf);
            batSoC -= dischargeFromSoC;
            fromBattery = dischargeFromSoC * batEffHalf;
          }
          gridBuy = Math.max(need - fromBattery, 0);
        } else if (surplus > 0) {
          monthSurplus += surplus;
          monthSurplusIncome += surplus * tou.compensacion;
        }

        monthDirect += direct;
        monthBattery += fromBattery;
        monthGridBuy += gridBuy;
        monthCostGrid += gridBuy * price;
      }

      var monthCostGridTotal = monthCostGrid * daysInMonth;
      var monthSurplusIncomeTotal = monthSurplusIncome * daysInMonth;
      var monthEffectiveSurplusIncome = hasVirtualBattery ? monthSurplusIncomeTotal : Math.min(monthSurplusIncomeTotal, monthCostGridTotal);

      var mGenKwh = Math.round(solarMonthKwh + windMonthKwh);
      var mDirectKwh = Math.round(monthDirect * daysInMonth);
      var mBatKwh = Math.round(monthBattery * daysInMonth);
      var mAutoTotalKwh = Math.min(mGenKwh, Math.max(0, mDirectKwh + mBatKwh));
      var mSurplusKwh = Math.max(0, mGenKwh - mAutoTotalKwh);
      var mConsKwh = Math.round(loadMonthKwh);
      var mGridBuyKwh = Math.round(monthGridBuy * daysInMonth);

      monthlyEnergyBreakdown.push({
        monthIndex: m,
        monthName: ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'][m],
        generationKWh: mGenKwh,
        solarKWh: Math.round(solarMonthKwh),
        windKWh: Math.round(windMonthKwh),
        autoconsumoKWh: mAutoTotalKwh,
        autoconsumoDirectoKWh: mDirectKwh,
        bateriaKWh: mBatKwh,
        excedenteVolcadoKWh: mSurplusKwh,
        consumoKWh: mConsKwh,
        gridImportKWh: mGridBuyKwh,
        selfSufficiencyPct: mConsKwh > 0 ? Math.min(100, Math.round((mAutoTotalKwh / mConsKwh) * 100)) : 0
      });

      annualAutoconsumoDirecto += monthDirect * daysInMonth;
      annualBateriaKWh += monthBattery * daysInMonth;
      annualExcedenteKWh += monthSurplus * daysInMonth;
      annualCosteRed += monthCostGridTotal;
      annualCosteCargaRed += monthGridChargeCost * daysInMonth;
      annualIngresoExcedente += monthSurplusIncomeTotal;
      annualIngresoExcedenteEfectivo += monthEffectiveSurplusIncome;
      annualCosteSinFV += monthCostSinFV * daysInMonth;
    }

    var precioRed = tou.horas.reduce(function (a, b) { return a + b; }, 0) / tou.horas.length;
    var precioCompensacion = tou.compensacion;
    var ahorroLuzAnio1 = Math.max(0, annualCosteSinFV - (annualCosteRed - annualIngresoExcedenteEfectivo + annualCosteCargaRed));
    var autarquia = Math.min((annualAutoconsumoDirecto + annualBateriaKWh) / Math.max(1, consumoAnual), 1.0);

    var inflacion = 0.03;
    var isCelActive = Boolean(p.isCelActive);
    var celPriceEur = (typeof p.celPriceEur === 'number' && p.celPriceEur > 0) ? p.celPriceEur : 0.11;
    var poolPriceEur = (typeof precioCompensacion === 'number' && precioCompensacion > 0) ? precioCompensacion : 0.05;
    var celExtraBenefitYear1 = isCelActive ? Math.max(0, Math.round(annualExcedenteKWh * Math.max(0, celPriceEur - poolPriceEur))) : 0;

    var degYear1 = p.degYear1;
    var degAnnual = p.degAnnual;
    var annualYields25 = [];
    var annualSavings25 = [];
    var degradationFactors25 = [];

    var isMicro = Boolean(p.isMicro);
    var invCount = p.invCount || 1;
    var singleInvPrice = p.singleInvPrice || 850;
    var invBasePrice = isMicro ? 0 : (singleInvPrice * invCount);
    var ipcTech = 0.012;
    var invReplacementCost12 = isMicro ? 0 : Math.round(invBasePrice * Math.pow(1 + ipcTech, 12));

    var batReplacementYear = 10;
    var ipcBat = -0.020;
    var batBaseCost = (bat > 0) ? bat : (batCap > 0 ? (batCap * 380) : 0);
    var batReplacementCost10 = (batCap > 0 || bat > 0)
      ? Math.round(Math.min(batBaseCost * 0.70, (batCap || 5.0) * 220) * Math.pow(1 + ipcBat, batReplacementYear))
      : 0;

    var opexYear1 = Math.max(90, Math.max(kwp * 15, subtotal * 0.01));
    var ipcOpex = 0.020;
    var annualOpex25 = [];
    var totalOpex25 = 0;

    var r = 0.04;
    var capexDesembolsoInicial = Math.max(capexBruto, 100);
    var financialSchedule25 = [];
    var discountedCashFlow25 = [];

    var cashflow = [-capexDesembolsoInicial];
    var acumulado = [-capexDesembolsoInicial];
    var cashflowSinCEL = [-capexDesembolsoInicial];
    var acumuladoSinCEL = [-capexDesembolsoInicial];
    var van = -capexDesembolsoInicial;
    var totalGenerado25 = 0;
    var totalCoste25 = capexDesembolsoInicial;
    var discountedCostsSum = 0;
    var discountedYieldSum = 0;

    var ibiYears = (soilType === 'rustico' || commTax.ibiEnabled === false || ibiOpt === '0')
      ? 0
      : (ibiOpt.indexOf('_10') !== -1 ? 10 : (ibiOpt.indexOf('_5') !== -1 ? 5 : (ibiOpt.indexOf('_3') !== -1 ? 3 : ((commTax && typeof commTax.ibiYears === 'number' && commTax.ibiYears > 0) ? commTax.ibiYears : 0))));
    var ibiAnnualBonus = (ibiYears > 0) ? (ahorroIBITotal / ibiYears) : 0;

    for (var y = 1; y <= 25; y++) {
      var degFactor = (1 - degYear1) * Math.pow(1 - degAnnual, y - 1);
      var yieldY = annualYieldKWh * degFactor;
      degradationFactors25.push(Math.round(degFactor * 1000) / 10);
      annualYields25.push(Math.round(yieldY));
      totalGenerado25 += yieldY;

      var priceY = precioRed * Math.pow(1 + inflacion, y - 1);
      var baseSaveY = (y === 1) ? ahorroLuzAnio1 : (ahorroLuzAnio1 * (yieldY / Math.max(annualYieldKWh, 1)) * Math.pow(1 + inflacion, y - 1));
      var celExtraY = isCelActive ? ((y === 1) ? celExtraBenefitYear1 : (celExtraBenefitYear1 * (yieldY / Math.max(annualYieldKWh, 1)) * Math.pow(1 + inflacion, y - 1))) : 0;
      var saveY = baseSaveY + celExtraY;
      annualSavings25.push(Math.round(saveY));

      var omY = opexYear1 * Math.pow(1 + ipcOpex, y - 1);
      annualOpex25.push(Math.round(omY));
      totalOpex25 += omY;
      totalCoste25 += omY;

      var invReplY = (y === 12) ? invReplacementCost12 : 0;
      var batReplY = (y === batReplacementYear) ? batReplacementCost10 : 0;
      var replY = invReplY + batReplY;
      totalCoste25 += replY;

      discountedCostsSum += (omY + replY) / Math.pow(1 + r, y);
      discountedYieldSum += yieldY / Math.pow(1 + r, y);

      var fiscalY = 0;
      if (y === 1) fiscalY += (customerProfile === 'empresa' ? ahorroSociedades : ahorroIRPF) + ahorroCAE;
      if (y <= ibiYears) fiscalY += ibiAnnualBonus;

      var netCF = saveY - omY - replY + fiscalY;
      var netCFSinCEL = baseSaveY - omY - replY + fiscalY;
      var discountedCF = netCF / Math.pow(1 + r, y);

      cashflow.push(netCF);
      cashflowSinCEL.push(netCFSinCEL);
      discountedCashFlow25.push(Math.round(discountedCF));
      acumulado.push(acumulado[y - 1] + netCF);
      acumuladoSinCEL.push(acumuladoSinCEL[y - 1] + netCFSinCEL);
      van += discountedCF;

      financialSchedule25.push({
        year: y,
        yieldKWh: Math.round(yieldY),
        degradationPct: degradationFactors25[y - 1],
        priceEUR: Math.round(priceY * 1000) / 1000,
        savingsEUR: Math.round(saveY),
        opexEUR: Math.round(omY),
        replacementEUR: Math.round(replY),
        fiscalEUR: Math.round(fiscalY),
        netCashFlowEUR: Math.round(netCF),
        discountedCashFlowEUR: Math.round(discountedCF),
        cumulativeCashFlowEUR: Math.round(acumulado[y])
      });
    }

    var paybackYears = calcPayback(acumulado);
    var irrRes = calcIRR(cashflow);
    var tir = irrRes.tir;
    var tirString = irrRes.tirString;

    var totalCosteDescontado = capexDesembolsoInicial + discountedCostsSum;
    var lcoe = (discountedYieldSum > 0) ? (totalCosteDescontado / discountedYieldSum) : (totalCoste25 > 0 ? (totalCoste25 / Math.max(totalGenerado25, 1)) : 0.038);

    var fp = p.finParams || {};
    var finMode = (typeof fp.finMode === 'string') ? fp.finMode : 'both';
    var entradaEur = Math.max(0, fp.entradaEur || 0);
    var meses = Math.max(1, fp.meses || 120);
    var tinAnual = Math.max(0, fp.tinAnual || 0);
    var comisionAperturaPct = Math.max(0, fp.comisionAperturaPct || 0);
    var aperturaFinanciada = Boolean(fp.aperturaFinanciada);
    var mesesCarencia = Math.max(0, Math.min(12, Math.round(fp.mesesCarencia || 0)));
    var seguroMensualEur = Math.max(0, fp.seguroMensualEur || 0);
    var notariaEur = Math.max(0, fp.notariaEur || 0);

    var capitalBaseFinanciar = Math.max(0, capexBruto - entradaEur);
    var comisionAperturaEur = Math.round(capitalBaseFinanciar * comisionAperturaPct);
    var capitalPrincipalCredito = capitalBaseFinanciar + (aperturaFinanciada ? comisionAperturaEur : 0) + (aperturaFinanciada ? notariaEur : 0);
    var gastosInicialesContado = entradaEur + (!aperturaFinanciada ? comisionAperturaEur : 0) + (!aperturaFinanciada ? notariaEur : 0);

    var mesesAmortizacion = Math.max(1, meses - mesesCarencia);
    var tinMensual = tinAnual / 12.0;
    var cuotaAmortizacion = 0;
    if (mesesAmortizacion > 0 && capitalPrincipalCredito > 0) {
      cuotaAmortizacion = (tinMensual > 0)
        ? (capitalPrincipalCredito * (tinMensual * Math.pow(1 + tinMensual, mesesAmortizacion))) / (Math.pow(1 + tinMensual, mesesAmortizacion) - 1)
        : (capitalPrincipalCredito / mesesAmortizacion);
      if (!Number.isFinite(cuotaAmortizacion)) cuotaAmortizacion = 0;
    }
    var cuotaDuranteCarencia = (capitalPrincipalCredito * tinMensual) + seguroMensualEur;
    var cuotaMensualCredito = cuotaAmortizacion + seguroMensualEur;
    var cuotaMensual = Math.round(cuotaMensualCredito);

    var taeCalculadaPct = tinAnual * 100.0;
    if (capitalBaseFinanciar > 0 && meses > 0) {
      try {
        var desembolsoNetoPrestamo = capitalBaseFinanciar - (!aperturaFinanciada ? comisionAperturaEur : 0) - (!aperturaFinanciada ? notariaEur : 0);
        var flujosPrestamo = [-desembolsoNetoPrestamo];
        for (var fm = 1; fm <= meses; fm++) {
          flujosPrestamo.push(fm <= mesesCarencia ? cuotaDuranteCarencia : cuotaMensualCredito);
        }
        var rMin = 0.0, rMax = 0.10, rMid = 0.0;
        for (var iterT = 0; iterT < 40; iterT++) {
          rMid = (rMin + rMax) / 2.0;
          var npvF = 0;
          for (var tf = 0; tf < flujosPrestamo.length; tf++) {
            npvF += flujosPrestamo[tf] / Math.pow(1 + rMid, tf);
          }
          if (npvF > 0) rMin = rMid;
          else rMax = rMid;
        }
        var taeReal = (Math.pow(1 + rMid, 12) - 1) * 100.0;
        if (Number.isFinite(taeReal) && taeReal > 0) taeCalculadaPct = taeReal;
      } catch (eTae) {
        taeCalculadaPct = ((Math.pow(1 + tinMensual, 12) - 1) * 100.0) + (comisionAperturaPct * 100.0 / (meses / 12.0));
      }
    }

    var ahorroMensualLuz = ahorroLuzAnio1 / 12.0;
    var balanceNetoMensual = ahorroMensualLuz - cuotaMensual;

    var cashflowFinanciado = [-gastosInicialesContado];
    var acumuladoFinanciado = [-gastosInicialesContado];
    for (var yf = 1; yf <= 25; yf++) {
      var cuotaAnualY = 0;
      var startM = (yf - 1) * 12 + 1;
      var endM = yf * 12;
      for (var mIdx = startM; mIdx <= endM; mIdx++) {
        if (mIdx <= meses) {
          cuotaAnualY += (mIdx <= mesesCarencia ? cuotaDuranteCarencia : cuotaMensualCredito);
        }
      }
      var netCFFin = (annualSavings25[yf - 1] || 0) - (annualOpex25[yf - 1] || 0) - ((yf === 12 ? invReplacementCost12 : 0) + (yf === batReplacementYear ? batReplacementCost10 : 0)) + (yf === 1 ? ((customerProfile === 'empresa' ? ahorroSociedades : ahorroIRPF) + ahorroCAE) : 0) + (yf <= ibiYears ? ibiAnnualBonus : 0) - cuotaAnualY;
      cashflowFinanciado.push(Math.round(netCFFin));
      acumuladoFinanciado.push(Math.round(acumuladoFinanciado[yf - 1] + netCFFin));
    }

    var paybackFinanciadoYears = calcFinancedPayback(acumuladoFinanciado);
    var ahorroTotal25 = Math.round(annualSavings25.reduce(function (a, b) { return a + b; }, 0));
    var redKWhAnual = Math.max(0, Math.round(consumoAnual - annualAutoconsumoDirecto - annualBateriaKWh));

    var exportedBatCount = (batCap > 0 || bat > 0) ? Math.max(1, batCapCount || 1) : 0;
    var exportedMlpeCount = isMicro
      ? (p.microCount || numPanels)
      : (p.optimizerCount || 0);

    return {
      numPanels: numPanels,
      kwp: kwp,
      invCount: isMicro ? 0 : invCount,
      batCount: exportedBatCount,
      mlpeCount: exportedMlpeCount,
      topology: p.topology || 'inverter',
      directCost: directCost,
      marginPct: marginPct,
      marginEur: marginEur,
      unitPanelPrice: unitPanelPrice,
      panCost: panCost,
      modulesBreakdown: p.mb || null,
      isMultiModule: !!(p.mb && p.mb.isMultiModule),
      estCost: est,
      invCost: inv,
      mlpeCost: mlpeCost,
      batCost: bat,
      cabCost: cab,
      cablesOnlyCost: (p.cablesOnlyCost != null) ? p.cablesOnlyCost : Math.round(cab * 0.45),
      protOnlyCost: (p.protOnlyCost != null) ? p.protOnlyCost : Math.round(cab * 0.55),
      moCost: mo,
      legCost: leg,
      windCost: windCost,
      addonsCost: addonsCost,
      discountEur: discountEur,
      discountLabel: discountLabel,
      subtotalPreDiscount: subtotalPreDiscount,
      capexTachado: capexTachado,
      tasaICIO: tasaICIO,
      subtotal: subtotal,
      ivaRate: ivaRate,
      ivaOpt: ivaCompliance.ivaOpt,
      ivaCompliance: ivaCompliance,
      iva: iva,
      capexBruto: capexBruto,
      customerProfile: customerProfile,
      isRate: isRate,
      ahorroSociedades: ahorroSociedades,
      ahorroDeduccionDirecta: ahorroDeduccionDirecta,
      isOffGrid: isOffGrid,
      soilType: soilType,
      dieselLitersAvoided: Math.round(annualYieldKWh * 0.32),
      ahorroDieselAnio1: Math.round(annualYieldKWh * 0.32 * 1.45),
      ahorroIBITotal: ahorroIBITotal,
      ahorroIRPF: ahorroIRPF,
      ahorroIRPFEstatal: ahorroIRPFEstatal,
      ahorroIRPFAutonomico: ahorroIRPFAutonomico,
      ahorroCAE: ahorroCAE,
      taxFormulaLines: taxFormulaLines,
      irpfPct: irpfPct,
      ahorroICIO: ahorroICIO,
      totalAhorroFiscal: totalAhorroFiscal,
      capexNeto: capexNeto,
      inversionBaseMetricas: capexBruto,
      autarquiaPct: Math.round(autarquia * 100),
      pctAutoconsumo: Math.round(autarquia * 100),
      precioRedEUR: precioRed,
      precioCompensacionEUR: precioCompensacion,
      annualYieldKWh: annualYieldKWh,
      monthlySource: p.monthlySource || 'physical-monthly',
      ahorroLuzAnio1: ahorroLuzAnio1,
      ahorroTotal25: ahorroTotal25,
      paybackYears: paybackYears,
      van: van,
      tir: (tir != null && isFinite(tir)) ? tir * 100 : (tirString.indexOf('>') === 0 ? 100.0 : null),
      tirString: tirString,
      lcoe: lcoe,
      mesesFin: meses,
      tinAnualPct: tinAnual * 100,
      finMode: finMode,
      entradaEur: entradaEur,
      capitalBaseFinanciar: capitalBaseFinanciar,
      capitalPrincipalCredito: capitalPrincipalCredito,
      comisionAperturaEur: comisionAperturaEur,
      comisionAperturaPct: comisionAperturaPct * 100,
      aperturaFinanciada: aperturaFinanciada,
      mesesCarencia: mesesCarencia,
      cuotaDuranteCarencia: Math.round(cuotaDuranteCarencia),
      seguroMensualEur: seguroMensualEur,
      notariaEur: notariaEur,
      gastosInicialesContado: gastosInicialesContado,
      taeCalculadaPct: Math.round(taeCalculadaPct * 100) / 100,
      cuotaMensual: cuotaMensual,
      ahorroMensualLuz: ahorroMensualLuz,
      balanceNetoMensual: balanceNetoMensual,
      cashflow: cashflow,
      cashflowAcum: acumulado,
      cashflowContado: cashflow,
      cashflowAcumContado: acumulado,
      cashflowSinCEL: cashflowSinCEL,
      cashflowAcumSinCEL: acumuladoSinCEL,
      paybackContadoYears: paybackYears,
      cashflowFinanciado: cashflowFinanciado,
      cashflowAcumFinanciado: acumuladoFinanciado,
      paybackFinanciadoYears: paybackFinanciadoYears,
      touNombre: tou.name,
      batCap: batCap,
      batSoCdiaria: Math.round(batSoC * 10) / 10,
      consumoAnual: Math.round(consumoAnual || 0),
      consumoMensualSource: monthlyConsSource,
      autoconsumoDirecto: Math.round(annualAutoconsumoDirecto || 0),
      bateriaKWh: Math.round(annualBateriaKWh || 0),
      excedenteKWh: Math.round(annualExcedenteKWh || 0),
      redKWh: redKWhAnual,
      monthlyEnergyBreakdown: monthlyEnergyBreakdown,
      costeRedAnual: Math.round(annualCosteRed || 0),
      ingresoExcedente: Math.round(annualIngresoExcedente || 0),
      ingresoExcedenteEfectivo: Math.round(annualIngresoExcedenteEfectivo || 0),
      ingresoExcedenteTechoAplicado: !hasVirtualBattery && (annualIngresoExcedente > annualCosteRed),
      hasVirtualBattery: hasVirtualBattery,
      annualYields25: annualYields25,
      annualSavings25: annualSavings25,
      degradationFactors25: degradationFactors25,
      remainingPerformanceYr25: degradationFactors25[24] || 85.0,
      totalGenerado25: Math.round(totalGenerado25),
      degYear1Pct: degYear1 * 100,
      degAnnualPct: degAnnual * 100,
      inflacionPct: inflacion * 100,
      totalOpex25: Math.round(totalOpex25),
      annualOpex25: annualOpex25,
      inverterReplacementCostYr12: invReplacementCost12,
      batteryReplacementCostYr10: batReplacementCost10,
      opexYear1: Math.round(opexYear1),
      ipcOpexPct: ipcOpex * 100,
      invBasePrice: Math.round(invBasePrice),
      financialSchedule25: financialSchedule25,
      discountedCashFlow25: discountedCashFlow25,
      capexDesembolsoInicial: Math.round(capexDesembolsoInicial),
      waccPct: Math.round(r * 1000) / 10,
      isCelActive: isCelActive,
      celExtraBenefitYear1: celExtraBenefitYear1,
      ahorroTotalConCEL: Math.round(ahorroLuzAnio1 + celExtraBenefitYear1)
    };
  }

  var api = {
    TOU_PROFILES: TOU_PROFILES,
    MONTH_DAYS: MONTH_DAYS,
    calcNPV: calcNPV,
    calcIRR: calcIRR,
    calcPayback: calcPayback,
    calcFinancedPayback: calcFinancedPayback,
    computeWindTurbineCostBreakdown: computeWindTurbineCostBreakdown,
    computeThreePackages: computeThreePackages,
    calculateCELMetrics: calculateCELMetrics,
    computeFinancialModelFromParams: computeFinancialModelFromParams
  };

  root.RAFinancialModel = api;
  if (!root.RA) root.RA = {};
  root.RA.FinancialModel = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
