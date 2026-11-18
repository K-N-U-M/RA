// ============================================================================
// js/cost-modal-ui.js — Controladores de Modal de Presupuesto, Fiscal e IVA 10%
// Extraído del monolito RA/index.html (Track 6 · Fase 6.3)
// ============================================================================
function openCostBreakdownModal() {
  const modal = document.getElementById('ra-cost-breakdown-modal');
  if (!modal) return;
  
  // Sincronizar estado SSOT desde RAPricing y calculateFinancialModel
  const _cat = (typeof window !== 'undefined' && window.equipmentCatalog) ? window.equipmentCatalog : null;
  const _cfg = (typeof window !== 'undefined' && window.solarProjectConfig) ? window.solarProjectConfig : null;
  const d = (typeof getProjectCalcs === 'function') ? getProjectCalcs() : { numPanels: 1 };
  const numPanels = (d && d.numPanels) ? d.numPanels : 1;
  const designCosts = (typeof RAPricing !== 'undefined' && typeof RAPricing.computeDesignCosts === 'function')
    ? RAPricing.computeDesignCosts(numPanels)
    : null;
  const pricing = (typeof RAPricing !== 'undefined' && typeof RAPricing.getEffectivePricing === 'function')
    ? RAPricing.getEffectivePricing()
    : null;

  // Sincronizar inputs de costes desde RAPricing / designCosts
  const setInp = (id, val) => { const el = document.getElementById(id); if (el && val != null && !isNaN(val)) el.value = Math.round(val); };
  
  if (designCosts && designCosts.isPergola) {
    const tipoEst = document.getElementById('modal-cfg-tipo-est');
    if (tipoEst) tipoEst.value = 'pergola';
  }

  const estVal = (pricing && typeof pricing.estPrice === 'number' && pricing.estPrice >= 0)
    ? pricing.estPrice
    : (designCosts ? designCosts.estPrice : null);
  setInp('modal-cfg-pres-est', estVal);

  const invVal = (pricing && typeof pricing.invPrice === 'number' && pricing.invPrice >= 0)
    ? pricing.invPrice
    : (designCosts ? designCosts.invPrice : null);
  setInp('modal-cfg-pres-inv', invVal);

  const cabVal = (pricing && typeof pricing.cabPrice === 'number' && pricing.cabPrice >= 0)
    ? pricing.cabPrice
    : (designCosts ? designCosts.cabPrice : null);
  setInp('modal-cfg-pres-cab', cabVal);

  const moVal = (pricing && typeof pricing.moPrice === 'number' && pricing.moPrice >= 0)
    ? pricing.moPrice
    : (designCosts ? designCosts.moPrice : null);
  setInp('modal-cfg-pres-mo', moVal);

  const legVal = (pricing && typeof pricing.legPrice === 'number' && pricing.legPrice >= 0)
    ? pricing.legPrice
    : (designCosts ? designCosts.legPrice : null);
  setInp('modal-cfg-pres-leg', legVal);

  // Sincronizar selección de batería oficial de solarProjectConfig / catálogo (SSOT)
  const batOptSelect = document.getElementById('modal-cfg-pres-bat-opt');
  const customOpt = document.getElementById('modal-cfg-pres-bat-opt-custom');
  if (_cat && _cfg && _cfg.selectedBatteryId && _cfg.selectedBatteryId !== 'bat_none') {
    const _bSpec = (_cat.batteries || []).find(b => b.id === _cfg.selectedBatteryId);
    if (_bSpec && (_bSpec.kwh > 0 || _bSpec.price > 0)) {
      const _bCnt = Math.max(1, (_cfg.autoSizing && _cfg.autoSizing.batteries && _cfg.autoSizing.batteries.count) || 1);
      const _bCost = Math.round(_bSpec.price * _bCnt);
      setInp('modal-cfg-pres-bat', _bCost);
      if (batOptSelect) {
        const totalCap = Math.round((_bSpec.kwh * _bCnt) * 10) / 10;
        if (customOpt) {
          customOpt.style.display = 'block';
          customOpt.value = 'custom';
          customOpt.textContent = `${_bCnt > 1 ? _bCnt + 'x ' : ''}${_bSpec.brand || ''} ${_bSpec.model || 'Batería'} (${totalCap} kWh · ${_bCost.toLocaleString('es-ES')} €)`;
        }
        batOptSelect.value = 'custom';
      }
    }
  } else if (pricing && typeof pricing.batPrice === 'number' && pricing.batPrice > 0) {
    setInp('modal-cfg-pres-bat', pricing.batPrice);
    if (batOptSelect && customOpt) {
      customOpt.style.display = 'block';
      customOpt.value = 'custom';
      customOpt.textContent = `Batería Personalizada (${pricing.batPrice.toLocaleString('es-ES')} €)`;
      batOptSelect.value = 'custom';
    }
  } else {
    setInp('modal-cfg-pres-bat', 0);
    if (batOptSelect) batOptSelect.value = '0';
    if (customOpt) customOpt.style.display = 'none';
  }

  // Sincronizar partida de Mini-Eólica (si el gemelo digital tiene aerogeneradores activos)
  const windRow = document.getElementById('modal-row-wind');
  const windLbl = document.getElementById('modal-wind-label');
  if (windRow) {
    const wCount = (designCosts && designCosts.windCount) || (typeof window !== 'undefined' && Array.isArray(window.windTurbines) && window.windTurbines.filter(t => t && (!t.operationalState || t.operationalState.enabled !== false)).length) || 0;
    const wVal = (pricing && typeof pricing.windPrice === 'number' && pricing.windPrice >= 0)
      ? pricing.windPrice
      : (designCosts ? designCosts.windPrice : 0);
    if (wCount > 0 || wVal > 0) {
      windRow.style.display = 'flex';
      setInp('modal-cfg-pres-wind', wVal);
      if (windLbl) windLbl.textContent = `Mini-Eólica (${wCount} aero${wCount > 1 ? 's' : ''}) (€):`;
    } else {
      windRow.style.display = 'none';
      setInp('modal-cfg-pres-wind', 0);
    }
  }

  // Visibilidad campo coste batería
  const batCostRow = document.getElementById('modal-row-bat-cost');
  const batOpt = document.getElementById('modal-cfg-pres-bat-opt');
  if (batCostRow && batOpt) {
    batCostRow.style.display = (batOpt.value !== '0') ? 'flex' : 'none';
  }

  // Sincronizar estado de Batería Virtual
  const vBatCheck = document.getElementById('modal-cfg-virtual-bat');
  if (vBatCheck) {
    vBatCheck.checked = !!(_cfg && _cfg.hasVirtualBattery);
  }

  // Sincronizar configuración de financiación persistida
  if (typeof RAPricing !== 'undefined' && typeof RAPricing.getCommercialConfig === 'function') {
    const _cCfg = RAPricing.getCommercialConfig();
    const _fin = (_cCfg && _cCfg.financing) ? _cCfg.financing : {};
    const setVal = (id, val) => { const el = document.getElementById(id); if (el && val !== undefined) el.value = val; };
    setVal('modal-fin-mode', _fin.mode || 'both');
    setVal('modal-fin-entrada-eur', _fin.downPaymentEur || 0);
    setVal('modal-fin-plazo-meses', _fin.loanMonths || 120);
    const _tinVal = (_fin.loanTinPct !== undefined ? _fin.loanTinPct : 5.95);
    setVal('modal-fin-tin-pct', _tinVal);
    const _plazoVal = _fin.loanMonths || 120;
    const _apVal = (_fin.openingFeePct !== undefined ? _fin.openingFeePct : 1.0);
    const _initTae = (typeof raComputeTaeFromTin === 'function') ? raComputeTaeFromTin(_tinVal, _plazoVal, _apVal) : 5.95;
    setVal('modal-fin-tae-pct', _initTae.toFixed(2));
    setVal('modal-fin-apertura-pct', (_fin.openingFeePct !== undefined ? _fin.openingFeePct : 1.0));
    setVal('modal-fin-carencia-meses', _fin.graceMonths || 0);
    setVal('modal-fin-seguro-mensual', _fin.monthlyInsuranceEur || 0);
    setVal('modal-fin-notaria-eur', _fin.notaryEur || 0);
  }

  // Sincronizar configuración fiscal persistida (con fallback a RAPricing.getCommercialConfig().taxShield)
  const _commTaxShield = (typeof RAPricing !== 'undefined' && typeof RAPricing.getCommercialConfig === 'function' && RAPricing.getCommercialConfig().taxShield)
    ? RAPricing.getCommercialConfig().taxShield
    : null;
  const t = (_cfg && _cfg.taxSettings) ? _cfg.taxSettings : _commTaxShield;
  if (t) {
    const pEl = document.getElementById('modal-tax-profile-opt');
    if (pEl && (t.profile || t.customerProfile)) pEl.value = t.profile || t.customerProfile;
    const ivaEl = document.getElementById('modal-tax-iva-opt');
    if (ivaEl) {
      if (t.ivaOpt) ivaEl.value = String(t.ivaOpt);
      else if (t.ivaRate != null) ivaEl.value = String(t.ivaRate);
    }
    const homeAgeEl = document.getElementById('modal-tax-iva-home-age');
    if (homeAgeEl && typeof t.ivaHomeAge2Years === 'boolean') homeAgeEl.checked = t.ivaHomeAge2Years;
    const marginLaborEl = document.getElementById('modal-tax-iva-margin-labor');
    if (marginLaborEl && typeof t.ivaMarginLaborOnly === 'boolean') marginLaborEl.checked = t.ivaMarginLaborOnly;
    const ibiCEl = document.getElementById('modal-tax-ibi-cuota');
    if (ibiCEl && (t.ibiCuota != null || t.ibiAnualEur != null)) ibiCEl.value = (t.ibiCuota != null ? t.ibiCuota : t.ibiAnualEur);
    const ibiOEl = document.getElementById('modal-tax-ibi-opt');
    if (ibiOEl && t.ibiOpt) ibiOEl.value = t.ibiOpt;
    const irpfOEl = document.getElementById('modal-tax-irpf-opt');
    if (irpfOEl && t.irpfOpt) irpfOEl.value = t.irpfOpt;
    const isOEl = document.getElementById('modal-tax-is-opt');
    if (isOEl && t.isRate != null) isOEl.value = String(t.isRate);
    const icioOEl = document.getElementById('modal-tax-icio-opt');
    if (icioOEl && t.icioOpt != null) icioOEl.value = String(t.icioOpt);
    const regEl = document.getElementById('modal-tax-region-opt');
    if (regEl && t.regionOpt) regEl.value = t.regionOpt;
    const caeEl = document.getElementById('modal-tax-cae-eur');
    if (caeEl && (t.caeEur != null || t.ahorroCAE != null)) caeEl.value = (t.caeEur != null ? t.caeEur : t.ahorroCAE);
    const soilEl = document.getElementById('modal-tax-soil-type');
    if (soilEl && t.soilType) soilEl.value = t.soilType;
    if (typeof syncModalTaxProfile === 'function') syncModalTaxProfile(pEl ? pEl.value : 'particular');
  }

  if (typeof raRenderCommercialAddonsUI === 'function') raRenderCommercialAddonsUI();
  syncCostModalMetrics();

  modal.style.display = 'flex';
}

