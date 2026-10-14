// RA-FINANCIALS — Motor financiero bancable a 25 años (CAPEX, OPEX, VAN, TIR, LCOE, Cashflow)
// La física solar y simulación energética se calculan exclusivamente en solar-engine.js (v3.0)
(function() {
  'use strict';

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
    // Batería
    batName: 'Sin acumulación (Conexión Directa)',
    batBrand: '', batModel: '', batKwh: 0, batCount: 0, hasBat: false,
    // Microinversor
    microName: '', microBrand: '', microModel: '', microCount: 0, hasMicro: false,
    // Topología
    topology: cfg.selectedTopology || 'inverter'
  };

  // ── Inversor ──
  if (cfg.selectedInverterId && cat.inverters && Array.isArray(cat.inverters)) {
    var inv = cat.inverters.find(function(i) { return i.id === cfg.selectedInverterId; });
    if (inv) {
      result.invBrand = inv.brand || '';
      result.invModel = inv.model || '';
      result.invKw = inv.kw || inv.kw_nominal || 0;
      result.invMPPTs = inv.mppts || inv.nMppt || 0;
      var sizing = cfg.autoSizing && cfg.autoSizing.inverters;
      result.invCount = (sizing && sizing.count) ? sizing.count : 1;
      var mpptTxt = result.invMPPTs > 0 ? (' · ' + result.invMPPTs + ' MPPT') : '';
      result.invName = result.invBrand + ' ' + result.invModel + ' (' + result.invKw + ' kW' + mpptTxt + ')';
    }
  }

  // ── Batería ──
  if (cfg.selectedBatteryId && cat.batteries && Array.isArray(cat.batteries)) {
    var bat = cat.batteries.find(function(b) { return b.id === cfg.selectedBatteryId; });
    if (bat && bat.id !== 'bat_none' && ((bat.kwh || bat.capacity || 0) > 0)) {
      result.batBrand = bat.brand || '';
      result.batModel = bat.model || '';
      result.batKwh = bat.kwh || bat.capacity || 0;
      var batSizing = cfg.autoSizing && cfg.autoSizing.batteries;
      result.batCount = (batSizing && batSizing.count) ? batSizing.count : 1;
      result.hasBat = true;
      var totalKwh = (result.batKwh * result.batCount).toFixed(1);
      result.batName = result.batBrand + ' ' + result.batModel + ' (' + totalKwh + ' kWh)';
    } else {
      result.hasBat = false;
      result.batBrand = '';
      result.batModel = '';
      result.batKwh = 0;
      result.batCount = 0;
      result.batName = 'Sin batería';
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
    }
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// RESUMEN COMERCIAL HÍBRIDO (Plantilla determinista + Gemini opcional)
// Tono: comercial-cercano — vendedor que inspira confianza
// Devuelve HTML sincrónico con la plantilla. Si hay API Key, lanza
// enrichSummaryWithGemini() async para reemplazar el contenido.
// ═══════════════════════════════════════════════════════════════════════════════
function generateCommercialSummary(d, m, equipment) {
  var kwp = m.kwp || 0;
  var numPanels = m.numPanels || 0;
  var annualKWh = d.annualKWh || (kwp * 1450);
  var ahorro = m.ahorroLuzAnio1 || 0;
  var payback = m.paybackYears || 0;
  var autoconsumo = m.pctAutoconsumo || 0;
  var ciudad = d.tit.mun || d.tit.prov || 'su localidad';
  var nombre = d.tit.nombre || 'Estimado/a cliente';

  // ── Plantilla determinista ──
  var lines = [];
  lines.push('Estimado/a <strong>' + nombre.split(' ')[0] + '</strong>,');
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
// ENRIQUECIMIENTO GEMINI ASYNC — Se llama tras abrir la ventana de oferta
// Reemplaza el contenido del bloque resumen con la respuesta de Gemini.
// Si falla por cualquier motivo, el resumen de plantilla permanece visible.
// ═══════════════════════════════════════════════════════════════════════════════
async function enrichSummaryWithGemini(targetWindow, d, m, equipment) {
  // ── Obtener API Key ──
  var apiKey = '';
  try {
    apiKey = (window.RA && window.RA.geminiApiKey) ? window.RA.geminiApiKey
           : (localStorage.getItem('ra_gemini_api_key') || '');
  } catch(e) { return; }
  if (!apiKey) return; // Sin key → mantener plantilla

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

  // ── Construir prompt estructurado ──
  var kwp = m.kwp || 0;
  var numPanels = m.numPanels || 0;
  var annualKWh = d.annualKWh || (kwp * 1450);
  var ahorro = m.ahorroLuzAnio1 || 0;
  var payback = m.paybackYears || 0;
  var autoconsumo = m.pctAutoconsumo || 0;
  var ciudad = d.tit.mun || d.tit.prov || 'su localidad';
  var nombre = d.tit.nombre || 'Cliente';

  var prompt = 'Eres un asesor solar comercial profesional redactando una propuesta para un cliente residencial. ' +
    'Escribe un párrafo de presentación comercial (máx 120 palabras) en español con tono cercano, profesional y que inspire confianza. ' +
    'NO uses saludo ("Estimado"), NO uses formato markdown. Usa HTML inline simple (<strong> para destacar cifras clave). ' +
    'Datos del proyecto:\n' +
    '- Cliente: ' + nombre + '\n' +
    '- Ubicación: ' + ciudad + '\n' +
    '- Módulos: ' + numPanels + ' paneles\n' +
    '- Potencia: ' + kwp.toFixed(2) + ' kWp\n' +
    '- Producción anual: ' + Math.round(annualKWh).toLocaleString('es-ES') + ' kWh\n' +
    '- Ahorro año 1: ' + Math.round(ahorro).toLocaleString('es-ES') + ' €\n' +
    '- Payback: ' + payback.toFixed(1) + ' años\n';
  if (autoconsumo > 0) prompt += '- Autoconsumo: ' + Math.round(autoconsumo) + '%\n';
  if (equipment && equipment.hasBat) prompt += '- Batería: ' + equipment.batName + '\n';
  if (equipment) prompt += '- Inversor: ' + equipment.invName + '\n';

  // ── Llamada REST a Gemini ──
  try {
    var modelsToTry = ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-2.0-flash'];
    var text = '';
    for (var mIdx = 0; mIdx < modelsToTry.length; mIdx++) {
      var currentModel = modelsToTry[mIdx];
      var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + currentModel + ':generateContent?key=' + encodeURIComponent(apiKey);
      var resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 300
          }
        })
      });
      if (resp.ok) {
        var data = await resp.json();
        if (data.candidates && data.candidates[0] && data.candidates[0].content &&
            data.candidates[0].content.parts && data.candidates[0].content.parts[0]) {
          text = data.candidates[0].content.parts[0].text || '';
          if (text.trim()) break;
        }
      }
    }
    if (!text.trim()) {
      if (badge) badge.innerHTML = '📋 Resumen del proyecto';
      return; // Mantener plantilla
    }
    if (text.trim()) {
      container.innerHTML = text.trim();
      if (badge) badge.innerHTML = '✨ Resumen generado con IA · Google Gemini';
    }
  } catch(err) {
    if (badge) badge.innerHTML = '📋 Resumen del proyecto';
    if (window.RA_ErrorHandler) window.RA_ErrorHandler.handleAsyncAPI(err, 'Gemini AI');
  }
}


