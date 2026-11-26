// js/ra-credentials-prompt.js — Gestión local de credenciales (Cesium Ion + Google Maps 3D)
(function (global) {
  'use strict';

  var LS_CESIUM = 'ra_env_cesium_token';
  var LS_GOOGLE = 'ra_env_google_maps_key';

  function hydrateFromStorage() {
    global.RA_ENV = global.RA_ENV || {};
    try {
      var savedCesium = global.localStorage ? global.localStorage.getItem(LS_CESIUM) : '';
      var savedGoogle = global.localStorage ? global.localStorage.getItem(LS_GOOGLE) : '';
      if (!global.RA_ENV.cesiumIon && !global.RA_ENV.CESIUM_ION_TOKEN && savedCesium) {
        global.RA_ENV.cesiumIon = savedCesium.trim();
        global.RA_ENV.CESIUM_ION_TOKEN = savedCesium.trim();
      }
      if (!global.RA_ENV.googleMaps && !global.RA_ENV.GOOGLE_MAPS_API_KEY && savedGoogle) {
        global.RA_ENV.googleMaps = savedGoogle.trim();
        global.RA_ENV.GOOGLE_MAPS_API_KEY = savedGoogle.trim();
      }
    } catch (e) {
      if (global.console && global.console.debug) global.console.debug('[RA Credentials] localStorage no disponible:', e);
    }
  }

  function hasRequiredCredentials() {
    var env = global.RA_ENV || {};
    return Boolean(
      ((env.cesiumIon || env.CESIUM_ION_TOKEN) && String(env.cesiumIon || env.CESIUM_ION_TOKEN).trim().length > 5) ||
      ((env.googleMaps || env.GOOGLE_MAPS_API_KEY) && String(env.googleMaps || env.GOOGLE_MAPS_API_KEY).trim().length > 5)
    );
  }

  function saveCredentials(cesiumToken, googleKey) {
    global.RA_ENV = global.RA_ENV || {};
    var c = String(cesiumToken || '').trim();
    var g = String(googleKey || '').trim();
    if (c) {
      global.RA_ENV.cesiumIon = c;
      global.RA_ENV.CESIUM_ION_TOKEN = c;
    }
    if (g) {
      global.RA_ENV.googleMaps = g;
      global.RA_ENV.GOOGLE_MAPS_API_KEY = g;
    }
    try {
      if (global.localStorage) {
        if (c) global.localStorage.setItem(LS_CESIUM, c);
        if (g) global.localStorage.setItem(LS_GOOGLE, g);
      }
    } catch (e) {
      if (global.showToast) global.showToast('No se pudieron guardar las credenciales en localStorage.', 'warning');
    }
  }

  function openModal() {
    if (typeof document === 'undefined' || !document.body) return;
    var existing = document.getElementById('ra-credentials-gate');
    if (existing) {
      existing.style.display = 'flex';
      return;
    }

    var env = global.RA_ENV || {};
    var overlay = document.createElement('div');
    overlay.id = 'ra-credentials-gate';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Configurar credenciales del visor 3D');
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:2147483647 !important',
      'background:rgba(231,234,238,0.8)', 'backdrop-filter:blur(8px)',
      'display:flex', 'align-items:center', 'justify-content:center', 'padding:16px',
      'font-family:var(--font-sans, Inter, system-ui, sans-serif)'
    ].join(';');

    var card = document.createElement('div');
    card.style.cssText = [
      'width:100%', 'max-width:460px', 'background:#f3f5f8', 'color:#1e242b',
      'border:1px solid rgba(255,255,255,0.75)', 'border-radius:16px',
      'padding:22px', 'box-shadow:10px 10px 24px rgba(163,173,188,0.48),-10px -10px 24px rgba(255,255,255,0.9)'
    ].join(';');

    card.innerHTML = '' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">' +
        '<h3 style="margin:0;font-size:16px;font-weight:700;color:#e84a27;">Credenciales del Visor 3D</h3>' +
        '<button type="button" id="ra-cred-close" aria-label="Cerrar" style="background:transparent;border:none;color:#57606a;font-size:20px;cursor:pointer;line-height:1;">&times;</button>' +
      '</div>' +
      '<p style="margin:0 0 14px;font-size:12.5px;line-height:1.5;color:#57606a;">' +
        'Faltan las claves de acceso para cargar el mapa 3D. Se guardarán únicamente en tu navegador (<strong style="color:#1e242b;">localStorage</strong>) y nunca se subirán al repositorio.' +
      '</p>' +
      '<label style="display:block;font-size:12px;font-weight:600;color:#1e242b;margin-bottom:4px;">Cesium Ion Token</label>' +
      '<input id="ra-cred-cesium" type="password" autocomplete="off" placeholder="eyJhbGciOi..." style="width:100%;box-sizing:border-box;padding:9px 11px;margin-bottom:12px;border-radius:8px;border:1px solid rgba(255,255,255,0.6);background:#dfe3e8;color:#1e242b;box-shadow:inset 2px 2px 5px rgba(163,173,188,0.45),inset -2px -2px 5px rgba(255,255,255,0.8);font-size:12.5px;">' +
      '<label style="display:block;font-size:12px;font-weight:600;color:#1e242b;margin-bottom:4px;">Google Maps 3D API Key</label>' +
      '<input id="ra-cred-google" type="password" autocomplete="off" placeholder="AIzaSy..." style="width:100%;box-sizing:border-box;padding:9px 11px;margin-bottom:16px;border-radius:8px;border:1px solid rgba(255,255,255,0.6);background:#dfe3e8;color:#1e242b;box-shadow:inset 2px 2px 5px rgba(163,173,188,0.45),inset -2px -2px 5px rgba(255,255,255,0.8);font-size:12.5px;">' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
        '<button type="button" id="ra-cred-skip" style="padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.7);background:#ebedf0;color:#57606a;box-shadow:3px 3px 6px rgba(163,173,188,0.35),-3px -3px 6px rgba(255,255,255,0.8);font-size:12px;cursor:pointer;">Continuar sin mapa</button>' +
        '<button type="button" id="ra-cred-save" style="padding:8px 14px;border-radius:8px;border:none;background:#e84a27;color:#fff;box-shadow:3px 3px 8px rgba(232,74,39,0.3);font-weight:600;font-size:12.5px;cursor:pointer;">Guardar y cargar visor</button>' +
      '</div>';

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    var inpC = document.getElementById('ra-cred-cesium');
    var inpG = document.getElementById('ra-cred-google');
    if (inpC && env.CESIUM_ION_TOKEN) inpC.value = env.CESIUM_ION_TOKEN;
    if (inpG && env.GOOGLE_MAPS_API_KEY) inpG.value = env.GOOGLE_MAPS_API_KEY;

    document.getElementById('ra-cred-close').onclick = function () { overlay.style.display = 'none'; };
    document.getElementById('ra-cred-skip').onclick = function () { overlay.style.display = 'none'; };
    document.getElementById('ra-cred-save').onclick = function () {
      var cVal = inpC ? inpC.value.trim() : '';
      var gVal = inpG ? inpG.value.trim() : '';
      if (!cVal && !gVal) {
        if (global.showToast) global.showToast('Introduce al menos un token de Cesium Ion o Google Maps.', 'warning');
        return;
      }
      saveCredentials(cVal, gVal);
      overlay.style.display = 'none';
      if (global.location && typeof global.location.reload === 'function') {
        global.location.reload();
      }
    };
  }

  // Hidratar síncronamente antes de que viewer.js lea window.RA_ENV
  hydrateFromStorage();

  if (typeof document !== 'undefined') {
    var checkAndPrompt = function () {
      if (!hasRequiredCredentials()) {
        openModal();
      }
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', checkAndPrompt);
    } else {
      checkAndPrompt();
    }
    global.addEventListener('load', checkAndPrompt);
  }

  global.RACredentials = {
    hydrateFromStorage: hydrateFromStorage,
    hasRequiredCredentials: hasRequiredCredentials,
    saveCredentials: saveCredentials,
    openModal: openModal
  };
})(typeof window !== 'undefined' ? window : globalThis);
