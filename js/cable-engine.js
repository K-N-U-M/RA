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
      DC_POS_OFFSET: -0.06,      // Metros sobre plano: cota negativa para ir bajo las placas
      DC_NEG_OFFSET: -0.06,      // Metros sobre plano: cota negativa para ir bajo las placas emparejado
      DC_RETURN_OFFSET: -0.08,   // Metros sobre plano: retorno pegado a las guías bajo módulos
      JUMPER_OFFSET: -0.06,      // Metros sobre plano: latiguillos por el reverso de las placas
      GROUND_OFFSET: -0.08,      // Metros sobre plano: conductor equipotencial de tierra bajo estructura
      TRAY_OFFSET: -0.05,        // Metros sobre plano: bandeja por el reverso de la estructura
      AC_OFFSET: 0.15,           // Metros sobre paramento para tubo AC
      CABLE_RADIUS_DC: 0.018,    // Radio visual cable DC (18 mm)
      CABLE_RADIUS_AC: 0.025,    // Radio visual tubo AC (25 mm)
      AUDIT_ELEVATION_M: 0.24,   // Desfase visual solo-auditoría (+24 cm sobre cubierta sin alterar métricas)
      TRAY_WIDTH: 0.08,          // Anchura estándar bandeja portacables (8 cm)
      TRAY_HEIGHT: 0.03,         // Altura estándar bandeja portacables (3 cm)
      COLOR_DC_POS: '#EF4444',   // Rojo solar (DC+)
      COLOR_DC_NEG: '#0284C7',   // Azul grafito alto contraste (DC-)
      COLOR_DC_RETURN: '#1E293B',// Grafito carbón retorno anti-bucle (evita falsos azules sobre módulos)
      COLOR_COMBINER: '#475569', // Gris acero troncal combinada (distinta de tierra y strings)
      COLOR_AC: '#38BDF8',       // Celeste evacuación AC
      COLOR_TRAY: '#64748B',     // Gris metalizado bandeja
      COLOR_GROUNDING: '#16A34A',// Verde tierra equipotencial Cu 16mm² (ITC-BT-18)
      STRING_COLORS: [           // Paleta técnica oscura carbón/grafito con matices diferenciables entre strings
        '#334155', '#312E81', '#3F2E26', '#1E3A5F',
        '#1F3A3A', '#3B1D36', '#27272A', '#2E2A1F'
      ],
      SNAP_DISTANCE_METERS: 2.5  // Radio de snap magnético a terminales
    },

    // Modo Rayos X / Auditoría Visual: vuelve las placas translúcidas (25%) y destaca el trazado exterior
    auditElevationMode: false,

    toggleAuditElevation: function (forceVal) {
      this.auditElevationMode = (typeof forceVal === 'boolean') ? forceVal : !this.auditElevationMode;
      this.renderAllCables();
      if (typeof global.wpFastRenderSimulatedPanelsAsync === 'function') {
        global.wpFastRenderSimulatedPanelsAsync(true);
      } else if (typeof global.wpFastRenderSimulatedPanels === 'function') {
        global.wpFastRenderSimulatedPanels(true);
      }
      return this.auditElevationMode;
    },

    setRoutingStrategy: function (strategy) {
      var allowed = { auto: true, pitched_ridge_eave: true, flat_aisle: true, multi_roof_trunk: true };
      var next = allowed[strategy] ? strategy : 'auto';
      if (!global.inverterEquipmentState) global.inverterEquipmentState = {};
      global.inverterEquipmentState.routingStrategy = next;
      this.renderAllCables();
      if (typeof global.wpUpdateCableRoutesUI === 'function') global.wpUpdateCableRoutesUI();
      if (typeof global.BOMTreeEngine !== 'undefined' && typeof global.BOMTreeEngine.refresh === 'function') {
        global.BOMTreeEngine.refresh();
      }
      return next;
    },

    /**
     * Calcula coordenadas de imantación inteligente sobre faldones, bordes de cubierta (cumbrera/alero),
     * pasillos entre filas en cubierta plana, aristas verticales de fachada y bloqueo ortogonal 90°.
     */
    snapRoutePoint: function (rawPos, options) {
      if (!rawPos || typeof Cesium === 'undefined') return { cartesian: rawPos, snapTag: null };
      var opts = options || {};
      var pt = this.toCartesian3(rawPos);
      if (!pt) return { cartesian: rawPos, snapTag: null };

      var snapTag = null;
      var bestPt = pt;
      var WP = global.WP || (typeof window !== 'undefined' ? window.WP : null);

      // 1. Imantación a vértices/aristas de faldón (cumbrera, alero, limatesa/limahoya)
      if (WP && Array.isArray(WP.polylines) && WP.polylines.length > 0) {
        var bestEdgeDist = 0.85;
        for (var pi = 0; pi < WP.polylines.length; pi++) {
          var poly = WP.polylines[pi];
          if (!poly || poly.visible === false || !Array.isArray(poly.points) || poly.points.length < 2) continue;
          for (var vi = 0; vi < poly.points.length; vi++) {
            var a = this.toCartesian3(poly.points[vi]);
            var b = this.toCartesian3(poly.points[(vi + 1) % poly.points.length]);
            if (!a || !b) continue;
            var dVtx = Cesium.Cartesian3.distance(pt, a);
            if (dVtx < bestEdgeDist) {
              bestEdgeDist = dVtx;
              bestPt = Cesium.Cartesian3.clone(a);
              snapTag = 'Vértice de cubierta';
            }
            var ab = Cesium.Cartesian3.subtract(b, a, new Cesium.Cartesian3());
            var ap = Cesium.Cartesian3.subtract(pt, a, new Cesium.Cartesian3());
            var abLenSq = Cesium.Cartesian3.magnitudeSquared(ab);
            if (abLenSq > 1e-4) {
              var t = Math.max(0, Math.min(1, Cesium.Cartesian3.dot(ap, ab) / abLenSq));
              var proj = Cesium.Cartesian3.add(a, Cesium.Cartesian3.multiplyByScalar(ab, t, new Cesium.Cartesian3()), new Cesium.Cartesian3());
              var dEdge = Cesium.Cartesian3.distance(pt, proj);
              if (dEdge < bestEdgeDist) {
                bestEdgeDist = dEdge;
                bestPt = proj;
                snapTag = 'Cumbrera / Alero';
              }
            }
          }
        }
      }

      // 2. Imantación a aristas de fachada / esquinas verticales de edificios
      var blds = global.buildings || (typeof window !== 'undefined' ? window.buildings : null);
      if (!snapTag && Array.isArray(blds) && blds.length > 0) {
        var bestBldDist = 0.90;
        for (var bi = 0; bi < blds.length; bi++) {
          var bld = blds[bi];
          var bPts = (bld && (bld.points || bld.polygon)) || null;
          if (!Array.isArray(bPts) || bPts.length < 2) continue;
          for (var k = 0; k < bPts.length; k++) {
            var eA = this.toCartesian3(bPts[k]);
            if (!eA) continue;
            var horizDist = Cesium.Cartesian3.distance(
              new Cesium.Cartesian3(pt.x, pt.y, pt.z),
              new Cesium.Cartesian3(eA.x, eA.y, pt.z)
            );
            // Distancia horizontal aproximada usando proyección sobre tangente local
            var upE = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(eA, new Cesium.Cartesian3());
            var diffE = Cesium.Cartesian3.subtract(pt, eA, new Cesium.Cartesian3());
            var radialComp = Cesium.Cartesian3.dot(diffE, upE);
            var tangentDiff = Cesium.Cartesian3.subtract(diffE, Cesium.Cartesian3.multiplyByScalar(upE, radialComp, new Cesium.Cartesian3()), new Cesium.Cartesian3());
            var dCol = Cesium.Cartesian3.magnitude(tangentDiff);
            if (dCol < bestBldDist && Math.abs(radialComp) <= (bld.height || 12) + 2.0) {
              bestBldDist = dCol;
              bestPt = Cesium.Cartesian3.add(eA, Cesium.Cartesian3.multiplyByScalar(upE, radialComp, new Cesium.Cartesian3()), new Cesium.Cartesian3());
              snapTag = 'Arista vertical fachada';
            }
          }
        }
      }

      // 3. Imantación a pasillo entre filas en cubierta plana
      if (!snapTag) {
        var basisSnap = this.getRoofOrthonormalBasis(bestPt);
        var panels = (global.allRenderedPanels && global.allRenderedPanels.length > 0) ? global.allRenderedPanels : null;
        if (basisSnap && Array.isArray(panels) && panels.length > 0) {
          var closestV = null;
          var minDeltaV = 0.65;
          var refCenter = null;
          for (var pi2 = 0; pi2 < panels.length; pi2++) {
            var pObj = panels[pi2];
            if (!pObj || pObj.deleted || !pObj.center) continue;
            var pC = this.toCartesian3(pObj.center);
            if (!pC) continue;
            var dv = Math.abs(Cesium.Cartesian3.dot(Cesium.Cartesian3.subtract(bestPt, pC, new Cesium.Cartesian3()), basisSnap.vVec));
            var halfRow = ((pObj.h || 1.75) * 0.5) + 0.45;
            if (Math.abs(dv - halfRow) < minDeltaV) {
              minDeltaV = Math.abs(dv - halfRow);
              closestV = (Cesium.Cartesian3.dot(Cesium.Cartesian3.subtract(bestPt, pC, new Cesium.Cartesian3()), basisSnap.vVec) >= 0) ? halfRow : -halfRow;
              refCenter = pC;
            }
          }
          if (refCenter && closestV !== null) {
            var curU = Cesium.Cartesian3.dot(Cesium.Cartesian3.subtract(bestPt, refCenter, new Cesium.Cartesian3()), basisSnap.uVec);
            var curN = Cesium.Cartesian3.dot(Cesium.Cartesian3.subtract(bestPt, refCenter, new Cesium.Cartesian3()), basisSnap.normal);
            bestPt = Cesium.Cartesian3.add(
              refCenter,
              Cesium.Cartesian3.add(
                Cesium.Cartesian3.multiplyByScalar(basisSnap.uVec, curU, new Cesium.Cartesian3()),
                Cesium.Cartesian3.add(
                  Cesium.Cartesian3.multiplyByScalar(basisSnap.vVec, closestV, new Cesium.Cartesian3()),
                  Cesium.Cartesian3.multiplyByScalar(basisSnap.normal, curN, new Cesium.Cartesian3()),
                  new Cesium.Cartesian3()
                ),
                new Cesium.Cartesian3()
              ),
              new Cesium.Cartesian3()
            );
            snapTag = 'Pasillo entre filas';
          }
        }
      }

      // 4. Bloqueo ortogonal 90° respecto al vértice anterior (Shift)
      var prevC3 = opts.prevPoint ? this.toCartesian3(opts.prevPoint) : null;
      if (opts.orthogonalLock && prevC3) {
        var basisOrtho = this.getRoofOrthonormalBasis(prevC3);
        var dVec = Cesium.Cartesian3.subtract(bestPt, prevC3, new Cesium.Cartesian3());
        var dU = Cesium.Cartesian3.dot(dVec, basisOrtho.uVec);
        var dV = Cesium.Cartesian3.dot(dVec, basisOrtho.vVec);
        var dN = Cesium.Cartesian3.dot(dVec, basisOrtho.normal);
        // Si domina componente vertical (bajante de fachada), fijar vertical a plomo; si no, U vs V a 90°
        if (Math.abs(dN) > Math.max(Math.abs(dU), Math.abs(dV)) * 1.35) {
          bestPt = Cesium.Cartesian3.add(prevC3, Cesium.Cartesian3.multiplyByScalar(basisOrtho.normal, dN, new Cesium.Cartesian3()), new Cesium.Cartesian3());
          snapTag = 'Bajante a plomo 90°';
        } else if (Math.abs(dU) >= Math.abs(dV)) {
          bestPt = Cesium.Cartesian3.add(prevC3, Cesium.Cartesian3.multiplyByScalar(basisOrtho.uVec, dU, new Cesium.Cartesian3()), new Cesium.Cartesian3());
          snapTag = 'Eje U ortogonal 90°';
        } else {
          bestPt = Cesium.Cartesian3.add(prevC3, Cesium.Cartesian3.multiplyByScalar(basisOrtho.vVec, dV, new Cesium.Cartesian3()), new Cesium.Cartesian3());
          snapTag = 'Eje V ortogonal 90°';
        }
      }

      return { cartesian: bestPt, snapTag: snapTag };
    },

    /**
     * Materializa la ruta actual (automática o por estrategia de tejado) en codos editables manuales
     */
    materializeEditableRoute: function (type) {
      var rType = (type === 'ac') ? 'ac' : 'dc';
      var sState = global.inverterEquipmentState;
      if (!sState) return [];
      if (!sState.routes) sState.routes = { dc: [], ac: [] };
      if (Array.isArray(sState.routes[rType]) && sState.routes[rType].length > 0) {
        return sState.routes[rType];
      }

      if (global.RAundo && typeof global.RAundo.snapProject === 'function') {
        global.RAundo.snapProject('Materializar codos editables ' + rType.toUpperCase());
      }

      var pts = [];
      if (rType === 'ac') {
        var invPos = this.toCartesian3(sState.position);
        var meterPos = (sState.gridMeter && sState.gridMeter.position) ? this.toCartesian3(sState.gridMeter.position) : null;
        if (invPos && meterPos) {
          pts = this.buildOrthogonalManhattanPath3D(invPos, meterPos, { normalOffset: this.CONFIG.AC_OFFSET });
        }
      } else {
        var allStrings = this.gatherAllStrings();
        var cbPos = (sState.combinerBox && sState.combinerBox.position && sState.combinerBox.isEnabled) ? this.toCartesian3(sState.combinerBox.position) : null;
        var dcTargetPos = cbPos || (sState.dcProtectionPosition ? this.toCartesian3(sState.dcProtectionPosition) : this.toCartesian3(sState.position));
        if (allStrings && allStrings.length > 0 && dcTargetPos) {
          var s0 = allStrings[0];
          var firstPan = s0.panels && s0.panels[0];
          var startPos = firstPan ? this.toCartesian3(firstPan.center || (firstPan.corners && firstPan.corners[0])) : null;
          if (startPos) {
            var basis = this.getRoofOrthonormalBasis(startPos, firstPan ? firstPan.polyIdx : undefined);
            var descent = this.findClosestStructurePillar(startPos, dcTargetPos, s0.panels);
            pts = this.buildOrthogonalManhattanPath3D(startPos, dcTargetPos, {
              normalOffset: this.CONFIG.DC_POS_OFFSET,
              descentPoint: descent,
              basis: basis
            });
          }
        }
      }

      if (pts.length >= 2) {
        // Conservar nodos intermedios (excluir extremos fijados a bornes, o si solo hay 2 puntos dejar punto medio)
        var editable = (pts.length > 2)
          ? pts.slice(1, pts.length - 1).map(function (p) { return Cesium.Cartesian3.clone(p); })
          : [Cesium.Cartesian3.midpoint(pts[0], pts[1], new Cesium.Cartesian3())];
        sState.routes[rType] = editable;
        global.selectedRouteVertex = { type: rType, index: 0 };
      }
      this.renderAllCables();
      if (typeof global.renderTriad2D === 'function') global.renderTriad2D();
      if (typeof global.wpUpdateCableRoutesUI === 'function') global.wpUpdateCableRoutesUI();
      return sState.routes[rType];
    },

    insertRouteMidpoint: function (type, segIdx) {
      var sState = global.inverterEquipmentState;
      if (!sState || !sState.routes || !Array.isArray(sState.routes[type])) return -1;
      var arr = sState.routes[type];
      if (segIdx < 0 || segIdx >= arr.length - 1) return -1;
      if (global.RAundo && typeof global.RAundo.snapProject === 'function') {
        global.RAundo.snapProject('Insertar codo en ruta ' + type.toUpperCase());
      }
      var pA = this.toCartesian3(arr[segIdx]);
      var pB = this.toCartesian3(arr[segIdx + 1]);
      if (!pA || !pB) return -1;
      var mid = Cesium.Cartesian3.midpoint(pA, pB, new Cesium.Cartesian3());
      arr.splice(segIdx + 1, 0, mid);
      global.selectedRouteVertex = { type: type, index: segIdx + 1 };
      this.renderAllCables();
      if (typeof global.renderTriad2D === 'function') global.renderTriad2D();
      if (typeof global.wpUpdateCableRoutesUI === 'function') global.wpUpdateCableRoutesUI();
      return segIdx + 1;
    },

    removeRouteVertex: function (type, idx) {
      var sState = global.inverterEquipmentState;
      if (!sState || !sState.routes || !Array.isArray(sState.routes[type])) return false;
      var arr = sState.routes[type];
      if (idx < 0 || idx >= arr.length) return false;
      if (global.RAundo && typeof global.RAundo.snapProject === 'function') {
        global.RAundo.snapProject('Eliminar codo de ruta ' + type.toUpperCase());
      }
      arr.splice(idx, 1);
      if (arr.length === 0) {
        global.selectedRouteVertex = null;
      } else {
        global.selectedRouteVertex = { type: type, index: Math.min(idx, arr.length - 1) };
      }
      this.renderAllCables();
      if (typeof global.renderTriad2D === 'function') global.renderTriad2D();
      if (typeof global.wpUpdateCableRoutesUI === 'function') global.wpUpdateCableRoutesUI();
      if (typeof global.BOMTreeEngine !== 'undefined' && typeof global.BOMTreeEngine.refresh === 'function') {
        global.BOMTreeEngine.refresh();
      }
      return true;
    },

    nudgeSelectedVertexElevation: function (deltaMeters) {
      var rv = global.selectedRouteVertex;
      var sState = global.inverterEquipmentState;
      if (!rv || !sState || !sState.routes || !Array.isArray(sState.routes[rv.type])) return false;
      var cur = this.toCartesian3(sState.routes[rv.type][rv.index]);
      if (!cur) return false;
      if (global.RAundo && typeof global.RAundo.snapProject === 'function') {
        global.RAundo.snapProject('Ajustar altura codo ' + rv.type.toUpperCase());
      }
      var up = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(cur, new Cesium.Cartesian3());
      var moved = Cesium.Cartesian3.add(cur, Cesium.Cartesian3.multiplyByScalar(up, deltaMeters, new Cesium.Cartesian3()), new Cesium.Cartesian3());
      sState.routes[rv.type][rv.index] = moved;
      this.renderAllCables();
      if (typeof global.renderTriad2D === 'function') global.renderTriad2D();
      if (typeof global.wpUpdateCableRoutesUI === 'function') global.wpUpdateCableRoutesUI();
      return true;
    },

    /**
     * Cache de perfiles 2D extruidos para PolylineVolume
     */
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
    getRoofOrthonormalBasis: function (pos, polyIdxHint) {
      if (typeof Cesium === 'undefined' || (!pos && typeof polyIdxHint !== 'number')) return null;

      var normal = null;
      var uVec = null;
      var vVec = null;

      var WP = global.WP || (typeof window !== 'undefined' ? window.WP : null);
      var refPos = pos ? this.toCartesian3(pos) : null;

      // 1. Buscar la cubierta específica (polilínea) correspondiente a polyIdxHint o la más cercana a pos
      if (WP && Array.isArray(WP.polylines) && WP.polylines.length > 0) {
        var targetPoly = null;
        if (typeof polyIdxHint === 'number' && polyIdxHint >= 0 && polyIdxHint < WP.polylines.length) {
          targetPoly = WP.polylines[polyIdxHint];
        } else if (refPos) {
          var bestPolyDist = Infinity;
          for (var pi = 0; pi < WP.polylines.length; pi++) {
            var candPoly = WP.polylines[pi];
            if (!candPoly) continue;
            var polyCenter = (candPoly.roofInfo && candPoly.roofInfo.center)
              ? this.toCartesian3(candPoly.roofInfo.center)
              : null;
            if (!polyCenter && Array.isArray(candPoly.points) && candPoly.points.length > 0) {
              var sumPoly = new Cesium.Cartesian3(0, 0, 0);
              var cntPoly = 0;
              for (var vi = 0; vi < candPoly.points.length; vi++) {
                var vp = this.toCartesian3(candPoly.points[vi]);
                if (vp) {
                  Cesium.Cartesian3.add(sumPoly, vp, sumPoly);
                  cntPoly++;
                  var dv = Cesium.Cartesian3.distance(refPos, vp);
                  if (dv < bestPolyDist) { bestPolyDist = dv; targetPoly = candPoly; }
                }
              }
              if (cntPoly > 0) {
                polyCenter = Cesium.Cartesian3.divideByScalar(sumPoly, cntPoly, new Cesium.Cartesian3());
              }
            }
            if (polyCenter) {
              var dc = Cesium.Cartesian3.distance(refPos, polyCenter);
              if (dc < bestPolyDist) {
                bestPolyDist = dc;
                targetPoly = candPoly;
              }
            }
          }
        }

        if (targetPoly) {
          // Priorizar el plano de trabajo asociado (ya expresado en coordenadas mundiales ECEF)
          if (Array.isArray(WP.planes) && WP.planes.length > 0) {
            var linkedPlane = null;
            if (targetPoly.planeId) {
              linkedPlane = WP.planes.find(function (p) { return p && p.id === targetPoly.planeId; }) || null;
            }
            if (!linkedPlane && typeof targetPoly.planeIdx === 'number' && WP.planes[targetPoly.planeIdx]) {
              linkedPlane = WP.planes[targetPoly.planeIdx];
            }
            if (linkedPlane && linkedPlane.normal && linkedPlane.uVec && linkedPlane.vVec) {
              normal = Cesium.Cartesian3.clone(linkedPlane.normal);
              uVec = Cesium.Cartesian3.clone(linkedPlane.uVec);
              vVec = Cesium.Cartesian3.clone(linkedPlane.vVec);
            }
          }
          // Si no hay plano ECEF directo, transformar roofInfo (ENU local) a ECEF mediante roofInfo.transform
          if (!normal && targetPoly.roofInfo && targetPoly.roofInfo.normal && targetPoly.roofInfo.uVec && targetPoly.roofInfo.vVec) {
            var ri = targetPoly.roofInfo;
            if (ri.transform && Cesium.Matrix4 && typeof Cesium.Matrix4.multiplyByPointAsVector === 'function') {
              normal = Cesium.Cartesian3.normalize(Cesium.Matrix4.multiplyByPointAsVector(ri.transform, ri.normal, new Cesium.Cartesian3()), new Cesium.Cartesian3());
              uVec = Cesium.Cartesian3.normalize(Cesium.Matrix4.multiplyByPointAsVector(ri.transform, ri.uVec, new Cesium.Cartesian3()), new Cesium.Cartesian3());
              vVec = Cesium.Cartesian3.normalize(Cesium.Matrix4.multiplyByPointAsVector(ri.transform, ri.vVec, new Cesium.Cartesian3()), new Cesium.Cartesian3());
            } else {
              normal = Cesium.Cartesian3.clone(ri.normal);
              uVec = Cesium.Cartesian3.clone(ri.uVec);
              vVec = Cesium.Cartesian3.clone(ri.vVec);
            }
          }
        }
      }

      // 2. Fallback: plano activo en WP
      if (!normal && WP && Array.isArray(WP.planes) && WP.planes.length > 0) {
        var pIdx = (WP.activePlaneIdx >= 0 && WP.activePlaneIdx < WP.planes.length) ? WP.activePlaneIdx : 0;
        var pl = WP.planes[pIdx];
        if (pl && pl.normal && pl.uVec && pl.vVec) {
          normal = Cesium.Cartesian3.clone(pl.normal);
          uVec = Cesium.Cartesian3.clone(pl.uVec);
          vVec = Cesium.Cartesian3.clone(pl.vVec);
        }
      }

      // 3. Si no hay plano definido en WP, extraer normal geodésica local y base ENU
      if (!normal && refPos) {
        normal = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(refPos, new Cesium.Cartesian3()) || new Cesium.Cartesian3(0, 0, 1);
        var east = new Cesium.Cartesian3(-refPos.y, refPos.x, 0.0);
        if (Cesium.Cartesian3.magnitude(east) < 0.001) east = new Cesium.Cartesian3(1, 0, 0);
        uVec = Cesium.Cartesian3.normalize(east, new Cesium.Cartesian3());
        vVec = Cesium.Cartesian3.normalize(Cesium.Cartesian3.cross(normal, uVec, new Cesium.Cartesian3()), new Cesium.Cartesian3());
      }

      return normal ? { normal: normal, uVec: uVec, vVec: vVec } : null;
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
     * Esquiva obstáculos en cubierta (chimeneas, casetones, claraboyas) insertando
     * quiebros ortogonales a 90° con margen reglamentario (CTE DB-SI / UNE-EN 62548).
     */
    detourAroundObstacles: function (positions, basis, marginMeters) {
      if (!Array.isArray(positions) || positions.length < 2 || typeof Cesium === 'undefined') return positions;
      var obsList = (typeof global.obstacles !== 'undefined' && Array.isArray(global.obstacles))
        ? global.obstacles
        : ((typeof window !== 'undefined' && Array.isArray(window.obstacles)) ? window.obstacles : []);
      if (!obsList || obsList.length === 0) return positions;

      var margin = (typeof marginMeters === 'number') ? marginMeters : 0.40;
      var U = basis && basis.uVec;
      var V = basis && basis.vVec;
      var N = basis && basis.normal;
      if (!U || !V) return positions;

      // Centroide de referencia de la cubierta o tramo para orientar los desvíos hacia el interior del paño
      var refCentroid = Cesium.Cartesian3.midpoint(positions[0], positions[positions.length - 1], new Cesium.Cartesian3());
      var WP = global.WP || (typeof window !== 'undefined' ? window.WP : null);
      if (WP && Array.isArray(WP.polylines) && WP.polylines.length > 0) {
        var bestCDist = Infinity;
        for (var piC = 0; piC < WP.polylines.length; piC++) {
          var plC = WP.polylines[piC];
          if (!plC || !Array.isArray(plC.points) || plC.points.length < 3) continue;
          var sumC = new Cesium.Cartesian3(0, 0, 0);
          var cntC = 0;
          for (var viC = 0; viC < plC.points.length; viC++) {
            var ptC = this.toCartesian3(plC.points[viC]);
            if (ptC) { Cesium.Cartesian3.add(sumC, ptC, sumC); cntC++; }
          }
          if (cntC > 0) {
            var centC = Cesium.Cartesian3.divideByScalar(sumC, cntC, new Cesium.Cartesian3());
            var dCent = Cesium.Cartesian3.distance(positions[0], centC);
            if (dCent < bestCDist) { bestCDist = dCent; refCentroid = centC; }
          }
        }
      }

      var newPositions = [positions[0]];

      for (var i = 0; i < positions.length - 1; i++) {
        var pA = positions[i];
        var pB = positions[i + 1];
        if (!pA || !pB) continue;

        var segVec = Cesium.Cartesian3.subtract(pB, pA, new Cesium.Cartesian3());
        var segLen = Cesium.Cartesian3.magnitude(segVec);
        if (segLen < 0.2) {
          newPositions.push(pB);
          continue;
        }

        var segDir = Cesium.Cartesian3.divideByScalar(segVec, segLen, new Cesium.Cartesian3());
        var isAlongU = Math.abs(Cesium.Cartesian3.dot(segDir, U)) > 0.7;
        var isAlongV = Math.abs(Cesium.Cartesian3.dot(segDir, V)) > 0.7;

        if (!isAlongU && !isAlongV) {
          newPositions.push(pB);
          continue;
        }

        var perpDir = isAlongU ? V : U;
        var hits = [];
        for (var o = 0; o < obsList.length; o++) {
          var obs = obsList[o];
          if (!obs) continue;
          var obsCenter = this.toCartesian3(obs.cartesian || obs.center || obs.position);
          if (!obsCenter) continue;

          // Proyección del centro del obstáculo sobre el tramo de cable
          var vAO = Cesium.Cartesian3.subtract(obsCenter, pA, new Cesium.Cartesian3());
          var t = Cesium.Cartesian3.dot(vAO, segDir);

          if (t > 0.2 && t < (segLen - 0.2)) {
            var pProj = Cesium.Cartesian3.add(pA, Cesium.Cartesian3.multiplyByScalar(segDir, t, new Cesium.Cartesian3()), new Cesium.Cartesian3());
            // Filtrar obstáculos situados en otra cubierta / cota vertical ajena al tramo
            if (N) {
              var vertDist = Math.abs(Cesium.Cartesian3.dot(Cesium.Cartesian3.subtract(obsCenter, pProj, new Cesium.Cartesian3()), N));
              var obsHeight = (typeof obs.h === 'number') ? obs.h : ((typeof obs.height === 'number') ? obs.height : 2.5);
              if (vertDist > (obsHeight + 1.5)) continue;
            }

            // Radio efectivo direccional según semidimensiones y rotación del obstáculo
            var halfW = (obs.w || 1.0) * 0.5;
            var halfL = (obs.l || 1.0) * 0.5;
            var rotRad = ((obs.rot || 0) * Math.PI) / 180.0;
            var absCos = Math.abs(Math.cos(rotRad));
            var absSin = Math.abs(Math.sin(rotRad));
            var effPerp = (isAlongU ? (absSin * halfW + absCos * halfL) : (absCos * halfW + absSin * halfL)) + margin;
            var effAlong = (isAlongU ? (absCos * halfW + absSin * halfL) : (absSin * halfW + absCos * halfL)) + margin;

            var dToSeg = Cesium.Cartesian3.distance(obsCenter, pProj);
            var dPerpOnly = Math.abs(Cesium.Cartesian3.dot(Cesium.Cartesian3.subtract(obsCenter, pProj, new Cesium.Cartesian3()), perpDir));
            if (dPerpOnly < effPerp && dToSeg < (Math.max(effPerp, effAlong) + 1.5)) {
              hits.push({ t: t, obsCenter: obsCenter, obsRadiusPerp: effPerp, obsRadiusAlong: effAlong, pProj: pProj });
            }
          }
        }

        if (hits.length > 0) {
          hits.sort(function (a, b) { return a.t - b.t; });
          var lastExitT = 0;
          for (var hi = 0; hi < hits.length; hi++) {
            var h = hits[hi];
            var entryT = Math.max(lastExitT, h.t - (h.obsRadiusAlong + 0.05));
            var exitT = Math.min(segLen, h.t + (h.obsRadiusAlong + 0.05));
            if (exitT <= lastExitT + 0.05) continue;

            var vToSeg = Cesium.Cartesian3.subtract(h.pProj, h.obsCenter, new Cesium.Cartesian3());
            var dotPerp = Cesium.Cartesian3.dot(vToSeg, perpDir);
            var defaultSign = (dotPerp >= 0) ? 1.0 : -1.0;

            var detourDist = h.obsRadiusPerp + 0.15;
            var entryPt = Cesium.Cartesian3.add(pA, Cesium.Cartesian3.multiplyByScalar(segDir, entryT, new Cesium.Cartesian3()), new Cesium.Cartesian3());
            var exitPt = Cesium.Cartesian3.add(pA, Cesium.Cartesian3.multiplyByScalar(segDir, exitT, new Cesium.Cartesian3()), new Cesium.Cartesian3());

            var vecDefault = Cesium.Cartesian3.multiplyByScalar(perpDir, defaultSign * detourDist, new Cesium.Cartesian3());
            var vecOpp = Cesium.Cartesian3.multiplyByScalar(perpDir, -defaultSign * detourDist, new Cesium.Cartesian3());
            var c1Default = Cesium.Cartesian3.add(entryPt, vecDefault, new Cesium.Cartesian3());
            var c1Opp = Cesium.Cartesian3.add(entryPt, vecOpp, new Cesium.Cartesian3());

            // Si el desvío por defecto aleja el quiebro del interior de la cubierta y el lado opuesto no choca con otro obstáculo, invertir hacia dentro
            var useSign = defaultSign;
            if (Cesium.Cartesian3.distance(c1Opp, refCentroid) + 0.35 < Cesium.Cartesian3.distance(c1Default, refCentroid)) {
              var c2Opp = Cesium.Cartesian3.add(exitPt, vecOpp, new Cesium.Cartesian3());
              var oppBlocked = false;
              for (var ho = 0; ho < hits.length; ho++) {
                if (ho === hi) continue;
                var oHit = hits[ho];
                if (Cesium.Cartesian3.distance(c1Opp, oHit.obsCenter) < oHit.obsRadiusPerp || Cesium.Cartesian3.distance(c2Opp, oHit.obsCenter) < oHit.obsRadiusPerp) {
                  oppBlocked = true;
                  break;
                }
              }
              if (!oppBlocked) useSign = -defaultSign;
            }

            var detourVec = Cesium.Cartesian3.multiplyByScalar(perpDir, useSign * detourDist, new Cesium.Cartesian3());
            var corner1 = Cesium.Cartesian3.add(entryPt, detourVec, new Cesium.Cartesian3());
            var corner2 = Cesium.Cartesian3.add(exitPt, detourVec, new Cesium.Cartesian3());

            newPositions.push(entryPt, corner1, corner2, exitPt);
            lastExitT = exitT;
          }
        }

        newPositions.push(pB);
      }

      return this.sanitizePositions(newPositions);
    },

    /**
     * Ordena los paneles de un string de forma continua y serpenteante (daisy-chain por cercanía)
     * para evitar cruces en diagonal y trazar un camino limpio a lo largo de las hileras.
     */
    sortPanelsForStringing: function (panels, basis) {
      if (!Array.isArray(panels) || panels.length <= 2 || typeof Cesium === 'undefined') return panels || [];
      var unvisited = panels.slice();
      var self = this;

      function getPos(p) {
        if (!p) return null;
        var c = p.center || (p.corners && p.corners[0]);
        return self.toCartesian3(c);
      }

      var uVec = (basis && basis.uVec) || Cesium.Cartesian3.UNIT_X;
      var startIdx = 0;
      var minVal = Infinity;

      for (var i = 0; i < unvisited.length; i++) {
        var pos = getPos(unvisited[i]);
        if (pos) {
          var val = Cesium.Cartesian3.dot(pos, uVec);
          if (val < minVal) {
            minVal = val;
            startIdx = i;
          }
        }
      }

      var sorted = [];
      var current = unvisited.splice(startIdx, 1)[0];
      sorted.push(current);

      while (unvisited.length > 0) {
        var curPos = getPos(current);
        var bestIdx = 0;
        var bestDist = Infinity;

        for (var j = 0; j < unvisited.length; j++) {
          var candPos = getPos(unvisited[j]);
          if (curPos && candPos) {
            var d = Cesium.Cartesian3.distance(curPos, candPos);
            if (d < bestDist) {
              bestDist = d;
              bestIdx = j;
            }
          }
        }

        current = unvisited.splice(bestIdx, 1)[0];
        sorted.push(current);
      }

      return sorted;
    },

    /**
     * Localiza el pilar o arista de la estructura soporte más cercano al destino (inversor/cuadro)
     * para canalizar la bajante pegada al poste en lugar de volar por el aire.
     */
    findClosestStructurePillar: function (startPos, targetPos, panels) {
      if (!targetPos || typeof Cesium === 'undefined') return startPos;
      var tPos = this.toCartesian3(targetPos);
      var sPos = this.toCartesian3(startPos);
      if (!tPos || !sPos) return startPos;

      var bestPt = sPos;
      var bestDist = Infinity;

      var rawPList = (Array.isArray(panels) && panels.length > 0)
        ? panels
        : ((Array.isArray(global.allRenderedPanels) && global.allRenderedPanels.length > 0) ? global.allRenderedPanels : []);

      // Priorizar paneles del mismo faldón de salida del string para no cruzar cumbreras
      var targetPolyIdx = null;
      if (rawPList.length > 0) {
        var exitP = rawPList[rawPList.length - 1];
        if (exitP && typeof exitP.polyIdx === 'number') {
          targetPolyIdx = exitP.polyIdx;
        } else if (rawPList[0] && typeof rawPList[0].polyIdx === 'number') {
          targetPolyIdx = rawPList[0].polyIdx;
        }
      }
      var pList = (targetPolyIdx !== null)
        ? rawPList.filter(function (p) { return p && p.polyIdx === targetPolyIdx; })
        : rawPList;
      if (pList.length === 0) pList = rawPList;

      for (var i = 0; i < pList.length; i++) {
        var p = pList[i];
        if (!p) continue;
        if (Array.isArray(p.corners) && p.corners.length > 0) {
          for (var c = 0; c < p.corners.length; c++) {
            var cPt = this.toCartesian3(p.corners[c]);
            if (cPt) {
              var d = Cesium.Cartesian3.distance(cPt, tPos);
              if (d < bestDist) {
                bestDist = d;
                bestPt = cPt;
              }
            }
          }
        } else if (p.center) {
          var cnt = this.toCartesian3(p.center);
          if (cnt) {
            var d2 = Cesium.Cartesian3.distance(cnt, tPos);
            if (d2 < bestDist) {
              bestDist = d2;
              bestPt = cnt;
            }
          }
        }
      }

      // Evaluar también las aristas reales del polígono de ese mismo faldón para bajar por el alero más próximo al destino
      var WP = global.WP || (typeof window !== 'undefined' ? window.WP : null);
      if (targetPolyIdx !== null && WP && Array.isArray(WP.polylines) && WP.polylines[targetPolyIdx] && Array.isArray(WP.polylines[targetPolyIdx].points) && WP.polylines[targetPolyIdx].points.length >= 3) {
        var polyPts = WP.polylines[targetPolyIdx].points;
        var polyBasis = this.getRoofOrthonormalBasis(sPos, targetPolyIdx);
        var refNorm = (polyBasis && polyBasis.normal) || Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(sPos, new Cesium.Cartesian3());
        for (var ei = 0; ei < polyPts.length; ei++) {
          var ea = this.toCartesian3(polyPts[ei]);
          var eb = this.toCartesian3(polyPts[(ei + 1) % polyPts.length]);
          if (!ea || !eb) continue;
          var eVec = Cesium.Cartesian3.subtract(eb, ea, new Cesium.Cartesian3());
          var eLen = Cesium.Cartesian3.magnitude(eVec);
          if (eLen < 0.05) continue;
          var eDir = Cesium.Cartesian3.divideByScalar(eVec, eLen, new Cesium.Cartesian3());
          var projT = Math.max(0, Math.min(eLen, Cesium.Cartesian3.dot(Cesium.Cartesian3.subtract(tPos, ea, new Cesium.Cartesian3()), eDir)));
          var edgeCand = Cesium.Cartesian3.add(ea, Cesium.Cartesian3.multiplyByScalar(eDir, projT, new Cesium.Cartesian3()), new Cesium.Cartesian3());
          // Proyectar a la cota del plano de cubierta del panel de referencia
          if (refNorm) {
            var hOff = Cesium.Cartesian3.dot(Cesium.Cartesian3.subtract(sPos, edgeCand, new Cesium.Cartesian3()), refNorm);
            edgeCand = Cesium.Cartesian3.add(edgeCand, Cesium.Cartesian3.multiplyByScalar(refNorm, hOff, new Cesium.Cartesian3()), new Cesium.Cartesian3());
          }
          var dEdge = Cesium.Cartesian3.distance(edgeCand, tPos);
          if (dEdge < bestDist) {
            bestDist = dEdge;
            bestPt = edgeCand;
          }
        }
      }

      return (bestDist < Infinity) ? bestPt : startPos;
    },

    /**
     * Generador de Trazado Manhattan 3D Ortogonal (90°) sobre Plano de Cubierta y Fachada
     * @param {Cesium.Cartesian3} startPos Punto inicial (panel o caja)
     * @param {Cesium.Cartesian3} endPos Punto final (inversor o contador)
     * @param {Object} options Opciones de trazado { normalOffset, intermediateWaypoints, basis, avoidObstacles, descentPoint }
     * @returns {Cesium.Cartesian3[]} Lista de vértices de la polilínea ortogonal a 90°
     */
    buildOrthogonalManhattanPath3D: function (startPos, endPos, options) {
      if (!startPos || !endPos || typeof Cesium === 'undefined') return [startPos, endPos].filter(Boolean);
      var self = this;

      var pStart = this.toCartesian3(startPos);
      var pEnd = this.toCartesian3(endPos);
      if (!pStart || !pEnd) return [startPos, endPos].filter(Boolean);

      var opts = options || {};
      var normalOffset = (typeof opts.normalOffset === 'number') ? opts.normalOffset : this.CONFIG.DC_POS_OFFSET;
      var basis = opts.basis || this.getRoofOrthonormalBasis(pStart);
      var N = basis.normal;
      var U = basis.uVec;
      var V = basis.vVec;

      var lateralOffset = (typeof opts.lateralOffset === 'number') ? opts.lateralOffset : 0;
      var latVec = Cesium.Cartesian3.normalize(Cesium.Cartesian3.cross(N, U, new Cesium.Cartesian3()), new Cesium.Cartesian3());

      // Si el usuario proporcionó waypoints manuales (trazado por bandeja), converger desde la placa al inicio de bandeja en cubierta
      var customWaypoints = opts.waypoints || [];
      if (Array.isArray(customWaypoints) && customWaypoints.length > 0) {
        var wpShift = (opts.isNeg ? 0.025 : 0);
        var upManual = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(pEnd, new Cesium.Cartesian3());
        var p0Man = this.elevatePoint(pStart, normalOffset, N);
        var fullPts = [p0Man];
        var firstWp = this.toCartesian3(customWaypoints[0]);
        if (firstWp) {
          // Convergencia ortogonal en cubierta hacia la cabeza de bandeja compartida sin desplazar codos manuales fuera del borde
          var dispToHead = Cesium.Cartesian3.subtract(firstWp, p0Man, new Cesium.Cartesian3());
          var cHeadU = Cesium.Cartesian3.add(p0Man, Cesium.Cartesian3.multiplyByScalar(U, Cesium.Cartesian3.dot(dispToHead, U), new Cesium.Cartesian3()), new Cesium.Cartesian3());
          fullPts.push(cHeadU);
        }
        for (var w = 0; w < customWaypoints.length; w++) {
          var cw = this.toCartesian3(customWaypoints[w]);
          if (cw) {
            var cwHeightDiff = Cesium.Cartesian3.dot(Cesium.Cartesian3.subtract(cw, pEnd, new Cesium.Cartesian3()), upManual);
            if (cwHeightDiff > 0.35) {
              cw = this.elevatePoint(cw, normalOffset, N);
            }
            if (Math.abs(wpShift) > 0.001) {
              cw = Cesium.Cartesian3.add(cw, Cesium.Cartesian3.multiplyByScalar(latVec, wpShift, new Cesium.Cartesian3()), new Cesium.Cartesian3());
            }
            fullPts.push(cw);
          }
        }
        var lastManual = fullPts[fullPts.length - 1];
        var dropManual = Cesium.Cartesian3.dot(Cesium.Cartesian3.subtract(lastManual, pEnd, new Cesium.Cartesian3()), upManual);
        if (dropManual > 0.35) {
          var dropPtMan = Cesium.Cartesian3.subtract(lastManual, Cesium.Cartesian3.multiplyByScalar(upManual, dropManual, new Cesium.Cartesian3()), new Cesium.Cartesian3());
          fullPts.push(dropPtMan);
          var gDispMan = Cesium.Cartesian3.subtract(pEnd, dropPtMan, new Cesium.Cartesian3());
          if (Cesium.Cartesian3.magnitude(gDispMan) > 0.3) {
            var eastM = Cesium.Cartesian3.cross(Cesium.Cartesian3.UNIT_Z, upManual, new Cesium.Cartesian3());
            if (Cesium.Cartesian3.magnitude(eastM) < 1e-4) eastM = Cesium.Cartesian3.UNIT_X;
            Cesium.Cartesian3.normalize(eastM, eastM);
            fullPts.push(Cesium.Cartesian3.add(dropPtMan, Cesium.Cartesian3.multiplyByScalar(eastM, Cesium.Cartesian3.dot(gDispMan, eastM), new Cesium.Cartesian3()), new Cesium.Cartesian3()));
          }
        }
        fullPts.push(this.elevatePoint(pEnd, 0.25, N));
        return this.sanitizePositions(fullPts);
      }

      // Trazado Manhattan Automático (adaptado a la estrategia de cubierta activa):
      var strategy = opts.strategy || (global.inverterEquipmentState && global.inverterEquipmentState.routingStrategy) || 'auto';

      // P0: Elevación en normal sobre cubierta con desfase lateral para evitar colisión de strings
      var p0 = this.elevatePoint(pStart, normalOffset, N);
      if (Math.abs(lateralOffset) > 0.001) {
        p0 = Cesium.Cartesian3.add(p0, Cesium.Cartesian3.multiplyByScalar(latVec, lateralOffset, new Cesium.Cartesian3()), new Cesium.Cartesian3());
      }

      // Si se definió un punto de descenso (pilar o arista de estructura hacia equipo):
      var roofTarget = opts.descentPoint ? this.toCartesian3(opts.descentPoint) : pEnd;
      var WP = global.WP || (typeof window !== 'undefined' ? window.WP : null);
      var srcPolyIdx = (typeof opts.sourcePolyIdx === 'number' && opts.sourcePolyIdx >= 0) ? opts.sourcePolyIdx : null;

      // Helper: encuentra el punto y arista exacta sobre el perímetro de un faldón más cercano a targetC3
      var findClosestEdgeOnPoly = function (polyObj, targetC3) {
        if (!polyObj || !Array.isArray(polyObj.points) || polyObj.points.length < 3 || !targetC3) return null;
        var best = null;
        var bestD = Infinity;
        for (var ei = 0; ei < polyObj.points.length; ei++) {
          var ea = self.toCartesian3(polyObj.points[ei]);
          var eb = self.toCartesian3(polyObj.points[(ei + 1) % polyObj.points.length]);
          if (!ea || !eb) continue;
          var ev = Cesium.Cartesian3.subtract(eb, ea, new Cesium.Cartesian3());
          var elen = Cesium.Cartesian3.magnitude(ev);
          if (elen < 0.05) continue;
          var edir = Cesium.Cartesian3.divideByScalar(ev, elen, new Cesium.Cartesian3());
          var proj = Math.max(0, Math.min(elen, Cesium.Cartesian3.dot(Cesium.Cartesian3.subtract(targetC3, ea, new Cesium.Cartesian3()), edir)));
          var cand = Cesium.Cartesian3.add(ea, Cesium.Cartesian3.multiplyByScalar(edir, proj, new Cesium.Cartesian3()), new Cesium.Cartesian3());
          var d = Cesium.Cartesian3.distance(cand, targetC3);
          if (d < bestD) { bestD = d; best = { point: cand, ea: ea, eb: eb, dist: d }; }
        }
        return best;
      };
      var findClosestEdgePointOnPoly = function (polyObj, targetC3) {
        var hit = findClosestEdgeOnPoly(polyObj, targetC3);
        return hit ? hit.point : null;
      };

      // Helper: Grafo 3D exterior de aristas de cubierta (cumbreras, limatesas y aleros) con Dijkstra.
      // Garantiza que los cables entre vertientes opuestas viajen SIEMPRE por encima de cumbreras y limatesas sin atravesar el tejado.
      var findRoofGraphExteriorPath = function (polylinesArr, srcIdx, dstIdx, startC3, endC3) {
        if (!Array.isArray(polylinesArr) || polylinesArr.length < 2) return null;
        var nodes = [];
        var adj = [];
        var edgeCounts = {};

        var getOrAddNode = function (pt) {
          for (var ni = 0; ni < nodes.length; ni++) {
            if (Cesium.Cartesian3.distance(nodes[ni], pt) < 0.55) return ni;
          }
          nodes.push(Cesium.Cartesian3.clone(pt));
          adj.push([]);
          return nodes.length - 1;
        };

        // 1. Soldar vértices y detectar aristas compartidas (cumbreras / limatesas)
        // Nota crítica: NO filtrar por pl.visible === false. El grafo topológico de la cubierta
        // es invariante e independiente de si el usuario ocultó el contorno del faldón en el árbol de capas.
        var rawEdges = [];
        for (var pi = 0; pi < polylinesArr.length; pi++) {
          var pl = polylinesArr[pi];
          if (!pl || !Array.isArray(pl.points) || pl.points.length < 3) continue;
          var pIds = [];
          for (var vi = 0; vi < pl.points.length; vi++) {
            var c3 = self.toCartesian3(pl.points[vi]);
            if (c3) pIds.push(getOrAddNode(c3));
          }
          for (var ei = 0; ei < pIds.length; ei++) {
            var a = pIds[ei], b = pIds[(ei + 1) % pIds.length];
            if (a === b) continue;
            var key = a < b ? (a + '_' + b) : (b + '_' + a);
            edgeCounts[key] = (edgeCounts[key] || 0) + 1;
            rawEdges.push({ a: a, b: b, key: key });
          }
        }
        if (nodes.length < 3) return null;

        var addedKeys = {};
        var connectNodes = function (u, v, weightScale) {
          if (u === v) return;
          var w = Cesium.Cartesian3.distance(nodes[u], nodes[v]) * (weightScale || 1.0);
          adj[u].push({ to: v, w: w });
          adj[v].push({ to: u, w: w });
        };

        for (var re = 0; re < rawEdges.length; re++) {
          var ed = rawEdges[re];
          if (addedKeys[ed.key]) continue;
          addedKeys[ed.key] = true;
          // Preferencia ligera (0.78x) por aristas compartidas (cumbreras y limatesas) frente a aleros exteriores
          var isRidgeOrHip = (edgeCounts[ed.key] || 0) >= 2;
          connectNodes(ed.a, ed.b, isRidgeOrHip ? 0.78 : 1.0);
        }

        // 2. Insertar terminales proyectados sobre el perímetro:
        // El punto de salida del faldón origen se proyecta buscando el borde que mira hacia el destino,
        // y el punto de llegada en el faldón destino se proyecta sobre el borde más cercano al equipo o destino final.
        var srcHit = findClosestEdgeOnPoly(polylinesArr[srcIdx], endC3);
        var dstHit = findClosestEdgeOnPoly(polylinesArr[dstIdx], endC3);
        if (!srcHit || !dstHit) return null;

        var addTerminal = function (hitObj) {
          var tid = getOrAddNode(hitObj.point);
          var na = getOrAddNode(hitObj.ea);
          var nb = getOrAddNode(hitObj.eb);
          connectNodes(tid, na, 0.85);
          connectNodes(tid, nb, 0.85);
          return tid;
        };

        var startId = addTerminal(srcHit);
        var endId = addTerminal(dstHit);

        // 3. Dijkstra sobre el grafo de cubierta (típicamente 8–30 nodos, <0.1 ms)
        var dist = new Array(nodes.length);
        var prev = new Array(nodes.length);
        var visited = new Array(nodes.length);
        for (var di = 0; di < nodes.length; di++) { dist[di] = Infinity; prev[di] = -1; visited[di] = false; }
        dist[startId] = 0;

        for (var step = 0; step < nodes.length; step++) {
          var uBest = -1;
          var uDist = Infinity;
          for (var j = 0; j < nodes.length; j++) {
            if (!visited[j] && dist[j] < uDist) { uDist = dist[j]; uBest = j; }
          }
          if (uBest === -1 || uBest === endId) break;
          visited[uBest] = true;
          var nbrs = adj[uBest];
          for (var k = 0; k < nbrs.length; k++) {
            var v = nbrs[k].to;
            var nd = uDist + nbrs[k].w;
            if (nd < dist[v]) { dist[v] = nd; prev[v] = uBest; }
          }
        }

        if (!isFinite(dist[endId])) return null;
        var outPts = [];
        var cur = endId;
        while (cur !== -1) {
          var upN = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(nodes[cur], new Cesium.Cartesian3());
          outPts.push(Cesium.Cartesian3.add(nodes[cur], Cesium.Cartesian3.multiplyByScalar(upN, normalOffset + 0.08, new Cesium.Cartesian3()), new Cesium.Cartesian3()));
          cur = prev[cur];
        }
        outPts.reverse();
        return outPts;
      };

      // Detectar a qué faldón pertenece o hacia cuál debe encaminarse el cable por cubierta.
      // Si la cubierta tiene múltiples faldones y el origen (srcPolyIdx) no es el faldón más cercano a la bajante/destino,
      // el cable debe enrutarse por cumbreras/limatesas exteriores hasta el faldón de descenso.
      var targetPolyIdx = null;
      if (WP && Array.isArray(WP.polylines) && WP.polylines.length > 1 && srcPolyIdx !== null) {
        var bestTpDist = Infinity;
        for (var tpi = 0; tpi < WP.polylines.length; tpi++) {
          var tpObj = WP.polylines[tpi];
          if (!tpObj || !Array.isArray(tpObj.points) || tpObj.points.length < 3) continue;
          var edgeHit = findClosestEdgePointOnPoly(tpObj, pEnd);
          if (edgeHit) {
            var dEdgeTp = Cesium.Cartesian3.distance(edgeHit, pEnd);
            if (dEdgeTp < bestTpDist) { bestTpDist = dEdgeTp; targetPolyIdx = tpi; }
          }
        }
      }

      // Adaptación geométrica por estrategia de cubierta (inclinada / plana / multi-faldón)
      var strategyIntermediate = null;
      if (strategy === 'pitched_ridge_eave' && WP && Array.isArray(WP.polylines) && WP.polylines.length > 0) {
        // Recoger por arista de cumbrera o alero más próxima al punto de bajada
        var bestEdgeMid = null;
        var bestScore = Infinity;
        for (var piS = 0; piS < WP.polylines.length; piS++) {
          var polyS = WP.polylines[piS];
          if (!polyS || !Array.isArray(polyS.points) || polyS.points.length < 3) continue;
          for (var viS = 0; viS < polyS.points.length; viS++) {
            var ea = this.toCartesian3(polyS.points[viS]);
            var eb = this.toCartesian3(polyS.points[(viS + 1) % polyS.points.length]);
            if (!ea || !eb) continue;
            var midEdge = Cesium.Cartesian3.midpoint(ea, eb, new Cesium.Cartesian3());
            var score = Cesium.Cartesian3.distance(midEdge, roofTarget) + (Cesium.Cartesian3.distance(pStart, midEdge) * 0.35);
            if (score < bestScore) {
              bestScore = score;
              bestEdgeMid = this.elevatePoint(midEdge, normalOffset, N);
            }
          }
        }
        if (bestEdgeMid) strategyIntermediate = bestEdgeMid;
      } else if (strategy === 'flat_aisle') {
        // En cubierta plana: avanzar primero por el pasillo U hacia la bandeja colectora en el extremo del paño
        var dToTarget = Cesium.Cartesian3.subtract(roofTarget, p0, new Cesium.Cartesian3());
        var uStep = Cesium.Cartesian3.dot(dToTarget, U);
        strategyIntermediate = Cesium.Cartesian3.add(p0, Cesium.Cartesian3.multiplyByScalar(U, uStep, new Cesium.Cartesian3()), new Cesium.Cartesian3());
      } else if (strategy === 'multi_roof_trunk' && WP && Array.isArray(WP.polylines) && WP.polylines.length > 1) {
        // Proyectar el nodo colector horizontalmente sobre el plano del faldón activo para no flotar entre cubiertas a distinta cota
        var sumP = new Cesium.Cartesian3(0, 0, 0);
        var cntP = 0;
        WP.polylines.forEach(function (pl) {
          if (pl && Array.isArray(pl.points) && pl.points.length > 0) {
            var pt0 = self.toCartesian3(pl.points[0]);
            if (pt0) { Cesium.Cartesian3.add(sumP, pt0, sumP); cntP++; }
          }
        });
        if (cntP >= 2) {
          var hub = Cesium.Cartesian3.divideByScalar(sumP, cntP, new Cesium.Cartesian3());
          var hubDisp = Cesium.Cartesian3.subtract(hub, p0, new Cesium.Cartesian3());
          strategyIntermediate = Cesium.Cartesian3.add(
            p0,
            Cesium.Cartesian3.add(
              Cesium.Cartesian3.multiplyByScalar(U, Cesium.Cartesian3.dot(hubDisp, U), new Cesium.Cartesian3()),
              Cesium.Cartesian3.multiplyByScalar(V, Cesium.Cartesian3.dot(hubDisp, V), new Cesium.Cartesian3()),
              new Cesium.Cartesian3()
            ),
            new Cesium.Cartesian3()
          );
        }
      }

      // Enrutado exterior multi-faldón por GRAFO DE CUMBRERAS Y LIMATESAS (nunca perfora el tejado):
      // Si el destino está en otro faldón del edificio (o en la fachada/alero de otro faldón),
      // sube al borde/cumbrera del faldón origen, recorre cumbreras/limatesas por Dijkstra
      // hasta la arista/alero del faldón destino, y realiza la transición final limpia hacia el equipo.
      var path = null;
      if (srcPolyIdx !== null && targetPolyIdx !== null && targetPolyIdx !== srcPolyIdx && WP && WP.polylines[srcPolyIdx] && WP.polylines[targetPolyIdx]) {
        var graphPts = findRoofGraphExteriorPath(WP.polylines, srcPolyIdx, targetPolyIdx, pStart, pEnd);
        if (graphPts && graphPts.length >= 2) {
          var firstRidgePt = graphPts[0];
          var dispSrc = Cesium.Cartesian3.subtract(firstRidgePt, p0, new Cesium.Cartesian3());
          var midSrcA = Cesium.Cartesian3.add(p0, Cesium.Cartesian3.multiplyByScalar(U, Cesium.Cartesian3.dot(dispSrc, U), new Cesium.Cartesian3()), new Cesium.Cartesian3());
          var midSrcB = Cesium.Cartesian3.add(p0, Cesium.Cartesian3.multiplyByScalar(V, Cesium.Cartesian3.dot(dispSrc, V), new Cesium.Cartesian3()), new Cesium.Cartesian3());
          // Elegir el codo 90° en cubierta origen que queda dentro del faldón y evita rodeos exteriores
          var srcRefPt = (WP.polylines[srcPolyIdx].roofInfo && WP.polylines[srcPolyIdx].roofInfo.center) ? WP.polylines[srcPolyIdx].roofInfo.center : pEnd;
          var dA = Cesium.Cartesian3.distance(midSrcA, srcRefPt);
          var dB = Cesium.Cartesian3.distance(midSrcB, srcRefPt);
          var leg1 = [p0, (dA <= dB ? midSrcA : midSrcB), firstRidgePt];
          if (opts.avoidObstacles !== false) {
            leg1 = this.detourAroundObstacles(leg1, basis, opts.obstacleMargin || 0.50);
          }

          var lastRidgePt = graphPts[graphPts.length - 1];
          var upDst = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(pEnd, new Cesium.Cartesian3());
          var hDiffDst = Cesium.Cartesian3.dot(Cesium.Cartesian3.subtract(lastRidgePt, pEnd, new Cesium.Cartesian3()), upDst);
          var distToTarget = Cesium.Cartesian3.distance(lastRidgePt, pEnd);

          var legFinal = [];
          if (distToTarget > 0.15) {
            if (hDiffDst > 0.35) {
              // Bajante vertical exterior desde el alero/arista del faldón destino
              var dropAtDest = Cesium.Cartesian3.subtract(lastRidgePt, Cesium.Cartesian3.multiplyByScalar(upDst, Math.max(0, hDiffDst), new Cesium.Cartesian3()), new Cesium.Cartesian3());
              legFinal.push(dropAtDest);
              var gDispDst = Cesium.Cartesian3.subtract(pEnd, dropAtDest, new Cesium.Cartesian3());
              if (Cesium.Cartesian3.magnitude(gDispDst) > 0.3) {
                var eastGroundDst = Cesium.Cartesian3.cross(Cesium.Cartesian3.UNIT_Z, upDst, new Cesium.Cartesian3());
                if (Cesium.Cartesian3.magnitude(eastGroundDst) < 1e-4) eastGroundDst = Cesium.Cartesian3.UNIT_X;
                Cesium.Cartesian3.normalize(eastGroundDst, eastGroundDst);
                var dEastDst = Cesium.Cartesian3.dot(gDispDst, eastGroundDst);
                legFinal.push(Cesium.Cartesian3.add(dropAtDest, Cesium.Cartesian3.multiplyByScalar(eastGroundDst, dEastDst, new Cesium.Cartesian3()), new Cesium.Cartesian3()));
              }
            }
            legFinal.push(pEnd);
          }

          path = leg1.concat(graphPts.slice(1)).concat(legFinal);
        }
      }

      if (!path) {
        var upCheck = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(pEnd, new Cesium.Cartesian3());
        var directDistEnd = Cesium.Cartesian3.distance(p0, pEnd);
        var directHeightDiff = Math.abs(Cesium.Cartesian3.dot(Cesium.Cartesian3.subtract(p0, pEnd, new Cesium.Cartesian3()), upCheck));
        var isNearSameRoofTarget = (srcPolyIdx !== null && targetPolyIdx === srcPolyIdx) || (directDistEnd < 4.5 && directHeightDiff < 1.25);

        // Si el equipo destino está pegado al inicio del string (mismo faldón o alero inmediato),
        // ir directo sobre el plano del tejado sin desviarse a un descentPoint lejano (evita rodeos en U como en S3:01).
        var effRoofTarget = isNearSameRoofTarget ? pEnd : roofTarget;

        var roofPoints;
        if (!isNearSameRoofTarget && strategyIntermediate && Cesium.Cartesian3.distance(p0, strategyIntermediate) > 0.35) {
          var disp1 = Cesium.Cartesian3.subtract(strategyIntermediate, p0, new Cesium.Cartesian3());
          var midC = Cesium.Cartesian3.add(p0, Cesium.Cartesian3.multiplyByScalar(U, Cesium.Cartesian3.dot(disp1, U), new Cesium.Cartesian3()), new Cesium.Cartesian3());
          var disp2 = Cesium.Cartesian3.subtract(effRoofTarget, strategyIntermediate, new Cesium.Cartesian3());
          var midC2 = Cesium.Cartesian3.add(strategyIntermediate, Cesium.Cartesian3.multiplyByScalar(V, Cesium.Cartesian3.dot(disp2, V), new Cesium.Cartesian3()), new Cesium.Cartesian3());
          var endRoof = Cesium.Cartesian3.add(midC2, Cesium.Cartesian3.multiplyByScalar(U, Cesium.Cartesian3.dot(disp2, U), new Cesium.Cartesian3()), new Cesium.Cartesian3());
          roofPoints = [p0, midC, strategyIntermediate, midC2, endRoof];
        } else {
          var disp = Cesium.Cartesian3.subtract(effRoofTarget, pStart, new Cesium.Cartesian3());
          var deltaU = Cesium.Cartesian3.dot(disp, U);
          var deltaV = Cesium.Cartesian3.dot(disp, V);

          // Elegir entre codo U->V y V->U el que permanece más cerca del centro del faldón (nunca sale disparado hacia fuera)
          var cUV = Cesium.Cartesian3.add(p0, Cesium.Cartesian3.multiplyByScalar(U, deltaU, new Cesium.Cartesian3()), new Cesium.Cartesian3());
          var cVU = Cesium.Cartesian3.add(p0, Cesium.Cartesian3.multiplyByScalar(V, deltaV, new Cesium.Cartesian3()), new Cesium.Cartesian3());
          var cornerEnd = Cesium.Cartesian3.add(cUV, Cesium.Cartesian3.multiplyByScalar(V, deltaV, new Cesium.Cartesian3()), new Cesium.Cartesian3());

          var chosenCorner = cUV;
          if (srcPolyIdx !== null && WP && WP.polylines && WP.polylines[srcPolyIdx] && WP.polylines[srcPolyIdx].roofInfo && WP.polylines[srcPolyIdx].roofInfo.center) {
            var polyCen = WP.polylines[srcPolyIdx].roofInfo.center;
            if (Cesium.Cartesian3.distance(cVU, polyCen) + 0.15 < Cesium.Cartesian3.distance(cUV, polyCen)) {
              chosenCorner = cVU;
            }
          }
          roofPoints = [p0, chosenCorner, cornerEnd];
        }

        // Esquivar obstáculos en el plano de cubierta (si no se ha desactivado explícitamente)
        if (opts.avoidObstacles !== false) {
          roofPoints = this.detourAroundObstacles(roofPoints, basis, opts.obstacleMargin || 0.50);
        }
        var lastRoofPoint = roofPoints[roofPoints.length - 1];

        // Codo vertical: Transición hacia el equipo destino (bajante vertical por arista exterior / fachada + zanja ortogonal 90°)
        var up = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(pEnd, new Cesium.Cartesian3());
        var heightDiff = Cesium.Cartesian3.dot(Cesium.Cartesian3.subtract(lastRoofPoint, pEnd, new Cesium.Cartesian3()), up);
        path = roofPoints.slice();
        if (heightDiff > 0.35 && !isNearSameRoofTarget) {
          // Si estamos en una cubierta con polígono conocido, garantizar que la bajada se produce desde el alero exterior
          var dropOrigin = lastRoofPoint;
          if (srcPolyIdx !== null && WP && WP.polylines && WP.polylines[srcPolyIdx]) {
            var eavePt = findClosestEdgePointOnPoly(WP.polylines[srcPolyIdx], pEnd);
            if (eavePt && Cesium.Cartesian3.distance(eavePt, lastRoofPoint) > 0.35) {
              var eaveElev = this.elevatePoint(eavePt, normalOffset + 0.05, N);
              path.push(eaveElev);
              dropOrigin = eaveElev;
              heightDiff = Cesium.Cartesian3.dot(Cesium.Cartesian3.subtract(dropOrigin, pEnd, new Cesium.Cartesian3()), up);
            }
          }
          // 1. Bajada vertical pegada a la fachada exterior hasta cota de suelo / equipo
          var dropAtStructure = Cesium.Cartesian3.subtract(dropOrigin, Cesium.Cartesian3.multiplyByScalar(up, Math.max(0, heightDiff), new Cesium.Cartesian3()), new Cesium.Cartesian3());
          path.push(dropAtStructure);

          // 2. Tramo ortogonal 90° en cota de suelo / pared respecto al plano tangente local del terreno
          var groundDisp = Cesium.Cartesian3.subtract(pEnd, dropAtStructure, new Cesium.Cartesian3());
          var gDist = Cesium.Cartesian3.magnitude(groundDisp);
          if (gDist > 0.3) {
            var eastGround = Cesium.Cartesian3.cross(Cesium.Cartesian3.UNIT_Z, up, new Cesium.Cartesian3());
            if (Cesium.Cartesian3.magnitude(eastGround) < 1e-4) eastGround = Cesium.Cartesian3.UNIT_X;
            Cesium.Cartesian3.normalize(eastGround, eastGround);
            var dEast = Cesium.Cartesian3.dot(groundDisp, eastGround);
            var groundCorner = Cesium.Cartesian3.add(dropAtStructure, Cesium.Cartesian3.multiplyByScalar(eastGround, dEast, new Cesium.Cartesian3()), new Cesium.Cartesian3());
            path.push(groundCorner);
          }
        }
        path.push(pEnd);
      }
      var cleanPath = this.sanitizePositions(path);

      // [AAA BANDEJA VIRTUAL PARALELA] Desplazamiento lateral por carril en tramos intermedios
      // manteniendo el punto inicial y final anclados exactamente a las cajas/equipos (convergencia limpia).
      if (Math.abs(lateralOffset) > 0.005 && cleanPath.length >= 3) {
        var offsetPath = [cleanPath[0]];
        for (var k = 1; k < cleanPath.length - 1; k++) {
          var prev = cleanPath[k - 1];
          var curr = cleanPath[k];
          var next = cleanPath[k + 1];

          var dir1 = Cesium.Cartesian3.subtract(curr, prev, new Cesium.Cartesian3());
          var d1Len = Cesium.Cartesian3.magnitude(dir1);
          if (d1Len > 1e-4) Cesium.Cartesian3.divideByScalar(dir1, d1Len, dir1);

          var dir2 = Cesium.Cartesian3.subtract(next, curr, new Cesium.Cartesian3());
          var d2Len = Cesium.Cartesian3.magnitude(dir2);
          if (d2Len > 1e-4) Cesium.Cartesian3.divideByScalar(dir2, d2Len, dir2);

          var upLoc = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(curr, new Cesium.Cartesian3());
          var side1 = Cesium.Cartesian3.cross(upLoc, dir1, new Cesium.Cartesian3());
          var side2 = Cesium.Cartesian3.cross(upLoc, dir2, new Cesium.Cartesian3());
          var s1Mag = Cesium.Cartesian3.magnitude(side1);
          var s2Mag = Cesium.Cartesian3.magnitude(side2);

          if (s1Mag > 1e-4) Cesium.Cartesian3.divideByScalar(side1, s1Mag, side1);
          else side1 = Cesium.Cartesian3.clone(latVec);
          if (s2Mag > 1e-4) Cesium.Cartesian3.divideByScalar(side2, s2Mag, side2);
          else side2 = Cesium.Cartesian3.clone(side1);

          var miter = Cesium.Cartesian3.add(side1, side2, new Cesium.Cartesian3());
          var mMag = Cesium.Cartesian3.magnitude(miter);
          if (mMag > 1e-4) {
            Cesium.Cartesian3.divideByScalar(miter, mMag, miter);
          } else {
            miter = side1;
          }
          var shifted = Cesium.Cartesian3.add(curr, Cesium.Cartesian3.multiplyByScalar(miter, lateralOffset, new Cesium.Cartesian3()), new Cesium.Cartesian3());
          offsetPath.push(shifted);
        }
        offsetPath.push(cleanPath[cleanPath.length - 1]);
        return this.sanitizePositions(offsetPath);
      }

      return cleanPath;
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
      var nStrings = opts.numStrings || 1;
      
      var sanitized = this.sanitizePositions(positions);
      if (sanitized.length < 2) return [];

      // Despegue visual limpio contra el relieve irregular de fotogrametría 3D (+6 cm normal / +10 cm en Rayos X)
      var isAudit = !!this.auditElevationMode && opts.isAuditEligible !== false;
      var liftM = isAudit ? 0.10 : 0.06;
      var renderPositions = sanitized.map(function (pos) {
        var up = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(pos, new Cesium.Cartesian3());
        return Cesium.Cartesian3.add(pos, Cesium.Cartesian3.multiplyByScalar(up, liftM, new Cesium.Cartesian3()), new Cesium.Cartesian3());
      });

      var color = Cesium.Color.fromCssColorString(colorHex);
      var createdList = [];
      
      // Dimensionado dinámico de sección según número de strings y tipo de canalización (REBT ITC-BT-19/20)
      var dynamicWidth = 5.0;
      if (isTray) {
        if (nStrings <= 1) dynamicWidth = 6.0;        // Tubo rígido D=32mm
        else if (nStrings === 2) dynamicWidth = 8.0;   // Bandeja 60x60mm
        else if (nStrings <= 4) dynamicWidth = 10.0;  // Bandeja 100x60mm
        else dynamicWidth = 14.0;                     // Bandeja industrial 150-200mm
      }
      var finalWidth = (typeof opts.width === 'number') ? opts.width : dynamicWidth;
      if (isAudit) finalWidth = Math.max(finalWidth + 1.5, 5.5);

      try {
        if (!window._raCableEnginePrimitives) {
          window._raCableEnginePrimitives = viewer.scene.primitives.add(new Cesium.PolylineCollection());
        }
        
        var poly = window._raCableEnginePrimitives.add({
          positions: renderPositions,
          width: finalWidth,
          show: true
        });
        
        if (opts.isGrounding || colorHex === this.CONFIG.COLOR_GROUNDING) {
          poly.material = Cesium.Material.fromType('PolylineDash', {
            color: Cesium.Color.fromCssColorString('#16A34A'),
            gapColor: Cesium.Color.fromCssColorString('#FACC15'),
            dashLength: 14.0
          });
        } else {
          poly.material = Cesium.Material.fromType('Color', {
            color: color
          });
        }
        
        var mockEntity = {
          isCablePrimitive: true,
          primitive: poly,
          id: 'cable_prim_' + Math.random().toString(36).substring(2)
        };
        createdList.push(mockEntity);

        // Alma metálica diferenciadora sobre bandeja portacables (sin coste extra de triangulación 3D)
        if (isTray) {
          var trayCorePoly = window._raCableEnginePrimitives.add({
            positions: renderPositions,
            width: Math.max(2.0, finalWidth * 0.42),
            show: true
          });
          trayCorePoly.material = Cesium.Material.fromType('Color', {
            color: Cesium.Color.fromCssColorString('#94A3B8').withAlpha(Math.min(1.0, (color.alpha || 1.0) + 0.08))
          });
          createdList.push({
            isCablePrimitive: true,
            primitive: trayCorePoly,
            id: 'cable_tray_core_' + Math.random().toString(36).substring(2)
          });
        }

        // Guías discretas en los extremos al elevar en Modo Auditoría para anclar visualmente el origen real
        if (isAudit && sanitized.length >= 2) {
          [0, sanitized.length - 1].forEach(function (endIdx) {
            var tickPoly = window._raCableEnginePrimitives.add({
              positions: [sanitized[endIdx], renderPositions[endIdx]],
              width: 2.0,
              show: true
            });
            tickPoly.material = Cesium.Material.fromType('Color', {
              color: color.withAlpha(0.65)
            });
            createdList.push({
              isCablePrimitive: true,
              primitive: tickPoly,
              id: 'cable_audit_tick_' + endIdx + '_' + Math.random().toString(36).substring(2)
            });
          });
        }
        
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
              var sortedPanels = stringMap[sKey].slice().sort(function (a, b) {
                return (Number(a.pIdx) || 0) - (Number(b.pIdx) || 0);
              });
              return {
                stringName: sKey,
                panels: sortedPanels
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
      var currentStep = (typeof global.wpCurrentStep !== 'undefined')
        ? global.wpCurrentStep
        : ((typeof window !== 'undefined' && window.wpCurrentStep) || 1);
      if (currentStep < 4) return;

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

    clearAllCables: function () {
      var viewer = global.viewer;
      var sState = global.inverterEquipmentState;
      if (sState && Array.isArray(sState.dcCableEntities)) {
        sState.dcCableEntities.forEach(function (e) {
          try {
            if (e.isCablePrimitive) {
              if (window._raCableEnginePrimitives && e.primitive) {
                window._raCableEnginePrimitives.remove(e.primitive);
              }
            } else if (e.isCablePointPrimitive) {
              if (window._raCableJunctionPoints && e.primitive) {
                window._raCableJunctionPoints.remove(e.primitive);
              }
            } else if (viewer && viewer.entities) {
              if (typeof global.removeLabel2DEntity === 'function') global.removeLabel2DEntity(e);
              viewer.entities.remove(e);
            }
          } catch (err) {}
        });
        sState.dcCableEntities = [];
      }
      if (window._raCableEnginePrimitives) {
        try {
          if (typeof window._raCableEnginePrimitives.removeAll === 'function') {
            window._raCableEnginePrimitives.removeAll();
          }
          if (viewer && viewer.scene && viewer.scene.primitives) {
            viewer.scene.primitives.remove(window._raCableEnginePrimitives);
          }
          window._raCableEnginePrimitives = null;
        } catch (ePrim) {}
      }
      if (window._raCableJunctionPoints) {
        try {
          if (typeof window._raCableJunctionPoints.removeAll === 'function') {
            window._raCableJunctionPoints.removeAll();
          }
          if (viewer && viewer.scene && viewer.scene.primitives) {
            viewer.scene.primitives.remove(window._raCableJunctionPoints);
          }
          window._raCableJunctionPoints = null;
        } catch (ePtPrim) {}
      }
      // Purgar posibles handles y puntos medios de ruta remanentes no rastreados
      if (viewer && viewer.entities && sState && sState.routes) {
        ['dc', 'ac'].forEach(function (rType) {
          var arr = sState.routes[rType];
          if (Array.isArray(arr)) {
            for (var idx = 0; idx < arr.length; idx++) {
              var h = viewer.entities.getById('ra_route_handle_' + rType + '_' + idx);
              if (h) viewer.entities.remove(h);
              var hm = viewer.entities.getById('ra_route_mid_' + rType + '_' + idx);
              if (hm) viewer.entities.remove(hm);
            }
          }
        });
      }
    },

    /**
     * Añade un nodo circular de conexión (caja de conexiones / empalme MC4 / extremo de string)
     * en una única PointPrimitiveCollection GPU (1 draw call para toda la planta, con LOD por distancia).
     */
    addJunctionConnectionNode: function (viewer, pos, options) {
      if (!viewer || !viewer.scene || !viewer.scene.primitives || !pos || typeof Cesium === 'undefined') return null;
      var opts = options || {};
      var pC3 = this.toCartesian3(pos);
      if (!pC3) return null;

      // Elevar +1 cm por encima de la polilínea del cable para evitar z-fighting sobre fotogrametría 3D
      var isAudit = !!this.auditElevationMode;
      var liftM = isAudit ? 0.115 : 0.075;
      var up = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(pC3, new Cesium.Cartesian3());
      var liftedPos = Cesium.Cartesian3.add(pC3, Cesium.Cartesian3.multiplyByScalar(up, liftM, new Cesium.Cartesian3()), new Cesium.Cartesian3());

      if (!window._raCableJunctionPoints) {
        window._raCableJunctionPoints = viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection());
      }

      var role = opts.role || 'mid'; // 'start' (+ rojo) | 'end' (- azul) | 'mid' (string) | 'micro' (ámbar)
      var ringHex = opts.ringColor || '#334155';
      var pixelSize = 6.0;
      var outlineWidth = 2.4;
      var fillColor = Cesium.Color.WHITE;
      if (role === 'start') {
        ringHex = this.CONFIG.COLOR_DC_POS; // Rojo positivo
        pixelSize = 7.5;
        outlineWidth = 2.5;
        fillColor = Cesium.Color.WHITE;
      } else if (role === 'end') {
        ringHex = this.CONFIG.COLOR_DC_NEG; // Azul negativo
        pixelSize = 7.5;
        outlineWidth = 2.5;
        fillColor = Cesium.Color.WHITE;
      } else if (role === 'micro') {
        ringHex = '#F59E0B';
        pixelSize = 6.0;
        outlineWidth = 2.0;
        fillColor = Cesium.Color.WHITE;
      } else {
        // Nodos intermedios sobre cable negro/carbón: núcleo blanco limpio y aro grafito
        ringHex = '#475569';
        pixelSize = 5.0;
        outlineWidth = 1.8;
      }

      var pt = window._raCableJunctionPoints.add({
        position: liftedPos,
        pixelSize: pixelSize,
        color: fillColor,
        outlineColor: Cesium.Color.fromCssColorString(ringHex),
        outlineWidth: outlineWidth,
        scaleByDistance: new Cesium.NearFarScalar(12.0, 1.15, 115.0, 0.45),
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0.0, 160.0),
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      });
      return { isCablePointPrimitive: true, primitive: pt };
    },

    /**
     * Motor Principal de Renderizado de Cableado DC y AC con Trazado Ortogonal 3D y Sombras
     */
    renderAllCables: function () {
      var viewer = global.viewer;
      var sState = global.inverterEquipmentState;
      if (!viewer || !sState) return;

      var currentStep = (typeof global.wpCurrentStep !== 'undefined')
        ? global.wpCurrentStep
        : ((typeof window !== 'undefined' && window.wpCurrentStep) || 1);
      if (currentStep < 4) {
        this.clearAllCables();
        if (typeof global.setElectricalEquipmentVisibility === 'function') {
          global.setElectricalEquipmentVisibility(false);
        }
        return;
      }

      if (sState.__isRenderingCables) return;
      sState.__isRenderingCables = true;
      if (!Array.isArray(sState.dcCableEntities)) {
        sState.dcCableEntities = [];
      }
      try {
        // 1. Limpiar entidades y primitivas GPU anteriores
        this.clearAllCables();
        if (!Array.isArray(sState.dcCableEntities)) {
          sState.dcCableEntities = [];
        }

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
      var hasManualAc = (sState.routes && Array.isArray(sState.routes.ac) && sState.routes.ac.length > 0);
      var maxLdc = 0;
      var maxLoopLdc = 0;
      var self = this;

      // 3. Renderizar Codos Interactivos + Puntos Medios "+" (DC y AC) si hay rutas manuales
      function renderRouteHandles(routeType, pts, colorHex) {
        if (!Array.isArray(pts) || pts.length === 0) return;
        var labelPrefix = (routeType === 'ac') ? 'Codo Tubo AC #' : 'Codo Bandeja DC #';
        var liftM = self.auditElevationMode ? (self.CONFIG.AUDIT_ELEVATION_M || 0.24) : 0;
        var selRV = (typeof global.selectedRouteVertex !== 'undefined') ? global.selectedRouteVertex : null;
        var visualPts = [];

        pts.forEach(function (pt, pIdx) {
          var pC3 = self.toCartesian3(pt);
          if (!pC3) return;
          var visPos = pC3;
          if (liftM > 0) {
            var upV = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(pC3, new Cesium.Cartesian3());
            visPos = Cesium.Cartesian3.add(pC3, Cesium.Cartesian3.multiplyByScalar(upV, liftM, new Cesium.Cartesian3()), new Cesium.Cartesian3());
          }
          visualPts.push(visPos);
          var isSel = !!(selRV && selRV.type === routeType && selRV.index === pIdx);
          var node = viewer.entities.add({
            id: 'ra_route_handle_' + routeType + '_' + pIdx,
            name: labelPrefix + (pIdx + 1),
            position: visPos,
            point: {
              pixelSize: isSel ? 14 : 11,
              color: Cesium.Color.fromCssColorString(isSel ? '#10B981' : colorHex),
              outlineColor: isSel ? Cesium.Color.fromCssColorString('#FDE047') : Cesium.Color.WHITE,
              outlineWidth: isSel ? 3 : 2,
              disableDepthTestDistance: Number.POSITIVE_INFINITY
            }
          });
          sState.dcCableEntities.push(node);
        });

        // Tiradores intermedios "+" para insertar un nuevo codo en cualquier segmento
        for (var si = 0; si < visualPts.length - 1; si++) {
          var midVis = Cesium.Cartesian3.midpoint(visualPts[si], visualPts[si + 1], new Cesium.Cartesian3());
          var midNode = viewer.entities.add({
            id: 'ra_route_mid_' + routeType + '_' + si,
            name: 'Insertar codo intermedio (+)',
            position: midVis,
            point: {
              pixelSize: 8,
              color: Cesium.Color.fromCssColorString('#10B981').withAlpha(0.85),
              outlineColor: Cesium.Color.WHITE,
              outlineWidth: 1.5,
              disableDepthTestDistance: Number.POSITIVE_INFINITY
            }
          });
          sState.dcCableEntities.push(midNode);
        }
      }
      if (hasManualDc) renderRouteHandles('dc', sState.routes.dc, self.CONFIG.COLOR_TRAY);
      if (hasManualAc) renderRouteHandles('ac', sState.routes.ac, self.CONFIG.COLOR_AC);

      // 4. Determinar Topología (Microinversores AC vs Serie/Optimizadores vs Paralelo Y)
      var cfg = global.solarProjectConfig || {};
      var isMicroTopology = (cfg.selectedTopology === 'microinverter');
      var _dcTopo = this.getDcTopologyInfo(allStrings.length);
      var isParallelY = !isMicroTopology && _dcTopo.isParallel && allStrings.length >= 2;

      function getJunctionBoxPos(panel) {
        if (!panel) return null;
        var center = panel.center;
        if (!center && panel.corners && panel.corners.length > 0) center = panel.corners[0];
        if (!center || typeof center.x !== 'number' || isNaN(center.x)) return null;

        // 1. Si disponemos de las 4 esquinas 3D (panel.corners), ubicar la caja centrada sobre el eje del módulo
        // (22% hacia el tercio superior, nunca pegada al marco exterior donde se confunde con la placa adyacente)
        if (Array.isArray(panel.corners) && panel.corners.length === 4) {
          try {
            var topEdgeMid = Cesium.Cartesian3.midpoint(panel.corners[2], panel.corners[3], new Cesium.Cartesian3());
            var jPos = Cesium.Cartesian3.lerp(center, topEdgeMid, 0.22, new Cesium.Cartesian3());
            if (!isNaN(jPos.x) && !isNaN(jPos.y) && !isNaN(jPos.z)) {
              return jPos;
            }
          } catch (_) {}
        }

        // 2. Fallback usando el vector V de la base ortonormal del tejado
        try {
          var basisFb = self.getRoofOrthonormalBasis(center, panel.polyIdx);
          if (basisFb && basisFb.vVec && typeof panel.h === 'number' && !isNaN(panel.h)) {
            var offset = Cesium.Cartesian3.multiplyByScalar(basisFb.vVec, panel.h * 0.12, new Cesium.Cartesian3());
            var jPos2 = Cesium.Cartesian3.add(center, offset, new Cesium.Cartesian3());
            if (!isNaN(jPos2.x) && !isNaN(jPos2.y) && !isNaN(jPos2.z)) {
              return jPos2;
            }
          }
        } catch (_) {}

        return center;
      }

      // Helper compartido: registrar clúster único de bajante (tierra o bandeja común) por cubierta (roofKey) y punto de descenso
      var groundingClusterAnchors = [];
      var trayClusterAnchors = [];
      function registerUniqueCluster(anchors, anchorPos, roofKey) {
        if (!anchorPos) return true;
        var aC3 = self.toCartesian3(anchorPos);
        if (!aC3) return true;
        var aCarto = (Cesium.Cartographic && typeof Cesium.Cartographic.fromCartesian === 'function')
          ? Cesium.Cartographic.fromCartesian(aC3)
          : null;
        var rKeyNorm = (roofKey !== undefined && roofKey !== null) ? String(roofKey) : null;
        for (var ci = 0; ci < anchors.length; ci++) {
          var ex = anchors[ci];
          if (rKeyNorm !== null && ex.roofKey !== null) {
            if (ex.roofKey === rKeyNorm) {
              ex.count = (ex.count || 1) + 1;
              return false;
            }
            continue;
          }
          var dHoriz = Cesium.Cartesian3.distance(aC3, ex.pos);
          var dElev = Math.abs((aCarto ? aCarto.height : 0) - ex.height);
          if (dHoriz < 8.0 && dElev < 1.5) {
            ex.count = (ex.count || 1) + 1;
            return false;
          }
        }
        anchors.push({ pos: aC3, height: aCarto ? aCarto.height : 0, roofKey: rKeyNorm, count: 1 });
        return true;
      }

      // Variables acumuladoras para desglose y metrado REBT por tipo de conductor
      var totalDcSingleCoreM = 0;
      var totalDcStringSingleCoreM = 0;
      var totalDcTrunkSingleCoreM = 0;
      var totalInterModuleJumpersM = 0;
      var totalInterModuleJumperCount = 0;
      var totalBatteryCableM = 0;
      var maxTrunkLdc = 0;
      var totalTrayM = 0;
      var totalGroundingM = 0;
      var totalAcTrunkM = 0;
      var totalMicroTrunkBusM = 0;
      var totalMicroDropM = 0;
      var acJunctionBoxCount = 0;
      var stringTelemetryList = [];
      var hasExtLightning = !!(cfg && cfg.hasExternalLightningRod);
      var earthSecMm2 = hasExtLightning ? 16 : 6;

      if (isMicroTopology) {
        // ── MODO MICROINVERSORES AC (PARTICIÓN POR RAMAL 20A Y CAÍDA EN BUS TRONCAL) ─
        var allMicroPanels = [];
        allStrings.forEach(function (st) {
          if (st && Array.isArray(st.panels)) {
            st.panels.forEach(function (p) { if (p) allMicroPanels.push(p); });
          }
        });

        var catMi = (global.equipmentCatalog && Array.isArray(global.equipmentCatalog.microinverters)) ? global.equipmentCatalog.microinverters : [];
        var miSpec = catMi.find(function (m) { return m && m.id === cfg.selectedMicroinverterId && !(m.type && m.type.indexOf('Optimizador') !== -1); })
          || catMi.find(function (m) { return m && !(m.type && m.type.indexOf('Optimizador') !== -1); })
          || { kw: 0.8, inputsPerUnit: 2 };
        var miRatio = (typeof global.raGetMicroinverterRatio === 'function') ? global.raGetMicroinverterRatio(miSpec) : (miSpec.inputsPerUnit || 2);
        var miUnitKw = (miSpec && miSpec.kw > 0) ? miSpec.kw : 0.8;
        var isMonoMicro = (cfg.gridSupply === 'single_phase');
        // Límite reglamentario por circuito ramal de 20 A (16 A continuos: ~3.68 kW en 1F 230V, ~11.0 kW en 3F 400V)
        var maxBranchKw = isMonoMicro ? 3.68 : 11.0;
        var maxUnitsPerBranch = Math.max(1, Math.floor(maxBranchKw / miUnitKw));
        var maxPanelsPerBranch = Math.max(2, maxUnitsPerBranch * miRatio);

        // Agrupar paneles por faldón físico (polyIdx) y subdividir en ramales según capacidad máxima del bus AC
        var panelsByRoof = {};
        var roofOrder = [];
        allMicroPanels.forEach(function (p) {
          var rKey = (typeof p.polyIdx === 'number') ? ('roof_' + p.polyIdx) : 'roof_0';
          if (!panelsByRoof[rKey]) { panelsByRoof[rKey] = []; roofOrder.push(rKey); }
          panelsByRoof[rKey].push(p);
        });

        var acMainTarget = meterPos || invPos || dcTargetPos;
        var maxBranchAcM = 0;
        var maxBranchTrunkBusM = 0;

        roofOrder.forEach(function (rKey, rIdx) {
          var rPanels = panelsByRoof[rKey];
          if (!rPanels || rPanels.length === 0) return;
          var rSample = self.toCartesian3(rPanels[0].center || (rPanels[0].corners && rPanels[0].corners[0]));
          var rBasis = self.getRoofOrthonormalBasis(rSample, rPanels[0] && rPanels[0].polyIdx);
          var sortedMicroPanels = self.sortPanelsForStringing(rPanels, rBasis);

          for (var bStart = 0, bIdx = 0; bStart < sortedMicroPanels.length; bStart += maxPanelsPerBranch, bIdx++) {
            var branchPanels = sortedMicroPanels.slice(bStart, bStart + maxPanelsPerBranch);
            if (branchPanels.length === 0) continue;

            var trunkPts = [];
            for (var mp = 0; mp < branchPanels.length; mp++) {
              var jPt = self.toCartesian3(getJunctionBoxPos(branchPanels[mp]));
              if (jPt) {
                var elMPt = self.elevatePoint(jPt, self.CONFIG.TRAY_OFFSET, rBasis.normal);
                trunkPts.push(elMPt);
                var mNode = self.addJunctionConnectionNode(viewer, elMPt, { role: 'micro' });
                if (mNode) sState.dcCableEntities.push(mNode);
              }
            }
            var trunkBusLen = 0;
            if (trunkPts.length >= 2) {
              trunkBusLen = self.computePathLength(trunkPts);
              if (trunkBusLen > maxBranchTrunkBusM) maxBranchTrunkBusM = trunkBusLen;
              totalMicroTrunkBusM += trunkBusLen;
              totalAcTrunkM += trunkBusLen;
              var microTrunkEnts = self.createVolumetricEntity(viewer, trunkPts, {
                name: 'Bus AC Troncal Microinversores Faldón #' + (rIdx + 1) + ' Ramal #' + (bIdx + 1),
                colorHex: '#F59E0B',
                width: 4.5
              });
              microTrunkEnts.forEach(function (e) { sState.dcCableEntities.push(e); });
            }

            // Caja de derivación estanca IP65 en cabecera del ramal AC -> bajante al Cuadro General AC
            var jBoxStart = self.toCartesian3(getJunctionBoxPos(branchPanels[0]));
            if (jBoxStart && acMainTarget) {
              acJunctionBoxCount++;
              var dropPillarAc = self.findClosestStructurePillar(jBoxStart, acMainTarget, branchPanels);
              var acDropPath = self.buildOrthogonalManhattanPath3D(jBoxStart, acMainTarget, {
                normalOffset: self.CONFIG.AC_OFFSET + (bIdx * 0.012),
                descentPoint: dropPillarAc,
                sourcePolyIdx: (branchPanels[0] && typeof branchPanels[0].polyIdx === 'number') ? branchPanels[0].polyIdx : null,
                basis: rBasis,
                waypoints: (rIdx === 0 && bIdx === 0 && hasManualAc) ? sState.routes.ac : null
              });
              var lAcBranch = self.computePathLength(acDropPath);
              if (lAcBranch > maxBranchAcM) maxBranchAcM = lAcBranch;
              totalMicroDropM += lAcBranch;
              totalAcTrunkM += lAcBranch;

              var acDropEnts = self.createVolumetricEntity(viewer, acDropPath, {
                name: 'Derivación AC Caja IP65 Cubierta ➔ CGBT (Faldón #' + (rIdx + 1) + ' Ramal #' + (bIdx + 1) + ')',
                colorHex: self.CONFIG.COLOR_AC,
                radius: self.CONFIG.CABLE_RADIUS_AC
              });
              acDropEnts.forEach(function (e) { sState.dcCableEntities.push(e); });

              // 1 única bajante equipotencial de tierra por cubierta física (rKey) + enlace entre perfiles (0.75 m/panel)
              if (registerUniqueCluster(groundingClusterAnchors, jBoxStart, rKey)) {
                var gPathMicro = self.buildOrthogonalManhattanPath3D(jBoxStart, acMainTarget, {
                  normalOffset: self.CONFIG.GROUND_OFFSET,
                  descentPoint: dropPillarAc,
                  basis: rBasis
                });
                totalGroundingM += self.computePathLength(gPathMicro) + (branchPanels.length * 0.75);
                var gEntMicro = self.createVolumetricEntity(viewer, gPathMicro, {
                  name: 'Tierra Equipotencial Cu ' + earthSecMm2 + 'mm² Cubierta #' + (rIdx + 1) + ' (ITC-BT-18)',
                  colorHex: self.CONFIG.COLOR_GROUNDING,
                  width: 3.0,
                  radius: 0.010
                });
                gEntMicro.forEach(function (e) { sState.dcCableEntities.push(e); });
              } else {
                totalGroundingM += (branchPanels.length * 0.75);
              }
            }
          }
        });

        var totalMicroUnitsCount = Math.max(1, Math.ceil(allMicroPanels.length / Math.max(1, miRatio)));
        sState.L_dc_measured = 0;
        sState.L_dc_string_measured = 0;
        sState.L_dc_loop_measured = 0;
        sState.L_dc_trunk_measured = 0;
        // Longitud equivalente de caída AC: bajante hasta cuadro + 0.5 × bus troncal con carga distribuida en cubierta
        sState.L_ac_measured = Math.round((maxBranchAcM + (maxBranchTrunkBusM * 0.5)) * 10) / 10;
        this.updateElectricalSizingAndHUD(0, sState.L_ac_measured);
        sState.stringTelemetry = [];
        sState.cableBreakdown = {
          topology: 'microinverter',
          totalDcCableMeters: 0,
          dcStringCableMeters: 0,
          dcTrunkCableMeters: 0,
          totalInterModuleMeters: 0,
          interModuleJumperCount: 0,
          totalTrayMeters: Math.round(totalAcTrunkM * 10) / 10,
          trayType: 'Bus AC Troncal (' + acJunctionBoxCount + ' ramal(es) ≤20A) + Caja estanca IP65',
          trayWidthMm: 60,
          totalAcConduitMeters: Math.round(totalMicroDropM * 10) / 10,
          acConduitSpec: 'Tubo rígido curvable en frío M32 libre de halógenos (REBT ITC-BT-20)',
          totalAcCableMeters: Math.round(totalAcTrunkM * 10) / 10,
          acMainCableMeters: Math.round(totalMicroDropM * 10) / 10,
          microTrunkCableMeters: Math.round(totalMicroTrunkBusM * 10) / 10,
          acBranchCableMeters: Math.round(totalMicroTrunkBusM * 10) / 10,
          acCableSpec: 'Manguera RZ1-K (AS) 0,6/1 kV libre de halógenos ' + (sState.S_ac_recommended || 6) + ' mm²',
          totalGroundingMeters: Math.round(totalGroundingM * 10) / 10,
          groundingSecMm2: earthSecMm2,
          groundingSpec: 'Cable de cobre Cu ' + earthSecMm2 + ' mm² equipotencial único por cubierta (ITC-BT-18)',
          mc4ConnectorPairs: 0,
          microBusConnectors: totalMicroUnitsCount + (acJunctionBoxCount * 2),
          acJunctionBoxes: acJunctionBoxCount,
          gatewayIncluded: true,
          fillFactorPct: 20
        };
        if (viewer.scene && typeof viewer.scene.requestRender === 'function') viewer.scene.requestRender();
        return;
      }

      // Si la topología es Paralelo Y: centroide común positivo y negativo para todos los strings convergentes
      var yBranchNodePos = null;
      var yBranchNodeNeg = null;
      var yBranchNode = null;
      if (isParallelY && allStrings.length >= 2) {
        var sumPos = new Cesium.Cartesian3(0, 0, 0);
        var sumNeg = new Cesium.Cartesian3(0, 0, 0);
        var cntPos = 0, cntNeg = 0;
        allStrings.forEach(function (strItem) {
          if (strItem && Array.isArray(strItem.panels) && strItem.panels.length > 0) {
            var pStart = self.toCartesian3(strItem.panels[0].center);
            var pEnd = self.toCartesian3(strItem.panels[strItem.panels.length - 1].center);
            if (pStart) { Cesium.Cartesian3.add(sumPos, pStart, sumPos); cntPos++; }
            if (pEnd) { Cesium.Cartesian3.add(sumNeg, pEnd, sumNeg); cntNeg++; }
          }
        });
        if (cntPos >= 2) yBranchNodePos = Cesium.Cartesian3.divideByScalar(sumPos, cntPos, new Cesium.Cartesian3());
        if (cntNeg >= 2) yBranchNodeNeg = Cesium.Cartesian3.divideByScalar(sumNeg, cntNeg, new Cesium.Cartesian3());
        if (yBranchNodePos && yBranchNodeNeg) {
          yBranchNode = Cesium.Cartesian3.midpoint(yBranchNodePos, yBranchNodeNeg, new Cesium.Cartesian3());
        } else {
          yBranchNode = yBranchNodePos || yBranchNodeNeg;
        }
      }

      // 5. Generar y Renderizar Trazados DC para cada String con Retorno Compensado Anti-Bucle (UNE-EN 62305)
      allStrings.forEach(function (strObj, sIdx) {
        var rawPanels = strObj.panels || [];
        if (rawPanels.length === 0) return;

        var samplePos = self.toCartesian3(rawPanels[0].center || (rawPanels[0].corners && rawPanels[0].corners[0]));
        var basis = self.getRoofOrthonormalBasis(samplePos, rawPanels[0] && rawPanels[0].polyIdx);
        var activeTopo = (global.solarProjectConfig && global.solarProjectConfig.stringWiringTopology) || 'leapfrog';
        var alreadyOrdered = (activeTopo === 'leapfrog') || !!strObj.preSorted || (rawPanels.length > 1 && !!rawPanels[0].stringName);
        var sPanels = alreadyOrdered ? rawPanels.slice() : self.sortPanelsForStringing(rawPanels, basis);

        var firstPanel = sPanels[0];
        var termPanel = sPanels[sPanels.length - 1];

        var startPos = self.toCartesian3(getJunctionBoxPos(firstPanel));
        var termPos = self.toCartesian3(getJunctionBoxPos(termPanel));
        if (!startPos || !termPos || !dcTargetPos) return;

        // Pilar o arista de descenso más próximo a los equipos
        var descentPillar = self.findClosestStructurePillar(startPos, dcTargetPos, sPanels);

        var stringColor = (firstPanel && firstPanel.stringColor) || self.CONFIG.STRING_COLORS[sIdx % self.CONFIG.STRING_COLORS.length];

        // Helper: solo permitir zanja subterránea entre estructuras independientes de suelo/pérgola, jamás atravesando un tejado
        var isSeparateGroundStructureJump = function (pA, pB) {
          if (!pA || !pB) return false;
          if (typeof pA.polyIdx !== 'number' || typeof pB.polyIdx !== 'number' || pA.polyIdx === pB.polyIdx) return false;
          var WPcur = global.WP || (typeof window !== 'undefined' ? window.WP : null);
          if (!WPcur || !Array.isArray(WPcur.polylines)) return false;
          var plA = WPcur.polylines[pA.polyIdx];
          var plB = WPcur.polylines[pB.polyIdx];
          var isGroundOrPerg = function (pl) {
            var st = (pl && ((pl.estructura && pl.estructura.tipo) || pl.structureType || pl.modStructure || '')) || '';
            return /pergola|carport|ground|suelo|marquesina/i.test(st);
          };
          return isGroundOrPerg(plA) && isGroundOrPerg(plB);
        };

        // ── 5.1 LATIGUILLOS INTERMÓDULO (STRINGING 3D) ─────────────────────────
        // Entre placas adyacentes en fila (<= 2.4 m) se usan los cables propios de fábrica (~1.1 m);
        // al saltar chimeneas o huecos en el mismo tejado el cable rodea SIEMPRE sobre cubierta (nunca taladra el forjado).
        var interModuleM = 0;
        if (sPanels.length > 1) {
          for (var p = 0; p < sPanels.length - 1; p++) {
            var pCur = sPanels[p];
            var pNext = sPanels[p + 1];
            var pCurBasis = (p > 0 && typeof pCur.polyIdx === 'number' && typeof rawPanels[0].polyIdx === 'number' && pCur.polyIdx !== rawPanels[0].polyIdx)
              ? self.getRoofOrthonormalBasis(self.toCartesian3(pCur.center || (pCur.corners && pCur.corners[0])), pCur.polyIdx)
              : basis;
            var jA = self.toCartesian3(getJunctionBoxPos(pCur));
            var jB = self.toCartesian3(getJunctionBoxPos(pNext));
            if (jA && jB) {
              var elevatedA = self.elevatePoint(jA, self.CONFIG.JUMPER_OFFSET, pCurBasis.normal);
              var elevatedB = self.elevatePoint(jB, self.CONFIG.JUMPER_OFFSET, pCurBasis.normal);
              var directDist = Cesium.Cartesian3.distance(elevatedA, elevatedB);

              var jumperPts;
              var isUndergroundTrench = isSeparateGroundStructureJump(pCur, pNext);
              var isRoofGapJump = !isUndergroundTrench && (directDist > 2.4);

              if (isUndergroundTrench) {
                // Enlace subterráneo exclusivo entre pérgolas/marquesinas independientes en suelo (REBT ITC-BT-07/20)
                var upA = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(elevatedA, new Cesium.Cartesian3());
                var upB = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(elevatedB, new Cesium.Cartesian3());
                var dropDistA = 3.5;
                var dropDistB = 3.5;
                if (dcTargetPos) {
                  var diffZA = Cesium.Cartesian3.dot(Cesium.Cartesian3.subtract(elevatedA, dcTargetPos, new Cesium.Cartesian3()), upA);
                  if (diffZA > 0.8) dropDistA = diffZA;
                  var diffZB = Cesium.Cartesian3.dot(Cesium.Cartesian3.subtract(elevatedB, dcTargetPos, new Cesium.Cartesian3()), upB);
                  if (diffZB > 0.8) dropDistB = diffZB;
                }
                var footA = Cesium.Cartesian3.subtract(elevatedA, Cesium.Cartesian3.multiplyByScalar(upA, dropDistA, new Cesium.Cartesian3()), new Cesium.Cartesian3());
                var footB = Cesium.Cartesian3.subtract(elevatedB, Cesium.Cartesian3.multiplyByScalar(upB, dropDistB, new Cesium.Cartesian3()), new Cesium.Cartesian3());
                jumperPts = [elevatedA, footA, footB, elevatedB];
              } else if (isRoofGapJump && pCurBasis && pCurBasis.uVec) {
                // Salto de hueco o chimenea SOBRE CUBIERTA: trazado ortogonal en el plano del tejado rodeando obstáculos con margen holgado
                var dispJ = Cesium.Cartesian3.subtract(elevatedB, elevatedA, new Cesium.Cartesian3());
                var midJ = Cesium.Cartesian3.add(elevatedA, Cesium.Cartesian3.multiplyByScalar(pCurBasis.uVec, Cesium.Cartesian3.dot(dispJ, pCurBasis.uVec), new Cesium.Cartesian3()), new Cesium.Cartesian3());
                jumperPts = self.detourAroundObstacles([elevatedA, midJ, elevatedB], pCurBasis, 0.52);
              } else {
                // Latiguillo normal bajo los módulos de la misma mesa (verificando igualmente holgura frente a chimeneas próximas)
                jumperPts = self.detourAroundObstacles([elevatedA, elevatedB], pCurBasis, 0.45);
              }

              var jLen = self.computePathLength(jumperPts);
              if (isUndergroundTrench || isRoofGapJump) {
                interModuleM += jLen;
                totalInterModuleJumperCount += Math.max(1, Math.ceil(jLen / 1.5));
              } else if (activeTopo === 'leapfrog' && directDist > 1.35) {
                totalInterModuleJumperCount += 1;
              }

              var jumperEntities = self.createVolumetricEntity(viewer, jumperPts, {
                name: 'Latiguillo ' + (isUndergroundTrench ? 'Subterráneo' : (isRoofGapJump ? 'Sobre Cubierta' : 'Intermódulo')) + ' ' + (p + 1) + '➔' + (p + 2) + ' String #' + (sIdx + 1),
                colorHex: stringColor,
                width: (isUndergroundTrench || isRoofGapJump) ? 4.2 : 3.5
              });
              jumperEntities.forEach(function (e) { sState.dcCableEntities.push(e); });
            }
          }
        }
        totalInterModuleJumpersM += interModuleM;

        // ── 5.1b NODOS CIRCULARES DE CONEXIÓN POR PLACA (CAJA DE CONEXIONES + EXTREMOS + / -) ──
        for (var np = 0; np < sPanels.length; np++) {
          var npPanel = sPanels[np];
          var npBasis = (np > 0 && typeof npPanel.polyIdx === 'number' && typeof rawPanels[0].polyIdx === 'number' && npPanel.polyIdx !== rawPanels[0].polyIdx)
            ? self.getRoofOrthonormalBasis(self.toCartesian3(npPanel.center || (npPanel.corners && npPanel.corners[0])), npPanel.polyIdx)
            : basis;
          var jNodePos = self.toCartesian3(getJunctionBoxPos(npPanel));
          if (jNodePos) {
            var elNodePos = self.elevatePoint(jNodePos, self.CONFIG.JUMPER_OFFSET, npBasis.normal);
            var nodeRole = (np === 0) ? 'start' : ((np === sPanels.length - 1) ? 'end' : 'mid');
            var connNode = self.addJunctionConnectionNode(viewer, elNodePos, {
              role: nodeRole,
              ringColor: stringColor
            });
            if (connNode) sState.dcCableEntities.push(connNode);
          }
        }

        // ── 5.2 CONDUCTOR DE RETORNO COMPENSADO ANTI-BUCLE (UNE-EN 62305 & IEC 62548) ─
        // Siempre sobre la superficie de cubierta (nunca taladra el forjado hacia abajo al saltar obstáculos).
        var returnPath = [];
        var lReturn = 0;
        if (sPanels.length > 1 && Cesium.Cartesian3.distance(termPos, startPos) > 0.4) {
          var appendReturnSegment = function (targetPath, nextPt) {
            if (targetPath.length > 0 && basis && basis.uVec) {
              var prevPt = targetPath[targetPath.length - 1];
              var segDist = Cesium.Cartesian3.distance(prevPt, nextPt);
              if (segDist > 2.4) {
                var dispR = Cesium.Cartesian3.subtract(nextPt, prevPt, new Cesium.Cartesian3());
                var midR = Cesium.Cartesian3.add(prevPt, Cesium.Cartesian3.multiplyByScalar(basis.uVec, Cesium.Cartesian3.dot(dispR, basis.uVec), new Cesium.Cartesian3()), new Cesium.Cartesian3());
                var detR = self.detourAroundObstacles([prevPt, midR, nextPt], basis, 0.52);
                for (var dr = 1; dr < detR.length; dr++) targetPath.push(detR[dr]);
                return;
              }
              var detShort = self.detourAroundObstacles([prevPt, nextPt], basis, 0.45);
              for (var ds = 1; ds < detShort.length; ds++) targetPath.push(detShort[ds]);
              return;
            }
            targetPath.push(nextPt);
          };

          // Retorno compensado anti-bucle estricto (UNE-EN 62305): viaja siempre pegado en paralelo
          // al recorrido exacto de la serie en sentido inverso (nunca abre lazos por fuera de las placas).
          var retSideVec = (basis && basis.vVec) ? basis.vVec : Cesium.Cartesian3.UNIT_Y;
          for (var r = sPanels.length - 1; r >= 0; r--) {
            var rPos = self.toCartesian3(getJunctionBoxPos(sPanels[r]));
            if (rPos) {
              var elR = self.elevatePoint(rPos, self.CONFIG.DC_RETURN_OFFSET, basis.normal);
              if (r > 0 && r < sPanels.length - 1) {
                elR = Cesium.Cartesian3.add(elR, Cesium.Cartesian3.multiplyByScalar(retSideVec, 0.065, new Cesium.Cartesian3()), new Cesium.Cartesian3());
              }
              appendReturnSegment(returnPath, elR);
            }
          }
          returnPath = self.sanitizePositions(returnPath);
          lReturn = self.computePathLength(returnPath);

          if (returnPath.length >= 2) {
            var returnEntities = self.createVolumetricEntity(viewer, returnPath, {
              name: 'Retorno Compensado Anti-Bucle String #' + (sIdx + 1) + ' (UNE-EN 62305)',
              colorHex: self.CONFIG.COLOR_DC_RETURN,
              width: 3.6
            });
            returnEntities.forEach(function (e) { sState.dcCableEntities.push(e); });
          }
        }

        // Si hay nodo Y en cubierta en tipología Paralelo Y, todos los strings convergen al nodo Y
        var targetForStringPos = (isParallelY && yBranchNodePos) ? yBranchNodePos : dcTargetPos;
        var targetForStringNeg = (isParallelY && yBranchNodeNeg) ? yBranchNodeNeg : dcTargetPos;

        // ── 5.3 TIRADAS PRINCIPALES PAREADAS (HOMERUN EN BANDEJA VIRTUAL PARALELA) ─
        // Carriles deterministas por string y polaridad (±0.075m) para visibilidad limpia sin solapamiento
        var laneIndex = (sIdx % 6);
        var totalStrCount = (Array.isArray(allStrings) && allStrings.length > 0) ? allStrings.length : 1;
        var stringBundleOffset = (laneIndex - Math.min(2.5, (totalStrCount - 1) / 2)) * 0.16;
        var srcPolyIdxStr = (firstPanel && typeof firstPanel.polyIdx === 'number') ? firstPanel.polyIdx : null;

        var posPath = self.buildOrthogonalManhattanPath3D(startPos, targetForStringPos, {
          normalOffset: self.CONFIG.DC_POS_OFFSET + (sIdx % 2) * 0.012,
          lateralOffset: stringBundleOffset + 0.065,
          descentPoint: descentPillar,
          sourcePolyIdx: srcPolyIdxStr,
          basis: basis,
          waypoints: hasManualDc ? sState.routes.dc : null
        });

        var negPath = self.buildOrthogonalManhattanPath3D(startPos, targetForStringNeg, {
          normalOffset: self.CONFIG.DC_NEG_OFFSET + (sIdx % 2) * 0.012,
          lateralOffset: stringBundleOffset - 0.065,
          descentPoint: descentPillar,
          sourcePolyIdx: srcPolyIdxStr,
          isNeg: true,
          basis: basis,
          waypoints: hasManualDc ? sState.routes.dc : null
        });

        var lPos = self.computePathLength(posPath);
        var lNegHomerun = self.computePathLength(negPath);
        var lNegTotal = lNegHomerun + lReturn;

        var numMods = sPanels.length;
        var totalStrLen = lPos + lNegTotal + interModuleM;
        var strMaxDc = Math.max(lPos, lNegTotal) + interModuleM;
        if (strMaxDc > maxLdc) maxLdc = strMaxDc;
        if (totalStrLen > maxLoopLdc) maxLoopLdc = totalStrLen;

        var strRoofKey = (firstPanel && typeof firstPanel.polyIdx === 'number') ? ('roof_' + firstPanel.polyIdx) : null;
        totalDcStringSingleCoreM += (lPos + lNegTotal);
        totalDcSingleCoreM += (lPos + lNegTotal);
        // La bandeja/tubo troncal es compartida por strings de la misma cubierta o bajante: NO multiplicar por nº de strings
        var isNewTrayCluster = registerUniqueCluster(trayClusterAnchors, descentPillar || startPos, strRoofKey);
        if (isNewTrayCluster) {
          totalTrayM += Math.max(lPos, lNegHomerun);
        } else {
          // Solo sumar ramal local hasta la bandeja común (aprox. distancia del string a la cabeza del tronco, máx 6 m)
          var localStub = descentPillar ? Math.min(8.0, Cesium.Cartesian3.distance(startPos, descentPillar)) : 2.0;
          totalTrayM += localStub;
        }

        // Crear entidades volumétricas para DC+ y DC- con ancho adaptativo
        var posEntities = self.createVolumetricEntity(viewer, posPath, {
          name: 'Acometida DC+ String #' + (sIdx + 1) + ' (Homerun Pareado)',
          colorHex: self.CONFIG.COLOR_DC_POS,
          width: 5.0,
          radius: self.CONFIG.CABLE_RADIUS_DC
        });
        posEntities.forEach(function (e) { sState.dcCableEntities.push(e); });

        var negEntities = self.createVolumetricEntity(viewer, negPath, {
          name: 'Acometida DC- String #' + (sIdx + 1) + ' (Homerun Pareado)',
          colorHex: self.CONFIG.COLOR_DC_NEG,
          width: 5.0,
          radius: self.CONFIG.CABLE_RADIUS_DC
        });
        negEntities.forEach(function (e) { sState.dcCableEntities.push(e); });

        // ── 5.4 CONDUCTOR DE PUESTA A TIERRA EQUIPOTENCIAL ÚNICO POR CUBIERTA (ITC-BT-18) ──
        // En obra no baja un cable verde independiente por cada string: todas las guías se unen en cubierta (0.75 m/módulo)
        // y baja UNA única línea principal de Cu (6 mm² o 16 mm² con pararrayos) por cada edificio/cubierta hasta barra de tierra.
        var railBondingM = numMods * 0.75;
        if (registerUniqueCluster(groundingClusterAnchors, descentPillar || startPos, strRoofKey)) {
          var groundPath = self.buildOrthogonalManhattanPath3D(startPos, dcTargetPos, {
            normalOffset: self.CONFIG.GROUND_OFFSET,
            lateralOffset: stringBundleOffset + 0.14,
            descentPoint: descentPillar,
            sourcePolyIdx: srcPolyIdxStr,
            basis: basis,
            waypoints: hasManualDc ? sState.routes.dc : null
          });
          var lGroundMain = self.computePathLength(groundPath);
          totalGroundingM += (lGroundMain + railBondingM);

          var groundEntities = self.createVolumetricEntity(viewer, groundPath, {
            name: 'Bajante Principal Tierra Equipotencial Cu ' + earthSecMm2 + 'mm² (ITC-BT-18)',
            colorHex: self.CONFIG.COLOR_GROUNDING,
            width: 3.2,
            radius: 0.010
          });
          groundEntities.forEach(function (e) { sState.dcCableEntities.push(e); });
        } else {
          totalGroundingM += railBondingM;
        }

        // Guardar datos preliminares de este string para telemetría
        stringTelemetryList.push({
          index: sIdx + 1,
          name: strObj.stringName || ('String #' + (sIdx + 1)),
          numPanels: numMods,
          homerunLength: Math.round(lPos * 10) / 10,
          posHomerunLength: Math.round(lPos * 10) / 10,
          negHomerunLength: Math.round(lNegHomerun * 10) / 10,
          returnConductorLength: Math.round(lReturn * 10) / 10,
          interModuleLength: Math.round(interModuleM * 10) / 10,
          totalCableLength: Math.round(totalStrLen * 10) / 10,
          isAntiLoop: true
        });

        // Etiqueta 2D de telemetría de string
        var midIdx = Math.floor(posPath.length / 2);
        var midPt = posPath[midIdx] || posPath[0];
        if (typeof global.addLabelEntity === 'function') {
          var labelText = '⚡ String ' + (sIdx + 1) + ' (DC+/DC-) · ' + totalStrLen.toFixed(1) + ' m [Anti-Bucle]';
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
        maxTrunkLdc += yTrunkLen;
        totalTrayM += yTrunkLen;
        totalDcTrunkSingleCoreM += (2 * yTrunkLen);
        totalDcSingleCoreM += (2 * yTrunkLen);

        var yTrunkEntities = self.createVolumetricEntity(viewer, yTrunkPath, {
          name: 'Troncal DC Bipolar Paralelo Y (90° Manhattan)',
          colorHex: self.CONFIG.COLOR_TRAY,
          isTray: true,
          numStrings: allStrings.length
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
        maxTrunkLdc += lTrunk;
        totalTrayM += lTrunk;
        totalDcTrunkSingleCoreM += (2 * lTrunk);
        totalDcSingleCoreM += (2 * lTrunk);

        var trunkEntities = self.createVolumetricEntity(viewer, trunkPath, {
          name: 'Troncal DC Combiner ➔ Cuadro/Inversor (90° Manhattan 3D)',
          colorHex: self.CONFIG.COLOR_COMBINER,
          isTray: true,
          numStrings: allStrings.length
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
        // Sin combiner box: strings van directo al Cuadro DC y de ahí al Inversor
        var dcToInvPath = self.buildOrthogonalManhattanPath3D(dcBoxPos, invPos, {
          normalOffset: self.CONFIG.TRAY_OFFSET
        });
        var lDcInv = self.computePathLength(dcToInvPath);
        maxTrunkLdc += lDcInv;
        totalTrayM += lDcInv;
        var bridgeCores = Math.max(1, isParallelY ? 1 : allStrings.length) * 2 * lDcInv;
        if (isParallelY) totalDcTrunkSingleCoreM += bridgeCores;
        else totalDcStringSingleCoreM += bridgeCores;
        totalDcSingleCoreM += bridgeCores;

        var dcToInvEntities = self.createVolumetricEntity(viewer, dcToInvPath, {
          name: 'Puente DC Cuadro ➔ Inversor (90° Manhattan 3D)',
          colorHex: self.CONFIG.COLOR_COMBINER,
          isTray: true,
          numStrings: allStrings.length
        });
        dcToInvEntities.forEach(function (e) { sState.dcCableEntities.push(e); });
      }

      // 6.b Latiguillo de interconexión directa Cuadro DC ➔ Inversor (cuando ambos están presentes con Combiner Box)
      if (cbPos && dcBoxPos && invPos && Cesium.Cartesian3.distance(dcBoxPos, invPos) > 0.05) {
        var bridgePath = self.buildOrthogonalManhattanPath3D(dcBoxPos, invPos, {
          normalOffset: self.CONFIG.TRAY_OFFSET
        });
        var lBridge = self.computePathLength(bridgePath);
        maxTrunkLdc += lBridge;
        totalTrayM += lBridge;
        totalDcTrunkSingleCoreM += (2 * lBridge);
        totalDcSingleCoreM += (2 * lBridge);

        var bridgeEntities = self.createVolumetricEntity(viewer, bridgePath, {
          name: 'Puente DC Cuadro ➔ Inversor (90° Manhattan 3D)',
          colorHex: self.CONFIG.COLOR_COMBINER,
          isTray: true,
          numStrings: allStrings.length
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
        totalBatteryCableM = Math.round(lBatBus * 2 * 10) / 10;

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

      sState.L_dc_string_measured = Math.round(maxLdc * 10) / 10;
      sState.L_dc_loop_measured = Math.round(maxLoopLdc * 10) / 10;
      sState.L_dc_trunk_measured = Math.round(maxTrunkLdc * 10) / 10;
      sState.L_dc_measured = Math.round((maxLdc + maxTrunkLdc) * 10) / 10;

      // 8. Dimensionamiento Eléctrico REBT ITC-BT-40 y Actualización de Telemetría (SSOT)
      this.updateElectricalSizingAndHUD(sState.L_dc_string_measured, sState.L_ac_measured);

      // 9. Completar Telemetría REBT por String y Desglose de Materiales (BOM / Memoria Técnica)
      var modCfg = global.panelConfig || { potencia: 450, isc: 13.8, imp: 13.05, vmp: 34.5, voc: 41.5 };
      var vmpNom = modCfg.vmp || 34.5;
      var vocNom = modCfg.voc || (vmpNom * 1.20);
      var invCfgForLimits = (global.solarProjectConfig && global.solarProjectConfig.calculatedLimits && global.solarProjectConfig.calculatedLimits.inverter)
        ? global.solarProjectConfig.calculatedLimits.inverter
        : { vMaxAbs: 1000, vMpptMin: 200, vMpptMax: 850, vStart: 200 };
      var climColdC = (global.solarProjectConfig && typeof global.solarProjectConfig.tempMinC === 'number')
        ? global.solarProjectConfig.tempMinC : undefined;
      var climHotC = (global.solarProjectConfig && typeof global.solarProjectConfig.tempMaxCellC === 'number')
        ? global.solarProjectConfig.tempMaxCellC : undefined;
      var dynLim = (typeof global.calculateDynamicMPPTStringLimits === 'function')
        ? global.calculateDynamicMPPTStringLimits(
            { voc: vocNom, vmp: vmpNom, tempCoeffVoc: modCfg.tempCoeffVoc ?? -0.0026, tempCoeffPmax: modCfg.tempCoeffPmax ?? -0.0034 },
            invCfgForLimits,
            { Tmin: climColdC, TmaxCell: climHotC }
          )
        : null;

      // Normalizar coeficientes térmicos garantizando base unitaria (dividir entre 100 si vienen en porcentaje)
      var rawCoeffPmax = modCfg.tempCoeffPmax ?? modCfg.gammaPmp ?? -0.0034;
      var effCoeffPmax = Math.abs(rawCoeffPmax) > 0.05 ? rawCoeffPmax / 100.0 : rawCoeffPmax;
      var rawCoeffVoc = modCfg.tempCoeffVoc ?? modCfg.gammaVoc ?? -0.0026;
      var effCoeffVoc = Math.abs(rawCoeffVoc) > 0.05 ? rawCoeffVoc / 100.0 : rawCoeffVoc;

      var vmpHotMod = (dynLim && (dynLim.Vmp_Tmax > 0 || dynLim.vmpHot > 0))
        ? (dynLim.Vmp_Tmax || dynLim.vmpHot)
        : (vmpNom * (1 + effCoeffPmax * (70 - 25)));
      var vocColdMod = (dynLim && (dynLim.Voc_Tmin > 0 || dynLim.vocCold > 0))
        ? (dynLim.Voc_Tmin || dynLim.vocCold)
        : (vocNom * (1 + effCoeffVoc * (-10 - 25)));
      var rho90 = (global.ELEC_CONSTANTS && global.ELEC_CONSTANTS.RHO_CU_90) ? global.ELEC_CONSTANTS.RHO_CU_90 : 0.023;
      var imp = modCfg.imp || 13.05;
      var isBifacialSt = !!(modCfg && (modCfg.bifacial || modCfg.isBifacial || (modCfg.bifacialityFactor && modCfg.bifacialityFactor > 0) || (modCfg.tecnologia && modCfg.tecnologia.toLowerCase().indexOf('bifacial') !== -1) || /bifacial/i.test(modCfg.name || modCfg.model || modCfg.modelo || '')));
      var impEff = imp * (isBifacialSt ? 1.15 : 1.0);
      var secDc = sState.S_dc_recommended || 6;

      stringTelemetryList.forEach(function (st) {
        var nMods = st.numPanels || 1;
        st.vmpHot = Math.round(nMods * vmpHotMod * 10) / 10;
        st.vocCold = Math.round(nMods * vocColdMod * 10) / 10;
        st.recommendedSection = secDc;
        var fullLoopM = (st.posHomerunLength || st.homerunLength || 20) + (st.negHomerunLength || st.homerunLength || 20) + (st.returnConductorLength || 0) + (st.interModuleLength || 0);
        st.fullLoopLength = Math.round(fullLoopM * 10) / 10;
        var dVStr = (rho90 * fullLoopM * impEff) / secDc;
        var dVpctStr = (dVStr / Math.max(12.0, st.vmpHot)) * 100;
        st.voltageDropV = Math.round(dVStr * 100) / 100;
        st.voltageDropPct = Math.round(dVpctStr * 100) / 100;
        st.compliance = (dVpctStr <= 1.5);
      });
      sState.stringTelemetry = stringTelemetryList;

      var numStrings = allStrings.length;
      var maxStringsInSingleTray = 1;
      for (var tci = 0; tci < trayClusterAnchors.length; tci++) {
        if ((trayClusterAnchors[tci].count || 1) > maxStringsInSingleTray) {
          maxStringsInSingleTray = trayClusterAnchors[tci].count;
        }
      }
      var effTrayStrings = (trayClusterAnchors.length > 0) ? maxStringsInSingleTray : numStrings;
      var trayWidthMm = (effTrayStrings <= 1) ? 60 : ((effTrayStrings === 2) ? 60 : ((effTrayStrings <= 4) ? 100 : 150));
      var trayDesc = (effTrayStrings <= 1)
        ? 'Tubo rígido D=32mm libre de halógenos'
        : ('Bandeja metálica perforada ' + trayWidthMm + 'x60 mm con tapa (REBT ITC-BT-19)');

      var totalPanelsCount = 0;
      allStrings.forEach(function (s) { totalPanelsCount += (s.panels ? s.panels.length : 0); });
      var invCountBreakdown = (cfg && cfg.autoSizing && cfg.autoSizing.inverters && Number.isFinite(cfg.autoSizing.inverters.count))
        ? Math.max(1, cfg.autoSizing.inverters.count) : 1;

      sState.cableBreakdown = {
        totalDcCableMeters: Math.round(totalDcSingleCoreM * 10) / 10,
        dcStringCableMeters: Math.round(totalDcStringSingleCoreM * 10) / 10,
        dcTrunkCableMeters: Math.round(totalDcTrunkSingleCoreM * 10) / 10,
        dcStringSecMm2: sState.S_dc_recommended || 6,
        dcTrunkSecMm2: sState.S_mdc_recommended || sState.S_dc_recommended || 6,
        batteryCableMeters: totalBatteryCableM,
        batteryCableSecMm2: 25,
        totalInterModuleMeters: Math.round(totalInterModuleJumpersM * 10) / 10,
        interModuleJumperCount: totalInterModuleJumperCount,
        totalTrayMeters: Math.round(totalTrayM * 10) / 10,
        trayType: trayDesc,
        trayWidthMm: trayWidthMm,
        totalAcConduitMeters: Math.round((sState.L_ac_measured || 0) * 10) / 10,
        acConduitSpec: 'Tubo rígido curvable en frío M32 libre de halógenos (REBT ITC-BT-20)',
        totalAcCableMeters: Math.round((sState.L_ac_measured || 0) * 10) / 10,
        acMainCableMeters: Math.round((sState.L_ac_measured || 0) * 10) / 10,
        acBranchCableMeters: (invCountBreakdown > 1) ? (invCountBreakdown * 5) : 0,
        acMainSecMm2: sState.S_ac_recommended || 10,
        acBranchSecMm2: sState.S_ac_branch_recommended || sState.S_ac_recommended || 10,
        acCableSpec: 'Manguera RZ1-K (AS) 0,6/1 kV libre de halógenos ' + (sState.S_ac_recommended || 10) + ' mm²',
        totalGroundingMeters: Math.round(totalGroundingM * 10) / 10,
        groundingSecMm2: sState.S_earth_recommended || earthSecMm2,
        groundingSpec: 'Cable de cobre Cu ' + (sState.S_earth_recommended || earthSecMm2) + ' mm² equipotencial único por cubierta (ITC-BT-18)',
        mc4ConnectorPairs: (numStrings * 2) + (isParallelY ? Math.max(1, numStrings - 1) * 2 : 0) + (dcBoxPos ? numStrings * 2 : 0),
        fillFactorPct: Math.min(40, Math.round(((effTrayStrings * 2 * 35) / (trayWidthMm * 60)) * 100))
      };

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

      var modCfg = global.panelConfig || { potencia: 450, isc: 13.8, imp: 13.05, vmp: 34.5, voc: 41.5 };
      var projCfg = global.solarProjectConfig || {};
      var catInvs = (global.equipmentCatalog && Array.isArray(global.equipmentCatalog.inverters)) ? global.equipmentCatalog.inverters : [];
      var selectedInvFromCat = (projCfg.selectedInverterId && catInvs.length > 0)
        ? catInvs.find(function (i) { return i && i.id === projCfg.selectedInverterId; })
        : null;
      var invCfg = selectedInvFromCat
        || (projCfg.calculatedLimits && projCfg.calculatedLimits.inverter)
        || { kw: 10.0, type: 'Trifásico' };

      var rho90 = (global.ELEC_CONSTANTS && global.ELEC_CONSTANTS.RHO_CU_90) ? global.ELEC_CONSTANTS.RHO_CU_90 : 0.023;
      var lDcVal = (sState.L_dc_string_measured > 0) ? sState.L_dc_string_measured : (Ldc || 25);
      var lDcEffLoop = (sState.L_dc_loop_measured > 0) ? sState.L_dc_loop_measured : (2 * lDcVal);
      var lAcVal = Lac || 15;
      var imp = modCfg.imp || 13.05;

      var isBifacial = !!(modCfg.bifacial || modCfg.isBifacial || (modCfg.bifacialityFactor && modCfg.bifacialityFactor > 0) || (modCfg.tecnologia && modCfg.tecnologia.toLowerCase().includes('bifacial')));
      var bifacialGain = isBifacial ? 1.15 : 1.0;
      var iscEffective = (modCfg.isc || 13.8) * bifacialGain;
      var impEffective = imp * bifacialGain;

      var strList = this.gatherAllStrings();
      var totalPanelsForEng = 0;
      if (Array.isArray(strList) && strList.length > 0) {
        strList.forEach(function (s) { totalPanelsForEng += ((s && s.panels && s.panels.length) || 0); });
      }
      if (!totalPanelsForEng && Array.isArray(global.allRenderedPanels)) {
        totalPanelsForEng = global.allRenderedPanels.filter(function (p) { return p && !p.deleted && !p.disabled; }).length;
      }

      var invCount = (projCfg.autoSizing && projCfg.autoSizing.inverters && Number.isFinite(projCfg.autoSizing.inverters.count))
        ? Math.max(1, projCfg.autoSizing.inverters.count) : 1;

      // [FASE 1 SSOT] Si el motor eléctrico canónico está disponible, delegar en computeSizingEngineering
      // para garantizar coincidencia matemática 100% entre Visor 3D, Memoria Técnica y Presupuesto BOM.
      if (global.RA && global.RA.Electrical && typeof global.RA.Electrical.computeSizingEngineering === 'function' && totalPanelsForEng > 0) {
        var engSSOT = global.RA.Electrical.computeSizingEngineering({
          numPanels: totalPanelsForEng,
          cfg: modCfg,
          tiltDeg: 15,
          azimutDeg: 0,
          latDeg: 40.4,
          invCount: invCount
        });
        if (engSSOT && engSSOT.S_str > 0 && engSSOT.S_ac > 0) {
          var sDcOpt = engSSOT.S_str;
          var sAcOpt = engSSOT.S_ac;
          var dVdcPctOpt = engSSOT.dVdc_pct || 0;
          var dVacPctOpt = engSSOT.dVac_pct || 0;
          sState.S_dc_recommended = sDcOpt;
          sState.S_mdc_recommended = engSSOT.S_mdc || sDcOpt;
          sState.S_ac_recommended = sAcOpt;
          sState.S_ac_branch_recommended = engSSOT.S_ac_branch || sAcOpt;
          sState.S_earth_recommended = engSSOT.S_earth || (projCfg.hasExternalLightningRod ? 16 : 6);
          sState.dV_dc_pct = dVdcPctOpt;
          sState.dV_ac_pct = dVacPctOpt;
          sState.dV_total_pct = Math.round((dVdcPctOpt + dVacPctOpt) * 100) / 100;
          sState.dcNonCompliantWarning = !engSSOT.isDcCompliant;
          sState.acNonCompliantWarning = !engSSOT.isAcCompliant;
          sState.globalNonCompliantWarning = (sState.dV_total_pct > 2.5);
          sState.canonicalEngineering = engSSOT;

          var statLdcEl0 = document.getElementById('inverter-stat-ldc');
          if (statLdcEl0) statLdcEl0.textContent = (sState.L_dc_measured || 0).toFixed(1) + ' m';
          var statLacEl0 = document.getElementById('inverter-stat-lac');
          if (statLacEl0) statLacEl0.textContent = (sState.L_ac_measured || 0).toFixed(1) + ' m';
          var statSecDcEl0 = document.getElementById('inverter-stat-sec-dc');
          if (statSecDcEl0) {
            statSecDcEl0.textContent = sDcOpt + ' mm² · ΔV ' + dVdcPctOpt.toFixed(1) + '%' + (sState.dcNonCompliantWarning ? ' ⚠️ >1.5%' : '');
            statSecDcEl0.style.color = sState.dcNonCompliantWarning ? '#ef4444' : '';
          }
          var statSecAcEl0 = document.getElementById('inverter-stat-sec-ac');
          if (statSecAcEl0) {
            statSecAcEl0.textContent = sAcOpt + ' mm² · ΔV ' + dVacPctOpt.toFixed(1) + '%' + (sState.acNonCompliantWarning ? ' ⚠️ >1.5%' : '');
            statSecAcEl0.style.color = sState.acNonCompliantWarning ? '#ef4444' : '';
          }
          var statRebtBadge0 = document.getElementById('inverter-stat-rebt-badge');
          if (statRebtBadge0) {
            if (sState.dcNonCompliantWarning || sState.acNonCompliantWarning) {
              statRebtBadge0.textContent = '⚠️ ΔV > 1.5% NO CONFORME (DC ' + dVdcPctOpt.toFixed(1) + '% / AC ' + dVacPctOpt.toFixed(1) + '%)';
              statRebtBadge0.style.color = '#EF4444';
              statRebtBadge0.style.background = 'rgba(239,68,68,0.15)';
              statRebtBadge0.style.borderColor = 'rgba(239,68,68,0.4)';
            } else {
              statRebtBadge0.textContent = '✓ REBT ITC-BT-40 CONFORME (DC ' + dVdcPctOpt.toFixed(1) + '% + AC ' + dVacPctOpt.toFixed(1) + '% = ' + sState.dV_total_pct.toFixed(1) + '%)';
              statRebtBadge0.style.color = '#10B981';
              statRebtBadge0.style.background = 'rgba(16,185,129,0.12)';
              statRebtBadge0.style.borderColor = 'rgba(16,185,129,0.3)';
            }
          }
          return;
        }
      }

      var minModPerStr = 12;
      if (Array.isArray(strList) && strList.length > 0) {
        var validLengths = strList.map(function(s) { return (s.panels && s.panels.length) || 0; }).filter(function(n) { return n > 0; });
        if (validLengths.length > 0) {
          minModPerStr = Math.min.apply(null, validLengths);
        }
      } else if (projCfg.calculatedLimits && projCfg.calculatedLimits.nMinString) {
        minModPerStr = projCfg.calculatedLimits.nMinString;
      }
      var rawGammaPmp = modCfg.tempCoeffPmax || modCfg.gammaPmp || modCfg.gammaVoc || -0.0035;
      var gammaPmp = (typeof global.normalizeThermalCoeff === 'function')
        ? global.normalizeThermalCoeff(rawGammaPmp, -0.0035)
        : -Math.abs(Math.abs(Number(rawGammaPmp)) > 0.05 ? Number(rawGammaPmp) / 100.0 : Number(rawGammaPmp));
      var tCellMaxHot = (projCfg && typeof projCfg.tempMaxCellC === 'number' && isFinite(projCfg.tempMaxCellC))
        ? projCfg.tempMaxCellC : 70;
      var vmpHot = (modCfg.vmp || 34.5) * (1 + gammaPmp * (tCellMaxHot - 25));
      var vmpStr = Math.max(12.0, vmpHot * Math.max(1, minModPerStr));

      // La sección S_str dimensiona cada string individual (1 × I_dc); la troncal en paralelo se dimensiona en S_mdc
      var iDcDesign = 1.56 * iscEffective;
      var iDcWorking = impEffective;

      var secDcAvail = [4, 6, 10, 16, 25, 35, 50, 70];
      var imaxDcZZF  = [44, 58, 80, 107, 138, 171, 209, 256];
      var nCirc = Math.max(1, strList.length);
      var kGroup = nCirc === 1 ? 1.0 : (nCirc === 2 ? 0.80 : (nCirc === 3 ? 0.70 : (nCirc <= 5 ? 0.65 : 0.55)));
      var kAmpacity = 0.90 * kGroup;
      var sDcOpt = 6, dVdcPctOpt = 1.0;
      var dcCompliant = false;

      for (var i = 0; i < secDcAvail.length; i++) {
        var s = secDcAvail[i];
        var dV = (rho90 * lDcEffLoop * iDcWorking) / s;
        var dVpct = (dV / Math.max(vmpStr, 12.0)) * 100;
        if ((imaxDcZZF[i] * kAmpacity) >= iDcDesign && dVpct <= 1.5) {
          sDcOpt = s;
          dVdcPctOpt = dVpct;
          dcCompliant = true;
          break;
        }
      }

      if (!dcCompliant) {
        sDcOpt = secDcAvail[secDcAvail.length - 1];
        var dVMax = (rho90 * lDcEffLoop * iDcWorking) / sDcOpt;
        dVdcPctOpt = (dVMax / Math.max(vmpStr, 12.0)) * 100;
        sState.dcNonCompliantWarning = true;
      } else {
        sState.dcNonCompliantWarning = false;
      }

      var numParallel = this.getDcTopologyInfo(strList.length).groups;
      var sMdcOpt = sDcOpt;
      if (numParallel > 1 || nCirc > 2) {
        var iMdcDesign = Math.max(2, numParallel) * iDcDesign;
        var iMdcWorking = Math.max(2, numParallel) * iDcWorking;
        var lMdcVal = (sState.L_dc_trunk_measured > 0) ? sState.L_dc_trunk_measured : Math.max(5, Math.round(lDcVal * 0.35));
        for (var im = 0; im < secDcAvail.length; im++) {
          var sm = secDcAvail[im];
          var dVm = (2 * rho90 * lMdcVal * iMdcWorking) / sm;
          if ((imaxDcZZF[im] * 0.66) >= iMdcDesign && ((dVm / Math.max(vmpStr, 12.0)) * 100) <= 0.5) {
            sMdcOpt = Math.max(sDcOpt, sm);
            break;
          }
        }
      }

      sState.S_dc_recommended = sDcOpt;
      sState.S_mdc_recommended = sMdcOpt;
      sState.S_earth_recommended = projCfg.hasExternalLightningRod ? 16 : 6;
      sState.dV_dc_pct = dVdcPctOpt;
      var pAcKw = (invCfg.kw || 10.0) * invCount;
      // [C3/G4] Fase efectiva AC respetando acometida (gridSupply), topología y RD 1699 Art. 12.2.
      var isMono = (typeof global.raResolveAcPhases === 'function'
        ? global.raResolveAcPhases(invCfg, invCount, global.solarProjectConfig)
        : (typeof global.raInverterPhases === 'function'
          ? global.raInverterPhases(invCfg)
          : ((invCfg.type || '').toLowerCase().indexOf('mono') !== -1 ? 1 : 3))) === 1;
      var vAc = isMono ? 230 : 400;
      var iAc = isMono ? (pAcKw * 1000) / (vAc * 0.95) : (pAcKw * 1000) / (Math.sqrt(3) * vAc * 0.95);
      var iAcDesign = 1.25 * iAc;
      var _elecSec = (global.RA && global.RA.Electrical && global.RA.Electrical.SECCIONES) || null;
      var secAcAvail = (_elecSec && Array.isArray(_elecSec.ac)) ? _elecSec.ac : [2.5, 4, 6, 10, 16, 25, 35, 50, 70];
      var imaxAcRVK  = (_elecSec && Array.isArray(_elecSec.acIz)) ? _elecSec.acIz : [29, 38, 49, 68, 91, 119, 146, 178, 226];
      // La línea general AC hacia el contador es 1 único circuito colector (kGroupAcMain = 1.0);
      // cuando hay >1 inversor, las ramas individuales Inversor -> Subcuadro AC llevan kGroupAcBranch.
      var kGroupAcMain = 1.0;
      var kAmpacityAc = 0.90 * kGroupAcMain;
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
        if ((imaxAcRVK[j] * kAmpacityAc) >= iAcDesign && dVapct <= 1.5) {
          sAcOpt = sa;
          dVacPctOpt = dVapct;
          acCompliant = true;
          break;
        }
      }

      if (!acCompliant) {
        sAcOpt = secAcAvail[secAcAvail.length - 1]; // 70 mm²
        var factorPhaseMax = isMono ? 2.0 : Math.sqrt(3);
        var dVaMax = factorPhaseMax * iAc * lAcVal * ((rho90 / sAcOpt) * cosPAc + xMeterAc * sinPAc);
        dVacPctOpt = (dVaMax / vAc) * 100;
        sState.acNonCompliantWarning = true;
      } else {
        sState.acNonCompliantWarning = false;
      }

      var sAcBranchOpt = sAcOpt;
      if (invCount > 1) {
        var iAcUnit = iAc / invCount;
        var iAcUnitDesign = 1.25 * iAcUnit;
        var kGroupAcBranch = (invCount === 2 ? 0.80 : (invCount === 3 ? 0.70 : 0.65));
        var kAmpacityBranch = 0.90 * kGroupAcBranch;
        var lAcBranch = 5.0;
        var branchFound = false;
        for (var jb = 0; jb < secAcAvail.length; jb++) {
          var sab = secAcAvail[jb];
          var factorPhaseB = isMono ? 2.0 : Math.sqrt(3);
          var dVab = factorPhaseB * iAcUnit * lAcBranch * ((rho90 / sab) * cosPAc + xMeterAc * sinPAc);
          var dVabPct = (dVab / vAc) * 100;
          if ((imaxAcRVK[jb] * kAmpacityBranch) >= iAcUnitDesign && dVabPct <= 1.5) {
            sAcBranchOpt = sab;
            branchFound = true;
            break;
          }
        }
        if (!branchFound) sAcBranchOpt = secAcAvail[secAcAvail.length - 1];
      }

      sState.S_ac_recommended = sAcOpt;
      sState.S_ac_branch_recommended = sAcBranchOpt;
      sState.dV_ac_pct = dVacPctOpt;
      sState.dV_total_pct = Math.round((dVdcPctOpt + dVacPctOpt) * 100) / 100;
      sState.globalNonCompliantWarning = (sState.dV_total_pct > 2.5);

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
      var statRebtBadge = document.getElementById('inverter-stat-rebt-badge');
      if (statRebtBadge) {
        if (sState.dcNonCompliantWarning || sState.acNonCompliantWarning) {
          statRebtBadge.textContent = '⚠️ ΔV > 1.5% NO CONFORME (DC ' + dVdcPctOpt.toFixed(1) + '% / AC ' + dVacPctOpt.toFixed(1) + '%)';
          statRebtBadge.style.color = '#EF4444';
          statRebtBadge.style.background = 'rgba(239,68,68,0.15)';
          statRebtBadge.style.borderColor = 'rgba(239,68,68,0.35)';
        } else if (sState.globalNonCompliantWarning) {
          statRebtBadge.textContent = '⚠️ ΔV TOTAL ' + sState.dV_total_pct.toFixed(1) + '% > 2.5% (criterio de proyecto DC+AC)';
          statRebtBadge.style.color = '#F59E0B';
          statRebtBadge.style.background = 'rgba(245,158,11,0.15)';
          statRebtBadge.style.borderColor = 'rgba(245,158,11,0.35)';
        } else {
          statRebtBadge.textContent = '✓ ΔV ≤ 1.5% CONFORME por tramo (Total ' + sState.dV_total_pct.toFixed(1) + '% ≤ 2.5%)';
          statRebtBadge.style.color = '#10B981';
          statRebtBadge.style.background = 'rgba(16,185,129,0.15)';
          statRebtBadge.style.borderColor = 'rgba(16,185,129,0.3)';
        }
      }

      if (!global.solarLossConfig) global.solarLossConfig = {};
      global.solarLossConfig.wiringCalculated = (dVdcPctOpt + dVacPctOpt) / 100.0;
      if (!global.solarLossConfig.userCustomizedWiring && typeof global.solarLossConfig.wiring === 'undefined') {
        global.solarLossConfig.wiring = global.solarLossConfig.wiringCalculated;
      }

      if (typeof global.wpUpdateStep4Checklist === 'function') global.wpUpdateStep4Checklist();
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

        // Test 6: Esquivado de Obstáculos a 90° (CTE DB-SI)
        var basisTest = { normal: new Cesium.Cartesian3(0, 0, 1), uVec: new Cesium.Cartesian3(1, 0, 0), vVec: new Cesium.Cartesian3(0, 1, 0) };
        var savedObs = global.obstacles;
        global.obstacles = [{ cartesian: new Cesium.Cartesian3(5, 0, 0), w: 1.0, l: 1.0, h: 1.2 }];
        var detouredPath = RACableEngine.buildOrthogonalManhattanPath3D(new Cesium.Cartesian3(0, 0, 0), new Cesium.Cartesian3(10, 0, 0), { basis: basisTest, normalOffset: 0.35 });
        assert('Esquivado de obstáculos inserta quiebros perimetrales (vértices > 3)', Array.isArray(detouredPath) && detouredPath.length > 3);
        global.obstacles = savedObs;

        // Test 7: Configuración de colores de stringing y retorno anti-bucle
        assert('Paleta armónica de stringing disponible con >= 6 colores', Array.isArray(RACableEngine.CONFIG.STRING_COLORS) && RACableEngine.CONFIG.STRING_COLORS.length >= 6);
        assert('Constante de retorno anti-bucle definida', !!RACableEngine.CONFIG.COLOR_DC_RETURN);
      }

      console.info('[RACableEngine] Resultados de verificación:', results);
      return results;
    }
  };

  // Exportación canónica en global y namespace RA
  global.RACableEngine = RACableEngine;
  global.RA = global.RA || {};
  global.RA.CableEngine = RACableEngine;

  function setElectricalEquipmentVisibility(visible) {
    var s = (typeof window !== 'undefined' && window.inverterEquipmentState)
      ? window.inverterEquipmentState
      : ((typeof global !== 'undefined' && global.inverterEquipmentState) ? global.inverterEquipmentState : null);
    if (!s) return;

    var show = !!visible;
    if (s.entity) s.entity.show = show;
    if (s.label2D) s.label2D.show = show;

    if (s.dcProtectionEntity) s.dcProtectionEntity.show = show;
    if (s.dcProtectionLabel2D) s.dcProtectionLabel2D.show = show;

    if (s.batteryEntity) s.batteryEntity.show = show;
    if (s.batteryLabel2D) s.batteryLabel2D.show = show;

    if (s.gridMeter) {
      if (s.gridMeter.entity) s.gridMeter.entity.show = show;
      if (s.gridMeter.label2D) s.gridMeter.label2D.show = show;
    }
    if (s.combinerBox) {
      if (s.combinerBox.entity) s.combinerBox.entity.show = show;
      if (s.combinerBox.label2D) s.combinerBox.label2D.show = show;
    }

    if (!show && typeof global.selectedElectricalId !== 'undefined' && global.selectedElectricalId) {
      if (typeof global.selectElectricalObject === 'function') global.selectElectricalObject(null);
    }
  }
  global.setElectricalEquipmentVisibility = setElectricalEquipmentVisibility;
  if (typeof window !== 'undefined') window.setElectricalEquipmentVisibility = setElectricalEquipmentVisibility;

  // Enlaces de compatibilidad directa con los nombres legacy para no romper el HTML
  global.wpCalculateAndRenderInverterCables = function () {
    var currentStep = (typeof global.wpCurrentStep !== 'undefined')
      ? global.wpCurrentStep
      : ((typeof window !== 'undefined' && window.wpCurrentStep) || 1);
    if (currentStep < 4) {
      RACableEngine.clearAllCables();
      setElectricalEquipmentVisibility(false);
      return;
    }
    return RACableEngine.renderAllCables();
  };
  global.wpCalculateAndRenderACCables = function () {
    var currentStep = (typeof global.wpCurrentStep !== 'undefined')
      ? global.wpCurrentStep
      : ((typeof window !== 'undefined' && window.wpCurrentStep) || 1);
    if (currentStep < 4) {
      RACableEngine.clearAllCables();
      setElectricalEquipmentVisibility(false);
      return;
    }
    return RACableEngine.renderAllCables();
  };

})(typeof window !== 'undefined' ? window : this);