// ============================================================================
// SISTEMA DE PRECIOS Y MARGEN COMERCIAL (RAPricing)
// ============================================================================
var RAPricing = {
  STORAGE_KEY: 'ra_pricing_defaults',
  currentSessionPricing: null,

  getDefaults: function() {
    if (this.currentSessionPricing) return this.currentSessionPricing;
    try {
      var saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved) {
        var parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          return {
            panelPrice: (typeof parsed.panelPrice === 'number' && parsed.panelPrice > 0) ? parsed.panelPrice : 125,
            moPrice: (typeof parsed.moPrice === 'number' && parsed.moPrice >= 0) ? parsed.moPrice : 1400,
            marginPct: (typeof parsed.marginPct === 'number' && parsed.marginPct >= 0) ? parsed.marginPct : 20,
            skipReview: !!parsed.skipReview
          };
        }
      }
    } catch(e) {}
    return {
      panelPrice: 125,
      moPrice: 1400,
      marginPct: 20,
      skipReview: false
    };
  },

  saveDefaults: function(cfg) {
    this.currentSessionPricing = Object.assign({}, cfg);
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(cfg));
    } catch(e) {}
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
      '<div style="background:#0f172a;border:1px solid #334155;border-radius:12px;width:560px;max-width:96vw;display:flex;flex-direction:column;box-shadow:0 25px 50px -12px rgba(0,0,0,0.85);overflow:hidden;color:#fff;font-family:Inter,system-ui,sans-serif;">' +
        '<div style="padding:14px 20px;background:rgba(0,0,0,0.4);border-bottom:1px solid rgba(255,255,255,0.08);display:flex;justify-content:space-between;align-items:center;">' +
          '<div style="display:flex;align-items:center;gap:10px;">' +
            '<span style="font-size:18px;">🏷️</span>' +
            '<div>' +
              '<div style="font-weight:900;font-size:13px;color:#fff;letter-spacing:0.5px;">REVISIÓN DE PRECIOS Y MARGEN COMERCIAL</div>' +
              '<div id="pricing-modal-subtitle" style="font-size:9.5px;color:#94a3b8;">Confirma costes unitarios y margen de beneficio antes de emitir la oferta</div>' +
            '</div>' +
          '</div>' +
          '<button type="button" id="btn-close-pricing-review" style="background:transparent;border:none;color:#94a3b8;font-size:18px;cursor:pointer;padding:4px 8px;">✕</button>' +
        '</div>' +
        '<div style="padding:18px 20px;display:flex;flex-direction:column;gap:14px;">' +
          '<div style="background:rgba(30,41,59,0.5);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:10px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;">' +
              '<div>' +
                '<div style="font-size:11px;font-weight:800;color:#f8fafc;">Módulos Fotovoltaicos</div>' +
                '<div id="pricing-modal-module-info" style="font-size:9.5px;color:#94a3b8;">Proyecto actual: 0 paneles</div>' +
              '</div>' +
              '<div style="display:flex;align-items:center;gap:6px;">' +
                '<input type="number" id="pricing-input-panel-price" min="50" max="1000" step="5" style="width:85px;padding:5px 8px;background:rgba(0,0,0,0.4);border:1px solid #475569;border-radius:6px;color:#fff;font-size:11px;font-weight:700;text-align:right;">' +
                '<span style="font-size:10.5px;color:#cbd5e1;">€/ud</span>' +
              '</div>' +
            '</div>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;">' +
              '<div>' +
                '<div style="font-size:11px;font-weight:800;color:#f8fafc;">Mano de Obra & Montaje</div>' +
                '<div style="font-size:9.5px;color:#94a3b8;">Instalación completa en cubierta</div>' +
              '</div>' +
              '<div style="display:flex;align-items:center;gap:6px;">' +
                '<input type="number" id="pricing-input-mo-price" min="0" max="20000" step="50" style="width:85px;padding:5px 8px;background:rgba(0,0,0,0.4);border:1px solid #475569;border-radius:6px;color:#fff;font-size:11px;font-weight:700;text-align:right;">' +
                '<span style="font-size:10.5px;color:#cbd5e1;">€</span>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div style="background:rgba(30,41,59,0.5);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:10px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;">' +
              '<div>' +
                '<div style="font-size:11px;font-weight:800;color:#FBBF24;">Margen Comercial Deseado</div>' +
                '<div style="font-size:9.5px;color:#94a3b8;">Beneficio bruto aplicado sobre costes directos</div>' +
              '</div>' +
              '<div style="display:flex;align-items:center;gap:6px;">' +
                '<input type="number" id="pricing-input-margin-pct" min="0" max="100" step="1" style="width:70px;padding:5px 8px;background:rgba(0,0,0,0.4);border:1px solid #F59E0B;border-radius:6px;color:#FBBF24;font-size:11px;font-weight:800;text-align:right;">' +
                '<span style="font-size:11px;color:#FBBF24;font-weight:800;">%</span>' +
              '</div>' +
            '</div>' +
            '<div style="display:flex;gap:6px;">' +
              '<button type="button" class="btn-preset-margin" data-margin="15" style="flex:1;padding:4px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:4px;color:#cbd5e1;font-size:10px;font-weight:700;cursor:pointer;">15%</button>' +
              '<button type="button" class="btn-preset-margin" data-margin="20" style="flex:1;padding:4px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:4px;color:#cbd5e1;font-size:10px;font-weight:700;cursor:pointer;">20%</button>' +
              '<button type="button" class="btn-preset-margin" data-margin="25" style="flex:1;padding:4px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:4px;color:#cbd5e1;font-size:10px;font-weight:700;cursor:pointer;">25%</button>' +
              '<button type="button" class="btn-preset-margin" data-margin="30" style="flex:1;padding:4px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:4px;color:#cbd5e1;font-size:10px;font-weight:700;cursor:pointer;">30%</button>' +
            '</div>' +
          '</div>' +
          '<div style="background:linear-gradient(135deg,rgba(16,185,129,0.12),rgba(5,150,105,0.06));border:1px solid rgba(16,185,129,0.3);border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:6px;">' +
            '<div style="display:flex;justify-content:space-between;font-size:10.5px;color:#94a3b8;">' +
              '<span>Coste Directo (Materiales + MO):</span>' +
              '<b id="pricing-preview-direct" style="color:#f8fafc;">0 €</b>' +
            '</div>' +
            '<div style="display:flex;justify-content:space-between;font-size:10.5px;color:#34D399;">' +
              '<span>Beneficio Comercial Estimado:</span>' +
              '<b id="pricing-preview-margin">+0 €</b>' +
            '</div>' +
            '<div style="display:flex;justify-content:space-between;font-size:10.5px;color:#94a3b8;">' +
              '<span>Subtotal Venta (Base Imponible):</span>' +
              '<b id="pricing-preview-subtotal" style="color:#f8fafc;">0 €</b>' +
            '</div>' +
            '<hr style="border:0;border-top:1px solid rgba(16,185,129,0.2);margin:4px 0;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;">' +
              '<span style="font-size:11px;font-weight:900;color:#34D399;text-transform:uppercase;">TOTAL LLAVE EN MANO (IVA 21%):</span>' +
              '<b id="pricing-preview-total" style="font-size:16px;color:#fff;font-weight:900;">0 €</b>' +
            '</div>' +
          '</div>' +
          '<div style="display:flex;flex-direction:column;gap:6px;">' +
            '<label style="display:flex;align-items:center;gap:8px;font-size:10px;color:#cbd5e1;cursor:pointer;">' +
              '<input type="checkbox" id="pricing-check-save-defaults" checked style="accent-color:#10b981;">' +
              'Guardar como mis precios habituales para futuros proyectos' +
            '</label>' +
            '<label style="display:flex;align-items:center;gap:8px;font-size:10px;color:#94a3b8;cursor:pointer;">' +
              '<input type="checkbox" id="pricing-check-skip-future" style="accent-color:#10b981;">' +
              'No volver a mostrar esta confirmación en esta sesión (emitir directo)' +
            '</label>' +
          '</div>' +
        '</div>' +
        '<div style="padding:12px 20px;background:rgba(0,0,0,0.5);border-top:1px solid rgba(255,255,255,0.08);display:flex;justify-content:flex-end;gap:10px;">' +
          '<button type="button" id="btn-cancel-pricing-review" style="padding:7px 14px;background:transparent;border:1px solid #475569;border-radius:6px;color:#cbd5e1;font-size:11px;font-weight:700;cursor:pointer;">CANCELAR</button>' +
          '<button type="button" id="btn-confirm-pricing-review" style="padding:7px 18px;background:linear-gradient(135deg,#059669,#10B981);border:none;border-radius:6px;color:#fff;font-size:11px;font-weight:900;cursor:pointer;display:flex;align-items:center;gap:6px;box-shadow:0 0 12px rgba(16,185,129,0.3);">' +
            '🚀 EMITIR OFERTA CON ESTOS PRECIOS' +
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
  var moInput = document.getElementById('pricing-input-mo-price');
  var mgInput = document.getElementById('pricing-input-margin-pct');
  var checkSave = document.getElementById('pricing-check-save-defaults');
  var checkSkip = document.getElementById('pricing-check-skip-future');
  var modInfo = document.getElementById('pricing-modal-module-info');
  var subTitle = document.getElementById('pricing-modal-subtitle');
  var confirmBtn = document.getElementById('btn-confirm-pricing-review');

  if (subTitle) {
    subTitle.textContent = (typeof onConfirm === 'function')
      ? 'Confirma costes unitarios y margen de beneficio antes de emitir la oferta'
      : 'Ajusta los costes unitarios y margen comercial aplicados al presupuesto del proyecto';
  }
  if (confirmBtn) {
    confirmBtn.innerHTML = (typeof onConfirm === 'function')
      ? '🚀 EMITIR OFERTA CON ESTOS PRECIOS'
      : '💾 APLICAR PRECIOS &amp; MARGEN';
  }

  var d = (typeof getProjectCalcs === 'function') ? getProjectCalcs() : { numPanels: 0, cfg: { potencia: 450 } };
  var numPanels = d.numPanels || (window.allRenderedPanels ? window.allRenderedPanels.length : 0) || 1;
  var kwp = (numPanels * (d.cfg && d.cfg.potencia ? d.cfg.potencia : 450)) / 1000.0;
  if (modInfo) {
    modInfo.textContent = 'Proyecto actual: ' + numPanels + ' módulos (' + kwp.toFixed(2) + ' kWp)';
  }

  if (pInput) pInput.value = pricing.panelPrice;
  if (moInput) moInput.value = pricing.moPrice;
  if (mgInput) mgInput.value = pricing.marginPct;
  if (checkSave) checkSave.checked = true;
  if (checkSkip) checkSkip.checked = !!pricing.skipReview;

  function recalculateLive() {
    var pPrice = parseFloat(pInput ? pInput.value : 125) || 125;
    var moPrice = parseFloat(moInput ? moInput.value : 1400) || 0;
    var mgPct = parseFloat(mgInput ? mgInput.value : 20) || 0;

    // Temporal override to calculate live
    var currentDef = RAPricing.currentSessionPricing || RAPricing.getDefaults();
    RAPricing.currentSessionPricing = {
      panelPrice: pPrice,
      moPrice: moPrice,
      marginPct: mgPct,
      skipReview: currentDef.skipReview
    };

    var m = (typeof calculateFinancialModel === 'function') ? calculateFinancialModel() : null;
    if (m) {
      var dEl = document.getElementById('pricing-preview-direct');
      var mEl = document.getElementById('pricing-preview-margin');
      var sEl = document.getElementById('pricing-preview-subtotal');
      var tEl = document.getElementById('pricing-preview-total');
      if (dEl) dEl.textContent = Math.round(m.directCost || (m.subtotal - (m.marginEur || 0))).toLocaleString('es-ES') + ' €';
      if (mEl) mEl.textContent = '+' + Math.round(m.marginEur || 0).toLocaleString('es-ES') + ' € (' + mgPct + '%)';
      if (sEl) sEl.textContent = Math.round(m.subtotal).toLocaleString('es-ES') + ' €';
      if (tEl) tEl.textContent = Math.round(m.capexBruto).toLocaleString('es-ES') + ' €';
    }
  }

  recalculateLive();

  if (pInput) pInput.oninput = recalculateLive;
  if (moInput) moInput.oninput = recalculateLive;
  if (mgInput) mgInput.oninput = recalculateLive;

  var presetBtns = pModal.querySelectorAll('.btn-preset-margin');
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
    pModal.style.display = 'none';
  };

  var closeBtn = document.getElementById('btn-close-pricing-review');
  if (closeBtn) closeBtn.onclick = function() { closeModal(true); };
  var cancelBtn = document.getElementById('btn-cancel-pricing-review');
  if (cancelBtn) cancelBtn.onclick = function() { closeModal(true); };

  if (confirmBtn) {
    confirmBtn.onclick = function() {
      var pPrice = parseFloat(pInput ? pInput.value : 125) || 125;
      var moPrice = parseFloat(moInput ? moInput.value : 1400) || 0;
      var mgPct = parseFloat(mgInput ? mgInput.value : 20) || 0;
      var skip = checkSkip ? checkSkip.checked : false;

      var newCfg = {
        panelPrice: pPrice,
        moPrice: moPrice,
        marginPct: mgPct,
        skipReview: skip
      };

      if (checkSave && checkSave.checked) {
        RAPricing.saveDefaults(newCfg);
      } else {
        RAPricing.currentSessionPricing = newCfg;
      }

      // Sincronizar input del modal de desglose si existe en el DOM
      var moModal = document.getElementById('modal-cfg-pres-mo');
      if (moModal) moModal.value = moPrice;

      wpUpdateStep5PricingBadge();
      if (typeof updateBudgetUI === 'function') updateBudgetUI();

      var sumContainer = document.getElementById('step5-executive-summary-container');
      if (sumContainer && typeof EngineeringExplainer !== 'undefined' && typeof EngineeringExplainer.generateExecutiveSummaryHTML === 'function') {
        var pCalcs = (typeof getProjectCalcs === 'function') ? getProjectCalcs() : {};
        sumContainer.innerHTML = EngineeringExplainer.generateExecutiveSummaryHTML(pCalcs);
      }

      if (typeof showToast === 'function') {
        showToast('PRECIOS ACTUALIZADOS', 'Precios y margen comercial aplicados correctamente.', 'success', 3000);
      }

      closeModal(false);
      if (typeof onConfirm === 'function') {
        onConfirm();
      }
    };
  }

  pModal.style.display = 'flex';
}
if (typeof window !== 'undefined') {
  window.wpOpenPricingReviewModal = wpOpenPricingReviewModal;
}


