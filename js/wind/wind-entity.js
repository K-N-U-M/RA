/**
 * ═══════════════════════════════════════════════════════════════════════
 * wind-entity.js — Objeto de dominio WindTurbineInstance
 *                  Gestión de la colección global windTurbines[]
 * ═══════════════════════════════════════════════════════════════════════
 * @version 1.0.0  2026-10-22
 */
(function (global) {
  'use strict';

  var RAWind = global.RAWind || (global.RAWind = {});

  // ── Colección global de turbinas activas en escena ─────────────────
  if (!Array.isArray(global.windTurbines)) {
    global.windTurbines = [];
  }

  // ── Generador de GUID simple ──────────────────────────────────────
  function generateId() {
    return 'wt_' + Math.random().toString(36).substr(2, 8) + '_' + Date.now().toString(36);
  }

  // ── Crear instancia nueva a partir de un WindTurbineCatalogItem ────
  function createInstance(catalogItem, options) {
    options = options || {};
    var hubHeight = (Array.isArray(catalogItem.hubHeightsAvailableM) && catalogItem.hubHeightsAvailableM.length > 0)
      ? catalogItem.hubHeightsAvailableM[Math.floor(catalogItem.hubHeightsAvailableM.length / 2)]
      : 18;

    return {
      id: generateId(),
      catalogId: catalogItem.id,
      name: options.name || (catalogItem.manufacturer + ' ' + catalogItem.model + ' #' + (global.windTurbines.length + 1)),
      positionCartographic: options.positionCartographic || {
        longitudeRad: 0,
        latitudeRad: 0,
        altitudeM: 0
      },
      mountingType: options.mountingType || 'ground',
      supportStructure: {
        type: options.structureType || 'tubular',
        hubHeightM: options.hubHeightM || hubHeight,
        baseFoundationId: null
      },
      orientationRad: options.orientationRad || 0,
      operationalState: {
        enabled: true,
        curtailmentRulesActive: false,
        liveTelemetryConnected: false
      },
      simulationResults: {
        aepNetKwh: 0,
        capacityFactor: 0,
        wakeLossPercentage: 0,
        rooftopSpeedupGainPercentage: 0,
        isDirty: true   // pendiente de calcular
      },
      // Snapshot del catálogo para referencia rápida en renderizado
      _catalog: {
        type: catalogItem.type || 'HAWT',
        ratedPowerW: catalogItem.ratedPowerW || 10000,
        rotorDiameterM: catalogItem.rotorDiameterM || 5.0,
        bladeCount: catalogItem.bladeCount || 3,
        acousticPowerLwaDba: catalogItem.acousticPowerLwaDba || 100,
        powerCurve: catalogItem.powerCurve || []
      }
    };
  }

  // ── Añadir turbina a la escena ────────────────────────────────────
  function addToScene(turbineInstance) {
    if (!turbineInstance || !turbineInstance.id) return;
    global.windTurbines.push(turbineInstance);
    _emitChange('wind_turbine_added', turbineInstance);
  }

  // ── Actualizar posición (llamado desde el Gizmo en tiempo real) ───
  function updatePosition(id, longitudeRad, latitudeRad, altitudeM) {
    var t = getById(id);
    if (!t) return;
    t.positionCartographic.longitudeRad = longitudeRad;
    t.positionCartographic.latitudeRad = latitudeRad;
    t.positionCartographic.altitudeM = altitudeM;
    t.simulationResults.isDirty = true;
    // Nota: NO emitimos change en cada frame (MOUSE_MOVE) para no saturar.
    // El llamador emite el evento solo en dragEnd.
  }

  // ── Actualizar propiedad de configuración ─────────────────────────
  function updateProp(id, key, value) {
    var t = getById(id);
    if (!t) return;
    if (key === 'hubHeightM') {
      t.supportStructure.hubHeightM = value;
    } else if (key === 'orientationRad') {
      t.orientationRad = value;
    } else if (key === 'mountingType') {
      t.mountingType = value;
    } else if (key === 'enabled') {
      t.operationalState.enabled = value;
    } else if (key === 'name') {
      t.name = value;
    }
    t.simulationResults.isDirty = true;
    _emitChange('wind_turbine_modified', t);
  }

  // ── Eliminar turbina ─────────────────────────────────────────────
  function removeFromScene(id) {
    var idx = global.windTurbines.findIndex(function (t) { return t.id === id; });
    if (idx < 0) return;
    var removed = global.windTurbines.splice(idx, 1)[0];
    _emitChange('wind_turbine_removed', removed);
  }

  // ── Buscar por id ────────────────────────────────────────────────
  function getById(id) {
    return global.windTurbines.find(function (t) { return t.id === id; }) || null;
  }

  // ── Turbinas habilitadas (para guards del FSM) ────────────────────
  function getEnabled() {
    return global.windTurbines.filter(function (t) {
      return t && t.operationalState && t.operationalState.enabled !== false;
    });
  }

  // ── Validación: distancia mínima entre rotores (3D mínimo) ────────
  function checkRotorClearance(newInstance) {
    var MIN_DIAMETERS = 3.0;
    var issues = [];
    var newD = newInstance._catalog ? newInstance._catalog.rotorDiameterM : 5.0;
    var newLon = newInstance.positionCartographic.longitudeRad;
    var newLat = newInstance.positionCartographic.latitudeRad;

    global.windTurbines.forEach(function (t) {
      if (t.id === newInstance.id) return;
      var tD = t._catalog ? t._catalog.rotorDiameterM : 5.0;
      var minDist = MIN_DIAMETERS * Math.max(newD, tD);
      var dLon = (newLon - t.positionCartographic.longitudeRad) * 6371000;
      var dLat = (newLat - t.positionCartographic.latitudeRad) * 6371000;
      var dist = Math.sqrt(dLon * dLon + dLat * dLat);
      if (dist < minDist) {
        issues.push({
          otherId: t.id,
          otherName: t.name,
          distanceM: Math.round(dist),
          requiredM: Math.round(minDist)
        });
      }
    });
    return issues;
  }

  // ── Validación: radio de caída libre (1.1 × H_punta) ────────────
  function getFallRadius(turbineInstance) {
    var catalogItem = turbineInstance._catalog || {};
    var hubHeight = turbineInstance.supportStructure ? turbineInstance.supportStructure.hubHeightM : 18;
    var rotorRadius = catalogItem.rotorDiameterM ? catalogItem.rotorDiameterM / 2 : 3;
    var tipHeight = hubHeight + rotorRadius;
    return tipHeight * 1.1;
  }

  // ── Bus de eventos (notifica al visualizador y la UI) ─────────────
  function _emitChange(eventType, data) {
    // Invalidar caché de simulación eólica en el HUD si existe
    if (global.RAWindUI && typeof global.RAWindUI.onTurbinesChanged === 'function') {
      global.RAWindUI.onTurbinesChanged(eventType, data);
    }
    // Notificar al visualizador 3D
    if (global.RAWindVisualizer && typeof global.RAWindVisualizer.onTurbinesChanged === 'function') {
      global.RAWindVisualizer.onTurbinesChanged(eventType, data);
    }
    // Invalidar heatmap solar si existe (las sombras de la turbina afectan a los paneles)
    if (typeof global.wpInvalidateHeatmap === 'function') {
      global.wpInvalidateHeatmap('Aerogenerador modificado');
    }
    // Actualizar guards del orquestador
    if (global.WorkflowOrchestrator && typeof global.WorkflowOrchestrator.refreshGating === 'function') {
      global.WorkflowOrchestrator.refreshGating();
    }
  }

  // ── Serialización para .raproject (sin refs GPU/DOM) ─────────────
  function serializeAll() {
    return global.windTurbines.map(function (t) {
      return {
        id: t.id,
        catalogId: t.catalogId,
        name: t.name,
        positionCartographic: {
          longitudeRad: t.positionCartographic.longitudeRad,
          latitudeRad: t.positionCartographic.latitudeRad,
          altitudeM: t.positionCartographic.altitudeM
        },
        mountingType: t.mountingType,
        supportStructure: {
          type: t.supportStructure.type,
          hubHeightM: t.supportStructure.hubHeightM,
          baseFoundationId: t.supportStructure.baseFoundationId || null
        },
        orientationRad: t.orientationRad,
        operationalState: {
          enabled: t.operationalState.enabled,
          curtailmentRulesActive: t.operationalState.curtailmentRulesActive,
          liveTelemetryConnected: false
        }
        // _catalog y simulationResults se reconstituyen al cargar
      };
    });
  }

  // ── Deserialización (al cargar .raproject) ────────────────────────
  function deserializeAll(dataArray) {
    if (!Array.isArray(dataArray)) return;
    global.windTurbines = [];
    dataArray.forEach(function (d) {
      if (!d || !d.id) return;
      // Reconstituir _catalog desde RAWindCatalog si está disponible
      var catalogItem = null;
      if (global.RAWindCatalog && d.catalogId) {
        catalogItem = global.RAWindCatalog.getById(d.catalogId);
      }
      var inst = {
        id: d.id,
        catalogId: d.catalogId || null,
        name: d.name || 'Aerogenerador',
        positionCartographic: d.positionCartographic || { longitudeRad: 0, latitudeRad: 0, altitudeM: 0 },
        mountingType: d.mountingType || 'ground',
        supportStructure: d.supportStructure || { type: 'tubular', hubHeightM: 18, baseFoundationId: null },
        orientationRad: d.orientationRad || 0,
        operationalState: d.operationalState || { enabled: true, curtailmentRulesActive: false, liveTelemetryConnected: false },
        simulationResults: { aepNetKwh: 0, capacityFactor: 0, wakeLossPercentage: 0, rooftopSpeedupGainPercentage: 0, isDirty: true },
        _catalog: catalogItem ? {
          type: catalogItem.type,
          ratedPowerW: catalogItem.ratedPowerW,
          rotorDiameterM: catalogItem.rotorDiameterM,
          bladeCount: catalogItem.bladeCount,
          acousticPowerLwaDba: catalogItem.acousticPowerLwaDba,
          powerCurve: catalogItem.powerCurve || []
        } : { type: 'HAWT', ratedPowerW: 10000, rotorDiameterM: 5.0, bladeCount: 3, acousticPowerLwaDba: 100, powerCurve: [] }
      };
      global.windTurbines.push(inst);
    });
  }

  // ── Migración legada: obstáculo tipo wind_turbine → WindTurbineInstance
  function migrateLegacyObstacles() {
    if (!Array.isArray(global.obstacles)) return;
    var toMigrate = global.obstacles.filter(function (o) {
      return o && o.type === 'wind_turbine' && !o._migratedToWindTurbine;
    });
    if (!toMigrate.length) return;
    toMigrate.forEach(function (obs) {
      // Crear instancia mínima a partir del obstáculo legado
      var inst = {
        id: generateId(),
        catalogId: null,
        name: obs.name || 'Aerogenerador (migrado)',
        positionCartographic: obs._position
          ? { longitudeRad: obs._position.longitude || 0, latitudeRad: obs._position.latitude || 0, altitudeM: obs._position.height || 0 }
          : { longitudeRad: 0, latitudeRad: 0, altitudeM: 0 },
        mountingType: 'ground',
        supportStructure: { type: 'tubular', hubHeightM: obs.mastHeight || 8, baseFoundationId: null },
        orientationRad: 0,
        operationalState: { enabled: true, curtailmentRulesActive: false, liveTelemetryConnected: false },
        simulationResults: { aepNetKwh: 0, capacityFactor: 0, wakeLossPercentage: 0, rooftopSpeedupGainPercentage: 0, isDirty: true },
        _catalog: { type: obs.turbineType === 'vawt' ? 'VAWT' : 'HAWT', ratedPowerW: 10000, rotorDiameterM: (obs.bladeRadius || 2.5) * 2, bladeCount: 3, acousticPowerLwaDba: 100, powerCurve: [] }
      };
      global.windTurbines.push(inst);
      obs._migratedToWindTurbine = true;
    });
  }

  // ── API pública ────────────────────────────────────────────────────
  RAWind.Entity = {
    createInstance: createInstance,
    addToScene: addToScene,
    updatePosition: updatePosition,
    updateProp: updateProp,
    removeFromScene: removeFromScene,
    getById: getById,
    getEnabled: getEnabled,
    checkRotorClearance: checkRotorClearance,
    getFallRadius: getFallRadius,
    serializeAll: serializeAll,
    deserializeAll: deserializeAll,
    migrateLegacyObstacles: migrateLegacyObstacles,
    emitChange: _emitChange
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = RAWind.Entity;
  }

})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : global));
