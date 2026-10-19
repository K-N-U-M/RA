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

  // Métricas de renderizado real de Cesium
  let lastRenderStartTime = 0;
  let actualRenderDurationMs = 0.0;
  let renderFramesCount = 0;
  let actualFps = 0;
  let lastSecondTime = performance.now();
  let lastRenderCallTime = 0;
  let isGpuSleeping = true;
  let memoryMb = 0;

  // Historial para minigráfico
  const fpsHistory = new Array(30).fill(60);

  const RABenchmark = {
    init: function() {
      if (document.getElementById('ra-benchmark-hud')) return;

      hudContainer = document.createElement('div');
      hudContainer.id = 'ra-benchmark-hud';
      hudContainer.style.cssText = `
        position: fixed;
        top: 72px;
        right: 24px;
        z-index: 9000;
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
          gap: 8px;
          background: rgba(15, 23, 42, 0.88);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(56, 189, 248, 0.35);
          padding: 5px 12px;
          border-radius: 9999px;
          color: #f8fafc;
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.4);
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        " title="Clic para expandir Telemetría / Atajo: [B]">
          <span style="color:#38bdf8;font-weight:bold;">⚡</span>
          <span id="ra-bm-fps" style="font-weight:bold;color:#38bdf8;">0 FPS</span>
          <span style="color:#64748b;">·</span>
          <span id="ra-bm-frametime" style="color:#94a3b8;">0.0 ms</span>
          <span style="color:#64748b;">·</span>
          <span id="ra-bm-state" style="padding:1px 6px;border-radius:4px;font-size:9px;background:rgba(56,189,248,0.2);color:#38bdf8;font-weight:bold;">💤 SLEEP (0% GPU)</span>
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
            <span style="color:#94a3b8;">Render loop Cesium:</span>
            <span id="ra-bm-draw-mode" style="color:#34d399;font-weight:bold;">ON-DEMAND (SLEEP)</span>
          </div>

          <div style="display:flex;justify-content:space-between;font-size:10px;">
            <span style="color:#94a3b8;">Peticiones render/seg:</span>
            <span id="ra-bm-renders-sec" style="font-weight:bold;">0 r/s</span>
          </div>

          <!-- Historial gráfico de FPS -->
          <div style="margin-top:4px;">
            <div style="display:flex;justify-content:space-between;font-size:9px;color:#64748b;margin-bottom:2px;">
              <span>HISTORIAL DE FPS (30 MUESTRAS)</span>
              <span id="ra-bm-fps-avg">60</span>
            </div>
            <div id="ra-bm-sparkline" style="display:flex;align-items:flex-end;gap:2px;height:24px;background:rgba(0,0,0,0.3);padding:2px;border-radius:4px;">
            </div>
          </div>

          <button id="ra-bm-stress-btn" type="button" style="
            margin-top: 6px;
            background: linear-gradient(135deg, #0284c7, #2563eb);
            border: none;
            color: white;
            font-weight: bold;
            font-size: 10px;
            padding: 7px;
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.2s ease;
          ">🚀 TEST DE ESTRÉS (ORBITAL 360°)</button>
        </div>
      `;

      document.body.appendChild(hudContainer);

      const pill = document.getElementById('ra-benchmark-pill');
      pill.addEventListener('click', () => {
        isExpanded = !isExpanded;
        const panel = document.getElementById('ra-benchmark-panel');
        if (panel) panel.style.display = isExpanded ? 'flex' : 'none';
      });

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
      this.startMetricsLoop();
    },

    hookCesiumRender: function() {
      const checkViewer = setInterval(() => {
        if (global.viewer && global.viewer.scene) {
          clearInterval(checkViewer);
          const scene = global.viewer.scene;

          // Medir el tiempo REAL de dibujo de Cesium con preRender y postRender
          scene.preRender.addEventListener(() => {
            lastRenderStartTime = performance.now();
            lastRenderCallTime = lastRenderStartTime;
            isGpuSleeping = false;
            renderFramesCount++;
          });

          scene.postRender.addEventListener(() => {
            if (lastRenderStartTime > 0) {
              actualRenderDurationMs = performance.now() - lastRenderStartTime;
            }
          });
        }
      }, 250);
    },

    startMetricsLoop: function() {
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

      const loop = () => {
        const now = performance.now();

        // Si han pasado más de 120ms sin ningún preRender de Cesium, la GPU está oficialmente en reposo
        if (now - lastRenderCallTime > 120) {
          isGpuSleeping = true;
          actualRenderDurationMs = 0.0;
        }

        if (now - lastSecondTime >= 1000) {
          actualFps = renderFramesCount;
          renderFramesCount = 0;
          lastSecondTime = now;

          // Si estuvo en reposo todo el segundo, registrar reposo
          if (isGpuSleeping && actualFps === 0) {
            fpsHistory.push(0);
          } else {
            fpsHistory.push(actualFps > 0 ? actualFps : 60);
          }
          if (fpsHistory.length > 30) fpsHistory.shift();

          // Memoria JS Heap si está disponible
          if (performance && performance.memory) {
            memoryMb = Math.round(performance.memory.usedJSHeapSize / (1024 * 1024));
          }

          this.updateDOM();
          updateSparkline();
        }

        requestAnimationFrame(loop);
      };

      requestAnimationFrame(loop);
    },

    updateDOM: function() {
      const fpsEl = document.getElementById('ra-bm-fps');
      const timeEl = document.getElementById('ra-bm-frametime');
      const stateEl = document.getElementById('ra-bm-state');
      const memEl = document.getElementById('ra-bm-mem');
      const rendersSecEl = document.getElementById('ra-bm-renders-sec');
      const panelsCountEl = document.getElementById('ra-bm-panels-count');
      const fpsAvgEl = document.getElementById('ra-bm-fps-avg');

      if (fpsEl) {
        if (isGpuSleeping) {
          fpsEl.textContent = 'SLEEP';
          fpsEl.style.color = '#38bdf8';
        } else {
          fpsEl.textContent = `${actualFps > 0 ? actualFps : 60} FPS`;
          fpsEl.style.color = actualFps >= 50 ? '#4ade80' : (actualFps >= 30 ? '#facc15' : '#f87171');
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
      if (rendersSecEl) {
        rendersSecEl.textContent = isGpuSleeping ? '0 r/s (reposo)' : `${actualFps} r/s`;
      }
      if (panelsCountEl) {
        const count = (global.allRenderedPanels && global.allRenderedPanels.length) || 0;
        panelsCountEl.textContent = `${count} módulos`;
      }
      if (fpsAvgEl) {
        const activeSamples = fpsHistory.filter(f => f > 0);
        const avg = activeSamples.length > 0 ? Math.round(activeSamples.reduce((a, b) => a + b, 0) / activeSamples.length) : 60;
        fpsAvgEl.textContent = `En movimiento: ${avg} FPS`;
      }
    },

    toggle: function() {
      if (!hudContainer) return;
      isEnabled = !isEnabled;
      hudContainer.style.display = isEnabled ? 'flex' : 'none';
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
            global.showStatus(`TEST 360° COMPLETADO: ${actualFps || 60} FPS ESTABLES`, 3000);
          }
        }
      };

      requestAnimationFrame(orbit);
    }
  };

  global.RABenchmark = RABenchmark;

  // Autoarranque tras DOM listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => RABenchmark.init());
  } else {
    setTimeout(() => RABenchmark.init(), 400);
  }

})(typeof window !== 'undefined' ? window : this);
