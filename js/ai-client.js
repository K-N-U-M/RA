/**
 * ============================================================================
 * 🤖 RA · CLIENTE IA UNIFICADO (SSOT)
 * ============================================================================
 * Archivo: js/ai-client.js
 * Rol: Punto único de entrada para peticiones HTTP a Google Gemini (window.RA.AI.fetch)
 *      y descubrimiento/ordenación de modelos disponibles (window.RA.AI.discoverModels).
 *      Garantiza cabecera x-goog-api-key, limpieza de ?key= en URL y AbortController.
 * ============================================================================
 */
(function (root) {
  'use strict';

  var ra = root.RA;
  if (!ra || typeof ra !== 'object') {
    ra = {};
    root.RA = ra;
  }

  var DEFAULT_TIMEOUT_MS = 30000;
  var DEFAULT_MODELS = [
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-3.8-flash',
    'gemini-3.5-flash'
  ];

  var _activeAbort = null;
  var _cachedModelsByKey = Object.create(null);

  function getApiKey() {
    try {
      if (ra && typeof ra.getGeminiApiKey === 'function') {
        var unified = ra.getGeminiApiKey();
        if (unified && String(unified).trim()) return String(unified).trim();
      }
      if (ra && ra.geminiApiKey) return String(ra.geminiApiKey).trim();
      if (root.localStorage && typeof root.localStorage.getItem === 'function') {
        var local = root.localStorage.getItem('ra_gemini_api_key') || '';
        if (local.indexOf('enc:') === 0) {
          try {
            return decodeURIComponent(escape(atob(local.slice(4)))).trim();
          } catch (eDec) {
            return local.slice(4).trim();
          }
        }
        if (local && local.trim()) return local.trim();
      }
    } catch (e) {
      if (typeof console !== 'undefined' && typeof console.debug === 'function') {
        console.debug('[RA.AI.getApiKey]', e);
      }
    }
    return '';
  }

  function cancel() {
    if (_activeAbort) {
      try { _activeAbort.abort(); } catch (e) {}
      _activeAbort = null;
    }
  }

  async function aiFetch(url, options, timeoutMs, apiKeyOverride) {
    // Respetar mocks de test o cliente de branding si fue inyectado externamente
    if (ra && typeof ra.geminiFetch === 'function' && ra.geminiFetch !== aiFetch) {
      return ra.geminiFetch(url, options, timeoutMs, apiKeyOverride);
    }

    var cleanUrl = String(url || '')
      .replace(/([?&])key=[^&]*/g, '$1')
      .replace(/[?&]$/, '');

    var opts = Object.assign({}, options || {});
    var headers = Object.assign({}, opts.headers || {});
    var key = apiKeyOverride || getApiKey();
    if (key) headers['x-goog-api-key'] = key;
    opts.headers = headers;

    var ctrl = (typeof AbortController === 'function') ? new AbortController() : null;
    var timer = null;
    if (ctrl) {
      cancel();
      _activeAbort = ctrl;
      if (!opts.signal) opts.signal = ctrl.signal;
      var ms = (typeof timeoutMs === 'number' && timeoutMs > 0) ? timeoutMs : DEFAULT_TIMEOUT_MS;
      timer = setTimeout(function () {
        try { ctrl.abort(); } catch (e) {}
      }, ms);
    }

    try {
      return await fetch(cleanUrl, opts);
    } finally {
      if (timer) clearTimeout(timer);
      if (ctrl && _activeAbort === ctrl) _activeAbort = null;
    }
  }

  function withManualModelPriority(models) {
    var list = Array.isArray(models) && models.length > 0 ? models.slice() : DEFAULT_MODELS.slice();
    if (ra && ra.geminiModel && list.indexOf(ra.geminiModel) === -1) {
      list.unshift(ra.geminiModel);
    }
    return list;
  }

  async function discoverModels(apiKey, options) {
    var key = apiKey || getApiKey();
    var cacheKey = key || '__anon__';
    var forceRefresh = !!(options && options.forceRefresh);

    if (!forceRefresh && Array.isArray(_cachedModelsByKey[cacheKey]) && _cachedModelsByKey[cacheKey].length > 0) {
      return withManualModelPriority(_cachedModelsByKey[cacheKey]);
    }

    if (ra && typeof ra.discoverGeminiModels === 'function' && ra.discoverGeminiModels !== discoverModels) {
      try {
        var delegated = await ra.discoverGeminiModels(key);
        if (Array.isArray(delegated) && delegated.length > 0) {
          _cachedModelsByKey[cacheKey] = delegated.slice();
          return withManualModelPriority(delegated);
        }
      } catch (eDel) {
        if (typeof console !== 'undefined' && typeof console.debug === 'function') {
          console.debug('[RA.AI.discoverModels:delegate]', eDel);
        }
      }
    }

    if (key && typeof fetch === 'function') {
      try {
        var resp = await aiFetch('https://generativelanguage.googleapis.com/v1beta/models', {}, 20000, key);
        if (resp && resp.ok) {
          var data = await resp.json();
          if (data && Array.isArray(data.models)) {
            var blacklist = /deep-research|tts|transcribe|image|live|audio|embed/i;
            var valid = data.models
              .filter(function (m) {
                return m && Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.indexOf('generateContent') !== -1;
              })
              .map(function (m) { return String(m.name || '').replace(/^models\//, ''); })
              .filter(function (name) { return name && !blacklist.test(name); });

            var flash = valid.filter(function (n) { return /flash/i.test(n); });
            var pro = valid.filter(function (n) { return !/flash/i.test(n) && /pro/i.test(n); });

            flash.sort(function (a, b) { return b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }); });
            pro.sort(function (a, b) { return b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }); });

            var ordered = flash.concat(pro);
            if (ordered.length > 0) {
              _cachedModelsByKey[cacheKey] = ordered;
              return withManualModelPriority(ordered);
            }
          }
        }
      } catch (err) {
        if (root.RA_ErrorHandler && typeof root.RA_ErrorHandler.handle === 'function') {
          root.RA_ErrorHandler.handle(err, 'RA.AI.discoverModels');
        } else if (typeof console !== 'undefined' && typeof console.debug === 'function') {
          console.debug('[RA.AI.discoverModels]', err);
        }
      }
    }

    return withManualModelPriority(DEFAULT_MODELS);
  }

  function getDefaultModels() {
    return withManualModelPriority(DEFAULT_MODELS);
  }

  ra.AI = {
    fetch: aiFetch,
    discoverModels: discoverModels,
    getDefaultModels: getDefaultModels,
    getApiKey: getApiKey,
    cancel: cancel
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ra.AI;
  }
})(typeof window !== 'undefined' ? window : globalThis);
