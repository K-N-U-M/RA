/**
 * ============================================================================
 * 📊 RA PROJECT STATUS HUD & PROACTIVE VALIDATOR (HITOS 8 & 9)
 * ============================================================================
 * Módulo independiente desacoplado para el seguimiento en tiempo real del estado
 * global del proyecto fotovoltaico y validación normativa proactiva en pantalla.
 *
 * Características:
 * 1. HUD flotante Glassmorphism en el viewport con métricas unificadas (kWp, módulos,
 *    inversor, ratio DC/AC, producción anual y estado del análisis solar).
 * 2. Modo compacto / plegable con atajo de teclado [H] o clic para mínima huella.
 * 3. Arquitectura 100% reactiva dirigida por eventos (sin polling continuo en reposo).
 * 4. Validación proactiva continua:
 *    - Ratio DC/AC admisible [0.85 - 1.35] (IEC 62548).
 *    - Compatibilidad de strings con ventana MPPT del inversor activo.
 *    - Aviso de sedimentación y hot-spots en pendientes < 10°.
 *    - Detección de análisis solar desactualizado (dirty state).
 * ============================================================================
 */

(function(root) {
  'use strict';

  let hudContainer = null;
  let lastStateFingerprint = '';
  let _cachedAddress = '';
  let _lastGeocodeCoord = '';
  let _isGeocoding = false;
  let _lastAlertMsg = null;
  let _lastAlertLevel = 'info';

  // Modo compacto persistente
  let _isCompact = false;
  try {
    if (typeof localStorage !== 'undefined') {
      _isCompact = (localStorage.getItem('ra_hud_compact') === 'true');
    }
  } catch (e) {}

  function getApproximateAddress(lat, lng) {
    if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
      return 'Ubicación';
    }

    const coordKey = `${lat.toFixed(2)},${lng.toFixed(2)}`;

    // Si ya disponemos de la dirección geocodificada para estas coordenadas exactas, devolverla
    if (_cachedAddress && _lastGeocodeCoord === coordKey) {
      return _cachedAddress;
    }

    if (!_isGeocoding && typeof fetch === 'function') {
      if (coordKey !== _lastGeocodeCoord) {
        _lastGeocodeCoord = coordKey;
        _cachedAddress = '';
        _isGeocoding = true;
        fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14`, {
          headers: { 'Accept-Language': 'es' }
        })
        .then(r => r.json())
        .then(d => {
          _isGeocoding = false;
          if (d && d.address) {
            const city = d.address.city || d.address.town || d.address.village || d.address.municipality || d.address.county || d.name || '';
            const prov = d.address.province || d.address.state || '';
            _cachedAddress = city ? (prov && prov !== city ? `${city}, ${prov}` : city) : (d.display_name ? d.display_name.split(',')[0] : '');
            if (typeof window !== 'undefined' && window.solarProjectConfig) {
              window.solarProjectConfig.address = _cachedAddress;
            }
            if (typeof document !== 'undefined') {
              const munInput = document.getElementById('doc-mun');
              const provInput = document.getElementById('doc-prov');
              if (munInput && (!munInput.value || munInput.value === 'Madrid')) munInput.value = city || _cachedAddress;
              if (provInput && (!provInput.value || provInput.value === 'Madrid')) provInput.value = prov || city;
            }
            if (_cachedAddress && typeof RAProjectStatusHUD !== 'undefined' && typeof RAProjectStatusHUD.update === 'function') {
              RAProjectStatusHUD.update();
            }
          }
        })
        .catch(() => { _isGeocoding = false; });
      }
    }

    // Mientras se resuelve la geocodificación inversa o si falla la red, mostrar coordenadas reales
    return `${lat.toFixed(2)}° N, ${Math.abs(lng).toFixed(2)}° ${lng >= 0 ? 'E' : 'O'}`;
  }

  /**
   * Alterna entre modo compacto y modo expandido.
   */
  function setCompactMode(compact) {
    _isCompact = !!compact;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('ra_hud_compact', _isCompact ? 'true' : 'false');
      }
    } catch (e) {}
    applyCompactModeUI();
  }

  function toggleCompactMode(force) {
    const next = (typeof force === 'boolean') ? force : !_isCompact;
    setCompactMode(next);
    if (typeof root.showStatus === 'function') {
      root.showStatus(next ? '<i data-lucide="minimize-2" class="icon-sm"></i> HUD DE ESTADO MINIMIZADO [H]' : '<i data-lucide="maximize-2" class="icon-sm"></i> HUD DE ESTADO EXPANDIDO [H]', 1600);
    }
  }

  /**
   * Refleja visualmente el modo compacto en el DOM.
   */
  function applyCompactModeUI() {
    ensureHUDDOM();
    if (!hudContainer) return;

    const pillBox = document.getElementById('ra-hud-pill-box');
    const locRow = document.getElementById('ra-hud-location-row');
    const metricsRow = document.getElementById('ra-hud-metrics-row');
    const compactRow = document.getElementById('ra-hud-compact-row');
    const alertBox = document.getElementById('ra-hud-validation-alert');

    if (!pillBox || !locRow || !metricsRow || !compactRow) return;

    if (_isCompact) {
      hudContainer.classList.add('ra-hud-compact');
      pillBox.style.padding = '5px 12px';
      pillBox.style.gap = '0';
      pillBox.style.borderRadius = '8px';
      pillBox.style.cursor = 'pointer';
      pillBox.title = 'Haz clic o pulsa [H] para expandir el HUD con todas las métricas';
      locRow.style.display = 'none';
      metricsRow.style.display = 'none';
      compactRow.style.display = 'flex';
      if (alertBox) alertBox.style.display = 'none';
    } else {
      hudContainer.classList.remove('ra-hud-compact');
      pillBox.style.padding = '8px 14px';
      pillBox.style.gap = '6px';
      pillBox.style.borderRadius = '10px';
      pillBox.style.cursor = 'default';
      pillBox.title = '';
      locRow.style.display = 'flex';
      metricsRow.style.display = 'flex';
      compactRow.style.display = 'none';
      if (alertBox) {
        alertBox.style.display = _lastAlertMsg ? 'flex' : 'none';
      }
    }
  }

  /**
   * Crea e inyecta el contenedor del HUD en el DOM si no existe.
   */
  function ensureHUDDOM() {
    if (typeof document === 'undefined') return null;
    if (hudContainer && document.body.contains(hudContainer)) return hudContainer;

    hudContainer = document.getElementById('ra-project-status-hud');
    if (!hudContainer) {
      hudContainer = document.createElement('div');
      hudContainer.id = 'ra-project-status-hud';
      hudContainer.style.cssText = `
        position: fixed;
        top: 16px;
        right: 145px;
        z-index: 9400;
        display: flex;
        flex-direction: column;
        gap: 6px;
        pointer-events: none;
        font-family: 'Inter', system-ui, -apple-system, sans-serif;
        max-width: 420px;
        transition: opacity 0.2s ease, transform 0.2s ease;
      `;

      hudContainer.innerHTML = `
        <div id="ra-hud-pill-box" style="
          pointer-events: auto;
          background: rgba(15, 23, 42, 0.95);
          border: 1px solid rgba(56, 189, 248, 0.35);
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5), 0 0 10px rgba(56, 189, 248, 0.10);
          border-radius: 10px;
          padding: 8px 14px;
          color: #fff;
          display: flex;
          flex-direction: column;
          gap: 6px;
          user-select: none;
          transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
        ">
          <!-- Fila de Ubicación, Estado de Sombra y Botón de Minimizar [H] -->
          <div id="ra-hud-location-row" style="display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 10px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); padding-bottom: 4px;">
            <div style="display: flex; align-items: center; gap: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              <span style="color: #38BDF8;">📍</span>
              <span id="ra-hud-location-text" style="font-weight: 600; color: #cbd5e1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 200px;">Ubicación: —</span>
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
              <div id="ra-hud-shadow-badge" style="font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 4px; background: rgba(56, 189, 248, 0.15); color: #38BDF8; white-space: nowrap;">
                🌤️ Preliminar
              </div>
              <button id="ra-hud-toggle-btn" type="button" title="Minimizar HUD [H]" style="
                background: rgba(255, 255, 255, 0.08);
                border: 1px solid rgba(255, 255, 255, 0.15);
                color: #cbd5e1;
                cursor: pointer;
                border-radius: 4px;
                font-size: 10px;
                font-weight: 800;
                padding: 1px 5px;
                line-height: 1.2;
                display: flex;
                align-items: center;
                gap: 3px;
                transition: background 0.15s ease, color 0.15s ease;
              ">
                <span id="ra-hud-toggle-icon">−</span>
                <span style="font-size: 10px; color: #94a3b8; font-family: monospace;">[H]</span>
              </button>
            </div>
          </div>

          <!-- Métricas principales completas (kWp, Inversor, Desglose Teórico vs Neto) -->
          <div id="ra-hud-metrics-row" style="display: flex; align-items: center; justify-content: space-between; gap: 14px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <div style="width: 8px; height: 8px; border-radius: 50%; background: #10B981; box-shadow: 0 0 8px #10B981;" id="ra-hud-status-dot"></div>
              <div>
                <div style="font-size: 11.5px; font-weight: 900; letter-spacing: 0.3px; color: #f8fafc;" id="ra-hud-kwp-text">0.00 kWp</div>
                <div style="font-size: 10px; color: #94a3b8;" id="ra-hud-sub-text">0 paneles · Sin inversor</div>
                <div style="font-size: 10px; font-weight: 700;" id="ra-hud-ratio-badge">Ratio DC/AC —</div>
              </div>
            </div>
                        <div id="ra-hud-energy-breakdown" style="text-align: right; display: flex; flex-direction: column; gap: 1px;">
              <div id="ra-hud-row-1" style="font-size: 10px; color: #94a3b8; font-family: monospace;">
                Teórico: <span id="ra-hud-theo-energy" style="color: #cbd5e1; font-weight: 700;">— kWh/a</span>
              </div>
              <div id="ra-hud-row-2" style="font-size: 11px; font-weight: 800; font-family: monospace; color: #38BDF8;">
                Neto 3D: <span id="ra-hud-energy-text">— kWh/año</span>
              </div>
              <div id="ra-hud-shadow-detail" style="font-size: 10px; font-weight: 600; color: #94a3b8;">
                Sin simulación
              </div>
            </div>
          </div>
<!-- Fila Compacta Minimalista (Modo C - Se activa cuando _isCompact es true) -->
          <div id="ra-hud-compact-row" style="display: none; align-items: center; justify-content: space-between; gap: 10px; font-size: 11px; font-weight: 800;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <div style="width: 7px; height: 7px; border-radius: 50%; background: #10B981; box-shadow: 0 0 6px #10B981;" id="ra-hud-compact-dot"></div>
              <span id="ra-hud-compact-kwp" style="color: #f8fafc; font-family: monospace; font-size: 11.5px;">0.00 kWp</span>
              <span id="ra-hud-compact-panels" style="color: #94a3b8; font-size: 10px; font-weight: 600;">(0 pnl)</span>
              <span id="ra-hud-compact-alert" style="display: none; font-size: 11px; cursor: help;" title="">⚠️</span>
            </div>
            <button id="ra-hud-expand-btn" type="button" title="Expandir HUD [H]" style="
              background: rgba(255, 255, 255, 0.08);
              border: 1px solid rgba(255, 255, 255, 0.15);
              color: #cbd5e1;
              cursor: pointer;
              border-radius: 4px;
              font-size: 10px;
              font-weight: 800;
              padding: 1px 5px;
              line-height: 1.2;
              display: flex;
              align-items: center;
              gap: 3px;
              transition: background 0.15s ease, color 0.15s ease;
            ">
              <span>+</span>
              <span style="font-size: 10px; color: #94a3b8; font-family: monospace;">[H]</span>
            </button>
          </div>
        </div>

        <div id="ra-hud-validation-alert" style="
          pointer-events: auto;
          display: none;
          background: rgba(239, 68, 68, 0.94);
          border-radius: 8px;
          padding: 6px 10px;
          color: #fff;
          font-size: 10px;
          font-weight: 700;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
          align-items: center;
          gap: 6px;
          user-select: none;
        ">
          <span id="ra-hud-alert-icon">⚠️</span>
          <span id="ra-hud-alert-text">Alerta de diseño</span>
        </div>
      `;

      document.body.appendChild(hudContainer);

      // Manejadores de eventos de colapso / expansión
      const toggleBtn = document.getElementById('ra-hud-toggle-btn');
      if (toggleBtn) {
        toggleBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleCompactMode();
        });
      }

      const expandBtn = document.getElementById('ra-hud-expand-btn');
      if (expandBtn) {
        expandBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleCompactMode(false);
        });
      }

      const compactRow = document.getElementById('ra-hud-compact-row');
      if (compactRow) {
        compactRow.addEventListener('click', () => {
          if (_isCompact) toggleCompactMode(false);
        });
      }

      applyCompactModeUI();
    }
    return hudContainer;
  }

  /**
   * Recopila el estado completo del proyecto desde el SSOT y realiza las validaciones.
   */
  function inspectProjectState() {
    let numPanels = 0;
    if (typeof window !== 'undefined' && Array.isArray(window.allRenderedPanels)) {
      numPanels = window.allRenderedPanels.length;
    } else if (typeof WP !== 'undefined' && WP && Array.isArray(WP.polylines)) {
      WP.polylines.forEach(p => {
        if (p.roofInfo && Array.isArray(p.roofInfo.panels)) numPanels += p.roofInfo.panels.length;
        else if (Array.isArray(p.panels)) numPanels += p.panels.length;
      });
    }

    const cfg = (typeof window !== 'undefined' && window.solarProjectConfig) ? window.solarProjectConfig : {};
    const cat = (typeof equipmentCatalog !== 'undefined' && equipmentCatalog) ? equipmentCatalog : {};
    
    // Módulo seleccionado y desglose unificado SSOT (respeta poly.moduleId por faldón)
    let pModW = 450;
    if (cfg.selectedModuleId && Array.isArray(cat.modules)) {
      const mObj = cat.modules.find(m => m.id === cfg.selectedModuleId);
      if (mObj && (mObj.wp || mObj.potencia)) pModW = mObj.wp || mObj.potencia;
    }
    let kwp = (numPanels * pModW) / 1000.0;
    if (typeof window !== 'undefined' && window.ProjectHierarchy && typeof window.ProjectHierarchy.getTree === 'function') {
      try {
        const tree = window.ProjectHierarchy.getTree();
        if (tree && tree.totals && tree.totals.panelsCount > 0 && tree.totals.totalKwp > 0) {
          numPanels = tree.totals.panelsCount;
          kwp = tree.totals.totalKwp;
        }
      } catch (eTree) {}
    } else if (typeof window !== 'undefined' && typeof window.getProjectModulesBreakdown === 'function') {
      try {
        const mb = window.getProjectModulesBreakdown();
        if (mb && typeof mb.totalPanels === 'number' && mb.totalPanels > 0 && typeof mb.totalKwp === 'number' && mb.totalKwp > 0) {
          numPanels = mb.totalPanels;
          kwp = mb.totalKwp;
        }
      } catch (eMb) {}
    }

    // Inversor seleccionado (exclusivo para Paso 4+)
    const currentStep = (typeof wpCurrentStep !== 'undefined') ? wpCurrentStep : ((typeof window !== 'undefined' && window.wpCurrentStep) || 1);
    let invKw = 0;
    let invName = 'Inversor no seleccionado';
    let invObj = null;
    if (currentStep >= 4 && cfg.selectedInverterId && Array.isArray(cat.inverters)) {
      invObj = cat.inverters.find(i => i.id === cfg.selectedInverterId);
      if (invObj) {
        invKw = invObj.kw || invObj.kw_nominal || 0;
        invName = `${invObj.brand || ''} ${invObj.model || ''} (${invKw} kW)`;
      }
    }
    const invCount = (currentStep >= 4 && cfg.autoSizing && cfg.autoSizing.inverters && cfg.autoSizing.inverters.count) ? cfg.autoSizing.inverters.count : 1;
    let totalInvKw = invKw * invCount;

    // Ratio DC/AC
    const ratioDcAc = (currentStep >= 4 && totalInvKw > 0) ? (kwp / totalInvKw) : 0;

    // Producción anual y desglose dual (Teórico vs Neto 3D)
    let annualKWh = 0;
    let theoreticalAnnualKWh = 0;
    let hasSimulation = false;
    let shadowLossPct = 0;

    if (typeof getProjectCalcs === 'function') {
      const pc = getProjectCalcs();
      if (pc) {
        if (pc.annualKWh) annualKWh = pc.annualKWh;
        if (pc.theoreticalAnnualKWh) theoreticalAnnualKWh = pc.theoreticalAnnualKWh;
        if (pc.hasSimulation !== undefined) hasSimulation = pc.hasSimulation;
        if (typeof pc.shadowLossPct === 'number') shadowLossPct = pc.shadowLossPct;
      }
    }
    const _engStats = (typeof window !== 'undefined' && window.RA && window.RA.solarStats) ? window.RA.solarStats : null;
    if (_engStats) {
      if (_engStats.theoreticalAnnualKWh) theoreticalAnnualKWh = _engStats.theoreticalAnnualKWh;
      if (_engStats.hasSimulation !== undefined) hasSimulation = _engStats.hasSimulation;
      if (typeof _engStats.avgShadowLossPct === 'number') shadowLossPct = _engStats.avgShadowLossPct;
    }
    if (!theoreticalAnnualKWh && kwp > 0) {
      theoreticalAnnualKWh = Math.round(kwp * 1550);
    }
    if (!annualKWh && kwp > 0) {
      annualKWh = theoreticalAnnualKWh || (kwp * 1450);
    }

    let projLat = null, projLng = null;
    if (typeof polygonAnalysis === 'function') {
      if (typeof WP !== 'undefined' && WP && Array.isArray(WP.polylines) && WP.polylines.length > 0) {
        const selIdx = (WP.selectedPolyIdx >= 0 && WP.selectedPolyIdx < WP.polylines.length) ? WP.selectedPolyIdx : 0;
        const selPoly = WP.polylines[selIdx] || WP.polylines[0];
        if (selPoly && Array.isArray(selPoly.points) && selPoly.points.length >= 3) {
          const pa = polygonAnalysis(selPoly.points);
          if (pa && typeof pa.latDeg === 'number' && !isNaN(pa.latDeg)) {
            projLat = pa.latDeg;
            projLng = pa.lonDeg;
          }
        }
      } else if (typeof polygonPoints !== 'undefined' && Array.isArray(polygonPoints) && polygonPoints.length >= 3) {
        const pa = polygonAnalysis(polygonPoints);
        if (pa && typeof pa.latDeg === 'number' && !isNaN(pa.latDeg)) {
          projLat = pa.latDeg;
          projLng = pa.lonDeg;
        }
      }
    }
    if (projLat === null) {
      if (typeof window !== 'undefined' && window.solarProjectConfig && typeof window.solarProjectConfig.lat === 'number') {
        projLat = window.solarProjectConfig.lat;
        projLng = window.solarProjectConfig.lng;
      } else if (typeof viewer !== 'undefined' && viewer && viewer.camera && viewer.camera.positionCartographic) {
        projLat = Cesium.Math.toDegrees(viewer.camera.positionCartographic.latitude);
        projLng = Cesium.Math.toDegrees(viewer.camera.positionCartographic.longitude);
      } else {
        projLat = 41.3851;
        projLng = 2.1734;
      }
    }

    if (typeof window !== 'undefined' && window.solarProjectConfig) {
      window.solarProjectConfig.lat = projLat;
      window.solarProjectConfig.lng = projLng;
      window.solarProjectConfig.latitude = projLat;
      window.solarProjectConfig.longitude = projLng;
    }

    const approxAddress = getApproximateAddress(projLat, projLng);

    // Heatmap dirty check
    const isHeatmapDirty = !!(typeof solarSimState !== 'undefined' && solarSimState && solarSimState.annualHeatmapDirty);

    // Inclinación mínima real de las placas sobre su estructura
    let minTilt = 30;
    if (typeof WP !== 'undefined' && WP && Array.isArray(WP.polylines) && WP.polylines.length > 0) {
      minTilt = WP.polylines.reduce((min, p) => {
        let t = 30;
        if (p.roofInfo) {
          if (typeof p.roofInfo.moduleTiltDeg === 'number') {
            t = p.roofInfo.moduleTiltDeg;
          } else if (p.roofInfo.structureType === 'triangles_30') {
            t = 30;
          } else if (p.roofInfo.structureType === 'triangles_15_ew') {
            t = 15;
          } else if (typeof p.roofInfo.tiltDeg === 'number') {
            t = p.roofInfo.tiltDeg;
          }
        }
        return Math.min(min, t);
      }, 90);
    }

    // Validación de compatibilidad de strings
    let stringValidCount = numPanels;
    let stringNotice = null;
    if (typeof getNearestValidStringModuleCount === 'function' && invObj && numPanels > 0) {
      const nsMin = (cfg.calculatedLimits && cfg.calculatedLimits.nMinString) || 6;
      const nsMax = (cfg.calculatedLimits && cfg.calculatedLimits.nMaxString) || 18;
      const invCount = (cfg.autoSizing && cfg.autoSizing.inverters && Number.isFinite(cfg.autoSizing.inverters.count)) ? Math.max(1, cfg.autoSizing.inverters.count) : 1;
      const mpptPerInv = (invObj.mppt || invObj.mppts || invObj.mpptCount || 2);
      const inputsPerMppt = (invObj.inputsPerMppt || 2);
      const maxStrings = mpptPerInv * invCount * inputsPerMppt;
      stringValidCount = getNearestValidStringModuleCount(numPanels, nsMin, nsMax, maxStrings);
      if (stringValidCount !== numPanels) {
        stringNotice = `Strings no balanceados: recomendado ajustar a ${stringValidCount} paneles (${stringValidCount > numPanels ? '+' : ''}${stringValidCount - numPanels})`;
      }
    }

        // Inspección de aerogeneradores mini-eólicos (Módulo Híbrido)
    let numTurbines = 0;
    let windKw = 0;
    let windAnnualKWh = 0;
    if (typeof window !== 'undefined' && Array.isArray(window.windTurbines)) {
      const activeTurbs = window.windTurbines.filter(t => !t.operationalState || t.operationalState.enabled !== false);
      numTurbines = activeTurbs.length;
      activeTurbs.forEach(t => {
        const pW = (t._catalog && t._catalog.ratedPowerW) ? t._catalog.ratedPowerW : 0;
        windKw += (pW / 1000.0);
      });
      if (numTurbines > 0 && window.windParkSummary && typeof window.windParkSummary.totalAepNetKwh === 'number') {
        windAnnualKWh = Math.round(window.windParkSummary.totalAepNetKwh);
      }
    }

    return {
      numPanels,
      pModW,
      kwp,
      invKw: totalInvKw,
      invName,
      ratioDcAc,
      annualKWh: numPanels > 0 ? annualKWh : 0,
      theoreticalAnnualKWh: numPanels > 0 ? theoreticalAnnualKWh : 0,
      numTurbines,
      windKw,
      windAnnualKWh,
      hasSimulation,
      shadowLossPct,
      approxAddress,
      isHeatmapDirty,
      minTilt,
      stringNotice,
      stringValidCount
    };
  }

  /**
   * Refresca la interfaz de usuario del HUD y las alertas proactivas.
   */
  function updateHUD() {
    ensureHUDDOM();
    if (!hudContainer) return;

    const s = inspectProjectState();

    // Ocultar si no hay ni paneles ni aerogeneradores o en pantallas móviles (<= 768px)
    const isMobile = (typeof window !== 'undefined' && window.innerWidth <= 768);
    if (isMobile || (s.numPanels === 0 && s.numTurbines === 0)) {
      hudContainer.style.display = 'none';
      return;
    } else {
      hudContainer.style.display = 'flex';
    }

    // Fingerprint para evitar renders innecesarios
    const currentFingerprint = `${s.numPanels}_${s.kwp.toFixed(2)}_${s.numTurbines}_${s.windKw.toFixed(1)}_${s.windAnnualKWh}_${s.invKw.toFixed(1)}_${s.isHeatmapDirty}_${s.annualKWh}_${s.theoreticalAnnualKWh}_${s.hasSimulation}_${s.approxAddress}_${s.shadowLossPct}_${_isCompact}`;
    if (currentFingerprint === lastStateFingerprint) return;
    lastStateFingerprint = currentFingerprint;

    // Actualizar textos principales
    const kwpEl = document.getElementById('ra-hud-kwp-text');
    const subEl = document.getElementById('ra-hud-sub-text');
    const energyEl = document.getElementById('ra-hud-energy-text');
    const ratioEl = document.getElementById('ra-hud-ratio-badge');
    const dotEl = document.getElementById('ra-hud-status-dot');
    const alertBox = document.getElementById('ra-hud-validation-alert');
    const alertText = document.getElementById('ra-hud-alert-text');
    const locationEl = document.getElementById('ra-hud-location-text');
    const shadowBadgeEl = document.getElementById('ra-hud-shadow-badge');
    const theoEnergyEl = document.getElementById('ra-hud-theo-energy');
    const shadowDetailEl = document.getElementById('ra-hud-shadow-detail');
    const row1El = document.getElementById('ra-hud-row-1');
    const row2El = document.getElementById('ra-hud-row-2');

    // Elementos del modo compacto
    const compactKwpEl = document.getElementById('ra-hud-compact-kwp');
    const compactPanelsEl = document.getElementById('ra-hud-compact-panels');
    const compactDotEl = document.getElementById('ra-hud-compact-dot');
    const compactAlertEl = document.getElementById('ra-hud-compact-alert');

    if (locationEl) locationEl.textContent = s.approxAddress || 'Ubicación';

    const currentStep = (typeof wpCurrentStep !== 'undefined') ? wpCurrentStep : ((typeof window !== 'undefined' && window.wpCurrentStep) || 1);

    if (s.numPanels > 0 && s.numTurbines > 0) {
      if (kwpEl) kwpEl.innerHTML = `<span style="color:#FBBF24;">☀️ ${s.kwp.toFixed(2)} kWp</span> <span style="color:#64748B;">+</span> <span style="color:#38BDF8;">💨 ${s.windKw.toFixed(1)} kW</span>`;
      if (compactKwpEl) compactKwpEl.innerHTML = `<span style="color:#FBBF24;">☀️${s.kwp.toFixed(1)}</span>+<span style="color:#38BDF8;">💨${s.windKw.toFixed(1)}kW</span>`;
      if (compactPanelsEl) compactPanelsEl.textContent = `(${s.numPanels}p · ${s.numTurbines}t)`;
      if (subEl) {
        subEl.textContent = `${s.numPanels} paneles · ${s.numTurbines} ${s.numTurbines === 1 ? 'turbina' : 'turbinas'}${currentStep >= 4 && s.invKw > 0 ? ' · ' + s.invKw.toFixed(1) + ' kW AC' : ''}`;
      }
    } else if (s.numTurbines > 0) {
      if (kwpEl) kwpEl.innerHTML = `<span style="color:#38BDF8;">💨 ${s.windKw.toFixed(1)} kW Eólica</span>`;
      if (compactKwpEl) compactKwpEl.innerHTML = `<span style="color:#38BDF8;">💨 ${s.windKw.toFixed(1)} kW</span>`;
      if (compactPanelsEl) compactPanelsEl.textContent = `(${s.numTurbines} turb)`;
      if (subEl) {
        subEl.textContent = `${s.numTurbines} ${s.numTurbines === 1 ? 'aerogenerador instalado' : 'aerogeneradores instalados'}`;
      }
    } else {
      if (kwpEl) kwpEl.textContent = `${s.kwp.toFixed(2)} kWp`;
      if (compactKwpEl) compactKwpEl.textContent = `${s.kwp.toFixed(2)} kWp`;
      if (compactPanelsEl) compactPanelsEl.textContent = `(${s.numPanels} pnl)`;
      if (subEl) {
        if (currentStep >= 4) {
          subEl.textContent = `${s.numPanels} paneles · ${s.invKw > 0 ? (s.invKw.toFixed(1) + ' kW AC') : 'Sin inversor'}`;
        } else {
          subEl.textContent = `${s.numPanels} paneles instalados`;
        }
      }
    }

    if (s.numTurbines > 0) {
      const fvNet = Math.round(s.annualKWh || 0);
      const wndNet = Math.round(s.windAnnualKWh || 0);
      const totNet = fvNet + wndNet;
      if (row1El) {
        row1El.innerHTML = `☀️ FV: <span style="color:#FBBF24;font-weight:700;">${fvNet.toLocaleString('es-ES')} kWh/a</span>`;
      }
      if (row2El) {
        row2El.innerHTML = `💨 Eólica: <span style="color:#38BDF8;font-weight:800;">${wndNet.toLocaleString('es-ES')} kWh/a</span>`;
      }
      if (shadowDetailEl) {
        shadowDetailEl.innerHTML = `⚡ Total: <span style="color:#10B981;font-weight:800;font-family:monospace;">${totNet.toLocaleString('es-ES')} kWh/a</span>`;
      }
    } else {
      if (row1El) {
        row1El.innerHTML = `Teórico: <span id="ra-hud-theo-energy" style="color: #cbd5e1; font-weight: 700;">${s.theoreticalAnnualKWh > 0 ? Math.round(s.theoreticalAnnualKWh).toLocaleString('es-ES') + ' kWh/a' : '— kWh/a'}</span>`;
      }
      if (row2El) {
        const netColor = (s.hasSimulation && !s.isHeatmapDirty) ? '#10B981' : '#38BDF8';
        row2El.innerHTML = `Neto 3D: <span id="ra-hud-energy-text" style="color:${netColor};">${s.annualKWh > 0 ? Math.round(s.annualKWh).toLocaleString('es-ES') + ' kWh/a' : '— kWh/año'}</span>`;
      }
      if (shadowDetailEl) {
        if (s.isHeatmapDirty) {
          shadowDetailEl.textContent = 'Sombras desactualizadas';
          shadowDetailEl.style.color = '#F59E0B';
        } else if (s.hasSimulation) {
          shadowDetailEl.textContent = s.shadowLossPct > 0 ? `Pérdida sombras: -${s.shadowLossPct.toFixed(1)}%` : 'Cubierta libre de sombras';
          shadowDetailEl.style.color = '#34D399';
        } else {
          shadowDetailEl.textContent = 'Paso 3 para simular sombras';
          shadowDetailEl.style.color = '#94a3b8';
        }
      }
    }

    if (shadowBadgeEl) {
      if (s.isHeatmapDirty && s.numPanels > 0) {
        shadowBadgeEl.textContent = '⚠️ Recálculo pendiente';
        shadowBadgeEl.style.background = 'rgba(245, 158, 11, 0.20)';
        shadowBadgeEl.style.color = '#F59E0B';
      } else if (s.hasSimulation && s.numPanels > 0) {
        shadowBadgeEl.textContent = `🎯 3D Simulado (${s.shadowLossPct > 0 ? '-' + s.shadowLossPct.toFixed(1) + '%' : '0%'} sombra)`;
        shadowBadgeEl.style.background = 'rgba(16, 185, 129, 0.20)';
        shadowBadgeEl.style.color = '#10B981';
      } else if (s.numPanels > 0 && s.numTurbines > 0) {
        shadowBadgeEl.textContent = '⚡ Híbrido FV + Eólica';
        shadowBadgeEl.style.background = 'rgba(16, 185, 129, 0.18)';
        shadowBadgeEl.style.color = '#34D399';
      } else if (s.numTurbines > 0) {
        shadowBadgeEl.textContent = '💨 Parque Eólico';
        shadowBadgeEl.style.background = 'rgba(56, 189, 248, 0.18)';
        shadowBadgeEl.style.color = '#38BDF8';
      } else {
        shadowBadgeEl.textContent = '🌤️ Teórico preliminar';
        shadowBadgeEl.style.background = 'rgba(56, 189, 248, 0.15)';
        shadowBadgeEl.style.color = '#38BDF8';
      }
    }

    // Badge Ratio DC/AC
    if (ratioEl) {
      if (currentStep >= 4 && s.ratioDcAc > 0) {
        ratioEl.textContent = `Ratio DC/AC: ${s.ratioDcAc.toFixed(2)}`;
        if (s.ratioDcAc >= 0.95 && s.ratioDcAc <= 1.30) {
          ratioEl.style.color = '#34D399'; // Verde óptimo
        } else if (s.ratioDcAc > 1.30 && s.ratioDcAc <= 1.45) {
          ratioEl.style.color = '#FBBF24'; // Ámbar sobrecarga moderada
        } else {
          ratioEl.style.color = '#F87171'; // Rojo fuera de rango
        }
      } else if (currentStep < 4) {
        ratioEl.textContent = 'Fase de Diseño CAD';
        ratioEl.style.color = '#94a3b8';
      } else {
        ratioEl.textContent = 'Ratio DC/AC —';
        ratioEl.style.color = '#94a3b8';
      }
    }

    // Dot de estado del análisis
    let dotColor = '#64748B';
    let dotShadow = 'none';
    let dotTitle = 'Sin paneles generados';
    if (s.isHeatmapDirty) {
      dotColor = '#F59E0B';
      dotShadow = '0 0 8px #F59E0B';
      dotTitle = 'Análisis solar desactualizado tras cambios de diseño';
    } else if (s.numPanels > 0) {
      dotColor = '#10B981';
      dotShadow = '0 0 8px #10B981';
      dotTitle = 'Diseño al día';
    }

    if (dotEl) {
      dotEl.style.background = dotColor;
      dotEl.style.boxShadow = dotShadow;
      dotEl.title = dotTitle;
    }
    if (compactDotEl) {
      compactDotEl.style.background = dotColor;
      compactDotEl.style.boxShadow = dotShadow;
      compactDotEl.title = dotTitle;
    }

    // Alertas proactivas automáticas (Hito 9)
    let alertMsg = null;
    let alertLevel = 'warning';

    // Las comprobaciones electrotécnicas de inversor y strings solo aplican en Paso >= 4
    if (currentStep >= 4 && s.numPanels > 0 && s.invKw > 0) {
      if (s.ratioDcAc > 1.40) {
        alertMsg = `Ratio DC/AC excesivo (${s.ratioDcAc.toFixed(2)}): riesgo de clipping severo. Recomendado inversor superior.`;
        alertLevel = 'error';
      } else if (s.ratioDcAc < 0.75) {
        alertMsg = `Inversor sobredimensionado (Ratio ${s.ratioDcAc.toFixed(2)}): opera a baja eficiencia a carga parcial.`;
        alertLevel = 'warning';
      } else if (s.stringNotice) {
        alertMsg = s.stringNotice;
        alertLevel = 'info';
      }
    }

    if (!alertMsg && s.minTilt < 9.5 && s.numPanels > 0) {
      alertMsg = `Inclinación < 10°: requiere previsión de limpieza por sedimentación de polvo.`;
      alertLevel = 'info';
    }

    if (!alertMsg && s.isHeatmapDirty && s.numPanels > 0) {
      alertMsg = `Geometría modificada: recalcula el análisis solar en el Paso 3.`;
      alertLevel = 'info';
    }

    _lastAlertMsg = alertMsg;
    _lastAlertLevel = alertLevel;

    // Actualizar alerta en modo compacto
    if (compactAlertEl) {
      if (alertMsg) {
        compactAlertEl.style.display = 'inline-block';
        compactAlertEl.textContent = (alertLevel === 'error') ? '⛔' : (alertLevel === 'warning' ? '⚠️' : 'ℹ️');
        compactAlertEl.title = alertMsg;
      } else {
        compactAlertEl.style.display = 'none';
        compactAlertEl.title = '';
      }
    }

    // Actualizar banner de alerta en modo expandido
    if (alertBox && alertText) {
      const alertIcon = document.getElementById('ra-hud-alert-icon');
      if (alertMsg && !_isCompact) {
        alertBox.style.display = 'flex';
        alertText.textContent = alertMsg;
        if (alertIcon) {
          alertIcon.textContent = (alertLevel === 'error') ? '⛔' : (alertLevel === 'warning' ? '⚠️' : 'ℹ️');
        }
        if (alertLevel === 'error') {
          alertBox.style.background = 'rgba(239, 68, 68, 0.94)';
          alertBox.style.color = '#fff';
        } else if (alertLevel === 'warning') {
          alertBox.style.background = 'rgba(245, 158, 11, 0.94)';
          alertBox.style.color = '#000';
        } else {
          alertBox.style.background = 'rgba(14, 165, 233, 0.94)';
          alertBox.style.color = '#fff';
        }
      } else {
        alertBox.style.display = 'none';
      }
    }

    applyCompactModeUI();
  }

  // ── OPCIÓN D: ARQUITECTURA REACTIVA DIRIGIDA POR EVENTOS ──────────────────────
  let _updatePending = false;
  function requestHUDUpdate() {
    if (_updatePending) return;
    _updatePending = true;
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        _updatePending = false;
        updateHUD();
      });
    } else {
      setTimeout(() => {
        _updatePending = false;
        updateHUD();
      }, 30);
    }
  }

  let timerId = null;
  let _syncInitialized = false;

  function startSync() {
    if (typeof window === 'undefined') return;
    if (_syncInitialized) return;
    _syncInitialized = true;

    // 1. Render inicial inmediato
    requestHUDUpdate();

    // 2. Escucha reactiva de eventos personalizados de la plataforma
    window.addEventListener('ra:project-updated', requestHUDUpdate);
    window.addEventListener('ra:step-changed', requestHUDUpdate);
    window.addEventListener('resize', requestHUDUpdate);

    // 3. Reactividad en cambios de formularios y parámetros (sidebar / modales)
    document.addEventListener('change', (e) => {
      if (e.target && (e.target.closest('#ra-sidebar') || e.target.closest('.modal-box') || e.target.closest('.doc-modal-box'))) {
        requestHUDUpdate();
      }
    }, { passive: true });

    // 4. Reactividad al finalizar interacciones CAD/3D (soltar clic de ratón/táctil)
    document.addEventListener('pointerup', () => {
      requestHUDUpdate();
    }, { passive: true });

    // 5. Hooks no invasivos en funciones globales clave si ya existen
    if (typeof window.wpUpdateUI === 'function') {
      const origWpUpdateUI = window.wpUpdateUI;
      window.wpUpdateUI = function() {
        const res = origWpUpdateUI.apply(this, arguments);
        requestHUDUpdate();
        return res;
      };
    }

    if (typeof window.wpSetStep === 'function') {
      const origWpSetStep = window.wpSetStep;
      window.wpSetStep = function() {
        const res = origWpSetStep.apply(this, arguments);
        requestHUDUpdate();
        return res;
      };
    }

    // 6. Heartbeat pasivo ultra-ligero de respaldo (5 segundos):
    //    Si la ventana está en segundo plano o el estado no ha cambiado, consume 0% CPU.
    if (timerId) clearInterval(timerId);
    timerId = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      updateHUD();
    }, 5000);
  }

  const RAProjectStatusHUD = {
    update: requestHUDUpdate,
    updateImmediate: updateHUD,
    inspect: inspectProjectState,
    start: startSync,
    toggleCompact: toggleCompactMode,
    setCompact: setCompactMode,
    isCompact: () => _isCompact
  };

  if (!root.RA) root.RA = {};
  root.RA.ProjectStatusHUD = RAProjectStatusHUD;
  root.RAProjectStatusHUD = RAProjectStatusHUD;
  root.toggleProjectStatusHUDCompact = toggleCompactMode;

  // Iniciar automáticamente cuando el DOM esté listo
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', startSync);
    } else {
      startSync();
    }
  }

})(typeof window !== 'undefined' ? window : globalThis);
