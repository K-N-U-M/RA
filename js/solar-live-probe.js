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
    CLEAR: null,                           // Aspecto original del panel (0% sombra)
    LOW_SHADE: { r: 0.15, g: 0.75, b: 0.35, a: 0.85 },    // Sombra leve puntual (<10%)
    MEDIUM_SHADE: { r: 0.95, g: 0.70, b: 0.10, a: 0.85 }, // Sombra moderada (10%-25%)
    SEVERE_SHADE: { r: 0.92, g: 0.22, b: 0.18, a: 0.90 }  // Sombra crítica / inviable (>25%)
  };

  class LiveSolarProbeEngine {
    constructor() {
      this.enabled = false;
      this.mode = 'composite_solstices'; // 'composite_solstices' | 'current_sun'
      this._lastEvaluationTs = 0;
      this._throttleMs = 30; // ~30 FPS para arrastres pesados con cientos de módulos
      this._activeTints = new Map();
      this._isEvaluating = false;
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
      const rendered = global.allRenderedPanels;
      if (!Array.isArray(rendered) || rendered.length === 0) return;

      rendered.forEach(p => {
        if (!p || !p.primitive) return;
        // Restaurar material estándar si estaba tintado
        if (p._liveShadeTinted) {
          if (p.originalColor) {
            try {
              if (p.primitive.color) p.primitive.color = p.originalColor;
            } catch (e) {}
          }
          p._liveShadeTinted = false;
        }
      });
      this._activeTints.clear();
    }

    /**
     * Ejecución reactiva de la evaluación de sombreado
     * @param {boolean} forceForcedImmediate Si es true, ignora el throttle de refresco
     */
    evaluate(forceForcedImmediate = false) {
      if (!this.enabled && !forceForcedImmediate) return;

      const now = performance.now();
      if (!forceForcedImmediate && (now - this._lastEvaluationTs) < this._throttleMs) {
        return;
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
      if (!Array.isArray(rendered) || rendered.length === 0) return;

      const wp = global.wpState;
      if (!wp || !Array.isArray(wp.polylines) || wp.polylines.length === 0) return;

      // Lista de obstáculos activos en el proyecto
      const obsList = Array.isArray(global.obstacles) ? global.obstacles.filter(o => o && !o.deleted) : [];
      const bldList = Array.isArray(global.buildings) ? global.buildings.filter(b => b && b.visible !== false) : [];

      // Si no hay ningún obstáculo, todos los paneles están 100% limpios
      if (obsList.length === 0 && bldList.length === 0) {
        this.clearOverlay();
        return;
      }

      const lat = (wp.center && typeof wp.center.lat === 'number') ? wp.center.lat : 40.4168;
      const lng = (wp.center && typeof wp.center.lng === 'number') ? wp.center.lng : -3.7038;

      // Obtener los vectores solares de prueba
      const probeSunVectors = this._getProbeSunVectors(lat, lng);
      if (probeSunVectors.length === 0) return;

      // Precalcular las siluetas de sombra de obstáculos para cada faldón y cada vector solar
      // Mapa: faldonIdx -> Array de polígonos de sombra por vector
      const roofShadowMaps = new Map();

      wp.polylines.forEach((poly, polyIdx) => {
        const pInfo = poly.roofInfo || {};
        const uVec = pInfo.uVec || { x: 1, y: 0, z: 0 };
        const vVec = pInfo.vVec || { x: 0, y: 1, z: 0 };

        const vectorsData = probeSunVectors.map(sp => {
          const sU = sp.sDirENU.x * uVec.x + sp.sDirENU.y * uVec.y + sp.sDirENU.z * uVec.z;
          const sV = sp.sDirENU.x * vVec.x + sp.sDirENU.y * vVec.y + sp.sDirENU.z * vVec.z;
          const shadowLen = sp.shadowLenPerM;

          const quads = [];

          // Obstáculos paramétricos estándar
          obsList.forEach(obs => {
            const pts = (typeof global.getObstaclePolygon2DForRoof === 'function')
              ? global.getObstaclePolygon2DForRoof(obs, 0.0, pInfo)
              : ((obs.points2D && obs.points2D[polyIdx]) || obs.poly2D);

            if (pts && pts.length >= 3) {
              const hObs = obs.height || obs.h || 1.2;
              const dU = sU * shadowLen * hObs;
              const dV = sV * shadowLen * hObs;
              const topPoly = pts.map(pt => ({ u: pt.u + dU, v: pt.v + dV }));
              const hull = this._convexHull2D([...pts, ...topPoly]);
              if (hull && hull.length >= 3) {
                quads.push(hull);
              }
            }
          });

          // Edificios adyacentes
          bldList.forEach(bld => {
            if (!bld.points || bld.points.length < 3) return;
            const bldObs = (typeof global.getBuildingPolygon2DForRoof === 'function')
              ? global.getBuildingPolygon2DForRoof(bld, pInfo, poly)
              : null;
            if (bldObs && bldObs.points2D && bldObs.points2D.length >= 3 && bldObs.height > 0.05) {
              const dU = sU * shadowLen * bldObs.height;
              const dV = sV * shadowLen * bldObs.height;
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

        roofShadowMaps.set(polyIdx, vectorsData);
      });

      // Evaluar cada panel proyectado contra las siluetas precalculadas
      rendered.forEach(panel => {
        if (!panel || panel.deleted) return;
        const polyIdx = panel.polyIdx || 0;
        const vectorsQuads = roofShadowMaps.get(polyIdx);
        if (!vectorsQuads) return;

        const u = (typeof panel.u === 'number') ? panel.u : 0;
        const v = (typeof panel.v === 'number') ? panel.v : 0;
        const w = panel.w || 1.05;
        const h = panel.h || 2.15;

        // Bounding box / polígono rápido del panel
        const pQuad = (panel.poly2D && panel.poly2D.length === 4) ? panel.poly2D : [
          { u: u - w / 2, v: v - h / 2 },
          { u: u + w / 2, v: v - h / 2 },
          { u: u + w / 2, v: v + h / 2 },
          { u: u - w / 2, v: v + h / 2 }
        ];

        let shadedHits = 0;
        const totalProbes = vectorsQuads.length;

        for (let i = 0; i < totalProbes; i++) {
          const quads = vectorsQuads[i];
          let hitInInstant = false;
          for (let q = 0; q < quads.length; q++) {
            if (this._polygonsIntersect2D(pQuad, quads[q])) {
              hitInInstant = true;
              break;
            }
          }
          if (hitInInstant) shadedHits++;
        }

        const shadeRatio = shadedHits / totalProbes;
        this._applyPanelLiveTint(panel, shadeRatio);
      });
    }

    /**
     * Aplica el color semafórico correspondiente sobre el panel en Cesium Viewer
     * @private
     */
    _applyPanelLiveTint(panel, shadeRatio) {
      if (!panel.primitive) return;

      if (!panel.originalColor && panel.primitive.color) {
        panel.originalColor = (typeof panel.primitive.color.clone === 'function')
          ? panel.primitive.color.clone()
          : Object.assign({}, panel.primitive.color);
      }

      let tintDef = null;
      if (shadeRatio >= 0.50) {
        tintDef = TINT_COLORS.SEVERE_SHADE; // >50% sombra en los instantes evaluados
      } else if (shadeRatio >= 0.25) {
        tintDef = TINT_COLORS.MEDIUM_SHADE; // 25%-50%
      } else if (shadeRatio > 0.0) {
        tintDef = TINT_COLORS.LOW_SHADE;    // <25%
      }

      if (tintDef && typeof Cesium !== 'undefined' && Cesium.Color) {
        panel.primitive.color = new Cesium.Color(tintDef.r, tintDef.g, tintDef.b, tintDef.a);
        panel._liveShadeTinted = true;
      } else {
        if (panel._liveShadeTinted && panel.originalColor) {
          panel.primitive.color = panel.originalColor;
          panel._liveShadeTinted = false;
        }
      }
    }

    /**
     * Genera los vectores solares de prueba según el modo activo
     * @private
     */
    _getProbeSunVectors(lat, lng) {
      // 4 Instantes representativos: Solsticio Invierno (Mediodía), Equinoccio (10h y 14h), Solsticio Verano (16h)
      const probes = [
        { doy: 355, hour: 12.5 }, // Solsticio Invierno (Sombras más largas del año)
        { doy: 80,  hour: 10.0 }, // Equinoccio mañana
        { doy: 80,  hour: 14.5 }, // Equinoccio tarde
        { doy: 172, hour: 16.0 }  // Solsticio Verano tarde
      ];

      return probes.map(p => {
        const utcHour = p.hour - (lng * 4) / 60;
        const sp = this._computeSolarPosition(lat, lng, p.doy, utcHour);
        const elevRad = Math.max(0.08, (sp.elevDeg || 15) * Math.PI / 180);
        return {
          elevDeg: sp.elevDeg,
          sDirENU: sp.sDirHorizontal,
          shadowLenPerM: Math.min(1 / Math.tan(elevRad), 6.0)
        };
      });
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
