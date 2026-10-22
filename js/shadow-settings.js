/**
 * shadow-settings.js
 * 
 * Módulo independiente de gestión de sombras GPU, radio de alcance y auto-sombreado.
 * Arquitectura modular y no invasiva:
 * - Se inicializa de forma segura tras DOMContentLoaded o de forma reactiva cuando viewer está listo.
 * - Mantiene el auto-sombreado activo por defecto (Cesium.ShadowMode.ENABLED) tanto para 3D Tiles como para el terreno.
 * - Inyecta y sincroniza los controles visuales en el menú de la rueda dentada (#ra-floating-settings-popover).
 * - Controla de forma estable el radio de acción de las sombras (maximumDistance) eliminando los parpadeos por cambio brusco de cascadas.
 */

(function(global) {
  'use strict';

  // Configuración predeterminada y persistencia
  const STORAGE_KEY = 'ra_shadow_settings';

  const defaultSettings = {
    quality: 'high',         // 'ultra' (4096), 'high' (2048), 'medium' (1024), 'off'
    maxDistance: 600,        // 100m a 3000m (radio de acción)
    tilesetMode: 'enabled',  // 'enabled' (Completo: proyectar + recibir), 'receive' (Solo recibir), 'off'
    biasMeters: 0.10         // 0.05m a 2.0m (despegue físico)
  };

  const shadowSettings = Object.assign({}, defaultSettings);

  try {
    if (global.localStorage) {
      const saved = global.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          Object.assign(shadowSettings, parsed);
        }
      }
    }
  } catch(e) {
    // fallback seguro a defaults
  }

  function saveSettings() {
    try {
      if (global.localStorage) {
        global.localStorage.setItem(STORAGE_KEY, JSON.stringify(shadowSettings));
      }
    } catch(e) {}
  }

  function getViewer() {
    return global.viewer || (global.RA && global.RA.viewer) || null;
  }

  function getScene() {
    const v = getViewer();
    return v ? v.scene : (global.scene || null);
  }

  /**
   * Aplica la configuración activa al shadowMap de Cesium de forma segura
   */
  function applyToShadowMap(sm) {
    if (!sm) return;
    try {
      if (shadowSettings.quality === 'off') {
        sm.enabled = false;
        return;
      }

      sm.enabled = true;
      sm.size = (shadowSettings.quality === 'ultra') ? 4096 : ((shadowSettings.quality === 'medium') ? 1024 : 2048);
      sm.numberOfCascades = (shadowSettings.quality === 'medium') ? 2 : 4;
      sm.softShadows = (shadowSettings.quality !== 'medium');
      sm.darkness = 0.50;
      sm.maximumDistance = Math.max(100.0, Math.min(3000.0, Number(shadowSettings.maxDistance) || 600.0));
      sm._fitNearFar = false;
      sm.cascadesEnabled = true;
      sm.fadingEnabled = true;

      const effBias = Math.max(0.00015, (Number(shadowSettings.biasMeters) || 0.10) / sm.maximumDistance);

      if (sm._primitiveBias) {
        sm._primitiveBias.polygonOffset = true;
        sm._primitiveBias.polygonOffsetFactor = 1.1;
        sm._primitiveBias.polygonOffsetUnits = 4.0;
        sm._primitiveBias.normalOffset = true;
        sm._primitiveBias.normalOffsetScale = 0.8;
        sm._primitiveBias.normalShading = false;
        sm._primitiveBias.depthBias = effBias;
      }
      if (sm._terrainBias) {
        sm._terrainBias.polygonOffset = true;
        sm._terrainBias.polygonOffsetFactor = 1.1;
        sm._terrainBias.polygonOffsetUnits = 4.0;
        sm._terrainBias.normalOffset = true;
        sm._terrainBias.normalOffsetScale = 0.8;
        sm._terrainBias.normalShading = false;
        sm._terrainBias.depthBias = effBias;
      }
    } catch (e) {
      if (global.RA && global.RA.log) global.RA.log.warn('[RAShadowSettings.applyToShadowMap]', e);
    }
  }

  /**
   * Aplica la configuración a las primitivas y capas de entorno
   */
  function applySettings() {
    try {
      const scene = getScene();
      const sm = scene ? scene.shadowMap : null;
      if (sm) applyToShadowMap(sm);

      const Cesium = global.Cesium;
      if (!Cesium || !Cesium.ShadowMode) return;

      let targetMode = Cesium.ShadowMode.ENABLED;
      if (shadowSettings.quality === 'off' || shadowSettings.tilesetMode === 'off') {
        targetMode = Cesium.ShadowMode.DISABLED;
      } else if (shadowSettings.tilesetMode === 'receive') {
        targetMode = Cesium.ShadowMode.RECEIVE_ONLY;
      } else {
        targetMode = Cesium.ShadowMode.ENABLED;
      }

      const tileset = global.google3DTileset;
      if (tileset) {
        tileset.shadows = targetMode;
      }
      const osm = global.cesiumOsmBuildings;
      if (osm) {
        osm.shadows = targetMode;
      }
      if (scene && scene.globe) {
        scene.globe.shadows = targetMode;
      }
      const v = getViewer();
      if (v) {
        v.terrainShadows = targetMode;
      }

      syncUI();

      if (scene && typeof scene.requestRender === 'function') {
        scene.requestRender();
      }
    } catch(e) {
      if (global.RA && global.RA.log) global.RA.log.warn('[RAShadowSettings.applySettings]', e);
    }
  }

  /**
   * Sincroniza los controles del menú emergente
   */
  function syncUI() {
    try {
      // 1. Selector de calidad
      ['ultra', 'high', 'medium', 'off'].forEach(function(q) {
        const btn = document.getElementById('btn-shadow-' + q);
        if (btn) btn.classList.toggle('active', q === shadowSettings.quality);
      });
      const qBadge = document.getElementById('shadow-quality-badge');
      if (qBadge) {
        if (shadowSettings.quality === 'ultra') { qBadge.textContent = 'ULTRA (4K)'; qBadge.style.background = 'var(--amber-500)'; qBadge.style.color = '#000'; }
        else if (shadowSettings.quality === 'high') { qBadge.textContent = 'ALTA (2K)'; qBadge.style.background = 'var(--emerald-500)'; qBadge.style.color = '#000'; }
        else if (shadowSettings.quality === 'medium') { qBadge.textContent = 'MEDIA (1K)'; qBadge.style.background = 'var(--sky-500)'; qBadge.style.color = '#fff'; }
        else if (shadowSettings.quality === 'off') { qBadge.textContent = 'DESACTIVADA'; qBadge.style.background = 'rgba(255,255,255,0.1)'; qBadge.style.color = '#fff'; }
      }

      // 2. Deslizador de radio de acción
      const dSlider = document.getElementById('shadow-distance-slider');
      const dDisplay = document.getElementById('shadow-distance-display');
      if (dSlider) dSlider.value = shadowSettings.maxDistance;
      if (dDisplay) dDisplay.textContent = Math.round(shadowSettings.maxDistance) + ' m';

      // 3. Selector de auto-sombra en entorno
      ['enabled', 'receive', 'off'].forEach(function(m) {
        const btn = document.getElementById('btn-tiles-shadow-' + m);
        if (btn) btn.classList.toggle('active', m === shadowSettings.tilesetMode);
      });
      const tBadge = document.getElementById('tileset-shadow-badge');
      if (tBadge) {
        if (shadowSettings.tilesetMode === 'enabled') { tBadge.textContent = 'COMPLETO'; tBadge.style.color = '#34D399'; tBadge.style.background = 'rgba(16,185,129,0.2)'; }
        else if (shadowSettings.tilesetMode === 'receive') { tBadge.textContent = 'SOLO RECIBIR'; tBadge.style.color = '#38BDF8'; tBadge.style.background = 'rgba(56,189,248,0.2)'; }
        else if (shadowSettings.tilesetMode === 'off') { tBadge.textContent = 'DESACTIVADO'; tBadge.style.color = '#94A3B8'; tBadge.style.background = 'rgba(255,255,255,0.1)'; }
      }

      // 4. Deslizador de despegue físico (bias)
      const bSlider = document.getElementById('shadow-bias-slider');
      const bDisplay = document.getElementById('bias-val-display');
      if (bSlider) bSlider.value = shadowSettings.biasMeters;
      if (bDisplay) bDisplay.textContent = Number(shadowSettings.biasMeters).toFixed(2) + ' m';
    } catch(e) {}
  }

  // Métodos de control expuestos
  function setQuality(q) {
    shadowSettings.quality = q;
    saveSettings();
    applySettings();
    const names = { ultra: 'Ultra (4K)', high: 'Alta (2K)', medium: 'Media (1K)', off: 'Desactivada' };
    if (typeof global.showToast === 'function') {
      global.showToast('CALIDAD DE SOMBRAS', 'Perfil configurado: ' + (names[q] || q), 'info', 2000);
    }
  }

  function setDistance(d) {
    const m = Math.max(100, Math.min(3000, Number(d) || 600));
    shadowSettings.maxDistance = m;
    const dDisplay = document.getElementById('shadow-distance-display');
    if (dDisplay) dDisplay.textContent = Math.round(m) + ' m';
    saveSettings();
    applySettings();
  }

  function setTilesetMode(mode) {
    shadowSettings.tilesetMode = mode;
    saveSettings();
    applySettings();
    const names = {
      enabled: 'Auto-sombra completa (Proyectar y Recibir)',
      receive: 'Solo recibir sombra de placas y obstáculos',
      off: 'Desactivado en terreno y edificios'
    };
    if (typeof global.showToast === 'function') {
      global.showToast('SOMBRAS DE ENTORNO', names[mode] || mode, 'info', 2500);
    }
  }

  function setBias(b) {
    const val = Math.max(0.05, Math.min(2.0, Number(b) || 0.10));
    shadowSettings.biasMeters = val;
    global.wpShadowBiasMeters = val;
    const bDisplay = document.getElementById('bias-val-display');
    if (bDisplay) bDisplay.textContent = val.toFixed(2) + ' m';
    saveSettings();
    applySettings();
  }

  /**
   * Inyecta la tarjeta en el popover si no está ya presente
   */
  function injectUI() {
    try {
      const popover = document.getElementById('ra-floating-settings-popover');
      if (!popover) return;
      if (document.getElementById('ra-shadow-settings-card')) {
        syncUI();
        return;
      }

      const card = document.createElement('div');
      card.className = 'ui-card';
      card.id = 'ra-shadow-settings-card';
      card.innerHTML = `
        <div class="ui-card-head">
          <span>Sombras GPU &amp; Terreno 3D</span>
          <span class="card-tag" id="shadow-quality-badge" style="background:var(--emerald-500);color:#000;font-weight:900;">ALTA (2K)</span>
        </div>
        <div class="engine-cards-group" style="padding:12px; display:flex; flex-direction:column; gap:12px;">
          <!-- Selector de Calidad de Sombras -->
          <div style="display:flex; flex-direction:column; gap:6px;">
            <span style="font-size:11px; font-weight:600; color:#e2e8f0;">Calidad de Sombras GPU</span>
            <div class="engine-cards-group" id="shadow-quality-group" style="display:grid; grid-template-columns:1fr 1fr; gap:6px;">
              <div class="engine-card-opt" id="btn-shadow-ultra" onclick="raSetShadowQuality('ultra')">
                <div class="engine-card-title">
                  <span>1. Ultra (4K)</span>
                </div>
                <div class="engine-card-desc">4096px · 4 cascadas · Suaves</div>
              </div>
              <div class="engine-card-opt active" id="btn-shadow-high" onclick="raSetShadowQuality('high')">
                <div class="engine-card-title">
                  <span>2. Alta (2K)</span>
                </div>
                <div class="engine-card-desc">2048px · Nítida · Recomendada</div>
              </div>
              <div class="engine-card-opt" id="btn-shadow-medium" onclick="raSetShadowQuality('medium')">
                <div class="engine-card-title">
                  <span>3. Media (1K)</span>
                </div>
                <div class="engine-card-desc">1024px · Fluida</div>
              </div>
              <div class="engine-card-opt" id="btn-shadow-off" onclick="raSetShadowQuality('off')">
                <div class="engine-card-title">
                  <span>4. Desactivada</span>
                </div>
                <div class="engine-card-desc">Sin sombras GPU</div>
              </div>
            </div>
          </div>

          <div style="height:1px; background:rgba(255,255,255,0.05); margin:2px 0;"></div>

          <!-- Deslizador de Radio de Acción de Sombras -->
          <div style="display:flex; flex-direction:column; gap:6px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:11px; font-weight:600; color:#e2e8f0;">Radio de Acción de Sombras</span>
              <span id="shadow-distance-display" style="font-size:11px; font-weight:700; color:var(--amber-400);">600 m</span>
            </div>
            <input type="range" id="shadow-distance-slider" min="100" max="3000" step="50" value="600" style="width:100%; accent-color:var(--amber-400);" oninput="raSetShadowDistance(this.value)">
            <span style="font-size: 10px; color:#64748b; line-height:1.2;">Distancia máxima desde la cámara donde se proyectan sombras. Un radio ajustado mejora la nitidez sobre la instalación.</span>
          </div>

          <div style="height:1px; background:rgba(255,255,255,0.05); margin:2px 0;"></div>

          <!-- Auto-sombreado de Edificios 3D y Terreno -->
          <div style="display:flex; flex-direction:column; gap:6px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:11px; font-weight:600; color:#e2e8f0;">Auto-sombra de Edificios 3D y Terreno</span>
              <span id="tileset-shadow-badge" class="card-tag" style="background:rgba(16,185,129,0.2);color:#34D399;font-size:9px;font-weight:800;padding:2px 4px;border-radius:3px;">COMPLETO</span>
            </div>
            <div class="engine-cards-group" id="tileset-shadow-group" style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:4px;">
              <div class="engine-card-opt active" id="btn-tiles-shadow-enabled" onclick="raSetTilesetShadowMode('enabled')" style="padding:6px; text-align:center;">
                <div style="font-size:10px; font-weight:700;">Completo</div>
                <div style="font-size:8px; color:#94a3b8;">Proyectar + Recibir</div>
              </div>
              <div class="engine-card-opt" id="btn-tiles-shadow-receive" onclick="raSetTilesetShadowMode('receive')" style="padding:6px; text-align:center;">
                <div style="font-size:10px; font-weight:700;">Solo Recibir</div>
                <div style="font-size:8px; color:#94a3b8;">Sin auto-sombra</div>
              </div>
              <div class="engine-card-opt" id="btn-tiles-shadow-off" onclick="raSetTilesetShadowMode('off')" style="padding:6px; text-align:center;">
                <div style="font-size:10px; font-weight:700;">Desactivado</div>
                <div style="font-size:8px; color:#94a3b8;">Sin sombras entorno</div>
              </div>
            </div>
            <span style="font-size: 10px; color:#64748b; line-height:1.2;">"Completo" proyecta sombras del terreno sobre el terreno y elementos. "Solo Recibir" elimina parpadeos fotogramétricos si fuera necesario.</span>
          </div>

          <div style="height:1px; background:rgba(255,255,255,0.05); margin:2px 0;"></div>

          <!-- Despegue de Sombras (Anti-Parpadeo / Bias) -->
          <div style="display:flex; flex-direction:column; gap:6px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:11px; font-weight:600; color:#e2e8f0;">Despegue Físico (Anti-Parpadeo)</span>
              <span id="bias-val-display" style="font-size:11px; color:#94a3b8;">0.10 m</span>
            </div>
            <input type="range" id="shadow-bias-slider" min="0.05" max="2.0" step="0.05" value="0.10" style="width:100%; accent-color:var(--rose-500);" oninput="raSetShadowBias(this.value)">
            <span style="font-size: 10px; color:#64748b; line-height:1.2;">Ajusta el margen físico para evitar parpadeos y acné en mallas 3D rugosas.</span>
          </div>
        </div>
      `;

      // Insertar antes de la tarjeta de Ray-Tracing o al final
      const cards = popover.querySelectorAll('.ui-card');
      if (cards.length >= 3) {
        popover.insertBefore(card, cards[2]);
      } else {
        popover.appendChild(card);
      }

      // Si existía un slider de bias duplicado en la tarjeta de raytracing, ocultarlo para evitar confusión
      const allBiasSliders = popover.querySelectorAll('#shadow-bias-slider');
      if (allBiasSliders.length > 1) {
        const parentCol = allBiasSliders[1].closest('div[style*="flex-direction:column"]');
        if (parentCol) parentCol.style.display = 'none';
      }

      syncUI();
    } catch(e) {}
  }

  /**
   * Inicialización segura del módulo
   */
  function init() {
    injectUI();

    // Hook seguro a wpConfigureShadowMap
    const originalConfigure = global.wpConfigureShadowMap;
    global.wpConfigureShadowMap = function(sm) {
      if (typeof originalConfigure === 'function') {
        try { originalConfigure(sm); } catch(e) {}
      }
      applyToShadowMap(sm);
    };

    // Aplicar a shadowMap existente si ya está disponible
    const scene = getScene();
    if (scene && scene.shadowMap) {
      applyToShadowMap(scene.shadowMap);
    }

    // Monitorizar preUpdate de forma no invasiva para mantener la distancia elegida estable
    if (scene && scene.preUpdate) {
      scene.preUpdate.addEventListener(function() {
        if (!scene.shadowMap || !scene.shadowMap.enabled) return;
        const targetDist = Number(shadowSettings.maxDistance) || 600.0;
        if (Math.abs((scene.shadowMap.maximumDistance || 0) - targetDist) > 1.0) {
          scene.shadowMap.maximumDistance = targetDist;
        }
      });
    }

    syncUI();
  }

  // Exposición en el namespace global
  global.raShadowSettings = shadowSettings;
  global.raSetShadowQuality = setQuality;
  global.raSetShadowDistance = setDistance;
  global.raSetTilesetShadowMode = setTilesetMode;
  global.raSetShadowBias = setBias;
  global.wpSetShadowBiasMeters = setBias;
  global.raSyncShadowUI = syncUI;

  global.RAShadowSettings = {
    settings: shadowSettings,
    init: init,
    injectUI: injectUI,
    applySettings: applySettings,
    setQuality: setQuality,
    setDistance: setDistance,
    setTilesetMode: setTilesetMode,
    setBias: setBias,
    syncUI: syncUI
  };

  // Inicializar en DOMContentLoaded o inmediatamente si el DOM ya está listo
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      setTimeout(init, 50);
    }
  }

})(typeof window !== 'undefined' ? window : this);
