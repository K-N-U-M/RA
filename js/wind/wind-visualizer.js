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
  var _instanceGen = 0;

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

    // Marco de referencia local canónico geodésico ENU (Este = +X, Norte = +Y, Arriba = +Z)
    var enuFrame = Cesium.Transforms.eastNorthUpToFixedFrame(baseCenter);
    var enuRot = Cesium.Matrix4.getMatrix3(enuFrame, new Cesium.Matrix3());
    var eastVec = Cesium.Matrix3.getColumn(enuRot, 0, new Cesium.Cartesian3());
    var northVec = Cesium.Matrix3.getColumn(enuRot, 1, new Cesium.Cartesian3());
    var upVec = Cesium.Matrix3.getColumn(enuRot, 2, new Cesium.Cartesian3());

    // Orientación náutica (azimut): 0° = Norte, 90° = Este.
    // Local +Y apunta hacia donde mira el buje: sin(yaw)*East + cos(yaw)*North.
    // Local +X apunta a estribor / 90° a la derecha de +Y: cos(yaw)*East - sin(yaw)*North.
    var yawRad = turbineInstance.orientationRad || 0;
    var sYaw = Math.sin(yawRad), cYaw = Math.cos(yawRad);

    var localY = new Cesium.Cartesian3();
    var tmp = new Cesium.Cartesian3();
    Cesium.Cartesian3.multiplyByScalar(eastVec, sYaw, localY);
    Cesium.Cartesian3.multiplyByScalar(northVec, cYaw, tmp);
    Cesium.Cartesian3.add(localY, tmp, localY);

    var localX = new Cesium.Cartesian3();
    Cesium.Cartesian3.multiplyByScalar(eastVec, cYaw, localX);
    Cesium.Cartesian3.multiplyByScalar(northVec, -sYaw, tmp);
    Cesium.Cartesian3.add(localX, tmp, localX);

    var rotBaseMat3 = new Cesium.Matrix3(
      localX.x, localY.x, upVec.x,
      localX.y, localY.y, upVec.y,
      localX.z, localY.z, upVec.z
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
   * Helper: añade a `ringInstances` las geometrías de un anillo según el estilo configurado.
   */
  function _appendRingGeometries(ringInstances, layerKey, radiusM, hexColor, zBase, turbineId, isSelected, optGenId) {
    var Cesium = _getCesium();
    var VF = Cesium.PerInstanceColorAppearance.VERTEX_FORMAT;
    var style = _visualConfig.style || 'neon';
    var userAlpha = Math.max(0.1, Math.min(1.0, _visualConfig.opacity));
    var suffix = (optGenId || '') + '_' + turbineId;

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
        id: 'wt_' + layerKey + '_disk_' + suffix,
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
      id: 'wt_' + layerKey + '_rim_' + suffix,
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

    _instanceGen++;
    var genId = '_' + _instanceGen;
    var ringInstances = [];

    // 1. Radio de seguridad mecánica por caída libre (1.1 x H_punta) — Azul Cyan Neón
    if (_visualConfig.showFallRadius) {
      var fallRadiusM = (RAWind.Entity && typeof RAWind.Entity.getFallRadius === 'function')
        ? RAWind.Entity.getFallRadius(turbineInstance)
        : 22.0;
      _appendRingGeometries(ringInstances, 'fall', fallRadiusM, '#00E5FF', 0.12, turbineInstance.id, isSelected, genId);
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
      _appendRingGeometries(ringInstances, 'iso45', audit.radiusDay45M, '#FF9100', 0.08, turbineInstance.id, isSelected, genId);
    }

    // 3. Isófona Nocturna 35 dBA (RD 1367/2007) — Violeta / Rosa Silencioso
    if (_visualConfig.showIso35Night && audit && audit.radiusNight35M > 2 && audit.radiusNight35M < 600) {
      _appendRingGeometries(ringInstances, 'iso35', audit.radiusNight35M, '#F43F5E', 0.04, turbineInstance.id, isSelected, genId);
    }

    // 4. Cono de Estela de Jensen (5D aguas abajo) + Vector de Viento Predominante
    if (_visualConfig.showWakeCone) {
      var VF = Cesium.PerInstanceColorAppearance.VERTEX_FORMAT;
      var rCfg = (RAWind.Resource && typeof RAWind.Resource.getConfig === 'function')
        ? RAWind.Resource.getConfig()
        : { prevailingWindDirDeg: 270, roughnessLengthM: 0.10 };
      var windDirRad = ((Number(rCfg.prevailingWindDirDeg) || 270) * Math.PI) / 180.0;
      var yawRad = turbineInstance.orientationRad || 0;
            // En el sistema local de la turbina orientada por yaw (donde +Y local es la dirección del rotor):
      // Si la turbina mira a yawRad y el viento viene desde windDirRad:
      // El ángulo relativo desde donde viene el viento es deltaRad = windDirRad - yawRad.
      // Cuando la turbina está alineada con el viento (yawRad === windDirRad), el viento viene de frente (+Y)
      // y la estela turbulenta viaja aguas abajo hacia la cola (-Y).
      var deltaRad = windDirRad - yawRad;
      var downX = -Math.sin(deltaRad);
      var downY = -Math.cos(deltaRad);
      var upX = -downX;
      var upY = -downY;

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
      // Evaluar interferencia de obstáculos 3D circundantes (árboles, chimeneas, edificios)
      var obsInterf = (RAWind.ObstacleInterference && typeof RAWind.ObstacleInterference.evaluateTurbineObstacleInterference === 'function')
        ? RAWind.ObstacleInterference.evaluateTurbineObstacleInterference(turbineInstance, Number(rCfg.prevailingWindDirDeg) || 270)
        : null;

      var wakeAlpha = Math.min(0.55, Math.max(0.15, (_visualConfig.opacity || 0.65) * 0.38));
      var wakeHex = '#38BDF8'; // Azul cian estándar
      if (obsInterf && obsInterf.hasSevereInterference) {
        wakeHex = '#EF4444'; // Rojo alarma: atrapado en sombra severa de obstáculo
      } else if (obsInterf && obsInterf.hasModerateInterference) {
        wakeHex = '#F59E0B'; // Ámbar advertencia: estela turbulenta de árbol/obstáculo
      }
      var wakeColor = Cesium.Color.fromCssColorString(wakeHex).withAlpha(wakeAlpha);

      var wakeGeom = new Cesium.CylinderGeometry({
        length: wakeLen,
        topRadius: rWakeEnd,
        bottomRadius: r0,
        slices: 28,
        vertexFormat: VF
      });
      ringInstances.push(new Cesium.GeometryInstance({
        id: 'wt_wake_cone_' + turbineInstance.id + genId,
        geometry: wakeGeom,
        modelMatrix: Cesium.Matrix4.fromRotationTranslation(rotWakeMat3, wakeCenter, new Cesium.Matrix4()),
        attributes: {
          color: Cesium.ColorGeometryInstanceAttribute.fromColor(wakeColor)
        }
      }));

      // 4.1. Silueta 2D de Sombra de Obstáculos proyectada en el plano base (Cero sobrecoste GPU)
      if (obsInterf && obsInterf.affectedObstacles && obsInterf.affectedObstacles.length > 0) {
        obsInterf.affectedObstacles.forEach(function (aff, aIdx) {
          var dist = Math.max(3.0, aff.distanceM || 15.0);
          var shadowWidth = Math.max(2.5, (aff.obstacle ? (aff.obstacle.w || 3.0) : 3.0) * 1.4);
          var shadowLen = Math.min(dist + 6.0, 60.0);

          // Caja aplanada en el plano base simulando la alfombra de sombra turbulenta
          var shadowBoxGeom = Cesium.BoxGeometry.fromDimensions({
            dimensions: new Cesium.Cartesian3(shadowWidth, shadowLen, 0.08),
            vertexFormat: VF
          });

          var shadowColorHex = aff.deficitPct >= 20 ? '#EF4444' : '#F59E0B';
          var shadowColor = Cesium.Color.fromCssColorString(shadowColorHex).withAlpha(0.28);

          // Posicionada aguas arriba entre el obstáculo y la turbina
          var shadowCenter = new Cesium.Cartesian3(
            upX * (shadowLen * 0.45),
            upY * (shadowLen * 0.45),
            0.05
          );

          var zAxisSha = new Cesium.Cartesian3(0, 0, 1);
          var yAxisSha = new Cesium.Cartesian3(upX, upY, 0);
          var xAxisSha = new Cesium.Cartesian3(-upY, upX, 0);
          var rotShaMat3 = new Cesium.Matrix3(
            xAxisSha.x, yAxisSha.x, zAxisSha.x,
            xAxisSha.y, yAxisSha.y, zAxisSha.y,
            xAxisSha.z, yAxisSha.z, zAxisSha.z
          );

          ringInstances.push(new Cesium.GeometryInstance({
            id: 'wt_obs_shadow_' + turbineInstance.id + '_' + aIdx + genId,
            geometry: shadowBoxGeom,
            modelMatrix: Cesium.Matrix4.fromRotationTranslation(rotShaMat3, shadowCenter, new Cesium.Matrix4()),
            attributes: {
              color: Cesium.ColorGeometryInstanceAttribute.fromColor(shadowColor)
            }
          }));
        });
      }

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
        id: 'wt_wind_shaft_' + turbineInstance.id + genId,
        geometry: shaftGeom,
        modelMatrix: Cesium.Matrix4.fromRotationTranslation(rotWakeMat3, shaftCenter, new Cesium.Matrix4()),
        attributes: {
          color: Cesium.ColorGeometryInstanceAttribute.fromColor(arrowColor)
        }
      }));
      ringInstances.push(new Cesium.GeometryInstance({
        id: 'wt_wind_head_' + turbineInstance.id + genId,
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
        allowPicking: false,
        asynchronous: false
      }));
      rPrim._isOverlayRing = true;
      return rPrim;
    } catch (e) {
      return null;
    }
  }

  function buildTurbineGeometryInstances(opts) {
    var Cesium = (opts && opts.Cesium) || _getCesium();
    if (!Cesium || !opts) return [];

    var type = (opts.type === 'vawt') ? 'vawt' : 'hawt';
    var mastH = Number(opts.mastH) || 8;
    var bladeR = Number(opts.bladeR) || 2.5;
    var vBladeLength = Number(opts.vBladeLength) || (bladeR * 2 * 1.4);
    var elev = Number(opts.elev) || 0;
    var id = opts.id || 'wt';
    var isSelected = !!opts.isSelected;
    var palette = opts.colors || COLORS;
    var vPrefix = opts.vawtPrefix || '';

    function col(typeKey) {
      var raw = isSelected ? palette.selected : (palette[typeKey] || palette.nacelle || '#CBD5E1');
      return (typeof raw === 'string') ? Cesium.Color.fromCssColorString(raw) : raw;
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
      // Palas verticales y brazos sincronizados con medidas de catálogo
      var vBladeH   = Math.max(0.5, vBladeLength);
      var vBladeMid = Math.max(vBladeH / 2 + 0.3, mastH);
      var armTopH   = vBladeMid + vBladeH / 2;
      var armBotH   = Math.max(0.2, vBladeMid - vBladeH / 2);

      // Mástil: asciende y termina exactamente en armTopH (al ras del eje superior de palas)
      var totalMastH = armTopH;
      // Mástil cónico proporcional: base nominal 50cm (r=0.25m), coronación 25cm (r=0.125m)
      var vMastScale = Math.max(0.6, Math.min(2.5, Math.sqrt(totalMastH / 12.0)));
      var vMastBotR  = Math.max(0.18, 0.25 * vMastScale);
      var vMastTopR  = Math.max(0.09, 0.125 * vMastScale);
      var vMastGeom  = new Cesium.CylinderGeometry({
        length: totalMastH,
        topRadius: vMastTopR,
        bottomRadius: vMastBotR,
        slices: 16,
        vertexFormat: VF
      });
      addInstance(vMastGeom, col('mast'), new Cesium.Cartesian3(0, 0, elev + totalMastH / 2), null, 'wt_' + vPrefix + 'mast_' + id);
      var vBladeThick = Math.max(0.03, bladeR * 0.035);
      var vBladeChord = Math.max(0.12, bladeR * 0.12);
      var vBladeDims = opts.vawtRadialThickness
        ? new Cesium.Cartesian3(vBladeThick, vBladeChord, vBladeH)
        : new Cesium.Cartesian3(vBladeChord, vBladeThick, vBladeH);

      for (var vb = 0; vb < 3; vb++) {
        var vAngle = vb * (2 * Math.PI / 3);
        var vCos = Math.cos(vAngle);
        var vSin = Math.sin(vAngle);
        var vDx = bladeR * vCos;
        var vDy = bladeR * vSin;

        var vBladeGeom = Cesium.BoxGeometry.fromDimensions({
          vertexFormat: VF,
          dimensions: vBladeDims
        });
        var vBladeRot = new Cesium.Matrix3(
          vCos, -vSin, 0,
          vSin,  vCos, 0,
          0,     0,    1
        );
        addInstance(vBladeGeom, col('blade'), new Cesium.Cartesian3(vDx, vDy, elev + vBladeMid), vBladeRot, 'wt_' + vPrefix + 'bl' + vb + '_' + id);

        var vHeights = [armTopH, armBotH];
        var armThick = Math.max(0.03, vBladeThick);
        for (var ai = 0; ai < 2; ai++) {
          var armGeom = Cesium.BoxGeometry.fromDimensions({
            vertexFormat: VF,
            dimensions: new Cesium.Cartesian3(bladeR, armThick, armThick)
          });
          addInstance(armGeom, col('arm'), new Cesium.Cartesian3((bladeR / 2) * vCos, (bladeR / 2) * vSin, elev + vHeights[ai]), vBladeRot, 'wt_' + vPrefix + 'ar' + ai + '_' + vb + '_' + id);
        }
      }
    } else {
      // HAWT
      // Mástil cónico proporcional: base nominal 50cm (r=0.25m), coronación 25cm (r=0.125m)
      var mastScale = Math.max(0.6, Math.min(2.5, Math.sqrt(mastH / 12.0)));
      var mastBotR  = Math.max(0.18, 0.25 * mastScale);
      var mastTopR  = Math.max(0.09, 0.125 * mastScale);
      var mastGeom  = new Cesium.CylinderGeometry({
        length: mastH,
        topRadius: mastTopR,
        bottomRadius: mastBotR,
        slices: 16,
        vertexFormat: VF
      });
      addInstance(mastGeom, col('mast'), new Cesium.Cartesian3(0, 0, elev + mastH / 2), null, 'wt_mast_' + id);

      var rotorScale = Math.max(0.35, Math.min(3.5, bladeR / 2.5));
      var nacelleW = 0.5 * rotorScale;
      var nacelleL = 1.2 * rotorScale;
      var nacelleH = 0.5 * rotorScale;
      var nacelleGeom = Cesium.BoxGeometry.fromDimensions({
        vertexFormat: VF,
        dimensions: new Cesium.Cartesian3(nacelleW, nacelleL, nacelleH)
      });
      var nacelleCenterY = nacelleL * 0.25;
      addInstance(nacelleGeom, col('nacelle'), new Cesium.Cartesian3(0, nacelleCenterY, elev + mastH), null, 'wt_nac_' + id);

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
      var hubZ = elev + mastH;
      addInstance(hubGeom, col('hub'), new Cesium.Cartesian3(0, hubY, hubZ), hubRot, 'wt_hub_' + id);

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
        addInstance(bladeGeom, col('blade'), new Cesium.Cartesian3(bladeCenterX, hubY, bladeCenterZ), bRot, 'wt_bl' + b + '_' + id);
      }
    }

    return instances;
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
    var rotorD = (typeof turbineInstance.rotorDiameterM === 'number' && turbineInstance.rotorDiameterM > 0)
      ? turbineInstance.rotorDiameterM
      : (catalog.rotorDiameterM || 6.0);
    var bladeR = Math.max(0.2, rotorD / 2);
    var vBladeLength = (typeof turbineInstance.bladeHeightM === 'number' && turbineInstance.bladeHeightM > 0)
      ? turbineInstance.bladeHeightM
      : ((typeof turbineInstance.bladeLength === 'number' && turbineInstance.bladeLength > 0)
        ? turbineInstance.bladeLength
        : ((typeof catalog.bladeHeightM === 'number' && catalog.bladeHeightM > 0)
          ? catalog.bladeHeightM
          : ((typeof catalog.bladeLength === 'number' && catalog.bladeLength > 0) ? catalog.bladeLength : (bladeR * 2 * 1.4))));

    var instances = buildTurbineGeometryInstances({
      Cesium: Cesium,
      id: turbineInstance.id,
      type: type,
      mastH: mastH,
      bladeR: bladeR,
      vBladeLength: vBladeLength,
      elev: 0,
      isSelected: isSelected,
      colors: COLORS
    });

    try {
      var prim = viewer.scene.primitives.add(new Cesium.Primitive({
        geometryInstances: instances,
        modelMatrix: rootModelMatrix,
        appearance: new Cesium.PerInstanceColorAppearance({ translucent: false, closed: true }),
        shadows: Cesium.ShadowMode ? Cesium.ShadowMode.ENABLED : undefined,
        asynchronous: false
      }));
      prim._windTurbineId = turbineInstance.id;
      var ringsPrim = null;
      try {
        ringsPrim = _buildOverlayRingsPrimitive(turbineInstance, rootModelMatrix, isSelected);
      } catch (errRings) {
        console.error('[RAWindVisualizer] Fallo construyendo anillos/estela:', errRings);
      }
      return { primitive: prim, ringsPrimitive: ringsPrim };
    } catch (errPrim) {
      console.error('[RAWindVisualizer] Fallo construyendo turbina:', errPrim);
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

    // Reconstruir en caliente las primitivas de anillos, cono de estela y sombra de suelo para reactividad continua
    var viewer = _getViewer();
    if (viewer && viewer.scene && viewer.scene.primitives) {
      if (entry.ringsPrimitive && !entry.ringsPrimitive.isDestroyed()) {
        try { viewer.scene.primitives.remove(entry.ringsPrimitive); } catch (eR) {}
      }
      var isSel = (turbineInstance.id === _selectedId);
      try {
        entry.ringsPrimitive = _buildOverlayRingsPrimitive(turbineInstance, newMat4, isSel);
      } catch (errLive) {
        entry.ringsPrimitive = null;
        console.error('[RAWindVisualizer] Fallo actualizando anillos en vivo:', errLive);
      }
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
    _pulseAnimationRunning = false;
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
    buildTurbineGeometryInstances: buildTurbineGeometryInstances,
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
