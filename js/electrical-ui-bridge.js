// ============================================================================
// js/electrical-ui-bridge.js — Puente UI y Colocación Eléctrica 3D (Fase B3)
// ============================================================================
function wpStartBatteryPlacement() {
  if (!window.inverterEquipmentState) window.inverterEquipmentState = {};
  window.inverterEquipmentState.isPlacingBattery = true;
  window.inverterEquipmentState.isPlacing = false;
  if (window.inverterEquipmentState.gridMeter) window.inverterEquipmentState.gridMeter.isPlacing = false;
  if (window.inverterEquipmentState.combinerBox) window.inverterEquipmentState.combinerBox.isPlacing = false;

  // Si no hay batería seleccionada, seleccionar automáticamente una batería LFP Tier-1 de 5kWh
  const cfg = window.solarProjectConfig = window.solarProjectConfig || {};
  if (!cfg.selectedBatteryId || cfg.selectedBatteryId === 'bat_none') {
    const cat = (typeof equipmentCatalog !== 'undefined') ? equipmentCatalog : null;
    const defaultBat = (cat && cat.batteries && cat.batteries.find(b => b.id !== 'bat_none')) || { id: 'bat_huawei_luna_5kwh', kwh: 5.0, brand: 'LFP' };
    cfg.selectedBatteryId = defaultBat.id;
    cfg.autoSizing = cfg.autoSizing || {};
    cfg.autoSizing.batteries = cfg.autoSizing.batteries || { count: 1, capacityKwh: defaultBat.kwh || 5.0 };
    if (typeof showToast === 'function') {
      showToast('BATERÍA ACTIVADA', 'Se ha añadido la batería al proyecto para su posicionamiento.', 'info', 3000);
    }
  }

  if (typeof viewer !== 'undefined' && viewer && viewer.canvas) {
    viewer.canvas.style.cursor = 'crosshair';
  }
  if (typeof showToast === 'function') {
    showToast('UBICACIÓN DE BATERÍA', '🎯 Haz clic en cualquier suelo, pared o sala técnica 3D para ubicar la batería.', 'info', 4000);
  }
  showStatus('<i data-lucide="battery-charging" class="icon-sm"></i> HAZ CLIC EN EL MODELO 3D PARA UBICAR LA BATERÍA LFP', 4000);
}

function wpPlaceBatteryAtPosition(cartesian) {
  if (!cartesian || typeof Cesium === 'undefined' || typeof viewer === 'undefined' || !viewer) return;
  if (!window.inverterEquipmentState) window.inverterEquipmentState = {};

  const carto = Cesium.Cartographic.fromCartesian(cartesian);
  const latDeg = Cesium.Math.toDegrees(carto.latitude);
  const lonDeg = Cesium.Math.toDegrees(carto.longitude);
  const heightM = carto.height;

  window.inverterEquipmentState.isPlacingBattery = false;
  window.inverterEquipmentState.batteryPosition = cartesian;
  window.inverterEquipmentState.batteryCarto = { latitude: latDeg, longitude: lonDeg, height: heightM };

  if (typeof viewer !== 'undefined' && viewer && viewer.canvas) {
    viewer.canvas.style.cursor = 'default';
  }

  // Renderizar la entidad de la batería en la posición indicada
  if (typeof wpRenderBattery3D === 'function') {
    wpRenderBattery3D(window.inverterEquipmentState.position || cartesian);
  }

  // Recalcular cables de interconexión con el inversor
  if (typeof wpCalculateAndRenderInverterCables === 'function') {
    wpCalculateAndRenderInverterCables();
  }
  if (typeof updateConfigAndSimulate === 'function') updateConfigAndSimulate();
  if (typeof updateBudgetUI === 'function') updateBudgetUI();
  if (typeof BOMTreeEngine !== 'undefined' && typeof BOMTreeEngine.refresh === 'function') {
    BOMTreeEngine.refresh();
  }
  if (typeof ProjectHierarchy !== 'undefined' && typeof ProjectHierarchy.notify === 'function') {
    ProjectHierarchy.notify('electrical_updated');
  }

  if (typeof showToast === 'function') {
    showToast('BATERÍA UBICADA', 'Batería LFP situada a ' + heightM.toFixed(1) + ' m con cableado de almacenamiento actualizado.', 'success', 3500);
  }
}
window.wpStartBatteryPlacement = wpStartBatteryPlacement;
window.wpPlaceBatteryAtPosition = wpPlaceBatteryAtPosition;

