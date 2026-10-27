window.solarProjectConfig = {
  selectedModuleId: 'ja_550',
  selectedInverterId: 'inv_huawei_10k',
  selectedMicroinverterId: 'mlpe_hoymiles_800',
  selectedBatteryId: 'bat_huawei_5k',
  selectedProtectionDcId: 'panel_dc_2mppt',
  selectedProtectionAcId: 'panel_ac_tri_25a',
  selectedCableDcId: 'cable_dc_zzf_6',
  selectedCableAcId: 'cable_ac_rvk_5g10',
  selectedTopology: 'inverter', // 'inverter' | 'microinverter' | 'optimizer'
  selectedObjective: 'optimal_inv',
  targetKwp: 5.0,
  lastEstimatedPanels: 50,
  autoSizing: {
    inverters: { count: 2, autoCount: 2, isManual: false },
    microinverters: { count: 0, autoCount: 0, isManual: false },
    batteries: { count: 1, autoCount: 1, isManual: false }
  },
  stringWiringTopology: 'leapfrog', // 'leapfrog' (Salto de rana anti-bucle UNE-EN 62305) | 'daisy_chain' (Guirnalda continua + retorno compensado)
  calculatedLimits: { nMinString: 5, nMaxString: 13, nMaxTotalModules: 22 }
};
// ── window.RA alias (Arquitectura v2) ────────────────────────────────────
window.RA.projectConfig = window.solarProjectConfig;

function populateStep3EquipmentSelectors() {
  const catalog = (typeof window !== 'undefined' && window.equipmentCatalog) ? window.equipmentCatalog : ((typeof equipmentCatalog !== 'undefined') ? equipmentCatalog : null);
  if (!catalog) return;

  const cfg = window.solarProjectConfig || {};

  // 1. Módulos FV (Sincronizado entre Paso 2 Campo Solar y Paso 4 Equipos)
  const curModVal = cfg.selectedModuleId || (catalog.modules && catalog.modules[0] ? catalog.modules[0].id : '');
  const modOptionsHtml = (catalog.modules || []).map(m => {
    const isSel = (m.id === curModVal);
    return '<option value="' + m.id + '"' + (isSel ? ' selected' : '') + '>' +
      m.brand + ' · ' + m.model + ' (' + m.wp + ' Wp · ' + m.l.toFixed(2) + '×' + m.w.toFixed(2) + 'm · ' + m.price + ' €)' +
    '</option>';
  }).join('');

  const modSel = document.getElementById('step3-sel-module');
  if (modSel) modSel.innerHTML = modOptionsHtml;

  const faldonModSel = document.getElementById('faldon-module-select');
  if (faldonModSel) faldonModSel.innerHTML = modOptionsHtml;

  const modSel2 = document.getElementById('step2-sel-module');
  if (modSel2) {
    modSel2.innerHTML = modOptionsHtml;
    if (typeof wpUpdateStep2ModuleBadge === 'function') wpUpdateStep2ModuleBadge();
  }

  // 2. Inversores
  const invSel = document.getElementById('step3-sel-inverter');
  if (invSel && Array.isArray(catalog.inverters)) {
    const curVal = cfg.selectedInverterId || (catalog.inverters[1] ? catalog.inverters[1].id : (catalog.inverters[0] ? catalog.inverters[0].id : ''));
    let invOptionsHtml = catalog.inverters.map(i => {
      const isSel = (i.id === curVal);
      return '<option value="' + i.id + '"' + (isSel ? ' selected' : '') + '>' +
        i.brand + ' · ' + i.model + ' (' + i.kw + ' kW · ' + i.mppt + ' MPPT · ' + (i.maxOverload ? Math.round(i.maxOverload*100) : 130) + '% DC · ' + i.price + ' €)' +
      '</option>';
    }).join('');

    // Si el inversor seleccionado es virtual y no está en catálogo, inyectarlo destacado al principio con etiqueta de advertencia
    const vInv = cfg.lastVirtualInverter;
    if (vInv && !catalog.inverters.some(i => i.id === vInv.id)) {
      const isSel = (vInv.id === curVal);
      invOptionsHtml = `<option value="${vInv.id}" ${isSel ? 'selected' : ''} style="color:#F59E0B;font-weight:bold;">⚠️ [EQUIPO RECOMENDADO FUERA DE CATÁLOGO] ${vInv.brand} · ${vInv.model} (${vInv.kw} kW · ${vInv.price} €)</option>` + invOptionsHtml;
    }
    invSel.innerHTML = invOptionsHtml;
    if (curVal) invSel.value = curVal;
  }

  // 3. Optimizadores DC/DC (MLPE)
  const optSel = document.getElementById('step3-sel-optimizer');
  if (optSel && Array.isArray(catalog.microinverters)) {
    const optimizersList = catalog.microinverters.filter(m => (m.type && m.type.includes('Optimizador')) || (m.model && m.model.toLowerCase().includes('optimi')));
    const curOptVal = cfg.selectedOptimizerId || (optimizersList[0] ? optimizersList[0].id : (catalog.microinverters[0] ? catalog.microinverters[0].id : ''));
    const sourceList = optimizersList.length > 0 ? optimizersList : catalog.microinverters;
    optSel.innerHTML = sourceList.map(opt => {
      const isSel = (opt.id === curOptVal);
      return '<option value="' + opt.id + '"' + (isSel ? ' selected' : '') + '>' +
        opt.brand + ' · ' + opt.model + ' (' + (opt.type || 'Optimizador DC') + ' · ' + (opt.price || 65) + ' €)' +
      '</option>';
    }).join('');
    if (curOptVal) optSel.value = curOptVal;
  }

  // 3.1 Microinversores
  const miSel = document.getElementById('step3-sel-microinverter');
  if (miSel && Array.isArray(catalog.microinverters)) {
    const curVal = cfg.selectedMicroinverterId || (catalog.microinverters[0] ? catalog.microinverters[0].id : '');
    miSel.innerHTML = catalog.microinverters.map(mi => {
      const isSel = (mi.id === curVal);
      return '<option value="' + mi.id + '"' + (isSel ? ' selected' : '') + '>' +
        mi.brand + ' · ' + mi.model + ' (' + Math.round(mi.kw * 1000) + ' W · ' + (mi.type || 'MLPE') + ' · ' + mi.price + ' €)' +
      '</option>';
    }).join('');
    if (curVal) miSel.value = curVal;
  }

  // 4. Baterías
  const batSel = document.getElementById('step3-sel-battery');
  if (batSel && Array.isArray(catalog.batteries)) {
    const curVal = cfg.selectedBatteryId || (catalog.batteries[0] ? catalog.batteries[0].id : '');
    batSel.innerHTML = catalog.batteries.map(b => {
      const isSel = (b.id === curVal);
      const capTxt = b.kwh > 0 ? (b.kwh + ' kWh · ' + b.price + ' €') : 'Sin almacenamiento adicional';
      return '<option value="' + b.id + '"' + (isSel ? ' selected' : '') + '>' +
        b.brand + ' · ' + b.model + ' (' + capTxt + ')' +
      '</option>';
    }).join('');
    if (curVal) batSel.value = curVal;
  }

  if (typeof wpUpdateCableRoutesUI === 'function') {
    wpUpdateCableRoutesUI();
  }
}
window.populateStep3EquipmentSelectors = populateStep3EquipmentSelectors;

function step3SetTopology(topo) {
  if (!window.solarProjectConfig) window.solarProjectConfig = {};
  window.solarProjectConfig.selectedTopology = topo;

  ['inverter', 'micro', 'optim'].forEach(k => {
    const btn = document.getElementById('step3-topo-' + k);
    if (btn) {
      const isAct = (k === 'inverter' && topo === 'inverter') || (k === 'micro' && topo === 'microinverter') || (k === 'optim' && topo === 'optimizer');
      btn.classList.toggle('active', isAct);
      if (isAct) {
        btn.style.background = (topo === 'microinverter') ? 'rgba(16,185,129,0.3)' : (topo === 'optimizer' ? 'rgba(245,158,11,0.3)' : 'rgba(14,165,233,0.3)');
        btn.style.borderColor = (topo === 'microinverter') ? '#10B981' : (topo === 'optimizer' ? '#F59E0B' : '#38BDF8');
        btn.style.color = (topo === 'microinverter') ? '#34D399' : (topo === 'optimizer' ? '#FBBF24' : '#38BDF8');
      } else {
        btn.style.background = 'rgba(14, 165, 233, 0.08)';
        btn.style.borderColor = 'rgba(14, 165, 233, 0.25)';
        btn.style.color = '#fff';
      }
    }
  });

  const rowInv = document.getElementById('step3-row-inverter');
  const rowMi = document.getElementById('step3-row-microinverter');
  const rowOpt = document.getElementById('step3-row-optimizer');
  const ctrlInv = document.getElementById('step3-ctrl-inverters');
  const ctrlMi = document.getElementById('step3-ctrl-microinverters');

  const archTag = document.getElementById('step3-topo-arch-tag');
  const explainerText = document.getElementById('step3-topo-explainer-text');
  const explainerBanner = document.getElementById('step3-topo-explainer-banner');

  if (topo === 'microinverter') {
    if (rowInv) rowInv.style.display = 'none';
    if (rowOpt) rowOpt.style.display = 'none';
    if (rowMi) rowMi.style.display = 'block';
    if (ctrlInv) ctrlInv.style.display = 'none';
    if (ctrlMi) ctrlMi.style.display = 'block';
    if (archTag) {
      archTag.textContent = 'MICROINVERSORES AC (SIN CENTRAL)';
      archTag.style.background = 'rgba(16,185,129,0.15)';
      archTag.style.color = '#34D399';
    }
    if (explainerText) {
      explainerText.innerHTML = '<strong style="color:#34D399;">Arquitectura Microinversores (AC):</strong> No requiere inversor central. Cada microinversor se monta en tejado y convierte DC a AC a 230V directamente.';
    }
    if (explainerBanner) {
      explainerBanner.style.borderColor = 'rgba(16,185,129,0.3)';
    }
  } else if (topo === 'optimizer') {
    if (rowInv) rowInv.style.display = 'block';
    if (rowOpt) rowOpt.style.display = 'block';
    if (rowMi) rowMi.style.display = 'none';
    if (ctrlInv) ctrlInv.style.display = 'block';
    if (ctrlMi) ctrlMi.style.display = 'none';
    if (archTag) {
      archTag.textContent = 'INVERSOR CENTRAL + OPTIMIZADORES';
      archTag.style.background = 'rgba(245,158,11,0.15)';
      archTag.style.color = '#FBBF24';
    }
    if (explainerText) {
      explainerText.innerHTML = '<strong style="color:#FBBF24;">Arquitectura Híbrida (Inversor + MLPE):</strong> Conexión en serie de paneles con Optimizadores DC/DC adosados, conectados al Inversor de Red principal.';
    }
    if (explainerBanner) {
      explainerBanner.style.borderColor = 'rgba(245,158,11,0.3)';
    }
  } else {
    if (rowInv) rowInv.style.display = 'block';
    if (rowOpt) rowOpt.style.display = 'none';
    if (rowMi) rowMi.style.display = 'none';
    if (ctrlInv) ctrlInv.style.display = 'block';
    if (ctrlMi) ctrlMi.style.display = 'none';
    if (archTag) {
      archTag.textContent = 'INVERSOR STRING CENTRAL';
      archTag.style.background = 'rgba(56,189,248,0.15)';
      archTag.style.color = '#38BDF8';
    }
    if (explainerText) {
      explainerText.innerHTML = '<strong style="color:#38BDF8;">Inversor String Central:</strong> Los paneles se conectan en serie (DC) directamente a las entradas MPPT del inversor central.';
    }
    if (explainerBanner) {
      explainerBanner.style.borderColor = 'rgba(56,189,248,0.3)';
    }
  }

  step3UpdateHardwareSelection();
  if (typeof wpUpdateStep4Checklist === 'function') wpUpdateStep4Checklist();
  if (typeof wpUpdateAutoSizingUI === 'function') wpUpdateAutoSizingUI();
  if (typeof wpRefreshAutoEngineeringBanner === 'function') wpRefreshAutoEngineeringBanner(topo);
}

function step3EditCurrentEquipment(category) {
  const cfg = window.solarProjectConfig || {};
  let currentId = '';
  if (category === 'modules') currentId = cfg.selectedModuleId;
  else if (category === 'inverters') currentId = cfg.selectedInverterId;
  else if (category === 'microinverters') currentId = cfg.selectedMicroinverterId;
  else if (category === 'batteries') currentId = cfg.selectedBatteryId;

  openEquipmentCatalogModal(category);
  if (currentId) {
    openEditEquipmentModal(category, currentId);
  }
}

function step2SelectModule(id) {
  if (!id) return;
  if (window.solarProjectConfig) {
    window.solarProjectConfig.selectedModuleId = id;
  }
  // [SINCRONIZACION] Aplicar el modulo elegido a todos los faldones existentes (Fuente de Verdad)
  if (typeof WP !== 'undefined' && WP && WP.polylines) {
    WP.polylines.forEach(poly => {
      poly.moduleId = id;
      poly._orientCompCache = null;
    });
  }

  const selStep3 = document.getElementById('step3-sel-module');
  if (selStep3) selStep3.value = id;

  const catalog = (typeof window !== 'undefined' && window.equipmentCatalog) ? window.equipmentCatalog : ((typeof equipmentCatalog !== 'undefined') ? equipmentCatalog : null);
  if (catalog && Array.isArray(catalog.modules)) {
    const m = catalog.modules.find(x => x.id === id);
    if (m && typeof panelConfig !== 'undefined') {
      panelConfig.potencia = m.wp || 450;
      panelConfig.largo = m.l || 2.10;
      panelConfig.ancho = m.w || 1.05;
      panelConfig.precio = m.price || 115;
      panelConfig.modelo = (m.brand || '') + ' ' + (m.model || '');
      panelConfig.rendimiento = m.eff || 21.5;
    }
  }

  if (typeof window.wpInvalidateHeatmap === 'function') {
    window.wpInvalidateHeatmap('Módulo FV global modificado');
  }
  if (typeof step3UpdateHardwareSelection === 'function') {
    step3UpdateHardwareSelection();
  }
  wpUpdateStep2ModuleBadge();
  if (typeof wpPopulateFaldonCard === 'function') {
    wpPopulateFaldonCard();
  }
  if (typeof step5RegenerateLayout === 'function') {
    step5RegenerateLayout();
  }
  if (typeof BOMTreeEngine !== 'undefined' && typeof BOMTreeEngine.refresh === 'function') {
    BOMTreeEngine.refresh();
  }
}
window.step2SelectModule = step2SelectModule;

function wpUpdateStep2ModuleBadge() {
  const catalog = (typeof window !== 'undefined' && window.equipmentCatalog) ? window.equipmentCatalog : ((typeof equipmentCatalog !== 'undefined') ? equipmentCatalog : null);
  const cfg = window.solarProjectConfig || {};
  const badge = document.getElementById('step2-module-spec-badge');
  if (!catalog || !badge) return;
  const mod = catalog.modules.find(m => m.id === cfg.selectedModuleId) || catalog.modules[0];
  if (mod) {
    badge.innerHTML = '<span><i data-lucide="ruler" class="icon-sm"></i> ' + (mod.l || 2.1).toFixed(2) + '×' + (mod.w || 1.05).toFixed(2) + 'm · ' + (mod.wp || 450) + ' Wp</span><span style="color:#38BDF8;font-weight:bold;">' + (mod.eff ? (mod.eff + '%') : '') + ' · ' + (mod.price || 115) + ' €</span>';
  }
}
window.wpUpdateStep2ModuleBadge = wpUpdateStep2ModuleBadge;

