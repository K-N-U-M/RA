/**
 * ============================================================================
 * LIVE SOLAR PROBE MODULE (js/solar-live-probe.js) — AAA CAD Interactive Engine
 * ============================================================================
 * Motor desacoplado, ultraligero y de alta fidelidad para evaluación térmica/sombras
 * en tiempo real (<5ms por frame) durante la edición interactiva en el Paso 2.
 *
 * Principios de Diseño:
 * 1. Desacoplo Absoluto: No contamina los resultados de auditoría anual (Paso 3).
 * 2. Cero Reconstrucción 3D: Aplica tintes en el material de panel existente.
 * 3. Proyección Vectorial 2D Afín: Cálculo en el espacio paramétrico (U, V) de cubierta.
 * 4. Modos Operativos:
 *    - 'current_sun': Evalúa la sombra para la hora solar actual del visor.
 *    - 'composite_solstices': Evaluación rápida de 4 instantes críticos anuales.
 * ============================================================================
 */

(function(global) {
  'use strict';

  // Configuración de paleta de estrés térmico/sombras (Gradiente termográfico CAD)
  const TINT_COLORS = {
    CLEAR: { r: 0.06, g: 0.72, b: 0.51, a: 0.35 },        // Esmeralda translúcido sutil (0% sombra)
    LOW_SHADE: { r: 0.52, g: 0.80, b: 0.09, a: 0.65 },    // Sombra leve puntual (<10%) - Lima/Amarillo verdoso
    MEDIUM_SHADE: { r: 0.96, g: 0.62, b: 0.04, a: 0.80 }, // Sombra moderada (10%-25%) - Ámbar
    SEVERE_SHADE: { r: 0.93, g: 0.27, b: 0.27, a: 0.88 }  // Sombra crítica / inviable (>25%) - Rojo carmesí
  };

  class LiveSolarProbeEngine {
    constructor() {
      this.enabled = false;
      this.mode = 'composite_solstices'; // 'composite_solstices' | 'current_sun'
      this._lastEvaluationTs = 0;
      // [AUD-2026 v2 · PERF2-02] Cadencia 125 ms (~8 Hz) durante el gesto + pase final diferido;
      // el coste por pase baja drásticamente con el batch persistente (PERF2-04).
      this._throttleMs = 125;
      this._trailingTimer = null;
      this._activeTints = new Map();
      this._isEvaluating = false;
      this._overlayPrimitive = null;
      // [AUD-2026 v2 · PERF2-04] Estado del batch persistente (evita rebatch completo por pase).
      this._overlayIds = null;
      this._overlayTints = null;
      this._overlayPanelIdx = null;
      this._overlayCorners = null;
    }

    /**
     * Inicialización del motor y anclaje a eventos de Cesium/Viewer
     */
    init() {
      if (typeof global !== 'undefined' && global.RA && global.RA.log) {
        global.RA.log.info('[LiveSolarProbe] Motor de sondeo solar en tiempo real inicializado.');
      }
    }

    /**
     * Activa o desactiva el modo de mapa en tiempo real
     * @param {boolean} state 
     */
    setEnabled(state) {
      this.enabled = !!state;
      this._syncUI();

      if (this.enabled) {
        this.evaluate();
      } else {
        this.clearOverlay();
      }

      if (typeof global.showToast === 'function') {
        global.showToast(
          this.enabled ? 'Sondeo solar en tiempo real activado (Paso 2)' : 'Vista fotorealista restaurada',
          this.enabled ? 'info' : 'default',
          1800
        );
      }
    }

    /**
     * Conmuta el estado activo/inactivo (atajo de teclado 'H')
     */
    toggle() {
      this.setEnabled(!this.enabled);
    }

    /**
     * Limpia los tintes aplicados restaurando la apariencia nativa de los módulos
     */
    clearOverlay() {
      // [PERF2-02] Cancelar el pase final diferido pendiente al limpiar la capa.
      if (this._trailingTimer != null) {
        clearTimeout(this._trailingTimer);
        this._trailingTimer = null;
      }
      const viewer = global.viewer;
      if (this._overlayPrimitive && viewer && viewer.scene && viewer.scene.primitives) {
        try {
          viewer.scene.primitives.remove(this._overlayPrimitive);
          if (typeof this._overlayPrimitive.destroy === 'function' && !this._overlayPrimitive.isDestroyed()) {
            this._overlayPrimitive.destroy();
          }
        } catch (e) {}
        this._overlayPrimitive = null;
        if (viewer.scene && typeof viewer.scene.requestRender === 'function') {
          viewer.scene.requestRender();
        }
      }
      // [PERF2-04] El registro del batch persistente también muere con la capa.
      this._overlayIds = null;
      this._overlayTints = null;
      this._overlayPanelIdx = null;
      this._overlayCorners = null;
      this._activeTints.clear();
    }

    /**
     * [AUD-2026 v2 · PERF2-04] ¿Sigue intacta la geometría del panelado (posición/orientación)?
     * Compara, índice a índice, los 4 vértices de cada panel contra el snapshot del batch vivo.
     * @private
     */
    _panelSetUnchanged(panelTints) {
      const snap = this._overlayCorners;
      if (!snap || snap.length !== panelTints.length) return false;
      for (let i = 0; i < panelTints.length; i++) {
        const item = panelTints[i];
        const corners = (item && item.panel) ? item.panel.corners : null;
        const saved = snap[i];
        const valid = Array.isArray(corners) && corners.length >= 4 && !!item.tint;
        if (!valid) {
          if (saved) return false;
          continue;
        }
        if (!saved) return false;
        for (let k = 0; k < 4; k++) {
          const c = corners[k];
          const s = saved[k];
          if (Math.abs(c.x - s[0]) > 1e-6 || Math.abs(c.y - s[1]) > 1e-6 || Math.abs(c.z - s[2]) > 1e-6) {
            return false;
          }
        }
      }
      return true;
    }

    /**
     * [PERF2-04] Re-tintado incremental por atributos de instancia: solo toca las instancias
     * cuyo color cambió; la geometría permanece en GPU. Devuelve false si hay que rebatchear.
     * @private
     */
    _retintOverlayAttributes(panelTints) {
      if (typeof Cesium === 'undefined') return false;
      const prim = this._overlayPrimitive;
      if (!prim || (prim.isDestroyed && prim.isDestroyed())) return false;
      if (prim.ready !== true) return false;
      try {
        for (let j = 0; j < this._overlayIds.length; j++) {
          const tint = panelTints[this._overlayPanelIdx[j]].tint;
          const eff = this._overlayTints[j];
          if (eff.r !== tint.r || eff.g !== tint.g || eff.b !== tint.b || eff.a !== tint.a) {
            const attrs = prim.getGeometryInstanceAttributes(this._overlayIds[j]);
            attrs.color = Cesium.ColorGeometryInstanceAttribute.fromColor(new Cesium.Color(tint.r, tint.g, tint.b, tint.a));
            eff.r = tint.r; eff.g = tint.g; eff.b = tint.b; eff.a = tint.a;
          }
        }
        return true;
      } catch (e) {
        // Atributos no disponibles (estado imprevisto): cae al rebatch completo, sin riesgo.
        return false;
      }
    }

    /**
     * Ejecución reactiva de la evaluación de sombreado
     * @param {boolean} forceForcedImmediate Si es true, ignora el throttle de refresco
     */
    evaluate(forceForcedImmediate = false) {
      if (!this.enabled && !forceForcedImmediate) return;

      const now = performance.now();
      if (!forceForcedImmediate && (now - this._lastEvaluationTs) < this._throttleMs) {
        // [PERF2-02] Cambio dentro de la ventana: agenda un pase final al expirar la cadencia,
        // así no se pierde la última posición sea cual sea la longitud del gesto.
        if (this._trailingTimer == null) {
          this._trailingTimer = setTimeout(() => { this._trailingTimer = null; this.evaluate(); }, this._throttleMs + 15);
        }
        return;
      }
      if (this._trailingTimer != null) {
        clearTimeout(this._trailingTimer);
        this._trailingTimer = null;
      }
      this._lastEvaluationTs = now;

      if (this._isEvaluating) return;
      this._isEvaluating = true;

      try {
        this._runEvaluationCore();
      } catch (err) {
        console.warn('[LiveSolarProbe] Error en evaluación en tiempo real:', err);
      } finally {
        this._isEvaluating = false;
      }
    }

    /**
     * Núcleo analítico de evaluación vectorial en cubierta
     * @private
     */
    _runEvaluationCore() {
      const rendered = global.allRenderedPanels;
      if (!Array.isArray(rendered) || rendered.length === 0) {
        this.clearOverlay();
        return;
      }

      const wp = global.wpState || (typeof global.WP !== 'undefined' ? global.WP : null);
      if (!wp || !Array.isArray(wp.polylines) || wp.polylines.length === 0) {
        this.clearOverlay();
        return;
      }

      // Lista de obstáculos activos en el proyecto
      const obsList = Array.isArray(global.obstacles) ? global.obstacles.filter(o => o && !o.deleted) : [];
      const bldList = Array.isArray(global.buildings) ? global.buildings.filter(b => b && b.visible !== false) : [];

      // Si no hay ningún obstáculo, todos los paneles están limpios (tinte esmeralda traslúcido de confirmación activa)
      if (obsList.length === 0 && bldList.length === 0) {
        const clearTints = rendered.map(panel => ({
          panel: panel,
          shadeRatio: 0.0,
          tint: TINT_COLORS.CLEAR
        }));
        this._renderHeatmapOverlay(clearTints);
        return;
      }

      const lat = (wp.center && typeof wp.center.lat === 'number') ? wp.center.lat : 40.4168;
      const lng = (wp.center && typeof wp.center.lng === 'number') ? wp.center.lng : -3.7038;

      // Obtener los vectores solares de prueba
      const probeSunVectors = this._getProbeSunVectors(lat, lng);
      if (!probeSunVectors || probeSunVectors.length === 0) return;

      // Precalcular las siluetas de sombra de obstáculos para cada faldón y cada vector solar
      const roofShadowMaps = new Map();

      wp.polylines.forEach((poly, polyIdx) => {
        const pInfo = poly.roofInfo || (typeof global.computeSinglePolylineRoofInfo === 'function' ? global.computeSinglePolylineRoofInfo(poly.points, poly) : null);
        if (!pInfo) return;

        const uVec = pInfo.uVec || (typeof Cesium !== 'undefined' ? new Cesium.Cartesian3(1, 0, 0) : { x: 1, y: 0, z: 0 });
        const vVec = pInfo.vVec || (typeof Cesium !== 'undefined' ? new Cesium.Cartesian3(0, 1, 0) : { x: 0, y: 1, z: 0 });

        const vectorsData = probeSunVectors.map(sp => {
          let sU = 0, sV = 0;
          if (typeof Cesium !== 'undefined' && Cesium.Cartesian3 && sp.sDirENU) {
            const sENU = (typeof sp.sDirENU.x === 'number')
              ? sp.sDirENU
              : new Cesium.Cartesian3(sp.sDirENU.x || 0, sp.sDirENU.y || 0, 0);
            sU = Cesium.Cartesian3.dot(sENU, uVec);
            sV = Cesium.Cartesian3.dot(sENU, vVec);
          } else {
            sU = (sp.sDirENU ? sp.sDirENU.x : 0) * (uVec.x || 1) + (sp.sDirENU ? sp.sDirENU.y : 0) * (uVec.y || 0);
            sV = (sp.sDirENU ? sp.sDirENU.x : 0) * (vVec.x || 0) + (sp.sDirENU ? sp.sDirENU.y : 0) * (vVec.y || 1);
          }

          const quads = [];

          // Obstáculos paramétricos estándar
          obsList.forEach(obs => {
            if (typeof global.getObstacleShadowPolygons2DForRoof === 'function') {
              const oQuads = global.getObstacleShadowPolygons2DForRoof(obs, pInfo, sU, sV, sp.shadowLenPerM);
              if (Array.isArray(oQuads) && oQuads.length > 0) {
                quads.push(...oQuads);
                return;
              }
            }
            const pts = (typeof global.getObstaclePolygon2DForRoof === 'function')
              ? global.getObstaclePolygon2DForRoof(obs, 0.0, pInfo)
              : ((obs.points2D && obs.points2D[polyIdx]) || obs.poly2D);

            if (pts && pts.length >= 3) {
              const hObs = obs.height || obs.h || 1.2;
              const dU = sU * sp.shadowLenPerM * hObs;
              const dV = sV * sp.shadowLenPerM * hObs;
              const topPoly = pts.map(pt => ({ u: pt.u + dU, v: pt.v + dV }));
              const hull = this._convexHull2D([...pts, ...topPoly]);
              if (hull && hull.length >= 3) {
                quads.push(hull);
              }
            }
          });

          // Edificios adyacentes
          bldList.forEach(bld => {
            if (typeof global.getBuildingShadowPolygons2DForRoof === 'function') {
              const bQuads = global.getBuildingShadowPolygons2DForRoof(bld, pInfo, sU, sV, sp.shadowLenPerM, poly);
              if (Array.isArray(bQuads) && bQuads.length > 0) {
                quads.push(...bQuads);
                return;
              }
            }
            if (!bld.points || bld.points.length < 3) return;
            const bldObs = (typeof global.getBuildingPolygon2DForRoof === 'function')
              ? global.getBuildingPolygon2DForRoof(bld, pInfo, poly)
              : null;
            if (bldObs && bldObs.points2D && bldObs.points2D.length >= 3 && bldObs.height > 0.05) {
              const dU = sU * sp.shadowLenPerM * bldObs.height;
              const dV = sV * sp.shadowLenPerM * bldObs.height;
              const pts = bldObs.points2D;
              const topPoly = pts.map(pt => ({ u: pt.u + dU, v: pt.v + dV }));
              const hull = this._convexHull2D([...pts, ...topPoly]);
              if (hull && hull.length >= 3) {
                quads.push(hull);
              }
            }
          });

          return quads;
        });

        roofShadowMaps.set(polyIdx, { pInfo: pInfo, vectorsData: vectorsData });
      });

      // Evaluar cada panel proyectado contra las siluetas precalculadas
      const panelTints = [];

      rendered.forEach(panel => {
        if (!panel || panel.deleted) return;
        const polyIdx = (typeof panel.polyIdx === 'number') ? panel.polyIdx : 0;
        const roofEntry = roofShadowMaps.get(polyIdx);
        if (!roofEntry) return;

        const { pInfo, vectorsData } = roofEntry;
        if (!vectorsData || vectorsData.length === 0) return;

        // Bounding box / polígono del panel en espacio paramétrico (U, V)
        let pQuad = null;
        const invT = (pInfo && pInfo.invTransform) || (pInfo && pInfo.transform && typeof Cesium !== 'undefined' && Cesium.Matrix4 ? Cesium.Matrix4.inverse(pInfo.transform, new Cesium.Matrix4()) : null);

        if (Array.isArray(panel.corners) && panel.corners.length === 4 && invT && pInfo && pInfo.uVec && pInfo.vVec) {
          pQuad = panel.corners.map(c => {
            const locPt = Cesium.Matrix4.multiplyByPoint(invT, c, new Cesium.Cartesian3());
            return {
              u: Cesium.Cartesian3.dot(locPt, pInfo.uVec),
              v: Cesium.Cartesian3.dot(locPt, pInfo.vVec)
            };
          });
        } else if (typeof panel.u === 'number' && typeof panel.v === 'number') {
          const hw = (panel.w || 1.13) / 2;
          const hh = (panel.h || 2.27) / 2;
          pQuad = [
            { u: panel.u - hw, v: panel.v - hh },
            { u: panel.u + hw, v: panel.v - hh },
            { u: panel.u + hw, v: panel.v + hh },
            { u: panel.u - hw, v: panel.v + hh }
          ];
        }

        if (!pQuad || pQuad.length < 3) return;

        let shadedHits = 0;
        const totalProbes = vectorsData.length;

        for (let i = 0; i < totalProbes; i++) {
          const quads = vectorsData[i];
          let hitInInstant = false;
          for (let q = 0; q < quads.length; q++) {
            const fnIntersect = (typeof global.polygonsIntersect2D === 'function')
              ? global.polygonsIntersect2D
              : this._polygonsIntersect2D.bind(this);
            if (fnIntersect(pQuad, quads[q])) {
              hitInInstant = true;
              break;
            }
          }
          if (hitInInstant) shadedHits++;
        }

        const shadeRatio = totalProbes > 0 ? (shadedHits / totalProbes) : 0;
        let tint = TINT_COLORS.CLEAR;
        if (shadeRatio >= 0.25) {
          tint = TINT_COLORS.SEVERE_SHADE;
        } else if (shadeRatio >= 0.10) {
          tint = TINT_COLORS.MEDIUM_SHADE;
        } else if (shadeRatio > 0.0) {
          tint = TINT_COLORS.LOW_SHADE;
        }

        panelTints.push({
          panel: panel,
          shadeRatio: shadeRatio,
          tint: tint
        });
      });

      this._renderHeatmapOverlay(panelTints);
    }

    /**
     * Genera y actualiza la superposición Cesium 3D en tiempo real sobre los paneles
     * @private
     */
    _renderHeatmapOverlay(panelTints) {
      const viewer = global.viewer;
      if (!viewer || !viewer.scene || !viewer.scene.primitives || typeof Cesium === 'undefined') return;

      // [AUD-2026 v2 · PERF2-04] Capa persistente: si el panelado no movió ni un milímetro y la
      // primitiva está lista, solo se re-tintan las instancias cuyo color cambió (cero rebatch).
      if (panelTints && panelTints.length > 0 &&
          this._overlayPrimitive && !this._overlayPrimitive.isDestroyed() &&
          this._panelSetUnchanged(panelTints) &&
          this._retintOverlayAttributes(panelTints)) {
        if (viewer.scene && typeof viewer.scene.requestRender === 'function') {
          viewer.scene.requestRender();
        }
        return;
      }

      if (this._overlayPrimitive) {
        try {
          viewer.scene.primitives.remove(this._overlayPrimitive);
          if (typeof this._overlayPrimitive.destroy === 'function' && !this._overlayPrimitive.isDestroyed()) {
            this._overlayPrimitive.destroy();
          }
        } catch (e) {}
        this._overlayPrimitive = null;
      }
      // [PERF2-04] El rebatch completo invalida el registro del batch persistente.
      this._overlayIds = null;
      this._overlayTints = null;
      this._overlayPanelIdx = null;
      this._overlayCorners = null;

      if (!panelTints || panelTints.length === 0) {
        if (viewer.scene && typeof viewer.scene.requestRender === 'function') {
          viewer.scene.requestRender();
        }
        return;
      }

      const instances = [];
      // [PERF2-04] Registro del batch persistente (alineado por índice de panelTints).
      const idAcc = [];
      const tintAcc = [];
      const panelIdxAcc = [];
      const cornersSnap = [];

      for (let i = 0; i < panelTints.length; i++) {
        const item = panelTints[i];
        const pData = item.panel;
        const tint = item.tint;

        if (!pData || !Array.isArray(pData.corners) || pData.corners.length < 4 || !tint) {
          cornersSnap.push(null);
          continue;
        }

        const c0 = pData.corners[0];
        const c1 = pData.corners[1];
        const c2 = pData.corners[2];
        const c3 = pData.corners[3];

        const v1 = Cesium.Cartesian3.subtract(c1, c0, new Cesium.Cartesian3());
        const v2 = Cesium.Cartesian3.subtract(c3, c0, new Cesium.Cartesian3());
        let norm = Cesium.Cartesian3.cross(v1, v2, new Cesium.Cartesian3());
        if (Cesium.Cartesian3.magnitude(norm) > 0.001) {
          Cesium.Cartesian3.normalize(norm, norm);
        } else {
          norm = new Cesium.Cartesian3(0, 0, 1);
        }

        // Elevación de 2.5 cm sobre el panel para asegurar perfecta visibilidad sobre PBR
        const offset = Cesium.Cartesian3.multiplyByScalar(norm, 0.025, new Cesium.Cartesian3());
        const elevated = [
          Cesium.Cartesian3.add(c0, offset, new Cesium.Cartesian3()),
          Cesium.Cartesian3.add(c1, offset, new Cesium.Cartesian3()),
          Cesium.Cartesian3.add(c2, offset, new Cesium.Cartesian3()),
          Cesium.Cartesian3.add(c3, offset, new Cesium.Cartesian3())
        ];

        const positions = new Float64Array([
          elevated[0].x, elevated[0].y, elevated[0].z,
          elevated[1].x, elevated[1].y, elevated[1].z,
          elevated[2].x, elevated[2].y, elevated[2].z,
          elevated[3].x, elevated[3].y, elevated[3].z
        ]);

        const normals = new Float32Array([
          norm.x, norm.y, norm.z,
          norm.x, norm.y, norm.z,
          norm.x, norm.y, norm.z,
          norm.x, norm.y, norm.z
        ]);

        const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);

        const polyGeom = new Cesium.Geometry({
          attributes: {
            position: new Cesium.GeometryAttribute({
              componentDatatype: Cesium.ComponentDatatype.DOUBLE,
              componentsPerAttribute: 3,
              values: positions
            }),
            normal: new Cesium.GeometryAttribute({
              componentDatatype: Cesium.ComponentDatatype.FLOAT,
              componentsPerAttribute: 3,
              values: normals
            })
          },
          indices: indices,
          primitiveType: Cesium.PrimitiveType.TRIANGLES,
          boundingSphere: Cesium.BoundingSphere.fromPoints(elevated)
        });

        const color = new Cesium.Color(tint.r, tint.g, tint.b, tint.a);

        instances.push(new Cesium.GeometryInstance({
          geometry: polyGeom,
          attributes: {
            color: Cesium.ColorGeometryInstanceAttribute.fromColor(color)
          },
          id: 'live_probe_p_' + i
        }));
        idAcc.push('live_probe_p_' + i);
        tintAcc.push({ r: tint.r, g: tint.g, b: tint.b, a: tint.a });
        panelIdxAcc.push(i);
        cornersSnap.push([
          c0.x, c0.y, c0.z, c1.x, c1.y, c1.z,
          c2.x, c2.y, c2.z, c3.x, c3.y, c3.z
        ]);
      }

      if (instances.length === 0) return;

      const renderState = (typeof Cesium.RenderState.fromCache === 'function')
        ? Cesium.RenderState.fromCache({
            depthTest: { enabled: true },
            depthMask: false,
            polygonOffset: { enabled: true, factor: -3.0, units: -3.0 }
          })
        : undefined;

      const overlayPrimitive = new Cesium.Primitive({
        geometryInstances: instances,
        appearance: new Cesium.PerInstanceColorAppearance({
          translucent: true,
          flat: true,
          renderState: renderState
        }),
        asynchronous: false
      });

      this._overlayPrimitive = viewer.scene.primitives.add(overlayPrimitive);
      // [PERF2-04] Batch persistente registrado tras la primera construcción.
      this._overlayIds = idAcc;
      this._overlayTints = tintAcc;
      this._overlayPanelIdx = panelIdxAcc;
      this._overlayCorners = cornersSnap;
      if (viewer.scene && typeof viewer.scene.requestRender === 'function') {
        viewer.scene.requestRender();
      }
    }

    /**
     * Genera los vectores solares de prueba según el modo activo
     * @private
     */
    _getProbeSunVectors(lat, lng) {
      const result = [];

      // 1. Instante solar actual en pantalla (si el sol está activo en el visor)
      if (global.solarSimState && global.solarSimState.currentSolarPos && global.solarSimState.currentSolarPos.isDaylight) {
        const cur = global.solarSimState.currentSolarPos;
        const curElev = (typeof cur.alt === 'number') ? cur.alt : (typeof cur.elevationDeg === 'number' ? cur.elevationDeg : 30);
        result.push({
          elevDeg: curElev,
          sDirENU: cur.sDirENU || { x: 0, y: -1, z: 0 },
          shadowLenPerM: cur.shadowLenPerM || Math.min(1 / Math.tan(Math.max(0.08, curElev * Math.PI / 180)), 6.0)
        });
      }

      // 2. Si el modo es compuesto o si no hay sol activo, evaluar instantes clave anuales
      if (this.mode === 'composite_solstices' || result.length === 0) {
        const annualInstants = [
          { doy: 355, hour: 12.5 }, // Solsticio Invierno (Sombras más largas del año)
          { doy: 80,  hour: 10.0 }, // Equinoccio mañana
          { doy: 80,  hour: 14.5 }, // Equinoccio tarde
          { doy: 172, hour: 16.0 }  // Solsticio Verano tarde
        ];

        annualInstants.forEach(p => {
          const utcHour = p.hour - (lng * 4) / 60;
          const sp = this._computeSolarPosition(lat, lng, p.doy, utcHour);
          const elevRad = Math.max(0.08, (sp.elevDeg || 15) * Math.PI / 180);
          result.push({
            elevDeg: sp.elevDeg,
            sDirENU: sp.sDirHorizontal,
            shadowLenPerM: Math.min(1 / Math.tan(elevRad), 6.0)
          });
        });
      }

      return result;
    }

    /**
     * Cálculo astronómico solar ultraligero
     * @private
     */
    _computeSolarPosition(latDeg, lngDeg, dayOfYear, utcHour) {
      const latRad = latDeg * Math.PI / 180;
      const gamma = (2 * Math.PI / 365) * (dayOfYear - 1);
      const decl = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma)
        - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma);

      const eqtime = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma)
        - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));

      const timeOffset = eqtime + 4 * lngDeg;
      const tst = utcHour * 60 + timeOffset;
      const haDeg = (tst / 4) - 180;
      const haRad = haDeg * Math.PI / 180;

      const sinElev = Math.sin(latRad) * Math.sin(decl) + Math.cos(latRad) * Math.cos(decl) * Math.cos(haRad);
      const elevRad = Math.asin(Math.max(-1, Math.min(1, sinElev)));
      const elevDeg = elevRad * 180 / Math.PI;

      const cosAz = (Math.sin(decl) - Math.sin(latRad) * Math.sin(elevRad)) / (Math.cos(latRad) * Math.cos(elevRad) + 1e-6);
      let azRad = Math.acos(Math.max(-1, Math.min(1, cosAz)));
      if (Math.sin(haRad) > 0) azRad = 2 * Math.PI - azRad;

      const sDirHorizontal = {
        x: -Math.sin(azRad),
        y: -Math.cos(azRad),
        z: 0
      };

      return { elevDeg, elevRad, sDirHorizontal };
    }

    /**
     * Algoritmo de envolvente convexa Monotone Chain 2D
     * @private
     */
    _convexHull2D(pts) {
      if (pts.length <= 3) return pts;
      const sorted = pts.slice().sort((a, b) => a.u === b.u ? a.v - b.v : a.u - b.u);
      const cross = (o, a, b) => (a.u - o.u) * (b.v - o.v) - (a.v - o.v) * (b.u - o.u);

      const lower = [];
      for (const p of sorted) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
          lower.pop();
        }
        lower.push(p);
      }

      const upper = [];
      for (let i = sorted.length - 1; i >= 0; i--) {
        const p = sorted[i];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
          upper.pop();
        }
        upper.push(p);
      }

      lower.pop();
      upper.pop();
      return lower.concat(upper);
    }

    /**
     * Test de intersección de polígonos convexos (SAT 2D)
     * @private
     */
    _polygonsIntersect2D(polyA, polyB) {
      if (!polyA || !polyB || polyA.length < 3 || polyB.length < 3) return false;

      const polygons = [polyA, polyB];
      for (let i = 0; i < polygons.length; i++) {
        const polygon = polygons[i];
        for (let i1 = 0; i1 < polygon.length; i1++) {
          const i2 = (i1 + 1) % polygon.length;
          const p1 = polygon[i1];
          const p2 = polygon[i2];

          const normal = { u: -(p2.v - p1.v), v: p2.u - p1.u };

          let minA = Infinity, maxA = -Infinity;
          for (let j = 0; j < polyA.length; j++) {
            const projected = normal.u * polyA[j].u + normal.v * polyA[j].v;
            if (projected < minA) minA = projected;
            if (projected > maxA) maxA = projected;
          }

          let minB = Infinity, maxB = -Infinity;
          for (let j = 0; j < polyB.length; j++) {
            const projected = normal.u * polyB[j].u + normal.v * polyB[j].v;
            if (projected < minB) minB = projected;
            if (projected > maxB) maxB = projected;
          }

          if (maxA < minB || maxB < minA) return false;
        }
      }
      return true;
    }

    /**
     * Sincroniza la apariencia visual del botón en el HUD
     * @private
     */
    _syncUI() {
      const btn = document.getElementById('btn-toggle-live-heatmap');
      if (btn) {
        btn.classList.toggle('active', this.enabled);
        btn.style.borderColor = this.enabled ? 'var(--emerald-500, #10B981)' : 'rgba(255,255,255,0.18)';
        btn.style.color = this.enabled ? '#10B981' : '#fff';
        const badge = btn.querySelector('.badge');
        if (badge) {
          badge.textContent = this.enabled ? 'ACTIVO' : 'PROBE';
          badge.style.background = this.enabled ? 'rgba(16,185,129,0.25)' : 'rgba(245,158,11,0.2)';
          badge.style.color = this.enabled ? '#10B981' : '#f59e0b';
        }
      }
    }
  }

  // Instancia única y exportación en el objeto global
  const instance = new LiveSolarProbeEngine();
  global.LiveSolarProbe = instance;

  // Atajo de teclado 'H' para conmutar el heatmap interactivo
  if (typeof document !== 'undefined') {
    document.addEventListener('keydown', function(e) {
      if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      if (e.key === 'h' || e.key === 'H') {
        if (!e.ctrlKey && !e.metaKey && !e.altKey) {
          instance.toggle();
        }
      }
    });
  }

})(typeof window !== 'undefined' ? window : this);
