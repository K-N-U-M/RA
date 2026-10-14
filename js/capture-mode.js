/**
 * ============================================================================
 * 📷 RA · CAPTURE MODE (Modo captura limpia — P3 UX, 29/09/2026 / Actualizado Octubre 2026)
 * ============================================================================
 * Oculta TODO el andamiaje CAD y auxiliar del visor 3D:
 * - Vértices y polilíneas perimetrales de faldones (WP.ents.polys, activePoly)
 * - Rellenos de planos de trabajo 3D (planePreview, activePlaneMarker, inactivePlanes)
 * - Tríada y Gizmo Universal 2D/3D (canvas #ra-triad-overlay, WP.ents.gizmos, gizmoEntities)
 * - Cinta Métrica 3D (líneas WebGL, pines A/B, halo magnético, rótulos de cotas y mini-HUD)
 * - Vértices de control de huella de edificios 3D (bld_vtx_handle_*)
 * - Nodos interactivos de codo de cableado ortogonal (ra_route_handle_*)
 * - Terminales de strings (+/-) y previsualización de cableado manual en trazado
 * - Contorno de selección de paneles y entidades fantasma de arrastre
 * - Rótulos 3D de paneles y mapa de calor (pv_label_*, pv_heatmap_label_, colecciones GPU)
 * - Badges y tooltips HTML flotantes en pantalla (body.ra-capture-mode-active)
 *
 * Mantiene intactos los elementos físicos: fotogrametría 3D, cubiertas, edificios,
 * obstáculos 3D, turbinas eólicas, módulos solares con sus texturas PBR,
 * estructuras de soporte (raíles y zapatas) y tubos volumétricos de cableado.
 *
 * Técnica reversible: solo conmuta `entity.show` y primitivas GPU sin destruir nada,
 * registrando cada entidad para restaurarla fielmente al pulsar 'C' de nuevo.
 * ============================================================================
 */
