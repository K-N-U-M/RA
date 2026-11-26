/**
 * ═══════════════════════════════════════════════════════════════════════
 * wind-turbine.js — Módulo de Aerogeneradores 3D para RA (Visor Solar)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Primitiva paramétrica de alto rendimiento (Calidad AAA):
 *  - HAWT (eje horizontal): mástil cónico + góndola + hub + 3 aspas
 *  - VAWT (eje vertical):   mástil fino + 3 palas verticales + 6 brazos
 *
 * Mejoras de Arquitectura Gráfica (v2.0):
 *  1. ZERO-RECREATION EN DRAG: updateObstacleLiveModelMatrix actualiza matrices
 *     existentes en GPU sin destruir ni compilar primitivas durante MOUSE_MOVE.
 *  2. BATCHING WEBGL / DRAW CALLS: Agrupación de todas las geometrías en una
 *     única Cesium.Primitive consolidada por aerogenerador.
 *  3. ORIENTACIÓN ADAPTATIVA: Soporte de alineación Coplanar / Vertical
 *     respecto al plano de trabajo y faldón activo.
 *  4. NO MUTACIÓN DE ESTADO: Renderizado limpio sin alterar arrays globales (splice).
 *  5. SOMBRAS ANALÍTICAS PRECISAS: Sombra cilíndrica real del mástil (r=0.15m).
 *
 * @version 2.0.0  2026-10-12
 */
