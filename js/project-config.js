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

    // Si el inversor seleccionado es virtual y no está en catálogo, inyectarlo destacado al principio
    const vInv = cfg.lastVirtualInverter;
    if (vInv && !catalog.inverters.some(i => i.id === vInv.id)) {
      const isSel = (vInv.id === curVal);
      invOptionsHtml = `<option value="${vInv.id}" ${isSel ? 'selected' : ''} style="color:#F59E0B;font-weight:bold;">⚡ ${vInv.brand} · ${vInv.model} (${vInv.kw} kW · ${vInv.price} €)</option>` + invOptionsHtml;
    }
    invSel.innerHTML = invOptionsHtml;
    if (curVal) invSel.value = curVal;
  }

  // 3. Microinversores
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
  const ctrlInv = document.getElementById('step3-ctrl-inverters');
  const ctrlMi = document.getElementById('step3-ctrl-microinverters');

  if (topo === 'microinverter') {
    if (rowInv) rowInv.style.display = 'none';
    if (rowMi) rowMi.style.display = 'block';
    if (ctrlInv) ctrlInv.style.display = 'none';
    if (ctrlMi) ctrlMi.style.display = 'block';
  } else {
    if (rowInv) rowInv.style.display = 'block';
    if (rowMi) rowMi.style.display = 'none';
    if (ctrlInv) ctrlInv.style.display = 'block';
    if (ctrlMi) ctrlMi.style.display = 'none';
  }

  step3UpdateHardwareSelection();
  if (typeof wpUpdateStep4Checklist === 'function') wpUpdateStep4Checklist();
  if (typeof wpUpdateAutoSizingUI === 'function') wpUpdateAutoSizingUI();
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

  if (invSel && invSel.value) window.solarProjectConfig.selectedInverterId = invSel.value;
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
  if (miSel && miSel.value)   window.solarProjectConfig.selectedMicroinverterId = miSel.value;
  if (batSel && batSel.value) window.solarProjectConfig.selectedBatteryId = batSel.value;

  const catalog = (typeof window !== 'undefined' && window.equipmentCatalog) ? window.equipmentCatalog : ((typeof equipmentCatalog !== 'undefined') ? equipmentCatalog : null);
  if (!catalog) return;

  const inv = (catalog.inverters && catalog.inverters.find(i => i.id === window.solarProjectConfig.selectedInverterId)) || (catalog.inverters && catalog.inverters[0]);
  const mod = (catalog.modules && catalog.modules.find(m => m.id === window.solarProjectConfig.selectedModuleId)) || (catalog.modules && catalog.modules[0]);
  const mi  = (catalog.microinverters && catalog.microinverters.find(m => m.id === window.solarProjectConfig.selectedMicroinverterId)) || (catalog.microinverters && catalog.microinverters[0]);
  const bat = (catalog.batteries && catalog.batteries.find(b => b.id === window.solarProjectConfig.selectedBatteryId)) || (catalog.batteries && catalog.batteries[0]);

  // Coeficientes térmicos bajo CTE / IEC 62548
  const tMin = -10;
  const tMaxCell = 65;
  const gammaVoc = mod.gammaVoc || -0.0028;
  const vOcCold = (mod.voc || 41.5) * (1 + gammaVoc * (tMin - 25));
  const vMpHot = (mod.vmp || 34.5) * (1 + gammaVoc * (tMaxCell - 25));

  const nMaxCold = Math.floor((inv.vDcMax || 1000) / vOcCold);
  const nMinMppt = Math.ceil((inv.vMpptNomMin || 180) / vMpHot);
  const nMaxInvPower = Math.floor(((inv.kw || 5.0) * 1000 * (inv.maxOverload || 1.30)) / (mod.wp || 450));

  window.solarProjectConfig.calculatedLimits = {
    nMinString: Math.max(nMinMppt, 3),
    nMaxString: Math.min(nMaxCold, 24),
    nMaxTotalModules: nMaxInvPower,
    inverter: inv,
    module: mod,
    microinverter: mi,
    battery: bat
  };

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
  if (elNmax) elNmax.textContent = 'Máx. ' + window.solarProjectConfig.calculatedLimits.nMaxString + ' placas';
  if (elNmin) elNmin.textContent = 'Mín. ' + window.solarProjectConfig.calculatedLimits.nMinString + ' placas';
  if (elTot)  elTot.textContent  = window.solarProjectConfig.calculatedLimits.nMaxTotalModules + ' placas (' + ((window.solarProjectConfig.calculatedLimits.nMaxTotalModules * (mod.wp || 450)) / 1000).toFixed(1) + ' kWp)';

  // Verificación de Corriente Operativa Máxima Imp vs MPPT (Prevención de Clipping)
  // Se evalúa la corriente real que ingresa al canal MPPT más cargado (reparto entre MPPTs e inversores)
  const _modPanels = (typeof simulatedPanelEntities !== 'undefined' && Array.isArray(simulatedPanelEntities)) ? simulatedPanelEntities.length : 0;
  const _modsPerStr = Math.max(3, (window.solarProjectConfig.calculatedLimits && window.solarProjectConfig.calculatedLimits.nMinString) || 12);
  const _realStrings = (typeof electricalStrings !== 'undefined' && Array.isArray(electricalStrings) && electricalStrings.length > 0)
    ? electricalStrings.length
    : ((typeof window.electricalStrings !== 'undefined' && Array.isArray(window.electricalStrings) && window.electricalStrings.length > 0)
      ? window.electricalStrings.length
      : (_modPanels > 0 ? Math.max(1, Math.ceil(_modPanels / _modsPerStr)) : 1));

  const _invCount = (window.solarProjectConfig && window.solarProjectConfig.autoSizing && window.solarProjectConfig.autoSizing.inverters && window.solarProjectConfig.autoSizing.inverters.count)
    ? Math.max(1, window.solarProjectConfig.autoSizing.inverters.count)
    : 1;
  const _mpptChannelsPerInv = Math.max(1, inv.mppt || 2);
  const _totalMpptChannels = _invCount * _mpptChannelsPerInv;
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
    let hasBallast = false;
    if (typeof WP !== 'undefined' && WP && Array.isArray(WP.polylines)) {
      hasBallast = WP.polylines.some(pl => pl && pl.modStructure && (pl.modStructure.indexOf('triangle') !== -1 || pl.modStructure === 'ballasted'));
    }
    const structWeightPerMod = hasBallast ? (90.0 + 6.5) : 6.5; // Lastre hormigón 2x45kg + perfiles vs coplanar
    const kgPerM2 = (modWeightKg + structWeightPerMod) / modArea;
    const isSafe = kgPerM2 <= 25.0;
    elLoad.textContent = '~' + kgPerM2.toFixed(1) + ' kg/m² (' + (isSafe ? 'Admisible' : '⚠️ Requiere Verificación CTE') + ')';
    elLoad.style.color = isSafe ? '#38BDF8' : '#F59E0B';
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

  // Ejecutar motor de dimensionamiento automático multi-equipo
  const currentTotalPanels = (typeof lastRoofInfo !== 'undefined' && lastRoofInfo && lastRoofInfo.panels) ? lastRoofInfo.panels.length : 0;
  wpComputeAutoSizing(currentTotalPanels > 0 ? currentTotalPanels : undefined);

  // <i data-lucide=\"lightbulb\" class=\"icon-sm\"></i> Actualizar tarjeta de razonamiento de equipos para cliente/ingeniero
  if (typeof EngineeringExplainer !== 'undefined' && typeof EngineeringExplainer.renderEquipmentJustificationUI === 'function') {
    EngineeringExplainer.renderEquipmentJustificationUI('step3-engineering-explainer-container');
  }
  if (typeof wpUpdateInverterSmartAssistantUI === 'function') {
    wpUpdateInverterSmartAssistantUI();
  }
  if (typeof wpUpdateStep4Checklist === 'function') {
    wpUpdateStep4Checklist();
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
    } else {
      const limits = cfg.calculatedLimits;
      if (limits && limits.nMaxString >= (limits.nMinString || 5)) {
        chkStr.textContent = '✓ Strings: ' + limits.nMinString + '-' + limits.nMaxString + ' mods';
        chkStr.style.color = '#10B981';
        chkStr.style.background = 'rgba(16,185,129,0.15)';
        chkStr.style.borderColor = 'rgba(16,185,129,0.3)';
      } else {
        chkStr.textContent = '📏 Strings MPPT';
        chkStr.style.color = '#38BDF8';
        chkStr.style.background = 'rgba(56,189,248,0.15)';
        chkStr.style.borderColor = 'rgba(56,189,248,0.3)';
      }
    }
  }

  if (chkRebt) {
    chkRebt.textContent = '✓ REBT: ΔV ≤ 1.5%';
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
  const inv = (catalog.inverters && catalog.inverters.find(i => i.id === cfg.selectedInverterId)) || (catalog.inverters && catalog.inverters[0]) || { kw: 5.0, maxOverload: 1.30 };
  const mi  = (catalog.microinverters && catalog.microinverters.find(m => m.id === cfg.selectedMicroinverterId)) || (catalog.microinverters && catalog.microinverters[0]) || { model: '', type: '' };
  const bat = (catalog.batteries && catalog.batteries.find(b => b.id === cfg.selectedBatteryId)) || (catalog.batteries && catalog.batteries[0]) || { kwh: 0 };

  const totalKwp = (count * (mod.wp || 450)) / 1000.0;

  // 1. Inversores String Requeridos:
  const invNomKw = inv.kw || 5.0;
  const maxOverloadRatio = inv.maxOverload || 1.30;
  const maxKwInput = invNomKw * maxOverloadRatio;
  const autoInvertersByPower = Math.max(1, Math.ceil(totalKwp / maxKwInput));

  // 1b. Verificación de Canales MPPT Físicos e Incompatibilidad de Orientación (IEC 62548 / REBT)
  let autoInvertersByMppt = 1;
  try {
    const invMppt = (inv && Number.isFinite(inv.mppt) && inv.mppt > 0) ? inv.mppt : 2;
    const invInputs = (inv && Number.isFinite(inv.inputsPerMppt) && inv.inputsPerMppt > 0) ? inv.inputsPerMppt : 1;

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

      // Agrupar strings por orientación homogénea (Δβ <= 5°, Δγ <= 10°)
      const orientationGroups = [];
      stringsMap.forEach(str => {
        let matched = null;
        for (const grp of orientationGroups) {
          const dTilt = Math.abs(grp.tilt - str.tilt);
          let dAz = Math.abs(grp.az - str.az);
          if (dAz > 180) dAz = 360 - dAz;
          if (dTilt <= 5.0 && dAz <= 10.0) {
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
  if (bat && bat.kwh && bat.kwh > 0) {
    autoBats = Math.max(1, Math.ceil(totalKwp / bat.kwh));
  }

  // Actualizar estado en autoSizing
  if (!cfg.autoSizing) cfg.autoSizing = {};
  if (!cfg.autoSizing.inverters) cfg.autoSizing.inverters = { count: 1, autoCount: 1, isManual: false };
  if (!cfg.autoSizing.microinverters) cfg.autoSizing.microinverters = { count: 0, autoCount: 0, isManual: false };
  if (!cfg.autoSizing.batteries) cfg.autoSizing.batteries = { count: 0, autoCount: 0, isManual: false };

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
  if (!cfg.autoSizing.batteries.isManual || cfg.autoSizing.batteries.count > autoBats * 2 || autoBats > cfg.autoSizing.batteries.count * 3) {
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
      warningHtml = '<br><span style="color:var(--rose-400);font-size:9.5px;font-weight:bold;margin-top:2px;display:inline-block;"><i data-lucide="alert-triangle" class="icon-sm"></i> PELIGRO REBT/IEC: Sobrecarga DC/AC (' + totalKwp.toFixed(2) + ' kWp &gt; ' + maxTotalInput.toFixed(2) + ' kW máx). ¡Añada inversores!</span>';
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
      miWarningHtml = '<br><span style="color:var(--rose-400);font-size:9.5px;font-weight:bold;margin-top:2px;display:inline-block;"><i data-lucide="alert-triangle" class="icon-sm"></i> PELIGRO IEC: Faltan entradas (' + count + ' placas &gt; ' + maxPanels + ' permitidas). ¡Añada equipos!</span>';
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

  const batCount = (cfg.autoSizing && cfg.autoSizing.batteries) ? cfg.autoSizing.batteries.count : 0;
  const totalBatCost = (bat && bat.kwh > 0) ? (batCount * (bat.price || 0)) : 0;

  if (invCostEl) invCostEl.value = Math.round(totalInvCost);
  if (batCostEl) batCostEl.value = Math.round(totalBatCost);
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
    shadingDiagnostics: shading
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
    bestScenario = match.recommendedScenarioA || match.recommendedScenarioB;
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
  if (bestTopology !== 'microinverter' && bestScenario && bestScenario.inverter && bestScenario.isVirtual) {
    cfg.lastVirtualInverter = bestScenario.inverter;
    if (Array.isArray(catalog.inverters) && !catalog.inverters.some(i => i.id === bestScenario.inverter.id)) {
      catalog.inverters.push(bestScenario.inverter);
    }
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
      <div style="background:rgba(30,41,59,0.7);border:1px solid rgba(148,163,184,0.3);border-radius:8px;padding:8px;display:flex;justify-content:space-between;align-items:center;">
        <div style="font-size:9.5px;color:#94A3B8;">
          <b style="color:#FBBF24;">⚡ Equipo manual seleccionado.</b> Puedes restablecer la auto-casación o comparar alternativas.
        </div>
        <div style="display:flex;gap:4px;align-items:center;">
          <button type="button" class="doc-mini-btn" onclick="wpOpenSmartInverterMatchingModal()" style="background:rgba(56,189,248,0.2);border:1px solid #38BDF8;color:#38BDF8;font-size:8.5px;font-weight:bold;padding:3px 6px;cursor:pointer;" title="Comparar alternativas técnicas 1x Central vs Nx Modulares vs MLPE">
            <i data-lucide="sparkles" class="icon-sm"></i> COMPARAR 1X VS NX
          </button>
          <button type="button" class="doc-mini-btn" onclick="wpAutoSelectOptimalEngineering(true)" style="background:rgba(16,185,129,0.15);border:1px solid #10B981;color:#34D399;font-size:8.5px;font-weight:bold;padding:3px 6px;cursor:pointer;">
            <i data-lucide="rotate-ccw" class="icon-sm"></i> AUTO-OPTIMIZAR
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
    const modelsHtml = comModels.length > 0 ? `
      <div style="font-size:8px;color:#94A3B8;margin-bottom:6px;">
        <b style="color:#CBD5E1;">Equipos de mercado sugeridos:</b>
        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:3px;">
          ${comModels.map(m => `<span style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:3px;padding:1px 5px;color:#CBD5E1;">${m.brand} ${m.model} (${m.kw} kW)</span>`).join('')}
        </div>
      </div>
    ` : '';

    banner.innerHTML = `
      <div style="background:linear-gradient(135deg, rgba(30,27,75,0.92), rgba(15,23,42,0.92));border:1px solid #F59E0B;border-radius:8px;padding:8px;box-shadow:0 0 12px rgba(245,158,11,0.2);margin-bottom:6px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:3px;">
          <span style="font-size:10px;font-weight:900;color:#FBBF24;">
            <i data-lucide="alert-triangle" class="icon-sm"></i> CATÁLOGO INSUFICIENTE: INVERSOR VIRTUAL ACTIVADO
          </span>
          <div style="display:flex;gap:4px;align-items:center;">
            <span class="card-tag" style="background:rgba(245,158,11,0.2);color:#FBBF24;font-size:9px;font-weight:bold;">
              ⚡ PARÁMETRICO IDEAL
            </span>
            <button type="button" class="doc-mini-btn" onclick="wpOpenSmartInverterMatchingModal()" style="background:rgba(56,189,248,0.2);border:1px solid #38BDF8;color:#38BDF8;font-size:8.5px;font-weight:bold;padding:2px 6px;cursor:pointer;" title="Comparar alternativas técnicas 1x Central vs Nx Modulares vs MLPE">
              <i data-lucide="sparkles" class="icon-sm"></i> COMPARAR 1X VS NX
            </button>
          </div>
        </div>
        <div style="font-size:8.5px;color:#FCD34D;background:rgba(245,158,11,0.12);padding:4px 6px;border-radius:4px;margin-bottom:5px;border-left:3px solid #F59E0B;line-height:1.3;">
          <b>Cuello de Botella Físico:</b> ${info.bottleneckReason || 'Requisitos del proyecto no cubiertos por los equipos disponibles.'}
        </div>
        <div style="font-size:9px;color:#E2E8F0;line-height:1.35;margin-bottom:4px;">
          <b>Inversor Ideal Auto-Generado:</b> ${sc.count}× ${sc.inverter.brand} ${sc.inverter.model} (${sc.totalAcKw} kW AC · ${sc.mpptCount} MPPTs · Sobrecarga: ${sc.overloadPct}%)
        </div>
        ${modelsHtml}
        <div style="display:flex;gap:6px;align-items:center;margin-top:6px;border-top:1px solid rgba(255,255,255,0.08);padding-top:5px;">
          <button type="button" class="doc-mini-btn" onclick="wpSaveVirtualInverterToCatalog()" style="background:rgba(245,158,11,0.25);border:1px solid #F59E0B;color:#FBBF24;font-size:9px;font-weight:bold;padding:3px 7px;cursor:pointer;" title="Guardar este inversor en el catálogo definitivo">
            <i data-lucide="save" class="icon-sm"></i> GUARDAR EN CATÁLOGO
          </button>
          <button type="button" class="doc-mini-btn" onclick="openEquipmentCatalogModal('ai_import')" style="background:rgba(56,189,248,0.15);border:1px solid #38BDF8;color:#38BDF8;font-size:9px;font-weight:bold;padding:3px 7px;cursor:pointer;" title="Importar PDF técnico de inversor real con IA">
            <i data-lucide="sparkles" class="icon-sm"></i> SUBIR PDF CON IA
          </button>
          <button type="button" class="doc-mini-btn" onclick="openEquipmentCatalogModal('inverters')" style="background:rgba(148,163,184,0.15);border:1px solid #94A3B8;color:#CBD5E1;font-size:9px;font-weight:bold;padding:3px 7px;cursor:pointer;" title="Abrir catálogo">
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
    <div style="background:linear-gradient(135deg, rgba(15,23,42,0.92), rgba(30,41,59,0.88));border:1px solid ${topoColors[info.topology] || '#38BDF8'};border-radius:8px;padding:8px;box-shadow:0 0 10px rgba(56,189,248,0.15);margin-bottom:6px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:3px;">
        <span style="font-size:10px;font-weight:900;color:${topoColors[info.topology] || '#38BDF8'};">
          <i data-lucide="cpu" class="icon-sm"></i> AUTO-INGENIERÍA INTELIGENTE: ${topoLabels[info.topology] || info.topology}
        </span>
        <div style="display:flex;gap:4px;align-items:center;">
          <span class="card-tag" style="background:rgba(16,185,129,0.2);color:#34D399;font-size:9px;font-weight:bold;">
            ✓ CASACIÓN ÓPTIMA
          </span>
          <button type="button" class="doc-mini-btn" onclick="wpOpenSmartInverterMatchingModal()" style="background:rgba(56,189,248,0.2);border:1px solid #38BDF8;color:#38BDF8;font-size:8.5px;font-weight:bold;padding:2px 6px;cursor:pointer;" title="Comparar alternativas técnicas: 1x Central vs Nx Modulares vs MLPE">
            <i data-lucide="sparkles" class="icon-sm"></i> COMPARAR 1X VS NX
          </button>
        </div>
      </div>
      <div style="font-size:9px;color:#E2E8F0;line-height:1.35;margin-bottom:4px;">
        ${(info.topology === 'microinverter' || (sc && sc.isMicro))
          ? `<b>Equipo Asignado:</b> ${sc.count}× Microinversores 2-en-1 ${sc.inverter.brand} ${sc.inverter.model} (${sc.totalAcKw} kW AC total · Seguimiento panel a panel · Inmune a sombras)`
          : `<b>Equipo Asignado:</b> ${sc.count}× ${sc.inverter.brand} ${sc.inverter.model} (${sc.totalAcKw} kW AC · ${sc.mpptCount} MPPTs · Sobrecarga: ${sc.overloadPct}%)`}
      </div>
      <div style="font-size:8.5px;color:#94A3B8;line-height:1.3;">
        <b>Criterio Físico:</b> ${info.rationale} (${info.distinctOrientations} ${info.distinctOrientations === 1 ? 'orientación' : 'orientaciones distintas'}, ${info.totalPanels} placas · ${info.totalKwp.toFixed(1)} kWp).
      </div>
    </div>
  `;
  banner.style.display = 'block';
  if (window.lucide && typeof window.lucide.createIcons === 'function') try { window.lucide.createIcons(); } catch(e) {}
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

  if (typeof populateHardwareDropdowns === 'function') populateHardwareDropdowns();
  if (typeof step3UpdateHardwareSelection === 'function') step3UpdateHardwareSelection();

  wpAutoSelectOptimalEngineering(true);

  if (typeof showStatus === 'function') {
    showStatus(`✓ INVERSOR "${cleanInv.brand} ${cleanInv.model}" GUARDADO EN CATÁLOGO`, 3500);
  } else if (typeof showToast === 'function') {
    showToast('CATÁLOGO ACTUALIZADO', `El inversor ${cleanInv.model} ha sido guardado permanentemente.`, 'success', 3500);
  }
}

window.wpAutoSelectOptimalEngineering = wpAutoSelectOptimalEngineering;
window.wpRenderAutoEngineeringBanner = wpRenderAutoEngineeringBanner;
window.wpSaveVirtualInverterToCatalog = wpSaveVirtualInverterToCatalog;