function closeCostBreakdownModal() {
  if (typeof raSyncFinancingControls === 'function') raSyncFinancingControls();
  if (typeof raSyncTaxControls === 'function') raSyncTaxControls();
  const modal = document.getElementById('ra-cost-breakdown-modal');
  if (modal) modal.style.display = 'none';
}

function syncModalInputToBudget(targetId, val) {
  // Sincronización bidireccional reactiva con RAPricing.currentSessionPricing
  if (typeof RAPricing !== 'undefined') {
    const d = (typeof getProjectCalcs === 'function') ? getProjectCalcs() : { numPanels: 1 };
    const numPanels = (d && d.numPanels) ? d.numPanels : 1;
    const currentFp = RAPricing.getProjectFingerprint(numPanels);
    const prev = RAPricing.getEffectivePricing();
    
    const windInpVal = document.getElementById('modal-cfg-pres-wind') ? parseFloat(document.getElementById('modal-cfg-pres-wind').value) : null;
    const _parseNonNegBudget = (id, fallback) => {
      const el = document.getElementById(id);
      if (!el) return fallback;
      const v = parseFloat(el.value);
      return Number.isFinite(v) && v >= 0 ? v : fallback;
    };
    RAPricing.currentSessionPricing = Object.assign({}, prev, {
      projectFingerprint: currentFp,
      panelPrice: (Number.isFinite(prev.panelPrice) && prev.panelPrice >= 0) ? prev.panelPrice : 125,
      estPrice: _parseNonNegBudget('modal-cfg-pres-est', prev.estPrice),
      invPrice: _parseNonNegBudget('modal-cfg-pres-inv', prev.invPrice),
      batPrice: _parseNonNegBudget('modal-cfg-pres-bat', prev.batPrice),
      cabPrice: _parseNonNegBudget('modal-cfg-pres-cab', prev.cabPrice),
      moPrice: _parseNonNegBudget('modal-cfg-pres-mo', prev.moPrice),
      legPrice: _parseNonNegBudget('modal-cfg-pres-leg', prev.legPrice),
      windPrice: (windInpVal !== null && Number.isFinite(windInpVal) && windInpVal >= 0) ? windInpVal : prev.windPrice,
      marginPct: (Number.isFinite(prev.marginPct) && prev.marginPct >= 0) ? prev.marginPct : 20,
      skipReview: false
    });
  }

  if (targetId && targetId.startsWith('fin-')) {
    if (typeof raSyncFinancingControls === 'function') raSyncFinancingControls();
  }
  const target = document.getElementById(targetId);
  if (target) {
    target.value = val;
    if (target.oninput) target.oninput();
    if (target.onchange) target.onchange();
  }
  syncCostModalMetrics();
}

