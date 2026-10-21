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
      activeGlobalManufacturer = mfgId;
      if (typeof polyIdx === 'number' && root.WP && root.WP.polylines && root.WP.polylines[polyIdx]) {
        root.WP.polylines[polyIdx].structureManufacturer = mfgId;
      }
      if (root.BOMTreeEngine && typeof root.BOMTreeEngine.refresh === 'function') {
        root.BOMTreeEngine.refresh();
      }
    },

    setPolyManufacturer: function(polyIdx, mfgId) {
      this.setActiveManufacturer(mfgId, polyIdx);
      if (root.showStatus) {
        root.showStatus('FABRICANTE DE ESTRUCTURA: ' + (structuresState[mfgId] ? structuresState[mfgId].brand.toUpperCase() : mfgId), 2000);
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
                  <button type="button" class="doc-mini-btn" style="padding:4px 10px;font-size:10px;font-weight:${isActive ? '900' : '600'};background:${isActive ? 'rgba(56,189,248,0.2)' : 'rgba(0,0,0,0.3)'};color:${isActive ? '#38BDF8' : '#94A3B8'};border-color:${isActive ? '#38BDF8' : 'rgba(255,255,255,0.1)'};" onclick="RAStructureCatalog.setActiveManufacturer('${k}'); RAStructureCatalog.renderStructuresCatalogUI();">
                    ${s.brand}
                  </button>
                `;
              }).join('')}
            </div>
          </div>
          <button type="button" class="doc-mini-btn" style="color:var(--text-slate-400);font-size: 10px;" onclick="RAStructureCatalog.resetStructures()">
            ↩ Restaurar Precios Fábrica
          </button>
        </div>

        <div style="background:rgba(30,41,59,0.3);border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:12px;margin-bottom:14px;">
          <div style="font-weight:800;font-size:12px;color:#fff;margin-bottom:2px;">${mfg.brand} (${mfg.country})</div>
          <div style="font-size:10px;color:var(--text-slate-400);">${mfg.description}</div>
        </div>

        <table style="width:100%;border-collapse:collapse;text-align:left;font-size:11px;">
          <thead>
            <tr style="border-bottom:2px solid #334155;color:var(--text-slate-400);font-size: 10px;text-transform:uppercase;">
              <th style="padding:6px 10px;">Componente / Partida Técnica</th>
              <th style="padding:6px 10px;text-align:center;">Unidad</th>
              <th style="padding:6px 10px;text-align:center;">Formato Comercial</th>
              <th style="padding:6px 10px;text-align:right;">Precio Unitario (€)</th>
            </tr>
          </thead>
          <tbody>
            <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
              <td style="padding:7px 10px;font-weight:600;color:#fff;">Perfil carril guía de aluminio 40x40 EN AW-6063 T6</td>
              <td style="padding:7px 10px;text-align:center;color:var(--text-slate-400);">m lineal</td>
              <td style="padding:7px 10px;text-align:center;color:#38BDF8;">Barras de ${mfg.barLengthM.toFixed(2)} m (${(mfg.railPricePerMeter * mfg.barLengthM).toFixed(2)} €/barra)</td>
              <td style="padding:7px 10px;text-align:right;">
                <input type="number" step="0.10" min="0" value="${mfg.railPricePerMeter.toFixed(2)}" style="width:75px;padding:3px 6px;font-size:11px;background:#0F172A;border:1px solid #334155;color:#F8FAFC;border-radius:4px;text-align:right;" onchange="RAStructureCatalog.updatePrice('${currentMfg}', 'railPricePerMeter', this.value)">
              </td>
            </tr>
            <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
              <td style="padding:7px 10px;font-weight:600;color:#fff;">Pieza corredera de empalme de carril con tornillos Inox A2</td>
              <td style="padding:7px 10px;text-align:center;color:var(--text-slate-400);">ud</td>
              <td style="padding:7px 10px;text-align:center;color:var(--text-slate-400);">Kit unión con prisioneros</td>
              <td style="padding:7px 10px;text-align:right;">
                <input type="number" step="0.10" min="0" value="${mfg.splicePrice.toFixed(2)}" style="width:75px;padding:3px 6px;font-size:11px;background:#0F172A;border:1px solid #334155;color:#F8FAFC;border-radius:4px;text-align:right;" onchange="RAStructureCatalog.updatePrice('${currentMfg}', 'splicePrice', this.value)">
              </td>
            </tr>
            <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
              <td style="padding:7px 10px;font-weight:600;color:#fff;">Salvatejas regulable Inox A2 (fijación cubierta de teja)</td>
              <td style="padding:7px 10px;text-align:center;color:var(--text-slate-400);">ud</td>
              <td style="padding:7px 10px;text-align:center;color:var(--text-slate-400);">Regulable con tirafondos forjado</td>
              <td style="padding:7px 10px;text-align:right;">
                <input type="number" step="0.10" min="0" value="${mfg.tileHookPrice.toFixed(2)}" style="width:75px;padding:3px 6px;font-size:11px;background:#0F172A;border:1px solid #334155;color:#F8FAFC;border-radius:4px;text-align:right;" onchange="RAStructureCatalog.updatePrice('${currentMfg}', 'tileHookPrice', this.value)">
              </td>
            </tr>
            <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
              <td style="padding:7px 10px;font-weight:600;color:#fff;">Tornillo autorroscante bimetálico con arandela vulcanizada EPDM</td>
              <td style="padding:7px 10px;text-align:center;color:var(--text-slate-400);">ud</td>
              <td style="padding:7px 10px;text-align:center;color:var(--text-slate-400);">Fijación greca cubierta chapa</td>
              <td style="padding:7px 10px;text-align:right;">
                <input type="number" step="0.05" min="0" value="${mfg.sheetScrewPrice.toFixed(2)}" style="width:75px;padding:3px 6px;font-size:11px;background:#0F172A;border:1px solid #334155;color:#F8FAFC;border-radius:4px;text-align:right;" onchange="RAStructureCatalog.updatePrice('${currentMfg}', 'sheetScrewPrice', this.value)">
              </td>
            </tr>
            <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
              <td style="padding:7px 10px;font-weight:600;color:#fff;">Escuadra A-Frame de aluminio premontada (cubierta plana / suelo)</td>
              <td style="padding:7px 10px;text-align:center;color:var(--text-slate-400);">ud</td>
              <td style="padding:7px 10px;text-align:center;color:var(--text-slate-400);">Triángulo 15º / 30º con tornillería</td>
              <td style="padding:7px 10px;text-align:right;">
                <input type="number" step="0.50" min="0" value="${mfg.trianglePrice.toFixed(2)}" style="width:75px;padding:3px 6px;font-size:11px;background:#0F172A;border:1px solid #334155;color:#F8FAFC;border-radius:4px;text-align:right;" onchange="RAStructureCatalog.updatePrice('${currentMfg}', 'trianglePrice', this.value)">
              </td>
            </tr>
            <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
              <td style="padding:7px 10px;font-weight:600;color:#fff;">Bloque prefabricado de hormigón para lastre (cubierta plana)</td>
              <td style="padding:7px 10px;text-align:center;color:var(--text-slate-400);">ud</td>
              <td style="padding:7px 10px;text-align:center;color:var(--text-slate-400);">
                <div style="display:inline-flex;align-items:center;justify-content:center;gap:4px;">
                  <span>Peso:</span>
                  <input type="number" step="1" min="5" max="150" value="${(mfg.ballastBlockWeightKg || 45).toFixed(0)}" style="width:48px;padding:2px 4px;font-size:10px;background:#0F172A;border:1px solid #334155;color:#38BDF8;border-radius:4px;text-align:center;font-weight:bold;" onchange="RAStructureCatalog.updatePrice('${currentMfg}', 'ballastBlockWeightKg', this.value)" title="Peso unitario en kg de cada bloque de hormigón">
                  <span>kg</span>
                </div>
              </td>
              <td style="padding:7px 10px;text-align:right;">
                <input type="number" step="0.25" min="0" value="${mfg.ballastBlockPrice.toFixed(2)}" style="width:75px;padding:3px 6px;font-size:11px;background:#0F172A;border:1px solid #334155;color:#F8FAFC;border-radius:4px;text-align:right;" onchange="RAStructureCatalog.updatePrice('${currentMfg}', 'ballastBlockPrice', this.value)">
              </td>
            </tr>
            <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
              <td style="padding:7px 10px;font-weight:600;color:#fff;">Grapa final de aluminio anodizado (End Clamp) con tornillo allen Inox</td>
              <td style="padding:7px 10px;text-align:center;color:var(--text-slate-400);">ud</td>
              <td style="padding:7px 10px;text-align:center;color:var(--text-slate-400);">Extremos de fila de módulos</td>
              <td style="padding:7px 10px;text-align:right;">
                <input type="number" step="0.05" min="0" value="${mfg.endClampPrice.toFixed(2)}" style="width:75px;padding:3px 6px;font-size:11px;background:#0F172A;border:1px solid #334155;color:#F8FAFC;border-radius:4px;text-align:right;" onchange="RAStructureCatalog.updatePrice('${currentMfg}', 'endClampPrice', this.value)">
              </td>
            </tr>
            <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
              <td style="padding:7px 10px;font-weight:600;color:#fff;">Grapa intermedia (Mid Clamp) con arandela de puesta a tierra</td>
              <td style="padding:7px 10px;text-align:center;color:var(--text-slate-400);">ud</td>
              <td style="padding:7px 10px;text-align:center;color:var(--text-slate-400);">Unión entre paneles contiguos</td>
              <td style="padding:7px 10px;text-align:right;">
                <input type="number" step="0.05" min="0" value="${mfg.midClampPrice.toFixed(2)}" style="width:75px;padding:3px 6px;font-size:11px;background:#0F172A;border:1px solid #334155;color:#F8FAFC;border-radius:4px;text-align:right;" onchange="RAStructureCatalog.updatePrice('${currentMfg}', 'midClampPrice', this.value)">
              </td>
            </tr>
          </tbody>
        </table>
      `;

      pane.innerHTML = html;
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
          <button type="button" class="doc-mini-btn" style="color:var(--text-slate-400);font-size: 10px;" onclick="RAStructureCatalog.resetInstallationCosts()">
            ↩ Restaurar Valores Fábrica
          </button>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;">
          
          <!-- Bloque 1: Mano de Obra -->
          <div style="background:rgba(30,41,59,0.3);border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:12px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <span style="font-weight:800;font-size:11.5px;color:#38BDF8;">👷 Mano de Obra Especialista</span>
              <span style="font-weight:800;font-size:11px;color:#38BDF8;">${laborTotal.toFixed(2)} €</span>
            </div>
            <div style="display:flex;flex-direction:column;gap:6px;font-size:10.5px;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="color:var(--text-slate-300);">Montaje mecánico estructura:</span>
                <div style="display:flex;align-items:center;gap:4px;">
                  <input type="number" step="0.05" min="0" value="${costs.labor.mechanicalHoursPerPanel}" style="width:55px;padding:2px 4px;font-size:10.5px;background:#0F172A;border:1px solid #334155;color:#F8FAFC;border-radius:4px;text-align:right;" onchange="RAStructureCatalog.updateInstallationCost('labor', 'mechanicalHoursPerPanel', this.value)">
                  <span style="font-size: 10px;color:var(--text-slate-400);">h/mód (${mechH} h)</span>
                </div>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="color:var(--text-slate-300);">Conexionado eléctrico DC/AC:</span>
                <div style="display:flex;align-items:center;gap:4px;">
                  <input type="number" step="0.05" min="0" value="${costs.labor.electricalHoursPerPanel}" style="width:55px;padding:2px 4px;font-size:10.5px;background:#0F172A;border:1px solid #334155;color:#F8FAFC;border-radius:4px;text-align:right;" onchange="RAStructureCatalog.updateInstallationCost('labor', 'electricalHoursPerPanel', this.value)">
                  <span style="font-size: 10px;color:var(--text-slate-400);">h/mód (${elecH} h)</span>
                </div>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="color:var(--text-slate-300);">Puesta en marcha y verificación:</span>
                <div style="display:flex;align-items:center;gap:4px;">
                  <input type="number" step="0.5" min="0" value="${costs.labor.commissioningHoursFixed}" style="width:55px;padding:2px 4px;font-size:10.5px;background:#0F172A;border:1px solid #334155;color:#F8FAFC;border-radius:4px;text-align:right;" onchange="RAStructureCatalog.updateInstallationCost('labor', 'commissioningHoursFixed', this.value)">
                  <span style="font-size: 10px;color:var(--text-slate-400);">h fijas</span>
                </div>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px dashed rgba(255,255,255,0.1);padding-top:4px;">
                <span style="color:#F59E0B;font-weight:700;">Tarifa horaria oficial:</span>
                <div style="display:flex;align-items:center;gap:4px;">
                  <input type="number" step="1.0" min="0" value="${costs.labor.hourlyRate}" style="width:65px;padding:2px 4px;font-size:10.5px;background:#0F172A;border:1px solid #334155;color:#F59E0B;font-weight:700;border-radius:4px;text-align:right;" onchange="RAStructureCatalog.updateInstallationCost('labor', 'hourlyRate', this.value)">
                  <span style="font-size: 10px;color:var(--text-slate-400);">€/hora</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Bloque 2: Ingeniería y Legalización -->
          <div style="background:rgba(30,41,59,0.3);border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:12px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <span style="font-weight:800;font-size:11.5px;color:#A78BFA;">📐 Ingeniería y Legalización</span>
              <span style="font-weight:800;font-size:11px;color:#A78BFA;">${engTotal.toFixed(2)} €</span>
            </div>
            <div style="display:flex;flex-direction:column;gap:6px;font-size:10.5px;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="color:var(--text-slate-300);">Memoria Técnica / Proyecto visado:</span>
                <input type="number" step="25" min="0" value="${costs.engineering.technicalProject}" style="width:75px;padding:2px 4px;font-size:10.5px;background:#0F172A;border:1px solid #334155;color:#F8FAFC;border-radius:4px;text-align:right;" onchange="RAStructureCatalog.updateInstallationCost('engineering', 'technicalProject', this.value)">
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="color:var(--text-slate-300);">Dirección facultativa de obra:</span>
                <input type="number" step="25" min="0" value="${costs.engineering.siteSupervision}" style="width:75px;padding:2px 4px;font-size:10.5px;background:#0F172A;border:1px solid #334155;color:#F8FAFC;border-radius:4px;text-align:right;" onchange="RAStructureCatalog.updateInstallationCost('engineering', 'siteSupervision', this.value)">
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="color:var(--text-slate-300);">Tramitación y Boletín CIE:</span>
                <input type="number" step="10" min="0" value="${costs.engineering.adminCIE}" style="width:75px;padding:2px 4px;font-size:10.5px;background:#0F172A;border:1px solid #334155;color:#F8FAFC;border-radius:4px;text-align:right;" onchange="RAStructureCatalog.updateInstallationCost('engineering', 'adminCIE', this.value)">
              </div>
            </div>
          </div>

          <!-- Bloque 3: Permisos y Tasas -->
          <div style="background:rgba(30,41,59,0.3);border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:12px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <span style="font-weight:800;font-size:11.5px;color:#F59E0B;">🏛️ Permisos y Tasas Municipales</span>
              <span style="font-weight:800;font-size:11px;color:#F59E0B;">${permitsTotal.toFixed(2)} €</span>
            </div>
            <div style="display:flex;flex-direction:column;gap:6px;font-size:10.5px;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="color:var(--text-slate-300);">Comunicación previa / Tasa urbanística:</span>
                <input type="number" step="10" min="0" value="${costs.permits.urbanPermitFixed}" style="width:75px;padding:2px 4px;font-size:10.5px;background:#0F172A;border:1px solid #334155;color:#F8FAFC;border-radius:4px;text-align:right;" onchange="RAStructureCatalog.updateInstallationCost('permits', 'urbanPermitFixed', this.value)">
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="color:var(--text-slate-300);">Fianza de gestión de residuos:</span>
                <input type="number" step="10" min="0" value="${costs.permits.wasteDeposit}" style="width:75px;padding:2px 4px;font-size:10.5px;background:#0F172A;border:1px solid #334155;color:#F8FAFC;border-radius:4px;text-align:right;" onchange="RAStructureCatalog.updateInstallationCost('permits', 'wasteDeposit', this.value)">
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="color:var(--text-slate-300);">Impuesto ICIO (% sobre PEM):</span>
                <input type="number" step="0.25" min="0" value="${costs.permits.urbanPermitRatePct}" style="width:75px;padding:2px 4px;font-size:10.5px;background:#0F172A;border:1px solid #334155;color:#F8FAFC;border-radius:4px;text-align:right;" onchange="RAStructureCatalog.updateInstallationCost('permits', 'urbanPermitRatePct', this.value)">
              </div>
            </div>
          </div>

          <!-- Bloque 4: Medios Auxiliares y Seguridad -->
          <div style="background:rgba(30,41,59,0.3);border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:12px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <span style="font-weight:800;font-size:11.5px;color:#10B981;">🦺 Seguridad y Pequeño Material</span>
              <span style="font-weight:800;font-size:11px;color:#10B981;">${(auxTotal + smallMatTotal).toFixed(2)} €</span>
            </div>
            <div style="display:flex;flex-direction:column;gap:6px;font-size:10.5px;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="color:var(--text-slate-300);">Línea de vida provisional y EPIs:</span>
                <input type="number" step="25" min="0" value="${costs.auxiliary.lifelineSafety}" style="width:75px;padding:2px 4px;font-size:10.5px;background:#0F172A;border:1px solid #334155;color:#F8FAFC;border-radius:4px;text-align:right;" onchange="RAStructureCatalog.updateInstallationCost('auxiliary', 'lifelineSafety', this.value)">
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="color:var(--text-slate-300);">Medios auxiliares (andamio / elevador):</span>
                <input type="number" step="25" min="0" value="${costs.auxiliary.scaffoldingLift}" style="width:75px;padding:2px 4px;font-size:10.5px;background:#0F172A;border:1px solid #334155;color:#F8FAFC;border-radius:4px;text-align:right;" onchange="RAStructureCatalog.updateInstallationCost('auxiliary', 'scaffoldingLift', this.value)">
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px dashed rgba(255,255,255,0.1);padding-top:4px;">
                <span style="color:var(--text-slate-300);">Pequeño material eléctrico (${totalPanels} mód.):</span>
                <div style="display:flex;align-items:center;gap:4px;">
                  <input type="number" step="0.5" min="0" value="${costs.smallMaterials.perPanelSmallMaterials}" style="width:55px;padding:2px 4px;font-size:10.5px;background:#0F172A;border:1px solid #334155;color:#F8FAFC;border-radius:4px;text-align:right;" onchange="RAStructureCatalog.updateInstallationCost('smallMaterials', 'perPanelSmallMaterials', this.value)">
                  <span style="font-size: 10px;color:var(--text-slate-400);">€/mód</span>
                </div>
              </div>
            </div>
          </div>

        </div>
      `;

      pane.innerHTML = html;
    }
  };

  root.RAStructureCatalog = RAStructureCatalog;

})(typeof window !== 'undefined' ? window : this);
