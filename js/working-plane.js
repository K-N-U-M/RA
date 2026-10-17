// RA-WORKING-PLANE-GUARDED — Módulo de Planos de Trabajo 3D y Tríada CAD (Arquitectura v2)
(function() {
  'use strict';
  // ── HELPERS GLOBALES Y FALLBACKS SEGUROS ──────────────────────────────
  function setElemText(id, val) {
    const el = (typeof document !== 'undefined') ? document.getElementById(id) : null;
    if (el) el.textContent = val;
  }
  if (typeof window !== 'undefined' && typeof window.setElemText === 'undefined') {
    window.setElemText = setElemText;
  }

  if (typeof window !== 'undefined') {
    window.polygonPoints = window.polygonPoints || [];
    window.panelConfig = window.panelConfig || {
      modelo: 'Tier 1 Mono PERC 450W',
      tecnologia: 'Monocristalino',
      potencia: 450,
      largo: 2.10,
      ancho: 1.05,
      rendimiento: 21.5,
      precio: 135
    };
    window.magneticSnapActive = (typeof window.magneticSnapActive !== 'undefined') ? window.magneticSnapActive : true;
    window.userPanelOrientationPref = (typeof window.userPanelOrientationPref !== 'undefined') ? window.userPanelOrientationPref : 'portrait';
  }

  function getAddPointEntity() {
    return (typeof addPointEntity === 'function') ? addPointEntity : (typeof window !== 'undefined' ? window.addPointEntity : null);
  }
  function getAddPolylineEntity() {
    return (typeof addPolylineEntity === 'function') ? addPolylineEntity : (typeof window !== 'undefined' ? window.addPolylineEntity : null);
  }
  function getAddLabelEntity() {
    return (typeof addLabelEntity === 'function') ? addLabelEntity : (typeof window !== 'undefined' ? window.addLabelEntity : null);
  }



// ── PALETA DE COLORES PROFESIONAL PARA STRINGS INDEPENDIENTES ───────────────
window.RA_STRING_PALETTE = window.RA_STRING_PALETTE || [
  { name: "String #1", hex: "#00F0FF", rgb: [0, 240, 255], css: "#00F0FF" },   // Cyan Eléctrico
  { name: "String #2", hex: "#A855F7", rgb: [168, 85, 247], css: "#A855F7" }, // Violeta Neón
  { name: "String #3", hex: "#10B981", rgb: [16, 185, 129], css: "#10B981" }, // Verde Esmeralda
  { name: "String #4", hex: "#F59E0B", rgb: [245, 158, 11], css: "#F59E0B" }, // Ámbar Solar
  { name: "String #5", hex: "#F43F5E", rgb: [244, 63, 94], css: "#F43F5E" },   // Rosa / Fucsia
  { name: "String #6", hex: "#3B82F6", rgb: [59, 130, 246], css: "#3B82F6" }, // Azul Cobalto
  { name: "String #7", hex: "#84CC16", rgb: [132, 204, 22], css: "#84CC16" }, // Lima Neón
  { name: "String #8", hex: "#FF6B00", rgb: [255, 107, 0], css: "#FF6B00" },   // Naranja Fuego
  { name: "String #9", hex: "#14B8A6", rgb: [20, 184, 166], css: "#14B8A6" }, // Turquesa
  { name: "String #10", hex: "#EAB308", rgb: [234, 179, 8], css: "#EAB308" }, // Oro Brillante
  { name: "String #11", hex: "#EF4444", rgb: [239, 68, 68], css: "#EF4444" }, // Rojo Carmín
  { name: "String #12", hex: "#8B5CF6", rgb: [139, 92, 246], css: "#8B5CF6" } // Púrpura Imperial
];

function getPolylineStringColor(polyIdx) {
  if (typeof window !== 'undefined' && window.RA && window.RA.Electrical && typeof window.RA.Electrical.getPolylineStringColor === 'function') {
    try {
      return window.RA.Electrical.getPolylineStringColor(polyIdx);
    } catch (e) {}
  }
  const item = RA_STRING_PALETTE[polyIdx % RA_STRING_PALETTE.length];
  return item ? item.hex : "#00F0FF";
}


'use strict';

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
  showPlaneVertices: true,    // Visibilidad de vértices maestros y contorno de planos
  
  cursorPos: undefined,
  ents: {
    planePreview: [],
    activePoly: [],
    polys: [],
    gizmos: [],
    activePlaneMarker: [],
    inactivePlanes: []
  }
};

// ── Overlay 2D en Canvas para la Tríada RGB (100% visible sin oclusión) ───────
let triadCanvas = null;
let triadCtx = null;
let triadState = {
  active: false,
  x: 0,
  y: 0,
  scale: 1.0,
  pos3D: null,
  normal: null,
  xAxis: null,
  yAxis: null,
  zAxis: null,
  tiltDeg: 0,
  azimuthDeg: 0,
  camDist: 100,
  snapTarget: null,
  ents3D: [],
  previewEnts: []
};
window.triadState = triadState;

// ── Variables de seguimiento del ratón para cursor de fallback ──────────
// -- Tracking global del raton y activacion inteligente de la Triada 3D --
var _triadMouseX = -9999;
var _triadMouseY = -9999;

function cursorGizmoClear() {
  triadState.active = false;
  triadState.snapTarget = null;
  renderTriad2D();
}

function updateTriadAtMouse(clientX, clientY, target) {
  _triadMouseX = clientX;
  _triadMouseY = clientY;

  let isEditingObj = false;
  if (typeof getUniversalSelectedTarget === 'function') {
    try { isEditingObj = !!getUniversalSelectedTarget(); } catch(e){}
  }

  // La tríada del cursor con su telemetría SÓLO aparece al pulsar el botón para definir plano (WP.mode === 'define-plane')
  const isDefiningPlane = !isEditingObj && (typeof WP !== 'undefined' && WP && WP.mode === 'define-plane');

  if (!isDefiningPlane) {
    if (typeof triadState !== 'undefined' && triadState) {
      triadState.active = false;
      triadState.snapTarget = null;
      triadState.pos3D = null;
    }
    if (typeof cursorGizmoHide === 'function') {
      cursorGizmoHide();
    } else {
      renderTriad2D();
    }
    return;
  }

  // 1. Deteccion de elementos UI (sidebar, modales, paneles, controles)
  // Si el cursor esta sobre la interfaz, ocultar la triada y dejar el cursor estandar de Windows
  const el = target || document.elementFromPoint(clientX, clientY);
  if (el) {
    const isUI = el.closest && el.closest("#ra-sidebar, .sidebar, #ra-doc-modal, .doc-modal-box, .modal, .pane-dock, .engine-bar, #ra-rosa, #ra-status, #ra-autorot, button, input, select, textarea, .btn, [role=\"dialog\"], .engine-card-opt");
    const isCesium = el.id === "cesiumContainer" || (el.tagName === "CANVAS" && el.id !== "ra-triad-overlay") || (el.closest && el.closest("#cesiumContainer"));
    if (isUI || !isCesium) {
      cursorGizmoClear();
      return;
    }
  }

  // 2. Calculo 3D sobre el viewport de Cesium
  const currentViewer = typeof viewer !== 'undefined' && viewer ? viewer : (window.viewer || null);
  const currentScene = currentViewer ? currentViewer.scene : null;
  const currentCamera = currentViewer ? currentViewer.camera : null;
  if (currentScene && currentScene.canvas) {
    try {
      const rect = currentScene.canvas.getBoundingClientRect();
      if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
        cursorGizmoClear();
        return;
      }
      const winPos = new Cesium.Cartesian2(clientX - rect.left, clientY - rect.top);
      let pos3D = (typeof get3DPosition === "function") ? get3DPosition(winPos) : null;
      if (!Cesium.defined(pos3D) && typeof WP !== "undefined" && WP && WP.mode !== "define-plane") {
        try {
          const ray = currentCamera ? currentCamera.getPickRay(winPos) : null;
          if (ray && currentCamera) {
            pos3D = currentCamera.pickEllipsoid(winPos, currentScene.globe ? currentScene.globe.ellipsoid : Cesium.Ellipsoid.WGS84);
          }
        } catch(err){}
      }
      if (Cesium.defined(pos3D) && isFinite(pos3D.x)) {
        if (typeof WP !== "undefined") WP.cursorPos = pos3D;
        let targetPlane = (typeof wpFindPlaneUnderCursor === "function") ? wpFindPlaneUnderCursor(pos3D) : null;
        if (!targetPlane && typeof WP !== "undefined" && (WP.mode === "draw-poly" || WP.activePlaneIdx >= 0)) {
          targetPlane = (typeof wpGetActivePlane === "function") ? wpGetActivePlane() : null;
        }
        const norm = targetPlane ? targetPlane.normal : null;
        if (typeof cursorGizmoShowAt === "function") {
          cursorGizmoShowAt(pos3D, norm, winPos);
          return;
        }
      }
    } catch(err) {
      console.warn("[Triad] updateTriadAtMouse error:", err);
    }
  }
  if (typeof cursorGizmoHide === "function") cursorGizmoHide();
}

// ── Cursor de fallback: retícula simple cuando no hay hit 3D ─────────────
function renderFallbackCursor(mx, my) {
  if (!triadCtx || !triadCanvas) return;
  var s = 14;
  var gap = 4;
  triadCtx.save();
  triadCtx.strokeStyle = "rgba(255, 255, 255, 0.75)";
  triadCtx.lineWidth = 1.5;
  triadCtx.setLineDash([]);
  // Cruz horizontal
  triadCtx.beginPath();
  triadCtx.moveTo(mx - s, my);  triadCtx.lineTo(mx - gap, my);
  triadCtx.moveTo(mx + gap, my); triadCtx.lineTo(mx + s, my);
  // Cruz vertical
  triadCtx.moveTo(mx, my - s);  triadCtx.lineTo(mx, my - gap);
  triadCtx.moveTo(mx, my + gap); triadCtx.lineTo(mx, my + s);
  triadCtx.stroke();
  // Círculo central punteado
  triadCtx.beginPath();
  triadCtx.arc(mx, my, 5, 0, 2 * Math.PI);
  triadCtx.strokeStyle = "rgba(255, 255, 255, 0.45)";
  triadCtx.lineWidth = 1;
  triadCtx.setLineDash([3, 3]);
  triadCtx.stroke();
  triadCtx.restore();
}

function ensureTriadCanvas() {
  if (!triadCanvas) {
    triadCanvas = document.getElementById('ra-triad-overlay');
    if (!triadCanvas) {
      triadCanvas = document.createElement('canvas');
      triadCanvas.id = 'ra-triad-overlay';
      triadCanvas.style.position = 'fixed';
      triadCanvas.style.left = '0';
      triadCanvas.style.top = '0';
      triadCanvas.style.width = '100vw';
      triadCanvas.style.height = '100vh';
      triadCanvas.style.pointerEvents = 'none';
      triadCanvas.style.zIndex = '10'; // [RA FIX] Render behind main UI panels (which are z-index 998+)
      document.body.appendChild(triadCanvas);
    }
    triadCtx = (typeof triadCanvas.getContext === 'function') ? triadCanvas.getContext('2d') : null;
    window.triadCanvas = triadCanvas;
    window.triadCtx = triadCtx;


    const updateSize = () => {
      if (triadCanvas) {
        const dpr = window.devicePixelRatio || 1;
        triadCanvas.width = window.innerWidth * dpr;
        triadCanvas.height = window.innerHeight * dpr;
        if (triadCtx) {
          triadCtx.resetTransform();
          triadCtx.scale(dpr, dpr);
        }
        if (triadState && triadState.active) renderTriad2D();
      }
    };
    window.addEventListener('resize', updateSize);
    updateSize();
  }
  const dpr = window.devicePixelRatio || 1;
  if (triadCanvas.width !== window.innerWidth * dpr || triadCanvas.height !== window.innerHeight * dpr) {
    triadCanvas.width = window.innerWidth * dpr;
    triadCanvas.height = window.innerHeight * dpr;
    if (triadCtx) {
      triadCtx.resetTransform();
      triadCtx.scale(dpr, dpr);
    }
  }
}

// ── Helper de Elevación Normalizada sobre la Malla 3D (+15 cm) ────────────
function wpElevatePointAboveSurface(cartesian, offsetM = 0.15, fallbackNormal = null) {
  if (!cartesian) return cartesian;
  try {
    const radial = Cesium.Cartesian3.normalize(cartesian, new Cesium.Cartesian3());
    let normal = fallbackNormal || (triadState && triadState.zAxis) || radial;
    if (Cesium.Cartesian3.dot(normal, radial) < 0) normal = radial;
    return Cesium.Cartesian3.add(
      cartesian,
      Cesium.Cartesian3.multiplyByScalar(normal, offsetM, new Cesium.Cartesian3()),
      new Cesium.Cartesian3()
    );
  } catch(e) {
    return cartesian;
  }
}

// ── Inicialización de Primitivas 3D para el Cursor y Ghost Preview ───────────
function initTriad3DEntities() {
  // Option 1: 3D Triad removed to prevent giant lines piercing geometry
  if (triadState.ents3D) {
    if (viewer && viewer.entities) {
      triadState.ents3D.forEach(e => viewer.entities.remove(e));
    }
    triadState.ents3D = [];
  }
}

function changeTriadScale(delta) {
  triadState.scale = Math.max(0.25, Math.min(5.0, (triadState.scale || 1.0) + delta));
  showStatus('📏 TAMAÑO DE TRÍADA: ' + Math.round(triadState.scale * 100) + '%', 1500);
  const sizeLbl = document.getElementById('wp-triad-scale-lbl');
  if (sizeLbl) sizeLbl.textContent = Math.round(triadState.scale * 100) + '%';
  renderTriad2D();
}

function cursorGizmoHide() {
  triadState.active = false;
  triadState.snapTarget = null;
  renderTriad2D();
}

// ── OPCIÓN 1: LIBERTAD TOTAL DE CURSOR SIN IMANTACIÓN A VÉRTICES CREADOS ─────
function wpFindSnapTarget(cursorPos) {
  if (!cursorPos || !magneticSnapActive) return null;
  let best = null;
  const closeSnapDistance = 2.5; // Radio exclusivo de cierre milimétrico (2.5m)

  // Únicamente snapping al primer vértice (P0) de la polilínea activa para facilitar cierre limpio
  if (WP.mode === 'draw-poly' && WP.activePolyPts && WP.activePolyPts.length >= 3) {
    const firstPt = WP.activePolyPts[0];
    const d = Cesium.Cartesian3.distance(cursorPos, firstPt);
    if (d < closeSnapDistance) {
      best = { pos: firstPt, type: 'CLOSE_VTX', label: '<i data-lucide=\"magnet\" class=\"icon-sm\"></i> SNAP: Cerrar Cubierta (Punto Inicial)' };
    }
  }

  return best;
}

function cursorGizmoShowAt(pos, explicitNormal, windowPos) {
  if (typeof WP !== 'undefined' && WP && WP.mode !== 'define-plane') {
    cursorGizmoHide();
    return;
  }
  if (!Cesium.defined(pos) || !windowPos) { cursorGizmoHide(); return; }
  ensureTriadCanvas();
  initTriad3DEntities();

  // Comprobar snapping magnetico
  const snap = wpFindSnapTarget(pos);
  triadState.snapTarget = snap;
  const effectivePos = snap ? snap.pos : pos;

  triadState.active = true;
  triadState.x = windowPos.x;
  triadState.y = windowPos.y;
  triadState.pos3D = Cesium.Cartesian3.clone(effectivePos);

  // Distancia a la camara
  const currentCamera = typeof viewer !== 'undefined' && viewer ? viewer.camera : (window.viewer ? window.viewer.camera : null);
  const camPos = (currentCamera && currentCamera.positionWC) ? currentCamera.positionWC : ((currentCamera && currentCamera.position) ? currentCamera.position : null);
  const camDist = camPos ? Cesium.Cartesian3.distance(camPos, effectivePos) : 100;
  triadState.camDist = camDist;
  
  // Cachear transformación cartográfica (Optimización Arquitectónica)
  try {
    const carto = Cesium.Cartographic.fromCartesian(effectivePos);
    triadState.cachedAltM = carto ? carto.height : 0;
  } catch(e) { triadState.cachedAltM = 0; }

  // 1. Obtener la Normal (desde plano activo, faldon detectado o muestreo)
  let normal = null;
  if (explicitNormal && Cesium.Cartesian3.magnitude(explicitNormal) > 1e-4) {
    normal = Cesium.Cartesian3.normalize(explicitNormal, new Cesium.Cartesian3());
  } else {
    // Si estamos definiendo plano y ya tenemos P1 y P2, calcular la normal provisional con el cursor
    if (typeof WP !== "undefined" && WP && WP.mode === "define-plane" && WP.planePts && WP.planePts.length === 2) {
      const v1 = Cesium.Cartesian3.subtract(WP.planePts[1], WP.planePts[0], new Cesium.Cartesian3());
      const v2 = Cesium.Cartesian3.subtract(effectivePos, WP.planePts[0], new Cesium.Cartesian3());
      const crossN = Cesium.Cartesian3.cross(v1, v2, new Cesium.Cartesian3());
      if (Cesium.Cartesian3.magnitude(crossN) > 0.01) {
        normal = Cesium.Cartesian3.normalize(crossN, new Cesium.Cartesian3());
      }
    }
    
    if (!normal) {
      normal = cursorGizmoSurfaceNormal(windowPos, effectivePos);
    }
  }

  const radial = Cesium.Cartesian3.normalize(effectivePos, new Cesium.Cartesian3());
  if (!normal || Cesium.Cartesian3.magnitude(normal) < 1e-4) {
    normal = Cesium.Cartesian3.clone(radial);
  } else {
    if (Cesium.Cartesian3.dot(normal, radial) < 0) {
      normal = Cesium.Cartesian3.negate(normal, new Cesium.Cartesian3());
    }
  }

  // 2. BASE ORTONORMAL ORIENTADA AL PLANO DE TRABAJO (Ejes X e Y locales)
  let uVec = null;
  let vVec = null;

  // Caso A: Durante la definicion de plano
  if (typeof WP !== "undefined" && WP && WP.mode === "define-plane") {
    if (WP.planePts && WP.planePts.length === 1) {
      // P1 fijado -> Eje X apunta hacia la posicion actual del cursor
      const dirP1 = Cesium.Cartesian3.subtract(effectivePos, WP.planePts[0], new Cesium.Cartesian3());
      if (Cesium.Cartesian3.magnitude(dirP1) > 0.05) {
        uVec = Cesium.Cartesian3.normalize(dirP1, new Cesium.Cartesian3());
        vVec = Cesium.Cartesian3.normalize(Cesium.Cartesian3.cross(normal, uVec, new Cesium.Cartesian3()), new Cesium.Cartesian3());
      }
    } else if (WP.planePts && WP.planePts.length === 2) {
      // P1 y P2 fijados -> Eje X fijo P1->P2, Eje Y guiado hacia Cursor
      try {
        const previewPlane = wpComputePlaneFrom3Points(WP.planePts[0], WP.planePts[1], effectivePos, WP.axisMode || "p1p2");
        if (previewPlane && previewPlane.uVec && previewPlane.vVec) {
          uVec = Cesium.Cartesian3.clone(previewPlane.uVec);
          vVec = Cesium.Cartesian3.clone(previewPlane.vVec);
          normal = Cesium.Cartesian3.clone(previewPlane.normal);
        }
      } catch(e){}
    }
  }

  // Caso B: Plano de trabajo activo ya fijado
  if (!uVec) {
    const activePl = (typeof wpGetActivePlane === "function") ? wpGetActivePlane() : null;
    if (activePl && activePl.uVec && activePl.vVec) {
      uVec = Cesium.Cartesian3.clone(activePl.uVec);
      vVec = Cesium.Cartesian3.clone(activePl.vVec);
      if (explicitNormal || WP.mode === "draw-poly" || (typeof currentStep !== "undefined" && currentStep >= 2)) {
        normal = Cesium.Cartesian3.clone(activePl.normal);
      }
    }
  }

  // Caso C: Fallback generico cardinal si no hay plano definido
  if (!uVec || Cesium.Cartesian3.magnitude(uVec) < 1e-4) {
    uVec = Cesium.Cartesian3.cross(normal, Cesium.Cartesian3.UNIT_Z, new Cesium.Cartesian3());
    if (Cesium.Cartesian3.magnitude(uVec) < 1e-4) {
      uVec = Cesium.Cartesian3.cross(normal, Cesium.Cartesian3.UNIT_X, new Cesium.Cartesian3());
    }
    uVec = Cesium.Cartesian3.normalize(uVec, new Cesium.Cartesian3());
  }
  if (!vVec || Cesium.Cartesian3.magnitude(vVec) < 1e-4) {
    vVec = Cesium.Cartesian3.normalize(
      Cesium.Cartesian3.cross(normal, uVec, new Cesium.Cartesian3()),
      new Cesium.Cartesian3()
    );
  }

  const cosTilt = Math.abs(Cesium.Cartesian3.dot(normal, radial));
  const tiltDeg = Cesium.Math.toDegrees(Math.acos(Cesium.Math.clamp(cosTilt, 0, 1)));

  const east = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.cross(Cesium.Cartesian3.UNIT_Z, radial, new Cesium.Cartesian3()),
    new Cesium.Cartesian3()
  );
  const northVec = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.cross(radial, east, new Cesium.Cartesian3()),
    new Cesium.Cartesian3()
  );
  const nDotNorth = Cesium.Cartesian3.dot(normal, northVec);
  const nDotEast = Cesium.Cartesian3.dot(normal, east);
  let azimuthDeg = Cesium.Math.toDegrees(Math.atan2(nDotEast, nDotNorth));
  azimuthDeg = ((azimuthDeg % 360) + 360) % 360;

  triadState.xAxis = uVec;
  triadState.yAxis = vVec;
  triadState.zAxis = normal;
  triadState.tiltDeg = tiltDeg;
  triadState.azimuthDeg = azimuthDeg;

  renderTriad2D();
}


// ── GIZMO 3D Y GESTIÓN INDIVIDUAL DE PANELES FV ──────────────────────────────

// ── GIZMO 3D INTERACTIVO PARA VÉRTICES DE POLILÍNEA ──────────────────────────
let vtxGizmoState = (typeof window !== 'undefined' && window.vtxGizmoState) ? window.vtxGizmoState : {
  active: false,
  mode: null, // 'u-axis', 'v-axis', 'center-drag'
  hoveredPart: null,
  startMouse: null,
  startVtxU: 0,
  startVtxV: 0,
  startHitU: 0,
  startHitV: 0,
  screen: null,
  wasDragging: false
};
if (typeof window !== 'undefined') window.vtxGizmoState = vtxGizmoState;

window.getSelectedVertexData = getSelectedVertexData;
function getSelectedVertexData() {
  const poly = (WP.polylines && WP.selectedPolyIdx >= 0) ? WP.polylines[WP.selectedPolyIdx] : null;
  if (!poly || WP.selectedVtxIdx < 0 || WP.selectedVtxIdx >= poly.points.length) return null;
  const pt = poly.points[WP.selectedVtxIdx];
  if (!pt) return null;

  // Obtener el plano asignado a la polilínea o el plano activo
  let wpPlane = null;
  if (poly.planeId && WP.planes && WP.planes.length > 0) {
    wpPlane = WP.planes.find(p => p.id === poly.planeId) || null;
  }
  if (!wpPlane && typeof poly.planeIdx === 'number' && WP.planes && WP.planes[poly.planeIdx]) {
    wpPlane = WP.planes[poly.planeIdx];
  }
  if (!wpPlane) wpPlane = wpGetActivePlane();
  if (!wpPlane && typeof getObstacleActivePlane === 'function') wpPlane = getObstacleActivePlane();

  const origin = (wpPlane && wpPlane.origin) ? wpPlane.origin : pt;

  let normal = (wpPlane && wpPlane.normal) ? wpPlane.normal : null;
  if (!normal || typeof normal.x !== 'number' || isNaN(normal.x) || Cesium.Cartesian3.magnitude(normal) < 1e-4) {
    normal = Cesium.Cartesian3.normalize(pt, new Cesium.Cartesian3());
  } else {
    normal = Cesium.Cartesian3.normalize(normal, new Cesium.Cartesian3());
  }

  let uVec = (wpPlane && wpPlane.uVec) ? wpPlane.uVec : null;
  if (!uVec || typeof uVec.x !== 'number' || isNaN(uVec.x) || Cesium.Cartesian3.magnitude(uVec) < 1e-4) {
    uVec = Cesium.Cartesian3.cross(normal, Cesium.Cartesian3.UNIT_Z, new Cesium.Cartesian3());
    if (Cesium.Cartesian3.magnitude(uVec) < 0.01) {
      Cesium.Cartesian3.cross(normal, Cesium.Cartesian3.UNIT_X, uVec);
    }
  }
  uVec = Cesium.Cartesian3.normalize(uVec, new Cesium.Cartesian3());

  let vVec = (wpPlane && wpPlane.vVec) ? wpPlane.vVec : null;
  if (!vVec || typeof vVec.x !== 'number' || isNaN(vVec.x) || Cesium.Cartesian3.magnitude(vVec) < 1e-4) {
    vVec = Cesium.Cartesian3.cross(normal, uVec, new Cesium.Cartesian3());
  }
  vVec = Cesium.Cartesian3.normalize(vVec, new Cesium.Cartesian3());

  const wp = { origin, normal, uVec, vVec, plane: { origin, normal } };

  const diff = Cesium.Cartesian3.subtract(pt, origin, new Cesium.Cartesian3());
  const u = Cesium.Cartesian3.dot(diff, uVec);
  const v = Cesium.Cartesian3.dot(diff, vVec);
  return { poly, pt, u, v, wp, vIdx: WP.selectedVtxIdx };
}

function checkVertexGizmoHit(mx, my) {
  const vtxData = getSelectedVertexData();
  if (!vtxData || !vtxGizmoState.screen) return null;
  const s = vtxGizmoState.screen;
  const dx = mx - s.ox;
  const dy = my - s.oy;
  const distCenter = Math.sqrt(dx * dx + dy * dy);

  if (distCenter <= 16 * s.scale) return 'center-drag';

  const duX = s.pU.x - s.ox, duY = s.pU.y - s.oy;
  const lenU = Math.sqrt(duX * duX + duY * duY);
  if (lenU > 1) {
    const projU = (dx * duX + dy * duY) / lenU;
    const perpU = Math.abs(-dx * duY + dy * duX) / lenU;
    if (projU >= 0 && projU <= lenU + 10 && perpU <= 14 * s.scale) return 'u-axis';
  }

  const dvX = s.pV.x - s.ox, dvY = s.pV.y - s.oy;
  const lenV = Math.sqrt(dvX * dvX + dvY * dvY);
  if (lenV > 1) {
    const projV = (dx * dvX + dy * dvY) / lenV;
    const perpV = Math.abs(-dx * dvY + dy * dvX) / lenV;
    if (projV >= 0 && projV <= lenV + 10 && perpV <= 14 * s.scale) return 'v-axis';
  }
  return null;
}

function renderVertexGizmo2D() {
  // [SSOT §5 AGENTS.md] La manipulación de ejes e interacción en vértices la gestiona exclusivamente renderUniversalGizmo2D
  if (typeof vtxGizmoState !== 'undefined' && vtxGizmoState) vtxGizmoState.screen = null;
  return;
}

let panelGizmoState = (typeof window !== 'undefined' && window.panelGizmoState) ? window.panelGizmoState : {
  active: false,
  mode: null,
  startMouse: null,
  startPanelU: 0,
  startPanelV: 0,
  startHitU: 0,
  startHitV: 0,
  startAngleRad: 0,
  screen: null,
  wasDragging: false
};
if (typeof window !== 'undefined') window.panelGizmoState = panelGizmoState;

let obsGizmoState = (typeof window !== 'undefined' && window.obsGizmoState) ? window.obsGizmoState : {
  active: false,
  mode: null,
  startMouse: null,
  startObsU: 0,
  startObsV: 0,
  startObsRot: 0,
  startHitU: 0,
  startHitV: 0,
  startAngleRad: 0,
  hoveredPart: null,
  wasDragging: false
};
if (typeof window !== 'undefined') window.obsGizmoState = obsGizmoState;

function getSelectedPanel() {
  if (selectedPanelIndex < 0) return null;
  // Preferir allRenderedPanels (multi-faldón instanciado) sobre lastRoofInfo.panels (legacy)
  if (window.allRenderedPanels && window.allRenderedPanels.length > 0) {
    return window.allRenderedPanels[selectedPanelIndex] || null;
  }
  if (!lastRoofInfo || !lastRoofInfo.panels) return null;
  return lastRoofInfo.panels[selectedPanelIndex] || null;
}

function checkPanelGizmoHit(mx, my) {
  const panel = getSelectedPanel();
  if (!panel || !panelGizmoState.screen) return null;
  const s = panelGizmoState.screen;
  const dx = mx - s.ox;
  const dy = my - s.oy;
  const distCenter = Math.sqrt(dx * dx + dy * dy);

  if (distCenter <= 16 * s.scale) return 'center-drag';
  if (Math.abs(distCenter - s.ringRadius) <= 12 * s.scale) return 'rotate-ring';

  const duX = s.pU.x - s.ox, duY = s.pU.y - s.oy;
  const lenU = Math.sqrt(duX * duX + duY * duY);
  if (lenU > 1) {
    const projU = (dx * duX + dy * duY) / lenU;
    const perpU = Math.abs(-dx * duY + dy * duX) / lenU;
    if (projU >= 0 && projU <= lenU + 10 && perpU <= 14 * s.scale) return 'u-axis';
  }

  const dvX = s.pV.x - s.ox, dvY = s.pV.y - s.oy;
  const lenV = Math.sqrt(dvX * dvX + dvY * dvY);
  if (lenV > 1) {
    const projV = (dx * dvX + dy * dvY) / lenV;
    const perpV = Math.abs(-dx * dvY + dy * dvX) / lenV;
    if (projV >= 0 && projV <= lenV + 10 && perpV <= 14 * s.scale) return 'v-axis';
  }
  return null;
}

function renderPanelGizmo2D() {
  // [SSOT §5 AGENTS.md] La manipulación e interacción de paneles la gestiona exclusivamente renderUniversalGizmo2D
  if (typeof panelGizmoState !== 'undefined' && panelGizmoState) panelGizmoState.screen = null;
  return;
}

function deleteSelectedPanel() {
  if (typeof window !== 'undefined' && typeof window.deleteSelectedPanel === 'function' && window.deleteSelectedPanel !== deleteSelectedPanel) {
    return window.deleteSelectedPanel();
  }
  if (typeof selectedPanelIndex === 'undefined' || selectedPanelIndex < 0) return;
  const panel = (typeof getSelectedPanel === 'function') ? getSelectedPanel() : null;
  if (!panel) return;

  panel.deleted = true;
  if (panel.rawPanel) {
    panel.rawPanel.deleted = true;
  }

  if (typeof WP !== 'undefined' && WP && WP.polylines && panel.polyIdx !== undefined) {
    const poly = WP.polylines[panel.polyIdx];
    if (poly) {
      if (!Array.isArray(poly.deletedPanels)) poly.deletedPanels = [];
      poly.deletedPanels.push({
        u: (typeof panel.u === 'number') ? panel.u : (panel.rawPanel && panel.rawPanel.u),
        v: (typeof panel.v === 'number') ? panel.v : (panel.rawPanel && panel.rawPanel.v),
        center: panel.center ? Cesium.Cartesian3.clone(panel.center) : (panel.rawPanel && panel.rawPanel.center ? Cesium.Cartesian3.clone(panel.rawPanel.center) : null)
      });
      if (poly.roofInfo && Array.isArray(poly.roofInfo.panels)) {
        poly.roofInfo.panels = poly.roofInfo.panels.filter(p => p !== panel && p !== panel.rawPanel && !p.deleted);
      }
    }
  }

  selectedPanelIndex = -1;
  if (typeof updatePanelSelectionUI === 'function') updatePanelSelectionUI();
  if (typeof wpHideUniversalGizmo === 'function') wpHideUniversalGizmo();
  if (typeof clearSimulatedPV === 'function') clearSimulatedPV();
  if (typeof startSolarPanelsSimulation === 'function') startSolarPanelsSimulation();
  if (typeof showStatus === 'function') {
    showStatus('<i data-lucide=\"trash-2\" class=\"icon-sm\"></i> MÓDULO FV ELIMINADO', 1800);
  }
}

function toScreen(pos3D) {
  const scene = typeof viewer !== 'undefined' && viewer ? viewer.scene : (window.viewer ? window.viewer.scene : null);
  if (!scene || !pos3D) return null;
  try {
    if (Cesium.SceneTransforms && Cesium.SceneTransforms.worldToWindowCoordinates) {
      const res = Cesium.SceneTransforms.worldToWindowCoordinates(scene, pos3D);
      if (res && typeof res.x === "number" && isFinite(res.x)) return res;
    }
    if (Cesium.SceneTransforms && Cesium.SceneTransforms.wgs84ToWindowCoordinates) {
      const res = Cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, pos3D);
      if (res && typeof res.x === "number" && isFinite(res.x)) return res;
    }
  } catch(e) {}
  return null;
}

// ── GESTIÓN DE ANIMACIÓN Y FADE IN / FADE OUT ON-HOVER (ZERO CLUTTER) ────────
var _labelHoverStates = (typeof _labelHoverStates !== 'undefined') ? _labelHoverStates : new Map();
var _hoverFadeRafId = null;
var _hasHoverFadeTransitions = false;

function _requestHoverFadeNextFrame() {
  if (_hoverFadeRafId) return;
  if (typeof requestAnimationFrame !== 'function') return;
  _hoverFadeRafId = requestAnimationFrame(() => {
    _hoverFadeRafId = null;
    if (typeof renderTriad2D === 'function') renderTriad2D();
    const scene = typeof viewer !== 'undefined' && viewer ? viewer.scene : (window.viewer ? window.viewer.scene : null);
    if (scene && typeof scene.requestRender === 'function') {
      scene.requestRender();
    }
  });
}

function _isCursorInBox(mx, my, box, pad) {
  if (!box || typeof mx !== 'number' || typeof my !== 'number') return false;
  const p = (pad !== undefined) ? pad : 8;
  return mx >= box.x - p && mx <= box.x + box.w + p &&
         my >= box.y - p && my <= box.y + box.h + p;
}