function toggleVirtualBatterySync(enabled) {
  if (typeof window !== 'undefined') {
    window.solarProjectConfig = window.solarProjectConfig || {};
    window.solarProjectConfig.hasVirtualBattery = !!enabled;
    try {
      localStorage.setItem('ra_has_virtual_battery', enabled ? 'true' : 'false');
    } catch(e) {}
  }
  syncCostModalMetrics();
  if (typeof showToast === 'function') {
    showToast(enabled ? 'BATERÍA VIRTUAL ACTIVADA' : 'BATERÍA VIRTUAL DESACTIVADA', enabled ? 'Excedentes compensados al 100% en monedero solar.' : 'Compensación estándar regulada RD 244/2019.', 'info', 2500);
  }
}
window.toggleVirtualBatterySync = toggleVirtualBatterySync;

function raRenderCommercialAddonsUI() {
  if (typeof RAPricing === 'undefined' || typeof RAPricing.getCommercialConfig !== 'function') return;
  const cfg = RAPricing.getCommercialConfig();
  const container = document.getElementById('modal-comm-addons-list');
  if (!container) return;

  const discCheck = document.getElementById('modal-comm-discount-enabled');
  const discVal = document.getElementById('modal-comm-discount-val');
  const discType = document.getElementById('modal-comm-discount-type');
  const discLbl = document.getElementById('modal-comm-discount-lbl');

  if (discCheck) discCheck.checked = !!cfg.discountEnabled;
  if (discVal) discVal.value = cfg.discountValue || 5;
  if (discType) discType.value = cfg.discountType || 'percent';
  if (discLbl) discLbl.value = cfg.discountLabel || 'Descuento Especial';

  const allAddons = (cfg.addons || []).concat(cfg.customAddons || []);
  let html = '';
  allAddons.forEach((ad, i) => {
    html += '<label style="display:flex;align-items:center;justify-content:space-between;background:rgba(0,0,0,0.3);padding:4px 8px;border-radius:4px;cursor:pointer;">' +
      '<span style="display:flex;align-items:center;gap:6px;color:#e2e8f0;">' +
        '<input type="checkbox" ' + (ad.enabled ? 'checked' : '') + ' onchange="raToggleAddon(' + i + ', this.checked)" style="accent-color:#10b981;">' +
        ad.name +
      '</span>' +
      '<b style="color:var(--emerald-400);font-family:var(--font-mono);">' + (ad.unitPrice || 0) + ' €</b>' +
    '</label>';
  });
  container.innerHTML = html;
}

function raToggleAddon(idx, enabled) {
  if (typeof RAPricing === 'undefined') return;
  const cfg = RAPricing.getCommercialConfig();
  const baseAddons = Array.isArray(cfg.addons) ? cfg.addons : [];
  const customAddons = Array.isArray(cfg.customAddons) ? cfg.customAddons : [];
  if (idx >= 0 && idx < baseAddons.length && baseAddons[idx]) {
    baseAddons[idx].enabled = enabled;
  } else {
    const cIdx = idx - baseAddons.length;
    if (cIdx >= 0 && cIdx < customAddons.length && customAddons[cIdx]) {
      customAddons[cIdx].enabled = enabled;
    }
  }
  RAPricing.saveCommercialConfig(cfg);
  if (typeof syncCostModalMetrics === 'function') syncCostModalMetrics();
}

