/**
 * ═══════════════════════════════════════════════════════════════════════
 * wind-visualizer.js — Primitivas 3D CesiumJS para aerogeneradores,
 *                      Anillos de Seguridad / Isófonas Acústicas 3D
 *                      con Estilos Visuales (Neón, Pulso, Cúpula, CAD)
 * ═══════════════════════════════════════════════════════════════════════
 * Principios:
 *  - ZERO-RECREATION: durante MOUSE_MOVE solo se muta modelMatrix en GPU
 *  - BATCHING: cada aerogenerador = 1 Cesium.Primitive consolidada
 *  - OPCIÓN 4: Configuración interactiva de estilos visuales para los anillos:
 *      * Modos: 'neon' (Neón brillante), 'pulse' (Pulso oscilante),
 *               'dome' (Cúpula/Cilindro holográfico), 'cad' (Línea técnica)
 *      * Capas activables independientes: Caída libre, Isófona 45 dBA, Isófona 35 dBA
 *      * Brillo/Opacidad ajustable con slider
 * @version 2.2.0  2026-10-25
 */
(function (global) {
  'use strict';

  var RAWind = global.RAWind || (global.RAWind = {});

  var _primitivesByTurbineId = {};
  var _animationAngles = {};
  var _selectedId = null;

  // ── Configuración de Visualización de Anillos (Opción 4) ────────────
  var _visualConfig = {
    showRings: true,
    style: 'neon',         // 'neon' | 'pulse' | 'dome' | 'cad'
    showFallRadius: true,   // 1.1 x H_punta
    showIso45Day: true,     // 45 dBA Diurna
    showIso35Night: true,   // 35 dBA Nocturna
    showWakeCone: true,     // Cono de estela de Jensen (5D) + Vector de viento
    opacity: 0.65           // Factor de brillo/opacidad (0.1 a 1.0)
  };

  var _pulsePhase = 0.0;
  var _pulseAnimationRunning = false;

  var COLORS = {
    mast:     '#94A3B8',
    nacelle:  '#CBD5E1',
    blade:    '#E2E8F0',
    hub:      '#64748B',
    arm:      '#94A3B8',
    selected: '#F59E0B'
  };

  function _getViewer() {
    var v = global.viewer || (typeof viewer !== 'undefined' ? viewer : null);
    return (v && (!v.isDestroyed || !v.isDestroyed())) ? v : null;
  }

  function _requestSceneRender() {
    var v = _getViewer();
    if (v && v.scene && typeof v.scene.requestRender === 'function') {
      v.scene.requestRender();
    }
  }

  function _getCesium() {
    return global.Cesium || (typeof Cesium !== 'undefined' ? Cesium : null);
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

  function _computeRootModelMatrix(turbineInstance) {
    var Cesium = _getCesium();
    if (!Cesium || !turbineInstance) return null;
    var baseCenter = _toCartesian3(turbineInstance.positionCartographic);
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
    return Cesium.Matrix4.fromRotationTranslation(rotBaseMat3, baseCenter, new Cesium.Matrix4());
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
      } catch (e) { /* ignore */ }
    }
    if (entry.ringsPrimitive) {
      try {
        if (!entry.ringsPrimitive.isDestroyed()) {
          viewer.scene.primitives.remove(entry.ringsPrimitive);
        }
      } catch (e2) { /* ignore */ }
    }
    delete _primitivesByTurbineId[turbineId];
    delete _animationAngles[turbineId];
    _requestSceneRender();
  }

  /**
   * Helper: genera los vértices de un anillo circular en el plano X-Y local.
   */
  function _createCirclePositions(radiusM, segments, zOffset) {
    var Cesium = _getCesium();
    var pts = [];
    var count = segments || 64;
    var z = zOffset || 0.15;
    for (var i = 0; i <= count; i++) {
      var angle = (i / count) * Math.PI * 2;
      pts.push(new Cesium.Cartesian3(radiusM * Math.cos(angle), radiusM * Math.sin(angle), z));
    }
    return pts;
  }

  /**
   * Helper: añade a `ringInstances` las geometrías de un anillo según el estilo configurado.
   */
  function _appendRingGeometries(ringInstances, layerKey, radiusM, hexColor, zBase, turbineId, isSelected) {
    var Cesium = _getCesium();
    var VF = Cesium.PerInstanceColorAppearance.VERTEX_FORMAT;
    var style = _visualConfig.style || 'neon';
    var userAlpha = Math.max(0.1, Math.min(1.0, _visualConfig.opacity));

    // Ajuste de brillo según selección o modo pulso
    var pulseMod = 1.0;
    if (style === 'pulse') {
      pulseMod = 0.55 + 0.45 * Math.sin(_pulsePhase);
    }
    var baseAlpha = userAlpha * pulseMod * (isSelected ? 1.25 : 1.0);

    var cBorder = Cesium.Color.fromCssColorString(hexColor).withAlpha(Math.min(1.0, baseAlpha * 0.95));
    var cFill = Cesium.Color.fromCssColorString(hexColor).withAlpha(Math.min(0.85, baseAlpha * (style === 'cad' ? 0.05 : 0.22)));

    // 1. DISCO BASE DE SUELO (Transparencia con relleno)
    if (style !== 'cad') {
      var diskH = (style === 'dome') ? Math.min(4.5, radiusM * 0.18) : 0.10;
      var diskGeom = new Cesium.CylinderGeometry({
        length: diskH,
        topRadius: radiusM,
        bottomRadius: radiusM,
        slices: 50,
        vertexFormat: VF
      });
      ringInstances.push(new Cesium.GeometryInstance({
        id: 'wt_' + layerKey + '_disk_' + turbineId,
        geometry: diskGeom,
        modelMatrix: Cesium.Matrix4.fromTranslation(new Cesium.Cartesian3(0, 0, zBase + diskH / 2), new Cesium.Matrix4()),
        attributes: {
          color: Cesium.ColorGeometryInstanceAttribute.fromColor(cFill)
        }
      }));
    }

    // 2. BORDE PERIMETRAL DE NEÓN / ALTA DEFINICIÓN (Toroide o banda tubular perimetral)
    var rimWidth = (style === 'neon' || style === 'pulse') ? Math.max(0.25, radiusM * 0.02) : (radiusM * 0.008);
    var innerR = Math.max(0.1, radiusM - rimWidth);
    var outerR = radiusM + rimWidth;

    // Modelado como anillo perimetral elevado de gran contraste
    var rimGeom = new Cesium.CylinderGeometry({
      length: 0.18,
      topRadius: outerR,
      bottomRadius: outerR,
      slices: 60,
      vertexFormat: VF
    });
    ringInstances.push(new Cesium.GeometryInstance({
      id: 'wt_' + layerKey + '_rim_' + turbineId,
      geometry: rimGeom,
      modelMatrix: Cesium.Matrix4.fromTranslation(new Cesium.Cartesian3(0, 0, zBase + 0.10), new Cesium.Matrix4()),
      attributes: {
        color: Cesium.ColorGeometryInstanceAttribute.fromColor(cBorder)
      }
    }));
  }

  /**
   * Construye la primitiva consolidada de anillos 3D según la configuración visual (Opción 4).
   */
  function _buildOverlayRingsPrimitive(turbineInstance, rootModelMatrix, isSelected) {
    if (!_visualConfig.showRings) return null;
    var Cesium = _getCesium();
    var viewer = _getViewer();
    if (!Cesium || !viewer || !turbineInstance) return null;
    if (turbineInstance.operationalState && turbineInstance.operationalState.enabled === false) return null;

    var ringInstances = [];

    // 1. Radio de seguridad mecánica por caída libre (1.1 x H_punta) — Azul Cyan Neón
    if (_visualConfig.showFallRadius) {
      var fallRadiusM = (RAWind.Entity && typeof RAWind.Entity.getFallRadius === 'function')
        ? RAWind.Entity.getFallRadius(turbineInstance)
        : 22.0;
      _appendRingGeometries(ringInstances, 'fall', fallRadiusM, '#00E5FF', 0.12, turbineInstance.id, isSelected);
    }

    // Datos acústicos
    var audit = turbineInstance._acousticAudit;
    if (!audit && RAWind.Acoustics && typeof RAWind.Acoustics.findIsophoneRadiusM === 'function') {
      var lwa = (turbineInstance._catalog && turbineInstance._catalog.acousticPowerLwaDba) || 100;
      var hubH = (turbineInstance.supportStructure && turbineInstance.supportStructure.hubHeightM) || 18;
      audit = {
        radiusDay45M: RAWind.Acoustics.findIsophoneRadiusM(lwa, 45, hubH),
        radiusNight35M: RAWind.Acoustics.findIsophoneRadiusM(lwa, 35, hubH)
      };
    }

    // 2. Isófona Diurna 45 dBA (RD 1367/2007) — Ámbar Fuego
    if (_visualConfig.showIso45Day && audit && audit.radiusDay45M > 2 && audit.radiusDay45M < 400) {
      _appendRingGeometries(ringInstances, 'iso45', audit.radiusDay45M, '#FF9100', 0.08, turbineInstance.id, isSelected);
    }

    // 3. Isófona Nocturna 35 dBA (RD 1367/2007) — Violeta / Rosa Silencioso
    if (_visualConfig.showIso35Night && audit && audit.radiusNight35M > 2 && audit.radiusNight35M < 600) {
      _appendRingGeometries(ringInstances, 'iso35', audit.radiusNight35M, '#F43F5E', 0.04, turbineInstance.id, isSelected);
    }

    // 4. Cono de Estela de Jensen (5D aguas abajo) + Vector de Viento Predominante
    if (_visualConfig.showWakeCone) {
      var VF = Cesium.PerInstanceColorAppearance.VERTEX_FORMAT;
      var rCfg = (RAWind.Resource && typeof RAWind.Resource.getConfig === 'function')
        ? RAWind.Resource.getConfig()
        : { prevailingWindDirDeg: 270, roughnessLengthM: 0.10 };
      var windDirRad = ((Number(rCfg.prevailingWindDirDeg) || 270) * Math.PI) / 180.0;
      var yawRad = turbineInstance.orientationRad || 0;
      // En el sistema local de la turbina (+Y apunta hacia orientationRad):
      // El ángulo relativo desde donde viene el viento respecto al eje +Y local es deltaRad = windDirRad - yawRad
      var deltaRad = windDirRad - yawRad;
      var upX = Math.sin(deltaRad);
      var upY = Math.cos(deltaRad);
      // Aguas abajo (hacia donde viaja la estela):
      var downX = -upX;
      var downY = -upY;

      var mastH = Math.max(2.0, (turbineInstance.supportStructure ? turbineInstance.supportStructure.hubHeightM : 18));
      var rotorD = Math.max(2.0, (turbineInstance._catalog && turbineInstance._catalog.rotorDiameterM) ? turbineInstance._catalog.rotorDiameterM : 5.0);
      var r0 = rotorD / 2.0;
      var z0 = Math.max(0.01, Number(rCfg.roughnessLengthM) || 0.10);
      var kWake = Math.max(0.05, Math.min(0.12, 0.5 / Math.log(Math.max(2.5, mastH / z0))));
      var wakeLen = Math.max(18.0, 5.0 * rotorD); // 5D aguas abajo
      var rWakeEnd = r0 + kWake * wakeLen;

      // Matriz de rotación para alinear el eje Z del CylinderGeometry con el vector aguas abajo (downX, downY, 0)
      var zAxisWake = new Cesium.Cartesian3(downX, downY, 0);
      var xAxisWake = new Cesium.Cartesian3(-downY, downX, 0);
      var yAxisWake = new Cesium.Cartesian3(0, 0, 1);
      var rotWakeMat3 = new Cesium.Matrix3(
        xAxisWake.x, yAxisWake.x, zAxisWake.x,
        xAxisWake.y, yAxisWake.y, zAxisWake.y,
        xAxisWake.z, yAxisWake.z, zAxisWake.z
      );

      var wakeCenter = new Cesium.Cartesian3(
        downX * (wakeLen * 0.5 + 0.6),
        downY * (wakeLen * 0.5 + 0.6),
        mastH
      );
      var wakeAlpha = Math.min(0.45, Math.max(0.12, (_visualConfig.opacity || 0.65) * 0.32));
      var wakeColor = Cesium.Color.fromCssColorString('#38BDF8').withAlpha(wakeAlpha);

      var wakeGeom = new Cesium.CylinderGeometry({
        length: wakeLen,
        topRadius: rWakeEnd,
        bottomRadius: r0,
        slices: 28,
        vertexFormat: VF
      });
      ringInstances.push(new Cesium.GeometryInstance({
        id: 'wt_wake_cone_' + turbineInstance.id,
        geometry: wakeGeom,
        modelMatrix: Cesium.Matrix4.fromRotationTranslation(rotWakeMat3, wakeCenter, new Cesium.Matrix4()),
        attributes: {
          color: Cesium.ColorGeometryInstanceAttribute.fromColor(wakeColor)
        }
      }));

      // Vector de viento entrante (aguas arriba del rotor, color verde esmeralda / cian brillante)
      var arrowLen = Math.max(4.5, rotorD * 1.15);
      var shaftLen = arrowLen * 0.72;
      var headLen = arrowLen * 0.28;
      var arrowColor = Cesium.Color.fromCssColorString('#10B981').withAlpha(Math.min(0.95, (_visualConfig.opacity || 0.65) * 1.15));

      var shaftCenter = new Cesium.Cartesian3(
        upX * (r0 + headLen + shaftLen * 0.5 + 0.8),
        upY * (r0 + headLen + shaftLen * 0.5 + 0.8),
        mastH
      );
      var headCenter = new Cesium.Cartesian3(
        upX * (r0 + headLen * 0.5 + 0.8),
        upY * (r0 + headLen * 0.5 + 0.8),
        mastH
      );

      var shaftGeom = new Cesium.CylinderGeometry({
        length: shaftLen,
        topRadius: 0.14,
        bottomRadius: 0.14,
        slices: 12,
        vertexFormat: VF
      });
      var headGeom = new Cesium.CylinderGeometry({
        length: headLen,
        topRadius: 0.02,
        bottomRadius: 0.42,
        slices: 14,
        vertexFormat: VF
      });

      ringInstances.push(new Cesium.GeometryInstance({
        id: 'wt_wind_shaft_' + turbineInstance.id,
        geometry: shaftGeom,
        modelMatrix: Cesium.Matrix4.fromRotationTranslation(rotWakeMat3, shaftCenter, new Cesium.Matrix4()),
        attributes: {
          color: Cesium.ColorGeometryInstanceAttribute.fromColor(arrowColor)
        }
      }));
      ringInstances.push(new Cesium.GeometryInstance({
        id: 'wt_wind_head_' + turbineInstance.id,
        geometry: headGeom,
        modelMatrix: Cesium.Matrix4.fromRotationTranslation(rotWakeMat3, headCenter, new Cesium.Matrix4()),
        attributes: {
          color: Cesium.ColorGeometryInstanceAttribute.fromColor(arrowColor)
        }
      }));
    }

    if (ringInstances.length === 0) return null;

    try {
      var rPrim = viewer.scene.primitives.add(new Cesium.Primitive({
        geometryInstances: ringInstances,
        modelMatrix: rootModelMatrix,
        appearance: new Cesium.PerInstanceColorAppearance({ translucent: true, closed: true }),
        asynchronous: false
      }));
      rPrim._windTurbineId = turbineInstance.id;
      return rPrim;
    } catch (e) {
      return null;
    }
  }

  function _buildTurbinePrimitive(turbineInstance, isSelected) {
    var Cesium = _getCesium();
    var viewer = _getViewer();
    if (!Cesium || !viewer || !turbineInstance) return null;

    var rootModelMatrix = _computeRootModelMatrix(turbineInstance);
    if (!rootModelMatrix) return null;

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
      prim._windTurbineId = turbineInstance.id;
      var ringsPrim = _buildOverlayRingsPrimitive(turbineInstance, rootModelMatrix, isSelected);
      return { primitive: prim, ringsPrimitive: ringsPrim };
    } catch (errPrim) {
      return null;
    }
  }

  function updateLiveModelMatrix(turbineInstance) {
    if (!turbineInstance || !turbineInstance.id) return false;
    var entry = _primitivesByTurbineId[turbineInstance.id];
    if (!entry || !entry.primitive || entry.primitive.isDestroyed()) return false;
    var newMat4 = _computeRootModelMatrix(turbineInstance);
    if (!newMat4) return false;
    entry.primitive.modelMatrix = newMat4;
    if (entry.ringsPrimitive && !entry.ringsPrimitive.isDestroyed()) {
      entry.ringsPrimitive.modelMatrix = newMat4;
    }
    _requestSceneRender();
    return true;
  }

  function renderTurbine(turbineInstance, selected) {
    if (!turbineInstance || !turbineInstance.id) return;
    _removePrimitives(turbineInstance.id);
    var built = _buildTurbinePrimitive(turbineInstance, !!selected);
    if (built && built.primitive) {
      _primitivesByTurbineId[turbineInstance.id] = {
        primitive: built.primitive,
        ringsPrimitive: built.ringsPrimitive || null,
        turbineId: turbineInstance.id
      };
    }
    _requestSceneRender();
  }

  function renderAll() {
    var viewer = _getViewer();
    if (!viewer) return;
    (global.windTurbines || []).forEach(function (t) {
      _removePrimitives(t.id);
      renderTurbine(t, t.id === _selectedId);
    });
    _requestSceneRender();
  }

  function clearAll() {
    Object.keys(_primitivesByTurbineId).forEach(function (id) {
      _removePrimitives(id);
    });
    _requestSceneRender();
  }

  function toggleOverlayRings(visible) {
    _visualConfig.showRings = (visible === undefined) ? !_visualConfig.showRings : !!visible;
    renderAll();
    return _visualConfig.showRings;
  }

  function isShowingOverlayRings() {
    return _visualConfig.showRings;
  }

  function getVisualConfig() {
    return _visualConfig;
  }

  function updateVisualConfig(patch) {
    if (patch && typeof patch === 'object') {
      Object.keys(patch).forEach(function (k) {
        if (_visualConfig[k] !== undefined) {
          _visualConfig[k] = patch[k];
        }
      });
    }
    if (_visualConfig.style === 'pulse' && !_pulseAnimationRunning) {
      _startPulseLoop();
    }
    renderAll();
    return _visualConfig;
  }

  function _startPulseLoop() {
    if (_pulseAnimationRunning) return;
    _pulseAnimationRunning = true;

    function loop() {
      if (_visualConfig.style !== 'pulse' || !_visualConfig.showRings) {
        _pulseAnimationRunning = false;
        return;
      }
      _pulsePhase += 0.08;
      if (_pulsePhase > Math.PI * 2) _pulsePhase -= Math.PI * 2;

      // Optimización Zero-Recreation AAA:
      // En lugar de llamar a renderAll() y destruir/recrear primitivas WebGL,
      // solo actualizamos la opacidad en las primitivas de anillos ya existentes
      // o pedimos un fotograma de renderizado limpio a Cesium.
      var alphaMod = 0.5 + 0.5 * Math.sin(_pulsePhase);
      var Cesium = _getCesium();

      if (Cesium) {
        Object.keys(_primitivesByTurbineId).forEach(function (tid) {
          var entry = _primitivesByTurbineId[tid];
          if (entry && entry.ringsPrimitive && !entry.ringsPrimitive.isDestroyed()) {
            try {
              // Ajustar la apariencia si dispone de material o color dinámico
              var app = entry.ringsPrimitive.appearance;
              if (app && app.material && app.material.uniforms) {
                app.material.uniforms.color.alpha = (_visualConfig.opacity || 0.65) * alphaMod;
              }
            } catch (eApp) {}
          }
        });
      }

      _requestSceneRender();

      setTimeout(function () {
        if (typeof requestAnimationFrame !== 'undefined') {
          requestAnimationFrame(loop);
        } else {
          loop();
        }
      }, 80);
    }
    loop();
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
    _requestSceneRender();
  }

  function getSelectedId() {
    return _selectedId;
  }

  function onTurbinesChanged(eventType, data) {
    if (eventType === 'wind_turbine_added') {
      renderTurbine(data, data.id === _selectedId);
    } else if (eventType === 'wind_turbine_removed') {
      _removePrimitives(data.id);
    } else if (eventType === 'wind_turbine_modified') {
      _removePrimitives(data.id);
      renderTurbine(data, data.id === _selectedId);
    }
    _requestSceneRender();
  }

  var RAWindVisualizer = {
    renderTurbine: renderTurbine,
    renderAll: renderAll,
    clearAll: clearAll,
    removeTurbine: _removePrimitives,
    selectTurbine: selectTurbine,
    getSelectedId: getSelectedId,
    updateLiveModelMatrix: updateLiveModelMatrix,
    toggleOverlayRings: toggleOverlayRings,
    isShowingOverlayRings: isShowingOverlayRings,
    getVisualConfig: getVisualConfig,
    updateVisualConfig: updateVisualConfig,
    onTurbinesChanged: onTurbinesChanged
  };

  global.RAWindVisualizer = RAWindVisualizer;
  RAWind.Visualizer = RAWindVisualizer;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = RAWindVisualizer;
  }

})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : global));
