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
  var isPitchCenital = false;

async function switchEngine(engine) {
  currentEngine = engine;
  _tilesMonitorState.retryCount = 0;
  _tilesMonitorState.burstFailed = 0;
  _tilesMonitorState.burstLoaded = 0;
  global.__raTilesDismissed = false;
  if (_tilesMonitorState.recoveryTimer) {
    clearTimeout(_tilesMonitorState.recoveryTimer);
    _tilesMonitorState.recoveryTimer = null;
  }
  _clearTileWatchdogs();
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

// ── CONTROLADOR DE RESILIENCIA 3D TILES (THROTTLING QUIC + REINTENTO + TELEMETRÍA UI) ──
const _tilesMonitorState = {
  activeName: 'Google 3D',
  burstLoaded: 0,
  burstFailed: 0,
  lastErrorMsg: '',
  retryCount: 0,
  maxAutoRetries: 2,
  isRecovering: false,
  recoveryTimer: null,
  stallTimer: null,
  lastToastTs: 0,
  cameraBound: false
};

function _configureTileRequestScheduler(maxGoogleStreams) {
  if (typeof Cesium === 'undefined' || !Cesium.RequestScheduler) return;
  try {
    Cesium.RequestScheduler.throttleRequests = true;
    const cap = Math.min(Number(Cesium.RequestScheduler.maximumRequestsPerServer) || 6, 6);
    Cesium.RequestScheduler.maximumRequestsPerServer = cap;
    Cesium.RequestScheduler.requestsByServer = Cesium.RequestScheduler.requestsByServer || {};
    Cesium.RequestScheduler.requestsByServer['tile.googleapis.com:443'] = maxGoogleStreams || 4;
  } catch (e) {
    if (window.RA && window.RA.log) window.RA.log.debug('[RA Tiles] RequestScheduler config warn:', e);
  }
}

function _bindCameraTileResetOnce() {
  if (_tilesMonitorState.cameraBound) return;
  const v = (typeof viewer !== 'undefined' && viewer) ? viewer : window.viewer;
  if (!v || !v.camera || !v.camera.moveEnd) return;
  _tilesMonitorState.cameraBound = true;
  let _lastCamPos = null;
  v.camera.moveEnd.addEventListener(() => {
    try {
      const curPos = v.camera.positionWC ? v.camera.positionWC.clone() : null;
      const movedMeters = (curPos && _lastCamPos) ? Cesium.Cartesian3.distance(curPos, _lastCamPos) : Infinity;
      _lastCamPos = curPos;
      // Si el usuario navegó significativamente (>15m), reiniciar presupuesto de reintentos para la nueva zona
      if (movedMeters > 15 && !_tilesMonitorState.isRecovering) {
        _tilesMonitorState.retryCount = 0;
        _tilesMonitorState.burstFailed = 0;
        _tilesMonitorState.burstLoaded = 0;
        global.__raTilesDismissed = false;
        if (_tilesMonitorState.recoveryTimer) {
          clearTimeout(_tilesMonitorState.recoveryTimer);
          _tilesMonitorState.recoveryTimer = null;
        }
      }
    } catch (_eCam) {}
  });
}

function _clearTileWatchdogs() {
  if (_tilesMonitorState.stallTimer) {
    clearTimeout(_tilesMonitorState.stallTimer);
    _tilesMonitorState.stallTimer = null;
  }
}

function _surfacePersistentTilesError(name, failCount, reasonMsg) {
  if (global.__raTilesDismissed) return;
  const errFn = (typeof show3DTilesError === 'function') ? show3DTilesError : global.show3DTilesError;
  const shortReason = (reasonMsg && /quic|network|failed|timeout|abort/i.test(reasonMsg))
    ? 'Corte de red / HTTP3 cargando detalle 3D'
    : 'Error cargando geometría 3D';
  if (typeof errFn === 'function') {
    errFn(shortReason + ' (' + name + ')', {
      failCount: failCount,
      showActions: true,
      canSwitchCesium: (typeof currentEngine === 'undefined' || currentEngine !== 'cesium'),
      isRetrying: false
    });
  }
  const now = Date.now();
  if (typeof showToast === 'function' && (now - _tilesMonitorState.lastToastTs) > 60000) {
    _tilesMonitorState.lastToastTs = now;
    showToast(
      'TESELAS 3D INCOMPLETAS',
      'Fallo de conexión descargando detalle 3D (' + failCount + ' teselas). Puedes reintentar o cambiar temporalmente al motor Cesium 3D.',
      'warning',
      6500
    );
  }
}

function _scheduleTilesetRecovery(name, delayMs) {
  if (_tilesMonitorState.isRecovering) return;
  if (_tilesMonitorState.retryCount >= _tilesMonitorState.maxAutoRetries) {
    _surfacePersistentTilesError(name, _tilesMonitorState.burstFailed, _tilesMonitorState.lastErrorMsg);
    return;
  }
  if (_tilesMonitorState.recoveryTimer) clearTimeout(_tilesMonitorState.recoveryTimer);
  _tilesMonitorState.recoveryTimer = setTimeout(() => {
    _tilesMonitorState.recoveryTimer = null;
    recoverActiveTileset(false);
  }, delayMs || 1800);
}

async function recoverActiveTileset(isManual) {
  if (_tilesMonitorState.isRecovering) return;
  const eng = (typeof currentEngine !== 'undefined' && currentEngine) ? currentEngine : 'google';
  const name = _tilesMonitorState.activeName || (eng === 'cesium' ? 'Cesium Buildings' : 'Google 3D');

  if (isManual) {
    _tilesMonitorState.retryCount = 0;
    global.__raTilesDismissed = false;
  } else if (_tilesMonitorState.retryCount >= _tilesMonitorState.maxAutoRetries) {
    _surfacePersistentTilesError(name, _tilesMonitorState.burstFailed, _tilesMonitorState.lastErrorMsg);
    return;
  }

  _tilesMonitorState.isRecovering = true;
  if (!isManual) _tilesMonitorState.retryCount++;
  _tilesMonitorState.burstFailed = 0;
  _tilesMonitorState.burstLoaded = 0;
  _clearTileWatchdogs();

  const errFn = (typeof show3DTilesError === 'function') ? show3DTilesError : global.show3DTilesError;
  if (typeof errFn === 'function') {
    errFn(
      isManual
        ? ('Reintentando carga completa de ' + name + '...')
        : ('Reintento automático ' + _tilesMonitorState.retryCount + '/' + _tilesMonitorState.maxAutoRetries + ' (' + name + ')...'),
      { isRetrying: true, showActions: false, badgeText: 'Reconectando' }
    );
  }

  try {
    const activeScene = (typeof scene !== 'undefined' && scene) ? scene : (window.viewer && window.viewer.scene);
    if (eng === 'google') {
      _configureTileRequestScheduler(2); // Baja concurrencia QUIC para evitar reset UDP/HTTP3
      if (typeof google3DTileset !== 'undefined' && google3DTileset) {
        try {
          if (activeScene && activeScene.primitives) activeScene.primitives.remove(google3DTileset);
          if (typeof google3DTileset.isDestroyed === 'function' && !google3DTileset.isDestroyed()) {
            google3DTileset.destroy();
          }
        } catch (_eRm) {}
        google3DTileset = null;
        window.google3DTileset = null;
      }
      await loadGoogle3D({ recoveryMode: true });
    } else if (eng === 'cesium') {
      if (typeof cesiumOsmBuildings !== 'undefined' && cesiumOsmBuildings) {
        try {
          if (activeScene && activeScene.primitives) activeScene.primitives.remove(cesiumOsmBuildings);
          if (typeof cesiumOsmBuildings.isDestroyed === 'function' && !cesiumOsmBuildings.isDestroyed()) {
            cesiumOsmBuildings.destroy();
          }
        } catch (_eRmC) {}
        cesiumOsmBuildings = null;
        window.cesiumOsmBuildings = null;
      }
      await loadCesium3D();
    } else {
      await switchEngine(eng);
    }
    if (activeScene && typeof activeScene.requestRender === 'function') {
      activeScene.requestRender();
    }
  } catch (eRec) {
    console.warn('[RA 3D Tiles] Error durante recuperación de tileset:', eRec);
    _surfacePersistentTilesError(name, Math.max(1, _tilesMonitorState.burstFailed), (eRec && eRec.message) || '');
  } finally {
    _tilesMonitorState.isRecovering = false;
  }
}

function retry3DTilesLoad() {
  return recoverActiveTileset(true);
}

function attachTilesetLoadMonitor(tileset, name) {
  if (!tileset || tileset.__raMonitorAttached) return;
  tileset.__raMonitorAttached = true;
  _tilesMonitorState.activeName = name || '3D Tiles';
  _bindCameraTileResetOnce();

  show3DTilesLoading('Descargando ' + name + '...', 1, { forceClearError: true });

  if (tileset.tileLoadProgressEvent) {
    tileset.tileLoadProgressEvent.addEventListener((pending, processing) => {
      const totalActive = (Number(pending) || 0) + (Number(processing) || 0);
      if (totalActive > 0) {
        if (!global.__raTilesDismissed) {
          show3DTilesLoading('Cargando geometría 3D (' + name + ')...', totalActive, {
            forceClearError: (_tilesMonitorState.burstFailed === 0)
          });
        }
        _clearTileWatchdogs();
        _tilesMonitorState.stallTimer = setTimeout(() => {
          _tilesMonitorState.stallTimer = null;
          if (!global.__raTilesDismissed && typeof show3DTilesError === 'function') {
            show3DTilesError('Descarga 3D lenta o atascada (' + name + ')', {
              badgeText: totalActive + ' pend.',
              showActions: true,
              canSwitchCesium: (typeof currentEngine === 'undefined' || currentEngine !== 'cesium'),
              isRetrying: true
            });
          }
        }, 12000);
      } else {
        _clearTileWatchdogs();
        if (_tilesMonitorState.burstFailed > 0) {
          _scheduleTilesetRecovery(name, 1600 * (_tilesMonitorState.retryCount + 1));
        } else {
          hide3DTilesLoading(700, true);
        }
      }
    });
  }

  if (tileset.tileFailed) {
    tileset.tileFailed.addEventListener(error => {
      _tilesMonitorState.burstFailed++;
      _tilesMonitorState.lastErrorMsg = (error && error.message) ? String(error.message) : 'Request has failed.';
      console.warn('[RA 3D Tiles] Fallo al descargar tesela de ' + name + ':', error && error.url ? error.url : '', _tilesMonitorState.lastErrorMsg);

      if (!global.__raTilesDismissed && typeof show3DTilesError === 'function') {
        if (_tilesMonitorState.retryCount < _tilesMonitorState.maxAutoRetries) {
          show3DTilesError('Fallo de red cargando ' + name + ' · Reintento automático...', {
            failCount: _tilesMonitorState.burstFailed,
            showActions: false,
            isRetrying: true
          });
        } else {
          _surfacePersistentTilesError(name, _tilesMonitorState.burstFailed, _tilesMonitorState.lastErrorMsg);
        }
      }
      _scheduleTilesetRecovery(name, 1800 * (_tilesMonitorState.retryCount + 1));
    });
  }

  if (tileset.initialTilesLoaded) {
    tileset.initialTilesLoaded.addEventListener(() => {
      setLoad(100, name + ' Geometría 3D Lista');
      hideLoading();
      if (_tilesMonitorState.burstFailed === 0) {
        hide3DTilesLoading(500, true);
        showStatus('✓ ' + name.toUpperCase() + ' 3D CARGADO CON ÉXITO', 2200);
      }
    });
  }

  if (tileset.allTilesLoaded) {
    tileset.allTilesLoaded.addEventListener(() => {
      _clearTileWatchdogs();
      if (_tilesMonitorState.burstFailed === 0) {
        _configureTileRequestScheduler(4);
        tileset._raRecoveryMode = false;
        tileset.loadSiblings = true;
        hide3DTilesLoading(450, true);
      } else {
        _scheduleTilesetRecovery(name, 1500 * (_tilesMonitorState.retryCount + 1));
      }
    });
  }

  if (tileset.tileLoad) {
    let _tileThrottleTimer = null;
    tileset.tileLoad.addEventListener(() => {
      _tilesMonitorState.burstLoaded++;
      _clearTileWatchdogs();
      if (!_tileThrottleTimer) {
        _tileThrottleTimer = setTimeout(() => {
          _tileThrottleTimer = null;
          if (typeof scene !== 'undefined' && scene && typeof scene.requestRender === 'function') {
            scene.requestRender();
          }
        }, 75);
      }
    });
  }
}

async function loadGoogle3D(opts) {
  const recoveryMode = !!(opts && opts.recoveryMode);
  _configureTileRequestScheduler(recoveryMode ? 2 : 4);
  if (cesiumOsmBuildings) {
    cesiumOsmBuildings.show = false;
    if (typeof cesiumOsmBuildings.trimLoadedTiles === 'function') {
      try { cesiumOsmBuildings.trimLoadedTiles(); } catch (e) {}
    }
  }
  show3DTilesLoading(recoveryMode ? 'Reconectando Google Photorealistic 3D...' : 'Conectando con Google Photorealistic 3D...', 0, { forceClearError: true });

  if (!google3DTileset) {
    try {
      google3DTileset = await Cesium.Cesium3DTileset.fromIonAssetId(2275207, {
        maximumScreenSpaceError: 16,
        maximumMemoryUsage: 512,
        preloadWhenStationary: !recoveryMode,
        preloadAncestors: false,
        skipLevelOfDetail: false, // [FIX HUECOS SOMBRA] No saltar LOD: mantiene geometría continua
        loadSiblings: !recoveryMode, // Desactivar en recuperación para no saturar flujos HTTP/3 QUIC
        cullWithChildrenBounds: false, // [FIX HUECOS SOMBRA] Evitar culling prematuro de edificios adyacentes
        dynamicScreenSpaceError: false // [FIX HUECOS SOMBRA] Evitar degradación agresiva en bordes de pantalla
      });
      const initShadowMode = (typeof window !== 'undefined' && window.ShadowSettings && !window.ShadowSettings.getSettings().selfShadows)
        ? Cesium.ShadowMode.RECEIVE_ONLY
        : Cesium.ShadowMode.ENABLED;
      google3DTileset.shadows = (typeof Cesium !== 'undefined' && Cesium.ShadowMode) ? initShadowMode : undefined;
      google3DTileset.cullWithChildrenBounds = false;
      google3DTileset.skipLevelOfDetail = false;
      google3DTileset.loadSiblings = !recoveryMode;
      google3DTileset.dynamicScreenSpaceError = false;
      google3DTileset._raRecoveryMode = recoveryMode;
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
        maximumMemoryUsage: 512,     // 512MB de caché optimizado para GPUs integradas y portátiles
        preloadWhenStationary: !recoveryMode,
        preloadAncestors: false,
        skipLevelOfDetail: false,    // [FIX HUECOS SOMBRA] No saltar LOD: erradica agujeros en mallas
        immediatelyLoadDesiredLevelOfDetail: false,
        loadSiblings: !recoveryMode,
        cullWithChildrenBounds: false, // [FIX HUECOS SOMBRA] No descartar tiles de edificios cercanos
        dynamicScreenSpaceError: false // [FIX HUECOS SOMBRA] Detalle uniforme sin degradación perimetral
      });
      const initShadowMode = (typeof window !== 'undefined' && window.ShadowSettings && !window.ShadowSettings.getSettings().selfShadows)
        ? Cesium.ShadowMode.RECEIVE_ONLY
        : Cesium.ShadowMode.ENABLED;
      google3DTileset.shadows = (typeof Cesium !== 'undefined' && Cesium.ShadowMode) ? initShadowMode : undefined;
      google3DTileset.cullWithChildrenBounds = false;
      google3DTileset.skipLevelOfDetail = false;
      google3DTileset.loadSiblings = !recoveryMode;
      google3DTileset.dynamicScreenSpaceError = false;
      google3DTileset._raRecoveryMode = recoveryMode;
      window.google3DTileset = google3DTileset;
      attachTilesetLoadMonitor(google3DTileset, 'Google 3D');
      scene.primitives.add(google3DTileset);
      globe.show = false;
      return;
    } catch (e2) {
      if (typeof showToast === 'function') {
        showToast('MOTOR GOOGLE 3D NO DISPONIBLE', 'No se pudo conectar con Google 3D; cambiando automáticamente al motor Cesium Ion 3D.', 'warning', 5500);
      }
      await loadCesium3D();
      const b = document.getElementById('active-engine-badge');
      if (b) b.textContent = 'CESIUM 3D';
    }
  } else {
    google3DTileset.show = true;
    google3DTileset.cullWithChildrenBounds = false;
    google3DTileset.skipLevelOfDetail = false;
    google3DTileset.loadSiblings = !recoveryMode;
    google3DTileset.dynamicScreenSpaceError = false;
    globe.show = false;
    show3DTilesLoading('Renderizando Google 3D...', 0, { forceClearError: true });
    hide3DTilesLoading(800);
  }
}

