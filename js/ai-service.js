/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * RA — Adaptador Centralizado de Inteligencia Artificial (Fase 4 · F4-08)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Aísla la construcción de endpoints, rotación de modelos, parseo JSON seguro,
 * saneamiento HTML y soporte opcional de proxy BFF fuera de los motores de dominio.
 */
(function (root) {
  'use strict';

  var DEFAULT_MODELS = Object.freeze([
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash',
    'gemini-1.5-flash'
  ]);

  var _cachedModels = null;
  var _cachedKeyHash = '';

  function getApiKey(overrideKey) {
    if (overrideKey && String(overrideKey).trim()) return String(overrideKey).trim();
    if (root.RA && typeof root.RA.getGeminiApiKey === 'function') {
      return (root.RA.getGeminiApiKey() || '').trim();
    }
    return '';
  }

  function _resolveModels(apiKey) {
    var keyTag = apiKey ? apiKey.slice(-6) : '';
    if (_cachedModels && _cachedModels.length > 0 && _cachedKeyHash === keyTag) {
      return Promise.resolve(_cachedModels);
    }
    if (typeof root.discoverAvailableModels === 'function') {
      return Promise.resolve()
        .then(function () { return root.discoverAvailableModels(apiKey); })
        .then(function (list) {
          if (Array.isArray(list) && list.length > 0) {
            _cachedModels = list;
            _cachedKeyHash = keyTag;
            return list;
          }
          return DEFAULT_MODELS.slice();
        })
        .catch(function () { return DEFAULT_MODELS.slice(); });
    }
    return Promise.resolve(DEFAULT_MODELS.slice());
  }

  function _extractCandidateText(data) {
    var candidate = data && data.candidates && data.candidates[0];
    if (!candidate || !candidate.content || !Array.isArray(candidate.content.parts)) return '';
    var textParts = candidate.content.parts
      .filter(function (p) { return p && !p.thought && typeof p.text === 'string'; })
      .map(function (p) { return p.text; });
    if (textParts.length > 0) return textParts.join('');
    return (candidate.content.parts[0] && typeof candidate.content.parts[0].text === 'string')
      ? candidate.content.parts[0].text : '';
  }

  function _sanitizeRichHtml(rawHtml) {
    var clean = String(rawHtml || '')
      .replace(/^```(?:html)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    if (root.RASanitize && typeof root.RASanitize.richText === 'function') {
      return root.RASanitize.richText(clean);
    }
    return clean
      .replace(/<\s*(script|iframe|object|embed|style|link|meta|base|form)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
      .replace(/<\s*(script|iframe|object|embed|style|link|meta|base|form)[^>]*>/gi, '')
      .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/(href|src|action|formaction)\s*=\s*javascript:[^"'\s>]*/gi, '$1=');
  }

  function _parseJsonSafe(rawText) {
    var cleaned = String(rawText || '').replace(/^[^{\[]*([{\[][\s\S]*[}\]])[^}\]]*$/, '$1').trim();
    try {
      var parsed = JSON.parse(cleaned);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch (_) {}
    return null;
  }

  async function generateText(prompt, opts) {
    var options = opts || {};
    var apiKey = getApiKey(options.apiKey);
    var bffUrl = ((typeof root.RA_AI_BFF_URL === 'string' && root.RA_AI_BFF_URL.trim())
      || (root.RA_ENV && typeof root.RA_ENV.AI_BFF_URL === 'string' && root.RA_ENV.AI_BFF_URL.trim())) || '';
    if (!bffUrl && !apiKey) throw new Error('API_KEY_MISSING');

    var timeoutMs = Number(options.timeoutMs) || 30000;
    var genCfg = {
      temperature: typeof options.temperature === 'number' ? options.temperature : 0.4,
      maxOutputTokens: Math.min(4096, Number(options.maxOutputTokens) || 1500)
    };
    if (options.responseMimeType) genCfg.responseMimeType = options.responseMimeType;

    var fetcher = (root.RA && typeof root.RA.geminiFetch === 'function')
      ? root.RA.geminiFetch
      : function (url, reqOpts) { return fetch(url, reqOpts); };

    var models = Array.isArray(options.models) && options.models.length > 0
      ? options.models
      : await _resolveModels(apiKey);

    // Adjuntar token Firebase Auth automáticamente al invocar la pasarela BFF
    var bffHeaders = { 'Content-Type': 'application/json' };
    if (bffUrl) {
      try {
        var authUser = root.firebase && root.firebase.auth && root.firebase.auth().currentUser;
        if (authUser && typeof authUser.getIdToken === 'function') {
          var idTok = await authUser.getIdToken();
          if (idTok) bffHeaders['Authorization'] = 'Bearer ' + idTok;
        }
      } catch (_) {}
    }

    var lastError = null;
    for (var i = 0; i < models.length; i++) {
      var modelName = models[i];
      var endpoint = bffUrl
        ? bffUrl
        : ('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(modelName) + ':generateContent');
      try {
        var corePayload = { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: genCfg };
        var payload = bffUrl
          ? { model: modelName, payload: corePayload }
          : corePayload;

        var resp = await fetcher(endpoint, {
          method: 'POST',
          headers: bffUrl ? bffHeaders : { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }, timeoutMs, bffUrl ? '' : apiKey);

        if (!resp.ok) {
          var errData = await resp.json().catch(function () { return {}; });
          lastError = (errData && errData.error && errData.error.message)
            ? errData.error.message : ('HTTP ' + resp.status + ' (' + modelName + ')');
          continue;
        }
        var data = await resp.json().catch(function () { return null; });
        var text = (data && typeof data.text === 'string') ? data.text : _extractCandidateText(data);
        if (text && text.trim()) {
          return {
            text: options.sanitizeHtml ? _sanitizeRichHtml(text) : text.trim(),
            rawText: text.trim(),
            model: modelName
          };
        }
      } catch (eLoop) {
        lastError = (eLoop && eLoop.message) ? eLoop.message : String(eLoop);
      }
    }
    var err = new Error(lastError || 'NO_RESPONSE');
    err.code = 'NO_RESPONSE';
    throw err;
  }

  async function generateJson(prompt, opts) {
    var options = Object.assign({}, opts || {}, { responseMimeType: 'application/json' });
    var res = await generateText(prompt, options);
    return {
      data: _parseJsonSafe(res.rawText),
      rawText: res.rawText,
      model: res.model
    };
  }

  var AIService = Object.freeze({
    DEFAULT_MODELS: DEFAULT_MODELS,
    getApiKey: getApiKey,
    generateText: generateText,
    generateJson: generateJson,
    parseJsonSafe: _parseJsonSafe
  });

  root.RA = root.RA || {};
  root.RA.AIService = AIService;
  root.RAAIService = AIService;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
