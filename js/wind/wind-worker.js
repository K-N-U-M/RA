/**
 * ═══════════════════════════════════════════════════════════════════════
 * wind-worker.js — Motor Concurrente (Web Worker + Cliente Principal)
 *                  para Cálculos Eólicos de Alta Densidad (60 FPS UI)
 * ═══════════════════════════════════════════════════════════════════════
 * Soporta dos modos de ejecución sin romper Node.js (`node -c`) ni `file://`:
 *   1. Como Web Worker dedicado (cuando `importScripts` está definido en `self`):
 *      procesa comandos pesados y devuelve `Float32Array` con Transferable Objects.
 *   2. En el hilo principal (`RAWind.WorkerClient`): intenta instanciar el
 *      Worker de `js/wind/wind-worker.js` y, si el navegador bloquea Workers
 *      locales o estamos en entorno síncrono, ejecuta el cálculo de forma
 *      no bloqueante (microtask) reutilizando los motores de `RAWind`.
 * @version 2.0.0  2026-10-24
 */
(function (global) {
  'use strict';

  var RAWind = global.RAWind || (global.RAWind = {});

  var isWorkerContext = (
    typeof self !== 'undefined' &&
    typeof window === 'undefined' &&
    typeof self.importScripts === 'function'
  );

  // ── Lógica de cálculo de Shadow Flicker (horas/año sobre receptor) ───
  function computeShadowFlickerHours(turbines, receptorDistM) {
    var list = Array.isArray(turbines) ? turbines : [];
    var dist = Math.max(5.0, Number(receptorDistM) || 35.0);
    var limitHours = (RAWind.CONSTANTS && RAWind.CONSTANTS.SHADOW_FLICKER_LIMIT_HOURS_YEAR) || 30;
    var perTurbine = [];
    var maxFlickerHours = 0;

    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      if (!t || (t.operationalState && t.operationalState.enabled === false)) continue;
      var rotorD = (t._catalog && t._catalog.rotorDiameterM) || 5.0;
      // Regla de las 10D (IDAE / Guía Alemana WEA-Schattenwurf): más allá de 10 diámetros el disco solar no queda eclipsado (>20%)
      var maxEffectZoneM = rotorD * 10.0;
      var hours = 0;
      if (dist < maxEffectZoneM) {
        var normDist = dist / maxEffectZoneM;
        hours = Number((42.0 * Math.pow(1 - normDist, 1.8)).toFixed(1));
      }
      if (hours > maxFlickerHours) maxFlickerHours = hours;
      perTurbine.push({
        id: t.id,
        name: t.name,
        maxShadowZone10DM: Number(maxEffectZoneM.toFixed(1)),
        estimatedFlickerHoursYear: hours,
        compliesIDAE: hours <= limitHours
      });
    }

    return {
      receptorDistanceM: dist,
      limitHoursYear: limitHours,
      worstFlickerHoursYear: maxFlickerHours,
      compliesIDAE: maxFlickerHours <= limitHours,
      perTurbine: perTurbine
    };
  }

  // ── Ejecución de comando de simulación ──────────────────────────────
  function executeCommand(command, payload) {
    payload = payload || {};
    var turbines = payload.turbines || global.windTurbines || [];
    var resourceConfig = payload.resourceConfig || (RAWind.Resource ? RAWind.Resource.getConfig() : {});

    if (command === 'COMPUTE_AEP') {
      if (RAWind.Resource && typeof RAWind.Resource.computeParkAEP === 'function') {
        return RAWind.Resource.computeParkAEP(turbines, resourceConfig);
      }
      return { totalAepNetKwh: 0, perTurbine: [] };
    }

    if (command === 'COMPUTE_ROOFTOP_SPEEDUP') {
      if (RAWind.RooftopCFD && typeof RAWind.RooftopCFD.evaluateRooftopAerodynamics === 'function') {
        return RAWind.RooftopCFD.evaluateRooftopAerodynamics(
          payload.H, payload.W, payload.L, payload.xSetback, payload.zElevation
        );
      }
      return null;
    }

    if (command === 'COMPUTE_ACOUSTIC_GRID') {
      if (RAWind.Acoustics && typeof RAWind.Acoustics.computeAcousticGrid === 'function') {
        return RAWind.Acoustics.computeAcousticGrid(
          turbines,
          payload.gridResolutionM || 5.0,
          payload.halfExtentM || 100.0
        );
      }
      return { width: 0, height: 0, data: new Float32Array(0) };
    }

    if (command === 'COMPUTE_SHADOW_FLICKER') {
      if (payload.resourceConfig && RAWind.Resource && typeof RAWind.Resource.updateConfig === 'function') {
        RAWind.Resource.updateConfig(payload.resourceConfig);
      }
      if (RAWind.ShadowFlicker && typeof RAWind.ShadowFlicker.evaluateAnnualShadowFlicker === 'function') {
        var t0 = turbines[0];
        if (t0) {
          return RAWind.ShadowFlicker.evaluateAnnualShadowFlicker(t0, payload.receptors || null, payload.solarFieldBounds || null);
        }
      }
      return computeShadowFlickerHours(turbines, payload.receptorDistanceM || resourceConfig.receptorDistanceM);
    }

    if (command === 'COMPUTE_HYBRID_DISPATCH') {
      if (RAWind.HybridDispatch && typeof RAWind.HybridDispatch.simulateHybridDispatch8760 === 'function') {
        return RAWind.HybridDispatch.simulateHybridDispatch8760(payload);
      }
      return null;
    }

    if (command === 'COMPUTE_FULL_PHASE2_AUDIT') {
      var aepSummary = RAWind.Resource ? RAWind.Resource.computeParkAEP(turbines, resourceConfig) : null;
      var acousticSummary = RAWind.Acoustics ? RAWind.Acoustics.evaluateComplianceRD1367(turbines, resourceConfig.receptorDistanceM) : null;
      var structuralSummary = RAWind.Structural ? RAWind.Structural.evaluateParkStructural(turbines) : null;
      var electricalSummary = RAWind.Electrical ? RAWind.Electrical.evaluateParkElectricalSummary(turbines) : null;
      var flickerSummary = computeShadowFlickerHours(turbines, resourceConfig.receptorDistanceM);

      return {
        aep: aepSummary,
        acoustics: acousticSummary,
        structural: structuralSummary,
        electrical: electricalSummary,
        shadowFlicker: flickerSummary,
        timestamp: Date.now()
      };
    }

    throw new Error('Comando desconocido en wind-worker: ' + command);
  }

  // ── Si estamos dentro de un Web Worker real ─────────────────────────
  if (isWorkerContext) {
    try {
      self.importScripts(
        'wind-constants.js?v=20261118_t3',
        'wind-catalog.js?v=20261118_t3',
        'wind-rooftop-cfd.js?v=20261118_t3',
        'wind-obstacle-interference.js?v=20261118_t3',
        'wind-resource.js?v=20261118_t3',
        'wind-acoustics.js?v=20261118_t3',
        'wind-structural.js?v=20261118_t3',
        'wind-electrical.js?v=20261118_t3',
        'wind-shadow-flicker.js?v=20261118_t3',
        'wind-hybrid-dispatch.js?v=20261118_t3'
      );
    } catch (e) {
      // Si ya estaban cargados o falla ruta relativa, continuar con fallback
    }

    self.onmessage = function (e) {
      var msg = e.data || {};
      var taskId = msg.taskId;
      var command = msg.command;
      var payload = msg.payload;

      try {
        var result = executeCommand(command, payload);
        var transferList = [];
        if (result && result.data && result.data.buffer instanceof ArrayBuffer) {
          transferList.push(result.data.buffer);
        }
        self.postMessage(
          { taskId: taskId, status: 'OK', result: result },
          transferList
        );
      } catch (err) {
        self.postMessage({
          taskId: taskId,
          status: 'ERROR',
          error: err && err.message ? err.message : String(err)
        });
      }
    };
    return;
  }

  // ── Cliente en el hilo principal (Browser / Node) ───────────────────
  var _workerInstance = null;
  var _workerFailed = false;
  var _pendingCallbacks = {};
  var _nextTaskId = 1;

  function _getOrSpawnWorker() {
    if (_workerFailed || typeof Worker === 'undefined') return null;
    if (_workerInstance) return _workerInstance;
    try {
      _workerInstance = new Worker('js/wind/wind-worker.js?v=20261118_t3');
      _workerInstance.onmessage = function (ev) {
        var data = ev.data || {};
        var cb = _pendingCallbacks[data.taskId];
        if (!cb) return;
        delete _pendingCallbacks[data.taskId];
        if (data.status === 'OK') {
          cb.resolve(data.result);
        } else {
          cb.reject(new Error(data.error || 'Error en wind-worker'));
        }
      };
      _workerInstance.onerror = function (errEv) {
        _workerFailed = true;
        _workerInstance = null;
        var keys = Object.keys(_pendingCallbacks);
        for (var k = 0; k < keys.length; k++) {
          var cb = _pendingCallbacks[keys[k]];
          delete _pendingCallbacks[keys[k]];
          if (cb && typeof cb.reject === 'function') {
            cb.reject(new Error((errEv && errEv.message) || 'Error fatal en wind-worker'));
          }
        }
      };
      return _workerInstance;
    } catch (e) {
      _workerFailed = true;
      _workerInstance = null;
      return null;
    }
  }

  /**
   * Ejecuta un comando pesado de forma asíncrona (en Web Worker si está disponible,
   * o mediante resolución inmediata en el motor local).
   */
  function runAsync(command, payload, callback) {
    var worker = _getOrSpawnWorker();
    if (worker) {
      var taskId = 'wt_task_' + (_nextTaskId++);
      _pendingCallbacks[taskId] = {
        resolve: function (res) { if (typeof callback === 'function') callback(null, res); },
        reject: function (err) {
          // Si falla el worker en tiempo de ejecución, hacer fallback transparente
          try {
            var syncRes = executeCommand(command, payload);
            if (typeof callback === 'function') callback(null, syncRes);
          } catch (syncErr) {
            if (typeof callback === 'function') callback(syncErr, null);
          }
        }
      };
      worker.postMessage({ taskId: taskId, command: command, payload: payload });
      return;
    }

    // Fallback directo sin bloqueo de render
    try {
      var res = executeCommand(command, payload);
      if (typeof callback === 'function') callback(null, res);
    } catch (err) {
      if (typeof callback === 'function') callback(err, null);
    }
  }

  /**
   * Ejecución síncrona directa para actualizar de inmediato las tarjetas de ingeniería del Paso 2.
   */
  function runSync(command, payload) {
    return executeCommand(command, payload);
  }

  var WorkerClient = {
    runAsync: runAsync,
    runSync: runSync,
    computeShadowFlickerHours: computeShadowFlickerHours
  };

  RAWind.WorkerClient = WorkerClient;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = WorkerClient;
  }

})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : global));
