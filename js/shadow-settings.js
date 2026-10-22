/**
 * ============================================================================
 * SHADOW SETTINGS MODULE (shadow-settings.js)
 * ============================================================================
 * Gestión modular e independiente de sombras en Cesium Viewer:
 * - Calidad de resolución del mapa de sombras (Baja, Media, Alta, Ultra).
 * - Radio de acción / distancia máxima de sombras (50m a 2000m).
 * - Proyección bidireccional y autosombreado (Terreno 3D, Mallas fotogramétricas,
 *   Estructuras, Pérgolas, Módulos FV).
 * - Interfaz limpia e integrada en el panel flotante de ajustes (⚙️).
 * 
 * Arquitectura:
 * - NO altera la cámara ni modifica posiciones geográficas.
 * - NO re-ejecuta inicializaciones destructivas.
 * - Preserva Cesium.ShadowMode.ENABLED en mallas 3D y primitivas.
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
    selfShadows: true,
    terrainShadows: true
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

  function applySettings() {
    var v = (typeof global.viewer !== 'undefined' && global.viewer) ? global.viewer : global.viewer;
    if (!v || !v.scene) return;

    var scene = v.scene;
    var preset = QUALITY_PRESETS[currentSettings.quality] || QUALITY_PRESETS.high;

    // 1. Configurar ShadowMap de Cesium
    if (scene.shadowMap) {
      try {
        scene.shadowMap.size = preset.size;
        scene.shadowMap.softShadows = preset.softShadows;
        scene.shadowMap.maximumDistance = Number(currentSettings.radius) || 400;
        scene.shadowMap.enabled = true;
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

    // 4. Sincronizar primitivas de edificios y obstáculos
    if (global._buildingPrimitives && Array.isArray(global._buildingPrimitives)) {
      global._buildingPrimitives.forEach(function(prim) {
        if (prim && typeof prim.isDestroyed === 'function' && !prim.isDestroyed()) {
          try { prim.shadows = Cesium.ShadowMode.ENABLED; } catch(eB) {}
        }
      });
    }
    if (global._obsPrimitives && Array.isArray(global._obsPrimitives)) {
      global._obsPrimitives.forEach(function(prim) {
        if (prim && typeof prim.isDestroyed === 'function' && !prim.isDestroyed()) {
          try { prim.shadows = Cesium.ShadowMode.ENABLED; } catch(eOb) {}
        }
      });
    }

    // 5. Módulos fotovoltaicos simulados
    if (global.simulatedPanelsPrimitive && typeof global.simulatedPanelsPrimitive.isDestroyed === 'function' && !global.simulatedPanelsPrimitive.isDestroyed()) {
      try { global.simulatedPanelsPrimitive.shadows = Cesium.ShadowMode.ENABLED; } catch(eP) {}
    }
    if (global._faldonPanelsPrimitives && typeof global._faldonPanelsPrimitives.forEach === 'function') {
      global._faldonPanelsPrimitives.forEach(function(prim) {
        if (prim && typeof prim.isDestroyed === 'function' && !prim.isDestroyed()) {
          try { prim.shadows = Cesium.ShadowMode.ENABLED; } catch(eFP) {}
        }
      });
    }

    // Solicitar redibujado de la escena
    if (typeof scene.requestRender === 'function') {
      try { scene.requestRender(); } catch (eR) {}
    }
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

    // 3. Checkboxes
    var chkSelf = document.getElementById('ra-shadow-self-toggle');
    if (chkSelf) chkSelf.checked = currentSettings.selfShadows;

    var chkTerrain = document.getElementById('ra-shadow-terrain-toggle');
    if (chkTerrain) chkTerrain.checked = currentSettings.terrainShadows;

    // 4. Badge en cabecera
    var badge = document.getElementById('shadow-quality-status-badge');
    if (badge && QUALITY_PRESETS[currentSettings.quality]) {
      badge.innerText = QUALITY_PRESETS[currentSettings.quality].tag + ' (' + currentSettings.radius + 'm)';
    }
  }

  function injectShadowControlsUI() {
    var container = document.getElementById('ra-floating-settings-popover');
    if (!container) return;

    if (document.getElementById('ra-shadow-settings-card')) return;

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

  // API pública
  global.ShadowSettings = {
    getSettings: function() { return Object.assign({}, currentSettings); },
    setQuality: setQuality,
    setRadius: setRadius,
    setSelfShadows: setSelfShadows,
    setTerrainShadows: setTerrainShadows,
    apply: applySettings,
    updateUI: updateUI,
    init: function() {
      injectShadowControlsUI();
      applySettings();
    }
  };

  // Inicialización segura tras carga del DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      setTimeout(global.ShadowSettings.init, 500);
    });
  } else {
    setTimeout(global.ShadowSettings.init, 500);
  }

})(typeof window !== 'undefined' ? window : this);
