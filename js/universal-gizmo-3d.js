// ===============================================================================
// MODULO CAD: GIZMO UNIVERSAL UNIFICADO 3D (TRÍADA + ANILLO DE ROTACIÓN + TRANSFORMACIONES)
// Extraído para arquitectura modular desacoplada según norma ISO/IEC 25010
// ===============================================================================

const universalGizmoState = {
  active: false,
  gizmoMode: 'translate', // 'translate' (flechas U, V, Z) | 'rotate' (anillos 3D U, V, Z)
  mode: null,             // 'center-drag' | 'u-axis' | 'v-axis' | 'z-axis' | 'rotate-u' | 'rotate-v' | 'rotate-z' | 'rotate-ring'
  targetType: null,       // 'electrical' | 'building' | 'obstacle' | 'panel' | 'vertex'
  startMouse: { x: 0, y: 0 },
  startPos: null,         // Cesium.Cartesian3
  startCarto: null,       // { latitude, longitude, height }
  startRot: 0,            // Grados (0 - 360)
  startAngleRad: 0,       // Radianes del click inicial respecto al centro
  screen: null,
  hoveredPart: null,
  axisLock: null
};

function switchUniversalGizmoMode(newMode) {
  if (newMode === 'translate' || newMode === 'rotate') {
    universalGizmoState.gizmoMode = newMode;
  } else {
    universalGizmoState.gizmoMode = (universalGizmoState.gizmoMode === 'translate' ? 'rotate' : 'translate');
  }
  if (typeof renderTriad2D === 'function') renderTriad2D();
  if (typeof showStatus === 'function') {
    showStatus(universalGizmoState.gizmoMode === 'rotate' ? '<i data-lucide=\"refresh-cw\" class=\"icon-sm\"></i> GIZMO 3D: MODO ROTACIÓN 3-EJES [E]' : '<i data-lucide="move" class="icon-sm"></i> GIZMO 3D: MODO TRASLACIÓN 3-EJES [W]', 1200);
  }
}

window.universalGizmoState = universalGizmoState;
window.switchUniversalGizmoMode = switchUniversalGizmoMode;
window.renderUniversalGizmo2D = renderUniversalGizmo2D;
window.checkUniversalGizmoHit = checkUniversalGizmoHit;
window.deleteUniversalSelectedObject = deleteUniversalSelectedObject;
window.getUniversalSelectedTarget = getUniversalSelectedTarget;

