// RA-CONFIG-GUARDED — Cargado de forma segura sin colisionar con index.html
(function() {
  'use strict';
'use strict';

// ── Claves y Tokens ────────────────────────────────────────────────────────
const GOOGLE_MAPS_API_KEY = 'AIzaSyAj-cG-tvA-WSaQvC6axmHnQK4WM5VDQWA';
const CESIUM_ION_TOKEN    = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJhYTYwM2YzZC0zZDIwLTQ3YWQtYWQ5OC01MTkyMzkzYzNmMjQiLCJpZCI6NDU4MjA0LCJpc3MiOiJodHRwczovL2FwaS5jZXNpdW0uY29tIiwiYXVkIjoidW5kZWZpbmVkX2RlZmF1bHQiLCJpYXQiOjE3ODQ0OTI0Njl9.DV-6rn9Hp3XsrxH0xZJGQJQddYK-WyRV5ZQ5dJSwqVk';

// [P3] Resiliencia CDN: sin CesiumJS (sin red / CDN caído) esto lanzaba ReferenceError
// y el usuario se quedaba con pantalla en blanco sin explicación alguna.
if (typeof Cesium === 'undefined') {
  const _ldScr = document.getElementById('ra-loading');
  if (_ldScr && _ldScr.parentNode) _ldScr.parentNode.removeChild(_ldScr);
  const _fatal = document.createElement('div');
  _fatal.id = 'ra-fatal-cdn';
  _fatal.style.cssText = 'position:fixed;inset:0;z-index:999999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:#0b1120;color:#e2e8f0;font-family:system-ui,sans-serif;text-align:center;padding:24px;';
  _fatal.innerHTML = '<div style="font-size:44px;">📡</div>' +
    '<div style="font-size:19px;font-weight:800;letter-spacing:-0.3px;">No se pudo cargar CesiumJS</div>' +
    '<div style="font-size:13px;color:#94a3b8;max-width:460px;line-height:1.6;">El visor 3D requiere el CDN de Cesium (cesium.com) y el motor de fotogrametría de Google. Comprueba tu conexión a internet y recarga la página.</div>' +
    '<button onclick="location.reload()" style="margin-top:8px;background:#2563eb;color:#fff;border:none;border-radius:8px;padding:10px 22px;font-size:13px;font-weight:700;cursor:pointer;">🔄 Recargar</button>';
  document.body.appendChild(_fatal);
  return;
}

Cesium.Ion.defaultAccessToken = CESIUM_ION_TOKEN;
Cesium.GoogleMaps.defaultApiKey = GOOGLE_MAPS_API_KEY;

// ── Pantalla de Carga e Indicadores de Geometría 3D (Consulta Dinámica) ─────
function setLoad(pct, msg) {
  const bar = document.getElementById('ld-bar');
  const txt = document.getElementById('ld-msg');
  if (bar) bar.style.width = pct + '%';
  if (txt && msg) txt.textContent = msg;
}

let loadingHidden = false;
function hideLoading() {
  if (loadingHidden) return;
  loadingHidden = true;
  const screen = document.getElementById('ra-loading');
  if (screen) {
    screen.classList.add('fade-out');
    setTimeout(() => {
      if (screen.parentNode) screen.remove();
    }, 600);
  }
}

let tilesLoadHideTimer = null;
function show3DTilesLoading(msg, pendingCount) {
  const tilesLoadingEl = document.getElementById('ra-3d-tiles-loading');
  const tilesMsgEl = document.getElementById('ra-3d-tiles-msg');
  const tilesCountEl = document.getElementById('ra-3d-tiles-count');
  if (!tilesLoadingEl) return;
  if (tilesMsgEl && msg) tilesMsgEl.textContent = msg;
  if (tilesCountEl) {
    tilesCountEl.textContent = (typeof pendingCount === 'number' && pendingCount > 0) ? (pendingCount + ' tiles') : 'Renderizando 3D';
  }
  clearTimeout(tilesLoadHideTimer);
  tilesLoadingEl.classList.add('visible');
}

function hide3DTilesLoading(delayMs) {
  clearTimeout(tilesLoadHideTimer);
  tilesLoadHideTimer = setTimeout(() => {
    const tilesLoadingEl = document.getElementById('ra-3d-tiles-loading');
    if (tilesLoadingEl) tilesLoadingEl.classList.remove('visible');
  }, delayMs || 600);
}

// ── Estado y Notificaciones ────────────────────────────────────────────────
let statusTimer;

function showStatus(msg, ms) {
  const statusEl = document.getElementById('ra-status');
  if (!statusEl) return;
  statusEl.textContent = msg;
  statusEl.classList.add('visible');
  clearTimeout(statusTimer);
  if (ms) statusTimer = setTimeout(hideStatus, ms);
}

function hideStatus() {
  const statusEl = document.getElementById('ra-status');
  if (statusEl) statusEl.classList.remove('visible');
}

// Fallback de seguridad para pantalla de bienvenida completa
setTimeout(hideLoading, 8000);

// Configuración Global del Módulo Fotovoltaico Activo
let panelConfig = {
  modelo: 'Tier 1 Mono PERC 450W',
  tecnologia: 'Monocristalino',
  largo: 2.10,
  ancho: 1.05,
  potencia: 450,
  rendimiento: 21.5,
  precio: 135
};

  // Exportar utilidades sólo si no existen en window (respetando definiciones prioritarias)
  if (typeof window !== 'undefined') {
    if (typeof window.setLoad === 'undefined') window.setLoad = setLoad;
    if (typeof window.hideLoading === 'undefined') window.hideLoading = hideLoading;
    if (typeof window.show3DTilesLoading === 'undefined') window.show3DTilesLoading = show3DTilesLoading;
    if (typeof window.hide3DTilesLoading === 'undefined') window.hide3DTilesLoading = hide3DTilesLoading;
    if (typeof window.showStatus === 'undefined') window.showStatus = showStatus;
    if (typeof window.hideStatus === 'undefined') window.hideStatus = hideStatus;
  }

  // ── Pérdidas del sistema configurables (árbol de pérdidas tipo PVsyst) ──
  // Valores en FRACCIÓN (0.025 = 2.5%). El ingeniero debe poder justificar el PR:
  // antes estaban hardcodeadas en los motores de energía.
  var LOSS_DEFAULTS = {
    soiling: 0.025,       // suciedad / polvo en paneles
    wiring: 0.015,        // pérdidas óhmicas DC
    mismatch: 0.020,      // dispersiones entre módulos
    availability: 0.005,  // paradas / mantenimiento
    iamAngular: 0.028,    // pérdida angular de incidencia (PVsyst típico)
    spectral: 0.010,      // desajuste espectral
    bypass: 0.025,        // diodos de bypass SIN MLPE
    bypassMlpe: 0.005     // diodos de bypass CON optimizadores/microinversores
  };
  var PRESETS_PERDIDAS = {
    estandar: { soiling: 0.025, wiring: 0.015, mismatch: 0.020, availability: 0.005, iamAngular: 0.028, spectral: 0.010 },
    urbano:   { soiling: 0.035, wiring: 0.015, mismatch: 0.020, availability: 0.005, iamAngular: 0.030, spectral: 0.011 },
    rural:    { soiling: 0.050, wiring: 0.020, mismatch: 0.022, availability: 0.008, iamAngular: 0.028, spectral: 0.010 },
    optimo:   { soiling: 0.015, wiring: 0.010, mismatch: 0.015, availability: 0.003, iamAngular: 0.025, spectral: 0.008 }
  };
  var savedLosses = null;
  try { savedLosses = JSON.parse(localStorage.getItem('ra_solar_loss_config')); } catch (e) {}
  window.solarLossConfig = Object.assign({}, LOSS_DEFAULTS, (savedLosses && typeof savedLosses === 'object') ? savedLosses : {});
  window.raGetLossDefaults = function() { return Object.assign({}, LOSS_DEFAULTS); };
  window.raApplyLossPreset = function(key) {
    if (PRESETS_PERDIDAS[key]) {
      Object.assign(window.solarLossConfig, PRESETS_PERDIDAS[key]);
      try { localStorage.setItem('ra_solar_loss_config', JSON.stringify(window.solarLossConfig)); } catch (e) {}
    }
    return window.solarLossConfig;
  };
  window.raSaveLossConfig = function() {
    try { localStorage.setItem('ra_solar_loss_config', JSON.stringify(window.solarLossConfig)); } catch (e) {}
  };

  /**
   * Cálculo canónico del Performance Ratio (PR) del sistema según pérdidas configuradas.
   * SSOT para HUD, simulación anual, cálculos eléctricos y memorias técnicas.
   */
  window.raCalculateSystemPR = function(thermalDeratingFactor) {
    var lc = (typeof window !== 'undefined' && window.solarLossConfig) ? window.solarLossConfig : {};
    var soiling = Number(lc.soiling) >= 0 ? Number(lc.soiling) : 0.025;
    var wiring = Number(lc.wiring) >= 0 ? Number(lc.wiring) : 0.015;
    var mismatch = Number(lc.mismatch) >= 0 ? Number(lc.mismatch) : 0.020;
    var availability = Number(lc.availability) >= 0 ? Number(lc.availability) : 0.005;
    var iamAngular = (Number(lc.iamAngular) >= 0 ? Number(lc.iamAngular) : (Number(lc.iam) >= 0 ? Number(lc.iam) : 0.028));
    var spectral = Number(lc.spectral) >= 0 ? Number(lc.spectral) : 0.010;

    var hasMLPE = (typeof window.solarProjectConfig !== 'undefined' && window.solarProjectConfig && window.solarProjectConfig.selectedTopology === 'microinverter') ||
                  (typeof window.allRenderedPanels !== 'undefined' && Array.isArray(window.allRenderedPanels) && window.allRenderedPanels.some(function(p) { return p.hasMLPE; }));
    var bypass = hasMLPE ? (Number(lc.bypassMlpe) >= 0 ? Number(lc.bypassMlpe) : 0.005) : (Number(lc.bypass) >= 0 ? Number(lc.bypass) : 0.025);
    var inverter = 0.025; // 97.5% rendimiento inversor típico

    // PR eléctrico y óptico base en cascada
    var prElec = (1 - soiling) * (1 - wiring) * (1 - mismatch) * (1 - availability) * (1 - iamAngular) * (1 - spectral) * (1 - bypass) * (1 - inverter);
    var tFactor = (typeof thermalDeratingFactor === 'number' && thermalDeratingFactor > 0) ? thermalDeratingFactor : 0.925;
    var prTotal = prElec * tFactor;

    return {
      prTotal: Math.max(0.40, Math.min(0.98, prTotal)),
      prElec: Math.max(0.50, Math.min(0.98, prElec)),
      totalLossFraction: 1 - prTotal,
      thermalDeratingFactor: tFactor,
      factors: {
        soiling: soiling,
        wiring: wiring,
        mismatch: mismatch,
        availability: availability,
        iamAngular: iamAngular,
        spectral: spectral,
        bypass: bypass,
        inverter: inverter
      }
    };
  };

  // ── Red de seguridad global de promesas (Fase 4 · arquitectura) ────────────
  // Ninguna función async del proyecto tenía .catch: un rechazo silencioso dejaba
  // la app en estado indefinido. Captura cualquier rechazo no gestionado, informa
  // al usuario y registra el contexto en consola.
  window.addEventListener('unhandledrejection', function(ev) {
    const razon = (ev && ev.reason && (ev.reason.message || ev.reason)) || 'desconocida';
    console.error('[RA] Promesa rechazada sin gestionar:', razon, ev && ev.reason);
    if (typeof window.showToast === 'function') {
      try {
        window.showToast('ERROR INTERNO', 'Operación asíncrona fallida: ' + razon, 'error', 4000);
      } catch (e) { /* toast no disponible aún */ }
    }
    ev.preventDefault();
  });
})();