function wpStartCombinerBoxPlacement() {
  if (!window.inverterEquipmentState) window.inverterEquipmentState = {};
  if (!window.inverterEquipmentState.combinerBox) window.inverterEquipmentState.combinerBox = {};
  window.inverterEquipmentState.combinerBox.isPlacing = true;
  window.inverterEquipmentState.isPlacing = false;
  if (window.inverterEquipmentState.gridMeter) window.inverterEquipmentState.gridMeter.isPlacing = false;

  if (typeof showToast === 'function') {
    showToast('COMBINER BOX EN CUBIERTA', 'Haz clic en la cubierta para situar la caja de conexiones y protecciones DC.', 'info', 4000);
  }
  showStatus('<i data-lucide=\"package\" class=\"icon-sm\"></i> HAZ CLIC EN LA CUBIERTA PARA UBICAR LA COMBINER BOX DC', 4000);
}

function wpPlaceCombinerBoxAtPosition(cartesian) {
  if (!cartesian || typeof Cesium === 'undefined' || typeof viewer === 'undefined' || !viewer) return;

  const carto = Cesium.Cartographic.fromCartesian(cartesian);
  const latDeg = Cesium.Math.toDegrees(carto.latitude);
  const lonDeg = Cesium.Math.toDegrees(carto.longitude);
  const heightM = carto.height;

  window.inverterEquipmentState.combinerBox.position = cartesian;
  window.inverterEquipmentState.combinerBox.carto = { latitude: latDeg, longitude: lonDeg, height: heightM };
  window.inverterEquipmentState.combinerBox.isEnabled = true;
  window.inverterEquipmentState.combinerBox.isPlacing = false;

  if (window.inverterEquipmentState.combinerBox.entity) {
    try { viewer.entities.remove(window.inverterEquipmentState.combinerBox.entity); } catch(e) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(e, 'Entidad/Primitiva Cesium'); }
  }
  try {
    const transform = Cesium.Transforms.eastNorthUpToFixedFrame(cartesian);
    const quat = Cesium.Quaternion.fromRotationMatrix(Cesium.Matrix4.getMatrix3(transform, new Cesium.Matrix3()));
    // [FIX-VIS] Caja apoyada sobre la cubierta (+½ altura) + marcador billboard localizador
    const cbBoxPos = Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, carto.height + 0.15);
    const cbMarkerSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="#0F172A" stroke="#10B981" stroke-width="2"><rect x="3" y="6" width="18" height="13" rx="2" fill="#10B981" stroke="#064E3B"/><path d="M8 10v5M12 10v5M16 10v5" stroke="#064E3B"/></svg>';
    const cbEntity = viewer.entities.add({
      id: 'ra_combiner_box_3d',
      name: 'Caja de Conexión DC / Combiner Box',
      position: cbBoxPos,
      orientation: quat,
      billboard: {
        image: getSafeSvgDataUri(cbMarkerSvg),
        scale: 0.8,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        eyeOffset: new Cesium.Cartesian3(0, 0, -10.0),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        scaleByDistance: new Cesium.NearFarScalar(80, 1.0, 4000, 0.35)
      },
      box: {
        dimensions: wpBoxDimsScaled(new Cesium.Cartesian3(0.40, 0.20, 0.30), cbBoxPos),
        material: Cesium.Color.fromCssColorString('#E2E8F0'), // Gris claro 
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString('#64748B'),
        shadows: Cesium.ShadowMode.ENABLED
      }
    });
    const curStep = (typeof wpCurrentStep !== 'undefined') ? wpCurrentStep : ((typeof window !== 'undefined' && window.wpCurrentStep) || 1);
    const shouldShow = (curStep >= 4);
    cbEntity.show = shouldShow;
    window.inverterEquipmentState.combinerBox.entity = cbEntity;

    if (window.inverterEquipmentState.combinerBox.label2D) {
      removeLabel2DEntity(window.inverterEquipmentState.combinerBox.label2D);
    }
    const cbLabelText = '📦 COMBINER BOX DC\n' + heightM.toFixed(1) + ' m';
    window.inverterEquipmentState.combinerBox.label2D = addLabelEntity(cartesian, cbLabelText, -48, {
      bg: 'rgba(15, 23, 42, 0.92)',
      borderColor: '#10B981',
      textColor: '#FFFFFF',
      font: "bold 10px 'JetBrains Mono', monospace",
      category: 'electrical',
      equipmentType: 'combinerBox'
    });
    if (window.inverterEquipmentState.combinerBox.label2D) window.inverterEquipmentState.combinerBox.label2D.show = shouldShow;
  } catch(eEnt) {
    window.RA && window.RA.log && window.RA.log.debug('Error renderizando Combiner Box:', eEnt);
  }

  // Recalcular cables teniendo en cuenta la Combiner Box
  wpCalculateAndRenderInverterCables();
  if (typeof updateConfigAndSimulate === 'function') updateConfigAndSimulate();
  if (typeof updateBudgetUI === 'function') updateBudgetUI();

  const tagCB = document.getElementById('cb-status-tag');
  if (tagCB) {
    tagCB.textContent = 'ACTIVA (' + heightM.toFixed(1) + 'm)';
    tagCB.style.background = 'rgba(16, 185, 129, 0.25)';
    tagCB.style.color = '#34D399';
  }
  if (typeof showToast === 'function') {
    showToast('COMBINER BOX ACTIVADA', 'Strings enrutados a la caja de concentración de cubierta.', 'success', 3500);
  }
}