function step3UpdateHardwareSelection() {
  const invSel = document.getElementById('step3-sel-inverter');
  const modSel = document.getElementById('step3-sel-module');
  const faldonModSel = document.getElementById('faldon-module-select');
  const modSel2 = document.getElementById('step2-sel-module');
  const miSel  = document.getElementById('step3-sel-microinverter');
  const batSel = document.getElementById('step3-sel-battery');

  const prevModuleId = (window.solarProjectConfig && window.solarProjectConfig.selectedModuleId) ? window.solarProjectConfig.selectedModuleId : null;
  let moduleActuallyChanged = false;

  const prevInverterId = (window.solarProjectConfig && window.solarProjectConfig.selectedInverterId) ? window.solarProjectConfig.selectedInverterId : null;
  if (invSel && invSel.value) {
    if (prevInverterId && prevInverterId !== invSel.value) {
      if (window.solarProjectConfig.autoSizing && window.solarProjectConfig.autoSizing.inverters) {
        window.solarProjectConfig.autoSizing.inverters.isManual = false;
      }
    }
    window.solarProjectConfig.selectedInverterId = invSel.value;
  }
  let newModValue = null;
  if (typeof document !== 'undefined' && document.activeElement === faldonModSel && faldonModSel && faldonModSel.value) {
    newModValue = faldonModSel.value;
    if (typeof WP !== 'undefined' && WP && WP.polylines && WP.selectedPolyIdx >= 0 && WP.polylines[WP.selectedPolyIdx]) {
      WP.polylines[WP.selectedPolyIdx].moduleId = newModValue;
    }
  } else {
    newModValue = (modSel && modSel.value) || (modSel2 && modSel2.value) || (faldonModSel && faldonModSel.value);
  }

  if (newModValue) {
    if (prevModuleId && prevModuleId !== newModValue) {
      moduleActuallyChanged = true;
    }
    window.solarProjectConfig.selectedModuleId = newModValue;

    // Respetar módulo específico del faldón activo en faldonModSel
    const activePoly = (typeof WP !== 'undefined' && WP && WP.polylines && WP.selectedPolyIdx >= 0 && WP.polylines[WP.selectedPolyIdx]) ? WP.polylines[WP.selectedPolyIdx] : null;
    if (faldonModSel) {
      if (activePoly && activePoly.moduleId) {
        if (faldonModSel.value !== activePoly.moduleId) faldonModSel.value = activePoly.moduleId;
      } else if (faldonModSel.value !== newModValue) {
        faldonModSel.value = newModValue;
      }
    }
    if (modSel2 && modSel2.value !== newModValue) modSel2.value = newModValue;
    if (modSel && modSel.value !== newModValue) modSel.value = newModValue;
    if (typeof wpUpdateStep2ModuleBadge === 'function') wpUpdateStep2ModuleBadge();
    
    // SSOT Sync: Actualizar panelConfig global automáticamente
    const catalogMod = (typeof window !== 'undefined' && window.equipmentCatalog) ? window.equipmentCatalog : ((typeof equipmentCatalog !== 'undefined') ? equipmentCatalog : null);
    if (catalogMod && Array.isArray(catalogMod.modules)) {
      const m = catalogMod.modules.find(x => x.id === newModValue);
      if (m && typeof panelConfig !== 'undefined') {
        panelConfig.potencia = m.wp || 450;
        panelConfig.largo = m.l || 2.10;
        panelConfig.ancho = m.w || 1.05;
        panelConfig.precio = m.price || 115;
        panelConfig.modelo = (m.brand || '') + ' ' + (m.model || '');
        panelConfig.rendimiento = m.eff || 21.5;
        panelConfig.voc = m.voc || 41.5;
        panelConfig.isc = m.isc || 13.8;
        panelConfig.vmp = m.vmp || 34.5;
        panelConfig.imp = m.imp || 13.05;
      }
    }
  }

  const optSel = document.getElementById('step3-sel-optimizer');
  if (optSel && optSel.value) {
    window.solarProjectConfig.selectedOptimizerId = optSel.value;
  }

  const prevMicroId = (window.solarProjectConfig && window.solarProjectConfig.selectedMicroinverterId) ? window.solarProjectConfig.selectedMicroinverterId : null;
  if (miSel && miSel.value) {
    if (prevMicroId && prevMicroId !== miSel.value) {
      if (window.solarProjectConfig.autoSizing && window.solarProjectConfig.autoSizing.microinverters) {
        window.solarProjectConfig.autoSizing.microinverters.isManual = false;
      }
    }
    window.solarProjectConfig.selectedMicroinverterId = miSel.value;
  }

  const prevBatId = (window.solarProjectConfig && window.solarProjectConfig.selectedBatteryId) ? window.solarProjectConfig.selectedBatteryId : null;
  if (batSel && batSel.value) {
    if (prevBatId && prevBatId !== batSel.value) {
      if (window.solarProjectConfig.autoSizing && window.solarProjectConfig.autoSizing.batteries) {
        window.solarProjectConfig.autoSizing.batteries.isManual = false;
        if (batSel.value !== 'bat_none' && (!window.solarProjectConfig.autoSizing.batteries.count || window.solarProjectConfig.autoSizing.batteries.count === 0)) {
          window.solarProjectConfig.autoSizing.batteries.count = 1;
        }
      }
      if (window.RAPricing && window.RAPricing.currentSessionPricing) {
        window.RAPricing.currentSessionPricing.batPrice = null;
      }
      try {
        const _saved = localStorage.getItem('ra_pricing_defaults');
        if (_saved) {
          const _p = JSON.parse(_saved);
          if (_p && typeof _p === 'object') {
            delete _p.batPrice;
            localStorage.setItem('ra_pricing_defaults', JSON.stringify(_p));
          }
        }
      } catch(e) {}
    }
    window.solarProjectConfig.selectedBatteryId = batSel.value;
  }

  const catalog = (typeof window !== 'undefined' && window.equipmentCatalog) ? window.equipmentCatalog : ((typeof equipmentCatalog !== 'undefined') ? equipmentCatalog : null);
  if (!catalog) return;

  const cfgRef = window.solarProjectConfig || {};
  const inv = (catalog.inverters && catalog.inverters.find(i => i.id === cfgRef.selectedInverterId)) ||
              (cfgRef.lastVirtualInverter && cfgRef.lastVirtualInverter.id === cfgRef.selectedInverterId ? cfgRef.lastVirtualInverter : null) ||
              (catalog.inverters && catalog.inverters[0]);
  const mod = (catalog.modules && catalog.modules.find(m => m.id === cfgRef.selectedModuleId)) || (catalog.modules && catalog.modules[0]);
  const mi  = (catalog.microinverters && catalog.microinverters.find(m => m.id === cfgRef.selectedMicroinverterId)) || (catalog.microinverters && catalog.microinverters[0]);
  const bat = (catalog.batteries && catalog.batteries.find(b => b.id === cfgRef.selectedBatteryId)) || (catalog.batteries && catalog.batteries[0]);

  // Coeficientes térmicos bajo CTE / IEC 62548 unificados con RA.Electrical.calculateDynamicMPPTStringLimits
  let nMaxCold = 18;
  let nMinMppt = 5;
  if (typeof calculateDynamicMPPTStringLimits === 'function') {
    const dynLim = calculateDynamicMPPTStringLimits(mod, inv);
    nMaxCold = dynLim.Ns_max;
    nMinMppt = dynLim.Ns_min;
  } else {
    const tMin = -10;
    const tMaxCell = 70;
    const gammaVoc = -Math.abs(mod.gammaVoc || mod.betaVoc || -0.0028);
    const vOcCold = (mod.voc || 41.5) * (1 + gammaVoc * (tMin - 25));
    const vMpHot = (mod.vmp || 34.5) * (1 + gammaVoc * 1.05 * (tMaxCell - 25));
    nMaxCold = Math.floor((inv.vDcMax || 1000) / vOcCold);
    nMinMppt = Math.ceil((inv.vMpptNomMin || 180) / vMpHot);
  }
  const nMaxInvPower = Math.floor(((inv.kw || 5.0) * 1000 * (inv.maxOverload || 1.35)) / (mod.wp || 450));

  window.solarProjectConfig.calculatedLimits = {
    nMinString: Math.max(nMinMppt, 3),
    nMaxString: Math.min(nMaxCold, 24),
    nMaxTotalModules: nMaxInvPower,
    inverter: inv,
    module: mod,
    microinverter: mi,
    battery: bat
  };

  // Ejecutar inmediatamente motor de dimensionamiento automático multi-equipo
  const currentTotalPanels = (typeof lastRoofInfo !== "undefined" && lastRoofInfo && lastRoofInfo.panels) ? lastRoofInfo.panels.length : 0;
  wpComputeAutoSizing(currentTotalPanels > 0 ? currentTotalPanels : undefined);

  // Actualizar PanelConfig global para generación 3D
  if (typeof panelConfig !== 'undefined') {
    panelConfig.potencia = mod.wp || 450;
    panelConfig.largo = mod.l || 2.10;
    panelConfig.ancho = mod.w || 1.05;
    panelConfig.precio = mod.price || 115;
    panelConfig.modelo = mod.brand + ' ' + mod.model;
    panelConfig.rendimiento = mod.eff || 21.5;
    panelConfig.gammaVoc = mod.gammaVoc || -0.0028; // para Voc en frío en la memoria
  }

  const elNmax = document.getElementById('step3-spec-nmax');
  const elNmin = document.getElementById('step3-spec-nmin');
  const elTot  = document.getElementById('step3-spec-totmax');

  // Si hay un faldón activo en step4RoofScopeState, contextualizar el semáforo al faldón seleccionado
  const activeRoofIdx = (typeof window.step4RoofScopeState !== 'undefined') ? window.step4RoofScopeState.activeScope : 'all';
  let effMod = mod;
  let effInv = inv;
  let effPanelCount = null;

  if (typeof activeRoofIdx === 'number' && typeof WP !== 'undefined' && Array.isArray(WP.polylines) && WP.polylines[activeRoofIdx]) {
    const poly = WP.polylines[activeRoofIdx];
    if (poly.moduleId) {
      const spec = catalog.modules && catalog.modules.find(m => m.id === poly.moduleId);
      if (spec) effMod = spec;
    }
    if (poly.roofInfo && Array.isArray(poly.roofInfo.panels)) {
      effPanelCount = poly.roofInfo.panels.filter(x => !x.deleted).length;
    }
  }

  // Recalcular límites térmicos bajo el módulo efectivo
  let effNmax = window.solarProjectConfig.calculatedLimits.nMaxString;
  let effNmin = window.solarProjectConfig.calculatedLimits.nMinString;
  if (typeof calculateDynamicMPPTStringLimits === 'function' && effMod !== mod) {
    const dLim = calculateDynamicMPPTStringLimits(effMod, effInv);
    effNmax = dLim.Ns_max;
    effNmin = dLim.Ns_min;
  }

  if (elNmax) elNmax.textContent = 'Máx. ' + effNmax + ' placas' + (typeof activeRoofIdx === 'number' ? ` (F${activeRoofIdx + 1})` : '');
  if (elNmin) elNmin.textContent = 'Mín. ' + effNmin + ' placas' + (typeof activeRoofIdx === 'number' ? ` (F${activeRoofIdx + 1})` : '');
  if (elTot) {
    if (typeof activeRoofIdx === 'number' && effPanelCount !== null) {
      const fKwp = ((effPanelCount * (effMod.wp || 450)) / 1000).toFixed(1);
      elTot.textContent = `${effPanelCount} placas instaladas (${fKwp} kWp en F${activeRoofIdx + 1})`;
    } else {
      elTot.textContent = window.solarProjectConfig.calculatedLimits.nMaxTotalModules + ' placas (' + ((window.solarProjectConfig.calculatedLimits.nMaxTotalModules * (effMod.wp || 450)) / 1000).toFixed(1) + ' kWp)';
    }
  }

  // Verificación de Corriente Operativa Máxima Imp vs MPPT (Prevención de Clipping)
  // Se evalúa la corriente real que ingresa al canal MPPT más cargado (reparto entre MPPTs e inversores)
  const _modPanels = (typeof simulatedPanelEntities !== 'undefined' && Array.isArray(simulatedPanelEntities)) ? simulatedPanelEntities.length : 0;
  const _maxModsPerStr = (window.solarProjectConfig.calculatedLimits && window.solarProjectConfig.calculatedLimits.nMaxString) || 18;
  const _minModsPerStr = (window.solarProjectConfig.calculatedLimits && window.solarProjectConfig.calculatedLimits.nMinString) || 5;

  const _invCount = (window.solarProjectConfig && window.solarProjectConfig.autoSizing && window.solarProjectConfig.autoSizing.inverters && window.solarProjectConfig.autoSizing.inverters.count)
    ? Math.max(1, window.solarProjectConfig.autoSizing.inverters.count)
    : 1;
  const _mpptChannelsPerInv = Math.max(1, inv.mppt || 2);
  const _totalMpptChannels = _invCount * _mpptChannelsPerInv;

  let _realStrings;
  if (typeof electricalStrings !== 'undefined' && Array.isArray(electricalStrings) && electricalStrings.length > 0) {
    _realStrings = electricalStrings.length;
  } else if (typeof window.electricalStrings !== 'undefined' && Array.isArray(window.electricalStrings) && window.electricalStrings.length > 0) {
    _realStrings = window.electricalStrings.length;
  } else if (_modPanels > 0) {
    _realStrings = Math.max(1, Math.ceil(_modPanels / _maxModsPerStr));
    if (_realStrings < _totalMpptChannels && Math.floor(_modPanels / _totalMpptChannels) >= _minModsPerStr) {
      _realStrings = _totalMpptChannels;
    }
  } else {
    _realStrings = 1;
  }

  const _stringsPerMppt = Math.max(1, Math.ceil(_realStrings / _totalMpptChannels));

  const elImp = document.getElementById('step3-spec-imp-check');
  if (elImp) {
    const modImp = mod.imp || 13.0;
    const totalImp = modImp * _stringsPerMppt;
    const invImaxOper = inv.iMaxOperA || (inv.iMaxScA ? Math.round(inv.iMaxScA * 0.75 * 10) / 10 : 15.0);
    const hasClipping = totalImp > invImaxOper;
    const strLabel = _stringsPerMppt === 1 ? '1 string/MPPT' : (_stringsPerMppt + ' strings/MPPT');
    elImp.innerHTML = totalImp.toFixed(1) + ' A (' + strLabel + ') ≤ ' + invImaxOper.toFixed(1) + ' A (' + (hasClipping ? '<i data-lucide="alert-triangle" class="icon-sm"></i> CLIPPING' : 'Óptimo') + ')';
    elImp.style.color = hasClipping ? '#F59E0B' : '#10B981';
  }

  // Verificación de Seguridad de Intensidad de Cortocircuito (Isc vs Imax_inversor)
  const elIsc = document.getElementById('step3-spec-isc-check');
  if (elIsc) {
    const modIsc = mod.isc || 14.0;
    const totalIsc = modIsc * _stringsPerMppt;
    const invImaxSc = inv.iMaxScA || 30.0;
    const isSafe = totalIsc <= invImaxSc;
    const strLabel = _stringsPerMppt === 1 ? '1 string/MPPT' : (_stringsPerMppt + ' strings/MPPT');
    elIsc.innerHTML = totalIsc.toFixed(1) + ' A (' + strLabel + ') ≤ ' + invImaxSc.toFixed(1) + ' A (' + (isSafe ? 'OK' : '<i data-lucide="alert-triangle" class="icon-sm"></i> ATENCIÓN') + ')';
    elIsc.style.color = isSafe ? '#10B981' : '#EF4444';
  }

  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    try { window.lucide.createIcons(); } catch (e) {}
  }

    // Estimación de Sobrecarga Estructural en Cubierta (Normativa CTE DB-SE-AE)
  const elLoad = document.getElementById('step3-spec-roof-load');
  if (elLoad) {
    const modArea = Math.max((mod.l || 2.10) * (mod.w || 1.05), 1.0);
    const modWeightKg = (typeof mod.weightKg === 'number' && mod.weightKg > 0) ? mod.weightKg : 24.5;
    let hasBallastBlocks = false;
    let hasTriangles = false;
    let blocksCountPerPanel = 2;
    if (typeof WP !== 'undefined' && WP && Array.isArray(WP.polylines)) {
      hasBallastBlocks = WP.polylines.some(pl => pl && (pl.structureType === 'ballast_blocks' || (pl.estructura && pl.estructura.tipo === 'balasto_bloques')));
      hasTriangles = WP.polylines.some(pl => pl && pl.structureType && pl.structureType.indexOf('triangle') !== -1);
      const bPl = WP.polylines.find(pl => pl && pl.blocksPerPanel);
      if (bPl) blocksCountPerPanel = bPl.blocksPerPanel;
    }
    let blockWeight = 45.0;
    if (window.RAStructureCatalog && typeof window.RAStructureCatalog.getStructure === 'function') {
      const activeMfg = window.RAStructureCatalog.getActiveManufacturer ? window.RAStructureCatalog.getActiveManufacturer() : 'sunfer';
      const mfg = window.RAStructureCatalog.getStructure(activeMfg);
      if (mfg && typeof mfg.ballastBlockWeightKg === 'number') blockWeight = mfg.ballastBlockWeightKg;
    }
    const structWeightPerMod = hasBallastBlocks
      ? (blocksCountPerPanel * blockWeight + 1.0)
      : (hasTriangles ? (2 * blockWeight + 6.5) : 3.5);
    const kgPerM2 = (modWeightKg + structWeightPerMod) / modArea;
    const isOverCTE = kgPerM2 > 100.0;
    const isWarningCTE = kgPerM2 > 50.0;
    const statusText = isOverCTE ? 'Excede CTE (>100 kg/m²)' : (isWarningCTE ? 'Requiere Verificación CTE' : 'Admisible CTE');
    const statusColor = isOverCTE ? '#EF4444' : (isWarningCTE ? '#F59E0B' : '#38BDF8');
    elLoad.textContent = '~' + kgPerM2.toFixed(1) + ' kg/m² (' + statusText + ')';
    elLoad.style.color = statusColor;
  }

  // <i data-lucide="rocket" class="icon-sm"></i> Reactividad 3D: Sólo regenerar layout y faldones si el módulo fotovoltaico ha cambiado realmente
  const hasPolys = typeof WP !== 'undefined' && WP && WP.polylines && WP.polylines.some(pl => pl && pl.points && pl.points.length >= 3);
  const hasPolyPoints = typeof polygonPoints !== 'undefined' && polygonPoints && polygonPoints.length >= 3;
  if (moduleActuallyChanged && (hasPolys || hasPolyPoints)) {
    if (typeof roofPanelsCache !== 'undefined' && roofPanelsCache) roofPanelsCache.sig = "";
    if (hasPolys && typeof computeSinglePolylineRoofInfo === 'function') {
      WP.polylines.forEach(poly => {
        if (poly && poly.points && poly.points.length >= 3) {
          poly.roofInfo = computeSinglePolylineRoofInfo(poly.points, poly);
        }
      });
    }
    if (typeof window.wpInvalidateHeatmap === 'function') {
      window.wpInvalidateHeatmap('Módulo FV modificado');
    }
    const prevConfirmed = (typeof isPolygonDesignConfirmed !== 'undefined') ? isPolygonDesignConfirmed : false;
    isPolygonDesignConfirmed = true; // Habilita temporalmente el paso de renderizado
    if (typeof wpFastRenderSimulatedPanels === 'function') {
      wpFastRenderSimulatedPanels();
    }
    if (typeof wpCalculateAndRenderInverterCables === 'function') {
      wpCalculateAndRenderInverterCables();
    }
    isPolygonDesignConfirmed = prevConfirmed;
    if (typeof wpUpdateStep3UI === 'function') {
      wpUpdateStep3UI();
    }
  } else {
    // Si no cambió el módulo (ej. cambio de inversor/batería o navegación a Paso 4),
    // preservamos íntegramente poly.roofInfo y la caché del mapa de calor anual,
    // pero actualizamos los strings asignados y latiguillos inter-módulo
    if (typeof rebalanceMPPTAssignment === 'function') {
      rebalanceMPPTAssignment();
    }
    if (typeof renderSimulatedPanels === 'function' && typeof simulatedPanelEntities !== 'undefined' && simulatedPanelEntities.length > 0) {
      renderSimulatedPanels();
    }
    if (typeof wpCalculateAndRenderInverterCables === 'function') {
      wpCalculateAndRenderInverterCables();
    } else if (window.RACableEngine && typeof window.RACableEngine.redrawAll === 'function') {
      window.RACableEngine.redrawAll();
    }
    if (typeof wpUpdateStep3UI === 'function') {
      wpUpdateStep3UI();
    }
  }

  // Actualizar batería 3D si el inversor ya está colocado en la escena
  if (typeof window.wpRenderBattery3D === 'function') {
    window.wpRenderBattery3D();
  }

  // <i data-lucide=\"lightbulb\" class=\"icon-sm\"></i> Actualizar tarjeta de razonamiento de equipos para cliente/ingeniero
  if (typeof EngineeringExplainer !== 'undefined' && typeof EngineeringExplainer.renderEquipmentJustificationUI === 'function') {
    EngineeringExplainer.renderEquipmentJustificationUI('step3-engineering-explainer-container');
  }
  if (typeof wpUpdateInverterSmartAssistantUI === 'function') {
    wpUpdateInverterSmartAssistantUI();
  }
  if (typeof wpRefreshAutoEngineeringBanner === 'function') {
    wpRefreshAutoEngineeringBanner();
  }
  if (typeof wpUpdateStep4Checklist === 'function') {
    wpUpdateStep4Checklist();
  }
  if (typeof updateBudgetUI === 'function') {
    updateBudgetUI();
  }
  if (typeof BOMTreeEngine !== 'undefined' && typeof BOMTreeEngine.refresh === 'function') {
    BOMTreeEngine.refresh();
  }
  if (typeof ProjectHierarchy !== 'undefined' && typeof ProjectHierarchy.notify === 'function') {
    ProjectHierarchy.notify('electrical_updated');
  }
  if (typeof WorkflowOrchestrator !== 'undefined' && typeof WorkflowOrchestrator.refreshGating === 'function') {
    WorkflowOrchestrator.refreshGating();
  }
}
window.step3UpdateHardwareSelection = step3UpdateHardwareSelection;

