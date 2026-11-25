/**
 * js/cad-osnap-polar.js — Suite CAD OSNAP + Polar Tracking + Entrada Numérica Directa [F7-03]
 * ============================================================================================
 * Motor geométrico modular para trazado de precisión sobre planos de trabajo inclinados:
 *  - Modos OSNAP activables: Endpoint, Midpoint, Intersection, Perpendicular, Parallel.
 *  - Guías polares configurables (15° / 30° / 45° / 90°) proyectadas en coordenadas locales (u, v).
 *  - Cuadro interactivo de entrada numérica directa (Longitud [Tab] Ángulo [Enter]) con proyección
 *    exacta al milímetro sobre el plano de trabajo activo y marcador 3D opcional en Cesium.
 */
(function (global) {
  'use strict';

  var _config = {
    enabled: true,
    endpoint: true,
    midpoint: true,
    intersection: true,
    perpendicular: true,
    parallel: true,
    polar: true,
    polarStepDeg: 15,
    snapRadiusMeters: 0.45
  };

  var _lastResult = null;
  var _markerEntities = [];

  function _dist2D(a, b) {
    var dx = a.u - b.u;
    var dy = a.v - b.v;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function _segmentIntersection2D(p1, p2, p3, p4) {
    var x1 = p1.u, y1 = p1.v, x2 = p2.u, y2 = p2.v;
    var x3 = p3.u, y3 = p3.v, x4 = p4.u, y4 = p4.v;
    var denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 1e-9) return null;
    var t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    var u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      return { u: x1 + t * (x2 - x1), v: y1 + t * (y2 - y1) };
    }
    return null;
  }

  function _projectPerpendicular2D(pt, a, b) {
    var dx = b.u - a.u;
    var dy = b.v - a.v;
    var len2 = dx * dx + dy * dy;
    if (len2 < 1e-9) return null;
    var t = ((pt.u - a.u) * dx + (pt.v - a.v) * dy) / len2;
    if (t < 0 || t > 1) return null;
    return { u: a.u + t * dx, v: a.v + t * dy };
  }

  /**
   * Extrae todos los segmentos 2D (u, v) de los faldones activos en WP.polylines.
   */
  function collectActiveSegments2D() {
    var segs = [];
    if (!global.WP || !Array.isArray(global.WP.polylines)) return segs;
    global.WP.polylines.forEach(function (poly, pIdx) {
      var pts = (poly && poly.roofInfo && Array.isArray(poly.roofInfo.poly2D))
        ? poly.roofInfo.poly2D
        : (poly && Array.isArray(poly.points2D) ? poly.points2D : null);
      if (!pts || pts.length < 2) return;
      for (var i = 0; i < pts.length; i++) {
        var a = pts[i];
        var b = pts[(i + 1) % pts.length];
        if (!a || !b) continue;
        var au = Number(a.u != null ? a.u : a.x);
        var av = Number(a.v != null ? a.v : a.y);
        var bu = Number(b.u != null ? b.u : b.x);
        var bv = Number(b.v != null ? b.v : b.y);
        if (!Number.isFinite(au) || !Number.isFinite(bu)) continue;
        segs.push({ a: { u: au, v: av }, b: { u: bu, v: bv }, polyIdx: pIdx, edgeIdx: i });
      }
    });
    return segs;
  }

  /**
   * Resuelve el mejor punto OSNAP + Polar Tracking para una posición cursor (u, v) y punto ancla opcional.
   */
  function resolveSnap2D(cursorUV, anchorUV, customSegments) {
    var target = { u: Number(cursorUV.u) || 0, v: Number(cursorUV.v) || 0 };
    if (!_config.enabled) return { snapped: false, mode: 'NONE', point: target };

    var segs = Array.isArray(customSegments) ? customSegments : collectActiveSegments2D();
    var best = null;
    var bestDist = _config.snapRadiusMeters;

    var consider = function (pt, mode, priorityBoost) {
      var d = _dist2D(target, pt);
      var score = d - (priorityBoost || 0);
      if (d <= _config.snapRadiusMeters && (!best || score < best.score)) {
        best = { snapped: true, mode: mode, point: pt, dist: Number(d.toFixed(4)), score: score };
      }
    };

    for (var i = 0; i < segs.length; i++) {
      var s = segs[i];
      if (_config.endpoint) {
        consider(s.a, 'ENDPOINT', 0.08);
        consider(s.b, 'ENDPOINT', 0.08);
      }
      if (_config.midpoint) {
        consider({ u: (s.a.u + s.b.u) * 0.5, v: (s.a.v + s.b.v) * 0.5 }, 'MIDPOINT', 0.05);
      }
      if (_config.perpendicular && anchorUV) {
        var foot = _projectPerpendicular2D(anchorUV, s.a, s.b);
        if (foot) consider(foot, 'PERPENDICULAR', 0.04);
      }
      if (_config.intersection) {
        for (var j = i + 1; j < segs.length; j++) {
          var inter = _segmentIntersection2D(s.a, s.b, segs[j].a, segs[j].b);
          if (inter) consider(inter, 'INTERSECTION', 0.07);
        }
      }
    }

    if (best) return { snapped: true, mode: best.mode, point: best.point, dist: best.dist };

    // Parallel a arista de referencia si hay punto ancla
    if (_config.parallel && anchorUV && segs.length > 0) {
      var du = target.u - anchorUV.u;
      var dv = target.v - anchorUV.v;
      var r = Math.sqrt(du * du + dv * dv);
      if (r > 0.05) {
        var curAng = Math.atan2(dv, du);
        for (var k = 0; k < segs.length; k++) {
          var sAng = Math.atan2(segs[k].b.v - segs[k].a.v, segs[k].b.u - segs[k].a.u);
          var diff = Math.abs(Math.sin(curAng - sAng));
          if (diff < 0.055) { // ~3.1° tolerancia de paralelismo
            var dirSign = (Math.cos(curAng - sAng) >= 0) ? 1 : -1;
            return {
              snapped: true,
              mode: 'PARALLEL',
              point: { u: anchorUV.u + Math.cos(sAng) * r * dirSign, v: anchorUV.v + Math.sin(sAng) * r * dirSign },
              angleDeg: Number(((sAng * 180 / Math.PI + 360) % 360).toFixed(2)),
              lengthM: Number(r.toFixed(3))
            };
          }
        }
      }
    }

    // Polar Tracking (15° / 30° / 45° / 90°)
    if (_config.polar && anchorUV) {
      var pdu = target.u - anchorUV.u;
      var pdv = target.v - anchorUV.v;
      var pr = Math.sqrt(pdu * pdu + pdv * pdv);
      if (pr > 0.05) {
        var deg = (Math.atan2(pdv, pdu) * 180 / Math.PI + 360) % 360;
        var step = Math.max(5, Number(_config.polarStepDeg) || 15);
        var nearestDeg = Math.round(deg / step) * step;
        if (Math.abs(deg - nearestDeg) <= 4.0) {
          var rad = nearestDeg * Math.PI / 180;
          return {
            snapped: true,
            mode: 'POLAR',
            point: { u: anchorUV.u + Math.cos(rad) * pr, v: anchorUV.v + Math.sin(rad) * pr },
            angleDeg: nearestDeg % 360,
            lengthM: Number(pr.toFixed(3))
          };
        }
      }
    }

    return { snapped: false, mode: 'NONE', point: target };
  }

  /**
   * Obtiene el marco de referencia del plano de trabajo activo (origin, uVec, vVec, normal).
   */
  function _getActivePlaneFrame() {
    var wp = global.WP || {};
    var poly = null;
    if (Array.isArray(wp.polylines) && wp.polylines.length > 0) {
      var idx = (typeof wp.selectedPolylineIndex === 'number' && wp.polylines[wp.selectedPolylineIndex])
        ? wp.selectedPolylineIndex
        : 0;
      poly = wp.polylines[idx];
    }
    if (poly && poly.roofInfo && poly.roofInfo.origin && poly.roofInfo.uVec && poly.roofInfo.vVec) {
      return {
        origin: poly.roofInfo.origin,
        uVec: poly.roofInfo.uVec,
        vVec: poly.roofInfo.vVec,
        normal: poly.roofInfo.normal,
        name: poly.name || 'Faldón Activo'
      };
    }
    if (global.lastRoofInfo && global.lastRoofInfo.origin && global.lastRoofInfo.uVec && global.lastRoofInfo.vVec) {
      return {
        origin: global.lastRoofInfo.origin,
        uVec: global.lastRoofInfo.uVec,
        vVec: global.lastRoofInfo.vVec,
        normal: global.lastRoofInfo.normal,
        name: 'Último Plano Activo'
      };
    }
    return null;
  }

  /**
   * Proyecta un vector numérico exacto (longitud en metros, ángulo en grados) sobre el plano inclinado activo
   * y dibuja la arista exacta de referencia en el visor Cesium 3D.
   */
  function applyNumericEdge(lengthMeters, angleDeg, originUV) {
    var len = Number(lengthMeters);
    var ang = Number(angleDeg);
    if (!Number.isFinite(len) || len <= 0) {
      throw new Error('Introduce una longitud válida en metros (> 0).');
    }
    if (!Number.isFinite(ang)) ang = 0;

    var base = originUV || { u: 0, v: 0 };
    var rad = ang * Math.PI / 180.0;
    var du = Number((Math.cos(rad) * len).toFixed(4));
    var dv = Number((Math.sin(rad) * len).toFixed(4));
    var endUV = { u: Number((base.u + du).toFixed(4)), v: Number((base.v + dv).toFixed(4)) };

    var frame = _getActivePlaneFrame();
    var worldStart = null;
    var worldEnd = null;
    if (frame && global.Cesium && global.viewer && global.viewer.entities) {
      var C3 = global.Cesium.Cartesian3;
      var lift = frame.normal ? C3.multiplyByScalar(frame.normal, 0.12, new C3()) : new C3(0, 0, 0);
      worldStart = C3.add(
        C3.add(frame.origin, C3.multiplyByScalar(frame.uVec, base.u, new C3()), new C3()),
        C3.add(C3.multiplyByScalar(frame.vVec, base.v, new C3()), lift, new C3()),
        new C3()
      );
      worldEnd = C3.add(
        C3.add(frame.origin, C3.multiplyByScalar(frame.uVec, endUV.u, new C3()), new C3()),
        C3.add(C3.multiplyByScalar(frame.vVec, endUV.v, new C3()), lift, new C3()),
        new C3()
      );

      clearGuides3D();
      var lineEnt = global.viewer.entities.add({
        id: 'ra_osnap_numeric_edge',
        polyline: {
          positions: [worldStart, worldEnd],
          width: 3,
          material: global.Cesium.Color.CYAN
        }
      });
      var ptEnt = global.viewer.entities.add({
        id: 'ra_osnap_numeric_end',
        position: worldEnd,
        point: { pixelSize: 9, color: global.Cesium.Color.LIME, outlineColor: global.Cesium.Color.BLACK, outlineWidth: 2 },
        label: {
          text: len.toFixed(3) + ' m @ ' + ang.toFixed(1) + '°',
          font: '700 12px Inter, sans-serif',
          fillColor: global.Cesium.Color.WHITE,
          showBackground: true,
          backgroundColor: global.Cesium.Color.fromCssColorString('rgba(15,23,42,0.88)'),
          pixelOffset: new global.Cesium.Cartesian2(0, -18)
        }
      });
      _markerEntities.push(lineEnt, ptEnt);
      if (global.viewer.scene && global.viewer.scene.requestRender) global.viewer.scene.requestRender();
    }

    _lastResult = {
      lengthM: Number(len.toFixed(3)),
      angleDeg: Number(ang.toFixed(2)),
      deltaU: du,
      deltaV: dv,
      startUV: base,
      endUV: endUV,
      planeName: frame ? frame.name : 'Plano Local 2D (sin faldón activo)',
      projectedIn3D: Boolean(worldEnd)
    };
    return _lastResult;
  }

  function clearGuides3D() {
    if (global.viewer && global.viewer.entities) {
      _markerEntities.forEach(function (ent) {
        try { global.viewer.entities.remove(ent); } catch (_) {}
      });
      if (global.viewer.scene && global.viewer.scene.requestRender) global.viewer.scene.requestRender();
    }
    _markerEntities = [];
  }

  /**
   * Cuadro flotante interactivo de entrada numérica directa (Longitud [Tab] Ángulo [Enter]).
   */
  function openNumericPrompt() {
    if (typeof document === 'undefined') return;
    var existing = document.getElementById('ra-osnap-numeric-box');
    if (existing) {
      existing.style.display = 'flex';
      var l0 = document.getElementById('ra-osnap-len');
      if (l0) { l0.focus(); l0.select(); }
      return;
    }

    var box = document.createElement('div');
    box.id = 'ra-osnap-numeric-box';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Entrada numérica exacta CAD');
    box.style.cssText = 'position:fixed;top:68px;right:18px;z-index:var(--z-popover,300);background:rgba(15,23,42,0.96);border:1px solid #38BDF8;border-radius:10px;padding:10px 12px;display:flex;align-items:center;gap:8px;box-shadow:0 12px 30px rgba(0,0,0,0.65);color:#F8FAFC;font-size:12px;';
    box.innerHTML =
      '<span style="font-weight:800;color:#38BDF8;">CAD</span>' +
      '<label for="ra-osnap-len" style="color:#94A3B8;font-size:11px;">Long (m)</label>' +
      '<input id="ra-osnap-len" type="number" step="0.01" value="12.50" style="width:74px;background:#020617;border:1px solid #475569;color:#fff;border-radius:6px;padding:4px 6px;font-family:var(--font-mono);font-size:12px;">' +
      '<label for="ra-osnap-ang" style="color:#94A3B8;font-size:11px;">Áng (°)</label>' +
      '<input id="ra-osnap-ang" type="number" step="1" value="90" style="width:62px;background:#020617;border:1px solid #475569;color:#fff;border-radius:6px;padding:4px 6px;font-family:var(--font-mono);font-size:12px;">' +
      '<button type="button" id="ra-osnap-go" class="doc-mini-btn" style="background:#0369A1;border-color:#38BDF8;color:#fff;font-weight:800;padding:5px 10px;">Proyectar</button>' +
      '<button type="button" id="ra-osnap-close" class="ra-aaa-close-btn" aria-label="Cerrar entrada numérica">✕</button>';
    document.body.appendChild(box);

    var lenEl = document.getElementById('ra-osnap-len');
    var angEl = document.getElementById('ra-osnap-ang');
    var goBtn = document.getElementById('ra-osnap-go');
    var clsBtn = document.getElementById('ra-osnap-close');

    var submit = function () {
      try {
        var r = applyNumericEdge(parseFloat(lenEl.value), parseFloat(angEl.value));
        if (global.showToast) {
          global.showToast('ARISTA CAD PROYECTADA', r.lengthM + ' m @ ' + r.angleDeg + '° → (Δu=' + r.deltaU + ' m, Δv=' + r.deltaV + ' m) en ' + r.planeName, 'success', 3200);
        }
      } catch (err) {
        if (global.showToast) global.showToast('ENTRADA CAD INVÁLIDA', String(err.message || err), 'warning', 2500);
      }
    };

    if (goBtn) goBtn.onclick = submit;
    if (clsBtn) clsBtn.onclick = function () { box.style.display = 'none'; };
    [lenEl, angEl].forEach(function (inp) {
      if (!inp) return;
      inp.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') { ev.preventDefault(); submit(); }
        if (ev.key === 'Escape') { ev.preventDefault(); box.style.display = 'none'; }
      });
    });
    if (lenEl) { lenEl.focus(); lenEl.select(); }
  }

  global.RACadOsnap = {
    getConfig: function () { return Object.assign({}, _config); },
    setConfig: function (patch) { Object.assign(_config, patch || {}); return this.getConfig(); },
    collectActiveSegments2D: collectActiveSegments2D,
    resolveSnap2D: resolveSnap2D,
    applyNumericEdge: applyNumericEdge,
    clearGuides3D: clearGuides3D,
    openNumericPrompt: openNumericPrompt,
    getLastResult: function () { return _lastResult; }
  };
  if (global.RA) global.RA.CadOsnap = global.RACadOsnap;
})(typeof window !== 'undefined' ? window : this);