// ══════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// <i data-lucide=\"globe\" class=\"icon-sm\"></i> GIZMO UNIVERSAL UNIFICADO 3D (TRÍADA + ANILLO DE ROTACIÓN + BORRADO SUPR)
// ══════════════════════════════════════════════════════════════════════════════

// [DELEGACIÓN MODULAR AAA]: Gizmo universal unificado 3D y transformaciones residen en js/universal-gizmo-3d.js

// <i data-lucide=\"zap\" class=\"icon-sm\"></i> COMPORTAMIENTO DE OBJETOS 3D, GIZMO Y BORRADO PARA EQUIPOS ELÉCTRICOS
// ══════════════════════════════════════════════════════════════════════════════

window.selectedElectricalId = window.selectedElectricalId || null; // 'inverter' | 'combiner' | 'meter' | null
const elecGizmoState = {
  active: false,
  mode: null,          // 'center-drag' | 'u-axis' | 'v-axis' | 'z-axis'
  startMouse: { x: 0, y: 0 },
  startPos: null,      // Cesium.Cartesian3
  startCarto: null,    // { latitude, longitude, height }
  screen: null,
  hoveredPart: null
};

window.selectElectricalObject = selectElectricalObject;
window.deleteSelectedElectricalEquipment = deleteSelectedElectricalEquipment;

function getSelectedElectricalObject() {
  if (!selectedElectricalId || !window.inverterEquipmentState) return null;
  const s = window.inverterEquipmentState;

  if (selectedElectricalId === 'inverter' && s.position) {
    return {
      id: 'inverter',
      name: 'Cuadro Eléctrico & Inversor',
      type: 'inverter',
      pos: s.position,
      carto: s.carto,
      entity: s.entity,
      color: '#F59E0B',
      accentColor: 'rgba(245, 158, 11, 0.4)'
    };
  }

  if (selectedElectricalId === 'combiner' && s.combinerBox && s.combinerBox.position && s.combinerBox.isEnabled) {
    return {
      id: 'combiner',
      name: 'Combiner Box (Caja de Strings)',
      type: 'combiner',
      pos: s.combinerBox.position,
      carto: s.combinerBox.carto,
      entity: s.combinerBox.entity,
      color: '#10B981',
      accentColor: 'rgba(16, 185, 129, 0.4)'
    };
  }

  if (selectedElectricalId === 'meter' && s.gridMeter && s.gridMeter.position) {
    return {
      id: 'meter',
      name: 'Contador de Red & Acometida',
      type: 'meter',
      pos: s.gridMeter.position,
      carto: s.gridMeter.carto,
      entity: s.gridMeter.entity,
      color: '#38BDF8',
      accentColor: 'rgba(56, 189, 248, 0.4)'
    };
  }

  if (selectedElectricalId === 'dc_protection' && s.dcProtectionPosition && s.dcProtectionEntity) {
    return {
      id: 'dc_protection',
      name: 'Cuadro Protección DC (SPD II)',
      type: 'dc_protection',
      pos: s.dcProtectionPosition,
      carto: s.dcProtectionCarto,
      entity: s.dcProtectionEntity,
      color: '#D97706',
      accentColor: 'rgba(217, 119, 6, 0.4)'
    };
  }

  if (selectedElectricalId === 'battery' && s.batteryPosition && s.batteryEntity) {
    return {
      id: 'battery',
      name: 'Sistema de Baterías LFP',
      type: 'battery',
      pos: s.batteryPosition,
      carto: s.batteryCarto,
      entity: s.batteryEntity,
      color: '#10B981',
      accentColor: 'rgba(16, 185, 129, 0.4)'
    };
  }

  return null;
}

