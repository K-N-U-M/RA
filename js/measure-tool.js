/**
 * ============================================================================
 * 📏 RAMeasureTool — CINTA MÉTRICA Y HERRAMIENTA DE MEDICIÓN 3D (CAD / GIS)
 * ============================================================================
 * Módulo autónomo y escalable para medición precisa de distancias tridimensionales:
 *   - Medición física 3D real (longitud en pendiente sobre cubiertas y fachadas)
 *   - Desglose instantáneo en: Distancia 3D, Proyección Horizontal 2D y Desnivel Vertical ΔH
 *   - Motor de Snapping Magnético inteligente (conmutable ON/OFF):
 *       * Vértices de cubiertas y faldones (WP.planes, WP.polylines)
 *       * Esquinas de paneles fotovoltaicos (simulatedPanelEntities, pData.corners)
 *       * Vértices de obstáculos 3D y casetones (obstacles)
 *       * Puntos de edificios perimetrales (buildings)
 *       * Equipos eléctricos (inversor, contador, cuadro DC)
 *   - Líneas de cota técnicas con etiquetas flotantes de alta legibilidad
 *   - Mini-HUD de control flotante con toggle interactivo de Snap y botón de purga
 *   - Atajos de teclado ergonómicos: [M] Activar/Desactivar, [S] Conmutar Snap, [Esc] Cancelar
 * ============================================================================
 */
