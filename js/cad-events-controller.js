// ============================================================================
// js/cad-events-controller.js — Controlador de Eventos Cesium 3D y Atajos (Fase B3)
// ============================================================================
(function (global) {
  global.RACadEvents = {
    init: function () {
  const handler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
  // Throttle de pickPosition GPU: máx ~30 picks/s (cada 32ms) para MOUSE_MOVE
  let _lastPickTime = 0;
  const _PICK_THROTTLE_MS = 32;

  // 1. LEFT_DOWN: Detección prioritaria de agarre del Gizmo 3D (bloquea la cámara SOLO mientras se arrastra una maneta o vértice)
  handler.setInputAction(down => {
    // 🌟 BYPASS CINTA MÉTRICA 3D: Si la herramienta de medición está activa, ceder control exclusivo
    if (typeof window.RAMeasureTool !== 'undefined' && window.RAMeasureTool && typeof window.RAMeasureTool.isActive === 'function' && window.RAMeasureTool.isActive()) {
      return;
    }

    // 🌟 PRIORIDAD ABSOLUTA (BYPASS DE CESIUM): DIBUJO DE HUELLA DE EDIFICIO 3D EN TERRENO
    if (typeof WP !== "undefined" && WP && (WP.mode === "draw-building" || WP.mode === "draw-building-rect")) {
      let pos3D = get3DPosition(down.position);
      if (Cesium.defined(pos3D)) {
        if (typeof triadState !== "undefined" && triadState && triadState.snapTarget && triadState.snapTarget.pos) {
          pos3D = Cesium.Cartesian3.clone(triadState.snapTarget.pos);
        }
        if (WP.mode === "draw-building-rect") {
          if (typeof handleBuildingRectClick === "function") {
            handleBuildingRectClick(pos3D);
          }
          return;
        }
        if (activeBuildingPts && activeBuildingPts.length >= 3) {
          try {
            const p0Screen = Cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, activeBuildingPts[0]);
            if (p0Screen && Math.hypot(down.position.x - p0Screen.x, down.position.y - p0Screen.y) <= 45) {
              finishActiveBuilding();
              return;
            }
          } catch(e) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(e, 'Entidad/Primitiva Cesium'); }
        }
        handleBuildingClick(pos3D);
      }
      return;
    }

    // 🌟 PRIORIDAD #1: CAPTURA UNIVERSAL DEL GIZMO 3D (Vértices, Cuadros Eléctricos, Obstáculos, Edificios, Paneles)
    const uTarget = (typeof getUniversalSelectedTarget === 'function') ? getUniversalSelectedTarget() : null;
    if (uTarget && universalGizmoState.screen) {
      const hitUGizmo = checkUniversalGizmoHit(down.position.x, down.position.y);
      if (hitUGizmo) {
        if (hitUGizmo === 'badge-toggle') {
          switchUniversalGizmoMode();
          renderTriad2D();
          return;
        }
        universalGizmoState.active = true;
        universalGizmoState.wasDragging = false;
        universalGizmoState.mode = hitUGizmo;
        universalGizmoState.targetType = uTarget.type;
        if (window.RAundo && typeof window.RAundo.beginDrag === 'function') window.RAundo.beginDrag(uTarget.type);
        universalGizmoState.startMouse = { x: down.position.x, y: down.position.y };
        universalGizmoState.startPos = Cesium.Cartesian3.clone(uTarget.pos);
        // [ROT-3D] Capturar el valor del EJE cuyo anillo se agarra (antes siempre el yaw
        // `rot` → arrastrar cualquier anillo U/V/Z giraba sobre el mismo eje).
        let _startRotVal = uTarget.rot || 0;
        if (uTarget.type === 'obstacle' && uTarget.rawObj) {
          if (hitUGizmo === 'rotate-u') _startRotVal = uTarget.rawObj.rotU || 0;
          else if (hitUGizmo === 'rotate-v') _startRotVal = uTarget.rawObj.rotV || 0;
          else _startRotVal = uTarget.rawObj.rot || 0;
        }
        universalGizmoState.startRot = _startRotVal;
        if (uTarget.type === 'building' && uTarget.rawObj) {
          const bldPts = uTarget.rawObj.points || uTarget.rawObj.polygon || [];
          universalGizmoState.startPoints = bldPts.map(p => Cesium.Cartesian3.clone(p));
          universalGizmoState.startCenter = Cesium.Cartesian3.clone(uTarget.pos);
        }
        if (uTarget.type === 'polyline' && uTarget.rawObj) {
          const polyMove = uTarget.rawObj;
          const pIdxMove = uTarget.polyIdx;
          if (window.RAundo && typeof window.RAundo.snapPolylines === 'function') {
            window.RAundo.snapPolylines('Mover ' + (polyMove.name || 'Faldón'));
          }
          const allObsMove = (typeof obstacles !== 'undefined' && Array.isArray(obstacles)) ? obstacles : [];
          universalGizmoState.movePolyObs = allObsMove.filter(obs => {
            if (!obs || !obs.cartesian) return false;
            if (typeof wpCheckObstacleInsideRoof === 'function') {
              const res = wpCheckObstacleInsideRoof(obs);
              return res && res.isInside && (res.polyIdx === pIdxMove || res.polyName === polyMove.name);
            }
            return false;
          });
          if (universalGizmoState.movePolyObs.length > 0 && window.RAundo && typeof window.RAundo.snapObstacles === 'function') {
            window.RAundo.snapObstacles('Mover obstáculos con ' + (polyMove.name || 'Faldón'));
          }
          universalGizmoState.startPoints = Array.isArray(polyMove.points) ? polyMove.points.map(p => Cesium.Cartesian3.clone(p)) : [];
          universalGizmoState.startCenter = uTarget.pos ? Cesium.Cartesian3.clone(uTarget.pos) : null;
          universalGizmoState.startMovePolyObsPts = universalGizmoState.movePolyObs.map(o => o && o.cartesian ? Cesium.Cartesian3.clone(o.cartesian) : null);
          universalGizmoState.movePolyIdx = pIdxMove;
        }
        if (uTarget.type === 'workplane' && uTarget.rawObj) {
          const pl = uTarget.rawObj;
          universalGizmoState.startPoints = (pl.pts3D || []).map(p => Cesium.Cartesian3.clone(p));
          universalGizmoState.startOrigin = pl.origin ? Cesium.Cartesian3.clone(pl.origin) : null;
          universalGizmoState.startNormal = pl.normal ? Cesium.Cartesian3.clone(pl.normal) : null;
          universalGizmoState.startUVec = pl.uVec ? Cesium.Cartesian3.clone(pl.uVec) : null;
          universalGizmoState.startVVec = pl.vVec ? Cesium.Cartesian3.clone(pl.vVec) : null;
          universalGizmoState.startCenter = Cesium.Cartesian3.clone(uTarget.pos);
          if (Array.isArray(WP.polylines)) {
            universalGizmoState.startChildPolys = WP.polylines.map(poly => {
              if (poly && poly.planeIdx === WP.activePlaneIdx && Array.isArray(poly.points)) {
                return poly.points.map(pt => Cesium.Cartesian3.clone(pt));
              }
              return null;
            });
          }
        }
        if (uTarget.type === 'workplane_vertex' && uTarget.rawObj) {
          const { plane, vtxIdx } = uTarget.rawObj;
          universalGizmoState.startPlaneVtxPt = plane && plane.pts3D && plane.pts3D[vtxIdx] ? Cesium.Cartesian3.clone(plane.pts3D[vtxIdx]) : null;
        }
        if (uTarget.type === 'panel' && uTarget.rawObj && uTarget.rawObj.corners) {
          universalGizmoState.startCorners = uTarget.rawObj.corners.map(c => Cesium.Cartesian3.clone(c));
          if (activePanelDragEntity && viewer) {
            try { viewer.entities.remove(activePanelDragEntity); } catch(e) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(e, 'Entidad/Primitiva Cesium'); }
            activePanelDragEntity = null;
          }
          try {
            const p = uTarget.rawObj;
            const isHeatmap = typeof solarSimState !== 'undefined' && solarSimState && solarSimState.viewMode === 'heatmap';
            const baseColor = isHeatmap
              ? (p.heatmapColor ? Cesium.Color.fromCssColorString(p.heatmapColor.hex) : Cesium.Color.fromCssColorString('#10b981'))
              : Cesium.Color.fromCssColorString(p.stringColor || '#00F0FF');
            const dragColor = baseColor.withAlpha(0.92);
            activePanelDragEntity = viewer.entities.add({
              id: 'pv_panel_active_drag_preview',
              polygon: {
                hierarchy: new Cesium.CallbackProperty(() => new Cesium.PolygonHierarchy(p.corners), false),
                material: new Cesium.ColorMaterialProperty(dragColor),
                perPositionHeight: true
              }
            });
          } catch(eDragEnt) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(eDragEnt, 'Entidad/Primitiva Cesium'); }
        }
        if (uTarget.wp) {
          universalGizmoState.wp = uTarget.wp;
        }
        if (universalGizmoState.screen) {
          universalGizmoState.startUVec = universalGizmoState.screen.uVec ? Cesium.Cartesian3.clone(universalGizmoState.screen.uVec) : null;
          universalGizmoState.startVVec = universalGizmoState.screen.vVec ? Cesium.Cartesian3.clone(universalGizmoState.screen.vVec) : null;
          universalGizmoState.startZVec = universalGizmoState.screen.zVec ? Cesium.Cartesian3.clone(universalGizmoState.screen.zVec) : null;
        }

        if (scene && scene.screenSpaceCameraController) {
          scene.screenSpaceCameraController.enableRotate = false;
          scene.screenSpaceCameraController.enableTranslate = false;
          scene.screenSpaceCameraController.enableTilt = false;
          scene.screenSpaceCameraController.enableLook = false;
          scene.screenSpaceCameraController.enableZoom = false;
        }

        const res = (typeof obsComputeUV === 'function') ? obsComputeUV(down.position) : null;
        if (res) {
          universalGizmoState.startHitU = res.u;
          universalGizmoState.startHitV = res.v;
          if (uTarget.type !== 'obstacle') {
            universalGizmoState.wp = res.wp;
          }
        }

        const dx = down.position.x - universalGizmoState.screen.ox;
        const dy = down.position.y - universalGizmoState.screen.oy;
        universalGizmoState.startAngleRad = Math.atan2(-dy, dx);
        return;
      }
    }

    // ── B0. Clic directo sobre vértice maestro del plano de trabajo activo (P1, P2, P3 en Paso 1)
    const curStep = (typeof wpCurrentStep !== 'undefined') ? wpCurrentStep : ((typeof window !== 'undefined' && window.wpCurrentStep) || 1);
    if (curStep === 1 && typeof WP !== 'undefined' && WP && typeof wpGetActivePlane === 'function') {
      const actPl = wpGetActivePlane();
      if (actPl && Array.isArray(actPl.pts3D) && actPl.pts3D.length >= 3 && actPl.visible !== false) {
        let nearestPlaneVtxIdx = -1;
        let minPlaneVtxDist = 24.0;
        for (let vi = 0; vi < 3; vi++) {
          const pt = actPl.pts3D[vi];
          if (!pt) continue;
          const pWin = Cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, pt);
          if (pWin) {
            const d = Math.hypot(down.position.x - pWin.x, down.position.y - pWin.y);
            if (d < minPlaneVtxDist) {
              minPlaneVtxDist = d;
              nearestPlaneVtxIdx = vi;
            }
          }
        }
        if (nearestPlaneVtxIdx >= 0) {
          WP.selectedPlaneVtxIdx = nearestPlaneVtxIdx;
          WP.selectedVtxIdx = -1;
          WP.selectedPolyIdx = -1;
          WP.movePolyGizmoIdx = -1;
          if (typeof wpRenderAllPolylines === 'function') wpRenderAllPolylines();
          if (typeof wpPopulateFaldonCard === 'function') wpPopulateFaldonCard();
          renderTriad2D();

          const pt = actPl.pts3D[nearestPlaneVtxIdx];
          universalGizmoState.active = true;
          universalGizmoState.wasDragging = false;
          universalGizmoState.mode = 'center-drag';
          universalGizmoState.targetType = 'workplane_vertex';
          if (window.RAundo && typeof window.RAundo.beginDrag === 'function') window.RAundo.beginDrag('workplane_vertex');
          universalGizmoState.startMouse = { x: down.position.x, y: down.position.y };
          universalGizmoState.startPos = Cesium.Cartesian3.clone(pt);
          universalGizmoState.startRot = 0;
          universalGizmoState.startAngleRad = 0;
          universalGizmoState.startPlaneVtxPt = Cesium.Cartesian3.clone(pt);

          if (scene && scene.screenSpaceCameraController) {
            scene.screenSpaceCameraController.enableRotate = false;
            scene.screenSpaceCameraController.enableTranslate = false;
            scene.screenSpaceCameraController.enableTilt = false;
            scene.screenSpaceCameraController.enableLook = false;
            scene.screenSpaceCameraController.enableZoom = false;
          }
          return;
        }
      }
    }

    // ── B1. Clic directo sobre vértice de huella de edificio (distancia de pantalla <= 24px o pick de handle) para seleccionarlo e iniciar arrastre
    let nearestBldVtx = null;
    const pickedDown = (scene && typeof scene.pick === 'function') ? scene.pick(down.position) : null;
    if (pickedDown && pickedDown.id) {
      const pIdStr = (typeof pickedDown.id === 'string') ? pickedDown.id : (typeof pickedDown.id.id === 'string' ? pickedDown.id.id : '');
      if (pIdStr.startsWith('bld_vtx_handle_')) {
        const parts = pIdStr.replace('bld_vtx_handle_', '').split('_');
        const vi = parseInt(parts.pop(), 10);
        const bId = parts.join('_');
        const targetB = Array.isArray(buildings) ? buildings.find(b => b.id === bId) : null;
        if (targetB && targetB.visible !== false) {
          nearestBldVtx = { bldId: bId, vtxIdx: vi };
        }
      }
    }
    if (!nearestBldVtx && Array.isArray(buildings) && buildings.length > 0) {
      let minBldVtxDist = 24.0;
      const _selBld = (typeof selectedBuildingId !== 'undefined' && selectedBuildingId) ? buildings.find(b => b.id === selectedBuildingId) : null;
      const _bldList = _selBld ? [_selBld] : buildings;
      for (const _b of _bldList) {
        if (!_b.points || _b.visible === false) continue;
        const bH = _b.height || 6.0;
        for (let _vi = 0; _vi < _b.points.length; _vi++) {
          const ptBase = _b.points[_vi];
          if (!ptBase) continue;

          // Proyección en base
          const _pWin = Cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, ptBase);
          if (_pWin) {
            const _d = Math.hypot(down.position.x - _pWin.x, down.position.y - _pWin.y);
            if (_d < minBldVtxDist) {
              minBldVtxDist = _d;
              nearestBldVtx = { bldId: _b.id, vtxIdx: _vi };
            }
          }

          // Proyección en alero / cubierta
          const c = Cesium.Cartographic.fromCartesian(ptBase);
          if (c) {
            const ptRoof = Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, c.height + bH);
            const _pWinRoof = Cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, ptRoof);
            if (_pWinRoof) {
              const _dRoof = Math.hypot(down.position.x - _pWinRoof.x, down.position.y - _pWinRoof.y);
              if (_dRoof < minBldVtxDist) {
                minBldVtxDist = _dRoof;
                nearestBldVtx = { bldId: _b.id, vtxIdx: _vi };
              }
            }
          }
        }
      }
    }
    if (nearestBldVtx) {
      if (typeof selectedBuildingId !== 'undefined' && selectedBuildingId !== nearestBldVtx.bldId && typeof selectBuilding === 'function') {
        selectBuilding(nearestBldVtx.bldId);
      }
      if (typeof selectBuildingVertex === 'function') selectBuildingVertex(nearestBldVtx.vtxIdx);

      const _bldPt = (function() {
        const _bT = buildings.find(b => b.id === nearestBldVtx.bldId);
        return (_bT && _bT.points && _bT.points[nearestBldVtx.vtxIdx]) ? _bT.points[nearestBldVtx.vtxIdx] : null;
      })();

      universalGizmoState.active = true;
      universalGizmoState.wasDragging = false;
      universalGizmoState.mode = 'center-drag';
      universalGizmoState.targetType = 'vertex';
      if (window.RAundo && typeof window.RAundo.beginDrag === 'function') window.RAundo.beginDrag('vertex');
      universalGizmoState.startMouse = { x: down.position.x, y: down.position.y };
      universalGizmoState.startPos = _bldPt ? Cesium.Cartesian3.clone(_bldPt) : null;
      universalGizmoState.startRot = 0;
      universalGizmoState.startAngleRad = 0;
      if (typeof getUniversalSelectedTarget === 'function') {
        try {
          const _uT = getUniversalSelectedTarget();
          if (_uT && _uT.wp) universalGizmoState.wp = _uT.wp;
        } catch(_e) {
          if (typeof window.RA !== 'undefined' && window.RA.log) window.RA.log.warn('Error fetching vertex data', _e);
        }
      }

      if (scene && scene.screenSpaceCameraController) {
        scene.screenSpaceCameraController.enableRotate = false;
        scene.screenSpaceCameraController.enableTranslate = false;
        scene.screenSpaceCameraController.enableTilt = false;
        scene.screenSpaceCameraController.enableLook = false;
        scene.screenSpaceCameraController.enableZoom = false;
      }
      return;
    }

    // ── B. Clic directo sobre vértice de polilínea activa (distancia de pantalla <= 22px) para seleccionarlo e iniciar arrastre
    if (typeof WP !== 'undefined' && WP && WP.polylines && WP.selectedPolyIdx >= 0) {
      const poly = WP.polylines[WP.selectedPolyIdx];
      if (poly && poly.points && poly.points.length > 0) {
        let nearestVtxIdx = -1;
        let minVtxDist = 22.0;
        for (let vi = 0; vi < poly.points.length; vi++) {
          const pWin = Cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, poly.points[vi]);
          if (pWin) {
            const d = Math.hypot(down.position.x - pWin.x, down.position.y - pWin.y);
            if (d < minVtxDist) {
              minVtxDist = d;
              nearestVtxIdx = vi;
            }
          }
        }
        if (nearestVtxIdx >= 0) {
          wpSelectVertex(nearestVtxIdx);
          renderTriad2D();

          universalGizmoState.active = true;
          universalGizmoState.wasDragging = false;
          universalGizmoState.mode = 'center-drag';
          universalGizmoState.targetType = 'vertex';
          if (window.RAundo && typeof window.RAundo.beginDrag === 'function') window.RAundo.beginDrag('vertex');
          universalGizmoState.startMouse = { x: down.position.x, y: down.position.y };
          universalGizmoState.startPos = Cesium.Cartesian3.clone(poly.points[nearestVtxIdx]);
          universalGizmoState.startRot = 0;

          if (scene && scene.screenSpaceCameraController) {
            scene.screenSpaceCameraController.enableRotate = false;
            scene.screenSpaceCameraController.enableTranslate = false;
            scene.screenSpaceCameraController.enableTilt = false;
            scene.screenSpaceCameraController.enableLook = false;
            scene.screenSpaceCameraController.enableZoom = false;
          }
          return;
        }
      }
    }
  }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

  // 2. LEFT_CLICK: Selección y deselección interactiva
  handler.setInputAction(click => {
    // 🌟 BYPASS CINTA MÉTRICA 3D: Si la herramienta de medición está activa, ceder control exclusivo
    if (typeof window.RAMeasureTool !== 'undefined' && window.RAMeasureTool && typeof window.RAMeasureTool.isActive === 'function' && window.RAMeasureTool.isActive()) {
      return;
    }
    // 🌟 BYPASS MARQUEE SHIFT+DRAG: evitar que el click al soltar borre la selección múltiple por ventana
    if (window.cadMarqueeState && (window.cadMarqueeState.active || (window.cadMarqueeState._justFinishedAt && (Date.now() - window.cadMarqueeState._justFinishedAt) < 250))) {
      return;
    }

    // ── PRIORIDAD ABSOLUTA #0A: TRAZADO INTERACTIVO DE CANALIZACIONES 3D (BANDEJAS Y TUBOS DE FACHADA)
    if (window.cableRoutingState && window.cableRoutingState.active) {
      let routeClickPos = null;
      if (typeof get3DElectricalClickPosition === 'function') {
        routeClickPos = get3DElectricalClickPosition(click.position);
      }
      if (!routeClickPos && typeof get3DPosition === 'function') {
        routeClickPos = get3DPosition(click.position);
      }
      if (routeClickPos) {
        wpAddCableRoutePoint(routeClickPos, { shiftKey: Boolean(typeof window !== 'undefined' && window._raShiftKeyDown) });
        return;
      }
    }

    // <i data-lucide=\"zap\" class=\"icon-sm\"></i> PRIORIDAD ABSOLUTA #0: UBICACIÓN INTERACTIVA DE INFRAESTRUCTURA ELÉCTRICA 3D (INVERSOR, CONTADOR, COMBINER BOX)
    if (window.inverterEquipmentState) {
      const isPlacingInv = window.inverterEquipmentState.isPlacing;
      const isPlacingMeter = window.inverterEquipmentState.gridMeter && window.inverterEquipmentState.gridMeter.isPlacing;
      const isPlacingCB = window.inverterEquipmentState.combinerBox && window.inverterEquipmentState.combinerBox.isPlacing;
      const isPlacingBattery = window.inverterEquipmentState.isPlacingBattery;

      if (isPlacingInv || isPlacingMeter || isPlacingCB || isPlacingBattery) {
        let clickPos3D = null;
        if (typeof get3DElectricalClickPosition === 'function') {
          clickPos3D = get3DElectricalClickPosition(click.position);
        } else {
          if (viewer.scene && typeof viewer.scene.pickPosition === 'function') {
            try { clickPos3D = viewer.scene.pickPosition(click.position); } catch(e) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(e, 'Entidad/Primitiva Cesium'); }
          }
          if (!clickPos3D && typeof get3DPosition === 'function') {
            try { clickPos3D = get3DPosition(click.position); } catch(e) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(e, 'Entidad/Primitiva Cesium'); }
          }
          if (!clickPos3D && viewer.camera && viewer.scene && viewer.scene.globe) {
            try { clickPos3D = viewer.camera.pickEllipsoid(click.position, viewer.scene.globe.ellipsoid); } catch(e) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(e, 'Entidad/Primitiva Cesium'); }
          }
        }

        if (clickPos3D) {
          if (isPlacingInv) {
            wpPlaceInverterAtPosition(clickPos3D);
            return;
          } else if (isPlacingMeter) {
            wpPlaceGridMeterAtPosition(clickPos3D);
            return;
          } else if (isPlacingCB) {
            wpPlaceCombinerBoxAtPosition(clickPos3D);
            return;
          } else if (isPlacingBattery) {
            wpPlaceBatteryAtPosition(clickPos3D);
            return;
          }
        }
      }
    }



    // ── PRIORIDAD ABSOLUTA: Definir Plano de Cubierta (P1, P2, P3)
    if (typeof WP !== "undefined" && WP && WP.mode === "define-plane") {
      // 1. Muestreo físico directo de superficie ({ raw: true } sin interpolación ni throttle)
      let pos3D = get3DPosition(click.position, { raw: true, bypassThrottle: true });

      // 2. Fallback a posición reciente de la tríada si estaba sobre la superficie
      if (!Cesium.defined(pos3D) && typeof triadState !== "undefined" && triadState && triadState.pos3D) {
        pos3D = Cesium.Cartesian3.clone(triadState.pos3D);
      }

      // 3. Fallback contra el terreno físico DTM
      if (!Cesium.defined(pos3D)) {
        try {
          if (typeof scene !== "undefined" && scene && scene.globe) {
            const _ray = (typeof camera !== "undefined" && camera && camera.getPickRay) ? camera.getPickRay(click.position) : null;
            if (_ray) {
              const _gPos = scene.globe.pick(_ray, scene);
              if (Cesium.defined(_gPos) && isFinite(_gPos.x)) pos3D = _gPos;
            }
          }
        } catch(_e) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(_e, 'Entidad/Primitiva Cesium'); }
      }

      // 🛡️ NUNCA usar pickEllipsoid en definición de plano: proyecta a nivel del mar (0m) y crea puntos en el aire/infinito
      if (Cesium.defined(pos3D) && isFinite(pos3D.x)) {
        if (typeof triadState !== "undefined" && triadState && triadState.snapTarget && triadState.snapTarget.pos) {
          pos3D = Cesium.Cartesian3.clone(triadState.snapTarget.pos);
        }
        wpAddPlanePoint(pos3D);
      } else {
        if (typeof showToast === 'function') {
          showToast('SUPERFICIE NO DETECTADA', 'Haz clic directamente sobre la cubierta del tejado.', 'warning', 3500);
        }
      }
      return;
    }

    // Si se estaba arrastrando un gizmo, no procesar el click para evitar deselecciones accidentales
    const _vtxDragging = (typeof vtxGizmoState !== 'undefined' && vtxGizmoState && vtxGizmoState.wasDragging);
    const _obsDragging = (typeof obsGizmoState !== 'undefined' && obsGizmoState && obsGizmoState.wasDragging);
    const _pnlDragging = (typeof panelGizmoState !== 'undefined' && panelGizmoState && panelGizmoState.wasDragging);
    const _uGizmoDragging = (typeof universalGizmoState !== 'undefined' && universalGizmoState && universalGizmoState.wasDragging);
    if (_vtxDragging || _obsDragging || _pnlDragging || _uGizmoDragging) {
      if (typeof vtxGizmoState !== 'undefined' && vtxGizmoState) vtxGizmoState.wasDragging = false;
      if (typeof obsGizmoState !== 'undefined' && obsGizmoState) obsGizmoState.wasDragging = false;
      if (typeof panelGizmoState !== 'undefined' && panelGizmoState) panelGizmoState.wasDragging = false;
      if (typeof universalGizmoState !== 'undefined' && universalGizmoState) universalGizmoState.wasDragging = false;
      return;
    }

    // ── PRIORIDAD 1: Colocación activa de nuevos obstáculos (Botón de Crear Objeto)
    if (window.RAWindUI && typeof window.RAWindUI.isPlacementActive === 'function' && window.RAWindUI.isPlacementActive()) {
      const pos3D = (typeof get3DPosition === 'function')
        ? get3DPosition(click.position, { raw: true, bypassThrottle: true })
        : null;
      if (pos3D && window.RAWindUI.placeAtCartesian(pos3D)) {
        return;
      }
    }

    if (typeof obsPlacement !== 'undefined' && obsPlacement && obsPlacement.active) {
      if (typeof obsPlaceAt === 'function' && obsPlaceAt(click.position)) return;
    }

    // Prioridad 1.5: Modo Estampar Faldón / Polilínea Interactiva (Opción 2)
    if (typeof WP !== "undefined" && WP && WP.mode === "stamp-poly") {
      const pos3D = get3DPosition(click.position);
      if (Cesium.defined(pos3D)) {
        if (typeof wpCommitStampPolyline === 'function') {
          wpCommitStampPolyline(pos3D);
        }
      }
      return;
    }

    if (typeof WP !== "undefined" && WP && WP.mode === "draw-poly") {
      // Cierre directo por clic en pantalla sobre el 1er vértice
      if (WP.activePolyPts && WP.activePolyPts.length >= 3) {
        try {
          const p0Screen = Cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, WP.activePolyPts[0]);
          if (p0Screen && Math.hypot(click.position.x - p0Screen.x, click.position.y - p0Screen.y) <= 30) {
            wpCloseActivePolyline();
            return;
          }
        } catch(e) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(e, 'Entidad/Primitiva Cesium'); }
      }

      let pos3D = get3DPosition(click.position);
      if (Cesium.defined(pos3D)) {
        if (typeof triadState !== "undefined" && triadState && triadState.snapTarget && triadState.snapTarget.pos) {
          pos3D = Cesium.Cartesian3.clone(triadState.snapTarget.pos);
        }
        wpAddPolylinePoint(pos3D);
      }
      return;
    }

    // Modo Dibujo Directo desde Toolbar (appMode === 'draw') - REQUIERE PLANO DE TRABAJO
    const activePl = (typeof wpGetActivePlane === 'function') ? wpGetActivePlane() : null;
    const hasExistingPolys = (typeof WP !== "undefined" && WP && WP.polylines && WP.polylines.length > 0);
    if (activePl && typeof appMode !== "undefined" && appMode === "draw" && !isPolygonDesignConfirmed && !hasExistingPolys) {
      if (polygonPoints.length >= 3) {
        try {
          const p0Screen = Cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, polygonPoints[0]);
          if (p0Screen && Math.hypot(click.position.x - p0Screen.x, click.position.y - p0Screen.y) <= 30) {
            finishActivePolygon();
            return;
          }
        } catch(e) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(e, 'Entidad/Primitiva Cesium'); }
      }

      let pos3D = get3DPosition(click.position);
      if (Cesium.defined(pos3D)) {
        if (polygonPoints.length >= 3) {
          const dFirst = Cesium.Cartesian3.distance(pos3D, polygonPoints[0]);
          if (dFirst < 4.0) {
            finishActivePolygon();
            return;
          }
        }
        polygonPoints.push(pos3D);
        updateAllVisuals();
        showStatus('VÉRTICE #' + polygonPoints.length + ' AÑADIDO AL POLÍGONO', 1200);
      }
      return;
    }

    // ── MUESTREO 3D DE ENTIDAD BAJO EL CURSOR Y FILTRO CAD
    const pickedObj = (scene && typeof scene.pick === 'function') ? scene.pick(click.position) : null;
    const filter = (typeof window.cadSelectionFilter === 'string') ? window.cadSelectionFilter : 'all';

    // ── NIVEL 1: MANIPULADOR TRIDIMENSIONAL (GIZMO / TRÍADA)
    // Si el clic impacta directamente en las manillas o flechas del gizmo, no cambiar selección
    const hitGizmoDirect = (typeof checkUniversalGizmoHit === 'function') ? checkUniversalGizmoHit(click.position.x, click.position.y) : null;
    if (hitGizmoDirect) {
      return; // El gizmo universal gestiona el arrastre y transformación
    }

    // ── NIVEL 2: VÉRTICES Y PUNTOS (DIMENSIÓN 0 · IMÁN UNIFICADO DE 20px)
    if (filter === 'all' || filter === 'vertices') {
      // 2A. Vértice de Plano de Trabajo Activo (Paso 1)
      const curStepForClick = (typeof wpCurrentStep !== 'undefined') ? wpCurrentStep : ((typeof window !== 'undefined' && window.wpCurrentStep) || 1);
      if (curStepForClick === 1 && typeof WP !== 'undefined' && WP && typeof wpGetActivePlane === 'function') {
        const actPl = wpGetActivePlane();
        if (actPl && Array.isArray(actPl.pts3D) && actPl.pts3D.length >= 3 && actPl.visible !== false) {
          let hitPlaneVtxIdx = -1;
          if (pickedObj && pickedObj.id) {
            const pId = (typeof pickedObj.id === 'string') ? pickedObj.id : (typeof pickedObj.id.id === 'string' ? pickedObj.id.id : '');
            if (pId.startsWith('wp_active_plane_vtx_')) {
              hitPlaneVtxIdx = parseInt(pId.replace('wp_active_plane_vtx_', ''), 10);
            }
          }
          if (hitPlaneVtxIdx < 0 || isNaN(hitPlaneVtxIdx)) {
            let minPVtxDist = 20.0;
            for (let vi = 0; vi < 3; vi++) {
              const pt = actPl.pts3D[vi];
              if (!pt) continue;
              const pWin = Cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, pt);
              if (pWin) {
                const d = Math.hypot(click.position.x - pWin.x, click.position.y - pWin.y);
                if (d <= minPVtxDist) {
                  minPVtxDist = d;
                  hitPlaneVtxIdx = vi;
                }
              }
            }
          }
          if (hitPlaneVtxIdx >= 0 && hitPlaneVtxIdx < 3) {
            WP.selectedPlaneVtxIdx = hitPlaneVtxIdx;
            WP.selectedVtxIdx = -1;
            WP.selectedPolyIdx = -1;
            WP.movePolyGizmoIdx = -1;
            if (typeof wpRenderAllPolylines === 'function') wpRenderAllPolylines();
            if (typeof wpPopulateFaldonCard === 'function') wpPopulateFaldonCard();
            renderTriad2D();
            const vtxLabels = ['P1 (Origen)', 'P2 (Eje X)', 'P3 (Eje Y)'];
            showStatus('VÉRTICE #' + (hitPlaneVtxIdx + 1) + ' (' + vtxLabels[hitPlaneVtxIdx] + ') SELECCIONADO PARA EDICIÓN DIRECTA', 2500);
            return;
          }
        }
      }

      // 2A-bis. Codos editables y puntos medios "+" de canalizaciones eléctricas DC/AC
      if (typeof window !== 'undefined' && window.inverterEquipmentState && window.inverterEquipmentState.routes) {
        let hitRouteHandle = null;
        let hitRouteMid = null;
        const pIdStr = (pickedObj && pickedObj.id)
          ? (typeof pickedObj.id === 'string' ? pickedObj.id : (typeof pickedObj.id.id === 'string' ? pickedObj.id.id : ''))
          : '';
        if (pIdStr.startsWith('ra_route_handle_')) {
          const hm = pIdStr.match(/^ra_route_handle_(dc|ac)_(\d+)$/);
          if (hm) hitRouteHandle = { type: hm[1], index: parseInt(hm[2], 10) };
        } else if (pIdStr.startsWith('ra_route_mid_')) {
          const mm = pIdStr.match(/^ra_route_mid_(dc|ac)_(\d+)$/);
          if (mm) hitRouteMid = { type: mm[1], segIdx: parseInt(mm[2], 10) };
        }

        // Proximidad 2D en pantalla (22px codos, 18px puntos medios "+")
        if (!hitRouteHandle && !hitRouteMid) {
          let bestDistR = 22.0;
          let bestDistMid = 18.0;
          const liftR = (window.RACableEngine && window.RACableEngine.auditElevationMode) ? (window.RACableEngine.CONFIG.AUDIT_ELEVATION_M || 0.24) : 0;
          const toVisPt = (rawPt) => {
            const c3 = window.RACableEngine ? window.RACableEngine.toCartesian3(rawPt) : rawPt;
            if (!c3 || liftR <= 0) return c3;
            const uV = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(c3, new Cesium.Cartesian3());
            return Cesium.Cartesian3.add(c3, Cesium.Cartesian3.multiplyByScalar(uV, liftR, new Cesium.Cartesian3()), new Cesium.Cartesian3());
          };
          ['dc', 'ac'].forEach(rType => {
            const arr = window.inverterEquipmentState.routes[rType];
            if (!Array.isArray(arr)) return;
            for (let ri = 0; ri < arr.length; ri++) {
              const visR = toVisPt(arr[ri]);
              if (!visR) continue;
              const rWin = Cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, visR);
              if (rWin) {
                const dR = Math.hypot(click.position.x - rWin.x, click.position.y - rWin.y);
                if (dR < bestDistR) {
                  bestDistR = dR;
                  hitRouteHandle = { type: rType, index: ri };
                }
              }
              if (ri < arr.length - 1) {
                const visNext = toVisPt(arr[ri + 1]);
                if (visNext) {
                  const mid3D = Cesium.Cartesian3.midpoint(visR, visNext, new Cesium.Cartesian3());
                  const mWin = Cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, mid3D);
                  if (mWin) {
                    const dM = Math.hypot(click.position.x - mWin.x, click.position.y - mWin.y);
                    if (dM < bestDistMid) {
                      bestDistMid = dM;
                      hitRouteMid = { type: rType, segIdx: ri };
                    }
                  }
                }
              }
            }
          });
          if (hitRouteHandle) hitRouteMid = null;
        }

        if (hitRouteMid && window.RACableEngine && typeof window.RACableEngine.insertRouteMidpoint === 'function') {
          const newIdx = window.RACableEngine.insertRouteMidpoint(hitRouteMid.type, hitRouteMid.segIdx);
          if (newIdx >= 0) {
            if (typeof showStatus === 'function') {
              showStatus('CODO INTERMEDIO ' + hitRouteMid.type.toUpperCase() + ' #' + (newIdx + 1) + ' INSERTADO · ARRASTRA PARA ADAPTAR TRAZADO', 2600);
            }
            return;
          }
        }

        if (hitRouteHandle) {
          if (typeof selectPanel === 'function') selectPanel(-1);
          if (typeof selectObstacle === 'function') selectObstacle(null);
          if (typeof selectElectricalObject === 'function') selectElectricalObject(null);
          window.selectedRouteVertex = { type: hitRouteHandle.type, index: hitRouteHandle.index };
          if (typeof switchUniversalGizmoMode === 'function') switchUniversalGizmoMode('translate');
          if (typeof wpCalculateAndRenderInverterCables === 'function') wpCalculateAndRenderInverterCables();
          if (typeof wpUpdateCableRoutesUI === 'function') wpUpdateCableRoutesUI();
          renderTriad2D();
          if (typeof showStatus === 'function') {
            showStatus('CODO ' + hitRouteHandle.type.toUpperCase() + ' #' + (hitRouteHandle.index + 1) + ' SELECCIONADO · ARRASTRA GIZMO (Shift: Ortogonal 90° | Supr/Doble clic: Quitar)', 3000);
          }
          return;
        }
      }

      // 2B. Vértice de Polilínea / Faldón (Activa o Visibles)
      if (typeof WP !== 'undefined' && WP && Array.isArray(WP.polylines) && WP.polylines.length > 0) {
        // Primero verificar si hay una entidad 3D explícita de vértice guardado
        if (pickedObj && pickedObj.id && typeof pickedObj.id.id === 'string' && pickedObj.id.id.startsWith('wp_saved_vtx_')) {
          const parts = pickedObj.id.id.replace('wp_saved_vtx_', '').split('_');
          const pIdx = parseInt(parts[0], 10);
          const vIdx = parseInt(parts[1], 10);
          if (!isNaN(pIdx) && !isNaN(vIdx)) {
            if (WP.polylines[pIdx] && WP.polylines[pIdx].visible !== false) {
              if (WP.selectedPolyIdx !== pIdx) wpSelectPolyline(pIdx);
              wpSelectVertex(vIdx);
              return;
            }
          }
        }

        // Imán de proximidad unificado (20px) sobre vértices de faldón
        let nearestPolyIdx = -1;
        let nearestVtxIdx = -1;
        let minVtxDist = 20.0;

        const searchList = (typeof WP.selectedPolyIdx === 'number' && WP.selectedPolyIdx >= 0 && WP.polylines[WP.selectedPolyIdx])
          ? [ { poly: WP.polylines[WP.selectedPolyIdx], pIdx: WP.selectedPolyIdx } ]
          : WP.polylines.map((p, i) => ({ poly: p, pIdx: i }));

        for (const item of searchList) {
          const poly = item.poly;
          if (!poly || poly.visible === false || !Array.isArray(poly.points)) continue;
          for (let vi = 0; vi < poly.points.length; vi++) {
            const pt = poly.points[vi];
            if (!pt) continue;
            const pWin = Cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, pt);
            if (pWin) {
              const d = Math.hypot(click.position.x - pWin.x, click.position.y - pWin.y);
              if (d <= minVtxDist) {
                minVtxDist = d;
                nearestPolyIdx = item.pIdx;
                nearestVtxIdx = vi;
              }
            }
          }
          if (nearestVtxIdx >= 0) break;
        }

        if (nearestVtxIdx >= 0 && nearestPolyIdx >= 0) {
          if (WP.selectedPolyIdx !== nearestPolyIdx) wpSelectPolyline(nearestPolyIdx);
          wpSelectVertex(nearestVtxIdx);
          return;
        }
      }

      // 2C. Vértice de Huella de Edificio (Base o Alero)
      let hitBldVtx = null;
      if (pickedObj && pickedObj.id) {
        const pIdStr = (typeof pickedObj.id === 'string') ? pickedObj.id : (typeof pickedObj.id.id === 'string' ? pickedObj.id.id : '');
        if (pIdStr.startsWith('bld_vtx_handle_')) {
          const parts = pIdStr.replace('bld_vtx_handle_', '').split('_');
          const vi = parseInt(parts.pop(), 10);
          const bId = parts.join('_');
          const targetB = Array.isArray(buildings) ? buildings.find(b => b.id === bId) : null;
          if (targetB && targetB.visible !== false) {
            hitBldVtx = { bldId: bId, vtxIdx: vi };
          }
        }
      }
      if (!hitBldVtx && Array.isArray(buildings) && buildings.length > 0) {
        let closestDist = 20.0;
        const bldList = selectedBuildingId ? [buildings.find(b => b.id === selectedBuildingId)].filter(Boolean) : buildings;
        for (const b of bldList) {
          if (!b.points || b.visible === false) continue;
          const bH = b.height || 6.0;
          for (let vi = 0; vi < b.points.length; vi++) {
            const ptBase = b.points[vi];
            if (!ptBase) continue;
            const wPosBase = Cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, ptBase);
            if (wPosBase) {
              const d = Math.hypot(click.position.x - wPosBase.x, click.position.y - wPosBase.y);
              if (d <= closestDist) {
                closestDist = d;
                hitBldVtx = { bldId: b.id, vtxIdx: vi };
              }
            }
            const c = Cesium.Cartographic.fromCartesian(ptBase);
            if (c) {
              const ptRoof = Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, c.height + bH);
              const wPosRoof = Cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, ptRoof);
              if (wPosRoof) {
                const dRoof = Math.hypot(click.position.x - wPosRoof.x, click.position.y - wPosRoof.y);
                if (dRoof <= closestDist) {
                  closestDist = dRoof;
                  hitBldVtx = { bldId: b.id, vtxIdx: vi };
                }
              }
            }
          }
          if (hitBldVtx) break;
        }
      }
      if (hitBldVtx) {
        if (selectedBuildingId !== hitBldVtx.bldId) selectBuilding(hitBldVtx.bldId);
        selectBuildingVertex(hitBldVtx.vtxIdx);
        return;
      }
    }

    // ── NIVEL 3: OBJETOS COMPACTOS (PANELES, AEROGENERADORES, EQUIPOS ELÉCTRICOS, OBSTÁCULOS)
    // 3A. Paneles Solares FV
    if (filter === 'all' || filter === 'panels') {
      const panelIdx = (typeof pickPanelUnderCursor === 'function')
        ? pickPanelUnderCursor(click.position)
        : getPanelIndexFromPick(pickedObj);
      if (panelIdx >= 0) {
        if (typeof selectObstacle === 'function') selectObstacle(null);
        if (typeof selectElectricalObject === 'function') selectElectricalObject(null);
        const isShift = !!(window._raIsShiftDown || (typeof window.event !== 'undefined' && window.event && window.event.shiftKey));
        const pickedPan = (Array.isArray(window.allRenderedPanels) && window.allRenderedPanels[panelIdx]) ? window.allRenderedPanels[panelIdx] : null;

        if (pickedPan && pickedPan.isGhost) {
          if (typeof wpToggleGhostPanel === 'function') {
            wpToggleGhostPanel(panelIdx);
            showToast('PLACA INCORPORADA', 'Módulo activado e integrado en la instalación (CEL-Ready)', 'success', 2500);
            return;
          }
        }

        selectPanel(panelIdx, isShift);
        renderTriad2D();
        const count = (window.selectedPanelIndices && window.selectedPanelIndices.length) || 1;
        const isDis = pickedPan && pickedPan.disabled;
        const statusText = isDis
          ? `MÓDULO FV #${panelIdx + 1} (DESACTIVADO · Excluido de mediciones y presupuesto)`
          : (count > 1 ? `${count} MÓDULOS FV SELECCIONADOS (Shift+Clic para añadir/quitar)` : ('MÓDULO FV #' + (panelIdx + 1) + ' SELECCIONADO'));
        showStatus(statusText, 2500);
        return;
      }
    }

    // 3B. Aerogeneradores 3D (RA-Wind)
    if (filter === 'all' && pickedObj && window.RAWind && window.RAWind.Entity && Array.isArray(window.windTurbines) && window.windTurbines.length > 0) {
      let wtHitId = null;
      if (pickedObj.primitive && pickedObj.primitive._windTurbineId) {
        wtHitId = pickedObj.primitive._windTurbineId;
      } else {
        const pIdStr = (typeof pickedObj.id === 'string') ? pickedObj.id : (pickedObj.id && typeof pickedObj.id.id === 'string' ? pickedObj.id.id : '');
        if (pIdStr && pIdStr.startsWith('wt_')) {
          const foundWt = window.windTurbines.find(t => t && pIdStr.endsWith('_' + t.id));
          if (foundWt) wtHitId = foundWt.id;
        }
      }
      if (wtHitId) {
        if (selectedPanelIndex >= 0) selectPanel(-1);
        if (typeof selectElectricalObject === 'function') selectElectricalObject(null);
        if (typeof selectObstacle === 'function') selectObstacle(null);
        if (window.RAWindUI && typeof window.RAWindUI.selectTurbineForInspect === 'function') {
          window.RAWindUI.selectTurbineForInspect(wtHitId);
        } else if (window.RAWindVisualizer && typeof window.RAWindVisualizer.selectTurbine === 'function') {
          window.RAWindVisualizer.selectTurbine(wtHitId);
        }
        renderTriad2D();
        return;
      }
    }

    // 3C. Equipos Eléctricos 3D
    if (filter === 'all') {
      const clickedElec = pickElectricalObjectUnderCursor(click.position);
      if (clickedElec) {
        if (typeof selectObstacle === 'function') selectObstacle(null);
        if (typeof selectPanel === 'function') selectPanel(-1);
        selectElectricalObject(clickedElec.id);
        return;
      }
    }

    // 3D. Obstáculos 3D
    if (filter === 'all' || filter === 'obstacles') {
      const clickedObs = pickObstacleUnderCursor(click.position);
      if (clickedObs) {
        if (selectedPanelIndex >= 0) selectPanel(-1);
        if (typeof selectElectricalObject === 'function') selectElectricalObject(null);
        if (typeof WP !== 'undefined' && WP) { WP.selectedVtxIdx = -1; }
        if (typeof selectedVertexIndex !== 'undefined') { selectedVertexIndex = -1; }
        if (typeof wpSyncVertexInputs === 'function') { wpSyncVertexInputs(); }
        selectObstacle(clickedObs.id);
        renderTriad2D();
        return;
      }
    }

    // ── NIVEL 4: SUPERFICIES Y CONTORNOS (POLILÍNEAS / FALDONES Y PLANOS DE TRABAJO)
    if (filter === 'all' || filter === 'polylines') {
      // 4A. Polilínea / Faldón por entidad 3D guardada (relleno o borde)
      if (pickedObj && pickedObj.id && typeof pickedObj.id.id === 'string') {
        const entId = pickedObj.id.id;
        if (entId.startsWith('wp_poly_fill_') || entId.startsWith('wp_poly_line_')) {
          const prefix = entId.startsWith('wp_poly_fill_') ? 'wp_poly_fill_' : 'wp_poly_line_';
          const pIdx = parseInt(entId.replace(prefix, '').split('_')[0], 10);
          if (!isNaN(pIdx) && WP && WP.polylines && WP.polylines[pIdx] && WP.polylines[pIdx].visible !== false) {
            wpSelectPolyline(pIdx);
            return;
          }
        }
      }
      // 4B. Polilínea por test de polígono 2D en pantalla
      const isPointPolyFunc = (typeof isPointIn2DPolygon === 'function') ? isPointIn2DPolygon : (window.isPointIn2DPolygon || null);
      if (isPointPolyFunc && WP && Array.isArray(WP.polylines)) {
        for (let pi = 0; pi < WP.polylines.length; pi++) {
          const poly = WP.polylines[pi];
          if (!poly || poly.visible === false || !Array.isArray(poly.points) || poly.points.length < 3) continue;
          const scrPts = poly.points.map(p => Cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, p)).filter(Boolean);
          if (scrPts.length >= 3 && isPointPolyFunc(click.position, scrPts)) {
            wpSelectPolyline(pi);
            return;
          }
        }
      }
    }

    // 4C. Superficie o borde del Plano de Trabajo Activo
    const curStepForPlane = (typeof wpCurrentStep !== 'undefined') ? wpCurrentStep : ((typeof window !== 'undefined' && window.wpCurrentStep) || 1);
    if (filter === 'all' && curStepForPlane === 1 && typeof WP !== 'undefined' && WP && typeof wpGetActivePlane === 'function') {
      const actPl = wpGetActivePlane();
      if (actPl && actPl.visible !== false && pickedObj && pickedObj.id) {
        const pId = (typeof pickedObj.id === 'string') ? pickedObj.id : (typeof pickedObj.id.id === 'string' ? pickedObj.id.id : '');
        if (pId === 'wp_active_plane_border') {
          if (typeof clearAllCADSelection === 'function') clearAllCADSelection(false);
          renderTriad2D();
          showStatus('<i data-lucide="compass" class="icon-sm"></i> ' + (actPl.name || 'PLANO DE TRABAJO').toUpperCase() + ' SELECCIONADO', 2000);
          return;
        }
      }
    }

    // ── NIVEL 5: VOLÚMENES ARQUITECTÓNICOS (EDIFICIOS COMPLETOS)
    if (filter === 'all') {
      const activeStep = (typeof wpCurrentStep !== 'undefined')
        ? wpCurrentStep
        : ((typeof window !== 'undefined' && typeof window.wpCurrentStep !== 'undefined')
          ? window.wpCurrentStep
          : ((typeof WP !== 'undefined' && WP && typeof WP.step !== 'undefined') ? WP.step : 1));
      let clickedBld = null;
      if (activeStep <= 1) {
        if (pickedObj) {
          const pId = (typeof pickedObj.id === 'string') ? pickedObj.id : (pickedObj.id && typeof pickedObj.id.id === 'string' ? pickedObj.id.id : '');
          if (pId) {
            clickedBld = buildings.find(b => (pId.startsWith(b.id) || pId.includes(b.id)) && b.visible !== false);
          }
        }
        if (!clickedBld) {
          const clickPos3D = (typeof get3DPosition === 'function') ? get3DPosition(click.position) : null;
          if (clickPos3D && typeof findBuildingUnderPosition === 'function') {
            clickedBld = findBuildingUnderPosition(clickPos3D);
          }
        }
      }
      if (clickedBld && typeof WP !== "undefined" && WP && WP.mode !== "draw-poly" && WP.mode !== "define-plane" && WP.mode !== "place-obs") {
        if (typeof selectObstacle === 'function') selectObstacle(null);
        if (typeof selectPanel === 'function') selectPanel(-1);
        if (typeof selectElectricalObject === 'function') selectElectricalObject(null);
        selectBuilding(clickedBld.id);
        if (typeof setStep === 'function') setStep(0);
        showToast('EDIFICIO SELECCIONADO', clickedBld.name + ' (' + clickedBld.height + 'm de altura)', 'info', 2500);
        return;
      }
    }

    // ── NIVEL 6: ESPACIO VACÍO (DESELECCIÓN LIMPIA Y GARANTIZADA)
    // Se ejecuta única y exclusivamente si ningún nivel previo atrapó nada y no hay interacción con gizmo
    const hitGizmoAtEnd = (typeof checkUniversalGizmoHit === 'function') ? checkUniversalGizmoHit(click.position.x, click.position.y) : null;
    if (!hitGizmoAtEnd && typeof clearAllCADSelection === 'function') {
      clearAllCADSelection(true);
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  // Cancelar modo estampar con clic derecho
  handler.setInputAction(function() {
    if (typeof window.RAMeasureTool !== 'undefined' && window.RAMeasureTool && typeof window.RAMeasureTool.isActive === 'function' && window.RAMeasureTool.isActive()) {
      return;
    }
    if (typeof WP !== 'undefined' && WP && WP.mode === 'stamp-poly') {
      if (typeof wpCancelStampPolyline === 'function') wpCancelStampPolyline();
    }
  }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
  // --- DIRTY FLAG / RAF PATTERN PARA GIZMO (60 FPS LOCK) ---
  let _isGizmoDirty = false;
  let _pendingGizmoUpdate = null;
  function flushGizmoUpdate() {
    if (!_isGizmoDirty || !_pendingGizmoUpdate) return;
    const p = _pendingGizmoUpdate;
    updateUniversalTargetTransform(p.target, p.newPos, p.newRotDeg, p.deltaDeg, p.rotAxis);
    _isGizmoDirty = false;
    _pendingGizmoUpdate = null;
    if (window.LiveSolarProbe && window.LiveSolarProbe.enabled) {
      window.LiveSolarProbe.evaluate();
    }
  }
  function queueGizmoUpdate(target, newPos, newRotDeg, deltaDeg, rotAxis) {
    _pendingGizmoUpdate = { target, newPos, newRotDeg, deltaDeg, rotAxis };
    if (!_isGizmoDirty) {
      _isGizmoDirty = true;
      requestAnimationFrame(flushGizmoUpdate);
    }
  }

  // --- DIRTY FLAG PARA CURSOR CAD Y EDIFICIOS (60 FPS) ---
  let _isCursorDirty = false;
  let _cursorUpdateData = null;
  function flushCursorUpdate() {
    if (!_isCursorDirty || !_cursorUpdateData) return;
    const d = _cursorUpdateData;
    
    if (d.isDrawingBuilding) {
      let cPos = (typeof get3DPosition === 'function') ? get3DPosition(d.endPos) : null;
      if (typeof WP !== 'undefined' && WP && WP.mode === 'draw-building-rect') {
        if (typeof updateBuildingRectPreview === 'function' && cPos) {
          updateBuildingRectPreview(cPos);
        }
      } else {
        if (cPos && typeof getOrthogonalSnap === 'function') cPos = getOrthogonalSnap(cPos, activeBuildingPts);
        if (cPos && typeof activeBuildingPts !== 'undefined' && activeBuildingPts.length >= 2) {
          const p0Screen = Cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, activeBuildingPts[0]);
          if (p0Screen && Math.hypot(d.endPos.x - p0Screen.x, d.endPos.y - p0Screen.y) <= 45) {
            cPos = Cesium.Cartesian3.clone(activeBuildingPts[0]);
          }
        }
        window._bldCursorPos = cPos;
        if (scene && typeof scene.requestRender === 'function') scene.requestRender();
      }
    }

    if (typeof updateTriadAtMouse === 'function') {
      updateTriadAtMouse(d.endPos.x, d.endPos.y, scene.canvas);
    }

    const isDrawingPoly = (typeof WP !== 'undefined' && WP && WP.mode === 'draw-poly');
    if (isDrawingPoly && scene && typeof scene.requestRender === 'function') {
      scene.requestRender();
    }

    _isCursorDirty = false;
    _cursorUpdateData = null;
  }
  
  function queueCursorUpdate(endPos, isDrawingBuilding) {
    _cursorUpdateData = { endPos, isDrawingBuilding };
    if (!_isCursorDirty) {
      _isCursorDirty = true;
      requestAnimationFrame(flushCursorUpdate);
    }
  }

  // 3. MOVIMIENTO DEL RATÓN: Arrastre interactivo de Gizmos, Órbita de Cámara y HUD
  handler.setInputAction(movement => {
    // 🌟 BYPASS CINTA MÉTRICA 3D: Si la herramienta de medición está activa, ceder control exclusivo
    if (typeof window.RAMeasureTool !== 'undefined' && window.RAMeasureTool && typeof window.RAMeasureTool.isActive === 'function' && window.RAMeasureTool.isActive()) {
      return;
    }

    _triadMouseX = movement.endPosition.x;
    _triadMouseY = movement.endPosition.y;

    // <i data-lucide=\"rocket\" class=\"icon-sm\"></i> THROTTLE GPU: limitar eventos de movimiento a ~30 FPS para evitar saturación de gl.readPixels
    if (!universalGizmoState.active) {
      if (window._isCameraMoving || window._isPointerButtonsDown) {
        return; // Durante el giro/paneo de cámara no ejecutar hover ni raycasts secundarios
      }
      const _nowMs = Date.now();
      if (_nowMs - _lastPickTime < _PICK_THROTTLE_MS) {
        return; // frame demasiado próximo: skip para mantener 60 FPS estables
      }
      _lastPickTime = _nowMs;
      if (window.RA && window.RA.perf && window.RA.perf.enabled) window.RA.perf.pickCount++;
    }

    // 🌟 ARRASTRE Y ROTACIÓN DEL GIZMO UNIVERSAL UNIFICADO
    if (universalGizmoState.active && universalGizmoState.mode) {
      if (universalGizmoState.startMouse) {
        const _dMouse = Math.hypot(movement.endPosition.x - universalGizmoState.startMouse.x, movement.endPosition.y - universalGizmoState.startMouse.y);
        if (_dMouse > 3) universalGizmoState.wasDragging = true;
      }
      const uTarget = getUniversalSelectedTarget();
      if (uTarget && universalGizmoState.startPos) {
        const s = universalGizmoState.screen;

        // A. MODO ROTACIÓN (3 Anillos Ortogonales 3D: U, V, Z)
        const isRotateMode = (
          universalGizmoState.mode === 'rotate-ring' ||
          universalGizmoState.mode === 'rotate-z' ||
          universalGizmoState.mode === 'rotate-u' ||
          universalGizmoState.mode === 'rotate-v'
        );

        // 0. MODO TIRADOR 3D DE ÁNGULO EN EDIFICIOS PARAMÉTRICOS EN L (45°-165°)
        if (universalGizmoState.mode === 'l-angle-drag' && s && s.lAngleHandle && uTarget && uTarget.rawObj && window.RALBuilding) {
          const lh = s.lAngleHandle;
          let hitPt = null;
          if (viewer && viewer.camera && typeof wpRayPlane === 'function' && lh.cornerPos) {
            try {
              const ray = viewer.camera.getPickRay(movement.endPosition);
              const upNorm = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(lh.cornerPos, new Cesium.Cartesian3());
              if (ray) hitPt = wpRayPlane(ray, { origin: lh.cornerPos, normal: upNorm });
            } catch (_) {}
          }
          if (!hitPt) hitPt = get3DPosition(movement.endPosition);
          if (hitPt && lh.cornerPos && lh.wingAPos) {
            const c0 = Cesium.Cartographic.fromCartesian(lh.cornerPos);
            const cA = Cesium.Cartographic.fromCartesian(lh.wingAPos);
            const cH = Cesium.Cartographic.fromCartesian(hitPt);
            if (c0 && cA && cH) {
              const cosLat = Math.cos(c0.latitude) || 1;
              const ax = (cA.longitude - c0.longitude) * cosLat;
              const ay = cA.latitude - c0.latitude;
              const hx = (cH.longitude - c0.longitude) * cosLat;
              const hy = cH.latitude - c0.latitude;
              if (Math.hypot(ax, ay) > 1e-9 && Math.hypot(hx, hy) > 1e-9) {
                const cross = ax * hy - ay * hx;
                const dot = ax * hx + ay * hy;
                const signedSide = (uTarget.rawObj.lParams && uTarget.rawObj.lParams.mirrored) ? -1 : 1;
                let deg = Cesium.Math.toDegrees(Math.atan2(cross * signedSide, dot));
                if (deg < 0) deg += 360;
                deg = Math.max(45, Math.min(165, deg));
                const isShiftAng = !!(window._raIsShiftDown || (typeof window.event !== 'undefined' && window.event && window.event.shiftKey));
                if (isShiftAng) deg = Math.round(deg / 5) * 5;
                else deg = Math.round(deg);
                window.RALBuilding.updateFromParams(uTarget.rawObj, { angleDeg: deg }, { skipRender: true });
                window.RALBuilding.syncInspectorUI(uTarget.rawObj);
              }
            }
          }
        }
        // A. MODO ROTACIÓN (3 Anillos Ortogonales 3D: U, V, Z)
        else if (isRotateMode && s) {
          const dx = movement.endPosition.x - s.ox;
          const dy = movement.endPosition.y - s.oy;
          const currentAngleRad = Math.atan2(-dy, dx);
          let deltaDeg = Cesium.Math.toDegrees(currentAngleRad - universalGizmoState.startAngleRad);
          let newRot = ((universalGizmoState.startRot + deltaDeg) % 360 + 360) % 360;

          const isShift = !!(window._raIsShiftDown || (typeof window.event !== 'undefined' && window.event && window.event.shiftKey) || (movement && movement.shiftKey));
          if (isShift) {
            newRot = Math.round(newRot / 15) * 15;
            deltaDeg = newRot - universalGizmoState.startRot;
          }

          let rotAxis = null;
          if (universalGizmoState.mode === 'rotate-u') {
            rotAxis = universalGizmoState.startUVec || (s && s.uVec) || new Cesium.Cartesian3(1, 0, 0);
          } else if (universalGizmoState.mode === 'rotate-v') {
            rotAxis = universalGizmoState.startVVec || (s && s.vVec) || new Cesium.Cartesian3(0, 1, 0);
          } else {
            // rotate-z o rotate-ring (Yaw)
            rotAxis = universalGizmoState.startZVec || (s && s.zVec) || (uTarget.wp && uTarget.wp.normal) || new Cesium.Cartesian3(0, 0, 1);
          }

          queueGizmoUpdate(uTarget, null, newRot, deltaDeg, rotAxis);
        }
        // B. MODO TRASLACIÓN Y ARRASTRE (Centroide, U, V, Z)
        else {
          let newPos = null;
          const activeWp = (typeof wpGetActivePlane === 'function' ? wpGetActivePlane() : null);
          // Para vértices de edificio usar SIEMPRE su plano ENU local (arrastre libre 3D real)
          const _isBldVtx = (uTarget && (uTarget.subType === 'building_vertex' || (uTarget.type === 'vertex' && uTarget.id && uTarget.id.indexOf('bld_vtx_') === 0)));
          const wp = (_isBldVtx || (uTarget && uTarget.type === 'obstacle')) ? (uTarget ? uTarget.wp : null) : (activeWp || universalGizmoState.wp || (uTarget ? uTarget.wp : null));

          // Ejes de referencia ortonormales locales intrínsecos del objeto (Object Space AAA)
          const uVec = (universalGizmoState.startUVec) || (s && s.uVec) || ((wp && wp.uVec) ? wp.uVec : new Cesium.Cartesian3(1, 0, 0));
          const vVec = (universalGizmoState.startVVec) || (s && s.vVec) || ((wp && wp.vVec) ? wp.vVec : new Cesium.Cartesian3(0, 1, 0));
          const zVec = (universalGizmoState.startZVec) || (s && s.zVec) || ((wp && wp.normal) ? wp.normal : new Cesium.Cartesian3(0, 0, 1));
          const armLen = (s && s.armLen) ? s.armLen : 4.0;

          if (universalGizmoState.mode === 'center-drag') {
            if (wp && wp.plane && viewer && viewer.camera) {
              try {
                const ray = viewer.camera.getPickRay(movement.endPosition);
                if (ray) newPos = wpRayPlane(ray, wp.plane);
              } catch(eRay) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(eRay, 'Entidad/Primitiva Cesium'); }
            }
            if (!newPos) {
              newPos = (typeof get3DElectricalClickPosition === 'function' ? get3DElectricalClickPosition(movement.endPosition) : null) || get3DPosition(movement.endPosition);
            }
          } else if (s) {
            const mouseDx = movement.endPosition.x - universalGizmoState.startMouse.x;
            const mouseDy = movement.endPosition.y - universalGizmoState.startMouse.y;

            if (universalGizmoState.mode === 'u-axis' && s.pU) {
              const duX = s.pU.x - s.ox, duY = s.pU.y - s.oy;
              const lenU2 = duX * duX + duY * duY;
              const proj = (mouseDx * duX + mouseDy * duY) / (lenU2 || 1);
              const effArm = s.armLenU || armLen;
              newPos = Cesium.Cartesian3.add(universalGizmoState.startPos, Cesium.Cartesian3.multiplyByScalar(uVec, proj * effArm, new Cesium.Cartesian3()), new Cesium.Cartesian3());
            } else if (universalGizmoState.mode === 'v-axis' && s.pV) {
              const dvX = s.pV.x - s.ox, dvY = s.pV.y - s.oy;
              const lenV2 = dvX * dvX + dvY * dvY;
              const proj = (mouseDx * dvX + mouseDy * dvY) / (lenV2 || 1);
              const effArm = s.armLenV || armLen;
              newPos = Cesium.Cartesian3.add(universalGizmoState.startPos, Cesium.Cartesian3.multiplyByScalar(vVec, proj * effArm, new Cesium.Cartesian3()), new Cesium.Cartesian3());
            } else if (universalGizmoState.mode === 'z-axis' && s.pZ) {
              const dzX = s.pZ.x - s.ox, dzY = s.pZ.y - s.oy;
              const lenZ2 = dzX * dzX + dzY * dzY;
              const proj = (mouseDx * dzX + mouseDy * dzY) / (lenZ2 || 1);
              const effArm = s.armLenZ || armLen;
              newPos = Cesium.Cartesian3.add(universalGizmoState.startPos, Cesium.Cartesian3.multiplyByScalar(zVec, proj * effArm, new Cesium.Cartesian3()), new Cesium.Cartesian3());
            }
          }

          if (newPos) {
            queueGizmoUpdate(uTarget, newPos, null, null, null);
          }
        }
      }
      renderTriad2D();
      if (scene && typeof scene.requestRender === 'function') {
        scene.requestRender();
      }
      return;
    }

    // Hover sobre Gizmo Universal
    const uHit = checkUniversalGizmoHit(movement.endPosition.x, movement.endPosition.y);
    universalGizmoState.hoveredPart = uHit;
    if (uHit) {
      if (uHit === 'badge-toggle') {
        scene.canvas.style.cursor = 'pointer';
      } else if (uHit.startsWith('rotate-')) {
        scene.canvas.style.cursor = 'crosshair';
      } else {
        scene.canvas.style.cursor = 'move';
      }
      renderTriad2D();
      return;
    }

    // Colocación interactiva de nuevo obstáculo (Ghost preview)
    if (typeof obsPlacement !== 'undefined' && obsPlacement && obsPlacement.active) {
      obsPlacement.lastX = movement.endPosition.x;
      obsPlacement.lastY = movement.endPosition.y;
      if (typeof obsRenderGhost === 'function') obsRenderGhost();
      if (scene && scene.canvas) scene.canvas.style.cursor = 'crosshair';
      return;
    }

    // Previsualización en tiempo real del faldón en modo Estampar
    if (typeof WP !== 'undefined' && WP && WP.mode === 'stamp-poly') {
      const pos3D = get3DPosition(movement.endPosition);
      if (Cesium.defined(pos3D) && typeof wpUpdateStampPolylinePreview === 'function') {
        wpUpdateStampPolylinePreview(pos3D);
      }
      if (scene && scene.canvas) scene.canvas.style.cursor = 'crosshair';
      return;
    }

    // Cursor estándar de navegación vs Cursor CAD / Dibujo de edificio / Trazado de canalizaciones
    const isDefiningPlane = (typeof WP !== 'undefined' && WP && WP.mode === 'define-plane');
    const isDrawingBuilding = (typeof WP !== 'undefined' && WP && (WP.mode === 'draw-building' || WP.mode === 'draw-building-rect'));
    const isDrawingPoly = (typeof WP !== 'undefined' && WP && WP.mode === 'draw-poly');
    const isRoutingCable = (typeof window.cableRoutingState !== 'undefined' && window.cableRoutingState && window.cableRoutingState.active);
    if (scene && scene.canvas) {
      if (!isDrawingPoly || scene.canvas.style.cursor !== 'pointer') {
        scene.canvas.style.cursor = (isDefiningPlane || isDrawingBuilding || isDrawingPoly || isRoutingCable) ? 'crosshair' : 'default';
      }
    }


    // --- ACTUALIZACIÓN DE CURSOR CAD Y EDIFICIOS (60 FPS THROTTLED) ---
    if (isDrawingBuilding || typeof updateTriadAtMouse === 'function') {
      queueCursorUpdate(movement.endPosition, isDrawingBuilding);
    }


    // Inspección interactiva on-hover de módulos solares (Zero Clutter)
    if (typeof handleHeatmapPanelHover === 'function') {
      handleHeatmapPanelHover(movement.endPosition);
    }
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

  // Redibujar en cada frame de cámara (postRender consolidado)
  scene.postRender.addEventListener(() => {
    if (window.RA && window.RA.perf && window.RA.perf.enabled) window.RA.perf.frameCount++;
    renderTriad2D();
  });

  // 4. LEFT_UP: Soltar arrastre y recalcular
  handler.setInputAction(() => {
    if (typeof window.RAMeasureTool !== 'undefined' && window.RAMeasureTool && typeof window.RAMeasureTool.isActive === 'function' && window.RAMeasureTool.isActive()) {
      return;
    }
    // 🛡️ WATCHDOG DE CÁMARA CAD AAA: Asegura que el paneo y la navegación jamás queden congelados tras un clic/soltar
    if (scene && scene.screenSpaceCameraController && !universalGizmoState.active) {
      if (!scene.screenSpaceCameraController.enableTranslate || !scene.screenSpaceCameraController.enableRotate) {
        scene.screenSpaceCameraController.enableRotate = true;
        scene.screenSpaceCameraController.enableTranslate = true;
        scene.screenSpaceCameraController.enableZoom = true;
        scene.screenSpaceCameraController.enableTilt = true;
      }
    }
    if (universalGizmoState.active) {
      if (typeof flushGizmoUpdate === 'function') {
        flushGizmoUpdate();
      }
      const draggedTargetType = universalGizmoState.targetType;
      const _prevGizmoMode = universalGizmoState.mode;
      const _gizmoWasDragging = !!universalGizmoState.wasDragging;
      universalGizmoState.active = false;
      universalGizmoState.mode = null;
      if (scene && scene.screenSpaceCameraController) {
        scene.screenSpaceCameraController.enableRotate = true;
        scene.screenSpaceCameraController.enableTranslate = true;
        scene.screenSpaceCameraController.enableTilt = true;
        scene.screenSpaceCameraController.enableLook = false;
        scene.screenSpaceCameraController.enableZoom = true;
        scene.screenSpaceCameraController.rotateEventTypes = [ Cesium.CameraEventType.LEFT_DRAG ];
      }
      renderTriad2D();

      let _draggedPanelId = null;
      let _affectedPanelIds = [];
      if (draggedTargetType === 'polyline') {
        const movedIdx = (typeof universalGizmoState.movePolyIdx === 'number') ? universalGizmoState.movePolyIdx : WP.movePolyGizmoIdx;
        const movedPoly = (typeof WP !== 'undefined' && WP && Array.isArray(WP.polylines) && movedIdx >= 0) ? WP.polylines[movedIdx] : null;
        if (movedPoly) {
          if (typeof computeSinglePolylineRoofInfo === 'function') {
            try {
              movedPoly.roofInfo = computeSinglePolylineRoofInfo(movedPoly.points, movedPoly);
              if (movedPoly.roofInfo && Array.isArray(movedPoly.roofInfo.panels)) movedPoly.panels = movedPoly.roofInfo.panels;
            } catch (ePolyMove) {}
          }
          if (typeof polygonPoints !== 'undefined') polygonPoints = movedPoly.points.map(p => Cesium.Cartesian3.clone(p));
        }
        universalGizmoState.movePolyObs = null;
        if (typeof wpRenderAllPolylines === 'function') wpRenderAllPolylines();
        if (typeof roofPanelsCache !== 'undefined' && roofPanelsCache) roofPanelsCache.sig = "";
        if (typeof window.wpInvalidateHeatmap === 'function' && movedPoly) window.wpInvalidateHeatmap('Faldón desplazado: ' + (movedPoly.name || 'Faldón'));
        if (typeof recalculateLayoutAndObstacles === 'function' && movedIdx >= 0) recalculateLayoutAndObstacles(movedIdx);
        if (typeof wpFastRenderSimulatedPanels === 'function' && movedIdx >= 0) wpFastRenderSimulatedPanels(true, movedIdx);
        if (typeof recalculateSolarYield === 'function') recalculateSolarYield(true);
        if (typeof wpUpdateLayoutFastMetrics === 'function') wpUpdateLayoutFastMetrics();
        if (typeof wpPopulateFaldonCard === 'function') wpPopulateFaldonCard();
        if (typeof wpUpdateStep3UI === 'function') wpUpdateStep3UI();
        if (typeof showStatus === 'function') showStatus('<i data-lucide="check" class="icon-sm"></i> FALDÓN DESPLAZADO CON GIZMO', 2500);
      } else if (draggedTargetType === 'workplane') {
        if (typeof wpRenderActivePlaneGizmo === 'function') wpRenderActivePlaneGizmo();
        if (typeof wpRenderAllPolylines === 'function') wpRenderAllPolylines();
        if (typeof window.wpInvalidateHeatmap === 'function') window.wpInvalidateHeatmap('Plano de trabajo transformado');
        if (typeof showStatus === 'function') showStatus('<i data-lucide="compass" class="icon-sm"></i> PLANO DE TRABAJO TRANSFORMADO CON ÉXITO', 2500);
      } else if (draggedTargetType === 'workplane_vertex') {
        if (typeof wpRenderActivePlaneGizmo === 'function') wpRenderActivePlaneGizmo();
        if (typeof wpRenderAllPolylines === 'function') wpRenderAllPolylines();
        if (typeof window.wpInvalidateHeatmap === 'function') window.wpInvalidateHeatmap('Vértice de plano de trabajo modificado');
        if (typeof showStatus === 'function') showStatus('<i data-lucide="check" class="icon-sm"></i> VÉRTICE DEL PLANO ACTUALIZADO CON ÉXITO', 2500);
      } else if (draggedTargetType === 'vertex') {
        if (typeof wpRenderAllPolylines === 'function') wpRenderAllPolylines();
        if (typeof render3DBuildingsInCesium === 'function') render3DBuildingsInCesium();
        if (typeof updateBuildingFootprintUI === 'function') updateBuildingFootprintUI();
        if (typeof window.wpInvalidateHeatmap === 'function') window.wpInvalidateHeatmap('Vértice desplazado (faldón o edificio)');
      } else if (draggedTargetType === 'building') {
        if (typeof render3DBuildingsInCesium === 'function') render3DBuildingsInCesium();
        if (typeof window.wpInvalidateHeatmap === 'function') window.wpInvalidateHeatmap('Edificio desplazado');
      } else if (draggedTargetType === 'obstacle') {
        if (typeof recalculateLayoutAndObstacles === 'function') recalculateLayoutAndObstacles();
        if (typeof window.wpInvalidateHeatmap === 'function') window.wpInvalidateHeatmap('Obstáculo movido');
        if (window.RAWind && window.RAWind.Entity && typeof window.RAWind.Entity.recalculateAllEngineering === 'function') {
          window.RAWind.Entity.recalculateAllEngineering();
          if (window.RAWindUI && typeof window.RAWindUI.renderStep2Panel === 'function') {
            window.RAWindUI.renderStep2Panel();
          }
          if (window.RAWindVisualizer && typeof window.RAWindVisualizer.renderAll === 'function') {
            window.RAWindVisualizer.renderAll();
          }
        }
      } else if (draggedTargetType === 'wind_turbine_entity') {
        if (window.RAWind && window.RAWind.Entity) {
          window.RAWind.Entity.recalculateAllEngineering();
          if (window.RAWindUI && typeof window.RAWindUI.renderStep2Panel === 'function') {
            window.RAWindUI.renderStep2Panel();
          }
        }
      } else if (draggedTargetType === 'panel') {
        // [Option A] Traslación manual de panel / multi-panel: persistir en arrays y dejar que wpFastRender reconstruya el batch.
        const _cloneCorners = function(corners) { return corners.map(function(c) { return Cesium.Cartesian3.clone(c); }); };
        const _affectedIndices = (Array.isArray(window.selectedPanelIndices) && window.selectedPanelIndices.length > 0)
          ? window.selectedPanelIndices
          : ((typeof selectedPanelIndex !== 'undefined' && selectedPanelIndex >= 0) ? [selectedPanelIndex] : []);

        const panelsArr = (window.allRenderedPanels && window.allRenderedPanels.length > 0)
          ? window.allRenderedPanels
          : (typeof lastRoofInfo !== 'undefined' && lastRoofInfo ? lastRoofInfo.panels : null);

        _affectedIndices.forEach(pIdx => {
          const _dp = (panelsArr && pIdx >= 0 && pIdx < panelsArr.length) ? panelsArr[pIdx] : null;
          if (!_dp) return;
          if (_dp.panelId) _affectedPanelIds.push(_dp.panelId);
          if (pIdx === selectedPanelIndex) {
            _draggedPanelId = _dp.panelId;
          }

          // 1. Mutar directamente el objeto de panel en memoria por referencia (Single Source of Truth)
          _dp.isManual = true;
          _dp.gridA = undefined;
          _dp.gridB = undefined;
          if (_dp.center) _dp.center = Cesium.Cartesian3.clone(_dp.center);
          if (_dp.corners) _dp.corners = _cloneCorners(_dp.corners);

          if (_dp.rawPanel) {
            _dp.rawPanel.isManual = true;
            _dp.rawPanel.gridA = undefined;
            _dp.rawPanel.gridB = undefined;
            if (_dp.center) _dp.rawPanel.center = Cesium.Cartesian3.clone(_dp.center);
            if (_dp.corners) _dp.rawPanel.corners = _cloneCorners(_dp.corners);
            if (typeof _dp.rot !== 'undefined') _dp.rawPanel.rot = _dp.rot;
            if (typeof _dp.u === 'number') _dp.rawPanel.u = _dp.u;
            if (typeof _dp.v === 'number') _dp.rawPanel.v = _dp.v;
          }

          // 2. Localizar y mutar el panel correspondiente en poly.roofInfo
          if (typeof WP !== 'undefined' && WP && WP.polylines && typeof _dp.polyIdx !== 'undefined') {
            const _wPoly = WP.polylines[_dp.polyIdx];
            if (_wPoly && _wPoly.roofInfo && Array.isArray(_wPoly.roofInfo.panels)) {
              let _targetIdx = -1;
              if (_dp.rawPanel) {
                _targetIdx = _wPoly.roofInfo.panels.indexOf(_dp.rawPanel);
              }
              if (_targetIdx < 0 && _dp.panelId) {
                _targetIdx = _wPoly.roofInfo.panels.findIndex(p => p && p.panelId === _dp.panelId);
              }
              if (_targetIdx < 0 && typeof _dp.layoutIndex === 'number') {
                _targetIdx = _dp.layoutIndex;
              }
              if (_targetIdx < 0 && typeof _dp.localIdx === 'number') {
                _targetIdx = _dp.localIdx;
              }

              if (_targetIdx >= 0 && _targetIdx < _wPoly.roofInfo.panels.length) {
                const _rp2 = _wPoly.roofInfo.panels[_targetIdx];
                if (_rp2) {
                  _rp2.isManual = true;
                  _rp2.gridA = undefined;
                  _rp2.gridB = undefined;
                  if (_dp.center) _rp2.center = Cesium.Cartesian3.clone(_dp.center);
                  if (_dp.corners) _rp2.corners = _cloneCorners(_dp.corners);
                  if (typeof _dp.rot !== 'undefined') _rp2.rot = _dp.rot;
                  if (typeof _dp.u === 'number') _rp2.u = _dp.u;
                  if (typeof _dp.v === 'number') _rp2.v = _dp.v;
                }
              }
            }
          }

          // 3. Sincronizar en lastRoofInfo
          if (typeof lastRoofInfo !== 'undefined' && lastRoofInfo && Array.isArray(lastRoofInfo.panels)) {
            let _lIdx = -1;
            if (_dp.rawPanel) {
              _lIdx = lastRoofInfo.panels.indexOf(_dp.rawPanel);
            }
            if (_lIdx < 0 && _dp.panelId) {
              _lIdx = lastRoofInfo.panels.findIndex(p => p && p.panelId === _dp.panelId);
            }
            if (_lIdx < 0 && typeof _dp.layoutIndex === 'number') {
              _lIdx = _dp.layoutIndex;
            }
            if (_lIdx >= 0 && _lIdx < lastRoofInfo.panels.length) {
              const _rp = lastRoofInfo.panels[_lIdx];
              if (_rp) {
                _rp.isManual = true;
                _rp.gridA = undefined;
                _rp.gridB = undefined;
                if (_dp.center) _rp.center = Cesium.Cartesian3.clone(_dp.center);
                if (_dp.corners) _rp.corners = _cloneCorners(_dp.corners);
                if (typeof _dp.rot !== 'undefined') _rp.rot = _dp.rot;
                if (typeof _dp.u === 'number') _rp.u = _dp.u;
                if (typeof _dp.v === 'number') _rp.v = _dp.v;
              }
            }
          }
        });
      } else {
        if (typeof wpRenderAllPolylines === 'function') wpRenderAllPolylines();
        if (typeof render3DObstaclesInCesium === 'function') render3DObstaclesInCesium();
        if (typeof render3DBuildingsInCesium === 'function') render3DBuildingsInCesium();
      }

      if (draggedTargetType !== 'panel' && draggedTargetType !== 'obstacle' && draggedTargetType !== 'wind_turbine_entity' && typeof updateAllVisuals === 'function') {
        updateAllVisuals();
      }

      // Limpiar entidad de arrastre al soltar el ratón SIEMPRE
      universalGizmoState.startPoints = null;
      universalGizmoState.startCenter = null;
      universalGizmoState.startOrigin = null;
      universalGizmoState.startNormal = null;
      universalGizmoState.startUVec = null;
      universalGizmoState.startVVec = null;
      universalGizmoState.startChildPolys = null;
      universalGizmoState.startPlaneVtxPt = null;
      if (draggedTargetType !== 'panel' && activePanelDragEntity && viewer) {
        try { viewer.entities.remove(activePanelDragEntity); } catch(e) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(e, 'Entidad/Primitiva Cesium'); }
        activePanelDragEntity = null;
      }
      
      // [RA FIXED] Heavy calculations run on mouse release instead of drag
      // Omitimos recálculo booleano para paneles para no perder la posición manual
      if (draggedTargetType !== 'obstacle' && draggedTargetType !== 'panel' && typeof recalculateLayoutAndObstacles === 'function') {
        const _vtxPolyIdx = (draggedTargetType === 'vertex' && typeof WP !== 'undefined' && WP) ? WP.selectedPolyIdx : null;
        recalculateLayoutAndObstacles(_vtxPolyIdx);
      }
      
      // RECONSTRUIMOS el batch visual de paneles solo para arrastre manual de panel (para otros tipos ya lo reconstruye recalculateLayoutAndObstacles)
      if (draggedTargetType === 'panel') {
        if (typeof window.wpInvalidateHeatmap === 'function') {
          window.wpInvalidateHeatmap('Panel movido manualmente');
        }
        if (typeof roofPanelsCache !== 'undefined' && roofPanelsCache) {
          roofPanelsCache.sig = null;
          roofPanelsCache.data = null;
        }
        if (typeof wpFastRenderSimulatedPanels === 'function') {
          // [Opción 2] Refresco completo de campo, estructura 3D y cableado al soltar el ratón
          wpFastRenderSimulatedPanels(true, null).then(() => {
            if (activePanelDragEntity && viewer) {
              try { viewer.entities.remove(activePanelDragEntity); } catch(e) {}
              activePanelDragEntity = null;
            }
            if (window.allRenderedPanels) {
              if (_affectedPanelIds && _affectedPanelIds.length > 0) {
                window.selectedPanelIndices = _affectedPanelIds.map(id => window.allRenderedPanels.findIndex(p => p && p.panelId === id)).filter(idx => idx >= 0);
              }
              if (_draggedPanelId) {
                const _newIdx = window.allRenderedPanels.findIndex(p => p && p.panelId === _draggedPanelId);
                if (_newIdx >= 0) {
                  selectedPanelIndex = _newIdx;
                  if (typeof window !== 'undefined') window.selectedPanelIndex = _newIdx;
                }
              }
              if (typeof updatePanelSelectionUI === 'function') updatePanelSelectionUI();
              if (typeof renderTriad2D === 'function') renderTriad2D();
            }
            if (typeof wpCalculateAndRenderInverterCables === 'function') {
              wpCalculateAndRenderInverterCables();
            }
            if (typeof recalculateSolarYield === 'function') {
              recalculateSolarYield();
            }
            if (typeof BOMTreeEngine !== 'undefined' && typeof BOMTreeEngine.refresh === 'function') {
              BOMTreeEngine.refresh();
            }
            if (typeof ProjectHierarchy !== 'undefined' && ProjectHierarchy && typeof ProjectHierarchy.notify === 'function') {
              ProjectHierarchy.notify('transform_committed');
              ProjectHierarchy.notify('electrical_updated');
            }
            if (viewer && viewer.scene && typeof viewer.scene.requestRender === 'function') {
              viewer.scene.requestRender();
            }
          });
        }
      } else {
        if (typeof recalculateSolarYield === 'function') recalculateSolarYield();
        if ((draggedTargetType === 'inverter' || draggedTargetType === 'dc_protection' || draggedTargetType === 'combiner_box') && typeof wpFastRenderSimulatedPanels === 'function') {
          wpFastRenderSimulatedPanels();
        }
        if (draggedTargetType === 'route_vertex' && window._raLiveRoutePreviewEnt && viewer && viewer.entities) {
          try { viewer.entities.remove(window._raLiveRoutePreviewEnt); } catch (_) {}
          window._raLiveRoutePreviewEnt = null;
        }
        if (typeof wpCalculateAndRenderInverterCables === 'function') wpCalculateAndRenderInverterCables();
        if (draggedTargetType === 'route_vertex' && typeof wpUpdateCableRoutesUI === 'function') wpUpdateCableRoutesUI();

        if (typeof BOMTreeEngine !== 'undefined' && typeof BOMTreeEngine.refresh === 'function') {
          BOMTreeEngine.refresh();
        }
        if (typeof wpUpdateUI === 'function') wpUpdateUI();
        if (typeof ProjectHierarchy !== 'undefined' && ProjectHierarchy && typeof ProjectHierarchy.notify === 'function') {
          ProjectHierarchy.notify('transform_committed');
          ProjectHierarchy.notify('electrical_updated');
        }
      }
      showStatus('<i data-lucide="check" class="icon-sm"></i> POSICIÓN Y ROTACIÓN FIJADAS', 1200);
      if (window.LiveSolarProbe && window.LiveSolarProbe.enabled) {
        window.LiveSolarProbe.evaluate(true);
      }
      if (_gizmoWasDragging && window.RAundo && typeof window.RAundo.commitDrag === 'function') {
        window.RAundo.commitDrag(_prevGizmoMode === 'l-angle-drag' ? 'Ajustar ángulo de edificio en L' : undefined);
      } else if (window.RAundo && typeof window.RAundo.cancelDrag === 'function') {
        window.RAundo.cancelDrag();
      }
    }
  }, Cesium.ScreenSpaceEventType.LEFT_UP);

  handler.setInputAction(doubleClick => {
    if (typeof window.RAMeasureTool !== 'undefined' && window.RAMeasureTool && typeof window.RAMeasureTool.isActive === 'function' && window.RAMeasureTool.isActive()) {
      return;
    }
    if (window.cableRoutingState && window.cableRoutingState.active) {
      wpFinishCableRouting();
      return;
    }
    if (WP.mode === 'draw-building' && activeBuildingPts.length >= 3) {
      if (window._lastBldVtxTime && (performance.now() - window._lastBldVtxTime < 350)) {
        if (activeBuildingPts.length > 3) {
          activeBuildingPts.pop();
          if (window._tempBuildingEntities && window._tempBuildingEntities.length > 0) {
            const ent = window._tempBuildingEntities.pop();
            try { viewer.entities.remove(ent); } catch(e) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(e, 'Entidad/Primitiva Cesium'); }
          }
        }
      }
      finishActiveBuilding();
      return;
    }
    if (WP.mode === 'draw-poly' && WP.activePolyPts.length >= 3) {
      // Rollback de gesto CAD: si el doble clic añadió un vértice en su 1er clic (<350ms), descartarlo
      if (WP._lastVtxTime && (performance.now() - WP._lastVtxTime < 350)) {
        if (WP.activePolyPts.length > 3) {
          WP.activePolyPts.pop();
          polygonPoints = WP.activePolyPts.map(p => Cesium.Cartesian3.clone(p));
        }
      }
      wpCloseActivePolyline();
      return;
    }

    // ── Doble clic sobre codo de canalización eléctrica -> eliminar vértice intermedio
    if (doubleClick && doubleClick.position && scene && typeof scene.pick === 'function') {
      const dblPicked = scene.pick(doubleClick.position);
      const dblId = (dblPicked && dblPicked.id) ? (typeof dblPicked.id === 'string' ? dblPicked.id : (dblPicked.id.id || '')) : '';
      const dblRouteM = String(dblId).match(/^ra_route_handle_(dc|ac)_(\d+)$/);
      if (dblRouteM && window.RACableEngine && typeof window.RACableEngine.removeRouteVertex === 'function') {
        if (window.RACableEngine.removeRouteVertex(dblRouteM[1], parseInt(dblRouteM[2], 10))) {
          if (typeof showStatus === 'function') {
            showStatus('CODO DE RUTA ' + dblRouteM[1].toUpperCase() + ' ELIMINADO · CTRL+Z DESHACE', 2200);
          }
          return;
        }
      }
    }

    // ── Doble clic sobre panel FV: Opción 1 - Seleccionar TODAS las placas del faldón y activar modo de desplazamiento
    if (doubleClick && doubleClick.position) {
      const dblPanelIdx = (typeof pickPanelUnderCursor === 'function')
        ? pickPanelUnderCursor(doubleClick.position)
        : -1;
      if (dblPanelIdx >= 0) {
        const panelsList = (Array.isArray(window.allRenderedPanels) && window.allRenderedPanels.length > 0)
          ? window.allRenderedPanels
          : ((typeof lastRoofInfo !== 'undefined' && lastRoofInfo && Array.isArray(lastRoofInfo.panels)) ? lastRoofInfo.panels : null);
        const targetP = panelsList ? panelsList[dblPanelIdx] : null;

        let targetPolyIdx = -1;
        if (targetP) {
          if (typeof targetP.polyIdx === 'number') targetPolyIdx = targetP.polyIdx;
          else if (typeof targetP.faldonIndex === 'number') targetPolyIdx = targetP.faldonIndex;
          else if (targetP.rawPanel && typeof targetP.rawPanel.polyIdx === 'number') targetPolyIdx = targetP.rawPanel.polyIdx;
          else if (typeof targetP.panelId === 'string' && targetP.panelId.startsWith('pan_')) {
            const num = parseInt(targetP.panelId.split('_')[1], 10);
            if (!isNaN(num)) targetPolyIdx = num;
          }
        }
        if (targetPolyIdx < 0 && typeof WP !== 'undefined' && WP && typeof WP.selectedPolyIdx === 'number' && WP.selectedPolyIdx >= 0) {
          targetPolyIdx = WP.selectedPolyIdx;
        }
        if (targetPolyIdx < 0) targetPolyIdx = 0;

        // Sincronizar tarjeta de faldón activo si difiere
        if (typeof WP !== 'undefined' && WP && WP.selectedPolyIdx !== targetPolyIdx && typeof wpSelectFaldon === 'function') {
          wpSelectFaldon(targetPolyIdx);
        }

        // Seleccionar masivamente todas las placas del faldón
        if (typeof window.selectAllPanelsInPolyline === 'function') {
          window.selectAllPanelsInPolyline(targetPolyIdx);
        }
        return;
      }
    }

    // ── SUGERENCIA 2: Doble clic sobre arista para insertar un nuevo vértice
    const poly = (WP.polylines && WP.selectedPolyIdx >= 0) ? WP.polylines[WP.selectedPolyIdx] : null;
    if (poly && poly.points && poly.points.length >= 3 && doubleClick && doubleClick.position) {
      const clickPos = doubleClick.position;
      const screenPoints = poly.points.map(p => Cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, p));
      
      let bestSegmentIdx = -1;
      let minScreenDist = 22.0; // Tolerancia de 22px en pantalla
      let bestT = 0.5;

      for (let i = 0; i < screenPoints.length; i++) {
        const p1 = screenPoints[i];
        const p2 = screenPoints[(i + 1) % screenPoints.length];
        if (!p1 || !p2) continue;

        const proj = projectPointOnSegment2D(clickPos.x, clickPos.y, p1.x, p1.y, p2.x, p2.y);
        if (proj.dist < minScreenDist) {
          minScreenDist = proj.dist;
          bestSegmentIdx = i;
          bestT = proj.t;
        }
      }

      if (bestSegmentIdx >= 0) {
        const p1_3D = poly.points[bestSegmentIdx];
        const p2_3D = poly.points[(bestSegmentIdx + 1) % poly.points.length];
        const v = Cesium.Cartesian3.subtract(p2_3D, p1_3D, new Cesium.Cartesian3());
        const newPt3D = Cesium.Cartesian3.add(p1_3D, Cesium.Cartesian3.multiplyByScalar(v, bestT, new Cesium.Cartesian3()), new Cesium.Cartesian3());

        if (window.RAundo && typeof window.RAundo.snapVertex === 'function') {
          window.RAundo.snapVertex(WP.selectedPolyIdx, 'Insertar vértice');
        }
        poly.points.splice(bestSegmentIdx + 1, 0, newPt3D);
        poly.area = wpPolylineArea3D(poly.points);
        polygonPoints = poly.points.map(p => Cesium.Cartesian3.clone(p));
        WP.selectedVtxIdx = bestSegmentIdx + 1;

        wpRenderAllPolylines();
        wpSyncVertexInputs();
        wpUpdateUI();
        updateAllVisuals();
        if (typeof wpFastRenderSimulatedPanels === 'function') wpFastRenderSimulatedPanels();
        renderTriad2D();

        showStatus('<i data-lucide=\"plus\" class=\"icon-sm\"></i> NUEVO VÉRTICE INSERTADO EN ARISTA (TOTAL: ' + poly.points.length + ' VÉRTICES)', 2500);
        return;
      }
    }

    // ── B. Doble clic sobre arista de edificio para insertar un nuevo vértice en su huella
    if (doubleClick && doubleClick.position && Array.isArray(buildings) && buildings.length > 0) {
      const clickPos = doubleClick.position;
      const selBld = (typeof selectedBuildingId !== 'undefined' && selectedBuildingId)
        ? buildings.find(b => b.id === selectedBuildingId)
        : null;
      const bldCandidates = selBld ? [selBld] : buildings;

      let hitBld = null;
      let hitSegmentIdx = -1;
      let hitT = 0.5;
      let minBldDist = 24.0; // Tolerancia en píxeles

      for (const b of bldCandidates) {
        if (!b.points || b.points.length < 3 || b.visible === false) continue;
        const bH = b.height || 6.0;
        const n = b.points.length;

        for (let i = 0; i < n; i++) {
          const pt1Base = b.points[i];
          const pt2Base = b.points[(i + 1) % n];
          if (!pt1Base || !pt2Base) continue;

          // 1. Detección en arista base
          const p1WinBase = Cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, pt1Base);
          const p2WinBase = Cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, pt2Base);
          if (p1WinBase && p2WinBase) {
            const projBase = projectPointOnSegment2D(clickPos.x, clickPos.y, p1WinBase.x, p1WinBase.y, p2WinBase.x, p2WinBase.y);
            if (projBase.dist < minBldDist) {
              minBldDist = projBase.dist;
              hitBld = b;
              hitSegmentIdx = i;
              hitT = projBase.t;
            }
          }

          // 2. Detección en arista de coronación / alero
          const c1 = Cesium.Cartographic.fromCartesian(pt1Base);
          const c2 = Cesium.Cartographic.fromCartesian(pt2Base);
          if (c1 && c2) {
            const pt1Roof = Cesium.Cartesian3.fromRadians(c1.longitude, c1.latitude, c1.height + bH);
            const pt2Roof = Cesium.Cartesian3.fromRadians(c2.longitude, c2.latitude, c2.height + bH);
            const p1WinRoof = Cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, pt1Roof);
            const p2WinRoof = Cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, pt2Roof);
            if (p1WinRoof && p2WinRoof) {
              const projRoof = projectPointOnSegment2D(clickPos.x, clickPos.y, p1WinRoof.x, p1WinRoof.y, p2WinRoof.x, p2WinRoof.y);
              if (projRoof.dist < minBldDist) {
                minBldDist = projRoof.dist;
                hitBld = b;
                hitSegmentIdx = i;
                hitT = projRoof.t;
              }
            }
          }
        }
      }

      if (hitBld && hitSegmentIdx >= 0) {
        if (typeof selectedBuildingId !== 'undefined' && selectedBuildingId !== hitBld.id && typeof selectBuilding === 'function') {
          selectBuilding(hitBld.id);
        }

        const p1_3D = hitBld.points[hitSegmentIdx];
        const p2_3D = hitBld.points[(hitSegmentIdx + 1) % hitBld.points.length];
        const segVec = Cesium.Cartesian3.subtract(p2_3D, p1_3D, new Cesium.Cartesian3());
        const newPt3D = Cesium.Cartesian3.add(p1_3D, Cesium.Cartesian3.multiplyByScalar(segVec, hitT, new Cesium.Cartesian3()), new Cesium.Cartesian3());

        if (window.RAundo && typeof window.RAundo.snapBuildings === 'function') {
          window.RAundo.snapBuildings('Insertar vértice en edificio');
        }

        hitBld.isRectangular = false;
        hitBld.points.splice(hitSegmentIdx + 1, 0, newPt3D);

        if (typeof selectBuildingVertex === 'function') {
          selectBuildingVertex(hitSegmentIdx + 1);
        }
        if (typeof render3DBuildingsInCesium === 'function') {
          render3DBuildingsInCesium();
        }
        if (typeof updateBuildingFootprintUI === 'function') {
          updateBuildingFootprintUI();
        }
        if (typeof renderTriad2D === 'function') {
          renderTriad2D();
        }

        if (typeof showStatus === 'function') {
          showStatus('<i data-lucide="plus" class="icon-sm"></i> NUEVO VÉRTICE INSERTADO EN ARISTA DE EDIFICIO (TOTAL: ' + hitBld.points.length + ' VÉRTICES)', 2500);
        }
        return;
      }
    }
  }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

  // --- FIX SHIFT MODIFIERS ---
  // Cesium ignora los eventos base si se pulsa Shift a menos que se registren explícitamente.
  // Clonamos las acciones para que el Snapping (Shift) no bloquee los clics.
  const actionsToClone = [
    Cesium.ScreenSpaceEventType.MOUSE_MOVE,
    Cesium.ScreenSpaceEventType.LEFT_CLICK,
    Cesium.ScreenSpaceEventType.LEFT_DOWN,
    Cesium.ScreenSpaceEventType.LEFT_UP,
    Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK
  ];
  actionsToClone.forEach(type => {
    const action = handler.getInputAction(type);
    if (action) handler.setInputAction(action, type, Cesium.KeyboardEventModifier.SHIFT);
  });

  function projectPointOnSegment2D(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const l2 = dx * dx + dy * dy;
    if (l2 === 0) return { x: x1, y: y1, dist: Math.hypot(px - x1, py - y1), t: 0 };
    let t = ((px - x1) * dx + (py - y1) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    const qx = x1 + t * dx, qy = y1 + t * dy;
    return { x: qx, y: qy, dist: Math.hypot(px - qx, py - qy), t };
  }

  // Desacoplar camera.changed de wpUpdateUI(): mover la cámara solo repinta el overlay 2D por rAF
  // sin reconstruir el DOM lateral ni regenerar obstáculos 3D en cada frame.
  let _camChangedRaf = null;
  camera.changed.addEventListener(() => {
    if (_camChangedRaf !== null) return;
    _camChangedRaf = requestAnimationFrame(() => {
      _camChangedRaf = null;
      if (typeof renderTriad2D === 'function') {
        try { renderTriad2D(); } catch (eHud) {}
      }
    });
  });

  // Seguimiento de tecla Shift para bloqueo ortogonal 90° en edición de rutas/gizmos
  (window.RA && window.RA.addListener ? window.RA.addListener : function(t, ev, fn) { t.addEventListener(ev, fn); })(document, 'keyup', function(e) {
    if (typeof window !== 'undefined') window._raShiftKeyDown = Boolean(e.shiftKey);
  });

  // Atajos de teclado [RA LISTENER — keydown #2: atajos globales de sesión]
  (window.RA && window.RA.addListener ? window.RA.addListener : function(t, ev, fn) { t.addEventListener(ev, fn); })(document, 'keydown', function _raKeydown2(e) {
    if (typeof window !== 'undefined') window._raShiftKeyDown = Boolean(e.shiftKey);
    if (isTextInputActive(e.target)) return;
    if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'c' || e.key === 'C')) {
      if (typeof window.wpToggleCableAuditElevation === 'function') {
        e.preventDefault();
        window.wpToggleCableAuditElevation();
        return;
      }
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      // [P0] DESPACHADOR ÚNICO DE BORRADO (antes: 3 listeners solapados → borrado en cascada).
      // Prioridad: vértice de faldón (gestión local verificada) → obstáculo → objetivo del
      // gizmo universal (edificio, equipo eléctrico, panel, vértice de ruta) → panel seleccionado.
      if (WP.selectedPolyIdx >= 0 && WP.selectedVtxIdx >= 0) {
        const poly = WP.polylines[WP.selectedPolyIdx];
        if (poly && poly.points) {
          if (poly.points.length > 3) {
            if (window.RAundo) window.RAundo.snapVertex(WP.selectedPolyIdx);
            poly.points.splice(WP.selectedVtxIdx, 1);
            WP.selectedVtxIdx = Math.min(WP.selectedVtxIdx, poly.points.length - 1);
            poly.area = wpPolylineArea3D(poly.points);
            polygonPoints = poly.points.map(p => Cesium.Cartesian3.clone(p));

            wpRenderAllPolylines();
            wpSyncVertexInputs();
            wpUpdateUI();
            updateAllVisuals();
            if (typeof wpFastRenderSimulatedPanels === 'function') wpFastRenderSimulatedPanels();
            renderTriad2D();
            if (typeof window.wpInvalidateHeatmap === 'function') window.wpInvalidateHeatmap('Vértice de faldón eliminado');

            showStatus('<i data-lucide=\"trash-2\" class=\"icon-sm\"></i> VÉRTICE ELIMINADO (RESTAN: ' + poly.points.length + ' VÉRTICES) · CTRL+Z DESHACE', 2600);
            return;
          } else {
            showStatus('<i data-lucide=\"alert-triangle\" class=\"icon-sm\"></i> UNA POLILÍNEA DEBE TENER AL MENOS 3 VÉRTICES', 2500);
            return;
          }
        }
      }
      if (typeof deleteUniversalSelectedObject === 'function' && deleteUniversalSelectedObject()) {
        return;
      }
      if (selectedObstacleId) {
        deleteSelectedObstacle();
        return;
      }
      if (selectedPanelIndex >= 0 || (Array.isArray(window.selectedPanelIndices) && window.selectedPanelIndices.length > 0)) {
        deleteSelectedPanel();
        return;
      }
    }
    // ── Atajo CTRL + A para seleccionar placas (del faldón activo si hay uno seleccionado, o de todo el campo solar)
    if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
      const activeEl = document.activeElement;
      if (!activeEl || (activeEl.tagName !== 'INPUT' && activeEl.tagName !== 'TEXTAREA' && !activeEl.isContentEditable)) {
        e.preventDefault();
        if (typeof WP !== 'undefined' && typeof WP.selectedPolyIdx === 'number' && WP.selectedPolyIdx >= 0 && typeof window.selectAllPanelsInPolyline === 'function') {
          window.selectAllPanelsInPolyline(WP.selectedPolyIdx);
          return;
        } else if (typeof window.selectAllPanels === 'function') {
          window.selectAllPanels();
          return;
        }
      }
    }
    // ── Atajos W / E para conmutar modo de Gizmo Universal (W: Translate, E: Rotate)
    const hasModKey = (e.ctrlKey || e.metaKey || e.altKey);
    if (!hasModKey && (e.key === 'w' || e.key === 'W')) {
      if (typeof switchUniversalGizmoMode === 'function') {
        switchUniversalGizmoMode('translate');
        return;
      }
    }
    if (!hasModKey && (e.key === 'e' || e.key === 'E')) {
      const hasGizmoTarget = (window.selectedPanelIndex >= 0) || Boolean(window.selectedObstacleId) || Boolean(window.selectedBuildingId) || Boolean(window.selectedElectricalId);
      if (hasGizmoTarget && typeof switchUniversalGizmoMode === 'function') {
        switchUniversalGizmoMode('rotate');
        return;
      }
    }

    // ── Atajos de bloqueo de eje para Tríada de Vértices (U, Y/V, Z/N) — nunca con Ctrl/Meta/Alt (respeta Ctrl+Z)
    if (!hasModKey && WP.selectedPolyIdx >= 0 && WP.selectedVtxIdx >= 0) {
      if (e.key === 'u' || e.key === 'U') {
        vtxGizmoState.axisLock = (vtxGizmoState.axisLock === 'u' ? null : 'u');
        showStatus('<i data-lucide="lock" class="icon-sm"></i> RESTRICCIÓN DE EJE: ' + (vtxGizmoState.axisLock ? 'EJE U (LONGITUDINAL)' : 'LIBRE'), 1500);
        renderTriad2D();
        return;
      }
      if (e.key === 'y' || e.key === 'Y' || e.key === 'v' || e.key === 'V') {
        vtxGizmoState.axisLock = (vtxGizmoState.axisLock === 'v' ? null : 'v');
        showStatus('<i data-lucide="lock" class="icon-sm"></i> RESTRICCIÓN DE EJE: ' + (vtxGizmoState.axisLock ? 'EJE V (TRANSVERSAL)' : 'LIBRE'), 1500);
        renderTriad2D();
        return;
      }
      if (e.key === 'z' || e.key === 'Z' || e.key === 'n' || e.key === 'N') {
        vtxGizmoState.axisLock = (vtxGizmoState.axisLock === 'z' ? null : 'z');
        showStatus('<i data-lucide="lock" class="icon-sm"></i> RESTRICCIÓN DE EJE: ' + (vtxGizmoState.axisLock ? 'EJE Z (ELEVACIÓN NORMAL)' : 'LIBRE'), 1500);
        renderTriad2D();
        return;
      }
    }
    if (e.key === 'Enter') {
      if (typeof WP !== 'undefined' && WP && WP.mode === 'draw-poly' && WP.activePolyPts && WP.activePolyPts.length >= 3) {
        e.preventDefault();
        wpCloseActivePolyline();
        return;
      }
      if (typeof WP !== 'undefined' && WP && WP.mode === 'draw-building' && typeof activeBuildingPts !== 'undefined' && activeBuildingPts.length >= 3) {
        e.preventDefault();
        finishActiveBuilding();
        return;
      }
    }
    if (e.code === 'Escape') {
      if (obsPlacement && obsPlacement.active) {
        cancelObstaclePlacement();
        showStatus('COLOCACIÓN DE OBSTÁCULO CANCELADA', 1500);
        return;
      }
      if (WP.mode !== 'idle') {
        wpSetMode('idle');
        wpClearEntGroup('planePreview');
        WP.planePts = [];
        showStatus('OPERACIÓN CANCELADA', 1500);
      }
      if (typeof wpRestoreCameraNavigation === 'function') {
        wpRestoreCameraNavigation();
      }
    } else if (!hasModKey && (e.key === 'x' || e.key === 'X')) {
      magneticSnapActive = !magneticSnapActive;
      window.magneticSnapActive = magneticSnapActive;
      const snapChk = document.getElementById('chk-snap-vert');
      if (snapChk) snapChk.checked = magneticSnapActive;
      showStatus(magneticSnapActive ? '<i data-lucide=\"magnet\" class=\"icon-sm\"></i> SNAP MAGNÉTICO ACTIVADO [X]' : '<i data-lucide=\"circle\" class=\"icon-sm\"></i> SNAP MAGNÉTICO DESACTIVADO [X]', 1500);
    } else if (!hasModKey && WP.selectedPolyIdx >= 0 && WP.selectedVtxIdx >= 0 && (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd')) {
      changeTriadScale(+0.25);
    } else if (!hasModKey && WP.selectedPolyIdx >= 0 && WP.selectedVtxIdx >= 0 && (e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract')) {
      changeTriadScale(-0.25);
    }
  });
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