function selectElectricalObject(id) {
  if (typeof id === 'object' && id && id.id === 'route_handle') {
    window.selectedRouteVertex = { type: id.type, index: id.index };
    selectedElectricalId = null;
    showStatus('<i data-lucide="route" class="icon-sm"></i> CODO #' + (id.index + 1) + ' DE CANALIZACIÓN ' + id.type.toUpperCase() + ' SELECCIONADO — Pulsa [Supr] para eliminar', 3000);
    if (typeof showToast === 'function') {
      showToast('CODO SELECCIONADO', 'Vértice #' + (id.index + 1) + ' de canalización ' + id.type.toUpperCase() + '. Pulsa SUPR para eliminar.', 'info', 2500);
    }
    return;
  }
  window.selectedRouteVertex = null;

  if (id && window.inverterEquipmentState) {
    const s = window.inverterEquipmentState;
    let ent = null;
    if (id === 'inverter') ent = s.entity;
    else if (id === 'dc_protection') ent = s.dcProtectionEntity;
    else if (id === 'battery') ent = s.batteryEntity;
    else if (id === 'combiner' && s.combinerBox) ent = s.combinerBox.entity;
    else if (id === 'meter' && s.gridMeter) ent = s.gridMeter.entity;
    if (ent && ent.show === false) {
      if (typeof showToast === 'function') showToast('EQUIPO OCULTO', 'Haz visible el equipo para poder seleccionarlo.', 'warning', 2500);
      return;
    }
  }

  selectedElectricalId = id;

  // [AAA GIZMO UNIFICADO]: Ocultar etiqueta 3D de Cesium del equipo seleccionado para evitar colisión con el Gizmo 2D
  if (window.inverterEquipmentState) {
    const s = window.inverterEquipmentState;
    if (s.entity && s.entity.label) s.entity.label.show = (id !== 'inverter');
    if (s.dcProtectionEntity && s.dcProtectionEntity.label) s.dcProtectionEntity.label.show = (id !== 'inverter' && id !== 'dc_protection');
    if (s.batteryEntity && s.batteryEntity.label) s.batteryEntity.label.show = (id !== 'inverter' && id !== 'battery');
    if (s.gridMeter && s.gridMeter.entity && s.gridMeter.entity.label) s.gridMeter.entity.label.show = (id !== 'meter');
    if (s.combinerBox && s.combinerBox.entity && s.combinerBox.entity.label) s.combinerBox.entity.label.show = (id !== 'combiner');
  }

  if (id) {
    // Deseleccionar otros componentes para evitar colisión de gizmos
    if (typeof selectedObstacleId !== 'undefined') selectedObstacleId = null;
    if (typeof selectedPanelIndex !== 'undefined') selectedPanelIndex = -1;
    if (typeof WP !== 'undefined' && WP) {
      WP.selectedVtxIdx = -1;
      WP.selectedVertexIdx = -1;
    }
    const obj = getSelectedElectricalObject();
    if (obj) {
      showStatus('<i data-lucide=\"zap\" class=\"icon-sm\"></i> ' + obj.name.toUpperCase() + ' SELECCIONADO — Arrastra el Gizmo para mover | [Supr] para borrar', 3000);
      if (typeof showToast === 'function') {
        showToast('EQUIPO SELECCIONADO', obj.name + ' activo en 3D. Usa los ejes o arrástralo para reubicar. Pulsa SUPR para eliminar.', 'info', 3000);
      }
    }
  }

  if (typeof renderTriad2D === 'function') renderTriad2D();
}

