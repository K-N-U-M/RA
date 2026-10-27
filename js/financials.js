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
      var sizing = cfg.autoSizing && cfg.autoSizing.inverters;
      result.invCount = (sizing && sizing.count) ? sizing.count : 1;
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
          totalMPPTs: result.totalMPPTs
        }]
      };
      var mpptTxt = result.invMPPTs > 0 ? (' · ' + result.invMPPTs + ' MPPT') : '';
      if (result.invCount > 1) {
        result.invName = result.invCount + '× ' + result.invBrand + ' ' + result.invModel + ' (' + result.totalAcKw.toFixed(1) + ' kW total · ' + result.totalMPPTs + ' MPPT)';
      } else {
        result.invName = result.invBrand + ' ' + result.invModel + ' (' + result.invKw + ' kW' + mpptTxt + ')';
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
        result.batName = result.batCount + '× ' + result.batBrand + ' ' + result.batModel + ' (' + result.totalBatKwh.toFixed(1) + ' kWh total)';
      } else {
        result.batName = result.batBrand + ' ' + result.batModel + ' (' + result.totalBatKwh.toFixed(1) + ' kWh)';
      }
    } else {
      result.hasBat = false;
      result.batBrand = '';
      result.batModel = '';
      result.batKwh = 0;
      result.batCount = 0;
      result.totalBatKwh = 0;
      result.batName = 'Sin batería (Conexión Directa)';
      result.batteriesBreakdown = { isMulti: false, totalCount: 0, totalCapacityKwh: 0, items: [] };
    }
  }

  // ── Microinversor ──
  if (cfg.selectedMicroinverterId && cat.microinverters && Array.isArray(cat.microinverters)) {
    var mic = cat.microinverters.find(function(mi) { return mi.id === cfg.selectedMicroinverterId; });
    if (mic) {
      result.microBrand = mic.brand || '';
      result.microModel = mic.model || '';
      var micSizing = cfg.autoSizing && cfg.autoSizing.microinverters;
      result.microCount = (micSizing && micSizing.count) ? micSizing.count : 0;
      result.hasMicro = true;
      result.microName = result.microBrand + ' ' + result.microModel;
      var micKw = mic.kw || (mic.va ? mic.va / 1000 : 0.8);
      result.totalMicroKw = Math.round((micKw * result.microCount) * 100) / 100;
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
    warInv: '10',      // Garantía de inversor (10 años central de red / híbrido, 25 años microinversores)
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
      result.warInv = '10';
    } else {
      result.warInv = '10';
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
    if (b.warInv && b.warInv !== '10' && !result.isMicro) result.warInv = String(b.warInv);
    if (b.warMo && b.warMo !== '5') result.warMo = String(b.warMo);
  } catch(e) {}

  return result;
}
if (typeof window !== 'undefined') {
  window.resolveEquipmentWarranties = resolveEquipmentWarranties;
}

function generateCommercialSummary(d, m, equipment) {
  var kwp = (m && m.kwp) || 0;
  var numPanels = (m && m.numPanels) || (d && d.numPanels) || 0;
  var annualKWh = (d && d.annualKWh) || (kwp * 1450);
  var ahorro = (m && m.ahorroLuzAnio1) || (m && m.ahorroAnualEstimado) || 0;
  var payback = (m && m.paybackYears) || 0;
  var autoconsumo = (m && m.pctAutoconsumo) || (m && m.autoconsumoPct) || 0;
  var tit = (d && d.tit) ? d.tit : {};
  var ciudad = tit.mun || tit.prov || 'su localidad';
  var rawNombre = tit.nombre ? String(tit.nombre).trim() : '';

  var isGeneric = !rawNombre || /^(cliente|titular|titular de la instalaci[oó]n|propietario|propietario ejemplo|propietario ejemplo s\.?l\.?|particular|empresa|ejemplo|xxxx+|n\/a)$/i.test(rawNombre);

  // ── Plantilla determinista ──
  var lines = [];
  if (!isGeneric) {
    lines.push('Estimado/a <strong>' + rawNombre.split(' ')[0] + '</strong>,');
  } else {
    lines.push('Estimado/a cliente,');
  }
  lines.push('');
  lines.push('Hemos diseñado una instalación fotovoltaica a medida para su propiedad en <strong>' + ciudad + '</strong>.');

  // KWp y paneles
  lines.push('El sistema propuesto consta de <strong>' + numPanels + ' módulos</strong> de última generación con una potencia total de <strong>' + kwp.toFixed(2) + ' kWp</strong>, ' +
    'que generarán aproximadamente <strong>' + Math.round(annualKWh).toLocaleString('es-ES') + ' kWh al año</strong>.');

  // Ahorro y payback
  if (ahorro > 0) {
    lines.push('Esto se traduce en un ahorro estimado de <strong>' + Math.round(ahorro).toLocaleString('es-ES') + ' €</strong> en su primer año, ' +
      'con una recuperación total de la inversión en tan solo <strong>' + payback.toFixed(1) + ' años</strong>.');
  }

  // Autoconsumo
  if (autoconsumo > 0) {
    lines.push('Podrá cubrir hasta el <strong>' + Math.round(autoconsumo) + '%</strong> de su consumo eléctrico actual directamente con energía solar.');
  }

  // Batería
  if (equipment && equipment.hasBat) {
    lines.push('Además, el sistema incluye almacenamiento con batería <strong>' + equipment.batName + '</strong>, ' +
      'que le permitirá aprovechar la energía solar incluso en horario nocturno.');
  }

  // Cierre comercial
  lines.push('');
  lines.push('Le invitamos a revisar los detalles técnicos y económicos de esta propuesta. ' +
    'Quedamos a su disposición para resolver cualquier duda y acompañarle en todo el proceso.');

  return lines.join('<br>');
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
    if (!apiKey) apiKey = (window.RA && window.RA.geminiApiKey) ? window.RA.geminiApiKey : (localStorage.getItem('ra_gemini_api_key') || '');
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
            .replace(/<\s*(?:script|iframe|object|embed|style|link|meta)[^>]*>[\s\S]*?<\s*\/\s*(?:script|iframe|object|embed|style|link|meta)\s*>/gi, '')
            .replace(/<\s*(?:script|iframe|object|embed|style|link|meta)[^>]*>/gi, '')
            .replace(/\bon\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
            .replace(/href\s*=\s*['"]?javascript:[^'">\s]*/gi, '')
            .trim();

          if (cleanHtml) return cleanHtml;
        }
      }
    } catch(eLoop) {}
  }
  throw new Error('NO_RESPONSE');
}

