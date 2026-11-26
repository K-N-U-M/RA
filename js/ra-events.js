/**
 * ============================================================================
 * 📡 RA · EVENT BUS Y STORE REACTIVO (SSOT)
 * ============================================================================
 * Archivo: js/ra-events.js
 * Rol: Bus de eventos ligero (window.RA.events) y almacén reactivo de estado
 *      (window.RA.Store) para desacoplar módulos y erradicar el polling por
 *      setInterval en los HUDs y controladores.
 * ============================================================================
 */
(function (root) {
  'use strict';

  var ra = root.RA;
  if (!ra || typeof ra !== 'object') {
    ra = {};
    root.RA = ra;
  }

  function reportListenerError(ctx, err) {
    if (root.RA_ErrorHandler && typeof root.RA_ErrorHandler.handle === 'function') {
      root.RA_ErrorHandler.handle(err, ctx);
    } else if (typeof console !== 'undefined' && typeof console.warn === 'function') {
      console.warn('[RA.events]', ctx, err);
    }
  }

  // ── 1. Bus de Eventos Ligero: window.RA.events ────────────────────────────
  var _listeners = Object.create(null);

  function on(eventName, handler) {
    if (typeof eventName !== 'string' || !eventName || typeof handler !== 'function') {
      return function () {};
    }
    var list = _listeners[eventName];
    if (!list) {
      list = [];
      _listeners[eventName] = list;
    }
    if (list.indexOf(handler) === -1) {
      list.push(handler);
    }
    return function unsubscribe() {
      off(eventName, handler);
    };
  }

  function off(eventName, handler) {
    if (typeof eventName !== 'string' || !eventName) return;
    var list = _listeners[eventName];
    if (!list) return;
    if (typeof handler !== 'function') {
      delete _listeners[eventName];
      return;
    }
    var idx = list.indexOf(handler);
    if (idx !== -1) {
      list.splice(idx, 1);
    }
    if (list.length === 0) {
      delete _listeners[eventName];
    }
  }

  function once(eventName, handler) {
    if (typeof handler !== 'function') return function () {};
    var wrapped = function (payload) {
      off(eventName, wrapped);
      handler(payload);
    };
    return on(eventName, wrapped);
  }

  function emit(eventName, payload) {
    if (typeof eventName !== 'string' || !eventName) return 0;
    var list = _listeners[eventName];
    if (!list || list.length === 0) return 0;
    var snapshot = list.slice();
    for (var i = 0; i < snapshot.length; i++) {
      try {
        snapshot[i](payload);
      } catch (err) {
        reportListenerError('RA.events:' + eventName, err);
      }
    }
    return snapshot.length;
  }

  function listenerCount(eventName) {
    var list = _listeners[eventName];
    return list ? list.length : 0;
  }

  var events = {
    on: on,
    off: off,
    once: once,
    emit: emit,
    listenerCount: listenerCount
  };

  // ── 2. Almacén Reactivo Ligero: window.RA.Store ───────────────────────────
  var _state = Object.create(null);

  function isSameValue(a, b) {
    return a === b || (a !== a && b !== b);
  }

  var Store = {
    get: function (key, fallback) {
      if (typeof key !== 'string' || !key) return fallback;
      return Object.prototype.hasOwnProperty.call(_state, key) ? _state[key] : fallback;
    },

    set: function (key, value) {
      if (typeof key !== 'string' || !key) return false;
      var prev = Object.prototype.hasOwnProperty.call(_state, key) ? _state[key] : undefined;
      if (isSameValue(prev, value)) return false;
      _state[key] = value;
      var detail = { key: key, value: value, prev: prev, state: Store.getState() };
      emit('store:' + key, detail);
      emit('store:change', detail);
      return true;
    },

    update: function (patch) {
      if (!patch || typeof patch !== 'object') return [];
      var changed = [];
      var keys = Object.keys(patch);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        var nextVal = patch[k];
        var prev = Object.prototype.hasOwnProperty.call(_state, k) ? _state[k] : undefined;
        if (!isSameValue(prev, nextVal)) {
          _state[k] = nextVal;
          changed.push({ key: k, value: nextVal, prev: prev });
        }
      }
      if (changed.length > 0) {
        var snapshot = Store.getState();
        for (var j = 0; j < changed.length; j++) {
          var item = changed[j];
          emit('store:' + item.key, { key: item.key, value: item.value, prev: item.prev, state: snapshot });
        }
        emit('store:change', { changed: changed, state: snapshot });
      }
      return changed;
    },

    getState: function () {
      var copy = {};
      var keys = Object.keys(_state);
      for (var i = 0; i < keys.length; i++) {
        copy[keys[i]] = _state[keys[i]];
      }
      return copy;
    },

    subscribe: function (keyOrHandler, handler, options) {
      if (typeof keyOrHandler === 'function') {
        var opts = (handler && typeof handler === 'object') ? handler : {};
        var unsubAll = on('store:change', keyOrHandler);
        if (opts.immediate) {
          try { keyOrHandler({ key: '*', value: Store.getState(), prev: null, state: Store.getState() }); } catch (e) { reportListenerError('RA.Store.subscribe', e); }
        }
        return unsubAll;
      }
      if (typeof keyOrHandler === 'string' && typeof handler === 'function') {
        var optsKey = (options && typeof options === 'object') ? options : {};
        var unsubKey = on('store:' + keyOrHandler, handler);
        if (optsKey.immediate && Object.prototype.hasOwnProperty.call(_state, keyOrHandler)) {
          try { handler({ key: keyOrHandler, value: _state[keyOrHandler], prev: undefined, state: Store.getState() }); } catch (e2) { reportListenerError('RA.Store.subscribe:' + keyOrHandler, e2); }
        }
        return unsubKey;
      }
      return function () {};
    },

    reset: function (initialState) {
      _state = Object.create(null);
      if (initialState && typeof initialState === 'object') {
        var keys = Object.keys(initialState);
        for (var i = 0; i < keys.length; i++) {
          _state[keys[i]] = initialState[keys[i]];
        }
      }
      emit('store:reset', { state: Store.getState() });
      emit('store:change', { key: '*', value: Store.getState(), prev: null, state: Store.getState() });
    }
  };

  // Preservar referencias previas si ya hubiese listeners registrados antes de cargar el módulo
  if (ra.events && typeof ra.events.emit === 'function') {
    ra.events.on = ra.events.on || events.on;
    ra.events.off = ra.events.off || events.off;
    ra.events.once = ra.events.once || events.once;
  } else {
    ra.events = events;
  }
  if (!ra.Store) {
    ra.Store = Store;
  }

  // Puente pasivo sin polling con orquestadores heredados cuando exista DOM
  function bridgeLegacySignals() {
    if (root.WorkflowOrchestrator && typeof root.WorkflowOrchestrator.on === 'function' && !root.WorkflowOrchestrator.__raEventsBridged) {
      root.WorkflowOrchestrator.__raEventsBridged = true;
      root.WorkflowOrchestrator.on('step_changed', function (data) {
        var step = data && data.step ? data.step : root.wpCurrentStep;
        if (typeof step === 'number') Store.set('step', step);
        ra.events.emit('step:changed', data || { step: step });
      });
    }
    if (root.ProjectHierarchy && typeof root.ProjectHierarchy.subscribe === 'function' && !root.ProjectHierarchy.__raEventsBridged) {
      root.ProjectHierarchy.__raEventsBridged = true;
      root.ProjectHierarchy.subscribe(function (evt) {
        ra.events.emit('scene:updated', evt || {});
      });
    }
    if (root.viewer && root.viewer.scene && !Store.get('viewerReady')) {
      Store.set('viewerReady', true);
      ra.events.emit('viewer:ready', root.viewer);
    }
  }

  if (typeof root.document !== 'undefined') {
    if (root.document.readyState === 'loading') {
      root.document.addEventListener('DOMContentLoaded', bridgeLegacySignals);
    } else {
      bridgeLegacySignals();
    }
    if (typeof root.addEventListener === 'function') {
      root.addEventListener('load', bridgeLegacySignals);
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { events: ra.events, Store: ra.Store };
  }
})(typeof window !== 'undefined' ? window : globalThis);