// 1. OBTENER INFORMACIÓN DEL OBJETO SELECCIONADO ACTUALMENTE
function getUniversalSelectedTarget() {
  // 🌟 PRIORIDAD #1: VÉRTICE DE HUELLA DE EDIFICIO SELECCIONADO (Tríada Ámbar y Manipulador 3D)
  const _hasSpecificObjectSelected = (typeof selectedObstacleId !== 'undefined' && selectedObstacleId) ||
                                    (typeof selectedPanelIndex !== 'undefined' && selectedPanelIndex >= 0) ||
                                    (typeof selectedElectricalId !== 'undefined' && selectedElectricalId);
  const _bldState = (typeof window !== 'undefined' && window.bldFootprintState) || (typeof bldFootprintState !== 'undefined' ? bldFootprintState : null);
  if (!_hasSpecificObjectSelected && _bldState && _bldState.selectedVtxIdx >= 0 && typeof selectedBuildingId !== 'undefined' && selectedBuildingId) {
    const bld = (typeof buildings !== 'undefined' && Array.isArray(buildings)) ? buildings.find(b => b.id === selectedBuildingId) : null;
    if (bld && bld.points && _bldState.selectedVtxIdx >= 0 && _bldState.selectedVtxIdx < bld.points.length) {
      const pt = bld.points[_bldState.selectedVtxIdx];
      const bldAxes = (typeof computeBuildingConstructionAxes === 'function')
        ? computeBuildingConstructionAxes(bld, _bldState.selectedVtxIdx)
        : null;

      let uVec, vVec, normal;
      if (bldAxes && bldAxes.uVec && bldAxes.vVec && bldAxes.normal) {
        uVec   = bldAxes.uVec;
        vVec   = bldAxes.vVec;
        normal = bldAxes.normal;
      } else {
        const az = (typeof bld.roofAzimuth === 'number') ? bld.roofAzimuth : 0;
        const azRad = Cesium.Math.toRadians(az);
        const enuMat = Cesium.Transforms.eastNorthUpToFixedFrame(pt);
        const east  = Cesium.Cartesian3.normalize(new Cesium.Cartesian3(enuMat[0], enuMat[1], enuMat[2]), new Cesium.Cartesian3());
        const north = Cesium.Cartesian3.normalize(new Cesium.Cartesian3(enuMat[4], enuMat[5], enuMat[6]), new Cesium.Cartesian3());
        const up    = Cesium.Cartesian3.normalize(new Cesium.Cartesian3(enuMat[8], enuMat[9], enuMat[10]), new Cesium.Cartesian3());
        uVec = Cesium.Cartesian3.normalize(
          Cesium.Cartesian3.add(
            Cesium.Cartesian3.multiplyByScalar(east,  Math.sin(azRad), new Cesium.Cartesian3()),
            Cesium.Cartesian3.multiplyByScalar(north, Math.cos(azRad), new Cesium.Cartesian3()),
            new Cesium.Cartesian3()
          ), new Cesium.Cartesian3()
        );
        vVec = Cesium.Cartesian3.normalize(
          Cesium.Cartesian3.cross(up, uVec, new Cesium.Cartesian3()),
          new Cesium.Cartesian3()
        );
        normal = up;
      }
      return {
        type: 'vertex',
        subType: 'building_vertex',
        id: 'bld_vtx_' + bld.id + '_' + _bldState.selectedVtxIdx,
        name: (bld.name || 'Edificio') + ' - Vértice #' + (_bldState.selectedVtxIdx + 1),
        pos: pt,
        rot: 0,
        height: 0,
        wp: { origin: pt, normal, uVec, vVec, plane: { origin: pt, normal } },
        color: '#F59E0B',
        accentColor: 'rgba(245, 158, 11, 0.45)'
      };
    }
  }

  // 🌟 PRIORIDAD #1B: VÉRTICE DE POLILÍNEA O PLANO DE TRABAJO
  if (!_hasSpecificObjectSelected && (
      (typeof universalGizmoState !== 'undefined' && universalGizmoState && universalGizmoState.active && universalGizmoState.targetType === 'vertex') ||
      (typeof WP !== 'undefined' && WP && WP.polylines && WP.selectedPolyIdx >= 0 && WP.selectedVtxIdx >= 0) ||
      (typeof selectedVertexIndex !== 'undefined' && selectedVertexIndex >= 0 && typeof appMode !== 'undefined' && appMode === 'edit'))) {
    if (typeof getSelectedVertexData === 'function') {
      const vtxData = getSelectedVertexData();
      if (vtxData && vtxData.pt) {
        return {
          type: 'vertex',
          id: 'poly_' + (WP.selectedPolyIdx || 0) + '_vtx_' + (WP.selectedVtxIdx || 0),
          name: 'Vértice #' + ((WP.selectedVtxIdx >= 0 ? WP.selectedVtxIdx : 0) + 1),
          pos: vtxData.pt,
          rot: 0,
          height: 0,
          wp: vtxData.wp,
          color: '#FFFFFF',
          accentColor: 'rgba(255, 255, 255, 0.5)'
        };
      }
    }
  }

  // A. Equipos Eléctricos (Inversor, Combiner, Contador)
  if (typeof selectedElectricalId !== 'undefined' && selectedElectricalId && window.inverterEquipmentState) {
    const s = window.inverterEquipmentState;
    if (selectedElectricalId === 'inverter' && s.position && (!s.entity || s.entity.show !== false)) {
      return {
        type: 'electrical',
        id: 'inverter',
        name: 'Cuadro Eléctrico & Inversor',
        pos: s.position,
        rot: s.rotation || 0,
        height: (s.carto ? s.carto.height : 0),
        entity: s.entity,
        color: '#F59E0B',
        accentColor: 'rgba(245, 158, 11, 0.4)'
      };
    }
    if (selectedElectricalId === 'combiner' && s.combinerBox && s.combinerBox.position && s.combinerBox.isEnabled && (!s.combinerBox.entity || s.combinerBox.entity.show !== false)) {
      return {
        type: 'electrical',
        id: 'combiner',
        name: 'Combiner Box (Caja Strings)',
        pos: s.combinerBox.position,
        rot: s.combinerBox.rotation || 0,
        height: (s.combinerBox.carto ? s.combinerBox.carto.height : 0),
        entity: s.combinerBox.entity,
        color: '#10B981',
        accentColor: 'rgba(16, 185, 129, 0.4)'
      };
    }
    if (selectedElectricalId === 'meter' && s.gridMeter && s.gridMeter.position && (!s.gridMeter.entity || s.gridMeter.entity.show !== false)) {
      return {
        type: 'electrical',
        id: 'meter',
        name: 'Contador de Red & Acometida',
        pos: s.gridMeter.position,
        rot: s.gridMeter.rotation || 0,
        height: (s.gridMeter.carto ? s.gridMeter.carto.height : 0),
        entity: s.gridMeter.entity,
        color: '#38BDF8',
        accentColor: 'rgba(56, 189, 248, 0.4)'
      };
    }
    if (selectedElectricalId === 'dc_protection' && s.dcProtectionPosition && s.dcProtectionEntity && s.dcProtectionEntity.show !== false) {
      return {
        type: 'electrical',
        id: 'dc_protection',
        name: 'Cuadro Protección DC (SPD II)',
        pos: s.dcProtectionPosition,
        rot: s.dcProtectionRotation || 0,
        height: (s.dcProtectionCarto ? s.dcProtectionCarto.height : 0),
        entity: s.dcProtectionEntity,
        color: '#D97706',
        accentColor: 'rgba(217, 119, 6, 0.4)'
      };
    }
    if (selectedElectricalId === 'battery' && s.batteryPosition && s.batteryEntity && s.batteryEntity.show !== false) {
      return {
        type: 'electrical',
        id: 'battery',
        name: 'Sistema de Baterías LFP',
        pos: s.batteryPosition,
        rot: s.batteryRotation || 0,
        height: (s.batteryCarto ? s.batteryCarto.height : 0),
        entity: s.batteryEntity,
        color: '#10B981',
        accentColor: 'rgba(16, 185, 129, 0.4)'
      };
    }
  }

  // B. Obstáculos 3D
  if (typeof selectedObstacleId !== 'undefined' && selectedObstacleId && typeof getSelectedObstacle === 'function') {
    const obs = getSelectedObstacle();
    // B0. Si el obstáculo seleccionado es en realidad un aerogenerador eólico
    if (obs && obs.type === 'wind_turbine' && window.RAWind && window.RAWind.Entity) {
      const wt = (typeof window.windTurbines !== 'undefined' && Array.isArray(window.windTurbines))
        ? window.windTurbines.find(t => t && (t.id === obs.id || t.name === obs.name))
        : null;
      if (wt && wt.positionCartographic) {
        const basePos = Cesium.Cartesian3.fromRadians(
          wt.positionCartographic.longitudeRad,
          wt.positionCartographic.latitudeRad,
          wt.positionCartographic.altitudeM || 0
        );
        const enuMat = Cesium.Transforms.eastNorthUpToFixedFrame(basePos);
        const uVec = new Cesium.Cartesian3(enuMat[0], enuMat[1], enuMat[2]);
        const vVec = new Cesium.Cartesian3(enuMat[4], enuMat[5], enuMat[6]);
        const normal = new Cesium.Cartesian3(enuMat[8], enuMat[9], enuMat[10]);
        return {
          type: 'wind_turbine_entity',
          id: wt.id,
          name: (wt.name || 'Aerogenerador').toUpperCase(),
          pos: basePos,
          rot: Cesium.Math.toDegrees(wt.orientationRad || 0),
          height: (wt.supportStructure && wt.supportStructure.hubHeightM) || 18,
          rawObj: wt,
          wp: { origin: basePos, normal: normal, uVec: uVec, vVec: vVec, plane: { origin: basePos, normal: normal } },
          color: '#38BDF8',
          accentColor: 'rgba(56, 189, 248, 0.45)'
        };
      }
    }

    if (obs && obs.visible !== false) {
      const wp = typeof getObstacleActivePlane === 'function' ? getObstacleActivePlane(obs) : null;
      let baseCenter = null;
      let normal = null;
      let uVec = null;
      let vVec = null;

      if (wp && wp.origin && wp.normal && wp.uVec && wp.vVec) {
        normal = Cesium.Cartesian3.normalize(wp.normal, new Cesium.Cartesian3());
        uVec = Cesium.Cartesian3.normalize(wp.uVec, new Cesium.Cartesian3());
        vVec = Cesium.Cartesian3.normalize(wp.vVec, new Cesium.Cartesian3());
        baseCenter = Cesium.Cartesian3.add(
          wp.origin,
          Cesium.Cartesian3.add(
            Cesium.Cartesian3.multiplyByScalar(uVec, obs.u || 0, new Cesium.Cartesian3()),
            Cesium.Cartesian3.multiplyByScalar(vVec, obs.v || 0, new Cesium.Cartesian3()),
            new Cesium.Cartesian3()
          ),
          new Cesium.Cartesian3()
        );
      } else if (obs.cartesian) {
        baseCenter = (obs.cartesian instanceof Cesium.Cartesian3) ? obs.cartesian : new Cesium.Cartesian3(obs.cartesian.x, obs.cartesian.y, obs.cartesian.z);
        normal = Cesium.Cartesian3.normalize(baseCenter, new Cesium.Cartesian3());
        uVec = Cesium.Cartesian3.cross(normal, Cesium.Cartesian3.UNIT_Z, new Cesium.Cartesian3());
        if (Cesium.Cartesian3.magnitude(uVec) < 0.01) {
          uVec = Cesium.Cartesian3.cross(normal, Cesium.Cartesian3.UNIT_X, new Cesium.Cartesian3());
        }
        uVec = Cesium.Cartesian3.normalize(uVec, uVec);
        vVec = Cesium.Cartesian3.normalize(Cesium.Cartesian3.cross(normal, uVec, new Cesium.Cartesian3()), new Cesium.Cartesian3());
      }
      if (baseCenter && normal) {
        const isVertical = (obs.alignment !== 'coplanar');
        const getAxesFn = (typeof getObstacleOrientationAxes === 'function')
          ? getObstacleOrientationAxes
          : ((typeof window !== 'undefined' && typeof window.getObstacleOrientationAxes === 'function') ? window.getObstacleOrientationAxes : null);
        const vertAxes = getAxesFn ? getAxesFn(baseCenter, uVec, isVertical) : null;
        const effNormal = (isVertical && vertAxes) ? vertAxes.upVec : normal;
        const effUVec = (isVertical && vertAxes) ? vertAxes.uHoriz : uVec;
        const effVVec = (isVertical && vertAxes) ? vertAxes.vHoriz : vVec;

        const topCenter = Cesium.Cartesian3.add(
          baseCenter,
          Cesium.Cartesian3.multiplyByScalar(effNormal, (obs.h || 1.2) + 0.15, new Cesium.Cartesian3()),
          new Cesium.Cartesian3()
        );
        const effectiveWp = {
          origin: (wp && wp.origin) ? wp.origin : baseCenter,
          normal: effNormal,
          uVec: effUVec,
          vVec: effVVec,
          plane: { origin: baseCenter, normal: effNormal },
          roofWp: (wp && wp.origin && wp.normal && wp.uVec && wp.vVec) ? wp : null
        };
        return {
          type: 'obstacle',
          id: obs.id,
          name: (obs.name || 'Obstáculo').toUpperCase(),
          pos: topCenter,
          rot: obs.rot || 0,
          height: obs.h || 1.2,
          rawObj: obs,
          wp: effectiveWp,
          color: '#F59E0B',
          accentColor: 'rgba(245, 158, 11, 0.4)'
        };
      }
    }
  }

  // B2. Aerogeneradores 3D (RA-Wind)
  if (window.RAWindVisualizer && typeof window.RAWindVisualizer.getSelectedId === 'function') {
    const wtId = window.RAWindVisualizer.getSelectedId();
    if (wtId && window.RAWind && window.RAWind.Entity) {
      const wt = window.RAWind.Entity.getById(wtId);
      if (wt && wt.positionCartographic) {
        const basePos = Cesium.Cartesian3.fromRadians(
          wt.positionCartographic.longitudeRad,
          wt.positionCartographic.latitudeRad,
          wt.positionCartographic.altitudeM || 0
        );
        const enuMat = Cesium.Transforms.eastNorthUpToFixedFrame(basePos);
        const uVec = new Cesium.Cartesian3(enuMat[0], enuMat[1], enuMat[2]);
        const vVec = new Cesium.Cartesian3(enuMat[4], enuMat[5], enuMat[6]);
        const normal = new Cesium.Cartesian3(enuMat[8], enuMat[9], enuMat[10]);
        return {
          type: 'wind_turbine_entity',
          id: wt.id,
          name: (wt.name || 'Aerogenerador').toUpperCase(),
          pos: basePos,
          rot: Cesium.Math.toDegrees(wt.orientationRad || 0),
          height: (wt.supportStructure && wt.supportStructure.hubHeightM) || 18,
          rawObj: wt,
          wp: { origin: basePos, normal: normal, uVec: uVec, vVec: vVec, plane: { origin: basePos, normal: normal } },
          color: '#38BDF8',
          accentColor: 'rgba(56, 189, 248, 0.45)'
        };
      }
    }
  }

  // C. Edificios 3D
  if (typeof selectedBuildingId !== 'undefined' && selectedBuildingId && Array.isArray(buildings)) {
    const bld = buildings.find(b => b.id === selectedBuildingId);
    const bldPts = (bld && (bld.points || bld.polygon)) || null;
    if (bld && bld.visible !== false && Array.isArray(bldPts) && bldPts.length > 0) {
      const bldAxes = (typeof computeBuildingConstructionAxes === 'function')
        ? computeBuildingConstructionAxes(bld)
        : null;

      let center = (bldAxes && bldAxes.center) ? bldAxes.center : null;
      if (!center) {
        if (typeof computeBuildingCenter3D === 'function') {
          center = computeBuildingCenter3D(bld);
        } else {
          let sum = new Cesium.Cartesian3(0, 0, 0);
          bldPts.forEach(p => { sum = Cesium.Cartesian3.add(sum, p, sum); });
          center = Cesium.Cartesian3.multiplyByScalar(sum, 1.0 / bldPts.length, new Cesium.Cartesian3());
        }
      }

      let normal, uVec, vVec, gizmoRot;
      if (bldAxes && bldAxes.normal && bldAxes.uVec && bldAxes.vVec) {
        normal   = bldAxes.normal;
        uVec     = bldAxes.uVec;
        vVec     = bldAxes.vVec;
        gizmoRot = (bldAxes.axisMode === 'compass') ? (bld.roofAzimuth || 0) : 0;
      } else {
        normal = Cesium.Cartesian3.normalize(center, new Cesium.Cartesian3());
        const transform = Cesium.Transforms.eastNorthUpToFixedFrame(center);
        uVec = (typeof Cesium.Matrix4.multiplyByPointAsVector === 'function')
          ? Cesium.Matrix4.multiplyByPointAsVector(transform, Cesium.Cartesian3.UNIT_X, new Cesium.Cartesian3())
          : Cesium.Cartesian3.cross(normal, Cesium.Cartesian3.UNIT_Z, new Cesium.Cartesian3());
        Cesium.Cartesian3.normalize(uVec, uVec);
        vVec = Cesium.Cartesian3.normalize(Cesium.Cartesian3.cross(normal, uVec, new Cesium.Cartesian3()), new Cesium.Cartesian3());
        gizmoRot = bld.roofAzimuth || 0;
      }

      const bldWp = {
        origin: center,
        normal: normal,
        uVec: uVec,
        vVec: vVec,
        plane: { origin: center, normal: normal }
      };
      return {
        type: 'building',
        id: bld.id,
        name: (bld.name || 'Edificio 3D').toUpperCase(),
        pos: center,
        rot: gizmoRot,
        height: bld.height || 3.5,
        rawObj: bld,
        wp: bldWp,
        color: '#38BDF8',
        accentColor: 'rgba(56, 189, 248, 0.4)'
      };
    }
  }

  // D. Paneles FV Individuales
  if (typeof selectedPanelIndex !== 'undefined' && selectedPanelIndex >= 0 && typeof getSelectedPanel === 'function') {
    const panel = getSelectedPanel();
    if (panel && panel.visible !== false && panel.center) {
      const poly = (typeof WP !== 'undefined' && WP && WP.polylines && panel.polyIdx !== undefined) ? WP.polylines[panel.polyIdx] : null;
      if (poly && poly.panelsVisible === false) return null;
      const roof = (poly && poly.roofInfo) || (typeof lastRoofInfo !== 'undefined' ? lastRoofInfo : null);
      let wp = null;
      const _pHasCorners = panel.corners && panel.corners.length === 4;
      const _pRoofNormal = (roof && roof.normal) ? roof.normal : null;
      if (_pHasCorners && _pRoofNormal) {
        // Ejes locales del panel derivados de su geometría real (independiente de la orientación del faldón)
        const _pEdgeU = Cesium.Cartesian3.subtract(panel.corners[3], panel.corners[0], new Cesium.Cartesian3()); // Width
        const _pEdgeV = Cesium.Cartesian3.subtract(panel.corners[1], panel.corners[0], new Cesium.Cartesian3()); // Length
        const customNorm = Cesium.Cartesian3.normalize(Cesium.Cartesian3.cross(_pEdgeV, _pEdgeU, new Cesium.Cartesian3()), new Cesium.Cartesian3()); // UP
        wp = {
          origin: panel.center,
          normal: customNorm,
          uVec: Cesium.Cartesian3.normalize(_pEdgeU, new Cesium.Cartesian3()),
          vVec: Cesium.Cartesian3.normalize(_pEdgeV, new Cesium.Cartesian3()),
          plane: { origin: panel.center, normal: customNorm }
        };
      } else if (roof && roof.uVec && roof.vVec && roof.normal) {
        wp = {
          origin: panel.center,
          normal: roof.normal,
          uVec: roof.uVec,
          vVec: roof.vVec,
          plane: { origin: panel.center, normal: roof.normal }
        };
      } else if (typeof wpGetActivePlane === 'function') {
        const actPlane = wpGetActivePlane();
        if (actPlane && actPlane.normal && actPlane.uVec && actPlane.vVec) {
          wp = {
            origin: panel.center,
            normal: actPlane.normal,
            uVec: actPlane.uVec,
            vVec: actPlane.vVec,
            plane: { origin: panel.center, normal: actPlane.normal }
          };
        }
      }
      return {
        type: 'panel',
        id: selectedPanelIndex,
        name: 'Módulo FV #' + (selectedPanelIndex + 1),
        pos: panel.center,
        rot: panel.rot || 0,
        height: 0.2,
        rawObj: panel,
        wp: wp,
        color: '#F59E0B',
        accentColor: 'rgba(245, 158, 11, 0.4)'
      };
    }
  }

  // E. Vértices de Polilínea / Huella
  if (typeof getSelectedVertexData === 'function') {
    const vtxData = getSelectedVertexData();
    if (vtxData && vtxData.pt) {
      return {
        type: 'vertex',
        id: (vtxData.vIdx !== undefined ? vtxData.vIdx : 0),
        name: 'Vértice #' + ((vtxData.vIdx !== undefined ? vtxData.vIdx : 0) + 1),
        pos: vtxData.pt,
        rot: 0,
        height: 0,
        rawObj: vtxData,
        wp: vtxData.wp,
        color: '#38BDF8',
        accentColor: 'rgba(56, 189, 248, 0.4)'
      };
    }
  }

  // F0. Vértice Maestro del Plano de Trabajo Activo (P1, P2 o P3)
  const curStep = (typeof wpCurrentStep !== 'undefined') ? wpCurrentStep : ((typeof window !== 'undefined' && window.wpCurrentStep) || 1);
  if (curStep === 1 && typeof WP !== 'undefined' && WP && typeof WP.selectedPlaneVtxIdx === 'number' && WP.selectedPlaneVtxIdx >= 0) {
    if (typeof wpGetActivePlane === 'function') {
      const actPl = wpGetActivePlane();
      if (actPl && actPl.pts3D && actPl.pts3D[WP.selectedPlaneVtxIdx] && actPl.normal) {
        const pt = actPl.pts3D[WP.selectedPlaneVtxIdx];
        const vIdx = WP.selectedPlaneVtxIdx;
        const norm = Cesium.Cartesian3.normalize(actPl.normal, new Cesium.Cartesian3());
        const uVec = actPl.uVec ? Cesium.Cartesian3.normalize(actPl.uVec, new Cesium.Cartesian3()) : Cesium.Cartesian3.cross(norm, Cesium.Cartesian3.UNIT_Z, new Cesium.Cartesian3());
        const vVec = actPl.vVec ? Cesium.Cartesian3.normalize(actPl.vVec, new Cesium.Cartesian3()) : Cesium.Cartesian3.cross(norm, uVec, new Cesium.Cartesian3());
        const vtxNames = ['P1 (Origen)', 'P2 (Dirección X)', 'P3 (Dirección Y)'];
        return {
          type: 'workplane_vertex',
          id: 'wp_plane_vtx_' + vIdx,
          name: 'VÉRTICE PLANO #' + (vIdx + 1) + ' · ' + (vtxNames[vIdx] || ''),
          pos: pt,
          rot: 0,
          height: 0,
          rawObj: { plane: actPl, vtxIdx: vIdx },
          wp: {
            origin: pt,
            normal: norm,
            uVec: uVec,
            vVec: vVec,
            plane: { origin: pt, normal: norm }
          },
          color: vIdx === 0 ? '#F59E0B' : '#0284C7',
          accentColor: 'rgba(56, 189, 248, 0.45)'
        };
      }
    }
  }

  // F. Plano de Trabajo Activo (LCS Transformable: Traslación U/V/Z, Rotación Pitch/Yaw)
  if (curStep === 1 || window.wpIsPlaneGizmoEnabled) {
    if (typeof wpGetActivePlane === 'function') {
      const actPl = wpGetActivePlane();
      if (actPl && actPl.pts3D && actPl.pts3D.length >= 3 && actPl.normal) {
        const p1 = actPl.pts3D[0], p2 = actPl.pts3D[1], p3 = actPl.pts3D[2];
        const center = new Cesium.Cartesian3(
          (p1.x + p2.x + p3.x) / 3.0,
          (p1.y + p2.y + p3.y) / 3.0,
          (p1.z + p2.z + p3.z) / 3.0
        );
        const norm = Cesium.Cartesian3.normalize(actPl.normal, new Cesium.Cartesian3());
        const uVec = actPl.uVec ? Cesium.Cartesian3.normalize(actPl.uVec, new Cesium.Cartesian3()) : Cesium.Cartesian3.cross(norm, Cesium.Cartesian3.UNIT_Z, new Cesium.Cartesian3());
        const vVec = actPl.vVec ? Cesium.Cartesian3.normalize(actPl.vVec, new Cesium.Cartesian3()) : Cesium.Cartesian3.cross(norm, uVec, new Cesium.Cartesian3());
        return {
          type: 'workplane',
          id: actPl.id || 'plane_' + (WP.activePlaneIdx || 0),
          name: (actPl.name || 'Plano de Trabajo').toUpperCase(),
          pos: center,
          rot: 0,
          height: 0,
          rawObj: actPl,
          wp: {
            origin: center,
            normal: norm,
            uVec: uVec,
            vVec: vVec,
            plane: { origin: center, normal: norm }
          },
          color: '#38BDF8',
          accentColor: 'rgba(56, 189, 248, 0.45)'
        };
      }
    }
  }

  return null;
}