function _isPointInScreenPolygon(px, py, screenPts) {
  if (!screenPts || screenPts.length < 3) return false;
  let inside = false;
  for (let i = 0, j = screenPts.length - 1; i < screenPts.length; j = i++) {
    const xi = screenPts[i].x, yi = screenPts[i].y;
    const xj = screenPts[j].x, yj = screenPts[j].y;
    const intersect = ((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function _updateLabelHoverAlpha(key, isHovered, now) {
  let state = _labelHoverStates.get(key);
  if (!state) {
    state = {
      alpha: 0.0,
      targetAlpha: 0.0,
      lastTime: now,
      box: null
    };
    _labelHoverStates.set(key, state);
  }
  const dt = Math.min(0.1, Math.max(0.001, (now - (state.lastTime || now)) / 1000.0));
  state.lastTime = now;
  state.targetAlpha = isHovered ? 1.0 : 0.0;

  if (state.alpha < state.targetAlpha) {
    // Fade in: 150 ms (0.15 s)
    state.alpha = Math.min(1.0, state.alpha + dt / 0.15);
  } else if (state.alpha > state.targetAlpha) {
    // Fade out: 300 ms (0.30 s)
    state.alpha = Math.max(0.0, state.alpha - dt / 0.30);
  }

  if (Math.abs(state.alpha - state.targetAlpha) > 0.002) {
    _hasHoverFadeTransitions = true;
  }

  return state;
}

function renderTriad2D() {
  if (typeof window !== 'undefined' && window.RACapture && window.RACapture.enabled) return; // [CAPTURA] overlay CAD oculto
  try {
    ensureTriadCanvas();
    const scene = typeof viewer !== 'undefined' && viewer ? viewer.scene : (window.viewer ? window.viewer.scene : null);
    if (!triadCtx || !triadCanvas || !scene) return;
    const camera = scene ? scene.camera : (typeof viewer !== 'undefined' && viewer ? viewer.camera : (window.viewer ? window.viewer.camera : null));
    triadCtx.clearRect(0, 0, triadCanvas.width, triadCanvas.height);

    _hasHoverFadeTransitions = false;
    const animNow = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const hoverMouseX = (typeof _triadMouseX === 'number') ? _triadMouseX : -9999;
    const hoverMouseY = (typeof _triadMouseY === 'number') ? _triadMouseY : -9999;

    // ── LÍNEA GUÍA ELÁSTICA EN TIEMPO REAL (RUBBER-BAND 2D SCREEN-SPACE AUTÓNOMA) ──
    if (typeof WP !== 'undefined' && WP && WP.mode === 'define-plane' && WP.planePts && WP.planePts.length > 0) {
      try {
        const pCount = WP.planePts.length;
        const p1Screen = toScreen(WP.planePts[0]);
        const camPosWC = (camera && camera.positionWC) ? camera.positionWC : ((camera && camera.position) ? camera.position : null);
        const camDirWC = (camera && camera.directionWC) ? camera.directionWC : ((camera && camera.direction) ? camera.direction : null);
        const isP1Front = p1Screen && camPosWC && camDirWC && Cesium.Cartesian3.dot(Cesium.Cartesian3.subtract(WP.planePts[0], camPosWC, new Cesium.Cartesian3()), camDirWC) > 0;

        const curMouseX = (typeof _triadMouseX === 'number') ? _triadMouseX : (triadState.x || (window.innerWidth / 2));
        const curMouseY = (typeof _triadMouseY === 'number') ? _triadMouseY : (triadState.y || (window.innerHeight / 2));
        const active3D = triadState.pos3D || WP.planePts[pCount - 1];

        if (pCount === 1 && isP1Front) {
          // Línea elástica viva P1 -> Cursor del ratón
          triadCtx.save();
          triadCtx.beginPath();
          triadCtx.moveTo(p1Screen.x, p1Screen.y);
          triadCtx.lineTo(curMouseX, curMouseY);
          triadCtx.strokeStyle = "#F59E0B";
          triadCtx.lineWidth = 3.5;
          triadCtx.shadowColor = "#F59E0B";
          triadCtx.shadowBlur = 10;
          triadCtx.stroke();

          // Píldora con distancia métrica en tiempo real en el punto medio
          const midX = (p1Screen.x + curMouseX) / 2;
          const midY = (p1Screen.y + curMouseY) / 2;
          const dM = active3D ? Cesium.Cartesian3.distance(WP.planePts[0], active3D) : 0;
          if (dM > 0.05) {
            const distText = dM.toFixed(2) + " m";
            triadCtx.font = "bold 11px sans-serif";
            const tw = triadCtx.measureText(distText).width;
            triadCtx.fillStyle = "rgba(15, 23, 42, 0.90)";
            triadCtx.strokeStyle = "#F59E0B";
            triadCtx.lineWidth = 1.5;
            triadCtx.shadowBlur = 0;
            triadCtx.beginPath();
            if (triadCtx.roundRect) triadCtx.roundRect(midX - tw / 2 - 8, midY - 10, tw + 16, 20, 4);
            else triadCtx.rect(midX - tw / 2 - 8, midY - 10, tw + 16, 20);
            triadCtx.fill();
            triadCtx.stroke();
            triadCtx.fillStyle = "#FBBF24";
            triadCtx.fillText(distText, midX - tw / 2, midY + 4);
          }
          triadCtx.restore();
        } else if (pCount === 2 && isP1Front) {
          const p2Screen = toScreen(WP.planePts[1]);
          const isP2Front = p2Screen && camPosWC && camDirWC && Cesium.Cartesian3.dot(Cesium.Cartesian3.subtract(WP.planePts[1], camPosWC, new Cesium.Cartesian3()), camDirWC) > 0;

          if (isP2Front) {
            // Triángulo elástico cerrado P1 -> P2 -> Cursor -> P1
            triadCtx.save();
            triadCtx.beginPath();
            triadCtx.moveTo(p1Screen.x, p1Screen.y);
            triadCtx.lineTo(p2Screen.x, p2Screen.y);
            triadCtx.lineTo(curMouseX, curMouseY);
            triadCtx.closePath();
            triadCtx.fillStyle = "rgba(56, 189, 248, 0.18)";
            triadCtx.fill();

            // Arista fija P1 - P2
            triadCtx.beginPath();
            triadCtx.moveTo(p1Screen.x, p1Screen.y);
            triadCtx.lineTo(p2Screen.x, p2Screen.y);
            triadCtx.strokeStyle = "#38BDF8";
            triadCtx.lineWidth = 3.5;
            triadCtx.shadowColor = "#38BDF8";
            triadCtx.shadowBlur = 8;
            triadCtx.stroke();

            // Aristas elásticas hacia cursor
            triadCtx.beginPath();
            triadCtx.moveTo(p2Screen.x, p2Screen.y);
            triadCtx.lineTo(curMouseX, curMouseY);
            triadCtx.lineTo(p1Screen.x, p1Screen.y);
            triadCtx.strokeStyle = "#F59E0B";
            triadCtx.lineWidth = 3.0;
            triadCtx.shadowColor = "#F59E0B";
            triadCtx.shadowBlur = 8;
            triadCtx.stroke();

            // Píldora métrica P2 -> Cursor
            const mid2X = (p2Screen.x + curMouseX) / 2;
            const mid2Y = (p2Screen.y + curMouseY) / 2;
            const d2M = active3D ? Cesium.Cartesian3.distance(WP.planePts[1], active3D) : 0;
            if (d2M > 0.05) {
              const dist2Text = d2M.toFixed(2) + " m";
              triadCtx.font = "bold 11px sans-serif";
              const tw2 = triadCtx.measureText(dist2Text).width;
              triadCtx.fillStyle = "rgba(15, 23, 42, 0.90)";
              triadCtx.strokeStyle = "#F59E0B";
              triadCtx.lineWidth = 1.5;
              triadCtx.shadowBlur = 0;
              triadCtx.beginPath();
              if (triadCtx.roundRect) triadCtx.roundRect(mid2X - tw2 / 2 - 8, mid2Y - 10, tw2 + 16, 20, 4);
              else triadCtx.rect(mid2X - tw2 / 2 - 8, mid2Y - 10, tw2 + 16, 20);
              triadCtx.fill();
              triadCtx.stroke();
              triadCtx.fillStyle = "#FBBF24";
              triadCtx.fillText(dist2Text, mid2X - tw2 / 2, mid2Y + 4);
            }
            triadCtx.restore();
          }
        }
      } catch(eRubber) { console.warn("[RubberBand] error:", eRubber); }
    }

    // ── LÍNEA GUÍA ELÁSTICA Y DIANA DE SNAP EN CIERRE DE POLILÍNEA (OPCIÓN 1 SIN BADGE) ──
    if (typeof WP !== 'undefined' && WP && WP.mode === 'draw-poly' && WP.activePolyPts && WP.activePolyPts.length > 0) {
      try {
        const polyCount = WP.activePolyPts.length;
        const pLast = WP.activePolyPts[polyCount - 1];
        const pLastScreen = toScreen(pLast);
        const camPosWC = (camera && camera.positionWC) ? camera.positionWC : ((camera && camera.position) ? camera.position : null);
        const camDirWC = (camera && camera.directionWC) ? camera.directionWC : ((camera && camera.direction) ? camera.direction : null);
        const isLastFront = pLastScreen && camPosWC && camDirWC && Cesium.Cartesian3.dot(Cesium.Cartesian3.subtract(pLast, camPosWC, new Cesium.Cartesian3()), camDirWC) > 0;

        const curMouseX = (typeof _triadMouseX === 'number') ? _triadMouseX : (triadState.x || (window.innerWidth / 2));
        const curMouseY = (typeof _triadMouseY === 'number') ? _triadMouseY : (triadState.y || (window.innerHeight / 2));

        let isSnapClose = false;
        let snapTargetX = curMouseX;
        let snapTargetY = curMouseY;
        let p0Screen = null;

        if (polyCount >= 3) {
          const p0 = WP.activePolyPts[0];
          p0Screen = toScreen(p0);
          const isP0Front = p0Screen && camPosWC && camDirWC && Cesium.Cartesian3.dot(Cesium.Cartesian3.subtract(p0, camPosWC, new Cesium.Cartesian3()), camDirWC) > 0;
          if (isP0Front && p0Screen) {
            const distToP0 = Math.hypot(curMouseX - p0Screen.x, curMouseY - p0Screen.y);
            if (distToP0 <= 30) {
              isSnapClose = true;
              snapTargetX = p0Screen.x;
              snapTargetY = p0Screen.y;
            }
          }
        }

        // Actualizar snapTarget en triadState para compatibilidad directa de clics en escena
        if (typeof triadState !== 'undefined' && triadState) {
          if (isSnapClose) {
            triadState.snapTarget = { pos: WP.activePolyPts[0], type: 'CLOSE_VTX' };
          } else if (triadState.snapTarget && triadState.snapTarget.type === 'CLOSE_VTX') {
            triadState.snapTarget = null;
          }
        }

        // Conmutar cursor visual del canvas de Cesium: pointer si hace snap de cierre, crosshair si dibuja normal
        if (scene && scene.canvas) {
          scene.canvas.style.cursor = isSnapClose ? 'pointer' : 'crosshair';
        }

        // 1. Línea elástica viva (rubber-band) desde el último vértice
        if (isLastFront) {
          triadCtx.save();
          triadCtx.beginPath();
          triadCtx.moveTo(pLastScreen.x, pLastScreen.y);
          triadCtx.lineTo(snapTargetX, snapTargetY);

          if (isSnapClose) {
            // Imantación a P0 para cierre de polilínea: verde esmeralda brillante sólido
            triadCtx.strokeStyle = "#10B981";
            triadCtx.lineWidth = 3.5;
            triadCtx.shadowColor = "#10B981";
            triadCtx.shadowBlur = 10;
            triadCtx.setLineDash([]);
          } else {
            // Guía al cursor: ámbar discreto punteado
            triadCtx.strokeStyle = "#F59E0B";
            triadCtx.lineWidth = 2.5;
            triadCtx.shadowColor = "#F59E0B";
            triadCtx.shadowBlur = 6;
            triadCtx.setLineDash([6, 4]);
          }
          triadCtx.stroke();
          triadCtx.restore();
        }

        // 2. Diana de Snap Magnético sobre el punto de inicio P0 (Opción 1: sin mini-badge ni textos flotantes)
        if (isSnapClose && p0Screen) {
          triadCtx.save();

          // Halo circular exterior pulsante con resplandor
          const pulseR = 16 + 2.5 * Math.sin(animNow * 0.008);
          triadCtx.beginPath();
          triadCtx.arc(p0Screen.x, p0Screen.y, pulseR, 0, Math.PI * 2);
          triadCtx.fillStyle = "rgba(16, 185, 129, 0.22)";
          triadCtx.fill();
          triadCtx.strokeStyle = "#10B981";
          triadCtx.lineWidth = 2.5;
          triadCtx.shadowColor = "#10B981";
          triadCtx.shadowBlur = 12;
          triadCtx.stroke();

          // Anillo interior blanco de contraste CAD
          triadCtx.beginPath();
          triadCtx.arc(p0Screen.x, p0Screen.y, 7, 0, Math.PI * 2);
          triadCtx.strokeStyle = "#FFFFFF";
          triadCtx.lineWidth = 2.0;
          triadCtx.shadowBlur = 0;
          triadCtx.stroke();

          // Núcleo central sólido esmeralda
          triadCtx.beginPath();
          triadCtx.arc(p0Screen.x, p0Screen.y, 3.5, 0, Math.PI * 2);
          triadCtx.fillStyle = "#10B981";
          triadCtx.fill();

          // Cruz reticular sutil de precisión
          triadCtx.beginPath();
          triadCtx.moveTo(p0Screen.x - pulseR - 4, p0Screen.y);
          triadCtx.lineTo(p0Screen.x - 8, p0Screen.y);
          triadCtx.moveTo(p0Screen.x + 8, p0Screen.y);
          triadCtx.lineTo(p0Screen.x + pulseR + 4, p0Screen.y);
          triadCtx.moveTo(p0Screen.x, p0Screen.y - pulseR - 4);
          triadCtx.lineTo(p0Screen.x, p0Screen.y - 8);
          triadCtx.moveTo(p0Screen.x, p0Screen.y + 8);
          triadCtx.lineTo(p0Screen.x, p0Screen.y + pulseR + 4);
          triadCtx.strokeStyle = "#10B981";
          triadCtx.lineWidth = 1.5;
          triadCtx.stroke();

          triadCtx.restore();

          // Mantener la animación pulsante fluida mientras el cursor permanezca en snap
          if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => {
              if (typeof renderTriad2D === 'function') renderTriad2D();
            });
          }
        }
      } catch(ePolyRubber) {
        console.warn("[PolyRubberBand] error:", ePolyRubber);
      }
    }

    const hasUniversalTarget = (typeof window.getUniversalSelectedTarget === "function") && !!window.getUniversalSelectedTarget();
    if (triadState.active && triadState.pos3D && !hasUniversalTarget) {
    try {
      const origin3D = triadState.pos3D;
      let pOrigin = toScreen(origin3D);
      if (!pOrigin || typeof pOrigin.x !== "number") {
        pOrigin = { x: triadState.x || _triadMouseX || (window.innerWidth / 2), y: triadState.y || _triadMouseY || (window.innerHeight / 2) };
      }

      const ox = pOrigin.x;
      const oy = pOrigin.y;

      // ESCALADO INVERSO A LA DISTANCIA DE LA CAMARA
      const dist = Math.max(5.0, triadState.camDist || 50);
      const distScaleFactor = Math.min(1.85, Math.max(0.55, Math.sqrt(50.0 / dist)));
      const userScale = (triadState.scale || 1.0) * distScaleFactor;
      const armLenMeters = Math.max(dist * 0.05, 1.0) * userScale;

      const xAxis = triadState.xAxis || Cesium.Cartesian3.UNIT_X;
      const yAxis = triadState.yAxis || Cesium.Cartesian3.UNIT_Y;
      const zAxis = triadState.zAxis || Cesium.Cartesian3.UNIT_Z;

      // Extremos 3D reales
      const tipX3D = Cesium.Cartesian3.add(origin3D, Cesium.Cartesian3.multiplyByScalar(xAxis, armLenMeters, new Cesium.Cartesian3()), new Cesium.Cartesian3());
      const tipY3D = Cesium.Cartesian3.add(origin3D, Cesium.Cartesian3.multiplyByScalar(yAxis, armLenMeters, new Cesium.Cartesian3()), new Cesium.Cartesian3());
      const tipZ3D = Cesium.Cartesian3.add(origin3D, Cesium.Cartesian3.multiplyByScalar(zAxis, armLenMeters, new Cesium.Cartesian3()), new Cesium.Cartesian3());

      // Proyecciones 2D en pantalla
      let pX = toScreen(tipX3D);
      let pY = toScreen(tipY3D);
      let pZ = toScreen(tipZ3D);

      if (!pX || pX.x === undefined) pX = { x: ox + 45 * userScale, y: oy };
      if (!pY || pY.y === undefined) pY = { x: ox, y: oy - 45 * userScale };
      if (!pZ || pZ.x === undefined) pZ = { x: ox - 32 * userScale, y: oy + 32 * userScale };

      // 1. DIANA / RETICULA CENTRAL DE IMPACTO
      triadCtx.beginPath();
      triadCtx.arc(ox, oy, 12 * userScale, 0, 2 * Math.PI);
      triadCtx.strokeStyle = triadState.snapTarget ? "#10B981" : "rgba(255, 255, 255, 0.65)";
      triadCtx.lineWidth = triadState.snapTarget ? 2.5 : 1.5;
      triadCtx.setLineDash([4, 3]);
      triadCtx.stroke();
      triadCtx.setLineDash([]);

      // 2. DIBUJAR EJES 2D PROYECTADOS (X: Rojo, Y: Verde, Z: Azul/Normal)
      drawProjectedTriadAxis(ox, oy, pX, "#EF4444", "X", userScale);
      drawProjectedTriadAxis(ox, oy, pY, "#22C55E", "Y", userScale);
      drawProjectedTriadAxis(ox, oy, pZ, "#3B82F6", "Z", userScale);

      // Centroide / Punto de contacto
      triadCtx.beginPath();
      triadCtx.arc(ox, oy, 4.5 * userScale, 0, 2 * Math.PI);
      triadCtx.fillStyle = triadState.snapTarget ? "#10B981" : "#FFFFFF";
      triadCtx.fill();
      triadCtx.lineWidth = 1.5;
      triadCtx.strokeStyle = "#0F172A";
      triadCtx.stroke();



      // 3. BADGE FLOTANTE HUD CON INFORMACION DE LA ESCENA
      const heightM = triadState.cachedAltM || 0;

      const badgeLines = [];
      if (triadState.snapTarget) {
        badgeLines.push(triadState.snapTarget.label);
      } else if (typeof WP !== "undefined" && WP && WP.mode === "define-plane") {
        const pCount = (WP.planePts ? WP.planePts.length : 0);
        if (pCount === 1 && triadState.pos3D && WP.planePts[0]) {
          const d1 = Cesium.Cartesian3.distance(WP.planePts[0], triadState.pos3D);
          badgeLines.push("🎯 DEFINIR PLANO · P1 ➡️ P2: " + d1.toFixed(2) + " m");
        } else if (pCount === 2 && triadState.pos3D && WP.planePts[1]) {
          const d2 = Cesium.Cartesian3.distance(WP.planePts[1], triadState.pos3D);
          badgeLines.push("🎯 DEFINIR PLANO · P2 ➡️ P3: " + d2.toFixed(2) + " m");
        } else {
          badgeLines.push("🎯 DEFINIR PLANO · CLIC PUNTO " + (pCount + 1) + "/3");
        }
      }
      // Línea 1 eliminada según requerimientos.
      // Línea 2: Altitud cacheada y distancia
      badgeLines.push("📏 Alt: " + heightM.toFixed(1) + "m · Dist: " + dist.toFixed(0) + "m");
      // Línea 3 eliminada según requerimientos.

      triadCtx.font = "bold 11px sans-serif";
      let maxWidth = 0;
      badgeLines.forEach(l => {
        const w = triadCtx.measureText(l).width;
        if (w > maxWidth) maxWidth = w;
      });

      const badgeX = ox + 35 * userScale;
      const badgeY = oy - (badgeLines.length * 18) * userScale;
      const badgeH = badgeLines.length * 18 + 10;
      const badgeW = maxWidth + 20;

      triadCtx.fillStyle = "rgba(15, 23, 42, 0.92)";
      triadCtx.strokeStyle = triadState.snapTarget ? "#10B981" : ((typeof WP !== "undefined" && WP && WP.mode === "define-plane") ? "rgba(245, 158, 11, 0.9)" : "rgba(56, 189, 248, 0.8)");
      triadCtx.lineWidth = 1.5;
      triadCtx.beginPath();
      if (triadCtx.roundRect) {
        triadCtx.roundRect(badgeX, badgeY, badgeW, badgeH, 6);
      } else {
        triadCtx.rect(badgeX, badgeY, badgeW, badgeH);
      }
      triadCtx.fill();
      triadCtx.stroke();

      badgeLines.forEach((line, i) => {
        triadCtx.fillStyle = (i === 0 && triadState.snapTarget) ? "#34D399" : (i === 0 && typeof WP !== "undefined" && WP && WP.mode === "define-plane" ? "#FBBF24" : "#E2E8F0");
        triadCtx.fillText(line, badgeX + 10, badgeY + 16 + i * 18);
      });
    } catch(_triadErr) { console.warn("[Triad] triad block error:", _triadErr); }
    }

    const _drawnAABBs = []; // Cajas 2D delimitadoras para evitar pisado entre etiquetas

    // ── ETIQUETAS 2D DE PLANOS DE TRABAJO (VISIBLES ON-HOVER CON FADE IN 150ms / FADE OUT 300ms) ──
    if (typeof window !== "undefined" && window.areLabelsVisible !== false && typeof WP !== "undefined" && WP && Array.isArray(WP.planes) && WP.planes.length > 0) {
      try {
        const currentCamera = typeof viewer !== 'undefined' && viewer ? viewer.camera : (window.viewer ? window.viewer.camera : null);
        const camPos = (currentCamera && currentCamera.positionWC) ? currentCamera.positionWC : ((currentCamera && currentCamera.position) ? currentCamera.position : null);
        WP.planes.forEach((pl, idx) => {
          if (!pl || !pl.pts3D || pl.pts3D.length < 3) return;
          const isActive = (idx === WP.activePlaneIdx);
          
          // Calcular baricentro geométrico (P1+P2+P3)/3
          const p1 = pl.pts3D[0], p2 = pl.pts3D[1], p3 = pl.pts3D[2];
          const center3D = new Cesium.Cartesian3(
            (p1.x + p2.x + p3.x) / 3.0,
            (p1.y + p2.y + p3.y) / 3.0,
            (p1.z + p2.z + p3.z) / 3.0
          );

          // Comprobar si el punto está frente a la cámara
          if (camPos && pl.normal) {
            const toCam = Cesium.Cartesian3.subtract(camPos, center3D, new Cesium.Cartesian3());
            // Si el faldón mira en dirección contraria a la cámara (> 90°), no dibujar para no saturar
            if (Cesium.Cartesian3.dot(pl.normal, toCam) < -0.1) return;
          }

          const sPt = toScreen(center3D);
          if (!sPt || typeof sPt.x !== "number") return;
          if (sPt.x < -100 || sPt.x > window.innerWidth + 100 || sPt.y < -50 || sPt.y > window.innerHeight + 50) return;

          // ── EVALUACIÓN HOVER DEL PLANO DE TRABAJO ──
          const plKey = 'wp_plane_' + (pl.id || idx);
          let isHovered = false;
          if (window.forceShowAllLabels) {
            isHovered = true;
          } else {
            // 1. Cursor dentro del triángulo proyectado del plano en pantalla
            const p1s = toScreen(p1), p2s = toScreen(p2), p3s = toScreen(p3);
            if (p1s && p2s && p3s && _isPointInScreenPolygon(hoverMouseX, hoverMouseY, [p1s, p2s, p3s])) {
              isHovered = true;
            }
            // 2. Proximidad al centroide del plano
            if (!isHovered && Math.hypot(hoverMouseX - sPt.x, hoverMouseY - sPt.y) <= 45) {
              isHovered = true;
            }
            // 3. Cursor sobre la caja de la propia etiqueta
            const prevState = _labelHoverStates.get(plKey);
            if (!isHovered && prevState && prevState.box && _isCursorInBox(hoverMouseX, hoverMouseY, prevState.box, 8)) {
              isHovered = true;
            }
          }

          const hState = _updateLabelHoverAlpha(plKey, isHovered, animNow);
          if (hState.alpha <= 0.005) return; // Zero Clutter en reposo

          const tiltStr = (typeof pl.tiltDeg === "number" ? pl.tiltDeg.toFixed(1) : "0.0") + "°";
          const cardStr = (typeof getAzimuthCardinal === "function" && typeof pl.azimuthDeg === "number") 
            ? getAzimuthCardinal(pl.azimuthDeg) 
            : "S";
          const titleStr = isActive 
            ? ("📏 " + tiltStr + " · " + cardStr)
            : ("Plano #" + (idx + 1) + " · " + tiltStr);

          triadCtx.save();
          triadCtx.globalAlpha = hState.alpha;
          triadCtx.font = isActive ? "bold 11px sans-serif" : "bold 10px sans-serif";
          const textW = triadCtx.measureText(titleStr).width;
          const padX = 8;
          const padY = 5;
          const boxW = textW + padX * 2;
          const boxH = 22;
          let boxX = sPt.x - boxW / 2;
          let boxY = sPt.y - boxH / 2;

          // Anti-solapamiento AABB
          for (let b = 0; b < _drawnAABBs.length; b++) {
            const prev = _drawnAABBs[b];
            if (boxX < prev.x + prev.w && boxX + boxW > prev.x &&
                boxY < prev.y + prev.h && boxY + boxH > prev.y) {
              boxY = prev.y - boxH - 4; // Desplazar hacia arriba para no pisarse
            }
          }
          if (hState.alpha > 0.1) {
            _drawnAABBs.push({ x: boxX, y: boxY, w: boxW, h: boxH });
          }
          hState.box = { x: boxX, y: boxY, w: boxW, h: boxH };

          // Fondo badge translúcido AAA
          triadCtx.fillStyle = isActive ? "rgba(15, 23, 42, 0.88)" : "rgba(15, 23, 42, 0.72)";
          triadCtx.strokeStyle = isActive ? "rgba(56, 189, 248, 0.85)" : "rgba(148, 163, 184, 0.4)";
          triadCtx.lineWidth = isActive ? 1.5 : 1.0;
          triadCtx.shadowColor = "rgba(0, 0, 0, 0.6)";
          triadCtx.shadowBlur = isActive ? 8 : 4;

          triadCtx.beginPath();
          if (triadCtx.roundRect) {
            triadCtx.roundRect(boxX, boxY, boxW, boxH, 5);
          } else {
            triadCtx.rect(boxX, boxY, boxW, boxH);
          }
          triadCtx.fill();
          triadCtx.shadowBlur = 0;
          triadCtx.stroke();

          // Texto
          triadCtx.fillStyle = isActive ? "#38BDF8" : "#E2E8F0";
          triadCtx.textAlign = "center";
          triadCtx.textBaseline = "middle";
          triadCtx.fillText(titleStr, boxX + boxW / 2, boxY + boxH / 2 + 0.5);
          triadCtx.restore();
        });
      } catch(_badgeErr) {
        console.warn("[Triad] planes badges 2D error:", _badgeErr);
      }
    }

    // ── ETIQUETAS 2D GLOBALES REGISTRADAS (addLabelEntity / labels2DRegistry) ──
    if (typeof window !== "undefined" && window.areLabelsVisible !== false && Array.isArray(window.labels2DRegistry) && window.labels2DRegistry.length > 0) {
      try {
        const currentCamera = typeof viewer !== 'undefined' && viewer ? viewer.camera : (window.viewer ? window.viewer.camera : null);
        const camPos = (currentCamera && currentCamera.positionWC) ? currentCamera.positionWC : ((currentCamera && currentCamera.position) ? currentCamera.position : null);
        const curStep = (typeof wpCurrentStep !== "undefined") ? wpCurrentStep : ((typeof currentStep !== "undefined") ? currentStep : 1);

        window.labels2DRegistry.forEach(item => {
          if (!item || !item.show || !item.position) return;

          // 1. LOD Contextual por Fase: Si estamos en diseño de plano o polígono (Pasos 1 o 2), ocultar cables DC/AC para no saturar
          if (curStep < 3 && item.opts && item.opts.category === "cable") return;

          const pos3D = (typeof item.position === "function") ? item.position() : item.position;
          if (!pos3D) return;

          // Frustum Culling & Distancia a cámara
          if (camPos) {
            const dist = Cesium.Cartesian3.distance(camPos, pos3D);
            if (item.opts && item.opts.maxDist && dist > item.opts.maxDist) return;
            if (dist > 350) return; // Culling por distancia máxima estándar
          }

          const sPt = toScreen(pos3D);
          if (!sPt || typeof sPt.x !== "number") return;
          if (sPt.x < -120 || sPt.x > window.innerWidth + 120 || sPt.y < -60 || sPt.y > window.innerHeight + 60) return;

          const offY = (item.pixelOffsetY !== undefined) ? item.pixelOffsetY : -18;
          const anchorY = sPt.y + offY;

          const text = (typeof item.text === "function") ? item.text() : (item.text || "");
          if (!text) return;

          // ── DETERMINAR SI LA ETIQUETA ES DE TIPO HOVER (FALDÓN, CUADRO ELÉCTRICO, PLANO, CABLE) ──
          const itemCat = (item.opts && item.opts.category) ? item.opts.category : '';
          const isRoof = itemCat === 'roof' || /FALD[OÓ]N/i.test(text);
          const isElectrical = itemCat === 'electrical' || /CUADRO|INVERSOR|COMBINER|CONTADOR|CGMP|PROTECCI[OÓ]N/i.test(text);
          const isPlane = itemCat === 'plane' || /PLANO ACTIVO/i.test(text);
          const isCable = itemCat === 'cable';
          const isHoverOnly = isRoof || isElectrical || isPlane || isCable || (item.opts && item.opts.inspectOnHover);

          const itemKey = item.id || ('lbl_' + text.substring(0, 16));
          let isHovered = false;

          if (window.forceShowAllLabels || !isHoverOnly) {
            isHovered = true;
          } else {
            const prevState = _labelHoverStates.get(itemKey);

            // A) Si el cursor está sobre la propia caja de la etiqueta
            if (prevState && prevState.box && _isCursorInBox(hoverMouseX, hoverMouseY, prevState.box, 8)) {
              isHovered = true;
            }

            // B) Detección según categoría
            if (!isHovered && isRoof) {
              // 1. Proximidad al punto ancla del badge del faldón
              if (Math.hypot(hoverMouseX - sPt.x, hoverMouseY - anchorY) <= 45 || Math.hypot(hoverMouseX - sPt.x, hoverMouseY - sPt.y) <= 45) {
                isHovered = true;
              }
              // 2. O cursor dentro del polígono del faldón en pantalla
              if (!isHovered && typeof WP !== 'undefined' && WP && WP.polylines) {
                let targetPoly = null;
                if (item.opts && item.opts.polyIdx !== undefined && WP.polylines[item.opts.polyIdx]) {
                  targetPoly = WP.polylines[item.opts.polyIdx];
                } else {
                  const m = text.match(/FALD[OÓ]N\s*#(\d+)/i);
                  if (m) {
                    const idx = parseInt(m[1], 10) - 1;
                    targetPoly = WP.polylines[idx];
                  }
                }
                if (targetPoly && (targetPoly.pts3D || targetPoly.pts)) {
                  const pts = targetPoly.pts3D || targetPoly.pts;
                  const sPolyPts = pts.map(p => toScreen(p)).filter(Boolean);
                  if (sPolyPts.length >= 3 && _isPointInScreenPolygon(hoverMouseX, hoverMouseY, sPolyPts)) {
                    isHovered = true;
                  }
                }
              }
            } else if (!isHovered && isElectrical) {
              // Proximidad al equipo 3D o al ancla de su etiqueta o al pasillo entre ambos
              const dBase = Math.hypot(hoverMouseX - sPt.x, hoverMouseY - sPt.y);
              const dAnchor = Math.hypot(hoverMouseX - sPt.x, hoverMouseY - anchorY);
              const inCorridor = Math.abs(hoverMouseX - sPt.x) <= 32 &&
                hoverMouseY >= Math.min(sPt.y, anchorY) - 12 &&
                hoverMouseY <= Math.max(sPt.y, anchorY) + 12;
              if (dBase <= 42 || dAnchor <= 36 || inCorridor) {
                isHovered = true;
              }
            } else if (!isHovered && isPlane) {
              // Proximidad al origen del plano
              if (Math.hypot(hoverMouseX - sPt.x, hoverMouseY - sPt.y) <= 45) {
                isHovered = true;
              }
            } else if (!isHovered && isCable) {
              // Proximidad al tramo del cable (40px)
              if (Math.hypot(hoverMouseX - sPt.x, hoverMouseY - anchorY) <= 40) {
                isHovered = true;
              }
            }
          }

          const hState = _updateLabelHoverAlpha(itemKey, isHovered, animNow);
          if (hState.alpha <= 0.005) return; // Zero Clutter en reposo

          const lines = text.split("\n");
          triadCtx.save();
          triadCtx.globalAlpha = hState.alpha;
          const font = (item.opts && item.opts.font) ? item.opts.font : "bold 10px 'JetBrains Mono', monospace";
          triadCtx.font = font;

          let maxLineW = 0;
          lines.forEach(l => {
            const w = triadCtx.measureText(l).width;
            if (w > maxLineW) maxLineW = w;
          });

          const padX = (item.opts && item.opts.padX !== undefined) ? item.opts.padX : 7;
          const lineH = 14;
          const padY = 4;
          const boxW = maxLineW + padX * 2;
          const boxH = lines.length * lineH + padY * 2;

          let boxX = sPt.x - boxW / 2;
          let boxY = anchorY - boxH / 2;

          // Comprobación AABB anti-solapamiento (evitar que se pisen entre sí las etiquetas visibles)
          for (let b = 0; b < _drawnAABBs.length; b++) {
            const prev = _drawnAABBs[b];
            if (boxX < prev.x + prev.w && boxX + boxW > prev.x &&
                boxY < prev.y + prev.h && boxY + boxH > prev.y) {
              boxY = prev.y - boxH - 4; // Desplazar hacia arriba para no pisar la etiqueta anterior
            }
          }
          if (hState.alpha > 0.1) {
            _drawnAABBs.push({ x: boxX, y: boxY, w: boxW, h: boxH });
          }
          hState.box = { x: boxX, y: boxY, w: boxW, h: boxH };

          // Fondo
          triadCtx.fillStyle = (item.opts && item.opts.bg) ? item.opts.bg : "rgba(15, 23, 42, 0.90)";
          triadCtx.strokeStyle = (item.opts && item.opts.borderColor) ? item.opts.borderColor : "rgba(56, 189, 248, 0.75)";
          triadCtx.lineWidth = 1.2;
          triadCtx.shadowColor = "rgba(0, 0, 0, 0.55)";
          triadCtx.shadowBlur = 6;

          triadCtx.beginPath();
          if (triadCtx.roundRect) {
            triadCtx.roundRect(boxX, boxY, boxW, boxH, 4.5);
          } else {
            triadCtx.rect(boxX, boxY, boxW, boxH);
          }
          triadCtx.fill();
          triadCtx.shadowBlur = 0;
          triadCtx.stroke();

          // Renderizar líneas
          triadCtx.fillStyle = (item.opts && item.opts.textColor) ? item.opts.textColor : "#FFFFFF";
          triadCtx.textAlign = "center";
          triadCtx.textBaseline = "middle";
          lines.forEach((l, li) => {
            const ly = boxY + padY + lineH * (li + 0.5);
            triadCtx.fillText(l, boxX + boxW / 2, ly);
          });
          triadCtx.restore();
        });
      } catch(_lblRegErr) {
        console.warn("[Triad] labels2DRegistry error:", _lblRegErr);
      }
    }

    // 🌟 GIZMO UNIVERSAL 3D: Se dibuja SIEMPRE encima de todo lo demás
    if (typeof window.renderUniversalGizmo2D === "function" && typeof window.getUniversalSelectedTarget === "function") {
      try {
        const _uTarget = window.getUniversalSelectedTarget();
        if (_uTarget) {
          window.renderUniversalGizmo2D();
        }
      } catch(_e) { console.warn("[Triad] renderUniversalGizmo2D error:", _e); }
    }

    // 🔄 REFRESH AUTOMÁTICO rAF SI HAY TRANSICIONES ACTIVAS (FADE IN 150ms / FADE OUT 300ms)
    if (_hasHoverFadeTransitions) {
      _requestHoverFadeNextFrame();
    }
  } catch(err) {
    console.error("[Triad] renderTriad2D error:", err);
  }
}

function drawProjectedTriadAxis(ox, oy, pTip, color, label, scale) {
  let dx = 38 * scale;
  let dy = 0;
  if (pTip && (typeof pTip.x === "number")) {
    const rawDx = pTip.x - ox;
    const rawDy = pTip.y - oy;
    const rawLen = Math.sqrt(rawDx * rawDx + rawDy * rawDy);
    if (rawLen > 0.5) {
      const fixedLen = 42 * scale;
      dx = (rawDx / rawLen) * fixedLen;
      dy = (rawDy / rawLen) * fixedLen;
    }
  }

  const tx = ox + dx;
  const ty = oy + dy;

  triadCtx.beginPath();
  triadCtx.moveTo(ox, oy);
  triadCtx.lineTo(tx, ty);
  triadCtx.strokeStyle = color;
  triadCtx.lineWidth = Math.max(2.5, 3.2 * scale);
  triadCtx.lineCap = "round";
  triadCtx.stroke();

  const angle = Math.atan2(dy, dx);
  const headLen = Math.max(8, 10 * scale);
  triadCtx.beginPath();
  triadCtx.moveTo(tx, ty);
  triadCtx.lineTo(tx - headLen * Math.cos(angle - Math.PI / 6), ty - headLen * Math.sin(angle - Math.PI / 6));
  triadCtx.lineTo(tx - headLen * Math.cos(angle + Math.PI / 6), ty - headLen * Math.sin(angle + Math.PI / 6));
  triadCtx.closePath();
  triadCtx.fillStyle = color;
  triadCtx.fill();
}

function cursorGizmoSurfaceNormal(winPos, anchor) {
  const currentScene = typeof viewer !== 'undefined' && viewer ? viewer.scene : (window.viewer ? window.viewer.scene : null);
  if (!currentScene || !currentScene.canvas) return null;
  const w = currentScene.canvas.clientWidth;
  const h = currentScene.canvas.clientHeight;

  const pCenter = anchor || get3DPosition(winPos);
  if (!Cesium.defined(pCenter)) return null;

  // 1. Muestreo rapido por diferencias finitas en cruz (±6px)
  try {
    const delta = 6;
    const pR = get3DPosition({ x: Math.min(w - 1, winPos.x + delta), y: winPos.y });
    const pL = get3DPosition({ x: Math.max(0, winPos.x - delta), y: winPos.y });
    const pD = get3DPosition({ x: winPos.x, y: Math.min(h - 1, winPos.y + delta) });
    const pU = get3DPosition({ x: winPos.x, y: Math.max(0, winPos.y - delta) });

    let vH = null;
    if (Cesium.defined(pR) && Cesium.defined(pL)) {
      vH = Cesium.Cartesian3.subtract(pR, pL, new Cesium.Cartesian3());
    }
    let vV = null;
    if (Cesium.defined(pD) && Cesium.defined(pU)) {
      vV = Cesium.Cartesian3.subtract(pD, pU, new Cesium.Cartesian3());
    }

    if (vH && vV && Cesium.Cartesian3.magnitude(vH) > 0.005 && Cesium.Cartesian3.magnitude(vV) > 0.005) {
      const n = Cesium.Cartesian3.cross(vH, vV, new Cesium.Cartesian3());
      if (Cesium.Cartesian3.magnitude(n) > 1e-6) {
        const currentCamera = typeof viewer !== 'undefined' && viewer ? viewer.camera : (window.viewer ? window.viewer.camera : null);
        const camPos = (currentCamera && currentCamera.positionWC) ? currentCamera.positionWC : ((currentCamera && currentCamera.position) ? currentCamera.position : null);
        if (camPos) {
          const toCam = Cesium.Cartesian3.subtract(camPos, pCenter, new Cesium.Cartesian3());
          if (Cesium.Cartesian3.dot(n, toCam) < 0) Cesium.Cartesian3.negate(n, n);
        }
        return Cesium.Cartesian3.normalize(n, new Cesium.Cartesian3());
      }
    }
  } catch (e) {}

  // 2. Normal del plano activo si existe
  const activePl = (typeof wpGetActivePlane === "function") ? wpGetActivePlane() : null;
  if (activePl && activePl.normal) return Cesium.Cartesian3.clone(activePl.normal);

  // 3. Fallback: normal radial del elipsoide
  return Cesium.Cartesian3.normalize(pCenter, new Cesium.Cartesian3());
}

function wpRayPlane(ray, plane) {
  if (!ray || !plane || !plane.normal) return null;
  const denom = Cesium.Cartesian3.dot(ray.direction, plane.normal);
  if (Math.abs(denom) < 1e-8) return null;
  const t = Cesium.Cartesian3.dot(
    Cesium.Cartesian3.subtract(plane.origin, ray.origin, new Cesium.Cartesian3()),
    plane.normal
  ) / denom;
  if (t < 0) return null; // El rayo solo viaja hacia adelante (descartar detrás de la cámara)
  return Cesium.Cartesian3.add(
    ray.origin,
    Cesium.Cartesian3.multiplyByScalar(ray.direction, t, new Cesium.Cartesian3()),
    new Cesium.Cartesian3()
  );
}

function wpProjectPointToActivePlane(p3D) {
  const plane = wpGetActivePlane();
  if (!plane) return p3D;
  const diff = Cesium.Cartesian3.subtract(p3D, plane.origin, new Cesium.Cartesian3());
  const dist = Cesium.Cartesian3.dot(diff, plane.normal);
  return Cesium.Cartesian3.subtract(
    p3D,
    Cesium.Cartesian3.multiplyByScalar(plane.normal, dist, new Cesium.Cartesian3()),
    new Cesium.Cartesian3()
  );
}

function wpRestoreCameraNavigation() {
  const currentViewer = typeof viewer !== 'undefined' && viewer ? viewer : (window.viewer || null);
  const currentScene = currentViewer ? currentViewer.scene : null;
  if (currentScene && currentScene.screenSpaceCameraController) {
    const sscc = currentScene.screenSpaceCameraController;
    sscc.enableRotate = true;
    sscc.enableTranslate = true;
    sscc.enableZoom = true;
    sscc.enableTilt = true;
    sscc.enableLook = false;
  }
}
window.wpRestoreCameraNavigation = wpRestoreCameraNavigation;

function wpSetMode(mode) {
  WP.mode = mode;
  if (typeof reset3DPositionCache === 'function') reset3DPositionCache();
  const currentScene = typeof viewer !== 'undefined' && viewer ? viewer.scene : (window.viewer ? window.viewer.scene : null);
  if (currentScene && currentScene.screenSpaceCameraController) {
    const sscc = currentScene.screenSpaceCameraController;
    if (mode === 'idle') {
      cursorGizmoHide();
      if (currentScene && currentScene.canvas) {
        currentScene.canvas.style.cursor = 'default';
      }
      sscc.enableRotate = true;
      sscc.enableTranslate = true;
      sscc.enableZoom = true;
      sscc.enableTilt = true;
      sscc.enableLook = false;
      if (typeof wpAutoRestoreSolarHUD === 'function') wpAutoRestoreSolarHUD('mode-idle');
    } else {
      // En modos interactivos (dibujo, definición de plano), el paneo y órbita permanecen
      // activos para permitir al usuario navegar libremente por el faldón o escena 3D.
      sscc.enableRotate = true;
      sscc.enableTranslate = true;
      sscc.enableZoom = true;
      sscc.enableTilt = true;
      if (typeof wpAutoMinimizeSolarHUD === 'function') wpAutoMinimizeSolarHUD('mode-active');
    }
  }

  wpUpdateUI();
}

function wpGetActivePlane() {
  if (WP.activePlaneIdx >= 0 && WP.activePlaneIdx < WP.planes.length) {
    return WP.planes[WP.activePlaneIdx];
  }
  return null;
}

function wpSelectActivePlane(idx, shouldFly) {
  if (idx >= 0 && idx < WP.planes.length) {
    WP.activePlaneIdx = idx;

    // 1. Sincronizar automáticamente la polilínea/faldón activo al primer faldón perteneciente a este plano
    if (Array.isArray(WP.polylines) && WP.polylines.length > 0) {
      let matchPolyIdx = WP.polylines.findIndex(p => p && p.planeIdx === idx);
      // Fallback: si no tiene planeIdx asignado explícitamente, vincular la primera polilínea disponible
      if (matchPolyIdx === -1 && WP.polylines[idx]) {
        WP.polylines[idx].planeIdx = idx;
        matchPolyIdx = idx;
      } else if (matchPolyIdx === -1 && WP.polylines[0]) {
        matchPolyIdx = 0;
      }
      if (matchPolyIdx !== -1) {
        WP.selectedPolyIdx = matchPolyIdx;
        const selP = WP.polylines[matchPolyIdx];
        if (selP && selP.points) {
          polygonPoints = selP.points.map(pt => Cesium.Cartesian3.clone(pt));
        }
      }
    }

    // 2. Renderizar gizmo del plano activo y huellas de planos inactivos
    wpRenderActivePlaneGizmo();

    // 3. Renderizar polilíneas/faldones con su aura y badge 3D actualizados
    if (typeof wpRenderAllPolylines === 'function') {
      wpRenderAllPolylines();
    }

    // 4. Redibujar obstáculos 3D vinculados a este y otros planos
    if (typeof render3DObstaclesInCesium === 'function') {
      render3DObstaclesInCesium();
    }

    // 5. Invalidar caché y regenerar paneles FV de toda la escena
    if (typeof roofPanelsCache !== 'undefined' && roofPanelsCache) {
      roofPanelsCache.sig = '';
      roofPanelsCache.data = null;
    }
    if (typeof wpFastRenderSimulatedPanels === 'function') {
      wpFastRenderSimulatedPanels();
    }

    // 6. Actualizar UI
    wpUpdateUI();

    const pl = WP.planes[idx];
    if (pl && pl.origin && pl.normal) {
      // 7. Enfoque suave de cámara sobre el plano seleccionado (Opción 2)
      const currentCamera = typeof viewer !== 'undefined' && viewer ? viewer.camera : (window.viewer ? window.viewer.camera : null);
      if (shouldFly !== false && currentCamera) {
        try {
          const camHeight = (currentCamera.positionCartographic) ? Math.max(currentCamera.positionCartographic.height, 35.0) : 60.0;
          const targetHeading = currentCamera.heading || 0.0;
          const targetPitch = Cesium.Math.toRadians(-40.0); // Perspectiva isométrica CAD limpia
          const boundingSphere = new Cesium.BoundingSphere(pl.origin, 22.0);

          currentCamera.flyToBoundingSphere(boundingSphere, {
            duration: 1.0,
            offset: new Cesium.HeadingPitchRange(targetHeading, targetPitch, Math.min(camHeight, 55.0))
          });
        } catch(eCam) {
          window.RA && window.RA.log && window.RA.log.warn('[catch silenciado flyTo plane]', eCam);
        }
      }
    }

    if (typeof viewer !== 'undefined' && viewer && viewer.scene && typeof viewer.scene.requestRender === 'function') {
      viewer.scene.requestRender();
    }
    if (typeof ProjectHierarchy !== 'undefined' && ProjectHierarchy.notify) {
      ProjectHierarchy.notify('plane_selected', { index: idx });
    }

    showStatus('<i data-lucide=\"check\" class=\"icon-sm\"></i> ' + pl.name.toUpperCase() + ' ACTIVADO Y ENFOCADO (' + (typeof pl.tiltDeg === 'number' ? pl.tiltDeg.toFixed(1) : '—') + '°)', 2500);
  }
}

// Cálculo de Inclinación y Azimut a partir de 3 Puntos
function wpComputePlaneFrom3Points(p1, p2, p3, axisMode) {
  // Vector normal del plano (geometria pura — siempre igual independiente del modo de ejes)
  const v1 = Cesium.Cartesian3.subtract(p2, p1, new Cesium.Cartesian3());
  const v2 = Cesium.Cartesian3.subtract(p3, p1, new Cesium.Cartesian3());
  const cross = Cesium.Cartesian3.cross(v1, v2, new Cesium.Cartesian3());
  const magCross = Cesium.Cartesian3.magnitude(cross);
  if (magCross < 1e-4) {
    if (typeof showToast === 'function') {
      showToast('PUNTOS COLINEALES', 'Los 3 puntos seleccionados están en línea recta o son idénticos. Selecciona un punto no colineal.', 'warning', 3500);
    }
    return null;
  }
  let normal = Cesium.Cartesian3.multiplyByScalar(cross, 1.0 / magCross, new Cesium.Cartesian3());

  const radial = Cesium.Cartesian3.normalize(p1, new Cesium.Cartesian3());
  if (Cesium.Cartesian3.dot(normal, radial) < 0) {
    normal = Cesium.Cartesian3.negate(normal, new Cesium.Cartesian3());
  }

  // Inclinacion y azimut (solo dependen de la normal — invariantes)
  const east = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.cross(Cesium.Cartesian3.UNIT_Z, radial, new Cesium.Cartesian3()),
    new Cesium.Cartesian3()
  );
  const cosTilt = Math.abs(Cesium.Cartesian3.dot(normal, radial));
  const tiltDeg = Cesium.Math.toDegrees(Math.acos(Cesium.Math.clamp(cosTilt, 0, 1)));
  const northVec = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.cross(radial, east, new Cesium.Cartesian3()),
    new Cesium.Cartesian3()
  );
  const nDotNorth = Cesium.Cartesian3.dot(normal, northVec);
  const nDotEast  = Cesium.Cartesian3.dot(normal, east);
  let azimuthDeg  = Cesium.Math.toDegrees(Math.atan2(nDotEast, nDotNorth));
  azimuthDeg = ((azimuthDeg % 360) + 360) % 360;

  // ─────────────────────────────────────────────────────────────────
  // CALCULO DE EJES LOCALES segun modo de usuario
  // ─────────────────────────────────────────────────────────────────
  const mode = axisMode || (typeof WP !== "undefined" ? WP.axisMode : "auto") || "p1p2";

  let uVec, vVec;

  if (mode === "p1p2") {
    // Opcion B: P1->P2 = Eje X, P2->P3 orienta el Eje Y (esquina de L)
    // X = normalize(P2 - P1)
    uVec = Cesium.Cartesian3.normalize(v1, new Cesium.Cartesian3());
    // Y = projectado al plano la direccion P2->P3, luego perpendicular a X
    const v3 = Cesium.Cartesian3.subtract(p3, p2, new Cesium.Cartesian3());
    // Proyectar v3 sobre el plano (eliminar componente normal)
    const v3ProjN = Cesium.Cartesian3.multiplyByScalar(normal, Cesium.Cartesian3.dot(v3, normal), new Cesium.Cartesian3());
    const v3Plane = Cesium.Cartesian3.subtract(v3, v3ProjN, new Cesium.Cartesian3());
    // Gram-Schmidt: ortogonalizar respecto a uVec
    const v3MinusU = Cesium.Cartesian3.subtract(v3Plane,
      Cesium.Cartesian3.multiplyByScalar(uVec, Cesium.Cartesian3.dot(v3Plane, uVec), new Cesium.Cartesian3()),
      new Cesium.Cartesian3()
    );
    if (Cesium.Cartesian3.magnitude(v3MinusU) > 1e-4) {
      vVec = Cesium.Cartesian3.normalize(v3MinusU, new Cesium.Cartesian3());
    } else {
      // Fallback si P2->P3 es paralelo a P1->P2
      vVec = Cesium.Cartesian3.normalize(
        Cesium.Cartesian3.cross(normal, uVec, new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
      );
    }
    // Asegurar orientacion consistente (Y apunta "hacia arriba" del plano)
    if (Cesium.Cartesian3.dot(vVec, Cesium.Cartesian3.cross(normal, uVec, new Cesium.Cartesian3())) < 0) {
      vVec = Cesium.Cartesian3.negate(vVec, new Cesium.Cartesian3());
    }

  } else if (mode === "p1p3") {
    // Opcion D variante: P1->P3 = Eje X
    uVec = Cesium.Cartesian3.normalize(v2, new Cesium.Cartesian3());
    vVec = Cesium.Cartesian3.normalize(
      Cesium.Cartesian3.cross(normal, uVec, new Cesium.Cartesian3()),
      new Cesium.Cartesian3()
    );

  } else {
    // Auto: usar orientacion cardinal (comportamiento original)
    uVec = Cesium.Cartesian3.cross(normal, Cesium.Cartesian3.UNIT_Z, new Cesium.Cartesian3());
    if (Cesium.Cartesian3.magnitude(uVec) < 1e-4) {
      uVec = Cesium.Cartesian3.cross(normal, Cesium.Cartesian3.UNIT_X, new Cesium.Cartesian3());
    }
    uVec = Cesium.Cartesian3.normalize(uVec, new Cesium.Cartesian3());
    vVec = Cesium.Cartesian3.normalize(
      Cesium.Cartesian3.cross(normal, uVec, new Cesium.Cartesian3()),
      new Cesium.Cartesian3()
    );
  }

  // Origen = P1 (no centroide) — P1 es el origen natural del sistema local
  const origin = Cesium.Cartesian3.clone(p1);
  const d = -Cesium.Cartesian3.dot(normal, origin);

  return { p1, p2, p3, origin, normal, uVec, vVec, d, tiltDeg, azimuthDeg };
}

// Área 3D real de un polígono cerrado (método de Newell)
function wpPolylineArea3D(pts) {
  if (!pts || pts.length < 3) return 0;
  let n = new Cesium.Cartesian3(0, 0, 0);
  for (let i = 0; i < pts.length; i++) {
    const cur = pts[i], nxt = pts[(i + 1) % pts.length];
    n.x += (cur.y - nxt.y) * (cur.z + nxt.z);
    n.y += (cur.z - nxt.z) * (cur.x + nxt.x);
    n.z += (cur.x - nxt.x) * (cur.y + nxt.y);
  }
  return Cesium.Cartesian3.magnitude(n) / 2;
}

// ── 2.1. CREACIÓN Y GESTIÓN DE MÚLTIPLES PLANOS DE TRABAJO ──────────────────
function wpStartDefinePlane() {
  wpSetMode('define-plane');
  WP.planePts = [];
  wpClearEntGroup('planePreview');
  wpUpdateUI();
  showStatus('<i data-lucide=\"target\" class=\"icon-sm\"></i> CREACIÓN DE PLANO: HAZ CLIC EN 3 PUNTOS SOBRE LA CUBIERTA (P1, P2, P3)', 4000);
}

function wpUndoLastPlanePoint() {
  if (typeof WP === 'undefined' || !WP) return false;
  if (WP.mode === 'define-plane' && Array.isArray(WP.planePts) && WP.planePts.length > 0) {
    WP.planePts.pop();
    wpClearEntGroup('planePreview');
    const curViewer = (typeof viewer !== 'undefined' && viewer) ? viewer : (window.viewer || null);
    if (curViewer && curViewer.entities) {
      if (curViewer.entities.getById('wp_plane_preview_pt_1')) curViewer.entities.removeById('wp_plane_preview_pt_1');
      if (curViewer.entities.getById('wp_plane_preview_pt_2')) curViewer.entities.removeById('wp_plane_preview_pt_2');
      if (curViewer.entities.getById('wp_plane_preview_line_1_2')) curViewer.entities.removeById('wp_plane_preview_line_1_2');
    }
    if (WP.planePts.length === 1) {
      const ptEnt = (getAddPointEntity() || addPointEntity)(WP.planePts[0], '#F59E0B', 12, '#FFFFFF', 2.5, 'wp_plane_preview_pt_1');
      WP.ents.planePreview.push(ptEnt);
      showStatus('<i data-lucide="target" class="icon-sm"></i> PUNTO P2 DESHECHO · HAZ CLIC EN EL 2º PUNTO (P2)', 2500);
    } else {
      showStatus('<i data-lucide="target" class="icon-sm"></i> PUNTO P1 DESHECHO · HAZ CLIC EN EL 1er PUNTO (P1)', 2500);
    }
    wpUpdateUI();
    return true;
  }
  return false;
}
window.wpUndoLastPlanePoint = wpUndoLastPlanePoint;

function wpAddPlanePoint(pos3D) {
  if (!pos3D || !Cesium.defined(pos3D)) return;
  const radial = Cesium.Cartesian3.normalize(pos3D, new Cesium.Cartesian3());
  let normal = (triadState && triadState.zAxis) ? triadState.zAxis : radial;
  if (Cesium.Cartesian3.dot(normal, radial) < 0) normal = radial;

  // Elevación de 8 cm sólo para el marcador visual sobre la malla fotogramétrica
  const surfacePos = Cesium.Cartesian3.add(
    pos3D,
    Cesium.Cartesian3.multiplyByScalar(normal, 0.08, new Cesium.Cartesian3()),
    new Cesium.Cartesian3()
  );

  // El modelo matemático del plano almacena la cota física exacta de la superficie
  WP.planePts.push(Cesium.Cartesian3.clone(pos3D));
  const idx = WP.planePts.length;

  const ptId = 'wp_plane_preview_pt_' + idx;
  if (typeof viewer !== 'undefined' && viewer && viewer.entities && viewer.entities.getById(ptId)) {
    viewer.entities.removeById(ptId);
  }
  const ptColor = (idx === 1) ? '#F59E0B' : '#0284C7';
  const ptEnt = (getAddPointEntity() || addPointEntity)(surfacePos, ptColor, 12, '#FFFFFF', 2.5, ptId);
  WP.ents.planePreview.push(ptEnt);

  if (WP.planePts.length === 1) {
    showStatus('<i data-lucide=\"target\" class=\"icon-sm\"></i> PLANO DE TRABAJO: PUNTO P1 FIJADO · HAZ CLIC EN EL 2º PUNTO (P2)', 3500);
    if (typeof showToast === 'function') {
      showToast('PUNTO P1 FIJADO', 'Haz clic sobre el segundo punto (P2) de la cubierta.', 'info', 3000);
    }
  } else if (WP.planePts.length === 2) {
    const lineId = 'wp_plane_preview_line_1_2';
    if (typeof viewer !== 'undefined' && viewer && viewer.entities && viewer.entities.getById(lineId)) {
      viewer.entities.removeById(lineId);
    }
    const lineEnt = viewer.entities.add({
      id: lineId,
      polyline: {
        positions: [WP.planePts[0], WP.planePts[1]],
        width: 4.0,
        arcType: (typeof Cesium !== "undefined" && Cesium.ArcType) ? Cesium.ArcType.NONE : undefined,
        material: new Cesium.ColorMaterialProperty(Cesium.Color.fromCssColorString('#38BDF8')
        ),
        // depthFailMaterial removed,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      }
    });
    WP.ents.planePreview.push(lineEnt);
    showStatus('<i data-lucide=\"target\" class=\"icon-sm\"></i> PLANO DE TRABAJO: P1 y P2 FIJADOS · HAZ CLIC EN EL 3er PUNTO (P3)', 3500);
    if (typeof showToast === 'function') {
      showToast('PUNTOS P1 Y P2 FIJADOS', 'Haz clic sobre el tercer punto (P3) para cerrar el plano.', 'info', 3000);
    }
  } else if (WP.planePts.length >= 3) {
    const planeData = wpComputePlaneFrom3Points(WP.planePts[0], WP.planePts[1], WP.planePts[2]);
    if (!planeData) {
      WP.planePts.pop(); // Retirar P3 colineal para permitir al usuario hacer clic en un punto válido
      return;
    }
    const planeObj = Object.assign({
      id: 'plane_' + Date.now(),
      name: 'Plano Cubierta #' + (WP.planes.length + 1) + ' (' + planeData.tiltDeg.toFixed(0) + '°)',
      pts3D: WP.planePts.slice(0, 3),
      origin: planeData.origin,
      normal: planeData.normal,
      uVec: planeData.uVec,
      vVec: planeData.vVec,
      tiltDeg: planeData.tiltDeg,
      azimuthDeg: planeData.azimuthDeg
    }, planeData);

    if (window.RAundo && typeof window.RAundo.snapPlanes === 'function') window.RAundo.snapPlanes('Crear ' + planeObj.name);
    WP.planes.push(planeObj);
    WP.activePlaneIdx = WP.planes.length - 1;
    WP.planePts = [];
    WP.activePolyPts = [];
    if (typeof polygonPoints !== 'undefined') polygonPoints = [];
    if (typeof window !== 'undefined') window.polygonPoints = [];
    if (typeof triadState !== 'undefined' && triadState) {
      triadState.pos3D = null;
      triadState.snapTarget = null;
    }
    if (typeof reset3DPositionCache === 'function') reset3DPositionCache();
    wpClearEntGroup('planePreview');
    wpClearEntGroup('activePoly');

    wpRenderActivePlaneGizmo();
    wpSetMode('idle');
    if (typeof appMode !== 'undefined') appMode = 'navigate';
    wpUpdateUI();
    if (typeof wpUpdateControlsAvailability === 'function') wpUpdateControlsAvailability();
    if (typeof showToast === 'function') {
      showToast('PLANO CREADO', 'Plano definido con éxito (' + planeData.tiltDeg.toFixed(1) + '°). Ya puedes dibujar polilíneas de cubierta o faldones.', 'success', 4000);
    }
    showStatus('<i data-lucide=\"check\" class=\"icon-sm\"></i> PLANO DE TRABAJO CREADO CON ÉXITO', 3500);
    var axisSel = document.getElementById("wp-axis-mode-selector");
    if (axisSel) axisSel.style.display = "block";
    if (typeof ProjectHierarchy !== 'undefined' && ProjectHierarchy.notify) {
      ProjectHierarchy.notify('plane_added', { plane: planeObj, index: WP.activePlaneIdx });
    }
    if (typeof wpToggleEmplacementSection === 'function') {
      wpToggleEmplacementSection('roof', true);
      const brushPanel = document.getElementById('ra-brush-panel') || document.getElementById('btn-draw-polyline');
      if (brushPanel) brushPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    showStatus('<i data-lucide=\"check\" class=\"icon-sm\"></i> ' + planeObj.name.toUpperCase() + ' FIJADO · PULSA "DIBUJAR POLILÍNEA EN PLANO" PARA TRAZAR', 4500);
  }
  if (typeof viewer !== 'undefined' && viewer && viewer.scene && typeof viewer.scene.requestRender === 'function') viewer.scene.requestRender();
}

function wpRenderActivePlaneGizmo() {
  wpClearEntGroup("activePlaneMarker");
  wpClearEntGroup("inactivePlanes");

  const activePlane = wpGetActivePlane();
  if (!activePlane && (!WP.planes || WP.planes.length === 0)) return;

  // 1. Renderizar planos inactivos (persistentes, sobrios, no se apagan)
  if (Array.isArray(WP.planes)) {
    const showVtx = (WP.showPlaneVertices !== false);
    WP.planes.forEach((p, idx) => {
      if (idx === WP.activePlaneIdx) return; // El plano activo se renderiza con tríada completa abajo
      if (!p || !p.pts3D || p.pts3D.length < 3) return;

      // Superficie sutil translúcida
      const inactTri = addPolygonEntity(p.pts3D, "#64748B", 0.12, 1, "wp_inactive_plane_mesh_" + idx);
      WP.ents.inactivePlanes.push(inactTri);

      if (showVtx) {
        const inactBorder = (getAddPolylineEntity() || addPolylineEntity)([...p.pts3D, p.pts3D[0]], "#94A3B8", 2.0, 0.7, 0.7, "wp_inactive_plane_border_" + idx);
        WP.ents.inactivePlanes.push(inactBorder);

        // Puntos de esquina discretos
        p.pts3D.forEach((pt, ptIdx) => {
          const inactPt = (getAddPointEntity() || addPointEntity)(pt, "#64748B", 6, "#FFFFFF", 1.5, "wp_inactive_plane_vtx_" + idx + "_" + ptIdx);
          WP.ents.inactivePlanes.push(inactPt);
        });
      }

      // La etiqueta del plano se gestiona exclusivamente en 2D sobre el canvas overlay para erradicar z-fighting
    });
  }

  // 2. Renderizar el plano activo con máxima fidelidad
  if (!activePlane || !activePlane.pts3D || activePlane.pts3D.length < 3) return;

  const showVtx = (WP.showPlaneVertices !== false);

  // Triángulo de superficie semitransparente del plano activo
  const tri = addPolygonEntity(activePlane.pts3D, "#38BDF8", 0.22, 2, "wp_active_plane_mesh");
  WP.ents.activePlaneMarker.push(tri);

  if (showVtx) {
    const triBorder = (getAddPolylineEntity() || addPolylineEntity)([...activePlane.pts3D, activePlane.pts3D[0]], "#38BDF8", 3.5, 1.0, 1.0, "wp_active_plane_border");
    WP.ents.activePlaneMarker.push(triBorder);

    // Los 3 Vértices Maestros que definen el Plano (P1: Origen, P2, P3)
    activePlane.pts3D.forEach((pt, idx) => {
      const color = (idx === 0) ? "#F59E0B" : "#0284C7";
      const ptEnt = (getAddPointEntity() || addPointEntity)(pt, color, (idx === 0) ? 14 : 11, "#FFFFFF", 3, "wp_active_plane_vtx_" + idx);
      WP.ents.activePlaneMarker.push(ptEnt);
    });

    const centerPt = (getAddPointEntity() || addPointEntity)(activePlane.origin, "#F59E0B", 8, "#FFFFFF", 2, "wp_active_plane_origin_dot");
    WP.ents.activePlaneMarker.push(centerPt);
  }

  // Baricentro / Centro geométrico entre los 3 puntos que definen el plano
  const p1 = activePlane.pts3D[0];
  const p2 = activePlane.pts3D[1];
  const p3 = activePlane.pts3D[2];
  const centroid = new Cesium.Cartesian3(
    (p1.x + p2.x + p3.x) / 3.0,
    (p1.y + p2.y + p3.y) / 3.0,
    (p1.z + p2.z + p3.z) / 3.0
  );
  // La etiqueta de pendiente se dibuja en tiempo real de forma continua en 2D sobre el canvas overlay (renderTriad2D)
  // en el centroide (P1+P2+P3)/3, garantizando visibilidad 100% libre de colisión u oclusión con geometrías 3D.

  // En lugar de la tríada de ejes físicos, dibujamos una etiqueta 2D informativa sobre el plano
  if (activePlane.origin) {
    const cardAz = (typeof getAzimuthCardinal === 'function') ? getAzimuthCardinal(activePlane.azimuthDeg || 0) : '';
    const tiltStr = (activePlane.tiltDeg || 0).toFixed(1);
    const azStr = (activePlane.azimuthDeg || 0).toFixed(0);
    const lblText = `🎯 ${activePlane.name || 'PLANO ACTIVO'}\n${tiltStr}° · ${cardAz} (${azStr}°)`;
    
    const addLblFn = typeof addLabelEntity === 'function' ? addLabelEntity : (window.addLabelEntity || null);
    if (addLblFn) {
      const lblEnt = addLblFn(activePlane.origin, lblText, -24, {
        bg: 'rgba(245, 158, 11, 0.90)', // Color ámbar corporativo de plano
        borderColor: '#FCD34D',
        textColor: '#FFFFFF',
        font: "bold 11px 'JetBrains Mono', monospace",
        category: 'plane'
      });
      if (lblEnt) WP.ents.activePlaneMarker.push(lblEnt);
    }
  }
  if (typeof window !== 'undefined' && window.RACapture) window.RACapture.reapply(); // [CAPTURA]
}

// ─── Selector de Ejes del Plano de Trabajo (Opcion B + D) ───────────────────
function wpSetAxisMode(mode) {
  WP.axisMode = mode;
  // Actualizar UI: resaltar boton activo
  ["p1p2","p1p3","auto"].forEach(function(m) {
    const btn = document.getElementById("wp-axis-btn-" + m);
    if (btn) {
      btn.style.background    = (m === mode) ? "rgba(245,158,11,0.35)" : "rgba(0,0,0,0.35)";
      btn.style.borderColor   = (m === mode) ? "var(--amber-400)"       : "rgba(255,255,255,0.15)";
      btn.style.color         = (m === mode) ? "var(--amber-400)"       : "var(--text-slate-300)";
      btn.style.fontWeight    = (m === mode) ? "bold"                   : "normal";
    }
  });
  // Recalcular el plano activo con los nuevos ejes
  const plane = wpGetActivePlane();
  if (!plane || !plane.pts3D || plane.pts3D.length < 3) return;
  const newData = wpComputePlaneFrom3Points(plane.pts3D[0], plane.pts3D[1], plane.pts3D[2], mode);
  // Actualizar solo los ejes (la normal y el angulo no cambian)
  plane.uVec = newData.uVec;
  plane.vVec = newData.vVec;
  plane.origin = newData.origin;
  // Actualizar la triada si esta activa
  if (triadState.active) {
    triadState.xAxis = newData.uVec;
    triadState.yAxis = newData.vVec;
    triadState.zAxis = plane.normal;
    renderTriad2D();
  }
  // Redibujar el gizmo del plano con los ejes actualizados
  wpRenderActivePlaneGizmo();
  // Recalcular si hay paneles solares definidos
  if (typeof recalculateLayoutAndObstacles === "function") {
    recalculateLayoutAndObstacles();
  }
  const modeLabels = { p1p2: "P1→P2 = X", p1p3: "P1→P3 = X", auto: "AUTO (cardinal)" };
  showStatus("<i data-lucide=\"settings\" class=\"icon-sm\"></i> EJES ACTUALIZADOS: " + (modeLabels[mode] || mode), 2000);
}

function wpTogglePlaneVertices() {
  WP.showPlaneVertices = !(WP.showPlaneVertices !== false);
  wpRenderActivePlaneGizmo();
  wpUpdateUI();
  showStatus(WP.showPlaneVertices ? '<i data-lucide=\"eye\" class=\"icon-sm\"></i> VÉRTICES DEL PLANO VISIBLES' : '<i data-lucide=\"eye-off\" class=\"icon-sm\"></i> VÉRTICES DEL PLANO OCULTOS', 2000);
}
window.wpTogglePlaneVertices = wpTogglePlaneVertices;

function wpEditActivePlane() {
  const plane = wpGetActivePlane();
  if (!plane) return;
  const _axisSel = document.getElementById("wp-axis-mode-selector");
  if (_axisSel) _axisSel.style.display = "none";
  wpStartDefinePlane();
}

function wpSetPlaneTilt(targetTiltDeg) {
  const plane = wpGetActivePlane();
  if (!plane || !plane.origin) {
    if (typeof showToast === 'function') showToast('SIN PLANO', 'Crea o selecciona un plano de cubierta primero.', 'warning', 2500);
    return;
  }
  const tilt = Math.max(0, Math.min(85, targetTiltDeg));
  const betaRad = Cesium.Math.toRadians(tilt);
  const radial = Cesium.Cartesian3.normalize(plane.origin, new Cesium.Cartesian3());
  
  let slopeDir = null;
  if (plane.normal) {
    const dotN = Cesium.Cartesian3.dot(plane.normal, radial);
    const horizComp = Cesium.Cartesian3.subtract(
      plane.normal,
      Cesium.Cartesian3.multiplyByScalar(radial, dotN, new Cesium.Cartesian3()),
      new Cesium.Cartesian3()
    );
    if (Cesium.Cartesian3.magnitude(horizComp) > 1e-4) {
      slopeDir = Cesium.Cartesian3.normalize(horizComp, new Cesium.Cartesian3());
    }
  }
  if (!slopeDir) {
    const east = Cesium.Cartesian3.normalize(Cesium.Cartesian3.cross(Cesium.Cartesian3.UNIT_Z, radial, new Cesium.Cartesian3()), new Cesium.Cartesian3());
    const north = Cesium.Cartesian3.normalize(Cesium.Cartesian3.cross(radial, east, new Cesium.Cartesian3()), new Cesium.Cartesian3());
    slopeDir = Cesium.Cartesian3.negate(north, new Cesium.Cartesian3());
  }

  const newNormal = Cesium.Cartesian3.add(
    Cesium.Cartesian3.multiplyByScalar(radial, Math.cos(betaRad), new Cesium.Cartesian3()),
    Cesium.Cartesian3.multiplyByScalar(slopeDir, Math.sin(betaRad), new Cesium.Cartesian3()),
    new Cesium.Cartesian3()
  );
  plane.normal = Cesium.Cartesian3.normalize(newNormal, new Cesium.Cartesian3());
  plane.tiltDeg = tilt;

  let uVec = Cesium.Cartesian3.cross(plane.normal, Cesium.Cartesian3.UNIT_Z, new Cesium.Cartesian3());
  if (Cesium.Cartesian3.magnitude(uVec) < 1e-3) {
    uVec = Cesium.Cartesian3.cross(plane.normal, Cesium.Cartesian3.UNIT_X, new Cesium.Cartesian3());
  }
  plane.uVec = Cesium.Cartesian3.normalize(uVec, new Cesium.Cartesian3());
  plane.vVec = Cesium.Cartesian3.normalize(Cesium.Cartesian3.cross(plane.normal, plane.uVec, new Cesium.Cartesian3()), new Cesium.Cartesian3());
  plane.name = 'Plano Cubierta #' + (WP.activePlaneIdx + 1) + ' (' + tilt.toFixed(0) + '°)';

  if (WP.polylines) {
    WP.polylines.forEach(poly => {
      if (poly && poly.planeIdx === WP.activePlaneIdx) {
        if (poly.modTilt === 'auto' || poly.modTilt === undefined) {
          if (poly.roofInfo) poly.roofInfo.moduleTiltDeg = tilt;
        }
      }
    });
  }

  wpRenderActivePlaneGizmo();
  wpUpdateUI();
  if (typeof wpUpdateStep3UI === 'function') wpUpdateStep3UI();
  if (typeof wpPopulateFaldonCard === 'function') wpPopulateFaldonCard();
  if (typeof step5RegenerateLayout === 'function') step5RegenerateLayout();
  if (typeof recalculateSolarYield === 'function') recalculateSolarYield();
  if (typeof window.wpInvalidateHeatmap === 'function') window.wpInvalidateHeatmap('Pendiente de cubierta fijada a ' + tilt + '°');

  showStatus('<i data-lucide="compass" class="icon-sm"></i> PENDIENTE DE CUBIERTA ENDEREZADA A ' + tilt + '°', 2500);
  if (typeof showToast === 'function') {
    showToast('PENDIENTE ENDEREZADA', 'El plano de cubierta se ha fijado exactamente a ' + tilt + '°.', 'success', 3000);
  }
  const curViewer = (typeof viewer !== 'undefined' && viewer) ? viewer : (window.viewer || null);
  if (curViewer && curViewer.scene && typeof curViewer.scene.requestRender === 'function') curViewer.scene.requestRender();
}
window.wpSetPlaneTilt = wpSetPlaneTilt;

function wpDeleteActivePlane(skipConfirm = false) {
  if (WP.activePlaneIdx < 0 || !WP.planes[WP.activePlaneIdx]) return;

  // ── Paso 1: Confirmación ──────────────────────────────────────────────────
  const deletedIdx  = WP.activePlaneIdx;
  const deletedPlane = WP.planes[deletedIdx];
  const planeName   = deletedPlane.name || ('Plano #' + (deletedIdx + 1));

  // Contar polilíneas y obstáculos afectados para informar al usuario
  const affectedPolys = (Array.isArray(WP.polylines))
    ? WP.polylines.filter(p => p && p.planeIdx === deletedIdx).length : 0;
  const affectedObs = (typeof obstacles !== 'undefined' && Array.isArray(obstacles))
    ? obstacles.filter(o => o && o.planeIdx === deletedIdx).length : 0;

  let msg = '¿Borrar "' + planeName + '"?';
  if (affectedPolys > 0 || affectedObs > 0) {
    msg += '\n\nSe eliminarán también:';
    if (affectedPolys > 0) msg += '\n  • ' + affectedPolys + ' polilínea(s) / faldón(es)';
    if (affectedObs   > 0) msg += '\n  • ' + affectedObs   + ' obstáculo(s)';
    msg += '\n  • Todos los paneles simulados asociados';
    msg += '\n\nPuedes pulsar CTRL+Z para deshacer si lo borras por error.';
  }

  if (!skipConfirm && !window.confirm(msg)) return; // ← el usuario canceló

  if (window.RAundo && typeof window.RAundo.snapProject === 'function') {
    window.RAundo.snapProject('Eliminar plano ' + planeName);
  }

  // Paso 2 eliminado - delegado al regenerador central

  // ── Paso 3: Borrar polilíneas del plano eliminado ─────────────────────────
  if (Array.isArray(WP.polylines)) {
    // BUG FIX: Explícitamente eliminar entidades 3D antes de perder su referencia
    const curViewer = (typeof viewer !== 'undefined' && viewer) ? viewer : (window.viewer || null);
    WP.polylines.forEach(p => {
      if (p && p.planeIdx === deletedIdx && curViewer && curViewer.entities) {
        if (p.lineEnt) try { curViewer.entities.remove(p.lineEnt); } catch(e){}
        if (p.fillEnt) try { curViewer.entities.remove(p.fillEnt); } catch(e){}
      }
    });

    WP.polylines = WP.polylines.filter(p => p && p.planeIdx !== deletedIdx);

    // Reindexar planeIdx de las polilíneas restantes
    WP.polylines.forEach(p => {
      if (p && typeof p.planeIdx === 'number' && p.planeIdx > deletedIdx) {
        p.planeIdx -= 1;
      }
    });

    WP.selectedPolyIdx = -1;
    WP.selectedVtxIdx  = -1;
  }

  // ── Paso 4: Borrar obstáculos del plano eliminado ─────────────────────────
  // [C4/G3] Mutamos la MISMA lista compartida (splice in-place) en vez de reasignar el array
  // global: los demás módulos (obstacles.js) guardan un alias y, si reasignábamos, seguían
  // viendo la copia antigua → obstáculos fantasma en el 3D.
  if (typeof obstacles !== 'undefined' && Array.isArray(obstacles)) {
    for (let _oi = obstacles.length - 1; _oi >= 0; _oi--) {
      const _ob = obstacles[_oi];
      if (_ob && typeof _ob.planeIdx === 'number' && _ob.planeIdx === deletedIdx) {
        obstacles.splice(_oi, 1);
      }
    }
    // Reindexar también los obstáculos restantes
    obstacles.forEach(o => {
      if (o && typeof o.planeIdx === 'number' && o.planeIdx > deletedIdx) {
        o.planeIdx -= 1;
      }
    });
    if (typeof selectedObstacleId !== 'undefined') selectedObstacleId = null;
  }

  // ── Paso 5: Borrar el plano ───────────────────────────────────────────────
  WP.planes.splice(deletedIdx, 1);
  WP.activePlaneIdx = WP.planes.length > 0 ? WP.planes.length - 1 : -1;

  // Evitar que variables legacy resuciten la polilínea borrada en updateAllVisuals
  if (typeof polygonPoints !== 'undefined') window.polygonPoints = [];

  if (typeof roofPanelsCache !== 'undefined' && roofPanelsCache) {
    roofPanelsCache.sig = "";
    roofPanelsCache.data = null;
  }

  if (WP.polylines.length === 0) {
    window.allRenderedPanels = [];
    if (typeof lastRoofInfo !== 'undefined') window.lastRoofInfo = null;
    if (typeof wpClearInverterAndCables === 'function') wpClearInverterAndCables();
  }
  
  // ── Actualizar UI y Renderizar estado (BARRIDO INTEGRAL DE 4 FASES) ────────
  wpClearEntGroup('activePlaneMarker');
  wpClearEntGroup('inactivePlanes');
  wpClearEntGroup('planePreview');

  // Fase 1: Purga explícita de entidades fijas por ID en el visor Cesium
  const curViewer = (typeof viewer !== 'undefined' && viewer) ? viewer : (window.viewer || null);
  if (curViewer && curViewer.entities) {
    const fixedIds = [
      'wp_active_plane_mesh',
      'wp_active_plane_border',
      'wp_active_plane_origin_dot',
      'wp_active_plane_vtx_0',
      'wp_active_plane_vtx_1',
      'wp_active_plane_vtx_2',
      'wp_plane_preview_pt_1',
      'wp_plane_preview_pt_2',
      'wp_plane_preview_pt_3',
      'wp_plane_preview_line_1_2'
    ];
    fixedIds.forEach(id => {
      try {
        if (curViewer.entities.getById(id)) curViewer.entities.removeById(id);
      } catch (eId) {}
    });
    for (let pi = 0; pi <= 25; pi++) {
      try {
        if (curViewer.entities.getById('wp_inactive_plane_mesh_' + pi)) curViewer.entities.removeById('wp_inactive_plane_mesh_' + pi);
        if (curViewer.entities.getById('wp_inactive_plane_border_' + pi)) curViewer.entities.removeById('wp_inactive_plane_border_' + pi);
        for (let vi = 0; vi <= 5; vi++) {
          if (curViewer.entities.getById('wp_inactive_plane_vtx_' + pi + '_' + vi)) curViewer.entities.removeById('wp_inactive_plane_vtx_' + pi + '_' + vi);
        }
      } catch (eInact) {}
    }
  }

  // Fase 2: Purga garantizada de etiquetas 2D asociadas al plano
  if (typeof window !== 'undefined') {
    if (Array.isArray(window.labels2DRegistry)) {
      window.labels2DRegistry = window.labels2DRegistry.filter(l => {
        if (!l) return false;
        const txt = typeof l.text === 'function' ? l.text() : (l.text || '');
        return !txt.includes('🎯 PLANO') && !txt.includes('🎯 Plano') && !txt.includes(planeName);
      });
    }
    if (Array.isArray(window.LabelEntities)) {
      window.LabelEntities = window.LabelEntities.filter(l => {
        if (!l) return false;
        const txt = (l.label && l.label.text) || '';
        return !txt.includes('🎯 PLANO') && !txt.includes('🎯 Plano') && !txt.includes(planeName);
      });
    }
  }

  // Fase 3: Si queda otro plano, activarlo; si no, limpiar overlay transparente
  if (wpGetActivePlane()) {
    wpRenderActivePlaneGizmo();
  } else {
    if (typeof triadCtx !== 'undefined' && triadCtx && typeof triadCanvas !== 'undefined' && triadCanvas) {
      try { triadCtx.clearRect(0, 0, triadCanvas.width, triadCanvas.height); } catch (eCl) {}
    }
  }

  // Fase 4: Sincronización y refresco completo
  if (typeof renderTriad2D === 'function') {
    try { renderTriad2D(); } catch (eTriad) {}
  }
  
  if (typeof wpRenderAllPolylines === 'function') wpRenderAllPolylines();
  if (typeof render3DObstaclesInCesium === 'function') render3DObstaclesInCesium();
  if (typeof updateAllVisuals === 'function') updateAllVisuals();
  
  if (typeof window.wpInvalidateHeatmap === 'function') {
    window.wpInvalidateHeatmap('Plano de trabajo eliminado');
  }

  if (typeof step5RegenerateLayout === 'function') step5RegenerateLayout();
  if (typeof recalculateSolarYield === 'function') recalculateSolarYield();
  if (typeof wpUpdateStep3UI === 'function') wpUpdateStep3UI();
  if (typeof wpPopulateFaldonCard === 'function') wpPopulateFaldonCard();
  if (typeof wpUpdateControlsAvailability === 'function') wpUpdateControlsAvailability();

  if (typeof ProjectHierarchy !== 'undefined' && ProjectHierarchy.notify) {
    try { ProjectHierarchy.notify('plane_removed', { index: deletedIdx }); } catch (ePH) {}
  }
  if (typeof renderUiOutliner === 'function') {
    try { renderUiOutliner(); } catch (eOut) {}
  }

  wpUpdateUI();
  showStatus('<i data-lucide="trash-2" class="icon-sm"></i> "' + planeName + '" ELIMINADO — polilíneas y obstáculos borrados', 2500);
}

function wpDeletePlane(planeIdx, skipConfirm = false) {
  if (typeof planeIdx !== 'number' || planeIdx < 0 || !WP.planes || !WP.planes[planeIdx]) return;
  WP.activePlaneIdx = planeIdx;
  wpDeleteActivePlane(skipConfirm);
}


// ── 2.2. FLUJO DE DIBUJO DE POLILÍNEAS COPLANARES ───────────────────────────
function startPolylineDrawMode() {
  let plane = wpGetActivePlane();
  if (!plane) {
    // Si hay un edificio 3D seleccionado o existente, convertir automáticamente su cubierta en plano solar
    if (typeof selectedBuildingId !== 'undefined' && selectedBuildingId) {
      const bld = (typeof buildings !== 'undefined' && Array.isArray(buildings)) ? buildings.find(b => b.id === selectedBuildingId) : null;
      if (bld && bld.points && bld.points.length >= 3 && typeof createSolarPlaneFromBuildingRoof === 'function') {
        if (typeof showToast === 'function') {
          showToast('PLANO DE CUBIERTA CREADO', 'Superficie de ' + bld.name + ' convertida automáticamente en plano solar.', 'success', 3500);
        }
        createSolarPlaneFromBuildingRoof();
        return;
      }
    }
    if (typeof buildings !== 'undefined' && Array.isArray(buildings) && buildings.length > 0) {
      const bld = buildings[0];
      if (bld && bld.points && bld.points.length >= 3 && typeof createSolarPlaneFromBuildingRoof === 'function') {
        if (typeof selectBuilding === 'function') selectBuilding(bld.id);
        if (typeof showToast === 'function') {
          showToast('PLANO DE CUBIERTA CREADO', 'Superficie de ' + bld.name + ' convertida automáticamente en plano solar.', 'success', 3500);
        }
        createSolarPlaneFromBuildingRoof();
        return;
      }
    }
    if (typeof showToast === 'function') {
      showToast('PLANO REQUERIDO', 'Toca 3 puntos sobre el tejado para definir el plano de trabajo antes de dibujar polilíneas.', 'warning', 4500);
    } else {
      alert('Es obligatorio crear primero el plano de trabajo tocando 3 puntos sobre la superficie.');
    }
    return;
  }
  WP.activePolyPts = [];
  if (typeof polygonPoints !== 'undefined') polygonPoints = [];
  if (typeof window !== 'undefined') window.polygonPoints = [];
  if (typeof triadState !== 'undefined' && triadState) {
    triadState.pos3D = null;
    triadState.snapTarget = null;
  }
  if (typeof reset3DPositionCache === 'function') reset3DPositionCache();
  if (typeof selectObstacle === 'function') selectObstacle(null);
  if (typeof selectPanel === 'function') selectPanel(-1);
  if (typeof selectElectricalObject === 'function') selectElectricalObject(null);
  if (typeof selectBuilding === 'function') selectBuilding(null);
  if (typeof wpSelectVertex === 'function') wpSelectVertex(-1);
  wpClearEntGroup('activePoly');
  wpSetMode('draw-poly');
  showStatus('<i data-lucide=\"edit-2\" class=\"icon-sm\"></i> MODO DIBUJO ACTIVO · CLIC EN EL PLANO PARA AÑADIR VÉRTICES (Cierre automático con ≥3 puntos)', 4000);
}

function wpAddPolylinePoint(cartesianPos) {
  const plane = wpGetActivePlane();
  if (!plane) return;

  const ptPlane = wpProjectPointToActivePlane(cartesianPos);

  if (WP.activePolyPts.length >= 3) {
    const pFirst = WP.activePolyPts[0];
    const dist = Cesium.Cartesian3.distance(ptPlane, pFirst);
    if (dist < 2.5) {
      wpCloseActivePolyline();
      return;
    }
  }

  // Filtro Anti-Degeneración Geométrica (CAD AAA): evitar aristas < 0.35m y 2º clic de doble clic
  if (WP.activePolyPts.length > 0) {
    const pLast = WP.activePolyPts[WP.activePolyPts.length - 1];
    if (Cesium.Cartesian3.distance(ptPlane, pLast) < 0.35) {
      return;
    }
  }

  WP.activePolyPts.push(ptPlane);
  WP._lastVtxTime = performance.now();
  polygonPoints = WP.activePolyPts.map(p => Cesium.Cartesian3.clone(p));

  wpRenderActivePolylineVisuals();
  wpUpdateUI();
  // updateAllVisuals(); // [FIX] Eliminado para evitar renderizado duplicado (Doble Creacion)

  showStatus('POLILÍNEA #' + (WP.polylines.length + 1) + ' · VÉRTICE #' + WP.activePolyPts.length + ' AÑADIDO', 1200);
}

function wpUndoLastPolylinePoint() {
  if (typeof WP === 'undefined' || !WP) return false;
  if (WP.mode === 'draw-poly' && Array.isArray(WP.activePolyPts) && WP.activePolyPts.length > 0) {
    WP.activePolyPts.pop();
    if (typeof polygonPoints !== 'undefined') {
      polygonPoints = WP.activePolyPts.map(p => Cesium.Cartesian3.clone(p));
    }
    if (typeof wpRenderActivePolylineVisuals === 'function') wpRenderActivePolylineVisuals();
    if (typeof wpUpdateUI === 'function') wpUpdateUI();
    if (typeof showStatus === 'function') {
      showStatus('ÚLTIMO VÉRTICE DESHECHO (' + WP.activePolyPts.length + ' RESTANTES)', 1500);
    }
    return true;
  }
  return false;
}
window.wpUndoLastPolylinePoint = wpUndoLastPolylinePoint;

function wpCloseActivePolyline() {
  if (WP.activePolyPts.length < 3) {
    const confBar = document.getElementById('ra-confirm-bar');
    if (confBar) {
      confBar.style.display = 'none';
      confBar.classList.remove('open');
    }
    if (typeof bldFootprintState !== 'undefined' && bldFootprintState && bldFootprintState.editing) {
      if (typeof toggleBuildingFootprintEditing === 'function') toggleBuildingFootprintEditing(false);
      if (typeof showToast === 'function') {
        showToast('EDICIÓN FINALIZADA', 'Modo de edición de huella cerrado. Pulsa "Convertir Faldones en Planos Solares" para generar la cubierta.', 'info', 4000);
      }
      return;
    }
    if (typeof showToast === 'function') {
      showToast('AVISO', 'No hay ningún dibujo de polilínea activo. Pulsa "Dibujar Polilínea en Plano" o "Convertir Faldones en Planos Solares".', 'warning', 3500);
    } else {
      showStatus("SE REQUIEREN AL MENOS 3 VERTICES PARA CERRAR LA POLILINEA", 2000);
    }
    return;
  }

  const plane = wpGetActivePlane();
  const rawPts = WP.activePolyPts.map(p => Cesium.Cartesian3.clone(p));
  const pts = (typeof wpEnsureCounterClockwisePoints === 'function')
    ? wpEnsureCounterClockwisePoints(rawPts, plane ? plane.normal : null)
    : rawPts;
  const area = wpPolylineArea3D(pts);

  const polyObj = {
    id: "wp_poly_" + Date.now(),
    name: "Faldon #" + (WP.polylines.length + 1),
    planeIdx: WP.activePlaneIdx,
    points: pts,
    area: area,
    orientationPref: (typeof userPanelOrientationPref !== "undefined" ? userPanelOrientationPref : (window.userPanelOrientationPref || "portrait")),
    modTilt: "auto",
    modAzimuth: "auto",
    lineEnt: null,
    fillEnt: null
  };

  if (window.RAundo && typeof window.RAundo.snapPolylines === 'function') {
    window.RAundo.snapPolylines('Crear ' + polyObj.name);
  }
  WP.polylines.push(polyObj);
  WP.selectedPolyIdx = WP.polylines.length - 1;

  polygonPoints = pts.map(p => Cesium.Cartesian3.clone(p));
  isPolygonDesignConfirmed = true;

  WP.activePolyPts = [];
  wpClearEntGroup("activePoly");
  wpSetMode("idle");

  wpRenderAllPolylines();
  wpUpdateUI();

  if (roofPanelsCache) roofPanelsCache.sig = "";
  if (typeof window.wpInvalidateHeatmap === 'function') window.wpInvalidateHeatmap('Nuevo faldón añadido');
  if (typeof wpUpdateStep3UI === 'function') wpUpdateStep3UI();
  if (typeof wpPopulateFaldonCard === 'function') wpPopulateFaldonCard();
  if (typeof wpSyncStep6Controls === 'function') wpSyncStep6Controls();
  if (typeof recalculateSolarYield === "function") recalculateSolarYield();
  if (typeof wpFastRenderSimulatedPanels === "function") wpFastRenderSimulatedPanels();
  if (typeof ProjectHierarchy !== 'undefined' && ProjectHierarchy.notify) {
    ProjectHierarchy.notify('polyline_added', { polyline: polyObj, index: WP.selectedPolyIdx });
  }

  showStatus("<i data-lucide=\"check\" class=\"icon-sm\"></i> CONTORNO #" + WP.polylines.length + " CERRADO (" + area.toFixed(1) + " m²) · PASO 2 GENERADOR HABILITADO", 4500);
  if (typeof wpUpdateControlsAvailability === 'function') wpUpdateControlsAvailability();
}

// ── Corrección de Winding Order para Renderizado 3D Universal en WebGL ────────
// ── Corrección de Winding Order para Renderizado 3D Universal en WebGL ────────
function wpEnsureCounterClockwisePoints(pts, refNormal) {
  if (!pts || pts.length < 3) return pts || [];
  let norm = new Cesium.Cartesian3(0, 0, 0);
  for (let i = 0; i < pts.length; i++) {
    const cur = pts[i];
    const nxt = pts[(i + 1) % pts.length];
    norm.x += (cur.y - nxt.y) * (cur.z + nxt.z);
    norm.y += (cur.z - nxt.z) * (cur.x + nxt.x);
    norm.z += (cur.x - nxt.x) * (cur.y + nxt.y);
  }

  let targetNorm = refNormal;
  if (!targetNorm && pts[0]) {
    targetNorm = Cesium.Cartesian3.normalize(pts[0], new Cesium.Cartesian3());
  }
  if (!targetNorm) targetNorm = new Cesium.Cartesian3(0, 0, 1);

  const dot = Cesium.Cartesian3.dot(norm, targetNorm);
  if (dot < 0) {
    return pts.slice().reverse();
  }
  return pts;
}

function wpElevatePointsForVisuals(pts, planeIdx, offsetM = 0.12) {
  if (!pts || pts.length === 0) return [];
  let norm = null;
  if (typeof WP !== "undefined" && WP && WP.planes && planeIdx >= 0 && WP.planes[planeIdx] && WP.planes[planeIdx].normal) {
    norm = WP.planes[planeIdx].normal;
  }
  if (!norm && pts.length >= 3) {
    const v1 = Cesium.Cartesian3.subtract(pts[1], pts[0], new Cesium.Cartesian3());
    const v2 = Cesium.Cartesian3.subtract(pts[2], pts[0], new Cesium.Cartesian3());
    norm = Cesium.Cartesian3.cross(v1, v2, new Cesium.Cartesian3());
    if (Cesium.Cartesian3.magnitude(norm) > 0.001) {
      norm = Cesium.Cartesian3.normalize(norm, norm);
    } else {
      norm = new Cesium.Cartesian3(0, 0, 1);
    }
  }
  if (!norm) norm = new Cesium.Cartesian3(0, 0, 1);

  return pts.map(p => {
    const elevated = Cesium.Cartesian3.clone(p);
    Cesium.Cartesian3.add(elevated, Cesium.Cartesian3.multiplyByScalar(norm, offsetM, new Cesium.Cartesian3()), elevated);
    return elevated;
  });
}

function addPolygonEntity(positions, colorHex, alpha, outlineWidth, id) {
  if (!positions || positions.length < 3) return null;
  const ccwPositions = wpEnsureCounterClockwisePoints(positions);
  const color = cesiumColor(colorHex, alpha);

  return viewer.entities.add({
    id: id || ("poly_ent_" + Math.random().toString(36).substring(2, 8)),
    polygon: {
      hierarchy: new Cesium.PolygonHierarchy(ccwPositions),
      material: new Cesium.ColorMaterialProperty(color),
      // depthFailMaterial removed
      perPositionHeight: true,
      outline: outlineWidth !== undefined && outlineWidth > 0,
      outlineColor: outlineWidth !== undefined && outlineWidth > 0 ? Cesium.Color.WHITE : undefined,
      outlineWidth: outlineWidth || 0,
      arcType: Cesium.ArcType.NONE,
      shadows: Cesium.ShadowMode.DISABLED
    }
  });
}

function wpRenderActivePolylineVisuals() {
  wpClearEntGroup('activePoly');
  const pts = WP.activePolyPts;
  if (pts.length === 0) return;

  const elevatedPts = wpElevatePointsForVisuals(pts, WP.activePlaneIdx, 0.12);

  // 1. Puntos
  elevatedPts.forEach((p, i) => {
    const ptEnt = (getAddPointEntity() || addPointEntity)(
      p,
      '#F59E0B',
      10,
      '#000000',
      1.5,
      'wp_active_pt_' + i + '_' + Math.random().toString(36).substring(2, 6)
    );
    WP.ents.activePoly.push(ptEnt);
  });

  // 2. Líneas de conexión visibles entre los vértices ya fijados
  if (pts.length >= 2) {
    const lineEnt = (getAddPolylineEntity() || addPolylineEntity)(
      elevatedPts,
      '#F59E0B',
      3.5,
      1.0,
      1.0,
      'wp_active_line_' + Math.random().toString(36).substring(2, 6)
    );
    WP.ents.activePoly.push(lineEnt);
  }

  if (typeof viewer !== 'undefined' && viewer && viewer.scene && typeof viewer.scene.requestRender === 'function') viewer.scene.requestRender();
}

function wpRenderAllPolylines() {
  wpClearEntGroup('polys');
  const curViewer = (typeof viewer !== 'undefined' && viewer) ? viewer : (window.viewer || null);
  if (curViewer && curViewer.entities) {
    const oldShape = curViewer.entities.getById('ra_active_shape');
    if (oldShape) {
      try { curViewer.entities.remove(oldShape); } catch(_) {}
    }
    if (typeof activeShapeEntity !== 'undefined' && activeShapeEntity) {
      try { curViewer.entities.remove(activeShapeEntity); } catch(_) {}
      activeShapeEntity = null;
    }
  }
  WP.polylines.forEach((poly, i) => {
    const isSel = i === WP.selectedPolyIdx;
    const strColor = getPolylineStringColor(i);
    // Faldón a cota rasante limpia (+0.12m) para evitar que la fotogrametría 3D ocluya la línea o el relleno
    const elevatedPts = wpElevatePointsForVisuals(poly.points, poly.planeIdx, 0.12);
    const closedElevatedPts = [...elevatedPts, elevatedPts[0]];
    
    // 1. Contorno perimetral nítido y discreto en color naranja/ámbar
    const polyColor = isSel ? '#F59E0B' : '#D97706';
    const line = (getAddPolylineEntity() || addPolylineEntity)(
      closedElevatedPts,
      polyColor,
      isSel ? 3.0 : 2.0,
      1.0,
      1.0,
      'wp_poly_line_' + i + '_' + Math.random().toString(36).substring(2, 6)
    );
    if (line) WP.ents.polys.push(line);
    
    // 2. Superficie sólida semitransparente generada sobre la cubierta (CCW garantizado)
    const fill = addPolygonEntity(
      elevatedPts,
      polyColor,
      isSel ? 0.18 : 0.08,
      0,
      'wp_poly_fill_' + i + '_' + Math.random().toString(36).substring(2, 6)
    );
    if (fill) WP.ents.polys.push(fill);

    // 3. Floating Badge 3D si es el faldón seleccionado
    if (isSel && typeof Cesium !== 'undefined' && viewer && viewer.entities) {
      // Calcular centroide 3D para anclar el Floating Badge
      let cX = 0, cY = 0, cZ = 0;
      poly.points.forEach(p => { cX += p.x; cY += p.y; cZ += p.z; });
      const nPts = poly.points.length;
      if (nPts > 0) {
        const centroid = new Cesium.Cartesian3(cX / nPts, cY / nPts, cZ / nPts);
        let planeNorm = null;
        let pTilt = 0;
        let pAz = 0;
        if (typeof WP.planes !== 'undefined' && WP.planes && poly.planeIdx >= 0 && WP.planes[poly.planeIdx]) {
          planeNorm = WP.planes[poly.planeIdx].normal;
          pTilt = WP.planes[poly.planeIdx].tiltDeg || 0;
          pAz = WP.planes[poly.planeIdx].azimuthDeg || 0;
        }
        if (!planeNorm && poly.points.length >= 3) {
          const v1 = Cesium.Cartesian3.subtract(poly.points[1], poly.points[0], new Cesium.Cartesian3());
          const v2 = Cesium.Cartesian3.subtract(poly.points[2], poly.points[0], new Cesium.Cartesian3());
          const cr = Cesium.Cartesian3.cross(v1, v2, new Cesium.Cartesian3());
          if (Cesium.Cartesian3.magnitude(cr) > 1e-4) {
            planeNorm = Cesium.Cartesian3.normalize(cr, new Cesium.Cartesian3());
          }
        }
        if (!planeNorm) {
          planeNorm = (Cesium.Ellipsoid && Cesium.Ellipsoid.WGS84)
            ? Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(centroid, new Cesium.Cartesian3())
            : new Cesium.Cartesian3(0, 0, 1);
        }

        // Elevar el badge +0.9m sobre la superficie para lectura limpia
        const badgePos = Cesium.Cartesian3.add(
          centroid,
          Cesium.Cartesian3.multiplyByScalar(planeNorm, 0.9, new Cesium.Cartesian3()),
          new Cesium.Cartesian3()
        );

        const cardAz = typeof getAzimuthCardinal === 'function' ? getAzimuthCardinal(pAz) : '';
        const panelCount = (poly.roofInfo && poly.roofInfo.panels) ? poly.roofInfo.panels.length : 0;
        const badgeText = `🎯 FALDÓN #${i + 1} ACTIVO\n${pTilt.toFixed(1)}° · ${cardAz} (${pAz.toFixed(0)}°) · ${poly.area.toFixed(1)}m²${panelCount > 0 ? ' · ' + panelCount + ' Módulos' : ''}`;

        const badgeEnt = (getAddLabelEntity() || addLabelEntity)(badgePos, badgeText, -10, {
          bg: 'rgba(217, 119, 6, 0.90)',
          borderColor: '#F59E0B',
          textColor: '#FFFFFF',
          font: "bold 10.5px 'JetBrains Mono', monospace",
          category: 'roof',
          polyIdx: i
        });
        if (badgeEnt) WP.ents.polys.push(badgeEnt);
      }
    }

    // 4. Vértices interactivos de edición
    elevatedPts.forEach((p, vi) => {
      const isVtxSel = isSel && vi === WP.selectedVtxIdx;
      const ptEnt = (getAddPointEntity() || addPointEntity)(
        p,
        isVtxSel ? '#FFFFFF' : polyColor,
        isVtxSel ? 11 : 7,
        '#000000',
        isVtxSel ? 2.5 : 1.5,
        'wp_saved_vtx_' + i + '_' + vi + '_' + Math.random().toString(36).substring(2, 6)
      );
      WP.ents.polys.push(ptEnt);
    });

    poly.lineEnt = line;
    poly.fillEnt = fill;
  });
  if (typeof viewer !== 'undefined' && viewer && viewer.scene && typeof viewer.scene.requestRender === 'function') viewer.scene.requestRender();
  if (typeof window !== 'undefined' && window.RACapture) window.RACapture.reapply(); // [CAPTURA] re-ocultar andamiaje tras re-render
}

function wpClearEntGroup(key) {
  const curViewer = (typeof viewer !== 'undefined' && viewer) ? viewer : (window.viewer || null);
  if (curViewer && curViewer.entities) {
    (WP.ents[key] || []).forEach(e => {
      if (e) {
        try {
          curViewer.entities.remove(e);
        } catch (err) {}
      }
    });
  }
  WP.ents[key] = [];
  if (curViewer && curViewer.scene && typeof curViewer.scene.requestRender === 'function') {
    try { curViewer.scene.requestRender(); } catch (eR) {}
  }
}

// ── Actualización de la Interfaz del Módulo 1 ────────────────────────────────

// ── GESTIÓN DE POLILÍNEAS Y LISTADO INTERACTIVO DE VÉRTICES ──────────────────
function wpSelectPolyline(polyIdx) {
  if (WP.polylines.length === 0) {
    WP.selectedPolyIdx = -1;
    WP.selectedVtxIdx = -1;
    wpUpdateUI();
    if (typeof wpUpdateStep3UI === 'function') wpUpdateStep3UI();
    return;
  }
  if (polyIdx < 0 || polyIdx >= WP.polylines.length) {
    WP.selectedPolyIdx = 0;
  } else {
    WP.selectedPolyIdx = polyIdx;
  }
  WP.selectedVtxIdx = -1;

  const poly = WP.polylines[WP.selectedPolyIdx];
  if (poly && typeof poly.planeIdx === "number") {
    WP.activePlaneIdx = poly.planeIdx;
  }
  if (poly) {
    polygonPoints = poly.points.map(p => Cesium.Cartesian3.clone(p));
    selectedVertexIndex = -1;
  }

  const dropdownP1 = document.getElementById('wp-polylines-dropdown');
  if (dropdownP1 && dropdownP1.value !== String(WP.selectedPolyIdx)) dropdownP1.value = String(WP.selectedPolyIdx);
  const dropdownP2 = document.getElementById('faldon-selector-dropdown');
  if (dropdownP2 && dropdownP2.value !== String(WP.selectedPolyIdx)) dropdownP2.value = String(WP.selectedPolyIdx);

  wpRenderAllPolylines();
  wpUpdateUI();
  if (typeof wpPopulateFaldonCard === 'function') wpPopulateFaldonCard();
  if (typeof wpSyncStep6Controls === 'function') wpSyncStep6Controls();
  // updateAllVisuals();

  if (typeof recalculateSolarYield === 'function') recalculateSolarYield();
  if (typeof recalculateLayoutAndObstacles === 'function') recalculateLayoutAndObstacles();
  if (typeof wpFastRenderSimulatedPanels === 'function' && wpCurrentStep >= 2 && isPolygonDesignConfirmed) {
    wpFastRenderSimulatedPanels();
  } else if (typeof startSolarPanelsSimulation === 'function' && wpCurrentStep >= 2 && isPolygonDesignConfirmed) {
    startSolarPanelsSimulation();
  }

  if (poly) {
    showStatus('<i data-lucide="crosshair" class="icon-sm"></i> ' + poly.name.toUpperCase() + ' SELECCIONADA (' + poly.points.length + ' VÉRTICES · ' + poly.area.toFixed(1) + ' m²)', 2000);
  }
}

function wpStep3SelectPolyline(polyIdx) {
  wpSelectFaldon(polyIdx);
  wpSyncStep3Metrics();
}

function wpSelectVertex(vtxIdx) {
  const poly = (WP.polylines && WP.selectedPolyIdx >= 0) ? WP.polylines[WP.selectedPolyIdx] : null;
  if (!poly || vtxIdx < 0 || vtxIdx >= poly.points.length) {
    WP.selectedVtxIdx = -1;
    selectedVertexIndex = -1;
    wpSyncVertexInputs();
    wpRenderAllPolylines();
    wpUpdateUI();
    if (typeof renderTriad2D === 'function') renderTriad2D();
    return;
  }

  WP.selectedVtxIdx = vtxIdx;
    selectedVertexIndex = vtxIdx;
    if (typeof setAppMode === 'function') setAppMode('edit');
    else if (typeof window !== 'undefined' && typeof window.appMode !== 'undefined') window.appMode = 'edit';
    
    if (typeof universalGizmoState !== 'undefined') {
      universalGizmoState.active = true;
      universalGizmoState.targetType = 'vertex';
      universalGizmoState.mode = 'idle'; // Fixed
      if (typeof getUniversalSelectedTarget === 'function') {
        universalGizmoState.target = getUniversalSelectedTarget();
      }
    }
  if (typeof triadState !== 'undefined' && triadState) {
    triadState.active = false;
  }
  if (typeof window !== 'undefined' && window.RA_InteractionState) {
    window.RA_InteractionState.mode = 'EDIT';
    if (typeof window.updateInteractionVisibility === 'function') window.updateInteractionVisibility();
    if (typeof window.syncCursorStyle === 'function') window.syncCursorStyle();
  }
  wpSyncVertexInputs();
  wpRenderAllPolylines();
  wpUpdateUI();
  if (typeof renderTriad2D === 'function') renderTriad2D();

  const p = poly.points[vtxIdx];
  showStatus('<i data-lucide=\"map-pin\" class=\"icon-sm\"></i> VÉRTICE #' + (vtxIdx + 1) + ' SELECCIONADO (X: ' + p.x.toFixed(2) + ', Y: ' + p.y.toFixed(2) + ', Z: ' + p.z.toFixed(2) + ')', 2000);
}

function wpSyncVertexInputs() {
  const xInp = document.getElementById('wp-vtx-input-x');
  const yInp = document.getElementById('wp-vtx-input-y');
  const zInp = document.getElementById('wp-vtx-input-z');
  const btnApply = document.getElementById('wp-vtx-apply-btn');
  const btnDel = document.getElementById('wp-vtx-del-btn');
  const badge = document.getElementById('wp-selected-vtx-badge');
  const hint = document.getElementById('wp-vtx-coords-hint');

  const poly = (WP.polylines && WP.selectedPolyIdx >= 0) ? WP.polylines[WP.selectedPolyIdx] : null;
  const hasVtx = poly && WP.selectedVtxIdx >= 0 && WP.selectedVtxIdx < poly.points.length;

  if (xInp && yInp && zInp) {
    xInp.disabled = !hasVtx;
    yInp.disabled = !hasVtx;
    zInp.disabled = !hasVtx;
    if (btnApply) btnApply.disabled = !hasVtx;
    if (btnDel) btnDel.disabled = !hasVtx;

    if (hasVtx) {
      const pt = poly.points[WP.selectedVtxIdx];
      xInp.value = pt.x.toFixed(3);
      yInp.value = pt.y.toFixed(3);
      zInp.value = pt.z.toFixed(3);
      if (badge) badge.textContent = 'VÉRTICE #' + (WP.selectedVtxIdx + 1);
      if (hint) hint.textContent = 'Modifica y pulsa OK o Enter';
    } else {
      xInp.value = '';
      yInp.value = '';
      zInp.value = '';
      if (badge) badge.textContent = 'NINGUNO';
      if (hint) hint.textContent = 'Selecciona un vértice';
    }
  }
}

function wpApplySelectedVtxCoords() {
  const poly = (WP.polylines && WP.selectedPolyIdx >= 0) ? WP.polylines[WP.selectedPolyIdx] : null;
  if (!poly || WP.selectedVtxIdx < 0 || WP.selectedVtxIdx >= poly.points.length) return;

  const x = parseFloat(document.getElementById('wp-vtx-input-x').value);
  const y = parseFloat(document.getElementById('wp-vtx-input-y').value);
  const z = parseFloat(document.getElementById('wp-vtx-input-z').value);

  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    showStatus('COORDENADAS INVÁLIDAS', 2000);
    wpSyncVertexInputs();
    return;
  }

  poly.points[WP.selectedVtxIdx] = new Cesium.Cartesian3(x, y, z);
  poly.area = wpPolylineArea3D(poly.points);
  polygonPoints = poly.points.map(p => Cesium.Cartesian3.clone(p));

  if (typeof roofPanelsCache !== 'undefined' && roofPanelsCache) {
    roofPanelsCache.sig = "";
  }
  if (typeof window.wpInvalidateHeatmap === 'function') {
    window.wpInvalidateHeatmap('Coordenadas de vértice modificadas');
  }

  wpRenderAllPolylines();
  wpUpdateUI();
  if (typeof wpUpdateStep3UI === 'function') wpUpdateStep3UI();
  if (typeof wpPopulateFaldonCard === 'function') wpPopulateFaldonCard();
  // updateAllVisuals();

  if (typeof recalculateLayoutAndObstacles === 'function') recalculateLayoutAndObstacles();

  showStatus('<i data-lucide="check" class="icon-sm"></i> VÉRTICE #' + (WP.selectedVtxIdx + 1) + ' ACTUALIZADO', 1800);
}

function wpDeleteSelectedVertexFromList() {
  const poly = (WP.polylines && WP.selectedPolyIdx >= 0) ? WP.polylines[WP.selectedPolyIdx] : null;
  if (!poly || WP.selectedVtxIdx < 0 || WP.selectedVtxIdx >= poly.points.length) return;

  if (poly.points.length <= 3) {
    alert('Una polilínea cerrada debe tener al menos 3 vértices. Para eliminar la polilínea completa, pulsa "BORRAR POLILÍNEA".');
    return;
  }

  if (typeof window.RAundo !== 'undefined' && window.RAundo && typeof window.RAundo.snapVertex === 'function') {
    window.RAundo.snapVertex(WP.selectedPolyIdx);
  }

  const deletedIdx = WP.selectedVtxIdx;
  poly.points.splice(deletedIdx, 1);
  poly.area = wpPolylineArea3D(poly.points);
  polygonPoints = poly.points.map(p => Cesium.Cartesian3.clone(p));

  WP.selectedVtxIdx = Math.min(deletedIdx, poly.points.length - 1);
  selectedVertexIndex = WP.selectedVtxIdx;

  if (typeof roofPanelsCache !== 'undefined' && roofPanelsCache) {
    roofPanelsCache.sig = "";
  }
  if (typeof window.wpInvalidateHeatmap === 'function') {
    window.wpInvalidateHeatmap('Vértice de faldón eliminado');
  }

  wpRenderAllPolylines();
  wpUpdateUI();
  if (typeof wpUpdateStep3UI === 'function') wpUpdateStep3UI();
  if (typeof wpPopulateFaldonCard === 'function') wpPopulateFaldonCard();
  // updateAllVisuals();

  if (typeof recalculateSolarYield === 'function') recalculateSolarYield();
  if (typeof recalculateLayoutAndObstacles === 'function') recalculateLayoutAndObstacles();

  showStatus('<i data-lucide="trash-2" class="icon-sm"></i> VÉRTICE #' + (deletedIdx + 1) + ' ELIMINADO (' + poly.points.length + ' RESTANTES)', 2000);
}

function wpInsertPointInSelectedPoly() {
  const poly = (WP.polylines && WP.selectedPolyIdx >= 0) ? WP.polylines[WP.selectedPolyIdx] : null;
  if (!poly || poly.points.length < 2) return;

  const curIdx = WP.selectedVtxIdx >= 0 ? WP.selectedVtxIdx : 0;
  const nextIdx = (curIdx + 1) % poly.points.length;
  const midPoint = Cesium.Cartesian3.midpoint(poly.points[curIdx], poly.points[nextIdx], new Cesium.Cartesian3());

  poly.points.splice(curIdx + 1, 0, midPoint);
  poly.area = wpPolylineArea3D(poly.points);
  polygonPoints = poly.points.map(p => Cesium.Cartesian3.clone(p));

  wpSelectVertex(curIdx + 1);
  showStatus('<i data-lucide=\"check\" class=\"icon-sm\"></i> NUEVO VÉRTICE INSERTADO TRAS VÉRTICE #' + (curIdx + 1), 2200);
}

function wpDeleteSelectedPolyline() {
  if (WP.selectedPolyIdx < 0 || WP.selectedPolyIdx >= WP.polylines.length) return;
  const name = WP.polylines[WP.selectedPolyIdx].name;
  if (window.RAundo && typeof window.RAundo.snapPolylines === 'function') {
    window.RAundo.snapPolylines('Eliminar ' + name);
  }
  WP.polylines.splice(WP.selectedPolyIdx, 1);
  WP.selectedPolyIdx = WP.polylines.length > 0 ? WP.polylines.length - 1 : -1;
  WP.selectedVtxIdx = -1;

  polygonPoints = (WP.selectedPolyIdx >= 0 && WP.polylines[WP.selectedPolyIdx])
    ? WP.polylines[WP.selectedPolyIdx].points.map(p => Cesium.Cartesian3.clone(p))
    : [];

  if (typeof roofPanelsCache !== 'undefined' && roofPanelsCache) {
    roofPanelsCache.sig = "";
    roofPanelsCache.data = null;
  }

  if (WP.polylines.length === 0) {
    window.allRenderedPanels = [];
    if (typeof lastRoofInfo !== 'undefined') window.lastRoofInfo = null;
    if (typeof wpClearInverterAndCables === 'function') wpClearInverterAndCables();
  }

  wpRenderAllPolylines();
  wpUpdateUI();
  if (typeof wpUpdateStep3UI === 'function') wpUpdateStep3UI();
  if (typeof wpPopulateFaldonCard === 'function') wpPopulateFaldonCard();
  if (typeof wpSyncStep6Controls === 'function') wpSyncStep6Controls();

  if (typeof window.wpInvalidateHeatmap === 'function') {
    window.wpInvalidateHeatmap('Faldón eliminado');
  }

  if (typeof step5RegenerateLayout === 'function') step5RegenerateLayout();
  if (typeof recalculateSolarYield === 'function') recalculateSolarYield();
  if (typeof recalculateLayoutAndObstacles === 'function') recalculateLayoutAndObstacles();

  if (typeof ProjectHierarchy !== 'undefined' && ProjectHierarchy.notify) {
    ProjectHierarchy.notify('polyline_deleted', { name: name, index: WP.selectedPolyIdx });
  }

  if (typeof wpUpdateControlsAvailability === 'function') wpUpdateControlsAvailability();

  showStatus('<i data-lucide="trash-2" class="icon-sm"></i> ' + name.toUpperCase() + ' ELIMINADA', 2000);
}


// ── STEPPER 1-2-3 WORKFLOW & CANVAS HUD CONTROLLER ────────────────────────────
// wpCurrentStep: única declaración global en index.html (var wpCurrentStep = 1).
// Aquí solo se lee/escribe; NO redeclarar (un let aquí rompe el bloque inline con SyntaxError).
if (typeof window !== 'undefined' && typeof window.wpCurrentStep === 'undefined') window.wpCurrentStep = 1;

async function wpGoToStep(step) {
  // 1. Delegar el bloqueo arquitectónico al Orquestador Central
  if (typeof window.WorkflowOrchestrator !== 'undefined') {
    if (!window.WorkflowOrchestrator.goToStep(step)) {
      return; 
    }
  }

  // 1.1 Bloqueo de pasos no desbloqueados por falta de prerrequisitos
  const targetBtn = document.getElementById('wp-step-' + step + '-btn');
  if (targetBtn && targetBtn.classList.contains('disabled')) {
    if (typeof showToast === 'function') {
      showToast('PASO BLOQUEADO', targetBtn.title || 'Completa los pasos previos requeridos', 'warning', 2500);
    }
    return;
  }

  wpCurrentStep = step;
  if (typeof window !== 'undefined') window.wpCurrentStep = step;

  // 1.2 Apagado seguro de herramientas interactivas al cambiar de paso
  if (typeof window.RAMeasureTool !== 'undefined' && typeof window.RAMeasureTool.deactivate === 'function') {
    window.RAMeasureTool.deactivate();
  }
  if (typeof wpCancelCurrentMode === 'function') {
    wpCancelCurrentMode();
  }
  if (typeof cancelObstaclePlacement === 'function') {
    cancelObstaclePlacement();
  }
  if (typeof wpCancelCableRouting === 'function') {
    wpCancelCableRouting();
  }
  if (typeof selectObstacle === 'function') {
    selectObstacle(null);
  }
  if (typeof selectBuilding === 'function') {
    selectBuilding(null);
  }
  if (typeof selectElectricalObject === 'function') {
    selectElectricalObject(null);
  }

  // 2. Conmutar botones activos del Stepper (1..5)
  for (let i = 1; i <= 5; i++) {
    const b = document.getElementById('wp-step-' + i + '-btn');
    if (b) b.classList.toggle('active', i === step);
  }

  // 3. Ocultar todos los contenedores de paso
  const allStepContainers = [
    'wp-step-2-content', 'wp-step-3-content', 'wp-step-4-content', 'wp-step-5-content',
    'wp-p1-plane-content', 'wp-p1-roof-content', 'wp-p1-obs-content'
  ];
  allStepContainers.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  // 4. Actualizar Banner Informativo del Paso Activo (5 Pasos Canónicos v3.0)
  const bannerPhase = document.getElementById('wp-banner-phase');
  const bannerTitle = document.getElementById('wp-banner-step-title');
  const stepTitles = {
    1: { phase: 'FASE I · EMPLAZAMIENTO', title: 'Paso 1: Emplazamiento - Plano, Faldones & Obstáculos' },
    2: { phase: 'FASE II · CAMPO SOLAR', title: 'Paso 2: Campo Solar - Módulos FV, Disposición & Orientación' },
    3: { phase: 'FASE III · ANÁLISIS SOLAR', title: 'Paso 3: Análisis Solar - Sombras 3D, Heatmap & Factura' },
    4: { phase: 'FASE IV · INGENIERÍA ELÉCTRICA', title: 'Paso 4: Ingeniería - Inversores, Strings & Cableado' },
    5: { phase: 'FASE V · ENTREGA & MEDICIONES', title: 'Paso 5: Entrega - Viabilidad, Presupuesto & Memoria PDF' }
  };
  if (stepTitles[step]) {
    if (bannerPhase) bannerPhase.textContent = stepTitles[step].phase;
    if (bannerTitle) bannerTitle.textContent = stepTitles[step].title;
  }

  // 5. Mapeo Canónico Virtual a los 5 Pasos Canónicos (Flujo v3.0):
  
  // [MOVER TARJETAS DE FALDONES ENTRE PASOS 1 Y 2]
  

  if (step === 1) {
    // <i data-lucide=\"home\" class=\"icon-sm\"></i> PASO 1: EMPLAZAMIENTO (Plano + Cubierta/Faldones + Obstáculos)
    const c1 = document.getElementById('wp-p1-plane-content');
    const c2 = document.getElementById('wp-p1-roof-content');
    const c3 = document.getElementById('wp-p1-obs-content');
    if (c1) c1.style.display = 'flex';
    if (c2) c2.style.display = 'flex';
    if (c3) c3.style.display = 'flex';
    if (typeof wpToggleEmplacementSection === 'function') {
      const hasPlanes = (typeof WP !== 'undefined' && WP.planes && WP.planes.length > 0);
      wpToggleEmplacementSection(hasPlanes ? 'roof' : 'plane', true);
    }
    // NOTA: NO se destruye el equipo eléctrico colocado al visitar el Paso 1.
    // Antes wpClearInverterAndCables() borraba inversor/contador/cuadro DC y tiradas
    // cada vez que se volvia a Emplazamiento (perdida del gemelo digital).
    if (typeof wpUpdateStep3UI === 'function') wpUpdateStep3UI();
  } else if (step === 2) {
    // <i data-lucide=\"sun\" class=\"icon-sm\"></i> PASO 2: CAMPO SOLAR
    if (typeof wpUpdateStep3UI === 'function') wpUpdateStep3UI();
    // (Arrays 3D, Inclinación, Azimut, Módulos FV)
    const c2 = document.getElementById('wp-step-2-content');
    if (c2) c2.style.display = 'flex';
    if (typeof WP !== 'undefined' && WP && WP.polylines && WP.polylines.length > 0) {
      const activeIdx = (WP.selectedPolyIdx >= 0 && WP.selectedPolyIdx < WP.polylines.length) ? WP.selectedPolyIdx : 0;
      if (WP.polylines[activeIdx] && WP.polylines[activeIdx].points && WP.polylines[activeIdx].points.length >= 3) {
        polygonPoints = WP.polylines[activeIdx].points.map(p => Cesium.Cartesian3.clone(p));
      }
    }
    if (typeof roofPanelsCache !== 'undefined' && roofPanelsCache) {
      roofPanelsCache.sig = '';
      roofPanelsCache.data = null;
    }
    if (typeof populateStep3EquipmentSelectors === 'function') populateStep3EquipmentSelectors();
    if (typeof wpSyncStep6Controls === 'function') wpSyncStep6Controls();
    // NOTA: isPolygonDesignConfirmed NO se fuerza aquí. Lo activa step5RegenerateLayout /
    // wpFastRenderSimulatedPanels cuando el layout se genera de verdad (evita desbloquear
    // pasos 3-5 con 0 paneles).
    // Await del pipeline asíncrono: solo regenerar desde cero si no hay paneles aún en memoria
    const hasExistingPanels = (Array.isArray(window.allRenderedPanels) && window.allRenderedPanels.some(p => p && !p.deleted)) ||
                              (typeof WP !== 'undefined' && WP && Array.isArray(WP.polylines) && WP.polylines.some(p => p && ((p.panels && p.panels.length > 0) || (p.roofInfo && p.roofInfo.panels && p.roofInfo.panels.length > 0))));
    if (!hasExistingPanels && typeof step5RegenerateLayout === 'function') {
      await step5RegenerateLayout();
    } else if (typeof wpFastRenderSimulatedPanels === 'function') {
      await wpFastRenderSimulatedPanels();
    }
    if (typeof wpRenderMonthlyProductionChart === 'function') {
      wpRenderMonthlyProductionChart();
    }
  } else if (step === 3) {
    // <i data-lucide="cloud-sun" class="icon-sm"></i> PASO 3: ANÁLISIS SOLAR (Factura, Demanda, Heatmap Sombras)
    const c3 = document.getElementById('wp-step-3-content');
    if (c3) c3.style.display = 'flex';
    // Sincronizar visualmente el criterio técnico sin disparar eventos de recálculo ni invalidación
    if (window.solarProjectConfig && window.solarProjectConfig.selectedObjective) {
      const activeObj = window.solarProjectConfig.selectedObjective;
      const radios = document.getElementsByName('project_objective');
      for (let r of radios) {
        r.checked = (r.value === activeObj);
      }
    }
    if (typeof wpUpdateStep3DirtyAlert === 'function') wpUpdateStep3DirtyAlert();
    if (typeof wpUpdateCommercialPathsUI === 'function') wpUpdateCommercialPathsUI();
    if (typeof wpUpdateShadedCleanupUI === 'function') wpUpdateShadedCleanupUI();
  } else if (step === 4) {
    // PASO 4: INGENIERÍA ELÉCTRICA (Inversor, Batería, Strings, Cableado)
    const c4 = document.getElementById('wp-step-4-content');
    if (c4) c4.style.display = 'flex';
    // Auto-Ingeniería Fotovoltaica Zero-Click: selecciona la electrónica óptima según sombras, orientaciones y potencia
    if (typeof wpAutoSelectOptimalEngineering === 'function') {
      try { wpAutoSelectOptimalEngineering(false); } catch(eEng) { console.warn('[Auto-Engineering] Error:', eEng); }
    }
    if (typeof populateStep3EquipmentSelectors === 'function') populateStep3EquipmentSelectors();
    if (typeof step3UpdateHardwareSelection === 'function') step3UpdateHardwareSelection();
    if (typeof wpComputeAutoSizing === 'function') wpComputeAutoSizing();
    if (typeof wpCalculateAndRenderInverterCables === 'function') {
      wpCalculateAndRenderInverterCables();
    }
    if (typeof wpUpdateCableRoutesUI === 'function') {
      wpUpdateCableRoutesUI();
    }
    if (typeof raRenderLossFields === 'function') {
      raRenderLossFields();
    }
    if (typeof wpUpdateInverterSmartAssistantUI === 'function') {
      wpUpdateInverterSmartAssistantUI();
    }
    if (typeof wpUpdateMeterPlacementGuideUI === 'function') {
      wpUpdateMeterPlacementGuideUI();
    }
  } else if (step === 5) {
    // <i data-lucide=\"file-text\" class=\"icon-sm\"></i> PASO 5: ENTREGA, PRESUPUESTO & MEMORIA PDF
    const c5 = document.getElementById('wp-step-5-content');
    if (c5) c5.style.display = 'flex';
    if (typeof wpCalculateAndRenderInverterCables === 'function') {
      wpCalculateAndRenderInverterCables();
    }
    const sumContainer = document.getElementById('step5-executive-summary-container');
    if (sumContainer && typeof EngineeringExplainer !== 'undefined' && typeof EngineeringExplainer.generateExecutiveSummaryHTML === 'function') {
      const pCalcs = (typeof getProjectCalcs === 'function') ? getProjectCalcs() : {};
      sumContainer.innerHTML = EngineeringExplainer.generateExecutiveSummaryHTML(pCalcs);
    }
    if (typeof updateBudgetUI === 'function') updateBudgetUI();
    if (typeof wpRenderMonthlyProductionChart === 'function') {
      wpRenderMonthlyProductionChart();
    }
    if (typeof wpUpdateStep5PricingBadge === 'function') {
      wpUpdateStep5PricingBadge();
    }
  }

  if (typeof wpUpdateControlsAvailability === 'function') {
    wpUpdateControlsAvailability();
  }

  // Renderizar iconos SVG de Lucide en todos los pasos
  if (typeof window !== 'undefined' && window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }

  const currentViewer = typeof viewer !== 'undefined' && viewer ? viewer : (window.viewer || null);
  const currentScene = currentViewer ? currentViewer.scene : null;
  if (currentScene && typeof currentScene.requestRender === 'function') {
    currentScene.requestRender();
  }
}
window.wpGoToStep = wpGoToStep;

function wpToggleEmplacementSection(section, forceOpen) {
  const sections = ['plane', 'roof', 'obs'];
  const targetBody = document.getElementById('wp-subdock-body-' + section);
  const isCurrentlyOpen = targetBody && targetBody.style.display !== 'none';
  const shouldOpenTarget = forceOpen ? true : !isCurrentlyOpen;

  sections.forEach(sec => {
    const hdr = document.getElementById('wp-subdock-hdr-' + sec);
    const body = document.getElementById('wp-subdock-body-' + sec);
    const chev = document.getElementById('wp-subdock-chev-' + sec);
    const shouldOpen = (sec === section) ? shouldOpenTarget : false;

    if (body) {
      body.style.display = shouldOpen ? 'flex' : 'none';
    }
    if (hdr) {
      hdr.classList.toggle('active', shouldOpen);
    }
    if (chev) {
      chev.textContent = shouldOpen ? '▼' : '▶';
    }
  });
}
window.wpToggleEmplacementSection = wpToggleEmplacementSection;

function wpContinueToCubierta() {
  const c2 = document.getElementById('wp-p1-roof-content');
  const c3 = document.getElementById('wp-p1-obs-content');
  if (c2) c2.style.display = 'flex';
  if (c3) c3.style.display = 'flex';
  if (typeof wpToggleEmplacementSection === 'function') {
    wpToggleEmplacementSection('roof', true);
  }
  const brushPanel = document.getElementById('ra-brush-panel') || document.getElementById('btn-draw-polyline');
  if (brushPanel) {
    brushPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  if (typeof wpRestoreCameraNavigation === 'function') {
    wpRestoreCameraNavigation();
  }
}
window.wpContinueToCubierta = wpContinueToCubierta;

function wpContinueToObstacles() {
  const c3 = document.getElementById('wp-p1-obs-content');
  if (c3) c3.style.display = 'flex';
  if (typeof wpToggleEmplacementSection === 'function') {
    wpToggleEmplacementSection('obs', true);
  }
  const obsHdr = document.getElementById('wp-subdock-hdr-obs');
  if (obsHdr) {
    obsHdr.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}
window.wpContinueToObstacles = wpContinueToObstacles;

function wpUpdateStep3UI() {
  const polys = (WP && WP.polylines) ? WP.polylines : [];

  // ── Métricas globales (badges del Paso 2) ──
  let totalModules = 0, totalWp = 0;
  polys.forEach(p => {
    const pCount = (p.roofInfo && p.roofInfo.panels) ? p.roofInfo.panels.length : 0;
    totalModules += pCount;
    totalWp += pCount * wpGetPolyWp(p);
  });
  if (totalModules === 0 && typeof simulatedPanelEntities !== 'undefined') {
    totalModules = simulatedPanelEntities.length;
    const _defWp = (typeof panelConfig !== 'undefined' && panelConfig && panelConfig.potencia) ? panelConfig.potencia : 450;
    totalWp = totalModules * _defWp;
  }
  const p3Panels = document.getElementById('p3-stat-panels');
  const p3Kwp = document.getElementById('p3-stat-kwp');
  const p3Strings = document.getElementById('p3-stat-strings');
  if (p3Panels) p3Panels.textContent = totalModules;
  if (p3Kwp) p3Kwp.textContent = (totalWp / 1000).toFixed(2) + ' kWp';

  let _realStringCount = 0;
  if (typeof window !== 'undefined' && window.allRenderedPanels && window.allRenderedPanels.length > 0) {
    _realStringCount = new Set(window.allRenderedPanels.filter(p => p && p.stringName).map(p => p.stringName)).size;
  }
  if (p3Strings) p3Strings.textContent = _realStringCount > 0 ? (_realStringCount + (_realStringCount === 1 ? ' String' : ' Strings')) : '—';

  // ── Sincronizar dropdown selector de faldón ──
  const dropdown = document.getElementById('faldon-selector-dropdown');
  if (dropdown) {
    dropdown.innerHTML = polys.map((poly, idx) => {
      const pName = poly.name || ('Faldón #' + (idx + 1));
      const pArea = (typeof poly.area === 'number') ? poly.area : 0;
      const modCount = (poly.roofInfo && poly.roofInfo.panels) ? poly.roofInfo.panels.length : 0;
      return '<option value="' + idx + '"' + (idx === WP.selectedPolyIdx ? ' selected' : '') + '>' +
        pName + ' (' + modCount + ' mods · ' + pArea.toFixed(1) + ' m²)</option>';
    }).join('');
  }
  const countBadge = document.getElementById('faldon-count-badge');
  if (countBadge) countBadge.textContent = polys.length + (polys.length === 1 ? ' FALDÓN' : ' FALDONES');

  // ── Poblar tarjeta única ──
  wpPopulateFaldonCard();
}

// ─────────────────────────────────────────────────────────────────
// wpPopulateFaldonCard: lee SSOT → rellena la tarjeta estática
// Función pura de presentación. No muta WP ni dispara simulaciones.
// ─────────────────────────────────────────────────────────────────
function wpPopulateFaldonCard() {
  var card = document.getElementById('faldon-edit-card');
  var emptyState = document.getElementById('faldon-empty-state');
  var selectorCtr = document.getElementById('faldon-selector-container');
  var polys = (WP && WP.polylines) ? WP.polylines : [];

  // ── Estado vacío ──
  if (polys.length === 0) {
    if (selectorCtr) selectorCtr.style.display = 'none';
    if (card) card.style.display = 'none';
    if (emptyState) emptyState.style.display = 'block';
    return;
  }
  if (selectorCtr) selectorCtr.style.display = 'block';
  if (emptyState) emptyState.style.display = 'none';

  // Asegurar selección válida
  if (WP.selectedPolyIdx < 0 || WP.selectedPolyIdx >= polys.length) {
    WP.selectedPolyIdx = 0;
  }
  var poly = polys[WP.selectedPolyIdx];
  if (!poly) { if (card) card.style.display = 'none'; return; }
  if (card) card.style.display = 'block';

  // ── Cabecera ──
  var nameEl = document.getElementById('faldon-card-name');
  if (nameEl) nameEl.textContent = poly.name || ('Faldón #' + (WP.selectedPolyIdx + 1));

  var modCount = (poly.roofInfo && poly.roofInfo.panels) ? poly.roofInfo.panels.length : 0;
  var effectiveModId = poly.moduleId || (window.solarProjectConfig && window.solarProjectConfig.selectedModuleId) || '';
  var polyModWp = 450;
  if (typeof equipmentCatalog !== 'undefined' && equipmentCatalog && Array.isArray(equipmentCatalog.modules)) {
    var foundM = equipmentCatalog.modules.find(function(m) { return m.id === effectiveModId; });
    if (foundM && foundM.wp) polyModWp = foundM.wp;
    else if (typeof panelConfig !== 'undefined' && panelConfig && panelConfig.potencia) polyModWp = panelConfig.potencia;
  } else if (typeof panelConfig !== 'undefined' && panelConfig && panelConfig.potencia) {
    polyModWp = panelConfig.potencia;
  }
  var kwp = (modCount * polyModWp / 1000).toFixed(2);
  var statsEl = document.getElementById('faldon-card-stats');
  if (statsEl) statsEl.innerHTML = modCount + ' mods <span style="font-size:8px;color:var(--amber-400);margin-left:4px;">· ' + kwp + ' kWp</span>';

  // ── Selector de módulo FV ──
  var modSelect = document.getElementById('faldon-module-select');
  if (modSelect && typeof equipmentCatalog !== 'undefined' && equipmentCatalog && Array.isArray(equipmentCatalog.modules)) {
    modSelect.innerHTML = equipmentCatalog.modules.map(function(m) {
      return '<option value="' + m.id + '"' + (m.id === effectiveModId ? ' selected' : '') + '>' +
        m.brand + ' ' + m.model + ' (' + m.wp + 'Wp · ' + m.l.toFixed(2) + '×' + m.w.toFixed(2) + 'm)</option>';
    }).join('');
  }

  // ── Selector de estructura ──
  var structSelect = document.getElementById('faldon-structure-select');
  var effStruct = poly.structureType || (poly.estructura && poly.estructura.tipo === 'pergola' ? 'pergola' : 'coplanar_teja');
  if (structSelect) structSelect.value = effStruct;

  var pergolaRow = document.getElementById('faldon-pergola-row');
  if (pergolaRow) {
    var isPerg = (effStruct === 'pergola' || (poly.estructura && poly.estructura.tipo === 'pergola'));
    pergolaRow.style.display = isPerg ? 'flex' : 'none';
    if (isPerg) {
      var hInput = document.getElementById('faldon-pergola-h');
      if (hInput) hInput.value = (poly.estructura && poly.estructura.clearance) ? poly.estructura.clearance : 1.80;
    }
  }

  var structMfgSelect = document.getElementById('faldon-structure-mfg-select');
  if (structMfgSelect) {
    var effectiveMfg = poly.structureManufacturer || (window.RAStructureCatalog ? window.RAStructureCatalog.getActiveManufacturer(WP.selectedPolyIdx) : 'sunfer');
    structMfgSelect.value = effectiveMfg;
  }

  // ── Disposición solar (arrangement) ──
  var tilt = poly.modTilt || 'auto';
  var az = (poly.modAzimuth !== undefined) ? poly.modAzimuth : 'auto';
  var arrMode = poly.arrangementMode || ((tilt === 'auto' || tilt === undefined) ? 'coplanar' : ((tilt === 32 || tilt === 'optimal') ? 'solar_optimal' : 'custom'));

  var arrButtons = {
    coplanar:      { el: document.getElementById('faldon-arr-coplanar'),  border: 'var(--emerald-400)', color: 'var(--emerald-400)', bg: 'rgba(16,185,129,0.2)' },
    solar_optimal: { el: document.getElementById('faldon-arr-optimal'),   border: 'var(--amber-400)',   color: 'var(--amber-400)',   bg: 'rgba(245,158,11,0.25)' },
    custom:        { el: document.getElementById('faldon-arr-custom'),    border: 'var(--sky-400)',     color: 'var(--sky-400)',     bg: 'rgba(56,189,248,0.2)' }
  };
  Object.keys(arrButtons).forEach(function(key) {
    var cfg = arrButtons[key];
    if (!cfg.el) return;
    var isActive = (key === arrMode);
    cfg.el.style.borderColor = isActive ? cfg.border : '';
    cfg.el.style.color       = isActive ? cfg.color  : '';
    cfg.el.style.background  = isActive ? cfg.bg     : '';
  });

  var legendEl = document.getElementById('faldon-arr-legend');
  if (legendEl) {
    var leftTxt = arrMode === 'coplanar'
      ? '<i data-lucide="home" class="icon-sm"></i> Paralelo a faldón · Paso 0.04m'
      : (arrMode === 'solar_optimal'
          ? '<i data-lucide="sun" class="icon-sm"></i> Óptima: 32° · Sur (180°)'
          : '<i data-lucide="settings" class="icon-sm"></i> Ajuste personalizado manual');
    var isAntiShadow = (arrMode === 'solar_optimal' || (tilt !== 'auto' && Number(tilt) > 0));
    var rightTxt = isAntiShadow ? '<i data-lucide="check-circle" class="icon-sm"></i> Anti-sombra OK' : 'Coplanar';
    var rightColor = isAntiShadow ? '#34D399' : '#94A3B8';
    legendEl.innerHTML = '<span>' + leftTxt + '</span><span style="color:' + rightColor + ';font-weight:bold;">' + rightTxt + '</span>';
  }

  // ── Orientación y Comparador Vertical vs Horizontal ──
  var orient = poly.orientationPref || (typeof userPanelOrientationPref !== 'undefined' ? userPanelOrientationPref : 'portrait');
  var comp = (typeof wpGetFaldonOrientationComparison === 'function') ? wpGetFaldonOrientationComparison(poly) : null;

  var pLbl = document.getElementById('faldon-orient-portrait-lbl');
  var lLbl = document.getElementById('faldon-orient-landscape-lbl');
  var hLbl = document.getElementById('faldon-orient-hybrid-lbl');
  var recBadge = document.getElementById('faldon-orient-recommend-badge');

  if (comp) {
    if (pLbl) pLbl.textContent = comp.portrait.count + ' mods · ' + comp.portrait.kwp + ' kWp';
    if (lLbl) lLbl.textContent = comp.landscape.count + ' mods · ' + comp.landscape.kwp + ' kWp';
    if (hLbl && comp.hybrid) hLbl.textContent = comp.hybrid.count + ' mods · ' + comp.hybrid.kwp + ' kWp';
    if (recBadge) {
      if (comp.recommended === 'hybrid') {
        var extraH = comp.hybrid.count - Math.max(comp.portrait.count, comp.landscape.count);
        recBadge.textContent = '💡 Híbrido Mixto gana: +' + extraH + ' mods (' + comp.hybrid.kwp + ' kWp)';
        recBadge.style.color = '#C084FC';
        recBadge.style.background = 'rgba(168,85,247,0.18)';
      } else if (comp.recommended === 'landscape') {
        recBadge.textContent = '💡 Horizontal gana: +' + comp.diff + ' mods (+' + comp.diffKwp + ' kWp)';
        recBadge.style.color = '#34D399';
        recBadge.style.background = 'rgba(16,185,129,0.15)';
      } else if (comp.recommended === 'portrait') {
        recBadge.textContent = '💡 Vertical gana: +' + Math.abs(comp.diff) + ' mods (+' + comp.diffKwp + ' kWp)';
        recBadge.style.color = '#34D399';
        recBadge.style.background = 'rgba(16,185,129,0.15)';
      } else {
        recBadge.textContent = '⚖️ Igual rendimiento (' + comp.portrait.count + ' mods)';
        recBadge.style.color = 'var(--text-slate-300)';
        recBadge.style.background = 'rgba(255,255,255,0.06)';
      }
    }
  }

  var isCoplanarPoly = (!poly.estructura || poly.estructura.tipo === 'coplanar') && (poly.modTilt === 'coplanar' || poly.modTilt === 0 || poly.modTilt === 'auto');
  var hBtn = document.getElementById('faldon-orient-hybrid');
  if (hBtn) {
    if (!isCoplanarPoly) {
      hBtn.disabled = true;
      hBtn.style.opacity = '0.35';
      hBtn.style.cursor = 'not-allowed';
      hBtn.title = 'Híbrido (V+H) no disponible con triángulos inclinados (evita autosombreado)';
      if (hLbl) hLbl.textContent = 'Solo coplanar';
    } else {
      hBtn.disabled = false;
      hBtn.style.opacity = '1.0';
      hBtn.style.cursor = 'pointer';
      hBtn.title = 'Combina vertical y horizontal en el mismo faldón para aprovechar esquinas y remanentes';
    }
  }

  ['portrait', 'landscape', 'hybrid'].forEach(function(dir) {
    var btn = document.getElementById('faldon-orient-' + dir);
    if (!btn) return;
    var isActive = (orient === dir);
    btn.className = 'doc-mini-btn' + (isActive ? ' active' : '');
    btn.style.borderColor = isActive ? (dir === 'hybrid' ? '#C084FC' : 'var(--amber-400)') : '';
    btn.style.color       = isActive ? (dir === 'hybrid' ? '#C084FC' : 'var(--amber-400)') : '';
    btn.style.background  = isActive ? (dir === 'hybrid' ? 'rgba(168,85,247,0.2)' : 'rgba(245,158,11,0.2)') : '';
    btn.style.fontWeight  = isActive ? 'bold' : '';
  });

  // ── Pasillo Central de Mantenimiento ──
  var walkwayBtn = document.getElementById('faldon-walkway-toggle-btn');
  if (walkwayBtn) {
    var hasW = !!poly.hasWalkway;
    walkwayBtn.textContent = hasW ? '✓ SÍ (Pasillo 0.80m)' : 'NO (Cobertura total)';
    walkwayBtn.style.color = hasW ? '#34D399' : 'var(--text-slate-400)';
    walkwayBtn.style.background = hasW ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.05)';
    walkwayBtn.style.borderColor = hasW ? 'rgba(16,185,129,0.4)' : '';
  }

  // ── Controles personalizados (sliders) ──
  var customCtrl = document.getElementById('faldon-custom-controls');
  if (customCtrl) customCtrl.style.display = arrMode === 'custom' ? 'flex' : 'none';

  var tiltVal = document.getElementById('faldon-tilt-val');
  if (tiltVal) tiltVal.textContent = (tilt === 'auto' ? 'Auto (faldón)' : (tilt + '°'));

  var tiltSlider = document.getElementById('faldon-tilt-slider');
  if (tiltSlider) tiltSlider.value = (tilt === 'auto' ? 0 : tilt);

  var azVal = document.getElementById('faldon-az-val');
  if (azVal) azVal.textContent = (az === 'auto' ? 'Auto' : (az + '° · ' + (typeof getAzimuthCardinalShort === 'function' ? getAzimuthCardinalShort(Number(az)) : '')));

  var azSlider = document.getElementById('faldon-az-slider');
  if (azSlider) azSlider.value = (az === 'auto' ? 180 : az);

  // Refrescar iconos Lucide
  if (window.lucide) try { lucide.createIcons(); } catch(_) {}
}
window.wpPopulateFaldonCard = wpPopulateFaldonCard;

// ─────────────────────────────────────────────────────────────────
// wpSelectFaldon: selección unificada (SSOT → escena + tarjeta)
// Lightweight: no dispara recalculateLayoutAndObstacles ni
// startSolarPanelsSimulation. Para eso usar wpSelectPolyline().
// ─────────────────────────────────────────────────────────────────
function wpSelectFaldon(idx) {
  if (!WP.polylines || WP.polylines.length === 0) {
    WP.selectedPolyIdx = -1;
    WP.selectedVtxIdx = -1;
    wpUpdateStep3UI();
    return;
  }
  if (idx < 0 || idx >= WP.polylines.length) idx = 0;

  WP.selectedPolyIdx = idx;
  WP.selectedVtxIdx = -1;

  var poly = WP.polylines[idx];
  if (poly && typeof poly.planeIdx === 'number') {
    WP.activePlaneIdx = poly.planeIdx;
  }
  if (poly) {
    polygonPoints = poly.points.map(function(p) { return Cesium.Cartesian3.clone(p); });
    selectedVertexIndex = -1;
  }

  // Sincronizar selectores desplegables si difieren
  var dropdown = document.getElementById('faldon-selector-dropdown');
  if (dropdown && dropdown.value !== String(idx)) dropdown.value = String(idx);
  var dropdownP1 = document.getElementById('wp-polylines-dropdown');
  if (dropdownP1 && dropdownP1.value !== String(idx)) dropdownP1.value = String(idx);

  wpRenderAllPolylines();
  wpUpdateUI();
  wpPopulateFaldonCard();
  if (typeof wpSyncStep6Controls === 'function') wpSyncStep6Controls();

  if (typeof recalculateSolarYield === 'function') recalculateSolarYield();

  if (poly) {
    showStatus('<i data-lucide="crosshair" class="icon-sm"></i> ' +
      (poly.name || ('FALDÓN #' + (idx + 1))).toUpperCase() + ' SELECCIONADO (' +
      poly.points.length + ' vtx · ' + poly.area.toFixed(1) + ' m²)', 2000);
  }
}
window.wpSelectFaldon = wpSelectFaldon;

function wpSetPolyModule(polyIdx, modId) {
  if (!WP.polylines || !WP.polylines[polyIdx]) return;
  WP.polylines[polyIdx].moduleId = modId;

  // [FIX-MÓDULOS] Ya NO se toca window.solarProjectConfig.selectedModuleId ni el
  // selector global: el módulo elegido pertenece SÓLO a este faldón. Actualizar el
  // global hacía que los faldones sin selección explícita heredasen el módulo del
  // último faldón editado (propagación reportada por el usuario). El selector
  // global de Paso 2 (step2SelectModule) sigue existiendo para "aplicar a todos".

  WP.selectedPolyIdx = polyIdx;

  if (typeof roofPanelsCache !== "undefined" && roofPanelsCache) {
    roofPanelsCache.sig = "";
  }

  if (typeof computeSinglePolylineRoofInfo === "function") {
    WP.polylines[polyIdx].roofInfo = computeSinglePolylineRoofInfo(WP.polylines[polyIdx].points, WP.polylines[polyIdx]);
  }

  if (typeof window.wpInvalidateHeatmap === 'function') window.wpInvalidateHeatmap('Módulo FV modificado');
  if (typeof wpFastRenderSimulatedPanels === "function") wpFastRenderSimulatedPanels();
  if (typeof recalculateSolarYield === "function") recalculateSolarYield();
  wpUpdateStep3UI();

  let modName = modId;
  if (typeof equipmentCatalog !== 'undefined' && equipmentCatalog && Array.isArray(equipmentCatalog.modules)) {
    const fm = equipmentCatalog.modules.find(m => m.id === modId);
    if (fm) modName = fm.brand + " " + fm.model + " (" + fm.wp + "Wp)";
  }
  showStatus("MÓDULO ASIGNADO A " + (WP.polylines[polyIdx].name || ("FALDÓN #" + (polyIdx + 1))) + ": " + modName, 2500);
}

function wpApplyPolyModuleToAll(sourcePolyIdx) {
  if (!WP.polylines || !WP.polylines[sourcePolyIdx]) return;
  const targetModId = WP.polylines[sourcePolyIdx].moduleId || (typeof window !== 'undefined' && window.solarProjectConfig && window.solarProjectConfig.selectedModuleId);
  if (!targetModId) return;

  if (typeof roofPanelsCache !== "undefined" && roofPanelsCache) {
    roofPanelsCache.sig = "";
  }

  WP.polylines.forEach(poly => {
    poly.moduleId = targetModId;
    if (typeof computeSinglePolylineRoofInfo === "function") {
      poly.roofInfo = computeSinglePolylineRoofInfo(poly.points, poly);
    }
  });

  if (typeof window !== 'undefined' && window.solarProjectConfig) {
    window.solarProjectConfig.selectedModuleId = targetModId;
  }
  if (typeof onSelectModuleFromDropdown === 'function') {
    onSelectModuleFromDropdown(targetModId);
  }

  if (typeof window.wpInvalidateHeatmap === 'function') window.wpInvalidateHeatmap('Módulo FV aplicado a todos los faldones');
  if (typeof wpFastRenderSimulatedPanels === "function") wpFastRenderSimulatedPanels();
  if (typeof recalculateSolarYield === "function") recalculateSolarYield();
  wpUpdateStep3UI();

  let modName = targetModId;
  if (typeof equipmentCatalog !== 'undefined' && equipmentCatalog && Array.isArray(equipmentCatalog.modules)) {
    const fm = equipmentCatalog.modules.find(m => m.id === targetModId);
    if (fm) modName = fm.brand + " " + fm.model + " (" + fm.wp + "Wp)";
  }
  showStatus("<i data-lucide=\"check\" class=\"icon-sm\"></i> MÓDULO " + modName + " APLICADO A TODOS LOS FALDONES", 3000);
}

window.wpSetPolyModule = wpSetPolyModule;
window.wpApplyPolyModuleToAll = wpApplyPolyModuleToAll;

function wpApplyPanelArrangement(polyIdx, mode) {
  if (!WP.polylines || !WP.polylines[polyIdx]) return;
  const poly = WP.polylines[polyIdx];
  WP.selectedPolyIdx = polyIdx;

  const lat = (typeof window.solarProjectConfig !== 'undefined' && window.solarProjectConfig && window.solarProjectConfig.latitude) 
    ? window.solarProjectConfig.latitude 
    : 40.4168;
  const optimalTilt = Math.min(35, Math.max(15, Math.round(3.7 + 0.69 * Math.abs(lat))));

  poly.arrangementMode = mode;

  if (mode === 'coplanar') {
    poly.modTilt = 'auto';
    poly.modAzimuth = 'auto';
    if (!poly.estructura) poly.estructura = { tipo: 'coplanar', clearance: 0 };
    if (poly.estructura.tipo !== 'pergola') poly.estructura.tipo = 'coplanar';
    if (!poly.structureType || poly.structureType.includes('triangle')) poly.structureType = 'coplanar_teja';
  } else if (mode === 'solar_optimal') {
    if (!poly.estructura) poly.estructura = { tipo: 'balasto', clearance: 0.20 };
    if (poly.estructura.tipo === 'coplanar') poly.estructura.tipo = 'balasto';
    if (!poly.structureType || !poly.structureType.includes('triangle')) poly.structureType = 'triangles_30';
    // Si la cubierta tiene pendiente > 8º y mira a vertiente Sur, acopla inclinación al faldón
    const slope = (poly.roofInfo && poly.roofInfo.tiltDeg !== undefined) ? poly.roofInfo.tiltDeg : 0;
    const rAz = (poly.roofInfo && poly.roofInfo.azimuthDeg !== undefined) ? poly.roofInfo.azimuthDeg : 180;
    const isSouthFavorable = (slope > 8 && rAz >= 100 && rAz <= 260);

    if (isSouthFavorable) {
      poly.modTilt = (slope < 15) ? Math.min(optimalTilt, slope + 10) : slope;
      poly.modAzimuth = 'auto'; // Toma el azimut del faldón
    } else {
      poly.modTilt = optimalTilt;
      poly.modAzimuth = 180; // Sur estricto
    }
  } else if (mode === 'custom') {
    if (!poly.estructura) poly.estructura = { tipo: 'balasto', clearance: 0.20 };
    if (poly.estructura.tipo === 'coplanar') poly.estructura.tipo = 'balasto';
    if (!poly.structureType || !poly.structureType.includes('triangle')) poly.structureType = 'triangles_30';

    if (poly.modTilt === 'auto' || poly.modTilt === undefined) poly.modTilt = optimalTilt;
    if (poly.modAzimuth === 'auto' || poly.modAzimuth === undefined) poly.modAzimuth = 180;
  }

  if (typeof roofPanelsCache !== 'undefined' && roofPanelsCache) {
    roofPanelsCache.sig = '';
    roofPanelsCache.data = null;
  }

  if (typeof computeSinglePolylineRoofInfo === 'function') {
    poly.roofInfo = computeSinglePolylineRoofInfo(poly.points, poly);
  }

  if (typeof window.wpInvalidateHeatmap === 'function') window.wpInvalidateHeatmap('Disposición de paneles modificada');
  if (typeof wpFastRenderSimulatedPanels === 'function') wpFastRenderSimulatedPanels();
  if (typeof recalculateSolarYield === 'function') recalculateSolarYield();

  wpUpdateStep3UI();
  if (typeof wpSyncStep6Controls === 'function') wpSyncStep6Controls();
  if (typeof wpSyncEstructuraUI === 'function') wpSyncEstructuraUI();

  const slopeVal = (poly.roofInfo && poly.roofInfo.tiltDeg !== undefined) ? poly.roofInfo.tiltDeg : 0;
  const isSouthFav = (slopeVal > 8 && poly.modAzimuth === 'auto');
  const modeNames = {
    coplanar: 'COPLANAR AL FALDÓN',
    solar_optimal: isSouthFav ? `CARA AL SOL (ACOPLADO AL FALDÓN · ${poly.modTilt}°)` : `CARA AL SOL (SUR ESTRICTO · ${optimalTilt}° · 180°)`,
    custom: 'PERSONALIZADA (MANUAL)'
  };
  showStatus(`<i data-lucide="check" class="icon-sm"></i> DISPOSICIÓN ${modeNames[mode] || mode.toUpperCase()} EN ${poly.name || ('FALDÓN #' + (polyIdx + 1))}`, 2500);
}

function wpApplyPanelArrangementToAll(sourcePolyIdx) {
  if (!WP.polylines || !WP.polylines[sourcePolyIdx]) return;
  const src = WP.polylines[sourcePolyIdx];
  const mode = src.arrangementMode || 'coplanar';
  const tilt = src.modTilt;
  const az = src.modAzimuth;

  if (typeof roofPanelsCache !== 'undefined' && roofPanelsCache) {
    roofPanelsCache.sig = '';
    roofPanelsCache.data = null;
  }

  WP.polylines.forEach(poly => {
    poly.arrangementMode = mode;
    poly.modTilt = tilt;
    poly.modAzimuth = az;
    if (typeof computeSinglePolylineRoofInfo === 'function') {
      poly.roofInfo = computeSinglePolylineRoofInfo(poly.points, poly);
    }
  });

  if (typeof window.wpInvalidateHeatmap === 'function') window.wpInvalidateHeatmap('Disposición propagada a todos los faldones');
  if (typeof wpFastRenderSimulatedPanels === 'function') wpFastRenderSimulatedPanels();
  if (typeof recalculateSolarYield === 'function') recalculateSolarYield();

  wpUpdateStep3UI();
  if (typeof wpSyncStep6Controls === 'function') wpSyncStep6Controls();

  showStatus(`<i data-lucide="check" class="icon-sm"></i> DISPOSICIÓN PROPAGADA A TODOS LOS FALDONES (${WP.polylines.length} CUBIERTAS)`, 3000);
}

window.wpApplyPanelArrangement = wpApplyPanelArrangement;
window.wpApplyPanelArrangementToAll = wpApplyPanelArrangementToAll;


function wpGetPolyWp(poly) {
  if (!poly) return (typeof panelConfig !== 'undefined' && panelConfig.potencia) ? panelConfig.potencia : 450;
  const effModId = poly.moduleId || (typeof window !== 'undefined' && window.solarProjectConfig && window.solarProjectConfig.selectedModuleId);
  if (typeof equipmentCatalog !== 'undefined' && equipmentCatalog && Array.isArray(equipmentCatalog.modules)) {
    const fm = equipmentCatalog.modules.find(m => m.id === effModId);
    if (fm && fm.wp) return fm.wp;
  }
  return (typeof panelConfig !== 'undefined' && panelConfig.potencia) ? panelConfig.potencia : 450;
}
window.wpGetPolyWp = wpGetPolyWp;

let wpAzimuthRafId = null;

function wpSetPolyAzimuthRealtime(polyIdx, val) {
  if (!WP.polylines || !WP.polylines[polyIdx]) return;
  WP.polylines[polyIdx].modAzimuth = val;
  WP.polylines[polyIdx].arrangementMode = (val === "auto" || val === "") ? 'coplanar' : 'custom';
  WP.selectedPolyIdx = polyIdx;

  const lbl = document.getElementById("faldon-az-val");
  if (lbl) lbl.textContent = (val === "auto" || val === "") ? "Auto" : (val + "°");

  const slider = document.getElementById("faldon-az-slider");
  if (slider && val !== "auto") slider.value = val;

  if (typeof window !== "undefined" && window.requestAnimationFrame) {
    if (wpAzimuthRafId) cancelAnimationFrame(wpAzimuthRafId);
    wpAzimuthRafId = requestAnimationFrame(() => {
      wpAzimuthRafId = null;
      const poly = WP.polylines[polyIdx];
      if (!poly) return;
      const pInfo = computeSinglePolylineRoofInfo(poly.points, poly);
      if (pInfo) poly.roofInfo = pInfo;

      if (roofPanelsCache) roofPanelsCache.sig = "";
      wpFastRenderSimulatedPanels();

      const cardModLbl = document.getElementById("faldon-card-stats");
      if (cardModLbl && poly && poly.roofInfo && poly.roofInfo.panels) {
        const c = poly.roofInfo.panels.length;
        const kw = (c * wpGetPolyWp(poly) / 1000).toFixed(2);
        cardModLbl.innerHTML = c + ' mods <span style="font-size:8px;color:var(--amber-400);margin-left:4px;">· ' + kw + ' kWp</span>';
      }
      if (typeof recalculateSolarYield === "function") recalculateSolarYield();
      if (typeof wpSyncStep6Controls === "function") wpSyncStep6Controls();
    });
  } else {
    const poly = WP.polylines[polyIdx];
    const pInfo = computeSinglePolylineRoofInfo(poly.points, poly);
    if (pInfo) poly.roofInfo = pInfo;

    if (roofPanelsCache) roofPanelsCache.sig = "";
    wpFastRenderSimulatedPanels();

    const cardModLbl = document.getElementById("faldon-card-stats");
    if (cardModLbl && poly && poly.roofInfo && poly.roofInfo.panels) {
      const c = poly.roofInfo.panels.length;
      const kw = (c * wpGetPolyWp(poly) / 1000).toFixed(2);
      cardModLbl.innerHTML = c + ' mods <span style="font-size:8px;color:var(--amber-400);margin-left:4px;">· ' + kw + ' kWp</span>';
    }
    if (typeof wpSyncStep6Controls === "function") wpSyncStep6Controls();
  }
}

function wpCommitPolyAzimuth(polyIdx) {
  if (typeof window.wpInvalidateHeatmap === 'function') {
    window.wpInvalidateHeatmap('Azimut de módulo fijado');
  }
  if (typeof wpSyncStep6Controls === 'function') wpSyncStep6Controls();
}
window.wpCommitPolyAzimuth = wpCommitPolyAzimuth;

function wpSetPolyOrientation(polyIdx, orientation) {
  if (!WP.polylines || !WP.polylines[polyIdx]) return;
  WP.polylines[polyIdx].orientationPref = orientation;
  WP.selectedPolyIdx = polyIdx;

  if (typeof roofPanelsCache !== "undefined" && roofPanelsCache) {
    roofPanelsCache.sig = "";
  }

  // Recalcular roofInfo para esta polilínea con la nueva orientación
  if (typeof computeSinglePolylineRoofInfo === "function") {
    WP.polylines[polyIdx].roofInfo = computeSinglePolylineRoofInfo(WP.polylines[polyIdx].points, WP.polylines[polyIdx]);
  }

  if (typeof window.wpInvalidateHeatmap === 'function') {
    window.wpInvalidateHeatmap('Orientación modificada (' + (orientation === 'landscape' ? 'horizontal' : 'vertical') + ')');
  }
  if (typeof wpFastRenderSimulatedPanels === "function") wpFastRenderSimulatedPanels();
  wpUpdateStep3UI();
  if (typeof wpSyncStep6Controls === 'function') wpSyncStep6Controls();

  var orientName = orientation === "landscape" ? "HORIZONTAL" : (orientation === "hybrid" ? "HÍBRIDA MIXTA (V+H)" : "VERTICAL");
  showStatus("DISPOSICIÓN " + orientName + " EN " + (WP.polylines[polyIdx].name || ("FALDÓN #" + (polyIdx + 1))), 2000);
  if (typeof wpPopulateFaldonCard === 'function') wpPopulateFaldonCard();
}

function wpGetFaldonOrientationComparison(poly) {
  if (!poly || !poly.points || poly.points.length < 3) return null;
  var fnInfo = (typeof computeSinglePolylineRoofInfo === 'function')
    ? computeSinglePolylineRoofInfo
    : (typeof window !== 'undefined' && typeof window.computeSinglePolylineRoofInfo === 'function' ? window.computeSinglePolylineRoofInfo : null);
  if (!fnInfo) return null;

  // Memoización reactiva para evitar congelar el hilo UI con 3 cálculos espaciales síncronos
  var sig = (poly.id || 'poly') + '_' +
            poly.points.length + '_' +
            (poly.points[0] ? poly.points[0].x.toFixed(2) + '_' + poly.points[0].y.toFixed(2) : '') + '_' +
            (poly.modTilt || '') + '_' +
            (poly.modAzimuth || '') + '_' +
            (poly.moduleId || '') + '_' +
            ((poly.estructura && poly.estructura.tipo) || '');

  if (poly._orientCompCache && poly._orientCompCache.sig === sig && (Date.now() - poly._orientCompCache.ts < 4000)) {
    return poly._orientCompCache.data;
  }

  try {
    var optP = Object.assign({}, poly, { orientationPref: 'portrait' });
    var infoP = fnInfo(poly.points, optP);
    var countP = (infoP && infoP.panels) ? infoP.panels.length : 0;

    var optL = Object.assign({}, poly, { orientationPref: 'landscape' });
    var infoL = fnInfo(poly.points, optL);
    var countL = (infoL && infoL.panels) ? infoL.panels.length : 0;

    var isCoplanar = (!poly.estructura || poly.estructura.tipo === 'coplanar') && (poly.modTilt === 'coplanar' || poly.modTilt === 0 || poly.modTilt === 'auto');
    var countH = 0;
    if (isCoplanar) {
      var optH = Object.assign({}, poly, { orientationPref: 'hybrid' });
      var infoH = fnInfo(poly.points, optH);
      countH = (infoH && infoH.panels) ? infoH.panels.length : 0;
    }

    var modWp = 450;
    var effModId = poly.moduleId || (window.solarProjectConfig && window.solarProjectConfig.selectedModuleId) || '';
    if (typeof equipmentCatalog !== 'undefined' && equipmentCatalog && Array.isArray(equipmentCatalog.modules)) {
      var foundM = equipmentCatalog.modules.find(function(m) { return m.id === effModId; });
      if (foundM && foundM.wp) modWp = foundM.wp;
    } else if (typeof panelConfig !== 'undefined' && panelConfig && panelConfig.potencia) {
      modWp = panelConfig.potencia;
    }

    var kwpP = (countP * modWp / 1000).toFixed(2);
    var kwpL = (countL * modWp / 1000).toFixed(2);
    var kwpH = (countH * modWp / 1000).toFixed(2);

    var maxPure = Math.max(countP, countL);
    var diff = countL - countP;
    var diffKwp = (Math.abs(diff) * modWp / 1000).toFixed(2);

    var recommended = 'portrait';
    if (isCoplanar && countH > maxPure) {
      recommended = 'hybrid';
    } else if (countL > countP) {
      recommended = 'landscape';
    } else if (countP === countL) {
      recommended = 'equal';
    }

    var compData = {
      portrait: { count: countP, kwp: kwpP },
      landscape: { count: countL, kwp: kwpL },
      hybrid: { count: countH, kwp: kwpH },
      diff: diff,
      diffKwp: diffKwp,
      recommended: recommended
    };

    poly._orientCompCache = { sig: sig, ts: Date.now(), data: compData };
    return compData;
  } catch(eComp) {
    return null;
  }
}
window.wpGetFaldonOrientationComparison = wpGetFaldonOrientationComparison;

function wpTogglePolyWalkway(polyIdx) {
  var pIdx = (typeof polyIdx === 'number' && polyIdx >= 0) ? polyIdx : WP.selectedPolyIdx;
  if (!WP.polylines || !WP.polylines[pIdx]) return;
  var poly = WP.polylines[pIdx];
  poly.hasWalkway = !poly.hasWalkway;
  if (poly.hasWalkway && !poly.walkwayWidth) poly.walkwayWidth = 0.80;

  if (typeof roofPanelsCache !== 'undefined' && roofPanelsCache) {
    roofPanelsCache.sig = '';
  }
  var fnInfo = (typeof computeSinglePolylineRoofInfo === 'function')
    ? computeSinglePolylineRoofInfo
    : (typeof window !== 'undefined' && typeof window.computeSinglePolylineRoofInfo === 'function' ? window.computeSinglePolylineRoofInfo : null);
  if (fnInfo) {
    poly.roofInfo = fnInfo(poly.points, poly);
  }
  if (typeof window.wpInvalidateHeatmap === 'function') {
    window.wpInvalidateHeatmap(poly.hasWalkway ? 'Pasillo de mantenimiento activado (0.80m)' : 'Pasillo de mantenimiento desactivado');
  }
  if (typeof wpFastRenderSimulatedPanels === 'function') wpFastRenderSimulatedPanels();
  wpPopulateFaldonCard();
  if (typeof wpUpdateStep3UI === 'function') wpUpdateStep3UI();

  showStatus(poly.hasWalkway ? '🚶 PASILLO CENTRAL DE MANTENIMIENTO (0.80m) ACTIVADO' : 'PASILLO CENTRAL DESACTIVADO (COBERTURA TOTAL)', 2200);
}
window.wpTogglePolyWalkway = wpTogglePolyWalkway;

function wpApplyPolyWalkwayToAll(polyIdx) {
  var pIdx = (typeof polyIdx === 'number' && polyIdx >= 0) ? polyIdx : WP.selectedPolyIdx;
  if (!WP.polylines || !WP.polylines[pIdx]) return;
  var state = !!WP.polylines[pIdx].hasWalkway;
  var width = WP.polylines[pIdx].walkwayWidth || 0.80;
  var fnInfo = (typeof computeSinglePolylineRoofInfo === 'function')
    ? computeSinglePolylineRoofInfo
    : (typeof window !== 'undefined' && typeof window.computeSinglePolylineRoofInfo === 'function' ? window.computeSinglePolylineRoofInfo : null);

  WP.polylines.forEach(function(p) {
    if (p) {
      p.hasWalkway = state;
      p.walkwayWidth = width;
      if (fnInfo) {
        p.roofInfo = fnInfo(p.points, p);
      }
    }
  });
  if (typeof roofPanelsCache !== 'undefined' && roofPanelsCache) roofPanelsCache.sig = '';
  if (typeof wpFastRenderSimulatedPanels === 'function') wpFastRenderSimulatedPanels();
  wpPopulateFaldonCard();
  if (typeof wpUpdateStep3UI === 'function') wpUpdateStep3UI();
  if (typeof showToast === 'function') {
    showToast('PASILLOS PROPAGADOS', (state ? 'Pasillo de 0.80m aplicado a todos los faldones.' : 'Pasillos desactivados en todos los faldones.'), 'info', 2500);
  }
}
window.wpApplyPolyWalkwayToAll = wpApplyPolyWalkwayToAll;

let wpTiltRafId = null;

function wpSetPolyTiltRealtime(polyIdx, val) {
  if (!WP.polylines || !WP.polylines[polyIdx]) return;
  WP.polylines[polyIdx].modTilt = val;
  WP.polylines[polyIdx].arrangementMode = (val === "auto" || val === "") ? 'coplanar' : 'custom';
  WP.selectedPolyIdx = polyIdx;

  const lbl = document.getElementById("faldon-tilt-val");
  if (lbl) lbl.textContent = (val === "auto" || val === "") ? "Auto (faldón)" : (val + "°");

  const slider = document.getElementById("faldon-tilt-slider");
  if (slider && val !== "auto") slider.value = val;

  const pitchVal = null; // pitch elements removed in master-detail refactor
  const pitchClean = null;
  if (pitchVal && pitchClean) {
    if (val === "auto" || parseFloat(val) <= 0) {
      pitchVal.textContent = "Auto (Coplanar)";
      pitchClean.innerHTML = "<i data-lucide=\"check-circle\" class=\"icon-sm\"></i> OK"; if(window.lucide) lucide.createIcons();
      pitchClean.style.color = "#34D399";
    } else {
      const numTilt = parseFloat(val);
      if (typeof computeInterRowPitch === 'function') {
        const pInfo = computeInterRowPitch({ moduleLength: 2.2, tiltDeg: numTilt });
        pitchVal.textContent = pInfo.totalPitchM + " m";
        if (numTilt < 10) {
          pitchClean.innerHTML = "<i data-lucide=\"alert-triangle\" class=\"icon-sm\"></i> <10° Autolimpieza"; if(window.lucide) lucide.createIcons();
          pitchClean.style.color = "#F87171";
        } else {
          pitchClean.innerHTML = "<i data-lucide=\"check-circle\" class=\"icon-sm\"></i> Autolimpieza OK"; if(window.lucide) lucide.createIcons();
          pitchClean.style.color = "#34D399";
        }
      }
    }
  }

  if (typeof window !== "undefined" && window.requestAnimationFrame) {
    if (wpTiltRafId) cancelAnimationFrame(wpTiltRafId);
    wpTiltRafId = requestAnimationFrame(() => {
      wpTiltRafId = null;
      const poly = WP.polylines[polyIdx];
      if (!poly) return;
      const pInfo = computeSinglePolylineRoofInfo(poly.points, poly);
      if (pInfo) poly.roofInfo = pInfo;

      if (roofPanelsCache) roofPanelsCache.sig = "";
      wpFastRenderSimulatedPanels();

      const cardModLbl = document.getElementById("faldon-card-stats");
      if (cardModLbl && poly && poly.roofInfo && poly.roofInfo.panels) {
        const c = poly.roofInfo.panels.length;
        const kw = (c * wpGetPolyWp(poly) / 1000).toFixed(2);
        cardModLbl.innerHTML = c + ' mods <span style="font-size:8px;color:var(--amber-400);margin-left:4px;">· ' + kw + ' kWp</span>';
      }
      if (typeof recalculateSolarYield === "function") recalculateSolarYield();
      if (typeof wpSyncStep6Controls === "function") wpSyncStep6Controls();
    });
  } else {
    wpSetPolyTilt(polyIdx, val);
  }
}

function wpCommitPolyTilt(polyIdx) {
  if (typeof window.wpInvalidateHeatmap === 'function') {
    window.wpInvalidateHeatmap('Inclinación de módulo fijada');
  }
  if (typeof wpSyncStep6Controls === 'function') wpSyncStep6Controls();
}
window.wpCommitPolyTilt = wpCommitPolyTilt;

function wpSetPolyTilt(polyIdx, val) {
  if (!WP.polylines || !WP.polylines[polyIdx]) return;
  WP.polylines[polyIdx].modTilt = val;
  WP.selectedPolyIdx = polyIdx;
  if (roofPanelsCache) roofPanelsCache.sig = "";
  startSolarPanelsSimulation();
  if (typeof recalculateSolarYield === "function") recalculateSolarYield();
  wpUpdateStep3UI();
}

function wpSetPolyStructure(polyIdx, val) {
  if (!WP.polylines || !WP.polylines[polyIdx]) return;
  const poly = WP.polylines[polyIdx];
  poly.structureType = val;
  WP.selectedPolyIdx = polyIdx;

  const isTri30 = (val === 'triangles_30');
  const isTri15EW = (val === 'triangles_15_ew');
  const isTriCustom = (val === 'triangles_custom');
  const isTri = isTri30 || isTri15EW || isTriCustom || val.includes('triangle');
  const isPergola = (val === 'pergola');
  const isCoplanar = !isTri && !isPergola;

  if (isPergola) {
    const curH = (poly.estructura && poly.estructura.clearance > 0) ? poly.estructura.clearance : 1.80;
    poly.estructura = { tipo: 'pergola', clearance: curH };
    poly.structureType = 'pergola';
    if (poly.modTilt === undefined || poly.modTilt === null) poly.modTilt = 'auto';
    if (poly.modAzimuth === undefined) poly.modAzimuth = 'auto';
  } else if (isCoplanar) {
    poly.estructura = { tipo: 'coplanar', clearance: 0.05 };
    poly.arrangementMode = 'coplanar';
    poly.modTilt = 'auto';
    poly.modAzimuth = 'auto';
  } else if (isTri15EW) {
    poly.estructura = { tipo: 'balasto', clearance: 0.20, subtype: 'east_west' };
    poly.arrangementMode = 'custom';
    poly.modTilt = 15;
    poly.modAzimuth = 90;
  } else if (isTriCustom) {
    // Triángulos con ángulo adaptable: preserva la inclinación elegida o usa el valor actual del slider
    const currentTilt = (typeof poly.modTilt === 'number' && poly.modTilt > 0) ? poly.modTilt : 20;
    poly.estructura = { tipo: 'balasto', clearance: 0.25, subtype: 'custom_tilt' };
    poly.arrangementMode = 'custom';
    poly.modTilt = currentTilt;
    if (poly.modAzimuth === 'auto' || poly.modAzimuth === undefined) poly.modAzimuth = 180;
  } else {
    // Triángulos 30º Cubierta Plana
    poly.estructura = { tipo: 'balasto', clearance: 0.25, subtype: 'south' };
    poly.arrangementMode = 'solar_optimal';
    poly.modTilt = 30;
    poly.modAzimuth = 180;
  }

  // Sincronizar UI de altura de pérgola en el panel de faldón
  const pergolaRow = document.getElementById('faldon-pergola-row');
  if (pergolaRow) {
    pergolaRow.style.display = isPergola ? 'flex' : 'none';
    if (isPergola) {
      const hInput = document.getElementById('faldon-pergola-h');
      if (hInput) hInput.value = (poly.estructura && poly.estructura.clearance) ? poly.estructura.clearance : 1.80;
    }
  }

  // Purgar caché de geometría de paneles y regenerar
  if (typeof roofPanelsCache !== 'undefined' && roofPanelsCache) {
    roofPanelsCache.sig = '';
    roofPanelsCache.data = null;
  }

  if (typeof computeSinglePolylineRoofInfo === 'function') {
    poly.roofInfo = computeSinglePolylineRoofInfo(poly.points, poly);
  }

  if (typeof window.wpInvalidateHeatmap === 'function') {
    window.wpInvalidateHeatmap('Estructura de montaje modificada');
  }
  if (typeof wpFastRenderSimulatedPanels === 'function') {
    wpFastRenderSimulatedPanels();
  }

  if (typeof recalculateSolarYield === 'function') recalculateSolarYield();
  if (typeof wpUpdateStep3UI === 'function') wpUpdateStep3UI();
  if (typeof wpSyncStep6Controls === 'function') wpSyncStep6Controls();
  if (typeof wpSyncEstructuraUI === 'function') wpSyncEstructuraUI();
  if (typeof BOMTreeEngine !== 'undefined' && typeof BOMTreeEngine.refresh === 'function') {
    BOMTreeEngine.refresh();
  }

  const names = {
    coplanar_teja: 'COPLANAR TEJA',
    coplanar_chapa: 'COPLANAR CHAPA / SÁNDWICH',
    triangles_30: 'TRIÁNGULOS 30º SUR',
    triangles_15_ew: 'ESTRUCTURA 15º ESTE-OESTE',
    triangles_custom: `TRIÁNGULOS ADAPTABLES (${poly.modTilt}°)`,
    pergola: 'PÉRGOLA ELEVADA'
  };
  if (typeof showStatus === 'function') {
    showStatus(`<i data-lucide="check" class="icon-sm"></i> ESTRUCTURA APLICADA: ${names[val] || val.toUpperCase()} (Tilt: ${poly.modTilt}°)`, 3000);
  }
}

function wpSetPolyPergolaHeight(polyIdx, val) {
  if (!WP.polylines || !WP.polylines[polyIdx]) return;
  const poly = WP.polylines[polyIdx];
  const h = Math.max(0.5, Math.min(5.0, parseFloat(val) || 1.80));
  if (!poly.estructura) poly.estructura = { tipo: 'pergola', clearance: h };
  else {
    poly.estructura.tipo = 'pergola';
    poly.estructura.clearance = h;
  }
  poly.structureType = 'pergola';

  const p2H = document.getElementById('cfg-p2-estructura-h');
  if (p2H) p2H.value = h.toFixed(2);
  const p1H = document.getElementById('faldon-pergola-h');
  if (p1H) p1H.value = h.toFixed(2);

  if (typeof roofPanelsCache !== 'undefined' && roofPanelsCache) {
    roofPanelsCache.sig = '';
    roofPanelsCache.data = null;
  }
  if (typeof computeSinglePolylineRoofInfo === 'function') {
    poly.roofInfo = computeSinglePolylineRoofInfo(poly.points, poly);
  }
  if (typeof window.wpInvalidateHeatmap === 'function') {
    window.wpInvalidateHeatmap('Altura de pérgola modificada');
  }
  if (typeof wpFastRenderSimulatedPanels === 'function') {
    wpFastRenderSimulatedPanels();
  }
  if (typeof recalculateSolarYield === 'function') recalculateSolarYield();
  if (typeof showToast === 'function') showToast('PÉRGOLA ELEVADA', `Altura libre actualizada a ${h.toFixed(2)} m.`, 'info', 2000);
}
window.wpSetPolyPergolaHeight = wpSetPolyPergolaHeight;

function wpApplyPolyStructureToAll(sourcePolyIdx) {
  if (!WP.polylines || !WP.polylines[sourcePolyIdx]) return;
  const srcPoly = WP.polylines[sourcePolyIdx];
  const targetStructureType = srcPoly.structureType || 'coplanar_teja';
  const targetEstructura = srcPoly.estructura ? JSON.parse(JSON.stringify(srcPoly.estructura)) : { tipo: 'coplanar', clearance: 0.05 };
  const targetArrangementMode = srcPoly.arrangementMode || 'coplanar';
  const targetModTilt = srcPoly.modTilt !== undefined ? srcPoly.modTilt : 'auto';
  const targetModAzimuth = srcPoly.modAzimuth !== undefined ? srcPoly.modAzimuth : 'auto';

  if (typeof roofPanelsCache !== "undefined" && roofPanelsCache) {
    roofPanelsCache.sig = "";
    roofPanelsCache.data = null;
  }

  WP.polylines.forEach(poly => {
    poly.structureType = targetStructureType;
    poly.estructura = JSON.parse(JSON.stringify(targetEstructura));
    poly.arrangementMode = targetArrangementMode;
    poly.modTilt = targetModTilt;
    poly.modAzimuth = targetModAzimuth;
    if (typeof computeSinglePolylineRoofInfo === "function") {
      poly.roofInfo = computeSinglePolylineRoofInfo(poly.points, poly);
    }
  });

  if (typeof window.wpInvalidateHeatmap === 'function') {
    window.wpInvalidateHeatmap('Estructura de montaje aplicada a todos los faldones');
  }
  if (typeof wpFastRenderSimulatedPanels === 'function') {
    wpFastRenderSimulatedPanels();
  }
  if (typeof recalculateSolarYield === 'function') recalculateSolarYield();
  if (typeof wpUpdateStep3UI === 'function') wpUpdateStep3UI();
  if (typeof wpPopulateFaldonCard === 'function') wpPopulateFaldonCard();
  if (typeof wpSyncStep6Controls === 'function') wpSyncStep6Controls();
  if (typeof wpSyncEstructuraUI === 'function') wpSyncEstructuraUI();
  if (typeof BOMTreeEngine !== 'undefined' && typeof BOMTreeEngine.refresh === 'function') {
    BOMTreeEngine.refresh();
  }

  const names = {
    coplanar_teja: 'COPLANAR TEJA',
    coplanar_chapa: 'COPLANAR CHAPA / SÁNDWICH',
    triangles_30: 'TRIÁNGULOS 30º SUR',
    triangles_15_ew: 'ESTRUCTURA 15º ESTE-OESTE',
    triangles_custom: 'TRIÁNGULOS ADAPTABLES',
    pergola: 'PÉRGOLA ELEVADA'
  };
  if (typeof showStatus === 'function') {
    showStatus(`<i data-lucide="check" class="icon-sm"></i> ESTRUCTURA ${names[targetStructureType] || targetStructureType.toUpperCase()} APLICADA A TODOS LOS FALDONES`, 3000);
  }
}
window.wpApplyPolyStructureToAll = wpApplyPolyStructureToAll;

function wpSetPolyAzimuth(polyIdx, val) {
  wpSetPolyAzimuthRealtime(polyIdx, val);
}

function wpGenerateAllPolylinesPanels() {
  if (roofPanelsCache) roofPanelsCache.sig = "";
  if (WP && WP.polylines) {
    WP.polylines.forEach(poly => {
      poly.roofInfo = computeSinglePolylineRoofInfo(poly.points, poly);
    });
  }
  startSolarPanelsSimulation();
  wpUpdateStep3UI();
  if (typeof BOMTreeEngine !== 'undefined' && typeof BOMTreeEngine.refresh === 'function') {
    BOMTreeEngine.refresh();
  }
  showStatus("TODAS LAS CUBIERTAS RECALCULADAS CON SUS CONFIGURACIONES INDIVIDUALES", 2500);
}

function wpSyncStep3Metrics() {
  wpUpdateStep3UI();
}

var userPanelOrientationPref = "portrait";

function wpSetPanelOrientation(orientation) {
  if (WP.selectedPolyIdx >= 0 && WP.polylines && WP.polylines[WP.selectedPolyIdx]) {
    wpSetPolyOrientation(WP.selectedPolyIdx, orientation);
  } else {
    userPanelOrientationPref = orientation;
    wpGenerateAllPolylinesPanels();
  }
}

function wpUpdateCanvasHUD() {
  const hud = document.getElementById('ra-canvas-hud');
  const modeIcon = document.getElementById('hud-mode-icon');
  const modeText = document.getElementById('hud-mode-text');
  const ptsBadge = document.getElementById('hud-points-badge');
  if (!hud) return;

  if (WP.mode === 'define-plane') {
    hud.style.display = 'flex';
    if (modeIcon) modeIcon.innerHTML = '<i data-lucide=\"target\" class=\"icon-sm\"></i>'; if(window.lucide) lucide.createIcons();
    if (modeText) modeText.textContent = 'DEFINIENDO PLANO (3 PTOS)';
    if (ptsBadge) ptsBadge.textContent = WP.planePts.length + ' / 3 PTOS';
  } else if (WP.mode === 'draw-poly') {
    hud.style.display = 'flex';
    if (modeIcon) modeIcon.innerHTML = '<i data-lucide=\"edit-2\" class=\"icon-sm\"></i>'; if(window.lucide) lucide.createIcons();
    if (modeText) modeText.textContent = 'DIBUJO DE POLILÍNEA';
    if (ptsBadge) ptsBadge.textContent = WP.activePolyPts.length + ' PTOS';
  } else {
    hud.style.display = 'none';
  }
}

function wpCancelCurrentMode() {
  if (WP.mode !== 'idle' || (Array.isArray(WP.activePolyPts) && WP.activePolyPts.length > 0)) {
    wpSetMode('idle');
    wpClearEntGroup('planePreview');
    wpClearEntGroup('activePoly');
    WP.planePts = [];
    WP.activePolyPts = [];
    if (typeof polygonPoints !== 'undefined') polygonPoints = [];
    if (typeof window !== 'undefined') window.polygonPoints = [];

    // Si se estaba dibujando huella de edificio
    if (typeof cancelActiveBuilding === 'function' && (WP.mode === 'draw-building' || (typeof activeBuildingPts !== 'undefined' && activeBuildingPts && activeBuildingPts.length > 0))) {
      try { cancelActiveBuilding(); } catch(e) {}
    }

    const confBar = document.getElementById('ra-confirm-bar');
    if (confBar) {
      confBar.style.display = 'none';
      confBar.classList.remove('open');
    }

    const cancelBldBtn = document.getElementById('btn-cancel-building-panel');
    if (cancelBldBtn) cancelBldBtn.style.display = 'none';

    if (typeof bldFootprintState !== 'undefined' && bldFootprintState && bldFootprintState.editing) {
      if (typeof toggleBuildingFootprintEditing === 'function') toggleBuildingFootprintEditing(false);
      bldFootprintState.editing = false;
    }

    wpUpdateUI();
    if (typeof showStatus === 'function') showStatus('OPERACIÓN CANCELADA', 1500);
    if (typeof viewer !== 'undefined' && viewer.scene) viewer.scene.requestRender();
  }
}
window.wpCancelCurrentMode = wpCancelCurrentMode;
window.wpCancelDrawPoly = wpCancelCurrentMode;

function wpUpdateUI() {
  const plane = wpGetActivePlane();
  const badge = document.getElementById('wp-plane-status-badge');
  const activeInfo = document.getElementById('wp-plane-active-info');
  const planesSelectorContainer = document.getElementById('wp-planes-selector-container');
  const planesDropdown = document.getElementById('wp-planes-dropdown');
  const planesCountBadge = document.getElementById('wp-planes-count-badge');
  const btnDraw = document.getElementById('btn-draw-polyline');
  const btnCreate = document.getElementById('btn-create-workplane');

  // Actualizar estado del Plano de Trabajo
  if (badge) {
    if (plane) {
      badge.textContent = 'PLANO ACTIVO';
      badge.style.background = 'rgba(16,185,129,0.25)';
      badge.style.color = '#10b981';
    } else {
      badge.textContent = 'SIN PLANO';
      badge.style.background = 'rgba(239,68,68,0.25)';
      badge.style.color = '#ef4444';
    }
  }

  // Multiplano: Actualizar selector desplegable
  if (planesSelectorContainer && planesDropdown) {
    if (WP.planes.length > 0) {
      planesSelectorContainer.style.display = 'block';
      if (planesCountBadge) planesCountBadge.textContent = WP.planes.length + (WP.planes.length === 1 ? ' Plano' : ' Planos');
      planesDropdown.innerHTML = WP.planes.map((p, idx) => 
        '<option value="' + idx + '"' + (idx === WP.activePlaneIdx ? ' selected' : '') + '>' +
          (idx === WP.activePlaneIdx ? '<i data-lucide=\"star\" class=\"icon-sm\"></i> ' : '') + p.name + ' · ' + (typeof p.tiltDeg === 'number' ? p.tiltDeg.toFixed(1) : '—') + '° (' + getAzimuthCardinal(p.azimuthDeg) + ')' +
        '</option>'
      ).join('');
    } else {
      planesSelectorContainer.style.display = 'none';
    }
  }

  if (activeInfo) {
    activeInfo.style.display = plane ? 'block' : 'none';
    if (plane) {
      const nameLbl = document.getElementById('wp-plane-name-lbl');
      const tiltLbl = document.getElementById('wp-plane-tilt-lbl');
      const azLbl = document.getElementById('wp-plane-az-lbl');
      if (nameLbl) nameLbl.textContent = plane.name;
      if (tiltLbl) tiltLbl.textContent = (typeof plane.tiltDeg === 'number' ? plane.tiltDeg.toFixed(1) : '—') + '°';
      if (azLbl) azLbl.textContent = (typeof plane.azimuthDeg === 'number' ? plane.azimuthDeg.toFixed(1) : '—') + '° (' + getAzimuthCardinal(plane.azimuthDeg) + ')';
      
      const vtxToggleBtn = document.getElementById('wp-btn-toggle-plane-vtx');
      if (vtxToggleBtn) {
        const isShown = (WP.showPlaneVertices !== false);
        vtxToggleBtn.innerHTML = isShown ? '<i data-lucide=\"eye-off\" class=\"icon-sm\"></i> OCULTAR VÉRTICES' : '<i data-lucide=\"eye\" class=\"icon-sm\"></i> MOSTRAR VÉRTICES';
        vtxToggleBtn.style.color = isShown ? '#94A3B8' : '#38BDF8';
        vtxToggleBtn.style.borderColor = isShown ? 'rgba(255,255,255,0.15)' : 'rgba(56,189,248,0.4)';
      }
    }
  }

  // Selector de modo de ejes (Opcion B + D)
  const axisSel = document.getElementById("wp-axis-mode-selector");
  if (axisSel) {
    axisSel.style.display = plane ? "block" : "none";
    if (plane) {
      const curMode = WP.axisMode || "p1p2";
      ["p1p2","p1p3","auto"].forEach(function(m) {
        const btn = document.getElementById("wp-axis-btn-" + m);
        if (btn) {
          btn.style.background  = (m === curMode) ? "rgba(245,158,11,0.35)" : "rgba(0,0,0,0.35)";
          btn.style.borderColor = (m === curMode) ? "var(--amber-400)"       : "rgba(255,255,255,0.15)";
          btn.style.color       = (m === curMode) ? "var(--amber-400)"       : "var(--text-slate-300)";
          btn.style.fontWeight  = (m === curMode) ? "bold"                   : "normal";
        }
      });
    }
  }
  // Habilitar botón de polilíneas (siempre clicable para auto-crear plano o guiar)
  if (btnDraw) {
    const hasBuilding = (typeof buildings !== 'undefined' && Array.isArray(buildings) && buildings.length > 0);
    btnDraw.disabled = false;
    btnDraw.style.opacity = (plane || hasBuilding) ? '1' : '0.65';
    btnDraw.style.cursor = 'pointer';
    if (WP.mode === 'draw-poly') {
      btnDraw.innerHTML = '<i data-lucide=\"edit-2\" class=\"icon-sm\"></i> DIBUJANDO... (CLIC EN EL PLANO)'; if(window.lucide) lucide.createIcons();
      btnDraw.style.background = 'var(--grad-emerald)';
    } else {
      btnDraw.innerHTML = '<i data-lucide=\"edit-2\" class=\"icon-sm\"></i> DIBUJAR POLILÍNEA EN PLANO'; if(window.lucide) lucide.createIcons();
      btnDraw.style.background = 'var(--grad-amber)';
    }
  }

  // Actualizar estado de botones Cerrar / Deshacer polilínea
  const btnClosePoly = document.getElementById('btn-close-polyline');
  const isPolyDrawing = (WP.mode === 'draw-poly' || WP.mode === 'draw-building');
  if (btnClosePoly) {
    btnClosePoly.style.opacity = (isPolyDrawing || (typeof bldFootprintState !== 'undefined' && bldFootprintState && bldFootprintState.editing)) ? '1' : '0.5';
  }

  // Actualizar contadores y reporte de polilíneas
  const vtxCount = WP.activePolyPts.length;
  setElemText('brush-point-count', vtxCount + ' PUNTOS');
  const _curPolyPts = (typeof polygonPoints !== 'undefined' && Array.isArray(polygonPoints)) ? polygonPoints.length : ((typeof window !== 'undefined' && window.polygonPoints && Array.isArray(window.polygonPoints)) ? window.polygonPoints.length : (WP.polylines && WP.polylines[0] ? WP.polylines[0].points.length : vtxCount));
  setElemText('edit-total-vertices', _curPolyPts);

  // Actualizar estadísticas de la tarjeta de trazado (Polilínea activa/seleccionada)
  const curPoly = (WP.polylines && WP.selectedPolyIdx >= 0) ? WP.polylines[WP.selectedPolyIdx] : null;
  if (curPoly) {
    setElemText('brush-surface-type', '#' + (WP.selectedPolyIdx + 1));
    let perim = 0;
    for (let i = 0; i < curPoly.points.length; i++) {
      const next = (i + 1) % curPoly.points.length;
      perim += Cesium.Cartesian3.distance(curPoly.points[i], curPoly.points[next]);
    }
    setElemText('brush-perimeter', perim.toFixed(2) + ' m');
    const safeCurArea = (typeof curPoly.area === 'number')
      ? curPoly.area
      : (typeof wpPolylineArea3D === 'function' && curPoly.points && curPoly.points.length >= 3 ? (wpPolylineArea3D(curPoly.points) || 0) : 0);
    setElemText('brush-area', safeCurArea.toFixed(1) + ' m²');
  } else if (WP.activePolyPts.length > 0) {
    setElemText('brush-surface-type', '#' + (WP.polylines.length + 1) + ' (en curso)');
    let perim = 0;
    for (let i = 0; i < WP.activePolyPts.length - 1; i++) {
      perim += Cesium.Cartesian3.distance(WP.activePolyPts[i], WP.activePolyPts[i+1]);
    }
    setElemText('brush-perimeter', perim.toFixed(2) + ' m');
    setElemText('brush-area', (wpPolylineArea3D(WP.activePolyPts) || 0).toFixed(1) + ' m²');
  } else {
    setElemText('brush-surface-type', '#1');
    setElemText('brush-perimeter', '0.00 m');
    setElemText('brush-area', '0 m²');
  }

  // Actualizar selector desplegable de polilíneas (Paso 1 y Paso 3) y panel de vértices
  const polyDropdownContainer = document.getElementById('wp-polylines-selector-container');
  const polyDropdown = document.getElementById('wp-polylines-dropdown');
  const polyCountBadge = document.getElementById('wp-polylines-count-badge');
  // [REFACTOR] step3-poly-selector-container/dropdown eliminados en master-detail refactor
  const vtxManagerContainer = document.getElementById('wp-vertices-manager-container');
  const vtxTable = document.getElementById('wp-vertices-list-table');

  if (polyDropdownContainer && polyDropdown) {
    const optionsHtml = WP.polylines.map((poly, idx) => {
      const pName = poly.name || ('Faldon #' + (idx + 1));
      const pArea = (typeof poly.area === 'number')
        ? poly.area
        : (typeof wpPolylineArea3D === 'function' && poly.points && poly.points.length >= 3 ? (wpPolylineArea3D(poly.points) || 0) : 0);
      return '<option value="' + idx + '"' + (idx === WP.selectedPolyIdx ? ' selected' : '') + '>' +
        (idx === WP.selectedPolyIdx ? '<i data-lucide=\"star\" class=\"icon-sm\"></i> ' : '') + pName + ' (' + poly.points.length + ' vtx · ' + pArea.toFixed(1) + ' m²)' +
      '</option>';
    }).join('');

    if (WP.polylines.length > 0) {
      polyDropdownContainer.style.display = 'block';
      if (polyCountBadge) polyCountBadge.textContent = WP.polylines.length + (WP.polylines.length === 1 ? ' POLILÍNEA' : ' POLILÍNEAS');
      polyDropdown.innerHTML = optionsHtml;
    } else {
      polyDropdownContainer.style.display = 'none';
    }


  }

  const selectedPoly = (WP.polylines && WP.selectedPolyIdx >= 0) ? WP.polylines[WP.selectedPolyIdx] : null;
  if (vtxManagerContainer && vtxTable) {
    if (selectedPoly && selectedPoly.points && selectedPoly.points.length > 0) {
      vtxManagerContainer.style.display = 'block';
      const rows = selectedPoly.points.map((pt, vi) => {
        const isSel = vi === WP.selectedVtxIdx;
        return '<div onclick="wpSelectVertex(' + vi + ')" style="cursor:pointer;display:flex;justify-content:space-between;align-items:center;padding:4px 8px;background:' + (isSel ? 'rgba(56,189,248,0.25)' : 'rgba(0,0,0,0.3)') + ';border-radius:4px;border:1px solid ' + (isSel ? '#38bdf8' : 'rgba(255,255,255,0.06)') + ';font-size:9px;transition:all 0.15s;">' +
          '<div style="display:flex;align-items:center;gap:6px;">' +
            '<span style="display:inline-block;width:14px;height:14px;line-height:14px;text-align:center;border-radius:3px;background:' + (isSel ? '#38bdf8' : 'rgba(255,255,255,0.15)') + ';color:' + (isSel ? '#0f172a' : '#fff') + ';font-weight:bold;font-size:8px;">' + (vi + 1) + '</span>' +
            '<span style="color:' + (isSel ? '#38bdf8' : '#e2e8f0') + ';font-weight:bold;">Vértice ' + (vi + 1) + '</span>' +
          '</div>' +
          '<div style="font-family:monospace;font-size:8px;color:var(--text-slate-300);">' +
            'X: ' + pt.x.toFixed(1) + ' | Y: ' + pt.y.toFixed(1) + ' | Z: ' + pt.z.toFixed(1) +
          '</div>' +
        '</div>';
      }).join('');
      vtxTable.innerHTML = rows;
    } else {
      vtxManagerContainer.style.display = 'none';
      vtxTable.innerHTML = '';
    }
    wpSyncVertexInputs();
  }
  
    wpUpdateCanvasHUD();
  const nextStepBtn = document.getElementById('wp-goto-step-2-btn');
  if (nextStepBtn) {
    nextStepBtn.disabled = !plane;
    nextStepBtn.style.opacity = plane ? '1' : '0.4';
    nextStepBtn.style.cursor = plane ? 'pointer' : 'not-allowed';
  }
  wpSyncStep3Metrics();
  // Estructura paramétrica del faldón activo → selector del Paso 2
  if (typeof wpSyncEstructuraUI === 'function') wpSyncEstructuraUI();
  // Autoguardado con debounce tras cada actualización de UI/estado (P0 sesión)
  if (typeof wpAutoSaveProjectDebounced === 'function') wpAutoSaveProjectDebounced();
  if (typeof wpUpdateStep3UI === 'function') wpUpdateStep3UI();
  if (typeof render3DObstaclesInCesium === 'function') render3DObstaclesInCesium();
  const report = document.getElementById('wp-polyline-list-report');
  if (report) {
    if (WP.polylines.length === 0) {
      report.innerHTML = '<div style="font-size:8.5px;color:var(--text-slate-400);padding:4px 0;">Sin polilíneas cerradas en esta sesión.</div>';
    } else {
      const totalArea = WP.polylines.reduce((s, p) => s + p.area, 0);
      const rows = WP.polylines.map((poly, i) => {
        const isSel = i === WP.selectedPolyIdx;
        const strColor = getPolylineStringColor(i);
        return '<div onclick="wpSelectPolyline(' + i + ')" style="cursor:pointer;display:flex;justify-content:space-between;align-items:center;padding:5px 8px;background:' + (isSel ? 'rgba(56,189,248,0.22)' : 'rgba(0,0,0,0.25)') + ';border-radius:5px;margin-bottom:3px;font-size:8.5px;border:1px solid ' + (isSel ? '#38BDF8' : 'rgba(255,255,255,0.06)') + ';transition:all 0.15s ease;">' +
          '<div style="display:flex;align-items:center;gap:6px;">' +
            '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + strColor + ';box-shadow:0 0 5px ' + strColor + ';"></span>' +
            '<span style="color:' + (isSel ? '#38BDF8' : '#fff') + ';font-weight:bold;">' + (isSel ? '<i data-lucide=\"star\" class=\"icon-sm\"></i> ' : '') + poly.name + '</span>' +
          '</div>' +
          '<span style="color:' + (isSel ? '#E0F2FE' : 'var(--text-slate-300)') + ';font-weight:' + (isSel ? '700' : 'normal') + ';">' + poly.points.length + ' vtx · ' + poly.area.toFixed(1) + ' m²</span>' +
        '</div>';
      }).join('');
      report.innerHTML =
        '<div style="margin-top:4px;padding:5px 8px;background:rgba(56,189,248,0.12);border-radius:6px;border:1px solid rgba(56,189,248,0.3);font-size:8.5px;color:#38BDF8;font-weight:bold;display:flex;justify-content:space-between;align-items:center;">' +
          '<span>' + WP.polylines.length + ' FALDÓN' + (WP.polylines.length === 1 ? '' : 'ES') + ' · CLIC PARA ENFOCAR</span>' +
          '<span>' + totalArea.toFixed(1) + ' m² TOTAL</span>' +
        '</div>' +
        '<div style="margin-top:4px;max-height:110px;overflow-y:auto;">' + rows + '</div>';
    }
  }

  // Actualizar datos de navegación
  const currentCamera = typeof viewer !== 'undefined' && viewer ? viewer.camera : (window.viewer ? window.viewer.camera : null);
  if (currentCamera && currentCamera.positionCartographic) {
    const lat = Cesium.Math.toDegrees(currentCamera.positionCartographic.latitude);
    const lon = Cesium.Math.toDegrees(currentCamera.positionCartographic.longitude);
    const alt = Math.round(currentCamera.positionCartographic.height);
    const head = Math.round(Cesium.Math.toDegrees(currentCamera.heading));
    const pitch = Math.round(Cesium.Math.toDegrees(currentCamera.pitch));
    setElemText('nav-info-lat', lat.toFixed(4) + '° N');
    setElemText('nav-info-lon', lon.toFixed(4) + '° E');
    setElemText('nav-info-alt', alt + ' m');
    setElemText('nav-info-orient', head + '° / ' + pitch + '°');
  }

  // ── Gating Visual AAA: Apagar botones no operativos en la fase actual ──
  wpUpdateControlsAvailability();
}

function wpUpdateControlsAvailability() {
  const hasPlane = (typeof WP !== 'undefined' && WP && Array.isArray(WP.planes) && WP.planes.length > 0);
  const hasPolys = (typeof WP !== 'undefined' && WP && Array.isArray(WP.polylines) && WP.polylines.length > 0);
  const hasPanels = (
    (typeof window !== 'undefined' && Array.isArray(window.allRenderedPanels) && window.allRenderedPanels.length > 0) ||
    (typeof simulatedPanelEntities !== 'undefined' && Array.isArray(simulatedPanelEntities) && simulatedPanelEntities.length > 0) ||
    (hasPolys && WP.polylines.some(p => p && p.roofInfo && Array.isArray(p.roofInfo.panels) && p.roofInfo.panels.length > 0))
  );

  // 1. Botón Flotante Simulación Solar: Siempre accesible para permitir control horario del sol
  const solarFab = document.getElementById('ra-solar-fab-btn');
  if (solarFab) {
    solarFab.classList.remove('hud-btn-disabled');
    solarFab.title = 'Expandir Simulación Solar y Sombras 3D [H]';
  }

  // 2. Botón Flotante Árbol BIM: Requiere al menos un plano de trabajo, cubierta, edificio o paneles
  const hasBuildings = (typeof buildings !== 'undefined' && Array.isArray(buildings) && buildings.length > 0);
  const hasObstacles = (typeof obstacles !== 'undefined' && Array.isArray(obstacles) && obstacles.length > 0);

  const bomFab = document.getElementById('ra-bom-fab-btn');
  if (bomFab) {
    if (hasPlane || hasPolys || hasBuildings || hasPanels || hasObstacles) {
      bomFab.classList.remove('hud-btn-disabled');
      bomFab.title = 'Árbol de Proyecto BIM & Mediciones [BOM]';
    } else {
      bomFab.classList.add('hud-btn-disabled');
      bomFab.title = 'Árbol BIM: Define un plano de trabajo en el Paso 1 para ver mediciones';
    }
  }

  // 3. Botones y Telemetría del HUD Solar (#ra-solar-time-hud)
  const btnHeatmap = document.getElementById('btn-shadow-mode-heatmap');
  if (btnHeatmap) {
    btnHeatmap.classList.toggle('hud-btn-disabled', !hasPanels);
    btnHeatmap.title = hasPanels 
      ? 'Mapa de calor anual: Pérdidas acumuladas por sombra (CTE DB-HE5)' 
      : 'Mapa de calor: Requiere generar paneles fotovoltaicos primero';
  }

  const btnMlpe = document.getElementById('btn-shadow-mode-mlpe');
  if (btnMlpe) {
    btnMlpe.classList.toggle('hud-btn-disabled', !hasPanels);
    btnMlpe.title = hasPanels 
      ? 'Diagnóstico MLPE: Microinversores y optimizadores de potencia' 
      : 'Diagnóstico MLPE: Requiere generar paneles fotovoltaicos primero';
  }

  const btnInverter = document.getElementById('btn-place-inverter');
  if (btnInverter) {
    btnInverter.classList.toggle('hud-btn-disabled', !hasPolys);
    btnInverter.title = hasPolys 
      ? 'Ubicar Inversor Híbrido, Baterías y Cuadro Eléctrico en 3D' 
      : 'Ubicar Inversor: Requiere trazar al menos un faldón de cubierta primero';
  }

  // Píldoras de telemetría del HUD solar
  const telShaded = document.getElementById('solar-telemetry-shaded');
  if (telShaded && telShaded.parentElement) {
    telShaded.parentElement.style.opacity = hasPanels ? '1' : '0.4';
  }
  const telMlpe = document.getElementById('solar-telemetry-mlpe');
  if (telMlpe && telMlpe.parentElement) {
    telMlpe.parentElement.style.opacity = hasPanels ? '1' : '0.4';
  }

  // 4. Stepper: Deshabilitar proactivamente pasos futuros no desbloqueados (5 Pasos Canónicos v3.0)
  if (typeof window.WorkflowOrchestrator !== 'undefined' && typeof window.WorkflowOrchestrator.refreshGating === 'function') {
    window.WorkflowOrchestrator.refreshGating();
  } else {
    for (let s = 1; s <= 5; s++) {
      const sBtn = document.getElementById('wp-step-' + s + '-btn');
      if (!sBtn) continue;

      let canAccess = true;
      let reason = '';

      if (s === 2) {
        if (!hasPolys) {
          canAccess = false;
          reason = 'Requiere trazar al menos un faldón de cubierta en el Paso 1 (Emplazamiento)';
        }
      } else if (s === 3 || s === 4) {
        if (!hasPanels) {
          canAccess = false;
          reason = 'Requiere generar la malla de módulos fotovoltaicos en el Paso 2 (Campo Solar)';
        }
      }

      if (canAccess) {
        sBtn.classList.remove('disabled');
        sBtn.removeAttribute('title');
      } else {
        sBtn.classList.add('disabled');
        sBtn.title = reason;
      }
    }
  }

  // 5. Pestañas de la barra lateral (#tab-btn-*)
  const tabSolar = document.getElementById('tab-btn-solar');
  if (tabSolar) {
    tabSolar.classList.toggle('disabled', !hasPanels);
    tabSolar.title = hasPanels ? 'Solar FV' : 'Requiere generar campo solar primero';
  }
  const tabPresupuesto = document.getElementById('tab-btn-presupuesto');
  if (tabPresupuesto) {
    tabPresupuesto.classList.toggle('disabled', !hasPanels);
    tabPresupuesto.title = hasPanels ? 'Costes y Presupuesto' : 'Requiere generar campo solar primero';
  }
  const tabDocs = document.getElementById('tab-btn-documentacion');
  if (tabDocs) {
    tabDocs.classList.toggle('disabled', !hasPanels);
    tabDocs.title = hasPanels ? 'Documentación Técnica y PDF' : 'Requiere generar campo solar primero';
  }
  const tabAnalisis = document.getElementById('tab-btn-analisis');
  if (tabAnalisis) {
    tabAnalisis.classList.toggle('disabled', !hasPanels);
    tabAnalisis.title = hasPanels ? 'Análisis Energético' : 'Requiere generar campo solar primero';
  }
}
window.wpUpdateControlsAvailability = wpUpdateControlsAvailability;

function getAzimuthCardinal(deg) {
  const norm = ((deg % 360) + 360) % 360;
  if (norm >= 337.5 || norm < 22.5) return 'N';
  if (norm >= 22.5 && norm < 67.5) return 'NE';
  if (norm >= 67.5 && norm < 112.5) return 'E';
  if (norm >= 112.5 && norm < 157.5) return 'SE';
  if (norm >= 157.5 && norm < 202.5) return 'S';
  if (norm >= 202.5 && norm < 247.5) return 'SO';
  if (norm >= 247.5 && norm < 292.5) return 'O';
  return 'NO';
}

function clearActivePolyline() {
  if (WP.selectedPolyIdx >= 0 && WP.selectedPolyIdx < WP.polylines.length) {
    if (window.RAundo && typeof window.RAundo.snapPolylines === 'function') {
      window.RAundo.snapPolylines('Eliminar polilínea');
    }
    WP.polylines.splice(WP.selectedPolyIdx, 1);
    WP.selectedPolyIdx = WP.polylines.length > 0 ? WP.polylines.length - 1 : 0;
    polygonPoints = WP.polylines.length > 0 ? WP.polylines[WP.selectedPolyIdx].points.map(p => Cesium.Cartesian3.clone(p)) : [];
    wpRenderAllPolylines();
    wpUpdateUI();
    updateAllVisuals();
    showStatus('<i data-lucide=\"trash-2\" class=\"icon-sm\"></i> POLILÍNEA ELIMINADA', 2000);
  }
}

// ── Inicialización de Eventos y Handlers de Pantalla ────────────────────────

// ============================================================================
// CATÁLOGO DE EQUIPOS FOTOVOLTAICOS (MÓDULOS, INVERSORES, BATERÍAS, MICROINVERSORES)
// ============================================================================
const DEFAULT_EQUIPMENT_CATALOG = {
  modules: [
    { id: 'ja_550', brand: 'JA Solar', model: 'JAM72S30 550W', tec: 'Mono PERC', l: 2.279, w: 1.134, wp: 550, eff: 21.3, price: 115, voc: 49.9, isc: 14.0, vmp: 41.96, imp: 13.11, tier: 'Tier 1' },
    { id: 'longi_435', brand: 'Longi Solar', model: 'Hi-MO 6 Explorer 435W', tec: 'HPBC All-Black', l: 1.722, w: 1.134, wp: 435, eff: 22.3, price: 105, voc: 43.6, isc: 12.8, vmp: 36.6, imp: 11.9, tier: 'Tier 1' },
    { id: 'trina_450', brand: 'Trina Solar', model: 'Vertex S+ 450W', tec: 'N-Type TOPCon Dual-Glass', l: 1.762, w: 1.134, wp: 450, eff: 22.5, price: 110, voc: 52.9, isc: 10.74, vmp: 44.6, imp: 10.09, tier: 'Tier 1' },
    { id: 'canadian_665', brand: 'Canadian Solar', model: 'HiKu7 Mono 665W', tec: 'Mono PERC Industrial', l: 2.384, w: 1.303, wp: 665, eff: 21.4, price: 145, voc: 45.6, isc: 18.51, vmp: 38.3, imp: 17.37, tier: 'Tier 1' },
    { id: 'aiko_455', brand: 'Aiko Solar', model: 'Neostar 2S+ 455W', tec: 'All-Black ABC', l: 1.757, w: 1.134, wp: 455, eff: 23.6, price: 135, voc: 40.8, isc: 14.1, vmp: 34.2, imp: 13.3, tier: 'Tier 1' },
    { id: 'jinko_480', brand: 'Jinko Solar', model: 'Tiger Neo N-Type 480W', tec: 'N-Type TOPCon', l: 1.903, w: 1.134, wp: 480, eff: 22.24, price: 118, voc: 43.16, isc: 14.07, vmp: 35.69, imp: 13.45, tier: 'Tier 1' },
    { id: 'tier1_std_450', brand: 'Genérico Tier 1', model: 'Mono PERC 450W', tec: 'Monocristalino', l: 2.10, w: 1.05, wp: 450, eff: 21.5, price: 135, voc: 41.5, isc: 11.8, vmp: 34.5, imp: 13.05, tier: 'Tier 1' }
  ],
  inverters: [
    { id: 'inv_huawei_5k', brand: 'Huawei', model: 'SUN2000-5KTL-L1', kw: 5.0, phases: 1, type: 'Monofásico Híbrido (1F+N)', mppt: 2, inputsPerMppt: 1, vDcMax: 600, vMpptMin: 90, vMpptMax: 560, vMpptNomMin: 180, vMpptNomMax: 480, vStart: 100, iMaxOperA: 12.5, iMaxScA: 18.0, maxOverload: 1.30, eff: 98.4, price: 1080 },
    { id: 'inv_huawei_10k', brand: 'Huawei', model: 'SUN2000-10KTL-M1', kw: 10.0, phases: 3, type: 'Trifásico Híbrido (3F+N)', mppt: 2, inputsPerMppt: 2, vDcMax: 1100, vMpptMin: 140, vMpptMax: 980, vMpptNomMin: 320, vMpptNomMax: 800, vStart: 200, iMaxOperA: 26.0, iMaxScA: 30.0, maxOverload: 1.35, eff: 98.6, price: 1750 },
    { id: 'inv_fronius_6k', brand: 'Fronius', model: 'Primo GEN24 6.0 Plus', kw: 6.0, phases: 1, type: 'Monofásico Híbrido (1F+N)', mppt: 2, inputsPerMppt: 1, vDcMax: 1000, vMpptMin: 65, vMpptMax: 800, vMpptNomMin: 210, vMpptNomMax: 800, vStart: 80, iMaxOperA: 16.0, iMaxScA: 22.0, maxOverload: 1.25, eff: 97.6, price: 1950 },
    { id: 'inv_sungrow_10k', brand: 'Sungrow', model: 'SG10RT', kw: 10.0, phases: 3, type: 'Trifásico Red (3F+N)', mppt: 2, inputsPerMppt: 2, vDcMax: 1100, vMpptMin: 160, vMpptMax: 1000, vMpptNomMin: 350, vMpptNomMax: 850, vStart: 180, iMaxOperA: 25.0, iMaxScA: 32.0, maxOverload: 1.30, eff: 98.5, price: 1450 },
    { id: 'inv_kostal_8k', brand: 'Kostal', model: 'PLENTICORE plus 8.5', kw: 8.5, phases: 3, type: 'Trifásico Híbrido (3 MPPT)', mppt: 3, inputsPerMppt: 1, vDcMax: 1000, vMpptMin: 120, vMpptMax: 900, vMpptNomMin: 290, vMpptNomMax: 720, vStart: 150, iMaxOperA: 13.0, iMaxScA: 24.0, maxOverload: 1.25, eff: 97.5, price: 1820 },
    { id: 'inv_sma_5k', brand: 'SMA', model: 'Sunny Boy 5.0', kw: 5.0, phases: 1, type: 'Monofásico Red (1F+N)', mppt: 2, inputsPerMppt: 1, vDcMax: 600, vMpptMin: 100, vMpptMax: 550, vMpptNomMin: 175, vMpptNomMax: 480, vStart: 125, iMaxOperA: 12.0, iMaxScA: 15.0, maxOverload: 1.25, eff: 97.0, price: 1150 }
  ],
  batteries: [
    { id: 'bat_none', brand: 'Ninguna', model: 'Sin Almacenamiento (0 kWh)', kwh: 0, type: 'Directo Red', price: 0 },
    { id: 'bat_huawei_5k', brand: 'Huawei', model: 'LUNA2000-5-S0 (5 kWh)', kwh: 5.0, type: 'LFP Alto Voltaje', price: 2400 },
    { id: 'bat_huawei_10k', brand: 'Huawei', model: 'LUNA2000-10-S0 (10 kWh)', kwh: 10.0, type: 'LFP Alto Voltaje', price: 4200 },
    { id: 'bat_huawei_15k', brand: 'Huawei', model: 'LUNA2000-15-S0 (15 kWh)', kwh: 15.0, type: 'LFP Alto Voltaje', price: 6100 },
    { id: 'bat_byd_hvs_10', brand: 'BYD', model: 'Battery-Box Premium HVS 10.2', kwh: 10.24, type: 'LFP Modular Alto Voltaje', price: 4350 },
    { id: 'bat_enphase_5p', brand: 'Enphase', model: 'IQ Battery 5P (5 kWh AC)', kwh: 5.0, type: 'LFP AC Integrada', price: 3100 }
  ],
  microinverters: [
    { id: 'mlpe_enphase_iq8', brand: 'Enphase', model: 'IQ8HC Microinversor (1 módulo)', kw: 0.384, type: 'Microinversor 1-en-1', price: 125 },
    { id: 'mlpe_hoymiles_800', brand: 'Hoymiles', model: 'HMS-800-2T (2 módulos)', kw: 0.800, type: 'Microinversor 2-en-1', price: 175 },
    { id: 'mlpe_solaredge_s500', brand: 'SolarEdge', model: 'Optimizador DC S500B', kw: 0.500, type: 'Optimizador DC', price: 65 },
    { id: 'mlpe_generic_95', brand: 'Genérico MLPE', model: 'Microinversor / Optimizador Estándar', kw: 0.450, type: 'MLPE 1-en-1', price: 95 }
  ],
  electricalPanels: [
    { id: 'panel_dc_1mppt', brand: 'Schneider / Dehn', model: 'Cuadro DC 1-MPPT (1000V SPD II + Secc. 25A)', type: 'Protección DC', price: 165, mppt: 1, vMax: 1000 },
    { id: 'panel_dc_2mppt', brand: 'Schneider / Dehn', model: 'Cuadro DC 2-MPPT (1000V 2x SPD II + 2x Secc. 25A)', type: 'Protección DC', price: 245, mppt: 2, vMax: 1000 },
    { id: 'panel_dc_combiner_4str', brand: 'Weidmüller / ABB', model: 'Combiner Box DC 4-Strings (Fusibles gPV 15A + SPD II)', type: 'Combiner Box', price: 340, mppt: 2, vMax: 1000 },
    { id: 'panel_ac_mono_25a', brand: 'Hager / Schneider', model: 'Cuadro General AC 1F (IGA 25A + Dif SI 30mA + SPD II)', type: 'Cuadro AC / CGBT', price: 185, amps: 25, phases: 1 },
    { id: 'panel_ac_mono_40a', brand: 'Hager / Schneider', model: 'Cuadro General AC 1F (IGA 40A + Dif SI 30mA + SPD II)', type: 'Cuadro AC / CGBT', price: 215, amps: 40, phases: 1 },
    { id: 'panel_ac_tri_25a', brand: 'Hager / Schneider', model: 'Cuadro General AC 3F (IGA 4P 25A + Dif SI 4P + SPD II)', type: 'Cuadro AC / CGBT', price: 295, amps: 25, phases: 3 },
    { id: 'panel_ac_tri_40a', brand: 'Hager / Schneider', model: 'Cuadro General AC 3F (IGA 4P 40A + Dif SI 4P + SPD II)', type: 'Cuadro AC / CGBT', price: 360, amps: 40, phases: 3 }
  ],
  cables: [
    { id: 'cable_dc_zzf_4', brand: 'Prysmian / Top Cable', model: 'Solar ZZ-F 1500V 4 mm² Cu', type: 'Cable Solar DC', pricePerMeter: 1.45, sec: 4 },
    { id: 'cable_dc_zzf_6', brand: 'Prysmian / Top Cable', model: 'Solar ZZ-F 1500V 6 mm² Cu', type: 'Cable Solar DC', pricePerMeter: 1.85, sec: 6 },
    { id: 'cable_dc_zzf_10', brand: 'Prysmian / Top Cable', model: 'Solar ZZ-F 1500V 10 mm² Cu', type: 'Cable Solar DC', pricePerMeter: 2.90, sec: 10 },
    { id: 'cable_dc_zzf_16', brand: 'Prysmian / Top Cable', model: 'Solar ZZ-F 1500V 16 mm² Cu', type: 'Cable Solar DC', pricePerMeter: 4.20, sec: 16 },
    { id: 'cable_ac_rvk_3g6', brand: 'General Cable / Miguelez', model: 'RV-K 0.6/1kV 3G6 mm² Cu (1F)', type: 'Cable Evacuación AC Monofásico', pricePerMeter: 2.40, sec: 6 },
    { id: 'cable_ac_rvk_3g10', brand: 'General Cable / Miguelez', model: 'RV-K 0.6/1kV 3G10 mm² Cu (1F)', type: 'Cable Evacuación AC Monofásico', pricePerMeter: 3.80, sec: 10 },
    { id: 'cable_ac_rvk_5g6', brand: 'General Cable / Miguelez', model: 'RV-K 0.6/1kV 5G6 mm² Cu (3F)', type: 'Cable Evacuación AC Trifásico', pricePerMeter: 4.10, sec: 6 },
    { id: 'cable_ac_rvk_5g10', brand: 'General Cable / Miguelez', model: 'RV-K 0.6/1kV 5G10 mm² Cu (3F)', type: 'Cable Evacuación AC Trifásico', pricePerMeter: 6.20, sec: 10 },
    { id: 'cable_ac_rvk_5g16', brand: 'General Cable / Miguelez', model: 'RV-K 0.6/1kV 5G16 mm² Cu (3F)', type: 'Cable Evacuación AC Trifásico', pricePerMeter: 8.90, sec: 16 }
  ]
};

let equipmentCatalog = loadEquipmentCatalog();
window.equipmentCatalog = equipmentCatalog;
let currentCatalogTab = 'modules';

function loadEquipmentCatalog() {
  try {
    const raw = localStorage.getItem('ra_equipment_catalog');
    if (raw) {
      const parsed = JSON.parse(raw);
      let inverters = Array.isArray(parsed.inverters) && parsed.inverters.length > 0 ? parsed.inverters : DEFAULT_EQUIPMENT_CATALOG.inverters;
      if (inverters.length > 0 && !inverters[0].vDcMax) {
        inverters = DEFAULT_EQUIPMENT_CATALOG.inverters;
      } else {
        // Hidratación suave de campos electrotécnicos nuevos si vienen de una versión previa
        inverters.forEach(inv => {
          if (inv.iMaxOperA === undefined) inv.iMaxOperA = inv.iMaxScA ? Math.round((inv.iMaxScA * 0.75) * 10) / 10 : 15.0;
          if (inv.inputsPerMppt === undefined) inv.inputsPerMppt = (inv.kw && inv.kw >= 8.0) ? 2 : 1;
          if (inv.vStart === undefined) inv.vStart = inv.vMpptMin ? Math.round(inv.vMpptMin * 1.1) : 120;
        });
      }
      return {
        modules: Array.isArray(parsed.modules) && parsed.modules.length > 0 ? parsed.modules : DEFAULT_EQUIPMENT_CATALOG.modules,
        inverters: inverters,
        batteries: Array.isArray(parsed.batteries) && parsed.batteries.length > 0 ? parsed.batteries : DEFAULT_EQUIPMENT_CATALOG.batteries,
        microinverters: Array.isArray(parsed.microinverters) && parsed.microinverters.length > 0 ? parsed.microinverters : DEFAULT_EQUIPMENT_CATALOG.microinverters,
        electricalPanels: Array.isArray(parsed.electricalPanels) && parsed.electricalPanels.length > 0 ? parsed.electricalPanels : DEFAULT_EQUIPMENT_CATALOG.electricalPanels,
        cables: Array.isArray(parsed.cables) && parsed.cables.length > 0 ? parsed.cables : DEFAULT_EQUIPMENT_CATALOG.cables
      };
    }
  } catch (e) {}
  return JSON.parse(JSON.stringify(DEFAULT_EQUIPMENT_CATALOG));
}

function saveEquipmentCatalog() {
  try {
    localStorage.setItem('ra_equipment_catalog', JSON.stringify(equipmentCatalog));
  } catch (e) {}
  window.equipmentCatalog = equipmentCatalog;
  populateModuleDropdown();
  populateEquipmentModalUI();
}

function resetEquipmentCatalogToDefault() {
  if (confirm('¿Deseas restaurar el catálogo oficial de equipos FV a los valores de fábrica?')) {
    equipmentCatalog = JSON.parse(JSON.stringify(DEFAULT_EQUIPMENT_CATALOG));
    window.equipmentCatalog = equipmentCatalog;
    saveEquipmentCatalog();
    showStatus('CATÁLOGO DE EQUIPOS RESTAURADO', 2000);
  }
}

function populateModuleDropdown() {
  const sel = document.getElementById('faldon-module-select') || document.getElementById('cfg-modulo-select');
  if (!sel) return;

  const currentModName = (panelConfig && panelConfig.modelo) ? panelConfig.modelo : '';
  let optionsHtml = equipmentCatalog.modules.map((m, idx) => {
    const isSelected = m.model === currentModName || (m.brand + ' ' + m.model === currentModName) || (idx === 0 && !currentModName);
    return '<option value="' + m.id + '"' + (isSelected ? ' selected' : '') + '>' +
      m.brand + ' · ' + m.model + ' (' + m.wp + 'Wp · ' + m.l.toFixed(2) + '×' + m.w.toFixed(2) + 'm)' +
    '</option>';
  }).join('');

  optionsHtml += '<option value="__custom__"><i data-lucide="settings" class="icon-sm"></i> Personalizado / Otro modelo…</option>';
  sel.innerHTML = optionsHtml;
}

function onSelectModuleFromDropdown(modId) {
  if (modId === '__custom__') {
    openEquipmentCatalogModal('modules');
    return;
  }
  const m = equipmentCatalog.modules.find(mod => mod.id === modId);
  if (!m) return;

  panelConfig.modelo = m.brand + ' ' + m.model;
  panelConfig.tecnologia = m.tec || 'Monocristalino';
  panelConfig.largo = m.l;
  panelConfig.ancho = m.w;
  panelConfig.potencia = m.wp;
  panelConfig.rendimiento = m.eff;
  panelConfig.precio = m.price;
  panelConfig.voc = m.voc;
  panelConfig.isc = m.isc;
  panelConfig.vmp = m.vmp;
  panelConfig.imp = m.imp;

  const modInput = document.getElementById('cfg-modelo');
  const tecInput = document.getElementById('cfg-tec');
  const larInput = document.getElementById('cfg-largo');
  const ancInput = document.getElementById('cfg-ancho');
  const potInput = document.getElementById('cfg-pot');
  const renInput = document.getElementById('cfg-rend');
  const preInput = document.getElementById('cfg-precio');
  const tagTier  = document.getElementById('cfg-tag-tier');

  if (modInput) modInput.value = panelConfig.modelo;
  if (tecInput) tecInput.value = panelConfig.tecnologia;
  if (larInput) larInput.value = panelConfig.largo.toFixed(2);
  if (ancInput) ancInput.value = panelConfig.ancho.toFixed(2);
  if (potInput) potInput.value = panelConfig.potencia;
  if (renInput) renInput.value = panelConfig.rendimiento.toFixed(1);
  if (preInput) preInput.value = panelConfig.precio;
  if (tagTier) tagTier.textContent = (m.tier || 'TIER 1').toUpperCase();

  if (window.solarProjectConfig) {
    window.solarProjectConfig.selectedModuleId = m.id;
  }
  const modSel = document.getElementById('faldon-module-select') || document.getElementById('step3-sel-module');
  if (modSel) modSel.value = m.id;

  if (typeof step3UpdateHardwareSelection === 'function') {
    step3UpdateHardwareSelection();
  } else {
    updateConfigAndSimulate();
  }
  showStatus('MÓDULO SELECCIONADO: ' + panelConfig.modelo.toUpperCase() + ' (' + m.wp + ' Wp)', 2500);
}

// ── MODAL DEL CATÁLOGO DE EQUIPOS ──────────────────────────────────────────

window.openEquipmentCatalogModal = openEquipmentCatalogModal;
window.closeEquipmentCatalogModal = closeEquipmentCatalogModal;
window.switchCatalogTab = switchCatalogTab;
window.onSelectModuleFromDropdown = onSelectModuleFromDropdown;
window.applyInverterFromCatalog = applyInverterFromCatalog;
window.applyBatteryFromCatalog = applyBatteryFromCatalog;
window.deleteCatalogItem = deleteCatalogItem;
window.addNewEquipmentFromForm = addNewEquipmentFromForm;
window.resetEquipmentCatalogToDefault = resetEquipmentCatalogToDefault;

function openEquipmentCatalogModal(tab) {
  if (tab) currentCatalogTab = tab;
  const modal = document.getElementById('ra-equipment-catalog-modal');
  if (modal) {
    modal.style.display = 'flex';
    switchCatalogTab(currentCatalogTab);
  }
}

function closeEquipmentCatalogModal() {
  const modal = document.getElementById('ra-equipment-catalog-modal');
  if (modal) modal.style.display = 'none';
}

function switchCatalogTab(tabName) {
  currentCatalogTab = tabName;
  const editTabBtn = document.getElementById('cat-tab-btn-edit');
  if (editTabBtn) {
    editTabBtn.style.display = (tabName === 'edit') ? 'inline-flex' : 'none';
  }
  ['modules', 'inverters', 'batteries', 'microinverters', 'structures', 'installation_costs', 'add_new', 'edit', 'ai_import'].forEach(t => {
    const btn = document.getElementById('cat-tab-btn-' + t);
    const pane = document.getElementById('cat-pane-' + t);
    if (btn) btn.classList.toggle('active', t === tabName);
    if (pane) pane.style.display = (t === tabName) ? 'block' : 'none';
  });
  if (tabName === 'ai_import') {
    if (typeof window !== 'undefined' && window.RAEquipmentAIImporter && typeof window.RAEquipmentAIImporter.renderInitialUI === 'function') {
      window.RAEquipmentAIImporter.renderInitialUI(document.getElementById('cat-pane-ai_import'));
    }
  } else if (tabName === 'structures') {
    if (typeof window !== 'undefined' && window.RAStructureCatalog && typeof window.RAStructureCatalog.renderStructuresCatalogUI === 'function') {
      window.RAStructureCatalog.renderStructuresCatalogUI(document.getElementById('cat-pane-structures'));
    }
  } else if (tabName === 'installation_costs') {
    if (typeof window !== 'undefined' && window.RAStructureCatalog && typeof window.RAStructureCatalog.renderInstallationCostsUI === 'function') {
      window.RAStructureCatalog.renderInstallationCostsUI(document.getElementById('cat-pane-installation_costs'));
    }
  } else if (tabName !== 'edit') {
    populateEquipmentModalUI();
  }
}

function populateEquipmentModalUI() {
  // 1. Módulos
  const modTable = document.getElementById('cat-modules-table-body');
  if (modTable) {
    modTable.innerHTML = equipmentCatalog.modules.map((m, idx) => {
      const isCurrent = panelConfig && panelConfig.modelo && panelConfig.modelo.includes(m.model);
      const isCustom = idx >= 7;
      let delBtn = isCustom ? ('<button class="doc-mini-btn" onclick="deleteCatalogItem(\'modules\',\'' + m.id + '\')" style="padding:4px 6px;font-size:9px;color:var(--rose-500);"><i data-lucide=\"x\" class=\"icon-sm\"></i></button>') : '';
      return '<tr style="border-bottom:1px solid rgba(255,255,255,0.06);' + (isCurrent ? 'background:rgba(245,158,11,0.1);' : '') + '">' +
        '<td style="padding:8px 10px;"><b>' + m.brand + '</b> ' + m.model + (isCurrent ? ' <span style="color:var(--amber-400);font-size:9px;">[ACTIVO]</span>' : '') + '</td>' +
        '<td style="padding:8px 10px;text-align:center;"><span style="color:var(--emerald-400);font-weight:bold;">' + m.wp + ' Wp</span></td>' +
        '<td style="padding:8px 10px;text-align:center;">' + m.eff + ' %</td>' +
        '<td style="padding:8px 10px;text-align:center;font-family:monospace;">' + m.l.toFixed(2) + ' × ' + m.w.toFixed(2) + ' m</td>' +
        '<td style="padding:8px 10px;text-align:center;color:var(--amber-400);font-weight:bold;">' + m.price + ' €</td>' +
        '<td style="padding:8px 10px;text-align:right;">' +
          '<button class="doc-mini-btn" onclick="openEditEquipmentModal(\'modules\', \'' + m.id + '\')" style="padding:4px 8px;font-size:9px;border-color:var(--sky-400);color:var(--sky-400);margin-right:4px;"><i data-lucide=\"edit-2\" class=\"icon-sm\"></i> EDITAR</button>' +
            '<button class="doc-mini-btn" onclick="onSelectModuleFromDropdown(\'' + m.id + '\');closeEquipmentCatalogModal();" style="padding:4px 8px;font-size:9px;border-color:var(--emerald-400);color:var(--emerald-400);margin-right:4px;">SELECCIONAR</button>' +
          delBtn +
        '</td>' +
      '</tr>';
    }).join('');
  }

  // 2. Inversores
  const invTable = document.getElementById('cat-inverters-table-body');
  if (invTable) {
    invTable.innerHTML = equipmentCatalog.inverters.map((inv, idx) => {
      const isCustom = idx >= 5;
      let delBtn = isCustom ? ('<button class="doc-mini-btn" onclick="deleteCatalogItem(\'inverters\',\'' + inv.id + '\')" style="padding:4px 6px;font-size:9px;color:var(--rose-500);"><i data-lucide=\"x\" class=\"icon-sm\"></i></button>') : '';
      const inputs = inv.inputsPerMppt || 1;
      const vMin = inv.vMpptMin || inv.vMpptNomMin || 160;
      const vMax = inv.vMpptMax || inv.vMpptNomMax || 850;
      const iOper = (inv.iMaxOperA || (inv.iMaxScA ? Math.round(inv.iMaxScA * 0.75 * 10) / 10 : 15.0)).toFixed(1);
      const iSc = (inv.iMaxScA || 25.0).toFixed(1);

      return '<tr style="border-bottom:1px solid rgba(255,255,255,0.06);font-size:9.5px;">' +
        '<td style="padding:6px 8px;"><b>' + inv.brand + '</b> ' + inv.model + '<br><span style="font-size:8px;color:var(--text-slate-400);">' + (inv.type || 'Híbrido') + '</span></td>' +
        '<td style="padding:6px 8px;text-align:center;"><span style="color:var(--blue-400);font-weight:bold;">' + inv.kw + ' kW</span></td>' +
        '<td style="padding:6px 8px;text-align:center;">' + inv.mppt + ' MPPT <span style="font-size:8px;color:var(--emerald-400);">(' + inputs + ' str/mppt)</span></td>' +
        '<td style="padding:6px 8px;text-align:center;font-family:monospace;font-size:9px;">' + (inv.vDcMax || 1000) + 'V <span style="color:var(--text-slate-400);">(' + vMin + '-' + vMax + 'V)</span></td>' +
        '<td style="padding:6px 8px;text-align:center;font-family:monospace;font-size:9px;"><b style="color:var(--amber-400);">' + iOper + 'A</b> / <span style="color:var(--emerald-400);">' + iSc + 'A</span></td>' +
        '<td style="padding:6px 8px;text-align:center;color:var(--amber-400);font-weight:bold;">' + inv.price + ' €</td>' +
        '<td style="padding:6px 8px;text-align:right;">' +
          '<button class="doc-mini-btn" onclick="openEditEquipmentModal(\'inverters\', \'' + inv.id + '\')" style="padding:3px 6px;font-size:8.5px;border-color:var(--sky-400);color:var(--sky-400);margin-right:3px;"><i data-lucide=\"edit-2\" class=\"icon-sm\"></i> EDITAR</button>' +
          '<button class="doc-mini-btn" onclick="applyInverterFromCatalog(\'' + inv.id + '\');closeEquipmentCatalogModal();" style="padding:3px 6px;font-size:8.5px;border-color:var(--blue-400);color:var(--blue-400);margin-right:3px;">APLICAR</button>' +
          delBtn +
        '</td>' +
      '</tr>';
    }).join('');
  }

  // 3. Baterías
  const batTable = document.getElementById('cat-batteries-table-body');
  if (batTable) {
    batTable.innerHTML = equipmentCatalog.batteries.map((bat, idx) => {
      const isCustom = idx >= 6;
      let delBtn = isCustom ? ('<button class="doc-mini-btn" onclick="deleteCatalogItem(\'batteries\',\'' + bat.id + '\')" style="padding:4px 6px;font-size:9px;color:var(--rose-500);"><i data-lucide=\"x\" class=\"icon-sm\"></i></button>') : '';
      return '<tr style="border-bottom:1px solid rgba(255,255,255,0.06);">' +
        '<td style="padding:8px 10px;"><b>' + bat.brand + '</b> ' + bat.model + '</td>' +
        '<td style="padding:8px 10px;text-align:center;"><span style="color:var(--emerald-400);font-weight:bold;">' + bat.kwh + ' kWh</span></td>' +
        '<td style="padding:8px 10px;text-align:center;">' + (bat.type || 'LFP') + '</td>' +
        '<td style="padding:8px 10px;text-align:center;color:var(--amber-400);font-weight:bold;">' + bat.price + ' €</td>' +
        '<td style="padding:8px 10px;text-align:right;">' +
          '<button class="doc-mini-btn" onclick="openEditEquipmentModal(\'batteries\', \'' + bat.id + '\')" style="padding:4px 8px;font-size:9px;border-color:var(--sky-400);color:var(--sky-400);margin-right:4px;"><i data-lucide=\"edit-2\" class=\"icon-sm\"></i> EDITAR</button>' +
            '<button class="doc-mini-btn" onclick="applyBatteryFromCatalog(\'' + bat.id + '\');closeEquipmentCatalogModal();" style="padding:4px 8px;font-size:9px;border-color:var(--emerald-400);color:var(--emerald-400);margin-right:4px;">APLICAR</button>' +
          delBtn +
        '</td>' +
      '</tr>';
    }).join('');
  }

  // 4. Microinversores
  const mlpeTable = document.getElementById('cat-microinverters-table-body');
  if (mlpeTable) {
    mlpeTable.innerHTML = equipmentCatalog.microinverters.map((mi, idx) => {
      const isCustom = idx >= 4;
      let delBtn = isCustom ? ('<button class="doc-mini-btn" onclick="deleteCatalogItem(\'microinverters\',\'' + mi.id + '\')" style="padding:4px 6px;font-size:9px;color:var(--rose-500);"><i data-lucide=\"x\" class=\"icon-sm\"></i></button>') : '<span style="font-size:9px;color:var(--text-slate-400);">OFICIAL</span>';
      return '<tr style="border-bottom:1px solid rgba(255,255,255,0.06);">' +
        '<td style="padding:8px 10px;"><b>' + mi.brand + '</b> ' + mi.model + '</td>' +
        '<td style="padding:8px 10px;text-align:center;"><span style="color:var(--emerald-400);font-weight:bold;">' + (mi.kw * 1000) + ' W</span></td>' +
        '<td style="padding:8px 10px;text-align:center;">' + (mi.type || 'Microinversor') + '</td>' +
        '<td style="padding:8px 10px;text-align:center;color:var(--amber-400);font-weight:bold;">' + mi.price + ' €</td>' +
        '<td style="padding:8px 10px;text-align:right;">' +
          delBtn +
        '</td>' +
      '</tr>';
    }).join('');
  }
}

function applyInverterFromCatalog(invId) {
  const inv = equipmentCatalog.inverters.find(i => i.id === invId);
  if (!inv) return;
  if (typeof window !== 'undefined' && window.solarProjectConfig) {
    window.solarProjectConfig.selectedInverterId = invId;
  }
  const selInv = document.getElementById('step3-sel-inverter');
  if (selInv) selInv.value = invId;
  const invCostEl = document.getElementById('cfg-pres-inv');
  if (invCostEl) invCostEl.value = inv.price;
  if (typeof step3UpdateHardwareSelection === 'function') {
    step3UpdateHardwareSelection();
  } else {
    updateBudgetUI();
  }
  showStatus('INVERSOR ASIGNADO: ' + inv.brand + ' ' + inv.model + ' (' + inv.kw + ' kW)', 2500);
}

function applyBatteryFromCatalog(batId) {
  const bat = equipmentCatalog.batteries.find(b => b.id === batId);
  if (!bat) return;
  if (typeof window !== 'undefined' && window.solarProjectConfig) {
    window.solarProjectConfig.selectedBatteryId = batId;
  }
  const selBatId = document.getElementById('step3-sel-battery');
  if (selBatId) selBatId.value = batId;
  const batCostEl = document.getElementById('cfg-pres-bat');
  const rowBat = document.getElementById('row-bat-cost');
  const selBat = document.getElementById('cfg-pres-bat-opt');
  if (batCostEl) batCostEl.value = bat.price;
  if (rowBat) rowBat.style.display = bat.kwh > 0 ? 'flex' : 'none';
  if (selBat) {
    if (bat.kwh === 0) selBat.value = '0';
    else if (bat.kwh <= 5.5) selBat.value = '5';
    else if (bat.kwh <= 10.5) selBat.value = '10';
    else selBat.value = '15';
  }
  if (typeof step3UpdateHardwareSelection === 'function') {
    step3UpdateHardwareSelection();
  } else {
    updateBudgetUI();
  }
  if (typeof wpRenderBattery3D === 'function') {
    wpRenderBattery3D();
  }
  showStatus('BATERÍA ASIGNADA: ' + bat.brand + ' ' + bat.model + ' (' + bat.kwh + ' kWh)', 2500);
}

function wpRenderBattery3D(inverterCartesian) {
  if (typeof viewer === 'undefined' || !viewer || !window.inverterEquipmentState) return;
  const s = window.inverterEquipmentState;
  const basePos = inverterCartesian || s.position;
  if (!basePos) return;

  const cat = (typeof equipmentCatalog !== 'undefined') ? equipmentCatalog : (typeof DEFAULT_EQUIPMENT_CATALOG !== 'undefined' ? DEFAULT_EQUIPMENT_CATALOG : null);
  const cfg = window.solarProjectConfig || {};

  // Si no hay batería configurada o es 'bat_none', purgar entidad y etiqueta 3D
  if (!cfg.selectedBatteryId || cfg.selectedBatteryId === 'bat_none') {
    if (s.batteryEntity) {
      try { viewer.entities.remove(s.batteryEntity); } catch(e) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(e, 'Entidad/Primitiva Cesium'); }
      s.batteryEntity = null;
    }
    if (s.batteryLabel2D) {
      try { if (typeof removeLabel2DEntity === 'function') removeLabel2DEntity(s.batteryLabel2D); } catch(e) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(e, 'Entidad/Primitiva Cesium'); }
      s.batteryLabel2D = null;
    }
    s.batteryPosition = null;
    s.batteryCarto = null;
    if (typeof wpCalculateAndRenderInverterCables === 'function') wpCalculateAndRenderInverterCables();
    return;
  }

  const batItem = (cat && cat.batteries) ? cat.batteries.find(b => b.id === cfg.selectedBatteryId) : null;
  if (!batItem || batItem.id === 'bat_none' || (typeof batItem.kwh === 'number' && batItem.kwh <= 0)) {
    if (s.batteryEntity) {
      try { viewer.entities.remove(s.batteryEntity); } catch(e) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(e, 'Entidad/Primitiva Cesium'); }
      s.batteryEntity = null;
    }
    if (s.batteryLabel2D) {
      try { if (typeof removeLabel2DEntity === 'function') removeLabel2DEntity(s.batteryLabel2D); } catch(e) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(e, 'Entidad/Primitiva Cesium'); }
      s.batteryLabel2D = null;
    }
    s.batteryPosition = null;
    s.batteryCarto = null;
    if (typeof wpCalculateAndRenderInverterCables === 'function') wpCalculateAndRenderInverterCables();
    return;
  }

  const batCount = Math.max(1, (cfg.autoSizing && cfg.autoSizing.batteries && cfg.autoSizing.batteries.count) || 1);
  const batModelName = batItem.brand ? (batItem.brand + ' ' + batItem.model) : (batItem.model || 'Batería LFP 5kWh');
  const batTotalKWh = (batItem.kwh || 5.0) * batCount;
  const batHeight = Math.min(1.4, 0.65 + (batCount - 1) * 0.20);

  // Si ya tiene posición personalizada en la escena, conservarla; si no, colocarla 65cm a la izquierda del inversor
  let batCartesian = s.batteryPosition;
  let batPosCarto = null;
  if (!batCartesian) {
    batPosCarto = Cesium.Cartographic.fromCartesian(basePos);
    batCartesian = Cesium.Cartesian3.fromRadians(batPosCarto.longitude - 0.00000009, batPosCarto.latitude - 0.00000006, batPosCarto.height + (batHeight / 2.0));
    s.batteryPosition = batCartesian;
    s.batteryCarto = { latitude: Cesium.Math.toDegrees(batPosCarto.latitude - 0.00000006), longitude: Cesium.Math.toDegrees(batPosCarto.longitude - 0.00000009), height: batPosCarto.height };
  } else {
    batPosCarto = Cesium.Cartographic.fromCartesian(batCartesian);
  }

  // Purgar entidad anterior antes de crear la actualizada
  if (s.batteryEntity) {
    try { viewer.entities.remove(s.batteryEntity); } catch(e) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(e, 'Entidad/Primitiva Cesium'); }
    s.batteryEntity = null;
  }
  if (s.batteryLabel2D) {
    try { if (typeof removeLabel2DEntity === 'function') removeLabel2DEntity(s.batteryLabel2D); } catch(e) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(e, 'Entidad/Primitiva Cesium'); }
    s.batteryLabel2D = null;
  }

  const fnSvgUri = (typeof getSafeSvgDataUri === 'function') ? getSafeSvgDataUri : function(svg) { return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); };
  const fnScaleDims = (typeof wpBoxDimsScaled === 'function') ? wpBoxDimsScaled : function(d) { return d; };
  const batSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 24 24" fill="#0F172A" stroke="#10B981" stroke-width="2"><rect x="6" y="7" width="12" height="14" rx="2" fill="#1e293b"/><line x1="9" y1="3" x2="15" y2="3"/><line x1="9" y1="11" x2="15" y2="11"/><line x1="9" y1="15" x2="15" y2="15"/></svg>';
  const batEntity = viewer.entities.add({
    id: 'ra_battery_storage_box_3d',
    name: 'Sistema de Baterías LFP (' + batModelName + ')',
    position: batCartesian,
    billboard: {
      image: fnSvgUri(batSvg),
      scale: 0.85,
      heightReference: Cesium.HeightReference.NONE,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      eyeOffset: new Cesium.Cartesian3(0, 0, -10.0),
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM
    },
    box: {
      dimensions: fnScaleDims(new Cesium.Cartesian3(0.60, 0.25, batHeight), batCartesian),
      material: Cesium.Color.fromCssColorString('#0F172A'),
      outline: true,
      outlineColor: Cesium.Color.fromCssColorString('#10B981'),
      shadows: Cesium.ShadowMode.ENABLED
    }
  });
  s.batteryEntity = batEntity;
  if (typeof s.batteryRotation === 'undefined') s.batteryRotation = 0;

  const batLabelText = '🔋 BATERÍA LFP (' + batTotalKWh.toFixed(1) + ' kWh)\n' + batCount + 'x ' + (batItem.brand || 'LFP');
  if (typeof addLabelEntity === 'function') {
    s.batteryLabel2D = addLabelEntity(batCartesian, batLabelText, -46, {
      bg: 'rgba(15, 23, 42, 0.92)',
      borderColor: '#10B981',
      textColor: '#FFFFFF',
      font: "bold 9.5px 'JetBrains Mono', monospace",
      category: 'electrical',
      equipmentType: 'battery'
    });
  }

  if (typeof wpCalculateAndRenderInverterCables === 'function') {
    wpCalculateAndRenderInverterCables();
  }
}
window.wpRenderBattery3D = wpRenderBattery3D;

