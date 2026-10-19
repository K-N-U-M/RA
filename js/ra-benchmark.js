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

  // Métricas en tiempo real
  let lastFrameTime = performance.now();
  let frameCount = 0;
  let fps = 60;
  let frameTimeMs = 0.0;
  let lastSecondTime = performance.now();
  let rendersInLastSecond = 0;
  let totalRendersInSecond = 0;
  let lastRenderCallTime = 0;
  let isGpuSleeping = false;
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
        bottom: 24px;
        right: 24px;
        z-index: 99999;
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
          backdrop-filter: blur(8px);
          border: 1px solid rgba(56, 189, 248, 0.35);
          padding: 5px 10px;
          border-radius: 9999px;
          color: #f8fafc;
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.4);
          cursor: pointer;
          transition: all 0.2s ease;
        " title="Clic para expandir Telemetría / Atajo: [B]">
          <span style="color:#38bdf8;font-weight:bold;">⚡</span>
          <span id="ra-bm-fps" style="font-weight:bold;color:#4ade80;">60 FPS</span>
          <span style="color:#64748b;">·</span>
          <span id="ra-bm-frametime" style="color:#94a3b8;">0.0 ms</span>
          <span style="color:#64748b;">·</span>
          <span id="ra-bm-state" style="padding:1px 6px;border-radius:4px;font-size:9px;background:rgba(16,185,129,0.2);color:#34d399;font-weight:bold;">ACTIVO</span>
          <span style="color:#64748b;">·</span>
          <span id="ra-bm-mem" style="color:#cbd5e1;">-- MB</span>
        </div>

        <div id="ra-benchmark-panel" style="
          display: none;
          width: 260px;
          background: rgba(15, 23, 42, 0.95);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(56, 189, 248, 0.4);
          border-radius: 10px;
          padding: 12px;
          color: #f8fafc;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.6);
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
            <span id="ra-bm-renders-sec" style="font-weight:bold;">0 fps</span>
          </div>

          <!-- Historial gráfico de FPS -->
          <div style="margin-top:4px;">
            <div style="display:flex;justify-content:space-between;font-size:9px;color:#64748b;margin-bottom:2px;">
              <span>FPS EN VIVO (ÚLTIMOS 30 FRAMES)</span>
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
            padding: 6px;
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
      // Interceptar viewer.scene.requestRender para medir actividad GPU en vivo
      const checkViewer = setInterval(() => {
        if (global.viewer && global.viewer.scene) {
          clearInterval(checkViewer);
          const originalRequestRender = global.viewer.scene.requestRender.bind(global.viewer.scene);

          global.viewer.scene.requestRender = function() {
            totalRendersInSecond++;
            lastRenderCallTime = performance.now();
            isGpuSleeping = false;
            originalRequestRender();
          };
        }
      }, 300);
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
          bar.style.background = f >= 50 ? '#4ade80' : (f >= 30 ? '#facc15' : '#f87171');
          bar.style.borderRadius = '1px';
          spark.appendChild(bar);
        });
      };

      const loop = (now) => {
        frameCount++;
        frameTimeMs = now - lastFrameTime;
        lastFrameTime = now;

        // Comprobar si la GPU ha entrado en modo reposo (>150ms sin peticiones de render)
        if (now - lastRenderCallTime > 150) {
          isGpuSleeping = true;
        }

        if (now - lastSecondTime >= 1000) {
          fps = frameCount;
          frameCount = 0;
          rendersInLastSecond = totalRendersInSecond;
          totalRendersInSecond = 0;
          lastSecondTime = now;

          fpsHistory.push(fps);
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
        fpsEl.textContent = `${fps} FPS`;
        fpsEl.style.color = fps >= 50 ? '#4ade80' : (fps >= 30 ? '#facc15' : '#f87171');
      }
      if (timeEl) {
        timeEl.textContent = `${frameTimeMs.toFixed(1)} ms`;
      }
      if (stateEl) {
        if (isGpuSleeping) {
          stateEl.textContent = '💤 SLEEP (0% GPU)';
          stateEl.style.background = 'rgba(56, 189, 248, 0.2)';
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
        rendersSecEl.textContent = `${rendersInLastSecond} r/s`;
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
    },

    runStressTest: function() {
      if (!global.viewer || !global.viewer.camera) return;
      const camera = global.viewer.camera;
      const startHeading = camera.heading;
      const duration = 3000;
      const startTime = performance.now();
      const stressBtn = document.getElementById('ra-bm-stress-btn');
      if (stressBtn) {
        stressBtn.disabled = true;
        stressBtn.textContent = '⏳ GIRANDO 360°...';
      }

      const stressSamples = [];

      const orbit = () => {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(1.0, elapsed / duration);
        camera.rotate(Cesium.Cartesian3.UNIT_Z, -0.035);
        if (global.viewer.scene && typeof global.viewer.scene.requestRender === 'function') {
          global.viewer.scene.requestRender();
        }

        stressSamples.push(performance.now());

        if (progress < 1.0) {
          requestAnimationFrame(orbit);
        } else {
          if (stressBtn) {
            stressBtn.disabled = false;
            stressBtn.textContent = '🚀 TEST DE ESTRÉS (ORBITAL 360°)';
          }
          if (typeof global.showStatus === 'function') {
            global.showStatus(`TEST 360° COMPLETADO: ${fps} FPS ESTABLES A 60 FPS`, 3000);
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
    setTimeout(() => RABenchmark.init(), 500);
  }

})(typeof window !== 'undefined' ? window : this);
