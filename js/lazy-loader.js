/**
 * js/lazy-loader.js — Cargador Perezoso Bajo Demanda de Dependencias Pesadas
 * =========================================================================
 * Arquitectura de Rendimiento AAA (Proyecto RA)
 * - Evita cargar librerías externas de gran volumen (como jsPDF) en el arranque inicial.
 * - Carga bajo demanda ultra-rápida en el momento exacto en que el usuario lo necesita.
 * - Pre-carga silenciosa (prefetch) al avanzar a pasos relevantes (ej. Paso 4 -> Paso 5).
 */

(function(global) {
  'use strict';

  const _loadedScripts = new Set();
  const _loadingPromises = new Map();

  function loadScriptAsync(src, options) {
    options = options || {};
    if (_loadedScripts.has(src)) {
      return Promise.resolve();
    }
    if (_loadingPromises.has(src)) {
      return _loadingPromises.get(src);
    }

    const promise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      if (options.integrity) script.integrity = options.integrity;
      if (options.crossOrigin) script.crossOrigin = options.crossOrigin;

      script.onload = () => {
        _loadedScripts.add(src);
        _loadingPromises.delete(src);
        resolve();
      };

      script.onerror = (err) => {
        _loadingPromises.delete(src);
        reject(new Error(`[LazyLoader] Error al cargar script: ${src}`));
      };

      document.head.appendChild(script);
    });

    _loadingPromises.set(src, promise);
    return promise;
  }

  const RALazyLoader = {
    /**
     * Carga jsPDF de forma perezosa bajo demanda.
     */
    loadJsPDF: async function() {
      if (global.jspdf && global.jspdf.jsPDF) {
        return global.jspdf;
      }
      const cdnUrl = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      await loadScriptAsync(cdnUrl, {
        integrity: 'sha384-JcnsjUPPylna1s1fvi1u12X5qjY5OL56iySh75FdtrwhO/SWXgMjoVqcKyIIWOLk',
        crossOrigin: 'anonymous'
      });
      return global.jspdf;
    },

    /**
     * Carga JSZip de forma perezosa bajo demanda para empaquetado de documentación.
     */
    loadJSZip: async function() {
      if (global.JSZip) {
        return global.JSZip;
      }
      const cdnUrl = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
      await loadScriptAsync(cdnUrl, {
        crossOrigin: 'anonymous'
      });
      return global.JSZip;
    },

    /**
     * Carga bajo demanda la portada base64 por defecto para propuestas/dossiers.
     */
    loadDefaultCoverImage: async function() {
      if (global.RA_DEFAULT_COVER_IMAGE) {
        return global.RA_DEFAULT_COVER_IMAGE;
      }
      await loadScriptAsync('assets/default-cover-image.js?v=20261029a');
      return global.RA_DEFAULT_COVER_IMAGE || null;
    },

    /**
     * Pre-carga silenciosa de fondo (Prefetch) en momentos de baja actividad de CPU.
     */
    prefetchStep5Dependencies: function() {
      if ('requestIdleCallback' in global) {
        global.requestIdleCallback(() => {
          RALazyLoader.loadJsPDF().catch(() => {});
          RALazyLoader.loadDefaultCoverImage().catch(() => {});
        });
      } else {
        setTimeout(() => {
          RALazyLoader.loadJsPDF().catch(() => {});
          RALazyLoader.loadDefaultCoverImage().catch(() => {});
        }, 1500);
      }
    }
  };

  global.RALazyLoader = RALazyLoader;
  global.ensureJsPdfLoaded = () => RALazyLoader.loadJsPDF();
  global.ensureJSZipLoaded = () => RALazyLoader.loadJSZip();
  global.ensureDefaultCoverLoaded = () => RALazyLoader.loadDefaultCoverImage();

})(typeof window !== 'undefined' ? window : this);
