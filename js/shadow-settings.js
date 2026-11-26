/**
 * ============================================================================
 * SHADOW SETTINGS MODULE (shadow-settings.js) — AAA Graphics Engine Calibration
 * ============================================================================
 * Gestión modular, unificada y estable de sombras en Cesium Viewer:
 * - Calidad de resolución del mapa de sombras (Baja 1K, Media 2K, Alta 4K, Ultra 8K).
 * - Radio de acción / distancia máxima de sombras (50m a 2000m).
 * - Sesgo físico y offset poligonal/normal calibrado para erradicar el parpadeo
 *   masivo ("black screen / total shadow flash") al orbitar o desplazar cámara.
 * - Proyección bidireccional y autosombreado (Terreno 3D, Mallas fotogramétricas,
 *   Estructuras, Pérgolas, Módulos FV).
 * - Interfaz limpia e integrada en el panel flotante de ajustes (⚙️).
 * ============================================================================
 */

(function(global) {
  'use strict';

  var SHADOW_CONFIG_KEY = 'ra_shadow_settings_v1';

  var QUALITY_PRESETS = {
    low: {
      label: 'Baja (Rápida)',
      tag: '1K',
      size: 1024,
      softShadows: false,
      desc: 'Mapa de sombras básico 1024px. Ideal para equipos con GPU integrada.'
    },
    medium: {
      label: 'Media (Equilibrada)',
      tag: '2K',
      size: 2048,
      softShadows: true,
      desc: 'Resolución estándar 2048px con filtrado suave. Óptima fluidez y detalle.'
    },
    high: {
      label: 'Alta (Fidelidad)',
      tag: '4K',
      size: 4096,
      softShadows: true,
      desc: 'Alta definición 4096px con bordes nítidos. Recomendada para proyectos CAD.'
    },
    ultra: {
      label: 'Ultra (Editorial)',
      tag: '8K',
      size: 8192,
      softShadows: true,
      desc: 'Máxima resolución 8192px para capturas de alta precisión e informes.'
    }
  };

  var defaultSettings = {
    quality: 'high',
    radius: 400,
    biasMeters: 0.08,
    selfShadows: true,
    terrainShadows: true,
    simResolution: 'medium', // 'sketch' | 'fast' (16h) | 'medium' (72h) | 'ultra' (192h)
    detailedBypass: true,    // true: 3 sub-strings | false: monolítico
    relativeColorScale: false // true: escala relativa al líder (100% = verde) | false: escala absoluta por pérdidas
  };

  function loadSettings() {
    try {
      var raw = localStorage.getItem(SHADOW_CONFIG_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        return Object.assign({}, defaultSettings, parsed);
      }
    } catch (e) {}
    return Object.assign({}, defaultSettings);
  }

  function saveSettings(cfg) {
    try {
      localStorage.setItem(SHADOW_CONFIG_KEY, JSON.stringify(cfg));
    } catch (e) {}
  }

  var currentSettings = loadSettings();
  if (typeof global !== 'undefined') {
    global.wpShadowBiasMeters = Number(currentSettings.biasMeters) || 0.08;
    global.raHeatmapResolution = currentSettings.simResolution || 'medium';
    global.raRelativeColorScale = !!currentSettings.relativeColorScale;
  }

  /**
   * Calibra los parámetros de un ShadowMap de Cesium con estabilidad de grado AAA.
   * Importante: _fitNearFar DEBE permanecer en true (valor nativo de Cesium) para que
   * las 4 cascadas ortográficas ajusten sus planos Znear/Zfar al volumen de escena real
   * durante rotaciones/paneos de cámara, evitando que la escena caiga fuera del rango
   * de profundidad de la cascada y parpadee completamente en sombra.
   */
  function configureCesiumShadowMap(shadowMap) {
    if (!shadowMap) return;
    var preset = QUALITY_PRESETS[currentSettings.quality] || QUALITY_PRESETS.high;
    var radiusMeters = Math.max(50.0, Math.min(2500.0, Number(currentSettings.radius) || 400.0));
    var biasMeters = Math.max(0.01, Math.min(2.0, Number(currentSettings.biasMeters) || Number(global.wpShadowBiasMeters) || 0.08));
    global.wpShadowBiasMeters = biasMeters;

    if (shadowMap.size !== preset.size) {
      shadowMap.size = preset.size;
    }
    shadowMap.softShadows = preset.softShadows;
    shadowMap.maximumDistance = radiusMeters;
    shadowMap._fitNearFar = false;
    shadowMap.fadingEnabled = true;
    shadowMap.cascadesEnabled = true;
    shadowMap.numberOfCascades = 4;
    shadowMap.enabled = true;

    // Cálculo de depthBias combinado con polygonOffset hardware para evitar auto-oclusión
    // en ángulos rasantes al orbitar sobre Google 3D Tiles y terreno
    var depthBias = Math.max(0.00025, Math.min(0.005, biasMeters / Math.max(200.0, radiusMeters)));

    if (shadowMap._primitiveBias) {
      shadowMap._primitiveBias.polygonOffset = true;
      shadowMap._primitiveBias.polygonOffsetFactor = 1.1;
      shadowMap._primitiveBias.polygonOffsetUnits = 3.2;
      shadowMap._primitiveBias.normalOffset = true;
      shadowMap._primitiveBias.normalOffsetScale = 0.25;
      shadowMap._primitiveBias.normalShading = false;
      shadowMap._primitiveBias.depthBias = depthBias;
    }
    if (shadowMap._terrainBias) {
      shadowMap._terrainBias.polygonOffset = true;
      shadowMap._terrainBias.polygonOffsetFactor = 1.1;
      shadowMap._terrainBias.polygonOffsetUnits = 3.2;
      shadowMap._terrainBias.normalOffset = true;
      shadowMap._terrainBias.normalOffsetScale = 0.35;
      shadowMap._terrainBias.normalShading = false;
      shadowMap._terrainBias.depthBias = depthBias * 1.15;
    }
  }

  function applySettings() {
    var v = (typeof global.viewer !== 'undefined' && global.viewer) ? global.viewer : null;
    if (!v || !v.scene) return;

    var scene = v.scene;

    // 1. Configurar ShadowMap de Cesium
    if (scene.shadowMap) {
      try {
        configureCesiumShadowMap(scene.shadowMap);
      } catch (eMap) {
        if (global.RA && global.RA.log) global.RA.log.warn('[ShadowSettings] Error configurando shadowMap:', eMap);
      }
    }

    // 2. Proyección de terreno y sombras de globo
    if (scene.globe) {
      try {
        if (typeof Cesium !== 'undefined' && Cesium.ShadowMode) {
          scene.globe.shadows = currentSettings.terrainShadows ? Cesium.ShadowMode.ENABLED : Cesium.ShadowMode.RECEIVE_ONLY;
        }
      } catch (eGlobe) {}
    }

    // 3. Autosombreado y recepción en Google 3D Tiles y Cesium OSM Buildings
    var shadowMode = (typeof Cesium !== 'undefined' && Cesium.ShadowMode)
      ? (currentSettings.selfShadows ? Cesium.ShadowMode.ENABLED : Cesium.ShadowMode.RECEIVE_ONLY)
      : undefined;

    if (global.google3DTileset) {
      try { global.google3DTileset.shadows = shadowMode; } catch(eT) {}
    }
    if (global.cesiumOsmBuildings) {
      try { global.cesiumOsmBuildings.shadows = shadowMode; } catch(eO) {}
    }

    // 4. Sincronizar primitivas de edificios y obstáculos (respetando ShadowMode.DISABLED explícito)
    var hasShadowEnum = (typeof Cesium !== 'undefined' && Cesium.ShadowMode);
    function _enableUnlessDisabled(prim) {
      if (!hasShadowEnum || !prim || typeof prim.isDestroyed !== 'function' || prim.isDestroyed()) return;
      if (prim._isSetbackBuffer) return;
      if (prim.shadows === Cesium.ShadowMode.DISABLED) return;
      try { prim.shadows = Cesium.ShadowMode.ENABLED; } catch(ePrim) {}
    }

    if (global._buildingPrimitives && Array.isArray(global._buildingPrimitives)) {
      global._buildingPrimitives.forEach(_enableUnlessDisabled);
    }
    if (global._obsPrimitives && Array.isArray(global._obsPrimitives)) {
      global._obsPrimitives.forEach(_enableUnlessDisabled);
    }

    // 5. Módulos fotovoltaicos simulados
    _enableUnlessDisabled(global.simulatedPanelsPrimitive);
    if (global._faldonPanelsPrimitives && typeof global._faldonPanelsPrimitives.forEach === 'function') {
      global._faldonPanelsPrimitives.forEach(_enableUnlessDisabled);
    }

    // Solicitar 2 frames de asentamiento (settling) para que el FBO de cascadas converja limpio
    requestShadowSettleFrames(scene);
  }

  function requestShadowSettleFrames(scene) {
    if (!scene || typeof scene.requestRender !== 'function') return;
    try {
      scene.requestRender();
      if (typeof global.requestAnimationFrame === 'function') {
        global.requestAnimationFrame(function() {
          try {
            scene.requestRender();
            global.requestAnimationFrame(function() {
              try { scene.requestRender(); } catch (_) {}
            });
          } catch (_) {}
        });
      }
    } catch (eR) {}
  }

  function setQuality(qualityKey) {
    if (!QUALITY_PRESETS[qualityKey]) return;
    currentSettings.quality = qualityKey;
    saveSettings(currentSettings);
    applySettings();
    updateUI();
  }

  function setRadius(meters) {
    var val = parseFloat(meters);
    if (isNaN(val) || val < 50) val = 50;
    if (val > 2500) val = 2500;
    currentSettings.radius = val;
    saveSettings(currentSettings);
    applySettings();
    updateUI();
  }

  function setBiasMeters(meters) {
    var val = parseFloat(meters);
    if (isNaN(val) || val < 0.01) val = 0.01;
    if (val > 2.0) val = 2.0;
    currentSettings.biasMeters = val;
    global.wpShadowBiasMeters = val;
    saveSettings(currentSettings);
    applySettings();
    updateUI();
  }

  function setSelfShadows(enabled) {
    currentSettings.selfShadows = !!enabled;
    saveSettings(currentSettings);
    applySettings();
    updateUI();
  }

  function setTerrainShadows(enabled) {
    currentSettings.terrainShadows = !!enabled;
    saveSettings(currentSettings);
    applySettings();
    updateUI();
  }

  function setSimResolution(resKey) {
    if (resKey !== 'sketch' && resKey !== 'fast' && resKey !== 'medium' && resKey !== 'ultra') return;
    currentSettings.simResolution = resKey;
    if (typeof global !== 'undefined') {
      global.raHeatmapResolution = resKey;
    }
    saveSettings(currentSettings);
    updateUI();
  }

  function setDetailedBypass(enabled) {
    currentSettings.detailedBypass = !!enabled;
    saveSettings(currentSettings);
    updateUI();
  }

  function setRelativeColorScale(enabled) {
    currentSettings.relativeColorScale = !!enabled;
    if (typeof global !== 'undefined') {
      global.raRelativeColorScale = !!enabled;
    }
    saveSettings(currentSettings);
    updateUI();

    // Actualizar dinámicamente colores del heatmap si ya está calculado y visible
    if (typeof global.wpReapplyHeatmapColors === 'function') {
      global.wpReapplyHeatmapColors();
    } else if (typeof global.wpFastRenderSimulatedPanelsAsync === 'function') {
      global.wpFastRenderSimulatedPanelsAsync(true);
    }
  }

  function updateUI() {
    // 1. Selector de calidad de sombras
    var keys = ['low', 'medium', 'high', 'ultra'];
    keys.forEach(function(k) {
      var el = document.getElementById('btn-shadow-res-' + k);
      if (el) {
        if (k === currentSettings.quality) {
          el.classList.add('active');
        } else {
          el.classList.remove('active');
        }
      }
    });

    // 2. Deslizador de radio
    var slider = document.getElementById('ra-shadow-radius-slider');
    var valDisplay = document.getElementById('ra-shadow-radius-display');
    if (slider) slider.value = currentSettings.radius;
    if (valDisplay) valDisplay.innerText = currentSettings.radius + ' m';

    // 3. Deslizador de sesgo / despegue físico
    var biasVal = Number(currentSettings.biasMeters) || 0.08;
    var biasSlider = document.getElementById('shadow-bias-slider');
    var biasDisplay = document.getElementById('bias-val-display');
    if (biasSlider) biasSlider.value = biasVal;
    if (biasDisplay) biasDisplay.innerText = biasVal.toFixed(2) + ' m';

    // 4. Checkboxes
    var chkSelf = document.getElementById('ra-shadow-self-toggle');
    if (chkSelf) chkSelf.checked = currentSettings.selfShadows;

    var chkTerrain = document.getElementById('ra-shadow-terrain-toggle');
    if (chkTerrain) chkTerrain.checked = currentSettings.terrainShadows;

    // 5. Badge en cabecera
    var badge = document.getElementById('shadow-quality-status-badge');
    if (badge && QUALITY_PRESETS[currentSettings.quality]) {
      badge.innerText = QUALITY_PRESETS[currentSettings.quality].tag + ' (' + currentSettings.radius + 'm)';
    }

    // 6. Selector de resolución de simulación solar (Estudio de Sombras)
    var simKeys = ['sketch', 'fast', 'medium', 'ultra'];
    simKeys.forEach(function(k) {
      var el = document.getElementById('btn-sim-res-' + k);
      if (el) {
        if (k === currentSettings.simResolution) {
          el.classList.add('active');
        } else {
          el.classList.remove('active');
        }
      }
    });

    var simBadge = document.getElementById('sim-res-status-badge');
    if (simBadge) {
      if (currentSettings.simResolution === 'sketch') simBadge.innerText = 'BOCETO SKYLINE (<0.1s)';
      else if (currentSettings.simResolution === 'fast') simBadge.innerText = 'RÁPIDO (16h ~0.3s)';
      else if (currentSettings.simResolution === 'ultra') simBadge.innerText = 'ULTRA (192h ~3s)';
      else simBadge.innerText = 'INGENIERÍA (72h ~1s)';
    }

    var chkBypass = document.getElementById('ra-sim-bypass-toggle');
    if (chkBypass) {
      chkBypass.checked = (currentSettings.detailedBypass !== false);
    }

    var chkRelScale = document.getElementById('ra-sim-relscale-toggle');
    if (chkRelScale) {
      chkRelScale.checked = !!currentSettings.relativeColorScale;
    }
  }

  function injectShadowControlsUI() {
    var container = document.getElementById('ra-floating-settings-popover');
    if (!container) return;

    if (document.getElementById('ra-shadow-settings-card')) {
      updateUI();
      return;
    }

    var card = document.createElement('div');
    card.className = 'ui-card';
    card.id = 'ra-shadow-settings-card';
    card.style.marginTop = '10px';

    card.innerHTML = [
      '<div class="ui-card-head" style="display:flex;justify-content:space-between;align-items:center;">',
      '  <span style="font-weight:700;color:#fff;display:flex;align-items:center;gap:6px;">',
      '    <i data-lucide="sun" class="icon-sm" style="color:var(--amber-500);width:15px;height:15px;"></i>',
      '    Sombras 3D & Alcance Óptico',
      '  </span>',
      '  <span class="card-tag" id="shadow-quality-status-badge" style="background:var(--amber-500);color:#000;font-weight:900;">HIGH</span>',
      '</div>',
      '<div class="engine-cards-group" style="padding:12px;display:flex;flex-direction:column;gap:12px;">',
      '  <!-- Calidad del mapa de sombras -->',
      '  <div style="display:flex;flex-direction:column;gap:6px;">',
      '    <span style="font-size:11px;font-weight:600;color:#e2e8f0;">Fidelidad del Mapa de Sombras</span>',
      '    <div class="engine-cards-group" style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">',
      '      <div class="engine-card-opt" id="btn-shadow-res-low" onclick="window.ShadowSettings.setQuality(\'low\')" style="padding:6px 8px;">',
      '        <div class="engine-card-title" style="font-size:11px;font-weight:700;"><span>Baja (1K)</span></div>',
      '        <div class="engine-card-desc" style="font-size:9.5px;color:#94a3b8;line-height:1.1;">GPU integrada</div>',
      '      </div>',
      '      <div class="engine-card-opt" id="btn-shadow-res-medium" onclick="window.ShadowSettings.setQuality(\'medium\')" style="padding:6px 8px;">',
      '        <div class="engine-card-title" style="font-size:11px;font-weight:700;"><span>Media (2K)</span></div>',
      '        <div class="engine-card-desc" style="font-size:9.5px;color:#94a3b8;line-height:1.1;">Equilibrada</div>',
      '      </div>',
      '      <div class="engine-card-opt" id="btn-shadow-res-high" onclick="window.ShadowSettings.setQuality(\'high\')" style="padding:6px 8px;">',
      '        <div class="engine-card-title" style="font-size:11px;font-weight:700;"><span>Alta (4K)</span></div>',
      '        <div class="engine-card-desc" style="font-size:9.5px;color:#94a3b8;line-height:1.1;">Recomendada</div>',
      '      </div>',
      '      <div class="engine-card-opt" id="btn-shadow-res-ultra" onclick="window.ShadowSettings.setQuality(\'ultra\')" style="padding:6px 8px;">',
      '        <div class="engine-card-title" style="font-size:11px;font-weight:700;"><span>Ultra (8K)</span></div>',
      '        <div class="engine-card-desc" style="font-size:9.5px;color:#94a3b8;line-height:1.1;">Editorial / CAD</div>',
      '      </div>',
      '    </div>',
      '  </div>',
      '  <div style="height:1px;background:rgba(255,255,255,0.06);"></div>',
      '  <!-- Deslizador de Radio de Acción -->',
      '  <div style="display:flex;flex-direction:column;gap:6px;">',
      '    <div style="display:flex;justify-content:space-between;align-items:center;">',
      '      <span style="font-size:11px;font-weight:600;color:#e2e8f0;">Radio de Acción de Sombras</span>',
      '      <span id="ra-shadow-radius-display" style="font-size:11px;font-weight:700;color:var(--amber-400);">400 m</span>',
      '    </div>',
      '    <input type="range" id="ra-shadow-radius-slider" min="50" max="2000" step="50" value="400"',
      '      style="width:100%;accent-color:var(--amber-500);cursor:pointer;"',
      '      oninput="window.ShadowSettings.setRadius(this.value);">',
      '    <span style="font-size:9.5px;color:#64748b;line-height:1.2;">Distancia máxima desde la cámara donde se calculan y proyectan sombras físicas.</span>',
      '  </div>',
      '  <div style="height:1px;background:rgba(255,255,255,0.06);"></div>',
      '  <!-- Opciones de sombreado cruzado y autosombras -->',
      '  <div style="display:flex;flex-direction:column;gap:8px;">',
      '    <label style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;">',
      '      <span style="font-size:11px;color:#e2e8f0;">Autosombreado 3D Tiles (Malla & Fachadas)</span>',
      '      <input type="checkbox" id="ra-shadow-self-toggle" style="accent-color:var(--amber-500);cursor:pointer;"',
      '        onchange="window.ShadowSettings.setSelfShadows(this.checked);">',
      '    </label>',
      '    <label style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;">',
      '      <span style="font-size:11px;color:#e2e8f0;">Sombras proyectadas sobre el terreno</span>',
      '      <input type="checkbox" id="ra-shadow-terrain-toggle" style="accent-color:var(--amber-500);cursor:pointer;"',
      '        onchange="window.ShadowSettings.setTerrainShadows(this.checked);">',
      '    </label>',
      '  </div>',
      '  <div style="height:1px;background:rgba(255,255,255,0.06);"></div>',
      '  <!-- Estudio Solar Anual (Heatmap & Sombras) -->',
      '  <div style="display:flex;flex-direction:column;gap:6px;">',
      '    <div style="display:flex;justify-content:space-between;align-items:center;">',
      '      <span style="font-size:11px;font-weight:600;color:#e2e8f0;">Precisión Estudio Solar (Heatmap)</span>',
      '      <span class="card-tag" id="sim-res-status-badge" style="background:var(--emerald-500, #10b981);color:#000;font-weight:900;font-size:9px;padding:2px 6px;border-radius:4px;">INGENIERÍA (72h)</span>',
      '    </div>',
      '    <div class="engine-cards-group" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;">',
      '      <div class="engine-card-opt" id="btn-sim-res-fast" onclick="window.ShadowSettings.setSimResolution(\'fast\')" style="padding:6px 4px;text-align:center;">',
      '        <div class="engine-card-title" style="font-size:10px;font-weight:700;"><span>Rápida</span></div>',
      '        <div class="engine-card-desc" style="font-size:8.5px;color:#94a3b8;line-height:1.1;">48h (~0.2s)</div>',
      '      </div>',
      '      <div class="engine-card-opt" id="btn-sim-res-medium" onclick="window.ShadowSettings.setSimResolution(\'medium\')" style="padding:6px 4px;text-align:center;">',
      '        <div class="engine-card-title" style="font-size:10px;font-weight:700;"><span>Ingeniería</span></div>',
      '        <div class="engine-card-desc" style="font-size:8.5px;color:#94a3b8;line-height:1.1;">72h (~0.8s)</div>',
      '      </div>',
      '      <div class="engine-card-opt" id="btn-sim-res-ultra" onclick="window.ShadowSettings.setSimResolution(\'ultra\')" style="padding:6px 4px;text-align:center;">',
      '        <div class="engine-card-title" style="font-size:10px;font-weight:700;"><span>Ultra</span></div>',
      '        <div class="engine-card-desc" style="font-size:8.5px;color:#94a3b8;line-height:1.1;">192h (~2s)</div>',
      '      </div>',
      '    </div>',
      '  </div>',
      '  <label style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;margin-top:2px;">',
      '    <div style="display:flex;flex-direction:column;">',
      '      <span style="font-size:11px;color:#e2e8f0;">Diodos Bypass / Sub-strings</span>',
      '      <span style="font-size:9px;color:#64748b;">Subdivide el módulo en 3 zonas eléctricas</span>',
      '    </div>',
      '    <input type="checkbox" id="ra-sim-bypass-toggle" style="accent-color:var(--emerald-500, #10b981);cursor:pointer;"',
      '      onchange="window.ShadowSettings.setDetailedBypass(this.checked);">',
      '  </label>',
      '  <div style="height:1px;background:rgba(255,255,255,0.06);margin-top:2px;"></div>',
      '  <label style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;margin-top:2px;" title="Activa degradado verde a rojo normalizado al módulo con mayor producción">',
      '    <div style="display:flex;flex-direction:column;">',
      '      <span style="font-size:11px;font-weight:600;color:#e2e8f0;">Escala Relativa vs. Líder</span>',
      '      <span style="font-size:9px;color:#64748b;">Verde = mejor módulo (100%), Rojo = peor módulo</span>',
      '    </div>',
      '    <input type="checkbox" id="ra-sim-relscale-toggle" style="accent-color:var(--emerald-500, #10b981);cursor:pointer;"',
      '      onchange="window.ShadowSettings.setRelativeColorScale(this.checked);">',
      '  </label>',
      '</div>'
    ].join('\n');

    // Insertar justo antes del bloque de optimización del heatmap
    var heatmapCard = container.querySelector('.ui-card:last-of-type');
    if (heatmapCard) {
      container.insertBefore(card, heatmapCard);
    } else {
      container.appendChild(card);
    }

    if (typeof lucide !== 'undefined' && lucide.createIcons) {
      try { lucide.createIcons(); } catch(eI) {}
    }

    updateUI();
  }

  // Función canónica para configurar el shadowMap desde solar-engine e index.html
  global.wpConfigureShadowMap = configureCesiumShadowMap;

  // API pública
  global.ShadowSettings = {
    QUALITY_PRESETS: QUALITY_PRESETS,
    getSettings: function() { return Object.assign({}, currentSettings); },
    setQuality: setQuality,
    setRadius: setRadius,
    setBiasMeters: setBiasMeters,
    setSelfShadows: setSelfShadows,
    setTerrainShadows: setTerrainShadows,
    setSimResolution: setSimResolution,
    setDetailedBypass: setDetailedBypass,
    setRelativeColorScale: setRelativeColorScale,
    apply: applySettings,
    configureShadowMap: configureCesiumShadowMap,
    requestSettleFrames: requestShadowSettleFrames,
    updateUI: updateUI,
    init: function() {
      injectShadowControlsUI();
      applySettings();
    },
    injectUI: injectShadowControlsUI
  };

  // Alias de compatibilidad para ui-viewport-controls.js
  global.RAShadowSettings = global.ShadowSettings;
  global.raSyncShadowUI = updateUI;

  // Inicialización segura tras carga del DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      setTimeout(global.ShadowSettings.init, 400);
    });
  } else {
    setTimeout(global.ShadowSettings.init, 400);
  }

})(typeof window !== 'undefined' ? window : this);
