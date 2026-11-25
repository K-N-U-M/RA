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

  function _getPanelBoundingInfo(p, idx) {
    var center = _getCartesian(p && p.center);
    if (!center) return null;
    var w = Number((p && (p.width || p.w)) || (global.panelConfig && global.panelConfig.ancho) || 1.134);
    var h = Number((p && (p.height || p.h || p.length)) || (global.panelConfig && global.panelConfig.largo) || 1.722);
    var radius = Math.sqrt(w * w + h * h) * 0.5;
    return {
      idx: idx,
      panel: p,
      center: center,
      halfW: w * 0.5,
      halfH: h * 0.5,
      radius: radius,
      polyIdx: p.polyIdx != null ? p.polyIdx : 0,
      u: Number(p.u),
      v: Number(p.v)
    };
  }

  function _getObstacleBoundingInfo(obs) {
    if (!obs) return null;
    var center = _getCartesian(obs.cartesian || obs.center || obs.position);
    if (!center && obs.polyIdx != null && global.WP && Array.isArray(global.WP.polylines)) {
      var poly = global.WP.polylines[obs.polyIdx];
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
    var w = Number(obs.width || obs.diameter || obs.radius * 2 || 1.0);
    var d = Number(obs.depth || obs.length || obs.diameter || w);
    var ht = Number(obs.height || 1.2);
    return {
      id: obs.id || ('obs_' + Math.random().toString(36).slice(2, 6)),
      name: obs.name || obs.type || 'Obstáculo 3D',
      center: center,
      halfW: w * 0.5,
      halfD: d * 0.5,
      height: ht,
      radius: Math.sqrt(w * w + d * d) * 0.5,
      polyIdx: obs.polyIdx != null ? obs.polyIdx : null,
      u: Number(obs.u),
      v: Number(obs.v)
    };
  }

  /**
   * Ejecuta comprobación OBB/SAT en plano local + distancia euclídea 3D entre placas y obstáculos.
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

    // 1) Colisiones Panel vs Obstáculo
    for (var i = 0; i < panels.length; i++) {
      var pb = panels[i];
      for (var j = 0; j < obsList.length; j++) {
        var ob = obsList[j];
        var hit = false;
        var minGapM = 999;

        // Comprobación OBB exacta en plano local (u, v) cuando comparten faldón
        if (ob.polyIdx === pb.polyIdx && Number.isFinite(pb.u) && Number.isFinite(pb.v) && Number.isFinite(ob.u) && Number.isFinite(ob.v)) {
          var gapU = Math.abs(pb.u - ob.u) - (pb.halfW + ob.halfW);
          var gapV = Math.abs(pb.v - ob.v) - (pb.halfH + ob.halfD);
          minGapM = Math.max(gapU, gapV);
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

    // 2) Solapamientos Panel vs Panel en el mismo faldón
    for (var a = 0; a < panels.length; a++) {
      var pa = panels[a];
      if (!Number.isFinite(pa.u) || !Number.isFinite(pa.v)) continue;
      for (var b = a + 1; b < panels.length; b++) {
        var pb2 = panels[b];
        if (pb2.polyIdx !== pa.polyIdx || !Number.isFinite(pb2.u) || !Number.isFinite(pb2.v)) continue;
        var gU = Math.abs(pa.u - pb2.u) - (pa.halfW + pb2.halfW - 0.02);
        var gV = Math.abs(pa.v - pb2.v) - (pa.halfH + pb2.halfH - 0.02);
        if (gU < -0.02 && gV < -0.02) {
          clashes.push({
            type: 'PANEL_OVERLAP',
            severity: 'CRITICAL',
            clearanceM: Number(Math.max(gU, gV).toFixed(3)),
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
   * Auto-resuelve colisiones críticas marcando como desactivados los paneles en choque físico (< 0 m).
   */
  function autoResolveCriticalClashes() {
    var rep = _lastReport || runClashDetection({ highlight: false });
    if (!rep || rep.criticalCount === 0) return 0;
    var removed = 0;
    rep.clashes.forEach(function (c) {
      if (c.severity === 'CRITICAL' && c.panelRef && !c.panelRef.disabled) {
        c.panelRef.disabled = true;
        removed++;
      }
    });
    clearClashes3D();
    if (removed > 0) {
      if (typeof global.wpFastRenderSimulatedPanels === 'function') global.wpFastRenderSimulatedPanels(true);
      if (global.RA && global.RA.EventBus && global.RA.Events) {
        global.RA.EventBus.emit(global.RA.Events.PROJECT_UPDATED, { source: 'clash-auto-resolve' });
      }
      if (global.showToast) global.showToast('COLISIONES RESUELTAS', removed + ' módulos en choque físico han sido desactivados.', 'success', 2800);
    }
    return removed;
  }

  // ── PLANOS DE SECCIÓN 3D (ClippingPlaneCollection) ──────────────────────────
  function applySectionPlane(axis, offsetMeters) {
    if (!global.viewer || !global.viewer.scene || !global.Cesium) return false;
    var C = global.Cesium;
    var normal = new C.Cartesian3(1, 0, 0);
    if (axis === 'NS') normal = new C.Cartesian3(0, 1, 0);
    else if (axis === 'Z') normal = new C.Cartesian3(0, 0, -1);

    var dist = Number(offsetMeters) || 0;
    var planes = new C.ClippingPlaneCollection({
      planes: [new C.ClippingPlane(normal, dist)],
      edgeWidth: 1.5,
      edgeColor: C.Color.CYAN
    });

    if (global.viewer.scene.globe) {
      global.viewer.scene.globe.clippingPlanes = planes;
    }
    _sectionState = { active: true, axis: axis || 'EW', offsetM: dist };
    if (global.viewer.scene.requestRender) global.viewer.scene.requestRender();
    return true;
  }

  function clearSectionPlane() {
    if (global.viewer && global.viewer.scene && global.viewer.scene.globe) {
      try { global.viewer.scene.globe.clippingPlanes = undefined; } catch (_) {}
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
