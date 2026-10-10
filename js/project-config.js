window.solarProjectConfig = {
  selectedModuleId: 'ja_550',
  selectedInverterId: 'inv_huawei_10k',
  selectedMicroinverterId: 'mlpe_hoymiles_800',
  selectedBatteryId: 'bat_none',
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
    batteries: { count: 0, autoCount: 0, isManual: false }
  },
  calculatedLimits: { nMinString: 5, nMaxString: 13, nMaxTotalModules: 22 }
};
// ── window.RA alias (Arquitectura v2) ────────────────────────────────────
window.RA.projectConfig = window.solarProjectConfig;

function populateStep3EquipmentSelectors() {
  const catalog = (typeof equipmentCatalog !== 'undefined') ? equipmentCatalog : null;
  if (!catalog) return;

  const cfg = window.solarProjectConfig || {};

  // 1. Módulos FV (Sincronizado entre Paso 2 Campo Solar y Paso 4 Equipos)
  const curModVal = cfg.selectedModuleId || (catalog.modules[0] ? catalog.modules[0].id : '');
  const modOptionsHtml = catalog.modules.map(m => {
    const isSel = (m.id === curModVal);
    return '<option value="' + m.id + '"' + (isSel ? ' selected' : '') + '>' +
      m.brand + ' · ' + m.model + ' (' + m.wp + ' Wp · ' + m.l.toFixed(2) + '×' + m.w.toFixed(2) + 'm · ' + m.price + ' €)' +
    '</option>';
  }).join('');

  const modSel = document.getElementById('step3-sel-module');
  if (modSel) modSel.innerHTML = modOptionsHtml;

  const modSel2 = document.getElementById('step2-sel-module');
  if (modSel2) {
    modSel2.innerHTML = modOptionsHtml;
    if (typeof wpUpdateStep2ModuleBadge === 'function') wpUpdateStep2ModuleBadge();
  }

  // 2. Inversores
  const invSel = document.getElementById('step3-sel-inverter');
  if (invSel) {
    const curVal = cfg.selectedInverterId || (catalog.inverters[1] ? catalog.inverters[1].id : catalog.inverters[0].id);
    invSel.innerHTML = catalog.inverters.map(i => {
      const isSel = (i.id === curVal);
      return '<option value="' + i.id + '"' + (isSel ? ' selected' : '') + '>' +
        i.brand + ' · ' + i.model + ' (' + i.kw + ' kW · ' + i.mppt + ' MPPT · ' + (i.maxOverload ? Math.round(i.maxOverload*100) : 130) + '% DC · ' + i.price + ' €)' +
      '</option>';
    }).join('');
  }

  // 3. Microinversores
  const miSel = document.getElementById('step3-sel-microinverter');
  if (miSel) {
    const curVal = cfg.selectedMicroinverterId || (catalog.microinverters[0] ? catalog.microinverters[0].id : '');
    miSel.innerHTML = catalog.microinverters.map(mi => {
      const isSel = (mi.id === curVal);
      return '<option value="' + mi.id + '"' + (isSel ? ' selected' : '') + '>' +
        mi.brand + ' · ' + mi.model + ' (' + Math.round(mi.kw * 1000) + ' W · ' + (mi.type || 'MLPE') + ' · ' + mi.price + ' €)' +
      '</option>';
    }).join('');
  }

  // 4. Baterías
  const batSel = document.getElementById('step3-sel-battery');
  if (batSel) {
    const curVal = cfg.selectedBatteryId || (catalog.batteries[0] ? catalog.batteries[0].id : '');
    batSel.innerHTML = catalog.batteries.map(b => {
      const isSel = (b.id === curVal);
      const capTxt = b.kwh > 0 ? (b.kwh + ' kWh · ' + b.price + ' €') : 'Sin almacenamiento adicional';
      return '<option value="' + b.id + '"' + (isSel ? ' selected' : '') + '>' +
        b.brand + ' · ' + b.model + ' (' + capTxt + ')' +
      '</option>';
    }).join('');
  }

  if (typeof wpUpdateCableRoutesUI === 'function') {
    wpUpdateCableRoutesUI();
  }
}

