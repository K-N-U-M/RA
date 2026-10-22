/**
 * ═══════════════════════════════════════════════════════════════════════
 * wind-ui.js — Capa de Interfaz de Usuario y Controlador de Viento RA
 * ═══════════════════════════════════════════════════════════════════════
 * Conecta el catálogo, la entidad WindTurbineInstance, CesiumJS
 * y la interfaz HTML existente (Paso 2 subtab 💨 y colocación en 3D).
 * @version 1.1.0  2026-10-22
 */
(function (global) {
  'use strict';

  var RAWind = global.RAWind || (global.RAWind = {});

  var _placementActive = false;
  var _selectedTurbineForPlacement = null;

  function init() {
    if (global._pendingWindTurbinePlacement) {
      var item = global._pendingWindTurbinePlacement;
      global._pendingWindTurbinePlacement = null;
      startTurbinePlacement(item);
    }
    renderStep2Panel();
  }

  function isPlacementActive() {
    return _placementActive;
  }

  function getPendingTurbine() {
    return _selectedTurbineForPlacement;
  }

  function startTurbinePlacement(catalogItem) {
    if (!catalogItem) return;
    _selectedTurbineForPlacement = catalogItem;
    _placementActive = true;
    showPlacementHint(catalogItem);

    if (typeof global.showToast === 'function') {
      global.showToast(
        'COLOCAR ' + (catalogItem.model || 'AEROGENERADOR').toUpperCase(),
        'Haz clic sobre el terreno o cubierta para ubicar el aerogenerador. ESC cancela.',
        'info',
        4000
      );
    }
    if (typeof global.showStatus === 'function') {
      global.showStatus('💨 HAZ CLIC EN EL MODELO 3D O TERRENO PARA UBICAR ' + (catalogItem.manufacturer + ' ' + catalogItem.model), 4000);
    }
  }

  function placeAtCartesian(cartesian) {
    if (!_placementActive || !_selectedTurbineForPlacement) return false;
    var Cesium = global.Cesium;
    if (!cartesian || !Cesium) return false;

    var carto = Cesium.Cartographic.fromCartesian(cartesian);
    var instance = RAWind.Entity.createInstance(_selectedTurbineForPlacement, {
      positionCartographic: {
        longitudeRad: carto.longitude,
        latitudeRad: carto.latitude,
        altitudeM: carto.height || 0
      }
    });

    var issues = RAWind.Entity.checkRotorClearance(instance);
    if (issues && issues.length > 0) {
      var msg = 'Aviso: La distancia al aerogenerador más cercano (' +
        issues[0].otherName + ' a ' + issues[0].distanceM + 'm) es inferior a los ' +
        issues[0].requiredM + 'm recomendados (3D).';
      if (typeof global.showToast === 'function') {
        global.showToast('DISTANCIA CRÍTICA', msg, 'warning', 4500);
      } else if (typeof global.showNotification === 'function') {
        global.showNotification(msg, 'warning');
      }
    }

    RAWind.Entity.addToScene(instance);

    _placementActive = false;
    _selectedTurbineForPlacement = null;
    hidePlacementHint();
    renderStep2Panel();

    if (typeof global.wpSwitchGenTab === 'function') {
      global.wpSwitchGenTab('wind');
    }

    if (typeof global.showToast === 'function') {
      global.showToast(
        'AEROGENERADOR INSTALADO',
        instance.name + ' fijado en la escena 3D con éxito.',
        'success',
        3500
      );
    }

    return true;
  }

  function cancelPlacement() {
    _placementActive = false;
    _selectedTurbineForPlacement = null;
    hidePlacementHint();
    if (typeof global.showToast === 'function') {
      global.showToast('COLOCACIÓN CANCELADA', 'Operación de aerogenerador abortada.', 'info', 2000);
    }
  }

  function showPlacementHint(turbine) {
    var hint = document.getElementById('ra-wind-placement-hint');
    if (!hint) {
      hint = document.createElement('div');
      hint.id = 'ra-wind-placement-hint';
      hint.style.cssText = 'position:fixed;top:70px;left:50%;transform:translateX(-50%);' +
        'background:rgba(15,23,42,0.92);color:#38BDF8;border:1px solid #0284C7;' +
        'padding:10px 20px;border-radius:8px;font-size:12px;font-weight:600;' +
        'z-index:99999;box-shadow:0 8px 24px rgba(0,0,0,0.5);display:flex;align-items:center;gap:12px;';
      document.body.appendChild(hint);
    }
    hint.innerHTML = '<span>💨 Haz clic en el terreno o cubierta para colocar <b>' +
      (turbine.manufacturer + ' ' + turbine.model) + '</b></span>' +
      '<button onclick="if(window.RAWindUI) window.RAWindUI.cancelPlacement()" style="background:#334155;color:#fff;border:none;border-radius:4px;padding:3px 8px;cursor:pointer;font-size:11px;">✕ Cancelar</button>';
    hint.style.display = 'flex';
  }

  function hidePlacementHint() {
    var hint = document.getElementById('ra-wind-placement-hint');
    if (hint) hint.style.display = 'none';
  }

  function renderStep2Panel() {
    var panel = document.getElementById('wp-step2-wind-panel');
    if (!panel) return;

    var turbines = Array.isArray(global.windTurbines) ? global.windTurbines : [];
    var totalKw = 0;
    turbines.forEach(function (t) {
      var p = (t._catalog && t._catalog.ratedPowerW) ? t._catalog.ratedPowerW : 0;
      totalKw += (p / 1000);
    });

    var html = '';

    html += '<div style="background:rgba(15,23,42,0.6);border:1px solid rgba(56,189,248,0.25);border-radius:8px;padding:10px 12px;margin-bottom:12px;">';
    html += '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">';
    html += '    <div>';
    html += '      <span style="font-size:11px;font-weight:700;color:#38BDF8;text-transform:uppercase;letter-spacing:0.5px;">💨 Parque Mini-Eólico</span>';
    html += '      <div style="font-size:10px;color:var(--text-slate-400);">' + turbines.length + ' aerogenerador(es) | <b>' + totalKw.toFixed(1) + ' kWp</b></div>';
    html += '    </div>';
    html += '    <button class="doc-mini-btn" onclick="if(typeof openEquipmentCatalogModal===\'function\'){openEquipmentCatalogModal(\'wind_turbines\');}" style="background:rgba(56,189,248,0.15);color:#38BDF8;border:1px solid rgba(56,189,248,0.4);font-weight:600;padding:4px 8px;font-size:10.5px;cursor:pointer;">+ Añadir Turbina</button>';
    html += '  </div>';

    if (turbines.length === 0) {
      html += '<div style="padding:16px;text-align:center;color:var(--text-slate-400);font-size:11px;border:1px dashed rgba(255,255,255,0.1);border-radius:6px;">';
      html += '  No hay aerogeneradores en la escena.<br>';
      html += '  <span style="font-size:10px;color:var(--text-slate-500);">Abre el catálogo para elegir un modelo e instalarlo con un clic.</span>';
      html += '</div>';
    } else {
      html += '<div style="display:flex;flex-direction:column;gap:6px;max-height:260px;overflow-y:auto;">';
      turbines.forEach(function (t, idx) {
        var cat = t._catalog || {};
        var kw = (cat.ratedPowerW ? (cat.ratedPowerW / 1000).toFixed(1) : '?');
        var hubH = t.supportStructure ? t.supportStructure.hubHeightM : 18;
        var isEnabled = t.operationalState ? t.operationalState.enabled !== false : true;

        html += '<div style="display:flex;align-items:center;justify-content:space-between;background:rgba(30,41,59,0.7);padding:6px 10px;border-radius:6px;border:1px solid ' + (isEnabled ? 'rgba(255,255,255,0.08)' : 'rgba(239,68,68,0.3)') + ';">';
        html += '  <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:140px;">';
        html += '    <div style="font-weight:600;font-size:11px;color:#fff;">' + (t.name || ('Turbina #' + (idx + 1))) + '</div>';
        html += '    <div style="font-size:9.5px;color:var(--text-slate-400);">' + kw + ' kW · ' + cat.type + ' · Mástil: ' + hubH + 'm</div>';
        html += '  </div>';
        html += '  <div style="display:flex;gap:4px;align-items:center;">';
        html += '    <button title="' + (isEnabled ? 'Desactivar' : 'Activar') + '" onclick="if(window.RAWind && window.RAWind.Entity){window.RAWind.Entity.updateProp(\'' + t.id + '\',\'enabled\',' + !isEnabled + ');}" style="background:none;border:none;color:' + (isEnabled ? '#10B981' : '#64748B') + ';cursor:pointer;font-size:12px;">' + (isEnabled ? '⚡' : '⚪') + '</button>';
        html += '    <button title="Centrar cámara" onclick="if(window.RAWindUI){window.RAWindUI.focusTurbine(\'' + t.id + '\');}" style="background:none;border:none;color:#38BDF8;cursor:pointer;font-size:11px;">🔍</button>';
        html += '    <button title="Eliminar" onclick="if(confirm(\'¿Eliminar aerogenerador?\')){if(window.RAWind && window.RAWind.Entity)window.RAWind.Entity.removeFromScene(\'' + t.id + '\');}" style="background:none;border:none;color:#EF4444;cursor:pointer;font-size:11px;">🗑</button>';
        html += '  </div>';
        html += '</div>';
      });
      html += '</div>';
    }

    html += '</div>';
    panel.innerHTML = html;
  }

  function focusTurbine(id) {
    var t = RAWind.Entity.getById(id);
    if (!t || !global.viewer || !global.Cesium) return;
    var cartesian = global.Cesium.Cartesian3.fromRadians(
      t.positionCartographic.longitudeRad,
      t.positionCartographic.latitudeRad,
      t.positionCartographic.altitudeM + (t.supportStructure ? t.supportStructure.hubHeightM : 18)
    );
    global.viewer.camera.flyTo({
      destination: global.Cesium.Cartesian3.add(
        cartesian,
        new global.Cesium.Cartesian3(30, 30, 25),
        new global.Cesium.Cartesian3()
      ),
      orientation: {
        heading: global.Cesium.Math.toRadians(225),
        pitch: global.Cesium.Math.toRadians(-25),
        roll: 0.0
      },
      duration: 1.5
    });
    if (global.RAWindVisualizer) {
      global.RAWindVisualizer.selectTurbine(id);
    }
  }

  function onTurbinesChanged(eventType, data) {
    renderStep2Panel();
  }

  var RAWindUI = {
    init: init,
    isPlacementActive: isPlacementActive,
    getPendingTurbine: getPendingTurbine,
    startTurbinePlacement: startTurbinePlacement,
    placeAtCartesian: placeAtCartesian,
    cancelPlacement: cancelPlacement,
    showPlacementHint: showPlacementHint,
    hidePlacementHint: hidePlacementHint,
    renderStep2Panel: renderStep2Panel,
    focusTurbine: focusTurbine,
    onTurbinesChanged: onTurbinesChanged
  };

  global.RAWindUI = RAWindUI;
  RAWind.UI = RAWindUI;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = RAWindUI;
  }

})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : global));