(function(global) {
  'use strict';

  // ── ESTADO INTERNO DEL MOTOR DE MEDICIÓN ──────────────────────────────────
  var _state = {
    active: false,
    snappingEnabled: true,
    points: [],              // Puntos fijados de la cadena activa [Cartesian3]
    hoverPoint: null,        // Punto 3D actual del cursor (snapped o superficie)
    hoverSnapTarget: null,   // Metadatos del objeto al que se ha hecho snap
    measurements: [],        // Historial de cotas finalizadas [{ id, pts, d3D, d2D, dZ }]
    handler: null,           // Cesium.ScreenSpaceEventHandler
    polylineCollection: null,// Cesium.PolylineCollection (renderizado WebGL directo en primitives)
    previewPolyline: null,   // Cesium.Polyline para la línea elástica viva
    fixedEntities: [],       // Entidades Cesium fijas (pines y etiquetas en viewer.entities)
    previewEntities: []      // Entidades Cesium dinámicas (pines y etiqueta en viewer.entities)
  };

  var SNAP_THRESHOLD_PX = 24; // Radio de atracción magnética en píxeles de pantalla

  // ── UTILIDADES GEOMÉTRICAS Y DE CÁLCULO ───────────────────────────────────
  function getViewer() {
    return global.viewer || (typeof viewer !== 'undefined' ? viewer : null);
  }

  function requestSceneRender() {
    var v = getViewer();
    if (v && v.scene && typeof v.scene.requestRender === 'function') {
      try {
        v.scene.requestRender();
      } catch(e) {}
    }
  }

  function elevatePoint(pt, offsetM) {
    if (!pt) return pt;
    var offset = (typeof offsetM === 'number') ? offsetM : 0.15;
    try {
      // 1. Si hay plano de trabajo activo en WP, elevar en la dirección de su normal 3D
      if (global.WP && Array.isArray(global.WP.planes) && global.WP.activePlaneIdx >= 0) {
        var pl = global.WP.planes[global.WP.activePlaneIdx];
        if (pl && pl.normal && isFinite(pl.normal.x)) {
          return Cesium.Cartesian3.add(pt, Cesium.Cartesian3.multiplyByScalar(pl.normal, offset, new Cesium.Cartesian3()), new Cesium.Cartesian3());
        }
      }
      // 2. Fallback: normal geodésica del elipsoide WGS84
      var normalUp = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(pt, new Cesium.Cartesian3());
      if (normalUp && isFinite(normalUp.x)) {
        return Cesium.Cartesian3.add(pt, Cesium.Cartesian3.multiplyByScalar(normalUp, offset, new Cesium.Cartesian3()), new Cesium.Cartesian3());
      }
    } catch(e) {}
    return pt;
  }

  function get3DPosition(screenPos) {
    var v = getViewer();
    if (!v || !v.scene || !screenPos) return null;

    if (typeof global.getRaw3DPosition === 'function') {
      try {
        var pRaw = global.getRaw3DPosition(screenPos);
        if (pRaw && Cesium.defined(pRaw) && isFinite(pRaw.x)) return pRaw;
      } catch (e) {}
    }

    if (v.scene.pickPositionSupported) {
      try {
        var pPick = v.scene.pickPosition(screenPos);
        if (Cesium.defined(pPick) && isFinite(pPick.x)) return pPick;
      } catch (e) {}
    }

    if (v.camera && v.scene.globe) {
      try {
        var pEll = v.camera.pickEllipsoid(screenPos, v.scene.globe.ellipsoid);
        if (Cesium.defined(pEll) && isFinite(pEll.x)) return pEll;
      } catch (e) {}
    }

    return null;
  }

  function calculateDistanceMetrics(ptA, ptB) {
    if (!ptA || !ptB) return { d3D: 0, d2D: 0, dZ: 0, slopeDeg: 0 };
    var d3D = Cesium.Cartesian3.distance(ptA, ptB);

    var cartA = Cesium.Cartographic.fromCartesian(ptA);
    var cartB = Cesium.Cartographic.fromCartesian(ptB);

    var dZ = Math.abs((cartB.height || 0) - (cartA.height || 0));
    var d2D = Math.sqrt(Math.max(0, d3D * d3D - dZ * dZ));
    var slopeDeg = (d2D > 0.01) ? Cesium.Math.toDegrees(Math.atan2(dZ, d2D)) : (dZ > 0 ? 90 : 0);

    return {
      d3D: d3D,
      d2D: d2D,
      dZ: dZ,
      slopeDeg: slopeDeg
    };
  }

  // ── MOTOR DE SNAPPING MAGNÉTICO MULTI-OBJETO ──────────────────────────────
  function collectCandidateSnapPoints() {
    var candidates = [];

    // 1. Vértices de Planos de Trabajo y Faldones
    if (global.WP) {
      if (Array.isArray(global.WP.planes)) {
        global.WP.planes.forEach(function(pl) {
          if (!pl) return;
          if (pl.p1) candidates.push({ pos: pl.p1, type: 'Vértice Plano (P1)' });
          if (pl.p2) candidates.push({ pos: pl.p2, type: 'Vértice Plano (P2)' });
          if (pl.p3) candidates.push({ pos: pl.p3, type: 'Vértice Plano (P3)' });
          if (Array.isArray(pl.pts3D)) {
            pl.pts3D.forEach(function(pt) {
              if (pt) candidates.push({ pos: pt, type: 'Vértice Plano' });
            });
          }
        });
      }

      if (Array.isArray(global.WP.polylines)) {
        global.WP.polylines.forEach(function(poly, polyIdx) {
          if (!poly) return;
          if (Array.isArray(poly.points)) {
            poly.points.forEach(function(pt) {
              if (pt) candidates.push({ pos: pt, type: 'Vértice Cubierta #' + (polyIdx + 1) });
            });
          }
          // Esquinas de paneles calculados en el faldón
          if (poly.roofInfo && Array.isArray(poly.roofInfo.panels)) {
            poly.roofInfo.panels.forEach(function(pData) {
              if (Array.isArray(pData.corners)) {
                pData.corners.forEach(function(c) {
                  if (c) candidates.push({ pos: c, type: 'Esquina de Módulo' });
                });
              }
            });
          }
        });
      }
    }

    // 2. Obstáculos 3D (esquinas y centros)
    var obsList = (typeof obstacles !== 'undefined' && Array.isArray(obstacles))
      ? obstacles
      : (Array.isArray(global.obstacles) ? global.obstacles : []);

    obsList.forEach(function(obs) {
      if (!obs) return;
      if (typeof global.getObstacleWorldBaseCorners3D === 'function') {
        try {
          var corners = global.getObstacleWorldBaseCorners3D(obs, 0.0);
          if (Array.isArray(corners)) {
            corners.forEach(function(c) {
              if (c) candidates.push({ pos: c, type: 'Esquina de Obstáculo' });
            });
          }
        } catch(e) {}
      }
      if (obs.center && Cesium.defined(obs.center)) {
        candidates.push({ pos: obs.center, type: 'Centro Obstáculo' });
      }
    });

    // 3. Edificios modelados
    var bldList = (typeof buildings !== 'undefined' && Array.isArray(buildings))
      ? buildings
      : (Array.isArray(global.buildings) ? global.buildings : []);

    bldList.forEach(function(bld) {
      if (bld && Array.isArray(bld.points)) {
        bld.points.forEach(function(pt) {
          if (pt) candidates.push({ pos: pt, type: 'Vértice Edificio' });
        });
      }
    });

    // 4. Equipos eléctricos (inversor, contador, cuadro DC)
    var eqState = global.inverterEquipmentState;
    if (eqState) {
      ['inverter', 'gridMeter', 'combinerBox'].forEach(function(k) {
        if (eqState[k] && eqState[k].position) {
          candidates.push({ pos: eqState[k].position, type: 'Equipo (' + k + ')' });
        }
      });
    }

    return candidates;
  }

  function findSnapPoint(screenPos) {
    if (!_state.snappingEnabled) return null;
    var v = getViewer();
    if (!v || !v.scene || !screenPos) return null;

    var candidates = collectCandidateSnapPoints();
    if (!candidates.length) return null;

    var bestDist = SNAP_THRESHOLD_PX;
    var bestTarget = null;

    var scratchScrPos = new Cesium.Cartesian2();

    for (var i = 0; i < candidates.length; i++) {
      var item = candidates[i];
      if (!item.pos) continue;

      var scr = Cesium.SceneTransforms.wgs84ToWindowCoordinates(v.scene, item.pos, scratchScrPos);
      if (!scr) continue;

      var d = Math.hypot(scr.x - screenPos.x, scr.y - screenPos.y);
      if (d < bestDist) {
        bestDist = d;
        bestTarget = item;
      }
    }

    return bestTarget;
  }

  // ── RENDERIZADO VISUAL DE COTAS Y PREVIEWS EN CESIUM ──────────────────────
  function ensurePolylineCollection() {
    var v = getViewer();
    if (!v || !v.scene || !v.scene.primitives) return null;
    if (!_state.polylineCollection || _state.polylineCollection.isDestroyed()) {
      _state.polylineCollection = v.scene.primitives.add(new Cesium.PolylineCollection());
    }
    return _state.polylineCollection;
  }

  function clearPreviewEntities() {
    var v = getViewer();
    if (v && v.entities) {
      _state.previewEntities.forEach(function(ent) {
        try { v.entities.remove(ent); } catch(e) {}
      });
    }
    _state.previewEntities = [];
    if (_state.previewPolyline) {
      _state.previewPolyline.show = false;
    }
    requestSceneRender();
  }

  function updateDynamicPreview(ptStart, ptEnd, snapMeta) {
    var v = getViewer();
    if (!v || !ptStart || !ptEnd) return;

    var metrics = calculateDistanceMetrics(ptStart, ptEnd);
    var mid = Cesium.Cartesian3.midpoint(ptStart, ptEnd, new Cesium.Cartesian3());

    var normalUp = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(mid, new Cesium.Cartesian3());
    var labelPos = Cesium.Cartesian3.add(mid, Cesium.Cartesian3.multiplyByScalar(normalUp, 0.35, new Cesium.Cartesian3()), new Cesium.Cartesian3());

    var visualStart = elevatePoint(ptStart, 0.15);
    var visualEnd = elevatePoint(ptEnd, 0.15);

    // 1. Línea elástica directa mediante PolylineCollection (visibilidad instantánea WebGL 60 FPS)
    var col = ensurePolylineCollection();
    if (col) {
      if (!_state.previewPolyline) {
        _state.previewPolyline = col.add({
          positions: [visualStart, visualEnd],
          width: 5.0,
          show: true,
          material: Cesium.Material.fromType('Color', {
            color: Cesium.Color.fromCssColorString('#38BDF8')
          })
        });
      } else {
        _state.previewPolyline.positions = [visualStart, visualEnd];
        _state.previewPolyline.show = true;
      }
    }

    // 2. Limpiar entidades previas de puntos/etiquetas antes de recrear
    if (v.entities) {
      _state.previewEntities.forEach(function(ent) {
        try { v.entities.remove(ent); } catch(e) {}
      });
    }
    _state.previewEntities = [];

    // Punto inicial (Punto A - verde esmeralda)
    var startPin = v.entities.add({
      position: visualStart,
      point: {
        pixelSize: 10,
        color: Cesium.Color.fromCssColorString('#10B981'),
        outlineColor: Cesium.Color.fromCssColorString('#0F172A'),
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      }
    });
    _state.previewEntities.push(startPin);

    // Punto terminal en cursor (Punto B)
    var endPin = v.entities.add({
      position: visualEnd,
      point: {
        pixelSize: 10,
        color: snapMeta ? Cesium.Color.fromCssColorString('#10B981') : Cesium.Color.fromCssColorString('#F59E0B'),
        outlineColor: Cesium.Color.fromCssColorString('#0F172A'),
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      }
    });
    _state.previewEntities.push(endPin);

    // Si hay snapping activo, halo magnético adicional
    if (snapMeta) {
      var snapRing = v.entities.add({
        position: visualEnd,
        point: {
          pixelSize: 18,
          color: Cesium.Color.fromCssColorString('#10B981').withAlpha(0.35),
          outlineColor: Cesium.Color.fromCssColorString('#34D399'),
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
      });
      _state.previewEntities.push(snapRing);
    }

    // Etiqueta flotante con desglose 3D, 2D y desnivel
    var labelText = '📏 3D: ' + metrics.d3D.toFixed(2) + ' m' +
                    '\n↔ 2D: ' + metrics.d2D.toFixed(2) + ' m' +
                    '  |  ↕ ΔH: ' + metrics.dZ.toFixed(2) + ' m (' + metrics.slopeDeg.toFixed(1) + '°)';

    if (snapMeta && snapMeta.type) {
      labelText += '\n🧲 [' + snapMeta.type + ']';
    }

    var labelEnt = v.entities.add({
      position: labelPos,
      label: {
        text: labelText,
        font: '700 11.5px Inter, system-ui, sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.fromCssColorString('#0F172A'),
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString('rgba(15,23,42,0.92)'),
        backgroundPadding: new Cesium.Cartesian2(8, 6),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM
      }
    });
    _state.previewEntities.push(labelEnt);

    // Actualizar lectura en vivo del HUD flotante
    updateLiveHUDReadout(metrics, snapMeta);
    requestSceneRender();
  }

  function commitMeasurementSegment(ptA, ptB) {
    var v = getViewer();
    if (!v || !ptA || !ptB) return;

    var metrics = calculateDistanceMetrics(ptA, ptB);
    var mid = Cesium.Cartesian3.midpoint(ptA, ptB, new Cesium.Cartesian3());
    var normalUp = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(mid, new Cesium.Cartesian3());
    var labelPos = Cesium.Cartesian3.add(mid, Cesium.Cartesian3.multiplyByScalar(normalUp, 0.30, new Cesium.Cartesian3()), new Cesium.Cartesian3());

    var visualA = elevatePoint(ptA, 0.15);
    var visualB = elevatePoint(ptB, 0.15);
    var measId = 'ra_meas_' + Date.now() + '_' + Math.floor(Math.random() * 1000);

    // 1. Línea permanente en PolylineCollection (áureo / ámbar CAD con visibilidad garantizada sobre 3D Tiles)
    var col = ensurePolylineCollection();
    var fixedPoly = null;
    if (col) {
      fixedPoly = col.add({
        positions: [visualA, visualB],
        width: 4.5,
        show: true,
        material: Cesium.Material.fromType('Color', {
          color: Cesium.Color.fromCssColorString('#F59E0B')
        })
      });
    }

    // 2. Puntos extremos permanentes en viewer.entities
    var pinA = v.entities.add({
      id: measId + '_pinA',
      position: visualA,
      point: {
        pixelSize: 10,
        color: Cesium.Color.fromCssColorString('#10B981'),
        outlineColor: Cesium.Color.fromCssColorString('#0F172A'),
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      }
    });
    _state.fixedEntities.push(pinA);

    var pinB = v.entities.add({
      id: measId + '_pinB',
      position: visualB,
      point: {
        pixelSize: 10,
        color: Cesium.Color.fromCssColorString('#EF4444'),
        outlineColor: Cesium.Color.fromCssColorString('#0F172A'),
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      }
    });
    _state.fixedEntities.push(pinB);

    // 3. Etiqueta permanente en viewer.entities
    var labelText = '📏 ' + metrics.d3D.toFixed(2) + ' m' +
                    '\n↔ ' + metrics.d2D.toFixed(2) + ' m · ↕ ' + metrics.dZ.toFixed(2) + ' m';

    var labelEnt = v.entities.add({
      id: measId + '_label',
      position: labelPos,
      label: {
        text: labelText,
        font: '700 11px Inter, system-ui, sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.fromCssColorString('#0F172A'),
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString('rgba(15,23,42,0.94)'),
        backgroundPadding: new Cesium.Cartesian2(8, 5),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM
      }
    });
    _state.fixedEntities.push(labelEnt);

    _state.measurements.push({
      id: measId,
      ptA: ptA,
      ptB: ptB,
      metrics: metrics,
      primitive: fixedPoly
    });

    requestSceneRender();

    if (typeof global.showToast === 'function') {
      global.showToast('COTA FIJADA', 'Distancia 3D: ' + metrics.d3D.toFixed(2) + ' m (Horiz: ' + metrics.d2D.toFixed(2) + ' m)', 'info', 2200);
    }
  }

  // ── MINI-HUD FLOTANTE INTERACTIVO ─────────────────────────────────────────
  function ensureHUD() {
    var hud = document.getElementById('ra-measure-hud');
    if (hud) return hud;

    hud = document.createElement('div');
    hud.id = 'ra-measure-hud';
    hud.style.cssText = [
      'position: fixed',
      'top: 74px',
      'left: 50%',
      'transform: translateX(-50%)',
      'background: rgba(15, 23, 42, 0.94)',
      'backdrop-filter: blur(16px)',
      '-webkit-backdrop-filter: blur(16px)',
      'border: 1px solid rgba(56, 189, 248, 0.45)',
      'border-radius: 9999px',
      'padding: 6px 16px',
      'display: none',
      'align-items: center',
      'gap: 12px',
      'z-index: 9999',
      'box-shadow: 0 10px 30px rgba(0,0,0,0.65), 0 0 18px rgba(56, 189, 248, 0.25)',
      'color: #fff',
      'font-family: Inter, system-ui, sans-serif',
      'font-size: 11px',
      'user-select: none'
    ].join(';');

    hud.innerHTML = [
      '<div style="display:flex; align-items:center; gap:6px; font-weight:800; color:#38BDF8; letter-spacing:0.3px;">',
      '  <span style="display:flex; align-items:center; font-size:13px;">📏</span>',
      '  <span>CINTA MÉTRICA 3D</span>',
      '</div>',
      '<div style="width:1px; height:18px; background:rgba(255,255,255,0.15);"></div>',
      '<button id="ra-measure-snap-toggle-btn" type="button" style="background:rgba(16,185,129,0.22); border:1px solid #10B981; color:#34D399; font-weight:700; font-size:10px; padding:3px 10px; border-radius:12px; cursor:pointer; display:flex; align-items:center; gap:4px; transition:all 0.15s ease;" title="Conmutar atracción magnética (Atajo: S)">',
      '  <span>🧲 SNAP:</span> <span id="ra-measure-snap-badge-text">ON</span>',
      '</button>',
      '<div id="ra-measure-live-readout" style="font-family:var(--font-mono, monospace); font-size:11px; color:#F59E0B; font-weight:700; min-width:130px; text-align:center;">',
      '  Haz clic para iniciar',
      '</div>',
      '<div style="width:1px; height:18px; background:rgba(255,255,255,0.15);"></div>',
      '<button id="ra-measure-clear-btn" type="button" style="background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.15); color:var(--text-slate-300, #cbd5e1); font-size:10px; font-weight:600; padding:3px 8px; border-radius:12px; cursor:pointer;" title="Borrar todas las cotas dibujadas">',
      '  🗑️ Limpiar',
      '</button>',
      '<button id="ra-measure-close-btn" type="button" style="background:rgba(239,68,68,0.18); border:1px solid rgba(239,68,68,0.4); color:#F87171; font-size:10px; font-weight:700; padding:3px 8px; border-radius:12px; cursor:pointer;" title="Salir de la herramienta de medición (Atajo: Esc / M)">',
      '  ✖ Salir',
      '</button>'
    ].join('');

    document.body.appendChild(hud);

    // Eventos del Mini-HUD
    var snapBtn = document.getElementById('ra-measure-snap-toggle-btn');
    if (snapBtn) {
      snapBtn.addEventListener('click', function() {
        toggleSnapping();
      });
    }

    var clearBtn = document.getElementById('ra-measure-clear-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', function() {
        clearMeasurements();
      });
    }

    var closeBtn = document.getElementById('ra-measure-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', function() {
        deactivate();
      });
    }

    return hud;
  }

  function updateHUDVisuals() {
    var hud = ensureHUD();
    if (!hud) return;

    if (_state.active) {
      hud.style.display = 'flex';
    } else {
      hud.style.display = 'none';
      return;
    }

    var snapBtn = document.getElementById('ra-measure-snap-toggle-btn');
    var badgeText = document.getElementById('ra-measure-snap-badge-text');

    if (snapBtn && badgeText) {
      if (_state.snappingEnabled) {
        snapBtn.style.background = 'rgba(16,185,129,0.22)';
        snapBtn.style.borderColor = '#10B981';
        snapBtn.style.color = '#34D399';
        badgeText.textContent = 'ON';
      } else {
        snapBtn.style.background = 'rgba(255,255,255,0.06)';
        snapBtn.style.borderColor = 'rgba(255,255,255,0.2)';
        snapBtn.style.color = '#94A3B8';
        badgeText.textContent = 'OFF';
      }
    }
  }

  function updateLiveHUDReadout(metrics, snapMeta) {
    var el = document.getElementById('ra-measure-live-readout');
    if (!el) return;
    if (!metrics || metrics.d3D === 0) {
      el.textContent = _state.points.length > 0 ? 'Mueve el ratón para medir' : 'Haz clic para iniciar';
      return;
    }
    el.innerHTML = '<span style="color:#38BDF8;">3D: ' + metrics.d3D.toFixed(2) + 'm</span> · ' +
                   '<span style="color:#94A3B8;">2D: ' + metrics.d2D.toFixed(2) + 'm</span> · ' +
                   '<span style="color:#F59E0B;">ΔH: ' + metrics.dZ.toFixed(2) + 'm</span>';
  }

  function updateFABVisuals() {
    var fabBtn = document.getElementById('btn-toggle-measure-tool');
    if (!fabBtn) return;

    var icon = fabBtn.querySelector('svg, i');

    if (_state.active) {
      fabBtn.style.background = 'rgba(56, 189, 248, 0.22)';
      fabBtn.style.borderColor = '#38BDF8';
      fabBtn.style.color = '#38BDF8';
      fabBtn.style.boxShadow = '0 0 20px rgba(56, 189, 248, 0.55), 0 4px 16px rgba(0,0,0,0.4)';
      if (icon) {
        icon.style.stroke = '#38BDF8';
        icon.style.color = '#38BDF8';
      }
    } else {
      fabBtn.style.background = 'rgba(15, 23, 42, 0.88)';
      fabBtn.style.borderColor = 'rgba(255, 255, 255, 0.18)';
      fabBtn.style.color = '#94a3b8';
      fabBtn.style.boxShadow = '0 4px 16px rgba(0,0,0,0.4)';
      if (icon) {
        icon.style.stroke = '#94a3b8';
        icon.style.color = '#94a3b8';
      }
    }
  }

  // ── GESTIÓN DE EVENTOS DE RATÓN (SCREEN SPACE EVENT HANDLER) ──────────────
  function attachMouseHandler() {
    var v = getViewer();
    if (!v || !v.canvas) return;
    detachMouseHandler();

    _state.handler = new Cesium.ScreenSpaceEventHandler(v.canvas);

    // MOUSE_MOVE: Detección continua de snap y actualización de cota en vivo
    _state.handler.setInputAction(function(movement) {
      if (!_state.active) return;

      var snapTarget = findSnapPoint(movement.endPosition);
      var pos3D = (snapTarget && snapTarget.pos) ? snapTarget.pos : get3DPosition(movement.endPosition);

      _state.hoverPoint = pos3D;
      _state.hoverSnapTarget = snapTarget;

      if (_state.points.length > 0 && pos3D) {
        var lastPt = _state.points[_state.points.length - 1];
        updateDynamicPreview(lastPt, pos3D, snapTarget);
      } else if (snapTarget && snapTarget.pos) {
        // Resaltar vértice magnetizado antes del primer clic
        clearPreviewEntities();
        var vScene = getViewer();
        if (vScene) {
          var dot = vScene.entities.add({
            position: elevatePoint(snapTarget.pos, 0.12),
            point: {
              pixelSize: 14,
              color: Cesium.Color.fromCssColorString('#10B981').withAlpha(0.85),
              outlineColor: Cesium.Color.fromCssColorString('#34D399'),
              outlineWidth: 2,
              disableDepthTestDistance: Number.POSITIVE_INFINITY
            }
          });
          _state.previewEntities.push(dot);
          requestSceneRender();
        }
      } else {
        if (_state.previewEntities.length > 0) {
          clearPreviewEntities();
        }
      }
      requestSceneRender();
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    // LEFT_CLICK: Fijar puntos de medición
    _state.handler.setInputAction(function(click) {
      if (!_state.active) return;

      var snapTarget = findSnapPoint(click.position);
      var pos3D = (snapTarget && snapTarget.pos) ? snapTarget.pos : get3DPosition(click.position);
      if (!pos3D) return;

      if (_state.points.length === 0) {
        // Primer punto (Punto A)
        _state.points.push(pos3D);
        if (typeof global.showToast === 'function') {
          var txt = snapTarget ? ('Punto A fijado en ' + snapTarget.type) : 'Punto A fijado';
          global.showToast('CINTA MÉTRICA', txt + '. Haz clic en el punto B.', 'info', 2000);
        }
      } else {
        // Segundo punto (Punto B): consolidar tramo de medición
        var startPt = _state.points[_state.points.length - 1];
        commitMeasurementSegment(startPt, pos3D);

        // Continuidad encadenada: el punto B queda como nuevo inicio
        _state.points = [pos3D];
      }
      requestSceneRender();
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    // RIGHT_CLICK: Cancelar tramo actual
    _state.handler.setInputAction(function() {
      if (_state.points.length > 0) {
        _state.points = [];
        clearPreviewEntities();
        updateLiveHUDReadout(null, null);
        requestSceneRender();
        if (typeof global.showToast === 'function') {
          global.showToast('MEDICIÓN', 'Tramo cancelado.', 'info', 1500);
        }
      } else {
        deactivate();
      }
    }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
  }

  function detachMouseHandler() {
    if (_state.handler && !_state.handler.isDestroyed()) {
      _state.handler.destroy();
      _state.handler = null;
    }
    clearPreviewEntities();
  }

  // ── CONTROL DE CICLO DE VIDA DE LA HERRAMIENTA ────────────────────────────
  function activate() {
    _state.active = true;
    _state.points = [];
    ensurePolylineCollection();
    attachMouseHandler();
    updateHUDVisuals();
    updateFABVisuals();
    requestSceneRender();
    if (typeof global.showToast === 'function') {
      global.showToast('CINTA MÉTRICA 3D', 'Herramienta activa. Haz clic sobre el modelo para medir [Esc para salir].', 'info', 3000);
    }
  }

  function deactivate() {
    _state.active = false;
    _state.points = [];
    detachMouseHandler();
    clearPreviewEntities();
    updateHUDVisuals();
    updateFABVisuals();
    requestSceneRender();
  }

  function toggle() {
    if (_state.active) {
      deactivate();
    } else {
      activate();
    }
  }

  function setSnapping(val) {
    _state.snappingEnabled = !!val;
    updateHUDVisuals();
    if (typeof global.showToast === 'function') {
      var msg = _state.snappingEnabled ? '🧲 Imán Magnético ACTIVADO' : '🧲 Imán Magnético DESACTIVADO';
      global.showToast('SNAP', msg, 'info', 1800);
    }
  }

  function toggleSnapping() {
    setSnapping(!_state.snappingEnabled);
  }

  function clearMeasurements() {
    var v = getViewer();
    _state.points = [];
    _state.measurements = [];
    clearPreviewEntities();

    if (v && v.entities) {
      _state.fixedEntities.forEach(function(ent) {
        try { v.entities.remove(ent); } catch(e) {}
      });
    }
    _state.fixedEntities = [];

    if (_state.polylineCollection) {
      _state.polylineCollection.removeAll();
      _state.previewPolyline = null;
    }

    updateLiveHUDReadout(null, null);
    requestSceneRender();
    if (typeof global.showToast === 'function') {
      global.showToast('COTAS BORRADAS', 'Se han limpiado todas las mediciones.', 'info', 1800);
    }
  }

  // ── ATAJOS DE TECLADO GLOBALES ([M], [S], [Escape]) ───────────────────────
  function setupKeyboardShortcuts() {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    window.addEventListener('keydown', function(e) {
      // Ignorar si el usuario escribe en un campo de texto
      var tag = e.target && e.target.tagName ? e.target.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || (e.target && e.target.isContentEditable)) return;

      var key = e.key ? e.key.toLowerCase() : '';

      // Tecla M: Alternar cinta métrica
      if (key === 'm' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        toggle();
        return;
      }

      // Tecla S: Alternar snap SOLO si la herramienta de medición está activa
      if (key === 's' && _state.active && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        toggleSnapping();
        return;
      }

      // Tecla Escape: Salir o cancelar tramo activo
      if (e.key === 'Escape' && _state.active) {
        e.preventDefault();
        if (_state.points.length > 0) {
          _state.points = [];
          clearPreviewEntities();
          updateLiveHUDReadout(null, null);
          requestSceneRender();
          if (typeof global.showToast === 'function') global.showToast('MEDICIÓN', 'Tramo cancelado.', 'info', 1500);
        } else {
          deactivate();
        }
      }
    });
  }

  // ── REGISTRO DE API PÚBLICA Y EXPORTACIÓN ──────────────────────────────────
  var RAMeasureTool = {
    activate: activate,
    deactivate: deactivate,
    toggle: toggle,
    setSnapping: setSnapping,
    toggleSnapping: toggleSnapping,
    clearMeasurements: clearMeasurements,
    isActive: function() { return _state.active; },
    isSnappingEnabled: function() { return _state.snappingEnabled; },
    getMeasurements: function() { return _state.measurements.slice(); }
  };

  global.RAMeasureTool = RAMeasureTool;
  if (!global.RA) global.RA = {};
  global.RA.measureTool = RAMeasureTool;
  global.toggleMeasureTool = toggle;
  global.toggleMeasureSnapping = toggleSnapping;

  // Inicialización defensiva
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() {
        setupKeyboardShortcuts();
        ensureHUD();
        updateFABVisuals();
      });
    } else {
      setupKeyboardShortcuts();
      ensureHUD();
      updateFABVisuals();
    }
  }

})(typeof window !== 'undefined' ? window : this);