function raSyncCommercialControls() {
  if (typeof RAPricing === 'undefined') return;
  const cfg = RAPricing.getCommercialConfig();
  const discCheck = document.getElementById('modal-comm-discount-enabled');
  const discVal = document.getElementById('modal-comm-discount-val');
  const discType = document.getElementById('modal-comm-discount-type');
  const discLbl = document.getElementById('modal-comm-discount-lbl');

  if (discCheck) cfg.discountEnabled = discCheck.checked;
  if (discVal) cfg.discountValue = parseFloat(discVal.value) || 0;
  if (discType) cfg.discountType = discType.value;
  if (discLbl) cfg.discountLabel = discLbl.value;

  RAPricing.saveCommercialConfig(cfg);
  if (typeof syncCostModalMetrics === 'function') syncCostModalMetrics();
}

window.raRenderCommercialAddonsUI = raRenderCommercialAddonsUI;
window.raToggleAddon = raToggleAddon;
window.raSyncCommercialControls = raSyncCommercialControls;

// ═══════════════════════════════════════════════════════════════════════════════
// CONVERSIÓN BIDIRECCIONAL TIN <-> TAE Y PERSISTENCIA FINANCIERA & FISCAL
// ═══════════════════════════════════════════════════════════════════════════════
let raIsSyncingLoanRates = false;

function raComputeTaeFromTin(tinPct, meses, aperturaPct) {
  const tinAnual = (parseFloat(tinPct) || 0) / 100.0;
  const mesesFin = parseInt(meses, 10) || 120;
  const apPct = (aperturaPct != null ? parseFloat(aperturaPct) : 1.0) / 100.0;
  const capitalBase = 10000;
  const comisionApertura = capitalBase * apPct;
  const principal = capitalBase + comisionApertura;
  const tinM = tinAnual / 12.0;
  const cuota = (tinM > 0)
    ? (principal * tinM * Math.pow(1 + tinM, mesesFin)) / (Math.pow(1 + tinM, mesesFin) - 1)
    : (principal / mesesFin);
  const flujos = [-capitalBase];
  for (let i = 1; i <= mesesFin; i++) flujos.push(cuota);
  let rMin = 0.0, rMax = 0.50, rMid = 0.0;
  for (let iter = 0; iter < 45; iter++) {
    rMid = (rMin + rMax) / 2.0;
    let npv = 0;
    for (let t = 0; t < flujos.length; t++) npv += flujos[t] / Math.pow(1 + rMid, t);
    if (npv > 0) rMin = rMid;
    else rMax = rMid;
  }
  return (Math.pow(1 + rMid, 12) - 1) * 100.0;
}

function raComputeTinFromTae(taePct, meses, aperturaPct) {
  const targetTae = parseFloat(taePct) || 0;
  if (targetTae <= 0) return 0;
  let low = 0.0, high = 40.0, mid = 0.0;
  for (let iter = 0; iter < 45; iter++) {
    mid = (low + high) / 2.0;
    const testTae = raComputeTaeFromTin(mid, meses, aperturaPct);
    if (testTae < targetTae) low = mid;
    else high = mid;
  }
  return mid;
}

function raOnTinInput(val) {
  if (raIsSyncingLoanRates) return;
  raIsSyncingLoanRates = true;
  try {
    const tinNum = parseFloat(val);
    const plazoEl = document.getElementById('modal-fin-plazo-meses');
    const apEl = document.getElementById('modal-fin-apertura-pct');
    const meses = plazoEl ? parseInt(plazoEl.value, 10) || 120 : 120;
    const apPct = apEl ? parseFloat(apEl.value) || 1.0 : 1.0;
    const taeEl = document.getElementById('modal-fin-tae-pct');
    if (taeEl && !isNaN(tinNum) && tinNum >= 0) {
      const calcTae = raComputeTaeFromTin(tinNum, meses, apPct);
      taeEl.value = calcTae.toFixed(2);
    }
    raSyncFinancingControls();
  } finally {
    raIsSyncingLoanRates = false;
  }
}

function raOnTaeInput(val) {
  if (raIsSyncingLoanRates) return;
  raIsSyncingLoanRates = true;
  try {
    const taeNum = parseFloat(val);
    const plazoEl = document.getElementById('modal-fin-plazo-meses');
    const apEl = document.getElementById('modal-fin-apertura-pct');
    const meses = plazoEl ? parseInt(plazoEl.value, 10) || 120 : 120;
    const apPct = apEl ? parseFloat(apEl.value) || 1.0 : 1.0;
    const tinEl = document.getElementById('modal-fin-tin-pct');
    if (tinEl && !isNaN(taeNum) && taeNum >= 0) {
      const calcTin = raComputeTinFromTae(taeNum, meses, apPct);
      tinEl.value = calcTin.toFixed(2);
    }
    raSyncFinancingControls();
  } finally {
    raIsSyncingLoanRates = false;
  }
}

window.raComputeTaeFromTin = raComputeTaeFromTin;
window.raComputeTinFromTae = raComputeTinFromTae;
window.raOnTinInput = raOnTinInput;
window.raOnTaeInput = raOnTaeInput;

