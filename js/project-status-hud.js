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
 * 2. Validación proactiva continua:
 *    - Ratio DC/AC admisible [0.85 - 1.35] (IEC 62548).
 *    - Compatibilidad de strings con ventana MPPT del inversor activo.
 *    - Aviso de sedimentación y hot-spots en pendientes < 10°.
 *    - Detección de análisis solar desactualizado (dirty state).
 * ============================================================================
 */

(function(root) {
  'use strict';

  let hudContainer = null;
  let validationBanner = null;
  let lastStateFingerprint = '';
  let _cachedAddress = '';
  let _lastGeocodeCoord = '';
  let _isGeocoding = false;

  function getApproximateAddress(lat, lng) {
    const searchInput = (typeof document !== 'undefined') ? document.getElementById('ra-search-input') : null;
    if (searchInput && searchInput.value && searchInput.value.trim().length > 1) {
      return searchInput.value.trim();
    }
    if (typeof window !== 'undefined' && window.solarProjectConfig && window.solarProjectConfig.address && window.solarProjectConfig.address !== 'Ubicación' && window.solarProjectConfig.address !== 'Ubicación Solar') {
      return window.solarProjectConfig.address;
    }
    if (_cachedAddress) return _cachedAddress;

    if (typeof lat === 'number' && typeof lng === 'number' && !_isGeocoding && typeof fetch === 'function') {
      const coordKey = `${lat.toFixed(2)},${lng.toFixed(2)}`;
      if (coordKey !== _lastGeocodeCoord) {
        _lastGeocodeCoord = coordKey;
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
            if (_cachedAddress && typeof RAProjectStatusHUD !== 'undefined' && typeof RAProjectStatusHUD.update === 'function') {
              RAProjectStatusHUD.update();
            }
          }
        })
        .catch(() => { _isGeocoding = false; });
      }
    }

    if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
      return `${lat.toFixed(3)}° N, ${Math.abs(lng).toFixed(3)}° ${lng >= 0 ? 'E' : 'O'}`;
    }
    return 'Ubicación';
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
        transition: opacity 0.25s ease, transform 0.25s ease;
      `;

      hudContainer.innerHTML = `
        <div id="ra-hud-pill-box" style="
          pointer-events: auto;
          background: rgba(15, 23, 42, 0.90);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(56, 189, 248, 0.35);
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.6), 0 0 15px rgba(56, 189, 248, 0.15);
          border-radius: 10px;
          padding: 8px 14px;
          color: #fff;
          display: flex;
          flex-direction: column;
          gap: 6px;
        ">
          <!-- Fila de Ubicación y Estado de Sombra -->
          <div id="ra-hud-location-row" style="display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 9.5px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); padding-bottom: 4px;">
            <div style="display: flex; align-items: center; gap: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              <span style="color: #38BDF8;">📍</span>
              <span id="ra-hud-location-text" style="font-weight: 600; color: #cbd5e1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 250px;">Ubicación: —</span>
            </div>
            <div id="ra-hud-shadow-badge" style="font-size: 8.5px; font-weight: 700; padding: 1px 6px; border-radius: 4px; background: rgba(56, 189, 248, 0.15); color: #38BDF8; white-space: nowrap;">
              🌤️ Preliminar
            </div>
          </div>

          <!-- Métricas principales (kWp, Inversor, Desglose Teórico vs Neto) -->
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 14px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <div style="width: 8px; height: 8px; border-radius: 50%; background: #10B981; box-shadow: 0 0 8px #10B981;" id="ra-hud-status-dot"></div>
              <div>
                <div style="font-size: 11.5px; font-weight: 900; letter-spacing: 0.3px; color: #f8fafc;" id="ra-hud-kwp-text">0.00 kWp</div>
                <div style="font-size: 9.5px; color: #94a3b8;" id="ra-hud-sub-text">0 paneles · Sin inversor</div>
                <div style="font-size: 9px; font-weight: 700;" id="ra-hud-ratio-badge">Ratio DC/AC —</div>
              </div>
            </div>
            <div style="text-align: right; display: flex; flex-direction: column; gap: 1px;">
              <div style="font-size: 9px; color: #94a3b8; font-family: monospace;">
                Teórico: <span id="ra-hud-theo-energy" style="color: #cbd5e1; font-weight: 700;">— kWh/a</span>
              </div>
              <div style="font-size: 11px; font-weight: 800; font-family: monospace; color: #38BDF8;">
                Neto 3D: <span id="ra-hud-energy-text">— kWh/año</span>
              </div>
              <div id="ra-hud-shadow-detail" style="font-size: 8.5px; font-weight: 600; color: #94a3b8;">
                Sin simulación
              </div>
            </div>
          </div>
        </div>

        <div id="ra-hud-validation-alert" style="
          pointer-events: auto;
          display: none;
          background: rgba(239, 68, 68, 0.92);
          backdrop-filter: blur(8px);
          border-radius: 8px;
          padding: 6px 10px;
          color: #fff;
          font-size: 10px;
          font-weight: 700;
          box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);
          align-items: center;
          gap: 6px;
        ">
          <span id="ra-hud-alert-icon">⚠️</span>
          <span id="ra-hud-alert-text">Alerta de diseño</span>
        </div>
      `;

      document.body.appendChild(hudContainer);
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
    
    // Módulo seleccionado
    let pModW = 450;
    if (cfg.selectedModuleId && Array.isArray(cat.modules)) {
      const mObj = cat.modules.find(m => m.id === cfg.selectedModuleId);
      if (mObj && (mObj.wp || mObj.potencia)) pModW = mObj.wp || mObj.potencia;
    }
    const kwp = (numPanels * pModW) / 1000.0;

    // Inversor seleccionado
    let invKw = 0;
    let invName = 'Inversor no seleccionado';
    let invObj = null;
    if (cfg.selectedInverterId && Array.isArray(cat.inverters)) {
      invObj = cat.inverters.find(i => i.id === cfg.selectedInverterId);
      if (invObj) {
        invKw = invObj.kw || invObj.kw_nominal || 0;
        invName = `${invObj.brand || ''} ${invObj.model || ''} (${invKw} kW)`;
      }
    }
    const invCount = (cfg.autoSizing && cfg.autoSizing.inverters && cfg.autoSizing.inverters.count) ? cfg.autoSizing.inverters.count : 1;
    let totalInvKw = invKw * invCount;

    // Si el usuario no ha fijado manualmente un inversor y la potencia DC difiere enormemente
    // de la potencia del inversor residual (ej. ratio < 0.65 o > 1.50), sincronizar proactivamente:
    if (numPanels > 0 && !cfg.userManuallySelectedInverter && typeof wpAutoSelectOptimalEngineering === 'function') {
      const currentRatio = totalInvKw > 0 ? (kwp / totalInvKw) : 0;
      if (currentRatio < 0.65 || currentRatio > 1.50) {
        try {
          const reMatch = wpAutoSelectOptimalEngineering(false);
          if (reMatch) {
            const newBest = reMatch.recommendedScenarioA || reMatch.recommendedScenarioB;
            if (newBest && newBest.inverter) {
              invObj = newBest.inverter;
              invKw = invObj.kw || 0;
              totalInvKw = newBest.totalAcKw || (invKw * (newBest.count || 1));
              invName = `${invObj.brand || ''} ${invObj.model || ''} (${invKw} kW)`;
            }
          }
        } catch(eAuto) {}
      }
    }

    // Ratio DC/AC
    const ratioDcAc = totalInvKw > 0 ? (kwp / totalInvKw) : 0;

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

    const projLat = (typeof window !== 'undefined' && window.solarProjectConfig && window.solarProjectConfig.lat) || 40.4168;
    const projLng = (typeof window !== 'undefined' && window.solarProjectConfig && window.solarProjectConfig.lng) || -3.7038;
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
      const maxStrings = (invObj.mppts || invObj.mpptCount || 2) * 2;
      stringValidCount = getNearestValidStringModuleCount(numPanels, nsMin, nsMax, maxStrings);
      if (stringValidCount !== numPanels) {
        stringNotice = `Strings no balanceados: recomendado ajustar a ${stringValidCount} paneles (${stringValidCount > numPanels ? '+' : ''}${stringValidCount - numPanels})`;
      }
    }

    return {
      numPanels,
      pModW,
      kwp,
      invKw: totalInvKw,
      invName,
      ratioDcAc,
      annualKWh,
      theoreticalAnnualKWh,
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

    // Ocultar si no hay paneles diseñados (0 kWp) o en pantallas móviles (<= 768px)
    const isMobile = (typeof window !== 'undefined' && window.innerWidth <= 768);
    if (isMobile || s.numPanels === 0) {
      hudContainer.style.display = 'none';
      return;
    } else {
      hudContainer.style.display = 'flex';
    }

    // Fingerprint para evitar renders innecesarios
    const currentFingerprint = `${s.numPanels}_${s.kwp.toFixed(2)}_${s.invKw.toFixed(1)}_${s.isHeatmapDirty}_${s.annualKWh}_${s.theoreticalAnnualKWh}_${s.hasSimulation}_${s.approxAddress}_${s.shadowLossPct}`;
    if (currentFingerprint === lastStateFingerprint) return;
    lastStateFingerprint = currentFingerprint;

    // Actualizar textos
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

    if (locationEl) locationEl.textContent = s.approxAddress || 'Ubicación';

    if (kwpEl) kwpEl.textContent = `${s.kwp.toFixed(2)} kWp`;
    if (subEl) subEl.textContent = `${s.numPanels} paneles · ${s.invKw > 0 ? (s.invKw.toFixed(1) + ' kW AC') : 'Sin inversor'}`;

    if (theoEnergyEl) {
      theoEnergyEl.textContent = s.theoreticalAnnualKWh > 0 ? `${Math.round(s.theoreticalAnnualKWh).toLocaleString('es-ES')} kWh/a` : '— kWh/a';
    }

    if (energyEl) {
      energyEl.textContent = s.annualKWh > 0 ? `${Math.round(s.annualKWh).toLocaleString('es-ES')} kWh/a` : '— kWh/año';
      if (s.hasSimulation && !s.isHeatmapDirty) {
        energyEl.style.color = '#10B981';
      } else {
        energyEl.style.color = '#38BDF8';
      }
    }

    if (shadowBadgeEl) {
      if (s.isHeatmapDirty) {
        shadowBadgeEl.textContent = '⚠️ Recálculo pendiente';
        shadowBadgeEl.style.background = 'rgba(245, 158, 11, 0.20)';
        shadowBadgeEl.style.color = '#F59E0B';
      } else if (s.hasSimulation) {
        shadowBadgeEl.textContent = `🎯 3D Simulado (${s.shadowLossPct > 0 ? '-' + s.shadowLossPct.toFixed(1) + '%' : '0%'} sombra)`;
        shadowBadgeEl.style.background = 'rgba(16, 185, 129, 0.20)';
        shadowBadgeEl.style.color = '#10B981';
      } else {
        shadowBadgeEl.textContent = '🌤️ Teórico preliminar';
        shadowBadgeEl.style.background = 'rgba(56, 189, 248, 0.15)';
        shadowBadgeEl.style.color = '#38BDF8';
      }
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

    // Badge Ratio DC/AC
    if (ratioEl) {
      if (s.ratioDcAc > 0) {
        ratioEl.textContent = `Ratio DC/AC: ${s.ratioDcAc.toFixed(2)}`;
        if (s.ratioDcAc >= 0.95 && s.ratioDcAc <= 1.30) {
          ratioEl.style.color = '#34D399'; // Verde óptimo
        } else if (s.ratioDcAc > 1.30 && s.ratioDcAc <= 1.45) {
          ratioEl.style.color = '#FBBF24'; // Ámbar sobrecarga moderada
        } else {
          ratioEl.style.color = '#F87171'; // Rojo fuera de rango
        }
      } else {
        ratioEl.textContent = 'Ratio DC/AC —';
        ratioEl.style.color = '#94a3b8';
      }
    }

    // Dot de estado del análisis
    if (dotEl) {
      if (s.isHeatmapDirty) {
        dotEl.style.background = '#F59E0B';
        dotEl.style.boxShadow = '0 0 8px #F59E0B';
        dotEl.title = 'Análisis solar desactualizado tras cambios de diseño';
      } else if (s.numPanels > 0) {
        dotEl.style.background = '#10B981';
        dotEl.style.boxShadow = '0 0 8px #10B981';
        dotEl.title = 'Diseño al día';
      } else {
        dotEl.style.background = '#64748B';
        dotEl.style.boxShadow = 'none';
        dotEl.title = 'Sin paneles generados';
      }
    }

    // Alertas proactivas automáticas (Hito 9)
    if (alertBox && alertText) {
      const alertIcon = document.getElementById('ra-hud-alert-icon');
      let alertMsg = null;
      let alertLevel = 'warning';

      if (s.numPanels > 0 && s.invKw > 0) {
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

      if (alertMsg) {
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
  }

  // Bucle de sincronización reactiva no bloqueante
  let timerId = null;
  function startSync() {
    if (typeof window === 'undefined') return;
    if (timerId) clearInterval(timerId);
    timerId = setInterval(updateHUD, 1200);
    setTimeout(updateHUD, 200);
  }

  const RAProjectStatusHUD = {
    update: updateHUD,
    inspect: inspectProjectState,
    start: startSync
  };

  if (!root.RA) root.RA = {};
  root.RA.ProjectStatusHUD = RAProjectStatusHUD;
  root.RAProjectStatusHUD = RAProjectStatusHUD;

  // Iniciar automáticamente cuando el DOM esté listo
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', startSync);
    } else {
      startSync();
    }
  }

})(typeof window !== 'undefined' ? window : globalThis);
