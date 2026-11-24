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
     * Carga perezosa bajo demanda del exportador Word DOCX/MHTML.
     */
    loadDocxExporter: async function() {
      if (global.RADocxExporter && typeof global.RADocxExporter.buildDocxBlobFromHtml === 'function') {
        return global.RADocxExporter;
      }
      await loadScriptAsync('js/docx-exporter.js?v=20261118_t5');
      return global.RADocxExporter || null;
    },

    /**
     * Carga perezosa bajo demanda del Dossier Comercial Horizontal.
     */
    loadCommercialProposalDossier: async function() {
      if (global.CommercialProposalDossier && !global.CommercialProposalDossier._isLazyProxy) {
        return global.CommercialProposalDossier;
      }
      const pendingCfg = _lazyDossierConfig ? Object.assign({}, _lazyDossierConfig) : null;
      await loadScriptAsync('js/commercial-proposal-dossier.js?v=20261124_f0');
      if (pendingCfg && global.CommercialProposalDossier && typeof global.CommercialProposalDossier.setConfig === 'function') {
        global.CommercialProposalDossier.setConfig(pendingCfg);
      }
      return global.CommercialProposalDossier || null;
    },

    /**
     * Carga perezosa bajo demanda de los asistentes IA de catálogo de equipos.
     */
    loadEquipmentAIImporter: async function() {
      if (global.RAEquipmentAIImporter) return global.RAEquipmentAIImporter;
      await loadScriptAsync('js/equipment-ai-importer.js?v=20261124_f0');
      return global.RAEquipmentAIImporter || null;
    },

    loadEquipmentWebSearch: async function() {
      if (global.RAEquipmentWebSearch) return global.RAEquipmentWebSearch;
      await loadScriptAsync('js/equipment-web-search.js?v=20261124_f0');
      return global.RAEquipmentWebSearch || null;
    },

    /**
     * Pre-carga silenciosa de fondo (Prefetch) en momentos de baja actividad de CPU.
     */
    prefetchStep5Dependencies: function() {
      const runPrefetch = () => {
        RALazyLoader.loadJsPDF().catch(() => {});
        RALazyLoader.loadDefaultCoverImage().catch(() => {});
        RALazyLoader.loadDocxExporter().catch(() => {});
        RALazyLoader.loadCommercialProposalDossier().catch(() => {});
      };
      if ('requestIdleCallback' in global) {
        global.requestIdleCallback(runPrefetch);
      } else {
        setTimeout(runPrefetch, 1200);
      }
    }
  };

  let _lazyDossierConfig = null;
  if (!global.CommercialProposalDossier) {
    _lazyDossierConfig = { theme: 'rose', include3DRender: true, overrides: {} };
    global.CommercialProposalDossier = {
      _isLazyProxy: true,
      getConfig: function() {
        return {
          theme: _lazyDossierConfig.theme,
          include3DRender: _lazyDossierConfig.include3DRender,
          overrides: _lazyDossierConfig.overrides ? JSON.parse(JSON.stringify(_lazyDossierConfig.overrides)) : {}
        };
      },
      setConfig: function(cfg) {
        if (!cfg || typeof cfg !== 'object') return;
        if (typeof cfg.theme === 'string') _lazyDossierConfig.theme = cfg.theme;
        if (typeof cfg.include3DRender === 'boolean') _lazyDossierConfig.include3DRender = cfg.include3DRender;
        if (cfg.overrides && typeof cfg.overrides === 'object') {
          _lazyDossierConfig.overrides = JSON.parse(JSON.stringify(cfg.overrides));
        }
      },
      openConfig: async function() {
        const mod = await RALazyLoader.loadCommercialProposalDossier();
        if (mod && !mod._isLazyProxy && typeof mod.openConfig === 'function') return mod.openConfig.apply(mod, arguments);
      },
      generate: async function() {
        const mod = await RALazyLoader.loadCommercialProposalDossier();
        if (mod && !mod._isLazyProxy && typeof mod.generate === 'function') return mod.generate.apply(mod, arguments);
      },
      generateFromModal: async function() {
        const mod = await RALazyLoader.loadCommercialProposalDossier();
        if (mod && !mod._isLazyProxy && typeof mod.generateFromModal === 'function') return mod.generateFromModal.apply(mod, arguments);
      },
      setModalTheme: async function() {
        const mod = await RALazyLoader.loadCommercialProposalDossier();
        if (mod && !mod._isLazyProxy && typeof mod.setModalTheme === 'function') return mod.setModalTheme.apply(mod, arguments);
      },
      refreshSnapshot: async function() {
        const mod = await RALazyLoader.loadCommercialProposalDossier();
        if (mod && !mod._isLazyProxy && typeof mod.refreshSnapshot === 'function') return mod.refreshSnapshot.apply(mod, arguments);
      }
    };
  }

  global.RALazyLoader = RALazyLoader;
  global.ensureJsPdfLoaded = () => RALazyLoader.loadJsPDF();
  global.ensureJSZipLoaded = () => RALazyLoader.loadJSZip();
  global.ensureDefaultCoverLoaded = () => RALazyLoader.loadDefaultCoverImage();
  global.ensureDocxExporterLoaded = () => RALazyLoader.loadDocxExporter();

})(typeof window !== 'undefined' ? window : this);
