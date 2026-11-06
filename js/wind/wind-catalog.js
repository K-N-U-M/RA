/**
 * ═══════════════════════════════════════════════════════════════════════
 * wind-catalog.js — Catálogo de Aerogeneradores RA-Wind
 * ═══════════════════════════════════════════════════════════════════════
 * Integración con el modal de catálogo existente (ra-equipment-catalog-modal).
 * Añade la pestaña 💨 AEROGENERADORES con:
 *   - Turbinas españolas por defecto (Bornay, Enair, Kliux)
 *   - Importación IA desde datasheets PDF (reutiliza RAEquipmentAIImporter)
 *   - Búsqueda activa en web con IA (reutiliza RAEquipmentWebSearch)
 *   - Alta manual de turbinas personalizadas
 *   - Persistencia en localStorage (clave 'ra_wind_catalog_v1')
 * @version 1.0.0  2026-10-22
 */
(function (global) {
  'use strict';

  // ── Turbinas españolas por defecto ────────────────────────────────────
  var DEFAULT_TURBINES = [
    {
      id: 'bornay-wind-25.3',
      manufacturer: 'Bornay Aerogeneradores',
      model: 'Wind 25.3',
      type: 'HAWT',
      ratedPowerW: 25000,
      rotorDiameterM: 9.8,
      bladeLength: 4.9,
      bladeHeightM: 9.8,
      bladeCount: 3,
      hubHeightsAvailableM: [12, 18, 24, 30],
      cutInSpeedMs: 2.5,
      ratedSpeedMs: 11.0,
      cutOutSpeedMs: 25.0,
      survivalSpeedMs: 59.5,
      iecClass: 'III',
      acousticPowerLwaDba: 101,
      electrical: {
        generatorType: 'PMSG',
        outputVoltageV: 400,
        rectifierIncluded: true,
        dumpLoadRequiredKw: 30
      },
      structural: {
        nacelleMassKg: 280,
        rotorMassKg: 95,
        maxThrustKn: 18,
        naturalFrequencyHz: 0.8
      },
      priceEur: 28000,
      powerCurve: [
        {v:2,p:0,ct:0},{v:3,p:350,ct:0.40},{v:4,p:1000,ct:0.42},
        {v:5,p:2200,ct:0.44},{v:6,p:4000,ct:0.45},{v:7,p:6500,ct:0.44},
        {v:8,p:9800,ct:0.43},{v:9,p:14000,ct:0.41},{v:10,p:19000,ct:0.38},
        {v:11,p:24000,ct:0.35},{v:12,p:25000,ct:0.32},{v:25,p:25000,ct:0.20}
      ]
    },
    {
      id: 'bornay-wind-6',
      manufacturer: 'Bornay Aerogeneradores',
      model: 'Wind 6',
      type: 'HAWT',
      ratedPowerW: 6000,
      rotorDiameterM: 5.2,
      bladeLength: 2.6,
      bladeHeightM: 5.2,
      bladeCount: 3,
      hubHeightsAvailableM: [6, 9, 12, 18],
      cutInSpeedMs: 2.5,
      ratedSpeedMs: 12.0,
      cutOutSpeedMs: 25.0,
      survivalSpeedMs: 52.5,
      iecClass: 'III',
      acousticPowerLwaDba: 96,
      electrical: {
        generatorType: 'PMSG',
        outputVoltageV: 48,
        rectifierIncluded: true,
        dumpLoadRequiredKw: 7.2
      },
      structural: {
        nacelleMassKg: 60,
        rotorMassKg: 22,
        maxThrustKn: 4.5,
        naturalFrequencyHz: 1.8
      },
      priceEur: 9500,
      powerCurve: [
        {v:2,p:0,ct:0},{v:3,p:90,ct:0.38},{v:4,p:260,ct:0.40},
        {v:5,p:580,ct:0.43},{v:6,p:1100,ct:0.44},{v:7,p:1800,ct:0.44},
        {v:8,p:2700,ct:0.43},{v:9,p:3800,ct:0.41},{v:10,p:5000,ct:0.38},
        {v:11,p:5800,ct:0.35},{v:12,p:6000,ct:0.32},{v:25,p:6000,ct:0.20}
      ]
    },
    {
      id: 'enair-30l',
      manufacturer: 'Enair Energy',
      model: 'Enair 30L',
      type: 'HAWT',
      ratedPowerW: 30000,
      rotorDiameterM: 10.5,
      bladeLength: 5.25,
      bladeHeightM: 10.5,
      bladeCount: 3,
      hubHeightsAvailableM: [18, 24, 30, 36],
      cutInSpeedMs: 2.0,
      ratedSpeedMs: 10.0,
      cutOutSpeedMs: 25.0,
      survivalSpeedMs: 70.0,
      iecClass: 'II',
      acousticPowerLwaDba: 102,
      electrical: {
        generatorType: 'PMSG',
        outputVoltageV: 400,
        rectifierIncluded: true,
        dumpLoadRequiredKw: 36
      },
      structural: {
        nacelleMassKg: 350,
        rotorMassKg: 130,
        maxThrustKn: 28,
        naturalFrequencyHz: 0.6
      },
      priceEur: 42000,
      powerCurve: [
        {v:2,p:0,ct:0},{v:3,p:400,ct:0.42},{v:4,p:1100,ct:0.44},
        {v:5,p:2500,ct:0.46},{v:6,p:4600,ct:0.46},{v:7,p:7500,ct:0.45},
        {v:8,p:11200,ct:0.43},{v:9,p:15800,ct:0.40},{v:10,p:21500,ct:0.37},
        {v:11,p:28000,ct:0.34},{v:12,p:30000,ct:0.31},{v:25,p:30000,ct:0.19}
      ]
    },
    {
      id: 'enair-10l',
      manufacturer: 'Enair Energy',
      model: 'Enair 10L',
      type: 'HAWT',
      ratedPowerW: 10000,
      rotorDiameterM: 6.8,
      bladeLength: 3.4,
      bladeHeightM: 6.8,
      bladeCount: 3,
      hubHeightsAvailableM: [12, 18, 24],
      cutInSpeedMs: 2.0,
      ratedSpeedMs: 10.5,
      cutOutSpeedMs: 25.0,
      survivalSpeedMs: 65.0,
      iecClass: 'III',
      acousticPowerLwaDba: 98,
      electrical: {
        generatorType: 'PMSG',
        outputVoltageV: 400,
        rectifierIncluded: true,
        dumpLoadRequiredKw: 12
      },
      structural: {
        nacelleMassKg: 120,
        rotorMassKg: 45,
        maxThrustKn: 9,
        naturalFrequencyHz: 1.1
      },
      priceEur: 19500,
      powerCurve: [
        {v:2,p:0,ct:0},{v:3,p:150,ct:0.40},{v:4,p:450,ct:0.43},
        {v:5,p:1000,ct:0.45},{v:6,p:1900,ct:0.46},{v:7,p:3100,ct:0.45},
        {v:8,p:4600,ct:0.43},{v:9,p:6400,ct:0.40},{v:10,p:8500,ct:0.37},
        {v:11,p:10000,ct:0.34},{v:12,p:10000,ct:0.30},{v:25,p:10000,ct:0.18}
      ]
    },
    {
      id: 'kliux-gecko',
      manufacturer: 'Kliux Energies',
      model: 'Gecko',
      type: 'VAWT',
      ratedPowerW: 2500,
      rotorDiameterM: 3.8,
      bladeLength: 4.2,
      bladeHeightM: 4.2,
      bladeCount: 3,
      hubHeightsAvailableM: [4, 6, 9, 12],
      cutInSpeedMs: 2.0,
      ratedSpeedMs: 12.0,
      cutOutSpeedMs: 25.0,
      survivalSpeedMs: 52.5,
      iecClass: 'IV',
      acousticPowerLwaDba: 88,
      electrical: {
        generatorType: 'PMSG',
        outputVoltageV: 48,
        rectifierIncluded: true,
        dumpLoadRequiredKw: 3
      },
      structural: {
        nacelleMassKg: 35,
        rotorMassKg: 18,
        maxThrustKn: 2.2,
        naturalFrequencyHz: 2.5
      },
      priceEur: 6200,
      powerCurve: [
        {v:2,p:0,ct:0},{v:3,p:30,ct:0.25},{v:4,p:100,ct:0.30},
        {v:5,p:230,ct:0.35},{v:6,p:420,ct:0.38},{v:7,p:680,ct:0.38},
        {v:8,p:1000,ct:0.37},{v:9,p:1400,ct:0.35},{v:10,p:1850,ct:0.33},
        {v:11,p:2250,ct:0.30},{v:12,p:2500,ct:0.28},{v:25,p:2500,ct:0.18}
      ]
    },
    {
      id: 'kliux-winds-100',
      manufacturer: 'Kliux Energies',
      model: 'Winds 100',
      type: 'HAWT',
      ratedPowerW: 100000,
      rotorDiameterM: 21.0,
      bladeLength: 10.5,
      bladeHeightM: 21.0,
      bladeCount: 3,
      hubHeightsAvailableM: [30, 36, 42, 50],
      cutInSpeedMs: 3.0,
      ratedSpeedMs: 12.0,
      cutOutSpeedMs: 25.0,
      survivalSpeedMs: 70.0,
      iecClass: 'II',
      acousticPowerLwaDba: 107,
      electrical: {
        generatorType: 'PMSG',
        outputVoltageV: 400,
        rectifierIncluded: false,
        dumpLoadRequiredKw: 120
      },
      structural: {
        nacelleMassKg: 2200,
        rotorMassKg: 800,
        maxThrustKn: 120,
        naturalFrequencyHz: 0.35
      },
      priceEur: 180000,
      powerCurve: [
        {v:3,p:1500,ct:0.42},{v:4,p:4200,ct:0.44},{v:5,p:9500,ct:0.46},
        {v:6,p:18000,ct:0.47},{v:7,p:29500,ct:0.46},{v:8,p:44000,ct:0.44},
        {v:9,p:62000,ct:0.41},{v:10,p:82000,ct:0.38},{v:11,p:96000,ct:0.35},
        {v:12,p:100000,ct:0.32},{v:25,p:100000,ct:0.19}
      ]
    }
  ];

  var STORAGE_KEY = 'ra_wind_catalog_v1';

  // ── [AUD-2026 · E-01] Validación física de curvas de potencia ──────────────
  // El límite de Betz (16/27 ≈ 0,593) es infranqueable para un rotor abierto.
  // El catálogo se construía sin comprobar Cp; había equipos que declaraban
  // 13,5 kW a 8 m/s con 6,4 m de diámetro (Cp ≈ 1,34), es decir, más energía que
  // la contenida en el viento.
  var AIR_DENSITY_KGM3 = 1.225;
  var BETZ_LIMIT = 0.593;

  /**
   * Calcula el área de captación aerodinámica real (m²) distinguiendo:
   * - HAWT (eje horizontal): círculo de barrido A = π · D² / 4
   * - VAWT (eje vertical: Darrieus/Savonius/H-rotor): cilindro proyectado A = D · H
   */
  function computeRotorSweptArea(turbine) {
    if (!turbine) return 0;
    var D = Math.max(0.4, Number(turbine.rotorDiameterM) || 5.0);
    var isVawt = (turbine.type === 'VAWT' || turbine.type === 'vawt');
    if (isVawt) {
      var H = Number(turbine.bladeHeightM || turbine.bladeLength || (turbine.supportStructure && turbine.supportStructure.bladeLength) || (D * 1.4));
      if (!(H > 0)) H = D * 1.4;
      return Math.round(D * H * 100) / 100;
    }
    return Math.round((Math.PI * D * D / 4) * 100) / 100;
  }

  function computePowerCurveAudit(turbine) {
    var D = Number(turbine && turbine.rotorDiameterM);
    var pts = (turbine && Array.isArray(turbine.powerCurve)) ? turbine.powerCurve : [];
    if (!(D > 0) || pts.length === 0) {
      return { valid: false, maxCp: null, reason: 'Diámetro de rotor o curva de potencia ausentes' };
    }
    var area = computeRotorSweptArea(turbine);
    var maxCp = 0;
    var atV = null;
    var violations = [];
    pts.forEach(function (p) {
      var v = Number(p && p.v);
      var power = Number(p && p.p);
      if (!(v > 0) || !isFinite(power) || power < 0) return;
      var cp = power / (0.5 * AIR_DENSITY_KGM3 * area * Math.pow(v, 3));
      if (cp > maxCp) { maxCp = cp; atV = v; }
      if (cp > BETZ_LIMIT) violations.push({ v: v, cp: Math.round(cp * 1000) / 1000 });
    });
    return {
      valid: maxCp <= BETZ_LIMIT,
      maxCp: Math.round(maxCp * 1000) / 1000,
      atV: atV,
      violations: violations,
      rotorAreaM2: Math.round(area * 100) / 100,
      reason: violations.length
        ? 'Curva incompatible con el límite de Betz: revisar potencia nominal o diámetro de rotor'
        : 'Curva físicamente viable'
    };
  }

  /**
   * Genera o calibra una curva de potencia físicamente realista respetando la aerodinámica (Cp <= 0.42).
   * Si la turbina carece de curva o viola Betz (Cp > 0.593), ajusta cada punto a la potencia máxima
   * aerodinámicamente posible para el área del rotor o sintetiza la curva estándar de minieólica.
   */
  function calibratePowerCurveToBetz(turbine, targetMaxCp) {
    if (!turbine || typeof turbine !== 'object') return turbine;
    var isVawt = (turbine.type === 'VAWT' || turbine.type === 'vawt');
    var maxAllowedCp = (typeof targetMaxCp === 'number' && targetMaxCp > 0 && targetMaxCp <= BETZ_LIMIT) ? targetMaxCp : (isVawt ? 0.35 : 0.42);
    var D = Math.max(0.6, Number(turbine.rotorDiameterM) || 5.0);
    var pNomW = Math.max(100, Number(turbine.ratedPowerW) || 5000);
    var cutIn = Math.max(1.5, Number(turbine.cutInSpeedMs) || 2.5);
    var ratedSpeed = Math.max(cutIn + 2, Number(turbine.ratedSpeedMs) || 11.0);
    var cutOut = Math.max(ratedSpeed + 3, Number(turbine.cutOutSpeedMs) || 25.0);
    var area = computeRotorSweptArea(turbine);

    var existingCurve = Array.isArray(turbine.powerCurve) ? turbine.powerCurve : [];
    var newCurve = [];

    if (existingCurve.length >= 2) {
      newCurve = existingCurve.map(function(pt) {
        var v = Number(pt.v);
        var pOrig = Number(pt.p);
        var ct = (typeof pt.ct === 'number') ? pt.ct : 0.40;
        if (v < cutIn || v > cutOut) {
          return { v: v, p: 0, ct: 0.05 };
        }
        var pWind = 0.5 * AIR_DENSITY_KGM3 * area * Math.pow(v, 3);
        var pMaxAerodynamic = pWind * maxAllowedCp;
        var pClamped = Math.min(pOrig, pMaxAerodynamic);
        pClamped = Math.min(pClamped, pNomW);
        return {
          v: v,
          p: Math.round(pClamped),
          ct: Math.max(0.15, Math.min(0.55, ct))
        };
      });
    } else {
      for (var vInt = 2; vInt <= cutOut; vInt++) {
        if (vInt < cutIn) {
          newCurve.push({ v: vInt, p: 0, ct: 0.05 });
          continue;
        }
        var pWind = 0.5 * AIR_DENSITY_KGM3 * area * Math.pow(vInt, 3);
        var pMaxAero = pWind * maxAllowedCp;
        var pPch = 0;
        if (vInt >= ratedSpeed) {
          pPch = Math.min(pNomW, pMaxAero);
        } else {
          var frac = (vInt - cutIn) / Math.max(1.0, ratedSpeed - cutIn);
          pPch = Math.min(pNomW * Math.pow(frac, 2.5), pMaxAero);
        }
        var ctVal = vInt <= 6 ? 0.44 : (vInt <= 9 ? 0.41 : (vInt <= 12 ? 0.35 : 0.20));
        newCurve.push({
          v: vInt,
          p: Math.round(pPch),
          ct: ctVal
        });
      }
    }

    turbine.powerCurve = newCurve;
    turbine.cpAudit = computePowerCurveAudit(turbine);
    return turbine;
  }

  function auditCatalogEntry(turbine) {
    if (!turbine || typeof turbine !== 'object') return turbine;
    var audit = computePowerCurveAudit(turbine);
    if (!audit || !audit.valid) {
      // Auto-calibrar al cargar para sanear modelos antiguos guardados en localStorage
      calibratePowerCurveToBetz(turbine, 0.42);
      audit = turbine.cpAudit || computePowerCurveAudit(turbine);
    }
    turbine.cpAudit = audit;
    return turbine;
  }

  // ── API pública del catálogo ──────────────────────────────────────────
  var RAWindCatalog = {

    _catalog: null,

    computeRotorSweptArea: computeRotorSweptArea,
    validatePowerCurve: computePowerCurveAudit,
    calibratePowerCurveToBetz: calibratePowerCurveToBetz,

    // Carga desde localStorage o retorna los valores por defecto
    load: function () {
      if (this._catalog) return this._catalog;
      try {
        var stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          var parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            this._catalog = parsed.map(auditCatalogEntry);
            return this._catalog;
          }
        }
      } catch (e) { /* fallo silencioso */ }
      this._catalog = DEFAULT_TURBINES.map(function (t) {
        return auditCatalogEntry(JSON.parse(JSON.stringify(t)));
      });
      return this._catalog;
    },

    // Guarda en localStorage
    save: function () {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this._catalog || []));
      } catch (e) { /* fallo silencioso */ }
    },

    // Devuelve una copia del listado
    getAll: function () {
      return (this.load()).slice();
    },

    // Busca por id
    getById: function (id) {
      return (this.load()).find(function (t) { return t.id === id; }) || null;
    },

    // Añade o actualiza una turbina
    upsert: function (turbine) {
      this.load();
      if (!turbine || !turbine.id) return;
      // Auto-calibrar si no tiene curva válida o viola Betz
      var audit = computePowerCurveAudit(turbine);
      if (!audit || !audit.valid) {
        calibratePowerCurveToBetz(turbine, 0.42);
      }
      var idx = this._catalog.findIndex(function (t) { return t.id === turbine.id; });
      if (idx >= 0) {
        this._catalog[idx] = turbine;
      } else {
        this._catalog.push(turbine);
      }
      this.save();
    },

    // Elimina por id
    remove: function (id) {
      this.load();
      this._catalog = this._catalog.filter(function (t) { return t.id !== id; });
      this.save();
    },

    // Restaura los valores por defecto
    resetToDefaults: function () {
      this._catalog = DEFAULT_TURBINES.map(function (t) {
        return JSON.parse(JSON.stringify(t));
      });
      this.save();
    },

    // Genera un id único para una turbina nueva
    generateId: function (manufacturer, model) {
      var base = (manufacturer + '-' + model)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      var existing = this.getById(base);
      if (!existing) return base;
      return base + '-' + Date.now();
    },

    // ── Prompt para importación IA de datasheets de turbinas ────────
    getAIExtractionPrompt: function () {
      return 'Eres un ingeniero aerogeneradores experto en análisis de fichas técnicas de turbinas eólicas.\n' +
        'Analiza minuciosamente este documento técnico (ficha técnica / datasheet comercial de aerogenerador).\n\n' +
        'OBJETIVO: Extrae todos los parámetros técnicos del aerogenerador.\n\n' +
        'DEBES DEVOLVER EXCLUSIVAMENTE UN OBJETO JSON VÁLIDO CON ESTA ESTRUCTURA:\n' +
        '{\n' +
        '  "category": "wind_turbines",\n' +
        '  "manufacturer": "Nombre del fabricante (ej. Bornay, Enair, Kliux, Enercon, Vestas)",\n' +
        '  "model": "Denominación comercial exacta del modelo",\n' +
        '  "type": "HAWT o VAWT",\n' +
        '  "ratedPowerW": 25000,\n' +
        '  "rotorDiameterM": 6.4,\n' +
        '  "bladeCount": 3,\n' +
        '  "hubHeightsAvailableM": [12, 18, 24],\n' +
        '  "cutInSpeedMs": 2.5,\n' +
        '  "ratedSpeedMs": 11.0,\n' +
        '  "cutOutSpeedMs": 25.0,\n' +
        '  "survivalSpeedMs": 59.5,\n' +
        '  "iecClass": "I, II, III, IV o S",\n' +
        '  "acousticPowerLwaDba": 101,\n' +
        '  "generatorType": "PMSG, IG o DFIG",\n' +
        '  "outputVoltageV": 400,\n' +
        '  "rectifierIncluded": true,\n' +
        '  "dumpLoadRequiredKw": 30,\n' +
        '  "nacelleMassKg": 280,\n' +
        '  "rotorMassKg": 95,\n' +
        '  "maxThrustKn": 18,\n' +
        '  "priceEur": 28000,\n' +
        '  "powerCurve": [{"v":3,"p":500,"ct":0.40}, ...]\n' +
        '}\n\n' +
        'powerCurve debe contener puntos desde cut-in hasta cut-out con paso de 1 m/s.\n' +
        'Si un dato no está en el documento, usa un valor técnicamente razonable y ponlo.';
    },

    // ── Prompt para búsqueda web IA de aerogeneradores ───────────────
    getAISearchPrompt: function (query) {
      return 'Actúa como un Ingeniero Senior de Proyectos Eólicos y base de datos oficial de aerogeneradores.\n' +
        'El usuario busca: "' + query + '".\n\n' +
        'IMPORTANTE: Limita los resultados estrictamente a la categoría \'wind_turbines\'.\n\n' +
        'Devuelve de 1 a 5 modelos comerciales reales de aerogeneradores que mejor coincidan con la búsqueda.\n' +
        'Usa fabricantes reales: Bornay, Enair, Kliux, Enercon, Vestas, Siemens Gamesa, Nordex, GE, Windspot, Aeolos, etc.\n\n' +
        'FORMATO DE SALIDA: array JSON exclusivamente, sin markdown.\n' +
        '[\n' +
        '  {\n' +
        '    "category": "wind_turbines",\n' +
        '    "manufacturer": "Nombre del fabricante",\n' +
        '    "model": "Denominación comercial exacta",\n' +
        '    "type": "HAWT",\n' +
        '    "ratedPowerW": 25000,\n' +
        '    "rotorDiameterM": 6.4,\n' +
        '    "bladeCount": 3,\n' +
        '    "hubHeightsAvailableM": [12, 18, 24, 30],\n' +
        '    "cutInSpeedMs": 2.5,\n' +
        '    "ratedSpeedMs": 11.0,\n' +
        '    "cutOutSpeedMs": 25.0,\n' +
        '    "survivalSpeedMs": 59.5,\n' +
        '    "iecClass": "III",\n' +
        '    "acousticPowerLwaDba": 101,\n' +
        '    "generatorType": "PMSG",\n' +
        '    "outputVoltageV": 400,\n' +
        '    "rectifierIncluded": true,\n' +
        '    "dumpLoadRequiredKw": 30,\n' +
        '    "nacelleMassKg": 280,\n' +
        '    "rotorMassKg": 95,\n' +
        '    "maxThrustKn": 18,\n' +
        '    "priceEur": 28000\n' +
        '  }\n' +
        ']';
    },

    // ── Convierte resultado IA crudo a formato WindTurbineCatalogItem ──
    sanitizeFromAI: function (raw) {
      if (!raw || typeof raw !== 'object') return null;
      var manufacturer = String(raw.manufacturer || raw.brand || 'Fabricante Desconocido').trim();
      var model = String(raw.model || 'Modelo').trim();
      var turbine = {
        id: this.generateId(manufacturer, model),
        manufacturer: manufacturer,
        model: model,
        type: (raw.type === 'VAWT') ? 'VAWT' : 'HAWT',
        ratedPowerW: Math.max(100, parseFloat(raw.ratedPowerW) || 10000),
        rotorDiameterM: Math.max(0.5, parseFloat(raw.rotorDiameterM) || 5.0),
        bladeHeightM: parseFloat(raw.bladeHeightM || raw.bladeLength) || ((raw.type === 'VAWT') ? Math.round((parseFloat(raw.rotorDiameterM) || 5.0) * 1.4 * 10) / 10 : (parseFloat(raw.rotorDiameterM) || 5.0)),
        bladeLength: parseFloat(raw.bladeLength || raw.bladeHeightM) || ((raw.type === 'VAWT') ? Math.round((parseFloat(raw.rotorDiameterM) || 5.0) * 1.4 * 10) / 10 : Math.round((parseFloat(raw.rotorDiameterM) || 5.0) / 2 * 10) / 10),
        bladeCount: parseInt(raw.bladeCount, 10) || 3,
        hubHeightsAvailableM: Array.isArray(raw.hubHeightsAvailableM) ? raw.hubHeightsAvailableM : [12, 18, 24],
        cutInSpeedMs: parseFloat(raw.cutInSpeedMs) || 2.5,
        ratedSpeedMs: parseFloat(raw.ratedSpeedMs) || 11.0,
        cutOutSpeedMs: parseFloat(raw.cutOutSpeedMs) || 25.0,
        survivalSpeedMs: parseFloat(raw.survivalSpeedMs) || 59.5,
        iecClass: String(raw.iecClass || 'III').replace(/[^IVS]/g, ''),
        acousticPowerLwaDba: parseFloat(raw.acousticPowerLwaDba) || 100,
        electrical: {
          generatorType: raw.generatorType || 'PMSG',
          outputVoltageV: parseFloat(raw.outputVoltageV) || 400,
          rectifierIncluded: raw.rectifierIncluded !== false,
          dumpLoadRequiredKw: parseFloat(raw.dumpLoadRequiredKw) || (parseFloat(raw.ratedPowerW) / 1000 * 1.2)
        },
        structural: {
          nacelleMassKg: parseFloat(raw.nacelleMassKg) || 200,
          rotorMassKg: parseFloat(raw.rotorMassKg) || 80,
          maxThrustKn: parseFloat(raw.maxThrustKn) || 15,
          naturalFrequencyHz: parseFloat(raw.naturalFrequencyHz) || 0.8
        },
        priceEur: parseFloat(raw.priceEur) || 20000,
        powerCurve: Array.isArray(raw.powerCurve) ? raw.powerCurve : []
      };
      return turbine;
    },

    // ── Renderiza la tabla HTML para el panel del catálogo ─────────────
    renderTable: function () {
      var turbines = this.getAll();
      if (!turbines.length) {
        return '<div style="color:var(--text-slate-400);text-align:center;padding:24px;font-size:11px;">No hay aerogeneradores en el catálogo.<br>Usa el botón + AÑADIR o importa con IA.</div>';
      }
      var rows = turbines.map(function (t) {
        var kw = (t.ratedPowerW / 1000).toFixed(1);
        var hMin = t.hubHeightsAvailableM ? t.hubHeightsAvailableM[0] : '?';
        var hMax = t.hubHeightsAvailableM ? t.hubHeightsAvailableM[t.hubHeightsAvailableM.length - 1] : '?';
        var price = t.priceEur ? (t.priceEur.toLocaleString('es-ES') + ' €') : '—';
        var isVawt = (t.type === 'VAWT');
        var bH = t.bladeHeightM || t.bladeLength || (isVawt ? Math.round(t.rotorDiameterM * 1.4 * 10) / 10 : null);
        var rotorDisplay = isVawt ? (t.rotorDiameterM + ' m <span style="color:#A78BFA;font-size:9.5px;font-weight:600;">(H=' + (bH ? bH + 'm' : '—') + ')</span>') : (t.rotorDiameterM + ' m');
        var sweptArea = computeRotorSweptArea(t);
        return '<tr>' +
          '<td><b>' + t.manufacturer + '</b><br>' +
          '<span style="color:#38BDF8;font-size:10.5px;">' + t.model + '</span></td>' +
          '<td style="text-align:center;"><span class="cat-badge cat-badge-cyan">' + t.type + '</span></td>' +
          '<td style="text-align:center;"><span class="cat-badge cat-badge-amber">' + kw + ' kW</span></td>' +
          '<td style="text-align:center;font-family:monospace;" title="Área de captación: ' + sweptArea + ' m² (' + (isVawt ? 'cilindro Ø×H' : 'círculo π·Ø²/4') + ')">' + rotorDisplay + '</td>' +
          '<td style="text-align:center;font-size:10.5px;">' + hMin + '–' + hMax + ' m</td>' +
          '<td style="text-align:center;"><span class="cat-badge cat-badge-purple">' + t.iecClass + '</span></td>' +
          '<td style="text-align:center;font-size:10.5px;color:var(--text-slate-300);">' + t.acousticPowerLwaDba + ' dB(A)</td>' +
          '<td style="text-align:center;color:#34D399;font-weight:bold;">' + price + '</td>' +
          '<td style="text-align:right;">' +
            '<div style="display:flex;justify-content:flex-end;align-items:center;gap:4px;">' +
              '<button class="cat-btn cat-btn-edit" onclick="if(window.openEditEquipmentModal) window.openEditEquipmentModal(\'wind_turbines\', \'' + t.id + '\');"><i data-lucide="edit-2" class="icon-sm"></i> EDITAR</button>' +
              '<button class="cat-btn cat-btn-apply" onclick="if(window.RAWindCatalog) window.RAWindCatalog._onUseTurbine(\'' + t.id + '\')">USAR</button>' +
              '<button class="cat-btn cat-btn-delete" onclick="if(window.RAWindCatalog) window.RAWindCatalog._onDeleteTurbine(\'' + t.id + '\')" title="Eliminar"><i data-lucide="x" class="icon-sm"></i></button>' +
            '</div>' +
          '</td></tr>';
      }).join('');
      return '<div class="cat-table-wrap"><table class="cat-table">' +
        '<thead><tr>' +
        '<th style="width:24%;">Fabricante & Modelo</th>' +
        '<th style="text-align:center;width:8%;">Tipo</th>' +
        '<th style="text-align:center;width:11%;">Potencia</th>' +
        '<th style="text-align:center;width:10%;">Ø Rotor</th>' +
        '<th style="text-align:center;width:10%;">H. Mástil</th>' +
        '<th style="text-align:center;width:9%;">Clase IEC</th>' +
        '<th style="text-align:center;width:10%;">Ruido LwA</th>' +
        '<th style="text-align:center;width:10%;">Precio</th>' +
        '<th style="text-align:right;width:16%;">Acciones</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table></div>';
    },

    // ── Refresca el panel de turbinas si está visible ────────────────
    refreshPanel: function () {
      var pane = document.getElementById('cat-pane-wind_turbines');
      if (!pane) return;
      pane.innerHTML = this.renderTable();
    },

    // ── Callback: usar turbina (la selecciona para colocación) ────────
    _onUseTurbine: function (id) {
      var turbine = this.getById(id);
      if (!turbine) return;
      if (typeof global.closeEquipmentCatalogModal === 'function') {
        global.closeEquipmentCatalogModal();
      }
      if (global.RAWindUI && typeof global.RAWindUI.startTurbinePlacement === 'function') {
        global.RAWindUI.startTurbinePlacement(turbine);
      } else {
        // fallback: guardar turbina seleccionada y esperar a que RAWindUI esté listo
        global._pendingWindTurbinePlacement = turbine;
      }
    },

    // ── Callback: eliminar turbina ────────────────────────────────────
    _onDeleteTurbine: function (id) {
      if (!confirm('¿Eliminar este aerogenerador del catálogo?')) return;
      this.remove(id);
      this.refreshPanel();
    },

    // ── Inyectar pestaña en el modal de catálogo existente ───────────
    injectCatalogTab: function () {
      // Pestaña del botón de cabecera
      var tabContainer = document.querySelector('#ra-equipment-catalog-modal [style*="display:flex"][style*="gap:4px"][style*="padding:8px 16px"]');
      if (tabContainer && !document.getElementById('cat-tab-btn-wind_turbines')) {
        var microinvBtn = document.getElementById('cat-tab-btn-microinverters');
        var windBtn = document.createElement('button');
        windBtn.className = 'sb-tab-btn';
        windBtn.id = 'cat-tab-btn-wind_turbines';
        windBtn.setAttribute('onclick', 'switchCatalogTab("wind_turbines")');
        windBtn.style.cssText = 'padding:6px 12px;font-size:10.5px;border-radius:6px;color:#38BDF8;border:1px solid rgba(56,189,248,0.5);background:rgba(56,189,248,0.08);';
        windBtn.innerHTML = '💨 AEROGENERADORES';
        if (microinvBtn && microinvBtn.parentNode) {
          microinvBtn.parentNode.insertBefore(windBtn, microinvBtn.nextSibling);
        } else {
          tabContainer.appendChild(windBtn);
        }
      }

      // Panel de contenido
      var bodyContainer = document.querySelector('#ra-equipment-catalog-modal [style*="padding:16px"][style*="overflow-y:auto"]');
      if (bodyContainer && !document.getElementById('cat-pane-wind_turbines')) {
        var pane = document.createElement('div');
        pane.id = 'cat-pane-wind_turbines';
        pane.style.display = 'none';
        pane.innerHTML = this.renderTable();
        bodyContainer.appendChild(pane);
      }
    }
  };

  // Exponer globalmente
  global.RAWindCatalog = RAWindCatalog;

  // Compatibilidad Node.js (tests)
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = RAWindCatalog;
  }

})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : global));