function wpUpdateStep4Checklist() {
  const chkInv = document.getElementById('step4-chk-inverter');
  const chkStr = document.getElementById('step4-chk-strings');
  const chkRebt = document.getElementById('step4-chk-rebt');
  if (!chkInv && !chkStr && !chkRebt) return;

  const cfg = window.solarProjectConfig || {};
  const catalog = (typeof window !== 'undefined' && window.equipmentCatalog) ? window.equipmentCatalog : ((typeof equipmentCatalog !== 'undefined') ? equipmentCatalog : null);
  
  if (chkInv) {
    if (cfg.selectedTopology === 'microinverter') {
      const mi = catalog && catalog.microinverters && catalog.microinverters.find(i => i.id === cfg.selectedMicroinverterId);
      const miCount = (cfg.autoSizing && cfg.autoSizing.microinverters && cfg.autoSizing.microinverters.count) || 1;
      const totalKw = (mi ? mi.kw : 0.8) * miCount;
      chkInv.textContent = '✓ MLPE: ' + miCount + ' uds (' + totalKw.toFixed(1) + ' kW)';
      chkInv.style.color = '#10B981';
      chkInv.style.background = 'rgba(16,185,129,0.15)';
      chkInv.style.borderColor = 'rgba(16,185,129,0.3)';
    } else {
      const inv = catalog && catalog.inverters && catalog.inverters.find(i => i.id === cfg.selectedInverterId);
      const invCount = (cfg.autoSizing && cfg.autoSizing.inverters && cfg.autoSizing.inverters.count) || 1;
      if (inv) {
        chkInv.textContent = (invCount > 1 ? '✓ Inversores: ' + invCount + 'x ' + inv.kw + ' kW' : '✓ Inversor: ' + (inv.kw || 5.0) + ' kW');
        chkInv.style.color = '#10B981';
        chkInv.style.background = 'rgba(16,185,129,0.15)';
        chkInv.style.borderColor = 'rgba(16,185,129,0.3)';
      } else {
        chkInv.textContent = '⚡ Inversor Pendiente';
        chkInv.style.color = '#F59E0B';
        chkInv.style.background = 'rgba(245,158,11,0.15)';
        chkInv.style.borderColor = 'rgba(245,158,11,0.3)';
      }
    }
  }

  if (chkStr) {
    if (cfg.selectedTopology === 'microinverter') {
      chkStr.textContent = '✓ MLPE 2-en-1 (Sin Strings DC)';
      chkStr.style.color = '#10B981';
      chkStr.style.background = 'rgba(16,185,129,0.15)';
      chkStr.style.borderColor = 'rgba(16,185,129,0.3)';
      chkStr.title = '';
    } else if (cfg.mpptHomogeneity && !cfg.mpptHomogeneity.valid && cfg.mpptHomogeneity.violations && cfg.mpptHomogeneity.violations.length > 0) {
      chkStr.textContent = '⚠️ Incompatibilidad MPPT (' + cfg.mpptHomogeneity.violations.length + ')';
      chkStr.style.color = '#EF4444';
      chkStr.style.background = 'rgba(239,68,68,0.15)';
      chkStr.style.borderColor = 'rgba(239,68,68,0.3)';
      chkStr.title = cfg.mpptHomogeneity.violations.map(v => v.msg).join('\n');
    } else {
      const limits = cfg.calculatedLimits;
      if (limits && limits.nMaxString >= (limits.nMinString || 5)) {
        chkStr.textContent = '✓ Strings: ' + limits.nMinString + '-' + limits.nMaxString + ' mods';
        chkStr.style.color = '#10B981';
        chkStr.style.background = 'rgba(16,185,129,0.15)';
        chkStr.style.borderColor = 'rgba(16,185,129,0.3)';
        chkStr.title = '';
      } else {
        chkStr.textContent = '📏 Strings MPPT';
        chkStr.style.color = '#38BDF8';
        chkStr.style.background = 'rgba(56,189,248,0.15)';
        chkStr.style.borderColor = 'rgba(56,189,248,0.3)';
        chkStr.title = '';
      }
    }
  }

  if (chkRebt) {
    const sState = (typeof window !== 'undefined' && window.inverterEquipmentState) ? window.inverterEquipmentState : null; const dVdc = (sState && Number.isFinite(sState.dV_dc_pct)) ? sState.dV_dc_pct : 0.8; const dVac = (sState && Number.isFinite(sState.dV_ac_pct)) ? sState.dV_ac_pct : 0.6; const globalCheck = (typeof calculateGlobalVoltageDrop === 'function') ? calculateGlobalVoltageDrop(dVdc, dVac) : { totalPct: Math.round((dVdc + dVac) * 100) / 100, valid: (dVdc + dVac) <= 2.5 }; const totalDropPct = Number.isFinite(globalCheck.totalPct) ? globalCheck.totalPct : (dVdc + dVac); const dcFail = Boolean((sState && sState.dcNonCompliantWarning) || (dVdc > 1.5)); const acFail = Boolean((sState && sState.acNonCompliantWarning) || (dVac > 1.5)); const globalFail = Boolean((sState && sState.globalNonCompliantWarning) || !globalCheck.valid || (totalDropPct > 2.5)); if (dcFail || acFail) { chkRebt.textContent = '⚠️ REBT: ΔV > 1.5% (DC ' + dVdc.toFixed(1) + '% / AC ' + dVac.toFixed(1) + '%)'; chkRebt.style.color = '#EF4444'; chkRebt.style.background = 'rgba(239,68,68,0.15)'; chkRebt.style.borderColor = 'rgba(239,68,68,0.35)'; chkRebt.title = 'Incumplimiento REBT ITC-BT-40: caída de tensión en tramo supera el 1.5% máximo admisible.'; } else if (globalFail) { chkRebt.textContent = '⚠️ REBT: ΔV Total ' + totalDropPct.toFixed(1) + '% > 2.5%'; chkRebt.style.color = '#F59E0B'; chkRebt.style.background = 'rgba(245,158,11,0.15)'; chkRebt.style.borderColor = 'rgba(245,158,11,0.35)'; chkRebt.title = 'Advertencia REBT ITC-BT-40 / IDAE: la caída de tensión acumulada DC + AC (' + totalDropPct.toFixed(2) + '%) supera el 2.5% recomendado.'; } else { chkRebt.textContent = '✓ REBT: ΔV ≤ 1.5% (Total ' + totalDropPct.toFixed(1) + '%)'; chkRebt.style.color = '#10B981'; chkRebt.style.background = 'rgba(16,185,129,0.15)'; chkRebt.style.borderColor = 'rgba(16,185,129,0.3)'; chkRebt.title = ''; } return;
    chkRebt.style.color = '#10B981';
    chkRebt.style.background = 'rgba(16,185,129,0.15)';
    chkRebt.style.borderColor = 'rgba(16,185,129,0.3)';
  }
}
window.wpUpdateStep4Checklist = wpUpdateStep4Checklist;

