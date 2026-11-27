/**
 * ============================================================================
 * RA — VISOR SOLAR 3D (v3.2)
 * MOTOR DE DESGLOSE MULTI-MÓDULO POR FALDÓN (SSOT)
 * ============================================================================
 * Arquitectura canónica para soportar instalaciones híbridas/heterogéneas
 * donde cada faldón o cubierta dispone de un modelo fotovoltaico específico.
 * 
 * Cumple con:
 *  - UNE-EN IEC 62548 (Diseño de generadores fotovoltaicos)
 *  - REBT ITC-BT-40 (Instalaciones generadoras de baja tensión)
 *  - Consistencia con el árbol BOM y el catálogo de equipos
 * ============================================================================
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.RAModulesBreakdown = factory();
    if (!root.RA) root.RA = {};
    root.RA.modulesBreakdown = root.RAModulesBreakdown;
    root.RA.getProjectModulesBreakdown = root.RAModulesBreakdown.getProjectModulesBreakdown;
    root.getProjectModulesBreakdown = root.RAModulesBreakdown.getProjectModulesBreakdown;
  }
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var DEFAULT_PANEL = {
    id: 'ja_550',
    brand: 'JA Solar',
    model: 'JAM72S30-550/MR',
    wp: 550,
    voc: 49.9,
    vmp: 41.97,
    isc: 14.0,
    imp: 13.11,
    efficiency: 21.3,
    tempCoeffPmax: -0.35,
    tempCoeffVoc: -0.275,
    l: 2.279,
    w: 1.134,
    weightKg: 28.6,
    tecnologia: 'Monocristalino N-Type TOPCon',
    price: 125.0
  };

  /**
   * Resuelve el catálogo activo desde el entorno global o parámetro opcional.
   */
  function getCatalog(customCatalog) {
    if (customCatalog) return customCatalog;
    if (typeof window !== 'undefined' && window.equipmentCatalog) return window.equipmentCatalog;
    if (typeof equipmentCatalog !== 'undefined') return equipmentCatalog;
    return null;
  }

  /**
   * Obtiene la especificación completa de un módulo por su ID.
   */
  function resolveModuleSpec(moduleId, catalog) {
    var cat = getCatalog(catalog);
    if (cat && Array.isArray(cat.modules)) {
      var found = cat.modules.find(function (m) { return m.id === moduleId; });
      if (found) {
        return Object.assign({}, DEFAULT_PANEL, found, {
          wp: found.wp || found.potencia || 450,
          price: (typeof found.price === 'number' && found.price > 0) ? found.price : 125.0,
          l: found.l || found.largo || 2.10,
          w: found.w || found.ancho || 1.05,
          weightKg: found.weightKg || found.weight || 24.0,
          efficiency: found.efficiency || found.eff || 21.0,
          tecnologia: found.tecnologia || found.tech || 'Monocristalino N-Type TOPCon'
        });
      }
    }

    // Fallback a panelConfig global si coincide
    if (typeof window !== 'undefined' && window.panelConfig) {
      var pc = window.panelConfig;
      return Object.assign({}, DEFAULT_PANEL, {
        id: moduleId || 'custom_panel',
        brand: pc.fabricante || 'Tier-1',
        model: pc.modelo || 'Estándar',
        wp: pc.potencia || 450,
        voc: pc.voc || 41.5,
        vmp: pc.vmp || 34.5,
        isc: pc.isc || 13.8,
        imp: pc.imp || 13.05,
        l: pc.largo || 2.10,
        w: pc.ancho || 1.05,
        price: pc.precio || 125.0
      });
    }

    return Object.assign({}, DEFAULT_PANEL, { id: moduleId || 'ja_550' });
  }

  /**
   * Obtiene el desglose exhaustivo de módulos y faldones del proyecto actual.
   * Single Source of Truth (SSOT).
   * 
   * @param {Object} [overrideData] Datos simulados o pasados explícitamente (para tests).
   * @returns {Object} Desglose detallado con agregados por faldón, por modelo y métricas globales.
   */
  function getProjectModulesBreakdown(overrideData) {
    var data = overrideData || {};
    var wp = data.WP || (typeof window !== 'undefined' && window.WP ? window.WP : null);
    var polylines = (wp && Array.isArray(wp.polylines)) ? wp.polylines : (data.polylines || []);
    var renderedPanels = data.allRenderedPanels || (typeof window !== 'undefined' && Array.isArray(window.allRenderedPanels) ? window.allRenderedPanels : null);
    var catalog = getCatalog(data.catalog);
    var projCfg = data.solarProjectConfig || (typeof window !== 'undefined' && window.solarProjectConfig ? window.solarProjectConfig : {});
    var globalModId = projCfg.selectedModuleId || 'ja_550';

    var pricing = (typeof window !== 'undefined' && window.RAPricing && typeof window.RAPricing.getEffectivePricing === 'function')
      ? window.RAPricing.getEffectivePricing()
      : null;

    var byRoof = [];
    var modelMap = new Map();

    var totalPanels = 0;
    var totalKwp = 0;
    var totalPanelsCost = 0;

    // Procesar cada faldón/polilínea
    polylines.forEach(function (poly, polyIdx) {
      if (!poly) return;

      var effModId = poly.moduleId || poly.assignedModuleId || globalModId;
      var modSpec = resolveModuleSpec(effModId, catalog);

      var isDisabled = poly.panelsDisabled === true;

      // Obtener paneles reales asignados a este faldón
      var faldonPanels = [];
      if (!isDisabled && renderedPanels && renderedPanels.length > 0) {
        faldonPanels = renderedPanels.filter(function (p) {
          if (!p || p.isGhost || p.deleted || p.disabled) return false;
          if (typeof p.polyIdx === 'number') return p.polyIdx === polyIdx;
          if (typeof p.faldonIndex === 'number') return p.faldonIndex === polyIdx;
          if (p.rawPanel && typeof p.rawPanel.polyIdx === 'number') return p.rawPanel.polyIdx === polyIdx;
          return polylines.length <= 1;
        });
      }

      if (!isDisabled && faldonPanels.length === 0) {
        if (poly.roofInfo && Array.isArray(poly.roofInfo.panels)) {
          faldonPanels = poly.roofInfo.panels.filter(function (p) { return p && !p.isGhost && !p.deleted && !p.disabled; });
        } else if (Array.isArray(poly.panels) && poly.panels.length > 0) {
          faldonPanels = poly.panels.filter(function (p) { return p && !p.isGhost && !p.deleted && !p.disabled; });
        } else if (typeof window !== 'undefined' && typeof window.computeSinglePolylineRoofInfo === 'function' && Array.isArray(poly.points) && poly.points.length >= 3) {
          try {
            var freshRoofInfo = window.computeSinglePolylineRoofInfo(poly.points, poly);
            if (freshRoofInfo && Array.isArray(freshRoofInfo.panels)) {
              poly.roofInfo = freshRoofInfo;
              faldonPanels = freshRoofInfo.panels.filter(function (p) { return p && !p.isGhost && !p.deleted && !p.disabled; });
            }
          } catch (eRec) {}
        }
      }

      var panelCount = isDisabled ? 0 : faldonPanels.length;
      if (!isDisabled && panelCount === 0 && poly.panelCount && typeof poly.panelCount === 'number') {
        panelCount = poly.panelCount;
      }

      // Si no hay paneles en este faldón, aún registramos la configuración si tiene área
      var roofArea = (poly.roofInfo && typeof poly.roofInfo.area3D === 'number')
        ? poly.roofInfo.area3D
        : 0;

      var tiltDeg = (poly.roofInfo && typeof poly.roofInfo.tiltDeg === 'number')
        ? poly.roofInfo.tiltDeg
        : (typeof poly.tiltDeg === 'number' ? poly.tiltDeg : 30);

      var azimuthDeg = (poly.roofInfo && typeof poly.roofInfo.azimuthDeg === 'number')
        ? poly.roofInfo.azimuthDeg
        : (typeof poly.azimuthDeg === 'number' ? poly.azimuthDeg : 0);

      var structureType = poly.structureType || (poly.estructura && poly.estructura.tipo) || 'coplanar_teja';
      var structureMfg = poly.structureMfg || 'sunfer';

      // Precio unitario efectivo: prioridad a override de pricing si existe y es aplicable
      function getEffectiveUnitPrice(spec) {
        var uPrice = (spec && spec.price) || 125.0;
        if (pricing && typeof pricing.panelPrice === 'number' && pricing.panelPrice > 0) {
          if (polylines.length === 1 || !(spec && spec.price)) {
            uPrice = pricing.panelPrice;
          }
        }
        return uPrice;
      }
      var unitPrice = getEffectiveUnitPrice(modSpec);

      // Sumar potencia y coste respetando overrides individuales por panel si existen
      var subtotalKwp = 0;
      var subtotalCost = 0;
      var perRoofModelCounts = [];
      if (faldonPanels.length > 0) {
        var roofModelAgg = new Map();
        faldonPanels.forEach(function (fp) {
          var fpModId = (fp && (fp.moduleId || (fp.rawPanel && fp.rawPanel.moduleId))) || effModId;
          var fpSpec = (fpModId === effModId) ? modSpec : resolveModuleSpec(fpModId, catalog);
          var fpPrice = (fpModId === effModId) ? unitPrice : getEffectiveUnitPrice(fpSpec);
          var fpKwp = (fpSpec.wp || 450) / 1000.0;
          subtotalKwp += fpKwp;
          subtotalCost += fpPrice;
          if (!roofModelAgg.has(fpModId)) {
            roofModelAgg.set(fpModId, { id: fpModId, spec: fpSpec, unitPrice: fpPrice, count: 0, kwp: 0, cost: 0 });
          }
          var agg = roofModelAgg.get(fpModId);
          agg.count += 1;
          agg.kwp += fpKwp;
          agg.cost += fpPrice;
        });
        perRoofModelCounts = Array.from(roofModelAgg.values());
      } else {
        subtotalKwp = (panelCount * (modSpec.wp || 450)) / 1000.0;
        subtotalCost = panelCount * unitPrice;
        if (panelCount > 0) {
          perRoofModelCounts.push({ id: effModId, spec: modSpec, unitPrice: unitPrice, count: panelCount, kwp: subtotalKwp, cost: subtotalCost });
        }
      }

      var roofItem = {
        roofIndex: polyIdx,
        roofId: poly.id || ('roof_' + polyIdx),
        name: poly.name || ('Faldón ' + (polyIdx + 1)),
        panelCount: panelCount,
        moduleId: effModId,
        moduleBrand: modSpec.brand || '',
        moduleModel: modSpec.model || effModId,
        moduleFullName: (modSpec.brand ? modSpec.brand + ' ' : '') + (modSpec.model || effModId),
        wp: modSpec.wp || 450,
        kwp: parseFloat(subtotalKwp.toFixed(3)),
        voc: modSpec.voc || 41.5,
        vmp: modSpec.vmp || 34.5,
        isc: modSpec.isc || 13.8,
        imp: modSpec.imp || 13.05,
        efficiency: modSpec.efficiency || 21.0,
        tempCoeffPmax: modSpec.tempCoeffPmax || -0.35,
        length: modSpec.l || 2.10,
        width: modSpec.w || 1.05,
        weightKg: modSpec.weightKg || 24.0,
        technology: modSpec.tecnologia || 'Monocristalino N-Type TOPCon',
        unitPrice: unitPrice,
        subtotalCost: Math.round(subtotalCost * 100) / 100,
        tiltDeg: Math.round(tiltDeg),
        azimuthDeg: Math.round(azimuthDeg),
        roofAreaM2: parseFloat(roofArea.toFixed(1)),
        structureType: structureType,
        structureMfg: structureMfg
      };

      byRoof.push(roofItem);

      if (panelCount > 0) {
        totalPanels += panelCount;
        totalKwp += subtotalKwp;
        totalPanelsCost += subtotalCost;

        // Agregación por modelo (soporta heterogeneidad intra-faldón e inter-faldón)
        perRoofModelCounts.forEach(function (agg) {
          var rmId = agg.id;
          var rmSpec = agg.spec;
          if (!modelMap.has(rmId)) {
            modelMap.set(rmId, {
              moduleId: rmId,
              brand: rmSpec.brand || '',
              model: rmSpec.model || rmId,
              fullName: (rmSpec.brand ? rmSpec.brand + ' ' : '') + (rmSpec.model || rmId),
              wp: rmSpec.wp || 450,
              voc: rmSpec.voc || 41.5,
              vmp: rmSpec.vmp || 34.5,
              isc: rmSpec.isc || 13.8,
              imp: rmSpec.imp || 13.05,
              efficiency: rmSpec.efficiency || 21.0,
              tempCoeffPmax: rmSpec.tempCoeffPmax || -0.35,
              length: rmSpec.l || 2.10,
              width: rmSpec.w || 1.05,
              weightKg: rmSpec.weightKg || 24.0,
              technology: rmSpec.tecnologia || 'Monocristalino N-Type TOPCon',
              unitPrice: agg.unitPrice,
              count: 0,
              kwp: 0,
              totalCost: 0,
              roofIndices: [],
              roofNames: []
            });
          }

          var mEntry = modelMap.get(rmId);
          mEntry.count += agg.count;
          mEntry.kwp = parseFloat((mEntry.kwp + agg.kwp).toFixed(3));
          mEntry.totalCost = Math.round((mEntry.totalCost + agg.cost) * 100) / 100;
          if (mEntry.roofIndices.indexOf(polyIdx) === -1) {
            mEntry.roofIndices.push(polyIdx);
            mEntry.roofNames.push(roofItem.name);
          }
        });
      }
    });

    // Caso de borde: si no hay faldones poligonales o se usa el layout plano por defecto
    if (byRoof.length === 0 && totalPanels === 0) {
      var fallbackCount = renderedPanels
        ? renderedPanels.filter(function (p) { return p && !p.deleted && !p.disabled; }).length
        : 0;
      if (fallbackCount === 0 && typeof window !== 'undefined' && window.simulatedPanelEntities) {
        fallbackCount = window.simulatedPanelEntities.length;
      }
      if (fallbackCount > 0) {
        var defaultModSpec = resolveModuleSpec(globalModId, catalog);
        var defKwp = (fallbackCount * defaultModSpec.wp) / 1000.0;
        var defCost = fallbackCount * (defaultModSpec.price || 125.0);

        totalPanels = fallbackCount;
        totalKwp = defKwp;
        totalPanelsCost = defCost;

        var singleRoof = {
          roofIndex: 0,
          roofId: 'roof_default',
          name: 'Cubierta Principal',
          panelCount: fallbackCount,
          moduleId: globalModId,
          moduleBrand: defaultModSpec.brand,
          moduleModel: defaultModSpec.model,
          moduleFullName: (defaultModSpec.brand ? defaultModSpec.brand + ' ' : '') + defaultModSpec.model,
          wp: defaultModSpec.wp,
          kwp: parseFloat(defKwp.toFixed(3)),
          voc: defaultModSpec.voc,
          vmp: defaultModSpec.vmp,
          isc: defaultModSpec.isc,
          imp: defaultModSpec.imp,
          efficiency: defaultModSpec.efficiency,
          tempCoeffPmax: defaultModSpec.tempCoeffPmax,
          length: defaultModSpec.l,
          width: defaultModSpec.w,
          weightKg: defaultModSpec.weightKg,
          technology: defaultModSpec.tecnologia,
          unitPrice: defaultModSpec.price || 125.0,
          subtotalCost: Math.round(defCost * 100) / 100,
          tiltDeg: 30,
          azimuthDeg: 0,
          roofAreaM2: 0,
          structureType: 'coplanar_teja',
          structureMfg: 'sunfer'
        };

        byRoof.push(singleRoof);
        modelMap.set(globalModId, {
          moduleId: globalModId,
          brand: defaultModSpec.brand,
          model: defaultModSpec.model,
          fullName: (defaultModSpec.brand ? defaultModSpec.brand + ' ' : '') + defaultModSpec.model,
          wp: defaultModSpec.wp,
          voc: defaultModSpec.voc,
          vmp: defaultModSpec.vmp,
          isc: defaultModSpec.isc,
          imp: defaultModSpec.imp,
          efficiency: defaultModSpec.efficiency,
          tempCoeffPmax: defaultModSpec.tempCoeffPmax,
          length: defaultModSpec.l,
          width: defaultModSpec.w,
          weightKg: defaultModSpec.weightKg,
          technology: defaultModSpec.tecnologia,
          unitPrice: defaultModSpec.price || 125.0,
          count: fallbackCount,
          kwp: parseFloat(defKwp.toFixed(3)),
          totalCost: Math.round(defCost * 100) / 100,
          roofIndices: [0],
          roofNames: ['Cubierta Principal']
        });
      }
    }

    var byModel = Array.from(modelMap.values());
    var isMultiModule = byModel.length > 1;

    return {
      totalPanels: totalPanels,
      totalKwp: parseFloat(totalKwp.toFixed(3)),
      totalPanelsCost: Math.round(totalPanelsCost * 100) / 100,
      uniqueModelsCount: byModel.length,
      isMultiModule: isMultiModule,
      byModel: byModel,
      byRoof: byRoof,
      primaryModel: byModel[0] || resolveModuleSpec(globalModId, catalog)
    };
  }

  /**
   * Genera texto resumen del campo generador (útil para cabeceras y memorias).
   */
  function formatModuleSummaryText(breakdown) {
    if (!breakdown || breakdown.totalPanels === 0) return 'Sin módulos instalados';
    if (!breakdown.isMultiModule) {
      var m = breakdown.byModel[0];
      return breakdown.totalPanels + ' módulos ' + (m ? m.fullName : 'Tier-1') + ' (' + (m ? m.wp : 450) + ' Wp) · ' + breakdown.totalKwp.toFixed(2) + ' kWp';
    }
    var parts = breakdown.byModel.map(function (m) {
      return m.count + '× ' + m.fullName + ' (' + m.wp + ' Wp)';
    });
    return breakdown.totalPanels + ' módulos en ' + breakdown.byModel.length + ' modelos (' + parts.join(', ') + ') · ' + breakdown.totalKwp.toFixed(2) + ' kWp';
  }

  /**
   * Genera el HTML de la tabla de subcampos por faldón para presupuestos y memorias.
   */
  function renderSubfieldsTableHTML(breakdown, options) {
    var opts = options || {};
    var isDark = !!opts.dark;
    var includeCost = opts.includeCost !== false;

    if (!breakdown || !breakdown.byRoof || breakdown.byRoof.length === 0) {
      return '<p style="color:#94a3b8;font-size:11px;font-style:italic;">No hay subcampos definidos.</p>';
    }

    var structLabels = {
      'coplanar_teja': 'Coplanar Teja',
      'coplanar_chapa': 'Coplanar Chapa',
      'triangles_30': 'Triángulos 30º',
      'triangles_15_ew': 'Estructura 15º E-O',
      'triangles_custom': 'Triángulos Adaptables',
      'pergola': 'Pérgola Elevada'
    };

    var html = '<table class="doc-table' + (isDark ? ' dark' : '') + '" style="width:100%;border-collapse:collapse;margin:12px 0;font-size:11px;">';
    html += '<thead><tr style="background:' + (isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9') + ';text-align:left;">';
    html += '<th style="padding:6px 8px;border:1px solid ' + (isDark ? 'rgba(255,255,255,0.1)' : '#cbd5e1') + ';">Faldón / Cubierta</th>';
    html += '<th style="padding:6px 8px;border:1px solid ' + (isDark ? 'rgba(255,255,255,0.1)' : '#cbd5e1') + ';">Orientación / Inclinación</th>';
    html += '<th style="padding:6px 8px;border:1px solid ' + (isDark ? 'rgba(255,255,255,0.1)' : '#cbd5e1') + ';">Modelo Asignado</th>';
    html += '<th style="padding:6px 8px;text-align:center;border:1px solid ' + (isDark ? 'rgba(255,255,255,0.1)' : '#cbd5e1') + ';">Uds</th>';
    html += '<th style="padding:6px 8px;text-align:right;border:1px solid ' + (isDark ? 'rgba(255,255,255,0.1)' : '#cbd5e1') + ';">Potencia (kWp)</th>';
    html += '<th style="padding:6px 8px;border:1px solid ' + (isDark ? 'rgba(255,255,255,0.1)' : '#cbd5e1') + ';">Estructura Soporte</th>';
    if (includeCost) {
      html += '<th style="padding:6px 8px;text-align:right;border:1px solid ' + (isDark ? 'rgba(255,255,255,0.1)' : '#cbd5e1') + ';">Subtotal Módulos</th>';
    }
    html += '</tr></thead><tbody>';

    breakdown.byRoof.forEach(function (r) {
      var structName = structLabels[r.structureType] || r.structureType;
      html += '<tr>';
      html += '<td style="padding:6px 8px;font-weight:600;border:1px solid ' + (isDark ? 'rgba(255,255,255,0.07)' : '#e2e8f0') + ';">' + r.name + '</td>';
      html += '<td style="padding:6px 8px;border:1px solid ' + (isDark ? 'rgba(255,255,255,0.07)' : '#e2e8f0') + ';">Az: ' + r.azimuthDeg + 'º · Inc: ' + r.tiltDeg + 'º</td>';
      html += '<td style="padding:6px 8px;border:1px solid ' + (isDark ? 'rgba(255,255,255,0.07)' : '#e2e8f0') + ';"><strong>' + r.moduleFullName + '</strong> (' + r.wp + ' Wp)</td>';
      html += '<td style="padding:6px 8px;text-align:center;border:1px solid ' + (isDark ? 'rgba(255,255,255,0.07)' : '#e2e8f0') + ';">' + r.panelCount + '</td>';
      html += '<td style="padding:6px 8px;text-align:right;font-weight:600;border:1px solid ' + (isDark ? 'rgba(255,255,255,0.07)' : '#e2e8f0') + ';">' + r.kwp.toFixed(2) + ' kWp</td>';
      html += '<td style="padding:6px 8px;border:1px solid ' + (isDark ? 'rgba(255,255,255,0.07)' : '#e2e8f0') + ';">' + structName + ' (' + (r.structureMfg ? r.structureMfg.toUpperCase() : 'ESTÁNDAR') + ')</td>';
      if (includeCost) {
        html += '<td style="padding:6px 8px;text-align:right;border:1px solid ' + (isDark ? 'rgba(255,255,255,0.07)' : '#e2e8f0') + ';">' + r.subtotalCost.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €</td>';
      }
      html += '</tr>';
    });

    html += '<tr style="background:' + (isDark ? 'rgba(255,255,255,0.08)' : '#f8fafc') + ';font-weight:bold;">';
    html += '<td colspan="3" style="padding:6px 8px;border:1px solid ' + (isDark ? 'rgba(255,255,255,0.1)' : '#cbd5e1') + ';">TOTAL GENERADOR FOTOVOLTAICO</td>';
    html += '<td style="padding:6px 8px;text-align:center;border:1px solid ' + (isDark ? 'rgba(255,255,255,0.1)' : '#cbd5e1') + ';">' + breakdown.totalPanels + '</td>';
    html += '<td style="padding:6px 8px;text-align:right;color:#0284c7;border:1px solid ' + (isDark ? 'rgba(255,255,255,0.1)' : '#cbd5e1') + ';">' + breakdown.totalKwp.toFixed(2) + ' kWp</td>';
    html += '<td style="padding:6px 8px;border:1px solid ' + (isDark ? 'rgba(255,255,255,0.1)' : '#cbd5e1') + ';">' + breakdown.byRoof.length + ' subcampo(s)</td>';
    if (includeCost) {
      html += '<td style="padding:6px 8px;text-align:right;color:#0284c7;border:1px solid ' + (isDark ? 'rgba(255,255,255,0.1)' : '#cbd5e1') + ';">' + breakdown.totalPanelsCost.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €</td>';
    }
    html += '</tr></tbody></table>';

    return html;
  }

  /**
   * Genera el HTML de la tabla comparativa multi-modelo para la Memoria Técnica.
   */
  function renderMultiModelSpecsTableHTML(breakdown) {
    if (!breakdown || !breakdown.byModel || breakdown.byModel.length === 0) {
      return '';
    }

    var models = breakdown.byModel;
    var html = '<table class="doc-table" style="width:100%;border-collapse:collapse;margin:12px 0;font-size:11px;">';
    html += '<thead><tr style="background:#f1f5f9;text-align:left;">';
    html += '<th style="padding:6px 8px;border:1px solid #cbd5e1;">Parámetro Técnico (STC: 1000 W/m², 25ºC)</th>';
    models.forEach(function (m) {
      html += '<th style="padding:6px 8px;text-align:center;border:1px solid #cbd5e1;">' + m.fullName + '</th>';
    });
    html += '</tr></thead><tbody>';

    var rows = [
      { label: 'Potencia Pico Nominal (Pmax)', format: function (m) { return '<strong>' + m.wp + ' Wp</strong>'; } },
      { label: 'Tecnología de Célula', format: function (m) { return m.technology; } },
      { label: 'Eficiencia / Rendimiento (η)', format: function (m) { return m.efficiency + ' %'; } },
      { label: 'Tensión en Punto de Máx. Potencia (Vmp)', format: function (m) { return m.vmp.toFixed(2) + ' V'; } },
      { label: 'Intensidad en Punto de Máx. Potencia (Imp)', format: function (m) { return m.imp.toFixed(2) + ' A'; } },
      { label: 'Tensión de Circuito Abierto (Voc)', format: function (m) { return m.voc.toFixed(2) + ' V'; } },
      { label: 'Corriente de Cortocircuito (Isc)', format: function (m) { return m.isc.toFixed(2) + ' A'; } },
      { label: 'Coeficiente Térmico de Potencia (γ Pmax)', format: function (m) { return m.tempCoeffPmax + ' %/ºC'; } },
      { label: 'Dimensiones Unitarias (Largo × Ancho)', format: function (m) { return m.length.toFixed(3) + ' × ' + m.width.toFixed(3) + ' m'; } },
      { label: 'Peso Unitario', format: function (m) { return m.weightKg.toFixed(1) + ' kg'; } },
      { label: 'Unidades Instaladas en Proyecto', format: function (m) { return '<strong>' + m.count + ' uds</strong>'; } },
      { label: 'Potencia Pico Subtotal Acumulada', format: function (m) { return '<strong>' + m.kwp.toFixed(2) + ' kWp</strong>'; } },
      { label: 'Subcampos / Faldones Asociados', format: function (m) { return m.roofNames.join(', '); } }
    ];

    rows.forEach(function (r) {
      html += '<tr>';
      html += '<td style="padding:6px 8px;font-weight:500;border:1px solid #e2e8f0;background:#fafafa;">' + r.label + '</td>';
      models.forEach(function (m) {
        html += '<td style="padding:6px 8px;text-align:center;border:1px solid #e2e8f0;">' + r.format(m) + '</td>';
      });
      html += '</tr>';
    });

    html += '</tbody></table>';
    return html;
  }

  /**
   * Resuelve conteo efectivo y potencia pico total (kWp) usando el desglose SSOT,
   * soportando conteo forzado o estimación preliminar cuando aún no hay geometría.
   */
  function getEffectiveFieldTotals(options) {
    var opts = options || {};
    var projCfg = (typeof window !== 'undefined' && window.solarProjectConfig) ? window.solarProjectConfig : {};
    var globalMod = resolveModuleSpec(opts.moduleId || projCfg.selectedModuleId || 'ja_550', opts.catalog);
    var mb = getProjectModulesBreakdown(opts.overrideData);
    var totalPanels = (mb && typeof mb.totalPanels === 'number') ? mb.totalPanels : 0;
    var totalKwp = (mb && typeof mb.totalKwp === 'number') ? mb.totalKwp : 0;

    if (typeof opts.forcedCount === 'number' && opts.forcedCount > 0) {
      totalPanels = opts.forcedCount;
      totalKwp = (totalPanels * (globalMod.wp || 450)) / 1000.0;
    } else if (totalPanels === 0 && typeof opts.fallbackEstimated === 'number' && opts.fallbackEstimated > 0) {
      totalPanels = opts.fallbackEstimated;
      totalKwp = (totalPanels * (globalMod.wp || 450)) / 1000.0;
    }

    return {
      totalPanels: totalPanels,
      totalKwp: parseFloat(totalKwp.toFixed(3)),
      primaryModel: (mb && mb.primaryModel) || globalMod,
      breakdown: mb
    };
  }

  return {
    getProjectModulesBreakdown: getProjectModulesBreakdown,
    getEffectiveFieldTotals: getEffectiveFieldTotals,
    resolveModuleSpec: resolveModuleSpec,
    formatModuleSummaryText: formatModuleSummaryText,
    renderSubfieldsTableHTML: renderSubfieldsTableHTML,
    renderMultiModelSpecsTableHTML: renderMultiModelSpecsTableHTML,
    DEFAULT_PANEL: DEFAULT_PANEL
  };
});