// ============================================================================
// GENERADOR DE PROPUESTA COMERCIAL & OFERTA ECONÓMICA EN PDF PARA CLIENTE
// ============================================================================
function generatePropuestaComercialPDF(skipPricingModal) {
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
  const pricing = (typeof RAPricing !== 'undefined') ? RAPricing.getDefaults() : null;
  if (!skipPricingModal && pricing && !pricing.skipReview && typeof wpOpenPricingReviewModal === 'function') {
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
  const theme        = branding.theme || 'emerald';
  const warPower     = branding.warPower || '25';
  const warMod       = branding.warMod   || '15';
  const warInv       = branding.warInv   || '10';
  const warMo        = branding.warMo    || '5';

  // ── Paleta de color por tema ──────────────────────────────────────────────
  const THEMES = {
    emerald: { primary: '#059669', light: '#d1fae5', accent: '#10b981', dark: '#065f46' },
    sky:     { primary: '#0284c7', light: '#e0f2fe', accent: '#38bdf8', dark: '#0c4a6e' },
    amber:   { primary: '#d97706', light: '#fef3c7', accent: '#f59e0b', dark: '#92400e' },
    slate:   { primary: '#475569', light: '#f1f5f9', accent: '#64748b', dark: '#1e293b' },
    rose:    { primary: '#e11d48', light: '#ffe4e6', accent: '#f43f5e', dark: '#881337' }
  };
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
      .page-sheet { width: 840px; background: #ffffff; padding: 40px 48px; margin-bottom: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); border-radius: 4px; }
      .cover-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid ${pal.primary}; padding-bottom: 16px; margin-bottom: 22px; }
      .company-block { display: flex; align-items: center; gap: 14px; }
      .company-text .name { font-size: 18px; font-weight: 900; color: #0f172a; }
      .company-text .sub { font-size: 9.5px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px; margin-top: 2px; }
      .company-text .contact { font-size: 9px; color: #94a3b8; margin-top: 3px; }
      .doc-ref-box { text-align: right; font-size: 11px; color: #475569; }
      .doc-ref-box b { color: #0f172a; font-size: 13px; }
      h2 { font-size: 13px; font-weight: 800; color: #1e293b; text-transform: uppercase; letter-spacing: 0.5px; margin: 20px 0 10px; border-left: 4px solid ${pal.primary}; padding-left: 10px; }
      .hero-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 12px 0 20px; }
      .hero-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; text-align: center; }
      .hero-val { font-size: 19px; font-weight: 900; color: #0f172a; margin-top: 4px; }
      .hero-val.primary { color: ${pal.primary}; }
      .hero-lbl { font-size: 9px; font-weight: 700; color: #64748b; text-transform: uppercase; }
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
      .closer-hero-lbl { font-size: 9px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
      .closer-hero-sub { font-size: 8.5px; color: #64748b; margin-top: 2px; font-weight: 600; }
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
      .pill { display: inline-block; background: ${pal.light}; color: ${pal.dark}; font-size: 8.5px; font-weight: 800; padding: 3px 8px; border-radius: 12px; margin: 2px; }
      @media print {
        body { background: #fff; padding: 0; padding-top: 0; }
        .doc-top-bar { display: none !important; }
        .page-sheet { box-shadow: none; padding: 28px 36px; margin: 0; page-break-after: always; width: 100%; }
        .page-sheet:last-child { page-break-after: avoid; }
      }
    </style>
  </head>
  <body>
    <div class="doc-top-bar no-print">
      <div class="doc-bar-title"><span>OFERTA COMERCIAL</span> PROPUESTA ECONÓMICA Y TÉCNICA · ${d.refNum}</div>
      <div class="doc-bar-btns">
        <button class="doc-btn doc-btn-edit" id="btn-prop-edit" onclick="togglePropEdit()">✏️ EDITAR</button>
        <button class="doc-btn doc-btn-print" onclick="window.print()">🖨 IMPRIMIR / PDF</button>
        <button class="doc-btn doc-btn-word" onclick="exportPropWord()">📝 WORD (.DOC)</button>
        <button class="doc-btn doc-btn-html" onclick="exportPropHtml()">🌐 HTML</button>
        <button class="doc-btn doc-btn-close" onclick="window.close()">✕</button>
      </div>
    </div>

    <!-- PÁGINA 1: PÁGINA DE CIERRE / HOJA DE DECISIÓN EJECUTIVA -->
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
          Fecha: ${d.fechaStr}<br>
          Validez: 30 días naturales<br>
          <span style="display:inline-block;margin-top:4px;padding:2px 8px;background:${pal.light};color:${pal.dark};border-radius:4px;font-size:9px;font-weight:800;">${branding.status === 'orientativa' ? 'OFERTA ORIENTATIVA' : 'OFERTA VINCULANTE'}</span>
        </div>
      </div>

      <div style="text-align:center;margin:8px 0 14px;">
        <h1 style="font-size:20px;font-weight:900;color:#0f172a;letter-spacing:-0.5px;">PROPUESTA DE DECISIÓN: TU PLAN SOLAR FOTOVOLTAICO</h1>
        <div style="font-size:11px;color:#64748b;margin-top:3px;">
          Estudio de viabilidad económica y técnica para <b>${d.tit.nombre}</b> · ${d.tit.dir || 'Instalación Solar'}, ${d.tit.mun || ''}
        </div>
      </div>

      <!-- 4 HEROS MONUMENTALES (SUPER KPIS PARA EL CLIENTE) -->
      <div class="closer-hero-grid">
        <div class="closer-hero-card highlight">
          <div class="closer-hero-lbl">Ahorro en tu Factura</div>
          <div class="closer-hero-val primary">${Math.round(m.ahorroLuzAnio1).toLocaleString('es-ES')} €</div>
          <div class="closer-hero-sub">al año (${Math.round(m.ahorroMensualLuz)} €/mes)</div>
        </div>
        <div class="closer-hero-card">
          <div class="closer-hero-lbl">Nueva Factura Estimada</div>
          <div class="closer-hero-val" style="color:#0284c7;">~${Math.round(gastoMensualConSolar)} €</div>
          <div class="closer-hero-sub">antes ~${Math.round(gastoMensualSinSolar)} €/mes</div>
        </div>
        <div class="closer-hero-card">
          <div class="closer-hero-lbl">Retorno de Inversión</div>
          <div class="closer-hero-val">${m.paybackYears.toFixed(1)} Años</div>
          <div class="closer-hero-sub">¡Energía gratis 20+ años!</div>
        </div>
        <div class="closer-hero-card">
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
            <span style="font-size:9px;background:${pal.light};color:${pal.dark};padding:2px 6px;border-radius:4px;">RECOMENDADA</span>
          </div>
          <div class="decision-row">
            <span>Presupuesto Instalación (IVA 21% inc.):</span>
            <b>${Math.round(m.capexBruto).toLocaleString('es-ES')} €</b>
          </div>
          <div class="decision-row" style="color:${pal.primary};">
            <span>Bonificaciones Fiscales (IBI/ICIO/IRPF):</span>
            <b>- ${Math.round(m.totalAhorroFiscal).toLocaleString('es-ES')} €</b>
          </div>
          <div class="decision-total" style="color:${pal.dark};">
            <span>COSTE REAL NETO:</span>
            <span style="font-size:16px;color:${pal.primary};">${Math.round(m.capexNeto).toLocaleString('es-ES')} €</span>
          </div>
          <div style="font-size:8.5px;color:#64748b;margin-top:6px;">
            Ahorro neto acumulado a 25 años: <b>${Math.round(m.van + m.capexBruto).toLocaleString('es-ES')} €</b>
          </div>
        </div>

        <div class="decision-card">
          <div class="decision-title" style="color:#2563eb;">
            <span>OPCIÓN B: FINANCIACIÓN 100%</span>
            <span style="font-size:9px;background:#dbeafe;color:#1e40af;padding:2px 6px;border-radius:4px;">0 € ENTRADA</span>
          </div>
          <div class="decision-row">
            <span>Cuota mensual (${m.mesesFin / 12} años):</span>
            <b style="color:#2563eb;">${Math.round(m.cuotaMensual)} €/mes</b>
          </div>
          <div class="decision-row" style="color:${pal.primary};">
            <span>Ahorro estimado en tu factura:</span>
            <b>+ ${Math.round(m.ahorroMensualLuz)} €/mes</b>
          </div>
          <div class="decision-total" style="color:#10b981;">
            <span>BALANCE EN TU BOLSILLO:</span>
            <span style="font-size:16px;color:#059669;">+ ${Math.round(m.balanceNetoMensual)} €/mes</span>
          </div>
          <div style="font-size:8.5px;color:#64748b;margin-top:6px;">
            La instalación se paga sola con el ahorro de luz desde el primer mes.
          </div>
        </div>
      </div>

      <!-- RESUMEN EJECUTIVO / IMPACTO AMBIENTAL -->
      <div style="margin:12px 0 10px;padding:10px 14px;background:linear-gradient(135deg,${pal.light},#f8fafc);border-left:4px solid ${pal.primary};border-radius:0 8px 8px 0;font-size:10.5px;line-height:1.5;color:#334155;">
        <div id="ra-ai-summary-badge" style="font-size:8px;text-transform:uppercase;letter-spacing:1px;color:${pal.primary};font-weight:800;margin-bottom:4px;">📋 Resumen del proyecto</div>
        <div id="ra-ai-summary-content">${_summaryHTML}</div>
      </div>

      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin:10px 0;">
        <span class="pill">⚡ ${m.kwp.toFixed(2)} kWp (${m.numPanels} Módulos)</span>
        <span class="pill">☀️ ${Math.round(annualYieldKWh).toLocaleString('es-ES')} kWh/año Generación</span>
        <span class="pill">🌱 ${Math.round(annualYieldKWh * 0.25).toLocaleString('es-ES')} kg CO₂ evitados/año</span>
        <span class="pill">🌳 Eq. ${Math.round(annualYieldKWh * 0.015)} árboles/año</span>
      </div>

      <!-- CUADRO DE ACEPTACIÓN INMEDIATA (CIERRE COMERCIAL) -->
      <div class="closer-cta-box">
        <div>
          <div style="font-weight:900;font-size:11.5px;color:#0f172a;">ACEPTACIÓN DE LA PROPUESTA Y RESERVA DE INSTALACIÓN</div>
          <div style="font-size:9px;color:#64748b;margin-top:2px;">Conforme con las condiciones económicas expuestas para el inicio del proyecto técnico.</div>
        </div>
        <div style="text-align:right;font-size:9.5px;color:#334155;">
          Firma del Cliente: ________________________ Fecha: ___/___/2026<br>
          <b>${d.tit.nombre}</b> (NIF: ${d.tit.nif || '___________'})
        </div>
      </div>
    </div>

    <!-- PÁGINA 2: ESPECIFICACIÓN TÉCNICA Y DESGLOSE EPC -->
    <div class="page-sheet">
      <div class="cover-header">
        <div class="company-text">
          <div class="name">ESPECIFICACIÓN <span style="color:${pal.primary}">TÉCNICA &amp; EPC</span></div>
          <div class="sub">Datos de Emplazamiento · Catálogo de Equipos · Desglose de Partidas</div>
        </div>
        <div class="doc-ref-box"><b>Ref: ${d.refNum}</b><br>Hoja 2 de 3</div>
      </div>

      <h2>1. Datos del cliente y ubicación</h2>
      <table>
        <tr><td width="32%"><strong>Cliente / Titular:</strong></td><td>${d.tit.nombre} (${d.tit.nif})</td></tr>
        <tr><td><strong>Dirección Instalación:</strong></td><td>${d.tit.dir || 'Instalación Solar'}, ${d.tit.mun || ''} (${d.tit.prov || ''})</td></tr>
        <tr><td><strong>Punto Suministro (CUPS):</strong></td><td>${d.tit.cups}</td></tr>
        <tr><td><strong>Modalidad Autoconsumo:</strong></td><td>${d.modalTexto}</td></tr>
      </table>

      <h2>2. Configuración técnica seleccionada</h2>
      <table>
        <tr><th>Componente</th><th>Especificación / Modelo</th><th class="text-right">Cantidad</th></tr>
        <tr><td>Módulos Fotovoltaicos</td><td>${d.cfg.modelo} (${d.cfg.potencia} Wp · ${d.cfg.tecnologia})</td><td class="text-right">${m.numPanels} uds</td></tr>
        <tr><td>Inversor de Conexión a Red</td><td>${_eqp.invName}</td><td class="text-right">${_eqp.invCount} ud${_eqp.invCount > 1 ? 's' : ''}</td></tr>
        <tr><td>Sistema de Almacenamiento</td><td>${_eqp.hasBat ? _eqp.batName : 'Sin acumulación (Conexión Directa)'}</td><td class="text-right">${_eqp.hasBat ? (_eqp.batCount + ' ud' + (_eqp.batCount > 1 ? 's' : '')) : '—'}</td></tr>
        ${_eqp.hasMicro ? '<tr><td>Microinversores / Optimizadores</td><td>' + _eqp.microName + '</td><td class="text-right">' + _eqp.microCount + ' uds</td></tr>' : ''}
        <tr><td>Estructura y Fijaciones</td><td>Aluminio Anodizado AL6005-T5 con tornillería Inox A2</td><td class="text-right">${m.numPanels} uds</td></tr>
        <tr><td>Cableado & Protecciones</td><td>Cable Solar ZZ-F 1.5kV + Cuadro DC/AC con SPD Tipo II e IGA</td><td class="text-right">1 lote</td></tr>
      </table>

      <h2>3. Desglose económico EPC</h2>
      <table>
        <tr><th>Capítulo</th><th>Descripción</th><th class="text-right">Importe (€)</th></tr>
        <tr><td>Cap. 1</td><td>Módulos Solares Fotovoltaicos de Alta Eficiencia (${m.numPanels} uds × ${m.unitPanelPrice || 125} €)</td><td class="text-right">${m.panCost.toLocaleString('es-ES')} €</td></tr>
        <tr><td>Cap. 2</td><td>Estructura de Soporte y Fijación</td><td class="text-right">${m.estCost.toLocaleString('es-ES')} €</td></tr>
        <tr><td>Cap. 3</td><td>Inversor de Conexión a Red & Monitorización</td><td class="text-right">${m.invCost.toLocaleString('es-ES')} €</td></tr>
        <tr><td>Cap. 4</td><td>Sistema de Baterías LFP (si aplica)</td><td class="text-right">${m.batCost.toLocaleString('es-ES')} €</td></tr>
        <tr><td>Cap. 5</td><td>Líneas Eléctricas, Cuadros y Protecciones DC/AC</td><td class="text-right">${m.cabCost.toLocaleString('es-ES')} €</td></tr>
        <tr><td>Cap. 6</td><td>Montaje, Mano de Obra y Puesta en Marcha</td><td class="text-right">${m.moCost.toLocaleString('es-ES')} €</td></tr>
        <tr><td>Cap. 7</td><td>Ingeniería, Proyecto, Dirección de Obra y Legalización</td><td class="text-right">${m.legCost.toLocaleString('es-ES')} €</td></tr>
        ${(m.marginEur > 0) ? '<tr><td style="color:' + pal.primary + ';">Margen</td><td style="color:' + pal.primary + ';">Margen Comercial &amp; Gastos Generales (+' + m.marginPct + '%)</td><td class="text-right" style="color:' + pal.primary + ';font-weight:700;">' + Math.round(m.marginEur).toLocaleString('es-ES') + ' €</td></tr>' : ''}
        <tr class="total-row"><td>TOTAL</td><td>PRESUPUESTO LLAVE EN MANO (IVA 21% inc.)</td><td class="text-right">${Math.round(m.capexBruto).toLocaleString('es-ES')} €</td></tr>
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
      <p style="font-size:8.5px;color:#64748b;margin:4px 0 0 0;">Nota: bonificaciones y deducciones fiscales son estimaciones comerciales sujetas a vigencia normativa y ordenanzas municipales. Verificar con asesoría fiscal antes de incluirlas en contrato.</p>
    </div>

    <!-- PÁGINA 3: PRODUCCIÓN SOLAR, ANÁLISIS FINANCIERO Y GARANTÍAS -->
    <div class="page-sheet">
      <div class="cover-header">
        <div class="company-text">
          <div class="name">PRODUCCIÓN &amp; <span style="color:${pal.primary}">RENTABILIDAD</span></div>
          <div class="sub">Histograma Mensual · Curva de Amortización a 25 Años · Garantías</div>
        </div>
        <div class="doc-ref-box"><b>Ref: ${d.refNum}</b><br>Hoja 3 de 3</div>
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

      <h2>Garantías oficiales incluidas</h2>
      <table>
        <tr><th>Componente</th><th>Garantía de Producto</th><th>Garantía de Producción</th><th>Garantía de Instalación</th></tr>
        <tr><td>Módulos Fotovoltaicos</td><td>${warPower} años</td><td>${warMod} años (≥84.8%)</td><td rowspan="3" style="vertical-align:middle;text-align:center;">${warMo} años<br>mano de obra</td></tr>
        <tr><td>Inversor & Monitorización</td><td>${warInv} años</td><td>—</td></tr>
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
            <div style="text-align:left;"><div style="font-weight:900;font-size:11px;">${companyName}</div>${companyCIF ? '<div style="font-size:9px;color:#64748b;">CIF: ' + companyCIF + '</div>' : ''}</div>
          </div>
          Por la Empresa Instaladora<br><br>
          Firma y Sello: ________________________<br>
          ${d.tit.tecnico} (${d.tit.titulacion})<br>
          ${contactBlock ? contactBlock + '<br>' : ''}
          <div style="margin-top:6px;">${['⚡ REBT ITC-BT-40','🛡 RD 244/2019','✅ IEC 61215'].map(t => '<span class="pill">'+t+'</span>').join('')}</div>
        </div>
      </div>
    </div>

    <script>
      function togglePropEdit() {
        const sheets = document.querySelectorAll('.page-sheet');
        const btn = document.getElementById('btn-prop-edit');
        const isEdit = sheets[0].contentEditable === 'true';
        sheets.forEach(s => { s.contentEditable = isEdit ? 'false' : 'true'; s.style.outline = isEdit ? 'none' : '2px dashed ${pal.primary}'; });
        btn.textContent = isEdit ? '✏️ EDITAR' : '💾 EDICIÓN ACTIVA';
        btn.style.background = isEdit ? '${pal.accent}' : '${pal.primary}';
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
        const blob = new Blob(['\ufeff' + clone.outerHTML], { type: 'text/html;charset=utf-8' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = '${d.refNum}_Propuesta_Comercial.html';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
      }
    </script>
  </body>
  </html>
  `;

  const w = window.open('', '_blank');
  if (!w) {
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
  const numPanels = d.numPanels || 1;
  const kwp = (numPanels * (d.cfg.potencia || 450)) / 1000.0;
  const annualYieldKWh = d.annualKWh || (kwp * 1450); // [P0] getProjectCalcs canónico devuelve annualKWh

  const pricing = (typeof RAPricing !== 'undefined') ? RAPricing.getEffectivePricing() : { panelPrice: 125, moPrice: 1400, marginPct: 20 };
  const unitPanelPrice = (pricing && pricing.panelPrice > 0) ? pricing.panelPrice : (d.cfg.precio || 125);
  const panCost = numPanels * unitPanelPrice;
  // [SSOT] Lector de parámetros con doble fuente: los inputs del DESGLOSE (modal-cfg-pres-*,
  // modal-tax-*, modal-fin-*) son la UI real que existe en el DOM; los ids legacy del sidebar
  // (cfg-pres-*, tax-*, fin-*) no existen y quedan como fallback histórico.
  const _input = (id, def) => {
    const el = document.getElementById(id) || document.getElementById('modal-' + id);
    return el ? (parseFloat(el.value) || def) : def;
  };
  const _sel = (id, def) => {
    const el = document.getElementById(id) || document.getElementById('modal-' + id);
    return el ? el.value : def;
  };
  let est = _input('cfg-pres-est', 450);
  // [SSOT] ESTRUCTURA: Calcular dinámicamente desde el BOM paramétrico (Opción A)
  if (typeof BOMTreeEngine !== 'undefined') {
    const tree = BOMTreeEngine.computeBOMTree();
    if (tree && tree.roofs && tree.summary.totalPanels > 0) {
      let totalEst = 0;
      tree.roofs.forEach(r => {
        if (r.structure && r.structure.costEur) totalEst += r.structure.costEur;
      });
      if (totalEst > 0) {
        est = totalEst;
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
    }
  }
  // [SSOT] INVERSOR: precio real del catálogo × unidades dimensionadas cuando hay selección
  // activa. Antes el CAPEX usaba el input crudo cfg-pres-inv (default 1100 €) aunque la
  // pestaña de ingeniería tuviera un inversor de 2.400 € → la oferta no cuadraba.
  let inv = _input('cfg-pres-inv', 1100);
  const _ssotCat = (typeof equipmentCatalog !== 'undefined') ? equipmentCatalog : null;
  const _ssotCfg = (typeof window !== 'undefined' && window.solarProjectConfig) ? window.solarProjectConfig : {};
  let _invSel = null;
  if (_ssotCat && _ssotCfg.selectedInverterId) {
    _invSel = (_ssotCat.inverters || []).find(i => i.id === _ssotCfg.selectedInverterId) || null;
  }
  if (_invSel && _invSel.price > 0) {
    const _invCount = (_ssotCfg.autoSizing && _ssotCfg.autoSizing.inverters && _ssotCfg.autoSizing.inverters.count) || 1;
    inv = _invSel.price * _invCount;
  }
  // [SSOT] BATERÍA: precio y capacidad del catálogo × unidades cuando hay selección.
  let bat = _input('cfg-pres-bat', 0);
  let _batSel = null;
  if (_ssotCat && _ssotCfg.selectedBatteryId) {
    _batSel = (_ssotCat.batteries || []).find(b => b.id === _ssotCfg.selectedBatteryId) || null;
  }
  if (_batSel && _batSel.price > 0) {
    const _batCount = (_ssotCfg.autoSizing && _ssotCfg.autoSizing.batteries && _ssotCfg.autoSizing.batteries.count) || 1;
    bat = _batSel.price * _batCount;
  }
  let cab = _input('cfg-pres-cab', 350);
  // [SSOT] Cableado 3D medido: Si el gemelo digital tiene trazado real de cables, calcular con metrado
  const _sState = (typeof window !== 'undefined' && window.inverterEquipmentState) ? window.inverterEquipmentState : null;
  if (_sState && (typeof _sState.L_dc_measured === 'number' || typeof _sState.L_ac_measured === 'number')) {
    const _lDc = _sState.L_dc_measured || 25.0;
    const _lAc = _sState.L_ac_measured || 15.0;
    const _nStr = d.numStrings || 1;
    const _mDc = Math.round(_lDc * _nStr * 2);
    const _mAc = Math.round(_lAc * (d.monofasico ? 3 : 5));
    const _sDc = d.S_dc_real || d.S_str || 6;
    const _sAc = d.S_ac_real || d.S_ac || 10;
    const _puDc = _sDc <= 6 ? 1.85 : (_sDc <= 10 ? 2.90 : 4.20);
    const _puAc = _sAc <= 6 ? 2.40 : (_sAc <= 10 ? 3.80 : 5.90);
    const _cableCostReal = Math.round((_mDc * _puDc) + (_mAc * _puAc) + ((_lDc + _lAc) * 6.80) + 195 + 245 + 85);
    if (_cableCostReal > 0) {
      cab = _cableCostReal;
    }
  }
  const mo  = (pricing && pricing.moPrice != null) ? pricing.moPrice : _input('cfg-pres-mo', 1400);
  const leg = _input('cfg-pres-leg', 500);

  const roofInfo = (typeof computeRoofPanelsData === 'function') ? computeRoofPanelsData() : null;
  const mlpeCount = (roofInfo && roofInfo.panels) ? roofInfo.panels.filter(p => p.hasMLPE).length : 0;

  // ── Inclinación y azimut reales de la cubierta ────────────────────────────
  const pa = (typeof polygonAnalysis === 'function') ? polygonAnalysis() : null;
  const tiltDeg = pa ? pa.tiltDeg : 30;
  const azimutDeg = pa ? pa.azimuthDeg : 0;
  const mlpeCost = mlpeCount * 95; // 95 € por microinversor/optimizador

  const directCost = panCost + est + inv + bat + mlpeCost + cab + mo + leg;
  const marginPct = (pricing && typeof pricing.marginPct === 'number') ? pricing.marginPct : 20;
  const marginEur = directCost * (marginPct / 100.0);
  const subtotal = directCost + marginEur;
  const iva = subtotal * 0.21;
  const capexBruto = subtotal + iva;

  // Fiscalidad
  const ibiCuota = _input('tax-ibi-cuota', 650);
  const ibiOpt = _sel('tax-ibi-opt', '0.50_3');
  let ahorroIBITotal = 0;
  if (ibiOpt === '0.30_3') ahorroIBITotal = ibiCuota * 0.30 * 3;
  else if (ibiOpt === '0.50_3') ahorroIBITotal = ibiCuota * 0.50 * 3;
  else if (ibiOpt === '0.50_5') ahorroIBITotal = ibiCuota * 0.50 * 5;

  // [P0] El elemento 'tax-irpf-opt' no existe en el DOM: leer el select del modal como fuente real.
  // Default comercial 0: la deducción estatal IRPF expiró el 31/12/2024 — activarla es decisión
  // explícita del comercial (herramienta comercial, nunca default engañoso).
  const irpfEl = document.getElementById('tax-irpf-opt') || document.getElementById('modal-tax-irpf-opt');
  const irpfPct = parseFloat((irpfEl || {value:'0'}).value) || 0;
  const baseIrpf = Math.min(capexBruto, 7500);
  const ahorroIRPF = baseIrpf * irpfPct;

  const icioPct = _input('tax-icio-opt', 0.95);
  const tasaICIO = subtotal * 0.04;
  const ahorroICIO = tasaICIO * icioPct;

  const totalAhorroFiscal = ahorroIBITotal + ahorroIRPF + ahorroICIO;
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

  // Curva de consumo doméstico normalizada (kWh por kWh diario consumido)
  const LOAD_PROFILE = [0.030,0.025,0.022,0.020,0.020,0.028,0.040,0.050,0.045,0.035,0.032,0.035,0.038,0.032,0.030,0.038,0.050,0.065,0.070,0.062,0.052,0.048,0.042,0.036];

  // [P0] Consumo anual: factura auditada del cliente (bill-auditor) cuando exista;
  // la heurística producción×0.75 queda solo como fallback sin factura.
  const billComp = (typeof window !== 'undefined' && window.RA && window.RA.billAuditor && window.RA.billAuditor.comparison) ? window.RA.billAuditor.comparison : null;
  const consumoAnual = (billComp && Number.isFinite(billComp.consumoAnualKWh) && billComp.consumoAnualKWh > 0)
    ? billComp.consumoAnualKWh
    : Math.max(annualYieldKWh * 0.75, 3500);

  // Despacho horario: simulación de 1 día representativo, escalado a 365
  const dailySolar = annualYieldKWh / 365.0;
  const dailyLoad = consumoAnual / 365.0;
  const dailySolarH = SOLAR_PROFILE.map(v => v * dailySolar);
  const dailyLoadH = LOAD_PROFILE.map(v => v * dailyLoad);

  let batSoC = 0.0;                 // Estado de carga (kWh)
  const batEff = 0.92;              // Eficiencia ida y vuelta
  const maxBatCap = batCap;         // kWh útiles
  let totalAutoconsumo = 0;         // kWh autoconsumidos directos
  let totalBateria = 0;             // kWh desde batería
  let totalExcedente = 0;           // kWh vertidos a red
  let costeRed = 0;                 // € comprados a la red
  let costeCargaRed = 0;            // € de carga de batería desde red (arbitraje) — se descuenta del ahorro
  let ingresoExcedente = 0;         // € por excedentes

  const PUNTA = 17, VALLE = 0;

  for (let h = 0; h < 24; h++) {
    const pv = dailySolarH[h];
    const load = dailyLoadH[h];
    const price = tou.horas[h];
    const isValley = price <= Math.min(...tou.horas) * 1.15;
    const isPeak = price >= Math.max(...tou.horas) * 0.88;

    let direct = Math.min(pv, load);
    let surplus = pv - direct;
    let fromBattery = 0;
    let gridBuy = 0;

    if (surplus > 0 && maxBatCap > 0 && batSoC < maxBatCap) {
      const charge = Math.min(surplus, maxBatCap - batSoC);
      batSoC += charge * batEff;
      surplus -= charge;
    }

    // Estrategia arbitraje: cargar batería desde red en horas valle
    if (batStrategy === 'arbitraje' && maxBatCap > 0 && batSoC < maxBatCap && isValley && h >= 2 && h <= 6) {
      const gridCharge = Math.min(maxBatCap - batSoC, load * 0.5);
      batSoC += gridCharge * batEff;
      costeRed += gridCharge * price;
      costeCargaRed += gridCharge * price; // se descuenta del ahorro (energia pagada a red y revendida como bateria)
    }

    if (direct < load) {
      const need = load - direct;
      if (batSoC > 0.01) {
        const discharge = Math.min(need, batSoC);
        batSoC -= discharge;
        fromBattery = discharge;
      }
      gridBuy = Math.max(need - fromBattery, 0);
    } else if (surplus > 0) {
      // Si no hay batería o está llena → excedente a red
      totalExcedente += surplus;
      ingresoExcedente += surplus * tou.compensacion;
    }

    totalAutoconsumo += direct;
    totalBateria += fromBattery;
    costeRed += gridBuy * price;
  }

  // Precio medio ponderado de la tarifa y compensación
  const precioRed = tou.horas.reduce((a, b) => a + b, 0) / tou.horas.length;
  const precioCompensacion = tou.compensacion;

  // [P0.3 - RD 244/2019] Techo legal en compensación simplificada: el saldo del término de energía nunca puede ser negativo
  const hasVirtualBattery = !!(typeof window !== 'undefined' && window.solarProjectConfig && window.solarProjectConfig.hasVirtualBattery);
  const ingresoExcedenteEfectivo = hasVirtualBattery ? ingresoExcedente : Math.min(ingresoExcedente, costeRed);

  // El coste de carga desde red (arbitraje) se resta del ahorro: sin esto la energía
  // comprada en valle y revendida como "desde batería" se computaba a precio completo.
  const ahorroLuzAnio1 = ((totalAutoconsumo + totalBateria) * precioRed + ingresoExcedenteEfectivo) * 365 - costeCargaRed;

  const autarquia = Math.min((totalAutoconsumo + totalBateria) / dailyLoad, 1);

  // Flujo de Caja a 25 años
  const inflacion = 0.03; // Inflación luz 3%/año

  // ── FASE 2.1: Degradación Anual Acumulativa Rigurosa (IEC 61215 / BloombergNEF Tier-1) ──
  const modTech = (d.cfg && d.cfg.modelo && (d.cfg.modelo.includes('N-Type') || d.cfg.modelo.includes('TOPCon'))) ? 'TOPCON' : 'PERC';
  const degYear1 = modTech === 'TOPCON' ? 0.010 : 0.015; // 1.0% TOPCon vs 1.5% PERC en Año 1 (LID inicial)
  const degAnnual = modTech === 'TOPCON' ? 0.0040 : 0.0050; // 0.40%/año TOPCon vs 0.50%/año PERC (años 2-25)

  const annualYields25 = [];
  const annualSavings25 = [];
  const degradationFactors25 = [];

  // ── FASE 2.2: OPEX Indexado a IPC y Reemplazo de Inversor Dinámico por Potencia ──
  const catalog = (typeof equipmentCatalog !== 'undefined') ? equipmentCatalog : null;
  const projCfg = (typeof window !== 'undefined' && window.solarProjectConfig) ? window.solarProjectConfig : {};
  let curInvObj = null;
  if (catalog && projCfg.selectedInverterId) {
    curInvObj = (catalog.inverters && Array.isArray(catalog.inverters))
      ? catalog.inverters.find(i => i.id === projCfg.selectedInverterId)
      : null;
  }
  const invBasePrice = (curInvObj && curInvObj.price) ? curInvObj.price : (inv > 0 ? inv : Math.max(850, kwp * 125 + (batCap > 0 ? 450 : 0)));
  const ipcTech = 0.012; // 1.2%/año inflación neta de electrónica de potencia
  const invReplacementCost12 = Math.round(invBasePrice * Math.pow(1 + ipcTech, 12));

  // OPEX de año 1: Mantenimiento preventivo, monitorización y seguro (~1% subtotal o 15€/kWp)
  const opexYear1 = Math.max(90, Math.max(kwp * 15, subtotal * 0.01));
  const ipcOpex = 0.020; // 2.0%/año IPC servicios de mantenimiento

  const annualOpex25 = [];
  let totalOpex25 = 0;

  // ── FASE 2.3: Amortización Fiscal sin Duplicidad y Desglose de Flujos Netos Descontados (WACC 4%) ──
  const r = 0.04; // Tasa de descuento WACC 4.0% anual (coste de capital bancable)
  const capexDesembolsoInicial = Math.max(capexBruto - ahorroICIO, 100); // El ICIO se descuenta en la licencia previa

  const financialSchedule25 = [];
  const discountedCashFlow25 = [];

  let cashflow = [-capexDesembolsoInicial];
  let acumulado = [-capexDesembolsoInicial];
  let van = -capexDesembolsoInicial;
  let totalGenerado25 = 0;
  let totalCoste25 = capexDesembolsoInicial;

  const ibiYears = ibiOpt.includes('_5') ? 5 : (ibiOpt.includes('_3') ? 3 : 0);
  const ibiAnnualBonus = (ibiYears > 0) ? (ahorroIBITotal / ibiYears) : 0;

  for (let y = 1; y <= 25; y++) {
    // Factor de degradación acumulado compuesto normativo
    const degFactor = (1 - degYear1) * Math.pow(1 - degAnnual, y - 1);
    const yieldY = annualYieldKWh * degFactor;
    degradationFactors25.push(Math.round(degFactor * 1000) / 10);
    annualYields25.push(Math.round(yieldY));
    totalGenerado25 += yieldY;

    const priceY = precioRed * Math.pow(1 + inflacion, y - 1);
    const compY = precioCompensacion * Math.pow(1 + inflacion, y - 1);
    const surplusValY = yieldY * (1 - autarquia) * compY;
    const gridBuyCostY = Math.max(0, (consumoAnual - yieldY * autarquia)) * priceY;
    const compEfectivaY = hasVirtualBattery ? surplusValY : Math.min(surplusValY, gridBuyCostY);
    const saveY = (yieldY * autarquia * priceY) + compEfectivaY;
    annualSavings25.push(Math.round(saveY));

    // OPEX indexado anualmente por IPC de servicios
    const omY = opexYear1 * Math.pow(1 + ipcOpex, y - 1);
    annualOpex25.push(Math.round(omY));
    totalOpex25 += omY;
    totalCoste25 += omY;

    // Inversor replacement en año 12 (según potencia nominal e IPC tecnológico)
    const replY = (y === 12) ? invReplacementCost12 : 0;
    totalCoste25 += replY;

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

  // LCOE (€/kWh)
  const lcoe = totalGenerado25 > 0 ? (totalCoste25 / totalGenerado25) : 0.038;

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

  return {
    numPanels: numPanels,
    kwp: kwp,
    directCost: directCost,
    marginPct: marginPct,
    marginEur: marginEur,
    unitPanelPrice: unitPanelPrice,
    panCost: panCost,
    estCost: est,
    invCost: inv,
    batCost: bat,
    cabCost: cab,
    moCost: mo,
    legCost: leg,
    subtotal: subtotal,
    iva: iva,
    capexBruto: capexBruto,
    ahorroIBITotal: ahorroIBITotal,
    ahorroIRPF: ahorroIRPF,
    ahorroICIO: ahorroICIO,
    totalAhorroFiscal: totalAhorroFiscal,
    capexNeto: capexNeto,
    autarquiaPct: Math.round(autarquia * 100),
    precioRedEUR: precioRed,
    precioCompensacionEUR: precioCompensacion,
    annualYieldKWh: annualYieldKWh,
    ahorroLuzAnio1: ahorroLuzAnio1,
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
    autoconsumoDirecto: Math.round((totalAutoconsumo || 0) * 365),
    bateriaKWh: Math.round((totalBateria || 0) * 365),
    excedenteKWh: Math.round((totalExcedente || 0) * 365),
    costeRedAnual: Math.round((costeRed || 0) * 365),
    ingresoExcedente: Math.round((ingresoExcedente || 0) * 365),
    ingresoExcedenteEfectivo: Math.round((ingresoExcedenteEfectivo || 0) * 365),
    ingresoExcedenteTechoAplicado: !hasVirtualBattery && (ingresoExcedente > costeRed),
    hasVirtualBattery: hasVirtualBattery,
    // Series anuales con degradación compuesta a 25 años (Fase 2.1)
    annualYields25: annualYields25,
    annualSavings25: annualSavings25,
    degradationFactors25: degradationFactors25,
    remainingPerformanceYr25: degradationFactors25[24] || 85.0,
    totalGenerado25: Math.round(totalGenerado25),
    degYear1Pct: degYear1 * 100,
    degAnnualPct: degAnnual * 100,
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
})();