function pickElectricalObjectUnderCursor(screenPos, skipGpuPick) {
  if (!window.inverterEquipmentState || typeof viewer === 'undefined' || !viewer) return null;
  const s = window.inverterEquipmentState;

  // A. Pick por Entidad Cesium (omitido en hover rápido para 0 ms GPU stall)
  if (!skipGpuPick) try {
    const pickedObj = scene.pick(screenPos);
    if (pickedObj && pickedObj.id) {
      const entId = typeof pickedObj.id === 'string' ? pickedObj.id : (pickedObj.id.id || '');
      if (entId.includes('ra_route_handle_')) {
        const parts = entId.split('_');
        return { id: 'route_handle', type: parts[3], index: parseInt(parts[4], 10) };
      }
      if (entId.includes('ra_inverter_main_box') && (!s.entity || s.entity.show !== false)) return { id: 'inverter' };
      if (entId.includes('ra_dc_protection_box') && (!s.dcProtectionEntity || s.dcProtectionEntity.show !== false)) return { id: 'dc_protection' };
      if (entId.includes('ra_battery_storage_box') && (!s.batteryEntity || s.batteryEntity.show !== false)) return { id: 'battery' };
      if (entId.includes('ra_combiner_box') && (!s.combinerBox || !s.combinerBox.entity || s.combinerBox.entity.show !== false)) return { id: 'combiner' };
      if (entId.includes('ra_grid_meter_box') && (!s.gridMeter || !s.gridMeter.entity || s.gridMeter.entity.show !== false)) return { id: 'meter' };
    }
  } catch(err) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(err, 'Entidad/Primitiva Cesium'); }

  // B. Fallback: Proximidad de Proyección en Pantalla (28px de radio)
  const candidates = [
    { id: 'inverter', pos: s.position, entity: s.entity },
    { id: 'dc_protection', pos: (s.dcProtectionEntity && s.dcProtectionPosition) ? s.dcProtectionPosition : null, entity: s.dcProtectionEntity },
    { id: 'battery', pos: (s.batteryEntity && s.batteryPosition) ? s.batteryPosition : null, entity: s.batteryEntity },
    { id: 'combiner', pos: (s.combinerBox && s.combinerBox.isEnabled) ? s.combinerBox.position : null, entity: s.combinerBox ? s.combinerBox.entity : null },
    { id: 'meter', pos: (s.gridMeter && s.gridMeter.position) ? s.gridMeter.position : null, entity: s.gridMeter ? s.gridMeter.entity : null }
  ];

  for (let c of candidates) {
    if (!c.pos) continue;
    if (c.entity && c.entity.show === false) continue;
    try {
      const pWin = Cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, c.pos);
      if (pWin) {
        const d = Math.hypot(screenPos.x - pWin.x, screenPos.y - pWin.y);
        if (d <= 28) return c;
      }
    } catch(e) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(e, 'Entidad/Primitiva Cesium'); }
  }

  return null;
}





