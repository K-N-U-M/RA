/**
 * js/bom-tree.js — Motor de Metrado Paramétrico y Árbol de Proyecto BIM (BOM Dinámico)
 * ===============================================================================
 * Arquitectura Modular Fotovoltaica AAA (Proyecto RA)
 * - Metrado paramétrico automático de estructuras (coplanar, lastrada, pérgola).
 * - Cómputo de tornillería, clamps intermedios/finales, fijaciones y lastres CTE.
 * - Desglose multi-módulo y detección de MLPE (optimizadores y microinversores).
 * - Cableado DC/AC anti-bucle inductivo (UNE-EN 62305) y puesta a tierra.
 * - Cuadros de protección DC (SPD II) y AC.
 * - Comprobación de sobrecarga estructural (kg/m² vs límite de cubierta CTE DB-SE).
 * - Ventana flotante Glassmorphism interactiva con selección bidireccional 3D ↔ Árbol.
 * ===============================================================================
 */

(function(root) {
  'use strict';

  // Ratios paramétricos de ingeniería de montaje (estándar UNE/CTE y mercado comercial)
  const BOM_DEFAULTS = {
    CLAMPS_PER_ROW_END: 4,               // 2 por cada extremo de fila
    VARILLAS_PER_PANEL_COPLANAR: 2.2,    // Fijaciones sándwich / salva-tejas por panel
    PERFIL_METERS_PER_PANEL: 2.25,       // Metros lineales de guía de aluminio por panel (2 raíles por fila)
    BAR_LENGTH_M: 3.15,                  // Longitud estándar de barra comercial de perfil aluminio (m)
    PERFIL_PRICE_PER_METER: 8.50,        // Precio mercado perfil de aluminio 40x40 EN AW-6063 T6 (€/m)
    SPLICE_PRICE_UNIT: 3.20,             // Conector de empalme de carril (€/ud)
    SALVATEJAS_PRICE_UNIT: 7.50,         // Salvateja regulable Inox A2 para teja con tornillería (€/ud)
    CHAPA_SCREW_PRICE_UNIT: 1.80,        // Tornillo autorroscante bimetálico con arandela EPDM (€/ud)
    A_FRAME_TRIANGLE_PRICE: 24.50,       // Escuadra A-frame de aluminio premontada (€/ud)
    BALLAST_BLOCK_PRICE: 9.50,           // Bloque prefabricado de hormigón para lastre (€/ud)
    BALLAST_BLOCKS_PER_PANEL_15: 2,      // Bloques de hormigón por soporte a 15°
    BALLAST_BLOCKS_PER_PANEL_30: 3,      // Bloques de hormigón por soporte a 30°
    BALLAST_WEIGHT_KG: 45.0,             // Masa unitaria de bloque de hormigón estándar
    MC4_PAIRS_PER_STRING: 2,             // Pares de conectores MC4 por string (positivo y negativo)
    EARTH_RODS_PER_25KWP: 1,             // Picas de tierra de cobre por cada 25 kWp
    EARTH_WIRE_PER_PANEL_M: 1.2,         // Conductor de tierra desnudo o 1x16mm² por panel
    LABOR_HOURLY_RATE: 32.0,             // Tarifa oficial de cuadrilla instaladora (€/h)
    LABOR_HOURS_PER_PANEL: 1.4           // Horas totales montaje mecánico + fijación + strings por panel
  };

  /**
   * Motor de cálculo paramétrico del Árbol BIM
   */
  const BOMTreeEngine = {
    /**
     * Genera el desglose completo del BOM a partir del estado de la aplicación
     */
    computeBOMTree: function(options = {}) {
      const WP = options.WP || (typeof root.WP !== 'undefined' ? root.WP : null);
      const catalog = options.catalog || (typeof root.equipmentCatalog !== 'undefined' ? root.equipmentCatalog : null);
      const projectConfig = options.projectConfig || (typeof root.solarProjectConfig !== 'undefined' ? root.solarProjectConfig : null) || {};

      const tree = {
        timestamp: Date.now(),
        summary: {
          totalPanels: 0,
          totalKwp: 0,
          totalAcKw: 0,
          totalStorageKwh: 0,
          totalOptimizers: 0,
          totalMicroinverters: 0,
          totalInverters: 0,
          totalWindTurbines: 0,
          totalWindKw: 0,
          windTotalEur: 0,
          subtotalEur: 0,
          pecDirectCostEur: 0,
          municipalTaxesEur: 0,
          maxLoadKgM2: 0,
          loadWarning: false
        },
        roofs: [],
        wind: {
          turbines: [],
          grouped: [],
          totalTurbines: 0,
          totalWindKw: 0,
          turbinesOnlyEur: 0,
          supportAndAuxEur: 0,
          totalEur: 0
        },
        electrical: {
          inverters: [],
          microinverters: [],
          optimizers: null,
          batteries: [],
          dcPanels: [],
          acPanels: [],
          cables: [],
          grounding: [],
          safetySignage: null,
          cablesTotalEur: 0,
          panelsProtTotalEur: 0
        },
        obstacles: [],
        laborAndSoftCosts: []
      };

      if (!catalog) return tree;

      // Catálogo de módulos para búsquedas rápidas
      const moduleMap = new Map();
      if (Array.isArray(catalog.modules)) {
        catalog.modules.forEach(m => moduleMap.set(m.id, m));
      }
      const defaultMod = catalog.modules && catalog.modules[0] ? catalog.modules[0] : { wp: 450, price: 120, weightKg: 24 };

      // ── 1. PROCESAR CADA FALDOÓN / POLILÍNEA DE CUBIERTA ────────────────────
      const polylines = (WP && Array.isArray(WP.polylines)) ? WP.polylines : [];

      polylines.forEach((poly, polyIdx) => {
        const polyId = poly.id || `faldon_${polyIdx + 1}`;
        const polyName = poly.name || `Faldón ${polyIdx + 1}`;
        const roofType = poly.roofType || 'sandwich_metal';
        const cteLimitKgM2 = (roofType === 'deck' || roofType === 'chapa' || (poly.structureType && poly.structureType.indexOf('chapa') !== -1)) ? 40.0 : 100.0;
        const maxLoad = poly.maxStructuralLoadKgM2 || cteLimitKgM2;
        const stType = poly.structureType || 'coplanar_teja';
        const isTriangular = stType.includes('triangle');
        const estType = stType;
        const structCfg = poly.structureConfig || { type: estType, tiltDeg: isTriangular ? 30.0 : 0.0, azimuthDeg: 180.0 };

        const isFaldonDisabled = (poly && poly.panelsDisabled === true);
        if (isFaldonDisabled) {
          tree.roofs.push({
            id: polyId,
            name: polyName + ' (DESACTIVADO)',
            roofType: roofType,
            panelCount: 0,
            disabled: true,
            kwp: 0,
            totalKwp: 0,
            areaM2: 0,
            structureType: structCfg.type || 'coplanar',
            tiltDeg: structCfg.tiltDeg || 0,
            azimuthDeg: structCfg.azimuthDeg || 180,
            moduleDistribution: {},
            models: []
          });
          return;
        }

        // Single Source of Truth: Priorizar los módulos reales renderizados en 3D para este faldón
        let panels = [];
        if (typeof root !== 'undefined' && Array.isArray(root.allRenderedPanels) && root.allRenderedPanels.length > 0) {
          panels = root.allRenderedPanels.filter(p => {
            if (!p || p.deleted || p.disabled) return false;
            if (typeof p.polyIdx === 'number') return p.polyIdx === polyIdx;
            if (typeof p.faldonIndex === 'number') return p.faldonIndex === polyIdx;
            if (p.rawPanel && typeof p.rawPanel.polyIdx === 'number') return p.rawPanel.polyIdx === polyIdx;
            return polylines.length <= 1;
          });
        }
        // Fallback robusto a arrays de faldón si no se encontró en allRenderedPanels
        if (panels.length === 0) {
          if (Array.isArray(poly.panels) && poly.panels.length > 0) {
            panels = poly.panels.filter(p => p && !p.deleted && !p.disabled);
          } else if (poly.roofInfo && Array.isArray(poly.roofInfo.panels) && poly.roofInfo.panels.length > 0) {
            panels = poly.roofInfo.panels.filter(p => p && !p.deleted && !p.disabled);
          } else if (typeof root.computeSinglePolylineRoofInfo === 'function' && Array.isArray(poly.points) && poly.points.length >= 3) {
            try {
              const freshInfo = root.computeSinglePolylineRoofInfo(poly.points, poly);
              if (freshInfo && Array.isArray(freshInfo.panels)) {
                poly.roofInfo = freshInfo;
                panels = freshInfo.panels.filter(p => p && !p.deleted && !p.disabled);
              }
            } catch(eRec) {}
          }
        }
        
        const panelCount = panels.length;

        if (panelCount === 0) {
          // Aún sin paneles: solo añadir el faldón básico al árbol
          tree.roofs.push({
            id: polyId,
            name: polyName,
            roofType: roofType,
            panelCount: 0,
            kwp: 0,
            moduleDistribution: {},
            optimizersCount: 0,
            structure: { type: 'Ninguna', tiltDeg: 0, costEur: 0, weightKg: 0 },
            clamps: { midCount: 0, endCount: 0, costEur: 0 },
            ballast: { blocksCount: 0, totalWeightKg: 0 },
            structuralLoad: { totalKg: 0, kgPerM2: 0, maxAllowedKgM2: maxLoad, isOverloaded: false },
            subtotalEur: 0
          });
          return;
        }

        // Desglose de módulos en este faldón (puede ser mixto)
        const moduleCounts = {};
        let optimizersInRoof = 0;
        let roofKwp = 0;
        let roofPanelsWeightKg = 0;

        panels.forEach(p => {
          const mId = p.moduleId || (p.rawPanel && p.rawPanel.moduleId) || poly.assignedModuleId || projectConfig.selectedModuleId || defaultMod.id;
          moduleCounts[mId] = (moduleCounts[mId] || 0) + 1;
          const modSpec = moduleMap.get(mId) || defaultMod;
          roofKwp += (modSpec.wp || 450) / 1000.0;
          roofPanelsWeightKg += (modSpec.weightKg || 25.0);
          const needsMLPE = (p.hasOptimizer || p.hasMLPE || p.optimizerModelId || (typeof p.annualLossPct === 'number' && p.annualLossPct >= 8.0));
          if (needsMLPE && projectConfig.selectedTopology !== 'microinverter') {
            optimizersInRoof++;
          }
        });
        const isFullRoofMLPE = (poly && poly.optimizerCoverage === 'full') || (projectConfig && projectConfig.optimizerCoverage === 'full');
        if (optimizersInRoof === 0 && projectConfig.selectedTopology === 'optimizer' && isFullRoofMLPE) {
          optimizersInRoof = panels.length;
        }

        // Estructura y tornillería paramétrica según mercado comercial
        const structWeightMap = {
          'coplanar_teja': 3.5,
          'coplanar_chapa': 2.5,
          'ballast_blocks': 0.5,
          'triangles_30': 6.5,
          'triangles_15_ew': 7.0,
          'triangles_custom': 6.5,
          'pergola': 12.0
        };

        // ── Detección analítica de filas de módulos en cubierta ───────────────────
        let estRows = Math.max(1, Math.ceil(Math.sqrt(panelCount)));
        if (panels.length > 0 && typeof panels[0].v === 'number') {
          const panelH = panels[0].h || 2.10;
          const rowGroups = [];
          panels.forEach(p => {
            const pv = (typeof p.v === 'number') ? p.v : 0;
            let group = rowGroups.find(g => Math.abs(g.meanV - pv) < panelH * 0.40);
            if (group) {
              group.count++;
              group.meanV = (group.meanV + pv) / 2;
            } else {
              rowGroups.push({ meanV: pv, count: 1 });
            }
          });
          if (rowGroups.length > 0) estRows = rowGroups.length;
        }

        // Fabricante de estructura para este faldón (Sunfer, K2, Fischer, Personalizado)
        const mfgId = poly.structureManufacturer || (root.RAStructureCatalog ? root.RAStructureCatalog.getActiveManufacturer(polyIdx) : 'sunfer');
        const mfg = (root.RAStructureCatalog && typeof root.RAStructureCatalog.getStructure === 'function')
          ? root.RAStructureCatalog.getStructure(mfgId)
          : {
              brand: 'Sunfer Energy',
              railPricePerMeter: BOM_DEFAULTS.PERFIL_PRICE_PER_METER,
              barLengthM: BOM_DEFAULTS.BAR_LENGTH_M,
              splicePrice: BOM_DEFAULTS.SPLICE_PRICE_UNIT,
              tileHookPrice: BOM_DEFAULTS.SALVATEJAS_PRICE_UNIT,
              sheetScrewPrice: BOM_DEFAULTS.CHAPA_SCREW_PRICE_UNIT,
              trianglePrice: BOM_DEFAULTS.A_FRAME_TRIANGLE_PRICE,
              ballastBlockPrice: BOM_DEFAULTS.BALLAST_BLOCK_PRICE,
              endClampPrice: 1.65,
              midClampPrice: 1.45,
              tieBarPrice: 8.00
            };

        // Grapas (Clamps): 2 intermedias por panel entre módulos, 4 en extremos de cada fila
        const midClamps = Math.max(0, (panelCount - estRows) * 2);
        const endClamps = estRows * BOM_DEFAULTS.CLAMPS_PER_ROW_END;

        // Metrado de perfilería de aluminio (2 carriles guía paralelos por cada fila de módulos)
        const avgModWidth = (panels[0] && panels[0].orientation === 'landscape') ? (panels[0].h || 2.10) : (panels[0].w || 1.05);
        const railLengthPerRow = (panelCount / estRows) * (avgModWidth + 0.02) + 0.10;
        const totalProfileMeters = Math.max(panelCount * 1.5, parseFloat((estRows * 2 * railLengthPerRow).toFixed(1)));
        const standardBarsCount = Math.ceil(totalProfileMeters / (mfg.barLengthM || BOM_DEFAULTS.BAR_LENGTH_M));
        const railSplicesCount = Math.max(0, standardBarsCount - (estRows * 2));

        // Fijaciones y anclajes según tipo de soporte
        let fixingsCount = 0;
        let fixingsType = 'Salvatejas Inox A2 regulables';
        let fixingsUnitCost = mfg.tileHookPrice || BOM_DEFAULTS.SALVATEJAS_PRICE_UNIT;
        let ballastBlocks = 0;
        let ballastWeightKg = 0;
        let structMaterialsCostEur = 0;

        const isBallastBlocks = (stType === 'ballast_blocks' || (poly.estructura && poly.estructura.tipo === 'balasto_bloques'));

        if (isBallastBlocks) {
          const blocksPerMod = poly.blocksPerPanel || (poly.estructura && poly.estructura.blocksPerPanel) || 2;
          ballastBlocks = panelCount * blocksPerMod;
          const blockWeight = (mfg && typeof mfg.ballastBlockWeightKg === 'number' && mfg.ballastBlockWeightKg > 0)
            ? mfg.ballastBlockWeightKg
            : (BOM_DEFAULTS.BALLAST_WEIGHT_KG || 45.0);
          ballastWeightKg = ballastBlocks * blockWeight;
          fixingsType = 'Bloques prefabricados de hormigón (' + blockWeight + ' kg/ud)';
          fixingsCount = ballastBlocks;
          fixingsUnitCost = mfg.ballastBlockPrice || BOM_DEFAULTS.BALLAST_BLOCK_PRICE;
          structMaterialsCostEur = ballastBlocks * fixingsUnitCost;
        } else if (stType === 'coplanar_chapa') {
          fixingsType = 'Tornillos autorroscantes bimetálicos EPDM';
          fixingsCount = panelCount * 4;
          fixingsUnitCost = mfg.sheetScrewPrice || BOM_DEFAULTS.CHAPA_SCREW_PRICE_UNIT;
          const profileCost = totalProfileMeters * (mfg.railPricePerMeter || BOM_DEFAULTS.PERFIL_PRICE_PER_METER);
          const splicesCost = railSplicesCount * (mfg.splicePrice || BOM_DEFAULTS.SPLICE_PRICE_UNIT);
          const fixCost = fixingsCount * fixingsUnitCost;
          structMaterialsCostEur = profileCost + splicesCost + fixCost;
        } else if (stType === 'pergola' || (poly.estructura && poly.estructura.tipo === 'pergola')) {
          const pergClearance = (poly.estructura && typeof poly.estructura.clearance === 'number') ? poly.estructura.clearance : (poly.pergolaHeight || 1.80);
          const pergSubtype = poly.pergolaSubtype || (poly.estructura && poly.estructura.subtype) || 'continuous';
          const postsPerPanel = 2.0; // Media de pilares por módulo en marquesina/pérgola estructural
          const totalPosts = Math.max(4, Math.round(panelCount * postsPerPanel));
          const postUnitCost = Math.round(pergClearance * 45.0 + 35.0); // Coste por pilar estructural según altura + anclaje a forjado
          const beamCost = totalProfileMeters * (mfg.railPricePerMeter ? mfg.railPricePerMeter * 1.6 : 14.80); // Viga reforzada de dintel
          const splicesCost = railSplicesCount * (mfg.splicePrice || 3.0);
          const postsCost = totalPosts * postUnitCost;
          structMaterialsCostEur = postsCost + beamCost + splicesCost;
          fixingsType = 'Pilares tubulares de acero/aluminio (H=' + pergClearance.toFixed(2) + 'm) + Dinteles';
          fixingsCount = totalPosts;
          fixingsUnitCost = postUnitCost;
        } else if (isTriangular) {
          const is30Deg = (structCfg.tiltDeg || 0) >= 20 || (estType && estType.includes('30'));
          const ratio = is30Deg ? BOM_DEFAULTS.BALLAST_BLOCKS_PER_PANEL_30 : BOM_DEFAULTS.BALLAST_BLOCKS_PER_PANEL_15;
          ballastBlocks = panelCount * ratio;
          const blockWeight = (mfg && typeof mfg.ballastBlockWeightKg === 'number' && mfg.ballastBlockWeightKg > 0)
            ? mfg.ballastBlockWeightKg
            : (BOM_DEFAULTS.BALLAST_WEIGHT_KG || 45.0);
          ballastWeightKg = ballastBlocks * blockWeight;
          fixingsType = 'Bloques prefabricados de hormigón (Lastre)';
          fixingsCount = ballastBlocks;
          fixingsUnitCost = mfg.ballastBlockPrice || BOM_DEFAULTS.BALLAST_BLOCK_PRICE;
          const aFramesCost = panelCount * 2 * (mfg.trianglePrice || BOM_DEFAULTS.A_FRAME_TRIANGLE_PRICE);
          const ballastCost = ballastBlocks * (mfg.ballastBlockPrice || BOM_DEFAULTS.BALLAST_BLOCK_PRICE);
          const tieBarsCost = panelCount * (mfg.tieBarPrice || 8.0);
          structMaterialsCostEur = aFramesCost + ballastCost + tieBarsCost;
        } else {
          // Coplanar teja: 1 salvateja cada 1.15 m de perfil
          fixingsType = 'Salvatejas Inox A2 regulables';
          fixingsCount = Math.ceil(totalProfileMeters / 1.15);
          fixingsUnitCost = mfg.tileHookPrice || BOM_DEFAULTS.SALVATEJAS_PRICE_UNIT;
          const profileCost = totalProfileMeters * (mfg.railPricePerMeter || BOM_DEFAULTS.PERFIL_PRICE_PER_METER);
          const splicesCost = railSplicesCount * (mfg.splicePrice || BOM_DEFAULTS.SPLICE_PRICE_UNIT);
          const fixCost = fixingsCount * fixingsUnitCost;
          structMaterialsCostEur = profileCost + splicesCost + fixCost;
        }

        const structCostEur = parseFloat(structMaterialsCostEur.toFixed(2));
        const structWeightKg = parseFloat((panelCount * (structWeightMap[estType] || 4.0)).toFixed(1));

        // Clamps y tornillos de sujeción de módulos (del fabricante o catálogo)
        const midClampPrice = mfg.midClampPrice || 1.45;
        const endClampPrice = mfg.endClampPrice || 1.65;
        const fastenersCostEur = (midClamps * midClampPrice) + (endClamps * endClampPrice);

        // Carga por metro cuadrado estimada según CTE DB-SE-AE (reparto sobre faldón soporte)
        const roofAreaM2 = (typeof poly.area === 'number' && poly.area > 0)
          ? poly.area
          : (poly.roofInfo && typeof poly.roofInfo.area === 'number' && poly.roofInfo.area > 0)
            ? poly.roofInfo.area
            : (panelCount * 2.2);
        const totalRoofLoadKg = roofPanelsWeightKg + structWeightKg + ballastWeightKg;
        const loadKgM2 = roofAreaM2 > 0 ? (totalRoofLoadKg / roofAreaM2) : 0;

        const roofNode = {
          id: polyId,
          name: polyName,
          roofType: roofType,
          panelCount: panelCount,
          kwp: parseFloat(roofKwp.toFixed(2)),
          moduleDistribution: moduleCounts,
          optimizersCount: optimizersInRoof,
          structure: {
            manufacturer: mfg.brand,
            manufacturerId: mfg.id,
            type: estType,
            tiltDeg: structCfg.tiltDeg || (isTriangular ? 30.0 : 0.0),
            costEur: structCostEur,
            weightKg: structWeightKg,
            profileMeters: totalProfileMeters,
            standardBarsCount: standardBarsCount,
            railSplicesCount: railSplicesCount,
            fixingsType: fixingsType,
            fixingsCount: fixingsCount,
            fixingsUnitCost: fixingsUnitCost,
            rowsCount: estRows
          },
          clamps: {
            midCount: midClamps,
            endCount: endClamps,
            costEur: parseFloat(fastenersCostEur.toFixed(2))
          },
          ballast: {
            blocksCount: ballastBlocks,
            totalWeightKg: parseFloat(ballastWeightKg.toFixed(2))
          },
          structuralLoad: {
            totalKg: parseFloat(totalRoofLoadKg.toFixed(1)),
            kgPerM2: parseFloat(loadKgM2.toFixed(1)),
            maxAllowedKgM2: maxLoad,
            isOverloaded: loadKgM2 > maxLoad
          },
          subtotalEur: parseFloat((structCostEur + fastenersCostEur).toFixed(2))
        };

        tree.roofs.push(roofNode);

        tree.summary.totalPanels += panelCount;
        tree.summary.totalKwp += roofKwp;
        tree.summary.totalOptimizers += optimizersInRoof;
        tree.summary.subtotalEur += roofNode.subtotalEur;
        if (loadKgM2 > tree.summary.maxLoadKgM2) {
          tree.summary.maxLoadKgM2 = parseFloat(loadKgM2.toFixed(1));
        }
        if (roofNode.structuralLoad.isOverloaded) {
          tree.summary.loadWarning = true;
        }
      });

      // ── 1.5 OBSTÁCULOS Y ELEMENTOS DE ESCENA ───────────────────────────────
      if (typeof window !== 'undefined' && window.obstacles && Array.isArray(window.obstacles)) {
        window.obstacles.forEach(obs => {
          let tipo = 'Obstáculo';
          if (obs.type === 'tree') tipo = 'Árbol';
          else if (obs.type === 'building') tipo = 'Edificio Colindante';
          else if (obs.type === 'chimney') tipo = 'Chimenea';
          else if (obs.type === 'ac_unit') tipo = 'Máquina de Clima (HVAC)';
          else if (obs.type === 'electrical_box') tipo = 'Cuadro / Inversor';
          else if (obs.type === 'wind_turbine') tipo = 'Aerogenerador Eólico';
          
          const w = typeof obs.w === 'number' ? obs.w : (typeof obs.width === 'number' ? obs.width : 1.0);
          const h = typeof obs.h === 'number' ? obs.h : (typeof obs.height === 'number' ? obs.height : 1.0);
          const l = typeof obs.l === 'number' ? obs.l : (typeof obs.length === 'number' ? obs.length : 1.0);
          tree.obstacles.push({
            id: obs.id,
            type: tipo,
            name: obs.name || tipo,
            dimensions: `W:${w.toFixed(1)}m x L:${l.toFixed(1)}m x H:${h.toFixed(1)}m`,
          });
        });
      }

      // ── 1.6 GENERACIÓN MINIEÓLICA (RA-Wind SSOT) ───────────────────────────
      if (typeof window !== 'undefined' && Array.isArray(window.windTurbines)) {
        const groupedWindMap = new Map();
        window.windTurbines.forEach((wt, wtIdx) => {
          if (!wt) return;
          const isEnabled = !wt.operationalState || wt.operationalState.enabled !== false;
          const freshCat = (typeof window.RAWindCatalog !== 'undefined' && window.RAWindCatalog && typeof window.RAWindCatalog.getById === 'function' && wt.catalogId)
            ? window.RAWindCatalog.getById(wt.catalogId)
            : null;
          const cat = Object.assign({}, wt._catalog || {}, freshCat || {});
          const pKw = cat.ratedPowerW ? (cat.ratedPowerW / 1000) : (cat.ratedPowerKw || 5.0);
          const mastH = (wt.supportStructure && wt.supportStructure.hubHeightM) || 18;
          const brand = cat.manufacturer || cat.brand || 'Minieólica';
          const model = cat.model || wt.name || ('Aerogenerador #' + (wtIdx + 1));
          const unitPrice = (typeof cat.priceEur === 'number' && cat.priceEur > 0) ? cat.priceEur : Math.round(pKw * 1450);
          const supportCost = (wt.supportStructure && typeof wt.supportStructure.costEur === 'number' && wt.supportStructure.costEur > 0) ? wt.supportStructure.costEur : 0;
          const totalUnitCost = unitPrice + supportCost;

          tree.obstacles.push({
            id: wt.id,
            type: 'Aerogenerador Eólico',
            name: wt.name || (brand + ' ' + model),
            dimensions: `P:${pKw} kW | H_buje:${mastH}m | D:${cat.rotorDiameterM || 5}m`
          });

          if (!isEnabled) return;

          tree.wind.turbines.push({
            id: wt.id,
            catalogId: wt.catalogId || cat.id || ('wt_cat_' + wtIdx),
            brand: brand,
            model: model,
            type: cat.type || 'HAWT',
            kwNominal: pKw,
            hubHeightM: mastH,
            mountingType: wt.mountingType || 'ground',
            count: 1,
            unitPrice: unitPrice,
            supportCostEur: supportCost,
            totalPriceEur: parseFloat(totalUnitCost.toFixed(2))
          });

          const grpKey = `${brand}|${model}|${pKw}|${mastH}|${unitPrice}`;
          if (!groupedWindMap.has(grpKey)) {
            groupedWindMap.set(grpKey, {
              brand: brand,
              model: model,
              type: cat.type || 'HAWT',
              kwNominal: pKw,
              hubHeightM: mastH,
              count: 0,
              unitPrice: unitPrice,
              supportCostEur: 0,
              totalPriceEur: 0
            });
          }
          const grp = groupedWindMap.get(grpKey);
          grp.count += 1;
          grp.supportCostEur = parseFloat((grp.supportCostEur + supportCost).toFixed(2));
          grp.totalPriceEur = parseFloat((grp.totalPriceEur + totalUnitCost).toFixed(2));

          tree.wind.totalTurbines += 1;
          tree.wind.totalWindKw = parseFloat((tree.wind.totalWindKw + pKw).toFixed(2));
          tree.wind.turbinesOnlyEur = parseFloat((tree.wind.turbinesOnlyEur + unitPrice).toFixed(2));
          tree.wind.supportAndAuxEur = parseFloat((tree.wind.supportAndAuxEur + supportCost).toFixed(2));
          tree.wind.totalEur = parseFloat((tree.wind.totalEur + totalUnitCost).toFixed(2));
        });

        tree.wind.grouped = Array.from(groupedWindMap.values());
        // Incorporar desglose analítico de las 6 partidas eólicas
        if (typeof window !== 'undefined' && typeof window.computeWindTurbineCostBreakdown === 'function') {
          tree.wind.breakdown = window.computeWindTurbineCostBreakdown(window.windTurbines);
          if (tree.wind.breakdown && tree.wind.breakdown.totalEur > 0) {
            tree.wind.totalEur = parseFloat(tree.wind.breakdown.totalEur.toFixed(2));
          }
        }
        tree.summary.totalWindTurbines = tree.wind.totalTurbines;
        tree.summary.totalWindKw = tree.wind.totalWindKw;
        tree.summary.windTotalEur = tree.wind.totalEur;
        tree.summary.subtotalEur += tree.wind.totalEur;
      }

      // ── 2. MÓDULOS FOTOVOLTAICOS GLOBALES ──────────────────────────────────
      const globalModulesBreakdown = {};
      tree.roofs.forEach(r => {
        for (const [mId, count] of Object.entries(r.moduleDistribution)) {
          globalModulesBreakdown[mId] = (globalModulesBreakdown[mId] || 0) + count;
        }
      });

      tree.modules = Object.entries(globalModulesBreakdown).map(([mId, count]) => {
        const spec = moduleMap.get(mId) || defaultMod;
        const totalCost = count * (spec.price || 125);
        tree.summary.subtotalEur += totalCost;
        return {
          id: mId,
          brand: spec.brand || 'Tier 1',
          model: spec.model || 'Panel Solar',
          wp: spec.wp || 450,
          count: count,
          unitPrice: spec.price || 125,
          totalPriceEur: parseFloat(totalCost.toFixed(2))
        };
      });

      // ── 3. OPTIMIZADORES MLPE (SI HAY) ────────────────────────────────────
      if (tree.summary.totalOptimizers > 0) {
        const optSpec = (catalog.microinverters && catalog.microinverters.find(mi => mi.type && mi.type.includes('Optimizador'))) || {
          model: 'Optimizador DC Tigo TS4 / Huawei',
          price: 60.0
        };
        const optCost = tree.summary.totalOptimizers * optSpec.price;
        tree.summary.subtotalEur += optCost;
        tree.electrical.optimizers = {
          count: tree.summary.totalOptimizers,
          model: optSpec.model,
          unitPrice: optSpec.price,
          totalCostEur: parseFloat(optCost.toFixed(2))
        };
      }

      // ── 4. INVERSORES, CUADROS, CABLES, TIERRAS Y M.O. (PASO 4 EN ADELANTE) ──
      const currentStep = (typeof window !== 'undefined' && typeof window.wpCurrentStep !== 'undefined') ? window.wpCurrentStep : (typeof wpCurrentStep !== 'undefined' ? wpCurrentStep : 4);
      const hasElectricalObjects = typeof window !== 'undefined' && window.inverterEquipmentState != null;
      const isEngineeringStep = (currentStep >= 4 || hasElectricalObjects);
      if (tree.summary.totalPanels > 0) {
        // ── 4. INVERSORES DE POTENCIA O MICROINVERSORES (SEGÚN TOPOLOGÍA) ─────
        const isMicroTopology = (projectConfig.selectedTopology === 'microinverter');
        if (isMicroTopology) {
          const miId = projectConfig.selectedMicroinverterId || (catalog.microinverters && catalog.microinverters[0] ? catalog.microinverters[0].id : null);
          const miSpec = (catalog.microinverters && catalog.microinverters.find(m => m.id === miId && !(m.type && m.type.includes('Optimizador'))))
            || (catalog.microinverters && catalog.microinverters.find(m => !(m.type && m.type.includes('Optimizador'))))
            || { id: 'mi_default', brand: 'Enphase / Hoymiles', model: 'Microinversor Dual', kw: 0.8, price: 175 };
          const miRatio = ((miSpec.model || '') + (miSpec.type || '')).includes('4') ? 4 : 2;
          const miCount = (projectConfig.autoSizing && projectConfig.autoSizing.microinverters && projectConfig.autoSizing.microinverters.count)
            || Math.max(1, Math.ceil(tree.summary.totalPanels / miRatio));
          const totalMiCost = miCount * (miSpec.price || 175);
          tree.summary.totalMicroinverters = miCount;
          tree.summary.totalInverters = 0;
          tree.summary.totalAcKw = parseFloat((miCount * (miSpec.kw || (miSpec.va ? miSpec.va / 1000 : 0.8))).toFixed(2));
          tree.summary.subtotalEur += totalMiCost;
          tree.electrical.microinverters.push({
            id: miSpec.id,
            brand: miSpec.brand || 'Tier-1',
            model: miSpec.model || 'Microinversor',
            kwNominal: miSpec.kw || (miSpec.va ? miSpec.va / 1000 : 0.8),
            count: miCount,
            unitPrice: miSpec.price || 175,
            totalPriceEur: parseFloat(totalMiCost.toFixed(2))
          });
        } else {
          const invSizing = projectConfig.autoSizing && projectConfig.autoSizing.inverters ? projectConfig.autoSizing.inverters : null;
          if (invSizing && !invSizing.isManual && typeof invSizing.autoCount === 'number' && invSizing.autoCount > 1 && invSizing.count < invSizing.autoCount) {
            invSizing.count = invSizing.autoCount;
          }
          const invId = projectConfig.selectedInverterId || (catalog.inverters && catalog.inverters[0] ? catalog.inverters[0].id : null);
          const invSpec = (catalog.inverters && catalog.inverters.find(i => i.id === invId))
            || ((projectConfig.lastVirtualInverter && projectConfig.lastVirtualInverter.id === invId) ? projectConfig.lastVirtualInverter : null)
            || (catalog.inverters ? catalog.inverters[0] : { kw: 10, price: 1750, brand: 'Inversor' });

          let invCount = (invSizing && invSizing.count) || 1;
          if (invSpec && (!invSizing || !invSizing.isManual)) {
            const maxDcPerInv = (invSpec.kw || 10.0) * (invSpec.maxOverload || 1.35);
            const minInvByPower = Math.max(1, Math.ceil(tree.summary.totalKwp / maxDcPerInv));
            if (invCount < minInvByPower) {
              invCount = minInvByPower;
              if (invSizing) {
                invSizing.count = invCount;
                invSizing.autoCount = Math.max(invSizing.autoCount || 1, invCount);
              }
            }
          }

          if (invSpec) {
            const totalInvCost = invCount * (invSpec.price || 1500);
            tree.summary.totalInverters = invCount;
            tree.summary.totalAcKw = invCount * (invSpec.kw || 10.0);
            tree.summary.subtotalEur += totalInvCost;
            tree.electrical.inverters.push({
              id: invSpec.id,
              brand: invSpec.brand,
              model: invSpec.model,
              kwNominal: invSpec.kw,
              count: invCount,
              unitPrice: invSpec.price,
              totalPriceEur: parseFloat(totalInvCost.toFixed(2))
            });
          }
        }

        // ── 4.1 BATERÍAS DE ALMACENAMIENTO ──────────────────────────────────────
        const batCount = (projectConfig.autoSizing && projectConfig.autoSizing.batteries && projectConfig.autoSizing.batteries.count) || 0;
        const batId = projectConfig.selectedBatteryId;
        if (batId && batId !== 'bat_none' && catalog.batteries) {
          const batSpec = catalog.batteries.find(b => b.id === batId);
          if (batSpec && (batSpec.kwh > 0 || batSpec.price > 0)) {
            const finalBatCount = Math.max(1, batCount);
            const totalBatCost = finalBatCount * (batSpec.price || 3500);
            tree.summary.subtotalEur += totalBatCost;
            tree.electrical.batteries.push({
              id: batSpec.id,
              brand: batSpec.brand,
              model: batSpec.model,
              kwhCapacity: batSpec.kwh,
              count: finalBatCount,
              unitPrice: batSpec.price,
              totalPriceEur: parseFloat(totalBatCost.toFixed(2))
            });
          }
        }

        if (tree.electrical.batteries && tree.electrical.batteries.length > 0) {
          let sKwh = 0;
          tree.electrical.batteries.forEach(b => { sKwh += (b.kwhCapacity || 0) * (b.count || 1); });
          tree.summary.totalStorageKwh = Math.round(sKwh * 10) / 10;
        }

        // ── 5. CUADROS DE PROTECCIÓN DC Y AC ────────────────────────────────────
        const dcPanelId = projectConfig.selectedProtectionDcId || 'panel_dc_2mppt';
        const acPanelId = projectConfig.selectedProtectionAcId || 'panel_ac_tri_25a';
        const dcPanelSpec = (catalog.electricalPanels && catalog.electricalPanels.find(p => p.id === dcPanelId)) || { model: 'Cuadro DC SPD II', price: 245 };
        const acPanelSpec = (catalog.electricalPanels && catalog.electricalPanels.find(p => p.id === acPanelId)) || { model: 'Cuadro General AC CGBT', price: 295 };

        const dcPanelCost = dcPanelSpec.price || 245;
        const acPanelCost = acPanelSpec.price || 295;
        tree.summary.subtotalEur += (dcPanelCost + acPanelCost);
        tree.electrical.panelsProtTotalEur = parseFloat((dcPanelCost + acPanelCost).toFixed(2));

        tree.electrical.dcPanels.push({ model: dcPanelSpec.model, count: 1, price: dcPanelCost });
        tree.electrical.acPanels.push({ model: acPanelSpec.model, count: 1, price: acPanelCost });

        // ── 6. CABLEADO SOLAR DC & EVACUACIÓN AC ────────────────────────────────
        const sState = (typeof window !== 'undefined' && window.inverterEquipmentState) ? window.inverterEquipmentState : null;
        const estDcLengthM = (sState && typeof sState.L_dc_measured === 'number' && sState.L_dc_measured > 0)
          ? sState.L_dc_measured
          : Math.max(25, Math.round(tree.summary.totalPanels * 3.5));
        const estAcLengthM = (sState && typeof sState.L_ac_measured === 'number' && sState.L_ac_measured > 0)
          ? sState.L_ac_measured
          : 20.0;
        const dcCableItem = (catalog.cables && catalog.cables.find(c => c.id === (projectConfig.selectedCableDcId || 'cable_dc_zzf_6'))) || { pricePerMeter: 1.85, sec: 6 };
        const acCableItem = (catalog.cables && catalog.cables.find(c => c.id === (projectConfig.selectedCableAcId || 'cable_ac_rvk_5g10'))) || { pricePerMeter: 6.20, sec: 10 };

        // El cable solar DC ZZ-F es unipolar (2 conductores DC+ y DC- por string)
        const allStrList = (typeof RACableEngine !== 'undefined' && typeof RACableEngine.gatherAllStrings === 'function')
          ? RACableEngine.gatherAllStrings()
          : null;
        const numStrings = (allStrList && allStrList.length > 0)
          ? allStrList.length
          : Math.max(1, Math.ceil(tree.summary.totalPanels / 12));
        
        let totalDcMeters = 0;
        if (sState && sState.cableBreakdown && typeof sState.cableBreakdown.totalDcCableMeters === 'number' && sState.cableBreakdown.totalDcCableMeters > 0) {
          totalDcMeters = Math.round(sState.cableBreakdown.totalDcCableMeters);
        } else if (sState && Array.isArray(sState.stringTelemetry) && sState.stringTelemetry.length > 0) {
          totalDcMeters = Math.round(sState.stringTelemetry.reduce((acc, st) => acc + ((st.posHomerunLength || st.homerunLength || estDcLengthM) + (st.negHomerunLength || st.homerunLength || estDcLengthM) + (st.returnConductorLength || 0)), 0));
        } else {
          totalDcMeters = Math.round(estDcLengthM * 2 * numStrings);
        }

        const dcCableCost = totalDcMeters * dcCableItem.pricePerMeter;
        const acCableCost = estAcLengthM * acCableItem.pricePerMeter;
        tree.summary.subtotalEur += (dcCableCost + acCableCost);

        tree.electrical.cables.push(
          { type: 'DC ZZ-F 1500V', secMm2: (sState && sState.S_dc_recommended) ? sState.S_dc_recommended : (dcCableItem.sec || 6), meters: totalDcMeters, unitPrice: dcCableItem.pricePerMeter, totalEur: parseFloat(dcCableCost.toFixed(2)) },
          { type: 'AC RV-K 0.6/1kV', secMm2: (sState && sState.S_ac_recommended) ? sState.S_ac_recommended : (acCableItem.sec || 10), meters: estAcLengthM, unitPrice: acCableItem.pricePerMeter, totalEur: parseFloat(acCableCost.toFixed(2)) }
        );

        // ── 6.5 LATIGUILLOS ALARGADORES MC4 PARA SALTO DE RANA (UNE-EN 62305) ──
        const stringWiringTopology = (projectConfig && projectConfig.stringWiringTopology) || 'leapfrog';
        if (stringWiringTopology === 'leapfrog') {
          const allStrings = (typeof RACableEngine !== 'undefined' && typeof RACableEngine.gatherAllStrings === 'function')
            ? RACableEngine.gatherAllStrings()
            : null;
          const numStrings = (allStrings && allStrings.length > 0) ? allStrings.length : Math.max(1, Math.ceil(tree.summary.totalPanels / 14));
          const jumpersCount = Math.max(0, tree.summary.totalPanels - (2 * numStrings));
          if (jumpersCount > 0) {
            const jumperUnitPrice = 5.20; // 5.20 € por latiguillo MC4 1.5m 6mm² preensamblado
            const totalJumpersCost = parseFloat((jumpersCount * jumperUnitPrice).toFixed(2));
            tree.summary.subtotalEur += totalJumpersCost;
            tree.electrical.mc4Jumpers = {
              count: jumpersCount,
              type: 'Latiguillos Alargadores MC4 1.5m (Salto de Rana)',
              unitPrice: jumperUnitPrice,
              totalEur: totalJumpersCost
            };
          }
        }

        // ── 7. PUESTA A TIERRA & AUXILIARES ────────────────────────────────────
        const earthRods = Math.max(1, Math.ceil(tree.summary.totalKwp / 25.0));
        const earthWireM = Math.round(tree.summary.totalPanels * BOM_DEFAULTS.EARTH_WIRE_PER_PANEL_M);
        const earthCost = (earthRods * 35.0) + (earthWireM * 2.10);
        tree.summary.subtotalEur += earthCost;

        tree.electrical.grounding.push({
          earthRods: earthRods,
          earthWireM: earthWireM,
          totalEur: parseFloat(earthCost.toFixed(2))
        });

        // ── 7.5 SEÑALIZACIÓN Y ADVERTENCIA REGLAMENTARIA (UNE-EN IEC 62446-1 / ITC-BT-40) ──
        const safetySignageCost = 38.50;
        tree.summary.subtotalEur += safetySignageCost;
        tree.electrical.safetySignage = {
          description: 'Kit de señalización y advertencia de riesgo eléctrico (UNE-EN IEC 62446-1 / REBT)',
          totalEur: safetySignageCost
        };

        // ── 8. MANO DE OBRA, INGENIERÍA, PERMISOS Y MEDIOS AUXILIARES ──────────
        const instCosts = (root.RAStructureCatalog && typeof root.RAStructureCatalog.getInstallationCosts === 'function')
          ? root.RAStructureCatalog.getInstallationCosts()
          : null;

        const laborCfg = (instCosts && instCosts.labor) || {
          mechanicalHoursPerPanel: 0.85,
          electricalHoursPerPanel: 0.55,
          commissioningHoursFixed: 4.0,
          hourlyRate: 32.00
        };
        const engCfg = (instCosts && instCosts.engineering) || {
          technicalProject: 450.00,
          siteSupervision: 250.00,
          adminCIE: 180.00
        };
        const permitsCfg = (instCosts && instCosts.permits) || {
          urbanPermitRatePct: 3.5,
          urbanPermitFixed: 85.00,
          wasteDeposit: 120.00
        };
        const auxCfg = (instCosts && instCosts.auxiliary) || {
          lifelineSafety: 280.00,
          scaffoldingLift: 350.00
        };
        const smallMatCfg = (instCosts && instCosts.smallMaterials) || {
          perPanelSmallMaterials: 6.50
        };

        const totalP = tree.summary.totalPanels;
        const totalKwp = tree.summary.totalKwp;

        // Horas desglosadas
        const mechH = parseFloat((totalP * (laborCfg.mechanicalHoursPerPanel || 0.85)).toFixed(1));
        const elecH = parseFloat((totalP * (laborCfg.electricalHoursPerPanel || 0.55)).toFixed(1));
        const commH = laborCfg.commissioningHoursFixed || 4.0;
        const rate = laborCfg.hourlyRate || 32.00;

        const costMech = parseFloat((mechH * rate).toFixed(2));
        const costElec = parseFloat((elecH * rate).toFixed(2));
        const costComm = parseFloat((commH * rate).toFixed(2));

        // Ingeniería
        const costProj = totalKwp > 10 ? Math.max(engCfg.technicalProject, 950.0) : engCfg.technicalProject;
        const costSup = engCfg.siteSupervision;
        const costCie = engCfg.adminCIE;

        // Permisos y tasas
        const costUrban = permitsCfg.urbanPermitFixed;
        const costWaste = permitsCfg.wasteDeposit;
        const costIcio = parseFloat((tree.summary.subtotalEur * ((permitsCfg.urbanPermitRatePct || 3.5) / 100)).toFixed(2));

        // Medios auxiliares y seguridad
        const costLifeline = auxCfg.lifelineSafety;
        const costScaffold = (totalP > 25) ? auxCfg.scaffoldingLift : Math.round(auxCfg.scaffoldingLift * 0.6);

        // Pequeño material
        const costSmallMat = parseFloat((totalP * (smallMatCfg.perPanelSmallMaterials || 6.50)).toFixed(2));
        const jumpersCostVal = (tree.electrical.mc4Jumpers && tree.electrical.mc4Jumpers.totalEur) ? tree.electrical.mc4Jumpers.totalEur : 0;
        tree.electrical.cablesTotalEur = parseFloat((dcCableCost + acCableCost + jumpersCostVal + earthCost + safetySignageCost + costSmallMat).toFixed(2));

        const subtotalInstallation = costMech + costElec + costComm + costProj + costSup + costCie + costUrban + costWaste + costLifeline + costScaffold + costSmallMat;

        tree.summary.subtotalEur += subtotalInstallation;
        tree.summary.pecDirectCostEur = parseFloat(tree.summary.subtotalEur.toFixed(2));
        tree.summary.municipalTaxesEur = parseFloat(costIcio.toFixed(2));

        tree.laborAndSoftCosts.push(
          { category: 'labor', description: `Montaje mecánico de estructuras y paneles (${mechH} h @ ${rate} €/h)`, totalEur: costMech },
          { category: 'labor', description: `Conexionado eléctrico DC/AC y cableado (${elecH} h @ ${rate} €/h)`, totalEur: costElec },
          { category: 'labor', description: `Puesta en marcha, ensayos y verificación REBT (${commH} h fijas @ ${rate} €/h)`, totalEur: costComm },
          { category: 'engineering', description: (totalKwp > 10 ? 'Proyecto Técnico Visado de Ingeniero Colegiado' : 'Memoria Técnica de Diseño (MTD)'), totalEur: costProj },
          { category: 'engineering', description: 'Dirección Facultativa y Coordinación de Seguridad', totalEur: costSup },
          { category: 'engineering', description: 'Legalización Administrativa y Tramitación Boletín CIE', totalEur: costCie },
          { category: 'permits', description: 'Tasa Municipal de Comunicación Previa / Urbanística', totalEur: costUrban },
          { category: 'permits', description: `Impuesto ICIO (${permitsCfg.urbanPermitRatePct}% sobre ejecución material)`, totalEur: costIcio },
          { category: 'permits', description: 'Fianza de Gestión de Residuos de Construcción (RCD)', totalEur: costWaste },
          { category: 'auxiliary', description: 'Línea de vida provisional, anclajes y EPIs homologados', totalEur: costLifeline },
          { category: 'auxiliary', description: 'Medios auxiliares (Plataforma elevadora / Andamio)', totalEur: costScaffold },
          { category: 'small_materials', description: `Pequeño material eléctrico, canalizaciones y tierra (${totalP} mód. @ ${smallMatCfg.perPanelSmallMaterials || 6.50} €/mód.)`, totalEur: costSmallMat }
        );
      } else {
        tree.summary.totalAcKw = 0;
        tree.summary.totalInverters = 0;
      }

      // Redondeo final de totales
      tree.summary.totalKwp = parseFloat(tree.summary.totalKwp.toFixed(2));
      tree.summary.subtotalEur = parseFloat(tree.summary.subtotalEur.toFixed(2));

      return tree;
    },

    /**
     * Renderiza el panel flotante HUD del Árbol BIM en el DOM
     */
    renderHUD: function() {
      if (typeof document === 'undefined') return;
      let hudEl = document.getElementById('ra-bom-tree-hud');
      
      let existingChartWrap = null;
      if (hudEl) {
        const wrapEl = hudEl.querySelector('.solar-chart-wrap');
        if (wrapEl) {
          existingChartWrap = wrapEl; // Guardar referencia al nodo existente
        }
      }

      if (!hudEl) {
        hudEl = document.createElement('div');
        hudEl.id = 'ra-bom-tree-hud';
        hudEl.className = 'ra-bom-hud-container';
        hudEl.style.display = 'none';
        document.body.appendChild(hudEl);
      }

      const tree = this.computeBOMTree();

      let roofsHtml = tree.roofs.map((r, i) => `
        <div class="bom-node-roof">
          <div class="bom-node-title" onclick="BOMTreeEngine.toggleNode('bom-roof-${i}')">
            <span>🏠 <b>${r.name}</b> (${r.panelCount} mód. · ${r.kwp} kWp)</span>
            <span class="bom-price-badge">${r.subtotalEur} €</span>
          </div>
          <div id="bom-roof-${i}" class="bom-node-children" style="display:none; padding-left:14px;">
            <div class="bom-subitem">📐 <b>Estructura:</b> ${r.structure.manufacturer ? r.structure.manufacturer + ' · ' : ''}${r.structure.type ? r.structure.type.toUpperCase() : 'ESTÁNDAR'} (${r.structure.tiltDeg}°) · <b>${r.structure.costEur} €</b></div>
            ${r.structure.profileMeters ? `<div class="bom-subitem" style="font-size: 10px;color:#94a3b8;padding-left:12px;">• Perfil aluminio: <b>${r.structure.profileMeters} m</b> (${r.structure.standardBarsCount} barras 3.15m + ${r.structure.railSplicesCount} empalmes)</div>` : ''}
            ${r.structure.fixingsCount ? `<div class="bom-subitem" style="font-size: 10px;color:#94a3b8;padding-left:12px;">• Fijaciones: <b>${r.structure.fixingsCount}x</b> ${r.structure.fixingsType}</div>` : ''}
            <div class="bom-subitem">🔩 <b>Grapas (Clamps):</b> ${r.clamps.midCount} intermedias + ${r.clamps.endCount} finales · <b>${r.clamps.costEur} €</b></div>
            ${r.ballast.blocksCount > 0 ? `<div class="bom-subitem">🧱 <b>Lastres hormigón:</b> ${r.ballast.blocksCount} bloques (${r.ballast.totalWeightKg} kg)</div>` : ''}
          </div>
        </div>
      `).join('');

      let invertersHtml = tree.electrical.inverters.length > 0 
        ? tree.electrical.inverters.map(inv => `
            <div class="bom-subitem bom-interactive-item" onclick="BOMTreeEngine.flyToElectrical('inverter')" style="cursor:pointer;" title="Clic para enfocar y seleccionar inversor en 3D">🔄 ${inv.count}x ${inv.brand} ${inv.model} (${inv.kwNominal} kW${inv.count > 1 ? ' c/u · ' + (inv.kwNominal * inv.count).toFixed(1) + ' kW total' : ''}) · <b>${inv.totalPriceEur.toLocaleString('es-ES')} €</b></div>
          `).join('')
        : (tree.electrical.microinverters && tree.electrical.microinverters.length > 0
            ? tree.electrical.microinverters.map(mi => `
                <div class="bom-subitem">⚡ ${mi.count}x ${mi.brand} ${mi.model} (${mi.kwNominal} kW) · <b>${mi.totalPriceEur.toLocaleString('es-ES')} €</b></div>
              `).join('')
            : '<div class="bom-subitem" style="color:var(--text-muted, #94a3b8); font-style:italic;">Sin inversores asignados</div>');

      let batteriesHtml = (tree.electrical.batteries && tree.electrical.batteries.length > 0)
        ? tree.electrical.batteries.map(bat => `
            <div class="bom-subitem bom-interactive-item" onclick="BOMTreeEngine.flyToElectrical('battery')" style="cursor:pointer;" title="Clic para enfocar y seleccionar Batería en 3D">🔋 ${bat.count}x ${bat.brand} ${bat.model} (${(bat.kwhCapacity * bat.count).toFixed(1)} kWh) · <b>${bat.totalPriceEur.toLocaleString('es-ES')} €</b></div>
          `).join('')
        : '';
        
      let windHtml = (tree.wind && Array.isArray(tree.wind.grouped) && tree.wind.grouped.length > 0)
        ? tree.wind.grouped.map(w => `
            <div class="bom-subitem">💨 ${w.count}x ${w.brand} ${w.model} (${w.kwNominal} kW · H=${w.hubHeightM}m · ${w.unitPrice.toLocaleString('es-ES')} €/ud) · <b>${w.totalPriceEur.toLocaleString('es-ES')} €</b></div>
          `).join('')
        : '';

      let obstaclesHtml = (tree.obstacles && tree.obstacles.length > 0)
        ? tree.obstacles.map(obs => `
            <div class="bom-subitem bom-interactive-item" onclick="BOMTreeEngine.flyToObstacle('${obs.id}')" style="cursor:pointer; display:flex; justify-content:space-between; align-items:center;" title="Clic para enfocar cámara">
              <span>🛑 ${obs.name} (${obs.type})</span>
              <span style="font-size: 10px; color:#94a3b8;">${obs.dimensions}</span>
            </div>
          `).join('')
        : '<div class="bom-subitem" style="color:var(--text-muted, #94a3b8); font-style:italic;">No hay obstáculos en la escena</div>';

      const isEmptyProject = (tree.summary.totalPanels === 0 && tree.summary.totalWindTurbines === 0);

      hudEl.innerHTML = `
        <div class="bom-hud-header">
          <div class="bom-hud-title">
            <span class="bom-hud-icon" style="display:inline-flex;align-items:center;justify-content:center;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34D399" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                <line x1="12" y1="22.08" x2="12" y2="12"></line>
              </svg>
            </span>
            <span>ÁRBOL DE PROYECTO & MEDICIONES BIM</span>
          </div>
          <div class="bom-hud-controls">
            <button class="bom-mini-btn" onclick="BOMTreeEngine.refresh()" title="Actualizar cómputo de mediciones">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
              </svg>
            </button>
            <button class="bom-mini-btn" onclick="BOMTreeEngine.minimize()" title="Minimizar / Expandir panel">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </button>
            <button class="bom-mini-btn" onclick="BOMTreeEngine.close()" title="Cerrar panel">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="bom-hud-body">
          <div class="bom-kpi-row">
            <div class="bom-kpi"><span>POTENCIA:</span> <b>${tree.summary.totalKwp} kWp</b></div>
            <div class="bom-kpi"><span>AC NOMINAL:</span> <b>${tree.summary.totalAcKw} kW</b></div>
            <div class="bom-kpi"><span>MÓDULOS:</span> <b>${tree.summary.totalPanels} u.</b></div>
            ${tree.summary.totalStorageKwh > 0 ? `<div class="bom-kpi" style="border-color:rgba(52,211,153,0.3);background:rgba(52,211,153,0.1);"><span style="color:#34D399;">BATERÍA:</span> <b style="color:#34D399;">${tree.summary.totalStorageKwh} kWh</b></div>` : ''}
            ${tree.summary.totalWindTurbines > 0 ? `<div class="bom-kpi" style="border-color:rgba(56,189,248,0.3);background:rgba(56,189,248,0.1);"><span style="color:#38BDF8;">EÓLICA:</span> <b style="color:#38BDF8;">${tree.summary.totalWindTurbines}x (${tree.summary.totalWindKw} kW)</b></div>` : ''}
          </div>
          
          
          
          ${!isEmptyProject ? `
          <div class="bom-section-title" style="margin-top: 12px;">PRODUCCIÓN &amp; BALANCE ENERGÉTICO ANUAL</div>
          <div style="background:rgba(0,0,0,0.35);border:1px solid rgba(16,185,129,0.25);border-radius:6px;padding:10px;margin-bottom:12px;margin-top:6px;">
            <div class="chart-head-bar" style="display:flex;justify-content:space-between;align-items:flex-start;font-size:11px;margin-bottom:8px;min-height:28px;">
              <span style="color:var(--emerald-400);font-weight:bold;width:45%;line-height:1.2;display:block;">BALANCE ENERGÉTICO<br>(GENERACIÓN VS CONSUMO)</span>
              <span id="bom-chart-hover-info" style="color:var(--text-slate-400);text-align:right;width:55%;line-height:1.2;display:flex;flex-direction:column;">PASA EL RATÓN<br>POR LAS BARRAS</span>
            </div>
            <div id="bom-chart-placeholder">
              <!-- Placeholder for chart -->
            </div>
          </div>
          ` : ''}

          ${isEmptyProject ? `
            <div style="padding: 24px 16px; text-align: center; color: var(--text-muted, #94a3b8);">
              <div style="margin-bottom: 8px; display: flex; justify-content: center;">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M2 22 22 2M16 2l6 6M10 8l6 6M4 14l6 6"/>
                </svg>
              </div>
              <div style="font-size: 12px; font-weight: 600; color: var(--text-primary, #f1f5f9);">PROYECTO VACÍO</div>
              <div style="font-size: 11px; margin-top: 4px; line-height: 1.4;">
                Traza un faldón en el <b>Paso 1</b> y genera la malla de paneles en el <b>Paso 2</b> para computar automáticamente el metrado BIM y presupuesto en tiempo real.
              </div>
            </div>
          ` : `
            <div class="bom-section-title">SUPERFICIES & ESTRUCTURAS</div>
            ${roofsHtml || '<div class="bom-empty">Sin faldones trazados</div>'}
            
            <div class="bom-section-title">OBSTÁCULOS & ESCENA 3D</div>
            ${obstaclesHtml}

            <div class="bom-section-title">ELECTRÓNICA & POTENCIA</div>
            ${invertersHtml}
            ${batteriesHtml}
            ${windHtml}
            ${tree.electrical.optimizers ? `<div class="bom-subitem">⚡ ${tree.electrical.optimizers.count}x ${tree.electrical.optimizers.model} · <b>${tree.electrical.optimizers.totalCostEur} €</b></div>` : ''}

            <div class="bom-section-title">CABLEADO, CUADROS & TIERRAS</div>
            ${tree.electrical.dcPanels && tree.electrical.dcPanels.length > 0 ? tree.electrical.dcPanels.map(p => `<div class="bom-subitem bom-interactive-item" onclick="BOMTreeEngine.flyToElectrical('dc_protection')" style="cursor:pointer;" title="Clic para enfocar y seleccionar Cuadro DC en 3D">🔌 ${p.count}x ${p.model} — <b>${p.price} €</b></div>`).join('') : ''}
            ${tree.electrical.acPanels && tree.electrical.acPanels.length > 0 ? tree.electrical.acPanels.map(p => `<div class="bom-subitem bom-interactive-item" onclick="BOMTreeEngine.flyToElectrical('meter')" style="cursor:pointer;" title="Clic para enfocar y seleccionar Cuadro AC / Contador en 3D">🔌 ${p.count}x ${p.model} — <b>${p.price} €</b></div>`).join('') : ''}
            <div class="bom-subitem">📏 Cable DC: ${tree.electrical.cables[0] ? tree.electrical.cables[0].meters + 'm (' + tree.electrical.cables[0].secMm2 + 'mm²)' : '0m'}</div>
            <div class="bom-subitem">🔌 Evacuación AC: ${tree.electrical.cables[1] ? tree.electrical.cables[1].meters + 'm (' + tree.electrical.cables[1].secMm2 + 'mm²)' : '0m'}</div>
            ${tree.electrical.mc4Jumpers ? `<div class="bom-subitem">🔗 Latiguillos MC4 (Salto de Rana): <b>${tree.electrical.mc4Jumpers.count}x</b> 1.5m · <b>${tree.electrical.mc4Jumpers.totalEur.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</b></div>` : ''}
            ${tree.electrical.grounding && tree.electrical.grounding.length > 0 ? `<div class="bom-subitem">⏚ Puesta a Tierra: ${tree.electrical.grounding[0].earthRods} pica(s) + ${tree.electrical.grounding[0].earthWireM}m conductor Cu 35mm² · <b>${tree.electrical.grounding[0].totalEur.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</b></div>` : ''}
            ${tree.electrical.safetySignage ? `<div class="bom-subitem">⚠️ ${tree.electrical.safetySignage.description} · <b>${tree.electrical.safetySignage.totalEur.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</b></div>` : ''}

            <div class="bom-section-title">INSTALACIÓN, INGENIERÍA & MEDIOS</div>
            ${tree.laborAndSoftCosts && tree.laborAndSoftCosts.length > 0 ? tree.laborAndSoftCosts.map(item => `
              <div class="bom-subitem" style="display:flex;justify-content:space-between;align-items:center;padding:2px 0;">
                <span style="font-size: 10px;color:#CBD5E1;">${item.description}</span>
                <b style="font-size: 10px;color:#F8FAFC;margin-left:6px;">${item.totalEur.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</b>
              </div>
            `).join('') : ''}
          `}
          <div class="bom-total-footer" style="flex-direction:column;align-items:stretch;gap:3px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span>COSTE DIRECTO PEC (BOM + M.O.):</span>
              <span class="bom-total-price">${tree.summary.subtotalEur.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</span>
            </div>
            ${tree.summary.municipalTaxesEur > 0 ? `<div style="display:flex;justify-content:space-between;align-items:center;font-size:9.5px;color:#94a3b8;font-weight:500;"><span>Tasas Municipales / ICIO est. (informativo):</span><span>${tree.summary.municipalTaxesEur.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</span></div>` : ''}
          </div>
        </div>
      `;
      
      // Re-inyectar el SVG existente para no perder el estado y las transiciones
      if (existingChartWrap) {
        const placeholder = hudEl.querySelector('#bom-chart-placeholder');
        if (placeholder) {
          placeholder.appendChild(existingChartWrap);
        }
      } else if (!isEmptyProject) {
        // Si no existía, creamos la estructura base para que renderSolarBarChart lo llene
        const placeholder = hudEl.querySelector('#bom-chart-placeholder');
        if (placeholder) {
          const wrap = document.createElement('div');
          wrap.className = 'solar-chart-wrap';
          wrap.style.cssText = 'background:rgba(15,23,42,0.6);border-radius:4px;padding:6px;border:1px solid rgba(255,255,255,0.05);';
          
          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          svg.setAttribute('class', 'solar-bar-chart');
          svg.setAttribute('id', 'bom-solar-svg-chart');
          svg.setAttribute('viewBox', '0 0 400 120');
          svg.style.cssText = 'width:100%;height:120px;display:block;';
          
          wrap.appendChild(svg);
          placeholder.appendChild(wrap);
        }
      }

      if (typeof window.renderSolarBarChart === 'function') {
        setTimeout(() => window.renderSolarBarChart(window.lastMonthlyYields), 50);
      }

      if (hudEl && typeof window.makeElementDraggable === 'function') {
        const hdr = hudEl.querySelector('.bom-hud-header');
        if (hdr) window.makeElementDraggable(hudEl, hdr, 'ra_bom_pos');
      }
    },


    toggleNode: function(nodeId) {
      if (typeof document === 'undefined') return;
      const el = document.getElementById(nodeId);
      if (el) el.style.display = (el.style.display === 'none') ? 'block' : 'none';
    },

    open: function() {
      if (typeof document === 'undefined') return;
      this.renderHUD();
      const hudEl = document.getElementById('ra-bom-tree-hud');
      if (hudEl) {
        hudEl.style.display = 'flex';
        if (typeof window.bringToFront === 'function') window.bringToFront(hudEl);
        hudEl.classList.remove('minimized');
        hudEl.classList.add('mobile-active');
        if (typeof window !== 'undefined' && window.innerWidth <= 768) {
          const sb = document.getElementById('ra-sidebar');
          if (sb && !sb.classList.contains('collapsed') && typeof window.toggleSidebarCollapse === 'function') {
            window.toggleSidebarCollapse();
          }
          if (typeof window.UIOutliner !== 'undefined' && typeof window.UIOutliner.close === 'function') {
            window.UIOutliner.close();
          }
          if (typeof window.toggleSolarHUD === 'function') {
            window.toggleSolarHUD(false);
          }
        }
      }
    },

    close: function() {
      if (typeof document === 'undefined') return;
      const hudEl = document.getElementById('ra-bom-tree-hud');
      if (hudEl) {
        hudEl.style.display = 'none';
        hudEl.classList.remove('mobile-active');
      }
    },

    flyToObstacle: function(obsId) {
      if (typeof window !== 'undefined' && window.obstacles && window.viewer) {
        const obs = window.obstacles.find(o => o.id === obsId);
        if (obs && obs.entity) {
          window.viewer.flyTo(obs.entity, { duration: 1.5, offset: new window.Cesium.HeadingPitchRange(0, -window.Cesium.Math.PI_OVER_FOUR, 15) });
          // Seleccionar obstáculo si existe la función global
          if (typeof window.selectObstacle === 'function') {
            window.selectObstacle(obsId);
          }
        }
      }
    },

    flyToElectrical: function(elecId) {
      if (typeof window !== 'undefined' && typeof window.selectElectricalObject === 'function') {
        window.selectElectricalObject(elecId);
      }
      const s = (typeof window !== 'undefined') ? window.inverterEquipmentState : null;
      if (s && window.viewer) {
        let pos = null;
        if (elecId === 'inverter') pos = s.position;
        else if (elecId === 'dc_protection') pos = s.dcProtectionPosition;
        else if (elecId === 'battery') pos = s.batteryPosition;
        else if (elecId === 'combiner' && s.combinerBox) pos = s.combinerBox.position;
        else if (elecId === 'meter' && s.gridMeter) pos = s.gridMeter.position;

        if (pos && typeof pos.x === 'number') {
          try {
            const bs = new window.Cesium.BoundingSphere(pos, 2.5);
            window.viewer.camera.flyToBoundingSphere(bs, {
              duration: 1.2,
              offset: new window.Cesium.HeadingPitchRange(window.viewer.camera.heading, window.Cesium.Math.toRadians(-45.0), bs.radius * 2.2)
            });
          } catch(e) {}
        }
      }
    },

    minimize: function() {
      if (typeof document === 'undefined') return;
      const hudEl = document.getElementById('ra-bom-tree-hud');
      if (hudEl) {
        hudEl.classList.toggle('minimized');
      }
    },

    toggleVisibility: function() {
      if (typeof document === 'undefined') return;
      const hudEl = document.getElementById('ra-bom-tree-hud');
      if (!hudEl || hudEl.style.display === 'none' || (typeof window !== 'undefined' && window.innerWidth <= 768 && !hudEl.classList.contains('mobile-active'))) {
        this.open();
      } else {
        this.close();
      }
    },

    refresh: function() {
      const hudEl = document.getElementById('ra-bom-tree-hud');
      if (hudEl && hudEl.style.display === 'none') {
        const prev = hudEl.style.display;
        this.renderHUD();
        hudEl.style.display = prev;
      } else if (hudEl && hudEl.style.display !== 'none') {
        this.renderHUD();
      }
    }
  };

  // Suscribirse a cambios del proyecto para actualización en tiempo real (micro-debounce eficiente)
  let _bomDebounceTimer = null;
  if (typeof root !== 'undefined') {
    const bindHierarchy = function() {
      if (root.ProjectHierarchy && typeof root.ProjectHierarchy.subscribe === 'function') {
        root.ProjectHierarchy.subscribe(function() {
          const hudEl = document.getElementById('ra-bom-tree-hud');
          // Gating de visibilidad: solo computar y renderizar si el panel está abierto
          if (hudEl && hudEl.style.display !== 'none') {
            if (_bomDebounceTimer) clearTimeout(_bomDebounceTimer);
            _bomDebounceTimer = setTimeout(function() {
              if (typeof BOMTreeEngine !== 'undefined' && typeof BOMTreeEngine.refresh === 'function') {
                BOMTreeEngine.refresh();
              }
            }, 80);
          }
        });
      } else {
        setTimeout(bindHierarchy, 400);
      }
    };
    if (typeof document !== 'undefined') {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindHierarchy);
      } else {
        setTimeout(bindHierarchy, 200);
      }
    }
  }

  // Exportar al ámbito global
  root.BOMTreeEngine = BOMTreeEngine;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = BOMTreeEngine;
  }

})(typeof window !== 'undefined' ? window : global);


