/**
 * ============================================================================
 * 🌍 GESTOR DE VISOR 3D, MOTORES DE FOTOGRAMETRÍA Y NAVEGACIÓN — PROYECTO RA
 * ============================================================================
 * Conectores de capas geoespaciales (Google Photorealistic 3D Tiles, Cesium OSM,
 * ArcGIS World Imagery), control de cámara, rosa de los vientos y HUD 2D/3D.
 */
(function(global) {
  'use strict';

  // ── ESTADO DEL MOTOR 3D Y VARIABLES COMPARTIDAS ────────────────────────────
  var _initTriadDone = false;
  var _initTriadRemove = null;

async function switchEngine(engine) {
  currentEngine = engine;
  showStatus(`ACTIVANDO: ${engine.toUpperCase()} 3D...`);

  document.querySelectorAll('.engine-opt').forEach(el => el.classList.remove('active'));
  const activeOpt = document.getElementById(`opt-engine-${engine}`);
  if (activeOpt) activeOpt.classList.add('active');

  const badge = document.getElementById('active-engine-badge');
  if (typeof updateDockEngineUI === 'function') {
    updateDockEngineUI(engine);
  }

  try {
    if (engine === 'google') {
      if (badge) badge.textContent = 'GOOGLE 3D';
      await loadGoogle3D();
    } else if (engine === 'cesium') {
      if (badge) badge.textContent = 'CESIUM 3D';
      await loadCesium3D();
    } else if (engine === 'arcgis') {
      if (badge) badge.textContent = 'ARCGIS 3D';
      await loadArcGIS3D();
    }
    showStatus(`MOTOR ACTIVO: ${engine.toUpperCase()} 3D`, 2500);
  } catch (err) {
    window.RA && window.RA.log && window.RA.log.debug('[RA] Error cambiando de motor:', err);
  } finally {
    hideLoading();
  }
}

function attachTilesetLoadMonitor(tileset, name) {
  if (!tileset) return;
  show3DTilesLoading('Descargando ' + name + '...', 1);

  if (tileset.tileLoadProgressEvent) {
    tileset.tileLoadProgressEvent.addEventListener(pending => {
      if (pending > 0) {
        show3DTilesLoading('Cargando geometría 3D (' + name + ')...', pending);
      } else {
        hide3DTilesLoading(700);
      }
    });
  }

  if (tileset.initialTilesLoaded) {
    tileset.initialTilesLoaded.addEventListener(() => {
      setLoad(100, name + ' Geometría 3D Lista');
      hideLoading();
      hide3DTilesLoading(500);
      showStatus('✓ ' + name.toUpperCase() + ' 3D CARGADO CON ÉXITO', 2200);
    });
  }
  if (tileset.tileLoad) {
    tileset.tileLoad.addEventListener(() => {
      if (typeof scene !== 'undefined' && scene && typeof scene.requestRender === 'function') {
        scene.requestRender();
      }
    });
  }
}

async function loadGoogle3D() {
  if (cesiumOsmBuildings) cesiumOsmBuildings.show = false;
  show3DTilesLoading('Conectando con Google Photorealistic 3D...', 0);

  if (!google3DTileset) {
    try {
      google3DTileset = await Cesium.Cesium3DTileset.fromIonAssetId(2275207, {
        maximumScreenSpaceError: 16,
        maximumMemoryUsage: 2048,
        preloadWhenStationary: true,
        preloadAncestors: true,
        skipLevelOfDetail: false, // [FIX HUECOS SOMBRA] No saltar LOD: mantiene geometría continua
        loadSiblings: true,       // [FIX HUECOS SOMBRA] Cargar tiles hermanos para que proyecten sombra fuera de cámara
        cullWithChildrenBounds: false, // [FIX HUECOS SOMBRA] Evitar culling prematuro de edificios adyacentes
        dynamicScreenSpaceError: false // [FIX HUECOS SOMBRA] Evitar degradación agresiva en bordes de pantalla
      });
      google3DTileset.shadows = (typeof Cesium !== 'undefined' && Cesium.ShadowMode) ? Cesium.ShadowMode.ENABLED : undefined;
      google3DTileset.cullWithChildrenBounds = false;
      google3DTileset.skipLevelOfDetail = false;
      google3DTileset.loadSiblings = true;
      google3DTileset.dynamicScreenSpaceError = false;
      window.google3DTileset = google3DTileset;
      attachTilesetLoadMonitor(google3DTileset, 'Google 3D');
      scene.primitives.add(google3DTileset);
      globe.show = false;
      return;
    } catch(e1) { window.RA && window.RA.log && window.RA.log.warn('[catch silenciado]', e1); }

    try {
      google3DTileset = await Cesium.createGooglePhotorealistic3DTileset({
        key: GOOGLE_MAPS_API_KEY,
        maximumScreenSpaceError: 16, // Alta fidelidad geométrica
        maximumMemoryUsage: 2048,    // 2GB de caché para retener mallas de edificios circundantes
        preloadWhenStationary: true,
        preloadAncestors: true,
        skipLevelOfDetail: false,    // [FIX HUECOS SOMBRA] No saltar LOD: erradica agujeros en mallas
        immediatelyLoadDesiredLevelOfDetail: false,
        loadSiblings: true,          // [FIX HUECOS SOMBRA] Cargar tiles hermanos para proyectar sombras
        cullWithChildrenBounds: false, // [FIX HUECOS SOMBRA] No descartar tiles de edificios cercanos
        dynamicScreenSpaceError: false // [FIX HUECOS SOMBRA] Detalle uniforme sin degradación perimetral
      });
      google3DTileset.shadows = (typeof Cesium !== 'undefined' && Cesium.ShadowMode) ? Cesium.ShadowMode.ENABLED : undefined;
      google3DTileset.cullWithChildrenBounds = false;
      google3DTileset.skipLevelOfDetail = false;
      google3DTileset.loadSiblings = true;
      google3DTileset.dynamicScreenSpaceError = false;
      window.google3DTileset = google3DTileset;
      attachTilesetLoadMonitor(google3DTileset, 'Google 3D');
      scene.primitives.add(google3DTileset);
      globe.show = false;
      return;
    } catch (e2) {
      await loadCesium3D();
      const b = document.getElementById('active-engine-badge');
      if (b) b.textContent = 'CESIUM 3D';
    }
  } else {
    google3DTileset.show = true;
    google3DTileset.cullWithChildrenBounds = false;
    google3DTileset.skipLevelOfDetail = false;
    google3DTileset.loadSiblings = true;
    google3DTileset.dynamicScreenSpaceError = false;
    globe.show = false;
    show3DTilesLoading('Renderizando Google 3D...', 0);
    hide3DTilesLoading(800);
  }
}

async function loadCesium3D() {
  if (google3DTileset) google3DTileset.show = false;
  globe.show = true;
  show3DTilesLoading('Cargando Cesium OSM Buildings...', 0);

  try {
    if (!cesiumTerrainProvider) {
      cesiumTerrainProvider = await Cesium.CesiumTerrainProvider.fromIonAssetId(1, {
        requestWaterMask: true,
        requestVertexNormals: true
      });
    }
    viewer.terrainProvider = cesiumTerrainProvider;
  } catch(e) { window.RA && window.RA.log && window.RA.log.warn('[catch silenciado]', e); }

  try {
    const bingImg = await Cesium.IonImageryProvider.fromAssetId(2);
    viewer.imageryLayers.removeAll();
    viewer.imageryLayers.addImageryProvider(bingImg);
  } catch (e) {
    try {
      const ag = await Cesium.ArcGisMapServerImageryProvider.fromUrl('https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer');
      viewer.imageryLayers.removeAll();
      viewer.imageryLayers.addImageryProvider(ag);
    } catch(e2) { window.RA && window.RA.log && window.RA.log.warn('[catch silenciado]', e2); }
  }

  if (!cesiumOsmBuildings) {
    try {
      cesiumOsmBuildings = await Cesium.createOsmBuildingsAsync();
      attachTilesetLoadMonitor(cesiumOsmBuildings, 'Cesium Buildings');
      scene.primitives.add(cesiumOsmBuildings);
      cesiumOsmBuildings.style = new Cesium.Cesium3DTileStyle({
        color: "color('#F5ECD7', 1.0)"
      });
    } catch(e) { window.RA && window.RA.log && window.RA.log.warn('[catch silenciado]', e); }
  } else {
    cesiumOsmBuildings.show = true;
    hide3DTilesLoading(800);
  }
}

async function loadArcGIS3D() {
  if (google3DTileset) google3DTileset.show = false;
  if (cesiumOsmBuildings) cesiumOsmBuildings.show = false;
  globe.show = true;
  show3DTilesLoading('Cargando Ortofoto ArcGIS 3D...', 0);

  if (cesiumTerrainProvider) viewer.terrainProvider = cesiumTerrainProvider;

  try {
    const ag = await Cesium.ArcGisMapServerImageryProvider.fromUrl(
      'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer'
    );
    viewer.imageryLayers.removeAll();
    viewer.imageryLayers.addImageryProvider(ag);
  } catch(e) { window.RA && window.RA.log && window.RA.log.warn('[catch silenciado]', e); }
  hide3DTilesLoading(1000);
}

function getSearchHistory() {
  try {
    return JSON.parse(localStorage.getItem('ra_search_history')) || [];
  } catch (e) {
    return [];
  }
}

function saveToHistory(place) {
  if (!place || !place.display_name) return;
  let history = getSearchHistory();
  history = history.filter(p => p.display_name !== place.display_name);
  history.unshift(place);
  if (history.length > 5) history = history.slice(0, 5);
  try {
    localStorage.setItem('ra_search_history', JSON.stringify(history));
  } catch (e) {}
}

function showHistory() {
  const resultsEl = document.getElementById('ra-results');
  if (!resultsEl) return;
  const history = getSearchHistory();
  if (history.length === 0) return;

  resultsEl.innerHTML = '<div style="padding: 4px 10px; font-size: 10px; color: #94a3b8; font-weight: bold; border-bottom: 1px solid rgba(255,255,255,0.05);"><i data-lucide="history" class="icon-sm"></i> BÚSQUEDAS RECIENTES</div>';

  history.forEach(p => {
    const d = document.createElement('div');
    d.className = 'result-item';
    d.innerHTML = `<span style="color:#64748b; margin-right:6px;">🕒</span>${p.display_name}`;
    d.addEventListener('click', () => flyToPlace(p, false));
    resultsEl.appendChild(d);
  });

  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }

  resultsEl.classList.add('open');
}

async function doSearch() {
  const searchInput = document.getElementById('ra-search-input');
  const resultsEl = document.getElementById('ra-results');
  if (!searchInput || !resultsEl) return;
  const q = searchInput.value.trim();
  if (!q) return;

  if (typeof showStatus === 'function') showStatus('BUSCANDO...');
  resultsEl.innerHTML = '';
  resultsEl.classList.remove('open');

  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5`, {
      headers: { 'Accept-Language': 'es' }
    });
    const data = await res.json();

    if (!data.length) {
      if (typeof showStatus === 'function') showStatus('NO ENCONTRADO', 2500);
      return;
    }

    if (typeof hideStatus === 'function') hideStatus();

    data.forEach(p => {
      const d = document.createElement('div');
      d.className = 'result-item';
      d.textContent = p.display_name;
      d.addEventListener('click', () => flyToPlace(p, true));
      resultsEl.appendChild(d);
    });

    resultsEl.classList.add('open');
    if (data.length === 1) flyToPlace(data[0], true);
  } catch (e) {
    if (typeof showStatus === 'function') showStatus('ERROR DE CONEXIÓN', 2500);
  }
}

function flyToPlace(p, save = true) {
  if (!p) return;
  const searchInput = document.getElementById('ra-search-input');
  const resultsEl = document.getElementById('ra-results');
  if (save) saveToHistory(p);
  if (resultsEl) resultsEl.classList.remove('open');
  if (searchInput && p.display_name) {
    searchInput.value = p.display_name.split(',')[0];
  }

  const curCam = (typeof camera !== 'undefined' && camera) ? camera : (window.viewer ? window.viewer.camera : null);
  if (!curCam || typeof Cesium === 'undefined') return;

  const lon = parseFloat(p.lon);
  const lat = parseFloat(p.lat);
  const h = (curCam.positionCartographic && curCam.positionCartographic.height) ? curCam.positionCartographic.height : 2500;

  curCam.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(lon, lat, Math.max(h * 0.25, 800)),
    duration: 2.8,
    easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
    orientation: { heading: 0, pitch: Cesium.Math.toRadians(-35), roll: 0 }
  });
}

function executeSearch() {
  doSearch();
}

function resetNorth() {
  const h = camera.positionCartographic.height;
  const cart = camera.positionCartographic;
  camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(
      Cesium.Math.toDegrees(cart.longitude),
      Cesium.Math.toDegrees(cart.latitude),
      h
    ),
    orientation: { heading: 0, pitch: camera.pitch, roll: 0 },
    duration: 1.5,
    easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT
  });
  showStatus('ORIENTADO AL NORTE (HEADING 0°)', 2000);
}

function updateWindRose() {
  const svg = document.getElementById('ra-rosa-svg');
  if (!svg) return;
  // La rosa gira en sentido opuesto al heading de la cámara para que la N
  // siempre apunte al norte real en pantalla.
  const deg = -Cesium.Math.toDegrees(camera.heading) % 360;
  svg.style.transform = 'rotate(' + deg + 'deg)';
  const rumboEl = document.getElementById('ra-rosa-rumbo');
  if (rumboEl) {
    const h = ((Cesium.Math.toDegrees(camera.heading) % 360) + 360) % 360;
    rumboEl.textContent = 'RUMBO ' + Math.round(h) + '°';
  }
}

function toggle2D3D() {
  const h = camera.positionCartographic.height;
  const cart = camera.positionCartographic;
  isPitchCenital = !isPitchCenital;
  const targetPitch = isPitchCenital ? Cesium.Math.toRadians(-89.9) : Cesium.Math.toRadians(-35);

  camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(
      Cesium.Math.toDegrees(cart.longitude),
      Cesium.Math.toDegrees(cart.latitude),
      h
    ),
    orientation: { heading: camera.heading, pitch: targetPitch, roll: 0 },
    duration: 1.5,
    easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT
  });

  const lbl = document.getElementById('label-2d3d');
  if (lbl) lbl.textContent = isPitchCenital ? 'VISTA CENITAL (2D)' : 'VISTA PERSPECTIVA (3D)';
  const dockLbl = document.getElementById('dock-label-2d3d');
  if (dockLbl) dockLbl.textContent = isPitchCenital ? '2D Cenital' : '3D Persp';
  showStatus(isPitchCenital ? 'VISTA CENITAL 2D ACTIVA' : 'VISTA PERSPECTIVA 3D ACTIVA', 2000);
}

function _initTriadOnce() {
    if (_initTriadDone) return;
    _initTriadDone = true;
    try { ensureTriadCanvas(); } catch(e) { window.RA && window.RA.log && window.RA.log.warn('[catch silenciado]', e); }
    try { initTriad3DEntities(); } catch(e) { window.RA && window.RA.log && window.RA.log.warn('[catch silenciado]', e); }
    if (_initTriadRemove) { _initTriadRemove(); _initTriadRemove = null; }
  }

  // ── EXPORTACIÓN AL NAMESPACE GLOBAL Y WINDOW.RA ─────────────────────────────
  global.RA = global.RA || {};

  global.switchEngine = switchEngine;
  global.attachTilesetLoadMonitor = attachTilesetLoadMonitor;
  global.loadGoogle3D = loadGoogle3D;
  global.loadCesium3D = loadCesium3D;
  global.loadArcGIS3D = loadArcGIS3D;
  global.executeSearch = executeSearch;
  global.doSearch = doSearch;
  global.flyToPlace = flyToPlace;
  global.getSearchHistory = getSearchHistory;
  global.saveToHistory = saveToHistory;
  global.showHistory = showHistory;
  global.resetNorth = resetNorth;
  global.updateWindRose = updateWindRose;
  global.toggle2D3D = toggle2D3D;
  global._initTriadOnce = _initTriadOnce;

})(typeof window !== 'undefined' ? window : globalThis);
