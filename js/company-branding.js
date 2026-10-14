/**
 * ============================================================================
 * 🏢 RA · GESTOR DE IDENTIDAD CORPORATIVA Y BRANDING (SSOT) — PROYECTO RA
 * ============================================================================
 * Módulo autónomo e independiente para:
 *   - Gestión de datos corporativos (razón social, CIF, teléfono, email/web)
 *   - Gestión y persistencia del logotipo oficial de empresa (Base64)
 *   - Previsualización reactiva e inmediata en modal y panel lateral
 *   - Selección de tema visual de propuesta comercial y garantías declaradas
 *   - Sincronización de API Key de Google Gemini para enriquecimiento de ofertas
 *   - Fuente Única de Verdad (SSOT) para la Propuesta Comercial (financials.js)
 *     y Memorias Técnicas (docs-generator.js)
 * ============================================================================
 */
(function(global) {
  'use strict';

  const STORAGE_KEY_BRANDING = 'ra_company_branding';
  const STORAGE_KEY_LOGO = 'ra_company_logo';
  const STORAGE_KEY_GEMINI = 'ra_gemini_api_key';

  // [D1/G9] La clave nunca se guarda en claro en el navegador: se ofusca (base64 con prefijo)
  // y se envía SIEMPRE en la cabecera 'x-goog-api-key' (no en la URL). Nota: en un cliente
  // puramente estático no existe cifrado real; restringe la clave en Google Cloud Console.
  const GEMINI_KEY_PREFIX = 'enc:';
  const GEMINI_DEFAULT_TIMEOUT_MS = 45000;

  function _obfuscateKey(k) {
    try { return GEMINI_KEY_PREFIX + global.btoa(unescape(encodeURIComponent(k))); }
    catch (e) { return k; }
  }

  function _deobfuscateKey(v) {
    if (typeof v === 'string' && v.indexOf(GEMINI_KEY_PREFIX) === 0) {
      try { return decodeURIComponent(escape(global.atob(v.slice(GEMINI_KEY_PREFIX.length)))); }
      catch (e) { return v.slice(GEMINI_KEY_PREFIX.length); }
    }
    return v; // Compatibilidad con claves antiguas guardadas en claro
  }

  /**
   * [D1] Lectura canónica de la clave Gemini (memoria → almacén ofuscado).
   */
  function getGeminiApiKey() {
    try {
      if (global.RA && global.RA.geminiApiKey) return global.RA.geminiApiKey;
      const raw = global.localStorage ? global.localStorage.getItem(STORAGE_KEY_GEMINI) : '';
      const key = raw ? _deobfuscateKey(raw) : '';
      if (!global.RA) global.RA = {};
      global.RA.geminiApiKey = key;
      return key;
    } catch (e) { return ''; }
  }

  /**
   * [D1] Escritura canónica de la clave Gemini (memoria + almacén ofuscado).
   */
  function setGeminiApiKey(key) {
    const clean = (key || '').trim();
    if (!global.RA) global.RA = {};
    global.RA.geminiApiKey = clean;
    try {
      if (!global.localStorage) return clean;
      if (clean) global.localStorage.setItem(STORAGE_KEY_GEMINI, _obfuscateKey(clean));
      else global.localStorage.removeItem(STORAGE_KEY_GEMINI);
    } catch (e) {}
    return clean;
  }

  // [D2/G10] Cancelación atómica de la última petición IA en curso
  let _geminiAbortController = null;

  function cancelGemini() {
    if (_geminiAbortController) {
      try { _geminiAbortController.abort(); } catch (e) {}
      _geminiAbortController = null;
    }
  }

  /**
   * [D1+D2] Cliente HTTP unificado para Google Gemini:
   *  - Inyecta la clave en la cabecera 'x-goog-api-key' y ELIMINA cualquier '?key=' de la URL.
   *  - Aplica un tiempo máximo (AbortController) y permite cancelación (cancelGemini()).
   */
  async function geminiFetch(url, options, timeoutMs, apiKeyOverride) {
    const cleanUrl = String(url)
      .replace(/([?&])key=[^&]*/g, '$1')
      .replace(/[?&]$/, '');
    const opts = Object.assign({}, options || {});
    const headers = Object.assign({}, opts.headers || {});
    const key = apiKeyOverride || getGeminiApiKey();
    if (key) headers['x-goog-api-key'] = key;
    opts.headers = headers;

    cancelGemini();
    const ctrl = new AbortController();
    _geminiAbortController = ctrl;
    opts.signal = ctrl.signal;

    const ms = (typeof timeoutMs === 'number' && timeoutMs > 0) ? timeoutMs : GEMINI_DEFAULT_TIMEOUT_MS;
    const timer = setTimeout(() => { try { ctrl.abort(); } catch (e) {} }, ms);
    try {
      return await fetch(cleanUrl, opts);
    } finally {
      clearTimeout(timer);
      if (_geminiAbortController === ctrl) _geminiAbortController = null;
    }
  }

  const DEFAULT_BRANDING = {
    name: 'SOLAR 3D PRO',
    cif: '',
    phone: '',
    web: '',
    theme: 'emerald',
    status: 'vinculante',
    font: 'inter',
    finTin: '5.95',
    finEntry: '0',
    warPower: '25',
    warMod: '15',
    warInv: '10',
    warMo: '5',
    logo: ''
  };

  // Estado vivo en memoria
  let _currentBranding = Object.assign({}, DEFAULT_BRANDING);

  /**
   * Obtiene una copia sanitizada del branding actual fusionada con defaults
   */
  function getBranding() {
    if (!_currentBranding.logo) {
      try {
        const storedLogo = (global.localStorage ? global.localStorage.getItem(STORAGE_KEY_LOGO) : '') || '';
        if (storedLogo) _currentBranding.logo = storedLogo;
      } catch (e) {}
    }
    return Object.assign({}, DEFAULT_BRANDING, _currentBranding);
  }

  /**
   * Actualiza el contenedor visual de previsualización de logo
   */
  function updateLogoPreview(targetEl, logoDataUrl) {
    if (!targetEl) return;
    if (logoDataUrl && typeof logoDataUrl === 'string' && logoDataUrl.startsWith('data:image/')) {
      targetEl.innerHTML = '<img src="' + logoDataUrl + '" style="max-width:100%;max-height:100%;object-fit:contain;" alt="Logotipo Corporativo">';
      targetEl.style.border = '1px solid var(--emerald-500, #10B981)';
    } else {
      targetEl.innerHTML = '<span style="font-size:26px;color:var(--text-slate-500, #64748B);"><i data-lucide="building" class="icon-sm"></i></span>';
      targetEl.style.border = '1px dashed var(--border-subtle, rgba(255,255,255,0.15))';
      if (global.lucide && typeof global.lucide.createIcons === 'function') {
        try { global.lucide.createIcons({ root: targetEl }); } catch (e) {}
      }
    }
  }

  /**
   * Refresca todas las vistas previas de logo en el DOM
   */
  function refreshAllLogoPreviews() {
    const modalPrev = document.getElementById('modal-company-logo-preview');
    const sidePrev = document.getElementById('company-logo-preview');
    if (modalPrev) updateLogoPreview(modalPrev, _currentBranding.logo);
    if (sidePrev) updateLogoPreview(sidePrev, _currentBranding.logo);
  }

  /**
   * Carga el branding desde localStorage y sincroniza la memoria global
   */
  function loadCompanyBranding() {
    try {
      if (!global.localStorage) return _currentBranding;
      const raw = global.localStorage.getItem(STORAGE_KEY_BRANDING);
      let parsed = {};
      if (raw) {
        try { parsed = JSON.parse(raw); } catch (e) { parsed = {}; }
      }
      
      let logoUrl = parsed.logo || '';
      if (!logoUrl) {
        logoUrl = global.localStorage.getItem(STORAGE_KEY_LOGO) || '';
      }

      _currentBranding = Object.assign({}, DEFAULT_BRANDING, parsed);
      if (logoUrl) _currentBranding.logo = logoUrl;

      // Sincronizar exports globales
      global.customCompanyLogoBase64 = _currentBranding.logo;
      if (!global.RA) global.RA = {};
      global.RA.branding = _currentBranding;

      // Sincronizar inputs en el DOM si ya están presentes
      const setVal = (id, val) => {
        const el = document.getElementById('modal-' + id) || document.getElementById(id);
        if (el && typeof val !== 'undefined') el.value = val;
      };

      setVal('cfg-company-name', _currentBranding.name);
      setVal('cfg-company-cif', _currentBranding.cif);
      setVal('cfg-company-phone', _currentBranding.phone);
      setVal('cfg-company-web', _currentBranding.web);
      setVal('cfg-proposal-theme', _currentBranding.theme);
      setVal('cfg-offer-status', _currentBranding.status);
      setVal('cfg-doc-font', _currentBranding.font);
      setVal('cfg-fin-tin', _currentBranding.finTin);
      setVal('cfg-fin-entry', _currentBranding.finEntry);
      setVal('cfg-war-power', _currentBranding.warPower);
      setVal('cfg-war-mod', _currentBranding.warMod);
      setVal('cfg-war-inv', _currentBranding.warInv);
      setVal('cfg-war-mo', _currentBranding.warMo);

      // Cargar API Key de Gemini
      const geminiKey = getGeminiApiKey();
      const geminiEl = document.getElementById('modal-cfg-gemini-apikey') || document.getElementById('cfg-gemini-apikey');
      if (geminiEl && geminiKey) geminiEl.value = geminiKey;
      global.RA.geminiApiKey = geminiKey;

      refreshAllLogoPreviews();
      return _currentBranding;
    } catch (err) {
      if (global.RA && global.RA.log) global.RA.log.warn('Error cargando branding corporativo:', err);
      return _currentBranding;
    }
  }

  /**
   * Guarda el estado de branding leyendo inputs del modal o argumentos directos
   */
  function saveCompanyBranding() {
    try {
      const getVal = (id) => {
        const el = document.getElementById('modal-' + id) || document.getElementById(id);
        return el ? el.value : null;
      };

      // Conservar el logo existente a menos que se haya modificado explícitamente
      const existingLogo = _currentBranding.logo || global.customCompanyLogoBase64 || (global.localStorage ? global.localStorage.getItem(STORAGE_KEY_LOGO) : '');

      const updated = {
        logo: existingLogo || '',
        name: (getVal('cfg-company-name') || _currentBranding.name || 'SOLAR 3D PRO').trim(),
        cif: (getVal('cfg-company-cif') || _currentBranding.cif || '').trim(),
        phone: (getVal('cfg-company-phone') || _currentBranding.phone || '').trim(),
        web: (getVal('cfg-company-web') || _currentBranding.web || '').trim(),
        theme: getVal('cfg-proposal-theme') || _currentBranding.theme || 'emerald',
        status: getVal('cfg-offer-status') || _currentBranding.status || 'vinculante',
        font: getVal('cfg-doc-font') || _currentBranding.font || 'inter',
        finTin: getVal('cfg-fin-tin') || _currentBranding.finTin || '5.95',
        finEntry: getVal('cfg-fin-entry') || _currentBranding.finEntry || '0',
        warPower: getVal('cfg-war-power') || _currentBranding.warPower || '25',
        warMod: getVal('cfg-war-mod') || _currentBranding.warMod || '15',
        warInv: getVal('cfg-war-inv') || _currentBranding.warInv || '10',
        warMo: getVal('cfg-war-mo') || _currentBranding.warMo || '5'
      };

      _currentBranding = updated;
      global.customCompanyLogoBase64 = updated.logo;

      if (global.localStorage) {
        global.localStorage.setItem(STORAGE_KEY_BRANDING, JSON.stringify(updated));
        if (updated.logo) {
          global.localStorage.setItem(STORAGE_KEY_LOGO, updated.logo);
        }
      }

      // API Key de Gemini
      const geminiEl = document.getElementById('modal-cfg-gemini-apikey') || document.getElementById('cfg-gemini-apikey');
      const geminiKey = geminiEl ? geminiEl.value.trim() : '';
      if (geminiEl) {
        setGeminiApiKey(geminiKey);
      } else if (geminiKey) {
        setGeminiApiKey(geminiKey);
      }

      if (!global.RA) global.RA = {};
      global.RA.branding = _currentBranding;
      global.RA.geminiApiKey = getGeminiApiKey();

      refreshAllLogoPreviews();
      return _currentBranding;
    } catch (err) {
      if (global.RA && global.RA.log) global.RA.log.warn('Error guardando branding corporativo:', err);
      return _currentBranding;
    }
  }

  /**
   * Sube un archivo de logotipo, lo convierte a Base64, actualiza previews y persiste
   */
  function handleLogoUpload(event) {
    const file = event && event.target && event.target.files && event.target.files[0];
    if (!file) return;

    if (!file.type.match(/^image\//)) {
      if (typeof global.showToast === 'function') {
        global.showToast('FORMATO NO VÁLIDO', 'Por favor selecciona un archivo de imagen (PNG, JPG o SVG).', 'warning', 3500);
      }
      return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
      const dataUrl = e.target.result;
      _currentBranding.logo = dataUrl;
      global.customCompanyLogoBase64 = dataUrl;

      if (global.localStorage) {
        try {
          global.localStorage.setItem(STORAGE_KEY_LOGO, dataUrl);
          const raw = global.localStorage.getItem(STORAGE_KEY_BRANDING);
          const parsed = raw ? JSON.parse(raw) : {};
          parsed.logo = dataUrl;
          global.localStorage.setItem(STORAGE_KEY_BRANDING, JSON.stringify(parsed));
        } catch (err) {
          if (global.RA && global.RA.log) global.RA.log.warn('No se pudo guardar el logo en localStorage (cuota):', err);
        }
      }

      if (!global.RA) global.RA = {};
      global.RA.branding = Object.assign({}, _currentBranding);

      refreshAllLogoPreviews();

      if (typeof global.showToast === 'function') {
        global.showToast('LOGOTIPO ACTUALIZADO', 'El logotipo de tu empresa se ha guardado correctamente y se estampará en la oferta.', 'success', 3000);
      }
    };
    reader.readAsDataURL(file);
  }

  /**
   * Elimina el logotipo corporativo y vuelve al placeholder
   */
  function clearLogo() {
    _currentBranding.logo = '';
    global.customCompanyLogoBase64 = '';

    if (global.localStorage) {
      try {
        global.localStorage.removeItem(STORAGE_KEY_LOGO);
        const raw = global.localStorage.getItem(STORAGE_KEY_BRANDING);
        if (raw) {
          const parsed = JSON.parse(raw);
          parsed.logo = '';
          global.localStorage.setItem(STORAGE_KEY_BRANDING, JSON.stringify(parsed));
        }
      } catch (err) {}
    }

    if (!global.RA) global.RA = {};
    if (global.RA.branding) global.RA.branding.logo = '';

    refreshAllLogoPreviews();

    if (typeof global.showToast === 'function') {
      global.showToast('LOGOTIPO ELIMINADO', 'Se utilizará el nombre de tu empresa en formato tipográfico.', 'info', 2500);
    }
  }

  /**
   * Abre el modal de configuración de branding y asegura sincronización bidireccional
   */
  function openModal() {
    const modal = document.getElementById('ra-company-branding-modal');
    if (!modal) return;

    // Cargar datos más frescos de la fuente de la verdad
    loadCompanyBranding();

    // Rellenar campos del modal
    const b = getBranding();
    const setModalVal = (id, val) => {
      const el = document.getElementById('modal-' + id);
      if (el && typeof val !== 'undefined') el.value = val;
    };

    setModalVal('cfg-company-name', b.name);
    setModalVal('cfg-company-cif', b.cif);
    setModalVal('cfg-company-phone', b.phone);
    setModalVal('cfg-company-web', b.web);
    setModalVal('cfg-proposal-theme', b.theme);
    setModalVal('cfg-offer-status', b.status);
    setModalVal('cfg-war-power', b.warPower);
    setModalVal('cfg-war-mod', b.warMod);
    setModalVal('cfg-war-inv', b.warInv);
    setModalVal('cfg-war-mo', b.warMo);

    // Asegurar previsualización de logo en el modal
    const modalLogoPrev = document.getElementById('modal-company-logo-preview');
    if (modalLogoPrev) updateLogoPreview(modalLogoPrev, b.logo);

    modal.style.display = 'flex';
    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      try { global.lucide.createIcons({ root: modal }); } catch (e) {}
    }
  }

  /**
   * Cierra el modal y persiste los cambios
   */
  function closeModal() {
    const modal = document.getElementById('ra-company-branding-modal');
    if (modal) modal.style.display = 'none';
    saveCompanyBranding();
  }

  /**
   * Sincroniza en vivo cada input del modal con la memoria y persistencia
   */
  function syncModalInput(targetId, val) {
    saveCompanyBranding();
  }

  /**
   * Prueba interactiva de conexión con la API de Google Gemini
   */
  async function testGeminiApiKey() {
    const resultEl = document.getElementById('gemini-key-test-result');
    const keyEl = document.getElementById('modal-cfg-gemini-apikey') || document.getElementById('cfg-gemini-apikey');
    const key = keyEl ? keyEl.value.trim() : '';
    if (!key) {
      if (resultEl) resultEl.innerHTML = '<span style="color:#ef4444;">⚠ Introduce una API Key primero.</span>';
      return;
    }
    if (resultEl) resultEl.innerHTML = '<span style="color:#a78bfa;">⏳ Conectando con Gemini...</span>';
    try {
      let activeModel = 'gemini-2.5-flash';
      try {
        const listResp = await geminiFetch('https://generativelanguage.googleapis.com/v1beta/models', {}, 20000, key);
        if (listResp.ok) {
          const listData = await listResp.json();
          if (Array.isArray(listData.models)) {
            const found = listData.models.find(m => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'));
            if (found) activeModel = found.name.replace(/^models\//, '');
          }
        }
      } catch (e) {}

      const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + activeModel + ':generateContent';
      const resp = await geminiFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'Responde solo con: OK' }] }]
        })
      }, 20000, key);
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        const errMsg = (errData.error && errData.error.message) ? errData.error.message : ('HTTP ' + resp.status);
        if (resultEl) resultEl.innerHTML = '<span style="color:#ef4444;">❌ Error: ' + errMsg + '</span>';
        return;
      }
      const data = await resp.json();
      const txt = (data.candidates && data.candidates[0] && data.candidates[0].content &&
                   data.candidates[0].content.parts && data.candidates[0].content.parts[0])
                  ? data.candidates[0].content.parts[0].text : '';
      if (resultEl) resultEl.innerHTML = '<span style="color:#34d399;">✅ Conexión exitosa · Gemini respondió: "' + txt.trim().substring(0, 40) + '"</span>';
      saveCompanyBranding();
    } catch (err) {
      if (resultEl) resultEl.innerHTML = '<span style="color:#ef4444;">❌ Error de red: ' + (err.message || err) + '</span>';
    }
  }

  // Inicialización temprana
  loadCompanyBranding();
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', loadCompanyBranding);
    } else {
      setTimeout(loadCompanyBranding, 100);
    }
  }

  // ── EXPORTACIÓN CANÓNICA DEL MÓDULO ──────────────────────────────────────────
  const RACompanyBranding = {
    getBranding,
    loadCompanyBranding,
    saveCompanyBranding,
    handleLogoUpload,
    clearLogo,
    openModal,
    closeModal,
    syncModalInput,
    updateLogoPreview,
    testGeminiApiKey
  };

  global.RACompanyBranding = RACompanyBranding;
  if (!global.RA) global.RA = {};
  global.RA.branding = _currentBranding;

  // [D1+D2] API IA canónica compartida por todos los módulos
  global.RA.getGeminiApiKey = getGeminiApiKey;
  global.RA.setGeminiApiKey = setGeminiApiKey;
  global.RA.geminiFetch = geminiFetch;
  global.RA.cancelGemini = cancelGemini;

  // Hooks globales para eventos inline del HTML
  global.openCompanyBrandingModal = openModal;
  global.closeCompanyBrandingModal = closeModal;
  global.handleModalCompanyLogoUpload = handleLogoUpload;
  global.clearModalCompanyLogo = clearLogo;
  global.saveCompanyBranding = saveCompanyBranding;
  global.loadCompanyBranding = loadCompanyBranding;
  global.syncModalInputToBranding = syncModalInput;
  global.testGeminiApiKey = testGeminiApiKey;
  global.cancelGeminiAnalysis = cancelGemini;

})(typeof window !== 'undefined' ? window : this);