function deleteCatalogItem(category, id) {
  if (!equipmentCatalog[category]) return;
  equipmentCatalog[category] = equipmentCatalog[category].filter(item => item.id !== id);
  saveEquipmentCatalog();
  showStatus('ELEMENTO ELIMINADO DEL CATÁLOGO', 1800);
}

function addNewEquipmentFromForm() {
  const type = document.getElementById('new-eq-type').value;
  const brand = (document.getElementById('new-eq-brand').value || 'Personalizado').trim();
  const model = (document.getElementById('new-eq-model').value || 'Modelo Custom').trim();
  const price = Math.max(parseFloat(document.getElementById('new-eq-price').value) || 100, 0);

  const id = 'custom_' + Date.now();

  if (type === 'module') {
    const wp = Math.max(parseFloat(document.getElementById('new-mod-wp').value) || 450, 50);
    const l = Math.max(parseFloat(document.getElementById('new-mod-largo').value) || 2.10, 0.4);
    const w = Math.max(parseFloat(document.getElementById('new-mod-ancho').value) || 1.05, 0.3);
    const eff = Math.max(parseFloat(document.getElementById('new-mod-eff').value) || 21.5, 1);
    const tec = document.getElementById('new-mod-tec').value || 'Monocristalino';

    equipmentCatalog.modules.push({
      id, brand, model, tec, l, w, wp, eff, price,
      voc: Math.round(wp * 0.092 * 10) / 10,
      isc: Math.round((wp / 34.5) * 10) / 10,
      vmp: Math.round(wp * 0.076 * 10) / 10,
      imp: Math.round((wp / 38.0) * 10) / 10,
      tier: 'Custom'
    });
    saveEquipmentCatalog();
    onSelectModuleFromDropdown(id);
    switchCatalogTab('modules');
    showStatus('NUEVO MÓDULO "' + brand + ' ' + model + '" AÑADIDO Y SELECCIONADO', 2500);
  } else if (type === 'inverter') {
    const kw = Math.max(parseFloat(document.getElementById('new-inv-kw').value) || 5.0, 0.5);
    const mppt = parseInt(document.getElementById('new-inv-mppt').value, 10) || 2;
    const inputs = parseInt(document.getElementById('new-inv-inputs').value, 10) || 1;
    const vDcMax = parseFloat(document.getElementById('new-inv-vdcmax').value) || 1000;
    const vStart = parseFloat(document.getElementById('new-inv-vstart').value) || 120;
    const iMaxOperA = parseFloat(document.getElementById('new-inv-imaxoper').value) || 15.0;
    const iMaxScA = parseFloat(document.getElementById('new-inv-imaxsc').value) || 25.0;
    const invType = document.getElementById('new-inv-type').value || 'Híbrido';

    equipmentCatalog.inverters.push({
      id, brand, model, kw, mppt, inputsPerMppt: inputs,
      vDcMax, vStart, vMpptMin: Math.round(vStart * 0.8), vMpptMax: Math.round(vDcMax * 0.85),
      vMpptNomMin: Math.round(vStart * 1.1), vMpptNomMax: Math.round(vDcMax * 0.8),
      iMaxOperA, iMaxScA, maxOverload: 1.30,
      type: invType, eff: 98.2, price
    });
    saveEquipmentCatalog();
    applyInverterFromCatalog(id);
    switchCatalogTab('inverters');
    showStatus('NUEVO INVERSOR AÑADIDO Y APLICADO', 2500);
  } else if (type === 'battery') {
    const kwh = Math.max(parseFloat(document.getElementById('new-bat-kwh').value) || 5.0, 1.0);
    const batType = document.getElementById('new-bat-type').value || 'LFP Litio';

    equipmentCatalog.batteries.push({ id, brand, model, kwh, type: batType, price });
    saveEquipmentCatalog();
    applyBatteryFromCatalog(id);
    switchCatalogTab('batteries');
    showStatus('NUEVA BATERÍA AÑADIDA Y APLICADA', 2500);
  }
}

