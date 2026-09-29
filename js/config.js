// RA-CONFIG-GUARDED — Cargado de forma segura sin colisionar con index.html
(function() {
  'use strict';
'use strict';

// ── Claves y Tokens ────────────────────────────────────────────────────────
const GOOGLE_MAPS_API_KEY = 'AIzaSyAj-cG-tvA-WSaQvC6axmHnQK4WM5VDQWA';
const CESIUM_ION_TOKEN    = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJhYTYwM2YzZC0zZDIwLTQ3YWQtYWQ5OC01MTkyMzkzYzNmMjQiLCJpZCI6NDU4MjA0LCJpc3MiOiJodHRwczovL2FwaS5jZXNpdW0uY29tIiwiYXVkIjoidW5kZWZpbmVkX2RlZmF1bHQiLCJpYXQiOjE3ODQ0OTI0Njl9.DV-6rn9Hp3XsrxH0xZJGQJQddYK-WyRV5ZQ5dJSwqVk';

Cesium.Ion.defaultAccessToken = CESIUM_ION_TOKEN;
Cesium.GoogleMaps.defaultApiKey = GOOGLE_MAPS_API_KEY;

// ── Pantalla de Carga e Indicadores de Geometría 3D ─────────────────────────
const ldBar    = document.getElementById('ld-bar');
const ldMsg    = document.getElementById('ld-msg');
const ldScreen = document.getElementById('ra-loading');
const tilesLoadingEl = document.getElementById('ra-3d-tiles-loading');
const tilesMsgEl = document.getElementById('ra-3d-tiles-msg');
const tilesCountEl = document.getElementById('ra-3d-tiles-count');

function setLoad(pct, msg) {
  if (ldBar) ldBar.style.width = pct + '%';
  if (ldMsg && msg) ldMsg.textContent = msg;
}

let loadingHidden = false;
function hideLoading() {
  if (loadingHidden) return;
  loadingHidden = true;
  if (ldScreen) {
    ldScreen.classList.add('fade-out');
    setTimeout(() => {
      if (ldScreen.parentNode) ldScreen.remove();
    }, 600);
  }
}

let tilesLoadHideTimer = null;
function show3DTilesLoading(msg, pendingCount) {
  if (!tilesLoadingEl) return;
  if (tilesMsgEl && msg) tilesMsgEl.textContent = msg;
  if (tilesCountEl) {
    tilesCountEl.textContent = (typeof pendingCount === 'number' && pendingCount > 0) ? (pendingCount + ' tiles') : 'Renderizando 3D';
  }
  clearTimeout(tilesLoadHideTimer);
  tilesLoadingEl.classList.add('visible');
}

function hide3DTilesLoading(delayMs) {
  if (!tilesLoadingEl) return;
  clearTimeout(tilesLoadHideTimer);
  tilesLoadHideTimer = setTimeout(() => {
    if (tilesLoadingEl) tilesLoadingEl.classList.remove('visible');
  }, delayMs || 600);
}

// ── Estado y Notificaciones ────────────────────────────────────────────────
const statusEl = document.getElementById('ra-status');
let statusTimer;

function showStatus(msg, ms) {
  if (!statusEl) return;
  statusEl.textContent = msg;
  statusEl.classList.add('visible');
  clearTimeout(statusTimer);
  if (ms) statusTimer = setTimeout(hideStatus, ms);
}

function hideStatus() {
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

  // Exportar solo si no existen ya en window
  if (typeof window.showStatus === 'undefined' && typeof showStatus === 'function')
    window.showStatus = showStatus;
  if (typeof window.hideLoading === 'undefined' && typeof hideLoading === 'function')
    window.hideLoading = hideLoading;
  if (typeof window.show3DTilesLoading === 'undefined' && typeof show3DTilesLoading === 'function')
    window.show3DTilesLoading = show3DTilesLoading;
  if (typeof window.hide3DTilesLoading === 'undefined' && typeof hide3DTilesLoading === 'function')
    window.hide3DTilesLoading = hide3DTilesLoading;

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