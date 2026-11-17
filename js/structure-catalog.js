/**
 * js/structure-catalog.js — Catálogo Comercial de Estructuras y Costes de Instalación (BOM)
 * =========================================================================================
 * Arquitectura Modular Fotovoltaica AAA (Proyecto RA)
 * - Presets de fabricantes comerciales reales (Sunfer Energy, K2 Systems, Fischer Solar, Personalizado).
 * - Desglose paramétrico de componentes: perfiles, barras 3.15m, empalmes, salvatejas, tornillería EPDM, lastres, clamps.
 * - Desglose de mano de obra (mecánica, eléctrica, puesta en marcha), ingeniería, permisos, medios auxiliares y pequeño material.
 * - Persistencia en localStorage ('ra_structure_catalog' y 'ra_installation_costs').
 * - Integración reactiva con el modal de catálogo (#ra-equipment-catalog-modal) y el Árbol BOM (#bom-tree).
 * =========================================================================================
 */

(function(root) {
  'use strict';

  // ── 1. PRESETS CANÓNICOS DE FABRICANTES DE ESTRUCTURAS ──────────────────────
  const DEFAULT_STRUCTURES = {
    sunfer: {
      id: 'sunfer',
      brand: 'Sunfer Energy',
      country: 'España',
      description: 'Estructuras de aluminio EN AW-6063 T6 y fijaciones Inox A2 para teja, chapa y plana.',
      railPricePerMeter: 9.80,         // €/m lineal
      barLengthM: 3.15,                // m longitud estándar de barra
      splicePrice: 3.20,               // €/ud empalme de carril corredero
      tileHookPrice: 7.50,             // €/ud salvatejas Inox A2 regulable con tornillos
      sheetScrewPrice: 1.80,           // €/ud tornillo autorroscante bimetálico EPDM
      trianglePrice: 24.50,            // €/ud escuadra A-frame premontada
      ballastBlockPrice: 9.50,         // €/ud bloque de hormigón 45kg
      ballastBlockWeightKg: 45.0,      // kg masa unitaria de bloque de hormigón
      endClampPrice: 1.65,             // €/ud grapa final con tornillo Inox
      midClampPrice: 1.45,             // €/ud grapa intermedia con pin de tierra
      tieBarPrice: 8.00                // €/ud viga riostra horizontal de arriostramiento
    },
    k2: {
      id: 'k2',
      brand: 'K2 Systems',
      country: 'Alemania',
      description: 'Sistemas SingleRail 36/50, CrossHook y SpeedRail con certificación estática Eurocódigo.',
      railPricePerMeter: 11.20,
      barLengthM: 3.30,
      splicePrice: 3.80,
      tileHookPrice: 8.40,
      sheetScrewPrice: 2.10,
      trianglePrice: 27.50,
      ballastBlockPrice: 10.50,
      ballastBlockWeightKg: 45.0,
      endClampPrice: 1.85,
      midClampPrice: 1.60,
      tieBarPrice: 9.50
    },
    fischer: {
      id: 'fischer',
      brand: 'Fischer Solar-Fix',
      country: 'Alemania',
      description: 'Gama profesional de fijación forjado/teja y perfilería ligera de aluminio.',
      railPricePerMeter: 9.20,
      barLengthM: 3.15,
      splicePrice: 2.95,
      tileHookPrice: 6.90,
      sheetScrewPrice: 1.65,
      trianglePrice: 22.80,
      ballastBlockPrice: 8.90,
      ballastBlockWeightKg: 45.0,
      endClampPrice: 1.55,
      midClampPrice: 1.35,
      tieBarPrice: 7.80
    },
    custom: {
      id: 'custom',
      brand: 'Personalizado / Taller',
      country: 'Local',
      description: 'Tarifas configurables por el instalador para proveedores locales o marcas propias.',
      railPricePerMeter: 8.50,
      barLengthM: 3.15,
      splicePrice: 3.00,
      tileHookPrice: 7.00,
      sheetScrewPrice: 1.70,
      trianglePrice: 23.00,
      ballastBlockPrice: 9.00,
      ballastBlockWeightKg: 45.0,
      endClampPrice: 1.50,
      midClampPrice: 1.30,
      tieBarPrice: 7.50
    }
  };

  // ── 2. PRESETS CANÓNICOS DE COSTES DE INSTALACIÓN E INGENIERÍA ──────────────
  const DEFAULT_INSTALLATION_COSTS = {
    labor: {
      mechanicalHoursPerPanel: 0.85,    // Horas oficial montaje mecánico de perfilería y paneles
      electricalHoursPerPanel: 0.55,    // Horas oficial conexionado strings DC, protecciones y AC
      commissioningHoursFixed: 4.0,     // Horas fijas de puesta en marcha, test de aislamiento y REBT
      hourlyRate: 32.00                 // Tarifa oficial de 1ª especialista solar (€/h)
    },
    engineering: {
      technicalProject: 450.00,         // Memoria técnica de diseño (MTD) / Proyecto de ingeniero visado
      siteSupervision: 250.00,          // Dirección de obra y coordinación de seguridad
      adminCIE: 180.00                  // Tramitación administrativa, legalización y boletín eléctrico CIE
    },
    permits: {
      urbanPermitRatePct: 3.5,          // % ICIO / tasa municipal sobre el presupuesto de ejecución material (PEM)
      urbanPermitFixed: 85.00,          // Tasa fija de comunicación previa de obras
      wasteDeposit: 120.00              // Fianza de gestión de residuos de construcción y demolición
    },
    auxiliary: {
      lifelineSafety: 280.00,           // Línea de vida provisional, anclajes y EPIs contra caídas
      scaffoldingLift: 350.00           // Medios auxiliares (andamio homologado o plataforma elevadora)
    },
    smallMaterials: {
      perPanelSmallMaterials: 6.50      // Conectores MC4 Stäubli, tubo corrugado UV, bridas y puesta a tierra (€/panel)
    }
  };

  // ── 3. ESTADO EN MEMORIA Y PERSISTENCIA ─────────────────────────────────────
  let structuresState = loadStructuresState();
  let installationCostsState = loadInstallationCostsState();
  let activeGlobalManufacturer = 'sunfer';

  function loadStructuresState() {
    try {
      const raw = localStorage.getItem('ra_structure_catalog');
      if (raw) {
        const parsed = JSON.parse(raw);
        const merged = Object.assign({}, DEFAULT_STRUCTURES);
        Object.keys(DEFAULT_STRUCTURES).forEach(k => {
          merged[k] = Object.assign({}, DEFAULT_STRUCTURES[k], parsed[k] || {});
          if (!merged[k].ballastBlockWeightKg || typeof merged[k].ballastBlockWeightKg !== 'number') {
            merged[k].ballastBlockWeightKg = DEFAULT_STRUCTURES[k].ballastBlockWeightKg || 45.0;
          }
        });
        return merged;
      }
    } catch (e) {
      console.warn('[RA-STRUCTURE-CATALOG] Error al cargar localStorage:', e);
    }
    return JSON.parse(JSON.stringify(DEFAULT_STRUCTURES));
  }

  function loadInstallationCostsState() {
    try {
      const raw = localStorage.getItem('ra_installation_costs');
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          labor: Object.assign({}, DEFAULT_INSTALLATION_COSTS.labor, parsed.labor || {}),
          engineering: Object.assign({}, DEFAULT_INSTALLATION_COSTS.engineering, parsed.engineering || {}),
          permits: Object.assign({}, DEFAULT_INSTALLATION_COSTS.permits, parsed.permits || {}),
          auxiliary: Object.assign({}, DEFAULT_INSTALLATION_COSTS.auxiliary, parsed.auxiliary || {}),
          smallMaterials: Object.assign({}, DEFAULT_INSTALLATION_COSTS.smallMaterials, parsed.smallMaterials || {})
        };
      }
    } catch (e) {
      console.warn('[RA-INSTALLATION-COSTS] Error al cargar localStorage:', e);
    }
    return JSON.parse(JSON.stringify(DEFAULT_INSTALLATION_COSTS));
  }

  function saveStructuresState() {
    try {
      localStorage.setItem('ra_structure_catalog', JSON.stringify(structuresState));
    } catch (e) {}
    if (root.BOMTreeEngine && typeof root.BOMTreeEngine.refresh === 'function') {
      root.BOMTreeEngine.refresh();
    }
  }

  function saveInstallationCostsState() {
    try {
      localStorage.setItem('ra_installation_costs', JSON.stringify(installationCostsState));
    } catch (e) {}
    if (root.BOMTreeEngine && typeof root.BOMTreeEngine.refresh === 'function') {
      root.BOMTreeEngine.refresh();
    }
  }

  // ── 4. API PÚBLICA ──────────────────────────────────────────────────────────
  const RAStructureCatalog = {
    getStructures: function() {
      return structuresState;
    },

    getStructure: function(id) {
      return structuresState[id] || structuresState[activeGlobalManufacturer] || structuresState.sunfer;
    },

    getInstallationCosts: function() {
      return installationCostsState;
    },

    getActiveManufacturer: function(polyIdx) {
      if (typeof polyIdx === 'number' && root.WP && root.WP.polylines && root.WP.polylines[polyIdx]) {
        return root.WP.polylines[polyIdx].structureManufacturer || activeGlobalManufacturer;
      }
      return activeGlobalManufacturer;
    },

    setActiveManufacturer: function(mfgId, polyIdx) {
      if (!structuresState[mfgId]) return;
      if (typeof polyIdx === 'number' && root.WP && root.WP.polylines && root.WP.polylines[polyIdx]) {
        root.WP.polylines[polyIdx].structureManufacturer = mfgId;
      } else {
        activeGlobalManufacturer = mfgId;
      }
      if (root.BOMTreeEngine && typeof root.BOMTreeEngine.refresh === 'function') {
        root.BOMTreeEngine.refresh();
      }
    },

    setPolyManufacturer: function(polyIdx, mfgId) {
      if (!structuresState[mfgId]) return;
      if (typeof polyIdx === 'number' && root.WP && root.WP.polylines && root.WP.polylines[polyIdx]) {
        root.WP.polylines[polyIdx].structureManufacturer = mfgId;
      }
      if (root.BOMTreeEngine && typeof root.BOMTreeEngine.refresh === 'function') {
        root.BOMTreeEngine.refresh();
      }
      if (root.showStatus) {
        root.showStatus('FABRICANTE DE ESTRUCTURA (FALDÓN #' + ((polyIdx || 0) + 1) + '): ' + (structuresState[mfgId] ? structuresState[mfgId].brand.toUpperCase() : mfgId), 2000);
      }
    },

    updatePrice: function(mfgId, field, value) {
      if (!structuresState[mfgId]) return;
      const num = parseFloat(value);
      if (!isNaN(num) && num >= 0) {
        structuresState[mfgId][field] = num;
        saveStructuresState();
      }
    },

    updateInstallationCost: function(category, field, value) {
      if (!installationCostsState[category]) return;
      const num = parseFloat(value);
      if (!isNaN(num) && num >= 0) {
        installationCostsState[category][field] = num;
        saveInstallationCostsState();
      }
    },

    resetStructures: function() {
      structuresState = JSON.parse(JSON.stringify(DEFAULT_STRUCTURES));
      saveStructuresState();
      this.renderStructuresCatalogUI();
      if (root.showStatus) root.showStatus('CATÁLOGO DE ESTRUCTURAS RESTAURADO', 2000);
    },

    resetInstallationCosts: function() {
      installationCostsState = JSON.parse(JSON.stringify(DEFAULT_INSTALLATION_COSTS));
      saveInstallationCostsState();
      this.renderInstallationCostsUI();
      if (root.showStatus) root.showStatus('COSTES DE INSTALACIÓN RESTAURADOS', 2000);
    },

    // ── 5. RENDERIZADO DE INTERFAZ EN EL MODAL DE EQUIPOS ─────────────────────
    
    getStructurePartItem: function(partKey) {
      const currentMfg = activeGlobalManufacturer || 'sunfer';
      const mfg = structuresState[currentMfg] || structuresState.sunfer;
      const partNames = {
        railPricePerMeter: 'Perfil carril guía de aluminio 40x40 EN AW-6063 T6 (m lineal)',
        splicePrice: 'Pieza corredera de empalme de carril con tornillos Inox A2',
        tileHookPrice: 'Salvatejas regulable Inox A2 (cubierta teja)',
        sheetScrewPrice: 'Tornillo autorroscante bimetálico EPDM (cubierta chapa)',
        trianglePrice: 'Escuadra A-Frame de aluminio premontada (plana/suelo)',
        ballastBlockPrice: 'Bloque prefabricado de hormigón para lastre',
        endClampPrice: 'Grapa final de aluminio anodizado (End Clamp)',
        midClampPrice: 'Grapa intermedia con puesta a tierra (Mid Clamp)',
        tieBarPrice: 'Viga riostra horizontal de arriostramiento'
      };
      if (mfg && mfg[partKey] !== undefined) {
        return {
          id: partKey,
          brand: mfg.brand,
          model: partNames[partKey] || partKey,
          price: mfg[partKey],
          partKey: partKey,
          mfgId: currentMfg
        };
      }
      return null;
    },

    saveStructurePartItem: function(partKey, price) {
      const currentMfg = activeGlobalManufacturer || 'sunfer';
      if (structuresState[currentMfg] && structuresState[currentMfg][partKey] !== undefined) {
        const num = parseFloat(price);
        if (!isNaN(num) && num >= 0) {
          structuresState[currentMfg][partKey] = num;
          saveStructuresState();
          this.renderStructuresCatalogUI();
          return true;
        }
      }
      return false;
    },

    getInstallationCostItem: function(itemKey) {
      const parts = itemKey.split('.');
      if (parts.length === 2) {
        const cat = parts[0];
        const field = parts[1];
        if (installationCostsState[cat] && installationCostsState[cat][field] !== undefined) {
          const names = {
            'labor.mechanicalHoursPerPanel': 'Mano de Obra: Montaje mecánico (h/mód)',
            'labor.electricalHoursPerPanel': 'Mano de Obra: Conexionado eléctrico DC/AC (h/mód)',
            'labor.commissioningHoursFixed': 'Mano de Obra: Puesta en marcha fija (h)',
            'labor.hourlyRate': 'Mano de Obra: Tarifa horaria oficial (€/h)',
            'engineering.technicalProject': 'Ingeniería: Memoria Técnica / Proyecto visado (€)',
            'engineering.siteSupervision': 'Ingeniería: Dirección facultativa de obra (€)',
            'engineering.adminCIE': 'Ingeniería: Tramitación legal / CIE / Distribuidora (€)',
            'permits.urbanPermitFixed': 'Permisos: Tasa urbanística municipal fija (€)',
            'permits.wasteDeposit': 'Permisos: Fianza de gestión de residuos (€)',
            'permits.urbanPermitRatePct': 'Permisos: Impuesto ICIO (% sobre PEM)',
            'auxiliary.lifelineSafety': 'Seguridad: Línea de vida provisional y EPIs (€)',
            'auxiliary.scaffoldingLift': 'Seguridad: Medios auxiliares (andamio/elevador) (€)',
            'smallMaterials.perPanelSmallMaterials': 'Material: Pequeño material eléctrico (€/mód)'
          };
          return {
            id: itemKey,
            brand: 'Instalación & Soft Costs',
            model: names[itemKey] || itemKey,
            price: installationCostsState[cat][field],
            category: cat,
            field: field
          };
        }
      }
      return null;
    },

    saveInstallationCostItem: function(itemKey, value) {
      const parts = itemKey.split('.');
      if (parts.length === 2) {
        const cat = parts[0];
        const field = parts[1];
        if (installationCostsState[cat] && installationCostsState[cat][field] !== undefined) {
          const num = parseFloat(value);
          if (!isNaN(num) && num >= 0) {
            installationCostsState[cat][field] = num;
            saveInstallationCostsState();
            this.renderInstallationCostsUI();
            return true;
          }
        }
      }
      return false;
    },

    renderStructuresCatalogUI: function(container) {
      const pane = container || document.getElementById('cat-pane-structures');
      if (!pane) return;

      const currentMfg = activeGlobalManufacturer || 'sunfer';
      const mfg = structuresState[currentMfg] || structuresState.sunfer;

      let html = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,0.08);">
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:11px;font-weight:700;color:var(--text-slate-300);">FABRICANTE ACTIVO:</span>
            <div style="display:flex;gap:4px;">
              ${Object.keys(structuresState).map(k => {
                const s = structuresState[k];
                const isActive = (k === currentMfg);
                return `
                  <button type="button" class="cat-btn ${isActive ? 'cat-btn-edit' : ''}" style="padding:4px 10px;font-size:10px;${isActive ? 'background:rgba(56,189,248,0.2);color:#38BDF8;' : 'color:#94A3B8;'}" onclick="RAStructureCatalog.setActiveManufacturer('${k}'); RAStructureCatalog.renderStructuresCatalogUI();">
                    ${s.brand}
                  </button>
                `;
              }).join('')}
            </div>
          </div>
          <button type="button" class="cat-btn" style="color:var(--text-slate-400);font-size:10px;" onclick="RAStructureCatalog.resetStructures()">
            ↩ Restaurar Precios Fábrica
          </button>
        </div>

        <div style="background:rgba(30,41,59,0.3);border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:12px;margin-bottom:14px;">
          <div style="font-weight:800;font-size:12px;color:#fff;margin-bottom:2px;">${mfg.brand} (${mfg.country})</div>
          <div style="font-size:10px;color:var(--text-slate-400);">${mfg.description}</div>
        </div>

        <div class="cat-table-wrap">
          <table class="cat-table">
            <thead>
              <tr>
                <th style="width:40%;">Componente / Partida Técnica</th>
                <th style="text-align:center;width:10%;">Unidad</th>
                <th style="text-align:center;width:25%;">Formato Comercial</th>
                <th style="text-align:center;width:12%;">Precio (€)</th>
                <th style="text-align:right;width:13%;">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><b>Perfil carril guía de aluminio 40x40 EN AW-6063 T6</b></td>
                <td style="text-align:center;"><span class="cat-badge cat-badge-blue">m lineal</span></td>
                <td style="text-align:center;color:#38BDF8;">Barras de ${mfg.barLengthM.toFixed(2)} m (${(mfg.railPricePerMeter * mfg.barLengthM).toFixed(2)} €/barra)</td>
                <td style="text-align:center;font-weight:bold;color:#FBBF24;">${mfg.railPricePerMeter.toFixed(2)} €</td>
                <td style="text-align:right;">
                  <button class="cat-btn cat-btn-edit" onclick="if(window.openEditEquipmentModal) window.openEditEquipmentModal('structures', 'railPricePerMeter');"><i data-lucide="edit-2" class="icon-sm"></i> EDITAR</button>
                </td>
              </tr>
              <tr>
                <td><b>Pieza corredera de empalme de carril con tornillos Inox A2</b></td>
                <td style="text-align:center;"><span class="cat-badge cat-badge-blue">ud</span></td>
                <td style="text-align:center;color:var(--text-slate-400);">Kit unión con prisioneros</td>
                <td style="text-align:center;font-weight:bold;color:#FBBF24;">${mfg.splicePrice.toFixed(2)} €</td>
                <td style="text-align:right;">
                  <button class="cat-btn cat-btn-edit" onclick="if(window.openEditEquipmentModal) window.openEditEquipmentModal('structures', 'splicePrice');"><i data-lucide="edit-2" class="icon-sm"></i> EDITAR</button>
                </td>
              </tr>
              <tr>
                <td><b>Salvatejas regulable Inox A2 (cubierta teja)</b></td>
                <td style="text-align:center;"><span class="cat-badge cat-badge-blue">ud</span></td>
                <td style="text-align:center;color:var(--text-slate-400);">Regulable con tirafondos forjado</td>
                <td style="text-align:center;font-weight:bold;color:#FBBF24;">${mfg.tileHookPrice.toFixed(2)} €</td>
                <td style="text-align:right;">
                  <button class="cat-btn cat-btn-edit" onclick="if(window.openEditEquipmentModal) window.openEditEquipmentModal('structures', 'tileHookPrice');"><i data-lucide="edit-2" class="icon-sm"></i> EDITAR</button>
                </td>
              </tr>
              <tr>
                <td><b>Tornillo autorroscante bimetálico EPDM (cubierta chapa)</b></td>
                <td style="text-align:center;"><span class="cat-badge cat-badge-blue">ud</span></td>
                <td style="text-align:center;color:var(--text-slate-400);">Fijación greca cubierta chapa</td>
                <td style="text-align:center;font-weight:bold;color:#FBBF24;">${mfg.sheetScrewPrice.toFixed(2)} €</td>
                <td style="text-align:right;">
                  <button class="cat-btn cat-btn-edit" onclick="if(window.openEditEquipmentModal) window.openEditEquipmentModal('structures', 'sheetScrewPrice');"><i data-lucide="edit-2" class="icon-sm"></i> EDITAR</button>
                </td>
              </tr>
              <tr>
                <td><b>Escuadra A-Frame de aluminio premontada (plana/suelo)</b></td>
                <td style="text-align:center;"><span class="cat-badge cat-badge-blue">ud</span></td>
                <td style="text-align:center;color:var(--text-slate-400);">Triángulo 15º / 30º con tornillería</td>
                <td style="text-align:center;font-weight:bold;color:#FBBF24;">${mfg.trianglePrice.toFixed(2)} €</td>
                <td style="text-align:right;">
                  <button class="cat-btn cat-btn-edit" onclick="if(window.openEditEquipmentModal) window.openEditEquipmentModal('structures', 'trianglePrice');"><i data-lucide="edit-2" class="icon-sm"></i> EDITAR</button>
                </td>
              </tr>
              <tr>
                <td><b>Bloque prefabricado de hormigón para lastre (cubierta plana)</b></td>
                <td style="text-align:center;"><span class="cat-badge cat-badge-blue">ud</span></td>
                <td style="text-align:center;color:#38BDF8;">Masa: ${(mfg.ballastBlockWeightKg || 45).toFixed(0)} kg</td>
                <td style="text-align:center;font-weight:bold;color:#FBBF24;">${mfg.ballastBlockPrice.toFixed(2)} €</td>
                <td style="text-align:right;">
                  <button class="cat-btn cat-btn-edit" onclick="if(window.openEditEquipmentModal) window.openEditEquipmentModal('structures', 'ballastBlockPrice');"><i data-lucide="edit-2" class="icon-sm"></i> EDITAR</button>
                </td>
              </tr>
              <tr>
                <td><b>Grapa final de aluminio anodizado (End Clamp)</b></td>
                <td style="text-align:center;"><span class="cat-badge cat-badge-blue">ud</span></td>
                <td style="text-align:center;color:var(--text-slate-400);">Extremos de fila de módulos</td>
                <td style="text-align:center;font-weight:bold;color:#FBBF24;">${mfg.endClampPrice.toFixed(2)} €</td>
                <td style="text-align:right;">
                  <button class="cat-btn cat-btn-edit" onclick="if(window.openEditEquipmentModal) window.openEditEquipmentModal('structures', 'endClampPrice');"><i data-lucide="edit-2" class="icon-sm"></i> EDITAR</button>
                </td>
              </tr>
              <tr>
                <td><b>Grapa intermedia con puesta a tierra (Mid Clamp)</b></td>
                <td style="text-align:center;"><span class="cat-badge cat-badge-blue">ud</span></td>
                <td style="text-align:center;color:var(--text-slate-400);">Unión entre paneles contiguos</td>
                <td style="text-align:center;font-weight:bold;color:#FBBF24;">${mfg.midClampPrice.toFixed(2)} €</td>
                <td style="text-align:right;">
                  <button class="cat-btn cat-btn-edit" onclick="if(window.openEditEquipmentModal) window.openEditEquipmentModal('structures', 'midClampPrice');"><i data-lucide="edit-2" class="icon-sm"></i> EDITAR</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      `;

      pane.innerHTML = html;
      if (typeof lucide !== 'undefined' && lucide.createIcons) {
        try { lucide.createIcons(); } catch(e){}
      }
    },

    renderInstallationCostsUI: function(container) {
      const pane = container || document.getElementById('cat-pane-installation_costs');
      if (!pane) return;

      const costs = installationCostsState;
      const totalPanels = (root.allRenderedPanels && root.allRenderedPanels.length > 0) ? root.allRenderedPanels.length : 12;

      const mechH = parseFloat((totalPanels * costs.labor.mechanicalHoursPerPanel).toFixed(1));
      const elecH = parseFloat((totalPanels * costs.labor.electricalHoursPerPanel).toFixed(1));
      const commH = costs.labor.commissioningHoursFixed;
      const totalH = parseFloat((mechH + elecH + commH).toFixed(1));
      const laborTotal = parseFloat((totalH * costs.labor.hourlyRate).toFixed(2));

      const engTotal = costs.engineering.technicalProject + costs.engineering.siteSupervision + costs.engineering.adminCIE;
      const permitsTotal = costs.permits.urbanPermitFixed + costs.permits.wasteDeposit;
      const auxTotal = costs.auxiliary.lifelineSafety + costs.auxiliary.scaffoldingLift;
      const smallMatTotal = parseFloat((totalPanels * costs.smallMaterials.perPanelSmallMaterials).toFixed(2));

      let html = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,0.08);">
          <div style="font-size:11px;font-weight:700;color:var(--text-slate-300);">
            DESGLOSE ECONÓMICO DE MANO DE OBRA, INGENIERÍA Y GASTOS DIRECTOS
          </div>
          <button type="button" class="cat-btn" style="color:var(--text-slate-400);font-size:10px;" onclick="RAStructureCatalog.resetInstallationCosts()">
            ↩ Restaurar Valores Fábrica
          </button>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;">
          
          <!-- Bloque 1: Mano de Obra -->
          <div style="background:rgba(30,41,59,0.3);border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:12px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
              <span style="font-weight:800;font-size:11.5px;color:#38BDF8;">👷 Mano de Obra Especialista</span>
              <span class="cat-badge cat-badge-cyan">${laborTotal.toFixed(2)} €</span>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;font-size:10.5px;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="color:var(--text-slate-300);">Montaje mecánico estructura:</span>
                <div style="display:flex;align-items:center;gap:6px;">
                  <span style="font-size:10.5px;color:#fff;font-weight:600;">${costs.labor.mechanicalHoursPerPanel} h/mód</span>
                  <button class="cat-btn cat-btn-edit" onclick="if(window.openEditEquipmentModal) window.openEditEquipmentModal('installation_costs', 'labor.mechanicalHoursPerPanel');"><i data-lucide="edit-2" class="icon-sm"></i></button>
                </div>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="color:var(--text-slate-300);">Conexionado eléctrico DC/AC:</span>
                <div style="display:flex;align-items:center;gap:6px;">
                  <span style="font-size:10.5px;color:#fff;font-weight:600;">${costs.labor.electricalHoursPerPanel} h/mód</span>
                  <button class="cat-btn cat-btn-edit" onclick="if(window.openEditEquipmentModal) window.openEditEquipmentModal('installation_costs', 'labor.electricalHoursPerPanel');"><i data-lucide="edit-2" class="icon-sm"></i></button>
                </div>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="color:var(--text-slate-300);">Puesta en marcha y verificación:</span>
                <div style="display:flex;align-items:center;gap:6px;">
                  <span style="font-size:10.5px;color:#fff;font-weight:600;">${costs.labor.commissioningHoursFixed} h fijas</span>
                  <button class="cat-btn cat-btn-edit" onclick="if(window.openEditEquipmentModal) window.openEditEquipmentModal('installation_costs', 'labor.commissioningHoursFixed');"><i data-lucide="edit-2" class="icon-sm"></i></button>
                </div>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px dashed rgba(255,255,255,0.1);padding-top:6px;">
                <span style="color:#F59E0B;font-weight:700;">Tarifa horaria oficial:</span>
                <div style="display:flex;align-items:center;gap:6px;">
                  <span style="font-size:11px;color:#F59E0B;font-weight:bold;">${costs.labor.hourlyRate.toFixed(2)} €/h</span>
                  <button class="cat-btn cat-btn-edit" onclick="if(window.openEditEquipmentModal) window.openEditEquipmentModal('installation_costs', 'labor.hourlyRate');"><i data-lucide="edit-2" class="icon-sm"></i></button>
                </div>
              </div>
            </div>
          </div>

          <!-- Bloque 2: Ingeniería y Legalización -->
          <div style="background:rgba(30,41,59,0.3);border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:12px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
              <span style="font-weight:800;font-size:11.5px;color:#A78BFA;">📐 Ingeniería y Legalización</span>
              <span class="cat-badge cat-badge-purple">${engTotal.toFixed(2)} €</span>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;font-size:10.5px;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="color:var(--text-slate-300);">Memoria Técnica / Proyecto visado:</span>
                <div style="display:flex;align-items:center;gap:6px;">
                  <span style="font-size:10.5px;color:#fff;font-weight:600;">${costs.engineering.technicalProject.toFixed(2)} €</span>
                  <button class="cat-btn cat-btn-edit" onclick="if(window.openEditEquipmentModal) window.openEditEquipmentModal('installation_costs', 'engineering.technicalProject');"><i data-lucide="edit-2" class="icon-sm"></i></button>
                </div>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="color:var(--text-slate-300);">Dirección facultativa de obra:</span>
                <div style="display:flex;align-items:center;gap:6px;">
                  <span style="font-size:10.5px;color:#fff;font-weight:600;">${costs.engineering.siteSupervision.toFixed(2)} €</span>
                  <button class="cat-btn cat-btn-edit" onclick="if(window.openEditEquipmentModal) window.openEditEquipmentModal('installation_costs', 'engineering.siteSupervision');"><i data-lucide="edit-2" class="icon-sm"></i></button>
                </div>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="color:var(--text-slate-300);">Tramitación y Boletín CIE:</span>
                <div style="display:flex;align-items:center;gap:6px;">
                  <span style="font-size:10.5px;color:#fff;font-weight:600;">${costs.engineering.adminCIE.toFixed(2)} €</span>
                  <button class="cat-btn cat-btn-edit" onclick="if(window.openEditEquipmentModal) window.openEditEquipmentModal('installation_costs', 'engineering.adminCIE');"><i data-lucide="edit-2" class="icon-sm"></i></button>
                </div>
              </div>
            </div>
          </div>

          <!-- Bloque 3: Permisos y Tasas -->
          <div style="background:rgba(30,41,59,0.3);border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:12px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
              <span style="font-weight:800;font-size:11.5px;color:#F59E0B;">🏛️ Permisos y Tasas Municipales</span>
              <span class="cat-badge cat-badge-amber">${permitsTotal.toFixed(2)} €</span>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;font-size:10.5px;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="color:var(--text-slate-300);">Comunicación previa / Tasa urbanística:</span>
                <div style="display:flex;align-items:center;gap:6px;">
                  <span style="font-size:10.5px;color:#fff;font-weight:600;">${costs.permits.urbanPermitFixed.toFixed(2)} €</span>
                  <button class="cat-btn cat-btn-edit" onclick="if(window.openEditEquipmentModal) window.openEditEquipmentModal('installation_costs', 'permits.urbanPermitFixed');"><i data-lucide="edit-2" class="icon-sm"></i></button>
                </div>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="color:var(--text-slate-300);">Fianza de gestión de residuos:</span>
                <div style="display:flex;align-items:center;gap:6px;">
                  <span style="font-size:10.5px;color:#fff;font-weight:600;">${costs.permits.wasteDeposit.toFixed(2)} €</span>
                  <button class="cat-btn cat-btn-edit" onclick="if(window.openEditEquipmentModal) window.openEditEquipmentModal('installation_costs', 'permits.wasteDeposit');"><i data-lucide="edit-2" class="icon-sm"></i></button>
                </div>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="color:var(--text-slate-300);">Impuesto ICIO (% sobre PEM):</span>
                <div style="display:flex;align-items:center;gap:6px;">
                  <span style="font-size:10.5px;color:#fff;font-weight:600;">${costs.permits.urbanPermitRatePct.toFixed(2)} %</span>
                  <button class="cat-btn cat-btn-edit" onclick="if(window.openEditEquipmentModal) window.openEditEquipmentModal('installation_costs', 'permits.urbanPermitRatePct');"><i data-lucide="edit-2" class="icon-sm"></i></button>
                </div>
              </div>
            </div>
          </div>

          <!-- Bloque 4: Medios Auxiliares y Seguridad -->
          <div style="background:rgba(30,41,59,0.3);border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:12px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
              <span style="font-weight:800;font-size:11.5px;color:#10B981;">🦺 Seguridad y Pequeño Material</span>
              <span class="cat-badge cat-badge-emerald">${(auxTotal + smallMatTotal).toFixed(2)} €</span>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;font-size:10.5px;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="color:var(--text-slate-300);">Línea de vida provisional y EPIs:</span>
                <div style="display:flex;align-items:center;gap:6px;">
                  <span style="font-size:10.5px;color:#fff;font-weight:600;">${costs.auxiliary.lifelineSafety.toFixed(2)} €</span>
                  <button class="cat-btn cat-btn-edit" onclick="if(window.openEditEquipmentModal) window.openEditEquipmentModal('installation_costs', 'auxiliary.lifelineSafety');"><i data-lucide="edit-2" class="icon-sm"></i></button>
                </div>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="color:var(--text-slate-300);">Medios auxiliares (andamio / elevador):</span>
                <div style="display:flex;align-items:center;gap:6px;">
                  <span style="font-size:10.5px;color:#fff;font-weight:600;">${costs.auxiliary.scaffoldingLift.toFixed(2)} €</span>
                  <button class="cat-btn cat-btn-edit" onclick="if(window.openEditEquipmentModal) window.openEditEquipmentModal('installation_costs', 'auxiliary.scaffoldingLift');"><i data-lucide="edit-2" class="icon-sm"></i></button>
                </div>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px dashed rgba(255,255,255,0.1);padding-top:6px;">
                <span style="color:var(--text-slate-300);">Pequeño material eléctrico (${totalPanels} mód.):</span>
                <div style="display:flex;align-items:center;gap:6px;">
                  <span style="font-size:10.5px;color:#fff;font-weight:600;">${costs.smallMaterials.perPanelSmallMaterials.toFixed(2)} €/mód</span>
                  <button class="cat-btn cat-btn-edit" onclick="if(window.openEditEquipmentModal) window.openEditEquipmentModal('installation_costs', 'smallMaterials.perPanelSmallMaterials');"><i data-lucide="edit-2" class="icon-sm"></i></button>
                </div>
              </div>
            </div>
          </div>

        </div>
      `;

      pane.innerHTML = html;
      if (typeof lucide !== 'undefined' && lucide.createIcons) {
        try { lucide.createIcons(); } catch(e){}
      }
    }
  };

  root.RAStructureCatalog = RAStructureCatalog;

})(typeof window !== 'undefined' ? window : this);
