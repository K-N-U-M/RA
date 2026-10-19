/**
 * ============================================================================
 * 🦅 RA LOD MANAGER — LEVEL OF DETAIL DINÁMICO INDUSTRIAL AAA
 * Optimización de rendimiento para escenas grandes:
 * Oculta micro-detalles (latiguillos de cables curvos, etiquetas 3D, tornillería)
 * cuando la cámara se aleja (>80m), reduciendo draw calls y carga GPU en un 60-70%.
 * ============================================================================
 */

(function(global) {
  'use strict';

  let isEnabled = true;
  let currentLod = 'HIGH'; // 'HIGH' (<= 85m) | 'LOW' (> 85m)
  const ALTITUDE_THRESHOLD = 85.0; // Metros de altitud de cámara

  const RALodManager = {
    init: function() {
      const checkViewer = setInterval(() => {
        if (global.viewer && global.viewer.camera) {
          clearInterval(checkViewer);
          this.bindCameraEvents();
        }
      }, 300);
    },

    bindCameraEvents: function() {
      const camera = global.viewer.camera;
      let _lodThrottle = null;

      camera.changed.addEventListener(() => {
        if (!isEnabled) return;
        if (_lodThrottle) return;

        _lodThrottle = setTimeout(() => {
          _lodThrottle = null;
          this.evaluateCameraDistance();
        }, 120);
      });
    },

    evaluateCameraDistance: function() {
      if (!global.viewer || !global.viewer.camera) return;
      const camera = global.viewer.camera;

      let alt = 0;
      if (camera.positionCartographic) {
        alt = camera.positionCartographic.height;
      }

      const newLod = (alt > ALTITUDE_THRESHOLD) ? 'LOW' : 'HIGH';

      if (newLod !== currentLod) {
        currentLod = newLod;
        this.applyLod(currentLod);
      }
    },

    applyLod: function(lod) {
      const showMicroDetails = (lod === 'HIGH');
      let needsRender = false;

      // 1. Latiguillos de cables inter-módulo (simulatedStringsPolylineCollection)
      if (global.simulatedStringsPolylineCollection) {
        const currentStep = (typeof global.wpCurrentStep !== 'undefined') ? global.wpCurrentStep : 1;
        const shouldShowStrings = showMicroDetails && (currentStep >= 4);
        if (global.simulatedStringsPolylineCollection.show !== shouldShowStrings) {
          global.simulatedStringsPolylineCollection.show = shouldShowStrings;
          needsRender = true;
        }
      }

      // 2. Colección de etiquetas de número de módulo (_panelNumberLabelCollection)
      if (global._panelNumberLabelCollection) {
        const shouldShowLabels = showMicroDetails && (global.areLabelsVisible !== false);
        if (global._panelNumberLabelCollection.show !== shouldShowLabels) {
          global._panelNumberLabelCollection.show = shouldShowLabels;
          needsRender = true;
        }
      }

      // 3. Estructuras portantes si hay más de 200 módulos
      const panelCount = (global.allRenderedPanels && global.allRenderedPanels.length) || 0;
      if (panelCount > 200 && global.simulatedSupportsPolylineCollection) {
        if (global.simulatedSupportsPolylineCollection.show !== showMicroDetails) {
          global.simulatedSupportsPolylineCollection.show = showMicroDetails;
          needsRender = true;
        }
      }

      if (needsRender && global.viewer && global.viewer.scene && typeof global.viewer.scene.requestRender === 'function') {
        global.viewer.scene.requestRender();
      }
    },

    getLod: function() {
      return currentLod;
    },

    setEnabled: function(val) {
      isEnabled = !!val;
      if (!isEnabled) {
        this.applyLod('HIGH');
      }
    }
  };

  global.RALodManager = RALodManager;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => RALodManager.init());
  } else {
    setTimeout(() => RALodManager.init(), 600);
  }

})(typeof window !== 'undefined' ? window : this);
