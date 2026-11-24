// @ts-check
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * RA — Store Centralizado Inmutable (Strangler Pattern · Fase 4 · F4-03)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Estado puro serializable por slices (cero referencias a Cesium o nodos DOM),
 * integrado con RA.EventBus y puente de transición para romper el ciclo
 * project-calcs.js <-> financials.js.
 */
(function (root) {
  'use strict';

  function _createInitialState() {
    return {
      projectMeta: { uuid: null, name: 'Proyecto_Solar', address: '', currentStep: 1 },
      site: { lat: null, lng: null },
      geometry: { planesCount: 0, polylinesCount: 0, panelsCount: 0, version: 0 },
      hardware: { moduleId: null, inverterId: null, batteryId: null, topology: 'string' },
      simulation: { hasHeatmap: false, dirty: true, annualKWh: 0, avgShadowLossPct: 0 },
      financial: { lastModel: null, numPanels: -1, updatedAt: 0 },
      ui: { activeTab: 'solar' }
    };
  }

  /** @type {any} */
  var _state = _createInitialState();
  /** @type {Map<string, Set<Function>>} */
  var _subscribers = new Map();

  function getState() {
    return _state;
  }

  /**
   * @param {string} slice
   */
  function getSlice(slice) {
    return _state[slice];
  }

  /**
   * @param {string} slice
   * @param {Record<string, any>} patch
   * @param {{ silent?: boolean, reason?: string }} [meta]
   */
  function setSlice(slice, patch, meta) {
    if (!slice || !_state[slice] || !patch || typeof patch !== 'object') {
      return _state[slice];
    }
    var prev = _state[slice];
    var next = Object.assign({}, prev, patch);
    _state = Object.assign({}, _state);
    _state[slice] = next;

    var sliceSubs = _subscribers.get(slice);
    if (sliceSubs && sliceSubs.size > 0) {
      sliceSubs.forEach(function (fn) {
        try { fn(next, _state); } catch (e) {
          if (root.RA && root.RA.log) root.RA.log.error('[RA.Store] Error subscriber ' + slice + ':', e);
        }
      });
    }
    var allSubs = _subscribers.get('*');
    if (allSubs && allSubs.size > 0) {
      allSubs.forEach(function (fn) {
        try { fn(_state, _state); } catch (_) {}
      });
    }

    if ((!meta || !meta.silent) && root.RA && root.RA.EventBus && root.RA.Events) {
      var evName = root.RA.Events.PROJECT_UPDATED;
      if (slice === 'geometry') evName = root.RA.Events.GEOMETRY_MUTATED;
      else if (slice === 'hardware') evName = root.RA.Events.HARDWARE_CHANGED;
      else if (slice === 'simulation') evName = root.RA.Events.SIMULATION_UPDATED;
      root.RA.EventBus.emit(evName, { slice: slice, reason: (meta && meta.reason) || slice });
    }
    return next;
  }

  /**
   * @param {string} slice
   * @param {Function} listener
   */
  function subscribe(slice, listener) {
    if (typeof listener !== 'function') return function () {};
    var key = slice || '*';
    if (!_subscribers.has(key)) _subscribers.set(key, new Set());
    _subscribers.get(key).add(listener);
    return function unsubscribe() {
      var set = _subscribers.get(key);
      if (set) set.delete(listener);
    };
  }

  /**
   * Selector puro memoizado del último modelo financiero calculado.
   * Rompe la dependencia circular project-calcs.js <-> financials.js.
   * @param {number} [expectedNumPanels]
   */
  function getFinancialModel(expectedNumPanels) {
    var fin = _state.financial;
    if (!fin || !fin.lastModel) return null;
    if (typeof expectedNumPanels === 'number' && fin.numPanels !== expectedNumPanels) {
      return null;
    }
    return fin.lastModel;
  }

  /**
   * @param {any} model
   */
  function setFinancialModel(model) {
    var np = (model && typeof model.numPanels === 'number') ? model.numPanels : -1;
    setSlice('financial', {
      lastModel: model || null,
      numPanels: np,
      updatedAt: Date.now()
    }, { silent: true });
    if (typeof root !== 'undefined') {
      root._lastFinModel = model || null;
    }
  }

  function reset() {
    _state = _createInitialState();
    if (typeof root !== 'undefined') {
      root._lastFinModel = null;
    }
  }

  var Store = Object.freeze({
    getState: getState,
    getSlice: getSlice,
    setSlice: setSlice,
    subscribe: subscribe,
    getFinancialModel: getFinancialModel,
    setFinancialModel: setFinancialModel,
    reset: reset
  });

  root.RA = root.RA || {};
  root.RA.Store = Store;
  root.RAStore = Store;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