async function enrichSummaryWithGemini(targetWindow, d, m, equipment) {
  // Si el usuario ya previsualizó o editó el resumen en el modal, respetarlo al 100%
  if (_customCommercialSummary && _customCommercialSummary.trim()) {
    try {
      var containerCustom = targetWindow.document.getElementById('ra-ai-summary-content');
      var badgeCustom = targetWindow.document.getElementById('ra-ai-summary-badge');
      if (containerCustom) containerCustom.innerHTML = _customCommercialSummary;
      if (badgeCustom) badgeCustom.innerHTML = '✨ Resumen personalizado con IA · Google Gemini';
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
  if (badge) badge.innerHTML = '✨ <em>Generando resumen con Gemini...</em>';

  try {
    var generatedText = await requestCommercialSummaryFromGemini(d, m, equipment);
    if (generatedText && generatedText.trim()) {
      container.innerHTML = generatedText;
      if (badge) badge.innerHTML = '✨ Resumen generado con IA · Google Gemini';
    }
  } catch(err) {
    if (badge) badge.innerHTML = '📋 Resumen del proyecto';
    if (window.RA_ErrorHandler && err.message !== 'NO_API_KEY') {
      window.RA_ErrorHandler.handleAsyncAPI(err, 'Gemini AI');
    }
  }
}


// ============================================================================
// SISTEMA DE PRECIOS Y MARGEN COMERCIAL (RAPricing)
// ============================================================================
var RAPricing = {
  STORAGE_KEY: 'ra_pricing_defaults',
  currentSessionPricing: null,

  getProjectFingerprint: function(forcedPanels) {
    var cfg = (typeof window !== 'undefined' && window.solarProjectConfig) ? window.solarProjectConfig : {};
    var nPan = (typeof forcedPanels === 'number' && forcedPanels > 0) ? forcedPanels : 0;
    if (!nPan && typeof window !== 'undefined' && Array.isArray(window.allRenderedPanels) && window.allRenderedPanels.length > 0) {
      nPan = window.allRenderedPanels.filter(function(p) { return p && !p.deleted; }).length;
    }
    if (!nPan && typeof WP !== 'undefined' && WP && Array.isArray(WP.polylines)) {
      WP.polylines.forEach(function(p) {
        if (p && p.roofInfo && Array.isArray(p.roofInfo.panels)) nPan += p.roofInfo.panels.length;
      });
    }
    var invCnt = (cfg.autoSizing && cfg.autoSizing.inverters && cfg.autoSizing.inverters.count) || 1;
    var batCnt = (cfg.autoSizing && cfg.autoSizing.batteries && cfg.autoSizing.batteries.count) || 0;
    return [
      nPan || 0,
      cfg.selectedModuleId || 'mod',
      cfg.selectedInverterId || 'inv',
      invCnt,
      cfg.selectedBatteryId || 'bat',
      batCnt,
      cfg.selectedTopology || 'inverter'
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

    var numPanels = (typeof forcedPanels === 'number' && forcedPanels > 0)
      ? forcedPanels
      : ((tree && tree.summary && tree.summary.totalPanels > 0)
          ? tree.summary.totalPanels
          : ((typeof window !== 'undefined' && Array.isArray(window.allRenderedPanels) && window.allRenderedPanels.length > 0)
              ? window.allRenderedPanels.filter(function(p) { return p && !p.deleted; }).length
              : (cfg.lastEstimatedPanels || 1)));

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
    // 8. Partida Eólica (Fase 3): Aerogeneradores, mástil, zapata y dump load
    var windTot = 0;
    var windCount = 0;
    var windKw = 0;
    if (typeof window !== 'undefined' && Array.isArray(window.windTurbines) && window.windTurbines.length > 0) {
      window.windTurbines.forEach(function (t) {
        if (!t || (t.operationalState && t.operationalState.enabled === false)) return;
        var cat = t._catalog || {};
        var kw = (cat.ratedPowerW ? (cat.ratedPowerW / 1000) : 5);
        var costTurbine = (cat.priceEur && cat.priceEur > 0) ? cat.priceEur : Math.round(kw * 1450);
        var mastH = (t.supportStructure && t.supportStructure.hubHeightM) || 18;
        var costMast = Math.round(mastH * 220);
        windTot += (costTurbine + costMast);
        windCount++;
        windKw += kw;
      });
    }
    var wTot = Math.round(windTot);
    var lTot = Math.round(legPrice);

    return {
      numPanels: numPanels,
      panelPrice: Math.round(panelPrice * 100) / 100,
      panelTotalCost: pTot,
      estPrice: eTot,
      isPergola: isAnyPergola,
      pergolaClearance: pergolaClearance,
      estDescription: isAnyPergola ? ('Pérgola elevada de aluminio/acero (H = ' + pergolaClearance.toFixed(2) + ' m)') : 'Estructura soporte y perfilería',
      invPrice: iTot,
      invOnlyPrice: Math.round(invOnlyPrice),
      mlpePrice: Math.round(mlpePrice),
      batPrice: bTot,
      cabPrice: cTot,
      cablesOnlyPrice: Math.round(cablesOnlyPrice),
      protOnlyPrice: Math.round(protOnlyPrice),
      moPrice: mTot,
      legPrice: lTot,
      icioTaxEur: Math.round(icioTaxEur),
      windPrice: wTot,
      windCount: windCount,
      windKw: Number(windKw.toFixed(1)),
      directCostTotal: pTot + eTot + iTot + bTot + cTot + mTot + lTot + wTot
    };
  },

  getDefaults: function() {
    var currentFp = this.getProjectFingerprint();
    if (this.currentSessionPricing) {
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
      skipReview: false
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
    this.currentSessionPricing = Object.assign({}, cfg, { projectFingerprint: fp });
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
    try {
      var saved = localStorage.getItem(this.STORAGE_KEY);
      var mg = 20;
      if (saved) {
        var parsed = JSON.parse(saved);
        if (parsed && typeof parsed.marginPct === 'number') mg = parsed.marginPct;
      }
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify({ marginPct: mg, skipReview: false }));
    } catch (e) {}
    return this.computeDesignCosts();
  },


  COMMERCIAL_CONFIG_KEY: 'ra_commercial_custom_config',
  _defaultCommercialConfig: {
    hideMarginInClientDocs: true,
    showUnitPricesInClientDocs: true,
    discountEnabled: false,
    discountLabel: 'Descuento Especial Firma Rápida',
    discountType: 'percent', // 'percent' | 'fixed_eur'
    discountValue: 5,        // 5% o 500 €
    addons: [
      { id: 'ev_charger',   enabled: false, name: 'Cargador Vehículo Eléctrico Wallbox 7,4 kW + Protecciones', qty: 1, unitPrice: 890 },
      { id: 'bird_mesh',    enabled: false, name: 'Sistema Perimetral Antipájaros en Cubierta (Malla UV)',    qty: 1, unitPrice: 320 },
      { id: 'virtual_bat',  enabled: false, name: 'Alta y Configuración de Batería Virtual (Hucha Solar)',     qty: 1, unitPrice: 95 },
      { id: 'lifeline',     enabled: false, name: 'Línea de Vida Homologada EN 795 / Medios de Elevación',     qty: 1, unitPrice: 450 },
      { id: 'maint_annual', enabled: false, name: 'Pack Mantenimiento Preventivo y Limpieza Anual (Año 1)',    qty: 1, unitPrice: 180 }
    ],
    customAddons: [],
    taxShield: {
      irpfEnabled: true,
      irpfPct: 40,
      irpfMaxBaseEur: 7500,
      ibiEnabled: true,
      ibiAnualEur: 600,
      ibiBonifPct: 50,
      ibiYears: 3,
      icioBonifPct: 95
    },
    financing: {
      loanTinPct: 5.50,
      loanMonths: 84,
      milestones: [
        { label: '1º Hito: Reserva e Ingeniería (a la firma)', pct: 20 },
        { label: '2º Hito: Acopio de Equipos e Inicio de Montaje', pct: 50 },
        { label: '3º Hito: Puesta en Marcha y Legalización CIE', pct: 30 }
      ]
    },
    showThreePackagesComparison: true,
    dossierMode: 'full',
    activeSlides: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  },

  getCommercialConfig: function() {
    try {
      var saved = localStorage.getItem(this.COMMERCIAL_CONFIG_KEY);
      if (saved) {
        var parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          return Object.assign({}, this._defaultCommercialConfig, parsed);
        }
      }
    } catch(e) {}
    return JSON.parse(JSON.stringify(this._defaultCommercialConfig));
  },

  saveCommercialConfig: function(cfg) {
    try {
      localStorage.setItem(this.COMMERCIAL_CONFIG_KEY, JSON.stringify(cfg));
    } catch(e) {}
    if (typeof updateBudgetUI === 'function') updateBudgetUI();
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

    // Paquete 1: Esencial (Autoconsumo puro diurno, sin batería ni extras)
    var p1Direct = Math.round(baseDirect - (m.batCost || 0));
    var p1Subtotal = Math.round(p1Direct * (1 + mgPct / 100));
    var p1Capex = Math.round(p1Subtotal * 1.21);
    var p1Ahorro = Math.round((m.ahorroLuzAnio1 || 1200) * (m.batCost > 0 ? 0.65 : 1.0));
    var p1Payback = p1Ahorro > 0 ? (p1Capex / p1Ahorro).toFixed(1) : '5.5';

    // Paquete 2: Óptimo Recomendado (Diseño 3D actual del usuario)
    var p2Capex = Math.round(m.capexBruto);
    var p2Ahorro = Math.round(m.ahorroLuzAnio1);
    var p2Payback = (typeof m.paybackYears === 'number' && isFinite(m.paybackYears)) ? m.paybackYears.toFixed(1) : '4.5';

    // Paquete 3: Independencia Total (Batería de alta capacidad + cargador VE / extras)
    var batExtra = (m.batCost > 0) ? 2200 : 3800; // batería o ampliación
    var p3Direct = baseDirect + batExtra;
    var p3Subtotal = Math.round(p3Direct * (1 + mgPct / 100));
    var p3Capex = Math.round(p3Subtotal * 1.21);
    var p3Ahorro = Math.round(p2Ahorro * 1.25);
    var p3Payback = p3Ahorro > 0 ? (p3Capex / p3Ahorro).toFixed(1) : '4.8';

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
        title: 'Plan Óptimo ⭐ (Tu Diseño 3D)',
        capex: p2Capex,
        ahorroAnual: p2Ahorro,
        payback: p2Payback,
        autarquia: m.autarquiaPct || 70,
        desc: 'Equilibrio perfecto entre inversión, independencia y retorno garantizado.'
      },
      premium: {
        title: 'Plan Independencia Total ⚡',
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
if (typeof window !== 'undefined') {
  window.wpUpdateStep5PricingBadge = wpUpdateStep5PricingBadge;
}

function wpOpenPricingReviewModal(onConfirm) {
  var pModal = document.getElementById('ra-pricing-review-modal');
  if (!pModal) {
    var modalHtml = '<div id="ra-pricing-review-modal" role="dialog" aria-modal="true" style="display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(15,23,42,0.85);backdrop-filter:blur(8px);z-index:999999;align-items:center;justify-content:center;padding:16px;">' +
      '<div style="background:#0f172a;border:1px solid #334155;border-radius:12px;width:780px;max-width:96vw;max-height:92vh;display:flex;flex-direction:column;box-shadow:0 25px 50px -12px rgba(0,0,0,0.85);overflow:hidden;color:#fff;font-family:Inter,system-ui,sans-serif;">' +
        '<div style="padding:14px 20px;background:rgba(0,0,0,0.4);border-bottom:1px solid rgba(255,255,255,0.08);display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">' +
          '<div style="display:flex;align-items:center;gap:10px;">' +
            '<span style="font-size:20px;">🏷️</span>' +
            '<div>' +
              '<div style="font-weight:900;font-size:13px;color:#fff;letter-spacing:0.5px;">REVISIÓN DE PRECIOS &amp; PRESUPUESTO FINAL</div>' +
              '<div id="pricing-modal-subtitle" style="font-size: 10px;color:#94a3b8;">Verifica o ajusta los importes de cada partida antes de emitir la entrega final</div>' +
            '</div>' +
          '</div>' +
          '<button type="button" id="btn-close-pricing-review" style="background:transparent;border:none;color:#94a3b8;font-size:18px;cursor:pointer;padding:4px 8px;">✕</button>' +
        '</div>' +
        '<div style="padding:16px 20px;display:flex;flex-direction:column;gap:12px;overflow-y:auto;">' +
          '<div style="background:rgba(15,23,42,0.6);border:1px solid rgba(56,189,248,0.25);border-radius:8px;padding:8px 12px;display:flex;justify-content:space-between;align-items:center;font-size:10px;">' +
            '<div style="display:flex;align-items:center;gap:6px;color:#38BDF8;font-weight:800;">' +
              '<span>⚡</span>' +
              '<span id="pricing-modal-project-info">Proyecto: 0 paneles (0.00 kWp)</span>' +
            '</div>' +
            '<div id="pricing-modal-equip-info" style="color:#94a3b8;font-size: 10px;text-align:right;">Inversor / Batería</div>' +
          '</div>' +

          '<!-- SECCIÓN 1: DATOS DE FACTURACIÓN DEL CLIENTE -->' +
          '<div style="background:rgba(30,41,59,0.5);border:1px solid rgba(56,189,248,0.2);border-radius:8px;padding:11px 12px;display:flex;flex-direction:column;gap:8px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;">' +
              '<div style="display:flex;align-items:center;gap:6px;">' +
                '<span style="font-size:13px;">👤</span>' +
                '<span style="font-size:10.5px;font-weight:900;color:#38BDF8;text-transform:uppercase;letter-spacing:0.5px;">Datos de Facturación del Cliente</span>' +
              '</div>' +
              '<span style="font-size:9.5px;color:#94a3b8;">Verifica los datos fiscales antes de emitir</span>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:1.5fr 1fr 1fr;gap:8px;">' +
              '<div>' +
                '<label style="display:block;font-size:9px;color:#94a3b8;font-weight:700;margin-bottom:2px;">Titular / Razón Social</label>' +
                '<input type="text" id="pricing-cust-nombre" placeholder="Nombre o Empresa" style="width:100%;box-sizing:border-box;padding:4px 7px;background:rgba(0,0,0,0.4);border:1px solid #475569;border-radius:5px;color:#fff;font-size:10.5px;font-weight:700;">' +
              '</div>' +
              '<div>' +
                '<label style="display:block;font-size:9px;color:#94a3b8;font-weight:700;margin-bottom:2px;">NIF / CIF</label>' +
                '<input type="text" id="pricing-cust-nif" placeholder="00000000X" style="width:100%;box-sizing:border-box;padding:4px 7px;background:rgba(0,0,0,0.4);border:1px solid #475569;border-radius:5px;color:#fff;font-size:10.5px;font-weight:700;">' +
              '</div>' +
              '<div>' +
                '<label style="display:block;font-size:9px;color:#94a3b8;font-weight:700;margin-bottom:2px;">Teléfono</label>' +
                '<input type="text" id="pricing-cust-tel" placeholder="+34 600..." style="width:100%;box-sizing:border-box;padding:4px 7px;background:rgba(0,0,0,0.4);border:1px solid #475569;border-radius:5px;color:#fff;font-size:10.5px;">' +
              '</div>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:1.5fr 1fr 1fr;gap:8px;">' +
              '<div>' +
                '<label style="display:block;font-size:9px;color:#94a3b8;font-weight:700;margin-bottom:2px;">Email de Contacto</label>' +
                '<input type="email" id="pricing-cust-email" placeholder="cliente@correo.com" style="width:100%;box-sizing:border-box;padding:4px 7px;background:rgba(0,0,0,0.4);border:1px solid #475569;border-radius:5px;color:#fff;font-size:10.5px;">' +
              '</div>' +
              '<div style="grid-column: span 2;">' +
                '<label style="display:block;font-size:9px;color:#94a3b8;font-weight:700;margin-bottom:2px;">Dirección de Instalación / Fiscal</label>' +
                '<input type="text" id="pricing-cust-dir" placeholder="Calle, número, polígono..." style="width:100%;box-sizing:border-box;padding:4px 7px;background:rgba(0,0,0,0.4);border:1px solid #475569;border-radius:5px;color:#fff;font-size:10.5px;">' +
              '</div>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:1.2fr 1fr 0.8fr;gap:8px;">' +
              '<div>' +
                '<label style="display:block;font-size:9px;color:#94a3b8;font-weight:700;margin-bottom:2px;">Municipio</label>' +
                '<input type="text" id="pricing-cust-mun" placeholder="Municipio" style="width:100%;box-sizing:border-box;padding:4px 7px;background:rgba(0,0,0,0.4);border:1px solid #475569;border-radius:5px;color:#fff;font-size:10.5px;">' +
              '</div>' +
              '<div>' +
                '<label style="display:block;font-size:9px;color:#94a3b8;font-weight:700;margin-bottom:2px;">Provincia</label>' +
                '<input type="text" id="pricing-cust-prov" placeholder="Provincia" style="width:100%;box-sizing:border-box;padding:4px 7px;background:rgba(0,0,0,0.4);border:1px solid #475569;border-radius:5px;color:#fff;font-size:10.5px;">' +
              '</div>' +
              '<div>' +
                '<label style="display:block;font-size:9px;color:#94a3b8;font-weight:700;margin-bottom:2px;">Código Postal</label>' +
                '<input type="text" id="pricing-cust-cp" placeholder="28001" style="width:100%;box-sizing:border-box;padding:4px 7px;background:rgba(0,0,0,0.4);border:1px solid #475569;border-radius:5px;color:#fff;font-size:10.5px;">' +
              '</div>' +
            '</div>' +
          '</div>' +

          '<!-- SECCIÓN 2: DATOS DE CONSUMO ELÉCTRICO Y SUMINISTRO (CLAVE DE RENTABILIDAD) -->' +
          '<div style="background:rgba(30,41,59,0.5);border:1px solid rgba(245,158,11,0.25);border-radius:8px;padding:11px 12px;display:flex;flex-direction:column;gap:8px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;">' +
              '<div style="display:flex;align-items:center;gap:6px;">' +
                '<span style="font-size:13px;">📊</span>' +
                '<span style="font-size:10.5px;font-weight:900;color:#FBBF24;text-transform:uppercase;letter-spacing:0.5px;">Consumo &amp; Parámetros Eléctricos del Cliente</span>' +
              '</div>' +
              '<span style="font-size:9.5px;color:#FDE68A;">Condicionan el ahorro anual, retorno y amortización</span>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:8px;">' +
              '<div>' +
                '<label style="display:block;font-size:9px;color:#94a3b8;font-weight:700;margin-bottom:2px;">Consumo Anual Total</label>' +
                '<div style="display:flex;align-items:center;gap:4px;">' +
                  '<input type="number" id="pricing-cust-consumo" min="100" max="1000000" step="50" style="width:100%;box-sizing:border-box;padding:4px 7px;background:rgba(0,0,0,0.4);border:1px solid #F59E0B;border-radius:5px;color:#FDE68A;font-size:11px;font-weight:800;text-align:right;">' +
                  '<span style="font-size:10px;color:#94a3b8;white-space:nowrap;">kWh/año</span>' +
                '</div>' +
              '</div>' +
              '<div>' +
                '<label style="display:block;font-size:9px;color:#94a3b8;font-weight:700;margin-bottom:2px;">Potencia Contratada</label>' +
                '<div style="display:flex;align-items:center;gap:4px;">' +
                  '<input type="number" id="pricing-cust-potcontr" min="0.5" max="500" step="0.25" style="width:100%;box-sizing:border-box;padding:4px 7px;background:rgba(0,0,0,0.4);border:1px solid #475569;border-radius:5px;color:#fff;font-size:11px;font-weight:700;text-align:right;">' +
                  '<span style="font-size:10px;color:#94a3b8;white-space:nowrap;">kW</span>' +
                '</div>' +
              '</div>' +
              '<div>' +
                '<label style="display:block;font-size:9px;color:#94a3b8;font-weight:700;margin-bottom:2px;">Precio Medio Red</label>' +
                '<div style="display:flex;align-items:center;gap:4px;">' +
                  '<input type="number" id="pricing-cust-precio-kwh" min="0.05" max="1.0" step="0.01" style="width:100%;box-sizing:border-box;padding:4px 7px;background:rgba(0,0,0,0.4);border:1px solid #475569;border-radius:5px;color:#fff;font-size:11px;font-weight:700;text-align:right;">' +
                  '<span style="font-size:10px;color:#94a3b8;white-space:nowrap;">€/kWh</span>' +
                '</div>' +
              '</div>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:1.8fr 1.2fr;gap:8px;">' +
              '<div>' +
                '<label style="display:block;font-size:9px;color:#94a3b8;font-weight:700;margin-bottom:2px;">Código CUPS de Suministro</label>' +
                '<input type="text" id="pricing-cust-cups" placeholder="ES0021..." style="width:100%;box-sizing:border-box;padding:4px 7px;background:rgba(0,0,0,0.4);border:1px solid #475569;border-radius:5px;color:#38BDF8;font-size:10.5px;font-family:monospace;font-weight:700;">' +
              '</div>' +
              '<div>' +
                '<label style="display:block;font-size:9px;color:#94a3b8;font-weight:700;margin-bottom:2px;">Distribuidora Eléctrica</label>' +
                '<select id="pricing-cust-dist" style="width:100%;box-sizing:border-box;padding:4px 6px;background:rgba(0,0,0,0.4);border:1px solid #475569;border-radius:5px;color:#fff;font-size:10px;">' +
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
          '<div style="background:rgba(30,41,59,0.5);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:9px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;">' +
              '<div style="font-size:10px;font-weight:900;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">' +
                'Partidas de Coste Directo (Instalación Llave en Mano)' +
              '</div>' +
              '<div style="display:flex;align-items:center;gap:6px;">' +
                '<button type="button" id="btn-ai-survey-pricing" style="padding:3px 8px;background:rgba(167,139,250,0.15);border:1px solid rgba(167,139,250,0.4);border-radius:5px;color:#C084FC;font-size:9.5px;font-weight:800;cursor:pointer;display:flex;align-items:center;gap:4px;" title="Consultar a Google Gemini los precios actuales de mercado en España para estos equipos">✨ Sondeo Precios (IA Gemini)</button>' +
                '<button type="button" id="btn-reset-pricing-to-design" style="padding:3px 8px;background:rgba(56,189,248,0.15);border:1px solid rgba(56,189,248,0.4);border-radius:5px;color:#38BDF8;font-size:9.5px;font-weight:800;cursor:pointer;" title="Recalcular todas las partidas automáticamente a partir del diseño 3D y equipos seleccionados">🔄 Recalcular según diseño</button>' +
              '</div>' +
            '</div>' +
            '<div id="pricing-ai-survey-banner" style="display:none;background:rgba(147,51,234,0.12);border:1px solid rgba(168,85,247,0.35);border-radius:6px;padding:8px 10px;font-size:10px;color:#E9D5FF;line-height:1.4;">' +
              '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">' +
                '<span style="font-weight:800;color:#C084FC;">✨ SONDEO DE MERCADO IA (GOOGLE GEMINI)</span>' +
                '<button type="button" id="btn-apply-ai-pricing" style="padding:2px 8px;background:#9333EA;color:#fff;border:none;border-radius:4px;font-size:9.5px;font-weight:800;cursor:pointer;display:none;">Aplicar Precios Sugeridos</button>' +
              '</div>' +
              '<div id="pricing-ai-survey-text">Consultando tarifas mayoristas y de instalador en España...</div>' +
            '</div>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.05);">' +
              '<div>' +
                '<div style="font-size:11px;font-weight:800;color:#f8fafc;display:flex;align-items:center;gap:5px;"><span>🟦</span> <span id="pricing-title-panels">Módulos Fotovoltaicos Tier-1</span></div>' +
                '<div id="pricing-subtext-panels" style="font-size: 10px;color:#94a3b8;">0 módulos en cubierta</div>' +
              '</div>' +
              '<div style="display:flex;align-items:center;gap:8px;">' +
                '<div style="display:flex;align-items:center;gap:4px;">' +
                  '<input type="number" id="pricing-input-panel-price" min="40" max="1000" step="1" style="width:75px;padding:4px 6px;background:rgba(0,0,0,0.4);border:1px solid #475569;border-radius:6px;color:#fff;font-size:11px;font-weight:700;text-align:right;">' +
                  '<span style="font-size:10px;color:#94a3b8;">€/ud</span>' +
                '</div>' +
                '<span id="pricing-row-panel-subtotal" style="font-size:11px;font-weight:800;color:#38BDF8;min-width:65px;text-align:right;">0 €</span>' +
              '</div>' +
            '</div>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.05);">' +
              '<div>' +
                '<div style="font-size:11px;font-weight:800;color:#f8fafc;display:flex;align-items:center;gap:5px;"><span>🏗️</span> Estructura Soporte &amp; Perfilería</div>' +
                '<div id="pricing-subtext-est" style="font-size: 10px;color:#94a3b8;">Perfilería continua de aluminio y fijaciones A2</div>' +
              '</div>' +
              '<div style="display:flex;align-items:center;gap:4px;">' +
                '<input type="number" id="pricing-input-est-price" min="0" max="50000" step="25" style="width:90px;padding:4px 6px;background:rgba(0,0,0,0.4);border:1px solid #475569;border-radius:6px;color:#fff;font-size:11px;font-weight:700;text-align:right;">' +
                '<span style="font-size:10px;color:#94a3b8;">€</span>' +
              '</div>' +
            '</div>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.05);">' +
              '<div>' +
                '<div style="font-size:11px;font-weight:800;color:#f8fafc;display:flex;align-items:center;gap:5px;"><span>⚡</span> Inversor / Microinversores</div>' +
                '<div id="pricing-subtext-inv" style="font-size: 10px;color:#94a3b8;">Sistema de conversión eléctrica y monitorización</div>' +
              '</div>' +
              '<div style="display:flex;align-items:center;gap:4px;">' +
                '<input type="number" id="pricing-input-inv-price" min="0" max="50000" step="50" style="width:90px;padding:4px 6px;background:rgba(0,0,0,0.4);border:1px solid #475569;border-radius:6px;color:#fff;font-size:11px;font-weight:700;text-align:right;">' +
                '<span style="font-size:10px;color:#94a3b8;">€</span>' +
              '</div>' +
            '</div>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.05);">' +
              '<div>' +
                '<div style="font-size:11px;font-weight:800;color:#f8fafc;display:flex;align-items:center;gap:5px;"><span>🔋</span> Batería de Acumulación (LiFePO4)</div>' +
                '<div id="pricing-subtext-bat" style="font-size: 10px;color:#94a3b8;">Almacenamiento modular (0 € si no aplica)</div>' +
              '</div>' +
              '<div style="display:flex;align-items:center;gap:4px;">' +
                '<input type="number" id="pricing-input-bat-price" min="0" max="50000" step="50" style="width:90px;padding:4px 6px;background:rgba(0,0,0,0.4);border:1px solid #475569;border-radius:6px;color:#fff;font-size:11px;font-weight:700;text-align:right;">' +
                '<span style="font-size:10px;color:#94a3b8;">€</span>' +
              '</div>' +
            '</div>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.05);">' +
              '<div>' +
                '<div style="font-size:11px;font-weight:800;color:#f8fafc;display:flex;align-items:center;gap:5px;"><span>🔌</span> Cableado, Conducciones &amp; Cuadros</div>' +
                '<div id="pricing-subtext-cab" style="font-size: 10px;color:#94a3b8;">Líneas solares ZZ-F, cuadro DC/AC, protecciones SPD y tierras</div>' +
              '</div>' +
              '<div style="display:flex;align-items:center;gap:4px;">' +
                '<input type="number" id="pricing-input-cab-price" min="0" max="25000" step="25" style="width:90px;padding:4px 6px;background:rgba(0,0,0,0.4);border:1px solid #475569;border-radius:6px;color:#fff;font-size:11px;font-weight:700;text-align:right;">' +
                '<span style="font-size:10px;color:#94a3b8;">€</span>' +
              '</div>' +
            '</div>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.05);">' +
              '<div>' +
                '<div style="font-size:11px;font-weight:800;color:#f8fafc;display:flex;align-items:center;gap:5px;"><span>👷</span> Mano de Obra &amp; Montaje</div>' +
                '<div style="font-size: 10px;color:#94a3b8;">Instalación completa, seguridad en altura y puesta en marcha</div>' +
              '</div>' +
              '<div style="display:flex;align-items:center;gap:4px;">' +
                '<input type="number" id="pricing-input-mo-price" min="0" max="30000" step="50" style="width:90px;padding:4px 6px;background:rgba(0,0,0,0.4);border:1px solid #475569;border-radius:6px;color:#fff;font-size:11px;font-weight:700;text-align:right;">' +
                '<span style="font-size:10px;color:#94a3b8;">€</span>' +
              '</div>' +
            '</div>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;">' +
              '<div>' +
                '<div style="font-size:11px;font-weight:800;color:#f8fafc;display:flex;align-items:center;gap:5px;"><span>📑</span> Legalización, Proyecto &amp; CIE</div>' +
                '<div style="font-size: 10px;color:#94a3b8;">Memoria técnica / proyecto, tasas de Industria y boletín oficial</div>' +
              '</div>' +
              '<div style="display:flex;align-items:center;gap:4px;">' +
                '<input type="number" id="pricing-input-leg-price" min="0" max="15000" step="25" style="width:90px;padding:4px 6px;background:rgba(0,0,0,0.4);border:1px solid #475569;border-radius:6px;color:#fff;font-size:11px;font-weight:700;text-align:right;">' +
                '<span style="font-size:10px;color:#94a3b8;">€</span>' +
              '</div>' +
            '</div>' +
            '<div id="pricing-row-wind" style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-top:1px solid rgba(255,255,255,0.05);">' +
              '<div>' +
                '<div style="font-size:11px;font-weight:800;color:#f8fafc;display:flex;align-items:center;gap:5px;"><span>💨</span> Aerogeneradores &amp; Soporte Eólico</div>' +
                '<div id="pricing-subtext-wind" style="font-size: 10px;color:#94a3b8;">Turbinas eólicas, mástil, zapata y resistencia dump load</div>' +
              '</div>' +
              '<div style="display:flex;align-items:center;gap:4px;">' +
                '<input type="number" id="pricing-input-wind-price" min="0" max="200000" step="50" style="width:90px;padding:4px 6px;background:rgba(0,0,0,0.4);border:1px solid #475569;border-radius:6px;color:#fff;font-size:11px;font-weight:700;text-align:right;">' +
                '<span style="font-size:10px;color:#94a3b8;">€</span>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div style="background:rgba(30,41,59,0.5);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:8px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;">' +
              '<div>' +
                '<div style="font-size:11px;font-weight:800;color:#FBBF24;">Margen Comercial Deseado</div>' +
                '<div style="font-size: 10px;color:#94a3b8;">Beneficio bruto aplicado sobre la suma de costes directos</div>' +
              '</div>' +
              '<div style="display:flex;align-items:center;gap:4px;">' +
                '<input type="number" id="pricing-input-margin-pct" min="0" max="100" step="1" style="width:65px;padding:4px 6px;background:rgba(0,0,0,0.4);border:1px solid #F59E0B;border-radius:6px;color:#FBBF24;font-size:11px;font-weight:800;text-align:right;">' +
                '<span style="font-size:11px;color:#FBBF24;font-weight:800;">%</span>' +
              '</div>' +
            '</div>' +
            '<div style="display:flex;gap:6px;">' +
              '<button type="button" class="btn-preset-margin" data-margin="10" style="flex:1;padding:4px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:4px;color:#cbd5e1;font-size:10px;font-weight:700;cursor:pointer;">10%</button>' +
              '<button type="button" class="btn-preset-margin" data-margin="15" style="flex:1;padding:4px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:4px;color:#cbd5e1;font-size:10px;font-weight:700;cursor:pointer;">15%</button>' +
              '<button type="button" class="btn-preset-margin" data-margin="20" style="flex:1;padding:4px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:4px;color:#cbd5e1;font-size:10px;font-weight:700;cursor:pointer;">20%</button>' +
              '<button type="button" class="btn-preset-margin" data-margin="25" style="flex:1;padding:4px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:4px;color:#cbd5e1;font-size:10px;font-weight:700;cursor:pointer;">25%</button>' +
              '<button type="button" class="btn-preset-margin" data-margin="30" style="flex:1;padding:4px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:4px;color:#cbd5e1;font-size:10px;font-weight:700;cursor:pointer;">30%</button>' +
            '</div>' +
          '</div>' +
          '<div style="background:linear-gradient(135deg,rgba(16,185,129,0.12),rgba(5,150,105,0.06));border:1px solid rgba(16,185,129,0.3);border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:5px;">' +
            '<div style="display:flex;justify-content:space-between;font-size:10.5px;color:#94a3b8;">' +
              '<span>Coste Directo Total:</span>' +
              '<b id="pricing-preview-direct" style="color:#f8fafc;">0 €</b>' +
            '</div>' +
            '<div style="display:flex;justify-content:space-between;font-size:10.5px;color:#34D399;">' +
              '<span>Beneficio Comercial:</span>' +
              '<b id="pricing-preview-margin">+0 €</b>' +
            '</div>' +
            '<div style="display:flex;justify-content:space-between;font-size:10.5px;color:#94a3b8;">' +
              '<span>Base Imponible (Venta sin IVA):</span>' +
              '<b id="pricing-preview-subtotal" style="color:#f8fafc;">0 €</b>' +
            '</div>' +
            '<div style="display:flex;justify-content:space-between;font-size:10.5px;color:#94a3b8;">' +
              '<span>IVA (21%):</span>' +
              '<b id="pricing-preview-iva" style="color:#cbd5e1;">0 €</b>' +
            '</div>' +
            '<hr style="border:0;border-top:1px solid rgba(16,185,129,0.25);margin:4px 0;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;">' +
              '<span style="font-size:11px;font-weight:900;color:#34D399;text-transform:uppercase;">TOTAL LLAVE EN MANO:</span>' +
              '<b id="pricing-preview-total" style="font-size:17px;color:#fff;font-weight:900;">0 €</b>' +
            '</div>' +
          '</div>' +
          '<!-- INDICADORES CLAVE DE RENTABILIDAD EN TIEMPO REAL -->' +
          '<div style="background:rgba(15,23,42,0.6);border:1px solid rgba(56,189,248,0.25);border-radius:8px;padding:9px 12px;display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;text-align:center;">' +
            '<div style="background:rgba(30,41,59,0.7);padding:6px;border-radius:6px;border:1px solid rgba(255,255,255,0.05);">' +
              '<div id="pricing-metric-ahorro" style="font-size:12px;font-weight:900;color:#10B981;">0 €/año</div>' +
              '<div style="font-size:8.5px;color:#94a3b8;font-weight:700;text-transform:uppercase;">Ahorro Año 1</div>' +
            '</div>' +
            '<div style="background:rgba(30,41,59,0.7);padding:6px;border-radius:6px;border:1px solid rgba(255,255,255,0.05);">' +
              '<div id="pricing-metric-payback" style="font-size:12px;font-weight:900;color:#F59E0B;">0.0 años</div>' +
              '<div style="font-size:8.5px;color:#94a3b8;font-weight:700;text-transform:uppercase;">Retorno (Payback)</div>' +
            '</div>' +
            '<div style="background:rgba(30,41,59,0.7);padding:6px;border-radius:6px;border:1px solid rgba(255,255,255,0.05);">' +
              '<div id="pricing-metric-tir" style="font-size:12px;font-weight:900;color:#38BDF8;">0.0 %</div>' +
              '<div style="font-size:8.5px;color:#94a3b8;font-weight:700;text-transform:uppercase;">TIR Anual</div>' +
            '</div>' +
            '<div style="background:rgba(30,41,59,0.7);padding:6px;border-radius:6px;border:1px solid rgba(255,255,255,0.05);">' +
              '<div id="pricing-metric-autoconsumo" style="font-size:12px;font-weight:900;color:#A855F7;">0 %</div>' +
              '<div style="font-size:8.5px;color:#94a3b8;font-weight:700;text-transform:uppercase;">Autoconsumo</div>' +
            '</div>' +
          '</div>' +
          '<!-- BLOQUE DE RESUMEN EJECUTIVO COMERCIAL CON GEMINI -->' +
          '<div style="background:rgba(30,41,59,0.5);border:1px solid rgba(168,85,247,0.35);border-radius:8px;padding:11px 12px;display:flex;flex-direction:column;gap:7px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;">' +
              '<div style="display:flex;align-items:center;gap:6px;">' +
                '<span style="font-size:14px;">✨</span>' +
                '<span style="font-size:10.5px;font-weight:900;color:#C084FC;text-transform:uppercase;letter-spacing:0.5px;">Resumen Comercial con IA (Google Gemini)</span>' +
              '</div>' +
              '<button type="button" id="btn-modal-generate-ai-summary" style="padding:3px 9px;background:rgba(168,85,247,0.2);border:1px solid rgba(168,85,247,0.5);border-radius:5px;color:#E9D5FF;font-size:9.5px;font-weight:800;cursor:pointer;display:flex;align-items:center;gap:4px;" title="Redactar o actualizar el resumen ejecutivo de la propuesta con Gemini">' +
                '<span>⚡ Generar / Previsualizar</span>' +
              '</button>' +
            '</div>' +
            '<div id="modal-ai-summary-box" contenteditable="true" style="background:rgba(15,23,42,0.7);border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:8px 10px;font-size:10px;line-height:1.45;color:#E2E8F0;min-height:48px;max-height:130px;overflow-y:auto;outline:none;" title="Haz clic para editar manualmente el texto">' +
              '<span style="color:#94a3b8;font-style:italic;">Pulsa en &laquo;Generar / Previsualizar&raquo; para redactar el resumen con IA adaptado a los datos y equipos de este proyecto, o edítalo directamente aquí.</span>' +
            '</div>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;font-size:9px;color:#94a3b8;">' +
              '<span id="modal-ai-summary-status">💡 Este texto aparecerá destacado en la Oferta Bancable (PDF). Puedes editarlo libremente.</span>' +
              '<button type="button" id="btn-modal-clear-ai-summary" style="background:none;border:none;color:#94a3b8;font-size:9px;cursor:pointer;text-decoration:underline;padding:0;">Restablecer plantilla</button>' +
            '</div>' +
          '</div>' +
          '<div style="display:flex;flex-direction:column;gap:4px;">' +
            '<label style="display:flex;align-items:center;gap:8px;font-size:10px;color:#cbd5e1;cursor:pointer;">' +
              '<input type="checkbox" id="pricing-check-save-defaults" checked style="accent-color:#10b981;">' +
              'Guardar estos costes y margen como mis valores habituales para futuros proyectos' +
            '</label>' +
          '</div>' +
        '</div>' +
        '<div style="padding:12px 20px;background:rgba(0,0,0,0.5);border-top:1px solid rgba(255,255,255,0.08);display:flex;justify-content:flex-end;gap:10px;flex-shrink:0;">' +
          '<button type="button" id="btn-cancel-pricing-review" style="padding:7px 14px;background:transparent;border:1px solid #475569;border-radius:6px;color:#cbd5e1;font-size:11px;font-weight:700;cursor:pointer;">CANCELAR</button>' +
          '<button type="button" id="btn-confirm-pricing-review" style="padding:7px 18px;background:linear-gradient(135deg,#059669,#10B981);border:none;border-radius:6px;color:#fff;font-size:11px;font-weight:900;cursor:pointer;display:flex;align-items:center;gap:6px;box-shadow:0 0 12px rgba(16,185,129,0.3);">' +
            '🚀 CONFIRMAR Y EMITIR PRESUPUESTO' +
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
    projInfo.textContent = 'Proyecto: ' + numPanels + ' módulos (' + kwp.toFixed(2) + ' kWp)' + (mb && mb.isMultiModule ? ' [Multi-Modelo]' : '');
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
    var invDesc = eq ? (eq.invBrand ? (eq.invBrand + ' ' + eq.invModel) : eq.invName) : 'Inversor principal';
    var batDesc = (eq && eq.hasBat) ? (eq.batBrand ? (eq.batBrand + ' ' + eq.batModel) : eq.batName) : 'Sin batería';
    equipInfo.textContent = invDesc + ' · ' + batDesc;
  }
  if (subtextPanels) {
    if (mb && mb.isMultiModule && window.RAModulesBreakdown && typeof window.RAModulesBreakdown.formatModuleSummaryText === 'function') {
      subtextPanels.textContent = window.RAModulesBreakdown.formatModuleSummaryText(mb);
    } else {
      subtextPanels.textContent = numPanels + ' módulos de ' + (d.cfg && d.cfg.potencia ? d.cfg.potencia : 450) + ' Wp instalados en cubierta';
    }
  }
  if (subtextInv && eq) {
    subtextInv.textContent = eq.invName || 'Sistema de conversión e inversor';
  }
  if (subtextBat && eq) {
    subtextBat.textContent = eq.hasBat ? eq.batName : 'Sin sistema de acumulación electroquímica';
  }
  // Pre-cargar valores dinámicos calculados desde la ingeniería del proyecto actual
  var designCosts = RAPricing.computeDesignCosts(numPanels);
  var subtextEst = document.getElementById('pricing-subtext-est');
  if (subtextEst && designCosts) {
    if (designCosts.isPergola) {
      subtextEst.innerHTML = '<b style="color:#38BDF8;">Pérgola Elevada (H = ' + designCosts.pergolaClearance.toFixed(2) + ' m)</b> · Pórticos y pilares anclados a forjado';
    } else {
      subtextEst.textContent = 'Perfilería continua de aluminio y fijaciones A2';
    }
  }
  var hasActiveSessionOverride = Boolean(RAPricing.currentSessionPricing && RAPricing.currentSessionPricing.projectFingerprint === RAPricing.getProjectFingerprint(numPanels));
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
  var initWind = (pricing && typeof pricing.windPrice === 'number' && pricing.windPrice >= 0) ? pricing.windPrice : (designCosts.windPrice || 0);
  if (windInp) windInp.value = Math.round(initWind);
  if (rowWind) rowWind.style.display = (designCosts.windKw > 0 || initWind > 0) ? 'flex' : 'none';
  if (mgInput) mgInput.value = initialMarginPct;

  // ── INICIALIZAR Y POBLAR CAMPOS DE FACTURA & CLIENTE (SSOT) ──
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

  var curTit = (typeof readTitular === 'function') ? readTitular() : (d.tit || {});
  var curBillComp = (typeof window !== 'undefined' && window.RA && window.RA.billAuditor && window.RA.billAuditor.comparison) ? window.RA.billAuditor.comparison : null;
  var curManualCons = (typeof window !== 'undefined' && window.solarProjectConfig && window.solarProjectConfig.manualAnnualConsumptionKWh) || 0;
  if (!curManualCons) {
    var rawManualEl = document.getElementById('cfg-pres-consumo-anual') || document.getElementById('modal-cfg-pres-consumo-anual');
    if (rawManualEl && parseFloat(rawManualEl.value) > 0) curManualCons = parseFloat(rawManualEl.value);
  }
  var initConsumo = (curBillComp && curBillComp.consumoAnualKWh > 0) ? curBillComp.consumoAnualKWh : (curManualCons > 0 ? curManualCons : ((kwp >= 12) ? 18000 : 4500));
  var curPriceKwh = (curBillComp && curBillComp.precioMedioKWh > 0) ? curBillComp.precioMedioKWh : 0.18;
  var curPot = curTit.potContr || (curBillComp && curBillComp.potenciaContratadaP1) || 5.75;

  if (custNombreInput) custNombreInput.value = (curTit.nombre && curTit.nombre !== 'Titular de la Instalación') ? curTit.nombre : (curBillComp && curBillComp.titular ? curBillComp.titular : (curTit.nombre || ''));
  if (custNifInput) custNifInput.value = (curTit.nif && curTit.nif !== 'XXXXXXXXX') ? curTit.nif : (curBillComp && curBillComp.cifNif ? curBillComp.cifNif : (curTit.nif || ''));
  if (custTelInput) custTelInput.value = curTit.tel || '';
  if (custEmailInput) custEmailInput.value = curTit.email || '';
  if (custDirInput) custDirInput.value = curTit.dir || (curBillComp && curBillComp.direccionSuministro ? curBillComp.direccionSuministro : (window.solarProjectConfig && window.solarProjectConfig.address ? window.solarProjectConfig.address : ''));
  if (custMunInput) custMunInput.value = curTit.mun || (window.solarProjectConfig && window.solarProjectConfig.address ? window.solarProjectConfig.address.split(',')[0].trim() : 'Madrid');
  if (custProvInput) custProvInput.value = curTit.prov || 'Madrid';
  if (custCpInput) custCpInput.value = curTit.cp || '28001';
  if (custCupsInput) custCupsInput.value = (curTit.cups && curTit.cups !== 'ES00210000XXXXXXXXXX') ? curTit.cups : (curBillComp && curBillComp.cups ? curBillComp.cups : (curTit.cups || ''));
  if (custDistSelect && curTit.dist) custDistSelect.value = curTit.dist;
  if (custConsumoInput) custConsumoInput.value = Math.round(initConsumo);
  if (custPotContrInput) custPotContrInput.value = curPot.toFixed(2);
  if (custPrecioKwhInput) custPrecioKwhInput.value = curPriceKwh.toFixed(3);

  if (subTitle) {
    subTitle.textContent = (typeof onConfirm === 'function')
      ? 'Verifica o ajusta los importes de cada partida antes de emitir la entrega final'
      : 'Ajusta los costes unitarios y margen comercial aplicados al presupuesto del proyecto';
  }
  if (confirmBtn) {
    confirmBtn.innerHTML = (typeof onConfirm === 'function')
      ? '🚀 CONFIRMAR Y EMITIR PRESUPUESTO'
      : '💾 APLICAR PRECIOS &amp; MARGEN';
  }

  function recalculateLive() {
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
    var subtotal = directCost + marginEur;
    var iva = subtotal * 0.21;
    var capexBruto = subtotal + iva;

    // Temporal override en sesión etiquetado con la huella del proyecto actual
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
      skipReview: false
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
    var sEl = document.getElementById('pricing-preview-subtotal');
    var iEl = document.getElementById('pricing-preview-iva');
    var tEl = document.getElementById('pricing-preview-total');

    if (dEl) dEl.textContent = Math.round(directCost).toLocaleString('es-ES') + ' €';
    if (mEl) mEl.textContent = '+' + Math.round(marginEur).toLocaleString('es-ES') + ' € (' + mgPct + '%)';
    if (sEl) sEl.textContent = Math.round(subtotal).toLocaleString('es-ES') + ' €';
    if (iEl) iEl.textContent = Math.round(iva).toLocaleString('es-ES') + ' €';
    if (tEl) tEl.textContent = Math.round(capexBruto).toLocaleString('es-ES') + ' €';

    // ── CALCULAR Y ACTUALIZAR TARJETAS KPI EN TIEMPO REAL ──
    try {
      if (typeof calculateFinancialModel === 'function') {
        var m = calculateFinancialModel();
        if (m) {
          var ahorroEl = document.getElementById('pricing-metric-ahorro');
          var paybackEl = document.getElementById('pricing-metric-payback');
          var tirEl = document.getElementById('pricing-metric-tir');
          var autoconsumoEl = document.getElementById('pricing-metric-autoconsumo');

          if (ahorroEl) ahorroEl.textContent = Math.round(m.ahorroLuzAnio1 || 0).toLocaleString('es-ES') + ' €/año';
          if (paybackEl) paybackEl.textContent = (m.paybackYears ? m.paybackYears.toFixed(1) : '—') + ' años';
          if (tirEl) tirEl.textContent = (m.tir != null && isFinite(m.tir) ? m.tir.toFixed(1) + ' %' : (m.tirString || '—'));
          if (autoconsumoEl) autoconsumoEl.textContent = Math.round(m.pctAutoconsumo || m.autarquiaPct || 0) + ' %';
        }
      }
    } catch (eKpi) {
      console.warn('[PricingModal] Error recalculando KPIs en vivo:', eKpi);
    }
  }

  recalculateLive();

  [pInput, estInput, invInput, batInput, cabInput, moInput, legInput, mgInput, custConsumoInput, custPotContrInput, custPrecioKwhInput].forEach(function(inp) {
    if (inp) inp.oninput = recalculateLive;
  });

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
        if (!apiKey) apiKey = localStorage.getItem('ra_gemini_api_key') || '';
      } catch(e) {}

      if (!apiKey) {
        alert('Por favor, introduce o verifica tu API Key de Gemini en el menu Datos & Logo Empresa (Paso 5) para activar las consultas de mercado con IA.');
        return;
      }

      if (aiBanner) aiBanner.style.display = 'block';
      if (aiText) aiText.innerHTML = '⏳ <em>Consultando a Google Gemini precios medios de mercado en España para tus equipos...</em>';
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
            aiText.innerHTML = '<b>Sugerencia Gemini:</b> Módulo: <b>' + jsonResult.panelPrice + ' €/ud</b> · ' +
              'Estructura: <b>' + Math.round(jsonResult.estPrice) + ' €</b> · Inversor: <b>' + Math.round(jsonResult.invPrice) + ' €</b> · ' +
              'M.O.: <b>' + Math.round(jsonResult.moPrice) + ' €</b> · Cables/Cuadros: <b>' + Math.round(jsonResult.cabPrice) + ' €</b>.<br>' +
              '<span style="font-size:9px;color:#D8B4FE;">' + (jsonResult.resumen || '') + '</span>';
          }
          if (applyAiBtn) applyAiBtn.style.display = 'inline-block';
        } else {
          var detail = lastHttpError ? (' (' + lastHttpError + ')') : (lastRawText ? ' (Respuesta: ' + lastRawText.substring(0, 80) + '...)' : '');
          if (aiText) aiText.innerHTML = '❌ No se pudo interpretar la respuesta de Gemini' + detail + '. Comprueba la conexión o intenta de nuevo.';
        }
      } catch (errAi) {
        if (aiText) aiText.innerHTML = '❌ Error de conexión al consultar Gemini: ' + (errAi.message || errAi);
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
      if (aiText) aiText.innerHTML = '✅ <b>¡Precios sugeridos por Gemini aplicados al presupuesto!</b>';
      applyAiBtn.style.display = 'none';
    };
  }

  var resetDesignBtn = document.getElementById('btn-reset-pricing-to-design');
  if (resetDesignBtn) {
    resetDesignBtn.onclick = function() {
      var fresh = RAPricing.resetToDesign();
      if (pInput) pInput.value = fresh.panelPrice;
      if (estInput) estInput.value = fresh.estPrice;
      if (invInput) invInput.value = fresh.invPrice;
      if (batInput) batInput.value = fresh.batPrice;
      if (cabInput) cabInput.value = fresh.cabPrice;
      if (moInput) moInput.value = fresh.moPrice;
      if (legInput) legInput.value = fresh.legPrice;
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
      modalAiSummaryBox.innerHTML = _customCommercialSummary;
      if (modalAiSummaryStatus) modalAiSummaryStatus.innerHTML = '✨ Resumen personalizado listo para la oferta.';
    } else {
      modalAiSummaryBox.innerHTML = generateCommercialSummary(d, m, eq);
    }
    modalAiSummaryBox.oninput = function() {
      _customCommercialSummary = modalAiSummaryBox.innerHTML;
      if (modalAiSummaryStatus) modalAiSummaryStatus.innerHTML = '✏️ Texto editado manualmente. Se respetará en la oferta final.';
    };
  }

  if (modalClearAiSummaryBtn) {
    modalClearAiSummaryBtn.onclick = function() {
      _customCommercialSummary = null;
      if (modalAiSummaryBox) modalAiSummaryBox.innerHTML = generateCommercialSummary(d, m, eq);
      if (modalAiSummaryStatus) modalAiSummaryStatus.innerHTML = '📋 Restablecida la plantilla estándar.';
    };
  }

  if (modalGenAiSummaryBtn) {
    modalGenAiSummaryBtn.onclick = async function() {
      if (modalAiSummaryStatus) modalAiSummaryStatus.innerHTML = '⏳ <em>Consultando a Google Gemini para redactar el resumen...</em>';
      if (modalAiSummaryBox) modalAiSummaryBox.innerHTML = '<span style="color:#C084FC;">✨ Conectando con Gemini y redactando propuesta ejecutiva...</span>';
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
          if (modalAiSummaryBox) modalAiSummaryBox.innerHTML = text;
          if (modalAiSummaryStatus) modalAiSummaryStatus.innerHTML = '✅ <b>Resumen generado con éxito por Gemini.</b> Puedes retocarlo si lo deseas.';
        } else {
          throw new Error('Respuesta vacía');
        }
      } catch(eGen) {
        if (eGen.message === 'NO_API_KEY') {
          if (modalAiSummaryStatus) modalAiSummaryStatus.innerHTML = '❌ Introduce tu API Key de Gemini en el Paso 5 (Datos & Logo Empresa).';
        } else {
          if (modalAiSummaryStatus) modalAiSummaryStatus.innerHTML = '❌ No se pudo conectar con Gemini (' + (eGen.message || 'error') + '). Mostrando plantilla.';
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
      var mgPct = parseFloat(mgInput ? mgInput.value : 20) || 0;

      var newCfg = {
        panelPrice: pPrice,
        estPrice: estPrice,
        invPrice: invPrice,
        batPrice: batPrice,
        cabPrice: cabPrice,
        moPrice: moPrice,
        legPrice: legPrice,
        marginPct: mgPct,
        skipReview: false
      };

      if (checkSave && checkSave.checked) {
        RAPricing.saveDefaults(newCfg);
      } else {
        RAPricing.currentSessionPricing = newCfg;
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

      if (cNom) setVal('doc-nombre', cNom);
      if (cNif) setVal('doc-nif', cNif);
      if (cTel) setVal('doc-tel', cTel);
      if (cEmail) setVal('doc-email', cEmail);
      if (cDir) setVal('doc-dir', cDir);
      if (cMun) setVal('doc-mun', cMun);
      if (cProv) setVal('doc-prov', cProv);
      if (cCp) setVal('doc-cp', cCp);
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
        if (window.RA && window.RA.billAuditor && window.RA.billAuditor.comparison) {
          if (cConsumo > 0) window.RA.billAuditor.comparison.consumoAnualKWh = cConsumo;
          if (cPrecio > 0) window.RA.billAuditor.comparison.precioMedioKWh = cPrecio;
          if (cCups) window.RA.billAuditor.comparison.cups = cCups;
          if (cNom) window.RA.billAuditor.comparison.titular = cNom;
          if (cNif) window.RA.billAuditor.comparison.cifNif = cNif;
          if (cDir) window.RA.billAuditor.comparison.direccionSuministro = cDir;
        }
      }

      wpUpdateStep5PricingBadge();
      if (typeof updateBudgetUI === 'function') updateBudgetUI();

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
  function buildInfografiasHTML(m, pal, annualYieldKWh, layoutStyle) {
    layoutStyle = layoutStyle || 'editorial';
    var SvgCat = (typeof window !== 'undefined' && window.RA_SvgCatalog) ? window.RA_SvgCatalog : null;
    function getIcon(name, col, sz) {
      if (!SvgCat || typeof SvgCat.render !== 'function') return '';
      return SvgCat.render(name, col || pal.primary, sz || 36);
    }

    var batKwh = (m.batCap && m.batCap > 0) ? m.batCap : (m.batCost > 0 ? 5.12 : 0);
    var hasBat = batKwh > 0;
    var gastoSin = Math.round(((m.consumoAnual || 3500) * (m.precioRedEUR || 0.18)) / 12) || 120;
    var gastoCon = Math.max(15, Math.round(gastoSin - (m.ahorroMensualLuz || 65)));
    var cuotaFin = Math.round(m.cuotaMensual) || 85;
    var cuotaTotalFin = gastoCon + cuotaFin;
    var balanceFinMes = gastoSin - cuotaTotalFin;

    // Espaciado y padding adaptativo según layoutStyle
    var isEditorial = (layoutStyle === 'editorial');
    var isInfographic = (layoutStyle === 'infographic');
    var isTechnical = (layoutStyle === 'technical');

    var cardPad = isEditorial ? '18px 20px' : (isInfographic ? '16px 18px' : '12px 14px');
    var cardMargin = isEditorial ? '20px 0' : (isInfographic ? '16px 0' : '12px 0');
    var cardShadow = isEditorial ? '0 4px 16px rgba(0,0,0,0.05)' : '0 2px 8px rgba(0,0,0,0.04)';
    var cardBorder = isEditorial ? '1.5px solid #e2e8f0' : '1px solid #cbd5e1';

    // 1. Cara a cara de tu bolsillo
    var infoCaraACara = '<div style="background:#ffffff;border:' + cardBorder + ';border-radius:12px;padding:' + cardPad + ';margin:' + cardMargin + ';box-shadow:' + cardShadow + ';">' +
      '<div style="font-weight:900;font-size:12px;color:#0f172a;text-transform:uppercase;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;">' +
        '<div style="display:flex;align-items:center;gap:8px;">' +
          getIcon('savingsChart', pal.primary, 24) +
          '<span>1. El Cara a Cara de tu Bolsillo (Impacto Mensual)</span>' +
        '</div>' +
        '<span style="font-size:9.5px;color:#64748b;font-weight:700;letter-spacing:0.5px;">ESTUDIO DE FACTURA</span>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr 1.15fr;gap:14px;align-items:stretch;">' +
        '<div style="background:#fef2f2;border:1.5px solid #fecaca;border-radius:10px;padding:12px 10px;text-align:center;display:flex;flex-direction:column;justify-content:space-between;">' +
          '<div>' +
            '<div style="display:flex;justify-content:center;margin-bottom:6px;">' + getIcon('billCut', '#dc2626', 32) + '</div>' +
            '<div style="font-size:9px;font-weight:800;color:#991b1b;text-transform:uppercase;">HOY (SIN PLACAS)</div>' +
            '<div style="font-size:20px;font-weight:900;color:#dc2626;margin:4px 0;">~' + gastoSin + ' €/mes</div>' +
          '</div>' +
          '<div style="font-size:8.5px;color:#7f1d1d;line-height:1.3;margin-top:6px;">Dinero 100% perdido en alquiler a la eléctrica</div>' +
        '</div>' +
        '<div style="background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:10px;padding:12px 10px;text-align:center;display:flex;flex-direction:column;justify-content:space-between;">' +
          '<div>' +
            '<div style="display:flex;justify-content:center;margin-bottom:6px;">' + getIcon('zeroEuro', '#16a34a', 32) + '</div>' +
            '<div style="font-size:9px;font-weight:800;color:#166534;text-transform:uppercase;">CON SOLAR (CONTADO)</div>' +
            '<div style="font-size:20px;font-weight:900;color:#16a34a;margin:4px 0;">~' + gastoCon + ' €/mes</div>' +
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

    // 2. El Reloj Solar de 24 Horas
    var genDia = Math.round(annualYieldKWh / 365);
    var excDia = Math.round((m.excedenteKWh || annualYieldKWh * 0.35) / 365);
    var infoRelojSolar = '<div style="background:#ffffff;border:' + cardBorder + ';border-radius:12px;padding:' + cardPad + ';margin:' + cardMargin + ';box-shadow:' + cardShadow + ';">' +
      '<div style="font-weight:900;font-size:12px;color:#0f172a;text-transform:uppercase;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;">' +
        '<div style="display:flex;align-items:center;gap:8px;">' +
          getIcon('energyFlow24h', pal.primary, 24) +
          '<span>2. El Ciclo de 24 Horas de tu Tejado Solar</span>' +
        '</div>' +
        '<span style="font-size:9.5px;color:#64748b;font-weight:700;letter-spacing:0.5px;">AUTARQUÍA EN TIEMPO REAL</span>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">' +
        '<div style="background:#fffbeb;border:1px solid #fef3c7;border-radius:10px;padding:12px 10px;text-align:left;">' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">' +
            getIcon('morningSun', '#d97706', 28) +
            '<div style="font-size:10.5px;font-weight:900;color:#b45309;">08:00 - 11:00<br><span style="font-size:9px;font-weight:700;color:#92400e;">Despertar Solar</span></div>' +
          '</div>' +
          '<div style="font-size:9px;color:#78350f;line-height:1.4;">' +
            'Tus placas captan los primeros rayos. Cubren el consumo base matinal (frigoríficos, cafetera, consumos en espera).' +
          '</div>' +
        '</div>' +
        '<div style="background:#f0fdf4;border:1px solid #dcfce7;border-radius:10px;padding:12px 10px;text-align:left;">' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">' +
            getIcon('peakSun', '#16a34a', 28) +
            '<div style="font-size:10.5px;font-weight:900;color:#15803d;">11:00 - 17:00<br><span style="font-size:9px;font-weight:700;color:#14532d;">Pico 100% Gratis</span></div>' +
          '</div>' +
          '<div style="font-size:9px;color:#14532d;line-height:1.4;">' +
            '<b>Energía gratis (~' + genDia + ' kWh/día)</b>. Climatización sin coste. Los excedentes (~' + excDia + ' kWh/día) ' + (hasBat ? 'cargan tu batería LFP.' : 'generan saldo en tu monedero solar.') +
          '</div>' +
        '</div>' +
        '<div style="background:#f1f5f9;border:1px solid #e2e8f0;border-radius:10px;padding:12px 10px;text-align:left;">' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">' +
            getIcon('eveningMoon', '#475569', 28) +
            '<div style="font-size:10.5px;font-weight:900;color:#334155;">17:00 - 08:00<br><span style="font-size:9px;font-weight:700;color:#1e293b;">Noche Protegida</span></div>' +
          '</div>' +
          '<div style="font-size:9px;color:#475569;line-height:1.4;">' +
            (hasBat ? ('Alimentación limpia desde los <b>' + batKwh + ' kWh guardados en tu Batería</b> sin consumir de la red.') : 'Compensación nocturna automática con los excedentes vertidos a la red durante el día.') +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';

    // 3. Anatomía del Tejado Blindado (4 Escudos Técnicos)
    var infoTejadoBlindado = '<div style="background:#ffffff;border:' + cardBorder + ';border-radius:12px;padding:' + cardPad + ';margin:' + cardMargin + ';box-shadow:' + cardShadow + ';">' +
      '<div style="font-weight:900;font-size:12px;color:#0f172a;text-transform:uppercase;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;">' +
        '<div style="display:flex;align-items:center;gap:8px;">' +
          getIcon('shieldCheck', pal.primary, 24) +
          '<span>3. Seguridad Técnica & Garantías de la Instalación</span>' +
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
    var irpfEur = Math.round(m.ahorroIRPF || 0);
    var capexNet = Math.round(m.capexNeto || (m.capexBruto - ibiEur - irpfEur));
    var infoCascadaFiscal = '<div style="background:#ffffff;border:' + cardBorder + ';border-radius:12px;padding:' + cardPad + ';margin:' + cardMargin + ';box-shadow:' + cardShadow + ';">' +
      '<div style="font-weight:900;font-size:12px;color:#0f172a;text-transform:uppercase;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;">' +
        '<div style="display:flex;align-items:center;gap:8px;">' +
          getIcon('certifiedEngineer', pal.primary, 24) +
          '<span>4. La Cascada del Escudo Fiscal (Tus Ahorros en Impuestos)</span>' +
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
          '<div style="font-size:8.5px;color:#166534;font-weight:700;">Deducción IRPF (40%)</div>' +
          '<b style="font-size:13px;color:#16a34a;display:block;margin-top:2px;">' + irpfEur.toLocaleString('es-ES') + ' €</b>' +
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

function generatePropuestaComercialPDF(skipPricingModal, targetWindowName, themeOverride) {
  const d = getProjectCalcs();
  // Resiliencia AAA: si getProjectCalcs devuelve 0 paneles, intentar recuperar de caché conocida
  let numPanelsFinal = d.numPanels;
  if (!numPanelsFinal || numPanelsFinal === 0) {
    numPanelsFinal =
      (window.allRenderedPanels && window.allRenderedPanels.length > 0
        ? window.allRenderedPanels.length
        : 0) ||
      (window.lastRoofInfo && window.lastRoofInfo.panels && window.lastRoofInfo.panels.length > 0
        ? window.lastRoofInfo.panels.length
        : 0) ||
      (window.solarProjectConfig && window.solarProjectConfig.lastEstimatedPanels > 0
        ? window.solarProjectConfig.lastEstimatedPanels
        : 0);
  }
  if (!numPanelsFinal || numPanelsFinal === 0) {
    alert('Diseña primero el polígono de la instalación en el visor 3D.');
    return;
  }

  // Interceptar para revisión de precios y margen si no se ha saltado explícitamente
  if (!skipPricingModal && typeof wpOpenPricingReviewModal === 'function') {
    wpOpenPricingReviewModal(function() {
      generatePropuestaComercialPDF(true);
    });
    return;
  }
  const m = calculateFinancialModel();

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
  const theme        = themeOverride || branding.theme || 'emerald';
  const layoutStyle  = branding.layoutStyle || 'editorial'; // editorial | infographic | technical
  const eqWarranties = (typeof resolveEquipmentWarranties === 'function') ? resolveEquipmentWarranties() : {};
  const warPower     = eqWarranties.warPower || branding.warPower || '25';
  const warMod       = eqWarranties.warMod   || branding.warMod   || '15';
  const warInv       = eqWarranties.warInv   || branding.warInv   || '10';
  const warMo        = eqWarranties.warMo    || branding.warMo    || '5';
  const warBat       = eqWarranties.warBat   || '10';

  // ── Paleta de color por tema ──────────────────────────────────────────────
  const THEMES = {
    emerald: { primary: '#059669', light: '#d1fae5', accent: '#10b981', dark: '#065f46' },
    sky:     { primary: '#0284c7', light: '#e0f2fe', accent: '#38bdf8', dark: '#0c4a6e' },
    amber:   { primary: '#d97706', light: '#fef3c7', accent: '#f59e0b', dark: '#92400e' },
    slate:   { primary: '#475569', light: '#f1f5f9', accent: '#64748b', dark: '#1e293b' },
    rose:    { primary: '#e11d48', light: '#ffe4e6', accent: '#f43f5e', dark: '#881337' }
  };
  THEMES.blue = THEMES.sky;
  const pal = THEMES[theme] || THEMES.emerald;

  // ── Datos de producción (motor preciso si disponible, fallback a docs-generator) ──
  const solarStats = (window.RA && window.RA.solarStats) ? window.RA.solarStats : null;
  // [B6] Preferir el reparto mensual de la SIMULACIÓN REAL (mapa de calor) si está vigente y válido,
  // de modo que las barras mensuales cuadren con la producción anual y con la memoria técnica.
  const _simMK = (window.solarSimState && !window.solarSimState.annualHeatmapDirty && Array.isArray(window.solarSimState.monthlyKwh) && window.solarSimState.monthlyKwh.length === 12 && window.solarSimState.monthlyKwh.some(v => v > 0))
    ? window.solarSimState.monthlyKwh : null;
  const monthlyYields = _simMK || (solarStats ? solarStats.monthlyYields : d.monthly.map(mo => mo.kWh));
  const annualYieldKWh = solarStats ? solarStats.annualYieldKWh : d.annualKWh;
  const MES_CORTOS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

  // ── SVG Histograma mensual ────────────────────────────────────────────────
  function buildMonthlyHistogramSVG(yields, paleta) {
    const W = 720, H = 200, PAD_L = 50, PAD_B = 35, PAD_T = 20, PAD_R = 10;
    const chartW = W - PAD_L - PAD_R;
    const chartH = H - PAD_B - PAD_T;
    const maxVal = Math.max(...yields, 1);
    const barW = (chartW / 12) * 0.65;
    const barGap = (chartW / 12) * 0.35;
    let bars = '', labels = '', vals = '', grid = '';

    // Grid horizontal
    for (let g = 0; g <= 4; g++) {
      const y = PAD_T + chartH - (g / 4) * chartH;
      const gVal = Math.round((g / 4) * maxVal);
      grid += `<line x1="${PAD_L}" y1="${y.toFixed(1)}" x2="${W - PAD_R}" y2="${y.toFixed(1)}" stroke="#e2e8f0" stroke-width="1"/>`;
      grid += `<text x="${PAD_L - 5}" y="${(y + 4).toFixed(1)}" text-anchor="end" font-size="8" fill="#94a3b8">${gVal.toLocaleString('es-ES')}</text>`;
    }

    yields.forEach((kWh, i) => {
      const x = PAD_L + i * (chartW / 12) + barGap / 2;
      const barH = chartH * (kWh / maxVal);
      const y = PAD_T + chartH - barH;
      const isTop = kWh === maxVal;
      bars   += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" rx="2" fill="${isTop ? paleta.primary : paleta.accent}" opacity="${isTop ? '1' : '0.75'}"/>`;
      labels += `<text x="${(x + barW/2).toFixed(1)}" y="${(H - PAD_B + 12).toFixed(1)}" text-anchor="middle" font-size="8" fill="#475569">${MES_CORTOS[i]}</text>`;
      vals   += `<text x="${(x + barW/2).toFixed(1)}" y="${(y - 4).toFixed(1)}" text-anchor="middle" font-size="7.5" fill="${paleta.dark}" font-weight="700">${kWh.toLocaleString('es-ES')}</text>`;
    });

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" style="display:block;max-width:100%;">
      ${grid}${bars}${labels}${vals}
      <text x="${W/2}" y="${H - 2}" text-anchor="middle" font-size="8" fill="#94a3b8">Producción estimada mensual (kWh/mes)</text>
    </svg>`;
  }

  // ── SVG Curva de amortización (cashflow acumulado 25 años) ─────────────────
  function buildAmortizationSVG(cashflowAcum, capexBruto, paybackYears, paleta) {
    const W = 720, H = 200, PAD_L = 60, PAD_B = 35, PAD_T = 20, PAD_R = 10;
    const chartW = W - PAD_L - PAD_R;
    const chartH = H - PAD_B - PAD_T;
    const n = cashflowAcum.length;
    const minVal = Math.min(...cashflowAcum, -capexBruto * 0.1);
    const maxVal = Math.max(...cashflowAcum, 0);
    const totalRange = maxVal - minVal;

    const xOf = i => PAD_L + (i / (n - 1)) * chartW;
    const yOf = v => PAD_T + chartH - ((v - minVal) / totalRange) * chartH;

    // Línea cero
    const yZero = yOf(0);
    let svgContent = `<line x1="${PAD_L}" y1="${yZero.toFixed(1)}" x2="${W - PAD_R}" y2="${yZero.toFixed(1)}" stroke="#94a3b8" stroke-width="1" stroke-dasharray="4,3"/>`;

    // Área rellena
    let pts = `${PAD_L.toFixed(1)},${yZero.toFixed(1)} `;
    cashflowAcum.forEach((v, i) => { pts += `${xOf(i).toFixed(1)},${yOf(v).toFixed(1)} `; });
    const lastX = xOf(n-1);
    pts += `${lastX.toFixed(1)},${yZero.toFixed(1)}`;
    svgContent += `<polygon points="${pts}" fill="${paleta.light}" opacity="0.8"/>`;

    // Línea principal
    const linePoints = cashflowAcum.map((v, i) => `${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ');
    svgContent += `<polyline points="${linePoints}" fill="none" stroke="${paleta.primary}" stroke-width="2.5" stroke-linejoin="round"/>`;

    // Punto de payback
    if (paybackYears > 0 && paybackYears < n) {
      const pbX = PAD_L + (paybackYears / (n - 1)) * chartW;
      svgContent += `<circle cx="${pbX.toFixed(1)}" cy="${yZero.toFixed(1)}" r="5" fill="${paleta.primary}"/>
        <text x="${pbX.toFixed(1)}" y="${(yZero - 8).toFixed(1)}" text-anchor="middle" font-size="8" fill="${paleta.dark}" font-weight="800">Payback ${paybackYears.toFixed(1)}a</text>`;
    }

    // Eje X — años
    for (let y = 0; y <= n - 1; y += 5) {
      const xx = xOf(y);
      svgContent += `<text x="${xx.toFixed(1)}" y="${(H - PAD_B + 12).toFixed(1)}" text-anchor="middle" font-size="8" fill="#475569">Año ${y}</text>`;
    }
    // Etiqueta Y
    const fmtK = v => v >= 0 ? '+' + Math.round(v/1000) + 'k€' : Math.round(v/1000) + 'k€';
    svgContent += `<text x="${PAD_L - 5}" y="${PAD_T.toFixed(1)}" text-anchor="end" font-size="7.5" fill="#94a3b8">${fmtK(maxVal)}</text>`;
    svgContent += `<text x="${PAD_L - 5}" y="${(H - PAD_B).toFixed(1)}" text-anchor="end" font-size="7.5" fill="#94a3b8">${fmtK(minVal)}</text>`;

    svgContent += `<text x="${W/2}" y="${H - 2}" text-anchor="middle" font-size="8" fill="#94a3b8">Retorno de inversión acumulado a 25 años (€)</text>`;

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" style="display:block;max-width:100%;">${svgContent}</svg>`;
  }

  const histogramSVG = buildMonthlyHistogramSVG(monthlyYields, pal);
  const cashflowData = m.cashflowAcum || [];
  const amortSVG = cashflowData.length > 0
    ? buildAmortizationSVG(cashflowData, m.capexBruto, m.paybackYears, pal)
    : '<p style="color:#94a3b8;font-size:10px;text-align:center">Configure los datos financieros para ver la curva de amortización.</p>';

  // ── Resolución de equipos del catálogo (SSOT) ──────────────────────────────
  const _eqp = resolveEquipmentNames();
  // ── Resumen comercial para el cliente ──────────────────────────────────────
  const _summaryHTML = generateCommercialSummary(d, m, _eqp);


  // ── Logo de empresa ───────────────────────────────────────────────────────
  const logoBlock = logoDataUrl
    ? `<img src="${logoDataUrl}" style="max-height:56px;max-width:160px;object-fit:contain;" alt="Logo empresa"/>`
    : `<div style="font-size:22px;font-weight:900;color:${pal.primary};letter-spacing:-0.5px;">
        ${companyName.split(' ').slice(0,2).join('<span style="color:${pal.accent}">⚡</span>')}
      </div>`;

  const contactBlock = [companyPhone, companyWeb].filter(Boolean).join(' · ');

    // Factor de margen para desglose comercial de cliente (oculta costes directos y margen industrial)
  const _mFactor = (m.directCost > 0) ? (m.subtotal / m.directCost) : 1.20;
  const _cPan = Math.round(m.panCost * _mFactor);
  const _cEst = Math.round(m.estCost * _mFactor);
  const _cInv = Math.round(m.invCost * _mFactor);
  const _cBat = Math.round(m.batCost * _mFactor);
  const _cCab = Math.round(m.cabCost * _mFactor);
  const _cMo  = Math.round(m.moCost * _mFactor);
  const _cLeg = Math.max(0, Math.round(m.subtotal) - (_cPan + _cEst + _cInv + _cBat + _cCab + _cMo));
  // Recuperación resiliente de fotos personalizadas persistidas (por proyecto o sesión)
  const _propPhotos = (function() {
    try {
      const mem = (typeof window !== 'undefined' && window.RA && window.RA._proposalCustomPhotos) ? window.RA._proposalCustomPhotos : null;
      if (mem) return mem;
      const ss = (typeof sessionStorage !== 'undefined') ? JSON.parse(sessionStorage.getItem('ra_proposal_custom_photos') || '{}') : {};
      return ss || {};
    } catch (e) { return {}; }
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

  const _commCfgForPages = (typeof RAPricing !== 'undefined' && typeof RAPricing.getCommercialConfig === 'function') ? RAPricing.getCommercialConfig() : null;
  const windTurbineCount = (typeof window !== 'undefined' && Array.isArray(window.windTurbines))
    ? window.windTurbines.filter(t => t && (!t.operationalState || t.operationalState.enabled !== false)).length
    : ((typeof designCosts !== 'undefined' && designCosts && designCosts.windCount) || 0);
  const _hasThreePkgs = Boolean(_commCfgForPages && _commCfgForPages.showThreePackagesComparison);
  const _totPages = _hasThreePkgs ? 7 : 6;
  const _pageIndexComparativa = 4;
  const _pageIndexProduccion = _hasThreePkgs ? 5 : 4;
  const _pageIndexPresupuesto = _hasThreePkgs ? 6 : 5;
  const _pageIndexDecision = _totPages;
  const _infografias = buildInfografiasHTML(m, pal, annualYieldKWh, layoutStyle);
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
    iva: m.iva,
    capexBruto: m.capexBruto,
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
    <style>
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      body { background: #f1f5f9; font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; padding: 20px; display: flex; flex-direction: column; align-items: center; padding-top: 70px; }
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
        padding: 24mm 22mm 20mm;
        background: #ffffff;
        position: relative;
      }
      .cover-brand-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding-bottom: 18px;
        border-bottom: 3.5px solid ${pal.primary};
      }
      .cover-brand-meta {
        text-align: right;
        font-size: 11px;
        color: #475569;
        line-height: 1.5;
      }
      .cover-hero-title {
        margin: 16px 0 12px;
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
        margin-bottom: 12px;
        border: 1px solid ${pal.accent};
      }
      .cover-hero-h1 {
        font-size: 26px;
        font-weight: 900;
        color: #0f172a;
        letter-spacing: -0.6px;
        line-height: 1.25;
        text-transform: uppercase;
      }
      .cover-hero-sub {
        font-size: 13px;
        color: #64748b;
        margin-top: 8px;
        font-weight: 600;
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
        gap: 10px;
        margin: 6px 0 14px;
      }
      .cover-spec-box {
        background: #f8fafc;
        border: 1.5px solid #e2e8f0;
        border-radius: 10px;
        padding: 10px 8px;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        justify-content: space-between;
        min-height: 110px;
        box-shadow: 0 2px 6px rgba(0,0,0,0.03);
        transition: all 0.2s ease;
      }
      .cover-spec-box.highlight {
        background: linear-gradient(135deg, ${pal.light}, #ffffff);
        border: 2px solid ${pal.primary};
        box-shadow: 0 4px 14px rgba(0,0,0,0.06);
      }
      .cover-spec-icon {
        width: 48px;
        height: 48px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #ffffff;
        border: 1.5px solid #e2e8f0;
        border-radius: 12px;
        margin-bottom: 8px;
        box-shadow: 0 1px 4px rgba(0,0,0,0.03);
      }
      .cover-spec-label {
        font-size: 9.5px;
        font-weight: 800;
        color: #64748b;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 4px;
      }
      .cover-spec-val {
        font-size: 18px;
        font-weight: 900;
        color: #0f172a;
        line-height: 1.2;
      }
      .cover-spec-val.primary {
        color: ${pal.primary};
      }
      .cover-spec-sub {
        font-size: 9px;
        color: #64748b;
        margin-top: 4px;
        font-weight: 600;
      }
      .cover-footer {
        padding-top: 14px;
        border-top: 1px solid #e2e8f0;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 10px;
        color: #94a3b8;
      }
      .tech-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin: 16px 0 20px; }
      .tech-card { border: 1.5px solid #e2e8f0; border-radius: 12px; padding: 18px 14px; background: #f8fafc; display: flex; flex-direction: column; align-items: center; text-align: center; justify-content: space-between; min-height: 195px; box-shadow: 0 2px 6px rgba(0,0,0,0.03); transition: all 0.2s ease; }
      .tech-card:hover { border-color: ${pal.primary}; box-shadow: 0 6px 16px rgba(0,0,0,0.06); }
      .tech-icon-box { width: 68px; height: 68px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: #ffffff; border: 2px solid #e2e8f0; border-radius: 16px; margin-bottom: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
      .tech-info { width: 100%; display: flex; flex-direction: column; align-items: center; margin-bottom: 10px; }
      .tech-label { font-size: 9px; font-weight: 900; color: #64748b; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 4px; }
      .tech-name { font-size: 11.5px; font-weight: 900; color: #0f172a; line-height: 1.35; max-width: 100%; word-break: break-word; }
      .tech-sub { font-size: 9.5px; color: #64748b; line-height: 1.3; margin-top: 4px; }
      .tech-badge { width: 100%; text-align: center; background: #ffffff; border: 1.5px solid #cbd5e1; border-radius: 8px; padding: 6px 8px; font-size: 11.5px; font-weight: 900; color: ${pal.primary}; box-shadow: 0 1px 3px rgba(0,0,0,0.02); }
      /* Estilos para Página de Fotos e Implantación 3D */
      .photo-grid-main { display: flex; flex-direction: column; gap: 12px; margin-top: 10px; }
      .photo-card-hero { height: 112mm; border: 1.5px solid #cbd5e1; border-radius: 8px; overflow: hidden; background: #f8fafc; position: relative; display: flex; flex-direction: column; }
      .cover-photo-card { height: 74mm; border: 1.5px solid #cbd5e1; border-radius: 10px; overflow: hidden; background: #f8fafc; position: relative; display: flex; flex-direction: column; margin: 12px 0 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.03); }
      .photo-card-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; height: 80mm; }
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
      h2 { font-size: 13px; font-weight: 800; color: #1e293b; text-transform: uppercase; letter-spacing: 0.5px; margin: 20px 0 10px; border-left: 4px solid ${pal.primary}; padding-left: 10px; }
      .hero-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 12px 0 20px; }
      .hero-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; text-align: center; }
      .hero-val { font-size: 19px; font-weight: 900; color: #0f172a; margin-top: 4px; }
      .hero-val.primary { color: ${pal.primary}; }
      .hero-lbl { font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; }
      table { width: 100%; border-collapse: collapse; margin: 8px 0 18px; font-size: 11px; }
      th { background: #f8fafc; color: #475569; font-weight: 800; text-align: left; padding: 7px 10px; border-bottom: 2px solid #e2e8f0; }
      td { padding: 7px 10px; border-bottom: 1px solid #f1f5f9; color: #334155; }
      .text-right { text-align: right; }
      .total-row td { font-weight: 900; font-size: 12.5px; color: #0f172a; background: #fffbeb; border-top: 2px solid ${pal.primary}; }
      .chart-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-bottom: 20px; }
      .chart-title { font-size: 11px; font-weight: 800; color: #1e293b; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.3px; }
      .closer-hero-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 12px 0 16px; }
      .closer-hero-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 8px; text-align: center; }
      .closer-hero-card.highlight { background: linear-gradient(135deg, ${pal.light}, #ffffff); border: 2px solid ${pal.primary}; }
      .closer-hero-val { font-size: 21px; font-weight: 900; color: #0f172a; margin: 4px 0 2px; }
      .closer-hero-val.primary { color: ${pal.primary}; }
      .closer-hero-lbl { font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
      .closer-hero-sub { font-size: 10px; color: #64748b; margin-top: 2px; font-weight: 600; }
      .decision-boxes { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin: 14px 0; }
      .decision-card { border-radius: 8px; padding: 14px 16px; border: 1px solid #e2e8f0; background: #f8fafc; }
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
        cursor: move !important;
        resize: both !important;
        overflow: auto !important;
        transition: outline 0.15s ease, box-shadow 0.15s ease;
      }
      body.mode-edit-layout [data-editable-box]:hover {
        outline: 1.5px dashed ${pal.primary} !important;
        box-shadow: 0 0 10px rgba(0,0,0,0.12) !important;
      }
      body.mode-edit-layout [data-editable-box].selected-edit-box {
        outline: 2px solid ${pal.primary} !important;
        box-shadow: 0 0 14px rgba(0,0,0,0.2) !important;
      }
      .ra-edit-del-btn {
        position: absolute;
        top: -9px;
        right: -9px;
        width: 22px;
        height: 22px;
        background: #ef4444;
        color: #ffffff;
        border: 2px solid #ffffff;
        border-radius: 50%;
        display: none;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        font-weight: 900;
        cursor: pointer;
        z-index: 99999;
        box-shadow: 0 2px 6px rgba(0,0,0,0.35);
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
        .page-sheet { box-shadow: none; border-radius: 0; width: 210mm; min-height: 297mm; max-height: 297mm; height: 297mm; padding: 18mm 20mm; margin: 0; page-break-before: auto; page-break-after: always; break-after: page; page-break-inside: avoid; break-inside: avoid; overflow: hidden; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between; }
        .page-sheet:last-child { page-break-after: avoid; break-after: avoid; }
        thead { display: table-header-group; }
        tr, .hero-card, .closer-hero-card, .decision-card, .sig-card, .chart-box, .tech-card { page-break-inside: avoid; break-inside: avoid; }
        h2 { page-break-after: avoid; break-after: avoid; margin: 10px 0 5px; }
        table { margin: 4px 0 10px; }
        td, th { padding: 4.5px 7px; }
      }
    </style>
  </head>
  <body>
    <!-- BARRA FLOTANTE DE FORMATO TEXTUAL -->
    <div id="prop-format-toolbar" class="no-print">
      <select id="prop-fmt-font" onchange="applyPropFormat('fontName', this.value)" title="Tipografía">
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
          <span style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;">🎨 Paleta:</span>
          <button type="button" onclick="setDocTheme('emerald')" title="Verde Esmeralda" style="width:16px;height:16px;border-radius:50%;background:#059669;border:2px solid ${theme==='emerald'?'#fff':'transparent'};cursor:pointer;"></button>
          <button type="button" onclick="setDocTheme('sky')" title="Azul Técnico" style="width:16px;height:16px;border-radius:50%;background:#0284c7;border:2px solid ${theme==='sky'||theme==='blue'?'#fff':'transparent'};cursor:pointer;"></button>
          <button type="button" onclick="setDocTheme('amber')" title="Ámbar Cálido" style="width:16px;height:16px;border-radius:50%;background:#d97706;border:2px solid ${theme==='amber'?'#fff':'transparent'};cursor:pointer;"></button>
          <button type="button" onclick="setDocTheme('rose')" title="Rosa Corporativo" style="width:16px;height:16px;border-radius:50%;background:#e11d48;border:2px solid ${theme==='rose'?'#fff':'transparent'};cursor:pointer;"></button>
          <button type="button" onclick="setDocTheme('slate')" title="Gris Pizarra" style="width:16px;height:16px;border-radius:50%;background:#334155;border:2px solid ${theme==='slate'?'#fff':'transparent'};cursor:pointer;"></button>
        </div>
        <button class="doc-btn" style="background:#8b5cf6;color:#fff;" onclick="capture3DToProposal()" title="Actualizar fotos con captura 3D en vivo del proyecto">📸 CAPTURAR VISTA 3D</button>
        <button class="doc-btn doc-btn-edit" id="btn-prop-edit" onclick="togglePropEdit()">✏️ EDITAR</button>
        <button class="doc-btn doc-btn-print" onclick="window.print()">🖨 IMPRIMIR / PDF</button>
        <button class="doc-btn doc-btn-word" onclick="exportPropWord()">📝 WORD (.DOC)</button>
        <button class="doc-btn doc-btn-html" onclick="exportPropHtml()">🌐 HTML</button>
        <button class="doc-btn doc-btn-close" onclick="window.close()">✕</button>
      </div>
    </div>

    <!-- PÁGINA 1: PORTADA Y PRESENTACIÓN INICIAL DEL PROYECTO -->
    <div class="page-sheet cover-page">
      <div>
        <!-- Cabecera de Portada: Logo y Datos de Empresa -->
        <div class="cover-brand-row">
          <div style="display:flex;align-items:center;gap:16px;">
            ${logoBlock}
            <div>
              <div style="font-size:20px;font-weight:900;color:#0f172a;letter-spacing:-0.4px;">${companyName}</div>
              <div style="font-size:10px;font-weight:700;color:${pal.primary};text-transform:uppercase;letter-spacing:1px;margin-top:2px;">Oficina Técnica &amp; Ingeniería de Energías Renovables</div>
              ${companyCIF ? '<div style="font-size:10px;color:#64748b;margin-top:2px;">CIF: ' + companyCIF + (contactBlock ? ' · ' + contactBlock : '') + '</div>' : (contactBlock ? '<div style="font-size:10px;color:#64748b;margin-top:2px;">' + contactBlock + '</div>' : '')}
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
          <div class="cover-hero-tag">Propuesta Técnico-Económica Llave en Mano</div>
          <h1 class="cover-hero-h1">PROYECTO INTEGRAL DE GENERACIÓN RENOVABLE</h1>
          <div class="cover-hero-sub">Estudio de viabilidad técnica, diseño CAD 3D y análisis de rentabilidad para autoconsumo</div>
        </div>

        <!-- Caja de Datos del Cliente y Emplazamiento -->
        <div class="cover-client-card">
          <div class="cover-client-header">
            <span>👤 DATOS DEL CLIENTE Y EMPLAZAMIENTO DE LA INSTALACIÓN</span>
          </div>
          <div class="cover-client-grid">
            <div><strong>Cliente / Titular:</strong> <span>${d.tit.nombre} (${d.tit.nif})</span></div>
            <div><strong>Punto Suministro (CUPS):</strong> <span>${d.tit.cups}</span></div>
            <div><strong>Dirección de Obra:</strong> <span>${d.tit.dir || 'Instalación Solar'}, ${d.tit.mun || ''} (${d.tit.prov || ''})</span></div>
            <div><strong>Modalidad Autoconsumo:</strong> <span>${d.modalTexto}</span></div>
            <div><strong>Ingeniero / Técnico Responsable:</strong> <span>${d.tit.tecnico} (${d.tit.titulacion})</span></div>
            <div><strong>Colegiado N.º:</strong> <span>${d.tit.ncol || 'Habilitado CTE/REBT'}</span></div>
          </div>
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
                <span style="font-size:28px;">📷</span>
                <span style="font-size:11px;font-weight:700;">Haz clic para cargar imagen de portada o fotografía del inmueble</span>
                <span style="font-size:9px;">Formatos recomendados: JPG o PNG (alta resolución)</span>
              </div>
            `)}
            <div class="photo-upload-overlay">📸 Cambiar foto de portada</div>
          </div>
          <div class="photo-caption-bar">
            <div>
              <div class="photo-caption-title" contenteditable="true">IMPLANTACIÓN SOLAR Y ENTORNO ARQUITECTÓNICO</div>
              <div class="photo-caption-desc" contenteditable="true">Estudio de integración fotovoltaica sobre cubierta · ${d.tit.mun || ''} (${d.tit.prov || ''})</div>
            </div>
            <div style="font-size:9px;font-weight:800;color:${pal.primary};background:#f8fafc;padding:3px 8px;border-radius:4px;border:1px solid #e2e8f0;">VISTA DE PORTADA</div>
          </div>
        </div>

        <!-- 4 Cajas Principales de Características Técnicas de la Instalación -->
        <div style="font-size:11px;font-weight:900;color:#1e293b;text-transform:uppercase;letter-spacing:0.6px;margin:18px 0 8px;border-left:4px solid ${pal.primary};padding-left:10px;">
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
              <div class="cover-spec-sub">${(windTurbineCount > 0) ? (m.numPanels + ' módulos FV + ' + windTurbineCount + ' turbina(s)') : ('Tecnología Tier-1 ' + (d.cfg && d.cfg.potencia ? d.cfg.potencia : 450) + ' Wp')}</div>
            </div>
          </div>

          <!-- Caja 2: Potencia Pico / Instalada -->
          <div class="cover-spec-box">
            <div class="cover-spec-icon">
              ${(window.RA_SvgCatalog ? window.RA_SvgCatalog.render('inverter', pal.primary, 34) : '')}
            </div>
            <div>
              <div class="cover-spec-label">Potencia Pico Total</div>
              <div class="cover-spec-val">${m.kwp.toFixed(2)} kWp</div>
              <div class="cover-spec-sub">${_eqp.totalAcKw > 0 ? (_eqp.totalAcKw.toFixed(1) + ' kW AC nominal') : 'Conversión de alta eficiencia'}</div>
            </div>
          </div>

          <!-- Caja 3: Energía Generada Año 1 -->
          <div class="cover-spec-box">
            <div class="cover-spec-icon">
              ${(window.RA_SvgCatalog ? window.RA_SvgCatalog.render('peakSun', pal.primary, 34) : '')}
            </div>
            <div>
              <div class="cover-spec-label">Producción Anual</div>
              <div class="cover-spec-val primary">${Math.round(annualYieldKWh).toLocaleString('es-ES')} kWh</div>
              <div class="cover-spec-sub">~100% calibrado por gemelo 3D</div>
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
              <div class="cover-spec-sub" style="color:${pal.dark};font-weight:700;">IVA 21% inc. · ${Math.round(m.capexNeto).toLocaleString('es-ES')} € neto subv.</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Pie de Portada -->
      <div class="cover-footer">
        <span>Garantía de rendimiento: ${warPower} años · Marcado CE · Código Técnico de la Edificación (CTE)</span>
        <span>${companyName} · ${d.refNum}</span>
      </div>
    </div>

    <!-- PÁGINA 2: ESPECIFICACIÓN TÉCNICA Y CATÁLOGO DE EQUIPAMIENTO -->
    <div class="page-sheet">
      <div>
        <div class="cover-header">
          <div class="company-text">
            <div class="name">ESPECIFICACIÓN <span style="color:${pal.primary}">TÉCNICA &amp; COMPONENTES</span></div>
            <div class="sub">Datos de Emplazamiento · Dimensionamiento · Catálogo de Equipos Principales</div>
          </div>
          <div class="doc-ref-box"><b>Ref: ${d.refNum}</b><br>Hoja 2 de ${_totPages}</div>
        </div>

        <h2>1. Datos del cliente y ubicación</h2>
        <table>
          <tr><td width="30%"><strong>Cliente / Titular:</strong></td><td>${d.tit.nombre} (${d.tit.nif})</td></tr>
          <tr><td><strong>Dirección Instalación:</strong></td><td>${d.tit.dir || 'Instalación Solar'}, ${d.tit.mun || ''} (${d.tit.prov || ''})</td></tr>
          <tr><td><strong>Punto Suministro (CUPS):</strong></td><td>${d.tit.cups}</td></tr>
          <tr><td><strong>Modalidad Autoconsumo:</strong></td><td>${d.modalTexto}</td></tr>
        </table>

        <h2>2. Configuración técnica seleccionada</h2>
        <div class="tech-grid">
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

          <!-- 2. Inversor -->
          <div class="tech-card">
            <div class="tech-icon-box">
              ${(window.RA_SvgCatalog ? window.RA_SvgCatalog.render('inverter', pal.primary, 52) : '')}
            </div>
            <div class="tech-info">
              <div class="tech-label">INVERSOR DE RED</div>
              <div class="tech-name" title="${_eqp.invName}">${_eqp.invName}</div>
              <div class="tech-sub">${_eqp.invCount > 1 
                ? (_eqp.invCount + '× ' + _eqp.invKw + ' kW (' + _eqp.totalAcKw.toFixed(1) + ' kW AC total) · ' + _eqp.totalMPPTs + ' MPPT · Conversión de Alta Eficiencia')
                : 'Conversión DC/AC de Alta Eficiencia + Smart Meter'}</div>
            </div>
            <div class="tech-badge">
              ${_eqp.invCount} ud${_eqp.invCount > 1 ? 's' : ''} · ${_eqp.totalAcKw.toFixed(1)} kW AC
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

          <!-- 4. Microinversores / Optimizadores o Estructura -->
          ${_eqp.hasMicro ? `
          <div class="tech-card">
            <div class="tech-icon-box">
              ${(window.RA_SvgCatalog ? window.RA_SvgCatalog.render('inverter', pal.primary, 52) : '')}
            </div>
            <div class="tech-info">
              <div class="tech-label">MICROINVERSORES / OPTIMIZADORES</div>
              <div class="tech-name" title="${_eqp.microName}">${_eqp.microName}</div>
              <div class="tech-sub">Monitorización y MPPT a nivel de módulo individual</div>
            </div>
            <div class="tech-badge">
              ${_eqp.microCount} uds
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
        <span>${companyName}</span>
      </div>
    </div>

    <!-- PÁGINA 3: IMPLANTACIÓN SOLAR Y VISTAS DEL PROYECTO (FOTOS Y SIMULACIÓN 3D) -->
    <div class="page-sheet">
      <div class="cover-header">
        <div class="company-text">
          <div class="name">IMPLANTACIÓN SOLAR &amp; <span style="color:${pal.primary}">VISTAS DEL PROYECTO</span></div>
          <div class="sub">Simulación Tridimensional · Integración Arquitectónica · Reporte Fotográfico</div>
        </div>
        <div class="doc-ref-box"><b>Ref: ${d.refNum}</b><br>Hoja 3 de ${_totPages}</div>
      </div>

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
                <span style="font-size:28px;">📷</span>
                <span style="font-size:11px;font-weight:700;">Haz clic para cargar imagen 3D o foto de la cubierta</span>
                <span style="font-size:9px;">Formatos recomendados: JPG o PNG</span>
              </div>
            `}
            <div class="photo-upload-overlay">📸 Reemplazar foto / 3D</div>
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
                  <span style="font-size:24px;">🏡</span>
                  <span style="font-size:10.5px;font-weight:700;">Foto real del tejado / fachada</span>
                  <span style="font-size:8.5px;">Haz clic para subir desde el disco local</span>
                </div>
              `}
              <div class="photo-upload-overlay">📸 Cargar foto</div>
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
                  <span style="font-size:24px;">⚡</span>
                  <span style="font-size:10.5px;font-weight:700;">Ubicación de Inversor / Cuadro AC</span>
                  <span style="font-size:8.5px;">Haz clic para subir foto del cuadro eléctrico</span>
                </div>
              `}
              <div class="photo-upload-overlay">📸 Cargar foto</div>
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

    ${(function() {
      var comm = (typeof RAPricing !== 'undefined' && typeof RAPricing.getCommercialConfig === 'function') ? RAPricing.getCommercialConfig() : null;
      if (!comm || !comm.showThreePackagesComparison) return '';
      var pkgs = RAPricing.computeThreePackages(m);
      if (!pkgs) return '';
      return `
      <!-- PÁGINA INTERMEDIA: COMPARATIVA DE 3 PAQUETES (GOOD / BETTER / BEST) -->
      <div class="page-sheet">
        ${_infografias.caraACara}
        ${_infografias.relojSolar}
        <div class="cover-header">
          <div class="company-text">
            <div class="name">PLANES &amp; <span style="color:${pal.primary}">MODALIDADES DE INVERSIÓN</span></div>
            <div class="sub">Comparativa Estratégica: Esencial · Óptimo Recomendado · Independencia Total</div>
          </div>
          <div class="doc-ref-box"><b>Ref: ${d.refNum}</b><br>Hoja ${_pageIndexComparativa} de ${_totPages}</div>
        </div>
        <h2>Elige el nivel de independencia energética para tu inmueble</h2>
        <p style="font-size:10px;color:#64748b;margin-bottom:14px;">Hemos preparado tres alternativas equilibradas para adaptarse a tu presupuesto y objetivos de ahorro a largo plazo:</p>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:18px;">
          
          <div style="border:1px solid #cbd5e1;border-radius:8px;padding:14px 12px;background:#f8fafc;display:flex;flex-direction:column;justify-content:space-between;">
            <div>
              <div style="font-size:11px;font-weight:800;color:#475569;text-transform:uppercase;">${pkgs.essential.title}</div>
              <div style="font-size:9.5px;color:#64748b;margin:4px 0 10px;line-height:1.35;">${pkgs.essential.desc}</div>
              <div style="font-size:20px;font-weight:900;color:#0f172a;">${pkgs.essential.capex.toLocaleString('es-ES')} €</div>
              <div style="font-size:9px;color:#64748b;">IVA 21% incluido</div>
            </div>
            <div style="margin-top:12px;border-top:1px solid #e2e8f0;padding-top:8px;font-size:10px;line-height:1.6;">
              <div>• Ahorro: <b>${pkgs.essential.ahorroAnual.toLocaleString('es-ES')} €/año</b></div>
              <div>• Retorno: <b>${pkgs.essential.payback} años</b></div>
              <div>• Autarquía solar: <b>~${pkgs.essential.autarquia}%</b></div>
            </div>
          </div>

          <div style="border:2.5px solid ${pal.primary};border-radius:8px;padding:14px 12px;background:#ffffff;box-shadow:0 6px 20px rgba(0,0,0,0.06);display:flex;flex-direction:column;justify-content:space-between;position:relative;">
            <div style="position:absolute;top:-10px;right:10px;background:${pal.primary};color:#fff;font-size:8.5px;font-weight:900;padding:2px 8px;border-radius:10px;letter-spacing:0.5px;">PROYECTO ACTUAL</div>
            <div>
              <div style="font-size:11px;font-weight:900;color:${pal.dark};text-transform:uppercase;">${pkgs.optimal.title}</div>
              <div style="font-size:9.5px;color:#64748b;margin:4px 0 10px;line-height:1.35;">${pkgs.optimal.desc}</div>
              <div style="font-size:22px;font-weight:900;color:${pal.primary};">${pkgs.optimal.capex.toLocaleString('es-ES')} €</div>
              <div style="font-size:9px;color:#64748b;">IVA 21% incluido</div>
            </div>
            <div style="margin-top:12px;border-top:1px solid #e2e8f0;padding-top:8px;font-size:10px;line-height:1.6;">
              <div>• Ahorro: <b>${pkgs.optimal.ahorroAnual.toLocaleString('es-ES')} €/año</b></div>
              <div>• Retorno: <b>${pkgs.optimal.payback} años</b></div>
              <div>• Autarquía solar: <b>~${pkgs.optimal.autarquia}%</b></div>
            </div>
          </div>

          <div style="border:1px solid #cbd5e1;border-radius:8px;padding:14px 12px;background:#f8fafc;display:flex;flex-direction:column;justify-content:space-between;">
            <div>
              <div style="font-size:11px;font-weight:800;color:#0369a1;text-transform:uppercase;">${pkgs.premium.title}</div>
              <div style="font-size:9.5px;color:#64748b;margin:4px 0 10px;line-height:1.35;">${pkgs.premium.desc}</div>
              <div style="font-size:20px;font-weight:900;color:#0369a1;">${pkgs.premium.capex.toLocaleString('es-ES')} €</div>
              <div style="font-size:9px;color:#64748b;">IVA 21% incluido</div>
            </div>
            <div style="margin-top:12px;border-top:1px solid #e2e8f0;padding-top:8px;font-size:10px;line-height:1.6;">
              <div>• Ahorro: <b>${pkgs.premium.ahorroAnual.toLocaleString('es-ES')} €/año</b></div>
              <div>• Retorno: <b>${pkgs.premium.payback} años</b></div>
              <div>• Autarquía solar: <b>~${pkgs.premium.autarquia}%</b></div>
            </div>
          </div>

        </div>
      </div>`;
    })()}
    <!-- PÁGINA 3: PRODUCCIÓN SOLAR, ANÁLISIS FINANCIERO Y GARANTÍAS -->
    <div class="page-sheet">
      <div class="cover-header">
        <div class="company-text">
          <div class="name">PRODUCCIÓN &amp; <span style="color:${pal.primary}">RENTABILIDAD</span></div>
          <div class="sub">Histograma Mensual · Curva de Amortización a 25 Años · Garantías</div>
        </div>
        <div class="doc-ref-box"><b>Ref: ${d.refNum}</b><br>Hoja ${_pageIndexProduccion} de ${_totPages}</div>
      </div>

      <h2>Histograma de producción fotovoltaica mensual estimada</h2>
      <div class="chart-box">
        <div class="chart-title">☀️ Producción Mensual Estimada — ${Math.round(annualYieldKWh).toLocaleString('es-ES')} kWh/año · ${m.kwp.toFixed(2)} kWp instalados</div>
        ${histogramSVG}
      </div>

      <h2>Curva de amortización y retorno de inversión acumulado (25 años)</h2>
      <div class="chart-box">
        <div class="chart-title">📈 Cashflow Acumulado — Payback en ${m.paybackYears.toFixed(1)} años · VAN ${Math.round(m.van).toLocaleString('es-ES')} € · TIR ${m.tirString || ((m.tir != null && isFinite(m.tir)) ? m.tir.toFixed(1) + "%" : "N/D")}</div>
        ${amortSVG}
      </div>

      ${(window.RA && window.RA.billAuditor && window.RA.billAuditor.currentBill && window.RA.billAuditor.comparison) ? `
      <h2>Auditoría y contraste con factura actual del cliente</h2>
      <table>
        <tr><th>Concepto Auditado</th><th>Factura Actual (Sin Solar)</th><th class="text-right" style="color:${pal.primary}">Con Proyecto Solar 3D</th></tr>
        <tr><td>Compañía y Tarifa</td><td>${window.RA.billAuditor.currentBill.comercializadora} (${window.RA.billAuditor.currentBill.tarifaAcceso || '2.0TD'})</td><td class="text-right" style="color:${pal.primary}">Autoconsumo + Compensación</td></tr>
        <tr><td>Gasto Mensual Facturado</td><td>${window.RA.billAuditor.comparison.gastoMensualActualEUR} €/mes</td><td class="text-right" style="font-weight:800;color:${pal.primary}">${window.RA.billAuditor.comparison.gastoMensualConSolarEUR} €/mes</td></tr>
        <tr style="background:${pal.light};font-weight:800;"><td>AHORRO DIRECTO AUDITADO</td><td>—</td><td class="text-right" style="color:${pal.primary}">${window.RA.billAuditor.comparison.ahorroAnualEUR.toLocaleString('es-ES')} €/año (-${window.RA.billAuditor.comparison.porcentajeAhorro}%)</td></tr>
      </table>` : ''}

      ${_infografias.tejadoBlindado}
      ${_infografias.cascadaFiscal}
      <h2>Garantías oficiales incluidas</h2>
      <table>
        <tr><th>Componente</th><th>Garantía de Producto</th><th>Garantía de Rendimiento</th><th>Garantía de Instalación</th></tr>
        <tr><td>Módulos Fotovoltaicos</td><td>${warMod} años</td><td>${warPower} años (≥84.8%)</td><td rowspan="${eqWarranties.hasBat ? '4' : '3'}" style="vertical-align:middle;text-align:center;">${warMo} años<br>mano de obra</td></tr>
        <tr><td>Inversor & Monitorización</td><td>${warInv} años${eqWarranties.isMicro ? ' (Microinversor oficial)' : ''}</td><td>—</td></tr>
        ${eqWarranties.hasBat ? '<tr><td>Batería de Litio LFP</td><td>' + warBat + ' años (o 6.000 ciclos)</td><td>—</td></tr>' : ''}
        <tr><td>Estructura & Fijaciones</td><td>10 años inox A2</td><td>—</td></tr>
      </table>

      <div class="sig-box-grid" style="margin-top:24px;">
        <div class="sig-card">
          <strong>Conforme y Aceptado por el Cliente</strong><br><br><br>
          Firma: ________________________<br>
          D./Dña. ${d.tit.nombre}<br>
          NIF: ${d.tit.nif}<br>
          Fecha: ___ / ___ / 2026
        </div>
        <div class="sig-card">
          <div class="sig-logo-box">
            ${logoDataUrl ? '<img src="' + logoDataUrl + '" style="max-height:36px;max-width:100px;object-fit:contain;">' : '<span style="font-size:20px;">🏢</span>'}
            <div style="text-align:left;"><div style="font-weight:900;font-size:11px;">${companyName}</div>${companyCIF ? '<div style="font-size: 10px;color:#64748b;">CIF: ' + companyCIF + '</div>' : ''}</div>
          </div>
          Por la Empresa Instaladora<br><br>
          Firma y Sello: ________________________<br>
          ${d.tit.tecnico} (${d.tit.titulacion})<br>
          ${contactBlock ? contactBlock + '<br>' : ''}
          <div style="margin-top:6px;">${['⚡ REBT ITC-BT-40','🛡 RD 244/2019','✅ IEC 61215'].map(t => '<span class="pill">'+t+'</span>').join('')}</div>
        </div>
      </div>
    </div>

    <!-- PÁGINA PRESUPUESTO: PRESUPUESTO ECONÓMICO EPC Y AYUDAS FISCALES -->
    <div class="page-sheet">
      <div>
        <div class="cover-header">
          <div class="company-text">
            <div class="name">PRESUPUESTO <span style="color:${pal.primary}">LLAVE EN MANO &amp; BENEFICIOS</span></div>
            <div class="sub">Desglose de Partidas · Impuestos · Subvenciones &amp; Deducciones Estimadas</div>
          </div>
          <div class="doc-ref-box"><b>Ref: ${d.refNum}</b><br>Hoja ${_pageIndexPresupuesto} de ${_totPages}</div>
        </div>

        <h2>3. Presupuesto detallado llave en mano</h2>
        <table>
          <tr><th>Capítulo</th><th>Descripción de la Partida</th><th class="text-right">Importe (€)</th></tr>
          ${(m.modulesBreakdown && m.modulesBreakdown.isMultiModule)
            ? `<tr><td>Cap. 1</td><td><strong>Módulos Solares Fotovoltaicos (${m.numPanels} uds · ${m.modulesBreakdown.uniqueModelsCount} modelos Tier-1 · ${m.kwp.toFixed(2)} kWp)</strong><br>` +
              m.modulesBreakdown.byModel.map(bm => `<span style="font-size: 10px;color:#475569;display:inline-block;margin-left:6px;">• ${bm.fullName} (${bm.wp} Wp): ${bm.count} uds</span>`).join('<br>') +
              `</td><td class="text-right">${_cPan.toLocaleString('es-ES')} €</td></tr>`
            : `<tr><td>Cap. 1</td><td>Módulos Solares Fotovoltaicos de Alta Eficiencia (${m.numPanels} uds × ${Math.round((_cPan / (m.numPanels || 1))).toLocaleString('es-ES')} €/ud)</td><td class="text-right">${_cPan.toLocaleString('es-ES')} €</td></tr>`
          }
          <tr><td>Cap. 2</td><td>Estructura de Soporte y Fijación Certificada (Aluminio / Inox A2)</td><td class="text-right">${_cEst.toLocaleString('es-ES')} €</td></tr>
          ${(_eqp.invCount > 1 || (_eqp.invertersBreakdown && _eqp.invertersBreakdown.isMulti))
            ? `<tr><td>Cap. 3</td><td><strong>Inversores de Conexión a Red & Monitorización (${_eqp.invCount} uds · ${_eqp.totalAcKw.toFixed(2)} kW AC total)</strong><br>` +
              ((_eqp.invertersBreakdown && _eqp.invertersBreakdown.items && _eqp.invertersBreakdown.items.length > 0)
                ? _eqp.invertersBreakdown.items.map(it => `<span style="font-size: 10px;color:#475569;display:inline-block;margin-left:6px;">• ${it.count}× ${it.fullName || (it.brand + ' ' + it.model)} (${it.kw} kW · ${it.mppt || 2} MPPT): ${Math.round((_cInv * (it.count * it.kw / (_eqp.totalAcKw || 1)))).toLocaleString('es-ES')} €</span>`).join('<br>')
                : `<span style="font-size: 10px;color:#475569;display:inline-block;margin-left:6px;">• ${_eqp.invCount}× ${_eqp.invBrand} ${_eqp.invModel} (${_eqp.invKw} kW · ${_eqp.invMPPTs} MPPT)</span>`
              ) +
              `</td><td class="text-right">${_cInv.toLocaleString('es-ES')} €</td></tr>`
            : `<tr><td>Cap. 3</td><td>Inversor de Conexión a Red, Monitorización Inteligente & Protecciones (${_eqp.invName})</td><td class="text-right">${_cInv.toLocaleString('es-ES')} €</td></tr>`
          }
          ${_cBat > 0 ? (
            (_eqp.batCount > 1 || (_eqp.batteriesBreakdown && _eqp.batteriesBreakdown.isMulti))
            ? `<tr><td>Cap. 4</td><td><strong>Sistema de Almacenamiento Electroquímico (${_eqp.batCount} uds · ${_eqp.totalBatKwh.toFixed(1)} kWh total)</strong><br>` +
              ((_eqp.batteriesBreakdown && _eqp.batteriesBreakdown.items && _eqp.batteriesBreakdown.items.length > 0)
                ? _eqp.batteriesBreakdown.items.map(it => `<span style="font-size: 10px;color:#475569;display:inline-block;margin-left:6px;">• ${it.count}× ${it.fullName || (it.brand + ' ' + it.model)} (${it.kwh} kWh c/u · BMS integrado): ${Math.round((_cBat * (it.count * it.kwh / (_eqp.totalBatKwh || 1)))).toLocaleString('es-ES')} €</span>`).join('<br>')
                : `<span style="font-size: 10px;color:#475569;display:inline-block;margin-left:6px;">• ${_eqp.batCount}× ${_eqp.batBrand} ${_eqp.batModel} (${_eqp.batKwh} kWh c/u · BMS integrado)</span>`
              ) +
              `</td><td class="text-right">${_cBat.toLocaleString('es-ES')} €</td></tr>`
            : `<tr><td>Cap. 4</td><td>Sistema de Almacenamiento en Batería LFP Litio-Ferrofosfato (${_eqp.batName})</td><td class="text-right">${_cBat.toLocaleString('es-ES')} €</td></tr>`
          ) : ''}
          <tr><td>Cap. ${_cBat > 0 ? 5 : 4}</td><td>Líneas Eléctricas DC/AC Solar ZZ-F y Cuadros con SPD Tipo II e IGA</td><td class="text-right">${_cCab.toLocaleString('es-ES')} €</td></tr>
          <tr><td>Cap. ${_cBat > 0 ? 6 : 5}</td><td>Montaje Mecánico, Mano de Obra Cualificada y Puesta en Servicio</td><td class="text-right">${_cMo.toLocaleString('es-ES')} €</td></tr>
          <tr><td>Cap. ${_cBat > 0 ? 7 : 6}</td><td>Ingeniería Técnica, Dirección de Obra y Tramitación Legal (CIE / Industria)</td><td class="text-right">${_cLeg.toLocaleString('es-ES')} €</td></tr>
          ${(function() {
            var cfg = (typeof RAPricing !== 'undefined' && typeof RAPricing.getCommercialConfig === 'function') ? RAPricing.getCommercialConfig() : null;
            var all = cfg ? (cfg.addons || []).concat(cfg.customAddons || []) : [];
            var activeAddons = all.filter(function(a) { return a && a.enabled; });
            if (!activeAddons.length) return '';
            return activeAddons.map(function(ad, idx) {
              var tot = (Number(ad.qty) || 1) * (Number(ad.unitPrice) || 0);
              return '<tr style="background:#f0fdf4;"><td style="color:#16a34a;font-weight:700;">Extra ' + (idx + 1) + '</td><td><strong>' + ad.name + '</strong> (' + (ad.qty || 1) + ' ud)</td><td class="text-right" style="font-weight:700;color:#16a34a;">' + tot.toLocaleString('es-ES') + ' €</td></tr>';
            }).join('');
          })()}
          ${(m.discountEur > 0) ? '<tr style="background:#fef2f2;color:#dc2626;"><td style="font-weight:700;">Promoción</td><td><strong>' + m.discountLabel + '</strong></td><td class="text-right" style="font-weight:800;">- ' + Math.round(m.discountEur).toLocaleString('es-ES') + ' €</td></tr>' : ''}
          <tr style="background:#f8fafc;font-weight:700;border-top:2px solid #cbd5e1;"><td>BASE IMPONIBLE</td><td>Total Ejecución Material y Servicios Llave en Mano</td><td class="text-right" style="color:${pal.primary};">${Math.round(m.subtotal).toLocaleString('es-ES')} €</td></tr>
          <tr style="background:#f8fafc;"><td>IVA APLICABLE</td><td>Impuesto sobre el Valor Añadido (21%)</td><td class="text-right">${Math.round(m.iva).toLocaleString('es-ES')} €</td></tr>
          <tr class="total-row"><td>TOTAL PRESUPUESTO</td><td>INVERSIÓN TOTAL LLAVE EN MANO (IVA INCLUIDO)</td><td class="text-right">${Math.round(m.capexBruto).toLocaleString('es-ES')} €</td></tr>
        </table>

        <h2>4. Subvenciones y beneficios fiscales estimados</h2>
        <table>
          <tr><th>Concepto Fiscal</th><th>Detalle / Normativa Aplicable</th><th class="text-right">Ahorro Estimado</th></tr>
          <tr><td>Bonificación IBI</td><td>Bonificación en el Impuesto sobre Bienes Inmuebles</td><td class="text-right">${Math.round(m.ahorroIBITotal).toLocaleString('es-ES')} €</td></tr>
          <tr><td>Deducción IRPF</td><td>Deducción en IRPF por reducción de demanda / energía primaria</td><td class="text-right">${Math.round(m.ahorroIRPF).toLocaleString('es-ES')} €</td></tr>
          <tr><td>Bonificación ICIO</td><td>Bonificación del 95% en Impuesto de Construcciones y Obras</td><td class="text-right">${Math.round(m.ahorroICIO).toLocaleString('es-ES')} €</td></tr>
          <tr style="background:${pal.light};font-weight:800;"><td>TOTAL AYUDAS</td><td>Ahorro fiscal total directo estimado</td><td class="text-right" style="color:${pal.primary}">- ${Math.round(m.totalAhorroFiscal).toLocaleString('es-ES')} €</td></tr>
          <tr class="total-row"><td>INVERSIÓN NETA</td><td>COSTE FINAL REAL TRAS BONIFICACIONES</td><td class="text-right" style="color:${pal.dark}">${Math.round(m.capexNeto).toLocaleString('es-ES')} €</td></tr>
        </table>
      </div>
      <p style="font-size: 9.5px;color:#64748b;margin:6px 0 0 0;line-height:1.35;border-top:1px solid #f1f5f9;padding-top:6px;">Nota: bonificaciones y deducciones fiscales son estimaciones comerciales sujetas a vigencia normativa y ordenanzas municipales. Verificar con asesoría fiscal antes de incluirlas en contrato.</p>
    </div>

    <!-- PÁGINA CIERRE: HOJA DE DECISIÓN EJECUTIVA -->
    <div class="page-sheet">
      <div class="cover-header">
        <div class="company-block">
          ${logoBlock}
          <div class="company-text">
            <div class="name">${companyName}</div>
            <div class="sub">Estudio de Ingeniería · Propuesta Fotovoltaica</div>
            ${companyCIF ? '<div class="contact">CIF: ' + companyCIF + (contactBlock ? ' · ' + contactBlock : '') + '</div>' : (contactBlock ? '<div class="contact">' + contactBlock : '')}
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
          Estudio de viabilidad económica y técnica para <b>${d.tit.nombre}</b> · ${d.tit.dir || 'Instalación Solar'}, ${d.tit.mun || ''}
        </div>
      </div>

      <!-- 4 HEROS MONUMENTALES DESPEJADOS CON ILUSTRACIÓN SVG MONOCROMÁTICA -->
      <div class="closer-hero-grid">
        <div class="closer-hero-card highlight">
          <div style="display:flex;justify-content:center;margin-bottom:8px;">${(window.RA_SvgCatalog ? window.RA_SvgCatalog.render('piggyBank', pal.primary, 38) : '')}</div>
          <div class="closer-hero-lbl">Ahorro en tu Factura</div>
          <div class="closer-hero-val primary">${Math.round(m.ahorroLuzAnio1).toLocaleString('es-ES')} €</div>
          <div class="closer-hero-sub">al año (${Math.round(m.ahorroMensualLuz)} €/mes)</div>
        </div>
        <div class="closer-hero-card">
          <div style="display:flex;justify-content:center;margin-bottom:8px;">${(window.RA_SvgCatalog ? window.RA_SvgCatalog.render('billCut', '#0284c7', 38) : '')}</div>
          <div class="closer-hero-lbl">Nueva Factura Estimada</div>
          <div class="closer-hero-val" style="color:#0284c7;">~${Math.round(gastoMensualConSolar)} €</div>
          <div class="closer-hero-sub">antes ~${Math.round(gastoMensualSinSolar)} €/mes</div>
        </div>
        <div class="closer-hero-card">
          <div style="display:flex;justify-content:center;margin-bottom:8px;">${(window.RA_SvgCatalog ? window.RA_SvgCatalog.render('savingsChart', pal.dark, 38) : '')}</div>
          <div class="closer-hero-lbl">Retorno de Inversión</div>
          <div class="closer-hero-val">${m.paybackYears.toFixed(1)} Años</div>
          <div class="closer-hero-sub">¡Energía gratis 20+ años!</div>
        </div>
        <div class="closer-hero-card">
          <div style="display:flex;justify-content:center;margin-bottom:8px;">${(window.RA_SvgCatalog ? window.RA_SvgCatalog.render('warranty25', pal.primary, 38) : '')}</div>
          <div class="closer-hero-lbl">Garantía de Potencia</div>
          <div class="closer-hero-val primary">${warPower} Años</div>
          <div class="closer-hero-sub">${warInv} años en inversor</div>
        </div>
      </div>

      <!-- COMPARATIVA DE PAGO: CONTADO vs FINANCIACIÓN 100% -->
      <div class="decision-boxes">
        <div class="decision-card featured">
          <div class="decision-title" style="color:${pal.dark};">
            <span>OPCIÓN A: PAGO LLAVE EN MANO</span>
            <span style="font-size: 10px;background:${pal.light};color:${pal.dark};padding:2px 6px;border-radius:4px;">RECOMENDADA</span>
          </div>
          ${m.capexTachado ? `
          <div class="decision-row" style="text-decoration:line-through;color:#94a3b8;font-size:10px;">
            <span>Tarifa Oficial de Catálogo:</span>
            <span>${m.capexTachado.toLocaleString('es-ES')} €</span>
          </div>
          <div class="decision-row" style="color:#059669;font-weight:700;">
            <span>${m.discountLabel}:</span>
            <span>-${Math.round(m.discountEur * 1.21).toLocaleString('es-ES')} €</span>
          </div>` : ''}
          <div class="decision-row">
            <span>Presupuesto Instalación (IVA 21% inc.):</span>
            <b style="color:${m.capexTachado ? '#059669' : 'inherit'};font-size:${m.capexTachado ? '12px' : '11px'};">${Math.round(m.capexBruto).toLocaleString('es-ES')} €</b>
          </div>
          <div class="decision-row" style="color:${pal.primary};">
            <span>Bonificaciones Fiscales (IBI/ICIO/IRPF):</span>
            <b>- ${Math.round(m.totalAhorroFiscal).toLocaleString('es-ES')} €</b>
          </div>
          <div class="decision-total" style="color:${pal.dark};">
            <span>COSTE REAL NETO:</span>
            <span style="font-size:16px;color:${pal.primary};">${Math.round(m.capexNeto).toLocaleString('es-ES')} €</span>
          </div>
          <div style="font-size: 10px;color:#64748b;margin-top:6px;">
            Ganancia neta acumulada (VAN 25a): <b>${Math.round(m.van).toLocaleString('es-ES')} €</b>
          </div>
        </div>

        <div class="decision-card">
          <div class="decision-title" style="color:#2563eb;">
            <span>OPCIÓN B: FINANCIACIÓN 100%</span>
            <span style="font-size: 10px;background:#dbeafe;color:#1e40af;padding:2px 6px;border-radius:4px;">0 € ENTRADA</span>
          </div>
          <div class="decision-row">
            <span>Cuota mensual (${m.mesesFin / 12} años):</span>
            <b style="color:#2563eb;">${Math.round(m.cuotaMensual)} €/mes</b>
          </div>
          <div class="decision-row" style="color:${pal.primary};">
            <span>Ahorro estimado en tu factura:</span>
            <b>+ ${Math.round(m.ahorroMensualLuz)} €/mes</b>
          </div>
          <div class="decision-total" style="color:${m.balanceNetoMensual >= 0 ? '#10b981' : '#e11d48'};">
            <span>BALANCE EN TU BOLSILLO:</span>
            <span style="font-size:16px;color:${m.balanceNetoMensual >= 0 ? '#059669' : '#dc2626'};">${m.balanceNetoMensual >= 0 ? '+' : ''}${Math.round(m.balanceNetoMensual)} €/mes</span>
          </div>
          <div style="font-size: 10px;color:#64748b;margin-top:6px;">
            La instalación se paga sola con el ahorro de luz desde el primer mes.
          </div>
        </div>
      </div>

      <!-- RESUMEN EJECUTIVO / IMPACTO AMBIENTAL -->
      <div style="margin:12px 0 10px;padding:10px 14px;background:linear-gradient(135deg,${pal.light},#f8fafc);border-left:4px solid ${pal.primary};border-radius:0 8px 8px 0;font-size:10.5px;line-height:1.5;color:#334155;">
        <div id="ra-ai-summary-badge" style="font-size: 10px;text-transform:uppercase;letter-spacing:1px;color:${pal.primary};font-weight:800;margin-bottom:4px;">📋 Resumen del proyecto</div>
        <div id="ra-ai-summary-content">${_summaryHTML}</div>
      </div>

      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin:10px 0;">
        <span class="pill">⚡ ${m.kwp.toFixed(2)} kWp (${m.numPanels} Módulos)</span>
        <span class="pill">☀️ ${Math.round(annualYieldKWh).toLocaleString('es-ES')} kWh/año Generación</span>
        <span class="pill">🌱 ${Math.round(annualYieldKWh * 0.26).toLocaleString('es-ES')} kg CO₂ evitados/año</span>
        <span class="pill">🌳 Eq. ${Math.round((annualYieldKWh * 0.26 / 1000) * 45)} árboles/año</span>
      </div>

      <!-- CUADRO DE ACEPTACIÓN INMEDIATA (CIERRE COMERCIAL) -->
      <div class="closer-cta-box">
        <div>
          <div style="font-weight:900;font-size:11.5px;color:#0f172a;">ACEPTACIÓN DE LA PROPUESTA Y RESERVA DE INSTALACIÓN</div>
          <div style="font-size: 10px;color:#64748b;margin-top:2px;">Conforme con las condiciones económicas expuestas para el inicio del proyecto técnico.</div>
        </div>
        <div style="text-align:right;font-size: 10px;color:#334155;">
          Firma del Cliente: ________________________ Fecha: ___/___/2026<br>
          <b>${d.tit.nombre}</b> (NIF: ${d.tit.nif || '___________'})
        </div>
      </div>
    </div>

    <script>
      function setDocTheme(t) {
        try {
          const stored = JSON.parse(localStorage.getItem('ra_company_branding') || '{}');
          stored.theme = t;
          localStorage.setItem('ra_company_branding', JSON.stringify(stored));
          if (window.opener && window.opener.RACompanyBranding && typeof window.opener.RACompanyBranding.saveCompanyBranding === 'function') {
            window.opener.RACompanyBranding.saveCompanyBranding(stored);
          }
          if (window.opener && window.opener.RA && window.opener.RA.branding) {
            window.opener.RA.branding.theme = t;
          }
        } catch (e) {}

        if (window.opener && typeof window.opener.generatePropuestaComercialPDF === 'function') {
          window.name = window.name || 'ra_proposal_window_' + Date.now();
          window.opener.generatePropuestaComercialPDF(true, window.name, t);
        } else {
          alert('Paleta guardada. Vuelve a abrir la propuesta para verla.');
        }
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
            // Optimizar en canvas cliente para no saturar memoria en PDF
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

            // ── Persistencia para sobrevivir a cambios de paleta de color ──
            try {
              let photoKey = 'hero';
              if (imgId.indexOf('cover') !== -1) photoKey = 'cover';
              else if (imgId.indexOf('sub1') !== -1) photoKey = 'sub1';
              else if (imgId.indexOf('sub2') !== -1) photoKey = 'sub2';

              // Persistir en memoria de ventana padre (opener)
              if (window.opener && window.opener.RA) {
                window.opener.RA._proposalCustomPhotos = window.opener.RA._proposalCustomPhotos || {};
                window.opener.RA._proposalCustomPhotos[photoKey] = optimizedData;
              }
              // Persistir en sessionStorage
              const currentPhotos = JSON.parse(sessionStorage.getItem('ra_proposal_custom_photos') || '{}');
              currentPhotos[photoKey] = optimizedData;
              sessionStorage.setItem('ra_proposal_custom_photos', JSON.stringify(currentPhotos));
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
          '.kpi-strip', '.dcard', '.closer-cta-box', 'table', 'p', 'h2', 'h3'
        ];
        const sheets = document.querySelectorAll('.page-sheet');
        sheets.forEach(sheet => {
          selectors.forEach(sel => {
            sheet.querySelectorAll(sel).forEach(el => {
              if (el.hasAttribute('data-editable-box')) return;
              el.setAttribute('data-editable-box', 'true');

              // Botón de eliminar flotante
              const delBtn = document.createElement('button');
              delBtn.type = 'button';
              delBtn.className = 'ra-edit-del-btn no-print';
              delBtn.title = 'Eliminar este elemento';
              delBtn.innerHTML = '✕';
              delBtn.onclick = function(ev) {
                ev.stopPropagation();
                ev.preventDefault();
                if (confirm('¿Eliminar este bloque del documento?')) {
                  el.remove();
                }
              };
              el.appendChild(delBtn);

              // Eventos de selección y arrastre
              el.addEventListener('click', function(ev) {
                if (!document.body.classList.contains('mode-edit-layout')) return;
                ev.stopPropagation();
                if (_selectedBox) _selectedBox.classList.remove('selected-edit-box');
                _selectedBox = el;
                el.classList.add('selected-edit-box');
              });

              // Habilitar drag & drop reordenamiento
              el.addEventListener('dragstart', function(ev) {
                if (!document.body.classList.contains('mode-edit-layout')) return;
                _draggedElement = el;
                ev.dataTransfer.effectAllowed = 'move';
                try { ev.dataTransfer.setData('text/plain', ''); } catch(e) {}
                el.style.opacity = '0.45';
              });

              el.addEventListener('dragend', function() {
                if (_draggedElement) _draggedElement.style.opacity = '1';
                _draggedElement = null;
              });

              el.addEventListener('dragover', function(ev) {
                if (!document.body.classList.contains('mode-edit-layout') || !_draggedElement || _draggedElement === el) return;
                ev.preventDefault();
                ev.dataTransfer.dropEffect = 'move';
              });

              el.addEventListener('drop', function(ev) {
                if (!document.body.classList.contains('mode-edit-layout') || !_draggedElement || _draggedElement === el) return;
                ev.preventDefault();
                ev.stopPropagation();
                const parent = el.parentNode;
                if (!parent) return;
                const rect = el.getBoundingClientRect();
                const next = (ev.clientY - rect.top) > (rect.height / 2);
                parent.insertBefore(_draggedElement, next ? el.nextSibling : el);
              });
            });
          });
        });
      }

      document.addEventListener('keydown', function(ev) {
        if (!document.body.classList.contains('mode-edit-layout') || !_selectedBox) return;
        // Si no está escribiendo dentro de un nodo editable
        if (ev.target && ev.target.isContentEditable && ev.target !== _selectedBox) return;
        if (ev.key === 'Delete') {
          _selectedBox.remove();
          _selectedBox = null;
        }
      });

      function applyPropFormat(cmd, val) {
        document.execCommand(cmd, false, val || null);
      }

      function capture3DToProposal() {
        try {
          let canvas = null;
          if (window.opener) {
            if (window.opener.viewer && window.opener.viewer.scene && window.opener.viewer.scene.canvas) {
              window.opener.viewer.scene.render();
              canvas = window.opener.viewer.scene.canvas;
            } else {
              const el = window.opener.document.querySelector('canvas');
              if (el) canvas = el;
            }
          }
          if (canvas) {
            const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
            // Actualizar la foto principal o las fotos del proyecto
            const heroImg = document.getElementById('prop-hero-img') || document.querySelector('.cover-photo-card img') || document.querySelector('.photo-card-hero img');
            if (heroImg) {
              heroImg.src = dataUrl;
              heroImg.style.display = 'block';
              const pl = heroImg.parentElement.querySelector('.photo-placeholder');
              if (pl) pl.style.display = 'none';
            }
            alert('¡Captura 3D del proyecto actualizada con éxito en la propuesta!');
          } else {
            alert('No se pudo acceder al visor 3D de la ventana principal. Asegúrate de que la ventana del proyecto esté abierta.');
          }
        } catch (err) {
          alert('Error capturando vista 3D: ' + err.message);
        }
      }

      // Manejo de selección para barra flotante de formato en la propuesta
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
          btn.textContent = '✏️ EDITAR';
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
          btn.textContent = '💾 FINALIZAR EDICIÓN';
          btn.style.background = '#10b981';
        }
      }
      function exportPropWord() {
        let content = '';
        document.querySelectorAll('.page-sheet').forEach(s => content += s.outerHTML + '<br><br>');
        const styles = document.querySelector('style').innerHTML;
        const header = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>' + document.title + '</title><style>' + styles + '</style></head><body>';
        const footer = '</body></html>';
        const blob = new Blob(['\ufeff' + header + content + footer], { type: 'application/msword;charset=utf-8' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = '${d.refNum}_Propuesta_Comercial.doc';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
      }
      function exportPropHtml() {
        const clone = document.documentElement.cloneNode(true);
        const bar = clone.querySelector('.doc-top-bar'); if (bar) bar.remove();
        clone.querySelectorAll('.ra-edit-del-btn').forEach(b => b.remove());
        clone.querySelectorAll('[data-editable-box]').forEach(el => {
          el.removeAttribute('draggable');
          el.removeAttribute('data-editable-box');
        });
        const blob = new Blob(['\ufeff' + clone.outerHTML], { type: 'text/html;charset=utf-8' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = '${d.refNum}_Propuesta_Comercial.html';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
      }
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
    alert('Por favor, activa las ventanas emergentes (popups) para visualizar la propuesta comercial.');
    return;
  }
  w.document.open();
  w.document.write(code);
  w.document.close();

  // ── Enriquecimiento IA async (si hay API Key configurada) ──
  // La plantilla ya es visible. Gemini reemplaza el texto si responde OK.
  enrichSummaryWithGemini(w, d, m, _eqp);
}

// ═════════════════════════════════════════════════════════════════════════════
// MOTOR FINANCIERO BANCABLE (CAPEX, OPEX, CASHFLOW, VAN, TIR, AMORTIZACIÓN)
// Nota: La física solar y simulación anual se calculan exclusivamente en solar-engine.js (v3.0)
// ═════════════════════════════════════════════════════════════════════════════
  function calculateFinancialModel() {
  const d = getProjectCalcs();
  const mb = (d && d.modulesBreakdown) || (typeof window !== 'undefined' && window.RAModulesBreakdown && typeof window.RAModulesBreakdown.getProjectModulesBreakdown === 'function' ? window.RAModulesBreakdown.getProjectModulesBreakdown() : null);
  const numPanels = (mb && mb.totalPanels > 0) ? mb.totalPanels : (d.numPanels || 1);
  const kwp = (mb && mb.totalKwp > 0) ? mb.totalKwp : ((numPanels * (d.cfg.potencia || 450)) / 1000.0);
  const annualYieldKWh = d.annualKWh || (kwp * 1450); // [P0] getProjectCalcs canónico devuelve annualKWh

  const designCosts = (typeof RAPricing !== 'undefined' && typeof RAPricing.computeDesignCosts === 'function')
    ? RAPricing.computeDesignCosts(numPanels)
    : null;
  const pricing = (typeof RAPricing !== 'undefined') ? RAPricing.getEffectivePricing() : { panelPrice: 125, moPrice: 1400, marginPct: 20 };
  const hasSessionOverride = !!(pricing && pricing.projectFingerprint);
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
    if (typeof pricing.batPrice === 'number' && pricing.batPrice > 0) {
      bat = pricing.batPrice;
    } else if (pricing.batPrice === 0 && (!_batSel || _batSel.id === 'bat_none')) {
      bat = 0;
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
  if (commercialCfg && commercialCfg.discountEnabled) {
    if (commercialCfg.discountType === 'percent') {
      discountEur = subtotalPreDiscount * (Math.max(0, Number(commercialCfg.discountValue) || 0) / 100.0);
    } else {
      discountEur = Math.max(0, Number(commercialCfg.discountValue) || 0);
    }
  }
  const subtotal = Math.max(100, Math.round(subtotalPreDiscount - discountEur));
  const iva = Math.round(subtotal * 0.21);
  const capexBruto = subtotal + iva;
  const capexTachado = (discountEur > 0) ? Math.round(subtotalPreDiscount * 1.21) : null;

  // Fiscalidad
  const ibiCuota = _input('tax-ibi-cuota', 650);
  const ibiOpt = _sel('tax-ibi-opt', '0.50_3');
  let ahorroIBITotal = 0;
  if (ibiOpt === '0.30_3') ahorroIBITotal = ibiCuota * 0.30 * 3;
  else if (ibiOpt === '0.50_3') ahorroIBITotal = ibiCuota * 0.50 * 3;
  else if (ibiOpt === '0.50_5') ahorroIBITotal = ibiCuota * 0.50 * 5;

  // [P0] El elemento 'tax-irpf-opt' no existe en el DOM: leer el select del modal como fuente real.
  const irpfEl = document.getElementById('tax-irpf-opt') || document.getElementById('modal-tax-irpf-opt');
  const irpfPct = parseFloat((irpfEl || {value:'0'}).value) || 0;
  const maxBaseIrpf = irpfPct >= 0.50 ? 15000 : (irpfPct >= 0.30 ? 7500 : 5000);
  const baseIrpf = Math.min(capexBruto, maxBaseIrpf);
  const ahorroIRPF = baseIrpf * irpfPct;

  const icioPct = _input('tax-icio-opt', 0.95);
  const tasaICIO = designCosts && designCosts.icioTaxEur > 0 ? designCosts.icioTaxEur : Math.round(directCost * 0.035);
  const ahorroICIO = Math.round(tasaICIO * icioPct);

  // [SSOT Contable] Como tasaICIO es una tasa municipal externa no cobrada dentro de capexBruto,
  // el ahorro fiscal que reduce la inversión llave en mano del cliente es IBI + IRPF.
  const totalAhorroFiscal = ahorroIBITotal + ahorroIRPF;
  const capexNeto = Math.max(capexBruto - totalAhorroFiscal, 100);

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
  const tou = TOU_PROFILES[touTarifa] || TOU_PROFILES.plana;

  // Perfil solar horario normalizado (kWh por kWh diario producido)
  const SOLAR_PROFILE = [0.00,0.00,0.00,0.00,0.00,0.00,0.02,0.05,0.08,0.10,0.11,0.11,0.10,0.09,0.08,0.06,0.04,0.02,0.00,0.00,0.00,0.00,0.00,0.00];

  // Curva de consumo doméstico normalizada (kWh por kWh diario consumido, suma exacta 1.000)
  const rawLoadProfile = [0.030,0.025,0.022,0.020,0.020,0.028,0.040,0.050,0.045,0.035,0.032,0.035,0.038,0.032,0.030,0.038,0.050,0.065,0.070,0.062,0.052,0.048,0.042,0.036];
  const sumRawLoad = rawLoadProfile.reduce((a, b) => a + b, 0);
  const LOAD_PROFILE = rawLoadProfile.map(v => v / sumRawLoad);

  // [P0] Consumo anual: factura auditada del cliente (bill-auditor) cuando exista,
  // o consumo manual definido por el usuario, o perfil estándar de vivienda/industria
  // desacoplado del tamaño del campo solar.
  const billComp = (typeof window !== 'undefined' && window.RA && window.RA.billAuditor && window.RA.billAuditor.comparison) ? window.RA.billAuditor.comparison : null;
  const manualConsKwh = _input('cfg-pres-consumo-anual', 0) || (typeof window !== 'undefined' && window.solarProjectConfig && window.solarProjectConfig.manualAnnualConsumptionKWh) || 0;
  const defaultBaseConsKwh = (kwp >= 12) ? 18000 : 4500;
  const consumoAnual = (billComp && Number.isFinite(billComp.consumoAnualKWh) && billComp.consumoAnualKWh > 0)
    ? billComp.consumoAnualKWh
    : (manualConsKwh > 0 ? manualConsKwh : defaultBaseConsKwh);

  // ── FASE 5: Despacho Multi-horario Estacional Bancable (12 meses × 24h = 288 horas) ──
  const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const MONTH_LOAD_WEIGHTS = [1.18, 1.12, 1.02, 0.92, 0.84, 0.88, 1.06, 1.02, 0.94, 0.94, 1.02, 1.16]; // Climatización estacional peninsular

  // Producción mensual en kWh (SSOT: solarSimState.monthlyKwh si existe, o desglose estacional)
  let monthlySolarKwh = new Array(12).fill(0);
  if (typeof window !== 'undefined' && window.solarSimState && Array.isArray(window.solarSimState.monthlyKwh) && window.solarSimState.monthlyKwh.length === 12) {
    monthlySolarKwh = window.solarSimState.monthlyKwh.slice();
  } else {
    const solarWeights = [0.045, 0.058, 0.082, 0.098, 0.118, 0.126, 0.132, 0.120, 0.095, 0.068, 0.046, 0.032];
    monthlySolarKwh = solarWeights.map(w => w * annualYieldKWh);
  }

  // Normalización del perfil solar para cada mes según horas solares reales (latitud ~40°N)
  const getMonthlySolarProfile = (m) => {
    const sunrise = 7.8 - 1.8 * Math.sin((m - 2) * Math.PI / 6);
    const sunset = 17.2 + 2.8 * Math.sin((m - 2) * Math.PI / 6);
    const profile = new Array(24).fill(0);
    let sum = 0;
    for (let h = 0; h < 24; h++) {
      if (h + 0.5 > sunrise && h + 0.5 < sunset) {
        const val = Math.sin(Math.PI * (h + 0.5 - sunrise) / (sunset - sunrise));
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

  for (let m = 0; m < 12; m++) {
    const daysInMonth = MONTH_DAYS[m];
    const solarMonthKwh = monthlySolarKwh[m];
    const solarDailyKwh = solarMonthKwh / daysInMonth;
    const solarHourlyProfile = getMonthlySolarProfile(m);

    const loadMonthWeight = MONTH_LOAD_WEIGHTS[m];
    const loadDailyKwh = (consumoAnual / 365.0) * loadMonthWeight;

    let monthDirect = 0;
    let monthBattery = 0;
    let monthSurplus = 0;
    let monthGridBuy = 0;
    let monthCostGrid = 0;
    let monthGridChargeCost = 0;
    let monthSurplusIncome = 0;
    let monthCostSinFV = 0;

    for (let h = 0; h < 24; h++) {
      const pv = solarDailyKwh * solarHourlyProfile[h];
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
        batSoC += charge * batEff;
        surplus -= charge;
      }

      // Arbitraje en valle (si está activo)
      if (batStrategy === 'arbitraje' && maxBatCap > 0 && batSoC < maxBatCap && isValley && h >= 2 && h <= 6) {
        const space = maxBatCap - batSoC;
        const gridCharge = Math.min(space, pBatMaxKw * 1.0, load * 0.5);
        batSoC += gridCharge * batEff;
        monthCostGrid += gridCharge * price;
        monthGridChargeCost += gridCharge * price;
      }

      // Descarga de batería si hay déficit
      if (direct < load) {
        const need = load - direct;
        if (batSoC > 0.01) {
          const maxDischarge = pBatMaxKw * 1.0;
          const discharge = Math.min(need, batSoC, maxDischarge);
          batSoC -= discharge;
          fromBattery = discharge;
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
  const totalAutoconsumo = annualAutoconsumoDirecto / 365.0;
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
  let van = -capexDesembolsoInicial;
  let totalGenerado25 = 0;
  let totalCoste25 = capexDesembolsoInicial;
  let discountedCostsSum = 0;
  let discountedYieldSum = 0;

  const ibiYears = ibiOpt.includes('_5') ? 5 : (ibiOpt.includes('_3') ? 3 : 0);
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

    // Ahorro año 1 anclado estrictamente a ahorroLuzAnio1 (despacho horario 288h / TOU / batería)
    // Años 2 a 25 proyectados por degradación acumulada de módulos y escalado de inflación eléctrica
    const priceY = precioRed * Math.pow(1 + inflacion, y - 1);
    const saveY = (y === 1)
      ? ahorroLuzAnio1
      : (ahorroLuzAnio1 * (yieldY / Math.max(annualYieldKWh, 1)) * Math.pow(1 + inflacion, y - 1));
    annualSavings25.push(Math.round(saveY));

    // OPEX indexado anualmente por IPC de servicios
    const omY = opexYear1 * Math.pow(1 + ipcOpex, y - 1);
    annualOpex25.push(Math.round(omY));
    totalOpex25 += omY;
    totalCoste25 += omY;

    // Inversor replacement en año 12 (según potencia nominal e IPC tecnológico)
    const replY = (y === 12) ? invReplacementCost12 : 0;
    totalCoste25 += replY;

    // Acumular flujos descontados para LCOE bancable (WACC 4%)
    discountedCostsSum += (omY + replY) / Math.pow(1 + r, y);
    discountedYieldSum += yieldY / Math.pow(1 + r, y);

    // Aportación fiscal real sin duplicidad: IRPF en año 1, IBI en años 1 a N_ibi
    let fiscalY = 0;
    if (y === 1) fiscalY += ahorroIRPF;
    if (y <= ibiYears) fiscalY += ibiAnnualBonus;

    const netCF = saveY - omY - replY + fiscalY;
    const discountedCF = netCF / Math.pow(1 + r, y);

    cashflow.push(netCF);
    discountedCashFlow25.push(Math.round(discountedCF));
    acumulado.push(acumulado[y - 1] + netCF);
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

  // Financiación
  const meses = _input('fin-plazo-meses', 120);
  const tinAnual = _input('fin-tin-pct', 5.95) / 100.0;
  const tinMensual = tinAnual / 12.0;
  let cuotaMensual = 0;
  if (meses > 0 && capexBruto > 0) {
    cuotaMensual = (tinMensual > 0)
      ? (capexBruto * (tinMensual * Math.pow(1 + tinMensual, meses))) / (Math.pow(1 + tinMensual, meses) - 1)
      : capexBruto / meses;
    if (!Number.isFinite(cuotaMensual)) cuotaMensual = 0;
  }
  const ahorroMensualLuz = ahorroLuzAnio1 / 12.0;
  const balanceNetoMensual = ahorroMensualLuz - cuotaMensual;

  const ahorroTotal25 = Math.round(annualSavings25.reduce((a, b) => a + b, 0));
  const redKWhAnual = Math.max(0, Math.round(consumoAnual - annualAutoconsumoDirecto - annualBateriaKWh));

  const resultModel = {
    numPanels: numPanels,
    kwp: kwp,
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
    tasaICIO: tasaICIO,
    subtotal: subtotal,
    iva: iva,
    capexBruto: capexBruto,
    ahorroIBITotal: ahorroIBITotal,
    ahorroIRPF: ahorroIRPF,
    ahorroICIO: ahorroICIO,
    totalAhorroFiscal: totalAhorroFiscal,
    capexNeto: capexNeto,
    autarquiaPct: Math.round(autarquia * 100),
    pctAutoconsumo: Math.round(autarquia * 100),
    precioRedEUR: precioRed,
    precioCompensacionEUR: precioCompensacion,
    annualYieldKWh: annualYieldKWh,
    ahorroLuzAnio1: ahorroLuzAnio1,
    ahorroTotal25: ahorroTotal25,
    paybackYears: paybackYears,
    van: van,
    tir: (tir != null && isFinite(tir)) ? tir * 100 : (tirString.startsWith('>') ? 100.0 : null),
    tirString: tirString,
    lcoe: lcoe,
    mesesFin: meses,
    tinAnualPct: tinAnual * 100,
    cuotaMensual: cuotaMensual,
    ahorroMensualLuz: ahorroMensualLuz,
    balanceNetoMensual: balanceNetoMensual,
    cashflowAcum: acumulado,
    touNombre: tou.name,
    batCap: batCap,
    batSoCdiaria: Math.round(batSoC * 10) / 10,
    consumoAnual: Math.round(consumoAnual || 0),
    autoconsumoDirecto: Math.round(annualAutoconsumoDirecto || 0),
    bateriaKWh: Math.round(annualBateriaKWh || 0),
    excedenteKWh: Math.round(annualExcedenteKWh || 0),
    redKWh: redKWhAnual,
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
    opexYear1: Math.round(opexYear1),
    ipcOpexPct: ipcOpex * 100,
    invBasePrice: Math.round(invBasePrice),
    // Métricas de Cronograma Fiscal y WACC (Fase 2.3)
    financialSchedule25: financialSchedule25,
    discountedCashFlow25: discountedCashFlow25,
    capexDesembolsoInicial: Math.round(capexDesembolsoInicial),
    waccPct: Math.round(r * 1000) / 10
  };
  if (typeof window !== 'undefined') {
    window._lastFinModel = resultModel;
  }
  return resultModel;
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
  if (typeof exportPropWord !== 'undefined')
    window.exportPropWord = exportPropWord;
  if (typeof exportPropHtml !== 'undefined')
    window.exportPropHtml = exportPropHtml;
  if (typeof RAPricing !== 'undefined')
    window.RAPricing = RAPricing;
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    generateCommercialSummary: typeof generateCommercialSummary !== 'undefined' ? generateCommercialSummary : null,
    requestCommercialSummaryFromGemini: typeof requestCommercialSummaryFromGemini !== 'undefined' ? requestCommercialSummaryFromGemini : null,
    enrichSummaryWithGemini: typeof enrichSummaryWithGemini !== 'undefined' ? enrichSummaryWithGemini : null,
    calculateFinancialModel: typeof calculateFinancialModel !== 'undefined' ? calculateFinancialModel : null,
    RAPricing: typeof RAPricing !== 'undefined' ? RAPricing : null
  };
}
})();