function deleteSelectedElectricalEquipment() {
  if (!selectedElectricalId || !window.inverterEquipmentState) return;
  const s = window.inverterEquipmentState;

  if (selectedElectricalId === 'inverter') {
    if (s.entity && viewer) {
      try { viewer.entities.remove(s.entity); } catch(e) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(e, 'Entidad/Primitiva Cesium'); }
    }
    if (window.RACableEngine && typeof window.RACableEngine.clearAllCables === 'function') {
      window.RACableEngine.clearAllCables();
    } else if (s.dcCableEntities && Array.isArray(s.dcCableEntities) && viewer) {
      s.dcCableEntities.forEach(ent => {
        try {
          if (ent.isCablePrimitive) {
            if (window._raCableEnginePrimitives && ent.primitive) window._raCableEnginePrimitives.remove(ent.primitive);
          } else {
            viewer.entities.remove(ent);
          }
        } catch(err) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(err, 'Entidad/Primitiva Cesium'); }
      });
      s.dcCableEntities = [];
    }
    s.position = null;
    s.entity = null;
    s.carto = null;
    s.L_dc_measured = 0;

    const tagEl = document.getElementById('inverter-status-tag');
    if (tagEl) {
      tagEl.textContent = 'NO DEFINIDO';
      tagEl.style.background = 'rgba(239, 68, 68, 0.2)';
      tagEl.style.color = '#F87171';
    }
    const btn = document.getElementById('btn-place-inverter');
    if (btn) {
      btn.innerHTML = '<span><i data-lucide=\"zap\" class=\"icon-sm\"></i> UBICAR INVERSOR 3D</span>';
      btn.style.borderColor = '';
      btn.style.color = '';
    }

    selectedElectricalId = null;
    if (typeof updateBudgetUI === 'function') updateBudgetUI();
    if (typeof populateStep3EquipmentSelectors === 'function') populateStep3EquipmentSelectors();
    if (typeof showToast === 'function') {
      showToast('EQUIPO ELIMINADO', 'Cuadro eléctrico e inversor eliminados.', 'info', 3000);
    }
  } else if (selectedElectricalId === 'combiner') {
    if (s.combinerBox && s.combinerBox.entity && viewer) {
      try { viewer.entities.remove(s.combinerBox.entity); } catch(e) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(e, 'Entidad/Primitiva Cesium'); }
    }
    if (s.combinerBox) {
      s.combinerBox.isEnabled = false;
      s.combinerBox.position = null;
      s.combinerBox.entity = null;
    }
    selectedElectricalId = null;
    wpCalculateAndRenderInverterCables();
    if (typeof showToast === 'function') {
      showToast('EQUIPO ELIMINADO', 'Combiner Box eliminada. Strings conectados directo a inversor.', 'info', 3000);
    }
  } else if (selectedElectricalId === 'dc_protection') {
    if (s.dcProtectionEntity && viewer) {
      try { viewer.entities.remove(s.dcProtectionEntity); } catch(e) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(e, 'Entidad/Primitiva Cesium'); }
    }
    s.dcProtectionEntity = null;
    s.dcProtectionPosition = null;
    s.dcProtectionCarto = null;
    selectedElectricalId = null;
    wpCalculateAndRenderInverterCables();
    if (typeof showToast === 'function') {
      showToast('EQUIPO ELIMINADO', 'Cuadro de protección DC eliminado.', 'info', 3000);
    }
  } else if (selectedElectricalId === 'battery') {
    if (s.batteryEntity && viewer) {
      try { viewer.entities.remove(s.batteryEntity); } catch(e) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(e, 'Entidad/Primitiva Cesium'); }
    }
    if (s.batteryLabel2D) {
      try { if (typeof removeLabel2DEntity === 'function') removeLabel2DEntity(s.batteryLabel2D); } catch(e) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(e, 'Entidad/Primitiva Cesium'); }
    }
    s.batteryEntity = null;
    s.batteryLabel2D = null;
    s.batteryPosition = null;
    s.batteryCarto = null;
    selectedElectricalId = null;
    wpCalculateAndRenderInverterCables();
    if (typeof showToast === 'function') {
      showToast('EQUIPO ELIMINADO', 'Sistema de baterías eliminado de la escena 3D.', 'info', 3000);
    }
  } else if (selectedElectricalId === 'meter') {
    if (s.gridMeter && s.gridMeter.entity && viewer) {
      try { viewer.entities.remove(s.gridMeter.entity); } catch(e) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(e, 'Entidad/Primitiva Cesium'); }
    }
    if (s.gridMeter) {
      s.gridMeter.position = null;
      s.gridMeter.entity = null;
    }
    selectedElectricalId = null;
    wpCalculateAndRenderInverterCables();
    if (typeof wpUpdateMeterPlacementGuideUI === 'function') wpUpdateMeterPlacementGuideUI();
    if (typeof showToast === 'function') {
      showToast('EQUIPO ELIMINADO', 'Contador de red eliminado.', 'info', 3000);
    }
  }

  if (typeof renderTriad2D === 'function') renderTriad2D();
}

function wpStartInverterPlacement() {
  if (!window.inverterEquipmentState) window.inverterEquipmentState = {};
  window.inverterEquipmentState.isPlacing = true;
  if (window.inverterEquipmentState.gridMeter) window.inverterEquipmentState.gridMeter.isPlacing = false;
  if (window.inverterEquipmentState.combinerBox) window.inverterEquipmentState.combinerBox.isPlacing = false;

  // Feedback UI/UX: Cursor en diana y aviso interactivo
  if (typeof viewer !== 'undefined' && viewer && viewer.canvas) {
    viewer.canvas.style.cursor = 'crosshair';
  }
  const btn = document.getElementById('btn-place-inverter');
  if (btn) btn.classList.add('active');
  if (typeof showToast === 'function') {
    showToast('UBICACIÓN DE CUADRO E INVERSOR', '🎯 Haz clic en cualquier pared, suelo o fachada 3D para situar el inversor.', 'info', 4000);
  }
  showStatus('<i data-lucide="zap" class="icon-sm"></i> HAZ CLIC EN EL MODELO 3D PARA UBICAR EL CUADRO ELÉCTRICO / INVERSOR', 4000);
}
