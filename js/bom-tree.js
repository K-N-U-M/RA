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

  // Ratios paramétricos de ingeniería de montaje (estándar UNE/CTE)
  const BOM_DEFAULTS = {
    CLAMPS_PER_ROW_END: 4,               // 2 por cada extremo de fila
    VARILLAS_PER_PANEL_COPLANAR: 2.2,    // Fijaciones sándwich / salva-tejas por panel
    PERFIL_METERS_PER_PANEL: 1.15,       // Metros lineales de guía de aluminio por panel (ancho + solape)
    BALLAST_BLOCKS_PER_PANEL_15: 2,      // Bloques de hormigón por soporte a 15°
    BALLAST_BLOCKS_PER_PANEL_30: 3,      // Bloques de hormigón por soporte a 30°
    BALLAST_WEIGHT_KG: 25.0,             // Masa unitaria de bloque de hormigón estándar
    MC4_PAIRS_PER_STRING: 2,             // Pares de conectores MC4 por string (positivo y negativo)
    EARTH_RODS_PER_25KWP: 1,             // Picas de tierra de cobre por cada 25 kWp
    EARTH_WIRE_PER_PANEL_M: 1.2          // Conductor de tierra desnudo o 1x16mm² por panel
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
          totalOptimizers: 0,
          totalMicroinverters: 0,
          totalInverters: 0,
          subtotalEur: 0,
          maxLoadKgM2: 0,
          loadWarning: false
        },
        roofs: [],
        electrical: {
          inverters: [],
          microinverters: [],
          dcPanels: [],
          acPanels: [],
          cables: [],
          grounding: []
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
        const maxLoad = poly.maxStructuralLoadKgM2 || 25.0;
        const stType = poly.structureType || 'coplanar_teja';
        const isTriangular = stType.includes('triangle');
        const estType = stType;
        const structCfg = poly.structureConfig || { type: estType, tiltDeg: isTriangular ? 30.0 : 0.0, azimuthDeg: 180.0 };

        // Single Source of Truth: Priorizar los módulos reales renderizados en 3D para este faldón
        let panels = (typeof root !== 'undefined' && Array.isArray(root.allRenderedPanels) && root.allRenderedPanels.length > 0)
          ? root.allRenderedPanels.filter(p => {
              if (typeof p.polyIdx === 'number') return p.polyIdx === polyIdx;
              if (typeof p.faldonIndex === 'number') return p.faldonIndex === polyIdx;
              return polylines.length <= 1; // Si no hay índice y hay múltiples faldones, evitamos doble conteo
            })
          : (Array.isArray(poly.panels) ? poly.panels : (poly.roofInfo && Array.isArray(poly.roofInfo.panels) ? poly.roofInfo.panels : []));
        
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
          if (p.hasOptimizer || p.optimizerModelId) {
            optimizersInRoof++;
          }
        });

        // Estructura y tornillería paramétrica
        // isTriangular and estType already defined above
        // Cost mappings based on structure type
        const structPriceMap = {
          'coplanar_teja': 28.0,
          'coplanar_chapa': 22.0,
          'triangles_30': 45.0,
          'triangles_15_ew': 48.0
        };
        const structWeightMap = {
          'coplanar_teja': 3.5,
          'coplanar_chapa': 2.5,
          'triangles_30': 6.5,
          'triangles_15_ew': 7.0
        };


        // Clamps: estimación por filas
        const estRows = Math.max(1, Math.ceil(Math.sqrt(panelCount)));
        const midClamps = Math.max(0, (panelCount - estRows) * 2);
        const endClamps = estRows * BOM_DEFAULTS.CLAMPS_PER_ROW_END;

        // Lastres de hormigón (si aplica)
        let ballastBlocks = 0;
        let ballastWeightKg = 0;
        if (isTriangular) {
          const is30Deg = (structCfg.tiltDeg || 0) >= 20 || (estType && estType.includes('30'));
          const ratio = is30Deg ? BOM_DEFAULTS.BALLAST_BLOCKS_PER_PANEL_30 : BOM_DEFAULTS.BALLAST_BLOCKS_PER_PANEL_15;
          ballastBlocks = panelCount * ratio;
          ballastWeightKg = ballastBlocks * BOM_DEFAULTS.BALLAST_WEIGHT_KG;
        }

        // Peso y coste de estructura
        const structItem = (catalog.structures && catalog.structures.find(s => s.type === estType)) || {
          pricePerModule: structPriceMap[estType] || 30.0,
          weightKgPerModule: structWeightMap[estType] || 4.0
        };
        const structCostEur = panelCount * (structItem.pricePerModule || 30.0);
        const structWeightKg = panelCount * (structItem.weightKgPerModule || 4.0);

        // Clamps y tornillos
        const midClampItem = (catalog.fasteners && catalog.fasteners.find(f => f.id === 'clamp_mid')) || { price: 0.85 };
        const endClampItem = (catalog.fasteners && catalog.fasteners.find(f => f.id === 'clamp_end')) || { price: 0.95 };
        const fastenersCostEur = (midClamps * midClampItem.price) + (endClamps * endClampItem.price);

        // Carga por metro cuadrado estimada
        const approxAreaM2 = panelCount * 2.2;
        const totalRoofLoadKg = roofPanelsWeightKg + structWeightKg + ballastWeightKg;
        const loadKgM2 = approxAreaM2 > 0 ? (totalRoofLoadKg / approxAreaM2) : 0;

        const roofNode = {
          id: polyId,
          name: polyName,
          roofType: roofType,
          panelCount: panelCount,
          kwp: parseFloat(roofKwp.toFixed(2)),
          moduleDistribution: moduleCounts,
          optimizersCount: optimizersInRoof,
          structure: {
            type: estType,
            tiltDeg: structCfg.tiltDeg || 15.0,
            costEur: parseFloat(structCostEur.toFixed(2)),
            weightKg: parseFloat(structWeightKg.toFixed(2))
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
          price: 55.0
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
      const isEngineeringStep = (typeof wpCurrentStep === 'undefined' || wpCurrentStep >= 4);
      if (tree.summary.totalPanels > 0 && isEngineeringStep) {
        // ── 4. INVERSORES DE POTENCIA ──────────────────────────────────────────
        const invCount = (projectConfig.autoSizing && projectConfig.autoSizing.inverters && projectConfig.autoSizing.inverters.count) || 1;
        const invId = projectConfig.selectedInverterId || (catalog.inverters && catalog.inverters[0] ? catalog.inverters[0].id : null);
        const invSpec = (catalog.inverters && catalog.inverters.find(i => i.id === invId)) || (catalog.inverters ? catalog.inverters[0] : { kw: 10, price: 1750, brand: 'Inversor' });

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

        // ── 5. CUADROS DE PROTECCIÓN DC Y AC ────────────────────────────────────
        const dcPanelId = projectConfig.selectedProtectionDcId || 'panel_dc_2mppt';
        const acPanelId = projectConfig.selectedProtectionAcId || 'panel_ac_tri_25a';
        const dcPanelSpec = (catalog.electricalPanels && catalog.electricalPanels.find(p => p.id === dcPanelId)) || { model: 'Cuadro DC SPD II', price: 245 };
        const acPanelSpec = (catalog.electricalPanels && catalog.electricalPanels.find(p => p.id === acPanelId)) || { model: 'Cuadro General AC CGBT', price: 295 };

        const dcPanelCost = dcPanelSpec.price || 245;
        const acPanelCost = acPanelSpec.price || 295;
        tree.summary.subtotalEur += (dcPanelCost + acPanelCost);

        tree.electrical.dcPanels.push({ model: dcPanelSpec.model, count: 1, price: dcPanelCost });
        tree.electrical.acPanels.push({ model: acPanelSpec.model, count: 1, price: acPanelCost });

        // ── 6. CABLEADO SOLAR DC & EVACUACIÓN AC ────────────────────────────────
        const estDcLengthM = Math.max(25, tree.summary.totalPanels * 3.5);
        const estAcLengthM = 20.0;
        const dcCableItem = (catalog.cables && catalog.cables.find(c => c.id === (projectConfig.selectedCableDcId || 'cable_dc_zzf_6'))) || { pricePerMeter: 1.85, sec: 6 };
        const acCableItem = (catalog.cables && catalog.cables.find(c => c.id === (projectConfig.selectedCableAcId || 'cable_ac_rvk_5g10'))) || { pricePerMeter: 6.20, sec: 10 };

        const dcCableCost = estDcLengthM * dcCableItem.pricePerMeter;
        const acCableCost = estAcLengthM * acCableItem.pricePerMeter;
        tree.summary.subtotalEur += (dcCableCost + acCableCost);

        tree.electrical.cables.push(
          { type: 'DC ZZ-F 1500V', secMm2: dcCableItem.sec || 6, meters: estDcLengthM, unitPrice: dcCableItem.pricePerMeter, totalEur: parseFloat(dcCableCost.toFixed(2)) },
          { type: 'AC RV-K 0.6/1kV', secMm2: acCableItem.sec || 10, meters: estAcLengthM, unitPrice: acCableItem.pricePerMeter, totalEur: parseFloat(acCableCost.toFixed(2)) }
        );

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

        // ── 8. MANO DE OBRA, MEDIOS AUXILIARES Y TASAS ─────────────────────────
        const laborCostPerModule = 45.0; // Media de mercado de instalación llave en mano
        const engineeringAndPermits = tree.summary.totalKwp > 10 ? 1200.0 : 650.0;
        const craneAndSafety = tree.summary.totalPanels > 30 ? 600.0 : 0.0;
        const totalLabor = (tree.summary.totalPanels * laborCostPerModule) + engineeringAndPermits + craneAndSafety;

        tree.summary.subtotalEur += totalLabor;
        tree.laborAndSoftCosts.push(
          { description: `Montaje mecánico y conexionado eléctrico (${tree.summary.totalPanels} mód.)`, totalEur: tree.summary.totalPanels * laborCostPerModule },
          { description: tree.summary.totalKwp > 10 ? 'Proyecto Técnico de Ingeniero y Dirección de Obra' : 'Memoria Técnica de Diseño (MTD) y Boletín', totalEur: engineeringAndPermits }
        );
        if (craneAndSafety > 0) {
          tree.laborAndSoftCosts.push({ description: 'Medios auxiliares (Líneas de vida provisionales y elevador)', totalEur: craneAndSafety });
        }
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
      if (!hudEl) {
        hudEl = document.createElement('div');
        hudEl.id = 'ra-bom-tree-hud';
        hudEl.className = 'ra-bom-hud-container';
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
            <div class="bom-subitem">📐 Estructura: <i> (${r.structure.tiltDeg}°)</i> · ${r.structure.costEur} €</div>
            <div class="bom-subitem">🔩 Clamps: ${r.clamps.midCount} mid + ${r.clamps.endCount} end · ${r.clamps.costEur} €</div>
            ${r.ballast.blocksCount > 0 ? `<div class="bom-subitem">🧱 Lastre: ${r.ballast.blocksCount} bloques (${r.ballast.totalWeightKg} kg)</div>` : ''}
            <div class="bom-subitem ${r.structuralLoad.isOverloaded ? 'bom-text-danger' : 'bom-text-success'}">
              ⚖️ Sobrecarga: <b>${r.structuralLoad.kgPerM2} kg/m²</b> (Máx. ${r.structuralLoad.maxAllowedKgM2} kg/m²)
            </div>
          </div>
        </div>
      `).join('');

      let invertersHtml = tree.electrical.inverters.length > 0 
        ? tree.electrical.inverters.map(inv => `
            <div class="bom-subitem bom-interactive-item" onclick="BOMTreeEngine.flyToElectrical('inverter')" style="cursor:pointer;" title="Clic para enfocar y seleccionar inversor en 3D">🔄 ${inv.count}x ${inv.brand} ${inv.model} (${inv.kwNominal} kW) · <b>${inv.totalPriceEur} €</b></div>
          `).join('')
        : '<div class="bom-subitem" style="color:var(--text-muted, #94a3b8); font-style:italic;">Sin inversores asignados</div>';
        
      let obstaclesHtml = (tree.obstacles && tree.obstacles.length > 0)
        ? tree.obstacles.map(obs => `
            <div class="bom-subitem bom-interactive-item" onclick="BOMTreeEngine.flyToObstacle('${obs.id}')" style="cursor:pointer; display:flex; justify-content:space-between; align-items:center;" title="Clic para enfocar cámara">
              <span>🛑 ${obs.name} (${obs.type})</span>
              <span style="font-size:8px; color:#94a3b8;">${obs.dimensions}</span>
            </div>
          `).join('')
        : '<div class="bom-subitem" style="color:var(--text-muted, #94a3b8); font-style:italic;">No hay obstáculos en la escena</div>';

      const isEmptyProject = tree.summary.totalPanels === 0;

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
          </div>
          
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
            ${tree.electrical.optimizers ? `<div class="bom-subitem">⚡ ${tree.electrical.optimizers.count}x ${tree.electrical.optimizers.model} · <b>${tree.electrical.optimizers.totalCostEur} €</b></div>` : ''}

            <div class="bom-section-title">CABLEADO, CUADROS & TIERRAS</div>
            ${tree.electrical.dcPanels && tree.electrical.dcPanels.length > 0 ? tree.electrical.dcPanels.map(p => `<div class="bom-subitem bom-interactive-item" onclick="BOMTreeEngine.flyToElectrical('dc_protection')" style="cursor:pointer;" title="Clic para enfocar y seleccionar Cuadro DC en 3D">🔌 ${p.count}x ${p.model} — <b>${p.price} €</b></div>`).join('') : ''}
            ${tree.electrical.acPanels && tree.electrical.acPanels.length > 0 ? tree.electrical.acPanels.map(p => `<div class="bom-subitem bom-interactive-item" onclick="BOMTreeEngine.flyToElectrical('meter')" style="cursor:pointer;" title="Clic para enfocar y seleccionar Cuadro AC / Contador en 3D">🔌 ${p.count}x ${p.model} — <b>${p.price} €</b></div>`).join('') : ''}
            <div class="bom-subitem">📏 Cable DC: ${tree.electrical.cables[0] ? tree.electrical.cables[0].meters + 'm (' + tree.electrical.cables[0].secMm2 + 'mm²)' : '0m'}</div>
            <div class="bom-subitem">🔌 Evacuación AC: ${tree.electrical.cables[1] ? tree.electrical.cables[1].meters + 'm (' + tree.electrical.cables[1].secMm2 + 'mm²)' : '0m'}</div>
          `}

          <div class="bom-section-title">PRODUCCIÓN ANUAL ESTIMADA</div>
          <div style="background:rgba(0,0,0,0.35);border:1px solid rgba(16,185,129,0.25);border-radius:6px;padding:10px;margin-bottom:12px;margin-top:6px;">
            <div class="chart-head-bar" style="display:flex;justify-content:space-between;align-items:center;font-size:11px;margin-bottom:8px;">
              <span style="color:var(--emerald-400);font-weight:bold;"><i data-lucide="bar-chart-2" class="icon-sm"></i> HISTOGRAMA DE GENERACIÓN (kWh)</span>
              <span id="bom-chart-hover-info" style="color:var(--text-slate-400);">Pasa el ratón</span>
            </div>
            <div class="solar-chart-wrap" style="background:rgba(15,23,42,0.6);border-radius:4px;padding:6px;border:1px solid rgba(255,255,255,0.05);">
              <svg class="solar-bar-chart" id="bom-solar-svg-chart" viewBox="0 0 400 120" style="width:100%;height:120px;display:block;"></svg>
            </div>
          </div>
          <div class="bom-total-footer">
            <span>PRESUPUESTO TOTAL (BOM + M.O.):</span>
            <span class="bom-total-price">${tree.summary.subtotalEur.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</span>
          </div>
        </div>
      `;
      if (typeof window.renderSolarBarChart === 'function') {
        setTimeout(() => window.renderSolarBarChart(window.lastMonthlyYields), 50);
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
        hudEl.classList.remove('minimized');
      }
    },

    close: function() {
      if (typeof document === 'undefined') return;
      const hudEl = document.getElementById('ra-bom-tree-hud');
      if (hudEl) {
        hudEl.style.display = 'none';
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
      if (!hudEl || hudEl.style.display === 'none') {
        this.open();
      } else {
        this.close();
      }
    },

    refresh: function() {
      this.renderHUD();
    }
  };

  // Exportar al ámbito global
  root.BOMTreeEngine = BOMTreeEngine;
  if (typeof root.RA !== 'undefined') {
    root.RA.bomEngine = BOMTreeEngine;
  }

})(typeof window !== 'undefined' ? window : global);