function raSyncTaxControls() {
  if (typeof RAPricing === 'undefined' || typeof RAPricing.getCommercialConfig !== 'function') return;
  const cfg = RAPricing.getCommercialConfig();
  if (!cfg.taxShield) cfg.taxShield = {};

  const profileEl = document.getElementById('modal-tax-profile-opt');
  const regionEl = document.getElementById('modal-tax-region-opt');
  const ivaEl = document.getElementById('modal-tax-iva-opt');
  const homeAgeEl = document.getElementById('modal-tax-iva-home-age');
  const marginLaborEl = document.getElementById('modal-tax-iva-margin-labor');
  const soilEl = document.getElementById('modal-tax-soil-type');
  const ibiCuotaEl = document.getElementById('modal-tax-ibi-cuota');
  const ibiOptEl = document.getElementById('modal-tax-ibi-opt');
  const irpfOptEl = document.getElementById('modal-tax-irpf-opt');
  const isOptEl = document.getElementById('modal-tax-is-opt');
  const icioOptEl = document.getElementById('modal-tax-icio-opt');
  const caeEl = document.getElementById('modal-tax-cae-eur');

  const ivaOptVal = ivaEl ? ivaEl.value : '0.21';
  let ivaRateNum = 0.21;
  if (ivaOptVal === '0.10' || ivaOptVal === '0.10_rehab') ivaRateNum = 0.10;
  else if (ivaOptVal === '0.0') ivaRateNum = 0.0;
  else if (ivaOptVal === '0.21') ivaRateNum = 0.21;
  else {
    const parsed = parseFloat(ivaOptVal);
    if (!isNaN(parsed)) ivaRateNum = parsed;
  }

  // Actualizar taxShield en commercialConfig
  cfg.taxShield.customerProfile = profileEl ? profileEl.value : (cfg.taxShield.customerProfile || 'particular');
  cfg.taxShield.regionOpt = regionEl ? regionEl.value : (cfg.taxShield.regionOpt || 'estatal_only');
  cfg.taxShield.ivaOpt = ivaOptVal;
  cfg.taxShield.ivaRate = ivaRateNum;
  cfg.taxShield.ivaHomeAge2Years = homeAgeEl ? !!homeAgeEl.checked : true;
  cfg.taxShield.ivaMarginLaborOnly = marginLaborEl ? !!marginLaborEl.checked : true;
  cfg.taxShield.soilType = soilEl ? soilEl.value : (cfg.taxShield.soilType || 'urbano');
  if (ibiCuotaEl) cfg.taxShield.ibiAnualEur = parseFloat(ibiCuotaEl.value) || 0;
  if (ibiOptEl) cfg.taxShield.ibiOpt = ibiOptEl.value;
  if (irpfOptEl) cfg.taxShield.irpfOpt = irpfOptEl.value;
  if (isOptEl) cfg.taxShield.isRate = parseFloat(isOptEl.value) || 0;
  if (icioOptEl) cfg.taxShield.icioOpt = icioOptEl.value;
  if (caeEl) cfg.taxShield.caeEur = parseFloat(caeEl.value) || 0;

  // Actualizar window.solarProjectConfig.taxSettings (persistencia en fichero .ra)
  if (typeof window !== 'undefined') {
    window.solarProjectConfig = window.solarProjectConfig || {};
    window.solarProjectConfig.taxSettings = {
      profile: cfg.taxShield.customerProfile,
      regionOpt: cfg.taxShield.regionOpt,
      ivaOpt: cfg.taxShield.ivaOpt,
      ivaRate: cfg.taxShield.ivaRate,
      ivaHomeAge2Years: cfg.taxShield.ivaHomeAge2Years,
      ivaMarginLaborOnly: cfg.taxShield.ivaMarginLaborOnly,
      soilType: cfg.taxShield.soilType,
      ibiCuota: cfg.taxShield.ibiAnualEur,
      ibiOpt: cfg.taxShield.ibiOpt,
      irpfOpt: cfg.taxShield.irpfOpt,
      isRate: cfg.taxShield.isRate,
      icioOpt: cfg.taxShield.icioOpt,
      caeEur: cfg.taxShield.caeEur
    };
    window.solarProjectConfig.commercialConfig = cfg;
  }

  RAPricing.saveCommercialConfig(cfg);
  if (typeof syncCostModalMetrics === 'function') syncCostModalMetrics();
}
window.raSyncTaxControls = raSyncTaxControls;

function raSyncFinancingControls() {
  if (typeof RAPricing === 'undefined' || typeof RAPricing.getCommercialConfig !== 'function') return;
  const cfg = RAPricing.getCommercialConfig();
  if (!cfg.financing) cfg.financing = {};

  const modeEl = document.getElementById('modal-fin-mode');
  const entradaEl = document.getElementById('modal-fin-entrada-eur');
  const plazoEl = document.getElementById('modal-fin-plazo-meses');
  const tinEl = document.getElementById('modal-fin-tin-pct');
  const taeEl = document.getElementById('modal-fin-tae-pct');
  const aperturaEl = document.getElementById('modal-fin-apertura-pct');
  const carenciaEl = document.getElementById('modal-fin-carencia-meses');
  const seguroEl = document.getElementById('modal-fin-seguro-mensual');
  const notariaEl = document.getElementById('modal-fin-notaria-eur');

  if (modeEl) cfg.financing.mode = modeEl.value;
  if (entradaEl) cfg.financing.downPaymentEur = parseFloat(entradaEl.value) || 0;
  if (plazoEl) cfg.financing.loanMonths = parseInt(plazoEl.value, 10) || 120;
  if (tinEl && !raIsSyncingLoanRates) {
    cfg.financing.loanTinPct = parseFloat(tinEl.value) || 5.95;
  }
  if (aperturaEl) cfg.financing.openingFeePct = parseFloat(aperturaEl.value) || 1.0;
  if (carenciaEl) cfg.financing.graceMonths = parseInt(carenciaEl.value, 10) || 0;
  if (seguroEl) cfg.financing.monthlyInsuranceEur = parseFloat(seguroEl.value) || 0;
  if (notariaEl) cfg.financing.notaryEur = parseFloat(notariaEl.value) || 0;

  // Si cambia plazo o apertura y no estamos tecleando en TAE, refrescar TAE reflejada
  if (!raIsSyncingLoanRates && taeEl && tinEl && plazoEl && aperturaEl) {
    const curTin = parseFloat(tinEl.value) || 5.95;
    const curMeses = parseInt(plazoEl.value, 10) || 120;
    const curAp = parseFloat(aperturaEl.value) || 1.0;
    const newTae = raComputeTaeFromTin(curTin, curMeses, curAp);
    taeEl.value = newTae.toFixed(2);
  }

  if (typeof window !== 'undefined' && window.solarProjectConfig) {
    window.solarProjectConfig.commercialConfig = cfg;
  }
  RAPricing.saveCommercialConfig(cfg);
  if (typeof syncCostModalMetrics === 'function') syncCostModalMetrics();
}
window.raSyncFinancingControls = raSyncFinancingControls;
window.raSyncFinancingMode = function(val) { raSyncFinancingControls(); };


