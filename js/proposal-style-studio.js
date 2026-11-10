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

  function _sSvg(name, size, color, extraStyle) {
    if (global.RA_SvgCatalog && typeof global.RA_SvgCatalog.mini === 'function') {
      return global.RA_SvgCatalog.mini(name, size, color, extraStyle);
    }
    return '';
  }

  // ── 1. CATÁLOGO CANÓNICO DE SECCIONES UNIFICADAS ───────────────────────────
  var CANONICAL_SECTIONS = [
    { id: 'cover',               label: 'Portada 3D & Datos del Proyecto',              icon: _sSvg('image', 16, '#38bdf8'),      desc: 'Portada corporativa con gemelo digital 3D y KPIs principales' },
    { id: 'summary',             label: 'Resumen Ejecutivo & Propuesta de Valor',       icon: _sSvg('clipboard', 16, '#10b981'),  desc: 'Filosofía de ingeniería, impacto ambiental y resumen ejecutivo' },
    { id: 'bill_audit',          label: 'Estudio Preliminar & Auditoría de Factura',    icon: _sSvg('receipt', 16, '#f59e0b'),    desc: 'Análisis de suministro actual, tarifa, CUPS y perfil de consumo' },
    { id: 'installation',        label: 'Instalación Proyectada & Equipos Tier-1',      icon: _sSvg('bolt', 16, '#eab308'),       desc: 'Distribución en cubierta, módulos FV, inversores, baterías y eólica' },
    { id: 'energy_balance',      label: 'Balance Energético Mensual & Curvas 24h',      icon: _sSvg('chart', 16, '#38bdf8'),      desc: 'Tabla mensual de 12 meses, curvas horarias y cobertura solar' },
    { id: 'packages_comparison', label: 'Comparativa de 3 Planes de Inversión',         icon: _sSvg('trophy', 16, '#fbbf24'),     desc: 'Alternativas Esencial, Óptimo Recomendado e Independencia Total' },
    { id: 'economics',           label: 'Propuesta Económica & Desglose CAPEX',         icon: _sSvg('euro', 16, '#10b981'),       desc: 'Presupuesto llave en mano, partidas, impuestos y modalidades de pago' },
    { id: 'cashflow_25y',        label: 'Amortización a 25 Años & Garantías',           icon: _sSvg('trendUp', 16, '#34d399'),    desc: 'Flujo de caja acumulado, VAN, TIR, cronograma y cuadro de garantías' },
    { id: 'cel',                 label: 'Comunidad Energética Local (RDL 7/2026)',      icon: _sSvg('globe', 16, '#60a5fa'),      desc: 'Reparto de excedentes en radio de 5 km e ingresos por inyección CEL' },
    { id: 'closing',             label: 'Hoja de Decisión, Condiciones & Firma',        icon: _sSvg('edit', 16, '#c084fc'),       desc: 'Resumen de decisión ejecutiva, hitos de pago, validez y firmas' }
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
      name: 'Residencial Rápido (Directo al Ahorro)',
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
        headerLogoScope: 'all',              // all | cover_closing | none
        headerLogoFormat: 'logo_and_title',  // logo_and_title | logo_only | right_aligned
        coverLogoHeightPx: 48,
        innerHeaderLogoHeightPx: 28,
        headerLogoStyle: 'clean',            // clean | pill | subtle
        contentVerticalDistribution: 'balanced_fill', // balanced_fill | top_compact
        watermarkEnabled: false,
        watermarkType: 'logo',               // logo | text
        watermarkText: 'CONFIDENCIAL',
        watermarkOpacity: 0.06,
        // Controles finos de interlineado, espaciado, tamaños independientes, saltos de línea y color de textos
        heroFontSize: 23.5,
        sectionFontSize: 13.0,
        bodyFontSize: 11.0,
        kpiFontSize: 16.5,
        headingLineHeight: 1.18,
        headingLetterSpacing: -0.5,
        subtitleLineHeight: 1.32,
        subtitleSpacing: 6,
        bodyLineHeight: 1.48,
        paragraphGap: 10,
        tableLineHeight: 1.28,
        textWrapBalance: true,
        compactKpiBoxes: true,
        coverFillSheet: true,
        coverHeaderGap: 20,
        coverPhotoGap: 18,
        coverPhotoHeightMm: 78,
        coverSpecsGap: 18,
        coverSpecBoxHeightPx: 112,
        balanceCardHeightPx: 145,
        histogramHeightPx: 200,
        histogramFillMode: 'gradient', // 'solid' | 'gradient'
        histogramBarColor: '#38bdf8',
        histogramBarColorEnd: '#0284c7',
        histogramPeakColor: '#10b981',
        histogramPeakColorEnd: '#059669',
        histogramValueFontSize: 7.5,
        histogramLabelFontSize: 8.0,
        histogramAxisFontSize: 8.0,
        amortHeightPx: 200,
        amortFillMode: 'gradient', // 'solid' | 'gradient'
        amortLineColor: '#059669',
        amortAreaColor: '#10b981',
        amortAreaColorEnd: '#d1fae5',
        amortPaybackColor: '#047857',
        amortAxisFontSize: 8.0,
        amortPaybackFontSize: 8.0,
        celFlowBarHeightPx: 26,
        celFlowFontSize: 9.5,
        celFlowDescFontSize: 9.0,
        celRadarHeightPx: 235,
        celRadarLabelFontSize: 11.5,
        celRadarDistanceFontSize: 10.5,
        celCardsGapPx: 8,
        installationModality: 'grid_surplus_cel', // grid_zero | grid_surplus_cel | grid_backup | off_grid
        referenceGridPriceEUR: 0.22,
        paragraphAlign: 'left',     // left | justify | center
        useCustomTextColors: false,
        headingTextColor: '#0f172a',
        bodyTextColor: '#334155',
        mutedTextColor: '#64748b',
        economicBreakdown: 'chapters_units', // turnkey_only | chapters_units | full_open
        itemPriceDisplay: 'price',           // price | included
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
      name: 'Industrial / PYME Bancable (Ingeniería Abierta)',
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
        headerLogoScope: 'all',
        headerLogoFormat: 'logo_and_title',
        coverLogoHeightPx: 48,
        innerHeaderLogoHeightPx: 26,
        headerLogoStyle: 'clean',
        contentVerticalDistribution: 'balanced_fill',
        watermarkEnabled: false,
        watermarkType: 'logo',
        watermarkText: 'CONFIDENCIAL',
        watermarkOpacity: 0.06,
        heroFontSize: 22.0,
        sectionFontSize: 12.5,
        bodyFontSize: 10.5,
        kpiFontSize: 16.0,
        headingLineHeight: 1.15,
        headingLetterSpacing: -0.4,
        subtitleLineHeight: 1.28,
        subtitleSpacing: 5,
        bodyLineHeight: 1.42,
        paragraphGap: 8,
        tableLineHeight: 1.22,
        textWrapBalance: true,
        compactKpiBoxes: true,
        coverFillSheet: true,
        coverHeaderGap: 18,
        coverPhotoGap: 16,
        coverPhotoHeightMm: 74,
        coverSpecsGap: 16,
        coverSpecBoxHeightPx: 106,
        balanceCardHeightPx: 140,
        histogramHeightPx: 200,
        histogramFillMode: 'gradient',
        histogramBarColor: '#0284c7',
        histogramBarColorEnd: '#0369a1',
        histogramPeakColor: '#059669',
        histogramPeakColorEnd: '#047857',
        histogramValueFontSize: 7.5,
        histogramLabelFontSize: 8.0,
        histogramAxisFontSize: 8.0,
        amortHeightPx: 200,
        amortFillMode: 'gradient',
        amortLineColor: '#0284c7',
        amortAreaColor: '#38bdf8',
        amortAreaColorEnd: '#e0f2fe',
        amortPaybackColor: '#0369a1',
        amortAxisFontSize: 8.0,
        amortPaybackFontSize: 8.0,
        celFlowBarHeightPx: 26,
        celFlowFontSize: 9.5,
        celFlowDescFontSize: 9.0,
        celRadarHeightPx: 235,
        celRadarLabelFontSize: 11.5,
        celRadarDistanceFontSize: 10.5,
        celCardsGapPx: 8,
        installationModality: 'grid_zero',
        referenceGridPriceEUR: 0.22,
        paragraphAlign: 'justify',
        useCustomTextColors: false,
        headingTextColor: '#0f172a',
        bodyTextColor: '#334155',
        mutedTextColor: '#64748b',
        economicBreakdown: 'full_open',
        itemPriceDisplay: 'price',
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
      name: 'Híbrido Solar + Minieólica + Autarquía 24h',
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
        headerLogoScope: 'all',
        headerLogoFormat: 'logo_and_title',
        coverLogoHeightPx: 50,
        innerHeaderLogoHeightPx: 28,
        headerLogoStyle: 'clean',
        contentVerticalDistribution: 'balanced_fill',
        watermarkEnabled: false,
        watermarkType: 'logo',
        watermarkText: 'CONFIDENCIAL',
        watermarkOpacity: 0.06,
        heroFontSize: 24.0,
        sectionFontSize: 13.5,
        bodyFontSize: 11.0,
        kpiFontSize: 17.0,
        headingLineHeight: 1.20,
        headingLetterSpacing: -0.5,
        subtitleLineHeight: 1.36,
        subtitleSpacing: 8,
        bodyLineHeight: 1.54,
        paragraphGap: 12,
        tableLineHeight: 1.32,
        textWrapBalance: true,
        compactKpiBoxes: true,
        coverFillSheet: true,
        coverHeaderGap: 22,
        coverPhotoGap: 20,
        coverPhotoHeightMm: 82,
        coverSpecsGap: 20,
        coverSpecBoxHeightPx: 116,
        balanceCardHeightPx: 150,
        histogramHeightPx: 200,
        histogramFillMode: 'gradient',
        histogramBarColor: '#f59e0b',
        histogramBarColorEnd: '#d97706',
        histogramPeakColor: '#10b981',
        histogramPeakColorEnd: '#059669',
        histogramValueFontSize: 7.5,
        histogramLabelFontSize: 8.0,
        histogramAxisFontSize: 8.0,
        amortHeightPx: 200,
        amortFillMode: 'gradient',
        amortLineColor: '#d97706',
        amortAreaColor: '#f59e0b',
        amortAreaColorEnd: '#fef3c7',
        amortPaybackColor: '#b45309',
        amortAxisFontSize: 8.0,
        amortPaybackFontSize: 8.0,
        celFlowBarHeightPx: 26,
        celFlowFontSize: 9.5,
        celFlowDescFontSize: 9.0,
        celRadarHeightPx: 235,
        celRadarLabelFontSize: 11.5,
        celRadarDistanceFontSize: 10.5,
        celCardsGapPx: 8,
        installationModality: 'grid_backup',
        referenceGridPriceEUR: 0.22,
        paragraphAlign: 'left',
        useCustomTextColors: false,
        headingTextColor: '#0f172a',
        bodyTextColor: '#334155',
        mutedTextColor: '#64748b',
        economicBreakdown: 'full_open',
        itemPriceDisplay: 'price',
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
    },

    aislada_off_grid: {
      id: 'aislada_off_grid',
      name: 'Aislada de Red 100% Independiente (Off-Grid)',
      builtin: true,
      config: {
        theme: 'amber',
        useCustomColors: false,
        customPrimary: '#d97706',
        customSecondary: '#059669',
        density: 'balanced',
        fontFamily: 'modern',
        fontScale: 100,
        borderStyle: 'rounded',
        inkMode: 'light',
        autoFitA4: true,
        headerLogoScope: 'all',
        headerLogoFormat: 'logo_and_title',
        coverLogoHeightPx: 48,
        innerHeaderLogoHeightPx: 28,
        headerLogoStyle: 'clean',
        contentVerticalDistribution: 'balanced_fill',
        watermarkEnabled: false,
        watermarkType: 'logo',
        watermarkText: 'CONFIDENCIAL',
        watermarkOpacity: 0.06,
        heroFontSize: 23.5,
        sectionFontSize: 13.0,
        bodyFontSize: 11.0,
        kpiFontSize: 16.5,
        headingLineHeight: 1.18,
        headingLetterSpacing: -0.5,
        subtitleLineHeight: 1.32,
        subtitleSpacing: 6,
        bodyLineHeight: 1.48,
        paragraphGap: 10,
        tableLineHeight: 1.28,
        textWrapBalance: true,
        compactKpiBoxes: true,
        coverFillSheet: true,
        coverHeaderGap: 20,
        coverPhotoGap: 18,
        coverPhotoHeightMm: 78,
        coverSpecsGap: 18,
        coverSpecBoxHeightPx: 112,
        balanceCardHeightPx: 148,
        installationModality: 'off_grid',
        referenceGridPriceEUR: 0.22,
        paragraphAlign: 'left',
        useCustomTextColors: false,
        headingTextColor: '#0f172a',
        bodyTextColor: '#334155',
        mutedTextColor: '#64748b',
        economicBreakdown: 'chapters_units',
        itemPriceDisplay: 'price',
        showTaxBenefits: true,
        showFinancingOptions: true,
        sectionOrder: [
          'cover', 'summary', 'installation', 'energy_balance',
          'packages_comparison', 'economics', 'cashflow_25y', 'closing', 'bill_audit', 'cel'
        ],
        sectionsEnabled: {
          cover: true,
          summary: true,
          bill_audit: false,
          installation: true,
          energy_balance: true,
          packages_comparison: false,
          economics: true,
          cashflow_25y: true,
          cel: false,
          closing: true
        },
        lockedTexts: {
          coverMainTitle: 'PROYECTO INTEGRAL DE | ENERGÍA 100% AISLADA (OFF-GRID)',
          coverSubtitle: 'Independencia energética total sin conexión a red: generación propia, almacenamiento LFP y valor actualizado de tu energía',
          coverLandscapeTitle: 'Instalación Aislada 100% Off-Grid',
          useLockedSummary: true,
          summaryTemplate: 'Sistema energético 100% autónomo (Off-Grid) para {{clientName}} compuesto por {{numPanels}} módulos solares ({{kwp}} kWp){{windPhrase}} y reserva en baterías LFP. Produce {{annualYield}} kWh/año propios valorados en {{ahorroAnual}} €/año a precio actual de mercado, sin facturas eléctricas ni peajes de red y con amortización en {{payback}} años.',
          useLockedPaymentTerms: true,
          milestone1Pct: 30,
          milestone1Text: 'A la firma del contrato (reserva de generadores y banco de baterías LFP)',
          milestone2Pct: 50,
          milestone2Text: 'Al acopio en el emplazamiento e inicio del montaje e integración de baterías',
          milestone3Pct: 20,
          milestone3Text: 'A la puesta en marcha en isla, pruebas de autonomía 24h y entrega final CIE',
          validityDays: 30,
          legalNotes: 'Oferta llave en mano para instalación aislada de red (Off-Grid) válida durante {{validityDays}} días. Incluye ingeniería de autonomía, suministro Tier-1, almacenamiento LFP con gestión BMS y legalización CIE.'
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

  // ── RESOLUCIÓN CENTRALIZADA DEL LOGO CORPORATIVO (SSOT) ───────────────────
  function getCompanyLogoSrc() {
    try {
      if (global.customCompanyLogoBase64) return global.customCompanyLogoBase64;
      if (global.RACompanyBranding && typeof global.RACompanyBranding.getBranding === 'function') {
        var b = global.RACompanyBranding.getBranding();
        if (b && b.logo) return b.logo;
      }
      var ls = localStorage.getItem('ra_company_logo');
      if (ls) return ls;
      var sb = JSON.parse(localStorage.getItem('ra_company_branding') || '{}');
      if (sb && sb.logo) return sb.logo;
      if (global.RA_DEFAULT_COVER_IMAGE) return global.RA_DEFAULT_COVER_IMAGE;
    } catch (e) {}
    return '';
  }

  function renderHeaderLogo(isCover, isClosing) {
    var cfg = getActiveConfig();
    var scope = cfg.headerLogoScope || 'all';
    if (scope === 'none' && !isCover) return '';
    if (scope === 'cover_closing' && !isCover && !isClosing) return '';

    var logoSrc = getCompanyLogoSrc();
    if (!logoSrc) return '';

    var h = isCover ? (Number(cfg.coverLogoHeightPx) || 48) : (Number(cfg.innerHeaderLogoHeightPx) || 28);
    var styleMode = cfg.headerLogoStyle || 'clean';
    var wrapClass = 'ra-header-logo-wrap' + (styleMode === 'pill' ? ' ra-logo-pill' : (styleMode === 'subtle' ? ' ra-logo-subtle' : ''));
    var imgClass = isCover ? 'ra-cover-logo-img' : 'ra-header-logo-img';

    return '<span class="' + wrapClass + '">' +
      '<img src="' + logoSrc + '" class="' + imgClass + '" style="height:' + h + 'px;max-height:' + h + 'px;max-width:180px;object-fit:contain;vertical-align:middle;" alt="Logo corporativo"/>' +
    '</span>';
  }

  // ── EXTRACTOR AUTOMÁTICO DE COLORES DEL LOGO CORPORATIVO (OFFSCREEN CANVAS) ──
  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(function(v) {
      return Math.min(255, Math.max(0, Math.round(v))).toString(16).padStart(2, '0');
    }).join('');
  }

  function extractColorsFromCompanyLogo(callback) {
    var logoSrc = getCompanyLogoSrc() || 'assets/coopgreen-cover.jpg';

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

  function getFullStudioState() {
    var st = loadState();
    return {
      activePresetId: st.activePresetId || "residencial_rapido",
      activeConfig: cloneObj(st.activeConfig),
      customPresets: cloneObj(st.customPresets || {})
    };
  }

  function setFullStudioState(incoming) {
    if (!incoming || typeof incoming !== "object") return;
    var st = loadState();
    if (incoming.activePresetId) st.activePresetId = incoming.activePresetId;
    if (incoming.customPresets && typeof incoming.customPresets === "object") {
      st.customPresets = cloneObj(incoming.customPresets);
    }
    if (incoming.activeConfig && typeof incoming.activeConfig === "object") {
      st.activeConfig = mergeConfigWithDefaults(incoming.activeConfig);
    }
    saveState();
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
      case 'bricolage':
        return '"Bricolage Grotesque", "Inter", system-ui, sans-serif';
      case 'yugothic_bold':
        return '"Yu Gothic", "YuGothic", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      case 'dmsans_italic':
        return '"DM Sans", "Inter", system-ui, sans-serif';
      case 'montserrat_medium':
        return '"Montserrat", "Inter", system-ui, sans-serif';
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

    // 4 Tamaños de letra independientes por rol jerárquico (en px, modulados además por Escala Global si se usa)
    var heroSizeBase = Number(cfg.heroFontSize) || 23.5;
    var secSizeBase  = Number(cfg.sectionFontSize) || 13.0;
    var bodySizeBase = Number(cfg.bodyFontSize) || 11.0;
    var kpiSizeBase  = Number(cfg.kpiFontSize) || 16.5;

    var heroPxPortrait  = (heroSizeBase * scaleRatio).toFixed(1) + 'px';
    var secPxPortrait   = (secSizeBase * scaleRatio).toFixed(1) + 'px';
    var subPxPortrait   = (Math.max(9.5, secSizeBase * 0.90) * scaleRatio).toFixed(1) + 'px';
    var bodyPxPortrait  = (bodySizeBase * scaleRatio).toFixed(1) + 'px';
    var tblPxPortrait   = (Math.max(8.5, bodySizeBase * 0.95) * scaleRatio).toFixed(1) + 'px';
    var kpiPxPortrait   = (kpiSizeBase * scaleRatio).toFixed(1) + 'px';
    var kpiLblPortrait  = (Math.max(7.5, kpiSizeBase * 0.53) * scaleRatio).toFixed(1) + 'px';
    var kpiSubPortrait  = (Math.max(7.5, kpiSizeBase * 0.50) * scaleRatio).toFixed(1) + 'px';

    var heroPxLandscape = (heroSizeBase * 1.55 * scaleRatio).toFixed(1) + 'px';
    var secPxLandscape  = (secSizeBase * 1.50 * scaleRatio).toFixed(1) + 'px';
    var subPxLandscape  = (secSizeBase * 1.25 * scaleRatio).toFixed(1) + 'px';
    var bodyPxLandscape = (bodySizeBase * 1.25 * scaleRatio).toFixed(1) + 'px';
    var tblPxLandscape  = (bodySizeBase * 1.16 * scaleRatio).toFixed(1) + 'px';
    var kpiPxLandscape  = (kpiSizeBase * 1.35 * scaleRatio).toFixed(1) + 'px';
    var kpiLblLandscape = (Math.max(8.5, kpiSizeBase * 0.62) * scaleRatio).toFixed(1) + 'px';

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
        '.sheet { font-family: ' + fontStack + ' !important; padding: ' + sheetPadLandscape + ' !important; font-size: ' + bodyPxLandscape + ' !important; }',
        '.sheet[data-section-id="cover"] h1 { font-size: ' + heroPxLandscape + ' !important; }',
        '.sheet[data-section-id="cover"] p { font-size: ' + subPxLandscape + ' !important; }',
        '.sheet-title-txt { font-size: ' + secPxLandscape + ' !important; }',
        '.sheet p:not(.cover-sub), .sheet li { font-size: ' + bodyPxLandscape + ' !important; }',
        '.hero-val { font-size: ' + kpiPxLandscape + ' !important; }',
        '.hero-lbl { font-size: ' + kpiLblLandscape + ' !important; }',
        '.card { border-radius: ' + cardRadius + ' !important; padding: ' + (isCompact ? '8px 12px' : (isEditorial ? '14px 18px' : '11px 15px')) + ' !important; }',
        '.table-clean th, .table-clean td { padding: ' + tablePad + ' !important; font-size: ' + tblPxLandscape + ' !important; line-height: ' + tblLH + ' !important; }'
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
      if (cfg.contentVerticalDistribution !== 'top_compact') {
        css.push(
          '.sheet { display: flex !important; flex-direction: column !important; justify-content: space-between !important; }',
          '.sheet-body-content { flex: 1 1 auto !important; display: flex !important; flex-direction: column !important; justify-content: space-between !important; min-height: 0 !important; }'
        );
      }
    } else {
      css.push(
        '.page-sheet { font-family: ' + fontStack + ' !important; padding: ' + sheetPadPortrait + ' !important; font-size: ' + bodyPxPortrait + ' !important; }',
        '.cover-hero-h1 { font-size: ' + heroPxPortrait + ' !important; }',
        '.cover-hero-sub { font-size: ' + subPxPortrait + ' !important; }',
        'h2 { margin: ' + (isCompact ? '10px 0 6px' : (isEditorial ? '18px 0 10px' : '13px 0 8px')) + ' !important; font-size: ' + secPxPortrait + ' !important; }',
        'p, li, #ra-ai-summary-content, .decision-row { font-size: ' + bodyPxPortrait + ' !important; }',
        '.tech-card, .hero-card, .closer-hero-card, .decision-card, .cover-spec-box, .cover-client-card, .chart-box { border-radius: ' + cardRadius + ' !important; }',
        'table th, table td { padding: ' + tablePad + ' !important; font-size: ' + tblPxPortrait + ' !important; line-height: ' + tblLH + ' !important; }',
        '.cover-spec-val, .hero-val, .closer-hero-val { font-size: ' + kpiPxPortrait + ' !important; line-height: 1.15 !important; }',
        '.cover-spec-label, .hero-lbl, .closer-hero-lbl { font-size: ' + kpiLblPortrait + ' !important; }',
        '.cover-spec-sub, .closer-hero-sub { font-size: ' + kpiSubPortrait + ' !important; }'
      );
      // Control de Distribución Vertical y Espaciado de Bloques de Portada
      var fillSheet = cfg.coverFillSheet !== false;
      var cHdrGap   = (cfg.coverHeaderGap !== undefined ? Number(cfg.coverHeaderGap) : 20);
      var cPhoGap   = (cfg.coverPhotoGap !== undefined ? Number(cfg.coverPhotoGap) : 18);
      var cPhoH     = (cfg.coverPhotoHeightMm !== undefined ? Number(cfg.coverPhotoHeightMm) : 78);
      var cSpcGap   = (cfg.coverSpecsGap !== undefined ? Number(cfg.coverSpecsGap) : 18);
      var cBoxH     = (cfg.coverSpecBoxHeightPx !== undefined ? Number(cfg.coverSpecBoxHeightPx) : 112);
      var cIconPx   = Math.round(Math.max(36, Math.min(54, cBoxH * 0.38)));
      var cBoxPadV  = Math.round(Math.max(7, Math.min(18, (cBoxH - 80) * 0.30 + 8)));
      var balCardH  = (cfg.balanceCardHeightPx !== undefined ? Number(cfg.balanceCardHeightPx) : 145);
      var balPadV   = Math.round(Math.max(8, Math.min(22, (balCardH - 120) * 0.15 + 10)));

      css.push(
        '.page-sheet.cover-page { padding: 15mm 18mm 13mm !important; display: flex !important; flex-direction: column !important; justify-content: space-between !important; }',
        '.page-sheet.cover-page > div:first-child {' +
          (fillSheet
            ? ' flex: 1 1 auto !important; display: flex !important; flex-direction: column !important; justify-content: space-between !important; padding-bottom: 10px !important;'
            : ' display: block !important;') +
        ' }',
        '.cover-brand-row { padding-bottom: 12px !important; flex-shrink: 0 !important; }',
        '.cover-hero-title { margin-top: ' + cHdrGap + 'px !important; margin-bottom: ' + cPhoGap + 'px !important; flex-shrink: 0 !important; }',
        '.cover-photo-card { height: ' + cPhoH + 'mm !important; min-height: ' + Math.max(40, cPhoH - 12) + 'mm !important; ' + (fillSheet ? 'flex: 1 1 auto !important; max-height: ' + (cPhoH + 28) + 'mm !important;' : '') + ' margin: 0 0 ' + cSpcGap + 'px 0 !important; }',
        '.cover-specs-section { flex-shrink: 0 !important; margin-top: ' + (fillSheet ? 'auto' : '0') + ' !important; }',
        '.cover-specs-grid { gap: 10px !important; margin: 6px 0 8px !important; }',
        '.cover-spec-box { min-height: ' + cBoxH + 'px !important; padding: ' + cBoxPadV + 'px 8px !important; justify-content: space-around !important; }',
        '.cover-spec-icon { width: ' + cIconPx + 'px !important; height: ' + cIconPx + 'px !important; margin-bottom: 6px !important; border-radius: 10px !important; }',
        '.cover-spec-label { line-height: 1.24 !important; margin-bottom: 4px !important; }',
        '.cover-spec-val { white-space: nowrap !important; }',
        '.cover-spec-sub { line-height: 1.22 !important; margin-top: 4px !important; }',
        '.cover-footer { padding-top: 10px !important; flex-shrink: 0 !important; }',
        '.ra-infographic-card { padding: ' + balPadV + 'px 14px !important; }',
        '.ra-card-cara-a-cara > div:last-child > div { min-height: ' + balCardH + 'px !important; }',
        '.ra-card-reloj-solar > div:last-child > div { min-height: ' + Math.round(balCardH * 0.78) + 'px !important; }'
      );
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
      if (cfg.contentVerticalDistribution !== 'top_compact') {
        css.push(
          '.page-sheet:not(.cover-page) { display: flex !important; flex-direction: column !important; justify-content: space-between !important; }',
          '.page-sheet:not(.cover-page) > div:first-child { flex: 1 1 auto !important; display: flex !important; flex-direction: column !important; justify-content: space-between !important; min-height: 0 !important; }'
        );
      }
    }

    // Reglas universales de logotipos en encabezados
    var innerLogoH = (Number(cfg.innerHeaderLogoHeightPx) || 28);
    var coverLogoH = (Number(cfg.coverLogoHeightPx) || 48);
    css.push(
      '/* Logotipos y Encabezados Corporativos */',
      '.ra-header-logo-wrap { display: inline-flex !important; align-items: center !important; justify-content: center !important; line-height: 1 !important; }',
      '.ra-header-logo-img { height: ' + innerLogoH + 'px !important; max-height: ' + innerLogoH + 'px !important; max-width: 180px !important; object-fit: contain !important; vertical-align: middle !important; transition: max-height 0.2s ease !important; }',
      '.ra-cover-logo-img { height: ' + coverLogoH + 'px !important; max-height: ' + coverLogoH + 'px !important; max-width: 220px !important; object-fit: contain !important; vertical-align: middle !important; }',
      '.ra-logo-pill { background: rgba(255, 255, 255, 0.95) !important; padding: 3px 8px !important; border-radius: 6px !important; box-shadow: 0 1px 4px rgba(0,0,0,0.08) !important; border: 1px solid rgba(203, 213, 225, 0.8) !important; }',
      '.ra-logo-subtle img { opacity: 0.78 !important; }',
      '.ra-logo-subtle img:hover { opacity: 1 !important; }',
      '.cover-header.ra-header-flex { display: flex !important; justify-content: space-between !important; align-items: center !important; }'
    );

    // Reglas según nivel de desglose económico y visualización de precios de partida
    if (cfg.economicBreakdown === 'turnkey_only' || cfg.itemPriceDisplay === 'included') {
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

    // Reglas específicas para variantes tipográficas de alta fidelidad
    if (cfg.fontFamily === 'yugothic_bold') {
      css.push(
        'body, .sheet, .page-sheet { font-weight: 700 !important; }',
        'h1, h2, h3, .cover-hero-h1, .sheet-title-txt { font-weight: 900 !important; }'
      );
    } else if (cfg.fontFamily === 'dmsans_italic') {
      css.push(
        'p, .lead-paragraph, .section-desc, .closing-notes { font-style: italic !important; }',
        'table, th, td, .kpi-val, .cover-spec-val, .hero-val, .closer-hero-val { font-style: normal !important; }'
      );
    } else if (cfg.fontFamily === 'montserrat_medium') {
      css.push(
        'body, .sheet, .page-sheet, p, td { font-weight: 500 !important; }',
        'h1, h2, h3, .cover-hero-h1, .sheet-title-txt { font-weight: 700 !important; }'
      );
    }

    // Marca de Agua en Páginas Interiores (Excluye Portada estrictamente)
    if (cfg.watermarkEnabled) {
      var wmType = cfg.watermarkType || 'logo';
      var wmOpacity = typeof cfg.watermarkOpacity === 'number' ? Math.max(0.01, Math.min(0.5, cfg.watermarkOpacity)) : 0.06;
      var logoWatermarkSrc = getCompanyLogoSrc();

      if (wmType === 'logo' && logoWatermarkSrc) {
        css.push(
          '.page-sheet:not(.cover-page), .sheet:not([data-section-id="cover"]) { position: relative !important; overflow: hidden !important; }',
          '.page-sheet:not(.cover-page)::before, .sheet:not([data-section-id="cover"])::before {',
          '  content: "" !important;',
          '  position: absolute !important;',
          '  top: 50% !important;',
          '  left: 50% !important;',
          '  width: 52% !important;',
          '  height: 52% !important;',
          '  transform: translate(-50%, -50%) rotate(-25deg) !important;',
          '  background-image: url("' + logoWatermarkSrc + '") !important;',
          '  background-repeat: no-repeat !important;',
          '  background-position: center center !important;',
          '  background-size: contain !important;',
          '  opacity: ' + wmOpacity + ' !important;',
          '  filter: grayscale(100%) !important;',
          '  pointer-events: none !important;',
          '  z-index: 0 !important;',
          '  -webkit-print-color-adjust: exact !important;',
          '  print-color-adjust: exact !important;',
          '}',
          '.page-sheet:not(.cover-page) > *, .sheet:not([data-section-id="cover"]) > * { position: relative !important; z-index: 1 !important; }'
        );
      } else {
        var wmText = String(cfg.watermarkText || 'CONFIDENCIAL').trim();
        if (wmText) {
          var cleanWmText = wmText.replace(/["\\]/g, '\\$&');
          css.push(
            '.page-sheet:not(.cover-page), .sheet:not([data-section-id="cover"]) { position: relative !important; overflow: hidden !important; }',
            '.page-sheet:not(.cover-page)::before, .sheet:not([data-section-id="cover"])::before {',
            '  content: "' + cleanWmText + '" !important;',
            '  position: absolute !important;',
            '  top: 50% !important;',
            '  left: 50% !important;',
            '  transform: translate(-50%, -50%) rotate(-30deg) !important;',
            '  font-size: 72px !important;',
            '  font-weight: 900 !important;',
            '  letter-spacing: 0.18em !important;',
            '  text-transform: uppercase !important;',
            '  color: #0f172a !important;',
            '  opacity: ' + wmOpacity + ' !important;',
            '  pointer-events: none !important;',
            '  white-space: nowrap !important;',
            '  z-index: 0 !important;',
            '  -webkit-print-color-adjust: exact !important;',
            '  print-color-adjust: exact !important;',
            '}',
            '.page-sheet:not(.cover-page) > *, .sheet:not([data-section-id="cover"]) > * { position: relative !important; z-index: 1 !important; }'
          );
        }
      }
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

  // ── 7. MOTOR DE AUTO-ENCAJE A4 ("GUARDIÁN ANTI-DESBORDE PROGRESIVO EN 5 ETAPAS") ──
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
      '      var innerWrap = sheet.querySelector(".sheet-body-content") || sheet.querySelector(":scope > div:first-child");',
      '      if (innerWrap) {',
      '        innerWrap.style.transform = "";',
      '        innerWrap.style.transformOrigin = "top center";',
      '        innerWrap.removeAttribute("data-fit-scale");',
      '      }',
      '      sheet.style.zoom = "";',
      '      sheet.removeAttribute("data-autofit-zoom");',
      '      var maxIter = 10;',
      '      var iter = 0;',
      '      var tolerance = 3;',
      '      while (sheet.scrollHeight > sheet.clientHeight + tolerance && iter < maxIter) {',
      '        iter++;',
      '        if (iter === 1) {',
      '          // Etapa 1: Compactar márgenes y separaciones de cabeceras y bloques',
      '          sheet.querySelectorAll(".cover-header, .sheet-head, h2, .sheet-title-txt").forEach(function(h) {',
      '            h.style.marginTop = "3px";',
      '            h.style.marginBottom = "5px";',
      '          });',
      '          sheet.querySelectorAll(".card, .tech-card, .chart-box, .decision-card").forEach(function(box) {',
      '            box.style.paddingTop = "6px";',
      '            box.style.paddingBottom = "6px";',
      '            box.style.marginBottom = "5px";',
      '          });',
      '        } else if (iter === 2) {',
      '          // Etapa 2: Reducir espaciado en tablas, celdas y textos explicativos',
      '          sheet.querySelectorAll("table td, table th").forEach(function(cell) {',
      '            cell.style.paddingTop = "2px";',
      '            cell.style.paddingBottom = "2px";',
      '          });',
      '          sheet.querySelectorAll("p, li").forEach(function(p) {',
      '            p.style.marginBottom = "4px";',
      '            p.style.lineHeight = "1.25";',
      '          });',
      '          sheet.querySelectorAll(".cover-spec-box").forEach(function(sb) {',
      '            sb.style.minHeight = "76px";',
      '            sb.style.padding = "4px 4px";',
      '          });',
      '        } else if (iter === 3) {',
      '          // Etapa 3: Reducir altura máxima de fotos 3D y gráficos',
      '          var photo = sheet.querySelector(".cover-photo-card, .photo-card-hero");',
      '          if (photo) {',
      '            photo.style.maxHeight = "50mm";',
      '            photo.style.minHeight = "36mm";',
      '            photo.style.margin = "4px 0 6px";',
      '          }',
      '          sheet.querySelectorAll(".chart-box, svg.chart").forEach(function(cb) {',
      '            cb.style.maxHeight = "110px";',
      '          });',
      '        } else if (iter >= 4) {',
      '          // Etapa 4: Micro-escalado interno elástico del contenedor de contenido (sin deformar la hoja)',
      '          if (innerWrap) {',
      '            var curScale = parseFloat(innerWrap.getAttribute("data-fit-scale") || "1");',
      '            var footEl = sheet.querySelector(".sheet-footer, .cover-footer, .page-footer");',
      '            var availH = sheet.clientHeight - (footEl ? (footEl.offsetHeight || 30) : 0);',
      '            var curH = (innerWrap.offsetHeight || innerWrap.scrollHeight) * curScale;',
      '            var ratio = (availH > 0 && curH > 0) ? (availH / curH) : (sheet.clientHeight / sheet.scrollHeight);',
      '            var targetScale = Math.max(0.85, Math.min(curScale * ratio * 0.99, curScale - 0.02));',
      '            innerWrap.setAttribute("data-fit-scale", targetScale.toFixed(3));',
      '            innerWrap.style.transform = "scale(" + targetScale.toFixed(3) + ")";',
      '            innerWrap.style.transformOrigin = "top center";',
      '            if (curH * (targetScale / curScale) <= availH) { break; }',
      '          } else {',
      '            var curZ = parseFloat(sheet.getAttribute("data-autofit-zoom") || "1");',
      '            var nextZ = Math.max(0.85, Math.min(curZ - 0.02, (sheet.clientHeight / sheet.scrollHeight) * 0.99));',
      '            sheet.setAttribute("data-autofit-zoom", nextZ.toFixed(3));',
      '            sheet.style.zoom = nextZ.toFixed(3);',
      '          }',
      '        }',
      '      }',
      '      // Etapa 5: Anclar pie de página firmemente al final',
      '      var foot = sheet.querySelector(".sheet-footer, .cover-footer, .page-footer");',
      '      if (foot) {',
      '        foot.style.marginTop = "auto";',
      '      }',
      '      var warn = sheet.querySelector(".dossier-overflow-warn");',
      '      if (warn && sheet.scrollHeight <= sheet.clientHeight + 4) warn.remove();',
      '    });',
      '  }',
      '  window.RA_runA4AutoFit = runA4AutoFit;',
      '  if (document.fonts && document.fonts.ready) {',
      '    document.fonts.ready.then(function() { setTimeout(runA4AutoFit, 60); });',
      '  }',
      '  window.addEventListener("load", function() { setTimeout(runA4AutoFit, 100); setTimeout(runA4AutoFit, 400); });',
      '  window.addEventListener("beforeprint", runA4AutoFit);',
      '  window.addEventListener("resize", function() {',
      '    clearTimeout(window._raFitDebounce);',
      '    window._raFitDebounce = setTimeout(runA4AutoFit, 120);',
      '  });',
      '  setTimeout(runA4AutoFit, 60);',
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

  // ── 9. SINCRONIZACIÓN DE UI EN PASO 5 & MODALIDAD DE INSTALACIÓN ───────────
  var INSTALLATION_MODALITIES = [
    {
      id: 'grid_zero',
      label: 'Conectada a Red: Producción Adaptada al Consumo (Vertido Cero)',
      shortLabel: 'Conectada · Adaptada al Consumo',
      desc: 'Foco en autoconsumo instantáneo ajustado a la demanda horaria, sin venta de excedentes ni CEL.'
    },
    {
      id: 'grid_surplus_cel',
      label: 'Conectada a Red: Excedentes a Red / Monedero / Comunidad Energética (CEL)',
      shortLabel: 'Conectada · Excedentes / CEL',
      desc: 'Comparativa completa de factura antes/después, compensación de excedentes, batería virtual y CEL.'
    },
    {
      id: 'grid_backup',
      label: 'Conectada Híbrida + Respaldo Anti-Apagones (Independencia 24h)',
      shortLabel: 'Conectada Híbrida + Respaldo 24h',
      desc: 'Ahorro en factura + foco en horas de reserva crítica en batería LFP frente a cortes de red.'
    },
    {
      id: 'off_grid',
      label: 'Aislada de Red (100% Independiente / Off-Grid)',
      shortLabel: 'Aislada 100% (Off-Grid)',
      desc: 'Sin comparativa de facturas previas. Muestra únicamente el coste de instalación y el valor actualizado de la energía generada que no se compra a la red.'
    }
  ];

  function applyModalityRulesToConfig(cfg, modalityId) {
    if (!cfg) return;
    cfg.installationModality = modalityId || 'grid_surplus_cel';
    cfg.sectionsEnabled = cfg.sectionsEnabled || {};
    cfg.lockedTexts = cfg.lockedTexts || {};

    if (cfg.installationModality === 'off_grid') {
      cfg.sectionsEnabled.bill_audit = false;
      cfg.sectionsEnabled.cel = false;
      cfg.lockedTexts.coverMainTitle = 'PROYECTO INTEGRAL DE | ENERGÍA 100% AISLADA (OFF-GRID)';
      cfg.lockedTexts.coverSubtitle = 'Independencia energética total sin conexión a red: generación propia, almacenamiento LFP y valor actualizado de tu energía';
    } else if (cfg.installationModality === 'grid_zero') {
      cfg.sectionsEnabled.bill_audit = true;
      cfg.sectionsEnabled.cel = false;
      cfg.lockedTexts.coverMainTitle = 'PROYECTO INTEGRAL DE | AUTOCONSUMO CON VERTIDO CERO';
      cfg.lockedTexts.coverSubtitle = 'Estudio de viabilidad técnica y análisis de rentabilidad adaptado a la curva de demanda sin inyección';
    } else if (cfg.installationModality === 'grid_backup') {
      cfg.sectionsEnabled.bill_audit = true;
      cfg.sectionsEnabled.cel = false;
      cfg.lockedTexts.coverMainTitle = 'PROYECTO INTEGRAL DE | AUTOCONSUMO HÍBRIDO CON RESPALDO CRÍTICO';
      cfg.lockedTexts.coverSubtitle = 'Autosuficiencia diurna y nocturna con sistema anti-apagones y almacenamiento de alta disponibilidad';
    } else if (cfg.installationModality === 'grid_surplus_cel') {
      cfg.sectionsEnabled.bill_audit = true;
      cfg.sectionsEnabled.cel = true;
      cfg.lockedTexts.coverMainTitle = 'PROYECTO INTEGRAL DE | GENERACIÓN RENOVABLE Y COMUNIDAD ENERGÉTICA';
      cfg.lockedTexts.coverSubtitle = 'Estudio de viabilidad técnica, diseño CAD 3D, compensación de excedentes y monetización local CEL';
    }
  }

  function setInstallationModality(modalityId, refPriceEUR) {
    var st = loadState();
    var cfg = st.activeConfig;
    applyModalityRulesToConfig(cfg, modalityId);
    if (typeof refPriceEUR === 'number' && !isNaN(refPriceEUR) && refPriceEUR > 0) {
      cfg.referenceGridPriceEUR = refPriceEUR;
    }
    saveState();
    return cfg;
  }

  function updateStep5IndicatorUI() {
    ensureStep5StudioControlsMounted();
    var st = loadState();
    var cfg = st.activeConfig;
    var sel = document.getElementById('step5-style-preset-select');
    if (sel) {
      var presets = getAllPresets();
      sel.innerHTML = presets.map(function(p) {
        return '<option value="' + p.id + '" ' + (p.id === st.activePresetId ? 'selected' : '') + '>' + p.name + '</option>';
      }).join('');
    }
    var modSel = document.getElementById('step5-installation-modality-select');
    if (modSel) {
      modSel.value = cfg.installationModality || 'grid_surplus_cel';
    }
    var refWrap = document.getElementById('step5-offgrid-refprice-wrap');
    if (refWrap) {
      refWrap.style.display = (cfg.installationModality === 'off_grid') ? 'flex' : 'none';
    }
    var refInput = document.getElementById('step5-offgrid-refprice-input');
    if (refInput && document.activeElement !== refInput) {
      refInput.value = Number(cfg.referenceGridPriceEUR || 0.22).toFixed(2);
    }
    var badge = document.getElementById('step5-style-studio-badge');
    if (badge) {
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

    var cfg = getActiveConfig();
    var curMod = cfg.installationModality || 'grid_surplus_cel';
    var refPrice = Number(cfg.referenceGridPriceEUR || 0.22).toFixed(2);

    var wrapper = document.createElement('div');
    wrapper.id = 'step5-style-studio-wrapper';
    wrapper.style.cssText = 'display:flex;flex-direction:column;gap:5px;margin-bottom:6px;';

    wrapper.innerHTML = [
      '<div style="background:rgba(15,23,42,0.88);border:1px solid rgba(16,185,129,0.35);border-radius:6px;padding:5px 7px;">',
      '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">',
      '    <span style="font-size:8.5px;font-weight:800;color:#34d399;text-transform:uppercase;letter-spacing:0.4px;">⚡ Modalidad de Instalación (Enfoque Presupuesto)</span>',
      '  </div>',
      '  <select id="step5-installation-modality-select" style="width:100%;padding:5px 6px;background:#0f172a;border:1px solid rgba(52,211,153,0.4);border-radius:4px;color:#f8fafc;font-size:9.5px;font-weight:700;outline:none;cursor:pointer;" title="Adapta automáticamente las comparativas, infografías y hojas a instalaciones conectadas o aisladas de red">',
      INSTALLATION_MODALITIES.map(function(m) {
        return '<option value="' + m.id + '" ' + (m.id === curMod ? 'selected' : '') + '>' + m.label + '</option>';
      }).join(''),
      '  </select>',
      '  <div id="step5-offgrid-refprice-wrap" style="display:' + (curMod === 'off_grid' ? 'flex' : 'none') + ';align-items:center;justify-content:space-between;gap:6px;margin-top:5px;padding-top:4px;border-top:1px dashed rgba(255,255,255,0.1);">',
      '    <span style="font-size:8.5px;color:#cbd5e1;font-weight:600;">Precio ref. energía red evitada (€/kWh):</span>',
      '    <input type="number" id="step5-offgrid-refprice-input" min="0.05" max="1.50" step="0.01" value="' + refPrice + '" style="width:62px;padding:2px 5px;background:#1e293b;border:1px solid #f59e0b;border-radius:4px;color:#fbbf24;font-size:9.5px;font-weight:800;text-align:right;">',
      '  </div>',
      '</div>',
      '<div id="step5-style-studio-bar" style="display:grid;grid-template-columns:1.25fr 1fr;gap:5px;">',
      '  <select id="step5-style-preset-select" style="width:100%;padding:6px 7px;background:rgba(15,23,42,0.95);border:1px solid rgba(56,189,248,0.35);border-radius:5px;color:#e2e8f0;font-size:9.5px;font-weight:700;outline:none;cursor:pointer;" title="Perfil rápido de maquetación y estilo para ambos presupuestos">',
      '  </select>',
      '  <button type="button" id="step5-btn-open-style-studio" class="doc-mini-btn" style="padding:6px 6px;font-size:9.5px;font-weight:800;background:rgba(56,189,248,0.12);border:1px solid rgba(56,189,248,0.4);color:#38BDF8;display:flex;align-items:center;justify-content:center;gap:4px;border-radius:5px;cursor:pointer;" title="Configurar estilos, densidad, tipografía, orden de secciones y desglose para presupuestos Horizontal y Vertical">',
      '    ' + _sSvg('palette', 12, '#38BDF8') + ' <span id="step5-style-studio-badge">Maquetación</span>',
      '  </button>',
      '</div>'
    ].join('');

    if (dlBtn && dlBtn.parentNode) {
      dlBtn.parentNode.insertBefore(wrapper, dlBtn.nextSibling);
    } else if (hubCard) {
      hubCard.appendChild(wrapper);
    }

    var modSel = wrapper.querySelector('#step5-installation-modality-select');
    if (modSel) {
      modSel.onchange = function() {
        var val = this.value;
        setInstallationModality(val);
        if (typeof updateBudgetUI === 'function') {
          try { updateBudgetUI(); } catch (e) { console.warn('[StyleStudio] updateBudgetUI error:', e); }
        }
        if (typeof syncCostModalMetrics === 'function') {
          try { syncCostModalMetrics(); } catch (e) { console.warn('[StyleStudio] syncCostModalMetrics error:', e); }
        }
        if (global.showToast) {
          var found = INSTALLATION_MODALITIES.find(function(x) { return x.id === val; });
          global.showToast('MODALIDAD DE PRESUPUESTO', found ? found.shortLabel : 'Modalidad actualizada', 'info', 2200);
        }
      };
    }

    var refInp = wrapper.querySelector('#step5-offgrid-refprice-input');
    if (refInp) {
      refInp.onchange = function() {
        var v = parseFloat(this.value);
        if (!isNaN(v) && v > 0) {
          var st = loadState();
          st.activeConfig.referenceGridPriceEUR = v;
          saveState();
        }
      };
    }

    var sel = wrapper.querySelector('#step5-style-preset-select');
    if (sel) {
      sel.onchange = function() {
        selectPreset(this.value);
        if (global.showToast) global.showToast('PERFIL DE ESTILO ACTIVO', 'Plantilla aplicada para presupuestos Horizontal y Vertical', 'info', 2000);
      };
    }
    var btn = wrapper.querySelector('#step5-btn-open-style-studio');
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
      '      <div style="width:36px;height:36px;border-radius:9px;background:linear-gradient(135deg,' + pal.primary + ',' + pal.secondary + ');display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 4px 12px rgba(0,0,0,0.3);">' + _sSvg('palette', 20, '#ffffff') + '</div>',
      '      <div>',
      '        <h3 style="margin:0;font-size:15px;font-weight:900;color:#fff;letter-spacing:0.3px;">ESTUDIO MAESTRO DE MAQUETACIÓN & ESTILOS (HORIZONTAL + VERTICAL)</h3>',
      '        <div style="font-size:11px;color:#94a3b8;margin-top:2px;">Configura una sola vez: ambos presupuestos se generarán en 1 clic sin desbordes ni retoques manuales</div>',
      '      </div>',
      '    </div>',
      '    <button type="button" id="pss-btn-close" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);color:#cbd5e1;width:32px;height:32px;border-radius:8px;cursor:pointer;font-weight:900;font-size:14px;display:flex;align-items:center;justify-content:center;">' + _sSvg('close', 16, '#cbd5e1') + '</button>',
      '  </div>',

      // Barra superior de Perfiles (Presets)
      '  <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;padding:10px 20px;background:#1e293b;border-bottom:1px solid rgba(255,255,255,0.08);">',
      '    <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:260px;">',
      '      <span style="font-size:11px;font-weight:800;color:#38bdf8;text-transform:uppercase;white-space:nowrap;display:inline-flex;align-items:center;gap:4px;">' + _sSvg('bolt', 13, '#38bdf8') + ' Perfil Activo:</span>',
      '      <select id="pss-preset-select" style="flex:1;padding:7px 10px;background:#0f172a;border:1px solid #475569;border-radius:6px;color:#f8fafc;font-size:12px;font-weight:700;outline:none;">',
               presetOptions,
      '      </select>',
      '    </div>',
      '    <div style="display:flex;align-items:center;gap:6px;">',
      '      <button type="button" id="pss-btn-save-preset" style="padding:6px 11px;background:rgba(16,185,129,0.15);border:1px solid #10b981;color:#34d399;border-radius:6px;font-size:11px;font-weight:800;cursor:pointer;">+ Guardar como Perfil</button>',
      (isCustomPreset ? '<button type="button" id="pss-btn-del-preset" style="padding:6px 10px;background:rgba(239,68,68,0.15);border:1px solid #ef4444;color:#f87171;border-radius:6px;font-size:11px;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;gap:4px;">' + _sSvg('trash', 12, '#f87171') + ' Eliminar</button>' : ''),
      '    </div>',
      '  </div>',

      // Navegación de Pestañas
      '  <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:4px;padding:8px 20px;background:#0f172a;border-bottom:1px solid rgba(255,255,255,0.08);">',
      buildTabButton('visual',     '1. Paleta & Densidad',       _sSvg('palette', 13, 'currentColor')),
      buildTabButton('typography', '2. Interlineado & Textos',   _sSvg('type', 13, 'currentColor')),
      buildTabButton('sections',   '3. Secciones & Orden',       _sSvg('layout', 13, 'currentColor')),
      buildTabButton('economics',  '4. Desglose Económico',      _sSvg('euro', 13, 'currentColor')),
      buildTabButton('texts',      '5. Plantillas & Cierre',     _sSvg('edit', 13, 'currentColor')),
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
      '      <button type="button" id="pss-btn-emit-landscape" style="padding:8px 14px;background:#0f172a;border:1px solid #38bdf8;color:#38bdf8;border-radius:6px;font-size:11.5px;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;gap:5px;">' + _sSvg('monitor', 13, '#38bdf8') + ' Probar Horizontal</button>',
      '      <button type="button" id="pss-btn-emit-portrait" style="padding:8px 14px;background:#0f172a;border:1px solid #a78bfa;color:#c4b5fd;border-radius:6px;font-size:11.5px;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;gap:5px;">' + _sSvg('fileText', 13, '#c4b5fd') + ' Probar Vertical</button>',
      '      <button type="button" id="pss-btn-save-close" style="padding:9px 20px;background:linear-gradient(135deg,#10b981,#059669);border:none;color:#fff;border-radius:6px;font-size:12px;font-weight:900;cursor:pointer;box-shadow:0 4px 14px rgba(16,185,129,0.35);display:inline-flex;align-items:center;gap:5px;">' + _sSvg('check', 14, '#ffffff') + ' GUARDAR ESTILO MAESTRO</button>',
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
    var heroSize = Number(cfg.heroFontSize) || 23.5;
    var secSize  = Number(cfg.sectionFontSize) || 13.0;
    var bodySize = Number(cfg.bodyFontSize) || 11.0;
    var kpiSize  = Number(cfg.kpiFontSize) || 16.5;

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
    var fillSheet = cfg.coverFillSheet !== false;
    var cHdrGap   = cfg.coverHeaderGap !== undefined ? Number(cfg.coverHeaderGap) : 20;
    var cPhoGap   = cfg.coverPhotoGap !== undefined ? Number(cfg.coverPhotoGap) : 18;
    var cPhoH     = cfg.coverPhotoHeightMm !== undefined ? Number(cfg.coverPhotoHeightMm) : 78;
    var cSpcGap   = cfg.coverSpecsGap !== undefined ? Number(cfg.coverSpecsGap) : 18;
    var cBoxH     = cfg.coverSpecBoxHeightPx !== undefined ? Number(cfg.coverSpecBoxHeightPx) : 112;
    var balCardH  = cfg.balanceCardHeightPx !== undefined ? Number(cfg.balanceCardHeightPx) : 145;
    var histoH    = cfg.histogramHeightPx !== undefined ? Number(cfg.histogramHeightPx) : 200;
    var histoMode = cfg.histogramFillMode || 'gradient';
    var histoBarCol = cfg.histogramBarColor || '#38bdf8';
    var histoBarColEnd = cfg.histogramBarColorEnd || '#0284c7';
    var histoPeakCol = cfg.histogramPeakColor || '#10b981';
    var histoPeakColEnd = cfg.histogramPeakColorEnd || '#059669';
    var histoValSize = cfg.histogramValueFontSize !== undefined ? Number(cfg.histogramValueFontSize) : 7.5;
    var histoLblSize = cfg.histogramLabelFontSize !== undefined ? Number(cfg.histogramLabelFontSize) : 8.0;
    var histoAxSize  = cfg.histogramAxisFontSize !== undefined ? Number(cfg.histogramAxisFontSize) : 8.0;
    var amortH       = cfg.amortHeightPx !== undefined ? Number(cfg.amortHeightPx) : 200;
    var amortMode    = cfg.amortFillMode || 'gradient';
    var amortLineCol = cfg.amortLineColor || pal.primary || '#059669';
    var amortAreaCol = cfg.amortAreaColor || pal.primary || '#10b981';
    var amortAreaColEnd = cfg.amortAreaColorEnd || pal.light || '#d1fae5';
    var amortPbCol   = cfg.amortPaybackColor || pal.dark || '#047857';
    var amortAxSize  = cfg.amortAxisFontSize !== undefined ? Number(cfg.amortAxisFontSize) : 8.0;
    var amortPbSize  = cfg.amortPaybackFontSize !== undefined ? Number(cfg.amortPaybackFontSize) : 8.0;
    var celFlowH     = cfg.celFlowBarHeightPx !== undefined ? Number(cfg.celFlowBarHeightPx) : 26;
    var celFlowSize  = cfg.celFlowFontSize !== undefined ? Number(cfg.celFlowFontSize) : 9.5;
    var celFlowDescSize = cfg.celFlowDescFontSize !== undefined ? Number(cfg.celFlowDescFontSize) : 9.0;
    var celRadarH    = cfg.celRadarHeightPx !== undefined ? Number(cfg.celRadarHeightPx) : 235;
    var celRadarLblSize = cfg.celRadarLabelFontSize !== undefined ? Number(cfg.celRadarLabelFontSize) : 11.5;
    var celRadarDistSize = cfg.celRadarDistanceFontSize !== undefined ? Number(cfg.celRadarDistanceFontSize) : 10.5;
    var celGap       = cfg.celCardsGapPx !== undefined ? Number(cfg.celCardsGapPx) : 8;
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
    var prevHeroPx = Math.round(heroSize * 0.82 * 10) / 10;
    var prevSubPx  = Math.round(secSize * 0.88 * 10) / 10;
    var prevBodyPx = bodySize;
    var prevKpiValPx = Math.round(kpiSize * 0.82 * 10) / 10;
    var prevKpiLblPx = Math.max(7.5, Math.round(kpiSize * 0.50 * 10) / 10);

    return [
      // 1. VISTA PREVIA EN TIEMPO REAL
      '<div style="background:#ffffff;border:2px solid ' + pal.primary + ';border-radius:10px;padding:14px 18px;color:#0f172a;box-shadow:0 8px 25px rgba(0,0,0,0.35);">',
      '  <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid ' + pal.primary + ';padding-bottom:6px;margin-bottom:10px;">',
      '    <span style="font-size:10px;font-weight:900;color:' + pal.primary + ';letter-spacing:0.8px;text-transform:uppercase;display:inline-flex;align-items:center;gap:5px;">' + _sSvg('eye', 13, pal.primary) + ' VISTA PREVIA EN VIVO (TAMAÑOS, INTERLINEADO & COLORES)</span>',
      '    <span style="font-size:9.5px;font-weight:800;background:' + pal.light + ';color:' + pal.dark + ';padding:2px 8px;border-radius:4px;">SIMULACIÓN A4 REAL</span>',
      '  </div>',
      '  <div id="pss-live-preview-box" style="font-family:' + getFontStack(cfg.fontFamily).replace(/"/g, "'") + ';">',
      '    <div id="pss-prev-h1" style="font-size:' + prevHeroPx + 'px;font-weight:900;text-align:center;text-transform:uppercase;color:' + previewHeadCol + ';line-height:' + hLH + ';letter-spacing:' + hLS + 'px;' + (useBalance ? 'text-wrap:balance;' : '') + '">' + previewHtmlTitle + '</div>',
      '    <div id="pss-prev-sub" style="font-size:' + prevSubPx + 'px;font-weight:600;text-align:center;color:' + previewMutedCol + ';line-height:' + subLH + ';margin-top:' + subGap + 'px;margin-bottom:10px;' + (useBalance ? 'text-wrap:balance;' : '') + '">' + formatManualLineBreaks(coverSubVal) + '</div>',
      '    <p id="pss-prev-p1" style="font-size:' + prevBodyPx + 'px;color:' + previewBodyCol + ';line-height:' + bodyLH + ';margin:0 0 ' + pGap + 'px 0;text-align:' + pAlign + ';">Propuesta técnica llave en mano diseñada mediante gemelo digital 3D. Optimiza la captación solar e integra almacenamiento inteligente para maximizar el ahorro desde el primer día.</p>',
      '    <p id="pss-prev-p2" style="font-size:' + prevBodyPx + 'px;color:' + previewBodyCol + ';line-height:' + bodyLH + ';margin:0 0 10px 0;text-align:' + pAlign + ';">Todos los componentes cumplen normativa REBT ITC-BT-40 y cuentan con garantía oficial de rendimiento de 25 años.</p>',
      '    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;border-top:1px solid #e2e8f0;padding-top:8px;">',
      '      <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:6px;padding:6px;text-align:center;">',
      '        <div class="pss-prev-kpi-lbl" style="font-size:' + prevKpiLblPx + 'px;font-weight:800;color:' + previewMutedCol + ';line-height:' + subLH + ';">POTENCIA HÍBRIDA TOTAL</div>',
      '        <div class="pss-prev-kpi-val" style="font-size:' + prevKpiValPx + 'px;font-weight:900;color:' + previewHeadCol + ';line-height:' + tblLH + ';">102,94 kW</div>',
      '      </div>',
      '      <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:6px;padding:6px;text-align:center;">',
      '        <div class="pss-prev-kpi-lbl" style="font-size:' + prevKpiLblPx + 'px;font-weight:800;color:' + previewMutedCol + ';line-height:' + subLH + ';">PRODUCCIÓN ANUAL</div>',
      '        <div class="pss-prev-kpi-val-accent" style="font-size:' + prevKpiValPx + 'px;font-weight:900;color:' + pal.primary + ';line-height:' + tblLH + ';">211.597 kWh</div>',
      '      </div>',
      '      <div style="background:' + pal.light + ';border:1.5px solid ' + pal.primary + ';border-radius:6px;padding:6px;text-align:center;">',
      '        <div class="pss-prev-kpi-lbl" style="font-size:' + prevKpiLblPx + 'px;font-weight:800;color:' + pal.dark + ';line-height:' + subLH + ';">INVERSIÓN LLAVE EN MANO</div>',
      '        <div class="pss-prev-kpi-val-accent" style="font-size:' + prevKpiValPx + 'px;font-weight:900;color:' + pal.dark + ';line-height:' + tblLH + ';">110.451 €</div>',
      '      </div>',
      '    </div>',
      '  </div>',
      '</div>',

      // 1.5 CONTROLADORES INDEPENDIENTES DE TAMAÑO DE LETRA POR JERARQUÍA
      '<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px 14px;">',
      '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">',
      '    <span style="font-size:11.5px;font-weight:800;color:#34d399;display:inline-flex;align-items:center;gap:5px;">' + _sSvg('type', 14, '#34d399') + ' TAMAÑO DE LETRA INDEPENDIENTE POR JERARQUÍA (PX)</span>',
      '    <span style="font-size:10px;color:#94a3b8;">Barra rápida o escribe cualquier valor libre en la casilla (px)</span>',
      '  </div>',
      '  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 16px;">',
      '    <div>',
      '      <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;margin-bottom:3px;">',
      '        <span style="color:#cbd5e1;font-weight:700;">1. Titular Principal Portada (H1):</span>',
      '        <div style="display:flex;align-items:center;gap:4px;">',
      '          <input type="number" id="pss-num-size-hero" min="8" max="140" step="0.5" value="' + heroSize.toFixed(1) + '" style="width:52px;background:#0f172a;border:1px solid rgba(52,211,153,0.45);border-radius:5px;color:#34d399;font-size:11px;font-weight:900;text-align:right;padding:1px 4px;outline:none;">',
      '          <span style="color:#34d399;font-weight:800;font-size:10px;">px</span>',
      '        </div>',
      '      </div>',
      '      <input type="range" id="pss-size-hero" min="12.0" max="72.0" step="0.5" value="' + heroSize + '" style="width:100%;accent-color:#10b981;cursor:pointer;">',
      '    </div>',
      '    <div>',
      '      <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;margin-bottom:3px;">',
      '        <span style="color:#cbd5e1;font-weight:700;">2. Títulos de Sección y Subtítulos (H2):</span>',
      '        <div style="display:flex;align-items:center;gap:4px;">',
      '          <input type="number" id="pss-num-size-section" min="8" max="90" step="0.5" value="' + secSize.toFixed(1) + '" style="width:52px;background:#0f172a;border:1px solid rgba(56,189,248,0.45);border-radius:5px;color:#38bdf8;font-size:11px;font-weight:900;text-align:right;padding:1px 4px;outline:none;">',
      '          <span style="color:#38bdf8;font-weight:800;font-size:10px;">px</span>',
      '        </div>',
      '      </div>',
      '      <input type="range" id="pss-size-section" min="8.0" max="42.0" step="0.5" value="' + secSize + '" style="width:100%;accent-color:#38bdf8;cursor:pointer;">',
      '    </div>',
      '    <div>',
      '      <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;margin-bottom:3px;">',
      '        <span style="color:#cbd5e1;font-weight:700;">3. Párrafos y Tablas (Cuerpo):</span>',
      '        <div style="display:flex;align-items:center;gap:4px;">',
      '          <input type="number" id="pss-num-size-body" min="6" max="60" step="0.5" value="' + bodySize.toFixed(1) + '" style="width:52px;background:#0f172a;border:1px solid rgba(245,158,11,0.45);border-radius:5px;color:#f59e0b;font-size:11px;font-weight:900;text-align:right;padding:1px 4px;outline:none;">',
      '          <span style="color:#f59e0b;font-weight:800;font-size:10px;">px</span>',
      '        </div>',
      '      </div>',
      '      <input type="range" id="pss-size-body" min="7.0" max="28.0" step="0.5" value="' + bodySize + '" style="width:100%;accent-color:#f59e0b;cursor:pointer;">',
      '    </div>',
      '    <div>',
      '      <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;margin-bottom:3px;">',
      '        <span style="color:#cbd5e1;font-weight:700;">4. Cifras en Cajas Resumen (KPIs):</span>',
      '        <div style="display:flex;align-items:center;gap:4px;">',
      '          <input type="number" id="pss-num-size-kpi" min="8" max="100" step="0.5" value="' + kpiSize.toFixed(1) + '" style="width:52px;background:#0f172a;border:1px solid rgba(192,132,252,0.45);border-radius:5px;color:#c084fc;font-size:11px;font-weight:900;text-align:right;padding:1px 4px;outline:none;">',
      '          <span style="color:#c084fc;font-weight:800;font-size:10px;">px</span>',
      '        </div>',
      '      </div>',
      '      <input type="range" id="pss-size-kpi" min="10.0" max="48.0" step="0.5" value="' + kpiSize + '" style="width:100%;accent-color:#c084fc;cursor:pointer;">',
      '    </div>',
      '  </div>',
      '</div>',

      // 2. CONTROLES DE INTERLINEADO Y ESPACIADO ENTRE LÍNEAS / PÁRRAFOS
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">',
      '  <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px 14px;">',
      '    <div style="font-size:11.5px;font-weight:800;color:#38bdf8;margin-bottom:8px;display:inline-flex;align-items:center;gap:5px;">' + _sSvg('ruler', 14, '#38bdf8') + ' INTERLINEADO POR ROL DE TEXTO</div>',
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
      '    <div style="font-size:11.5px;font-weight:800;color:#f59e0b;margin-bottom:8px;display:inline-flex;align-items:center;gap:5px;">' + _sSvg('sliders', 14, '#f59e0b') + ' ESPACIADO ENTRE PÁRRAFOS Y LÍNEAS</div>',
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
      '      <span style="display:inline-flex;align-items:center;gap:5px;">' + _sSvg('palette', 14, '#c084fc') + ' COLORES DE TEXTO PERSONALIZADOS POR JERARQUÍA</span>',
      '    </label>',
      '    <button type="button" id="pss-btn-sync-logo-colors" style="padding:6px 12px;background:linear-gradient(135deg,#668c37,#493c24);border:1px solid #a3e635;color:#ffffff;border-radius:6px;font-size:11px;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;gap:6px;box-shadow:0 2px 10px rgba(102,140,55,0.35);" title="Analiza los píxeles de tu logo corporativo y aplica automáticamente sus tonos exactos a titulares, subtítulos y paleta">',
      '      ' + _sSvg('wand', 14, '#a3e635') + '<span>Sincronizar Colores con mi Logo</span>',
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

      // 4. DISTRIBUCIÓN VERTICAL DE PORTADA (LLENADO COMPLETO DE HOJA A4)
      '<div style="background:rgba(16,185,129,0.05);border:1px solid rgba(16,185,129,0.28);border-radius:10px;padding:12px 14px;">',
      '  <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px;">',
      '    <span style="font-size:11.5px;font-weight:800;color:#34d399;display:inline-flex;align-items:center;gap:5px;">' + _sSvg('layout', 14, '#34d399') + ' DISTRIBUCIÓN Y ESPACIADO VERTICAL DE PORTADA (LLENAR HOJA A4)</span>',
      '    <label style="display:inline-flex;align-items:center;gap:7px;background:#0f172a;border:1px solid #10b981;border-radius:6px;padding:5px 10px;cursor:pointer;font-size:10.5px;font-weight:800;color:#34d399;">',
      '      <input type="checkbox" id="pss-cover-fill-sheet" ' + (fillSheet ? 'checked' : '') + ' style="accent-color:#10b981;width:15px;height:15px;cursor:pointer;">',
      '      <span style="display:inline-flex;align-items:center;gap:4px;">' + _sSvg('sparkles', 13, '#34d399') + ' Auto-Distribuir Bloques para Llenar Toda la Hoja A4</span>',
      '    </label>',
      '  </div>',
      '  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 16px;">',
      '    <div>',
      '      <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px;">',
      '        <span style="color:#cbd5e1;font-weight:700;">1. Hueco Cabecera ↔ Titular Principal:</span>',
      '        <span id="pss-val-chdr-gap" style="color:#34d399;font-weight:900;">' + cHdrGap + ' px</span>',
      '      </div>',
      '      <input type="range" id="pss-cover-hdr-gap" min="6" max="48" step="2" value="' + cHdrGap + '" style="width:100%;accent-color:#10b981;cursor:pointer;">',
      '    </div>',
      '    <div>',
      '      <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px;">',
      '        <span style="color:#cbd5e1;font-weight:700;">2. Hueco Titular ↔ Imagen Central:</span>',
      '        <span id="pss-val-cpho-gap" style="color:#38bdf8;font-weight:900;">' + cPhoGap + ' px</span>',
      '      </div>',
      '      <input type="range" id="pss-cover-pho-gap" min="6" max="50" step="2" value="' + cPhoGap + '" style="width:100%;accent-color:#38bdf8;cursor:pointer;">',
      '    </div>',
      '    <div>',
      '      <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px;">',
      '        <span style="color:#cbd5e1;font-weight:700;">3. Altura de Imagen Central / Logo:</span>',
      '        <span id="pss-val-cpho-h" style="color:#f59e0b;font-weight:900;">' + cPhoH + ' mm</span>',
      '      </div>',
      '      <input type="range" id="pss-cover-pho-h" min="45" max="115" step="2" value="' + cPhoH + '" style="width:100%;accent-color:#f59e0b;cursor:pointer;">',
      '    </div>',
      '    <div>',
      '      <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px;">',
      '        <span style="color:#cbd5e1;font-weight:700;">4. Hueco Imagen ↔ Cajas Inferiores:</span>',
      '        <span id="pss-val-cspc-gap" style="color:#38bdf8;font-weight:900;">' + cSpcGap + ' px</span>',
      '      </div>',
      '      <input type="range" id="pss-cover-spc-gap" min="6" max="48" step="2" value="' + cSpcGap + '" style="width:100%;accent-color:#38bdf8;cursor:pointer;">',
      '    </div>',
      '    <div style="grid-column:1 / -1;">',
      '      <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px;">',
      '        <span style="color:#cbd5e1;font-weight:700;">5. Altura y Aire Interior de las 4 Cajas Resumen Portada:</span>',
      '        <span id="pss-val-cbox-h" style="color:#c084fc;font-weight:900;">' + cBoxH + ' px</span>',
      '      </div>',
      '      <input type="range" id="pss-cover-box-h" min="88" max="145" step="2" value="' + cBoxH + '" style="width:100%;accent-color:#c084fc;cursor:pointer;">',
      '    </div>',
      '    <div style="grid-column:1 / -1;margin-top:4px;">',
      '      <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px;">',
      '        <span style="color:#cbd5e1;font-weight:700;">6. Altura de Tarjetas Infográficas (Página Balance Financiero):</span>',
      '        <span id="pss-val-balcard-h" style="color:#38bdf8;font-weight:900;">' + balCardH + ' px</span>',
      '      </div>',
      '      <input type="range" id="pss-balance-card-h" min="110" max="230" step="2" value="' + balCardH + '" style="width:100%;accent-color:#38bdf8;cursor:pointer;">',
      '    </div>',
      '  </div>',
      '</div>',
      '',
      '<!-- 4B. CONFIGURACIÓN DEL HISTOGRAMA DE PRODUCCIÓN MENSUAL -->',
      '<div style="background:rgba(56,189,248,0.05);border:1px solid rgba(56,189,248,0.3);border-radius:10px;padding:12px 14px;">',
      '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">',
      '    <div style="font-size:11.5px;font-weight:800;color:#38bdf8;display:inline-flex;align-items:center;gap:5px;">' + _sSvg('barChart', 14, '#38bdf8') + ' HISTOGRAMA DE PRODUCCIÓN MENSUAL (ALTURA, COLORES, DEGRADADOS Y LETRAS)</div>',
      '    <span style="font-size:9.5px;font-weight:800;background:rgba(56,189,248,0.15);color:#38bdf8;padding:2px 8px;border-radius:4px;">PRODUCCIÓN Y RENTABILIDAD</span>',
      '  </div>',
      '  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 16px;margin-bottom:10px;">',
      '    <div>',
      '      <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px;">',
      '        <span style="color:#cbd5e1;font-weight:700;">Altura del Histograma:</span>',
      '        <span id="pss-val-histo-h" style="color:#38bdf8;font-weight:900;">' + histoH + ' px</span>',
      '      </div>',
      '      <input type="range" id="pss-histogram-h" min="120" max="320" step="4" value="' + histoH + '" style="width:100%;accent-color:#38bdf8;cursor:pointer;">',
      '    </div>',
      '    <div>',
      '      <div style="font-size:11px;color:#cbd5e1;font-weight:700;margin-bottom:4px;">Modo de Color de Barras:</div>',
      '      <select id="pss-histogram-fill-mode" style="width:100%;padding:6px 8px;background:#1e293b;border:1px solid #475569;border-radius:6px;color:#fff;font-size:11px;font-weight:700;">',
      '        <option value="gradient" ' + (histoMode === 'gradient' ? 'selected' : '') + '>Degradado suave vertical</option>',
      '        <option value="solid" ' + (histoMode === 'solid' ? 'selected' : '') + '>Color plano uniforme (Sólido)</option>',
      '      </select>',
      '    </div>',
      '  </div>',
      '  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:10px;">',
      '    <div style="background:#1e293b;border:1px solid #475569;border-radius:6px;padding:6px 8px;display:flex;align-items:center;justify-content:space-between;">',
      '      <div><div style="font-size:10px;font-weight:800;color:#f8fafc;">Barras (Inicio)</div><div style="font-size:8.5px;color:#94a3b8;">Base superior</div></div>',
      '      <input type="color" id="pss-col-histo-bar" value="' + histoBarCol + '" style="width:28px;height:24px;border:1px solid #64748b;border-radius:4px;background:transparent;cursor:pointer;">',
      '    </div>',
      '    <div id="pss-wrap-histo-bar-end" style="background:#1e293b;border:1px solid #475569;border-radius:6px;padding:6px 8px;display:' + (histoMode === 'gradient' ? 'flex' : 'none') + ';align-items:center;justify-content:space-between;">',
      '      <div><div style="font-size:10px;font-weight:800;color:#f8fafc;">Barras (Fin)</div><div style="font-size:8.5px;color:#94a3b8;">Base inferior</div></div>',
      '      <input type="color" id="pss-col-histo-bar-end" value="' + histoBarColEnd + '" style="width:28px;height:24px;border:1px solid #64748b;border-radius:4px;background:transparent;cursor:pointer;">',
      '    </div>',
      '    <div style="background:#1e293b;border:1px solid #475569;border-radius:6px;padding:6px 8px;display:flex;align-items:center;justify-content:space-between;">',
      '      <div><div style="font-size:10px;font-weight:800;color:#f8fafc;">Mes Récord (Top)</div><div style="font-size:8.5px;color:#94a3b8;">Máx producción</div></div>',
      '      <input type="color" id="pss-col-histo-peak" value="' + histoPeakCol + '" style="width:28px;height:24px;border:1px solid #64748b;border-radius:4px;background:transparent;cursor:pointer;">',
      '    </div>',
      '    <div id="pss-wrap-histo-peak-end" style="background:#1e293b;border:1px solid #475569;border-radius:6px;padding:6px 8px;display:' + (histoMode === 'gradient' ? 'flex' : 'none') + ';align-items:center;justify-content:space-between;">',
      '      <div><div style="font-size:10px;font-weight:800;color:#f8fafc;">Mes Récord (Fin)</div><div style="font-size:8.5px;color:#94a3b8;">Degradado récord</div></div>',
      '      <input type="color" id="pss-col-histo-peak-end" value="' + histoPeakColEnd + '" style="width:28px;height:24px;border:1px solid #64748b;border-radius:4px;background:transparent;cursor:pointer;">',
      '    </div>',
      '  </div>',
      '  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">',
      '    <div>',
      '      <div style="display:flex;justify-content:space-between;font-size:10.5px;margin-bottom:2px;">',
      '        <span style="color:#cbd5e1;font-weight:700;">Cifras sobre barras (kWh):</span>',
      '        <span id="pss-val-histo-valsize" style="color:#fbbf24;font-weight:900;">' + histoValSize.toFixed(1) + ' pt</span>',
      '      </div>',
      '      <input type="range" id="pss-histo-valsize" min="6.0" max="14.0" step="0.5" value="' + histoValSize + '" style="width:100%;accent-color:#fbbf24;cursor:pointer;">',
      '    </div>',
      '    <div>',
      '      <div style="display:flex;justify-content:space-between;font-size:10.5px;margin-bottom:2px;">',
      '        <span style="color:#cbd5e1;font-weight:700;">Nombres de meses (Eje X):</span>',
      '        <span id="pss-val-histo-lblsize" style="color:#38bdf8;font-weight:900;">' + histoLblSize.toFixed(1) + ' pt</span>',
      '      </div>',
      '      <input type="range" id="pss-histo-lblsize" min="6.0" max="14.0" step="0.5" value="' + histoLblSize + '" style="width:100%;accent-color:#38bdf8;cursor:pointer;">',
      '    </div>',
      '    <div>',
      '      <div style="display:flex;justify-content:space-between;font-size:10.5px;margin-bottom:2px;">',
      '        <span style="color:#cbd5e1;font-weight:700;">Leyenda y Eje Y:</span>',
      '        <span id="pss-val-histo-axsize" style="color:#34d399;font-weight:900;">' + histoAxSize.toFixed(1) + ' pt</span>',
      '      </div>',
      '      <input type="range" id="pss-histo-axsize" min="6.0" max="12.0" step="0.5" value="' + histoAxSize + '" style="width:100%;accent-color:#34d399;cursor:pointer;">',
      '    </div>',
      '  </div>',
      '</div>',
      '',
      '<!-- 4C. CONFIGURACIÓN DE LA CURVA DE AMORTIZACIÓN Y RETORNO (25 AÑOS) -->',
      '<div style="background:rgba(16,185,129,0.05);border:1px solid rgba(16,185,129,0.3);border-radius:10px;padding:12px 14px;">',
      '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">',
      '    <div style="font-size:11.5px;font-weight:800;color:#34d399;display:inline-flex;align-items:center;gap:5px;">' + _sSvg('trendUp', 14, '#34d399') + ' CURVA DE AMORTIZACIÓN (ALTURA, TRAZADO, DEGRADADOS Y LETRAS)</div>',
      '    <span style="font-size:9.5px;font-weight:800;background:rgba(16,185,129,0.15);color:#34d399;padding:2px 8px;border-radius:4px;">CASHFLOW 25 AÑOS</span>',
      '  </div>',
      '  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 16px;margin-bottom:10px;">',
      '    <div>',
      '      <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px;">',
      '        <span style="color:#cbd5e1;font-weight:700;">Altura de la Gráfica:</span>',
      '        <span id="pss-val-amort-h" style="color:#34d399;font-weight:900;">' + amortH + ' px</span>',
      '      </div>',
      '      <input type="range" id="pss-amort-h" min="120" max="320" step="4" value="' + amortH + '" style="width:100%;accent-color:#10b981;cursor:pointer;">',
      '    </div>',
      '    <div>',
      '      <div style="font-size:11px;color:#cbd5e1;font-weight:700;margin-bottom:4px;">Relleno de Área Acumulada:</div>',
      '      <select id="pss-amort-fill-mode" style="width:100%;padding:6px 8px;background:#1e293b;border:1px solid #475569;border-radius:6px;color:#fff;font-size:11px;font-weight:700;">',
      '        <option value="gradient" ' + (amortMode === 'gradient' ? 'selected' : '') + '>Degradado suave vertical</option>',
      '        <option value="solid" ' + (amortMode === 'solid' ? 'selected' : '') + '>Color plano uniforme (Sólido)</option>',
      '      </select>',
      '    </div>',
      '  </div>',
      '  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:10px;">',
      '    <div style="background:#1e293b;border:1px solid #475569;border-radius:6px;padding:6px 8px;display:flex;align-items:center;justify-content:space-between;">',
      '      <div><div style="font-size:10px;font-weight:800;color:#f8fafc;">Línea Cashflow</div><div style="font-size:8.5px;color:#94a3b8;">Trazado curva</div></div>',
      '      <input type="color" id="pss-col-amort-line" value="' + amortLineCol + '" style="width:28px;height:24px;border:1px solid #64748b;border-radius:4px;background:transparent;cursor:pointer;">',
      '    </div>',
      '    <div style="background:#1e293b;border:1px solid #475569;border-radius:6px;padding:6px 8px;display:flex;align-items:center;justify-content:space-between;">',
      '      <div><div style="font-size:10px;font-weight:800;color:#f8fafc;">Área (Superior)</div><div style="font-size:8.5px;color:#94a3b8;">Relleno base</div></div>',
      '      <input type="color" id="pss-col-amort-area" value="' + amortAreaCol + '" style="width:28px;height:24px;border:1px solid #64748b;border-radius:4px;background:transparent;cursor:pointer;">',
      '    </div>',
      '    <div id="pss-wrap-amort-area-end" style="background:#1e293b;border:1px solid #475569;border-radius:6px;padding:6px 8px;display:' + (amortMode === 'gradient' ? 'flex' : 'none') + ';align-items:center;justify-content:space-between;">',
      '      <div><div style="font-size:10px;font-weight:800;color:#f8fafc;">Área (Inferior)</div><div style="font-size:8.5px;color:#94a3b8;">Fin degradado</div></div>',
      '      <input type="color" id="pss-col-amort-area-end" value="' + amortAreaColEnd + '" style="width:28px;height:24px;border:1px solid #64748b;border-radius:4px;background:transparent;cursor:pointer;">',
      '    </div>',
      '    <div style="background:#1e293b;border:1px solid #475569;border-radius:6px;padding:6px 8px;display:flex;align-items:center;justify-content:space-between;">',
      '      <div><div style="font-size:10px;font-weight:800;color:#f8fafc;">Punto Payback</div><div style="font-size:8.5px;color:#94a3b8;">Hito de retorno</div></div>',
      '      <input type="color" id="pss-col-amort-pb" value="' + amortPbCol + '" style="width:28px;height:24px;border:1px solid #64748b;border-radius:4px;background:transparent;cursor:pointer;">',
      '    </div>',
      '  </div>',
      '  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">',
      '    <div>',
      '      <div style="display:flex;justify-content:space-between;font-size:10.5px;margin-bottom:2px;">',
      '        <span style="color:#cbd5e1;font-weight:700;">Etiqueta de Payback (Retorno):</span>',
      '        <span id="pss-val-amort-pbsize" style="color:#34d399;font-weight:900;">' + amortPbSize.toFixed(1) + ' pt</span>',
      '      </div>',
      '      <input type="range" id="pss-amort-pbsize" min="6.0" max="14.0" step="0.5" value="' + amortPbSize + '" style="width:100%;accent-color:#10b981;cursor:pointer;">',
      '    </div>',
      '    <div>',
      '      <div style="display:flex;justify-content:space-between;font-size:10.5px;margin-bottom:2px;">',
      '        <span style="color:#cbd5e1;font-weight:700;">Años y Ejes (X / Y / Leyenda):</span>',
      '        <span id="pss-val-amort-axsize" style="color:#38bdf8;font-weight:900;">' + amortAxSize.toFixed(1) + ' pt</span>',
      '      </div>',
      '      <input type="range" id="pss-amort-axsize" min="6.0" max="12.0" step="0.5" value="' + amortAxSize + '" style="width:100%;accent-color:#38bdf8;cursor:pointer;">',
      '    </div>',
      '  </div>',
      '</div>',
      '',
      '<!-- 4D. CONFIGURACIÓN DE DISTRIBUCIÓN ENERGÉTICA & RADAR CEL (5 KM) -->',
      '<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px 14px;">',
      '  <div style="font-size:11.5px;font-weight:800;color:#60a5fa;margin-bottom:8px;display:inline-flex;align-items:center;gap:5px;">' + _sSvg('globe', 14, '#60a5fa') + ' DISTRIBUCIÓN ENERGÉTICA & RADAR CEL DE REPARTO (5 KM)</div>',
      '  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:10px;">',
      '    <div>',
      '      <div style="display:flex;justify-content:space-between;font-size:10.5px;margin-bottom:2px;">',
      '        <span style="color:#cbd5e1;font-weight:700;">Altura Barra de Despacho (Flujo):</span>',
      '        <span id="pss-val-celflow-h" style="color:#60a5fa;font-weight:900;">' + celFlowH + ' px</span>',
      '      </div>',
      '      <input type="range" id="pss-celflow-h" min="18" max="48" step="1" value="' + celFlowH + '" style="width:100%;accent-color:#3b82f6;cursor:pointer;">',
      '    </div>',
      '    <div>',
      '      <div style="display:flex;justify-content:space-between;font-size:10.5px;margin-bottom:2px;">',
      '        <span style="color:#cbd5e1;font-weight:700;">Altura Lienzo Radar (5 km):</span>',
      '        <span id="pss-val-celradar-h" style="color:#60a5fa;font-weight:900;">' + celRadarH + ' px</span>',
      '      </div>',
      '      <input type="range" id="pss-celradar-h" min="160" max="340" step="5" value="' + celRadarH + '" style="width:100%;accent-color:#3b82f6;cursor:pointer;">',
      '    </div>',
      '  </div>',
      '  <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;">',
      '    <div>',
      '      <div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:2px;">',
      '        <span style="color:#cbd5e1;font-weight:700;">Texto Barra:</span>',
      '        <span id="pss-val-celflow-size" style="color:#34d399;font-weight:900;">' + celFlowSize.toFixed(1) + ' pt</span>',
      '      </div>',
      '      <input type="range" id="pss-celflow-size" min="7.0" max="13.0" step="0.5" value="' + celFlowSize + '" style="width:100%;accent-color:#10b981;cursor:pointer;">',
      '    </div>',
      '    <div>',
      '      <div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:2px;">',
      '        <span style="color:#cbd5e1;font-weight:700;">Texto Tarjetas:</span>',
      '        <span id="pss-val-celflow-descsize" style="color:#34d399;font-weight:900;">' + celFlowDescSize.toFixed(1) + ' pt</span>',
      '      </div>',
      '      <input type="range" id="pss-celflow-descsize" min="6.5" max="12.0" step="0.5" value="' + celFlowDescSize + '" style="width:100%;accent-color:#10b981;cursor:pointer;">',
      '    </div>',
      '    <div>',
      '      <div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:2px;">',
      '        <span style="color:#cbd5e1;font-weight:700;">Nodos Radar:</span>',
      '        <span id="pss-val-celradar-lblsize" style="color:#38bdf8;font-weight:900;">' + celRadarLblSize.toFixed(1) + ' pt</span>',
      '      </div>',
      '      <input type="range" id="pss-celradar-lblsize" min="8.0" max="15.0" step="0.5" value="' + celRadarLblSize + '" style="width:100%;accent-color:#38bdf8;cursor:pointer;">',
      '    </div>',
      '    <div>',
      '      <div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:2px;">',
      '        <span style="color:#cbd5e1;font-weight:700;">Separación:</span>',
      '        <span id="pss-val-celgap" style="color:#f59e0b;font-weight:900;">' + celGap + ' px</span>',
      '      </div>',
      '      <input type="range" id="pss-celgap" min="2" max="18" step="1" value="' + celGap + '" style="width:100%;accent-color:#f59e0b;cursor:pointer;">',
      '    </div>',
      '  </div>',
      '</div>',
      '',
      // 5. CONTROL DE SALTOS DE LÍNEA, CAJAS KPI Y ALINEACIÓN
      '<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px 14px;">',
      '  <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px;">',
      '    <div style="font-size:11.5px;font-weight:800;color:#34d399;display:inline-flex;align-items:center;gap:5px;">' + _sSvg('sliders', 14, '#34d399') + ' CONTROL DE SALTO DE LÍNEA, ALINEACIÓN Y ENCAJE DE CAJAS</div>',
      '    <div style="display:flex;align-items:center;gap:6px;">',
      '      <span style="font-size:10px;color:#94a3b8;font-weight:700;">Plantilla según tipología:</span>',
      '      <select id="pss-cover-header-preset" style="padding:4px 8px;background:#0f172a;border:1px solid #10b981;border-radius:6px;color:#6ee7b7;font-size:10.5px;font-weight:800;cursor:pointer;">',
      '        <option value="">— Seleccionar encabezado por tipología —</option>',
      '        <option value="ESTUDIO FOTOVOLTAICO INTEGRADO EN CEL||Generación propia, almacenamiento LFP y valor actualizado de tu energía en Comunidad Energética Local">Comunidad Energética Local (CEL + Batería)</option>',
      '        <option value="PROYECTO DE AUTOCONSUMO Y PARTICIPACIÓN EN CEL||Generación distribuida km 0, telemedida horaria βh y máxima rentabilidad por excedentes">Comunidad Energética Local (Solo FV · P2P)</option>',
      '        <option value="PROYECTO DE AUTOCONSUMO SOLAR RESIDENCIAL||Energía limpia en tu hogar, ahorro directo desde el primer día y bonificación fiscal">Autoconsumo Residencial Estándar (Con Excedentes)</option>',
      '        <option value="SISTEMA SOLAR HÍBRIDO CON BATERÍA LFP||Independencia energética 24 horas, gestión inteligente de excedentes y respaldo nocturno">Híbrido Residencial + Almacenamiento LFP</option>',
      '        <option value="SISTEMA HÍBRIDO CON RESPALDO ANTI-APAGONES||Seguridad energética continua (Backup 24h), acumulación de litio y ahorro en factura">Autoconsumo + Backup Anti-Apagones (Full-Backup)</option>',
      '        <option value="INSTALACIÓN SOLAR AISLADA 100% AUTÓNOMA||Autosuficiencia eléctrica total sin red (Off-Grid), generación solar y reserva LFP de alta capacidad">Instalación Aislada de Red (Off-Grid Total)</option>',
      '        <option value="PROYECTO SOLAR DE VERTIDO CERO A RED||Producción ajustada en tiempo real a tu curva de demanda sin inyección de excedentes">Autoconsumo Conectado con Vertido Cero</option>',
      '        <option value="PROYECTO FOTOVOLTAICO INDUSTRIAL Y PYME||Reducción de costes operativos, descarbonización corporativa y máxima deducción fiscal">Industrial / Comercial / PYME (Cubierta Nave)</option>',
      '        <option value="COMUNIDAD SOLAR EN BLOQUE RESIDENCIAL||Autoconsumo colectivo para vecinos y servicios comunes con reparto dinámico horario">Autoconsumo Colectivo en Edificio / Bloque</option>',
      '        <option value="SISTEMA HÍBRIDO SOLAR + MINIEÓLICA||Generación renovable complementaria día y noche con máxima autarquía anual">Sistema Híbrido Solar + Minieólica</option>',
      '        <option value="PROYECTO DE BOMBEO Y EXPLOTACIÓN AGRÍCOLA||Energía solar aplicada al riego, reducción de costes de gasóleo y autonomía rural">Bombeo Solar / Explotación Agropecuaria</option>',
      '      </select>',
      '    </div>',
      '  </div>',
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
      '        <option value="left" ' + (pAlign === 'left' ? 'selected' : '') + '>Izquierda limpia (Sin guiones)</option>',
      '        <option value="justify" ' + (pAlign === 'justify' ? 'selected' : '') + '>Justificado editorial (Con silabeo)</option>',
      '        <option value="center" ' + (pAlign === 'center' ? 'selected' : '') + '>Centrado simétrico</option>',
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
      '  <div style="font-size:12px;font-weight:800;color:#38bdf8;margin-bottom:10px;display:inline-flex;align-items:center;gap:5px;">' + _sSvg('palette', 14, '#38bdf8') + ' PALETA DE COLOR CORPORATIVA (SINCRONIZADA EN AMBOS FORMATOS)</div>',
      '  <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:12px;">',
      themes.map(function(t) {
        var isSel = !cfg.useCustomColors && cfg.theme === t.id;
        return '<button type="button" class="pss-theme-btn" data-theme="' + t.id + '" style="padding:8px;border-radius:7px;border:2px solid ' + (isSel ? '#ffffff' : t.col) + ';background:' + t.col + ';color:#fff;font-size:11px;font-weight:800;cursor:pointer;box-shadow:' + (isSel ? '0 0 12px ' + t.col : 'none') + ';display:inline-flex;align-items:center;justify-content:center;gap:4px;">' + (isSel ? _sSvg('check', 12, '#ffffff') + ' ' : '') + t.label + '</button>';
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
      '    <div style="font-size:12px;font-weight:800;color:#f59e0b;margin-bottom:8px;display:inline-flex;align-items:center;gap:5px;">' + _sSvg('layout', 14, '#f59e0b') + ' DENSIDAD DE MAQUETACIÓN & ESPACIADO</div>',
      '    <select id="pss-density" style="width:100%;padding:8px 10px;background:#1e293b;border:1px solid #475569;border-radius:6px;color:#fff;font-size:12px;font-weight:700;margin-bottom:10px;">',
      '      <option value="compact" ' + (cfg.density === 'compact' ? 'selected' : '') + '>Compacto Técnico (Máxima información por hoja)</option>',
      '      <option value="balanced" ' + (cfg.density === 'balanced' ? 'selected' : '') + '>Equilibrado Estándar (Lectura ágil y limpia)</option>',
      '      <option value="editorial" ' + (cfg.density === 'editorial' ? 'selected' : '') + '>Editorial Aireado (Márgenes amplios de revista)</option>',
      '    </select>',
      '    <div style="font-size:12px;font-weight:800;color:#f59e0b;margin-bottom:6px;margin-top:6px;display:inline-flex;align-items:center;gap:5px;">' + _sSvg('gridPanel', 14, '#f59e0b') + ' ESTILO DE TARJETAS Y BORDES</div>',
      '    <select id="pss-border-style" style="width:100%;padding:8px 10px;background:#1e293b;border:1px solid #475569;border-radius:6px;color:#fff;font-size:12px;font-weight:700;">',
      '      <option value="rounded" ' + (cfg.borderStyle === 'rounded' ? 'selected' : '') + '>Redondeado Moderno (Bordes suaves 12px)</option>',
      '      <option value="sharp" ' + (cfg.borderStyle === 'sharp' ? 'selected' : '') + '>Recto Técnico CAD (Ángulos vivos 2px)</option>',
      '      <option value="minimal" ' + (cfg.borderStyle === 'minimal' ? 'selected' : '') + '>Minimalista Limpio (Sin bordes marcados)</option>',
      '    </select>',
      '  </div>',

      '  <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px;">',
      '    <div style="font-size:12px;font-weight:800;color:#34d399;margin-bottom:8px;display:inline-flex;align-items:center;gap:5px;">' + _sSvg('type', 14, '#34d399') + ' TIPOGRAFÍA & ESCALA DE TEXTO</div>',
      '    <select id="pss-font-family" style="width:100%;padding:8px 10px;background:#1e293b;border:1px solid #475569;border-radius:6px;color:#fff;font-size:12px;font-weight:700;margin-bottom:10px;">',
      '      <option value="modern" ' + (cfg.fontFamily === 'modern' ? 'selected' : '') + '>Inter / Sans Moderna (Alta legibilidad)</option>',
      '      <option value="bricolage" ' + (cfg.fontFamily === 'bricolage' ? 'selected' : '') + '>Bricolage Grotesque Regular (Todas sus variantes)</option>',
      '      <option value="yugothic_bold" ' + (cfg.fontFamily === 'yugothic_bold' ? 'selected' : '') + '>Yu Gothic, bold (Cuerpo y títulos rotundos)</option>',
      '      <option value="dmsans_italic" ' + (cfg.fontFamily === 'dmsans_italic' ? 'selected' : '') + '>DM Sans Italic (Párrafos en cursiva elegante)</option>',
      '      <option value="montserrat_medium" ' + (cfg.fontFamily === 'montserrat_medium' ? 'selected' : '') + '>Montserrat Medium (Geometría editorial 500)</option>',
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

      // Identidad & Logotipo en Encabezados (Ambos Formatos)
      '<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px;">',
      '  <div style="font-size:12px;font-weight:800;color:#38bdf8;margin-bottom:10px;display:inline-flex;align-items:center;gap:5px;">' + _sSvg('image', 14, '#38bdf8') + ' IDENTIDAD & LOGOTIPO EN ENCABEZADOS (AMBOS FORMATOS)</div>',
      '  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">',
      '    <div>',
      '      <div style="font-size:11px;font-weight:700;color:#94a3b8;margin-bottom:4px;">Alcance del Logotipo:</div>',
      '      <select id="pss-logo-scope" style="width:100%;padding:8px 10px;background:#1e293b;border:1px solid #475569;border-radius:6px;color:#fff;font-size:11.5px;font-weight:700;">',
      '        <option value="all" ' + (cfg.headerLogoScope === 'all' || !cfg.headerLogoScope ? 'selected' : '') + '>En todas las hojas (Portada, intermedias y cierre)</option>',
      '        <option value="cover_closing" ' + (cfg.headerLogoScope === 'cover_closing' ? 'selected' : '') + '>Solo en portada y hoja de firmas/cierre</option>',
      '        <option value="none" ' + (cfg.headerLogoScope === 'none' ? 'selected' : '') + '>Desactivado (Solo texto sin logo)</option>',
      '      </select>',
      '    </div>',
      '    <div>',
      '      <div style="font-size:11px;font-weight:700;color:#94a3b8;margin-bottom:4px;">Formato en Hojas Interiores:</div>',
      '      <select id="pss-logo-format" style="width:100%;padding:8px 10px;background:#1e293b;border:1px solid #475569;border-radius:6px;color:#fff;font-size:11.5px;font-weight:700;">',
      '        <option value="logo_and_title" ' + (cfg.headerLogoFormat === 'logo_and_title' || !cfg.headerLogoFormat ? 'selected' : '') + '>Logotipo + Título / Nombre de empresa</option>',
      '        <option value="logo_only" ' + (cfg.headerLogoFormat === 'logo_only' ? 'selected' : '') + '>Solo logotipo limpio (reemplaza texto empresa)</option>',
      '        <option value="right_aligned" ' + (cfg.headerLogoFormat === 'right_aligned' ? 'selected' : '') + '>Esquina derecha junto a referencia/fecha</option>',
      '      </select>',
      '    </div>',
      '  </div>',
      '  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;align-items:center;">',
      '    <div>',
      '      <div style="font-size:11px;font-weight:700;color:#94a3b8;margin-bottom:4px;">Acabado Visual:</div>',
      '      <select id="pss-logo-style" style="width:100%;padding:7px 10px;background:#1e293b;border:1px solid #475569;border-radius:6px;color:#fff;font-size:11.5px;font-weight:700;">',
      '        <option value="clean" ' + (cfg.headerLogoStyle === 'clean' || !cfg.headerLogoStyle ? 'selected' : '') + '>Original transparente</option>',
      '        <option value="pill" ' + (cfg.headerLogoStyle === 'pill' ? 'selected' : '') + '>Pastilla de contraste (fondo suave)</option>',
      '        <option value="subtle" ' + (cfg.headerLogoStyle === 'subtle' ? 'selected' : '') + '>Sutil / Ligera transparencia</option>',
      '      </select>',
      '    </div>',
      '    <div>',
      '      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">',
      '        <span style="font-size:11px;color:#94a3b8;font-weight:700;">Altura Portada:</span>',
      '        <input type="number" id="pss-num-logo-cover-h" value="' + (cfg.coverLogoHeightPx || 48) + '" min="20" max="100" step="1" style="width:52px;background:#0f172a;border:1px solid #38bdf8;border-radius:4px;color:#38bdf8;font-weight:900;font-size:11px;padding:2px 4px;text-align:right;">',
      '      </div>',
      '      <input type="range" id="pss-logo-cover-h" min="20" max="100" step="2" value="' + (cfg.coverLogoHeightPx || 48) + '" style="width:100%;accent-color:#38bdf8;cursor:pointer;">',
      '    </div>',
      '    <div>',
      '      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">',
      '        <span style="font-size:11px;color:#94a3b8;font-weight:700;">Altura Interiores:</span>',
      '        <input type="number" id="pss-num-logo-inner-h" value="' + (cfg.innerHeaderLogoHeightPx || 28) + '" min="16" max="60" step="1" style="width:52px;background:#0f172a;border:1px solid #10b981;border-radius:4px;color:#10b981;font-weight:900;font-size:11px;padding:2px 4px;text-align:right;">',
      '      </div>',
      '      <input type="range" id="pss-logo-inner-h" min="16" max="60" step="1" value="' + (cfg.innerHeaderLogoHeightPx || 28) + '" style="width:100%;accent-color:#10b981;cursor:pointer;">',
      '    </div>',
      '  </div>',
      '  <div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;justify-content:space-between;gap:12px;">',
      '    <div>',
      '      <div style="font-size:11.5px;font-weight:700;color:#cbd5e1;">Distribución Vertical del Contenido:</div>',
      '      <div style="font-size:10.5px;color:#94a3b8;">Evita apelotonamiento arriba y elimina huecos vacíos antes del pie de página.</div>',
      '    </div>',
      '    <select id="pss-content-vdist" style="padding:6px 10px;background:#1e293b;border:1px solid #475569;border-radius:6px;color:#34d399;font-size:11.5px;font-weight:800;flex-shrink:0;">',
      '      <option value="balanced_fill" ' + (cfg.contentVerticalDistribution !== 'top_compact' ? 'selected' : '') + '>Equilibrado Elástico (Reparto armónico)</option>',
      '      <option value="top_compact" ' + (cfg.contentVerticalDistribution === 'top_compact' ? 'selected' : '') + '>Compacto Superior (Clásico)</option>',
      '    </select>',
      '  </div>',
      '</div>',

      // Modo de Tinta y Guardián Anti-Desborde A4
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">',
      '  <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px;">',
      '    <div style="font-size:12px;font-weight:800;color:#c084fc;margin-bottom:6px;display:inline-flex;align-items:center;gap:5px;">' + _sSvg('printer', 14, '#c084fc') + ' MODO DE PORTADA E IMPRESIÓN</div>',
      '    <select id="pss-ink-mode" style="width:100%;padding:8px 10px;background:#1e293b;border:1px solid #475569;border-radius:6px;color:#fff;font-size:12px;font-weight:700;">',
      '      <option value="light" ' + (cfg.inkMode === 'light' ? 'selected' : '') + '>Fondo Claro (Ahorro de tinta / Impresión directa)</option>',
      '      <option value="luxury_dark" ' + (cfg.inkMode === 'luxury_dark' ? 'selected' : '') + '>Portada Luxury Dark (Presentación digital premium)</option>',
      '    </select>',
      '  </div>',
      '  <div style="background:rgba(16,185,129,0.07);border:1px solid rgba(16,185,129,0.3);border-radius:10px;padding:14px;display:flex;align-items:center;justify-content:space-between;gap:10px;">',
      '    <div>',
      '      <div style="font-size:12px;font-weight:900;color:#34d399;display:inline-flex;align-items:center;gap:5px;">' + _sSvg('shield', 14, '#34d399') + ' GUARDIÁN ANTI-DESBORDE A4 AUTOMÁTICO</div>',
      '      <div style="font-size:11px;color:#94a3b8;margin-top:3px;line-height:1.35;">Mide cada hoja al abrir e imprimir y ajusta automáticamente el espaciado o zoom si detecta exceso de altura.</div>',
      '    </div>',
      '    <input type="checkbox" id="pss-autofit-a4" ' + (cfg.autoFitA4 ? 'checked' : '') + ' style="accent-color:#10b981;width:20px;height:20px;cursor:pointer;flex-shrink:0;">',
      '  </div>',
      '</div>',
      '',
      '<!-- MARCA DE AGUA DE SEGURIDAD (PÁGINAS INTERIORES) -->',
      '<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px;margin-top:12px;">',
      '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">',
      '    <div style="font-size:12px;font-weight:800;color:#38bdf8;display:inline-flex;align-items:center;gap:5px;">' + _sSvg('shield', 14, '#38bdf8') + ' MARCA DE AGUA EN PÁGINAS INTERIORES (EXCLUYE PORTADA)</div>',
      '    <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-size:11px;font-weight:700;color:#e2e8f0;">',
      '      <input type="checkbox" id="pss-watermark-enabled" ' + (cfg.watermarkEnabled ? 'checked' : '') + ' style="accent-color:#38bdf8;width:17px;height:17px;cursor:pointer;">',
      '      <span>Activar Marca</span>',
      '    </label>',
      '  </div>',
      '  <div style="font-size:10.5px;color:#94a3b8;margin-bottom:12px;line-height:1.35;">Imprime un sello de seguridad o identidad institucional de fondo en todas las hojas técnicas, excluyendo la portada.</div>',
      '  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">',
      '    <div>',
      '      <div style="font-size:11px;font-weight:700;color:#94a3b8;margin-bottom:4px;">Tipo de Marca:</div>',
      '      <select id="pss-watermark-type" style="width:100%;padding:7px 9px;background:#1e293b;border:1px solid #475569;border-radius:6px;color:#fff;font-size:11.5px;font-weight:700;">',
      '        <option value="logo" ' + (cfg.watermarkType === 'logo' || !cfg.watermarkType ? 'selected' : '') + '>Logotipo Oficial de Empresa</option>',
      '        <option value="text" ' + (cfg.watermarkType === 'text' ? 'selected' : '') + '>Texto Personalizado (Ej: CONFIDENCIAL)</option>',
      '      </select>',
      '    </div>',
      '    <div>',
      '      <div style="font-size:11px;font-weight:700;color:#94a3b8;margin-bottom:4px;">Texto (si aplica):</div>',
      '      <input type="text" id="pss-watermark-text" value="' + (cfg.watermarkText || 'CONFIDENCIAL') + '" placeholder="CONFIDENCIAL" style="width:100%;padding:6px 9px;background:#1e293b;border:1px solid #475569;border-radius:6px;color:#fff;font-size:11.5px;font-weight:700;box-sizing:border-box;">',
      '    </div>',
      '    <div>',
      '      <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;margin-bottom:4px;">',
      '        <span style="color:#94a3b8;font-weight:700;">Opacidad Sello:</span>',
      '        <span id="pss-watermark-opacity-val" style="color:#38bdf8;font-weight:900;">' + Math.round((typeof cfg.watermarkOpacity === 'number' ? cfg.watermarkOpacity : 0.06) * 100) + '%</span>',
      '      </div>',
      '      <input type="range" id="pss-watermark-opacity" min="0.02" max="0.25" step="0.01" value="' + (typeof cfg.watermarkOpacity === 'number' ? cfg.watermarkOpacity : 0.06) + '" style="width:100%;accent-color:#38bdf8;cursor:pointer;">',
      '    </div>',
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
      '  <span style="display:inline-flex;align-items:center;gap:6px;">' + _sSvg('lightbulb', 14, '#38bdf8') + ' <b>Constructor Modular de Secciones:</b> Activa o desactiva bloques y ordénalos con ▲/▼. La numeración de hojas se recalcula sola.</span>',
      '  <button type="button" id="pss-btn-enable-all-secs" style="padding:5px 10px;background:#0f172a;border:1px solid #38bdf8;color:#38bdf8;border-radius:6px;font-size:10.5px;font-weight:800;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:4px;">' + _sSvg('check', 12, '#38bdf8') + ' Activar Todas</button>',
      '</div>',
      '<div style="display:flex;flex-direction:column;gap:6px;">',
      rows,
      '</div>'
    ].join('\n');
  }

  function buildEconomicsTabHTML(cfg) {
    var curMod = cfg.installationModality || 'grid_surplus_cel';
    var refPrice = Number(cfg.referenceGridPriceEUR || 0.22).toFixed(2);
    var modes = [
      {
        id: 'turnkey_only',
        title: _sSvg('lock', 14, '#34d399') + ' Precio Único Llave en Mano (Cerrado)',
        desc: 'Muestra la lista técnica de capítulos con "Incluido" y únicamente el importe total final (Base Imponible + IVA). Ideal para evitar regateos por componente.'
      },
      {
        id: 'chapters_units',
        title: _sSvg('packageBox', 14, '#38bdf8') + ' Capítulos con Unidades Montadas + Importe por Partida',
        desc: 'Muestra el número exacto de unidades instaladas (N× módulos, inversores, baterías, aerogeneradores) y el subtotal de cada capítulo, ocultando el precio unitario €/ud.'
      },
      {
        id: 'full_open',
        title: _sSvg('chart', 14, '#f59e0b') + ' Presupuesto Abierto Completo (Ingeniería Transparente)',
        desc: 'Muestra unidades montadas (N×), precios unitarios (€/ud) y subtotales desglosados por cada partida del SSOT.'
      }
    ];

    return [
      '<div style="background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.32);border-radius:10px;padding:14px;margin-bottom:12px;">',
      '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">',
      '    <div style="font-size:12px;font-weight:900;color:#34d399;display:inline-flex;align-items:center;gap:5px;">' + _sSvg('bolt', 14, '#34d399') + ' MODALIDAD DE LA INSTALACIÓN (ENFOQUE COMERCIAL Y COMPARATIVO)</div>',
      '  </div>',
      '  <div style="display:flex;flex-direction:column;gap:7px;">',
      INSTALLATION_MODALITIES.map(function(mod) {
        var isModSel = curMod === mod.id;
        return '<label style="display:flex;align-items:flex-start;gap:10px;padding:9px 12px;background:' + (isModSel ? 'rgba(16,185,129,0.16)' : 'rgba(15,23,42,0.65)') + ';border:1.5px solid ' + (isModSel ? '#10b981' : 'rgba(255,255,255,0.08)') + ';border-radius:8px;cursor:pointer;">' +
          '<input type="radio" name="pss-installation-modality" value="' + mod.id + '" ' + (isModSel ? 'checked' : '') + ' style="accent-color:#10b981;margin-top:3px;width:16px;height:16px;">' +
          '<div>' +
          '  <div style="font-size:12px;font-weight:800;color:#f8fafc;">' + mod.label + '</div>' +
          '  <div style="font-size:10.5px;color:#94a3b8;margin-top:2px;line-height:1.35;">' + mod.desc + '</div>' +
          '</div>' +
          '</label>';
      }).join(''),
      '  </div>',
      '  <div style="margin-top:10px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:space-between;gap:10px;">',
      '    <div>',
      '      <div style="font-size:11px;font-weight:700;color:#e2e8f0;">Precio actualizado de referencia de red (€/kWh):</div>',
      '      <div style="font-size:10px;color:#94a3b8;">En instalaciones aisladas (Off-Grid), valora económicamente cada kWh generado que no se tiene que comprar a la red.</div>',
      '    </div>',
      '    <div style="display:flex;align-items:center;gap:5px;">',
      '      <input type="number" id="pss-ref-grid-price" min="0.05" max="1.50" step="0.01" value="' + refPrice + '" style="width:74px;padding:5px 8px;background:#0f172a;border:1px solid #f59e0b;border-radius:6px;color:#fbbf24;font-size:12px;font-weight:900;text-align:right;">',
      '      <span style="font-size:11px;color:#fbbf24;font-weight:800;">€/kWh</span>',
      '    </div>',
      '  </div>',
      '</div>',

      '<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px;">',
      '  <div style="font-size:12px;font-weight:800;color:#f59e0b;margin-bottom:10px;display:inline-flex;align-items:center;gap:5px;">' + _sSvg('euro', 14, '#f59e0b') + ' NIVEL DE DESGLOSE DE PARTIDAS ECONÓMICAS</div>',
      '  <div style="display:flex;flex-direction:column;gap:8px;">',
      modes.map(function(m) {
        var sel = cfg.economicBreakdown === m.id;
        return '<label style="display:flex;align-items:flex-start;gap:10px;padding:11px 14px;background:' + (sel ? 'rgba(16,185,129,0.12)' : 'rgba(15,23,42,0.6)') + ';border:1.5px solid ' + (sel ? '#10b981' : 'rgba(255,255,255,0.08)') + ';border-radius:8px;cursor:pointer;">' +
          '<input type="radio" name="pss-econ-breakdown" value="' + m.id + '" ' + (sel ? 'checked' : '') + ' style="accent-color:#10b981;margin-top:3px;width:16px;height:16px;">' +
          '<div>' +
          '  <div style="font-size:12.5px;font-weight:800;color:#f8fafc;display:inline-flex;align-items:center;gap:5px;">' + m.title + '</div>' +
          '  <div style="font-size:11px;color:#94a3b8;margin-top:3px;line-height:1.4;">' + m.desc + '</div>' +
          '</div>' +
          '</label>';
      }).join(''),
      '  </div>',
      '</div>',

      '<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px;">',
      '  <div style="font-size:12px;font-weight:800;color:#38bdf8;margin-bottom:10px;display:inline-flex;align-items:center;gap:5px;">' + _sSvg('tag', 14, '#38bdf8') + ' VISUALIZACIÓN DE PRECIOS POR PARTIDA EN PRESUPUESTO</div>',
      '  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">',
      '    <label style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;background:' + (cfg.itemPriceDisplay !== 'included' ? 'rgba(56,189,248,0.14)' : 'rgba(15,23,42,0.6)') + ';border:1.5px solid ' + (cfg.itemPriceDisplay !== 'included' ? '#38bdf8' : 'rgba(255,255,255,0.08)') + ';border-radius:8px;cursor:pointer;">',
      '      <input type="radio" name="pss-item-price-display" value="price" ' + (cfg.itemPriceDisplay !== 'included' ? 'checked' : '') + ' style="accent-color:#38bdf8;margin-top:3px;width:16px;height:16px;">',
      '      <div>',
      '        <div style="font-size:12px;font-weight:800;color:#f8fafc;">Mostrar Precios (€)</div>',
      '        <div style="font-size:10.5px;color:#94a3b8;margin-top:2px;line-height:1.35;">Muestra el importe numérico de cada capítulo o partida.</div>',
      '      </div>',
      '    </label>',
      '    <label style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;background:' + (cfg.itemPriceDisplay === 'included' ? 'rgba(16,185,129,0.14)' : 'rgba(15,23,42,0.6)') + ';border:1.5px solid ' + (cfg.itemPriceDisplay === 'included' ? '#10b981' : 'rgba(255,255,255,0.08)') + ';border-radius:8px;cursor:pointer;">',
      '      <input type="radio" name="pss-item-price-display" value="included" ' + (cfg.itemPriceDisplay === 'included' ? 'checked' : '') + ' style="accent-color:#10b981;margin-top:3px;width:16px;height:16px;">',
      '      <div>',
      '        <div style="font-size:12px;font-weight:800;color:#f8fafc;">Texto "Incluido"</div>',
      '        <div style="font-size:10.5px;color:#94a3b8;margin-top:2px;line-height:1.35;">Sustituye el importe de cada partida por "Incluido" manteniendo el total.</div>',
      '      </div>',
      '    </label>',
      '  </div>',
      '</div>',

      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">',
      '  <label style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;">',
      '    <div>',
      '      <div style="font-size:12px;font-weight:800;color:#38bdf8;display:inline-flex;align-items:center;gap:5px;">' + _sSvg('landmark', 14, '#38bdf8') + ' Tabla de Deducciones Fiscales (IBI / IRPF / ICIO)</div>',
      '      <div style="font-size:11px;color:#94a3b8;margin-top:2px;">Mostrar cuadro de bonificaciones e inversión neta tras ayudas</div>',
      '    </div>',
      '    <input type="checkbox" id="pss-show-tax" ' + (cfg.showTaxBenefits !== false ? 'checked' : '') + ' style="accent-color:#38bdf8;width:18px;height:18px;">',
      '  </label>',
      '  <label style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;">',
      '    <div>',
      '      <div style="font-size:12px;font-weight:800;color:#34d399;display:inline-flex;align-items:center;gap:5px;">' + _sSvg('building', 14, '#34d399') + ' Comparativa Financiación / Renting Bancable</div>',
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
      '<div style="font-size:11px;color:#cbd5e1;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:8px;padding:9px 12px;display:flex;align-items:center;gap:6px;">',
      '  ' + _sSvg('tag', 14, '#f59e0b') + ' <span><b>Variables Inteligentes Disponibles:</b> Usa <code style="color:#fbbf24;">{{clientName}}</code>, <code style="color:#fbbf24;">{{kwp}}</code>, <code style="color:#fbbf24;">{{numPanels}}</code>, <code style="color:#fbbf24;">{{windPhrase}}</code>, <code style="color:#fbbf24;">{{annualYield}}</code>, <code style="color:#fbbf24;">{{ahorroAnual}}</code>, <code style="color:#fbbf24;">{{payback}}</code>, <code style="color:#fbbf24;">{{capexBruto}}</code>, <code style="color:#fbbf24;">{{validityDays}}</code>.</span>',
      '</div>',

      '<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px;">',
      '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">',
      '    <span style="font-size:12px;font-weight:800;color:#38bdf8;display:inline-flex;align-items:center;gap:5px;">' + _sSvg('clipboard', 14, '#38bdf8') + ' PLANTILLA FIJA DE RESUMEN EJECUTIVO (SIN ESPERAR A IA)</span>',
      '    <label style="display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:700;cursor:pointer;">',
      '      <input type="checkbox" id="pss-lock-summary" ' + (lt.useLockedSummary ? 'checked' : '') + ' style="accent-color:#10b981;">',
      '      <span>Fijar plantilla instantánea</span>',
      '    </label>',
      '  </div>',
      // [AUD-2026 v2 · SEC2-11] Escape de & y < para que la plantilla no cierre el textarea por su cuenta.
      '  <textarea id="pss-summary-template" rows="3" style="width:100%;padding:8px 10px;background:#1e293b;border:1px solid #475569;border-radius:6px;color:#f8fafc;font-size:11.5px;line-height:1.45;resize:vertical;">' + String(lt.summaryTemplate || '').replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</textarea>',
      '</div>',

      '<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px;">',
      '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">',
      '    <span style="font-size:12px;font-weight:800;color:#f59e0b;display:inline-flex;align-items:center;gap:5px;">' + _sSvg('handshake', 14, '#f59e0b') + ' HITOS DE PAGO Y VALIDEZ CONTRACTUAL</span>',
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
      if (g('pss-logo-scope')) cfg.headerLogoScope = g('pss-logo-scope').value;
      if (g('pss-logo-format')) cfg.headerLogoFormat = g('pss-logo-format').value;
      if (g('pss-logo-style')) cfg.headerLogoStyle = g('pss-logo-style').value;
      if (g('pss-num-logo-cover-h')) cfg.coverLogoHeightPx = parseFloat(g('pss-num-logo-cover-h').value) || 48;
      else if (g('pss-logo-cover-h')) cfg.coverLogoHeightPx = parseFloat(g('pss-logo-cover-h').value) || 48;
      if (g('pss-num-logo-inner-h')) cfg.innerHeaderLogoHeightPx = parseFloat(g('pss-num-logo-inner-h').value) || 28;
      else if (g('pss-logo-inner-h')) cfg.innerHeaderLogoHeightPx = parseFloat(g('pss-logo-inner-h').value) || 28;
      if (g('pss-content-vdist')) cfg.contentVerticalDistribution = g('pss-content-vdist').value;
      if (g('pss-watermark-enabled')) cfg.watermarkEnabled = g('pss-watermark-enabled').checked;
      if (g('pss-watermark-type')) cfg.watermarkType = g('pss-watermark-type').value;
      if (g('pss-watermark-text')) cfg.watermarkText = g('pss-watermark-text').value;
      if (g('pss-watermark-opacity')) cfg.watermarkOpacity = parseFloat(g('pss-watermark-opacity').value) || 0.06;
    } else if (_activeModalTab === 'typography') {
      if (g('pss-num-size-hero')) cfg.heroFontSize = parseFloat(g('pss-num-size-hero').value) || 23.5;
      else if (g('pss-size-hero')) cfg.heroFontSize = parseFloat(g('pss-size-hero').value) || 23.5;
      if (g('pss-num-size-section')) cfg.sectionFontSize = parseFloat(g('pss-num-size-section').value) || 13.0;
      else if (g('pss-size-section')) cfg.sectionFontSize = parseFloat(g('pss-size-section').value) || 13.0;
      if (g('pss-num-size-body')) cfg.bodyFontSize = parseFloat(g('pss-num-size-body').value) || 11.0;
      else if (g('pss-size-body')) cfg.bodyFontSize = parseFloat(g('pss-size-body').value) || 11.0;
      if (g('pss-num-size-kpi')) cfg.kpiFontSize = parseFloat(g('pss-num-size-kpi').value) || 16.5;
      else if (g('pss-size-kpi')) cfg.kpiFontSize = parseFloat(g('pss-size-kpi').value) || 16.5;
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
      if (g('pss-cover-fill-sheet')) cfg.coverFillSheet = g('pss-cover-fill-sheet').checked;
      if (g('pss-cover-hdr-gap')) cfg.coverHeaderGap = parseInt(g('pss-cover-hdr-gap').value, 10) || 20;
      if (g('pss-cover-pho-gap')) cfg.coverPhotoGap = parseInt(g('pss-cover-pho-gap').value, 10) || 18;
      if (g('pss-cover-pho-h')) cfg.coverPhotoHeightMm = parseInt(g('pss-cover-pho-h').value, 10) || 78;
      if (g('pss-cover-spc-gap')) cfg.coverSpecsGap = parseInt(g('pss-cover-spc-gap').value, 10) || 18;
      if (g('pss-cover-box-h')) cfg.coverSpecBoxHeightPx = parseInt(g('pss-cover-box-h').value, 10) || 112;
      if (g('pss-balance-card-h')) cfg.balanceCardHeightPx = parseInt(g('pss-balance-card-h').value, 10) || 145;
      if (g('pss-histogram-h')) cfg.histogramHeightPx = parseInt(g('pss-histogram-h').value, 10) || 200;
      if (g('pss-histogram-fill-mode')) cfg.histogramFillMode = g('pss-histogram-fill-mode').value;
      if (g('pss-col-histo-bar')) cfg.histogramBarColor = g('pss-col-histo-bar').value;
      if (g('pss-col-histo-bar-end')) cfg.histogramBarColorEnd = g('pss-col-histo-bar-end').value;
      if (g('pss-col-histo-peak')) cfg.histogramPeakColor = g('pss-col-histo-peak').value;
      if (g('pss-col-histo-peak-end')) cfg.histogramPeakColorEnd = g('pss-col-histo-peak-end').value;
      if (g('pss-histo-valsize')) cfg.histogramValueFontSize = parseFloat(g('pss-histo-valsize').value) || 7.5;
      if (g('pss-histo-lblsize')) cfg.histogramLabelFontSize = parseFloat(g('pss-histo-lblsize').value) || 8.0;
      if (g('pss-histo-axsize')) cfg.histogramAxisFontSize = parseFloat(g('pss-histo-axsize').value) || 8.0;
      if (g('pss-amort-h')) cfg.amortHeightPx = parseInt(g('pss-amort-h').value, 10) || 200;
      if (g('pss-amort-fill-mode')) cfg.amortFillMode = g('pss-amort-fill-mode').value;
      if (g('pss-col-amort-line')) cfg.amortLineColor = g('pss-col-amort-line').value;
      if (g('pss-col-amort-area')) cfg.amortAreaColor = g('pss-col-amort-area').value;
      if (g('pss-col-amort-area-end')) cfg.amortAreaColorEnd = g('pss-col-amort-area-end').value;
      if (g('pss-col-amort-pb')) cfg.amortPaybackColor = g('pss-col-amort-pb').value;
      if (g('pss-amort-pbsize')) cfg.amortPaybackFontSize = parseFloat(g('pss-amort-pbsize').value) || 8.0;
      if (g('pss-amort-axsize')) cfg.amortAxisFontSize = parseFloat(g('pss-amort-axsize').value) || 8.0;
      if (g('pss-celflow-h')) cfg.celFlowBarHeightPx = parseInt(g('pss-celflow-h').value, 10) || 26;
      if (g('pss-celflow-size')) cfg.celFlowFontSize = parseFloat(g('pss-celflow-size').value) || 9.5;
      if (g('pss-celflow-descsize')) cfg.celFlowDescFontSize = parseFloat(g('pss-celflow-descsize').value) || 9.0;
      if (g('pss-celradar-h')) cfg.celRadarHeightPx = parseInt(g('pss-celradar-h').value, 10) || 235;
      if (g('pss-celradar-lblsize')) cfg.celRadarLabelFontSize = parseFloat(g('pss-celradar-lblsize').value) || 11.5;
      if (g('pss-celradar-distsize')) cfg.celRadarDistanceFontSize = parseFloat(g('pss-celradar-distsize').value) || 10.5;
      if (g('pss-celgap')) cfg.celCardsGapPx = parseInt(g('pss-celgap').value, 10) || 8;
      cfg.lockedTexts = cfg.lockedTexts || {};
      if (g('pss-cover-main-title')) cfg.lockedTexts.coverMainTitle = g('pss-cover-main-title').value;
      if (g('pss-cover-subtitle')) cfg.lockedTexts.coverSubtitle = g('pss-cover-subtitle').value;
    } else if (_activeModalTab === 'economics') {
      var checkedMod = document.querySelector('input[name="pss-installation-modality"]:checked');
      if (checkedMod && checkedMod.value !== cfg.installationModality) {
        applyModalityRulesToConfig(cfg, checkedMod.value);
      }
      if (g('pss-ref-grid-price')) {
        var rp = parseFloat(g('pss-ref-grid-price').value);
        if (!isNaN(rp) && rp > 0) cfg.referenceGridPriceEUR = rp;
      }
      var checkedRadio = document.querySelector('input[name="pss-econ-breakdown"]:checked');
      if (checkedRadio) cfg.economicBreakdown = checkedRadio.value;
      var checkedPriceDisp = document.querySelector('input[name="pss-item-price-display"]:checked');
      if (checkedPriceDisp) cfg.itemPriceDisplay = checkedPriceDisp.value;
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
    var heroSize = q('#pss-num-size-hero') ? (parseFloat(q('#pss-num-size-hero').value) || 23.5) : (q('#pss-size-hero') ? parseFloat(q('#pss-size-hero').value) : 23.5);
    var secSize  = q('#pss-num-size-section') ? (parseFloat(q('#pss-num-size-section').value) || 13.0) : (q('#pss-size-section') ? parseFloat(q('#pss-size-section').value) : 13.0);
    var bodySize = q('#pss-num-size-body') ? (parseFloat(q('#pss-num-size-body').value) || 11.0) : (q('#pss-size-body') ? parseFloat(q('#pss-size-body').value) : 11.0);
    var kpiSize  = q('#pss-num-size-kpi') ? (parseFloat(q('#pss-num-size-kpi').value) || 16.5) : (q('#pss-size-kpi') ? parseFloat(q('#pss-size-kpi').value) : 16.5);

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

    var cHdrGap = q('#pss-cover-hdr-gap') ? parseInt(q('#pss-cover-hdr-gap').value, 10) : 20;
    var cPhoGap = q('#pss-cover-pho-gap') ? parseInt(q('#pss-cover-pho-gap').value, 10) : 18;
    var cPhoH   = q('#pss-cover-pho-h') ? parseInt(q('#pss-cover-pho-h').value, 10) : 78;
    var cSpcGap = q('#pss-cover-spc-gap') ? parseInt(q('#pss-cover-spc-gap').value, 10) : 18;
    var cBoxH   = q('#pss-cover-box-h') ? parseInt(q('#pss-cover-box-h').value, 10) : 112;
    var balCardH = q('#pss-balance-card-h') ? parseInt(q('#pss-balance-card-h').value, 10) : 145;
    var histoH   = q('#pss-histogram-h') ? parseInt(q('#pss-histogram-h').value, 10) : 200;
    var histoValSize = q('#pss-histo-valsize') ? parseFloat(q('#pss-histo-valsize').value) : 7.5;
    var histoLblSize = q('#pss-histo-lblsize') ? parseFloat(q('#pss-histo-lblsize').value) : 8.0;
    var histoAxSize  = q('#pss-histo-axsize') ? parseFloat(q('#pss-histo-axsize').value) : 8.0;

    var amortH       = q('#pss-amort-h') ? parseInt(q('#pss-amort-h').value, 10) : 200;
    var amortPbSize  = q('#pss-amort-pbsize') ? parseFloat(q('#pss-amort-pbsize').value) : 8.0;
    var amortAxSize  = q('#pss-amort-axsize') ? parseFloat(q('#pss-amort-axsize').value) : 8.0;

    var celFlowH     = q('#pss-celflow-h') ? parseInt(q('#pss-celflow-h').value, 10) : 26;
    var celFlowSize  = q('#pss-celflow-size') ? parseFloat(q('#pss-celflow-size').value) : 9.5;
    var celFlowDescSize = q('#pss-celflow-descsize') ? parseFloat(q('#pss-celflow-descsize').value) : 9.0;
    var celRadarH    = q('#pss-celradar-h') ? parseInt(q('#pss-celradar-h').value, 10) : 235;
    var celRadarLblSize = q('#pss-celradar-lblsize') ? parseFloat(q('#pss-celradar-lblsize').value) : 11.5;
    var celGap       = q('#pss-celgap') ? parseInt(q('#pss-celgap').value, 10) : 8;

    if (q('#pss-val-chdr-gap')) q('#pss-val-chdr-gap').textContent = cHdrGap + ' px';
    if (q('#pss-val-cpho-gap')) q('#pss-val-cpho-gap').textContent = cPhoGap + ' px';
    if (q('#pss-val-cpho-h')) q('#pss-val-cpho-h').textContent = cPhoH + ' mm';
    if (q('#pss-val-cspc-gap')) q('#pss-val-cspc-gap').textContent = cSpcGap + ' px';
    if (q('#pss-val-cbox-h')) q('#pss-val-cbox-h').textContent = cBoxH + ' px';
    if (q('#pss-val-balcard-h')) q('#pss-val-balcard-h').textContent = balCardH + ' px';
    if (q('#pss-val-histo-h')) q('#pss-val-histo-h').textContent = histoH + ' px';
    if (q('#pss-val-histo-valsize')) q('#pss-val-histo-valsize').textContent = histoValSize.toFixed(1) + ' pt';
    if (q('#pss-val-histo-lblsize')) q('#pss-val-histo-lblsize').textContent = histoLblSize.toFixed(1) + ' pt';
    if (q('#pss-val-histo-axsize')) q('#pss-val-histo-axsize').textContent = histoAxSize.toFixed(1) + ' pt';

    if (q('#pss-val-amort-h')) q('#pss-val-amort-h').textContent = amortH + ' px';
    if (q('#pss-val-amort-pbsize')) q('#pss-val-amort-pbsize').textContent = amortPbSize.toFixed(1) + ' pt';
    if (q('#pss-val-amort-axsize')) q('#pss-val-amort-axsize').textContent = amortAxSize.toFixed(1) + ' pt';

    if (q('#pss-val-celflow-h')) q('#pss-val-celflow-h').textContent = celFlowH + ' px';
    if (q('#pss-val-celflow-size')) q('#pss-val-celflow-size').textContent = celFlowSize.toFixed(1) + ' pt';
    if (q('#pss-val-celflow-descsize')) q('#pss-val-celflow-descsize').textContent = celFlowDescSize.toFixed(1) + ' pt';
    if (q('#pss-val-celradar-h')) q('#pss-val-celradar-h').textContent = celRadarH + ' px';
    if (q('#pss-val-celradar-lblsize')) q('#pss-val-celradar-lblsize').textContent = celRadarLblSize.toFixed(1) + ' pt';
    if (q('#pss-val-celgap')) q('#pss-val-celgap').textContent = celGap + ' px';

    var histoModeSel = q('#pss-histogram-fill-mode');
    var isGrad = !histoModeSel || histoModeSel.value === 'gradient';
    if (q('#pss-wrap-histo-bar-end')) q('#pss-wrap-histo-bar-end').style.display = isGrad ? 'flex' : 'none';
    if (q('#pss-wrap-histo-peak-end')) q('#pss-wrap-histo-peak-end').style.display = isGrad ? 'flex' : 'none';

    var amortModeSel = q('#pss-amort-fill-mode');
    var isAmortGrad = !amortModeSel || amortModeSel.value === 'gradient';
    if (q('#pss-wrap-amort-area-end')) q('#pss-wrap-amort-area-end').style.display = isAmortGrad ? 'flex' : 'none';

    var prevH1 = q('#pss-prev-h1');
    if (prevH1) {
      prevH1.style.fontSize = (Math.round(heroSize * 0.82 * 10) / 10) + 'px';
      prevH1.style.lineHeight = String(hLH);
      prevH1.style.color = colHead;
      prevH1.style.textWrap = useBalance ? 'balance' : 'wrap';
      if (titleRaw) prevH1.innerHTML = formatManualLineBreaks(titleRaw);
    }
    var prevSub = q('#pss-prev-sub');
    if (prevSub) {
      prevSub.style.fontSize = (Math.round(secSize * 0.88 * 10) / 10) + 'px';
      prevSub.style.lineHeight = String(subLH);
      prevSub.style.marginTop = subGap + 'px';
      prevSub.style.color = colMuted;
      prevSub.style.textWrap = useBalance ? 'balance' : 'wrap';
      if (subRaw) prevSub.innerHTML = formatManualLineBreaks(subRaw);
    }
    ['#pss-prev-p1', '#pss-prev-p2'].forEach(function(id, idx) {
      var pEl = q(id);
      if (pEl) {
        pEl.style.fontSize = bodySize + 'px';
        pEl.style.lineHeight = String(bodyLH);
        pEl.style.color = colBody;
        pEl.style.textAlign = pAlign;
        if (idx === 0) pEl.style.marginBottom = pGap + 'px';
      }
    });
    var kpiLblPx = Math.max(7.5, Math.round(kpiSize * 0.50 * 10) / 10) + 'px';
    var kpiValPx = (Math.round(kpiSize * 0.82 * 10) / 10) + 'px';
    modal.querySelectorAll('.pss-prev-kpi-lbl').forEach(function(el, i) {
      el.style.fontSize = kpiLblPx;
      el.style.lineHeight = String(subLH);
      if (i < 2) el.style.color = colMuted;
    });
    modal.querySelectorAll('.pss-prev-kpi-val').forEach(function(el) {
      el.style.fontSize = kpiValPx;
      el.style.lineHeight = String(tblLH);
      el.style.color = colHead;
    });
    modal.querySelectorAll('.pss-prev-kpi-val-accent').forEach(function(el) {
      el.style.fontSize = kpiValPx;
      el.style.lineHeight = String(tblLH);
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

    // Sincronización bidireccional entre barras deslizantes y casillas numéricas de logotipo
    [
      { range: '#pss-logo-cover-h', num: '#pss-num-logo-cover-h' },
      { range: '#pss-logo-inner-h', num: '#pss-num-logo-inner-h' }
    ].forEach(function(pair) {
      var rEl = modal.querySelector(pair.range);
      var nEl = modal.querySelector(pair.num);
      if (rEl && nEl) {
        rEl.addEventListener('input', function() {
          nEl.value = parseFloat(rEl.value).toFixed(0);
          collectCurrentTabInputsToState();
          saveState();
        });
        nEl.addEventListener('input', function() {
          var v = parseFloat(nEl.value);
          if (!isNaN(v) && v > 0) {
            rEl.value = v;
            collectCurrentTabInputsToState();
            saveState();
          }
        });
      }
    });

    [
      '#pss-logo-scope', '#pss-logo-format', '#pss-logo-style', '#pss-content-vdist',
      '#pss-font-family', '#pss-ink-mode', '#pss-autofit-a4', '#pss-watermark-enabled', '#pss-watermark-type'
    ].forEach(function(sel) {
      var el = modal.querySelector(sel);
      if (el) {
        el.addEventListener('change', function() {
          collectCurrentTabInputsToState();
          saveState();
        });
      }
    });

    var wmTextEl = modal.querySelector('#pss-watermark-text');
    if (wmTextEl) {
      wmTextEl.addEventListener('input', function() {
        collectCurrentTabInputsToState();
        saveState();
      });
    }

    var wmOpacityEl = modal.querySelector('#pss-watermark-opacity');
    var wmOpacityValEl = modal.querySelector('#pss-watermark-opacity-val');
    if (wmOpacityEl) {
      wmOpacityEl.addEventListener('input', function() {
        if (wmOpacityValEl) wmOpacityValEl.textContent = Math.round(parseFloat(wmOpacityEl.value) * 100) + '%';
        collectCurrentTabInputsToState();
        saveState();
      });
    }

    // Sincronización bidireccional entre barras deslizantes y casillas numéricas libres de tamaño de letra
    [
      { range: '#pss-size-hero',    num: '#pss-num-size-hero' },
      { range: '#pss-size-section', num: '#pss-num-size-section' },
      { range: '#pss-size-body',    num: '#pss-num-size-body' },
      { range: '#pss-size-kpi',     num: '#pss-num-size-kpi' }
    ].forEach(function(pair) {
      var rEl = modal.querySelector(pair.range);
      var nEl = modal.querySelector(pair.num);
      if (rEl && nEl) {
        rEl.addEventListener('input', function() {
          nEl.value = parseFloat(rEl.value).toFixed(1);
          updateTypographyLivePreview(modal);
        });
        nEl.addEventListener('input', function() {
          var v = parseFloat(nEl.value);
          if (!isNaN(v) && v > 0) {
            rEl.value = v;
            updateTypographyLivePreview(modal);
          }
        });
      }
    });

    // Eventos en pestaña Interlineado & Textos (Vista previa en tiempo real)
    [
      '#pss-size-hero', '#pss-size-section', '#pss-size-body', '#pss-size-kpi',
      '#pss-num-size-hero', '#pss-num-size-section', '#pss-num-size-body', '#pss-num-size-kpi',
      '#pss-heading-lh', '#pss-subtitle-lh', '#pss-body-lh',
      '#pss-paragraph-gap', '#pss-subtitle-gap', '#pss-table-lh',
      '#pss-cover-fill-sheet', '#pss-cover-hdr-gap', '#pss-cover-pho-gap', '#pss-cover-pho-h', '#pss-cover-spc-gap', '#pss-cover-box-h', '#pss-balance-card-h',
      '#pss-histogram-h', '#pss-histogram-fill-mode', '#pss-col-histo-bar', '#pss-col-histo-bar-end', '#pss-col-histo-peak', '#pss-col-histo-peak-end',
      '#pss-histo-valsize', '#pss-histo-lblsize', '#pss-histo-axsize',
      '#pss-amort-h', '#pss-amort-fill-mode', '#pss-col-amort-line', '#pss-col-amort-area', '#pss-col-amort-area-end', '#pss-col-amort-pb',
      '#pss-amort-pbsize', '#pss-amort-axsize',
      '#pss-celflow-h', '#pss-celflow-size', '#pss-celflow-descsize', '#pss-celradar-h', '#pss-celradar-lblsize', '#pss-celradar-distsize', '#pss-celgap',
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

    var coverHeaderPresetSel = modal.querySelector('#pss-cover-header-preset');
    if (coverHeaderPresetSel) {
      coverHeaderPresetSel.onchange = function() {
        var val = this.value;
        if (!val) return;
        var parts = val.split('||');
        var tEl = modal.querySelector('#pss-cover-main-title');
        var sEl = modal.querySelector('#pss-cover-subtitle');
        if (tEl && parts[0]) tEl.value = parts[0];
        if (sEl && parts[1]) sEl.value = parts[1];
        collectCurrentTabInputsToState();
        saveState();
        updateTypographyLivePreview(modal);
        if (global.showToast) {
          global.showToast('ENCABEZADO APLICADO', 'Titular y subtítulo adaptados a la tipología seleccionada.', 'success', 2000);
        }
      };
    }

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
    getFullStudioState: getFullStudioState,
    setFullStudioState: setFullStudioState,
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
    getCompanyLogoSrc: getCompanyLogoSrc,
    renderHeaderLogo: renderHeaderLogo,
    getAutoFitClientScript: getAutoFitClientScript,
    getSectionPaginationAndOrderScript: getSectionPaginationAndOrderScript,
    openModal: openModal,
    updateStep5IndicatorUI: updateStep5IndicatorUI,
    setInstallationModality: setInstallationModality,
    INSTALLATION_MODALITIES: INSTALLATION_MODALITIES,
    CANONICAL_SECTIONS: CANONICAL_SECTIONS
  };
  global.RA_ProposalStyleStudio = global.RAProposalStyleStudio;

})(typeof window !== 'undefined' ? window : this);
