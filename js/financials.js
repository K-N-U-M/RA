// RA-FINANCIALS — Motor financiero bancable a 25 años (CAPEX, OPEX, VAN, TIR, LCOE, Cashflow)
// La física solar y simulación energética se calculan exclusivamente en solar-engine.js (v3.0)
(function() {
  'use strict';

  // [D1+D2] Cliente IA unificado (cabecera x-goog-api-key, timeout y cancelación).
  function _aiFetch(url, opts, timeoutMs, apiKey) {
    if (window.RA && typeof window.RA.geminiFetch === 'function') {
      return window.RA.geminiFetch(url, opts, timeoutMs, apiKey);
    }
    const cleanOpts = Object.assign({}, opts || {});
    cleanOpts.headers = Object.assign({}, cleanOpts.headers || {});
    if (apiKey) cleanOpts.headers['x-goog-api-key'] = apiKey;
    return fetch(url, cleanOpts);
  }

// ═══════════════════════════════════════════════════════════════════════════════
// RESOLUCIÓN DE EQUIPOS DESDE CATÁLOGO (SSOT → Nombres reales)
// ═══════════════════════════════════════════════════════════════════════════════
// RESOLUCIÓN DE EQUIPOS DESDE CATÁLOGO (SSOT → Nombres reales)
// ═══════════════════════════════════════════════════════════════════════════════
function resolveEquipmentNames() {
  var cat = (typeof equipmentCatalog !== 'undefined' && equipmentCatalog) ? equipmentCatalog : {};
  var cfg = (typeof window !== 'undefined' && window.solarProjectConfig) ? window.solarProjectConfig : {};
  var result = {
    // Inversor
    invName: 'Inversor de Alta Eficiencia (≥98.2%)',
    invBrand: '', invModel: '', invKw: 0, invCount: 1, invMPPTs: 0,
    totalAcKw: 0, totalMPPTs: 0,
    invertersBreakdown: { isMulti: false, totalCount: 1, totalAcKw: 0, totalMPPTs: 0, items: [] },
    // Batería
    batName: 'Sin acumulación (Conexión Directa)',
    batBrand: '', batModel: '', batKwh: 0, batCount: 0, hasBat: false,
    totalBatKwh: 0,
    batteriesBreakdown: { isMulti: false, totalCount: 0, totalCapacityKwh: 0, items: [] },
    // Microinversor
    microName: '', microBrand: '', microModel: '', microCount: 0, hasMicro: false, totalMicroKw: 0,
    // Topología
    topology: cfg.selectedTopology || 'inverter',
    // Módulo FV
    modBrand: '', modModel: '', modFullName: '', modWp: 450
  };

  // ── Módulo FV ──
  var activeModId = cfg.selectedModuleId || (window.WP && window.WP.polylines && window.WP.polylines[0] && window.WP.polylines[0].moduleId) || '';
  if (cat.modules && Array.isArray(cat.modules)) {
    var foundMod = cat.modules.find(function(m) { return m.id === activeModId; }) || cat.modules[0];
    if (foundMod) {
      result.modBrand = foundMod.brand || foundMod.fabricante || '';
      result.modModel = foundMod.model || foundMod.modelo || '';
      result.modWp = foundMod.wp || foundMod.potencia || 450;
      result.modFullName = (result.modBrand ? (result.modBrand + ' ') : '') + (result.modModel || ('Tier-1 ' + result.modWp + 'W'));
    }
  }

  // ── Inversores (Multi-Inversor y Auto-Sizing) ──
  var customInverters = Array.isArray(cfg.inverters) && cfg.inverters.length > 0 ? cfg.inverters : (Array.isArray(cfg.selectedInverters) && cfg.selectedInverters.length > 0 ? cfg.selectedInverters : null);

  if (customInverters) {
    var totCnt = 0, totKw = 0, totMppt = 0;
    var invItems = [];
    customInverters.forEach(function(item) {
      var id = item.id || item.inverterId;
      var invObj = (cat.inverters && Array.isArray(cat.inverters)) ? cat.inverters.find(function(i) { return i.id === id; }) : null;
      var count = item.count || 1;
      var kw = (invObj && (invObj.kw || invObj.kw_nominal)) || item.kw || 0;
      var mppt = (invObj && (invObj.mppt || invObj.mpptCount || invObj.mppts || invObj.nMppt)) || item.mppt || 2;
      var brand = (invObj && invObj.brand) || item.brand || 'Tier-1';
      var model = (invObj && invObj.model) || item.model || 'Inversor';
      var subKw = kw * count;
      var subMppt = mppt * count;
      totCnt += count;
      totKw += subKw;
      totMppt += subMppt;
      invItems.push({
        id: id,
        brand: brand,
        model: model,
        fullName: brand + ' ' + model,
        kw: kw,
        count: count,
        totalKw: subKw,
        mppt: mppt,
        totalMPPTs: subMppt
      });
    });
    result.invertersBreakdown = {
      isMulti: totCnt > 1 || invItems.length > 1,
      totalCount: totCnt,
      totalAcKw: Math.round(totKw * 100) / 100,
      totalMPPTs: totMppt,
      items: invItems
    };
    result.invCount = totCnt;
    result.totalAcKw = Math.round(totKw * 100) / 100;
    result.totalMPPTs = totMppt;
    if (invItems.length === 1) {
      result.invBrand = invItems[0].brand;
      result.invModel = invItems[0].model;
      result.invKw = invItems[0].kw;
      result.invMPPTs = invItems[0].mppt;
    }
    result.invName = (totCnt > 1 ? (totCnt + '× ') : '') + (invItems.length > 1 ? (invItems.length + ' Estaciones Inversoras (' + result.totalAcKw.toFixed(1) + ' kW total)') : (result.invBrand + ' ' + result.invModel + ' (' + result.totalAcKw.toFixed(1) + ' kW total · ' + totMppt + ' MPPT)'));
  } else if (cfg.selectedInverterId) {
    var inv = (cat.inverters && Array.isArray(cat.inverters))
      ? cat.inverters.find(function(i) { return i.id === cfg.selectedInverterId; })
      : null;
    if (!inv && cfg.lastVirtualInverter && cfg.lastVirtualInverter.id === cfg.selectedInverterId) {
      inv = cfg.lastVirtualInverter;
    }
    if (inv) {
      result.invBrand = inv.brand || '';
      result.invModel = inv.model || '';
      result.invKw = inv.kw || inv.kw_nominal || 0;
      result.invMPPTs = inv.mppt || inv.mpptCount || inv.mppts || inv.nMppt || 0;
      result.invUnitPrice = inv.price || 1500;
      var sizing = cfg.autoSizing && cfg.autoSizing.inverters;
      if (sizing && !sizing.isManual && typeof sizing.autoCount === 'number' && sizing.autoCount > 1 && sizing.count < sizing.autoCount) {
        sizing.count = sizing.autoCount;
      }
      var countFromSizing = (sizing && sizing.count) ? sizing.count : 1;
      if (!sizing || !sizing.isManual) {
        var nPanEst = (typeof window !== 'undefined' && Array.isArray(window.allRenderedPanels) && window.allRenderedPanels.length > 0)
          ? window.allRenderedPanels.filter(function(p) { return p && !p.deleted && !p.disabled; }).length
          : (cfg.lastEstimatedPanels || 0);
        var kwpEst = (nPanEst * (result.modWp || 450)) / 1000.0;
        var maxDcPerInv = (result.invKw || 10.0) * (inv.maxOverload || 1.35);
        if (kwpEst > 0 && maxDcPerInv > 0) {
          var minReqInv = Math.max(1, Math.ceil(kwpEst / maxDcPerInv));
          if (countFromSizing < minReqInv) {
            countFromSizing = minReqInv;
            if (sizing) {
              sizing.count = countFromSizing;
              sizing.autoCount = Math.max(sizing.autoCount || 1, countFromSizing);
            }
          }
        }
      }
      result.invCount = countFromSizing;
      result.totalAcKw = Math.round((result.invKw * result.invCount) * 100) / 100;
      result.totalMPPTs = result.invMPPTs * result.invCount;
      result.invertersBreakdown = {
        isMulti: result.invCount > 1,
        totalCount: result.invCount,
        totalAcKw: result.totalAcKw,
        totalMPPTs: result.totalMPPTs,
        items: [{
          id: inv.id,
          brand: result.invBrand,
          model: result.invModel,
          fullName: result.invBrand + ' ' + result.invModel,
          kw: result.invKw,
          count: result.invCount,
          totalKw: result.totalAcKw,
          mppt: result.invMPPTs,
          totalMPPTs: result.totalMPPTs,
          unitPrice: result.invUnitPrice
        }]
      };
      var mpptTxt = result.totalMPPTs > 0 ? (' · ' + result.totalMPPTs + ' MPPT') : '';
      if (result.invCount > 1) {
        result.invName = result.invCount + '× ' + result.invBrand + ' ' + result.invModel + ' (' + result.invKw + ' kW c/u · ' + result.totalAcKw.toFixed(1) + ' kW total' + mpptTxt + ')';
      } else {
        result.invName = '1× ' + result.invBrand + ' ' + result.invModel + ' (' + result.invKw + ' kW' + mpptTxt + ')';
      }
    }
  }

  // ── Batería / Acumulación ──
  var customBatteries = Array.isArray(cfg.batteries) && cfg.batteries.length > 0 ? cfg.batteries : (Array.isArray(cfg.selectedBatteries) && cfg.selectedBatteries.length > 0 ? cfg.selectedBatteries : null);

  if (customBatteries) {
    var totBatCnt = 0, totBatCap = 0;
    var batItems = [];
    customBatteries.forEach(function(item) {
      var id = item.id || item.batteryId;
      var batObj = (cat.batteries && Array.isArray(cat.batteries)) ? cat.batteries.find(function(b) { return b.id === id; }) : null;
      var count = item.count || 1;
      var cap = (batObj && (batObj.kwh || batObj.capacity)) || item.kwh || 0;
      var brand = (batObj && batObj.brand) || item.brand || 'Tier-1';
      var model = (batObj && batObj.model) || item.model || 'Batería LFP';
      var subCap = cap * count;
      totBatCnt += count;
      totBatCap += subCap;
      batItems.push({
        id: id,
        brand: brand,
        model: model,
        fullName: brand + ' ' + model,
        kwh: cap,
        count: count,
        totalKwh: subCap
      });
    });
    result.hasBat = totBatCap > 0;
    result.batCount = totBatCnt;
    result.totalBatKwh = Math.round(totBatCap * 10) / 10;
    result.batteriesBreakdown = {
      isMulti: totBatCnt > 1 || batItems.length > 1,
      totalCount: totBatCnt,
      totalCapacityKwh: result.totalBatKwh,
      items: batItems
    };
    if (batItems.length === 1) {
      result.batBrand = batItems[0].brand;
      result.batModel = batItems[0].model;
      result.batKwh = batItems[0].kwh;
    }
    result.batName = (totBatCnt > 1 ? (totBatCnt + '× ') : '') + (batItems.length > 1 ? (batItems.length + ' Torres de Batería (' + result.totalBatKwh.toFixed(1) + ' kWh)') : (result.batBrand + ' ' + result.batModel + ' (' + result.totalBatKwh.toFixed(1) + ' kWh)'));
  } else if (cfg.selectedBatteryId && cat.batteries && Array.isArray(cat.batteries)) {
    var bat = cat.batteries.find(function(b) { return b.id === cfg.selectedBatteryId; });
    if (bat && bat.id !== 'bat_none' && ((bat.kwh || bat.capacity || 0) > 0)) {
      result.batBrand = bat.brand || '';
      result.batModel = bat.model || '';
      result.batKwh = bat.kwh || bat.capacity || 0;
      var batSizing = cfg.autoSizing && cfg.autoSizing.batteries;
      result.batCount = (batSizing && batSizing.count) ? batSizing.count : 1;
      result.hasBat = true;
      result.totalBatKwh = Math.round((result.batKwh * result.batCount) * 10) / 10;
      result.batteriesBreakdown = {
        isMulti: result.batCount > 1,
        totalCount: result.batCount,
        totalCapacityKwh: result.totalBatKwh,
        items: [{
          id: bat.id,
          brand: result.batBrand,
          model: result.batModel,
          fullName: result.batBrand + ' ' + result.batModel,
          kwh: result.batKwh,
          count: result.batCount,
          totalKwh: result.totalBatKwh
        }]
      };
      if (result.batCount > 1) {
        result.batName = result.batCount + '× ' + result.batBrand + ' ' + result.batModel + ' (' + result.batKwh + ' kWh c/u · ' + result.totalBatKwh.toFixed(1) + ' kWh total)';
      } else {
        result.batName = '1× ' + result.batBrand + ' ' + result.batModel + ' (' + result.totalBatKwh.toFixed(1) + ' kWh)';
      }
    } else {
      result.hasBat = false;
      result.batBrand = '';
      result.batModel = '';
      result.batKwh = 0;
      result.batCount = 0;
      result.totalBatKwh = 0;
      result.batName = '0× módulos (Sin acumulación electroquímica)';
      result.batteriesBreakdown = { isMulti: false, totalCount: 0, totalCapacityKwh: 0, items: [] };
    }
  }

  // ── Microinversor / Optimizadores (Topología SSOT) ──
  var topology = cfg.selectedTopology || 'inverter';
  result.topology = topology;
  result.hasMicro = false;
  result.hasOptimizer = false;
  result.optimizerCount = 0;
  result.optimizerName = '';

  if (topology === 'microinverter') {
    if (cfg.selectedMicroinverterId && cat.microinverters && Array.isArray(cat.microinverters)) {
      var mic = cat.microinverters.find(function(mi) { return mi.id === cfg.selectedMicroinverterId; });
      if (mic) {
        result.microBrand = mic.brand || '';
        result.microModel = mic.model || '';
        var micSizing = cfg.autoSizing && cfg.autoSizing.microinverters;
        result.microCount = (micSizing && micSizing.count) ? micSizing.count : 0;
        result.hasMicro = true;
        var micKw = mic.kw || (mic.va ? mic.va / 1000 : 0.8);
        result.totalMicroKw = Math.round((micKw * result.microCount) * 100) / 100;
        result.microName = Math.max(1, result.microCount) + '× ' + result.microBrand + ' ' + result.microModel + ' (' + result.totalMicroKw.toFixed(1) + ' kW AC total)';
      }
    }
  } else if (topology === 'optimizer') {
    var dCosts = (typeof RAPricing !== 'undefined' && typeof RAPricing.computeDesignCosts === 'function')
      ? RAPricing.computeDesignCosts(cfg.numPanels || 0)
      : null;
    var optCnt = (dCosts && dCosts.optimizersCount > 0) ? dCosts.optimizersCount : 0;
    if (optCnt > 0) {
      result.hasOptimizer = true;
      result.optimizerCount = optCnt;
      var optSpec = (cat.microinverters && cat.microinverters.find(function(mi) { return mi.type && mi.type.includes('Optimizador'); })) || { brand: 'Tier-1', model: 'Optimizador DC' };
      result.optimizerName = optCnt + '× ' + (optSpec.brand || '') + ' ' + (optSpec.model || 'Optimizador DC');
    }
  }

  // ── Generación Mini-Eólica (Hibridación desde SSOT) ──
  var activeTurbines = (typeof window !== 'undefined' && Array.isArray(window.windTurbines))
    ? window.windTurbines.filter(function(t) { return t && (!t.operationalState || t.operationalState.enabled !== false); })
    : [];
  var wPark = (typeof window !== 'undefined' && window.windParkSummary) ? window.windParkSummary : null;

  result.hasWind = activeTurbines.length > 0;
  result.windCount = activeTurbines.length;
  result.windTotalKw = 0;
  result.windTotalEur = 0;
  result.windAepNetKwh = (wPark && wPark.totalAepNetKwh) ? Math.round(wPark.totalAepNetKwh) : 0;
  result.windName = '0× aerogeneradores (Sin generación minieólica)';
  result.windDesc = '0× aerogeneradores montados en el proyecto';
  result.windItems = [];

  if (result.hasWind) {
    var totalW = 0;
    var totalWindEur = 0;
    var modelsMap = {};
    activeTurbines.forEach(function(t, idx) {
      var freshCat = (typeof window !== 'undefined' && window.RAWindCatalog && typeof window.RAWindCatalog.getById === 'function' && t.catalogId)
        ? window.RAWindCatalog.getById(t.catalogId)
        : null;
      var c = Object.assign({}, t._catalog || {}, freshCat || {});
      var st = t.supportStructure || {};
      var ratedKw = c.ratedPowerW ? (c.ratedPowerW / 1000) : (t.ratedPowerKw || 3.0);
      var unitPrice = (typeof c.priceEur === 'number' && c.priceEur > 0) ? c.priceEur : Math.round(ratedKw * 1450);
      var supCost = (st && typeof st.costEur === 'number' && st.costEur > 0) ? st.costEur : 0;
      totalW += ratedKw;
      totalWindEur += (unitPrice + supCost);
      var brand = c.manufacturer || c.brand || '';
      var mName = (brand ? (brand + ' ') : '') + (c.model || t.name || ('Aerogenerador #' + (idx + 1)));
      if (!modelsMap[mName]) {
        modelsMap[mName] = { count: 0, ratedKw: ratedKw, hubH: st.hubHeightM || 18, type: c.type || 'HAWT', unitPrice: unitPrice, totalEur: 0 };
      }
      modelsMap[mName].count++;
      modelsMap[mName].totalEur += (unitPrice + supCost);
    });

    result.windTotalKw = Math.round(totalW * 10) / 10;
    result.windTotalEur = Math.round(totalWindEur);
    var mKeys = Object.keys(modelsMap);
    result.windItems = mKeys.map(function(k) {
      var item = modelsMap[k];
      return {
        fullName: k,
        count: item.count,
        ratedKw: item.ratedKw,
        hubH: item.hubH,
        type: item.type,
        unitPrice: item.unitPrice,
        totalEur: item.totalEur
      };
    });
    if (mKeys.length === 1) {
      var single = modelsMap[mKeys[0]];
      result.windName = single.count + '× ' + mKeys[0] + ' (' + (single.count * single.ratedKw).toFixed(1) + ' kW · Mástil ' + single.hubH + 'm)';
      result.windDesc = single.count + '× ' + mKeys[0] + ' (' + single.ratedKw + ' kW c/u · H=' + single.hubH + 'm)';
    } else {
      result.windName = activeTurbines.length + '× Aerogeneradores (' + result.windTotalKw.toFixed(1) + ' kW total): ' + mKeys.map(function(k) { return modelsMap[k].count + '× ' + k; }).join(' + ');
      result.windDesc = mKeys.map(function(k) { return modelsMap[k].count + '× ' + k + ' (' + modelsMap[k].ratedKw + ' kW)'; }).join(' · ');
    }
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// RESOLUCIÓN DE GARANTÍAS DE EQUIPOS (SSOT → Dinámicas según catálogo y tecnología)
// ═══════════════════════════════════════════════════════════════════════════════
function resolveEquipmentWarranties(eq) {
  eq = eq || resolveEquipmentNames();
  var cat = (typeof equipmentCatalog !== 'undefined' && equipmentCatalog) ? equipmentCatalog : {};
  var cfg = (typeof window !== 'undefined' && window.solarProjectConfig) ? window.solarProjectConfig : {};

  // Valores predeterminados por normativa española (RD 7/2021) y estándares Tier-1
  var result = {
    warPower: '25',    // Garantía lineal de rendimiento módulos (25 años estándar)
    warMod: '15',      // Garantía de producto módulos (12-15 años estándar, 25-30 para All-Black/TOPCon/ABC)
    warInv: '12',      // Garantía de inversor estándar (12 años central de red / híbrido, 25 años microinversores)
    warMo: '5',        // Garantía de montaje e instalación (5 años)
    warBat: '10',      // Garantía de batería (10 años / 6.000 ciclos LiFePO4)
    isMicro: (eq && eq.hasMicro) || (cfg.selectedTopology === 'microinverter'),
    hasBat: Boolean(eq && eq.hasBat)
  };

  // 1. Dinamismo en Módulos
  var modId = cfg.selectedModuleId || '';
  var modObj = (cat.modules && Array.isArray(cat.modules)) ? cat.modules.find(function(m) { return m.id === modId; }) : null;
  if (modObj) {
    if (modObj.warProd) result.warMod = String(modObj.warProd);
    else if (modObj.tec && (modObj.tec.includes('ABC') || modObj.tec.includes('TOPCon') || modObj.tec.includes('Dual-Glass'))) {
      result.warMod = '25';
    } else {
      result.warMod = '15';
    }
    if (modObj.warPwr) result.warPower = String(modObj.warPwr);
    else result.warPower = (modObj.tec && modObj.tec.includes('Dual-Glass')) ? '30' : '25';
  }

  // 2. Dinamismo en Inversores: Microinversores (ej. Enphase IQ8) ofrecen 25 años oficial
  if (result.isMicro) {
    result.warInv = '25';
  } else {
    var invId = cfg.selectedInverterId || '';
    var invObj = (cat.inverters && Array.isArray(cat.inverters)) ? cat.inverters.find(function(i) { return i.id === invId; }) : null;
    if (invObj && invObj.warYears) {
      result.warInv = String(invObj.warYears);
    } else if (invObj && invObj.brand && /fronius|solaredge/i.test(invObj.brand)) {
      result.warInv = '12';
    } else {
      result.warInv = '12';
    }
  }

  // 3. Respetar override manual si el usuario definió un branding de empresa con garantías específicas
  try {
    var b = {};
    if (window.RACompanyBranding && typeof window.RACompanyBranding.getBranding === 'function') {
      b = window.RACompanyBranding.getBranding();
    } else {
      b = JSON.parse(localStorage.getItem('ra_company_branding') || '{}');
    }
    if (b.warPower && b.warPower !== '25') result.warPower = String(b.warPower);
    if (b.warMod && b.warMod !== '15') result.warMod = String(b.warMod);
    if (b.warInv && b.warInv !== '12' && b.warInv !== '10' && !result.isMicro) result.warInv = String(b.warInv);
    if (b.warMo && b.warMo !== '5') result.warMo = String(b.warMo);
  } catch(e) {}

  return result;
}
if (typeof window !== 'undefined') {
  window.resolveEquipmentWarranties = resolveEquipmentWarranties;
}

function generateCommercialSummary(d, m, equipment) {
  return 'Para amortizar la opción A, se recomienda invertir inicialmente el 100% y recuperar las bonificaciones fiscales y subvenciones en su caso. Desde el principio se paga la “nueva factura estimada”.<br>' +
    'Para amortizar la opción B, se solicita el 100% de financiación hasta 50.000€, durante los años de amortización se paga de media la “cuota mensual”, y al final de la amortización se paga el “balance de tu bolsillo”.';
}

// ═══════════════════════════════════════════════════════════════════════════════
// GENERACIÓN Y ENRIQUECIMIENTO DE RESUMEN COMERCIAL CON GEMINI
// ═══════════════════════════════════════════════════════════════════════════════
var _customCommercialSummary = null; // Almacena el texto personalizado generado o editado en el modal
if (typeof window !== 'undefined') {
  window.getCustomCommercialSummary = function() { return _customCommercialSummary; };
  window.setCustomCommercialSummary = function(val) { _customCommercialSummary = val; };
}

async function requestCommercialSummaryFromGemini(d, m, equipment) {
  var apiKey = '';
  try {
    if (window.RA && typeof window.RA.getGeminiApiKey === 'function') apiKey = window.RA.getGeminiApiKey();
    else if (window.RA && window.RA.geminiApiKey) apiKey = window.RA.geminiApiKey;
  } catch(e) {}
  if (!apiKey) throw new Error('NO_API_KEY');

  // 1. Obtención y saneamiento del nombre del cliente (evita comodines robóticos)
  var rawNombre = '';
  if (typeof document !== 'undefined') {
    var modalNombreEl = document.getElementById('pricing-cust-nombre');
    if (modalNombreEl && modalNombreEl.value && modalNombreEl.value.trim()) {
      rawNombre = modalNombreEl.value.trim();
    }
  }
  if (!rawNombre && d && d.tit && d.tit.nombre) {
    rawNombre = String(d.tit.nombre).trim();
  }
  if (!rawNombre && typeof window !== 'undefined' && window.RA && window.RA.billAuditor && window.RA.billAuditor.comparison && window.RA.billAuditor.comparison.titular) {
    rawNombre = String(window.RA.billAuditor.comparison.titular).trim();
  }
  if (!rawNombre && typeof document !== 'undefined') {
    var docNombreEl = document.getElementById('doc-nombre');
    if (docNombreEl && docNombreEl.value && docNombreEl.value.trim()) {
      rawNombre = docNombreEl.value.trim();
    }
  }

  var isGenericName = !rawNombre ||
    /^(cliente|titular|titular de la instalaci[oó]n|propietario|propietario ejemplo|propietario ejemplo s\.?l\.?|particular|empresa|ejemplo|xxxx+|n\/a)$/i.test(rawNombre);
  var nombreLimpio = isGenericName ? '' : rawNombre;

  // 2. Obtención de ubicación / municipio
  var ciudad = '';
  if (typeof document !== 'undefined') {
    var modalMunEl = document.getElementById('pricing-cust-mun');
    var modalProvEl = document.getElementById('pricing-cust-prov');
    if (modalMunEl && modalMunEl.value && modalMunEl.value.trim()) {
      ciudad = modalMunEl.value.trim();
    } else if (modalProvEl && modalProvEl.value && modalProvEl.value.trim()) {
      ciudad = modalProvEl.value.trim();
    }
  }
  if (!ciudad && d && d.tit) {
    ciudad = (d.tit.mun || d.tit.prov || '').trim();
  }
  if (!ciudad && typeof window !== 'undefined' && window.solarProjectConfig && window.solarProjectConfig.address) {
    ciudad = window.solarProjectConfig.address.split(',')[0].trim();
  }
  if (!ciudad) ciudad = 'su localidad';

  // 3. Métricas técnicas y económicas
  var kwp = (m && m.kwp) || 0;
  var numPanels = (m && m.numPanels) || (d && d.numPanels) || 0;
  var annualKWh = (d && d.annualKWh) || (m && m.annualKWh) || (kwp * 1450);
  var ahorro = (m && m.ahorroLuzAnio1) || (m && m.ahorroAnualEstimado) || 0;
  var payback = (m && m.paybackYears) || 0;
  var autoconsumo = (m && m.pctAutoconsumo) || (m && m.autoconsumoPct) || 0;

  // 4. Prompt instructivo y riguroso para redacción de alto impacto sin cortes
  var prompt = 'Eres un consultor solar experto y redactor comercial sénior en España.\n' +
    'Redacta un resumen comercial ejecutivo, persuasivo, riguroso y de alto valor (entre 75 y 115 palabras) para una propuesta fotovoltaica formal.\n\n' +
    'REGLAS DE ESTILO Y FORMATO (OBLIGATORIAS):\n' +
    '1. Extensión y cierre: Redacta 1 o 2 párrafos fluidos y cohesionados. Asegúrate de finalizar el texto con oraciones completas y PUNTO FINAL. No dejes nunca una frase a medias ni el texto cortado.\n' +
    '2. Sin viñetas ni títulos: NO uses viñetas (- o *), ni encabezados (# o ##), ni listas.\n' +
    '3. Destacados HTML: Utiliza etiquetas <strong>...</strong> exclusivamente para destacar las 4 cifras cuantitativas clave (potencia en kWp, producción estimada en kWh/año, ahorro en el primer año en € y plazo de amortización en años).\n' +
    '4. Sin saludos: NO utilices saludos iniciales como "Estimado...", ve directo al grano destacando la propuesta de valor y rentabilidad.\n';

  if (!isGenericName) {
    prompt += '5. Cliente: El titular de la propuesta es "' + nombreLimpio + '". Puedes mencionarlo con naturalidad y cortesía.\n';
  } else {
    prompt += '5. Cliente: No se ha indicado un nombre de cliente específico. ' +
      'BAJO NINGÚN CONCEPTO utilices la palabra "CLIENTE" ni "PROPIETARIO" en mayúsculas como si fuera un nombre propio. ' +
      'Refiérete al destinatario de forma natural (por ejemplo: "Para esta vivienda en ' + ciudad + '...", ' +
      '"Esta instalación fotovoltaica proyectada en ' + ciudad + '...", o "Para su inmueble en ' + ciudad + '...").\n';
  }

  prompt += '\nDATOS REALES DEL PROYECTO:\n' +
    '- Ubicación: ' + ciudad + '\n' +
    '- Módulos fotovoltaicos: ' + numPanels + ' paneles (' + kwp.toFixed(2) + ' kWp)\n' +
    '- Producción anual estimada: ' + Math.round(annualKWh).toLocaleString('es-ES') + ' kWh/año\n' +
    (ahorro > 0 ? ('- Ahorro económico año 1: ' + Math.round(ahorro).toLocaleString('es-ES') + ' €/año\n') : '') +
    (payback > 0 ? ('- Retorno de inversión (payback): ' + payback.toFixed(1) + ' años\n') : '') +
    (autoconsumo > 0 ? ('- Grado de autoconsumo: ' + Math.round(autoconsumo) + '%\n') : '');

  if (equipment && equipment.hasBat && equipment.batName) {
    prompt += '- Almacenamiento: Batería ' + equipment.batName + '\n';
  }
  if (equipment && equipment.invName) {
    prompt += '- Inversor solar: ' + equipment.invName + '\n';
  }

  var excKwhGemini = (m && m.excedenteKWh != null) ? m.excedenteKWh : Math.round(annualKWh * 0.35);
  if (excKwhGemini > 500) {
    prompt += '- Excedente exportable a Comunidad Energética Local (radio 5 km s/ RDL 7/2026): ' + Math.round(excKwhGemini).toLocaleString('es-ES') + ' kWh/año (monetizable a ~0,11 €/kWh sin límite de compensación de factura).\n';
  }

  var models = [];
  try {
    if (typeof discoverAvailableModels === 'function') {
      models = await discoverAvailableModels(apiKey);
    }
  } catch(e) {}
  if (!models || models.length === 0) {
    models = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-3.8-flash', 'gemini-3.5-flash'];
  }

  for (var mIdx = 0; mIdx < models.length; mIdx++) {
    var modelName = models[mIdx];
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + modelName + ':generateContent';
    try {
      var resp = await _aiFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.6,
            maxOutputTokens: 2500
          }
        })
      }, 30000, apiKey);

      if (!resp.ok) continue;
      var data = await resp.json().catch(function() { return null; });
      var candidate = data && data.candidates && data.candidates[0];
      if (candidate && candidate.content && Array.isArray(candidate.content.parts)) {
        var textParts = candidate.content.parts
          .filter(function(p) { return !p.thought && typeof p.text === 'string'; })
          .map(function(p) { return p.text; });
        var text = textParts.length > 0 ? textParts.join('') : (candidate.content.parts[0] && candidate.content.parts[0].text ? candidate.content.parts[0].text : '');

        if (text && text.trim()) {
          var cleanHtml = String(text.trim())
            .replace(/^```(?:html)?\s*/i, '')
            .replace(/\s*```$/i, '')
            .trim();
          // [AUD-2026 v2 · SEC2-01] Saneado oficial por allowlist. Fallback (solo entornos sin
          // RASanitize, p.ej. tests Node): saneado conservador que respeta el HTML legítimo.
          if (typeof window !== 'undefined' && window.RASanitize && typeof window.RASanitize.richText === 'function') {
            cleanHtml = window.RASanitize.richText(cleanHtml);
          } else {
            cleanHtml = String(cleanHtml)
              .replace(/<\s*(script|iframe|object|embed|style|link|meta|base|form)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
              .replace(/<\s*(script|iframe|object|embed|style|link|meta|base|form)[^>]*>/gi, '')
              .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
              .replace(/(href|src|action|formaction)\s*=\s*javascript:[^"'\s>]*/gi, '$1=');
          }
          if (cleanHtml) return cleanHtml;
        }
      }
    } catch(eLoop) {}
  }
  throw new Error('NO_RESPONSE');
}

function _mSvg(name, size, color, extraStyle) {
  if (typeof window !== 'undefined' && window.RA_SvgCatalog && typeof window.RA_SvgCatalog.mini === 'function') {
    return window.RA_SvgCatalog.mini(name, size || 14, color || 'currentColor', extraStyle || '');
  }
  return '<svg width="' + (size || 14) + '" height="' + (size || 14) + '" viewBox="0 0 24 24" fill="none" stroke="' + (color || 'currentColor') + '" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-0.18em;flex-shrink:0;' + (extraStyle || '') + '"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>';
}

async function enrichSummaryWithGemini(targetWindow, d, m, equipment) {
  // Si el usuario ya previsualizó o editó el resumen en el modal, respetarlo al 100%
  if (_customCommercialSummary && _customCommercialSummary.trim()) {
    try {
      var containerCustom = targetWindow.document.getElementById('ra-ai-summary-content');
      var badgeCustom = targetWindow.document.getElementById('ra-ai-summary-badge');
      if (containerCustom) containerCustom.innerHTML = (window.RASanitize && window.RASanitize.richText) ? window.RASanitize.richText(_customCommercialSummary) : _customCommercialSummary;
      if (badgeCustom) badgeCustom.innerHTML = _mSvg('sparkles', 12, 'currentColor', 'margin-right:4px;') + 'Resumen personalizado con IA · Google Gemini';
      if (targetWindow && typeof targetWindow.RA_runA4AutoFit === 'function') {
        setTimeout(targetWindow.RA_runA4AutoFit, 60);
      }
      return;
    } catch(eCustom) {}
  }

  // ── Buscar el contenedor del resumen en la ventana de oferta ──
  var container = null;
  try {
    container = targetWindow.document.getElementById('ra-ai-summary-content');
  } catch(e) { return; }
  if (!container) return;

  // ── Badge "Generando con IA..." ──
  var badge = null;
  try { badge = targetWindow.document.getElementById('ra-ai-summary-badge'); } catch(e) {}
  if (badge) badge.innerHTML = _mSvg('sparkles', 12, 'currentColor', 'margin-right:4px;') + '<em>Generando resumen con Gemini...</em>';

  try {
    var generatedText = await requestCommercialSummaryFromGemini(d, m, equipment);
    if (generatedText && generatedText.trim()) {
      // [AUD-2026 v2 · SEC2-01] Documentación: generatedText ya sale saneado de la fuente;
      // se re-aplica el allowlist como cinturón de tirantes (doble comprobación).
      container.innerHTML = (window.RASanitize && typeof window.RASanitize.richText === 'function')
        ? window.RASanitize.richText(generatedText)
        : String(generatedText).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      if (badge) badge.innerHTML = _mSvg('sparkles', 12, 'currentColor', 'margin-right:4px;') + 'Resumen generado con IA · Google Gemini';
      if (targetWindow && typeof targetWindow.RA_runA4AutoFit === 'function') {
        setTimeout(targetWindow.RA_runA4AutoFit, 60);
      }
    }
  } catch(err) {
    if (badge) badge.innerHTML = _mSvg('clipboard', 12, 'currentColor', 'margin-right:4px;') + 'Resumen del proyecto';
    if (window.RA_ErrorHandler && err.message !== 'NO_API_KEY') {
      window.RA_ErrorHandler.handleAsyncAPI(err, 'Gemini AI');
    }
  }
}


// ============================================================================
// SISTEMA DE PRECIOS Y MARGEN COMERCIAL (RAPricing)
// ============================================================================
// ═══════════════════════════════════════════════════════════════════════════════
// CÁLCULO ANALÍTICO DE PARTIDAS EÓLICAS LLAVE EN MANO (6 PARTIDAS IEC / CTE)
// ═══════════════════════════════════════════════════════════════════════════════
function computeWindTurbineCostBreakdown(turbines) {
  var list = Array.isArray(turbines) ? turbines.filter(function(t) {
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

  var totalKw = 0;
  var sumTurbineEq = 0;
  var sumMast = 0;
  var sumFoundation = 0;
  var sumElecInverter = 0;
  var sumElectricalInstall = 0;
  var sumEngCommissioning = 0;
  var sumConcreteM3 = 0;
  var sumHeights = 0;

  list.forEach(function(t) {
    var freshCat = (typeof window !== 'undefined' && window.RAWindCatalog && typeof window.RAWindCatalog.getById === 'function' && t.catalogId)
      ? window.RAWindCatalog.getById(t.catalogId)
      : null;
    var c = Object.assign({}, t._catalog || {}, freshCat || {});
    var pKw = c.ratedPowerW ? (c.ratedPowerW / 1000) : (t.ratedPowerKw || 5.0);
    var hubH = (t.supportStructure && t.supportStructure.hubHeightM) || 18;
    var mount = t.mountingType || 'ground';
    totalKw += pKw;
    sumHeights += hubH;

    // 1. Aerogenerador certificado (Precio unitario catálogo o ~1.450 €/kW)
    var costTurbine = (typeof c.priceEur === 'number' && c.priceEur > 0)
      ? c.priceEur
      : Math.round(pKw * 1450);
    sumTurbineEq += costTurbine;

    // 2. Mástil y estructura de sustentación (Rango base 2.000 - 5.000 € escalado según altura de buje)
    // Torre de 6-9m ~ 2.000-2.600 €; Torre de 18m ~ 3.500 €; Torre de 24-30m ~ 4.500-5.000 €
    var mastCost = Math.round(1600 + (hubH * 115) + (pKw * 45));
    mastCost = Math.max(1800, Math.min(6500, mastCost));
    sumMast += mastCost;

    // 3. Cimentación (Rango base 1.500 - 3.000 € vinculado a volumen de hormigón calculado o bancada)
    var concreteM3 = 0;
    if (typeof window !== 'undefined' && window.RAWind && window.RAWind.Structural && typeof window.RAWind.Structural.evaluateStructuralSafety === 'function') {
      try {
        var sRep = window.RAWind.Structural.evaluateStructuralSafety(t);
        if (sRep && sRep.foundation && typeof sRep.foundation.concreteVolumeM3 === 'number') {
          concreteM3 = sRep.foundation.concreteVolumeM3;
        }
      } catch(eStr) {}
    }
    if (!concreteM3) {
      // Estimación conservadora por zapata superficial si no se calculó aún: V ≈ 0.35 * (H/5)^1.2
      concreteM3 = Math.round(Math.max(1.8, Math.pow(hubH / 5.5, 1.35) * (pKw / 5)) * 10) / 10;
    }
    sumConcreteM3 += concreteM3;

    var foundationCost = 0;
    if (mount === 'rooftop') {
      // Bancada de reparto en cubierta + anclajes químicos a pilares
      foundationCost = Math.round(1500 + (pKw * 120));
      foundationCost = Math.max(1500, Math.min(3200, foundationCost));
    } else {
      // Zapata de hormigón armado HA-25: ~240 €/m³ (hormigón + excavación + ferralla B500S + encofrado) + pernos de anclaje
      foundationCost = Math.round(1200 + (concreteM3 * 250));
      foundationCost = Math.max(1500, Math.min(4500, foundationCost));
    }
    sumFoundation += foundationCost;

    // 4. Inversor y electrónica de potencia (1.500 - 3.000 €: inversor híbrido/eólico + rectificador + Dump Load)
    var invElecCost = Math.round(1350 + (pKw * 135));
    invElecCost = Math.max(1500, Math.min(3800, invElecCost));
    sumElecInverter += invElecCost;

    // 5. Instalación eléctrica e interconexión REBT (1.000 - 2.000 €: cableado libre de halógenos, SPD Tipo 1+2, diferencial clase B, picas)
    var elecInstallCost = Math.round(950 + (hubH * 22) + (pKw * 40));
    elecInstallCost = Math.max(1000, Math.min(2500, elecInstallCost));
    sumElectricalInstall += elecInstallCost;

    // 6. Ingeniería, montaje y puesta en marcha (2.000 - 4.000 €: visado colegial, dirección facultativa, grúa de izado, ensayo de parada y CIE)
    var engMontageCost = Math.round(1800 + (hubH * 65) + (pKw * 60));
    engMontageCost = Math.max(2000, Math.min(4800, engMontageCost));
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
if (typeof window !== 'undefined') {
  window.computeWindTurbineCostBreakdown = computeWindTurbineCostBreakdown;
}


var RAPricing = {
  STORAGE_KEY: 'ra_pricing_defaults',
  currentSessionPricing: null,

  getProjectFingerprint: function(forcedPanels) {
    var cfg = (typeof window !== 'undefined' && window.solarProjectConfig) ? window.solarProjectConfig : {};
    var nPan = (typeof forcedPanels === 'number' && forcedPanels > 0) ? forcedPanels : 0;
    if (!nPan && typeof window !== 'undefined' && Array.isArray(window.allRenderedPanels) && window.allRenderedPanels.length > 0) {
      nPan = window.allRenderedPanels.filter(function(p) { return p && !p.deleted && !p.disabled; }).length;
    }
    if (!nPan && typeof WP !== 'undefined' && WP && Array.isArray(WP.polylines)) {
      WP.polylines.forEach(function(p) {
        if (p && p.panelsDisabled === true) return;
        if (p && p.roofInfo && Array.isArray(p.roofInfo.panels)) {
          nPan += p.roofInfo.panels.filter(function(pan) { return !pan.deleted && !pan.disabled; }).length;
        }
      });
    }
    var invSizing = cfg.autoSizing && cfg.autoSizing.inverters;
    if (invSizing && !invSizing.isManual && typeof invSizing.autoCount === 'number' && invSizing.autoCount > 1 && invSizing.count < invSizing.autoCount) {
      invSizing.count = invSizing.autoCount;
    }
    var invCnt = (invSizing && invSizing.count) || 1;
    var batCnt = (cfg.autoSizing && cfg.autoSizing.batteries && cfg.autoSizing.batteries.count) || 0;
    var windSig = 'no_wind';
    if (typeof window !== 'undefined' && Array.isArray(window.windTurbines) && window.windTurbines.length > 0) {
      var enabledWts = window.windTurbines.filter(function(t) { return t && (!t.operationalState || t.operationalState.enabled !== false); });
      if (enabledWts.length > 0) {
        windSig = enabledWts.map(function(t) {
          var fc = (window.RAWindCatalog && typeof window.RAWindCatalog.getById === 'function' && t.catalogId) ? window.RAWindCatalog.getById(t.catalogId) : null;
          var pr = (fc && fc.priceEur) || (t._catalog && t._catalog.priceEur) || 0;
          var hh = (t.supportStructure && t.supportStructure.hubHeightM) || 18;
          return (t.catalogId || (t._catalog && t._catalog.model) || 'wt') + ':' + hh + ':' + pr;
        }).join(',');
      }
    }
    return [
      nPan || 0,
      cfg.selectedModuleId || 'mod',
      cfg.selectedInverterId || 'inv',
      invCnt,
      cfg.selectedBatteryId || 'bat',
      batCnt,
      cfg.selectedTopology || 'inverter',
      windSig
    ].join('|');
  },


  computeDesignCosts: function(forcedPanels) {
    // Guardia anti-recursión: computeDesignCosts -> modulesBreakdown -> getEffectivePricing -> getDefaults -> computeDesignCosts
    if (this._computingDesignCosts) {
      return this._lastDesignCosts || { panelPrice: 125, panelTotalCost: 0, estPrice: 0, invPrice: 0, invOnlyPrice: 0, mlpePrice: 0, batPrice: 0, cabPrice: 0, moPrice: 0, legPrice: 0, directCostTotal: 0 };
    }
    this._computingDesignCosts = true;
    try {
      var _res = this._computeDesignCostsImpl(forcedPanels);
      this._lastDesignCosts = _res;
      return _res;
    } finally {
      this._computingDesignCosts = false;
    }
  },

  _computeDesignCostsImpl: function(forcedPanels) {
    var cat = (typeof equipmentCatalog !== 'undefined' && equipmentCatalog) ? equipmentCatalog : ((typeof window !== 'undefined' && window.equipmentCatalog) ? window.equipmentCatalog : {});
    var cfg = (typeof window !== 'undefined' && window.solarProjectConfig) ? window.solarProjectConfig : {};
    var tree = (typeof BOMTreeEngine !== 'undefined' && typeof BOMTreeEngine.computeBOMTree === 'function')
      ? BOMTreeEngine.computeBOMTree()
      : null;

    var numPanels = (typeof forcedPanels === 'number')
      ? forcedPanels
      : ((tree && tree.summary && typeof tree.summary.totalPanels === 'number')
          ? tree.summary.totalPanels
          : ((typeof window !== 'undefined' && Array.isArray(window.allRenderedPanels) && window.allRenderedPanels.length > 0)
              ? window.allRenderedPanels.filter(function(p) { return p && !p.deleted && !p.disabled; }).length
              : (typeof cfg.lastEstimatedPanels === 'number' ? cfg.lastEstimatedPanels : 0)));

    // 1. Precio unitario real y coste total de módulos (con soporte Multi-Módulo)
    var mb = (typeof window !== 'undefined' && window.RAModulesBreakdown && typeof window.RAModulesBreakdown.getProjectModulesBreakdown === 'function')
      ? window.RAModulesBreakdown.getProjectModulesBreakdown()
      : null;
    var modObj = (cat.modules || []).find(function(m) { return m.id === cfg.selectedModuleId; }) || (cat.modules && cat.modules[0]) || null;
    var panelPrice = (modObj && modObj.price > 0) ? modObj.price : ((typeof panelConfig !== 'undefined' && panelConfig && panelConfig.precio > 0) ? panelConfig.precio : 125);
    var modWp = (modObj && (modObj.wp || modObj.potencia)) ? (modObj.wp || modObj.potencia) : ((typeof panelConfig !== 'undefined' && panelConfig && panelConfig.potencia) ? panelConfig.potencia : 450);
    var totalKwp = (mb && mb.totalKwp > 0) ? mb.totalKwp : ((numPanels * modWp) / 1000.0);
    var panelTotalCost = (mb && mb.totalPanelsCost > 0) ? Math.round(mb.totalPanelsCost) : Math.round(numPanels * panelPrice);
    if (mb && mb.isMultiModule && numPanels > 0 && mb.totalPanelsCost > 0) {
      panelPrice = Math.round((mb.totalPanelsCost / numPanels) * 100) / 100;
    }

    // 2. Estructura soporte desde BOM 3D real
    var estPrice = 0;
    if (tree && Array.isArray(tree.roofs) && tree.roofs.length > 0) {
      tree.roofs.forEach(function(r) {
        if (typeof r.subtotalEur === 'number' && r.subtotalEur > 0) estPrice += r.subtotalEur;
        else {
          if (r.structure && r.structure.costEur) estPrice += r.structure.costEur;
          if (r.clamps && r.clamps.costEur) estPrice += r.clamps.costEur;
        }
      });
    }
    // Detección de faldones tipo pérgola elevada
    var isAnyPergola = false;
    var pergolaClearance = 1.80;
    if (typeof WP !== 'undefined' && WP && Array.isArray(WP.polylines)) {
      WP.polylines.forEach(function(poly) {
        if (poly && (poly.structureType === 'pergola' || (poly.estructura && poly.estructura.tipo === 'pergola'))) {
          isAnyPergola = true;
          if (poly.estructura && typeof poly.estructura.clearance === 'number') {
            pergolaClearance = poly.estructura.clearance;
          }
        }
      });
    }

    if (estPrice <= 0) {
      if (isAnyPergola) {
        var basePergolaPerPanel = Math.round(130 + pergolaClearance * 45); // ~200-240 €/panel
        estPrice = Math.round(numPanels * basePergolaPerPanel);
      } else {
        estPrice = Math.round(numPanels * 55);
      }
    }

    // 3. Inversor / Microinversores / Optimizadores desde selección real (incluyendo Inversor Virtual y Multi-Inversor)
    var invOnlyPrice = 0;
    var mlpePrice = 0;
    if (cfg.selectedTopology === 'microinverter') {
      if (tree && tree.electrical && Array.isArray(tree.electrical.microinverters) && tree.electrical.microinverters.length > 0) {
        tree.electrical.microinverters.forEach(function(mi) { invOnlyPrice += (mi.totalPriceEur || 0); });
      } else {
        var miObj = (cat.microinverters || []).find(function(m) { return m.id === cfg.selectedMicroinverterId; }) || (cat.microinverters && cat.microinverters[0]) || { price: 175 };
        var miCnt = (cfg.autoSizing && cfg.autoSizing.microinverters && cfg.autoSizing.microinverters.count) || Math.ceil(numPanels / 2);
        invOnlyPrice = Math.round((miObj.price || 175) * Math.max(1, miCnt));
      }
    } else {
      if (tree && tree.electrical && Array.isArray(tree.electrical.inverters) && tree.electrical.inverters.length > 0) {
        tree.electrical.inverters.forEach(function(invItem) {
          invOnlyPrice += (invItem.totalPriceEur || 0);
        });
      } else {
        var invObj = (cat.inverters || []).find(function(i) { return i.id === cfg.selectedInverterId; }) || null;
        if (!invObj && cfg.lastVirtualInverter && cfg.lastVirtualInverter.id === cfg.selectedInverterId) {
          invObj = cfg.lastVirtualInverter;
        }
        if (!invObj && cat.inverters && cat.inverters.length > 0) invObj = cat.inverters[0];
        var invCnt = (cfg.autoSizing && cfg.autoSizing.inverters && cfg.autoSizing.inverters.count) || 1;
        var unitInvPrice = (invObj && invObj.price > 0) ? invObj.price : Math.round(650 + Math.max(5, totalKwp / invCnt) * 95);
        invOnlyPrice = Math.round(unitInvPrice * Math.max(1, invCnt));
      }
      if (tree && tree.electrical && tree.electrical.optimizers && tree.electrical.optimizers.totalCostEur > 0) {
        mlpePrice = Math.round(tree.electrical.optimizers.totalCostEur);
      }
    }
    var invPrice = invOnlyPrice + mlpePrice;

    // 4. Batería de Acumulación (con soporte Multi-Batería desde BOM)
    var batPrice = 0;
    if (tree && tree.electrical && Array.isArray(tree.electrical.batteries) && tree.electrical.batteries.length > 0) {
      tree.electrical.batteries.forEach(function(b) {
        batPrice += (b.totalPriceEur || 0);
      });
    } else if (cfg.selectedBatteryId && cfg.selectedBatteryId !== 'bat_none') {
      var batObj = (cat.batteries || []).find(function(b) { return b.id === cfg.selectedBatteryId; }) || null;
      if (batObj && batObj.price > 0 && (batObj.kwh || batObj.capacity || 0) > 0) {
        var batCnt = Math.max(1, (cfg.autoSizing && cfg.autoSizing.batteries && cfg.autoSizing.batteries.count) || 1);
        batPrice = Math.round(batObj.price * batCnt);
      }
    }

    // 5. Cableado, Conducciones, Cuadros DC/AC, Tierras y Pequeño Material desde metrado 3D / BOM
    var cabPrice = 0;
    var cablesOnlyPrice = 0;
    var protOnlyPrice = 0;
    if (tree && tree.electrical) {
      (tree.electrical.dcPanels || []).forEach(function(p) { protOnlyPrice += (p.price || 0) * (p.count || 1); });
      (tree.electrical.acPanels || []).forEach(function(p) { protOnlyPrice += (p.price || 0) * (p.count || 1); });
      (tree.electrical.cables || []).forEach(function(c) { cablesOnlyPrice += (c.totalEur || 0); });
      if (tree.electrical.mc4Jumpers && tree.electrical.mc4Jumpers.totalEur) cablesOnlyPrice += tree.electrical.mc4Jumpers.totalEur;
      (tree.electrical.grounding || []).forEach(function(g) { cablesOnlyPrice += (g.totalEur || 0); });
      if (tree.electrical.safetySignage && tree.electrical.safetySignage.totalEur) cablesOnlyPrice += tree.electrical.safetySignage.totalEur;
    }
    if (tree && Array.isArray(tree.laborAndSoftCosts)) {
      tree.laborAndSoftCosts.forEach(function(item) {
        if (item.category === 'small_materials') cablesOnlyPrice += (item.totalEur || 0);
      });
    }
    cabPrice = protOnlyPrice + cablesOnlyPrice;
    if (cabPrice <= 0) {
      protOnlyPrice = 540;
      cablesOnlyPrice = Math.round(numPanels * 18);
      cabPrice = protOnlyPrice + cablesOnlyPrice;
    }

    // 6. Mano de Obra, Montaje y Medios Auxiliares de Seguridad en Altura (escalado por paneles)
    var moPrice = 0;
    if (tree && Array.isArray(tree.laborAndSoftCosts) && tree.laborAndSoftCosts.length > 0) {
      tree.laborAndSoftCosts.forEach(function(item) {
        if (item.category === 'labor' || item.category === 'auxiliary') {
          moPrice += (item.totalEur || 0);
        }
      });
    }
    if (moPrice <= 0) {
      var instCosts = (typeof RAStructureCatalog !== 'undefined' && typeof RAStructureCatalog.getInstallationCosts === 'function')
        ? RAStructureCatalog.getInstallationCosts()
        : null;
      var lCfg = (instCosts && instCosts.labor) || { mechanicalHoursPerPanel: 0.85, electricalHoursPerPanel: 0.55, commissioningHoursFixed: 4.0, hourlyRate: 32.0 };
      var aCfg = (instCosts && instCosts.auxiliary) || { lifelineSafety: 280.0, scaffoldingLift: 350.0 };
      var totalHours = numPanels * ((lCfg.mechanicalHoursPerPanel || 0.85) + (lCfg.electricalHoursPerPanel || 0.55)) + (lCfg.commissioningHoursFixed || 4.0);
      var auxCost = (aCfg.lifelineSafety || 280) + (numPanels > 25 ? (aCfg.scaffoldingLift || 350) : Math.round((aCfg.scaffoldingLift || 350) * 0.6));
      moPrice = Math.round(totalHours * (lCfg.hourlyRate || 32.0) + auxCost);
    }

    // 7. Legalización, Proyecto de Ingeniería / MTD, Dirección de Obra y Boletín CIE (escalado por REBT ITC-BT-04)
    var legPrice = 0;
    var icioTaxEur = 0;
    if (tree && Array.isArray(tree.laborAndSoftCosts) && tree.laborAndSoftCosts.length > 0) {
      tree.laborAndSoftCosts.forEach(function(item) {
        if (item.category === 'engineering') {
          legPrice += (item.totalEur || 0);
        } else if (item.category === 'permits') {
          if (String(item.description || '').includes('ICIO')) {
            icioTaxEur += (item.totalEur || 0);
          } else {
            legPrice += (item.totalEur || 0);
          }
        }
      });
    }
    if (legPrice <= 0) {
      legPrice = totalKwp > 10 ? 1585 : 1085;
    }

    var pTot = Math.round(panelTotalCost);
    var eTot = Math.round(estPrice);
    var iTot = Math.round(invPrice);
    var bTot = Math.round(batPrice);
    var cTot = Math.round(cabPrice);
    var mTot = Math.round(moPrice);
    // 8. Partida Eólica Integral (6 partidas analíticas llave en mano)
    var windBreakdown = computeWindTurbineCostBreakdown((typeof window !== 'undefined' && window.windTurbines) || []);
    var windTot = windBreakdown.totalEur || 0;
    var windCount = windBreakdown.turbineCount || 0;
    var windKw = windBreakdown.totalKw || 0;
    var wTot = Math.round(windTot);
    var lTot = Math.round(legPrice);

    // Extraer contadores físicos del SSOT BOM para mostrar unidades montadas en cada partida
    var structBarsCount = 0, structFixingsCount = 0, structClampsCount = 0;
    if (tree && Array.isArray(tree.roofs)) {
      tree.roofs.forEach(function(r) {
        if (r && r.structure) {
          structBarsCount += (r.structure.standardBarsCount || 0);
          structFixingsCount += (r.structure.fixingsCount || 0);
        }
        if (r && r.clamps) {
          structClampsCount += ((r.clamps.midCount || 0) + (r.clamps.endCount || 0));
        }
      });
    }
    var dcPanelsCount = (tree && tree.electrical && Array.isArray(tree.electrical.dcPanels)) ? tree.electrical.dcPanels.reduce(function(acc, p) { return acc + (p.count || 1); }, 0) : 1;
    var acPanelsCount = (tree && tree.electrical && Array.isArray(tree.electrical.acPanels)) ? tree.electrical.acPanels.reduce(function(acc, p) { return acc + (p.count || 1); }, 0) : 1;
    var dcCableMeters = (tree && tree.electrical && Array.isArray(tree.electrical.cables) && tree.electrical.cables[0]) ? tree.electrical.cables[0].meters : 0;
    var acCableMeters = (tree && tree.electrical && Array.isArray(tree.electrical.cables) && tree.electrical.cables[1]) ? tree.electrical.cables[1].meters : 0;
    var earthRodsCount = (tree && tree.electrical && Array.isArray(tree.electrical.grounding) && tree.electrical.grounding[0]) ? tree.electrical.grounding[0].earthRods : 1;
    var optimizersCount = (tree && tree.electrical && tree.electrical.optimizers && tree.electrical.optimizers.count) ? tree.electrical.optimizers.count : 0;

    return {
      numPanels: numPanels,
      panelPrice: Math.round(panelPrice * 100) / 100,
      panelTotalCost: pTot,
      estPrice: eTot,
      isPergola: isAnyPergola,
      pergolaClearance: pergolaClearance,
      structBarsCount: structBarsCount,
      structFixingsCount: structFixingsCount,
      structClampsCount: structClampsCount,
      estDescription: isAnyPergola ? ('Pérgola elevada de aluminio/acero (H = ' + pergolaClearance.toFixed(2) + ' m)') : 'Estructura soporte y perfilería',
      invPrice: iTot,
      invOnlyPrice: Math.round(invOnlyPrice),
      mlpePrice: Math.round(mlpePrice),
      optimizersCount: optimizersCount,
      batPrice: bTot,
      cabPrice: cTot,
      cablesOnlyPrice: Math.round(cablesOnlyPrice),
      protOnlyPrice: Math.round(protOnlyPrice),
      dcPanelsCount: dcPanelsCount,
      acPanelsCount: acPanelsCount,
      dcCableMeters: dcCableMeters,
      acCableMeters: acCableMeters,
      earthRodsCount: earthRodsCount,
      moPrice: mTot,
      legPrice: lTot,
      icioTaxEur: Math.round(icioTaxEur),
      windPrice: wTot,
      windCount: windCount,
      windKw: Number(windKw.toFixed(1)),
      windBreakdown: windBreakdown,
      directCostTotal: pTot + eTot + iTot + bTot + cTot + mTot + lTot + wTot
    };
  },

  getDefaults: function() {
    var currentFp = this.getProjectFingerprint();
    if (this.currentSessionPricing) {
      // Si el usuario modificó manualmente los precios, blindar la persistencia activa: NUNCA auto-recalcular
      if (this.currentSessionPricing.isManualOverride) {
        return this.currentSessionPricing;
      }
      if (!this.currentSessionPricing.projectFingerprint || this.currentSessionPricing.projectFingerprint === currentFp) {
        return this.currentSessionPricing;
      }
      // El diseño del proyecto ha cambiado (distinto nº de módulos o equipos): invalidar caché de sesión anterior
      this.currentSessionPricing = null;
    }
    var designCosts = this.computeDesignCosts();
    var base = {
      panelPrice: designCosts.panelPrice,
      estPrice: null,
      invPrice: null,
      batPrice: null,
      cabPrice: null,
      moPrice: designCosts.moPrice,
      legPrice: designCosts.legPrice,
      windPrice: (typeof designCosts.windPrice === 'number') ? designCosts.windPrice : null,
      marginPct: 20,
      skipReview: false,
      isManualOverride: false
    };
    try {
      var saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved) {
        var parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          // Solo persistimos entre proyectos el % de margen comercial habitual y skipReview.
          // Jamás arrastramos importes a tanto alzado (estPrice, invPrice, moPrice, etc.) de un proyecto viejo a uno nuevo.
          if (typeof parsed.marginPct === 'number' && parsed.marginPct >= 0) base.marginPct = parsed.marginPct;
          base.skipReview = !!parsed.skipReview;
        }
      }
    } catch(e) {}
    return base;
  },

  saveDefaults: function(cfg) {
    var fp = this.getProjectFingerprint();
    var isManual = !!(cfg && (cfg.isManualOverride || cfg.isManualOverride === undefined));
    this.currentSessionPricing = Object.assign({}, cfg, { projectFingerprint: fp, isManualOverride: isManual });
    try {
      // Guardar en localStorage únicamente preferencias comerciales transversales (margen %), nunca partidas absolutas de otro proyecto
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify({
        marginPct: (cfg && typeof cfg.marginPct === 'number') ? cfg.marginPct : 20,
        skipReview: !!(cfg && cfg.skipReview)
      }));
    } catch(e) {}
  },

  resetToDesign: function() {
    this.currentSessionPricing = null;
    this._sessionCommercialConfig = null;
    try {
      var saved = localStorage.getItem(this.STORAGE_KEY);
      var mg = 20;
      if (saved) {
        var parsed = JSON.parse(saved);
        if (parsed && typeof parsed.marginPct === 'number') mg = parsed.marginPct;
      }
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify({ marginPct: mg, skipReview: false }));
    } catch (e) {}
    var fresh = this.computeDesignCosts();
    if (fresh) fresh.isManualOverride = false;
    return fresh;
  },


  COMMERCIAL_CONFIG_KEY: 'ra_commercial_custom_config',
  _sessionCommercialConfig: null,
  _defaultCommercialConfig: {
    hideMarginInClientDocs: true,
    showUnitPricesInClientDocs: true,
    discountEnabled: false,
    discountLabel: 'Descuento Especial Firma Rápida',
    discountType: 'percent', // 'percent' | 'fixed_eur'
    discountValue: 5,        // 5% o 500 €
    addons: [
      { id: 'smart_meter',    enabled: false, category: 'material', name: 'Vatímetro Inteligente (Smart Meter) + Toroidales de Medida', qty: 1, unitPrice: 220 },
      { id: 'crane_lift',     enabled: false, category: 'service',  name: 'Medios de Elevación / Camión Pluma con Cesta a Cubierta',  qty: 1, unitPrice: 480 },
      { id: 'extended_ac',    enabled: false, category: 'material', name: 'Tirada Extra de Acometida AC (>15m) en Tubo Libre Halógenos', qty: 1, unitPrice: 350 },
      { id: 'bat_protection', enabled: false, category: 'material', name: 'Armario Rack + Cuadro Seccionamiento y Fusibles DC Batería', qty: 1, unitPrice: 280 },
      { id: 'roof_sealing',   enabled: false, category: 'material', name: 'Kit Sellado Estanco Cubierta, Taco Químico y Juntas EPDM', qty: 1, unitPrice: 160 },
      { id: 'municipal_tax',  enabled: false, category: 'service',  name: 'Tramitación Licencia Urbanística y Tasa ICIO Municipal',  qty: 1, unitPrice: 450 },
      { id: 'ev_charger',     enabled: false, category: 'material', name: 'Cargador Vehículo Eléctrico Wallbox 7,4 kW + Protecciones', qty: 1, unitPrice: 890 },
      { id: 'bird_mesh',      enabled: false, category: 'material', name: 'Sistema Perimetral Antipájaros en Cubierta (Malla UV)',    qty: 1, unitPrice: 320 },
      { id: 'virtual_bat',    enabled: false, category: 'service',  name: 'Alta y Configuración de Batería Virtual (Hucha Solar)',     qty: 1, unitPrice: 95 },
      { id: 'lifeline',     enabled: false, category: 'material', name: 'Línea de Vida Homologada EN 795 en Cubierta',                qty: 1, unitPrice: 450 },
      { id: 'maint_annual', enabled: false, category: 'service',  name: 'Pack Mantenimiento Preventivo y Limpieza Anual (Año 1)',    qty: 1, unitPrice: 180 }
    ],
    customAddons: [],
    taxShield: {
      customerProfile: 'particular', // 'particular' | 'empresa'
      ivaRate: 0.21,                // 0.21 | 0.10 | 0.0
      irpfEnabled: true,
      irpfPct: 40,
      irpfMaxBaseEur: 7500,
      isRate: 0.25,                 // 0.25 | 0.23 | 0.15 | 0.0
      isAmortizacionLibre: true,
      ibiEnabled: true,
      ibiAnualEur: 600,
      ibiBonifPct: 50,
      ibiYears: 3,
      icioBonifPct: 95
    },
    financing: {
      mode: 'both',                 // 'both' (ambas) | 'cash' (solo contado) | 'financed' (solo financiado)
      downPaymentEur: 0,            // Entrada inicial en € directos
      loanTinPct: 5.95,             // TIN nominal anual (%)
      loanMonths: 120,              // Plazo en meses (ej. 60, 96, 120, 144)
      openingFeePct: 1.0,           // Comisión de apertura (%)
      feeFinanced: true,            // ¿Comisión de apertura financiada en el crédito o pagada al contado?
      graceMonths: 0,               // Meses de carencia inicial (0 a 3 meses)
      monthlyInsuranceEur: 0,       // Seguro de protección de pagos o mantenimiento añadido en cuota (€/mes)
      notaryEur: 0,                 // Gastos de formalización o notaría (€ directos)
      milestones: [
        { label: '1º Hito: Reserva e Ingeniería (a la firma)', pct: 20 },
        { label: '2º Hito: Acopio de Equipos e Inicio de Montaje', pct: 50 },
        { label: '3º Hito: Puesta en Marcha y Legalización CIE', pct: 30 }
      ]
    },
    showThreePackagesComparison: true,
    includeCEL: false,
    celPriceEur: 0.11,
    dossierMode: 'full',
    activeSlides: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  },

  getCommercialConfig: function() {
    var base = JSON.parse(JSON.stringify(this._defaultCommercialConfig));
    var stored = null;
    if (this._sessionCommercialConfig && typeof this._sessionCommercialConfig === 'object') {
      stored = this._sessionCommercialConfig;
    } else {
      try {
        var saved = localStorage.getItem(this.COMMERCIAL_CONFIG_KEY);
        if (saved) stored = JSON.parse(saved);
      } catch(e) {}
    }
    if (stored && typeof stored === 'object') {
      var merged = Object.assign({}, base, stored);
      // Merge seguro de addons: preserva los nuevos de catálogo sin perder estados previos del usuario
      if (Array.isArray(stored.addons)) {
        var finalAddons = [];
        var storedMap = {};
        stored.addons.forEach(function(a) { if (a && a.id) storedMap[a.id] = a; });
        base.addons.forEach(function(defAddon) {
          if (storedMap[defAddon.id]) {
            finalAddons.push(Object.assign({}, defAddon, storedMap[defAddon.id]));
          } else {
            finalAddons.push(defAddon);
          }
        });
        // Preservar cualquier addon custom previo que no esté en defaults
        stored.addons.forEach(function(a) {
          if (a && a.id && !finalAddons.some(function(fa) { return fa.id === a.id; })) {
            finalAddons.push(a);
          }
        });
        merged.addons = finalAddons;
      }
      return merged;
    }
    return base;
  },

  saveCommercialConfig: function(cfg) {
    this._sessionCommercialConfig = cfg ? JSON.parse(JSON.stringify(cfg)) : null;
    try {
      localStorage.setItem(this.COMMERCIAL_CONFIG_KEY, JSON.stringify(cfg));
    } catch(e) {}
  },

  computeAddonsTotal: function() {
    var cfg = this.getCommercialConfig();
    var all = (cfg.addons || []).concat(cfg.customAddons || []);
    var sum = 0;
    all.forEach(function(item) {
      if (item && item.enabled) {
        var q = Number(item.qty) || 1;
        var p = Number(item.unitPrice) || 0;
        sum += q * p;
      }
    });
    return sum;
  },

  computeThreePackages: function(m) {
    if (!m) return null;
    var baseDirect = m.directCost || 10000;
    var mgPct = (typeof m.marginPct === 'number') ? m.marginPct : 20;

    var ivaRate = (typeof m.ivaRate === 'number') ? m.ivaRate : 0.21;

    // Paquete 1: Esencial (Autoconsumo puro diurno, sin batería ni extras)
    var p1Direct = Math.round(baseDirect - (m.batCost || 0));
    var p1Subtotal = Math.round(p1Direct * (1 + mgPct / 100));
    var p1Capex = Math.round(p1Subtotal * (1 + ivaRate));
    var p1Ahorro = Math.round((m.ahorroLuzAnio1 || 1200) * (m.batCost > 0 ? 0.65 : 1.0));

    // Paquete 2: Óptimo Recomendado (Diseño 3D actual del usuario)
    var p2Capex = Math.round(m.capexBruto);
    var p2Ahorro = Math.round(m.ahorroLuzAnio1);

    // Paquete 3: Independencia Total (Batería de alta capacidad + cargador VE / extras)
    var batExtra = (m.batCost > 0) ? 2200 : 3800; // batería o ampliación
    var p3Direct = baseDirect + batExtra;
    var p3Subtotal = Math.round(p3Direct * (1 + mgPct / 100));
    var p3Capex = Math.round(p3Subtotal * (1 + ivaRate));
    var p3Ahorro = Math.round(p2Ahorro * 1.25);

    // [SSOT Metodológico] Coherencia en amortización: aplicar factor dinámico con deducción fiscal
    // proporcional a los tres paquetes para evitar asimetrías de cálculo frente al cliente.
    var p2PaybackNum = (typeof m.paybackYears === 'number' && isFinite(m.paybackYears) && m.paybackYears > 0) ? m.paybackYears : 4.5;
    var simpleRatioP2 = (p2Ahorro > 0 && p2Capex > 0) ? (p2Capex / p2Ahorro) : 6.0;
    var dynamicFactor = (simpleRatioP2 > 0) ? Math.min(1.0, p2PaybackNum / simpleRatioP2) : 0.75;
    var p1PaybackVal = Math.max(1.8, (p1Ahorro > 0 ? (p1Capex / p1Ahorro) * dynamicFactor : 4.0));
    var p3PaybackVal = Math.max(2.5, (p3Ahorro > 0 ? (p3Capex / p3Ahorro) * dynamicFactor : 5.0));
    var p1Payback = p1PaybackVal.toFixed(1);
    var p2Payback = p2PaybackNum.toFixed(1);
    var p3Payback = p3PaybackVal.toFixed(1);

    return {
      essential: {
        title: 'Plan Esencial (Ahorro Diurno)',
        capex: p1Capex,
        ahorroAnual: p1Ahorro,
        payback: p1Payback,
        autarquia: Math.round(Math.min(50, m.autarquiaPct || 45)),
        desc: 'Autoconsumo solar directo sin almacenamiento para máxima economía.'
      },
      optimal: {
        title: 'Plan Óptimo (Tu Diseño 3D)',
        capex: p2Capex,
        ahorroAnual: p2Ahorro,
        payback: p2Payback,
        autarquia: m.autarquiaPct || 70,
        desc: 'Equilibrio perfecto entre inversión, independencia y retorno garantizado.'
      },
      premium: {
        title: 'Plan Independencia Total',
        capex: p3Capex,
        ahorroAnual: p3Ahorro,
        payback: p3Payback,
        autarquia: Math.min(92, Math.max(82, (m.autarquiaPct || 70) + 18)),
        desc: 'Máxima acumulación LFP para no depender de la red eléctrica día y noche.'
      }
    };
  },

  getEffectivePricing: function() {
    return this.getDefaults();
  }
};
if (typeof window !== 'undefined') {
  window.RAPricing = RAPricing;
}

function wpUpdateStep5PricingBadge() {
  var pricing = RAPricing.getDefaults();
  var badge = document.getElementById('step5-pricing-badge');
  if (badge) {
    badge.textContent = 'MARGEN ' + pricing.marginPct + '% · ' + pricing.panelPrice + ' €/MÓD';
  }
}
window._selectedProposalFormat = window._selectedProposalFormat || 'landscape';
function wpSetProposalFormat(fmt) {
  window._selectedProposalFormat = fmt;
  var btnL = document.getElementById('step5-fmt-landscape');
  var btnP = document.getElementById('step5-fmt-portrait');
  var heroBtn = document.getElementById('step5-btn-download-commercial');
  var isL = (fmt === 'landscape');
  if (btnL && btnP) {
    btnL.style.background = isL ? 'rgba(16,185,129,0.22)' : 'transparent';
    btnL.style.borderColor = isL ? '#10B981' : 'transparent';
    btnL.style.color = isL ? '#34D399' : '#94a3b8';
    btnP.style.background = !isL ? 'rgba(14,165,233,0.22)' : 'transparent';
    btnP.style.borderColor = !isL ? '#0284c7' : 'transparent';
    btnP.style.color = !isL ? '#38BDF8' : '#94a3b8';
  }
  if (heroBtn) {
    heroBtn.innerHTML = isL
      ? '<i data-lucide="award" class="icon-sm"></i> <span>EMITIR DOSSIER EJECUTIVO (LANDSCAPE)</span>'
      : '<i data-lucide="file-text" class="icon-sm"></i> <span>EMITIR OFERTA BANCABLE (PORTRAIT)</span>';
    heroBtn.style.background = isL
      ? 'linear-gradient(135deg, #10B981, #059669)'
      : 'linear-gradient(135deg, #0284c7, #0369a1)';
    heroBtn.style.boxShadow = isL
      ? '0 4px 15px rgba(16,185,129,0.35)'
      : '0 4px 15px rgba(2,132,199,0.35)';
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      try { window.lucide.createIcons(); } catch(e) {}
    }
  }
}
function wpDownloadSelectedProposal() {
  if (window._selectedProposalFormat === 'portrait') {
    if (typeof generatePropuestaComercialPDF === 'function') generatePropuestaComercialPDF(true);
  } else {
    if (window.CommercialProposalDossier && typeof window.CommercialProposalDossier.generate === 'function') {
      window.CommercialProposalDossier.generate();
    } else if (typeof generatePropuestaComercialPDF === 'function') {
      generatePropuestaComercialPDF(true);
    }
  }
}
if (typeof window !== 'undefined') {
  window.wpUpdateStep5PricingBadge = wpUpdateStep5PricingBadge;
  window.wpSetProposalFormat = wpSetProposalFormat;
  window.wpDownloadSelectedProposal = wpDownloadSelectedProposal;
}

function wpOpenPricingReviewModal(onConfirm) {
  // Sincronización proactiva: asegurar que el dimensionamiento óptimo de ingeniería esté al día con la red y catálogo
  if (typeof wpAutoSelectOptimalEngineering === 'function' && window.solarProjectConfig && !window.solarProjectConfig.userManuallySelectedInverter) {
    try { wpAutoSelectOptimalEngineering(false); } catch(eOpt) {}
  }
  var pModal = document.getElementById('ra-pricing-review-modal');
  if (!pModal) {
    var modalHtml = '<div id="ra-pricing-review-modal" role="dialog" aria-modal="true" style="display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(226,232,240,0.72);backdrop-filter:blur(8px);z-index:999999;align-items:center;justify-content:center;padding:16px;">' +
      '<div style="background:#e7eaee;border:1px solid #dfe3e8;border-radius:14px;width:860px;max-width:96vw;max-height:92vh;display:flex;flex-direction:column;box-shadow:0 24px 48px -12px rgba(30,36,43,0.22),0 4px 14px rgba(30,36,43,0.08);overflow:hidden;color:#382a21;font-family:Inter,system-ui,sans-serif;">' +
        '<div style="padding:14px 20px;background:#f3f5f8;border-bottom:1px solid #dfe3e8;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">' +
          '<div style="display:flex;align-items:center;gap:10px;">' +
            '<span style="display:inline-flex;align-items:center;color:#e8a204;">' + _mSvg('tag', 20, '#e8a204') + '</span>' +
            '<div>' +
              '<div style="font-weight:900;font-size:13px;color:#382a21;letter-spacing:0.5px;">REVISIÓN DE PRECIOS &amp; PRESUPUESTO FINAL</div>' +
              '<div id="pricing-modal-subtitle" style="font-size: 10px;color:#57606a;">Verifica o ajusta los importes de cada partida antes de emitir la entrega final</div>' +
            '</div>' +
          '</div>' +
          '<button type="button" id="btn-close-pricing-review" style="background:#ebedf0;border:1px solid #dfe3e8;border-radius:6px;color:#57606a;font-size:18px;cursor:pointer;padding:4px 8px;display:inline-flex;align-items:center;">' + _mSvg('close', 18, '#57606a') + '</button>' +
        '</div>' +
        '<div style="padding:16px 20px;display:flex;flex-direction:column;gap:12px;overflow-y:auto;">' +
          '<div style="background:#f3f5f8;border:1px solid #dfe3e8;border-radius:10px;padding:8px 12px;display:flex;justify-content:space-between;align-items:center;font-size:10px;box-shadow:0 2px 6px rgba(30,36,43,0.04);">' +
            '<div style="display:flex;align-items:center;gap:6px;color:#e8a204;font-weight:800;">' +
              '<span style="display:inline-flex;">' + _mSvg('bolt', 13, '#e8a204') + '</span>' +
              '<span id="pricing-modal-project-info">Proyecto: 0 paneles (0.00 kWp)</span>' +
            '</div>' +
            '<div id="pricing-modal-equip-info" style="color:#57606a;font-size: 10px;text-align:right;">Inversor / Batería</div>' +
          '</div>' +

          '<!-- SECCIÓN 1: DATOS DE FACTURACIÓN DEL CLIENTE -->' +
          '<div style="background:#f3f5f8;border:1px solid #dfe3e8;border-radius:10px;padding:11px 12px;display:flex;flex-direction:column;gap:8px;box-shadow:0 2px 6px rgba(30,36,43,0.04);">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;">' +
              '<div style="display:flex;align-items:center;gap:6px;">' +
                '<span style="display:inline-flex;">' + _mSvg('user', 13, '#e8a204') + '</span>' +
                '<span style="font-size:10.5px;font-weight:900;color:#e8a204;text-transform:uppercase;letter-spacing:0.5px;">Datos de Facturación del Cliente</span>' +
                '<span id="pricing-bill-sync-badge" style="font-size:9px;font-weight:800;padding:1px 6px;border-radius:4px;background:#ebedf0;color:#57606a;border:1px solid #dfe3e8;">Manual</span>' +
              '</div>' +
              '<div style="display:flex;align-items:center;gap:6px;">' +
                '<button type="button" id="btn-pricing-sync-bill" style="display:none;background:rgba(5,150,105,0.12);border:1px solid rgba(5,150,105,0.4);color:#059669;font-size:9px;font-weight:800;padding:2px 7px;border-radius:4px;cursor:pointer;">↻ Traer de Factura</button>' +
                '<span style="font-size:9.5px;color:#57606a;">Verifica los datos fiscales antes de emitir</span>' +
              '</div>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:1.5fr 1fr 1fr;gap:8px;">' +
              '<div>' +
                '<label style="display:block;font-size:9px;color:#57606a;font-weight:700;margin-bottom:2px;">Titular / Razón Social</label>' +
                '<input type="text" id="pricing-cust-nombre" placeholder="Nombre o Empresa" style="width:100%;box-sizing:border-box;padding:4px 7px;background:#ffffff;border:1px solid #dfe3e8;border-radius:5px;color:#382a21;font-size:10.5px;font-weight:700;">' +
              '</div>' +
              '<div>' +
                '<label style="display:block;font-size:9px;color:#57606a;font-weight:700;margin-bottom:2px;">NIF / CIF</label>' +
                '<input type="text" id="pricing-cust-nif" placeholder="00000000X" style="width:100%;box-sizing:border-box;padding:4px 7px;background:#ffffff;border:1px solid #dfe3e8;border-radius:5px;color:#382a21;font-size:10.5px;font-weight:700;">' +
              '</div>' +
              '<div>' +
                '<label style="display:block;font-size:9px;color:#57606a;font-weight:700;margin-bottom:2px;">Teléfono</label>' +
                '<input type="text" id="pricing-cust-tel" placeholder="+34 600..." style="width:100%;box-sizing:border-box;padding:4px 7px;background:#ffffff;border:1px solid #dfe3e8;border-radius:5px;color:#382a21;font-size:10.5px;">' +
              '</div>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:1.5fr 1fr 1fr;gap:8px;">' +
              '<div>' +
                '<label style="display:block;font-size:9px;color:#57606a;font-weight:700;margin-bottom:2px;">Email de Contacto</label>' +
                '<input type="email" id="pricing-cust-email" placeholder="cliente@correo.com" style="width:100%;box-sizing:border-box;padding:4px 7px;background:#ffffff;border:1px solid #dfe3e8;border-radius:5px;color:#382a21;font-size:10.5px;">' +
              '</div>' +
              '<div style="grid-column: span 2;">' +
                '<label style="display:block;font-size:9px;color:#57606a;font-weight:700;margin-bottom:2px;">Dirección de Instalación / Fiscal</label>' +
                '<input type="text" id="pricing-cust-dir" placeholder="Calle, número, polígono..." style="width:100%;box-sizing:border-box;padding:4px 7px;background:#ffffff;border:1px solid #dfe3e8;border-radius:5px;color:#382a21;font-size:10.5px;">' +
              '</div>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:1.2fr 1fr 0.8fr;gap:8px;">' +
              '<div>' +
                '<label style="display:block;font-size:9px;color:#57606a;font-weight:700;margin-bottom:2px;">Municipio</label>' +
                '<input type="text" id="pricing-cust-mun" placeholder="Municipio" style="width:100%;box-sizing:border-box;padding:4px 7px;background:#ffffff;border:1px solid #dfe3e8;border-radius:5px;color:#382a21;font-size:10.5px;">' +
              '</div>' +
              '<div>' +
                '<label style="display:block;font-size:9px;color:#57606a;font-weight:700;margin-bottom:2px;">Provincia</label>' +
                '<input type="text" id="pricing-cust-prov" placeholder="Provincia" style="width:100%;box-sizing:border-box;padding:4px 7px;background:#ffffff;border:1px solid #dfe3e8;border-radius:5px;color:#382a21;font-size:10.5px;">' +
              '</div>' +
              '<div>' +
                '<label style="display:block;font-size:9px;color:#57606a;font-weight:700;margin-bottom:2px;">Código Postal</label>' +
                '<input type="text" id="pricing-cust-cp" placeholder="28001" style="width:100%;box-sizing:border-box;padding:4px 7px;background:#ffffff;border:1px solid #dfe3e8;border-radius:5px;color:#382a21;font-size:10.5px;">' +
              '</div>' +
            '</div>' +
          '</div>' +

          '<!-- SECCIÓN 2: DATOS DE CONSUMO ELÉCTRICO Y SUMINISTRO (CLAVE DE RENTABILIDAD) -->' +
          '<div style="background:#f3f5f8;border:1px solid #dfe3e8;border-radius:10px;padding:11px 12px;display:flex;flex-direction:column;gap:8px;box-shadow:0 2px 6px rgba(30,36,43,0.04);">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;">' +
              '<div style="display:flex;align-items:center;gap:6px;">' +
                '<span style="display:inline-flex;">' + _mSvg('chart', 13, '#e8a204') + '</span>' +
                '<span style="font-size:10.5px;font-weight:900;color:#e8a204;text-transform:uppercase;letter-spacing:0.5px;">Consumo &amp; Parámetros Eléctricos del Cliente</span>' +
              '</div>' +
              '<span style="font-size:9.5px;color:#57606a;">Condicionan el ahorro anual, retorno y amortización</span>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:8px;">' +
              '<div>' +
                '<label style="display:block;font-size:9px;color:#57606a;font-weight:700;margin-bottom:2px;">Consumo Anual Total</label>' +
                '<div style="display:flex;align-items:center;gap:4px;">' +
                  '<input type="number" id="pricing-cust-consumo" min="100" max="1000000" step="50" style="width:100%;box-sizing:border-box;padding:4px 7px;background:#ffffff;border:1px solid #e8a204;border-radius:5px;color:#e8a204;font-size:11px;font-weight:800;text-align:right;">' +
                  '<span style="font-size:10px;color:#57606a;white-space:nowrap;">kWh/año</span>' +
                '</div>' +
              '</div>' +
              '<div>' +
                '<label style="display:block;font-size:9px;color:#57606a;font-weight:700;margin-bottom:2px;">Potencia Contratada</label>' +
                '<div style="display:flex;align-items:center;gap:4px;">' +
                  '<input type="number" id="pricing-cust-potcontr" min="0.5" max="500" step="0.25" style="width:100%;box-sizing:border-box;padding:4px 7px;background:#ffffff;border:1px solid #dfe3e8;border-radius:5px;color:#382a21;font-size:11px;font-weight:700;text-align:right;">' +
                  '<span style="font-size:10px;color:#57606a;white-space:nowrap;">kW</span>' +
                '</div>' +
              '</div>' +
              '<div>' +
                '<label style="display:block;font-size:9px;color:#57606a;font-weight:700;margin-bottom:2px;">Precio Medio Red</label>' +
                '<div style="display:flex;align-items:center;gap:4px;">' +
                  '<input type="number" id="pricing-cust-precio-kwh" min="0.05" max="1.0" step="0.01" style="width:100%;box-sizing:border-box;padding:4px 7px;background:#ffffff;border:1px solid #dfe3e8;border-radius:5px;color:#382a21;font-size:11px;font-weight:700;text-align:right;">' +
                  '<span style="font-size:10px;color:#57606a;white-space:nowrap;">€/kWh</span>' +
                '</div>' +
              '</div>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:1.8fr 1.2fr;gap:8px;">' +
              '<div>' +
                '<label style="display:block;font-size:9px;color:#57606a;font-weight:700;margin-bottom:2px;">Código CUPS de Suministro</label>' +
                '<input type="text" id="pricing-cust-cups" placeholder="ES0021..." style="width:100%;box-sizing:border-box;padding:4px 7px;background:#ffffff;border:1px solid #dfe3e8;border-radius:5px;color:#382a21;font-size:10.5px;font-family:monospace;font-weight:700;">' +
              '</div>' +
              '<div>' +
                '<label style="display:block;font-size:9px;color:#57606a;font-weight:700;margin-bottom:2px;">Distribuidora Eléctrica</label>' +
                '<select id="pricing-cust-dist" style="width:100%;box-sizing:border-box;padding:4px 6px;background:#ffffff;border:1px solid #dfe3e8;border-radius:5px;color:#382a21;font-size:10px;">' +
                  '<option value="e-distribución (Endesa)">e-distribución (Endesa)</option>' +
                  '<option value="Iberdrola Distribución">Iberdrola Distribución</option>' +
                  '<option value="UFD (Naturgy)">UFD (Naturgy)</option>' +
                  '<option value="Viesgo Distribución">Viesgo Distribución</option>' +
                  '<option value="EDP Distribución">EDP Distribución</option>' +
                  '<option value="Otra distribuidora">Otra distribuidora</option>' +
                '</select>' +
              '</div>' +
            '</div>' +
          '</div>' +

          '<!-- SECCIÓN 3: COMUNIDAD ENERGÉTICA LOCAL (CEL · RDL 7/2026) -->' +
          '<div style="background:#f3f5f8;border:1px solid rgba(5,150,105,0.3);border-radius:10px;padding:11px 12px;display:flex;flex-direction:column;gap:8px;box-shadow:0 2px 6px rgba(30,36,43,0.04);">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;">' +
              '<div style="display:flex;align-items:center;gap:6px;">' +
                '<span style="display:inline-flex;">' + _mSvg('globe', 13, '#059669') + '</span>' +
                '<span style="font-size:10.5px;font-weight:900;color:#059669;text-transform:uppercase;letter-spacing:0.5px;">Comunidad Energética Local (RDL 7/2026 · 5 km)</span>' +
              '</div>' +
              '<label style="display:flex;align-items:center;gap:6px;font-size:10px;color:#382a21;cursor:pointer;">' +
                '<input type="checkbox" id="pricing-check-cel-enabled" checked style="accent-color:#059669;">' +
                '<b>Incluir página CEL en propuesta</b>' +
              '</label>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:8px;align-items:center;">' +
              '<div>' +
                '<label style="display:block;font-size:9px;color:#57606a;font-weight:700;margin-bottom:2px;">Precio Venta Excedente CEL</label>' +
                '<div style="display:flex;align-items:center;gap:4px;">' +
                  '<input type="number" id="pricing-input-cel-price" min="0.05" max="0.30" step="0.005" value="0.11" style="width:100%;box-sizing:border-box;padding:4px 7px;background:#ffffff;border:1px solid #059669;border-radius:5px;color:#059669;font-size:11px;font-weight:800;text-align:right;">' +
                  '<span style="font-size:10px;color:#57606a;white-space:nowrap;">€/kWh</span>' +
                '</div>' +
              '</div>' +
              '<div>' +
                '<label style="display:block;font-size:9px;color:#57606a;font-weight:700;margin-bottom:2px;">Radio Legal de Cobertura</label>' +
                '<div style="font-size:11px;font-weight:800;color:#382a21;padding:4px 0;">5.000 m (78,5 km²)</div>' +
              '</div>' +
              '<div>' +
                '<label style="display:block;font-size:9px;color:#57606a;font-weight:700;margin-bottom:2px;">Ingreso Extra Estimado</label>' +
                '<div id="pricing-cel-preview-extra" style="font-size:11px;font-weight:900;color:#059669;padding:4px 0;">+0 €/año</div>' +
              '</div>' +
            '</div>' +
            '<div style="font-size:9px;color:#57606a;line-height:1.35;border-top:1px solid #dfe3e8;padding-top:6px;display:flex;justify-content:space-between;">' +
              '<span>Marco: <b>RDL 7/2026</b> · Reparto dinámico horario <b>βh</b> (Orden TED/1247/2021) sin tope mensual a 0 €.</span>' +
              '<span id="pricing-cel-preview-status" style="color:#059669;font-weight:700;">CEL-Ready</span>' +
            '</div>' +
          '</div>' +

          '<div style="background:#f3f5f8;border:1px solid #dfe3e8;border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:9px;box-shadow:0 2px 6px rgba(30,36,43,0.04);">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;">' +
              '<div style="font-size:10px;font-weight:900;color:#57606a;text-transform:uppercase;letter-spacing:0.5px;">' +
                'Partidas de Coste Directo (Instalación Llave en Mano)' +
              '</div>' +
              '<div style="display:flex;align-items:center;gap:6px;">' +
                '<button type="button" id="btn-ai-survey-pricing" style="padding:3px 8px;background:rgba(124,58,237,0.1);border:1px solid rgba(124,58,237,0.35);border-radius:5px;color:#7c3aed;font-size:9.5px;font-weight:800;cursor:pointer;display:flex;align-items:center;gap:4px;" title="Consultar a Google Gemini los precios actuales de mercado en España para estos equipos">' + _mSvg('sparkles', 12, '#7c3aed') + ' Sondeo Precios (IA Gemini)</button>' +
                '<button type="button" id="btn-reset-pricing-to-design" style="padding:3px 8px;background:rgba(232, 162, 4,0.1);border:1px solid rgba(232, 162, 4,0.35);border-radius:5px;color:#e8a204;font-size:9.5px;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;gap:4px;" title="Recalcular todas las partidas automáticamente a partir del diseño 3D y equipos seleccionados">' + _mSvg('refresh', 12, '#e8a204') + ' Recalcular según diseño</button>' +
              '</div>' +
            '</div>' +
            '<div id="pricing-ai-survey-banner" style="display:none;background:rgba(124,58,237,0.08);border:1px solid rgba(124,58,237,0.3);border-radius:6px;padding:8px 10px;font-size:10px;color:#382a21;line-height:1.4;">' +
              '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">' +
                '<span style="font-weight:800;color:#7c3aed;display:inline-flex;align-items:center;gap:4px;">' + _mSvg('sparkles', 12, '#7c3aed') + ' SONDEO DE MERCADO IA (GOOGLE GEMINI)</span>' +
                '<button type="button" id="btn-apply-ai-pricing" style="padding:2px 8px;background:#7c3aed;color:#fff;border:none;border-radius:4px;font-size:9.5px;font-weight:800;cursor:pointer;display:none;">Aplicar Precios Sugeridos</button>' +
              '</div>' +
              '<div id="pricing-ai-survey-text">Consultando tarifas mayoristas y de instalador en España...</div>' +
            '</div>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0 6px 0;border-bottom:1px solid #dfe3e8;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.5px;color:#57606a;">' +
              '<div style="flex:1;min-width:0;">Partida</div>' +
              '<div style="display:flex;align-items:center;gap:12px;flex-shrink:0;">' +
                '<div style="width:185px;text-align:right;">Coste Directo</div>' +
                '<div id="pricing-col-margin-header" style="width:105px;text-align:right;color:#059669;">P.V.P. (+20%)</div>' +
              '</div>' +
            '</div>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid #dfe3e8;">' +
              '<div style="flex:1;min-width:0;padding-right:10px;">' +
                '<div style="font-size:11px;font-weight:800;color:#382a21;display:flex;align-items:center;gap:5px;"><span style="display:inline-flex;color:#e8a204;">' + _mSvg('gridPanel', 13, '#e8a204') + '</span> <span id="pricing-title-panels">Módulos Fotovoltaicos Tier-1</span></div>' +
                '<div id="pricing-subtext-panels" style="font-size: 10px;color:#57606a;">0 módulos en cubierta</div>' +
              '</div>' +
              '<div style="display:flex;align-items:center;gap:12px;flex-shrink:0;">' +
                '<div style="display:flex;align-items:center;justify-content:flex-end;gap:6px;width:185px;">' +
                  '<div style="display:flex;align-items:center;gap:4px;">' +
                    '<input type="number" id="pricing-input-panel-price" min="40" max="1000" step="1" style="width:70px;padding:4px 6px;background:#ffffff;border:1px solid #dfe3e8;border-radius:6px;color:#382a21;font-size:11px;font-weight:700;text-align:right;">' +
                    '<span style="font-size:10px;color:#57606a;">€/ud</span>' +
                  '</div>' +
                  '<span id="pricing-row-panel-subtotal" style="font-size:11px;font-weight:800;color:#e8a204;min-width:60px;text-align:right;">0 €</span>' +
                '</div>' +
                '<div style="width:105px;text-align:right;">' +
                  '<span id="pricing-row-panel-pvp" style="font-size:11.5px;font-weight:900;color:#059669;">0 €</span>' +
                '</div>' +
              '</div>' +
            '</div>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid #dfe3e8;">' +
              '<div style="flex:1;min-width:0;padding-right:10px;">' +
                '<div style="font-size:11px;font-weight:800;color:#382a21;display:flex;align-items:center;gap:5px;"><span style="display:inline-flex;color:#57606a;">' + _mSvg('wrench', 13, '#57606a') + '</span> Estructura Soporte &amp; Perfilería</div>' +
                '<div id="pricing-subtext-est" style="font-size: 10px;color:#57606a;">Perfilería continua de aluminio y fijaciones A2</div>' +
              '</div>' +
              '<div style="display:flex;align-items:center;gap:12px;flex-shrink:0;">' +
                '<div style="display:flex;align-items:center;justify-content:flex-end;gap:4px;width:185px;">' +
                  '<input type="number" id="pricing-input-est-price" min="0" max="50000" step="25" style="width:90px;padding:4px 6px;background:#ffffff;border:1px solid #dfe3e8;border-radius:6px;color:#382a21;font-size:11px;font-weight:700;text-align:right;">' +
                  '<span style="font-size:10px;color:#57606a;">€</span>' +
                '</div>' +
                '<div style="width:105px;text-align:right;">' +
                  '<span id="pricing-row-est-pvp" style="font-size:11.5px;font-weight:900;color:#059669;">0 €</span>' +
                '</div>' +
              '</div>' +
            '</div>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid #dfe3e8;">' +
              '<div style="flex:1;min-width:0;padding-right:10px;">' +
                '<div style="font-size:11px;font-weight:800;color:#382a21;display:flex;align-items:center;gap:5px;"><span style="display:inline-flex;color:#d97706;">' + _mSvg('bolt', 13, '#d97706') + '</span> Inversor / Microinversores</div>' +
                '<div id="pricing-subtext-inv" style="font-size: 10px;color:#57606a;">Sistema de conversión eléctrica y monitorización</div>' +
              '</div>' +
              '<div style="display:flex;align-items:center;gap:12px;flex-shrink:0;">' +
                '<div style="display:flex;align-items:center;justify-content:flex-end;gap:4px;width:185px;">' +
                  '<input type="number" id="pricing-input-inv-price" min="0" max="50000" step="50" style="width:90px;padding:4px 6px;background:#ffffff;border:1px solid #dfe3e8;border-radius:6px;color:#382a21;font-size:11px;font-weight:700;text-align:right;">' +
                  '<span style="font-size:10px;color:#57606a;">€</span>' +
                '</div>' +
                '<div style="width:105px;text-align:right;">' +
                  '<span id="pricing-row-inv-pvp" style="font-size:11.5px;font-weight:900;color:#059669;">0 €</span>' +
                '</div>' +
              '</div>' +
            '</div>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid #dfe3e8;">' +
              '<div style="flex:1;min-width:0;padding-right:10px;">' +
                '<div style="font-size:11px;font-weight:800;color:#382a21;display:flex;align-items:center;gap:5px;"><span style="display:inline-flex;color:#059669;">' + _mSvg('battery', 13, '#059669') + '</span> Batería de Acumulación (LiFePO4)</div>' +
                '<div id="pricing-subtext-bat" style="font-size: 10px;color:#57606a;">Almacenamiento modular (0 € si no aplica)</div>' +
              '</div>' +
              '<div style="display:flex;align-items:center;gap:12px;flex-shrink:0;">' +
                '<div style="display:flex;align-items:center;justify-content:flex-end;gap:4px;width:185px;">' +
                  '<input type="number" id="pricing-input-bat-price" min="0" max="50000" step="50" style="width:90px;padding:4px 6px;background:#ffffff;border:1px solid #dfe3e8;border-radius:6px;color:#382a21;font-size:11px;font-weight:700;text-align:right;">' +
                  '<span style="font-size:10px;color:#57606a;">€</span>' +
                '</div>' +
                '<div style="width:105px;text-align:right;">' +
                  '<span id="pricing-row-bat-pvp" style="font-size:11.5px;font-weight:900;color:#059669;">0 €</span>' +
                '</div>' +
              '</div>' +
            '</div>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid #dfe3e8;">' +
              '<div style="flex:1;min-width:0;padding-right:10px;">' +
                '<div style="font-size:11px;font-weight:800;color:#382a21;display:flex;align-items:center;gap:5px;"><span style="display:inline-flex;color:#e8a204;">' + _mSvg('plug', 13, '#e8a204') + '</span> Cableado, Conducciones &amp; Cuadros</div>' +
                '<div id="pricing-subtext-cab" style="font-size: 10px;color:#57606a;">Líneas solares ZZ-F, cuadro DC/AC, protecciones SPD y tierras</div>' +
              '</div>' +
              '<div style="display:flex;align-items:center;gap:12px;flex-shrink:0;">' +
                '<div style="display:flex;align-items:center;justify-content:flex-end;gap:4px;width:185px;">' +
                  '<input type="number" id="pricing-input-cab-price" min="0" max="25000" step="25" style="width:90px;padding:4px 6px;background:#ffffff;border:1px solid #dfe3e8;border-radius:6px;color:#382a21;font-size:11px;font-weight:700;text-align:right;">' +
                  '<span style="font-size:10px;color:#57606a;">€</span>' +
                '</div>' +
                '<div style="width:105px;text-align:right;">' +
                  '<span id="pricing-row-cab-pvp" style="font-size:11.5px;font-weight:900;color:#059669;">0 €</span>' +
                '</div>' +
              '</div>' +
            '</div>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid #dfe3e8;">' +
              '<div style="flex:1;min-width:0;padding-right:10px;">' +
                '<div style="font-size:11px;font-weight:800;color:#382a21;display:flex;align-items:center;gap:5px;"><span style="display:inline-flex;color:#d97706;">' + _mSvg('hardHat', 13, '#d97706') + '</span> Mano de Obra &amp; Montaje</div>' +
                '<div id="pricing-subtext-mo" style="font-size: 10px;color:#57606a;">Instalación completa, seguridad en altura y puesta en marcha</div>' +
              '</div>' +
              '<div style="display:flex;align-items:center;gap:12px;flex-shrink:0;">' +
                '<div style="display:flex;align-items:center;justify-content:flex-end;gap:4px;width:185px;">' +
                  '<input type="number" id="pricing-input-mo-price" min="0" max="30000" step="50" style="width:90px;padding:4px 6px;background:#ffffff;border:1px solid #dfe3e8;border-radius:6px;color:#382a21;font-size:11px;font-weight:700;text-align:right;">' +
                  '<span style="font-size:10px;color:#57606a;">€</span>' +
                '</div>' +
                '<div style="width:105px;text-align:right;">' +
                  '<span id="pricing-row-mo-pvp" style="font-size:11.5px;font-weight:900;color:#059669;">0 €</span>' +
                '</div>' +
              '</div>' +
            '</div>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;">' +
              '<div style="flex:1;min-width:0;padding-right:10px;">' +
                '<div style="font-size:11px;font-weight:800;color:#382a21;display:flex;align-items:center;gap:5px;"><span style="display:inline-flex;color:#7c3aed;">' + _mSvg('fileText', 13, '#7c3aed') + '</span> Legalización, Proyecto &amp; CIE</div>' +
                '<div id="pricing-subtext-leg" style="font-size: 10px;color:#57606a;">Memoria técnica / proyecto, tasas de Industria y boletín oficial</div>' +
              '</div>' +
              '<div style="display:flex;align-items:center;gap:12px;flex-shrink:0;">' +
                '<div style="display:flex;align-items:center;justify-content:flex-end;gap:4px;width:185px;">' +
                  '<input type="number" id="pricing-input-leg-price" min="0" max="15000" step="25" style="width:90px;padding:4px 6px;background:#ffffff;border:1px solid #dfe3e8;border-radius:6px;color:#382a21;font-size:11px;font-weight:700;text-align:right;">' +
                  '<span style="font-size:10px;color:#57606a;">€</span>' +
                '</div>' +
                '<div style="width:105px;text-align:right;">' +
                  '<span id="pricing-row-leg-pvp" style="font-size:11.5px;font-weight:900;color:#059669;">0 €</span>' +
                '</div>' +
              '</div>' +
            '</div>' +
            '<div id="pricing-row-wind" style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-top:1px solid #dfe3e8;">' +
              '<div style="flex:1;min-width:0;padding-right:10px;">' +
                '<div style="font-size:11px;font-weight:800;color:#382a21;display:flex;align-items:center;gap:5px;"><span style="display:inline-flex;color:#e8a204;">' + _mSvg('wind', 13, '#e8a204') + '</span> Aerogeneradores &amp; Soporte Eólico</div>' +
                '<div id="pricing-subtext-wind" style="font-size: 10px;color:#57606a;">Turbinas eólicas, mástil, zapata y resistencia dump load</div>' +
              '</div>' +
              '<div style="display:flex;align-items:center;gap:12px;flex-shrink:0;">' +
                '<div style="display:flex;align-items:center;justify-content:flex-end;gap:4px;width:185px;">' +
                  '<input type="number" id="pricing-input-wind-price" min="0" max="200000" step="50" style="width:90px;padding:4px 6px;background:#ffffff;border:1px solid #dfe3e8;border-radius:6px;color:#382a21;font-size:11px;font-weight:700;text-align:right;">' +
                  '<span style="font-size:10px;color:#57606a;">€</span>' +
                '</div>' +
                '<div style="width:105px;text-align:right;">' +
                  '<span id="pricing-row-wind-pvp" style="font-size:11.5px;font-weight:900;color:#059669;">0 €</span>' +
                '</div>' +
              '</div>' +
            '</div>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0 2px 0;border-top:1px solid #dfe3e8;font-size:10.5px;">' +
              '<div style="flex:1;min-width:0;font-weight:800;color:#382a21;text-transform:uppercase;letter-spacing:0.4px;">Subtotal Partidas Base</div>' +
              '<div style="display:flex;align-items:center;gap:12px;flex-shrink:0;">' +
                '<div id="pricing-col-cost-total" style="width:185px;text-align:right;font-weight:800;color:#382a21;">0 €</div>' +
                '<div id="pricing-col-pvp-total" style="width:105px;text-align:right;font-size:12px;font-weight:900;color:#059669;">0 €</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div style="background:#f3f5f8;border:1px solid #dfe3e8;border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:8px;box-shadow:0 2px 6px rgba(30,36,43,0.04);">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;">' +
              '<div>' +
                '<div style="font-size:11px;font-weight:800;color:#e8a204;">Margen Comercial Deseado</div>' +
                '<div style="font-size: 10px;color:#57606a;">Beneficio bruto aplicado sobre la suma de costes directos</div>' +
              '</div>' +
              '<div style="display:flex;align-items:center;gap:4px;">' +
                '<input type="number" id="pricing-input-margin-pct" min="0" max="100" step="1" style="width:65px;padding:4px 6px;background:#ffffff;border:1px solid #e8a204;border-radius:6px;color:#e8a204;font-size:11px;font-weight:800;text-align:right;">' +
                '<span style="font-size:11px;color:#e8a204;font-weight:800;">%</span>' +
              '</div>' +
            '</div>' +
            '<div style="display:flex;gap:6px;">' +
              '<button type="button" class="btn-preset-margin" data-margin="10" style="flex:1;padding:4px;background:#ebedf0;border:1px solid #dfe3e8;border-radius:4px;color:#382a21;font-size:10px;font-weight:700;cursor:pointer;">10%</button>' +
              '<button type="button" class="btn-preset-margin" data-margin="15" style="flex:1;padding:4px;background:#ebedf0;border:1px solid #dfe3e8;border-radius:4px;color:#382a21;font-size:10px;font-weight:700;cursor:pointer;">15%</button>' +
              '<button type="button" class="btn-preset-margin" data-margin="20" style="flex:1;padding:4px;background:#ebedf0;border:1px solid #dfe3e8;border-radius:4px;color:#382a21;font-size:10px;font-weight:700;cursor:pointer;">20%</button>' +
              '<button type="button" class="btn-preset-margin" data-margin="25" style="flex:1;padding:4px;background:#ebedf0;border:1px solid #dfe3e8;border-radius:4px;color:#382a21;font-size:10px;font-weight:700;cursor:pointer;">25%</button>' +
              '<button type="button" class="btn-preset-margin" data-margin="30" style="flex:1;padding:4px;background:#ebedf0;border:1px solid #dfe3e8;border-radius:4px;color:#382a21;font-size:10px;font-weight:700;cursor:pointer;">30%</button>' +
            '</div>' +
          '</div>' +
          '<!-- SECCIÓN 4: EQUIPAMIENTO ADICIONAL (ADD-ONS) Y PROMOCIÓN COMERCIAL -->' +
          '<div style="background:#f3f5f8;border:1px solid #dfe3e8;border-radius:10px;padding:11px 12px;display:flex;flex-direction:column;gap:8px;box-shadow:0 2px 6px rgba(30,36,43,0.04);">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;">' +
              '<div style="font-size:10px;font-weight:900;color:#57606a;text-transform:uppercase;letter-spacing:0.5px;display:flex;align-items:center;gap:6px;">' +
                '<span style="display:inline-flex;color:#e8a204;">' + _mSvg('puzzle', 13, '#e8a204') + '</span> Equipamiento Opcional (Add-ons) y Promoción' +
              '</div>' +
              '<div id="pricing-addons-summary-badge" style="font-size:9.5px;color:#e8a204;font-weight:700;">0 seleccionados (+0 €)</div>' +
            '</div>' +
            '<div id="pricing-addons-chips-container" style="display:flex;flex-wrap:wrap;gap:6px;"></div>' +
            '<div style="display:grid;grid-template-columns:auto 85px 65px 1fr;gap:6px;align-items:center;background:#ebedf0;border:1px solid #dfe3e8;border-radius:6px;padding:6px 8px;">' +
              '<label style="display:flex;align-items:center;gap:5px;font-size:10px;font-weight:700;color:#382a21;cursor:pointer;white-space:nowrap;">' +
                '<input type="checkbox" id="pricing-check-discount-enabled" style="accent-color:#e8a204;">' +
                '<span>Aplicar Descuento:</span>' +
              '</label>' +
              '<input type="number" id="pricing-input-discount-val" min="0" step="1" placeholder="5" style="width:100%;box-sizing:border-box;padding:3px 6px;background:#ffffff;border:1px solid #dfe3e8;border-radius:4px;color:#e8a204;font-size:10.5px;font-weight:800;text-align:right;">' +
              '<select id="pricing-select-discount-type" style="padding:3px 4px;background:#ffffff;border:1px solid #dfe3e8;border-radius:4px;color:#382a21;font-size:10px;font-weight:700;">' +
                '<option value="percent">%</option>' +
                '<option value="fixed_eur">€</option>' +
              '</select>' +
              '<input type="text" id="pricing-input-discount-label" placeholder="Motivo (ej. Campaña Especial)" style="width:100%;box-sizing:border-box;padding:3px 6px;background:#ffffff;border:1px solid #dfe3e8;border-radius:4px;color:#382a21;font-size:10px;">' +
            '</div>' +
          '</div>' +
          '<div style="background:linear-gradient(135deg,rgba(5,150,105,0.10),rgba(5,150,105,0.04));border:1px solid rgba(5,150,105,0.3);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:5px;">' +
            '<div style="display:flex;justify-content:space-between;font-size:10.5px;color:#57606a;">' +
              '<span>Coste Directo Total:</span>' +
              '<b id="pricing-preview-direct" style="color:#382a21;">0 €</b>' +
            '</div>' +
            '<div style="display:flex;justify-content:space-between;font-size:10.5px;color:#059669;">' +
              '<span>Beneficio Comercial:</span>' +
              '<b id="pricing-preview-margin">+0 €</b>' +
            '</div>' +
            '<div id="pricing-preview-addons-row" style="display:none;justify-content:space-between;font-size:10.5px;color:#e8a204;">' +
              '<span>Equipamiento Opcional (Add-ons):</span>' +
              '<b id="pricing-preview-addons">+0 €</b>' +
            '</div>' +
            '<div id="pricing-preview-discount-row" style="display:none;justify-content:space-between;font-size:10.5px;color:#d97706;">' +
              '<span id="pricing-preview-discount-label">Descuento Comercial:</span>' +
              '<b id="pricing-preview-discount">-0 €</b>' +
            '</div>' +
            '<div style="display:flex;justify-content:space-between;font-size:10.5px;color:#57606a;">' +
              '<span>Base Imponible (Venta sin IVA):</span>' +
              '<b id="pricing-preview-subtotal" style="color:#382a21;">0 €</b>' +
            '</div>' +
            '<div style="display:flex;justify-content:space-between;font-size:10.5px;color:#57606a;">' +
              '<span id="pricing-preview-iva-label">IVA (21%):</span>' +
              '<b id="pricing-preview-iva" style="color:#382a21;">0 €</b>' +
            '</div>' +
            '<div id="pricing-preview-iva10-banner" style="display:none;background:#f3f5f8;border:1px solid rgba(217,119,6,0.4);border-radius:6px;padding:6px 8px;margin-top:2px;font-size:9px;color:#382a21;align-items:center;justify-content:space-between;gap:8px;">' +
              '<span id="pricing-preview-iva10-text">Materiales: 0% s/ B.I.</span>' +
              '<button type="button" id="btn-pricing-iva10-adjust" onclick="if(typeof raAutoAdjustMaterialsForIva10===\'function\')raAutoAdjustMaterialsForIva10(\'rebalance\')" style="padding:3px 7px;background:rgba(217,119,6,0.14);border:1px solid #d97706;border-radius:4px;color:#b45309;font-size:8.5px;font-weight:800;cursor:pointer;white-space:nowrap;">⚖️ Ajustar ≤ 40%</button>' +
            '</div>' +
            '<hr style="border:0;border-top:1px solid rgba(5,150,105,0.25);margin:4px 0;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;">' +
              '<span style="font-size:11px;font-weight:900;color:#059669;text-transform:uppercase;">TOTAL LLAVE EN MANO:</span>' +
              '<div style="display:flex;align-items:baseline;gap:6px;">' +
                '<s id="pricing-preview-total-tachado" style="display:none;font-size:12px;color:#57606a;font-weight:700;">0 €</s>' +
                '<b id="pricing-preview-total" style="font-size:17px;color:#382a21;font-weight:900;">0 €</b>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<!-- INDICADORES CLAVE DE RENTABILIDAD EN TIEMPO REAL -->' +
          '<div style="background:#f3f5f8;border:1px solid #dfe3e8;border-radius:10px;padding:9px 12px;display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;text-align:center;box-shadow:0 2px 6px rgba(30,36,43,0.04);">' +
            '<div style="background:#ebedf0;padding:6px;border-radius:6px;border:1px solid #dfe3e8;">' +
              '<div id="pricing-metric-ahorro" style="font-size:12px;font-weight:900;color:#059669;">0 €/año</div>' +
              '<div style="font-size:8.5px;color:#57606a;font-weight:700;text-transform:uppercase;">Ahorro Año 1</div>' +
            '</div>' +
            '<div style="background:#ebedf0;padding:6px;border-radius:6px;border:1px solid #dfe3e8;">' +
              '<div id="pricing-metric-payback" style="font-size:12px;font-weight:900;color:#d97706;">0.0 años</div>' +
              '<div style="font-size:8.5px;color:#57606a;font-weight:700;text-transform:uppercase;">Retorno (Payback)</div>' +
            '</div>' +
            '<div style="background:#ebedf0;padding:6px;border-radius:6px;border:1px solid #dfe3e8;">' +
              '<div id="pricing-metric-tir" style="font-size:12px;font-weight:900;color:#e8a204;">0.0 %</div>' +
              '<div style="font-size:8.5px;color:#57606a;font-weight:700;text-transform:uppercase;">TIR Anual</div>' +
            '</div>' +
            '<div style="background:#ebedf0;padding:6px;border-radius:6px;border:1px solid #dfe3e8;">' +
              '<div id="pricing-metric-autoconsumo" style="font-size:12px;font-weight:900;color:#7c3aed;">0 %</div>' +
              '<div style="font-size:8.5px;color:#57606a;font-weight:700;text-transform:uppercase;">Autoconsumo</div>' +
            '</div>' +
          '</div>' +
          '<!-- BLOQUE DE RESUMEN EJECUTIVO COMERCIAL CON GEMINI -->' +
          '<div style="background:#f3f5f8;border:1px solid rgba(124,58,237,0.3);border-radius:10px;padding:11px 12px;display:flex;flex-direction:column;gap:7px;box-shadow:0 2px 6px rgba(30,36,43,0.04);">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;">' +
              '<div style="display:flex;align-items:center;gap:6px;">' +
                '<span style="display:inline-flex;color:#7c3aed;">' + _mSvg('sparkles', 14, '#7c3aed') + '</span>' +
                '<span style="font-size:10.5px;font-weight:900;color:#7c3aed;text-transform:uppercase;letter-spacing:0.5px;">Resumen Comercial con IA (Google Gemini)</span>' +
              '</div>' +
              '<button type="button" id="btn-modal-generate-ai-summary" style="padding:3px 9px;background:rgba(124,58,237,0.12);border:1px solid rgba(124,58,237,0.35);border-radius:5px;color:#7c3aed;font-size:9.5px;font-weight:800;cursor:pointer;display:flex;align-items:center;gap:4px;" title="Redactar o actualizar el resumen ejecutivo de la propuesta con Gemini">' +
                '<span style="display:inline-flex;align-items:center;gap:4px;">' + _mSvg('bolt', 12, '#7c3aed') + ' Generar / Previsualizar</span>' +
              '</button>' +
            '</div>' +
            '<div id="modal-ai-summary-box" contenteditable="true" style="background:#ffffff;border:1px solid #dfe3e8;border-radius:6px;padding:8px 10px;font-size:10px;line-height:1.45;color:#382a21;min-height:48px;max-height:130px;overflow-y:auto;outline:none;" title="Haz clic para editar manualmente el texto">' +
              '<span style="color:#57606a;font-style:italic;">Pulsa en &laquo;Generar / Previsualizar&raquo; para redactar el resumen con IA adaptado a los datos y equipos de este proyecto, o edítalo directamente aquí.</span>' +
            '</div>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;font-size:9px;color:#57606a;">' +
              '<span id="modal-ai-summary-status" style="display:inline-flex;align-items:center;gap:4px;">' + _mSvg('lightbulb', 12, '#d97706') + ' Este texto aparecerá destacado en la Oferta Bancable (PDF). Puedes editarlo libremente.</span>' +
              '<button type="button" id="btn-modal-clear-ai-summary" style="background:none;border:none;color:#57606a;font-size:9px;cursor:pointer;text-decoration:underline;padding:0;">Restablecer plantilla</button>' +
            '</div>' +
          '</div>' +
          '<div style="display:flex;flex-direction:column;gap:4px;">' +
            '<label style="display:flex;align-items:center;gap:8px;font-size:10px;color:#382a21;cursor:pointer;">' +
              '<input type="checkbox" id="pricing-check-save-defaults" checked style="accent-color:#059669;">' +
              'Guardar estos costes y margen como mis valores habituales para futuros proyectos' +
            '</label>' +
          '</div>' +
        '</div>' +
        '<div style="padding:12px 20px;background:#ebedf0;border-top:1px solid #dfe3e8;display:flex;justify-content:flex-end;gap:10px;flex-shrink:0;">' +
          '<button type="button" id="btn-cancel-pricing-review" style="padding:7px 14px;background:#f3f5f8;border:1px solid #dfe3e8;border-radius:6px;color:#57606a;font-size:11px;font-weight:700;cursor:pointer;">CANCELAR</button>' +
          '<button type="button" id="btn-confirm-pricing-review" style="padding:7px 18px;background:linear-gradient(135deg,#059669,#10B981);border:none;border-radius:6px;color:#fff;font-size:11px;font-weight:900;cursor:pointer;display:flex;align-items:center;gap:6px;box-shadow:0 4px 12px rgba(5,150,105,0.28);">' +
            _mSvg('rocket', 14, '#ffffff') + ' CONFIRMAR Y EMITIR PRESUPUESTO' +
          '</button>' +
        '</div>' +
      '</div>' +
    '</div>';
    var wrapper = document.createElement('div');
    wrapper.innerHTML = modalHtml;
    document.body.appendChild(wrapper.firstChild);
    pModal = document.getElementById('ra-pricing-review-modal');
  }

  var pricing = RAPricing.getDefaults();
  var initialPricing = Object.assign({}, pricing);

  var pInput = document.getElementById('pricing-input-panel-price');
  var estInput = document.getElementById('pricing-input-est-price');
  var invInput = document.getElementById('pricing-input-inv-price');
  var batInput = document.getElementById('pricing-input-bat-price');
  var cabInput = document.getElementById('pricing-input-cab-price');
  var moInput = document.getElementById('pricing-input-mo-price');
  var legInput = document.getElementById('pricing-input-leg-price');
  var mgInput = document.getElementById('pricing-input-margin-pct');

  var subTitle = document.getElementById('pricing-modal-subtitle');
  var confirmBtn = document.getElementById('btn-confirm-pricing-review');
  var checkSave = document.getElementById('pricing-check-save-defaults');

  var projInfo = document.getElementById('pricing-modal-project-info');
  var equipInfo = document.getElementById('pricing-modal-equip-info');
  var titlePanels = document.getElementById('pricing-title-panels');
  var subtextPanels = document.getElementById('pricing-subtext-panels');
  var subtextInv = document.getElementById('pricing-subtext-inv');
  var subtextBat = document.getElementById('pricing-subtext-bat');

  var d = (typeof getProjectCalcs === 'function') ? getProjectCalcs() : { numPanels: 0, cfg: { potencia: 450, precio: 125 } };
  var m = (typeof calculateFinancialModel === 'function') ? (function() {
    try { return calculateFinancialModel(); } catch(e) { return { kwp: 0, numPanels: 0, ahorroLuzAnio1: 0, paybackYears: 0, pctAutoconsumo: 0 }; }
  })() : { kwp: 0, numPanels: 0, ahorroLuzAnio1: 0, paybackYears: 0, pctAutoconsumo: 0 };
  var mb = (d && d.modulesBreakdown) || (typeof window !== 'undefined' && window.RAModulesBreakdown && typeof window.RAModulesBreakdown.getProjectModulesBreakdown === 'function' ? window.RAModulesBreakdown.getProjectModulesBreakdown() : null);
  var numPanels = (mb && mb.totalPanels > 0) ? mb.totalPanels : (d.numPanels || (window.allRenderedPanels ? window.allRenderedPanels.length : 0) || 1);
  var kwp = (mb && mb.totalKwp > 0) ? mb.totalKwp : ((numPanels * (d.cfg && d.cfg.potencia ? d.cfg.potencia : 450)) / 1000.0);
  var eq = (typeof resolveEquipmentNames === 'function') ? resolveEquipmentNames() : null;

  if (projInfo) {
    projInfo.textContent = 'Proyecto: ' + numPanels + '× módulos (' + kwp.toFixed(2) + ' kWp)' + (eq && eq.hasWind ? (' + ' + eq.windCount + '× Eólica (' + eq.windTotalKw.toFixed(1) + ' kW)') : '') + (mb && mb.isMultiModule ? ' [Multi-Modelo]' : '');
  }
  if (titlePanels) {
    if (mb && mb.isMultiModule) {
      titlePanels.textContent = 'Módulos Fotovoltaicos Multi-Campo (' + mb.uniqueModelsCount + ' modelos)';
    } else if (mb && mb.byModel && mb.byModel[0] && mb.byModel[0].fullName) {
      titlePanels.textContent = 'Módulos Fotovoltaicos ' + mb.byModel[0].fullName;
    } else if (eq && eq.modFullName) {
      titlePanels.textContent = 'Módulos Fotovoltaicos ' + eq.modFullName;
    } else if (d.cfg && d.cfg.modelo && d.cfg.modelo !== '-') {
      titlePanels.textContent = 'Módulos Fotovoltaicos ' + d.cfg.modelo;
    } else {
      titlePanels.textContent = 'Módulos Fotovoltaicos Tier-1';
    }
  }
  if (equipInfo) {
    var invDesc = eq ? (eq.topology === 'microinverter' && eq.hasMicro ? eq.microName : eq.invName) : 'Inversor principal';
    var batDesc = (eq && eq.hasBat) ? eq.batName : 'Sin batería';
    var windTopDesc = (eq && eq.hasWind) ? (' · ' + eq.windName) : '';
    equipInfo.textContent = invDesc + ' · ' + batDesc + windTopDesc;
  }
  if (subtextPanels) {
    if (mb && mb.isMultiModule && window.RAModulesBreakdown && typeof window.RAModulesBreakdown.formatModuleSummaryText === 'function') {
      subtextPanels.textContent = window.RAModulesBreakdown.formatModuleSummaryText(mb);
    } else {
      subtextPanels.textContent = numPanels + '× módulos de ' + (d.cfg && d.cfg.potencia ? d.cfg.potencia : 450) + ' Wp instalados en cubierta (' + kwp.toFixed(2) + ' kWp total)';
    }
  }
  // Pre-cargar valores dinámicos calculados desde la ingeniería del proyecto actual (SSOT)
  var designCosts = RAPricing.computeDesignCosts(numPanels);
  if (subtextInv && eq) {
    var baseInvTxt = (eq.topology === 'microinverter' && eq.hasMicro) ? eq.microName : (eq.invName || 'Sistema de conversión e inversor');
    if (designCosts && designCosts.optimizersCount > 0) {
      baseInvTxt += ' + ' + designCosts.optimizersCount + '× Optimizadores DC (' + Math.round(designCosts.mlpePrice).toLocaleString('es-ES') + ' €)';
    }
    subtextInv.textContent = baseInvTxt;
  }
  if (subtextBat && eq) {
    subtextBat.textContent = eq.hasBat ? eq.batName : '0× módulos (Sin sistema de acumulación electroquímica)';
  }
  var subtextEst = document.getElementById('pricing-subtext-est');
  if (subtextEst && designCosts) {
    var barsTxt = designCosts.structBarsCount > 0 ? (designCosts.structBarsCount + '× barras aluminio, ' + designCosts.structFixingsCount + '× fijaciones A2 y ' + designCosts.structClampsCount + '× grapas') : 'Perfilería continua de aluminio y fijaciones A2';
    if (designCosts.isPergola) {
      subtextEst.innerHTML = '<b style="color:#38BDF8;">Pérgola Elevada para ' + numPanels + '× módulos (H = ' + designCosts.pergolaClearance.toFixed(2) + ' m)</b> · ' + barsTxt;
    } else {
      subtextEst.textContent = 'Soporte para ' + numPanels + '× módulos (' + barsTxt + ')';
    }
  }
  var subtextCab = document.getElementById('pricing-subtext-cab');
  if (subtextCab && designCosts) {
    subtextCab.textContent = (designCosts.dcPanelsCount || 1) + '× Cuadro DC + ' + (designCosts.acPanelsCount || 1) + '× Cuadro AC, ' + (designCosts.dcCableMeters || 0) + 'm cable DC ZZ-F, ' + (designCosts.acCableMeters || 0) + 'm AC y ' + (designCosts.earthRodsCount || 1) + '× pica(s) tierra';
  }
  var subtextMo = document.getElementById('pricing-subtext-mo');
  if (subtextMo) {
    var invUnitsMo = (eq && eq.topology === 'microinverter' && eq.hasMicro) ? (eq.microCount + '× microinversor(es)') : ((eq ? eq.invCount : 1) + '× inversor(es)');
    var batUnitsMo = (eq && eq.hasBat) ? (', ' + eq.batCount + '× batería(s)') : '';
    var windUnitsMo = (designCosts && designCosts.windCount > 0) ? (', ' + designCosts.windCount + '× aerogenerador(es)') : '';
    subtextMo.textContent = 'Montaje de ' + numPanels + '× módulos, ' + invUnitsMo + batUnitsMo + windUnitsMo + ' y puesta en marcha';
  }
  var subtextLeg = document.getElementById('pricing-subtext-leg');
  if (subtextLeg) {
    var docTypeLeg = (kwp > 10 || (designCosts && designCosts.windKw > 0)) ? '1× Proyecto Técnico Visado' : '1× Memoria Técnica de Diseño (MTD)';
    subtextLeg.textContent = docTypeLeg + ', 1× Dirección/Certificación y 1× Boletín CIE (' + kwp.toFixed(2) + ' kWp' + (designCosts && designCosts.windKw > 0 ? ' + ' + designCosts.windKw.toFixed(1) + ' kW eólicos' : '') + ')';
  }
  var subtextWind = document.getElementById('pricing-subtext-wind');
  if (subtextWind) {
    if (eq && eq.hasWind && eq.windCount > 0) {
      var wBk = (designCosts && designCosts.windBreakdown) ? designCosts.windBreakdown : null;
      if (wBk && wBk.turbineCount > 0) {
        subtextWind.innerHTML = '<span style="color:#e2e8f0;font-weight:700;">' + (eq.windDesc || eq.windName) + '</span><br>' +
          '<span style="font-size:9.5px;color:#38bdf8;line-height:1.4;display:inline-block;margin-top:2px;">' +
          '• Turbina: ' + Math.round(wBk.turbineEquipmentEur).toLocaleString('es-ES') + ' € · ' +
          '• Mástil (' + wBk.avgHubHeightM + 'm): ' + Math.round(wBk.mastStructureEur).toLocaleString('es-ES') + ' € · ' +
          '• Zapata (' + wBk.concreteVolumeTotalM3 + 'm³ HA-25): ' + Math.round(wBk.foundationCivilEur).toLocaleString('es-ES') + ' €<br>' +
          '• Inversor/Dump Load: ' + Math.round(wBk.inverterPowerElecEur).toLocaleString('es-ES') + ' € · ' +
          '• REBT e interconexión: ' + Math.round(wBk.electricalInstallEur).toLocaleString('es-ES') + ' € · ' +
          '• Montaje/CIE: ' + Math.round(wBk.engineeringCommissioningEur).toLocaleString('es-ES') + ' €' +
          '</span>';
      } else {
        subtextWind.textContent = eq.windDesc || eq.windName;
      }
    } else {
      subtextWind.textContent = '0× aerogeneradores montados en el proyecto';
    }
  }
  var hasActiveSessionOverride = Boolean(
    RAPricing.currentSessionPricing && (
      RAPricing.currentSessionPricing.isManualOverride ||
      RAPricing.currentSessionPricing.projectFingerprint === RAPricing.getProjectFingerprint(numPanels)
    )
  );
  var initialPanelPrice = (hasActiveSessionOverride && pricing.panelPrice > 0) ? pricing.panelPrice : designCosts.panelPrice;
  var initialEstPrice = (hasActiveSessionOverride && typeof pricing.estPrice === 'number' && pricing.estPrice >= 0) ? pricing.estPrice : designCosts.estPrice;
  var initialInvPrice = (hasActiveSessionOverride && typeof pricing.invPrice === 'number' && pricing.invPrice >= 0) ? pricing.invPrice : designCosts.invPrice;
  var initialBatPrice = (hasActiveSessionOverride && typeof pricing.batPrice === 'number' && pricing.batPrice >= 0) ? pricing.batPrice : designCosts.batPrice;
  var initialCabPrice = (hasActiveSessionOverride && typeof pricing.cabPrice === 'number' && pricing.cabPrice >= 0) ? pricing.cabPrice : designCosts.cabPrice;
  var initialMoPrice = (hasActiveSessionOverride && typeof pricing.moPrice === 'number' && pricing.moPrice >= 0) ? pricing.moPrice : designCosts.moPrice;
  var initialLegPrice = (hasActiveSessionOverride && typeof pricing.legPrice === 'number' && pricing.legPrice >= 0) ? pricing.legPrice : designCosts.legPrice;
  var initialMarginPct = (typeof pricing.marginPct === 'number' && pricing.marginPct >= 0) ? pricing.marginPct : 20;

  if (pInput) pInput.value = initialPanelPrice;
  if (estInput) estInput.value = Math.round(initialEstPrice);
  if (invInput) invInput.value = Math.round(initialInvPrice);
  if (batInput) batInput.value = Math.round(initialBatPrice);
  if (cabInput) cabInput.value = Math.round(initialCabPrice);
  if (moInput) moInput.value = Math.round(initialMoPrice);
  if (legInput) legInput.value = Math.round(initialLegPrice);
  var windInp = document.getElementById('pricing-input-wind-price');
  var rowWind = document.getElementById('pricing-row-wind');
  var initWind = (designCosts.windCount > 0)
    ? ((hasActiveSessionOverride && pricing && typeof pricing.windPrice === 'number' && pricing.windPrice >= 0) ? pricing.windPrice : (designCosts.windPrice || 0))
    : 0;
  if (windInp) windInp.value = Math.round(initWind);
  if (rowWind) rowWind.style.display = (designCosts.windCount > 0 || initWind > 0) ? 'flex' : 'none';
  if (mgInput) mgInput.value = initialMarginPct;

  // ── INICIALIZAR Y POBLAR CAMPOS DE FACTURA & CLIENTE (SSOT SINCRONIZADO) ──
  var custNombreInput = document.getElementById('pricing-cust-nombre');
  var custNifInput = document.getElementById('pricing-cust-nif');
  var custTelInput = document.getElementById('pricing-cust-tel');
  var custEmailInput = document.getElementById('pricing-cust-email');
  var custDirInput = document.getElementById('pricing-cust-dir');
  var custMunInput = document.getElementById('pricing-cust-mun');
  var custProvInput = document.getElementById('pricing-cust-prov');
  var custCpInput = document.getElementById('pricing-cust-cp');
  var custCupsInput = document.getElementById('pricing-cust-cups');
  var custDistSelect = document.getElementById('pricing-cust-dist');
  var custConsumoInput = document.getElementById('pricing-cust-consumo');
  var custPotContrInput = document.getElementById('pricing-cust-potcontr');
  var custPrecioKwhInput = document.getElementById('pricing-cust-precio-kwh');
  var syncBillBadge = document.getElementById('pricing-bill-sync-badge');
  var btnSyncBill = document.getElementById('btn-pricing-sync-bill');

  function _isClientDemoDefault(val) {
    var clean = String(val || '').trim();
    if (!clean) return true;
    return /^(PROPIETARIO EJEMPLO S\.?L\.?|Titular de la Instalación|B12345678|XXXXXXXXX|\+34 600 123 456|contacto@empresa\.es|Pol[íi]gono Industrial Sur, Parcela 12|ES00210000XXXXXXXXXX|ES0021000000000000XX|Madrid|28001)$/i.test(clean);
  }

  function populateBillingFieldsFromSSOT(preferBill) {
    var curTit = (typeof readTitular === 'function') ? readTitular() : (d.tit || {});
    var billMod = (typeof window !== 'undefined' && window.RA && window.RA.billAuditor) ? window.RA.billAuditor : null;
    var curBill = billMod ? billMod.currentBill : null;
    var curBillComp = billMod ? billMod.comparison : null;
    var cfg = (typeof window !== 'undefined' && window.solarProjectConfig) ? window.solarProjectConfig : {};
    var cfgClient = cfg.clientData || {};

    var rawBillTit = (curBill && curBill.titular) ? Object.assign({}, curBill.titular) : {};
    // Recoger también posibles ediciones vivas en el modal del auditor de facturas
    var _liveBillVal = function(id) {
      var el = document.getElementById(id);
      return (el && el.value) ? el.value.trim() : '';
    };
    var hasLoadedBill = !!(curBill && (curBill.fuente === 'ia' || curBill.fuente === 'local'));
    if (hasLoadedBill) {
      rawBillTit.nombre = _liveBillVal('bill-edit-tit-nombre') || rawBillTit.nombre || (curBillComp && curBillComp.titular) || '';
      rawBillTit.nif = _liveBillVal('bill-edit-tit-nif') || rawBillTit.nif || (curBillComp && curBillComp.cifNif) || '';
      rawBillTit.telefono = _liveBillVal('bill-edit-tit-tel') || rawBillTit.telefono || '';
      rawBillTit.email = _liveBillVal('bill-edit-tit-email') || rawBillTit.email || '';
      rawBillTit.direccion = _liveBillVal('bill-edit-tit-dir') || rawBillTit.direccion || (curBillComp && curBillComp.direccionSuministro) || '';
      rawBillTit.municipio = _liveBillVal('bill-edit-tit-mun') || rawBillTit.municipio || (curBillComp && curBillComp.municipio) || '';
      rawBillTit.provincia = _liveBillVal('bill-edit-tit-prov') || rawBillTit.provincia || (curBillComp && curBillComp.provincia) || '';
      rawBillTit.cp = _liveBillVal('bill-edit-tit-cp') || rawBillTit.cp || (curBillComp && curBillComp.cp) || '';
    }

    var docReal = function(val, id) {
      var v = String(val || '').trim();
      if (_isClientDemoDefault(v)) return '';
      var el = id ? document.getElementById(id) : null;
      if (el && el.defaultValue && v === String(el.defaultValue).trim() && hasLoadedBill) return '';
      return v;
    };

    var pickField = function(billVal, docVal, cfgVal, fallbackVal) {
      var b = String(billVal || '').trim();
      var dc = String(docVal || '').trim();
      var cf = String(cfgVal || '').trim();
      if (preferBill && b) return b;
      if (hasLoadedBill && b) return b;
      return dc || b || cf || fallbackVal || '';
    };

    var addrParts = cfg.address ? String(cfg.address).split(',').map(function(s) { return s.trim(); }).filter(Boolean) : [];
    var fallbackMun = addrParts[0] || '';
    var docMunRaw = docReal(curTit.mun, 'doc-mun');
    var docProvRaw = docReal(curTit.prov, 'doc-prov');
    var docCpRaw = docReal(curTit.cp, 'doc-cp');
    if (docCpRaw === '28001' && ((docMunRaw && !/madrid/i.test(docMunRaw)) || (rawBillTit.municipio && !/madrid/i.test(rawBillTit.municipio)))) {
      docCpRaw = '';
    }

    var curManualCons = cfg.manualAnnualConsumptionKWh || 0;
    if (!curManualCons) {
      var rawManualEl = document.getElementById('cfg-pres-consumo-anual') || document.getElementById('modal-cfg-pres-consumo-anual');
      if (rawManualEl && parseFloat(rawManualEl.value) > 0) curManualCons = parseFloat(rawManualEl.value);
    }
    var initConsumo = (curBillComp && curBillComp.consumoAnualKWh > 0) ? curBillComp.consumoAnualKWh : (curManualCons > 0 ? curManualCons : ((kwp >= 12) ? 18000 : 4500));
    var curPriceKwh = (curBillComp && curBillComp.precioMedioKWh > 0) ? curBillComp.precioMedioKWh : 0.18;
    var billPotMax = (curBill && curBill.potenciasContratadasKW) ? Math.max(curBill.potenciasContratadasKW.p1 || 0, curBill.potenciasContratadasKW.p2 || 0) : 0;
    var curPot = (hasLoadedBill && billPotMax > 0)
      ? billPotMax
      : ((curBillComp && curBillComp.potenciaContratadaP1 > 0) ? curBillComp.potenciaContratadaP1 : (curTit.potContr || 5.75));

    if (custNombreInput) custNombreInput.value = pickField(rawBillTit.nombre, docReal(curTit.nombre, 'doc-nombre'), cfgClient.nombre, '');
    if (custNifInput) custNifInput.value = pickField(rawBillTit.nif, docReal(curTit.nif, 'doc-nif'), cfgClient.nif, '');
    if (custTelInput) custTelInput.value = pickField(rawBillTit.telefono, docReal(curTit.tel, 'doc-tel'), cfgClient.telefono, '');
    if (custEmailInput) custEmailInput.value = pickField(rawBillTit.email, docReal(curTit.email, 'doc-email'), cfgClient.email, '');
    if (custDirInput) custDirInput.value = pickField(rawBillTit.direccion, docReal(curTit.dir, 'doc-dir'), cfgClient.direccion, cfg.address || '');
    if (custMunInput) custMunInput.value = pickField(rawBillTit.municipio, docMunRaw, cfgClient.municipio, fallbackMun);
    if (custProvInput) custProvInput.value = pickField(rawBillTit.provincia, docProvRaw, cfgClient.provincia, '');
    if (custCpInput) custCpInput.value = pickField(rawBillTit.cp, docCpRaw, cfgClient.cp, '');

    var billCups = _liveBillVal('bill-edit-cups') || (curBill && curBill.cups) || (curBillComp && curBillComp.cups) || '';
    if (_isClientDemoDefault(billCups)) billCups = '';
    if (custCupsInput) custCupsInput.value = pickField(billCups, docReal(curTit.cups, 'doc-cups'), cfgClient.cups, '');

    var billDist = (curBill && curBill.distribuidora && curBill.distribuidora !== 'Desconocida') ? curBill.distribuidora : ((curBillComp && curBillComp.distribuidora) || '');
    var effDist = pickField(billDist, curTit.dist, cfgClient.distribuidora, '');
    if (custDistSelect && effDist) {
      var needle = String(effDist).toLowerCase();
      for (var di = 0; di < custDistSelect.options.length; di++) {
        var optTxt = custDistSelect.options[di].text.toLowerCase();
        if (optTxt === needle || optTxt.indexOf(needle) >= 0 || needle.indexOf(optTxt.split(' ')[0]) >= 0) {
          custDistSelect.selectedIndex = di;
          break;
        }
      }
    }

    if (custConsumoInput) custConsumoInput.value = Math.round(initConsumo);
    if (custPotContrInput) custPotContrInput.value = Number(curPot || 5.75).toFixed(2);
    if (custPrecioKwhInput) custPrecioKwhInput.value = Number(curPriceKwh || 0.18).toFixed(3);

    if (syncBillBadge) {
      if (hasLoadedBill) {
        syncBillBadge.textContent = '🔗 Sincronizado con Factura (' + (curBill.comercializadora || 'Auditor') + ')';
        syncBillBadge.style.background = 'rgba(16,185,129,0.18)';
        syncBillBadge.style.borderColor = 'rgba(52,211,153,0.45)';
        syncBillBadge.style.color = '#6ee7b7';
      } else {
        syncBillBadge.textContent = 'Edición manual / sin factura';
        syncBillBadge.style.background = 'rgba(148,163,184,0.16)';
        syncBillBadge.style.borderColor = 'rgba(148,163,184,0.3)';
        syncBillBadge.style.color = '#94a3b8';
      }
    }
    if (btnSyncBill) {
      btnSyncBill.style.display = curBill ? 'inline-flex' : 'none';
    }
  }

  populateBillingFieldsFromSSOT(false);
  if (btnSyncBill) {
    btnSyncBill.onclick = function() {
      populateBillingFieldsFromSSOT(true);
      if (typeof showToast === 'function') {
        showToast('DATOS DE FACTURA SINCRONIZADOS', 'Campos de facturación alineados con la última factura auditada.', 'info', 2500);
      }
    };
  }

  // Inicializar estado comercial (CEL, Add-ons y Descuentos)
  var curCommCfg = (typeof RAPricing !== 'undefined' && typeof RAPricing.getCommercialConfig === 'function') ? RAPricing.getCommercialConfig() : {};
  var initialCommCfg = JSON.parse(JSON.stringify(curCommCfg));
  var workingCommCfg = JSON.parse(JSON.stringify(curCommCfg));
  if (!workingCommCfg.addons || !Array.isArray(workingCommCfg.addons) || workingCommCfg.addons.length === 0) {
    workingCommCfg.addons = JSON.parse(JSON.stringify(RAPricing._defaultCommercialConfig.addons));
  }

  var celCheckInput = document.getElementById('pricing-check-cel-enabled');
  var celPriceInput = document.getElementById('pricing-input-cel-price');
  if (celCheckInput) celCheckInput.checked = (workingCommCfg.includeCEL !== undefined) ? !!workingCommCfg.includeCEL : false;
  if (celPriceInput) celPriceInput.value = (typeof workingCommCfg.celPriceEur === 'number') ? workingCommCfg.celPriceEur : 0.11;

  var discCheckInput = document.getElementById('pricing-check-discount-enabled');
  var discValInput = document.getElementById('pricing-input-discount-val');
  var discTypeSelect = document.getElementById('pricing-select-discount-type');
  var discLabelInput = document.getElementById('pricing-input-discount-label');

  if (discCheckInput) discCheckInput.checked = !!workingCommCfg.discountEnabled;
  if (discValInput) discValInput.value = (typeof workingCommCfg.discountValue === 'number' && workingCommCfg.discountValue >= 0) ? workingCommCfg.discountValue : 5;
  if (discTypeSelect) discTypeSelect.value = workingCommCfg.discountType || 'percent';
  if (discLabelInput) discLabelInput.value = workingCommCfg.discountLabel || 'Descuento Comercial Especial';

  var chipsContainer = document.getElementById('pricing-addons-chips-container');
  var addonsBadge = document.getElementById('pricing-addons-summary-badge');

  function renderAddonsChips() {
    if (!chipsContainer) return;
    chipsContainer.innerHTML = '';
    var activeCount = 0;
    var activeSum = 0;

    (workingCommCfg.addons || []).forEach(function(addon, idx) {
      if (!addon) return;
      var isAct = !!addon.enabled;
      var price = (Number(addon.qty) || 1) * (Number(addon.unitPrice) || 0);
      if (isAct) {
        activeCount++;
        activeSum += price;
      }

      var chip = document.createElement('button');
      chip.type = 'button';
      chip.setAttribute('data-addon-id', addon.id || idx);
      chip.style.cssText = 'padding:4px 8px;border-radius:6px;font-size:9.5px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:5px;transition:all 0.15s ease;' +
        (isAct
          ? 'background:rgba(56,189,248,0.22);border:1px solid #38BDF8;color:#E0F2FE;box-shadow:0 0 8px rgba(56,189,248,0.25);'
          : 'background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);color:#94a3b8;');

      var shortName = addon.name;
      if (addon.id === 'smart_meter') shortName = _mSvg('chart', 11, 'currentColor') + ' Smart Meter (+220€)';
      else if (addon.id === 'crane_lift') shortName = _mSvg('wrench', 11, 'currentColor') + ' Camión Pluma (+480€)';
      else if (addon.id === 'extended_ac') shortName = _mSvg('plug', 11, 'currentColor') + ' Acometida AC >15m (+350€)';
      else if (addon.id === 'bat_protection') shortName = _mSvg('shield', 11, 'currentColor') + ' Rack & Protec. DC (+280€)';
      else if (addon.id === 'roof_sealing') shortName = _mSvg('flask', 11, 'currentColor') + ' Sellado Químico (+160€)';
      else if (addon.id === 'municipal_tax') shortName = _mSvg('landmark', 11, 'currentColor') + ' Tasa ICIO (+450€)';
      else if (addon.id === 'ev_charger') shortName = _mSvg('bolt', 11, 'currentColor') + ' Cargador VE (+890€)';
      else if (addon.id === 'bird_mesh') shortName = _mSvg('shield', 11, 'currentColor') + ' Malla Antipájaros (+320€)';
      else if (addon.id === 'virtual_bat') shortName = _mSvg('battery', 11, 'currentColor') + ' Batería Virtual (+95€)';
      else if (addon.id === 'lifeline') shortName = _mSvg('hardHat', 11, 'currentColor') + ' Línea de Vida (+450€)';
      else if (addon.id === 'maint_annual') shortName = _mSvg('wrench', 11, 'currentColor') + ' Mantenimiento Anual (+180€)';
      else shortName = (addon.name || 'Extra') + ' (+' + Math.round(price) + '€)';

      chip.innerHTML = (isAct ? _mSvg('check', 11, '#38BDF8') + ' ' : '+ ') + shortName;

      chip.onclick = function() {
        addon.enabled = !addon.enabled;
        renderAddonsChips();
        syncSessionCommercialConfig();
        recalculateLive();
      };
      chipsContainer.appendChild(chip);
    });

    if (addonsBadge) {
      addonsBadge.textContent = activeCount + ' seleccionado' + (activeCount !== 1 ? 's' : '') + ' (+' + Math.round(activeSum).toLocaleString('es-ES') + ' €)';
    }
  }

  function syncSessionCommercialConfig() {
    workingCommCfg.discountEnabled = discCheckInput ? discCheckInput.checked : false;
    workingCommCfg.discountValue = discValInput ? (parseFloat(discValInput.value) || 0) : 0;
    workingCommCfg.discountType = discTypeSelect ? discTypeSelect.value : 'percent';
    workingCommCfg.discountLabel = (discLabelInput && discLabelInput.value.trim()) ? discLabelInput.value.trim() : 'Descuento Comercial Especial';
    if (celCheckInput) workingCommCfg.includeCEL = celCheckInput.checked;
    if (celPriceInput) workingCommCfg.celPriceEur = parseFloat(celPriceInput.value) || 0.11;
    if (typeof RAPricing !== 'undefined') {
      RAPricing._sessionCommercialConfig = JSON.parse(JSON.stringify(workingCommCfg));
    }
  }

  if (discCheckInput) discCheckInput.onchange = function() { syncSessionCommercialConfig(); recalculateLive(); };
  if (discValInput) discValInput.oninput = function() { syncSessionCommercialConfig(); recalculateLive(); };
  if (discTypeSelect) discTypeSelect.onchange = function() { syncSessionCommercialConfig(); recalculateLive(); };
  if (discLabelInput) discLabelInput.oninput = function() { syncSessionCommercialConfig(); recalculateLive(); };
  if (celCheckInput) celCheckInput.onchange = function() { syncSessionCommercialConfig(); recalculateLive(); };
  if (celPriceInput) celPriceInput.oninput = function() { syncSessionCommercialConfig(); recalculateLive(); };

  renderAddonsChips();

  if (subTitle) {
    subTitle.textContent = (typeof onConfirm === 'function')
      ? 'Verifica o ajusta los importes de cada partida antes de emitir la entrega final'
      : 'Ajusta los costes unitarios y margen comercial aplicados al presupuesto del proyecto';
  }
  if (confirmBtn) {
    confirmBtn.innerHTML = (typeof onConfirm === 'function')
      ? (_mSvg('rocket', 14, '#ffffff') + ' CONFIRMAR Y EMITIR PRESUPUESTO')
      : (_mSvg('save', 14, '#ffffff') + ' APLICAR PRECIOS &amp; MARGEN');
  }

  function recalculateLive() {
    syncSessionCommercialConfig();

    var pPrice = parseFloat(pInput ? pInput.value : 125) || 0;
    var estPrice = parseFloat(estInput ? estInput.value : 0) || 0;
    var invPrice = parseFloat(invInput ? invInput.value : 0) || 0;
    var batPrice = parseFloat(batInput ? batInput.value : 0) || 0;
    var cabPrice = parseFloat(cabInput ? cabInput.value : 0) || 0;
    var moPrice = parseFloat(moInput ? moInput.value : 0) || 0;
    var legPrice = parseFloat(legInput ? legInput.value : 0) || 0;
    var windInput = document.getElementById('pricing-input-wind-price');
    var windPrice = parseFloat(windInput ? windInput.value : (designCosts.windPrice || 0)) || 0;
    var mgPct = parseFloat(mgInput ? mgInput.value : 20) || 0;

    var panelTotal = (mb && mb.isMultiModule && Math.abs(pPrice - designCosts.panelPrice) < 0.05)
      ? designCosts.panelTotalCost
      : Math.round(numPanels * pPrice);
    var rowPanSub = document.getElementById('pricing-row-panel-subtotal');
    if (rowPanSub) rowPanSub.textContent = Math.round(panelTotal).toLocaleString('es-ES') + ' €';

    var directCost = panelTotal + estPrice + invPrice + batPrice + cabPrice + moPrice + legPrice + windPrice;
    var marginEur = directCost * (mgPct / 100.0);

    // Actualizar columna de P.V.P. por partida con margen repartido proporcionalmente
    var mFactor = 1 + (mgPct / 100.0);
    var baseEquipPvpTotal = Math.round(directCost + marginEur);
    var pvpPan = Math.round(panelTotal * mFactor);
    var pvpEst = Math.round(estPrice * mFactor);
    var pvpInv = Math.round(invPrice * mFactor);
    var pvpBat = Math.round(batPrice * mFactor);
    var pvpCab = Math.round(cabPrice * mFactor);
    var pvpMo = Math.round(moPrice * mFactor);
    var pvpWind = Math.round(windPrice * mFactor);
    var pvpLeg = (legPrice > 0)
      ? Math.max(0, baseEquipPvpTotal - (pvpPan + pvpEst + pvpInv + pvpBat + pvpCab + pvpMo + pvpWind))
      : 0;

    var _setPvpTxt = function(id, val) {
      var el = document.getElementById(id);
      if (el) el.textContent = Math.round(val).toLocaleString('es-ES') + ' €';
    };
    var colHdr = document.getElementById('pricing-col-margin-header');
    if (colHdr) colHdr.textContent = 'P.V.P. (+' + (Number.isInteger(mgPct) ? mgPct : mgPct.toFixed(1)) + '%)';
    _setPvpTxt('pricing-row-panel-pvp', pvpPan);
    _setPvpTxt('pricing-row-est-pvp', pvpEst);
    _setPvpTxt('pricing-row-inv-pvp', pvpInv);
    _setPvpTxt('pricing-row-bat-pvp', pvpBat);
    _setPvpTxt('pricing-row-cab-pvp', pvpCab);
    _setPvpTxt('pricing-row-mo-pvp', pvpMo);
    _setPvpTxt('pricing-row-leg-pvp', pvpLeg);
    _setPvpTxt('pricing-row-wind-pvp', pvpWind);
    _setPvpTxt('pricing-col-cost-total', directCost);
    _setPvpTxt('pricing-col-pvp-total', baseEquipPvpTotal);

    // Sumar Add-ons activos
    var addonsCost = 0;
    (workingCommCfg.addons || []).forEach(function(a) {
      if (a && a.enabled) {
        addonsCost += (Number(a.qty) || 1) * (Number(a.unitPrice) || 0);
      }
    });

    var subtotalPreDiscount = directCost + marginEur + addonsCost;

    // Calcular descuento comercial
    var discountEur = 0;
    if (workingCommCfg.discountEnabled) {
      if (workingCommCfg.discountType === 'percent') {
        discountEur = subtotalPreDiscount * (Math.max(0, Number(workingCommCfg.discountValue) || 0) / 100.0);
      } else {
        discountEur = Math.max(0, Number(workingCommCfg.discountValue) || 0);
      }
    }

    var ivaElOpt = document.getElementById('tax-iva-opt') || document.getElementById('modal-tax-iva-opt');
    var ivaRate = (ivaElOpt && ivaElOpt.value !== undefined && ivaElOpt.value !== '') ? parseFloat(ivaElOpt.value) : undefined;
    if (!Number.isFinite(ivaRate) && workingCommCfg && workingCommCfg.taxShield && typeof workingCommCfg.taxShield.ivaRate === 'number') {
      ivaRate = workingCommCfg.taxShield.ivaRate;
    }
    if (!Number.isFinite(ivaRate)) ivaRate = 0.21;

    var subtotal = Math.max(100, Math.round(subtotalPreDiscount - discountEur));
    var iva = Math.round(subtotal * ivaRate);
    var capexBruto = subtotal + iva;
    var capexTachado = (discountEur > 0) ? Math.round(subtotalPreDiscount * (1 + ivaRate)) : null;

    // Temporal override en sesión etiquetado con la huella del proyecto actual
    var priorIsManual = Boolean(RAPricing.currentSessionPricing && RAPricing.currentSessionPricing.isManualOverride);
    RAPricing.currentSessionPricing = {
      projectFingerprint: RAPricing.getProjectFingerprint(numPanels),
      panelPrice: pPrice,
      estPrice: estPrice,
      invPrice: invPrice,
      batPrice: batPrice,
      cabPrice: cabPrice,
      moPrice: moPrice,
      legPrice: legPrice,
      windPrice: windPrice,
      marginPct: mgPct,
      skipReview: false,
      isManualOverride: priorIsManual
    };

    // Actualizar temporalmente consumo y parámetros en window.solarProjectConfig para métricas en vivo
    var custConsumoVal = custConsumoInput ? parseFloat(custConsumoInput.value) : 0;
    if (typeof window !== 'undefined') {
      if (!window.solarProjectConfig) window.solarProjectConfig = {};
      if (custConsumoVal > 0) {
        window.solarProjectConfig.manualAnnualConsumptionKWh = custConsumoVal;
      }
    }

    var dEl = document.getElementById('pricing-preview-direct');
    var mEl = document.getElementById('pricing-preview-margin');
    var aRow = document.getElementById('pricing-preview-addons-row');
    var aEl = document.getElementById('pricing-preview-addons');
    var discRow = document.getElementById('pricing-preview-discount-row');
    var discEl = document.getElementById('pricing-preview-discount');
    var discLbl = document.getElementById('pricing-preview-discount-label');
    var sEl = document.getElementById('pricing-preview-subtotal');
    var iEl = document.getElementById('pricing-preview-iva');
    var tTachadoEl = document.getElementById('pricing-preview-total-tachado');
    var tEl = document.getElementById('pricing-preview-total');

    if (dEl) dEl.textContent = Math.round(directCost).toLocaleString('es-ES') + ' €';
    if (mEl) mEl.textContent = '+' + Math.round(marginEur).toLocaleString('es-ES') + ' € (' + mgPct + '%)';

    if (aRow && aEl) {
      if (addonsCost > 0) {
        aRow.style.display = 'flex';
        aEl.textContent = '+' + Math.round(addonsCost).toLocaleString('es-ES') + ' €';
      } else {
        aRow.style.display = 'none';
      }
    }

    if (discRow && discEl) {
      if (discountEur > 0) {
        discRow.style.display = 'flex';
        if (discLbl) discLbl.textContent = (workingCommCfg.discountLabel || 'Descuento') + ':';
        discEl.textContent = '-' + Math.round(discountEur).toLocaleString('es-ES') + ' €' + (workingCommCfg.discountType === 'percent' ? ' (' + workingCommCfg.discountValue + '%)' : '');
      } else {
        discRow.style.display = 'none';
      }
    }

    if (sEl) sEl.textContent = Math.round(subtotal).toLocaleString('es-ES') + ' €';
    var iLblEl = document.getElementById('pricing-preview-iva-label');
    if (iLblEl) iLblEl.textContent = 'IVA (' + Math.round(ivaRate * 100) + '%):';
    if (iEl) iEl.textContent = Math.round(iva).toLocaleString('es-ES') + ' €';

    if (tTachadoEl) {
      if (capexTachado && capexTachado > capexBruto) {
        tTachadoEl.style.display = 'inline';
        tTachadoEl.textContent = Math.round(capexTachado).toLocaleString('es-ES') + ' €';
      } else {
        tTachadoEl.style.display = 'none';
      }
    }
    if (tEl) tEl.textContent = Math.round(capexBruto).toLocaleString('es-ES') + ' €';

    // ── CALCULAR Y ACTUALIZAR TARJETAS KPI EN TIEMPO REAL ──
    try {
      if (typeof calculateFinancialModel === 'function') {
        var m = calculateFinancialModel();
        if (m) {
          var iva10Banner = document.getElementById('pricing-preview-iva10-banner');
          var iva10Txt = document.getElementById('pricing-preview-iva10-text');
          var iva10Btn = document.getElementById('btn-pricing-iva10-adjust');
          if (iva10Banner && m.ivaCompliance) {
            var ic = m.ivaCompliance;
            if (ic.isRenovacion10) {
              iva10Banner.style.display = 'flex';
              var ok40 = (ic.pctMateriales <= 40.001);
              iva10Banner.style.borderColor = ic.isCompliant ? 'rgba(16,185,129,0.45)' : 'rgba(245,158,11,0.55)';
              if (iva10Txt) {
                iva10Txt.innerHTML = (ic.isCompliant ? '✅ ' : '⚠️ ') + '<b>IVA 10% Renovación:</b> Mat. ' + ic.pctMateriales.toFixed(1) + '% s/ B.I. (' + Math.round(ic.baseMateriales).toLocaleString('es-ES') + ' € / máx ' + Math.round(ic.maxMateriales40Eur).toLocaleString('es-ES') + ' €)';
              }
              if (iva10Btn) iva10Btn.style.display = ok40 ? 'none' : 'inline-block';
            } else if (ic.isRehab10) {
              iva10Banner.style.display = 'flex';
              iva10Banner.style.borderColor = 'rgba(56,189,248,0.45)';
              if (iva10Txt) iva10Txt.innerHTML = 'ℹ️ <b>IVA 10% Rehabilitación / Obra Nueva:</b> Sin tope 40% materiales (' + ic.pctMateriales.toFixed(1) + '%)';
              if (iva10Btn) iva10Btn.style.display = 'none';
            } else {
              iva10Banner.style.display = 'none';
            }
          }
          var ahorroEl = document.getElementById('pricing-metric-ahorro');
          var paybackEl = document.getElementById('pricing-metric-payback');
          var tirEl = document.getElementById('pricing-metric-tir');
          var autoconsumoEl = document.getElementById('pricing-metric-autoconsumo');

          if (ahorroEl) ahorroEl.textContent = Math.round(m.ahorroLuzAnio1 || 0).toLocaleString('es-ES') + ' €/año';
          if (paybackEl) paybackEl.textContent = (m.paybackYears ? m.paybackYears.toFixed(1) : '—') + ' años';
          if (tirEl) tirEl.textContent = (m.tir != null && isFinite(m.tir) ? m.tir.toFixed(1) + ' %' : (m.tirString || '—'));
          if (autoconsumoEl) autoconsumoEl.textContent = Math.round(m.pctAutoconsumo || m.autarquiaPct || 0) + ' %';

          // Actualización en vivo de Comunidad Energética Local (CEL)
          var celExtraEl = document.getElementById('pricing-cel-preview-extra');
          var celStatusEl = document.getElementById('pricing-cel-preview-status');
          var isCelOn = celCheckInput ? celCheckInput.checked : true;
          var celPriceVal = celPriceInput ? (parseFloat(celPriceInput.value) || 0.11) : 0.11;
          if (celExtraEl) {
            if (!isCelOn) {
              celExtraEl.textContent = 'Desactivado';
              celExtraEl.style.color = '#94a3b8';
              if (celStatusEl) celStatusEl.textContent = 'Excluido de la propuesta';
            } else {
              var celM = (typeof calculateCELMetrics === 'function') ? calculateCELMetrics(d, m, celPriceVal) : null;
              var extraEur = celM ? celM.beneficioExtraCEL : Math.max(0, Math.round(((m.excedenteKWh != null ? m.excedenteKWh : (kwp * 1450 * 0.35))) * (celPriceVal - 0.05)));
              celExtraEl.textContent = '+' + Math.round(extraEur).toLocaleString('es-ES') + ' €/año';
              celExtraEl.style.color = '#10B981';
              if (celStatusEl) celStatusEl.textContent = 'CEL-Ready (~' + (celM ? celM.familiasBeneficiadas : 1) + ' familias)';
            }
          }
        }
      }
    } catch (eKpi) {
      console.warn('[PricingModal] Error recalculando KPIs en vivo:', eKpi);
    }
  }

  recalculateLive();

  [pInput, estInput, invInput, batInput, cabInput, moInput, legInput, windInp, mgInput, custConsumoInput, custPotContrInput, custPrecioKwhInput, celPriceInput].forEach(function(inp) {
    if (inp) inp.oninput = recalculateLive;
  });
  if (celCheckInput) celCheckInput.onchange = recalculateLive;

  // ── SONDEO DE PRECIOS AUTOMÁTICO CON GEMINI AI ──
  var aiSurveyBtn = document.getElementById('btn-ai-survey-pricing');
  var aiBanner = document.getElementById('pricing-ai-survey-banner');
  var aiText = document.getElementById('pricing-ai-survey-text');
  var applyAiBtn = document.getElementById('btn-apply-ai-pricing');
  var suggestedAiPrices = null;

  if (aiSurveyBtn) {
    aiSurveyBtn.onclick = async function() {
      var apiKey = '';
      try {
        if (window.RA && typeof window.RA.getGeminiApiKey === 'function') apiKey = window.RA.getGeminiApiKey();
        else if (window.RA && window.RA.geminiApiKey) apiKey = window.RA.geminiApiKey;
      } catch(e) {}

      if (!apiKey) {
        (typeof raAlert === 'function' ? raAlert : console.warn)('Por favor, introduce o verifica tu API Key de Gemini en el menu Datos & Logo Empresa (Paso 5) para activar las consultas de mercado con IA.', 'warning');
        return;
      }

      if (aiBanner) aiBanner.style.display = 'block';
      if (aiText) aiText.innerHTML = _mSvg('refresh', 12, '#C084FC', 'margin-right:4px;') + '<em>Consultando a Google Gemini precios medios de mercado en España para tus equipos...</em>';
      if (applyAiBtn) applyAiBtn.style.display = 'none';

      try {
        var modName = (d.cfg && d.cfg.potencia ? (d.cfg.potencia + ' Wp') : '450 Wp Tier-1');
        var invName = (eq && eq.invName) ? eq.invName : 'Inversor solar de red';
        var batName = (eq && eq.hasBat) ? eq.batName : 'Sin bateria';
        var structType = designCosts.isPergola ? ('Pergola elevada ' + designCosts.pergolaClearance.toFixed(2) + 'm') : 'Coplanar / Triangulos lastrados';

        var prompt = 'Actua como consultor de costes y tarifas de instalaciones fotovoltaicas en Espana (ano 2024-2026). ' +
          'Proporciona el precio de coste directo razonable de mercado para las siguientes partidas de un proyecto residencial/comercial de ' + numPanels + ' paneles:\n' +
          '- Modulo fotovoltaico: ' + modName + ' (precio unitario en EUR/ud)\n' +
          '- Estructura soporte: ' + structType + ' para ' + numPanels + ' paneles (precio total estructura en EUR)\n' +
          '- Inversor: ' + invName + ' (precio total inversor en EUR)\n' +
          (eq && eq.hasBat ? ('- Bateria: ' + batName + ' (precio total bateria en EUR)\n') : '') +
          '- Cableado solar, cuadro protecciones DC/AC y puesta a tierra para ' + numPanels + ' modulos (precio total en EUR)\n' +
          '- Mano de obra completa de instalacion y montaje para ' + numPanels + ' modulos (precio total en EUR)\n' +
          '- Ingenieria, proyecto tecnico y boletin CIE (precio total en EUR)\n\n' +
          'Devuelve EXCLUSIVAMENTE un objeto JSON sin bloques de codigo con esta estructura exacta:\n' +
          '{\n' +
          '  "panelPrice": 115,\n' +
          '  "estPrice": 1200,\n' +
          '  "invPrice": 1150,\n' +
          '  "batPrice": 0,\n' +
          '  "cabPrice": 550,\n' +
          '  "moPrice": 1350,\n' +
          '  "legPrice": 450,\n' +
          '  "resumen": "Breve explicacion de 2 lineas sobre la tendencia de precios en Espana."\n' +
          '}';

        // 1. Descubrir modelos activos admitidos por la API Key del usuario o usar fallback ordenado
        var modelsToTry = [];
        try {
          if (!window.RAEquipmentAIImporter && window.RALazyLoader && typeof window.RALazyLoader.loadEquipmentAIImporter === 'function') {
            await window.RALazyLoader.loadEquipmentAIImporter();
          }
          if (window.RAEquipmentAIImporter && typeof window.RAEquipmentAIImporter.discoverAvailableModels === 'function') {
            modelsToTry = await window.RAEquipmentAIImporter.discoverAvailableModels(apiKey);
          }
        } catch(eDisc) {}

        if (!modelsToTry || modelsToTry.length === 0) {
          modelsToTry = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-2.0-flash-exp'];
        }

        var jsonResult = null;
        var lastHttpError = null;
        var lastRawText = '';

        for (var mi = 0; mi < modelsToTry.length; mi++) {
          var modelName = modelsToTry[mi];
          var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + modelName + ':generateContent';
          
          var resp = await _aiFetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 900,
                responseMimeType: 'application/json'
              }
            })
          }, 30000, apiKey);

          if (!resp.ok) {
            var errData = await resp.json().catch(function() { return {}; });
            lastHttpError = (errData && errData.error && errData.error.message) ? errData.error.message : ('HTTP ' + resp.status + ' (' + modelName + ')');
            continue;
          }

          var data = await resp.json().catch(function() { return null; });
          if (!data) continue;

          var rawText = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0])
            ? data.candidates[0].content.parts[0].text : '';
          
          if (!rawText) continue;
          lastRawText = rawText;

          // Extracción inteligente y robusta de JSON
          var cleaned = rawText.replace(/^[^{\[]*([{\[][\s\S]*[}\]])[^}\]]*$/, '$1').trim();
          try {
            var parsed = JSON.parse(cleaned);
            if (parsed && typeof parsed === 'object') {
              jsonResult = {
                panelPrice: parseFloat(parsed.panelPrice) || 0,
                estPrice: parseFloat(parsed.estPrice) || 0,
                invPrice: parseFloat(parsed.invPrice) || 0,
                batPrice: parseFloat(parsed.batPrice) || 0,
                cabPrice: parseFloat(parsed.cabPrice) || 0,
                moPrice: parseFloat(parsed.moPrice) || 0,
                legPrice: parseFloat(parsed.legPrice) || 0,
                resumen: parsed.resumen || parsed.summary || 'Tarifas medias obtenidas vía Google Gemini.'
              };
              if (jsonResult.panelPrice > 0 || jsonResult.estPrice > 0 || jsonResult.invPrice > 0) {
                break;
              }
            }
          } catch(eParse) {
            // Regex fallback si Gemini incluyó comentarios o trailing commas
            var extractNum = function(regex, defVal) {
              var match = rawText.match(regex);
              return match ? (parseFloat(match[1]) || defVal) : defVal;
            };
            var pPrice = extractNum(/"panelPrice"\s*:\s*([0-9]+(?:\.[0-9]+)?)/i, 0);
            var ePrice = extractNum(/"estPrice"\s*:\s*([0-9]+(?:\.[0-9]+)?)/i, 0);
            var iPrice = extractNum(/"invPrice"\s*:\s*([0-9]+(?:\.[0-9]+)?)/i, 0);
            var bPrice = extractNum(/"batPrice"\s*:\s*([0-9]+(?:\.[0-9]+)?)/i, 0);
            var cPrice = extractNum(/"cabPrice"\s*:\s*([0-9]+(?:\.[0-9]+)?)/i, 0);
            var mPrice = extractNum(/"moPrice"\s*:\s*([0-9]+(?:\.[0-9]+)?)/i, 0);
            var lPrice = extractNum(/"legPrice"\s*:\s*([0-9]+(?:\.[0-9]+)?)/i, 0);
            var resMatch = rawText.match(/"resumen"\s*:\s*"([^"]+)"/i);

            if (pPrice > 0 || ePrice > 0 || iPrice > 0) {
              jsonResult = {
                panelPrice: pPrice,
                estPrice: ePrice,
                invPrice: iPrice,
                batPrice: bPrice,
                cabPrice: cPrice,
                moPrice: mPrice,
                legPrice: lPrice,
                resumen: resMatch ? resMatch[1] : 'Tarifas extraídas mediante análisis sintáctico de Gemini.'
              };
              break;
            }
          }
        }

        if (jsonResult && (jsonResult.panelPrice > 0 || jsonResult.estPrice > 0 || jsonResult.invPrice > 0)) {
          suggestedAiPrices = jsonResult;
          if (aiText) {
            var _pP = Number(jsonResult.panelPrice) || 0;
            var _eP = Math.round(Number(jsonResult.estPrice) || 0);
            var _iP = Math.round(Number(jsonResult.invPrice) || 0);
            var _mP = Math.round(Number(jsonResult.moPrice) || 0);
            var _cP = Math.round(Number(jsonResult.cabPrice) || 0);
            var _res = String(jsonResult.resumen || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            aiText.innerHTML = '<b>Sugerencia Gemini:</b> Módulo: <b>' + _pP + ' €/ud</b> · ' +
              'Estructura: <b>' + _eP + ' €</b> · Inversor: <b>' + _iP + ' €</b> · ' +
              'M.O.: <b>' + _mP + ' €</b> · Cables/Cuadros: <b>' + _cP + ' €</b>.<br>' +
              '<span style="font-size:9px;color:#D8B4FE;">' + _res + '</span>';
          }
          if (applyAiBtn) applyAiBtn.style.display = 'inline-block';
        } else {
          var _escF = function(v) {
            return (window.RASanitize && typeof window.RASanitize.plain === 'function')
              ? window.RASanitize.plain(v)
              : String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
          };
          var detail = lastHttpError ? (' (' + _escF(lastHttpError) + ')') : (lastRawText ? ' (Respuesta: ' + _escF(lastRawText.substring(0, 80)) + '...)' : '');
          if (aiText) aiText.innerHTML = _mSvg('errorCircle', 12, '#f87171', 'margin-right:4px;') + 'No se pudo interpretar la respuesta de Gemini' + detail + '. Comprueba la conexión o intenta de nuevo.';
        }
      } catch (errAi) {
        var _escErr = (window.RASanitize && typeof window.RASanitize.plain === 'function')
          ? window.RASanitize.plain(errAi && errAi.message ? errAi.message : errAi)
          : String(errAi && errAi.message ? errAi.message : errAi).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        if (aiText) aiText.innerHTML = _mSvg('errorCircle', 12, '#f87171', 'margin-right:4px;') + 'Error de conexión al consultar Gemini: ' + _escErr;
      }
    };
  }

  if (applyAiBtn) {
    applyAiBtn.onclick = function() {
      if (!suggestedAiPrices) return;
      if (pInput && suggestedAiPrices.panelPrice > 0) pInput.value = suggestedAiPrices.panelPrice;
      if (estInput && suggestedAiPrices.estPrice > 0) estInput.value = suggestedAiPrices.estPrice;
      if (invInput && suggestedAiPrices.invPrice > 0) invInput.value = suggestedAiPrices.invPrice;
      if (batInput && typeof suggestedAiPrices.batPrice === 'number' && suggestedAiPrices.batPrice > 0) batInput.value = suggestedAiPrices.batPrice;
      if (cabInput && suggestedAiPrices.cabPrice > 0) cabInput.value = suggestedAiPrices.cabPrice;
      if (moInput && suggestedAiPrices.moPrice > 0) moInput.value = suggestedAiPrices.moPrice;
      if (legInput && suggestedAiPrices.legPrice > 0) legInput.value = suggestedAiPrices.legPrice;
      recalculateLive();
      if (aiText) aiText.innerHTML = _mSvg('checkCircle', 12, '#34d399', 'margin-right:4px;') + '<b>¡Precios sugeridos por Gemini aplicados al presupuesto!</b>';
      applyAiBtn.style.display = 'none';
    };
  }

  var resetDesignBtn = document.getElementById('btn-reset-pricing-to-design');
  if (resetDesignBtn) {
    resetDesignBtn.onclick = function() {
      if (RAPricing.currentSessionPricing) {
        RAPricing.currentSessionPricing.isManualOverride = false;
      }
      var fresh = RAPricing.resetToDesign();
      if (pInput) pInput.value = fresh.panelPrice;
      if (estInput) estInput.value = fresh.estPrice;
      if (invInput) invInput.value = fresh.invPrice;
      if (batInput) batInput.value = fresh.batPrice;
      if (cabInput) cabInput.value = fresh.cabPrice;
      if (moInput) moInput.value = fresh.moPrice;
      if (legInput) legInput.value = fresh.legPrice;
      var windInput = document.getElementById('pricing-input-wind-price');
      if (windInput) windInput.value = Math.round(fresh.windPrice || 0);
      recalculateLive();
    };
  }

  // ── GENERACIÓN Y PREVISUALIZACIÓN DE RESUMEN IA EN EL MODAL ──
  var modalGenAiSummaryBtn = document.getElementById('btn-modal-generate-ai-summary');
  var modalAiSummaryBox = document.getElementById('modal-ai-summary-box');
  var modalAiSummaryStatus = document.getElementById('modal-ai-summary-status');
  var modalClearAiSummaryBtn = document.getElementById('btn-modal-clear-ai-summary');

  // Inicializar contenido si ya hay uno personalizado o mostrar plantilla
  if (modalAiSummaryBox) {
    if (_customCommercialSummary && _customCommercialSummary.trim()) {
      modalAiSummaryBox.innerHTML = (window.RASanitize && window.RASanitize.richText) ? window.RASanitize.richText(_customCommercialSummary) : _customCommercialSummary;
      if (modalAiSummaryStatus) modalAiSummaryStatus.innerHTML = _mSvg('sparkles', 12, '#C084FC', 'margin-right:4px;') + 'Resumen personalizado listo para la oferta.';
    } else {
      modalAiSummaryBox.innerHTML = generateCommercialSummary(d, m, eq);
    }
    modalAiSummaryBox.oninput = function() {
      _customCommercialSummary = modalAiSummaryBox.innerHTML;
      if (modalAiSummaryStatus) modalAiSummaryStatus.innerHTML = _mSvg('edit', 12, '#38bdf8', 'margin-right:4px;') + 'Texto editado manualmente. Se respetará en la oferta final.';
    };
  }

  if (modalClearAiSummaryBtn) {
    modalClearAiSummaryBtn.onclick = function() {
      _customCommercialSummary = null;
      if (modalAiSummaryBox) modalAiSummaryBox.innerHTML = generateCommercialSummary(d, m, eq);
      if (modalAiSummaryStatus) modalAiSummaryStatus.innerHTML = _mSvg('clipboard', 12, '#94a3b8', 'margin-right:4px;') + 'Restablecida la plantilla estándar.';
    };
  }

  if (modalGenAiSummaryBtn) {
    modalGenAiSummaryBtn.onclick = async function() {
      if (modalAiSummaryStatus) modalAiSummaryStatus.innerHTML = _mSvg('refresh', 12, '#C084FC', 'margin-right:4px;') + '<em>Consultando a Google Gemini para redactar el resumen...</em>';
      if (modalAiSummaryBox) modalAiSummaryBox.innerHTML = '<span style="color:#C084FC;">' + _mSvg('sparkles', 12, '#C084FC', 'margin-right:4px;') + 'Conectando con Gemini y redactando propuesta ejecutiva...</span>';
      var liveD = (typeof getProjectCalcs === 'function') ? getProjectCalcs() : (d || {});
      var liveM = m;
      var liveEq = eq;
      try {
        liveD = liveD || {};
        liveD.tit = liveD.tit || {};
        if (custNombreInput && custNombreInput.value) liveD.tit.nombre = custNombreInput.value.trim();
        if (custMunInput && custMunInput.value) liveD.tit.mun = custMunInput.value.trim();
        if (custProvInput && custProvInput.value) liveD.tit.prov = custProvInput.value.trim();
        liveM = (typeof calculateFinancialModel === 'function') ? (function() {
          try { return calculateFinancialModel(); } catch(_) { return m; }
        })() : m;
        liveEq = (typeof resolveEquipmentNames === 'function') ? resolveEquipmentNames() : eq;

        var text = await requestCommercialSummaryFromGemini(liveD, liveM, liveEq);
        if (text && text.trim()) {
          _customCommercialSummary = text;
          // [AUD-2026 · B-08] La salida de la IA se sanea por allowlist antes de inyectarse.
          var _safeAiText = (window.RASanitize && typeof window.RASanitize.richText === 'function')
            ? window.RASanitize.richText(text)
            : String(text).replace(/</g, '&lt;');
          if (modalAiSummaryBox) modalAiSummaryBox.innerHTML = _safeAiText;
          if (modalAiSummaryStatus) modalAiSummaryStatus.innerHTML = _mSvg('checkCircle', 12, '#34d399', 'margin-right:4px;') + '<b>Resumen generado con éxito por Gemini.</b> Puedes retocarlo si lo deseas.';
        } else {
          throw new Error('Respuesta vacía');
        }
      } catch(eGen) {
        if (eGen.message === 'NO_API_KEY') {
          if (modalAiSummaryStatus) modalAiSummaryStatus.innerHTML = _mSvg('errorCircle', 12, '#f87171', 'margin-right:4px;') + 'Introduce tu API Key de Gemini en el Paso 5 (Datos & Logo Empresa).';
        } else {
          var _escEgen = (window.RASanitize && typeof window.RASanitize.plain === 'function')
            ? window.RASanitize.plain(eGen && eGen.message ? eGen.message : 'error')
            : String(eGen && eGen.message ? eGen.message : 'error').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          if (modalAiSummaryStatus) modalAiSummaryStatus.innerHTML = _mSvg('errorCircle', 12, '#f87171', 'margin-right:4px;') + 'No se pudo conectar con Gemini (' + _escEgen + '). Mostrando plantilla.';
        }
        if (modalAiSummaryBox) modalAiSummaryBox.innerHTML = generateCommercialSummary(liveD || d, liveM || m, liveEq || eq);
      }
    };
  }

  var presetBtns = pModal ? pModal.querySelectorAll('.btn-preset-margin') : [];
  presetBtns.forEach(function(btn) {
    btn.onclick = function() {
      var mg = parseFloat(btn.getAttribute('data-margin')) || 20;
      if (mgInput) mgInput.value = mg;
      recalculateLive();
    };
  });

  var closeModal = function(restoreInitial) {
    if (restoreInitial) {
      RAPricing.currentSessionPricing = initialPricing;
      if (typeof RAPricing !== 'undefined') {
        RAPricing._sessionCommercialConfig = initialCommCfg;
      }
    }
    if (pModal) pModal.style.display = 'none';
  };

  var closeBtn = document.getElementById('btn-close-pricing-review');
  if (closeBtn) closeBtn.onclick = function() { closeModal(true); };
  var cancelBtn = document.getElementById('btn-cancel-pricing-review');
  if (cancelBtn) cancelBtn.onclick = function() { closeModal(true); };

  if (confirmBtn) {
    confirmBtn.onclick = function() {
      var pPrice = parseFloat(pInput ? pInput.value : 125) || 0;
      var estPrice = parseFloat(estInput ? estInput.value : 0) || 0;
      var invPrice = parseFloat(invInput ? invInput.value : 0) || 0;
      var batPrice = parseFloat(batInput ? batInput.value : 0) || 0;
      var cabPrice = parseFloat(cabInput ? cabInput.value : 0) || 0;
      var moPrice = parseFloat(moInput ? moInput.value : 0) || 0;
      var legPrice = parseFloat(legInput ? legInput.value : 0) || 0;
      var windInput = document.getElementById('pricing-input-wind-price');
      var windPrice = parseFloat(windInput ? windInput.value : (designCosts.windPrice || 0)) || 0;
      var mgPct = parseFloat(mgInput ? mgInput.value : 20) || 0;

      var newCfg = {
        projectFingerprint: (typeof RAPricing !== 'undefined' && typeof RAPricing.getProjectFingerprint === 'function')
          ? RAPricing.getProjectFingerprint(numPanels)
          : null,
        panelPrice: pPrice,
        estPrice: estPrice,
        invPrice: invPrice,
        batPrice: batPrice,
        cabPrice: cabPrice,
        moPrice: moPrice,
        legPrice: legPrice,
        windPrice: windPrice,
        marginPct: mgPct,
        skipReview: false,
        isManualOverride: true
      };

      if (checkSave && checkSave.checked) {
        RAPricing.saveDefaults(newCfg);
      } else {
        RAPricing.currentSessionPricing = Object.assign({}, newCfg);
      }

      // Sincronizar inputs del desglose DOM si existen
      var setVal = function(id, val) {
        var el1 = document.getElementById(id);
        if (el1) el1.value = val;
        var el2 = document.getElementById('modal-' + id);
        if (el2) el2.value = val;
      };
      setVal('cfg-pres-est', estPrice);
      setVal('cfg-pres-inv', invPrice);
      setVal('cfg-pres-bat', batPrice);
      setVal('cfg-pres-cab', cabPrice);
      setVal('cfg-pres-mo', moPrice);
      setVal('cfg-pres-leg', legPrice);
      setVal('cfg-pres-wind', windPrice);

      // ── PERSISTIR DATOS DEL CLIENTE Y FACTURACIÓN AL SSOT (DOM & STATE) ──
      var cNom = custNombreInput ? custNombreInput.value.trim() : '';
      var cNif = custNifInput ? custNifInput.value.trim() : '';
      var cTel = custTelInput ? custTelInput.value.trim() : '';
      var cEmail = custEmailInput ? custEmailInput.value.trim() : '';
      var cDir = custDirInput ? custDirInput.value.trim() : '';
      var cMun = custMunInput ? custMunInput.value.trim() : '';
      var cProv = custProvInput ? custProvInput.value.trim() : '';
      var cCp = custCpInput ? custCpInput.value.trim() : '';
      var cCups = custCupsInput ? custCupsInput.value.trim() : '';
      var cDist = custDistSelect ? custDistSelect.value : '';
      var cConsumo = custConsumoInput ? (parseFloat(custConsumoInput.value) || 0) : 0;
      var cPot = custPotContrInput ? (parseFloat(custPotContrInput.value) || 0) : 0;
      var cPrecio = custPrecioKwhInput ? (parseFloat(custPrecioKwhInput.value) || 0) : 0;

      setVal('doc-nombre', cNom);
      setVal('doc-nif', cNif);
      setVal('doc-tel', cTel);
      setVal('doc-email', cEmail);
      setVal('doc-dir', cDir);
      setVal('doc-mun', cMun);
      setVal('doc-prov', cProv);
      setVal('doc-cp', cCp);
      if (cCups) setVal('doc-cups', cCups);
      if (cDist) setVal('doc-dist', cDist);
      if (cPot > 0) setVal('doc-potcontr', cPot.toFixed(2));
      if (cConsumo > 0) setVal('cfg-pres-consumo-anual', Math.round(cConsumo));

      if (typeof window !== 'undefined') {
        if (!window.solarProjectConfig) window.solarProjectConfig = {};
        if (cConsumo > 0) window.solarProjectConfig.manualAnnualConsumptionKWh = cConsumo;
        if (cDir || cMun) {
          window.solarProjectConfig.address = (cDir && cMun) ? (cDir + ', ' + cMun) : (cDir || cMun);
        }
        window.solarProjectConfig.clientData = {
          nombre: cNom, nif: cNif, telefono: cTel, email: cEmail,
          direccion: cDir, municipio: cMun, provincia: cProv, cp: cCp,
          cups: cCups, distribuidora: cDist
        };
        if (window.RA && window.RA.billAuditor) {
          if (window.RA.billAuditor.currentBill) {
            var cb = window.RA.billAuditor.currentBill;
            cb.titular = cb.titular || {};
            cb.titular.nombre = cNom || null;
            cb.titular.nif = cNif || null;
            cb.titular.telefono = cTel || null;
            cb.titular.email = cEmail || null;
            cb.titular.direccion = cDir || null;
            cb.titular.municipio = cMun || null;
            cb.titular.provincia = cProv || null;
            cb.titular.cp = cCp || null;
            if (cCups) cb.cups = cCups;
            if (cDist) cb.distribuidora = cDist;
            if (cPot > 0) {
              cb.potenciasContratadasKW = cb.potenciasContratadasKW || {};
              cb.potenciasContratadasKW.p1 = cPot;
            }
          }
          // Sincronizar también inputs si el auditor sigue montado en DOM
          setVal('bill-edit-tit-nombre', cNom);
          setVal('bill-edit-tit-nif', cNif);
          setVal('bill-edit-tit-tel', cTel);
          setVal('bill-edit-tit-email', cEmail);
          setVal('bill-edit-tit-dir', cDir);
          setVal('bill-edit-tit-mun', cMun);
          setVal('bill-edit-tit-prov', cProv);
          setVal('bill-edit-tit-cp', cCp);
          if (cCups) setVal('bill-edit-cups', cCups);

          if (window.RA.billAuditor.comparison) {
            if (cConsumo > 0) window.RA.billAuditor.comparison.consumoAnualKWh = cConsumo;
            if (cPrecio > 0) window.RA.billAuditor.comparison.precioMedioKWh = cPrecio;
            if (cCups) window.RA.billAuditor.comparison.cups = cCups;
            window.RA.billAuditor.comparison.titular = cNom;
            window.RA.billAuditor.comparison.cifNif = cNif;
            window.RA.billAuditor.comparison.telefono = cTel;
            window.RA.billAuditor.comparison.email = cEmail;
            window.RA.billAuditor.comparison.direccionSuministro = cDir;
            window.RA.billAuditor.comparison.municipio = cMun;
            window.RA.billAuditor.comparison.provincia = cProv;
            window.RA.billAuditor.comparison.cp = cCp;
            if (cDist) window.RA.billAuditor.comparison.distribuidora = cDist;
            if (cPot > 0) window.RA.billAuditor.comparison.potenciaContratadaP1 = cPot;
          }
        }
      }

      // Persistir configuración comercial completa (CEL, Add-ons y Descuentos)
      var curCommCfgToSave = (typeof RAPricing !== 'undefined' && typeof RAPricing.getCommercialConfig === 'function') ? RAPricing.getCommercialConfig() : {};
      if (celCheckInput) curCommCfgToSave.includeCEL = celCheckInput.checked;
      if (celPriceInput) curCommCfgToSave.celPriceEur = parseFloat(celPriceInput.value) || 0.11;
      curCommCfgToSave.addons = workingCommCfg.addons;
      curCommCfgToSave.discountEnabled = discCheckInput ? discCheckInput.checked : false;
      curCommCfgToSave.discountValue = discValInput ? (parseFloat(discValInput.value) || 0) : 0;
      curCommCfgToSave.discountType = discTypeSelect ? discTypeSelect.value : 'percent';
      curCommCfgToSave.discountLabel = (discLabelInput && discLabelInput.value.trim()) ? discLabelInput.value.trim() : 'Descuento Comercial Especial';
      if (typeof RAPricing !== 'undefined' && typeof RAPricing.saveCommercialConfig === 'function') {
        RAPricing.saveCommercialConfig(curCommCfgToSave);
      }

      wpUpdateStep5PricingBadge();
      if (typeof wpAutoSaveProjectDebounced === 'function') {
        wpAutoSaveProjectDebounced(300);
      }

      var sumContainer = document.getElementById('step5-executive-summary-container');
      if (sumContainer && typeof EngineeringExplainer !== 'undefined' && typeof EngineeringExplainer.generateExecutiveSummaryHTML === 'function') {
        var pCalcs = (typeof getProjectCalcs === 'function') ? getProjectCalcs() : {};
        sumContainer.innerHTML = EngineeringExplainer.generateExecutiveSummaryHTML(pCalcs);
      }

      if (typeof showToast === 'function') {
        showToast('PRESUPUESTO ACTUALIZADO', 'Precios y margen comercial aplicados correctamente.', 'success', 3000);
      }

      closeModal(false);
      if (typeof onConfirm === 'function') {
        onConfirm();
      }
    };
  }

  if (pModal) pModal.style.display = 'flex';
}
if (typeof window !== 'undefined') {
  window.wpOpenPricingReviewModal = wpOpenPricingReviewModal;
}


// ============================================================================
// GENERADOR DE PROPUESTA COMERCIAL & OFERTA ECONÓMICA EN PDF PARA CLIENTE
// ============================================================================

// ── INFOGRAFÍAS VECTORIALES PARA HUMANOS (FASE 4) ──────────────────────────
  function buildInfografiasHTML(m, pal, annualYieldKWh, layoutStyle, billOpts) {
    layoutStyle = layoutStyle || 'editorial';
    billOpts = billOpts || {};
    var SvgCat = (typeof window !== 'undefined' && window.RA_SvgCatalog) ? window.RA_SvgCatalog : null;
    function getIcon(name, col, sz) {
      if (!SvgCat || typeof SvgCat.render !== 'function') return '';
      return SvgCat.render(name, col || pal.primary, sz || 36);
    }

    var batKwh = (m.batCap && m.batCap > 0) ? m.batCap : (m.batCost > 0 ? 5.12 : 0);
    var hasBat = batKwh > 0;
    var modality = billOpts.installationModality || 'grid_surplus_cel';
    var isOffGrid = (modality === 'off_grid');
    var isGridZero = (modality === 'grid_zero');
    var isGridBackup = (modality === 'grid_backup');
    var refGridPrice = (typeof billOpts.referenceGridPriceEUR === 'number' && billOpts.referenceGridPriceEUR > 0)
      ? billOpts.referenceGridPriceEUR
      : (m.precioRedEUR || 0.22);

    // [SSOT] Priorizar factura real auditada del cliente frente a estimación paramétrica
    var fallbackGastoSin = Math.round(((m.consumoAnual || 3500) * (m.precioRedEUR || 0.18)) / 12) || 120;
    var gastoSin = (billOpts.gastoSin && billOpts.gastoSin > 0) ? Math.round(billOpts.gastoSin) : fallbackGastoSin;
    var gastoCon = (billOpts.gastoCon && billOpts.gastoCon > 0) ? Math.round(billOpts.gastoCon) : Math.max(15, Math.round(gastoSin - (m.ahorroMensualLuz || 65)));
    var cuotaFin = Math.round(m.cuotaMensual) || 85;
    var cuotaTotalFin = gastoCon + cuotaFin;
    var balanceFinMes = gastoSin - cuotaTotalFin;

    // Métricas específicas para instalaciones Aisladas de Red (Off-Grid) sin comparativa de facturas
    var valorEnergiaAnual = Math.round(annualYieldKWh * refGridPrice);
    var valorEnergiaMes = Math.round(valorEnergiaAnual / 12);
    var lcoePropio = (typeof m.lcoe === 'number' && m.lcoe > 0) ? m.lcoe : (m.capexNeto / Math.max(1, annualYieldKWh * 25));
    var lcoeStr = lcoePropio.toFixed(3).replace('.', ',');
    var refPriceStr = refGridPrice.toFixed(2).replace('.', ',');
    var dieselLitersAvoided = Math.round(annualYieldKWh * 0.32);
    var backupHours = hasBat ? Math.max(4, Math.round((batKwh / Math.max(0.35, (m.consumoAnual || 3500) / 8760)) * 0.85)) : 0;

    // Espaciado y padding adaptativo según layoutStyle
    var isEditorial = (layoutStyle === 'editorial');
    var isInfographic = (layoutStyle === 'infographic');
    var cardPad = isEditorial ? '18px 20px' : (isInfographic ? '16px 18px' : '12px 14px');
    var cardMargin = isEditorial ? '20px 0' : (isInfographic ? '16px 0' : '12px 0');
    var cardShadow = isEditorial ? '0 4px 16px rgba(0,0,0,0.05)' : '0 2px 8px rgba(0,0,0,0.04)';
    var cardBorder = isEditorial ? '1.5px solid #e2e8f0' : '1px solid #cbd5e1';

    // 1. Cara a cara de tu bolsillo (o Valor Económico de la Energía Generada en modo Off-Grid)
    var infoCaraACara = '';
    if (isOffGrid) {
      infoCaraACara = '<div class="ra-infographic-card ra-card-cara-a-cara" style="background:#ffffff;border:' + cardBorder + ';border-radius:12px;padding:' + cardPad + ';margin:' + cardMargin + ';box-shadow:' + cardShadow + ';">' +
        '<div style="font-weight:900;font-size:12px;color:#0f172a;text-transform:uppercase;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;">' +
          '<div style="display:flex;align-items:center;gap:8px;">' +
            getIcon('savingsChart', pal.primary, 24) +
            '<span>Coste de la Instalación y Valor de tu Energía Generada</span>' +
          '</div>' +
          '<span style="font-size:9.5px;color:' + pal.primary + ';font-weight:800;letter-spacing:0.5px;">INSTALACIÓN 100% AISLADA DE RED</span>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1.1fr 1.05fr;gap:14px;align-items:stretch;">' +
          '<div style="background:#f8fafc;border:1.5px solid #cbd5e1;border-radius:10px;padding:12px 10px;text-align:center;display:flex;flex-direction:column;justify-content:space-between;">' +
            '<div>' +
              '<div style="display:flex;justify-content:center;margin-bottom:6px;">' + getIcon('piggyBank', '#0f172a', 32) + '</div>' +
              '<div style="font-size:9px;font-weight:800;color:#475569;text-transform:uppercase;">COSTE DE LA INSTALACIÓN</div>' +
              '<div style="font-size:20px;font-weight:900;color:#0f172a;margin:4px 0;">' + Math.round(m.capexBruto).toLocaleString('es-ES') + ' €</div>' +
            '</div>' +
            '<div style="font-size:8.5px;color:#334155;line-height:1.3;margin-top:6px;">Llave en mano (o <b>' + cuotaFin + ' €/mes</b> financiado)<br><b>0 € en acometidas ni recibos</b></div>' +
          '</div>' +
          '<div style="background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:10px;padding:12px 10px;text-align:center;display:flex;flex-direction:column;justify-content:space-between;">' +
            '<div>' +
              '<div style="display:flex;justify-content:center;margin-bottom:6px;">' + getIcon('zeroEuro', '#16a34a', 32) + '</div>' +
              '<div style="font-size:9px;font-weight:800;color:#166534;text-transform:uppercase;">ENERGÍA QUE NO COMPRAS A LA RED</div>' +
              '<div style="font-size:20px;font-weight:900;color:#16a34a;margin:4px 0;">' + valorEnergiaAnual.toLocaleString('es-ES') + ' €/año</div>' +
            '</div>' +
            '<div style="font-size:8.5px;color:#14532d;line-height:1.3;margin-top:6px;"><b>' + Math.round(annualYieldKWh).toLocaleString('es-ES') + ' kWh/año</b> generados (' + valorEnergiaMes + ' €/mes valorados a ' + refPriceStr + ' €/kWh)</div>' +
          '</div>' +
          '<div style="background:#eff6ff;border:1.5px solid #bfdbfe;border-radius:10px;padding:12px 10px;text-align:center;display:flex;flex-direction:column;justify-content:space-between;">' +
            '<div>' +
              '<div style="display:flex;justify-content:center;margin-bottom:6px;">' + getIcon('shieldCheck', '#2563eb', 32) + '</div>' +
              '<div style="font-size:9px;font-weight:800;color:#1e40af;text-transform:uppercase;">PRECIO PROPIO DE TU ENERGÍA (25 AÑOS)</div>' +
              '<div style="font-size:20px;font-weight:900;color:#2563eb;margin:4px 0;">' + lcoeStr + ' €/kWh</div>' +
            '</div>' +
            '<div style="font-size:8.5px;color:#1e3a8a;line-height:1.3;margin-top:6px;">' +
              'Frente a ' + refPriceStr + ' €/kWh en red eléctrica<br>' +
              '<b style="color:#16a34a;">Evita ~' + dieselLitersAvoided.toLocaleString('es-ES') + ' L/año de diésel</b>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    } else {
      var modeBadge = isGridZero ? 'AUTOCONSUMO ADAPTADO AL CONSUMO' : (isGridBackup ? 'ESTUDIO DE FACTURA + RESPALDO LFP' : 'ESTUDIO DE FACTURA');
      infoCaraACara = '<div class="ra-infographic-card ra-card-cara-a-cara" style="background:#ffffff;border:' + cardBorder + ';border-radius:12px;padding:' + cardPad + ';margin:' + cardMargin + ';box-shadow:' + cardShadow + ';">' +
        '<div style="font-weight:900;font-size:12px;color:#0f172a;text-transform:uppercase;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;">' +
          '<div style="display:flex;align-items:center;gap:8px;">' +
            getIcon('savingsChart', pal.primary, 24) +
            '<span>El Cara a Cara de tu Bolsillo (Impacto Mensual)</span>' +
          '</div>' +
          '<span style="font-size:9.5px;color:#64748b;font-weight:700;letter-spacing:0.5px;">' + modeBadge + '</span>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr 1.15fr;gap:14px;align-items:stretch;">' +
          '<div style="background:#fef2f2;border:1.5px solid #fecaca;border-radius:10px;padding:12px 10px;text-align:center;display:flex;flex-direction:column;justify-content:space-between;">' +
            '<div>' +
              '<div style="display:flex;justify-content:center;margin-bottom:6px;">' + getIcon('billCut', '#dc2626', 32) + '</div>' +
              '<div style="font-size:9px;font-weight:800;color:#991b1b;text-transform:uppercase;">HOY (SIN PLACAS)</div>' +
              '<div style="font-size:20px;font-weight:900;color:#dc2626;margin:4px 0;">-' + gastoSin + ' €/mes</div>' +
            '</div>' +
            '<div style="font-size:8.5px;color:#7f1d1d;line-height:1.3;margin-top:6px;">Dinero 100% perdido en alquiler a la eléctrica</div>' +
          '</div>' +
          '<div style="background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:10px;padding:12px 10px;text-align:center;display:flex;flex-direction:column;justify-content:space-between;">' +
            '<div>' +
              '<div style="display:flex;justify-content:center;margin-bottom:6px;">' + getIcon('zeroEuro', '#16a34a', 32) + '</div>' +
              '<div style="font-size:9px;font-weight:800;color:#166534;text-transform:uppercase;">CON SOLAR (CONTADO)</div>' +
              '<div style="font-size:20px;font-weight:900;color:#16a34a;margin:4px 0;">' + gastoCon + ' €/mes</div>' +
            '</div>' +
            '<div style="font-size:8.5px;color:#14532d;line-height:1.3;margin-top:6px;"><b>Ahorro directo de hasta el 85%</b></div>' +
          '</div>' +
          '<div style="background:#eff6ff;border:1.5px solid #bfdbfe;border-radius:10px;padding:12px 10px;text-align:center;display:flex;flex-direction:column;justify-content:space-between;">' +
            '<div>' +
              '<div style="display:flex;justify-content:center;margin-bottom:6px;">' + getIcon('piggyBank', '#2563eb', 32) + '</div>' +
              '<div style="font-size:9px;font-weight:800;color:#1e40af;text-transform:uppercase;">FINANCIADO (0 € ENTRADA)</div>' +
              '<div style="font-size:20px;font-weight:900;color:#2563eb;margin:4px 0;">' + cuotaTotalFin + ' €/mes</div>' +
            '</div>' +
            '<div style="font-size:8.5px;color:#1e3a8a;line-height:1.3;margin-top:6px;">' +
              'Recibo (' + gastoCon + '€) + Cuota (' + cuotaFin + '€)<br>' +
              '<b style="color:' + (balanceFinMes >= 0 ? '#16a34a' : '#2563eb') + ';">' + (balanceFinMes >= 0 ? ('¡Te sobran +' + balanceFinMes + ' €/mes!') : 'Se paga sola con el ahorro') + '</b>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    }

    // 2. El Reloj Solar de 24 Horas
    var genDia = Math.round(annualYieldKWh / 365);
    var excDia = Math.round((m.excedenteKWh || annualYieldKWh * 0.35) / 365);
    var relojTitle = isOffGrid
      ? 'Ciclo de Autonomía 24 Horas & Reserva Independiente'
      : (isGridBackup ? 'Ciclo Solar 24 Horas & Escudo Anti-Apagones' : 'El Ciclo de 24 Horas de tu Tejado Solar');
    var relojBadge = isOffGrid
      ? 'SUPERVIVENCIA OFF-GRID 24/7'
      : (isGridZero ? 'VERTIDO CERO · AJUSTADO A DEMANDA' : (isGridBackup ? 'AUTARQUÍA + BACKUP CRÍTICO' : 'AUTARQUÍA EN TIEMPO REAL'));
    var midCardText = '';
    if (isOffGrid) {
      midCardText = '<b>Generación propia (~' + genDia + ' kWh/día)</b>. Alimenta la vivienda al 100% y recarga prioritariamente tu reserva de baterías (' + (hasBat ? (batKwh + ' kWh LFP') : 'banco acumulador') + ').';
    } else if (isGridZero) {
      midCardText = '<b>Energía gratis (~' + genDia + ' kWh/día)</b>. El inversor modula la producción adaptándola exactamente a tu curva de consumo e inyectando en batería sin verter a la red.';
    } else {
      midCardText = '<b>Energía gratis (~' + genDia + ' kWh/día)</b>. Climatización sin coste. Los excedentes (~' + excDia + ' kWh/día) ' + (hasBat ? 'cargan tu batería LFP.' : 'generan saldo en tu monedero solar.');
    }
    var nightCardText = '';
    if (isOffGrid) {
      nightCardText = hasBat
        ? ('Suministro 100% autónomo desde tus <b>' + batKwh + ' kWh LFP (~' + backupHours + 'h de reserva)</b> con 0 € de red y sin ruido de generador diésel.')
        : 'Suministro nocturno cubierto íntegramente mediante tu sistema de acumulación aislado sin depender de la red.';
    } else if (isGridBackup && hasBat) {
      nightCardText = 'Alimentación desde tus <b>' + batKwh + ' kWh LFP</b> con <b>respaldo anti-apagones (~' + backupHours + 'h de autonomía crítica)</b> ante caídas de red.';
    } else if (isGridZero && !hasBat) {
      nightCardText = 'Transición automática y transparente al suministro de red tras cubrir el 100% del consumo solar diurno.';
    } else {
      nightCardText = (hasBat ? ('Alimentación limpia desde los <b>' + batKwh + ' kWh guardados en tu Batería</b> sin consumir de la red.') : 'Compensación nocturna automática con los excedentes vertidos a la red durante el día.');
    }

    var infoRelojSolar = '<div class="ra-infographic-card ra-card-reloj-solar" style="background:#ffffff;border:' + cardBorder + ';border-radius:12px;padding:' + cardPad + ';margin:' + cardMargin + ';box-shadow:' + cardShadow + ';">' +
      '<div style="font-weight:900;font-size:12px;color:#0f172a;text-transform:uppercase;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;">' +
        '<div style="display:flex;align-items:center;gap:8px;">' +
          getIcon('energyFlow24h', pal.primary, 24) +
          '<span>' + relojTitle + '</span>' +
        '</div>' +
        '<span style="font-size:9.5px;color:#64748b;font-weight:700;letter-spacing:0.5px;">' + relojBadge + '</span>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">' +
        '<div style="background:#fffbeb;border:1px solid #fef3c7;border-radius:10px;padding:12px 10px;text-align:left;">' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">' +
            getIcon('morningSun', '#d97706', 28) +
            '<div style="font-size:10.5px;font-weight:900;color:#b45309;">08:00 - 11:00<br><span style="font-size:9px;font-weight:700;color:#92400e;">Despertar Solar</span></div>' +
          '</div>' +
          '<div style="font-size:9px;color:#78350f;line-height:1.4;">' +
            'Tus placas captan los primeros rayos. Cubren el consumo base matinal (frigoríficos, bombas, iluminación y equipos en espera).' +
          '</div>' +
        '</div>' +
        '<div style="background:#f0fdf4;border:1px solid #dcfce7;border-radius:10px;padding:12px 10px;text-align:left;">' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">' +
            getIcon('peakSun', '#16a34a', 28) +
            '<div style="font-size:10.5px;font-weight:900;color:#15803d;">11:00 - 17:00<br><span style="font-size:9px;font-weight:700;color:#14532d;">' + (isOffGrid ? 'Cosecha & Carga LFP' : 'Pico 100% Gratis') + '</span></div>' +
          '</div>' +
          '<div style="font-size:9px;color:#14532d;line-height:1.4;">' +
            midCardText +
          '</div>' +
        '</div>' +
        '<div style="background:#f1f5f9;border:1px solid #e2e8f0;border-radius:10px;padding:12px 10px;text-align:left;">' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">' +
            getIcon('eveningMoon', '#475569', 28) +
            '<div style="font-size:10.5px;font-weight:900;color:#334155;">17:00 - 08:00<br><span style="font-size:9px;font-weight:700;color:#1e293b;">' + (isOffGrid ? 'Autonomía Nocturna' : 'Noche Protegida') + '</span></div>' +
          '</div>' +
          '<div style="font-size:9px;color:#475569;line-height:1.4;">' +
            nightCardText +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';

    // 3. Anatomía del Tejado Blindado (4 Escudos Técnicos)
    var infoTejadoBlindado = '<div style="background:#ffffff;border:' + cardBorder + ';border-radius:12px;padding:' + cardPad + ';margin:' + cardMargin + ';box-shadow:' + cardShadow + ';">' +
      '<div style="font-weight:900;font-size:12px;color:#0f172a;text-transform:uppercase;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;">' +
        '<div style="display:flex;align-items:center;gap:8px;">' +
          getIcon('shieldCheck', pal.primary, 24) +
          '<span>Seguridad Técnica & Garantías de la Instalación</span>' +
        '</div>' +
        '<span style="font-size:9.5px;color:#64748b;font-weight:700;letter-spacing:0.5px;">NORMATIVA CTE & REBT</span>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;">' +
        '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 8px;text-align:center;">' +
          '<div style="display:flex;justify-content:center;margin-bottom:6px;">' + getIcon('structure', pal.primary, 30) + '</div>' +
          '<div style="font-weight:800;font-size:10px;color:#0f172a;margin:2px 0;">Triple Estanqueidad</div>' +
          '<div style="font-size:8px;color:#64748b;line-height:1.3;">Juntas EPDM estancas sin perforación invasiva. Cero goteras garantizadas.</div>' +
        '</div>' +
        '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 8px;text-align:center;">' +
          '<div style="display:flex;justify-content:center;margin-bottom:6px;">' + getIcon('panel', pal.primary, 30) + '</div>' +
          '<div style="font-weight:800;font-size:10px;color:#0f172a;margin:2px 0;">Vientos 120 km/h</div>' +
          '<div style="font-size:8px;color:#64748b;line-height:1.3;">Estructura calculada según CTE DB-SE-AE. Perfilería aluminio anodizado e inox A2.</div>' +
        '</div>' +
        '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 8px;text-align:center;">' +
          '<div style="display:flex;justify-content:center;margin-bottom:6px;">' + getIcon('protections', pal.primary, 30) + '</div>' +
          '<div style="font-weight:800;font-size:10px;color:#0f172a;margin:2px 0;">Doble Protección</div>' +
          '<div style="font-size:8px;color:#64748b;line-height:1.3;">Descargadores SPD Clase II contra sobretensiones y seccionador DC homologado.</div>' +
        '</div>' +
        '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 8px;text-align:center;">' +
          '<div style="display:flex;justify-content:center;margin-bottom:6px;">' + getIcon('warranty25', pal.primary, 30) + '</div>' +
          '<div style="font-weight:800;font-size:10px;color:#0f172a;margin:2px 0;">25 Años Rendimiento</div>' +
          '<div style="font-size:8px;color:#64748b;line-height:1.3;">Garantía de producción lineal Tier-1 con rendimiento ≥84,8% a 25 años.</div>' +
        '</div>' +
      '</div>' +
    '</div>';

    // 4. Cascada del Escudo Fiscal (Waterfall)
    var ibiEur = Math.round(m.ahorroIBITotal || 0);
    var isEmpresa = (m.customerProfile === 'empresa');
    var deducNombre = isEmpresa
      ? ('Libertad Amortización IS (' + Math.round((m.isRate || 0.25) * 100) + '%)')
      : ('Deducción IRPF' + (m.irpfPct ? ' (' + Math.round(m.irpfPct * 100) + '%)' : ''));
    var deducEur = isEmpresa ? Math.round(m.ahorroSociedades || 0) : Math.round(m.ahorroIRPF || 0);
    var capexNet = Math.round(m.capexNeto || (m.capexBruto - ibiEur - deducEur));
    var infoCascadaFiscal = '<div style="background:#ffffff;border:' + cardBorder + ';border-radius:12px;padding:' + cardPad + ';margin:' + cardMargin + ';box-shadow:' + cardShadow + ';">' +
      '<div style="font-weight:900;font-size:12px;color:#0f172a;text-transform:uppercase;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;">' +
        '<div style="display:flex;align-items:center;gap:8px;">' +
          getIcon('certifiedEngineer', pal.primary, 24) +
          '<span>La Cascada del Escudo Fiscal (Tus Ahorros en Impuestos)</span>' +
        '</div>' +
        '<span style="font-size:9.5px;color:#64748b;font-weight:700;letter-spacing:0.5px;">BONIFICACIONES OFICIALES</span>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1.1fr auto 1fr auto 1fr auto 1.2fr;align-items:center;gap:8px;font-size:9.5px;text-align:center;">' +
        '<div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;padding:10px 8px;">' +
          '<div style="font-size:8.5px;color:#64748b;font-weight:700;">Inversión Llave en Mano</div>' +
          '<b style="font-size:13px;color:#0f172a;display:block;margin-top:2px;">' + Math.round(m.capexBruto).toLocaleString('es-ES') + ' €</b>' +
        '</div>' +
        '<span style="font-size:16px;font-weight:bold;color:#94a3b8;">−</span>' +
        '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 8px;">' +
          '<div style="font-size:8.5px;color:#166534;font-weight:700;">Bonificación IBI</div>' +
          '<b style="font-size:13px;color:#16a34a;display:block;margin-top:2px;">' + ibiEur.toLocaleString('es-ES') + ' €</b>' +
        '</div>' +
        '<span style="font-size:16px;font-weight:bold;color:#94a3b8;">−</span>' +
        '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 8px;">' +
          '<div style="font-size:8.5px;color:#166534;font-weight:700;">' + deducNombre + '</div>' +
          '<b style="font-size:13px;color:#16a34a;display:block;margin-top:2px;">' + deducEur.toLocaleString('es-ES') + ' €</b>' +
        '</div>' +
        '<span style="font-size:16px;font-weight:bold;color:#94a3b8;">=</span>' +
        '<div style="background:' + pal.light + ';border:2px solid ' + pal.primary + ';border-radius:8px;padding:10px 8px;">' +
          '<div style="font-size:8.5px;color:' + pal.dark + ';font-weight:800;">COSTE NETO REAL</div>' +
          '<b style="font-size:14px;color:' + pal.primary + ';display:block;margin-top:2px;">' + capexNet.toLocaleString('es-ES') + ' €</b>' +
        '</div>' +
      '</div>' +
    '</div>';

    return {
      caraACara: infoCaraACara,
      relojSolar: infoRelojSolar,
      tejadoBlindado: infoTejadoBlindado,
      cascadaFiscal: infoCascadaFiscal
    };
  }

  // ── COMUNIDAD ENERGÉTICA LOCAL (CEL · MARCO RDL 7/2026 RADIO 5 KM) ──────────
  function calculateCELMetrics(d, m, customCelPrice) {
    d = d || {};
    m = m || {};
    var genKWh = Math.round(m.annualYieldKWh || (d && d.annualKWh) || 0);
    var autoKWh = Math.round(m.autoconsumoDirecto || (genKWh * (m.autarquiaPct || 65) / 100));
    var batKWh = Math.round(m.bateriaKWh || 0);
    var excKWh = Math.round(m.excedenteKWh != null ? m.excedenteKWh : Math.max(0, genKWh - autoKWh - batKWh));
    if (excKWh <= 0 && genKWh > 0) {
      excKWh = Math.round(genKWh * 0.35); // Estimación canónica de vertido estacional
    }

    var precioPool = (m && typeof m.precioCompensacionEUR === 'number' && m.precioCompensacionEUR > 0)
      ? m.precioCompensacionEUR
      : 0.05; // Alineado con compensación / pool del motor financiero
    var precioCEL = (typeof customCelPrice === 'number' && customCelPrice > 0) ? customCelPrice : 0.11; // €/kWh Venta local P2P CEL

    var ingresoPoolAnual = Math.round(excKWh * precioPool);
    var ingresoCELAnual = Math.round(excKWh * precioCEL);
    var beneficioExtraCEL = Math.max(0, ingresoCELAnual - ingresoPoolAnual);
    var ahorroTotalConCEL = Math.round((m.ahorroLuzAnio1 || 0) + beneficioExtraCEL);

    // [SSOT Dinámico] Deducir el payback tradicional y CEL del flujo de caja acumulado real (con degradación, rescate fiscal e IPC)
    var paybackTradicional = 25;
    if (m && Array.isArray(m.cashflowAcumSinCEL) && m.cashflowAcumSinCEL.length > 1) {
      for (var yt = 1; yt < m.cashflowAcumSinCEL.length; yt++) {
        if (m.cashflowAcumSinCEL[yt] >= 0) {
          var ptv = m.cashflowAcumSinCEL[yt - 1];
          var dtv = m.cashflowAcumSinCEL[yt] - ptv;
          paybackTradicional = dtv > 0 ? (yt - 1) + (-ptv / dtv) : yt;
          break;
        }
      }
    } else if (m.paybackYears && isFinite(m.paybackYears) && m.paybackYears > 0) {
      paybackTradicional = m.paybackYears;
    } else {
      paybackTradicional = 6.5;
    }

    var paybackCEL = 25;
    if (m && Array.isArray(m.cashflowAcum) && m.cashflowAcum.length > 1) {
      for (var yc = 1; yc < m.cashflowAcum.length; yc++) {
        if (m.cashflowAcum[yc] >= 0) {
          var pcv = m.cashflowAcum[yc - 1];
          var dcv = m.cashflowAcum[yc] - pcv;
          paybackCEL = dcv > 0 ? (yc - 1) + (-pcv / dcv) : yc;
          break;
        }
      }
    }
    // Fallback si no cruzó cero en 25 años o no había serie
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
    var co2EvitadoKg = Math.round(excKWh * (((typeof window !== 'undefined' && window.SOLAR_ENGINE_CONSTANTS && window.SOLAR_ENGINE_CONSTANTS.CO2_FACTOR_SPAIN) || 0.259)));

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

  function buildCELPageHTML(d, m, pal, cel, pageNum, totPages, companyName, pageNum2, buildInnerHeaderFn, studioCfg) {
    pal = pal || { primary: '#059669', light: '#d1fae5', accent: '#10b981', dark: '#065f46' };
    cel = cel || calculateCELMetrics(d, m);
    d = d || {};
    pageNum = pageNum || 5;
    pageNum2 = pageNum2 || (pageNum + 1);
    totPages = totPages || 8;
    companyName = companyName || 'SOLAR 3D PRO';
    var _escCel = function(v) {
      if (window.RASanitize && typeof window.RASanitize.plain === 'function') return window.RASanitize.plain(v);
      return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    };

    const cfg = studioCfg || {};
    const flowH = (typeof cfg.celFlowBarHeightPx === 'number' && cfg.celFlowBarHeightPx >= 18) ? cfg.celFlowBarHeightPx : 26;
    const flowSize = (typeof cfg.celFlowFontSize === 'number') ? cfg.celFlowFontSize : 9.5;
    const flowDescSize = (typeof cfg.celFlowDescFontSize === 'number') ? cfg.celFlowDescFontSize : 9.0;
    const radarH = (typeof cfg.celRadarHeightPx === 'number' && cfg.celRadarHeightPx >= 160) ? Math.max(cfg.celRadarHeightPx, 290) : 310;
    const radarLblSize = (typeof cfg.celRadarLabelFontSize === 'number') ? cfg.celRadarLabelFontSize : 11.5;
    const radarDistSize = (typeof cfg.celRadarDistanceFontSize === 'number') ? cfg.celRadarDistanceFontSize : 10.5;
    const celCardsGap = (typeof cfg.celCardsGapPx === 'number') ? cfg.celCardsGapPx : 8;

    var autoW = Math.max(15, cel.autoPct);
    var batW = cel.batPct > 0 ? Math.max(10, cel.batPct) : 0;
    var excW = Math.max(15, 100 - autoW - batW);

    // Desglose proporcional de los excedentes e ingresos por nodo receptor según perfil horario βh
    var excTotal = Math.max(0, Math.round(cel.excKWh || 0));
    var ingTotal = Math.max(0, Math.round(cel.ingresoCELAnual || 0));
    var n1Kwh = Math.round(excTotal * 0.25), n1Eur = Math.round(ingTotal * 0.25); // Viviendas (25%)
    var n2Kwh = Math.round(excTotal * 0.30), n2Eur = Math.round(ingTotal * 0.30); // Comercio (30%)
    var n3Kwh = Math.round(excTotal * 0.15), n3Eur = Math.round(ingTotal * 0.15); // Colegio (15%)
    var n4Kwh = Math.round(excTotal * 0.20), n4Eur = Math.round(ingTotal * 0.20); // PYME / Taller (20%)
    var n5Kwh = Math.max(0, excTotal - n1Kwh - n2Kwh - n3Kwh - n4Kwh);            // Comunidad Vecinos (10%)
    var n5Eur = Math.max(0, ingTotal - n1Eur - n2Eur - n3Eur - n4Eur);
    var pCelStr = (typeof cel.precioCEL === 'number' ? cel.precioCEL.toFixed(2).replace('.', ',') : '0,11');

    // SVG Mapa Técnico-Comercial Clean-Tech de Cobertura 5.000 metros (78,5 km² según RDL 7/2026)
    // Proporción métrica real (1 km = 25px, 2,5 km = 62,5px, 5 km = 125px) + Tarjetas de Liquidación Horaria βh sin colisiones
    var radarSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 390" width="100%" height="100%" style="display:block;">' +
      '<defs>' +
        '<radialGradient id="celRadarGlowClean" cx="50%" cy="50%" r="50%">' +
          '<stop offset="0%" stop-color="' + pal.primary + '" stop-opacity="0.18"/>' +
          '<stop offset="55%" stop-color="' + pal.accent + '" stop-opacity="0.08"/>' +
          '<stop offset="100%" stop-color="#f8fafc" stop-opacity="0.0"/>' +
        '</radialGradient>' +
        '<linearGradient id="celHeaderBar" x1="0%" y1="0%" x2="100%" y2="0%">' +
          '<stop offset="0%" stop-color="#0f172a"/>' +
          '<stop offset="100%" stop-color="#1e293b"/>' +
        '</linearGradient>' +
        '<filter id="celCardShadow" x="-8%" y="-8%" width="116%" height="120%">' +
          '<feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="#0f172a" flood-opacity="0.07"/>' +
        '</filter>' +
      '</defs>' +

      // Fondo Clean-Tech luminoso apto para pantalla e impresión ejecutiva
      '<rect x="0" y="0" width="680" height="390" rx="10" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.2"/>' +

      // Cabecera integrada sin colisiones
      '<path d="M 0 10 Q 0 0 10 0 L 670 0 Q 680 0 680 10 L 680 34 L 0 34 Z" fill="url(#celHeaderBar)"/>' +
      '<circle cx="16" cy="17" r="4.5" fill="#10b981"/>' +
      '<text x="27" y="21" fill="#f8fafc" font-size="9.5" font-weight="900" letter-spacing="0.4">REPARTO LOCAL P2P · TELEMEDIDA HORARIA βh (ORDEN TED/1247/2021)</text>' +
      '<rect x="478" y="6" width="192" height="22" rx="4" fill="rgba(16,185,129,0.18)" stroke="#10b981" stroke-width="1"/>' +
      '<text x="574" y="20.5" fill="#6ee7b7" font-size="9" font-weight="900" text-anchor="middle" letter-spacing="0.3">RADIO LEGAL 5.000 m (78,5 km²)</text>' +

      // Ejes cartesianos y retícula topográfica sutil
      '<line x1="340" y1="40" x2="340" y2="338" stroke="#cbd5e1" stroke-width="1" stroke-dasharray="3,3"/>' +
      '<line x1="185" y1="186" x2="495" y2="186" stroke="#cbd5e1" stroke-width="1" stroke-dasharray="3,3"/>' +

      // Anillos concéntricos con escala métrica verdadera (25px = 1 km)
      // Anillo 5.000 m (r = 125)
      '<circle cx="340" cy="186" r="125" fill="url(#celRadarGlowClean)" stroke="' + pal.primary + '" stroke-width="2" stroke-dasharray="6,4"/>' +
      // Anillo 2.500 m (r = 62.5)
      '<circle cx="340" cy="186" r="62.5" fill="none" stroke="#64748b" stroke-width="1.2" stroke-dasharray="4,4" opacity="0.65"/>' +
      // Anillo 1.000 m (r = 25)
      '<circle cx="340" cy="186" r="25" fill="none" stroke="#64748b" stroke-width="1.1" opacity="0.5"/>' +

      // Etiquetas de anillos radiales (con pastilla de lectura limpia)
      '<rect x="344" y="152" width="52" height="13" rx="3" fill="#ffffff" opacity="0.88"/>' +
      '<text x="347" y="161" fill="#475569" font-size="8" font-weight="800" font-family="monospace">1,0 km</text>' +
      '<rect x="344" y="115" width="52" height="13" rx="3" fill="#ffffff" opacity="0.88"/>' +
      '<text x="347" y="124" fill="#475569" font-size="8" font-weight="800" font-family="monospace">2,5 km</text>' +
      '<rect x="292" y="53" width="96" height="15" rx="4" fill="' + pal.light + '" stroke="' + pal.primary + '" stroke-width="1"/>' +
      '<text x="340" y="63.5" fill="' + pal.dark + '" font-size="8.5" font-weight="900" font-family="monospace" text-anchor="middle">PERÍMETRO 5,0 km</text>' +

      //Vectores de despacho energético desde el Hub Central (340, 186) hasta la posición real en escala de cada consumidor
      // 1. Viviendas (1,2 km -> r=30px, Noroeste: 318, 165) -> Conector a tarjeta Izquierda-Arriba
      '<polyline points="340,186 318,165 202,92" fill="none" stroke="#0284c7" stroke-width="1.8" stroke-dasharray="3,2"/>' +
      // 2. Comercio (2,1 km -> r=52.5px, Noreste: 383, 156) -> Conector a tarjeta Derecha-Arriba
      '<polyline points="340,186 383,156 478,92" fill="none" stroke="#d97706" stroke-width="1.8" stroke-dasharray="3,2"/>' +
      // 3. Colegio (3,8 km -> r=95px, Sureste: 424, 230) -> Conector a tarjeta Derecha-Abajo
      '<polyline points="340,186 424,230 478,244" fill="none" stroke="#7c3aed" stroke-width="1.8" stroke-dasharray="3,2"/>' +
      // 4. PYME / Taller (4,4 km -> r=110px, Suroeste: 242, 236) -> Conector a tarjeta Izquierda-Abajo
      '<polyline points="340,186 242,236 202,244" fill="none" stroke="#059669" stroke-width="1.8" stroke-dasharray="3,2"/>' +
      // 5. Comunidad Vecinos (4,9 km -> r=122.5px, Sur: 340, 308.5) -> Conector a tarjeta Sur
      '<line x1="340" y1="186" x2="340" y2="308.5" stroke="#db2777" stroke-width="1.8" stroke-dasharray="3,2"/>' +

      // Puntos geográficos exactos dentro del radar
      '<circle cx="318" cy="165" r="6" fill="#0284c7" stroke="#ffffff" stroke-width="2"/>' +
      '<circle cx="383" cy="156" r="6" fill="#d97706" stroke="#ffffff" stroke-width="2"/>' +
      '<circle cx="424" cy="230" r="6" fill="#7c3aed" stroke="#ffffff" stroke-width="2"/>' +
      '<circle cx="242" cy="236" r="6" fill="#059669" stroke="#ffffff" stroke-width="2"/>' +
      '<circle cx="340" cy="308.5" r="6" fill="#db2777" stroke="#ffffff" stroke-width="2"/>' +

      // ── TARJETA NODO 1: VIVIENDAS (1,2 km · Noroeste) ──
      '<g filter="url(#celCardShadow)">' +
        '<rect x="14" y="58" width="188" height="64" rx="7" fill="#ffffff" stroke="#bae6fd" stroke-width="1.5"/>' +
        '<rect x="14" y="58" width="5" height="64" rx="2.5" fill="#0284c7"/>' +
        '<text x="26" y="74" fill="#0f172a" font-size="10.5" font-weight="900">Viviendas Residenciales</text>' +
        '<rect x="150" y="63" width="44" height="14" rx="3" fill="#e0f2fe"/>' +
        '<text x="172" y="73" fill="#0369a1" font-size="8.5" font-weight="900" text-anchor="middle">1,2 km</text>' +
        '<text x="26" y="88" fill="#475569" font-size="8.5" font-weight="700">βh = 0,25 · Demanda Tarde / Fin Sem.</text>' +
        '<text x="26" y="103" fill="#0369a1" font-size="9.5" font-weight="900">' + n1Kwh.toLocaleString('es-ES') + ' kWh/año → +' + n1Eur.toLocaleString('es-ES') + ' €/año</text>' +
        '<text x="26" y="115" fill="#64748b" font-size="7.8" font-weight="600">Climatización, ACS y electrodomésticos</text>' +
      '</g>' +

      // ── TARJETA NODO 2: COMERCIO LOCAL (2,1 km · Noreste) ──
      '<g filter="url(#celCardShadow)">' +
        '<rect x="478" y="58" width="188" height="64" rx="7" fill="#ffffff" stroke="#fde68a" stroke-width="1.5"/>' +
        '<rect x="478" y="58" width="5" height="64" rx="2.5" fill="#d97706"/>' +
        '<text x="490" y="74" fill="#0f172a" font-size="10.5" font-weight="900">Comercio y Hostelería</text>' +
        '<rect x="614" y="63" width="44" height="14" rx="3" fill="#fef3c7"/>' +
        '<text x="636" y="73" fill="#b45309" font-size="8.5" font-weight="900" text-anchor="middle">2,1 km</text>' +
        '<text x="490" y="88" fill="#475569" font-size="8.5" font-weight="700">βh = 0,30 · Curva Plana 09h–21h</text>' +
        '<text x="490" y="103" fill="#b45309" font-size="9.5" font-weight="900">' + n2Kwh.toLocaleString('es-ES') + ' kWh/año → +' + n2Eur.toLocaleString('es-ES') + ' €/año</text>' +
        '<text x="490" y="115" fill="#64748b" font-size="7.8" font-weight="600">Cámaras frigoríficas y climatización</text>' +
      '</g>' +

      // ── TARJETA NODO 3: COLEGIO / EQUIPAMIENTO (3,8 km · Sureste) ──
      '<g filter="url(#celCardShadow)">' +
        '<rect x="478" y="210" width="188" height="64" rx="7" fill="#ffffff" stroke="#ddd6fe" stroke-width="1.5"/>' +
        '<rect x="478" y="210" width="5" height="64" rx="2.5" fill="#7c3aed"/>' +
        '<text x="490" y="226" fill="#0f172a" font-size="10.5" font-weight="900">Colegio / Centro Público</text>' +
        '<rect x="614" y="215" width="44" height="14" rx="3" fill="#ede9fe"/>' +
        '<text x="636" y="225" fill="#6d28d9" font-size="8.5" font-weight="900" text-anchor="middle">3,8 km</text>' +
        '<text x="490" y="240" fill="#475569" font-size="8.5" font-weight="700">βh = 0,15 · Punta Matinal 08h–16h</text>' +
        '<text x="490" y="255" fill="#6d28d9" font-size="9.5" font-weight="900">' + n3Kwh.toLocaleString('es-ES') + ' kWh/año → +' + n3Eur.toLocaleString('es-ES') + ' €/año</text>' +
        '<text x="490" y="267" fill="#64748b" font-size="7.8" font-weight="600">Sincronía 100% con cenit solar diurno</text>' +
      '</g>' +

      // ── TARJETA NODO 4: PYME / TALLER (4,4 km · Suroeste) ──
      '<g filter="url(#celCardShadow)">' +
        '<rect x="14" y="210" width="188" height="64" rx="7" fill="#ffffff" stroke="#a7f3d0" stroke-width="1.5"/>' +
        '<rect x="14" y="210" width="5" height="64" rx="2.5" fill="#059669"/>' +
        '<text x="26" y="226" fill="#0f172a" font-size="10.5" font-weight="900">PYME / Taller Industrial</text>' +
        '<rect x="150" y="215" width="44" height="14" rx="3" fill="#d1fae5"/>' +
        '<text x="172" y="225" fill="#047857" font-size="8.5" font-weight="900" text-anchor="middle">4,4 km</text>' +
        '<text x="26" y="240" fill="#475569" font-size="8.5" font-weight="700">βh = 0,20 · Jornada Intensiva L–V</text>' +
        '<text x="26" y="255" fill="#047857" font-size="9.5" font-weight="900">' + n4Kwh.toLocaleString('es-ES') + ' kWh/año → +' + n4Eur.toLocaleString('es-ES') + ' €/año</text>' +
        '<text x="26" y="267" fill="#64748b" font-size="7.8" font-weight="600">Maquinaria, compresores y recarga VE</text>' +
      '</g>' +

      // ── TARJETA NODO 5: COMUNIDAD DE VECINOS (4,9 km · Sur) ──
      '<g filter="url(#celCardShadow)">' +
        '<rect x="354" y="286" width="196" height="50" rx="7" fill="#ffffff" stroke="#fbcfe8" stroke-width="1.5"/>' +
        '<rect x="354" y="286" width="5" height="50" rx="2.5" fill="#db2777"/>' +
        '<text x="366" y="301" fill="#0f172a" font-size="10" font-weight="900">Comunidad Vecinal (4,9 km)</text>' +
        '<text x="366" y="314" fill="#475569" font-size="8.2" font-weight="700">βh = 0,10 · Ascensores, garaje y bombeo</text>' +
        '<text x="366" y="328" fill="#be185d" font-size="9.2" font-weight="900">' + n5Kwh.toLocaleString('es-ES') + ' kWh/año → +' + n5Eur.toLocaleString('es-ES') + ' €/año</text>' +
      '</g>' +

      // ── NÚCLEO CENTRAL: TU HUB GENERADOR ──
      '<circle cx="340" cy="186" r="22" fill="' + pal.primary + '" opacity="0.22"/>' +
      '<circle cx="340" cy="186" r="13" fill="#ffffff" stroke="' + pal.primary + '" stroke-width="3.5"/>' +
      '<circle cx="340" cy="186" r="5.5" fill="' + pal.dark + '"/>' +
      '<g filter="url(#celCardShadow)">' +
        '<rect x="268" y="198" width="144" height="32" rx="6" fill="#0f172a" stroke="' + pal.primary + '" stroke-width="1.5"/>' +
        '<text x="340" y="211" fill="#ffffff" font-size="9.5" font-weight="900" text-anchor="middle" letter-spacing="0.4">TU HUB GENERADOR</text>' +
        '<text x="340" y="223" fill="#34d399" font-size="8.5" font-weight="800" text-anchor="middle">Excedente: ' + excTotal.toLocaleString('es-ES') + ' kWh/a</text>' +
      '</g>' +

      // ── BARRA INFERIOR DE LIQUIDACIÓN ECONÓMICA (EL CIERRE DE VENTAS) ──
      '<rect x="10" y="344" width="660" height="38" rx="7" fill="#0f172a"/>' +
      '<text x="24" y="360" fill="#94a3b8" font-size="8.5" font-weight="700">LIQUIDACIÓN ANUAL DE EXCEDENTES (' + excTotal.toLocaleString('es-ES') + ' kWh):</text>' +
      '<text x="24" y="374" fill="#cbd5e1" font-size="9.5" font-weight="700">Pool Mayorista (0,05 €/kWh): <tspan fill="#f87171" font-weight="900">' + cel.ingresoPoolAnual.toLocaleString('es-ES') + ' €/año</tspan>   vs.   Venta Directa CEL (' + pCelStr + ' €/kWh): <tspan fill="#34d399" font-weight="900">+' + ingTotal.toLocaleString('es-ES') + ' €/año</tspan></text>' +
      '<rect x="492" y="351" width="168" height="24" rx="5" fill="#059669"/>' +
      '<text x="576" y="366.5" fill="#ffffff" font-size="9.5" font-weight="900" text-anchor="middle">BENEFICIO EXTRA: +' + cel.beneficioExtraCEL.toLocaleString('es-ES') + ' €/AÑO</text>' +
    '</svg>'

    // HOJA 1 CEL: MODELO ECONÓMICO Y HOMOLOGACIÓN
    var page1Html = '<div class="page-sheet" data-section-id="cel">' +
      '<div>' +
        (typeof buildInnerHeaderFn === 'function'
          ? buildInnerHeaderFn('COMUNIDAD ENERGÉTICA LOCAL &amp; <span style="color:' + pal.primary + '">HUB DE EXCEDENTES</span>', 'Marco Regulatorio Real Decreto-ley 7/2026 · Radio de Cobertura hasta 5.000 metros (78,5 km²)', pageNum)
          : ('<div class="cover-header">' +
              '<div class="company-text">' +
                '<div class="name">COMUNIDAD ENERGÉTICA LOCAL &amp; <span style="color:' + pal.primary + '">HUB DE EXCEDENTES</span></div>' +
                '<div class="sub">Marco Regulatorio Real Decreto-ley 7/2026 · Radio de Cobertura hasta 5.000 metros (78,5 km²)</div>' +
              '</div>' +
              '<div class="doc-ref-box"><b>Ref: ' + (d.refNum || 'PROY') + '</b><br>Hoja ' + pageNum + ' de ' + totPages + '</div>' +
            '</div>')) +

        '<!-- 4 HEROS MONUMENTALES DE COMUNIDAD ENERGÉTICA -->' +
        '<div class="hero-grid" style="grid-template-columns: repeat(4, 1fr); gap: 14px; margin: 26px 0 36px;">' +
          '<div class="hero-card" style="border-top: 3px solid #f59e0b; background: #fffbeb;">' +
            '<div class="hero-lbl" style="color: #b45309;">Excedente Solar Anual</div>' +
            '<div class="hero-val" style="color: #b45309; font-size: 20px;">' + cel.excKWh.toLocaleString('es-ES') + ' kWh</div>' +
            '<div style="font-size: 9px; color: #92400e; margin-top: 4px;">' + cel.excPct + '% de tu producción total</div>' +
          '</div>' +
          '<div class="hero-card highlight" style="border-top: 3px solid ' + pal.primary + '; background: linear-gradient(135deg, ' + pal.light + ', #ffffff);">' +
            '<div class="hero-lbl" style="color: ' + pal.dark + ';">Valorización CEL (' + (typeof cel.precioCEL === 'number' ? cel.precioCEL.toFixed(2).replace('.', ',') : '0,11') + ' €/kWh)</div>' +
            '<div class="hero-val primary" style="font-size: 21px;">+' + cel.ingresoCELAnual.toLocaleString('es-ES') + ' €/año</div>' +
            '<div style="font-size: 9px; color: ' + pal.dark + '; margin-top: 4px; font-weight: 700;">+' + cel.beneficioExtraCEL.toLocaleString('es-ES') + ' € más que vertiendo a red</div>' +
          '</div>' +
          '<div class="hero-card" style="border-top: 3px solid #0284c7; background: #f0f9ff;">' +
            '<div class="hero-lbl" style="color: #0369a1;">Payback Acelerado</div>' +
            '<div class="hero-val" style="color: #0284c7; font-size: 20px;">' + cel.paybackCEL.toFixed(1) + ' Años</div>' +
            '<div style="font-size: 9px; color: #0284c7; margin-top: 4px; font-weight: 700;">-' + cel.reduccionPaybackAnios.toFixed(1) + ' años de amortización</div>' +
          '</div>' +
          '<div class="hero-card" style="border-top: 3px solid #10b981; background: #f0fdf4;">' +
            '<div class="hero-lbl" style="color: #047857;">Impacto en el Barrio</div>' +
            '<div class="hero-val" style="color: #10b981; font-size: 20px;">~' + cel.familiasBeneficiadas + ' Familias</div>' +
            '<div style="font-size: 9px; color: #065f46; margin-top: 4px;">abastecidas con energía km 0</div>' +
          '</div>' +
        '</div>' +

        '<!-- CARA A CARA: RED CONVENCIONAL VS COMUNIDAD ENERGÉTICA LOCAL -->' +
        '<div style="display: grid; grid-template-columns: 1fr 1.15fr; gap: 18px; margin-bottom: 36px;">' +
          '<div class="tech-card cel-card" style="border: 1.5px solid #e2e8f0; border-radius: 8px; padding: 16px 18px; background: #f8fafc; display: flex; flex-direction: column; justify-content: space-between; position: relative;">' +
            '<div>' +
              '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">' +
                '<span style="font-size: 8.5px; font-weight: 800; color: #64748b; text-transform: uppercase;">RÉGIMEN TRADICIONAL (RD 244/2019)</span>' +
                '<span style="font-size: 8px; background: #e2e8f0; color: #475569; padding: 2px 6px; border-radius: 4px; font-weight: 700;">RED GENERAL</span>' +
              '</div>' +
              '<div style="font-size: 12px; font-weight: 900; color: #1e293b;">Compensación Simplificada en Factura</div>' +
              '<div style="font-size: 19px; font-weight: 900; color: #64748b; margin: 3px 0;">0,05 €/kWh <span style="font-size: 9.5px; font-weight: 600; color: #94a3b8;">(precio medio pool)</span></div>' +
              '<div style="font-size: 9.5px; color: #475569; line-height: 1.35; margin-top: 3px;">' +
                'Ingreso anual estimado: <b>~' + cel.ingresoPoolAnual.toLocaleString('es-ES') + ' €/año</b>.' +
              '</div>' +
            '</div>' +
            '<div style="margin-top: 6px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 5px; padding: 6px 8px; font-size: 8.5px; color: #991b1b; line-height: 1.3;">' +
              _mSvg('alert', 12, '#dc2626', 'margin-right:4px;') + '<b>Tope Legal Mensual a 0 €:</b> Todo kWh vertido por encima del importe de energía de tu factura se regala obligatoriamente a la eléctrica sin retribución alguna.' +
            '</div>' +
          '</div>' +

          '<div class="tech-card cel-card" style="border: 2px solid ' + pal.primary + '; border-radius: 8px; padding: 16px 18px; background: #ffffff; box-shadow: 0 4px 14px rgba(0,0,0,0.06); display: flex; flex-direction: column; justify-content: space-between; position: relative;">' +
            '<div style="position: absolute; top: -9px; right: 12px; background: ' + pal.primary + '; color: #fff; font-size: 8px; font-weight: 900; padding: 2px 8px; border-radius: 8px; letter-spacing: 0.5px;">¡+120% MÁS RENTABLE!</div>' +
            '<div>' +
              '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">' +
                '<span style="font-size: 8.5px; font-weight: 800; color: ' + pal.dark + '; text-transform: uppercase;">MARCO REGULATORIO RDL 7/2026</span>' +
                '<span style="font-size: 8px; background: ' + pal.light + '; color: ' + pal.dark + '; padding: 2px 6px; border-radius: 4px; font-weight: 800;">RADIO HASTA 5 KM</span>' +
              '</div>' +
              '<div style="font-size: 12px; font-weight: 900; color: #0f172a;">Comunidad Energética Local (CEL) P2P</div>' +
              '<div style="font-size: 20px; font-weight: 900; color: ' + pal.primary + '; margin: 3px 0;">' + (typeof cel.precioCEL === 'number' ? cel.precioCEL.toFixed(2).replace('.', ',') : '0,11') + ' €/kWh <span style="font-size: 9.5px; font-weight: 700; color: ' + pal.dark + ';">precio local justo acordado</span></div>' +
              '<div style="font-size: 9.5px; color: #334155; line-height: 1.35; margin-top: 3px;">' +
                'Ingreso anual estimado: <b style="color:' + pal.primary + ';font-size:10.5px;">+' + cel.ingresoCELAnual.toLocaleString('es-ES') + ' €/año</b> (<b style="color:#059669;">+' + cel.beneficioExtraCEL.toLocaleString('es-ES') + ' €/año netos extra</b>).' +
              '</div>' +
            '</div>' +
            '<div style="margin-top: 6px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 5px; padding: 6px 8px; font-size: 8.5px; color: #166534; line-height: 1.3;">' +
              _mSvg('checkCircle', 12, '#16a34a', 'margin-right:4px;') + '<b>Sin Límite de Factura:</b> Liquidación íntegra hora a hora mediante coeficientes de reparto dinámicos βh (Orden TED/1247/2021). Tus vecinos ahorran un 35% y tú duplicas ingresos.' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<!-- SELLO DE HOMOLOGACIÓN CEL-READY -->' +
        '<div class="tech-card cel-card" style="border: 1.5px solid #10b981; border-radius: 8px; padding: 16px 18px; background: linear-gradient(135deg, #f0fdf4, #ffffff); display: flex; align-items: center; justify-content: space-between; gap: 14px; box-shadow: 0 2px 6px rgba(16,185,129,0.06); margin-top: 24px; position: relative;">' +
          '<div style="display: flex; align-items: center; gap: 10px;">' +
            '<span style="display:inline-flex;color:#059669;">' + _mSvg('shield', 24, '#059669') + '</span>' +
            '<div>' +
              '<div style="font-size: 11px; font-weight: 900; color: #065f46; letter-spacing: 0.3px;">DISEÑO DE INGENIERÍA 100% HOMOLOGADO CEL-READY</div>' +
              '<div style="font-size: 8.5px; color: #047857; margin-top: 2px; line-height: 1.35;">' +
                'La instalación incorpora <b>telemedida horaria bidireccional</b> homologada y soporte de coeficientes dinámicos <b>βh (Orden TED/1247/2021)</b>. No requiere obras de tendido vecinal ni cableado exterior: la energía se comparte a través de la red de distribución existente según el <b>Real Decreto-ley 7/2026</b>.' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div style="text-align: right; white-space: nowrap;">' +
            '<span style="font-size: 9px; font-weight: 900; color: #065f46; background: #d1fae5; padding: 3px 8px; border-radius: 5px; border: 1px solid #10b981; display: inline-block;">COMPATIBLE RDL 7/2026</span>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<!-- PIE DE HOJA CEL 1 -->' +
      '<div class="cover-footer">' +
        '<span>Marco legal: RDL 7/2026 (BOE) · Orden TED/1247/2021 · RD 244/2019 · REBT ITC-BT-40</span>' +
        '<span>' + _escCel(companyName) + ' · Ref: ' + _escCel(d.refNum || 'PROY') + '</span>' +
      '</div>' +
    '</div>';

    // HOJA 2 CEL: FLUJO DE DESPACHO ENERGÉTICO Y RADAR DE COBERTURA 5 KM (ESPACIOSO)
    var page2Html = '<div class="page-sheet" data-section-id="cel_financials">' +
      '<div>' +
        (typeof buildInnerHeaderFn === 'function'
          ? buildInnerHeaderFn('DISTRIBUCIÓN ENERGÉTICA &amp; <span style="color:' + pal.primary + '">COBERTURA 5 KM</span>', 'Despacho Horario de Generación · Radio de Reparto Vecinal P2P de 78,5 km²', pageNum2)
          : ('<div class="cover-header">' +
              '<div class="company-text">' +
                '<div class="name">DISTRIBUCIÓN ENERGÉTICA &amp; <span style="color:' + pal.primary + '">COBERTURA 5 KM</span></div>' +
                '<div class="sub">Despacho Horario de Generación · Radio de Reparto Vecinal P2P de 78,5 km²</div>' +
              '</div>' +
              '<div class="doc-ref-box"><b>Ref: ' + (d.refNum || 'PROY') + '</b><br>Hoja ' + pageNum2 + ' de ' + totPages + '</div>' +
            '</div>')) +

        '<!-- 1. DESPACHO DEL FLUJO ENERGÉTICO EN GRAN FORMATO -->' +
        '<div class="tech-card cel-card cel-flow-card" style="border: 1.5px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; background: #f8fafc; margin: 4px 0 ' + celCardsGap + 'px; position: relative;">' +
          '<div style="font-size: 11px; font-weight: 900; color: #1e293b; text-transform: uppercase; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between;">' +
            '<div style="display: flex; align-items: center; gap: 6px;"><span style="display:inline-flex;color:' + pal.primary + ';">' + _mSvg('bolt', 14, pal.primary) + '</span><span>1. Despacho del Flujo Energético Generado</span></div>' +
            '<span style="font-size: 8.5px; font-weight: 800; color: ' + pal.primary + '; background: ' + pal.light + '; padding: 2px 7px; border-radius: 4px;">Balance 100% Optimizado</span>' +
          '</div>' +

          '<div style="width: 100%; height: ' + flowH + 'px; border-radius: 6px; overflow: hidden; display: flex; margin-bottom: 8px; border: 1.5px solid #cbd5e1; box-shadow: inset 0 2px 4px rgba(0,0,0,0.08);">' +
            '<div style="width:' + autoW + '%; background: linear-gradient(135deg, #059669, #10b981); color: #fff; font-size: ' + flowSize + 'pt; font-weight: 900; display: flex; align-items: center; justify-content: center; padding: 0 4px; white-space: nowrap;">' +
              cel.autoPct + '% Autoconsumo' +
            '</div>' +
            (cel.batPct > 0 ? (
              '<div style="width:' + batW + '%; background: linear-gradient(135deg, #0284c7, #38bdf8); color: #fff; font-size: ' + flowSize + 'pt; font-weight: 900; display: flex; align-items: center; justify-content: center; padding: 0 4px; white-space: nowrap;">' +
                cel.batPct + '% Batería' +
              '</div>'
            ) : '') +
            '<div style="width:' + excW + '%; background: linear-gradient(135deg, #d97706, #f59e0b); color: #fff; font-size: ' + flowSize + 'pt; font-weight: 900; display: flex; align-items: center; justify-content: center; padding: 0 4px; white-space: nowrap;">' +
              cel.excPct + '% Inyección CEL (5 km)' +
            '</div>' +
          '</div>' +

          '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: ' + celCardsGap + 'px; font-size: ' + flowDescSize + 'pt; line-height: 1.35;">' +
            '<div style="display: flex; align-items: flex-start; gap: 6px; background: #ffffff; padding: 6px 10px; border-radius: 6px; border: 1px solid #e2e8f0;">' +
              '<span style="color: #059669; font-weight: 900; font-size: 11px;">■</span>' +
              '<div><b>Autoconsumo Inmueble (' + cel.autoKWh.toLocaleString('es-ES') + ' kWh/año):</b> Cubre consumos instantáneos diurnos a coste 0 €. Máxima prioridad operativa.</div>' +
            '</div>' +
            (cel.batKWh > 0 ? (
              '<div style="display: flex; align-items: flex-start; gap: 6px; background: #ffffff; padding: 6px 10px; border-radius: 6px; border: 1px solid #e2e8f0;">' +
                '<span style="color: #0284c7; font-weight: 900; font-size: 11px;">■</span>' +
                '<div><b>Batería LFP (' + cel.batKWh.toLocaleString('es-ES') + ' kWh/año):</b> Reserva energética gestionada para consumos nocturnos o picos tarifarios.</div>' +
              '</div>'
            ) : '') +
            '<div style="display: flex; align-items: flex-start; gap: 6px; background: #ffffff; padding: 6px 10px; border-radius: 6px; border: 1px solid #e2e8f0;">' +
              '<span style="color: #d97706; font-weight: 900; font-size: 11px;">■</span>' +
              '<div><b>Inyección CEL (' + cel.excKWh.toLocaleString('es-ES') + ' kWh/año):</b> Compartida con el vecindario a <b>' + cel.precioCEL.toFixed(2) + ' €/kWh</b>.</div>' +
            '</div>' +
            '<div style="display: flex; align-items: flex-start; gap: 6px; background: #ffffff; padding: 6px 10px; border-radius: 6px; border: 1px solid #e2e8f0;">' +
              '<span style="color: #64748b; font-weight: 900; font-size: 11px;">■</span>' +
              '<div><b>Respaldo de Red Eléctrica:</b> Suministro ininterrumpido 24 horas y balance de seguridad permanente ante contingencias.</div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<!-- 2. RADAR DE COBERTURA 5 KM EN GRAN FORMATO -->' +
        '<div class="tech-card chart-box cel-card cel-radar-card" style="border: 1.5px solid #e2e8f0; border-radius: 10px; padding: 10px 14px; background: #ffffff; box-shadow: 0 4px 16px rgba(0,0,0,0.04); position: relative;">' +
          '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">' +
            '<div style="font-size: 11.5px; font-weight: 900; color: #0f172a; text-transform: uppercase; letter-spacing: -0.2px;">2. Radar de Cobertura y Topología de Reparto (5 km)</div>' +
            '<span style="font-size: 8.5px; font-weight: 800; color: ' + pal.primary + '; background: ' + pal.light + '; padding: 2px 8px; border-radius: 5px;">RDL 7/2026 · 78,5 km² de Cobertura</span>' +
          '</div>' +
          '<div class="cel-radar-inner" style="width: 100%; height: ' + radarH + 'px; min-height: 280px; border-radius: 10px; overflow: hidden; background: #f8fafc; box-shadow: 0 2px 10px rgba(15,23,42,0.06);">' +
            radarSvg +
          '</div>' +
          '<div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px; font-size: 9px; color: #64748b; line-height: 1.35; gap: 12px;">' +
            '<span style="flex: 1;">Topología de reparto P2P homologada para consumidores residenciales, comerciales e industriales en baja y media tensión.</span>' +
            '<span style="font-weight: 800; color: ' + pal.primary + '; white-space: nowrap; background: ' + pal.light + '; padding: 2px 7px; border-radius: 4px;">Telemedida horaria activa</span>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<!-- PIE DE HOJA CEL 2 -->' +
      '<div class="cover-footer">' +
        '<span>Marco legal: RDL 7/2026 (BOE) · Orden TED/1247/2021 · RD 244/2019 · REBT ITC-BT-40</span>' +
        '<span>' + _escCel(companyName) + ' · Ref: ' + _escCel(d.refNum || 'PROY') + '</span>' +
      '</div>' +
    '</div>';

    return page1Html + page2Html;
  }
function generatePropuestaComercialPDF(skipPricingModal, targetWindowName, themeOverride) {
  if (typeof window !== 'undefined') {
    if (window.solarSimState && (window.solarSimState.solarYieldDirty || window.solarSimState.annualHeatmapDirty) && typeof recalculateSolarYield === 'function') {
      try { recalculateSolarYield(true); } catch (eSol) {}
    }
    if (window.RAWind && window.RAWind.dirty && typeof window.RAWind.recalculate === 'function') {
      try { window.RAWind.recalculate(); } catch (eWnd) {}
    }
  }
  if (typeof raEnsureAnalysisReadyForDoc === 'function' && !raEnsureAnalysisReadyForDoc()) return;
  const d = getProjectCalcs();
  // Resiliencia AAA: si getProjectCalcs devuelve 0 paneles, intentar recuperar de caché conocida
  let numPanelsFinal = d.numPanels;
  if (!numPanelsFinal || numPanelsFinal === 0) {
    numPanelsFinal =
      (window.allRenderedPanels && window.allRenderedPanels.length > 0
        ? window.allRenderedPanels.filter(p => p && !p.deleted && !p.disabled).length
        : 0) ||
      (window.lastRoofInfo && window.lastRoofInfo.panels && window.lastRoofInfo.panels.length > 0
        ? window.lastRoofInfo.panels.filter(p => p && !p.deleted && !p.disabled).length
        : 0) ||
      (window.solarProjectConfig && window.solarProjectConfig.lastEstimatedPanels > 0
        ? window.solarProjectConfig.lastEstimatedPanels
        : 0);
  }
  if (!numPanelsFinal || numPanelsFinal === 0) {
    (typeof raAlert === 'function' ? raAlert : console.warn)('Diseña primero el polígono de la instalación en el visor 3D.', 'warning');
    return;
  }
  if (d.numPanels === 0 && numPanelsFinal > 0) {
    d.numPanels = numPanelsFinal;
  }

  // Interceptar para revisión de precios y margen si no se ha saltado explícitamente
  if (!skipPricingModal && typeof wpOpenPricingReviewModal === 'function') {
    wpOpenPricingReviewModal(function() {
      generatePropuestaComercialPDF(true);
    });
    return;
  }
  const m = calculateFinancialModel({ d: d, numPanels: numPanelsFinal });

  let gastoMensualSinSolar = 0;
  let gastoMensualConSolar = 0;
  if (window.RA && window.RA.billAuditor && window.RA.billAuditor.comparison && window.RA.billAuditor.comparison.gastoMensualActualEUR > 0) {
    gastoMensualSinSolar = window.RA.billAuditor.comparison.gastoMensualActualEUR;
    gastoMensualConSolar = window.RA.billAuditor.comparison.gastoMensualConSolarEUR;
  } else {
    gastoMensualSinSolar = Math.round(((m.consumoAnual || 3500) * (m.precioRedEUR || 0.18)) / 12);
    gastoMensualConSolar = Math.max(15, Math.round(gastoMensualSinSolar - m.ahorroMensualLuz));
  }

  // [P0] Avisar si la geometría cambió tras el último mapa de calor válido
  if (typeof window !== 'undefined' && window.solarSimState && window.solarSimState.annualHeatmapDirty && typeof showToast === 'function') {
    showToast('ANÁLISIS SOLAR OBSOLETO', 'La geometría o los obstáculos han cambiado desde el último cálculo. El PDF usa la producción del último mapa de calor válido: recalcula en el Paso 3 para cifras definitivas.', 'warning', 5500);
  }

  // ── Leer branding corporativo (SSOT) ───────────────────────────────────────
  let branding = {};
  try {
    if (window.RACompanyBranding && typeof window.RACompanyBranding.getBranding === 'function') {
      branding = window.RACompanyBranding.getBranding();
    } else if (window.RA && window.RA.branding) {
      branding = window.RA.branding;
    } else {
      branding = JSON.parse(localStorage.getItem('ra_company_branding') || '{}');
    }
  } catch(e) { branding = {}; }

  const _escProp = function(v) {
    if (window.RASanitize && typeof window.RASanitize.plain === 'function') return window.RASanitize.plain(v);
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };
  const companyName  = (branding.name || 'SOLAR 3D PRO').trim();
  const companyCIF   = (branding.cif  || '').trim();
  const companyPhone = (branding.phone || '').trim();
  const companyWeb   = (branding.web   || '').trim();
  let logoDataUrl = window.customCompanyLogoBase64 || branding.logo || '';
  if (!logoDataUrl) {
    try {
      logoDataUrl = localStorage.getItem('ra_company_logo') || '';
      if (!logoDataUrl) {
        const storedBranding = JSON.parse(localStorage.getItem('ra_company_branding') || '{}');
        if (storedBranding && storedBranding.logo) {
          logoDataUrl = storedBranding.logo;
        }
      }
    } catch(e) { window.RA && window.RA.log && window.RA.log.warn('[catch silenciado]', e); }
  }
  logoDataUrl = (window.RASanitize && typeof window.RASanitize.safeImageSrc === 'function')
    ? window.RASanitize.safeImageSrc(logoDataUrl)
    : ((typeof logoDataUrl === 'string' && /^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(logoDataUrl.trim())) ? logoDataUrl.trim() : '');
  const theme        = themeOverride || branding.theme || 'emerald';
  const layoutStyle  = branding.layoutStyle || 'editorial'; // editorial | infographic | technical
  const eqWarranties = (typeof resolveEquipmentWarranties === 'function') ? resolveEquipmentWarranties() : {};
  const warPower     = eqWarranties.warPower || branding.warPower || '25';
  const warMod       = eqWarranties.warMod   || branding.warMod   || '15';
  const warInv       = eqWarranties.warInv   || branding.warInv   || '12';
  const warMo        = eqWarranties.warMo    || branding.warMo    || '5';
  const warBat       = eqWarranties.warBat   || '10';

  // ── Paleta de color por tema (sincronizada con Estudio Maestro si existe) ──
  const THEMES = {
    emerald: { primary: '#059669', light: '#d1fae5', accent: '#10b981', dark: '#065f46' },
    sky:     { primary: '#0284c7', light: '#e0f2fe', accent: '#38bdf8', dark: '#0c4a6e' },
    amber:   { primary: '#d97706', light: '#fef3c7', accent: '#f59e0b', dark: '#92400e' },
    slate:   { primary: '#475569', light: '#f1f5f9', accent: '#64748b', dark: '#1e293b' },
    rose:    { primary: '#e11d48', light: '#ffe4e6', accent: '#f43f5e', dark: '#881337' }
  };
  THEMES.blue = THEMES.sky;
  const _studioPal = (typeof window !== 'undefined' && window.RAProposalStyleStudio && typeof window.RAProposalStyleStudio.getResolvedPalette === 'function')
    ? window.RAProposalStyleStudio.getResolvedPalette(themeOverride)
    : null;
  const pal = _studioPal || THEMES[theme] || THEMES.emerald;

  // ── Datos de producción (motor preciso si disponible, fallback a docs-generator) ──
  const solarStats = (window.RA && window.RA.solarStats) ? window.RA.solarStats : null;
  // [B6] Preferir el reparto mensual de la SIMULACIÓN REAL (mapa de calor) si está vigente y válido,
  // de modo que las barras mensuales cuadren con la producción anual y con la memoria técnica.
  const _simMK = (window.solarSimState && !window.solarSimState.annualHeatmapDirty && Array.isArray(window.solarSimState.monthlyKwh) && window.solarSimState.monthlyKwh.length === 12 && window.solarSimState.monthlyKwh.some(v => v > 0))
    ? window.solarSimState.monthlyKwh : null;
  const monthlyYields = _simMK || (solarStats ? solarStats.monthlyYields : d.monthly.map(mo => mo.kWh));
  const useTheoreticalYield = (typeof window !== 'undefined' && window.raProposalYieldMode === 'theoretical');
  const prTheoVal = (solarStats && typeof solarStats.pr === 'number' && solarStats.pr > 0 && solarStats.pr <= 1) ? solarStats.pr : 0.786;
  const annualYieldKWh = useTheoreticalYield
    ? Math.round(((solarStats && Number.isFinite(solarStats.annualGrossKWh) && solarStats.annualGrossKWh > 0) ? solarStats.annualGrossKWh : (d.annualKWh / prTheoVal)) * prTheoVal)
    : (solarStats ? solarStats.annualYieldKWh : d.annualKWh);
  const MES_CORTOS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

  // ── SVG Histograma mensual (con soporte de barras apiladas: Autoconsumo + Excedente) ──
  function buildMonthlyHistogramSVG(yields, paleta, studioCfg, finModel) {
    const cfg = studioCfg || {};
    const H = (typeof cfg.histogramHeightPx === 'number' && cfg.histogramHeightPx >= 100) ? cfg.histogramHeightPx : 200;
    const W = 720, PAD_L = 50, PAD_B = 42, PAD_T = 26, PAD_R = 10;
    const chartW = W - PAD_L - PAD_R;
    const chartH = H - PAD_B - PAD_T;
    const fm = finModel || {};
    const breakdown = (fm && Array.isArray(fm.monthlyEnergyBreakdown) && fm.monthlyEnergyBreakdown.length === 12)
      ? fm.monthlyEnergyBreakdown
      : null;

    const maxSolarVal = Math.max(...yields, 1);
    const consValues = breakdown ? breakdown.map(b => Math.max(0, Math.round((b && b.consumoKWh) || 0))) : null;
    const maxConsVal = consValues ? Math.max(...consValues, 0) : 0;
    const maxVal = Math.max(maxSolarVal, maxConsVal, 1);
    const barW = (chartW / 12) * 0.65;
    const barGap = (chartW / 12) * 0.35;
    let bars = '', labels = '', vals = '', stackedVals = '', grid = '', consPoints = [], consMarkers = '', consLabels = '';

    const isGrad = (cfg.histogramFillMode !== 'solid');
    const colAuto = paleta.primary || '#10b981';
    const colAutoEnd = paleta.dark || '#059669';
    const colSurplus = cfg.histogramBarColor || paleta.accent || '#38bdf8';
    const colSurplusEnd = cfg.histogramBarColorEnd || '#0284c7';
    const colPeak = cfg.histogramPeakColor || '#f59e0b';
    const colPeakEnd = cfg.histogramPeakColorEnd || '#d97706';

    const valFontSize = Number(cfg.histogramValueFontSize) || 7.5;
    const lblFontSize = Number(cfg.histogramLabelFontSize) || 8.0;
    const axisFontSize = Number(cfg.histogramAxisFontSize) || 8.0;

    let defs = '';
    if (isGrad) {
      defs = `<defs>
        <linearGradient id="ra-histo-grad-auto" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${colAuto}"/>
          <stop offset="100%" stop-color="${colAutoEnd}"/>
        </linearGradient>
        <linearGradient id="ra-histo-grad-surplus" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${colSurplus}"/>
          <stop offset="100%" stop-color="${colSurplusEnd}"/>
        </linearGradient>
        <linearGradient id="ra-histo-grad-peak" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${colPeak}"/>
          <stop offset="100%" stop-color="${colPeakEnd}"/>
        </linearGradient>
      </defs>`;
    }

    // Grid horizontal
    for (let g = 0; g <= 4; g++) {
      const y = PAD_T + chartH - (g / 4) * chartH;
      const gVal = Math.round((g / 4) * maxVal);
      grid += `<line x1="${PAD_L}" y1="${y.toFixed(1)}" x2="${W - PAD_R}" y2="${y.toFixed(1)}" stroke="#e2e8f0" stroke-width="1"/>`;
      grid += `<text x="${PAD_L - 5}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" font-size="${axisFontSize}" fill="#94a3b8">${gVal.toLocaleString('es-ES')}</text>`;
    }

    yields.forEach((kWh, i) => {
      const x = PAD_L + i * (chartW / 12) + barGap / 2;
      const isTop = kWh === maxSolarVal;
      const midX = (x + barW / 2).toFixed(1);

      if (breakdown) {
        const mItem = breakdown[i];
        const genBarKWh = Math.round(kWh);
        const autoKWh = mItem ? Math.min(genBarKWh, Math.max(0, Math.round(mItem.autoconsumoKWh))) : Math.round(genBarKWh * 0.45);
        const surplusKWh = Math.max(0, genBarKWh - autoKWh);

        const hAuto = Math.max(0, chartH * (autoKWh / maxVal));
        const hSurplus = Math.max(0, chartH * (surplusKWh / maxVal));

        const yAuto = PAD_T + chartH - hAuto;
        const ySurplus = yAuto - hSurplus;

        const fillAuto = isGrad ? 'url(#ra-histo-grad-auto)' : colAuto;
        const fillSurplus = isGrad ? (isTop ? 'url(#ra-histo-grad-peak)' : 'url(#ra-histo-grad-surplus)') : (isTop ? colPeak : colSurplus);

        // Barra inferior: Autoconsumo directo + batería
        if (hAuto > 0) {
          bars += `<rect x="${x.toFixed(1)}" y="${yAuto.toFixed(1)}" width="${barW.toFixed(1)}" height="${hAuto.toFixed(1)}" rx="1.5" fill="${fillAuto}" opacity="0.95"/>`;
        }
        // Barra superior apilada: Excedente volcado a red / CEL
        if (hSurplus > 0) {
          bars += `<rect x="${x.toFixed(1)}" y="${ySurplus.toFixed(1)}" width="${barW.toFixed(1)}" height="${hSurplus.toFixed(1)}" rx="1.5" fill="${fillSurplus}" opacity="0.90"/>`;
        }

        const innerFontSize = Math.min(valFontSize, 6.8);

        // [ANTI-OVERFLOW] Valores kWh interiores con umbral mínimo de altura (11px) para evitar solapes y desbordamientos
        if (hAuto >= 11 && autoKWh > 0) {
          const midYAuto = (yAuto + hAuto / 2 + 2.5).toFixed(1);
          stackedVals += `<text x="${midX}" y="${midYAuto}" text-anchor="middle" font-size="${innerFontSize}" fill="#ffffff" font-weight="700">${autoKWh.toLocaleString('es-ES')}</text>`;
        }
        if (hSurplus >= 11 && surplusKWh > 0) {
          const midYSurplus = (ySurplus + hSurplus / 2 + 2.5).toFixed(1);
          const fillSurplusText = isTop ? '#78350f' : '#0c4a6e';
          stackedVals += `<text x="${midX}" y="${midYSurplus}" text-anchor="middle" font-size="${innerFontSize}" fill="${fillSurplusText}" font-weight="700">${surplusKWh.toLocaleString('es-ES')}</text>`;
        }
      } else {
        const barH = chartH * (kWh / maxVal);
        const y = PAD_T + chartH - barH;
        const fillAttr = isGrad
          ? (isTop ? 'url(#ra-histo-grad-peak)' : 'url(#ra-histo-grad-auto)')
          : (isTop ? colPeak : colAuto);
        bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" rx="2" fill="${fillAttr}" opacity="0.92"/>`;
      }

      const totalH = chartH * (kWh / maxVal);
      const topY = PAD_T + chartH - totalH;

      if (consValues) {
        const cVal = consValues[i] || 0;
        const yCons = PAD_T + chartH - chartH * (cVal / maxVal);
        consPoints.push(`${midX},${yCons.toFixed(1)}`);
        consMarkers += `<circle cx="${midX}" cy="${yCons.toFixed(1)}" r="3.2" fill="#ffffff" stroke="#e11d48" stroke-width="1.8"/>`;
        if (cVal > 0) {
          const nearGenTop = Math.abs(yCons - topY) < 13;
          const consLblY = nearGenTop ? (yCons + 12) : (yCons - 6);
          consLabels += `<text x="${midX}" y="${consLblY.toFixed(1)}" text-anchor="middle" font-size="6.8" fill="#be123c" font-weight="800" stroke="#ffffff" stroke-width="2.4" paint-order="stroke">${cVal.toLocaleString('es-ES')}</text>`;
        }
      }

      labels += `<text x="${midX}" y="${(H - PAD_B + 14).toFixed(1)}" text-anchor="middle" font-size="${lblFontSize}" fill="#475569" font-weight="600">${MES_CORTOS[i]}</text>`;
      vals   += `<text x="${midX}" y="${(topY - 4).toFixed(1)}" text-anchor="middle" font-size="${valFontSize}" fill="${paleta.dark || '#059669'}" font-weight="700">${kWh.toLocaleString('es-ES')}</text>`;
    });

    const consOverlay = consPoints.length === 12
      ? `<polyline points="${consPoints.join(' ')}" fill="none" stroke="#e11d48" stroke-width="1.9" stroke-dasharray="4,2.5" stroke-linejoin="round"/>${consMarkers}${consLabels}`
      : '';

    // Leyenda de barras apiladas + línea de consumo al pie con espaciado distribuido
    const legendY = H - 5;
    const legFs = Math.min(axisFontSize, 7.6);
    const legendContent = breakdown ? `
      <g transform="translate(${PAD_L}, ${legendY})">
        <rect x="0" y="-7" width="8" height="7" rx="1.5" fill="${colAuto}"/>
        <text x="12" y="0" font-size="${legFs}" fill="#334155" font-weight="600">Autoconsumo Directo + Batería</text>
        <rect x="190" y="-7" width="8" height="7" rx="1.5" fill="${colSurplus}"/>
        <text x="202" y="0" font-size="${legFs}" fill="#0369a1" font-weight="600">Excedente Volcado (Red / CEL)</text>
        <rect x="385" y="-7" width="8" height="7" rx="1.5" fill="${colPeak}"/>
        <text x="397" y="0" font-size="${legFs}" fill="#b45309" font-weight="600">Mes Pico Solar</text>
        <line x1="490" y1="-3.5" x2="504" y2="-3.5" stroke="#e11d48" stroke-width="1.9" stroke-dasharray="3,2"/>
        <circle cx="497" cy="-3.5" r="2.3" fill="#ffffff" stroke="#e11d48" stroke-width="1.4"/>
        <text x="510" y="0" font-size="${legFs}" fill="#be123c" font-weight="700">Consumo Factura</text>
      </g>
    ` : `<text x="${W/2}" y="${legendY}" text-anchor="middle" font-size="${axisFontSize}" fill="#94a3b8">Producción estimada mensual (kWh/mes)</text>`;

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" style="display:block;max-width:100%;">
      ${defs}${grid}${bars}${consOverlay}${labels}${stackedVals}${vals}${legendContent}
    </svg>`;
  }

  // ── SVG Curva de amortización (cashflow acumulado 25 años) ─────────────────
  function buildAmortizationSVG(cashflowAcum, capexBruto, paybackYears, paleta, studioCfg, finModel) {
    const cfg = studioCfg || {};
    const H = (typeof cfg.amortHeightPx === 'number' && cfg.amortHeightPx >= 120) ? Math.max(cfg.amortHeightPx, 225) : 230;
    const W = 720, PAD_L = 62, PAD_B = 34, PAD_T = 24, PAD_R = 16;
    const chartW = W - PAD_L - PAD_R;
    const chartH = H - PAD_B - PAD_T;
    const n = cashflowAcum.length;
    const fm = finModel || {};
    const cfFinanciado = Array.isArray(fm.cashflowAcumFinanciado) && fm.cashflowAcumFinanciado.length === n
      ? fm.cashflowAcumFinanciado
      : null;
    const cfSinCEL = (fm.isCelActive && Array.isArray(fm.cashflowAcumSinCEL) && fm.cashflowAcumSinCEL.length === n)
      ? fm.cashflowAcumSinCEL
      : null;
    let allValues = cfFinanciado ? cashflowAcum.concat(cfFinanciado) : [...cashflowAcum];
    if (cfSinCEL) allValues = allValues.concat(cfSinCEL);
    const minVal = Math.min(...allValues, -capexBruto * 0.1);
    const maxVal = Math.max(...allValues, 0);
    const totalRange = (maxVal - minVal) || 1;

    // Escala vertical bipartita adaptativa: garantiza que el tramo de amortización (minVal..0)
    // disponga siempre de al menos el 28% de la altura gráfica, evitando que en proyectos hiperrentables
    // (+200k€) la fase inicial de recuperación quede aplastada contra la base.
    const rawNegShare = Math.abs(minVal) / totalRange;
    const negShare = (minVal < 0 && maxVal > 0) ? Math.max(rawNegShare, Math.min(0.38, Math.max(0.28, rawNegShare * 1.85))) : rawNegShare;
    const posShare = 1 - negShare;
    const yZeroLine = PAD_T + posShare * chartH;

    const xOf = i => PAD_L + (i / (n - 1)) * chartW;
    const yOf = v => {
      if (minVal < 0 && maxVal > 0) {
        if (v >= 0) {
          return yZeroLine - (v / maxVal) * (posShare * chartH);
        } else {
          return yZeroLine + (Math.abs(v) / Math.abs(minVal)) * (negShare * chartH);
        }
      }
      return PAD_T + chartH - ((v - minVal) / totalRange) * chartH;
    };

    // Colores y tipografía desde Studio o fallback a paleta
    const isGradient = (cfg.amortFillMode !== 'solid');
    const lineColor = cfg.amortLineColor || paleta.primary;
    const areaColorStart = cfg.amortAreaColor || paleta.light;
    const areaColorEnd = cfg.amortAreaColorEnd || paleta.secondary || paleta.primary;
    const paybackColor = cfg.amortPaybackColor || paleta.primary;
    const axisFontSize = (typeof cfg.amortAxisFontSize === 'number') ? cfg.amortAxisFontSize : 8.0;
    const pbFontSize = (typeof cfg.amortPaybackFontSize === 'number') ? cfg.amortPaybackFontSize : 8.0;

    let defs = '';
    let fillAttr = areaColorStart;
    if (isGradient) {
      defs = `<defs>
        <linearGradient id="ra-amort-grad-area" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="${areaColorStart}" stop-opacity="0.85"/>
          <stop offset="100%" stop-color="${areaColorEnd}" stop-opacity="0.15"/>
        </linearGradient>
      </defs>`;
      fillAttr = 'url(#ra-amort-grad-area)';
    }

    // Identificar hitos singulares con sus valores y colores
    const milestones = [];

    // Año 0: Desembolso CAPEX
    if (cashflowAcum.length > 0) {
      milestones.push({
        year: 0,
        val: cashflowAcum[0],
        label: 'Año 0: Desembolso',
        desc: 'Inversión inicial CAPEX',
        color: '#dc2626',
        bg: '#fef2f2',
        border: '#fecaca',
        dash: '3,3'
      });
    }

    // Año 1: Rescate fiscal IRPF / Sociedades + Ahorro
    if (cashflowAcum.length > 1) {
      milestones.push({
        year: 1,
        val: cashflowAcum[1],
        label: 'Año 1: Rescate fiscal',
        desc: 'Deducción IRPF / Sociedades + Ahorro',
        color: '#2563eb',
        bg: '#eff6ff',
        border: '#bfdbfe',
        dash: '3,3'
      });
    }

    // Año 5: Fin bonificación IBI municipal
    if (cashflowAcum.length > 5) {
      milestones.push({
        year: 5,
        val: cashflowAcum[5],
        label: 'Año 5: Fin bonif. IBI',
        desc: 'Término de rebaja IBI municipal',
        color: '#6366f1',
        bg: '#eef2ff',
        border: '#c7d2fe',
        dash: '2,3'
      });
    }

    // Año 10: Reposición de batería LFP (si existe o tiene coste de reemplazo)
    const _batReplCostYr10 = Math.round(fm.batteryReplacementCostYr10 || 0);
    if (cashflowAcum.length > 10 && (_batReplCostYr10 > 0 || fm.batCap > 0)) {
      milestones.push({
        year: 10,
        val: cashflowAcum[10],
        pillText: _batReplCostYr10 > 0 ? ('−' + _batReplCostYr10.toLocaleString('es-ES') + ' €') : null,
        label: 'Año 10: Reposición batería',
        desc: 'Reemplazo acumulador LFP indexado',
        color: '#d97706',
        bg: '#fffbeb',
        border: '#fde68a',
        dash: '4,2'
      });
    }

    // Año 12: Reposición electrónica inversor central/híbrido
    const _invReplCostYr12 = Math.round(fm.inverterReplacementCostYr12 || 0);
    if (cashflowAcum.length > 12 && (fm.inverterReplacementCostYr12 == null || _invReplCostYr12 > 0)) {
      milestones.push({
        year: 12,
        val: cashflowAcum[12],
        pillText: _invReplCostYr12 > 0 ? ('−' + _invReplCostYr12.toLocaleString('es-ES') + ' €') : null,
        label: 'Año 12: Reposición inversor',
        desc: 'Sustitución de inversor central',
        color: '#ea580c',
        bg: '#fff7ed',
        border: '#fed7aa',
        dash: '4,2'
      });
    }

    // Payback (Retorno 0€)
    const effectivePb = (fm.isCelActive && fm.paybackCEL > 0) ? fm.paybackCEL : paybackYears;
    const hasPayback = (typeof effectivePb === 'number' && effectivePb > 0 && effectivePb < n);
    if (hasPayback) {
      milestones.push({
        year: Math.round(effectivePb * 10) / 10,
        val: 0,
        label: fm.isCelActive ? `Año ${effectivePb.toFixed(1)}: Payback CEL` : `Año ${effectivePb.toFixed(1)}: Payback`,
        desc: 'Retorno neto de inversión (0 €)',
        color: paybackColor || '#059669',
        bg: '#ecfdf5',
        border: '#a7f3d0',
        dash: '4,3',
        isPayback: true
      });
    }

    // Payback Estándar sin CEL (cuando CEL está activa)
    if (cfSinCEL) {
      let pbSinCelEst = null;
      for (let y = 1; y < cfSinCEL.length; y++) {
        if (cfSinCEL[y] >= 0) {
          const prev = cfSinCEL[y - 1];
          const diff = cfSinCEL[y] - prev;
          pbSinCelEst = diff > 0 ? (y - 1) + (-prev / diff) : y;
          break;
        }
      }
      if (pbSinCelEst && pbSinCelEst > 0 && pbSinCelEst < n) {
        milestones.push({
          year: Math.round(pbSinCelEst * 10) / 10,
          val: 0,
          label: `Año ${pbSinCelEst.toFixed(1)}: Payback sin CEL`,
          desc: 'Retorno estándar sin inyección a CEL',
          color: '#64748b',
          bg: '#f8fafc',
          border: '#cbd5e1',
          dash: '3,3',
          isSecondaryPayback: true
        });
      }
    }

    // Año 25: Beneficio neto acumulado
    if (cashflowAcum.length > 25) {
      milestones.push({
        year: 25,
        val: cashflowAcum[25],
        label: 'Año 25: Beneficio neto',
        desc: 'Cashflow total acumulado 25 años',
        color: '#059669',
        bg: '#f0fdf4',
        border: '#bbf7d0',
        dash: '2,2'
      });
    }

    // Pastilla explicativa de Comunidad Energética Local (CEL) sincronizada con Página 9
    const celIngreso = (fm.isCelActive && (fm.ingresoCELAnual > 0 ? fm.ingresoCELAnual : fm.celExtraBenefitYear1)) || 0;
    if (fm.isCelActive && celIngreso > 0) {
      const celTotal25 = Math.round(celIngreso * 25 * 0.92); // Estimación acumulada 25 años con degradación
      milestones.push({
        year: -1, // Hito de resumen global (no dibuja punto en el eje X)
        val: celTotal25,
        label: `Ingreso CEL: +${celIngreso.toLocaleString('es-ES')} €/año`,
        desc: `Excedente vertido a CEL (~+${Math.round(celTotal25 / 1000)}k€ en 25 años)`,
        color: '#0284c7',
        bg: '#f0f9ff',
        border: '#bae6fd',
        dash: '2,2',
        isSummaryBadge: true
      });
    }

    // Priorizar hitos clave (0€, inicio, fin) para que sus etiquetas en el eje Y no se solapen
    const sortedMilestones = [...milestones].sort((a, b) => {
      const prio = m => (m.isPayback ? 1 : (m.year === 0 ? 2 : (m.year === 25 ? 3 : 10)));
      return prio(a) - prio(b);
    });

    const fmtK = v => (v >= 0 ? '+' : '') + Math.round(v / 1000) + 'k€';

    // Líneas guía horizontales hacia el eje Y para cada hito con filtro estricto anti-colisión
    let guidesContent = '';
    const renderedLabelY = [];
    sortedMilestones.forEach(mItem => {
      if (mItem.isSummaryBadge || mItem.year < 0) return;
      const yPos = yOf(mItem.val);
      // Evitar pintar fuera del área gráfica
      if (yPos >= PAD_T && yPos <= PAD_T + chartH) {
        const isZeroLine = Math.abs(mItem.val) < 1;
        const lineStroke = isZeroLine ? '#64748b' : (mItem.color || '#94a3b8');
        const lineOpacity = isZeroLine ? '0.75' : '0.45';
        const lineDash = mItem.dash || '3,3';
        guidesContent += `<line x1="${PAD_L}" y1="${yPos.toFixed(1)}" x2="${W - PAD_R}" y2="${yPos.toFixed(1)}" stroke="${lineStroke}" stroke-width="${isZeroLine ? '1.2' : '0.85'}" stroke-dasharray="${lineDash}" stroke-opacity="${lineOpacity}"/>`;

        // Anti-solapamiento de textos en el eje Y: no imprimir si está a menos de 11px de otra etiqueta
        const hasCollision = renderedLabelY.some(prevY => Math.abs(prevY - yPos) < 11);
        if (!hasCollision || isZeroLine) {
          guidesContent += `<text x="${PAD_L - 4}" y="${(yPos + 2.5).toFixed(1)}" text-anchor="end" font-size="${Math.max(6.0, axisFontSize - 1.5)}" fill="${mItem.color}" font-weight="600">${fmtK(mItem.val)}</text>`;
          renderedLabelY.push(yPos);
        }
      }
    });

    // Área rellena (Opción al Contado)
    const yZero = yOf(0);
    let pts = `${PAD_L.toFixed(1)},${yZero.toFixed(1)} `;
    cashflowAcum.forEach((v, i) => { pts += `${xOf(i).toFixed(1)},${yOf(v).toFixed(1)} `; });
    const lastX = xOf(n-1);
    pts += `${lastX.toFixed(1)},${yZero.toFixed(1)}`;
    let areaPolygon = `<polygon points="${pts}" fill="${fillAttr}" opacity="0.88"/>`;

    // ── Línea base sin CEL (Contado Estándar) ──
    let sinCelContent = '';
    if (cfSinCEL) {
      const sinCelPoints = cfSinCEL.map((v, i) => `${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ');
      const sinCelColor = '#64748b'; // Tono neutro/pizarra distinguible
      sinCelContent += `<polyline points="${sinCelPoints}" fill="none" stroke="${sinCelColor}" stroke-width="2.0" stroke-dasharray="3,3" stroke-linejoin="round" stroke-linecap="round" opacity="0.85"/>`;

      // Hito Payback Estándar sin CEL
      let pbSinCel = null;
      for (let y = 1; y < cfSinCEL.length; y++) {
        if (cfSinCEL[y] >= 0) {
          const prev = cfSinCEL[y - 1];
          const diff = cfSinCEL[y] - prev;
          pbSinCel = diff > 0 ? (y - 1) + (-prev / diff) : y;
          break;
        }
      }
      if (pbSinCel && pbSinCel > 0 && pbSinCel < n) {
        const xPosSin = PAD_L + (pbSinCel / (n - 1)) * chartW;
        const yPosSin = yOf(0);
        sinCelContent += `<circle cx="${xPosSin.toFixed(1)}" cy="${yPosSin.toFixed(1)}" r="3.5" fill="${sinCelColor}" stroke="#ffffff" stroke-width="1.2"/>`;
      }
    }

    // Línea principal de cashflow al contado (+CEL si está activa)
    const linePoints = cashflowAcum.map((v, i) => `${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ');
    let mainPolyline = `<polyline points="${linePoints}" fill="none" stroke="${lineColor}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>`;

    // Segunda línea comparativa: Financiado (si está disponible)
    let financedContent = '';
    let pbFin = (typeof fm.paybackFinanciadoYears === 'number') ? fm.paybackFinanciadoYears : null;

    // Si no vino precalculado o era 0/25, deducirlo dinámicamente de la serie acumulada financiada
    if ((pbFin == null || pbFin <= 0 || pbFin >= n) && cfFinanciado) {
      let dipped = false;
      for (let y = 1; y < cfFinanciado.length; y++) {
        if (cfFinanciado[y] < 0) dipped = true;
      }
      if (dipped) {
        let neg = false;
        for (let y = 1; y < cfFinanciado.length; y++) {
          if (cfFinanciado[y] < 0) {
            neg = true;
          } else if (neg && cfFinanciado[y] >= 0) {
            const prev = cfFinanciado[y - 1];
            const diff = cfFinanciado[y] - prev;
            pbFin = diff > 0 ? (y - 1) + (-prev / diff) : y;
            break;
          }
        }
      } else if (cfFinanciado[0] < 0) {
        for (let y = 1; y < cfFinanciado.length; y++) {
          if (cfFinanciado[y] >= 0) {
            const prev = cfFinanciado[y - 1];
            const diff = cfFinanciado[y] - prev;
            pbFin = diff > 0 ? (y - 1) + (-prev / diff) : y;
            break;
          }
        }
      }
    }

    if (cfFinanciado) {
      const finLinePoints = cfFinanciado.map((v, i) => `${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ');
      const finColor = '#3b82f6'; // Azul corporativo de contraste
      financedContent += `<polyline points="${finLinePoints}" fill="none" stroke="${finColor}" stroke-width="2.4" stroke-dasharray="6,4" stroke-linejoin="round" stroke-linecap="round"/>`;

      // Puntos de inflexión en la curva financiada (años singulares del modelo: 0, 1, 5, 10, 12, fin préstamo si <= 25, 25)
      const finInflectionYears = [0, 1, 5];
      if (fm.batCap > 0 || (fm.batteryReplacementCostYr10 && fm.batteryReplacementCostYr10 > 0)) finInflectionYears.push(10);
      if (fm.inverterReplacementCostYr12 == null || fm.inverterReplacementCostYr12 > 0) finInflectionYears.push(12);
      const loanEndYear = Math.round((fm.meses || 120) / 12);
      if (loanEndYear > 0 && loanEndYear < 25 && !finInflectionYears.includes(loanEndYear)) finInflectionYears.push(loanEndYear);
      if (n > 25 && !finInflectionYears.includes(25)) finInflectionYears.push(25);

      finInflectionYears.forEach(yr => {
        if (yr >= 0 && yr < cfFinanciado.length) {
          const xPt = xOf(yr);
          const yPt = yOf(cfFinanciado[yr]);
          financedContent += `<circle cx="${xPt.toFixed(1)}" cy="${yPt.toFixed(1)}" r="3.2" fill="${finColor}" stroke="#ffffff" stroke-width="1.2"/>`;
        }
      });

      // Hito Payback Financiado con pastilla protectora elevada/desplazada anti-solape
      if (pbFin && pbFin > 0 && pbFin < n) {
        const xPosFin = PAD_L + (pbFin / (n - 1)) * chartW;
        const yPosFin = yOf(0);
        const finBadgeText = `Payback Fin. ${pbFin.toFixed(1)}a`;
        const finBadgeW = Math.max(76, Math.round(finBadgeText.length * (pbFontSize * 0.64) + 16));
        const finBadgeH = Math.round(pbFontSize + 8);
        const finDotRadius = 4.5;

        // Desplazamiento hacia abajo (o hacia arriba si coincide con el contado) con anclaje visual
        const isNearContado = typeof effectivePb === 'number' && Math.abs(pbFin - effectivePb) < 3.2;
        const finYOffset = isNearContado ? (finBadgeH * 1.8) : (finBadgeH * 2.2);
        const finRectY = yPosFin + finYOffset;
        const finTextY = finRectY + finBadgeH / 2 + (pbFontSize * 0.35);

        financedContent += `
          <circle cx="${xPosFin.toFixed(1)}" cy="${yPosFin.toFixed(1)}" r="${finDotRadius}" fill="${finColor}" stroke="#ffffff" stroke-width="1.5"/>
          <g>
            <line x1="${xPosFin.toFixed(1)}" y1="${(yPosFin + finDotRadius).toFixed(1)}" x2="${xPosFin.toFixed(1)}" y2="${finRectY.toFixed(1)}" stroke="${finColor}" stroke-width="1.2" stroke-dasharray="2,2" opacity="0.85"/>
            <rect x="${(xPosFin - finBadgeW / 2).toFixed(1)}" y="${finRectY.toFixed(1)}" width="${finBadgeW}" height="${finBadgeH}" rx="4" fill="#ffffff" stroke="${finColor}" stroke-width="1.2" opacity="0.98" filter="drop-shadow(0 1px 2px rgba(0,0,0,0.06))"/>
            <text x="${xPosFin.toFixed(1)}" y="${finTextY.toFixed(1)}" text-anchor="middle" font-size="${pbFontSize}" fill="${finColor}" font-weight="800">${finBadgeText}</text>
          </g>
        `;
      }
    }

    // Leyenda de comparación en cabecera del gráfico con distribución amplia anti-solape
    let legendContent = '';
    if (cfSinCEL) {
      // Caso 3 curvas: Contado + CEL (verde sólida), Sin CEL (pizarra discontinua), Financiado (azul discontinuo)
      const xSinCel = cfFinanciado ? 148 : 185;
      const xFin = 238;
      const xCelTag = cfFinanciado ? 458 : 340;
      const celLegendTag = (celIngreso > 0) ? `
        <g transform="translate(${PAD_L + xCelTag}, ${PAD_T - 9})">
          <rect x="0" y="-4" width="7.5" height="7.5" rx="2" fill="#0284c7"/>
          <text x="11" y="3" font-size="${axisFontSize}" fill="#0369a1" font-weight="700">+CEL Activa (+${celIngreso.toLocaleString('es-ES')} €/a)</text>
        </g>
      ` : '';

      legendContent = `
        <g transform="translate(${PAD_L}, ${PAD_T - 9})">
          <!-- Curva 1: Contado + CEL -->
          <line x1="0" y1="0" x2="14" y2="0" stroke="${lineColor}" stroke-width="2.6"/>
          <circle cx="7" cy="0" r="2.5" fill="${lineColor}"/>
          <text x="18" y="3" font-size="${axisFontSize}" fill="#334155" font-weight="700">Al Contado (+CEL)</text>

          <!-- Curva 2: Sin CEL -->
          <line x1="${xSinCel}" y1="0" x2="${xSinCel + 14}" y2="0" stroke="#64748b" stroke-width="2.0" stroke-dasharray="3,3"/>
          <circle cx="${xSinCel + 7}" cy="0" r="2.5" fill="#64748b"/>
          <text x="${xSinCel + 18}" y="3" font-size="${axisFontSize}" fill="#475569" font-weight="700">Sin CEL</text>

          <!-- Curva 3: Financiado -->
          ${cfFinanciado ? `
            <line x1="${xFin}" y1="0" x2="${xFin + 14}" y2="0" stroke="#3b82f6" stroke-width="2.4" stroke-dasharray="4,3"/>
            <circle cx="${xFin + 7}" cy="0" r="2.5" fill="#3b82f6"/>
            <text x="${xFin + 18}" y="3" font-size="${axisFontSize}" fill="#1e40af" font-weight="700">Financiado (${fm.meses || 120}m · ${fm.cuotaMensual || 0} €/m)</text>
          ` : ''}
        </g>
        ${celLegendTag}
      `;
    } else {
      // Caso 2 curvas estándar (sin CEL)
      const celLegendX = cfFinanciado ? 465 : 215;
      const celLegend = (fm.isCelActive && celIngreso > 0) ? `
        <g transform="translate(${PAD_L + celLegendX}, ${PAD_T - 8})">
          <rect x="0" y="-4" width="8" height="8" rx="2" fill="#0284c7"/>
          <text x="12" y="3" font-size="${axisFontSize}" fill="#0369a1" font-weight="700">+CEL Activa (+${celIngreso.toLocaleString('es-ES')} €/a)</text>
        </g>
      ` : '';

      legendContent = `
        <g transform="translate(${PAD_L}, ${PAD_T - 8})">
          <line x1="0" y1="0" x2="16" y2="0" stroke="${lineColor}" stroke-width="2.6"/>
          <circle cx="8" cy="0" r="2.5" fill="${lineColor}"/>
          <text x="22" y="3" font-size="${axisFontSize}" fill="#334155" font-weight="700">Al Contado (100%)</text>
          ${cfFinanciado ? `
            <line x1="165" y1="0" x2="181" y2="0" stroke="#3b82f6" stroke-width="2.4" stroke-dasharray="4,3"/>
            <circle cx="173" cy="0" r="2.5" fill="#3b82f6"/>
            <text x="187" y="3" font-size="${axisFontSize}" fill="#1e40af" font-weight="700">Financiado (${fm.meses || 120}m · ${fm.cuotaMensual || 0} €/m)</text>
          ` : ''}
        </g>
        ${celLegend}
      `;
    }

    // Marcadores circulares y guías solo para hitos con coordenada temporal válida (year >= 0)
    let markersContent = '';
    milestones.forEach(mItem => {
      if (mItem.isSummaryBadge || mItem.year < 0) return; // Las pastillas de resumen no dibujan punto en la gráfica
      let xPos;
      if (mItem.isPayback) {
        xPos = PAD_L + (effectivePb / (n - 1)) * chartW;
      } else {
        const idx = Math.min(Math.max(0, mItem.year), n - 1);
        xPos = xOf(idx);
      }
      const yPos = yOf(mItem.val);
      const dotRadius = mItem.isPayback ? 5 : 3.5;
      markersContent += `<circle cx="${xPos.toFixed(1)}" cy="${yPos.toFixed(1)}" r="${dotRadius}" fill="${mItem.color}" stroke="#ffffff" stroke-width="1.5"/>`;

      // Hito Payback Contado con pastilla protectora elevada (3x altura hacia arriba) para no pisar la gráfica y ancho auto-ajustado al texto
      if (mItem.isPayback) {
        const pbBadgeText = fm.isCelActive ? `Payback CEL ${effectivePb.toFixed(1)}a` : `Payback Contado ${effectivePb.toFixed(1)}a`;
        // Estimación métrica del ancho según longitud del texto y tamaño tipográfico + padding horizontal generoso
        const badgeW = Math.max(76, Math.round(pbBadgeText.length * (pbFontSize * 0.64) + 16));
        const badgeH = Math.round(pbFontSize + 8); // ~16px
        // Desplazado 3 veces su altura (~48px) hacia arriba desde el punto de la gráfica
        const yOffset = badgeH * 3; // ~48px
        const rectY = yPos - yOffset;
        const textY = rectY + badgeH / 2 + (pbFontSize * 0.35);

        markersContent += `
          <g>
            <!-- Línea conectora fina desde el punto exacto de retorno hasta la pastilla elevada -->
            <line x1="${xPos.toFixed(1)}" y1="${(yPos - dotRadius).toFixed(1)}" x2="${xPos.toFixed(1)}" y2="${(rectY + badgeH).toFixed(1)}" stroke="${mItem.color || paleta.primary || '#10b981'}" stroke-width="1.2" stroke-dasharray="2,2" opacity="0.85"/>
            <rect x="${(xPos - badgeW / 2).toFixed(1)}" y="${rectY.toFixed(1)}" width="${badgeW}" height="${badgeH}" rx="4" fill="#ffffff" stroke="${mItem.color || paleta.primary || '#10b981'}" stroke-width="1.2" opacity="0.98" filter="drop-shadow(0 1px 2px rgba(0,0,0,0.06))"/>
            <text x="${xPos.toFixed(1)}" y="${textY.toFixed(1)}" text-anchor="middle" font-size="${pbFontSize}" fill="${mItem.color || paleta.dark || '#059669'}" font-weight="800">${pbBadgeText}</text>
          </g>
        `;
      }
    });

    // Eje X — años
    let xAxisContent = '';
    for (let y = 0; y <= n - 1; y += 5) {
      const xx = xOf(y);
      xAxisContent += `<text x="${xx.toFixed(1)}" y="${(H - PAD_B + 13).toFixed(1)}" text-anchor="middle" font-size="${axisFontSize}" fill="#475569" font-weight="600">Año ${y}</text>`;
    }

    const svgChart = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" style="display:block;max-width:100%;">
      ${defs}
      ${legendContent}
      ${guidesContent}
      ${areaPolygon}
      ${sinCelContent}
      ${mainPolyline}
      ${financedContent}
      ${markersContent}
      ${xAxisContent}
      <text x="${W/2}" y="${H - 3}" text-anchor="middle" font-size="${axisFontSize}" fill="#64748b">Retorno de inversión acumulado a 25 años (€) · Comparativa Contado vs Financiado</text>
    </svg>`;

    // Hilera de pastillas explicativas (badge pills) bajo el gráfico
    let pillsHTML = '<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:stretch;margin-top:10px;justify-content:flex-start;">';
    milestones.forEach(mItem => {
      pillsHTML += `<div style="display:inline-flex;align-items:center;gap:6px;padding:4px 8px;background:${mItem.bg};border:1px solid ${mItem.border};border-radius:14px;font-size:9px;line-height:1.2;color:#1e293b;">
        <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${mItem.color};flex-shrink:0;"></span>
        <div>
          <strong style="color:${mItem.color};font-weight:700;">${mItem.label}</strong>
          <span style="color:#64748b;margin-left:3px;font-size:8.5px;">(${mItem.pillText || fmtK(mItem.val)})</span>
        </div>
      </div>`;
    });
    pillsHTML += '</div>';

    return svgChart + pillsHTML;
  }

  // ── Resolución de equipos del catálogo (SSOT) ──────────────────────────────
  const _eqp = resolveEquipmentNames();
  const _studioCfg = (typeof window !== 'undefined' && window.RAProposalStyleStudio && typeof window.RAProposalStyleStudio.getActiveConfig === 'function')
    ? window.RAProposalStyleStudio.getActiveConfig()
    : null;

  // ── Sincronización SSOT de métricas CEL (Comunidad Energética Local) ─────────
  const _commCfgForPages = (typeof RAPricing !== 'undefined' && typeof RAPricing.getCommercialConfig === 'function') ? RAPricing.getCommercialConfig() : null;
  const _customCelPrice = (_commCfgForPages && typeof _commCfgForPages.celPriceEur === 'number') ? _commCfgForPages.celPriceEur : 0.11;
  const _celMetrics = calculateCELMetrics(d, m, _customCelPrice);

  if (m.isCelActive && _celMetrics) {
    m.paybackCEL = _celMetrics.paybackCEL;
    m.ingresoCELAnual = _celMetrics.ingresoCELAnual;
    m.beneficioExtraCEL = _celMetrics.beneficioExtraCEL;
    m.reduccionPaybackAnios = _celMetrics.reduccionPaybackAnios;
    m.ahorroTotalConCEL = _celMetrics.ahorroTotalConCEL;
  }

  const histogramSVG = buildMonthlyHistogramSVG(monthlyYields, pal, _studioCfg, m);
  let rawCashflowData = m.cashflowAcum || [];
  let cashflowData = rawCashflowData;

  const effectivePaybackYears = (m.isCelActive && m.paybackCEL > 0) ? m.paybackCEL : m.paybackYears;
  const amortSVG = cashflowData.length > 0
    ? buildAmortizationSVG(cashflowData, m.capexBruto, effectivePaybackYears, pal, _studioCfg, m)
    : '<p style="color:#94a3b8;font-size:10px;text-align:center">Configure los datos financieros para ver la curva de amortización.</p>';
  // ── Resumen comercial para el cliente (Plantilla fija instantánea o generador SSOT) ──
  // [AUD-2026 v2 · SEC2-02] Los valores interpolados en la plantilla van escapados (vienen de
  // datos del proyecto/usuario); los números pasan por el escape sin alterarse.
  const _escInterp = _escProp;
  const _summaryHTML = (_studioCfg && _studioCfg.lockedTexts && _studioCfg.lockedTexts.useLockedSummary && _studioCfg.lockedTexts.summaryTemplate)
    ? window.RAProposalStyleStudio.interpolateText(_studioCfg.lockedTexts.summaryTemplate, {
        clientName: d.tit.nombre != null ? _escInterp(d.tit.nombre) : undefined,
        companyName: companyName != null ? _escInterp(companyName) : undefined,
        kwp: m.kwp.toFixed(2),
        numPanels: m.numPanels,
        windCount: _eqp.hasWind ? (_eqp.windCount || 1) : 0,
        windKw: _eqp.hasWind ? (_eqp.windTotalKw || 0) : 0,
        annualYield: Math.round(annualYieldKWh).toLocaleString('es-ES'),
        ahorroAnual: Math.round(m.ahorroLuzAnio1).toLocaleString('es-ES'),
        payback: m.paybackYears.toFixed(1),
        capexBruto: Math.round(m.capexBruto).toLocaleString('es-ES'),
        capexNeto: Math.round(m.capexNeto).toLocaleString('es-ES')
      })
    : generateCommercialSummary(d, m, _eqp);


  // ── Identidad Corporativa & Logo en Encabezados ─────────────────────────────
  const _coverLogoH = (_studioCfg && Number(_studioCfg.coverLogoHeightPx)) || 48;
  const _innerLogoH = (_studioCfg && Number(_studioCfg.innerHeaderLogoHeightPx)) || 28;
  const _headerLogoScope = (_studioCfg && _studioCfg.headerLogoScope) || 'all';
  const _headerLogoFormat = (_studioCfg && _studioCfg.headerLogoFormat) || 'logo_and_title';
  const _headerLogoStyle = (_studioCfg && _studioCfg.headerLogoStyle) || 'clean';
  const _logoStyleWrapClass = _headerLogoStyle === 'pill' ? ' ra-logo-pill' : (_headerLogoStyle === 'subtle' ? ' ra-logo-subtle' : '');

  const logoBlock = logoDataUrl
    ? `<span class="ra-header-logo-wrap${_logoStyleWrapClass}"><img src="${logoDataUrl}" class="ra-cover-logo-img" style="height:${_coverLogoH}px;max-height:${_coverLogoH}px;max-width:180px;object-fit:contain;" alt="Logo empresa"/></span>`
    : `<div style="font-size:22px;font-weight:900;color:${pal.primary};letter-spacing:-0.5px;display:inline-flex;align-items:center;gap:4px;">
        ${companyName.split(' ').slice(0,2).map(w => _escProp(w)).join(_mSvg('bolt', 18, pal.accent))}
      </div>`;

  function renderInnerHeaderLogoHTML() {
    if (_headerLogoScope === 'none') return '';
    if (!logoDataUrl) return '';
    return `<span class="ra-header-logo-wrap${_logoStyleWrapClass}" style="display:inline-flex;align-items:center;">
      <img src="${logoDataUrl}" class="ra-header-logo-img" style="height:${_innerLogoH}px;max-height:${_innerLogoH}px;max-width:160px;object-fit:contain;vertical-align:middle;" alt="Logo"/>
    </span>`;
  }

  function buildInnerHeaderHTML(titleHTML, subHTML, pageIndex) {
    const innerLogo = renderInnerHeaderLogoHTML();
    let leftSideHTML = '';
    let rightSideLogo = '';

    if (_headerLogoFormat === 'logo_only') {
      leftSideHTML = `
        <div class="company-text" style="display:flex;align-items:center;gap:12px;">
          ${innerLogo}
          <div>
            <div class="name">${titleHTML}</div>
            ${subHTML ? `<div class="sub">${subHTML}</div>` : ''}
          </div>
        </div>`;
    } else if (_headerLogoFormat === 'right_aligned') {
      leftSideHTML = `
        <div class="company-text">
          <div class="name">${titleHTML}</div>
          ${subHTML ? `<div class="sub">${subHTML}</div>` : ''}
        </div>`;
      rightSideLogo = innerLogo ? `<div style="margin-left:12px;">${innerLogo}</div>` : '';
    } else {
      leftSideHTML = `
        <div style="display:flex;align-items:center;gap:12px;">
          ${innerLogo ? `${innerLogo}<div style="width:1.5px;height:30px;background:#cbd5e1;flex-shrink:0;"></div>` : ''}
          <div class="company-text">
            <div class="name">${titleHTML}</div>
            ${subHTML ? `<div class="sub">${subHTML}</div>` : ''}
          </div>
        </div>`;
    }

    return `
      <div class="cover-header ra-header-flex">
        ${leftSideHTML}
        <div class="doc-ref-box" style="display:flex;align-items:center;text-align:right;">
          <div><b>Ref: ${d.refNum}</b><br>Hoja ${pageIndex} de ${_totPages}</div>
          ${rightSideLogo}
        </div>
      </div>`;
  }

  const contactBlock = [companyPhone, companyWeb].filter(Boolean).join(' · ');

  // Factor de margen para desglose comercial de cliente (oculta costes directos y margen industrial)
  // Si el usuario activa "Cargar margen comercial mayoritariamente s/ Mano de Obra e Instalación",
  // los materiales se presentan a coste directo y el margen se integra en las partidas de montaje e ingeniería.
  const _marginLaborOnly = Boolean(m.ivaCompliance && m.ivaCompliance.isRenovacion10 && m.ivaCompliance.marginOnLaborOnly);
  const _mFactor = _marginLaborOnly ? 1.0 : (1 + ((typeof m.marginPct === 'number' ? m.marginPct : 20) / 100.0));
  const _cPan = Math.round(m.panCost * _mFactor);
  const _cEst = Math.round(m.estCost * _mFactor);
  const _cInv = Math.round(m.invCost * _mFactor);
  const _cBat = Math.round(m.batCost * _mFactor);
  const _cCab = Math.round(m.cabCost * _mFactor);
  const _cWind = Math.round((m.windCost || 0) * _mFactor);
  // Total de partidas de equipo e instalación base con margen comercial aplicado
  const _baseEquipTotal = Math.round(m.directCost + m.marginEur);
  const _cMo = _marginLaborOnly
    ? Math.round((m.moCost || 0) + (m.marginEur * 0.80))
    : Math.round(m.moCost * _mFactor);
  // Legalización e ingeniería absorbe el 20% restante del margen en modo labor-only y el residuo de redondeo
  const _cLeg = Math.max(0, _baseEquipTotal - (_cPan + _cEst + _cInv + _cBat + _cCab + _cMo + _cWind));
  // Pre-carga no bloqueante de portada por defecto para próximas entregas
  if (typeof window !== 'undefined' && window.RALazyLoader && typeof window.RALazyLoader.loadDefaultCoverImage === 'function') {
    window.RALazyLoader.loadDefaultCoverImage().catch(function() {});
  }
  // Recuperación resiliente de fotos personalizadas persistidas (por proyecto o sesión)
  const _defaultCoverImg = (typeof window !== 'undefined' && window.RA_DEFAULT_COVER_IMAGE) ? window.RA_DEFAULT_COVER_IMAGE : 'assets/coopgreen-cover.jpg';
  const _propPhotos = (function() {
    try {
      const mem = (typeof window !== 'undefined' && window.RA && window.RA._proposalCustomPhotos) ? window.RA._proposalCustomPhotos : null;
      if (mem) {
        if (!mem.cover) mem.cover = _defaultCoverImg;
        return mem;
      }
      const ss = (typeof sessionStorage !== 'undefined') ? JSON.parse(sessionStorage.getItem('ra_proposal_custom_photos') || '{}') : {};
      const res = ss || {};
      if (!res.cover) res.cover = _defaultCoverImg;
      return res;
    } catch (e) { return { cover: _defaultCoverImg }; }
  })();

  // Captura automática de snapshot 3D Cesium WebGL
  let _viewerSnapshot = _propPhotos.hero || null;
  try {
    const v = (typeof window !== 'undefined' && window.viewer) ? window.viewer : null;
    if (v && v.scene && v.scene.canvas) {
      v.scene.render();
      if (!_propPhotos.hero) {
        _viewerSnapshot = v.scene.canvas.toDataURL('image/jpeg', 0.92);
      }
    }
  } catch (e) {
    if (window.RA && window.RA.log) window.RA.log.warn('[PropuestaComercial] Error capturando snapshot 3D:', e);
  }

  const windTurbineCount = (typeof window !== 'undefined' && Array.isArray(window.windTurbines))
    ? window.windTurbines.filter(t => t && (!t.operationalState || t.operationalState.enabled !== false)).length
    : ((typeof designCosts !== 'undefined' && designCosts && designCosts.windCount) || 0);
  const _installationModality = (_studioCfg && _studioCfg.installationModality) || 'grid_surplus_cel';
  const _isOffGrid = (_installationModality === 'off_grid');
  const _isGridZero = (_installationModality === 'grid_zero');
  const _isGridBackup = (_installationModality === 'grid_backup');
  const _refGridPriceEUR = (_studioCfg && typeof _studioCfg.referenceGridPriceEUR === 'number' && _studioCfg.referenceGridPriceEUR > 0)
    ? _studioCfg.referenceGridPriceEUR
    : (m.precioRedEUR || 0.22);
  const _offGridAnnualValueEUR = Math.round(annualYieldKWh * _refGridPriceEUR);
  const _offGridMonthlyValueEUR = Math.round(_offGridAnnualValueEUR / 12);
  const _offGridLcoeEUR = (typeof m.lcoe === 'number' && m.lcoe > 0) ? m.lcoe : (m.capexNeto / Math.max(1, annualYieldKWh * 25));
  const _offGridBalanceFinMes = _offGridMonthlyValueEUR - Math.round(m.cuotaMensual || 85);
  const _modalTextoFinal = _isOffGrid
    ? 'Instalación Aislada de Red (100% Independiente / Off-Grid)'
    : (_isGridZero
        ? 'Autoconsumo Conectado con Producción Adaptada al Consumo (Vertido Cero)'
        : (_isGridBackup
            ? 'Autoconsumo Híbrido Conectado + Respaldo Anti-Apagones 24h'
            : (d.modalTexto || 'Autoconsumo Conectado con Excedentes / CEL')));

  const _hasThreePkgs = (_studioCfg && _studioCfg.sectionsEnabled && typeof _studioCfg.sectionsEnabled.packages_comparison === 'boolean')
    ? _studioCfg.sectionsEnabled.packages_comparison
    : Boolean(_commCfgForPages && _commCfgForPages.showThreePackagesComparison);
  const _includeCEL = (_isOffGrid || _isGridZero)
    ? false
    : ((_studioCfg && _studioCfg.sectionsEnabled && typeof _studioCfg.sectionsEnabled.cel === 'boolean')
        ? _studioCfg.sectionsEnabled.cel
        : ((_commCfgForPages && _commCfgForPages.includeCEL !== undefined) ? _commCfgForPages.includeCEL : false));
  const _hasBillAudit = (!_isOffGrid && typeof window !== 'undefined' && window.RA && window.RA.billAuditor && window.RA.billAuditor.currentBill && window.RA.billAuditor.comparison);
  const _includeBillAuditPage = (_studioCfg && _studioCfg.sectionsEnabled && typeof _studioCfg.sectionsEnabled.bill_audit === 'boolean')
    ? (_studioCfg.sectionsEnabled.bill_audit && _hasBillAudit)
    : Boolean(_hasBillAudit);

  let _pageTracker = 3;
  const _pageIndexComparativa = _hasThreePkgs ? ++_pageTracker : 0;
  const _pageIndexInfografias = _hasThreePkgs ? ++_pageTracker : 0;
  const _pageIndexProduccion = ++_pageTracker;
  const _pageIndexBillAudit = _includeBillAuditPage ? ++_pageTracker : 0;
  const _pageIndexCEL = _includeCEL ? ++_pageTracker : 0;
  const _pageIndexCEL2 = _includeCEL ? ++_pageTracker : 0;
  const _pageIndexPresupuesto = ++_pageTracker;
  const _pageIndexFiscal = ++_pageTracker;
  const _pageIndexDecision = ++_pageTracker;
  const _pageIndexGarantias = ++_pageTracker;
  const _totPages = _pageTracker;
  const _infografias = buildInfografiasHTML(m, pal, annualYieldKWh, layoutStyle, {
    gastoSin: gastoMensualSinSolar,
    gastoCon: gastoMensualConSolar,
    installationModality: _installationModality,
    referenceGridPriceEUR: _refGridPriceEUR
  });
  const payload = {
    refNum: d.refNum,
    fechaStr: d.fechaStr,
    nombre: d.tit.nombre,
    nif: d.tit.nif,
    dir: d.tit.dir,
    mun: d.tit.mun,
    prov: d.tit.prov,
    cups: d.tit.cups,
    tecnico: d.tit.tecnico,
    titulacion: d.tit.titulacion,
    ncol: d.tit.ncol,
    modalTexto: d.modalTexto,
    numPanels: m.numPanels,
    kwp: m.kwp,
    cfg_pot: d.cfg.potencia,
    cfg_mod: d.cfg.modelo,
    cfg_tec: d.cfg.tecnologia,
    annualYieldKWh: annualYieldKWh,
    panCost: m.panCost,
    estCost: m.estCost,
    invCost: m.invCost,
    batCost: m.batCost,
    cabCost: m.cabCost,
    moCost: m.moCost,
    legCost: m.legCost,
    subtotal: m.subtotal,
    ivaRate: m.ivaRate,
    iva: m.iva,
    capexBruto: m.capexBruto,
    customerProfile: m.customerProfile,
    isRate: m.isRate,
    ahorroSociedades: m.ahorroSociedades,
    ahorroIBITotal: m.ahorroIBITotal,
    ahorroIRPF: m.ahorroIRPF,
    ahorroICIO: m.ahorroICIO,
    totalAhorroFiscal: m.totalAhorroFiscal,
    capexNeto: m.capexNeto,
    autarquiaPct: m.autarquiaPct,
    ahorroLuzAnio1: m.ahorroLuzAnio1,
    paybackYears: m.paybackYears,
    van: m.van,
    tir: m.tir,
    lcoe: m.lcoe,
    cuotaMensual: m.cuotaMensual,
    ahorroMensualLuz: m.ahorroMensualLuz,
    balanceNetoMensual: m.balanceNetoMensual,
    mesesFin: m.mesesFin,
    tinAnualPct: m.tinAnualPct
  };

  const code = `<!DOCTYPE html>
  <html lang="es">
  <head>
    <meta charset="UTF-8">
    <title>Propuesta Comercial Solar FV — ${d.refNum}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,200..800&family=Comfortaa:wght@300;400;600;700&family=DM+Sans:ital,opsz,wght@0,9..40,400..700;1,9..40,400..700&family=Inter:wght@400;600;700;800&family=Montserrat:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,700&family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet">
    <style>
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      body { background: #f1f5f9; font-family: 'Comfortaa', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #0f172a; padding: 20px; display: flex; flex-direction: column; align-items: center; padding-top: 70px; }
      .doc-top-bar { position: fixed; top: 0; left: 0; right: 0; height: 50px; background: #0f172a; color: #fff; display: flex; align-items: center; justify-content: space-between; padding: 0 20px; z-index: 99999; box-shadow: 0 4px 20px rgba(0,0,0,0.3); border-bottom: 2px solid ${pal.primary}; }
      .doc-bar-title { font-weight: 800; font-size: 12px; color: #f8fafc; letter-spacing: 0.5px; display: flex; align-items: center; gap: 8px; }
      .doc-bar-title span { color: ${pal.accent}; font-family: monospace; font-size: 11px; }
      .doc-bar-btns { display: flex; gap: 8px; align-items: center; }
      .doc-btn { border: none; border-radius: 6px; padding: 7px 14px; font-size: 11px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: all 0.15s ease; }
      .doc-btn-print { background: ${pal.primary}; color: #fff; }
      .doc-btn-print:hover { background: ${pal.dark}; }
      .doc-btn-word { background: #2563eb; color: #fff; }
      .doc-btn-word:hover { background: #1d4ed8; }
      .doc-btn-html { background: #475569; color: #fff; }
      .doc-btn-html:hover { background: #334155; }
      .doc-btn-edit { background: ${pal.accent}; color: #000; }
      .doc-btn-close { background: #ef4444; color: #fff; }
      .page-sheet { width: 210mm; min-height: 297mm; max-height: 297mm; height: 297mm; background: #ffffff; padding: 18mm 20mm; margin-bottom: 24px; box-shadow: 0 12px 35px rgba(0,0,0,0.09); border-radius: 4px; box-sizing: border-box; overflow: hidden; position: relative; display: flex; flex-direction: column; justify-content: space-between; }
      .cover-page {
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        padding: 15mm 18mm 13mm;
        background: #ffffff;
        position: relative;
      }
      .cover-brand-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding-bottom: 12px;
        border-bottom: 3.5px solid ${pal.primary};
      }
      .cover-brand-meta {
        text-align: right;
        font-size: 11px;
        color: #475569;
        line-height: 1.5;
      }
      .cover-hero-title {
        margin: 12px 0 9px;
        text-align: center;
      }
      .cover-hero-tag {
        display: inline-block;
        background: ${pal.light};
        color: ${pal.dark};
        font-size: 11px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 1.5px;
        padding: 4px 14px;
        border-radius: 20px;
        margin-bottom: 10px;
        border: 1px solid ${pal.accent};
      }
      .cover-hero-h1 {
        font-size: 24px;
        font-weight: 900;
        color: #0f172a;
        letter-spacing: -0.6px;
        line-height: 1.18;
        text-transform: uppercase;
        text-wrap: balance;
      }
      .cover-hero-sub {
        font-size: 12.5px;
        color: #64748b;
        margin-top: 6px;
        font-weight: 600;
        line-height: 1.32;
        text-wrap: balance;
      }
      .cover-client-card {
        background: #f8fafc;
        border: 1.5px solid #e2e8f0;
        border-radius: 12px;
        padding: 12px 18px;
        margin: 10px 0 12px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.03);
      }
      .cover-client-header {
        font-size: 11px;
        font-weight: 900;
        color: ${pal.primary};
        text-transform: uppercase;
        letter-spacing: 0.8px;
        margin-bottom: 10px;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .cover-client-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 8px 18px;
        font-size: 11px;
        line-height: 1.45;
      }
      .cover-specs-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 9px;
        margin: 5px 0 10px;
      }
      .cover-spec-box {
        background: #f8fafc;
        border: 1.5px solid #e2e8f0;
        border-radius: 10px;
        padding: 8px 6px;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        justify-content: space-between;
        min-height: 92px;
        box-shadow: 0 2px 6px rgba(0,0,0,0.03);
        transition: all 0.2s ease;
      }
      .cover-spec-box.highlight {
        background: linear-gradient(135deg, ${pal.light}, #ffffff);
        border: 2px solid ${pal.primary};
        box-shadow: 0 4px 14px rgba(0,0,0,0.06);
      }
      .cover-spec-icon {
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #ffffff;
        border: 1.5px solid #e2e8f0;
        border-radius: 10px;
        margin-bottom: 5px;
        box-shadow: 0 1px 4px rgba(0,0,0,0.03);
      }
      .cover-spec-label {
        font-size: 9px;
        font-weight: 800;
        color: #64748b;
        text-transform: uppercase;
        letter-spacing: 0.4px;
        margin-bottom: 3px;
        line-height: 1.22;
        text-wrap: balance;
      }
      .cover-spec-val {
        font-size: 16.5px;
        font-weight: 900;
        color: #0f172a;
        line-height: 1.15;
        white-space: nowrap;
      }
      .cover-spec-val.primary {
        color: ${pal.primary};
      }
      .cover-spec-sub {
        font-size: 8.5px;
        color: #64748b;
        margin-top: 3px;
        font-weight: 600;
        line-height: 1.22;
      }
      .cover-footer {
        padding-top: 9px;
        border-top: 1px solid #e2e8f0;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 10px;
        color: #94a3b8;
      }
      .tech-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 14px 0 18px; }
      .tech-grid.has-7-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 12px 0 16px; }
      .tech-grid.has-7-cards > .tech-card:last-child { grid-column: 2; }
      .tech-grid.compact-4 { grid-template-columns: repeat(4, 1fr); gap: 9px; margin: 10px 0 14px; }
      .tech-grid.has-7-cards .tech-card { padding: 11px 9px; min-height: 152px; border-radius: 10px; }
      .tech-grid.has-7-cards .tech-icon-box { width: 48px; height: 48px; border-radius: 12px; margin-bottom: 6px; }
      .tech-grid.has-7-cards .tech-icon-box svg { width: 36px !important; height: 36px !important; }
      .tech-grid.has-7-cards .tech-info { margin-bottom: 6px; }
      .tech-grid.has-7-cards .tech-label { font-size: 8.5px; letter-spacing: 0.5px; margin-bottom: 2px; }
      .tech-grid.has-7-cards .tech-name { font-size: 10.5px; line-height: 1.28; }
      .tech-grid.has-7-cards .tech-sub { font-size: 9px; line-height: 1.22; margin-top: 2px; }
      .tech-grid.has-7-cards .tech-badge { padding: 4px 6px; font-size: 10px; border-radius: 7px; }
      .tech-card { border: 1.5px solid #e2e8f0; border-radius: 12px; padding: 18px 14px; background: #f8fafc; display: flex; flex-direction: column; align-items: center; text-align: center; justify-content: space-between; min-height: 195px; box-shadow: 0 2px 6px rgba(0,0,0,0.03); transition: all 0.2s ease; }
      .tech-card:hover { border-color: ${pal.primary}; box-shadow: 0 6px 16px rgba(0,0,0,0.06); }
      .tech-grid.compact-4 .tech-card { padding: 9px 8px; min-height: 140px; border-radius: 9px; }
      .tech-icon-box { width: 68px; height: 68px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: #ffffff; border: 2px solid #e2e8f0; border-radius: 16px; margin-bottom: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
      .tech-grid.compact-4 .tech-icon-box { width: 44px; height: 44px; border-radius: 10px; margin-bottom: 6px; }
      .tech-grid.compact-4 .tech-icon-box svg { width: 32px !important; height: 32px !important; }
      .tech-info { width: 100%; display: flex; flex-direction: column; align-items: center; margin-bottom: 10px; }
      .tech-grid.compact-4 .tech-info { margin-bottom: 6px; }
      .tech-label { font-size: 9px; font-weight: 900; color: #64748b; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 4px; }
      .tech-grid.compact-4 .tech-label { font-size: 8px; letter-spacing: 0.4px; margin-bottom: 2px; }
      .tech-name { font-size: 11.5px; font-weight: 900; color: #0f172a; line-height: 1.35; max-width: 100%; word-break: break-word; }
      .tech-grid.compact-4 .tech-name { font-size: 10px; line-height: 1.25; }
      .tech-sub { font-size: 9.5px; color: #64748b; line-height: 1.3; margin-top: 4px; }
      .tech-grid.compact-4 .tech-sub { font-size: 8.5px; line-height: 1.2; margin-top: 2px; }
      .tech-badge { width: 100%; text-align: center; background: #ffffff; border: 1.5px solid #cbd5e1; border-radius: 8px; padding: 6px 8px; font-size: 11.5px; font-weight: 900; color: ${pal.primary}; box-shadow: 0 1px 3px rgba(0,0,0,0.02); }
      .tech-grid.compact-4 .tech-badge { padding: 4px 5px; font-size: 9.5px; border-radius: 6px; }
      /* Estilos para Página de Fotos e Implantación 3D */
      .photo-grid-main { display: flex; flex-direction: column; gap: 12px; margin-top: 10px; }
      .photo-card-hero { height: 96mm; border: 1.5px solid #cbd5e1; border-radius: 8px; overflow: hidden; background: #f8fafc; position: relative; display: flex; flex-direction: column; }
      .cover-photo-card { height: 58mm; border: none; border-radius: 10px; overflow: hidden; background: transparent; position: relative; display: flex; flex-direction: column; margin: 8px 0 10px; box-shadow: none; }
      .cover-photo-card .photo-img-wrap { background: transparent; }
      .cover-photo-card .photo-img-wrap img { object-fit: contain; }
      .photo-card-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; height: 68mm; }
      .photo-card-sub { border: 1.5px solid #cbd5e1; border-radius: 8px; overflow: hidden; background: #f8fafc; position: relative; display: flex; flex-direction: column; }
      .photo-img-wrap { flex: 1; position: relative; overflow: hidden; background: #0f172a; display: flex; align-items: center; justify-content: center; cursor: pointer; }
      .photo-img-wrap img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .photo-caption-bar { background: #ffffff; border-top: 1px solid #e2e8f0; padding: 6px 10px; display: flex; justify-content: space-between; align-items: center; font-size: 10px; flex-shrink: 0; }
      .photo-caption-title { font-weight: 800; color: #0f172a; outline: none; }
      .photo-caption-desc { font-size: 9px; color: #64748b; outline: none; }
      .photo-upload-overlay { position: absolute; top: 8px; right: 8px; background: rgba(15,23,42,0.75); color: #fff; font-size: 9px; font-weight: 700; padding: 4px 8px; border-radius: 4px; display: flex; align-items: center; gap: 4px; pointer-events: none; transition: background 0.2s; backdrop-filter: blur(2px); }
      .photo-img-wrap:hover .photo-upload-overlay { background: rgba(15,23,42,0.92); }
      .photo-empty-placeholder { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; color: #94a3b8; text-align: center; padding: 20px; }
      @media print {
        .photo-upload-overlay { display: none !important; }
        .photo-card-hero, .photo-card-sub { border-color: #94a3b8; }
      }
      .closer-hero-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: ${layoutStyle === 'editorial' ? '14px' : '10px'}; margin: ${layoutStyle === 'editorial' ? '18px 0 24px' : '12px 0 16px'}; }
      .closer-hero-card { background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 10px; padding: ${layoutStyle === 'editorial' ? '16px 10px' : '12px 8px'}; text-align: center; transition: all 0.2s ease; }
      .decision-boxes { display: grid; grid-template-columns: 1fr 1fr; gap: ${layoutStyle === 'editorial' ? '18px' : '12px'}; margin: ${layoutStyle === 'editorial' ? '20px 0' : '14px 0'}; }
      .decision-card { border-radius: 10px; padding: ${layoutStyle === 'editorial' ? '18px 20px' : '14px 16px'}; border: 1.5px solid #e2e8f0; background: #f8fafc; }
      h2 { font-size: 13px; font-weight: 800; color: #1e293b; text-transform: uppercase; letter-spacing: 0.5px; margin: ${layoutStyle === 'editorial' ? '26px 0 14px' : '18px 0 10px'}; border-left: 4px solid ${pal.primary}; padding-left: 10px; display: flex; align-items: center; gap: 8px; }
      table { width: 100%; border-collapse: collapse; margin: ${layoutStyle === 'editorial' ? '12px 0 24px' : '8px 0 16px'}; font-size: ${layoutStyle === 'editorial' ? '11px' : '10.5px'}; }
      th { background: #f8fafc; color: #475569; font-weight: 800; text-align: left; padding: ${layoutStyle === 'editorial' ? '10px 12px' : '7px 10px'}; border-bottom: 2px solid #e2e8f0; }
      td { padding: ${layoutStyle === 'editorial' ? '10px 12px' : '7px 10px'}; border-bottom: 1px solid #f1f5f9; color: #334155; }
      .cover-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid ${pal.primary}; padding-bottom: 16px; margin-bottom: 22px; }
      .company-block { display: flex; align-items: center; gap: 14px; }
      .company-text .name { font-size: 18px; font-weight: 900; color: #0f172a; }
      .company-text .sub { font-size: 10px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px; margin-top: 2px; }
      .company-text .contact { font-size: 10px; color: #94a3b8; margin-top: 3px; }
      .doc-ref-box { text-align: right; font-size: 11px; color: #475569; }
      .doc-ref-box b { color: #0f172a; font-size: 13px; }
      .hero-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 12px 0 20px; }
      .hero-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; text-align: center; }
      .hero-val { font-size: 19px; font-weight: 900; color: #0f172a; margin-top: 4px; }
      .hero-val.primary { color: ${pal.primary}; }
      .hero-lbl { font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; }
      .text-right { text-align: right; }
      .total-row td { font-weight: 900; font-size: 12.5px; color: #0f172a; background: #fffbeb; border-top: 2px solid ${pal.primary}; }
      .chart-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-bottom: 20px; }
      .chart-title { font-size: 11px; font-weight: 800; color: #1e293b; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.3px; }
      .closer-hero-card.highlight { background: linear-gradient(135deg, ${pal.light}, #ffffff); border: 2px solid ${pal.primary}; }
      .closer-hero-val { font-size: 21px; font-weight: 900; color: #0f172a; margin: 4px 0 2px; }
      .closer-hero-val.primary { color: ${pal.primary}; }
      .closer-hero-lbl { font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
      .closer-hero-sub { font-size: 10px; color: #64748b; margin-top: 2px; font-weight: 600; }
      .decision-card.featured { border: 2px solid ${pal.primary}; background: #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.04); }
      .decision-title { font-size: 11.5px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between; }
      .decision-row { display: flex; justify-content: space-between; align-items: center; font-size: 10.5px; padding: 3px 0; color: #475569; }
      .decision-total { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; padding-top: 8px; border-top: 1.5px solid #cbd5e1; font-weight: 900; font-size: 13px; color: #0f172a; }
      .closer-cta-box { margin-top: 16px; background: #f8fafc; border: 2px dashed ${pal.primary}; border-radius: 8px; padding: 12px 18px; display: flex; justify-content: space-between; align-items: center; }
      .sig-box-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 36px; }
      .sig-card { border: 1px dashed #cbd5e1; border-radius: 6px; padding: 16px; text-align: center; font-size: 10.5px; }
      .sig-logo-box { display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 8px; }
      .pill { display: inline-block; background: ${pal.light}; color: ${pal.dark}; font-size: 10px; font-weight: 800; padding: 3px 8px; border-radius: 12px; margin: 2px; }

      /* Estilos para modo edición interactivo (redimensionar, arrastrar y borrar) */
      body.mode-edit-layout [data-editable-box] {
        position: relative !important;
        cursor: grab !important;
        resize: both !important;
        overflow: auto !important;
        min-width: 60px !important;
        min-height: 40px !important;
        transition: outline 0.15s ease, box-shadow 0.15s ease;
      }
      body.mode-edit-layout [data-editable-box]:active {
        cursor: grabbing !important;
      }
      body.mode-edit-layout [data-editable-box]:hover {
        outline: 2px dashed ${pal.primary} !important;
        box-shadow: 0 0 10px rgba(0,0,0,0.12) !important;
      }
      body.mode-edit-layout [data-editable-box].selected-edit-box {
        outline: 2.5px solid ${pal.primary} !important;
        box-shadow: 0 0 14px rgba(0,0,0,0.2) !important;
      }
      .ra-edit-del-btn {
        position: absolute;
        top: 6px;
        right: 6px;
        width: 22px;
        height: 22px;
        background: #ef4444;
        color: #ffffff;
        border: 2px solid #ffffff;
        border-radius: 50%;
        display: none;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        font-weight: 900;
        cursor: pointer;
        z-index: 10000;
        box-shadow: 0 2px 8px rgba(0,0,0,0.4);
        user-select: none;
        line-height: 1;
      }
      body.mode-edit-layout [data-editable-box]:hover > .ra-edit-del-btn,
      body.mode-edit-layout [data-editable-box].selected-edit-box > .ra-edit-del-btn {
        display: flex !important;
      }
      .ra-edit-del-btn:hover {
        background: #dc2626 !important;
        transform: scale(1.15);
      }

      /* ── TIRADORES DE ESPACIADO INTERACTIVOS (OPCIÓN B: GAP HANDLERS) ── */
      .ra-gap-handle {
        position: absolute;
        z-index: 10005;
        background: rgba(15, 23, 42, 0.88);
        color: #38BDF8;
        border: 1px solid rgba(56, 189, 248, 0.4);
        border-radius: 4px;
        display: none;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        font-weight: 900;
        user-select: none;
        box-shadow: 0 2px 8px rgba(0,0,0,0.35);
        transition: transform 0.1s, background 0.15s, border-color 0.15s;
      }
      body.mode-edit-layout [data-editable-box]:hover > .ra-gap-handle,
      body.mode-edit-layout [data-editable-box].selected-edit-box > .ra-gap-handle {
        display: flex !important;
      }
      .ra-gap-handle:hover {
        background: #0284c7 !important;
        color: #ffffff !important;
        border-color: #38BDF8 !important;
        transform: scale(1.18);
      }
      .ra-gap-handle-x {
        top: 50%;
        right: -8px;
        transform: translateY(-50%);
        width: 16px;
        height: 28px;
        cursor: col-resize !important;
      }
      .ra-gap-handle-y {
        bottom: -8px;
        left: 50%;
        transform: translateX(-50%);
        width: 28px;
        height: 16px;
        cursor: row-resize !important;
      }

      /* ── TIRADORES DE TAMAÑO Y REDIMENSIÓN (CORNER ◢ Y ALTURA ⇕) ── */
      .ra-resize-handle {
        position: absolute;
        z-index: 10006;
        background: #0284c7;
        color: #ffffff;
        border: 1px solid #38bdf8;
        border-radius: 4px;
        display: none;
        align-items: center;
        justify-content: center;
        user-select: none;
        box-shadow: 0 2px 8px rgba(0,0,0,0.4);
        transition: transform 0.1s, background 0.15s;
      }
      body.mode-edit-layout [data-editable-box]:hover > .ra-resize-handle,
      body.mode-edit-layout [data-editable-box].selected-edit-box > .ra-resize-handle {
        display: flex !important;
      }
      .ra-resize-handle:hover {
        background: #0369a1 !important;
        color: #ffffff !important;
        border-color: #7dd3fc !important;
        transform: scale(1.15);
      }
      .ra-resize-corner {
        bottom: 0px;
        right: 0px;
        width: 18px;
        height: 18px;
        font-size: 11px;
        line-height: 1;
        cursor: se-resize !important;
        border-radius: 4px 0 4px 0;
      }
      .ra-resize-height {
        bottom: -9px;
        right: 28px;
        padding: 1px 7px;
        font-size: 9px;
        font-weight: 800;
        cursor: ns-resize !important;
        letter-spacing: 0.3px;
      }
      #ra-gap-tooltip {
        position: fixed;
        display: none;
        z-index: 100010;
        background: #0f172a;
        color: #38bdf8;
        border: 1px solid #0284c7;
        border-radius: 5px;
        padding: 3px 8px;
        font-size: 10.5px;
        font-weight: 800;
        pointer-events: none;
        box-shadow: 0 4px 12px rgba(0,0,0,0.5);
      }

      /* ── BARRA FLOTANTE DE FORMATO (RICH TEXT) ── */
      #prop-format-toolbar {
        position: fixed;
        display: none;
        background: #0f172a;
        border: 1px solid #334155;
        box-shadow: 0 10px 25px rgba(0,0,0,0.5);
        border-radius: 8px;
        padding: 5px 8px;
        z-index: 100000;
        align-items: center;
        gap: 6px;
        font-family: system-ui, sans-serif;
      }
      #prop-format-toolbar button, #prop-format-toolbar select {
        background: #1e293b;
        border: 1px solid #475569;
        color: #fff;
        border-radius: 4px;
        padding: 3px 7px;
        font-size: 11px;
        font-weight: 700;
        cursor: pointer;
        outline: none;
      }
      #prop-format-toolbar button:hover {
        background: #334155;
      }
      #prop-format-toolbar input[type="color"] {
        width: 24px;
        height: 22px;
        padding: 0;
        border: 1px solid #475569;
        border-radius: 4px;
        cursor: pointer;
        background: transparent;
      }
      @page { size: A4 portrait; margin: 0; }
      *, *::before, *::after { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      @media print {
        html, body { background: #fff; padding: 0; margin: 0; width: 210mm; }
        .doc-top-bar { display: none !important; }
        .page-sheet { box-shadow: none; border-radius: 0; width: 210mm; min-height: 295mm; max-height: 296mm; height: auto; padding: 16mm 18mm; margin: 0; page-break-before: auto; page-break-after: always; break-after: page; page-break-inside: avoid; break-inside: avoid; overflow: hidden; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between; }
        .page-sheet:last-child { page-break-after: avoid; break-after: avoid; }
        thead { display: table-header-group; }
        tr, .hero-card, .closer-hero-card, .decision-card, .sig-card, .chart-box, .tech-card { page-break-inside: avoid; break-inside: avoid; }
        h2 { page-break-after: avoid; break-after: avoid; margin: 10px 0 5px; }
        table { margin: 4px 0 10px; }
        td, th { padding: 4.5px 7px; }
      }
      ${(typeof window !== 'undefined' && window.RAProposalStyleStudio && typeof window.RAProposalStyleStudio.buildInjectedStylesheet === 'function') ? window.RAProposalStyleStudio.buildInjectedStylesheet('portrait', themeOverride) : ''}
    </style>
  </head>
  <body>
    <!-- TOOLTIP DINÁMICO DE SEPARACIÓN (OPCIÓN B) -->
    <div id="ra-gap-tooltip" class="no-print"></div>

    <!-- BARRA FLOTANTE DE FORMATO TEXTUAL -->
    <div id="prop-format-toolbar" class="no-print">
      <select id="prop-fmt-font" onchange="applyPropFormat('fontName', this.value)" title="Tipografía">
        <option value="'Comfortaa', cursive, sans-serif" selected>Comfortaa (Redondeada - Por Defecto)</option>
        <option value="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif">Sistema / Sans</option>
        <option value="Inter, system-ui, sans-serif">Inter</option>
        <option value="Roboto, sans-serif">Roboto</option>
        <option value="'Space Grotesk', sans-serif">Space Grotesk</option>
        <option value="Georgia, serif">Georgia</option>
        <option value="'Courier New', monospace">Monospace</option>
      </select>
      <select id="prop-fmt-size" onchange="applyPropFormat('fontSize', this.value)" title="Tamaño">
        <option value="2">Pequeño (10pt)</option>
        <option value="3" selected>Normal (12pt)</option>
        <option value="4">Medio (14pt)</option>
        <option value="5">Título H3 (18pt)</option>
        <option value="6">Título H2 (24pt)</option>
      </select>
      <button type="button" onclick="applyPropFormat('bold')" title="Negrita"><b>B</b></button>
      <button type="button" onclick="applyPropFormat('italic')" title="Cursiva"><i>I</i></button>
      <button type="button" onclick="applyPropFormat('underline')" title="Subrayado"><u>U</u></button>
      <button type="button" onclick="applyPropFormat('strikeThrough')" title="Tachado"><s>S</s></button>
      <input type="color" id="prop-fmt-color" onchange="applyPropFormat('foreColor', this.value)" title="Color del texto" value="#0f172a">
      <button type="button" onclick="applyPropFormat('justifyLeft')" title="Alinear Izquierda">⇤</button>
      <button type="button" onclick="applyPropFormat('justifyCenter')" title="Centrar">≡</button>
      <button type="button" onclick="applyPropFormat('justifyRight')" title="Alinear Derecha">⇥</button>
    </div>

    <div class="doc-top-bar no-print">
      <div class="doc-bar-title"><span>OFERTA COMERCIAL</span> PROPUESTA ECONÓMICA Y TÉCNICA · ${d.refNum}</div>
      <div class="doc-bar-btns">
        <!-- Selector interactivo de paleta corporativa idéntica al dossier -->
        <div style="display:flex;align-items:center;gap:5px;background:rgba(255,255,255,0.08);padding:3px 8px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);margin-right:6px;">
          <span style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;display:inline-flex;align-items:center;gap:4px;">${_mSvg('palette', 12, '#94a3b8')} Paleta:</span>
          <button type="button" onclick="setDocTheme('emerald')" title="Verde Esmeralda" style="width:16px;height:16px;border-radius:50%;background:#059669;border:2px solid ${theme==='emerald'?'#fff':'transparent'};cursor:pointer;"></button>
          <button type="button" onclick="setDocTheme('sky')" title="Azul Técnico" style="width:16px;height:16px;border-radius:50%;background:#0284c7;border:2px solid ${theme==='sky'||theme==='blue'?'#fff':'transparent'};cursor:pointer;"></button>
          <button type="button" onclick="setDocTheme('amber')" title="Ámbar Cálido" style="width:16px;height:16px;border-radius:50%;background:#d97706;border:2px solid ${theme==='amber'?'#fff':'transparent'};cursor:pointer;"></button>
          <button type="button" onclick="setDocTheme('rose')" title="Rosa Corporativo" style="width:16px;height:16px;border-radius:50%;background:#e11d48;border:2px solid ${theme==='rose'?'#fff':'transparent'};cursor:pointer;"></button>
          <button type="button" onclick="setDocTheme('slate')" title="Gris Pizarra" style="width:16px;height:16px;border-radius:50%;background:#334155;border:2px solid ${theme==='slate'?'#fff':'transparent'};cursor:pointer;"></button>
        </div>
        <button class="doc-btn" style="background:#8b5cf6;color:#fff;display:inline-flex;align-items:center;gap:5px;" onclick="capture3DToProposal()" title="Actualizar fotos con captura 3D en vivo del proyecto">${_mSvg('camera', 13, '#ffffff')} CAPTURAR VISTA 3D</button>
        <button class="doc-btn doc-btn-edit" id="btn-prop-edit" style="display:inline-flex;align-items:center;gap:5px;" onclick="togglePropEdit()">${_mSvg('edit', 13, 'currentColor')} EDITAR</button>
        <button class="doc-btn doc-btn-print" style="display:inline-flex;align-items:center;gap:5px;" onclick="window.print()">${_mSvg('printer', 13, 'currentColor')} IMPRIMIR / PDF</button>
        <button class="doc-btn doc-btn-word" id="btn-export-docx" style="display:inline-flex;align-items:center;gap:5px;" onclick="exportPropDocx()" title="Descargar documento Word (.docx) con maquetación e imágenes completas">${_mSvg('fileText', 13, 'currentColor')} WORD (.DOCX)</button>
        <button class="doc-btn doc-btn-html" style="display:inline-flex;align-items:center;gap:5px;" onclick="exportPropHtml()">${_mSvg('globe', 13, 'currentColor')} HTML</button>
        <button class="doc-btn doc-btn-close" style="display:inline-flex;align-items:center;justify-content:center;" onclick="closeProposalViewer()" title="Cerrar propuesta">${_mSvg('close', 14, 'currentColor')}</button>
      </div>
    </div>

    <!-- PÁGINA 1: PORTADA Y PRESENTACIÓN INICIAL DEL PROYECTO -->
    <div class="page-sheet cover-page" data-section-id="cover">
      <div>
        <!-- Cabecera de Portada: Logo y Datos de Empresa -->
        <div class="cover-brand-row">
          <div style="display:flex;align-items:center;gap:16px;">
            ${logoBlock}
            <div>
              <div style="font-size:20px;font-weight:900;color:#0f172a;letter-spacing:-0.4px;">${_escProp(companyName)}</div>
              <div style="font-size:10px;font-weight:700;color:${pal.primary};text-transform:uppercase;letter-spacing:1px;margin-top:2px;">Oficina Técnica &amp; Ingeniería de Energías Renovables</div>
              ${companyCIF ? '<div style="font-size:10px;color:#64748b;margin-top:2px;">CIF: ' + _escProp(companyCIF) + (contactBlock ? ' · ' + _escProp(contactBlock) : '') + '</div>' : (contactBlock ? '<div style="font-size:10px;color:#64748b;margin-top:2px;">' + _escProp(contactBlock) + '</div>' : '')}
            </div>
          </div>
          <div class="cover-brand-meta">
            <div style="font-weight:900;font-size:13px;color:#0f172a;">REF: ${d.refNum}</div>
            <div>Fecha: ${d.fechaStr}</div>
            <div>Hoja 1 de ${_totPages}</div>
            <div style="margin-top:4px;"><span class="card-tag" style="background:${pal.light};color:${pal.dark};font-weight:800;padding:2px 8px;border-radius:4px;font-size:9.5px;">${branding.status === 'orientativa' ? 'PROPUESTA ORIENTATIVA' : 'PROPUESTA VINCULANTE'}</span></div>
          </div>
        </div>

        <!-- Bloque Titular de Presentación -->
        <div class="cover-hero-title">
          <h1 class="cover-hero-h1">${
            (_studioCfg && _studioCfg.lockedTexts && _studioCfg.lockedTexts.coverMainTitle && window.RAProposalStyleStudio && typeof window.RAProposalStyleStudio.formatManualLineBreaks === 'function')
              ? window.RAProposalStyleStudio.formatManualLineBreaks(_studioCfg.lockedTexts.coverMainTitle)
              : 'PROYECTO INTEGRAL DE<br>GENERACIÓN RENOVABLE'
          }</h1>
          <div class="cover-hero-sub">${
            (_studioCfg && _studioCfg.lockedTexts && _studioCfg.lockedTexts.coverSubtitle && window.RAProposalStyleStudio && typeof window.RAProposalStyleStudio.formatManualLineBreaks === 'function')
              ? window.RAProposalStyleStudio.formatManualLineBreaks(_studioCfg.lockedTexts.coverSubtitle)
              : 'Estudio de viabilidad técnica, diseño CAD 3D y análisis de rentabilidad para autoconsumo'
          }</div>
        </div>

        <!-- CUADRO CENTRAL DE IMAGEN PRINCIPAL DE PORTADA / GEMELO 3D -->
        <div class="cover-photo-card">
          <div class="photo-img-wrap" onclick="triggerPhotoUpload('photo-cover-input')">
            <input type="file" id="photo-cover-input" accept="image/*" style="display:none;" onchange="handlePhotoUpload(this, 'photo-cover-img', 'photo-cover-placeholder')">
            ${_propPhotos.cover ? `
              <img id="photo-cover-img" src="${_propPhotos.cover}" alt="Imagen del proyecto" style="display:block;">
              <div id="photo-cover-placeholder" style="display:none;"></div>
            ` : (_viewerSnapshot ? `
              <img id="photo-cover-img" src="${_viewerSnapshot}" alt="Simulación del proyecto" style="display:block;">
              <div id="photo-cover-placeholder" style="display:none;"></div>
            ` : `
              <img id="photo-cover-img" style="display:none;" alt="Imagen del proyecto">
              <div id="photo-cover-placeholder" class="photo-empty-placeholder">
                <span style="display:inline-flex;color:#64748b;">${_mSvg('camera', 28, '#64748b')}</span>
                <span style="font-size:11px;font-weight:700;">Haz clic para cargar imagen de portada o fotografía del inmueble</span>
                <span style="font-size:9px;">Formatos recomendados: JPG o PNG (alta resolución)</span>
              </div>
            `)}
            <div class="photo-upload-overlay">${_mSvg('camera', 12, '#ffffff', 'margin-right:4px;')} Cambiar foto de portada</div>
          </div>
        </div>

        <!-- 4 Cajas Principales de Características Técnicas de la Instalación -->
        <div class="cover-specs-section">
          <div class="cover-specs-heading" style="font-size:10.5px;font-weight:900;color:#1e293b;text-transform:uppercase;letter-spacing:0.6px;margin:10px 0 8px;border-left:4px solid ${pal.primary};padding-left:10px;">
            CARACTERÍSTICAS PRINCIPALES DE LA INSTALACIÓN
          </div>

          <div class="cover-specs-grid">
            <!-- Caja 1: Número de placas / aerogeneradores -->
            <div class="cover-spec-box">
              <div class="cover-spec-icon">
                ${(window.RA_SvgCatalog ? window.RA_SvgCatalog.render('panel', pal.primary, 34) : '')}
              </div>
              <div>
                <div class="cover-spec-label">${(windTurbineCount > 0) ? 'Generadores Instalados' : 'Módulos Solares'}</div>
                <div class="cover-spec-val primary">${m.numPanels} ${(windTurbineCount > 0) ? ('+ ' + windTurbineCount + ' aero') : 'Placas'}</div>
                <div class="cover-spec-sub">${
                  (windTurbineCount > 0)
                    ? (m.numPanels + ' módulos FV + ' + windTurbineCount + ' turbina(s)')
                    : (m.modulesBreakdown && m.modulesBreakdown.isMultiModule)
                      ? ('Tier-1 Multi-modelo (' + m.modulesBreakdown.uniqueModelsCount + ' mod · ' + m.kwp.toFixed(2) + ' kWp)')
                      : ('Tecnología Tier-1 ' + (d.cfg && d.cfg.potencia ? d.cfg.potencia : 450) + ' Wp')
                }</div>
              </div>
            </div>

            <!-- Caja 2: Potencia Pico / Instalada -->
            <div class="cover-spec-box">
              <div class="cover-spec-icon">
                ${(window.RA_SvgCatalog ? window.RA_SvgCatalog.render('inverter', pal.primary, 34) : '')}
              </div>
              <div>
                <div class="cover-spec-label">${_eqp.hasWind ? 'Potencia Híbrida Total' : 'Potencia Pico Total'}</div>
                <div class="cover-spec-val">${_eqp.hasWind ? ((m.kwp + _eqp.windTotalKw).toFixed(2) + ' kW') : (m.kwp.toFixed(2) + ' kWp')}</div>
                <div class="cover-spec-sub">${
                  _eqp.hasWind
                    ? (m.kwp.toFixed(2) + ' kWp Solar · ' + _eqp.windTotalKw.toFixed(1) + ' kW Eólica')
                    : (_eqp.totalAcKw > 0 ? (_eqp.totalAcKw.toFixed(1) + ' kW AC nominal') : 'Conversión de alta eficiencia')
                }</div>
              </div>
            </div>

            <!-- Caja 3: Energía Generada Año 1 -->
            <div class="cover-spec-box">
              <div class="cover-spec-icon">
                ${(window.RA_SvgCatalog ? window.RA_SvgCatalog.render('peakSun', pal.primary, 34) : '')}
              </div>
              <div>
                <div class="cover-spec-label">${_eqp.hasWind ? 'Producción Anual Total' : 'Producción Anual'}</div>
                <div class="cover-spec-val primary">${Math.round(annualYieldKWh + (_eqp.hasWind ? _eqp.windAepNetKwh : 0)).toLocaleString('es-ES')} kWh</div>
                <div class="cover-spec-sub">${
                  _eqp.hasWind
                    ? (_mSvg('sun', 11, pal.primary, 'margin-right:3px;') + Math.round(annualYieldKWh).toLocaleString('es-ES') + ' kWh FV + ' + _mSvg('wind', 11, pal.primary, 'margin-right:3px;') + Math.round(_eqp.windAepNetKwh).toLocaleString('es-ES') + ' kWh Eól.')
                    : '~100% calibrado por gemelo 3D'
                }</div>
              </div>
            </div>

            <!-- Caja 4: Precio / Inversión Llave en Mano -->
            <div class="cover-spec-box highlight">
              <div class="cover-spec-icon" style="border-color:${pal.primary};background:${pal.light};">
                ${(window.RA_SvgCatalog ? window.RA_SvgCatalog.render('piggyBank', pal.primary, 34) : '')}
              </div>
              <div>
                <div class="cover-spec-label" style="color:${pal.dark};">Inversión Llave en Mano</div>
                <div class="cover-spec-val" style="color:${pal.dark};font-size:19px;">${Math.round(m.capexBruto).toLocaleString('es-ES')} €</div>
                <div class="cover-spec-sub" style="color:${pal.dark};font-weight:700;">IVA ${Math.round((m.ivaRate != null ? m.ivaRate : 0.21) * 100)}% inc. · ${Math.round(m.capexNeto).toLocaleString('es-ES')} € neto subv.</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Pie de Portada -->
      <div class="cover-footer">
        <span>Garantía de rendimiento: ${warPower} años · Marcado CE · Código Técnico de la Edificación (CTE)</span>
        <span>${_escProp(companyName)} · ${_escProp(d.refNum)}</span>
      </div>
    </div>

    <!-- PÁGINA 2: ESPECIFICACIÓN TÉCNICA Y CATÁLOGO DE EQUIPAMIENTO -->
    <div class="page-sheet" data-section-id="installation">
      <div>
        ${buildInnerHeaderHTML('ESPECIFICACIÓN <span style="color:' + pal.primary + '">TÉCNICA &amp; COMPONENTES</span>', 'Datos de Emplazamiento · Dimensionamiento · Catálogo de Equipos Principales', 2)}

        <h2>1. Datos del cliente y ubicación</h2>
        <table>
          <tr><td width="30%"><strong>Cliente / Titular:</strong></td><td>${_escProp(d.tit.nombre)} (${_escProp(d.tit.nif)})</td></tr>
          <tr><td><strong>Dirección Instalación:</strong></td><td>${_escProp(d.tit.dir || 'Instalación Solar')}, ${_escProp(d.tit.mun || '')} (${_escProp(d.tit.prov || '')})</td></tr>
          <tr><td><strong>Punto Suministro (CUPS):</strong></td><td>${_isOffGrid ? 'Suministro Aislado Independiente (Sin acometida de red)' : _escProp(d.tit.cups)}</td></tr>
          <tr><td><strong>Modalidad Instalación:</strong></td><td>${_modalTextoFinal}</td></tr>
        </table>

        <h2>2. Configuración técnica seleccionada</h2>
        <div class="tech-grid${(4 + (_eqp.hasWind ? 1 : 0) + (_eqp.hasOptimizer ? 1 : 0)) === 7 ? ' has-7-cards' : ((4 + (_eqp.hasWind ? 1 : 0) + (_eqp.hasOptimizer ? 1 : 0)) > 7 ? ' compact-4' : '')}">
          <!-- 1. Módulos -->
          <div class="tech-card">
            <div class="tech-icon-box">
              ${(window.RA_SvgCatalog ? window.RA_SvgCatalog.render('panel', pal.primary, 52) : '')}
            </div>
            <div class="tech-info">
              <div class="tech-label">MÓDULOS FOTOVOLTAICOS</div>
              ${(m.modulesBreakdown && m.modulesBreakdown.isMultiModule)
                ? `<div class="tech-name">Generador Multi-Campo (${m.modulesBreakdown.uniqueModelsCount} modelos)</div>
                   <div class="tech-sub">${m.modulesBreakdown.byModel.map(bm => bm.count + '× ' + bm.fullName + ' (' + bm.wp + 'W)').join(' · ')}</div>`
                : `<div class="tech-name" title="${d.cfg.modelo}">${d.cfg.modelo}</div>
                   <div class="tech-sub">${d.cfg.potencia} Wp · ${d.cfg.tecnologia}</div>`
              }
            </div>
            <div class="tech-badge">
              ${m.numPanels} uds · ${m.kwp.toFixed(2)} kWp
            </div>
          </div>

          <!-- 2. Inversor / Microinversores (según Topología SSOT) -->
          <div class="tech-card">
            <div class="tech-icon-box">
              ${(window.RA_SvgCatalog ? window.RA_SvgCatalog.render('inverter', pal.primary, 52) : '')}
            </div>
            <div class="tech-info">
              <div class="tech-label">${_eqp.topology === 'microinverter' ? 'SISTEMA DE MICROINVERSORES' : 'INVERSOR DE RED'}</div>
              <div class="tech-name" title="${_eqp.topology === 'microinverter' ? (_eqp.microName || _eqp.invName) : _eqp.invName}">${_eqp.topology === 'microinverter' ? (_eqp.microName || _eqp.invName) : _eqp.invName}</div>
              <div class="tech-sub">${_eqp.topology === 'microinverter'
                ? 'Conversión descentralizada AC a nivel de panel · MPPT individual'
                : (_eqp.invCount > 1 
                    ? (_eqp.invCount + '× ' + _eqp.invKw + ' kW (' + _eqp.totalAcKw.toFixed(1) + ' kW AC total) · ' + _eqp.totalMPPTs + ' MPPT · Conversión de Alta Eficiencia')
                    : 'Conversión DC/AC de Alta Eficiencia + Smart Meter')}</div>
            </div>
            <div class="tech-badge">
              ${_eqp.topology === 'microinverter'
                ? (_eqp.microCount + ' uds · ' + _eqp.totalMicroKw.toFixed(1) + ' kW AC')
                : (_eqp.invCount + ' ud' + (_eqp.invCount > 1 ? 's' : '') + ' · ' + _eqp.totalAcKw.toFixed(1) + ' kW AC')}
            </div>
          </div>

          <!-- 3. Almacenamiento -->
          <div class="tech-card">
            <div class="tech-icon-box">
              ${(window.RA_SvgCatalog ? window.RA_SvgCatalog.render('battery', _eqp.hasBat ? pal.primary : '#94a3b8', 52) : '')}
            </div>
            <div class="tech-info">
              <div class="tech-label">SISTEMA DE ALMACENAMIENTO</div>
              <div class="tech-name" title="${_eqp.hasBat ? _eqp.batName : 'Sin acumulación (Conexión Directa)'}">${_eqp.hasBat ? _eqp.batName : 'Sin acumulación'}</div>
              <div class="tech-sub">${_eqp.hasBat 
                ? (_eqp.batCount > 1 
                    ? (_eqp.batCount + ' módulos × ' + _eqp.batKwh + ' kWh (' + _eqp.totalBatKwh.toFixed(1) + ' kWh total) · Batería LFP con BMS') 
                    : 'Batería LFP Litio-Ferrofosfato con BMS (' + _eqp.totalBatKwh.toFixed(1) + ' kWh)') 
                : 'Preparado para ampliación futura'}</div>
            </div>
            <div class="tech-badge" style="${!_eqp.hasBat ? 'color:#94a3b8;border-color:#e2e8f0;' : ''}">
              ${_eqp.hasBat ? (_eqp.batCount + ' ud' + (_eqp.batCount > 1 ? 's' : '') + ' · ' + _eqp.totalBatKwh.toFixed(1) + ' kWh') : '—'}
            </div>
          </div>

          <!-- 3.BIS Generación Mini-Eólica (Aerogeneradores) -->
          ${_eqp.hasWind ? `
          <div class="tech-card">
            <div class="tech-icon-box">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="52" height="52" fill="none" stroke="${pal.primary}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 12c0-3 2.5-5.5 5.5-5.5S23 9 23 12s-2.5 5.5-5.5 5.5S12 15 12 12z" opacity="0.3"/>
                <path d="M12 12L12 2a4 4 0 0 1 4 4c0 3-4 6-4 6z"/>
                <path d="M12 12l-8.66 5a4 4 0 0 1 1.46-5.46c2.6-1.5 7.2.46 7.2.46z"/>
                <path d="M12 12l-3.34 9.4c-1.37 2.37-4.4 3.18-6.77 1.8-2.37-1.37-3.18-4.4-1.8-6.77L12 12z" opacity="0.15"/>
                <circle cx="12" cy="12" r="2.5" fill="${pal.primary}"/>
                <line x1="12" y1="14.5" x2="12" y2="23" stroke-width="2.2"/>
              </svg>
            </div>
            <div class="tech-info">
              <div class="tech-label">GENERACIÓN MINI-EÓLICA</div>
              <div class="tech-name" title="${_escProp(_eqp.windName)}">${_escProp(_eqp.windName)}</div>
              <div class="tech-sub">${_escProp(_eqp.windDesc)}</div>
            </div>
            <div class="tech-badge">
              ${_eqp.windCount} ud${_eqp.windCount > 1 ? 's' : ''} · ${_eqp.windTotalKw.toFixed(1)} kW
            </div>
          </div>
          ` : ''}

          <!-- 4. Optimizadores de Potencia (solo si la topología es optimizer y hay optimizadores) -->
          ${(_eqp.topology === 'optimizer' && _eqp.hasOptimizer && _eqp.optimizerCount > 0) ? `
          <div class="tech-card">
            <div class="tech-icon-box">
              ${(window.RA_SvgCatalog ? window.RA_SvgCatalog.render('inverter', pal.primary, 52) : '')}
            </div>
            <div class="tech-info">
              <div class="tech-label">OPTIMIZADORES DE POTENCIA</div>
              <div class="tech-name" title="${_escProp(_eqp.optimizerName)}">${_escProp(_eqp.optimizerName)}</div>
              <div class="tech-sub">Optimización individual MPPT a nivel de módulo DC</div>
            </div>
            <div class="tech-badge">
              ${_eqp.optimizerCount} uds
            </div>
          </div>
          ` : ''}

          <!-- 5. Estructura & Soporte -->
          <div class="tech-card">
            <div class="tech-icon-box">
              ${(window.RA_SvgCatalog ? window.RA_SvgCatalog.render('structure', pal.primary, 52) : '')}
            </div>
            <div class="tech-info">
              <div class="tech-label">ESTRUCTURA Y FIJACIÓN</div>
              <div class="tech-name">Aluminio Anodizado AL6005-T5</div>
              <div class="tech-sub">Tornillería Inox A2 · Resistencia al viento y corrosión</div>
            </div>
            <div class="tech-badge">
              ${m.numPanels} uds
            </div>
          </div>

          <!-- 6. Cableado & Protecciones -->
          <div class="tech-card">
            <div class="tech-icon-box">
              ${(window.RA_SvgCatalog ? window.RA_SvgCatalog.render('protections', pal.primary, 52) : '')}
            </div>
            <div class="tech-info">
              <div class="tech-label">CABLEADO Y CUADROS DE PROTECCIÓN</div>
              <div class="tech-name">Líneas ZZ-F 1.5kV + Cuadro DC/AC</div>
              <div class="tech-sub">Sobretensiones SPD Tipo II + Magnetotérmico IGA</div>
            </div>
            <div class="tech-badge">
              1 lote
            </div>
          </div>
        </div>
      </div>
      <div style="font-size:9.5px;color:#94a3b8;border-top:1px solid #f1f5f9;padding-top:8px;display:flex;justify-content:space-between;">
        <span>Certificaciones: IEC 61215 · IEC 61730 · Marcado CE · Código Técnico Edificación (CTE DB-HE5)</span>
        <span>${_escProp(companyName)}</span>
      </div>
    </div>

    <!-- PÁGINA 3: IMPLANTACIÓN SOLAR Y VISTAS DEL PROYECTO (FOTOS Y SIMULACIÓN 3D) -->
    <div class="page-sheet" data-section-id="installation_views">
      <div>
        ${buildInnerHeaderHTML('IMPLANTACIÓN SOLAR &amp; <span style="color:' + pal.primary + '">VISTAS DEL PROYECTO</span>', 'Simulación Tridimensional · Integración Arquitectónica · Reporte Fotográfico', 3)}

        <h2>Gemelo digital y reportaje fotográfico de la instalación</h2>
        <p style="font-size:10px;color:#64748b;margin-bottom:8px;">Vistas de integración del campo solar sobre cubierta y ubicación prevista para los componentes principales:</p>

        <div class="photo-grid-main">
        <!-- Foto 1: Principal Hero 3D -->
        <div class="photo-card-hero">
          <div class="photo-img-wrap" onclick="triggerPhotoUpload('photo-hero-input')">
            <input type="file" id="photo-hero-input" accept="image/*" style="display:none;" onchange="handlePhotoUpload(this, 'photo-hero-img', 'photo-hero-placeholder')">
            ${_viewerSnapshot ? `
              <img id="photo-hero-img" src="${_viewerSnapshot}" alt="Simulación 3D de la cubierta fotovoltaica">
              <div id="photo-hero-placeholder" style="display:none;"></div>
            ` : `
              <img id="photo-hero-img" style="display:none;" alt="Simulación 3D">
              <div id="photo-hero-placeholder" class="photo-empty-placeholder">
                <span style="display:inline-flex;color:#64748b;">${_mSvg('camera', 28, '#64748b')}</span>
                <span style="font-size:11px;font-weight:700;">Haz clic para cargar imagen 3D o foto de la cubierta</span>
                <span style="font-size:9px;">Formatos recomendados: JPG o PNG</span>
              </div>
            `}
            <div class="photo-upload-overlay">${_mSvg('camera', 12, '#ffffff', 'margin-right:4px;')} Reemplazar foto / 3D</div>
          </div>
          <div class="photo-caption-bar">
            <div>
              <div class="photo-caption-title" contenteditable="true">SIMULACIÓN 3D: CUBIERTA SOLAR Y ANÁLISIS DE SOMBRAS</div>
              <div class="photo-caption-desc" contenteditable="true">Disposición optimizada de ${m.numPanels} módulos fotovoltaicos (${m.kwp.toFixed(2)} kWp) sobre faldón.</div>
            </div>
            <div style="font-size:9px;font-weight:800;color:${pal.primary};background:#f8fafc;padding:3px 8px;border-radius:4px;border:1px solid #e2e8f0;">VISTA PRINCIPAL</div>
          </div>
        </div>

        <!-- Fila de fotos auxiliares -->
        <div class="photo-card-row">
          <!-- Foto 2: Detalle / Emplazamiento Real -->
          <div class="photo-card-sub">
            <div class="photo-img-wrap" onclick="triggerPhotoUpload('photo-sub1-input')">
              <input type="file" id="photo-sub1-input" accept="image/*" style="display:none;" onchange="handlePhotoUpload(this, 'photo-sub1-img', 'photo-sub1-placeholder')">
              ${_propPhotos.sub1 ? `
                <img id="photo-sub1-img" src="${_propPhotos.sub1}" alt="Detalle del tejado" style="display:block;">
                <div id="photo-sub1-placeholder" style="display:none;"></div>
              ` : `
                <img id="photo-sub1-img" style="display:none;" alt="Detalle del tejado">
                <div id="photo-sub1-placeholder" class="photo-empty-placeholder">
                  <span style="display:inline-flex;color:#64748b;">${_mSvg('home', 24, '#64748b')}</span>
                  <span style="font-size:10.5px;font-weight:700;">Foto real del tejado / fachada</span>
                  <span style="font-size:8.5px;">Haz clic para subir desde el disco local</span>
                </div>
              `}
              <div class="photo-upload-overlay">${_mSvg('camera', 12, '#ffffff', 'margin-right:4px;')} Cargar foto</div>
            </div>
            <div class="photo-caption-bar">
              <div>
                <div class="photo-caption-title" contenteditable="true">EMPLAZAMIENTO REAL DE CUBIERTA</div>
                <div class="photo-caption-desc" contenteditable="true">Estado previo del tejado y verificación de orientación/inclinación.</div>
              </div>
            </div>
          </div>

          <!-- Foto 3: Cuadro eléctrico / Inversor -->
          <div class="photo-card-sub">
            <div class="photo-img-wrap" onclick="triggerPhotoUpload('photo-sub2-input')">
              <input type="file" id="photo-sub2-input" accept="image/*" style="display:none;" onchange="handlePhotoUpload(this, 'photo-sub2-img', 'photo-sub2-placeholder')">
              ${_propPhotos.sub2 ? `
                <img id="photo-sub2-img" src="${_propPhotos.sub2}" alt="Ubicación Inversor" style="display:block;">
                <div id="photo-sub2-placeholder" style="display:none;"></div>
              ` : `
                <img id="photo-sub2-img" style="display:none;" alt="Ubicación Inversor">
                <div id="photo-sub2-placeholder" class="photo-empty-placeholder">
                  <span style="display:inline-flex;color:#64748b;">${_mSvg('bolt', 24, '#64748b')}</span>
                  <span style="font-size:10.5px;font-weight:700;">Ubicación de Inversor / Cuadro AC</span>
                  <span style="font-size:8.5px;">Haz clic para subir foto del cuadro eléctrico</span>
                </div>
              `}
              <div class="photo-upload-overlay">${_mSvg('camera', 12, '#ffffff', 'margin-right:4px;')} Cargar foto</div>
            </div>
            <div class="photo-caption-bar">
              <div>
                <div class="photo-caption-title" contenteditable="true">PUNTO DE CONEXIÓN ELÉCTRICA</div>
                <div class="photo-caption-desc" contenteditable="true">Ubicación prevista para inversor ${_eqp.invName} y cuadro de protecciones.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>

      <!-- PIE DE HOJA 3 -->
      <div class="cover-footer" style="margin-top:auto;padding-top:12px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:9px;color:#64748b;">
        <span>Simulación Tridimensional · Integración Arquitectónica · Marcado CE</span>
        <span>${companyName} · Ref: ${d.refNum}</span>
      </div>
    </div>

    ${(function() {
      var comm = (typeof RAPricing !== 'undefined' && typeof RAPricing.getCommercialConfig === 'function') ? RAPricing.getCommercialConfig() : null;
      if (!comm || !comm.showThreePackagesComparison) return '';
      var pkgs = RAPricing.computeThreePackages(m);
      if (!pkgs) return '';
      return `
      <!-- PÁGINA 4A: COMPARATIVA DE 3 PAQUETES (ESENCIAL / ÓPTIMO / TOTAL) -->
      <div class="page-sheet" data-section-id="packages_comparison">
        <div>
          ${buildInnerHeaderHTML('PLANES &amp; <span style="color:' + pal.primary + '">MODALIDADES DE INVERSIÓN</span>', 'Comparativa Estratégica: Esencial · Óptimo Recomendado · Independencia Total', _pageIndexComparativa)}
          <h2>Elige el nivel de independencia energética para tu inmueble</h2>
          <p style="font-size:12px;color:#64748b;margin-bottom:28px;line-height:1.5;">Hemos preparado tres alternativas equilibradas para adaptarse a tu presupuesto y objetivos de ahorro a largo plazo:</p>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;margin-bottom:34px;">
            
            <div style="border:1.5px solid #cbd5e1;border-radius:12px;padding:28px 18px;min-height:124mm;background:#f8fafc;display:flex;flex-direction:column;justify-content:space-between;box-shadow:0 2px 8px rgba(0,0,0,0.02);">
              <div>
                <div style="font-size:14px;font-weight:900;color:#475569;text-transform:uppercase;letter-spacing:0.5px;">${pkgs.essential.title}</div>
                <div style="font-size:11.5px;color:#64748b;margin:12px 0 22px;line-height:1.55;">${pkgs.essential.desc}</div>
                <div style="font-size:28px;font-weight:900;color:#0f172a;">${pkgs.essential.capex.toLocaleString('es-ES')} €</div>
                <div style="font-size:10px;color:#64748b;margin-top:4px;">IVA ${Math.round((m.ivaRate != null ? m.ivaRate : 0.21) * 100)}% incluido</div>
              </div>
              <div style="margin-top:26px;border-top:1.5px solid #e2e8f0;padding-top:18px;font-size:12px;line-height:1.9;">
                <div style="display:flex;align-items:center;gap:6px;">${_mSvg('bolt', 13, '#475569')} <span>Ahorro: <b>${pkgs.essential.ahorroAnual.toLocaleString('es-ES')} €/año</b></span></div>
                <div style="display:flex;align-items:center;gap:6px;">${_mSvg('refresh', 13, '#475569')} <span>Retorno: <b>${pkgs.essential.payback} años</b></span></div>
                <div style="display:flex;align-items:center;gap:6px;">${_mSvg('sun', 13, '#475569')} <span>Autarquía solar: <b>~${pkgs.essential.autarquia}%</b></span></div>
              </div>
            </div>

            <div style="border:3px solid ${pal.primary};border-radius:12px;padding:28px 18px;min-height:124mm;background:#ffffff;box-shadow:0 12px 32px rgba(0,0,0,0.08);display:flex;flex-direction:column;justify-content:space-between;position:relative;">
              <div style="position:absolute;top:-12px;right:14px;background:${pal.primary};color:#fff;font-size:9.5px;font-weight:900;padding:3px 12px;border-radius:12px;letter-spacing:0.6px;box-shadow:0 2px 6px rgba(0,0,0,0.15);">PROYECTO ACTUAL</div>
              <div>
                <div style="font-size:14px;font-weight:900;color:${pal.dark};text-transform:uppercase;letter-spacing:0.5px;">${pkgs.optimal.title}</div>
                <div style="font-size:11.5px;color:#64748b;margin:12px 0 22px;line-height:1.55;">${pkgs.optimal.desc}</div>
                <div style="font-size:32px;font-weight:900;color:${pal.primary};">${pkgs.optimal.capex.toLocaleString('es-ES')} €</div>
                <div style="font-size:10px;color:#64748b;margin-top:4px;">IVA ${Math.round((m.ivaRate != null ? m.ivaRate : 0.21) * 100)}% incluido</div>
              </div>
              <div style="margin-top:26px;border-top:1.5px solid #e2e8f0;padding-top:18px;font-size:12px;line-height:1.9;">
                <div style="display:flex;align-items:center;gap:6px;">${_mSvg('bolt', 13, pal.primary)} <span>Ahorro: <b>${pkgs.optimal.ahorroAnual.toLocaleString('es-ES')} €/año</b></span></div>
                <div style="display:flex;align-items:center;gap:6px;">${_mSvg('refresh', 13, pal.primary)} <span>Retorno: <b>${pkgs.optimal.payback} años</b></span></div>
                <div style="display:flex;align-items:center;gap:6px;">${_mSvg('sun', 13, pal.primary)} <span>Autarquía solar: <b>~${pkgs.optimal.autarquia}%</b></span></div>
              </div>
            </div>

            <div style="border:1.5px solid #cbd5e1;border-radius:12px;padding:28px 18px;min-height:124mm;background:#f8fafc;display:flex;flex-direction:column;justify-content:space-between;box-shadow:0 2px 8px rgba(0,0,0,0.02);">
              <div>
                <div style="font-size:14px;font-weight:900;color:#0369a1;text-transform:uppercase;letter-spacing:0.5px;">${pkgs.premium.title}</div>
                <div style="font-size:11.5px;color:#64748b;margin:12px 0 22px;line-height:1.55;">${pkgs.premium.desc}</div>
                <div style="font-size:28px;font-weight:900;color:#0369a1;">${pkgs.premium.capex.toLocaleString('es-ES')} €</div>
                <div style="font-size:10px;color:#64748b;margin-top:4px;">IVA ${Math.round((m.ivaRate != null ? m.ivaRate : 0.21) * 100)}% incluido</div>
              </div>
              <div style="margin-top:26px;border-top:1.5px solid #e2e8f0;padding-top:18px;font-size:12px;line-height:1.9;">
                <div style="display:flex;align-items:center;gap:6px;">${_mSvg('bolt', 13, '#0369a1')} <span>Ahorro: <b>${pkgs.premium.ahorroAnual.toLocaleString('es-ES')} €/año</b></span></div>
                <div style="display:flex;align-items:center;gap:6px;">${_mSvg('refresh', 13, '#0369a1')} <span>Retorno: <b>${pkgs.premium.payback} años</b></span></div>
                <div style="display:flex;align-items:center;gap:6px;">${_mSvg('sun', 13, '#0369a1')} <span>Autarquía solar: <b>~${pkgs.premium.autarquia}%</b></span></div>
              </div>
            </div>

          </div>

          <div style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:10px;padding:22px 24px;font-size:12px;color:#475569;line-height:1.7;box-shadow:0 1px 4px rgba(0,0,0,0.02);">
            <b>Criterio Técnico de Selección:</b> El paquete <b>${pkgs.optimal.title}</b> ha sido calculado por nuestro gemelo digital como el punto óptimo de rentabilidad marginal (máximo VAN y menor coste nivelado LCOE). Las tres modalidades incluyen ingeniería completa, permisos de acceso y conexión, y boletín eléctrico oficial CIE.
          </div>
        </div>

        <!-- PIE DE HOJA COMPARATIVA -->
        <div class="cover-footer" style="margin-top:auto;padding-top:12px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:9px;color:#64748b;">
          <span>Planes de Autarquía e Independencia Energética · Garantía de Rendimiento</span>
          <span>${companyName} · Ref: ${d.refNum}</span>
        </div>
      </div>

      <!-- PÁGINA 4B: IMPACTO FINANCIERO MENSUAL Y CICLO SOLAR 24H -->
      <div class="page-sheet" data-section-id="energy_balance_24h">
        <div>
          ${buildInnerHeaderHTML(
            _isOffGrid ? ('VALOR ENERGÉTICO &amp; <span style="color:' + pal.primary + '">AUTONOMÍA 24H</span>') : ('BALANCE FINANCIERO &amp; <span style="color:' + pal.primary + '">AUTARQUÍA 24H</span>'),
            _isOffGrid ? 'Coste de Instalación · Valor de la Energía Generada · Reserva Independiente' : 'Impacto en Factura Mensual · Despacho Solar Día y Noche',
            _pageIndexInfografias
          )}
          ${_infografias.caraACara}
          ${_infografias.relojSolar}
        </div>

        <!-- PIE DE HOJA INFOGRAFÍAS -->
        <div class="cover-footer" style="margin-top:auto;padding-top:12px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:9px;color:#64748b;">
          <span>Auditoría de Flujo de Caja Mensual · Modelo Horario de Batería y Autoconsumo</span>
          <span>${companyName} · Ref: ${d.refNum}</span>
        </div>
      </div>`;
    })()}
    <!-- PÁGINA 5A: PRODUCCIÓN SOLAR Y RETORNO DE INVERSIÓN (GRÁFICAS) -->
    <div class="page-sheet" data-section-id="energy_balance">
      <div>
        ${buildInnerHeaderHTML('PRODUCCIÓN &amp; <span style="color:' + pal.primary + '">RENTABILIDAD</span>', _isOffGrid ? 'Histograma Mensual · Retorno s/ Valor de Energía Generada (25 Años)' : 'Histograma de Producción Mensual · Curva de Amortización a 25 Años', _pageIndexProduccion)}

        <h2>Histograma de producción fotovoltaica mensual estimada</h2>
        <div class="chart-box">
          <div class="chart-title" style="display:flex;align-items:center;gap:6px;">${_mSvg('sun', 13, pal.primary)} <span>Producción Mensual Estimada — ${Math.round(annualYieldKWh).toLocaleString('es-ES')} kWh/año · ${m.kwp.toFixed(2)} kWp instalados</span></div>
          ${histogramSVG}
        </div>

        <h2>Curva de amortización y retorno de inversión acumulado (25 años)</h2>
        <div class="chart-box">
          <div class="chart-title" style="display:flex;align-items:center;gap:6px;">${_mSvg('trendUp', 13, pal.primary)} <span>Cashflow Acumulado — Payback en ${(m.isCelActive && m.paybackCEL ? m.paybackCEL.toFixed(1) : m.paybackYears.toFixed(1))} años${m.isCelActive && m.reduccionPaybackAnios ? ` (Acelerado con CEL · -${m.reduccionPaybackAnios.toFixed(1)}a)` : ''} · VAN ${Math.round(m.van).toLocaleString('es-ES')} € · TIR ${m.tirString || ((m.tir != null && isFinite(m.tir)) ? m.tir.toFixed(1) + "%" : "N/D")}${m.finMode !== 'cash' && m.taeCalculadaPct ? ` · TAE ${m.taeCalculadaPct}%` : ''}</span></div>
          ${amortSVG}
        </div>
      </div>

      <!-- PIE DE HOJA PRODUCCIÓN -->
      <div class="cover-footer" style="margin-top:auto;padding-top:12px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:9px;color:#64748b;">
        <span>Modelo Energético Horario · Radiación PVGIS/NASA · Simulación de Retorno</span>
        <span>${companyName} · Ref: ${d.refNum}</span>
      </div>
    </div>

    <!-- PÁGINA 5B: AUDITORÍA Y CONTRASTE CON FACTURA ACTUAL DEL CLIENTE (HOJA PROPIA EXCLUSIVA) -->
    ${_includeBillAuditPage ? `
    <div class="page-sheet" data-section-id="bill_audit">
      <div>
        ${buildInnerHeaderHTML('AUDITORÍA &amp; <span style="color:' + pal.primary + '">CONTRASTE ENERGÉTICO</span>', 'Estudio de Suministro · Comparativa con Factura Real · Ahorro Neto Facturable', _pageIndexBillAudit)}

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;">
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:12px;">
            <div style="font-size:10px;font-weight:800;color:#64748b;text-transform:uppercase;margin-bottom:6px;">Datos de Suministro Auditado</div>
            <div style="font-size:11px;color:#0f172a;line-height:1.6;">
              <div><strong>Titular:</strong> ${_escProp(window.RA.billAuditor.comparison.titular) || d.tit.nombre || 'Titular de suministro'}</div>
              <div><strong>CUPS:</strong> <span style="font-family:monospace;font-size:10px;">${_escProp(window.RA.billAuditor.comparison.cups) || d.tit.cups || 'ES00...'}</span></div>
              <div><strong>Comercializadora:</strong> ${_escProp(window.RA.billAuditor.currentBill.comercializadora || 'Comercializadora actual')}</div>
              <div><strong>Tarifa de Acceso:</strong> ${_escProp(window.RA.billAuditor.currentBill.tarifaAcceso || '2.0TD')}</div>
            </div>
          </div>
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:12px;">
            <div style="font-size:10px;font-weight:800;color:#64748b;text-transform:uppercase;margin-bottom:6px;">Parámetros de Potencia & Consumo</div>
            <div style="font-size:11px;color:#0f172a;line-height:1.6;">
              <div><strong>Potencia P1 / P2:</strong> ${window.RA.billAuditor.currentBill.potenciaP1 || window.RA.billAuditor.comparison.potenciaContratadaP1 || d.tit.potP1 || 4.6} kW / ${window.RA.billAuditor.currentBill.potenciaP2 || d.tit.potP2 || 4.6} kW</div>
              <div><strong>Consumo Auditado:</strong> ${Math.round(window.RA.billAuditor.comparison.consumoAnualKWh || d.tit.consumoAnual || 4500).toLocaleString('es-ES')} kWh/año</div>
              <div><strong>Precio Medio Energía:</strong> ${(window.RA.billAuditor.comparison.precioMedioKWh || 0.18).toFixed(3)} €/kWh</div>
              <div><strong>Modalidad Proyecto:</strong> Autoconsumo con Compensación</div>
            </div>
          </div>
        </div>

        <h2>Auditoría y contraste con factura actual del cliente</h2>
        <table>
          <tr><th>Concepto Auditado</th><th>Factura Actual (Sin Solar)</th><th class="text-right" style="color:${pal.primary}">Con Proyecto Solar 3D</th></tr>
          <tr><td>Compañía y Tarifa</td><td>${_escProp(window.RA.billAuditor.currentBill.comercializadora || '')} (${_escProp(window.RA.billAuditor.currentBill.tarifaAcceso || '2.0TD')})</td><td class="text-right" style="color:${pal.primary}">Autoconsumo + Compensación de Excedentes</td></tr>
          <tr><td>Gasto Mensual Facturado</td><td>${window.RA.billAuditor.comparison.gastoMensualActualEUR} €/mes</td><td class="text-right" style="font-weight:800;color:${pal.primary}">${window.RA.billAuditor.comparison.gastoMensualConSolarEUR} €/mes</td></tr>
          <tr style="background:${pal.light};font-weight:800;"><td>AHORRO S/ FACTURA (auditoría)</td><td>—</td><td class="text-right" style="color:${pal.primary}">${window.RA.billAuditor.comparison.ahorroAnualEUR.toLocaleString('es-ES')} €/año (-${window.RA.billAuditor.comparison.porcentajeAhorro}%)</td></tr>
          <tr><td>Ahorro s/ modelo energético (SSOT)</td><td>—</td><td class="text-right" style="font-weight:700;color:${pal.primary}">${Math.round(m.ahorroLuzAnio1).toLocaleString('es-ES')} €/año</td></tr>
        </table>

        <div style="background:#f1f5f9;border-left:3px solid ${pal.primary};border-radius:4px;padding:10px 14px;margin-top:14px;font-size:9.5px;color:#475569;line-height:1.5;">
          <strong style="color:#0f172a;">Metodología de cálculo contrastada:</strong>
          La fila de auditoría computa el impacto real sobre la factura mensual del cliente incluyendo el término fijo de potencia contratada, alquiler de contador e impuestos específicos (Impuesto Eléctrico e IVA). El modelo energético cuantifica la valorización directa de los kWh autogenerados y consumidos. Ambas magnitudes demuestran una reducción drástica del coste energético neto desde el primer mes de puesta en marcha.
        </div>
      </div>

      <!-- PIE DE HOJA AUDITORÍA FACTURA -->
      <div class="cover-footer" style="margin-top:auto;padding-top:12px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:9px;color:#64748b;">
        <span>Auditoría de Suministro Eléctrico · Contraste con Datos de Facturación Real · RD 244/2019</span>
        <span>${companyName} · Ref: ${d.refNum}</span>
      </div>
    </div>` : ''}

    ${_includeCEL ? buildCELPageHTML(d, m, pal, _celMetrics, _pageIndexCEL, _totPages, companyName, _pageIndexCEL2, buildInnerHeaderHTML, _studioCfg) : ''}

    <!-- PÁGINA PRESUPUESTO: PRESUPUESTO ECONÓMICO EPC -->
    <div class="page-sheet" data-section-id="economics">
      <div>
        ${buildInnerHeaderHTML('PRESUPUESTO <span style="color:' + pal.primary + '">LLAVE EN MANO</span>', 'Desglose Detallado de Partidas EPC · Base Imponible · Impuestos', _pageIndexPresupuesto)}

        <h2>Presupuesto detallado llave en mano</h2>
        <table>
          <tr><th>Capítulo</th><th>Descripción de la Partida</th><th class="text-right">Importe (€)</th></tr>
          ${(function() {
            var cNum = 1;
            var html = '';
            // Cap 1: Módulos FV
            if (m.modulesBreakdown && m.modulesBreakdown.isMultiModule) {
              html += '<tr class="ra-econ-item-row"><td>Cap. ' + (cNum++) + '</td><td><strong>Módulos Solares Fotovoltaicos (' + m.numPanels + ' uds · ' + m.modulesBreakdown.uniqueModelsCount + ' modelos Tier-1 · ' + m.kwp.toFixed(2) + ' kWp)</strong><br>' +
                m.modulesBreakdown.byModel.map(bm => '<span style="font-size: 10px;color:#475569;display:inline-block;margin-left:6px;">• ' + bm.count + '× ' + bm.fullName + ' (' + bm.wp + ' Wp)</span>').join('<br>') +
                '</td><td class="text-right ra-econ-item-price">' + _cPan.toLocaleString('es-ES') + ' €</td></tr>';
            } else {
              var puPanStr = (_cPan / (m.numPanels || 1)).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
              html += '<tr class="ra-econ-item-row"><td>Cap. ' + (cNum++) + '</td><td>Módulos Solares Fotovoltaicos de Alta Eficiencia (' + m.numPanels + '× ' + (d.cfg.modelo || 'Módulos Tier-1') + '<span class="ra-econ-unit-price"> · ' + puPanStr + ' €/ud</span>)</td><td class="text-right ra-econ-item-price">' + _cPan.toLocaleString('es-ES') + ' €</td></tr>';
            }
            // Cap 2: Estructura
            html += '<tr class="ra-econ-item-row"><td>Cap. ' + (cNum++) + '</td><td>Estructura de Soporte y Fijación Certificada (' + m.numPanels + '× soportes Aluminio / Inox A2)</td><td class="text-right ra-econ-item-price">' + _cEst.toLocaleString('es-ES') + ' €</td></tr>';
            // Cap 3: Inversor
            if (_eqp.invCount > 1 || (_eqp.invertersBreakdown && _eqp.invertersBreakdown.isMulti)) {
              html += '<tr class="ra-econ-item-row"><td>Cap. ' + (cNum++) + '</td><td><strong>Inversores de Conexión a Red & Monitorización (' + _eqp.invCount + ' uds · ' + _eqp.totalAcKw.toFixed(2) + ' kW AC total)</strong><br>' +
                ((_eqp.invertersBreakdown && _eqp.invertersBreakdown.items && _eqp.invertersBreakdown.items.length > 0)
                  ? _eqp.invertersBreakdown.items.map(it => '<span style="font-size: 10px;color:#475569;display:inline-block;margin-left:6px;">• ' + it.count + '× ' + (it.fullName || (it.brand + ' ' + it.model)) + ' (' + it.kw + ' kW · ' + (it.mppt || 2) + ' MPPT)<span class="ra-econ-unit-price">: ' + Math.round((_cInv * (it.count * it.kw / (_eqp.totalAcKw || 1)))).toLocaleString('es-ES') + ' €</span></span>').join('<br>')
                  : '<span style="font-size: 10px;color:#475569;display:inline-block;margin-left:6px;">• ' + _eqp.invCount + '× ' + _eqp.invBrand + ' ' + _eqp.invModel + ' (' + _eqp.invKw + ' kW · ' + _eqp.invMPPTs + ' MPPT)</span>'
                ) + '</td><td class="text-right ra-econ-item-price">' + _cInv.toLocaleString('es-ES') + ' €</td></tr>';
            } else {
              html += '<tr class="ra-econ-item-row"><td>Cap. ' + (cNum++) + '</td><td>Inversor de Conexión a Red, Monitorización Inteligente & Protecciones (1× ' + _eqp.invName + ')</td><td class="text-right ra-econ-item-price">' + _cInv.toLocaleString('es-ES') + ' €</td></tr>';
            }
            // Cap 4: Batería (si existe)
            if (_cBat > 0) {
              if (_eqp.batCount > 1 || (_eqp.batteriesBreakdown && _eqp.batteriesBreakdown.isMulti)) {
                html += '<tr class="ra-econ-item-row"><td>Cap. ' + (cNum++) + '</td><td><strong>Sistema de Almacenamiento Electroquímico (' + _eqp.batCount + ' uds · ' + _eqp.totalBatKwh.toFixed(1) + ' kWh total)</strong><br>' +
                  ((_eqp.batteriesBreakdown && _eqp.batteriesBreakdown.items && _eqp.batteriesBreakdown.items.length > 0)
                    ? _eqp.batteriesBreakdown.items.map(it => '<span style="font-size: 10px;color:#475569;display:inline-block;margin-left:6px;">• ' + it.count + '× ' + (it.fullName || (it.brand + ' ' + it.model)) + ' (' + it.kwh + ' kWh c/u · BMS integrado)<span class="ra-econ-unit-price">: ' + Math.round((_cBat * (it.count * it.kwh / (_eqp.totalBatKwh || 1)))).toLocaleString('es-ES') + ' €</span></span>').join('<br>')
                    : '<span style="font-size: 10px;color:#475569;display:inline-block;margin-left:6px;">• ' + _eqp.batCount + '× ' + _eqp.batBrand + ' ' + _eqp.batModel + ' (' + _eqp.batKwh + ' kWh c/u · BMS integrado)</span>'
                  ) + '</td><td class="text-right ra-econ-item-price">' + _cBat.toLocaleString('es-ES') + ' €</td></tr>';
              } else {
                html += '<tr class="ra-econ-item-row"><td>Cap. ' + (cNum++) + '</td><td>Sistema de Almacenamiento en Batería LFP Litio-Ferrofosfato (1× ' + _eqp.batName + ')</td><td class="text-right ra-econ-item-price">' + _cBat.toLocaleString('es-ES') + ' €</td></tr>';
              }
            }
            // Cap Minieólica (si existe)
            if (_cWind > 0) {
              html += '<tr class="ra-econ-item-row"><td>Cap. ' + (cNum++) + '</td><td>Sistema de Generación Minieólica Certificada (' + (windTurbineCount || 1) + '× ' + (_eqp.windName || 'Aerogenerador') + ' con control MPPT y mástil)</td><td class="text-right ra-econ-item-price">' + _cWind.toLocaleString('es-ES') + ' €</td></tr>';
            }
            // Cap Cableado y protecciones
            html += '<tr class="ra-econ-item-row"><td>Cap. ' + (cNum++) + '</td><td>Líneas Eléctricas DC/AC Solar ZZ-F y Cuadros con SPD Tipo II e IGA (1× lote REBT)</td><td class="text-right ra-econ-item-price">' + _cCab.toLocaleString('es-ES') + ' €</td></tr>';
            // Cap Mano de obra y montaje
            html += '<tr class="ra-econ-item-row"><td>Cap. ' + (cNum++) + '</td><td>Montaje Mecánico, Mano de Obra Cualificada y Puesta en Servicio (1× equipo)</td><td class="text-right ra-econ-item-price">' + _cMo.toLocaleString('es-ES') + ' €</td></tr>';
            // Cap Legalización e ingeniería
            html += '<tr class="ra-econ-item-row"><td>Cap. ' + (cNum++) + '</td><td>Ingeniería Técnica, Dirección de Obra y Tramitación Legal CIE / Industria (1× expediente)</td><td class="text-right ra-econ-item-price">' + _cLeg.toLocaleString('es-ES') + ' €</td></tr>';
            return html;
          })()}
          ${(function() {
            var cfg = (typeof RAPricing !== 'undefined' && typeof RAPricing.getCommercialConfig === 'function') ? RAPricing.getCommercialConfig() : null;
            var all = cfg ? (cfg.addons || []).concat(cfg.customAddons || []) : [];
            var activeAddons = all.filter(function(a) { return a && a.enabled; });
            if (!activeAddons.length) return '';
            return activeAddons.map(function(ad, idx) {
              var tot = (Number(ad.qty) || 1) * (Number(ad.unitPrice) || 0);
              return '<tr class="ra-econ-item-row" style="background:#f0fdf4;"><td style="color:#16a34a;font-weight:700;">Extra ' + (idx + 1) + '</td><td><strong>' + (Number(ad.qty) || 1) + '× ' + _escProp(ad.name) + '</strong></td><td class="text-right ra-econ-item-price" style="font-weight:700;color:#16a34a;">' + tot.toLocaleString('es-ES') + ' €</td></tr>';
            }).join('');
          })()}
          ${(m.discountEur && m.discountEur > 0) ? '<tr style="background:#fef2f2;color:#dc2626;"><td style="font-weight:700;">Promoción</td><td><strong>' + _escProp(m.discountLabel || 'Descuento Comercial Especial') + '</strong></td><td class="text-right" style="font-weight:800;">- ' + Math.round(m.discountEur).toLocaleString('es-ES') + ' €</td></tr>' : ''}
          <tr style="background:#f8fafc;font-weight:700;border-top:2px solid #cbd5e1;"><td>BASE IMPONIBLE</td><td>Total Ejecución Material y Servicios Llave en Mano${(m.ivaCompliance && m.ivaCompliance.isRenovacion10) ? ' <span style="font-size:9px;color:#475569;font-weight:600;">(Materiales: ' + Math.round(m.ivaCompliance.baseMateriales).toLocaleString('es-ES') + ' € [' + m.ivaCompliance.pctMateriales.toFixed(1) + '%] · Instalación y Servicios: ' + Math.round(m.ivaCompliance.baseServicios).toLocaleString('es-ES') + ' €)</span>' : ''}</td><td class="text-right" style="color:${pal.primary};">${Math.round(m.subtotal).toLocaleString('es-ES')} €</td></tr>
          <tr style="background:#f8fafc;"><td>IVA APLICABLE</td><td>Impuesto sobre el Valor Añadido (${Math.round((m.ivaRate != null ? m.ivaRate : 0.21) * 100)}%${(m.ivaCompliance && m.ivaCompliance.isRenovacion10) ? ' · Tipo Reducido Renovación/Reparación Vivienda Art. 91.Uno.2.10º LIVA' : ((m.ivaCompliance && m.ivaCompliance.isRehab10) ? ' · Rehabilitación Estructural / Obra Nueva Promotor Art. 91.Uno.3.1º LIVA' : '')})</td><td class="text-right">${Math.round(m.iva).toLocaleString('es-ES')} €</td></tr>
          <tr class="total-row"><td>TOTAL PRESUPUESTO</td><td>INVERSIÓN TOTAL LLAVE EN MANO (IVA INCLUIDO)</td><td class="text-right">${Math.round(m.capexBruto).toLocaleString('es-ES')} €</td></tr>
        </table>
      </div>

      <!-- PIE DE HOJA PRESUPUESTO -->
      <div class="cover-footer" style="margin-top:auto;padding-top:12px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:9px;color:#64748b;">
        <span>Presupuesto EPC Llave en Mano · Validez 30 días · Precios con IVA incluido</span>
        <span>${companyName} · Ref: ${d.refNum}</span>
      </div>
    </div>

    <!-- PÁGINA BENEFICIOS FISCALES: SUBVENCIONES Y RETORNO FISCAL -->
    <div class="page-sheet" data-section-id="tax_benefits">
      <div>
        ${buildInnerHeaderHTML('SUBVENCIONES &amp; <span style="color:' + pal.primary + '">BENEFICIOS FISCALES</span>', 'Bonificaciones Municipales · Deducciones Fiscales · Retorno de Inversión Neta', _pageIndexFiscal)}

        ${_infografias.cascadaFiscal}

        <div class="ra-tax-benefits-block">
        <h2>Subvenciones y beneficios fiscales estimados</h2>
        <table>
          <tr><th>Concepto Fiscal</th><th>Detalle / Normativa Aplicable</th><th class="text-right">Importe / Ahorro</th></tr>
          <tr style="background:#f8fafc;font-weight:700;"><td>INVERSIÓN INICIAL (CAPEX BRUTO)</td><td>Coste llave en mano de la instalación fotovoltaica (IVA incluido)</td><td class="text-right" style="color:#0f172a;">${Math.round(m.capexBruto).toLocaleString('es-ES')} €</td></tr>
          <tr><td>Bonificación IBI</td><td>Bonificación en el Impuesto sobre Bienes Inmuebles (TRLRHL art. 74.5)</td><td class="text-right" style="color:${pal.primary};">- ${Math.round(m.ahorroIBITotal).toLocaleString('es-ES')} €</td></tr>
          ${(m.customerProfile === 'empresa') ? `
          <tr><td>Libertad de Amortización (IS)</td><td>Amortización acelerada 100% Año 1 (DA 17ª LIS / RDL 18/2022, Tipo ${Math.round((m.isRate || 0.25) * 100)}%)</td><td class="text-right" style="color:${pal.primary};">- ${Math.round(m.ahorroSociedades || 0).toLocaleString('es-ES')} €</td></tr>
          ` : `
          <tr><td>Deducción IRPF Estatal</td><td>Deducción por eficiencia energética CEE (RD-ley 19/2021)</td><td class="text-right" style="color:${pal.primary};">- ${Math.round(m.ahorroIRPFEstatal != null ? m.ahorroIRPFEstatal : m.ahorroIRPF).toLocaleString('es-ES')} €</td></tr>
          ${(m.ahorroIRPFAutonomico && m.ahorroIRPFAutonomico > 0) ? `
          <tr><td>Deducción IRPF Autonómica</td><td>Tramo autonómico por inversión en autoconsumo residencial</td><td class="text-right" style="color:${pal.primary};">- ${Math.round(m.ahorroIRPFAutonomico).toLocaleString('es-ES')} €</td></tr>
          ` : ''}
          `}
          ${(m.ahorroCAE && m.ahorroCAE > 0) ? `
          <tr><td>Ayudas Directas / CAEs</td><td>Certificados de Ahorro Energético (CAE) y ayudas no reintegrables</td><td class="text-right" style="color:${pal.primary};">- ${Math.round(m.ahorroCAE).toLocaleString('es-ES')} €</td></tr>
          ` : ''}
          <tr style="background:${pal.light};font-weight:800;border-top:1.5px solid ${pal.primary};"><td>TOTAL DEDUCCIONES FISCALES</td><td>Deducción fiscal directa acumulada (IBI + ${(m.customerProfile === 'empresa') ? 'Sociedades' : 'IRPF'}${m.ahorroCAE > 0 ? ' + CAEs' : ''})</td><td class="text-right" style="color:${pal.primary};font-weight:900;">- ${Math.round(m.totalAhorroFiscal).toLocaleString('es-ES')} €</td></tr>
          <tr class="total-row" style="background:#0f172a;color:#ffffff;"><td>INVERSIÓN NETA FINAL</td><td>COSTE EFECTIVO TRAS DEDUCCIONES FISCALES DIRECTAS</td><td class="text-right" style="color:#34d399;font-weight:900;font-size:12px;">${Math.round(m.capexNeto).toLocaleString('es-ES')} €</td></tr>
          ${(m.ahorroICIO && m.ahorroICIO > 0) ? `
          <tr style="background:#f1f5f9;color:#64748b;font-size:9.5px;"><td>Bonificación ICIO* (Adicional)</td><td>Exención del 95% en Impuesto de Obras y Construcciones (ahorro en tasa municipal ajeno al presupuesto)</td><td class="text-right" style="color:#475569;">+ ${Math.round(m.ahorroICIO).toLocaleString('es-ES')} € de ahorro extra</td></tr>
          ` : ''}
        </table>
        </div>

        <p style="font-size: 9.5px;color:#64748b;margin:16px 0 0 0;line-height:1.4;border-top:1px solid #f1f5f9;padding-top:10px;">Nota: bonificaciones y deducciones fiscales son estimaciones comerciales sujetas a vigencia normativa y ordenanzas municipales. Verificar con asesoría fiscal antes de incluirlas en contrato. La TIR y el payback se calculan sobre el <strong>desembolso inicial (CAPEX bruto)</strong>; la "inversión neta" es informativa y no es la base de esas métricas. Quedan excluidas tasas urbanísticas municipales (ICIO), ocupación de vía pública y medios de elevación extraordinarios salvo expresa contratación en el capítulo de extras.</p>
      </div>

      <!-- PIE DE HOJA FISCALIDAD -->
      <div class="cover-footer" style="margin-top:auto;padding-top:12px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:9px;color:#64748b;">
        <span>Estimaciones fiscales no vinculantes · Deducciones aplicables según fiscalidad del cliente</span>
        <span>${companyName} · Ref: ${d.refNum}</span>
      </div>
    </div>

    <!-- PÁGINA CIERRE: HOJA DE DECISIÓN EJECUTIVA -->
    <div class="page-sheet" data-section-id="closing">
      <div class="cover-header">
        <div class="company-block">
          ${logoBlock}
          <div class="company-text">
            <div class="name">${_escProp(companyName)}</div>
            <div class="sub">Estudio de Ingeniería · Propuesta Fotovoltaica</div>
            ${companyCIF ? '<div class="contact">CIF: ' + _escProp(companyCIF) + (contactBlock ? ' · ' + _escProp(contactBlock) : '') + '</div>' : (contactBlock ? '<div class="contact">' + _escProp(contactBlock) + '</div>' : '')}
          </div>
        </div>
        <div class="doc-ref-box">
          <b>OFERTA: ${d.refNum}</b><br>
          Hoja ${_pageIndexDecision} de ${_totPages}<br>
          Fecha: ${d.fechaStr}<br>
          Validez: 30 días naturales<br>
          <span style="display:inline-block;margin-top:4px;padding:2px 8px;background:${pal.light};color:${pal.dark};border-radius:4px;font-size: 10px;font-weight:800;">${branding.status === 'orientativa' ? 'OFERTA ORIENTATIVA' : 'OFERTA VINCULANTE'}</span>
        </div>
      </div>

      <div style="text-align:center;margin:8px 0 14px;">
        <h1 style="font-size:20px;font-weight:900;color:#0f172a;letter-spacing:-0.5px;">PROPUESTA DE DECISIÓN: TU PLAN SOLAR FOTOVOLTAICO</h1>
        <div style="font-size:11px;color:#64748b;margin-top:3px;">
          Estudio de viabilidad económica y técnica para <b>${_escProp(d.tit.nombre)}</b> · ${_escProp(d.tit.dir || 'Instalación Solar')}, ${_escProp(d.tit.mun || '')}
        </div>
      </div>

      <!-- 4 HEROS MONUMENTALES DESPEJADOS CON ILUSTRACIÓN SVG MONOCROMÁTICA -->
      <div class="closer-hero-grid">
        <div class="closer-hero-card highlight">
          <div style="display:flex;justify-content:center;margin-bottom:8px;">${(window.RA_SvgCatalog ? window.RA_SvgCatalog.render('piggyBank', pal.primary, 38) : '')}</div>
          <div class="closer-hero-lbl">${_isOffGrid ? 'Valor Energía Generada' : 'Ahorro en tu Factura'}</div>
          <div class="closer-hero-val primary">${(_isOffGrid ? _offGridAnnualValueEUR : Math.round(m.ahorroLuzAnio1)).toLocaleString('es-ES')} €</div>
          <div class="closer-hero-sub">${_isOffGrid ? ('al año (' + _offGridMonthlyValueEUR + ' €/mes no comprados a red)') : ('al año (' + Math.round(m.ahorroMensualLuz) + ' €/mes)')}</div>
        </div>
        <div class="closer-hero-card">
          <div style="display:flex;justify-content:center;margin-bottom:8px;">${(window.RA_SvgCatalog ? window.RA_SvgCatalog.render(_isOffGrid ? 'zeroEuro' : 'billCut', '#0284c7', 38) : '')}</div>
          <div class="closer-hero-lbl">${_isOffGrid ? 'Precio Propio Energía' : 'Nueva Factura Estimada'}</div>
          <div class="closer-hero-val" style="color:#0284c7;">${_isOffGrid ? (_offGridLcoeEUR.toFixed(3).replace('.', ',') + ' €') : ('~' + Math.round(gastoMensualConSolar) + ' €')}</div>
          <div class="closer-hero-sub">${_isOffGrid ? ('por kWh vs ' + _refGridPriceEUR.toFixed(2).replace('.', ',') + ' €/kWh red') : ('antes ~' + Math.round(gastoMensualSinSolar) + ' €/mes')}</div>
        </div>
        <div class="closer-hero-card">
          <div style="display:flex;justify-content:center;margin-bottom:8px;">${(window.RA_SvgCatalog ? window.RA_SvgCatalog.render('savingsChart', pal.dark, 38) : '')}</div>
          <div class="closer-hero-lbl">Retorno de Inversión</div>
          <div class="closer-hero-val">${m.paybackYears.toFixed(1)} Años</div>
          <div class="closer-hero-sub">10+ independencia energética</div>
        </div>
        <div class="closer-hero-card">
          <div style="display:flex;justify-content:center;margin-bottom:8px;">${(window.RA_SvgCatalog ? window.RA_SvgCatalog.render('warranty25', pal.primary, 38) : '')}</div>
          <div class="closer-hero-lbl">Garantía de Potencia</div>
          <div class="closer-hero-val primary">${warPower} Años</div>
          <div class="closer-hero-sub">5 - 10 años en inversor</div>
        </div>
      </div>

      <!-- COMPARATIVA DE PAGO: CONTADO vs FINANCIACIÓN -->
      <div class="decision-boxes ra-financing-options-block" style="${m.finMode === 'cash' || m.finMode === 'financed' ? 'grid-template-columns: 1fr;' : ''}">
        ${m.finMode !== 'financed' ? `
        <div class="decision-card featured">
          <div class="decision-title" style="color:${pal.dark};">
            <span>OPCIÓN A: PAGO LLAVE EN MANO</span>
            <span style="font-size: 10px;background:${pal.light};color:${pal.dark};padding:2px 6px;border-radius:4px;">${m.finMode === 'cash' ? 'MODALIDAD SELECCIONADA' : 'RECOMENDADA'}</span>
          </div>
          ${m.capexTachado ? `
          <div class="decision-row" style="text-decoration:line-through;color:#94a3b8;font-size:10px;">
            <span>Tarifa Oficial de Catálogo:</span>
            <span>${m.capexTachado.toLocaleString('es-ES')} €</span>
          </div>
          <div class="decision-row" style="color:#059669;font-weight:700;">
            <span>${m.discountLabel}:</span>
            <span>-${Math.round(m.discountEur * (1 + (m.ivaRate != null ? m.ivaRate : 0.21))).toLocaleString('es-ES')} €</span>
          </div>` : ''}
          <div class="decision-row">
            <span>Presupuesto Instalación (IVA ${Math.round((m.ivaRate != null ? m.ivaRate : 0.21) * 100)}% inc.):</span>
            <b style="color:${m.capexTachado ? '#059669' : 'inherit'};font-size:${m.capexTachado ? '12px' : '11px'};">${Math.round(m.capexBruto).toLocaleString('es-ES')} €</b>
          </div>
          <div class="decision-row" style="color:${pal.primary};">
            <span>Bonificaciones Fiscales (IBI/${(m.customerProfile === 'empresa') ? 'Sociedades' : 'IRPF'}):</span>
            <b>- ${Math.round(m.totalAhorroFiscal).toLocaleString('es-ES')} €</b>
          </div>
          <div class="decision-total" style="color:${pal.dark};">
            <span>COSTE REAL NETO:</span>
            <span style="font-size:16px;color:${pal.primary};">${Math.round(m.capexNeto).toLocaleString('es-ES')} €</span>
          </div>
          <div style="font-size: 10px;color:#64748b;margin-top:6px;">
            Ganancia neta acumulada (VAN 25a): <b>${Math.round(m.van).toLocaleString('es-ES')} €</b>
          </div>
        </div>` : ''}

        ${m.finMode !== 'cash' ? (() => {
          const _fAntes = Math.round(gastoMensualSinSolar);
          const _fAhora = Math.round(gastoMensualConSolar);
          const _ahorroMes = _isOffGrid ? Math.round(_offGridMonthlyValueEUR) : Math.max(0, _fAntes - _fAhora);
          const _cuotaMes = Math.round(m.cuotaMensual);
          const _balMes = _ahorroMes - _cuotaMes;
          const _balPos = _balMes >= 0;
          const _aniosFin = Math.round((m.mesesFin || 120) / 12);
          const _mesLibre = (m.mesesFin || 120) + 1;
          const _gastoTotalPrestamo = _cuotaMes + _fAhora;
          return `
        <div class="decision-card">
          <div class="decision-title" style="color:#2563eb;">
            <span>${m.entradaEur > 0 ? 'OPCIÓN B: FINANCIACIÓN A MEDIDA' : 'OPCIÓN B: FINANCIACIÓN 100%'}</span>
            <span style="font-size: 10px;background:#dbeafe;color:#1e40af;padding:2px 6px;border-radius:4px;">${m.entradaEur > 0 ? (Math.round(m.entradaEur).toLocaleString('es-ES') + ' € ENTRADA') : '0 € ENTRADA'}</span>
          </div>
          ${m.entradaEur > 0 ? `
          <div class="decision-row" style="color:#0f172a;">
            <span>Aportación Entrada Inicial:</span>
            <b>${Math.round(m.entradaEur).toLocaleString('es-ES')} €</b>
          </div>
          <div class="decision-row" style="font-size:9.5px;color:#64748b;">
            <span>Capital Neto Financiado:</span>
            <span>${Math.round(m.capitalBaseFinanciar).toLocaleString('es-ES')} €</span>
          </div>` : ''}
          <div class="decision-row" style="align-items:baseline;">
            <span>${_isOffGrid ? 'Valor mensual energía generada' : `Ahorro en luz <span style="font-size:9px;color:#64748b;">(~${_fAntes} € antes − ~${_fAhora} € ahora)</span>`}:</span>
            <b style="color:#059669;white-space:nowrap;">+${_ahorroMes} €/mes</b>
          </div>
          <div class="decision-row" style="align-items:baseline;">
            <span>Cuota bancaria <span style="font-size:9px;color:#64748b;">(${_aniosFin} años · TAE ${m.taeCalculadaPct}%)</span>:</span>
            <b style="color:#2563eb;white-space:nowrap;">−${_cuotaMes} €/mes</b>
          </div>
          ${m.mesesCarencia > 0 ? `
          <div class="decision-row" style="font-size:9px;color:#475569;">
            <span>Carencia inicial (${m.mesesCarencia} meses):</span>
            <span>${m.cuotaDuranteCarencia} €/mes (solo int.)</span>
          </div>` : ''}
          <div style="margin-top:6px;padding:7px 10px;border-radius:7px;background:${_balPos ? '#ecfdf5' : '#fef2f2'};border:1px solid ${_balPos ? '#a7f3d0' : '#fecaca'};">
            <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;">
              <span style="font-size:10px;font-weight:800;letter-spacing:0.3px;color:${_balPos ? '#065f46' : '#991b1b'};">BALANCE EN TU BOLSILLO</span>
              <span style="font-size:15px;font-weight:900;color:${_balPos ? '#059669' : '#dc2626'};white-space:nowrap;">${_balPos ? '+' : '−'}${Math.abs(_balMes)} €/mes</span>
            </div>
            <div style="font-size:9.5px;font-weight:700;color:#475569;margin-top:2px;font-family:'JetBrains Mono',monospace;">
              +${_ahorroMes} € (ahorro) − ${_cuotaMes} € (cuota) = <span style="color:${_balPos ? '#059669' : '#dc2626'};">${_balPos ? '+' : '−'}${Math.abs(_balMes)} €/mes</span>
            </div>
          </div>
          <div style="font-size:9.5px;color:#475569;margin-top:6px;line-height:1.4;">
            ${_isOffGrid
              ? (_balPos
                  ? `<div><b>Meses 1–${m.mesesFin || 120}:</b> La energía generada supera la cuota desde el primer mes.</div><div><b>Desde el mes ${_mesLibre}:</b> +${_ahorroMes} €/mes de valor eléctrico libre de cuota.</div>`
                  : `<div><b>Meses 1–${m.mesesFin || 120}:</b> Aportas ${Math.abs(_balMes)} €/mes netos para amortizar tu central autónoma.</div><div><b>Desde el mes ${_mesLibre}:</b> +${_ahorroMes} €/mes de valor energético sin cuotas.</div>`)
              : (_balPos
                  ? `<div><b>Años 1–${_aniosFin}:</b> La instalación se paga sola con el ahorro de luz y ganas +${_balMes} €/mes desde el día 1.</div><div><b>Desde el mes ${_mesLibre}:</b> +${_ahorroMes} €/mes limpios en tu bolsillo (factura residual ~${_fAhora} €/mes).</div>`
                  : `<div><b>Años 1–${_aniosFin}:</b> Aportas ${Math.abs(_balMes)} €/mes netos sobre tu factura anterior (cuota + luz residual: ~${_gastoTotalPrestamo} €/mes).</div><div><b>Desde el mes ${_mesLibre}:</b> Sin cuota; disfrutas de <b>+${_ahorroMes} €/mes limpios</b> (factura residual ~${_fAhora} €/mes).</div>`)}
          </div>
        </div>`;
        })() : ''}
      </div>

      <!-- RESUMEN EJECUTIVO / IMPACTO AMBIENTAL -->
      <div style="margin:12px 0 10px;padding:10px 14px;background:linear-gradient(135deg,${pal.light},#f8fafc);border-left:4px solid ${pal.primary};border-radius:0 8px 8px 0;font-size:10.5px;line-height:1.5;color:#334155;">
        <div id="ra-ai-summary-badge" style="font-size: 10px;text-transform:uppercase;letter-spacing:1px;color:${pal.primary};font-weight:800;margin-bottom:4px;display:flex;align-items:center;gap:4px;">${_mSvg('clipboard', 12, pal.primary)} <span>Resumen del proyecto</span></div>
        <div id="ra-ai-summary-content">${_summaryHTML}</div>
      </div>

      <!-- MATRIZ 2x2 CÁPSULAS DE IMPACTO (TRIPLE TAMAÑO Y ALTA JERARQUÍA) -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:14px 0 16px;">
        <div class="pill-capsule" style="background:${pal.light};border:1.5px solid ${pal.primary};border-radius:14px;padding:12px 16px;display:flex;align-items:center;gap:12px;box-shadow:0 3px 8px rgba(0,0,0,0.04);">
          <span style="display:inline-flex;color:${pal.primary};">${_mSvg('bolt', 26, pal.primary)}</span>
          <div>
            <div style="font-size:10px;font-weight:800;color:${pal.dark};text-transform:uppercase;letter-spacing:0.5px;">Potencia Instalada</div>
            <div style="font-size:16px;font-weight:900;color:${pal.primary};">${m.kwp.toFixed(2)} kWp <span style="font-size:12px;font-weight:700;color:${pal.dark};">(${m.numPanels} Módulos)</span></div>
          </div>
        </div>

        <div class="pill-capsule" style="background:${pal.light};border:1.5px solid ${pal.primary};border-radius:14px;padding:12px 16px;display:flex;align-items:center;gap:12px;box-shadow:0 3px 8px rgba(0,0,0,0.04);">
          <span style="display:inline-flex;color:${pal.primary};">${_mSvg('sun', 26, pal.primary)}</span>
          <div>
            <div style="font-size:10px;font-weight:800;color:${pal.dark};text-transform:uppercase;letter-spacing:0.5px;">Generación Anual Estimada</div>
            <div style="font-size:16px;font-weight:900;color:${pal.primary};">${Math.round(annualYieldKWh).toLocaleString('es-ES')} <span style="font-size:12px;font-weight:700;color:${pal.dark};">kWh/año</span></div>
          </div>
        </div>

        <div class="pill-capsule" style="background:${pal.light};border:1.5px solid ${pal.primary};border-radius:14px;padding:12px 16px;display:flex;align-items:center;gap:12px;box-shadow:0 3px 8px rgba(0,0,0,0.04);">
          <span style="display:inline-flex;color:${pal.primary};">${_mSvg('leaf', 26, pal.primary)}</span>
          <div>
            <div style="font-size:10px;font-weight:800;color:${pal.dark};text-transform:uppercase;letter-spacing:0.5px;">Huella CO₂ Evitada</div>
            <div style="font-size:16px;font-weight:900;color:${pal.primary};">${Math.round(annualYieldKWh * (((typeof window !== 'undefined' && window.SOLAR_ENGINE_CONSTANTS && window.SOLAR_ENGINE_CONSTANTS.CO2_FACTOR_SPAIN) || 0.259))).toLocaleString('es-ES')} <span style="font-size:12px;font-weight:700;color:${pal.dark};">kg CO₂/año</span></div>
          </div>
        </div>

        <div class="pill-capsule" style="background:${pal.light};border:1.5px solid ${pal.primary};border-radius:14px;padding:12px 16px;display:flex;align-items:center;gap:12px;box-shadow:0 3px 8px rgba(0,0,0,0.04);">
          <span style="display:inline-flex;color:${pal.primary};">${_mSvg('tree', 26, pal.primary)}</span>
          <div>
            <div style="font-size:10px;font-weight:800;color:${pal.dark};text-transform:uppercase;letter-spacing:0.5px;">Compensación Ecológica</div>
            <div style="font-size:16px;font-weight:900;color:${pal.primary};">Eq. ${Math.round((annualYieldKWh * (((typeof window !== 'undefined' && window.SOLAR_ENGINE_CONSTANTS && window.SOLAR_ENGINE_CONSTANTS.CO2_FACTOR_SPAIN) || 0.259)) / 1000) * 45)} <span style="font-size:12px;font-weight:700;color:${pal.dark};">árboles/año</span></div>
          </div>
        </div>
      </div>
    </div>

    <!-- PÁGINA FINAL: GARANTÍAS OFICIALES Y FORMALIZACIÓN -->
    <div class="page-sheet" data-section-id="cashflow_25y">
      <div>
        ${buildInnerHeaderHTML('GARANTÍAS &amp; <span style="color:' + pal.primary + '">COMPROMISO TÉCNICO</span>', 'Escudo de Protección · Certificaciones de Calidad · Formalización de Proyecto', _pageIndexGarantias)}

        ${_infografias.tejadoBlindado}

        <h2>Garantías oficiales incluidas</h2>
        <table>
          <tr><th>Componente</th><th>Garantía de Producto</th><th>Garantía de Rendimiento</th><th>Garantía de Instalación</th></tr>
          <tr><td>Módulos Fotovoltaicos</td><td>${warMod} años</td><td>${warPower} años (≥84.8%)</td><td rowspan="${eqWarranties.hasBat ? '4' : '3'}" style="vertical-align:middle;text-align:center;">${warMo} años<br>mano de obra</td></tr>
          <tr><td>Inversor & Monitorización</td><td>${warInv} años (garantía oficial)</td><td>—</td></tr>
          ${eqWarranties.hasBat ? '<tr><td>Batería de Litio LFP</td><td>' + warBat + ' años (o 6.000 ciclos)</td><td>—</td></tr>' : ''}
          <tr><td>Estructura & Fijaciones</td><td>10 años inox A2</td><td>—</td></tr>
        </table>

        <div class="sig-box-grid" style="margin-top:28px;">
          <div class="sig-card" style="display:flex;flex-direction:column;justify-content:space-between;min-height:170px;">
            <div style="font-weight:800;font-size:11px;color:#0f172a;">Conforme y Aceptado por el Cliente</div>
            <div style="margin-top:auto;padding-top:36px;">
              <div style="border-bottom:1px solid #475569;width:75%;margin:0 auto 6px auto;"></div>
              <div style="font-size:10px;font-weight:700;color:#334155;">Firma del Cliente</div>
              <div style="font-size:9.5px;color:#475569;margin-top:2px;">D./Dña. ${_escProp(d.tit.nombre)}</div>
              <div style="font-size:9px;color:#64748b;">NIF: ${_escProp(d.tit.nif)}</div>
              <div style="font-size:9px;color:#64748b;margin-top:2px;">Fecha: ___ / ___ / 2026</div>
            </div>
          </div>
          <div class="sig-card" style="display:flex;flex-direction:column;justify-content:space-between;min-height:170px;">
            <div>
              <div class="sig-logo-box">
                ${logoDataUrl ? '<img src="' + logoDataUrl + '" style="max-height:36px;max-width:100px;object-fit:contain;">' : '<span style="display:inline-flex;color:' + pal.primary + ';">' + _mSvg('building', 20, pal.primary) + '</span>'}
                <div style="text-align:left;"><div style="font-weight:900;font-size:11px;">${_escProp(companyName)}</div>${companyCIF ? '<div style="font-size: 10px;color:#64748b;">CIF: ' + _escProp(companyCIF) + '</div>' : ''}</div>
              </div>
              <div style="font-size:10px;font-weight:700;color:#475569;">Por la Empresa Instaladora</div>
            </div>
            <div style="margin-top:auto;padding-top:24px;">
              <div style="border-bottom:1px solid #475569;width:75%;margin:0 auto 6px auto;"></div>
              <div style="font-size:10px;font-weight:700;color:#334155;">Firma y Sello</div>
              <div style="font-size:9.5px;color:#475569;margin-top:2px;">${_escProp(d.tit.tecnico)} (${_escProp(d.tit.titulacion)})</div>
              ${contactBlock ? '<div style="font-size:9px;color:#64748b;">' + _escProp(contactBlock) + '</div>' : ''}
              <div style="margin-top:6px;">${[
                _mSvg('bolt', 10, pal.primary, 'margin-right:3px;') + 'REBT ITC-BT-40',
                _mSvg('shield', 10, pal.primary, 'margin-right:3px;') + 'RD 244/2019',
                _mSvg('checkCircle', 10, pal.primary, 'margin-right:3px;') + 'IEC 61215'
              ].map(t => '<span class="pill" style="display:inline-flex;align-items:center;">'+t+'</span>').join('')}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- PIE DE HOJA GARANTÍAS -->
      <div class="cover-footer" style="margin-top:auto;padding-top:12px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:9px;color:#64748b;">
        <span>Garantía Oficial de Producto y Rendimiento · Homologación Marcado CE · REBT ITC-BT-40</span>
        <span>${_escProp(companyName)} · Ref: ${_escProp(d.refNum)}</span>
      </div>
    </div>

    <script>
      function getOpenerWindow() {
        try {
          if (window.opener && !window.opener.closed && window.opener.document) return window.opener;
        } catch(e) {}
        try {
          if (window.parent && window.parent !== window && window.parent.document) return window.parent;
        } catch(e) {}
        return null;
      }

      function _propNotify(msg) {
        try {
          const mw = getOpenerWindow();
          if (mw && typeof mw.raAlert === 'function') { mw.raAlert(msg); return; }
        } catch (_) {}
        const n = document.createElement('div');
        n.setAttribute('role', 'status');
        n.style.cssText = 'position:fixed;top:14px;right:14px;z-index:999999;background:#0f172a;color:#fff;padding:10px 14px;border-radius:8px;font-size:12px;box-shadow:0 8px 24px rgba(0,0,0,0.4);max-width:360px;';
        n.textContent = msg;
        document.body.appendChild(n);
        setTimeout(function() { if (n.parentNode) n.parentNode.removeChild(n); }, 4500);
      }

      function _propConfirmAsync(msg) {
        try {
          const mw = getOpenerWindow();
          if (mw && typeof mw.raConfirmAsync === 'function') return mw.raConfirmAsync(msg, 'Confirmar');
        } catch (_) {}
        return new Promise(function(res) {
          const ov = document.createElement('div');
          ov.style.cssText = 'position:fixed;inset:0;background:rgba(2,6,23,0.75);z-index:999999;display:flex;align-items:center;justify-content:center;';
          ov.innerHTML = '<div style="background:#0f172a;color:#fff;padding:18px;border-radius:10px;max-width:360px;font-family:sans-serif;"><div style="font-size:13px;margin-bottom:14px;"></div><div style="display:flex;justify-content:flex-end;gap:8px;"><button type="button" data-c="0" style="padding:6px 12px;border-radius:6px;border:1px solid #475569;background:#1e293b;color:#fff;cursor:pointer;">Cancelar</button><button type="button" data-c="1" style="padding:6px 12px;border-radius:6px;border:none;background:#059669;color:#fff;font-weight:700;cursor:pointer;">Eliminar</button></div></div>';
          ov.firstChild.firstChild.textContent = msg;
          ov.querySelector('[data-c="0"]').onclick = function() { ov.remove(); res(false); };
          ov.querySelector('[data-c="1"]').onclick = function() { ov.remove(); res(true); };
          document.body.appendChild(ov);
        });
      }

      function closeProposalViewer() {
        try {
          const mw = getOpenerWindow();
          if (mw && mw.document) {
            const modal = mw.document.getElementById('ra-embedded-doc-modal');
            if (modal && modal.style.display !== 'none') {
              modal.style.display = 'none';
              return;
            }
          }
        } catch(e) {}
        try { window.close(); } catch(e) {}
      }

      function setDocTheme(t) {
        try {
          const stored = JSON.parse(localStorage.getItem('ra_company_branding') || '{}');
          stored.theme = t;
          localStorage.setItem('ra_company_branding', JSON.stringify(stored));
          const mw = getOpenerWindow();
          if (mw && mw.RACompanyBranding && typeof mw.RACompanyBranding.saveCompanyBranding === 'function') {
            mw.RACompanyBranding.saveCompanyBranding(stored);
          }
          if (mw && mw.RA && mw.RA.branding) {
            mw.RA.branding.theme = t;
          }
          if (mw && typeof mw.generatePropuestaComercialPDF === 'function') {
            if (window.opener && !window.opener.closed) {
              window.name = window.name || 'ra_proposal_window_' + Date.now();
              mw.generatePropuestaComercialPDF(true, window.name, t);
            } else {
              mw.generatePropuestaComercialPDF(true, null, t);
            }
            return;
          }
        } catch (e) {}

        _propNotify('Paleta guardada. Vuelve a abrir la propuesta para visualizarla con el nuevo tema.');
      }

      function triggerPhotoUpload(inputId) {
        const input = document.getElementById(inputId);
        if (input) input.click();
      }

      function handlePhotoUpload(input, imgId, placeholderId) {
        if (!input.files || !input.files[0]) return;
        const file = input.files[0];
        const reader = new FileReader();
        reader.onload = function(e) {
          const img = new Image();
          img.onload = function() {
            const maxDim = 1600;
            let w = img.width, h = img.height;
            if (w > maxDim || h > maxDim) {
              if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; }
              else { w = Math.round((w * maxDim) / h); h = maxDim; }
            }
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            const optimizedData = canvas.toDataURL('image/jpeg', 0.88);

            const targetImg = document.getElementById(imgId);
            const placeholder = document.getElementById(placeholderId);
            if (targetImg) {
              targetImg.src = optimizedData;
              targetImg.style.display = 'block';
            }
            if (placeholder) {
              placeholder.style.display = 'none';
            }

            try {
              let photoKey = 'hero';
              if (imgId.indexOf('cover') !== -1) photoKey = 'cover';
              else if (imgId.indexOf('sub1') !== -1) photoKey = 'sub1';
              else if (imgId.indexOf('sub2') !== -1) photoKey = 'sub2';

              const mw = getOpenerWindow();
              let updatedPhotos = {};
              if (mw && mw.RA) {
                mw.RA._proposalCustomPhotos = mw.RA._proposalCustomPhotos || {};
                mw.RA._proposalCustomPhotos[photoKey] = optimizedData;
                updatedPhotos = Object.assign({}, mw.RA._proposalCustomPhotos);
              } else {
                updatedPhotos[photoKey] = optimizedData;
              }
              if (mw && mw.RAStorageCache && typeof mw.RAStorageCache.cacheAssetAsync === 'function') {
                mw.RAStorageCache.cacheAssetAsync('ra_proposal_custom_photos', updatedPhotos).catch(function() {});
              }
              try {
                const currentPhotos = JSON.parse(sessionStorage.getItem('ra_proposal_custom_photos') || '{}');
                currentPhotos[photoKey] = optimizedData;
                sessionStorage.setItem('ra_proposal_custom_photos', JSON.stringify(currentPhotos));
              } catch (eQuotaSS) {}
            } catch (errPersist) {
              console.warn('[handlePhotoUpload] No se pudo persistir foto:', errPersist);
            }
          };
          img.src = e.target.result;
        };
        reader.readAsDataURL(file);
      }

      let _draggedElement = null;
      let _selectedBox = null;

      function setupInteractiveBoxes() {
        const selectors = [
          '.hero-card', '.closer-hero-card', '.decision-card', '.chart-box', '.tech-card',
          '.sig-card', '.cover-spec-card', '.photo-card-hero', '.photo-card-sub', '.cover-photo-card',
          '.kpi-strip', '.dcard', '.closer-cta-box', '.cel-card', 'table', 'p', 'h2', 'h3'
        ];
        const sheets = document.querySelectorAll('.page-sheet');
        sheets.forEach(sheet => {
          selectors.forEach(sel => {
            sheet.querySelectorAll(sel).forEach(el => {
              if (el.hasAttribute('data-editable-box')) return;
              el.setAttribute('data-editable-box', 'true');

              const delBtn = document.createElement('button');
              delBtn.type = 'button';
              delBtn.className = 'ra-edit-del-btn no-print';
              delBtn.title = 'Eliminar este elemento';
              delBtn.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
              delBtn.onclick = async function(ev) {
                ev.stopPropagation();
                ev.preventDefault();
                if (await _propConfirmAsync('¿Eliminar este bloque del documento?')) {
                  el.remove();
                }
              };
              el.appendChild(delBtn);

              // ── TIRADORES DE TAMAÑO Y REDIMENSIÓN (CORNER ◢ Y ALTURA ⇕) ──
              const handleCorner = document.createElement('div');
              handleCorner.className = 'ra-resize-handle ra-resize-corner no-print';
              handleCorner.title = 'Arrastra para redimensionar ancho y alto';
              handleCorner.innerHTML = '◢';
              el.appendChild(handleCorner);

              const handleHeight = document.createElement('div');
              handleHeight.className = 'ra-resize-handle ra-resize-height no-print';
              handleHeight.title = 'Arrastra hacia arriba o abajo para ajustar la altura del bloque';
              handleHeight.innerHTML = '⇕ Alto';
              el.appendChild(handleHeight);

              // Lógica de redimensión vertical (Altura del bloque)
              handleHeight.addEventListener('mousedown', function(e) {
                e.stopPropagation();
                e.preventDefault();
                const startY = e.clientY;
                const startH = el.offsetHeight;
                const tt = document.getElementById('ra-gap-tooltip');
                const radarInner = el.querySelector('.cel-radar-inner') || (el.classList.contains('cel-radar-inner') ? el : null);
                const startInnerH = radarInner ? radarInner.offsetHeight : 0;

                function onMoveH(ev) {
                  const deltaY = ev.clientY - startY;
                  const newH = Math.max(60, Math.round(startH + deltaY));
                  el.style.height = newH + 'px';
                  if (radarInner && startInnerH > 0) {
                    const newInnerH = Math.max(80, Math.round(startInnerH + deltaY));
                    radarInner.style.height = newInnerH + 'px';
                  }
                  if (tt) {
                    tt.style.display = 'block';
                    tt.style.left = (ev.clientX + 14) + 'px';
                    tt.style.top = (ev.clientY - 12) + 'px';
                    tt.innerHTML = '⇕ Altura bloque: <b>' + newH + ' px</b>';
                  }
                }
                function onUpH() {
                  window.removeEventListener('mousemove', onMoveH);
                  window.removeEventListener('mouseup', onUpH);
                  if (tt) tt.style.display = 'none';
                }
                window.addEventListener('mousemove', onMoveH);
                window.addEventListener('mouseup', onUpH);
              });

              // Lógica de redimensión bidireccional (Esquina ◢)
              handleCorner.addEventListener('mousedown', function(e) {
                e.stopPropagation();
                e.preventDefault();
                const startX = e.clientX;
                const startY = e.clientY;
                const startW = el.offsetWidth;
                const startH = el.offsetHeight;
                const tt = document.getElementById('ra-gap-tooltip');
                const radarInner = el.querySelector('.cel-radar-inner') || (el.classList.contains('cel-radar-inner') ? el : null);
                const startInnerH = radarInner ? radarInner.offsetHeight : 0;

                function onMoveC(ev) {
                  const deltaX = ev.clientX - startX;
                  const deltaY = ev.clientY - startY;
                  const newW = Math.max(100, Math.round(startW + deltaX));
                  const newH = Math.max(60, Math.round(startH + deltaY));
                  el.style.width = newW + 'px';
                  el.style.height = newH + 'px';
                  if (radarInner && startInnerH > 0) {
                    const newInnerH = Math.max(80, Math.round(startInnerH + deltaY));
                    radarInner.style.height = newInnerH + 'px';
                  }
                  if (tt) {
                    tt.style.display = 'block';
                    tt.style.left = (ev.clientX + 14) + 'px';
                    tt.style.top = (ev.clientY - 12) + 'px';
                    tt.innerHTML = '⤡ Tamaño: <b>' + newW + ' × ' + newH + ' px</b>';
                  }
                }
                function onUpC() {
                  window.removeEventListener('mousemove', onMoveC);
                  window.removeEventListener('mouseup', onUpC);
                  if (tt) tt.style.display = 'none';
                }
                window.addEventListener('mousemove', onMoveC);
                window.addEventListener('mouseup', onUpC);
              });

              // ── TIRADORES DE SEPARACIÓN (OPCIÓN B: SPLITTERS HORIZONTAL Y VERTICAL) ──
              const handleX = document.createElement('div');
              handleX.className = 'ra-gap-handle ra-gap-handle-x no-print';
              handleX.title = 'Arrastra horizontalmente para separar o acercar lateralmente (↔ Margen)';
              handleX.innerHTML = '↔';
              el.appendChild(handleX);

              const handleY = document.createElement('div');
              handleY.className = 'ra-gap-handle ra-gap-handle-y no-print';
              handleY.title = 'Arrastra verticalmente para separar o acercar entre filas (↕ Margen)';
              handleY.innerHTML = '↕';
              el.appendChild(handleY);

              // Lógica de arrastre de separación horizontal
              handleX.addEventListener('mousedown', function(e) {
                e.stopPropagation();
                e.preventDefault();
                const startX = e.clientX;
                const computed = window.getComputedStyle(el);
                const startMarginR = parseFloat(computed.marginRight) || 0;
                const tt = document.getElementById('ra-gap-tooltip');

                function onMoveX(ev) {
                  const delta = ev.clientX - startX;
                  const newMargin = Math.max(0, Math.round(startMarginR + delta));
                  el.style.marginRight = newMargin + 'px';
                  if (tt) {
                    tt.style.display = 'block';
                    tt.style.left = (ev.clientX + 14) + 'px';
                    tt.style.top = (ev.clientY - 12) + 'px';
                    tt.innerHTML = '↔ Margen H: <b>' + newMargin + ' px</b> (~' + (newMargin * 0.264583).toFixed(1) + ' mm)';
                  }
                }
                function onUpX() {
                  window.removeEventListener('mousemove', onMoveX);
                  window.removeEventListener('mouseup', onUpX);
                  if (tt) tt.style.display = 'none';
                }
                window.addEventListener('mousemove', onMoveX);
                window.addEventListener('mouseup', onUpX);
              });

              // Lógica de arrastre de separación vertical
              handleY.addEventListener('mousedown', function(e) {
                e.stopPropagation();
                e.preventDefault();
                const startY = e.clientY;
                const computed = window.getComputedStyle(el);
                const startMarginB = parseFloat(computed.marginBottom) || 0;
                const tt = document.getElementById('ra-gap-tooltip');

                function onMoveY(ev) {
                  const delta = ev.clientY - startY;
                  const newMargin = Math.max(0, Math.round(startMarginB + delta));
                  el.style.marginBottom = newMargin + 'px';
                  if (tt) {
                    tt.style.display = 'block';
                    tt.style.left = (ev.clientX + 14) + 'px';
                    tt.style.top = (ev.clientY - 12) + 'px';
                    tt.innerHTML = '↕ Margen V: <b>' + newMargin + ' px</b> (~' + (newMargin * 0.264583).toFixed(1) + ' mm)';
                  }
                }
                function onUpY() {
                  window.removeEventListener('mousemove', onMoveY);
                  window.removeEventListener('mouseup', onUpY);
                  if (tt) tt.style.display = 'none';
                }
                window.addEventListener('mousemove', onMoveY);
                window.addEventListener('mouseup', onUpY);
              });

              el.addEventListener('click', function(ev) {
                if (!document.body.classList.contains('mode-edit-layout')) return;
                ev.stopPropagation();
                if (_selectedBox) _selectedBox.classList.remove('selected-edit-box');
                _selectedBox = el;
                el.classList.add('selected-edit-box');
              });

              el.addEventListener('mousedown', function(ev) {
                if (!document.body.classList.contains('mode-edit-layout')) return;
                // Si el clic es sobre un botón de borrado, tirador de separación o sobre un elemento editable de texto directo, no forzar drag
                if (ev.target.closest('.ra-edit-del-btn') || ev.target.closest('.ra-gap-handle') || ev.target.closest('.ra-resize-handle')) return;
                const isDirectTextEdit = ['INPUT', 'TEXTAREA'].includes(ev.target.tagName);
                if (isDirectTextEdit) return;

                // Si el clic se produce sobre el tirador de redimensión (esquina inferior derecha de 18x18px), permitir redimensionar sin arrastrar
                const rect = el.getBoundingClientRect();
                const isOnResizeHandle = (ev.clientX >= rect.right - 18) && (ev.clientY >= rect.bottom - 18);
                if (isOnResizeHandle) {
                  el.removeAttribute('draggable');
                  return;
                }

                el.setAttribute('draggable', 'true');
              });

              el.addEventListener('dragstart', function(ev) {
                if (!document.body.classList.contains('mode-edit-layout')) return;
                _draggedElement = el;
                ev.dataTransfer.effectAllowed = 'move';
                try { ev.dataTransfer.setData('text/plain', ''); } catch(e) {}
                setTimeout(() => {
                  if (_draggedElement) _draggedElement.style.opacity = '0.4';
                }, 0);
              });

              el.addEventListener('dragend', function() {
                if (_draggedElement) _draggedElement.style.opacity = '1';
                _draggedElement = null;
                document.querySelectorAll('.drag-over-active').forEach(item => item.classList.remove('drag-over-active'));
              });

              el.addEventListener('dragover', function(ev) {
                if (!document.body.classList.contains('mode-edit-layout') || !_draggedElement || _draggedElement === el) return;
                ev.preventDefault();
                ev.dataTransfer.dropEffect = 'move';
              });

              el.addEventListener('dragenter', function(ev) {
                if (!document.body.classList.contains('mode-edit-layout') || !_draggedElement || _draggedElement === el) return;
                el.classList.add('drag-over-active');
              });

              el.addEventListener('dragleave', function(ev) {
                el.classList.remove('drag-over-active');
              });

              el.addEventListener('drop', function(ev) {
                if (!document.body.classList.contains('mode-edit-layout') || !_draggedElement || _draggedElement === el) return;
                ev.preventDefault();
                ev.stopPropagation();
                el.classList.remove('drag-over-active');
                const parent = el.parentNode;
                if (!parent) return;
                const rect = el.getBoundingClientRect();
                const next = (ev.clientY - rect.top) > (rect.height / 2) || (ev.clientX - rect.left) > (rect.width / 2);
                parent.insertBefore(_draggedElement, next ? el.nextSibling : el);
              });
            });
          });
        });
      }

      document.addEventListener('keydown', function(ev) {
        if (!document.body.classList.contains('mode-edit-layout') || !_selectedBox) return;
        if (ev.target && ev.target.isContentEditable && ev.target !== _selectedBox) return;
        if (ev.key === 'Delete') {
          _selectedBox.remove();
          _selectedBox = null;
          return;
        }

        // Atajo teclado Alt + Flechas para ajuste fino de separación en milímetros
        if (ev.altKey) {
          const stepPx = 4; // ~1mm por pulsación
          const computed = window.getComputedStyle(_selectedBox);
          if (ev.key === 'ArrowRight') {
            ev.preventDefault();
            const cur = parseFloat(computed.marginRight) || 0;
            _selectedBox.style.marginRight = (cur + stepPx) + 'px';
          } else if (ev.key === 'ArrowLeft') {
            ev.preventDefault();
            const cur = parseFloat(computed.marginRight) || 0;
            _selectedBox.style.marginRight = Math.max(0, cur - stepPx) + 'px';
          } else if (ev.key === 'ArrowDown') {
            ev.preventDefault();
            const cur = parseFloat(computed.marginBottom) || 0;
            _selectedBox.style.marginBottom = (cur + stepPx) + 'px';
          } else if (ev.key === 'ArrowUp') {
            ev.preventDefault();
            const cur = parseFloat(computed.marginBottom) || 0;
            _selectedBox.style.marginBottom = Math.max(0, cur - stepPx) + 'px';
          }
        }
      });

      function applyPropFormat(cmd, val) {
        document.execCommand(cmd, false, val || null);
      }

      function capture3DToProposal() {
        try {
          let canvas = null;
          const mw = getOpenerWindow();
          if (mw) {
            if (mw.viewer && mw.viewer.scene && mw.viewer.scene.canvas) {
              try { mw.viewer.scene.render(); } catch(e) {}
              canvas = mw.viewer.scene.canvas;
            } else {
              const el = mw.document.querySelector('canvas');
              if (el) canvas = el;
            }
          }
          if (canvas) {
            const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
            const heroImg = document.getElementById('photo-cover-img') || document.getElementById('prop-hero-img') || document.querySelector('.cover-photo-card img') || document.querySelector('.photo-card-hero img');
            if (heroImg) {
              heroImg.src = dataUrl;
              heroImg.style.display = 'block';
              const pl = document.getElementById('photo-cover-placeholder') || heroImg.parentElement.querySelector('.photo-placeholder') || heroImg.parentElement.querySelector('.photo-empty-placeholder');
              if (pl) pl.style.display = 'none';
            }
            try {
              let updatedCoverPhotos = {};
              if (mw && mw.RA) {
                mw.RA._proposalCustomPhotos = mw.RA._proposalCustomPhotos || {};
                mw.RA._proposalCustomPhotos.cover = dataUrl;
                updatedCoverPhotos = Object.assign({}, mw.RA._proposalCustomPhotos);
              } else {
                updatedCoverPhotos.cover = dataUrl;
              }
              if (mw && mw.RAStorageCache && typeof mw.RAStorageCache.cacheAssetAsync === 'function') {
                mw.RAStorageCache.cacheAssetAsync('ra_proposal_custom_photos', updatedCoverPhotos).catch(function() {});
              }
              const currentPhotos = JSON.parse(sessionStorage.getItem('ra_proposal_custom_photos') || '{}');
              currentPhotos.cover = dataUrl;
              sessionStorage.setItem('ra_proposal_custom_photos', JSON.stringify(currentPhotos));
            } catch(ePersist) {}

            _propNotify('¡Captura 3D del proyecto actualizada con éxito en la propuesta!');
          } else {
            _propNotify('No se pudo acceder al visor 3D de la ventana principal. Asegúrate de que la ventana del proyecto esté abierta.');
          }
        } catch (err) {
          _propNotify('Error capturando vista 3D: ' + err.message);
        }
      }

      document.addEventListener('selectionchange', function() {
        const tb = document.getElementById('prop-format-toolbar');
        if (!tb || !document.body.classList.contains('mode-edit-layout')) {
          if (tb) tb.style.display = 'none';
          return;
        }
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || !sel.rangeCount) {
          tb.style.display = 'none';
          return;
        }
        const range = sel.getRangeAt(0);
        const sheets = document.querySelectorAll('.page-sheet');
        let insideSheet = false;
        sheets.forEach(s => {
          if (s.contains(range.commonAncestorContainer)) insideSheet = true;
        });
        if (!insideSheet) {
          tb.style.display = 'none';
          return;
        }
        const rect = range.getBoundingClientRect();
        if (rect.width === 0) {
          tb.style.display = 'none';
          return;
        }
        tb.style.display = 'flex';
        tb.style.left = Math.max(10, Math.min(window.innerWidth - 380, rect.left + window.scrollX + (rect.width / 2) - 180)) + 'px';
        tb.style.top = Math.max(54, rect.top + window.scrollY - 44) + 'px';
      });

      function togglePropEdit() {
        const sheets = document.querySelectorAll('.page-sheet');
        const btn = document.getElementById('btn-prop-edit');
        const isEdit = document.body.classList.contains('mode-edit-layout');

        if (isEdit) {
          document.body.classList.remove('mode-edit-layout');
          sheets.forEach(s => {
            s.contentEditable = 'false';
            s.style.outline = 'none';
          });
          document.querySelectorAll('[data-editable-box]').forEach(el => {
            el.removeAttribute('draggable');
          });
          if (_selectedBox) {
            _selectedBox.classList.remove('selected-edit-box');
            _selectedBox = null;
          }
          const tb = document.getElementById('prop-format-toolbar');
          if (tb) tb.style.display = 'none';
          btn.innerHTML = '${_mSvg("edit", 13, "currentColor")} EDITAR';
          btn.style.background = '${pal.accent}';
        } else {
          document.body.classList.add('mode-edit-layout');
          setupInteractiveBoxes();
          sheets.forEach(s => {
            s.contentEditable = 'true';
            s.style.outline = '2px dashed ${pal.primary}';
          });
          document.querySelectorAll('[data-editable-box]').forEach(el => {
            el.setAttribute('draggable', 'true');
          });
          btn.innerHTML = '${_mSvg("save", 13, "#ffffff")} FINALIZAR EDICIÓN';
          btn.style.background = '#10b981';
        }
      }

      async function exportPropDocx() {
        const btnWord = document.getElementById('btn-export-docx');
        const origText = btnWord ? btnWord.innerHTML : '';
        if (btnWord) { btnWord.innerHTML = '${_mSvg("refresh", 13, "currentColor")} GENERANDO DOCX...'; btnWord.disabled = true; }

        try {
          const sheets = document.querySelectorAll('.page-sheet');
          if (!sheets || sheets.length === 0) throw new Error('No se encontraron hojas para exportar');

          const container = document.createElement('div');
          sheets.forEach(s => {
            const cloneSheet = s.cloneNode(true);
            cloneSheet.querySelectorAll('.ra-edit-del-btn, .ra-gap-handle, #ra-gap-tooltip, #doc-format-toolbar, #prop-format-toolbar, .no-print, .photo-upload-overlay').forEach(b => b.remove());
            cloneSheet.querySelectorAll('[data-editable-box]').forEach(el => {
              el.removeAttribute('draggable');
              el.removeAttribute('data-editable-box');
            });
            cloneSheet.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
            cloneSheet.querySelectorAll('.editable-field').forEach(el => el.classList.remove('editable-field'));
            cloneSheet.removeAttribute('contenteditable');
            container.appendChild(cloneSheet);
          });

          const mw = getOpenerWindow();
          let exporter = (mw && mw.RADocxExporter) || (typeof RADocxExporter !== 'undefined' ? RADocxExporter : null);
          if (!exporter && mw && mw.RALazyLoader && typeof mw.RALazyLoader.loadDocxExporter === 'function') {
            exporter = await mw.RALazyLoader.loadDocxExporter();
          } else if (!exporter && typeof RALazyLoader !== 'undefined' && typeof RALazyLoader.loadDocxExporter === 'function') {
            exporter = await RALazyLoader.loadDocxExporter();
          }
          if (exporter && typeof exporter.rasterizeSvgsToPng === 'function') {
            await exporter.rasterizeSvgsToPng(container);
          } else {
            const svgs = Array.from(container.querySelectorAll('svg'));
            for (let i = 0; i < svgs.length; i++) {
              const svgEl = svgs[i];
              try {
                const svgData = new XMLSerializer().serializeToString(svgEl);
                const svgB64 = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
                const imgEl = document.createElement('img');
                imgEl.src = svgB64;
                imgEl.style.cssText = svgEl.style.cssText || 'display:block;max-width:100%;';
                if (svgEl.getAttribute('width')) imgEl.setAttribute('width', svgEl.getAttribute('width'));
                if (svgEl.getAttribute('height')) imgEl.setAttribute('height', svgEl.getAttribute('height'));
                svgEl.parentNode.replaceChild(imgEl, svgEl);
              } catch(eSvg) {}
            }
          }

          const stylesEl = document.querySelector('style');
          const styles = stylesEl ? stylesEl.innerHTML : '';

          let docxBlob = null;
          if (exporter && typeof exporter.buildDocxBlobFromHtml === 'function') {
            docxBlob = exporter.buildDocxBlobFromHtml(container.innerHTML, {
              orientation: 'portrait',
              styles: styles,
              title: document.title || 'Propuesta Comercial'
            });
          } else {
            // Fallback: descargar como documento HTML compatible con Word
            const wordHtml = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><style>' + styles + '</style></head><body>' + container.innerHTML + '</body></html>';
            docxBlob = new Blob(['\ufeff', wordHtml], { type: 'application/msword' });
          }

          const a = document.createElement('a');
          a.href = URL.createObjectURL(docxBlob);
          a.download = '${d.refNum}_Propuesta_Comercial.docx';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(a.href), 30000);
        } catch(errDocx) {
          console.error('Error exportando a DOCX:', errDocx);
          _propNotify('No se pudo generar el archivo DOCX: ' + (errDocx.message || errDocx));
        } finally {
          if (btnWord) { btnWord.innerHTML = origText || '${_mSvg("fileText", 13, "currentColor")} WORD (.DOCX)'; btnWord.disabled = false; }
        }
      }
      function exportPropWord() {
        return exportPropDocx();
      }
      function exportPropHtml() {
        const clone = document.documentElement.cloneNode(true);
        const bar = clone.querySelector('.doc-top-bar'); if (bar) bar.remove();
        clone.querySelectorAll('.ra-edit-del-btn, .ra-gap-handle, #ra-gap-tooltip, #doc-format-toolbar, .no-print, .photo-upload-overlay').forEach(b => b.remove());
        clone.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
        clone.querySelectorAll('.editable-field').forEach(el => el.classList.remove('editable-field'));
        clone.querySelectorAll('[data-editable-box]').forEach(el => {
          el.removeAttribute('draggable');
          el.removeAttribute('data-editable-box');
        });
        const blob = new Blob(['\ufeff' + clone.outerHTML], { type: 'text/html;charset=utf-8' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = '${d.refNum}_Propuesta_Comercial.html';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
      }

      // Exponer globalmente en window para garantizar compatibilidad inline onclick
      window.getOpenerWindow = getOpenerWindow;
      window.closeProposalViewer = closeProposalViewer;
      window.setDocTheme = setDocTheme;
      window.triggerPhotoUpload = triggerPhotoUpload;
      window.handlePhotoUpload = handlePhotoUpload;
      window.setupInteractiveBoxes = setupInteractiveBoxes;
      window.applyPropFormat = applyPropFormat;
      window.capture3DToProposal = capture3DToProposal;
      window.togglePropEdit = togglePropEdit;
      window.exportPropDocx = exportPropDocx;
      window.exportPropWord = exportPropWord;
      window.exportPropHtml = exportPropHtml;
      ${(typeof window !== 'undefined' && window.RAProposalStyleStudio && typeof window.RAProposalStyleStudio.getSectionPaginationAndOrderScript === 'function') ? window.RAProposalStyleStudio.getSectionPaginationAndOrderScript('.page-sheet') : ''}
      ${(typeof window !== 'undefined' && window.RAProposalStyleStudio && typeof window.RAProposalStyleStudio.getAutoFitClientScript === 'function') ? window.RAProposalStyleStudio.getAutoFitClientScript('.page-sheet') : ''}
    </script>
  </body>
  </html>
  `;

  const w = window.open('', targetWindowName || '_blank');
  if (!w) {
    if (typeof showEmbeddedDocViewer === 'function') {
      showEmbeddedDocViewer('Propuesta Comercial Bancable - ' + d.refNum, code);
      return;
    }
    (typeof raAlert === 'function' ? raAlert : console.warn)('Por favor, activa las ventanas emergentes (popups) para visualizar la propuesta comercial.', 'warning');
    return;
  }
  w.document.open();
  w.document.write(code);
  w.document.close();

  // ── Enriquecimiento IA async (solo si no se usa plantilla fija bloqueada) ──
  if (!(_studioCfg && _studioCfg.lockedTexts && _studioCfg.lockedTexts.useLockedSummary)) {
    enrichSummaryWithGemini(w, d, m, _eqp);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// MOTOR FINANCIERO BANCABLE (CAPEX, OPEX, CASHFLOW, VAN, TIR, AMORTIZACIÓN)
// Nota: La física solar y simulación anual se calculan exclusivamente en solar-engine.js (v3.0)
// ═════════════════════════════════════════════════════════════════════════════
  function calculateFinancialModel(overrides) {
  if (typeof window !== 'undefined') window._isComputingFinModel = true;
  try {
  const d = (overrides && overrides.d) || getProjectCalcs();
  const mb = (d && d.modulesBreakdown) || (typeof window !== 'undefined' && window.RAModulesBreakdown && typeof window.RAModulesBreakdown.getProjectModulesBreakdown === 'function' ? window.RAModulesBreakdown.getProjectModulesBreakdown() : null);
  const numPanels = (overrides && typeof overrides.numPanels === 'number')
    ? overrides.numPanels
    : ((mb && typeof mb.totalPanels === 'number')
        ? mb.totalPanels
        : (typeof d.numPanels === 'number' ? d.numPanels : 0));
  const kwp = (mb && mb.totalKwp > 0) ? mb.totalKwp : ((numPanels * (d.cfg.potencia || 450)) / 1000.0);
  // [SSOT] Producción física anual: priorizar simulación 3D precisa o modo Teórico si el usuario lo elige en Paso 5
  const isHeatmapDirty = !!(typeof window !== 'undefined' && window.solarSimState && window.solarSimState.annualHeatmapDirty);
  const useTheoreticalMode = (typeof window !== 'undefined' && window.raProposalYieldMode === 'theoretical');
  const solarStats = (typeof window !== 'undefined' && window.RA && window.RA.solarStats) ? window.RA.solarStats : null;
  const prEff = (solarStats && typeof solarStats.pr === 'number' && solarStats.pr > 0 && solarStats.pr <= 1) ? solarStats.pr : 0.786;
  const solarYieldKWh = (numPanels <= 0)
    ? 0
    : (useTheoreticalMode
        ? Math.round(((solarStats && Number.isFinite(solarStats.annualGrossKWh) && solarStats.annualGrossKWh > 0) ? solarStats.annualGrossKWh : ((d.annualKWh || (kwp * 1450)) / prEff)) * prEff)
        : ((!isHeatmapDirty && solarStats && Number.isFinite(solarStats.annualYieldKWh) && solarStats.annualYieldKWh > 0)
            ? Math.round(solarStats.annualYieldKWh)
            : (d.annualKWh || (kwp * 1450))));
  const activeWindTurbines = (typeof window !== 'undefined' && Array.isArray(window.windTurbines))
    ? window.windTurbines.filter(t => t && (!t.operationalState || t.operationalState.enabled !== false))
    : [];
  const wPark = (typeof window !== 'undefined' && window.windParkSummary) ? window.windParkSummary : null;
  let windYieldKWh = 0;
  if (activeWindTurbines.length > 0) {
    if (wPark && Number.isFinite(wPark.totalAepNetKwh) && wPark.totalAepNetKwh > 0) {
      windYieldKWh = Math.round(wPark.totalAepNetKwh);
    } else {
      windYieldKWh = Math.round(activeWindTurbines.reduce((sum, t) => sum + ((t.results && Number.isFinite(t.results.aepNetKwh)) ? t.results.aepNetKwh : 0), 0));
    }
  }
  const annualYieldKWh = solarYieldKWh + windYieldKWh;

  const designCosts = (typeof RAPricing !== 'undefined' && typeof RAPricing.computeDesignCosts === 'function')
    ? RAPricing.computeDesignCosts(numPanels)
    : null;
  const pricing = (typeof RAPricing !== 'undefined') ? RAPricing.getEffectivePricing() : { panelPrice: 125, moPrice: 1400, marginPct: 20 };
  const hasSessionOverride = !!(pricing && (pricing.isManualOverride || pricing.projectFingerprint));
  const unitPanelPrice = (pricing && pricing.panelPrice > 0) ? pricing.panelPrice : (designCosts ? designCosts.panelPrice : (d.cfg.precio || 125));
  const panCost = (mb && mb.totalPanelsCost > 0 && (!hasSessionOverride || (designCosts && Math.abs(unitPanelPrice - designCosts.panelPrice) < 0.05)))
    ? Math.round(mb.totalPanelsCost)
    : Math.round(numPanels * unitPanelPrice);
  // [SSOT] Lector de parámetros con doble fuente: los inputs del DESGLOSE (modal-cfg-pres-*,
  // modal-tax-*, modal-fin-*) son la UI real que existe en el DOM; los ids legacy del sidebar
  // (cfg-pres-*, tax-*, fin-*) no existen y quedan como fallback histórico.
  const _input = (id, def) => {
    const el = document.getElementById(id) || document.getElementById('modal-' + id);
    if (!el) return def;
    // [D5/M10] Distinguir campo vacío de un valor 0 real: "" → default, "0" → 0
    const raw = (el.value == null ? '' : String(el.value)).trim();
    if (raw === '') return def;
    const v = parseFloat(raw);
    return isFinite(v) ? v : def;
  };
  const _sel = (id, def) => {
    const el = document.getElementById(id) || document.getElementById('modal-' + id);
    return el ? el.value : def;
  };
  let est = designCosts ? designCosts.estPrice : _input('cfg-pres-est', 450);
  if (est > 0) {
    const estEl = document.getElementById('cfg-pres-est');
    if (estEl && document.getElementById('modal-cfg-pres-est')) {
      estEl.value = Math.round(est);
      estEl.setAttribute('readonly', 'true');
      estEl.style.backgroundColor = 'rgba(16, 185, 129, 0.1)';
      estEl.style.border = '1px solid #10b981';
      estEl.title = "Calculado automáticamente por el Árbol BIM";
      document.getElementById('modal-cfg-pres-est').value = Math.round(est);
      document.getElementById('modal-cfg-pres-est').setAttribute('readonly', 'true');
    }
  }
  const _ssotCat = (typeof equipmentCatalog !== 'undefined') ? equipmentCatalog : null;
  const _ssotCfg = (typeof window !== 'undefined' && window.solarProjectConfig) ? window.solarProjectConfig : {};
  let _invSel = null;
  if (_ssotCat && _ssotCfg.selectedInverterId) {
    _invSel = (_ssotCat.inverters || []).find(i => i.id === _ssotCfg.selectedInverterId) || null;
  }
  if (!_invSel && _ssotCfg.lastVirtualInverter && _ssotCfg.lastVirtualInverter.id === _ssotCfg.selectedInverterId) {
    _invSel = _ssotCfg.lastVirtualInverter;
  }
  let _batSel = null;
  if (_ssotCat && _ssotCfg.selectedBatteryId && _ssotCfg.selectedBatteryId !== 'bat_none') {
    _batSel = (_ssotCat.batteries || []).find(b => b.id === _ssotCfg.selectedBatteryId) || null;
  }

  // [SSOT] designCosts.invPrice ya integra inversor central (o microinversores) + optimizadores MLPE sin duplicidad
  let inv = designCosts ? designCosts.invPrice : _input('cfg-pres-inv', 1100);
  let bat = designCosts ? designCosts.batPrice : _input('cfg-pres-bat', 0);
  let cab = designCosts ? designCosts.cabPrice : _input('cfg-pres-cab', 350);
  let mo  = designCosts ? designCosts.moPrice : _input('cfg-pres-mo', 1400);
  let leg = designCosts ? designCosts.legPrice : _input('cfg-pres-leg', 500);
  let windCost = (designCosts && typeof designCosts.windPrice === 'number') ? designCosts.windPrice : 0;

  // [SSOT] Si el usuario ha ajustado precios manualmente para ESTE diseño (misma huella), aplicar sus ajustes:
  if (hasSessionOverride) {
    if (typeof pricing.estPrice === 'number' && pricing.estPrice >= 0) est = pricing.estPrice;
    if (typeof pricing.invPrice === 'number' && pricing.invPrice >= 0) inv = pricing.invPrice;
    if (typeof pricing.batPrice === 'number' && pricing.batPrice >= 0) {
      bat = pricing.batPrice;
    }
    if (typeof pricing.cabPrice === 'number' && pricing.cabPrice >= 0) cab = pricing.cabPrice;
    if (typeof pricing.moPrice === 'number' && pricing.moPrice >= 0) mo = pricing.moPrice;
    if (typeof pricing.legPrice === 'number' && pricing.legPrice >= 0) leg = pricing.legPrice;
    if (typeof pricing.windPrice === 'number' && pricing.windPrice >= 0) windCost = pricing.windPrice;
  }

  const mlpeCost = designCosts ? (designCosts.mlpePrice || 0) : 0;
  // directCost suma exactamente las 7 partidas canónicas (inv ya incluye mlpePrice cuando aplica)
  const directCost = Math.round(panCost + est + inv + bat + cab + mo + leg + windCost);
  const marginPct = (pricing && typeof pricing.marginPct === 'number') ? pricing.marginPct : 20;
  const marginEur = directCost * (marginPct / 100.0);

  // Integración modular de Add-ons y Descuento Comercial (Fase 3)
  const commercialCfg = (typeof RAPricing !== 'undefined' && typeof RAPricing.getCommercialConfig === 'function')
    ? RAPricing.getCommercialConfig()
    : null;
  const addonsCost = commercialCfg ? RAPricing.computeAddonsTotal() : 0;
  const subtotalPreDiscount = directCost + marginEur + addonsCost;

  let discountEur = 0;
  const discountLabel = (commercialCfg && commercialCfg.discountLabel) || 'Descuento Comercial Especial';
  if (commercialCfg && commercialCfg.discountEnabled) {
    if (commercialCfg.discountType === 'percent') {
      discountEur = subtotalPreDiscount * (Math.max(0, Number(commercialCfg.discountValue) || 0) / 100.0);
    } else {
      discountEur = Math.max(0, Number(commercialCfg.discountValue) || 0);
    }
  }
  // Fiscalidad con sincronización SSOT y respaldo desde configuración persistida
  const _commTax = (commercialCfg && commercialCfg.taxShield) ? commercialCfg.taxShield : {};

  // Lector de IVA dinámico (21% general, 10% renovación ≤40% mat, 10% rehabilitación/obra nueva, 0% exento/IGIC)
  const ivaEl = document.getElementById('tax-iva-opt') || document.getElementById('modal-tax-iva-opt');
  const ivaOptRaw = (ivaEl && ivaEl.value !== undefined && ivaEl.value !== '')
    ? String(ivaEl.value)
    : ((_ssotCfg.taxSettings && _ssotCfg.taxSettings.ivaOpt) || (_commTax && _commTax.ivaOpt) || '');
  let ivaRate = ivaOptRaw !== '' ? parseFloat(ivaOptRaw) : undefined;
  if (!Number.isFinite(ivaRate) && _commTax && typeof _commTax.ivaRate === 'number') {
    ivaRate = _commTax.ivaRate;
  }
  if (!Number.isFinite(ivaRate)) ivaRate = 0.21;

  const subtotal = Math.max(100, Math.round(subtotalPreDiscount - discountEur));
  const iva = Math.round(subtotal * ivaRate);
  const capexBruto = subtotal + iva;
  const capexTachado = (discountEur > 0) ? Math.round(subtotalPreDiscount * (1 + ivaRate)) : null;

  // Modalidad de instalación (Aislada vs Red) y Calificación de Suelo (Urbano vs Rústico)
  const _studioCfg = (typeof window !== "undefined" && window.RAProposalStyleStudio && typeof window.RAProposalStyleStudio.getActiveConfig === "function")
    ? window.RAProposalStyleStudio.getActiveConfig()
    : null;
  const isOffGrid = Boolean(_studioCfg && _studioCfg.installationModality === "off_grid");

  const soilEl = document.getElementById("tax-soil-type") || document.getElementById("modal-tax-soil-type");
  const soilType = (soilEl && soilEl.value) ? soilEl.value : ((_commTax && _commTax.soilType) || "urbano");

  // Perfil fiscal del cliente: Particular / Residencial (IRPF) vs Empresa / Pyme (Impuesto sobre Sociedades)
  const profileEl = document.getElementById('tax-profile-opt') || document.getElementById('modal-tax-profile-opt');
  const customerProfile = (profileEl && profileEl.value) ? profileEl.value : ((_commTax && _commTax.customerProfile) || 'particular');

  // ── VERIFICACIÓN FISCAL IVA REDUCIDO 10% (Art. 91.Uno.2.10º / Art. 91.Uno.3.1º Ley 37/1992 LIVA) ──
  const isRehab10 = (ivaOptRaw === '0.10_rehab');
  const isRenovacion10 = (Math.abs(ivaRate - 0.10) < 0.001 && !isRehab10);

  const homeAgeChk = document.getElementById('modal-tax-iva-home-age') || document.getElementById('tax-iva-home-age');
  const homeAge2Years = homeAgeChk
    ? Boolean(homeAgeChk.checked)
    : ((_ssotCfg.taxSettings && typeof _ssotCfg.taxSettings.ivaHomeAge2Years === 'boolean') ? _ssotCfg.taxSettings.ivaHomeAge2Years : true);

  const marginLaborChk = document.getElementById('modal-tax-iva-margin-labor') || document.getElementById('tax-iva-margin-labor');
  const marginOnLaborOnly = isRenovacion10 && (marginLaborChk
    ? Boolean(marginLaborChk.checked)
    : ((_ssotCfg.taxSettings && typeof _ssotCfg.taxSettings.ivaMarginLaborOnly === 'boolean') ? _ssotCfg.taxSettings.ivaMarginLaborOnly : false));

  let materialAddonsCost = 0;
  let serviceAddonsCost = 0;
  if (commercialCfg) {
    const SERVICE_ADDON_IDS = { crane_lift: true, municipal_tax: true, virtual_bat: true, maint_annual: true };
    const allAddonsList = (commercialCfg.addons || []).concat(commercialCfg.customAddons || []);
    let splitSum = 0;
    allAddonsList.forEach(function(item) {
      if (!item || !item.enabled) return;
      const q = Number(item.qty) || 1;
      const p = Number(item.unitPrice) || 0;
      const lineTotal = q * p;
      splitSum += lineTotal;
      const isService = (item.isService === true)
        || (item.category === 'service')
        || (item.type === 'service')
        || (item.category !== 'material' && item.isService !== false && !!SERVICE_ADDON_IDS[item.id]);
      if (isService) {
        serviceAddonsCost += lineTotal;
      } else {
        materialAddonsCost += lineTotal;
      }
    });
    if (Math.abs(splitSum - addonsCost) > 0.01) {
      materialAddonsCost = Math.max(0, addonsCost - serviceAddonsCost);
    }
  } else {
    materialAddonsCost = addonsCost;
  }

  const costeMaterialesDirecto = Math.round(panCost + est + inv + bat + cab + windCost + materialAddonsCost);
  const costeServiciosDirecto = Math.round(mo + leg + serviceAddonsCost);
  const discScale = (subtotalPreDiscount > 0) ? (subtotal / subtotalPreDiscount) : 1;

  let baseMateriales = 0;
  if (marginOnLaborOnly) {
    // El margen comercial se imputa mayoritariamente/íntegramente sobre Mano de Obra, Instalación e Ingeniería
    baseMateriales = Math.min(subtotal, Math.max(0, Math.round(costeMaterialesDirecto * discScale)));
  } else {
    // El margen comercial se reparte proporcionalmente entre materiales y mano de obra
    const totalDirectWithAddons = Math.max(1, costeMaterialesDirecto + costeServiciosDirecto);
    baseMateriales = Math.min(subtotal, Math.max(0, Math.round(subtotal * (costeMaterialesDirecto / totalDirectWithAddons))));
  }
  const baseServicios = Math.max(0, subtotal - baseMateriales);
  const pctMateriales = subtotal > 0 ? (baseMateriales / subtotal) * 100 : 0;
  const maxMateriales40Eur = Math.floor(subtotal * 0.40);
  const excesoMaterialesEur = Math.max(0, baseMateriales - maxMateriales40Eur);

  const ivaReasons = [];
  if (isRenovacion10) {
    if (customerProfile !== 'particular') {
      ivaReasons.push('Cliente figura como Empresa/Pyme (se exige Persona Física uso particular)');
    }
    if (!homeAge2Years) {
      ivaReasons.push('Vivienda con menos de 2 años desde construcción o rehabilitación');
    }
    if (pctMateriales > 40.001) {
      ivaReasons.push(`Materiales aportados (${pctMateriales.toFixed(1)}%) superan el 40% de la Base Imponible (+${excesoMaterialesEur.toLocaleString('es-ES')} € sobre tope de ${maxMateriales40Eur.toLocaleString('es-ES')} €)`);
    }
  }
  const ivaCompliance = {
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

  const ibiCuota = _input('tax-ibi-cuota', (_commTax.ibiAnualEur !== undefined ? _commTax.ibiAnualEur : 650));
  const ibiOpt = _sel('tax-ibi-opt', (_commTax.ibiYears === 5 ? '0.50_5' : (_commTax.ibiYears === 10 ? '0.50_10' : (_commTax.ibiYears === 3 ? '0.50_3' : '0.50_3'))));
  let ahorroIBITotal = 0;
  let ibiFormulaStr = '';
  if (soilType === 'rustico') {
    ahorroIBITotal = 0;
    ibiFormulaStr = 'IBI: 0 € (Finca rústica / Suelo no urbano sin bonificación municipal)';
  } else if (_commTax.ibiEnabled === false || ibiOpt === '0') {
    ahorroIBITotal = 0;
    ibiFormulaStr = 'IBI: 0% sin bonificación municipal';
  } else if (ibiOpt === '0.50_3') {
    ahorroIBITotal = Math.round(ibiCuota * 0.50 * 3);
    ibiFormulaStr = `IBI: ${ibiCuota} €/año × 50% × 3 años = ${ahorroIBITotal} €`;
  } else if (ibiOpt === '0.50_5') {
    ahorroIBITotal = Math.round(ibiCuota * 0.50 * 5);
    ibiFormulaStr = `IBI: ${ibiCuota} €/año × 50% × 5 años = ${ahorroIBITotal} €`;
  } else if (ibiOpt === '0.50_10') {
    ahorroIBITotal = Math.round(ibiCuota * 0.50 * 10);
    ibiFormulaStr = `IBI: ${ibiCuota} €/año × 50% × 10 años (TRLRHL) = ${ahorroIBITotal} €`;
  } else if (ibiOpt === '0.30_3') {
    ahorroIBITotal = Math.round(ibiCuota * 0.30 * 3);
    ibiFormulaStr = `IBI: ${ibiCuota} €/año × 30% × 3 años = ${ahorroIBITotal} €`;
  } else if (ibiOpt === '0.25_5') {
    ahorroIBITotal = Math.round(ibiCuota * 0.25 * 5);
    ibiFormulaStr = `IBI: ${ibiCuota} €/año × 25% × 5 años = ${ahorroIBITotal} €`;
  } else if (_commTax.ibiBonifPct && _commTax.ibiYears) {
    ahorroIBITotal = Math.round(ibiCuota * (_commTax.ibiBonifPct / 100.0) * _commTax.ibiYears);
    ibiFormulaStr = `IBI: ${ibiCuota} €/año × ${_commTax.ibiBonifPct}% × ${_commTax.ibiYears} años = ${ahorroIBITotal} €`;
  }

  // Deducción IRPF Estatal (RD-ley 19/2021)
  const irpfEl = document.getElementById('tax-irpf-opt') || document.getElementById('modal-tax-irpf-opt');
  const irpfOptVal = irpfEl ? String(irpfEl.value) : '';
  let irpfPct = parseFloat(irpfOptVal);
  if (!Number.isFinite(irpfPct) && _commTax.irpfEnabled !== false && typeof _commTax.irpfPct === 'number') {
    irpfPct = _commTax.irpfPct / 100.0;
  }
  if (!Number.isFinite(irpfPct)) irpfPct = 0;

  // Límites de base máxima según RD-ley 19/2021
  let maxBaseIrpf = 5000;
  if (irpfOptVal === '0.60' || (!irpfOptVal && irpfPct >= 0.50)) {
    maxBaseIrpf = 15000;
  } else if (irpfOptVal === '0.40' || (!irpfOptVal && irpfPct >= 0.30)) {
    maxBaseIrpf = 7500;
  } else {
    maxBaseIrpf = 5000;
  }
  if (!irpfOptVal && _commTax.irpfMaxBaseEur && _commTax.irpfMaxBaseEur > 0) {
    maxBaseIrpf = _commTax.irpfMaxBaseEur;
  }
  // Ayudas directas o Certificados de Ahorro Energético (CAEs) — DA 50ª.4 LIRPF: se restan de la base de deducción IRPF
  const caeInp = document.getElementById('tax-cae-eur') || document.getElementById('modal-tax-cae-eur');
  const ahorroCAE = (caeInp && parseFloat(caeInp.value) > 0) ? parseFloat(caeInp.value) : (_commTax.caeEur || 0);
  const baseIrpfNeta = Math.max(0, capexBruto - ahorroCAE);
  const baseIrpfEstatal = Math.min(baseIrpfNeta, maxBaseIrpf);
  let ahorroIRPFEstatal = (_commTax.irpfEnabled === false || customerProfile === 'empresa') ? 0 : Math.round(baseIrpfEstatal * irpfPct);

  // Tramo Autonómico IRPF según CCAA
  const regionEl = document.getElementById('tax-region-opt') || document.getElementById('modal-tax-region-opt');
  const regionOpt = (regionEl && regionEl.value) ? regionEl.value : (_commTax.regionOpt || 'estatal_only');
  let ahorroIRPFAutonomico = 0;
  let autoFormulaStr = '';

  if (customerProfile === 'particular' && regionOpt !== 'estatal_only') {
    if (regionOpt === 'valencia') {
      const baseAuto = Math.min(baseIrpfNeta, 8000);
      ahorroIRPFAutonomico = Math.round(baseAuto * 0.40);
      autoFormulaStr = `IRPF Comunitat Valenciana: 40% s/ base máx. ${baseAuto.toLocaleString('es-ES')} € = ${ahorroIRPFAutonomico} €`;
    } else if (regionOpt === 'galicia') {
      const baseAuto = Math.min(baseIrpfNeta, 9000);
      ahorroIRPFAutonomico = Math.round(baseAuto * 0.20);
      autoFormulaStr = `IRPF Galicia: 20% s/ base máx. ${baseAuto.toLocaleString('es-ES')} € = ${ahorroIRPFAutonomico} €`;
    } else if (regionOpt === 'baleares') {
      const baseAuto = Math.min(baseIrpfNeta, 10000);
      ahorroIRPFAutonomico = Math.round(baseAuto * 0.50);
      autoFormulaStr = `IRPF Illes Balears: 50% s/ base máx. ${baseAuto.toLocaleString('es-ES')} € = ${ahorroIRPFAutonomico} €`;
    } else if (regionOpt === 'murcia') {
      const baseAuto = Math.min(baseIrpfNeta, 10000);
      ahorroIRPFAutonomico = Math.min(Math.round(baseAuto * 0.10), 1000);
      autoFormulaStr = `IRPF Región de Murcia: 10% (tope 1.000 €) = ${ahorroIRPFAutonomico} €`;
    } else if (regionOpt === 'castillaleon') {
      const baseAuto = Math.min(baseIrpfNeta, 10000);
      ahorroIRPFAutonomico = Math.min(Math.round(baseAuto * 0.15), 2000);
      autoFormulaStr = `IRPF Castilla y León: 15% (tope 2.000 €) = ${ahorroIRPFAutonomico} €`;
    }
  }

  const ahorroIRPF = ahorroIRPFEstatal + ahorroIRPFAutonomico;

  // Impuesto sobre Sociedades: Libertad de Amortización (DA 17ª LIS / RDL 18/2022) para Empresas
  const isEl = document.getElementById('tax-is-opt') || document.getElementById('modal-tax-is-opt');
  let isRate = (isEl && isEl.value !== undefined && isEl.value !== '') ? parseFloat(isEl.value) : undefined;
  if (!Number.isFinite(isRate) && _commTax && typeof _commTax.isRate === 'number') {
    isRate = _commTax.isRate;
  }
  if (!Number.isFinite(isRate)) isRate = (customerProfile === 'empresa' ? 0.25 : 0);

  let ahorroSociedades = 0;
  let isFormulaStr = '';
  if (customerProfile === 'empresa' && isRate > 0) {
    ahorroSociedades = Math.round(subtotal * isRate);
    isFormulaStr = `Sociedades (LIS DA 17ª): Subtotal ${subtotal.toLocaleString('es-ES')} € × ${Math.round(isRate * 100)}% = ${ahorroSociedades} €`;
  }

  // Bonificación ICIO
  const icioPct = _input('tax-icio-opt', (_commTax.icioBonifPct ? _commTax.icioBonifPct / 100.0 : 0.95));
  const tasaICIO = designCosts && designCosts.icioTaxEur > 0 ? designCosts.icioTaxEur : Math.round(directCost * 0.035);
  const ahorroICIO = Math.round(tasaICIO * icioPct);
  const icioFormulaStr = `ICIO: Tasa estimada ${tasaICIO} € × ${Math.round(icioPct * 100)}% bonif. = ${ahorroICIO} €`;

  // [SSOT Contable] Deducción directa en el proyecto según perfil fiscal (IBI + IRPF/Sociedades + Ayudas/CAEs)
  const ahorroDeduccionDirecta = (customerProfile === 'empresa') ? ahorroSociedades : ahorroIRPF;
  const totalAhorroFiscal = ahorroIBITotal + ahorroDeduccionDirecta + ahorroCAE;
  const capexNeto = Math.max(capexBruto - totalAhorroFiscal, 100);

  // Generar líneas de fórmulas transparentes para la UI
  const taxFormulaLines = [];
  if (isRenovacion10) {
    taxFormulaLines.push(`IVA Reducido 10% (Art. 91.Uno.2.10º LIVA): Materiales = ${baseMateriales.toLocaleString('es-ES')} € (${pctMateriales.toFixed(1)}% s/ B.I. ${subtotal.toLocaleString('es-ES')} € · Tope legal ≤40%: ${maxMateriales40Eur.toLocaleString('es-ES')} €) → ${ivaCompliance.isCompliant ? 'CUMPLE' : 'EXCEDE TOPE / REVISAR'}`);
  } else if (isRehab10) {
    taxFormulaLines.push(`IVA Reducido 10% (Rehabilitación Estructural / Obra Nueva Promotor): Sin tope del 40% en materiales (${pctMateriales.toFixed(1)}% s/ B.I.)`);
  }
  if (customerProfile === 'particular') {
    if (irpfPct > 0) {
      if (ahorroCAE > 0) {
        taxFormulaLines.push(`IRPF Estatal (RD-ley 19/2021 · DA 50ª.4): ${Math.round(irpfPct * 100)}% s/ base neta (${capexBruto.toLocaleString('es-ES')} − ${ahorroCAE.toLocaleString('es-ES')} € subv., máx. ${maxBaseIrpf.toLocaleString('es-ES')} €) = ${ahorroIRPFEstatal.toLocaleString('es-ES')} €`);
      } else {
        taxFormulaLines.push(`IRPF Estatal (RD-ley 19/2021): ${Math.round(irpfPct * 100)}% s/ base máx. ${baseIrpfEstatal.toLocaleString('es-ES')} € = ${ahorroIRPFEstatal.toLocaleString('es-ES')} €`);
      }
      if (isOffGrid) {
        taxFormulaLines.push('Aviso Aislada: Deducción IRPF condicionada a CEE previo o sustitución de grupo electrógeno');
      }
    } else {
      taxFormulaLines.push(`IRPF Estatal: 0 € (Sin certificado CEE seleccionado)`);
    }
    if (autoFormulaStr) taxFormulaLines.push(autoFormulaStr);
  } else {
    taxFormulaLines.push(isFormulaStr || 'Sociedades: Sin libertad de amortización');
  }
  if (ibiFormulaStr) taxFormulaLines.push(ibiFormulaStr);
  if (ahorroCAE > 0) taxFormulaLines.push(`Ayudas / CAEs: Subvención directa asignada = ${ahorroCAE.toLocaleString('es-ES')} €`);
  taxFormulaLines.push(icioFormulaStr);

  // Autarquía según presencia de batería — con despacho horario y TOU
  // [SSOT] Capacidad de batería desde el catálogo cuando hay selección (antes sólo el input).
  const _batCapSel = (_batSel && _batSel.kwh > 0) ? _batSel : null;
  const _batCapCount = (_batCapSel && _ssotCfg.autoSizing && _ssotCfg.autoSizing.batteries && _ssotCfg.autoSizing.batteries.count) ? _ssotCfg.autoSizing.batteries.count : 1;
  const batCap = _batCapSel ? (_batCapSel.kwh * _batCapCount) : _input('cfg-pres-bat-opt', 0);
  const touTarifa = _sel('fin-tou-tarifa', 'plana');
  const batStrategy = _sel('fin-bat-strategy', 'autoconsumo');

  // Perfiles TOU (€/kWh) por hora 0..23 — media peninsular 2024
  const TOU_PROFILES = {
    plana:      { name: 'Tarifa Plana',       horas: Array(24).fill(0.18), compensacion: 0.09 },
    '2periodos':{ name: '2 Periodos D/N',     horas: Array(24).fill(0.13).map((v, i) => (i >= 8 && i < 23) ? 0.22 : v), compensacion: 0.09 },
    '3periodos':{ name: '3 Periodos PVPC',    horas: [0.10,0.10,0.10,0.10,0.10,0.10,0.11,0.12,0.17,0.19,0.22,0.26,0.27,0.26,0.24,0.23,0.25,0.28,0.30,0.27,0.22,0.17,0.13,0.11], compensacion: 0.07 },
    mercado:    { name: 'Precio Mercado 2024',horas: [0.085,0.077,0.072,0.068,0.070,0.078,0.095,0.115,0.128,0.135,0.142,0.155,0.162,0.158,0.148,0.139,0.151,0.172,0.196,0.214,0.238,0.247,0.231,0.205], compensacion: 0.05 }
  };
  const _rawTou = TOU_PROFILES[touTarifa] || TOU_PROFILES.plana;
  const _billPriceEl = (typeof document !== 'undefined') ? document.getElementById('step3-bill-price-kwh') : null;
  const _billPriceDom = (_billPriceEl && parseFloat(_billPriceEl.value) > 0) ? parseFloat(_billPriceEl.value) : 0;
  const _customPriceKwh = (_ssotCfg && typeof _ssotCfg.precioMedioKWh === 'number' && _ssotCfg.precioMedioKWh > 0)
    ? _ssotCfg.precioMedioKWh
    : _billPriceDom;
  const tou = (_customPriceKwh > 0)
    ? (function () {
        const baseAvg = _rawTou.horas.reduce((a, b) => a + b, 0) / _rawTou.horas.length;
        const scale = baseAvg > 0 ? (_customPriceKwh / baseAvg) : 1;
        return {
          name: _rawTou.name,
          horas: (touTarifa === 'plana') ? Array(24).fill(_customPriceKwh) : _rawTou.horas.map(v => v * scale),
          compensacion: Number((_rawTou.compensacion * scale).toFixed(4))
        };
      })()
    : _rawTou;

  const _hdRef = (typeof window !== 'undefined' && window.RAWind && window.RAWind.HybridDispatch) ? window.RAWind.HybridDispatch : null;

  // Perfil solar horario normalizado (kWh por kWh diario producido)
  const SOLAR_PROFILE = [0.00,0.00,0.00,0.00,0.00,0.00,0.02,0.05,0.08,0.10,0.11,0.11,0.10,0.09,0.08,0.06,0.04,0.02,0.00,0.00,0.00,0.00,0.00,0.00];

  // Curva de consumo horaria normalizada según perfil (SSOT compartido con wind-hybrid-dispatch.js)
  const rawLoadProfile = (_hdRef && _hdRef.LOAD_PROFILES)
    ? ((customerProfile === 'empresa') ? _hdRef.LOAD_PROFILES.commercial_industrial : _hdRef.LOAD_PROFILES.residential)
    : ((customerProfile === 'empresa')
      ? [0.015,0.014,0.014,0.014,0.015,0.018,0.028,0.052,0.078,0.088,0.088,0.086,0.082,0.072,0.068,0.072,0.070,0.064,0.052,0.038,0.028,0.022,0.018,0.016]
      : [0.030,0.025,0.022,0.020,0.020,0.028,0.040,0.050,0.045,0.035,0.032,0.035,0.038,0.032,0.030,0.038,0.050,0.065,0.070,0.062,0.052,0.048,0.042,0.036]);
  const sumRawLoad = rawLoadProfile.reduce((a, b) => a + b, 0) || 1;
  const LOAD_PROFILE = rawLoadProfile.map(v => v / sumRawLoad);

  // [P0] Consumo anual y reparto mensual real desde Auditoría de Factura (bill-auditor) cuando exista,
  // o consumo manual definido por el usuario, o perfil estándar desacoplado del tamaño del campo solar.
  const billAud = (typeof window !== 'undefined' && window.RA && window.RA.billAuditor) ? window.RA.billAuditor : null;
  const billComp = (billAud && billAud.comparison) ? billAud.comparison : null;
  const manualConsKwh = _input('cfg-pres-consumo-anual', 0) || (typeof window !== 'undefined' && window.solarProjectConfig && window.solarProjectConfig.manualAnnualConsumptionKWh) || 0;
  const defaultBaseConsKwh = (kwp >= 12) ? 18000 : 4500;
  let consumoAnual = (billComp && Number.isFinite(billComp.consumoAnualKWh) && billComp.consumoAnualKWh > 0)
    ? billComp.consumoAnualKWh
    : (manualConsKwh > 0 ? manualConsKwh : defaultBaseConsKwh);

  // ── FASE 5: Despacho Multi-horario Estacional Bancable (12 meses × 24h = 288 horas) ──
  const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const MONTH_LOAD_WEIGHTS = (_hdRef && Array.isArray(_hdRef.MONTH_LOAD_WEIGHTS) && _hdRef.MONTH_LOAD_WEIGHTS.length === 12)
    ? _hdRef.MONTH_LOAD_WEIGHTS
    : [1.18, 1.12, 1.02, 0.92, 0.84, 0.88, 1.06, 1.02, 0.94, 0.94, 1.02, 1.16]; // Climatización estacional peninsular
  const _wLoadNorm = MONTH_LOAD_WEIGHTS.reduce((acc, w, idx) => acc + w * MONTH_DAYS[idx], 0) / 365.0 || 1.0;

  let monthlyConsSource = 'seasonal_weights';
  let monthlyConsKwh = MONTH_LOAD_WEIGHTS.map((w, m) => (consumoAnual / 365.0) * (w / _wLoadNorm) * MONTH_DAYS[m]);
  const _billMonthlyTrace = (billAud && typeof billAud.getMonthlyConsumptionKWh === 'function')
    ? billAud.getMonthlyConsumptionKWh(consumoAnual)
    : null;
  const _cfgBillMonthly = (typeof window !== 'undefined' && window.solarProjectConfig && window.solarProjectConfig.billMonthlyConsumptionKWh && Array.isArray(window.solarProjectConfig.billMonthlyConsumptionKWh.monthlyKWh) && window.solarProjectConfig.billMonthlyConsumptionKWh.monthlyKWh.length === 12)
    ? window.solarProjectConfig.billMonthlyConsumptionKWh
    : null;
  if (_billMonthlyTrace && _billMonthlyTrace.hasMonthlyData && Array.isArray(_billMonthlyTrace.monthlyKWh) && _billMonthlyTrace.monthlyKWh.length === 12) {
    monthlyConsKwh = _billMonthlyTrace.monthlyKWh.map(v => Math.max(0, Number(v) || 0));
    monthlyConsSource = _billMonthlyTrace.source || 'bill_monthly';
    const sumAuditedMonths = monthlyConsKwh.reduce((a, b) => a + b, 0);
    if (sumAuditedMonths > 0) consumoAnual = sumAuditedMonths;
  } else if (billComp && Array.isArray(billComp.monthlyConsumptionKWh) && billComp.monthlyConsumptionKWh.length === 12 && billComp.monthlyConsumptionSource && billComp.monthlyConsumptionSource !== 'seasonal_weights') {
    monthlyConsKwh = billComp.monthlyConsumptionKWh.map(v => Math.max(0, Number(v) || 0));
    monthlyConsSource = billComp.monthlyConsumptionSource;
    const sumAuditedMonths = monthlyConsKwh.reduce((a, b) => a + b, 0);
    if (sumAuditedMonths > 0) consumoAnual = sumAuditedMonths;
  } else if (_cfgBillMonthly) {
    monthlyConsKwh = _cfgBillMonthly.monthlyKWh.map(v => Math.max(0, Number(v) || 0));
    monthlyConsSource = _cfgBillMonthly.source || 'bill_monthly';
    const sumAuditedMonths = monthlyConsKwh.reduce((a, b) => a + b, 0);
    if (sumAuditedMonths > 0 && !(billComp && billComp.consumoAnualKWh > 0)) consumoAnual = sumAuditedMonths;
  }

  // Producción mensual solar + eólica en kWh (respetando annualHeatmapDirty)
  let monthlySource = isHeatmapDirty ? 'physical-monthly' : 'simulation';
  let monthlySolarKwh = new Array(12).fill(0);
  const _ssotSolarStats = (typeof window !== 'undefined' && window.RA && window.RA.solarStats) ? window.RA.solarStats : null;
  if (!isHeatmapDirty && typeof window !== 'undefined' && window.solarSimState && Array.isArray(window.solarSimState.monthlyKwh) && window.solarSimState.monthlyKwh.length === 12 && window.solarSimState.monthlyKwh.some(v => v > 0)) {
    monthlySolarKwh = window.solarSimState.monthlyKwh.slice();
  } else if (!isHeatmapDirty && _ssotSolarStats && Array.isArray(_ssotSolarStats.monthlyYields) && _ssotSolarStats.monthlyYields.length === 12 && _ssotSolarStats.monthlyYields.some(v => v > 0)) {
    monthlySource = _ssotSolarStats.hasSimulation ? 'simulation' : 'physical-monthly';
    const rawArr = _ssotSolarStats.monthlyYields.map(v => Math.max(0, Number(v) || 0));
    const rawSum = rawArr.reduce((a, b) => a + b, 0);
    const scaleS = (rawSum > 0 && solarYieldKWh > 0) ? (solarYieldKWh / rawSum) : 1.0;
    monthlySolarKwh = rawArr.map(v => v * scaleS);
  } else if (Array.isArray(d.monthly) && d.monthly.length === 12 && d.monthly.some(mo => (mo && mo.kWh > 0))) {
    monthlySource = 'physical-monthly';
    const dArr = d.monthly.map(mo => Math.max(0, Number(mo && mo.kWh) || 0));
    const dSum = dArr.reduce((a, b) => a + b, 0);
    const scaleD = (dSum > 0 && solarYieldKWh > 0) ? (solarYieldKWh / dSum) : 1.0;
    monthlySolarKwh = dArr.map(v => v * scaleD);
  } else {
    monthlySource = 'fallback-weights';
    const solarWeights = (_hdRef && Array.isArray(_hdRef.MONTHLY_SOLAR_WEIGHTS) && _hdRef.MONTHLY_SOLAR_WEIGHTS.length === 12)
      ? _hdRef.MONTHLY_SOLAR_WEIGHTS
      : [0.045, 0.058, 0.082, 0.098, 0.118, 0.126, 0.132, 0.120, 0.095, 0.068, 0.046, 0.032];
    const wSolSum = solarWeights.reduce((a, b) => a + b, 0) || 1;
    monthlySolarKwh = solarWeights.map(w => (w / wSolSum) * solarYieldKWh);
  }

  // Eólica mensual y ciclo diurno alineados con wind-resource.js y wind-hybrid-dispatch.js (SSOT)
  const MONTHLY_WIND_WEIGHTS = (_hdRef && Array.isArray(_hdRef.MONTHLY_WIND_WEIGHTS) && _hdRef.MONTHLY_WIND_WEIGHTS.length === 12)
    ? _hdRef.MONTHLY_WIND_WEIGHTS
    : [0.105, 0.098, 0.095, 0.088, 0.078, 0.068, 0.064, 0.064, 0.070, 0.082, 0.090, 0.098];
  const rawDiurnalWind = (_hdRef && Array.isArray(_hdRef.DIURNAL_WIND_FACTORS) && _hdRef.DIURNAL_WIND_FACTORS.length === 24)
    ? _hdRef.DIURNAL_WIND_FACTORS
    : [
      1.18, 1.20, 1.22, 1.20, 1.15, 1.10,
      1.00, 0.92, 0.85, 0.82, 0.84, 0.88,
      0.95, 1.02, 1.08, 1.12, 1.15, 1.14,
      1.12, 1.10, 1.11, 1.14, 1.16, 1.17
    ];
  const sumDiurnalWind = rawDiurnalWind.reduce((a, b) => a + b, 0) || 24;
  const WIND_HOURLY_PROFILE = rawDiurnalWind.map(v => v / sumDiurnalWind);

  let monthlyWindKwh = new Array(12).fill(0);
  if (windYieldKWh > 0) {
    if (wPark && Array.isArray(wPark.monthlyKwh) && wPark.monthlyKwh.length === 12 && wPark.monthlyKwh.some(v => v > 0)) {
      const wRaw = wPark.monthlyKwh.map(v => Math.max(0, Number(v) || 0));
      const wRawSum = wRaw.reduce((a, b) => a + b, 0);
      const wScale = wRawSum > 0 ? (windYieldKWh / wRawSum) : 1.0;
      monthlyWindKwh = wRaw.map(v => v * wScale);
    } else {
      const wSum = MONTHLY_WIND_WEIGHTS.reduce((a, b) => a + b, 0) || 1.0;
      monthlyWindKwh = MONTHLY_WIND_WEIGHTS.map(w => (w / wSum) * windYieldKWh);
    }
  }

  // Normalización del perfil solar por mes en hora oficial española (alineado con wind-hybrid-dispatch.js)
  const _siteLatFin = (d && d.cfg && typeof d.cfg.lat === 'number' && !isNaN(d.cfg.lat)) ? d.cfg.lat : 40.4;
  const getMonthlySolarProfile = (m) => {
    if (_hdRef && typeof _hdRef.getMonthlySolarShape24h === 'function') {
      return _hdRef.getMonthlySolarShape24h(m, _siteLatFin);
    }
    const latRad = _siteLatFin * Math.PI / 180;
    const midDoy = [15, 45, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349][m] || 180;
    const declRad = (23.44 * Math.PI / 180) * Math.sin((2 * Math.PI / 365) * (midDoy - 81));
    const cosWs = Math.max(-0.96, Math.min(0.96, -Math.tan(latRad) * Math.tan(declRad)));
    const halfDayLen = (Math.acos(cosWs) * 180 / Math.PI) / 15.0;
    const isDST = (m >= 3 && m <= 9);
    const solarNoonClock = isDST ? 14.15 : 13.25;
    const sunrise = solarNoonClock - halfDayLen;
    const sunset = solarNoonClock + halfDayLen;
    const span = Math.max(sunset - sunrise, 2.0);
    const profile = new Array(24).fill(0);
    let sum = 0;
    for (let h = 0; h < 24; h++) {
      if (h + 0.5 > sunrise && h + 0.5 < sunset) {
        const val = Math.sin(Math.PI * (h + 0.5 - sunrise) / span);
        if (val > 0) {
          profile[h] = Math.pow(val, 1.2);
          sum += profile[h];
        }
      }
    }
    return sum > 0 ? profile.map(v => v / sum) : SOLAR_PROFILE;
  };

  // Parámetros físicos de batería (IEC 62619 / LFP residencial)
  const batEff = 0.92;                      // Eficiencia roundtrip (92%)
  const batEffHalf = Math.sqrt(batEff);     // Eficiencia simétrica en carga/descarga (~95.9%)
  const batDOD = 0.90;                      // Profundidad de descarga (90%)
  const maxBatCap = batCap * batDOD;         // Capacidad útil real (kWh)
  const pBatMaxKw = Math.max(3.0, batCap * 0.5); // Límite de potencia C/2 (kW)
  let batSoC = 0.0;                         // SoC inicial (kWh útiles)
  const hasVirtualBattery = !!(typeof window !== 'undefined' && window.solarProjectConfig && window.solarProjectConfig.hasVirtualBattery);

  let annualAutoconsumoDirecto = 0;
  let annualBateriaKWh = 0;
  let annualExcedenteKWh = 0;
  let annualCosteRed = 0;
  let annualCosteCargaRed = 0;
  let annualIngresoExcedente = 0;
  let annualIngresoExcedenteEfectivo = 0;
  let annualCosteSinFV = 0;
  const monthlyEnergyBreakdown = [];

  for (let m = 0; m < 12; m++) {
    const daysInMonth = MONTH_DAYS[m];
    const solarMonthKwh = monthlySolarKwh[m];
    const windMonthKwh = monthlyWindKwh[m] || 0;
    const solarDailyKwh = solarMonthKwh / daysInMonth;
    const windDailyKwh = windMonthKwh / daysInMonth;
    const solarHourlyProfile = getMonthlySolarProfile(m);

    const loadMonthKwh = Math.max(0, Number(monthlyConsKwh[m]) || 0);
    const loadDailyKwh = loadMonthKwh / daysInMonth;

    let monthDirect = 0;
    let monthBattery = 0;
    let monthSurplus = 0;
    let monthGridBuy = 0;
    let monthCostGrid = 0;
    let monthGridChargeCost = 0;
    let monthSurplusIncome = 0;
    let monthCostSinFV = 0;

    for (let h = 0; h < 24; h++) {
      const pv = (solarDailyKwh * solarHourlyProfile[h]) + (windDailyKwh * WIND_HOURLY_PROFILE[h]);
      const load = loadDailyKwh * LOAD_PROFILE[h];
      const price = tou.horas[h];
      const isValley = price <= Math.min(...tou.horas) * 1.15;

      monthCostSinFV += load * price;

      let direct = Math.min(pv, load);
      let surplus = pv - direct;
      let fromBattery = 0;
      let gridBuy = 0;

      // Carga de batería con excedente solar (limitada por espacio y potencia máxima)
      if (surplus > 0 && maxBatCap > 0 && batSoC < maxBatCap) {
        const space = maxBatCap - batSoC;
        const maxCharge = pBatMaxKw * 1.0;
        const charge = Math.min(surplus, space, maxCharge);
        batSoC += charge * batEffHalf;
        surplus -= charge;
      }

      // Arbitraje en valle (si está activo)
      if (batStrategy === 'arbitraje' && maxBatCap > 0 && batSoC < maxBatCap && isValley && h >= 2 && h <= 6) {
        const space = maxBatCap - batSoC;
        const gridCharge = Math.min(space, pBatMaxKw * 1.0);
        batSoC += gridCharge * batEffHalf;
        monthGridChargeCost += gridCharge * price;
      }

      // Descarga de batería si hay déficit (con eficiencia electroquímica de descarga)
      if (direct < load) {
        const need = load - direct;
        if (batSoC > 0.01) {
          const maxDischarge = pBatMaxKw * 1.0;
          // Para entregar 'need' de energía útil, se descuenta de SoC considerando batEffHalf
          const reqFromSoC = need / batEffHalf;
          const dischargeFromSoC = Math.min(reqFromSoC, batSoC, maxDischarge / batEffHalf);
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

    const monthCostGridTotal = monthCostGrid * daysInMonth;
    const monthSurplusIncomeTotal = monthSurplusIncome * daysInMonth;
    const monthEffectiveSurplusIncome = hasVirtualBattery ? monthSurplusIncomeTotal : Math.min(monthSurplusIncomeTotal, monthCostGridTotal);

    const mGenKwh = Math.round(solarMonthKwh + windMonthKwh);
    const mDirectKwh = Math.round(monthDirect * daysInMonth);
    const mBatKwh = Math.round(monthBattery * daysInMonth);
    const mAutoTotalKwh = Math.min(mGenKwh, Math.max(0, mDirectKwh + mBatKwh));
    const mSurplusKwh = Math.max(0, Math.round(monthSurplus * daysInMonth));
    const mConsKwh = Math.round(loadMonthKwh);
    const mGridBuyKwh = Math.round(monthGridBuy * daysInMonth);

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

  // Desglose medio diario equivalente para compatibilidad y telemetría
  const totalBateria = annualBateriaKWh / 365.0;
  const totalExcedente = annualExcedenteKWh / 365.0;
  const costeRed = annualCosteRed / 365.0;
  const costeCargaRed = annualCosteCargaRed / 365.0;
  const ingresoExcedente = annualIngresoExcedente / 365.0;

  // Precio medio ponderado de la tarifa y compensación
  const precioRed = tou.horas.reduce((a, b) => a + b, 0) / tou.horas.length;
  const precioCompensacion = tou.compensacion;

  // [P0.3 - RD 244/2019] Techo legal en compensación simplificada mensual: el saldo de energía no es negativo por ciclo
  const ingresoExcedenteEfectivo = annualIngresoExcedenteEfectivo / 365.0;

  // El ahorro anual en factura eléctrica compara el coste anual de red sin FV vs con FV
  const ahorroLuzAnio1 = Math.max(0, annualCosteSinFV - (annualCosteRed - annualIngresoExcedenteEfectivo + annualCosteCargaRed));
  const autarquia = Math.min((annualAutoconsumoDirecto + annualBateriaKWh) / Math.max(1, consumoAnual), 1.0);

  // Flujo de Caja a 25 años
  const inflacion = 0.03; // Inflación luz 3%/año

  // ── INTEGRACIÓN CEL EN FLUJO DE CAJA Y CURVA DE AMORTIZACIÓN ──────────────
  const _pssState = (typeof window !== 'undefined' && window.RAProposalStyleStudio && typeof window.RAProposalStyleStudio.getFullStudioState === 'function')
    ? window.RAProposalStyleStudio.getFullStudioState()
    : null;
  const _finStudioCfg = _pssState ? _pssState.activeConfig : (_studioCfg || ((typeof window !== 'undefined' && window.solarProposalStudioConfig) ? window.solarProposalStudioConfig : null));
  const _commCfg = (typeof RAPricing !== 'undefined' && typeof RAPricing.getCommercialConfig === 'function')
    ? RAPricing.getCommercialConfig()
    : null;

  const isCelActive = (_commCfg && _commCfg.includeCEL === false)
    ? false
    : Boolean(
        (_finStudioCfg && _finStudioCfg.sectionsEnabled && _finStudioCfg.sectionsEnabled.cel) ||
        (_finStudioCfg && _finStudioCfg.installationModality === 'grid_surplus_cel') ||
        (_commCfg && _commCfg.includeCEL)
      );

  const celPriceEur = (_commCfg && typeof _commCfg.celPriceEur === 'number' && _commCfg.celPriceEur > 0)
    ? _commCfg.celPriceEur
    : 0.11;
  const poolPriceEur = (typeof precioCompensacion === 'number' && precioCompensacion > 0)
    ? precioCompensacion
    : 0.05;

  // Beneficio neto adicional de venta local CEL en Año 1 (€/año por encima del pool)
  const celExtraBenefitYear1 = isCelActive
    ? Math.max(0, Math.round(annualExcedenteKWh * Math.max(0, celPriceEur - poolPriceEur)))
    : 0;

  // ── FASE 2.1: Degradación Anual Acumulativa Rigurosa (IEC 61215 / BloombergNEF Tier-1) ──
  const catalog = (typeof equipmentCatalog !== 'undefined') ? equipmentCatalog : null;
  const projCfg = (typeof window !== 'undefined' && window.solarProjectConfig) ? window.solarProjectConfig : {};
  const activeModObj = (catalog && catalog.modules && projCfg.selectedModuleId)
    ? catalog.modules.find(m => m.id === projCfg.selectedModuleId)
    : null;

  const isBifacial = !!(activeModObj && (activeModObj.bifacial || activeModObj.isBifacial || activeModObj.bifacialityFactor > 0));
  const modTech = (activeModObj && activeModObj.tecnologia && (activeModObj.tecnologia.includes('N-Type') || activeModObj.tecnologia.includes('TOPCon')))
    ? 'TOPCON'
    : ((d.cfg && d.cfg.modelo && (d.cfg.modelo.includes('N-Type') || d.cfg.modelo.includes('TOPCon'))) ? 'TOPCON' : 'PERC');

  const catDegY1 = (activeModObj && (activeModObj.degradationYear1 || activeModObj.degYear1)) || null;
  const catDegAnn = (activeModObj && (activeModObj.degradationAnnual || activeModObj.degAnnual)) || null;
  const degYear1 = (catDegY1 != null) ? (catDegY1 > 0.05 ? catDegY1 / 100 : catDegY1) : (isBifacial || modTech === 'TOPCON' ? 0.010 : 0.015);
  const degAnnual = (catDegAnn != null) ? (catDegAnn > 0.05 ? catDegAnn / 100 : catDegAnn) : (isBifacial ? 0.0035 : (modTech === 'TOPCON' ? 0.0040 : 0.0050));

  const _lossCfg = (typeof window !== 'undefined' && window.solarLossConfig) ? window.solarLossConfig : null;
  const soilingFactor = (_lossCfg && typeof _lossCfg.soiling === 'number') ? _lossCfg.soiling : 0.025;

  const annualYields25 = [];
  const annualSavings25 = [];
  const degradationFactors25 = [];

  // ── FASE 2.2: OPEX Indexado a IPC y Reemplazo de Inversor Dinámico por Potencia ──
  const isMicro = (projCfg.selectedTopology === 'microinverter');
  const invCount = (projCfg.autoSizing && projCfg.autoSizing.inverters && projCfg.autoSizing.inverters.count) || 1;
  let curInvObj = null;
  if (catalog && projCfg.selectedInverterId) {
    curInvObj = (catalog.inverters && Array.isArray(catalog.inverters))
      ? catalog.inverters.find(i => i.id === projCfg.selectedInverterId)
      : null;
  }
  // Los microinversores tienen garantía de 25 años y no se sustituyen a los 12 años
  const singleInvPrice = (curInvObj && curInvObj.price) ? curInvObj.price : (inv > 0 ? (inv / invCount) : Math.max(850, kwp * 125 + (batCap > 0 ? 450 : 0)));
  const invBasePrice = isMicro ? 0 : (singleInvPrice * invCount);
  const ipcTech = 0.012; // 1.2%/año inflación neta de electrónica de potencia
  const invReplacementCost12 = isMicro ? 0 : Math.round(invBasePrice * Math.pow(1 + ipcTech, 12));

  // Reposición automática indexada de batería en Año 10 (garantía estándar LFP: 10 años / 6.000 ciclos)
  const batReplacementYear = 10;
  const ipcBat = -0.020; // -2.0%/año deflación tecnológica proyectada en módulos de almacenamiento
  const batBaseCost = (bat > 0) ? bat : (batCap > 0 ? (batCap * 380) : 0);
  const batReplacementCost10 = (batCap > 0 || bat > 0)
    ? Math.round(Math.min(batBaseCost * 0.70, (batCap || 5.0) * 220) * Math.pow(1 + ipcBat, batReplacementYear))
    : 0;

  // OPEX de año 1: Mantenimiento preventivo, monitorización y seguro (~1% subtotal o 15€/kWp)
  const opexYear1 = Math.max(90, Math.max(kwp * 15, subtotal * 0.01));
  const ipcOpex = 0.020; // 2.0%/año IPC servicios de mantenimiento

  const annualOpex25 = [];
  let totalOpex25 = 0;

  // ── FASE 2.3: Amortización Fiscal sin Duplicidad y Desglose de Flujos Netos Descontados (WACC 4%) ──
  const r = 0.04; // Tasa de descuento WACC 4.0% anual (coste de capital bancable)
  // [SSOT Contable] El desembolso inicial del proyecto llave en mano en Año 0 es el CAPEX Bruto
  // (las deducciones de IRPF e IBI entran como flujos positivos en los años 1 a N_ibi)
  const capexDesembolsoInicial = Math.max(capexBruto, 100);

  const financialSchedule25 = [];
  const discountedCashFlow25 = [];

  let cashflow = [-capexDesembolsoInicial];
  let acumulado = [-capexDesembolsoInicial];
  let cashflowSinCEL = [-capexDesembolsoInicial];
  let acumuladoSinCEL = [-capexDesembolsoInicial];
  let van = -capexDesembolsoInicial;
  let totalGenerado25 = 0;
  let totalCoste25 = capexDesembolsoInicial;
  let discountedCostsSum = 0;
  let discountedYieldSum = 0;

  const ibiYears = (soilType === 'rustico' || _commTax.ibiEnabled === false || ibiOpt === '0')
    ? 0
    : (ibiOpt.includes('_10') ? 10 : (ibiOpt.includes('_5') ? 5 : (ibiOpt.includes('_3') ? 3 : ((_commTax && typeof _commTax.ibiYears === 'number' && _commTax.ibiYears > 0) ? _commTax.ibiYears : 0))));
  const ibiAnnualBonus = (ibiYears > 0) ? (ahorroIBITotal / ibiYears) : 0;
  // Fracción real de la energía solar generada que se autoconsume (directo + batería)
  const selfConsumptionFraction = annualYieldKWh > 0 ? Math.min(1.0, (annualAutoconsumoDirecto + annualBateriaKWh) / annualYieldKWh) : 0;

  for (let y = 1; y <= 25; y++) {
    // Factor de degradación acumulado compuesto normativo
    const degFactor = (1 - degYear1) * Math.pow(1 - degAnnual, y - 1);
    const yieldY = annualYieldKWh * degFactor;
    degradationFactors25.push(Math.round(degFactor * 1000) / 10);
    annualYields25.push(Math.round(yieldY));
    totalGenerado25 += yieldY;

    // Ahorro año 1 anclado a ahorroLuzAnio1 + beneficio CEL adicional si aplica (despacho horario / TOU / excedentes CEL)
    // Años 2 a 25 proyectados por degradación acumulada de módulos y escalado de inflación eléctrica
    const priceY = precioRed * Math.pow(1 + inflacion, y - 1);
    const baseSaveY = (y === 1)
      ? ahorroLuzAnio1
      : (ahorroLuzAnio1 * (yieldY / Math.max(annualYieldKWh, 1)) * Math.pow(1 + inflacion, y - 1));
    const celExtraY = isCelActive
      ? ((y === 1) ? celExtraBenefitYear1 : (celExtraBenefitYear1 * (yieldY / Math.max(annualYieldKWh, 1)) * Math.pow(1 + inflacion, y - 1)))
      : 0;
    const saveY = baseSaveY + celExtraY;
    annualSavings25.push(Math.round(saveY));

    // OPEX indexado anualmente por IPC de servicios
    const omY = opexYear1 * Math.pow(1 + ipcOpex, y - 1);
    annualOpex25.push(Math.round(omY));
    totalOpex25 += omY;
    totalCoste25 += omY;

    // Inversor replacement en año 12 y Batería en año 10 (con deflación tecnológica)
    const invReplY = (y === 12) ? invReplacementCost12 : 0;
    const batReplY = (y === batReplacementYear) ? batReplacementCost10 : 0;
    const replY = invReplY + batReplY;
    totalCoste25 += replY;

    // Acumular flujos descontados para LCOE bancable (WACC 4%)
    discountedCostsSum += (omY + replY) / Math.pow(1 + r, y);
    discountedYieldSum += yieldY / Math.pow(1 + r, y);

    // Aportación fiscal real sin duplicidad: IRPF o Sociedades + CAEs en año 1, IBI en años 1 a N_ibi (incl. 10 años)
    let fiscalY = 0;
    if (y === 1) fiscalY += (customerProfile === 'empresa' ? ahorroSociedades : ahorroIRPF) + ahorroCAE;
    if (y <= ibiYears) fiscalY += ibiAnnualBonus;

    const netCF = saveY - omY - replY + fiscalY;
    const netCFSinCEL = baseSaveY - omY - replY + fiscalY;
    const discountedCF = netCF / Math.pow(1 + r, y);

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

  // Payback
  let paybackYears = 25;
  for (let y = 1; y <= 25; y++) {
    if (acumulado[y] >= 0) {
      const prev = acumulado[y - 1];
      const diff = acumulado[y] - prev;
      paybackYears = diff > 0 ? (y - 1) + (-prev / diff) : y;
      break;
    }
  }

  // TIR Calculation (Bisection) sobre capexDesembolsoInicial y cashflow
  function calcNPV(rate) {
    let npv = -capexDesembolsoInicial;
    for (let t = 1; t <= 25; t++) {
      npv += cashflow[t] / Math.pow(1 + rate, t);
    }
    return npv;
  }
  let low = -0.1, high = 1.0, tir = null, tirString = 'N/D';
  // Verificación de bracketing ampliada (Nivel P2.2):
  // Soporta proyectos hiperrentables (subvenciones IRPF/IBI/NextGen amortizadas en año 1)
  let npvLow = calcNPV(low);
  let npvHigh = calcNPV(high);

  if (isFinite(npvLow) && isFinite(npvHigh)) {
    if (npvHigh > 0) {
      // Proyecto extraordinariamente rentable: ampliar rango de búsqueda a 500%
      high = 5.0;
      npvHigh = calcNPV(high);
      if (npvHigh > 0) {
        tir = 5.0;
        tirString = '> 500 %';
      }
    }

    if (tir === null) {
      if (npvLow * npvHigh < 0) {
        for (let iter = 0; iter < 45; iter++) {
          const mid = (low + high) / 2;
          const vMid = calcNPV(mid);
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

  // LCOE (€/kWh) Bancable Descontado con coste de capital (WACC al 4.0% anual según NREL / IRENA)
  const totalCosteDescontado = capexDesembolsoInicial + discountedCostsSum;
  const lcoe = (discountedYieldSum > 0) ? (totalCosteDescontado / discountedYieldSum) : (totalCoste25 > 0 ? (totalCoste25 / Math.max(totalGenerado25, 1)) : 0.038);

  // Financiación bancaria rigurosa (Francés con entrada, carencia, apertura y seguro)
  const _commFin = (commercialCfg && commercialCfg.financing) ? commercialCfg.financing : {};
  const finMode = (typeof _commFin.mode === 'string') ? _commFin.mode : 'both'; // 'both' | 'cash' | 'financed'
  const entradaEur = Math.max(0, _input('fin-entrada-eur', (_commFin.downPaymentEur != null ? _commFin.downPaymentEur : 0)));
  const meses = Math.max(1, _input('fin-plazo-meses', (_commFin.loanMonths || 120)));
  const defaultTin = (typeof _commFin.loanTinPct === 'number') ? _commFin.loanTinPct : 5.95;
  const tinAnual = Math.max(0, _input('fin-tin-pct', defaultTin)) / 100.0;
  const comisionAperturaPct = Math.max(0, _input('fin-apertura-pct', (_commFin.openingFeePct != null ? _commFin.openingFeePct : 1.0))) / 100.0;
  const aperturaFinanciada = (typeof _commFin.feeFinanced !== 'undefined') ? Boolean(_commFin.feeFinanced) : true;
  const mesesCarencia = Math.max(0, Math.min(12, Math.round(_input('fin-carencia-meses', (_commFin.graceMonths || 0)))));
  const seguroMensualEur = Math.max(0, _input('fin-seguro-mensual', (_commFin.monthlyInsuranceEur || 0)));
  const notariaEur = Math.max(0, _input('fin-notaria-eur', (_commFin.notaryEur || 0)));

  // Capital efectivo a financiar: Presupuesto bruto menos entrada
  const capitalBaseFinanciar = Math.max(0, capexBruto - entradaEur);
  const comisionAperturaEur = Math.round(capitalBaseFinanciar * comisionAperturaPct);
  const capitalPrincipalCredito = capitalBaseFinanciar + (aperturaFinanciada ? comisionAperturaEur : 0) + (aperturaFinanciada ? notariaEur : 0);
  const gastosInicialesContado = entradaEur + (!aperturaFinanciada ? comisionAperturaEur : 0) + (!aperturaFinanciada ? notariaEur : 0);

  // Amortización con carencia (durante carencia se abonan solo intereses del capital)
  const mesesAmortizacion = Math.max(1, meses - mesesCarencia);
  const tinMensual = tinAnual / 12.0;
  let cuotaAmortizacion = 0;
  if (mesesAmortizacion > 0 && capitalPrincipalCredito > 0) {
    cuotaAmortizacion = (tinMensual > 0)
      ? (capitalPrincipalCredito * (tinMensual * Math.pow(1 + tinMensual, mesesAmortizacion))) / (Math.pow(1 + tinMensual, mesesAmortizacion) - 1)
      : (capitalPrincipalCredito / mesesAmortizacion);
    if (!Number.isFinite(cuotaAmortizacion)) cuotaAmortizacion = 0;
  }
  const cuotaDuranteCarencia = (capitalPrincipalCredito * tinMensual) + seguroMensualEur;
  const cuotaMensualCredito = cuotaAmortizacion + seguroMensualEur;
  const cuotaMensual = Math.round(cuotaMensualCredito);

  // Cálculo de TAE real con flujos de caja del préstamo
  let taeCalculadaPct = tinAnual * 100.0;
  if (capitalBaseFinanciar > 0 && meses > 0) {
    try {
      // Flujo neto inicial recibido: capitalBaseFinanciar - comisiones/gastos iniciales si no financiados
      const desembolsoNetoPrestamo = capitalBaseFinanciar - (!aperturaFinanciada ? comisionAperturaEur : 0) - (!aperturaFinanciada ? notariaEur : 0);
      // Flujos mensuales a pagar
      const flujosPrestamo = [-desembolsoNetoPrestamo];
      for (let fm = 1; fm <= meses; fm++) {
        flujosPrestamo.push(fm <= mesesCarencia ? cuotaDuranteCarencia : cuotaMensualCredito);
      }
      // Resolver TIR mensual mediante bisección
      let rMin = 0.0, rMax = 0.10, rMid = 0.0;
      for (let iter = 0; iter < 40; iter++) {
        rMid = (rMin + rMax) / 2.0;
        let npvF = 0;
        for (let t = 0; t < flujosPrestamo.length; t++) {
          npvF += flujosPrestamo[t] / Math.pow(1 + rMid, t);
        }
        if (npvF > 0) rMin = rMid;
        else rMax = rMid;
      }
      const taeReal = (Math.pow(1 + rMid, 12) - 1) * 100.0;
      if (Number.isFinite(taeReal) && taeReal > 0) taeCalculadaPct = taeReal;
    } catch (eTae) {
      taeCalculadaPct = ((Math.pow(1 + tinMensual, 12) - 1) * 100.0) + (comisionAperturaPct * 100.0 / (meses / 12.0));
    }
  }

  const ahorroMensualLuz = ahorroLuzAnio1 / 12.0;
  const balanceNetoMensual = ahorroMensualLuz - cuotaMensual;

  // ── Amortización con Financiación Bancaria (Curva Financiada a 25 Años) ──
  const cashflowFinanciado = [-gastosInicialesContado];
  const acumuladoFinanciado = [-gastosInicialesContado];
  for (let y = 1; y <= 25; y++) {
    // Cuotas satisfechas en el año y (12 meses por año hasta completar el plazo del préstamo)
    let cuotaAnualY = 0;
    const startM = (y - 1) * 12 + 1;
    const endM = y * 12;
    for (let mIdx = startM; mIdx <= endM; mIdx++) {
      if (mIdx <= meses) {
        cuotaAnualY += (mIdx <= mesesCarencia ? cuotaDuranteCarencia : cuotaMensualCredito);
      }
    }
    const netCFFin = (annualSavings25[y - 1] || 0) - (annualOpex25[y - 1] || 0) - ((y === 12 ? invReplacementCost12 : 0) + (y === batReplacementYear ? batReplacementCost10 : 0)) + (y === 1 ? ((customerProfile === 'empresa' ? ahorroSociedades : ahorroIRPF) + ahorroCAE) : 0) + (y <= ibiYears ? ibiAnnualBonus : 0) - cuotaAnualY;
    cashflowFinanciado.push(Math.round(netCFFin));
    acumuladoFinanciado.push(Math.round(acumuladoFinanciado[y - 1] + netCFFin));
  }

  let paybackFinanciadoYears = null;
  // Si la curva entra en negativo durante el préstamo (por cuotas o reemplazos),
  // el verdadero payback financiado se produce cuando se recupera definitivamente a positivo (>= 0).
  let dippedBelowZero = false;
  for (let y = 1; y <= 25; y++) {
    if (acumuladoFinanciado[y] < 0) {
      dippedBelowZero = true;
    }
  }

  if (dippedBelowZero) {
    let wasNegative = false;
    for (let y = 1; y <= 25; y++) {
      if (acumuladoFinanciado[y] < 0) {
        wasNegative = true;
      } else if (wasNegative && acumuladoFinanciado[y] >= 0) {
        const prev = acumuladoFinanciado[y - 1];
        const diff = acumuladoFinanciado[y] - prev;
        paybackFinanciadoYears = diff > 0 ? (y - 1) + (-prev / diff) : y;
        break;
      }
    }
  } else {
    // Si nunca fue negativa tras el año 0
    if (acumuladoFinanciado[0] < 0) {
      for (let y = 1; y <= 25; y++) {
        if (acumuladoFinanciado[y] >= 0) {
          const prev = acumuladoFinanciado[y - 1];
          const diff = acumuladoFinanciado[y] - prev;
          paybackFinanciadoYears = diff > 0 ? (y - 1) + (-prev / diff) : y;
          break;
        }
      }
    } else {
      // Sin desembolso inicial ni saldo negativo acumulado (inversión autofinanciada desde el día 1)
      paybackFinanciadoYears = 0;
    }
  }

  const ahorroTotal25 = Math.round(annualSavings25.reduce((a, b) => a + b, 0));
  const redKWhAnual = Math.max(0, Math.round(consumoAnual - annualAutoconsumoDirecto - annualBateriaKWh));

  const exportedBatCount = (batCap > 0 || bat > 0) ? Math.max(1, _batCapCount || 1) : 0;
  const exportedMlpeCount = isMicro
    ? ((projCfg.autoSizing && projCfg.autoSizing.microinverters && projCfg.autoSizing.microinverters.count) || (designCosts && designCosts.microCount) || numPanels)
    : ((projCfg.selectedTopology === 'optimizer') ? numPanels : 0);

  const resultModel = {
    numPanels: numPanels,
    kwp: kwp,
    invCount: isMicro ? 0 : invCount,
    batCount: exportedBatCount,
    mlpeCount: exportedMlpeCount,
    topology: projCfg.selectedTopology || 'inverter',
    directCost: directCost,
    marginPct: marginPct,
    marginEur: marginEur,
    unitPanelPrice: unitPanelPrice,
    panCost: panCost,
    modulesBreakdown: mb,
    isMultiModule: !!(mb && mb.isMultiModule),
    estCost: est,
    invCost: inv,
    mlpeCost: mlpeCost,
    batCost: bat,
    cabCost: cab,
    cablesOnlyCost: designCosts ? designCosts.cablesOnlyPrice : Math.round(cab * 0.45),
    protOnlyCost: designCosts ? designCosts.protOnlyPrice : Math.round(cab * 0.55),
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
    // [AUD-2026 · A-04] Base única declarada de las métricas de rentabilidad.
    inversionBaseMetricas: capexBruto,
    autarquiaPct: Math.round(autarquia * 100),
    pctAutoconsumo: Math.round(autarquia * 100),
    precioRedEUR: precioRed,
    precioCompensacionEUR: precioCompensacion,
    annualYieldKWh: annualYieldKWh,
    monthlySource: monthlySource,
    ahorroLuzAnio1: ahorroLuzAnio1,
    ahorroTotal25: ahorroTotal25,
    paybackYears: paybackYears,
    van: van,
    tir: (tir != null && isFinite(tir)) ? tir * 100 : (tirString.startsWith('>') ? 100.0 : null),
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
    // Series anuales con degradación compuesta a 25 años (Fase 2.1)
    annualYields25: annualYields25,
    annualSavings25: annualSavings25,
    degradationFactors25: degradationFactors25,
    remainingPerformanceYr25: degradationFactors25[24] || 85.0,
    totalGenerado25: Math.round(totalGenerado25),
    degYear1Pct: degYear1 * 100,
    degAnnualPct: degAnnual * 100,
    inflacionPct: inflacion * 100,
    // Métricas de OPEX y Reemplazo de Inversor (Fase 2.2)
    totalOpex25: Math.round(totalOpex25),
    annualOpex25: annualOpex25,
    inverterReplacementCostYr12: invReplacementCost12,
    batteryReplacementCostYr10: batReplacementCost10,
    opexYear1: Math.round(opexYear1),
    ipcOpexPct: ipcOpex * 100,
    invBasePrice: Math.round(invBasePrice),
    // Métricas de Cronograma Fiscal y WACC (Fase 2.3)
    financialSchedule25: financialSchedule25,
    discountedCashFlow25: discountedCashFlow25,
    capexDesembolsoInicial: Math.round(capexDesembolsoInicial),
    waccPct: Math.round(r * 1000) / 10,
    // Métricas CEL integradas en amortización y cashflow
    isCelActive: isCelActive,
    celExtraBenefitYear1: celExtraBenefitYear1,
    ahorroTotalConCEL: Math.round(ahorroLuzAnio1 + celExtraBenefitYear1)
  };
  if (typeof window !== 'undefined') {
    window._lastFinModel = resultModel;
  }
  return resultModel;
  } finally {
    if (typeof window !== 'undefined') window._isComputingFinModel = false;
  }
}

// Exportar motor financiero al namespace global
  if (typeof calculateFinancialModel !== 'undefined') {
    window.calculateFinancialModel = calculateFinancialModel;
    if (typeof globalThis !== 'undefined') globalThis.calculateFinancialModel = calculateFinancialModel;
  }
  if (window.RA) {
    window.RA.financials = {
      calculate: calculateFinancialModel,
      generatePDF: typeof generatePropuestaComercialPDF !== 'undefined' ? generatePropuestaComercialPDF : null
    };
  }
  if (typeof generatePropuestaComercialPDF !== 'undefined')
    window.generatePropuestaComercialPDF = generatePropuestaComercialPDF;
  if (typeof generateCommercialSummary !== 'undefined') {
    window.generateCommercialSummary = generateCommercialSummary;
    if (typeof globalThis !== 'undefined') globalThis.generateCommercialSummary = generateCommercialSummary;
  }
  if (typeof requestCommercialSummaryFromGemini !== 'undefined') {
    window.requestCommercialSummaryFromGemini = requestCommercialSummaryFromGemini;
    if (typeof globalThis !== 'undefined') globalThis.requestCommercialSummaryFromGemini = requestCommercialSummaryFromGemini;
  }
  if (typeof enrichSummaryWithGemini !== 'undefined') {
    window.enrichSummaryWithGemini = enrichSummaryWithGemini;
    if (typeof globalThis !== 'undefined') globalThis.enrichSummaryWithGemini = enrichSummaryWithGemini;
  }
  if (typeof togglePropEdit !== 'undefined')
    window.togglePropEdit = togglePropEdit;
  // ── CAPA ÚNICA DE SNAPSHOT TÉCNICO-ECONÓMICO (SSOT PARA MEMORIA, OFERTA Y DOSSIER) ──
  function raBuildDocSnapshot(dOpt, mOpt) {
    const d = dOpt || (typeof getProjectCalcs === 'function' ? getProjectCalcs() : {});
    const m = mOpt || (typeof calculateFinancialModel === 'function' ? calculateFinancialModel({ d: d }) : null);
    const eq = (typeof resolveEquipmentNames === 'function') ? resolveEquipmentNames() : {};
    const warranties = (typeof resolveEquipmentWarranties === 'function') ? resolveEquipmentWarranties() : {
      warPower: '25', warMod: '15', warInv: '12', warMo: '5', warBat: '10', isMicro: false, hasBat: !!(eq && eq.hasBat)
    };
    const mesesFin = (m && Number(m.mesesFin) > 0) ? Number(m.mesesFin) : 96;
    const finYears = Math.max(1, Math.round(mesesFin / 12));
    const cuotasMes = (m && typeof m.cuotaMensual === 'number') ? m.cuotaMensual : 0;
    const ahorroMes = (m && typeof m.ahorroMensualLuz === 'number') ? m.ahorroMensualLuz : ((m ? m.ahorroLuzAnio1 : (d.ahorro_anual || 0)) / 12);
    const balanceMes = ahorroMes - cuotasMes;
    return {
      d,
      m,
      eq,
      warranties,
      numPanels: (m && m.numPanels != null) ? m.numPanels : (d.numPanels || 0),
      kwp: (m && m.kwp != null) ? m.kwp : (Number(d.kwp) || d.P_dc_kW || 0),
      invCount: (m && typeof m.invCount === 'number') ? m.invCount : (eq.invCount || 1),
      batCount: (m && typeof m.batCount === 'number') ? m.batCount : (eq.batCount || 0),
      mlpeCount: (m && typeof m.mlpeCount === 'number') ? m.mlpeCount : (eq.microCount || eq.optimizerCount || 0),
      windCount: (eq && eq.hasWind) ? (eq.windCount || 0) : 0,
      annualYieldKWh: (m && m.annualYieldKWh != null) ? m.annualYieldKWh : (d.annualKWh || 0),
      subtotal: (m && typeof m.subtotal === 'number') ? m.subtotal : (d.subtotal || 0),
      ivaRate: (m && typeof m.ivaRate === 'number') ? m.ivaRate : 0.21,
      iva: (m && typeof m.iva === 'number') ? m.iva : 0,
      capexBruto: (m && typeof m.capexBruto === 'number') ? m.capexBruto : (d.total || 0),
      capexNeto: (m && typeof m.capexNeto === 'number') ? m.capexNeto : (d.total || 0),
      van: (m && typeof m.van === 'number' && isFinite(m.van)) ? m.van : null,
      tir: (m && typeof m.tir === 'number' && isFinite(m.tir)) ? m.tir : null,
      tirStr: (m && m.tirString) ? m.tirString : ((m && typeof m.tir === 'number' && isFinite(m.tir)) ? (m.tir.toFixed(1) + ' %') : 'N/D'),
      lcoe: (m && typeof m.lcoe === 'number' && isFinite(m.lcoe)) ? m.lcoe : null,
      paybackYears: (m && typeof m.paybackYears === 'number' && isFinite(m.paybackYears)) ? m.paybackYears : null,
      paybackFinanciadoYears: (m && typeof m.paybackFinanciadoYears === 'number') ? m.paybackFinanciadoYears : null,
      waccPct: (m && typeof m.waccPct === 'number') ? m.waccPct : 4.0,
      inflacionPct: (m && typeof m.inflacionPct === 'number') ? m.inflacionPct : 3.0,
      ipcOpexPct: (m && typeof m.ipcOpexPct === 'number') ? m.ipcOpexPct : 2.0,
      degAnnualPct: (m && typeof m.degAnnualPct === 'number') ? m.degAnnualPct : 0.40,
      remainingPerformanceYr25: (m && typeof m.remainingPerformanceYr25 === 'number') ? m.remainingPerformanceYr25 : 85.0,
      totalGenerado25: (m && typeof m.totalGenerado25 === 'number') ? m.totalGenerado25 : null,
      ahorroLuzAnio1: (m && typeof m.ahorroLuzAnio1 === 'number') ? m.ahorroLuzAnio1 : (d.ahorro_anual || 0),
      ahorroTotal25: (m && typeof m.ahorroTotal25 === 'number') ? m.ahorroTotal25 : 0,
      mesesFin,
      finYears,
      cuotaMensual: cuotasMes,
      ahorroMensualLuz: ahorroMes,
      balanceNetoMensual: balanceMes,
      isSaldoNetoPositivo: balanceMes >= 0
    };
  }
  window.raBuildDocSnapshot = raBuildDocSnapshot;
  if (!window.RA) window.RA = {};
  window.RA.getDocumentSnapshot = raBuildDocSnapshot;

  // Precargar fotos custom desde IndexedDB (RAStorageCache) hacia window.RA._proposalCustomPhotos tras carga del DOM
  if (typeof document !== 'undefined') {
    const _preloadCustomPhotosFromIdb = function() {
      if (typeof window !== 'undefined' && window.RAStorageCache && typeof window.RAStorageCache.getCachedAssetAsync === 'function') {
        window.RAStorageCache.getCachedAssetAsync('ra_proposal_custom_photos').then(function(cachedPhotos) {
          if (cachedPhotos && typeof cachedPhotos === 'object') {
            if (!window.RA) window.RA = {};
            window.RA._proposalCustomPhotos = Object.assign({}, cachedPhotos, window.RA._proposalCustomPhotos || {});
          }
        }).catch(function() {});
      }
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', _preloadCustomPhotosFromIdb);
    } else {
      setTimeout(_preloadCustomPhotosFromIdb, 0);
    }
  }

  if (typeof exportPropDocx !== 'undefined')
    window.exportPropDocx = exportPropDocx;
  if (typeof exportPropWord !== 'undefined')
    window.exportPropWord = exportPropWord;
  if (typeof exportPropHtml !== 'undefined')
    window.exportPropHtml = exportPropHtml;
  if (typeof RAPricing !== 'undefined')
    window.RAPricing = RAPricing;
  if (typeof calculateCELMetrics !== 'undefined') {
    window.calculateCELMetrics = calculateCELMetrics;
    if (typeof globalThis !== 'undefined') globalThis.calculateCELMetrics = calculateCELMetrics;
  }
  if (typeof buildCELPageHTML !== 'undefined') {
    window.buildCELPageHTML = buildCELPageHTML;
    if (typeof globalThis !== 'undefined') globalThis.buildCELPageHTML = buildCELPageHTML;
  }
  if (typeof wpOpenPricingReviewModal !== 'undefined')
    window.wpOpenPricingReviewModal = wpOpenPricingReviewModal;
  if (typeof wpUpdateStep5PricingBadge !== 'undefined') {
    window.wpUpdateStep5PricingBadge = wpUpdateStep5PricingBadge;
    if (typeof document !== 'undefined') {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', wpUpdateStep5PricingBadge);
      } else {
        wpUpdateStep5PricingBadge();
      }
    }
  }

window.wpSetProposalYieldMode = function(mode) {
  const next = (mode === 'theoretical') ? 'theoretical' : 'simulated';
  window.raProposalYieldMode = next;
  const btnSim = document.getElementById('step5-yield-simulated');
  const btnTheo = document.getElementById('step5-yield-theoretical');
  if (btnSim) {
    const active = (next === 'simulated');
    btnSim.classList.toggle('active', active);
    btnSim.style.background = active ? 'rgba(56,189,248,0.2)' : 'transparent';
    btnSim.style.borderColor = active ? '#38BDF8' : 'transparent';
    btnSim.style.color = active ? '#38BDF8' : '#94a3b8';
    btnSim.style.fontWeight = active ? '800' : '700';
  }
  if (btnTheo) {
    const active = (next === 'theoretical');
    btnTheo.classList.toggle('active', active);
    btnTheo.style.background = active ? 'rgba(245,158,11,0.22)' : 'transparent';
    btnTheo.style.borderColor = active ? '#F59E0B' : 'transparent';
    btnTheo.style.color = active ? '#FBBF24' : '#94a3b8';
    btnTheo.style.fontWeight = active ? '800' : '700';
  }
  if (typeof renderStep5ExecutiveSummary === 'function') {
    try { renderStep5ExecutiveSummary(); } catch (_) {}
  }
  if (typeof showToast === 'function') {
    showToast(
      next === 'theoretical' ? 'PRODUCCIÓN TEÓRICA ACTIVA' : 'PRODUCCIÓN SIMULADA 3D ACTIVA',
      next === 'theoretical'
        ? 'El presupuesto y la oferta usarán la producción anual teórica (sin pérdidas por sombras 3D).'
        : 'El presupuesto y la oferta usarán la simulación neta con sombras 3D.',
      'info',
      2800
    );
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    generateCommercialSummary: typeof generateCommercialSummary !== 'undefined' ? generateCommercialSummary : null,
    requestCommercialSummaryFromGemini: typeof requestCommercialSummaryFromGemini !== 'undefined' ? requestCommercialSummaryFromGemini : null,
    enrichSummaryWithGemini: typeof enrichSummaryWithGemini !== 'undefined' ? enrichSummaryWithGemini : null,
    calculateFinancialModel: typeof calculateFinancialModel !== 'undefined' ? calculateFinancialModel : null,
    calculateCELMetrics: typeof calculateCELMetrics !== 'undefined' ? calculateCELMetrics : null,
    buildCELPageHTML: typeof buildCELPageHTML !== 'undefined' ? buildCELPageHTML : null,
    RAPricing: typeof RAPricing !== 'undefined' ? RAPricing : null
  };
}
})();
