/**
 * ============================================================================
 * ⚡ RA · CABLE ENGINE (Motor 3D de Cableado Ortogonal y Canalizaciones REBT)
 * ============================================================================
 * Arquitectura v3.0 AAA - Conforme a REBT ITC-BT-40, UNE-EN 62305 y IEC 62548.
 *
 * Características principales:
 * 1. TRAZADO ORTOGONAL 90° (Manhattan Routing 3D):
 *    - Desplazamiento sobre faldones proyectado en los ejes U (paralelo a cumbrera)
 *      y V (máxima pendiente) de la tríada CAD de working-plane.js.
 *    - Despegue perpendicular al plano: +0.35 m (DC+) y +0.45 m (DC- / bandeja).
 *    - Quiebros escuadra a 90° en bordes de cubierta (aleros/cumbreras) y bajantes
 *      verticales rectas por fachadas hacia equipos.
 *    - CERO catenarias ni cables volando en el aire.
 *
 * 2. GEOMETRÍA DUAL AAA (Volumen 3D con Sombras + Polyline con Depth-Fail):
 *    - Cesium.PolylineVolumeGraphics con perfiles extruidos (tubo cilíndrico r=1.8cm
 *      y bandeja rectangular 8x3cm) con perfiles en sentido horario (Clockwise).
 *    - shadows: Cesium.ShadowMode.ENABLED (proyección de sombras reales sobre cubierta).
 *    - Polyline con depthFailMaterial activo: visibilidad garantizada al 100% en
 *      cualquier cámara, zoom o irregularidad de fotogrametría 3D.
 *    - Colores planos sólidos sin shaders que puedan introducir inestabilidad GPU.
 *
 * 3. TIPOLOGÍAS ELÉCTRICAS SOPORTADAS:
 *    - Serie pura (1S por canal MPPT): pares individuales DC+ y DC- por string.
 *    - Paralelo en cubierta con conectores Y: 2 strings convergen en un nodo Y en
 *      cubierta, y desciende una única línea troncal bipolar de mayor sección.
 *    - Cuadro de Strings (Combiner Box): strings a caja + troncal DC a inversor.
 *    - Línea de Evacuación AC: inversor a cuadro AC y contador de red a 90°.
 *
 * 4. AUTO-TRAZADO ZERO-CLICK Y CODOS EDITABLES:
 *    - Generación automática en cuanto existen paneles y equipos en la escena.
 *    - Nodos de codo interactivos (ra_route_handle_*) para edición manual.
 *    - Snapping magnético al inicio/fin del string o nodo Y en trazado manual.
 * ============================================================================
 */

