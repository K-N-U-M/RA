// [ARQUITECTURA CANÓNICA v3] Manejador global de errores (Error Boundary)
// [AUD-2026 · F-06] Además de avisar, ahora deja rastro: buffer circular con contexto
// (proyecto, paso, acción) exportable para diagnóstico. Antes un fallo silencioso podía
// terminar en un documento mal emitido sin evidencia.
(function(global) {
  var MAX_ENTRIES = 50;
  var _buffer = [];
  var _installed = false;

  function currentContext() {
    var projectId = null;
    var step = null;
    try {
      if (global.RAProjectStorage && typeof global.RAProjectStorage.getCurrentProjectId === 'function') {
        projectId = global.RAProjectStorage.getCurrentProjectId();
      } else if (global.localStorage) {
        projectId = global.localStorage.getItem('ra_current_project_ref') || null;
      }
      if (typeof global.wpCurrentStep !== 'undefined') step = global.wpCurrentStep;
      else if (global.window && typeof global.window.wpCurrentStep !== 'undefined') step = global.window.wpCurrentStep;
    } catch (e) { /* contexto best-effort */ }
    return { projectId: projectId, step: step };
  }

  function push(entry) {
    var ctx = currentContext();
    var record = {
      ts: new Date().toISOString(),
      context: entry.context || 'runtime',
      message: entry.message || '',
      stack: entry.stack ? String(entry.stack).split('\n').slice(0, 6).join('\n') : null,
      projectId: ctx.projectId,
      step: ctx.step
    };
    _buffer.push(record);
    if (_buffer.length > MAX_ENTRIES) _buffer.shift();
    return record;
  }

  function installGlobalHooks() {
    if (_installed) return;
    _installed = true;
    if (typeof global.addEventListener !== 'function') return;
    global.addEventListener('error', function(ev) {
      push({
        context: 'window.onerror',
        message: (ev && ev.message) || 'Error desconocido',
        stack: ev && ev.error ? ev.error.stack : null
      });
    });
    global.addEventListener('unhandledrejection', function(ev) {
      var r = ev && ev.reason;
      push({
        context: 'unhandledrejection',
        message: (r && r.message) ? r.message : String(r || 'Promesa rechazada'),
        stack: r && r.stack ? r.stack : null
      });
    });
  }

  var RA_ErrorHandler = {
    handle: function(error, contextInfo) {
      console.warn('[RA_ErrorHandler] Fallo interceptado en: ' + contextInfo, error);
      push({
        context: String(contextInfo || 'handle'),
        message: (error && error.message) ? error.message : String(error),
        stack: error && error.stack ? error.stack : null
      });

      // Si tenemos acceso al logger de RA, lo usamos
      if (global.RA && global.RA.log) {
        global.RA.log.warn('[' + contextInfo + ']', error);
      }

      // Si es un error crítico de CesiumJS que corrompe el render (Context Lost o TypeError en primitives)
      var errStr = (error && error.message) ? error.message.toLowerCase() : '';
      if (errStr.indexOf('webgl') !== -1 || errStr.indexOf('context lost') !== -1 || errStr.indexOf('destroy') !== -1) {
        console.error('Error crítico de WebGL/Cesium detectado. Posible fuga de memoria o entidad zombi.');
        if (typeof global.showToast === 'function') {
          global.showToast('AVISO GRÁFICO', 'Error gráfico leve. Se recomienda guardar el proyecto.', 'warning');
        }
      }
    },

    handleAsyncAPI: function(error, serviceName) {
      console.error('[RA_ErrorHandler] Fallo en la API externa (' + serviceName + '):', error);
      push({
        context: 'api:' + serviceName,
        message: (error && error.message) ? error.message : String(error),
        stack: error && error.stack ? error.stack : null
      });
      if (typeof global.showToast === 'function') {
        global.showToast('ERROR DE CONEXIÓN', 'No se pudo contactar con ' + serviceName + '. Verifica tu red o reintenta.', 'error');
      }

      // Asegurar que el loader global se oculta si la llamada falla
      if (typeof global.wpHideLoader === 'function') {
        global.wpHideLoader();
      }
    },

    // ── API de diagnóstico ────────────────────────────────────────────────
    entries: function() { return _buffer.slice(); },
    count: function() { return _buffer.length; },
    clear: function() { _buffer = []; },
    report: function() {
      return {
        generatedAt: new Date().toISOString(),
        userAgent: (global.navigator && global.navigator.userAgent) || 'desconocido',
        entries: _buffer.slice()
      };
    },
    exportJSON: function() { return JSON.stringify(this.report(), null, 2); },
    /** Descarga un diagnóstico sin depender de backend. */
    download: function(filename) {
      try {
        var blob = new Blob([this.exportJSON()], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename || ('ra-diagnostico-' + Date.now() + '.json');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function() { URL.revokeObjectURL(url); }, 2000);
        return true;
      } catch (e) {
        return false;
      }
    },
    installGlobalHooks: installGlobalHooks
  };

  installGlobalHooks();

  // Exponer al namespace canónico global.RA (manteniendo alias legacy durante transición F4-05)
  global.RA = global.RA || {};
  global.RA.ErrorHandler = RA_ErrorHandler;
  global.RA_App = global.RA_App || {};
  global.RA_App.ErrorHandler = RA_ErrorHandler;
  global.RA_ErrorHandler = RA_ErrorHandler; // Alias por conveniencia
  global.RAErrors = RA_ErrorHandler;        // [AUD-2026 · F-06] acceso corto
})(typeof window !== 'undefined' ? window : this);
