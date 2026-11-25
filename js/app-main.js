// ============================================================================
// js/app-main.js — Orquestador Principal 3D/CAD & Arranque de Aplicación
// Extraído del monolito RA/index.html (Track 6 · Fase 6.3)
// ============================================================================
// ══════════════════════════════════════════════════════════════════════════════
// 🏗️  NAMESPACE GLOBAL window.RA — Estado centralizado (Arquitectura v2)
// ══════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// <i data-lucide=\"euro\" class=\"icon-sm\"></i> CONTROLADORES DE MODALES: DESGLOSE DE COSTES & DATOS EMPRESA (OPCIÓN B AAA)
// ══════════════════════════════════════════════════════════════════════════════

window.RA = window.RA || {
  version: '2.0.0',
  projectConfig: null,        // alias: window.solarProjectConfig
  inverterState: null,        // alias: window.inverterEquipmentState
  wpState: null,              // alias: window.WP (working plane state)
  ui: {},                     // UI runtime refs (steppers, panels)
  scene: null,                // Cesium scene ref (asignado en viewer init)
  viewer: null                // Cesium viewer ref (asignado en viewer init)
};
// ── Variables de throttle pickPosition GPU — evita gl.readPixels bloqueante en MOUSE_MOVE ────
window.RA._pickPositionThrottle = {
  lastTime: 0,
  minDelta: 140, // ms (~30 picks/s máximo)
  lastPos: null
};
// ── Pool de Cartesian3 pre-allocados — evita GC en hot-paths de 60fps ────
// Uso: Cesium.Cartesian3.add(a, b, window.RA._scratch.c3_0)  (no new!)
(function() {
  // Los scratch solo se pueden crear tras cargar Cesium — se inicializan lazy
  Object.defineProperty(window.RA, '_scratch', {
    get: function() {
      if (!window.RA.__scratchReady) {
        window.RA.__scratchPool = {
          c3_0:    new Cesium.Cartesian3(),
          c3_1:    new Cesium.Cartesian3(),
          c3_2:    new Cesium.Cartesian3(),
          c3_normal: new Cesium.Cartesian3(),
          c3_sun:  new Cesium.Cartesian3(),
          c3_enu:  new Cesium.Cartesian3(),
          c3_pick: new Cesium.Cartesian3()
        };
        window.RA.__scratchReady = true;
      }
      return window.RA.__scratchPool;
    }
  });
})();
// ── Monitor de performance (activar: RA.perf.enabled = true en consola) ──
window.RA.perf = { enabled: false, pickCount: 0, frameCount: 0, lastPickMs: 0 };
// ── Logger centralizado (no-op en producción, activo en debug mode) ──────
window.RA.debug = false; // activar en consola: RA.debug = true
// ── Registro de listeners globales para cleanup al destruir la sesión ────
window.RA._listeners = []; // [{ target, event, handler }]
window.RA.addListener = function(target, event, handler, options) {
  if (typeof target === 'string') {
    options = handler;
    handler = event;
    event = target;
    target = window;
  }
  if (target && typeof target.addEventListener === 'function') {
    target.addEventListener(event, handler, options);
    window.RA._listeners.push({ target, event, handler });
  }
};
window.RA.cleanup = function() {
  window.RA._listeners.forEach(function(l) {
    try { l.target.removeEventListener(l.event, l.handler); } catch(e) {}
  });
  window.RA._listeners = [];
  window.RA.log && window.RA.log.debug('RA.cleanup() ejecutado — ' + window.RA._listeners.length + ' listeners liberados');
};
window.RA.log = {
  info:  function() { console.log.apply(console, ['[RA]'].concat(Array.from(arguments))); },
  debug: function() { if (window.RA.debug) console.log.apply(console, ['[RA]'].concat(Array.from(arguments))); },
  warn:  function() { if (window.RA.debug) console.warn.apply(console, ['[RA]'].concat(Array.from(arguments))); },
  error: function() { console.error.apply(console, ['[RA ERROR]'].concat(Array.from(arguments))); }
};

// ══════════════════════════════════════════════════════════════════════════════
// <i data-lucide=\"rocket\" class=\"icon-sm\"></i> FASE 1: SISTEMA DE TOASTS MODERNOS, SHORTCUTS CAD Y PERSISTENCIA
// ══════════════════════════════════════════════════════════════════════════════

// [MODULARIZACION FASE 2 - BLOQUE 2.3] showToast delegado canónicamente a js/ui-viewport-controls.js

// [F4-07] Atajos de teclado CAD extraídos a js/keyboard-shortcuts.js

// [F4-07] Subsistema de autoguardado y restauración extraído a js/autosave-manager.js




// ── Claves y Tokens ────────────────────────────────────────────────────────
const GOOGLE_MAPS_API_KEY = (window.RA_CONFIG_KEYS && window.RA_CONFIG_KEYS.googleMaps) || '';
const CESIUM_ION_TOKEN    = (window.RA_CONFIG_KEYS && window.RA_CONFIG_KEYS.cesiumIon) || '';

Cesium.Ion.defaultAccessToken = CESIUM_ION_TOKEN;
Cesium.GoogleMaps.defaultApiKey = GOOGLE_MAPS_API_KEY;

// [MODULARIZACION FASE 2 - BLOQUE 2.3] Pantalla de carga, indicadores 3D tiles, estado y notificaciones delegados canónicamente a js/ui-viewport-controls.js

// ── Inicialización de Cesium Viewer ─────────────────────────────────────────

// ══════════════════════════════════════════════════════════════════════════════
// <i data-lucide=\"sun\" class=\"icon-sm\"></i> SKYBOX PROCEDURAL FOTORREALISTA AAA (CIELO DIURNO CON NUBES SUAVES)
// ══════════════════════════════════════════════════════════════════════════════
// ☀️ SKYBOX PROCEDURAL FOTORREALISTA AAA (DÍA, ATARDECER Y NOCHE ESTRELLADA)
// ══════════════════════════════════════════════════════════════════════════════
// [MODULARIZADO AAA] Skybox procedural fotorrealista delegado a js/procedural-skybox.js

const viewer = new Cesium.Viewer('cesiumContainer', {
  baseLayerPicker     : false,
  geocoder            : false,
  homeButton          : false,
  sceneModePicker     : false,
  navigationHelpButton: false,
  animation           : false,
  timeline            : false,
  fullscreenButton    : false,
  infoBox             : false,
  selectionIndicator  : false,
  shadows             : false,  // Desactivado global para máximo rendimiento
  terrainShadows      : (typeof Cesium !== 'undefined' && Cesium.ShadowMode) ? Cesium.ShadowMode.ENABLED : undefined,
  shouldAnimate       : false, // el tick del reloj forzaba re-render continuo (GPU al 100%)
  requestRenderMode   : true,
      maximumRenderTimeChange : Infinity,
});

window.viewer = viewer; // [CAPTURA] exposicion de una linea para modulos (capture-mode necesita el registro de entidades)


const { scene, camera, clock } = viewer;
if (camera && camera.frustum) camera.frustum.near = 0.5;
const globe = scene.globe;

// [F3-09] wpConfigureShadowMap canónico reside en js/shadow-settings.js; handlers muertos wpOnEstructuraChange/wpSyncEstructuraUI purgados.

// [F4-07] Comparador de escenarios y UI de pérdidas extraídos a js/scenario-comparator.js


window.wpShadowDiagnostics = function() {
  const sm = (typeof scene !== 'undefined') ? scene.shadowMap : null;
  if (!sm) return null;
  return {
    size: sm.size, softShadows: sm.softShadows, darkness: sm.darkness,
    cascades: sm.numberOfCascades, maximumDistance: sm.maximumDistance,
    depthBiasActual: sm._primitiveBias ? sm._primitiveBias.depthBias : null,
    biasMetersObjetivo: window.wpShadowBiasMeters,
    despegueRealMetros: (sm._primitiveBias && sm.maximumDistance) ? (sm._primitiveBias.depthBias * sm.maximumDistance) : null
  };
};
window.wpSetShadowBiasMeters = function(m) {
  const val = Math.max(0.01, Math.min(2.0, Number(m) || 0.08));
  window.wpShadowBiasMeters = val;
  if (typeof window !== 'undefined' && window.ShadowSettings && typeof window.ShadowSettings.setBiasMeters === 'function') {
    window.ShadowSettings.setBiasMeters(val);
  } else if (typeof scene !== 'undefined' && scene.shadowMap) {
    wpConfigureShadowMap(scene.shadowMap);
    if (typeof scene.requestRender === 'function') scene.requestRender();
  }
  return window.wpShadowDiagnostics();
};

if (scene.shadowMap) {
  wpConfigureShadowMap(scene.shadowMap);
}

// [AAA SHADOW PIPELINE]: Se elimina la mutación por frame en scene.preUpdate
// que forzaba _fitNearFar = false e invalidaba el FBO de cascadas al orbitar.

// [F4-07] Encuadre dron y captura de informe extraídos a js/drone-capture-controller.js

// ── Estabilización de render tras movimiento de cámara en requestRenderMode ──
if (camera && camera.moveEnd) {
  camera.moveEnd.addEventListener(() => {
    if (typeof window !== 'undefined' && window.ShadowSettings && typeof window.ShadowSettings.requestSettleFrames === 'function') {
      window.ShadowSettings.requestSettleFrames(scene);
    } else if (typeof scene !== 'undefined' && scene && typeof scene.requestRender === 'function') {
      scene.requestRender();
    }
  });
}

// ── Control Cinemático de Cámara: Tri-Shield Prevención de Penetración en 3D Tiles ──
const sscc = scene.screenSpaceCameraController;
if (sscc) {
  // Cámara dron (Fase 4): la colisión estaba DESACTIVADA y el pivote podía atravesar
  // el terreno/3D Tiles → el usuario veía la malla desde abajo (backfaces).
  sscc.enableCollisionDetection = true;
  // Límite rasante: máximo 85.0° para impedir descender bajo el plano del pivote al orbitar
  sscc.maximumTiltAngle = (typeof Cesium !== 'undefined' && Cesium.Math) ? Cesium.Math.toRadians(85.0) : 1.4835;
  // Distancia mínima de seguridad para evitar que el near plane atraviese la malla al hacer zoom
  sscc.minimumZoomDistance = 8.0;
}

// ── Guardián Cinemático de Contacto Rígido Eliminado (Opción 1) ──

// -- Inicializar canvas de triada en el primer postRender (sin setTimeout, sin race condition)
// El listener se auto-elimina tras la primera ejecucion garantizando que
// el canvas existe antes del primer MOUSE_MOVE real del usuario.
(function() {
  var _initTriadDone = false;
  var _initTriadRemove = null;
  function _initTriadOnce() {
    if (_initTriadDone) return;
    _initTriadDone = true;
    try { ensureTriadCanvas(); } catch(e) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(e, 'Entidad/Primitiva Cesium'); }
    try { initTriad3DEntities(); } catch(e) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(e, 'Entidad/Primitiva Cesium'); }
    if (_initTriadRemove) { _initTriadRemove(); _initTriadRemove = null; }
  }
  // scene.postRender.addEventListener devuelve una funcion de baja en Cesium >= 1.100
  _initTriadRemove = scene.postRender.addEventListener(_initTriadOnce);
})();

// ── Configuración Visual & Antialiasing ──────────────────────────────────
window._currentAntialiasingMode = 'off';

function setAntialiasingMode(mode) {
  if (typeof viewer === 'undefined' || !viewer || !viewer.scene) return;
  const scene = viewer.scene;
  // Registrar refs en namespace centralizado
  window.RA.viewer = viewer;
  window.RA.scene  = scene;
  window._currentAntialiasingMode = mode;

  const badge = document.getElementById('aa-status-badge');

  // Si el usuario fijó una escala personalizada con el slider, respetarla; si no, usar la del perfil
  const savedScale = parseFloat(localStorage.getItem('ra_custom_resolution_scale'));
  const targetScale = (!isNaN(savedScale) && savedScale >= 0.3 && savedScale <= 2.0)
    ? savedScale
    : (mode === 'ultra' ? Math.min(window.devicePixelRatio || 1.25, 1.5) : 1.0);

  if (typeof setResolutionScale === 'function') {
    setResolutionScale(targetScale, false);
  } else {
    viewer.resolutionScale = targetScale;
  }

  if (mode === 'off') {
    scene.fxaa = false;
    if (scene.postProcessStages && scene.postProcessStages.fxaa) {
      scene.postProcessStages.fxaa.enabled = false;
    }
    try { scene.msaaSamples = 1; } catch(e) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(e, 'Entidad/Primitiva Cesium'); }
    if (badge) badge.textContent = 'RENDIMIENTO';
    showToast('PERFIL GRÁFICO', 'Modo Rendimiento: SSE 24 · Sin AA.', 'info', 2000);
  } else if (mode === 'fxaa') {
    scene.fxaa = true;
    if (scene.postProcessStages && scene.postProcessStages.fxaa) {
      scene.postProcessStages.fxaa.enabled = true;
    }
    try { scene.msaaSamples = 1; } catch(e) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(e, 'Entidad/Primitiva Cesium'); }
    if (badge) badge.textContent = 'EQUILIBRADO';
    showToast('PERFIL GRÁFICO', 'Modo Equilibrado: SSE 16 · FXAA.', 'info', 2000);
  } else if (mode === 'msaa4') {
    scene.fxaa = true;
    if (scene.postProcessStages && scene.postProcessStages.fxaa) {
      scene.postProcessStages.fxaa.enabled = true;
    }
    try { scene.msaaSamples = 4; } catch(e) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(e, 'Entidad/Primitiva Cesium'); }
    if (badge) badge.textContent = 'ALTA FIDELIDAD';
    showToast('PERFIL GRÁFICO', 'Alta Fidelidad (CAD): SSE 8 · MSAA 4x · Sin cortes.', 'success', 2000);
  } else if (mode === 'ultra') {
    scene.fxaa = true;
    if (scene.postProcessStages && scene.postProcessStages.fxaa) {
      scene.postProcessStages.fxaa.enabled = true;
    }
    try {
      scene.msaaSamples = 8;
    } catch(e) {
      try { scene.msaaSamples = 4; } catch(e2) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(e2, 'Entidad/Primitiva Cesium'); }
    }
    if (badge) badge.textContent = 'ULTRA HD';
    showToast('PERFIL GRÁFICO', 'Ultra HD: SSE 4 (Máxima Fotogrametría) · MSAA 8x.', 'success', 2500);
  }

  // <i data-lucide=\"rocket\" class=\"icon-sm\"></i> Sincronización dinámica de Fidelidad y Densidad Geométrica 3D Tiles
  const targetTileset = (typeof google3DTileset !== 'undefined' && google3DTileset) ? google3DTileset : (window.google3DTileset || null);
  if (targetTileset) {
    try {
      if (mode === 'off') {
        targetTileset.maximumScreenSpaceError = 24;
        targetTileset.maximumMemoryUsage = 1024;
        targetTileset.skipLevelOfDetail = true;
        targetTileset.loadSiblings = false;
        targetTileset.cullRequestsWhileMoving = true;
      } else if (mode === 'fxaa') {
        targetTileset.maximumScreenSpaceError = 16;
        targetTileset.maximumMemoryUsage = 1536;
        targetTileset.skipLevelOfDetail = true;
        targetTileset.loadSiblings = false;
        targetTileset.cullRequestsWhileMoving = true;
      } else if (mode === 'msaa4') {
        targetTileset.maximumScreenSpaceError = 8; // x3 densidad geométrica para cubiertas limpias
        targetTileset.maximumMemoryUsage = 2048;
        targetTileset.skipLevelOfDetail = false; // Elimina polígonos faltantes y grietas al orbitar
        targetTileset.loadSiblings = true;       // Descarga bloques adyacentes continuos
        targetTileset.cullRequestsWhileMoving = false; // No cancela mallas en movimiento
      } else if (mode === 'ultra') {
        targetTileset.maximumScreenSpaceError = 4; // Máxima resolución fotogramétrica de Google
        targetTileset.maximumMemoryUsage = 3072;
        targetTileset.skipLevelOfDetail = false;
        targetTileset.loadSiblings = true;
        targetTileset.cullRequestsWhileMoving = false;
      }
    } catch(eTiles) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(eTiles, 'Tileset Fidelity Sync Error'); }
  }

  ['off', 'fxaa', 'msaa4', 'ultra'].forEach(m => {
    const btn = document.getElementById('opt-aa-' + m);
    if (btn) btn.classList.toggle('active', m === mode);
  });

  if (typeof scene.requestRender === 'function') {
    scene.requestRender();
  }
}

// ── Control dinámico de escala de resolución WebGL (GPU Fill-Rate Optimizer) ──
function setResolutionScale(val, savePreference = true) {
  val = parseFloat(val);
  if (isNaN(val) || val < 0.3 || val > 2.0) val = 1.0;
  
  if (typeof viewer !== 'undefined' && viewer) {
    viewer.resolutionScale = val;
    if (viewer.scene && typeof viewer.scene.requestRender === 'function') {
      viewer.scene.requestRender();
    }
  }

  // Actualizar UI del slider y valor de texto
  const slider = document.getElementById('resolution-scale-slider');
  if (slider && parseFloat(slider.value) !== val) slider.value = val;

  const valEl = document.getElementById('resolution-scale-val');
  if (valEl) {
    const pct = Math.round(val * 100);
    valEl.textContent = pct + '% (' + val.toFixed(2) + 'x)';
    if (val < 0.8) {
      valEl.style.color = '#38bdf8'; // Rendimiento
    } else if (val <= 1.05) {
      valEl.style.color = '#4ade80'; // Balance / Nativo
    } else {
      valEl.style.color = '#f59e0b'; // Super-sampling
    }
  }

  if (savePreference) {
    try {
      localStorage.setItem('ra_custom_resolution_scale', val.toString());
    } catch(e) {}
  }
}
window.setResolutionScale = setResolutionScale;

// Inicializar en MODO RENDIMIENTO (MSAA 1x, sin atmósfera, sombra optimizada)
try {
  scene.msaaSamples = 1;
} catch(eMsaa) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(eMsaa, 'Entidad/Primitiva Cesium'); }
scene.fxaa = true;
globe.show = true;
globe.enableLighting = false;
globe.showWaterEffect = true;
globe.depthTestAgainstTerrain = true;
// Sombra: desactivada completamente para máximo rendimiento GPU
globe.shadows = (window.ShadowSettings && !window.ShadowSettings.getSettings().terrainShadows) ? Cesium.ShadowMode.RECEIVE_ONLY : Cesium.ShadowMode.ENABLED;
scene.pickTranslucentDepth = false;
globe.baseColor = Cesium.Color.fromCssColorString('#14213d');
scene.fog.enabled = true;
scene.fog.density = 0.0003;  // Factor aumento para descarte de teselas lejanas
// SkyBox Esférico Topocéntrico Analítico AAA (Opción A: Cero costuras & Luz Diurna Pura)
try {
  scene.skyBox = createProceduralSkybox('day');
  if (scene.skyBox) scene.skyBox.show = true;
} catch(eSky) {
  if (typeof RA !== 'undefined' && RA.log) RA.log.warn('No se pudo inicializar procedural skyBox:', eSky);
}
scene.skyAtmosphere.show = true;
scene.skyAtmosphere.atmosphereLightIntensity = 2.5;
if (scene.moon) scene.moon.show = false;
if (globe) {
  globe.showGroundAtmosphere = true;
}
scene.backgroundColor = Cesium.Color.fromCssColorString('#0284c7');

// Vista inicial: Barcelona a 135 m elipsoidales (~45-50 m sobre cubiertas; el terreno+geoide ronda 62 m y edificios ~85-90 m)
camera.setView({
  destination : Cesium.Cartesian3.fromDegrees(2.1734, 41.3851, 135),
  orientation : {
    heading: Cesium.Math.toRadians(30),
    pitch  : Cesium.Math.toRadians(-35),
    roll   : 0
  },
});

// ── Variables de Capas y Primitivas ────────────────────────────────────────
window.currentEngine = window.currentEngine || 'google';
window.google3DTileset = window.google3DTileset || null;
window.cesiumOsmBuildings = window.cesiumOsmBuildings || null;
window.cesiumTerrainProvider = window.cesiumTerrainProvider || null;

// [DELEGACIÓN MODULAR AAA]: switchEngine, attachTilesetLoadMonitor, loadGoogle3D, loadCesium3D y loadArcGIS3D residen en js/viewer.js.

const _initNow = new Date();
const _initMonth = _initNow.getMonth(); // 0=Ene ... 11=Dic (Mes actual real)
const _rawInitHour = _initNow.getHours() + _initNow.getMinutes() / 60; // Hora actual real
// Acotamos en rango diurno de 6.00h a 20.00h para visualización solar realista
const _initHourFloat = Math.max(6.0, Math.min(20.0, Math.round(_rawInitHour * 100) / 100));

window.solarSimState = window.solarSimState || {};
Object.assign(window.solarSimState, {
  monthIdx: _initMonth,
  hourFloat: _initHourFloat,
  isPlaying: false,
  speed: 1.0,
  animTimer: null,
  dynamicShadowEntities: [],
  mlpeBadgeEntities: [],
  panelShadowOverlayEntities: []
});

const SOLAR_MONTH_DAYS = [15, 45, 75, 105, 135, 165, 198, 228, 258, 288, 318, 355];
const SOLAR_MONTH_NAMES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const SOLAR_SEASONS = [
  "INVIERNO", "INVIERNO", "EQUINOCCIO PRIMAVERA", "PRIMAVERA", "PRIMAVERA", "SOLSTICIO VERANO",
  "VERANO", "VERANO", "EQUINOCCIO OTOÑO", "OTOÑO", "OTOÑO", "SOLSTICIO INVIERNO"
];

// [DEDUP] wpComputeInstantSolarPosition -> solar-engine.js

// [DEDUP] wpSyncCesiumSun -> solar-engine.js

// [DEDUP] wpRenderDynamicObstacleShadows -> solar-engine.js

// El motor de simulación solar se encuentra unificado en la sección de análisis solar

// ── Iniciar Aplicación y Monitor de Vuelo ───────────────────────────────────
window._isCameraMoving = false;
camera.moveStart.addEventListener(() => {
  window._isCameraMoving = true;
});

camera.moveEnd.addEventListener(() => {
  window._isCameraMoving = false;
});

(async () => {
  setLoad(35, 'Iniciando conexión satelital...');
  await switchEngine('google');
  if (typeof setAntialiasingMode === 'function') {
    setAntialiasingMode(window._currentAntialiasingMode || 'fxaa'); // fxaa por defecto: imagen más limpia sin coste notable
  }
  setLoad(100, 'Modelos 3D Listos');
  setTimeout(() => {
    hideLoading();
  }, 800);
})();

// ============================================================================
// SISTEMA DE GEOMETRÍA Y EDICIÓN 3D
// ============================================================================
window.appMode = window.appMode || 'navigate'; // Modo activo para interacción en visor: 'navigate' por defecto

function setAppMode(mode) {
  window.appMode = mode || 'navigate';
}
window.setAppMode = setAppMode;

// [AAA] `buildings` y `selectedBuildingId` se aseguran en el scope global y en window
// para que el renderizado y la carga de proyectos nunca encuentren valores indefinidos.
window.buildings = (typeof window.buildings !== 'undefined' && Array.isArray(window.buildings)) ? window.buildings : [];
var selectedBuildingId = null;
window.selectedBuildingId = null;

window.polygonPoints = Array.isArray(window.polygonPoints) ? window.polygonPoints : [];       // Array de Cesium.Cartesian3
var isPolygonDesignConfirmed = false; // Flag de confirmación del diseño
var wpCurrentStep = 1;              // Paso activo del flujo de trabajo (1 a 5). Única declaración global — NO redeclarar en js/
window.isPolygonDesignConfirmed = false;
window.wpCurrentStep = 1;
window.selectedVertexIndex = (typeof window.selectedVertexIndex === 'number') ? window.selectedVertexIndex : -1; // Vértice seleccionado
var floatingPoint = null;     // Cursor flotante
var isDraggingGizmo = false;
var activeGizmoAxis = null;
var dragStartMouse = null;
var dragStartCartesian = null;

window.activeShapeEntity = window.activeShapeEntity || null;
var vertexEntities = [];
var gizmoEntities = [];
var cursorMarkerEntity = null;

// Entidades de la Simulación Fotovoltaica
var simulatedPanelEntities = [];
var simulatedPanels = [];
var simulatedStringEntities = [];
var simulationTimeouts = [];
function stopSimulationTimeouts() {
  if (Array.isArray(simulationTimeouts)) {
    simulationTimeouts.forEach(t => clearTimeout(t));
    simulationTimeouts = [];
  }
}
window.stopSimulationTimeouts = stopSimulationTimeouts;
var isSimulationRunning = false;

// Elementos de UI
const configPanel    = document.getElementById('ra-config-panel');
const budgetPanel    = document.getElementById('ra-budget-panel');

// [ARQ-01] SSOT única: window.panelConfig (inicializado en config.js y sincronizado con catálogo)
window.panelConfig = window.panelConfig || {
  modelo: 'Tier 1 Mono PERC 450W',
  tecnologia: 'Monocristalino',
  largo: 2.10,
  ancho: 1.05,
  potencia: 450,
  rendimiento: 21.5,
  precio: 135
};
var panelConfig = window.panelConfig;


// ── Orientación exacta del módulo (ángulo libre) ─────────────────────────────
function toggleModuleAzimuthCustom() {
  const sel = document.getElementById('cfg-mod-azimuth');
  const inp = document.getElementById('cfg-mod-azimuth-custom');
  if (sel && inp) inp.style.display = sel.value === 'custom' ? 'inline-block' : 'none';
}

function getModuleAzimuthSur() {
  const sel = document.getElementById('cfg-mod-azimuth');
  const val = sel ? sel.value : 'auto';
  if (val === 'custom') {
    const inp = document.getElementById('cfg-mod-azimuth-custom');
    const a = parseFloat(inp ? inp.value : '');
    return Number.isFinite(a) ? String(((a % 360) + 360) % 360) : 'auto';
  }
  return val;
}

function updateConfigAndSimulate() {
  toggleModuleAzimuthCustom();
  const larEl = document.getElementById('cfg-largo');
  const ancEl = document.getElementById('cfg-ancho');
  const potEl = document.getElementById('cfg-pot');
  const renEl = document.getElementById('cfg-rend');
  const preEl = document.getElementById('cfg-precio');
  if (larEl) panelConfig.largo = Math.max(parseFloat(larEl.value) || 2.10, 0.4);
  if (ancEl) panelConfig.ancho = Math.max(parseFloat(ancEl.value) || 1.05, 0.3);
  if (potEl) panelConfig.potencia = Math.max(parseFloat(potEl.value) || 450, 50);
  if (renEl) panelConfig.rendimiento = Math.max(parseFloat(renEl.value) || 21.5, 1);
  if (preEl) panelConfig.precio = Math.max(parseFloat(preEl.value) || 135, 0);

  if (typeof roofPanelsCache !== 'undefined' && roofPanelsCache) {
    roofPanelsCache.sig = "";
  }

  const hasPolys = typeof WP !== 'undefined' && WP && WP.polylines && WP.polylines.length > 0;
  if (hasPolys) {
    WP.polylines.forEach(poly => {
      poly.roofInfo = computeSinglePolylineRoofInfo(poly.points, poly);
    });
    wpFastRenderSimulatedPanels();
    wpUpdateSolarSimulation();
    wpUpdateStep3UI();
  } else if (polygonPoints && polygonPoints.length >= 3) {
    recalculateSolarYield();
    wpFastRenderSimulatedPanels();
    wpUpdateSolarSimulation();
  }
}


// ============================================================================
// SUITE FINANCIERA & PRESUPUESTOS EPC AVANZADA (RD 244/2019 · IBI · IRPF · VAN)
// ============================================================================


// ============================================================================
// MOTOR DE OBSTÁCULOS 3D, SOMBRAS, ASIGNACIÓN MLPE Y OBJETIVOS DE PROYECTO
// ============================================================================

window.obstacles = window.obstacles || [];
var obstacles = window.obstacles; // [{ id, name, type, u, v, w, l, h, rot, entity }]
window.selectedObstacleId = typeof window.selectedObstacleId !== 'undefined' ? window.selectedObstacleId : null;
var selectedObstacleId = window.selectedObstacleId;
var currentProjectGoal = 'max_prod';
var orthoLockActive = false;
window.magneticSnapActive = (typeof window.magneticSnapActive !== 'undefined') ? window.magneticSnapActive : true;
var shadingStrategy = 'mlpe'; // 'mlpe' (mitigar) o 'exclude' (omitir)
var layoutCandidates = []; // Array of evaluated multi-layout candidates
var selectedLayoutId = 'portrait_coplanar'; // Currently active layout
var lastRoofGeometry = null; // Cached roof geometry (ENU transform, local frame, poly2D, etc.)





function updateShadingStrategy() {
  const sel = document.getElementById('cfg-shading-strategy');
  if (sel) shadingStrategy = sel.value;
  window.shadingStrategy = shadingStrategy;
  if (window.solarProjectConfig) window.solarProjectConfig.shadingStrategy = shadingStrategy;
  // Sincronizar caché del módulo solar-engine (no puede leer esta variable local)
  if (typeof window.setShadingStrategy === 'function') {
    window.setShadingStrategy(shadingStrategy);
  }
  recalculateLayoutAndObstacles();
}

// [UNIFICACIÓN OBJETIVOS AAA]: applyProjectGoal ha sido consolidado en step4ApplyFinancialProfile

// [DELEGACIÓN MODULAR AAA]: Las funciones de plano activo de obstáculos y gizmo 2D residen en js/obstacles.js.

// ═══════════════════════════════════════════════════════════════════════
// GESTIÓN Y EDICIÓN INTERACTIVA DE HUELLA DE EDIFICIOS 3D (CAD-GRADE)
// ═══════════════════════════════════════════════════════════════════════
// [DELEGACIÓN MODULAR AAA]: Gestión y edición interactiva de huellas de edificios 3D residen en js/building-footprint-cad.js

// [DELEGACIÓN MODULAR AAA]: Renderizado 3D de obstáculos, sombras y manipulación residen en js/obstacles.js.

function updateStructureCost() {
  const tipo = (document.getElementById('cfg-tipo-est') || {value:'coplanar_teja'}).value;
  const numPanels = getProjectCalcs().numPanels || 18;
  const estInput = document.getElementById('cfg-pres-est');
  if (!estInput) return;

  if (tipo === 'coplanar_teja') {
    estInput.value = numPanels * 45;
  } else if (tipo === 'sandwich') {
    estInput.value = numPanels * 35;
  } else if (tipo === 'triangulos') {
    estInput.value = numPanels * 65;
  }
}

function updateBatteryCost() {
  const batOptEl = document.getElementById('modal-cfg-pres-bat-opt') || document.getElementById('cfg-pres-bat-opt') || {value:'0'};
  const optVal = batOptEl.value;
  const rowBat = document.getElementById('modal-row-bat-cost') || document.getElementById('row-bat-cost');
  const batInput = document.getElementById('modal-cfg-pres-bat') || document.getElementById('cfg-pres-bat');
  const invInput = document.getElementById('modal-cfg-pres-inv') || document.getElementById('cfg-pres-inv');

  if (optVal === 'custom') {
    if (rowBat) rowBat.style.display = 'flex';
    // Mantiene el precio del catálogo o cálculo actual del diseño
    const cat = (typeof window !== 'undefined' && window.equipmentCatalog) ? window.equipmentCatalog : null;
    const cfg = (typeof window !== 'undefined' && window.solarProjectConfig) ? window.solarProjectConfig : null;
    if (cat && cfg && cfg.selectedBatteryId && cfg.selectedBatteryId !== 'bat_none') {
      const bSpec = (cat.batteries || []).find(b => b.id === cfg.selectedBatteryId);
      if (bSpec && bSpec.price > 0) {
        const bCnt = Math.max(1, (cfg.autoSizing && cfg.autoSizing.batteries && cfg.autoSizing.batteries.count) || 1);
        if (batInput) batInput.value = Math.round(bSpec.price * bCnt);
      }
    }
  } else {
    const cap = parseFloat(optVal) || 0;
    if (cap > 0) {
      if (rowBat) rowBat.style.display = 'flex';
      const cost = cap === 5 ? 2400 : (cap === 10 ? 4200 : 6100);
      if (batInput) batInput.value = cost;
      if (invInput && parseFloat(invInput.value) < 1600) invInput.value = 1650;
    } else {
      if (rowBat) rowBat.style.display = 'none';
      if (batInput) batInput.value = 0;
    }
  }
  if (typeof syncCostModalMetrics === 'function') syncCostModalMetrics();
}


// ── GESTIÓN Y SINCRONIZACIÓN DE CONSUMO / FACTURA DEL CLIENTE ──
function toggleConsumptionInputMode() {
  const modeEl = document.getElementById('fin-input-mode');
  const mode = modeEl ? modeEl.value : 'factura';
  const rowFact = document.getElementById('row-input-factura');
  const rowKwh = document.getElementById('row-input-kwh');
  if (rowFact && rowKwh) {
    if (mode === 'factura') {
      rowFact.style.opacity = '1';
      rowKwh.style.opacity = '0.7';
    } else {
      rowFact.style.opacity = '0.7';
      rowKwh.style.opacity = '1';
    }
  }
}

function syncConsumptionFromBill() {
  const factInput = document.getElementById('cfg-pres-factura-mes');
  const factMes = parseFloat(factInput ? factInput.value : '125') || 125;
  const factEnergiaAnual = Math.max(100, (factMes - 22) * 12 / 1.26);
  const consumoKWh = Math.round(factEnergiaAnual / 0.18);

  const kwhInput = document.getElementById('cfg-pres-consumo-anual');
  if (kwhInput && document.activeElement !== kwhInput) {
    kwhInput.value = consumoKWh;
  }
}

function syncBillFromConsumption() {
  const kwhInput = document.getElementById('cfg-pres-consumo-anual');
  const consumoKWh = parseFloat(kwhInput ? kwhInput.value : '5450') || 5450;
  const factEst = Math.round(((consumoKWh * 0.18 / 12) * 1.26 + 22));

  const factInput = document.getElementById('cfg-pres-factura-mes');
  if (factInput && document.activeElement !== factInput) {
    factInput.value = factEst;
  }
}

// [ARQUITECTURA AAA] calculateFinancialModel delegada al módulo js/financials.js


function switchCostesSubtab(subtab) {
  const btnEstudio = document.getElementById('btn-subtab-estudio');
  const btnBranding = document.getElementById('btn-subtab-branding');
  const viewEstudio = document.getElementById('costes-view-estudio');
  const viewBranding = document.getElementById('costes-view-branding');

  if (btnEstudio && btnBranding && viewEstudio && viewBranding) {
    if (subtab === 'branding') {
      btnBranding.classList.add('active');
      btnEstudio.classList.remove('active');
      viewBranding.style.display = 'flex';
      viewEstudio.style.display = 'none';
    } else {
      btnEstudio.classList.add('active');
      btnBranding.classList.remove('active');
      viewEstudio.style.display = 'flex';
      viewBranding.style.display = 'none';
    }
  }
}


// ── SINCRONIZACIÓN DE CONSUMO EN PASO 3 (DISEÑO & ANÁLISIS) ──
function wpToggleStep3ExtraBillFields() {
  const el = document.getElementById('step3-bill-extra-fields');
  const btn = document.getElementById('btn-toggle-step3-extra-bill');
  if (!el) return;
  const isHidden = (el.style.display === 'none' || !el.style.display);
  el.style.display = isHidden ? 'flex' : 'none';
  if (btn) btn.textContent = isHidden ? '▴ Menos' : '▾ Más';
}

function wpSyncStep3BillFromMonth(val) {
  const costMonth = parseFloat(val) || 0;
  const priceKwhEl = document.getElementById('step3-bill-price-kwh');
  const priceKwh = priceKwhEl ? (parseFloat(priceKwhEl.value) || 0.18) : 0.18;
  const potEl = document.getElementById('step3-bill-pot-contr');
  const pot = potEl ? (parseFloat(potEl.value) || 5.75) : 5.75;
  const termPotMes = pot * 3.3; // Estimación término de potencia mensual con peajes e impuestos

  const energyCostYear = Math.max(0, (costMonth - termPotMes) * 12 / 1.26); // deducción IVA e impuestos
  const calcKwh = Math.round(energyCostYear / priceKwh) || Math.round(costMonth * 40);

  const kwhInput = document.getElementById('step3-bill-kwh-year');
  if (kwhInput && document.activeElement !== kwhInput) {
    kwhInput.value = calcKwh;
  }

  // Sincronizar en el modelo SSOT
  wpPersistStep3BillData(costMonth, calcKwh, pot, priceKwh);
}

function wpSyncStep3BillFromKwh(val) {
  const kwh = parseFloat(val) || 0;
  const priceKwhEl = document.getElementById('step3-bill-price-kwh');
  const priceKwh = priceKwhEl ? (parseFloat(priceKwhEl.value) || 0.18) : 0.18;
  const potEl = document.getElementById('step3-bill-pot-contr');
  const pot = potEl ? (parseFloat(potEl.value) || 5.75) : 5.75;
  const termPotMes = pot * 3.3;

  const energyCostYear = kwh * priceKwh;
  const costMonth = Math.round(((energyCostYear / 12) * 1.26 + termPotMes));

  const monthInput = document.getElementById('step3-bill-cost-month');
  if (monthInput && document.activeElement !== monthInput) {
    monthInput.value = costMonth;
  }

  // Sincronizar en el modelo SSOT
  wpPersistStep3BillData(costMonth, kwh, pot, priceKwh);
}

function wpSyncStep3BillParams() {
  const monthInput = document.getElementById('step3-bill-cost-month');
  const kwhInput = document.getElementById('step3-bill-kwh-year');
  const potEl = document.getElementById('step3-bill-pot-contr');
  const priceKwhEl = document.getElementById('step3-bill-price-kwh');

  const costMonth = monthInput ? (parseFloat(monthInput.value) || 125) : 125;
  const kwh = kwhInput ? (parseFloat(kwhInput.value) || 5450) : 5450;
  const pot = potEl ? (parseFloat(potEl.value) || 5.75) : 5.75;
  const priceKwh = priceKwhEl ? (parseFloat(priceKwhEl.value) || 0.18) : 0.18;

  wpPersistStep3BillData(costMonth, kwh, pot, priceKwh);
}

function wpPersistStep3BillData(costMonth, kwh, pot, priceKwh) {
  if (!window.solarProjectConfig) window.solarProjectConfig = {};
  window.solarProjectConfig.manualAnnualConsumptionKWh = kwh;
  window.solarProjectConfig.billCostMonth = costMonth;

  // Sincronizar inputs de Paso 5 si existen
  const p5Kwh = document.getElementById('cfg-pres-consumo-anual');
  if (p5Kwh && document.activeElement !== p5Kwh) p5Kwh.value = Math.round(kwh);
  const p5Month = document.getElementById('cfg-pres-factura-mes');
  if (p5Month && document.activeElement !== p5Month) p5Month.value = Math.round(costMonth);

  // Sincronizar modal de precios/pricing si existen
  const prConsumo = document.getElementById('pricing-cust-consumo');
  if (prConsumo && document.activeElement !== prConsumo) prConsumo.value = Math.round(kwh);
  const prPot = document.getElementById('pricing-cust-potcontr');
  if (prPot && document.activeElement !== prPot) prPot.value = pot.toFixed(2);
  const prPrecio = document.getElementById('pricing-cust-precio-kwh');
  if (prPrecio && document.activeElement !== prPrecio) prPrecio.value = priceKwh.toFixed(3);

  // Sincronizar objeto canónico BillAuditor
  if (window.RA && window.RA.billAuditor) {
    if (!window.RA.billAuditor.comparison) window.RA.billAuditor.comparison = {};
    window.RA.billAuditor.comparison.consumoAnualKWh = kwh;
    window.RA.billAuditor.comparison.gastoMensualActualEUR = costMonth;
    window.RA.billAuditor.comparison.potenciaContratadaP1 = pot;
    window.RA.billAuditor.comparison.precioMedioKWh = priceKwh;

    const cupsEl = document.getElementById('step3-bill-cups');
    if (cupsEl && cupsEl.value.trim()) window.RA.billAuditor.comparison.cups = cupsEl.value.trim();
    const titEl = document.getElementById('step3-bill-titular');
    if (titEl && titEl.value.trim()) window.RA.billAuditor.comparison.titular = titEl.value.trim();
  }

  // Refrescar tarjetas de estrategia comercial y balance financiero
  if (typeof wpUpdateCommercialPathsUI === 'function') wpUpdateCommercialPathsUI();
}

function wpPopulateStep3BillFromSSOT() {
  const mInput = document.getElementById('step3-bill-cost-month');
  const kInput = document.getElementById('step3-bill-kwh-year');
  const pInput = document.getElementById('step3-bill-pot-contr');
  const prInput = document.getElementById('step3-bill-price-kwh');
  const cupsInput = document.getElementById('step3-bill-cups');
  const titInput = document.getElementById('step3-bill-titular');

  if (!mInput && !kInput) return;

  const comp = (window.RA && window.RA.billAuditor && window.RA.billAuditor.comparison) ? window.RA.billAuditor.comparison : null;
  const cfg = window.solarProjectConfig || {};

  let kwh = (comp && comp.consumoAnualKWh) || cfg.manualAnnualConsumptionKWh || 5450;
  let costMonth = (comp && comp.gastoMensualActualEUR) || cfg.billCostMonth || Math.round((kwh * 0.18 / 12) * 1.26 + 22);
  let pot = (comp && comp.potenciaContratadaP1) || 5.75;
  let priceKwh = (comp && comp.precioMedioKWh) || 0.18;
  let cups = (comp && comp.cups) || '';
  let titular = (comp && comp.titular) || '';

  if (mInput && document.activeElement !== mInput) mInput.value = Math.round(costMonth);
  if (kInput && document.activeElement !== kInput) kInput.value = Math.round(kwh);
  if (pInput && document.activeElement !== pInput) pInput.value = pot.toFixed(2);
  if (prInput && document.activeElement !== prInput) prInput.value = priceKwh.toFixed(3);
  if (cupsInput && cups) cupsInput.value = cups;
  if (titInput && titular) titInput.value = titular;
}
window.wpPopulateStep3BillFromSSOT = wpPopulateStep3BillFromSSOT;

/**
 * Consulta la API oficial de Red Eléctrica de España (REE / ESIOS)
 * y actualiza el precio medio del kWh con el PVPC oficial diario.
 */
async function wpFetchOfficialReePrice() {
  const icon = document.getElementById('step3-ree-refresh-icon');
  if (icon) icon.style.animation = 'spin 1s linear infinite';

  try {
    const today = new Date().toISOString().split('T')[0];
    const url = `https://apidatos.ree.es/es/datos/mercados/precios-mercados-tiempo-real?start_date=${today}T00:00&end_date=${today}T23:59&time_trunc=hour`;
    
    const resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    
    const pvpc = json.included && json.included.find(item => 
      (item.type && item.type.includes('PVPC')) || 
      (item.attributes && item.attributes.title && item.attributes.title.includes('PVPC'))
    );

    if (pvpc && Array.isArray(pvpc.attributes && pvpc.attributes.values) && pvpc.attributes.values.length > 0) {
      const vals = pvpc.attributes.values.map(v => v.value);
      const avgMwh = vals.reduce((sum, v) => sum + v, 0) / vals.length;
      const avgKwh = Math.round((avgMwh / 1000) * 10000) / 10000; // EUR/kWh
      
      const prInput = document.getElementById('step3-bill-price-kwh');
      if (prInput) {
        prInput.value = avgKwh.toFixed(4);
      }
      wpSyncStep3BillParams();

      if (typeof showToast === 'function') {
        showToast('PRECIO OFICIAL REE ACTUALIZADO', `PVPC medio hoy: ${avgKwh.toFixed(4)} €/kWh (${avgMwh.toFixed(1)} €/MWh s/ Red Eléctrica de España).`, 'success', 4000);
      } else if (typeof showStatus === 'function') {
        showStatus(`PVPC OFICIAL REE: ${avgKwh.toFixed(4)} €/kWh`, 3500);
      }
    } else {
      throw new Error('No se encontraron registros PVPC en la respuesta de REE');
    }
  } catch (err) {
    console.warn('[REE-Price] Error al consultar API oficial REE:', err);
    if (typeof showToast === 'function') {
      showToast('ERROR AL CONSULTAR REE', 'No se pudo conectar con la API de Red Eléctrica de España. Comprueba tu conexión a internet.', 'warning', 4000);
    }
  } finally {
    if (icon) icon.style.animation = '';
  }
}
window.wpFetchOfficialReePrice = wpFetchOfficialReePrice;








// ============================================================================

// GENERADOR DE PROPUESTA COMERCIAL & OFERTA ECONÓMICA EN PDF PARA CLIENTE
// ============================================================================

// [MODULARIZACION SSOT] Identidad corporativa, logotipo y branding delegados canónicamente a js/company-branding.js

// [ARQUITECTURA AAA] generatePropuestaComercialPDF delegada al módulo js/financials.js
const confirmBar    = document.getElementById('ra-confirm-bar');
const confirmMetaText = document.getElementById('confirm-meta-text');
const solarDash     = document.getElementById('ra-solar-dashboard');
const btnSolarToggle= document.getElementById('btn-solar-toggle');
const cursorTip     = document.getElementById('ra-cursor-tip') || document.getElementById('ra-3d-cursor-tip');
const containerEl   = document.getElementById('cesiumContainer');

// [B1] setElemText reside de forma canónica en js/working-plane.js

// ── Paleta unificada y fábricas de entidades Cesium ─────────────────────────
const UI_C = {
  amber: '#F7A520', orange: '#F59E0B', sky: '#38BDF8', blue: '#60A5FA',
  green: '#22C55E', emerald: '#10B981', rose: '#F43F5E', slate: '#64748B',
  white: '#FFFFFF', black: '#000000', red: '#EF4444'
};
function cesiumColor(hex, alpha) {
  const c = Cesium.Color.fromCssColorString(hex);
  return alpha !== undefined ? c.withAlpha(alpha) : c;
}
function cesiumMat(hex, alpha) {
  return new Cesium.ColorMaterialProperty(cesiumColor(hex, alpha));
}
function addPolylineEntity(positions, colorHex, width, depthAlpha, mainAlpha, id) {
  if (id && viewer && viewer.entities && viewer.entities.getById(id)) {
    viewer.entities.removeById(id);
  }
  const mat = (mainAlpha !== undefined ? cesiumMat(colorHex, mainAlpha) : cesiumMat(colorHex));
  // [ANTI-Z-FIGHTING AAA] Si la malla fotogramétrica 3D ocluye la línea por milímetros,
  // mostrar una línea continua visible con el mismo color y brillo (depthAlpha >= 0.85) en vez de trazo discontinuo tenue.
  const failAlpha = depthAlpha !== undefined ? Math.max(depthAlpha, 0.85) : 0.90;
  return viewer.entities.add({
    id: id,
    polyline: {
      positions: positions,
      width: width || 3.5,
      material: mat,
      clampToGround: false,
      arcType: (typeof Cesium !== "undefined" && Cesium.ArcType) ? Cesium.ArcType.NONE : undefined,
      shadows: (typeof Cesium !== "undefined" && Cesium.ShadowMode) ? Cesium.ShadowMode.DISABLED : 0
    }
  });
}
function addPointEntity(position, colorHex, pixelSize, outlineColorHex, outlineWidth, id) {
  if (id && viewer && viewer.entities && viewer.entities.getById(id)) {
    viewer.entities.removeById(id);
  }
  return viewer.entities.add({
    id: id,
    position: position,
    point: {
      pixelSize: pixelSize,
      color: cesiumColor(colorHex),
      outlineColor: cesiumColor(outlineColorHex || UI_C.black),
      outlineWidth: outlineWidth !== undefined ? outlineWidth : 2,
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    }
  });
}
// ── REGISTRO GLOBAL DE ETIQUETAS 2D SCREEN-SPACE (CERO Z-FIGHTING EN CESIUM) ──
window.labels2DRegistry = window.labels2DRegistry || [];

function addLabelEntity(position, text, pixelOffsetY, customOpts) {
  const id = 'lbl2d_' + Math.random().toString(36).substring(2, 9);
  const labelItem = {
    id: id,
    position: position, // Cartesian3 o función devolviendo Cartesian3
    text: text,
    pixelOffsetY: (pixelOffsetY !== undefined) ? pixelOffsetY : -18,
    opts: customOpts || {},
    show: true
  };
  window.labels2DRegistry.push(labelItem);

  // Devolver interfaz compatible con Cesium Entity para poder borrarla con viewer.entities.remove o labelEnt.show = false
  const pseudoEntity = {
    id: id,
    _is2DLabel: true,
    _labelItem: labelItem,
    get position() { return labelItem.position; },
    set position(v) { labelItem.position = v; },
    get show() { return labelItem.show; },
    set show(v) { labelItem.show = !!v; },
    label: {
      get text() { return labelItem.text; },
      set text(v) { labelItem.text = v; },
      get show() { return labelItem.show; },
      set show(v) { labelItem.show = !!v; }
    }
  };

  if (typeof window !== 'undefined') {
    window.LabelEntities = window.LabelEntities || [];
    window.LabelEntities.push(pseudoEntity);
  }
  return pseudoEntity;
}
window.addLabelEntity = addLabelEntity;

function removeLabel2DEntity(pseudoEntityOrId) {
  if (!pseudoEntityOrId) return;
  const id = typeof pseudoEntityOrId === 'string' ? pseudoEntityOrId : (pseudoEntityOrId.id || (pseudoEntityOrId._labelItem && pseudoEntityOrId._labelItem.id));
  if (!id) return;
  window.labels2DRegistry = (window.labels2DRegistry || []).filter(l => l.id !== id);
  if (window.LabelEntities) {
    window.LabelEntities = window.LabelEntities.filter(l => l.id !== id);
  }
}
window.removeLabel2DEntity = removeLabel2DEntity;

// Hook transparente en viewer.entities.remove para purga automática de etiquetas 2D
if (typeof viewer !== 'undefined' && viewer && viewer.entities && !viewer.entities._origRemoveHooked) {
  const _origRemove = viewer.entities.remove.bind(viewer.entities);
  viewer.entities.remove = function(entity) {
    if (entity && (entity._is2DLabel || entity._labelItem || (typeof entity.id === 'string' && entity.id.startsWith('lbl2d_')))) {
      removeLabel2DEntity(entity);
      return true;
    }
    return _origRemove(entity);
  };
  viewer.entities._origRemoveHooked = true;
}
// [ARCHITECT CLEANUP] addPolygonEntity unificada en el módulo CAD principal



function getRaw3DPosition(windowPosition) {
  if (!windowPosition || !scene) return null;

  // 0. PRIORITARIO: scene.pick() para identificar objeto + pickPosition sobre él
  try {
    const picked = scene.pick(windowPosition);
    if (Cesium.defined(picked)) {
      if (scene.pickPositionSupported) {
        const pos = scene.pickPosition(windowPosition);
        if (Cesium.defined(pos) && isFinite(pos.x) && isFinite(pos.y) && isFinite(pos.z)) {
          return pos;
        }
      }
    }
  } catch(e) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(e, 'Entidad/Primitiva Cesium'); }

  // 1. Deteccion fisica directa sobre la cara del 3D Tileset
  if (scene.pickPositionSupported) {
    try {
      const pos = scene.pickPosition(windowPosition);
      if (Cesium.defined(pos) && isFinite(pos.x) && isFinite(pos.y) && isFinite(pos.z)) return pos;
    } catch(e) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(e, 'Entidad/Primitiva Cesium'); }
  }

  // 2. Raycast matematico contra geometria 3D especifica
  const ray = (camera && camera.getPickRay) ? camera.getPickRay(windowPosition) : null;
  if (ray) {
    try {
      if (typeof scene.pickFromRay === "function") {
        const targets = [google3DTileset, cesiumOsmBuildings].filter(Boolean);
        if (targets.length > 0) {
          const hit = scene.pickFromRay(ray, targets);
          if (hit && Cesium.defined(hit.position) && isFinite(hit.position.x)) return hit.position;
        }
      }
    } catch(e) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(e, 'Entidad/Primitiva Cesium'); }

    // 3. Raycast contra el terreno/globo
    try {
      if (globe && globe.show) {
        const pos = scene.globe.pick(ray, scene);
        if (Cesium.defined(pos)) return pos;
      }
    } catch(e) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(e, 'Entidad/Primitiva Cesium'); }
  }

  // 4. Fallback: proyeccion sobre el elipsoide WGS84
  try {
    if (camera && camera.pickEllipsoid) {
      const ellipsoid = (scene.globe && scene.globe.ellipsoid) ? scene.globe.ellipsoid : (Cesium && Cesium.Ellipsoid ? Cesium.Ellipsoid.WGS84 : undefined);
      if (ellipsoid) {
        const pos = camera.pickEllipsoid(windowPosition, ellipsoid);
        if (pos && Cesium.defined(pos) && isFinite(pos.x)) return pos;
      }
    }
  } catch(e) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(e, 'Entidad/Primitiva Cesium'); }
  return null;
}

/**
 * Detección de superficie 3D con filtrado multi-muestreo espacial y rechazo bilateral de discontinuidades.
 * Suaviza el ruido de malla y teselación fotogramétrica de Google 3D Tiles promediando los vértices locales.
 */
let _lastSmooth3DPos = null;

function reset3DPositionCache() {
  _lastSmooth3DPos = null;
  if (window.RA && window.RA._pickPositionThrottle) {
    window.RA._pickPositionThrottle.lastPos = null;
    window.RA._pickPositionThrottle.lastTime = 0;
  }
}
window.reset3DPositionCache = reset3DPositionCache;

function get3DPosition(windowPosition, options = {}) {
  if (!windowPosition || !scene) return null;

  // 1. Fast-Path Analítico si estamos dibujando sobre un Plano de Trabajo Activo existente
  // Cero stalls de GPU (gl.readPixels), cálculo puramente algebraico CPU a 60 FPS
  if (typeof WP !== "undefined" && WP && WP.mode !== "define-plane" && WP.mode !== "draw-building" && WP.mode !== "idle" && (WP.mode === "draw-poly" || WP.mode === "draw-rect" || WP.mode === "place-obs")) {
    const activePl = (typeof wpGetActivePlane === "function") ? wpGetActivePlane() : null;
    if (activePl && activePl.normal && activePl.origin && typeof camera !== "undefined" && camera && camera.getPickRay) {
      try {
        const ray = camera.getPickRay(windowPosition);
        if (ray) {
          const hit = wpRayPlane(ray, activePl);
          if (hit && Cesium.defined(hit) && isFinite(hit.x)) {
            _lastSmooth3DPos = Cesium.Cartesian3.clone(hit);
            if (window.RA && window.RA._pickPositionThrottle) {
              window.RA._pickPositionThrottle.lastPos = Cesium.Cartesian3.clone(hit);
            }
            return hit;
          }
        }
      } catch(e) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(e, 'Entidad/Primitiva Cesium'); }
    }
  }

  // Throttle: limitar únicamente picks físicos directos de GPU (gl.readPixels)
  const now = performance.now();
  const throttle = window.RA._pickPositionThrottle;
  const isDirectAction = options && (options.raw || options.bypassThrottle);
  if (!isDirectAction && (now - throttle.lastTime < throttle.minDelta)) {
    if (_lastSmooth3DPos) return _lastSmooth3DPos;
    return null;
  }
  if (!isDirectAction) throttle.lastTime = now;

  // 2. Muestreo Físico Directo Rápido (1 Muestra con scene.pickPosition)
  const rawPos = getRaw3DPosition(windowPosition);
  if (!rawPos || !Cesium.defined(rawPos) || !isFinite(rawPos.x)) return null;
  
  throttle.lastPos = Cesium.Cartesian3.clone(rawPos);
  if (options && options.raw) return rawPos;

  // 3. Filtro Temporal Exponencial Antijitter (EMA - Suavidad Total)
  if (!_lastSmooth3DPos || Cesium.Cartesian3.distance(_lastSmooth3DPos, rawPos) > 5.0) {
    _lastSmooth3DPos = Cesium.Cartesian3.clone(rawPos);
  } else {
    // Factor de respuesta alfa = 0.85 (inmediato y sin micro-saltos)
    _lastSmooth3DPos = Cesium.Cartesian3.add(
      Cesium.Cartesian3.multiplyByScalar(rawPos, 0.85, new Cesium.Cartesian3()),
      Cesium.Cartesian3.multiplyByScalar(_lastSmooth3DPos, 0.15, new Cesium.Cartesian3()),
      new Cesium.Cartesian3()
    );
  }

  return _lastSmooth3DPos;
}

// ── Sincronización Visual ──────────────────────────────────────────────────
function updateAllVisuals() {
  if (activeShapeEntity) {
    viewer.entities.remove(activeShapeEntity);
    activeShapeEntity = null;
  }

  const wpManaged = (typeof WP !== 'undefined' && WP && (WP.mode === 'draw-poly' || (WP.polylines && WP.polylines.length > 0)));

  if (!wpManaged && polygonPoints.length >= 2) {
    const isClosed = polygonPoints.length >= 3;
    const isDrawingMode = appMode === 'draw' || (typeof WP !== 'undefined' && WP && WP.mode === 'draw-poly');
    const pts = polygonPoints.slice();
    if (isDrawingMode && floatingPoint && polygonPoints.length > 0) {
      pts.push(floatingPoint);
    } else if (polygonPoints.length >= 3) {
      pts.push(polygonPoints[0]);
    }

    activeShapeEntity = viewer.entities.add({
      id: 'ra_active_shape',
      polyline: {
        positions: new Cesium.ConstantProperty(polygonPoints.length >= 2 ? pts : []),
        width: 4,
        material: new Cesium.ColorMaterialProperty(Cesium.Color.fromCssColorString('#F7A520')),
        // depthFailMaterial removed,
        clampToGround: false
      },
      polygon: isClosed ? {
        hierarchy: new Cesium.PolygonHierarchy(polygonPoints.length >= 3 ? polygonPoints : []),
        material: Cesium.Color.fromCssColorString('#F7A520').withAlpha(0.25),
        perPositionHeight: true
      } : undefined
    });
  }

  vertexEntities.forEach(e => viewer.entities.remove(e));
  vertexEntities = [];

  if (!wpManaged) {
    polygonPoints.forEach((pt, idx) => {
    const isSelected = idx === selectedVertexIndex && appMode === 'edit';
    const isFirst = idx === 0;

    const marker = addPointEntity(
      new Cesium.ConstantPositionProperty(polygonPoints[idx] || pt),
      isSelected ? UI_C.white : (isFirst ? '#FFD080' : UI_C.amber),
      isSelected ? 16 : (isFirst ? 13 : 10),
      UI_C.black,
      isSelected ? 4 : 2
    );
    marker.vertexIndex = idx;
    vertexEntities.push(marker);
  });
  }

  update3DGizmo();
  syncVertexCoordInputs();
  updateMetricsDisplay();
  recalculateSolarYield();
}

// ── Gizmo de Ejes 3D ───────────────────────────────────────────────────────
// Tríada compacta de manipulación de vértices: tamaño proporcional a la
// altitud de cámara (pequeña y manejable en cualquier escala de trabajo),
// asas grandes a tamaño fijo de pantalla y etiquetas X/Y/Z en las puntas.
function gizmoAxisLength() {
  const camH = camera.positionCartographic.height;
  return Math.max(2.4, Math.min(camH * 0.008, 40.0));
}

function update3DGizmo() {
  if (Array.isArray(gizmoEntities)) {
    gizmoEntities.forEach(e => {
      try { if (viewer && viewer.entities) viewer.entities.remove(e); } catch(_) {}
    });
    gizmoEntities = [];
  }
  // [SSOT §5 AGENTS.md] La manipulación de ejes e interacción en vértices la gestiona exclusivamente renderUniversalGizmo2D
}

function selectVertex(index) {
  if (index < 0 || index >= polygonPoints.length) return;
  selectedVertexIndex = index;
  setElemText('edit-selected-vertex-lbl', `#${index + 1} de ${polygonPoints.length}`);
  updateAllVisuals();
}





// ── Coordenadas globales X/Y/Z del vértice seleccionado ─────────────────
function syncVertexCoordInputs() {
  const xEl = document.getElementById('vtx-coord-x');
  const yEl = document.getElementById('vtx-coord-y');
  const zEl = document.getElementById('vtx-coord-z');
  if (!xEl || !yEl || !zEl) return;
  const has = selectedVertexIndex >= 0 && selectedVertexIndex < polygonPoints.length;
  [xEl, yEl, zEl].forEach(el => { el.disabled = !has; });
  if (has) {
    const p = polygonPoints[selectedVertexIndex];
    xEl.value = p.x.toFixed(3);
    yEl.value = p.y.toFixed(3);
    zEl.value = p.z.toFixed(3);
  } else {
    xEl.value = '';
    yEl.value = '';
    zEl.value = '';
  }
}





function deleteSelectedVertex() {
  if (selectedVertexIndex < 0 || selectedVertexIndex >= polygonPoints.length) return;
  polygonPoints.splice(selectedVertexIndex, 1);
  if (polygonPoints.length === 0) selectedVertexIndex = -1;
  else selectedVertexIndex = Math.min(selectedVertexIndex, polygonPoints.length - 1);
  updateAllVisuals();
  showStatus(`VÉRTICE ELIMINADO (${polygonPoints.length} RESTANTES)`, 2000);
}



function updateMetricsDisplay() {
  const count = polygonPoints.length;
  setElemText('brush-point-count', count + ' pts');
  setElemText('edit-total-vertices', count + ' pts');

  if (count === 0) {
    setElemText('brush-perimeter', '0.00 m');
    setElemText('brush-area', '—');
    setElemText('edit-total-perimeter', '0.00 m');
    setElemText('edit-total-area', '—');
    return;
  }

  let totalPerimeter = 0;
  for (let i = 0; i < count - 1; i++) {
    totalPerimeter += Cesium.Cartesian3.distance(polygonPoints[i], polygonPoints[i+1]);
  }
  if (count >= 3 && appMode !== 'draw') {
    totalPerimeter += Cesium.Cartesian3.distance(polygonPoints[count-1], polygonPoints[0]);
  } else if (appMode === 'draw' && floatingPoint) {
    totalPerimeter += Cesium.Cartesian3.distance(polygonPoints[count-1], floatingPoint);
  }

  const perimStr = totalPerimeter >= 1000 ? (totalPerimeter / 1000).toFixed(2) + ' km' : totalPerimeter.toFixed(1) + ' m';
  setElemText('brush-perimeter', perimStr);
  setElemText('edit-total-perimeter', perimStr);

  if (count >= 3) {
    const area = computeApproximateArea(polygonPoints);
    const areaStr = area >= 1000000 ? (area / 1000000).toFixed(2) + ' km²' : area.toFixed(1) + ' m²';
    setElemText('brush-area', areaStr);
    setElemText('edit-total-area', areaStr);
  } else {
    setElemText('brush-area', '—');
    setElemText('edit-total-area', '—');
  }
}

function computeApproximateArea(positions) {
  if (positions.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < positions.length; i++) {
    const j = (i + 1) % positions.length;
    area += (positions[i].x * positions[j].y - positions[j].x * positions[i].y);
  }
  return Math.abs(area) * 0.5;
}

// ── Confirmación de Diseño de Cubierta ─────────────────────────────────────
function confirmRoofDesignAndSimulate() {
  const confBar = document.getElementById('ra-confirm-bar');
  if (confBar) {
    confBar.style.display = 'none';
    confBar.classList.remove('open');
  }

  if (typeof WP !== 'undefined' && WP) {
    if (WP.mode === 'draw-poly' && WP.activePolyPts && WP.activePolyPts.length >= 3) {
      if (typeof wpCloseActivePolyline === 'function') wpCloseActivePolyline();
    }
    if (WP.polylines && WP.polylines.length > 0) {
      isPolygonDesignConfirmed = true;
      setAppMode('navigate');
      showStatus('<i data-lucide=\"check\" class=\"icon-sm\"></i> DISEÑO DE CUBIERTA CONFIRMADO', 3000);
      if (typeof wpGoToStep === 'function') wpGoToStep(2);
      return;
    }
  }

  if (polygonPoints.length < 3) {
    showStatus('EL POLÍGONO DEBE TENER AL MENOS 3 PUNTOS PARA SIMULAR', 2500);
    return;
  }

  isPolygonDesignConfirmed = true;
  setAppMode('navigate');

  showStatus('<i data-lucide=\"check\" class=\"icon-sm\"></i> DISEÑO DE CUBIERTA CONFIRMADO · INICIANDO SIMULACIÓN 3D', 3000);

  startSolarPanelsSimulation();
}

function triggerSimulationFromButton() {
  if (typeof WP !== 'undefined' && WP) {
    if (WP.activePolyline && WP.activePolyline.points && WP.activePolyline.points.length >= 3) {
      wpCloseActivePolyline();
    }
    if (WP.polylines && WP.polylines.length > 0) {
      const curIdx = (WP.selectedPolyIdx >= 0 && WP.selectedPolyIdx < WP.polylines.length) ? WP.selectedPolyIdx : 0;
      const poly = WP.polylines[curIdx];
      if (poly && poly.points && poly.points.length >= 3) {
        WP.selectedPolyIdx = curIdx;
        polygonPoints = poly.points.map(p => Cesium.Cartesian3.clone(p));
        isPolygonDesignConfirmed = true;
      }
    }
  }

  if (roofPanelsCache) roofPanelsCache.sig = "";

  const hasPolys = (typeof WP !== 'undefined' && WP && WP.polylines && WP.polylines.length > 0);
  const hasPts = (polygonPoints && polygonPoints.length >= 3);

  if (!hasPolys && !hasPts) {
    showStatus('DIBUJA UN POLÍGONO DE CUBIERTA PRIMERO (MÍNIMO 3 PUNTOS)', 3000);
    return;
  }

  if (typeof recalculateLayoutAndObstacles === 'function') recalculateLayoutAndObstacles();
  if (typeof startSolarPanelsSimulation === 'function') startSolarPanelsSimulation();
  else if (typeof wpFastRenderSimulatedPanels === 'function') wpFastRenderSimulatedPanels();
  if (typeof wpUpdateStep3UI === 'function') wpUpdateStep3UI();
  else if (typeof wpUpdateStep3UI === 'function') wpUpdateStep3UI();
}

function clearSimulatedPV() {
  if (typeof wpCleanupAllSolarPrimitives === 'function') wpCleanupAllSolarPrimitives();
  if (typeof viewer !== "undefined" && viewer && viewer.entities) {
    simulatedPanelEntities.forEach(e => {
      if (e && typeof e === 'object' && e._id) viewer.entities.remove(e);
    });
  }
  simulatedPanelEntities = [];

  if (window.simulatedPanelsPrimitive && typeof viewer !== "undefined" && viewer && viewer.scene && viewer.scene.primitives) {
    try {
      window.simulatedPanelsPrimitive.shadows = (typeof Cesium !== "undefined" && Cesium.ShadowMode) ? Cesium.ShadowMode.DISABLED : 0;
      viewer.scene.primitives.remove(window.simulatedPanelsPrimitive);
    } catch(e) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(e, 'Entidad/Primitiva Cesium'); }
    window.simulatedPanelsPrimitive = null;
  }
  if (window._faldonPanelsPrimitives && typeof viewer !== "undefined" && viewer && viewer.scene && viewer.scene.primitives) {
    window._faldonPanelsPrimitives.forEach(p => {
      if (p) {
        try {
          p.shadows = (typeof Cesium !== "undefined" && Cesium.ShadowMode) ? Cesium.ShadowMode.DISABLED : 0;
          viewer.scene.primitives.remove(p);
        } catch(e) {}
      }
    });
    window._faldonPanelsPrimitives.clear();
  }
  if (window._faldonSupportCollections && typeof viewer !== "undefined" && viewer && viewer.scene && viewer.scene.primitives) {
    window._faldonSupportCollections.forEach(sc => {
      if (sc) { try { viewer.scene.primitives.remove(sc); } catch(e) {} }
    });
    window._faldonSupportCollections.clear();
  }
  if (window._faldonPergolaPrimitives && typeof viewer !== "undefined" && viewer && viewer.scene && viewer.scene.primitives) {
    window._faldonPergolaPrimitives.forEach(p => {
      if (p) { try { viewer.scene.primitives.remove(p); } catch(e) {} }
    });
    window._faldonPergolaPrimitives.clear();
  }

  if (typeof viewer !== "undefined" && viewer && viewer.entities) {
    simulatedStringEntities.forEach(e => {
      if (e && typeof e === 'object' && e._id) viewer.entities.remove(e);
    });
  }
  simulatedStringEntities = [];

  if (window.simulatedStringsPolylineCollection && typeof viewer !== "undefined" && viewer && viewer.scene && viewer.scene.primitives) {
    try {
      viewer.scene.primitives.remove(window.simulatedStringsPolylineCollection);
    } catch(e) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(e, 'Entidad/Primitiva Cesium'); }
    window.simulatedStringsPolylineCollection = null;
  }

  if (window.simulatedSupportsPolylineCollection && typeof viewer !== "undefined" && viewer && viewer.scene && viewer.scene.primitives) {
    try {
      viewer.scene.primitives.remove(window.simulatedSupportsPolylineCollection);
    } catch(e) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(e, 'Entidad/Primitiva Cesium'); }
    window.simulatedSupportsPolylineCollection = null;
  }

  if (typeof wpCleanupPanelNumberLabels === "function") {
    wpCleanupPanelNumberLabels();
  } else if (window._panelNumberLabelCollection && typeof viewer !== "undefined" && viewer && viewer.scene && viewer.scene.primitives) {
    try {
      viewer.scene.primitives.remove(window._panelNumberLabelCollection);
    } catch(e) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(e, 'Entidad/Primitiva Cesium'); }
    window._panelNumberLabelCollection = null;
  }

  if (window._solarHeatmapLabelCollection && typeof viewer !== "undefined" && viewer && viewer.scene && viewer.scene.primitives) {
    try {
      viewer.scene.primitives.remove(window._solarHeatmapLabelCollection);
    } catch(e) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(e, 'Entidad/Primitiva Cesium'); }
    window._solarHeatmapLabelCollection = null;
  }

  selectedPanelIndex = -1;
  isDraggingPanel = false;
  if (typeof panelOutlineEntity !== "undefined" && panelOutlineEntity && typeof viewer !== "undefined" && viewer && viewer.entities) {
    viewer.entities.remove(panelOutlineEntity);
    panelOutlineEntity = null;
  }
  lastRoofInfo = null;
  panelsPristine = null;
  updatePanelSelectionUI();
}
window.clearSimulatedPV = clearSimulatedPV;

// ── EDICIÓN INDIVIDUAL DE PANELES FV (MODO EDITAR) ──────────────────────────
// Los paneles del montaje 3D se pueden seleccionar con clic, mover arrastrando
// sobre la cubierta y girar (vertical ⇄ horizontal). El CallbackProperty de la
// jerarquía de cada panel lee panelData.corners/center por referencia, por lo
// que mutarlos en sitio actualiza la entidad en tiempo real sin recrearla.
window.lastRoofInfo = window.lastRoofInfo || null;
var panelsPristine = null;
window.selectedPanelIndex = (typeof window.selectedPanelIndex === 'number') ? window.selectedPanelIndex : -1;
var isDraggingPanel = false;
var panelOutlineEntity = null;
var activePanelDragEntity = null;

function snapshotPanels(panels) {
  return panels.map(p => ({
    u: p.u, v: p.v, w: p.w, h: p.h,
    orientation: p.orientation,
    center: Cesium.Cartesian3.clone(p.center),
    corners: p.corners.map(c => Cesium.Cartesian3.clone(c))
  }));
}

function restorePanels(snapshot, panels) {
  panels.forEach((p, i) => {
    const s = snapshot[i];
    if (!s) return;
    p.u = s.u; p.v = s.v; p.w = s.w; p.h = s.h;
    p.orientation = s.orientation;
    Cesium.Cartesian3.clone(s.center, p.center);
    p.corners = s.corners.map(c => Cesium.Cartesian3.clone(c));
  });
}

function getPanelIndexFromPick(picked) {
  if (!picked) return -1;
  let id = null;
  if (typeof picked.id === 'string') {
    id = picked.id;
  } else if (picked.id && typeof picked.id.id === 'string') {
    id = picked.id.id;
  }

  const panelsList = (Array.isArray(window.allRenderedPanels) && window.allRenderedPanels.length > 0)
    ? window.allRenderedPanels
    : ((typeof lastRoofInfo !== 'undefined' && lastRoofInfo && lastRoofInfo.panels) ? lastRoofInfo.panels : null);

  // Verificación directa por referencia de objeto o pData
  if (picked.id && picked.id.pData && Array.isArray(panelsList)) {
    const directIdx = panelsList.indexOf(picked.id.pData);
    if (directIdx >= 0) return directIdx;
  }

  if (!id || typeof id !== 'string') return -1;
  if (id.indexOf("pv_panel_") !== 0) return -1;

  const rest = id.slice("pv_panel_".length);
  if (rest.startsWith("outline") || rest.startsWith("active_drag")) return -1;

  let resolvedIdx = -1;

  // 1. Formato de overlay de sombras del Heatmap: "pv_panel_shadow_overlay_polyIdx_layoutIdx"
  if (rest.startsWith("shadow_overlay_")) {
    const shadowParts = rest.slice("shadow_overlay_".length).split("_");
    if (shadowParts.length >= 2 && Array.isArray(panelsList)) {
      const polyIdx = parseInt(shadowParts[0], 10);
      const lIdx = parseInt(shadowParts[1], 10);
      if (!isNaN(polyIdx) && !isNaN(lIdx)) {
        const found = panelsList.findIndex(p => p && p.polyIdx === polyIdx && (p.layoutIndex === lIdx || p.localIdx === lIdx || p.pIdx === lIdx));
        if (found >= 0) resolvedIdx = found;
      }
    }
  } else if (rest.startsWith("tex_")) {
    const idx = parseInt(rest.slice("tex_".length), 10);
    if (!isNaN(idx) && idx >= 0) resolvedIdx = idx;
  } else if (rest.startsWith("instance_")) {
    const idx = parseInt(rest.slice("instance_".length), 10);
    if (!isNaN(idx) && idx >= 0) resolvedIdx = idx;
  } else if (rest.startsWith("pool_")) {
    const idx = parseInt(rest.slice("pool_".length), 10);
    if (!isNaN(idx) && idx >= 0) resolvedIdx = idx;
  } else {
    // Formato multi-faldón: "pv_panel_polyIdx_pIdx_..." o "pv_panel_pIdx"
    const parts = rest.split("_");
    if (parts.length >= 2 && Array.isArray(panelsList)) {
      const polyIdx = parseInt(parts[0], 10);
      const pIdx = parseInt(parts[1], 10);
      if (!isNaN(polyIdx) && !isNaN(pIdx)) {
        const found = panelsList.findIndex(p => p && p.polyIdx === polyIdx && (p.pIdx === pIdx || p.localIdx === pIdx || p.layoutIndex === pIdx));
        if (found >= 0) resolvedIdx = found;
        else resolvedIdx = pIdx;
      }
    }
    if (resolvedIdx < 0) {
      const idx = parseInt(rest, 10);
      if (!isNaN(idx) && idx >= 0 && panelsList && idx < panelsList.length) resolvedIdx = idx;
    }
  }

  if (resolvedIdx >= 0 && Array.isArray(panelsList) && panelsList[resolvedIdx]) {
    const p = panelsList[resolvedIdx];
    if (p.visible === false || p.deleted) return -1;
    if (typeof p.polyIdx === 'number' && typeof WP !== 'undefined' && WP && WP.polylines && WP.polylines[p.polyIdx]) {
      if (WP.polylines[p.polyIdx].panelsVisible === false) return -1;
    }
    return resolvedIdx;
  }
  return -1;
}

function pickPanelUnderCursor(screenPos, skipGpuPick) {
  if (!screenPos) return -1;
  const scene = (typeof viewer !== 'undefined' && viewer) ? viewer.scene : ((typeof window !== 'undefined' && window.viewer) ? window.viewer.scene : null);
  if (!scene) return -1;

  if (!skipGpuPick) {
    // 1. Detección rápida por scene.pick nativo de Cesium (solo en clic explícito)
    try {
      if (typeof scene.pick === 'function') {
        const picked = scene.pick(screenPos);
        const pIdx = getPanelIndexFromPick(picked);
        if (pIdx >= 0) return pIdx;
      }
    } catch(ePick) {}

    // 2. Detección profunda con drillPick (traspasa mallas de faldón wp_poly_fill, canalizaciones o sombras)
    try {
      if (typeof scene.drillPick === 'function') {
        const pickedList = scene.drillPick(screenPos, 15);
        if (Array.isArray(pickedList)) {
          for (let i = 0; i < pickedList.length; i++) {
            const pIdx = getPanelIndexFromPick(pickedList[i]);
            if (pIdx >= 0) return pIdx;
          }
        }
      }
    } catch(eDrill) {}
  }

  // 3. Fallback geométrico 2D exacto en pantalla con poda espacial por BoundingSphere de faldón (F1-06)
  const panelsList = (Array.isArray(window.allRenderedPanels) && window.allRenderedPanels.length > 0)
    ? window.allRenderedPanels
    : ((typeof lastRoofInfo !== 'undefined' && lastRoofInfo && lastRoofInfo.panels) ? lastRoofInfo.panels : null);

  if (Array.isArray(panelsList) && panelsList.length > 0 && typeof Cesium !== 'undefined' && Cesium.SceneTransforms) {
    let bestIdx = -1;
    let minCenterDist = Infinity;

    // Índice espacial ligero por faldón cacheado por generación de primitivas
    const curGen = (typeof window._raPrimitivesGeneration === 'number') ? window._raPrimitivesGeneration : 0;
    if (!window._raPanelSpatialIndex || window._raPanelSpatialIndex.gen !== curGen || window._raPanelSpatialIndex.len !== panelsList.length) {
      const groups = new Map();
      for (let gi = 0; gi < panelsList.length; gi++) {
        const gp = panelsList[gi];
        if (!gp || gp.visible === false || gp.deleted || !gp.center) continue;
        const fKey = (typeof gp.polyIdx === 'number') ? gp.polyIdx : -1;
        let grp = groups.get(fKey);
        if (!grp) { grp = { indices: [], centers: [] }; groups.set(fKey, grp); }
        grp.indices.push(gi);
        grp.centers.push(gp.center);
      }
      const buckets = [];
      groups.forEach((grp, fKey) => {
        const bs = Cesium.BoundingSphere.fromPoints(grp.centers);
        bs.radius += 2.5;
        buckets.push({ polyIdx: fKey, sphere: bs, indices: grp.indices });
      });
      window._raPanelSpatialIndex = { gen: curGen, len: panelsList.length, buckets };
    }

    const pickRay = (scene.camera && typeof scene.camera.getPickRay === 'function') ? scene.camera.getPickRay(screenPos) : null;
    const candidateIndices = [];
    const buckets = window._raPanelSpatialIndex.buckets;
    for (let bi = 0; bi < buckets.length; bi++) {
      const b = buckets[bi];
      if (b.polyIdx >= 0 && typeof WP !== 'undefined' && WP && WP.polylines && WP.polylines[b.polyIdx] && WP.polylines[b.polyIdx].panelsVisible === false) {
        continue;
      }
      if (pickRay && typeof Cesium.IntersectionTests !== 'undefined' && typeof Cesium.IntersectionTests.raySphere === 'function') {
        if (!Cesium.IntersectionTests.raySphere(pickRay, b.sphere)) continue;
      }
      for (let ki = 0; ki < b.indices.length; ki++) candidateIndices.push(b.indices[ki]);
    }

    // [OPTIMIZACIÓN AAA · O(1) EARLY REJECTION]: Comprobar centro primero antes de calcular 4 proyecciones de esquinas
    for (let ci = 0; ci < candidateIndices.length; ci++) {
      const i = candidateIndices[ci];
      const p = panelsList[i];
      if (!p || p.visible === false || p.deleted) continue;
      if (!p.corners || p.corners.length !== 4) continue;

      try {
        // Pre-filtro: Proyectar solo el centro. Si el ratón está a más de 80px en pantalla, descartar sin proyectar las 4 esquinas
        let scCenter = null;
        if (p.center) {
          scCenter = Cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, p.center);
          if (scCenter) {
            const d = Math.hypot(screenPos.x - scCenter.x, screenPos.y - scCenter.y);
            if (d > 80.0) continue; // Descarte temprano de alta velocidad
            if (d < 24.0 && d < minCenterDist) {
              minCenterDist = d;
              bestIdx = i;
            }
          }
        }

        const sc0 = Cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, p.corners[0]);
        const sc1 = Cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, p.corners[1]);
        const sc2 = Cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, p.corners[2]);
        const sc3 = Cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, p.corners[3]);

        if (sc0 && sc1 && sc2 && sc3) {
          const poly2D = [
            { u: sc0.x, v: sc0.y },
            { u: sc1.x, v: sc1.y },
            { u: sc2.x, v: sc2.y },
            { u: sc3.x, v: sc3.y }
          ];
          if (typeof isPointInPolygon2D === 'function' && isPointInPolygon2D({ u: screenPos.x, v: screenPos.y }, poly2D)) {
            return i;
          }
        }
      } catch(eProj) {}
    }

    if (bestIdx >= 0) return bestIdx;
  }

  return -1;
}
window.pickPanelUnderCursor = pickPanelUnderCursor;

function updatePanelSelectionUI() {
  const lbl = document.getElementById('panel-selected-lbl');
  // Preferir allRenderedPanels (multi-faldón instanciado) sobre lastRoofInfo.panels (legacy)
  const panelsArray = (window.allRenderedPanels && window.allRenderedPanels.length > 0)
    ? window.allRenderedPanels
    : (lastRoofInfo ? lastRoofInfo.panels : null);
  const panel = (selectedPanelIndex >= 0 && panelsArray) ? panelsArray[selectedPanelIndex] : null;

  const multiCount = (Array.isArray(window.selectedPanelIndices) && window.selectedPanelIndices.length > 1) 
    ? window.selectedPanelIndices.length 
    : 0;

  if (lbl) {
    if (multiCount > 1) {
      lbl.textContent = `${multiCount} MÓDULOS SELECCIONADOS · Shift+Clic sumar`;
      lbl.style.color = '#38BDF8';
    } else if (!panel) {
      lbl.textContent = 'NINGUNO';
      lbl.style.color = 'var(--text-slate-400)';
    } else {
      const rotLbl = panel.orientation === 'landscape' ? 'HORIZONTAL' : 'VERTICAL';
      lbl.textContent = `#${selectedPanelIndex + 1} · ${panel.w.toFixed(2)}×${panel.h.toFixed(2)} m · ${rotLbl}`;
      lbl.style.color = 'var(--amber-400)';
    }
  }

  if (!Array.isArray(window.panelOutlineEntities)) window.panelOutlineEntities = [];
  window.panelOutlineEntities.forEach(ent => {
    try { if (viewer && viewer.entities) viewer.entities.remove(ent); } catch(e) {}
  });
  window.panelOutlineEntities = [];

  if (panelOutlineEntity) {
    try { if (viewer && viewer.entities) viewer.entities.remove(panelOutlineEntity); } catch(e) {}
    panelOutlineEntity = null;
  }
  if (activePanelDragEntity && viewer) {
    try { viewer.entities.remove(activePanelDragEntity); } catch(e) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(e, 'Entidad/Primitiva Cesium'); }
    activePanelDragEntity = null;
  }

  const indicesToHighlight = (Array.isArray(window.selectedPanelIndices) && window.selectedPanelIndices.length > 0)
    ? window.selectedPanelIndices
    : (selectedPanelIndex >= 0 ? [selectedPanelIndex] : []);

  // [F1-07] Batched PolylineCollection única para contornos de selección multi-panel (0 entidades individuales)
  if (viewer && viewer.scene && viewer.scene.primitives && panelsArray) {
    if (!window._raPanelSelectionOutlineCollection || window._raPanelSelectionOutlineCollection.isDestroyed()) {
      window._raPanelSelectionOutlineCollection = viewer.scene.primitives.add(new Cesium.PolylineCollection());
    }
    const selCol = window._raPanelSelectionOutlineCollection;
    selCol.removeAll();
    if (indicesToHighlight.length > 0) {
      const matAnchor = Cesium.Material.fromType('Color', { color: Cesium.Color.fromCssColorString('#F7A520') });
      const matMulti = Cesium.Material.fromType('Color', { color: Cesium.Color.fromCssColorString('#38BDF8') });
      for (let hi = 0; hi < indicesToHighlight.length; hi++) {
        const pIdx = indicesToHighlight[hi];
        const p = panelsArray[pIdx];
        if (p && p.corners && p.corners.length === 4) {
          const isAnchor = (pIdx === selectedPanelIndex);
          selCol.add({
            positions: [p.corners[0], p.corners[1], p.corners[2], p.corners[3], Cesium.Cartesian3.clone(p.corners[0])],
            width: isAnchor ? 4 : 3,
            material: isAnchor ? matAnchor : matMulti
          });
        }
      }
      selCol.show = !(window.RACapture && window.RACapture.enabled);
    } else {
      selCol.show = false;
    }
    if (typeof viewer.scene.requestRender === 'function') viewer.scene.requestRender();
  }
}

function selectPanel(idx, isMulti = false) {
  if (!Array.isArray(window.selectedPanelIndices)) window.selectedPanelIndices = [];
  if (idx < 0) {
    selectedPanelIndex = -1;
    window.selectedPanelIndices = [];
  } else {
    const panelsList = (Array.isArray(window.allRenderedPanels) && window.allRenderedPanels.length > 0)
      ? window.allRenderedPanels
      : ((lastRoofInfo && lastRoofInfo.panels) ? lastRoofInfo.panels : null);
    if (panelsList && panelsList[idx]) {
      const p = panelsList[idx];
      if (p.visible === false) return;
      if (typeof p.polyIdx === 'number' && typeof WP !== 'undefined' && WP && WP.polylines && WP.polylines[p.polyIdx]) {
        if (WP.polylines[p.polyIdx].panelsVisible === false) return;
      }
    }
    if (isMulti) {
      const pos = window.selectedPanelIndices.indexOf(idx);
      if (pos >= 0) {
        window.selectedPanelIndices.splice(pos, 1);
      } else {
        window.selectedPanelIndices.push(idx);
      }
      selectedPanelIndex = window.selectedPanelIndices.length > 0 
        ? window.selectedPanelIndices[window.selectedPanelIndices.length - 1] 
        : -1;
    } else {
      window.selectedPanelIndices = [idx];
      selectedPanelIndex = idx;
    }
    if (typeof selectedObstacleId !== 'undefined') selectedObstacleId = null;
    if (typeof window !== 'undefined') window.selectedObstacleId = null;
    if (typeof selectedElectricalId !== 'undefined') selectedElectricalId = null;
    if (typeof window !== 'undefined') window.selectedElectricalId = null;
    if (typeof selectedBuildingId !== 'undefined') selectedBuildingId = null;
    if (typeof window !== 'undefined') window.selectedBuildingId = null;
  }
  if (typeof window !== 'undefined') window.selectedPanelIndex = selectedPanelIndex;
  updatePanelSelectionUI();
  if (typeof renderTriad2D === 'function') renderTriad2D();
}

function clearAllCADSelection(notify = false) {
  let hadAnySelection = false;

  // A. Placas FV (individuales o múltiples)
  if ((typeof selectedPanelIndex !== 'undefined' && selectedPanelIndex >= 0) || (Array.isArray(window.selectedPanelIndices) && window.selectedPanelIndices.length > 0)) {
    hadAnySelection = true;
    if (typeof selectPanel === 'function') selectPanel(-1);
    window.selectedPanelIndices = [];
    selectedPanelIndex = -1;
    if (typeof window !== 'undefined') window.selectedPanelIndex = -1;
    if (typeof updatePanelSelectionUI === 'function') updatePanelSelectionUI();
              if (typeof wpPopulateFaldonCard === 'function') wpPopulateFaldonCard();
  }

  // B. Obstáculos 3D
  if (typeof selectedObstacleId !== 'undefined' && selectedObstacleId) {
    hadAnySelection = true;
    if (typeof selectObstacle === 'function') selectObstacle(null);
    selectedObstacleId = null;
    if (typeof window !== 'undefined') window.selectedObstacleId = null;
    if (typeof render3DObstaclesInCesium === 'function') render3DObstaclesInCesium();
  }

  // C. Equipamiento Eléctrico 3D
  if (typeof selectedElectricalId !== 'undefined' && selectedElectricalId) {
    hadAnySelection = true;
    if (typeof selectElectricalObject === 'function') selectElectricalObject(null);
    selectedElectricalId = null;
    if (typeof window !== 'undefined') window.selectedElectricalId = null;
  }

  // D. Edificios 3D
  if (typeof selectedBuildingId !== 'undefined' && selectedBuildingId) {
    hadAnySelection = true;
    if (typeof selectBuilding === 'function') selectBuilding(null);
    selectedBuildingId = null;
    if (typeof window !== 'undefined') window.selectedBuildingId = null;
    if (typeof render3DBuildingsInCesium === 'function') render3DBuildingsInCesium();
  }

  // E. Vértices, faldones, gizmo de faldón o planos de trabajo
  if (typeof WP !== 'undefined' && WP) {
    const hadWpSel = (WP.selectedVtxIdx >= 0 || WP.selectedVertexIdx >= 0 || WP.selectedPolyIdx >= 0 || WP.movePolyGizmoIdx >= 0 || WP.selectedPlaneVtxIdx >= 0);
    if (hadWpSel) {
      hadAnySelection = true;
      WP.selectedVtxIdx = -1;
      WP.selectedVertexIdx = -1;
      WP.selectedPolyIdx = -1;
      WP.movePolyGizmoIdx = -1;
      WP.selectedPlaneVtxIdx = -1;
      if (typeof selectedVertexIndex !== 'undefined') selectedVertexIndex = -1;
      if (typeof wpSyncVertexInputs === 'function') wpSyncVertexInputs();
      if (typeof wpRenderAllPolylines === 'function') wpRenderAllPolylines();
      if (typeof wpUpdateUI === 'function') wpUpdateUI();
      if (typeof wpPopulateFaldonCard === 'function') wpPopulateFaldonCard();
    }
  }
  if (typeof bldFootprintState !== 'undefined' && bldFootprintState && bldFootprintState.selectedVtxIdx >= 0) {
    hadAnySelection = true;
    bldFootprintState.selectedVtxIdx = -1;
    if (typeof updateBuildingFootprintUI === 'function') updateBuildingFootprintUI();
  }

  // F. Gizmo Universal y Tríada 2D
  if (typeof universalGizmoState !== 'undefined' && universalGizmoState) {
    if (universalGizmoState.active) hadAnySelection = true;
    universalGizmoState.active = false;
    universalGizmoState.mode = null;
    universalGizmoState.targetType = null;
    universalGizmoState.targetId = null;
  }
  if (typeof renderTriad2D === 'function') renderTriad2D();

  // G. Limpieza de candidatos de ciclaje CAD
  if (typeof window !== 'undefined' && window.cadCyclingState) {
    window.cadCyclingState.candidates = [];
    window.cadCyclingState.candidateIdx = -1;
  }

  // H. Aerogeneradores 3D (RA-Wind)
  if (typeof window !== 'undefined') {
    if (window.RAWindUI && typeof window.RAWindUI.selectTurbineForInspect === 'function') {
      if (typeof window.RAWindUI.getSelectedTurbineId === 'function' && window.RAWindUI.getSelectedTurbineId()) {
        hadAnySelection = true;
      }
      window.RAWindUI.selectTurbineForInspect(null);
    }
    if (window.RAWindVisualizer && typeof window.RAWindVisualizer.selectTurbine === 'function') {
      if (typeof window.RAWindVisualizer.getSelectedId === 'function' && window.RAWindVisualizer.getSelectedId()) {
        hadAnySelection = true;
      }
      window.RAWindVisualizer.selectTurbine(null);
    }
  }

  if (typeof viewer !== 'undefined' && viewer) {
    viewer.selectedEntity = undefined;
    if (viewer.scene) viewer.scene.requestRender();
  }

  if (hadAnySelection && notify && typeof showStatus === 'function') {
    showStatus('<i data-lucide="x-circle" class="icon-sm"></i> SELECCIÓN DESPEJADA', 1200);
  }
  return hadAnySelection;
}
window.clearAllCADSelection = clearAllCADSelection;

window.selectPanel = selectPanel;
window.selectPanelRow = function(panelIdx) {
  const panelsArray = window.allRenderedPanels;
  if (!panelsArray || panelIdx < 0 || panelIdx >= panelsArray.length) return;
  const targetP = panelsArray[panelIdx];
  if (!targetP) return;
  const targetV = (typeof targetP.v === 'number') ? targetP.v : null;
  const targetH = targetP.h || 2.10;
  const rowIndices = [];
  panelsArray.forEach((p, i) => {
    if (p.polyIdx === targetP.polyIdx) {
      if (targetV !== null && typeof p.v === 'number') {
        if (Math.abs(p.v - targetV) < targetH * 0.40) rowIndices.push(i);
      } else {
        rowIndices.push(i);
      }
    }
  });
  window.selectedPanelIndices = rowIndices.length > 0 ? rowIndices : [panelIdx];
  selectedPanelIndex = panelIdx;
  if (typeof window !== 'undefined') window.selectedPanelIndex = selectedPanelIndex;
  updatePanelSelectionUI();
  if (typeof renderTriad2D === 'function') renderTriad2D();
  if (typeof showStatus === 'function') showStatus(`FILA COMPLETA (${window.selectedPanelIndices.length} PANELES) SELECCIONADA`, 2500);
};

window.selectAllPanelsInPolyline = function(polyIdx) {
  if (polyIdx === undefined || polyIdx === null) {
    polyIdx = (typeof WP !== 'undefined' && WP && typeof WP.selectedPolyIdx === 'number' && WP.selectedPolyIdx >= 0) ? WP.selectedPolyIdx : 0;
  }
  if (typeof polyIdx === 'number' && typeof WP !== 'undefined' && WP && WP.polylines && WP.polylines[polyIdx]) {
    if (WP.polylines[polyIdx].panelsVisible === false) {
      if (typeof showToast === 'function') showToast('PLACAS FV OCULTAS', 'Haz visibles las placas de este faldón para poder seleccionarlas.', 'warning', 2500);
      return;
    }
  }
  const panelsArray = (Array.isArray(window.allRenderedPanels) && window.allRenderedPanels.length > 0)
    ? window.allRenderedPanels
    : ((typeof lastRoofInfo !== 'undefined' && lastRoofInfo && Array.isArray(lastRoofInfo.panels)) ? lastRoofInfo.panels : []);
  if (!Array.isArray(panelsArray) || panelsArray.length === 0) return;

  const getPIdx = (p) => {
    if (!p) return 0;
    if (typeof p.polyIdx === 'number') return p.polyIdx;
    if (typeof p.faldonIndex === 'number') return p.faldonIndex;
    if (p.rawPanel && typeof p.rawPanel.polyIdx === 'number') return p.rawPanel.polyIdx;
    if (typeof p.panelId === 'string' && p.panelId.startsWith('pan_')) {
      const parts = p.panelId.split('_');
      const num = parseInt(parts[1], 10);
      if (!isNaN(num)) return num;
    }
    return 0;
  };

  const matched = [];
  panelsArray.forEach((p, i) => {
    if (!p || p.deleted) return;
    const itemPolyIdx = getPIdx(p);
    if (polyIdx === undefined || polyIdx === null || itemPolyIdx === polyIdx) {
      if (typeof WP !== 'undefined' && WP && WP.polylines && WP.polylines[itemPolyIdx] && WP.polylines[itemPolyIdx].panelsVisible === false) return;
      matched.push(i);
    }
  });
  if (matched.length === 0) return;
  window.selectedPanelIndices = matched;
  selectedPanelIndex = matched[matched.length - 1];
  if (typeof window !== 'undefined') window.selectedPanelIndex = selectedPanelIndex;
  updatePanelSelectionUI();
  if (typeof renderTriad2D === 'function') renderTriad2D();
  if (typeof showStatus === 'function') {
    showStatus(`TODOS LOS PANELES DEL FALDON (${matched.length}) SELECCIONADOS`, 2500);
  }
};

window.selectAllPanels = function() {
  const panelsArray = window.allRenderedPanels;
  if (!Array.isArray(panelsArray) || panelsArray.length === 0) return;
  const matched = [];
  panelsArray.forEach((p, i) => {
    if (p && !p.deleted) matched.push(i);
  });
  if (matched.length === 0) return;
  window.selectedPanelIndices = matched;
  selectedPanelIndex = matched[matched.length - 1];
  if (typeof window !== 'undefined') window.selectedPanelIndex = selectedPanelIndex;
  updatePanelSelectionUI();
  if (typeof renderTriad2D === 'function') renderTriad2D();
  if (typeof showStatus === 'function') {
    showStatus(`TODAS LAS PLACAS DEL CAMPO SOLAR (${matched.length}) SELECCIONADAS`, 2500);
  }
};

window.deselectAllPanels = function() {
  selectPanel(-1);
};

// [SSOT] getSelectedPanel y deleteSelectedPanel residen canónicamente en js/working-plane.js

function movePanelTo(idx, screenPos) {
  const scene = (typeof viewer !== 'undefined' && viewer) ? viewer.scene : ((typeof window !== 'undefined' && window.viewer) ? window.viewer.scene : null);
  const camera = scene ? scene.camera : null;
  if (!scene || !camera) return;
  const panelsArr = (window.allRenderedPanels && window.allRenderedPanels.length > 0) ? window.allRenderedPanels : ((lastRoofInfo && lastRoofInfo.panels) || []);
  const p = panelsArr[idx];
  if (!p || !p.corners) return;
  const polyCtx = (typeof WP !== 'undefined' && WP && Array.isArray(WP.polylines) && typeof p.polyIdx === 'number') ? WP.polylines[p.polyIdx] : null;
  const roofCtx = (polyCtx && polyCtx.roofInfo && polyCtx.roofInfo.poly2D && polyCtx.roofInfo.origin && polyCtx.roofInfo.normal) ? polyCtx.roofInfo : lastRoofInfo;
  if (!roofCtx || !roofCtx.poly2D || !roofCtx.origin || !roofCtx.normal) return;
  const ray = camera.getPickRay(screenPos);
  if (!ray) return;
  const origin = roofCtx.origin;
  const normal = roofCtx.normal;
  const denom = Cesium.Cartesian3.dot(ray.direction, normal);
  if (Math.abs(denom) < 1e-8) return;
  const t = Cesium.Cartesian3.dot(Cesium.Cartesian3.subtract(origin, ray.origin, new Cesium.Cartesian3()), normal) / denom;
  if (t < 0) return;
  const hit = Cesium.Cartesian3.add(
    ray.origin,
    Cesium.Cartesian3.multiplyByScalar(ray.direction, t, new Cesium.Cartesian3()),
    new Cesium.Cartesian3()
  );
  const cornerUV = p.corners.map(c => {
    const r = Cesium.Cartesian3.subtract(c, origin, new Cesium.Cartesian3());
    return { u: Cesium.Cartesian3.dot(r, roofCtx.uVec), v: Cesium.Cartesian3.dot(r, roofCtx.vVec) };
  });
  if (!cornerUV.every(pt => isPointInPolygon2D(pt, roofCtx.poly2D))) return;
  const delta = Cesium.Cartesian3.subtract(hit, p.center, new Cesium.Cartesian3());
  Cesium.Cartesian3.clone(hit, p.center);
  p.corners = p.corners.map(c => Cesium.Cartesian3.add(c, delta, new Cesium.Cartesian3()));
  const rel = Cesium.Cartesian3.subtract(hit, origin, new Cesium.Cartesian3());
  p.u = Cesium.Cartesian3.dot(rel, roofCtx.uVec);
  p.v = Cesium.Cartesian3.dot(rel, roofCtx.vVec);
  if (panelOutlineEntity) {
    panelOutlineEntity.polyline.positions = [p.corners[0], p.corners[1], p.corners[2], p.corners[3], Cesium.Cartesian3.clone(p.corners[0])];
  }
}

function rotateSelectedPanel() {
  const panelsArr = (window.allRenderedPanels && window.allRenderedPanels.length > 0) ? window.allRenderedPanels : ((lastRoofInfo && lastRoofInfo.panels) || []);
  if (selectedPanelIndex < 0 || panelsArr.length === 0) {
    showStatus('SELECCIONA UN PANEL FV HACIENDO CLIC SOBRE ÉL EN EL VISOR', 3000);
    return;
  }
  const p = panelsArr[selectedPanelIndex];
  if (!p) return;
  const polyCtx = (typeof WP !== 'undefined' && WP && Array.isArray(WP.polylines) && typeof p.polyIdx === 'number') ? WP.polylines[p.polyIdx] : null;
  const roofCtx = (polyCtx && polyCtx.roofInfo && polyCtx.roofInfo.poly2D) ? polyCtx.roofInfo : (lastRoofInfo || {});
  const f = p.frame || { Lu: 0, Lv: 1, Ln: 0, Wu: 1, Wv: 0, Wn: 0 };
  const uVec = p.uVec || roofCtx.uVec;
  const vVec = p.vVec || roofCtx.vVec;
  const normal = p.normal || roofCtx.normal;
  const transform = p.transform || roofCtx.transform;
  const newW = p.h, newH = p.w;
  const modLen = newH, modWidth = newW;
  const newCenterN = (p.centerN || 0) + ((newH - p.h) / 2) * (f.Ln ? Math.abs(f.Ln) : 0);
  const frameOrigin = Cesium.Matrix4.getTranslation(transform, new Cesium.Cartesian3());
  const newCorners = [];
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const lp = Cesium.Cartesian3.add(
      Cesium.Cartesian3.multiplyByScalar(uVec, p.u + (sx * modLen / 2) * f.Lu + (sy * modWidth / 2) * f.Wu, new Cesium.Cartesian3()),
      Cesium.Cartesian3.multiplyByScalar(vVec, p.v + (sx * modLen / 2) * f.Lv + (sy * modWidth / 2) * f.Wv, new Cesium.Cartesian3()),
      new Cesium.Cartesian3()
    );
    Cesium.Cartesian3.add(lp, Cesium.Cartesian3.multiplyByScalar(normal, newCenterN + (sx * modLen / 2) * f.Ln, new Cesium.Cartesian3()), lp);
    newCorners.push(Cesium.Matrix4.multiplyByPoint(transform, lp, new Cesium.Cartesian3()));
  }
  const fits = !roofCtx.poly2D || newCorners.every(c => {
    const r = Cesium.Cartesian3.subtract(c, frameOrigin, new Cesium.Cartesian3());
    return isPointInPolygon2D({ u: Cesium.Cartesian3.dot(r, uVec), v: Cesium.Cartesian3.dot(r, vVec) }, roofCtx.poly2D);
  });
  if (!fits) {
    showStatus('GIRADO DENEGADO · EL PANEL SALDRÍA DEL POLÍGONO DE CUBIERTA', 2500);
    return;
  }
  p.corners = newCorners;
  p.centerN = newCenterN;
  p.w = newW; p.h = newH;
  p.orientation = p.orientation === 'landscape' ? 'portrait' : 'landscape';
  p.isManual = true;
  updatePanelSelectionUI();
  if (typeof window.wpInvalidateHeatmap === 'function') window.wpInvalidateHeatmap('Panel girado individualmente');
  if (typeof wpPopulateFaldonCard === 'function') wpPopulateFaldonCard();
  if (typeof wpFastRenderSimulatedPanels === 'function') wpFastRenderSimulatedPanels();
  showStatus(`PANEL #${selectedPanelIndex + 1} · ${p.orientation === 'landscape' ? 'HORIZONTAL (LANDSCAPE)' : 'VERTICAL (PORTRAIT)'}`, 2500);
}

function restoreSelectedPanel() {
  if (selectedPanelIndex < 0 || !lastRoofInfo || !panelsPristine) {
    showStatus('SELECCIONA UN PANEL FV HACIENDO CLIC SOBRE ÉL EN EL VISOR', 3000);
    return;
  }
  const s = panelsPristine[selectedPanelIndex];
  const p = lastRoofInfo.panels[selectedPanelIndex];
  if (!s || !p) return;
  p.u = s.u; p.v = s.v; p.w = s.w; p.h = s.h;
  p.orientation = s.orientation;
  p.isManual = false;
  Cesium.Cartesian3.clone(s.center, p.center);
  p.corners = s.corners.map(c => Cesium.Cartesian3.clone(c));
  updatePanelSelectionUI();
  if (typeof window.wpInvalidateHeatmap === 'function') window.wpInvalidateHeatmap('Panel restaurado');
  if (typeof wpPopulateFaldonCard === 'function') wpPopulateFaldonCard();
  if (typeof wpFastRenderSimulatedPanels === 'function') wpFastRenderSimulatedPanels();
  showStatus(`PANEL #${selectedPanelIndex + 1} RESTAURADO A SU POSICIÓN Y ORIENTACIÓN ORIGINALES`, 2500);
}



function startSolarPanelsSimulation() {
  if (typeof wpCurrentStep !== 'undefined' && wpCurrentStep < 2 && !isPolygonDesignConfirmed) {
    clearSimulatedPV();
    if (typeof wpClearInverterAndCables === 'function') wpClearInverterAndCables();
    return;
  }
  const hasPolys = typeof WP !== "undefined" && WP && WP.polylines && WP.polylines.length > 0;
  if (!hasPolys && (!polygonPoints || polygonPoints.length < 3)) return;

  if (typeof wpFastRenderSimulatedPanels === "function") {
    wpFastRenderSimulatedPanels();
    return;
  }

  stopSimulationTimeouts();
  clearSimulatedPV();
  isSimulationRunning = true;

  // Genera y calcula la distribucion de TODOS los faldones y polilineas de forma independiente
  const roofInfo = computeRoofPanelsData();
  if (!roofInfo || !roofInfo.panels || roofInfo.panels.length === 0) {
    showStatus("LA SUPERFICIE ES DEMASIADO PEQUENA PARA MODULOS DE " +
      (panelConfig.largo || 2.10).toFixed(2) + "m x " + (panelConfig.ancho || 1.05).toFixed(2) + "m", 3500);
    return;
  }

  lastRoofInfo = roofInfo;
  panelsPristine = snapshotPanels(roofInfo.panels);

  const polylinesList = hasPolys
    ? WP.polylines
    : [{ points: polygonPoints, roofInfo: roofInfo, name: "Polilínea #1" }];

  const totalPanelsCount = roofInfo.panels.length;
  const polyCountStr = hasPolys && WP.polylines.length > 1 ? (" · " + WP.polylines.length + " STRINGS INDEPENDIENTES") : "";
  const orientLabel = (roofInfo.orientation || "portrait") === "landscape" ? "HORIZONTAL (LANDSCAPE)" : "VERTICAL (PORTRAIT)";
  showStatus("MONTAJE 3D: " + totalPanelsCount + " PANELES TOTALES" + polyCountStr + " · " + orientLabel, 3500);

  const stepMs = Math.min(50, Math.max(10, Math.floor(1200 / Math.max(totalPanelsCount, 1))));
  let globalCounter = 0;

  polylinesList.forEach((poly, polyIdx) => {
    const pInfo = poly.roofInfo || (typeof computeSinglePolylineRoofInfo === "function" ? computeSinglePolylineRoofInfo(poly.points, poly) : null);
    if (!pInfo || !pInfo.panels || pInfo.panels.length === 0) return;
    const polyPanels = pInfo.panels;

    // 1. Instanciacion y animacion de paneles 3D de esta polilinea
    polyPanels.forEach((panelData, pIdx) => {
      const gIdx = globalCounter++;
      const t = setTimeout(() => {
        const panelEntity = viewer.entities.add({
          id: "pv_panel_" + polyIdx + "_" + pIdx + "_" + Math.random().toString(36).substring(2, 7),
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy(panelData.corners),
            material: (typeof window.solarPanelTextureCanvas !== 'undefined' && window.solarPanelTextureCanvas)
              ? new Cesium.ImageMaterialProperty({ image: window.solarPanelTextureCanvas, transparent: false })
              : ((typeof solarPanelTextureUrl !== 'undefined' && solarPanelTextureUrl)
                ? new Cesium.ImageMaterialProperty({ image: solarPanelTextureUrl, transparent: false })
                : new Cesium.ColorMaterialProperty(Cesium.Color.fromCssColorString('#0a1931'))),
            perPositionHeight: true
          }
        });
        simulatedPanelEntities.push(panelEntity);
        if (viewer.scene && viewer.scene.requestRender) viewer.scene.requestRender();

        const countBadge = document.getElementById("sol-panels-count");
        if (countBadge) countBadge.textContent = (gIdx + 1) + " de " + totalPanelsCount + " uds";
      }, gIdx * stepMs);
      simulationTimeouts.push(t);
    });

    // 2. Cableado de STRINGS ELÉCTRICOS ÓPTIMOS (SNAKE PATTERN / IEC 62548)
    const tString = setTimeout(() => {
      if (polyPanels.length === 0) return;

      const calcs = (typeof getProjectCalcs === 'function') ? getProjectCalcs() : null;
      const targetModsPerStr = (calcs && calcs.modsPerStr) ? calcs.modsPerStr : 20;

      const routedStrings = computeOptimalStringRouting(polyPanels, targetModsPerStr);

      routedStrings.forEach((strObj, sIdx) => {
        let wirePositions = strObj.panels.map(p => p.center);
        if (wirePositions.length === 1) wirePositions.push(Cesium.Cartesian3.clone(wirePositions[0]));

        const strColorHex = getPolylineStringColor(routedStrings.length > 1 ? (polyIdx * 4 + sIdx) : polyIdx);

        // Línea 3D del string en serpentina (estática para preservar requestRenderMode)
        const stringLineEntity = viewer.entities.add({
          id: "pv_string_wire_" + polyIdx + "_" + sIdx + "_" + Math.random().toString(36).substring(2, 7),
          polyline: {
            positions: wirePositions,
            width: 4.0,
            material: new Cesium.ColorMaterialProperty(Cesium.Color.fromCssColorString(strColorHex)),
            // depthFailMaterial removed,
            clampToGround: false
          }
        });
        simulatedStringEntities.push(stringLineEntity);

        // Terminal (+) Inicio de String
        const terminalPlus = viewer.entities.add({
          position: strObj.startPanel.center,
          point: {
            pixelSize: 8,
            color: Cesium.Color.fromCssColorString("#22C55E"),
            outlineColor: Cesium.Color.fromCssColorString("#000000"),
            outlineWidth: 2,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          }
        });
        simulatedStringEntities.push(terminalPlus);

        // Terminal (-) Fin de String
        const terminalMinus = viewer.entities.add({
          position: strObj.endPanel.center,
          point: {
            pixelSize: 8,
            color: Cesium.Color.fromCssColorString("#EF4444"),
            outlineColor: Cesium.Color.fromCssColorString("#000000"),
            outlineWidth: 2,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          }
        });
        simulatedStringEntities.push(terminalMinus);
      });
    }, (globalCounter * stepMs) + 100);
    simulationTimeouts.push(tString);
  });

  const finalTimeout = setTimeout(() => {
    isSimulationRunning = false;
    const totalV = (totalPanelsCount * 41.5).toFixed(1);
    const vocElem = document.getElementById("sol-string-voc");
    if (vocElem) vocElem.textContent = totalV + " V CC";
    const impElem = document.getElementById("sol-string-imp");
    if (impElem) impElem.textContent = "13.2 A";
    showStatus("INSTALACION COMPLETADA · " + totalPanelsCount + " MODULOS EN " + polylinesList.length + " STRINGS INDEPENDIENTES", 4000);
    // Tab navigation is kept intact on whatever tab the user is currently working
  }, (globalCounter * stepMs) + 350);
  simulationTimeouts.push(finalTimeout);
}

// [SSOT] isPointInPolygon2D reside canónicamente en js/polygon-shadow-math.js

// ============================================================================
// MOTOR DE CÁLCULO SOLAR FOTOVOLTAICO PROFESIONAL (REBT / CTE DB-HE5 / RD 244)
// ============================================================================
const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MONTH_DAYS  = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const SOLAR_RAD_MONTHLY_BASE = [
  2.3, 3.2, 4.4, 5.5, 6.4, 7.2, 7.5, 6.7, 5.2, 3.6, 2.5, 2.0
];

// [FASE B3] Controlador de producción solar extraído a js/solar-yield-controller.js

function raUpdateEnergyHUD() {
  const hudEnergy = document.getElementById('ra-hud-energy');
  if (!hudEnergy) return;

  const sStats = (window.RA && window.RA.solarStats) ? window.RA.solarStats : {};
  let numPanels = typeof sStats.numPanels === 'number' ? sStats.numPanels : 0;
  if (typeof WP !== 'undefined' && WP && Array.isArray(WP.polylines) && WP.polylines.length > 0) {
    let activeInPolys = 0;
    WP.polylines.forEach(p => {
      if (p.panelsDisabled === true) return;
      if (p.roofInfo && Array.isArray(p.roofInfo.panels)) {
        activeInPolys += p.roofInfo.panels.filter(x => !x.deleted && !x.disabled).length;
      }
    });
    numPanels = activeInPolys;
  } else if (!numPanels && Array.isArray(window.allRenderedPanels)) {
    numPanels = window.allRenderedPanels.filter(p => p && !p.deleted && !p.disabled).length;
  }
  const isSimulated = Boolean(window.solarSimState && window.solarSimState.annualHeatmapData && !window.solarSimState.annualHeatmapDirty);
  const prVal = (typeof sStats.pr === 'number' && sStats.pr > 0 && sStats.pr <= 1) ? sStats.pr : 0.786;
  const solarGrossKWh = numPanels > 0 ? Math.round(sStats.annualGrossKWh || sStats.annualYieldKWh || 0) : 0;
  let solarNetKWh = numPanels > 0 ? Math.round(sStats.annualYieldKWh || 0) : 0;
  let solarShadowLossKWh = numPanels > 0 ? Math.round(sStats.annualShadowLossKWh || 0) : 0;
  let solarSysLossKWh = numPanels > 0 ? Math.round(sStats.annualSystemLossKWh || 0) : 0;
  let avgShadowPct = numPanels > 0 ? (sStats.avgShadowLossPct || 0) : 0;

  // Si no hay mapa de calor 3D vigente (estimación previa), evitar arrastrar pérdidas de sombras obsoletas
  if (numPanels > 0 && !isSimulated && solarGrossKWh > 0) {
    solarShadowLossKWh = 0;
    avgShadowPct = 0;
    solarNetKWh = Math.round(solarGrossKWh * prVal);
    solarSysLossKWh = Math.max(0, solarGrossKWh - solarNetKWh);
  }

  // Datos eólicos
  const activeTurbs = Array.isArray(window.windTurbines)
    ? window.windTurbines.filter(t => !t.operationalState || t.operationalState.enabled !== false)
    : [];
  const numTurbines = activeTurbs.length;
  let windKw = 0;
  activeTurbs.forEach(t => {
    const pW = (t._catalog && t._catalog.ratedPowerW) ? t._catalog.ratedPowerW : 0;
    windKw += (pW / 1000.0);
  });
  const wSum = (numTurbines > 0 && window.windParkSummary) ? window.windParkSummary : null;
  const windNetKWh = wSum ? Math.round(wSum.totalAepNetKwh || 0) : 0;
  const windWakePct = wSum ? (wSum.parkWakeLossPercentage || 0) : 0;
  const windCfPct = wSum ? ((wSum.averageCapacityFactor || 0) * 100) : 0;
  const windEqHours = wSum ? Math.round(wSum.equivalentHours || 0) : 0;
  const resCfg = (window.RAWind && window.RAWind.Resource && typeof window.RAWind.Resource.getConfig === 'function')
    ? window.RAWind.Resource.getConfig()
    : { vMeanRefMs: 5.5 };

  if (numPanels === 0 && numTurbines === 0) {
    hudEnergy.style.display = 'none';
    return;
  }

  hudEnergy.style.display = 'block';
  const totalHybridKWh = solarNetKWh + windNetKWh;

  const hudTitleLabel = document.getElementById('hud-title-label');
  if (hudTitleLabel) {
    if (numPanels > 0 && numTurbines > 0) {
      hudTitleLabel.textContent = 'Prod. Híbrida Anual:';
    } else if (numTurbines > 0) {
      hudTitleLabel.textContent = 'Prod. Eólica Anual:';
    } else {
      hudTitleLabel.textContent = isSimulated ? 'Producción Neta Anual:' : 'Prod. Anual Estimada:';
    }
  }

  const hudValNeta = document.getElementById('hud-val-neta');
  if (hudValNeta) {
    hudValNeta.style.color = (isSimulated || (numPanels > 0 && numTurbines > 0)) ? '#10B981' : '#38BDF8';
    hudValNeta.textContent = totalHybridKWh.toLocaleString('es-ES') + ' kWh/año';
  }

  // Micro-badges en la píldora superior
  const hybridBadges = document.getElementById('hud-hybrid-badges');
  const pillSolarBadge = document.getElementById('hud-pill-solar-badge');
  const pillWindBadge = document.getElementById('hud-pill-wind-badge');
  const pillSolarVal = document.getElementById('hud-pill-solar-val');
  const pillWindVal = document.getElementById('hud-pill-wind-val');

  const tooltipTitleEl = document.getElementById('hud-prod-tooltip-title');
  const tooltipWindEl = document.getElementById('hud-prod-tooltip-wind');
  if (tooltipTitleEl) {
    tooltipTitleEl.textContent = (numTurbines > 0) ? 'Balance Energético Híbrido (FV + Eólica)' : 'Balance Energético Solar FV';
  }
  if (tooltipWindEl) {
    tooltipWindEl.style.display = (numTurbines > 0) ? 'block' : 'none';
  }

  if (hybridBadges) {
    if (numTurbines > 0) {
      hybridBadges.style.display = 'inline-flex';
      if (pillSolarBadge) pillSolarBadge.style.display = numPanels > 0 ? 'inline-flex' : 'none';
      if (pillWindBadge) pillWindBadge.style.display = 'inline-flex';
      if (pillSolarVal) pillSolarVal.textContent = solarNetKWh.toLocaleString('es-ES');
      if (pillWindVal) pillWindVal.textContent = windNetKWh.toLocaleString('es-ES');
    } else {
      hybridBadges.style.display = 'none';
    }
  }

  // Coordenadas terrestres
  let latDeg = typeof sStats.latDeg === 'number' ? sStats.latDeg : null;
  let lonDeg = typeof sStats.lonDeg === 'number' ? sStats.lonDeg : null;
  if (latDeg === null && activeTurbs.length > 0 && activeTurbs[0].positionCartographic) {
    latDeg = activeTurbs[0].positionCartographic.latitudeRad * (180 / Math.PI);
    lonDeg = activeTurbs[0].positionCartographic.longitudeRad * (180 / Math.PI);
  }
  if (latDeg !== null && lonDeg !== null) {
    const latStr = Math.abs(latDeg).toFixed(2) + '°' + (latDeg >= 0 ? 'N' : 'S');
    const lonStr = Math.abs(lonDeg).toFixed(2) + '°' + (lonDeg >= 0 ? 'E' : 'O');
    setElemText('hud-val-coords', latStr + ', ' + lonStr);
  }

  // Bloque Solar en el Dropdown
  const solarBlock = document.getElementById('hud-dropdown-solar-block');
  const solarSecHeader = document.getElementById('hud-solar-sec-header');
  if (solarBlock) {
    solarBlock.style.display = numPanels > 0 ? 'flex' : 'none';
    if (solarSecHeader) {
      solarSecHeader.style.display = (numPanels > 0 && numTurbines > 0) ? 'flex' : 'none';
    }
    setElemText('hud-val-solar-net-sub', solarNetKWh.toLocaleString('es-ES') + ' kWh/a');
    setElemText('hud-val-bruta', solarGrossKWh.toLocaleString('es-ES') + ' kWh');
    const shadowPctStr = avgShadowPct > 0 ? (' (' + avgShadowPct.toFixed(1) + '%)') : '';
    setElemText('hud-val-sombras', '-' + solarShadowLossKWh.toLocaleString('es-ES') + ' kWh' + shadowPctStr);
    const sysLossPct = ((1.0 - prVal) * 100).toFixed(1);
    setElemText('hud-val-sistema', '-' + solarSysLossKWh.toLocaleString('es-ES') + ' kWh (' + sysLossPct + '%)');
  }

  // Bloque Eólico en el Dropdown
  const windBlock = document.getElementById('hud-dropdown-wind-block');
  if (windBlock) {
    windBlock.style.display = numTurbines > 0 ? 'flex' : 'none';
    setElemText('hud-val-wind-net-sub', windNetKWh.toLocaleString('es-ES') + ' kWh/a');
    setElemText('hud-val-wind-resource', windKw.toFixed(1) + ' kW · ' + Number(resCfg.vMeanRefMs || 5.5).toFixed(2) + ' m/s');
    setElemText('hud-val-wind-wake', '-' + Number(windWakePct).toFixed(1) + '%');
    setElemText('hud-val-wind-cf', Number(windCfPct).toFixed(1) + '% (' + windEqHours.toLocaleString('es-ES') + ' h)');
  }

  // Barra de Mix Híbrido
  const mixBlock = document.getElementById('hud-dropdown-mix-block');
  if (mixBlock) {
    if (numPanels > 0 && numTurbines > 0 && totalHybridKWh > 0) {
      mixBlock.style.display = 'flex';
      const sPct = Math.round((solarNetKWh / totalHybridKWh) * 100);
      const wPct = 100 - sPct;
      setElemText('hud-mix-solar-pct', '☀️ FV ' + sPct + '%');
      setElemText('hud-mix-wind-pct', '💨 Eólica ' + wPct + '%');
      const barS = document.getElementById('hud-mix-bar-solar');
      const barW = document.getElementById('hud-mix-bar-wind');
      if (barS) barS.style.width = sPct + '%';
      if (barW) barW.style.width = wPct + '%';
    } else {
      mixBlock.style.display = 'none';
    }
  }

  const footerBadges = document.getElementById('hud-dropdown-footer-badges');
  if (footerBadges) {
    footerBadges.style.display = numPanels > 0 ? 'flex' : 'none';
  }
}
window.raUpdateEnergyHUD = raUpdateEnergyHUD;

function compute3DPolygonArea(points) {
  let totalArea = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const v1 = Cesium.Cartesian3.subtract(points[i], points[0], new Cesium.Cartesian3());
    const v2 = Cesium.Cartesian3.subtract(points[i+1], points[0], new Cesium.Cartesian3());
    const cross = Cesium.Cartesian3.cross(v1, v2, new Cesium.Cartesian3());
    totalArea += Cesium.Cartesian3.magnitude(cross) * 0.5;
  }
  return totalArea;
}

// Análisis unificado del polígono dibujado: centroide → frame ENU → plano local
// U/V/N → normal, inclinación, azimut (Sur=0 app y N=0 doc), proyección 2D y área.
// Unifica las 5 copias idénticas que había dispersas en recalculateSolarYield,
// render3DObstaclesInCesium, computeRoofPanelsData y getProjectCalcs.
function polygonAnalysis(ptsIn) {
  const pts = (ptsIn && ptsIn.length >= 3) ? ptsIn : polygonPoints;
  if (!pts || pts.length < 3) return null;
  const center = new Cesium.Cartesian3(0, 0, 0);
  pts.forEach(p => Cesium.Cartesian3.add(center, p, center));
  Cesium.Cartesian3.divideByScalar(center, pts.length, center);

  const carto = Cesium.Cartographic.fromCartesian(center);
  const latDeg = Cesium.Math.toDegrees(carto.latitude);
  const lonDeg = Cesium.Math.toDegrees(carto.longitude);

  const transform = Cesium.Transforms.eastNorthUpToFixedFrame(center);
  const invTransform = Cesium.Matrix4.inverse(transform, new Cesium.Matrix4());
  const localPoints = pts.map(p => Cesium.Matrix4.multiplyByPoint(invTransform, p, new Cesium.Cartesian3()));

  let normal = new Cesium.Cartesian3(0, 0, 0);
  for (let i = 0; i < localPoints.length; i++) {
    const cur = localPoints[i];
    const nxt = localPoints[(i + 1) % localPoints.length];
    normal.x += (cur.y - nxt.y) * (cur.z + nxt.z);
    normal.y += (cur.z - nxt.z) * (cur.x + nxt.x);
    normal.z += (cur.x - nxt.x) * (cur.y + nxt.y);
  }
  normal = Cesium.Cartesian3.normalize(normal, normal);
  if (normal.z < 0) normal = Cesium.Cartesian3.negate(normal, normal);

  const tiltRad = Math.acos(Math.min(Math.max(normal.z, 0.0), 1.0));
  const tiltDeg = Cesium.Math.toDegrees(tiltRad);

  // Convención náutica canónica de brújula: Norte = 0°, Este = 90°, Sur = 180°, Oeste = 270°
  let azimuthN = 180;
  if (Math.sin(tiltRad) > 0.01) {
    azimuthN = normalizeAzimuth(Cesium.Math.toDegrees(Math.atan2(normal.x, normal.y)));
  }
  // Convención física solar (Duffie-Beckman / RA.Radiation): Sur = 0°, Este = -90°, Oeste = +90°
  let azimuthDeg = azimuthN - 180;
  if (azimuthDeg > 180) azimuthDeg -= 360;
  if (azimuthDeg <= -180) azimuthDeg += 360;

  let uVec = new Cesium.Cartesian3(-normal.y, normal.x, 0);
  if (Cesium.Cartesian3.magnitude(uVec) < 0.001) uVec = new Cesium.Cartesian3(1, 0, 0);
  uVec = Cesium.Cartesian3.normalize(uVec, uVec);
  const vVec = Cesium.Cartesian3.normalize(Cesium.Cartesian3.cross(normal, uVec, new Cesium.Cartesian3()), new Cesium.Cartesian3());

  const poly2D = localPoints.map(p => ({
    u: Cesium.Cartesian3.dot(p, uVec),
    v: Cesium.Cartesian3.dot(p, vVec)
  }));

  return {
    center, carto, latDeg, lonDeg,
    transform, invTransform, localPoints,
    normal, tiltRad, tiltDeg, azimuthDeg, azimuthN,
    uVec, vVec, poly2D,
    area3D: compute3DPolygonArea(localPoints)
  };
}

// ============================================================================
// MOTOR DE ALGORITMOS GEOMÉTRICOS Y SOLARES (Documento RA)
// Convención: Norte = 0°, Este = 90°, Sur = 180°, Oeste = 270°. Radianes internos.
// Funciones puras y testeables, independientes de Cesium y de la UI.
// ============================================================================

const GE_EPSILON = 1e-8;

// [DEDUP] degToRad -> solar-engine.js
// [DEDUP] radToDeg -> solar-engine.js
// [DEDUP] normalizeAzimuth -> solar-engine.js
// [DEDUP] clampGE -> solar-engine.js

// ── Vector3 {x,y,z} ──────────────────────────────────────────────────────────
// [DEDUP] v3 -> solar-engine.js
// [DEDUP] v3Sub -> solar-engine.js
// [DEDUP] v3Scale -> solar-engine.js
// [DEDUP] v3Dot -> solar-engine.js
// [DEDUP] v3Cross -> solar-engine.js
// [DEDUP] v3Len -> solar-engine.js
// [DEDUP] v3Norm -> solar-engine.js

// ── §4 Vector normal del plano desde inclinación beta y azimut gamma ─────────
// [DEDUP] normalFromTiltAzimuth -> solar-engine.js

// ── §5 Inclinación y normal a partir de tres puntos ─────────────────────────
// [DEDUP] planeNormalFromThreePoints -> solar-engine.js

// [DEDUP] slopeFromNormal -> solar-engine.js

// [DEDUP] slopeFromThreePoints -> solar-engine.js

// ── §6 Azimut de la normal (N=0, E=90, S=180, O=270) ────────────────────────
// [DEDUP] azimuthFromNormal -> solar-engine.js

// ── §7 Azimut a partir de una línea y pendiente desde cumbrera ──────────────
// [DEDUP] azimuthFromLine -> solar-engine.js

// ── §11.1 Día del año ───────────────────────────────────────────────────────
// [DEDUP] getDayOfYear -> solar-engine.js

// ── §13 Azimut solar con atan2 (recomendado por el documento) ───────────────
// [DEDUP] solarAzimuthAtan2 -> solar-engine.js

// ── §14 Vector unitario hacia el Sol ─────────────────────────────────────────
// [DEDUP] sunVector -> solar-engine.js

// [DEDUP] solarPosition -> solar-engine.js

// ── §15 Ángulo de incidencia ─────────────────────────────────────────────────
// [DEDUP] incidenceAngle -> solar-engine.js

// ── §17 Proyección del módulo sobre el tejado ───────────────────────────────
// [DEDUP] moduleProjectedSize -> solar-engine.js

// ── §18 Separación entre filas ───────────────────────────────────────────────

// ── §19.1 CONTENCIÓN BOOLEANA ESTRICTA 2D (CLIIPER/CAD STYLE) ────────────────
function distancePointToSegment2D(p, a, b) {
  const l2 = (b.u - a.u)**2 + (b.v - a.v)**2;
  if (l2 < 1e-12) return Math.hypot(p.u - a.u, p.v - a.v);
  let t = ((p.u - a.u) * (b.u - a.u) + (p.v - a.v) * (b.v - a.v)) / l2;
  t = Math.max(0, Math.min(1, t));
  const projU = a.u + t * (b.u - a.u);
  const projV = a.v + t * (b.v - a.v);
  return Math.hypot(p.u - projU, p.v - projV);
}

function isPanelFullyContainedInPolygon2D(corners, poly, minSetback = 0) {
  if (!corners || corners.length < 4 || !poly || poly.length < 3) return false;

  // A. Todos los vértices dentro
  for (let i = 0; i < corners.length; i++) {
    if (!isPointInPolygon2D(corners[i], poly)) return false;
  }

  // B. Puntos medios de todas las aristas dentro (evita cruce de entrantes cóncavos)
  const midpoints = [];
  for (let i = 0; i < corners.length; i++) {
    const next = (i + 1) % corners.length;
    const mid = { u: (corners[i].u + corners[next].u) / 2, v: (corners[i].v + corners[next].v) / 2 };
    if (!isPointInPolygon2D(mid, poly)) return false;
    midpoints.push(mid);
  }

  // C. Centro del panel dentro
  const center = {
    u: (corners[0].u + corners[2].u) / 2,
    v: (corners[0].v + corners[2].v) / 2
  };
  if (!isPointInPolygon2D(center, poly)) return false;

  // D. Ninguna arista del panel interseca las aristas del perímetro de la cubierta
  for (let i = 0; i < corners.length; i++) {
    const c1 = corners[i];
    const c2 = corners[(i + 1) % corners.length];
    for (let j = 0; j < poly.length; j++) {
      const p1 = poly[j];
      const p2 = poly[(j + 1) % poly.length];
      if (segmentsIntersect2D(c1, c2, p1, p2)) return false;
    }
  }

  // E. <i data-lucide=\"rocket\" class=\"icon-sm\"></i> RETRANQUEO EUCLÍDEO EXACTO A ARISTAS PERIMETRALES (CTE DB-SE-AE)
  if (minSetback > 0.01) {
    const testPoints = [...corners, ...midpoints];
    for (const pt of testPoints) {
      for (let j = 0; j < poly.length; j++) {
        const p1 = poly[j];
        const p2 = poly[(j + 1) % poly.length];
        if (distancePointToSegment2D(pt, p1, p2) < minSetback - 1e-4) {
          return false;
        }
      }
    }
    // Comprobación recíproca: distancia de vértices del faldón a las 4 aristas del panel
    for (let j = 0; j < poly.length; j++) {
      const pVertex = poly[j];
      for (let i = 0; i < corners.length; i++) {
        const c1 = corners[i], c2 = corners[(i + 1) % corners.length];
        if (distancePointToSegment2D(pVertex, c1, c2) < minSetback - 1e-4) {
          return false;
        }
      }
    }
  }

  return true;
}

// ── §19.2 PASO INTER-FILAS RIGUROSO 3D (FÓRMULA PVSYST / MERMOUD / CTE DB-HE5) ─

// [B1] calculateDynamicMPPTStringLimits y partitionPanelsIntoMPPTStrings residen de forma canónica en js/electrical-engine.js

function invalidateRoofPanelsCache() {
  roofPanelsCache = { sig: null, data: null, selectedLayoutId: null, layoutCandidates: [] };
  if (typeof lastRoofInfo !== 'undefined') lastRoofInfo = null;
}

function calculatePVsystRowPitch(moduleLengthM, deltaTiltDeg, roofSlopeDeg, moduleAzSurDeg, latDeg, safetyMarginM = 0.20, designWindowH = 2.0) {
  if (deltaTiltDeg < 1.0) {
    return moduleLengthM + 0.04; // Coplanar
  }

  // Solsticio de invierno (21 Dic) a las 10:00 h solar (CTE DB-HE5 / UNE-EN 62446)
  const latRad = degToRad(typeof latDeg === 'number' ? latDeg : 40.4168);
  const declRad = degToRad(-23.45);
  // Ventana libre de sombras: ±designWindowH horas respecto al mediodía solar (2.0 h = 10:00-14:00, criterio CTE)
  // Se evalúan extremos y mediodía para capturar correctamente orientaciones E/O/N (no solo 10:00 AM).
  const winH = Math.max(1.0, Math.min(3.5, Number(designWindowH) || 2.0));
  const hVert = moduleLengthM * Math.sin(degToRad(deltaTiltDeg));
  let shadowDist = 0;

  // [F2-10] Proyección trigonométrica exacta sobre plano inclinado sin suelo arbitrario 0.35
  const roofSlopeRad = degToRad(Math.min(85, Math.abs(roofSlopeDeg || 0)));
  for (const hSolar of [-winH, 0, winH]) {
    const haRad = degToRad(15.0 * hSolar);
    const sinAlt = Math.sin(latRad) * Math.sin(declRad) + Math.cos(latRad) * Math.cos(declRad) * Math.cos(haRad);
    const altRad = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
    if (altRad <= 0.02) continue;

    const cosAz = (Math.sin(declRad) * Math.cos(latRad) - Math.cos(declRad) * Math.sin(latRad) * Math.cos(haRad)) / Math.max(Math.cos(altRad), 1e-4);
    const azSolarSurDeg = Math.sign(haRad || 0) * radToDeg(Math.acos(Math.max(-1, Math.min(1, cosAz))));

    const azDiffRad = degToRad((moduleAzSurDeg || 0) - azSolarSurDeg);
    const cosAzProj = Math.max(0.0, Math.cos(azDiffRad));
    if (cosAzProj <= 1e-3) continue;
    const denom = Math.tan(altRad) * Math.cos(roofSlopeRad) + Math.sin(roofSlopeRad) * cosAzProj;
    const dist = hVert * (cosAzProj / Math.max(denom, 0.12));
    if (dist > shadowDist) shadowDist = dist;
  }

  const footprintA = moduleLengthM * Math.cos(degToRad(deltaTiltDeg));
  const minPitch = footprintA + (safetyMarginM || 0.05);

  return Math.max(minPitch, footprintA + shadowDist + (safetyMarginM || 0.20));
}

// [DEDUP] rowSpacing -> solar-engine.js

// [DEDUP] gapBetweenRows -> solar-engine.js

// ── §20 Sombra de un obstáculo ───────────────────────────────────────────────
// [DEDUP] obstacleShadowLength -> solar-engine.js

// [DEDUP] obstacleShadowVector -> solar-engine.js

// ── §22 Polígono de sombra proyectado sobre el plano de la cubierta ─────────
// [DEDUP] projectShadowPolygon -> solar-engine.js

// ── §21 Ray casting 3D (primitivo: caja obstáculo, rayos al Sol) ────────────
// [DEDUP] rayHitsAABB -> solar-engine.js

// [DEDUP] rayCastingIsShaded -> solar-engine.js
// ============================================================================
// INTERSECCION DE POLIGONOS 2D, DETECCION EXACTA DE OBSTACULOS 3D Y SOMBRAS
// ============================================================================

// Obtiene los 4 vertices 3D (Cartesian3) reales de la base del obstaculo en el espacio mundo
function getObstacleWorldBaseCorners3D(obs, setback) {
  const w = Math.max(obs.w || 1.0, 0.2);
  const l = Math.max(obs.l || 1.0, 0.2);
  const sb = typeof setback === "number" ? setback : 0.50;
  const hw = (w / 2) + sb;
  const hl = (l / 2) + sb;

  let baseCenter = null;
  let normal = null;
  let uVec = null;
  let vVec = null;

  // 1. Canónico: si tiene posición 3D real en WGS84 (donde el usuario ve el objeto en Cesium)
  if (obs.cartesian) {
    baseCenter = (obs.cartesian instanceof Cesium.Cartesian3)
      ? Cesium.Cartesian3.clone(obs.cartesian)
      : new Cesium.Cartesian3(obs.cartesian.x, obs.cartesian.y, obs.cartesian.z);
  }

  let wp = (typeof WP !== "undefined" && WP.planes && obs.planeIdx >= 0 && WP.planes[obs.planeIdx])
    ? WP.planes[obs.planeIdx]
    : (typeof getObstacleActivePlane === "function" ? getObstacleActivePlane(obs) : null);

  if (wp && wp.normal && wp.uVec && wp.vVec) {
    normal = Cesium.Cartesian3.normalize(wp.normal, new Cesium.Cartesian3());
    uVec = Cesium.Cartesian3.normalize(wp.uVec, new Cesium.Cartesian3());
    vVec = Cesium.Cartesian3.normalize(wp.vVec, new Cesium.Cartesian3());
    if (!baseCenter && wp.origin) {
      baseCenter = Cesium.Cartesian3.add(
        wp.origin,
        Cesium.Cartesian3.add(
          Cesium.Cartesian3.multiplyByScalar(uVec, obs.u || 0, new Cesium.Cartesian3()),
          Cesium.Cartesian3.multiplyByScalar(vVec, obs.v || 0, new Cesium.Cartesian3()),
          new Cesium.Cartesian3()
        ),
        new Cesium.Cartesian3()
      );
      if (obs.elevation) {
        baseCenter = Cesium.Cartesian3.add(
          baseCenter,
          Cesium.Cartesian3.multiplyByScalar(normal, obs.elevation, new Cesium.Cartesian3()),
          new Cesium.Cartesian3()
        );
      }
    }
  } else if (baseCenter) {
    normal = Cesium.Cartesian3.normalize(baseCenter, new Cesium.Cartesian3());
    uVec = Cesium.Cartesian3.cross(normal, Cesium.Cartesian3.UNIT_Z, new Cesium.Cartesian3());
    if (Cesium.Cartesian3.magnitude(uVec) < 0.01) {
      uVec = Cesium.Cartesian3.cross(normal, Cesium.Cartesian3.UNIT_X, new Cesium.Cartesian3());
    }
    uVec = Cesium.Cartesian3.normalize(uVec, uVec);
    vVec = Cesium.Cartesian3.normalize(Cesium.Cartesian3.cross(normal, uVec, new Cesium.Cartesian3()), new Cesium.Cartesian3());
  }

  if (!baseCenter || !uVec || !vVec) {
    return [new Cesium.Cartesian3(), new Cesium.Cartesian3(), new Cesium.Cartesian3(), new Cesium.Cartesian3()];
  }

  // 2. Alinear ejes con la orientación 3D real (a plomo o coplanar)
  const isVertical = (obs.alignment !== 'coplanar');
  const vertAxes = (typeof getObstacleOrientationAxes === 'function') ? getObstacleOrientationAxes(baseCenter, uVec, isVertical) : null;
  const effUVec = (isVertical && vertAxes) ? vertAxes.uHoriz : uVec;
  const effVVec = (isVertical && vertAxes) ? vertAxes.vHoriz : vVec;

  const rotRad = degToRad(obs.rot || 0);
  const cosR = Math.cos(rotRad);
  const sinR = Math.sin(rotRad);

  const uRot = Cesium.Cartesian3.add(
    Cesium.Cartesian3.multiplyByScalar(effUVec, cosR, new Cesium.Cartesian3()),
    Cesium.Cartesian3.multiplyByScalar(effVVec, sinR, new Cesium.Cartesian3()),
    new Cesium.Cartesian3()
  );
  const vRot = Cesium.Cartesian3.add(
    Cesium.Cartesian3.multiplyByScalar(effUVec, -sinR, new Cesium.Cartesian3()),
    Cesium.Cartesian3.multiplyByScalar(effVVec, cosR, new Cesium.Cartesian3()),
    new Cesium.Cartesian3()
  );

  return [
    Cesium.Cartesian3.add(baseCenter, Cesium.Cartesian3.add(Cesium.Cartesian3.multiplyByScalar(uRot, -hw, new Cesium.Cartesian3()), Cesium.Cartesian3.multiplyByScalar(vRot, -hl, new Cesium.Cartesian3()), new Cesium.Cartesian3()), new Cesium.Cartesian3()),
    Cesium.Cartesian3.add(baseCenter, Cesium.Cartesian3.add(Cesium.Cartesian3.multiplyByScalar(uRot,  hw, new Cesium.Cartesian3()), Cesium.Cartesian3.multiplyByScalar(vRot, -hl, new Cesium.Cartesian3()), new Cesium.Cartesian3()), new Cesium.Cartesian3()),
    Cesium.Cartesian3.add(baseCenter, Cesium.Cartesian3.add(Cesium.Cartesian3.multiplyByScalar(uRot,  hw, new Cesium.Cartesian3()), Cesium.Cartesian3.multiplyByScalar(vRot,  hl, new Cesium.Cartesian3()), new Cesium.Cartesian3()), new Cesium.Cartesian3()),
    Cesium.Cartesian3.add(baseCenter, Cesium.Cartesian3.add(Cesium.Cartesian3.multiplyByScalar(uRot, -hw, new Cesium.Cartesian3()), Cesium.Cartesian3.multiplyByScalar(vRot,  hl, new Cesium.Cartesian3()), new Cesium.Cartesian3()), new Cesium.Cartesian3())
  ];
}

function getObstaclePolygon2DForRoof(obs, setback, roof) {
  if (!obs || !roof) return null;

  // 1. Obtener los 4 vértices 3D mundiales reales del obstáculo
  const baseCorners3D = (typeof getObstacleWorldBaseCorners3D === 'function')
    ? getObstacleWorldBaseCorners3D(obs, setback || 0.0)
    : null;

  const uVec = roof.uVec;
  const vVec = roof.vVec;
  const invT = roof.invTransform || (roof.transform && typeof Cesium !== 'undefined' && Cesium.Matrix4 ? Cesium.Matrix4.inverse(roof.transform, new Cesium.Matrix4()) : null);

  if (baseCorners3D && Array.isArray(baseCorners3D) && baseCorners3D.length >= 3 && invT && uVec && vVec) {
    // Proyección canónica: transformar cada vértice 3D de mundo ECEF al espacio local ENU del faldón y proyectar sobre U, V
    return baseCorners3D.map(pt3D => {
      const locPt = Cesium.Matrix4.multiplyByPoint(invT, pt3D, new Cesium.Cartesian3());
      return {
        u: Cesium.Cartesian3.dot(locPt, uVec),
        v: Cesium.Cartesian3.dot(locPt, vVec)
      };
    });
  }

  return getObstaclePolygon2D(obs, setback);
}

function getObstaclePolygon2D(obs, setback) {
  const w = Math.max(obs.w || 1.0, 0.2);
  const l = Math.max(obs.l || 1.0, 0.2);
  const sb = typeof setback === "number" ? setback : 0.50;
  const hw = Math.max(0.05, (w / 2) + Math.max(-w / 2 + 0.05, sb));
  const hl = Math.max(0.05, (l / 2) + Math.max(-l / 2 + 0.05, sb));
  const u = obs.u || 0;
  const v = obs.v || 0;
  const rotDeg = obs.rot || 0;
  const rotRad = degToRad(rotDeg);
  const cosR = Math.cos(rotRad);
  const sinR = Math.sin(rotRad);
  const localCorners = [
    { du: -hw, dv: -hl },
    { du:  hw, dv: -hl },
    { du:  hw, dv:  hl },
    { du: -hw, dv:  hl }
  ];
  return localCorners.map(c => ({
    u: u + c.du * cosR - c.dv * sinR,
    v: v + c.du * sinR + c.dv * cosR
  }));
}

// [MODULARIZADO AAA] Geometría 2D, intersecciones y sombras de edificios delegadas a js/polygon-shadow-math.js

// Motor de disposicion y maximizacion de cobertura en cubierta
function evaluateModuleLayouts(roof, module, cfg) {
  const moduleLength = module.lengthM, moduleWidth = module.widthM;
  const slopeDeg = roof.slopeDeg || 0;
  const flatThreshold = cfg.flatThreshold || 8;
  const gap = cfg.gap || 0.02;
  const setback = 0;
  const safety = 0;
  const altWinter = cfg.solarElevationDeg;

  const poly = roof.poly2D || [];
  if (poly.length < 3) return { layouts: [], best: null };

  const roofAz = (roof.azimuthDeg !== undefined) ? roof.azimuthDeg : 180;
  const isSouthQuadrant = (roofAz >= 100 && roofAz <= 260); // Favorable a sol (SE, S, SO)

  // 1. Cálculo de inclinación y azimut óptimos
  const lat = (typeof roof.latDeg === "number") ? roof.latDeg : (typeof latitude === "number" ? latitude : 40.4168);
  const optimalTilt = Math.min(35, Math.max(15, Math.round(3.7 + 0.69 * Math.abs(lat))));
  const optimalAzSur = (lat >= 0) ? 0 : 180;

  const isOptimal = (cfg.arrangementMode === 'solar_optimal' || cfg.moduleTiltDeg === 'optimal');
  const isCoplanar = (cfg.arrangementMode === 'coplanar' || cfg.moduleTiltDeg === 'coplanar' || cfg.moduleTiltDeg === 'auto');
  const isEastWest = !isOptimal && (cfg.moduleAzimuthSur === "east_west" || cfg.structureType === "east_west" || cfg.structureType === "triangles_15_ew" || (cfg.estructura && cfg.estructura.subtype === "east_west"));

  let moduleTiltDeg;
  let moduleAzN;
  let moduleAzSur;
  const rawUserTilt = (cfg.moduleTiltDeg !== undefined && cfg.moduleTiltDeg !== "" && !isNaN(parseFloat(cfg.moduleTiltDeg))) ? parseFloat(cfg.moduleTiltDeg) : null;

  const _toAzSur = (azN) => (typeof RA !== 'undefined' && RA.Radiation && typeof RA.Radiation.normalizePanelAzSur === 'function')
    ? RA.Radiation.normalizePanelAzSur(azN, 'compass')
    : (((azN - 180) % 360 + 540) % 360 - 180);

  if (isOptimal) {
    // <i data-lucide=\"sun\" class=\"icon-sm\"></i> MODO HÍBRIDO INTELIGENTE CARA AL SOL (PVsyst / Helioscope)

    if (slopeDeg <= flatThreshold) {
      // Caso A: Cubierta plana (<=8°): Estructura orientada estrictamente al Sur (180°) con inclinación óptima
      moduleTiltDeg = optimalTilt;
      moduleAzN = 180;
      moduleAzSur = 0;
    } else if (isSouthQuadrant) {
      // Caso B: Cubierta inclinada con vertiente Sur favorable: Acoplada al faldón (estética limpia integrada coplanar)
      moduleTiltDeg = slopeDeg;
      moduleAzN = roofAz;
      moduleAzSur = (roof.azimuthSur !== undefined) ? roof.azimuthSur : _toAzSur(moduleAzN);
    } else {
      // Caso C: Cubierta inclinada desorientada (Norte, Este/Oeste cerrado): Diente de sierra rescatado al Sur
      moduleTiltDeg = optimalTilt;
      moduleAzN = 180;
      moduleAzSur = 0;
    }
  } else if (isCoplanar) {
    // <i data-lucide=\"home\" class=\"icon-sm\"></i> COPLANAR CON EL FALDÓN (Paralelo a cubierta, máxima integración)
    moduleTiltDeg = slopeDeg;
    moduleAzN = (roof.azimuthDeg !== undefined) ? roof.azimuthDeg : 180;
    moduleAzSur = (roof.azimuthSur !== undefined) ? roof.azimuthSur : _toAzSur(moduleAzN);
  } else {
    // <i data-lucide=\"settings\" class=\"icon-sm\"></i> PERSONALIZADA (Valores directos de los controles de usuario)
    const isZeroTiltOnSlope = (rawUserTilt === 0 && slopeDeg >= flatThreshold);
    if (isZeroTiltOnSlope) {
      moduleTiltDeg = slopeDeg;
    } else {
      moduleTiltDeg = (rawUserTilt !== null)
        ? (isEastWest ? 12 : rawUserTilt)
        : (slopeDeg >= flatThreshold ? slopeDeg : optimalTilt);
    }

    let rawAz = isEastWest ? 90 : 180;
    if (!isEastWest && cfg.moduleAzimuthGeo !== undefined && cfg.moduleAzimuthGeo !== "" && cfg.moduleAzimuthGeo !== "auto") {
      rawAz = parseFloat(cfg.moduleAzimuthGeo);
    } else if (!isEastWest && cfg.moduleAzimuthSur !== undefined && cfg.moduleAzimuthSur !== "" && cfg.moduleAzimuthSur !== "auto") {
      rawAz = parseFloat(cfg.moduleAzimuthSur);
    } else if (!isEastWest) {
      rawAz = (roof.azimuthDeg !== undefined) ? roof.azimuthDeg : 180;
    }
    moduleAzN = normalizeAzimuth(rawAz);
    moduleAzSur = isEastWest ? 90 : _toAzSur(moduleAzN);
  }

  const isPergola = (cfg.structureType === 'pergola' || (cfg.estructura && cfg.estructura.tipo === 'pergola'));
  const pergolaSubtype = cfg.pergolaSubtype || (cfg.estructura && cfg.estructura.subtype) || 'continuous';
  const isContinuousCanopy = isPergola && (pergolaSubtype !== 'spaced_rows');

  const isZeroTiltOnSlope = (rawUserTilt === 0 && slopeDeg >= flatThreshold);
  const deltaTilt = (isCoplanar || isZeroTiltOnSlope || isContinuousCanopy) ? 0 : (isEastWest ? 12 : Math.max(moduleTiltDeg - slopeDeg, 0));
  const coplanar = (deltaTilt < 1);

  const nMod = normalFromTiltAzimuth(moduleTiltDeg, moduleAzN);
  const up = v3(0, 0, 1);
  let W = v3Norm(v3Cross(up, nMod));
  if (v3Len(W) < GE_EPSILON) W = v3(1, 0, 0);
  const Ldir = v3Norm(v3Cross(nMod, W));

  const A_sun = v3(Math.sin(degToRad(moduleAzN)), Math.cos(degToRad(moduleAzN)), 0);
  const B_sun = v3Norm(v3Cross(up, A_sun));

  const uVec = roof.uVec, vVec = roof.vVec, N = roof.normal;

  const Au = v3Dot(A_sun, uVec), Av = v3Dot(A_sun, vVec);
  const Bu = v3Dot(B_sun, uVec), Bv = v3Dot(B_sun, vVec);
  const aMag = Math.hypot(Au, Av), bMag = Math.hypot(Bu, Bv);
  const AuvN_default = aMag > GE_EPSILON ? v3(Au / aMag, Av / aMag, 0) : v3(1, 0, 0);
  const BuvN_default = bMag > GE_EPSILON ? v3(Bu / bMag, Bv / bMag, 0) : v3(0, 1, 0);

  // Extraer las direcciones de las aristas del polígono para alinear la retícula con la forma real de la cubierta
  const candidateAngles = [0];
  const azAngle = Math.atan2(AuvN_default.y, AuvN_default.x);
  candidateAngles.push(azAngle);

  let maxEdgeLen = 0;
  let bestEdgeAngle = 0;
  for (let i = 0; i < poly.length; i++) {
    const p1 = poly[i];
    const p2 = poly[(i + 1) % poly.length];
    const du = p2.u - p1.u;
    const dv = p2.v - p1.v;
    const len = Math.hypot(du, dv);
    if (len > 0.5) {
      const ang = Math.atan2(dv, du);
      candidateAngles.push(ang);
      candidateAngles.push(ang + Math.PI / 2);
      if (len > maxEdgeLen) {
        maxEdgeLen = len;
        bestEdgeAngle = ang;
      }
    }
  }

  // Eliminar ángulos duplicados
  const uniqueAngles = [];
  candidateAngles.forEach(a => {
    const normA = ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    if (!uniqueAngles.some(ua => Math.abs(ua - normA) < 0.05)) {
      uniqueAngles.push(normA);
    }
  });

  const wantHybridOnly = Array.isArray(cfg.orientations) && cfg.orientations.length === 1 && cfg.orientations[0] === 'hybrid';
  const orientations = wantHybridOnly ? ["portrait", "landscape"] : (cfg.orientations || ["portrait", "landscape"]).filter(o => o !== 'hybrid');
  const layouts = [];

  // ── FASE 3 · Búsqueda en dos etapas para cubiertas grandes (>800 m²) ──
  // Antes: hasta 4 ángulos × 2 orientaciones × 25 fases = ~200 generaciones de rejilla
  // completa por faldón (millones de test de contención). Ahora:
  //   Etapa 1: rejilla con fase (0,0) por ángulo → mejor ángulo.
  //   Etapa 2: refinar las 25 fases SOLO para el ángulo ganador.
  // En cubiertas pequeñas se mantiene la búsqueda exhaustiva original.
  // Área 2D del faldón (fórmula del zapatero) — signedArea2D vive en el closure de roofEngine
  let _dblArea = 0;
  for (let _i = 0; _i < poly.length; _i++) {
    const _p = poly[_i], _q = poly[(_i + 1) % poly.length];
    _dblArea += _p.u * _q.v - _q.u * _p.v;
  }
  const roofAreaM2 = Math.abs(_dblArea) / 2;
  const twoStage = roofAreaM2 > 800;
  const phaseOffsets = [0.0, 0.20, 0.40, 0.60, 0.80];

  for (const orient of orientations) {
    const dims = orient === "landscape"
      ? { len: moduleWidth, wid: moduleLength }
      : { len: moduleLength, wid: moduleWidth };
    const modLen = dims.len, modWidth = dims.wid;

    const halfA_base = (modLen / 2) * Math.cos(degToRad(deltaTilt));
    const halfB_base = (modWidth / 2);
    const footprintA = 2 * halfA_base;

    let rowPitch = (coplanar || isContinuousCanopy)
      ? (footprintA + gap)
      : calculatePVsystRowPitch(modLen, deltaTilt, slopeDeg, moduleAzSur, lat, safety, cfg.rowPitchDesignWindowH);

    if (cfg && cfg.lockRowPitch && typeof cfg.lockedRowPitchM === 'number' && cfg.lockedRowPitchM > 0 && !coplanar && !isContinuousCanopy && !isEastWest) {
      rowPitch = Math.max(footprintA + gap, cfg.lockedRowPitchM);
    }

    if (isEastWest) {
      // Cálculo astronómico de sombra en solsticio de invierno (CTE DB-HE5 / UNE-EN 62446)
      const ridgeHeight = modLen * Math.sin(degToRad(deltaTilt || 15));
      const latRad = degToRad(lat || 40.0);
      const sinElevWin = Math.sin(latRad) * Math.sin(degToRad(-23.45)) + Math.cos(latRad) * Math.cos(degToRad(-23.45)) * Math.cos(degToRad(30));
      const elevWinRad = Math.max(0.174, Math.asin(Math.max(0.01, sinElevWin)));
      const shadowValley = (ridgeHeight / Math.tan(elevWinRad)) * 0.50;
      const minValleyGap = Math.max(0.35, Math.min(0.85, shadowValley));
      rowPitch = (2 * footprintA) + minValleyGap;
    }

    const colPitch = modWidth + gap;

    let bestAngleCenters = [];
    let bestAuvN = AuvN_default;
    let bestBuvN = BuvN_default;

    const isCustomMode = (cfg.arrangementMode === "custom" || cfg.arrangementMode === "manual");
    const isExplicitAz = (!isEastWest && cfg.moduleAzimuthSur !== undefined && cfg.moduleAzimuthSur !== "" && cfg.moduleAzimuthSur !== "auto");
    const directAzDeg = isExplicitAz ? parseFloat(cfg.moduleAzimuthSur) : 0;
    const directAngleRad = degToRad(directAzDeg);
    // Con estructura inclinada (deltaTilt ≥ 1°) el eje A del módulo DEBE coincidir con el azimut de captación:
    // alinear la retícula a la arista del faldón (ángulo 0 = eje u, horizontal paralelo a cumbrera) haría
    // bascular el módulo lateralmente (Este/Oeste) en lugar de hacia el sol.
    const alignToPlane = coplanar && (cfg.alignToPlane !== false) && !isExplicitAz && !isEastWest && !(isOptimal && (slopeDeg <= flatThreshold || !isSouthQuadrant));
    const anglesToTest = alignToPlane
      ? [0]
      : (isEastWest ? [azAngle] : (isExplicitAz ? [azAngle] : ((coplanar || (isOptimal && slopeDeg > flatThreshold && isSouthQuadrant)) ? uniqueAngles : [azAngle])));

    // Generador de rejilla para un (ángulo, faseA, faseB) — antes duplicado inline en cada candidato
    const generateGrid = (ang, poA, poB) => {
      const AuvN = v3(Math.cos(ang), Math.sin(ang), 0);
      const BuvN = v3(-Math.sin(ang), Math.cos(ang), 0);
      const aMin = Math.min(...poly.map(p => p.u * AuvN.x + p.v * AuvN.y));
      const aMax = Math.max(...poly.map(p => p.u * AuvN.x + p.v * AuvN.y));
      const bMin = Math.min(...poly.map(p => p.u * BuvN.x + p.v * BuvN.y));
      const bMax = Math.max(...poly.map(p => p.u * BuvN.x + p.v * BuvN.y));
      const currentCenters = [];
      const shiftA = (typeof cfg.matrixShiftA === 'number') ? cfg.matrixShiftA : ((typeof cfg.matrixShiftU === 'number') ? cfg.matrixShiftU : 0);
      const shiftB = (typeof cfg.matrixShiftB === 'number') ? cfg.matrixShiftB : ((typeof cfg.matrixShiftV === 'number') ? cfg.matrixShiftV : 0);
      const startA = aMin + setback + halfA_base + poA * rowPitch + shiftA;
      const startB = bMin + setback + halfB_base + poB * colPitch + shiftB;

      const hasWalkway = !!cfg.hasWalkway;
      const walkwayWidth = (typeof cfg.walkwayWidth === 'number') ? cfg.walkwayWidth : 0.80;
      const midB = (bMin + bMax) / 2;
      const canHaveWalkway = hasWalkway && ((bMax - bMin - 2 * setback) >= (walkwayWidth + 2 * halfB_base));

      for (let a = startA; a <= aMax - setback - halfA_base; a += rowPitch) {
        for (let b = startB; b <= bMax - setback - halfB_base; b += colPitch) {
          if (canHaveWalkway && Math.abs(b - midB) < (walkwayWidth / 2 + halfB_base * 0.80)) continue;
          if (isEastWest) {
            for (const ewSign of [-1, 1]) {
              const ridgeOffset = ewSign * (halfA_base + 0.02);
              const cu = (a + ridgeOffset) * AuvN.x + b * BuvN.x;
              const cv = (a + ridgeOffset) * AuvN.y + b * BuvN.y;
              const corners = [];
              for (const [sx, sy] of [[-1, -1], [-1, 1], [1, 1], [1, -1]]) {
                corners.push({
                  u: cu + (sx * halfA_base) * AuvN.x + (sy * halfB_base) * BuvN.x,
                  v: cv + (sx * halfA_base) * AuvN.y + (sy * halfB_base) * BuvN.y
                });
              }
              if (!isPanelFullyContainedInPolygon2D(corners, poly, setback)) continue;
              let filter = { accept: true, isShaded: false };
              if (cfg.panelFilter) {
                filter = cfg.panelFilter({ u: cu, v: cv }, corners, dims, cfg.filterCtx || {});
                if (!filter.accept) continue;
              }
              currentCenters.push({ a, b, u: cu, v: cv, corners, isShaded: !!filter.isShaded, isEastWest: true, ewSide: ewSign > 0 ? 'W' : 'E' });
            }
          } else {
            const cu = a * AuvN.x + b * BuvN.x;
            const cv = a * AuvN.y + b * BuvN.y;
            const corners = [];
            for (const [sx, sy] of [[-1, -1], [-1, 1], [1, 1], [1, -1]]) {
              corners.push({
                u: cu + (sx * halfA_base) * AuvN.x + (sy * halfB_base) * BuvN.x,
                v: cv + (sx * halfA_base) * AuvN.y + (sy * halfB_base) * BuvN.y
              });
            }
            if (!isPanelFullyContainedInPolygon2D(corners, poly, setback)) continue;
            let filter = { accept: true, isShaded: false };
            if (cfg.panelFilter) {
              filter = cfg.panelFilter({ u: cu, v: cv }, corners, dims, cfg.filterCtx || {});
              if (!filter.accept) continue;
            }
            currentCenters.push({ a, b, u: cu, v: cv, corners, isShaded: !!filter.isShaded });
          }
        }
      }
      return { centers: currentCenters, AuvN, BuvN };
    };

    if (twoStage) {
      // Etapa 1: mejor ángulo con fase (0,0)
      let bestAng = anglesToTest[0];
      let bestAngCount = -1;
      for (const ang of anglesToTest) {
        const g = generateGrid(ang, 0, 0);
        if (g.centers.length > bestAngCount) { bestAngCount = g.centers.length; bestAng = ang; }
      }
      // Etapa 2: refinar las 25 fases solo para el ángulo ganador
      for (const poA of phaseOffsets) {
        for (const poB of phaseOffsets) {
          const g = generateGrid(bestAng, poA, poB);
          if (g.centers.length > bestAngleCenters.length) {
            bestAngleCenters = g.centers;
            bestAuvN = g.AuvN;
            bestBuvN = g.BuvN;
          }
        }
      }
    } else {
      // Búsqueda exhaustiva original (cubiertas pequeñas: el coste es irrelevante)
      for (const ang of anglesToTest) {
        for (const poA of phaseOffsets) {
          for (const poB of phaseOffsets) {
            const g = generateGrid(ang, poA, poB);
            if (g.centers.length > bestAngleCenters.length) {
              bestAngleCenters = g.centers;
              bestAuvN = g.AuvN;
              bestBuvN = g.BuvN;
            }
          }
        }
      }
    }

    layouts.push({
      orientation: orient,
      moduleCount: bestAngleCenters.length,
      installedPowerWp: bestAngleCenters.length * (module.powerWp || 450),
      moduleLengthM: modLen,
      moduleWidthM: modWidth,
      moduleTiltDeg: moduleTiltDeg,
      moduleAzimuthSur: moduleAzSur,
      moduleAzimuthN: moduleAzN,
      deltaTilt: deltaTilt,
      coplanar: coplanar,
      isContinuousCanopy: isContinuousCanopy,
      isEastWest: isEastWest,
      rowPitch: rowPitch,
      colPitch: colPitch,
      footprintA: footprintA,
      gapBetweenRowsM: Math.max(rowPitch - footprintA, 0),
      centers: bestAngleCenters,
      frame: { Lu: bestAuvN.x, Lv: bestAuvN.y, Ln: 0, Wu: bestBuvN.x, Wv: bestBuvN.y, nMod, W, Ldir }
    });
  }

  // Generación de layout híbrido mixto (Vertical + Horizontal): EXCLUSIVO para montaje coplanar (deltaTilt < 1)
  const allowHybrid = (coplanar || deltaTilt < 1.0) && (wantHybridOnly || !cfg.orientations || cfg.orientations.includes('hybrid') || cfg.orientations.includes('auto'));
  if (allowHybrid && typeof window.RASolarOptimizer !== 'undefined' && typeof window.RASolarOptimizer.generateHybridLayout === 'function') {
    const hybridLayout = window.RASolarOptimizer.generateHybridLayout(roof, module, cfg, layouts);
    if (hybridLayout) {
      if (wantHybridOnly) {
        return { layouts: [hybridLayout], best: hybridLayout };
      }
      layouts.push(hybridLayout);
    }
  }

  layouts.sort((x, y) => y.moduleCount - x.moduleCount || (x.footprintA - y.footprintA));
  return { layouts: layouts, best: layouts[0] || null };
}

function resetSolarDashboard() {
  setElemText('sol-tilt', '0.0°');
  setElemText('sol-azimuth', '0.0° (Sur)');
  setElemText('sol-area-3d', '0.00 m²');
  setElemText('sol-panels-count', '0 uds');
  setElemText('sol-peak-power', '0.00 kWp');
  setElemText('sol-annual-yield', '0 kWh/año');
  setElemText('sol-hsp', '0 h/año');
  setElemText('sol-efficiency-ratio', '100%');
  setElemText('sol-economic-savings', '0 €/año');
  setElemText('sol-co2-savings', '0.00 t/año');
  setElemText('sol-string-voc', '0.0 V');
  setElemText('sol-string-imp', '0.0 A');
  renderSolarBarChart([0,0,0,0,0,0,0,0,0,0,0,0]);

    const panelEl = document.getElementById('yield-breakdown-panel');
  if (panelEl) panelEl.style.display = 'none';

  window.RA = window.RA || {};
  window.RA.solarStats = {
    numPanels: 0,
    annualYieldKWh: 0,
    monthlyYields: [0,0,0,0,0,0,0,0,0,0,0,0],
    peakPowerKW: 0,
    hsp: 0,
    annualSavingsEUR: 0
  };
  if (typeof window.raUpdateEnergyHUD === 'function') {
    window.raUpdateEnergyHUD();
  }

  // Si el visor 3D se encuentra en modo Heatmap, refrescar las etiquetas 3D de producción por módulo
  if (typeof window.wpRenderHeatmapVisuals === 'function' && window.solarSimState && window.solarSimState.viewMode === 'heatmap') {
    window.wpRenderHeatmapVisuals();
  }
}

function renderSolarBarChart(data) {
  const safeData = (Array.isArray(data) && data.length > 0) ? data : (Array.isArray(window.lastMonthlyYields) ? window.lastMonthlyYields : [0,0,0,0,0,0,0,0,0,0,0,0]);
  window.lastMonthlyYields = [...safeData];
  data = safeData;

  const chartTargets = [
    { svgId: 'bom-solar-svg-chart', infoId: 'bom-chart-hover-info' }
  ];

  // Extraer desglose mensual de energía bancable si está disponible
  let finModel = null;
  if (typeof calculateFinancialModel === 'function') {
    try { finModel = calculateFinancialModel(); } catch (eFin) {}
  }

  const breakdown = (finModel && Array.isArray(finModel.monthlyEnergyBreakdown) && finModel.monthlyEnergyBreakdown.length === 12)
    ? finModel.monthlyEnergyBreakdown
    : null;

  // Curvas mensuales normalizadas
  const solarWeights = [0.045, 0.058, 0.082, 0.098, 0.118, 0.126, 0.132, 0.120, 0.095, 0.068, 0.046, 0.032];
  const consWeights = [0.098, 0.090, 0.085, 0.076, 0.072, 0.078, 0.095, 0.092, 0.079, 0.076, 0.089, 0.090];
  const totalAnnualSolar = data.reduce((s, v) => s + v, 0);
  const totalAnnualCons = (finModel && finModel.consumoAnual > 0) ? finModel.consumoAnual : 3500;

  const monthsData = [];
  for (let i = 0; i < 12; i++) {
    const gen = Math.round(data[i] || (solarWeights[i] * totalAnnualSolar) || 0);
    let auto = 0, exc = 0, cons = 0;
    if (breakdown && breakdown[i]) {
      auto = Math.min(gen, Math.round(breakdown[i].autoconsumoKWh || 0));
      exc = Math.max(0, gen - auto);
      cons = Math.round(breakdown[i].consumoKWh || 0);
    } else {
      cons = Math.round(consWeights[i] * totalAnnualCons);
      auto = Math.min(cons, Math.round(gen * 0.70));
      exc = Math.max(0, gen - auto);
    }
    monthsData.push({
      gen: gen,
      auto: auto,
      exc: exc,
      cons: cons
    });
  }

  // Escala dinámica del eje Y: cubrir el valor más alto entre producción y consumo
  const maxSeriesVal = Math.max(...monthsData.map(m => Math.max(m.gen, m.cons)), 10);
  let yMax = 100;
  if (maxSeriesVal <= 50) yMax = 50;
  else if (maxSeriesVal <= 100) yMax = 100;
  else if (maxSeriesVal <= 250) yMax = 250;
  else if (maxSeriesVal <= 500) yMax = 500;
  else if (maxSeriesVal <= 1000) yMax = 1000;
  else if (maxSeriesVal <= 1500) yMax = 1500;
  else if (maxSeriesVal <= 2000) yMax = 2000;
  else if (maxSeriesVal <= 3000) yMax = 3000;
  else if (maxSeriesVal <= 5000) yMax = 5000;
  else if (maxSeriesVal <= 10000) yMax = 10000;
  else {
    const exp = Math.pow(10, Math.floor(Math.log10(maxSeriesVal)));
    const frac = maxSeriesVal / exp;
    yMax = (frac <= 2 ? 2 : (frac <= 5 ? 5 : 10)) * exp;
  }

  const chartHeight = 85;
  const barWidth = 22;
  const gap = 8;
  const startX = 40;
  const baseY = chartHeight + 10;

  chartTargets.forEach(tgt => {
    const svg = document.getElementById(tgt.svgId);
    if (!svg) return;

    const isInitialized = svg.getAttribute('data-initialized') === 'true';
    const totalConsKWh = monthsData.reduce((s, m) => s + m.cons, 0);
    const totalAutoKWh = monthsData.reduce((s, m) => s + m.auto, 0);
    const totalExcKWh = monthsData.reduce((s, m) => s + m.exc, 0);

    const defaultInfoText = totalAnnualSolar > 0
      ? ('GEN: ' + totalAnnualSolar.toLocaleString('es-ES') + ' kWh/a · CONS: ' + totalConsKWh.toLocaleString('es-ES') + ' kWh/a<br><span style="color:#10b981;">AUTO: ' + totalAutoKWh.toLocaleString('es-ES') + ' kWh</span> · <span style="color:#38bdf8;">VOLCADO: ' + totalExcKWh.toLocaleString('es-ES') + ' kWh</span>')
      : 'PASA EL RATÓN<br>POR LAS BARRAS';

    const infoEl = document.getElementById(tgt.infoId);
    if (infoEl) {
      infoEl.dataset.defaultText = defaultInfoText;
      infoEl.innerHTML = defaultInfoText;
    }

    if (!isInitialized) {
      svg.innerHTML = '';

      // Defs para gradientes modernos de autoconsumo y vertido
      const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      defs.innerHTML = '<linearGradient id="grad-bar-auto" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="#10b981"/>' +
        '<stop offset="100%" stop-color="#047857"/>' +
        '</linearGradient>' +
        '<linearGradient id="grad-bar-surplus" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="#38bdf8"/>' +
        '<stop offset="100%" stop-color="#0284c7"/>' +
        '</linearGradient>';
      svg.appendChild(defs);

      // Línea guía de referencia de escala máxima
      const refLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      refLine.setAttribute('x1', '10');
      refLine.setAttribute('y1', '15');
      refLine.setAttribute('x2', '394');
      refLine.setAttribute('y2', '15');
      refLine.setAttribute('stroke', 'rgba(255,255,255,0.08)');
      refLine.setAttribute('stroke-dasharray', '2,2');
      svg.appendChild(refLine);

      // Cota de valor máximo en el eje Y
      const yMaxLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      yMaxLabel.id = tgt.svgId + '-ymax';
      yMaxLabel.setAttribute('x', '10');
      yMaxLabel.setAttribute('y', '12');
      yMaxLabel.setAttribute('text-anchor', 'start');
      yMaxLabel.setAttribute('fill', 'rgba(255,255,255,0.7)');
      yMaxLabel.setAttribute('font-size', '12px');
      yMaxLabel.setAttribute('font-weight', 'bold');
      yMaxLabel.setAttribute('font-family', 'monospace');
      svg.appendChild(yMaxLabel);

      // Eje Y (vertical)
      const yAxisLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      yAxisLine.setAttribute('x1', '35');
      yAxisLine.setAttribute('y1', '15');
      yAxisLine.setAttribute('x2', '35');
      yAxisLine.setAttribute('y2', baseY);
      yAxisLine.setAttribute('stroke', 'rgba(16,185,129,0.3)');
      yAxisLine.setAttribute('stroke-width', '1');
      svg.appendChild(yAxisLine);

      // Eje X (horizontal)
      const axisLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      axisLine.setAttribute('x1', '10');
      axisLine.setAttribute('y1', baseY);
      axisLine.setAttribute('x2', '394');
      axisLine.setAttribute('y2', baseY);
      axisLine.setAttribute('stroke', 'rgba(16,185,129,0.3)');
      axisLine.setAttribute('stroke-width', '1');
      svg.appendChild(axisLine);

      // Grupo de barras apiladas (autoconsumo abajo + excedente arriba)
      const barsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      barsGroup.id = tgt.svgId + '-bars-group';
      svg.appendChild(barsGroup);

      for (let i = 0; i < 12; i++) {
        const x = startX + i * (barWidth + gap);

        // Rectángulo inferior: Autoconsumo
        const rectAuto = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rectAuto.id = tgt.svgId + '-bar-auto-' + i;
        rectAuto.setAttribute('x', x);
        rectAuto.setAttribute('width', barWidth);
        rectAuto.setAttribute('fill', 'url(#grad-bar-auto)');
        rectAuto.setAttribute('rx', '1');
        rectAuto.style.cursor = 'pointer';
        rectAuto.style.transition = 'height 0.25s ease-out, y 0.25s ease-out';
        barsGroup.appendChild(rectAuto);

        // Rectángulo superior: Excedente volcado a red
        const rectSurplus = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rectSurplus.id = tgt.svgId + '-bar-surplus-' + i;
        rectSurplus.setAttribute('x', x);
        rectSurplus.setAttribute('width', barWidth);
        rectSurplus.setAttribute('fill', 'url(#grad-bar-surplus)');
        rectSurplus.setAttribute('rx', '1');
        rectSurplus.style.cursor = 'pointer';
        rectSurplus.style.transition = 'height 0.25s ease-out, y 0.25s ease-out';
        barsGroup.appendChild(rectSurplus);

        // Rectángulo invisible para capturar hover de toda la columna
        const hitRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        hitRect.id = tgt.svgId + '-hit-' + i;
        hitRect.setAttribute('x', x);
        hitRect.setAttribute('y', '15');
        hitRect.setAttribute('width', barWidth);
        hitRect.setAttribute('height', baseY - 15);
        hitRect.setAttribute('fill', 'transparent');
        hitRect.style.cursor = 'pointer';

        hitRect.addEventListener('mouseenter', () => {
          if (!infoEl) return;
          const mData = monthsData[i];
          infoEl.style.transition = 'opacity 100ms ease';
          infoEl.style.opacity = '1';
          infoEl.innerHTML = '<span style="color:#f1f5f9;font-weight:bold;">' + MONTH_NAMES[i].toUpperCase() + '</span> · GEN: ' + mData.gen.toLocaleString('es-ES') + ' kWh | CONS: ' + mData.cons.toLocaleString('es-ES') + ' kWh<br><span style="color:#10b981;">✔ Autoconsumo: ' + mData.auto.toLocaleString('es-ES') + ' kWh</span> · <span style="color:#38bdf8;">⚡ Volcado: ' + mData.exc.toLocaleString('es-ES') + ' kWh</span>';
        });

        hitRect.addEventListener('mouseleave', () => {
          if (!infoEl) return;
          infoEl.style.transition = 'opacity 100ms ease';
          infoEl.style.opacity = '1';
          infoEl.innerHTML = infoEl.dataset.defaultText;
        });

        barsGroup.appendChild(hitRect);

        // Etiqueta del mes
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('class', 'bar-label');
        text.setAttribute('x', x + barWidth / 2);
        text.setAttribute('y', baseY + 12);
        text.textContent = MONTH_NAMES[i];
        svg.appendChild(text);
      }

      // Línea de consumo superpuesta (polilínea con puntos conectores)
      const consLine = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      consLine.id = tgt.svgId + '-cons-line';
      consLine.setAttribute('fill', 'none');
      consLine.setAttribute('stroke', '#f59e0b');
      consLine.setAttribute('stroke-width', '2');
      consLine.setAttribute('stroke-linecap', 'round');
      consLine.setAttribute('stroke-linejoin', 'round');
      consLine.setAttribute('stroke-dasharray', '3,2');
      svg.appendChild(consLine);

      // Puntos de consumo
      const pointsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      pointsGroup.id = tgt.svgId + '-points-group';
      for (let i = 0; i < 12; i++) {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.id = tgt.svgId + '-cons-point-' + i;
        circle.setAttribute('r', '2.5');
        circle.setAttribute('fill', '#f59e0b');
        circle.setAttribute('stroke', '#0f172a');
        circle.setAttribute('stroke-width', '1');
        pointsGroup.appendChild(circle);
      }
      svg.appendChild(pointsGroup);

      // Leyenda compacta inferior en el SVG
      const legendGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      legendGroup.setAttribute('transform', 'translate(50, 115)');
      legendGroup.innerHTML = '<rect x="0" y="-6" width="8" height="8" rx="1" fill="#10b981"/>' +
        '<text x="11" y="1" font-size="8.5" fill="#94a3b8" font-family="sans-serif">Autoconsumo</text>' +
        '<rect x="82" y="-6" width="8" height="8" rx="1" fill="#38bdf8"/>' +
        '<text x="93" y="1" font-size="8.5" fill="#94a3b8" font-family="sans-serif">Volcado a red</text>' +
        '<line x1="162" y1="-2" x2="174" y2="-2" stroke="#f59e0b" stroke-width="2" stroke-dasharray="3,2"/>' +
        '<circle cx="168" cy="-2" r="2" fill="#f59e0b"/>' +
        '<text x="178" y="1" font-size="8.5" fill="#94a3b8" font-family="sans-serif">Consumo</text>';
      svg.appendChild(legendGroup);

      svg.setAttribute('data-initialized', 'true');
    }

    // Actualizar cota máxima
    const yMaxLabel = document.getElementById(tgt.svgId + '-ymax');
    if (yMaxLabel) {
      yMaxLabel.textContent = yMax.toLocaleString('es-ES') + ' kWh';
    }

    // Actualizar alturas de barras apiladas y puntos de la línea de consumo
    const availableH = chartHeight - 15;
    const linePoints = [];

    monthsData.forEach((item, i) => {
      const x = startX + i * (barWidth + gap);
      const cx = x + barWidth / 2;

      const hAuto = (item.auto / yMax) * availableH;
      const hSurplus = (item.exc / yMax) * availableH;
      const hCons = (item.cons / yMax) * availableH;

      const yAuto = baseY - Math.max(hAuto, item.auto > 0 ? 1 : 0);
      const ySurplus = yAuto - Math.max(hSurplus, item.exc > 0 ? 1 : 0);
      const yCons = baseY - Math.max(hCons, 1);

      linePoints.push(cx.toFixed(1) + ',' + yCons.toFixed(1));

      const rectAuto = document.getElementById(tgt.svgId + '-bar-auto-' + i);
      if (rectAuto) {
        rectAuto.setAttribute('y', yAuto.toFixed(1));
        rectAuto.setAttribute('height', Math.max(hAuto, item.auto > 0 ? 1 : 0).toFixed(1));
      }

      const rectSurplus = document.getElementById(tgt.svgId + '-bar-surplus-' + i);
      if (rectSurplus) {
        rectSurplus.setAttribute('y', ySurplus.toFixed(1));
        rectSurplus.setAttribute('height', Math.max(hSurplus, item.exc > 0 ? 1 : 0).toFixed(1));
      }

      const point = document.getElementById(tgt.svgId + '-cons-point-' + i);
      if (point) {
        point.setAttribute('cx', cx.toFixed(1));
        point.setAttribute('cy', yCons.toFixed(1));
      }
    });

    const consLine = document.getElementById(tgt.svgId + '-cons-line');
    if (consLine) {
      consLine.setAttribute('points', linePoints.join(' '));
    }
  });
}

// ============================================================================
// MANEJADORES DE EVENTOS DE RATÓN Y TECLADO
// ============================================================================
// Manejador ScreenSpaceEventHandler unificado en initUnifiedWorkPlaneSystem

function finishActivePolygon() {
  if (polygonPoints.length < 3) {
    showStatus('SE REQUIEREN AL MENOS 3 VÉRTICES', 2000);
    return;
  }
  // [P2] Validación de auto-intersección (figura-8): antes se confirmaba en silencio y WallGeometry fallaba tragado
  if (polygonPoints.length >= 4 && typeof window.isSimplePolygon === 'function' && !window.isSimplePolygon(polygonPoints)) {
    showStatus('<i data-lucide="alert-triangle" class="icon-sm"></i> POLÍGONO AUTO-INTERSECADO: CORRIGE LOS VÉRTICES ANTES DE CONFIRMAR', 4000);
    return;
  }
  
  setAppMode('edit');
  confirmBar.classList.add('open');
  showStatus(`TRAZADO COMPLETADO · AJUSTA LOS VÉRTICES Y CONFIRMA EL DISEÑO`, 3500);
}

function undoLastPoint() {
  if (polygonPoints.length === 0) return;
  polygonPoints.pop();
  updateAllVisuals();
  showStatus('ÚLTIMO VÉRTICE DESHECHO', 1500);
}

// ── Atajos de Teclado ──────────────────────────────────────────────────────
// [RA LISTENER — keydown #1: atajos CAD/WP]
(window.RA && window.RA.addListener ? window.RA.addListener : function(t, ev, fn) { t.addEventListener(ev, fn); })(document, 'keydown', function _raKeydown1(e) {
  if (isTextInputActive(e.target)) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  if (typeof WP !== 'undefined' && WP && WP.mode !== 'idle') return;

  if (e.code === 'KeyP') {
    setAppMode('draw');
  } else if (e.code === 'KeyE') {
    const hasGizmoTarget = (window.selectedPanelIndex >= 0) || Boolean(window.selectedObstacleId) || Boolean(window.selectedBuildingId) || Boolean(window.selectedElectricalId);
    if (!hasGizmoTarget) setAppMode('edit');
  } else if (e.code === 'KeyD') {
    openDocModal();
  } else if (e.code === 'Escape') {
    if (appMode === 'draw') {
      if (polygonPoints.length > 0) undoLastPoint();
      else setAppMode('navigate');
    } else {
      setAppMode('navigate');
    }
  } else if (e.code === 'Enter') {
    if (appMode === 'draw' && polygonPoints.length >= 2) {
      finishActivePolygon();
    } else if (confirmBar && confirmBar.classList.contains('open')) {
      confirmRoofDesignAndSimulate();
    }
  }
});


// ── Navegación Teclado (auto-terminante compatible con requestRenderMode) ─
const keys = new Set();
let autoRotate = false;
let _navRafId = null;
let _navLastTs = 0;

function _stepNavLoop(ts) {
  _navRafId = null;
  if (!autoRotate && keys.size === 0) {
    _navLastTs = 0;
    return;
  }
  const dt = _navLastTs ? Math.min(0.1, Math.max(0.001, (ts - _navLastTs) / 1000)) : (1 / 60);
  _navLastTs = ts;
  const scale60 = dt * 60;
  let moved = false;

  if (autoRotate) {
    scene.camera.rotate(Cesium.Cartesian3.UNIT_Z, -0.0004 * scale60);
    moved = true;
  } else if (keys.size > 0) {
    const h = camera.positionCartographic.height;
    const move = Math.max(h * 0.006, 50) * scale60;
    const rot = 0.008 * scale60;

    if (keys.has('KeyS'))       { camera.moveBackward(move); moved = true; }
    if (keys.has('KeyA'))       { camera.moveLeft(move); moved = true; }
    if (keys.has('KeyD'))       { camera.moveRight(move); moved = true; }
    if (keys.has('KeyQ'))       { camera.moveUp(move * 0.6); moved = true; }
    if (keys.has('ArrowLeft'))  { camera.rotateLeft(rot); moved = true; }
    if (keys.has('ArrowRight')) { camera.rotateRight(rot); moved = true; }
    if (keys.has('ArrowUp'))    { camera.rotateUp(rot); moved = true; }
    if (keys.has('ArrowDown'))  { camera.rotateDown(rot); moved = true; }
  }

  if (moved) {
    updateWindRose();
    if (scene && typeof scene.requestRender === 'function') scene.requestRender();
  }
  if (autoRotate || keys.size > 0) {
    _navRafId = requestAnimationFrame(_stepNavLoop);
  } else {
    _navLastTs = 0;
  }
}

function _ensureNavLoop() {
  if (!_navRafId && (autoRotate || keys.size > 0)) {
    _navLastTs = 0;
    _navRafId = requestAnimationFrame(_stepNavLoop);
  }
}

document.addEventListener('keydown', e => {
  if (isTextInputActive(e.target)) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  keys.add(e.code);

  const hasVertexTriad = (typeof WP !== 'undefined' && WP && WP.selectedPolyIdx >= 0 && WP.selectedVtxIdx >= 0);

  switch (e.code) {
    case 'Space':
      e.preventDefault();
      autoRotate = !autoRotate;
      const rotEl = document.getElementById('ra-autorot');
      if (rotEl) rotEl.style.display = autoRotate ? 'block' : 'none';
      _ensureNavLoop();
      break;
    case 'KeyR':
      resetView();
      break;
    case 'Equal':
    case 'NumpadAdd':
      if (!hasVertexTriad) zoomCam(+1);
      break;
    case 'Minus':
    case 'NumpadSubtract':
      if (!hasVertexTriad) zoomCam(-1);
      break;
    case 'KeyH':
      // H sin modificadores queda reservada en exclusiva para LiveSolarProbe (heatmap); Shift+H alterna HUD compacto
      if (e.shiftKey) {
        if (window.RA && window.RA.ProjectStatusHUD && typeof window.RA.ProjectStatusHUD.toggleCompact === 'function') {
          window.RA.ProjectStatusHUD.toggleCompact();
        } else if (typeof toggleProjectStatusHUDCompact === 'function') {
          toggleProjectStatusHUDCompact();
        }
      }
      break;
    case 'KeyL':
      if (typeof toggleLabelsVisibility === 'function') {
        toggleLabelsVisibility();
      }
      break;
    case 'KeyT':
      if (typeof togglePhotorealisticPanelsTexture === 'function') {
        togglePhotorealisticPanelsTexture();
      }
      break;
  }
  _ensureNavLoop();
});

document.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('blur', () => {
  keys.clear();
  window._raShiftKeyDown = false;
  window._raIsShiftDown = false;
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    keys.clear();
    window._raShiftKeyDown = false;
    window._raIsShiftDown = false;
  }
});

function zoomCam(dir) {
  const h = camera.positionCartographic.height;
  const d = Math.max(h * 0.15, 40);
  if (dir > 0) camera.moveForward(d);
  else camera.moveBackward(d);
}

function resetView() {
  autoRotate = false;
  const rotEl = document.getElementById('ra-autorot');
  if (rotEl) rotEl.style.display = 'none';
  camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(2.1700, 41.3870, 20000000),
    orientation: { heading: 0, pitch: Cesium.Math.toRadians(-90), roll: 0 },
    duration: 2.5,
    easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
  });
}

clock.onTick.addEventListener(() => {
  updateWindRose();
});

// ── Botones D-Pad ─────────────────────────────────────────────────────────
function setupHoldBtn(id, fn) {
  const el = document.getElementById(id);
  if (!el) return;
  let raf;
  const tick = () => { fn(); raf = requestAnimationFrame(tick); };
  const stop = () => cancelAnimationFrame(raf);

  el.addEventListener('mousedown', tick);
  el.addEventListener('mouseup', stop);
  el.addEventListener('mouseleave', stop);
  el.addEventListener('touchstart', e => { e.preventDefault(); tick(); }, { passive: false });
  el.addEventListener('touchend', stop);
}

setupHoldBtn('btn-fw', () => { const h = camera.positionCartographic.height; camera.moveForward(Math.max(h * 0.006, 50)); });
setupHoldBtn('btn-bk', () => { const h = camera.positionCartographic.height; camera.moveBackward(Math.max(h * 0.006, 50)); });
setupHoldBtn('btn-lt', () => { const h = camera.positionCartographic.height; camera.moveLeft(Math.max(h * 0.006, 50)); });
setupHoldBtn('btn-rt', () => { const h = camera.positionCartographic.height; camera.moveRight(Math.max(h * 0.006, 50)); });
setupHoldBtn('btn-zi', () => zoomCam(+1));
setupHoldBtn('btn-zo', () => zoomCam(-1));

// ── Buscador Universal AAA (Lógica delegada a js/viewer.js) ───────────────────
if (typeof initUniversalSearch === 'function') {
  initUniversalSearch();
}

// ============================================================================
// GENERADOR DE DOCUMENTACIÓN TÉCNICA PV
// Normativa: RD 842/2002·ITC-BT-40·RD 244/2019·RD 1183/2020·UNE-EN 62446
// ============================================================================


// ── Control de Pestañas y Barra Lateral ─────────────────────────────────────

// ── Funciones de Control de Cámara y Pantalla ──────────────────────────────
// [DELEGACIÓN MODULAR AAA]: executeSearch, resetNorth, updateWindRose y toggle2D3D residen en js/viewer.js.


function toggleAutoRotate() {
  autoRotate = !autoRotate;
  const rotEl = document.getElementById('ra-autorot');
  if (rotEl) rotEl.style.display = autoRotate ? 'block' : 'none';
  if (autoRotate && typeof _ensureNavLoop === 'function') _ensureNavLoop();
  showStatus(autoRotate ? 'AUTO-ROTACIÓN ACTIVA' : 'AUTO-ROTACIÓN DETENIDA', 2000);
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
}

function confirmPolygonDesign() {
  const confBar = document.getElementById('ra-confirm-bar');
  if (confBar) {
    confBar.style.display = 'none';
    confBar.classList.remove('open');
  }
  if (typeof bldFootprintState !== 'undefined' && bldFootprintState && bldFootprintState.editing) {
    if (typeof toggleBuildingFootprintEditing === 'function') toggleBuildingFootprintEditing(false);
  }
  if (typeof WP !== 'undefined' && WP) {
    if (WP.mode === 'draw-building' && typeof finishActiveBuilding === 'function') {
      finishActiveBuilding();
      return;
    }
    if (WP.mode === 'draw-poly' && WP.activePolyPts && WP.activePolyPts.length >= 3) {
      if (typeof wpCloseActivePolyline === 'function') wpCloseActivePolyline();
      return;
    }
    if (WP.polylines && WP.polylines.length > 0) {
      isPolygonDesignConfirmed = true;
      if (typeof wpGoToStep === 'function') wpGoToStep(2);
      return;
    }
  }
  confirmRoofDesignAndSimulate();
}

function switchSidebarTab(tabName) {
  // Legacy shim for canonical 5-step flow
  const map = {
    'geometria': 1,
    'solar': 2,
    'analisis': 3,
    'presupuesto': 4,
    'documentacion': 5
  };
  if (map[tabName] && typeof wpGoToStep === 'function') {
    wpGoToStep(map[tabName]);
  }
}

function syncSidebarViewportVar() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  const sb = document.getElementById('ra-sidebar');
  const isMobile = window.innerWidth <= 768;
  const isCollapsed = !sb || sb.classList.contains('collapsed');
  const w = (isMobile || isCollapsed) ? 0 : Math.round(sb.getBoundingClientRect().width || 400);
  document.documentElement.style.setProperty('--sidebar-current-w', w + 'px');
}
window.syncSidebarViewportVar = syncSidebarViewportVar;

function toggleSidebarCollapse() {
  const sb = document.getElementById('ra-sidebar');
  if (!sb) return;
  sb.classList.toggle('collapsed');
  const isCollapsed = sb.classList.contains('collapsed');
  document.body.classList.toggle('sb-open', !isCollapsed);
  const mobBtn = document.getElementById('ra-mobile-menu-btn');
  if (mobBtn) {
    mobBtn.style.display = isCollapsed ? 'flex' : 'none';
  }
  const btn = document.getElementById('btn-sidebar-toggle');
  if (btn) {
    btn.textContent = isCollapsed ? '▶' : '✕';
  }
  const toggleIcon = document.getElementById('sidebar-toggle-icon');
  if (toggleIcon) {
    toggleIcon.textContent = isCollapsed ? '▶' : '◀';
  }
  const backdrop = document.getElementById('ra-mobile-sidebar-backdrop');
  if (backdrop) {
    backdrop.classList.toggle('active', !isCollapsed);
  }
  syncSidebarViewportVar();
}

// ── Redimensionamiento interactivo de la Barra Lateral (Opción 2) ──
function initSidebarResize() {
  const sb = document.getElementById('ra-sidebar');
  const resizer = document.getElementById('ra-sidebar-resizer');
  if (!sb || !resizer) return;

  const DEFAULT_WIDTH = 460;
  const MIN_WIDTH = 360;

  // Restaurar ancho guardado en almacenamiento local si existe
  try {
    const savedWidth = localStorage.getItem('ra_sidebar_width');
    if (savedWidth && window.innerWidth > 768) {
      const parsed = parseInt(savedWidth, 10);
      if (!isNaN(parsed) && parsed >= MIN_WIDTH) {
        const maxW = Math.max(MIN_WIDTH, Math.floor(window.innerWidth * 0.75));
        sb.style.width = Math.min(parsed, maxW) + 'px';
      }
    } else if (window.innerWidth > 1280) {
      sb.style.width = DEFAULT_WIDTH + 'px';
    }
  } catch(_) {}

  let isDragging = false;
  let startX = 0;
  let startWidth = 0;

  function onPointerDown(clientX) {
    if (window.innerWidth <= 768) return;
    if (sb.classList.contains('collapsed')) return;
    isDragging = true;
    startX = clientX;
    startWidth = sb.getBoundingClientRect().width;
    resizer.classList.add('is-resizing');
    document.body.classList.add('is-sidebar-resizing');
  }

  function onPointerMove(clientX) {
    if (!isDragging) return;
    const delta = clientX - startX;
    const maxW = Math.max(MIN_WIDTH, Math.floor(window.innerWidth * 0.80));
    const newW = Math.max(MIN_WIDTH, Math.min(startWidth + delta, maxW));
    sb.style.width = newW + 'px';
    syncSidebarViewportVar();
  }

  function onPointerUp() {
    if (!isDragging) return;
    isDragging = false;
    resizer.classList.remove('is-resizing');
    document.body.classList.remove('is-sidebar-resizing');
    const finalW = Math.round(sb.getBoundingClientRect().width);
    if (finalW >= MIN_WIDTH) {
      try { localStorage.setItem('ra_sidebar_width', finalW); } catch(_) {}
    }
  }

  resizer.addEventListener('mousedown', function(e) {
    onPointerDown(e.clientX);
    e.preventDefault();
  });

  window.addEventListener('mousemove', function(e) {
    onPointerMove(e.clientX);
  });

  window.addEventListener('mouseup', onPointerUp);

  // Soporte táctil / stylus para tablets
  resizer.addEventListener('touchstart', function(e) {
    if (e.touches && e.touches[0]) onPointerDown(e.touches[0].clientX);
  }, { passive: true });

  window.addEventListener('touchmove', function(e) {
    if (e.touches && e.touches[0]) onPointerMove(e.touches[0].clientX);
  }, { passive: true });

  window.addEventListener('touchend', onPointerUp);

  // Doble clic para restablecer al ancho recomendado
  resizer.addEventListener('dblclick', function() {
    if (window.innerWidth <= 768) return;
    sb.style.width = DEFAULT_WIDTH + 'px';
    try { localStorage.setItem('ra_sidebar_width', DEFAULT_WIDTH); } catch(_) {}
    if (typeof showToast === 'function') {
      showToast('BARRA LATERAL', `Ancho restablecido a ${DEFAULT_WIDTH} px.`, 'info', 1800);
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSidebarResize);
} else {
  initSidebarResize();
}


// [ARQUITECTURA AAA] openDocModal delegada a js/docs-generator.js
// [ARQUITECTURA AAA] closeDocModal delegada a js/docs-generator.js

// [ARQUITECTURA AAA] readTitular delegada a js/docs-generator.js

// ============================================================================
// MOTOR DE FÍSICA SOLAR, ELECTROTECNIA Y MODELOS DE RADIACIÓN (DR. ING. INDUSTRIAL)
// Normativa: CTE DB-HE5 (2022) · REBT ITC-BT-40/23 · UNE-EN 61724-1 · UNE-HD 60364-5-52
// ============================================================================

// [F3-08] SOLAR_ENGINE_CONSTANTS canónico (congelado) reside en js/solar-engine.js.

/**
 * 1. Geometría Solar de Alta Precisión (Algoritmo Spencer / Ecuación del Tiempo PSA)
 * Precisión angular < 0.01° frente a efemérides NREL SPA.
 */
// [DEDUP] computeHighPrecisionSolarPosition -> solar-engine.js

/**
 * 2. Transposición Anisotrópica en Plano del Generador (POA - Perez / Hay-Davies)
 */
// [DEDUP] computePOAIrradiance -> solar-engine.js

/**
 * 3. Modelo Térmico de Operación de Célula (Faiman / King - Sandia)
 */
// [DEDUP] computeCellTemperature -> solar-engine.js

/**
 * 4. Dimensionamiento Electrotécnico Riguroso según REBT ITC-BT-40 / UNE-HD 60364-5-52
 */
/**
 * 5. Algoritmo de Enrutamiento Óptimo de Strings FV (Snake & Meander Pattern / IEC 62548)
 * Minimiza el área de espira inductiva (A_loop ≈ 0) y optimiza la longitud del cable DC.
 */
function computeOptimalStringRouting(panels, modsPerString = 20) {
  if (!panels || panels.length === 0) return [];

  const sampleH = panels[0].h || 2.10;
  const rowTol = sampleH * 0.45;

  const sortedByV = [...panels].sort((a, b) => b.v - a.v);

  const rows = [];
  let currentRow = [];
  let currentRowV = null;

  for (const p of sortedByV) {
    if (currentRowV === null || Math.abs(p.v - currentRowV) <= rowTol) {
      currentRow.push(p);
      currentRowV = (currentRowV === null) ? p.v : (currentRowV * currentRow.length + p.v) / (currentRow.length + 1);
    } else {
      rows.push(currentRow);
      currentRow = [p];
      currentRowV = p.v;
    }
  }
  if (currentRow.length > 0) rows.push(currentRow);

  const snakeOrderedPanels = [];
  rows.forEach((row, rIdx) => {
    if (rIdx % 2 === 0) {
      row.sort((a, b) => a.u - b.u);
    } else {
      row.sort((a, b) => b.u - a.u);
    }
    snakeOrderedPanels.push(...row);
  });

  const totalPanels = snakeOrderedPanels.length;
  const numStrings = Math.max(1, Math.ceil(totalPanels / modsPerString));
  const baseMods = Math.floor(totalPanels / numStrings);
  const remainder = totalPanels % numStrings;

  const strings = [];
  let curIdx = 0;
  for (let s = 0; s < numStrings; s++) {
    const stringLen = baseMods + (s < remainder ? 1 : 0);
    const stringPanels = snakeOrderedPanels.slice(curIdx, curIdx + stringLen);
    curIdx += stringLen;

    let interModuleCableM = 0;
    for (let i = 0; i < stringPanels.length - 1; i++) {
      const pA = stringPanels[i], pB = stringPanels[i + 1];
      const dist = Math.hypot((pA.u || 0) - (pB.u || 0), (pA.v || 0) - (pB.v || 0));
      interModuleCableM += dist;
    }
    const pStart = stringPanels[0], pEnd = stringPanels[stringPanels.length - 1];
    const returnCableM = Math.hypot((pStart.u || 0) - (pEnd.u || 0), (pStart.v || 0) - (pEnd.v || 0));

    strings.push({
      stringIdx: s,
      stringNum: s + 1,
      panels: stringPanels,
      startPanel: pStart,
      endPanel: pEnd,
      interModuleCableM: Math.round(interModuleCableM * 10) / 10,
      returnCableM: Math.round(returnCableM * 10) / 10,
      totalStringCableM: Math.round((interModuleCableM + returnCableM) * 10) / 10
    });
  }

  return strings;
}


// ============================================================================
// <i data-lucide=\"zap\" class=\"icon-sm\"></i> MOTOR DE UBICACIÓN 3D DE INVERSOR, CUADRO ELÉCTRICO Y TIRADA DE CABLE
// ============================================================================

window.inverterEquipmentState = {
  position: null,
  carto: null,
  entity: null,
  isPlacing: false,
  dcCableEntities: [],
  L_dc_measured: 0,
  L_ac_measured: 0 // 0 = sin medir (se mide al ubicar el contador); antes fingia 15 m
};


// ============================================================================
// <i data-lucide=\"zap\" class=\"icon-sm\"></i> AMPLIACIONES ELÉCTRICAS AVANZADAS: CONTADOR AC, COMBINER BOX Y CAD 3D
// ============================================================================

window.inverterEquipmentState.gridMeter = {
  position: null,
  carto: null,
  entity: null,
  acCableEntity: null,
  isPlacing: false,
  L_ac_measured: 0
};

window.inverterEquipmentState.combinerBox = {
  position: null,
  carto: null,
  entity: null,
  isPlacing: false,
  isEnabled: false,
  trunkCableEntity: null
};
// ── window.RA alias (Arquitectura v2) ────────────────────────────────────
window.RA.inverterState = window.inverterEquipmentState;

// A. UBICAR CONTADOR DE RED / CGMP (LÍNEA AC)
function wpPlaceGridMeterAtPosition(cartesian, skipRecurse = false) {
  if (!cartesian || typeof Cesium === 'undefined' || typeof viewer === 'undefined' || !viewer) return;

  const carto = Cesium.Cartographic.fromCartesian(cartesian);
  const latDeg = Cesium.Math.toDegrees(carto.latitude);
  const lonDeg = Cesium.Math.toDegrees(carto.longitude);
  const heightM = carto.height;

  window.inverterEquipmentState.gridMeter.position = cartesian;
  window.inverterEquipmentState.gridMeter.carto = { latitude: latDeg, longitude: lonDeg, height: heightM };
  window.inverterEquipmentState.gridMeter.isPlacing = false;
  if (typeof viewer !== 'undefined' && viewer && viewer.canvas) {
    viewer.canvas.style.cursor = 'default';
  }

  if (window.inverterEquipmentState.gridMeter.entity) {
    try { viewer.entities.remove(window.inverterEquipmentState.gridMeter.entity); } catch(e) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(e, 'Entidad/Primitiva Cesium'); }
  }

  // Marcador 3D del Contador de Red
  try {
    const meterSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="#0F172A" stroke="#38BDF8" stroke-width="2"><circle cx="12" cy="12" r="9" fill="#0B1120"/><path d="M12 6v6l4 2" stroke="#38BDF8"/></svg>';
    const transform = Cesium.Transforms.eastNorthUpToFixedFrame(cartesian);
    const quat = Cesium.Quaternion.fromRotationMatrix(Cesium.Matrix4.getMatrix3(transform, new Cesium.Matrix3()));
    // [FIX-VIS] Caja apoyada sobre la superficie (+½ altura)
    const meterBoxPos = Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, carto.height + 0.23);
    const meterEntity = viewer.entities.add({
      id: 'ra_grid_meter_box',
      name: 'Contador de Red & Acometida Eléctrica',
      position: meterBoxPos,
      orientation: quat,
      billboard: {
        image: getSafeSvgDataUri(meterSvg),
        scale: 0.8,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        eyeOffset: new Cesium.Cartesian3(0, 0, -10.0),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        scaleByDistance: new Cesium.NearFarScalar(80, 1.0, 4000, 0.35)
      },
      box: {
        dimensions: wpBoxDimsScaled(new Cesium.Cartesian3(0.35, 0.20, 0.45), meterBoxPos),
        material: Cesium.Color.fromCssColorString('#E2E8F0'), // Gris piedra
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString('#64748B'),
        shadows: Cesium.ShadowMode.ENABLED
      }
    });
    const curStep = (typeof wpCurrentStep !== 'undefined') ? wpCurrentStep : ((typeof window !== 'undefined' && window.wpCurrentStep) || 1);
    const shouldShow = (curStep >= 4);
    meterEntity.show = shouldShow;
    window.inverterEquipmentState.gridMeter.entity = meterEntity;

    if (window.inverterEquipmentState.gridMeter.label2D) {
      removeLabel2DEntity(window.inverterEquipmentState.gridMeter.label2D);
    }
    const meterLabelText = '📍 CGMP & CONTADOR RED\n' + ((window.solarProjectConfig && window.solarProjectConfig.selectedProtectionAcId) ? 'CGBT Protegido (IGA+SI+SPD)' : (heightM.toFixed(1) + ' m'));
    window.inverterEquipmentState.gridMeter.label2D = addLabelEntity(cartesian, meterLabelText, -52, {
      bg: 'rgba(15, 23, 42, 0.92)',
      borderColor: '#0284C7',
      textColor: '#FFFFFF',
      font: "bold 10px 'JetBrains Mono', monospace",
      category: 'electrical',
      equipmentType: 'meter'
    });
    if (window.inverterEquipmentState.gridMeter.label2D) window.inverterEquipmentState.gridMeter.label2D.show = shouldShow;
  } catch(eEnt) {
    window.RA && window.RA.log && window.RA.log.debug('Error al renderizar marcador de contador:', eEnt);
  }

  // Recalcular cables teniendo en cuenta el Contador AC (renderAllCables dibuja DC y AC en un paso)
  if (!skipRecurse && typeof wpCalculateAndRenderInverterCables === 'function') {
    wpCalculateAndRenderInverterCables();
  }
  if (typeof recalculateSolarYield === 'function') recalculateSolarYield();
  if (typeof BOMTreeEngine !== 'undefined' && typeof BOMTreeEngine.refresh === 'function') BOMTreeEngine.refresh();
  if (typeof wpUpdateMeterPlacementGuideUI === 'function') wpUpdateMeterPlacementGuideUI();
  if (typeof showToast === 'function' && !skipRecurse) {
    showToast('CONTADOR DE RED UBICADO', 'Tirada de cable AC medida a ' + (window.inverterEquipmentState.L_ac_measured || 0).toFixed(1) + ' m.', 'success', 3500);
  }
}

// [B1] wpCalculateAndRenderACCables reside de forma canónica en js/cable-engine.js

// B. UBICAR CAJA DE STRINGS / COMBINER BOX EN CUBIERTA

// C. UBICAR MÓDULO O BANCADA DE BATERÍAS EN ESCENA 3D
// [FASE B3] Puente UI y colocación eléctrica 3D extraído a js/electrical-ui-bridge.js

function wpStartGridMeterPlacement() {
  if (!window.inverterEquipmentState) window.inverterEquipmentState = {};
  if (!window.inverterEquipmentState.gridMeter) window.inverterEquipmentState.gridMeter = {};
  window.inverterEquipmentState.gridMeter.isPlacing = true;
  window.inverterEquipmentState.isPlacing = false;
  if (window.inverterEquipmentState.combinerBox) window.inverterEquipmentState.combinerBox.isPlacing = false;

  // Feedback UI/UX: Cursor en diana y aviso interactivo
  if (typeof viewer !== 'undefined' && viewer && viewer.canvas) {
    viewer.canvas.style.cursor = 'crosshair';
  }
  const btn = document.getElementById('btn-step2-place-meter') || document.getElementById('btn-place-meter');
  if (btn) btn.classList.add('active');
  if (typeof showToast === 'function') {
    showToast('UBICACIÓN DEL CONTADOR DE LUZ', '🎯 Haz clic en la fachada exterior o murete donde esté la acometida de red / contador.', 'info', 4000);
  }
  showStatus('<i data-lucide="plug" class="icon-sm"></i> HAZ CLIC EN LA FACHADA 3D PARA SITUAR EL CONTADOR / CGMP', 4000);
}


function get3DElectricalClickPosition(screenPos) {
  if (typeof viewer === 'undefined' || !viewer) return null;
  let pos = null;
  // [FIX-PLACEMENT] Con requestRenderMode activo, scene.pickPosition lee el buffer de pick
  // del ÚLTIMO frame renderizado. Si la cámara se movió desde entonces (órbita/zoom), el
  // píxel apunta a OTRO punto del mundo y el cuadro aparece lejos del clic ("otro sitio").
  // Forzar un frame síncrono garantiza que el buffer corresponde a la cámara actual.
  if (viewer.scene && viewer.scene.requestRenderMode && typeof viewer.scene.render === 'function') {
    try { if (!(window.RA && window.RA._webglContextLost)) viewer.scene.render(); } catch(eForce) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(eForce, 'pick fresco'); }
  }
  if (viewer.scene && typeof viewer.scene.pickPosition === 'function') {
    try { pos = viewer.scene.pickPosition(screenPos); } catch(e) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(e, 'Entidad/Primitiva Cesium'); }
  }
  if (!pos && typeof get3DPosition === 'function') {
    try { pos = get3DPosition(screenPos); } catch(e) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(e, 'Entidad/Primitiva Cesium'); }
  }
  if (!pos && viewer.camera && viewer.scene && viewer.scene.globe) {
    try { pos = viewer.camera.pickEllipsoid(screenPos, viewer.scene.globe.ellipsoid); } catch(e) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(e, 'Entidad/Primitiva Cesium'); }
  }
  return pos;
}

// Throttle de pickPosition: límite ~30 picks/s (cada 140ms) para MOUSE_MOVE
// Elimina cuellos de botella de gl.readPixels en el hilo de la CPU
let lastPickPositionTime = 0;
const pickPositionMinDelta = 140; // ms



function getSafeSvgDataUri(svgStr) {
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svgStr);
}

// [FIX-VIS] Dimensiones de caja de equipo eléctrico ESCALADAS POR DISTANCIA SIN ROMPER SLEEP GPU:
// Usa Cesium.ConstantProperty actualizado solo en eventos camera.changed (throttle 120ms),
// eliminando el CallbackProperty(isConstant=false) que obligaba a Cesium a renderizar a 60fps en reposo.
const _raScaledBoxes = [];
let _raScaledBoxesBound = false;
let _raScaledBoxesTimer = null;

function _raComputeScaledBoxDims(baseDims, anchorPos) {
  try {
    const d = (typeof viewer !== 'undefined' && viewer && viewer.camera && anchorPos)
      ? Cesium.Cartesian3.distance(viewer.camera.positionWC, anchorPos)
      : 0;
    const scale = Math.max(1, Math.min(40, d / 120));
    return {
      scale,
      dims: new Cesium.Cartesian3(baseDims.x * scale, baseDims.y * scale, baseDims.z * scale)
    };
  } catch (e) {
    return { scale: 1, dims: baseDims };
  }
}

function _raUpdateAllScaledBoxes() {
  if (typeof viewer === 'undefined' || !viewer || !viewer.camera || _raScaledBoxes.length === 0) return;
  let dirty = false;
  for (let i = 0; i < _raScaledBoxes.length; i++) {
    const entry = _raScaledBoxes[i];
    const calc = _raComputeScaledBoxDims(entry.baseDims, entry.anchorPos);
    if (Math.abs(calc.scale - entry.lastScale) / Math.max(0.01, entry.lastScale) > 0.03) {
      entry.lastScale = calc.scale;
      entry.prop.setValue(calc.dims);
      dirty = true;
    }
  }
  if (dirty && viewer.scene && typeof viewer.scene.requestRender === 'function') {
    viewer.scene.requestRender();
  }
}

function _raBindScaledBoxesCameraListener() {
  if (_raScaledBoxesBound || typeof viewer === 'undefined' || !viewer || !viewer.camera || !viewer.camera.changed) return;
  _raScaledBoxesBound = true;
  viewer.camera.changed.addEventListener(function() {
    if (_raScaledBoxesTimer) return;
    _raScaledBoxesTimer = setTimeout(function() {
      _raScaledBoxesTimer = null;
      _raUpdateAllScaledBoxes();
    }, 120);
  });
}

function wpBoxDimsScaled(baseDims, anchorPos) {
  const calc = _raComputeScaledBoxDims(baseDims, anchorPos);
  if (typeof Cesium === 'undefined' || typeof Cesium.ConstantProperty !== 'function') {
    return calc.dims;
  }
  const prop = new Cesium.ConstantProperty(calc.dims);
  _raScaledBoxes.push({ prop, baseDims, anchorPos, lastScale: calc.scale });
  if (_raScaledBoxes.length > 24) {
    _raScaledBoxes.splice(0, _raScaledBoxes.length - 24);
  }
  _raBindScaledBoxesCameraListener();
  return prop;
}

function wpPlaceInverterAtPosition(cartesian) {
  if (!cartesian || typeof Cesium === 'undefined' || typeof viewer === 'undefined' || !viewer) return;

  const carto = Cesium.Cartographic.fromCartesian(cartesian);
  const latDeg = Cesium.Math.toDegrees(carto.latitude);
  const lonDeg = Cesium.Math.toDegrees(carto.longitude);
  const heightM = carto.height;

  window.inverterEquipmentState.position = cartesian;
  window.inverterEquipmentState.carto = { latitude: latDeg, longitude: lonDeg, height: heightM };
  window.inverterEquipmentState.isPlacing = false;
  if (typeof viewer !== 'undefined' && viewer && viewer.canvas) {
    viewer.canvas.style.cursor = 'default';
  }

  // Actualizar indicadores UI
  const tagEl = document.getElementById('inverter-status-tag');
  if (tagEl) {
    tagEl.textContent = 'UBICADO (' + heightM.toFixed(1) + 'm)';
    tagEl.style.background = 'rgba(16, 185, 129, 0.25)';
    tagEl.style.color = '#34D399';
  }
  const statZ = document.getElementById('inverter-stat-z');
  if (statZ) statZ.textContent = heightM.toFixed(1) + ' m';
  const statLdc = document.getElementById('inverter-stat-ldc');
  if (statLdc) statLdc.textContent = (window.inverterEquipmentState.L_dc_measured || 0).toFixed(1) + ' m';

  const btn = document.getElementById('btn-place-inverter');
  if (btn) {
    btn.classList.remove('active');
    btn.innerHTML = '<span><i data-lucide=\"zap\" class=\"icon-sm\"></i> INVERSOR: ' + heightM.toFixed(1) + 'm</span>';
    btn.style.borderColor = 'var(--emerald-500)';
    btn.style.color = 'var(--emerald-400)';
  }

  // Eliminar entidad previa si existe
  if (window.inverterEquipmentState.entity) {
    try { viewer.entities.remove(window.inverterEquipmentState.entity); } catch(e) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(e, 'Entidad/Primitiva Cesium'); }
  }

  // Crear Marcador 3D del Inversor / Cuadro
  try {
    // Orientación: Z = Normal al globo terráqueo en este punto.
    const transform = Cesium.Transforms.eastNorthUpToFixedFrame(cartesian);
    const quat = Cesium.Quaternion.fromRotationMatrix(Cesium.Matrix4.getMatrix3(transform, new Cesium.Matrix3()));
    // [FIX-VIS] Caja APOYADA sobre la superficie (+½ altura): antes estaba centrada en el
    // punto de contacto → medio empotrada en la pared/tejado e invisible desde arriba.
    const invBoxPos = Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, carto.height + 0.33);
    const invMarkerSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="#0F172A" stroke="#F59E0B" stroke-width="2"><path d="M13 2L4.5 12.5H11L9.5 22L19.5 9.5H12.5L13 2Z" fill="#F59E0B" stroke="#78350F"/></svg>';
    const invEntity = viewer.entities.add({
      id: 'ra_inverter_main_box',
      name: 'Cuadro Eléctrico & Inversor Híbrido',
      position: invBoxPos,
      orientation: quat,
      billboard: {
        image: getSafeSvgDataUri(invMarkerSvg),
        scale: 0.8,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        eyeOffset: new Cesium.Cartesian3(0, 0, -10.0),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        scaleByDistance: new Cesium.NearFarScalar(80, 1.0, 4000, 0.35)
      },
      box: {
        dimensions: wpBoxDimsScaled(new Cesium.Cartesian3(0.55, 0.20, 0.65), invBoxPos), // [FIX-VIS] escalado por distancia
        material: Cesium.Color.fromCssColorString('#CBD5E1'), // Gris claro (chapa metálica/poliéster)
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString('#475569'),
        shadows: Cesium.ShadowMode.ENABLED
      }
    });
    const curStep = (typeof wpCurrentStep !== 'undefined') ? wpCurrentStep : ((typeof window !== 'undefined' && window.wpCurrentStep) || 1);
    const shouldShow = (curStep >= 4);
    invEntity.show = shouldShow;
    window.inverterEquipmentState.entity = invEntity;

    if (window.inverterEquipmentState.label2D) {
      removeLabel2DEntity(window.inverterEquipmentState.label2D);
    }
    const invLabelText = '⚡ CUADRO & INVERSOR\n' + heightM.toFixed(1) + ' m';
    window.inverterEquipmentState.label2D = addLabelEntity(cartesian, invLabelText, -52, {
      bg: 'rgba(15, 23, 42, 0.92)',
      borderColor: '#F59E0B',
      textColor: '#FFFFFF',
      font: "bold 10px 'JetBrains Mono', monospace",
      category: 'electrical',
      equipmentType: 'inverter'
    });
    if (window.inverterEquipmentState.label2D) window.inverterEquipmentState.label2D.show = shouldShow;

    // <i data-lucide="rocket" class="icon-sm"></i> GEMELO DIGITAL 3D: CUADRO DE PROTECCIÓN DC ACOPLADO
    if (window.inverterEquipmentState.dcProtectionEntity) {
      try { viewer.entities.remove(window.inverterEquipmentState.dcProtectionEntity); } catch(e) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(e, 'Entidad/Primitiva Cesium'); }
    }
    const cat = (typeof equipmentCatalog !== 'undefined') ? equipmentCatalog : (typeof DEFAULT_EQUIPMENT_CATALOG !== 'undefined' ? DEFAULT_EQUIPMENT_CATALOG : null);
    const cfg = window.solarProjectConfig || {};
    const dcPanel = (cat && cat.electricalPanels) ? (cat.electricalPanels.find(p => p.id === cfg.selectedProtectionDcId) || cat.electricalPanels[1]) : null;
    const dcModelName = dcPanel ? (dcPanel.brand + ' ' + dcPanel.model) : 'Cuadro Protección DC 1000V SPD II';

    // Desplazar cota horizontal 45cm para ubicar el cuadro DC a la derecha del inversor
    const dcPosCarto = Cesium.Cartographic.fromCartesian(cartesian);
    const dcCartesian = Cesium.Cartesian3.fromRadians(dcPosCarto.longitude + 0.00000007, dcPosCarto.latitude + 0.00000005, dcPosCarto.height + 0.23);

    const dcBoxSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 24 24" fill="#0F172A" stroke="#F59E0B" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2" fill="#1e293b"/><path d="M12 7v10M8 12h8" stroke="#F59E0B"/></svg>';
    const dcEntity = viewer.entities.add({
      id: 'ra_dc_protection_box_3d',
      name: 'Cuadro de Protecciones DC (' + dcModelName + ')',
      position: dcCartesian,
      billboard: {
        image: getSafeSvgDataUri(dcBoxSvg),
        scale: 0.85,
        heightReference: Cesium.HeightReference.NONE,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        eyeOffset: new Cesium.Cartesian3(0, 0, -10.0),
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM
      },
      box: {
        dimensions: wpBoxDimsScaled(new Cesium.Cartesian3(0.35, 0.18, 0.45), dcCartesian),
        material: Cesium.Color.fromCssColorString('#D97706').withAlpha(0.85),
        outline: true,
        outlineColor: Cesium.Color.WHITE,
        shadows: Cesium.ShadowMode.ENABLED
      }
    });
    dcEntity.show = shouldShow;
    window.inverterEquipmentState.dcProtectionEntity = dcEntity;
    window.inverterEquipmentState.dcProtectionPosition = dcCartesian;
    window.inverterEquipmentState.dcProtectionCarto = { latitude: Cesium.Math.toDegrees(dcPosCarto.latitude + 0.00000005), longitude: Cesium.Math.toDegrees(dcPosCarto.longitude + 0.00000007), height: dcPosCarto.height };
    if (typeof window.inverterEquipmentState.dcProtectionRotation === 'undefined') window.inverterEquipmentState.dcProtectionRotation = 0;

    if (window.inverterEquipmentState.dcProtectionLabel2D) {
      removeLabel2DEntity(window.inverterEquipmentState.dcProtectionLabel2D);
    }
    const dcLabelText = '🛡️ CUADRO DC (SPD II + SECC.)\n' + (dcPanel ? (dcPanel.model.split('(')[0].trim()) : '1000V DC');
    window.inverterEquipmentState.dcProtectionLabel2D = addLabelEntity(dcCartesian, dcLabelText, -42, {
      bg: 'rgba(15, 23, 42, 0.92)',
      borderColor: '#D97706',
      textColor: '#FFFFFF',
      font: "bold 10px 'JetBrains Mono', monospace",
      category: 'electrical',
      equipmentType: 'dcProtection'
    });
    if (window.inverterEquipmentState.dcProtectionLabel2D) window.inverterEquipmentState.dcProtectionLabel2D.show = shouldShow;
    // <i data-lucide=\"battery-charging\" class=\"icon-sm\"></i> GEMELO DIGITAL 3D: SISTEMA DE ALMACENAMIENTO LFP ACOPLADO
    if (typeof wpRenderBattery3D === 'function') {
      wpRenderBattery3D(cartesian);
    }
  } catch(eEnt) {
    window.RA && window.RA.log && window.RA.log.debug('Error al renderizar marcador de inversor:', eEnt);
  }

  if (typeof wpCalculateAndRenderInverterCables === 'function') {
    wpCalculateAndRenderInverterCables();
  }
  if (typeof recalculateSolarYield === 'function') recalculateSolarYield();
  if (typeof BOMTreeEngine !== 'undefined' && typeof BOMTreeEngine.refresh === 'function') BOMTreeEngine.refresh();
  if (typeof wpUpdateMeterPlacementGuideUI === 'function') wpUpdateMeterPlacementGuideUI();
  if (typeof showToast === 'function') {
    showToast('INVERSOR Y CUADRO UBICADO', 'Tirada de cable DC calculada a ' + (window.inverterEquipmentState.L_dc_measured || 0).toFixed(1) + ' m con holguras reglamentarias.', 'success', 3500);
  }
}

function wpClearInverterAndCables() {
  if (typeof _raScaledBoxes !== 'undefined' && Array.isArray(_raScaledBoxes)) {
    _raScaledBoxes.length = 0;
  }
  if (!window.inverterEquipmentState) return;
  const s = window.inverterEquipmentState;
  if (typeof viewer !== 'undefined' && viewer && viewer.entities) {
    if (s.dcCableEntities && Array.isArray(s.dcCableEntities)) {
      s.dcCableEntities.forEach(e => {
        try {
          if (e.isCablePrimitive) {
            if (window._raCableEnginePrimitives) window._raCableEnginePrimitives.remove(e.primitive);
          } else {
            if (typeof removeLabel2DEntity === 'function') removeLabel2DEntity(e);
            viewer.entities.remove(e);
          }
        } catch(err) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(err, 'Entidad/Primitiva Cesium'); }
      });
    }
    if (s.entity) {
      try { viewer.entities.remove(s.entity); } catch(err) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(err, 'Entidad/Primitiva Cesium'); }
      s.entity = null;
    }
    if (s.label2D) {
      try { if (typeof removeLabel2DEntity === 'function') removeLabel2DEntity(s.label2D); } catch(err) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(err, 'Entidad/Primitiva Cesium'); }
      s.label2D = null;
    }
    if (s.dcProtectionEntity) {
      try { viewer.entities.remove(s.dcProtectionEntity); } catch(err) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(err, 'Entidad/Primitiva Cesium'); }
      s.dcProtectionEntity = null;
    }
    if (s.dcProtectionLabel2D) {
      try { if (typeof removeLabel2DEntity === 'function') removeLabel2DEntity(s.dcProtectionLabel2D); } catch(err) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(err, 'Entidad/Primitiva Cesium'); }
      s.dcProtectionLabel2D = null;
    }
    s.dcProtectionPosition = null;
    s.dcProtectionCarto = null;
    if (s.batteryEntity) {
      try { viewer.entities.remove(s.batteryEntity); } catch(err) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(err, 'Entidad/Primitiva Cesium'); }
      s.batteryEntity = null;
    }
    if (s.batteryLabel2D) {
      try { if (typeof removeLabel2DEntity === 'function') removeLabel2DEntity(s.batteryLabel2D); } catch(err) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(err, 'Entidad/Primitiva Cesium'); }
      s.batteryLabel2D = null;
    }
    s.batteryPosition = null;
    s.batteryCarto = null;
    if (s.gridMeter) {
      if (s.gridMeter.entity) {
        try { viewer.entities.remove(s.gridMeter.entity); } catch(err) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(err, 'Entidad/Primitiva Cesium'); }
        s.gridMeter.entity = null;
      }
      if (s.gridMeter.acCableEntity) {
        try { viewer.entities.remove(s.gridMeter.acCableEntity); } catch(err) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(err, 'Entidad/Primitiva Cesium'); }
        s.gridMeter.acCableEntity = null;
      }
      s.gridMeter.position = null;
    }
    if (s.combinerBox) {
      if (s.combinerBox.entity) {
        try { viewer.entities.remove(s.combinerBox.entity); } catch(err) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(err, 'Entidad/Primitiva Cesium'); }
        s.combinerBox.entity = null;
      }
      s.combinerBox.position = null;
    }
  }
  s.dcCableEntities = [];
  s.position = null;
  s.carto = null;
}

// [DELEGACIÓN MODULAR AAA]: Gestión de canalizaciones y trazado 3D residen en js/cable-routing-ui.js

function computeElectricalSizingEngineering(generator) {
  // [AUD-2026 · F-01] Delegado: el cálculo vive en js/electrical-engine.js.
  if (typeof window !== 'undefined' && window.RA && window.RA.Electrical &&
      typeof window.RA.Electrical.computeSizingEngineering === 'function') {
    return window.RA.Electrical.computeSizingEngineering(generator);
  }
  console.error('[RA] Motor eléctrico no disponible: dimensionado no calculable.');
  return {
    P_dc_kW: 0, P_ac_kW: 0, inv_kW: 0, monofasico: true, V_ac: 230,
    I_ac: 0, I_ac_design: 0, numStrings: 0, modsPerString: 0,
    minModsPerString: 0, maxModsPerString: 0, Voc_str_stc: 0, Voc_str_max: 0,
    Vmp_str_hot: 0, I_total_dc: 0, S_str: 6, dVdc_pct: 0, dV_dc: 0, dV_ac: 0,
    S_ac: 10, dVac_pct: 0, I_iga: 16, dif_amp: 16, spdType: 'N/D',
    isCompliantREBT: false, PR: 0, lossTree: {}
  };
}

function generateRefNum() {
  if (typeof window !== 'undefined' && window._currentProjectRefNum) {
    return window._currentProjectRefNum;
  }
  try {
    const saved = localStorage.getItem('ra_current_project_ref');
    if (saved && typeof saved === 'string' && saved.startsWith('RA-')) {
      if (typeof window !== 'undefined') window._currentProjectRefNum = saved;
      return saved;
    }
  } catch(e) {}
  const y = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  const ref = 'RA-' + y + '-' + rand;
  if (typeof window !== 'undefined') {
    window._currentProjectRefNum = ref;
  }
  try { localStorage.setItem('ra_current_project_ref', ref); } catch(e) {}
  return ref;
}
if (typeof window !== 'undefined') {
  window.generateRefNum = generateRefNum;
  window.resetProjectRefNum = function() {
    window._currentProjectRefNum = null;
    try { localStorage.removeItem('ra_current_project_ref'); } catch(e) {}
    return generateRefNum();
  };
}

// [ARQUITECTURA AAA] getProjectCalcs delegada canónicamente a js/project-calcs.js (sin wrapper circular)

// [ARQUITECTURA AAA] docWindow delegada a js/docs-generator.js

// [ARQUITECTURA AAA] showEmbeddedDocViewer delegada a js/docs-generator.js


// [ARQUITECTURA AAA] generateMemoria delegada a js/docs-generator.js

// ============================================================================
// DOC 2 — PLIEGO DE CONDICIONES
// ============================================================================
// [ARQUITECTURA AAA] generatePliego delegada a js/docs-generator.js


// ============================================================================
// DOC 3 — PRESUPUESTO DETALLADO
// ============================================================================
// [ARCHITECT MODULARIZATION] generatePresupuesto() bancable 25 años reside en js/docs-generator.js

// ============================================================================
// DOC 4 — ESQUEMA UNIFILAR (Canvas)
// ============================================================================

// ============================================================================
// MOTOR DE GEOMETRÍA COMPARTIDO (Visor 3D y Planos 2D 100% Idénticos)
// ============================================================================
window.roofPanelsCache = window.roofPanelsCache || { sig: null, data: null, selectedLayoutId: null, layoutCandidates: [] };

// Calcula la distribucion fotovoltaica para un conjunto de vertices 3D (un solo faldon / polilinea)
function computeSinglePolylineRoofInfo(ptsIn, polyOpts) {
  let pts = ptsIn;
  let opts = polyOpts || {};
  if (ptsIn && !Array.isArray(ptsIn) && Array.isArray(ptsIn.points)) {
    pts = ptsIn.points;
    opts = ptsIn;
  }
  const pa = polygonAnalysis(pts);
  if (!pa) return null;

  const latDeg = pa.latDeg, lonDeg = pa.lonDeg;
  const transform = pa.transform;
  const invTransform = pa.invTransform;
  const localPoints = pa.localPoints;
  let normal = pa.normal;
  const tiltRad = pa.tiltRad, tiltDeg = pa.tiltDeg;
  const azimuthDeg = pa.azimuthDeg, azimuthN = pa.azimuthN;
  let uVec = pa.uVec, vVec = pa.vVec;
  let poly2D = pa.poly2D;

  // 🚀 ACOPLAMIENTO AL PLANO DE TRABAJO (CAD P1->P2)
  let planeIdx = (typeof opts.planeIdx === "number" && opts.planeIdx >= 0) ? opts.planeIdx : -1;
  if (planeIdx === -1 && typeof WP !== "undefined" && Array.isArray(WP.polylines)) {
    const found = WP.polylines.find(p => p === opts || (p && opts && p.id && p.id === opts.id));
    if (found && typeof found.planeIdx === "number" && found.planeIdx >= 0) {
      planeIdx = found.planeIdx;
    }
  }
  if (planeIdx === -1 && typeof WP !== "undefined" && typeof WP.activePlaneIdx === "number") {
    planeIdx = WP.activePlaneIdx;
  }
  const wpPlane = (typeof WP !== "undefined" && WP && Array.isArray(WP.planes) && planeIdx >= 0 && WP.planes[planeIdx])
    ? WP.planes[planeIdx]
    : null;

  let planeLocalOffsetZ = 0;
  if (wpPlane && wpPlane.uVec && wpPlane.vVec && wpPlane.normal && invTransform && typeof Cesium !== "undefined" && Cesium.Matrix4) {
    const uLocal = Cesium.Matrix4.multiplyByPointAsVector(invTransform, wpPlane.uVec, new Cesium.Cartesian3());
    const vLocal = Cesium.Matrix4.multiplyByPointAsVector(invTransform, wpPlane.vVec, new Cesium.Cartesian3());
    const nLocal = Cesium.Matrix4.multiplyByPointAsVector(invTransform, wpPlane.normal, new Cesium.Cartesian3());
    if (Cesium.Cartesian3.magnitude(uLocal) > 0.01 && Cesium.Cartesian3.magnitude(vLocal) > 0.01) {
      uVec = Cesium.Cartesian3.normalize(uLocal, new Cesium.Cartesian3());
      vVec = Cesium.Cartesian3.normalize(vLocal, new Cesium.Cartesian3());
      normal = Cesium.Cartesian3.normalize(nLocal, new Cesium.Cartesian3());

      // Proyectar matemáticamente la cota del plano de trabajo en el marco local del faldón:
      // Si el centroide de la polilínea tiene un desnivel respecto al plano del tejado (wpPlane.origin),
      // se traslada exactamente a la superficie matemática del plano de trabajo para eliminar el hundimiento/despegue.
      if (wpPlane.origin) {
        const originLocal = Cesium.Matrix4.multiplyByPoint(invTransform, wpPlane.origin, new Cesium.Cartesian3());
        planeLocalOffsetZ = Cesium.Cartesian3.dot(originLocal, normal);
      }

      poly2D = localPoints.map(p => ({
        u: Cesium.Cartesian3.dot(p, uVec),
        v: Cesium.Cartesian3.dot(p, vVec)
      }));
    }
  }

  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
  poly2D.forEach(p => {
    minU = Math.min(minU, p.u);
    maxU = Math.max(maxU, p.u);
    minV = Math.min(minV, p.v);
    maxV = Math.max(maxV, p.v);
  });

  // Desacoplamiento por faldón (Fase 3.1): lectura específica de módulo o herencia de proyecto
  const effectiveModId = opts.moduleId || (window.solarProjectConfig && window.solarProjectConfig.selectedModuleId) || 'ja_550';
  let modItem = null;
  if (typeof equipmentCatalog !== 'undefined' && equipmentCatalog && Array.isArray(equipmentCatalog.modules)) {
    modItem = equipmentCatalog.modules.find(m => m.id === effectiveModId);
  }
  const panelW = (modItem && typeof modItem.w === 'number') ? modItem.w : (panelConfig.ancho || 1.05);
  const panelH = (modItem && typeof modItem.l === 'number') ? modItem.l : (panelConfig.largo || 2.10);
  const panelP = (modItem && typeof modItem.wp === 'number') ? modItem.wp : (panelConfig.potencia || 450);
  const gap = 0.02;
  const setback = (typeof opts.setback === "number") ? opts.setback : 0;
  const roofOffset = 0.20;

  const obsSetback = parseFloat((document.getElementById("cfg-obstacle-setback") || { value: "0.50" }).value) || 0.50;

  // Posicion solar critica (solsticio de invierno 21-dic 12h solar - CTE DB-HE5)
  const doyShadow = 355;
  const declShadow = solarDeclination(doyShadow);
  const haShadow = hourAngle(12);
  const altShadow = solarAltitude(latDeg, declShadow, haShadow);
  const azShadowN = solarAzimuthAtan2(latDeg, declShadow, haShadow);
  const shadowAzDeg = normalizeAzimuth(azShadowN + 180);
  const shadowLenPerM = obstacleShadowLength(1, altShadow);

  const sDirENU = new Cesium.Cartesian3(
    Math.sin(degToRad(shadowAzDeg)),
    Math.cos(degToRad(shadowAzDeg)),
    0
  );
  const sU = Cesium.Cartesian3.dot(sDirENU, uVec);
  const sV = Cesium.Cartesian3.dot(sDirENU, vVec);

  const arrangementMode = opts.arrangementMode || ((opts.modTilt === 'optimal' || opts.modTilt === 32) ? 'solar_optimal' : ((opts.modTilt === 'auto' || opts.modTilt === 'coplanar' || opts.modTilt === undefined) ? 'coplanar' : 'custom'));
  const modTiltSel = (opts.modTilt !== undefined && opts.modTilt !== "") ? opts.modTilt : (document.getElementById("cfg-mod-tilt") || { value: "auto" }).value;
  const modAzSel = (opts.modAzimuth !== undefined && opts.modAzimuth !== "") ? opts.modAzimuth : getModuleAzimuthSur();
  const orientPref = (opts.orientationPref !== undefined && opts.orientationPref !== "") ? opts.orientationPref : ((typeof userPanelOrientationPref !== "undefined" && userPanelOrientationPref) ? userPanelOrientationPref : "auto");
  const orientList = (orientPref === "portrait") ? ["portrait"] : ((orientPref === "landscape") ? ["landscape"] : ((orientPref === "hybrid") ? ["hybrid"] : ["portrait", "landscape", "hybrid"]));

  const res = evaluateModuleLayouts({
    latDeg: latDeg,
    normal: { x: normal.x, y: normal.y, z: normal.z },
    slopeDeg: tiltDeg,
    azimuthDeg: azimuthN,
    azimuthSur: azimuthDeg,
    poly2D: poly2D,
    uVec: { x: uVec.x, y: uVec.y, z: uVec.z },
    vVec: { x: vVec.x, y: vVec.y, z: vVec.z }
  }, {
    lengthM: panelH, widthM: panelW, powerWp: panelP
  }, {
    setback: setback,
    gap: gap,
    safetyMarginM: 0,
    solarElevationDeg: altShadow,
    flatThreshold: 8,
    arrangementMode: arrangementMode,
    moduleTiltDeg: modTiltSel,
    moduleAzimuthSur: modAzSel,
    moduleAzimuthGeo: opts.modAzimuth,
    structureType: opts.structureType || (opts.estructura && opts.estructura.tipo),
    estructura: opts.estructura || null,
    pergolaSubtype: opts.pergolaSubtype || (opts.estructura && opts.estructura.subtype) || 'continuous',
    orientations: orientList,
    alignToPlane: (opts.alignToPlane !== undefined) ? !!opts.alignToPlane : true,
    matrixShiftA: (typeof opts.matrixShiftA === 'number') ? opts.matrixShiftA : ((typeof opts.matrixShiftU === 'number') ? opts.matrixShiftU : 0),
    matrixShiftB: (typeof opts.matrixShiftB === 'number') ? opts.matrixShiftB : ((typeof opts.matrixShiftV === 'number') ? opts.matrixShiftV : 0),
    lockRowPitch: !!(opts && opts.lockRowPitch),
    lockedRowPitchM: (opts && typeof opts.lockedRowPitchM === 'number') ? opts.lockedRowPitchM : 0,
    rowPitchDesignWindowH: (opts && typeof opts.rowPitchDesignWindowH === 'number') ? opts.rowPitchDesignWindowH : 2.0,
    panelFilter: defaultPanelFilter,
    hasWalkway: !!opts.hasWalkway,
    walkwayWidth: (typeof opts.walkwayWidth === 'number') ? opts.walkwayWidth : 0.80,
    filterCtx: {
      obstacles: obstacles,
      obsSetback: obsSetback,
      sU: sU,
      sV: sV,
      shadowLenPerM: shadowLenPerM,
      shadingStrategy: shadingStrategy,
      roof: { invTransform: invTransform, transform: transform, uVec: uVec, vVec: vVec, normal: normal, center: pa.center }
    }
  });

  const best = res.best;
  const layouts = res.layouts;
  const panels = [];
  if (best) {
    const modLen = best.moduleLengthM;
    const modWidth = best.moduleWidthM;
    const deltaTilt = best.deltaTilt || 0;
    const deltaTiltRad = degToRad(deltaTilt);
    const sinDelta = Math.sin(deltaTiltRad);
    const cosDelta = Math.cos(deltaTiltRad);
    const frame = best.frame || {};
    // Componentes 0 son válidas (eje A paralelo a v en faldones Sur): no usar `||` como fallback.
    const hasFrameA = (typeof frame.Lu === 'number' && typeof frame.Lv === 'number' && Math.hypot(frame.Lu, frame.Lv) > 1e-6);
    const hasFrameB = (typeof frame.Wu === 'number' && typeof frame.Wv === 'number' && Math.hypot(frame.Wu, frame.Wv) > 1e-6);
    const AuvN = hasFrameA ? { x: frame.Lu, y: frame.Lv } : { x: 1, y: 0 };
    const BuvN = hasFrameB ? { x: frame.Wu, y: frame.Wv } : { x: 0, y: 1 };

    // Altura base: si es coplanar reposa en el tejado (+2cm); si esta inclinada, la arista inferior se eleva +5cm.
    // ESTRUCTURA PARAMÉTRICA: pérgola eleva todo el plano a la altura libre; balasto apoya la
    // arista frontal a la altura de pie (typ. 0.15-0.30 m) y el ala trasera sube con la inclinación.
    const estructura = (opts.estructura && opts.estructura.tipo !== 'coplanar') ? opts.estructura : null;
    const clearance = estructura ? Math.max(0.05, Math.min(5, estructura.clearance || (estructura.tipo === 'pergola' ? 1.50 : 0.20))) : 0;
    const baseElev = estructura ? clearance : (roofOffset + (best.coplanar ? 0.02 : 0.05));

    const targetPolyIdx = (opts && typeof opts.polyIdx === "number")
      ? opts.polyIdx
      : ((opts && typeof WP !== "undefined" && WP && Array.isArray(WP.polylines) && WP.polylines.indexOf(opts) >= 0)
          ? WP.polylines.indexOf(opts)
          : ((typeof WP !== "undefined" && WP && typeof WP.selectedPolyIdx === "number" && WP.selectedPolyIdx >= 0) ? WP.selectedPolyIdx : 0));

    for (let pIdx = 0; pIdx < best.centers.length; pIdx++) {
      const c = best.centers[pIdx];
      const pOrient = c.orient || (best.orientation === 'hybrid' ? 'portrait' : best.orientation);
      const isLand = (pOrient === 'landscape');
      const curModLen = isLand ? panelW : panelH;
      const curModWid = isLand ? panelH : panelW;

      // Centro 3D en el espacio
      const centerH = planeLocalOffsetZ + baseElev + (best.coplanar ? 0 : (curModLen / 2) * sinDelta);
      const localCenter = Cesium.Cartesian3.add(
        Cesium.Cartesian3.multiplyByScalar(uVec, c.u, new Cesium.Cartesian3()),
        Cesium.Cartesian3.multiplyByScalar(vVec, c.v, new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
      );
      Cesium.Cartesian3.add(localCenter, Cesium.Cartesian3.multiplyByScalar(normal, centerH, new Cesium.Cartesian3()), localCenter);
      const worldCenter = Cesium.Matrix4.multiplyByPoint(transform, localCenter, new Cesium.Cartesian3());

      // 4 Vértices 3D con orientación Anti-Horaria (CCW estricta) para apuntar la normal al cielo
      const cornerConfigs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      const worldCorners = cornerConfigs.map(([sx, sy]) => {
        const du = (sx * (curModLen / 2) * cosDelta) * AuvN.x + (sy * (curModWid / 2)) * BuvN.x;
        const dv = (sx * (curModLen / 2) * cosDelta) * AuvN.y + (sy * (curModWid / 2)) * BuvN.y;
        const isEW = !!c.isEastWest;
        const isWest = c.ewSide === 'W';
        // En Este-Oeste, la arista alta está en la cumbrera de unión central (near ridge: sx=-1 para W, sx=+1 para E)
        const isHighEdge = isEW ? (isWest ? (sx <= 0) : (sx >= 0)) : (sx <= 0);
        const dh = planeLocalOffsetZ + baseElev + (isHighEdge ? (curModLen * sinDelta) : 0);

        const lp = Cesium.Cartesian3.add(
          Cesium.Cartesian3.multiplyByScalar(uVec, c.u + du, new Cesium.Cartesian3()),
          Cesium.Cartesian3.multiplyByScalar(vVec, c.v + dv, new Cesium.Cartesian3()),
          new Cesium.Cartesian3()
        );
        Cesium.Cartesian3.add(lp, Cesium.Cartesian3.multiplyByScalar(normal, dh, new Cesium.Cartesian3()), lp);
        return Cesium.Matrix4.multiplyByPoint(transform, lp, new Cesium.Cartesian3());
      });

      panels.push({
        center: worldCenter,
        corners: worldCorners,
        corners2D: c.corners || null,
        u: c.u,
        v: c.v,
        gridA: (typeof c.a === 'number' ? c.a : c.v),
        gridB: (typeof c.b === 'number' ? c.b : c.u),
        w: curModWid,
        h: curModLen,
        orientation: pOrient,
        isHybridResidual: !!c.isHybridResidual,
        isEastWest: !!c.isEastWest,
        ewSide: c.ewSide || null,
        moduleId: effectiveModId,
        tiltDeg: best.moduleTiltDeg,
        azimuthDeg: c.isEastWest ? (c.ewSide === 'E' ? -90 : 90) : best.moduleAzimuthSur,
        hasMLPE: !!(c.isShaded && (shadingStrategy === "mlpe" || shadingStrategy === "microinverter")),
        frame: best.frame,
        uVec: pa.uVec,
        vVec: pa.vVec,
        normal: pa.normal,
        transform: pa.transform,
        layoutIndex: pIdx,
        localIdx: pIdx,
        panelId: "pan_" + targetPolyIdx + "_" + pIdx,
        polyIdx: targetPolyIdx
      });
    }
  }

  const area3D = compute3DPolygonArea(localPoints);
  return {
    poly2D,
    planeIdx: planeIdx,
    buildingId: opts.buildingId || (wpPlane ? wpPlane.buildingId : null),
    carto: (pa.center && typeof Cesium !== 'undefined' && Cesium.Cartographic ? Cesium.Cartographic.fromCartesian(pa.center) : null),
    panels,
    origin: pa.center, uVec: uVec, vVec: vVec, normal: normal,
    transform: pa.transform,
    invTransform: pa.invTransform,
    center: pa.center,
    localPoints: pa.localPoints,
    minU, maxU, minV, maxV,
    rangeU: maxU - minU, rangeV: maxV - minV,
    area3D,
    tiltDeg,
    azimuthDeg,
    azimuthN,
    latDeg,
    lonDeg,
    panelW,
    panelH,
    moduleTiltDeg: best ? best.moduleTiltDeg : (tiltDeg >= 8 ? tiltDeg : 30),
    moduleAzimuthDeg: best ? best.moduleAzimuthSur : azimuthDeg,
    structureType: opts.structureType || (opts.estructura && opts.estructura.tipo),
    estructura: opts.estructura || null,
    pergolaSubtype: opts.pergolaSubtype || (opts.estructura && opts.estructura.subtype) || 'continuous',
    isContinuousCanopy: best ? !!best.isContinuousCanopy : false,
    orientation: best ? best.orientation : "portrait",
    coplanar: best ? (best.coplanar || !!best.isContinuousCanopy) : (tiltDeg >= 8),
    rowPitch: best ? best.rowPitch : 0,
    colPitch: best ? best.colPitch : 0,
    footprintA: best ? best.footprintA : 0,
    gapBetweenRowsM: best ? best.gapBetweenRowsM : 0,
    ignore3DTilesShadows: !!opts.ignore3DTilesShadows,
    layouts: layouts
  };
}
window.computeSinglePolylineRoofInfo = computeSinglePolylineRoofInfo;

// Motor principal de calculo multi-polilinea: agrega los paneles de TODOS los faldones y cubiertas
function computeRoofPanelsData() {
  const orientPref = (typeof userPanelOrientationPref !== "undefined" && userPanelOrientationPref) ? userPanelOrientationPref : "auto";
  const polySig = (typeof WP !== "undefined" && WP && WP.polylines && WP.polylines.length > 0)
    ? WP.polylines.map((pl, pi) => "P" + pi + ":" + (pl.points || []).filter(p => p && typeof p.x === "number").map(p => p.x.toFixed(3) + "," + p.y.toFixed(3) + "," + p.z.toFixed(3)).join(";") + ":mod=" + (pl.moduleId || "def") + ":arr=" + (pl.arrangementMode || "def") + ":az=" + (pl.modAzimuth || "auto") + ":t=" + (pl.modTilt || "auto") + ":lk=" + (pl.lockRowPitch ? (pl.lockedRowPitchM || 1) : 0) + ":dw=" + (pl.rowPitchDesignWindowH || 2) + ":or=" + (pl.orientationPref || "portrait")).join("|")
    : (polygonPoints || []).filter(p => p && typeof p.x === "number").map(p => p.x.toFixed(3) + "," + p.y.toFixed(3) + "," + p.z.toFixed(3)).join(";");

  const curObj = (typeof window !== "undefined" && window.solarProjectConfig && window.solarProjectConfig.selectedObjective) ? window.solarProjectConfig.selectedObjective : "optimal_inv";
  const curTargetKwp = (typeof window !== "undefined" && window.solarProjectConfig && window.solarProjectConfig.targetKwp) ? window.solarProjectConfig.targetKwp : 0;

  const sig = polySig
    + "|obs:" + obstacles.map(o => o.id + ":" + (o.u || 0).toFixed(3) + ":" + (o.v || 0).toFixed(3) + ":" + (o.w || 0) + ":" + (o.l || 0) + ":" + (o.h || 0) + ":" + (o.rot || 0) + (o.cartesian ? ":" + (o.cartesian.x || 0).toFixed(2) + "," + (o.cartesian.y || 0).toFixed(2) + "," + (o.cartesian.z || 0).toFixed(2) : "")).join(",")
    + "|shd:" + shadingStrategy
    + "|sb:" + ((document.getElementById("cfg-obstacle-setback") || { value: "0.50" }).value)
    + "|mt:" + ((document.getElementById("cfg-mod-tilt") || { value: "auto" }).value)
    + "|ma:" + ((typeof getModuleAzimuthSur === "function") ? getModuleAzimuthSur() : ((document.getElementById("cfg-mod-azimuth") || { value: "auto" }).value))
    + "|pref:" + orientPref
    + "|pc:" + (panelConfig.ancho || 1.05) + "x" + (panelConfig.largo || 2.10) + "x" + (panelConfig.potencia || 450)
    + "|obj:" + curObj
    + "|tKwp:" + curTargetKwp
    + "|wpIdx:" + (typeof WP !== "undefined" ? WP.activePlaneIdx : -1);

  if (roofPanelsCache.sig === sig && roofPanelsCache.data) {
    selectedLayoutId = roofPanelsCache.selectedLayoutId;
    layoutCandidates = roofPanelsCache.layoutCandidates;
    return roofPanelsCache.data;
  }

  // Multi-polilinea: si existen polilineas en WP, calcular y persistir paneles en cada una
  if (typeof WP !== "undefined" && WP && WP.polylines && WP.polylines.length > 0) {
    let allPanels = [];
    let totalArea3D = 0;
    let polylinesData = [];
    let activeRoofInfo = null;

    WP.polylines.forEach((poly, idx) => {
      // 🚀 FIRMA INDIVIDUAL POR FALDÓN: Reutilizar poly.roofInfo si no ha cambiado su geometría ni parámetros
      const ptsSig = (poly.points || []).filter(p => p && typeof p.x === "number").map(p => p.x.toFixed(3) + "," + p.y.toFixed(3) + "," + p.z.toFixed(3)).join(";");
      const modId = poly.moduleId || (typeof panelConfig !== "undefined" ? (panelConfig.ancho + "x" + panelConfig.largo + "x" + panelConfig.potencia) : "def");
      const arrMode = poly.arrangementMode || "def";
      const azSur = poly.modAzimuth || "auto";
      const tiltVal = poly.modTilt || "auto";
      const orPref = poly.orientationPref || orientPref;
      const stType = poly.structureType || "coplanar_teja";
      const setbackVal = (document.getElementById("cfg-obstacle-setback") || { value: "0.50" }).value;
      const alPlaneVal = poly.alignToPlane !== false ? "pl1" : "pl0";
      const plIdxVal = typeof poly.planeIdx === "number" ? poly.planeIdx : -1;
      const shA = (poly.matrixShiftA || 0).toFixed(3);
      const shB = (poly.matrixShiftB || 0).toFixed(3);
      const singlePolySig = `${ptsSig}|${modId}|${arrMode}|${azSur}|${tiltVal}|${orPref}|${stType}|al:${alPlaneVal}|pIdx:${plIdxVal}|shd:${shadingStrategy}|sb:${setbackVal}|obs:${obstacles.length}|shA:${shA}|shB:${shB}|ign3D:${!!poly.ignore3DTilesShadows}`;

      let pInfo;
      const hasPreserveFlag = poly._preserveImportedPanels || poly._fromProjectImport || (typeof window !== 'undefined' && window._raImportInProgress);
      if (poly.roofInfo && (poly._calcSig === singlePolySig || hasPreserveFlag)) {
        pInfo = poly.roofInfo;
        poly._calcSig = singlePolySig;
        if (!hasPreserveFlag) {
          delete poly._fromProjectImport;
        }
      } else {
        const oldPanels = (poly.roofInfo && Array.isArray(poly.roofInfo.panels)) ? poly.roofInfo.panels : null;
        pInfo = computeSinglePolylineRoofInfo(poly.points, poly);
        if (pInfo) {
          // Si el faldon tenia paneles manuales y no cambio la geometria de cubierta, transferir posiciones
          if (!poly._geometryDirty && Array.isArray(pInfo.panels)) {
            const liveRenderedPanels = (Array.isArray(window.allRenderedPanels) && window.allRenderedPanels.length > 0)
              ? window.allRenderedPanels.filter(op => op && (op.polyIdx === idx || (!op.polyIdx && idx === 0)))
              : [];
            const prevSource = (oldPanels && oldPanels.length > 0) ? oldPanels : liveRenderedPanels;

            const matchedPrevPanels = new Set();
            pInfo.panels.forEach((p, pIdx) => {
              let prev = null;
              if (p.panelId) {
                prev = prevSource.find(op => (op.panelId === p.panelId) || (op.rawPanel && op.rawPanel.panelId === p.panelId));
                if (!prev && liveRenderedPanels.length > 0) {
                  prev = liveRenderedPanels.find(op => (op.panelId === p.panelId) || (op.rawPanel && op.rawPanel.panelId === p.panelId));
                }
              }
              if (!prev && typeof p.layoutIndex === 'number') {
                prev = prevSource.find(op => (typeof op.layoutIndex === 'number' && op.layoutIndex === p.layoutIndex) || (typeof op.localIdx === 'number' && op.localIdx === p.layoutIndex));
              }
              if (!prev && typeof p.localIdx === 'number') {
                prev = prevSource.find(op => (typeof op.localIdx === 'number' && op.localIdx === p.localIdx) || (typeof op.layoutIndex === 'number' && op.layoutIndex === p.localIdx));
              }
              if (!prev && prevSource.length === pInfo.panels.length) {
                prev = prevSource[pIdx];
              }

              if (prev) {
                matchedPrevPanels.add(prev);
                if (prev.rawPanel) matchedPrevPanels.add(prev.rawPanel);
              }

              if (prev && (prev.isManual || (prev.rawPanel && prev.rawPanel.isManual))) {
                p.isManual = true;
                p.gridA = undefined;
                p.gridB = undefined;
                const srcCenter = (prev.isManual && prev.center) ? prev.center : (prev.rawPanel && prev.rawPanel.center ? prev.rawPanel.center : prev.center);
                const srcCorners = (prev.isManual && prev.corners) ? prev.corners : (prev.rawPanel && prev.rawPanel.corners ? prev.rawPanel.corners : prev.corners);
                if (srcCenter) p.center = Cesium.Cartesian3.clone(srcCenter);
                if (Array.isArray(srcCorners)) p.corners = srcCorners.map(c => Cesium.Cartesian3.clone(c));
                if (typeof prev.rot !== 'undefined') p.rot = prev.rot;
                else if (prev.rawPanel && typeof prev.rawPanel.rot !== 'undefined') p.rot = prev.rawPanel.rot;
                if (typeof prev.u !== 'undefined') p.u = prev.u;
                else if (prev.rawPanel && typeof prev.rawPanel.u !== 'undefined') p.u = prev.rawPanel.u;
                if (typeof prev.v !== 'undefined') p.v = prev.v;
                else if (prev.rawPanel && typeof prev.rawPanel.v !== 'undefined') p.v = prev.rawPanel.v;
                if (typeof prev.orientation !== 'undefined') p.orientation = prev.orientation;
                if (typeof prev.w !== 'undefined') p.w = prev.w;
                if (typeof prev.h !== 'undefined') p.h = prev.h;
              }
            });

            // Preservar paneles manuales que quedaron fuera de la cuadrícula automática
            prevSource.forEach(op => {
              if (!op) return;
              const isMan = op.isManual || (op.rawPanel && op.rawPanel.isManual);
              if (isMan && !matchedPrevPanels.has(op)) {
                const srcCenter = (op.isManual && op.center) ? op.center : (op.rawPanel && op.rawPanel.center ? op.rawPanel.center : op.center);
                const srcCorners = (op.isManual && op.corners) ? op.corners : (op.rawPanel && op.rawPanel.corners ? op.rawPanel.corners : op.corners);
                if (srcCenter && Array.isArray(srcCorners) && srcCorners.length >= 3) {
                  const extraIdx = pInfo.panels.length;
                  pInfo.panels.push({
                    center: Cesium.Cartesian3.clone(srcCenter),
                    corners: srcCorners.map(c => Cesium.Cartesian3.clone(c)),
                    u: op.u,
                    v: op.v,
                    w: op.w || 1.134,
                    h: op.h || 2.278,
                    gridA: undefined,
                    gridB: undefined,
                    layoutIndex: extraIdx,
                    localIdx: extraIdx,
                    panelId: op.panelId || ('pan_' + idx + '_' + extraIdx),
                    polyIdx: idx,
                    orientation: op.orientation || 'portrait',
                    tiltDeg: op.tiltDeg || 0,
                    azimuthDeg: op.azimuthDeg || 0,
                    stringId: op.stringId,
                    isManual: true,
                    rot: op.rot || 0,
                    hasMLPE: !!op.hasMLPE,
                    isShaded: !!op.isShaded,
                    annualKwh: op.annualKwh || null,
                    shadePct: op.shadePct || null
                  });
                  matchedPrevPanels.add(op);
                }
              }
            });
          }
          pInfo.ignore3DTilesShadows = !!poly.ignore3DTilesShadows;
          poly.roofInfo = pInfo;
          poly._calcSig = singlePolySig;
        }
      }

      if (pInfo) {
        pInfo.panels.forEach((pan, pIdx) => {
          pan.polyIdx = idx;
          pan.globalIdx = allPanels.length;
          allPanels.push(pan);
        });
        totalArea3D += pInfo.area3D || 0;
        polylinesData.push(pInfo);
        if (idx === WP.selectedPolyIdx || !activeRoofInfo) {
          activeRoofInfo = pInfo;
        }
      }
    });

    const primaryInfo = activeRoofInfo || polylinesData[0] || computeSinglePolylineRoofInfo(polygonPoints);
    if (!primaryInfo) return null;

    const roofResult = Object.assign({}, primaryInfo, {
      panels: allPanels,
      totalArea3D: totalArea3D,
      polylinesData: polylinesData
    });

    selectedLayoutId = (primaryInfo.orientation || "portrait") + (primaryInfo.coplanar ? "_coplanar" : "_tilted");
    layoutCandidates = primaryInfo.layouts || [];
    roofPanelsCache = { sig: sig, data: roofResult, selectedLayoutId: selectedLayoutId, layoutCandidates: layoutCandidates };
    return roofResult;
  }

  // Fallback poligono unico
  const singleInfo = computeSinglePolylineRoofInfo(polygonPoints);
  if (!singleInfo) return null;
  selectedLayoutId = (singleInfo.orientation || "portrait") + (singleInfo.coplanar ? "_coplanar" : "_tilted");
  layoutCandidates = singleInfo.layouts || [];
  roofPanelsCache = { sig: sig, data: singleInfo, selectedLayoutId: selectedLayoutId, layoutCandidates: layoutCandidates };
  return singleInfo;
}
// ============================================================================
// DOC 4 — ESQUEMA UNIFILAR PROFESIONAL (NORMA EPLAN / IEC 60617 / REBT)
// ============================================================================
// [ARQUITECTURA AAA] generateUnifilar delegada al módulo js/docs-generator.js

// ============================================================================
// DOC 5 — PLANO DE PLANTA ARQUITECTÓNICO / INGENIERÍA (100% FIEL AL VISOR 3D)
// ============================================================================
// [ARQUITECTURA AAA] generatePlanoPlanta delegada al módulo js/docs-generator.js


// [ARQUITECTURA AAA] generateFormulario delegada a js/docs-generator.js

// Tecla D: abrir modal de documentación


// ============================================================================
// SUITE COMPARATIVA DE MOTORES DE CÁLCULO ENERGÉTICO (IEC 61724 / PVGIS / NASA)
// ============================================================================

// ── Constantes físico-astronómicas ──────────────────────────────────────────
const SOLAR_CONST = 1367; // W/m² Constante Solar (WMO)
const MONTH_DAYS_SIM = [31,28,31,30,31,30,31,31,30,31,30,31];

// TMY Temperature monthly means for Spain (°C) — climatic averages peninsulares
const T_AMB_MONTHLY_ESP = {
  costal_med: [11.0,12.0,14.0,16.0,20.0,25.0,28.0,28.5,24.0,19.0,14.0,11.0],
  interior:   [5.0, 7.0,10.0,12.0,17.0,23.0,27.0,27.0,22.0,15.0, 9.0, 5.0],
  atlantico:  [9.0,10.0,12.0,13.0,16.0,19.0,21.0,21.5,19.0,15.0,11.0, 9.0]
};

// Last analysis results cache
let currentDailyCurveMode = 'summer';


// [DELEGACIÓN MODULAR AAA]: Las 24 funciones de física solar, radiación (Perez/Hay-Davies),
// modelos PVsyst/PVGIS/NASA POWER y gráficos SVG diarios residen en js/solar-engine.js.
// Acceso unificado disponible en window.RA.solar y window.*.



// ═════════════════════════════════════════════════════════════════════════════
// SISTEMA INTEGRAL DE PLANOS DE TRABAJO 3D, MULTIPLANO Y TRÍADA RGB CAD
// ═════════════════════════════════════════════════════════════════════════════

window.WP = window.WP || {
  mode: 'idle',               // 'idle' | 'define-plane' | 'draw-poly'
  planes: [],                 // [{ id, name, pts3D: [p1,p2,p3], origin, normal, uVec, vVec, d, tiltDeg, azimuthDeg }]
  activePlaneIdx: -1,         // Índice del plano de trabajo activo
  planePts: [],               // Puntos temporales para definir plano (3 puntos)
  axisMode: 'p1p2',           // 'p1p2' | 'p1p3' | 'auto' — eje X del plano de trabajo
  polylines: [],              // [{ id, planeIdx, points: [Cartesian3], area, lineEnt, fillEnt }]
  activePolyPts: [],          // Vértices de la polilínea en curso
  selectedPolyIdx: 0,         // Polilínea seleccionada para edición
  selectedVtxIdx: -1,         // Vértice seleccionado para edición
  
  cursorPos: undefined,
  ents: {
    planePreview: [],
    activePoly: [],
    polys: [],
    gizmos: [],
    activePlaneMarker: []
  }
};
var WP = window.WP;
if (window.RA) window.RA.wpState = window.WP;

// [DELEGACIÓN MODULAR AAA]: Tríada CAD, Gizmos 2D/3D, Planos de Trabajo P1/P2/P3 y Polilíneas residen en js/working-plane.js.
// Funciones unificadas disponibles en window.WP, window.RA.wp y window.*.

// ============================================================================
// CATÁLOGO DE EQUIPOS FOTOVOLTAICOS (Singleton único en js/working-plane.js → window.equipmentCatalog)
// ============================================================================
if (window.RA) window.RA.equipmentCatalog = window.equipmentCatalog || null;

// [DEDUP] loadEquipmentCatalog -> working-plane.js

// [DEDUP] saveEquipmentCatalog -> working-plane.js

// [DEDUP] resetEquipmentCatalogToDefault -> working-plane.js

// [DEDUP] populateModuleDropdown -> working-plane.js

// [DEDUP] onSelectModuleFromDropdown -> working-plane.js

// ── MODAL DEL CATÁLOGO DE EQUIPOS ──────────────────────────────────────────

window.openEquipmentCatalogModal = openEquipmentCatalogModal;
window.closeEquipmentCatalogModal = closeEquipmentCatalogModal;
window.switchCatalogTab = switchCatalogTab;

function wpSwitchGenTab(tab) {
  var solPanel = document.getElementById("wp-step2-solar-panel");
  var wndPanel = document.getElementById("wp-step2-wind-panel");
  var solBtn = document.getElementById("step2-tab-solar");
  var wndBtn = document.getElementById("step2-tab-wind");
  if (solPanel) solPanel.style.display = (tab === "solar") ? "flex" : "none";
  if (wndPanel) wndPanel.style.display = (tab === "wind") ? "block" : "none";
  if (solBtn) solBtn.classList.toggle("active", tab === "solar");
  if (wndBtn) wndBtn.classList.toggle("active", tab === "wind");
  if (tab === "wind" && window.RAWindUI && typeof window.RAWindUI.renderStep2Panel === "function") {
    window.RAWindUI.renderStep2Panel();
  }
}
window.wpSwitchGenTab = wpSwitchGenTab;

window.onSelectModuleFromDropdown = onSelectModuleFromDropdown;
window.addNewEquipmentFromForm = addNewEquipmentFromForm;
window.resetEquipmentCatalogToDefault = resetEquipmentCatalogToDefault;



// [F4-07] Controlador UI de curvas eólicas extraído a js/wind-curve-ui.js


window.openEditEquipmentModal = openEditEquipmentModal;
window.saveEditedEquipment = saveEditedEquipment;
window.cancelEditEquipment = cancelEditEquipment;
window.deleteCatalogItem = deleteCatalogItem;
window.applyInverterFromCatalog = applyInverterFromCatalog;
window.applyBatteryFromCatalog = applyBatteryFromCatalog;
window.populateStep3EquipmentSelectors = populateStep3EquipmentSelectors;
window.step3SetTopology = step3SetTopology;
window.step3EditCurrentEquipment = step3EditCurrentEquipment;
window.step3UpdateHardwareSelection = step3UpdateHardwareSelection;
window.wpComputeAutoSizing = wpComputeAutoSizing;
window.wpStepQuantity = wpStepQuantity;
window.wpSetManualQuantity = wpSetManualQuantity;
window.wpResetAutoSizing = wpResetAutoSizing;

// [DEDUP] openEquipmentCatalogModal -> working-plane.js

// [DEDUP] closeEquipmentCatalogModal -> working-plane.js

// [DEDUP] switchCatalogTab -> working-plane.js

function openEditEquipmentModal(category, id) {
  const catNames = {
    modules: 'MÓDULO SOLAR',
    inverters: 'INVERSOR DE RED',
    batteries: 'BATERÍA LFP',
    microinverters: 'MICROINVERSOR MLPE',
    wind_turbines: 'AEROGENERADOR EÓLICO',
    structures: 'COMPONENTE DE ESTRUCTURA',
    installation_costs: 'COSTE DE INSTALACIÓN / MANO DE OBRA'
  };

  const idIn = document.getElementById('edit-eq-id');
  const catIn = document.getElementById('edit-eq-cat');
  const brandIn = document.getElementById('edit-eq-brand');
  const modelIn = document.getElementById('edit-eq-model');
  const priceIn = document.getElementById('edit-eq-price');
  const titleEl = document.getElementById('edit-pane-title');
  const badgeEl = document.getElementById('edit-cat-badge');
  const genFields = document.getElementById('edit-general-fields');

  if (idIn) idIn.value = id;
  if (catIn) catIn.value = category;

  if (badgeEl) badgeEl.textContent = catNames[category] || category.toUpperCase();

  // Ocultar todas las secciones específicas
  ['mod', 'inv', 'bat', 'mi', 'wt', 'param'].forEach(k => {
    const el = document.getElementById('edit-' + k + '-wrap');
    if (el) el.style.display = 'none';
  });

  // CASO A: AEROGENERADORES
  if (category === 'wind_turbines') {
    if (genFields) genFields.style.display = 'grid';
    let turbine = null;
    if (window.RAWindCatalog && typeof window.RAWindCatalog.getById === 'function') {
      turbine = window.RAWindCatalog.getById(id);
    }
    if (!turbine) return;

    if (brandIn) brandIn.value = turbine.manufacturer || '';
    if (modelIn) modelIn.value = turbine.model || '';
    if (priceIn) priceIn.value = turbine.priceEur || 0;

    const wrap = document.getElementById('edit-wt-wrap');
    if (wrap) wrap.style.display = 'grid';

    const kwIn = document.getElementById('edit-wt-kw');
    const diamIn = document.getElementById('edit-wt-diameter');
    const bladeIn = document.getElementById('edit-wt-blade-height');
    const typeIn = document.getElementById('edit-wt-type');
    const hIn = document.getElementById('edit-wt-heights');
    const iecIn = document.getElementById('edit-wt-iec');
    const noiseIn = document.getElementById('edit-wt-noise');
    const cutinIn = document.getElementById('edit-wt-cutin');
    const ratedIn = document.getElementById('edit-wt-ratedspeed');
    const cutoutIn = document.getElementById('edit-wt-cutout');
    const survIn = document.getElementById('edit-wt-survival');

    if (kwIn) kwIn.value = (turbine.ratedPowerW ? turbine.ratedPowerW / 1000 : 10).toFixed(1);
    if (diamIn) diamIn.value = turbine.rotorDiameterM || 5.0;
    const isVawt = (turbine.type === 'VAWT' || turbine.type === 'vawt');
    if (typeIn) typeIn.value = isVawt ? 'VAWT' : 'HAWT';
    if (bladeIn) {
      const bH = turbine.bladeHeightM || turbine.bladeLength || (isVawt ? Math.round((turbine.rotorDiameterM || 5.0) * 1.4 * 10) / 10 : Math.round((turbine.rotorDiameterM || 5.0) / 2 * 10) / 10);
      bladeIn.value = bH;
    }
    if (hIn) hIn.value = Array.isArray(turbine.hubHeightsAvailableM) ? turbine.hubHeightsAvailableM.join(', ') : '12, 18, 24';
    if (iecIn) iecIn.value = turbine.iecClass || 'III';
    if (noiseIn) noiseIn.value = turbine.acousticPowerLwaDba || 95;
    if (cutinIn) cutinIn.value = turbine.cutInSpeedMs || 2.5;
    if (ratedIn) ratedIn.value = turbine.ratedSpeedMs || 11.0;
    if (cutoutIn) cutoutIn.value = turbine.cutOutSpeedMs || 25.0;
    if (survIn) survIn.value = turbine.survivalSpeedMs || 59.5;

    const tiIn = document.getElementById('edit-wt-ti');
    const lowLoadIn = document.getElementById('edit-wt-lowload-eff');
    const curveIn = document.getElementById('edit-wt-curve-text');

    if (tiIn) tiIn.value = (turbine.turbulenceIntensityPct !== undefined ? turbine.turbulenceIntensityPct : 14.0).toFixed(1);
    if (lowLoadIn) lowLoadIn.value = (turbine.lowLoadEfficiencyPct !== undefined ? turbine.lowLoadEfficiencyPct : 80.0).toFixed(0);
    if (curveIn && window.RAWindCatalog && typeof window.RAWindCatalog.formatPowerCurveText === 'function') {
      curveIn.value = window.RAWindCatalog.formatPowerCurveText(turbine.powerCurve);
    }
    if (typeof window.auditCurveInEdit === 'function') window.auditCurveInEdit();

    if (titleEl) {
      titleEl.innerHTML = '<i data-lucide="edit-2" class="icon-sm"></i> MODIFICAR AEROGENERADOR: ' + (turbine.manufacturer || '') + ' ' + (turbine.model || '');
      if (window.lucide && typeof window.lucide.createIcons === 'function') try { window.lucide.createIcons(); } catch(e) {}
    }
    if (typeof window.updateWindTurbineAreaPreview === 'function') {
      window.updateWindTurbineAreaPreview(false);
    }
    switchCatalogTab('edit');
    return;
  }

  // CASO B: PARÁMETROS DE ESTRUCTURA Y COSTES
  if (category === 'structures' || category === 'installation_costs') {
    if (genFields) genFields.style.display = 'none';
    const wrap = document.getElementById('edit-param-wrap');
    if (wrap) wrap.style.display = 'grid';

    let currentVal = 0;
    let labelText = id;
    let descText = '';

    if (category === 'structures' && window.RAStructureCatalog) {
      const activeMfgKey = window.RAStructureCatalog.getActiveManufacturer();
      const mfg = window.RAStructureCatalog.getStructure(activeMfgKey);
      if (mfg && typeof mfg[id] === 'number') currentVal = mfg[id];
      labelText = 'Precio unitario / coste de ' + id + ' (' + (mfg ? mfg.brand : activeMfgKey) + ')';
      descText = 'Actualiza el coste unitario del componente en el desglose de estructuras y BOM.';
    } else if (category === 'installation_costs' && window.RAStructureCatalog) {
      const costs = window.RAStructureCatalog.getInstallationCosts();
      const parts = id.split('.');
      if (parts.length === 2 && costs[parts[0]] && typeof costs[parts[0]][parts[1]] === 'number') {
        currentVal = costs[parts[0]][parts[1]];
      }
      labelText = 'Tarifa / Coste: ' + id;
      descText = 'Modifica la base de cálculo de mano de obra, ingeniería o tasas en el presupuesto general.';
    }

    const lbl = document.getElementById('edit-param-label');
    const valIn = document.getElementById('edit-param-val');
    const descEl = document.getElementById('edit-param-desc');

    if (lbl) lbl.textContent = labelText;
    if (valIn) valIn.value = currentVal;
    if (descEl) descEl.textContent = descText;

    if (titleEl) {
      titleEl.innerHTML = '<i data-lucide="edit-2" class="icon-sm"></i> ' + (catNames[category] || 'PARÁMETRO') + ': ' + id;
      if (window.lucide && typeof window.lucide.createIcons === 'function') try { window.lucide.createIcons(); } catch(e) {}
    }
    switchCatalogTab('edit');
    return;
  }

  // CASO C: CATÁLOGO SOLAR (MÓDULOS, INVERSORES, BATERÍAS, MICROINVERSORES)
  if (genFields) genFields.style.display = 'grid';
  const cat = (typeof equipmentCatalog !== 'undefined' && equipmentCatalog) ? equipmentCatalog : window.equipmentCatalog;
  if (!cat || !cat[category]) return;
  const item = cat[category].find(x => x.id === id);
  if (!item) return;

  if (brandIn) brandIn.value = item.brand || '';
  if (modelIn) modelIn.value = item.model || '';
  if (priceIn) priceIn.value = item.price || 0;

  if (titleEl) {
    titleEl.innerHTML = '<i data-lucide="edit-2" class="icon-sm"></i> MODIFICAR ' + (catNames[category] || 'EQUIPO') + ': ' + (item.brand || '') + ' ' + (item.model || '');
    if (window.lucide && typeof window.lucide.createIcons === 'function') try { window.lucide.createIcons(); } catch(e) {}
  }

  if (category === 'modules') {
    const wrap = document.getElementById('edit-mod-wrap');
    if (wrap) wrap.style.display = 'grid';
    const wpIn = document.getElementById('edit-mod-wp');
    const effIn = document.getElementById('edit-mod-eff');
    const lIn = document.getElementById('edit-mod-largo');
    const wIn = document.getElementById('edit-mod-ancho');
    const vocIn = document.getElementById('edit-mod-voc');
    const iscIn = document.getElementById('edit-mod-isc');
    const vmpIn = document.getElementById('edit-mod-vmp');
    const impIn = document.getElementById('edit-mod-imp');
    const tecIn = document.getElementById('edit-mod-tec');

    if (wpIn) wpIn.value = item.wp || 450;
    if (effIn) effIn.value = item.eff || 21.5;
    if (lIn) lIn.value = item.l || 2.10;
    if (wIn) wIn.value = item.w || 1.05;
    if (vocIn) vocIn.value = item.voc || 41.5;
    if (iscIn) iscIn.value = item.isc || 13.0;
    if (vmpIn) vmpIn.value = item.vmp || 34.5;
    if (impIn) impIn.value = item.imp || 12.5;
    if (tecIn) tecIn.value = item.tec || 'Monocristalino';

  } else if (category === 'inverters') {
    const wrap = document.getElementById('edit-inv-wrap');
    if (wrap) wrap.style.display = 'grid';
    const kwIn = document.getElementById('edit-inv-kw');
    const mpptIn = document.getElementById('edit-inv-mppt');
    const inputsIn = document.getElementById('edit-inv-inputs');
    const vdcIn = document.getElementById('edit-inv-vdcmax');
    const vstartIn = document.getElementById('edit-inv-vstart');
    const vminIn = document.getElementById('edit-inv-vmpptmin');
    const vmaxIn = document.getElementById('edit-inv-vmpptmax');
    const iOperIn = document.getElementById('edit-inv-imaxoper');
    const iScIn = document.getElementById('edit-inv-imaxsc');
    const ovIn = document.getElementById('edit-inv-overload');
    const typeIn = document.getElementById('edit-inv-type');

    if (kwIn) kwIn.value = item.kw || 5.0;
    if (mpptIn) mpptIn.value = item.mppt || 2;
    if (inputsIn) inputsIn.value = item.inputsPerMppt || 1;
    if (vdcIn) vdcIn.value = item.vDcMax || 1000;
    if (vstartIn) vstartIn.value = item.vStart || (item.vMpptMin ? Math.round(item.vMpptMin * 1.1) : 120);
    if (vminIn) vminIn.value = item.vMpptMin || (item.vMpptNomMin || 160);
    if (vmaxIn) vmaxIn.value = item.vMpptMax || (item.vMpptNomMax || 850);
    if (iOperIn) iOperIn.value = item.iMaxOperA || (item.iMaxScA ? Math.round(item.iMaxScA * 0.75 * 10) / 10 : 15.0);
    if (iScIn) iScIn.value = item.iMaxScA || 25.0;
    if (ovIn) ovIn.value = item.maxOverload || 1.30;
    if (typeIn) typeIn.value = item.type || 'Híbrido';

  } else if (category === 'batteries') {
    const wrap = document.getElementById('edit-bat-wrap');
    if (wrap) wrap.style.display = 'grid';
    const kwhIn = document.getElementById('edit-bat-kwh');
    const typeIn = document.getElementById('edit-bat-type');

    if (kwhIn) kwhIn.value = item.kwh || 5.0;
    if (typeIn) typeIn.value = item.type || 'LFP Litio';

  } else if (category === 'microinverters') {
    const wrap = document.getElementById('edit-mi-wrap');
    if (wrap) wrap.style.display = 'grid';
    const kwIn = document.getElementById('edit-mi-kw');
    const typeIn = document.getElementById('edit-mi-type');

    if (kwIn) kwIn.value = item.kw || 0.45;
    if (typeIn) typeIn.value = item.type || 'Microinversor 1-en-1';
  }

  switchCatalogTab('edit');
}

function cancelEditEquipment() {
  const catIn = document.getElementById('edit-eq-cat');
  const cat = catIn ? catIn.value : 'modules';
  switchCatalogTab(cat);
}

function saveEditedEquipment() {
  const idIn = document.getElementById('edit-eq-id');
  const catIn = document.getElementById('edit-eq-cat');
  if (!idIn || !catIn) return;

  const id = idIn.value;
  const category = catIn.value;

  // 1. GUARDADO AEROGENERADOR
  if (category === 'wind_turbines') {
    if (!window.RAWindCatalog || typeof window.RAWindCatalog.getById !== 'function') return;
    const existing = window.RAWindCatalog.getById(id) || {};
    const manufacturer = (document.getElementById('edit-eq-brand').value || existing.manufacturer || 'Fabricante').trim();
    const model = (document.getElementById('edit-eq-model').value || existing.model || 'Modelo').trim();
    const priceEur = Math.max(0, parseFloat(document.getElementById('edit-eq-price').value) || 0);

    const kw = Math.max(0.1, parseFloat(document.getElementById('edit-wt-kw').value) || 10.0);
    const diameter = Math.max(0.5, parseFloat(document.getElementById('edit-wt-diameter').value) || 5.0);
    const type = document.getElementById('edit-wt-type').value || 'HAWT';
    const bladeInEl = document.getElementById('edit-wt-blade-height');
    const bladeHeight = (bladeInEl && parseFloat(bladeInEl.value) > 0)
      ? parseFloat(bladeInEl.value)
      : (type === 'VAWT' ? Math.round(diameter * 1.4 * 10) / 10 : Math.round(diameter / 2 * 10) / 10);
    const heightsStr = document.getElementById('edit-wt-heights').value || '12, 18, 24';
    const hubHeights = heightsStr.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n) && n > 0);
    const iec = document.getElementById('edit-wt-iec').value || 'III';
    const noise = Math.max(30, parseFloat(document.getElementById('edit-wt-noise').value) || 95);
    const cutin = parseFloat(document.getElementById('edit-wt-cutin').value) || 2.5;
    const ratedSpeed = parseFloat(document.getElementById('edit-wt-ratedspeed').value) || 11.0;
    const cutout = parseFloat(document.getElementById('edit-wt-cutout').value) || 25.0;
    const survival = parseFloat(document.getElementById('edit-wt-survival').value) || 59.5;

    const updatedTurbine = Object.assign({}, existing, {
      id: id,
      manufacturer: manufacturer,
      model: model,
      type: type,
      ratedPowerW: Math.round(kw * 1000),
      rotorDiameterM: diameter,
      bladeHeightM: bladeHeight,
      bladeLength: bladeHeight,
      hubHeightsAvailableM: hubHeights.length > 0 ? hubHeights : (existing.hubHeightsAvailableM || [12, 18, 24]),
      iecClass: iec,
      acousticPowerLwaDba: noise,
      cutInSpeedMs: cutin,
      ratedSpeedMs: ratedSpeed,
      cutOutSpeedMs: cutout,
      survivalSpeedMs: survival,
      priceEur: priceEur,
      turbulenceIntensityPct: Math.max(5, Math.min(30, parseFloat(document.getElementById('edit-wt-ti') ? document.getElementById('edit-wt-ti').value : 14.0) || 14.0)),
      lowLoadEfficiencyPct: Math.max(50, Math.min(98, parseFloat(document.getElementById('edit-wt-lowload-eff') ? document.getElementById('edit-wt-lowload-eff').value : 80.0) || 80.0)),
      powerCurve: (window.RAWindCatalog && typeof window.RAWindCatalog.parsePowerCurveText === 'function' && document.getElementById('edit-wt-curve-text'))
        ? window.RAWindCatalog.parsePowerCurveText(document.getElementById('edit-wt-curve-text').value)
        : (existing.powerCurve || [])
    });

    window.RAWindCatalog.upsert(updatedTurbine);
    window.RAWindCatalog.refreshPanel();

    showStatus('<i data-lucide="check-circle" class="icon-sm"></i> AEROGENERADOR ACTUALIZADO: ' + manufacturer + ' ' + model, 2500);
    if (typeof showToast === 'function') {
      showToast('AEROGENERADOR ACTUALIZADO', manufacturer + ' ' + model + ' guardado con éxito.', 'success', 3000);
    }
    switchCatalogTab('wind_turbines');
    return;
  }

  // 2. GUARDADO PARÁMETRO DE ESTRUCTURA / INSTALACIÓN
  if (category === 'structures') {
    if (window.RAStructureCatalog) {
      const activeMfgKey = window.RAStructureCatalog.getActiveManufacturer();
      const val = parseFloat(document.getElementById('edit-param-val').value) || 0;
      window.RAStructureCatalog.updatePrice(activeMfgKey, id, val);
      window.RAStructureCatalog.renderStructuresCatalogUI();
      showStatus('<i data-lucide="check-circle" class="icon-sm"></i> PRECIO DE ESTRUCTURA ACTUALIZADO', 2500);
    }
    switchCatalogTab('structures');
    return;
  }

  if (category === 'installation_costs') {
    if (window.RAStructureCatalog) {
      const val = parseFloat(document.getElementById('edit-param-val').value) || 0;
      const parts = id.split('.');
      if (parts.length === 2) {
        window.RAStructureCatalog.updateInstallationCost(parts[0], parts[1], val);
        window.RAStructureCatalog.renderInstallationCostsUI();
        showStatus('<i data-lucide="check-circle" class="icon-sm"></i> TARIFA DE INSTALACIÓN ACTUALIZADA', 2500);
      }
    }
    switchCatalogTab('installation_costs');
    return;
  }

  // 3. GUARDADO CATÁLOGO SOLAR
  const cat = (typeof equipmentCatalog !== 'undefined' && equipmentCatalog) ? equipmentCatalog : window.equipmentCatalog;
  if (!cat || !cat[category]) return;

  const item = cat[category].find(x => x.id === id);
  if (!item) return;

  item.brand = (document.getElementById('edit-eq-brand').value || item.brand).trim();
  item.model = (document.getElementById('edit-eq-model').value || item.model).trim();
  item.price = Math.max(0, parseFloat(document.getElementById('edit-eq-price').value) || 0);

  if (category === 'modules') {
    item.wp = Math.max(50, parseFloat(document.getElementById('edit-mod-wp').value) || 450);
    item.eff = Math.max(1, parseFloat(document.getElementById('edit-mod-eff').value) || 21.5);
    item.l = Math.max(0.4, parseFloat(document.getElementById('edit-mod-largo').value) || 2.10);
    item.w = Math.max(0.3, parseFloat(document.getElementById('edit-mod-ancho').value) || 1.05);
    item.voc = parseFloat(document.getElementById('edit-mod-voc').value) || item.voc || 41.5;
    item.isc = parseFloat(document.getElementById('edit-mod-isc').value) || item.isc || 13.0;
    item.vmp = parseFloat(document.getElementById('edit-mod-vmp').value) || item.vmp || 34.5;
    item.imp = parseFloat(document.getElementById('edit-mod-imp').value) || item.imp || 12.5;
    item.tec = (document.getElementById('edit-mod-tec').value || item.tec || 'Monocristalino').trim();

    if (typeof panelConfig !== 'undefined' && (panelConfig.modelo.includes(item.model) || (window.solarProjectConfig && window.solarProjectConfig.selectedModuleId === item.id))) {
      panelConfig.modelo = item.brand + ' ' + item.model;
      panelConfig.potencia = item.wp;
      panelConfig.largo = item.l;
      panelConfig.ancho = item.w;
      panelConfig.rendimiento = item.eff;
      panelConfig.precio = item.price;
      panelConfig.voc = item.voc;
      panelConfig.isc = item.isc;
      panelConfig.vmp = item.vmp;
      panelConfig.imp = item.imp;
    }

  } else if (category === 'inverters') {
    item.kw = Math.max(0.5, parseFloat(document.getElementById('edit-inv-kw').value) || 5.0);
    item.mppt = Math.max(1, parseInt(document.getElementById('edit-inv-mppt').value, 10) || 2);
    item.inputsPerMppt = Math.max(1, parseInt(document.getElementById('edit-inv-inputs').value, 10) || 1);
    item.vDcMax = Math.max(100, parseFloat(document.getElementById('edit-inv-vdcmax').value) || 1000);
    item.vStart = Math.max(50, parseFloat(document.getElementById('edit-inv-vstart').value) || 120);
    item.vMpptMin = Math.max(40, parseFloat(document.getElementById('edit-inv-vmpptmin').value) || 160);
    item.vMpptMax = Math.max(100, parseFloat(document.getElementById('edit-inv-vmpptmax').value) || 850);
    item.vMpptNomMin = item.vMpptMin;
    item.vMpptNomMax = item.vMpptMax;
    item.iMaxOperA = Math.max(5.0, parseFloat(document.getElementById('edit-inv-imaxoper').value) || 15.0);
    item.iMaxScA = Math.max(item.iMaxOperA, parseFloat(document.getElementById('edit-inv-imaxsc').value) || 25.0);
    item.maxOverload = Math.max(1.0, parseFloat(document.getElementById('edit-inv-overload').value) || 1.30);
    item.type = (document.getElementById('edit-inv-type').value || item.type || 'Híbrido').trim();

  } else if (category === 'batteries') {
    item.kwh = Math.max(0, parseFloat(document.getElementById('edit-bat-kwh').value) || 0);
    item.type = (document.getElementById('edit-bat-type').value || item.type || 'LFP Litio').trim();

  } else if (category === 'microinverters') {
    item.kw = Math.max(0.1, parseFloat(document.getElementById('edit-mi-kw').value) || 0.45);
    item.type = (document.getElementById('edit-mi-type').value || item.type || 'Microinversor').trim();
  }

  saveEquipmentCatalog();
  populateStep3EquipmentSelectors();
  step3UpdateHardwareSelection();

  showStatus('<i data-lucide="check-circle" class="icon-sm"></i> EQUIPO ACTUALIZADO: ' + item.brand + ' ' + item.model, 2500);
  switchCatalogTab(category);
}

// [DEDUP] applyInverterFromCatalog -> working-plane.js

// [DEDUP] applyBatteryFromCatalog -> working-plane.js

// [DEDUP] deleteCatalogItem -> working-plane.js

// [DEDUP] populateEquipmentModalUI -> working-plane.js

// [DEDUP] addNewEquipmentFromForm -> working-plane.js



// ── STEPPER 1-2-3 WORKFLOW & CANVAS HUD CONTROLLER ────────────────────────────
wpCurrentStep = 1;

// Defaults canónicos definidos en js/project-config.js (evita doble literal divergente).
window.solarProjectConfig = window.solarProjectConfig || {};
// ── window.RA alias (Arquitectura v2) ────────────────────────────────────
window.RA.projectConfig = window.solarProjectConfig;

function applyProjectGoal(goalKey) {
  step4ApplyFinancialProfile(goalKey);
}
window.applyProjectGoal = applyProjectGoal;

function step5RegenerateLayout() {
  window.RA = window.RA || {};
  window.RA.log = window.RA.log || console;
  
  window.RA.log.warn('[FORENSIC] step5RegenerateLayout triggered.');
  
  isPolygonDesignConfirmed = true;

  // 🚀 PURGA COMPLETA DE CACHÉS Y RESIDUOS MANUALES PARA REGENERACIÓN LIMPIA
  if (typeof roofPanelsCache !== 'undefined' && roofPanelsCache) {
    roofPanelsCache.sig = '';
    roofPanelsCache.data = null;
  }
  if (typeof WP !== 'undefined' && WP && Array.isArray(WP.polylines)) {
    WP.polylines.forEach(pl => {
      if (pl) {
        pl._calcSig = null;
        pl._geometryDirty = true;
        pl.roofInfo = null;
        delete pl._fromProjectImport;
      }
    });
  }
  if (typeof window !== 'undefined') {
    window.allRenderedPanels = [];
  }

  try { 
    if (typeof recalculateLayoutAndObstacles === 'function') {
      recalculateLayoutAndObstacles();
    } else if (typeof wpFastRenderSimulatedPanels === 'function') {
      wpFastRenderSimulatedPanels(true);
    }
    window.RA.log.warn('[FORENSIC] layout regeneration SUCCESS');
  } catch(e) { 
    window.RA.log.error('[FORENSIC] layout regeneration CRASHED:', e); 
  }
  
  try { 
    // wpFastRender ya disparado vía recalculateLayoutAndObstacles
  } catch(e) { 
    window.RA.log.error('[FORENSIC] wpFastRenderSimulatedPanels CRASHED:', e); 
    // throw e prevenido
  }
  
  try { 
    window.RA.log.warn('[FORENSIC] inputs to recalculateSolarYield -> WP:', typeof WP !== 'undefined' ? WP : 'undefined', 'WP.polylines:', typeof WP !== 'undefined' && WP ? WP.polylines : 'N/A');
    if (typeof recalculateSolarYield === 'function') recalculateSolarYield(); 
    window.RA.log.warn('[FORENSIC] recalculateSolarYield SUCCESS');
  } catch(e) { 
    window.RA.log.error('[FORENSIC] recalculateSolarYield CRASHED:', e); 
    // throw e prevenido
  }
  
  try { 
    window.RA.log.warn('[FORENSIC] inputs to wpCalculateAndRenderInverterCables -> inverterEquipmentState:', window.inverterEquipmentState, 'obstacles:', typeof obstacles !== 'undefined' ? obstacles : 'undefined');
    if (typeof wpCalculateAndRenderInverterCables === 'function') wpCalculateAndRenderInverterCables(); 
    window.RA.log.warn('[FORENSIC] wpCalculateAndRenderInverterCables SUCCESS');
  } catch(e) { 
    window.RA.log.error('[FORENSIC] wpCalculateAndRenderInverterCables CRASHED:', e); 
    // throw e prevenido
  }

  if (typeof wpUpdateSolarMetricsUI === 'function') wpUpdateSolarMetricsUI();
  if (typeof BOMTreeEngine !== 'undefined' && typeof BOMTreeEngine.refresh === 'function') {
    BOMTreeEngine.refresh();
  }
}

// ── CONTROL DINÁMICO EN TIEMPO REAL DE INCLINACIÓN Y AZIMUT EN PASO 2 (DESLIZADORES AAA) ──
window.wpUpdateSolarMetricsUI = function() {
  const count = (window.allRenderedPanels && window.allRenderedPanels.length > 0) ? window.allRenderedPanels.length : ((typeof lastRoofInfo !== 'undefined' && lastRoofInfo && lastRoofInfo.panels) ? lastRoofInfo.panels.length : 0);
  
  // Single Source of Truth: Obtener Wp real del catálogo de módulos seleccionado
  let modWp = 450;
  if (typeof equipmentCatalog !== 'undefined' && equipmentCatalog && Array.isArray(equipmentCatalog.modules)) {
    const selModId = (window.solarProjectConfig && window.solarProjectConfig.selectedModuleId) || (typeof panelConfig !== 'undefined' && panelConfig.moduleId);
    const m = equipmentCatalog.modules.find(x => x.id === selModId);
    if (m && typeof m.wp === 'number') modWp = m.wp;
    else if (typeof panelConfig !== 'undefined' && panelConfig.potencia) modWp = panelConfig.potencia;
  } else if (typeof panelConfig !== 'undefined' && panelConfig.potencia) {
    modWp = panelConfig.potencia;
  }
  if (typeof panelConfig !== 'undefined') panelConfig.potencia = modWp;

  const elP = document.getElementById('p3-stat-panels');
  const elK = document.getElementById('p3-stat-kwp');
  const elS = document.getElementById('p3-stat-strings');

  if (elP) elP.textContent = count;
  if (elK) elK.textContent = ((count * modWp) / 1000).toFixed(2) + ' kWp';
  
  if (elS) {
    const limits = window.solarProjectConfig && window.solarProjectConfig.calculatedLimits;
    const maxString = (limits && limits.nMaxString) ? limits.nMaxString : 12;
    elS.textContent = Math.ceil(count / maxString);
  }
};
function getAzimuthCardinalShort(deg) {
  const d = ((deg % 360) + 360) % 360;
  if (d >= 337.5 || d < 22.5) return 'N (0°)';
  if (d >= 22.5 && d < 67.5) return 'NE (45°)';
  if (d >= 67.5 && d < 112.5) return 'E (90°)';
  if (d >= 112.5 && d < 157.5) return 'SE (135°)';
  if (d >= 157.5 && d < 202.5) return 'S (180°)';
  if (d >= 202.5 && d < 247.5) return 'SO (225°)';
  if (d >= 247.5 && d < 292.5) return 'O (270°)';
  return 'NO (315°)';
}

// [F3-09] Handlers muertos Paso 6 (wpApplyStep6Tilt/Azimuth) purgados.

function wpApplyPanelArrangementActive(mode) {
  const activeIdx = (typeof WP !== 'undefined' && WP && WP.selectedPolyIdx >= 0 && WP.polylines && WP.polylines[WP.selectedPolyIdx]) ? WP.selectedPolyIdx : 0;
  if (typeof wpApplyPanelArrangement === 'function') {
    wpApplyPanelArrangement(activeIdx, mode);
  }
}
window.wpApplyPanelArrangementActive = wpApplyPanelArrangementActive;

function wpApplyActiveArrangementToAll() {
  const activeIdx = (typeof WP !== 'undefined' && WP && WP.selectedPolyIdx >= 0 && WP.polylines && WP.polylines[WP.selectedPolyIdx]) ? WP.selectedPolyIdx : 0;
  if (typeof wpApplyPanelArrangementToAll === 'function') {
    wpApplyPanelArrangementToAll(activeIdx);
  }
}
window.wpApplyActiveArrangementToAll = wpApplyActiveArrangementToAll;

// ── EXPORTACIÓN DE INFORME TÉCNICO PDF PROFESIONAL (PASO 5) ──
async function generatePdfReport() {
  if (typeof window.generateMemoria === 'function') return window.generateMemoria();
}

// [CANÓNICO] wpUpdateStep3UI reside de forma modular en js/working-plane.js


// [B1] RA_STRING_PALETTE (js/config.js) y getPolylineStringColor (js/electrical-engine.js) son las únicas fuentes canónicas

// ── GRADIENTE TÉRMICO PARA MAPA DE CALOR DE IRRADIANCIA ANUAL ──────────────
function getHeatmapColor(lossPct) {
  // Umbrales calibrados a práctica industrial (PVsyst/Helioscope): 10-15% es típico en filas inclinadas
  if (lossPct <= 2.5) return { hex: "#059669", css: "rgba(5, 150, 105, 0.95)", label: "Excelente (≤2.5%)" };
  if (lossPct <= 5.0) return { hex: "#10B981", css: "rgba(16, 185, 129, 0.95)", label: "Óptimo (2.5-5%)" };
  if (lossPct <= 7.5) return { hex: "#84CC16", css: "rgba(132, 204, 22, 0.95)", label: "Muy Bueno (5-7.5%)" };
  if (lossPct <= 10.0) return { hex: "#A3E635", css: "rgba(163, 230, 53, 0.95)", label: "Bueno (7.5-10%)" };
  if (lossPct <= 15.0) return { hex: "#FACC15", css: "rgba(250, 204, 21, 0.95)", label: "Típico filas (10-15%)" };
  if (lossPct <= 20.0) return { hex: "#F59E0B", css: "rgba(245, 158, 11, 0.95)", label: "Atención (15-20%)" };
  if (lossPct <= 25.0) return { hex: "#F97316", css: "rgba(249, 115, 22, 0.95)", label: "Sombra Media (20-25%)" };
  if (lossPct <= 30.0) return { hex: "#EA580C", css: "rgba(234, 88, 12, 0.95)", label: "Sombra Alta (25-30%)" };
  if (lossPct <= 40.0) return { hex: "#EF4444", css: "rgba(239, 68, 68, 0.95)", label: "Severa (30-40%)" };
  return { hex: "#991B1B", css: "rgba(153, 27, 27, 0.95)", label: "Crítica (>35%)" };
}

function getRelativeYieldColor(relPct) {
  // Escala relativa calibrada con transición continua y realista (evita contrastes artificiales por diferencias mínimas)
  const val = (typeof relPct === 'number' && !isNaN(relPct)) ? relPct : 100;
  if (val >= 95.0) return { hex: "#059669", css: "rgba(5, 150, 105, 0.95)", label: "Líder (≥95%)" };
  if (val >= 90.0) return { hex: "#10B981", css: "rgba(16, 185, 129, 0.95)", label: "Excelente (90-95%)" };
  if (val >= 85.0) return { hex: "#84CC16", css: "rgba(132, 204, 22, 0.95)", label: "Muy Bueno (85-90%)" };
  if (val >= 80.0) return { hex: "#A3E635", css: "rgba(163, 230, 53, 0.95)", label: "Bueno (80-85%)" };
  if (val >= 74.0) return { hex: "#FACC15", css: "rgba(250, 204, 21, 0.95)", label: "Medio (74-80%)" };
  if (val >= 68.0) return { hex: "#F59E0B", css: "rgba(245, 158, 11, 0.95)", label: "Aceptable (68-74%)" };
  if (val >= 60.0) return { hex: "#F97316", css: "rgba(249, 115, 22, 0.95)", label: "Bajo (60-68%)" };
  if (val >= 52.0) return { hex: "#EA580C", css: "rgba(234, 88, 12, 0.95)", label: "Muy Bajo (52-60%)" };
  if (val >= 42.0) return { hex: "#EF4444", css: "rgba(239, 68, 68, 0.95)", label: "Crítico (42-52%)" };
  return { hex: "#991B1B", css: "rgba(153, 27, 27, 0.95)", label: "Severo (<42%)" };
}

function getActiveHeatmapColorForPanel(p) {
  if (!p) return { hex: "#10b981" };
  const useRel = (typeof window !== 'undefined' && window.raRelativeColorScale) ||
                 (typeof window !== 'undefined' && window.ShadowSettings && window.ShadowSettings.getSettings().relativeColorScale);
  if (useRel && typeof p.relativeYieldPct === 'number') {
    return getRelativeYieldColor(p.relativeYieldPct);
  }
  return getHeatmapColor(p.annualLossPct || 0);
}

function wpReapplyHeatmapColors() {
  const hasPolys = typeof WP !== "undefined" && WP && WP.polylines && WP.polylines.length > 0;
  const polylinesList = hasPolys ? WP.polylines : (typeof lastRoofInfo !== "undefined" && lastRoofInfo ? [{ points: polygonPoints, roofInfo: lastRoofInfo }] : []);

  // Recalcular colores en objetos de datos
  polylinesList.forEach(poly => {
    const panels = Array.isArray(poly.panels) ? poly.panels : (poly.roofInfo && Array.isArray(poly.roofInfo.panels) ? poly.roofInfo.panels : []);
    panels.forEach(p => {
      p.heatmapColor = getActiveHeatmapColorForPanel(p);
    });
  });

  if (Array.isArray(window.allRenderedPanels)) {
    window.allRenderedPanels.forEach(p => {
      if (p) p.heatmapColor = getActiveHeatmapColorForPanel(p);
    });
  }

  // Renderizar de nuevo
  if (typeof wpRenderHeatmapVisuals === 'function') {
    wpRenderHeatmapVisuals();
  }
  if (typeof wpFastRenderSimulatedPanels === 'function') {
    wpFastRenderSimulatedPanels(true);
  }
}
window.wpReapplyHeatmapColors = wpReapplyHeatmapColors;
window.getActiveHeatmapColorForPanel = getActiveHeatmapColorForPanel;
window.getRelativeYieldColor = getRelativeYieldColor;

// ── ESTADO GLOBAL DEL MOTOR SOLAR Y SOMBRAS ─────────────────────────────────
if (typeof window.solarSimState === "undefined" || !window.solarSimState) {
  window.solarSimState = {};
}
const _defaultSimStateProps = {
  viewMode: 'instant', // 'instant' | 'heatmap' | 'mlpe'
  currentMonth: 11,    // 0 = Ene, 11 = Dic (Solsticio invierno CTE)
  currentHour: 12.0,   // 12:00 h
  isPlaying: false,
  playSpeed: 1,        // 1x, 3x, 5x
  playInterval: null,
  currentSolarPos: null,
  mlpeBadgeEntities: [],
  panelShadowOverlayEntities: [],
  obstacleShadowSurfaceEntities: [],
  heatmapLabelEntities: [],
  annualHeatmapData: null
};
for (const _k in _defaultSimStateProps) {
  if (typeof window.solarSimState[_k] === 'undefined') {
    window.solarSimState[_k] = _defaultSimStateProps[_k];
  }
}

// ── RENDERIZADO RÁPIDO Y PRECISO DE PANELES ─────────────────────────────────
// [B1] getSnakeOrderedPanels y ordenación de clusters residen de forma canónica en js/electrical-engine.js

// [MODULARIZACION FASE 2 - BLOQUE 2.3] togglePhotorealisticPanelsTexture y toggleLabelsVisibility delegados canónicamente a js/ui-viewport-controls.js

window._wpFastRenderDebounceTimer = null;
let _raRenderGenerationId = 0;


// ── OPTIMIZACIÓN RENDIMIENTO CAD: Debounce de física solar pesada ──
let _wpSolarYieldDebounceTimer = null;
function wpDebouncedSolarYield(delayMs = 400) {
  if (_wpSolarYieldDebounceTimer) {
    clearTimeout(_wpSolarYieldDebounceTimer);
  }
  _wpSolarYieldDebounceTimer = setTimeout(() => {
    _wpSolarYieldDebounceTimer = null;
    if (typeof recalculateSolarYield === 'function') {
      try { recalculateSolarYield(true); } catch(e) {}
    }
  }, delayMs);
}
window.wpDebouncedSolarYield = wpDebouncedSolarYield;

// [FASE B3] Renderizado rápido 3D de paneles extraído a js/panel-renderer-3d.js

// ── Pipeline asíncrono (Fase 2): el bucle de faldones cede el control entre iteraciones
// para no bloquear el hilo ni agotar memoria en plantas grandes. La promesa resuelve al
// terminar, después de redibujar también los cables (paso 8 interno).
// ── 🛡️ LIMPIEZA CENTRALIZADA DE ETIQUETAS NUMÉRICAS DE PANELES ───────────────
function wpCleanupPanelNumberLabels() {
  if (typeof viewer !== "undefined" && viewer && viewer.scene && viewer.scene.primitives) {
    if (window._panelNumberLabelCollection) {
      try {
        if (!window._panelNumberLabelCollection.isDestroyed()) {
          viewer.scene.primitives.remove(window._panelNumberLabelCollection);
        }
      } catch(eLbl) {}
      window._panelNumberLabelCollection = null;
    }
    try {
      const prims = viewer.scene.primitives;
      for (let pi = prims.length - 1; pi >= 0; pi--) {
        const p = prims.get(pi);
        if (p && p._isPanelNumberCollection) {
          try { prims.remove(p); } catch(_) {}
        }
      }
    } catch(ePrims) {}
  }
}
window.wpCleanupPanelNumberLabels = wpCleanupPanelNumberLabels;

// ── 🛡️ LIMPIEZA CENTRALIZADA DEFENSIVA DE TODAS LAS PRIMITIVAS GPU (PANELES, SOPORTES, PÉRGOLAS, CABLES) ───────────────
function wpCleanupAllSolarPrimitives(targetPolyIdx = null) {
  if (typeof window !== "undefined") window._raPrimitivesGeneration = (window._raPrimitivesGeneration || 0) + 1;
  if (typeof viewer === "undefined" || !viewer) return;
  const isInc = (typeof targetPolyIdx === 'number' && targetPolyIdx >= 0);

  // 1. Limpieza de etiquetas numéricas
  wpCleanupPanelNumberLabels();

  // 2. Limpieza de entidades Cesium
  if (viewer.entities) {
    if (Array.isArray(simulatedPanelEntities)) {
      if (isInc) {
        simulatedPanelEntities = simulatedPanelEntities.filter(e => {
          if (e && e.pData && e.pData.polyIdx === targetPolyIdx) {
            if (e._id) { try { viewer.entities.remove(e); } catch(err) {} }
            return false;
          }
          return true;
        });
      } else {
        simulatedPanelEntities.forEach(e => {
          if (e && typeof e === 'object' && e._id) try { viewer.entities.remove(e); } catch(err) {}
        });
        simulatedPanelEntities = [];
      }
    }

    if (!isInc) {
      if (window.simulatedSupportEntities && Array.isArray(window.simulatedSupportEntities)) {
        window.simulatedSupportEntities.forEach(e => { try { viewer.entities.remove(e); } catch(err) {} });
        window.simulatedSupportEntities = [];
      }
      if (window._panelNumberEntities && Array.isArray(window._panelNumberEntities)) {
        window._panelNumberEntities.forEach(e => { try { viewer.entities.remove(e); } catch(err) {} });
        window._panelNumberEntities = [];
      }
      if (Array.isArray(simulatedStringEntities)) {
        simulatedStringEntities.forEach(e => {
          if (e && typeof e === 'object' && e._id) try { viewer.entities.remove(e); } catch(err) {}
        });
        simulatedStringEntities = [];
      }
    }
  }

  // 3. Purgar referencias en Maps y variables globales
  if (window._faldonPanelsPrimitives && viewer.scene && viewer.scene.primitives) {
    if (isInc) {
      const oldPrim = window._faldonPanelsPrimitives.get(targetPolyIdx);
      if (oldPrim) {
        try {
          if (oldPrim.shadows !== undefined && typeof Cesium !== 'undefined' && Cesium.ShadowMode) {
            oldPrim.shadows = Cesium.ShadowMode.DISABLED;
          }
          viewer.scene.primitives.remove(oldPrim);
        } catch(e) {}
        window._faldonPanelsPrimitives.delete(targetPolyIdx);
      }
    } else {
      window._faldonPanelsPrimitives.forEach(p => {
        if (p) {
          try {
            if (p.shadows !== undefined && typeof Cesium !== 'undefined' && Cesium.ShadowMode) {
              p.shadows = Cesium.ShadowMode.DISABLED;
            }
            viewer.scene.primitives.remove(p);
          } catch(e) {}
        }
      });
      window._faldonPanelsPrimitives.clear();
    }
  }

  if (window._faldonSupportCollections && viewer.scene && viewer.scene.primitives) {
    if (isInc) {
      const oldSup = window._faldonSupportCollections.get(targetPolyIdx);
      if (oldSup) {
        try { viewer.scene.primitives.remove(oldSup); } catch(e) {}
        window._faldonSupportCollections.delete(targetPolyIdx);
      }
    } else {
      window._faldonSupportCollections.forEach(sc => {
        if (sc) { try { viewer.scene.primitives.remove(sc); } catch(e) {} }
      });
      window._faldonSupportCollections.clear();
    }
  }

  if (window._faldonPergolaPrimitives && viewer.scene && viewer.scene.primitives) {
    if (isInc) {
      const oldPerg = window._faldonPergolaPrimitives.get(targetPolyIdx);
      if (oldPerg) {
        try { viewer.scene.primitives.remove(oldPerg); } catch(e) {}
        window._faldonPergolaPrimitives.delete(targetPolyIdx);
      }
    } else {
      window._faldonPergolaPrimitives.forEach(p => {
        if (p) { try { viewer.scene.primitives.remove(p); } catch(e) {} }
      });
      window._faldonPergolaPrimitives.clear();
    }
  }

  if (!isInc) {
    if (window.simulatedPanelsPrimitive && viewer.scene && viewer.scene.primitives) {
      try {
        if (window.simulatedPanelsPrimitive.shadows !== undefined && typeof Cesium !== 'undefined' && Cesium.ShadowMode) {
          window.simulatedPanelsPrimitive.shadows = Cesium.ShadowMode.DISABLED;
        }
        viewer.scene.primitives.remove(window.simulatedPanelsPrimitive);
      } catch(e) {}
      window.simulatedPanelsPrimitive = null;
    }
    if (window.simulatedSupportsPolylineCollection && viewer.scene && viewer.scene.primitives) {
      try { viewer.scene.primitives.remove(window.simulatedSupportsPolylineCollection); } catch(e) {}
      window.simulatedSupportsPolylineCollection = null;
    }
    if (window.simulatedStringsPolylineCollection && viewer.scene && viewer.scene.primitives) {
      try { viewer.scene.primitives.remove(window.simulatedStringsPolylineCollection); } catch(e) {}
      window.simulatedStringsPolylineCollection = null;
    }
  } else {
    if (targetPolyIdx === 0 && window.simulatedPanelsPrimitive && viewer.scene && viewer.scene.primitives) {
      try {
        viewer.scene.primitives.remove(window.simulatedPanelsPrimitive);
      } catch(e) {}
      window.simulatedPanelsPrimitive = null;
    }
    if (window.simulatedStringsPolylineCollection && viewer.scene && viewer.scene.primitives) {
      try { viewer.scene.primitives.remove(window.simulatedStringsPolylineCollection); } catch(e) {}
      window.simulatedStringsPolylineCollection = null;
    }
  }

  if (typeof WP !== 'undefined' && WP && WP.polylines) {
    if (isInc && WP.polylines[targetPolyIdx]) {
      if (WP.polylines[targetPolyIdx].panelsPrimitive && viewer.scene && viewer.scene.primitives) {
        try { viewer.scene.primitives.remove(WP.polylines[targetPolyIdx].panelsPrimitive); } catch(e) {}
      }
      WP.polylines[targetPolyIdx].panelsPrimitive = null;
    } else if (!isInc) {
      WP.polylines.forEach(pl => {
        if (pl && pl.panelsPrimitive && viewer.scene && viewer.scene.primitives) {
          try { viewer.scene.primitives.remove(pl.panelsPrimitive); } catch(e) {}
        }
        if (pl) pl.panelsPrimitive = null;
      });
    }
  }

  // 4. 🚀 ESCANEO DEFENSIVO INVERSO EN viewer.scene.primitives:
  // Purga garantizada de cualquier primitiva huérfana en GPU
  if (viewer.scene && viewer.scene.primitives) {
    try {
      const prims = viewer.scene.primitives;
      for (let pi = prims.length - 1; pi >= 0; pi--) {
        const p = prims.get(pi);
        if (!p) continue;
        const matchFaldon = (!isInc || p._raFaldonIdx === targetPolyIdx);
        if ((p._isRAPanelPrimitive && matchFaldon) ||
            (p._isRASupportPrimitive && matchFaldon) ||
            (p._isRAPergolaPrimitive && matchFaldon) ||
            (p._isRAStringWirePrimitive && !isInc)) {
          try {
            if (p.shadows !== undefined && typeof Cesium !== 'undefined' && Cesium.ShadowMode) {
              p.shadows = Cesium.ShadowMode.DISABLED;
            }
            prims.remove(p);
            if (typeof p.destroy === 'function' && !p.isDestroyed()) {
              p.destroy();
            }
          } catch (_) {}
        }
      }
    } catch(ePrims) {}
  }
}
window.wpCleanupAllSolarPrimitives = wpCleanupAllSolarPrimitives;

// [F4-04] Serialización única controlada por _wpRenderSerialChain en js/panel-renderer-3d.js (sin doble mutex).
async function wpFastRenderSimulatedPanelsAsync(immediate = false, targetPolyIdx = null) {
  stopSimulationTimeouts();
  isSimulationRunning = false;
  const currentRenderId = ++_raRenderGenerationId;

  if (currentRenderId !== _raRenderGenerationId) {
    return;
  }

  const isIncrementalTarget = (typeof targetPolyIdx === 'number' && targetPolyIdx >= 0);
  window._faldonPanelsPrimitives = window._faldonPanelsPrimitives || new Map();
  window._faldonSupportCollections = window._faldonSupportCollections || new Map();
  window._faldonPergolaPrimitives = window._faldonPergolaPrimitives || new Map();

  // ── Gating AAA (PRIMERO, antes de purgar GPU) ────────────────────────────
  // Regla: si hay diseño válido, preservar paneles aunque step < 2 (Campo Solar arranca en Paso 2)
  const _hasExistingDesign = (
    isPolygonDesignConfirmed === true ||
    (typeof WP !== 'undefined' && WP && WP.polylines && WP.polylines.length > 0 &&
     WP.polylines.some(function(pl) { return pl.points && pl.points.length >= 3; })) ||
    (typeof polygonPoints !== 'undefined' && polygonPoints && polygonPoints.length >= 3)
  );

  const polyCount = (typeof WP !== 'undefined' && WP && WP.polylines) ? WP.polylines.length : 0;
  window.RA && window.RA.log && window.RA.log.warn(`[TELEMETRÍA FV] Entrando a wpFastRender. Paso: ${typeof wpCurrentStep !== 'undefined' ? wpCurrentStep : 'indef'}, Polilíneas: ${polyCount}, Diseño confirmado: ${_hasExistingDesign}`);

  if (typeof wpCurrentStep !== 'undefined' && wpCurrentStep < 2 && !_hasExistingDesign) {
    window.RA && window.RA.log && window.RA.log.warn('[TELEMETRÍA FV] ABORTO EN GATING: Paso < 2 sin diseño confirmado.');
    wpCleanupAllSolarPrimitives(isIncrementalTarget ? targetPolyIdx : null);
    if (!isIncrementalTarget) {
      wpCleanupPanelNumberLabels();
      window.allRenderedPanels = [];
      lastRoofInfo = null;
    } else if (Array.isArray(window.allRenderedPanels)) {
      window.allRenderedPanels = window.allRenderedPanels.filter(p => p && p.polyIdx !== targetPolyIdx);
    }
    if (typeof wpClearInverterAndCables === 'function') wpClearInverterAndCables();
    if (typeof viewer !== 'undefined' && viewer && viewer.scene &&
        typeof viewer.scene.requestRender === 'function') {
      viewer.scene.requestRender();
    }
    return;
  }

  // 1. Purgar primitivas GPU previas mediante limpiador defensivo unificado
  wpCleanupAllSolarPrimitives(isIncrementalTarget ? targetPolyIdx : null);

  // [SSOT] Capturar los paneles renderizados vivos (incluyendo posiciones manuales) ANTES del cómputo
  const existingRenderedPanels = (Array.isArray(window.allRenderedPanels) && window.allRenderedPanels.length > 0)
    ? [...window.allRenderedPanels]
    : [];

  const roofInfo = computeRoofPanelsData();
  const calculatedPanelCount = (roofInfo && roofInfo.panels) ? roofInfo.panels.length : 0;
  window.RA && window.RA.log && window.RA.log.warn(`[TELEMETRÍA FV] computeRoofPanelsData devolvió: ${calculatedPanelCount} paneles`);

  if (!roofInfo || !roofInfo.panels || roofInfo.panels.length === 0) {
    wpCleanupPanelNumberLabels();
    if (typeof showStatus === 'function') {
      showStatus(`<i data-lucide="alert-triangle" class="icon-sm"></i> EL TRAZADO TIENE ÁREA INSUFICIENTE O 0 PANELES CALCULADOS (Paso: ${wpCurrentStep})`, 3500);
    }
    lastRoofInfo = null;
    window.allRenderedPanels = [];
    if (typeof wpClearInverterAndCables === 'function') wpClearInverterAndCables();
    if (typeof recalculateSolarYield === 'function') recalculateSolarYield();
    if (typeof wpUpdateStep3UI === 'function') wpUpdateStep3UI();
    if (typeof wpUpdateControlsAvailability === 'function') wpUpdateControlsAvailability();
    if (viewer && viewer.scene && typeof viewer.scene.requestRender === "function") {
      viewer.scene.requestRender();
    }
    return;
  }
  lastRoofInfo = roofInfo;

  const hasPolys = typeof WP !== "undefined" && WP && WP.polylines && WP.polylines.length > 0;
  const polylinesList = hasPolys ? WP.polylines : [{ points: polygonPoints, roofInfo: roofInfo, name: "Polilínea #1" }];

  window.allRenderedPanels = []; // Expuesto globalmente para picking/selección multi-faldón
  const allTargetPanels = window.allRenderedPanels;
  const currentStep = (typeof wpCurrentStep !== 'undefined') ? wpCurrentStep : ((typeof window !== 'undefined' && window.wpCurrentStep) || 1);
  const shouldRenderElectricalStrings = (currentStep >= 4);

  let globalStringCounter = 0;

  const obj = (window.solarProjectConfig && window.solarProjectConfig.selectedObjective) ? window.solarProjectConfig.selectedObjective : 'optimal_inv';
  const limits = (window.solarProjectConfig && window.solarProjectConfig.calculatedLimits) ? window.solarProjectConfig.calculatedLimits : null;
  const invCount = (window.solarProjectConfig && window.solarProjectConfig.autoSizing && window.solarProjectConfig.autoSizing.inverters && window.solarProjectConfig.autoSizing.inverters.count) || 1;
  const maxTotalModules = (limits && typeof limits.nMaxTotalModules === 'number') ? (limits.nMaxTotalModules * invCount) : Infinity;

  for (let polyIdx = 0; polyIdx < polylinesList.length; polyIdx++) {
    const poly = polylinesList[polyIdx];
    if (poly.panelsVisible === false) continue;
    // Cesión entre faldones: el navegador respira y las cascadas de sombra se reajustan
    if (polyIdx > 0) await new Promise(r => setTimeout(r, 0));
    if (currentRenderId !== _raRenderGenerationId) return;
    const prevPanelsMap = (existingRenderedPanels.length > 0)
      ? existingRenderedPanels.filter(op => op && (op.polyIdx === polyIdx || (!op.polyIdx && polyIdx === 0)))
      : ((poly.roofInfo && poly.roofInfo.panels) ? poly.roofInfo.panels : []);
    // Reutilizar roofInfo recién computado por computeRoofPanelsData (mismas entradas):
    // recomputar duplicaba el coste completo del layout por faldón (OOM en grandes plantas).
    let pInfo = poly.roofInfo || ((typeof computeSinglePolylineRoofInfo === "function") ? computeSinglePolylineRoofInfo(poly.points, poly) : null);
    if (pInfo && pInfo.panels) {
      const matchedAsyncPrevPanels = new Set();
      pInfo.panels.forEach((p, idx) => {
        p.layoutIndex = idx;
        p.localIdx = idx;
        p.polyIdx = polyIdx;
        p.disabled = (poly.panelsDisabled === true);
        if (!p.panelId) p.panelId = 'pan_' + polyIdx + '_' + idx;

        if (prevPanelsMap && prevPanelsMap.length > 0) {
          let prev = null;
          // 🚀 MATCHING ROBUSTO POR ID, ÍNDICE O ESPACIO
          if (p.panelId) {
            prev = prevPanelsMap.find(op => op.panelId === p.panelId || (op.rawPanel && op.rawPanel.panelId === p.panelId));
          }
          if (!prev && typeof p.layoutIndex === 'number') {
            prev = prevPanelsMap.find(op => (typeof op.layoutIndex === 'number' && op.layoutIndex === p.layoutIndex) || (typeof op.localIdx === 'number' && op.localIdx === p.layoutIndex));
          }
          if (!prev && typeof p.localIdx === 'number') {
            prev = prevPanelsMap.find(op => (typeof op.localIdx === 'number' && op.localIdx === p.localIdx) || (typeof op.layoutIndex === 'number' && op.layoutIndex === p.localIdx));
          }
          if (!prev && typeof p.u === 'number' && typeof p.v === 'number') {
            prev = prevPanelsMap.find(op => typeof op.u === 'number' && typeof op.v === 'number' && Math.abs(op.u - p.u) < 0.05 && Math.abs(op.v - p.v) < 0.05);
          }
          if (!prev && p.center) {
            prev = prevPanelsMap.find(op => op.center && Cesium.Cartesian3.distance(op.center, p.center) < 0.10);
          }
          if (!prev && prevPanelsMap.length === pInfo.panels.length) {
            prev = prevPanelsMap[idx];
          }

          // Solo heredar métricas de energía previas si la simulación anual sigue vigente (no dirty)
          const isSimStillValid = !!(window.solarSimState && window.solarSimState.annualHeatmapData && !window.solarSimState.annualHeatmapDirty);
          const cachedMetric = (isSimStillValid && window.solarSimState && window.solarSimState.panelCache)
            ? (window.solarSimState.panelCache.get(p.panelId) || window.solarSimState.panelCache.get(polyIdx + '_' + idx))
            : null;

          if (isSimStillValid && (cachedMetric || (prev && (typeof prev.annualLossPct !== 'undefined' || typeof prev.annualKwh !== 'undefined')))) {
            const src = cachedMetric || prev;
            p.annualLossPct = src.annualLossPct;
            p.annualYieldPct = src.annualYieldPct;
            
            let scale = 1.0;
            if (prev && prev.moduleId && p.moduleId && prev.moduleId !== p.moduleId && window.equipmentCatalog) {
              const pM = window.equipmentCatalog.modules.find(m => m.id === prev.moduleId);
              const cM = window.equipmentCatalog.modules.find(m => m.id === p.moduleId);
              if (pM && cM && pM.wp && cM.wp) scale = cM.wp / pM.wp;
            }
            
            p.annualGrossKwh = (typeof src.annualGrossKwh === 'number')
              ? src.annualGrossKwh * scale
              : ((typeof src.annualTotalPotential === 'number')
                  ? Math.max(0, src.annualTotalPotential - (src.annualShadedLoss || 0)) / 1000.0 * (((window.solarProjectConfig && window.solarProjectConfig.selectedModule && window.solarProjectConfig.selectedModule.wp) || 450) / 1000.0)
                  : (typeof src.annualKwh === 'number' ? src.annualKwh / 0.885 : undefined));
            p._lastPrSys = src._lastPrSys || 0.885;
            p.annualKwh = typeof src.annualKwh === 'number' ? Math.round(src.annualKwh * scale) : src.annualKwh;
            p.relativeYieldPct = src.relativeYieldPct;
            p.heatmapColor = src.heatmapColor;
            p.annualTotalInsolation = typeof src.annualTotalInsolation === 'number' ? (src.annualTotalInsolation * scale) : src.annualTotalInsolation;
            p.annualShadedInsolation = typeof src.annualShadedInsolation === 'number' ? (src.annualShadedInsolation * scale) : src.annualShadedInsolation;
            p.isNormal = src.isNormal;
            p.requiresMLPE = src.requiresMLPE;
            p.isUnviable = src.isUnviable;
          }
          if (prev) {
            matchedAsyncPrevPanels.add(prev);
            if (prev.rawPanel) matchedAsyncPrevPanels.add(prev.rawPanel);
          }
          if (poly._geometryDirty) {
            // Geometría de cubierta editada: no arrastrar coordenadas manuales obsoletas del faldón viejo
          } else if (prev && (prev.isManual || (prev.rawPanel && prev.rawPanel.isManual))) {
            p.isManual = true;
            p.gridA = undefined;
            p.gridB = undefined;
            const srcCenter = (prev.isManual && prev.center) ? prev.center : (prev.rawPanel && prev.rawPanel.center ? prev.rawPanel.center : prev.center);
            const srcCorners = (prev.isManual && prev.corners) ? prev.corners : (prev.rawPanel && prev.rawPanel.corners ? prev.rawPanel.corners : prev.corners);
            if (srcCenter) p.center = Cesium.Cartesian3.clone(srcCenter);
            if (srcCorners) p.corners = srcCorners.map(c => Cesium.Cartesian3.clone(c));
            if (typeof prev.rot !== 'undefined') p.rot = prev.rot;
            else if (prev.rawPanel && typeof prev.rawPanel.rot !== 'undefined') p.rot = prev.rawPanel.rot;
            if (typeof prev.u !== 'undefined') p.u = prev.u;
            else if (prev.rawPanel && typeof prev.rawPanel.u !== 'undefined') p.u = prev.rawPanel.u;
            if (typeof prev.v !== 'undefined') p.v = prev.v;
            else if (prev.rawPanel && typeof prev.rawPanel.v !== 'undefined') p.v = prev.rawPanel.v;
            if (typeof prev.orientation !== 'undefined') p.orientation = prev.orientation;
            if (typeof prev.w !== 'undefined') p.w = prev.w;
            if (typeof prev.h !== 'undefined') p.h = prev.h;
          }
          if (prev && prev.deleted) {
            p.deleted = true;
          }
        }
      });
      if (!poly._geometryDirty && prevPanelsMap && prevPanelsMap.length > 0) {
        prevPanelsMap.forEach(op => {
          if (!op) return;
          const isMan = op.isManual || (op.rawPanel && op.rawPanel.isManual);
          if (isMan && !matchedAsyncPrevPanels.has(op)) {
            const srcCenter = (op.isManual && op.center) ? op.center : (op.rawPanel && op.rawPanel.center ? op.rawPanel.center : op.center);
            const srcCorners = (op.isManual && op.corners) ? op.corners : (op.rawPanel && op.rawPanel.corners ? op.rawPanel.corners : op.corners);
            if (srcCenter && Array.isArray(srcCorners) && srcCorners.length >= 3) {
              const extraIdx = pInfo.panels.length;
              pInfo.panels.push({
                ...op,
                center: Cesium.Cartesian3.clone(srcCenter),
                corners: srcCorners.map(c => Cesium.Cartesian3.clone(c)),
                isManual: true,
                gridA: undefined,
                gridB: undefined,
                layoutIndex: extraIdx,
                localIdx: extraIdx,
                polyIdx: polyIdx,
                panelId: op.panelId || ('pan_' + polyIdx + '_' + extraIdx)
              });
              matchedAsyncPrevPanels.add(op);
            }
          }
        });
      }
      if (poly._geometryDirty) {
        delete poly._geometryDirty;
      }
      pInfo.panels = pInfo.panels.filter(p => !p.deleted);
    }

    // Filtrar módulos que colisionen con obstáculos 3D actuales de cubierta
    if (pInfo && pInfo.panels && Array.isArray(obstacles) && obstacles.length > 0 && typeof getObstaclePolygon2DForRoof === 'function') {
      const obsSetbackEl = document.getElementById('cfg-obstacle-setback');
      const curObsSb = obsSetbackEl ? (parseFloat(obsSetbackEl.value) || 0.50) : 0.50;
      const roofCtx = (pInfo && pInfo.invTransform) ? pInfo : (poly && poly.roofInfo && poly.roofInfo.invTransform ? poly.roofInfo : null);
      if (roofCtx) {
        obstacles.forEach(obs => {
          const obsPoly = getObstaclePolygon2DForRoof(obs, curObsSb, roofCtx);
          if (obsPoly && obsPoly.length >= 3) {
            pInfo.panels = pInfo.panels.filter(p => {
              const pu = (typeof p.u === 'number') ? p.u : (p.center2D ? p.center2D.u : 0);
              const pv = (typeof p.v === 'number') ? p.v : (p.center2D ? p.center2D.v : 0);
              const hw = ((p.w || 1.13) / 2);
              const hl = ((p.h || 2.27) / 2);

              // Proyección OBB exacta de los 4 vértices del panel al espacio (U, V) de la cubierta
              let pPoly = null;
              if (p.corners2D && Array.isArray(p.corners2D) && p.corners2D.length >= 3) {
                pPoly = p.corners2D;
              } else if (p.corners && Array.isArray(p.corners) && p.corners.length >= 3 && roofCtx.invTransform && roofCtx.uVec && roofCtx.vVec) {
                pPoly = p.corners.map(c3 => {
                  const loc = Cesium.Matrix4.multiplyByPoint(roofCtx.invTransform, c3, new Cesium.Cartesian3());
                  return {
                    u: Cesium.Cartesian3.dot(loc, roofCtx.uVec),
                    v: Cesium.Cartesian3.dot(loc, roofCtx.vVec)
                  };
                });
              } else {
                pPoly = [
                  { u: pu - hw, v: pv - hl },
                  { u: pu + hw, v: pv - hl },
                  { u: pu + hw, v: pv + hl },
                  { u: pu - hw, v: pv + hl }
                ];
              }

              // A. Centro del panel dentro del obstáculo
              if (isPointInPolygon2D({ u: pu, v: pv }, obsPoly)) return false;

              // B. Algún vértice del panel dentro del obstáculo
              for (const c of pPoly) {
                if (isPointInPolygon2D(c, obsPoly)) return false;
              }

              // C. Algún vértice del obstáculo dentro del panel
              for (const oc of obsPoly) {
                if (isPointInPolygon2D(oc, pPoly)) return false;
              }

              // D. Intersección de aristas
              if (polygonsIntersect2D(pPoly, obsPoly)) return false;

              return true;
            });
          }
        });
      }
    }

    // Filtrar módulos marcados en la lista de exclusión persistente poly.deletedPanels
    if (pInfo && pInfo.panels && Array.isArray(poly.deletedPanels) && poly.deletedPanels.length > 0) {
      pInfo.panels = pInfo.panels.filter((p, pIdx) => {
        const isDeleted = poly.deletedPanels.some(dp => {
          // A. Coincidencia por panelId unívoco
          if (p.panelId && dp.panelId && p.panelId === dp.panelId) return true;
          // B. Coincidencia por coordenadas locales u, v en el plano del faldón (inmune a variaciones Z de altura)
          if (typeof p.u === 'number' && typeof p.v === 'number' && typeof dp.u === 'number' && typeof dp.v === 'number') {
            const du = Math.abs(p.u - dp.u);
            const dv = Math.abs(p.v - dp.v);
            if (du < 0.40 && dv < 0.40) return true;
          }
          // D. Coincidencia por proximidad espacial 3D (tolerancia ampliada a 0.65m para módulos inclinados o en pérgola)
          if (p.center && dp.center) {
            const d = Cesium.Cartesian3.distance(p.center, dp.center);
            if (d < 0.65) return true;
          }
          return false;
        });
        return !isDeleted;
      });
    }

    poly.roofInfo = pInfo;
    if (!pInfo || !pInfo.panels || pInfo.panels.length === 0) continue;

    let polyPanels = [...pInfo.panels];
    if (typeof window.wpFilterPanelsForPolyline === 'function') {
      polyPanels = window.wpFilterPanelsForPolyline(poly, polyIdx, polylinesList, obj, {
        polyPanels,
        maxTotalModules,
        targetKwp: (window.solarProjectConfig && window.solarProjectConfig.targetKwp) || 5.0,
        modWp: (typeof panelConfig !== 'undefined' && panelConfig.potencia) ? panelConfig.potencia : 450,
        isAnalyzingSolar: (typeof wpCurrentStep !== 'undefined' && wpCurrentStep <= 3) || (typeof solarSimState !== 'undefined' && solarSimState && solarSimState.viewMode === 'heatmap')
      });
    } else if (obj === 'zero_shades') {
      polyPanels = polyPanels.filter(p => !p.isShaded && (!p.annualLossPct || p.annualLossPct <= 5.0));
    }
    poly.panels = polyPanels;
    if (polyPanels.length === 0) continue;

    const hasEW = polyPanels.some(p => p.isEastWest);

    if (hasEW) {
      // <i data-lucide=\"rocket\" class=\"icon-sm\"></i> SEGREGACIÓN ELÉCTRICA ESTE-OESTE (Cero Desajuste de Corriente)
      const eastPanels = polyPanels.filter(p => p.ewSide === 'E');
      const westPanels = polyPanels.filter(p => p.ewSide !== 'E');

      const activeEastPanels = eastPanels.filter(p => !p.isGhost);
      const activeWestPanels = westPanels.filter(p => !p.isGhost);
      const ghostEastPanels = eastPanels.filter(p => p.isGhost);
      const ghostWestPanels = westPanels.filter(p => p.isGhost);

      // Renderizar módulos fantasma de reserva sin cableado
      ghostEastPanels.concat(ghostWestPanels).forEach((panelData, pIdx) => {
        allTargetPanels.push({
          corners: panelData.corners,
          center: panelData.center,
          polyIdx: polyIdx,
          mpptId: null,
          pIdx: pIdx,
          layoutIndex: panelData.layoutIndex,
          localIdx: (typeof panelData.layoutIndex === 'number') ? panelData.layoutIndex : (panelData.localIdx ?? pIdx),
          panelId: panelData.panelId,
          rawPanel: panelData,
          rot: panelData.rot || 0,
          isManual: !!panelData.isManual,
          isGhost: true,
          stringColor: '#10b981',
          stringName: 'RESERVA CEL',
          tag: 'RESERVA CEL',
          u: panelData.u,
          v: panelData.v,
          w: panelData.w,
          h: panelData.h,
          tiltDeg: panelData.tiltDeg,
          azimuthDeg: panelData.azimuthDeg,
          disabled: (poly.panelsDisabled === true) || !!panelData.disabled,
          annualLossPct: panelData.annualLossPct || 0,
          annualYieldPct: panelData.annualYieldPct,
          annualGrossKwh: panelData.annualGrossKwh,
          _lastPrSys: panelData._lastPrSys,
          annualKwh: panelData.annualKwh,
          relativeYieldPct: panelData.relativeYieldPct,
          annualTotalInsolation: panelData.annualTotalInsolation,
          isNormal: panelData.isNormal,
          requiresMLPE: panelData.requiresMLPE,
          isUnviable: panelData.isUnviable,
          heatmapColor: panelData.heatmapColor || (typeof getHeatmapColor === 'function' ? getHeatmapColor(panelData.annualLossPct || 0) : { hex: '#10b981' })
        });
      });

      [ { list: activeEastPanels, suffix: '-E', color: '#00F0FF' }, { list: activeWestPanels, suffix: '-W', color: '#F59E0B' } ].forEach(subGroup => {
        if (subGroup.list.length === 0) return;
        const partitioned = (shouldRenderElectricalStrings && typeof partitionPanelsIntoMPPTStrings === 'function')
          ? partitionPanelsIntoMPPTStrings(subGroup.list)
          : [{ stringSuffix: '', stringName: 'S1', panels: subGroup.list }];

        partitioned.forEach(subStr => {
          globalStringCounter++;
          const invMpptCount = (limits && limits.inverter && limits.inverter.mppt) ? limits.inverter.mppt : 2;
          const mpptId = (polyIdx % invMpptCount) + 1;
          const sName = "S" + (polyIdx + 1) + subGroup.suffix + subStr.stringSuffix;
          const strColor = shouldRenderElectricalStrings
            ? ((partitioned.length > 1) ? getPolylineStringColor(globalStringCounter - 1) : subGroup.color)
            : '#00F0FF';

          // Los módulos en subStr.panels ya están ordenados en la secuencia física Snake contigua
          const stringPanels = subStr.panels || [];

          stringPanels.forEach((panelData, pIdx) => {
            allTargetPanels.push({
              corners: panelData.corners,
              center: panelData.center,
              polyIdx: polyIdx,
              mpptId: mpptId,
              pIdx: pIdx,
              layoutIndex: panelData.layoutIndex,
              localIdx: (typeof panelData.layoutIndex === 'number') ? panelData.layoutIndex : (panelData.localIdx ?? pIdx),
              panelId: panelData.panelId,
              rawPanel: panelData,
              rot: panelData.rot || 0,
              isManual: !!panelData.isManual,
              stringColor: strColor,
              stringName: sName,
              tag: "MPPT" + mpptId + ":" + sName + ":" + String(pIdx + 1).padStart(2, "0"),
              u: panelData.u,
              v: panelData.v,
              w: panelData.w,
              h: panelData.h,
              tiltDeg: panelData.tiltDeg,
              azimuthDeg: panelData.azimuthDeg,
              isShaded: !!panelData.isShaded,
              hasMLPE: !!panelData.hasMLPE,
              annualLossPct: panelData.annualLossPct || 0,
              annualYieldPct: panelData.annualYieldPct,
              annualGrossKwh: panelData.annualGrossKwh,
              _lastPrSys: panelData._lastPrSys,
              annualKwh: panelData.annualKwh,
              relativeYieldPct: panelData.relativeYieldPct,
              annualTotalInsolation: panelData.annualTotalInsolation,
              isNormal: panelData.isNormal,
              requiresMLPE: panelData.requiresMLPE,
              isUnviable: panelData.isUnviable,
              heatmapColor: panelData.heatmapColor || (window.solarSimState && window.solarSimState.annualHeatmapDirty ? '#64748B' : (typeof getHeatmapColor === 'function' ? getHeatmapColor(panelData.annualLossPct || 0) : { hex: '#10b981' }))
            });
          });
        });
      });
    } else {
      // <i data-lucide=\"rocket\" class=\"icon-sm\"></i> PARTICIÓN DE STRINGS POR VENTANA MPPT HOMOGÉNEA Y PROTECCIÓN DE SOBRECARGA (IEC 62548 / REBT)
      const activePolyPanels = polyPanels.filter(p => !p.isGhost);
      const ghostPolyPanels = polyPanels.filter(p => p.isGhost);

      // Renderizar módulos fantasma de reserva sin cableado en la escena 3D
      ghostPolyPanels.forEach((panelData, pIdx) => {
        allTargetPanels.push({
          corners: panelData.corners,
          center: panelData.center,
          polyIdx: polyIdx,
          mpptId: null,
          pIdx: pIdx,
          layoutIndex: panelData.layoutIndex,
          localIdx: (typeof panelData.layoutIndex === 'number') ? panelData.layoutIndex : (panelData.localIdx ?? pIdx),
          panelId: panelData.panelId,
          rawPanel: panelData,
          rot: panelData.rot || 0,
          isManual: !!panelData.isManual,
          isGhost: true,
          stringColor: '#10b981',
          stringName: 'RESERVA CEL',
          tag: 'RESERVA CEL',
          u: panelData.u,
          v: panelData.v,
          w: panelData.w,
          h: panelData.h,
          tiltDeg: panelData.tiltDeg,
          azimuthDeg: panelData.azimuthDeg,
          disabled: (poly.panelsDisabled === true) || !!panelData.disabled,
          annualLossPct: panelData.annualLossPct || 0,
          annualYieldPct: panelData.annualYieldPct,
          annualGrossKwh: panelData.annualGrossKwh,
          _lastPrSys: panelData._lastPrSys,
          annualKwh: panelData.annualKwh,
          relativeYieldPct: panelData.relativeYieldPct,
          annualTotalInsolation: panelData.annualTotalInsolation,
          isNormal: panelData.isNormal,
          requiresMLPE: panelData.requiresMLPE,
          isUnviable: panelData.isUnviable,
          heatmapColor: panelData.heatmapColor || (typeof getHeatmapColor === 'function' ? getHeatmapColor(panelData.annualLossPct || 0) : { hex: '#10b981' })
        });
      });

      const partitioned = (shouldRenderElectricalStrings && typeof partitionPanelsIntoMPPTStrings === 'function')
        ? partitionPanelsIntoMPPTStrings(activePolyPanels)
        : [{ stringSuffix: '', stringName: 'S1', panels: activePolyPanels }];

      partitioned.forEach(subStr => {
        globalStringCounter++;
        const invMpptCount = (limits && limits.inverter && limits.inverter.mppt) ? limits.inverter.mppt : 2;
        const mpptId = (polyIdx % invMpptCount) + 1; // Asignación de faldón a canal MPPT dedicado
        const sName = (partitioned.length > 1) ? ("S" + (polyIdx + 1) + subStr.stringSuffix) : ("S" + (polyIdx + 1));
        const strColor = shouldRenderElectricalStrings ? getPolylineStringColor(globalStringCounter - 1) : '#00F0FF';

        // Los módulos en subStr.panels ya vienen ordenados en la serpiente global contigua
        const stringPanels = subStr.panels || [];

        stringPanels.forEach((panelData, pIdx) => {
          allTargetPanels.push({
            corners: panelData.corners,
            center: panelData.center,
            polyIdx: polyIdx,
            pIdx: pIdx,
            layoutIndex: panelData.layoutIndex,
            localIdx: (typeof panelData.layoutIndex === 'number') ? panelData.layoutIndex : (panelData.localIdx ?? pIdx),
            panelId: panelData.panelId,
            rawPanel: panelData,
            rot: panelData.rot || 0,
            isManual: !!panelData.isManual,
            stringColor: strColor,
            stringName: sName,
            tag: (pIdx === 0 ? "[+ IN] " : (pIdx === stringPanels.length - 1 ? "[- OUT] " : "")) + sName + ":" + String(pIdx + 1).padStart(2, "0"),
            u: panelData.u,
            v: panelData.v,
            w: panelData.w,
            h: panelData.h,
            tiltDeg: panelData.tiltDeg,
            azimuthDeg: panelData.azimuthDeg,
            isShaded: !!panelData.isShaded,
            hasMLPE: !!panelData.hasMLPE,
            annualLossPct: panelData.annualLossPct || 0,
            annualYieldPct: panelData.annualYieldPct,
            annualGrossKwh: panelData.annualGrossKwh,
            _lastPrSys: panelData._lastPrSys,
            annualKwh: panelData.annualKwh,
            relativeYieldPct: panelData.relativeYieldPct,
            annualTotalInsolation: panelData.annualTotalInsolation,
            isNormal: panelData.isNormal,
            requiresMLPE: panelData.requiresMLPE,
            isUnviable: panelData.isUnviable,
            disabled: (poly.panelsDisabled === true) || !!panelData.disabled,
            heatmapColor: panelData.heatmapColor || (typeof getHeatmapColor === 'function' ? getHeatmapColor(panelData.annualLossPct || 0) : { hex: '#10b981' })
          });
        });
        });
      }
      }
  // cierre del bucle de faldones (antes forEach)

  // [P0-MPPT] Auto-reasignación balanceada de strings entre canales MPPT:
  // sustituye la política faldón→canal fijo (polyIdx % mppt) cuando hay inversor con límites reales.
  if (window.RA && window.RA.Electrical && typeof window.RA.Electrical.rebalanceMPPTAssignment === 'function') {
    window.RA.Electrical.rebalanceMPPTAssignment(allTargetPanels);
  }

  if (typeof viewer !== "undefined" && viewer) {
    const isHeatmapMode = solarSimState && solarSimState.viewMode === 'heatmap';
    const isCableXRay = !!(window.RACableEngine && window.RACableEngine.auditElevationMode);
    const isPbrMode = !isHeatmapMode && !isCableXRay && !!window.isPhotorealisticTextureMode;

    // <i data-lucide=\"rocket\" class=\"icon-sm\"></i> 3. INSTANCIACIÓN GPU DE ALTO RENDIMIENTO (1 SOLO DRAW CALL PARA TODAS LAS PLACAS)
    let instancedSuccess = false;

    // <i data-lucide="camera" class="icon-sm"></i> MODO FOTORREALISTA PBR (TECLA T): Todas las placas con textura de silicio monocristalino y reflejo
    if (isPbrMode && viewer.scene) {
      const texUrl = (typeof solarPanelTextureUrl !== 'undefined' && solarPanelTextureUrl)
        ? solarPanelTextureUrl
        : ((typeof createSolarPanelTexture === 'function') ? createSolarPanelTexture() : '');
        
      const panelRenderState = (typeof Cesium !== 'undefined' && Cesium.RenderState && typeof Cesium.RenderState.fromCache === 'function')
        ? Cesium.RenderState.fromCache({
            depthTest: { enabled: true },
            depthMask: true,
            polygonOffset: { enabled: true, factor: -2.0, units: -2.0 }
          })
        : undefined;

      const texSource = (typeof window.solarPanelTextureCanvas !== 'undefined' && window.solarPanelTextureCanvas)
        ? window.solarPanelTextureCanvas
        : texUrl;

      const mat = (texUrl && typeof Cesium.Material.fromType === 'function')
        ? Cesium.Material.fromType('Image', { image: texSource })
        : (Cesium.Material && typeof Cesium.Material.fromType === 'function' ? Cesium.Material.fromType('Color', { color: Cesium.Color.fromCssColorString('#0a1931') }) : undefined);

      const instancesByFaldon = new Map();
      if (!isIncrementalTarget) {
        simulatedPanelEntities = [];
      }

      for (let i = 0; i < allTargetPanels.length; i++) {
        const pData = allTargetPanels[i];
        const fIdx = (typeof pData.polyIdx === 'number') ? pData.polyIdx : 0;

        if (isIncrementalTarget && fIdx !== targetPolyIdx) {
          continue;
        }

        const positions = new Float64Array([
            pData.corners[0].x, pData.corners[0].y, pData.corners[0].z,
            pData.corners[1].x, pData.corners[1].y, pData.corners[1].z,
            pData.corners[2].x, pData.corners[2].y, pData.corners[2].z,
            pData.corners[3].x, pData.corners[3].y, pData.corners[3].z
        ]);
        const isLand = (pData.orientation === 'landscape');
        const st = isLand
          ? new Float32Array([0.0, 1.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0])
          : new Float32Array([0.0, 0.0, 0.0, 1.0, 1.0, 1.0, 1.0, 0.0]);
        const v1 = Cesium.Cartesian3.subtract(pData.corners[1], pData.corners[0], new Cesium.Cartesian3()); // Length
        const v2 = Cesium.Cartesian3.subtract(pData.corners[3], pData.corners[0], new Cesium.Cartesian3()); // Width
        let norm = Cesium.Cartesian3.cross(v1, v2, new Cesium.Cartesian3()); // Length x Width -> UP
        Cesium.Cartesian3.normalize(norm, norm);
        const normals = new Float32Array([norm.x, norm.y, norm.z, norm.x, norm.y, norm.z, norm.x, norm.y, norm.z, norm.x, norm.y, norm.z]);
        const indices = new Uint16Array([0, 1, 2, 0, 2, 3]); // CCW winding for the UP normal

        const polyGeom = new Cesium.Geometry({
          attributes: {
            position: new Cesium.GeometryAttribute({ componentDatatype: Cesium.ComponentDatatype.DOUBLE, componentsPerAttribute: 3, values: positions }),
            st: new Cesium.GeometryAttribute({ componentDatatype: Cesium.ComponentDatatype.FLOAT, componentsPerAttribute: 2, values: st }),
            normal: new Cesium.GeometryAttribute({ componentDatatype: Cesium.ComponentDatatype.FLOAT, componentsPerAttribute: 3, values: normals })
          },
          indices: indices,
          primitiveType: Cesium.PrimitiveType.TRIANGLES,
          boundingSphere: Cesium.BoundingSphere.fromPoints(pData.corners)
        });

        if (!instancesByFaldon.has(fIdx)) instancesByFaldon.set(fIdx, []);
        instancesByFaldon.get(fIdx).push(new Cesium.GeometryInstance({
          geometry: polyGeom,
          id: "pv_panel_instance_" + i
        }));

        simulatedPanelEntities.push({
          id: "pv_panel_pool_" + i,
          show: true,
          pData: pData
        });
      }

      instancesByFaldon.forEach((instances, fIdx) => {
        if (instances.length === 0) return;
        const isFaldonDisabled = hasPolys && WP.polylines[fIdx] && (WP.polylines[fIdx].panelsDisabled === true);
        const faldonMat = isFaldonDisabled
          ? Cesium.Material.fromType('Color', { color: new Cesium.Color(0.38, 0.42, 0.48, 0.45) })
          : mat;
        const primitive = new Cesium.Primitive({
          geometryInstances: instances,
          appearance: new Cesium.MaterialAppearance({
            material: faldonMat,
            flat: true,
            translucent: isFaldonDisabled,
            renderState: isFaldonDisabled ? undefined : panelRenderState
          }),
          asynchronous: false,
          shadows: isFaldonDisabled ? 0 : (typeof Cesium !== 'undefined' && Cesium.ShadowMode ? Cesium.ShadowMode.ENABLED : 1)
        });
        if (currentRenderId !== _raRenderGenerationId) return;
        primitive._isRAPanelPrimitive = true;
        primitive._raFaldonIdx = fIdx;
        const fPrim = viewer.scene.primitives.add(primitive);
        fPrim._isRAPanelPrimitive = true;
        fPrim._raFaldonIdx = fIdx;
        window._faldonPanelsPrimitives.set(fIdx, fPrim);
        if (hasPolys && WP.polylines[fIdx]) {
          WP.polylines[fIdx].panelsPrimitive = fPrim;
        }
        if (fIdx === 0 || !window.simulatedPanelsPrimitive) {
          window.simulatedPanelsPrimitive = fPrim;
        }
      });

      instancedSuccess = true;
      if (typeof showStatus === 'function') {
        showStatus('<i data-lucide="camera" class="icon-sm"></i> ' + allTargetPanels.length + ' PANELES CON TEXTURA FOTORREALISTA PBR [T]', 2500);
      }
      if (viewer.scene && typeof viewer.scene.requestRender === 'function') {
        viewer.scene.requestRender();
      }
    }

    // GPU instancing nativo (1 draw call por faldón, PerInstanceColor) para todos los modos (normal y heatmap).
    if (!instancedSuccess && viewer.scene && viewer.scene.primitives && typeof Cesium.GeometryInstance === "function" && typeof Cesium.PolygonGeometry === "function") {
      try {
        const instancesByFaldon = new Map();
        if (!isIncrementalTarget) {
          simulatedPanelEntities = [];
        }

        for (let i = 0; i < allTargetPanels.length; i++) {
          const pData = allTargetPanels[i];
          const fIdx = (typeof pData.polyIdx === 'number') ? pData.polyIdx : 0;

          if (isIncrementalTarget && fIdx !== targetPolyIdx) {
            continue;
          }

          const positions = new Float64Array([  pData.corners[0].x, pData.corners[0].y, pData.corners[0].z,  pData.corners[1].x, pData.corners[1].y, pData.corners[1].z,  pData.corners[2].x, pData.corners[2].y, pData.corners[2].z,  pData.corners[3].x, pData.corners[3].y, pData.corners[3].z]);
          const isLandInst = (pData.orientation === 'landscape');
          const st = isLandInst ? new Float32Array([0.0, 1.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0]) : new Float32Array([0.0, 0.0, 0.0, 1.0, 1.0, 1.0, 1.0, 0.0]);
          const v1 = Cesium.Cartesian3.subtract(pData.corners[1], pData.corners[0], new Cesium.Cartesian3()); // Length
          const v2 = Cesium.Cartesian3.subtract(pData.corners[3], pData.corners[0], new Cesium.Cartesian3()); // Width
          let norm = Cesium.Cartesian3.cross(v1, v2, new Cesium.Cartesian3()); // Length x Width -> UP
          Cesium.Cartesian3.normalize(norm, norm);
          const normals = new Float32Array([norm.x, norm.y, norm.z, norm.x, norm.y, norm.z, norm.x, norm.y, norm.z, norm.x, norm.y, norm.z]);
          const indices = new Uint16Array([0, 1, 2, 0, 2, 3]); /* CCW winding */
          const polyGeom = new Cesium.Geometry({  attributes: {    position: new Cesium.GeometryAttribute({ componentDatatype: Cesium.ComponentDatatype.DOUBLE, componentsPerAttribute: 3, values: positions }),    st: new Cesium.GeometryAttribute({ componentDatatype: Cesium.ComponentDatatype.FLOAT, componentsPerAttribute: 2, values: st }),    normal: new Cesium.GeometryAttribute({ componentDatatype: Cesium.ComponentDatatype.FLOAT, componentsPerAttribute: 3, values: normals })  },  indices: indices,  primitiveType: Cesium.PrimitiveType.TRIANGLES,  boundingSphere: Cesium.BoundingSphere.fromPoints(pData.corners)});

          let color;
          if (pData.disabled) {
            // [DEACTIVATED] Tinte grisáceo apagado translúcido para módulos excluidos de ingeniería
            color = new Cesium.Color(0.38, 0.42, 0.48, 0.40);
          } else if (isHeatmapMode) {
            // [HEATMAP] Prioridad absoluta: gradiente térmico de radiación anual para todos los módulos
            const hex = (pData.heatmapColor && (pData.heatmapColor.hex || pData.heatmapColor)) ||
              (typeof getHeatmapColor === 'function' ? getHeatmapColor(pData.annualLossPct || 0).hex : '#10b981');
            color = Cesium.Color.fromCssColorString(hex);
          } else if (pData.isGhost) {
            // [GHOST-PANEL] Modo translúcido cian/esmeralda para placas de reserva / CEL en modos no térmicos
            color = new Cesium.Color(0.06, 0.72, 0.51, 0.28);
          } else {
            // Tinte fotovoltaico distintivo por String (elegante, contrastado y reconocible en 3D)
            const rawStrCol = Cesium.Color.fromCssColorString(pData.stringColor || '#00F0FF');
            color = new Cesium.Color(
              rawStrCol.red * 0.42 + 0.04,
              rawStrCol.green * 0.42 + 0.04,
              rawStrCol.blue * 0.42 + 0.08,
              1.0
            );
          }

          if (isCableXRay && !pData.disabled && !pData.isGhost) {
            color = new Cesium.Color(color.red, color.green, color.blue, 0.25);
          }

          if (!instancesByFaldon.has(fIdx)) instancesByFaldon.set(fIdx, []);
          instancesByFaldon.get(fIdx).push(new Cesium.GeometryInstance({
            geometry: polyGeom,
            attributes: {
              color: Cesium.ColorGeometryInstanceAttribute.fromColor(color)
            },
            id: "pv_panel_instance_" + i
          }));

          // [F1-02] Referencia ligera sin alocar PolygonHierarchy descartado por cada panel
          simulatedPanelEntities.push({
            id: "pv_panel_pool_" + i,
            instanceId: "pv_panel_instance_" + i,
            faldonIdx: fIdx,
            show: true,
            pData: pData,
            polygon: {
              material: color,
              outlineColor: isHeatmapMode ? Cesium.Color.BLACK : Cesium.Color.fromCssColorString(pData.stringColor)
            }
          });
        }

        const panelRenderState = (typeof Cesium !== "undefined" && Cesium.RenderState && typeof Cesium.RenderState.fromCache === "function")
          ? Cesium.RenderState.fromCache({
              depthTest: {
                enabled: true
              },
              depthMask: !isCableXRay,
              polygonOffset: {
                enabled: true,
                factor: -2.0,
                units: -2.0
              }
            })
          : undefined;
        const hasTranslucentPanels = isCableXRay || (isHeatmapMode
          ? allTargetPanels.some(p => p.disabled)
          : allTargetPanels.some(p => p.isGhost || p.disabled));
        const appearance = Cesium.PerInstanceColorAppearance ? new Cesium.PerInstanceColorAppearance({
          flat: true,
          translucent: hasTranslucentPanels,
          closed: false,
          renderState: panelRenderState
        }) : undefined;

        instancesByFaldon.forEach((instances, fIdx) => {
          if (instances.length === 0) return;
          const primitive = new Cesium.Primitive({
            geometryInstances: instances,
            appearance: appearance,
            asynchronous: true,
            shadows: isCableXRay ? 0 : (typeof Cesium !== 'undefined' && Cesium.ShadowMode ? Cesium.ShadowMode.ENABLED : 1)
          });
          if (currentRenderId !== _raRenderGenerationId) return;
          primitive._isRAPanelPrimitive = true;
          primitive._raFaldonIdx = fIdx;
          const fPrim = viewer.scene.primitives.add(primitive);
          fPrim._isRAPanelPrimitive = true;
          fPrim._raFaldonIdx = fIdx;
          window._faldonPanelsPrimitives.set(fIdx, fPrim);
          if (hasPolys && WP.polylines[fIdx]) {
            WP.polylines[fIdx].panelsPrimitive = fPrim;
          }
          if (fIdx === 0 || !window.simulatedPanelsPrimitive) {
            window.simulatedPanelsPrimitive = fPrim;
          }
        });

        // [F1-02] Helper de recoloración in-place (< 5ms sin reconstruir geometrías GPU)
        window.wpRecolorSimulatedPanelsInPlace = function(mode) {
          if (!window._faldonPanelsPrimitives || !Array.isArray(window.allRenderedPanels)) return false;
          const useHeatmap = (mode === 'heatmap') || (mode === undefined && typeof solarSimState !== 'undefined' && solarSimState && solarSimState.viewMode === 'heatmap');
          let updated = 0;
          const colorBuf = new Uint8Array(4);
          for (let i = 0; i < window.allRenderedPanels.length; i++) {
            const pData = window.allRenderedPanels[i];
            if (!pData) continue;
            const fIdx = (typeof pData.polyIdx === 'number') ? pData.polyIdx : 0;
            const fPrim = window._faldonPanelsPrimitives.get(fIdx);
            if (!fPrim || fPrim.isDestroyed() || !fPrim.ready || typeof fPrim.getGeometryInstanceAttributes !== 'function') continue;
            const attrs = fPrim.getGeometryInstanceAttributes('pv_panel_instance_' + i);
            if (!attrs || !attrs.color) continue;
            let col;
            if (pData.disabled) {
              col = new Cesium.Color(0.38, 0.42, 0.48, 0.40);
            } else if (useHeatmap) {
              const hex = (pData.heatmapColor && (pData.heatmapColor.hex || pData.heatmapColor)) ||
                (typeof getHeatmapColor === 'function' ? getHeatmapColor(pData.annualLossPct || 0).hex : '#10b981');
              col = Cesium.Color.fromCssColorString(hex);
            } else if (pData.isGhost) {
              col = new Cesium.Color(0.06, 0.72, 0.51, 0.28);
            } else {
              const raw = Cesium.Color.fromCssColorString(pData.stringColor || '#00F0FF');
              col = new Cesium.Color(raw.red * 0.42 + 0.04, raw.green * 0.42 + 0.04, raw.blue * 0.42 + 0.08, 1.0);
            }
            attrs.color = Cesium.ColorGeometryInstanceAttribute.toValue(col, colorBuf);
            updated++;
          }
          if (updated > 0 && typeof viewer !== 'undefined' && viewer && viewer.scene && typeof viewer.scene.requestRender === 'function') {
            viewer.scene.requestRender();
            return true;
          }
          return false;
        };

        instancedSuccess = true;
        if (typeof showStatus === 'function') {
          showStatus(`<i data-lucide="check" class="icon-sm"></i> ${allTargetPanels.length} PANELES FV RENDERIZADOS EN 3D (GPU 1-CALL/FALDÓN)`, 3500);
        }
        window.RA && window.RA.log && window.RA.log.warn(`[TELEMETRÍA FV] ÉXITO: ${allTargetPanels.length} paneles renderizados en GPU Primitives`);
        if (viewer.scene && typeof viewer.scene.requestRender === 'function') {
          viewer.scene.requestRender();
        }
      } catch (eInst) {
        window.RA && window.RA.log && window.RA.log.debug("Fallback a entidades para paneles:", eInst);
      }
    }

    // Renderizado de paneles FV:
    //   - Modo normal: GPU Primitive con MaterialAppearance+Image (textura AAA procedural, 1 draw call)
    //   - Modo heatmap: GPU Primitive con PerInstanceColor (gestionado por GPU instancing)
    if (!instancedSuccess && viewer.entities) {
      simulatedPanelEntities = [];
      for (let i = 0; i < allTargetPanels.length; i++) {
        const pData = allTargetPanels[i];
        const isHeatmap = isHeatmapMode;
        const panelColor = isHeatmap
          ? (pData.heatmapColor ? Cesium.Color.fromCssColorString(pData.heatmapColor.hex) : Cesium.Color.fromCssColorString("#10b981"))
          : Cesium.Color.fromCssColorString(pData.stringColor || "#00F0FF").withAlpha(0.95);

        const matProp = new Cesium.ColorMaterialProperty(panelColor);

        const panelHierarchy = new Cesium.PolygonHierarchy(pData.corners);
        const pe = viewer.entities.add({
          id: "pv_panel_pool_" + i + "_" + Math.random().toString(36).substring(2, 6),
          show: true,
          pData: pData,
          polygon: {
            hierarchy: panelHierarchy,
            material: matProp,
            perPositionHeight: true,
            shadows: (typeof Cesium !== 'undefined' && Cesium.ShadowMode ? Cesium.ShadowMode.ENABLED : 1)
          }
        });
        simulatedPanelEntities.push(pe);
      }
      if (typeof showStatus === 'function') {
        showStatus(`<i data-lucide=\"check\" class=\"icon-sm\"></i> ${simulatedPanelEntities.length} PANELES FV RENDERIZADOS EN 3D`, 3500);
      }
      window.RA && window.RA.log && window.RA.log.warn(`[TELEMETRÍA FV] ÉXITO: ${simulatedPanelEntities.length} paneles añadidos a viewer.entities`);
      if (viewer.scene && typeof viewer.scene.requestRender === 'function') {
        viewer.scene.requestRender();
      }
    }

    // 4. El renderizado físico y normativo de cableado (latiguillos, retornos, homerun y AC)
    // se delega de forma única y canónica a RACableEngine (paso 8).
    // 5. <i data-lucide=\"tag\" class=\"icon-sm\"></i> ETIQUETAS Y NUMERACIÓN DE PANELES POR STRING (EN ESQUINA CON FONDO NEGRO Y TEXTO BLANCO)
    if (viewer.scene && viewer.scene.primitives && typeof Cesium.LabelCollection === "function") {
      try {
        wpCleanupPanelNumberLabels();
        const lblCol = new Cesium.LabelCollection();
        lblCol._isPanelNumberCollection = true;
        for (let i = 0; i < allTargetPanels.length; i++) {
          const pData = allTargetPanels[i];
          if (!pData.corners || pData.corners.length < 4 || pData.disabled) continue;

          // Tomar la esquina superior izquierda (C0) con una ligera elevación (+0.04m)
          const corner0 = pData.corners[0];
          const corner1 = pData.corners[1];
          const corner3 = pData.corners[3];
          
          // Desplazar ligeramente hacia el interior de la placa (12% de ancho/alto)
          const vW = Cesium.Cartesian3.subtract(corner1, corner0, new Cesium.Cartesian3());
          const vH = Cesium.Cartesian3.subtract(corner3, corner0, new Cesium.Cartesian3());
          const badgePos = Cesium.Cartesian3.add(
            corner0,
            Cesium.Cartesian3.add(
              Cesium.Cartesian3.multiplyByScalar(vW, 0.12, new Cesium.Cartesian3()),
              Cesium.Cartesian3.multiplyByScalar(vH, 0.12, new Cesium.Cartesian3()),
              new Cesium.Cartesian3()
            ),
            new Cesium.Cartesian3()
          );

          const panelNum = (typeof pData.pIdx === 'number' && shouldRenderElectricalStrings) ? (pData.pIdx + 1) : (i + 1);

                    // [DIRECCIÓN DE ARTE AAA] Micro-badge HUD minimalista con acabado translúcido
          lblCol.add({
            position: badgePos,
            text: shouldRenderElectricalStrings ? pData.tag : ('#' + String(panelNum)),
            font: "600 9px 'Inter', system-ui, sans-serif",
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.fromCssColorString('#0284c7'),
            outlineWidth: 1.0,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            showBackground: true,
            backgroundColor: shouldRenderElectricalStrings
              ? ((pData.tag && pData.tag.includes("[+")) ? Cesium.Color.fromCssColorString("#EF4444").withAlpha(0.85) : ((pData.tag && pData.tag.includes("[-")) ? Cesium.Color.fromCssColorString("#1E293B").withAlpha(0.85) : Cesium.Color.fromCssColorString("#0F172A").withAlpha(0.85)))
              : Cesium.Color.fromCssColorString("#0F172A").withAlpha(0.75),
            backgroundPadding: new Cesium.Cartesian2(5, 3),
            horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            pixelOffset: shouldRenderElectricalStrings ? new Cesium.Cartesian2(0, -14) : new Cesium.Cartesian2(0, 0),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            eyeOffset: new Cesium.Cartesian3(0, 0, -1.0),
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0.0, 120.0)
          });
        }
        window._panelNumberLabelCollection = viewer.scene.primitives.add(lblCol);
        // Respetar estado combinado: L/H oculta etiquetas + modo captura (C) también las oculta
        var _labelsEffectiveShow = (window.areLabelsVisible !== false) && !(window.RACapture && window.RACapture.active);
        window._panelNumberLabelCollection.show = _labelsEffectiveShow;
      } catch (eLblCol) {
        window.RA && window.RA.log && window.RA.log.debug("Fallback a entidades para números de paneles:", eLblCol);
      }
    }

    if (viewer.scene && typeof viewer.scene.requestRender === "function") {
      viewer.scene.requestRender();
    }
  }

  if (typeof render3DObstaclesInCesium === "function") {
    render3DObstaclesInCesium();
  }

  // Actualizar sombreado o heatmap según el modo activo
  if (solarSimState && solarSimState.viewMode === 'heatmap') {
    wpRenderHeatmapVisuals();
  } else if (solarSimState && solarSimState.currentSolarPos) {
    wpUpdatePanelShadingAndMLPE(solarSimState.currentSolarPos);
  }

  // 7b. VALIDACIÓN DE CAPACIDAD DEL INVERSOR: nº de strings por MPPT vs entradas físicas
  {
    const cfg = window.solarProjectConfig || {};
    const topo = cfg.selectedTopology || 'inverter';

    // En topología de microinversores, la conversión y MPPT es distribuida por módulo: no aplica límite de inversor central
    if (topo !== 'microinverter') {
      const invCfg = (cfg.calculatedLimits && cfg.calculatedLimits.inverter) || null;
      if (invCfg && typeof invCfg.mppt === 'number') {
        const stringsByMppt = {};
        allTargetPanels.forEach(p => {
          if (!p.stringName) return;
          const k = p.mpptId || 1;
          (stringsByMppt[k] = stringsByMppt[k] || new Set()).add(p.stringName);
        });

        // Contabilizar la cantidad real de inversores dimensionados (Nx)
        const invCount = (cfg.autoSizing && cfg.autoSizing.inverters && cfg.autoSizing.inverters.count > 0)
          ? cfg.autoSizing.inverters.count
          : (cfg.inverterCount || 1);

        const inputsPerMppt = invCfg.inputsPerMppt || 1;
        const totalMppts = invCfg.mppt * invCount;
        const maxStrings = totalMppts * inputsPerMppt;

        let totalStrings = 0, maxPerChannel = 0;
        Object.values(stringsByMppt).forEach(set => {
          totalStrings += set.size;
          maxPerChannel = Math.max(maxPerChannel, set.size);
        });

        // Si el número de strings excede la capacidad de inversores actual, disparar auto-dimensionamiento
        if (totalStrings > maxStrings && typeof wpComputeAutoSizing === 'function') {
          wpComputeAutoSizing(allTargetPanels.filter(p => !p.deleted && !p.disabled).length);
        }

        const updatedInvCount = (cfg.autoSizing && cfg.autoSizing.inverters && cfg.autoSizing.inverters.count > 0)
          ? cfg.autoSizing.inverters.count
          : invCount;
        const updatedMaxStrings = invCfg.mppt * updatedInvCount * inputsPerMppt;

        if (totalStrings > updatedMaxStrings) {
          if (typeof showStatus === 'function') {
            showStatus(`<i data-lucide="alert-triangle" class="icon-sm"></i> ⚠ SOBRECARGA DE ENTRADAS: ${totalStrings} strings sobre ${updatedInvCount}x Inversor (${invCfg.mppt * updatedInvCount} MPPT · máx. ${updatedMaxStrings} entradas). Selecciona un inversor comercial multi-MPPT o microinversores en Fase 4.`, 6000);
          }
          window.solarProjectConfig.inverterCapacityWarning = {
            totalStrings, maxStrings: updatedMaxStrings, mppt: invCfg.mppt * updatedInvCount, inputsPerMppt,
            exceeded: true, checkedAt: new Date().toISOString()
          };
        } else {
          window.solarProjectConfig.inverterCapacityWarning = { totalStrings, maxStrings: updatedMaxStrings, exceeded: false };
        }
      }
    }
  }

  lastRoofInfo = Object.assign({}, lastRoofInfo || {}, {
    poly2D: (roofInfo && roofInfo.poly2D) || (lastRoofInfo && lastRoofInfo.poly2D) || null,
    origin: (roofInfo && roofInfo.origin) || (lastRoofInfo && lastRoofInfo.origin) || null,
    normal: (roofInfo && roofInfo.normal) || (lastRoofInfo && lastRoofInfo.normal) || null,
    uVec: (roofInfo && roofInfo.uVec) || (lastRoofInfo && lastRoofInfo.uVec) || null,
    vVec: (roofInfo && roofInfo.vVec) || (lastRoofInfo && lastRoofInfo.vVec) || null,
    transform: (roofInfo && roofInfo.transform) || (lastRoofInfo && lastRoofInfo.transform) || null,
    panels: allTargetPanels,
    orientation: (roofInfo && roofInfo.orientation) || 'portrait'
  });

  // 7b. SOPORTES 3D DE ESTRUCTURAS PARAMÉTRICAS (Raíles coplanares, Balastos triangulares y Pérgolas)
  // MIGRACIÓN AAA: Renderizado directo en GPU via viewer.scene.primitives (PolylineCollection)
  // idéntico a RACableEngine y simulatedStringsPolylineCollection para garantizar visibilidad al 100%.
  if (typeof viewer !== "undefined" && viewer && viewer.scene && viewer.scene.primitives && typeof WP !== "undefined" && WP && WP.polylines) {
    try {
      const railMat = Cesium.Material.fromType('Color', { color: Cesium.Color.fromCssColorString('#CBD5E1') });
      const balastoMat = Cesium.Material.fromType('Color', { color: Cesium.Color.fromCssColorString('#475569') });
      const pergolaMat = balastoMat;

      WP.polylines.forEach((poly, polyIdx) => {
        if (poly && poly.panelsVisible === false) return;
        if (isIncrementalTarget && polyIdx !== targetPolyIdx) return;
        const pInfo = poly.roofInfo;
        if (!pInfo) return;
        const panels = (poly.panels && poly.panels.length > 0) ? poly.panels : (pInfo.panels || []);
        if (!panels || panels.length === 0) return;
        const supportCol = new Cesium.PolylineCollection();
        let totalLinesAdded = 0;
        
        let est = poly.estructura || null;
        const roofTilt = pInfo.tiltDeg || 0;
        const panelTilt = (panels[0] && panels[0].tiltDeg !== undefined) ? panels[0].tiltDeg : roofTilt;
        
        // Auto-detección solo si no hay estructura definida explícitamente en el faldón
        if (!est || !est.tipo) {
          if (poly.structureType === 'pergola') {
            est = { tipo: 'pergola', clearance: 1.80 };
          } else if (Math.abs(panelTilt - roofTilt) > 3 || (poly.structureType && poly.structureType.includes('triangle'))) {
            est = { tipo: 'balasto', clearance: 0.20 };
          } else {
            est = { tipo: 'coplanar', clearance: 0.05 };
          }
        }
        
        const esPergola = (est.tipo === 'pergola') || (poly.structureType === 'pergola');
        const esCoplanar = !esPergola && ((est.tipo === 'coplanar') || (poly.structureType && poly.structureType.startsWith('coplanar')));
        if (esCoplanar) return; // En montaje coplanar los paneles van enrasados al tejado sin estructura transversal visible sobre o bajo el módulo
        const pergolaPostCandidates = [];

        // Proyección analítica exacta de puntos 3D sobre el plano del faldón
        const paRoof = (pInfo && pInfo.transform && pInfo.invTransform && pInfo.normal)
          ? { transform: pInfo.transform, invTransform: pInfo.invTransform, normal: pInfo.normal, localPoints: pInfo.localPoints || [new Cesium.Cartesian3(0,0,0)] }
          : (typeof polygonAnalysis === 'function' ? polygonAnalysis(poly.points) : null);
        const p0Roof = (paRoof && paRoof.localPoints && paRoof.localPoints[0]) || new Cesium.Cartesian3(0, 0, 0);
        const normRoof = paRoof ? paRoof.normal : new Cesium.Cartesian3(0, 0, 1);
        const planeDRoof = -(normRoof.x * p0Roof.x + normRoof.y * p0Roof.y + normRoof.z * p0Roof.z);

        const projectPointToRoof = function(worldPos) {
          if (!paRoof || !paRoof.invTransform || !paRoof.transform) {
            const c = Cesium.Cartographic.fromCartesian(worldPos);
            const clH = (est && est.clearance > 0) ? est.clearance : 1.80;
            return Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, c.height - clH);
          }
          const loc = Cesium.Matrix4.multiplyByPoint(paRoof.invTransform, worldPos, new Cesium.Cartesian3());
          let gLoc;
          if (Math.abs(normRoof.z) > 0.05) {
            const gz = -(normRoof.x * loc.x + normRoof.y * loc.y + planeDRoof) / normRoof.z;
            gLoc = new Cesium.Cartesian3(loc.x, loc.y, gz);
          } else {
            const dist = normRoof.x * loc.x + normRoof.y * loc.y + normRoof.z * loc.z + planeDRoof;
            gLoc = new Cesium.Cartesian3(loc.x - dist * normRoof.x, loc.y - dist * normRoof.y, loc.z - dist * normRoof.z);
          }
          return Cesium.Matrix4.multiplyByPoint(paRoof.transform, gLoc, new Cesium.Cartesian3());
        };

        panels.forEach((p, idx) => {
          if (!p.corners || p.corners.length < 4) return;
          try {
            // Identificar los dos laterales paralelos de la estructura sin riesgo de cruce en aspa (X)
            // Evaluamos la pendiente diferencial a lo largo de las aristas topológicas del módulo
            const h0 = Cesium.Cartographic.fromCartesian(p.corners[0]).height;
            const h1 = Cesium.Cartographic.fromCartesian(p.corners[1]).height;
            const h2 = Cesium.Cartographic.fromCartesian(p.corners[2]).height;
            const h3 = Cesium.Cartographic.fromCartesian(p.corners[3]).height;

            let pair1, pair2;
            if (Math.abs(h0 - h3) >= Math.abs(h0 - h1)) {
              pair1 = (h0 <= h3) ? { low: p.corners[0], high: p.corners[3] } : { low: p.corners[3], high: p.corners[0] };
              pair2 = (h1 <= h2) ? { low: p.corners[1], high: p.corners[2] } : { low: p.corners[2], high: p.corners[1] };
            } else {
              pair1 = (h0 <= h1) ? { low: p.corners[0], high: p.corners[1] } : { low: p.corners[1], high: p.corners[0] };
              pair2 = (h3 <= h2) ? { low: p.corners[3], high: p.corners[2] } : { low: p.corners[2], high: p.corners[3] };
            }

            if (esPergola) {
              // PÉRGOLA ELEVADA: Pórtico 3D completo con 4 pilares a cubierta y vigas de dintel
              // 1. Proyectar matemáticamente cada esquina a la superficie exacta del faldón/tejado
              const gCorners = p.corners.map(c => projectPointToRoof(c));

              // 2. Pilares verticales / a plomo desde cada esquina del módulo hasta la cubierta
              for (let ci = 0; ci < 4; ci++) {
                const leg = supportCol.add({
                  positions: [p.corners[ci], gCorners[ci]],
                  width: 6.0,
                  show: true
                });
                leg.material = pergolaMat;
                totalLinesAdded++;
                pergolaPostCandidates.push({
                  top: p.corners[ci],
                  bottom: gCorners[ci]
                });
              }

              // 3. Vigas de dintel superiores: Unen los 4 pilares bajo el módulo formando el bastidor estructural
              // Lintel perimetral cerrado [C0 -> C1 -> C2 -> C3 -> C0]
              const dintelLoop = supportCol.add({
                positions: [p.corners[0], p.corners[1], p.corners[2], p.corners[3], p.corners[0]],
                width: 5.5,
                show: true
              });
              dintelLoop.material = pergolaMat;
              totalLinesAdded++;

                        } else if (!esCoplanar) {
              // BALASTO / ESTRUCTURA TRIANGULAR INCLINADA PROFESIONAL (A-Frame solar):
              // [DIRECCIÓN DE ARTE AAA]:
              // 1. Vector normal inferior: los elementos de soporte van SIEMPRE en el intradós (espalda) del panel (-0.05m).
              // 2. Retranqueo longitudinal (-0.06m en la arista alta y +0.06m en la arista baja): las patas mueren bajo el marco y NO sobresalen como cuernos/aletas.
              // 3. Los raíles transversales se sitúan estrictamente bajo el panel en la cota de intradós para que NO atraviesen el cristal fotovoltaico.
              const v1_m = Cesium.Cartesian3.subtract(p.corners[1], p.corners[0], new Cesium.Cartesian3());
              const v2_m = Cesium.Cartesian3.subtract(p.corners[3], p.corners[0], new Cesium.Cartesian3());
              const n_m = Cesium.Cartesian3.normalize(Cesium.Cartesian3.cross(v1_m, v2_m, new Cesium.Cartesian3()), new Cesium.Cartesian3());
              // Garantizar normal hacia el cielo (evita invertir underOffset por encima del cristal)
              const skyUp = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(p.corners[0], new Cesium.Cartesian3());
              if (Cesium.Cartesian3.dot(n_m, skyUp) < 0) {
                Cesium.Cartesian3.negate(n_m, n_m);
              }
              const underOffset = Cesium.Cartesian3.multiplyByScalar(n_m, -0.05, new Cesium.Cartesian3()); // 50mm por debajo de la superficie del cristal

              [pair1, pair2].forEach((pair) => {
                const legVec = Cesium.Cartesian3.subtract(pair.high, pair.low, new Cesium.Cartesian3());
                const legLen = Cesium.Cartesian3.magnitude(legVec);
                const legDir = (legLen > 0.01) ? Cesium.Cartesian3.normalize(legVec, new Cesium.Cartesian3()) : new Cesium.Cartesian3();

                // Retranqueo de fijación de clamps:
                // Retranqueo de 9cm hacia arriba en la arista inferior para que la pata no asome por abajo,
                // y retranqueo de 8cm hacia abajo en la arista superior.
                const clampInsetLow = Cesium.Cartesian3.multiplyByScalar(legDir, 0.09, new Cesium.Cartesian3());
                const clampInsetHigh = Cesium.Cartesian3.multiplyByScalar(legDir, -0.08, new Cesium.Cartesian3());

                const topLow = Cesium.Cartesian3.add(Cesium.Cartesian3.add(pair.low, underOffset, new Cesium.Cartesian3()), clampInsetLow, new Cesium.Cartesian3());
                const topHigh = Cesium.Cartesian3.add(Cesium.Cartesian3.add(pair.high, underOffset, new Cesium.Cartesian3()), clampInsetHigh, new Cesium.Cartesian3());

                // Base del triángulo estrictamente bajo la arista baja del panel (nunca por encima del cristal):
                // groundFront descansa 3cm bajo topLow; groundBack cae a plomo desde topHigh al mismo plano base.
                const groundFront = Cesium.Cartesian3.subtract(
                  topLow,
                  Cesium.Cartesian3.multiplyByScalar(skyUp, 0.03, new Cesium.Cartesian3()),
                  new Cesium.Cartesian3()
                );
                const dropBackH = Math.max(0.08, Cesium.Cartesian3.dot(
                  Cesium.Cartesian3.subtract(topHigh, groundFront, new Cesium.Cartesian3()),
                  skyUp
                ));
                let groundBack = Cesium.Cartesian3.subtract(
                  topHigh,
                  Cesium.Cartesian3.multiplyByScalar(skyUp, dropBackH, new Cesium.Cartesian3()),
                  new Cesium.Cartesian3()
                );

                // Vector de base real en cubierta confinado bajo la proyección del panel (sin extensiones artificiales):
                const baseVec = Cesium.Cartesian3.subtract(groundBack, groundFront, new Cesium.Cartesian3());
                const baseLen = Cesium.Cartesian3.magnitude(baseVec);
                if (baseLen > 0.05) {
                  const dir = Cesium.Cartesian3.normalize(baseVec, new Cesium.Cartesian3());
                  // Limitar la longitud de la zapata al intradós del marco para no sobresalir hacia adelante ni atrás
                  const maxBaseLen = Math.min(baseLen, (p.h || 2.10) * 0.95);
                  groundBack = Cesium.Cartesian3.add(groundFront, Cesium.Cartesian3.multiplyByScalar(dir, maxBaseLen, new Cesium.Cartesian3()), new Cesium.Cartesian3());
                }

                // Triángulo estructural cerrado A-Frame (confinado bajo el marco, acabado aluminio anodizado oscuro)
                const triLeg = supportCol.add({
                  positions: [topLow, groundFront, groundBack, topHigh, topLow],
                  width: 4.0,
                  show: true
                });
                triLeg.material = balastoMat;
                totalLinesAdded++;

                // Zapata de lastre de hormigón: prisma pesado sobre la cubierta
                const ballastFoot = supportCol.add({
                  positions: [groundFront, groundBack],
                  width: 9.0,
                  show: true
                });
                ballastFoot.material = balastoMat;
                totalLinesAdded++;
              });

              // Barra transversal estabilizadora entre ambos apoyos en el suelo (arriostramiento inferior bajo los paneles)
              const gFront1 = Cesium.Cartesian3.subtract(
                Cesium.Cartesian3.add(pair1.low, underOffset, new Cesium.Cartesian3()),
                Cesium.Cartesian3.multiplyByScalar(skyUp, 0.03, new Cesium.Cartesian3()),
                new Cesium.Cartesian3()
              );
              const gFront2 = Cesium.Cartesian3.subtract(
                Cesium.Cartesian3.add(pair2.low, underOffset, new Cesium.Cartesian3()),
                Cesium.Cartesian3.multiplyByScalar(skyUp, 0.03, new Cesium.Cartesian3()),
                new Cesium.Cartesian3()
              );

              const tieBar = supportCol.add({
                positions: [gFront1, gFront2],
                width: 3.5,
                show: true
              });
              tieBar.material = railMat;
              totalLinesAdded++;

              // Raíles longitudinales transversales de aluminio: SITUADOS EN EL INTRADÓS (bajo el cristal)
              const leg1Dir = Cesium.Cartesian3.subtract(pair1.high, pair1.low, new Cesium.Cartesian3());
              const leg2Dir = Cesium.Cartesian3.subtract(pair2.high, pair2.low, new Cesium.Cartesian3());

              const rA_S = Cesium.Cartesian3.add(Cesium.Cartesian3.add(pair1.low, underOffset, new Cesium.Cartesian3()), Cesium.Cartesian3.multiplyByScalar(leg1Dir, 0.25, new Cesium.Cartesian3()), new Cesium.Cartesian3());
              const rA_E = Cesium.Cartesian3.add(Cesium.Cartesian3.add(pair2.low, underOffset, new Cesium.Cartesian3()), Cesium.Cartesian3.multiplyByScalar(leg2Dir, 0.25, new Cesium.Cartesian3()), new Cesium.Cartesian3());
              const rB_S = Cesium.Cartesian3.add(Cesium.Cartesian3.add(pair1.low, underOffset, new Cesium.Cartesian3()), Cesium.Cartesian3.multiplyByScalar(leg1Dir, 0.75, new Cesium.Cartesian3()), new Cesium.Cartesian3());
              const rB_E = Cesium.Cartesian3.add(Cesium.Cartesian3.add(pair2.low, underOffset, new Cesium.Cartesian3()), Cesium.Cartesian3.multiplyByScalar(leg2Dir, 0.75, new Cesium.Cartesian3()), new Cesium.Cartesian3());

              const railA = supportCol.add({ positions: [rA_S, rA_E], width: 4.0, show: true });
              railA.material = railMat;
              const railB = supportCol.add({ positions: [rB_S, rB_E], width: 4.0, show: true });
              railB.material = railMat;
              totalLinesAdded += 2;

            } else {
              // COPLANAR: Raíles transversales de aluminio continuos por fila bajo el módulo
              const v1 = Cesium.Cartesian3.subtract(p.corners[1], p.corners[0], new Cesium.Cartesian3()); // Eje longitudinal del panel
              const v2 = Cesium.Cartesian3.subtract(p.corners[3], p.corners[0], new Cesium.Cartesian3()); // Eje transversal (dirección de la fila)
              const norm = Cesium.Cartesian3.normalize(Cesium.Cartesian3.cross(v1, v2, new Cesium.Cartesian3()), new Cesium.Cartesian3());
              const drop = Cesium.Cartesian3.multiplyByScalar(norm, -0.025, new Cesium.Cartesian3());
              // Los perfiles corren en horizontal a lo largo de la fila (eje v2), apoyando en las zonas de fijación a 1/4 y 3/4 del largo (v1)
              const off1 = Cesium.Cartesian3.multiplyByScalar(v1, 0.25, new Cesium.Cartesian3());
              const off2 = Cesium.Cartesian3.multiplyByScalar(v1, 0.75, new Cesium.Cartesian3());

              const r1S = Cesium.Cartesian3.add(Cesium.Cartesian3.add(p.corners[0], off1, new Cesium.Cartesian3()), drop, new Cesium.Cartesian3());
              const r1E = Cesium.Cartesian3.add(Cesium.Cartesian3.add(p.corners[3], off1, new Cesium.Cartesian3()), drop, new Cesium.Cartesian3());
              const r2S = Cesium.Cartesian3.add(Cesium.Cartesian3.add(p.corners[0], off2, new Cesium.Cartesian3()), drop, new Cesium.Cartesian3());
              const r2E = Cesium.Cartesian3.add(Cesium.Cartesian3.add(p.corners[3], off2, new Cesium.Cartesian3()), drop, new Cesium.Cartesian3());

              const rail1 = supportCol.add({
                positions: [r1S, r1E],
                width: 6.0,
                show: true
              });
              rail1.material = railMat;
              totalLinesAdded++;

              const rail2 = supportCol.add({
                positions: [r2S, r2E],
                width: 6.0,
                show: true
              });
              rail2.material = railMat;
              totalLinesAdded++;
            }
          } catch (ePanelSup) {
            console.error('[RA-SOPORTES] Error en panel', idx, ePanelSup);
          }
        });
        if (totalLinesAdded > 0) {
          if (currentRenderId !== _raRenderGenerationId) return;
          supportCol._isRASupportPrimitive = true;
          supportCol._raFaldonIdx = polyIdx;
          const sPrim = viewer.scene.primitives.add(supportCol);
          sPrim._isRASupportPrimitive = true;
          sPrim._raFaldonIdx = polyIdx;
          window._faldonSupportCollections.set(polyIdx, sPrim);
          if (polyIdx === 0 || !window.simulatedSupportsPolylineCollection) {
            window.simulatedSupportsPolylineCollection = sPrim;
          }
          window.RA && window.RA.log && window.RA.log.debug(`[RA-SOPORTES] GPU Primitive faldón ${polyIdx}: ${totalLinesAdded} líneas de soporte renderizadas.`);
        }

        // [AAA PÉRGOLA CILINDROS 3D] Pilares volumétricos que proyectan sombras reales en Cesium
        if (esPergola && pergolaPostCandidates.length > 0 && viewer.scene && viewer.scene.primitives && typeof Cesium.CylinderGeometry === 'function' && typeof Cesium.GeometryInstance === 'function') {
          try {
            const deduplicatedPosts = [];
            const distThreshold = 0.40;
            pergolaPostCandidates.forEach(cand => {
              const exists = deduplicatedPosts.some(dp => {
                return Cesium.Cartesian3.distance(dp.top, cand.top) < distThreshold;
              });
              if (!exists) deduplicatedPosts.push(cand);
            });

            const cylInstances = [];
            deduplicatedPosts.forEach((post, postIdx) => {
              const V = Cesium.Cartesian3.subtract(post.top, post.bottom, new Cesium.Cartesian3());
              const len = Cesium.Cartesian3.magnitude(V);
              if (len < 0.1) return;

              const zAxis = Cesium.Cartesian3.divideByScalar(V, len, new Cesium.Cartesian3());
              const mid = Cesium.Cartesian3.midpoint(post.bottom, post.top, new Cesium.Cartesian3());

              const ref = (Math.abs(zAxis.z) < 0.9) ? new Cesium.Cartesian3(0, 0, 1) : new Cesium.Cartesian3(1, 0, 0);
              const xAxis = Cesium.Cartesian3.cross(ref, zAxis, new Cesium.Cartesian3());
              Cesium.Cartesian3.normalize(xAxis, xAxis);
              const yAxis = Cesium.Cartesian3.cross(zAxis, xAxis, new Cesium.Cartesian3());
              Cesium.Cartesian3.normalize(yAxis, yAxis);

              const rot = new Cesium.Matrix3(
                xAxis.x, yAxis.x, zAxis.x,
                xAxis.y, yAxis.y, zAxis.y,
                xAxis.z, yAxis.z, zAxis.z
              );
              const modelMatrix = Cesium.Matrix4.fromRotationTranslation(rot, mid, new Cesium.Matrix4());

              cylInstances.push(new Cesium.GeometryInstance({
                geometry: new Cesium.CylinderGeometry({
                  length: len,
                  topRadius: 0.05,
                  bottomRadius: 0.05,
                  slices: 12
                }),
                modelMatrix: modelMatrix,
                id: 'pergola_post_' + polyIdx + '_' + postIdx
              }));
            });

            if (cylInstances.length > 0) {
              const pergolaPillarsPrim = new Cesium.Primitive({
                geometryInstances: cylInstances,
                appearance: new Cesium.MaterialAppearance({
                  material: Cesium.Material.fromType('Color', { color: Cesium.Color.fromCssColorString('#475569') }),
                  flat: false,
                  translucent: false
                }),
                asynchronous: false,
                shadows: Cesium.ShadowMode.ENABLED
              });
              if (currentRenderId !== _raRenderGenerationId) return;
              pergolaPillarsPrim._isRAPergolaPrimitive = true;
              pergolaPillarsPrim._raFaldonIdx = polyIdx;
              const pPrim = viewer.scene.primitives.add(pergolaPillarsPrim);
              pPrim._isRAPergolaPrimitive = true;
              pPrim._raFaldonIdx = polyIdx;
              window._faldonPergolaPrimitives.set(polyIdx, pPrim);
              console.warn(`[RA-PERGOLA] 3D Postes volumétricos faldón ${polyIdx}: ${cylInstances.length} pilares cilíndricos con sombras activadas.`);
            }
          } catch (eCyl) {
            console.warn('[RA-PERGOLA] Error generando cilindros volumétricos de sombra para pérgola:', eCyl);
          }
        }
      });
    } catch (eSupGPU) {
      console.error('[RA-SOPORTES] Error al crear PolylineCollection de soportes:', eSupGPU);
    }
  }

  // 8. Actualizar y conectar dinámicamente líneas de cableado 3D (Strings, Combiner, Inversor, Contador)
  if (typeof wpCalculateAndRenderInverterCables === 'function') {
    wpCalculateAndRenderInverterCables();
  }
  if (typeof window !== 'undefined') window._raPrimitivesGeneration = (window._raPrimitivesGeneration || 0) + 1;
  if (typeof ProjectHierarchy !== 'undefined' && ProjectHierarchy && typeof ProjectHierarchy.notify === 'function') {
    ProjectHierarchy.notify('panels_rendered');
  }
}

let _scratchNormScaled = null;
let _scratchRayOrigin = null;
let _occlusionExcludeList = null;
let _occlusionExcludeListGen = -1;
if (typeof window !== 'undefined') {
  window._raPrimitivesGeneration = window._raPrimitivesGeneration || 0;
  window.raBumpPrimitivesGeneration = function() {
    window._raPrimitivesGeneration = (window._raPrimitivesGeneration || 0) + 1;
  };
}

function _getOcclusionExcludeList(scene) {
  const curGen = (typeof window !== 'undefined' && typeof window._raPrimitivesGeneration === 'number') ? window._raPrimitivesGeneration : 0;
  if (_occlusionExcludeList && _occlusionExcludeListGen === curGen) {
    return _occlusionExcludeList;
  }
  const toExclude = [];
  if (scene.skyBox) toExclude.push(scene.skyBox);
  if (scene.skyAtmosphere) toExclude.push(scene.skyAtmosphere);
  if (window._solarHeatmapLabelCollection) toExclude.push(window._solarHeatmapLabelCollection);
  if (window._panelNumberLabelCollection) toExclude.push(window._panelNumberLabelCollection);
  if (window.simulatedPanelsPrimitive) toExclude.push(window.simulatedPanelsPrimitive);
  if (window._faldonPanelsPrimitives && typeof window._faldonPanelsPrimitives.forEach === 'function') {
    window._faldonPanelsPrimitives.forEach(p => { if (p) toExclude.push(p); });
  }
  if (window._faldonPergolaPrimitives && typeof window._faldonPergolaPrimitives.forEach === 'function') {
    window._faldonPergolaPrimitives.forEach(p => { if (p) toExclude.push(p); });
  }
  if (window.simulatedStringsPolylineCollection) toExclude.push(window.simulatedStringsPolylineCollection);
  if (window.simulatedSupportsPolylineCollection) toExclude.push(window.simulatedSupportsPolylineCollection);
  if (window._faldonSupportCollections && typeof window._faldonSupportCollections.forEach === 'function') {
    window._faldonSupportCollections.forEach(p => { if (p) toExclude.push(p); });
  }
  if (window._faldonWirePrimitives && typeof window._faldonWirePrimitives.forEach === 'function') {
    window._faldonWirePrimitives.forEach(p => { if (p) toExclude.push(p); });
  }
  if (window._raCableEnginePrimitives) toExclude.push(window._raCableEnginePrimitives);
  if (window._raCableJunctionPoints) toExclude.push(window._raCableJunctionPoints);
  if (window.inverterEntity) toExclude.push(window.inverterEntity);
  if (window.dcBoxEntity) toExclude.push(window.dcBoxEntity);
  if (window.gridMeterEntity) toExclude.push(window.gridMeterEntity);
  if (window.acometidaACEntity) toExclude.push(window.acometidaACEntity);
  if (Array.isArray(window._obsPrimitives)) {
    for (let i = 0; i < window._obsPrimitives.length; i++) {
      const op = window._obsPrimitives[i];
      if (op && op._isSetbackBuffer) toExclude.push(op);
    }
  }
  if (window.inverterEquipmentState) {
    const eq = window.inverterEquipmentState;
    if (eq.entity) toExclude.push(eq.entity);
    if (eq.dcProtectionEntity) toExclude.push(eq.dcProtectionEntity);
    if (eq.batteryEntity) toExclude.push(eq.batteryEntity);
    if (eq.combinerBox && eq.combinerBox.entity) toExclude.push(eq.combinerBox.entity);
    if (eq.gridMeter && eq.gridMeter.entity) toExclude.push(eq.gridMeter.entity);
    if (Array.isArray(eq.dcCableEntities)) {
      for (let i = 0; i < eq.dcCableEntities.length; i++) {
        const ce = eq.dcCableEntities[i];
        if (!ce) continue;
        toExclude.push(ce.isCablePrimitive && ce.primitive ? ce.primitive : ce);
      }
    }
  }
  if (typeof WP !== 'undefined' && WP && Array.isArray(WP.polylines)) {
    for (let i = 0; i < WP.polylines.length; i++) {
      const pl = WP.polylines[i];
      if (!pl) continue;
      if (pl.lineEnt) toExclude.push(pl.lineEnt);
      if (pl.fillEnt) toExclude.push(pl.fillEnt);
    }
  }
  _occlusionExcludeList = toExclude;
  _occlusionExcludeListGen = curGen;
  return toExclude;
}

function isPanelOccludedBy3DEnvironment(panelCenter, norm, sunDirWorld, pInfo) {
  if (typeof viewer === "undefined" || !viewer || !viewer.scene) return false;
  const scene = viewer.scene;

  // Raycast contra 3D Tilesets (Google 3D Photorealistic Tiles, Cesium OSM Buildings)
  const gTileset = (typeof google3DTileset !== "undefined" && google3DTileset) || (typeof window !== "undefined" && window.google3DTileset);
  const osmTileset = (typeof cesiumOsmBuildings !== "undefined" && cesiumOsmBuildings) || (typeof window !== "undefined" && window.cesiumOsmBuildings);
  const hasTileset = gTileset || osmTileset || (scene.primitives && scene.primitives.length > 0);
  if (!hasTileset) return false;
  if (typeof scene.pickFromRay !== "function" || typeof Cesium.Ray !== "function") return false;

  const normVec = norm || Cesium.Cartesian3.UNIT_Z;

  // [PERF] Descarte rápido: si el sol está a la espalda del panel, no incide sol directo
  if (Cesium.Cartesian3.dot(normVec, sunDirWorld) <= 0.05) return false;

  if (!_scratchNormScaled && typeof Cesium !== 'undefined' && Cesium.Cartesian3) {
    _scratchNormScaled = new Cesium.Cartesian3();
    _scratchRayOrigin = new Cesium.Cartesian3();
  }

  const rayOrigin = Cesium.Cartesian3.add(
    panelCenter,
    Cesium.Cartesian3.multiplyByScalar(normVec, 0.65, _scratchNormScaled || new Cesium.Cartesian3()),
    _scratchRayOrigin || new Cesium.Cartesian3()
  );

  const ray = new Cesium.Ray(rayOrigin, sunDirWorld);

  try {
    const toExclude = _getOcclusionExcludeList(scene);
    const hit = scene.pickFromRay(ray, toExclude);
    if (hit && Cesium.defined(hit.position) && hit.object) {
      // VERIFICACIÓN: El impacto pertenece a una malla tridimensional (3D Tileset / Feature / Modelo)
      const objPrim = hit.object.primitive;
      const is3DTile = (
        (typeof Cesium.Cesium3DTileFeature !== "undefined" && hit.object instanceof Cesium.Cesium3DTileFeature) ||
        (typeof Cesium.Cesium3DTileset !== "undefined" && (objPrim instanceof Cesium.Cesium3DTileset || hit.object instanceof Cesium.Cesium3DTileset)) ||
        (objPrim && (objPrim === gTileset || objPrim === osmTileset)) ||
        (hit.object.tileset && (hit.object.tileset === gTileset || hit.object.tileset === osmTileset)) ||
        (hit.object.content && hit.object.content.tileset)
      );

      const isCadOccluder = Boolean(
        objPrim && (
          (Array.isArray(window._buildingPrimitives) && window._buildingPrimitives.indexOf(objPrim) !== -1) ||
          (Array.isArray(window._obsPrimitives) && !objPrim._isSetbackBuffer && window._obsPrimitives.indexOf(objPrim) !== -1)
        )
      );

      if (is3DTile || isCadOccluder) {
        const dist = Cesium.Cartesian3.distance(rayOrigin, hit.position);
        const minHitDist = isCadOccluder ? 0.25 : 1.8;
        // Descarte de auto-intersección inmediata (0.25m para CAD preciso, 1.8m para fotogrametría 3D)
        if (dist <= minHitDist || dist >= 1200.0) return false;

        // Filtro de ruido de cubierta cercana (solo aplica a fotogrametría ruidosa, no a CAD geométrico)
        const upLocal = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(panelCenter, new Cesium.Cartesian3());
        const relHitVec = Cesium.Cartesian3.subtract(hit.position, panelCenter, new Cesium.Cartesian3());
        const hitRiseM = Cesium.Cartesian3.dot(relHitVec, upLocal);
        if (!isCadOccluder && dist < 4.5 && hitRiseM < 0.75) {
          return false;
        }

        // [Filtro de auto-impacto de la propia cubierta y faldones adyacentes del mismo edificio]
        const structType = pInfo && (pInfo.structureType || (pInfo.estructura && pInfo.estructura.tipo));
        const pergClearance = (pInfo && (pInfo.clearance || (pInfo.estructura && pInfo.estructura.clearance) || (structType === 'pergola' ? 3.5 : 0))) || 0;
        const maxDeckH = Math.max(1.4, pergClearance + 1.4);

        const _isHitOnRoofDeck = (infoObj) => {
          if (!infoObj || !infoObj.invTransform) return false;
          try {
            const locHit = Cesium.Matrix4.multiplyByPoint(infoObj.invTransform, hit.position, new Cesium.Cartesian3());
            const u = Cesium.Cartesian3.dot(locHit, infoObj.uVec || Cesium.Cartesian3.UNIT_X);
            const v = Cesium.Cartesian3.dot(locHit, infoObj.vVec || Cesium.Cartesian3.UNIT_Y);
            const n = infoObj.normal || Cesium.Cartesian3.UNIT_Z;
            const h = Math.abs(Cesium.Cartesian3.dot(locHit, n));
            if (h >= maxDeckH) return false;
            if (infoObj.poly2D && typeof isPointInPolygon2D === 'function' && isPointInPolygon2D({ u, v }, infoObj.poly2D)) {
              return true;
            }
            // Margen de 1.5 m sobre el bbox local del faldón para filtrar aleros/cumbreras fotogramétricas
            if (typeof infoObj.minU === 'number' && typeof infoObj.maxU === 'number' &&
                typeof infoObj.minV === 'number' && typeof infoObj.maxV === 'number') {
              if (u >= infoObj.minU - 1.5 && u <= infoObj.maxU + 1.5 && v >= infoObj.minV - 1.5 && v <= infoObj.maxV + 1.5) {
                return true;
              }
            }
          } catch (_) {}
          return false;
        };

        if (_isHitOnRoofDeck(pInfo)) return false;
        if (dist < 8.0 && typeof WP !== 'undefined' && WP && Array.isArray(WP.polylines)) {
          for (let pi = 0; pi < WP.polylines.length; pi++) {
            const otherInfo = WP.polylines[pi] && WP.polylines[pi].roofInfo;
            if (otherInfo && otherInfo !== pInfo && _isHitOnRoofDeck(otherInfo)) {
              return false;
            }
          }
        }

        return true;
      }
    }
  } catch(e) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(e, 'Entidad/Primitiva Cesium'); }

  return false;
}

window.raHeatmapLabelMode = 'hover'; // 'hover' (escena limpia) | 'all' (etiquetas fijas)

function wpToggleHeatmapLabelsMode() {
  window.raHeatmapLabelMode = (window.raHeatmapLabelMode === 'all') ? 'hover' : 'all';
  const isAll = (window.raHeatmapLabelMode === 'all');
  const txt = document.getElementById('label-mode-text');
  if (txt) {
    txt.textContent = isAll ? 'Etiquetas: Ver Todas (Fijas)' : 'Etiquetas: Solo al pasar ratón';
    txt.style.color = isAll ? '#10b981' : 'var(--text-slate-300)';
  }
  if (isAll && (!window._solarHeatmapLabelCollection || window._solarHeatmapLabelCollection.length === 0)) {
    if (typeof wpRenderHeatmapVisuals === 'function') {
      wpRenderHeatmapVisuals();
    }
  }
  if (window._solarHeatmapLabelCollection) {
    window._solarHeatmapLabelCollection.show = isAll;
    const len = window._solarHeatmapLabelCollection.length;
    for (let i = 0; i < len; i++) {
      const lbl = window._solarHeatmapLabelCollection.get(i);
      if (lbl) lbl.show = isAll;
    }
  }
  if (window.solarSimState && Array.isArray(window.solarSimState.heatmapLabelEntities)) {
    window.solarSimState.heatmapLabelEntities.forEach(ent => {
      if (ent.label && typeof ent.label.show !== 'undefined') ent.label.show = isAll;
      if (typeof ent.show !== 'undefined') ent.show = isAll;
    });
  }
  if (typeof viewer !== 'undefined' && viewer && viewer.scene && typeof viewer.scene.requestRender === 'function') {
    viewer.scene.requestRender();
  }
}
window.wpToggleHeatmapLabelsMode = wpToggleHeatmapLabelsMode;

const _hoverC2D = (typeof Cesium !== 'undefined' && Cesium.Cartesian2) ? new Cesium.Cartesian2() : { x: 0, y: 0 };
let _isHoverRafPending = false;
let _pendingHoverMousePos = null;

function handleHeatmapPanelHover(mousePos) {
  if (window._isCameraMoving || window._isPointerButtonsDown) return;
  _pendingHoverMousePos = mousePos;
  if (!_isHoverRafPending) {
    _isHoverRafPending = true;
    requestAnimationFrame(_flushHeatmapPanelHover);
  }
}

function _flushHeatmapPanelHover() {
  _isHoverRafPending = false;
  if (!_pendingHoverMousePos) return;
  const mousePos = _pendingHoverMousePos;

  const tooltip = document.getElementById('ra-panel-hover-tooltip');
  if (!tooltip || typeof viewer === 'undefined' || !viewer || !viewer.scene) return;
  if (typeof universalGizmoState !== 'undefined' && universalGizmoState && universalGizmoState.active) {
    tooltip.style.display = 'none';
    return;
  }

  const panels = (window.allRenderedPanels && window.allRenderedPanels.length > 0)
    ? window.allRenderedPanels
    : (window.solarSimState && window.solarSimState.annualHeatmapData ? window.solarSimState.annualHeatmapData : null);

  if (!panels || panels.length === 0 || !panels[0] || (typeof panels[0].annualLossPct === 'undefined' && typeof panels[0].annualKwh === 'undefined')) {
    tooltip.style.display = 'none';
    return;
  }

  const canvas = viewer.scene.canvas;
  const rect = canvas.getBoundingClientRect();
  const screenX = mousePos.x;
  const screenY = mousePos.y;

  let hoveredPanel = null;
  let hoveredIdx = -1;
  let minDistanceSq = 900; // Radio de detección: 30px en pantalla

  const camPos = viewer.camera ? viewer.camera.position : null;
  const camDir = viewer.camera ? viewer.camera.direction : null;

  // Broadphase 2D por faldón: si el cursor está lejos del polígono del faldón, descartar todos sus paneles de golpe
  const polyBBoxes = [];
  if (typeof WP !== 'undefined' && WP && Array.isArray(WP.polylines) && WP.polylines.length > 0) {
    for (let plIdx = 0; plIdx < WP.polylines.length; plIdx++) {
      const pl = WP.polylines[plIdx];
      if (!pl || !pl.points || pl.points.length < 3) continue;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (let ptIdx = 0; ptIdx < pl.points.length; ptIdx++) {
        const scPt = Cesium.SceneTransforms.wgs84ToWindowCoordinates(viewer.scene, pl.points[ptIdx], _hoverC2D);
        if (scPt) {
          if (scPt.x < minX) minX = scPt.x;
          if (scPt.x > maxX) maxX = scPt.x;
          if (scPt.y < minY) minY = scPt.y;
          if (scPt.y > maxY) maxY = scPt.y;
        }
      }
      if (isFinite(minX)) {
        polyBBoxes[plIdx] = { minX: minX - 45, maxX: maxX + 45, minY: minY - 45, maxY: maxY + 45 };
      }
    }
  }

  for (let i = 0; i < panels.length; i++) {
    const p = panels[i];
    if (!p.center) continue;

    // Descarte broadphase: panel perteneciente a un faldón que no contiene el cursor
    if (polyBBoxes.length > 0 && typeof p.polyIdx === 'number' && polyBBoxes[p.polyIdx]) {
      const bb = polyBBoxes[p.polyIdx];
      if (screenX < bb.minX || screenX > bb.maxX || screenY < bb.minY || screenY > bb.maxY) {
        continue;
      }
    }

    // Descarte ultrarrápido: paneles a espaldas de la cámara (dot product <= 0)
    if (camPos && camDir) {
      const dotCam = (p.center.x - camPos.x) * camDir.x + (p.center.y - camPos.y) * camDir.y + (p.center.z - camPos.z) * camDir.z;
      if (dotCam <= 0) continue;
    }

    const sPos = Cesium.SceneTransforms.wgs84ToWindowCoordinates(viewer.scene, p.center, _hoverC2D);
    if (!sPos) continue;
    const dx = sPos.x - screenX;
    const dy = sPos.y - screenY;
    const d2 = dx * dx + dy * dy;
    if (d2 < minDistanceSq) {
      minDistanceSq = d2;
      hoveredPanel = p;
      hoveredIdx = i;
    }
  }

  if (hoveredPanel) {
    const isSimValid = !!(
      (window.solarSimState && window.solarSimState.annualHeatmapData && !window.solarSimState.annualHeatmapDirty) ||
      (typeof solarSimState !== 'undefined' && solarSimState && solarSimState.annualHeatmapData && !solarSimState.annualHeatmapDirty)
    );
    const isHeatmapActive = !!(
      (window.solarSimState && window.solarSimState.viewMode === 'heatmap') ||
      (typeof solarSimState !== 'undefined' && solarSimState && solarSimState.viewMode === 'heatmap')
    );

    // [Respaldo de Seguridad] Si hoveredPanel perdió métricas en un redraw GPU, rescatarlas desde panelCache
    let panelData = hoveredPanel;
    const cache = (window.solarSimState && window.solarSimState.panelCache) || (typeof solarSimState !== 'undefined' && solarSimState && solarSimState.panelCache);
    if (cache && (typeof hoveredPanel.annualLossPct === 'undefined' || typeof hoveredPanel.annualKwh === 'undefined')) {
      const cached = cache.get(hoveredPanel.panelId) || cache.get(hoveredPanel.polyIdx + '_' + (hoveredPanel.layoutIndex ?? hoveredIdx));
      if (cached) {
        panelData = Object.assign({}, cached, hoveredPanel);
      }
    }

    const kwh = (typeof panelData.annualKwh === 'number') ? panelData.annualKwh : Math.round((panelData.annualYieldPct || 100) * 8.5);
    const loss = typeof panelData.annualLossPct === 'number' ? panelData.annualLossPct : 0;
    const tilt = typeof panelData.tiltDeg === 'number' ? panelData.tiltDeg.toFixed(0) : (panelData.pitch ? panelData.pitch.toFixed(0) : '0');
    let azStr = 'Sur';
    if (typeof panelData.azimuthDeg === 'number') {
      const azN = (180 - panelData.azimuthDeg + 360) % 360;
      azStr = (typeof getAzimuthCardinalShort === 'function' ? getAzimuthCardinalShort(azN) + ' (' : '') + azN.toFixed(0) + '°' + (typeof getAzimuthCardinalShort === 'function' ? ')' : '');
    }
    const isMlpe = panelData.requiresMLPE || loss >= 8;
    const isUnv = panelData.isUnviable || loss >= 25;

    const strColor = panelData.stringColor || '#00F0FF';
    const strLabel = panelData.stringName || ('String #' + ((panelData.polyIdx || 0) + 1));
    const modeBadge = isHeatmapActive && isSimValid
      ? `<span style="display:inline-flex;align-items:center;gap:3px;padding:1px 5px;border-radius:4px;font-size: 11px;background:rgba(16,185,129,0.15);color:#10b981;border:1px solid rgba(16,185,129,0.3);font-weight:700;">☀️ Heatmap Solar</span>`
      : `<span style="display:inline-flex;align-items:center;gap:3px;padding:1px 5px;border-radius:4px;font-size: 11px;background:rgba(56,189,248,0.12);color:${strColor};border:1px solid rgba(56,189,248,0.25);font-weight:700;">⚡ ${strLabel}</span>`;

    const lossHtml = isSimValid
      ? `<span style="font-weight:700;color:${loss > 0.05 ? '#f97316' : '#10b981'};">${loss > 0.05 ? '-' + loss.toFixed(1) + '%' : '100% Libre'}</span>`
      : `<span style="font-weight:600;color:#94a3b8;font-size: 11px;font-style:italic;">⚠️ Simulación pendiente (Paso 3)</span>`;

    const diagHtml = isSimValid
      ? `<span style="font-weight:700;color:${isUnv ? '#ef4444' : (isMlpe ? '#f59e0b' : '#10b981')};">${isUnv ? '❌ Inviable' : (isMlpe ? '⚠️ Requiere Optimizador' : '✅ Óptimo')}</span>`
      : `<span style="font-weight:600;color:#94a3b8;font-size: 11px;">Pendiente de cálculo</span>`;

    const kwhHtml = isSimValid
      ? `<span style="font-weight:800;color:#10b981;">${kwh.toLocaleString('es-ES')} kWh/año</span>`
      : `<span style="font-weight:600;color:#94a3b8;font-size: 11px;">${kwh.toLocaleString('es-ES')} kWh/año <span style="font-size: 11px;color:#64748B;">(est.)</span></span>`;

    // [Opción 2] Métricas ampliadas de radiación e insolación anual
    const insolationVal = (typeof panelData.annualTotalInsolation === 'number' && panelData.annualTotalInsolation > 0)
      ? panelData.annualTotalInsolation
      : (typeof panelData.annualGrossKwh === 'number' ? Math.round(panelData.annualGrossKwh / 0.885) : null);
    const insolationRow = (isSimValid && insolationVal)
      ? `<div style="display:flex;justify-content:space-between;margin-bottom:2px;gap:12px;font-size:11px;">
           <span style="color:#94a3b8;">Radiación Incidente:</span>
           <span style="color:#f8fafc;font-weight:700;">${insolationVal.toLocaleString('es-ES')} kWh/año</span>
         </div>`
      : '';

    // [Opción 2] Rendimiento Relativo comparado con la mejor placa
    const relYieldVal = typeof panelData.relativeYieldPct === 'number'
      ? panelData.relativeYieldPct
      : (typeof panelData.annualYieldPct === 'number' ? panelData.annualYieldPct : null);
    const relYieldRow = (isSimValid && relYieldVal !== null)
      ? `<div style="display:flex;justify-content:space-between;margin-bottom:2px;gap:12px;font-size:11px;">
           <span style="color:#94a3b8;">Rendimiento vs. Líder:</span>
           <span style="color:${relYieldVal >= 95 ? '#10b981' : (relYieldVal >= 85 ? '#f59e0b' : '#ef4444')};font-weight:700;">${relYieldVal.toFixed(1)}%</span>
         </div>`
      : '';

    tooltip.innerHTML = `
      <div style="font-weight:800;color:var(--amber-400);font-size:11px;margin-bottom:4px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:3px;gap:8px;">
        <span>MÓDULO #${hoveredIdx + 1}</span>
        ${modeBadge}
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:2px;gap:12px;font-size:11px;">
        <span style="color:#94a3b8;">Orientación:</span>
        <span style="color:#cbd5e1;font-weight:600;">${tilt}° · ${azStr}</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:2px;gap:12px;">
        <span style="color:#cbd5e1;">Producci&oacute;n Neta Anual:</span>
        ${kwhHtml}
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:2px;gap:12px;">
        <span style="color:#cbd5e1;">Pérdidas Sombras:</span>
        ${lossHtml}
      </div>
      ${insolationRow}
      ${relYieldRow}
      <div style="display:flex;justify-content:space-between;margin-top:4px;padding-top:4px;border-top:1px solid rgba(255,255,255,0.1);font-size:11px;">
        <span style="color:#94a3b8;">Diagnóstico:</span>
        ${diagHtml}
      </div>
    `;

  tooltip.style.left = (rect.left + screenX + 16) + 'px';
    tooltip.style.top = (rect.top + screenY + 16) + 'px';
    tooltip.style.display = 'block';
  } else {
    tooltip.style.display = 'none';
  }
}

// [ARQUITECTURA v2] Versión canónica en js/solar-heatmap.js — este inline actúa como fallback
// [ARQUITECTURA AAA] wpUpdatePanelShadingAndMLPE delegada al módulo js/solar-heatmap.js

// ── CÁLCULO Y MAPA DE CALOR DE IRRADIANCIA Y PÉRDIDAS ANUALES (CON ENTORNO 3D) ──

// ── CONTROL DE HUD DE PROGRESO DE CÁLCULO SOLAR ─────────────────────────────
const _solarMonthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const _solarQuarterNames = ['Ene–Mar (T1)', 'Abr–Jun (T2)', 'Jul–Sep (T3)', 'Oct–Dic (T4)'];
let _solarHudHideTimer = null;

function showSolarCalcHUD(title, subtitle) {
  const hud = document.getElementById('ra-solar-calc-hud');
  if (!hud) return;
  if (_solarHudHideTimer !== null) {
    clearTimeout(_solarHudHideTimer);
    _solarHudHideTimer = null;
  }
  hud.classList.add('active');
  const pctLbl = document.getElementById('solar-calc-pct-label');
  const fill = document.getElementById('solar-calc-bar-fill');
  const statusTxt = document.getElementById('solar-calc-status-text');
  const speedTxt = document.getElementById('solar-calc-speed-text');
  if (pctLbl) pctLbl.textContent = '0%';
  if (fill) fill.style.width = '0%';
  if (statusTxt) statusTxt.textContent = subtitle || 'Iniciando simulación de insolación y sombras...';
  if (speedTxt) speedTxt.textContent = 'Preparando...';

  const pills = document.querySelectorAll('.solar-calc-month-pill');
  pills.forEach(p => {
    p.classList.remove('done', 'current');
  });
}

function updateSolarCalcHUD(pct, currentMonthIdx, totalPanels, extraOpts) {
  if (_solarHudHideTimer !== null) {
    clearTimeout(_solarHudHideTimer);
    _solarHudHideTimer = null;
  }
  const pctLbl = document.getElementById('solar-calc-pct-label');
  const fill = document.getElementById('solar-calc-bar-fill');
  const statusTxt = document.getElementById('solar-calc-status-text');
  const speedTxt = document.getElementById('solar-calc-speed-text');

  const safePct = Math.max(0, Math.min(100, Math.round(pct || 0)));
  if (pctLbl) pctLbl.textContent = safePct + '%';
  if (fill) fill.style.width = safePct + '%';
  
  const opts = extraOpts || {};
  const span = (typeof opts.monthSpan === 'number' && opts.monthSpan > 1) ? opts.monthSpan : 1;
  const currentStep = typeof opts.stepIndex === 'number' ? opts.stepIndex : (currentMonthIdx + 1);
  const totalSteps = typeof opts.totalStepsCount === 'number' ? opts.totalStepsCount : 12;
  const phase = opts.phaseText ? (' [' + opts.phaseText + ']') : '';

  const displayMonthIdx = (safePct >= 100) ? 11 : Math.min(11, Math.floor((safePct / 100) * 12));
  const periodLabel = (safePct >= 100)
    ? 'Anual (Ene–Dic)'
    : ((span === 3)
      ? _solarQuarterNames[Math.min(3, Math.floor(displayMonthIdx / 3))]
      : (_solarMonthNames[displayMonthIdx] || ('Mes ' + (displayMonthIdx + 1))));

  if (statusTxt) {
    statusTxt.textContent = periodLabel + phase + ' · ' + (totalPanels || 0) + ' módulos evaluados';
  }
  if (speedTxt) {
    speedTxt.textContent = 'Paso ' + currentStep + ' de ' + totalSteps;
  }

  // Las pastillas corresponden a los 12 meses cronológicos (0 = ENE .. 11 = DIC).
  // Acoplamiento monotónico con safePct y el ancho de bloque (span = 1 mensual, span = 3 trimestral):
  const pills = document.querySelectorAll('.solar-calc-month-pill');
  if (safePct >= 100) {
    pills.forEach(p => {
      p.classList.remove('current');
      p.classList.add('done');
    });
  } else {
    const completedMonths = Math.min(11, Math.floor((safePct / 100) * 12));
    const activeStart = Math.floor(completedMonths / span) * span;
    const activeEnd = Math.min(11, activeStart + span - 1);
    pills.forEach((p, idx) => {
      if (idx < activeStart) {
        p.classList.remove('current');
        p.classList.add('done');
      } else if (idx >= activeStart && idx <= activeEnd && safePct > 0) {
        p.classList.remove('done');
        p.classList.add('current');
      } else {
        p.classList.remove('done', 'current');
      }
    });
  }
}

function hideSolarCalcHUD() {
  const hud = document.getElementById('ra-solar-calc-hud');
  if (!hud) return;
  const pills = document.querySelectorAll('.solar-calc-month-pill');
  pills.forEach(p => { p.classList.remove('current'); p.classList.add('done'); });
  const fill = document.getElementById('solar-calc-bar-fill');
  if (fill) fill.style.width = '100%';
  const pctLbl = document.getElementById('solar-calc-pct-label');
  if (pctLbl) pctLbl.textContent = '100%';

  if (_solarHudHideTimer !== null) {
    clearTimeout(_solarHudHideTimer);
  }
  _solarHudHideTimer = setTimeout(() => {
    hud.classList.remove('active');
    _solarHudHideTimer = null;
  }, 450);
}

// [ARQUITECTURA CANÓNICA v3] Delegado al motor modular asíncrono js/solar-heatmap.js
async function wpTriggerAnnualSolarHeatmapWrapper(onProgressCallback) {
  if (typeof window.RA !== 'undefined' && window.RA.solarHeatmap && typeof window.RA.solarHeatmap.computeHeatmap === 'function') {
    return await window.RA.solarHeatmap.computeHeatmap(onProgressCallback);
  } else if (typeof window.wpComputeAnnualSolarHeatmapCanonical === 'function') {
    return await window.wpComputeAnnualSolarHeatmapCanonical(onProgressCallback);
  }
}

// ── RENDERIZADO VISUAL DEL MAPA DE CALOR CON ETIQUETAS DETALLADAS ────────────
function wpRenderHeatmapVisuals() {
  if (!solarSimState) window.solarSimState = {};
  if (!solarSimState.annualHeatmapData) {
    wpTriggerAnnualSolarHeatmapWrapper();
  }

  // Limpiar badges MLPE y máscaras de sombra instantánea
  if (solarSimState.mlpeBadgeEntities) {
    solarSimState.mlpeBadgeEntities.forEach(e => viewer.entities.remove(e));
  }
  solarSimState.mlpeBadgeEntities = [];

  if (solarSimState.panelShadowOverlayEntities) {
    solarSimState.panelShadowOverlayEntities.forEach(e => viewer.entities.remove(e));
  }
  solarSimState.panelShadowOverlayEntities = [];

  if (solarSimState.obstacleShadowSurfaceEntities) {
    solarSimState.obstacleShadowSurfaceEntities.forEach(e => viewer.entities.remove(e));
  }
  solarSimState.obstacleShadowSurfaceEntities = [];

  if (solarSimState.heatmapLabelEntities) {
    solarSimState.heatmapLabelEntities.forEach(e => {
      if (e && e.id && viewer.entities) {
        viewer.entities.remove(e);
      } else if (e && e.label && window._solarHeatmapLabelCollection) {
        try { window._solarHeatmapLabelCollection.remove(e.label); } catch(_) {}
      }
    });
  }
  solarSimState.heatmapLabelEntities = [];

  // <i data-lucide=\"rocket\" class=\"icon-sm\"></i> OPTIMIZACIÓN GPU: LabelCollection nativa con empaquetamiento de texturas y LOD
  if (!window._solarHeatmapLabelCollection && viewer.scene && viewer.scene.primitives) {
    try {
      window._solarHeatmapLabelCollection = viewer.scene.primitives.add(new Cesium.LabelCollection({ scene: viewer.scene }));
    } catch (e) {
      window._solarHeatmapLabelCollection = null;
    }
  }
  if (window._solarHeatmapLabelCollection) {
    try { window._solarHeatmapLabelCollection.removeAll(); } catch(e) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(e, 'Entidad/Primitiva Cesium'); }
  }

  const hasPolys = typeof WP !== "undefined" && WP && WP.polylines && WP.polylines.length > 0;
  const polylinesList = hasPolys ? WP.polylines : (lastRoofInfo ? [{ points: polygonPoints, roofInfo: lastRoofInfo }] : []);

  let entIdx = 0;
  polylinesList.forEach((poly, polyIdx) => {
    const pInfo = poly.roofInfo || (typeof computeSinglePolylineRoofInfo === "function" ? computeSinglePolylineRoofInfo(poly.points, poly) : null);
    if (!pInfo || !pInfo.panels) return;
    const norm = pInfo.normal || new Cesium.Cartesian3(0, 0, 1);

    pInfo.panels.forEach((pData, pIdx) => {
      const panelEnt = (Array.isArray(simulatedPanelEntities) && entIdx < simulatedPanelEntities.length) ? simulatedPanelEntities[entIdx++] : null;
      const col = pData.heatmapColor || (typeof getHeatmapColor === 'function' ? getHeatmapColor(pData.annualLossPct || 0) : { hex: '#10b981' });

      // Colorear el panel según el gradiente térmico si no es instanciado GPU
      if (panelEnt && panelEnt.polygon) {
        panelEnt.polygon.material = Cesium.Color.fromCssColorString(col.hex);
        panelEnt.polygon.outlineColor = Cesium.Color.BLACK;
      }

      // Posición elevada +35cm en la dirección normal
      const labelPos = Cesium.Cartesian3.add(
        pData.center,
        Cesium.Cartesian3.multiplyByScalar(norm, 0.35, new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
      );

      const loss = (typeof pData.annualLossPct === 'number' && !isNaN(pData.annualLossPct)) ? pData.annualLossPct : 0.0;
      const kwh = (typeof pData.annualKwh === 'number') ? pData.annualKwh : Math.round((pData.annualYieldPct || 100) * 8.5);
      const line1 = kwh + " kWh/a";
      const line2 = loss <= 0.05 ? "100% libre" : ("-" + loss.toFixed(1) + "% somb.");
      const labelText = line1 + "\n" + line2;

      const labelBgColor = Cesium.Color.fromCssColorString(col.hex).withAlpha(0.88);

      // A) Inserción ultra-rápida en LabelCollection para 60 FPS estables con LOD
      if (window._solarHeatmapLabelCollection && typeof window._solarHeatmapLabelCollection.add === "function") {
        try {
          const batchedLabel = window._solarHeatmapLabelCollection.add({
            position: labelPos,
            text: labelText,
            font: "bold 10px Inter, monospace",
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            backgroundColor: labelBgColor,
            showBackground: true,
            backgroundPadding: new Cesium.Cartesian2(4, 3),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            show: (window.raHeatmapLabelMode === 'all'),
            distanceDisplayCondition: (typeof Cesium.DistanceDisplayCondition === "function")
              ? new Cesium.DistanceDisplayCondition(0.0, 500.0)
              : undefined
          });
          solarSimState.heatmapLabelEntities.push({ label: batchedLabel, position: labelPos });
        } catch (eBatch) {
          // Fallback a Entity tradicional si falla la colección
          const labelEnt = viewer.entities.add({
            id: "pv_heatmap_label_" + polyIdx + "_" + pIdx + "_" + Math.random().toString(36).substring(2, 6),
            position: labelPos,
            show: true,
            label: {
              text: labelText,
              font: "bold 10.5px Inter, monospace",
              fillColor: Cesium.Color.WHITE,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 2,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              backgroundColor: labelBgColor,
              showBackground: true,
              backgroundPadding: new Cesium.Cartesian2(5, 3),
              disableDepthTestDistance: Number.POSITIVE_INFINITY
            }
          });
          solarSimState.heatmapLabelEntities.push(labelEnt);
        }
      } else {
        const labelEnt = viewer.entities.add({
          id: "pv_heatmap_label_" + polyIdx + "_" + pIdx + "_" + Math.random().toString(36).substring(2, 6),
          position: labelPos,
          show: true,
          label: {
            text: labelText,
            font: "bold 10.5px Inter, monospace",
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            backgroundColor: labelBgColor,
            showBackground: true,
            backgroundPadding: new Cesium.Cartesian2(5, 3),
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          }
        });
        solarSimState.heatmapLabelEntities.push(labelEnt);
      }
    });
  });

  if (typeof render3DObstaclesInCesium === "function") render3DObstaclesInCesium();

  if (viewer.scene && typeof viewer.scene.requestRender === "function") {
    viewer.scene.requestRender();
  }
}

async function wpSetShadowViewMode(mode) {
  if (!window.solarSimState) window.solarSimState = {};
  if (window.solarSimState.isCalculatingHeatmap) return; // Evitar disparos concurrentes
  window.solarSimState.viewMode = mode;
  if (typeof solarSimState !== 'undefined' && solarSimState) solarSimState.viewMode = mode;

  const btnInstant = document.getElementById("btn-shadow-mode-instant");
  const btnHeatmap = document.getElementById("btn-shadow-mode-heatmap");
  const btnMlpe = document.getElementById("btn-shadow-mode-mlpe");
  const heatLegend = document.getElementById("solar-heatmap-legend");

  if (btnInstant) btnInstant.classList.toggle("active", mode === "instant");
  if (btnHeatmap) btnHeatmap.classList.toggle("active", mode === "heatmap");
  if (btnMlpe) btnMlpe.classList.toggle("active", mode === "mlpe");
  if (heatLegend) heatLegend.style.display = (mode === "heatmap") ? "flex" : "none";

  if (mode === "heatmap") {
    const hasValidHeatmap = !!(solarSimState.annualHeatmapData && !solarSimState.annualHeatmapDirty);
    if (!hasValidHeatmap) {
      if (typeof wpRunHeatmapAndActivateView === 'function') {
        await wpRunHeatmapAndActivateView(true);
      } else {
        solarSimState.isCalculatingHeatmap = true;
        if (typeof showSolarCalcHUD === 'function') showSolarCalcHUD();
        if (btnHeatmap) {
          btnHeatmap.style.pointerEvents = 'none';
          btnHeatmap.innerHTML = '<span><i data-lucide="hourglass" class="icon-sm"></i> CALCULANDO...</span>';
        }
        showStatus("<i data-lucide=\"flame\" class=\"icon-sm\"></i> SIMULANDO RADIACIÓN ANUAL CON RAY-TRACING 3D...", 4000);

        try {
          await wpTriggerAnnualSolarHeatmapWrapper(null, true);
        } catch(eCalc) {
          console.error("Error calculating annual solar heatmap:", eCalc);
        } finally {
          solarSimState.isCalculatingHeatmap = false;
          if (typeof hideSolarCalcHUD === 'function') hideSolarCalcHUD();
          if (btnHeatmap) {
            btnHeatmap.style.pointerEvents = 'auto';
            btnHeatmap.innerHTML = '<span><i data-lucide=\"flame\" class=\"icon-sm\"></i> MAPA DE CALOR ANUAL</span>';
          }
        }
      }
    } else {
      if (typeof wpFastRenderSimulatedPanels === 'function') {
        await wpFastRenderSimulatedPanels(true);
      }
      if (typeof wpRenderHeatmapVisuals === 'function') {
        wpRenderHeatmapVisuals();
      }
      if (typeof viewer !== 'undefined' && viewer && viewer.scene && typeof viewer.scene.requestRender === 'function') {
        viewer.scene.requestRender();
      }
    }
    const btnP3Heatmap = document.getElementById('btn-run-annual-heatmap');
    if (btnP3Heatmap) {
      btnP3Heatmap.style.borderColor = 'rgba(56, 189, 248, 0.4)';
      btnP3Heatmap.style.color = '#38BDF8';
      btnP3Heatmap.innerHTML = '<i data-lucide="flame" class="icon-sm"></i> SIMULAR SOMBRAS & ACTIVAR MAPA DE CALOR 3D';
      if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
    }
    if (typeof showToast === 'function') {
      showToast('MAPA DE CALOR DISPONIBLE', 'Cálculo de irradiancia anual y pérdidas completado con éxito.', 'success', 3500);
    }
    showStatus("<i data-lucide=\"flame\" class=\"icon-sm\"></i> MAPA DE CALOR: IRRADIANCIA Y PÉRDIDAS ANUALES CALCULADAS", 3000);
  } else {
    // Restaurar texturas normales y limpiar etiquetas de mapa de calor
    if (solarSimState.heatmapLabelEntities) {
      solarSimState.heatmapLabelEntities.forEach(e => {
        if (e && e.id && viewer.entities) {
          viewer.entities.remove(e);
        } else if (e && e.label && window._solarHeatmapLabelCollection) {
          try { window._solarHeatmapLabelCollection.remove(e.label); } catch(_) {}
        }
      });
      solarSimState.heatmapLabelEntities = [];
    }
    if (window._solarHeatmapLabelCollection) {
      try { window._solarHeatmapLabelCollection.removeAll(); } catch(_) {}
    }
    if (typeof wpFastRenderSimulatedPanels === 'function') {
      await wpFastRenderSimulatedPanels(true);
    }
    if (solarSimState.currentSolarPos && typeof wpUpdatePanelShadingAndMLPE === 'function') {
      wpUpdatePanelShadingAndMLPE(solarSimState.currentSolarPos);
    }
    if (typeof viewer !== 'undefined' && viewer && viewer.scene && typeof viewer.scene.requestRender === 'function') {
      viewer.scene.requestRender();
    }
    showStatus(mode === "mlpe" ? "<i data-lucide=\"zap\" class=\"icon-sm\"></i> ANÁLISIS DE OPTIMIZADORES MLPE ACTIVO" : "<i data-lucide=\"sun\" class=\"icon-sm\"></i> MODO SOL INSTANTÁNEO ACTIVO", 2000);
  }
}
window.wpSetShadowViewMode = wpSetShadowViewMode;

async function wpRunHeatmapAndActivateView(forceRecalculate = true, triggerBtn = null) {
  if (!window.solarSimState) window.solarSimState = {};
  // [D3/M13] Guardia anti doble disparo: ignorar si ya hay un cálculo anual en curso
  if (window.solarSimState.isCalculatingHeatmap) return;
  const btn = triggerBtn || document.getElementById('btn-run-annual-heatmap');
  const runHeatmap = async () => {
    if (forceRecalculate) {
      window.solarSimState.annualHeatmapData = null;
      window.solarSimState.annualHeatmapDirty = false;
      window.solarSimState.isCalculatingHeatmap = false;
    }
    // Ejecutar el motor de cálculo directamente (ya renderiza mallas y visuales)
    if (typeof wpTriggerAnnualSolarHeatmapWrapper === 'function') {
      await wpTriggerAnnualSolarHeatmapWrapper();
    } else if (typeof window.computeAnnualSolarHeatmap === 'function') {
      await window.computeAnnualSolarHeatmap();
    }
    // Sincronizar botones de modo y leyenda sin forzar un segundo renderizado GPU redundante
    const btnInstant = document.getElementById("btn-shadow-mode-instant");
    const btnHeatmap = document.getElementById("btn-shadow-mode-heatmap");
    const btnMlpe = document.getElementById("btn-shadow-mode-mlpe");
    const heatLegend = document.getElementById("solar-heatmap-legend");
    if (btnInstant) btnInstant.classList.remove("active");
    if (btnHeatmap) btnHeatmap.classList.add("active");
    if (btnMlpe) btnMlpe.classList.remove("active");
    if (heatLegend) heatLegend.style.display = "flex";
    if (window.solarSimState) window.solarSimState.viewMode = "heatmap";
    if (typeof solarSimState !== 'undefined' && solarSimState) solarSimState.viewMode = "heatmap";
  };
  if (window.RA && typeof window.RA.withButtonLoading === 'function') {
    return window.RA.withButtonLoading(btn, 'Simulando sombras 3D...', runHeatmap);
  }
  return runHeatmap();
}
window.wpRunHeatmapAndActivateView = wpRunHeatmapAndActivateView;

// ── PRESETS DE DÍAS CRÍTICOS (SOLSTICIOS Y EQUINOCCIOS) ──────────────────────
function wpSetCriticalDayPreset(preset) {
  const badge = document.getElementById("solar-season-badge");
  if (preset === "winter") {
    wpSetSolarMonth(11); // 21 Dic (Solsticio Invierno / CTE)
    if (badge) badge.innerHTML = '<i data-lucide="snowflake" class="icon-sm"></i> SOLSTICIO INVIERNO (21 DIC)'; if(window.lucide) lucide.createIcons();
    showStatus('<i data-lucide="snowflake" class="icon-sm"></i> PRESET: SOLSTICIO DE INVIERNO (MÁXIMA SOMBRA · CTE DB-HE5)', 2500);
  } else if (preset === "summer") {
    wpSetSolarMonth(5); // 21 Jun (Solsticio Verano)
    if (badge) {
      badge.innerHTML = '<i data-lucide="sun" class="icon-sm"></i> SOLSTICIO VERANO (21 JUN)';
      if (window.lucide && typeof window.lucide.createIcons === 'function') try { window.lucide.createIcons(); } catch(e) {}
    }
    showStatus("<i data-lucide=\"sun\" class=\"icon-sm\"></i> PRESET: SOLSTICIO DE VERANO (MÁXIMA RADIACIÓN)", 2500);
  } else if (preset === "equinox") {
    wpSetSolarMonth(2); // 21 Mar (Equinoccio Primavera)
    if (badge) badge.innerHTML = '<i data-lucide="leaf" class="icon-sm"></i> EQUINOCCIO (21 MAR)'; if(window.lucide) lucide.createIcons();
    showStatus('<i data-lucide="leaf" class="icon-sm"></i> PRESET: EQUINOCCIO DE PRIMAVERA / OTOÑO (PROMEDIO ANUAL)', 2500);
  }
}

// ── ACTUALIZACIÓN Y SINCRONIZACIÓN DEL RECORRIDO SOLAR ───────────────────────
// [DEDUP] wpUpdateSolarSimulation -> solar-engine.js

// [DEDUP] wpSetSolarMonth -> solar-engine.js

// [DEDUP] wpSetSolarHour -> solar-engine.js


function wpUpdateSolarFAB(timeStr) {
  const fabTime = document.getElementById('solar-fab-time') || (document.querySelector && typeof document.querySelector === 'function' ? document.querySelector('#ra-solar-fab-btn .solar-fab-value') : null);
  if (!fabTime) return;

  if (timeStr === undefined) {
    let h = 12.0;
    if (typeof window.solarSimState !== 'undefined' && typeof window.solarSimState.hourFloat === 'number') {
      h = window.solarSimState.hourFloat;
    }
    const hr = Math.floor(h);
    const min = Math.round((h - hr) * 60);
    timeStr = String(hr).padStart(2, '0') + ':' + String(min).padStart(2, '0');
  }

  const alt = (typeof sState !== 'undefined' && sState.currentSolarPos && sState.currentSolarPos.alt !== undefined) 
    ? sState.currentSolarPos.alt 
    : 35.0;

  let iconName = 'sun';
  if (alt <= -6.0) iconName = 'moon';
  else if (alt <= 0.0) iconName = 'sunset';
  
  let opacity = (alt > 0 && alt <= 8.0) ? '0.6' : '1.0';

  const fabSun = document.getElementById('solar-fab-sun-icon') || (document.querySelector && typeof document.querySelector === 'function' ? document.querySelector('#ra-solar-fab-btn .solar-fab-sun') : null);
  
  if (fabSun) {
    if (fabSun.dataset.currentIcon !== iconName || fabSun.dataset.currentOpacity !== opacity) {
      fabSun.innerHTML = `<i data-lucide="${iconName}" class="icon-sm" style="opacity:${opacity}; width:16px; height:16px;"></i>`;
      if (window.lucide) lucide.createIcons({ root: fabSun });
      fabSun.dataset.currentIcon = iconName;
      fabSun.dataset.currentOpacity = opacity;
    }
  }
  fabTime.textContent = timeStr + ' h · ' + alt.toFixed(1) + '°';
}
window.wpUpdateSolarFAB = wpUpdateSolarFAB;

window._solarHUDWasAutoHidden = false;

function wpAutoMinimizeSolarHUD(reason) {
  const hud = document.getElementById('ra-solar-time-hud');
  const isHidden = hud && (hud.style.display === 'none' || (hud.classList && typeof hud.classList.contains === 'function' && hud.classList.contains('hidden')));
  if (hud && !isHidden) {
    window._solarHUDWasAutoHidden = true;
    toggleSolarHUD(false);
  }
}
window.wpAutoMinimizeSolarHUD = wpAutoMinimizeSolarHUD;

function wpAutoRestoreSolarHUD(reason) {
  // Desactivada la apertura automática por petición del usuario: el HUD solo se despliega por acción explícita.
  window._solarHUDWasAutoHidden = false;
}
window.wpAutoRestoreSolarHUD = wpAutoRestoreSolarHUD;

let _solarHUDAnimTimer = null;

function toggleSolarHUD(show) {
  const hud = document.getElementById('ra-solar-time-hud');
  const fab = document.getElementById('ra-solar-fab-btn');
  if (!hud) return;

  const isMinimized = hud.classList.contains('solar-hud-minimized') || hud.style.display === 'none';
  const isCurrentlyOpen = !isMinimized;
  const shouldOpen = (typeof show === 'boolean') ? show : !isCurrentlyOpen;

  if (_solarHUDAnimTimer) clearTimeout(_solarHUDAnimTimer);

  if (shouldOpen) {
    // 1. Mostrar HUD con animación de crecimiento de 300ms
    hud.style.display = 'flex';
    if (typeof bringToFront === 'function') bringToFront(hud);
    if (typeof makeElementDraggable === 'function') {
      const solarHdr = hud.querySelector('.solar-hud-header');
      if (solarHdr) makeElementDraggable(hud, solarHdr, 'ra_solar_hud_pos');
    }
    requestAnimationFrame(() => {
      hud.classList.remove('solar-hud-minimized');
      hud.classList.remove('hidden');
    });

    // 2. Minimizar botón FAB con transición de 300ms
    if (fab) {
      fab.classList.add('solar-fab-minimized');
      _solarHUDAnimTimer = setTimeout(() => {
        if (fab.classList.contains('solar-fab-minimized')) {
          fab.style.display = 'none';
        }
      }, 300);
    }
  } else {
    // 1. Minimizar HUD con animación inversa de 300ms hacia el centro inferior
    hud.classList.add('solar-hud-minimized');
    _solarHUDAnimTimer = setTimeout(() => {
      if (hud.classList.contains('solar-hud-minimized')) {
        hud.style.display = 'none';
        hud.classList.add('hidden');
      }
    }, 300);

    // 2. Mostrar botón FAB con animación de crecimiento de 300ms
    if (fab) {
      fab.style.display = 'flex';
      requestAnimationFrame(() => {
        fab.classList.remove('solar-fab-minimized');
        if (typeof wpUpdateSolarFAB === 'function') wpUpdateSolarFAB();
      });
    }
  }
}
window.toggleSolarHUD = toggleSolarHUD;

// [DEDUP] wpToggleSolarPlay -> solar-engine.js

// [DEDUP] wpSetSolarSpeed -> solar-engine.js

// [DELEGACIÓN MODULAR AAA]: Sliders de faldones, orientación/inclinación y wpUpdateUI residen en js/working-plane.js.


// ── Inicialización de Eventos y Handlers de Pantalla ────────────────────────

(function initUnifiedWorkPlaneSystem() {
  if (typeof window !== 'undefined') {
    window._raScreenHandlerInitialized = true;
  }
  ensureTriadCanvas();
  try { initTriad3DEntities(); } catch(e) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(e, 'Entidad/Primitiva Cesium'); }
  // ── CONFIGURACIÓN ERGONÓMICA DE CÁMARA CAD / GOOGLE EARTH (PAN FLUIDO + ÓRBITA FIABLE) ──
  if (scene && scene.screenSpaceCameraController && typeof Cesium !== "undefined" && Cesium.CameraEventType) {
    const sscc = scene.screenSpaceCameraController;
    
    // <i data-lucide=\"zap\" class=\"icon-sm\"></i> Amortiguación balanceada (0.08): fluidez suave sin patinaje incontrolable
    sscc.inertiaSpin = 0.08;
    sscc.inertiaTranslate = 0.08;
    sscc.inertiaZoom = 0.08;
    sscc.maximumMovementRatio = 0.1;
    
    // 🛡️ Detección de colisiones activa y límites rasantes
    sscc.enableCollisionDetection = true;
    sscc.minimumZoomDistance = 2.5;
    sscc.maximumTiltAngle = (typeof Cesium !== 'undefined' && Cesium.Math) ? Cesium.Math.toRadians(85.0) : 1.4835;
    
    sscc.enableRotate = true;
    sscc.enableTranslate = true;
    sscc.enableZoom = true;
    sscc.enableTilt = true;
    sscc.enableLook = false; // Desactivado para pivotar en el objetivo en vez de girar la cabeza

    // 🖱️ 1. PAN / DESPLAZAMIENTO EN 3D (En Cesium SCENE3D el arrastre con botón izquierdo usa rotateEventTypes)
    sscc.rotateEventTypes = [
      Cesium.CameraEventType.LEFT_DRAG
    ];

    // 🖱️ 2. ÓRBITA 3D PURA (Botón derecho, botón central, Shift/Ctrl + Click Izquierdo, y Gesto Multitáctil PINCH de 2 Dedos)
    sscc.tiltEventTypes = [
      Cesium.CameraEventType.MIDDLE_DRAG,
      Cesium.CameraEventType.RIGHT_DRAG,
      Cesium.CameraEventType.PINCH,
      { eventType: Cesium.CameraEventType.LEFT_DRAG, modifier: (Cesium.KeyboardEventModifier ? Cesium.KeyboardEventModifier.SHIFT : undefined) },
      { eventType: Cesium.CameraEventType.LEFT_DRAG, modifier: (Cesium.KeyboardEventModifier ? Cesium.KeyboardEventModifier.CTRL : undefined) }
    ].filter(Boolean);

    // 🖱️ 3. ZOOM SUAVE
    sscc.zoomEventTypes = [
      Cesium.CameraEventType.WHEEL,
      Cesium.CameraEventType.PINCH
    ];
  }

  // [FASE B3] Controlador de eventos Cesium 3D y atajos extraído a js/cad-events-controller.js
  if (window.RACadEvents && typeof window.RACadEvents.init === 'function') { window.RACadEvents.init(); }

  // Estado inicial
  if (typeof populateModuleDropdown === 'function') populateModuleDropdown();
  populateStep3EquipmentSelectors();
  wpUpdateUI();

  // Sincronización inmediata al arrancar la app con el mes y hora actuales
  try {
    if (typeof wpSetSolarMonth === 'function' && typeof wpSetSolarHour === 'function') {
      wpSetSolarMonth(solarSimState.monthIdx);
      wpSetSolarHour(solarSimState.hourFloat);
    }
  } catch(eInitSolar) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(eInitSolar, 'Entidad/Primitiva Cesium'); }
})();




// ═══════════════════════════════════════════════════════════════════════════
// 💾 SISTEMA DE PERSISTENCIA Y ARCHIVOS DE PROYECTO (.raproject)
// Lógica canónica y modular delegada a js/project-storage.js (Fase 2, Bloque 2.2)
// ═══════════════════════════════════════════════════════════════════════════


// ── Inicialización DOM diferida (catálogo eólico, iconos Lucide y badge de resolución solar) ──
    document.addEventListener("DOMContentLoaded", function() {
      if (window.RAWindCatalog && typeof window.RAWindCatalog.injectCatalogTab === "function") {
        window.RAWindCatalog.injectCatalogTab();
      }
      if (window.RAWindUI && typeof window.RAWindUI.init === "function") {
        window.RAWindUI.init();
      }
    });

document.addEventListener("DOMContentLoaded", function() {
  if (typeof window.lucide !== "undefined" && typeof window.lucide.createIcons === "function") {
    try { window.lucide.createIcons(); } catch (_) {}
  }
});
// [F4-07] setHeatmapResolution consolidado en js/shadow-settings.js