// 2. RENDERIZADO VISUAL UNIFICADO EN CANVAS 2D OVERLAY (CALIDAD AAA)
function renderUniversalGizmo2D() {
  if (!triadCtx || !triadCanvas || !scene) return;
  const target = getUniversalSelectedTarget();
  if (!target || !target.pos) {
    universalGizmoState.screen = null;
    return;
  }

  const pCenter = Cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, target.pos);
  if (!pCenter || typeof pCenter.x !== 'number' || !Number.isFinite(pCenter.x)) {
    universalGizmoState.screen = null;
    return;
  }

  const camPos = (camera && camera.positionWC) ? camera.positionWC : ((camera && camera.position) ? camera.position : null);
  const dist = camPos ? Cesium.Cartesian3.distance(camPos, target.pos) : 80;
  const distScale = Math.min(2.5, Math.max(0.75, Math.sqrt(dist / 45.0)));
  const scale = distScale * (triadState.scale || 1.0);

  // Ejes Normalizados ENU (Este, Norte, Arriba) o del Plano Local
  let uVec, vVec, zVec;
  if (target.wp && target.wp.uVec && target.wp.vVec && target.wp.normal) {
    const rotRad = Cesium.Math.toRadians(target.rot || 0);
    const cosR = Math.cos(rotRad);
    const sinR = Math.sin(rotRad);
    uVec = Cesium.Cartesian3.add(
      Cesium.Cartesian3.multiplyByScalar(target.wp.uVec, cosR, new Cesium.Cartesian3()),
      Cesium.Cartesian3.multiplyByScalar(target.wp.vVec, sinR, new Cesium.Cartesian3()),
      new Cesium.Cartesian3()
    );
    vVec = Cesium.Cartesian3.add(
      Cesium.Cartesian3.multiplyByScalar(target.wp.uVec, -sinR, new Cesium.Cartesian3()),
      Cesium.Cartesian3.multiplyByScalar(target.wp.vVec, cosR, new Cesium.Cartesian3()),
      new Cesium.Cartesian3()
    );
    zVec = target.wp.normal;
  } else {
    const enuMat = Cesium.Transforms.eastNorthUpToFixedFrame(target.pos);
    const rotRad = Cesium.Math.toRadians(target.rot || 0);
    const cosR = Math.cos(rotRad);
    const sinR = Math.sin(rotRad);
    const rawEast = new Cesium.Cartesian3(enuMat[0], enuMat[1], enuMat[2]);
    const rawNorth = new Cesium.Cartesian3(enuMat[4], enuMat[5], enuMat[6]);
    uVec = Cesium.Cartesian3.add(
      Cesium.Cartesian3.multiplyByScalar(rawEast, cosR, new Cesium.Cartesian3()),
      Cesium.Cartesian3.multiplyByScalar(rawNorth, sinR, new Cesium.Cartesian3()),
      new Cesium.Cartesian3()
    );
    vVec = Cesium.Cartesian3.add(
      Cesium.Cartesian3.multiplyByScalar(rawEast, -sinR, new Cesium.Cartesian3()),
      Cesium.Cartesian3.multiplyByScalar(rawNorth, cosR, new Cesium.Cartesian3()),
      new Cesium.Cartesian3()
    );
    zVec = new Cesium.Cartesian3(enuMat[8], enuMat[9], enuMat[10]);
  }

  const armLen = Math.max(dist * 0.045, 1.8) * scale;
  const tipU3D = Cesium.Cartesian3.add(target.pos, Cesium.Cartesian3.multiplyByScalar(uVec, armLen, new Cesium.Cartesian3()), new Cesium.Cartesian3());
  const tipV3D = Cesium.Cartesian3.add(target.pos, Cesium.Cartesian3.multiplyByScalar(vVec, armLen, new Cesium.Cartesian3()), new Cesium.Cartesian3());
  const tipZ3D = Cesium.Cartesian3.add(target.pos, Cesium.Cartesian3.multiplyByScalar(zVec, armLen * 0.9, new Cesium.Cartesian3()), new Cesium.Cartesian3());

  let pU = Cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, tipU3D);
  let pV = Cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, tipV3D);
  let pZ = Cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, tipZ3D);

  const ox = pCenter.x;
  const oy = pCenter.y;
  const ringRadius = 48 * scale;

  // [CAD PROJECTION FIX] Limitar la longitud visual en pantalla a una escala ergonómica (~52px * scale)
  // para mantener las flechas y sus cabezas compactas y legibles independientemente del zoom
  const targetArmPx = 52 * scale;
  let armLenU = armLen, armLenV = armLen, armLenZ = armLen * 0.9;
  function clampScreenTip(pTip, baseArm) {
    if (!pTip || typeof pTip.x !== 'number') return { p: pTip, arm: baseArm };
    const dx = pTip.x - ox;
    const dy = pTip.y - oy;
    const len = Math.hypot(dx, dy);
    if (len > targetArmPx && len > 0.5) {
      const ratio = targetArmPx / len;
      return {
        p: { x: ox + dx * ratio, y: oy + dy * ratio },
        arm: baseArm * ratio
      };
    }
    return { p: pTip, arm: baseArm };
  }

  const cU = clampScreenTip(pU, armLen);
  const cV = clampScreenTip(pV, armLen);
  const cZ = clampScreenTip(pZ, armLen * 0.9);
  pU = cU.p; armLenU = cU.arm;
  pV = cV.p; armLenV = cV.arm;
  pZ = cZ.p; armLenZ = cZ.arm;

  universalGizmoState.screen = {
    ox, oy,
    pU: pU || { x: ox + 50, y: oy },
    pV: pV || { x: ox, y: oy - 50 },
    pZ: pZ || { x: ox, y: oy - 55 },
    uVec: Cesium.Cartesian3.clone(uVec),
    vVec: Cesium.Cartesian3.clone(vVec),
    zVec: Cesium.Cartesian3.clone(zVec),
    ringRadius,
    scale,
    armLen,
    armLenU,
    armLenV,
    armLenZ,
    color: target.color,
    targetType: target.type
  };

  const ctx = triadCtx;
  const hovered = universalGizmoState.hoveredPart;
  const hasRotation = (target.type !== 'vertex'); // Los vértices no tienen rotación propia

  ctx.save();

  const isRotateMode = (universalGizmoState.gizmoMode === 'rotate' && hasRotation);

  // 1. Halo Central Translúcido
  ctx.beginPath();
  ctx.arc(ox, oy, 24 * scale, 0, Math.PI * 2);
  ctx.fillStyle = target.accentColor;
  ctx.fill();
  ctx.strokeStyle = target.color;
  ctx.lineWidth = (hovered === 'center-drag' || universalGizmoState.active) ? 3.5 : 2.0;
  ctx.stroke();

  // Helper para dibujar anillo 3D proyectado sobre un plano determinado
  function drawProjectedRing(vec1, vec2, radius, color, isHovered) {
    const SEGMENTS = 48;
    ctx.beginPath();
    let firstPt = null;
    const pts = [];
    for (let i = 0; i <= SEGMENTS; i++) {
      const theta = (i / SEGMENTS) * Math.PI * 2;
      const cosT = Math.cos(theta) * radius;
      const sinT = Math.sin(theta) * radius;
      const p3D = Cesium.Cartesian3.add(
        target.pos,
        Cesium.Cartesian3.add(
          Cesium.Cartesian3.multiplyByScalar(vec1, cosT, new Cesium.Cartesian3()),
          Cesium.Cartesian3.multiplyByScalar(vec2, sinT, new Cesium.Cartesian3()),
          new Cesium.Cartesian3()
        ),
        new Cesium.Cartesian3()
      );
      const scr = Cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, p3D);
      if (scr) {
        pts.push(scr);
        if (!firstPt) { ctx.moveTo(scr.x, scr.y); firstPt = scr; }
        else { ctx.lineTo(scr.x, scr.y); }
      }
    }
    if (pts.length > 3) {
      ctx.strokeStyle = isHovered ? '#FFFFFF' : color;
      ctx.lineWidth = isHovered ? 4.5 : 2.5;
      ctx.stroke();
    }
    return pts;
  }

  // A. MODO ROTACIÓN (3 ANILLOS ORTOGONALES 3D: U, V, Z)
  if (isRotateMode) {
    const ringRadius3D = armLen * 0.95;
    // Anillo Pitch (Alrededor de Eje V / Plano U-Z) -> Verde Esmeralda #10B981
    const ringV_pts = drawProjectedRing(uVec, zVec, ringRadius3D, 'rgba(16, 185, 129, 0.9)', hovered === 'rotate-v');
    // Anillo Roll (Alrededor de Eje U / Plano V-Z) -> Rojo Coral #EF4444
    const ringU_pts = drawProjectedRing(vVec, zVec, ringRadius3D, 'rgba(239, 68, 68, 0.9)', hovered === 'rotate-u');
    // Anillo Yaw (Alrededor de Eje Z / Plano U-V) -> Azul Cian #0EA5E9
    const ringZ_pts = drawProjectedRing(uVec, vVec, ringRadius3D, 'rgba(14, 165, 233, 0.9)', hovered === 'rotate-z' || hovered === 'rotate-ring');

    universalGizmoState.screen.ringRadius3D = ringRadius3D;
    universalGizmoState.screen.ringU_pts = ringU_pts;
    universalGizmoState.screen.ringV_pts = ringV_pts;
    universalGizmoState.screen.ringZ_pts = ringZ_pts;
  } 
  // B. MODO TRASLACIÓN (3 FLECHAS LINEALES: U, V, Z)
  else {
    // 3. Eje U (Rojo Coral #EF4444)
    if (pU) {
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(pU.x, pU.y);
      ctx.strokeStyle = (hovered === 'u-axis') ? '#FF2E55' : '#EF4444';
      ctx.lineWidth = (hovered === 'u-axis') ? 4.5 : 2.8;
      ctx.stroke();

      const angU = Math.atan2(pU.y - oy, pU.x - ox);
      ctx.beginPath();
      ctx.moveTo(pU.x, pU.y);
      ctx.lineTo(pU.x - 10 * Math.cos(angU - Math.PI / 6), pU.y - 10 * Math.sin(angU - Math.PI / 6));
      ctx.lineTo(pU.x - 10 * Math.cos(angU + Math.PI / 6), pU.y - 10 * Math.sin(angU + Math.PI / 6));
      ctx.closePath();
      ctx.fillStyle = (hovered === 'u-axis') ? '#FFF' : '#EF4444';
      ctx.fill();
    }

    // 4. Eje V (Verde Esmeralda #10B981)
    if (pV) {
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(pV.x, pV.y);
      ctx.strokeStyle = (hovered === 'v-axis') ? '#34D399' : '#10B981';
      ctx.lineWidth = (hovered === 'v-axis') ? 4.5 : 2.8;
      ctx.stroke();

      const angV = Math.atan2(pV.y - oy, pV.x - ox);
      ctx.beginPath();
      ctx.moveTo(pV.x, pV.y);
      ctx.lineTo(pV.x - 10 * Math.cos(angV - Math.PI / 6), pV.y - 10 * Math.sin(angV - Math.PI / 6));
      ctx.lineTo(pV.x - 10 * Math.cos(angV + Math.PI / 6), pV.y - 10 * Math.sin(angV + Math.PI / 6));
      ctx.closePath();
      ctx.fillStyle = (hovered === 'v-axis') ? '#FFF' : '#10B981';
      ctx.fill();
    }

    // 5. Eje Z (Azul Cian #0EA5E9) - LIBRE 3D
    if (pZ) {
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(pZ.x, pZ.y);
      ctx.strokeStyle = (hovered === 'z-axis') ? '#67E8F9' : '#0EA5E9';
      ctx.lineWidth = (hovered === 'z-axis') ? 4.5 : 2.8;
      ctx.stroke();

      const angZ = Math.atan2(pZ.y - oy, pZ.x - ox);
      ctx.beginPath();
      ctx.moveTo(pZ.x, pZ.y);
      ctx.lineTo(pZ.x - 10 * Math.cos(angZ - Math.PI / 6), pZ.y - 10 * Math.sin(angZ - Math.PI / 6));
      ctx.lineTo(pZ.x - 10 * Math.cos(angZ + Math.PI / 6), pZ.y - 10 * Math.sin(angZ + Math.PI / 6));
      ctx.closePath();
      ctx.fillStyle = (hovered === 'z-axis') ? '#FFF' : '#0EA5E9';
      ctx.fill();
    }
  }

  // 6. Centroide Manipulador
  ctx.beginPath();
  ctx.arc(ox, oy, 7 * scale, 0, Math.PI * 2);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.strokeStyle = '#0F172A';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // 7. Badge Flotante Superior Informativo con Switch W/E y Atajo [SUPR]
  let badgeText = target.name.toUpperCase();
  if (target.rawObj && typeof target.rawObj.w === 'number' && typeof target.rawObj.l === 'number' && typeof target.rawObj.h === 'number') {
    badgeText += ' (' + target.rawObj.w.toFixed(1) + 'x' + target.rawObj.l.toFixed(1) + 'x' + target.rawObj.h.toFixed(1) + 'm)';
  }
  if (hasRotation) {
    badgeText += ' · ' + Math.round(target.rot || 0) + '°';
    badgeText += isRotateMode ? ' · [E: ROTAR 3D]' : ' · [W: MOVER 3D]';
  }
  badgeText += ' · [SUPR] BORRAR';

  ctx.font = 'bold 9.5px "JetBrains Mono", monospace';
  const textWidth = ctx.measureText(badgeText).width;
  const badgeX = ox - textWidth / 2 - 8;
  const badgeY = oy - (ringRadius + 18 * scale);

  ctx.fillStyle = isRotateMode ? 'rgba(15, 23, 42, 0.96)' : 'rgba(15, 23, 42, 0.92)';
  ctx.strokeStyle = isRotateMode ? '#F59E0B' : target.color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(badgeX, badgeY - 14, textWidth + 16, 20, 5);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = isRotateMode ? '#FDE047' : '#FFFFFF';
  ctx.fillText(badgeText, badgeX + 8, badgeY);

  universalGizmoState.screen.badgeBox = { x: badgeX, y: badgeY - 14, w: textWidth + 16, h: 20 };

  // 8. Tirador 3D de Ángulo para Edificios Paramétricos en L (45° - 165°)
  universalGizmoState.screen.lAngleHandle = null;
  if (target.type === 'building' && target.rawObj && typeof window !== 'undefined' && window.RALBuilding && typeof window.RALBuilding.getAngleHandle3D === 'function') {
    const lh = window.RALBuilding.getAngleHandle3D(target.rawObj);
    if (lh && lh.cornerPos && lh.handlePos && lh.wingAPos) {
      const pC = Cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, lh.cornerPos);
      const pH = Cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, lh.handlePos);
      const pA = Cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, lh.wingAPos);
      if (pC && pH && pA && Number.isFinite(pH.x) && Number.isFinite(pH.y)) {
        const isLHover = (hovered === 'l-angle-drag' || universalGizmoState.mode === 'l-angle-drag');

        // Previsualización wireframe en vivo a 60 FPS durante arrastre del ángulo
        if (universalGizmoState.active && universalGizmoState.mode === 'l-angle-drag' && Array.isArray(target.rawObj.points) && target.rawObj.points.length >= 3) {
          const topH = lh.planeHeight + Math.max(target.rawObj.height || 6.5, 1.0);
          const scrPts = target.rawObj.points.map(pt => {
            const c = Cesium.Cartographic.fromCartesian(pt);
            const ptTop = c ? Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, topH) : pt;
            return Cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, ptTop);
          }).filter(sPt => sPt && Number.isFinite(sPt.x));
          if (scrPts.length >= 3) {
            ctx.beginPath();
            scrPts.forEach((sp, idx) => {
              if (idx === 0) ctx.moveTo(sp.x, sp.y);
              else ctx.lineTo(sp.x, sp.y);
            });
            ctx.closePath();
            ctx.fillStyle = 'rgba(16, 185, 129, 0.16)';
            ctx.fill();
            ctx.setLineDash([6, 4]);
            ctx.strokeStyle = '#34D399';
            ctx.lineWidth = 2.5;
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }

        // Líneas guía esquina exterior -> puntas de alas + manejador circular interactivo
        ctx.save();
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = isLHover ? '#6EE7B7' : 'rgba(52, 211, 153, 0.75)';
        ctx.lineWidth = isLHover ? 2.5 : 1.8;
        ctx.beginPath();
        ctx.moveTo(pA.x, pA.y);
        ctx.lineTo(pC.x, pC.y);
        ctx.lineTo(pH.x, pH.y);
        ctx.stroke();
        ctx.setLineDash([]);

        const hRadius = (isLHover ? 11 : 9) * scale;
        ctx.beginPath();
        ctx.arc(pH.x, pH.y, hRadius, 0, Math.PI * 2);
        ctx.fillStyle = isLHover ? '#34D399' : '#059669';
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2.2;
        ctx.stroke();

        const angLbl = '∠ ' + Math.round(lh.angleDeg) + '°';
        ctx.font = 'bold 10px "JetBrains Mono", monospace';
        const tw = ctx.measureText(angLbl).width;
        const bx = pH.x + 12;
        const by = pH.y - 10;
        ctx.fillStyle = 'rgba(6, 78, 59, 0.94)';
        ctx.strokeStyle = '#34D399';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.roundRect(bx, by - 12, tw + 12, 18, 4);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#ECFDF5';
        ctx.fillText(angLbl, bx + 6, by);
        ctx.restore();

        universalGizmoState.screen.lAngleHandle = {
          x: pH.x,
          y: pH.y,
          r: 15 * scale,
          cornerPos: lh.cornerPos,
          wingAPos: lh.wingAPos,
          planeHeight: lh.planeHeight
        };
      }
    }
  }

  ctx.restore();
}