function syncCostModalMetrics() {
  // [SSOT] Escribir las métricas del modal DIRECTAMENTE desde calculateFinancialModel
  // (fuente de verdad). Antes se copiaban desde elementos del sidebar (budget-*,
  // fin-*, tax-*) que NO existen en el DOM → el modal mostraba los "0 €" del HTML
  // estático, nunca los números del diseño.
  if (typeof calculateFinancialModel !== 'function') return;
  let m; try { m = calculateFinancialModel(); } catch (e) { return; }
  if (!m) return;
  const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
  set('modal-budget-num-panels', m.numPanels);
  set('modal-budget-paneles', Math.round(m.panCost).toLocaleString('es-ES') + ' €');
  set('modal-budget-total-label', 'INVERSIÓN TOTAL BRUTA (IVA ' + Math.round((m.ivaRate != null ? m.ivaRate : 0.21) * 100) + '%):');
  set('modal-budget-total', Math.round(m.capexBruto).toLocaleString('es-ES') + ' €');

  // Actualizar panel interactivo de verificación legal IVA 10% (No bloqueante + Auto-ajuste)
  const ivaBox = document.getElementById('modal-iva10-compliance-box');
  const ic = m.ivaCompliance;
  if (ivaBox && ic) {
    if (ic.isRenovacion10 || ic.isRehab10) {
      ivaBox.style.display = 'block';
      const renControls = document.getElementById('modal-iva10-renovacion-controls');
      const statusMsg = document.getElementById('modal-iva10-status-msg');
      const fixActions = document.getElementById('modal-iva10-fix-actions');
      const pctEl = document.getElementById('modal-iva10-mat-pct');
      const barEl = document.getElementById('modal-iva10-mat-bar');
      const detEl = document.getElementById('modal-iva10-mat-detail');

      if (ic.isRenovacion10) {
        if (renControls) renControls.style.display = 'block';
        const pctVal = Math.min(100, Math.max(0, ic.pctMateriales || 0));
        const matOk = (pctVal <= 40.001);
        if (pctEl) {
          pctEl.textContent = pctVal.toFixed(1) + '% ' + (matOk ? '(≤ 40% OK)' : '(> 40% EXCESO)');
          pctEl.style.color = matOk ? '#10b981' : '#f59e0b';
        }
        if (barEl) {
          barEl.style.width = pctVal.toFixed(1) + '%';
          barEl.style.background = matOk ? '#10b981' : '#ef4444';
        }
        if (detEl) {
          detEl.textContent = 'Mat: ' + Math.round(ic.baseMateriales).toLocaleString('es-ES') + ' € · Serv/MO: ' + Math.round(ic.baseServicios).toLocaleString('es-ES') + ' € · Máx 40%: ' + Math.round(ic.maxMateriales40Eur).toLocaleString('es-ES') + ' €';
        }
        if (ic.isCompliant) {
          ivaBox.style.borderColor = 'rgba(16,185,129,0.45)';
          if (statusMsg) {
            statusMsg.style.background = 'rgba(16,185,129,0.12)';
            statusMsg.style.border = '1px solid rgba(16,185,129,0.35)';
            statusMsg.style.color = '#6ee7b7';
            statusMsg.innerHTML = '✅ <b>Cumplimiento Art. 91.Uno.2.10º LIVA verificado:</b> Persona física, vivienda ≥ 2 años y materiales aportados (' + pctVal.toFixed(1) + '%) dentro del límite legal del 40%.';
          }
          if (fixActions) fixActions.style.display = 'none';
        } else {
          ivaBox.style.borderColor = 'rgba(245,158,11,0.55)';
          if (statusMsg) {
            statusMsg.style.background = 'rgba(245,158,11,0.14)';
            statusMsg.style.border = '1px solid rgba(245,158,11,0.4)';
            statusMsg.style.color = '#fde68a';
            statusMsg.innerHTML = '⚠️ <b>Aviso Fiscal (No Bloqueante):</b> ' + (ic.reasons || []).join(' · ') + '. Se mantiene el cálculo al 10%, pero Hacienda exige ≤ 40% de materiales.';
          }
          if (fixActions) {
            fixActions.style.display = (!matOk) ? 'flex' : 'none';
          }
        }
      } else {
        // Modo 0.10_rehab (Rehabilitación estructural / Obra nueva promotor)
        if (renControls) renControls.style.display = 'none';
        if (fixActions) fixActions.style.display = 'none';
        ivaBox.style.borderColor = 'rgba(56,189,248,0.45)';
        if (statusMsg) {
          statusMsg.style.background = 'rgba(56,189,248,0.12)';
          statusMsg.style.border = '1px solid rgba(56,189,248,0.35)';
          statusMsg.style.color = '#bae6fd';
          statusMsg.innerHTML = 'ℹ️ <b>Art. 91.Uno.3.1º / Art. 20.Uno.22º.B LIVA:</b> Rehabilitación estructural/energética (&gt;25% coste adquisición) o ejecución de obra nueva contratada directamente con el promotor. <b>No aplica el tope del 40% en materiales</b> (actual: ' + (ic.pctMateriales || 0).toFixed(1) + '%).';
        }
      }
    } else {
      ivaBox.style.display = 'none';
    }
  }
  const isEmpresa = (m.customerProfile === 'empresa');
  const lblDeduc = document.getElementById('modal-tax-label-deduccion');
  if (lblDeduc) lblDeduc.textContent = isEmpresa ? 'Bonif. EPC (IBI + Sociedades)' : 'Bonif. EPC (IBI + IRPF)';
  const irpfRow = document.getElementById('modal-tax-irpf-row');
  const isRow = document.getElementById('modal-tax-is-row');
  if (irpfRow && isRow) {
    irpfRow.style.display = isEmpresa ? 'none' : 'flex';
    isRow.style.display = isEmpresa ? 'flex' : 'none';
  }
  // Actualizar alerta de modalidad aislada y KPI de diésel
  const isOffGridMod = (m.isOffGrid || (window.RAProposalStyleStudio && window.RAProposalStyleStudio.getActiveConfig && window.RAProposalStyleStudio.getActiveConfig().installationModality === 'off_grid'));
  const offGridAlert = document.getElementById('modal-offgrid-tax-alert');
  const dieselKpi = document.getElementById('modal-offgrid-diesel-kpi');
  if (offGridAlert) {
    offGridAlert.style.display = isOffGridMod ? 'block' : 'none';
  }
  if (dieselKpi && isOffGridMod && m.dieselLitersAvoided > 0) {
    dieselKpi.textContent = '⛽ Ahorro en Generador Fósil: ~' + m.dieselLitersAvoided.toLocaleString('es-ES') + ' L/año evitados (~' + Math.round(m.ahorroDieselAnio1 || 0).toLocaleString('es-ES') + ' €/año)';
  }
  const soilSel = document.getElementById('modal-tax-soil-type');
  if (soilSel && m.soilType) soilSel.value = m.soilType;

  set('modal-tax-total-savings', Math.round(m.totalAhorroFiscal).toLocaleString('es-ES') + ' €');
  set('modal-tax-icio-savings', Math.round(m.ahorroICIO || 0).toLocaleString('es-ES') + ' €');
  set('modal-tax-net-investment', Math.round(m.capexNeto).toLocaleString('es-ES') + ' €');

  // Renderizar desglose de fórmulas matemáticas transparentes
  const linesEl = document.getElementById('modal-tax-calc-lines');
  if (linesEl && m.taxFormulaLines) {
    linesEl.innerHTML = m.taxFormulaLines.map(l => '<div style="margin-bottom:2px;">• ' + l + '</div>').join('');
  }
  set('modal-fin-annual-save', Math.round(m.ahorroLuzAnio1).toLocaleString('es-ES') + ' €/año');
  set('modal-fin-payback', (m.paybackYears != null && isFinite(m.paybackYears)) ? m.paybackYears.toFixed(1) + ' años' : '—');
  set('modal-fin-van', Math.round(m.van).toLocaleString('es-ES') + ' €');
  set('modal-fin-tir', m.tirString || ((m.tir != null && isFinite(m.tir)) ? m.tir.toFixed(1) + ' %' : 'N/D'));
  set('modal-fin-lcoe', (m.lcoe != null && isFinite(m.lcoe)) ? m.lcoe.toFixed(3) + ' €/kWh' : '—');
  set('modal-fin-autarquia', m.autarquiaPct + ' %');
  set('modal-fin-cuota-mensual', Math.round(m.cuotaMensual) + ' €/mes');
  set('modal-fin-ahorro-mensual', Math.round(m.ahorroMensualLuz) + ' €/mes');
  const gastoSinSolar = (window.RA && window.RA.billAuditor && window.RA.billAuditor.comparison && window.RA.billAuditor.comparison.gastoMensualActualEUR > 0) ? window.RA.billAuditor.comparison.gastoMensualActualEUR : Math.round(((m.consumoAnual || 3500) * (m.precioRedEUR || 0.18)) / 12);
  const gastoConSolar = (window.RA && window.RA.billAuditor && window.RA.billAuditor.comparison && window.RA.billAuditor.comparison.gastoMensualConSolarEUR > 0) ? window.RA.billAuditor.comparison.gastoMensualConSolarEUR : Math.max(15, Math.round(gastoSinSolar - m.ahorroMensualLuz));
  set('modal-fin-factura-post-amort', '~' + Math.round(gastoConSolar) + ' €/mes');
  set('modal-fin-balance-neto', (m.balanceNetoMensual >= 0 ? '+' : '') + Math.round(m.balanceNetoMensual) + ' €/mes');
}