(function (global) {
  'use strict';

  // Grupos de WP.ents que son 100% andamiaje CAD (nunca contienen paneles/obstáculos/edificios)
  var GROUPS = ['polys', 'activePoly', 'planePreview', 'activePlaneMarker', 'inactivePlanes', 'gizmos'];

  // Prefijos de ID de entidades CAD/auxiliares en viewer.entities
  var HIDE_ID_PREFIXES = [
    'wp_',                     // Faldones, vértices, planos, cotas, glow
    'ra_active_shape',         // Forma elástica en trazado activo
    'bld_vtx_handle_',         // Esferas de manipulación de vértices de edificios 3D
    'ra_route_handle_',        // Nodos interactivos de codo de cableado ortogonal
    'meas_',                   // Pines y etiquetas de la cinta métrica
    'pv_label_',               // Rótulos 3D de paneles
    'pv_heatmap_label_',       // Etiquetas 3D de producción solar / heatmap
    'pv_panel_active_drag_',   // Vista previa de arrastre de panel
    'pv_panel_outline',        // Contorno de panel seleccionado
    'pv_string_wire_',         // Conexiones de cableado entre paneles individuales
    'cable_prim_',             // Primitivas de cableado envueltas
    'inverter_cable_label_',   // Rótulos técnicos de cableado
    'ra_cable_'                // Entidades auxiliares de cables
  ];

  var _hiddenEntities = [];
  var _savedPrimitiveStates = {};
  var state = { enabled: false, btn: null };

  function ensureButton() {
    if (state.btn && document.body && document.body.contains(state.btn)) return state.btn;
    if (!document.body) return null;
    var btn = document.createElement('button');
    btn.id = 'ra-capture-mode-btn';
    btn.type = 'button';
    btn.textContent = '📷 CAPTURA LIMPIA (C)';
    btn.title = 'Oculta vértices, polilíneas, planos de trabajo, cotas y tríada CAD para capturas de pantalla limpias. Tecla: C';
    Object.assign(btn.style, {
      display: 'none', // La tecla C sigue siendo el atajo principal
      position: 'fixed', right: '14px', bottom: '46px', zIndex: '9998',
      background: 'rgba(10,16,29,0.85)', color: '#E2E8F0',
      border: '1px solid rgba(56,189,248,0.35)', borderRadius: '8px',
      padding: '7px 12px', font: '600 10.5px Inter, system-ui, sans-serif',
      letterSpacing: '0.4px', cursor: 'pointer', backdropFilter: 'blur(6px)',
      transition: 'opacity 0.25s, border-color 0.25s'
    });
    btn.addEventListener('click', function () { api.toggle(); });
    document.body.appendChild(btn);
    state.btn = btn;
    return btn;
  }

  function trackAndHide(e) {
    if (!e) return;
    try {
      if (e.show !== false) {
        if (_hiddenEntities.indexOf(e) === -1) {
          _hiddenEntities.push(e);
        }
        e.show = false;
      }
    } catch (err) { /* entidad no modificable */ }
  }

  function eachGroupEntity(fn) {
    var WP = global.WP;
    if (!WP || !WP.ents) return;
    GROUPS.forEach(function (k) {
      var arr = WP.ents[k];
      if (Array.isArray(arr)) {
        arr.forEach(function (e) { try { fn(e); } catch (err) { /* entidad ya retirada */ } });
      }
    });
  }

  function hideCanvas() {
    var c = document.getElementById('ra-triad-overlay');
    if (c) c.style.display = 'none';
  }

  function showCanvas() {
    var c = document.getElementById('ra-triad-overlay');
    if (c) c.style.display = '';
  }

  function sweepEntities() {
    if (!global.viewer || !global.viewer.entities || !Array.isArray(global.viewer.entities.values)) return;
    var list = global.viewer.entities.values.slice();
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e) continue;
      var id = e.id;
      if (typeof id === 'string') {
        for (var p = 0; p < HIDE_ID_PREFIXES.length; p++) {
          if (id.indexOf(HIDE_ID_PREFIXES[p]) === 0) {
            trackAndHide(e);
            break;
          }
        }
      }
    }

    // Entidades auxiliares globales específicas
    if (global.panelOutlineEntity) trackAndHide(global.panelOutlineEntity);
    if (global.activePanelDragEntity) trackAndHide(global.activePanelDragEntity);

    if (Array.isArray(global.gizmoEntities)) {
      global.gizmoEntities.forEach(function (g) { trackAndHide(g); });
    }

    if (global.cableRoutingState && Array.isArray(global.cableRoutingState.previewEntities)) {
      global.cableRoutingState.previewEntities.forEach(function (cp) { trackAndHide(cp); });
    }

    if (Array.isArray(global.simulatedStringEntities)) {
      global.simulatedStringEntities.forEach(function (se) {
        trackAndHide(se);
      });
    }

    if (global.inverterEquipmentState && Array.isArray(global.inverterEquipmentState.dcCableEntities)) {
      global.inverterEquipmentState.dcCableEntities.forEach(function (ce) {
        trackAndHide(ce);
        if (ce && ce.isCablePrimitive && ce.primitive && typeof ce.primitive.show !== 'undefined') {
          if (!_savedPrimitiveStates.hiddenCablePrimitives) _savedPrimitiveStates.hiddenCablePrimitives = [];
          if (ce.primitive.show !== false) {
            _savedPrimitiveStates.hiddenCablePrimitives.push(ce.primitive);
            ce.primitive.show = false;
          }
        }
      });
    }

    if (global.obsPlacement) {
      if (Array.isArray(global.obsPlacement.ghost)) {
        global.obsPlacement.ghost.forEach(function (gh) { trackAndHide(gh); });
      }
      if (Array.isArray(global.obsPlacement.cursor)) {
        global.obsPlacement.cursor.forEach(function (cu) { trackAndHide(cu); });
      }
    }
  }

  function apply() {
    // 1. Entidades del plano de trabajo (vértices, líneas, planos P1/P2/P3)
    eachGroupEntity(function (e) { trackAndHide(e); });

    // 2. Barrido universal de entities (edificios, cables, cinta métrica, paneles)
    sweepEntities();

    // 3. Cinta métrica 3D (RAMeasureTool)
    if (global.RAMeasureTool && typeof global.RAMeasureTool.setVisible === 'function') {
      try { global.RAMeasureTool.setVisible(false); } catch (eM) {}
    }

    // 4. Colecciones de etiquetas 3D GPU
    if (global._panelNumberLabelCollection && !global._panelNumberLabelCollection.isDestroyed()) {
      _savedPrimitiveStates.panelLabels = global._panelNumberLabelCollection.show;
      global._panelNumberLabelCollection.show = false;
    }
    if (global._solarHeatmapLabelCollection && !global._solarHeatmapLabelCollection.isDestroyed()) {
      _savedPrimitiveStates.heatmapLabels = global._solarHeatmapLabelCollection.show;
      global._solarHeatmapLabelCollection.show = false;
    }

    // 4b. Colecciones GPU de cableado: inter-módulo (strings) y acometidas (RACableEngine)
    if (global.simulatedStringsPolylineCollection && !global.simulatedStringsPolylineCollection.isDestroyed()) {
      _savedPrimitiveStates.stringWires = global.simulatedStringsPolylineCollection.show;
      global.simulatedStringsPolylineCollection.show = false;
    }
    if (global._raCableEnginePrimitives && !global._raCableEnginePrimitives.isDestroyed()) {
      _savedPrimitiveStates.cableEnginePrimitives = global._raCableEnginePrimitives.show;
      global._raCableEnginePrimitives.show = false;
    }

    // 5. Overlays 2D y badges flotantes HTML
    hideCanvas();
    if (document.body) {
      document.body.classList.add('ra-capture-mode-active');
    }

    // 6. Solicitar repintado de escena
    if (global.viewer && global.viewer.scene && typeof global.viewer.scene.requestRender === 'function') {
      global.viewer.scene.requestRender();
    }
  }

  function restore() {
    // 1. Restaurar visibilidad de todas las entidades ocultadas
    _hiddenEntities.forEach(function (e) {
      try { e.show = true; } catch (err) { /* entidad retirada */ }
    });
    _hiddenEntities = [];

    // 2. Cinta métrica 3D
    if (global.RAMeasureTool && typeof global.RAMeasureTool.setVisible === 'function') {
      try { global.RAMeasureTool.setVisible(true); } catch (eM) {}
    }

    // 3. Colecciones de etiquetas 3D GPU
    if (global._panelNumberLabelCollection && !global._panelNumberLabelCollection.isDestroyed()) {
      global._panelNumberLabelCollection.show = (_savedPrimitiveStates.panelLabels !== false);
    }
    if (global._solarHeatmapLabelCollection && !global._solarHeatmapLabelCollection.isDestroyed()) {
      global._solarHeatmapLabelCollection.show = (_savedPrimitiveStates.heatmapLabels !== false);
    }

    // 3b. Restaurar colecciones GPU de cableado
    if (global.simulatedStringsPolylineCollection && !global.simulatedStringsPolylineCollection.isDestroyed()) {
      global.simulatedStringsPolylineCollection.show = (_savedPrimitiveStates.stringWires !== false);
    }
    if (global._raCableEnginePrimitives && !global._raCableEnginePrimitives.isDestroyed()) {
      global._raCableEnginePrimitives.show = (_savedPrimitiveStates.cableEnginePrimitives !== false);
    }
    if (Array.isArray(_savedPrimitiveStates.hiddenCablePrimitives)) {
      _savedPrimitiveStates.hiddenCablePrimitives.forEach(function (prim) {
        try { prim.show = true; } catch (errPrim) {}
      });
      _savedPrimitiveStates.hiddenCablePrimitives = [];
    }
    _savedPrimitiveStates = {};

    // 4. Overlays 2D y badges HTML
    showCanvas();
    if (document.body) {
      document.body.classList.remove('ra-capture-mode-active');
    }

    // 5. Solicitar repintado de escena
    if (global.viewer && global.viewer.scene && typeof global.viewer.scene.requestRender === 'function') {
      global.viewer.scene.requestRender();
    }
  }

  function updateBtn() {
    var b = state.btn;
    if (!b) return;
    if (state.enabled) {
      b.textContent = '📷 CAPTURA ACTIVA — C para salir';
      b.style.borderColor = 'rgba(52,211,153,0.6)';
      b.style.opacity = '0.15'; // casi invisible en la captura; hover restaura
      b.onmouseenter = function () { b.style.opacity = '1'; };
      b.onmouseleave = function () { b.style.opacity = '0.15'; };
    } else {
      b.textContent = '📷 CAPTURA LIMPIA (C)';
      b.style.borderColor = 'rgba(56,189,248,0.35)';
      b.style.opacity = '1';
      b.onmouseenter = null;
      b.onmouseleave = null;
    }
  }

  var api = {
    get enabled() { return state.enabled; },
    toggle: function () {
      if (state.enabled) api.disable(); else api.enable();
      return state.enabled;
    },
    enable: function () {
      state.enabled = true;
      ensureButton();
      apply();
      updateBtn();
      if (typeof global.showToast === 'function') {
        global.showToast('CAPTURA LIMPIA', 'Andamiaje CAD, cotas y vértices ocultos. Pulsa C para restaurar.', 'info', 3500);
      }
    },
    disable: function () {
      state.enabled = false;
      restore();
      updateBtn();
      if (typeof global.showToast === 'function') {
        global.showToast('VISTA DE EDICIÓN', 'Andamiaje CAD restaurado.', 'info', 2200);
      }
    },
    // Gancho para re-renders que recrean entidades mientras el modo está activo
    reapply: function () { if (state.enabled) apply(); }
  };

  global.RACapture = api;

  // Tecla C — ignorada en campos de texto y durante herramientas de dibujo activas
  document.addEventListener('keydown', function (e) {
    if (e.code !== 'KeyC' || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    var t = e.target;
    if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || '')) return;
    if (t && t.isContentEditable) return;
    if (global.WP && global.WP.mode && global.WP.mode !== 'idle') return;
    e.preventDefault();
    api.toggle();
  });

  // Botón disponible en cuanto hay DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureButton);
  } else {
    ensureButton();
  }

})(typeof window !== 'undefined' ? window : this);