function initUnifiedWorkPlaneSystem() {
  const currentViewer = typeof viewer !== 'undefined' && viewer ? viewer : (window.viewer || null);
  const currentScene = currentViewer ? currentViewer.scene : null;
  if (!currentViewer || !currentScene || !currentScene.canvas) {
    if (typeof window !== 'undefined' && !window._wpInitPending) {
      window._wpInitPending = true;
      const _chkWpViewer = setInterval(() => {
        const checkViewer = typeof viewer !== 'undefined' && viewer ? viewer : (window.viewer || null);
        const checkScene = checkViewer ? checkViewer.scene : null;
        if (checkViewer && checkScene && checkScene.canvas) {
          clearInterval(_chkWpViewer);
          window._wpInitPending = false;
          initUnifiedWorkPlaneSystem();
        }
      }, 100);
    }
    return;
  }
  ensureTriadCanvas();
  try { initTriad3DEntities(); } catch(e){}
  if (typeof populateModuleDropdown === 'function') populateModuleDropdown();
  if (typeof wpUpdateUI === 'function') wpUpdateUI();
}


  // ── EXPORTACIÓN AL NAMESPACE GLOBAL Y WINDOW.RA ─────────────────────
  window.WP = WP;
  if (typeof triadState !== 'undefined') window.triadState = triadState;
  if (typeof vtxGizmoState !== 'undefined') window.vtxGizmoState = vtxGizmoState;
  if (typeof obsGizmoState !== 'undefined') window.obsGizmoState = obsGizmoState;
  if (typeof panelGizmoState !== 'undefined') window.panelGizmoState = panelGizmoState;
  if (typeof magneticSnapActive !== 'undefined') window.magneticSnapActive = magneticSnapActive;

  // Funciones primarias del Plano de Trabajo 3D y Stepper
  if (typeof wpStartDefinePlane !== 'undefined') window.wpStartDefinePlane = wpStartDefinePlane;
  if (typeof wpAddPlanePoint !== 'undefined') window.wpAddPlanePoint = wpAddPlanePoint;
  if (typeof wpComputePlaneFrom3Points !== 'undefined') window.wpComputePlaneFrom3Points = wpComputePlaneFrom3Points;
  if (typeof wpSetMode !== 'undefined') window.wpSetMode = wpSetMode;
  if (typeof wpGetActivePlane !== 'undefined') window.wpGetActivePlane = wpGetActivePlane;
  if (typeof wpSelectActivePlane !== 'undefined') window.wpSelectActivePlane = wpSelectActivePlane;
  if (typeof wpEditActivePlane !== 'undefined') window.wpEditActivePlane = wpEditActivePlane;
  if (typeof wpDeleteActivePlane !== 'undefined') window.wpDeleteActivePlane = wpDeleteActivePlane;
  if (typeof wpDeletePlane !== 'undefined') window.wpDeletePlane = wpDeletePlane;
  if (typeof wpTogglePlaneVertices !== 'undefined') window.wpTogglePlaneVertices = wpTogglePlaneVertices;
  if (typeof wpSetAxisMode !== 'undefined') window.wpSetAxisMode = wpSetAxisMode;
  if (typeof wpProjectPointToActivePlane !== 'undefined') window.wpProjectPointToActivePlane = wpProjectPointToActivePlane;
  if (typeof wpRayPlane !== 'undefined') window.wpRayPlane = wpRayPlane;
  if (typeof wpGoToStep !== 'undefined') window.wpGoToStep = wpGoToStep;

  // Polilíneas y faldones
  if (typeof startPolylineDrawMode !== 'undefined') window.startPolylineDrawMode = startPolylineDrawMode;
  if (typeof wpAddPolylinePoint !== 'undefined') window.wpAddPolylinePoint = wpAddPolylinePoint;
  if (typeof wpCloseActivePolyline !== 'undefined') window.wpCloseActivePolyline = wpCloseActivePolyline;
  if (typeof wpSelectPolyline !== 'undefined') window.wpSelectPolyline = wpSelectPolyline;
  if (typeof wpSelectVertex !== 'undefined') window.wpSelectVertex = wpSelectVertex;
  if (typeof wpDeleteSelectedPolyline !== 'undefined') window.wpDeleteSelectedPolyline = wpDeleteSelectedPolyline;
  if (typeof wpDeleteSelectedVertexFromList !== 'undefined') window.wpDeleteSelectedVertexFromList = wpDeleteSelectedVertexFromList;
  if (typeof wpInsertPointInSelectedPoly !== 'undefined') window.wpInsertPointInSelectedPoly = wpInsertPointInSelectedPoly;
  if (typeof wpSyncVertexInputs !== 'undefined') window.wpSyncVertexInputs = wpSyncVertexInputs;
  if (typeof wpRenderAllPolylines !== 'undefined') window.wpRenderAllPolylines = wpRenderAllPolylines;
  if (typeof wpRenderActivePlaneGizmo !== 'undefined') window.wpRenderActivePlaneGizmo = wpRenderActivePlaneGizmo;
  if (typeof wpPolylineArea3D !== 'undefined') window.wpPolylineArea3D = wpPolylineArea3D;
  if (typeof wpClearEntGroup !== 'undefined') window.wpClearEntGroup = wpClearEntGroup;
  if (typeof wpEnsureCounterClockwisePoints !== 'undefined') window.wpEnsureCounterClockwisePoints = wpEnsureCounterClockwisePoints;
  if (typeof wpSetPolyOrientation !== 'undefined') window.wpSetPolyOrientation = wpSetPolyOrientation;
  if (typeof wpSetPolyStructure !== 'undefined') window.wpSetPolyStructure = wpSetPolyStructure;
  if (typeof wpGetFaldonOrientationComparison !== 'undefined') window.wpGetFaldonOrientationComparison = wpGetFaldonOrientationComparison;
  if (typeof wpTogglePolyWalkway !== 'undefined') window.wpTogglePolyWalkway = wpTogglePolyWalkway;
  if (typeof wpApplyPolyWalkwayToAll !== 'undefined') window.wpApplyPolyWalkwayToAll = wpApplyPolyWalkwayToAll;
  if (typeof wpSetPolyTilt !== 'undefined') window.wpSetPolyTilt = wpSetPolyTilt;
  if (typeof wpSetPolyTiltRealtime !== 'undefined') window.wpSetPolyTiltRealtime = wpSetPolyTiltRealtime;
  if (typeof wpSetPolyAzimuthRealtime !== 'undefined') window.wpSetPolyAzimuthRealtime = wpSetPolyAzimuthRealtime;
  if (typeof wpUpdatePanelShadingAndMLPE !== 'undefined') window.wpUpdatePanelShadingAndMLPE = wpUpdatePanelShadingAndMLPE;

  // Tríada CAD y Gizmos
  if (typeof ensureTriadCanvas !== 'undefined') window.ensureTriadCanvas = ensureTriadCanvas;
  if (typeof initTriad3DEntities !== 'undefined') window.initTriad3DEntities = initTriad3DEntities;
  if (typeof renderTriad2D !== 'undefined') window.renderTriad2D = renderTriad2D;
  if (typeof updateTriadAtMouse !== 'undefined') window.updateTriadAtMouse = updateTriadAtMouse;
  if (typeof changeTriadScale !== 'undefined') window.changeTriadScale = changeTriadScale;
  if (typeof cursorGizmoShowAt !== 'undefined') window.cursorGizmoShowAt = cursorGizmoShowAt;
  if (typeof cursorGizmoHide !== 'undefined') window.cursorGizmoHide = cursorGizmoHide;
  if (typeof checkVertexGizmoHit !== 'undefined') window.checkVertexGizmoHit = checkVertexGizmoHit;
  if (typeof getSelectedVertexData !== 'undefined') window.getSelectedVertexData = getSelectedVertexData;
  if (typeof obsComputeUV !== 'undefined') window.obsComputeUV = obsComputeUV;

  // Paso 3 Auto-dimensionamiento y Catálogo
  if (typeof wpComputeAutoSizing !== 'undefined') window.wpComputeAutoSizing = wpComputeAutoSizing;
  if (typeof step3RenderAutoSizingUI !== 'undefined') window.step3RenderAutoSizingUI = step3RenderAutoSizingUI;
  if (typeof wpQuickPreview3DFromStep3 !== 'undefined') window.wpQuickPreview3DFromStep3 = wpQuickPreview3DFromStep3;
  if (typeof wpResetAutoSizing !== 'undefined') window.wpResetAutoSizing = wpResetAutoSizing;
  if (typeof step3SetTopology !== 'undefined') window.step3SetTopology = step3SetTopology;