function wpComputeAutoSizing(forcedCount) {
  let count = (typeof forcedCount === 'number' && forcedCount > 0) ? forcedCount : 0;
  if (count === 0 && typeof window !== 'undefined' && Array.isArray(window.allRenderedPanels) && window.allRenderedPanels.length > 0) {
    count = window.allRenderedPanels.filter(p => p && !p.deleted).length;
  }
  if (count === 0) {
    if (typeof WP !== 'undefined' && WP && WP.polylines && WP.polylines.length > 0) {
      WP.polylines.forEach(p => {
        // Conteo perezoso: si roofInfo no está en cache (p.ej. primer arranque del
        // Paso 4 tras restaurar sesion), se calcula al vuelo. Antes caia al fallback
        // lastEstimatedPanels y recomendaba N inverters de un proyecto anterior.
        const pInfo = p.roofInfo || (typeof computeSinglePolylineRoofInfo === 'function' ? computeSinglePolylineRoofInfo(p.points, p) : null);
        if (pInfo && pInfo.panels) count += pInfo.panels.length;
      });
    }
  }
  if (count === 0 && typeof lastRoofInfo !== 'undefined' && lastRoofInfo && lastRoofInfo.panels) {
    count = lastRoofInfo.panels.length;
  }
  if (count === 0 && typeof simulatedPanelEntities !== 'undefined' && simulatedPanelEntities.length > 0) {
    count = simulatedPanelEntities.length;
  }
  if (count === 0) {
    count = window.solarProjectConfig.lastEstimatedPanels || 1;
  } else {
    window.solarProjectConfig.lastEstimatedPanels = count;
  }

  const catalog = (typeof window !== 'undefined' && window.equipmentCatalog) ? window.equipmentCatalog : ((typeof equipmentCatalog !== 'undefined') ? equipmentCatalog : null);
  if (!catalog) return;

  const cfg = window.solarProjectConfig;
  const mod = (catalog.modules && catalog.modules.find(m => m.id === cfg.selectedModuleId)) || (catalog.modules && catalog.modules[0]) || { wp: 450, brand: 'Tier-1', model: 'Mono' };
  const inv = (catalog.inverters && catalog.inverters.find(i => i.id === cfg.selectedInverterId)) ||
              (cfg.lastVirtualInverter && cfg.lastVirtualInverter.id === cfg.selectedInverterId ? cfg.lastVirtualInverter : null) ||
              (catalog.inverters && catalog.inverters[0]) || { kw: 5.0, maxOverload: 1.35 };
  const mi  = (catalog.microinverters && catalog.microinverters.find(m => m.id === cfg.selectedMicroinverterId)) || (catalog.microinverters && catalog.microinverters[0]) || { model: '', type: '' };
  const bat = (catalog.batteries && catalog.batteries.find(b => b.id === cfg.selectedBatteryId)) || (catalog.batteries && catalog.batteries[0]) || { kwh: 0 };

  const totalKwp = (count * (mod.wp || 450)) / 1000.0;

  // 1. Inversores String Requeridos (unificado con matchInvertersFromCatalog: maxOverload || 1.35):
  const invNomKw = inv.kw || 5.0;
  const maxOverloadRatio = inv.maxOverload || 1.35;
  const maxKwInput = invNomKw * maxOverloadRatio;
  const autoInvertersByPower = Math.max(1, Math.ceil(totalKwp / maxKwInput));

  // 1b. Verificación de Canales MPPT Físicos, Simetría de Longitud (ΔN = 0) e Incompatibilidad de Orientación (IEC 62548 / REBT)
  let autoInvertersByMppt = 1;
  try {
    const invMppt = (inv && Number.isFinite(inv.mppt) && inv.mppt > 0) ? inv.mppt : 2;
    const rawInputs = (inv && Number.isFinite(inv.inputsPerMppt) && inv.inputsPerMppt > 0) ? inv.inputsPerMppt : 1;
    const iscLimitInputs = (inv && inv.iMaxScA) ? Math.max(1, Math.floor(inv.iMaxScA / ((mod.isc || 14.0) * 1.25))) : rawInputs;
    const invInputs = Math.max(1, Math.min(rawInputs, iscLimitInputs));

    let targetPanels = null;
    if (typeof window !== 'undefined') {
      if (Array.isArray(window.allRenderedPanels) && window.allRenderedPanels.length > 0) {
        targetPanels = window.allRenderedPanels.filter(p => p && !p.deleted);
      } else if (typeof WP !== 'undefined' && WP && Array.isArray(WP.polylines)) {
        const collected = [];
        WP.polylines.forEach(pl => {
          const arr = (pl && pl.roofInfo && Array.isArray(pl.roofInfo.panels)) ? pl.roofInfo.panels : (pl && Array.isArray(pl.panels) ? pl.panels : null);
          if (arr) arr.forEach(p => collected.push(p));
        });
        if (collected.length > 0) targetPanels = collected;
      }
    }

    if (Array.isArray(targetPanels) && targetPanels.length > 0) {
      const stringsMap = new Map();
      targetPanels.forEach(p => {
        if (!p) return;
        const sName = p.stringName || ('faldon_' + (p.polyIdx != null ? p.polyIdx : 0));
        if (!stringsMap.has(sName)) {
          let tilt = typeof p.tiltDeg === 'number' ? p.tiltDeg : null;
          let az = typeof p.azimuthDeg === 'number' ? p.azimuthDeg : null;
          if ((tilt == null || az == null) && typeof window !== 'undefined' && window.WP && Array.isArray(window.WP.polylines)) {
            const poly = window.WP.polylines[p.polyIdx];
            if (poly) {
              if (tilt == null) tilt = (poly.roofInfo && typeof poly.roofInfo.tiltDeg === 'number') ? poly.roofInfo.tiltDeg : (poly.tiltDeg || 0);
              if (az == null) az = (poly.roofInfo && typeof poly.roofInfo.azimuthDeg === 'number') ? poly.roofInfo.azimuthDeg : (poly.azimuthDeg || 0);
            }
          }
          stringsMap.set(sName, {
            tilt: typeof tilt === 'number' && !isNaN(tilt) ? tilt : 0,
            az: typeof az === 'number' && !isNaN(az) ? az : 0,
            count: 0
          });
        }
        stringsMap.get(sName).count++;
      });

      // Agrupar strings por orientación homogénea (Δβ <= 5°, Δγ <= 10°) Y longitud idéntica (ΔN = 0, IEC 62548)
      const orientationGroups = [];
      stringsMap.forEach(str => {
        let matched = null;
        for (const grp of orientationGroups) {
          const dTilt = Math.abs(grp.tilt - str.tilt);
          let dAz = Math.abs(grp.az - str.az);
          if (dAz > 180) dAz = 360 - dAz;
          if (dTilt <= 5.0 && dAz <= 10.0 && grp.panelCount === str.count) {
            matched = grp;
            break;
          }
        }
        if (matched) {
          matched.stringsCount++;
        } else {
          orientationGroups.push({
            tilt: str.tilt,
            az: str.az,
            panelCount: str.count,
            stringsCount: 1
          });
        }
      });

      let totalMpptsNeeded = 0;
      let totalStringsCount = 0;
      orientationGroups.forEach(grp => {
        totalMpptsNeeded += Math.max(1, Math.ceil(grp.stringsCount / invInputs));
        totalStringsCount += grp.stringsCount;
      });

      if (totalMpptsNeeded > 0) {
        autoInvertersByMppt = Math.max(1, Math.ceil(totalMpptsNeeded / invMppt));
      }
      const maxStringsPerInv = invMppt * invInputs;
      const autoInvertersByInputs = (maxStringsPerInv > 0) ? Math.max(1, Math.ceil(totalStringsCount / maxStringsPerInv)) : 1;

      autoInvertersByMppt = Math.max(autoInvertersByMppt, autoInvertersByInputs);
    }
  } catch (errMppt) {
    console.warn('[RA-AutoSizing] Error al evaluar canales MPPT:', errMppt);
  }

  const autoInverters = Math.max(autoInvertersByPower, autoInvertersByMppt);

  // 2. Microinversores MLPE:
  let ratio = 1;
  const miTxt = ((mi && mi.model ? mi.model : '') + ' ' + (mi && mi.type ? mi.type : '')).toLowerCase();
  if (miTxt.includes('2-en-1') || miTxt.includes('2 módulos') || miTxt.includes('800')) ratio = 2;
  else if (miTxt.includes('4-en-1') || miTxt.includes('4 módulos') || miTxt.includes('1600')) ratio = 4;
  const autoMicros = Math.max(1, Math.ceil(count / ratio));

  // 3. Baterías LFP:
  let autoBats = 0;
  if (bat && bat.kwh && bat.kwh > 0 && bat.id !== 'bat_none') {
    autoBats = Math.max(1, Math.ceil(totalKwp / bat.kwh));
  }

  // Actualizar estado en autoSizing
  if (!cfg.autoSizing) cfg.autoSizing = {};
  if (!cfg.autoSizing.inverters) cfg.autoSizing.inverters = { count: 1, autoCount: 1, isManual: false };
  if (!cfg.autoSizing.microinverters) cfg.autoSizing.microinverters = { count: 0, autoCount: 0, isManual: false };
  if (!cfg.autoSizing.batteries) cfg.autoSizing.batteries = { count: autoBats, autoCount: autoBats, isManual: false };

  const prevInvCount = cfg.autoSizing.inverters.count;
  cfg.autoSizing.inverters.autoCount = autoInverters;
  if (!cfg.autoSizing.inverters.isManual || cfg.autoSizing.inverters.count > autoInverters * 2 || autoInverters > cfg.autoSizing.inverters.count * 3) {
    if (cfg.autoSizing.inverters.isManual && cfg.autoSizing.inverters.count !== autoInverters) {
      console.log('[RA-AutoSizing] Auto-resetting manual inverter count due to drastic layout change');
      cfg.autoSizing.inverters.isManual = false;
    }
    cfg.autoSizing.inverters.count = autoInverters;
  }
  if (prevInvCount !== cfg.autoSizing.inverters.count) {
    const rebFn = (typeof rebalanceMPPTAssignment === 'function')
      ? rebalanceMPPTAssignment
      : (typeof window !== 'undefined' && window.RA && window.RA.Electrical && typeof window.RA.Electrical.rebalanceMPPTAssignment === 'function' ? window.RA.Electrical.rebalanceMPPTAssignment : null);
    if (rebFn) rebFn();
  }

  cfg.autoSizing.microinverters.autoCount = autoMicros;
  if (!cfg.autoSizing.microinverters.isManual || cfg.autoSizing.microinverters.count > autoMicros * 2 || autoMicros > cfg.autoSizing.microinverters.count * 3) {
    if (cfg.autoSizing.microinverters.isManual && cfg.autoSizing.microinverters.count !== autoMicros) {
      cfg.autoSizing.microinverters.isManual = false;
    }
    cfg.autoSizing.microinverters.count = autoMicros;
  }

  cfg.autoSizing.batteries.autoCount = autoBats;
  if (!cfg.autoSizing.batteries.isManual || cfg.autoSizing.batteries.count === 0 || cfg.autoSizing.batteries.count > autoBats * 2 || autoBats > cfg.autoSizing.batteries.count * 3) {
    if (cfg.autoSizing.batteries.isManual && cfg.autoSizing.batteries.count !== autoBats) {
      cfg.autoSizing.batteries.isManual = false;
    }
    cfg.autoSizing.batteries.count = autoBats;
  }

  // Renderizar feedback visual en Step 3
  step3RenderAutoSizingUI(count, totalKwp, mod, inv, mi, bat, maxKwInput, ratio);

  // Sincronizar coste con el presupuesto financiero
  step3SyncBudgetHardwareCosts(inv, mi, bat);
}

