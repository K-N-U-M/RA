// RA-CONFIG-GUARDED — Cargado de forma segura sin colisionar con index.html
(function() {
  'use strict';
'use strict';

// ── Claves y Tokens ────────────────────────────────────────────────────────
// [AUD-2026 · B-04] Las credenciales viven en `js/ra-env.js` (no versionado, ver .gitignore).
// Este módulo solo las consume; si faltan, la app avisa en vez de arrancar a medias.
const _RA_ENV = (typeof window !== 'undefined' && window.RA_ENV) ? window.RA_ENV : {};
let _lsGoogleKey = '';
let _lsCesiumToken = '';
try {
  if (typeof localStorage !== 'undefined' && localStorage) {
    _lsGoogleKey = (localStorage.getItem('ra_google_maps_key') || '').trim();
    _lsCesiumToken = (localStorage.getItem('ra_cesium_ion_token') || '').trim();
  }
} catch (_e) {}
const GOOGLE_MAPS_API_KEY = _lsGoogleKey || _RA_ENV.googleMaps || '';
const CESIUM_ION_TOKEN    = _lsCesiumToken || _RA_ENV.cesiumIon || '';

// ── Fuente única de verdad de claves/tokens ─────────────────────────────────
// index.html delega aquí (window.RA_CONFIG_KEYS) para no duplicar secretos en el bundle.
window.RA_CONFIG_KEYS = { googleMaps: GOOGLE_MAPS_API_KEY, cesiumIon: CESIUM_ION_TOKEN };

if (!GOOGLE_MAPS_API_KEY || !CESIUM_ION_TOKEN) {
  if (typeof document === 'undefined' || !document || typeof document.createElement !== 'function') {
    // Entornos headless (tests/VM): no se intenta pintar el aviso, solo se avisa por consola.
    if (typeof console !== 'undefined') console.warn('[RA] Faltan credenciales RA_ENV; visor deshabilitado.');
    return;
  }
  const _cfgFatal = document.createElement('div');
  _cfgFatal.id = 'ra-missing-env';
  _cfgFatal.style.cssText = 'position:fixed;inset:0;z-index:999999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:#0b1120;color:#e2e8f0;font-family:system-ui,sans-serif;text-align:center;padding:24px;';
  _cfgFatal.innerHTML = '<div style="font-size:40px;">🔑</div>' +
    '<div style="font-size:18px;font-weight:800;">Faltan las credenciales del visor</div>' +
    '<div style="font-size:13px;color:#94a3b8;max-width:520px;line-height:1.6;">Copia <code>js/ra-env.example.js</code> a <code>js/ra-env.js</code> y rellena las claves restringidas. Ese archivo no se versiona.</div>';
  (document.body || document.documentElement).appendChild(_cfgFatal);
  return;
}

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
  (document.body || document.documentElement).appendChild(_fatal);
  return;
}

Cesium.Ion.defaultAccessToken = CESIUM_ION_TOKEN;
Cesium.GoogleMaps.defaultApiKey = GOOGLE_MAPS_API_KEY;

// ── Configuración Global del Módulo Fotovoltaico Activo ──────────────────────
let panelConfig = {
  modelo: 'Tier 1 Mono PERC 450W',
  tecnologia: 'Monocristalino',
  largo: 2.10,
  ancho: 1.05,
  potencia: 450,
  rendimiento: 21.5,
  precio: 135
};
if (typeof window !== 'undefined' && typeof window.panelConfig === 'undefined') {
  window.panelConfig = panelConfig;
}

// ── PALETA DE COLORES PROFESIONAL PARA STRINGS INDEPENDIENTES (12 Colores) ──
if (typeof window !== 'undefined' && typeof window.RA_STRING_PALETTE === 'undefined') {
  window.RA_STRING_PALETTE = [
    { name: "String #1", hex: "#00F0FF", rgb: [0, 240, 255], css: "#00F0FF" },   // Cyan Eléctrico
    { name: "String #2", hex: "#A855F7", rgb: [168, 85, 247], css: "#A855F7" }, // Violeta Neón
    { name: "String #3", hex: "#10B981", rgb: [16, 185, 129], css: "#10B981" }, // Verde Esmeralda
    { name: "String #4", hex: "#F59E0B", rgb: [245, 158, 11], css: "#F59E0B" }, // Ámbar Solar
    { name: "String #5", hex: "#F43F5E", rgb: [244, 63, 94], css: "#F43F5E" },   // Rosa / Fucsia
    { name: "String #6", hex: "#3B82F6", rgb: [59, 130, 246], css: "#3B82F6" }, // Azul Cobalto
    { name: "String #7", hex: "#84CC16", rgb: [132, 204, 22], css: "#84CC16" }, // Lima Neón
    { name: "String #8", hex: "#FF6B00", rgb: [255, 107, 0], css: "#FF6B00" },   // Naranja Fuego
    { name: "String #9", hex: "#14B8A6", rgb: [20, 184, 166], css: "#14B8A6" }, // Turquesa
    { name: "String #10", hex: "#EAB308", rgb: [234, 179, 8], css: "#EAB308" }, // Oro Brillante
    { name: "String #11", hex: "#EF4444", rgb: [239, 68, 68], css: "#EF4444" }, // Rojo Carmín
    { name: "String #12", hex: "#8B5CF6", rgb: [139, 92, 246], css: "#8B5CF6" } // Púrpura Imperial
  ];
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
    estandar: { soiling: 0.025, wiring: 0.015, mismatch: 0.020, availability: 0.005, iamAngular: 0.028, spectral: 0.010, bypass: 0.025, bypassMlpe: 0.005 },
    urbano:   { soiling: 0.035, wiring: 0.015, mismatch: 0.020, availability: 0.005, iamAngular: 0.030, spectral: 0.011, bypass: 0.025, bypassMlpe: 0.005 },
    rural:    { soiling: 0.050, wiring: 0.020, mismatch: 0.022, availability: 0.008, iamAngular: 0.028, spectral: 0.010, bypass: 0.025, bypassMlpe: 0.005 },
    optimo:   { soiling: 0.015, wiring: 0.010, mismatch: 0.015, availability: 0.003, iamAngular: 0.025, spectral: 0.008, bypass: 0.020, bypassMlpe: 0.005 }
  };
  var savedLosses = null;
  try { savedLosses = JSON.parse(localStorage.getItem('ra_solar_loss_config')); } catch (e) {}
  window.solarLossConfig = Object.assign({}, LOSS_DEFAULTS, (savedLosses && typeof savedLosses === 'object') ? savedLosses : {});
  window.raGetLossDefaults = function() { return Object.assign({}, LOSS_DEFAULTS); };
  window.raApplyLossPreset = function(key) {
    if (PRESETS_PERDIDAS[key]) {
      Object.assign(window.solarLossConfig, PRESETS_PERDIDAS[key], { userCustomizedWiring: true });
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
    var prBOS = (1 - soiling) * (1 - wiring) * (1 - mismatch) * (1 - availability) * (1 - spectral) * (1 - bypass) * (1 - inverter);
    var prElec = prBOS * (1 - iamAngular);
    var tFactor = (typeof thermalDeratingFactor === 'number' && thermalDeratingFactor > 0) ? thermalDeratingFactor : 0.925;
    var prTotal = prElec * tFactor;

    return {
      prTotal: Math.max(0.40, Math.min(0.98, prTotal)),
      prElec: Math.max(0.50, Math.min(0.98, prElec)),
      prBOS: Math.max(0.50, Math.min(0.98, prBOS)),
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