// ═══════════════════════════════════════════════════════════════════════════
// 🌟 INTEGRACIÓN DE INCLINACIÓN ÓPTIMA, CASACIÓN DE INVERSORES Y MLPE
// ═══════════════════════════════════════════════════════════════════════════

function wpApplyRoofPreset(polyIdx, presetType) {
  if (!WP.polylines || !WP.polylines[polyIdx]) return;
  const poly = WP.polylines[polyIdx];
  const lat = (typeof solarProjectConfig !== 'undefined' && solarProjectConfig.latitude) ? solarProjectConfig.latitude : 40.41;
  const lon = (typeof solarProjectConfig !== 'undefined' && solarProjectConfig.longitude) ? solarProjectConfig.longitude : -3.70;

  if (typeof computeTiltYieldCurve === 'function') {
    const yieldData = computeTiltYieldCurve(lat, lon, poly.modAzimuth === 'auto' ? 180 : Number(poly.modAzimuth));
    let targetTilt = 15;
    if (presetType === 'max_annual') targetTilt = yieldData.optimalTilt;
    else if (presetType === 'max_density') targetTilt = 12;
    else if (presetType === 'coplanar') targetTilt = 0;

    poly.modTilt = targetTilt;
    poly.structureConfig = poly.structureConfig || {};
    poly.structureConfig.tiltDeg = targetTilt;
    poly.structureConfig.type = (targetTilt === 0) ? 'coplanar' : (targetTilt >= 25 ? 'triangles_30' : 'triangles_15');

    if (typeof computeInterRowPitch === 'function') {
      const pitchInfo = computeInterRowPitch({ moduleLength: 2.2, tiltDeg: targetTilt, latitude: lat });
      poly.structureConfig.pitchMeters = pitchInfo.totalPitchM;
    }
  }

  wpUpdateStep3UI();
  if (typeof wpFastRenderSimulatedPanels === 'function') wpFastRenderSimulatedPanels();
  if (typeof BOMTreeEngine !== 'undefined' && typeof BOMTreeEngine.refresh === 'function') BOMTreeEngine.refresh();
}