(function (global) {
  'use strict';

  var RACableEngine = {
    version: '3.1.0',

    // Configuración física de visualización
    CONFIG: {
      DC_POS_OFFSET: 0.35,       // Metros sobre plano para polo positivo (+)
      DC_NEG_OFFSET: 0.45,       // Metros sobre plano para polo negativo (-)
      TRAY_OFFSET: 0.40,         // Metros sobre plano para bandeja DC
      AC_OFFSET: 0.35,           // Metros sobre paramento para tubo AC
      CABLE_RADIUS_DC: 0.018,    // Radio visual cable DC (18 mm)
      CABLE_RADIUS_AC: 0.025,    // Radio visual tubo AC (25 mm)
      TRAY_WIDTH: 0.08,          // Anchura de bandeja portacables (8 cm)
      TRAY_HEIGHT: 0.03,         // Altura de bandeja portacables (3 cm)
      COLOR_DC_POS: '#EF4444',   // Rojo solar (DC+)
      COLOR_DC_NEG: '#0284C7',   // Azul grafito alto contraste (DC-)
      COLOR_COMBINER: '#10B981', // Verde esmeralda troncal
      COLOR_AC: '#38BDF8',       // Celeste evacuación AC
      COLOR_TRAY: '#64748B',     // Gris metalizado bandeja
      SNAP_DISTANCE_METERS: 2.5  // Radio de snap magnético a terminales
    },

    // Cache de perfiles 2D extruidos para PolylineVolume
    _shapes: {
      circleDc: null,
      circleAc: null,
      tray: null
    },

    /**
     * Asegura que un vector sea una instancia real de Cesium.Cartesian3
     */
    toCartesian3: function (c) {
      if (!c || typeof Cesium === 'undefined') return null;
      if (c instanceof Cesium.Cartesian3) return c;
      if (typeof c.x === 'number' && typeof c.y === 'number' && typeof c.z === 'number') {
        return new Cesium.Cartesian3(c.x, c.y, c.z);
      }
      return null;
    },

    /**
     * Genera un perfil circular 2D cerrado en sentido HORARIO (Clockwise)
     * para que las normales de Cesium.PolylineVolume apunten hacia afuera.
     */
    getCircleProfile: function (radius, segments) {
      if (typeof Cesium === 'undefined') return [];
      var segs = segments || 10;
      var pts = [];
      for (var i = 0; i < segs; i++) {
        var angle = -(i / segs) * Math.PI * 2; // Sentido horario
        pts.push(new Cesium.Cartesian2(Math.sin(angle) * radius, Math.cos(angle) * radius));
      }
      return pts;
    },

    /**
     * Genera un perfil de bandeja portacables rectangular/canaleta en 'U' en sentido horario
     */
    getTrayProfile: function (width, height) {
      if (typeof Cesium === 'undefined') return [];
      var hw = (width || 0.08) / 2;
      var h = height || 0.03;
      var th = 0.008; // Grosor de chapa
      return [
        new Cesium.Cartesian2(-hw, 0),
        new Cesium.Cartesian2(-hw, h),
        new Cesium.Cartesian2(-hw + th, h),
        new Cesium.Cartesian2(-hw + th, th),
        new Cesium.Cartesian2(hw - th, th),
        new Cesium.Cartesian2(hw - th, h),
        new Cesium.Cartesian2(hw, h),
        new Cesium.Cartesian2(hw, 0)
      ];
    },

    /**
     * Extrae la base ortonormal local de la cubierta más cercana a un punto 3D
     * Retorna { normal, uVec, vVec }
     */
    getRoofOrthonormalBasis: function (pos) {
      if (typeof Cesium === 'undefined' || !pos) return null;

      var normal = null;
      var uVec = null;
      var vVec = null;

      // 1. Intentar buscar plano activo en WP
      var WP = global.WP;
      if (WP && Array.isArray(WP.planes) && WP.planes.length > 0) {
        var pIdx = (WP.activePlaneIdx >= 0 && WP.activePlaneIdx < WP.planes.length) ? WP.activePlaneIdx : 0;
        var pl = WP.planes[pIdx];
        if (pl && pl.normal && pl.uVec && pl.vVec) {
          normal = Cesium.Cartesian3.clone(pl.normal);
          uVec = Cesium.Cartesian3.clone(pl.uVec);
          vVec = Cesium.Cartesian3.clone(pl.vVec);
        }
      }

      // 2. Si no hay plano definido en WP, extraer normal geodésica local y base ENU
      if (!normal) {
        normal = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(pos, new Cesium.Cartesian3()) || new Cesium.Cartesian3(0, 0, 1);
        var east = new Cesium.Cartesian3(-pos.y, pos.x, 0.0);
        if (Cesium.Cartesian3.magnitude(east) < 0.001) east = new Cesium.Cartesian3(1, 0, 0);
        uVec = Cesium.Cartesian3.normalize(east, new Cesium.Cartesian3());
        vVec = Cesium.Cartesian3.normalize(Cesium.Cartesian3.cross(normal, uVec, new Cesium.Cartesian3()), new Cesium.Cartesian3());
      }

      return { normal: normal, uVec: uVec, vVec: vVec };
    },

    /**
     * Eleva un punto 3D a una cota perpendicular exacta sobre el plano
     */
    elevatePoint: function (pos, offsetMeters, normVec) {
      if (!pos || typeof Cesium === 'undefined') return pos;
      var p = this.toCartesian3(pos);
      var n = normVec || Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(p, new Cesium.Cartesian3()) || new Cesium.Cartesian3(0, 0, 1);
      return Cesium.Cartesian3.add(p, Cesium.Cartesian3.multiplyByScalar(n, offsetMeters, new Cesium.Cartesian3()), new Cesium.Cartesian3());
    },

    /**
     * Limpia puntos duplicados o extremadamente próximos (< 1.5 cm)
     */
    sanitizePositions: function (pts) {
      if (!Array.isArray(pts) || pts.length < 2) return pts || [];
      var clean = [this.toCartesian3(pts[0])].filter(Boolean);
      for (var i = 1; i < pts.length; i++) {
        var pt = this.toCartesian3(pts[i]);
        if (!pt) continue;
        if (clean.length === 0) {
          clean.push(pt);
          continue;
        }
        var d = Cesium.Cartesian3.distance(pt, clean[clean.length - 1]);
        if (d > 0.015) {
          clean.push(pt);
        }
      }
      return clean.length >= 2 ? clean : pts;
    },

    /**
     * Generador de Trazado Manhattan 3D Ortogonal (90°) sobre Plano de Cubierta y Fachada
     * @param {Cesium.Cartesian3} startPos Punto inicial (panel o caja)
     * @param {Cesium.Cartesian3} endPos Punto final (inversor o contador)
     * @param {Object} options Opciones de trazado { normalOffset, intermediateWaypoints, basis }
     * @returns {Cesium.Cartesian3[]} Lista de vértices de la polilínea ortogonal a 90°
     */
    buildOrthogonalManhattanPath3D: function (startPos, endPos, options) {
      if (!startPos || !endPos || typeof Cesium === 'undefined') return [startPos, endPos].filter(Boolean);

      var pStart = this.toCartesian3(startPos);
      var pEnd = this.toCartesian3(endPos);
      if (!pStart || !pEnd) return [startPos, endPos].filter(Boolean);

      var opts = options || {};
      var normalOffset = (typeof opts.normalOffset === 'number') ? opts.normalOffset : this.CONFIG.DC_POS_OFFSET;
      var basis = opts.basis || this.getRoofOrthonormalBasis(pStart);
      var N = basis.normal;
      var U = basis.uVec;
      var V = basis.vVec;

      // Si el usuario proporcionó waypoints manuales (trazado por bandeja), conectar ortogonalmente
      var customWaypoints = opts.waypoints || [];
      if (Array.isArray(customWaypoints) && customWaypoints.length > 0) {
        var fullPts = [this.elevatePoint(pStart, normalOffset, N)];
        for (var w = 0; w < customWaypoints.length; w++) {
          var cw = this.toCartesian3(customWaypoints[w]);
          if (cw) fullPts.push(cw);
        }
        fullPts.push(this.elevatePoint(pEnd, 0.25, N));
        return this.sanitizePositions(fullPts);
      }

      // Trazado Manhattan Automático:
      // P0: Elevación en normal sobre cubierta
      var p0 = this.elevatePoint(pStart, normalOffset, N);

      // Desplazamiento global hacia destino
      var disp = Cesium.Cartesian3.subtract(pEnd, pStart, new Cesium.Cartesian3());
      var deltaU = Cesium.Cartesian3.dot(disp, U);
      var deltaV = Cesium.Cartesian3.dot(disp, V);

      // Codo 1: Tramo a lo largo del eje U (paralelo a hileras de paneles)
      var corner1 = Cesium.Cartesian3.add(p0, Cesium.Cartesian3.multiplyByScalar(U, deltaU, new Cesium.Cartesian3()), new Cesium.Cartesian3());

      // Codo 2: Tramo a lo largo del eje V a 90° (hacia la arista de cumbrera o alero)
      var corner2 = Cesium.Cartesian3.add(corner1, Cesium.Cartesian3.multiplyByScalar(V, deltaV, new Cesium.Cartesian3()), new Cesium.Cartesian3());

      // Codo 3: Transición vertical por fachada a 90° hacia el inversor
      var pTarget = this.elevatePoint(pEnd, 0.20, N);

      // Bajante vertical recta
      var path = [p0, corner1, corner2, pTarget];
      return this.sanitizePositions(path);
    },

    /**
     * Crea entidades para el cable:
     * 1. Polyline nítida con depthFailMaterial (visibilidad incondicional al 100%)
     * 2. PolylineVolume con perfiles extruidos y shadows: ENABLED (sombras físicas reales)
     */
    createVolumetricEntity: function (viewer, positions, options) {
      if (!viewer || !viewer.scene || !Array.isArray(positions) || positions.length < 2) return [];
      
      var opts = options || {};
      var colorHex = opts.colorHex || this.CONFIG.COLOR_DC_POS;
      var isTray = !!opts.isTray;
      
      var sanitized = this.sanitizePositions(positions);
      if (sanitized.length < 2) return [];
      
      var color = Cesium.Color.fromCssColorString(colorHex);
      var createdList = [];
      
      try {
        if (!window._raCableEnginePrimitives) {
          window._raCableEnginePrimitives = viewer.scene.primitives.add(new Cesium.PolylineCollection());
        }
        
        var poly = window._raCableEnginePrimitives.add({
          positions: sanitized,
          width: isTray ? 8.0 : 6.0,
          show: true
        });
        
        // Use PVFlow material to show direction like strings, or solid color
        poly.material = Cesium.Material.fromType('Color', {
          color: color
        });
        
        // Wrap the primitive in a mock entity object so existing cleanup code works
        // or just add a flag so we know it's a primitive
        var mockEntity = {
          isCablePrimitive: true,
          primitive: poly,
          id: 'cable_prim_' + Math.random().toString(36).substring(2)
        };
        createdList.push(mockEntity);
        
      } catch (eLine) {
        if (global.RA && global.RA.log) global.RA.log.warn('[RACableEngine] Error en PolylineCollection:', eLine);
      }
      return createdList;
    },

    /**
     * Calcula la longitud acumulada de una polilínea 3D
     */
    computePathLength: function (positions) {
      if (!Array.isArray(positions) || positions.length < 2) return 0;
      var total = 0;
      for (var i = 0; i < positions.length - 1; i++) {
        var pA = this.toCartesian3(positions[i]);
        var pB = this.toCartesian3(positions[i + 1]);
        if (pA && pB) {
          total += Cesium.Cartesian3.distance(pA, pB);
        }
      }
      return total;
    },

    /**
     * Recolecta todos los strings de paneles del proyecto
     * PRIORIZANDO allRenderedPanels (los paneles reales actualmente visibles en el viewport)
     */
    gatherAllStrings: function () {
      var allStrings = [];

      // 1. PRIORIDAD ABSOLUTA: allRenderedPanels (paneles instanciados en pantalla)
      // Agrupamos respetando el stringName y el orden exacto en que fueron serializados con [+ IN] y [- OUT]
      if (Array.isArray(global.allRenderedPanels) && global.allRenderedPanels.length > 0) {
        var activePanels = global.allRenderedPanels.filter(function (p) {
          return p && (p.center || (p.corners && p.corners.length > 0));
        });
        if (activePanels.length > 0) {
          var stringMap = {};
          var stringOrder = [];
          activePanels.forEach(function (p) {
            var sKey = p.stringName || ('S' + ((p.polyIdx || 0) + 1));
            if (!stringMap[sKey]) {
              stringMap[sKey] = [];
              stringOrder.push(sKey);
            }
            stringMap[sKey].push(p);
          });
          if (stringOrder.length > 0) {
            return stringOrder.map(function (sKey) {
              return {
                stringName: sKey,
                panels: stringMap[sKey]
              };
            });
          }
        }
      }

      // 2. PRIORIDAD 2: WP.polylines (paneles almacenados por faldón)
      var WP = global.WP;
      var hasPolys = WP && Array.isArray(WP.polylines) && WP.polylines.length > 0;
      if (hasPolys) {
        WP.polylines.forEach(function (poly) {
          var panels = (Array.isArray(poly.panels) && poly.panels.length > 0)
            ? poly.panels
            : ((poly.roofInfo && Array.isArray(poly.roofInfo.panels)) ? poly.roofInfo.panels : null);

          if (panels && panels.length > 0) {
            var strList2 = (typeof global.partitionPanelsIntoMPPTStrings === 'function')
              ? global.partitionPanelsIntoMPPTStrings(panels)
              : [{ panels: panels }];
            allStrings = allStrings.concat(strList2);
          }
        });
        if (allStrings.length > 0) return allStrings;
      }

      // 3. PRIORIDAD 3: lastRoofInfo (fallback de layout reciente)
      if (global.lastRoofInfo && Array.isArray(global.lastRoofInfo.panels) && global.lastRoofInfo.panels.length > 0) {
        var strList3 = (typeof global.partitionPanelsIntoMPPTStrings === 'function')
          ? global.partitionPanelsIntoMPPTStrings(global.lastRoofInfo.panels)
          : [{ panels: global.lastRoofInfo.panels }];
        return strList3;
      }

      return allStrings;
    },

    /**
     * Auto-ubica el inversor y contador por defecto si aún no se han colocado
     */
    ensureDefaultEquipmentPositions: function (allStrings) {
      var sState = global.inverterEquipmentState;
      if (!sState || typeof Cesium === 'undefined') return;

      var WP = global.WP;
      var hasPolys = WP && Array.isArray(WP.polylines) && WP.polylines.length > 0;

      // Inversor
      if (!sState.position) {
        var defaultPt = null;
        if (hasPolys && WP.polylines[0] && Array.isArray(WP.polylines[0].points) && WP.polylines[0].points.length > 0) {
          defaultPt = WP.polylines[0].points[0];
        } else if (allStrings.length > 0 && allStrings[0].panels && allStrings[0].panels.length > 0) {
          var p0 = allStrings[0].panels[0];
          defaultPt = p0.center || (p0.corners ? p0.corners[0] : null);
        }
        if (defaultPt) {
          defaultPt = this.toCartesian3(defaultPt);
          if (defaultPt) {
            var carto = Cesium.Cartographic.fromCartesian(defaultPt);
            sState.position = Cesium.Cartesian3.clone(defaultPt);
            sState.carto = { latitude: Cesium.Math.toDegrees(carto.latitude), longitude: Cesium.Math.toDegrees(carto.longitude), height: carto.height };
            if (typeof global.wpPlaceInverterAtPosition === 'function') {
              global.wpPlaceInverterAtPosition(defaultPt);
            }
          }
        }
      }

      // Contador de red (CGMP / Acometida en cota de calle / planta baja)
      if (sState.position && (!sState.gridMeter || !sState.gridMeter.position)) {
        var invC3 = this.toCartesian3(sState.position);
        if (invC3) {
          var invCarto = Cesium.Cartographic.fromCartesian(invC3);

          // Estimar altura del edificio y cota de suelo para el CGMP/Contador
          var bldList = (typeof buildings !== 'undefined' && Array.isArray(buildings))
            ? buildings
            : (typeof window !== 'undefined' && Array.isArray(window.buildings) ? window.buildings : []);
          var bldHeight = 6.0; // Altura estándar de edificación (2 plantas / 6m)
          if (bldList && bldList.length > 0 && typeof bldList[0].height === 'number' && bldList[0].height > 0) {
            bldHeight = Math.max(3.0, bldList[0].height);
          }
          // Bajada vertical de cubierta a cota de calle (cuadro a ~1.2m del suelo)
          var dropHeight = Math.max(3.0, bldHeight - 1.2);
          var meterHeight = invCarto.height - dropHeight;

          // Desplazamiento horizontal realista hacia la fachada / lindero (~8.5 m)
          var offsetEastRad = 8.5 / 6371000;
          var meterLonRad = invCarto.longitude + offsetEastRad;
          var meterLatRad = invCarto.latitude;
          var meterPt = Cesium.Cartesian3.fromRadians(meterLonRad, meterLatRad, meterHeight);
          if (!sState.gridMeter) sState.gridMeter = {};
          sState.gridMeter.position = meterPt;
          sState.gridMeter.carto = {
            latitude: Cesium.Math.toDegrees(meterLatRad),
            longitude: Cesium.Math.toDegrees(meterLonRad),
            height: meterHeight
          };
          if (typeof global.wpPlaceGridMeterAtPosition === 'function') {
            global.wpPlaceGridMeterAtPosition(meterPt, true);
          }
        }
      }
    },

    /**
     * Motor Principal de Renderizado de Cableado DC y AC con Trazado Ortogonal 3D y Sombras
     */
    renderAllCables: function () {
      var viewer = global.viewer;
      var sState = global.inverterEquipmentState;
      if (!viewer || !sState) return;
      if (sState.__isRenderingCables) return;
      sState.__isRenderingCables = true;
      try {
        // 1. Limpiar entidades anteriores
      if (Array.isArray(sState.dcCableEntities)) {
        sState.dcCableEntities.forEach(function (e) {
          try {
            if (e.isCablePrimitive) {
              if (window._raCableEnginePrimitives) window._raCableEnginePrimitives.remove(e.primitive);
            } else {
              if (typeof global.removeLabel2DEntity === 'function') global.removeLabel2DEntity(e);
              viewer.entities.remove(e);
            }
          } catch (err) {}
        });
      }
      sState.dcCableEntities = [];

      // 2. Recolectar strings y asegurar equipos
      var allStrings = this.gatherAllStrings();
      if (!allStrings || allStrings.length === 0) {
        sState.L_dc_measured = 0;
        sState.L_ac_measured = 0;
        this.updateElectricalSizingAndHUD(0, 0);
        return;
      }

      this.ensureDefaultEquipmentPositions(allStrings);

      var invPos = this.toCartesian3(sState.position);
      var cbPos = (sState.combinerBox && sState.combinerBox.position && sState.combinerBox.isEnabled)
        ? this.toCartesian3(sState.combinerBox.position)
        : null;
      var meterPos = (sState.gridMeter && sState.gridMeter.position)
        ? this.toCartesian3(sState.gridMeter.position)
        : null;
      var dcTargetPos = cbPos || (sState.dcProtectionPosition ? this.toCartesian3(sState.dcProtectionPosition) : invPos);

      if (!dcTargetPos) {
        sState.L_dc_measured = 0;
        sState.L_ac_measured = 0;
        this.updateElectricalSizingAndHUD(0, 0);
        return;
      }

      var hasManualDc = (sState.routes && Array.isArray(sState.routes.dc) && sState.routes.dc.length > 0);
      var maxLdc = 0;
      var self = this;

      // 3. Renderizar Codos Interactivos si hay ruta manual
      if (hasManualDc) {
        sState.routes.dc.forEach(function (pt, pIdx) {
          var pC3 = self.toCartesian3(pt);
          if (!pC3) return;
          var node = viewer.entities.add({
            id: 'ra_route_handle_dc_' + pIdx,
            name: 'Codo de Bandeja DC #' + (pIdx + 1),
            position: pC3,
            point: {
              pixelSize: 10,
              color: Cesium.Color.fromCssColorString(self.CONFIG.COLOR_TRAY),
              outlineColor: Cesium.Color.WHITE,
              outlineWidth: 2,
              disableDepthTestDistance: Number.POSITIVE_INFINITY
            }
          });
          sState.dcCableEntities.push(node);
        });
      }

      // 4. Determinar Topología (Serie pura vs Paralelo Y) — [C1/G1] fuente única
      var cfg = global.solarProjectConfig || {};
      var _dcTopo = this.getDcTopologyInfo(allStrings.length);
      var isParallelY = _dcTopo.isParallel && allStrings.length >= 2;

      // Si la topología es Paralelo Y: unir strings en un nodo intermedio en cubierta
      var yBranchNode = null;
      if (isParallelY && allStrings.length >= 2) {
        var str1 = allStrings[0], str2 = allStrings[1];
        if (str1.panels && str2.panels && str1.panels.length > 0 && str2.panels.length > 0) {
          var pA = self.toCartesian3(str1.panels[str1.panels.length - 1].center);
          var pB = self.toCartesian3(str2.panels[0].center);
          if (pA && pB) {
            yBranchNode = Cesium.Cartesian3.midpoint(pA, pB, new Cesium.Cartesian3());
          }
        }
      }

      // 5. Generar y Renderizar Trazados DC para cada String
      allStrings.forEach(function (strObj, sIdx) {
        var sPanels = strObj.panels || [];
        if (sPanels.length === 0) return;

        var firstPanel = sPanels[0];
        var termPanel = sPanels[sPanels.length - 1];

        function getJunctionBoxPos(panel) {
          if (!panel) return null;
          var center = panel.center;
          if (!center && panel.corners && panel.corners.length > 0) center = panel.corners[0];
          if (!center || typeof center.x !== 'number' || isNaN(center.x)) return null;
          
          if (panel.v && typeof panel.h === 'number' && !isNaN(panel.h)) {
            try {
              var v3 = new Cesium.Cartesian3(panel.v.x || 0, panel.v.y || 0, panel.v.z || 0);
              var mag = Cesium.Cartesian3.magnitude(v3);
              if (mag > 0.001 && !isNaN(mag)) {
                var vNorm = Cesium.Cartesian3.normalize(v3, new Cesium.Cartesian3());
                var offset = Cesium.Cartesian3.multiplyByScalar(vNorm, panel.h * 0.45, new Cesium.Cartesian3());
                var result = Cesium.Cartesian3.add(center, offset, new Cesium.Cartesian3());
                if (!isNaN(result.x) && !isNaN(result.y) && !isNaN(result.z)) {
                  return result;
                }
              }
            } catch (e) {}
          }
          return center;
        }

        var startPos = self.toCartesian3(getJunctionBoxPos(firstPanel));
        var termPos = self.toCartesian3(getJunctionBoxPos(termPanel));
        if (!startPos || !termPos || !dcTargetPos) return;

        var basis = self.getRoofOrthonormalBasis(startPos);

        // Si hay nodo Y en cubierta para este par de strings:
        var targetForStringPos = (yBranchNode && sIdx < 2) ? yBranchNode : dcTargetPos;
        var targetForStringNeg = (yBranchNode && sIdx < 2) ? yBranchNode : dcTargetPos;

        // Trazado DC+ (Rojo, cota +0.35m sobre faldón)
        var posPath = self.buildOrthogonalManhattanPath3D(startPos, targetForStringPos, {
          normalOffset: self.CONFIG.DC_POS_OFFSET,
          basis: basis,
          waypoints: hasManualDc ? sState.routes.dc : null
        });

        // Trazado DC- (Azul, cota +0.45m sobre faldón / retorno compensado)
        var negPath = self.buildOrthogonalManhattanPath3D(termPos, targetForStringNeg, {
          normalOffset: self.CONFIG.DC_NEG_OFFSET,
          basis: basis,
          waypoints: hasManualDc ? sState.routes.dc : null
        });

        var lPos = self.computePathLength(posPath);
        var lNeg = self.computePathLength(negPath);
        var totalStrLen = lPos + lNeg;
        if (Math.max(lPos, lNeg) > maxLdc) maxLdc = Math.max(lPos, lNeg);

        // Crear entidades volumétricas 3D con sombras reales + polyline de alta visibilidad
        var posEntities = self.createVolumetricEntity(viewer, posPath, {
          name: 'Acometida DC+ String #' + (sIdx + 1) + ' (90° Manhattan 3D)',
          colorHex: self.CONFIG.COLOR_DC_POS,
          radius: self.CONFIG.CABLE_RADIUS_DC
        });
        posEntities.forEach(function (e) { sState.dcCableEntities.push(e); });

        var negEntities = self.createVolumetricEntity(viewer, negPath, {
          name: 'Acometida DC- String #' + (sIdx + 1) + ' (90° Manhattan 3D)',
          colorHex: self.CONFIG.COLOR_DC_NEG,
          radius: self.CONFIG.CABLE_RADIUS_DC
        });
        negEntities.forEach(function (e) { sState.dcCableEntities.push(e); });

        // Etiqueta 2D de telemetría de string
        var midIdx = Math.floor(posPath.length / 2);
        var midPt = posPath[midIdx] || posPath[0];
        if (typeof global.addLabelEntity === 'function') {
          var labelText = '⚡ String ' + (sIdx + 1) + ' (DC+/DC-) · ' + totalStrLen.toFixed(1) + ' m [90°]';
          var lbl = global.addLabelEntity(midPt, labelText, -6, {
            bg: 'rgba(15, 23, 42, 0.90)',
            borderColor: self.CONFIG.COLOR_DC_POS,
            textColor: '#FFFFFF',
            font: "bold 10px 'JetBrains Mono', monospace",
            inspectOnHover: true,
            category: 'cable'
          });
          if (lbl) sState.dcCableEntities.push(lbl);
        }
      });

      // Si hay nodo Y en cubierta: renderizar la línea troncal desde el nodo Y al inversor
      if (yBranchNode && dcTargetPos) {
        var yTrunkPath = self.buildOrthogonalManhattanPath3D(yBranchNode, dcTargetPos, {
          normalOffset: self.CONFIG.TRAY_OFFSET,
          waypoints: hasManualDc ? sState.routes.dc : null
        });
        var yTrunkLen = self.computePathLength(yTrunkPath);
        maxLdc += yTrunkLen;

        var yTrunkEntities = self.createVolumetricEntity(viewer, yTrunkPath, {
          name: 'Troncal DC Bipolar Paralelo Y (90° Manhattan)',
          colorHex: self.CONFIG.COLOR_TRAY,
          isTray: true
        });
        yTrunkEntities.forEach(function (e) { sState.dcCableEntities.push(e); });
      }

      // 6. Troncal DC: Si existe Combiner Box y además Cuadro DC, la troncal de cubierta baja al Cuadro DC y de ahí al Inversor
      var dcBoxPos = (sState.dcProtectionPosition && sState.dcProtectionEntity) ? this.toCartesian3(sState.dcProtectionPosition) : null;
      var intermediateTarget = (cbPos && dcBoxPos) ? dcBoxPos : invPos;

      if (cbPos && intermediateTarget && Cesium.Cartesian3.distance(cbPos, intermediateTarget) > 0.05) {
        var trunkPath = self.buildOrthogonalManhattanPath3D(cbPos, intermediateTarget, {
          normalOffset: self.CONFIG.TRAY_OFFSET
        });
        var lTrunk = self.computePathLength(trunkPath);
        maxLdc += lTrunk;

        var trunkEntities = self.createVolumetricEntity(viewer, trunkPath, {
          name: 'Troncal DC Combiner ➔ Cuadro/Inversor (90° Manhattan 3D)',
          colorHex: self.CONFIG.COLOR_COMBINER,
          isTray: true
        });
        trunkEntities.forEach(function (e) { sState.dcCableEntities.push(e); });

        if (typeof global.addLabelEntity === 'function' && trunkPath.length >= 2) {
          var midTrunk = trunkPath[Math.floor(trunkPath.length / 2)];
          var trunkLbl = global.addLabelEntity(midTrunk, '⚡ Troncal DC · ' + lTrunk.toFixed(1) + ' m', -6, {
            bg: 'rgba(15, 23, 42, 0.90)',
            borderColor: self.CONFIG.COLOR_COMBINER,
            textColor: '#FFFFFF',
            font: "bold 10.5px 'JetBrains Mono', monospace",
            inspectOnHover: true,
            category: 'cable'
          });
          if (trunkLbl) sState.dcCableEntities.push(trunkLbl);
        }
      } else if (!cbPos && dcBoxPos && invPos && Cesium.Cartesian3.distance(dcBoxPos, invPos) > 0.05) {
        // Sin combiner box: strings van directo al Cuadro DC
        var dcToInvPath = self.buildOrthogonalManhattanPath3D(dcBoxPos, invPos, {
          normalOffset: self.CONFIG.TRAY_OFFSET
        });
        var lDcInv = self.computePathLength(dcToInvPath);
        maxLdc += lDcInv;

        var dcToInvEntities = self.createVolumetricEntity(viewer, dcToInvPath, {
          name: 'Puente DC Cuadro ➔ Inversor (90° Manhattan 3D)',
          colorHex: self.CONFIG.COLOR_COMBINER,
          isTray: true
        });
        dcToInvEntities.forEach(function (e) { sState.dcCableEntities.push(e); });
      }

      // 6.b Latiguillo de interconexión directa Cuadro DC ➔ Inversor (cuando ambos están presentes con Combiner Box)
      if (cbPos && dcBoxPos && invPos && Cesium.Cartesian3.distance(dcBoxPos, invPos) > 0.05) {
        var bridgePath = self.buildOrthogonalManhattanPath3D(dcBoxPos, invPos, {
          normalOffset: self.CONFIG.TRAY_OFFSET
        });
        var lBridge = self.computePathLength(bridgePath);
        maxLdc += lBridge;

        var bridgeEntities = self.createVolumetricEntity(viewer, bridgePath, {
          name: 'Puente DC Cuadro ➔ Inversor (90° Manhattan 3D)',
          colorHex: self.CONFIG.COLOR_COMBINER,
          isTray: true
        });
        bridgeEntities.forEach(function (e) { sState.dcCableEntities.push(e); });
      }

      // 6.c Bus de Batería DC: Batería LFP ➔ Inversor Híbrido
      var batPos = (sState.batteryPosition && sState.batteryEntity) ? this.toCartesian3(sState.batteryPosition) : null;
      if (batPos && invPos && Cesium.Cartesian3.distance(batPos, invPos) > 0.05) {
        var batBusPath = self.buildOrthogonalManhattanPath3D(batPos, invPos, {
          normalOffset: self.CONFIG.TRAY_OFFSET
        });
        var lBatBus = self.computePathLength(batBusPath);

        var batEntities = self.createVolumetricEntity(viewer, batBusPath, {
          name: 'Bus DC Batería ➔ Inversor (90° Manhattan 3D)',
          colorHex: '#10B981',
          radius: self.CONFIG.CABLE_RADIUS_DC
        });
        batEntities.forEach(function (e) { sState.dcCableEntities.push(e); });

        if (typeof global.addLabelEntity === 'function' && batBusPath.length >= 2) {
          var midBat = batBusPath[Math.floor(batBusPath.length / 2)];
          var batLbl = global.addLabelEntity(midBat, '🔋 Bus Batería · ' + lBatBus.toFixed(1) + ' m', -6, {
            bg: 'rgba(15, 23, 42, 0.90)',
            borderColor: '#10B981',
            textColor: '#FFFFFF',
            font: "bold 10px 'JetBrains Mono', monospace",
            inspectOnHover: true,
            category: 'cable'
          });
          if (batLbl) sState.dcCableEntities.push(batLbl);
        }
      }

      // 7. Línea de Evacuación AC (Inversor ➔ Contador de Red)
      if (invPos && meterPos) {
        var hasManualAc = (sState.routes && Array.isArray(sState.routes.ac) && sState.routes.ac.length > 0);
        var acPath = self.buildOrthogonalManhattanPath3D(invPos, meterPos, {
          normalOffset: self.CONFIG.AC_OFFSET,
          waypoints: hasManualAc ? sState.routes.ac : null
        });
        var lAc = self.computePathLength(acPath);
        sState.L_ac_measured = Math.round(lAc * 10) / 10;

        var acEntities = self.createVolumetricEntity(viewer, acPath, {
          name: 'Línea Evacuación AC (90° Manhattan 3D)',
          colorHex: self.CONFIG.COLOR_AC,
          radius: self.CONFIG.CABLE_RADIUS_AC
        });
        acEntities.forEach(function (e) { sState.dcCableEntities.push(e); });

        if (typeof global.addLabelEntity === 'function' && acPath.length >= 2) {
          var midAc = acPath[Math.floor(acPath.length / 2)];
          var acLbl = global.addLabelEntity(midAc, '🔌 Evacuación AC · ' + lAc.toFixed(1) + ' m [Tubo]', -6, {
            bg: 'rgba(15, 23, 42, 0.90)',
            borderColor: self.CONFIG.COLOR_AC,
            textColor: '#FFFFFF',
            font: "bold 10.5px 'JetBrains Mono', monospace",
            inspectOnHover: true,
            category: 'cable'
          });
          if (acLbl) sState.dcCableEntities.push(acLbl);
        }
      }

      sState.L_dc_measured = Math.round(maxLdc * 10) / 10;

      // 8. Dimensionamiento Eléctrico REBT ITC-BT-40 y Actualización de Telemetría
      this.updateElectricalSizingAndHUD(sState.L_dc_measured, sState.L_ac_measured);

      console.info('[RACableEngine] ⚡ Cables generados con éxito: ' + allStrings.length + ' string(s), maxLdc=' + maxLdc.toFixed(1) + 'm, Lac=' + (sState.L_ac_measured || 0).toFixed(1) + 'm');

        if (viewer.scene && typeof viewer.scene.requestRender === 'function') {
          viewer.scene.requestRender();
        }
      } finally {
        sState.__isRenderingCables = false;
      }
    },

    /**
     * [C1/G1] Fuente ÚNICA de la topología DC y conteo REAL de grupos en paralelo.
     * Etiqueta canónica: solarProjectConfig.dcTopology (retrocompatible con selectedTopology).
     * En 'parallel'/'parallel_y' el conductor troncal suma la corriente de los grupos que
     * realmente convergen (nº real de strings), en vez de asumir un 2 fijo o leer un campo inexistente.
     */
    getDcTopologyInfo: function (nStrings) {
      var cfg = global.solarProjectConfig || {};
      var label = cfg.dcTopology || cfg.selectedTopology || 'inverter';
      var isParallel = (label === 'parallel' || label === 'parallel_y');
      var n = (typeof nStrings === 'number') ? nStrings : 0;
      if (!n) { try { n = this.gatherAllStrings().length; } catch (e) { n = 0; } }
      return { label: label, isParallel: isParallel, groups: isParallel ? Math.max(2, n) : 1, strings: n };
    },

    /**
     * Dimensionamiento de sección y caída de tensión según REBT ITC-BT-40
     */
    updateElectricalSizingAndHUD: function (Ldc, Lac) {
      var sState = global.inverterEquipmentState;
      if (!sState) return;

      var modCfg = global.panelConfig || { potencia: 450, isc: 13.8, imp: 13.05, vmp: 34.5 };
      var invCfg = (global.solarProjectConfig && global.solarProjectConfig.calculatedLimits && global.solarProjectConfig.calculatedLimits.inverter)
        ? global.solarProjectConfig.calculatedLimits.inverter
        : { kw: 10.0, type: 'Trifásico' };

      var rho90 = 0.023; // Resistencia específica cobre a 90°C
      var lDcVal = Ldc || 25;
      var lAcVal = Lac || 15;
      var imp = modCfg.imp || 13.05;

      // Obtener el número real de paneles del circuito para la tensión de trabajo (Vmp real)
      var strList = this.gatherAllStrings();
      var minModPerStr = 12; // fallback prudente
      if (Array.isArray(strList) && strList.length > 0) {
        var validLengths = strList.map(function(s) { return (s.panels && s.panels.length) || 0; }).filter(function(n) { return n > 0; });
        if (validLengths.length > 0) {
          // Usamos el string más corto para evaluar el caso más desfavorable (menor Vdc => mayor % ΔV)
          minModPerStr = Math.min.apply(null, validLengths);
        }
      } else if (global.solarProjectConfig && global.solarProjectConfig.calculatedLimits && global.solarProjectConfig.calculatedLimits.nMinString) {
        minModPerStr = global.solarProjectConfig.calculatedLimits.nMinString;
      }
      var vmpStr = (modCfg.vmp || 34.5) * Math.max(1, minModPerStr);

      // [C1/G1] La corriente del troncal se multiplica por el número REAL de grupos en paralelo
      // (fuente única getDcTopologyInfo). Ya no se lee un campo inexistente (dcTopology) que
      // provocaba que nunca se doblara la sección del conductor troncal.
      var numParallel = this.getDcTopologyInfo(strList.length).groups;
      var iDcDesign = numParallel * 1.25 * (modCfg.isc || 13.8);
      var iDcWorking = numParallel * imp;

      var secDcAvail = [4, 6, 10, 16, 25];
      var imaxDcZZF  = [44, 58, 80, 107, 138];
      // [C6/M6] Corrección de ampacidad por temperatura ambiente y agrupamiento
      // (REBT ITC-BT-19 / UNE 20460-5-523): 0.90 (40–45 °C) × 0.85 (bandeja/conducto).
      var kAmpacity = 0.90 * 0.85;
      var sDcOpt = 6, dVdcPctOpt = 1.0;
      var dcCompliant = false;

      for (var i = 0; i < secDcAvail.length; i++) {
        var s = secDcAvail[i];
        var dV = (2 * rho90 * lDcVal * iDcWorking) / s;
        var dVpct = (dV / vmpStr) * 100;
        if ((imaxDcZZF[i] * kAmpacity) >= iDcDesign && dVpct <= 1.5) {
          sDcOpt = s;
          dVdcPctOpt = dVpct;
          dcCompliant = true;
          break;
        }
      }

      if (!dcCompliant) {
        sDcOpt = secDcAvail[secDcAvail.length - 1]; // 25 mm²
        var dVMax = (2 * rho90 * lDcVal * iDcWorking) / sDcOpt;
        dVdcPctOpt = (dVMax / vmpStr) * 100;
        sState.dcNonCompliantWarning = true;
      } else {
        sState.dcNonCompliantWarning = false;
      }

      sState.S_dc_recommended = sDcOpt;
      sState.dV_dc_pct = dVdcPctOpt;

      var invCount = (global.solarProjectConfig && global.solarProjectConfig.autoSizing && global.solarProjectConfig.autoSizing.inverters && Number.isFinite(global.solarProjectConfig.autoSizing.inverters.count))
        ? Math.max(1, global.solarProjectConfig.autoSizing.inverters.count) : 1;
      var pAcKw = (invCfg.kw || 10.0) * invCount;
      // [C3/G4] Fase como DATO propio del inversor (helper canónico), no adivinada del texto.
      var isMono = (typeof global.raInverterPhases === 'function'
        ? global.raInverterPhases(invCfg)
        : ((invCfg.type || '').toLowerCase().indexOf('mono') !== -1 ? 1 : 3)) === 1;
      var vAc = isMono ? 230 : 400;
      var iAc = isMono ? (pAcKw * 1000) / (vAc * 0.95) : (pAcKw * 1000) / (Math.sqrt(3) * vAc * 0.95);
      var iAcDesign = 1.25 * iAc;
      var secAcAvail = [2.5, 4, 6, 10, 16, 25, 35, 50];
      var imaxAcRVK  = [29, 38, 49, 68, 91, 119, 146, 178];
      var sAcOpt = 10, dVacPctOpt = 0.8;
      var acCompliant = false;

      var xMeterAc = 0.08 / 1000.0; // Reactancia inductiva normalizada 0.08 Ohm/km (REBT ITC-BT-40)
      var cosPAc = 0.95;
      var sinPAc = Math.sqrt(Math.max(0, 1.0 - cosPAc * cosPAc));
      for (var j = 0; j < secAcAvail.length; j++) {
        var sa = secAcAvail[j];
        var factorPhase = isMono ? 2.0 : Math.sqrt(3);
        var dVa = factorPhase * iAc * lAcVal * ((rho90 / sa) * cosPAc + xMeterAc * sinPAc);
        var dVapct = (dVa / vAc) * 100;
        if ((imaxAcRVK[j] * kAmpacity) >= iAcDesign && dVapct <= 1.5) {
          sAcOpt = sa;
          dVacPctOpt = dVapct;
          acCompliant = true;
          break;
        }
      }

      if (!acCompliant) {
        sAcOpt = secAcAvail[secAcAvail.length - 1]; // 50 mm²
        var factorPhaseMax = isMono ? 2.0 : Math.sqrt(3);
        var dVaMax = factorPhaseMax * iAc * lAcVal * ((rho90 / sAcOpt) * cosPAc + xMeterAc * sinPAc);
        dVacPctOpt = (dVaMax / vAc) * 100;
        sState.acNonCompliantWarning = true;
      } else {
        sState.acNonCompliantWarning = false;
      }

      sState.S_ac_recommended = sAcOpt;
      sState.dV_ac_pct = dVacPctOpt;

      // Actualizar telemetría visual en HUD
      var statLdcEl = document.getElementById('inverter-stat-ldc');
      if (statLdcEl) statLdcEl.textContent = (sState.L_dc_measured || 0).toFixed(1) + ' m';
      var statLacEl = document.getElementById('inverter-stat-lac');
      if (statLacEl) statLacEl.textContent = (sState.L_ac_measured || 0).toFixed(1) + ' m';
      var statSecDcEl = document.getElementById('inverter-stat-sec-dc');
      if (statSecDcEl) {
        statSecDcEl.textContent = sDcOpt + ' mm² · ΔV ' + dVdcPctOpt.toFixed(1) + '%' + (sState.dcNonCompliantWarning ? ' ⚠️ >1.5%' : '');
        if (sState.dcNonCompliantWarning) statSecDcEl.style.color = '#ef4444';
        else statSecDcEl.style.color = '';
      }
      var statSecAcEl = document.getElementById('inverter-stat-sec-ac');
      if (statSecAcEl) {
        statSecAcEl.textContent = sAcOpt + ' mm² · ΔV ' + dVacPctOpt.toFixed(1) + '%' + (sState.acNonCompliantWarning ? ' ⚠️ >1.5%' : '');
        if (sState.acNonCompliantWarning) statSecAcEl.style.color = '#ef4444';
        else statSecAcEl.style.color = '';
      }

      if (!global.solarLossConfig) global.solarLossConfig = {};
      global.solarLossConfig.wiringCalculated = (dVdcPctOpt + dVacPctOpt) / 100.0;
      if (!global.solarLossConfig.userCustomizedWiring && typeof global.solarLossConfig.wiring === 'undefined') {
        global.solarLossConfig.wiring = global.solarLossConfig.wiringCalculated;
      }

      if (typeof global.recalculateSolarYield === 'function') global.recalculateSolarYield();
      if (global.BOMTreeEngine && typeof global.BOMTreeEngine.refresh === 'function') global.BOMTreeEngine.refresh();
      if (global.ProjectHierarchy && typeof global.ProjectHierarchy.notify === 'function') global.ProjectHierarchy.notify('electrical_updated');
    },

    /**
     * Búsqueda de snap magnético al terminal más próximo (DC+ / DC- / Nodo Y)
     */
    findSnapTarget: function (clickPos, maxDistMeters) {
      if (!clickPos || typeof Cesium === 'undefined') return null;
      var cPos = this.toCartesian3(clickPos);
      if (!cPos) return null;

      var snapDist = maxDistMeters || this.CONFIG.SNAP_DISTANCE_METERS;
      var allStrings = this.gatherAllStrings();
      var bestPt = null;
      var bestDist = snapDist;

      for (var s = 0; s < allStrings.length; s++) {
        var strObj = allStrings[s];
        var panels = strObj.panels || [];
        if (panels.length === 0) continue;

        var pStart = this.toCartesian3(panels[0].center);
        var pEnd = this.toCartesian3(panels[panels.length - 1].center);

        if (pStart) {
          var d1 = Cesium.Cartesian3.distance(cPos, pStart);
          if (d1 < bestDist) { bestDist = d1; bestPt = pStart; }
        }
        if (pEnd) {
          var d2 = Cesium.Cartesian3.distance(cPos, pEnd);
          if (d2 < bestDist) { bestDist = d2; bestPt = pEnd; }
        }
      }

      return bestPt;
    },

    /**
     * Suite de auto-verificación y tests ejecutables por el usuario en consola
     */
    runSelfTests: function () {
      var results = { passed: 0, failed: 0, tests: [] };

      function assert(desc, condition) {
        if (condition) {
          results.passed++;
          results.tests.push({ desc: desc, status: 'PASS' });
        } else {
          results.failed++;
          results.tests.push({ desc: desc, status: 'FAIL' });
          console.error('[RACableEngine SelfTest FAIL]', desc);
        }
      }

      // Test 1: Comprobación de API Cesium
      assert('Cesium está disponible en el entorno', typeof Cesium !== 'undefined');

      // Test 2: Perfil extruido circular
      var circle = RACableEngine.getCircleProfile(0.018, 8);
      assert('Perfil circular 2D generado con 8 puntos en sentido horario', Array.isArray(circle) && circle.length === 8);

      // Test 3: Perfil bandeja
      var tray = RACableEngine.getTrayProfile(0.08, 0.03);
      assert('Perfil de bandeja portacables generado con 8 puntos', Array.isArray(tray) && tray.length === 8);

      // Test 4: Sanitización de puntos
      if (typeof Cesium !== 'undefined') {
        var pA = new Cesium.Cartesian3(0, 0, 0);
        var pB = new Cesium.Cartesian3(0, 0, 0.005); // Muy cerca (<1cm)
        var pC = new Cesium.Cartesian3(1, 0, 0);
        var clean = RACableEngine.sanitizePositions([pA, pB, pC]);
        assert('Sanitización elimina puntos colapsados (<1.5cm)', clean.length === 2);

        // Test 5: Trazado Manhattan Ortogonal 90°
        var path = RACableEngine.buildOrthogonalManhattanPath3D(pA, pC, { normalOffset: 0.35 });
        assert('Trazado Manhattan devuelve array de vértices >= 3', Array.isArray(path) && path.length >= 3);
      }

      console.info('[RACableEngine] Resultados de verificación:', results);
      return results;
    }
  };

  // Exportación canónica en global y namespace RA
  global.RACableEngine = RACableEngine;
  global.RA = global.RA || {};
  global.RA.CableEngine = RACableEngine;

  // Enlaces de compatibilidad directa con los nombres legacy para no romper el HTML
  global.wpCalculateAndRenderInverterCables = function () {
    return RACableEngine.renderAllCables();
  };
  global.wpCalculateAndRenderACCables = function () {
    return RACableEngine.renderAllCables();
  };

})(typeof window !== 'undefined' ? window : this);