function step3SetTopology(topo) {
  if (!window.solarProjectConfig) window.solarProjectConfig = {};
  window.solarProjectConfig.selectedTopology = topo;

  ['inverter', 'micro', 'optim'].forEach(k => {
    const btn = document.getElementById('step3-topo-' + k);
    if (btn) btn.classList.toggle('active', (k === 'inverter' && topo === 'inverter') || (k === 'micro' && topo === 'microinverter') || (k === 'optim' && topo === 'optimizer'));
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
    });
  }

  const selStep3 = document.getElementById('step3-sel-module');
  if (selStep3) selStep3.value = id;

  if (typeof equipmentCatalog !== 'undefined' && equipmentCatalog && Array.isArray(equipmentCatalog.modules)) {
    const m = equipmentCatalog.modules.find(x => x.id === id);
    if (m && typeof panelConfig !== 'undefined') {
      panelConfig.potencia = m.wp || 450;
      panelConfig.largo = m.l || 2.10;
      panelConfig.ancho = m.w || 1.05;
      panelConfig.precio = m.price || 115;
      panelConfig.modelo = (m.brand || '') + ' ' + (m.model || '');
      panelConfig.rendimiento = m.eff || 21.5;
    }
  }

  if (typeof step3UpdateHardwareSelection === 'function') {
    step3UpdateHardwareSelection();
  }
  wpUpdateStep2ModuleBadge();
  if (typeof step5RegenerateLayout === 'function') {
    step5RegenerateLayout();
  }
  if (typeof BOMTreeEngine !== 'undefined' && typeof BOMTreeEngine.refresh === 'function') {
    BOMTreeEngine.refresh();
  }
}
window.step2SelectModule = step2SelectModule;

function wpUpdateStep2ModuleBadge() {
  const catalog = (typeof equipmentCatalog !== 'undefined') ? equipmentCatalog : null;
  const cfg = window.solarProjectConfig || {};
  const badge = document.getElementById('step2-module-spec-badge');
  if (!catalog || !badge) return;
  const mod = catalog.modules.find(m => m.id === cfg.selectedModuleId) || catalog.modules[0];
  if (mod) {
    badge.innerHTML = '<span><i data-lucide=\"ruler\" class=\"icon-sm\"></i> ' + (mod.l || 2.1).toFixed(2) + '×' + (mod.w || 1.05).toFixed(2) + 'm · ' + (mod.wp || 450) + ' Wp</span><span style="color:#38BDF8;font-weight:bold;">' + (mod.eff ? (mod.eff + '%') : '') + ' · ' + (mod.price || 115) + ' €</span>';
  }
}
window.wpUpdateStep2ModuleBadge = wpUpdateStep2ModuleBadge;

