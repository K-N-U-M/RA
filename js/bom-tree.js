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
          maxAllowedLoadKgM2: 25.0,
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

      // Helper canónico único CTE DB-SE-AE de sobrecarga estructural admisible en cubierta
      const getCteLimit = function(rType, stTypeStr, polyObj) {
        const rt = String(rType || '').toLowerCase();
        const st = String(stTypeStr || '').toLowerCase();
        let cteDefault = 25.0; // Cubierta ligera chapa / sándwich / deck (conservador CTE DB-SE-AE)
        if (rt === 'concrete' || rt === 'hormigon' || rt === 'plana_hormigon' || rt === 'flat_concrete') {
          cteDefault = 100.0;
        } else if (rt === 'teja' || rt === 'tile' || (st.indexOf('teja') !== -1 && rt !== 'deck' && rt !== 'chapa' && rt !== 'sandwich_metal')) {
          cteDefault = 50.0;
        }
        const manualLimit = (polyObj && typeof polyObj.maxStructuralLoadKgM2 === 'number' && polyObj.maxStructuralLoadKgM2 > 0)
          ? polyObj.maxStructuralLoadKgM2
          : null;
        if (manualLimit !== null) {
          if (manualLimit > cteDefault && typeof console !== 'undefined' && console.warn) {
            console.warn('[CTE DB-SE-AE] Sobrecarga manual en cubierta (' + manualLimit + ' kg/m²) supera el umbral conservador normativo (' + cteDefault + ' kg/m²). Requiere justificación estructural visada.');
          }
          return manualLimit;
        }
        return cteDefault;
      };
      if (typeof root !== 'undefined' && root.RA) {
        root.RA.getCteRoofLoadLimitKgM2 = function(rType, polyObj) {
          return getCteLimit(rType, polyObj && polyObj.structureType, polyObj);
        };
      }

      polylines.forEach((poly, polyIdx) => {
        const polyId = poly.id || `faldon_${polyIdx + 1}`;
        const polyName = poly.name || `Faldón ${polyIdx + 1}`;
        const roofType = poly.roofType || 'sandwich_metal';
        const maxLoad = getCteLimit(roofType, poly.structureType, poly);
        if (polyIdx === 0 || maxLoad < tree.summary.maxAllowedLoadKgM2) {
          tree.summary.maxAllowedLoadKgM2 = maxLoad;
        }
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

        // Single Source of Truth: Priorizar los módulos reales renderizados en 3D para este faldón (excluyendo reserva ghost)
        let panels = [];
        if (typeof root !== 'undefined' && Array.isArray(root.allRenderedPanels) && root.allRenderedPanels.length > 0) {
          panels = root.allRenderedPanels.filter(p => {
            if (!p || p.deleted || p.disabled || p.isGhost) return false;
            if (typeof p.polyIdx === 'number') return p.polyIdx === polyIdx;
            if (typeof p.faldonIndex === 'number') return p.faldonIndex === polyIdx;
            if (p.rawPanel && typeof p.rawPanel.polyIdx === 'number') return p.rawPanel.polyIdx === polyIdx;
            return polylines.length <= 1;
          });
        }
        // Fallback robusto a arrays de faldón si no se encontró en allRenderedPanels
        if (panels.length === 0) {
          if (Array.isArray(poly.panels) && poly.panels.length > 0) {
            panels = poly.panels.filter(p => p && !p.deleted && !p.disabled && !p.isGhost);
          } else if (poly.roofInfo && Array.isArray(poly.roofInfo.panels) && poly.roofInfo.panels.length > 0) {
            panels = poly.roofInfo.panels.filter(p => p && !p.deleted && !p.disabled && !p.isGhost);
          } else if (typeof root.computeSinglePolylineRoofInfo === 'function' && Array.isArray(poly.points) && poly.points.length >= 3) {
            try {
              const freshInfo = root.computeSinglePolylineRoofInfo(poly.points, poly);
              if (freshInfo && Array.isArray(freshInfo.panels)) {
                poly.roofInfo = freshInfo;
                panels = freshInfo.panels.filter(p => p && !p.deleted && !p.disabled && !p.isGhost);
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
          const mId = p.moduleId || (p.rawPanel && p.rawPanel.moduleId) || poly.moduleId || poly.assignedModuleId || projectConfig.selectedModuleId || defaultMod.id;
          moduleCounts[mId] = (moduleCounts[mId] || 0) + 1;
          const modSpec = moduleMap.get(mId) || defaultMod;
          roofKwp += (modSpec.wp || modSpec.potencia || 450) / 1000.0;
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
          fixingsType = 'Bloques prefabricados de hormigón (' + blockWeight + ' kg/ud) + Perfilería corta';
          fixingsCount = ballastBlocks;
          fixingsUnitCost = mfg.ballastBlockPrice || BOM_DEFAULTS.BALLAST_BLOCK_PRICE;
          // Incluir perfilería/guías sobre lastres y sus empalmes además del hormigón
          const railMetersBallast = totalProfileMeters * 0.55;
          const profileCostBallast = railMetersBallast * (mfg.railPricePerMeter || BOM_DEFAULTS.PERFIL_PRICE_PER_METER);
          const splicesCostBallast = Math.max(0, Math.ceil(railMetersBallast / (mfg.barLengthM || BOM_DEFAULTS.BAR_LENGTH_M)) - estRows) * (mfg.splicePrice || BOM_DEFAULTS.SPLICE_PRICE_UNIT);
          structMaterialsCostEur = (ballastBlocks * fixingsUnitCost) + profileCostBallast + splicesCostBallast;
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
          const profileCostTri = totalProfileMeters * (mfg.railPricePerMeter || BOM_DEFAULTS.PERFIL_PRICE_PER_METER);
          const splicesCostTri = railSplicesCount * (mfg.splicePrice || BOM_DEFAULTS.SPLICE_PRICE_UNIT);
          structMaterialsCostEur = aFramesCost + ballastCost + tieBarsCost + profileCostTri + splicesCostTri;
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
          const miRatio = (typeof window !== 'undefined' && typeof window.raGetMicroinverterRatio === 'function')
            ? window.raGetMicroinverterRatio(miSpec)
            : ((((miSpec.model || '') + (miSpec.type || '')).includes('4')) ? 4 : ((((miSpec.model || '') + (miSpec.type || '')).toLowerCase().includes('2') || ((miSpec.model || '') + (miSpec.type || '')).toLowerCase().includes('dual') || ((miSpec.model || '') + (miSpec.type || '')).includes('800')) ? 2 : 1));
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

        // ── 5. CUADROS DE PROTECCIÓN DC, AC, SMART METER Y BACKUP (REBT / IEC) ───────
        const sState = (typeof window !== 'undefined' && window.inverterEquipmentState) ? window.inverterEquipmentState : null;
        const cbPre = (sState && sState.cableBreakdown) ? sState.cableBreakdown : null;
        const isMicroBom = (projectConfig.selectedTopology === 'microinverter');
        const hasLightningRod = !!(projectConfig && projectConfig.hasExternalLightningRod);
        const spdTag = hasLightningRod ? 'SPD Tipo 1+2' : 'SPD Tipo 2';

        const activeInvSpec = (tree.electrical.inverters && tree.electrical.inverters[0])
          ? ((catalog.inverters && catalog.inverters.find(i => i.id === tree.electrical.inverters[0].id)) || tree.electrical.inverters[0])
          : null;
        const invCountBom = Math.max(1, tree.summary.totalInverters || 1);
        const totalAcKwPre = tree.summary.totalAcKw || (tree.summary.totalKwp / 1.15);
        const effInvForPhase = activeInvSpec || { kw: totalAcKwPre };
        const acLinePhases = (typeof window !== 'undefined' && typeof window.raResolveAcPhases === 'function')
          ? window.raResolveAcPhases(effInvForPhase, invCountBom, projectConfig)
          : ((projectConfig.gridSupply === 'single_phase' && totalAcKwPre <= 15.0)
            ? 1
            : ((typeof window !== 'undefined' && typeof window.raInverterPhases === 'function' && activeInvSpec)
              ? window.raInverterPhases(activeInvSpec)
              : (totalAcKwPre > 6.0 ? 3 : 1)));
        // [FASE 1 SSOT] Calculadora única canónica compartida con Visor 3D y Memoria Técnica
        const modCfgForBom = (typeof window !== 'undefined' && window.panelConfig)
          ? window.panelConfig
          : { potencia: 450, voc: 41.5, vmp: 34.5, isc: 13.8, imp: 13.05 };
        const engCanonical = (typeof window !== 'undefined' && window.RA && window.RA.Electrical && typeof window.RA.Electrical.computeSizingEngineering === 'function' && tree.summary.totalPanels > 0)
          ? window.RA.Electrical.computeSizingEngineering({
              numPanels: tree.summary.totalPanels,
              cfg: modCfgForBom,
              tiltDeg: 15,
              azimutDeg: 0,
              latDeg: 40.4,
              invCount: invCountBom
            })
          : null;

        // La línea de evacuación y su IGA/Diferencial siguen las fases reales de salida del sistema inversor (acLinePhases)
        const invPhases = (engCanonical && typeof engCanonical.monofasico === 'boolean')
          ? (engCanonical.monofasico ? 1 : 3)
          : acLinePhases;
        const totalAcKwBom = tree.summary.totalAcKw || (tree.summary.totalKwp / 1.15);
        const vAcBom = invPhases === 1 ? 230 : 400;
        const iAcDesignBom = (engCanonical && engCanonical.I_ac_design > 0)
          ? engCanonical.I_ac_design
          : (1.25 * (invPhases === 1
            ? (totalAcKwBom * 1000) / (vAcBom * 0.95)
            : (totalAcKwBom * 1000) / (Math.sqrt(3) * vAcBom * 0.95)));

        const allStrPre = (typeof RACableEngine !== 'undefined' && typeof RACableEngine.gatherAllStrings === 'function')
          ? RACableEngine.gatherAllStrings()
          : null;
        const estStringsPre = (allStrPre && allStrPre.length > 0)
          ? allStrPre.length
          : ((engCanonical && engCanonical.numStrings > 0) ? engCanonical.numStrings : Math.max(1, Math.ceil(tree.summary.totalPanels / 12)));
        const totalMpptsBom = Math.max(1, ((activeInvSpec && activeInvSpec.mppt) || 2) * invCountBom);
        const needsCombinerFuses = !isMicroBom && ((engCanonical && typeof engCanonical.useFuses === 'boolean')
          ? engCanonical.useFuses
          : (Math.ceil(estStringsPre / totalMpptsBom) >= 3));
        const fuseAmpBom = (engCanonical && engCanonical.fuse_std) ? engCanonical.fuse_std : 25;

        let dcPanelId = projectConfig.selectedProtectionDcId;
        if (!projectConfig.userManuallySelectedProtectionDc) {
          if (needsCombinerFuses) dcPanelId = 'panel_dc_combiner_4str';
          else if (totalMpptsBom <= 1 || estStringsPre <= 1) dcPanelId = 'panel_dc_1mppt';
          else dcPanelId = 'panel_dc_2mppt';
        }
        let acPanelId = projectConfig.selectedProtectionAcId;
        if (!projectConfig.userManuallySelectedProtectionAc) {
          if (invPhases === 1) acPanelId = (iAcDesignBom > 25) ? 'panel_ac_mono_40a' : 'panel_ac_mono_25a';
          else acPanelId = (iAcDesignBom > 25) ? 'panel_ac_tri_40a' : 'panel_ac_tri_25a';
        }
        const dcPanelSpec = (catalog.electricalPanels && catalog.electricalPanels.find(p => p.id === dcPanelId)) || { model: 'Cuadro DC SPD II', price: 245 };
        const acPanelSpecBase = (catalog.electricalPanels && catalog.electricalPanels.find(p => p.id === acPanelId)) || { model: 'Cuadro General AC CGBT', price: 295, amps: 25 };

        const stdIgaRatings = [16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250];
        const reqIgaA = (engCanonical && engCanonical.I_iga > 0)
          ? engCanonical.I_iga
          : (stdIgaRatings.find(a => a >= iAcDesignBom) || Math.ceil(iAcDesignBom));

        // Resolver RCD canónico (SSOT con electrical-engine.js) sin asumir Clase B cuando el equipo certifica RCMU
        const rcdSpecBom = (typeof window !== 'undefined' && typeof window.raResolveRcdSpec === 'function')
          ? window.raResolveRcdSpec({
              igaIn: reqIgaA,
              isThreePhase: (invPhases === 3),
              totalAcKw: totalAcKwBom,
              topology: projectConfig.selectedTopology || 'inverter',
              inv: activeInvSpec
            })
          : { inA: Math.max(reqIgaA, 25), rcdType: 'Clase A-SI', sensibilidadMa: reqIgaA >= 63 ? 300 : 30 };

        // 5.1 Cuadros DC (0 en microinversores; repartidos por inversor sin compartir cuadro entre inversores distintos)
        let dcPanelCount = 0;
        let dcPanelCost = 0;
        if (!isMicroBom) {
          const dcWays = Math.max(1, estStringsPre);
          const waysPerBox = Math.max(1, dcPanelSpec.mppt || (needsCombinerFuses ? 4 : 2));
          dcPanelCount = Math.max(invCountBom, Math.ceil(dcWays / waysPerBox));
          const compactOnlySpd = Boolean(engCanonical && engCanonical.needsExternalDcPanel === false && !projectConfig.userManuallySelectedProtectionDc);
          const lightningDcSurcharge = hasLightningRod ? 135.0 : 0;
          // [F2-08] Escalar aparamenta y SPD DC (1000V / 1200V / 1500V CC) según max(1.20 * Voc_cold, V_dc_max)
          const vocColdBom = (engCanonical && engCanonical.vocMaxCold > 0) ? engCanonical.vocMaxCold : 600;
          const vMaxInvDc = (activeInvSpec && activeInvSpec.maxDcV > 0) ? activeInvSpec.maxDcV : 1000;
          const reqDcUe = Math.max(1.20 * vocColdBom, vMaxInvDc);
          const dcVoltageRatingV = reqDcUe > 1200 ? 1500 : (reqDcUe > 1000 ? 1200 : 1000);
          const hvDcSurcharge = dcVoltageRatingV >= 1500 ? 185.0 : (dcVoltageRatingV >= 1200 ? 95.0 : 0);
          const baseDcPrice = compactOnlySpd ? Math.round((dcPanelSpec.price || 245) * 0.65) : (dcPanelSpec.price || 245);
          const dcUnitPrice = baseDcPrice + lightningDcSurcharge + hvDcSurcharge;
          dcPanelCost = parseFloat((dcPanelCount * dcUnitPrice).toFixed(2));
          const dcLabel = needsCombinerFuses
            ? `Cuadro DC ${dcWays} Strings ${dcVoltageRatingV}V CC (${spdTag} por MPPT + Secc. + Fusibles gPV ${fuseAmpBom}A)`
            : (compactOnlySpd
              ? `Cofret DC Compacto ${dcVoltageRatingV}V CC (${spdTag} por MPPT · Seccionador integrado en inversor)`
              : `${dcPanelSpec.model.replace('SPD II', spdTag + ' ' + dcVoltageRatingV + 'V CC por MPPT')}`);
          tree.electrical.dcPanels.push({ model: dcLabel, count: dcPanelCount, price: dcPanelCost, voltageRatingV: dcVoltageRatingV });
        } else {
          // Microinversores: Cajas de derivación AC IP65 en cubierta por faldón/ramal
          const microBranchesCount = Math.max(1, (cbPre && cbPre.acJunctionBoxes > 0) ? cbPre.acJunctionBoxes : Math.ceil(totalAcKwBom / (invPhases === 1 ? 3.68 : 11.0)));
          const jBoxCost = parseFloat((microBranchesCount * 48.0).toFixed(2));
          dcPanelCost = jBoxCost;
          tree.electrical.dcPanels.push({
            model: 'Caja Estanca Derivación Bus AC Cubierta IP65 (Microinversores)',
            count: microBranchesCount,
            price: jBoxCost
          });
        }

        // Protección DC Batería (Seccionador bipolar CC + Fusibles gBat IEC 60269-7) cuando hay batería
        if (tree.summary.totalStorageKwh > 0) {
          const batProtCost = 145.0;
          dcPanelCost = parseFloat((dcPanelCost + batProtCost).toFixed(2));
          tree.electrical.dcPanels.push({
            model: 'Cofret Protección DC Batería (Seccionador Bipolar CC + Fusibles gBat IEC 60269-7)',
            count: 1,
            price: batProtCost
          });
        }

        // 5.2 Cuadro General AC (+ Subcuadro Agrupador Multi-Inversor o Protecciones por Rama en Microinversores)
        const acScaleFactor = iAcDesignBom > 40 ? Math.min(2.8, 1 + ((iAcDesignBom - 40) / 80)) : 1.0;
        const lightningAcSurcharge = hasLightningRod ? (invPhases === 1 ? 115.0 : 175.0) : 0;
        const microBranches = isMicroBom ? Math.max(1, Math.ceil(totalAcKwBom / (invPhases === 1 ? 3.68 : 11.0))) : 0;
        const acPanelModel = isMicroBom
          ? `Cuadro General AC ${invPhases === 1 ? '1F' : '3F'} (${microBranches}× Mag. Rama 20A + IGA ${reqIgaA}A + Dif ${rcdSpecBom.sensibilidadMa}mA ${rcdSpecBom.rcdType} + ${spdTag} + POP)`
          : `Cuadro General AC ${invPhases === 1 ? '1F' : '3F'} (IGA ${reqIgaA}A + Dif ${rcdSpecBom.inA}A/${rcdSpecBom.sensibilidadMa}mA ${rcdSpecBom.rcdType} + ${spdTag} + POP)`;
        const acPanelCost = parseFloat((((acPanelSpecBase.price || 295) * acScaleFactor) + lightningAcSurcharge + (isMicroBom ? microBranches * 28.0 : 0)).toFixed(2));
        tree.electrical.acPanels.push({ model: acPanelModel, count: 1, price: acPanelCost });

        let subPanelCost = 0;
        if (!isMicroBom && invCountBom > 1) {
          subPanelCost = parseFloat((75.0 + invCountBom * 92.0).toFixed(2));
          tree.electrical.acPanels.push({
            model: `Subcuadro Agrupador AC FV (${invCountBom}× Magnetotérmicos + Diferenciales por Inversor)`,
            count: 1,
            price: subPanelCost
          });
        }

        // 5.3 Smart Meter / Gateway + Bus RS485 (Antivertido RD 244/2019 y Monitorización)
        const meterUnitCost = isMicroBom ? 245.0 : (invPhases === 1 ? 165.0 : 235.0);
        const rs485Meters = Math.max(15, Math.round((sState && sState.L_ac_measured) || 15));
        const meterTotalCost = parseFloat((meterUnitCost + rs485Meters * 1.15).toFixed(2));
        tree.electrical.smartMeter = {
          model: isMicroBom
            ? `Gateway / DTU Comunicaciones + Toroidales + ${rs485Meters}m Bus Datos`
            : `Vatímetro Smart Meter ${invPhases === 1 ? '1F' : '3F'} + CTs + ${rs485Meters}m Bus RS485 Apantallado (Antivertido RD 244/2019)`,
          price: meterTotalCost
        };

        // 5.4 Cuadro de Respaldo / Backup ATS cuando hay batería y está habilitado
        let backupCost = 0;
        if (tree.summary.totalStorageKwh > 0 && projectConfig.includeBackupBox !== false) {
          backupCost = invPhases === 1 ? 420.0 : 680.0;
          tree.electrical.backupBox = {
            model: `Cuadro Conmutación Backup / Emergencia ATS ${invPhases === 1 ? '1F' : '3F'} (Cargas Críticas)`,
            price: backupCost
          };
        }

        tree.summary.subtotalEur += (dcPanelCost + acPanelCost + subPanelCost + meterTotalCost + backupCost);
        tree.electrical.panelsProtTotalEur = parseFloat((dcPanelCost + acPanelCost + subPanelCost + meterTotalCost + backupCost).toFixed(2));

        // ── 6. CABLEADO SOLAR DC, TRONCAL, RAMAS AC, MICRO Y BATERÍA (SSOT REBT) ───────
        const estDcLengthM = (sState && typeof sState.L_dc_string_measured === 'number' && sState.L_dc_string_measured > 0)
          ? sState.L_dc_string_measured
          : ((sState && typeof sState.L_dc_measured === 'number' && sState.L_dc_measured > 0)
            ? sState.L_dc_measured
            : Math.max(25, Math.round(tree.summary.totalPanels * 3.5)));
        const estAcLengthM = (sState && typeof sState.L_ac_measured === 'number' && sState.L_ac_measured > 0)
          ? sState.L_ac_measured
          : 20.0;

        const DC_PRICE_BY_SEC = { 4: 1.45, 6: 1.85, 10: 2.90, 16: 4.20, 25: 6.50, 35: 9.10, 50: 12.80, 70: 17.90 };
        const AC_PRICE_BY_SEC = { 2.5: 2.40, 4: 3.20, 6: 4.40, 10: 6.20, 16: 9.10, 25: 13.80, 35: 18.50, 50: 25.20, 70: 34.50 };

        const targetDcSec = (engCanonical && engCanonical.S_str > 0)
          ? Number(engCanonical.S_str)
          : ((sState && Number(sState.S_dc_recommended) > 0) ? Number(sState.S_dc_recommended) : null);
        const targetDcMdcSec = (engCanonical && engCanonical.S_mdc > 0)
          ? Number(engCanonical.S_mdc)
          : ((sState && Number(sState.S_mdc_recommended) > 0) ? Number(sState.S_mdc_recommended) : (targetDcSec || 6));
        const targetAcSec = (engCanonical && engCanonical.S_ac > 0)
          ? Number(engCanonical.S_ac)
          : ((sState && Number(sState.S_ac_recommended) > 0) ? Number(sState.S_ac_recommended) : null);
        const targetAcBranchSec = (engCanonical && engCanonical.S_ac_branch > 0)
          ? Number(engCanonical.S_ac_branch)
          : ((sState && Number(sState.S_ac_branch_recommended) > 0) ? Number(sState.S_ac_branch_recommended) : (targetAcSec || 6));

        const dcCableItem = (targetDcSec && catalog.cables && catalog.cables.find(c => Number(c.sec) === targetDcSec && String(c.type || '').toLowerCase().includes('dc')))
          || (targetDcSec ? { sec: targetDcSec, pricePerMeter: DC_PRICE_BY_SEC[targetDcSec] || Math.round((targetDcSec * 0.28 + 0.3) * 100) / 100 } : null)
          || (catalog.cables && catalog.cables.find(c => c.id === (projectConfig.selectedCableDcId || 'cable_dc_zzf_6')))
          || { pricePerMeter: 1.85, sec: 6 };
        const dcTrunkUnitPrice = DC_PRICE_BY_SEC[targetDcMdcSec] || Math.round((targetDcMdcSec * 0.28 + 0.3) * 100) / 100;

        const acCableItem = (targetAcSec && catalog.cables && catalog.cables.find(c => Number(c.sec) === targetAcSec && String(c.type || '').toLowerCase().includes('ac')))
          || (targetAcSec ? { sec: targetAcSec, pricePerMeter: AC_PRICE_BY_SEC[targetAcSec] || Math.round((targetAcSec * 0.50 + 1.1) * 100) / 100 } : null)
          || (catalog.cables && catalog.cables.find(c => c.id === (projectConfig.selectedCableAcId || 'cable_ac_rvk_5g10')))
          || { pricePerMeter: 6.20, sec: 10 };
        const acBranchUnitPrice = AC_PRICE_BY_SEC[targetAcBranchSec] || Math.round((targetAcBranchSec * 0.50 + 1.1) * 100) / 100;

        const numStrings = estStringsPre;
        const cb = (sState && sState.cableBreakdown) ? sState.cableBreakdown : null;

        let dcStringMeters = 0;
        let dcTrunkMeters = 0;
        if (isMicroBom || (cb && cb.topology === 'microinverter')) {
          dcStringMeters = 0;
          dcTrunkMeters = 0;
        } else if (cb && (typeof cb.dcStringCableMeters === 'number' || typeof cb.totalDcCableMeters === 'number') && (cb.totalDcCableMeters > 0 || cb.dcStringCableMeters > 0)) {
          dcTrunkMeters = (typeof cb.dcTrunkCableMeters === 'number' && cb.dcTrunkCableMeters > 0) ? Math.round(cb.dcTrunkCableMeters) : 0;
          dcStringMeters = (typeof cb.dcStringCableMeters === 'number' && cb.dcStringCableMeters > 0)
            ? Math.round(cb.dcStringCableMeters)
            : Math.max(0, Math.round(cb.totalDcCableMeters) - dcTrunkMeters);
        } else if (sState && Array.isArray(sState.stringTelemetry) && sState.stringTelemetry.length > 0) {
          dcStringMeters = Math.round(sState.stringTelemetry.reduce((acc, st) => acc + ((st.posHomerunLength || st.homerunLength || estDcLengthM) + (st.negHomerunLength || st.homerunLength || estDcLengthM) + (st.returnConductorLength || 0)), 0));
        } else {
          dcStringMeters = Math.round(estDcLengthM * 2 * numStrings);
        }

        const dcStringCost = dcStringMeters * dcCableItem.pricePerMeter;
        const dcTrunkCost = dcTrunkMeters * dcTrunkUnitPrice;
        const totalDcMeters = dcStringMeters + dcTrunkMeters;
        const dcCableCost = dcStringCost + dcTrunkCost;

        const acMainMeters = (cb && typeof cb.acMainCableMeters === 'number' && cb.acMainCableMeters > 0)
          ? Math.round(cb.acMainCableMeters)
          : ((cb && typeof cb.totalAcCableMeters === 'number' && cb.totalAcCableMeters > 0) ? Math.round(cb.totalAcCableMeters) : estAcLengthM);
        const acBranchMeters = isMicroBom
          ? ((cb && typeof cb.microTrunkCableMeters === 'number' && cb.microTrunkCableMeters > 0) ? Math.round(cb.microTrunkCableMeters) : Math.round(tree.summary.totalPanels * 1.35))
          : ((invCountBom > 1) ? ((cb && typeof cb.acBranchCableMeters === 'number' && cb.acBranchCableMeters > 0) ? Math.round(cb.acBranchCableMeters) : (invCountBom * 5)) : 0);
        const acMainCost = acMainMeters * acCableItem.pricePerMeter;
        const acBranchCost = acBranchMeters * acBranchUnitPrice;
        const acCableCost = acMainCost + acBranchCost;

        // Cable de potencia DC Batería -> Inversor Híbrido
        const batCableMeters = (tree.summary.totalStorageKwh > 0)
          ? ((cb && typeof cb.batteryCableMeters === 'number' && cb.batteryCableMeters > 0) ? Math.round(cb.batteryCableMeters) : 6)
          : 0;
        const batCableSec = (cb && cb.batteryCableSecMm2) || 25;
        const batCableUnitPrice = DC_PRICE_BY_SEC[batCableSec] || 6.50;
        const batCableCost = batCableMeters * batCableUnitPrice;

        tree.summary.subtotalEur += (dcCableCost + acCableCost + batCableCost);

        tree.electrical.cables.push(
          { type: 'DC String H1Z2Z2-K 1,8kV', secMm2: targetDcSec || dcCableItem.sec || 6, meters: dcStringMeters, unitPrice: dcCableItem.pricePerMeter, totalEur: parseFloat(dcStringCost.toFixed(2)) },
          { type: 'AC General RZ1-K (AS) 0,6/1kV', secMm2: targetAcSec || acCableItem.sec || 10, meters: acMainMeters, unitPrice: acCableItem.pricePerMeter, totalEur: parseFloat(acMainCost.toFixed(2)) }
        );
        if (dcTrunkMeters > 0) {
          tree.electrical.cables.push({
            type: 'DC Troncal Combiner → Inversor H1Z2Z2-K',
            secMm2: targetDcMdcSec,
            meters: dcTrunkMeters,
            unitPrice: dcTrunkUnitPrice,
            totalEur: parseFloat(dcTrunkCost.toFixed(2))
          });
        }
        if (acBranchMeters > 0) {
          tree.electrical.cables.push({
            type: isMicroBom ? 'Bus AC Troncal Cubierta H07RN-F' : 'AC Rama Inversor → Subcuadro RZ1-K',
            secMm2: isMicroBom ? (targetAcBranchSec || 4) : targetAcBranchSec,
            meters: acBranchMeters,
            unitPrice: acBranchUnitPrice,
            totalEur: parseFloat(acBranchCost.toFixed(2))
          });
        }
        if (batCableMeters > 0) {
          tree.electrical.cables.push({
            type: 'Bus DC Batería → Inversor RV-K 1kV',
            secMm2: batCableSec,
            meters: batCableMeters,
            unitPrice: batCableUnitPrice,
            totalEur: parseFloat(batCableCost.toFixed(2))
          });
        }

        // ── 6.4 BANDEJAS, TUBOS Y CONECTORES MC4 DESDE cableBreakdown ─────────
        const trayMeters = (cb && typeof cb.totalTrayMeters === 'number' && cb.totalTrayMeters > 0) ? Math.round(cb.totalTrayMeters) : 0;
        const acConduitMeters = (cb && typeof cb.totalAcConduitMeters === 'number' && cb.totalAcConduitMeters > 0) ? Math.round(cb.totalAcConduitMeters) : 0;
        let trayAndConduitCost = 0;
        if (trayMeters > 0) {
          const trayUnitEur = (cb.trayWidthMm && cb.trayWidthMm >= 150) ? 18.50 : ((cb.trayWidthMm && cb.trayWidthMm >= 100) ? 14.20 : 10.50);
          const trayCost = parseFloat((trayMeters * trayUnitEur).toFixed(2));
          trayAndConduitCost += trayCost;
          tree.summary.subtotalEur += trayCost;
          tree.electrical.tray = {
            description: cb.trayType || 'Bandeja portacables / Tubo DC',
            meters: trayMeters,
            unitPrice: trayUnitEur,
            totalEur: trayCost
          };
        }
        if (acConduitMeters > 0) {
          const conduitUnitEur = 4.20;
          const conduitCost = parseFloat((acConduitMeters * conduitUnitEur).toFixed(2));
          trayAndConduitCost += conduitCost;
          tree.summary.subtotalEur += conduitCost;
          tree.electrical.acConduit = {
            description: cb.acConduitSpec || 'Tubo rígido M32 libre de halógenos',
            meters: acConduitMeters,
            unitPrice: conduitUnitEur,
            totalEur: conduitCost
          };
        }

        // ── 6.5 CONECTORES MC4, LATIGUILLOS MEDIDOS EN 3D Y CONECTORES BUS MICRO ──────
        const stringWiringTopology = (projectConfig && projectConfig.stringWiringTopology) || 'leapfrog';
        const has3DJumperMeasurement = Boolean(cb && typeof cb.interModuleJumperCount === 'number' && cb.totalDcCableMeters > 0);
        if (!isMicroBom) {
          const jumpersCount = has3DJumperMeasurement
            ? cb.interModuleJumperCount
            : ((stringWiringTopology === 'leapfrog') ? Math.max(0, tree.summary.totalPanels - (2 * numStrings)) : 0);
          if (jumpersCount > 0) {
            const jumperUnitPrice = 5.20;
            const totalJumpersCost = parseFloat((jumpersCount * jumperUnitPrice).toFixed(2));
            tree.summary.subtotalEur += totalJumpersCost;
            tree.electrical.mc4Jumpers = {
              count: jumpersCount,
              type: has3DJumperMeasurement ? 'Latiguillos Alargadores MC4 1.5m (Medidos en Trazado 3D)' : 'Latiguillos Alargadores MC4 1.5m (Salto de Rana)',
              unitPrice: jumperUnitPrice,
              totalEur: totalJumpersCost
            };
          }
        } else {
          const microConnCount = (cb && cb.microBusConnectors > 0)
            ? cb.microBusConnectors
            : (Math.max(1, tree.summary.totalMicroinverters) + 2);
          const microConnUnitPrice = 8.50;
          const microConnCost = parseFloat((microConnCount * microConnUnitPrice).toFixed(2));
          tree.summary.subtotalEur += microConnCost;
          tree.electrical.mc4Connectors = {
            pairs: microConnCount,
            label: 'Conectores T Bus AC + Tapones IP68 Microinversor',
            unitPrice: microConnUnitPrice,
            totalEur: microConnCost
          };
        }
        let mc4ConnectorsCost = 0;
        if (!isMicroBom && cb && typeof cb.mc4ConnectorPairs === 'number' && cb.mc4ConnectorPairs > 0) {
          const mc4Pairs = Math.round(cb.mc4ConnectorPairs);
          const mc4PairPrice = 3.40;
          mc4ConnectorsCost = parseFloat((mc4Pairs * mc4PairPrice).toFixed(2));
          tree.summary.subtotalEur += mc4ConnectorsCost;
          tree.electrical.mc4Connectors = {
            pairs: mc4Pairs,
            unitPrice: mc4PairPrice,
            totalEur: mc4ConnectorsCost
          };
        }

        // ── 7. PUESTA A TIERRA & AUXILIARES (SECCIÓN SEGÚN PARARRAYOS ITC-BT-18) ──
        const earthSecMm2 = (engCanonical && engCanonical.S_earth) || (cb && cb.groundingSecMm2) || (hasLightningRod ? 16 : 6);
        const earthRods = hasLightningRod ? Math.max(2, Math.ceil(tree.summary.totalKwp / 20.0)) : 1;
        const earthWireM = (cb && typeof cb.totalGroundingMeters === 'number' && cb.totalGroundingMeters > 0)
          ? Math.round(cb.totalGroundingMeters)
          : Math.round(tree.summary.totalPanels * BOM_DEFAULTS.EARTH_WIRE_PER_PANEL_M);
        const earthWireUnitEur = (earthSecMm2 >= 16) ? 2.10 : 0.95;
        const earthCost = (earthRods * 35.0) + (earthWireM * earthWireUnitEur);
        tree.summary.subtotalEur += earthCost;

        tree.electrical.grounding.push({
          earthRods: earthRods,
          earthWireM: earthWireM,
          earthSecMm2: earthSecMm2,
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

        // Ingeniería ([F2-05] REBT ITC-BT-04 Grupo c: umbral Proyecto Técnico Visado por potencia nominal AC > 10 kW)
        const needsTechnicalProject = (typeof totalAcKwBom === 'number' && totalAcKwBom > 10.0);
        const costProj = needsTechnicalProject ? Math.max(engCfg.technicalProject, 950.0) : engCfg.technicalProject;
        const costSup = engCfg.siteSupervision;
        const costCie = engCfg.adminCIE;

        // Permisos, mano de obra e ICIO sobre base completa de ejecución material (materiales + mano de obra)
        const costUrban = permitsCfg.urbanPermitFixed;
        const costWaste = permitsCfg.wasteDeposit;
        const costSmallMat = parseFloat((totalP * (smallMatCfg.perPanelSmallMaterials || 6.50)).toFixed(2));
        const pemBaseEur = tree.summary.subtotalEur + costMech + costElec + costComm + costSmallMat;
        const costIcio = parseFloat((pemBaseEur * ((permitsCfg.urbanPermitRatePct || 3.5) / 100)).toFixed(2));

        // Medios auxiliares y seguridad
        const costLifeline = auxCfg.lifelineSafety;
        const costScaffold = (totalP > 25) ? auxCfg.scaffoldingLift : Math.round(auxCfg.scaffoldingLift * 0.6);

        const jumpersCostVal = (tree.electrical.mc4Jumpers && tree.electrical.mc4Jumpers.totalEur) ? tree.electrical.mc4Jumpers.totalEur : 0;
        tree.electrical.cablesTotalEur = parseFloat((dcCableCost + acCableCost + trayAndConduitCost + mc4ConnectorsCost + jumpersCostVal + earthCost + safetySignageCost + costSmallMat).toFixed(2));

        const subtotalInstallation = costMech + costElec + costComm + costProj + costSup + costCie + costUrban + costWaste + costLifeline + costScaffold + costSmallMat;

        tree.summary.subtotalEur += subtotalInstallation;
        tree.summary.pecDirectCostEur = parseFloat(tree.summary.subtotalEur.toFixed(2));
        tree.summary.municipalTaxesEur = parseFloat(costIcio.toFixed(2));

        tree.laborAndSoftCosts.push(
          { category: 'labor', description: `Montaje mecánico de estructuras y paneles (${mechH} h @ ${rate} €/h)`, totalEur: costMech },
          { category: 'labor', description: `Conexionado eléctrico DC/AC y cableado (${elecH} h @ ${rate} €/h)`, totalEur: costElec },
          { category: 'labor', description: `Puesta en marcha, ensayos y verificación REBT (${commH} h fijas @ ${rate} €/h)`, totalEur: costComm },
          { category: 'engineering', description: (needsTechnicalProject ? 'Proyecto Técnico Visado de Ingeniero Colegiado (Pn AC > 10 kW · ITC-BT-04)' : 'Memoria Técnica de Diseño (MTD · Pn AC ≤ 10 kW)'), totalEur: costProj },
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
      const expandedNodeIds = [];
      let prevScrollTop = 0;
      if (hudEl) {
        const bodyElPrev = hudEl.querySelector('.bom-hud-body');
        if (bodyElPrev) prevScrollTop = bodyElPrev.scrollTop || 0;
        const openNodes = hudEl.querySelectorAll('.bom-node-children');
        for (let ni = 0; ni < openNodes.length; ni++) {
          if (openNodes[ni].id && openNodes[ni].style.display !== 'none') {
            expandedNodeIds.push(openNodes[ni].id);
          }
        }
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
            ${r.structure.profileMeters ? `<div class="bom-subitem" style="font-size: 11px;color:#94a3b8;padding-left:12px;">• Perfil aluminio: <b>${r.structure.profileMeters} m</b> (${r.structure.standardBarsCount} barras 3.15m + ${r.structure.railSplicesCount} empalmes)</div>` : ''}
            ${r.structure.fixingsCount ? `<div class="bom-subitem" style="font-size: 11px;color:#94a3b8;padding-left:12px;">• Fijaciones: <b>${r.structure.fixingsCount}x</b> ${r.structure.fixingsType}</div>` : ''}
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
              <span style="font-size: 11px; color:#94a3b8;">${obs.dimensions}</span>
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
            <div class="bom-section-title">MÓDULOS FOTOVOLTAICOS</div>
            ${(tree.modules && tree.modules.length > 0) ? tree.modules.map(m => `
              <div class="bom-subitem">🔆 <b>${m.count}x</b> ${m.brand} ${m.model} (${m.wp} Wp · ${m.unitPrice} €/ud) · <b>${m.totalPriceEur.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</b></div>
            `).join('') : '<div class="bom-empty">Sin módulos FV</div>'}

            <div class="bom-section-title">SUPERFICIES &amp; ESTRUCTURAS</div>
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
            ${tree.electrical.smartMeter ? `<div class="bom-subitem">📊 ${tree.electrical.smartMeter.model} — <b>${tree.electrical.smartMeter.price} €</b></div>` : ''}
            ${tree.electrical.backupBox ? `<div class="bom-subitem">🔋 ${tree.electrical.backupBox.model} — <b>${tree.electrical.backupBox.price} €</b></div>` : ''}
            <div class="bom-subitem">📏 Cable DC Strings: ${tree.electrical.cables[0] ? tree.electrical.cables[0].meters + 'm (' + tree.electrical.cables[0].secMm2 + 'mm²) · <b>' + tree.electrical.cables[0].totalEur.toLocaleString('es-ES', { minimumFractionDigits: 2 }) + ' €</b>' : '0m'}</div>
            <div class="bom-subitem">🔌 Evacuación AC General: ${tree.electrical.cables[1] ? tree.electrical.cables[1].meters + 'm (' + tree.electrical.cables[1].secMm2 + 'mm²) · <b>' + tree.electrical.cables[1].totalEur.toLocaleString('es-ES', { minimumFractionDigits: 2 }) + ' €</b>' : '0m'}</div>
            ${tree.electrical.cables.slice(2).map(c => `<div class="bom-subitem">🔌 ${c.type}: ${c.meters}m (${c.secMm2}mm²) · <b>${c.totalEur.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</b></div>`).join('')}
            ${tree.electrical.tray ? `<div class="bom-subitem">🪜 ${tree.electrical.tray.description}: ${tree.electrical.tray.meters}m · <b>${tree.electrical.tray.totalEur.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</b></div>` : ''}
            ${tree.electrical.acConduit ? `<div class="bom-subitem">🗜️ ${tree.electrical.acConduit.description}: ${tree.electrical.acConduit.meters}m · <b>${tree.electrical.acConduit.totalEur.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</b></div>` : ''}
            ${tree.electrical.mc4Connectors ? `<div class="bom-subitem">🔗 ${tree.electrical.mc4Connectors.label || 'Parejas MC4'}: <b>${tree.electrical.mc4Connectors.pairs}x</b> · <b>${tree.electrical.mc4Connectors.totalEur.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</b></div>` : ''}
            ${tree.electrical.mc4Jumpers ? `<div class="bom-subitem">🔗 ${tree.electrical.mc4Jumpers.type || 'Latiguillos MC4'}: <b>${tree.electrical.mc4Jumpers.count}x</b> · <b>${tree.electrical.mc4Jumpers.totalEur.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</b></div>` : ''}
            ${tree.electrical.grounding && tree.electrical.grounding.length > 0 ? `<div class="bom-subitem">⏚ Puesta a Tierra: ${tree.electrical.grounding[0].earthRods} pica(s) + ${tree.electrical.grounding[0].earthWireM}m conductor Cu ${tree.electrical.grounding[0].earthSecMm2 || 6}mm² · <b>${tree.electrical.grounding[0].totalEur.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</b></div>` : ''}
            ${tree.electrical.safetySignage ? `<div class="bom-subitem">⚠️ ${tree.electrical.safetySignage.description} · <b>${tree.electrical.safetySignage.totalEur.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</b></div>` : ''}

            <div class="bom-section-title">INSTALACIÓN, INGENIERÍA & MEDIOS</div>
            ${tree.laborAndSoftCosts && tree.laborAndSoftCosts.length > 0 ? tree.laborAndSoftCosts.map(item => `
              <div class="bom-subitem" style="display:flex;justify-content:space-between;align-items:center;padding:2px 0;">
                <span style="font-size: 11px;color:#CBD5E1;">${item.description}</span>
                <b style="font-size: 11px;color:#F8FAFC;margin-left:6px;">${item.totalEur.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</b>
              </div>
            `).join('') : ''}
          `}
          <div class="bom-total-footer" style="flex-direction:column;align-items:stretch;gap:3px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span>COSTE DIRECTO PEC (BOM + M.O.):</span>
              <span class="bom-total-price">${tree.summary.subtotalEur.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</span>
            </div>
            ${tree.summary.municipalTaxesEur > 0 ? `<div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#94a3b8;font-weight:500;"><span>Tasas Municipales / ICIO est. (informativo):</span><span>${tree.summary.municipalTaxesEur.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</span></div>` : ''}
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

      // Restaurar estado de acordeones abiertos y scroll vertical del HUD BIM
      expandedNodeIds.forEach(nId => {
        const nodeEl = document.getElementById(nId);
        if (nodeEl) nodeEl.style.display = 'block';
      });
      const bodyElNew = hudEl ? hudEl.querySelector('.bom-hud-body') : null;
      if (bodyElNew && prevScrollTop > 0) {
        bodyElNew.scrollTop = prevScrollTop;
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


