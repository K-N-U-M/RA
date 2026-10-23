/**
 * ═══════════════════════════════════════════════════════════════════════
 * wind-visualizer.js — Primitivas 3D CesiumJS para aerogeneradores
 *                      Animación cinemática de aspas y renderizado robusto
 * ═══════════════════════════════════════════════════════════════════════
 * Principios:
 *  - ZERO-RECREATION: durante MOUSE_MOVE solo se muta modelMatrix en GPU
 *  - BATCHING: cada aerogenerador = 1 Cesium.Primitive consolidada
 *  - Formato idéntico al probado en wind-turbine.js
 * @version 1.1.0  2026-10-22
 */
(function (global) {
  'use strict';

  var RAWind = global.RAWind || (global.RAWind = {});

  var _primitivesByTurbineId = {};
  var _animationHandle = null;
  var _animationAngles = {};
  var _selectedId = null;

  var COLORS = {
    mast:     '#94A3B8',
    nacelle:  '#CBD5E1',
    blade:    '#E2E8F0',
    hub:      '#64748B',
    arm:      '#94A3B8',
    selected: '#F59E0B'
  };

  function _getViewer() {
    return (global.viewer && !global.viewer.isDestroyed && !global.viewer.isDestroyed()) ? global.viewer : null;
  }

  function _getCesium() {
    return global.Cesium || null;
  }

  function _toCartesian3(posCartographic) {
    var Cesium = _getCesium();
    if (!Cesium || !posCartographic) return null;
    return Cesium.Cartesian3.fromRadians(
      posCartographic.longitudeRad,
      posCartographic.latitudeRad,
      posCartographic.altitudeM || 0
    );
  }

  function _removePrimitives(turbineId) {
    var viewer = _getViewer();
    var entry = _primitivesByTurbineId[turbineId];
    if (!entry || !viewer) {
      delete _primitivesByTurbineId[turbineId];
      return;
    }
    if (entry.primitive) {
      try {
        if (!entry.primitive.isDestroyed()) {
          viewer.scene.primitives.remove(entry.primitive);
        }
      } catch (e) {
        console.warn('[RAWindVisualizer] Error eliminando primitiva:', e);
      }
    }
    delete _primitivesByTurbineId[turbineId];
    delete _animationAngles[turbineId];
  }

  function _buildTurbinePrimitive(turbineInstance, isSelected) {
    var Cesium = _getCesium();
    var viewer = _getViewer();
    if (!Cesium || !viewer || !turbineInstance) return null;

    var pos = turbineInstance.positionCartographic;
    var baseCenter = _toCartesian3(pos);
    if (!baseCenter) return null;

    var normal = Cesium.Cartesian3.normalize(baseCenter, new Cesium.Cartesian3());
    var uVec = Cesium.Cartesian3.cross(normal, Cesium.Cartesian3.UNIT_Z, new Cesium.Cartesian3());
    if (Cesium.Cartesian3.magnitude(uVec) < 0.01) {
      uVec = Cesium.Cartesian3.cross(normal, Cesium.Cartesian3.UNIT_X, new Cesium.Cartesian3());
    }
    uVec = Cesium.Cartesian3.normalize(uVec, uVec);
    var vVec = Cesium.Cartesian3.normalize(
      Cesium.Cartesian3.cross(normal, uVec, new Cesium.Cartesian3()),
      new Cesium.Cartesian3()
    );

    var yawRad = turbineInstance.orientationRad || 0;
    var cYaw = Math.cos(yawRad), sYaw = Math.sin(yawRad);
    var rEast = new Cesium.Cartesian3();
    var rNorth = new Cesium.Cartesian3();
    var tmp = new Cesium.Cartesian3();
    Cesium.Cartesian3.multiplyByScalar(uVec, cYaw, rEast);
    Cesium.Cartesian3.multiplyByScalar(vVec, sYaw, tmp);
    Cesium.Cartesian3.add(rEast, tmp, rEast);
    Cesium.Cartesian3.multiplyByScalar(uVec, -sYaw, rNorth);
    Cesium.Cartesian3.multiplyByScalar(vVec, cYaw, tmp);
    Cesium.Cartesian3.add(rNorth, tmp, rNorth);

    var rotBaseMat3 = new Cesium.Matrix3(
      rEast.x, rNorth.x, normal.x,
      rEast.y, rNorth.y, normal.y,
      rEast.z, rNorth.z, normal.z
    );
    var rootModelMatrix = Cesium.Matrix4.fromRotationTranslation(rotBaseMat3, baseCenter, new Cesium.Matrix4());

    var catalog = turbineInstance._catalog || {};
    var type = (catalog.type === 'VAWT') ? 'vawt' : 'hawt';
    var mastH = Math.max(2.0, (turbineInstance.supportStructure ? turbineInstance.supportStructure.hubHeightM : 18));
    var bladeR = Math.max(0.5, (catalog.rotorDiameterM || 6.0) / 2);

    function col(typeKey) {
      var hex = isSelected ? COLORS.selected : (COLORS[typeKey] || '#CBD5E1');
      return Cesium.Color.fromCssColorString(hex);
    }

    var VF = Cesium.PerInstanceColorAppearance.VERTEX_FORMAT;
    var instances = [];

    function addInstance(geom, color, localTranslation, localRotMat3, instId) {
      var rotM = localRotMat3 || Cesium.Matrix3.IDENTITY;
      var transM = localTranslation || Cesium.Cartesian3.ZERO;
      var localMat4 = Cesium.Matrix4.fromRotationTranslation(rotM, transM, new Cesium.Matrix4());
      instances.push(new Cesium.GeometryInstance({
        id: instId,
        geometry: geom,
        modelMatrix: localMat4,
        attributes: {
          color: Cesium.ColorGeometryInstanceAttribute.fromColor(color)
        }
      }));
    }

    if (type === 'vawt') {
      var vMastGeom = new Cesium.CylinderGeometry({
        length: mastH,
        topRadius: Math.max(0.06, bladeR * 0.04),
        bottomRadius: Math.max(0.08, bladeR * 0.06),
        slices: 12,
        vertexFormat: VF
      });
      addInstance(vMastGeom, col('mast'), new Cesium.Cartesian3(0, 0, mastH / 2), null, 'wt_mast_' + turbineInstance.id);

      var vBladeH = mastH * 0.55;
      var vBladeMid = mastH * 0.65;
      var armTopH = vBladeMid + vBladeH / 2;
      var armBotH = vBladeMid - vBladeH / 2;
      var vBladeThick = Math.max(0.03, bladeR * 0.035);
      var vBladeChord = Math.max(0.12, bladeR * 0.12);

      for (var vb = 0; vb < 3; vb++) {
        var vAngle = vb * (2 * Math.PI / 3);
        var vCos = Math.cos(vAngle);
        var vSin = Math.sin(vAngle);
        var vDx = bladeR * vCos;
        var vDy = bladeR * vSin;

        var vBladeGeom = Cesium.BoxGeometry.fromDimensions({
          vertexFormat: VF,
          dimensions: new Cesium.Cartesian3(vBladeChord, vBladeThick, vBladeH)
        });
        var vBladeRot = new Cesium.Matrix3(
          vCos, -vSin, 0,
          vSin,  vCos, 0,
          0,     0,    1
        );
        addInstance(vBladeGeom, col('blade'), new Cesium.Cartesian3(vDx, vDy, vBladeMid), vBladeRot, 'wt_bl' + vb + '_' + turbineInstance.id);

        var vHeights = [armTopH, armBotH];
        var armThick = Math.max(0.03, vBladeThick);
        for (var ai = 0; ai < 2; ai++) {
          var armGeom = Cesium.BoxGeometry.fromDimensions({
            vertexFormat: VF,
            dimensions: new Cesium.Cartesian3(bladeR, armThick, armThick)
          });
          addInstance(armGeom, col('arm'), new Cesium.Cartesian3((bladeR / 2) * vCos, (bladeR / 2) * vSin, vHeights[ai]), vBladeRot, 'wt_ar' + ai + '_' + vb + '_' + turbineInstance.id);
        }
      }
    } else {
      // HAWT
      var mastScale = Math.max(0.4, Math.min(3.0, mastH / 8.0));
      var mastTopR  = Math.max(0.08, 0.18 * mastScale);
      var mastBotR  = Math.max(0.14, 0.32 * mastScale);
      var mastGeom  = new Cesium.CylinderGeometry({
        length: mastH,
        topRadius: mastTopR,
        bottomRadius: mastBotR,
        slices: 14,
        vertexFormat: VF
      });
      addInstance(mastGeom, col('mast'), new Cesium.Cartesian3(0, 0, mastH / 2), null, 'wt_mast_' + turbineInstance.id);

      var rotorScale = Math.max(0.35, Math.min(3.5, bladeR / 2.5));
      var nacelleW = 0.5 * rotorScale;
      var nacelleL = 1.2 * rotorScale;
      var nacelleH = 0.5 * rotorScale;
      var nacelleGeom = Cesium.BoxGeometry.fromDimensions({
        vertexFormat: VF,
        dimensions: new Cesium.Cartesian3(nacelleW, nacelleL, nacelleH)
      });
      var nacelleCenterY = nacelleL * 0.25;
      addInstance(nacelleGeom, col('nacelle'), new Cesium.Cartesian3(0, nacelleCenterY, mastH), null, 'wt_nac_' + turbineInstance.id);

      var hubL = 0.30 * rotorScale;
      var hubR = 0.20 * rotorScale;
      var hubGeom = new Cesium.CylinderGeometry({
        length: hubL,
        topRadius: hubR,
        bottomRadius: hubR,
        slices: 10,
        vertexFormat: VF
      });
      var hubRot = new Cesium.Matrix3(
        1,  0, 0,
        0,  0, 1,
        0, -1, 0
      );
      var hubY = nacelleCenterY + (nacelleL / 2) + (hubL / 2);
      var hubZ = mastH;
      addInstance(hubGeom, col('hub'), new Cesium.Cartesian3(0, hubY, hubZ), hubRot, 'wt_hub_' + turbineInstance.id);

      for (var b = 0; b < 3; b++) {
        var bAngle = b * (2 * Math.PI / 3);
        var cosA = Math.cos(bAngle);
        var sinA = Math.sin(bAngle);

        var bladeCenterX = (bladeR / 2) * sinA;
        var bladeCenterZ = hubZ + (bladeR / 2) * cosA;

        var bRot = new Cesium.Matrix3(
          cosA, 0, sinA,
          0,    1, 0,
         -sinA, 0, cosA
        );

        var bladeW = Math.max(0.08, bladeR * 0.07);
        var bladeThick = Math.max(0.03, bladeW * 0.25);
        var bladeGeom = Cesium.BoxGeometry.fromDimensions({
          vertexFormat: VF,
          dimensions: new Cesium.Cartesian3(bladeW, bladeThick, bladeR)
        });
        addInstance(bladeGeom, col('blade'), new Cesium.Cartesian3(bladeCenterX, hubY, bladeCenterZ), bRot, 'wt_bl' + b + '_' + turbineInstance.id);
      }
    }

    try {
      var prim = viewer.scene.primitives.add(new Cesium.Primitive({
        geometryInstances: instances,
        modelMatrix: rootModelMatrix,
        appearance: new Cesium.PerInstanceColorAppearance({ translucent: false, closed: true }),
        shadows: Cesium.ShadowMode ? Cesium.ShadowMode.ENABLED : undefined,
        asynchronous: false
      }));
      return prim;
    } catch (errPrim) {
      console.error('[RAWindVisualizer] Error creando Cesium.Primitive:', errPrim);
      return null;
    }
  }

  function renderTurbine(turbineInstance, selected) {
    if (!turbineInstance || !turbineInstance.id) return;
    _removePrimitives(turbineInstance.id);
    var prim = _buildTurbinePrimitive(turbineInstance, !!selected);
    if (prim) {
      _primitivesByTurbineId[turbineInstance.id] = { primitive: prim, turbineId: turbineInstance.id };
    }
  }

  function renderAll() {
    var viewer = _getViewer();
    if (!viewer) return;
    (global.windTurbines || []).forEach(function (t) {
      if (!_primitivesByTurbineId[t.id]) {
        renderTurbine(t, t.id === _selectedId);
      }
    });
  }

  function clearAll() {
    Object.keys(_primitivesByTurbineId).forEach(function (id) {
      _removePrimitives(id);
    });
  }

  function selectTurbine(id) {
    if (_selectedId && _selectedId !== id) {
      var prev = (global.windTurbines || []).find(function (t) { return t.id === _selectedId; });
      if (prev) {
        _removePrimitives(_selectedId);
        renderTurbine(prev, false);
      }
    }
    _selectedId = id || null;
    if (id) {
      var curr = (global.windTurbines || []).find(function (t) { return t.id === id; });
      if (curr) {
        _removePrimitives(id);
        renderTurbine(curr, true);
      }
    }
  }

  function onTurbinesChanged(eventType, data) {
    if (eventType === 'wind_turbine_added') {
      renderTurbine(data, false);
    } else if (eventType === 'wind_turbine_removed') {
      _removePrimitives(data.id);
    } else if (eventType === 'wind_turbine_modified') {
      _removePrimitives(data.id);
      renderTurbine(data, data.id === _selectedId);
    }
  }

  var RAWindVisualizer = {
    renderTurbine: renderTurbine,
    renderAll: renderAll,
    clearAll: clearAll,
    removeTurbine: _removePrimitives,
    selectTurbine: selectTurbine,
    onTurbinesChanged: onTurbinesChanged
  };

  global.RAWindVisualizer = RAWindVisualizer;
  RAWind.Visualizer = RAWindVisualizer;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = RAWindVisualizer;
  }

})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : global));