function step3UpdateHardwareSelection() {
  const invSel = document.getElementById('step3-sel-inverter');
  const modSel = document.getElementById('step3-sel-module');
  const modSel2 = document.getElementById('step2-sel-module');
  const miSel  = document.getElementById('step3-sel-microinverter');
  const batSel = document.getElementById('step3-sel-battery');

  if (invSel && invSel.value) window.solarProjectConfig.selectedInverterId = invSel.value;
  if (modSel && modSel.value) {
    // [FIX-MÓDULOS] Sólo fijar el default GLOBAL del proyecto. Antes este bloque
    // reescribía poly.moduleId de TODOS los faldones en cada cambio de hardware
    // (inversor, batería, edición de catálogo...), propagando el módulo de un
    // faldón al resto y destruyendo la asignación individual. Los faldones sin
    // moduleId propio heredan el global en tiempo de cálculo
    // (computeSinglePolylineRoofInfo: poly.moduleId || selectedModuleId).
    window.solarProjectConfig.selectedModuleId = modSel.value;

    if (modSel2 && modSel2.value !== modSel.value) modSel2.value = modSel.value;
    if (typeof wpUpdateStep2ModuleBadge === 'function') wpUpdateStep2ModuleBadge();
    
    // SSOT Sync: Actualizar panelConfig global automáticamente
    if (typeof equipmentCatalog !== 'undefined' && equipmentCatalog && Array.isArray(equipmentCatalog.modules)) {
      const m = equipmentCatalog.modules.find(x => x.id === modSel.value);
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

  const catalog = (typeof equipmentCatalog !== 'undefined') ? equipmentCatalog : null;
  if (!catalog) return;

  const inv = catalog.inverters.find(i => i.id === window.solarProjectConfig.selectedInverterId) || catalog.inverters[0];
  const mod = catalog.modules.find(m => m.id === window.solarProjectConfig.selectedModuleId) || catalog.modules[0];
  const mi  = catalog.microinverters.find(m => m.id === window.solarProjectConfig.selectedMicroinverterId) || catalog.microinverters[0];
  const bat = catalog.batteries.find(b => b.id === window.solarProjectConfig.selectedBatteryId) || catalog.batteries[0];

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

  // <i data-lucide=\"rocket\" class=\"icon-sm\"></i> Verificación de Corriente Operativa Máxima Imp vs MPPT (Prevención de Clipping)
  const elImp = document.getElementById('step3-spec-imp-check');
  if (elImp) {
    const modImp = mod.imp || 13.0;
    const invImaxOper = inv.iMaxOperA || (inv.iMaxScA ? Math.round(inv.iMaxScA * 0.75 * 10) / 10 : 15.0);
    const hasClipping = modImp > invImaxOper;
    elImp.textContent = modImp.toFixed(1) + ' A ≤ ' + invImaxOper.toFixed(1) + ' A (' + (hasClipping ? '<i data-lucide=\"alert-triangle\" class=\"icon-sm\"></i> CLIPPING' : 'Óptimo') + ')';
    elImp.style.color = hasClipping ? '#F59E0B' : '#10B981';
  }

  // <i data-lucide=\"rocket\" class=\"icon-sm\"></i> Verificación de Seguridad de Intensidad de Cortocircuito (Isc vs Imax_inversor)
  const elIsc = document.getElementById('step3-spec-isc-check');
  if (elIsc) {
    const modIsc = mod.isc || 14.0;
    const invImaxSc = inv.iMaxScA || 30.0;
    const isSafe = modIsc <= invImaxSc;
    elIsc.textContent = modIsc.toFixed(1) + ' A ≤ ' + invImaxSc.toFixed(1) + ' A (' + (isSafe ? 'OK' : '<i data-lucide=\"alert-triangle\" class=\"icon-sm\"></i> ATENCIÓN') + ')';
    elIsc.style.color = isSafe ? '#10B981' : '#EF4444';
  }

  // <i data-lucide=\"rocket\" class=\"icon-sm\"></i> Estimación de Sobrecarga Estructural en Cubierta (Normativa CTE DB-SE-AE)
  const elLoad = document.getElementById('step3-spec-roof-load');
  if (elLoad) {
    const modArea = (mod.l || 2.10) * (mod.w || 1.05);
    const modWeightKg = 24.5; // Peso promedio panel Tier-1 72/54 celdas con marco de aluminio
    const ballastAndStructKg = 12.0; // Estructura coplanar o lastrada de aluminio / hormigón
    const kgPerM2 = (modWeightKg + ballastAndStructKg) / modArea;
    elLoad.textContent = '~' + kgPerM2.toFixed(1) + ' kg/m² (' + (kgPerM2 < 25 ? 'Admisible' : 'Verificar Techo') + ')';
    elLoad.style.color = kgPerM2 < 25 ? '#38BDF8' : '#F59E0B';
  }

  // <i data-lucide=\"rocket\" class=\"icon-sm\"></i> Reactividad 3D Inmediata: Si hay cubiertas/faldones definidos, regenerar el campo 3D con el nuevo módulo
  const hasPolys = typeof WP !== 'undefined' && WP && WP.polylines && WP.polylines.some(pl => pl && pl.points && pl.points.length >= 3);
  const hasPolyPoints = typeof polygonPoints !== 'undefined' && polygonPoints && polygonPoints.length >= 3;
  if (hasPolys || hasPolyPoints) {
    if (typeof roofPanelsCache !== 'undefined' && roofPanelsCache) roofPanelsCache.sig = "";
    if (hasPolys && typeof computeSinglePolylineRoofInfo === 'function') {
      WP.polylines.forEach(poly => {
        if (poly && poly.points && poly.points.length >= 3) {
          poly.roofInfo = computeSinglePolylineRoofInfo(poly.points, poly);
        }
      });
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
  }

  // Ejecutar motor de dimensionamiento automático multi-equipo
  const currentTotalPanels = (typeof lastRoofInfo !== 'undefined' && lastRoofInfo && lastRoofInfo.panels) ? lastRoofInfo.panels.length : 0;
  wpComputeAutoSizing(currentTotalPanels > 0 ? currentTotalPanels : undefined);

  // <i data-lucide=\"lightbulb\" class=\"icon-sm\"></i> Actualizar tarjeta de razonamiento de equipos para cliente/ingeniero
  if (typeof EngineeringExplainer !== 'undefined' && typeof EngineeringExplainer.renderEquipmentJustificationUI === 'function') {
    EngineeringExplainer.renderEquipmentJustificationUI('step3-engineering-explainer-container');
  }
}

function wpComputeAutoSizing(forcedCount) {
  let count = (typeof forcedCount === 'number' && forcedCount > 0) ? forcedCount : 0;
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

  const catalog = (typeof equipmentCatalog !== 'undefined') ? equipmentCatalog : null;
  if (!catalog) return;

  const cfg = window.solarProjectConfig;
  const mod = catalog.modules.find(m => m.id === cfg.selectedModuleId) || catalog.modules[0];
  const inv = catalog.inverters.find(i => i.id === cfg.selectedInverterId) || catalog.inverters[0];
  const mi  = catalog.microinverters.find(m => m.id === cfg.selectedMicroinverterId) || catalog.microinverters[0];
  const bat = catalog.batteries.find(b => b.id === cfg.selectedBatteryId) || catalog.batteries[0];

  const totalKwp = (count * (mod.wp || 450)) / 1000.0;

  // 1. Inversores String Requeridos:
  const invNomKw = inv.kw || 5.0;
  const maxOverloadRatio = inv.maxOverload || 1.30;
  const maxKwInput = invNomKw * maxOverloadRatio;
  const autoInverters = Math.max(1, Math.ceil(totalKwp / maxKwInput));

  // 2. Microinversores MLPE:
  let ratio = 1;
  const miTxt = ((mi.model || '') + ' ' + (mi.type || '')).toLowerCase();
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

  cfg.autoSizing.inverters.autoCount = autoInverters;
  if (!cfg.autoSizing.inverters.isManual || cfg.autoSizing.inverters.count > autoInverters * 2 || autoInverters > cfg.autoSizing.inverters.count * 3) {
    if (cfg.autoSizing.inverters.isManual && cfg.autoSizing.inverters.count !== autoInverters) {
      console.log('[RA-AutoSizing] Auto-resetting manual inverter count due to drastic layout change');
      cfg.autoSizing.inverters.isManual = false;
    }
    cfg.autoSizing.inverters.count = autoInverters;
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
    if (invIsMan) {
      explainInv.innerHTML = '<span style="color:var(--sky-400);font-weight:bold;"><i data-lucide=\"edit-2\" class=\"icon-sm\"></i> MANUAL: ' + invCount + ' uds</span> (Auto calculó ' + invAuto + ' uds · ' + panelsPerInv + ' placas/inv en ' + totalMppts + ' MPPTs)';
    } else {
      explainInv.innerHTML = '<span style="color:var(--emerald-400);font-weight:bold;"><i data-lucide=\"zap\" class=\"icon-sm\"></i> AUTO: ' + invCount + ' ' + (invCount === 1 ? 'inversor' : 'inversores') + '</span> (' + totalKwp.toFixed(2) + ' kWp / ' + (maxKwInput || 6.5).toFixed(2) + ' kWp máx · ' + panelsPerInv + ' placas/inv en ' + totalMppts + ' MPPTs)';
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
    if (miIsMan) {
      explainMi.innerHTML = '<span style="color:var(--sky-400);font-weight:bold;"><i data-lucide=\"edit-2\" class=\"icon-sm\"></i> MANUAL: ' + miCount + ' uds</span> (Auto calculó ' + miAuto + ' uds)';
    } else {
      explainMi.innerHTML = '<span style="color:var(--emerald-400);font-weight:bold;"><i data-lucide=\"zap\" class=\"icon-sm\"></i> AUTO: ' + miCount + ' uds</span> (' + ratio + ' placas por microinversor)';
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

// <i data-lucide=\"rocket\" class=\"icon-sm\"></i> PREVISUALIZACIÓN RÁPIDA 3D DESDE EL PASO 3 (SIN CAMBIAR EL STEP ACTIVO)
function wpQuickPreview3DFromStep3() {
  const hasPolys = typeof WP !== 'undefined' && WP && WP.polylines && WP.polylines.length > 0;
  if (!hasPolys && (!polygonPoints || polygonPoints.length < 3)) {
    showStatus('<i data-lucide=\"alert-triangle\" class=\"icon-sm\"></i> TRAZA PRIMERO UN FALDÓN O CONTORNO EN EL PASO 2', 3000);
    if (typeof showToast === 'function') showToast('SIN CONTORNO', 'Dibuja al menos una polilínea en el Paso 2 para previsualizar en 3D.', 'warning', 3000);
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

function step4UpdateObjective() {
  const radios = document.getElementsByName('project_objective');
  for (let r of radios) {
    if (r.checked) {
      window.solarProjectConfig.selectedObjective = r.value;
      break;
    }
  }
  const obj = window.solarProjectConfig.selectedObjective;
  showStatus('CRITERIO TÉCNICO FV ACTUALIZADO: ' + obj.toUpperCase(), 2000);
  // Auto-refresh: regenerar distribución de paneles al cambiar criterio
  if (typeof isPolygonDesignConfirmed !== 'undefined') isPolygonDesignConfirmed = true;
  if (typeof wpFastRenderSimulatedPanels === 'function') {
    wpFastRenderSimulatedPanels();
  } else if (typeof step5RegenerateLayout === 'function') {
    step5RegenerateLayout();
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

// Alias retrocompatible
