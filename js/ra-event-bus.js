/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * RA — Bus de Eventos Canónico Tipado y Puente Reactivo (Fase 4 · F4-03)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Fuente única de verdad (SSOT) para eventos de dominio y UI de la plataforma.
 * Unifica ProjectHierarchy.notify, WorkflowOrchestrator.emit y CustomEvents DOM
 * ('ra-project-changed' / 'ra:project-updated') bajo constantes canónicas.
 */
(function (root) {
  'use strict';

  var EVENTS = Object.freeze({
    PROJECT_UPDATED: 'project:updated',
    STEP_CHANGED: 'step:changed',
    GEOMETRY_MUTATED: 'geometry:mutated',
    HARDWARE_CHANGED: 'hardware:changed',
    SIMULATION_UPDATED: 'simulation:updated',
    UI_REFRESHED: 'ui:refreshed',
    BILL_UPDATED: 'bill:updated',
    HIERARCHY_CHANGED: 'hierarchy:changed'
  });

  // Mapa de normalización de nombres legacy a eventos canónicos
  var LEGACY_ALIAS = Object.freeze({
    'ra-project-changed': EVENTS.PROJECT_UPDATED,
    'ra:project-updated': EVENTS.PROJECT_UPDATED,
    'ra:step-changed': EVENTS.STEP_CHANGED,
    'step_changed': EVENTS.STEP_CHANGED
  });

  var _listeners = new Map();
  var _bridgeInstalled = false;

  function _normalize(eventName) {
    return LEGACY_ALIAS[eventName] || eventName;
  }

  function on(eventName, handler) {
    if (typeof handler !== 'function') return function () {};
    var key = _normalize(eventName);
    if (!_listeners.has(key)) _listeners.set(key, new Set());
    _listeners.get(key).add(handler);
    return function unsubscribe() {
      off(key, handler);
    };
  }

  function once(eventName, handler) {
    if (typeof handler !== 'function') return function () {};
    var offFn = null;
    var wrapper = function (payload, meta) {
      if (offFn) offFn();
      handler(payload, meta);
    };
    offFn = on(eventName, wrapper);
    return offFn;
  }

  function off(eventName, handler) {
    var key = _normalize(eventName);
    var set = _listeners.get(key);
    if (set) set.delete(handler);
  }

  function emit(eventName, payload, opts) {
    var key = _normalize(eventName);
    var meta = { event: key, originalEvent: eventName, timestamp: Date.now() };
    var set = _listeners.get(key);
    if (set && set.size > 0) {
      set.forEach(function (fn) {
        try {
          fn(payload, meta);
        } catch (err) {
          if (root.RA && root.RA.log && typeof root.RA.log.error === 'function') {
            root.RA.log.error('[RA.EventBus] Error en listener de ' + key + ':', err);
          } else {
            console.error('[RA.EventBus] Error en listener de ' + key + ':', err);
          }
        }
      });
    }
    // Emitir también en wildcard '*' si hubiera telemetría/depuración suscrita
    var anySet = _listeners.get('*');
    if (anySet && anySet.size > 0) {
      anySet.forEach(function (fn) {
        try { fn(payload, meta); } catch (_) {}
      });
    }
    // Puente inverso hacia CustomEvent para consumidores externos solo si no vino del puente DOM
    if ((!opts || !opts.fromDom) && typeof root.dispatchEvent === 'function' && typeof root.CustomEvent === 'function') {
      if (key === EVENTS.PROJECT_UPDATED) {
        try { root.dispatchEvent(new root.CustomEvent('ra:project-updated', { detail: payload || null })); } catch (_) {}
      } else if (key === EVENTS.STEP_CHANGED) {
        try { root.dispatchEvent(new root.CustomEvent('ra:step-changed', { detail: payload || null })); } catch (_) {}
      }
    }
  }

  // Puente Strangler automático desde CustomEvent legacy ('ra-project-changed') hacia el bus canónico
  function installDomBridge() {
    if (_bridgeInstalled || typeof root.addEventListener !== 'function') return;
    _bridgeInstalled = true;
    root.addEventListener('ra-project-changed', function (ev) {
      emit(EVENTS.PROJECT_UPDATED, ev && ev.detail ? ev.detail : null, { fromDom: true });
    });
  }

  installDomBridge();

  var EventBus = Object.freeze({
    EVENTS: EVENTS,
    on: on,
    once: once,
    off: off,
    emit: emit,
    listenerCount: function (eventName) {
      var set = _listeners.get(_normalize(eventName));
      return set ? set.size : 0;
    }
  });

  root.RA = root.RA || {};
  root.RA.EventBus = EventBus;
  root.RA.Events = EVENTS;
  root.RAEventBus = EventBus;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
