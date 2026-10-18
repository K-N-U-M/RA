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

  let lastContextId = null;

  function checkContextChange() {
    const ctx = (typeof window !== 'undefined' && window.viewer && window.viewer.scene) ? window.viewer.scene.context : null;
    if (ctx && ctx.id !== lastContextId) {
      lastContextId = ctx.id;
      warned.clear();
      if (typeof window !== 'undefined' && window.RA && window.RA.log) {
        window.RA.log.info('[cesium-safety] Contexto WebGL renovado (ID: ' + lastContextId + ').');
      }
    }
  }

  const originalSetUniforms = Cesium.ShaderProgram.prototype._setUniforms;
  if (typeof originalSetUniforms !== 'function') {
    console.warn('[cesium-safety] _setUniforms no encontrado; protección no instalada.');
    return;
  }
  Cesium.ShaderProgram.prototype._setUniforms = function () {
    checkContextChange();
    if (!this.__raSafetyChecked) inspectUniforms(this);
    return originalSetUniforms.apply(this, arguments);
  };

  function setupWebGLContextLossHandler(canvas) {
    if (!canvas || !canvas.addEventListener) return;
    canvas.addEventListener('webglcontextlost', function (event) {
      event.preventDefault();
      console.warn('[cesium-safety] Interceptado webglcontextlost: pausando renderizado y preservando estado.');
      if (typeof window !== 'undefined' && window.viewer) {
        window.viewer.useDefaultRenderLoop = false;
      }
      if (typeof showToast === 'function') {
        showToast('REINICIANDO GRÁFICOS', 'Acelerador 3D suspendido momentáneamente. Reanudando motor...', 'warning', 4000);
      }
    }, false);

    canvas.addEventListener('webglcontextrestored', function () {
      console.info('[cesium-safety] webglcontextrestored: reinicializando pipeline gráfico Cesium.');
      warned.clear();
      if (typeof window !== 'undefined' && window.viewer) {
        window.viewer.useDefaultRenderLoop = true;
        if (window.viewer.scene && typeof window.viewer.scene.requestRender === 'function') {
          window.viewer.scene.requestRender();
        }
      }
      if (typeof showToast === 'function') {
        showToast('GRÁFICOS RESTAURADOS', 'Acelerador 3D restablecido correctamente.', 'success', 3000);
      }
    }, false);
  }

  if (typeof window !== 'undefined') {
    window.raSetupWebGLContextLossHandler = setupWebGLContextLossHandler;
    window.addEventListener('DOMContentLoaded', function () {
      const c = document.querySelector('#cesiumContainer canvas') || document.querySelector('canvas');
      if (c) setupWebGLContextLossHandler(c);
    });
  }

  console.info('[cesium-safety] Protección de texturas y resiliencia WebGL instaladas.');
})();
