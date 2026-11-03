/**
 * ═══════════════════════════════════════════════════════════════════════
 * wind-entity.js — Objeto de dominio WindTurbineInstance
 *                  Gestión de la colección global windTurbines[]
 * ═══════════════════════════════════════════════════════════════════════
 * @version 2.0.0  2026-10-24
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

    var defaultYawRad = 0;
    if (options.orientationRad !== undefined) {
      defaultYawRad = Number(options.orientationRad) || 0;
    } else if (RAWind.Resource && typeof RAWind.Resource.getConfig === 'function') {
      var rCfg = RAWind.Resource.getConfig();
      if (rCfg && rCfg.autoYawToWind !== false && typeof rCfg.prevailingWindDirDeg === 'number') {
        defaultYawRad = (rCfg.prevailingWindDirDeg * Math.PI) / 180.0;
      }
    }

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
      orientationRad: defaultYawRad,
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
      // Snapshot completo del catálogo para referencia rápida en renderizado y motores Fase 2
      _catalog: {
        id: catalogItem.id || null,
        manufacturer: catalogItem.manufacturer || 'Fabricante',
        model: catalogItem.model || 'Modelo',
        type: catalogItem.type || 'HAWT',
        ratedPowerW: catalogItem.ratedPowerW || 10000,
        rotorDiameterM: catalogItem.rotorDiameterM || 5.0,
        bladeCount: catalogItem.bladeCount || 3,
        hubHeightsAvailableM: catalogItem.hubHeightsAvailableM || [12, 18, 24],
        cutInSpeedMs: catalogItem.cutInSpeedMs || 2.5,
        ratedSpeedMs: catalogItem.ratedSpeedMs || 11.0,
        cutOutSpeedMs: catalogItem.cutOutSpeedMs || 25.0,
        survivalSpeedMs: catalogItem.survivalSpeedMs || 59.5,
        iecClass: catalogItem.iecClass || 'III',
        acousticPowerLwaDba: catalogItem.acousticPowerLwaDba || 100,
        electrical: catalogItem.electrical || null,
        structural: catalogItem.structural || null,
        priceEur: catalogItem.priceEur || 20000,
        powerCurve: catalogItem.powerCurve || [],
        cpAudit: catalogItem.cpAudit || (global.RAWindCatalog && typeof global.RAWindCatalog.validatePowerCurve === 'function' ? global.RAWindCatalog.validatePowerCurve(catalogItem) : null)
      }
    };
  }

  // ── Añadir turbina a la escena ────────────────────────────────────
  function addToScene(turbineInstance) {
    if (!turbineInstance || !turbineInstance.id) return;
    // Si la curva viola Betz o carece de curva válida, auto-calibrar para garantizar viabilidad física
    if (turbineInstance._catalog) {
      var audit = turbineInstance._catalog.cpAudit;
      if (!audit || !audit.valid) {
        if (global.RAWindCatalog && typeof global.RAWindCatalog.calibratePowerCurveToBetz === 'function') {
          global.RAWindCatalog.calibratePowerCurveToBetz(turbineInstance._catalog, 0.42);
        }
      }
    }
    global.windTurbines.push(turbineInstance);
    recalculateAllEngineering();
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
      t.supportStructure.hubHeightM = Number(value) || 18;
    } else if (key === 'orientationRad') {
      t.orientationRad = Number(value) || 0;
    } else if (key === 'mountingType') {
      t.mountingType = value;
    } else if (key === 'enabled') {
      t.operationalState.enabled = !!value;
    } else if (key === 'curtailmentRulesActive') {
      t.operationalState.curtailmentRulesActive = !!value;
    } else if (key === 'name') {
      t.name = value;
    }
    t.simulationResults.isDirty = true;
    recalculateAllEngineering();
    _emitChange('wind_turbine_modified', t);
  }

  // ── Eliminar turbina ─────────────────────────────────────────────
  function removeFromScene(id) {
    var idx = global.windTurbines.findIndex(function (t) { return t.id === id; });
    if (idx < 0) return;
    var removed = global.windTurbines.splice(idx, 1)[0];
    recalculateAllEngineering();
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
      var dLon = (newLon - t.positionCartographic.longitudeRad) * 6371000 * Math.cos(newLat || 0.7);
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
    return Number((tipHeight * 1.1).toFixed(1));
  }

  // ── Recalcular todos los motores de Ingeniería (Fase 2) ──────────
  function recalculateAllEngineering() {
    var list = global.windTurbines || [];
    if (RAWind.Resource && typeof RAWind.Resource.computeParkAEP === 'function') {
      RAWind.Resource.computeParkAEP(list);
    }
    if (RAWind.Acoustics && typeof RAWind.Acoustics.evaluateComplianceRD1367 === 'function') {
      RAWind.Acoustics.evaluateComplianceRD1367(list);
    }
    if (RAWind.Structural && typeof RAWind.Structural.evaluateParkStructural === 'function') {
      RAWind.Structural.evaluateParkStructural(list);
    }
    if (RAWind.Electrical && typeof RAWind.Electrical.evaluateParkElectricalSummary === 'function') {
      RAWind.Electrical.evaluateParkElectricalSummary(list);
    }
    if (typeof global.raUpdateEnergyHUD === 'function') {
      global.raUpdateEnergyHUD();
    }
    if (global.RAProjectStatusHUD && typeof global.RAProjectStatusHUD.update === 'function') {
      global.RAProjectStatusHUD.update();
    }
  }

  // ── Bus de eventos (notifica al visualizador y la UI) ─────────────
  function _emitChange(eventType, data) {
    // Invalidar caché de simulación eólica en el HUD si existe
    if (global.RAWindUI && typeof global.RAWindUI.onTurbinesChanged === 'function') {
      global.RAWindUI.onTurbinesChanged(eventType, data);
    }
    // Actualizar HUDs híbridos (píldora central y HUD de estado superior derecho)
    if (typeof global.raUpdateEnergyHUD === 'function') {
      global.raUpdateEnergyHUD();
    }
    if (global.RAProjectStatusHUD && typeof global.RAProjectStatusHUD.update === 'function') {
      global.RAProjectStatusHUD.update();
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
    // Invalidar caché financiera y sincronizar badge de precios del Paso 5
    if (global.wpUpdateStep5PricingBadge && typeof global.wpUpdateStep5PricingBadge === 'function') {
      global.wpUpdateStep5PricingBadge();
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
          id: catalogItem.id,
          manufacturer: catalogItem.manufacturer,
          model: catalogItem.model,
          type: catalogItem.type,
          ratedPowerW: catalogItem.ratedPowerW,
          rotorDiameterM: catalogItem.rotorDiameterM,
          bladeCount: catalogItem.bladeCount,
          hubHeightsAvailableM: catalogItem.hubHeightsAvailableM || [12, 18, 24],
          cutInSpeedMs: catalogItem.cutInSpeedMs || 2.5,
          ratedSpeedMs: catalogItem.ratedSpeedMs || 11.0,
          cutOutSpeedMs: catalogItem.cutOutSpeedMs || 25.0,
          survivalSpeedMs: catalogItem.survivalSpeedMs || 59.5,
          iecClass: catalogItem.iecClass || 'III',
          acousticPowerLwaDba: catalogItem.acousticPowerLwaDba,
          electrical: catalogItem.electrical || null,
          structural: catalogItem.structural || null,
          priceEur: catalogItem.priceEur || 20000,
          powerCurve: catalogItem.powerCurve || [],
          cpAudit: catalogItem.cpAudit || (global.RAWindCatalog && typeof global.RAWindCatalog.validatePowerCurve === 'function' ? global.RAWindCatalog.validatePowerCurve(catalogItem) : null)
        } : { type: 'HAWT', ratedPowerW: 10000, rotorDiameterM: 5.0, bladeCount: 3, hubHeightsAvailableM: [12, 18, 24], acousticPowerLwaDba: 100, powerCurve: [] }
      };
      global.windTurbines.push(inst);
    });
    recalculateAllEngineering();
  }

  // ── Migración legada: obstáculo tipo wind_turbine → WindTurbineInstance
  function migrateLegacyObstacles() {
    if (!Array.isArray(global.obstacles)) return;
    var toMigrate = global.obstacles.filter(function (o) {
      return o && o.type === 'wind_turbine' && !o._migratedToWindTurbine;
    });
    if (!toMigrate.length) return;
    toMigrate.forEach(function (obs) {
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
        _catalog: { type: obs.turbineType === 'vawt' ? 'VAWT' : 'HAWT', ratedPowerW: 10000, rotorDiameterM: (obs.bladeRadius || 2.5) * 2, bladeCount: 3, hubHeightsAvailableM: [8, 12, 18], acousticPowerLwaDba: 100, powerCurve: [] }
      };
      global.windTurbines.push(inst);
      obs._migratedToWindTurbine = true;
    });
    recalculateAllEngineering();
  }

  // ── Auto-orientar góndolas al viento dominante ───────────────────
  function orientAllToPrevailingWind(windDirDeg) {
    var rCfg = (RAWind.Resource && typeof RAWind.Resource.getConfig === 'function')
      ? RAWind.Resource.getConfig()
      : null;
    var targetDeg = (typeof windDirDeg === 'number' && !isNaN(windDirDeg))
      ? windDirDeg
      : ((rCfg && typeof rCfg.prevailingWindDirDeg === 'number') ? rCfg.prevailingWindDirDeg : 270);
    var targetRad = (((targetDeg % 360) + 360) % 360) * Math.PI / 180.0;

    (global.windTurbines || []).forEach(function (t) {
      if (!t) return;
      t.orientationRad = targetRad;
    });

    if (global.RAWindVisualizer && typeof global.RAWindVisualizer.renderAll === 'function') {
      global.RAWindVisualizer.renderAll();
    }
    if (global.RAWindUI && typeof global.RAWindUI.renderStep2Panel === 'function') {
      global.RAWindUI.renderStep2Panel();
    }
    return targetDeg;
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
    recalculateAllEngineering: recalculateAllEngineering,
    orientAllToPrevailingWind: orientAllToPrevailingWind,
    serializeAll: serializeAll,
    deserializeAll: deserializeAll,
    migrateLegacyObstacles: migrateLegacyObstacles,
    emitChange: _emitChange
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = RAWind.Entity;
  }

})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : global));
