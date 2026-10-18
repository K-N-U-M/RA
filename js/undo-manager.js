/**
 * ============================================================================
 * ↩️ RA · UNIVERSAL UNDO / REDO MANAGER (Deshacer / Rehacer Universal)
 * ============================================================================
 * Sistema unificado transaccional con soporte para:
 *   - Deshacer (Undo / Ctrl+Z) y Rehacer (Redo / Ctrl+Y o Ctrl+Shift+Z).
 *   - Arrastres con Gizmo Universal y Tríada CAD (beginDrag / commitDrag).
 *   - Eliminación y creación de obstáculos, edificios, planos, faldones y cables.
 *   - Edición de vértices, eliminación de paneles individuales y layout solar.
 *
 * Reglas de diseño:
 *   - Sincronización in-place (arr.length = 0 + push) para no romper alias
 *     por referencia en módulos externos (obstacles, buildings, WP.polylines).
 *   - deepClone / revive preserva coordenadas Cesium.Cartesian3 con marcador
 *     __raCart y omite referencias a entidades/primitivas GPU.
 * ============================================================================
 */
(function (global) {
  'use strict';

  var MAX_UNDO_STEPS = 30;
  var undoStack = [];
  var redoStack = [];
  var _pendingDrag = null;

  // Claves que nunca se clonan: referencias a objetos GPU/DOM que se recrean al renderizar
  var SKIP_KEYS = {
    entity: true, entities: true, primitive: true, primitives: true,
    label: true, billboard: true, point: true, polygon: true, polyline: true,
    material: true, appearance: true, geometry: true, modelMatrix: true,
    lineEnt: true, fillEnt: true, activePanelDragEntity: true,
    dcCableEntities: true, simulatedPanelEntities: true, simulatedSupportEntities: true,
    simulatedStringEntities: true, _obsEntities: true, _bldEntities: true,
    _panelNumberEntities: true, _panelNumberLabelCollection: true,
    simulatedPanelsPrimitive: true, simulatedSupportsPolylineCollection: true,
    simulatedStringsPolylineCollection: true
  };

  function isCesiumGPUObject(v) {
    if (!v || typeof v !== 'object') return false;
    if (v._entityCollection || (v._id !== undefined && v._definitionChanged !== undefined)) return true;
    if (typeof Cesium !== 'undefined' && Cesium.Entity && (v instanceof Cesium.Entity)) return true;
    if (v.isDestroyed && typeof v.isDestroyed === 'function') return true;
    return false;
  }

  function isCartesianLike(v) {
    return v && typeof v === 'object' &&
      typeof v.x === 'number' && typeof v.y === 'number' && typeof v.z === 'number';
  }

  function deepClone(v, depth) {
    if (depth > 14) return null;
    if (isCesiumGPUObject(v)) return null;
    if (Array.isArray(v)) {
      return v.map(function (item) { return deepClone(item, depth + 1); }).filter(function(item) { return item !== null; });
    }
    if (v && typeof v === 'object') {
      if (v instanceof Date) return new Date(v.getTime());
      if (isCartesianLike(v)) return { __raCart: true, x: v.x, y: v.y, z: v.z };
      var o = {};
      for (var k in v) {
        if (!Object.prototype.hasOwnProperty.call(v, k)) continue;
        if (k.charAt(0) === '_' || SKIP_KEYS[k]) continue;
        var val = v[k];
        if (typeof val === 'function' || isCesiumGPUObject(val)) continue;
        o[k] = deepClone(val, depth + 1);
      }
      return o;
    }
    return v;
  }

  function revive(v) {
    if (Array.isArray(v)) return v.map(revive);
    if (v && typeof v === 'object') {
      if (v.__raCart) {
        return (typeof Cesium !== 'undefined' && Cesium.Cartesian3)
          ? new Cesium.Cartesian3(v.x, v.y, v.z)
          : { x: v.x, y: v.y, z: v.z };
      }
      var o = {};
      for (var k in v) {
        if (!Object.prototype.hasOwnProperty.call(v, k)) continue;
        o[k] = revive(v[k]);
      }
      return o;
    }
    return v;
  }

  function replaceInPlace(arr, items) {
    if (!Array.isArray(arr) || !Array.isArray(items)) return;
    arr.length = 0;
    items.forEach(function (it) { arr.push(it); });
  }

  // ── CAPTURA Y RESTAURACIÓN DE ESTADOS ──────────────────────────────────────

  function captureState(kind, meta) {
    try {
      if (kind === 'obstacles') {
        var obsArr = (typeof window !== 'undefined' && Array.isArray(window.obstacles)) ? window.obstacles : global.obstacles;
        return {
          obstacles: Array.isArray(obsArr) ? deepClone(obsArr, 0) : [],
          selectedId: global.selectedObstacleId || (typeof window !== 'undefined' ? window.selectedObstacleId : null)
        };
      }
      if (kind === 'buildings') {
        var bldArr = (typeof window !== 'undefined' && Array.isArray(window.buildings)) ? window.buildings : global.buildings;
        return {
          buildings: Array.isArray(bldArr) ? deepClone(bldArr, 0) : [],
          selectedId: global.selectedBuildingId || (typeof window !== 'undefined' ? window.selectedBuildingId : null)
        };
      }
      if (kind === 'vertex') {
        var WPn = global.WP;
        var pIdx = (meta && typeof meta.polyIdx === 'number') ? meta.polyIdx : (WPn ? WPn.selectedPolyIdx : 0);
        var poly = (WPn && WPn.polylines && WPn.polylines[pIdx]) ? WPn.polylines[pIdx] : null;
        if (!poly) return null;
        return {
          polyIdx: pIdx,
          points: deepClone(poly.points || [], 0),
          area: poly.area
        };
      }
      if (kind === 'panel_delete') {
        var WPp = global.WP;
        var pIdxDel = (meta && typeof meta.polyIdx === 'number') ? meta.polyIdx : (WPp ? WPp.selectedPolyIdx : 0);
        var polyP = (WPp && WPp.polylines && WPp.polylines[pIdxDel]) ? WPp.polylines[pIdxDel] : null;
        if (!polyP) return null;
        return {
          polyIdx: pIdxDel,
          deletedPanels: deepClone(polyP.deletedPanels || [], 0)
        };
      }
      if (kind === 'polylines') {
        var WPpl = global.WP;
        return {
          polylines: (WPpl && Array.isArray(WPpl.polylines)) ? deepClone(WPpl.polylines, 0) : [],
          selectedPolyIdx: (WPpl && typeof WPpl.selectedPolyIdx === 'number') ? WPpl.selectedPolyIdx : -1,
          polygonPoints: (Array.isArray(global.polygonPoints)) ? deepClone(global.polygonPoints, 0) : []
        };
      }
      if (kind === 'planes') {
        var WPpln = global.WP;
        return {
          planes: (WPpln && Array.isArray(WPpln.planes)) ? deepClone(WPpln.planes, 0) : [],
          activePlaneIdx: (WPpln && typeof WPpln.activePlaneIdx === 'number') ? WPpln.activePlaneIdx : 0
        };
      }
      if (kind === 'electrical') {
        return {
          inverterEquipmentState: global.inverterEquipmentState ? deepClone(global.inverterEquipmentState, 0) : null,
          cableRoutingState: global.cableRoutingState ? deepClone(global.cableRoutingState, 0) : null
        };
      }
      if (kind === 'project') {
        if (typeof global.raExportProjectData === 'function') {
          var pData = global.raExportProjectData();
          if (pData) {
            delete pData.simulationCache;
            delete pData.annualHeatmapData;
          }
          return pData;
        }
      }
    } catch (e) {
      if (global.RA && global.RA.log) global.RA.log.warn('RAundo.captureState error:', e);
    }
    return null;
  }

  function restoreState(entry) {
    if (!entry || !entry.data) return false;
    var kind = entry.kind;
    var data = entry.data;

    if (kind === 'obstacles') {
      var arr = (typeof window !== 'undefined' && Array.isArray(window.obstacles)) ? window.obstacles : global.obstacles;
      if (!Array.isArray(arr)) arr = [];
      replaceInPlace(arr, revive(data.obstacles || data));
      global.obstacles = arr;
      if (typeof window !== 'undefined') window.obstacles = arr;
      global.selectedObstacleId = data.selectedId || null;
      if (typeof window !== 'undefined') window.selectedObstacleId = global.selectedObstacleId;
      if (typeof global.render3DObstaclesInCesium === 'function') global.render3DObstaclesInCesium();
      if (typeof global.recalculateLayoutAndObstacles === 'function') global.recalculateLayoutAndObstacles();
      if (global.ProjectHierarchy && typeof global.ProjectHierarchy.notify === 'function') global.ProjectHierarchy.notify('obstacle_restored');
      if (typeof global.renderUniversalGizmo2D === 'function') global.renderUniversalGizmo2D();
      if (typeof global.wpInvalidateHeatmap === 'function') global.wpInvalidateHeatmap('Obstáculos restaurados');
      return true;
    }

    if (kind === 'buildings') {
      var bldArr = (typeof window !== 'undefined' && Array.isArray(window.buildings)) ? window.buildings : global.buildings;
      if (!Array.isArray(bldArr)) bldArr = [];
      replaceInPlace(bldArr, revive(data.buildings || data));
      global.buildings = bldArr;
      if (typeof window !== 'undefined') window.buildings = bldArr;
      global.selectedBuildingId = data.selectedId || null;
      if (typeof window !== 'undefined') window.selectedBuildingId = global.selectedBuildingId;
      if (typeof global.render3DBuildingsInCesium === 'function') global.render3DBuildingsInCesium();
      if (typeof global.recalculateLayoutAndObstacles === 'function') global.recalculateLayoutAndObstacles();
      if (global.ProjectHierarchy && typeof global.ProjectHierarchy.notify === 'function') global.ProjectHierarchy.notify('building_restored');
      if (typeof global.renderUniversalGizmo2D === 'function') global.renderUniversalGizmo2D();
      if (typeof global.wpInvalidateHeatmap === 'function') global.wpInvalidateHeatmap('Edificios restaurados');
      return true;
    }

    if (kind === 'vertex') {
      var WPn = global.WP;
      var pIdx = (entry.meta && typeof entry.meta.polyIdx === 'number') ? entry.meta.polyIdx : (data.polyIdx !== undefined ? data.polyIdx : (WPn ? WPn.selectedPolyIdx : 0));
      var poly = (WPn && WPn.polylines && WPn.polylines[pIdx]) ? WPn.polylines[pIdx] : null;
      if (!poly) return false;
      poly.points = revive(data.points);
      poly.area = data.area;
      if (WPn && WPn.selectedPolyIdx === pIdx && Array.isArray(global.polygonPoints)) {
        replaceInPlace(global.polygonPoints, poly.points.map(p => Cesium.Cartesian3.clone(p)));
      }
      if (typeof global.wpRenderAllPolylines === 'function') global.wpRenderAllPolylines();
      if (typeof global.wpSyncVertexInputs === 'function') global.wpSyncVertexInputs();
      if (typeof global.wpFastRenderSimulatedPanels === 'function') global.wpFastRenderSimulatedPanels();
      if (typeof global.wpInvalidateHeatmap === 'function') global.wpInvalidateHeatmap('Vértice restaurado');
      return true;
    }

    if (kind === 'panel_delete') {
      var WPp = global.WP;
      var pIdxP = (entry.meta && typeof entry.meta.polyIdx === 'number') ? entry.meta.polyIdx : (data.polyIdx !== undefined ? data.polyIdx : (WPp ? WPp.selectedPolyIdx : 0));
      var polyP = (WPp && WPp.polylines && WPp.polylines[pIdxP]) ? WPp.polylines[pIdxP] : null;
      if (!polyP) return false;
      polyP.deletedPanels = revive(data.deletedPanels);
      if (typeof global.wpFastRenderSimulatedPanels === 'function') global.wpFastRenderSimulatedPanels();
      if (typeof global.recalculateSolarYield === 'function') global.recalculateSolarYield();
      if (typeof global.wpInvalidateHeatmap === 'function') global.wpInvalidateHeatmap('Paneles restaurados');
      return true;
    }

    if (kind === 'polylines') {
      var WPpl = global.WP;
      if (WPpl && Array.isArray(WPpl.polylines)) {
        replaceInPlace(WPpl.polylines, revive(data.polylines));
        WPpl.selectedPolyIdx = (typeof data.selectedPolyIdx === 'number') ? data.selectedPolyIdx : (WPpl.polylines.length > 0 ? 0 : -1);
        if (Array.isArray(data.polygonPoints) && global.polygonPoints) {
          replaceInPlace(global.polygonPoints, revive(data.polygonPoints));
        }
        if (typeof global.wpRenderAllPolylines === 'function') global.wpRenderAllPolylines();
        if (typeof global.wpFastRenderSimulatedPanels === 'function') global.wpFastRenderSimulatedPanels();
        if (typeof global.wpUpdateUI === 'function') global.wpUpdateUI();
        if (typeof global.wpSyncVertexInputs === 'function') global.wpSyncVertexInputs();
        if (typeof global.recalculateSolarYield === 'function') global.recalculateSolarYield();
        if (typeof global.wpInvalidateHeatmap === 'function') global.wpInvalidateHeatmap('Faldones restaurados');
        return true;
      }
    }

    if (kind === 'planes') {
      var WPpln = global.WP;
      if (WPpln && Array.isArray(WPpln.planes)) {
        replaceInPlace(WPpln.planes, revive(data.planes));
        WPpln.activePlaneIdx = (typeof data.activePlaneIdx === 'number') ? data.activePlaneIdx : (WPpln.planes.length > 0 ? 0 : -1);
        if (typeof global.wpRenderActivePlaneGizmo === 'function') global.wpRenderActivePlaneGizmo();
        if (typeof global.wpUpdateUI === 'function') global.wpUpdateUI();
        if (global.ProjectHierarchy && typeof global.ProjectHierarchy.notify === 'function') global.ProjectHierarchy.notify('plane_restored');
        if (typeof global.wpInvalidateHeatmap === 'function') global.wpInvalidateHeatmap('Planos restaurados');
        return true;
      }
    }

    if (kind === 'electrical') {
      if (data.inverterEquipmentState && global.inverterEquipmentState) {
        var revInv = revive(data.inverterEquipmentState);
        var liveCableEntities = global.inverterEquipmentState.dcCableEntities || [];
        for (var k in revInv) {
          if (k !== 'dcCableEntities') {
            global.inverterEquipmentState[k] = revInv[k];
          }
        }
        global.inverterEquipmentState.dcCableEntities = liveCableEntities;
      }
      if (data.cableRoutingState && global.cableRoutingState) {
        var revCr = revive(data.cableRoutingState);
        for (var ck in revCr) global.cableRoutingState[ck] = revCr[ck];
      }
      if (typeof global.wpCalculateAndRenderInverterCables === 'function') global.wpCalculateAndRenderInverterCables();
      if (global.RACableEngine && typeof global.RACableEngine.redrawAll === 'function') global.RACableEngine.redrawAll();
      if (typeof global.wpUpdateStep4UI === 'function') global.wpUpdateStep4UI();
      return true;
    }

    if (kind === 'project') {
      if (typeof global.raImportProjectData === 'function' && data) {
        global.raImportProjectData(data, { preserveUndoHistory: true });
        return true;
      }
    }

    return false;
  }

  // ── GESTIÓN DE PILAS Y BOTONES ─────────────────────────────────────────────

  function updateUIButtons() {
    var canU = undoStack.length > 0;
    var canR = redoStack.length > 0;
    var lastUndo = canU ? undoStack[undoStack.length - 1] : null;
    var lastRedo = canR ? redoStack[redoStack.length - 1] : null;

    var btnU = (typeof document !== 'undefined') ? document.getElementById('btn-undo') : null;
    var btnR = (typeof document !== 'undefined') ? document.getElementById('btn-redo') : null;

    if (btnU) {
      btnU.style.opacity = canU ? '1' : '0.35';
      btnU.style.pointerEvents = canU ? 'auto' : 'none';
      btnU.title = canU ? ('Deshacer: ' + (lastUndo.label || 'Última acción')) : 'Nada que deshacer (Ctrl+Z)';
    }
    if (btnR) {
      btnR.style.opacity = canR ? '1' : '0.35';
      btnR.style.pointerEvents = canR ? 'auto' : 'none';
      btnR.title = canR ? ('Rehacer: ' + (lastRedo.label || 'Última acción')) : 'Nada que rehacer (Ctrl+Y)';
    }

    // Actualizar posibles botones genéricos con clase .ra-btn-undo / .ra-btn-redo
    if (typeof document !== 'undefined' && document.querySelectorAll) {
      document.querySelectorAll('.ra-btn-undo').forEach(function(b) {
        b.disabled = !canU;
        b.style.opacity = canU ? '1' : '0.35';
      });
      document.querySelectorAll('.ra-btn-redo').forEach(function(b) {
        b.disabled = !canR;
        b.style.opacity = canR ? '1' : '0.35';
      });
    }
  }

  function pushEntry(kind, label, meta) {
    var state = captureState(kind, meta);
    if (!state) return;

    if (kind === 'project') {
      // Limitar snapshots completos de proyecto a un máximo de 3 para no saturar memoria heap (>100MB)
      var projCount = 0;
      for (var pi = undoStack.length - 1; pi >= 0; pi--) {
        if (undoStack[pi].kind === 'project') {
          projCount++;
          if (projCount >= 3) {
            undoStack.splice(pi, 1);
          }
        }
      }
    }

    undoStack.push({
      kind: kind,
      label: label || ('Modificación de ' + kind),
      data: state,
      meta: meta || null,
      timestamp: Date.now()
    });
    if (undoStack.length > MAX_UNDO_STEPS) undoStack.shift();
    redoStack.length = 0; // Limpiar pila de rehacer al haber nueva acción
    updateUIButtons();
  }

  // ── DESHACER (UNDO) Y REHACER (REDO) ──────────────────────────────────────

  function undo() {
    var entry = undoStack.pop();
    if (!entry) {
      if (typeof global.showStatus === 'function') global.showStatus('NADA QUE DESHACER', 1200);
      return false;
    }
    try {
      // Capturar estado actual de este subsistema antes de sobreescribirlo para el Redo
      var currentState = captureState(entry.kind, entry.meta);
      if (currentState) {
        redoStack.push({
          kind: entry.kind,
          label: entry.label,
          data: currentState,
          meta: entry.meta,
          timestamp: Date.now()
        });
        if (redoStack.length > MAX_UNDO_STEPS) redoStack.shift();
      }

      var ok = restoreState(entry);
      updateUIButtons();

      if (ok && typeof global.showToast === 'function') {
        global.showToast('DESHACER', '↩ ' + (entry.label || 'Acción deshecha') + '.', 'info', 2200);
      }
      return ok;
    } catch (err) {
      if (global.RA && global.RA.log) global.RA.log.warn('RAundo.undo falló:', err);
      return false;
    }
  }

  function redo() {
    var entry = redoStack.pop();
    if (!entry) {
      if (typeof global.showStatus === 'function') global.showStatus('NADA QUE REHACER', 1200);
      return false;
    }
    try {
      // Capturar estado actual para permitir un nuevo Undo simétrico
      var currentState = captureState(entry.kind, entry.meta);
      if (currentState) {
        undoStack.push({
          kind: entry.kind,
          label: entry.label,
          data: currentState,
          meta: entry.meta,
          timestamp: Date.now()
        });
        if (undoStack.length > MAX_UNDO_STEPS) undoStack.shift();
      }

      var ok = restoreState(entry);
      updateUIButtons();

      if (ok && typeof global.showToast === 'function') {
        global.showToast('REHACER', '↪ ' + (entry.label || 'Acción rehecha') + '.', 'info', 2200);
      }
      return ok;
    } catch (err) {
      if (global.RA && global.RA.log) global.RA.log.warn('RAundo.redo falló:', err);
      return false;
    }
  }

  // ── TRANSACCIONES DE ARRASTRE (GIZMO / TRÍADA) ─────────────────────────────

  function beginDrag(targetType) {
    var kind = 'obstacles';
    var label = 'Mover elemento';
    var meta = null;

    if (targetType === 'vertex') {
      kind = 'polylines';
      label = 'Mover vértice';
    } else if (targetType === 'building') {
      kind = 'buildings';
      label = 'Mover edificio';
    } else if (targetType === 'obstacle') {
      kind = 'obstacles';
      label = 'Mover obstáculo';
    } else if (targetType === 'panel') {
      kind = 'polylines';
      label = 'Mover panel';
    } else if (targetType === 'equipment' || targetType === 'inverter' || targetType === 'gridMeter') {
      kind = 'electrical';
      label = 'Mover equipo eléctrico';
    }

    _pendingDrag = {
      kind: kind,
      label: label,
      meta: meta,
      data: captureState(kind, meta)
    };
  }

  function commitDrag(customLabel) {
    if (!_pendingDrag || !_pendingDrag.data) {
      _pendingDrag = null;
      return;
    }
    try {
      var current = captureState(_pendingDrag.kind, _pendingDrag.meta);
      var beforeStr = JSON.stringify(_pendingDrag.data);
      var afterStr = JSON.stringify(current);

      if (beforeStr !== afterStr) {
        undoStack.push({
          kind: _pendingDrag.kind,
          label: customLabel || _pendingDrag.label,
          data: _pendingDrag.data,
          meta: _pendingDrag.meta,
          timestamp: Date.now()
        });
        if (undoStack.length > MAX_UNDO_STEPS) undoStack.shift();
        redoStack.length = 0;
        updateUIButtons();
      }
    } catch (e) {
      if (global.RA && global.RA.log) global.RA.log.warn('Error en commitDrag:', e);
    }
    _pendingDrag = null;
  }

  function cancelDrag() {
    _pendingDrag = null;
  }

  // ── MÉTODOS PÚBLICOS DE SNAPSHOT ──────────────────────────────────────────

  function snapObstacles(label) { pushEntry('obstacles', label || 'Obstáculos'); }
  function snapBuildings(label) { pushEntry('buildings', label || 'Edificios'); }
  function snapVertex(polyIdx, label) { pushEntry('vertex', label || 'Vértice de faldón', { polyIdx: polyIdx }); }
  function snapPanelDelete(polyIdx, label) { pushEntry('panel_delete', label || 'Eliminar panel', { polyIdx: polyIdx }); }
  function snapPolylines(label) { pushEntry('polylines', label || 'Faldones de cubierta'); }
  function snapPlanes(label) { pushEntry('planes', label || 'Planos de trabajo'); }
  function snapElectrical(label) { pushEntry('electrical', label || 'Infraestructura eléctrica'); }
  function snapProject(label) { pushEntry('project', label || 'Proyecto solar'); }

  // ── EXPORTACIÓN AL ENTORNO GLOBAL ─────────────────────────────────────────

  global.RAundo = {
    // Snapshots específicos
    snapObstacles: snapObstacles,
    snapBuildings: snapBuildings,
    snapVertex: snapVertex,
    snapPanelDelete: snapPanelDelete,
    snapPolylines: snapPolylines,
    snapPlanes: snapPlanes,
    snapElectrical: snapElectrical,
    snapProject: snapProject,

    // Transacciones de arrastre
    beginDrag: beginDrag,
    commitDrag: commitDrag,
    cancelDrag: cancelDrag,

    // Deshacer y Rehacer
    undo: undo,
    redo: redo,
    canUndo: function () { return undoStack.length > 0; },
    canRedo: function () { return redoStack.length > 0; },
    count: function () { return undoStack.length; },
    redoCount: function () { return redoStack.length; },
    getUndoLabel: function () { return (undoStack.length > 0) ? undoStack[undoStack.length - 1].label : ''; },
    getRedoLabel: function () { return (redoStack.length > 0) ? redoStack[redoStack.length - 1].label : ''; },
    clear: function () { undoStack.length = 0; redoStack.length = 0; _pendingDrag = null; updateUIButtons(); },
    updateUIButtons: updateUIButtons
  };

  // Alias para retrocompatibilidad
  if (typeof global.undoGeometry === 'undefined') {
    global.undoGeometry = undo;
  }
  if (typeof global.redoGeometry === 'undefined') {
    global.redoGeometry = redo;
  }

})(typeof window !== 'undefined' ? window : this);