async function loadCesium3D() {
  if (google3DTileset) {
    google3DTileset.show = false;
    if (typeof google3DTileset.trimLoadedTiles === 'function') {
      try { google3DTileset.trimLoadedTiles(); } catch (e) {}
    }
  }
  globe.show = true;
  show3DTilesLoading('Cargando Cesium OSM Buildings...', 0, { forceClearError: true });

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
  if (google3DTileset) {
    google3DTileset.show = false;
    if (typeof google3DTileset.trimLoadedTiles === 'function') {
      try { google3DTileset.trimLoadedTiles(); } catch (e) {}
    }
  }
  if (cesiumOsmBuildings) {
    cesiumOsmBuildings.show = false;
    if (typeof cesiumOsmBuildings.trimLoadedTiles === 'function') {
      try { cesiumOsmBuildings.trimLoadedTiles(); } catch (e) {}
    }
  }
  globe.show = true;
  show3DTilesLoading('Cargando Ortofoto ArcGIS 3D...', 0, { forceClearError: true });

  if (cesiumTerrainProvider) viewer.terrainProvider = cesiumTerrainProvider;

  try {
    const ag = await Cesium.ArcGisMapServerImageryProvider.fromUrl(
      'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer'
    );
    viewer.imageryLayers.removeAll();
    viewer.imageryLayers.addImageryProvider(ag);
  } catch(e) { window.RA && window.RA.log && window.RA.log.warn('[catch silenciado]', e); }
  hide3DTilesLoading(1000, true);
}

  // ── MOTOR HÍBRIDO INTEGRAL AAA DE BÚSQUEDA Y NAVEGACIÓN ────────────────────
  let _searchDebounceTimer = null;
  let _currentSearchResults = [];
  let _selectedSearchIndex = -1;

  function getSearchHistory() {
    try {
      return JSON.parse(localStorage.getItem('ra_search_history')) || [];
    } catch (e) {
      return [];
    }
  }

  function saveToHistory(place) {
    if (!place || (!place.display_name && !place.main_text)) return;
    let history = getSearchHistory();
    const key = place.rc || place.display_name || place.main_text;
    history = history.filter(p => (p.rc || p.display_name || p.main_text) !== key);
    history.unshift({
      display_name: place.display_name || place.main_text,
      main_text: place.main_text || place.display_name,
      sub_text: place.sub_text || '',
      lat: place.lat,
      lon: place.lon,
      rc: place.rc || null,
      badge: place.badge || 'HISTORIAL',
      badgeClass: place.badgeClass || 'search-badge-history',
      type: place.type || 'history'
    });
    if (history.length > 8) history = history.slice(0, 8);
    try {
      localStorage.setItem('ra_search_history', JSON.stringify(history));
    } catch (e) {}
  }

  function showHistory() {
    const resultsEl = document.getElementById('ra-results');
    if (!resultsEl) return;
    const history = getSearchHistory();
    if (!history.length) {
      resultsEl.classList.remove('open');
      return;
    }

    resultsEl.innerHTML = '<div style="padding: 6px 12px; font-size: 10px; color: #94a3b8; font-weight: 700; letter-spacing: 0.5px; border-bottom: 1px solid rgba(255,255,255,0.06); display: flex; align-items: center; gap: 6px;"><span>🕒</span> BÚSQUEDAS RECIENTES</div>';

    _currentSearchResults = history;
    _selectedSearchIndex = -1;

    history.forEach((p, idx) => {
      const item = createSearchResultItem(p, idx);
      resultsEl.appendChild(item);
    });

    resultsEl.classList.add('open');
  }

  function detectCadastralRef(str) {
    if (!str || typeof str !== 'string') return null;
    const clean = str.replace(/[\s\-_]/g, '').toUpperCase();
    const rcRegex = /^[0-9]{7}[A-Z]{2}[0-9]{4}[A-Z]{1}([0-9]{4}[A-Z]{2})?$/;
    return rcRegex.test(clean) ? clean : null;
  }

  function _isValidCoordinate(lat, lon) {
    return !isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
  }

  function parseCoordinatesOrUrl(str) {
    if (!str || typeof str !== 'string') return null;
    const s = str.trim();

    // 1. URLs de Google Maps
    const gmapsPatterns = [
      /@(-?\d+\.\d+),(-?\d+\.\d+)/,
      /[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/,
      /[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/,
      /[?&]loc:(-?\d+\.\d+)\+(-?\d+\.\d+)/,
      /[?&]destination=(-?\d+\.\d+),(-?\d+\.\d+)/
    ];
    for (const pat of gmapsPatterns) {
      const match = s.match(pat);
      if (match) {
        const lat = parseFloat(match[1]);
        const lon = parseFloat(match[2]);
        if (_isValidCoordinate(lat, lon)) {
          return {
            lat,
            lon,
            main_text: `Ubicación Google Maps (${lat.toFixed(5)}, ${lon.toFixed(5)})`,
            sub_text: 'Enlace de Google Maps detectado y parseado directamente',
            display_name: `${lat.toFixed(6)}, ${lon.toFixed(6)}`,
            badge: 'COORDENADAS GPS',
            badgeClass: 'search-badge-gps',
            type: 'gps'
          };
        }
      }
    }

    // 2. Coordenadas directas lat, lon decimales (ej. 40.4168, -3.7038)
    const coordRegex = /^(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)$/;
    const coordMatch = s.match(coordRegex);
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lon = parseFloat(coordMatch[2]);
      if (_isValidCoordinate(lat, lon)) {
        return {
          lat,
          lon,
          main_text: `Coordenadas: ${lat.toFixed(5)}, ${lon.toFixed(5)}`,
          sub_text: 'Coordenadas geográficas WGS84',
          display_name: `${lat.toFixed(6)}, ${lon.toFixed(6)}`,
          badge: 'COORDENADAS GPS',
          badgeClass: 'search-badge-gps',
          type: 'gps'
        };
      }
    }

    // 3. Coordenadas con sufijo N/S E/W
    const dmsRegex = /^(\d{1,2}(?:\.\d+)?)\s*°?\s*([NS])\s*[,;\s]\s*(\d{1,3}(?:\.\d+)?)\s*°?\s*([EWEO])$/i;
    const dmsMatch = s.match(dmsRegex);
    if (dmsMatch) {
      let lat = parseFloat(dmsMatch[1]);
      if (dmsMatch[2].toUpperCase() === 'S') lat = -lat;
      let lon = parseFloat(dmsMatch[3]);
      if (['W', 'O'].includes(dmsMatch[4].toUpperCase())) lon = -lon;
      if (_isValidCoordinate(lat, lon)) {
        return {
          lat,
          lon,
          main_text: `Coordenadas: ${lat.toFixed(5)}, ${lon.toFixed(5)}`,
          sub_text: 'Coordenadas WGS84 N/S E/W',
          display_name: `${lat.toFixed(6)}, ${lon.toFixed(6)}`,
          badge: 'COORDENADAS GPS',
          badgeClass: 'search-badge-gps',
          type: 'gps'
        };
      }
    }

    return null;
  }

  async function queryCatastro(rc) {
    const url = `https://ovc.catastro.meh.es/ovcservweb/ovcswlocalizacionrc/ovccoordenadas.asmx/Consulta_CPMRC?Provincia=&Municipio=&SRS=EPSG:4326&RC=${encodeURIComponent(rc)}`;
    try {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeoutId = controller ? setTimeout(() => controller.abort(), 4500) : null;
      const res = await fetch(url, controller ? { signal: controller.signal } : {});
      if (timeoutId) clearTimeout(timeoutId);

      const xmlText = await res.text();
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

      const xcen = xmlDoc.querySelector('xcen');
      const ycen = xmlDoc.querySelector('ycen');
      const ldt = xmlDoc.querySelector('ldt');

      if (xcen && ycen && xcen.textContent && ycen.textContent) {
        const lon = parseFloat(xcen.textContent.trim().replace(',', '.'));
        const lat = parseFloat(ycen.textContent.trim().replace(',', '.'));
        const address = ldt && ldt.textContent ? ldt.textContent.trim() : `Parcela Catastral ${rc}`;

        if (_isValidCoordinate(lat, lon)) {
          return [{
            display_name: `${address} (RC: ${rc})`,
            main_text: `Ref. Catastral: ${rc}`,
            sub_text: address || 'Sede Electrónica del Catastro de España',
            lat,
            lon,
            rc,
            badge: 'CATASTRO',
            badgeClass: 'search-badge-catastro',
            type: 'catastro'
          }];
        }
      }
    } catch (e) {
      window.RA && window.RA.log && window.RA.log.warn('[Catastro API]', e);
    }
    return [];
  }

  async function queryGoogleGeocode(q) {
    const apiKey = (window.RA_CONFIG_KEYS && window.RA_CONFIG_KEYS.googleMaps) ||
                   (window.RA_KEYS && window.RA_KEYS.googleMaps) ||
                   '';
    if (!apiKey) return null;

    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&key=${apiKey}&language=es`;
    try {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeoutId = controller ? setTimeout(() => controller.abort(), 4500) : null;
      const res = await fetch(url, controller ? { signal: controller.signal } : {});
      if (timeoutId) clearTimeout(timeoutId);

      const data = await res.json();
      if (data && data.status === 'OK' && Array.isArray(data.results) && data.results.length > 0) {
        return data.results.slice(0, 5).map(r => {
          const lat = r.geometry && r.geometry.location ? r.geometry.location.lat : null;
          const lon = r.geometry && r.geometry.location ? r.geometry.location.lng : null;
          const types = r.types || [];
          const isBusiness = types.some(t => ['establishment', 'point_of_interest', 'premise', 'subpremise', 'industrial'].includes(t));
          const badge = isBusiness ? 'EMPRESA / POLÍGONO' : 'DIRECCIÓN';
          const badgeClass = 'search-badge-google';

          let mainText = r.formatted_address;
          let subText = '';
          const parts = r.formatted_address.split(',');
          if (parts.length > 1) {
            mainText = parts[0].trim();
            subText = parts.slice(1).join(',').trim();
          }

          return {
            display_name: r.formatted_address,
            main_text: mainText,
            sub_text: subText || 'Google Maps Geocoding',
            lat,
            lon,
            badge,
            badgeClass,
            type: 'google'
          };
        }).filter(item => _isValidCoordinate(item.lat, item.lon));
      }
    } catch (e) {
      window.RA && window.RA.log && window.RA.log.warn('[Google Geocode API]', e);
    }
    return null;
  }

  async function queryNominatim(q) {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&addressdetails=1`;
    try {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeoutId = controller ? setTimeout(() => controller.abort(), 4500) : null;
      const res = await fetch(url, {
        headers: { 'Accept-Language': 'es' },
        signal: controller ? controller.signal : undefined
      });
      if (timeoutId) clearTimeout(timeoutId);

      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return data.map(p => {
          const lat = parseFloat(p.lat);
          const lon = parseFloat(p.lon);
          let mainText = p.display_name;
          let subText = '';
          const parts = p.display_name.split(',');
          if (parts.length > 1) {
            mainText = parts[0].trim();
            subText = parts.slice(1).join(',').trim();
          }
          return {
            display_name: p.display_name,
            main_text: mainText,
            sub_text: subText || 'OpenStreetMap Nominatim',
            lat,
            lon,
            badge: 'OSM',
            badgeClass: 'search-badge-osm',
            type: 'osm'
          };
        }).filter(item => _isValidCoordinate(item.lat, item.lon));
      }
    } catch (e) {
      window.RA && window.RA.log && window.RA.log.warn('[Nominatim API]', e);
    }
    return [];
  }

  function createSearchResultItem(item, idx) {
    const d = document.createElement('div');
    d.className = 'search-res-item';
    d.setAttribute('data-index', idx);

    const titleRow = document.createElement('div');
    titleRow.className = 'search-res-title-row';

    const mainText = document.createElement('span');
    mainText.className = 'search-res-main';
    mainText.textContent = item.main_text || item.display_name;

    const badge = document.createElement('span');
    badge.className = `search-badge ${item.badgeClass || 'search-badge-google'}`;
    badge.textContent = item.badge || 'DIRECCIÓN';

    titleRow.appendChild(mainText);
    titleRow.appendChild(badge);

    const subText = document.createElement('div');
    subText.className = 'search-res-sub';
    subText.textContent = item.sub_text || item.display_name;

    d.appendChild(titleRow);
    d.appendChild(subText);

    d.addEventListener('click', () => {
      flyToPlace(item, true);
    });

    return d;
  }

  function renderSearchResults(items) {
    const resultsEl = document.getElementById('ra-results');
    if (!resultsEl) return;
    resultsEl.innerHTML = '';
    _currentSearchResults = items || [];
    _selectedSearchIndex = -1;

    if (!_currentSearchResults.length) {
      resultsEl.innerHTML = '<div style="padding: 10px 12px; font-size: 11px; color: #94a3b8; text-align: center;">No se encontraron ubicaciones para la búsqueda</div>';
      resultsEl.classList.add('open');
      return;
    }

    _currentSearchResults.forEach((item, idx) => {
      const el = createSearchResultItem(item, idx);
      resultsEl.appendChild(el);
    });

    resultsEl.classList.add('open');
  }

  async function executeUniversalSearch(autoFlyIfSingle = false) {
    const searchInput = document.getElementById('ra-search-input');
    const resultsEl = document.getElementById('ra-results');
    const clearBtn = document.getElementById('ra-search-clear-btn');
    if (!searchInput || !resultsEl) return;

    const raw = searchInput.value.trim();
    if (!raw) {
      if (clearBtn) clearBtn.style.display = 'none';
      showHistory();
      return;
    }
    if (clearBtn) clearBtn.style.display = 'inline-flex';

    // 1. Detección inmediata de coordenadas o links de Maps (0 ms latencia)
    const parsedCoords = parseCoordinatesOrUrl(raw);
    if (parsedCoords) {
      renderSearchResults([parsedCoords]);
      if (autoFlyIfSingle) {
        flyToPlace(parsedCoords, true);
      }
      return;
    }

    // 2. Detección de Referencia Catastral (14 o 20 caracteres)
    const rc = detectCadastralRef(raw);
    if (rc) {
      if (typeof showStatus === 'function') showStatus(`CONSULTANDO CATASTRO (${rc})...`);
      const catastroResults = await queryCatastro(rc);
      if (typeof hideStatus === 'function') hideStatus();

      if (catastroResults.length > 0) {
        renderSearchResults(catastroResults);
        if (autoFlyIfSingle) {
          flyToPlace(catastroResults[0], true);
        }
        return;
      }
    }

    // 3. Búsqueda híbrida: Google Geocode con fallback a Nominatim
    if (typeof showStatus === 'function') showStatus('BUSCANDO UBICACIÓN...');
    let results = await queryGoogleGeocode(raw);
    if (!results || results.length === 0) {
      results = await queryNominatim(raw);
    }
    if (typeof hideStatus === 'function') hideStatus();

    renderSearchResults(results || []);
    if (autoFlyIfSingle && results && results.length === 1) {
      flyToPlace(results[0], true);
    }
  }

  function handleSearchInput() {
    const searchInput = document.getElementById('ra-search-input');
    const clearBtn = document.getElementById('ra-search-clear-btn');
    const val = searchInput ? searchInput.value.trim() : '';

    if (!val) {
      if (clearBtn) clearBtn.style.display = 'none';
      showHistory();
      return;
    }
    if (clearBtn) clearBtn.style.display = 'inline-flex';

    if (_searchDebounceTimer) clearTimeout(_searchDebounceTimer);
    _searchDebounceTimer = setTimeout(() => {
      executeUniversalSearch(false);
    }, 300);
  }

  function clearSearchInput() {
    const searchInput = document.getElementById('ra-search-input');
    const clearBtn = document.getElementById('ra-search-clear-btn');
    const resultsEl = document.getElementById('ra-results');
    if (searchInput) {
      searchInput.value = '';
      searchInput.focus();
    }
    if (clearBtn) clearBtn.style.display = 'none';
    if (resultsEl) resultsEl.classList.remove('open');
    showHistory();
  }

  function locateUserPosition() {
    if (!navigator.geolocation) {
      if (typeof showStatus === 'function') showStatus('GEOLOCALIZACIÓN NO DISPONIBLE EN ESTE NAVEGADOR', 3000);
      return;
    }
    if (typeof showStatus === 'function') showStatus('OBTENIENDO POSICIÓN GPS...');
    navigator.geolocation.getCurrentPosition(
      pos => {
        if (typeof hideStatus === 'function') hideStatus();
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const place = {
          lat,
          lon,
          main_text: 'Mi Ubicación Actual',
          sub_text: `GPS: ${lat.toFixed(5)}, ${lon.toFixed(5)} (±${Math.round(pos.coords.accuracy)}m)`,
          display_name: `Ubicación GPS (${lat.toFixed(5)}, ${lon.toFixed(5)})`,
          badge: 'GPS',
          badgeClass: 'search-badge-gps',
          type: 'gps'
        };
        flyToPlace(place, false);
        if (typeof showStatus === 'function') showStatus('UBICACIÓN GPS ENCONTRADA', 2000);
      },
      err => {
        if (typeof showStatus === 'function') showStatus(`GPS ERROR: ${err.message}`, 3000);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  }

  async function getGroundElevation(lat, lon) {
    // 1. Google Maps Elevation API (si hay API key disponible)
    const apiKey = (window.RA_CONFIG_KEYS && window.RA_CONFIG_KEYS.googleMaps) ||
                   (window.RA_KEYS && window.RA_KEYS.googleMaps) ||
                   '';
    if (apiKey) {
      try {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const tid = controller ? setTimeout(() => controller.abort(), 2000) : null;
        const res = await fetch(`https://maps.googleapis.com/maps/api/elevation/json?locations=${lat},${lon}&key=${apiKey}`, controller ? { signal: controller.signal } : {});
        if (tid) clearTimeout(tid);
        const data = await res.json();
        if (data && data.status === 'OK' && Array.isArray(data.results) && data.results.length > 0) {
          const elev = data.results[0].elevation;
          if (typeof elev === 'number' && !isNaN(elev)) {
            return elev;
          }
        }
      } catch (eGoogle) {
        window.RA && window.RA.log && window.RA.log.debug('Fallback desde Google Elevation API:', eGoogle);
      }
    }

    // 2. Open-Meteo Elevation API (fallback abierto sin cuota)
    try {
      const controller2 = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const tid2 = controller2 ? setTimeout(() => controller2.abort(), 2000) : null;
      const res2 = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`, controller2 ? { signal: controller2.signal } : {});
      if (tid2) clearTimeout(tid2);
      const data2 = await res2.json();
      if (data2 && Array.isArray(data2.elevation) && typeof data2.elevation[0] === 'number') {
        return data2.elevation[0];
      }
    } catch (eMeteo) {
      window.RA && window.RA.log && window.RA.log.debug('Fallback desde Open-Meteo Elevation:', eMeteo);
    }

    // 3. Muestreo de Globo Cesium si está disponible
    if (window.viewer && window.viewer.scene && window.viewer.scene.globe && typeof Cesium !== 'undefined') {
      try {
        const carto = Cesium.Cartographic.fromDegrees(lon, lat);
        const gh = window.viewer.scene.globe.getHeight(carto);
        if (typeof gh === 'number' && !isNaN(gh)) return gh;
      } catch (_) {}
    }

    // 4. Cota estimada en España si todos los servicios están inaccesibles
    return 600;
  }

  async function flyToPlace(p, save = true) {
    if (!p) return;
    const searchInput = document.getElementById('ra-search-input');
    const resultsEl = document.getElementById('ra-results');
    const clearBtn = document.getElementById('ra-search-clear-btn');

    if (save) saveToHistory(p);
    if (resultsEl) resultsEl.classList.remove('open');
    if (searchInput) {
      searchInput.value = p.main_text || (p.display_name ? p.display_name.split(',')[0] : '');
      if (clearBtn) clearBtn.style.display = 'inline-flex';
    }

    const curCam = (typeof camera !== 'undefined' && camera) ? camera : (window.viewer ? window.viewer.camera : null);
    if (!curCam || typeof Cesium === 'undefined') return;

    const lon = parseFloat(p.lon);
    const lat = parseFloat(p.lat);
    if (isNaN(lon) || isNaN(lat)) return;

    if (typeof window !== 'undefined' && window.solarProjectConfig) {
      window.solarProjectConfig.lat = lat;
      window.solarProjectConfig.lng = lon;
      window.solarProjectConfig.latitude = lat;
      window.solarProjectConfig.longitude = lon;
      if (p.rc) {
        window.solarProjectConfig.cadastralRef = p.rc;
      }
      if (p.main_text || p.display_name) {
        window.solarProjectConfig.address = p.display_name || p.main_text;
      }
    }
    if (typeof RAProjectStatusHUD !== 'undefined' && typeof RAProjectStatusHUD.update === 'function') {
      RAProjectStatusHUD.update();
    }

    // Distancia visual (range) y ángulo para inspección fotovoltaica AAA
    const isBroadArea = (p.type === 'osm' && (!p.sub_text || p.sub_text.split(',').length < 2));
    const targetRange = isBroadArea ? 800 : 220; // 220m en cubierta permite ver nave/tejado con nitidez
    const targetPitch = Cesium.Math.toRadians(isBroadArea ? -40 : -45);

    // Obtener elevación del terreno real
    const elevation = await getGroundElevation(lat, lon);

    // Centrar la cámara en la ubicación focal usando BoundingSphere y HeadingPitchRange
    const targetCartesian = Cesium.Cartesian3.fromDegrees(lon, lat, elevation);
    const boundingSphere = new Cesium.BoundingSphere(targetCartesian, 0);

    curCam.flyToBoundingSphere(boundingSphere, {
      offset: new Cesium.HeadingPitchRange(
        Cesium.Math.toRadians(0), // Heading Norte
        targetPitch,
        targetRange
      ),
      duration: 2.2,
      easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
      complete: () => {
        // Guardián anti-entierro post-vuelo: asegurar que la cámara quede por encima de mallas locales
        setTimeout(() => {
          if (window.viewer && window.viewer.scene && curCam) {
            try {
              const carto = curCam.positionCartographic;
              if (carto) {
                let surfaceH = null;
                try { surfaceH = window.viewer.scene.sampleHeight(carto); } catch (_) {}
                if (typeof surfaceH === 'number' && !isNaN(surfaceH) && carto.height < surfaceH + 20) {
                  curCam.setView({
                    destination: Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, surfaceH + 50)
                  });
                }
              }
            } catch (_) {}
            if (window.viewer.scene.requestRender) window.viewer.scene.requestRender();
          }
        }, 350);
      }
    });
  }

  function _updateSearchHighlight() {
    const resultsEl = document.getElementById('ra-results');
    if (!resultsEl) return;
    const items = resultsEl.querySelectorAll('.search-res-item');
    items.forEach((item, idx) => {
      if (idx === _selectedSearchIndex) {
        item.classList.add('selected');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('selected');
      }
    });
  }

  function initUniversalSearch() {
    const searchInput = document.getElementById('ra-search-input');
    const resultsEl = document.getElementById('ra-results');

    if (searchInput && !searchInput._raSearchInitialized) {
      searchInput._raSearchInitialized = true;

      searchInput.addEventListener('focus', () => {
        if (searchInput.value.trim() === '') {
          showHistory();
        } else if (_currentSearchResults.length > 0 && resultsEl) {
          resultsEl.classList.add('open');
        }
      });

      searchInput.addEventListener('input', handleSearchInput);

      searchInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (_selectedSearchIndex >= 0 && _currentSearchResults[_selectedSearchIndex]) {
            flyToPlace(_currentSearchResults[_selectedSearchIndex], true);
          } else {
            executeUniversalSearch(true);
          }
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (_currentSearchResults.length > 0) {
            _selectedSearchIndex = (_selectedSearchIndex + 1) % _currentSearchResults.length;
            _updateSearchHighlight();
          }
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (_currentSearchResults.length > 0) {
            _selectedSearchIndex = (_selectedSearchIndex - 1 + _currentSearchResults.length) % _currentSearchResults.length;
            _updateSearchHighlight();
          }
        } else if (e.key === 'Escape') {
          if (resultsEl) resultsEl.classList.remove('open');
          searchInput.blur();
        }
      });
    }

    // Cerrar al hacer clic fuera
    document.addEventListener('click', e => {
      if (!e.target.closest('#ra-search') && !e.target.closest('#ra-results')) {
        if (resultsEl) resultsEl.classList.remove('open');
      }
    });

    // Atajo global de teclado "/" para enfocar el buscador
    if (!document._raSearchShortcutInitialized) {
      document._raSearchShortcutInitialized = true;
      document.addEventListener('keydown', e => {
        if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
          const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
          const isEditable = document.activeElement ? document.activeElement.isContentEditable : false;
          if (activeTag !== 'input' && activeTag !== 'textarea' && activeTag !== 'select' && !isEditable) {
            e.preventDefault();
            if (searchInput) {
              searchInput.focus();
              searchInput.select();
            }
          }
        }
      });
    }
  }

  function doSearch() {
    executeUniversalSearch(true);
  }

  function executeSearch() {
    executeUniversalSearch(true);
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

  // ── EXPORTACIÓN AL NAMESPACE GLOBAL Y WINDOW.RA ─────────────────────────────
  global.RA = global.RA || {};

  global.switchEngine = switchEngine;
  global.attachTilesetLoadMonitor = attachTilesetLoadMonitor;
  global.retry3DTilesLoad = retry3DTilesLoad;
  global.loadGoogle3D = loadGoogle3D;
  global.loadCesium3D = loadCesium3D;
  global.loadArcGIS3D = loadArcGIS3D;
  global.executeSearch = executeSearch;
  global.doSearch = doSearch;
  global.executeUniversalSearch = executeUniversalSearch;
  global.flyToPlace = flyToPlace;
  global.getSearchHistory = getSearchHistory;
  global.saveToHistory = saveToHistory;
  global.showHistory = showHistory;
  global.resetNorth = resetNorth;
  global.updateWindRose = updateWindRose;
  global.toggle2D3D = toggle2D3D;

  // Nuevas utilidades canónicas del Buscador Universal AAA
  global.initUniversalSearch = initUniversalSearch;
  global.detectCadastralRef = detectCadastralRef;
  global.parseCoordinatesOrUrl = parseCoordinatesOrUrl;
  global.queryCatastro = queryCatastro;
  global.queryGoogleGeocode = queryGoogleGeocode;
  global.queryNominatim = queryNominatim;
  global.clearSearchInput = clearSearchInput;
  global.locateUserPosition = locateUserPosition;

  global.RA.Viewer = {
    switchEngine,
    retry3DTilesLoad,
    loadGoogle3D,
    loadCesium3D,
    loadArcGIS3D,
    doSearch,
    executeSearch,
    executeUniversalSearch,
    flyToPlace,
    getSearchHistory,
    saveToHistory,
    showHistory,
    resetNorth,
    updateWindRose,
    toggle2D3D,
    initUniversalSearch,
    detectCadastralRef,
    parseCoordinatesOrUrl,
    queryCatastro,
    queryGoogleGeocode,
    queryNominatim,
    clearSearchInput,
    locateUserPosition
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initUniversalSearch);
    } else {
      initUniversalSearch();
    }
  }

})(typeof window !== 'undefined' ? window : globalThis);
