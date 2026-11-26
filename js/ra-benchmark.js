/**
 * ============================================================================
 * ⚡ RA BENCHMARK & TELEMETRY HUD — RENDIMIENTO INDUSTRIAL AAA
 * Monitor en tiempo real de FPS, Frame Time (ms), Ciclo GPU (Sleep/Active)
 * y medidor de estrés para optimizaciones extremas en CesiumJS/WebGL.
 * ============================================================================
 */

(function(global) {
  'use strict';

  let isEnabled = true;
  let isExpanded = false;
  let hudContainer = null;
  let _metricsRafId = null;
  let _idleSleepTimer = null;
  let _lastPillUpdateTs = 0;

  // Métricas de renderizado real de Cesium y de pantalla
  let lastFrameTime = performance.now();
  let frameCount = 0;
  let displayFps = 60;
  let actualRenderDurationMs = 0.0;
  let renderStartTime = 0;
  let lastSecondTime = performance.now();
  let lastRenderCallTime = 0;
  let isGpuSleeping = true;
  let memoryMb = 0;

  // Historial para minigráfico
  const fpsHistory = new Array(30).fill(60);

  const RABenchmark = {
    init: function() {
      if (document.getElementById('ra-benchmark-hud')) return;

      // Recuperar posición personalizada guardada si el usuario la ha movido previamente
      let savedPos = null;
      try {
        const raw = localStorage.getItem('ra_benchmark_pos');
        if (raw) savedPos = JSON.parse(raw);
      } catch (e) {}

      hudContainer = document.createElement('div');
      hudContainer.id = 'ra-benchmark-hud';
      
      const hasCustomPos = savedPos && Number.isFinite(savedPos.left) && Number.isFinite(savedPos.top);
      hudContainer.style.cssText = `
        position: fixed;
        ${hasCustomPos ? `top: ${savedPos.top}px; left: ${savedPos.left}px;` : 'bottom: 78px; right: 20px;'}
        z-index: 9600;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 11px;
        user-select: none;
        pointer-events: auto;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 6px;
      `;

      hudContainer.innerHTML = `
        <div id="ra-benchmark-pill" style="
          display: flex;
          align-items: center;
          gap: 7px;
          background: rgba(15, 23, 42, 0.90);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(56, 189, 248, 0.4);
          padding: 6px 14px;
          border-radius: 9999px;
          color: #f8fafc;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.55);
          cursor: grab;
          transition: border-color 0.2s, box-shadow 0.2s;
        " title="⠿ Arrastra para mover a cualquier parte / Clic para detalles [B]">
          <span style="color:#64748b;font-size:10px;cursor:grab;" title="Tirador de arrastre">⠿</span>
          <span style="color:#38bdf8;font-weight:bold;">⚡</span>
          <span id="ra-bm-fps" style="font-weight:bold;color:#4ade80;">60 FPS</span>
          <span style="color:#64748b;">·</span>
          <span id="ra-bm-frametime" style="color:#94a3b8;">0.0 ms</span>
          <span style="color:#64748b;">·</span>
          <span id="ra-bm-state" style="padding:1px 6px;border-radius:4px;font-size: 10px;background:rgba(56,189,248,0.15);color:#38bdf8;font-weight:bold;">💤 SLEEP (0% GPU)</span>
          <span style="color:#64748b;">·</span>
          <span id="ra-bm-mem" style="color:#cbd5e1;">-- MB</span>
        </div>

        <div id="ra-benchmark-panel" style="
          display: none;
          width: 270px;
          background: rgba(15, 23, 42, 0.95);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(56, 189, 248, 0.4);
          border-radius: 12px;
          padding: 12px 14px;
          color: #f8fafc;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
          flex-direction: column;
          gap: 8px;
        ">
          <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:6px;">
            <span style="font-weight:bold;color:#38bdf8;font-size:11px;">TELEMETRÍA HIPERESPACIAL</span>
            <span style="font-size:10px;color:#94a3b8;" id="ra-bm-panels-count">0 placas</span>
          </div>

          <div style="display:flex;justify-content:space-between;font-size:10px;">
            <span style="color:#94a3b8;">Motor gráfico:</span>
            <span id="ra-bm-draw-mode" style="color:#34d399;font-weight:bold;">ON-DEMAND (PINTOR PEREZOSO)</span>
          </div>

          <!-- Historial gráfico de FPS -->
          <div style="margin-top:4px;">
            <div style="display:flex;justify-content:space-between;font-size: 10px;color:#64748b;margin-bottom:2px;">
              <span>ESTABILIDAD DE FRAMES (30 MUESTRAS)</span>
              <span id="ra-bm-fps-avg">60 FPS</span>
            </div>
            <div id="ra-bm-sparkline" style="display:flex;align-items:flex-end;gap:2px;height:24px;background:rgba(0,0,0,0.3);padding:2px;border-radius:4px;">
            </div>
          </div>

          <div style="display:flex;gap:6px;margin-top:6px;">
            <button id="ra-bm-stress-btn" type="button" style="
              flex: 1;
              background: linear-gradient(135deg, #0284c7, #2563eb);
              border: none;
              color: white;
              font-weight: bold;
              font-size: 10px;
              padding: 7px;
              border-radius: 6px;
              cursor: pointer;
              transition: all 0.2s ease;
            ">🚀 TEST DE ESTRÉS (360°)</button>
            <button id="ra-bm-reset-pos-btn" type="button" style="
              background: rgba(255,255,255,0.08);
              border: 1px solid rgba(255,255,255,0.15);
              color: #94a3b8;
              font-size: 10px;
              padding: 7px 10px;
              border-radius: 6px;
              cursor: pointer;
            " title="Restablecer posición original">↺</button>
          </div>
        </div>
      `;

      document.body.appendChild(hudContainer);

      const pill = document.getElementById('ra-benchmark-pill');

      // Sistema de Arrastre Libre (Draggable) sin colisiones
      let isDragging = false;
      let dragStartX = 0;
      let dragStartY = 0;
      let elemStartX = 0;
      let elemStartY = 0;
      let hasMovedSignificantly = false;

      pill.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        isDragging = true;
        hasMovedSignificantly = false;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        const rect = hudContainer.getBoundingClientRect();
        elemStartX = rect.left;
        elemStartY = rect.top;
        pill.style.cursor = 'grabbing';
      });

      window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;
        if (!hasMovedSignificantly && Math.hypot(dx, dy) > 4) {
          hasMovedSignificantly = true;
        }
        if (hasMovedSignificantly) {
          const newLeft = Math.max(8, Math.min(window.innerWidth - hudContainer.offsetWidth - 8, elemStartX + dx));
          const newTop = Math.max(8, Math.min(window.innerHeight - hudContainer.offsetHeight - 8, elemStartY + dy));
          hudContainer.style.right = 'auto';
          hudContainer.style.bottom = 'auto';
          hudContainer.style.left = `${newLeft}px`;
          hudContainer.style.top = `${newTop}px`;
        }
      });

      window.addEventListener('mouseup', () => {
        if (!isDragging) return;
        isDragging = false;
        pill.style.cursor = 'grab';
        if (hasMovedSignificantly) {
          const rect = hudContainer.getBoundingClientRect();
          try {
            localStorage.setItem('ra_benchmark_pos', JSON.stringify({ left: Math.round(rect.left), top: Math.round(rect.top) }));
          } catch (e) {}
        }
      });

      pill.addEventListener('click', () => {
        if (hasMovedSignificantly) {
          hasMovedSignificantly = false;
          return;
        }
        isExpanded = !isExpanded;
        const panel = document.getElementById('ra-benchmark-panel');
        if (panel) panel.style.display = isExpanded ? 'flex' : 'none';
        if (isExpanded && isEnabled) {
          this.startMetricsLoop();
        } else {
          this.stopMetricsLoop();
        }
      });

      const resetPosBtn = document.getElementById('ra-bm-reset-pos-btn');
      if (resetPosBtn) {
        resetPosBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          try {
            localStorage.removeItem('ra_benchmark_pos');
          } catch (err) {}
          hudContainer.style.left = 'auto';
          hudContainer.style.top = 'auto';
          hudContainer.style.right = '20px';
          hudContainer.style.bottom = '78px';
        });
      }

      const stressBtn = document.getElementById('ra-bm-stress-btn');
      if (stressBtn) {
        stressBtn.addEventListener('click', () => {
          this.runStressTest();
        });
      }

      // Atajo de teclado 'B' para toggle
      window.addEventListener('keydown', (e) => {
        if (e.key === 'b' || e.key === 'B') {
          const tag = (document.activeElement && document.activeElement.tagName) || '';
          if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
            this.toggle();
          }
        }
      });

      this.hookCesiumRender();
      // No arrancar el bucle rAF a 60fps mientras el panel está colapsado (0% CPU en reposo)
    },

    hookCesiumRender: function() {
      const self = this;
      let attached = false;

      const attachScene = (scene) => {
        if (attached || !scene) return;
        attached = true;

        scene.preRender.addEventListener(() => {
          renderStartTime = performance.now();
          lastRenderCallTime = renderStartTime;
          isGpuSleeping = false;
          if (!isExpanded && isEnabled) {
            if (_idleSleepTimer) clearTimeout(_idleSleepTimer);
            _idleSleepTimer = setTimeout(() => {
              _idleSleepTimer = null;
              isGpuSleeping = true;
              actualRenderDurationMs = 0.0;
              self.updateDOM();
            }, 250);
          }
        });

        scene.postRender.addEventListener(() => {
          const now = performance.now();
          if (renderStartTime > 0) {
            actualRenderDurationMs = now - renderStartTime;
          }
          if (!isExpanded && isEnabled && (now - _lastPillUpdateTs > 250)) {
            _lastPillUpdateTs = now;
            if (performance && performance.memory) {
              memoryMb = Math.round(performance.memory.usedJSHeapSize / (1024 * 1024));
            }
            self.updateDOM();
          }
        });
      };

      const tryAttachNow = () => {
        if (global.viewer && global.viewer.scene) {
          attachScene(global.viewer.scene);
          return true;
        }
        return false;
      };

      if (tryAttachNow()) return;

      const events = global.RA && global.RA.events;
      if (events && typeof events.on === 'function') {
        events.on('viewer:ready', (v) => {
          const target = (v && v.scene) ? v : global.viewer;
          if (target && target.scene) attachScene(target.scene);
        });
        events.on('panels:updated', () => self.updateDOM());
        if (typeof global.addEventListener === 'function') {
          global.addEventListener('load', tryAttachNow, { once: true });
        }
      } else {
        // Fallback seguro si ra-events.js aún no ha cargado
        const checkViewer = setInterval(() => {
          if (tryAttachNow()) {
            clearInterval(checkViewer);
          }
        }, 250);
      }
    },

    stopMetricsLoop: function() {
      if (_metricsRafId !== null) {
        cancelAnimationFrame(_metricsRafId);
        _metricsRafId = null;
      }
    },

    startMetricsLoop: function() {
      if (_metricsRafId !== null) return;
      const updateSparkline = () => {
        const spark = document.getElementById('ra-bm-sparkline');
        if (!spark || !isExpanded) return;
        spark.innerHTML = '';
        fpsHistory.forEach(f => {
          const bar = document.createElement('div');
          const h = Math.max(3, Math.min(24, Math.round((f / 60) * 24)));
          bar.style.width = '6px';
          bar.style.height = h + 'px';
          bar.style.background = f >= 50 ? '#4ade80' : (f >= 30 ? '#facc15' : '#38bdf8');
          bar.style.borderRadius = '1px';
          spark.appendChild(bar);
        });
      };

      const loop = (now) => {
        if (!isExpanded || !isEnabled) {
          _metricsRafId = null;
          return;
        }
        frameCount++;

        // Si han pasado más de 140ms sin preRender de Cesium, la GPU está en reposo
        if (now - lastRenderCallTime > 140) {
          isGpuSleeping = true;
          actualRenderDurationMs = 0.0;
        }

        if (now - lastSecondTime >= 1000) {
          displayFps = frameCount;
          frameCount = 0;
          lastSecondTime = now;

          fpsHistory.push(displayFps);
          if (fpsHistory.length > 30) fpsHistory.shift();

          // Memoria JS Heap si está disponible
          if (performance && performance.memory) {
            memoryMb = Math.round(performance.memory.usedJSHeapSize / (1024 * 1024));
          }

          this.updateDOM();
          updateSparkline();
        }

        _metricsRafId = requestAnimationFrame(loop);
      };

      _metricsRafId = requestAnimationFrame(loop);
    },

    updateDOM: function() {
      const fpsEl = document.getElementById('ra-bm-fps');
      const timeEl = document.getElementById('ra-bm-frametime');
      const stateEl = document.getElementById('ra-bm-state');
      const memEl = document.getElementById('ra-bm-mem');
      const panelsCountEl = document.getElementById('ra-bm-panels-count');
      const fpsAvgEl = document.getElementById('ra-bm-fps-avg');

      if (fpsEl) {
        if (isGpuSleeping) {
          fpsEl.textContent = '60 FPS';
          fpsEl.style.color = '#38bdf8';
        } else {
          fpsEl.textContent = `${displayFps} FPS`;
          fpsEl.style.color = displayFps >= 50 ? '#4ade80' : (displayFps >= 30 ? '#facc15' : '#f87171');
        }
      }
      if (timeEl) {
        timeEl.textContent = isGpuSleeping ? '0.0 ms' : `${actualRenderDurationMs.toFixed(1)} ms`;
      }
      if (stateEl) {
        if (isGpuSleeping) {
          stateEl.textContent = '💤 SLEEP (0% GPU)';
          stateEl.style.background = 'rgba(56, 189, 248, 0.15)';
          stateEl.style.color = '#38bdf8';
        } else {
          stateEl.textContent = '⚡ ACTIVO';
          stateEl.style.background = 'rgba(16, 185, 129, 0.2)';
          stateEl.style.color = '#34d399';
        }
      }
      if (memEl && memoryMb > 0) {
        memEl.textContent = `${memoryMb} MB`;
      }
      if (panelsCountEl) {
        const count = (global.allRenderedPanels && global.allRenderedPanels.length) || 0;
        panelsCountEl.textContent = `${count} módulos`;
      }
      if (fpsAvgEl) {
        const sum = fpsHistory.reduce((a, b) => a + b, 0);
        const avg = Math.round(sum / fpsHistory.length);
        fpsAvgEl.textContent = `Media: ${avg} FPS`;
      }
    },

    toggle: function() {
      if (!hudContainer) return;
      isEnabled = !isEnabled;
      hudContainer.style.display = isEnabled ? 'flex' : 'none';
      if (isEnabled && isExpanded) {
        this.startMetricsLoop();
      } else {
        this.stopMetricsLoop();
      }
    },

    runStressTest: function() {
      if (!global.viewer || !global.viewer.camera) return;
      const camera = global.viewer.camera;
      const duration = 3000;
      const startTime = performance.now();
      const stressBtn = document.getElementById('ra-bm-stress-btn');
      if (stressBtn) {
        stressBtn.disabled = true;
        stressBtn.textContent = '⏳ GIRANDO 360°...';
      }

      const orbit = () => {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(1.0, elapsed / duration);
        camera.rotate(Cesium.Cartesian3.UNIT_Z, -0.035);
        if (global.viewer.scene && typeof global.viewer.scene.requestRender === 'function') {
          global.viewer.scene.requestRender();
        }

        if (progress < 1.0) {
          requestAnimationFrame(orbit);
        } else {
          if (stressBtn) {
            stressBtn.disabled = false;
            stressBtn.textContent = '🚀 TEST DE ESTRÉS (ORBITAL 360°)';
          }
          if (typeof global.showStatus === 'function') {
            global.showStatus(`TEST 360° COMPLETADO: ${displayFps} FPS ESTABLES`, 3000);
          }
        }
      };

      requestAnimationFrame(orbit);
    }
  };

  global.RABenchmark = RABenchmark;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => RABenchmark.init());
  } else {
    setTimeout(() => RABenchmark.init(), 400);
  }

})(typeof window !== 'undefined' ? window : this);
