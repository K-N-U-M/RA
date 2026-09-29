/**
 * ============================================================================
 * ↩️ RA · UNDO MANAGER (P0 — Protección contra borrados accidentales)
 * ============================================================================
 * Cobertura P0: eliminación de obstáculos, edificios, paneles y vértices de
 * polilínea (las operaciones destructivas sin vuelta atrás detectadas en la
 * auditoría del 29/09/2026). No cubre aún: drags, cambios de configuración.
 *
 * Reglas de diseño:
 *   - La restauración muta los arrays globales IN PLACE (length=0 + push) para
 *     no romper los alias por referencia de los módulos (patrón decoy de
 *     obstacles.js: `var obstacles = global.obstacles`).
 *   - deepClone ignora referencias a entidades/primitivas Cesium (se recrean
 *     al re-renderizar) y marca los puntos {x,y,z} para revivirlos como
 *     Cesium.Cartesian3.
 * ============================================================================
 */
(function (global) {
  'use strict';

  var MAX_UNDO_STEPS = 20;
  var stack = [];

  // Claves que nunca se clonan: refs a objetos GPU/DOM que se recrean al renderizar
  var SKIP_KEYS = {
    entity: true, entities: true, primitive: true, primitives: true,
    label: true, billboard: true, point: true, polygon: true, polyline: true,
    material: true, appearance: true, geometry: true, modelMatrix: true
  };

  function isCartesianLike(v) {
    return v && typeof v === 'object' &&
      typeof v.x === 'number' && typeof v.y === 'number' && typeof v.z === 'number';
  }

  function deepClone(v, depth) {
    if (depth > 12) return null;
    if (Array.isArray(v)) return v.map(function (item) { return deepClone(item, depth + 1); });
    if (v && typeof v === 'object') {
      if (v instanceof Date) return new Date(v.getTime());
      if (isCartesianLike(v)) return { __raCart: true, x: v.x, y: v.y, z: v.z };
      var o = {};
      for (var k in v) {
        if (!Object.prototype.hasOwnProperty.call(v, k)) continue;
        if (k.charAt(0) === '_' || SKIP_KEYS[k]) continue;
        var val = v[k];
        if (typeof val === 'function') continue;
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

  // Restauración in-place: todos los alias (módulo + window) comparten el mismo array
  function replaceInPlace(arr, items) {
    arr.length = 0;
    items.forEach(function (it) { arr.push(it); });
  }

  function push(entry) {
    stack.push(entry);
    if (stack.length > MAX_UNDO_STEPS) stack.shift();
  }

  // ── SNAPSHOTS (llamar SIEMPRE antes de la mutación destructiva) ───────────

  function snapObstacles() {
    var arr = global.obstacles;
    if (!Array.isArray(arr)) return;
    push({
      kind: 'obstacles',
      data: deepClone(arr, 0),
      sel: global.selectedObstacleId || null
    });
  }

  function snapBuildings() {
    var arr = global.buildings;
    if (!Array.isArray(arr)) return;
    push({ kind: 'buildings', data: deepClone(arr, 0) });
  }

  function snapVertex(polyIdx) {
    var WPn = global.WP;
    var poly = (WPn && WPn.polylines && WPn.polylines[polyIdx]) ? WPn.polylines[polyIdx] : null;
    if (!poly) return;
    push({ kind: 'vertex', polyIdx: polyIdx, points: deepClone(poly.points || [], 0), area: poly.area });
  }

  function snapPanelDelete(polyIdx) {
    var WPn = global.WP;
    var poly = (WPn && WPn.polylines && WPn.polylines[polyIdx]) ? WPn.polylines[polyIdx] : null;
    if (!poly) return;
    push({ kind: 'panel_delete', polyIdx: polyIdx, deletedPanels: deepClone(poly.deletedPanels || [], 0) });
  }

  // ── UNDO ──────────────────────────────────────────────────────────────────

  function undo() {
    var e = stack.pop();
    if (!e) return false;
    try {
      if (e.kind === 'obstacles') {
        if (!Array.isArray(global.obstacles)) global.obstacles = [];
        replaceInPlace(global.obstacles, revive(e.data));
        global.selectedObstacleId = e.sel || null;
        if (typeof window !== 'undefined') window.selectedObstacleId = global.selectedObstacleId;
        if (typeof global.render3DObstaclesInCesium === 'function') global.render3DObstaclesInCesium();
        if (typeof global.recalculateLayoutAndObstacles === 'function') global.recalculateLayoutAndObstacles();
      } else if (e.kind === 'buildings') {
        if (!Array.isArray(global.buildings)) global.buildings = [];
        replaceInPlace(global.buildings, revive(e.data));
        if (typeof global.selectedBuildingId !== 'undefined') global.selectedBuildingId = null;
        if (typeof global.render3DBuildingsInCesium === 'function') global.render3DBuildingsInCesium();
        if (typeof global.recalculateLayoutAndObstacles === 'function') global.recalculateLayoutAndObstacles();
      } else if (e.kind === 'vertex') {
        var WPn = global.WP;
        var poly = (WPn && WPn.polylines && WPn.polylines[e.polyIdx]) ? WPn.polylines[e.polyIdx] : null;
        if (!poly) return false;
        poly.points = revive(e.points);
        poly.area = e.area;
        if (typeof global.wpRenderAllPolylines === 'function') global.wpRenderAllPolylines();
        if (typeof global.wpSyncVertexInputs === 'function') global.wpSyncVertexInputs();
        if (typeof global.wpFastRenderSimulatedPanels === 'function') global.wpFastRenderSimulatedPanels();
        if (typeof global.wpInvalidateHeatmap === 'function') global.wpInvalidateHeatmap('Vértice restaurado');
      } else if (e.kind === 'panel_delete') {
        var WPp = global.WP;
        var polyP = (WPp && WPp.polylines && WPp.polylines[e.polyIdx]) ? WPp.polylines[e.polyIdx] : null;
        if (!polyP) return false;
        polyP.deletedPanels = revive(e.deletedPanels);
        if (typeof global.wpFastRenderSimulatedPanels === 'function') global.wpFastRenderSimulatedPanels();
      }
      if (typeof global.showToast === 'function') {
        var label = { obstacles: 'obstáculos', buildings: 'edificio', vertex: 'vértice', panel_delete: 'panel' }[e.kind] || e.kind;
        global.showToast('DESHACER', 'Borrado restaurado (' + label + ').', 'info', 2200);
      }
      return true;
    } catch (err) {
      if (global.RA && global.RA.log) global.RA.log.warn('RAundo.undo falló', err);
      return false;
    }
  }

  global.RAundo = {
    snapObstacles: snapObstacles,
    snapBuildings: snapBuildings,
    snapVertex: snapVertex,
    snapPanelDelete: snapPanelDelete,
    undo: undo,
    canUndo: function () { return stack.length > 0; },
    count: function () { return stack.length; }
  };

})(typeof window !== 'undefined' ? window : this);