function step3RenderAutoSizingUI(count, totalKwp, mod, inv, mi, bat, maxKwInput, ratio) {
  const cfg = window.solarProjectConfig;
  const topo = cfg.selectedTopology || 'inverter';

  const badgePanels = document.getElementById('step3-autosize-panels-badge');
  if (badgePanels) badgePanels.textContent = count + ' Placas · ' + totalKwp.toFixed(2) + ' kWp';

  // 1. Inversores
  const inputInv = document.getElementById('step3-qty-inverters');
  const explainInv = document.getElementById('step3-explain-inverters');
  const btnAutoInv = document.getElementById('step3-auto-btn-inverters');

  const invCount = cfg.autoSizing.inverters.count;
  const invAuto = cfg.autoSizing.inverters.autoCount;
  const invIsMan = cfg.autoSizing.inverters.isManual;

  if (inputInv) inputInv.value = invCount;
  if (btnAutoInv) { btnAutoInv.style.display = 'inline-block'; btnAutoInv.style.opacity = invIsMan ? '1' : '0.4'; btnAutoInv.title = invIsMan ? 'Restaurar cálculo automático' : 'El cálculo ya es automático'; }
  if (explainInv) {
    const panelsPerInv = Math.ceil(count / Math.max(1, invCount));
    const totalMppts = (inv.mppt || 2) * invCount;
    let warningHtml = '';
    const maxTotalInput = (maxKwInput || 6.5) * invCount;
    if (totalKwp > maxTotalInput) {
      warningHtml = '<br><span style="color:var(--rose-400);font-size: 10px;font-weight:bold;margin-top:2px;display:inline-block;"><i data-lucide="alert-triangle" class="icon-sm"></i> PELIGRO REBT/IEC: Sobrecarga DC/AC (' + totalKwp.toFixed(2) + ' kWp &gt; ' + maxTotalInput.toFixed(2) + ' kW máx). ¡Añada inversores!</span>';
      if (inputInv) { inputInv.style.borderColor = 'var(--rose-500)'; inputInv.style.color = 'var(--rose-400)'; }
    } else {
      if (inputInv) { inputInv.style.borderColor = ''; inputInv.style.color = ''; }
    }
    if (invIsMan) {
      explainInv.innerHTML = '<span style="color:var(--sky-400);font-weight:bold;"><i data-lucide=\"edit-2\" class=\"icon-sm\"></i> MANUAL: ' + invCount + ' uds</span> (Auto calculó ' + invAuto + ' uds · ' + panelsPerInv + ' placas/inv en ' + totalMppts + ' MPPTs)' + warningHtml;
    } else {
      explainInv.innerHTML = '<span style="color:var(--emerald-400);font-weight:bold;"><i data-lucide=\"zap\" class=\"icon-sm\"></i> AUTO: ' + invCount + ' ' + (invCount === 1 ? 'inversor' : 'inversores') + '</span> (' + totalKwp.toFixed(2) + ' kWp / ' + (maxKwInput || 6.5).toFixed(2) + ' kWp máx · ' + panelsPerInv + ' placas/inv en ' + totalMppts + ' MPPTs)' + warningHtml;
    }
  }

  // 2. Microinversores
  const inputMi = document.getElementById('step3-qty-microinverters');
  const explainMi = document.getElementById('step3-explain-microinverters');
  const btnAutoMi = document.getElementById('step3-auto-btn-microinverters');

  const miCount = cfg.autoSizing.microinverters.count;
  const miAuto = cfg.autoSizing.microinverters.autoCount;
  const miIsMan = cfg.autoSizing.microinverters.isManual;

  if (inputMi) inputMi.value = miCount;
  if (btnAutoMi) { btnAutoMi.style.display = 'inline-block'; btnAutoMi.style.opacity = miIsMan ? '1' : '0.4'; btnAutoMi.title = miIsMan ? 'Restaurar cálculo automático' : 'El cálculo ya es automático'; }
  if (explainMi) {
    let miWarningHtml = '';
    const maxPanels = miCount * ratio;
    if (count > maxPanels) {
      miWarningHtml = '<br><span style="color:var(--rose-400);font-size: 10px;font-weight:bold;margin-top:2px;display:inline-block;"><i data-lucide="alert-triangle" class="icon-sm"></i> PELIGRO IEC: Faltan entradas (' + count + ' placas &gt; ' + maxPanels + ' permitidas). ¡Añada equipos!</span>';
      if (inputMi) { inputMi.style.borderColor = 'var(--rose-500)'; inputMi.style.color = 'var(--rose-400)'; }
    } else {
      if (inputMi) { inputMi.style.borderColor = ''; inputMi.style.color = ''; }
    }
    if (miIsMan) {
      explainMi.innerHTML = '<span style="color:var(--sky-400);font-weight:bold;"><i data-lucide=\"edit-2\" class=\"icon-sm\"></i> MANUAL: ' + miCount + ' uds</span> (Auto calculó ' + miAuto + ' uds)' + miWarningHtml;
    } else {
      explainMi.innerHTML = '<span style="color:var(--emerald-400);font-weight:bold;"><i data-lucide=\"zap\" class=\"icon-sm\"></i> AUTO: ' + miCount + ' uds</span> (' + ratio + ' placas por microinversor)' + miWarningHtml;
    }
  }

  // 3. Baterías
  const inputBat = document.getElementById('step3-qty-batteries');
  const explainBat = document.getElementById('step3-explain-batteries');
  const btnAutoBat = document.getElementById('step3-auto-btn-batteries');

  const batCount = cfg.autoSizing.batteries.count;
  const batAuto = cfg.autoSizing.batteries.autoCount;
  const batIsMan = cfg.autoSizing.batteries.isManual;

  if (inputBat) inputBat.value = batCount;
  if (btnAutoBat) { btnAutoBat.style.display = 'inline-block'; btnAutoBat.style.opacity = batIsMan ? '1' : '0.4'; btnAutoBat.title = batIsMan ? 'Restaurar cálculo automático' : 'El cálculo ya es automático'; }
  if (explainBat) {
    if (!bat || bat.kwh === 0) {
      explainBat.innerHTML = '<span style="color:var(--text-slate-400);">Sin acumulación electroquímica seleccionada (0 kWh).</span>';
    } else {
      const totStorage = (batCount * bat.kwh).toFixed(1);
      if (batIsMan) {
        explainBat.innerHTML = '<span style="color:var(--sky-400);font-weight:bold;"><i data-lucide=\"edit-2\" class=\"icon-sm\"></i> MANUAL: ' + batCount + ' ' + (batCount === 1 ? 'módulo' : 'módulos') + '</span> (' + totStorage + ' kWh · Auto calculó ' + batAuto + ' uds)';
      } else {
        explainBat.innerHTML = '<span style="color:var(--emerald-400);font-weight:bold;"><i data-lucide=\"zap\" class=\"icon-sm\"></i> AUTO: ' + batCount + ' ' + (batCount === 1 ? 'módulo' : 'módulos') + '</span> (' + totStorage + ' kWh recomendados · ~1 kWh/kWp)';
      }
    }
  }

  // Actualizar resúmenes vivos de inversor y batería en selectores
  const invSummaryEl = document.getElementById('step3-inverter-live-summary');
  if (invSummaryEl && inv) {
    const totAcKw = (invCount * (inv.kw || 10.0)).toFixed(1);
    const totMppts = (inv.mppt || 2) * invCount;
    invSummaryEl.innerHTML = '<span style="color:#38BDF8;font-weight:700;">' + invCount + 'x ' + (invCount > 1 ? 'Inversores' : 'Inversor') + '</span><span style="color:#94a3b8;">' + totAcKw + ' kW AC total · ' + totMppts + ' MPPTs</span>';
  }

  const batSummaryEl = document.getElementById('step3-battery-live-summary');
  if (batSummaryEl) {
    if (bat && bat.kwh > 0 && batCount > 0) {
      const totKwh = (batCount * bat.kwh).toFixed(1);
      batSummaryEl.innerHTML = '<span style="color:#34D399;font-weight:700;">' + batCount + 'x ' + (batCount > 1 ? 'Módulos' : 'Módulo') + '</span><span style="color:#94a3b8;">' + totKwh + ' kWh total LFP</span>';
    } else {
      batSummaryEl.innerHTML = '<span style="color:#94a3b8;">Conexión directa (Sin batería)</span>';
    }
  }

  // 4. Coste total equipos
  const costEl = document.getElementById('step3-total-hardware-cost');
  if (costEl) {
    let totCost = 0;
    if (topo === 'microinverter') {
      totCost += miCount * (mi.price || 125);
    } else {
      totCost += invCount * (inv.price || 1200);
      if (topo === 'optimizer') {
        totCost += count * 65; // Optimizadores DC
      }
    }
    if (bat && bat.kwh > 0) {
      totCost += batCount * (bat.price || 2400);
    }
    costEl.textContent = Math.round(totCost).toLocaleString('es-ES') + ' €';
  }

  // Actualizar resumen en vivo de Optimizadores
  const optSummaryEl = document.getElementById('step3-optimizer-live-summary');
  if (optSummaryEl) {
    if (topo === 'optimizer') {
      const optCostTot = count * 65;
      optSummaryEl.innerHTML = '<span style="color:#FBBF24;font-weight:700;">' + count + 'x Optimizadores (1 por panel)</span><span style="color:#94a3b8;">' + optCostTot.toLocaleString('es-ES') + ' € · Mitigación total sombras</span>';
    } else {
      optSummaryEl.innerHTML = '';
    }
  }

  // Renderizar Rack de Electrónica & MLPE Activo
  if (typeof wpRenderElectronicsRackUI === 'function') {
    wpRenderElectronicsRackUI();
  }

  if (typeof window !== 'undefined' && window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

function wpStepQuantity(type, delta) {
  const cfg = window.solarProjectConfig;
  if (!cfg.autoSizing || !cfg.autoSizing[type]) return;

  const current = cfg.autoSizing[type].count;
  const minVal = (type === 'batteries' || type === 'microinverters') ? 0 : 1;
  const nextVal = Math.max(minVal, current + delta);

  cfg.autoSizing[type].count = nextVal;
  cfg.autoSizing[type].isManual = true;

  wpComputeAutoSizing();
  showStatus('CANTIDAD DE ' + type.toUpperCase() + ' AJUSTADA: ' + nextVal + ' UDS', 2000);
}

function wpSetManualQuantity(type, val) {
  const cfg = window.solarProjectConfig;
  if (!cfg.autoSizing || !cfg.autoSizing[type]) return;

  const minVal = (type === 'batteries' || type === 'microinverters') ? 0 : 1;
  const nextVal = Math.max(minVal, parseInt(val, 10) || minVal);

  cfg.autoSizing[type].count = nextVal;
  cfg.autoSizing[type].isManual = true;

  wpComputeAutoSizing();
}

function wpResetAutoSizing(type) {
  const cfg = window.solarProjectConfig;
  if (!cfg.autoSizing || !cfg.autoSizing[type]) return;

  cfg.autoSizing[type].isManual = false;
  cfg.autoSizing[type].count = cfg.autoSizing[type].autoCount;

  wpComputeAutoSizing();
  showStatus('DIMENSIONAMIENTO AUTOMÁTICO RESTAURADO PARA ' + type.toUpperCase(), 2000);
}

function step3SyncBudgetHardwareCosts(inv, mi, bat) {
  const cfg = window.solarProjectConfig;
  const topo = cfg.selectedTopology || 'inverter';

  const invCostEl = document.getElementById('cfg-pres-inv');
  const batCostEl = document.getElementById('cfg-pres-bat');
  const rowBat = document.getElementById('row-bat-cost');

  let totalInvCost = 0;
  if (topo === 'microinverter') {
    const miCount = (cfg.autoSizing && cfg.autoSizing.microinverters) ? cfg.autoSizing.microinverters.count : 0;
    totalInvCost = miCount * (mi.price || 125);
  } else {
    const invCount = (cfg.autoSizing && cfg.autoSizing.inverters) ? cfg.autoSizing.inverters.count : 1;
    totalInvCost = invCount * (inv.price || 1200);
  }

  const batCount = (cfg.autoSizing && cfg.autoSizing.batteries) ? Math.max(1, cfg.autoSizing.batteries.count) : 1;
  const hasValidBat = (bat && bat.id !== 'bat_none' && (bat.kwh > 0 || bat.price > 0));
  const totalBatCost = hasValidBat ? (batCount * (bat.price || 0)) : 0;

  if (invCostEl) invCostEl.value = Math.round(totalInvCost);
  if (batCostEl) batCostEl.value = Math.round(totalBatCost);
  const modalBatCostEl = document.getElementById('modal-cfg-pres-bat');
  if (modalBatCostEl) modalBatCostEl.value = Math.round(totalBatCost);
  const modalBatOpt = document.getElementById('modal-cfg-pres-bat-opt');
  if (modalBatOpt && bat) {
    if (bat.id === 'bat_none' || !bat.kwh) modalBatOpt.value = '0';
    else if (bat.kwh <= 6) modalBatOpt.value = '5';
    else if (bat.kwh <= 12) modalBatOpt.value = '10';
    else modalBatOpt.value = '15';
  }
  const modalBatCostRow = document.getElementById('modal-row-bat-cost');
  if (modalBatCostRow) modalBatCostRow.style.display = totalBatCost > 0 ? 'flex' : 'none';
  if (rowBat) rowBat.style.display = totalBatCost > 0 ? 'flex' : 'none';

  if (typeof updateBudgetUI === 'function') {
    updateBudgetUI();
  }
}

// <i data-lucide=\"rocket\" class=\"icon-sm\"></i> PREVISUALIZACIÓN RÁPIDA 3D DESDE EL PASO 3 Y 4
function wpQuickPreview3DFromStep3() {
  const hasPolys = typeof WP !== 'undefined' && WP && WP.polylines && WP.polylines.length > 0;
  if (!hasPolys && (!polygonPoints || polygonPoints.length < 3)) {
    showStatus('<i data-lucide=\"alert-triangle\" class=\"icon-sm\"></i> TRAZA PRIMERO UN FALDÓN EN EL PASO 1 (EMPLAZAMIENTO)', 3000);
    if (typeof showToast === 'function') showToast('SIN CONTORNO', 'Dibuja al menos un faldón en el Paso 1 (Emplazamiento) para previsualizar en 3D.', 'warning', 3000);
    return;
  }

  // Forzar regeneración del layout fotovoltaico temporal con confirmación
  const prevConfirmed = (typeof isPolygonDesignConfirmed !== 'undefined') ? isPolygonDesignConfirmed : false;
  isPolygonDesignConfirmed = true;

  if (typeof recalculateLayoutAndObstacles === 'function') recalculateLayoutAndObstacles();
  if (typeof wpFastRenderSimulatedPanels === 'function') wpFastRenderSimulatedPanels();
  if (typeof wpCalculateAndRenderInverterCables === 'function') wpCalculateAndRenderInverterCables();

  isPolygonDesignConfirmed = prevConfirmed; // Mantener estado de confirmación

  const count = (typeof lastRoofInfo !== 'undefined' && lastRoofInfo && lastRoofInfo.panels) ? lastRoofInfo.panels.length : 0;
  const modWp = (panelConfig && panelConfig.potencia) ? panelConfig.potencia : 450;
  const totalKwp = ((count * modWp) / 1000).toFixed(2);

  // Sincronizar dimensionamiento con la cantidad real de paneles que caben
  wpComputeAutoSizing(count);

  showStatus('<i data-lucide=\"eye\" class=\"icon-sm\"></i>️ DISPOSICIÓN 3D PREVISUALIZADA: ' + count + ' MÓDULOS (' + totalKwp + ' kWp)', 3000);
  if (typeof showToast === 'function') {
    showToast('VISTA PREVIA 3D', count + ' módulos caben exactamente en cubierta (' + totalKwp + ' kWp).', 'success', 3500);
  }
}
window.wpQuickPreview3DFromStep3 = wpQuickPreview3DFromStep3;
window.wpQuickPreview3DFromStep4 = wpQuickPreview3DFromStep3;

function step4UpdateObjective() {
  const prevObj = window.solarProjectConfig ? window.solarProjectConfig.selectedObjective : null;
  const radios = document.getElementsByName('project_objective');
  let newObj = 'optimal_inv';
  for (let r of radios) {
    if (r.checked) {
      newObj = r.value;
      break;
    }
  }
  if (!window.solarProjectConfig) window.solarProjectConfig = {};
  if (prevObj === newObj) return; // Si no ha cambiado, no invalidar ni recalcular
  window.solarProjectConfig.selectedObjective = newObj;
  showStatus('CRITERIO TÉCNICO FV ACTUALIZADO: ' + newObj.toUpperCase(), 2000);
  if (typeof window.wpInvalidateHeatmap === 'function') {
    window.wpInvalidateHeatmap('Criterio técnico FV modificado (' + newObj + ')');
  }
  // Auto-refresh: regenerar distribución de paneles al cambiar criterio
  if (typeof isPolygonDesignConfirmed !== 'undefined') isPolygonDesignConfirmed = true;
  if (typeof roofPanelsCache !== 'undefined' && roofPanelsCache) {
    roofPanelsCache.sig = "";
    roofPanelsCache.data = null;
  }
  if (typeof wpFastRenderSimulatedPanels === 'function') {
    wpFastRenderSimulatedPanels();
  } else if (typeof step5RegenerateLayout === 'function') {
    step5RegenerateLayout();
  }
  if (typeof recalculateSolarYield === 'function') {
    recalculateSolarYield();
  }
  if (typeof wpUpdateStep3UI === 'function') {
    wpUpdateStep3UI();
  }
  if (typeof wpPopulateFaldonCard === 'function') {
    wpPopulateFaldonCard();
  }
  if (typeof wpUpdateCommercialPathsUI === 'function') {
    wpUpdateCommercialPathsUI();
  }
}
window.step4UpdateObjective = step4UpdateObjective;

function step4ApplyFinancialProfile(profileKey) {
  window.solarProjectConfig.financialProfile = profileKey;
  
  const cfgMod = document.getElementById('cfg-modelo');
  const cfgPot = document.getElementById('cfg-pot');
  const cfgRend = document.getElementById('cfg-rend');
  const cfgPrecio = document.getElementById('cfg-precio');
  const selBat = document.getElementById('cfg-pres-bat-opt');
  const selShade = document.getElementById('cfg-shading-strategy');
  const selTipoEst = document.getElementById('cfg-tipo-est');

  if (profileKey === 'max_prod') {
    if (cfgMod) cfgMod.value = 'Tier 1 Ultra N-Type 550W';
    if (cfgPot) cfgPot.value = 550;
    if (cfgRend) cfgRend.value = 22.8;
    if (cfgPrecio) cfgPrecio.value = 160;
    if (selShade) { selShade.value = 'mlpe'; shadingStrategy = 'mlpe'; if (typeof window.setShadingStrategy === 'function') window.setShadingStrategy('mlpe'); }
    if (selBat) { selBat.value = '10'; if (typeof updateBatteryCost === 'function') updateBatteryCost(); }
    showStatus('PERFIL: MÁXIMA PRODUCCIÓN & AUTARQUÍA APLICADO', 2500);
  } else if (profileKey === 'min_payback') {
    if (cfgMod) cfgMod.value = 'Tier 1 Mono PERC 450W';
    if (cfgPot) cfgPot.value = 450;
    if (cfgRend) cfgRend.value = 21.5;
    if (cfgPrecio) cfgPrecio.value = 125;
    if (selShade) { selShade.value = 'exclude'; shadingStrategy = 'exclude'; if (typeof window.setShadingStrategy === 'function') window.setShadingStrategy('exclude'); }
    if (selBat) { selBat.value = '0'; if (typeof updateBatteryCost === 'function') updateBatteryCost(); }
    if (selTipoEst) { selTipoEst.value = 'coplanar_teja'; if (typeof updateStructureCost === 'function') updateStructureCost(); }
    showStatus('PERFIL: MÍNIMO TIEMPO DE AMORTIZACIÓN (<4.5 AÑOS) APLICADO', 2500);
  } else if (profileKey === 'min_capex') {
    if (cfgMod) cfgMod.value = 'Tier 1 Standard 410W';
    if (cfgPot) cfgPot.value = 410;
    if (cfgRend) cfgRend.value = 20.8;
    if (cfgPrecio) cfgPrecio.value = 110;
    if (selShade) { selShade.value = 'exclude'; shadingStrategy = 'exclude'; if (typeof window.setShadingStrategy === 'function') window.setShadingStrategy('exclude'); }
    if (selBat) { selBat.value = '0'; if (typeof updateBatteryCost === 'function') updateBatteryCost(); }
    showStatus('PERFIL: MÍNIMA INVERSIÓN INICIAL (LOW CAPEX) APLICADO', 2500);
  } else if (profileKey === 'max_tir') {
    if (cfgMod) cfgMod.value = 'Tier 1 Mono PERC 450W';
    if (cfgPot) cfgPot.value = 450;
    if (cfgRend) cfgRend.value = 21.5;
    if (cfgPrecio) cfgPrecio.value = 130;
    if (selShade) { selShade.value = 'mlpe'; shadingStrategy = 'mlpe'; if (typeof window.setShadingStrategy === 'function') window.setShadingStrategy('mlpe'); }
    if (selBat) { selBat.value = '5'; if (typeof updateBatteryCost === 'function') updateBatteryCost(); }
    showStatus('PERFIL: MÁXIMA RENTABILIDAD FINANCIERA (TIR MÁX) APLICADO', 2500);
  }

  if (typeof updateConfigAndSimulate === 'function') updateConfigAndSimulate();
}
window.step4ApplyFinancialProfile = step4ApplyFinancialProfile;

/**
 * 🤖 MOTOR DE AUTO-INGENIERÍA ZERO-CLICK
 * Evalúa en tiempo real: número de módulos, kWp, sombras 3D (Heatmap) y orientaciones
 * para seleccionar de forma proactiva la topología, inversor y acumulación óptimos.
 */
function wpAutoSelectOptimalEngineering(force = false) {
  const cfg = window.solarProjectConfig;
  if (!cfg) return null;

  // Si el usuario ya seleccionó manualmente un equipo y no está forzando re-optimización, respetar su decisión
  if (!force && cfg.userManuallySelectedInverter) {
    wpRenderAutoEngineeringBanner(null, true);
    return null;
  }

  const catalog = (typeof window !== 'undefined' && window.equipmentCatalog) ? window.equipmentCatalog : ((typeof equipmentCatalog !== 'undefined') ? equipmentCatalog : null);
  if (!catalog || !Array.isArray(catalog.inverters) || catalog.inverters.length === 0) return null;

  // 1. Obtener conteo real de módulos y potencia
  let totalPanels = (Array.isArray(window.allRenderedPanels) && window.allRenderedPanels.length > 0)
    ? window.allRenderedPanels.filter(p => p && !p.deleted).length
    : 0;
  if (totalPanels === 0 && typeof WP !== 'undefined' && Array.isArray(WP.polylines)) {
    WP.polylines.forEach(p => {
      const pInfo = p.roofInfo || (typeof computeSinglePolylineRoofInfo === 'function' ? computeSinglePolylineRoofInfo(p.points, p) : null);
      if (pInfo && pInfo.panels) totalPanels += pInfo.panels.length;
    });
  }
  if (totalPanels === 0) totalPanels = cfg.lastEstimatedPanels || 24;

  const mod = (catalog.modules && catalog.modules.find(m => m.id === cfg.selectedModuleId)) || (catalog.modules && catalog.modules[0]) || { wp: 450, isc: 13.8, voc: 41.5 };
  const totalKwp = (totalPanels * (mod.wp || 450)) / 1000.0;

  // 2. Analizar orientaciones distintas de faldones
  let distinctOrientations = 1;
  const orientations = [];
  if (typeof WP !== 'undefined' && Array.isArray(WP.polylines) && WP.polylines.length > 0) {
    WP.polylines.forEach(poly => {
      if (poly && poly.points && poly.points.length >= 3) {
        const pInfo = poly.roofInfo || (typeof computeSinglePolylineRoofInfo === 'function' ? computeSinglePolylineRoofInfo(poly.points, poly) : null);
        const az = pInfo ? (pInfo.moduleAzimuthDeg ?? pInfo.azimuthDeg ?? 0) : 0;
        const tilt = pInfo ? (pInfo.moduleTiltDeg ?? pInfo.tiltDeg ?? 30) : 30;
        const isDupe = orientations.some(o => Math.abs(o.az - az) < 10 && Math.abs(o.tilt - tilt) < 5);
        if (!isDupe) orientations.push({ az, tilt });
      }
    });
    distinctOrientations = Math.max(1, orientations.length);
  }

  // 3. Obtener diagnóstico de sombras 3D (Paso 3)
  const shading = (typeof wpEvaluateMLPENecessity === 'function') ? wpEvaluateMLPENecessity() : null;

  // 4. Tipo de red (suministro)
  const gridSupply = (totalKwp > 6.0) ? 'three_phase' : 'single_phase';

  // 5. Casación de inversor desde el motor electrotécnico
  if (typeof matchInvertersFromCatalog !== 'function') return null;

  const match = matchInvertersFromCatalog({
    invertersCatalog: catalog.inverters,
    module: mod,
    totalPanels: totalPanels,
    totalKwp: totalKwp,
    gridSupply: gridSupply,
    distinctOrientations: distinctOrientations,
    shadingDiagnostics: shading,
    selectedObjective: cfg.selectedObjective, tempMinC: cfg.tempMinC ?? -5, tempMaxCellC: cfg.tempMaxCellC ?? 70
  });

  const bestTopology = match.recommendedTopology || 'inverter';
  let bestScenario = null;

  if (bestTopology === 'microinverter') {
    const catalogMicros = (Array.isArray(catalog.microinverters) && catalog.microinverters.length > 0)
      ? catalog.microinverters
      : [{ id: 'micro_hoymiles_800', brand: 'Hoymiles', model: 'HMS-800-2T (2-en-1)', kw: 0.8, price: 175 }];
    const chosenMicro = (cfg.selectedMicroinverterId && catalogMicros.find(m => m.id === cfg.selectedMicroinverterId)) || catalogMicros[0];
    const microUnits = Math.ceil(totalPanels / 2);
    bestScenario = {
      inverter: chosenMicro,
      count: microUnits,
      totalAcKw: Math.round(microUnits * (chosenMicro.kw || 0.8) * 10) / 10,
      mpptCount: microUnits * 2,
      overloadPct: parseFloat((totalKwp / (microUnits * (chosenMicro.kw || 0.8)) * 100).toFixed(1)),
      totalCostEur: microUnits * (chosenMicro.price || 175),
      isMicro: true
    };
    cfg.selectedTopology = 'microinverter';
    cfg.selectedMicroinverterId = chosenMicro.id;
    if (!cfg.autoSizing) cfg.autoSizing = {};
    if (!cfg.autoSizing.microinverters) cfg.autoSizing.microinverters = {};
    cfg.autoSizing.microinverters.count = microUnits;
    cfg.autoSizing.microinverters.isManual = false;
  } else {
    // Priorizar siempre coincidencias reales de catálogo (1x o Nx) frente a inversores paramétricos virtuales
    bestScenario = match.bestCatalogMatch ||
      (match.recommendedScenarioA && !match.recommendedScenarioA.isVirtual ? match.recommendedScenarioA : null) ||
      (match.recommendedScenarioB && !match.recommendedScenarioB.isVirtual ? match.recommendedScenarioB : null) ||
      match.virtualInverterMatch ||
      match.recommendedScenarioA ||
      match.recommendedScenarioB;
    cfg.selectedTopology = bestTopology;
    if (bestScenario && bestScenario.inverter) {
      cfg.selectedInverterId = bestScenario.inverter.id;
      if (!cfg.autoSizing) cfg.autoSizing = {};
      if (!cfg.autoSizing.inverters) cfg.autoSizing.inverters = {};
      cfg.autoSizing.inverters.count = bestScenario.count;
      cfg.autoSizing.inverters.isManual = false;
    }
  }

  // Si se generó un Inversor Paramétrico Virtual (para topología string central):
  // Se mantiene aislado en cfg.lastVirtualInverter sin contaminar catalog.inverters hasta que el usuario lo guarde explícitamente
  if (bestTopology !== 'microinverter' && bestScenario && bestScenario.inverter && bestScenario.isVirtual) {
    cfg.lastVirtualInverter = bestScenario.inverter;
    cfg.lastSuggestedCommercialModels = match.suggestedCommercialModels || bestScenario.inverter.suggestedCommercialModels || [];
    if (typeof populateStep3EquipmentSelectors === 'function') populateStep3EquipmentSelectors();
  } else {
    delete cfg.lastVirtualInverter;
  }

  // Auto-dimensionar batería LFP si procede (residencial / híbrido <= 15 kWp)
  if (totalKwp <= 15.0 && Array.isArray(catalog.batteries) && catalog.batteries.length > 0) {
    const targetKwh = Math.max(5.0, totalKwp * 1.0);
    const sortedBats = [...catalog.batteries].filter(b => b && b.kwh > 0).sort((a, b) => Math.abs(a.kwh - targetKwh) - Math.abs(b.kwh - targetKwh));
    if (sortedBats.length > 0) {
      cfg.selectedBatteryId = sortedBats[0].id;
      if (!cfg.autoSizing.batteries) cfg.autoSizing.batteries = {};
      cfg.autoSizing.batteries.count = 1;
      cfg.autoSizing.batteries.isManual = false;
    }
  }

  // Sincronizar selectores del DOM
  const invSel = document.getElementById('step3-sel-inverter');
  if (invSel && cfg.selectedInverterId) invSel.value = cfg.selectedInverterId;
  const miSel = document.getElementById('step3-sel-microinverter');
  if (miSel && cfg.selectedMicroinverterId) miSel.value = cfg.selectedMicroinverterId;
  const batSel = document.getElementById('step3-sel-battery');
  if (batSel && cfg.selectedBatteryId) batSel.value = cfg.selectedBatteryId;

  // Actualizar topología activa conmutando visibilidad de campos y botones
  step3SetTopology(bestTopology);

  // Si se recomiendan optimizadores selectivos, aplicarlos a los paneles afectados
  if (bestTopology === 'optimizer' && shading && typeof shading.applySelectiveOptimizers === 'function') {
    try { shading.applySelectiveOptimizers(); } catch (e) {}
  }

  // Actualizar recálculo de ingeniería y límites
  if (typeof step3UpdateHardwareSelection === 'function') step3UpdateHardwareSelection();
  if (typeof wpComputeAutoSizing === 'function') wpComputeAutoSizing(totalPanels);

  // 8. Renderizar Banner informativo
  wpRenderAutoEngineeringBanner({
    topology: bestTopology,
    scenario: bestScenario,
    totalKwp: totalKwp,
    totalPanels: totalPanels,
    distinctOrientations: distinctOrientations,
    rationale: match.topologyRationale,
    shading: shading,
    isVirtual: !!(bestScenario && (bestScenario.isVirtual || (bestScenario.inverter && bestScenario.inverter.isVirtual))),
    bottleneckReason: match.bottleneckReason,
    suggestedCommercialModels: match.suggestedCommercialModels
  }, false);

  return match;
}

function wpRenderAutoEngineeringBanner(info, isManualOverride = false) {
  const banner = document.getElementById('step4-auto-engineering-banner');
  if (!banner) return;

  if (isManualOverride) {
    banner.innerHTML = `
      <div style="background:rgba(15,23,42,0.92);border:1px solid rgba(245,158,11,0.4);border-radius:8px;padding:8px 10px;display:flex;justify-content:space-between;align-items:center;box-shadow:0 4px 15px rgba(0,0,0,0.3);margin-bottom:6px;">
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="background:rgba(245,158,11,0.15);color:#FBBF24;border:1px solid rgba(245,158,11,0.3);padding:2px 6px;border-radius:4px;font-size:9.5px;font-weight:900;">
            🛠️ MODO MANUAL
          </span>
          <span style="font-size:10px;color:#CBD5E1;">
            Ajustes personalizados por el proyectista.
          </span>
        </div>
        <div style="display:flex;gap:4px;align-items:center;">
          <button type="button" class="doc-mini-btn" onclick="wpOpenSmartInverterMatchingModal()" style="background:rgba(56,189,248,0.15);border:1px solid #38BDF8;color:#38BDF8;font-size:9.5px;font-weight:bold;padding:3px 7px;cursor:pointer;" title="Comparar alternativas técnicas 1x Central vs Nx Modulares vs MLPE">
            <i data-lucide="sparkles" class="icon-sm"></i> ALTERNATIVAS
          </button>
          <button type="button" class="doc-mini-btn" onclick="if(window.solarProjectConfig) window.solarProjectConfig.userManuallySelectedInverter=false; wpAutoSelectOptimalEngineering(true);" style="background:linear-gradient(135deg,#10B981,#059669);border:none;color:#fff;font-size:9.5px;font-weight:900;padding:3px 8px;border-radius:4px;cursor:pointer;" title="Volver a calcular la topología e inversor óptimo por IA">
            <i data-lucide="rotate-ccw" class="icon-sm"></i> RESTAURAR AUTO
          </button>
        </div>
      </div>
    `;
    banner.style.display = 'block';
    if (window.lucide && typeof window.lucide.createIcons === 'function') try { window.lucide.createIcons(); } catch(e) {}
    return;
  }

  if (!info || !info.scenario) {
    banner.style.display = 'none';
    return;
  }

  const sc = info.scenario;
  const isVirtual = info.isVirtual || (sc.inverter && sc.inverter.isVirtual);

  if (isVirtual) {
    const comModels = Array.isArray(info.suggestedCommercialModels) ? info.suggestedCommercialModels : [];
    if (window.solarProjectConfig && comModels.length > 0) {
      window.solarProjectConfig.lastSuggestedCommercialModels = comModels;
    }
    const modelsHtml = comModels.length > 0 ? `
      <div style="font-size: 10px;color:#94A3B8;margin-bottom:6px;">
        <b style="color:#CBD5E1;">Equipos de mercado sugeridos (clic para añadir en 1 clic a la BD comercial):</b>
        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:3px;">
          ${comModels.map((m, idx) => `<button type="button" onclick="wpAddSuggestedCommercialModelToCatalog(${idx})" style="background:rgba(245,158,11,0.14);border:1px solid rgba(245,158,11,0.45);border-radius:4px;padding:2px 6px;color:#FDE68A;font-size:10px;font-weight:bold;cursor:pointer;" title="Añadir ${m.brand} ${m.model} al catálogo comercial y seleccionarlo">➕ ${m.brand} ${m.model} (${m.kw} kW)</button>`).join('')}
        </div>
      </div>
    ` : '';

    banner.innerHTML = `
      <div style="background:linear-gradient(135deg, rgba(69,10,10,0.92), rgba(30,27,75,0.92));border:2px solid #F59E0B;border-radius:8px;padding:8px;box-shadow:0 0 14px rgba(245,158,11,0.28);margin-bottom:6px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:3px;">
          <span style="font-size:10px;font-weight:900;color:#FBBF24;">
            <i data-lucide="alert-triangle" class="icon-sm"></i> ⚠️ EQUIPO RECOMENDADO FUERA DE CATÁLOGO
          </span>
          <div style="display:flex;gap:4px;align-items:center;">
            <span class="card-tag" style="background:rgba(239,68,68,0.25);border:1px solid #EF4444;color:#FCA5A5;font-size: 9.5px;font-weight:900;">
              NO REGISTRADO EN BD
            </span>
            <button type="button" class="doc-mini-btn" onclick="wpOpenSmartInverterMatchingModal()" style="background:rgba(56,189,248,0.2);border:1px solid #38BDF8;color:#38BDF8;font-size: 10px;font-weight:bold;padding:2px 6px;cursor:pointer;" title="Comparar alternativas técnicas 1x Central vs Nx Modulares vs MLPE">
              <i data-lucide="sparkles" class="icon-sm"></i> COMPARAR 1X VS NX
            </button>
          </div>
        </div>
        <div style="font-size: 10px;color:#FCD34D;background:rgba(245,158,11,0.12);padding:4px 6px;border-radius:4px;margin-bottom:5px;border-left:3px solid #F59E0B;line-height:1.3;">
          <b>Cuello de Botella Físico:</b> ${info.bottleneckReason || 'Requisitos del proyecto no cubiertos por los equipos disponibles en catálogo.'}
        </div>
        <div style="font-size: 10px;color:#E2E8F0;line-height:1.35;margin-bottom:4px;">
          <b>Inversor Ideal Auto-Generado:</b> ${sc.count}× ${sc.inverter.brand} ${sc.inverter.model} (${sc.totalAcKw} kW AC · ${sc.mpptCount} MPPTs · Sobrecarga: ${sc.overloadPct}%)
        </div>
        ${modelsHtml}
        <div style="display:flex;gap:6px;align-items:center;margin-top:6px;border-top:1px solid rgba(255,255,255,0.08);padding-top:5px;">
          <button type="button" class="doc-mini-btn" onclick="wpSaveVirtualInverterToCatalog()" style="background:linear-gradient(135deg,#F59E0B,#D97706);border:none;color:#0F172A;font-size: 10px;font-weight:900;padding:4px 8px;cursor:pointer;" title="Añadir este equipo directamente a la base de datos comercial con un solo clic">
            <i data-lucide="plus-circle" class="icon-sm"></i> AÑADIR A BASE DE DATOS COMERCIAL (1 CLIC)
          </button>
          <button type="button" class="doc-mini-btn" onclick="openEquipmentCatalogModal('ai_import')" style="background:rgba(56,189,248,0.15);border:1px solid #38BDF8;color:#38BDF8;font-size: 10px;font-weight:bold;padding:3px 7px;cursor:pointer;" title="Importar PDF técnico de inversor real con IA">
            <i data-lucide="sparkles" class="icon-sm"></i> SUBIR PDF CON IA
          </button>
          <button type="button" class="doc-mini-btn" onclick="openEquipmentCatalogModal('inverters')" style="background:rgba(148,163,184,0.15);border:1px solid #94A3B8;color:#CBD5E1;font-size: 10px;font-weight:bold;padding:3px 7px;cursor:pointer;" title="Abrir catálogo">
            <i data-lucide="database" class="icon-sm"></i> CATÁLOGO
          </button>
        </div>
      </div>
    `;
    banner.style.display = 'block';
    if (window.lucide && typeof window.lucide.createIcons === 'function') try { window.lucide.createIcons(); } catch(e) {}
    return;
  }

  const topoLabels = {
    inverter: 'Inversor String Multi-MPPT',
    optimizer: 'Inversor String + Optimizadores DC Selectivos',
    microinverter: 'Microinversores MLPE Descentralizados'
  };

  const topoColors = {
    inverter: '#38BDF8',
    optimizer: '#F59E0B',
    microinverter: '#10B981'
  };

  banner.innerHTML = `
    <div style="background:linear-gradient(135deg, rgba(15,23,42,0.95), rgba(30,41,59,0.90));border:1.5px solid ${topoColors[info.topology] || '#38BDF8'};border-radius:8px;padding:9px 10px;box-shadow:0 4px 15px rgba(0,0,0,0.35);margin-bottom:6px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:5px;">
        <span style="font-size:10.5px;font-weight:900;color:${topoColors[info.topology] || '#38BDF8'};display:flex;align-items:center;gap:5px;">
          <i data-lucide="cpu" class="icon-sm"></i> PILOTO AUTOMÁTICO ACTIVO: ${topoLabels[info.topology] || info.topology}
        </span>
        <div style="display:flex;gap:4px;align-items:center;">
          <span class="card-tag" style="background:rgba(16,185,129,0.2);color:#34D399;font-size:9.5px;font-weight:800;border:1px solid rgba(16,185,129,0.3);">
            ✓ AUTO-INGENIERÍA OK
          </span>
          <button type="button" class="doc-mini-btn" onclick="wpOpenSmartInverterMatchingModal()" style="background:rgba(56,189,248,0.2);border:1px solid #38BDF8;color:#38BDF8;font-size:9.5px;font-weight:bold;padding:2px 6px;cursor:pointer;" title="Comparar alternativas técnicas: 1x Central vs Nx Modulares vs MLPE">
            <i data-lucide="sparkles" class="icon-sm"></i> ALTERNATIVAS
          </button>
        </div>
      </div>
      <div style="font-size:10px;color:#E2E8F0;line-height:1.4;margin-bottom:4px;">
        ${(info.topology === 'microinverter' || (sc && sc.isMicro))
          ? `<b>Arquitectura Seleccionada:</b> ${sc.count}× Microinversores ${sc.inverter.brand} ${sc.inverter.model} (${sc.totalAcKw} kW AC · Seguimiento granular por módulo · Inmune a sombras)`
          : `<b>Arquitectura Seleccionada:</b> ${sc.count}× ${sc.inverter.brand} ${sc.inverter.model} (${sc.totalAcKw} kW AC · ${sc.mpptCount} MPPTs · Sobrecarga DC/AC: <b>${sc.overloadPct}%</b>)`}
      </div>
      <div style="font-size:9.5px;color:#94A3B8;line-height:1.35;background:rgba(0,0,0,0.3);padding:4px 6px;border-radius:4px;border:1px solid rgba(255,255,255,0.05);">
        <b>Criterio Técnico del Algoritmo:</b> ${info.rationale} (${info.distinctOrientations} ${info.distinctOrientations === 1 ? 'orientación de cubierta' : 'orientaciones distintas'}, ${info.totalPanels} placas · ${info.totalKwp.toFixed(1)} kWp).
      </div>
    </div>
  `;
  banner.style.display = 'block';
  if (window.lucide && typeof window.lucide.createIcons === 'function') try { window.lucide.createIcons(); } catch(e) {}
}

function wpRefreshAutoEngineeringBanner(preferredTopology) {
  const banner = document.getElementById('step4-auto-engineering-banner');
  if (!banner) return;

  const cfg = window.solarProjectConfig || {};
  const topo = preferredTopology || cfg.selectedTopology || 'inverter';
  const catalog = (typeof window !== 'undefined' && window.equipmentCatalog) ? window.equipmentCatalog : ((typeof equipmentCatalog !== 'undefined') ? equipmentCatalog : null);
  if (!catalog) return;

  let totalPanels = (Array.isArray(window.allRenderedPanels) && window.allRenderedPanels.length > 0)
    ? window.allRenderedPanels.filter(p => p && !p.deleted).length
    : 0;
  if (totalPanels === 0 && typeof WP !== 'undefined' && Array.isArray(WP.polylines)) {
    WP.polylines.forEach(p => {
      const pInfo = p.roofInfo || (typeof computeSinglePolylineRoofInfo === 'function' ? computeSinglePolylineRoofInfo(p.points, p) : null);
      if (pInfo && pInfo.panels) totalPanels += pInfo.panels.length;
    });
  }
  if (totalPanels === 0) totalPanels = cfg.lastEstimatedPanels || 24;

  const mod = (catalog.modules && catalog.modules.find(m => m.id === cfg.selectedModuleId)) || (catalog.modules && catalog.modules[0]) || { wp: 450, isc: 13.8, voc: 41.5 };
  const totalKwp = (totalPanels * (mod.wp || 450)) / 1000.0;

  let distinctOrientations = 1;
  const orientations = [];
  if (typeof WP !== 'undefined' && Array.isArray(WP.polylines) && WP.polylines.length > 0) {
    WP.polylines.forEach(poly => {
      if (poly && poly.points && poly.points.length >= 3) {
        const pInfo = poly.roofInfo || (typeof computeSinglePolylineRoofInfo === 'function' ? computeSinglePolylineRoofInfo(poly.points, poly) : null);
        const az = pInfo ? (pInfo.moduleAzimuthDeg ?? pInfo.azimuthDeg ?? 0) : 0;
        const tilt = pInfo ? (pInfo.moduleTiltDeg ?? pInfo.tiltDeg ?? 30) : 30;
        const isDupe = orientations.some(o => Math.abs(o.az - az) < 10 && Math.abs(o.tilt - tilt) < 5);
        if (!isDupe) orientations.push({ az, tilt });
      }
    });
    distinctOrientations = Math.max(1, orientations.length);
  }

  const shading = (typeof wpEvaluateMLPENecessity === 'function') ? wpEvaluateMLPENecessity() : null;
  const gridSupply = (totalKwp > 6.0) ? 'three_phase' : 'single_phase';

  let match = null;
  if (typeof matchInvertersFromCatalog === 'function') {
    match = matchInvertersFromCatalog({
      invertersCatalog: catalog.inverters,
      module: mod,
      totalPanels: totalPanels,
      totalKwp: totalKwp,
      gridSupply: gridSupply,
      distinctOrientations: distinctOrientations,
      shadingDiagnostics: shading,
      selectedObjective: cfg.selectedObjective, tempMinC: cfg.tempMinC ?? -5, tempMaxCellC: cfg.tempMaxCellC ?? 70,
      selectedTopology: topo
    });
  }

  let scenario = null;
  let isVirtual = false;

  if (topo === 'microinverter') {
    const catalogMicros = (Array.isArray(catalog.microinverters) && catalog.microinverters.length > 0)
      ? catalog.microinverters
      : [{ id: 'micro_hoymiles_800', brand: 'Hoymiles', model: 'HMS-800-2T (2-en-1)', kw: 0.8, price: 175 }];
    const chosenMicro = (cfg.selectedMicroinverterId && catalogMicros.find(m => m.id === cfg.selectedMicroinverterId)) || catalogMicros[0];
    const microUnits = (cfg.autoSizing && cfg.autoSizing.microinverters && cfg.autoSizing.microinverters.count > 0)
      ? cfg.autoSizing.microinverters.count
      : Math.ceil(totalPanels / 2);
    scenario = {
      inverter: chosenMicro,
      count: microUnits,
      totalAcKw: Math.round(microUnits * (chosenMicro.kw || 0.8) * 10) / 10,
      mpptCount: microUnits * 2,
      overloadPct: parseFloat((totalKwp / (microUnits * (chosenMicro.kw || 0.8)) * 100).toFixed(1)),
      totalCostEur: microUnits * (chosenMicro.price || 175),
      isMicro: true
    };
  } else {
    if (cfg.selectedInverterId && Array.isArray(catalog.inverters)) {
      const activeInv = catalog.inverters.find(i => i.id === cfg.selectedInverterId) || cfg.lastVirtualInverter;
      if (activeInv) {
        const invCount = (cfg.autoSizing && cfg.autoSizing.inverters && cfg.autoSizing.inverters.count > 0)
          ? cfg.autoSizing.inverters.count
          : Math.max(1, Math.round(totalKwp / ((activeInv.kw || 10) * 1.18)));
        const unitKw = activeInv.kw || 10;
        const totalAcKw = Math.round(unitKw * invCount * 10) / 10;
        const overloadPct = parseFloat((totalKwp / totalAcKw * 100).toFixed(1));
        const mpptCount = (activeInv.mppt || activeInv.mpptCount || 2) * invCount;
        scenario = {
          inverter: activeInv,
          count: invCount,
          totalAcKw: totalAcKw,
          mpptCount: mpptCount,
          overloadPct: overloadPct,
          totalCostEur: invCount * (activeInv.price || 1200),
          isVirtual: !!activeInv.isVirtual
        };
        isVirtual = !!activeInv.isVirtual;
      }
    }
    if (!scenario && match) {
      scenario = match.recommendedScenarioB || match.recommendedScenarioA || match.virtualInverterMatch;
      isVirtual = !!(scenario && (scenario.isVirtual || (scenario.inverter && scenario.inverter.isVirtual)));
    }
  }

  if (!scenario) return;

  const rationale = (match && match.topologyRationale)
    ? match.topologyRationale
    : (topo === 'microinverter'
        ? 'Topología MLPE Descentralizada activa con seguimiento independiente por módulo.'
        : `Topología String Central activa con ${scenario.count}× ${scenario.inverter.brand} ${scenario.inverter.model}.`);

  wpRenderAutoEngineeringBanner({
    topology: topo,
    scenario: scenario,
    totalKwp: totalKwp,
    totalPanels: totalPanels,
    distinctOrientations: distinctOrientations,
    rationale: rationale,
    shading: shading,
    isVirtual: isVirtual,
    bottleneckReason: (match && match.bottleneckReason) || (scenario.inverter && scenario.inverter.bottleneckReason),
    suggestedCommercialModels: (match && match.suggestedCommercialModels) || (scenario.inverter && scenario.inverter.suggestedCommercialModels)
  }, false);
}

function wpSaveVirtualInverterToCatalog() {
  const cfg = window.solarProjectConfig;
  const catalog = (typeof window !== 'undefined' && window.equipmentCatalog) ? window.equipmentCatalog : ((typeof equipmentCatalog !== 'undefined') ? equipmentCatalog : null);
  const vInv = (cfg && cfg.lastVirtualInverter) || (cfg && cfg.selectedInverterId && catalog && catalog.inverters && catalog.inverters.find(i => i.id === cfg.selectedInverterId && i.isVirtual));
  if (!vInv) {
    if (typeof showToast === 'function') showToast('AVISO', 'No hay ningún inversor virtual activo para guardar.', 'warning', 2500);
    return;
  }

  if (!catalog || !Array.isArray(catalog.inverters)) return;

  const persistentId = 'inv_custom_' + Date.now();
  const cleanInv = {
    ...vInv,
    id: persistentId,
    brand: vInv.brand && vInv.brand.includes('Paramétrico') ? 'Inversor Optimizado' : (vInv.brand || 'Personalizado'),
    isVirtual: false
  };
  delete cleanInv.bottleneckReason;
  delete cleanInv.suggestedCommercialModels;

  // Reemplazar la versión temporal en memoria
  catalog.inverters = catalog.inverters.filter(i => i.id !== vInv.id);
  catalog.inverters.push(cleanInv);

  if (typeof saveEquipmentCatalog === 'function') {
    saveEquipmentCatalog();
  }

  cfg.selectedInverterId = persistentId;
  delete cfg.lastVirtualInverter;

  if (typeof populateStep3EquipmentSelectors === 'function') populateStep3EquipmentSelectors();
  if (typeof populateHardwareDropdowns === 'function') populateHardwareDropdowns();
  if (typeof step3UpdateHardwareSelection === 'function') step3UpdateHardwareSelection();

  wpAutoSelectOptimalEngineering(true);

  if (typeof showStatus === 'function') {
    showStatus(`✓ INVERSOR "${cleanInv.brand} ${cleanInv.model}" GUARDADO EN CATÁLOGO`, 3500);
  } else if (typeof showToast === 'function') {
    showToast('CATÁLOGO ACTUALIZADO', `El inversor ${cleanInv.model} ha sido guardado permanentemente.`, 'success', 3500);
  }
}

function wpAddSuggestedCommercialModelToCatalog(idx) {
  const cfg = window.solarProjectConfig;
  const catalog = (typeof window !== 'undefined' && window.equipmentCatalog) ? window.equipmentCatalog : ((typeof equipmentCatalog !== 'undefined') ? equipmentCatalog : null);
  const vInv = (cfg && cfg.lastVirtualInverter) || {};
  const list = (cfg && Array.isArray(cfg.lastSuggestedCommercialModels) && cfg.lastSuggestedCommercialModels.length > 0)
    ? cfg.lastSuggestedCommercialModels
    : (Array.isArray(vInv.suggestedCommercialModels) ? vInv.suggestedCommercialModels : []);
  const modelSpec = list[idx];
  if (!modelSpec || !catalog || !Array.isArray(catalog.inverters)) return;

  const isThreePhase = (modelSpec.kw || 10) > 6.0;
  const persistentId = `inv_${String(modelSpec.brand || 'custom').toLowerCase()}_${modelSpec.kw}kw_${Date.now()}`;
  const newCommercialInv = {
    id: persistentId,
    brand: modelSpec.brand || 'Tier-1',
    model: modelSpec.model || `${modelSpec.kw}KTL`,
    kw: modelSpec.kw || vInv.kw || 10,
    type: isThreePhase ? 'Trifásico' : 'Monofásico',
    mppt: modelSpec.mppt || vInv.mppt || 2,
    inputsPerMppt: vInv.inputsPerMppt || 2,
    vDcMax: isThreePhase ? 1100 : 600,
    vStart: isThreePhase ? 200 : 100,
    vMpptNomMin: isThreePhase ? 200 : 120,
    vMpptNomMax: isThreePhase ? 850 : 500,
    iMaxOperA: vInv.iMaxOperA || 26.0,
    iMaxScA: vInv.iMaxScA || 36.0,
    maxOverload: 1.35,
    eff: 98.4,
    price: vInv.price || (isThreePhase ? Math.round((modelSpec.kw || 10) * 65) : Math.round(250 + (modelSpec.kw || 5) * 110)),
    isVirtual: false
  };

  if (vInv.id) {
    catalog.inverters = catalog.inverters.filter(i => i.id !== vInv.id);
  }
  catalog.inverters.push(newCommercialInv);

  if (typeof saveEquipmentCatalog === 'function') {
    saveEquipmentCatalog();
  }

  cfg.selectedInverterId = persistentId;
  delete cfg.lastVirtualInverter;

  if (typeof populateStep3EquipmentSelectors === 'function') populateStep3EquipmentSelectors();
  if (typeof populateHardwareDropdowns === 'function') populateHardwareDropdowns();
  if (typeof step3UpdateHardwareSelection === 'function') step3UpdateHardwareSelection();

  wpAutoSelectOptimalEngineering(true);

  if (typeof showStatus === 'function') {
    showStatus(`✓ EQUIPO COMERCIAL "${newCommercialInv.brand} ${newCommercialInv.model}" AÑADIDO A LA BASE DE DATOS`, 3500);
  } else if (typeof showToast === 'function') {
    showToast('EQUIPO REGISTRADO', `${newCommercialInv.brand} ${newCommercialInv.model} añadido y seleccionado.`, 'success', 3500);
  }
}

window.wpAutoSelectOptimalEngineering = wpAutoSelectOptimalEngineering;
window.wpRenderAutoEngineeringBanner = wpRenderAutoEngineeringBanner;
window.wpRefreshAutoEngineeringBanner = wpRefreshAutoEngineeringBanner;
window.wpSaveVirtualInverterToCatalog = wpSaveVirtualInverterToCatalog;
window.wpAddSuggestedCommercialModelToCatalog = wpAddSuggestedCommercialModelToCatalog;


/**
 * Renderiza en la sidebar izquierda la lista/rack de todos los equipos de electrónica activos,
 * detallando modelos, cantidades, potencia AC, faldones asignados y estado de operación.
 */
function wpRenderElectronicsRackUI() {
  const rackContainer = document.getElementById('step3-electronics-rack-list');
  const countBadge = document.getElementById('step3-rack-count-badge');
  if (!rackContainer) return;

  const cfg = window.solarProjectConfig || {};
  const topo = cfg.selectedTopology || 'inverter';
  const catalog = (typeof window !== 'undefined' && window.equipmentCatalog) ? window.equipmentCatalog : ((typeof equipmentCatalog !== 'undefined') ? equipmentCatalog : null);
  if (!catalog) return;

  const items = [];

  // Inversores de Red
  if (topo !== 'microinverter') {
    const invCount = (cfg.autoSizing && cfg.autoSizing.inverters && cfg.autoSizing.inverters.count) || 1;
    const invId = cfg.selectedInverterId || (catalog.inverters && catalog.inverters[0] ? catalog.inverters[0].id : null);
    const invSpec = (catalog.inverters && catalog.inverters.find(i => i.id === invId))
      || (cfg.lastVirtualInverter && cfg.lastVirtualInverter.id === invId ? cfg.lastVirtualInverter : null)
      || (catalog.inverters ? catalog.inverters[0] : { brand: 'Inversor', model: 'String', kw: 10 });
    
    // Identificar faldones
    let roofDesc = 'Todos los faldones';
    if (typeof WP !== 'undefined' && Array.isArray(WP.polylines) && WP.polylines.length > 0) {
      const validRoofs = WP.polylines.filter(p => p && p.points && p.points.length >= 3);
      if (validRoofs.length > 1) {
        roofDesc = validRoofs.length + ' Faldones (' + (validRoofs.map((r, i) => 'F' + (i+1)).join(', ')) + ')';
      } else if (validRoofs.length === 1) {
        roofDesc = 'Faldón 1 (' + (validRoofs[0].name || 'Cubierta') + ')';
      }
    }

    items.push({
      type: 'inverter',
      icon: 'zap',
      badge: (invCount > 1 ? invCount + 'x INVERSORES' : '1x INVERSOR STRING'),
      title: (invSpec.brand || 'Tier-1') + ' ' + (invSpec.model || 'Inversor'),
      specs: (invCount * (invSpec.kw || 10.0)).toFixed(1) + ' kW AC total · ' + ((invSpec.mppt || 2) * invCount) + ' MPPTs · ' + (invSpec.type || 'Trifásico/Monofásico'),
      tag: roofDesc,
      tagColor: '#38BDF8',
      price: invCount * (invSpec.price || 1200)
    });
  }

  // Optimizadores DC/DC
  if (topo === 'optimizer') {
    const panelsTotal = (cfg.autoSizing && cfg.autoSizing.inverters && cfg.autoSizing.inverters.panelsTotal)
      || (Array.isArray(window.allRenderedPanels) ? window.allRenderedPanels.filter(p => p && !p.deleted).length : 18);
    const optId = cfg.selectedOptimizerId || 'mlpe_solaredge_s500';
    const optSpec = (catalog.microinverters && catalog.microinverters.find(m => m.id === optId))
      || { brand: 'Tigo / SolarEdge', model: 'Optimizador DC 500W', price: 65 };
    
    items.push({
      type: 'optimizer',
      icon: 'settings',
      badge: panelsTotal + 'x OPTIMIZADORES',
      title: (optSpec.brand || 'MLPE') + ' ' + (optSpec.model || 'Optimizador DC'),
      specs: 'Electrónica DC/DC individual módulo a módulo · 1V SafeDC por módulo',
      tag: '1 por módulo solar (' + panelsTotal + ' uds)',
      tagColor: '#F59E0B',
      price: panelsTotal * (optSpec.price || 65)
    });
  }

  // Microinversores
  if (topo === 'microinverter') {
    const miCount = (cfg.autoSizing && cfg.autoSizing.microinverters && cfg.autoSizing.microinverters.count) || 1;
    const miId = cfg.selectedMicroinverterId || (catalog.microinverters && catalog.microinverters[0] ? catalog.microinverters[0].id : null);
    const miSpec = (catalog.microinverters && catalog.microinverters.find(m => m.id === miId))
      || (catalog.microinverters ? catalog.microinverters[0] : { brand: 'Enphase / Hoymiles', model: 'Microinversor', kw: 0.8 });
    
    items.push({
      type: 'microinverter',
      icon: 'cpu',
      badge: miCount + 'x MICROINVERSORES',
      title: (miSpec.brand || 'MLPE') + ' ' + (miSpec.model || 'Microinversor'),
      specs: (miCount * (miSpec.kw || 0.8)).toFixed(1) + ' kW AC total · Conversión directa en tejado',
      tag: 'Seguimiento MPPT distribuido',
      tagColor: '#10B981',
      price: miCount * (miSpec.price || 175)
    });
  }

  // Baterías / Acumulación
  const batCount = (cfg.autoSizing && cfg.autoSizing.batteries && cfg.autoSizing.batteries.count) || 0;
  const batId = cfg.selectedBatteryId;
  if (batId && batId !== 'bat_none' && batCount > 0) {
    const batSpec = catalog.batteries && catalog.batteries.find(b => b.id === batId);
    if (batSpec && batSpec.kwh > 0) {
      items.push({
        type: 'battery',
        icon: 'battery-charging',
        badge: batCount + 'x MÓDULOS BATERÍA',
        title: (batSpec.brand || 'Batería') + ' ' + (batSpec.model || 'LFP'),
        specs: (batCount * batSpec.kwh).toFixed(1) + ' kWh acumulación útil · ' + (batSpec.type || 'LFP'),
        tag: 'Acoplada en DC / Bus Híbrido',
        tagColor: '#34D399',
        price: batCount * (batSpec.price || 2400)
      });
    }
  }

  // Cuadros de Protección AC y DC (REBT ITC-BT-40)
  items.push({
    type: 'protection',
    icon: 'shield',
    badge: 'CUADRO PROTECCIÓN AC/DC',
    title: 'Sobretensiones Transitorias & Permanentes',
    specs: 'IGA + Diferencial Clase A Inmunizado + Descargador Tipo II (REBT ITC-BT-40/23)',
    tag: 'Protección general de evacuación',
    tagColor: '#E2E8F0',
    price: 380
  });

  if (countBadge) {
    countBadge.textContent = items.length + ' ' + (items.length === 1 ? 'Dispositivo' : 'Dispositivos');
  }

  rackContainer.innerHTML = items.map(item => `
    <div style="background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.08);border-left:3px solid ${item.tagColor};border-radius:4px;padding:6px 8px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;">
        <span style="font-size:9px;font-weight:900;color:${item.tagColor};letter-spacing:0.4px;">
          ${item.badge}
        </span>
        <span style="font-size:9.5px;font-weight:700;color:#F8FAFC;">
          ${item.price.toLocaleString('es-ES')} €
        </span>
      </div>
      <div style="font-size:10.5px;font-weight:800;color:#F1F5F9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
        ${item.title}
      </div>
      <div style="font-size:9.5px;color:#94A3B8;margin-top:2px;line-height:1.25;">
        ${item.specs}
      </div>
      <div style="margin-top:3px;display:flex;justify-content:space-between;align-items:center;font-size:9px;">
        <span style="color:#CBD5E1;background:rgba(255,255,255,0.06);padding:1px 4px;border-radius:3px;">
          📍 ${item.tag}
        </span>
        <span style="color:#10B981;font-weight:700;">
          ✓ En servicio
        </span>
      </div>
    </div>
  `).join('');

  if (typeof window !== 'undefined' && window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }

  // Sincronizar el componente multi-faldón contextual (Fase 1)
  if (typeof wpRenderStep4RoofScopeUI === 'function') {
    wpRenderStep4RoofScopeUI();
  }
}
window.wpRenderElectronicsRackUI = wpRenderElectronicsRackUI;

// ══════════════════════════════════════════════════════════════════════════
// ARQUITECTURA MULTI-FALDÓN EN FASE 4: SCOPE BAR & MAPEO HETEROGÉNEO
// ══════════════════════════════════════════════════════════════════════════

/**
 * Estado interno del visor de faldón en Paso 4
 * activeScope: 'all' | 0 | 1 | 2 ... (índice del faldón)
 */
window.step4RoofScopeState = {
  activeScope: 'all'
};

/**
 * Renderiza la barra de ámbitos contextual (Scope Bar) y la matriz de mapeo por faldón.
 */
function wpRenderStep4RoofScopeUI() {
  const container = document.getElementById('step4-roof-scope-bar');
  const pillsContainer = document.getElementById('step4-roof-scope-pills');
  const countBadge = document.getElementById('step4-roof-scope-count');
  const mappingCard = document.getElementById('step4-roof-mapping-card');
  const mappingTable = document.getElementById('step4-roof-mapping-table');
  const mappingSummaryTag = document.getElementById('step4-mapping-summary-tag');

  if (!container || !pillsContainer) return;

  const polylines = (typeof WP !== 'undefined' && Array.isArray(WP.polylines))
    ? WP.polylines.filter(p => p && p.points && p.points.length >= 3)
    : [];

  // Si solo hay 0 o 1 faldón, la vista estándar global es suficiente
  if (polylines.length <= 1) {
    container.style.display = 'none';
    if (mappingCard) mappingCard.style.display = 'none';
    return;
  }

  container.style.display = 'flex';
  if (countBadge) countBadge.textContent = polylines.length + ' Faldones';
  if (mappingCard) mappingCard.style.display = 'block';
  if (mappingSummaryTag) mappingSummaryTag.textContent = polylines.length + ' Faldones Activos';

  const currentScope = window.step4RoofScopeState.activeScope;

  // Obtener datos SSOT del desglose de módulos
  const mb = (typeof window.RAModulesBreakdown !== 'undefined' && typeof window.RAModulesBreakdown.getProjectModulesBreakdown === 'function')
    ? window.RAModulesBreakdown.getProjectModulesBreakdown()
    : null;

  const roofsData = (mb && Array.isArray(mb.byRoof)) ? mb.byRoof : polylines.map((p, idx) => ({
    roofIndex: idx,
    name: p.name || ('Faldón ' + (idx + 1)),
    panelCount: (p.roofInfo && Array.isArray(p.roofInfo.panels)) ? p.roofInfo.panels.filter(x => !x.deleted).length : 0,
    moduleFullName: 'Módulo Estándar',
    wp: 450,
    kwp: 0,
    tiltDeg: p.tiltDeg || 30,
    azimuthDeg: p.azimuthDeg || 0
  }));

  // Renderizar píldoras del Scope Bar
  const isAllActive = currentScope === 'all';
  let pillsHtml = `
    <button type="button" onclick="wpSetStep4RoofScope('all')" style="flex-shrink:0;padding:4px 8px;border-radius:5px;font-size:9.5px;font-weight:800;cursor:pointer;display:flex;align-items:center;gap:4px;transition:all 0.15s;${isAllActive ? 'background:#38BDF8;color:#0F172A;border:1px solid #38BDF8;' : 'background:rgba(0,0,0,0.4);color:#94A3B8;border:1px solid rgba(255,255,255,0.1);'}">
      <i data-lucide="globe" class="icon-sm"></i> TODA LA INSTALACIÓN
    </button>
  `;

  roofsData.forEach((r, idx) => {
    const isAct = currentScope === idx;
    const nPanels = r.panelCount || 0;
    const kwp = r.kwp ? r.kwp.toFixed(1) : ((nPanels * (r.wp || 450)) / 1000).toFixed(1);
    const label = `F${idx + 1}`;

    pillsHtml += `
      <button type="button" onclick="wpSetStep4RoofScope(${idx})" style="flex-shrink:0;padding:4px 8px;border-radius:5px;font-size:9.5px;font-weight:800;cursor:pointer;display:flex;align-items:center;gap:4px;transition:all 0.15s;${isAct ? 'background:#F59E0B;color:#0F172A;border:1px solid #F59E0B;' : 'background:rgba(0,0,0,0.4);color:#CBD5E1;border:1px solid rgba(255,255,255,0.1);'}">
        <span>🏠 ${label}:</span>
        <span style="font-weight:bold;opacity:0.9;">${nPanels} mod (${kwp} kWp)</span>
      </button>
    `;
  });

  pillsContainer.innerHTML = pillsHtml;

  // Renderizar Matriz de Mapeo por Faldón
  if (mappingTable) {
    const cfg = window.solarProjectConfig || {};
    const globalTopo = cfg.selectedTopology || 'inverter';

    mappingTable.innerHTML = roofsData.map((r, idx) => {
      const isHighlighted = (currentScope === 'all' || currentScope === idx);
      const borderClr = isHighlighted ? (currentScope === idx ? '#F59E0B' : 'rgba(255,255,255,0.12)') : 'rgba(255,255,255,0.04)';
      const opacity = isHighlighted ? '1' : '0.45';
      const poly = polylines[idx];

      // Determinar electrónica asignada al faldón
      const topo = (poly && poly.assignedTopology) ? poly.assignedTopology : globalTopo;
      let topoBadge = '⚡ Inversor String';
      let topoColor = '#38BDF8';
      let mpptDesc = `MPPT ${idx + 1} (String independiente)`;

      if (topo === 'microinverter') {
        topoBadge = '🖲️ Microinversor';
        topoColor = '#10B981';
        mpptDesc = 'MPPT distribuido por panel';
      } else if (topo === 'optimizer') {
        topoBadge = '⚙️ Inversor + MLPE';
        topoColor = '#F59E0B';
        mpptDesc = 'MPPT Central + Optimizador individual';
      }

      const modName = r.moduleFullName || (r.moduleBrand ? `${r.moduleBrand} ${r.moduleModel}` : 'Módulo Solar');
      const kwp = r.kwp ? r.kwp.toFixed(2) : (((r.panelCount || 0) * (r.wp || 450)) / 1000).toFixed(2);
      const nPanels = r.panelCount || 0;

      // Telemetría de cableado por faldón estimada
      const estDcL = Math.round(10 + (idx * 3.5)); // Longitud estimada homerun al faldón
      const estJumpers = Math.max(0, nPanels - 1);

      return `
        <div style="background:rgba(0,0,0,0.3);border:1px solid ${borderClr};border-left:3px solid ${topoColor};border-radius:5px;padding:6px 8px;opacity:${opacity};transition:all 0.2s;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">
            <div style="display:flex;align-items:center;gap:5px;">
              <span style="font-size:10px;font-weight:900;color:#F8FAFC;">
                🏠 F${idx + 1}: ${r.name || ('Faldón ' + (idx + 1))}
              </span>
              <span style="font-size:8.5px;color:#94A3B8;background:rgba(255,255,255,0.06);padding:1px 4px;border-radius:3px;">
                ${r.tiltDeg || 30}° / az ${r.azimuthDeg || 0}°
              </span>
            </div>
            <div style="display:flex;gap:3px;align-items:center;">
              <button type="button" onclick="wpFocusRoofIn3D(${idx})" class="doc-mini-btn" style="padding:1px 5px;font-size:9px;color:#38BDF8;border-color:rgba(56,189,248,0.3);background:rgba(56,189,248,0.1);" title="Centrar cámara 3D en este faldón">
                <i data-lucide="crosshair" class="icon-sm"></i> Ver 3D
              </button>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:9.5px;margin-top:4px;line-height:1.25;">
            <div style="background:rgba(255,255,255,0.03);padding:4px 6px;border-radius:4px;">
              <span style="color:#94A3B8;display:block;font-size:8.5px;text-transform:uppercase;">Placa Fotovoltaica:</span>
              <b style="color:#E2E8F0;">${modName}</b>
              <div style="color:#FBBF24;font-size:9px;font-weight:700;margin-top:1px;">
                ${nPanels} uds · ${kwp} kWp (${r.wp || 450} Wp/ud)
              </div>
            </div>

            <div style="background:rgba(255,255,255,0.03);padding:4px 6px;border-radius:4px;">
              <span style="color:#94A3B8;display:block;font-size:8.5px;text-transform:uppercase;">Electrónica & MPPT:</span>
              <b style="color:${topoColor};">${topoBadge}</b>
              <div style="color:#CBD5E1;font-size:9px;margin-top:1px;">
                ${mpptDesc}
              </div>
            </div>
          </div>

          <!-- FILA ENRIQUECIDA FASE 2: CONEXIONADO ELÉCTRICO, CABLES & CONECTORES DEL FALDÓN -->
          <div style="margin-top:5px;padding-top:4px;border-top:1px dashed rgba(255,255,255,0.07);display:flex;justify-content:space-between;align-items:center;font-size:8.5px;color:#94A3B8;">
            <span style="display:flex;align-items:center;gap:3px;">
              <i data-lucide="git-commit" class="icon-sm" style="color:#38BDF8;"></i> Tirada Homerun DC: <b style="color:#E2E8F0;">~${estDcL} m (ZZ-F 6mm²)</b>
            </span>
            <span style="display:flex;align-items:center;gap:3px;">
              <i data-lucide="link" class="icon-sm" style="color:#F59E0B;"></i> Puentes: <b style="color:#E2E8F0;">${estJumpers} uds</b>
            </span>
            <span style="display:flex;align-items:center;gap:3px;color:#10B981;font-weight:700;">
              <i data-lucide="check" class="icon-sm"></i> Sin sombras cruzadas
            </span>
          </div>
        </div>
      `;
    }).join('');
  }

  if (typeof window.lucide !== 'undefined' && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}
window.wpRenderStep4RoofScopeUI = wpRenderStep4RoofScopeUI;

/**
 * Cambia el ámbito activo de visualización en Paso 4
 * @param {'all' | number} scope 
 */
function wpSetStep4RoofScope(scope) {
  window.step4RoofScopeState.activeScope = scope;
  wpRenderStep4RoofScopeUI();

  // Actualizar semáforo paramétrico para el faldón o global
  if (typeof step3UpdateHardwareSelection === 'function') {
    step3UpdateHardwareSelection();
  }

  // Si se selecciona un faldón concreto, sincronizar cámara y selección 3D
  if (typeof scope === 'number') {
    wpFocusRoofIn3D(scope);
  }
}
window.wpSetStep4RoofScope = wpSetStep4RoofScope;

/**
 * Centra la cámara del visor 3D y resalta el faldón seleccionado
 * @param {number} polyIdx 
 */
function wpFocusRoofIn3D(polyIdx) {
  if (typeof window.ProjectHierarchy !== 'undefined' && typeof window.ProjectHierarchy.selectPolyline === 'function') {
    window.ProjectHierarchy.selectPolyline(polyIdx, true);
  } else if (typeof window.wpSelectPolyline === 'function') {
    window.wpSelectPolyline(polyIdx);
  }
}
window.wpFocusRoofIn3D = wpFocusRoofIn3D;
