/**
 * js/cad-clash-section.js — Clash Detection 3D (OBB-OBB) + Planos de Sección Interactivos [F7-04]
 * ================================================================================================
 * 1. Motor de detección de interferencias 3D entre módulos FV, obstáculos (chimeneas, petos, casetones)
 *    y edificios CAD con margen de holgura configurable, resaltado rojo en Cesium y auto-resolución 1-clic.
 * 2. Controlador de Planos de Sección 3D (`Cesium.ClippingPlaneCollection`) para cortar terreno/edificios
 *    por eje Norte-Sur, Este-Oeste o cota horizontal.
 */
(function (global) {
  'use strict';

  var _clashEntities = [];
  var _lastReport = null;
  var _sectionState = { active: false, axis: 'EW', offsetM: 0 };

  function _getCartesian(obj) {
    if (!obj || !global.Cesium) return null;
    if (obj instanceof global.Cesium.Cartesian3) return obj;
    if (typeof obj.x === 'number' && typeof obj.y === 'number' && typeof obj.z === 'number') {
      return new global.Cesium.Cartesian3(obj.x, obj.y, obj.z);
    }
    return null;
  }

  function _buildRotatedRect2D(u, v, halfW, halfH, rotDeg) {
    var rad = (Number(rotDeg) || 0) * Math.PI / 180.0;
    var c = Math.cos(rad);
    var s = Math.sin(rad);
    var pts = [
      { du: -halfW, dv: -halfH },
      { du:  halfW, dv: -halfH },
      { du:  halfW, dv:  halfH },
      { du: -halfW, dv:  halfH }
    ];
    return pts.map(function (pt) {
      return { u: u + pt.du * c - pt.dv * s, v: v + pt.du * s + pt.dv * c };
    });
  }

  function _satMinGap2D(polyA, polyB) {
    if (!Array.isArray(polyA) || polyA.length < 3 || !Array.isArray(polyB) || polyB.length < 3) return Infinity;
    var maxAxisGap = -Infinity;
    var polys = [polyA, polyB];
    for (var pi = 0; pi < 2; pi++) {
      var poly = polys[pi];
      var n = poly.length;
      for (var i = 0; i < n; i++) {
        var a = poly[i];
        var b = poly[(i + 1) % n];
        var ex = b.u - a.u;
        var ey = b.v - a.v;
        var len = Math.hypot(ex, ey);
        if (len < 1e-9) continue;
        var nx = -ey / len;
        var ny = ex / len;
        var minA = Infinity, maxA = -Infinity;
        for (var k = 0; k < polyA.length; k++) {
          var pA = polyA[k].u * nx + polyA[k].v * ny;
          if (pA < minA) minA = pA;
          if (pA > maxA) maxA = pA;
        }
        var minB = Infinity, maxB = -Infinity;
        for (var m = 0; m < polyB.length; m++) {
          var pB = polyB[m].u * nx + polyB[m].v * ny;
          if (pB < minB) minB = pB;
          if (pB > maxB) maxB = pB;
        }
        var axisGap = Math.max(minB - maxA, minA - maxB);
        if (axisGap > maxAxisGap) maxAxisGap = axisGap;
      }
    }
    return maxAxisGap;
  }

  function _getCartesianZ(c) {
    if (!c || !global.Cesium || !global.Cesium.Cartographic) return null;
    try {
      var cg = global.Cesium.Cartographic.fromCartesian(c);
      return cg && Number.isFinite(cg.height) ? cg.height : null;
    } catch (_) { return null; }
  }

  function _projectCornersToRoof2D(corners3D, roof) {
    if (!Array.isArray(corners3D) || corners3D.length < 3 || !roof || !roof.origin || !roof.uVec || !roof.vVec || !global.Cesium) return null;
    var C3 = global.Cesium.Cartesian3;
    return corners3D.map(function (c) {
      var rel = C3.subtract(c, roof.origin, new C3());
      return { u: C3.dot(rel, roof.uVec), v: C3.dot(rel, roof.vVec) };
    });
  }

  function _getPanelBoundingInfo(p, idx) {
    var center = _getCartesian(p && p.center);
    if (!center) return null;
    var w = Number((p && (p.width || p.w)) || (global.panelConfig && global.panelConfig.ancho) || 1.134);
    var h = Number((p && (p.height || p.h || p.length)) || (global.panelConfig && global.panelConfig.largo) || 1.722);
    var rot = Number(p && p.rot) || 0;
    var polyIdx = p.polyIdx != null ? p.polyIdx : 0;
    var u = Number(p.u);
    var v = Number(p.v);
    var roof = (global.WP && Array.isArray(global.WP.polylines) && global.WP.polylines[polyIdx])
      ? global.WP.polylines[polyIdx].roofInfo : null;
    var poly2D = null;
    if (Array.isArray(p.corners) && p.corners.length >= 3 && roof) {
      poly2D = _projectCornersToRoof2D(p.corners, roof);
    }
    if (!poly2D && Number.isFinite(u) && Number.isFinite(v)) {
      poly2D = _buildRotatedRect2D(u, v, w * 0.5, h * 0.5, rot);
    }
    var radius = Math.sqrt(w * w + h * h) * 0.5;
    return {
      idx: idx,
      panel: p,
      center: center,
      z: _getCartesianZ(center),
      halfW: w * 0.5,
      halfH: h * 0.5,
      rot: rot,
      radius: radius,
      polyIdx: polyIdx,
      u: u,
      v: v,
      poly2D: poly2D
    };
  }

  function _getObstacleBoundingInfo(obs) {
    if (!obs) return null;
    var pIdx = (obs.polyIdx != null) ? obs.polyIdx : ((obs.planeIdx != null) ? obs.planeIdx : null);
    var center = _getCartesian(obs.cartesian || obs.center || obs.position);
    if (!center && pIdx != null && global.WP && Array.isArray(global.WP.polylines)) {
      var poly = global.WP.polylines[pIdx];
      if (poly && poly.roofInfo && poly.roofInfo.origin && poly.roofInfo.uVec && poly.roofInfo.vVec && global.Cesium) {
        var C3 = global.Cesium.Cartesian3;
        center = C3.add(
          C3.add(poly.roofInfo.origin, C3.multiplyByScalar(poly.roofInfo.uVec, Number(obs.u) || 0, new C3()), new C3()),
          C3.multiplyByScalar(poly.roofInfo.vVec, Number(obs.v) || 0, new C3()),
          new C3()
        );
      }
    }
    if (!center) return null;
    var w = Number(obs.w || obs.width || obs.diameter || (obs.radius ? obs.radius * 2 : 0) || 1.0);
    var d = Number(obs.l || obs.depth || obs.length || obs.diameter || w);
    var ht = Number(obs.h || obs.height || 1.2);
    var rot = Number(obs.rot) || 0;
    return {
      id: obs.id || ('obs_' + Math.random().toString(36).slice(2, 6)),
      name: obs.name || obs.type || 'Obstáculo 3D',
      raw: obs,
      center: center,
      z: _getCartesianZ(center),
      halfW: w * 0.5,
      halfD: d * 0.5,
      rot: rot,
      height: ht,
      radius: Math.sqrt(w * w + d * d) * 0.5,
      polyIdx: pIdx,
      u: Number(obs.u),
      v: Number(obs.v)
    };
  }

  /**
   * Ejecuta comprobación OBB/SAT 2D real + intervalo Z y consulta espacial por faldón.
   */
  function runClashDetection(opts) {
    var cfg = opts || {};
    var clearanceM = Number(cfg.clearanceM != null ? cfg.clearanceM : 0.10);
    var panelsRaw = Array.isArray(global.allRenderedPanels)
      ? global.allRenderedPanels.filter(function (p) { return p && !p.isGhost && !p.deleted && !p.disabled; })
      : [];
    var obstaclesRaw = Array.isArray(global.obstacles) ? global.obstacles : [];

    var panels = [];
    panelsRaw.forEach(function (p, i) {
      var info = _getPanelBoundingInfo(p, i);
      if (info) panels.push(info);
    });
    var obsList = [];
    obstaclesRaw.forEach(function (o) {
      var info = _getObstacleBoundingInfo(o);
      if (info) obsList.push(info);
    });

    var clashes = [];
    var C3 = global.Cesium ? global.Cesium.Cartesian3 : null;
    var obsPolyCache = new Map();

    function _getObsPoly2DForRoof(ob, polyIdx) {
      var key = ob.id + '@' + polyIdx;
      if (obsPolyCache.has(key)) return obsPolyCache.get(key);
      var roof = (global.WP && Array.isArray(global.WP.polylines) && global.WP.polylines[polyIdx])
        ? global.WP.polylines[polyIdx].roofInfo : null;
      var res = null;
      if (roof && typeof global.getObstaclePolygon2DForRoof === 'function') {
        try {
          var proj = global.getObstaclePolygon2DForRoof(ob.raw, 0, roof);
          if (Array.isArray(proj) && proj.length >= 3) res = proj;
        } catch (_) {}
      }
      if (!res && ob.polyIdx === polyIdx && Number.isFinite(ob.u) && Number.isFinite(ob.v)) {
        res = _buildRotatedRect2D(ob.u, ob.v, ob.halfW, ob.halfD, ob.rot);
      }
      obsPolyCache.set(key, res);
      return res;
    }

    // 1) Colisiones Panel vs Obstáculo (SAT 2D real + holgura Z)
    for (var i = 0; i < panels.length; i++) {
      var pb = panels[i];
      for (var j = 0; j < obsList.length; j++) {
        var ob = obsList[j];
        // Filtro vertical Z si ambos tienen cota conocida
        if (pb.z !== null && ob.z !== null) {
          var obsMinZ = ob.z - 0.5;
          var obsMaxZ = ob.z + ob.height + 0.5;
          if (pb.z > obsMaxZ || (pb.z + 0.45) < obsMinZ) continue;
        }

        var hit = false;
        var minGapM = 999;
        var obsPoly2D = _getObsPoly2DForRoof(ob, pb.polyIdx);

        if (pb.poly2D && obsPoly2D) {
          minGapM = _satMinGap2D(pb.poly2D, obsPoly2D);
          if (minGapM < clearanceM) hit = true;
        } else if (C3) {
          var d3 = C3.distance(pb.center, ob.center);
          minGapM = d3 - (pb.radius * 0.78 + ob.radius * 0.78);
          if (minGapM < clearanceM) hit = true;
        }

        if (hit) {
          clashes.push({
            type: 'PANEL_OBSTACLE',
            severity: minGapM < 0 ? 'CRITICAL' : 'WARNING',
            clearanceM: Number(minGapM.toFixed(3)),
            panelIdx: pb.idx,
            panelRef: pb.panel,
            polyIdx: pb.polyIdx,
            targetName: ob.name,
            position: pb.center
          });
        }
      }
    }

    // 2) Solapamientos Panel vs Panel en el mismo faldón usando índice espacial por faldón (O(N log N))
    var panelsByRaw = new Map();
    for (var k = 0; k < panels.length; k++) panelsByRaw.set(panels[k].panel, panels[k]);

    var useSpatial = !!(global.RASpatialDsm && typeof global.RASpatialDsm.rebuildSpatialIndex === 'function' && typeof global.RASpatialDsm.queryNearestPanels === 'function');
    if (useSpatial) {
      global.RASpatialDsm.rebuildSpatialIndex(panelsRaw);
    }

    // Respaldo hash-grid por faldón si RASpatialDsm no estuviera cargado
    var gridByPoly = null;
    var CELL_M = 3.2;
    if (!useSpatial) {
      gridByPoly = new Map();
      for (var gi = 0; gi < panels.length; gi++) {
        var gp = panels[gi];
        if (!Number.isFinite(gp.u) || !Number.isFinite(gp.v)) continue;
        var gk = gp.polyIdx + ':' + Math.floor(gp.u / CELL_M) + ':' + Math.floor(gp.v / CELL_M);
        if (!gridByPoly.has(gk)) gridByPoly.set(gk, []);
        gridByPoly.get(gk).push(gp);
      }
    }

    for (var a = 0; a < panels.length; a++) {
      var pa = panels[a];
      if (!Number.isFinite(pa.u) || !Number.isFinite(pa.v) || !pa.poly2D) continue;
      var neighbors = [];
      if (useSpatial) {
        var radius = Math.max(pa.radius * 2.2, 3.0);
        var hits = global.RASpatialDsm.queryNearestPanels(pa.u, pa.v, radius, pa.polyIdx);
        for (var hi = 0; hi < hits.length; hi++) {
          var nbInfo = panelsByRaw.get(hits[hi].panel);
          if (nbInfo && nbInfo.idx > pa.idx) neighbors.push(nbInfo);
        }
      } else {
        var cu = Math.floor(pa.u / CELL_M);
        var cv = Math.floor(pa.v / CELL_M);
        for (var du = -1; du <= 1; du++) {
          for (var dv = -1; dv <= 1; dv++) {
            var bucket = gridByPoly.get(pa.polyIdx + ':' + (cu + du) + ':' + (cv + dv));
            if (!bucket) continue;
            for (var bi = 0; bi < bucket.length; bi++) {
              if (bucket[bi].idx > pa.idx) neighbors.push(bucket[bi]);
            }
          }
        }
      }

      for (var b = 0; b < neighbors.length; b++) {
        var pb2 = neighbors[b];
        if (!pb2.poly2D) continue;
        var satGap = _satMinGap2D(pa.poly2D, pb2.poly2D);
        if (satGap < -0.02) {
          clashes.push({
            type: 'PANEL_OVERLAP',
            severity: 'CRITICAL',
            clearanceM: Number(satGap.toFixed(3)),
            panelIdx: pb2.idx,
            panelRef: pb2.panel,
            polyIdx: pb2.polyIdx,
            targetName: 'Solape con módulo #' + (pa.idx + 1),
            position: pb2.center
          });
        }
      }
    }

    _lastReport = {
      checkedPanels: panels.length,
      checkedObstacles: obsList.length,
      clearanceRuleM: clearanceM,
      criticalCount: clashes.filter(function (c) { return c.severity === 'CRITICAL'; }).length,
      warningCount: clashes.filter(function (c) { return c.severity === 'WARNING'; }).length,
      clashes: clashes
    };

    if (cfg.highlight !== false) {
      renderClashes3D(_lastReport);
    }
    return _lastReport;
  }

  function clearClashes3D() {
    if (global.viewer && global.viewer.entities) {
      _clashEntities.forEach(function (ent) {
        try { global.viewer.entities.remove(ent); } catch (_) {}
      });
      if (global.viewer.scene && global.viewer.scene.requestRender) global.viewer.scene.requestRender();
    }
    _clashEntities = [];
  }

  function renderClashes3D(report) {
    clearClashes3D();
    if (!report || !Array.isArray(report.clashes) || !global.viewer || !global.viewer.entities || !global.Cesium) return;
    report.clashes.slice(0, 60).forEach(function (c, idx) {
      if (!c.position) return;
      var col = c.severity === 'CRITICAL'
        ? global.Cesium.Color.RED.withAlpha(0.55)
        : global.Cesium.Color.ORANGE.withAlpha(0.45);
      var ent = global.viewer.entities.add({
        id: 'ra_clash_highlight_' + idx,
        position: c.position,
        box: {
          dimensions: new global.Cesium.Cartesian3(1.25, 1.85, 0.45),
          material: col,
          outline: true,
          outlineColor: global.Cesium.Color.WHITE
        }
      });
      _clashEntities.push(ent);
    });
    if (global.viewer.scene && global.viewer.scene.requestRender) global.viewer.scene.requestRender();
  }

  /**
   * Auto-resuelve colisiones críticas eliminando los paneles en choque físico (< 0 m),
   * registrando snapshot Undo (`RAundo`) y añadiendo exclusión persistente a `poly.deletedPanels`.
   */
  function autoResolveCriticalClashes() {
    var rep = _lastReport || runClashDetection({ highlight: false });
    if (!rep || rep.criticalCount === 0) return 0;

    if (global.RAundo && typeof global.RAundo.snapPolylines === 'function') {
      try { global.RAundo.snapPolylines('Auto-resolver colisiones 3D'); } catch (_) {}
    }

    var removed = 0;
    var toRemoveByPoly = new Map();
    var removedDescriptorsByPoly = new Map();
    rep.clashes.forEach(function (c) {
      if (c.severity === 'CRITICAL' && c.panelRef && !c.panelRef.deleted) {
        c.panelRef.deleted = true;
        c.panelRef.disabled = true;
        var pIdx = c.polyIdx != null ? c.polyIdx : 0;
        if (!toRemoveByPoly.has(pIdx)) toRemoveByPoly.set(pIdx, new Set());
        if (!removedDescriptorsByPoly.has(pIdx)) removedDescriptorsByPoly.set(pIdx, []);
        var rp = c.panelRef.rawPanel || c.panelRef;
        var pid = rp.panelId || c.panelRef.panelId;
        if (pid) toRemoveByPoly.get(pIdx).add(pid);
        if (typeof c.panelRef.localIdx === 'number') toRemoveByPoly.get(pIdx).add(c.panelRef.localIdx);
        removedDescriptorsByPoly.get(pIdx).push({
          panelId: pid || ('pan_' + pIdx + '_' + (rp.layoutIndex != null ? rp.layoutIndex : removed)),
          layoutIndex: (typeof rp.layoutIndex === 'number') ? rp.layoutIndex : c.panelRef.layoutIndex,
          localIdx: (typeof rp.localIdx === 'number') ? rp.localIdx : c.panelRef.localIdx,
          u: (typeof rp.u === 'number') ? rp.u : c.panelRef.u,
          v: (typeof rp.v === 'number') ? rp.v : c.panelRef.v,
          center: (rp.center && global.Cesium)
            ? global.Cesium.Cartesian3.clone(rp.center)
            : (c.panelRef.center && global.Cesium ? global.Cesium.Cartesian3.clone(c.panelRef.center) : null)
        });
        removed++;
      }
    });
    if (global.WP && Array.isArray(global.WP.polylines)) {
      toRemoveByPoly.forEach(function (idSet, pIdx) {
        var poly = global.WP.polylines[pIdx];
        if (!poly) return;
        if (!Array.isArray(poly.deletedPanels)) poly.deletedPanels = [];
        var descs = removedDescriptorsByPoly.get(pIdx) || [];
        descs.forEach(function (dp) {
          var exists = poly.deletedPanels.some(function (ex) {
            return ex && ex.panelId && dp.panelId && ex.panelId === dp.panelId;
          });
          if (!exists) poly.deletedPanels.push(dp);
        });
        if (poly.roofInfo && Array.isArray(poly.roofInfo.panels)) {
          poly.roofInfo.panels = poly.roofInfo.panels.filter(function (rp, idx) {
            if (!rp) return false;
            if (rp.panelId && idSet.has(rp.panelId)) return false;
            if (idSet.has(idx)) return false;
            return true;
          });
        }
        poly._calcSig = null;
        poly._geometryDirty = true;
      });
    }
    clearClashes3D();
    if (removed > 0) {
      if (typeof global.recalculateLayoutAndObstacles === 'function') global.recalculateLayoutAndObstacles();
      else if (typeof global.wpFastRenderSimulatedPanels === 'function') global.wpFastRenderSimulatedPanels(true);
      if (global.RA && global.RA.EventBus && global.RA.Events) {
        global.RA.EventBus.emit(global.RA.Events.PROJECT_UPDATED, { source: 'clash-auto-resolve' });
      }
      if (global.showToast) global.showToast('COLISIONES RESUELTAS', removed + ' módulos retirados (Ctrl+Z deshace).', 'success', 2800);
    }
    return removed;
  }

  // ── PLANOS DE SECCIÓN 3D (ClippingPlaneCollection anclado en ENU del emplazamiento) ──
  function _resolveSiteAnchorCartesian() {
    var C = global.Cesium;
    if (!C) return null;
    if (global.WP && Array.isArray(global.WP.polylines) && global.WP.polylines.length > 0) {
      var poly = global.WP.polylines[global.WP.selectedPolyIdx || 0] || global.WP.polylines[0];
      if (poly && poly.roofInfo && poly.roofInfo.origin) return poly.roofInfo.origin;
    }
    if (global.lastRoofInfo && global.lastRoofInfo.origin) return global.lastRoofInfo.origin;
    if (global.viewer && global.viewer.camera && global.viewer.camera.positionCartographic) {
      var cc = global.viewer.camera.positionCartographic;
      return C.Cartesian3.fromRadians(cc.longitude, cc.latitude, 0);
    }
    return null;
  }

  function _buildTilesetClippingCollection(tileset, enuModelMatrix, normal, dist) {
    var C = global.Cesium;
    var localMat = enuModelMatrix;
    try {
      var originMat = tileset.clippingPlanesOriginMatrix ||
        (tileset.root && (tileset.root.computedTransform || tileset.root.transform)) ||
        tileset.modelMatrix ||
        C.Matrix4.IDENTITY;
      var invOrigin = C.Matrix4.inverse(originMat, new C.Matrix4());
      localMat = C.Matrix4.multiply(invOrigin, enuModelMatrix, new C.Matrix4());
    } catch (_) {
      localMat = enuModelMatrix;
    }
    return new C.ClippingPlaneCollection({
      modelMatrix: localMat,
      planes: [new C.ClippingPlane(normal, dist)],
      edgeWidth: 1.5,
      edgeColor: C.Color.CYAN
    });
  }

  function applySectionPlane(axis, offsetMeters) {
    if (!global.viewer || !global.viewer.scene || !global.Cesium) return false;
    var C = global.Cesium;
    var normal = new C.Cartesian3(1, 0, 0);
    if (axis === 'NS') normal = new C.Cartesian3(0, 1, 0);
    else if (axis === 'Z') normal = new C.Cartesian3(0, 0, -1);

    var dist = Number(offsetMeters) || 0;
    var anchor = _resolveSiteAnchorCartesian();
    var modelMatrix = anchor ? C.Transforms.eastNorthUpToFixedFrame(anchor) : C.Matrix4.IDENTITY;

    if (global.viewer.scene.globe) {
      global.viewer.scene.globe.clippingPlanes = new C.ClippingPlaneCollection({
        modelMatrix: modelMatrix,
        planes: [new C.ClippingPlane(normal, dist)],
        edgeWidth: 1.5,
        edgeColor: C.Color.CYAN
      });
    }
    if (global.google3DTileset && (!global.google3DTileset.isDestroyed || !global.google3DTileset.isDestroyed())) {
      try {
        global.google3DTileset.clippingPlanes = _buildTilesetClippingCollection(global.google3DTileset, modelMatrix, normal, dist);
      } catch (_) {}
    }
    if (global.cesiumOsmBuildings && (!global.cesiumOsmBuildings.isDestroyed || !global.cesiumOsmBuildings.isDestroyed())) {
      try {
        global.cesiumOsmBuildings.clippingPlanes = _buildTilesetClippingCollection(global.cesiumOsmBuildings, modelMatrix, normal, dist);
      } catch (_) {}
    }
    _sectionState = { active: true, axis: axis || 'EW', offsetM: dist };
    if (global.viewer.scene.requestRender) global.viewer.scene.requestRender();
    return true;
  }

  function clearSectionPlane() {
    if (global.viewer && global.viewer.scene) {
      if (global.viewer.scene.globe) {
        try { global.viewer.scene.globe.clippingPlanes = undefined; } catch (_) {}
      }
      if (global.google3DTileset && (!global.google3DTileset.isDestroyed || !global.google3DTileset.isDestroyed())) {
        try { global.google3DTileset.clippingPlanes = undefined; } catch (_) {}
      }
      if (global.cesiumOsmBuildings && (!global.cesiumOsmBuildings.isDestroyed || !global.cesiumOsmBuildings.isDestroyed())) {
        try { global.cesiumOsmBuildings.clippingPlanes = undefined; } catch (_) {}
      }
      if (global.viewer.scene.requestRender) global.viewer.scene.requestRender();
    }
    _sectionState.active = false;
  }

  global.RACadClashSection = {
    runClashDetection: runClashDetection,
    clearClashes3D: clearClashes3D,
    autoResolveCriticalClashes: autoResolveCriticalClashes,
    applySectionPlane: applySectionPlane,
    clearSectionPlane: clearSectionPlane,
    getSectionState: function () { return Object.assign({}, _sectionState); },
    getLastReport: function () { return _lastReport; }
  };
  if (global.RA) global.RA.CadClashSection = global.RACadClashSection;
})(typeof window !== 'undefined' ? window : this);