window.wpOpenSmartInverterMatchingModal = wpOpenSmartInverterMatchingModal;
window.wpApplyInverterScenario = wpApplyInverterScenario;

function wpOpenSmartInverterMatchingModal() {
  const container = document.getElementById('step3-smart-inverter-recommendations');
  if (!container) return;

  const catalog = (typeof equipmentCatalog !== 'undefined' && equipmentCatalog && equipmentCatalog.inverters) ? equipmentCatalog.inverters : [];
  const cfg = window.solarProjectConfig || {};
  const allModules = (typeof equipmentCatalog !== 'undefined' && equipmentCatalog && Array.isArray(equipmentCatalog.modules)) ? equipmentCatalog.modules : [];
  const selectedMod = allModules.find(m => m.id === cfg.selectedModuleId) || allModules[0] || (typeof panelConfig !== 'undefined' ? panelConfig : { wp: 450, isc: 13.8, voc: 41.5, vmp: 34.5, imp: 13.05 });

  let totalPanels = (Array.isArray(window.allRenderedPanels) && window.allRenderedPanels.length > 0)
    ? window.allRenderedPanels.filter(p => p && !p.deleted).length
    : 0;
  if (totalPanels === 0 && typeof WP !== 'undefined' && Array.isArray(WP.polylines)) {
    WP.polylines.forEach(p => {
      const pInfo = p.roofInfo || (typeof computeSinglePolylineRoofInfo === 'function' ? computeSinglePolylineRoofInfo(p.points, p) : null);
      if (pInfo && pInfo.panels) totalPanels += pInfo.panels.length;
    });
  }
  if (totalPanels === 0) totalPanels = cfg.lastEstimatedPanels || 24;

  const totalKwp = (totalPanels * (selectedMod.wp || selectedMod.potencia || 450)) / 1000.0;

  // Analizar orientaciones distintas de faldones
  let distinctOrientations = 1;
  const orientations = [];
  if (typeof WP !== 'undefined' && Array.isArray(WP.polylines) && WP.polylines.length > 0) {
    WP.polylines.forEach(poly => {
      if (poly && poly.points && poly.points.length >= 3) {
        const pInfo = poly.roofInfo || (typeof computeSinglePolylineRoofInfo === 'function' ? computeSinglePolylineRoofInfo(poly.points, poly) : null);
        const az = pInfo ? (pInfo.moduleAzimuthDeg ?? pInfo.azimuthDeg ?? 0) : 0;
        const tilt = pInfo ? (pInfo.moduleTiltDeg ?? pInfo.tiltDeg ?? 30) : 30;
        const isDupe = orientations.some(o => Math.abs(o.az - az) < 10 && Math.abs(o.tilt - tilt) < 5);
        if (!isDupe) orientations.push({ az, tilt });
      }
    });
    distinctOrientations = Math.max(1, orientations.length);
  }

  // Diagnóstico de sombras 3D y suministro de red (monofásico ≤ 6 kWp / trifásico > 6 kWp)
  const shading = (typeof wpEvaluateMLPENecessity === 'function') ? wpEvaluateMLPENecessity() : null;
  const gridSupply = (totalKwp > 6.0) ? 'three_phase' : 'single_phase';

  if (typeof matchInvertersFromCatalog !== 'function') {
    showStatus('<i data-lucide="alert-triangle" class="icon-sm"></i> Motor de casación no disponible temporalmente', 3000);
    return;
  }

  const match = matchInvertersFromCatalog({
    invertersCatalog: catalog,
    module: {
      wp: selectedMod.wp || selectedMod.potencia || 450,
      isc: selectedMod.isc || 13.8,
      voc: selectedMod.voc || 41.5,
      vmp: selectedMod.vmp || 34.5,
      imp: selectedMod.imp || 13.05
    },
    totalPanels: totalPanels,
    totalKwp: totalKwp,
    gridSupply: gridSupply,
    distinctOrientations: distinctOrientations,
    shadingDiagnostics: shading
  });

  const scA = match.recommendedScenarioA;
  const scB = match.recommendedScenarioB;
  const scC = match.recommendedScenarioC;

  const catalogMicros = (typeof equipmentCatalog !== 'undefined' && equipmentCatalog && Array.isArray(equipmentCatalog.microinverters)) ? equipmentCatalog.microinverters : [];
  const microId = (scC && scC.inverter && scC.inverter.id)
    ? scC.inverter.id
    : (catalogMicros.length > 0 ? catalogMicros[0].id : 'mlpe_hoymiles_800');

  container.innerHTML = `
    <div style="background:rgba(15,23,42,0.95);border:1px solid rgba(14,165,233,0.4);border-radius:8px;padding:8px;margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:3px;">
        <span style="font-weight:900;color:#38BDF8;font-size:10px;"><i data-lucide="zap" class="icon-sm"></i> ALTERNATIVAS DE INVERSOR (${totalKwp.toFixed(1)} kWp · ${gridSupply === 'single_phase' ? 'Monofásico 230V' : 'Trifásico 400V'})</span>
        <button type="button" class="doc-mini-btn" onclick="document.getElementById('step3-smart-inverter-recommendations').style.display='none'"><i data-lucide="x" class="icon-sm"></i></button>
      </div>

      <!-- Opción A -->
      ${scA ? `
      <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:6px;margin-bottom:4px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:9.5px;font-weight:bold;color:#FBBF24;">OPCIÓN A: Óptimo Multi-MPPT</span>
          <span style="font-size:9px;color:#34D399;font-weight:bold;">${scA.totalCostEur} €</span>
        </div>
        <div style="font-size:8.5px;color:#CBD5E1;margin:2px 0;">${scA.count}x ${scA.inverter.brand} ${scA.inverter.model} (${scA.totalAcKw} kW AC · Sobrecarga: ${scA.overloadPct}%)</div>
        <button type="button" class="doc-mini-btn" style="background:#0284C7;border-color:#0284C7;color:#fff;width:100%;margin-top:3px;font-weight:bold;padding:3px;" onclick="wpApplyInverterScenario('${scA.inverter.id}', ${scA.count}, 'inverter')">
          <i data-lucide="check" class="icon-sm"></i> APLICAR ESTA OPCIÓN
        </button>
      </div>` : ''}

      <!-- Opción B -->
      ${scB ? `
      <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:6px;margin-bottom:4px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:9.5px;font-weight:bold;color:#38BDF8;">OPCIÓN B: Descentralizado</span>
          <span style="font-size:9px;color:#34D399;font-weight:bold;">${scB.totalCostEur} €</span>
        </div>
        <div style="font-size:8.5px;color:#CBD5E1;margin:2px 0;">${scB.count}x ${scB.inverter.brand} ${scB.inverter.model} (${scB.totalAcKw} kW AC)</div>
        <button type="button" class="doc-mini-btn" style="background:#059669;border-color:#059669;color:#fff;width:100%;margin-top:3px;font-weight:bold;padding:3px;" onclick="wpApplyInverterScenario('${scB.inverter.id}', ${scB.count}, 'inverter')">
          <i data-lucide="check" class="icon-sm"></i> APLICAR ESTA OPCIÓN
        </button>
      </div>` : ''}

      <!-- Opción C -->
      ${scC ? `
      <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:6px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:9.5px;font-weight:bold;color:#34D399;">OPCIÓN C: Microinversores / MLPE</span>
          <span style="font-size:9px;color:#34D399;font-weight:bold;">${scC.estimatedCostEur} €</span>
        </div>
        <div style="font-size:8.5px;color:#CBD5E1;margin:2px 0;">${scC.estimatedUnits}x Microinversores (${scC.totalAcKw.toFixed(1)} kW AC)</div>
        <button type="button" class="doc-mini-btn" style="background:#10B981;border-color:#10B981;color:#fff;width:100%;margin-top:3px;font-weight:bold;padding:3px;" onclick="wpApplyInverterScenario('${microId}', ${scC.estimatedUnits}, 'microinverter')">
          <i data-lucide="check" class="icon-sm"></i> APLICAR ESTA OPCIÓN
        </button>
      </div>` : ''}
    </div>
  `;

  container.style.display = 'block';
  if (typeof container.scrollIntoView === 'function') {
    container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    try { window.lucide.createIcons(); } catch(e) {}
  }
}

