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
 *   - Atajos de teclado ergonómicos: [M] Activar/Desactivar, [X] Conmutar Snap, [Esc] Cancelar
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
    previewPinA: null,       // Entidad Pin A persistente reutilizable
    previewPinB: null,       // Entidad Pin B persistente reutilizable
    previewRing: null,       // Entidad Halo magnético persistente reutilizable
    previewLabel: null,      // Entidad Etiqueta de cota persistente reutilizable
    cachedCandidates: null,  // Caché espacial de candidatos de snapping
    candidatesDirty: true,   // Flag de invalidación de candidatos
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
      // 1. Buscar el plano de trabajo más cercano a la ubicación del punto medido
      var bestNormal = null;
      if (global.WP && Array.isArray(global.WP.planes) && global.WP.planes.length > 0) {
        var minDist = Infinity;
        for (var i = 0; i < global.WP.planes.length; i++) {
          var pl = global.WP.planes[i];
          if (pl && pl.origin && pl.normal && isFinite(pl.normal.x)) {
            var d = Cesium.Cartesian3.distance(pt, pl.origin);
            if (d < minDist) {
              minDist = d;
              bestNormal = pl.normal;
            }
          }
        }
      }
      if (bestNormal && minDist < 60.0) {
        return Cesium.Cartesian3.add(pt, Cesium.Cartesian3.multiplyByScalar(bestNormal, offset, new Cesium.Cartesian3()), new Cesium.Cartesian3());
      }
      // 2. Fallback: normal geodésica del elipsoide WGS84 propia del punto
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

    var pinBPrev = (_state && _state.previewPinB) ? _state.previewPinB.show : null;
    var linePrev = (_state && _state.previewPolyline) ? _state.previewPolyline.show : null;
    if (_state && _state.previewPinB) _state.previewPinB.show = false;
    if (_state && _state.previewPolyline) _state.previewPolyline.show = false;

    var pos = null;
    try {
      if (typeof global.getRaw3DPosition === 'function') {
        try {
          var pRaw = global.getRaw3DPosition(screenPos);
          if (pRaw && Cesium.defined(pRaw) && isFinite(pRaw.x)) pos = pRaw;
        } catch (e) {}
      }

      if (!pos && v.scene.pickPositionSupported) {
        try {
          var pPick = v.scene.pickPosition(screenPos);
          if (Cesium.defined(pPick) && isFinite(pPick.x)) pos = pPick;
        } catch (e) {}
      }

      if (!pos && v.camera && v.scene.globe) {
        try {
          var pEll = v.camera.pickEllipsoid(screenPos, v.scene.globe.ellipsoid);
          if (Cesium.defined(pEll) && isFinite(pEll.x)) pos = pEll;
        } catch (e) {}
      }
    } finally {
      if (_state && _state.previewPinB && pinBPrev !== null) _state.previewPinB.show = pinBPrev;
      if (_state && _state.previewPolyline && linePrev !== null) _state.previewPolyline.show = linePrev;
    }

    return pos;
  }

  function calculateDistanceMetrics(ptA, ptB) {
    if (!ptA || !ptB) return { d3D: 0, d2D: 0, dZ: 0, dZSigned: 0, slopeDeg: 0 };
    var d3D = Cesium.Cartesian3.distance(ptA, ptB);

    var cartA = ptA ? Cesium.Cartographic.fromCartesian(ptA) : null;
    var cartB = ptB ? Cesium.Cartographic.fromCartesian(ptB) : null;
    var hA = (cartA && typeof cartA.height === 'number') ? cartA.height : 0;
    var hB = (cartB && typeof cartB.height === 'number') ? cartB.height : 0;

    var dZSigned = hB - hA;
    var dZ = Math.abs(dZSigned);
    var d2D = Math.sqrt(Math.max(0, d3D * d3D - dZ * dZ));
    var slopeDeg = (d2D > 0.01) ? Cesium.Math.toDegrees(Math.atan2(dZ, d2D)) : (dZ > 0 ? 90 : 0);

    return {
      d3D: d3D,
      d2D: d2D,
      dZ: dZ,
      dZSigned: dZSigned,
      slopeDeg: slopeDeg
    };
  }

  // ── MOTOR DE SNAPPING MAGNÉTICO MULTI-OBJETO ──────────────────────────────
  function invalidateSnapCandidates() {
    _state.candidatesDirty = true;
    _state.cachedCandidates = null;
  }

  function collectCandidateSnapPoints() {
    if (!_state.candidatesDirty && Array.isArray(_state.cachedCandidates) && _state.cachedCandidates.length > 0) {
      return _state.cachedCandidates;
    }
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
          // Esquinas de paneles calculados en el faldón o panels directos
          var panelsArr = (poly.roofInfo && Array.isArray(poly.roofInfo.panels) && poly.roofInfo.panels.length > 0)
            ? poly.roofInfo.panels
            : ((Array.isArray(poly.panels) && poly.panels.length > 0) ? poly.panels : null);
          if (panelsArr) {
            panelsArr.forEach(function(pData) {
              if (Array.isArray(pData.corners)) {
                pData.corners.forEach(function(c) {
                  if (c) candidates.push({ pos: c, type: 'Esquina de Módulo' });
                });
              }
            });
          }
        });
      }

      // Esquinas de paneles en allRenderedPanels global si existen
      if (Array.isArray(global.allRenderedPanels) && global.allRenderedPanels.length > 0) {
        global.allRenderedPanels.forEach(function(pData) {
          if (Array.isArray(pData.corners)) {
            pData.corners.forEach(function(c) {
              if (c) candidates.push({ pos: c, type: 'Esquina de Módulo' });
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
      var obsCenterPos = obs.cartesian || obs.center;
      if (obsCenterPos && Cesium.defined(obsCenterPos)) {
        candidates.push({ pos: obsCenterPos, type: 'Centro Obstáculo' });
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

    // 4. Equipos eléctricos (inversor, batería, contador, cuadros)
    var eqState = global.inverterEquipmentState;
    if (eqState) {
      if (eqState.position) candidates.push({ pos: eqState.position, type: 'Inversor / Cuadro' });
      if (eqState.dcProtectionPosition) candidates.push({ pos: eqState.dcProtectionPosition, type: 'Cuadro DC' });
      if (eqState.batteryPosition) candidates.push({ pos: eqState.batteryPosition, type: 'Batería LFP' });
      if (eqState.gridMeter && eqState.gridMeter.position) candidates.push({ pos: eqState.gridMeter.position, type: 'Contador de Red' });
      if (eqState.combinerBox && eqState.combinerBox.position) candidates.push({ pos: eqState.combinerBox.position, type: 'Combiner Box' });
    }

    _state.cachedCandidates = candidates;
    _state.candidatesDirty = false;
    return candidates;
  }

  function findSnapPoint(screenPos) {
    if (!_state.snappingEnabled) return null;
    var v = getViewer();
    if (!v || !v.scene || !v.scene.camera || !screenPos) return null;

    var candidates = collectCandidateSnapPoints();
    if (!candidates.length) return null;

    var bestDist = SNAP_THRESHOLD_PX;
    var bestTarget = null;

    var scratchScrPos = new Cesium.Cartesian2();
    var camPos = v.scene.camera.positionWC || v.scene.camera.position;
    var camDir = v.scene.camera.directionWC || v.scene.camera.direction;
    var scratchVec = new Cesium.Cartesian3();

    for (var i = 0; i < candidates.length; i++) {
      var item = candidates[i];
      if (!item.pos) continue;

      // Descarte rápido en 3D: el punto debe estar delante del plano de la cámara
      Cesium.Cartesian3.subtract(item.pos, camPos, scratchVec);
      if (Cesium.Cartesian3.dot(scratchVec, camDir) <= 0.0) continue;

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

  function ensurePreviewEntities() {
    var v = getViewer();
    if (!v || !v.entities) return false;

    if (!_state.previewPinA) {
      _state.previewPinA = v.entities.add({
        show: false,
        point: {
          pixelSize: 10,
          color: Cesium.Color.fromCssColorString('#10B981'),
          outlineColor: Cesium.Color.fromCssColorString('#0F172A'),
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
      });
    }
    if (!_state.previewPinB) {
      _state.previewPinB = v.entities.add({
        show: false,
        point: {
          pixelSize: 10,
          color: Cesium.Color.fromCssColorString('#F59E0B'),
          outlineColor: Cesium.Color.fromCssColorString('#0F172A'),
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
      });
    }
    if (!_state.previewRing) {
      _state.previewRing = v.entities.add({
        show: false,
        point: {
          pixelSize: 18,
          color: Cesium.Color.fromCssColorString('#10B981').withAlpha(0.35),
          outlineColor: Cesium.Color.fromCssColorString('#34D399'),
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
      });
    }
    if (!_state.previewLabel) {
      _state.previewLabel = v.entities.add({
        show: false,
        label: {
          text: '',
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
    }
    return true;
  }

  function clearPreviewEntities() {
    if (_state.previewPinA) _state.previewPinA.show = false;
    if (_state.previewPinB) _state.previewPinB.show = false;
    if (_state.previewRing) _state.previewRing.show = false;
    if (_state.previewLabel) _state.previewLabel.show = false;
    if (_state.previewPolyline) _state.previewPolyline.show = false;

    var v = getViewer();
    if (v && v.entities && Array.isArray(_state.previewEntities) && _state.previewEntities.length > 0) {
      _state.previewEntities.forEach(function(ent) {
        try { v.entities.remove(ent); } catch(e) {}
      });
      _state.previewEntities = [];
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

    // 2. Entidades persistentes reutilizables (zero GC allocation por frame)
    ensurePreviewEntities();

    // Punto inicial (Punto A - verde esmeralda)
    if (_state.previewPinA) {
      _state.previewPinA.position = visualStart;
      _state.previewPinA.show = true;
    }

    // Punto terminal en cursor (Punto B - ámbar o verde magnético)
    if (_state.previewPinB) {
      _state.previewPinB.position = visualEnd;
      _state.previewPinB.point.color = snapMeta ? Cesium.Color.fromCssColorString('#10B981') : Cesium.Color.fromCssColorString('#F59E0B');
      _state.previewPinB.show = true;
    }

    // Si hay snapping activo, halo magnético adicional
    if (_state.previewRing) {
      if (snapMeta) {
        _state.previewRing.position = visualEnd;
        _state.previewRing.show = true;
      } else {
        _state.previewRing.show = false;
      }
    }

    // Etiqueta flotante con desglose 3D, 2D y desnivel con indicador de pendiente (sube/baja)
    var arrow = '';
    if (Math.abs(metrics.dZSigned || 0) > 0.02) {
      arrow = (metrics.dZSigned > 0) ? ' ↑ (sube)' : ' ↓ (baja)';
    }
    var labelText = '📏 3D: ' + metrics.d3D.toFixed(2) + ' m' +
                    '\n↔ 2D: ' + metrics.d2D.toFixed(2) + ' m' +
                    '  |  ↕ ΔH: ' + metrics.dZ.toFixed(2) + ' m' + arrow + ' (' + metrics.slopeDeg.toFixed(1) + '°)';

    if (snapMeta && snapMeta.type) {
      labelText += '\n🧲 [' + snapMeta.type + ']';
    }

    if (_state.previewLabel) {
      _state.previewLabel.position = labelPos;
      _state.previewLabel.label.text = labelText;
      _state.previewLabel.show = true;
    }

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

    if (!_state._suppressToast && typeof global.showToast === 'function') {
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
      '<button id="ra-measure-snap-toggle-btn" type="button" style="background:rgba(16,185,129,0.22); border:1px solid #10B981; color:#34D399; font-weight:700; font-size:10px; padding:3px 10px; border-radius:12px; cursor:pointer; display:flex; align-items:center; gap:4px; transition:all 0.15s ease;" title="Conmutar atracción magnética (Atajo: X)">',
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
    var sign = '';
    if (Math.abs(metrics.dZSigned || 0) > 0.02) {
      sign = (metrics.dZSigned > 0) ? ' ↑' : ' ↓';
    }
    el.innerHTML = '<span style="color:#38BDF8;">3D: ' + metrics.d3D.toFixed(2) + 'm</span> · ' +
                   '<span style="color:#94A3B8;">2D: ' + metrics.d2D.toFixed(2) + 'm</span> · ' +
                   '<span style="color:#F59E0B;">ΔH: ' + metrics.dZ.toFixed(2) + 'm' + sign + '</span>';
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
  var _rafMeasureMouseMove = null;

  function attachMouseHandler() {
    var v = getViewer();
    if (!v || !v.canvas) return;
    detachMouseHandler();

    _state.handler = new Cesium.ScreenSpaceEventHandler(v.canvas);

    // MOUSE_MOVE: Detección continua de snap y actualización de cota en vivo (throttled vía requestAnimationFrame)
    _state.handler.setInputAction(function(movement) {
      if (!_state.active) return;
      if (_rafMeasureMouseMove) return;

      var endPos = movement.endPosition;
      _rafMeasureMouseMove = (typeof window !== 'undefined' && window.requestAnimationFrame)
        ? window.requestAnimationFrame(function() {
            _rafMeasureMouseMove = null;
            if (!_state.active) return;

            var snapTarget = findSnapPoint(endPos);
            var pos3D = (snapTarget && snapTarget.pos) ? snapTarget.pos : get3DPosition(endPos);

            _state.hoverPoint = pos3D;
            _state.hoverSnapTarget = snapTarget;

            if (_state.points.length > 0 && pos3D) {
              var lastPt = _state.points[_state.points.length - 1];
              updateDynamicPreview(lastPt, pos3D, snapTarget);
            } else if (snapTarget && snapTarget.pos) {
              // Resaltar vértice magnetizado antes del primer clic usando halo magnético persistente
              ensurePreviewEntities();
              if (_state.previewRing) {
                _state.previewRing.position = elevatePoint(snapTarget.pos, 0.12);
                _state.previewRing.show = true;
              }
              if (_state.previewPinA) _state.previewPinA.show = false;
              if (_state.previewPinB) _state.previewPinB.show = false;
              if (_state.previewLabel) _state.previewLabel.show = false;
              if (_state.previewPolyline) _state.previewPolyline.show = false;
              requestSceneRender();
            } else {
              clearPreviewEntities();
            }
          })
        : null;
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
    if (_rafMeasureMouseMove) {
      if (typeof window !== 'undefined' && window.cancelAnimationFrame) {
        window.cancelAnimationFrame(_rafMeasureMouseMove);
      }
      _rafMeasureMouseMove = null;
    }
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
    _state.snapCandidates = null;
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

  // Control de visibilidad reversible para modo captura limpia (tecla C)
  function setVisible(visible) {
    var isVisible = !!visible;
    if (_state.polylineCollection && !_state.polylineCollection.isDestroyed()) {
      _state.polylineCollection.show = isVisible;
    }
    if (Array.isArray(_state.fixedEntities)) {
      _state.fixedEntities.forEach(function(ent) {
        try { ent.show = isVisible; } catch(e) {}
      });
    }
    if (Array.isArray(_state.previewEntities)) {
      _state.previewEntities.forEach(function(ent) {
        try { ent.show = isVisible; } catch(e) {}
      });
    }
    if (_state.snapIndicatorEntity) {
      try { _state.snapIndicatorEntity.show = isVisible; } catch(e) {}
    }
    if (_state.previewPinA) { try { _state.previewPinA.show = isVisible; } catch(e) {} }
    if (_state.previewPinB) { try { _state.previewPinB.show = isVisible; } catch(e) {} }
    if (_state.previewRing) { try { _state.previewRing.show = isVisible; } catch(e) {} }
    if (_state.previewLabel) { try { _state.previewLabel.show = isVisible; } catch(e) {} }
    var hudEl = _state.hudElement || (typeof document !== 'undefined' ? document.getElementById('ra-measure-hud') : null);
    if (hudEl) {
      hudEl.style.visibility = (isVisible && _state.active) ? '' : 'hidden';
    }
    requestSceneRender();
  }

  // ── ATAJOS DE TECLADO GLOBALES ([M], [X], [Escape]) ───────────────────────
  function setupKeyboardShortcuts() {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    window.addEventListener('keydown', function(e) {
      // Ignorar si el usuario escribe en un campo de texto o editor enriquecido
      var tag = e.target && e.target.tagName ? e.target.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || (e.target && (e.target.isContentEditable || (e.target.closest && e.target.closest('[contenteditable="true"]'))))) return;

      var key = e.key ? e.key.toLowerCase() : '';

      // Tecla M: Alternar cinta métrica
      if (key === 'm' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        toggle();
        return;
      }

      // Tecla X: Alternar snap SOLO si la herramienta de medición está activa (evita colisión con snap magnético CAD)
      if (key === 'x' && _state.active && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        toggleSnapping();
        return;
      }

      // Tecla Escape: Salir o cancelar tramo activo sin propagar a navegación global
      if (e.key === 'Escape' && _state.active) {
        e.preventDefault();
        e.stopPropagation();
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

  // ── SERIALIZACIÓN Y DESERIALIZACIÓN (.raproject) ─────────────────────────
  function serialize() {
    return (_state.measurements || []).map(function(m) {
      return {
        id: m.id,
        ptA: m.ptA ? { x: m.ptA.x, y: m.ptA.y, z: m.ptA.z } : null,
        ptB: m.ptB ? { x: m.ptB.x, y: m.ptB.y, z: m.ptB.z } : null,
        metrics: m.metrics ? {
          d3D: m.metrics.d3D,
          d2D: m.metrics.d2D,
          dZ: m.metrics.dZ,
          dZSigned: m.metrics.dZSigned,
          slopeDeg: m.metrics.slopeDeg
        } : null
      };
    });
  }

  function deserialize(dataArray) {
    clearMeasurements();
    if (!Array.isArray(dataArray) || !dataArray.length) return;
    if (typeof Cesium === 'undefined') return;

    _state._suppressToast = true;
    try {
      dataArray.forEach(function(item) {
        if (!item || !item.ptA || !item.ptB) return;
        if (!isFinite(item.ptA.x) || !isFinite(item.ptB.x)) return;
        var pA = new Cesium.Cartesian3(item.ptA.x, item.ptA.y, item.ptA.z);
        var pB = new Cesium.Cartesian3(item.ptB.x, item.ptB.y, item.ptB.z);
        commitMeasurementSegment(pA, pB);
      });
    } finally {
      _state._suppressToast = false;
    }
  }

  var RAMeasureTool = {
    activate: activate,
    deactivate: deactivate,
    toggle: toggle,
    setVisible: setVisible,
    setSnapping: setSnapping,
    toggleSnapping: toggleSnapping,
    clearMeasurements: clearMeasurements,
    isActive: function() { return _state.active; },
    isSnappingEnabled: function() { return _state.snappingEnabled; },
    invalidateSnapCandidates: invalidateSnapCandidates,
    getMeasurements: function() { return _state.measurements.slice(); },
    serialize: serialize,
    deserialize: deserialize
  };

  global.RAMeasureTool = RAMeasureTool;
  if (!global.RA) global.RA = {};
  global.toggleMeasureTool = toggle;

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