// 3. HIT TESTING UNIVERSAL DE GIZMO
function checkUniversalGizmoHit(mx, my) {
  const target = getUniversalSelectedTarget();
  if (!target || !universalGizmoState.screen) return null;
  const s = universalGizmoState.screen;
  const dx = mx - s.ox;
  const dy = my - s.oy;
  const distCenter = Math.sqrt(dx * dx + dy * dy);

  // A. Click sobre el badge para alternar modo [W / E]
  if (s.badgeBox && mx >= s.badgeBox.x && mx <= s.badgeBox.x + s.badgeBox.w && my >= s.badgeBox.y && my <= s.badgeBox.y + s.badgeBox.h) {
    return 'badge-toggle';
  }

  // A2. Tirador 3D de ángulo para edificios paramétricos en L
  if (s.lAngleHandle && Math.hypot(mx - s.lAngleHandle.x, my - s.lAngleHandle.y) <= s.lAngleHandle.r) {
    return 'l-angle-drag';
  }

  // B. Centroide (Arrastre Libre 3D)
  if (distCenter <= 20 * s.scale) {
    return 'center-drag';
  }

  const isRotateMode = (universalGizmoState.gizmoMode === 'rotate' && target.type !== 'vertex');

  // C. MODO ROTACIÓN: Hit testing de los 3 anillos elípticos
  if (isRotateMode) {
    function distToPolyline(pts) {
      if (!Array.isArray(pts) || pts.length < 2) return Infinity;
      let minD = Infinity;
      for (let i = 0; i < pts.length; i++) {
        const p1 = pts[i];
        const p2 = pts[(i + 1) % pts.length];
        const segDx = p2.x - p1.x, segDy = p2.y - p1.y;
        const l2 = segDx * segDx + segDy * segDy;
        let d;
        if (l2 < 1) {
          d = Math.hypot(mx - p1.x, my - p1.y);
        } else {
          const t = Math.max(0, Math.min(1, ((mx - p1.x) * segDx + (my - p1.y) * segDy) / l2));
          const projX = p1.x + t * segDx, projY = p1.y + t * segDy;
          d = Math.hypot(mx - projX, my - projY);
        }
        if (d < minD) minD = d;
      }
      return minD;
    }

    const dZ = distToPolyline(s.ringZ_pts);
    const dV = distToPolyline(s.ringV_pts);
    const dU = distToPolyline(s.ringU_pts);

    const hitThreshold = 10 * s.scale;
    const minD = Math.min(dZ, dV, dU);
    if (minD <= hitThreshold) {
      if (minD === dZ) return 'rotate-z';
      if (minD === dV) return 'rotate-v';
      return 'rotate-u';
    }
    return null;
  }

  // D. MODO TRASLACIÓN: Hit testing de flechas U, V, Z
  // Eje U
  const duX = s.pU.x - s.ox, duY = s.pU.y - s.oy;
  const lenU = Math.sqrt(duX * duX + duY * duY);
  if (lenU > 1) {
    const projU = (dx * duX + dy * duY) / lenU;
    const perpU = Math.abs(-dx * duY + dy * duX) / lenU;
    if (projU >= 0 && projU <= lenU + 12 && perpU <= 14 * s.scale) return 'u-axis';
  }

  // Eje V
  const dvX = s.pV.x - s.ox, dvY = s.pV.y - s.oy;
  const lenV = Math.sqrt(dvX * dvX + dvY * dvY);
  if (lenV > 1) {
    const projV = (dx * dvX + dy * dvY) / lenV;
    const perpV = Math.abs(-dx * dvY + dy * dvX) / lenV;
    if (projV >= 0 && projV <= lenV + 12 && perpV <= 14 * s.scale) return 'v-axis';
  }

  // Eje Z (Libre)
  const dzX = s.pZ.x - s.ox, dzY = s.pZ.y - s.oy;
  const lenZ = Math.sqrt(dzX * dzX + dzY * dzY);
  if (lenZ > 1) {
    const projZ = (dx * dzX + dy * dzY) / lenZ;
    const perpZ = Math.abs(-dx * dzY + dy * dzX) / lenZ;
    if (projZ >= 0 && projZ <= lenZ + 12 && perpZ <= 14 * s.scale) return 'z-axis';
  }

  return null;
}

