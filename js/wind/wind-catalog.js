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
      rotorDiameterM: 6.4,
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
        {v:2,p:0,ct:0},{v:3,p:500,ct:0.40},{v:4,p:1500,ct:0.42},
        {v:5,p:3200,ct:0.44},{v:6,p:5800,ct:0.45},{v:7,p:9200,ct:0.44},
        {v:8,p:13500,ct:0.43},{v:9,p:18000,ct:0.41},{v:10,p:22000,ct:0.38},
        {v:11,p:25000,ct:0.35},{v:12,p:25000,ct:0.32},{v:25,p:25000,ct:0.20}
      ]
    },
    {
      id: 'bornay-wind-6',
      manufacturer: 'Bornay Aerogeneradores',
      model: 'Wind 6',
      type: 'HAWT',
      ratedPowerW: 6000,
      rotorDiameterM: 3.2,
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
        {v:2,p:0,ct:0},{v:3,p:120,ct:0.38},{v:4,p:350,ct:0.40},
        {v:5,p:750,ct:0.43},{v:6,p:1400,ct:0.44},{v:7,p:2300,ct:0.44},
        {v:8,p:3400,ct:0.43},{v:9,p:4500,ct:0.41},{v:10,p:5400,ct:0.38},
        {v:11,p:5900,ct:0.35},{v:12,p:6000,ct:0.32},{v:25,p:6000,ct:0.20}
      ]
    },
    {
      id: 'enair-30l',
      manufacturer: 'Enair Energy',
      model: 'Enair 30L',
      type: 'HAWT',
      ratedPowerW: 30000,
      rotorDiameterM: 8.0,
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
        {v:2,p:200,ct:0.42},{v:3,p:800,ct:0.44},{v:4,p:2000,ct:0.46},
        {v:5,p:4200,ct:0.47},{v:6,p:7500,ct:0.46},{v:7,p:12000,ct:0.45},
        {v:8,p:17500,ct:0.43},{v:9,p:23000,ct:0.40},{v:10,p:28000,ct:0.37},
        {v:11,p:30000,ct:0.34},{v:12,p:30000,ct:0.31},{v:25,p:30000,ct:0.19}
      ]
    },
    {
      id: 'enair-10l',
      manufacturer: 'Enair Energy',
      model: 'Enair 10L',
      type: 'HAWT',
      ratedPowerW: 10000,
      rotorDiameterM: 5.0,
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
        {v:2,p:50,ct:0.40},{v:3,p:250,ct:0.43},{v:4,p:700,ct:0.45},
        {v:5,p:1500,ct:0.46},{v:6,p:2700,ct:0.46},{v:7,p:4300,ct:0.45},
        {v:8,p:6200,ct:0.43},{v:9,p:8000,ct:0.40},{v:10,p:9500,ct:0.37},
        {v:11,p:10000,ct:0.34},{v:12,p:10000,ct:0.30},{v:25,p:10000,ct:0.18}
      ]
    },
    {
      id: 'kliux-gecko',
      manufacturer: 'Kliux Energies',
      model: 'Gecko',
      type: 'VAWT',
      ratedPowerW: 2500,
      rotorDiameterM: 2.0,
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
        {v:2,p:30,ct:0.25},{v:3,p:100,ct:0.30},{v:4,p:260,ct:0.35},
        {v:5,p:520,ct:0.38},{v:6,p:900,ct:0.40},{v:7,p:1350,ct:0.40},
        {v:8,p:1850,ct:0.39},{v:9,p:2200,ct:0.37},{v:10,p:2400,ct:0.35},
        {v:11,p:2480,ct:0.32},{v:12,p:2500,ct:0.29},{v:25,p:2500,ct:0.18}
      ]
    },
    {
      id: 'kliux-winds-100',
      manufacturer: 'Kliux Energies',
      model: 'Winds 100',
      type: 'HAWT',
      ratedPowerW: 100000,
      rotorDiameterM: 19.0,
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
        {v:3,p:2000,ct:0.42},{v:4,p:6000,ct:0.44},{v:5,p:13000,ct:0.46},
        {v:6,p:24000,ct:0.47},{v:7,p:39000,ct:0.46},{v:8,p:58000,ct:0.44},
        {v:9,p:76000,ct:0.41},{v:10,p:89000,ct:0.38},{v:11,p:97000,ct:0.35},
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

  function computePowerCurveAudit(turbine) {
    var D = Number(turbine && turbine.rotorDiameterM);
    var pts = (turbine && Array.isArray(turbine.powerCurve)) ? turbine.powerCurve : [];
    if (!(D > 0) || pts.length === 0) {
      return { valid: false, maxCp: null, reason: 'Diámetro de rotor o curva de potencia ausentes' };
    }
    var area = Math.PI * D * D / 4;
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

  function auditCatalogEntry(turbine) {
    if (!turbine || typeof turbine !== 'object') return turbine;
    var audit = computePowerCurveAudit(turbine);
    turbine.cpAudit = audit;
    if (!audit.valid && typeof console !== 'undefined') {
      console.warn('[RAWindCatalog] Curva no válida (' + (turbine.manufacturer || '?') + ' ' +
        (turbine.model || '?') + '): Cp_max=' + audit.maxCp + ' > ' + BETZ_LIMIT);
    }
    return turbine;
  }

  // ── API pública del catálogo ──────────────────────────────────────────
  var RAWindCatalog = {

    _catalog: null,

    validatePowerCurve: computePowerCurveAudit,

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
        return '<tr>' +
          '<td><b>' + t.manufacturer + '</b><br>' +
          '<span style="color:#38BDF8;font-size:10.5px;">' + t.model + '</span></td>' +
          '<td style="text-align:center;"><span class="cat-badge cat-badge-cyan">' + t.type + '</span></td>' +
          '<td style="text-align:center;"><span class="cat-badge cat-badge-amber">' + kw + ' kW</span></td>' +
          '<td style="text-align:center;font-family:monospace;">' + t.rotorDiameterM + ' m</td>' +
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
