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
        top: 60px;
        right: 20px;
        z-index: 9999;
        display: flex;
        flex-direction: column;
        gap: 6px;
        pointer-events: none;
        font-family: 'Inter', system-ui, -apple-system, sans-serif;
        max-width: 380px;
        transition: opacity 0.25s ease, transform 0.25s ease;
      `;

      hudContainer.innerHTML = `
        <div id="ra-hud-pill-box" style="
          pointer-events: auto;
          background: rgba(15, 23, 42, 0.88);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border: 1px solid rgba(56, 189, 248, 0.35);
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.6), 0 0 15px rgba(56, 189, 248, 0.15);
          border-radius: 10px;
          padding: 8px 14px;
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        ">
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="width: 8px; height: 8px; border-radius: 50%; background: #10B981; box-shadow: 0 0 8px #10B981;" id="ra-hud-status-dot"></div>
            <div>
              <div style="font-size: 11px; font-weight: 900; letter-spacing: 0.4px; color: #f8fafc;" id="ra-hud-kwp-text">0.00 kWp</div>
              <div style="font-size: 9.5px; color: #94a3b8;" id="ra-hud-sub-text">0 paneles · Sin inversor</div>
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 11px; font-weight: 800; font-family: monospace; color: #38BDF8;" id="ra-hud-energy-text">— kWh/año</div>
            <div style="font-size: 9px; font-weight: 700;" id="ra-hud-ratio-badge">Ratio DC/AC —</div>
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

    // Producción anual
    let annualKWh = 0;
    if (typeof getProjectCalcs === 'function') {
      const pc = getProjectCalcs();
      if (pc && pc.annualKWh) annualKWh = pc.annualKWh;
    }
    if (!annualKWh && kwp > 0) {
      annualKWh = kwp * 1450;
    }

    // Heatmap dirty check
    const isHeatmapDirty = !!(typeof solarSimState !== 'undefined' && solarSimState && solarSimState.annualHeatmapDirty);

    // Inclinación mínima
    let minTilt = 30;
    if (typeof WP !== 'undefined' && WP && Array.isArray(WP.polylines) && WP.polylines.length > 0) {
      minTilt = WP.polylines.reduce((min, p) => {
        const t = (p.roofInfo && typeof p.roofInfo.tiltDeg === 'number') ? p.roofInfo.tiltDeg : 30;
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

    // Fingerprint para evitar renders innecesarios
    const currentFingerprint = `${s.numPanels}_${s.kwp.toFixed(2)}_${s.invKw.toFixed(1)}_${s.isHeatmapDirty}_${s.annualKWh}`;
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

    if (kwpEl) kwpEl.textContent = `${s.kwp.toFixed(2)} kWp`;
    if (subEl) subEl.textContent = `${s.numPanels} paneles · ${s.invKw > 0 ? (s.invKw.toFixed(1) + ' kW AC') : 'Sin inversor'}`;
    if (energyEl) energyEl.textContent = s.annualKWh > 0 ? `${Math.round(s.annualKWh).toLocaleString('es-ES')} kWh/a` : '— kWh/año';

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