function wpApplyInverterScenario(invId, count, topology) {
  if (window.solarProjectConfig) {
    if (topology === 'microinverter') {
      window.solarProjectConfig.selectedTopology = 'microinverter';
      window.solarProjectConfig.selectedMicroinverterId = invId;
      if (window.solarProjectConfig.autoSizing && window.solarProjectConfig.autoSizing.microinverters) {
        window.solarProjectConfig.autoSizing.microinverters.count = count;
        window.solarProjectConfig.autoSizing.microinverters.isManual = true;
      }
    } else {
      window.solarProjectConfig.selectedTopology = 'inverter';
      window.solarProjectConfig.selectedInverterId = invId;
      if (window.solarProjectConfig.autoSizing && window.solarProjectConfig.autoSizing.inverters) {
        window.solarProjectConfig.autoSizing.inverters.count = count;
        window.solarProjectConfig.autoSizing.inverters.isManual = true;
      }
    }
  }

  const selInv = document.getElementById('step3-sel-inverter');
  if (selInv && topology !== 'microinverter') selInv.value = invId;
  const selMi = document.getElementById('step3-sel-microinverter');
  if (selMi && topology === 'microinverter') selMi.value = invId;

  if (typeof step3SetTopology === 'function') step3SetTopology(topology);
  if (typeof step3UpdateHardwareSelection === 'function') step3UpdateHardwareSelection();
  if (typeof BOMTreeEngine !== 'undefined' && typeof BOMTreeEngine.refresh === 'function') BOMTreeEngine.refresh();

  const container = document.getElementById('step3-smart-inverter-recommendations');
  if (container) container.style.display = 'none';

  showStatus(`<i data-lucide=\"check\" class=\"icon-sm\"></i> CONFIGURACIÓN DE INVERSORES APLICADA: ${count}x ${invId}`, 4000);
}

