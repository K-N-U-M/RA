// ============================================================================
// js/project-calcs.js - Single Source of Truth (SSOT) para Cálculos del Proyecto
// Arquitectura AAA v3.0 - Extraído de index.html
// ============================================================================

(function(root) {
  'use strict';

function getProjectCalcs() {
  const tit = (typeof readTitular === 'function') ? readTitular() : {};

  const pa = (typeof polygonAnalysis === 'function') ? polygonAnalysis() : null;
  let area3D = 0;
  if (typeof WP !== 'undefined' && WP && Array.isArray(WP.polylines) && WP.polylines.length > 0) {
    WP.polylines.forEach(poly => {
      const pInf = poly.roofInfo || (typeof computeSinglePolylineRoofInfo === 'function' ? computeSinglePolylineRoofInfo(poly.points, poly) : null);
      if (pInf && typeof pInf.area3D === 'number' && pInf.area3D > 0) {
        area3D += pInf.area3D;
      } else if (typeof polygonAnalysis === 'function' && Array.isArray(poly.points) && poly.points.length >= 3) {
        const polyAnalysis = polygonAnalysis(poly.points);
        if (polyAnalysis && polyAnalysis.area3D) area3D += polyAnalysis.area3D;
      }
    });
  }
  if (area3D <= 0) {
    area3D = pa ? pa.area3D : 0;
  }
  const latDeg = pa ? pa.latDeg : 40.4;
  const lonDeg = pa ? pa.lonDeg : -3.7;
  const usefulArea = area3D * 0.80;

  const cfg = Object.assign({}, typeof panelConfig !== 'undefined' ? panelConfig : { potencia: 450, largo: 2.10, ancho: 1.05, voc: 41.5, vmp: 34.5, isc: 13.8, imp: 13.05 });
  const moduleArea = cfg.largo * cfg.ancho;

  // ✨ SSOT: window.allRenderedPanels ✨
  let numPanels = 0;
  let mlpeCount = 0;
  if (typeof window !== 'undefined' && Array.isArray(window.allRenderedPanels) && window.allRenderedPanels.length > 0) {
    const activePanels = window.allRenderedPanels.filter(p => p && !p.deleted && !p.disabled);
    numPanels = activePanels.length;
    mlpeCount = activePanels.filter(p => p.hasMLPE).length;
  } else if (typeof WP !== 'undefined' && WP && WP.polylines && WP.polylines.length > 0) {
    WP.polylines.forEach(poly => {
      if (poly.panelsDisabled === true) return;
      const pInf = poly.roofInfo || (typeof computeSinglePolylineRoofInfo === 'function' ? computeSinglePolylineRoofInfo(poly.points, poly) : null);
      if (pInf && pInf.panels) {
        const activeP = pInf.panels.filter(p => p && !p.deleted && !p.disabled);
        numPanels += activeP.length;
        mlpeCount += activeP.filter(p => p.hasMLPE).length;
      }
    });
  } else {
    const roofInfo = (typeof computeRoofPanelsData === 'function') ? computeRoofPanelsData() : null;
    const activeRPanels = (roofInfo && roofInfo.panels) ? roofInfo.panels.filter(p => p && !p.deleted && !p.disabled) : [];
    numPanels = (activeRPanels.length > 0)
      ? activeRPanels.length
      : ((typeof simulatedPanelEntities !== 'undefined' && simulatedPanelEntities.length) || 0);
    mlpeCount = activeRPanels.filter(p => p.hasMLPE).length;
  }

  let tiltDeg = pa ? pa.tiltDeg : 30;
  let azimutDeg = pa ? pa.azimuthDeg : 0;
  if (typeof WP !== 'undefined' && WP && Array.isArray(WP.polylines) && WP.polylines.length > 0) {
    const selIdx = (WP.selectedPolyIdx >= 0 && WP.selectedPolyIdx < WP.polylines.length) ? WP.selectedPolyIdx : 0;
    const selPoly = WP.polylines[selIdx];
    const pInf = selPoly && (selPoly.roofInfo || (typeof computeSinglePolylineRoofInfo === 'function' ? computeSinglePolylineRoofInfo(selPoly.points, selPoly) : null));
    if (pInf) {
      if (typeof pInf.moduleTiltDeg === 'number') tiltDeg = pInf.moduleTiltDeg;
      if (typeof pInf.moduleAzimuthDeg === 'number') azimutDeg = pInf.moduleAzimuthDeg;
    }
  }

  const _mb = (typeof window !== 'undefined' && window.RAModulesBreakdown && typeof window.RAModulesBreakdown.getProjectModulesBreakdown === 'function')
    ? window.RAModulesBreakdown.getProjectModulesBreakdown()
    : null;
  if (_mb && _mb.totalPanels > 0) {
    numPanels = _mb.totalPanels;
  }

  function _computeElecSizing(gen) {
    if (typeof computeElectricalSizingEngineering === 'function') return computeElectricalSizingEngineering(gen);
    if (typeof window !== 'undefined' && window.RA && window.RA.Electrical && typeof window.RA.Electrical.computeSizingEngineering === 'function') return window.RA.Electrical.computeSizingEngineering(gen);
    if (typeof root !== 'undefined' && root.RA && root.RA.Electrical && typeof root.RA.Electrical.computeSizingEngineering === 'function') return root.RA.Electrical.computeSizingEngineering(gen);
    return { P_dc_kW: (gen.numPanels * (gen.cfg.potencia || 450)) / 1000, inv_kW: 5.0, monofasico: true, V_ac: 230, I_ac: 21.7, I_ac_design: 27.2, numStrings: 1, modsPerString: gen.numPanels, minModsPerString: 6, maxModsPerString: 20, Voc_str_stc: 41.5 * gen.numPanels, Voc_str_max: 46.0 * gen.numPanels, Vmp_str_hot: 32.0 * gen.numPanels, I_total_dc: 13.8, S_str: 6, S_ac: 10, dVdc_pct: 1.2, dVac_pct: 0.9, dV_dc: 4.5, dV_ac: 2.1, I_iga: 32, dif_amp: 40, spdType: 'Tipo II', PR: 0.82, lossTree: {} };
  }

  const eng = _computeElecSizing({
    numPanels,
    cfg,
    tiltDeg,
    azimutDeg,
    latDeg
  });
  if (_mb && _mb.totalKwp > 0) {
    eng.P_dc_kW = _mb.totalKwp;
  }

  const SOLAR_RAD  = [2.8, 3.5, 4.8, 5.8, 6.5, 7.2, 7.5, 6.8, 5.4, 3.9, 2.9, 2.5];
  const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const MES_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const latFact = 1.0 + (38.0 - latDeg) * 0.015;
  let annualKWh = 0;

  const monthly = SOLAR_RAD.map((rad, m) => {
    const poaEst = (typeof computePOAIrradiance === 'function') ? computePOAIrradiance(rad * 1000 / 4.5, latDeg, tiltDeg, azimutDeg, 50, 0) : { G_poa: rad * 1000 / 4.5 };
    const poaFactor = (poaEst.G_poa > 0) ? (poaEst.G_poa / 1000) * 4.5 : rad;
    const hspMonth = poaFactor * latFact;
    const kWh = eng.P_dc_kW * hspMonth * MONTH_DAYS[m] * eng.PR;
    annualKWh += kWh;
    return {
      mes: MES_ES[m],
      dias: MONTH_DAYS[m],
      hsp: hspMonth.toFixed(2),
      kWh: Math.round(kWh)
    };
  });
  annualKWh = Math.round(annualKWh);

  // [AUD-2026 · D-01] Producción canónica con fuente DECLARADA y prioridad real:
  //   1) simulación por panel (sombras + pérdidas)   → 'simulation'
  //   2) motor físico con GHI del emplazamiento      → 'physical'
  //   3) tabla estacional interna (último recurso)   → 'fallback-seasonal'
  let productionSource = 'fallback-seasonal';
  let productionSourceDetail = 'Tabla estacional interna de España (sin datos del emplazamiento)';

  // [SSOT] Producción de ingeniería: recalculateSolarYield integra pérdidas de sistema,
  // sombras (raycast por panel) y la suma real p.annualKwh del heatmap.
  // [AUD-2026 · D-01/F-01] La prioridad (simulación → motor físico → tabla) y su
  // memoización viven en js/production-source.js; aquí solo se aplica el resultado.
  const _engStats = (typeof window !== 'undefined' && window.RA && window.RA.solarStats) ? window.RA.solarStats : null;
  let _prodResolved = (typeof window !== 'undefined' && window.RAProduction && typeof window.RAProduction.resolve === 'function')
    ? window.RAProduction.resolve({
        stats: _engStats,
        kwp: eng.P_dc_kW, lat: latDeg, lon: lonDeg,
        tilt: tiltDeg, azimuth: azimutDeg, cfg: cfg
      })
    : null;
  // Respaldo si el módulo no está cargado: la simulación sigue siendo la fuente prioritaria.
  if (!_prodResolved && _engStats && Number.isFinite(_engStats.annualYieldKWh) && _engStats.annualYieldKWh > 0) {
    _prodResolved = {
      annualKWh: _engStats.annualYieldKWh,
      monthlyKWh: Array.isArray(_engStats.monthlyYields) ? _engStats.monthlyYields : null,
      source: 'simulation',
      detail: 'Simulación por panel (sombras + pérdidas)'
    };
  }
  if (_prodResolved && _prodResolved.annualKWh > 0) {
    annualKWh = Math.round(_prodResolved.annualKWh);
    if (Array.isArray(_prodResolved.monthlyKWh) && _prodResolved.monthlyKWh.length === 12) {
      monthly.forEach((row, m) => {
        const kwh = Number(_prodResolved.monthlyKWh[m]) || 0;
        row.kWh = Math.round(kwh);
        row.hsp = (eng.P_dc_kW > 0 ? (kwh / (eng.P_dc_kW * MONTH_DAYS[m])) : 0).toFixed(2);
      });
    }
    productionSource = _prodResolved.source;
    productionSourceDetail = _prodResolved.detail;
  }
  const hspAnual = eng.P_dc_kW > 0 ? Math.round(annualKWh / eng.P_dc_kW) : 0;

  const co2Factor = (typeof SOLAR_ENGINE_CONSTANTS !== 'undefined' && SOLAR_ENGINE_CONSTANTS.CO2_FACTOR_SPAIN) ? SOLAR_ENGINE_CONSTANTS.CO2_FACTOR_SPAIN : 0.259;
  const co2Ton = (annualKWh * co2Factor) / 1000;
  const treesEquiv = Math.round(co2Ton * 45);

  const _inputVal = (id, def) => {
    const el = document.getElementById('modal-' + id) || document.getElementById(id);
    return el ? (parseFloat(el.value) || def) : def;
  };

  const _scCat = window.equipmentCatalog;
  const _scCfg = window.solarProjectConfig;
  let _batItem = null;
  if (_scCat && _scCfg && _scCfg.selectedBatteryId && _scCfg.selectedBatteryId !== 'bat_none') {
    _batItem = (_scCat.batteries || []).find(b => b.id === _scCfg.selectedBatteryId);
  }

  const _designCosts = (typeof window !== 'undefined' && window.RAPricing && typeof window.RAPricing.computeDesignCosts === 'function')
    ? window.RAPricing.computeDesignCosts(numPanels)
    : null;
  const _effPricing = (typeof window !== 'undefined' && window.RAPricing && typeof window.RAPricing.getEffectivePricing === 'function')
    ? window.RAPricing.getEffectivePricing()
    : null;
  const _hasOverride = !!(_effPricing && _effPricing.projectFingerprint);

  let pres_pan = _designCosts ? _designCosts.panelTotalCost : ((_mb && _mb.totalPanelsCost > 0) ? _mb.totalPanelsCost : (numPanels * (cfg.precio || 125)));
  let pres_est = _designCosts ? _designCosts.estPrice : _inputVal('cfg-pres-est', 450);
  let pres_inv = _designCosts ? _designCosts.invPrice : _inputVal('cfg-pres-inv', 1100);
  let pres_bat = _designCosts ? _designCosts.batPrice : _inputVal('cfg-pres-bat', 0);
  let pres_cab = _designCosts ? _designCosts.cabPrice : _inputVal('cfg-pres-cab', 350);
  let pres_mo  = _designCosts ? _designCosts.moPrice : _inputVal('cfg-pres-mo', 1400);
  let pres_mon = 0; // Integrado en el inversor / sistema de conversión (sin partida fantasma)
  let pres_leg = _designCosts ? _designCosts.legPrice : _inputVal('cfg-pres-leg', 350);

  if (_hasOverride) {
    if (typeof _effPricing.panelPrice === 'number' && _effPricing.panelPrice > 0) {
      if (!(_mb && _mb.isMultiModule && _designCosts && Math.abs(_effPricing.panelPrice - _designCosts.panelPrice) < 0.05)) {
        pres_pan = Math.round(numPanels * _effPricing.panelPrice);
      }
    }
    if (typeof _effPricing.estPrice === 'number' && _effPricing.estPrice >= 0) pres_est = _effPricing.estPrice;
    if (typeof _effPricing.invPrice === 'number' && _effPricing.invPrice >= 0) pres_inv = _effPricing.invPrice;
    if (typeof _effPricing.batPrice === 'number' && _effPricing.batPrice > 0) {
      pres_bat = _effPricing.batPrice;
    } else if (_effPricing.batPrice === 0 && (!_batItem || _batItem.id === 'bat_none')) {
      pres_bat = 0;
    }
    if (typeof _effPricing.cabPrice === 'number' && _effPricing.cabPrice >= 0) pres_cab = _effPricing.cabPrice;
    if (typeof _effPricing.moPrice === 'number' && _effPricing.moPrice >= 0) pres_mo = _effPricing.moPrice;
    if (typeof _effPricing.legPrice === 'number' && _effPricing.legPrice >= 0) pres_leg = _effPricing.legPrice;
  }

  const _directCost = Math.round(pres_pan + pres_est + pres_inv + pres_bat + pres_cab + pres_mo + pres_leg);
  const _marginPct = (_effPricing && typeof _effPricing.marginPct === 'number') ? _effPricing.marginPct : 20;
  const subtotal = Math.round(_directCost * (1 + (_marginPct / 100.0)));
  const iva = Math.round(subtotal * 0.21);
  const total_pres = subtotal + iva;
  const _cachedFin = (typeof window !== 'undefined' && window._lastFinModel && window._lastFinModel.numPanels === numPanels) ? window._lastFinModel : null;
  // [AUD-2026 · D-06] Sin modelo financiero no se inventa un ahorro con un precio suelto.
  // Se declara 0 y el payback queda como «—»; el modelo se recalcula en cuanto haya datos.
  const precio_kwh = 0.18; // precio de referencia para etiquetas (no para calcular ahorro)
  const ahorro_anual = (_cachedFin && _cachedFin.ahorroLuzAnio1 > 0) ? Math.round(_cachedFin.ahorroLuzAnio1) : 0;
  const payback = (_cachedFin && typeof _cachedFin.paybackYears === 'number' && isFinite(_cachedFin.paybackYears))
    ? _cachedFin.paybackYears.toFixed(1)
    : (ahorro_anual > 0 ? (total_pres / ahorro_anual).toFixed(1) : '—');

  // Potencia AC nominal total del inversor seleccionado (para clipping en los motores de energía)
  let pAcNominalW = 0;
  try {
    const _cat = window.equipmentCatalog;
    const _sc = window.solarProjectConfig;
    if (_cat && _sc && _sc.selectedInverterId) {
      const _inv = _cat.inverters.find(i => i.id === _sc.selectedInverterId);
      if (_inv && _inv.kw > 0) {
        const _invCount = (_sc.autoSizing && _sc.autoSizing.inverters && _sc.autoSizing.inverters.count) || 1;
        pAcNominalW = _inv.kw * _invCount * 1000;
      }
    }
  } catch (e) { /* catálogo no disponible */ }
  cfg.pAcNominalW = pAcNominalW;

  const _invObjItem = (_scCat && _scCfg && _scCfg.selectedInverterId)
    ? ((_scCat.inverters || []).find(i => i.id === _scCfg.selectedInverterId) || ((_scCfg.lastVirtualInverter && _scCfg.lastVirtualInverter.id === _scCfg.selectedInverterId) ? _scCfg.lastVirtualInverter : null))
    : null;
  let _invObjCount = (_scCfg && _scCfg.autoSizing && _scCfg.autoSizing.inverters && _scCfg.autoSizing.inverters.count) || 1;
  if (_invObjItem && _invObjItem.kw >= 10.0 && _invObjCount > 1 && !_scCfg.inverters && !_scCfg.selectedInverters) { _invObjCount = 1; }
  const inverterObj = _invObjItem ? {
    id: _invObjItem.id,
    brand: _invObjItem.brand || '',
    model: _invObjItem.model || '',
    fullName: (_invObjItem.brand ? (_invObjItem.brand + ' ') : '') + (_invObjItem.model || ('Inversor ' + eng.inv_kW + ' kW')),
    kw: (_invObjItem.kw || _invObjItem.kw_nominal || eng.inv_kW),
    totalKw: (_invObjItem.kw || _invObjItem.kw_nominal || eng.inv_kW) * _invObjCount,
    count: _invObjCount,
    mpptCount: _invObjItem.mppt || _invObjItem.mpptCount || _invObjItem.mppts || (eng.numStrings > 1 ? 2 : 1),
    vDcMax: _invObjItem.vDcMax || _invObjItem.vMax || _invObjItem.vMaxDc || eng.V_max_inv || 1000,
    vMpptMin: _invObjItem.vMpptMin || eng.V_mppt_min || 160,
    vMpptMax: _invObjItem.vMpptMax || eng.V_mppt_max || 850,
    efficiency: _invObjItem.efficiency || 98.4,
    phases: (typeof _invObjItem.phases === 'number') ? _invObjItem.phases : (eng.monofasico ? 1 : 3),
    topology: _scCfg ? (_scCfg.selectedTopology || 'inverter') : 'inverter'
  } : {
    id: 'inv_default',
    fullName: 'Inversor Solar Multi-MPPT ' + eng.inv_kW + ' kW',
    brand: 'Genérico Certificado',
    model: 'Multi-MPPT ' + eng.inv_kW + ' kW',
    kw: eng.inv_kW,
    totalKw: eng.inv_kW,
    count: 1,
    mpptCount: eng.numStrings > 1 ? 2 : 1,
    vDcMax: eng.V_max_inv || 1000,
    vMpptMin: eng.V_mppt_min || 160,
    vMpptMax: eng.V_mppt_max || 850,
    efficiency: 98.2,
    phases: eng.monofasico ? 1 : 3,
    topology: 'inverter'
  };

  const _batObjCount = Math.max(1, (_scCfg && _scCfg.autoSizing && _scCfg.autoSizing.batteries && _scCfg.autoSizing.batteries.count) || 1);
  const hasBat = !!(_batItem && _batItem.id !== 'bat_none' && ((_batItem.kwh || _batItem.capacity || 0) > 0));
  const batteryObj = hasBat ? {
    id: _batItem.id,
    brand: _batItem.brand || '',
    model: _batItem.model || '',
    fullName: (_batItem.brand ? (_batItem.brand + ' ') : '') + (_batItem.model || 'Batería Solar'),
    kwh: _batItem.kwh || _batItem.capacity || 5.0,
    totalKwh: (_batItem.kwh || _batItem.capacity || 5.0) * _batObjCount,
    count: _batObjCount,
    voltage: _batItem.voltage || 400,
    technology: _batItem.technology || 'LiFePO4 (LFP)',
    efficiency: _batItem.efficiency || 95,
    dod: _batItem.dod || 90,
    costEur: pres_bat
  } : null;

  return {
    inverter: inverterObj,
    battery: batteryObj,
    hasBattery: hasBat,
    V_max_inv: inverterObj.vDcMax,
    V_mppt_min: inverterObj.vMpptMin,
    V_mppt_max: inverterObj.vMpptMax,
    refNum: (typeof generateRefNum === 'function') ? generateRefNum() : 'RA-PROY-2026',
    cfg: cfg,
    fechaStr: (typeof formatDateSpanish === 'function') ? formatDateSpanish(new Date()) : new Date().toLocaleDateString('es-ES'),
    titular: tit,
    tit: tit,
    latDeg: Number(latDeg.toFixed(4)), // numérico para consumidores
    lonDeg: Number(lonDeg.toFixed(4)),
    latNum: latDeg,
    lonNum: lonDeg,
    tiltDeg: Math.round(tiltDeg),
    azimutDeg: Math.round(azimutDeg),
    area3D: Number(area3D.toFixed(1)),
    usefulArea: Number(usefulArea.toFixed(1)),
    kwp: eng.P_dc_kW.toFixed(2),
    P_dc_kW: eng.P_dc_kW,
    numPanels,
    mlpeCount,
    potMod: cfg.potencia,
    tipoMod: (typeof panelConfig !== 'undefined' && panelConfig.name) ? panelConfig.name : 'Monocristalino Tier-1 TOPCon / PERC',
    dimMod: cfg.largo + ' x ' + cfg.ancho + ' m',
    inv_kW: eng.inv_kW,
    tipoInv: (eng.monofasico ? 'Monofásico 230 V' : 'Trifásico 400 V') + ' · Multi-MPPT Inteligente',
    monofasico: eng.monofasico,
    V_ac: eng.V_ac,
    I_ac: eng.I_ac,
    I_ac_d: eng.I_ac_design,
    numStrings: eng.numStrings,
    modsPerStr: eng.modsPerString,
    minModsPerStr: eng.minModsPerString,
    maxModsPerStr: eng.maxModsPerString,
    modsActual: eng.modsPerString,
    Voc_string: eng.Voc_str_stc,
    Voc_str_cold: eng.Voc_str_max,
    Vmp_str_hot: eng.Vmp_str_hot,
    I_total_dc: eng.I_total_dc,
    Voc: cfg.voc || 41.5,
    Isc: cfg.isc || 13.8,
    Vmp: cfg.vmp || 34.5,
    Imp: cfg.imp || 13.05,
    S_str: eng.S_str,
    S_mdc: eng.S_str >= 10 ? eng.S_str : 10,
    S_ac: eng.S_ac,
    dV_dc: eng.dV_dc,
    dV_ac: eng.dV_ac,
    betaVoc: (cfg.gammaVoc || -0.0028),
    Voc_cold: eng.Voc_str_max,
    T_min: -10,
    Voc_string: eng.Voc_str_stc,
    P_dc_kW: eng.P_dc_kW,
    P_ac_kW: eng.inv_kW,
    I_ac_d: eng.I_ac_design,
    monofasico: eng.monofasico,
    numStrings: eng.numStrings,
    modsPerStr: eng.modsPerString,
    dVdc_p: eng.dVdc_pct.toFixed(2),
    dVac_p: eng.dVac_pct.toFixed(2),
    fuse_std: eng.numStrings > 2 ? 20 : null,
    I_iga: eng.I_iga,
    dif_amp: eng.dif_amp,
    spdType: eng.spdType,
    R_tierra: 15,
    PR: eng.PR,
    lossTree: eng.lossTree,
    annualKWh,
    productionSource,
    productionSourceDetail,
    theoreticalAnnualKWh: (_engStats && _engStats.theoreticalAnnualKWh) ? _engStats.theoreticalAnnualKWh : annualKWh,
    hasSimulation: _engStats ? !!_engStats.hasSimulation : false,
    shadowLossPct: (_engStats && typeof _engStats.avgShadowLossPct === 'number') ? _engStats.avgShadowLossPct : 0,
    hspAnual,
    monthly,
    modulesBreakdown: _mb,
    isMultiModule: !!(_mb && _mb.isMultiModule),
    co2Ton: co2Ton.toFixed(2),
    co2_evitado: co2Ton.toFixed(2),
    treesEquiv,
    precio_kwh,
    ahorro_anual,
    pres_pan,
    pres_est,
    pres_inv,
    pres_bat,
    pres_cab,
    pres_mo,
    pres_mon,
    pres_leg,
    directCost: _directCost,
    marginPct: _marginPct,
    subtotal,
    iva,
    total_pres,
    total: total_pres,
    payback,
    roi: payback,
    modalTexto: (typeof getSelectedModalidadText === 'function') ? getSelectedModalidadText() : 'Autoconsumo individual con excedentes acogido a compensación simplificada (RD 244/2019)',
      // 📏 Mediciones milimétricas reales obtenidas directamente de Cesium 3D
    L_dc: (window.inverterEquipmentState && window.inverterEquipmentState.L_dc_measured) ? window.inverterEquipmentState.L_dc_measured : (eng.L_dc || 25.0),
    L_ac: (window.inverterEquipmentState && window.inverterEquipmentState.L_ac_measured) ? window.inverterEquipmentState.L_ac_measured : (eng.L_ac || 15.0),
    L_dc_esMedida3D: !!(window.inverterEquipmentState && window.inverterEquipmentState.position && window.inverterEquipmentState.L_dc_measured > 0),
    L_ac_esMedida3D: !!(window.inverterEquipmentState && window.inverterEquipmentState.gridMeter && window.inverterEquipmentState.gridMeter.position && window.inverterEquipmentState.L_ac_measured > 0),
    S_dc_real: (window.inverterEquipmentState && window.inverterEquipmentState.S_dc_recommended) ? window.inverterEquipmentState.S_dc_recommended : eng.S_str,
    S_ac_real: (window.inverterEquipmentState && window.inverterEquipmentState.S_ac_recommended) ? window.inverterEquipmentState.S_ac_recommended : eng.S_ac,
    isCoplanar: (tiltDeg > 5),
};
}

  function getSelectedModalidadText() {
    if (typeof document !== 'undefined') {
      const el = document.getElementById('doc-modalidad');
      if (el) {
        const val = el.value;
        if (val === 'sin') return 'Autoconsumo individual sin excedentes (RD 244/2019 art. 9.1.a)';
        if (val === 'con-acogido') return 'Autoconsumo individual con excedentes acogido a compensación simplificada (RD 244/2019)';
        if (val === 'con-noacogido') return 'Autoconsumo individual con excedentes sin compensación (RD 244/2019)';
        if (val === 'colectivo-cel') return 'Autoconsumo colectivo / Comunidad Energética Local (CEL — RDL 7/2026 radio 5 km)';
        if (el.selectedOptions && el.selectedOptions[0] && el.selectedOptions[0].textContent) {
          return el.selectedOptions[0].textContent;
        }
      }
    }
    return 'Autoconsumo individual con excedentes acogido a compensación simplificada (RD 244/2019)';
  }
  root.getSelectedModalidadText = getSelectedModalidadText;

  // Registro bajo el namespace canónico RA y alias globales de compatibilidad
  root.RA = root.RA || {};
  root.RA.ProjectCalcs = {
    getProjectCalcs: getProjectCalcs
  };

  root.getProjectCalcs = getProjectCalcs;
  root._canonicalGetProjectCalcs = getProjectCalcs;

})(typeof window !== 'undefined' ? window : global);
