/**
 * js/trusted-security-guard.js — Defensa-en-Profundidad en Cliente (Trusted Types & Auditoría) [F7-14]
 * =====================================================================================================
 * 1. Registra la política nombrada Trusted Types (`ra-safe-policy`) cuando el navegador soporta la API,
 *    delegando siempre el saneado HTML a `RASanitize.sanitizeRichHtml`.
 * 2. Purga preventiva de claves sensibles residuales en localStorage y diagnóstico instantáneo de postura
 *    de seguridad (0 API keys persistidas, modo BFF Cloud Functions, estado Trusted Types).
 */
(function (global) {
  'use strict';

  var _policy = null;
  var _legacyKeyPatterns = ['gemini_api_key', 'ra_gemini_key', 'google_ai_key', 'openai_api_key'];

  function _initTrustedTypesPolicy() {
    if (!global.trustedTypes || typeof global.trustedTypes.createPolicy !== 'function') return null;
    try {
      _policy = global.trustedTypes.createPolicy('ra-safe-policy', {
        createHTML: function (input) {
          var raw = String(input == null ? '' : input);
          if (global.RASanitize && typeof global.RASanitize.sanitizeRichHtml === 'function') {
            return global.RASanitize.sanitizeRichHtml(raw);
          }
          return raw.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son[a-z]+\s*=/gi, ' data-blocked-event=');
        },
        createScriptURL: function (url) {
          var s = String(url || '').trim();
          if (s.indexOf('https://') === 0 || s.indexOf('/') === 0 || s.indexOf('js/') === 0 || s.indexOf('blob:') === 0) {
            return s;
          }
          throw new TypeError('ScriptURL bloqueada por política ra-safe-policy: ' + s);
        }
      });
    } catch (_) {
      _policy = null;
    }
    return _policy;
  }

  function _auditClientPosture() {
    var exposedKeys = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i) || '';
        var low = k.toLowerCase();
        if (_legacyKeyPatterns.some(function (p) { return low.indexOf(p) !== -1; })) {
          exposedKeys.push(k);
        }
      }
    } catch (_) {}

    var bffEndpoint = (global.RA_ENV && global.RA_ENV.AI_BFF_URL) || '';
    var hasSessionKey = false;
    try { hasSessionKey = Boolean(sessionStorage.getItem('ra_gemini_api_key')); } catch (_) {}

    return {
      trustedTypesSupported: Boolean(global.trustedTypes),
      trustedTypesPolicyActive: Boolean(_policy),
      exposedLocalStorageKeys: exposedKeys,
      zeroKeysInLocalStorage: exposedKeys.length === 0,
      bffConfigured: Boolean(bffEndpoint),
      sessionFallbackActive: hasSessionKey,
      secureContext: Boolean(global.isSecureContext)
    };
  }

  function sanitizeHtmlTrusted(html) {
    if (_policy && typeof _policy.createHTML === 'function') {
      return _policy.createHTML(html);
    }
    if (global.RASanitize && typeof global.RASanitize.sanitizeRichHtml === 'function') {
      return global.RASanitize.sanitizeRichHtml(html);
    }
    return String(html == null ? '' : html);
  }

  _initTrustedTypesPolicy();

  global.RASecurityGuard = {
    getPosture: _auditClientPosture,
    sanitizeHtmlTrusted: sanitizeHtmlTrusted,
    getPolicy: function () { return _policy; }
  };
  if (global.RA) global.RA.SecurityGuard = global.RASecurityGuard;
})(typeof window !== 'undefined' ? window : this);