function wpApplyMLPERecommendationAction() {
  if (typeof wpEvaluateMLPENecessity === 'function') {
    const diag = wpEvaluateMLPENecessity();
    diag.applySelectiveOptimizers();
    showStatus(`<i data-lucide=\"zap\" class=\"icon-sm\"></i> ${diag.criticalLossPanelsCount} OPTIMIZADORES APLICADOS A PLACAS SOMBREADAS`, 4500);
  }
  if (typeof wpFastRenderSimulatedPanels === 'function') wpFastRenderSimulatedPanels();
  if (typeof BOMTreeEngine !== 'undefined' && typeof BOMTreeEngine.refresh === 'function') BOMTreeEngine.refresh();
  const banner = document.getElementById('solar-mlpe-recommendation-banner');
  if (banner) banner.style.display = 'none';
}

  if (typeof step3EditCurrentEquipment !== 'undefined') window.step3EditCurrentEquipment = step3EditCurrentEquipment;
  if (typeof step3UpdateHardwareSelection !== 'undefined') window.step3UpdateHardwareSelection = step3UpdateHardwareSelection;
  if (typeof populateModuleDropdown !== 'undefined') window.populateModuleDropdown = populateModuleDropdown;
  if (typeof onSelectModuleFromDropdown !== 'undefined') window.onSelectModuleFromDropdown = onSelectModuleFromDropdown;
  if (typeof loadEquipmentCatalog !== 'undefined') window.loadEquipmentCatalog = loadEquipmentCatalog;
  if (typeof saveEquipmentCatalog !== 'undefined') window.saveEquipmentCatalog = saveEquipmentCatalog;
  if (typeof resetEquipmentCatalogToDefault !== 'undefined') window.resetEquipmentCatalogToDefault = resetEquipmentCatalogToDefault;
  if (typeof closeEquipmentCatalogModal !== 'undefined') window.closeEquipmentCatalogModal = closeEquipmentCatalogModal;
  if (typeof switchCatalogTab !== 'undefined') window.switchCatalogTab = switchCatalogTab;
  if (typeof populateEquipmentModalUI !== 'undefined') window.populateEquipmentModalUI = populateEquipmentModalUI;
  if (typeof applyInverterFromCatalog !== 'undefined') window.applyInverterFromCatalog = applyInverterFromCatalog;
  if (typeof applyBatteryFromCatalog !== 'undefined') window.applyBatteryFromCatalog = applyBatteryFromCatalog;
  if (typeof deleteCatalogItem !== 'undefined') window.deleteCatalogItem = deleteCatalogItem;
  if (typeof addNewEquipmentFromForm !== 'undefined') window.addNewEquipmentFromForm = addNewEquipmentFromForm;
  if (typeof populateStep3EquipmentSelectors !== 'undefined') window.populateStep3EquipmentSelectors = populateStep3EquipmentSelectors;
  if (typeof openEquipmentCatalogModal !== 'undefined') window.openEquipmentCatalogModal = openEquipmentCatalogModal;
  if (typeof saveEditedEquipment !== 'undefined') window.saveEditedEquipment = saveEditedEquipment;
  if (typeof wpFastRenderSimulatedPanels !== 'undefined') window.wpFastRenderSimulatedPanels = wpFastRenderSimulatedPanels;
  if (typeof wpSyncStep3Metrics !== 'undefined') window.wpSyncStep3Metrics = wpSyncStep3Metrics;
  if (typeof wpUpdateStep3UI !== 'undefined') window.wpUpdateStep3UI = wpUpdateStep3UI;
  if (typeof wpUpdateUI !== 'undefined') window.wpUpdateUI = wpUpdateUI;
  if (typeof wpCancelCurrentMode !== 'undefined') window.wpCancelCurrentMode = wpCancelCurrentMode;
  if (typeof initUnifiedWorkPlaneSystem !== 'undefined') window.initUnifiedWorkPlaneSystem = initUnifiedWorkPlaneSystem;
  if (typeof wpOpenSmartInverterMatchingModal !== 'undefined') window.wpOpenSmartInverterMatchingModal = wpOpenSmartInverterMatchingModal;
  if (typeof wpApplyInverterScenario !== 'undefined') window.wpApplyInverterScenario = wpApplyInverterScenario;
  if (typeof wpApplyPanelArrangement !== 'undefined') window.wpApplyPanelArrangement = wpApplyPanelArrangement;
  if (typeof wpApplyPanelArrangementToAll !== 'undefined') window.wpApplyPanelArrangementToAll = wpApplyPanelArrangementToAll;
  if (typeof wpApplyPolyStructureToAll !== 'undefined') window.wpApplyPolyStructureToAll = wpApplyPolyStructureToAll;

  if (window.RA) {
    window.RA.wpState = WP;
    window.RA.wp = {
      setMode: typeof wpSetMode !== 'undefined' ? wpSetMode : null,
      startDefinePlane: typeof wpStartDefinePlane !== 'undefined' ? wpStartDefinePlane : null,
      addPlanePoint: typeof wpAddPlanePoint !== 'undefined' ? wpAddPlanePoint : null,
      computePlaneFrom3Points: typeof wpComputePlaneFrom3Points !== 'undefined' ? wpComputePlaneFrom3Points : null,
      getActivePlane: typeof wpGetActivePlane !== 'undefined' ? wpGetActivePlane : null,
      selectActivePlane: typeof wpSelectActivePlane !== 'undefined' ? wpSelectActivePlane : null,
      goToStep: typeof wpGoToStep !== 'undefined' ? wpGoToStep : null,
      fastRenderPanels: typeof wpFastRenderSimulatedPanels !== 'undefined' ? wpFastRenderSimulatedPanels : null,
      addPolylinePoint: typeof wpAddPolylinePoint !== 'undefined' ? wpAddPolylinePoint : null,
      closeActivePolyline: typeof wpCloseActivePolyline !== 'undefined' ? wpCloseActivePolyline : null,
      computeAutoSizing: typeof wpComputeAutoSizing !== 'undefined' ? wpComputeAutoSizing : null,
      resetAutoSizing: typeof wpResetAutoSizing !== 'undefined' ? wpResetAutoSizing : null,
      updateUI: typeof wpUpdateUI !== 'undefined' ? wpUpdateUI : null,
      triadState: typeof triadState !== 'undefined' ? triadState : null
    };
  }

  // Inicialización diferida del sistema de eventos
  const currentViewer = typeof viewer !== 'undefined' && viewer ? viewer : (window.viewer || null);
  const currentScene = currentViewer ? currentViewer.scene : null;
  if (currentViewer && currentScene && currentScene.canvas) {
    initUnifiedWorkPlaneSystem();
  }
})(typeof window !== 'undefined' ? window : globalThis);

