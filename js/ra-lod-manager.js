/**
 * ============================================================================
 * 🦅 RA LOD MANAGER & MOTION-ADAPTIVE FRAME GOVERNOR — NIVEL DIOS AAA
 * ============================================================================
 * Arquitectura de optimización de refresco 60–120 FPS para Visor 3D CAD:
 * 1. LOD espacial por altitud de cámara (oculta latiguillos/etiquetas > 85m).
 * 2. Escalado Dinámico en Movimiento (Motion-Adaptive Pipeline):
 *    - En navegación activa (moveStart): activa descarte dinámico en 3D Tiles,
 *      congela descarga de bloques traseros fuera de frustum, desactiva filtrado
 *      PCF suave de sombras y aplica gobernador de resolución adaptativa si el
 *      frame time supera los 20ms (<50 FPS).
 *    - Al detener la cámara (moveEnd + 160ms): restaura fidelidad CAD completa,
 *      sombras nítidas y resolución 100% con 2 fotogramas de convergencia.
 * ============================================================================
 */

(function(global) {
  'use strict';

  let isEnabled = true;
  let currentLod = 'HIGH'; // 'HIGH' (<= 85m) | 'LOW' (> 85m)
  const ALTITUDE_THRESHOLD = 85.0; // Metros de altitud de cámara

  // Estado del Gobernador Adaptativo en Movimiento
  let _isMotionBoostActive = false;
  let _settleTimer = null;
  let _savedState = {
    sse: 16,
    skipLod: false,
    loadSiblings: true,
    cullMoving: false,
    dynamicSse: false,
    softShadows: true,
    resScale: 1.0,
    fxaa: true
  };

  // Telemetría ligera de Frame Pacing
  let _lastPreRenderTs = 0;
  let _emaFrameMs = 12.0; // Media móvil exponencial del coste de frame GPU/CPU

  const RALodManager = {
    init: function() {
      let retries = 0;
      const MAX_RETRIES = 120;
      const checkViewer = setInterval(() => {
        retries++;
        if (global.viewer && global.viewer.camera && global.viewer.scene) {
          clearInterval(checkViewer);
          this.bindCameraEvents();
          this.bindFrameGovernor();
        } else if (retries >= MAX_RETRIES) {
          clearInterval(checkViewer);
        }
      }, 250);
    },

    bindFrameGovernor: function() {
      const scene = global.viewer.scene;
      if (!scene || !scene.preRender || !scene.postRender) return;

      scene.preRender.addEventListener(() => {
        _lastPreRenderTs = performance.now();
      });

      scene.postRender.addEventListener(() => {
        if (_lastPreRenderTs > 0) {
          const dt = performance.now() - _lastPreRenderTs;
          _emaFrameMs = _emaFrameMs * 0.82 + dt * 0.18;
        }
      });
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

      if (camera.moveStart && typeof camera.moveStart.addEventListener === 'function') {
        camera.moveStart.addEventListener(() => {
          if (!isEnabled) return;
          if (_settleTimer) {
            clearTimeout(_settleTimer);
            _settleTimer = null;
          }
          this.enterMotionBoost();
        });
      }

      if (camera.moveEnd && typeof camera.moveEnd.addEventListener === 'function') {
        camera.moveEnd.addEventListener(() => {
          if (_settleTimer) clearTimeout(_settleTimer);
          _settleTimer = setTimeout(() => {
            _settleTimer = null;
            this.exitMotionBoost();
          }, 160);
        });
      }
    },

    enterMotionBoost: function() {
      if (_isMotionBoostActive) return;
      if (global.RACapture && global.RACapture.enabled) return;

      const viewer = global.viewer;
      const scene = viewer ? viewer.scene : null;
      if (!viewer || !scene) return;

      _isMotionBoostActive = true;

      // 1. Guardar y optimizar Google 3D Tileset durante el giro/vuelo de cámara
      const ts = global.google3DTileset;
      if (ts) {
        try {
          _savedState.sse = ts.maximumScreenSpaceError || 16;
          _savedState.skipLod = !!ts.skipLevelOfDetail;
          _savedState.loadSiblings = ts.loadSiblings !== false;
          _savedState.cullMoving = !!ts.cullRequestsWhileMoving;
          _savedState.dynamicSse = !!ts.dynamicScreenSpaceError;

          // Relajar SSE levemente en movimiento y cancelar peticiones obsoletas de cámara
          ts.cullRequestsWhileMoving = true;
          ts.cullRequestsWhileMovingMultiplier = 60.0;
          ts.dynamicScreenSpaceError = true;
          ts.dynamicScreenSpaceErrorDensity = 0.00278;
          ts.dynamicScreenSpaceErrorFactor = 4.0;
          ts.loadSiblings = false;
          if (_savedState.sse < 16) {
            ts.maximumScreenSpaceError = 16;
          }
        } catch (_eTs) {}
      }

      // 2. Desactivar filtrado suave PCF de sombras durante el giro (ahorra 4-6ms de fill-rate)
      if (scene.shadowMap && scene.shadowMap.enabled) {
        try {
          _savedState.softShadows = !!scene.shadowMap.softShadows;
          scene.shadowMap.softShadows = false;
        } catch (_eSm) {}
      }

      // 3. Gobernador Automático de Resolución: si el frame time medio supera 18ms (<55 FPS),
      // reducir temporalmente la escala de resolución un 15% mientras se orbita
      _savedState.resScale = viewer.resolutionScale || 1.0;
      if (_emaFrameMs > 18.0 && _savedState.resScale > 0.75) {
        try {
          viewer.resolutionScale = Math.max(0.75, Math.round(_savedState.resScale * 0.85 * 100) / 100);
        } catch (_eRs) {}
      }

      // 4. Limpiar cualquier hover residual para no redibujar badges en pleno giro
      if (global.cadHoverTarget) {
        global.cadHoverTarget = null;
      }
    },

    exitMotionBoost: function() {
      if (!_isMotionBoostActive) return;
      _isMotionBoostActive = false;

      const viewer = global.viewer;
      const scene = viewer ? viewer.scene : null;
      if (!viewer || !scene) return;

      // 1. Restaurar fidelidad estática de Google 3D Tileset
      const ts = global.google3DTileset;
      if (ts) {
        try {
          ts.maximumScreenSpaceError = _savedState.sse;
          ts.skipLevelOfDetail = _savedState.skipLod;
          ts.loadSiblings = _savedState.loadSiblings;
          ts.cullRequestsWhileMoving = _savedState.cullMoving;
          ts.dynamicScreenSpaceError = _savedState.dynamicSse;
        } catch (_eTs) {}
      }

      // 2. Restaurar sombras suaves de alta definición
      if (scene.shadowMap && scene.shadowMap.enabled) {
        try {
          scene.shadowMap.softShadows = _savedState.softShadows;
        } catch (_eSm) {}
      }

      // 3. Restaurar escala de resolución nativa al 100%
      if (viewer.resolutionScale !== _savedState.resScale) {
        try {
          viewer.resolutionScale = _savedState.resScale;
        } catch (_eRs) {}
      }

      // 4. Evaluar distancia final y solicitar fotograma limpio de asentamiento
      this.evaluateCameraDistance();
      if (typeof scene.requestRender === 'function') {
        scene.requestRender();
        if (typeof global.requestAnimationFrame === 'function') {
          global.requestAnimationFrame(() => {
            try { scene.requestRender(); } catch (_e) {}
          });
        }
      }
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
      const isCapture = !!(global.RACapture && global.RACapture.enabled);
      let needsRender = false;

      // 1. Etiquetas de número de módulo (_panelNumberLabelCollection)
      if (global._panelNumberLabelCollection) {
        const shouldShowLabels = !isCapture && showMicroDetails && (global.areLabelsVisible !== false);
        if (global._panelNumberLabelCollection.show !== shouldShowLabels) {
          global._panelNumberLabelCollection.show = shouldShowLabels;
          needsRender = true;
        }
      }

      // 2. Estructuras portantes si hay más de 200 módulos
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

    isMotionBoostActive: function() {
      return _isMotionBoostActive;
    },

    setEnabled: function(val) {
      isEnabled = !!val;
      if (!isEnabled) {
        this.exitMotionBoost();
        this.applyLod('HIGH');
      }
    }
  };

  global.RALodManager = RALodManager;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => RALodManager.init());
  } else {
    setTimeout(() => RALodManager.init(), 500);
  }

})(typeof window !== 'undefined' ? window : this);