// 4. DESPACHADOR UNIVERSAL DE BORRADO CON TECLA SUPR
function deleteUniversalSelectedObject() {
  if (window.selectedRouteVertex) {
    if (typeof wpDeleteSelectedRouteVertex === 'function' && wpDeleteSelectedRouteVertex()) return true;
  }
  const target = getUniversalSelectedTarget();
  if (!target) return false;

  if (target.type === 'wind_turbine_entity') {
    if (window.RAWind && window.RAWind.Entity && typeof window.RAWind.Entity.removeFromScene === 'function') {
      window.RAWind.Entity.removeFromScene(target.id);
      if (window.RAWindVisualizer && typeof window.RAWindVisualizer.selectTurbine === 'function') {
        window.RAWindVisualizer.selectTurbine(null);
      }
      if (typeof renderTriad2D === 'function') renderTriad2D();
      if (typeof showStatus === 'function') showStatus('<i data-lucide="trash-2" class="icon-sm"></i> AEROGENERADOR ELIMINADO', 2500);
      return true;
    }
  }
  if (target.type === 'electrical') {
    deleteSelectedElectricalEquipment();
    return true;
  }
  if (target.type === 'obstacle' && typeof deleteSelectedObstacle === 'function') {
    deleteSelectedObstacle();
    return true;
  }
  if (target.type === 'building' && typeof deleteBuilding === 'function') {
    deleteBuilding(target.id);
    return true;
  }
  if (target.type === 'panel' && typeof deleteSelectedPanel === 'function') {
    deleteSelectedPanel();
    return true;
  }
  if (target.type === 'vertex') {
    if (typeof wpDeleteSelectedVertexFromList === 'function') {
      wpDeleteSelectedVertexFromList();
    } else if (typeof wpDeleteSelectedVtx === 'function') {
      wpDeleteSelectedVtx();
    }
    return true;
  }
  return false;
}