(function (root) {
  'use strict';

  var Cesium = root.Cesium;
  if (!Cesium) {
    console.warn('[RAWindTurbine] Cesium no disponible');
    root.RAWindTurbine = {
      toggleVisibility: function(idOrIdx) {
        var obsList = (typeof root !== 'undefined' && Array.isArray(root.obstacles)) ? root.obstacles : (typeof global !== 'undefined' && Array.isArray(global.obstacles) ? global.obstacles : []);
        var obs = (typeof idOrIdx === 'string')
          ? obsList.find(function(o) { return o.id === idOrIdx; })
          : obsList[idOrIdx];
        if (obs) {
          obs.visible = (obs.visible === false) ? true : false;
          if (obs.visible === false && ((typeof root !== 'undefined' && root.selectedObstacleId === obs.id) || (typeof global !== 'undefined' && global.selectedObstacleId === obs.id))) {
            if (typeof root !== 'undefined' && typeof root.selectObstacle === 'function') root.selectObstacle(null);
            else if (typeof global !== 'undefined' && typeof global.selectObstacle === 'function') global.selectObstacle(null);
            if (typeof root !== 'undefined') root.selectedObstacleId = null;
            if (typeof global !== 'undefined') global.selectedObstacleId = null;
          }
        }
      }
    };
    return;
  }

  // ════════════════════════════════════════════════════════════════
  //  1. CONSTANTES Y COLORES
  // ════════════════════════════════════════════════════════════════

  var COLORS = {
    mast:     Cesium.Color.fromCssColorString('#94A3B8'),
    nacelle:  Cesium.Color.fromCssColorString('#CBD5E1'),
    blade:    Cesium.Color.fromCssColorString('#E2E8F0'),
    hub:      Cesium.Color.fromCssColorString('#64748B'),
    arm:      Cesium.Color.fromCssColorString('#94A3B8'),
    selected: Cesium.Color.fromCssColorString('#F59E0B')
  };

  var HAWT_DEFAULTS = { mastHeight: 8, bladeRadius: 2.5 };
  var VAWT_DEFAULTS = { mastHeight: 6, bladeRadius: 1.0, bladeLength: 3.5 };

  // ════════════════════════════════════════════════════════════════
  //  2. REGISTRO EN OBSTACLE_DEFS
  // ════════════════════════════════════════════════════════════════

  if (root.OBSTACLE_DEFS) {
    root.OBSTACLE_DEFS.wind_turbine = {
      name: 'Aerogenerador',
      w: 0.40, l: 0.40,
      h: HAWT_DEFAULTS.mastHeight + HAWT_DEFAULTS.bladeRadius,
      alignment: 'vertical',
      turbineType: 'hawt',
      bladeRadius: HAWT_DEFAULTS.bladeRadius,
      mastHeight: HAWT_DEFAULTS.mastHeight
    };
  }

  // ════════════════════════════════════════════════════════════════
  //  3. GESTIÓN DE PRIMITIVAS Y REGISTRO EN ESCENA
  // ════════════════════════════════════════════════════════════════

  root._windTurbinePrimitives = [];

  function cleanAll() {
    var viewer = root.viewer;
    if (!viewer) return;
    (root._windTurbinePrimitives || []).forEach(function (entry) {
      var p = entry.primitive || entry;
      try { if (p && !p.isDestroyed()) viewer.scene.primitives.remove(p); } catch (e) { /* silenciado */ }
    });
    root._windTurbinePrimitives = [];
  }

  function cleanForObs(obsId) {
    var viewer = root.viewer;
    if (!viewer) return;
    var keep = [];
    (root._windTurbinePrimitives || []).forEach(function (entry) {
      if (entry && entry._obsId === obsId) {
        var p = entry.primitive || entry;
        try { if (p && !p.isDestroyed()) viewer.scene.primitives.remove(p); } catch (e) { /* silenciado */ }
      } else {
        keep.push(entry);
      }
    });
    root._windTurbinePrimitives = keep;
  }

  // ════════════════════════════════════════════════════════════════
  //  4. INICIALIZACIÓN DE PROPIEDADES
  // ════════════════════════════════════════════════════════════════

  function ensureProps(obs) {
    if (!obs || obs.type !== 'wind_turbine') return;
    if (obs.turbineType === undefined) obs.turbineType = 'hawt';
    var defs = obs.turbineType === 'vawt' ? VAWT_DEFAULTS : HAWT_DEFAULTS;
    if (obs.bladeRadius === undefined) obs.bladeRadius = defs.bladeRadius;
    if (obs.mastHeight === undefined)  obs.mastHeight  = defs.mastHeight;
    if (obs.bladeLength === undefined) obs.bladeLength = (obs.turbineType === 'vawt' ? (defs.bladeLength || 3.5) : (obs.bladeRadius * 2));
    var vawtTopExtra = (obs.turbineType === 'vawt') ? Math.max(0, (obs.mastHeight * 0.65 + (obs.bladeLength || 3.5)/2) - obs.mastHeight) : 0;
    obs.h = Math.round((obs.mastHeight + (obs.turbineType === 'hawt' ? obs.bladeRadius : vawtTopExtra)) * 10) / 10;
    if (obs.w === undefined || obs.w < 0.5) obs.w = Math.round(obs.bladeRadius * 2 * 10) / 10;
    if (obs.l === undefined || obs.l < 0.5) obs.l = Math.round(obs.bladeRadius * 2 * 10) / 10;
  }

  function syncDimensions(obs) {
    if (!obs || obs.type !== 'wind_turbine') return;
    ensureProps(obs);
    var vawtTopExtra = (obs.turbineType === 'vawt') ? Math.max(0, (obs.mastHeight * 0.65 + (obs.bladeLength || 3.5)/2) - obs.mastHeight) : 0;
    obs.h = Math.round((obs.mastHeight + (obs.turbineType === 'hawt' ? obs.bladeRadius : vawtTopExtra)) * 10) / 10;
    obs.w = Math.round(obs.bladeRadius * 2 * 10) / 10;
    obs.l = Math.round(obs.bladeRadius * 2 * 10) / 10;

    var wEl = document.getElementById('obs-width');
    var lEl = document.getElementById('obs-length');
    var hEl = document.getElementById('obs-height');
    if (wEl) wEl.value = obs.w.toFixed(2);
    if (lEl) lEl.value = obs.l.toFixed(2);
    if (hEl) hEl.value = obs.h.toFixed(2);

    var sumEl = document.getElementById('obs-scale-summary');
    if (sumEl) sumEl.textContent = obs.w.toFixed(1) + 'm · ' + obs.l.toFixed(1) + 'm · ' + obs.h.toFixed(1) + 'm';

    var mInput = document.getElementById('wt-mast-height');
    var bInput = document.getElementById('wt-blade-radius');
    if (mInput) mInput.value = obs.mastHeight;
    if (bInput) bInput.value = obs.bladeRadius;

    var el = document.getElementById('wt-total-height');
    if (el) el.textContent = obs.h.toFixed(1);
    var el2 = document.getElementById('wt-rotor-diam');
    if (el2) el2.textContent = (obs.bladeRadius * 2).toFixed(1);
  }

  function invalidateAndRerender(reason) {
    if (typeof root.wpInvalidateHeatmap === 'function') {
      root.wpInvalidateHeatmap(reason || 'Parámetros eólicos actualizados');
    }
    triggerRerender();
  }

  function onGeneralDimInput(obs) {
    if (!obs || obs.type !== 'wind_turbine') return;
    ensureProps(obs);

    var wEl = document.getElementById('obs-width');
    var lEl = document.getElementById('obs-length');
    var hEl = document.getElementById('obs-height');

    var newH = hEl ? parseFloat(hEl.value) : null;
    var newW = wEl ? parseFloat(wEl.value) : null;
    var newL = lEl ? parseFloat(lEl.value) : null;

    if (!isNaN(newH) && newH > 0.5) {
      if (obs.turbineType === 'vawt') {
        obs.mastHeight = Math.max(1.5, Math.round(newH * 10) / 10);
      } else {
        var targetMast = newH - obs.bladeRadius;
        if (targetMast >= 1.5) {
          obs.mastHeight = Math.round(targetMast * 10) / 10;
        } else {
          obs.mastHeight = Math.max(1.5, Math.round((newH * 0.75) * 10) / 10);
          obs.bladeRadius = Math.max(0.3, Math.round((newH * 0.25) * 10) / 10);
        }
      }
    }

    var diamInput = (!isNaN(newW) && newW > 0.4) ? newW : ((!isNaN(newL) && newL > 0.4) ? newL : null);
    if (diamInput) {
      obs.bladeRadius = Math.max(0.3, Math.round((diamInput / 2) * 10) / 10);
    }

    syncDimensions(obs);
    invalidateAndRerender('Dimensiones eólicas actualizadas');
  }

  // ════════════════════════════════════════════════════════════════
  //  5. SISTEMA DE REFERENCIA (ENU / PLANO DE TRABAJO / COPLANAR)
  // ════════════════════════════════════════════════════════════════

  function getObstacleFrame(obs, baseCenter) {
    var wp = (typeof root.getObstacleActivePlane === 'function') ? root.getObstacleActivePlane(obs) : null;
    var normal = null, uVec = null, vVec = null;

    if (wp && wp.normal && wp.uVec && wp.vVec) {
      normal = Cesium.Cartesian3.normalize(wp.normal, new Cesium.Cartesian3());
      uVec = Cesium.Cartesian3.normalize(wp.uVec, new Cesium.Cartesian3());
      vVec = Cesium.Cartesian3.normalize(wp.vVec, new Cesium.Cartesian3());
    } else {
      normal = Cesium.Cartesian3.normalize(baseCenter, new Cesium.Cartesian3());
      uVec = Cesium.Cartesian3.cross(normal, Cesium.Cartesian3.UNIT_Z, new Cesium.Cartesian3());
      if (Cesium.Cartesian3.magnitude(uVec) < 0.01) {
        uVec = Cesium.Cartesian3.cross(normal, Cesium.Cartesian3.UNIT_X, new Cesium.Cartesian3());
      }
      uVec = Cesium.Cartesian3.normalize(uVec, uVec);
      vVec = Cesium.Cartesian3.normalize(Cesium.Cartesian3.cross(normal, uVec, new Cesium.Cartesian3()), new Cesium.Cartesian3());
    }

    var isVertical = (obs.alignment !== 'coplanar');
    var effNormal = normal;
    var effEast = uVec;
    var effNorth = vVec;

    if (isVertical && typeof root.getObstacleOrientationAxes === 'function') {
      var vertAxes = root.getObstacleOrientationAxes(baseCenter, uVec, true);
      if (vertAxes && vertAxes.upVec && vertAxes.uHoriz && vertAxes.vHoriz) {
        effNormal = vertAxes.upVec;
        effEast = vertAxes.uHoriz;
        effNorth = vertAxes.vHoriz;
      }
    }

    return {
      normal: effNormal,
      east: effEast,
      north: effNorth
    };
  }

  /** Aplica yaw (rotación Z) */
  function rotateYaw(east, north, yawRad) {
    var c = Math.cos(yawRad), s = Math.sin(yawRad);
    var rE = new Cesium.Cartesian3();
    var rN = new Cesium.Cartesian3();
    var tmp = new Cesium.Cartesian3();
    Cesium.Cartesian3.multiplyByScalar(east,  c, rE);
    Cesium.Cartesian3.multiplyByScalar(north, s, tmp);
    Cesium.Cartesian3.add(rE, tmp, rE);
    Cesium.Cartesian3.multiplyByScalar(east, -s, rN);
    Cesium.Cartesian3.multiplyByScalar(north, c, tmp);
    Cesium.Cartesian3.add(rN, tmp, rN);
    return { rEast: rE, rNorth: rN };
  }

  function mat3FromCols(c0, c1, c2) {
    return new Cesium.Matrix3(
      c0.x, c1.x, c2.x,
      c0.y, c1.y, c2.y,
      c0.z, c1.z, c2.z
    );
  }

  // ════════════════════════════════════════════════════════════════
  //  6. CONSTRUCCIÓN DE PRIMITIVAS CON BATCHING Y MATRIZ RELATIVA
  // ════════════════════════════════════════════════════════════════

  function buildTurbinePrimitive(obs, viewer, isSelected) {
    ensureProps(obs);
    var mastH   = Number(obs.mastHeight) || HAWT_DEFAULTS.mastHeight;
    var bladeR  = Number(obs.bladeRadius) || HAWT_DEFAULTS.bladeRadius;
    var base    = (obs.cartesian instanceof Cesium.Cartesian3) ? obs.cartesian : new Cesium.Cartesian3(obs.cartesian.x, obs.cartesian.y, obs.cartesian.z);
    var elev    = Number(obs.elevation) || 0;
    var frame   = getObstacleFrame(obs, base);
    var yawRad  = Cesium.Math.toRadians(obs.rot || 0);

    var up     = frame.normal;
    var rv     = rotateYaw(frame.east, frame.north, yawRad);
    var rEast  = rv.rEast;
    var rNorth = rv.rNorth;

    // Matriz base mundial con rotación local del obstáculo
    var rotBaseMat3 = mat3FromCols(rEast, rNorth, up);
    var rootModelMatrix = Cesium.Matrix4.fromRotationTranslation(rotBaseMat3, base, new Cesium.Matrix4());

    if (!root.RAWindVisualizer || typeof root.RAWindVisualizer.buildTurbineGeometryInstances !== 'function') {
      return null;
    }
    var instances = root.RAWindVisualizer.buildTurbineGeometryInstances({
      Cesium: Cesium,
      id: obs.id,
      type: obs.turbineType === 'vawt' ? 'vawt' : 'hawt',
      mastH: mastH,
      bladeR: bladeR,
      vBladeLength: obs.bladeHeightM || obs.bladeLength || (bladeR * 2 * 1.4),
      elev: elev,
      isSelected: isSelected,
      colors: COLORS,
      vawtPrefix: 'v',
      vawtRadialThickness: true
    });

    // ── Primitiva Cesium Única Consolidada (1 Draw Call por aerogenerador) ──
    var prim = viewer.scene.primitives.add(new Cesium.Primitive({
      geometryInstances: instances,
      modelMatrix: rootModelMatrix,
      appearance: new Cesium.PerInstanceColorAppearance({ translucent: false, closed: true }),
      shadows: Cesium.ShadowMode.ENABLED,
      asynchronous: false
    }));

    prim._obsId = obs.id;
    prim._geomSig = 'wt_' + obs.turbineType + '_' + mastH.toFixed(2) + '_' + bladeR.toFixed(2) + '_' + (isSelected ? '1' : '0');

    root._windTurbinePrimitives.push({
      _obsId: obs.id,
      primitive: prim,
      geomSig: prim._geomSig
    });

    return prim;
  }

  // ════════════════════════════════════════════════════════════════
  //  7. ACTUALIZACIÓN EN VIVO (DRAG / MOUSE_MOVE ZERO-ALLOCATION)
  // ════════════════════════════════════════════════════════════════

  function updateLiveModelMatrix(obs) {
    if (!obs || !obs.cartesian) return false;
    var base = (obs.cartesian instanceof Cesium.Cartesian3) ? obs.cartesian : new Cesium.Cartesian3(obs.cartesian.x, obs.cartesian.y, obs.cartesian.z);
    var frame = getObstacleFrame(obs, base);
    var yawRad = Cesium.Math.toRadians(obs.rot || 0);

    var up = frame.normal;
    var rv = rotateYaw(frame.east, frame.north, yawRad);
    var rotBaseMat3 = mat3FromCols(rv.rEast, rv.rNorth, up);
    var newMat4 = Cesium.Matrix4.fromRotationTranslation(rotBaseMat3, base, new Cesium.Matrix4());

    var found = false;
    (root._windTurbinePrimitives || []).forEach(function (entry) {
      if (entry && entry._obsId === obs.id && entry.primitive && !entry.primitive.isDestroyed()) {
        entry.primitive.modelMatrix = newMat4;
        found = true;
      }
    });
    return found;
  }

  // ════════════════════════════════════════════════════════════════
  //  8. RENDERIZADO GLOBAL Y RECONCILIACIÓN
  // ════════════════════════════════════════════════════════════════

  function renderAll() {
    var viewer = root.viewer;
    if (!viewer || !viewer.scene || !viewer.scene.primitives) return;

    if (root.RAWindVisualizer && root.RAWind && root.RAWind.Entity) {
      cleanAll();
      return;
    }

    var activeIds = {};
    (root.obstacles || []).forEach(function (obs) {
      if (obs.type === 'wind_turbine') {
        if (obs.visible === false) {
          cleanForObs(obs.id);
          return;
        }
        activeIds[obs.id] = true;
        ensureProps(obs);

        var isSel = (root.selectedObstacleId === obs.id);
        var mastH = Number(obs.mastHeight) || HAWT_DEFAULTS.mastHeight;
        var bladeR = Number(obs.bladeRadius) || HAWT_DEFAULTS.bladeRadius;
        var sig = 'wt_' + obs.turbineType + '_' + mastH.toFixed(2) + '_' + bladeR.toFixed(2) + '_' + (isSel ? '1' : '0');

        var existing = (root._windTurbinePrimitives || []).find(function (e) {
          return e && e._obsId === obs.id && e.primitive && !e.primitive.isDestroyed();
        });

        if (existing && existing.geomSig === sig) {
          // Reconciliación: actualizar transformación sin destruir la primitiva GPU
          updateLiveModelMatrix(obs);
        } else {
          // Recreación controlada solo al cambiar parámetros de catálogo o selección
          cleanForObs(obs.id);
          buildTurbinePrimitive(obs, viewer, isSel);
        }
      }
    });

    // Purgar turbinas que hayan sido eliminadas
    var toRemove = [];
    (root._windTurbinePrimitives || []).forEach(function (entry) {
      if (entry && !activeIds[entry._obsId]) toRemove.push(entry._obsId);
    });
    toRemove.forEach(cleanForObs);
  }

  // ════════════════════════════════════════════════════════════════
  //  9. HOOKS Y MANTENIMIENTO DEL ESTADO
  // ════════════════════════════════════════════════════════════════

  // Drag en vivo: actualizar matriz matemática instantánea sin tocar GPU geometry
  var _origUpdate = root.updateObstacleLiveModelMatrix;
  root.updateObstacleLiveModelMatrix = function (obs, target) {
    if (obs && obs.type === 'wind_turbine') {
      var ok = updateLiveModelMatrix(obs);
      if (ok) {
        if (root.viewer && root.viewer.scene && typeof root.viewer.scene.requestRender === 'function') {
          root.viewer.scene.requestRender();
        }
        return;
      }
    }
    if (_origUpdate) return _origUpdate(obs, target);
  };

  // Render original de Cesium (sin mutaciones destructivas con splice)
  var _origRender = root.render3DObstaclesInCesium;
  root.render3DObstaclesInCesium = function () {
    if (_origRender) _origRender();
    renderAll();
  };

  // Selección de obstáculos: panel dinámico
  var _origSelect = root.selectObstacle;
  root.selectObstacle = function (obsId) {
    if (obsId) {
      var obsCheck = (root.obstacles || []).find(function (o) { return o.id === obsId; });
      if (obsCheck && obsCheck.visible === false) return;
    }
    if (_origSelect) _origSelect(obsId);
    var obs = (root.obstacles || []).find(function (o) { return o.id === obsId; });
    if (obs && obs.type === 'wind_turbine') {
      ensureProps(obs);
      syncDimensions(obs);
      injectUI(obs);
    } else {
      removeUI();
    }
    renderAll();
  };

  // ════════════════════════════════════════════════════════════════
  //  10. UI DE PROPIEDADES (inyección dinámica)
  // ════════════════════════════════════════════════════════════════

  function getSelectedWT() {
    var id = root.selectedObstacleId;
    if (!id) return null;
    var obs = (root.obstacles || []).find(function (o) { return o.id === id; });
    return (obs && obs.type === 'wind_turbine') ? obs : null;
  }

  function triggerRerender() {
    renderAll();
    if (typeof root.recalculateLayoutAndObstacles === 'function') {
      root.recalculateLayoutAndObstacles();
    } else if (typeof root.render3DObstaclesInCesium === 'function') {
      root.render3DObstaclesInCesium();
    }
    if (root.viewer && root.viewer.scene && typeof root.viewer.scene.requestRender === 'function') {
      root.viewer.scene.requestRender();
    }
  }

  function injectUI(obs) {
    removeUI();
    var editor = document.getElementById('obstacle-selected-editor');
    if (!editor) return;

    var c = document.createElement('div');
    c.id = 'wt-turbine-controls';
    c.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-top:8px;padding:8px 6px;' +
      'border-top:1px solid rgba(245,158,11,0.3);';

    var totalH = (obs.mastHeight + (obs.turbineType === 'hawt' ? obs.bladeRadius : 0)).toFixed(1);
    var rotorD = (obs.bladeRadius * 2).toFixed(1);

    c.innerHTML =
      '<span style="font-size: 10px;font-weight:700;color:var(--amber-400,#F59E0B);letter-spacing:0.8px;">' +
        '⚡ PARÁMETROS EÓLICOS</span>' +

      '<div style="display:flex;gap:4px;align-items:center;">' +
        '<span style="font-size: 10px;color:#94a3b8;width:60px;">TIPO:</span>' +
        '<select id="wt-type-select" class="cfg-select" style="flex:1;font-size: 10px;" ' +
          'onchange="RAWindTurbine.onTypeChange(this.value)">' +
          '<option value="hawt"' + (obs.turbineType === 'hawt' ? ' selected' : '') + '>HAWT (Eje Horizontal)</option>' +
          '<option value="vawt"' + (obs.turbineType === 'vawt' ? ' selected' : '') + '>VAWT (Eje Vertical)</option>' +
        '</select>' +
      '</div>' +

      '<div style="display:flex;gap:4px;align-items:center;">' +
        '<span style="font-size: 10px;color:#94a3b8;width:60px;">MÁSTIL:</span>' +
        '<input type="number" id="wt-mast-height" class="cfg-input" value="' + obs.mastHeight +
          '" min="2" max="50" step="0.5" style="flex:1;font-size:10px;" oninput="RAWindTurbine.onMastChange(this.value)">' +
        '<span style="font-size: 10px;color:#64748b;">m</span>' +
      '</div>' +

      (obs.turbineType === 'vawt' ?
        ('<div style="display:flex;gap:4px;align-items:center;">' +
          '<span style="font-size: 10px;color:#94a3b8;width:60px;">DIÁMETRO:</span>' +
          '<input type="number" id="wt-rotor-diameter" class="cfg-input" value="' + (obs.bladeRadius * 2).toFixed(2) +
            '" min="0.4" max="30" step="0.1" style="flex:1;font-size:10px;" oninput="RAWindTurbine.onRotorDiameterChange(this.value)">' +
          '<span style="font-size: 10px;color:#64748b;">m</span>' +
        '</div>' +
        '<div style="display:flex;gap:4px;align-items:center;">' +
          '<span style="font-size: 10px;color:#94a3b8;width:60px;">LARGO PALAS:</span>' +
          '<input type="number" id="wt-blade-length" class="cfg-input" value="' + (obs.bladeLength || 3.5).toFixed(2) +
            '" min="0.5" max="30" step="0.1" style="flex:1;font-size:10px;" oninput="RAWindTurbine.onBladeLengthChange(this.value)">' +
          '<span style="font-size: 10px;color:#64748b;">m</span>' +
        '</div>')
        :
        ('<div style="display:flex;gap:4px;align-items:center;">' +
          '<span style="font-size: 10px;color:#94a3b8;width:60px;">ASPAS:</span>' +
          '<input type="number" id="wt-blade-radius" class="cfg-input" value="' + obs.bladeRadius +
            '" min="0.3" max="25" step="0.25" style="flex:1;font-size:10px;" oninput="RAWindTurbine.onBladeChange(this.value)">' +
          '<span style="font-size: 10px;color:#64748b;">m radio</span>' +
        '</div>')
      ) +

      '<div style="font-size: 10px;color:#475569;line-height:1.3;margin-top:2px;">' +
        'Altura total: <b id="wt-total-height">' + totalH + '</b> m' +
        ' · Diám. rotor: <b id="wt-rotor-diam">' + rotorD + '</b> m' +
      '</div>';

    editor.appendChild(c);
  }

  function removeUI() {
    var existing = document.getElementById('wt-turbine-controls');
    if (existing) existing.remove();
  }

  // ════════════════════════════════════════════════════════════════
  //  11. HANDLERS DE CAMBIO DE PROPIEDADES
  // ════════════════════════════════════════════════════════════════

  function onTypeChange(value) {
    var obs = getSelectedWT();
    if (!obs) return;
    obs.turbineType = value;
    var defs = value === 'vawt' ? VAWT_DEFAULTS : HAWT_DEFAULTS;
    obs.mastHeight  = defs.mastHeight;
    obs.bladeRadius = defs.bladeRadius;
    syncDimensions(obs);
    invalidateAndRerender('Tipo de turbina eólica modificado');
  }

  function onMastChange(value) {
    var obs = getSelectedWT();
    if (!obs) return;
    obs.mastHeight = Math.max(1.5, parseFloat(value) || HAWT_DEFAULTS.mastHeight);
    syncDimensions(obs);
    invalidateAndRerender('Altura de mástil eólico modificada');
  }

  function onBladeChange(value) {
    var obs = getSelectedWT();
    if (!obs) return;
    obs.bladeRadius = Math.max(0.3, parseFloat(value) || HAWT_DEFAULTS.bladeRadius);
    syncDimensions(obs);
    invalidateAndRerender('Radio de aspas eólicas modificado');
  }

  function onRotorDiameterChange(value) {
    var obs = getSelectedWT();
    if (!obs) return;
    var d = Math.max(0.4, parseFloat(value) || 2.0);
    obs.bladeRadius = d / 2;
    syncDimensions(obs);
    invalidateAndRerender('Diámetro de rotor de turbina modificado');
  }

  function onBladeLengthChange(value) {
    var obs = getSelectedWT();
    if (!obs) return;
    var len = Math.max(0.5, parseFloat(value) || 3.5);
    obs.bladeLength = len;
    syncDimensions(obs);
    invalidateAndRerender('Largo de palas verticales modificado');
  }

  function toggleVisibility(idOrIdx) {
    var obsList = (typeof root !== 'undefined' && Array.isArray(root.obstacles)) ? root.obstacles : (typeof global !== 'undefined' && Array.isArray(global.obstacles) ? global.obstacles : []);
    var obs = (typeof idOrIdx === 'string')
      ? obsList.find(function(o) { return o.id === idOrIdx; })
      : obsList[idOrIdx];
    if (obs) {
      obs.visible = (obs.visible === false) ? true : false;
      if (obs.visible === false && ((typeof root !== 'undefined' && root.selectedObstacleId === obs.id) || (typeof global !== 'undefined' && global.selectedObstacleId === obs.id))) {
        if (typeof root !== 'undefined' && typeof root.selectObstacle === 'function') root.selectObstacle(null);
        else if (typeof global !== 'undefined' && typeof global.selectObstacle === 'function') global.selectObstacle(null);
        if (typeof root !== 'undefined') root.selectedObstacleId = null;
        if (typeof global !== 'undefined') global.selectedObstacleId = null;
      }
      renderAll();
    }
  }

  // ════════════════════════════════════════════════════════════════
  //  12. EXPORTACIÓN CANÓNICA
  // ════════════════════════════════════════════════════════════════

  root.RAWindTurbine = {
    renderAll:             renderAll,
    cleanAll:              cleanAll,
    cleanForObs:           cleanForObs,
    ensureProps:           ensureProps,
    syncDimensions:        syncDimensions,
    onGeneralDimInput:     onGeneralDimInput,
    onTypeChange:          onTypeChange,
    onMastChange:          onMastChange,
    onBladeChange:         onBladeChange,
    onRotorDiameterChange: onRotorDiameterChange,
    onBladeLengthChange:   onBladeLengthChange,
    updateLiveModelMatrix: updateLiveModelMatrix,
    toggleVisibility:      toggleVisibility
  };

})(window);
