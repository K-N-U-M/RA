// [ARQUITECTURA CANÓNICA v3] Manejador global de errores (Error Boundary)
(function(global) {
  const RA_ErrorHandler = {
    handle: function(error, contextInfo) {
      console.warn(`[RA_ErrorHandler] Fallo interceptado en: ${contextInfo}`, error);

      // Si tenemos acceso al logger de RA, lo usamos
      if (global.RA && global.RA.log) {
        global.RA.log.warn(`[${contextInfo}]`, error);
      }

      // Si es un error crítico de CesiumJS que corrompe el render (Context Lost o TypeError en primitives)
      const errStr = (error && error.message) ? error.message.toLowerCase() : '';
      if (errStr.includes('webgl') || errStr.includes('context lost') || errStr.includes('destroy')) {
        console.error('Error crítico de WebGL/Cesium detectado. Posible fuga de memoria o entidad zombi.');
        if (typeof global.showToast === 'function') {
          global.showToast('Error gráfico leve. Se recomienda guardar el proyecto.', 'warning');
        }
      }
    },

    handleAsyncAPI: function(error, serviceName) {
      console.error(`[RA_ErrorHandler] Fallo en la API externa (${serviceName}):`, error);
      if (typeof global.showToast === 'function') {
        global.showToast(`Error de conexión con ${serviceName}. Verifica tu red o reintenta.`, 'error');
      }
      
      // Asegurar que el loader global se oculta si la llamada falla
      if (typeof global.wpHideLoader === 'function') {
        global.wpHideLoader();
      }
    }
  };

  // Exponer al scope global
  global.RA_App = global.RA_App || {};
  global.RA_App.ErrorHandler = RA_ErrorHandler;
  global.RA_ErrorHandler = RA_ErrorHandler; // Alias por conveniencia
})(window);