// 5. CONTROLADOR POLIMÓRFICO UNIVERSAL DE TRANSFORMACIÓN 3D (POSICIÓN & ROTACIÓN)
function updateUniversalTargetTransform(target, newPos, newRotDeg, deltaDeg, rotAxis) {
  if (!target) return false;

  // A. APLICAR ROTACIÓN (SI SE ESPECIFICA)
  if ((typeof newRotDeg === 'number' && Number.isFinite(newRotDeg)) || (typeof deltaDeg === 'number' && Number.isFinite(deltaDeg))) {
    const normRot = (typeof newRotDeg === 'number') ? (((newRotDeg % 360) + 360) % 360) : (target.rot || 0);

    // Eje de rotación (por defecto la normal del plano o eje Z local)
    const effectiveAxis = rotAxis || (target.wp && target.wp.normal) || (universalGizmoState.screen && universalGizmoState.screen.zVec) || new Cesium.Cartesian3(0, 0, 1);
    const dDeg = (typeof deltaDeg === 'number' && Number.isFinite(deltaDeg)) ? deltaDeg : 0;

    if (target.type === 'electrical') {
      if (!window.inverterEquipmentState) window.inverterEquipmentState = {};
      let effEnt = null;
      let effPos = null;
      if (target.id === 'inverter') {
        window.inverterEquipmentState.rotation = normRot;
        effEnt = window.inverterEquipmentState.entity;
        effPos = window.inverterEquipmentState.position;
      } else if (target.id === 'dc_protection') {
        window.inverterEquipmentState.dcProtectionRotation = normRot;
        effEnt = window.inverterEquipmentState.dcProtectionEntity;
        effPos = window.inverterEquipmentState.dcProtectionPosition;
      } else if (target.id === 'combiner' && window.inverterEquipmentState.combinerBox) {
        window.inverterEquipmentState.combinerBox.rotation = normRot;
        effEnt = window.inverterEquipmentState.combinerBox.entity;
        effPos = window.inverterEquipmentState.combinerBox.position;
      } else if (target.id === 'meter' && window.inverterEquipmentState.gridMeter) {
        window.inverterEquipmentState.gridMeter.rotation = normRot;
        effEnt = window.inverterEquipmentState.gridMeter.entity;
        effPos = window.inverterEquipmentState.gridMeter.position;
      } else if (target.id === 'battery') {
        window.inverterEquipmentState.batteryRotation = normRot;
        effEnt = window.inverterEquipmentState.batteryEntity;
        effPos = window.inverterEquipmentState.batteryPosition;
      }
      if (effEnt && effPos) {
        try {
          const hpr = new Cesium.HeadingPitchRoll(Cesium.Math.toRadians(normRot), 0, 0);
          effEnt.orientation = Cesium.Transforms.headingPitchRollQuaternion(effPos, hpr);
        } catch(eRot) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(eRot, 'Entidad/Primitiva Cesium'); }
      }
      // [P2] Cables NO se regeneran por frame durante el drag (regla §5): LEFT_UP ya los re-renderiza
      if (!universalGizmoState.active && typeof wpCalculateAndRenderInverterCables === 'function') wpCalculateAndRenderInverterCables();
      if (typeof wpUpdateSolarMetricsUI === 'function') wpUpdateSolarMetricsUI();
    } else if (target.type === 'obstacle' && target.rawObj) {
      // [ROT-3D] Aplicar el giro al eje del anillo arrastrado (u/v/z). El motor de matrices
      // ya soportaba rotU/rotV (computeObstacleRotationMatrix) pero nadie los escribía.
      const _rotMode = universalGizmoState.mode;
      if (_rotMode === 'rotate-u') target.rawObj.rotU = Math.round(normRot);
      else if (_rotMode === 'rotate-v') target.rawObj.rotV = Math.round(normRot);
      else target.rawObj.rot = Math.round(normRot);
      const fnUpdateRot = (typeof updateObstacleLiveModelMatrix === 'function')
        ? updateObstacleLiveModelMatrix
        : (typeof window !== 'undefined' && typeof window.updateObstacleLiveModelMatrix === 'function' ? window.updateObstacleLiveModelMatrix : null);
      if (typeof fnUpdateRot === 'function') {
        try { fnUpdateRot(target.rawObj, target); } catch(eObsM) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(eObsM, 'Entidad/Primitiva Cesium'); }
      }
    } else if (target.type === 'building' && target.rawObj) {
      const bld = target.rawObj;
      const ptsArr = bld.points || bld.polygon;
      if (Array.isArray(ptsArr) && universalGizmoState.startPoints && universalGizmoState.startPoints.length === ptsArr.length && dDeg !== 0) {
        const rotCenter = universalGizmoState.startCenter || target.pos;
        const zAxis = (target.wp && target.wp.normal) ? target.wp.normal : effectiveAxis;
        const rotQuat = Cesium.Quaternion.fromAxisAngle(zAxis, Cesium.Math.toRadians(dDeg));
        const rotMat3 = Cesium.Matrix3.fromQuaternion(rotQuat);
        for (let i = 0; i < ptsArr.length; i++) {
          const rel = Cesium.Cartesian3.subtract(universalGizmoState.startPoints[i], rotCenter, new Cesium.Cartesian3());
          const rotatedRel = Cesium.Matrix3.multiplyByVector(rotMat3, rel, new Cesium.Cartesian3());
          ptsArr[i] = Cesium.Cartesian3.add(rotCenter, rotatedRel, new Cesium.Cartesian3());
        }
        const updatedAxes = (typeof computeBuildingConstructionAxes === 'function') ? computeBuildingConstructionAxes(bld) : null;
        if (updatedAxes && typeof updatedAxes.normalAzimuthDeg === 'number') {
          bld.roofAzimuth = Math.round(updatedAxes.normalAzimuthDeg);
        } else {
          bld.roofAzimuth = Math.round(normRot);
        }
        if (typeof syncBuildingAxesInspectorUI === 'function') syncBuildingAxesInspectorUI(bld);
        if (typeof window !== 'undefined' && window.RALBuilding && typeof window.RALBuilding.syncAnchorFromPoints === 'function') {
          window.RALBuilding.syncAnchorFromPoints(bld);
        }
      } else {
        bld.roofAzimuth = Math.round(normRot);
      }
      // Reconstrucción GPU pesada diferida a LEFT_UP (index.html:15829) para garantizar 60 FPS
    } else if (target.type === 'wind_turbine_entity' && target.rawObj) {
      const wt = target.rawObj;
      wt.orientationRad = Cesium.Math.toRadians(normRot);
      if (window.RAWindVisualizer && typeof window.RAWindVisualizer.updateLiveModelMatrix === 'function') {
        window.RAWindVisualizer.updateLiveModelMatrix(wt);
      }
    } else if (target.type === 'panel' && target.rawObj) {
      const p = target.rawObj;
      p.rot = Math.round(normRot);
      p.isManual = true;
      if (universalGizmoState.startCorners && dDeg !== 0) {
        const rotQuat = Cesium.Quaternion.fromAxisAngle(effectiveAxis, Cesium.Math.toRadians(dDeg));
        const rotMat3 = Cesium.Matrix3.fromQuaternion(rotQuat);
        p.corners = universalGizmoState.startCorners.map(c => {
          const rel = Cesium.Cartesian3.subtract(c, p.center, new Cesium.Cartesian3());
          const rotatedRel = Cesium.Matrix3.multiplyByVector(rotMat3, rel, new Cesium.Cartesian3());
          return Cesium.Cartesian3.add(p.center, rotatedRel, new Cesium.Cartesian3());
        });
        if (p.rawPanel) {
          p.rawPanel.corners = p.corners;
          p.rawPanel.rot = p.rot;
          p.rawPanel.isManual = true;
        }
      }
      if (panelOutlineEntity && p.corners && p.corners.length === 4) {
        panelOutlineEntity.polyline.positions = [p.corners[0], p.corners[1], p.corners[2], p.corners[3], Cesium.Cartesian3.clone(p.corners[0])];
      }
    } else if (target.type === 'workplane' && target.rawObj) {
      const pl = target.rawObj;
      const _rotMode = universalGizmoState.mode;
      const rotQuat = Cesium.Quaternion.fromAxisAngle(effectiveAxis, Cesium.Math.toRadians(dDeg));
      const rotMat3 = Cesium.Matrix3.fromQuaternion(rotQuat);

      if (universalGizmoState.startPoints && universalGizmoState.startCenter && Array.isArray(pl.pts3D)) {
        const center = universalGizmoState.startCenter;
        pl.pts3D = universalGizmoState.startPoints.map(pt => {
          const rel = Cesium.Cartesian3.subtract(pt, center, new Cesium.Cartesian3());
          const rotRel = Cesium.Matrix3.multiplyByVector(rotMat3, rel, new Cesium.Cartesian3());
          return Cesium.Cartesian3.add(center, rotRel, new Cesium.Cartesian3());
        });
        if (universalGizmoState.startOrigin) {
          const relOrg = Cesium.Cartesian3.subtract(universalGizmoState.startOrigin, center, new Cesium.Cartesian3());
          const rotOrg = Cesium.Matrix3.multiplyByVector(rotMat3, relOrg, new Cesium.Cartesian3());
          pl.origin = Cesium.Cartesian3.add(center, rotOrg, new Cesium.Cartesian3());
        }
        if (universalGizmoState.startNormal) {
          pl.normal = Cesium.Matrix3.multiplyByVector(rotMat3, universalGizmoState.startNormal, new Cesium.Cartesian3());
          Cesium.Cartesian3.normalize(pl.normal, pl.normal);
        }
        if (universalGizmoState.startUVec) {
          pl.uVec = Cesium.Matrix3.multiplyByVector(rotMat3, universalGizmoState.startUVec, new Cesium.Cartesian3());
          Cesium.Cartesian3.normalize(pl.uVec, pl.uVec);
        }
        if (universalGizmoState.startVVec) {
          pl.vVec = Cesium.Matrix3.multiplyByVector(rotMat3, universalGizmoState.startVVec, new Cesium.Cartesian3());
          Cesium.Cartesian3.normalize(pl.vVec, pl.vVec);
        }

        // Recalcular inclinación y azimut desde la nueva normal
        const radial = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(center, new Cesium.Cartesian3());
        const cosTilt = Math.abs(Cesium.Cartesian3.dot(pl.normal, radial));
        pl.tiltDeg = Cesium.Math.toDegrees(Math.acos(Cesium.Math.clamp(cosTilt, 0, 1)));
        const east = Cesium.Cartesian3.normalize(Cesium.Cartesian3.cross(Cesium.Cartesian3.UNIT_Z, radial, new Cesium.Cartesian3()), new Cesium.Cartesian3());
        const northVec = Cesium.Cartesian3.normalize(Cesium.Cartesian3.cross(radial, east, new Cesium.Cartesian3()), new Cesium.Cartesian3());
        const nDotNorth = Cesium.Cartesian3.dot(pl.normal, northVec);
        const nDotEast = Cesium.Cartesian3.dot(pl.normal, east);
        let az = Cesium.Math.toDegrees(Math.atan2(nDotEast, nDotNorth));
        pl.azimuthDeg = ((az % 360) + 360) % 360;

        // Rotar simultáneamente polilíneas y faldones hijos asociados a este plano basados en su snapshot
        if (Array.isArray(WP.polylines) && Array.isArray(universalGizmoState.startChildPolys)) {
          WP.polylines.forEach((poly, pIdx) => {
            const startPts = universalGizmoState.startChildPolys[pIdx];
            if (poly && poly.planeIdx === WP.activePlaneIdx && Array.isArray(startPts) && Array.isArray(poly.points)) {
              poly.points = startPts.map(pt => {
                const rel = Cesium.Cartesian3.subtract(pt, center, new Cesium.Cartesian3());
                const rotRel = Cesium.Matrix3.multiplyByVector(rotMat3, rel, new Cesium.Cartesian3());
                return Cesium.Cartesian3.add(center, rotRel, new Cesium.Cartesian3());
              });
              poly._geometryDirty = true;
            }
          });
        }
        if (typeof wpRenderActivePlaneGizmo === 'function') wpRenderActivePlaneGizmo();
        if (typeof wpUpdateUI === 'function') wpUpdateUI();
      }
    }
  }

  // B. APLICAR TRASLACIÓN / POSICIÓN 3D (SI SE ESPECIFICA)
  if (newPos && typeof Cesium !== 'undefined') {
    const carto = Cesium.Cartographic.fromCartesian(newPos);
    const latDeg = Cesium.Math.toDegrees(carto.latitude);
    const lonDeg = Cesium.Math.toDegrees(carto.longitude);

    if (target.type === 'vertex') {
      const bState = (typeof window !== 'undefined' && window.bldFootprintState) || (typeof bldFootprintState !== 'undefined' ? bldFootprintState : null);
      if (target.subType === 'building_vertex' || (bState && bState.selectedVtxIdx >= 0 && selectedBuildingId)) {
        const bld = (typeof buildings !== 'undefined') ? buildings.find(b => b.id === selectedBuildingId) : null;
        if (bld && bld.points && bState && bState.selectedVtxIdx >= 0 && bld.points[bState.selectedVtxIdx]) {
          bld.points[bState.selectedVtxIdx] = Cesium.Cartesian3.clone(newPos);
          // [P2] Sin rebuild GPU por frame (regla §5): actualizar solo el handle del vértice;
          // el edificio completo se reconstruye en LEFT_UP.
          const _vtxH = window._selectedVtxHandle;
          if (_vtxH) { try { _vtxH.position = new Cesium.ConstantPositionProperty(Cesium.Cartesian3.clone(newPos)); } catch(eVtxH) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(eVtxH, 'vtxHandle'); } }
        }
      } else {
        const vIdx = (typeof WP !== 'undefined' && WP && WP.selectedVtxIdx >= 0) ? WP.selectedVtxIdx : (typeof selectedVertexIndex !== 'undefined' ? selectedVertexIndex : -1);
        const pIdx = (typeof WP !== 'undefined' && WP && WP.selectedPolyIdx >= 0) ? WP.selectedPolyIdx : 0;
        if (typeof WP !== 'undefined' && WP && WP.polylines && WP.polylines[pIdx] && WP.polylines[pIdx].points && WP.polylines[pIdx].points[vIdx]) {
          const poly = WP.polylines[pIdx];
          poly.points[vIdx] = Cesium.Cartesian3.clone(newPos);
          poly._geometryDirty = true;
          if (typeof wpPolylineArea3D === 'function') poly.area = wpPolylineArea3D(poly.points);
          if (typeof polygonPoints !== 'undefined' && Array.isArray(polygonPoints) && polygonPoints[vIdx]) {
            polygonPoints[vIdx] = Cesium.Cartesian3.clone(newPos);
          }
          if (poly.lineEnt && poly.lineEnt.polyline) {
            try {
              const elevatedPts = (typeof wpElevatePointsForVisuals === 'function')
                ? wpElevatePointsForVisuals(poly.points, poly.planeIdx, 0.04)
                : poly.points;
              poly.lineEnt.polyline.positions = [...elevatedPts, elevatedPts[0]];
            } catch(ePolyPos) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(ePolyPos, 'Entidad/Primitiva Cesium'); }
          }
          if (typeof wpSyncVertexInputs === 'function') wpSyncVertexInputs();
        }
      }
    } else if (target.type === 'electrical') {
      const sState = window.inverterEquipmentState;
      const posProp = new Cesium.ConstantPositionProperty(newPos);
      const labelPos = Cesium.Cartesian3.clone(newPos);
      if (target.id === 'inverter') {
        sState.position = newPos;
        sState.carto = { latitude: latDeg, longitude: lonDeg, height: carto.height };
        if (sState.entity) {
          sState.entity.position = posProp;
          if (sState.entity.label) sState.entity.label.text = '⚡ CUADRO & INVERSOR\n' + carto.height.toFixed(1) + ' m';
        }
        if (sState.label2D) sState.label2D.position = labelPos;
      } else if (target.id === 'combiner' && sState.combinerBox) {
        sState.combinerBox.position = newPos;
        sState.combinerBox.carto = { latitude: latDeg, longitude: lonDeg, height: carto.height };
        if (sState.combinerBox.entity) {
          sState.combinerBox.entity.position = posProp;
          if (sState.combinerBox.entity.label) sState.combinerBox.entity.label.text = '📦 COMBINER BOX\n' + carto.height.toFixed(1) + ' m';
        }
        if (sState.combinerBox.label2D) sState.combinerBox.label2D.position = labelPos;
      } else if (target.id === 'dc_protection') {
        sState.dcProtectionPosition = newPos;
        sState.dcProtectionCarto = { latitude: latDeg, longitude: lonDeg, height: carto.height };
        if (sState.dcProtectionEntity) {
          sState.dcProtectionEntity.position = posProp;
          if (sState.dcProtectionEntity.label) sState.dcProtectionEntity.label.text = '🛡️ CUADRO DC (SPD II)\n' + carto.height.toFixed(1) + ' m';
        }
        if (sState.dcProtectionLabel2D) sState.dcProtectionLabel2D.position = labelPos;
      } else if (target.id === 'meter' && sState.gridMeter) {
        sState.gridMeter.position = newPos;
        sState.gridMeter.carto = { latitude: latDeg, longitude: lonDeg, height: carto.height };
        if (sState.gridMeter.entity) {
          sState.gridMeter.entity.position = posProp;
          if (sState.gridMeter.entity.label) sState.gridMeter.entity.label.text = '🔌 CONTADOR DE RED\n' + carto.height.toFixed(1) + ' m';
        }
        if (sState.gridMeter.label2D) sState.gridMeter.label2D.position = labelPos;
      } else if (target.id === 'battery') {
        sState.batteryPosition = newPos;
        sState.batteryCarto = { latitude: latDeg, longitude: lonDeg, height: carto.height };
        if (sState.batteryEntity) {
          sState.batteryEntity.position = posProp;
          if (sState.batteryEntity.label) sState.batteryEntity.label.text = '🔋 BATERÍA LFP\n' + carto.height.toFixed(1) + ' m';
        }
        if (sState.batteryLabel2D) sState.batteryLabel2D.position = labelPos;
      }
      target.pos = Cesium.Cartesian3.clone(newPos);
      // [P2] Cables NO se regeneran por frame durante el drag (regla §5): LEFT_UP ya los re-renderiza
      if (!universalGizmoState.active && typeof wpCalculateAndRenderInverterCables === 'function') wpCalculateAndRenderInverterCables();
    } else if (target.type === 'obstacle' && target.rawObj) {
      const obs = target.rawObj;
      const roofWp = (target.wp && target.wp.roofWp) ? target.wp.roofWp : ((typeof getObstacleActivePlane === 'function') ? getObstacleActivePlane(obs) : null);
      const effWp = roofWp || target.wp;
      const normal = (target.wp && target.wp.normal) ? Cesium.Cartesian3.normalize(target.wp.normal, new Cesium.Cartesian3()) : (universalGizmoState.startZVec || Cesium.Cartesian3.UNIT_Z);
      const isTree = (obs.type === 'tree' || obs.isTree);
      const h = Math.max(obs.h || (isTree ? 5.0 : 1.2), 0.2);
      const hOffset = h + 0.15;

      let baseCenter = null;
      if (universalGizmoState.mode === 'center-drag') {
        baseCenter = Cesium.Cartesian3.clone(newPos);
      } else {
        baseCenter = Cesium.Cartesian3.subtract(
          newPos,
          Cesium.Cartesian3.multiplyByScalar(normal, hOffset, new Cesium.Cartesian3()),
          new Cesium.Cartesian3()
        );
      }

      obs.cartesian = Cesium.Cartesian3.clone(baseCenter);
      try {
        obs.carto = Cesium.Cartographic.fromCartesian(baseCenter);
      } catch (eC) {}
      target.pos = Cesium.Cartesian3.add(
        baseCenter,
        Cesium.Cartesian3.multiplyByScalar(normal, hOffset, new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
      );

      if (effWp && effWp.origin && effWp.uVec && effWp.vVec) {
        const uNorm = Cesium.Cartesian3.normalize(effWp.uVec, new Cesium.Cartesian3());
        const vNorm = Cesium.Cartesian3.normalize(effWp.vVec, new Cesium.Cartesian3());
        const rel = Cesium.Cartesian3.subtract(baseCenter, effWp.origin, new Cesium.Cartesian3());
        obs.u = Cesium.Cartesian3.dot(rel, uNorm);
        obs.v = Cesium.Cartesian3.dot(rel, vNorm);
        if (universalGizmoState.mode === 'z-axis') {
          const elev = Cesium.Cartesian3.dot(rel, normal);
          obs.elevation = Math.max(0, elev);
        }
      }

      const fnUpdate = (typeof updateObstacleLiveModelMatrix === 'function')
        ? updateObstacleLiveModelMatrix
        : (typeof window !== 'undefined' && typeof window.updateObstacleLiveModelMatrix === 'function' ? window.updateObstacleLiveModelMatrix : null);
      if (typeof fnUpdate === 'function') {
        try { fnUpdate(obs, target); } catch(eObsT) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(eObsT, 'Entidad/Primitiva Cesium'); }
      }
      if (typeof window !== 'undefined' && window.LiveSolarProbe && window.LiveSolarProbe.enabled) {
        window.LiveSolarProbe.evaluate();
      }
    } else if (target.type === 'wind_turbine_entity' && target.rawObj) {
      let wt = target.rawObj;
      if (window.RAWind && window.RAWind.Entity && typeof window.RAWind.Entity.getById === 'function') {
        const liveWt = window.RAWind.Entity.getById(wt.id);
        if (liveWt) wt = liveWt;
      }
      if (window.RAWind && window.RAWind.Entity) {
        window.RAWind.Entity.updatePosition(wt.id, carto.longitude, carto.latitude, carto.height || 0);
      }
      target.pos = Cesium.Cartesian3.clone(newPos);
      if (window.RAWindVisualizer && typeof window.RAWindVisualizer.updateLiveModelMatrix === 'function') {
        window.RAWindVisualizer.updateLiveModelMatrix(wt);
      }
    } else if (target.type === 'building' && target.rawObj) {
      const bld = target.rawObj;
      const ptsArr = bld.points || bld.polygon;
      if (Array.isArray(ptsArr)) {
        if (!universalGizmoState.startPoints || universalGizmoState.startPoints.length !== ptsArr.length) {
          universalGizmoState.startPoints = ptsArr.map(p => Cesium.Cartesian3.clone(p));
        }
        const baseCenter = universalGizmoState.startCenter || universalGizmoState.startPos;
        const totalDelta = Cesium.Cartesian3.subtract(newPos, baseCenter, new Cesium.Cartesian3());
        for (let i = 0; i < ptsArr.length; i++) {
          ptsArr[i] = Cesium.Cartesian3.add(universalGizmoState.startPoints[i], totalDelta, new Cesium.Cartesian3());
        }
      }
      target.pos = Cesium.Cartesian3.clone(newPos);
      if (typeof window !== 'undefined' && window.RALBuilding && typeof window.RALBuilding.syncAnchorFromPoints === 'function') {
        window.RALBuilding.syncAnchorFromPoints(bld);
      }
      // Reconstruccion GPU pesada de edificio diferida a LEFT_UP para garantizar 60 FPS
    } else if (target.type === 'panel' && target.rawObj) {
      const p = target.rawObj;
      const delta = Cesium.Cartesian3.subtract(newPos, p.center, new Cesium.Cartesian3());
      Cesium.Cartesian3.clone(newPos, p.center);
      if (p.corners) {
        p.corners = p.corners.map(c => Cesium.Cartesian3.add(c, delta, new Cesium.Cartesian3()));
      }
      p.isManual = true;
      p.gridA = undefined;
      p.gridB = undefined;

      // Proyectar newPos en el plano de cubierta para actualizar coordenadas locales (u, v) con invTransform
      const roofPoly = (typeof WP !== 'undefined' && WP.polylines && typeof p.polyIdx !== 'undefined') ? WP.polylines[p.polyIdx] : null;
      const roofInfo = roofPoly ? (roofPoly.roofInfo || (typeof computeSinglePolylineRoofInfo === 'function' ? computeSinglePolylineRoofInfo(roofPoly.points, roofPoly) : null)) : null;

      if (roofInfo && roofInfo.invTransform && roofInfo.uVec && roofInfo.vVec) {
        const locPt = Cesium.Matrix4.multiplyByPoint(roofInfo.invTransform, newPos, new Cesium.Cartesian3());
        p.u = Cesium.Cartesian3.dot(locPt, roofInfo.uVec);
        p.v = Cesium.Cartesian3.dot(locPt, roofInfo.vVec);
      }

      if (p.rawPanel) {
        p.rawPanel.center = Cesium.Cartesian3.clone(newPos);
        p.rawPanel.corners = p.corners;
        p.rawPanel.isManual = true;
        p.rawPanel.gridA = undefined;
        p.rawPanel.gridB = undefined;
        if (typeof p.u === 'number') p.rawPanel.u = p.u;
        if (typeof p.v === 'number') p.rawPanel.v = p.v;
      }

      // 🌟 Mover simultáneamente todos los demás paneles seleccionados con el mismo delta
      if (Array.isArray(window.selectedPanelIndices) && window.selectedPanelIndices.length > 1) {
        const panelsArr = (window.allRenderedPanels && window.allRenderedPanels.length > 0)
          ? window.allRenderedPanels
          : (typeof lastRoofInfo !== 'undefined' && lastRoofInfo ? lastRoofInfo.panels : null);

        if (panelsArr) {
          window.selectedPanelIndices.forEach(oIdx => {
            if (oIdx === selectedPanelIndex) return;
            const otherP = panelsArr[oIdx];
            if (!otherP || !otherP.center) return;
            otherP.center = Cesium.Cartesian3.add(otherP.center, delta, new Cesium.Cartesian3());
            if (otherP.corners) {
              otherP.corners = otherP.corners.map(c => Cesium.Cartesian3.add(c, delta, new Cesium.Cartesian3()));
            }
            otherP.isManual = true;
            otherP.gridA = undefined;
            otherP.gridB = undefined;
            const otherPoly = (typeof WP !== 'undefined' && WP.polylines && typeof otherP.polyIdx === 'number') ? WP.polylines[otherP.polyIdx] : null;
            const otherRoof = (otherPoly && otherPoly.roofInfo) ? otherPoly.roofInfo : roofInfo;
            if (otherRoof && otherRoof.invTransform && otherRoof.uVec && otherRoof.vVec) {
              const locPt = Cesium.Matrix4.multiplyByPoint(otherRoof.invTransform, otherP.center, new Cesium.Cartesian3());
              otherP.u = Cesium.Cartesian3.dot(locPt, otherRoof.uVec);
              otherP.v = Cesium.Cartesian3.dot(locPt, otherRoof.vVec);
            }
            if (!otherP.rawPanel && otherRoof && Array.isArray(otherRoof.panels)) {
              const backing = otherP.panelId
                ? otherRoof.panels.find(rp => rp && rp.panelId === otherP.panelId)
                : (typeof otherP.layoutIndex === 'number' ? otherRoof.panels[otherP.layoutIndex] : null);
              if (backing) otherP.rawPanel = backing;
            }
            if (otherP.rawPanel) {
              if (typeof otherP.u === 'number') otherP.rawPanel.u = otherP.u;
              if (typeof otherP.v === 'number') otherP.rawPanel.v = otherP.v;
              otherP.rawPanel.center = Cesium.Cartesian3.clone(otherP.center);
              otherP.rawPanel.corners = otherP.corners.map(c => Cesium.Cartesian3.clone(c));
              otherP.rawPanel.isManual = true;
              otherP.rawPanel.gridA = undefined;
              otherP.rawPanel.gridB = undefined;
            }
          });
        }
      }

      if (Array.isArray(window.panelOutlineEntities) && window.panelOutlineEntities.length > 0) {
        const panelsArr = (window.allRenderedPanels && window.allRenderedPanels.length > 0)
          ? window.allRenderedPanels
          : (typeof lastRoofInfo !== 'undefined' && lastRoofInfo ? lastRoofInfo.panels : null);
        const indices = (Array.isArray(window.selectedPanelIndices) && window.selectedPanelIndices.length > 0)
          ? window.selectedPanelIndices
          : [selectedPanelIndex];
        window.panelOutlineEntities.forEach((ent, i) => {
          const idx = indices[i];
          const pan = panelsArr ? panelsArr[idx] : null;
          if (ent && ent.polyline && pan && pan.corners && pan.corners.length === 4) {
            ent.polyline.positions = [pan.corners[0], pan.corners[1], pan.corners[2], pan.corners[3], Cesium.Cartesian3.clone(pan.corners[0])];
          }
        });
      } else if (panelOutlineEntity && p.corners && p.corners.length === 4) {
        panelOutlineEntity.polyline.positions = [p.corners[0], p.corners[1], p.corners[2], p.corners[3], Cesium.Cartesian3.clone(p.corners[0])];
      }
      if (typeof window !== 'undefined' && window.LiveSolarProbe && window.LiveSolarProbe.enabled) {
        window.LiveSolarProbe.evaluate();
      }
    } else if (target.type === 'workplane' && target.rawObj) {
      const pl = target.rawObj;
      const delta = Cesium.Cartesian3.subtract(newPos, target.pos, new Cesium.Cartesian3());
      target.pos = Cesium.Cartesian3.clone(newPos);

      // Trasladar los 3 vértices maestros del plano
      if (Array.isArray(pl.pts3D)) {
        pl.pts3D = pl.pts3D.map(pt => Cesium.Cartesian3.add(pt, delta, new Cesium.Cartesian3()));
      }
      if (pl.origin) {
        pl.origin = Cesium.Cartesian3.add(pl.origin, delta, new Cesium.Cartesian3());
      }

      // Propagar traslación a todas las polilíneas/faldones pertenecientes a este plano
      if (Array.isArray(WP.polylines)) {
        WP.polylines.forEach(poly => {
          if (poly && poly.planeIdx === WP.activePlaneIdx && Array.isArray(poly.points)) {
            poly.points = poly.points.map(pt => Cesium.Cartesian3.add(pt, delta, new Cesium.Cartesian3()));
            poly._geometryDirty = true;
          }
        });
      }
      if (typeof wpRenderActivePlaneGizmo === 'function') wpRenderActivePlaneGizmo();
      if (typeof wpRenderAllPolylines === 'function') wpRenderAllPolylines();
      if (typeof wpUpdateUI === 'function') wpUpdateUI();
    } else if (target.type === 'workplane_vertex' && target.rawObj) {
      const { plane, vtxIdx } = target.rawObj;
      if (plane && Array.isArray(plane.pts3D) && plane.pts3D[vtxIdx]) {
        plane.pts3D[vtxIdx] = Cesium.Cartesian3.clone(newPos);
        target.pos = Cesium.Cartesian3.clone(newPos);

        // Recalcular plano a partir de los 3 puntos (P1, P2, P3)
        if (typeof wpComputePlaneFrom3Points === 'function' && plane.pts3D.length >= 3) {
          const mode = (typeof WP !== 'undefined' && WP.axisMode) || 'p1p2';
          const recomputed = wpComputePlaneFrom3Points(plane.pts3D[0], plane.pts3D[1], plane.pts3D[2], mode);
          if (recomputed) {
            plane.normal = recomputed.normal;
            plane.uVec = recomputed.uVec;
            plane.vVec = recomputed.vVec;
            plane.origin = recomputed.origin;
            plane.tiltDeg = recomputed.tiltDeg;
            plane.azimuthDeg = recomputed.azimuthDeg;
            plane.d = recomputed.d;

            if (target.wp) {
              target.wp.origin = recomputed.origin;
              target.wp.normal = recomputed.normal;
              target.wp.uVec = recomputed.uVec;
              target.wp.vVec = recomputed.vVec;
              target.wp.plane = { origin: recomputed.origin, normal: recomputed.normal };
            }
          }
        }
        if (typeof wpRenderActivePlaneGizmo === 'function') wpRenderActivePlaneGizmo();
        if (typeof wpUpdateUI === 'function') wpUpdateUI();
      }
    }
  }

  if (typeof window !== 'undefined' && window.RAMeasureTool && typeof window.RAMeasureTool.invalidateSnapCandidates === 'function') {
    window.RAMeasureTool.invalidateSnapCandidates();
  }

  return true;
}
window.updateUniversalTargetTransform = updateUniversalTargetTransform;
