/**
 * ============================================================================
 * PROPOSAL STYLE & LAYOUT STUDIO (proposal-style-studio.js)
 * ============================================================================
 * Arquitectura modular, escalable e independiente (SSOT) para el control de
 * estilos, densidad, tipografía, orden de secciones, nivel de desglose
 * económico, textos fijos con variables dinámicas y auto-encaje A4
 * ("Guardián Anti-Desborde") en ambos formatos de propuesta comercial:
 *   - Horizontal (Landscape A4 - Dossier Ejecutivo)
 *   - Vertical   (Portrait A4  - Oferta Bancable)
 * ============================================================================
 */
(function(global) {
  'use strict';

  var STORAGE_KEY = 'ra_proposal_style_studio_v1';

  // ── 1. CATÁLOGO CANÓNICO DE SECCIONES UNIFICADAS ───────────────────────────
  var CANONICAL_SECTIONS = [
    { id: 'cover',               label: 'Portada 3D & Datos del Proyecto',              icon: '🖼️', desc: 'Portada corporativa con gemelo digital 3D y KPIs principales' },
    { id: 'summary',             label: 'Resumen Ejecutivo & Propuesta de Valor',       icon: '📋', desc: 'Filosofía de ingeniería, impacto ambiental y resumen ejecutivo' },
    { id: 'bill_audit',          label: 'Estudio Preliminar & Auditoría de Factura',    icon: '🧾', desc: 'Análisis de suministro actual, tarifa, CUPS y perfil de consumo' },
    { id: 'installation',        label: 'Instalación Proyectada & Equipos Tier-1',      icon: '⚡', desc: 'Distribución en cubierta, módulos FV, inversores, baterías y eólica' },
    { id: 'energy_balance',      label: 'Balance Energético Mensual & Curvas 24h',      icon: '📊', desc: 'Tabla mensual de 12 meses, curvas horarias y cobertura solar' },
    { id: 'packages_comparison', label: 'Comparativa de 3 Planes de Inversión',         icon: '🏆', desc: 'Alternativas Esencial, Óptimo Recomendado e Independencia Total' },
    { id: 'economics',           label: 'Propuesta Económica & Desglose CAPEX',         icon: '💶', desc: 'Presupuesto llave en mano, partidas, impuestos y modalidades de pago' },
    { id: 'cashflow_25y',        label: 'Amortización a 25 Años & Garantías',           icon: '📈', desc: 'Flujo de caja acumulado, VAN, TIR, cronograma y cuadro de garantías' },
    { id: 'cel',                 label: 'Comunidad Energética Local (RDL 7/2026)',      icon: '🌐', desc: 'Reparto de excedentes en radio de 5 km e ingresos por inyección CEL' },
    { id: 'closing',             label: 'Hoja de Decisión, Condiciones & Firma',        icon: '✍️', desc: 'Resumen de decisión ejecutiva, hitos de pago, validez y firmas' }
  ];

  // ── 2. TEMAS DE COLOR BASE ─────────────────────────────────────────────────
  var THEME_PALETTES = {
    emerald: { primary: '#059669', secondary: '#10b981', light: '#ecfdf5', text: '#065f46', dark: '#064e3b', border: '#a7f3d0' },
    sky:     { primary: '#0284c7', secondary: '#38bdf8', light: '#f0f9ff', text: '#075985', dark: '#0c4a6e', border: '#bae6fd' },
    rose:    { primary: '#e11d48', secondary: '#f97316', light: '#fff1f2', text: '#881337', dark: '#4c0519', border: '#fecdd3' },
    amber:   { primary: '#d97706', secondary: '#f59e0b', light: '#fffbeb', text: '#92400e', dark: '#451a03', border: '#fde68a' },
    slate:   { primary: '#334155', secondary: '#64748b', light: '#f8fafc', text: '#0f172a', dark: '#0f172a', border: '#cbd5e1' }
  };

  // ── 3. PERFILES PREDEFINIDOS (BUILT-IN PRESETS) ────────────────────────────
  var BUILTIN_PRESETS = {
    residencial_rapido: {
      id: 'residencial_rapido',
      name: '🏠 Residencial Rápido (Directo al Ahorro)',
      builtin: true,
      config: {
        theme: 'emerald',
        useCustomColors: false,
        customPrimary: '#059669',
        customSecondary: '#10b981',
        density: 'balanced',        // compact | balanced | editorial
        fontFamily: 'modern',       // modern | technical | corporate | rounded
        fontScale: 100,             // 85 .. 115
        borderStyle: 'rounded',     // rounded | sharp | minimal
        inkMode: 'light',           // light | luxury_dark
        autoFitA4: true,
        // Controles finos de interlineado, espaciado, saltos de línea y color de textos
        headingLineHeight: 1.18,
        headingLetterSpacing: -0.5,
        subtitleLineHeight: 1.32,
        subtitleSpacing: 6,
        bodyLineHeight: 1.48,
        paragraphGap: 10,
        tableLineHeight: 1.28,
        textWrapBalance: true,
        compactKpiBoxes: true,
        paragraphAlign: 'left',     // left | justify | center
        useCustomTextColors: false,
        headingTextColor: '#0f172a',
        bodyTextColor: '#334155',
        mutedTextColor: '#64748b',
        economicBreakdown: 'chapters_units', // turnkey_only | chapters_units | full_open
        showTaxBenefits: true,
        showFinancingOptions: true,
        sectionOrder: [
          'cover', 'summary', 'bill_audit', 'installation',
          'energy_balance', 'packages_comparison', 'economics',
          'cashflow_25y', 'cel', 'closing'
        ],
        sectionsEnabled: {
          cover: true,
          summary: true,
          bill_audit: true,
          installation: true,
          energy_balance: true,
          packages_comparison: false,
          economics: true,
          cashflow_25y: true,
          cel: false,
          closing: true
        },
        lockedTexts: {
          coverMainTitle: 'PROYECTO INTEGRAL DE | GENERACIÓN RENOVABLE',
          coverSubtitle: 'Estudio de viabilidad técnica, diseño CAD 3D y análisis de rentabilidad para autoconsumo',
          coverLandscapeTitle: 'Autoconsumo Fotovoltaico',
          useLockedSummary: true,
          summaryTemplate: 'Propuesta técnica llave en mano para {{clientName}} compuesta por {{numPanels}} módulos fotovoltaicos ({{kwp}} kWp){{windPhrase}}, diseñada mediante gemelo digital 3D. Permite generar {{annualYield}} kWh/año con un ahorro estimado de {{ahorroAnual}} €/año desde el primer año y retorno de inversión en {{payback}} años.',
          useLockedPaymentTerms: true,
          milestone1Pct: 30,
          milestone1Text: 'A la firma del contrato (reserva de equipos Tier-1 e inicio de ingeniería)',
          milestone2Pct: 50,
          milestone2Text: 'Al acopio de materiales en el inmueble e inicio del montaje mecánico',
          milestone3Pct: 20,
          milestone3Text: 'A la puesta en marcha, legalización CIE ante Industria y entrega final',
          validityDays: 30,
          legalNotes: 'Oferta llave en mano vinculante durante {{validityDays}} días naturales. Incluye ingeniería, suministro Tier-1, montaje certificado con medidas de seguridad, legalización CIE ante Industria y tramitación de ayudas fiscales municipales.'
        }
      }
    },

    industrial_detallado: {
      id: 'industrial_detallado',
      name: '🏭 Industrial / PYME Bancable (Ingeniería Abierta)',
      builtin: true,
      config: {
        theme: 'sky',
        useCustomColors: false,
        customPrimary: '#0284c7',
        customSecondary: '#38bdf8',
        density: 'compact',
        fontFamily: 'technical',
        fontScale: 96,
        borderStyle: 'sharp',
        inkMode: 'luxury_dark',
        autoFitA4: true,
        headingLineHeight: 1.15,
        headingLetterSpacing: -0.4,
        subtitleLineHeight: 1.28,
        subtitleSpacing: 5,
        bodyLineHeight: 1.42,
        paragraphGap: 8,
        tableLineHeight: 1.22,
        textWrapBalance: true,
        compactKpiBoxes: true,
        paragraphAlign: 'justify',
        useCustomTextColors: false,
        headingTextColor: '#0f172a',
        bodyTextColor: '#334155',
        mutedTextColor: '#64748b',
        economicBreakdown: 'full_open',
        showTaxBenefits: true,
        showFinancingOptions: true,
        sectionOrder: [
          'cover', 'summary', 'bill_audit', 'installation',
          'energy_balance', 'economics', 'packages_comparison',
          'cashflow_25y', 'cel', 'closing'
        ],
        sectionsEnabled: {
          cover: true,
          summary: true,
          bill_audit: true,
          installation: true,
          energy_balance: true,
          packages_comparison: true,
          economics: true,
          cashflow_25y: true,
          cel: false,
          closing: true
        },
        lockedTexts: {
          coverMainTitle: 'PROYECTO INTEGRAL DE | GENERACIÓN RENOVABLE',
          coverSubtitle: 'Estudio de viabilidad técnica, diseño CAD 3D y análisis de rentabilidad para autoconsumo',
          coverLandscapeTitle: 'Autoconsumo Fotovoltaico Industrial',
          useLockedSummary: true,
          summaryTemplate: 'Proyecto de ingeniería energética para {{clientName}} con {{kwp}} kWp solares ({{numPanels}} uds){{windPhrase}}. Optimización directa de costes operativos (OPEX), cobertura de demanda diurna y generación anual certificada de {{annualYield}} kWh/año, logrando un ahorro de {{ahorroAnual}} €/año y amortización en {{payback}} años.',
          useLockedPaymentTerms: true,
          milestone1Pct: 35,
          milestone1Text: 'A la orden de pedido e ingeniería ejecutiva de detalle',
          milestone2Pct: 45,
          milestone2Text: 'A la recepción de equipos en planta y ejecución de obra civil/eléctrica',
          milestone3Pct: 20,
          milestone3Text: 'Al comisionado, pruebas de rendimiento PR y registro oficial CIE',
          validityDays: 15,
          legalNotes: 'Presupuesto técnico-económico abierto conforme a estándares EPC bancables. Precios garantizados durante {{validityDays}} días ante variaciones de mercado de materias primas.'
        }
      }
    },

    hibrido_solar_eolica: {
      id: 'hibrido_solar_eolica',
      name: '🌪️ Híbrido Solar + Minieólica + Autarquía 24h',
      builtin: true,
      config: {
        theme: 'amber',
        useCustomColors: false,
        customPrimary: '#d97706',
        customSecondary: '#0284c7',
        density: 'editorial',
        fontFamily: 'modern',
        fontScale: 100,
        borderStyle: 'rounded',
        inkMode: 'luxury_dark',
        autoFitA4: true,
        headingLineHeight: 1.20,
        headingLetterSpacing: -0.5,
        subtitleLineHeight: 1.36,
        subtitleSpacing: 8,
        bodyLineHeight: 1.54,
        paragraphGap: 12,
        tableLineHeight: 1.32,
        textWrapBalance: true,
        compactKpiBoxes: true,
        paragraphAlign: 'left',
        useCustomTextColors: false,
        headingTextColor: '#0f172a',
        bodyTextColor: '#334155',
        mutedTextColor: '#64748b',
        economicBreakdown: 'full_open',
        showTaxBenefits: true,
        showFinancingOptions: true,
        sectionOrder: [
          'cover', 'summary', 'installation', 'energy_balance',
          'bill_audit', 'packages_comparison', 'economics',
          'cashflow_25y', 'cel', 'closing'
        ],
        sectionsEnabled: {
          cover: true,
          summary: true,
          bill_audit: true,
          installation: true,
          energy_balance: true,
          packages_comparison: true,
          economics: true,
          cashflow_25y: true,
          cel: true,
          closing: true
        },
        lockedTexts: {
          coverMainTitle: 'PROYECTO INTEGRAL DE | GENERACIÓN RENOVABLE',
          coverSubtitle: 'Estudio de viabilidad técnica, diseño CAD 3D y análisis de rentabilidad para autoconsumo',
          coverLandscapeTitle: 'Sistema Híbrido Solar + Minieólica',
          useLockedSummary: true,
          summaryTemplate: 'Sistema híbrido de generación distribuida 24h para {{clientName}} que combina {{numPanels}} módulos solares ({{kwp}} kWp){{windPhrase}}. Maximiza la producción diurna y nocturna alcanzando {{annualYield}} kWh/año, un ahorro de {{ahorroAnual}} €/año y payback de {{payback}} años.',
          useLockedPaymentTerms: true,
          milestone1Pct: 30,
          milestone1Text: 'A la formalización del contrato y acopio de generadores solares/eólicos',
          milestone2Pct: 50,
          milestone2Text: 'Al montaje de estructuras, turbinas, inversores y almacenamiento',
          milestone3Pct: 20,
          milestone3Text: 'A la puesta en marcha híbrida y emisión de boletín oficial CIE',
          validityDays: 30,
          legalNotes: 'Propuesta integral de hibridación energética válida por {{validityDays}} días. Cumple normativa REBT ITC-BT-40, RD 244/2019 y estándares de integración estructural CTE.'
        }
      }
    }
  };

  // ── 4. GESTOR DE ESTADO Y PERSISTENCIA (SSOT) ──────────────────────────────
  function cloneObj(o) {
    return JSON.parse(JSON.stringify(o));
  }

  function createDefaultState() {
    return {
      activePresetId: 'residencial_rapido',
      activeConfig: cloneObj(BUILTIN_PRESETS.residencial_rapido.config),
      customPresets: {}
    };
  }

  var _state = null;

  function loadState() {
    if (_state) return _state;
    var def = createDefaultState();
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          def.activePresetId = parsed.activePresetId || def.activePresetId;
          def.customPresets = (parsed.customPresets && typeof parsed.customPresets === 'object') ? parsed.customPresets : {};
          if (parsed.activeConfig && typeof parsed.activeConfig === 'object') {
            def.activeConfig = mergeConfigWithDefaults(parsed.activeConfig);
          }
        }
      }
    } catch (e) {
      console.warn('[RAProposalStyleStudio] Error leyendo localStorage:', e);
    }
    _state = def;
    return _state;
  }

  function mergeConfigWithDefaults(cfg) {
    var base = cloneObj(BUILTIN_PRESETS.residencial_rapido.config);
    if (!cfg || typeof cfg !== 'object') return base;
    Object.keys(base).forEach(function(k) {
      if (cfg[k] !== undefined && k !== 'sectionsEnabled' && k !== 'lockedTexts' && k !== 'sectionOrder') {
        base[k] = cfg[k];
      }
    });
    if (Array.isArray(cfg.sectionOrder) && cfg.sectionOrder.length > 0) {
      var validIds = CANONICAL_SECTIONS.map(function(s) { return s.id; });
      var order = cfg.sectionOrder.filter(function(id) { return validIds.indexOf(id) !== -1; });
      validIds.forEach(function(id) {
        if (order.indexOf(id) === -1) order.push(id);
      });
      base.sectionOrder = order;
    }
    if (cfg.sectionsEnabled && typeof cfg.sectionsEnabled === 'object') {
      Object.keys(base.sectionsEnabled).forEach(function(sk) {
        if (typeof cfg.sectionsEnabled[sk] === 'boolean') {
          base.sectionsEnabled[sk] = cfg.sectionsEnabled[sk];
        }
      });
    }
    // Salvaguarda anti-bloqueo: asegurar que portada y al menos las secciones troncales estén activas si un estado corrupto dejó solo 1 hoja
    base.sectionsEnabled.cover = true;
    var activeSecCount = Object.keys(base.sectionsEnabled).filter(function(k) { return base.sectionsEnabled[k] !== false; }).length;
    if (activeSecCount <= 1) {
      base.sectionsEnabled.summary = true;
      base.sectionsEnabled.bill_audit = true;
      base.sectionsEnabled.installation = true;
      base.sectionsEnabled.energy_balance = true;
      base.sectionsEnabled.economics = true;
      base.sectionsEnabled.cashflow_25y = true;
      base.sectionsEnabled.closing = true;
    }
    if (cfg.lockedTexts && typeof cfg.lockedTexts === 'object') {
      Object.keys(base.lockedTexts).forEach(function(tk) {
        if (cfg.lockedTexts[tk] !== undefined) {
          base.lockedTexts[tk] = cfg.lockedTexts[tk];
        }
      });
    }
    return base;
  }

  // ── EXTRACTOR AUTOMÁTICO DE COLORES DEL LOGO CORPORATIVO (OFFSCREEN CANVAS) ──
  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(function(v) {
      return Math.min(255, Math.max(0, Math.round(v))).toString(16).padStart(2, '0');
    }).join('');
  }

  function extractColorsFromCompanyLogo(callback) {
    var logoSrc = '';
    try {
      if (global.customCompanyLogoBase64) logoSrc = global.customCompanyLogoBase64;
      if (!logoSrc && global.RACompanyBranding && typeof global.RACompanyBranding.getBranding === 'function') {
        var b = global.RACompanyBranding.getBranding();
        if (b && b.logo) logoSrc = b.logo;
      }
      if (!logoSrc) logoSrc = localStorage.getItem('ra_company_logo') || '';
      if (!logoSrc) {
        var sb = JSON.parse(localStorage.getItem('ra_company_branding') || '{}');
        if (sb && sb.logo) logoSrc = sb.logo;
      }
      if (!logoSrc && global.RA_DEFAULT_COVER_IMAGE) logoSrc = global.RA_DEFAULT_COVER_IMAGE;
      if (!logoSrc) logoSrc = 'assets/coopgreen-cover.jpg';
    } catch (e) {
      logoSrc = 'assets/coopgreen-cover.jpg';
    }

    var fallbackPalette = {
      primary: '#668c37',       // Verde oliva CoopGeeni
      secondary: '#7fa648',     // Verde vivo acento
      headingText: '#493c24',   // Marrón tierra oscuro CoopGeeni
      bodyText: '#333b2c',      // Pizarra oliva oscuro legible
      mutedText: '#668c37'      // Subtítulos verde oliva corporativo
    };

    if (typeof Image === 'undefined' || typeof document === 'undefined') {
      if (typeof callback === 'function') callback(fallbackPalette);
      return;
    }

    var img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = function() {
      try {
        var canvas = document.createElement('canvas');
        var size = 64;
        canvas.width = size;
        canvas.height = size;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, size, size);
        var data = ctx.getImageData(0, 0, size, size).data;

        var darkR = 0, darkG = 0, darkB = 0, darkW = 0;
        var vibR = 0, vibG = 0, vibB = 0, vibW = 0;

        for (var i = 0; i < data.length; i += 4) {
          var r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
          if (a < 110) continue; // Ignorar fondo transparente
          var max = Math.max(r, g, b), min = Math.min(r, g, b);
          var lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
          var sat = max === 0 ? 0 : (max - min) / max;

          // Ignorar blancos y grises muy claros de fondo
          if (lum > 0.87 && sat < 0.18) continue;

          // Cluster 1: Tono oscuro corporativo (para titulares y texto principal)
          if (lum >= 0.08 && lum <= 0.44) {
            var wDark = (1 - lum) * (0.5 + sat);
            darkR += r * wDark;
            darkG += g * wDark;
            darkB += b * wDark;
            darkW += wDark;
          }

          // Cluster 2: Tono vibrante/identidad (para color primario, subtítulos y acentos)
          if (sat >= 0.22 && lum >= 0.24 && lum <= 0.78) {
            var wVib = sat * sat * (1 - Math.abs(lum - 0.50));
            vibR += r * wVib;
            vibG += g * wVib;
            vibB += b * wVib;
            vibW += wVib;
          }
        }

        var primaryHex = vibW > 0 ? rgbToHex(vibR / vibW, vibG / vibW, vibB / vibW) : fallbackPalette.primary;
        var headingHex = darkW > 0 ? rgbToHex(darkR / darkW, darkG / darkW, darkB / darkW) : darkenHex(primaryHex, 0.48);
        var secondaryHex = lightenHex(primaryHex, 0.16);
        var bodyHex = darkenHex(headingHex, 0.12);

        if (typeof callback === 'function') {
          callback({
            primary: primaryHex,
            secondary: secondaryHex,
            headingText: headingHex,
            bodyText: bodyHex,
            mutedText: primaryHex
          });
        }
      } catch (err) {
        if (typeof callback === 'function') callback(fallbackPalette);
      }
    };
    img.onerror = function() {
      if (typeof callback === 'function') callback(fallbackPalette);
    };
    img.src = logoSrc;
  }

  function formatManualLineBreaks(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\s*\|\s*/g, '<br>');
  }

  function saveState() {
    try {
      if (!_state) loadState();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_state));
      syncExternalLegacyState(_state.activeConfig);
      updateStep5IndicatorUI();
    } catch (e) {
      console.warn('[RAProposalStyleStudio] Error guardando localStorage:', e);
    }
  }

  function syncExternalLegacyState(cfg) {
    try {
      // Sincronizar con RACompanyBranding y CommercialProposalDossier para coherencia total
      var storedBranding = JSON.parse(localStorage.getItem('ra_company_branding') || '{}');
      storedBranding.theme = cfg.theme || 'emerald';
      storedBranding.layoutStyle = cfg.density === 'editorial' ? 'editorial' : (cfg.density === 'compact' ? 'technical' : 'infographic');
      localStorage.setItem('ra_company_branding', JSON.stringify(storedBranding));
      if (global.CommercialProposalDossier && typeof global.CommercialProposalDossier.setConfig === 'function') {
        global.CommercialProposalDossier.setConfig({ theme: cfg.theme || 'emerald' });
      }
      if (global.RAPricing && typeof global.RAPricing.saveCommercialConfig === 'function' && typeof global.RAPricing.getCommercialConfig === 'function') {
        var comm = global.RAPricing.getCommercialConfig() || {};
        comm.showThreePackagesComparison = !!(cfg.sectionsEnabled && cfg.sectionsEnabled.packages_comparison);
        comm.includeCEL = !!(cfg.sectionsEnabled && cfg.sectionsEnabled.cel);
        global.RAPricing.saveCommercialConfig(comm);
      }
    } catch (e) {}
  }

  function getActiveConfig() {
    return loadState().activeConfig;
  }

  function getAllPresets() {
    var st = loadState();
    var list = [];
    Object.keys(BUILTIN_PRESETS).forEach(function(k) {
      list.push(BUILTIN_PRESETS[k]);
    });
    Object.keys(st.customPresets || {}).forEach(function(k) {
      list.push(st.customPresets[k]);
    });
    return list;
  }

  function selectPreset(presetId) {
    var st = loadState();
    var target = BUILTIN_PRESETS[presetId] || (st.customPresets && st.customPresets[presetId]);
    if (!target) return false;
    st.activePresetId = presetId;
    st.activeConfig = mergeConfigWithDefaults(cloneObj(target.config));
    saveState();
    return true;
  }

  function saveCustomPreset(name) {
    var cleanName = String(name || '').trim();
    if (!cleanName) return null;
    var st = loadState();
    var id = 'custom_' + Date.now();
    st.customPresets[id] = {
      id: id,
      name: '⭐ ' + cleanName,
      builtin: false,
      config: cloneObj(st.activeConfig)
    };
    st.activePresetId = id;
    saveState();
    return id;
  }

  function deleteCustomPreset(presetId) {
    var st = loadState();
    if (!st.customPresets || !st.customPresets[presetId]) return false;
    delete st.customPresets[presetId];
    if (st.activePresetId === presetId) {
      st.activePresetId = 'residencial_rapido';
      st.activeConfig = cloneObj(BUILTIN_PRESETS.residencial_rapido.config);
    }
    saveState();
    return true;
  }

  // ── 5. GENERADOR DE TOKENS DE ESTILO Y HOJA CSS INYECTABLE ─────────────────
  function hexToRgb(hex) {
    var c = String(hex || '#059669').replace('#', '').trim();
    if (c.length === 3) c = c.split('').map(function(x) { return x + x; }).join('');
    var num = parseInt(c, 16);
    if (isNaN(num)) return '5, 150, 105';
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255].join(', ');
  }

  function lightenHex(hex, factor) {
    var parts = hexToRgb(hex).split(',').map(function(x) { return parseInt(x.trim(), 10); });
    var f = typeof factor === 'number' ? factor : 0.88;
    var r = Math.round(parts[0] + (255 - parts[0]) * f);
    var g = Math.round(parts[1] + (255 - parts[1]) * f);
    var b = Math.round(parts[2] + (255 - parts[2]) * f);
    return '#' + [r, g, b].map(function(v) { return Math.min(255, Math.max(0, v)).toString(16).padStart(2, '0'); }).join('');
  }

  function darkenHex(hex, factor) {
    var parts = hexToRgb(hex).split(',').map(function(x) { return parseInt(x.trim(), 10); });
    var f = typeof factor === 'number' ? factor : 0.35;
    var r = Math.round(parts[0] * (1 - f));
    var g = Math.round(parts[1] * (1 - f));
    var b = Math.round(parts[2] * (1 - f));
    return '#' + [r, g, b].map(function(v) { return Math.min(255, Math.max(0, v)).toString(16).padStart(2, '0'); }).join('');
  }

  function getResolvedPalette(themeOverride) {
    var cfg = getActiveConfig();
    if (cfg.useCustomColors && !themeOverride) {
      var pri = cfg.customPrimary || '#059669';
      var sec = cfg.customSecondary || '#10b981';
      return {
        primary: pri,
        secondary: sec,
        accent: sec,
        light: lightenHex(pri, 0.90),
        text: darkenHex(pri, 0.35),
        dark: darkenHex(pri, 0.45),
        border: lightenHex(pri, 0.65),
        rgbPrimary: hexToRgb(pri)
      };
    }
    var tName = themeOverride || cfg.theme || 'emerald';
    var base = THEME_PALETTES[tName] || THEME_PALETTES.emerald;
    return {
      primary: base.primary,
      secondary: base.secondary,
      accent: base.secondary,
      light: base.light,
      text: base.text,
      dark: base.dark,
      border: base.border,
      rgbPrimary: hexToRgb(base.primary)
    };
  }

  function getFontStack(fontKey) {
    switch (fontKey) {
      case 'technical':
        return '"Space Grotesk", "JetBrains Mono", "Inter", system-ui, sans-serif';
      case 'corporate':
        return 'Georgia, "Times New Roman", "Inter", serif';
      case 'rounded':
        return '"Comfortaa", "Inter", system-ui, sans-serif';
      case 'modern':
      default:
        return '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    }
  }

  function buildInjectedStylesheet(orientation, themeOverride) {
    var cfg = getActiveConfig();
    var pal = getResolvedPalette(themeOverride);
    var scaleRatio = (Number(cfg.fontScale) || 100) / 100;
    var fontStack = getFontStack(cfg.fontFamily);
    var isCompact = cfg.density === 'compact';
    var isEditorial = cfg.density === 'editorial';

    var cardRadius = cfg.borderStyle === 'sharp' ? '2px' : (cfg.borderStyle === 'minimal' ? '6px' : '12px');
    var sheetPadLandscape = isCompact ? '7mm 13mm 7mm 13mm' : (isEditorial ? '12mm 18mm 10mm 18mm' : '9.5mm 15mm 8.5mm 15mm');
    var sheetPadPortrait  = isCompact ? '13mm 15mm' : (isEditorial ? '18mm 20mm' : '15mm 18mm');
    var tablePad = isCompact ? '4px 7px' : (isEditorial ? '8px 11px' : '6px 9px');
    var baseFontLandscape = (14.2 * scaleRatio).toFixed(2) + 'px';
    var baseFontPortrait  = (11.0 * scaleRatio).toFixed(2) + 'px';

    // Parámetros tipográficos por rol de texto
    var hLH = Number(cfg.headingLineHeight) || 1.18;
    var hLS = (cfg.headingLetterSpacing !== undefined ? Number(cfg.headingLetterSpacing) : -0.5) + 'px';
    var subLH = Number(cfg.subtitleLineHeight) || 1.32;
    var subGap = (cfg.subtitleSpacing !== undefined ? Number(cfg.subtitleSpacing) : 6) + 'px';
    var bodyLH = Number(cfg.bodyLineHeight) || 1.48;
    var pGap = (cfg.paragraphGap !== undefined ? Number(cfg.paragraphGap) : 10) + 'px';
    var tblLH = Number(cfg.tableLineHeight) || 1.28;
    var pAlign = cfg.paragraphAlign || 'left';
    var useBalance = cfg.textWrapBalance !== false;
    var compactKpi = cfg.compactKpiBoxes !== false;

    // Colores personalizados de texto por rol
    var useTxtCol = !!cfg.useCustomTextColors;
    var colHead = useTxtCol ? (cfg.headingTextColor || '#0f172a') : null;
    var colBody = useTxtCol ? (cfg.bodyTextColor || '#334155') : null;
    var colMuted = useTxtCol ? (cfg.mutedTextColor || '#64748b') : null;

    var css = [
      '/* === RA PROPOSAL STYLE STUDIO INJECTED CSS === */',
      ':root {',
      '  --ra-prop-primary: ' + pal.primary + ';',
      '  --ra-prop-secondary: ' + pal.secondary + ';',
      '  --ra-prop-light: ' + pal.light + ';',
      '  --ra-prop-dark: ' + pal.dark + ';',
      '  --ra-prop-border: ' + pal.border + ';',
      '  --ra-prop-radius: ' + cardRadius + ';',
      '  --ra-prop-font: ' + fontStack + ';',
      '  --ra-lh-heading: ' + hLH + ';',
      '  --ra-ls-heading: ' + hLS + ';',
      '  --ra-lh-subtitle: ' + subLH + ';',
      '  --ra-lh-body: ' + bodyLH + ';',
      '  --ra-gap-paragraph: ' + pGap + ';',
      '  --ra-lh-table: ' + tblLH + ';',
      '}',
      'body { font-family: ' + fontStack + ' !important; }',
      'h1, h2, h3, .cover-hero-h1, .sheet-title-txt, .decision-title {',
      '  line-height: ' + hLH + ' !important;',
      '  letter-spacing: ' + hLS + ' !important;',
      (useBalance ? '  text-wrap: balance !important;' : ''),
      '}',
      '.cover-hero-sub, .cover-spec-label, .hero-lbl, .closer-hero-lbl, .tech-label, .tech-sub, .company-text .sub {',
      '  line-height: ' + subLH + ' !important;',
      (useBalance ? '  text-wrap: balance !important;' : ''),
      '}',
      '.cover-hero-sub { margin-top: ' + subGap + ' !important; }',
      'p, li, .ra-summary-text, #ra-ai-summary-content {',
      '  line-height: ' + bodyLH + ' !important;',
      '  margin-bottom: ' + pGap + ' !important;',
      '  text-align: ' + pAlign + ' !important;',
      (pAlign === 'justify' ? '  hyphens: auto !important; -webkit-hyphens: auto !important;' : '  hyphens: none !important;'),
      '}',
      'table th, table td, .decision-row, .cover-spec-sub, .closer-hero-sub {',
      '  line-height: ' + tblLH + ' !important;',
      '}'
    ];

    if (useTxtCol && cfg.inkMode !== 'luxury_dark') {
      css.push(
        'h1, h2, h3, .cover-hero-h1, .sheet-title-txt, .company-text .name, .tech-name, .cover-spec-val:not(.primary), .closer-hero-val:not(.primary) { color: ' + colHead + ' !important; }',
        'p, li, td, .decision-row, #ra-ai-summary-content, .gantt-label { color: ' + colBody + ' !important; }',
        '.cover-hero-sub, .cover-spec-label, .cover-spec-sub, .hero-lbl, .closer-hero-lbl, .closer-hero-sub, .tech-label, .tech-sub, .company-text .sub, .cover-brand-meta { color: ' + colMuted + ' !important; }'
      );
    } else if (useTxtCol && cfg.inkMode === 'luxury_dark') {
      css.push(
        '.sheet:not([data-section-id="cover"]) h1, .sheet:not([data-section-id="cover"]) h2, .sheet:not([data-section-id="cover"]) .sheet-title-txt, .page-sheet:not(.cover-page) h1, .page-sheet:not(.cover-page) h2, .page-sheet:not(.cover-page) .tech-name { color: ' + colHead + ' !important; }',
        '.sheet:not([data-section-id="cover"]) p, .sheet:not([data-section-id="cover"]) td, .page-sheet:not(.cover-page) p, .page-sheet:not(.cover-page) td, #ra-ai-summary-content { color: ' + colBody + ' !important; }',
        '.sheet:not([data-section-id="cover"]) .hero-lbl, .page-sheet:not(.cover-page) .tech-label, .page-sheet:not(.cover-page) .tech-sub, .page-sheet:not(.cover-page) .company-text .sub { color: ' + colMuted + ' !important; }'
      );
    }

    if (orientation === 'landscape') {
      css.push(
        '.sheet { font-family: ' + fontStack + ' !important; padding: ' + sheetPadLandscape + ' !important; font-size: ' + baseFontLandscape + ' !important; }',
        '.card { border-radius: ' + cardRadius + ' !important; padding: ' + (isCompact ? '8px 12px' : (isEditorial ? '14px 18px' : '11px 15px')) + ' !important; }',
        '.table-clean th, .table-clean td { padding: ' + tablePad + ' !important; font-size: ' + (12.8 * scaleRatio).toFixed(1) + 'px !important; line-height: ' + tblLH + ' !important; }'
      );
      if (cfg.borderStyle === 'minimal') {
        css.push('.card { border: 1px solid #f1f5f9 !important; background-image: none !important; box-shadow: 0 2px 8px rgba(0,0,0,0.03) !important; }');
      } else if (cfg.borderStyle === 'sharp') {
        css.push('.card { border-radius: 2px !important; box-shadow: none !important; }');
      }
      if (cfg.inkMode === 'luxury_dark') {
        css.push(
          '.sheet[data-section-id="cover"] { background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%) !important; color: #f8fafc !important; }',
          '.sheet[data-section-id="cover"] h1 { color: #ffffff !important; }',
          '.sheet[data-section-id="cover"] p { color: #cbd5e1 !important; }'
        );
      }
    } else {
      css.push(
        '.page-sheet { font-family: ' + fontStack + ' !important; padding: ' + sheetPadPortrait + ' !important; font-size: ' + baseFontPortrait + ' !important; }',
        '.tech-card, .hero-card, .closer-hero-card, .decision-card, .cover-spec-box, .cover-client-card, .chart-box { border-radius: ' + cardRadius + ' !important; }',
        'table th, table td { padding: ' + tablePad + ' !important; font-size: ' + (10.5 * scaleRatio).toFixed(1) + 'px !important; line-height: ' + tblLH + ' !important; }',
        'h2 { margin: ' + (isCompact ? '10px 0 6px' : (isEditorial ? '18px 0 10px' : '13px 0 8px')) + ' !important; font-size: ' + (12.8 * scaleRatio).toFixed(1) + 'px !important; }'
      );
      // Compactación inteligente de Portada Vertical para que las 4 cajas KPI y el pie jamás se corten
      if (compactKpi) {
        css.push(
          '.page-sheet.cover-page { padding: 15mm 18mm 13mm !important; }',
          '.cover-brand-row { padding-bottom: 12px !important; }',
          '.cover-hero-title { margin: 11px 0 9px !important; }',
          '.cover-hero-h1 { font-size: ' + (23.5 * scaleRatio).toFixed(1) + 'px !important; }',
          '.cover-photo-card { height: 58mm !important; margin: 8px 0 10px !important; }',
          '.cover-specs-grid { gap: 9px !important; margin: 5px 0 8px !important; }',
          '.cover-spec-box { min-height: 92px !important; padding: 8px 6px !important; }',
          '.cover-spec-icon { width: 40px !important; height: 40px !important; margin-bottom: 5px !important; border-radius: 10px !important; }',
          '.cover-spec-label { font-size: 8.8px !important; line-height: 1.22 !important; margin-bottom: 3px !important; }',
          '.cover-spec-val { font-size: 16.5px !important; line-height: 1.15 !important; white-space: nowrap !important; }',
          '.cover-spec-sub { font-size: 8.3px !important; line-height: 1.2 !important; margin-top: 3px !important; }',
          '.cover-footer { padding-top: 9px !important; }'
        );
      }
      if (cfg.borderStyle === 'minimal') {
        css.push('.tech-card, .hero-card, .closer-hero-card, .decision-card, .cover-spec-box { border-color: #f1f5f9 !important; box-shadow: none !important; }');
      }
      if (cfg.inkMode === 'luxury_dark') {
        css.push(
          '.page-sheet.cover-page { background: linear-gradient(160deg, #0f172a 0%, #1e293b 100%) !important; color: #f8fafc !important; }',
          '.page-sheet.cover-page .cover-hero-h1, .page-sheet.cover-page .cover-brand-row div, .page-sheet.cover-page .cover-spec-val:not(.primary) { color: #f8fafc !important; }',
          '.page-sheet.cover-page .cover-hero-sub, .page-sheet.cover-page .cover-brand-meta, .page-sheet.cover-page .cover-spec-label, .page-sheet.cover-page .cover-spec-sub { color: #cbd5e1 !important; }',
          '.page-sheet.cover-page .cover-spec-box:not(.highlight) { background: rgba(30,41,59,0.85) !important; border-color: #334155 !important; }',
          '.page-sheet.cover-page .cover-spec-icon { background: #0f172a !important; border-color: #334155 !important; }'
        );
      }
    }

    // Reglas según nivel de desglose económico
    if (cfg.economicBreakdown === 'turnkey_only') {
      css.push(
        '.ra-econ-item-price { visibility: hidden !important; }',
        '.ra-econ-unit-price { display: none !important; }',
        '.ra-econ-item-row td:last-child { color: transparent !important; user-select: none !important; }',
        '.ra-econ-item-row td:last-child::after { content: "Incluido"; visibility: visible !important; color: #64748b !important; font-size: 10px !important; font-weight: 700 !important; }'
      );
    } else if (cfg.economicBreakdown === 'chapters_units') {
      css.push(
        '.ra-econ-unit-price { display: none !important; }'
      );
    }

    if (!cfg.showTaxBenefits) {
      css.push('.ra-tax-benefits-block { display: none !important; }');
    }
    if (!cfg.showFinancingOptions) {
      css.push('.ra-financing-options-block { display: none !important; }');
    }

    return css.join('\n');
  }

  // ── 6. INTERPOLADOR INTELIGENTE DE PLANTILLAS DE TEXTO ─────────────────────
  function interpolateText(templateStr, ctx) {
    if (!templateStr) return '';
    var c = ctx || {};
    var windCount = Number(c.windCount || 0);
    var windKw = Number(c.windKw || 0);
    var windPhrase = (windCount > 0)
      ? (' y ' + windCount + ' aerogenerador(es) minieólicos (' + windKw.toFixed(1) + ' kW)')
      : '';

    var map = {
      kwp: c.kwp !== undefined ? c.kwp : '0.00',
      numPanels: c.numPanels !== undefined ? c.numPanels : '0',
      windCount: windCount,
      windKw: windKw.toFixed(1),
      windPhrase: windPhrase,
      annualYield: c.annualYield !== undefined ? c.annualYield : '0',
      ahorroAnual: c.ahorroAnual !== undefined ? c.ahorroAnual : '0',
      payback: c.payback !== undefined ? c.payback : '0.0',
      capexBruto: c.capexBruto !== undefined ? c.capexBruto : '0',
      capexNeto: c.capexNeto !== undefined ? c.capexNeto : '0',
      clientName: c.clientName || 'Cliente',
      companyName: c.companyName || 'Empresa Instaladora',
      validityDays: (getActiveConfig().lockedTexts && getActiveConfig().lockedTexts.validityDays) || 30
    };

    return String(templateStr).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, function(match, key) {
      return map[key] !== undefined ? String(map[key]) : match;
    });
  }

  // ── 7. MOTOR DE AUTO-ENCAJE A4 ("GUARDIÁN ANTI-DESBORDE") ──────────────────
  function getAutoFitClientScript(sheetSelector) {
    var cfg = getActiveConfig();
    if (!cfg.autoFitA4) return '';
    var sel = sheetSelector || '.sheet, .page-sheet';
    return [
      '(function() {',
      '  function applyManualPipeBreaks() {',
      '    document.querySelectorAll("h1, h2, .cover-hero-h1, .cover-hero-sub, .sheet-title-txt").forEach(function(el) {',
      '      if (el.innerHTML && el.innerHTML.indexOf("|") !== -1) {',
      '        el.innerHTML = el.innerHTML.replace(/\\s*\\|\\s*/g, "<br>");',
      '      }',
      '    });',
      '  }',
      '  function runA4AutoFit() {',
      '    applyManualPipeBreaks();',
      '    var sheets = document.querySelectorAll(' + JSON.stringify(sel) + ');',
      '    sheets.forEach(function(sheet) {',
      '      sheet.style.zoom = "";',
      '      var maxIter = 8;',
      '      var iter = 0;',
      '      while (sheet.scrollHeight > sheet.clientHeight + 2 && iter < maxIter) {',
      '        iter++;',
      '        var ratio = sheet.clientHeight / sheet.scrollHeight;',
      '        if (iter === 1) {',
      '          var coverPhoto = sheet.querySelector(".cover-photo-card");',
      '          if (coverPhoto) {',
      '            coverPhoto.style.height = "52mm";',
      '            coverPhoto.style.margin = "6px 0 8px";',
      '          }',
      '          sheet.querySelectorAll(".cover-spec-box").forEach(function(sb) {',
      '            sb.style.minHeight = "84px";',
      '            sb.style.padding = "6px 5px";',
      '          });',
      '          sheet.querySelectorAll("table td, table th").forEach(function(cell) {',
      '            cell.style.paddingTop = "3px";',
      '            cell.style.paddingBottom = "3px";',
      '          });',
      '          sheet.querySelectorAll(".card, .tech-card, .chart-box, .decision-card").forEach(function(box) {',
      '            box.style.paddingTop = "7px";',
      '            box.style.paddingBottom = "7px";',
      '            box.style.marginBottom = "6px";',
      '          });',
      '        } else {',
      '          var curZoom = parseFloat(sheet.getAttribute("data-autofit-zoom") || "1");',
      '          var nextZoom = Math.max(0.78, Math.min(curZoom - 0.03, ratio * 0.985));',
      '          sheet.setAttribute("data-autofit-zoom", nextZoom.toFixed(3));',
      '          sheet.style.zoom = nextZoom.toFixed(3);',
      '          break;',
      '        }',
      '      }',
      '      var warn = sheet.querySelector(".dossier-overflow-warn");',
      '      if (warn && sheet.scrollHeight <= sheet.clientHeight + 4) warn.remove();',
      '    });',
      '  }',
      '  window.RA_runA4AutoFit = runA4AutoFit;',
      '  window.addEventListener("load", function() { setTimeout(runA4AutoFit, 120); setTimeout(runA4AutoFit, 450); });',
      '  window.addEventListener("beforeprint", runA4AutoFit);',
      '  setTimeout(runA4AutoFit, 80);',
      '})();'
    ].join('\n');
  }

  // ── 8. ORDENADOR Y FILTRO DOM DE SECCIONES A4 ──────────────────────────────
  function getSectionPaginationAndOrderScript(sheetSelector) {
    var cfg = getActiveConfig();
    var sel = sheetSelector || '.sheet, .page-sheet';
    var orderJson = JSON.stringify(cfg.sectionOrder || []);
    var enabledJson = JSON.stringify(cfg.sectionsEnabled || {});

    return [
      '(function() {',
      '  function applyStudioSectionLayout() {',
      '    var order = ' + orderJson + ';',
      '    var enabled = ' + enabledJson + ';',
      '    var sheets = Array.prototype.slice.call(document.querySelectorAll(' + JSON.stringify(sel) + '));',
      '    if (!sheets.length) return;',
      '    var parent = sheets[0].parentNode;',
      '    if (!parent) return;',
      '    // Salvaguarda: contar cuántas hojas quedarían si aplicamos el filtro',
      '    var willRemainCount = sheets.filter(function(sh) {',
      '      var secId = sh.getAttribute("data-section-id");',
      '      return !(secId && secId !== "cover" && enabled[secId] === false);',
      '    }).length;',
      '    // 1. Filtrar hojas desactivadas (nunca eliminar la portada ni dejar el documento en 1 sola hoja por error)',
      '    if (willRemainCount > 1) {',
      '      sheets.forEach(function(sh) {',
      '        var secId = sh.getAttribute("data-section-id");',
      '        if (secId && secId !== "cover" && enabled[secId] === false) {',
      '          sh.remove();',
      '        }',
      '      });',
      '    }',
      '    // 2. Reordenar según orden canónico del estudio',
      '    var remaining = Array.prototype.slice.call(document.querySelectorAll(' + JSON.stringify(sel) + '));',
      '    remaining.sort(function(a, b) {',
      '      var idA = a.getAttribute("data-section-id") || "";',
      '      var idB = b.getAttribute("data-section-id") || "";',
      '      var idxA = order.indexOf(idA);',
      '      var idxB = order.indexOf(idB);',
      '      if (idxA === -1) idxA = 999;',
      '      if (idxB === -1) idxB = 999;',
      '      return idxA - idxB;',
      '    });',
      '    remaining.forEach(function(sh) { parent.appendChild(sh); });',
      '    // 3. Recalcular numeración de páginas/láminas',
      '    var total = remaining.length;',
      '    var numSlideIdx = 1;',
      '    remaining.forEach(function(sh, i) {',
      '      var secId = sh.getAttribute("data-section-id");',
      '      if (secId !== "cover") {',
      '        var numStr = String(numSlideIdx++).padStart(2, "0");',
      '        var numEl = sh.querySelector(".sheet-title-num");',
      '        if (numEl) numEl.textContent = numStr + ".";',
      '      }',
      '      sh.querySelectorAll(".doc-ref-box").forEach(function(refBox) {',
      '        refBox.innerHTML = refBox.innerHTML.replace(/Hoja\\s+\\d+\\s+de\\s+\\d+/i, "Hoja " + (i + 1) + " de " + total);',
      '      });',
      '      sh.querySelectorAll(".cover-brand-meta div").forEach(function(dEl) {',
      '        if (/Hoja\\s+\\d+\\s+de\\s+\\d+/i.test(dEl.textContent)) {',
      '          dEl.textContent = "Hoja " + (i + 1) + " de " + total;',
      '        }',
      '      });',
      '    });',
      '  }',
      '  if (document.readyState === "loading") {',
      '    document.addEventListener("DOMContentLoaded", applyStudioSectionLayout);',
      '  } else {',
      '    applyStudioSectionLayout();',
      '  }',
      '})();'
    ].join('\n');
  }

  // ── 9. SINCRONIZACIÓN DE UI EN PASO 5 ──────────────────────────────────────
  function updateStep5IndicatorUI() {
    ensureStep5StudioControlsMounted();
    var st = loadState();
    var sel = document.getElementById('step5-style-preset-select');
    if (sel) {
      var presets = getAllPresets();
      sel.innerHTML = presets.map(function(p) {
        return '<option value="' + p.id + '" ' + (p.id === st.activePresetId ? 'selected' : '') + '>' + p.name + '</option>';
      }).join('');
    }
    var badge = document.getElementById('step5-style-studio-badge');
    if (badge) {
      var cfg = st.activeConfig;
      var activeCount = Object.keys(cfg.sectionsEnabled || {}).filter(function(k) { return cfg.sectionsEnabled[k]; }).length;
      badge.textContent = 'Estilo (' + activeCount + ' secc.)';
    }
  }

  function ensureStep5StudioControlsMounted() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('step5-style-preset-select')) return;
    var hubCard = document.getElementById('step5-commercial-hub-card');
    var dlBtn = document.getElementById('step5-btn-download-commercial');
    if (!hubCard && !dlBtn) return;

    var bar = document.createElement('div');
    bar.id = 'step5-style-studio-bar';
    bar.style.cssText = 'display:grid;grid-template-columns:1.25fr 1fr;gap:5px;margin-bottom:6px;';
    bar.innerHTML = [
      '<select id="step5-style-preset-select" style="width:100%;padding:6px 7px;background:rgba(15,23,42,0.95);border:1px solid rgba(56,189,248,0.35);border-radius:5px;color:#e2e8f0;font-size:9.5px;font-weight:700;outline:none;cursor:pointer;" title="Perfil rápido de maquetación y estilo para ambos presupuestos">',
      '</select>',
      '<button type="button" id="step5-btn-open-style-studio" class="doc-mini-btn" style="padding:6px 6px;font-size:9.5px;font-weight:800;background:rgba(56,189,248,0.12);border:1px solid rgba(56,189,248,0.4);color:#38BDF8;display:flex;align-items:center;justify-content:center;gap:4px;border-radius:5px;cursor:pointer;" title="Configurar estilos, densidad, tipografía, orden de secciones y desglose para presupuestos Horizontal y Vertical">',
      '  <span>🎨</span> <span id="step5-style-studio-badge">Maquetación</span>',
      '</button>'
    ].join('');

    if (dlBtn && dlBtn.parentNode) {
      dlBtn.parentNode.insertBefore(bar, dlBtn.nextSibling);
    } else if (hubCard) {
      hubCard.appendChild(bar);
    }

    var sel = bar.querySelector('#step5-style-preset-select');
    if (sel) {
      sel.onchange = function() {
        selectPreset(this.value);
        if (global.showToast) global.showToast('PERFIL DE ESTILO ACTIVO', 'Plantilla aplicada para presupuestos Horizontal y Vertical', 'info', 2000);
      };
    }
    var btn = bar.querySelector('#step5-btn-open-style-studio');
    if (btn) {
      btn.onclick = function() { openModal(); };
    }
  }

  // ── 10. MODAL DE INTERFAZ DE USUARIO ("ESTUDIO MAESTRO DE MAQUETACIÓN") ────
  var _activeModalTab = 'visual'; // visual | sections | economics | texts

  function openModal(onApplyCallback) {
    var existing = document.getElementById('ra-proposal-style-studio-modal');
    if (existing) existing.remove();

    var st = loadState();
    var cfg = st.activeConfig;

    var modal = document.createElement('div');
    modal.id = 'ra-proposal-style-studio-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(2,6,23,0.86);backdrop-filter:blur(8px);z-index:999999;display:flex;align-items:center;justify-content:center;padding:16px;font-family:Inter,system-ui,sans-serif;color:#f8fafc;';

    modal.innerHTML = buildModalHTML();
    document.body.appendChild(modal);
    bindModalEvents(modal, onApplyCallback);
  }

  function buildModalHTML() {
    var st = loadState();
    var cfg = st.activeConfig;
    var presets = getAllPresets();
    var pal = getResolvedPalette();

    var presetOptions = presets.map(function(p) {
      return '<option value="' + p.id + '" ' + (p.id === st.activePresetId ? 'selected' : '') + '>' + p.name + '</option>';
    }).join('');

    var isCustomPreset = st.activePresetId && String(st.activePresetId).indexOf('custom_') === 0;

    return [
      '<div style="background:#0f172a;border:1px solid rgba(56,189,248,0.3);border-radius:14px;width:100%;max-width:860px;max-height:92vh;display:flex;flex-direction:column;box-shadow:0 25px 60px rgba(0,0,0,0.75);overflow:hidden;">',

      // Header
      '  <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 20px;background:linear-gradient(90deg,#0f172a,#1e293b);border-bottom:1px solid rgba(255,255,255,0.1);">',
      '    <div style="display:flex;align-items:center;gap:12px;">',
      '      <div style="width:36px;height:36px;border-radius:9px;background:linear-gradient(135deg,' + pal.primary + ',' + pal.secondary + ');display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 4px 12px rgba(0,0,0,0.3);">🎨</div>',
      '      <div>',
      '        <h3 style="margin:0;font-size:15px;font-weight:900;color:#fff;letter-spacing:0.3px;">ESTUDIO MAESTRO DE MAQUETACIÓN & ESTILOS (HORIZONTAL + VERTICAL)</h3>',
      '        <div style="font-size:11px;color:#94a3b8;margin-top:2px;">Configura una sola vez: ambos presupuestos se generarán en 1 clic sin desbordes ni retoques manuales</div>',
      '      </div>',
      '    </div>',
      '    <button type="button" id="pss-btn-close" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);color:#cbd5e1;width:32px;height:32px;border-radius:8px;cursor:pointer;font-weight:900;font-size:14px;">✕</button>',
      '  </div>',

      // Barra superior de Perfiles (Presets)
      '  <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;padding:10px 20px;background:#1e293b;border-bottom:1px solid rgba(255,255,255,0.08);">',
      '    <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:260px;">',
      '      <span style="font-size:11px;font-weight:800;color:#38bdf8;text-transform:uppercase;white-space:nowrap;">⚡ Perfil Activo:</span>',
      '      <select id="pss-preset-select" style="flex:1;padding:7px 10px;background:#0f172a;border:1px solid #475569;border-radius:6px;color:#f8fafc;font-size:12px;font-weight:700;outline:none;">',
               presetOptions,
      '      </select>',
      '    </div>',
      '    <div style="display:flex;align-items:center;gap:6px;">',
      '      <button type="button" id="pss-btn-save-preset" style="padding:6px 11px;background:rgba(16,185,129,0.15);border:1px solid #10b981;color:#34d399;border-radius:6px;font-size:11px;font-weight:800;cursor:pointer;">+ Guardar como Perfil</button>',
      (isCustomPreset ? '<button type="button" id="pss-btn-del-preset" style="padding:6px 10px;background:rgba(239,68,68,0.15);border:1px solid #ef4444;color:#f87171;border-radius:6px;font-size:11px;font-weight:800;cursor:pointer;">🗑 Eliminar</button>' : ''),
      '    </div>',
      '  </div>',

      // Navegación de Pestañas
      '  <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:4px;padding:8px 20px;background:#0f172a;border-bottom:1px solid rgba(255,255,255,0.08);">',
      buildTabButton('visual',     '1. Paleta & Densidad',       '🎨'),
      buildTabButton('typography', '2. Interlineado & Textos',   '🔤'),
      buildTabButton('sections',   '3. Secciones & Orden',       '📑'),
      buildTabButton('economics',  '4. Desglose Económico',      '💶'),
      buildTabButton('texts',      '5. Plantillas & Cierre',     '✍️'),
      '  </div>',

      // Cuerpo del Modal
      '  <div id="pss-modal-body" style="padding:18px 20px;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:14px;">',
      buildActiveTabContent(cfg, pal),
      '  </div>',

      // Footer con acciones directas 1-Clic
      '  <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:10px;padding:12px 20px;background:#1e293b;border-top:1px solid rgba(255,255,255,0.1);">',
      '    <div style="display:flex;align-items:center;gap:8px;">',
      '      <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + (cfg.autoFitA4 ? '#10b981' : '#f59e0b') + ';"></span>',
      '      <span style="font-size:11px;color:#cbd5e1;font-weight:600;">' + (cfg.autoFitA4 ? 'Guardián Anti-Desborde A4 Activo (0 páginas cortadas)' : 'Escalado manual estándar') + '</span>',
      '    </div>',
      '    <div style="display:flex;gap:8px;align-items:center;">',
      '      <button type="button" id="pss-btn-emit-landscape" style="padding:8px 14px;background:#0f172a;border:1px solid #38bdf8;color:#38bdf8;border-radius:6px;font-size:11.5px;font-weight:800;cursor:pointer;">🖥️ Probar Horizontal</button>',
      '      <button type="button" id="pss-btn-emit-portrait" style="padding:8px 14px;background:#0f172a;border:1px solid #a78bfa;color:#c4b5fd;border-radius:6px;font-size:11.5px;font-weight:800;cursor:pointer;">📄 Probar Vertical</button>',
      '      <button type="button" id="pss-btn-save-close" style="padding:9px 20px;background:linear-gradient(135deg,#10b981,#059669);border:none;color:#fff;border-radius:6px;font-size:12px;font-weight:900;cursor:pointer;box-shadow:0 4px 14px rgba(16,185,129,0.35);">✓ GUARDAR ESTILO MAESTRO</button>',
      '    </div>',
      '  </div>',

      '</div>'
    ].join('\n');
  }

  function buildTabButton(tabId, label, icon) {
    var active = _activeModalTab === tabId;
    var bg = active ? 'rgba(56,189,248,0.18)' : 'rgba(255,255,255,0.03)';
    var border = active ? '#38bdf8' : 'rgba(255,255,255,0.08)';
    var col = active ? '#38bdf8' : '#94a3b8';
    return '<button type="button" class="pss-tab-btn" data-tab="' + tabId + '" style="padding:8px 10px;background:' + bg + ';border:1px solid ' + border + ';color:' + col + ';border-radius:7px;font-size:11.5px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;transition:all 0.15s;">' +
      '<span>' + icon + '</span><span>' + label + '</span></button>';
  }

  function buildActiveTabContent(cfg, pal) {
    if (_activeModalTab === 'typography') return buildTypographyTabHTML(cfg, pal);
    if (_activeModalTab === 'sections') return buildSectionsTabHTML(cfg);
    if (_activeModalTab === 'economics') return buildEconomicsTabHTML(cfg);
    if (_activeModalTab === 'texts') return buildTextsTabHTML(cfg);
    return buildVisualTabHTML(cfg, pal);
  }

  function buildTypographyTabHTML(cfg, pal) {
    var lt = cfg.lockedTexts || {};
    var hLH = Number(cfg.headingLineHeight) || 1.18;
    var hLS = cfg.headingLetterSpacing !== undefined ? Number(cfg.headingLetterSpacing) : -0.5;
    var subLH = Number(cfg.subtitleLineHeight) || 1.32;
    var subGap = cfg.subtitleSpacing !== undefined ? Number(cfg.subtitleSpacing) : 6;
    var bodyLH = Number(cfg.bodyLineHeight) || 1.48;
    var pGap = cfg.paragraphGap !== undefined ? Number(cfg.paragraphGap) : 10;
    var tblLH = Number(cfg.tableLineHeight) || 1.28;
    var pAlign = cfg.paragraphAlign || 'left';
    var useBalance = cfg.textWrapBalance !== false;
    var compactKpi = cfg.compactKpiBoxes !== false;
    var useTxtCol = !!cfg.useCustomTextColors;
    var colHead = cfg.headingTextColor || '#0f172a';
    var colBody = cfg.bodyTextColor || '#334155';
    var colMuted = cfg.mutedTextColor || '#64748b';
    var coverTitleVal = lt.coverMainTitle || 'PROYECTO INTEGRAL DE | GENERACIÓN RENOVABLE';
    var coverSubVal = lt.coverSubtitle || 'Estudio de viabilidad técnica, diseño CAD 3D y análisis de rentabilidad para autoconsumo';

    var previewHeadCol = useTxtCol ? colHead : '#0f172a';
    var previewBodyCol = useTxtCol ? colBody : '#334155';
    var previewMutedCol = useTxtCol ? colMuted : '#64748b';
    var previewHtmlTitle = formatManualLineBreaks(coverTitleVal);

    return [
      // 1. VISTA PREVIA EN TIEMPO REAL
      '<div style="background:#ffffff;border:2px solid ' + pal.primary + ';border-radius:10px;padding:14px 18px;color:#0f172a;box-shadow:0 8px 25px rgba(0,0,0,0.35);">',
      '  <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid ' + pal.primary + ';padding-bottom:6px;margin-bottom:10px;">',
      '    <span style="font-size:10px;font-weight:900;color:' + pal.primary + ';letter-spacing:0.8px;text-transform:uppercase;">👁️ VISTA PREVIA EN VIVO (PORTADA & PÁRRAFOS)</span>',
      '    <span style="font-size:9.5px;font-weight:800;background:' + pal.light + ';color:' + pal.dark + ';padding:2px 8px;border-radius:4px;">SIMULACIÓN A4 REAL</span>',
      '  </div>',
      '  <div id="pss-live-preview-box" style="font-family:' + getFontStack(cfg.fontFamily).replace(/"/g, "'") + ';">',
      '    <div id="pss-prev-h1" style="font-size:19px;font-weight:900;text-align:center;text-transform:uppercase;color:' + previewHeadCol + ';line-height:' + hLH + ';letter-spacing:' + hLS + 'px;' + (useBalance ? 'text-wrap:balance;' : '') + '">' + previewHtmlTitle + '</div>',
      '    <div id="pss-prev-sub" style="font-size:11.5px;font-weight:600;text-align:center;color:' + previewMutedCol + ';line-height:' + subLH + ';margin-top:' + subGap + 'px;margin-bottom:10px;' + (useBalance ? 'text-wrap:balance;' : '') + '">' + formatManualLineBreaks(coverSubVal) + '</div>',
      '    <p id="pss-prev-p1" style="font-size:11px;color:' + previewBodyCol + ';line-height:' + bodyLH + ';margin:0 0 ' + pGap + 'px 0;text-align:' + pAlign + ';">Propuesta técnica llave en mano diseñada mediante gemelo digital 3D. Optimiza la captación solar e integra almacenamiento inteligente para maximizar el ahorro desde el primer día.</p>',
      '    <p id="pss-prev-p2" style="font-size:11px;color:' + previewBodyCol + ';line-height:' + bodyLH + ';margin:0 0 10px 0;text-align:' + pAlign + ';">Todos los componentes cumplen normativa REBT ITC-BT-40 y cuentan con garantía oficial de rendimiento de 25 años.</p>',
      '    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;border-top:1px solid #e2e8f0;padding-top:8px;">',
      '      <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:6px;padding:6px;text-align:center;">',
      '        <div class="pss-prev-kpi-lbl" style="font-size:8.5px;font-weight:800;color:' + previewMutedCol + ';line-height:' + subLH + ';">POTENCIA HÍBRIDA TOTAL</div>',
      '        <div class="pss-prev-kpi-val" style="font-size:13px;font-weight:900;color:' + previewHeadCol + ';line-height:' + tblLH + ';">102,94 kW</div>',
      '      </div>',
      '      <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:6px;padding:6px;text-align:center;">',
      '        <div class="pss-prev-kpi-lbl" style="font-size:8.5px;font-weight:800;color:' + previewMutedCol + ';line-height:' + subLH + ';">PRODUCCIÓN ANUAL</div>',
      '        <div style="font-size:13px;font-weight:900;color:' + pal.primary + ';line-height:' + tblLH + ';">211.597 kWh</div>',
      '      </div>',
      '      <div style="background:' + pal.light + ';border:1.5px solid ' + pal.primary + ';border-radius:6px;padding:6px;text-align:center;">',
      '        <div class="pss-prev-kpi-lbl" style="font-size:8.5px;font-weight:800;color:' + pal.dark + ';line-height:' + subLH + ';">INVERSIÓN LLAVE EN MANO</div>',
      '        <div style="font-size:13px;font-weight:900;color:' + pal.dark + ';line-height:' + tblLH + ';">110.451 €</div>',
      '      </div>',
      '    </div>',
      '  </div>',
      '</div>',

      // 2. CONTROLES DE INTERLINEADO Y ESPACIADO ENTRE LÍNEAS / PÁRRAFOS
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">',
      '  <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px 14px;">',
      '    <div style="font-size:11.5px;font-weight:800;color:#38bdf8;margin-bottom:8px;">📏 INTERLINEADO POR ROL DE TEXTO</div>',
      '    <div style="margin-bottom:8px;">',
      '      <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px;">',
      '        <span style="color:#cbd5e1;font-weight:700;">Interlineado Titulares (H1/H2):</span>',
      '        <span id="pss-val-hlh" style="color:#38bdf8;font-weight:900;">' + hLH.toFixed(2) + '</span>',
      '      </div>',
      '      <input type="range" id="pss-heading-lh" min="1.00" max="1.55" step="0.02" value="' + hLH + '" style="width:100%;accent-color:#38bdf8;cursor:pointer;">',
      '    </div>',
      '    <div style="margin-bottom:8px;">',
      '      <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px;">',
      '        <span style="color:#cbd5e1;font-weight:700;">Interlineado Subtítulos y Cajas:</span>',
      '        <span id="pss-val-sublh" style="color:#38bdf8;font-weight:900;">' + subLH.toFixed(2) + '</span>',
      '      </div>',
      '      <input type="range" id="pss-subtitle-lh" min="1.05" max="1.65" step="0.02" value="' + subLH + '" style="width:100%;accent-color:#38bdf8;cursor:pointer;">',
      '    </div>',
      '    <div>',
      '      <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px;">',
      '        <span style="color:#cbd5e1;font-weight:700;">Interlineado Párrafos (Cuerpo):</span>',
      '        <span id="pss-val-bodylh" style="color:#34d399;font-weight:900;">' + bodyLH.toFixed(2) + '</span>',
      '      </div>',
      '      <input type="range" id="pss-body-lh" min="1.15" max="1.95" step="0.02" value="' + bodyLH + '" style="width:100%;accent-color:#10b981;cursor:pointer;">',
      '    </div>',
      '  </div>',

      '  <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px 14px;">',
      '    <div style="font-size:11.5px;font-weight:800;color:#f59e0b;margin-bottom:8px;">↔️ ESPACIADO ENTRE PÁRRAFOS Y LÍNEAS</div>',
      '    <div style="margin-bottom:8px;">',
      '      <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px;">',
      '        <span style="color:#cbd5e1;font-weight:700;">Separación entre Párrafos:</span>',
      '        <span id="pss-val-pgap" style="color:#f59e0b;font-weight:900;">' + pGap + ' px</span>',
      '      </div>',
      '      <input type="range" id="pss-paragraph-gap" min="2" max="24" step="1" value="' + pGap + '" style="width:100%;accent-color:#f59e0b;cursor:pointer;">',
      '    </div>',
      '    <div style="margin-bottom:8px;">',
      '      <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px;">',
      '        <span style="color:#cbd5e1;font-weight:700;">Espacio Título ↔ Subtítulo:</span>',
      '        <span id="pss-val-subgap" style="color:#f59e0b;font-weight:900;">' + subGap + ' px</span>',
      '      </div>',
      '      <input type="range" id="pss-subtitle-gap" min="2" max="18" step="1" value="' + subGap + '" style="width:100%;accent-color:#f59e0b;cursor:pointer;">',
      '    </div>',
      '    <div>',
      '      <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px;">',
      '        <span style="color:#cbd5e1;font-weight:700;">Interlineado en Tablas y Cifras:</span>',
      '        <span id="pss-val-tbllh" style="color:#f59e0b;font-weight:900;">' + tblLH.toFixed(2) + '</span>',
      '      </div>',
      '      <input type="range" id="pss-table-lh" min="1.05" max="1.60" step="0.02" value="' + tblLH + '" style="width:100%;accent-color:#f59e0b;cursor:pointer;">',
      '    </div>',
      '  </div>',
      '</div>',

      // 3. COLORES DE TEXTO Y SINCRONIZACIÓN CON LOGO ("COOPGEENI")
      '<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px 14px;">',
      '  <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px;">',
      '    <label style="display:inline-flex;align-items:center;gap:8px;font-size:12px;font-weight:800;color:#c084fc;cursor:pointer;">',
      '      <input type="checkbox" id="pss-use-custom-text-colors" ' + (useTxtCol ? 'checked' : '') + ' style="accent-color:#c084fc;width:16px;height:16px;cursor:pointer;">',
      '      <span>🎨 COLORES DE TEXTO PERSONALIZADOS POR JERARQUÍA</span>',
      '    </label>',
      '    <button type="button" id="pss-btn-sync-logo-colors" style="padding:6px 12px;background:linear-gradient(135deg,#668c37,#493c24);border:1px solid #a3e635;color:#ffffff;border-radius:6px;font-size:11px;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;gap:6px;box-shadow:0 2px 10px rgba(102,140,55,0.35);" title="Analiza los píxeles de tu logo corporativo y aplica automáticamente sus tonos exactos a titulares, subtítulos y paleta">',
      '      <span>🪄</span><span>Sincronizar Colores con mi Logo</span>',
      '    </button>',
      '  </div>',
      '  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">',
      '    <div style="background:#1e293b;border:1px solid #475569;border-radius:8px;padding:8px 10px;display:flex;align-items:center;justify-content:space-between;">',
      '      <div>',
      '        <div style="font-size:11px;font-weight:800;color:#f8fafc;">Titulares (H1/H2/Cifras)</div>',
      '        <div style="font-size:9.5px;color:#94a3b8;">Títulos y valores clave</div>',
      '      </div>',
      '      <input type="color" id="pss-col-heading" value="' + colHead + '" style="width:34px;height:28px;border:1px solid #64748b;border-radius:5px;background:transparent;cursor:pointer;">',
      '    </div>',
      '    <div style="background:#1e293b;border:1px solid #475569;border-radius:8px;padding:8px 10px;display:flex;align-items:center;justify-content:space-between;">',
      '      <div>',
      '        <div style="font-size:11px;font-weight:800;color:#f8fafc;">Párrafos y Tablas</div>',
      '        <div style="font-size:9.5px;color:#94a3b8;">Cuerpo de lectura</div>',
      '      </div>',
      '      <input type="color" id="pss-col-body" value="' + colBody + '" style="width:34px;height:28px;border:1px solid #64748b;border-radius:5px;background:transparent;cursor:pointer;">',
      '    </div>',
      '    <div style="background:#1e293b;border:1px solid #475569;border-radius:8px;padding:8px 10px;display:flex;align-items:center;justify-content:space-between;">',
      '      <div>',
      '        <div style="font-size:11px;font-weight:800;color:#f8fafc;">Subtítulos y Etiquetas</div>',
      '        <div style="font-size:9.5px;color:#94a3b8;">Etiquetas KPI y pies</div>',
      '      </div>',
      '      <input type="color" id="pss-col-muted" value="' + colMuted + '" style="width:34px;height:28px;border:1px solid #64748b;border-radius:5px;background:transparent;cursor:pointer;">',
      '    </div>',
      '  </div>',
      '</div>',

      // 4. CONTROL DE SALTOS DE LÍNEA, CAJAS KPI Y ALINEACIÓN
      '<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px 14px;">',
      '  <div style="font-size:11.5px;font-weight:800;color:#34d399;margin-bottom:8px;">↵ CONTROL DE SALTO DE LÍNEA, ALINEACIÓN Y ENCAJE DE CAJAS</div>',
      '  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">',
      '    <div>',
      '      <div style="font-size:10.5px;color:#cbd5e1;font-weight:700;margin-bottom:4px;">Titular Principal de Portada (usa <code style="color:#fbbf24;">|</code> para forzar salto de línea exacto):</div>',
      '      <input type="text" id="pss-cover-main-title" value="' + coverTitleVal.replace(/"/g, '&quot;') + '" style="width:100%;padding:7px 9px;background:#1e293b;border:1px solid #475569;border-radius:6px;color:#fff;font-size:11.5px;font-weight:700;">',
      '    </div>',
      '    <div>',
      '      <div style="font-size:10.5px;color:#cbd5e1;font-weight:700;margin-bottom:4px;">Subtítulo de Portada (admite <code style="color:#fbbf24;">|</code> para salto manual):</div>',
      '      <input type="text" id="pss-cover-subtitle" value="' + coverSubVal.replace(/"/g, '&quot;') + '" style="width:100%;padding:7px 9px;background:#1e293b;border:1px solid #475569;border-radius:6px;color:#fff;font-size:11.5px;">',
      '    </div>',
      '  </div>',
      '  <div style="display:grid;grid-template-columns:1.1fr 1fr 1fr;gap:10px;align-items:center;">',
      '    <div>',
      '      <div style="font-size:10.5px;color:#cbd5e1;font-weight:700;margin-bottom:4px;">Alineación de Párrafos:</div>',
      '      <select id="pss-paragraph-align" style="width:100%;padding:6px 8px;background:#1e293b;border:1px solid #475569;border-radius:6px;color:#fff;font-size:11px;font-weight:700;">',
      '        <option value="left" ' + (pAlign === 'left' ? 'selected' : '') + '>⇤ Izquierda limpia (Sin guiones)</option>',
      '        <option value="justify" ' + (pAlign === 'justify' ? 'selected' : '') + '>☰ Justificado editorial (Con silabeo)</option>',
      '        <option value="center" ' + (pAlign === 'center' ? 'selected' : '') + '>⬌ Centrado simétrico</option>',
      '      </select>',
      '    </div>',
      '    <label style="display:flex;align-items:center;gap:7px;background:#1e293b;border:1px solid #334155;border-radius:7px;padding:8px 10px;cursor:pointer;font-size:10.5px;font-weight:700;color:#e2e8f0;">',
      '      <input type="checkbox" id="pss-wrap-balance" ' + (useBalance ? 'checked' : '') + ' style="accent-color:#10b981;width:15px;height:15px;">',
      '      <span>Equilibrado inteligente anti-palabras sueltas</span>',
      '    </label>',
      '    <label style="display:flex;align-items:center;gap:7px;background:#1e293b;border:1px solid #334155;border-radius:7px;padding:8px 10px;cursor:pointer;font-size:10.5px;font-weight:700;color:#e2e8f0;">',
      '      <input type="checkbox" id="pss-compact-kpi" ' + (compactKpi ? 'checked' : '') + ' style="accent-color:#10b981;width:15px;height:15px;">',
      '      <span>Blindar cajas KPI de portada (anti-corte inferior)</span>',
      '    </label>',
      '  </div>',
      '</div>'
    ].join('\n');
  }

  function buildVisualTabHTML(cfg, pal) {
    var themes = [
      { id: 'emerald', label: 'Esmeralda', col: '#059669' },
      { id: 'sky',     label: 'Azul CAD',  col: '#0284c7' },
      { id: 'rose',    label: 'Rosa Corp', col: '#e11d48' },
      { id: 'amber',   label: 'Ámbar Sol', col: '#d97706' },
      { id: 'slate',   label: 'Pizarra',   col: '#334155' }
    ];

    return [
      // Paleta de color
      '<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px;">',
      '  <div style="font-size:12px;font-weight:800;color:#38bdf8;margin-bottom:10px;">🎨 PALETA DE COLOR CORPORATIVA (SINCRONIZADA EN AMBOS FORMATOS)</div>',
      '  <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:12px;">',
      themes.map(function(t) {
        var isSel = !cfg.useCustomColors && cfg.theme === t.id;
        return '<button type="button" class="pss-theme-btn" data-theme="' + t.id + '" style="padding:8px;border-radius:7px;border:2px solid ' + (isSel ? '#ffffff' : t.col) + ';background:' + t.col + ';color:#fff;font-size:11px;font-weight:800;cursor:pointer;box-shadow:' + (isSel ? '0 0 12px ' + t.col : 'none') + ';">' + (isSel ? '✓ ' : '') + t.label + '</button>';
      }).join(''),
      '  </div>',
      '  <div style="display:flex;flex-wrap:wrap;align-items:center;gap:14px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.08);">',
      '    <label style="display:inline-flex;align-items:center;gap:7px;font-size:11.5px;font-weight:700;cursor:pointer;color:#e2e8f0;">',
      '      <input type="checkbox" id="pss-use-custom-colors" ' + (cfg.useCustomColors ? 'checked' : '') + ' style="accent-color:#38bdf8;width:15px;height:15px;">',
      '      <span>Usar colores HEX personalizados de mi marca:</span>',
      '    </label>',
      '    <div style="display:flex;align-items:center;gap:6px;">',
      '      <span style="font-size:11px;color:#94a3b8;">Primario:</span>',
      '      <input type="color" id="pss-custom-primary" value="' + (cfg.customPrimary || pal.primary) + '" style="width:32px;height:26px;border:1px solid #475569;border-radius:4px;background:transparent;cursor:pointer;">',
      '    </div>',
      '    <div style="display:flex;align-items:center;gap:6px;">',
      '      <span style="font-size:11px;color:#94a3b8;">Secundario / Acento:</span>',
      '      <input type="color" id="pss-custom-secondary" value="' + (cfg.customSecondary || pal.secondary) + '" style="width:32px;height:26px;border:1px solid #475569;border-radius:4px;background:transparent;cursor:pointer;">',
      '    </div>',
      '  </div>',
      '</div>',

      // Densidad, Tipografía y Escala
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">',
      '  <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px;">',
      '    <div style="font-size:12px;font-weight:800;color:#f59e0b;margin-bottom:8px;">📐 DENSIDAD DE MAQUETACIÓN & ESPACIADO</div>',
      '    <select id="pss-density" style="width:100%;padding:8px 10px;background:#1e293b;border:1px solid #475569;border-radius:6px;color:#fff;font-size:12px;font-weight:700;margin-bottom:10px;">',
      '      <option value="compact" ' + (cfg.density === 'compact' ? 'selected' : '') + '>📐 Compacto Técnico (Máxima información por hoja)</option>',
      '      <option value="balanced" ' + (cfg.density === 'balanced' ? 'selected' : '') + '>⚖️ Equilibrado Estándar (Lectura ágil y limpia)</option>',
      '      <option value="editorial" ' + (cfg.density === 'editorial' ? 'selected' : '') + '>🎨 Editorial Aireado (Márgenes amplios de revista)</option>',
      '    </select>',
      '    <div style="font-size:12px;font-weight:800;color:#f59e0b;margin-bottom:6px;margin-top:6px;">🔲 ESTILO DE TARJETAS Y BORDES</div>',
      '    <select id="pss-border-style" style="width:100%;padding:8px 10px;background:#1e293b;border:1px solid #475569;border-radius:6px;color:#fff;font-size:12px;font-weight:700;">',
      '      <option value="rounded" ' + (cfg.borderStyle === 'rounded' ? 'selected' : '') + '>Redondeado Moderno (Bordes suaves 12px)</option>',
      '      <option value="sharp" ' + (cfg.borderStyle === 'sharp' ? 'selected' : '') + '>Recto Técnico CAD (Ángulos vivos 2px)</option>',
      '      <option value="minimal" ' + (cfg.borderStyle === 'minimal' ? 'selected' : '') + '>Minimalista Limpio (Sin bordes marcados)</option>',
      '    </select>',
      '  </div>',

      '  <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px;">',
      '    <div style="font-size:12px;font-weight:800;color:#34d399;margin-bottom:8px;">🔤 TIPOGRAFÍA & ESCALA DE TEXTO</div>',
      '    <select id="pss-font-family" style="width:100%;padding:8px 10px;background:#1e293b;border:1px solid #475569;border-radius:6px;color:#fff;font-size:12px;font-weight:700;margin-bottom:10px;">',
      '      <option value="modern" ' + (cfg.fontFamily === 'modern' ? 'selected' : '') + '>Inter / Sans Moderna (Alta legibilidad)</option>',
      '      <option value="technical" ' + (cfg.fontFamily === 'technical' ? 'selected' : '') + '>Space Grotesk / JetBrains (Ingeniería CAD)</option>',
      '      <option value="corporate" ' + (cfg.fontFamily === 'corporate' ? 'selected' : '') + '>Georgia Serif (Consultoría Ejecutiva)</option>',
      '      <option value="rounded" ' + (cfg.fontFamily === 'rounded' ? 'selected' : '') + '>Comfortaa Redondeada (Comercial Cercana)</option>',
      '    </select>',
      '    <div style="display:flex;justify-content:space-between;align-items:center;font-size:11.5px;margin-bottom:4px;">',
      '      <span style="color:#cbd5e1;font-weight:700;">Escala Global de Fuente:</span>',
      '      <span id="pss-font-scale-val" style="color:#34d399;font-weight:900;">' + (cfg.fontScale || 100) + '%</span>',
      '    </div>',
      '    <input type="range" id="pss-font-scale" min="85" max="115" step="1" value="' + (cfg.fontScale || 100) + '" style="width:100%;accent-color:#10b981;cursor:pointer;">',
      '  </div>',
      '</div>',

      // Modo de Tinta y Guardián Anti-Desborde A4
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">',
      '  <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px;">',
      '    <div style="font-size:12px;font-weight:800;color:#c084fc;margin-bottom:6px;">🖨️ MODO DE PORTADA E IMPRESIÓN</div>',
      '    <select id="pss-ink-mode" style="width:100%;padding:8px 10px;background:#1e293b;border:1px solid #475569;border-radius:6px;color:#fff;font-size:12px;font-weight:700;">',
      '      <option value="light" ' + (cfg.inkMode === 'light' ? 'selected' : '') + '>☀️ Fondo Claro (Ahorro de tinta / Impresión directa)</option>',
      '      <option value="luxury_dark" ' + (cfg.inkMode === 'luxury_dark' ? 'selected' : '') + '>🌙 Portada Luxury Dark (Presentación digital premium)</option>',
      '    </select>',
      '  </div>',
      '  <div style="background:rgba(16,185,129,0.07);border:1px solid rgba(16,185,129,0.3);border-radius:10px;padding:14px;display:flex;align-items:center;justify-content:space-between;gap:10px;">',
      '    <div>',
      '      <div style="font-size:12px;font-weight:900;color:#34d399;">🛡️ GUARDIÁN ANTI-DESBORDE A4 AUTOMÁTICO</div>',
      '      <div style="font-size:11px;color:#94a3b8;margin-top:3px;line-height:1.35;">Mide cada hoja al abrir e imprimir y ajusta automáticamente el espaciado o zoom si detecta exceso de altura.</div>',
      '    </div>',
      '    <input type="checkbox" id="pss-autofit-a4" ' + (cfg.autoFitA4 ? 'checked' : '') + ' style="accent-color:#10b981;width:20px;height:20px;cursor:pointer;flex-shrink:0;">',
      '  </div>',
      '</div>'
    ].join('\n');
  }

  function buildSectionsTabHTML(cfg) {
    var order = cfg.sectionOrder || CANONICAL_SECTIONS.map(function(s) { return s.id; });
    var rows = order.map(function(secId, idx) {
      var meta = CANONICAL_SECTIONS.find(function(s) { return s.id === secId; });
      if (!meta) return '';
      var isOn = cfg.sectionsEnabled && cfg.sectionsEnabled[secId] !== false;
      var isCover = secId === 'cover';
      return [
        '<div class="pss-sec-row" data-sec-id="' + secId + '" style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 12px;background:' + (isOn ? 'rgba(30,41,59,0.9)' : 'rgba(15,23,42,0.5)') + ';border:1px solid ' + (isOn ? 'rgba(56,189,248,0.28)' : 'rgba(255,255,255,0.06)') + ';border-radius:8px;opacity:' + (isOn ? '1' : '0.55') + ';">',
        '  <div style="display:flex;align-items:center;gap:10px;flex:1;">',
        '    <input type="checkbox" class="pss-sec-toggle" data-sec-id="' + secId + '" ' + (isOn ? 'checked' : '') + (isCover ? ' disabled title="La portada siempre está activa"' : '') + ' style="accent-color:#10b981;width:16px;height:16px;cursor:pointer;">',
        '    <span style="font-size:16px;">' + meta.icon + '</span>',
        '    <div>',
        '      <div style="font-size:12px;font-weight:800;color:#f8fafc;">' + (idx + 1) + '. ' + meta.label + '</div>',
        '      <div style="font-size:10.5px;color:#94a3b8;">' + meta.desc + '</div>',
        '    </div>',
        '  </div>',
        '  <div style="display:flex;gap:4px;">',
        '    <button type="button" class="pss-sec-up" data-sec-id="' + secId + '" ' + (idx === 0 ? 'disabled' : '') + ' style="padding:4px 8px;background:#0f172a;border:1px solid #475569;color:#cbd5e1;border-radius:5px;cursor:pointer;font-size:11px;font-weight:800;">▲</button>',
        '    <button type="button" class="pss-sec-down" data-sec-id="' + secId + '" ' + (idx === order.length - 1 ? 'disabled' : '') + ' style="padding:4px 8px;background:#0f172a;border:1px solid #475569;color:#cbd5e1;border-radius:5px;cursor:pointer;font-size:11px;font-weight:800;">▼</button>',
        '  </div>',
        '</div>'
      ].join('\n');
    }).join('\n');

    return [
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:11.5px;color:#cbd5e1;background:rgba(56,189,248,0.08);border:1px solid rgba(56,189,248,0.25);border-radius:8px;padding:10px 12px;">',
      '  <span>💡 <b>Constructor Modular de Secciones:</b> Activa o desactiva bloques y ordénalos con ▲/▼. La numeración de hojas se recalcula sola.</span>',
      '  <button type="button" id="pss-btn-enable-all-secs" style="padding:5px 10px;background:#0f172a;border:1px solid #38bdf8;color:#38bdf8;border-radius:6px;font-size:10.5px;font-weight:800;cursor:pointer;white-space:nowrap;">✓ Activar Todas</button>',
      '</div>',
      '<div style="display:flex;flex-direction:column;gap:6px;">',
      rows,
      '</div>'
    ].join('\n');
  }

  function buildEconomicsTabHTML(cfg) {
    var modes = [
      {
        id: 'turnkey_only',
        title: '🔒 Precio Único Llave en Mano (Cerrado)',
        desc: 'Muestra la lista técnica de capítulos con "Incluido" y únicamente el importe total final (Base Imponible + IVA). Ideal para evitar regateos por componente.'
      },
      {
        id: 'chapters_units',
        title: '📦 Capítulos con Unidades Montadas + Importe por Partida',
        desc: 'Muestra el número exacto de unidades instaladas (N× módulos, inversores, baterías, aerogeneradores) y el subtotal de cada capítulo, ocultando el precio unitario €/ud.'
      },
      {
        id: 'full_open',
        title: '📊 Presupuesto Abierto Completo (Ingeniería Transparente)',
        desc: 'Muestra unidades montadas (N×), precios unitarios (€/ud) y subtotales desglosados por cada partida del SSOT.'
      }
    ];

    return [
      '<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px;">',
      '  <div style="font-size:12px;font-weight:800;color:#f59e0b;margin-bottom:10px;">💶 NIVEL DE DESGLOSE DE PARTIDAS ECONÓMICAS</div>',
      '  <div style="display:flex;flex-direction:column;gap:8px;">',
      modes.map(function(m) {
        var sel = cfg.economicBreakdown === m.id;
        return '<label style="display:flex;align-items:flex-start;gap:10px;padding:11px 14px;background:' + (sel ? 'rgba(16,185,129,0.12)' : 'rgba(15,23,42,0.6)') + ';border:1.5px solid ' + (sel ? '#10b981' : 'rgba(255,255,255,0.08)') + ';border-radius:8px;cursor:pointer;">' +
          '<input type="radio" name="pss-econ-breakdown" value="' + m.id + '" ' + (sel ? 'checked' : '') + ' style="accent-color:#10b981;margin-top:3px;width:16px;height:16px;">' +
          '<div>' +
          '  <div style="font-size:12.5px;font-weight:800;color:#f8fafc;">' + m.title + '</div>' +
          '  <div style="font-size:11px;color:#94a3b8;margin-top:3px;line-height:1.4;">' + m.desc + '</div>' +
          '</div>' +
          '</label>';
      }).join(''),
      '  </div>',
      '</div>',

      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">',
      '  <label style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;">',
      '    <div>',
      '      <div style="font-size:12px;font-weight:800;color:#38bdf8;">🏛️ Tabla de Deducciones Fiscales (IBI / IRPF / ICIO)</div>',
      '      <div style="font-size:11px;color:#94a3b8;margin-top:2px;">Mostrar cuadro de bonificaciones e inversión neta tras ayudas</div>',
      '    </div>',
      '    <input type="checkbox" id="pss-show-tax" ' + (cfg.showTaxBenefits !== false ? 'checked' : '') + ' style="accent-color:#38bdf8;width:18px;height:18px;">',
      '  </label>',
      '  <label style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;">',
      '    <div>',
      '      <div style="font-size:12px;font-weight:800;color:#34d399;">🏦 Comparativa Financiación / Renting Bancable</div>',
      '      <div style="font-size:11px;color:#94a3b8;margin-top:2px;">Mostrar opciones de pago financiado y cuota mensual vs ahorro</div>',
      '    </div>',
      '    <input type="checkbox" id="pss-show-financing" ' + (cfg.showFinancingOptions !== false ? 'checked' : '') + ' style="accent-color:#10b981;width:18px;height:18px;">',
      '  </label>',
      '</div>'
    ].join('\n');
  }

  function buildTextsTabHTML(cfg) {
    var lt = cfg.lockedTexts || {};
    return [
      '<div style="font-size:11px;color:#cbd5e1;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:8px;padding:9px 12px;">',
      '  🏷️ <b>Variables Inteligentes Disponibles:</b> Usa <code style="color:#fbbf24;">{{clientName}}</code>, <code style="color:#fbbf24;">{{kwp}}</code>, <code style="color:#fbbf24;">{{numPanels}}</code>, <code style="color:#fbbf24;">{{windPhrase}}</code>, <code style="color:#fbbf24;">{{annualYield}}</code>, <code style="color:#fbbf24;">{{ahorroAnual}}</code>, <code style="color:#fbbf24;">{{payback}}</code>, <code style="color:#fbbf24;">{{capexBruto}}</code>, <code style="color:#fbbf24;">{{validityDays}}</code>.',
      '</div>',

      '<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px;">',
      '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">',
      '    <span style="font-size:12px;font-weight:800;color:#38bdf8;">📋 PLANTILLA FIJA DE RESUMEN EJECUTIVO (SIN ESPERAR A IA)</span>',
      '    <label style="display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:700;cursor:pointer;">',
      '      <input type="checkbox" id="pss-lock-summary" ' + (lt.useLockedSummary ? 'checked' : '') + ' style="accent-color:#10b981;">',
      '      <span>Fijar plantilla instantánea</span>',
      '    </label>',
      '  </div>',
      '  <textarea id="pss-summary-template" rows="3" style="width:100%;padding:8px 10px;background:#1e293b;border:1px solid #475569;border-radius:6px;color:#f8fafc;font-size:11.5px;line-height:1.45;resize:vertical;">' + (lt.summaryTemplate || '') + '</textarea>',
      '</div>',

      '<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px;">',
      '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">',
      '    <span style="font-size:12px;font-weight:800;color:#f59e0b;">🤝 HITOS DE PAGO Y VALIDEZ CONTRACTUAL</span>',
      '    <div style="display:flex;align-items:center;gap:6px;">',
      '      <span style="font-size:11px;color:#94a3b8;">Validez oferta (días):</span>',
      '      <input type="number" id="pss-validity-days" value="' + (lt.validityDays || 30) + '" min="5" max="180" style="width:64px;padding:4px 8px;background:#1e293b;border:1px solid #475569;border-radius:5px;color:#fff;font-size:11.5px;font-weight:800;">',
      '    </div>',
      '  </div>',
      '  <div style="display:grid;grid-template-columns:80px 1fr;gap:6px;margin-bottom:6px;align-items:center;">',
      '    <input type="number" id="pss-m1-pct" value="' + (lt.milestone1Pct !== undefined ? lt.milestone1Pct : 30) + '" style="padding:6px;background:#1e293b;border:1px solid #475569;border-radius:5px;color:#34d399;font-weight:800;font-size:11.5px;text-align:center;">',
      '    <input type="text" id="pss-m1-txt" value="' + (lt.milestone1Text || '') + '" style="padding:6px 10px;background:#1e293b;border:1px solid #475569;border-radius:5px;color:#fff;font-size:11.5px;">',
      '    <input type="number" id="pss-m2-pct" value="' + (lt.milestone2Pct !== undefined ? lt.milestone2Pct : 50) + '" style="padding:6px;background:#1e293b;border:1px solid #475569;border-radius:5px;color:#34d399;font-weight:800;font-size:11.5px;text-align:center;">',
      '    <input type="text" id="pss-m2-txt" value="' + (lt.milestone2Text || '') + '" style="padding:6px 10px;background:#1e293b;border:1px solid #475569;border-radius:5px;color:#fff;font-size:11.5px;">',
      '    <input type="number" id="pss-m3-pct" value="' + (lt.milestone3Pct !== undefined ? lt.milestone3Pct : 20) + '" style="padding:6px;background:#1e293b;border:1px solid #475569;border-radius:5px;color:#34d399;font-weight:800;font-size:11.5px;text-align:center;">',
      '    <input type="text" id="pss-m3-txt" value="' + (lt.milestone3Text || '') + '" style="padding:6px 10px;background:#1e293b;border:1px solid #475569;border-radius:5px;color:#fff;font-size:11.5px;">',
      '  </div>',
      '  <div style="font-size:11px;color:#94a3b8;margin:8px 0 4px;font-weight:700;">Nota Legal y Alcance al Pie:</div>',
      '  <textarea id="pss-legal-notes" rows="2" style="width:100%;padding:7px 10px;background:#1e293b;border:1px solid #475569;border-radius:6px;color:#f8fafc;font-size:11px;line-height:1.4;resize:vertical;">' + (lt.legalNotes || '') + '</textarea>',
      '</div>'
    ].join('\n');
  }

  function collectCurrentTabInputsToState() {
    var st = loadState();
    var cfg = st.activeConfig;
    var g = function(id) { return document.getElementById(id); };

    if (_activeModalTab === 'visual') {
      if (g('pss-use-custom-colors')) cfg.useCustomColors = g('pss-use-custom-colors').checked;
      if (g('pss-custom-primary')) cfg.customPrimary = g('pss-custom-primary').value;
      if (g('pss-custom-secondary')) cfg.customSecondary = g('pss-custom-secondary').value;
      if (g('pss-density')) cfg.density = g('pss-density').value;
      if (g('pss-border-style')) cfg.borderStyle = g('pss-border-style').value;
      if (g('pss-font-family')) cfg.fontFamily = g('pss-font-family').value;
      if (g('pss-font-scale')) cfg.fontScale = Number(g('pss-font-scale').value) || 100;
      if (g('pss-ink-mode')) cfg.inkMode = g('pss-ink-mode').value;
      if (g('pss-autofit-a4')) cfg.autoFitA4 = g('pss-autofit-a4').checked;
    } else if (_activeModalTab === 'typography') {
      if (g('pss-heading-lh')) cfg.headingLineHeight = parseFloat(g('pss-heading-lh').value) || 1.18;
      if (g('pss-subtitle-lh')) cfg.subtitleLineHeight = parseFloat(g('pss-subtitle-lh').value) || 1.32;
      if (g('pss-body-lh')) cfg.bodyLineHeight = parseFloat(g('pss-body-lh').value) || 1.48;
      if (g('pss-paragraph-gap')) cfg.paragraphGap = parseInt(g('pss-paragraph-gap').value, 10) || 10;
      if (g('pss-subtitle-gap')) cfg.subtitleSpacing = parseInt(g('pss-subtitle-gap').value, 10) || 6;
      if (g('pss-table-lh')) cfg.tableLineHeight = parseFloat(g('pss-table-lh').value) || 1.28;
      if (g('pss-use-custom-text-colors')) cfg.useCustomTextColors = g('pss-use-custom-text-colors').checked;
      if (g('pss-col-heading')) cfg.headingTextColor = g('pss-col-heading').value;
      if (g('pss-col-body')) cfg.bodyTextColor = g('pss-col-body').value;
      if (g('pss-col-muted')) cfg.mutedTextColor = g('pss-col-muted').value;
      if (g('pss-paragraph-align')) cfg.paragraphAlign = g('pss-paragraph-align').value;
      if (g('pss-wrap-balance')) cfg.textWrapBalance = g('pss-wrap-balance').checked;
      if (g('pss-compact-kpi')) cfg.compactKpiBoxes = g('pss-compact-kpi').checked;
      cfg.lockedTexts = cfg.lockedTexts || {};
      if (g('pss-cover-main-title')) cfg.lockedTexts.coverMainTitle = g('pss-cover-main-title').value;
      if (g('pss-cover-subtitle')) cfg.lockedTexts.coverSubtitle = g('pss-cover-subtitle').value;
    } else if (_activeModalTab === 'economics') {
      var checkedRadio = document.querySelector('input[name="pss-econ-breakdown"]:checked');
      if (checkedRadio) cfg.economicBreakdown = checkedRadio.value;
      if (g('pss-show-tax')) cfg.showTaxBenefits = g('pss-show-tax').checked;
      if (g('pss-show-financing')) cfg.showFinancingOptions = g('pss-show-financing').checked;
    } else if (_activeModalTab === 'texts') {
      cfg.lockedTexts = cfg.lockedTexts || {};
      if (g('pss-lock-summary')) cfg.lockedTexts.useLockedSummary = g('pss-lock-summary').checked;
      if (g('pss-summary-template')) cfg.lockedTexts.summaryTemplate = g('pss-summary-template').value;
      if (g('pss-validity-days')) cfg.lockedTexts.validityDays = Number(g('pss-validity-days').value) || 30;
      if (g('pss-m1-pct')) cfg.lockedTexts.milestone1Pct = Number(g('pss-m1-pct').value) || 0;
      if (g('pss-m1-txt')) cfg.lockedTexts.milestone1Text = g('pss-m1-txt').value;
      if (g('pss-m2-pct')) cfg.lockedTexts.milestone2Pct = Number(g('pss-m2-pct').value) || 0;
      if (g('pss-m2-txt')) cfg.lockedTexts.milestone2Text = g('pss-m2-txt').value;
      if (g('pss-m3-pct')) cfg.lockedTexts.milestone3Pct = Number(g('pss-m3-pct').value) || 0;
      if (g('pss-m3-txt')) cfg.lockedTexts.milestone3Text = g('pss-m3-txt').value;
      if (g('pss-legal-notes')) cfg.lockedTexts.legalNotes = g('pss-legal-notes').value;
    }
  }

  function updateTypographyLivePreview(modal) {
    if (!modal) return;
    var q = function(sel) { return modal.querySelector(sel); };
    var hLH = q('#pss-heading-lh') ? parseFloat(q('#pss-heading-lh').value) : 1.18;
    var subLH = q('#pss-subtitle-lh') ? parseFloat(q('#pss-subtitle-lh').value) : 1.32;
    var bodyLH = q('#pss-body-lh') ? parseFloat(q('#pss-body-lh').value) : 1.48;
    var pGap = q('#pss-paragraph-gap') ? parseInt(q('#pss-paragraph-gap').value, 10) : 10;
    var subGap = q('#pss-subtitle-gap') ? parseInt(q('#pss-subtitle-gap').value, 10) : 6;
    var tblLH = q('#pss-table-lh') ? parseFloat(q('#pss-table-lh').value) : 1.28;
    var useTxtCol = q('#pss-use-custom-text-colors') ? q('#pss-use-custom-text-colors').checked : false;
    var colHead = useTxtCol && q('#pss-col-heading') ? q('#pss-col-heading').value : '#0f172a';
    var colBody = useTxtCol && q('#pss-col-body') ? q('#pss-col-body').value : '#334155';
    var colMuted = useTxtCol && q('#pss-col-muted') ? q('#pss-col-muted').value : '#64748b';
    var pAlign = q('#pss-paragraph-align') ? q('#pss-paragraph-align').value : 'left';
    var useBalance = q('#pss-wrap-balance') ? q('#pss-wrap-balance').checked : true;
    var titleRaw = q('#pss-cover-main-title') ? q('#pss-cover-main-title').value : '';
    var subRaw = q('#pss-cover-subtitle') ? q('#pss-cover-subtitle').value : '';

    if (q('#pss-val-hlh')) q('#pss-val-hlh').textContent = hLH.toFixed(2);
    if (q('#pss-val-sublh')) q('#pss-val-sublh').textContent = subLH.toFixed(2);
    if (q('#pss-val-bodylh')) q('#pss-val-bodylh').textContent = bodyLH.toFixed(2);
    if (q('#pss-val-pgap')) q('#pss-val-pgap').textContent = pGap + ' px';
    if (q('#pss-val-subgap')) q('#pss-val-subgap').textContent = subGap + ' px';
    if (q('#pss-val-tbllh')) q('#pss-val-tbllh').textContent = tblLH.toFixed(2);

    var prevH1 = q('#pss-prev-h1');
    if (prevH1) {
      prevH1.style.lineHeight = String(hLH);
      prevH1.style.color = colHead;
      prevH1.style.textWrap = useBalance ? 'balance' : 'wrap';
      if (titleRaw) prevH1.innerHTML = formatManualLineBreaks(titleRaw);
    }
    var prevSub = q('#pss-prev-sub');
    if (prevSub) {
      prevSub.style.lineHeight = String(subLH);
      prevSub.style.marginTop = subGap + 'px';
      prevSub.style.color = colMuted;
      prevSub.style.textWrap = useBalance ? 'balance' : 'wrap';
      if (subRaw) prevSub.innerHTML = formatManualLineBreaks(subRaw);
    }
    ['#pss-prev-p1', '#pss-prev-p2'].forEach(function(id, idx) {
      var pEl = q(id);
      if (pEl) {
        pEl.style.lineHeight = String(bodyLH);
        pEl.style.color = colBody;
        pEl.style.textAlign = pAlign;
        if (idx === 0) pEl.style.marginBottom = pGap + 'px';
      }
    });
    modal.querySelectorAll('.pss-prev-kpi-lbl').forEach(function(el, i) {
      el.style.lineHeight = String(subLH);
      if (i < 2) el.style.color = colMuted;
    });
    modal.querySelectorAll('.pss-prev-kpi-val').forEach(function(el) {
      el.style.lineHeight = String(tblLH);
      el.style.color = colHead;
    });
  }

  function refreshModal(modal, onApplyCallback) {
    modal.innerHTML = buildModalHTML();
    bindModalEvents(modal, onApplyCallback);
  }

  function bindModalEvents(modal, onApplyCallback) {
    var st = loadState();
    var cfg = st.activeConfig;

    var closeBtn = modal.querySelector('#pss-btn-close');
    if (closeBtn) closeBtn.onclick = function() { modal.remove(); };

    // Selector de perfil
    var presetSel = modal.querySelector('#pss-preset-select');
    if (presetSel) {
      presetSel.onchange = function() {
        selectPreset(this.value);
        refreshModal(modal, onApplyCallback);
      };
    }

    // Guardar perfil personalizado
    var btnSavePreset = modal.querySelector('#pss-btn-save-preset');
    if (btnSavePreset) {
      btnSavePreset.onclick = function() {
        collectCurrentTabInputsToState();
        var name = prompt('Nombre para tu nuevo perfil de maquetación (ej. "Industrial Sin Precios Unitarios"):', '');
        if (name && name.trim()) {
          saveCustomPreset(name.trim());
          refreshModal(modal, onApplyCallback);
          if (global.showToast) global.showToast('PERFIL GUARDADO', 'Nuevo perfil añadido al selector rápido', 'success', 2200);
        }
      };
    }

    // Eliminar perfil personalizado
    var btnDelPreset = modal.querySelector('#pss-btn-del-preset');
    if (btnDelPreset) {
      btnDelPreset.onclick = function() {
        if (confirm('¿Eliminar este perfil personalizado?')) {
          deleteCustomPreset(st.activePresetId);
          refreshModal(modal, onApplyCallback);
        }
      };
    }

    // Cambio de pestañas
    modal.querySelectorAll('.pss-tab-btn').forEach(function(btn) {
      btn.onclick = function() {
        collectCurrentTabInputsToState();
        _activeModalTab = this.getAttribute('data-tab');
        saveState();
        refreshModal(modal, onApplyCallback);
      };
    });

    // Eventos en pestaña Visual
    modal.querySelectorAll('.pss-theme-btn').forEach(function(tBtn) {
      tBtn.onclick = function() {
        collectCurrentTabInputsToState();
        cfg.theme = this.getAttribute('data-theme');
        cfg.useCustomColors = false;
        saveState();
        refreshModal(modal, onApplyCallback);
      };
    });

    var scaleInput = modal.querySelector('#pss-font-scale');
    if (scaleInput) {
      scaleInput.oninput = function() {
        var lbl = modal.querySelector('#pss-font-scale-val');
        if (lbl) lbl.textContent = this.value + '%';
      };
    }

    // Eventos en pestaña Interlineado & Textos (Vista previa en tiempo real)
    [
      '#pss-heading-lh', '#pss-subtitle-lh', '#pss-body-lh',
      '#pss-paragraph-gap', '#pss-subtitle-gap', '#pss-table-lh',
      '#pss-use-custom-text-colors', '#pss-col-heading', '#pss-col-body', '#pss-col-muted',
      '#pss-paragraph-align', '#pss-wrap-balance', '#pss-compact-kpi',
      '#pss-cover-main-title', '#pss-cover-subtitle'
    ].forEach(function(sel) {
      var el = modal.querySelector(sel);
      if (!el) return;
      var handler = function() {
        if (sel === '#pss-col-heading' || sel === '#pss-col-body' || sel === '#pss-col-muted') {
          var chk = modal.querySelector('#pss-use-custom-text-colors');
          if (chk) chk.checked = true;
        }
        updateTypographyLivePreview(modal);
      };
      el.addEventListener('input', handler);
      el.addEventListener('change', handler);
    });

    var btnSyncLogo = modal.querySelector('#pss-btn-sync-logo-colors');
    if (btnSyncLogo) {
      btnSyncLogo.onclick = function() {
        collectCurrentTabInputsToState();
        extractColorsFromCompanyLogo(function(extracted) {
          if (!extracted) return;
          cfg.useCustomColors = true;
          cfg.customPrimary = extracted.primary;
          cfg.customSecondary = extracted.secondary;
          cfg.useCustomTextColors = true;
          cfg.headingTextColor = extracted.headingText;
          cfg.bodyTextColor = extracted.bodyText;
          cfg.mutedTextColor = extracted.mutedText;
          saveState();
          refreshModal(modal, onApplyCallback);
          if (global.showToast) {
            global.showToast('COLORES SINCRONIZADOS CON TU LOGO', 'Tonos corporativos extraídos y aplicados a titulares, subtítulos y paleta.', 'success', 2800);
          }
        });
      };
    }

    // Eventos en pestaña Secciones
    var btnEnableAllSecs = modal.querySelector('#pss-btn-enable-all-secs');
    if (btnEnableAllSecs) {
      btnEnableAllSecs.onclick = function() {
        CANONICAL_SECTIONS.forEach(function(s) {
          cfg.sectionsEnabled[s.id] = true;
        });
        saveState();
        refreshModal(modal, onApplyCallback);
        if (global.showToast) global.showToast('TODAS LAS SECCIONES ACTIVAS', 'Se han activado todas las hojas del presupuesto.', 'info', 2000);
      };
    }

    modal.querySelectorAll('.pss-sec-toggle').forEach(function(chk) {
      chk.onchange = function() {
        var secId = this.getAttribute('data-sec-id');
        if (secId === 'cover') {
          this.checked = true;
          return;
        }
        cfg.sectionsEnabled[secId] = this.checked;
        saveState();
        refreshModal(modal, onApplyCallback);
      };
    });

    modal.querySelectorAll('.pss-sec-up').forEach(function(upBtn) {
      upBtn.onclick = function() {
        var secId = this.getAttribute('data-sec-id');
        var idx = cfg.sectionOrder.indexOf(secId);
        if (idx > 0) {
          var tmp = cfg.sectionOrder[idx - 1];
          cfg.sectionOrder[idx - 1] = cfg.sectionOrder[idx];
          cfg.sectionOrder[idx] = tmp;
          saveState();
          refreshModal(modal, onApplyCallback);
        }
      };
    });

    modal.querySelectorAll('.pss-sec-down').forEach(function(dnBtn) {
      dnBtn.onclick = function() {
        var secId = this.getAttribute('data-sec-id');
        var idx = cfg.sectionOrder.indexOf(secId);
        if (idx !== -1 && idx < cfg.sectionOrder.length - 1) {
          var tmp = cfg.sectionOrder[idx + 1];
          cfg.sectionOrder[idx + 1] = cfg.sectionOrder[idx];
          cfg.sectionOrder[idx] = tmp;
          saveState();
          refreshModal(modal, onApplyCallback);
        }
      };
    });

    // Botones de emisión y guardado
    var btnSaveClose = modal.querySelector('#pss-btn-save-close');
    if (btnSaveClose) {
      btnSaveClose.onclick = function() {
        collectCurrentTabInputsToState();
        saveState();
        modal.remove();
        if (global.showToast) global.showToast('ESTILO MAESTRO ACTIVO', 'Configuración aplicada a los presupuestos Horizontal y Vertical', 'success', 2500);
        if (typeof onApplyCallback === 'function') onApplyCallback(cfg);
      };
    }

    var btnEmitLandscape = modal.querySelector('#pss-btn-emit-landscape');
    if (btnEmitLandscape) {
      btnEmitLandscape.onclick = function() {
        collectCurrentTabInputsToState();
        saveState();
        if (global.CommercialProposalDossier && typeof global.CommercialProposalDossier.generate === 'function') {
          global.CommercialProposalDossier.generate();
        }
      };
    }

    var btnEmitPortrait = modal.querySelector('#pss-btn-emit-portrait');
    if (btnEmitPortrait) {
      btnEmitPortrait.onclick = function() {
        collectCurrentTabInputsToState();
        saveState();
        if (typeof global.generatePropuestaComercialPDF === 'function') {
          global.generatePropuestaComercialPDF(true);
        }
      };
    }
  }

  // Inicializar al cargar el DOM
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function() {
      loadState();
      syncExternalLegacyState(getActiveConfig());
      updateStep5IndicatorUI();
    });
  }

  // API Pública Modular
  global.RAProposalStyleStudio = {
    getActiveConfig: getActiveConfig,
    getAllPresets: getAllPresets,
    selectPreset: selectPreset,
    saveCustomPreset: saveCustomPreset,
    deleteCustomPreset: deleteCustomPreset,
    getResolvedPalette: getResolvedPalette,
    buildInjectedStylesheet: buildInjectedStylesheet,
    interpolateText: interpolateText,
    formatManualLineBreaks: formatManualLineBreaks,
    extractColorsFromCompanyLogo: extractColorsFromCompanyLogo,
    getAutoFitClientScript: getAutoFitClientScript,
    getSectionPaginationAndOrderScript: getSectionPaginationAndOrderScript,
    openModal: openModal,
    updateStep5IndicatorUI: updateStep5IndicatorUI,
    CANONICAL_SECTIONS: CANONICAL_SECTIONS
  };

})(typeof window !== 'undefined' ? window : this);