function raAutoAdjustMaterialsForIva10(mode) {
  if (typeof calculateFinancialModel !== 'function' || typeof RAPricing === 'undefined') return;
  // Activar imputación de margen sobre Mano de Obra e Instalación para favorecer el ratio legal
  const marginLaborChk = document.getElementById('modal-tax-iva-margin-labor');
  if (marginLaborChk && !marginLaborChk.checked) {
    marginLaborChk.checked = true;
  }
  let m;
  try { m = calculateFinancialModel(); } catch (e) { return; }
  if (!m || !m.ivaCompliance) return;

  const numPanels = Math.max(1, m.numPanels || 1);
  const currentFp = RAPricing.getProjectFingerprint(numPanels);
  const prev = RAPricing.getEffectivePricing() || {};

  // Objetivo seguro: 39.5% de la Base Imponible para evitar que redondeos superen el 40.0%
  const targetRatio = 0.395;
  const rawMatTotal = Math.max(1, (m.panCost || 0) + (m.estCost || 0) + (m.invCost || 0) + (m.mlpeCost || 0) + (m.batCost || 0) + (m.cabCost || 0) + (m.windCost || 0));
  const addons = m.addonsCost || 0;

  let targetRawMatTotal = rawMatTotal;
  let newMo = m.moCost || 1400;
  let newLeg = m.legCost || 500;

  if (mode === 'cap_materials') {
    // Reducir partidas de materiales manteniendo mano de obra actual (el presupuesto total baja)
    const currentServDirect = newMo + newLeg;
    const mgFactor = 1 + ((typeof m.marginPct === 'number' ? m.marginPct : 20) / 100.0);
    // Con margen cargado a servicios, Base ≈ (M_new + S) * mgFactor + addons - discount
    // Para que M_new / Base <= 0.395 => M_new <= 0.395 * mgFactor * S / (1 - 0.395 * mgFactor)
    const denom = Math.max(0.15, 1 - (targetRatio * mgFactor));
    const maxTotalMatWithAddons = Math.floor((targetRatio * mgFactor * currentServDirect) / denom);
    targetRawMatTotal = Math.max(100, maxTotalMatWithAddons - addons);
  } else {
    // Modo 'rebalance' (por defecto): Mantener EXACTAMENTE el mismo Precio Total Llave en Mano
    // Trasladando el exceso de coste directo de materiales hacia Mano de Obra e Instalación
    const discFactor = (m.subtotalPreDiscount > 0) ? (m.subtotal / m.subtotalPreDiscount) : 1;
    const maxAllowedBaseMat = Math.floor(m.subtotal * targetRatio);
    const maxDirectMatWithAddons = Math.floor(maxAllowedBaseMat / Math.max(0.1, discFactor));
    targetRawMatTotal = Math.max(100, maxDirectMatWithAddons - addons);
  }

  if (targetRawMatTotal >= rawMatTotal) {
    if (typeof syncCostModalMetrics === 'function') syncCostModalMetrics();
    return;
  }

  const scale = targetRawMatTotal / rawMatTotal;
  const newPanTotal = Math.max(numPanels * 20, Math.round((m.panCost || 0) * scale));
  const newUnitPanelPrice = Math.round((newPanTotal / numPanels) * 100) / 100;
  const actualPanTotal = Math.round(newUnitPanelPrice * numPanels);
  const newEst = Math.round((m.estCost || 0) * scale);
  const newInv = Math.round((m.invCost || 0) * scale);
  const newBat = Math.round((m.batCost || 0) * scale);
  const newWind = Math.round((m.windCost || 0) * scale);
  const newCab = Math.max(50, targetRawMatTotal - (actualPanTotal + newEst + newInv + newBat + newWind));

  const actualNewMatSum = actualPanTotal + newEst + newInv + newBat + newWind + newCab;
  const deltaMat = rawMatTotal - actualNewMatSum;

  if (mode !== 'cap_materials' && deltaMat > 0) {
    // Reequilibrar: 80% del traslado a Mano de Obra & Montaje, 20% a Ingeniería & Dirección de Obra
    const addMo = Math.round(deltaMat * 0.80);
    const addLeg = deltaMat - addMo;
    newMo = Math.round((m.moCost || 0) + addMo);
    newLeg = Math.round((m.legCost || 0) + addLeg);
  }

  RAPricing.currentSessionPricing = Object.assign({}, prev, {
    projectFingerprint: currentFp,
    panelPrice: newUnitPanelPrice,
    estPrice: newEst,
    invPrice: newInv,
    batPrice: newBat,
    cabPrice: newCab,
    moPrice: newMo,
    legPrice: newLeg,
    windPrice: newWind,
    marginPct: (typeof m.marginPct === 'number') ? m.marginPct : (prev.marginPct || 20),
    skipReview: false,
    isManualOverride: true
  });

  // Actualizar inputs visibles del modal de Costes (y del modal de Revisión de Precios si está abierto)
  const setInpVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = Math.round(v); };
  setInpVal('modal-cfg-pres-est', newEst);
  setInpVal('modal-cfg-pres-inv', newInv);
  setInpVal('modal-cfg-pres-bat', newBat);
  setInpVal('modal-cfg-pres-cab', newCab);
  setInpVal('modal-cfg-pres-mo', newMo);
  setInpVal('modal-cfg-pres-leg', newLeg);
  setInpVal('modal-cfg-pres-wind', newWind);

  // Sincronizar también inputs del modal de Revisión de Precios (si existe en el DOM)
  const pPan = document.getElementById('pricing-input-panel');
  if (pPan) pPan.value = newUnitPanelPrice;
  setInpVal('pricing-input-est', newEst);
  setInpVal('pricing-input-inv', newInv);
  setInpVal('pricing-input-bat', newBat);
  setInpVal('pricing-input-cab', newCab);
  setInpVal('pricing-input-mo', newMo);
  setInpVal('pricing-input-leg', newLeg);
  setInpVal('pricing-input-wind', newWind);
  if (pPan && typeof pPan.oninput === 'function') pPan.oninput();

  if (typeof syncCostModalMetrics === 'function') syncCostModalMetrics();
  if (typeof showToast === 'function') {
    showToast(
      'PARTIDAS AJUSTADAS AL ≤ 40% (IVA 10%)',
      mode === 'cap_materials'
        ? 'Materiales reducidos por debajo del 40% de la Base Imponible.'
        : 'Partidas reequilibradas entre materiales y mano de obra manteniendo el precio total.',
      'success',
      3500
    );
  }
}
window.raAutoAdjustMaterialsForIva10 = raAutoAdjustMaterialsForIva10;

// [MODULARIZACION SSOT] Modal de identidad corporativa y logotipo delegado a js/company-branding.js
function syncModalTaxProfile(profile) {
  const isEmpresa = (profile === 'empresa');
  const irpfRow = document.getElementById('modal-tax-irpf-row');
  const isRow = document.getElementById('modal-tax-is-row');
  const lbl = document.getElementById('modal-tax-label-deduccion');
  if (irpfRow) irpfRow.style.display = isEmpresa ? 'none' : 'flex';
  if (isRow) isRow.style.display = isEmpresa ? 'flex' : 'none';
  if (lbl) lbl.textContent = isEmpresa ? 'Bonif. EPC (IBI + Sociedades)' : 'Bonif. EPC (IBI + IRPF)';
  if (typeof syncCostModalMetrics === 'function') syncCostModalMetrics();
}
window.syncModalTaxProfile = syncModalTaxProfile;

window.openCostBreakdownModal = openCostBreakdownModal;
window.closeCostBreakdownModal = closeCostBreakdownModal;
window.syncModalInputToBudget = syncModalInputToBudget;
