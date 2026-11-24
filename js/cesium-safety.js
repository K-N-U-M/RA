/**
 * cesium-safety.js — Protección contra el crash "Cannot read properties of undefined (reading '_target')".
 *
 * Causa: algún material/sombra entrega al shader una textura que aún no existe (carga asíncrona)
 * o que ya fue destruida. Cesium hace gl.bindTexture(value._target, ...) sin comprobar y el
 * render loop se detiene para siempre.
 *
 * Solución: envolver Cesium.ShaderProgram.prototype._setUniforms (se ejecuta en cada draw, tras
 * la inicialización lazy de los uniforms) y parchear UNA vez el prototipo de cada uniform de tipo
 * sampler para sustituir texturas inválidas por context.defaultTexture / defaultCubeMap.
 * Debe cargarse justo después de Cesium.js y antes de crear el Viewer.
 */
(function () {
  'use strict';
  if (typeof Cesium === 'undefined' || !Cesium.ShaderProgram) {
    console.warn('[cesium-safety] Cesium.ShaderProgram no disponible; protección no instalada.');
    return;
  }

  const SAMPLER_CUBE = 0x8B60;
  const patchedProtos = new WeakSet();
  const checkedProtos = new WeakSet();
  const warned = new Set();
  const stats = { replacements: 0, byUniform: {} };

  function isValidTexture(t) {
    if (!t || t._target === undefined) return false;
    if (typeof t.isDestroyed === 'function' && t.isDestroyed()) return false;
    return true;
  }

  function getFallback(uniform) {
    const ctx = window.viewer && window.viewer.scene && window.viewer.scene.context;
    if (!ctx) return undefined;
    const au = uniform._activeUniform;
    const isCube = (au && au.type === SAMPLER_CUBE) || /cube/i.test(uniform.name || '');
    return isCube ? ctx.defaultCubeMap : ctx.defaultTexture;
  }

  function report(uniform) {
    const name = uniform.name || (uniform._activeUniform && uniform._activeUniform.name) || '?';
    stats.replacements++;
    stats.byUniform[name] = (stats.byUniform[name] || 0) + 1;
    if (!warned.has(name)) {
      warned.add(name);
      console.warn('[cesium-safety] Textura inválida en uniform "' + name + '" → sustituida por textura vacía (crash evitado).');
    }
  }

  function patchSamplerProto(proto) {
    const originalSet = proto.set;
    proto.set = function () {
      const v = this.value;
      if (Array.isArray(v)) {
        for (let i = 0; i < v.length; i++) {
          if (!isValidTexture(v[i])) {
            const fb = getFallback(this);
            if (!fb) return; // sin contexto: saltar este bind antes que romper el render
            v[i] = fb;
            report(this);
          }
        }
      } else if (!isValidTexture(v)) {
        const fb = getFallback(this);
        if (!fb) return;
        this.value = fb;
        report(this);
      }
      return originalSet.apply(this, arguments);
    };
    patchedProtos.add(proto);
  }

  function inspectUniforms(program) {
    const uniforms = program._uniforms;
    if (!uniforms) return; // aún sin inicializar: se reintenta en el siguiente draw
    for (let i = 0; i < uniforms.length; i++) {
      const u = uniforms[i];
      if (!u) continue;
      const proto = Object.getPrototypeOf(u);
      if (!proto || checkedProtos.has(proto)) continue;
      checkedProtos.add(proto);
      if (typeof proto.set === 'function' && proto.set.toString().indexOf('_target') !== -1) {
        patchSamplerProto(proto);
      }
    }
    program.__raSafetyChecked = true;
  }

  const originalSetUniforms = Cesium.ShaderProgram.prototype._setUniforms;
  if (typeof originalSetUniforms !== 'function') {
    console.warn('[cesium-safety] _setUniforms no encontrado; protección no instalada.');
    return;
  }
  Cesium.ShaderProgram.prototype._setUniforms = function () {
    if (!this.__raSafetyChecked) inspectUniforms(this);
    return originalSetUniforms.apply(this, arguments);
  };

  // ── Resiliencia WebGL Context Loss (ISO 25010 / Khronos WebGL Standard) ─────
  function attachCanvasContextSafety(canvas) {
    if (!canvas || canvas.__raContextSafetyAttached) return;
    canvas.__raContextSafetyAttached = true;

    canvas.addEventListener('webglcontextlost', function (event) {
      // OBLIGATORIO por estándar WebGL: preventDefault() indica al navegador
      // que la aplicación desea restaurar el contexto y no abortar permanentemente.
      event.preventDefault();
      window.RA = window.RA || {};
      window.RA._webglContextLost = true;

      if (window.solarSimState && window.solarSimState.playInterval) {
        clearInterval(window.solarSimState.playInterval);
        window.solarSimState.playInterval = null;
        window.solarSimState.playing = false;
      }
      if (window.RABenchmark && typeof window.RABenchmark.pause === 'function') {
        try { window.RABenchmark.pause(); } catch (_) {}
      }

      console.warn('[cesium-safety] Pérdida de contexto WebGL detectada (GPU suspendida o saturada). Esperando restauración...');
      if (typeof window.showToast === 'function') {
        window.showToast('RECURSO GRÁFICO REINICIANDO', 'El sistema ha suspendido momentáneamente la GPU. Restaurando escena 3D...', 'warning', 6000);
      }
    }, false);

    canvas.addEventListener('webglcontextrestored', function () {
      window.RA = window.RA || {};
      window.RA._webglContextLost = false;
      console.info('[cesium-safety] Contexto WebGL restaurado exitosamente por el navegador.');

      try {
        if (typeof window.raResetSkyboxCache === 'function') window.raResetSkyboxCache();
        if (typeof window.render3DBuildingsInCesium === 'function') window.render3DBuildingsInCesium();
        if (typeof window.render3DObstaclesInCesium === 'function') window.render3DObstaclesInCesium();
        if (typeof window.wpFastRenderSimulatedPanels === 'function') window.wpFastRenderSimulatedPanels(true);
        if (window.RACableEngine && typeof window.RACableEngine.renderAllCables === 'function') window.RACableEngine.renderAllCables();
        if (typeof window.wpUpdateAtmosphericSky === 'function') window.wpUpdateAtmosphericSky(45);
        if (window.ShadowSettings && typeof window.ShadowSettings.apply === 'function') window.ShadowSettings.apply();
        if (window.viewer && window.viewer.scene) {
          if (typeof window.wpConfigureShadowMap === 'function' && window.viewer.scene.shadowMap) {
            window.wpConfigureShadowMap(window.viewer.scene.shadowMap);
          }
          if (typeof window.viewer.scene.requestRender === 'function') {
            window.viewer.scene.requestRender();
          }
        }
      } catch (e) {
        console.warn('[cesium-safety] Error reconstruyendo recursos GPU tras restauración:', e);
      }

      if (typeof window.showToast === 'function') {
        window.showToast('ESCENA 3D RESTAURADA', 'La aceleración gráfica por hardware ha sido reanudada con éxito.', 'success', 4000);
      }
    }, false);
  }

  let _raCesiumCanvasAttached = false;
  if (typeof HTMLCanvasElement !== 'undefined' && HTMLCanvasElement.prototype.getContext) {
    const origGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type) {
      if (!_raCesiumCanvasAttached && (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl')) {
        if (this.closest && this.closest('#cesiumContainer')) {
          attachCanvasContextSafety(this);
          _raCesiumCanvasAttached = true;
        }
      }
      return origGetContext.apply(this, arguments);
    };
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function () {
      const container = document.getElementById('cesiumContainer');
      if (container) {
        const canvases = container.querySelectorAll('canvas');
        canvases.forEach(function (c) {
          attachCanvasContextSafety(c);
          _raCesiumCanvasAttached = true;
        });
      }
    });
  }

  console.info('[cesium-safety] Protección de texturas y resiliencia WebGL instalada.');
})();
