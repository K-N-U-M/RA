
  /**
   * [CEL / GHOST OVERRIDE] Conmuta o fuerza la inclusión manual de un módulo podado en el layout activo
   */
  function wpToggleGhostPanel(panelIdOrIdx) {
    if (!window.solarProjectConfig) window.solarProjectConfig = {};
    if (!Array.isArray(window.solarProjectConfig.forcedPanelIds)) {
      window.solarProjectConfig.forcedPanelIds = [];
    }
    const forced = window.solarProjectConfig.forcedPanelIds;
    let targetId = panelIdOrIdx;
    if (typeof panelIdOrIdx === 'number' && Array.isArray(window.allRenderedPanels) && window.allRenderedPanels[panelIdOrIdx]) {
      targetId = window.allRenderedPanels[panelIdOrIdx].panelId;
    }
    if (!targetId) return;

    const idx = forced.indexOf(targetId);
    if (idx >= 0) {
      forced.splice(idx, 1);
    } else {
      forced.push(targetId);
    }

    if (typeof roofPanelsCache !== 'undefined' && roofPanelsCache) {
      roofPanelsCache.sig = "";
      roofPanelsCache.data = null;
    }
    if (typeof window.wpInvalidateHeatmap === 'function') {
      window.wpInvalidateHeatmap('Panel fantasma conmutado');
    }
    if (typeof wpFastRenderSimulatedPanels === 'function') {
      wpFastRenderSimulatedPanels(true);
    }
    if (typeof wpUpdateCommercialPathsUI === 'function') {
      wpUpdateCommercialPathsUI();
    }
    if (typeof recalculateSolarYield === 'function') {
      recalculateSolarYield();
    }
  }
  window.wpToggleGhostPanel = wpToggleGhostPanel;

/**
 * js/solar-heatmap.js — Motor de Simulación Anual de Sombras e Irradiancia (Arquitectura AAA v3)
 * ==============================================================================================
 * Física solar rigurosa, Time-Slicing dinámico (60 FPS sin congelación) y Diagnóstico MLPE.
 *
 * Características del motor:
 *   1. Hasta 192 instantes anuales (12 meses × 16 horas, de 6:00 a 21:00; se omiten los de sol < 10°)
 *   2. Corte de horizonte astronómico (elevación solar ≥ 3º)
 *   3. Ley del Coseno (ángulo de incidencia real S · N) y derating térmico estacional
 *   4. Modelo de Transposición: Directa + Difusa Hay-Davies anisotrópica + Albedo Trasero (Bifacial) — motor único RA.Radiation
 *   5. Time-Slicing asíncrono con presupuesto de 15ms por frame
 *   6. HUD cinematográfico Glassmorphism con indicador mensual y barra fluida
 *   7. Diagnóstico tri-nivel: Óptimo (<8%) | MLPE Recomendado (8-25%) | Inviable (≥25%)
 */
(function() {
  'use strict';

  function getCompassDirection(deg) {
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'N'];
    return dirs[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
  }
  if (typeof window !== 'undefined') window.getCompassDirection = getCompassDirection;

  // ── 1. MODAL DE CONFIRMACIÓN DE BIFACIALIDAD (PRE-FLIGHT CHECK) ───────────
  async function wpEnsureBifacialConfig(activeModule) {
    if (!activeModule) return { isBifacial: false, bifacialityFactor: 0 };
    if (typeof activeModule.isBifacial === 'boolean') {
      return {
        isBifacial: activeModule.isBifacial,
        bifacialityFactor: activeModule.bifacialityFactor || (activeModule.isBifacial ? 0.75 : 0)
      };
    }

    return new Promise((resolve) => {
      let modal = document.getElementById('ra-bifacial-modal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'ra-bifacial-modal';
        modal.style.cssText = `
          position:fixed;top:0;left:0;width:100vw;height:100vh;
          background:rgba(10,16,29,0.78);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);
          display:flex;align-items:center;justify-content:center;z-index:99999;
          font-family:'Inter',system-ui,sans-serif;
        `;
        document.body.appendChild(modal);
      }

      const modName = (activeModule.brand ? activeModule.brand + ' ' : '') + (activeModule.model || 'Módulo FV');

      modal.innerHTML = `
        <div style="background:#0f172a;border:1px solid rgba(56,189,248,0.3);border-radius:14px;padding:22px;max-width:440px;width:90%;box-shadow:0 25px 50px -12px rgba(0,0,0,0.85);color:#fff;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
            <div style="background:rgba(56,189,248,0.15);border:1px solid #38bdf8;border-radius:8px;padding:6px;display:flex;align-items:center;justify-content:center;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
            </div>
            <div>
              <div style="font-size:12.5px;font-weight:800;letter-spacing:0.04em;color:#38bdf8;text-transform:uppercase;">Tecnología de Captación</div>
              <div style="font-size:10.5px;color:#94a3b8;">${modName}</div>
            </div>
          </div>
          <p style="font-size:10.5px;color:#cbd5e1;line-height:1.45;margin:0 0 16px 0;">
            El módulo del catálogo no especifica si capta radiación por la cara trasera (albedo). Selecciona el modo de simulación física:
          </p>
          <div style="display:flex;flex-direction:column;gap:8px;">
            <button id="ra-bif-mono-btn" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:10px 12px;color:#fff;cursor:pointer;text-align:left;display:flex;justify-content:space-between;align-items:center;transition:background 0.15s;">
              <div>
                <div style="font-size:11px;font-weight:700;color:#f8fafc;">⚪ Monofacial Estándar</div>
                <div style="font-size: 10px;color:#94a3b8;">Captación solo por cara frontal (0% albedo trasero)</div>
              </div>
              <span style="font-size: 10px;background:rgba(255,255,255,0.1);padding:2px 6px;border-radius:4px;color:#cbd5e1;">Por defecto</span>
            </button>
            <button id="ra-bif-std-btn" style="background:rgba(56,189,248,0.08);border:1px solid rgba(56,189,248,0.35);border-radius:8px;padding:10px 12px;color:#fff;cursor:pointer;text-align:left;display:flex;justify-content:space-between;align-items:center;transition:background 0.15s;">
              <div>
                <div style="font-size:11px;font-weight:700;color:#38bdf8;">🔵 Bifacial TOPCon / HJT</div>
                <div style="font-size: 10px;color:#94a3b8;">Factor de bifacialidad 0.75 (ganancia real típica: +5-15% según albedo y altura de estructura)</div>
              </div>
              <span style="font-size: 10px;background:rgba(56,189,248,0.2);color:#38bdf8;padding:2px 6px;border-radius:4px;">Recomendado</span>
            </button>
          </div>
        </div>
      `;

      modal.style.display = 'flex';

      let settled = false;
      const cleanup = (res) => {
        if (settled) return;
        settled = true;
        document.removeEventListener('keydown', onEsc);
        modal.style.display = 'none';
        activeModule.isBifacial = res.isBifacial;
        activeModule.bifacialityFactor = res.bifacialityFactor;
        resolve(res);
      };
      const onEsc = (e) => {
        if (e.key === 'Escape') cleanup({ isBifacial: false, bifacialityFactor: 0 });
      };
      document.addEventListener('keydown', onEsc);
      modal.onclick = (e) => {
        if (e.target === modal) cleanup({ isBifacial: false, bifacialityFactor: 0 });
      };

      document.getElementById('ra-bif-mono-btn').onclick = () => cleanup({ isBifacial: false, bifacialityFactor: 0 });
      document.getElementById('ra-bif-std-btn').onclick = () => cleanup({ isBifacial: true, bifacialityFactor: 0.75 });
    });
  }

  const _scratchV1 = (typeof Cesium !== 'undefined' && Cesium.Cartesian3) ? new Cesium.Cartesian3() : null;
  const _scratchV2 = (typeof Cesium !== 'undefined' && Cesium.Cartesian3) ? new Cesium.Cartesian3() : null;
  const _scratchUp = (typeof Cesium !== 'undefined' && Cesium.Cartesian3) ? new Cesium.Cartesian3() : null;

  function getPanelNormalWorld(pData, roofNorm, transform) {
    if (typeof Cesium === 'undefined' || !Cesium.Cartesian3) {
      return roofNorm || { x: 0, y: 0, z: 1 };
    }
    if (pData && pData.corners && pData.corners.length >= 3) {
      const c0 = pData.corners[0];
      const c1 = pData.corners[1];
      const c3 = pData.corners[3];
      const v1 = _scratchV1 || new Cesium.Cartesian3();
      const v2 = _scratchV2 || new Cesium.Cartesian3();
      Cesium.Cartesian3.subtract(c1, c0, v1);
      Cesium.Cartesian3.subtract(c3, c0, v2);
      const n = Cesium.Cartesian3.cross(v1, v2, new Cesium.Cartesian3());
      if (Cesium.Cartesian3.magnitude(n) > 1e-6) {
        Cesium.Cartesian3.normalize(n, n);
        const upScratch = _scratchUp || new Cesium.Cartesian3();
        const up = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(pData.center || c0, upScratch);
        if (Cesium.Cartesian3.dot(n, up) < 0) {
          Cesium.Cartesian3.negate(n, n);
        }
        return n;
      }
    }
    // Si disponemos de la matriz de transformación del faldón, transformar el vector normal a ECEF
    if (transform && roofNorm) {
      let nWorld = new Cesium.Cartesian3();
      if (typeof Cesium.Matrix4.multiplyByPointAsVector === "function") {
        nWorld = Cesium.Matrix4.multiplyByPointAsVector(transform, roofNorm, nWorld);
      } else {
        nWorld = Cesium.Matrix4.multiplyByPoint(transform, roofNorm, nWorld);
      }
      return Cesium.Cartesian3.normalize(nWorld, nWorld);
    }
    if (roofNorm) {
      return Cesium.Cartesian3.clone(roofNorm);
    }
    return new Cesium.Cartesian3(0, 0, 1);
  }
  if (typeof window !== 'undefined') window.getPanelNormalWorld = getPanelNormalWorld;

  function getCombinedObstaclesAndTurbinesList() {
    const list = (typeof obstacles !== 'undefined' && Array.isArray(obstacles))
      ? obstacles.slice()
      : ((typeof window !== 'undefined' && Array.isArray(window.obstacles)) ? window.obstacles.slice() : []);
    const wTurbines = (typeof windTurbines !== 'undefined' && Array.isArray(windTurbines))
      ? windTurbines
      : ((typeof window !== 'undefined' && Array.isArray(window.windTurbines)) ? window.windTurbines : []);
    if (wTurbines && wTurbines.length > 0) {
      wTurbines.forEach(t => {
        if (!t || (t.operationalState && t.operationalState.enabled === false)) return;
        const hubH = (t.supportStructure && t.supportStructure.hubHeightM) ? t.supportStructure.hubHeightM : 18;
        const rotorR = (t._catalog && t._catalog.rotorDiameterM) ? (t._catalog.rotorDiameterM / 2) : 3;
        const towerDia = (t.supportStructure && t.supportStructure.towerDiameterM) ? Math.max(0.35, t.supportStructure.towerDiameterM) : 0.40;
        let cart = null;
        if (t.cartesian) cart = t.cartesian;
        else if (t.positionCartographic && typeof Cesium !== 'undefined' && Cesium.Cartesian3) {
          try {
            cart = Cesium.Cartesian3.fromRadians(t.positionCartographic.longitudeRad, t.positionCartographic.latitudeRad, t.positionCartographic.altitudeM || 0);
          } catch (eC) {}
        }
        list.push({
          id: t.id,
          type: 'wind_turbine',
          name: t.name || 'Aerogenerador',
          mastHeight: hubH + rotorR * 0.35,
          h: hubH + rotorR * 0.35,
          w: towerDia,
          l: towerDia,
          cartesian: cart,
          positionCartographic: t.positionCartographic,
          isTurbine: true
        });
      });
    }
    return list;
  }

  /**
   * Calcula los polígonos de sombra 2D arrojados por las aristas superiores de paneles elevados
   * sobre las filas adyacentes (Autosombreado Inter-Filas / Self-shading).
   * Soporta cualquier orientación, rotación de gizmo, estructuras Este-Oeste y cubiertas inclinadas
   * extrayendo la arista cumbrera física a partir de la cota real de sus vértices.
   */
  function generateInterRowShadowQuads2D(pInfo, sU, sV, shadowLenPerM) {
    if (!pInfo || !Array.isArray(pInfo.panels) || pInfo.panels.length < 2) return [];
    if (shadowLenPerM <= 0) return [];

    const structType = pInfo.structureType || (pInfo.estructura && pInfo.estructura.tipo);
    const pergSubtype = pInfo.pergolaSubtype || (pInfo.estructura && pInfo.estructura.subtype) || 'continuous';
    const isContinuousPergola = (structType === 'pergola' && pergSubtype !== 'spaced_rows');
    const hasPergolaSpacedRows = (structType === 'pergola' && pergSubtype === 'spaced_rows');

    // En cubiertas coplanares o marquesinas continuas (tejadillo corrido sin desnivel entre filas),
    // todos los paneles forman un plano continuo coplanar sin autosombreado inter-filas.
    // Solo pérgolas con filas separadas (spaced_rows) o triángulos sobre cubierta plana generan sombras inter-filas.
    const isZeroTiltOnSlope = (pInfo.tiltDeg > 3 && (pInfo.moduleTiltDeg === 0 || pInfo.moduleTiltDeg === pInfo.tiltDeg));
    if (pInfo.coplanar || (isContinuousPergola && !hasPergolaSpacedRows) || isZeroTiltOnSlope) return [];

    let hModGlobal = 0;
    if (typeof pInfo.moduleTiltDeg === 'number' && pInfo.moduleTiltDeg > 5) {
      const deltaTilt = Math.max(0, pInfo.moduleTiltDeg - (pInfo.tiltDeg || 0));
      hModGlobal = (pInfo.panels[0].h || 2.10) * Math.sin(deltaTilt * Math.PI / 180);
    } else if (pInfo.structureType && (pInfo.structureType.includes('triangle') || pInfo.structureType.includes('east_west'))) {
      hModGlobal = (pInfo.panels[0].h || 2.10) * Math.sin(15 * Math.PI / 180);
    }

    const quads = [];
    const offset = 0.06;

    pInfo.panels.forEach((p, pIdx) => {
      let topU1, topV1, topU2, topV2;
      let effHMod = hModGlobal;

      // [AAA FÍSICA SOLAR] Detección geométrica exacta de la cumbrera superior a partir de los 4 vértices 3D
      if (Array.isArray(p.corners) && p.corners.length === 4 && pInfo.uVec && pInfo.vVec && pInfo.normal) {
        const pts = p.corners.map(c => {
          const loc = pInfo.invTransform
            ? Cesium.Matrix4.multiplyByPoint(pInfo.invTransform, c, new Cesium.Cartesian3())
            : (pInfo.center ? Cesium.Cartesian3.subtract(c, pInfo.center, new Cesium.Cartesian3()) : c);
          return {
            u: Cesium.Cartesian3.dot(loc, pInfo.uVec),
            v: Cesium.Cartesian3.dot(loc, pInfo.vVec),
            h: Cesium.Cartesian3.dot(loc, pInfo.normal)
          };
        });
        // Ordenar vértices por elevación normal h decreciente
        pts.sort((a, b) => b.h - a.h);
        const hTop = (pts[0].h + pts[1].h) / 2;
        const hBot = (pts[2].h + pts[3].h) / 2;
        effHMod = hTop - hBot;

        topU1 = pts[0].u;
        topV1 = pts[0].v;
        topU2 = pts[1].u;
        topV2 = pts[1].v;
      } else {
        const halfW = (p.w || 1.05) / 2;
        const halfH = (p.h || 2.10) / 2;
        topU1 = p.u - halfW;
        topV1 = p.v + halfH;
        topU2 = p.u + halfW;
        topV2 = p.v + halfH;
      }

      if (effHMod < 0.04) return; // Panel coplanar o rasante: sin autosombreado elevado inter-filas

      const dU = sU * effHMod * shadowLenPerM;
      const dV = sV * effHMod * shadowLenPerM;
      const dLen = Math.hypot(dU, dV);
      if (dLen < 0.04) return;

      const dirU = dU / dLen;
      const dirV = dV / dLen;

      const quad = [
        { u: topU1 + dirU * offset, v: topV1 + dirV * offset },
        { u: topU2 + dirU * offset, v: topV2 + dirV * offset },
        { u: topU2 + dU, v: topV2 + dV },
        { u: topU1 + dU, v: topV1 + dV }
      ];
      quad.sourcePanelIdx = (p.layoutIndex !== undefined) ? p.layoutIndex : pIdx;
      quad.sourceU = p.u;
      quad.sourceV = p.v;
      quad.gridA = (typeof p.gridA === 'number') ? p.gridA : ((p.frame && typeof p.frame.Lu === 'number') ? (p.u * p.frame.Lu + p.v * p.frame.Lv) : null);
      quad.frame = p.frame || null;
      quads.push(quad);
    });

    return quads;
  }
  if (typeof window !== 'undefined') {
    window.generateInterRowShadowQuads2D = generateInterRowShadowQuads2D;
  }

  // ── 2. ACTUALIZACIÓN VISUAL INSTANTÁNEA DE SOMBRAS Y MLPE ──────────────────
  function wpUpdatePanelShadingAndMLPE(solarPos) {
    if (typeof viewer === "undefined" || !viewer || !viewer.entities) return;

    if (typeof window !== "undefined" && !window.solarSimState) window.solarSimState = {};
    const curSimState = (typeof window !== "undefined" && window.solarSimState) ? window.solarSimState : (typeof solarSimState !== "undefined" ? solarSimState : {});
    if (typeof window !== "undefined") window.solarSimState = curSimState;
    if (typeof solarSimState !== "undefined" && solarSimState && solarSimState !== curSimState) {
      Object.assign(solarSimState, curSimState);
    }
    curSimState.currentSolarPos = solarPos;

    if (curSimState.mlpeBadgeEntities) {
      curSimState.mlpeBadgeEntities.forEach(e => viewer.entities.remove(e));
    }
    curSimState.mlpeBadgeEntities = [];

    if (curSimState.obstacleShadowSurfaceEntities) {
      curSimState.obstacleShadowSurfaceEntities.forEach(e => viewer.entities.remove(e));
    }
    curSimState.obstacleShadowSurfaceEntities = [];

    let shadedCount = 0;
    let totalPanels = 0;
    const hasPolys = typeof WP !== "undefined" && WP && WP.polylines && WP.polylines.length > 0;
    const polylinesList = hasPolys ? WP.polylines : (lastRoofInfo ? [{ points: polygonPoints, roofInfo: lastRoofInfo }] : []);

    let panelGlobalCounter = 0;

    polylinesList.forEach((poly, polyIdx) => {
      const pInfo = poly.roofInfo || (typeof computeSinglePolylineRoofInfo === "function" ? computeSinglePolylineRoofInfo(poly.points, poly) : null);
      if (!pInfo || !pInfo.panels) return;

      const uVec = pInfo.uVec || new Cesium.Cartesian3(1, 0, 0);
      const vVec = pInfo.vVec || new Cesium.Cartesian3(0, 1, 0);
      const norm = pInfo.normal || new Cesium.Cartesian3(0, 0, 1);
      const transform = pInfo.transform || Cesium.Transforms.eastNorthUpToFixedFrame(pInfo.center || new Cesium.Cartesian3(0,0,0));

      const sU = Cesium.Cartesian3.dot(solarPos.sDirENU, uVec);
      const sV = Cesium.Cartesian3.dot(solarPos.sDirENU, vVec);

      let sunDirWorld = null;
      if (solarPos.sunVecENU && transform) {
        if (typeof Cesium.Matrix4.multiplyByPointAsVector === "function") {
          sunDirWorld = Cesium.Matrix4.multiplyByPointAsVector(transform, solarPos.sunVecENU, new Cesium.Cartesian3());
        } else if (typeof Cesium.Matrix4.multiplyByPoint === "function") {
          sunDirWorld = Cesium.Matrix4.multiplyByPoint(transform, solarPos.sunVecENU, new Cesium.Cartesian3());
        }
        if (sunDirWorld) Cesium.Cartesian3.normalize(sunDirWorld, sunDirWorld);
      }

      let normWorld = new Cesium.Cartesian3(0, 0, 1);
      if (transform && norm) {
        if (typeof Cesium.Matrix4.multiplyByPointAsVector === "function") {
          normWorld = Cesium.Matrix4.multiplyByPointAsVector(transform, norm, normWorld);
        } else if (typeof Cesium.Matrix4.multiplyByPoint === "function") {
          normWorld = Cesium.Matrix4.multiplyByPoint(transform, norm, normWorld);
        }
        Cesium.Cartesian3.normalize(normWorld, normWorld);
      } else if (norm) {
        normWorld = Cesium.Cartesian3.clone(norm);
      }

      const polyShadowQuads2D = [];
      const activeObstacles = getCombinedObstaclesAndTurbinesList();
      if (solarPos.isDaylight && activeObstacles && activeObstacles.length > 0) {
        activeObstacles.forEach(obs => {
          if (typeof getObstacleShadowPolygons2DForRoof === "function") {
            const quads = getObstacleShadowPolygons2DForRoof(obs, pInfo, sU, sV, solarPos.shadowLenPerM);
            if (quads && quads.length > 0) polyShadowQuads2D.push(...quads);
          }
        });
      }
      if (solarPos.isDaylight && typeof buildings !== "undefined" && buildings && buildings.length > 0) {
        buildings.forEach(bld => {
          if (typeof getBuildingShadowPolygons2DForRoof === "function") {
            const quads = getBuildingShadowPolygons2DForRoof(bld, pInfo, sU, sV, solarPos.shadowLenPerM, poly);
            if (quads && quads.length > 0) polyShadowQuads2D.push(...quads);
          }
        });
      }
      if (solarPos.isDaylight && typeof generateInterRowShadowQuads2D === "function") {
        const interRowQuads = generateInterRowShadowQuads2D(pInfo, sU, sV, solarPos.shadowLenPerM);
        if (interRowQuads && interRowQuads.length > 0) polyShadowQuads2D.push(...interRowQuads);
      }

      pInfo.panels.forEach((pData, pIdx) => {
        totalPanels++;
        const entIdx = panelGlobalCounter++;

        let isShaded = false;
        if (polyShadowQuads2D.length > 0) {
          let panelPoly2D = null;
          const invT = pInfo.invTransform || (pInfo.transform && typeof Cesium !== 'undefined' && Cesium.Matrix4 ? Cesium.Matrix4.inverse(pInfo.transform, new Cesium.Matrix4()) : null);
          if (Array.isArray(pData.corners) && pData.corners.length === 4 && invT && pInfo.uVec && pInfo.vVec) {
            panelPoly2D = pData.corners.map(c => {
              const locPt = Cesium.Matrix4.multiplyByPoint(invT, c, new Cesium.Cartesian3());
              return {
                u: Cesium.Cartesian3.dot(locPt, pInfo.uVec),
                v: Cesium.Cartesian3.dot(locPt, pInfo.vVec)
              };
            });
          } else if (pData.u !== undefined && pData.v !== undefined) {
            const halfW = (pData.w || 1.05) / 2;
            const halfH = (pData.h || 2.10) / 2;
            panelPoly2D = [
              { u: pData.u - halfW, v: pData.v - halfH },
              { u: pData.u + halfW, v: pData.v - halfH },
              { u: pData.u + halfW, v: pData.v + halfH },
              { u: pData.u - halfW, v: pData.v + halfH }
            ];
          } else if (Array.isArray(pData.corners) && pData.corners.length === 4 && pInfo.center && pInfo.uVec && pInfo.vVec) {
            panelPoly2D = pData.corners.map(c => {
              const rel = Cesium.Cartesian3.subtract(c, pInfo.center, new Cesium.Cartesian3());
              return {
                u: Cesium.Cartesian3.dot(rel, pInfo.uVec),
                v: Cesium.Cartesian3.dot(rel, pInfo.vVec)
              };
            });
          } else {
            const halfW = (pData.w || 1.05) / 2;
            const halfH = (pData.h || 2.10) / 2;
            panelPoly2D = [
              { u: (pData.u || 0) - halfW, v: (pData.v || 0) - halfH },
              { u: (pData.u || 0) + halfW, v: (pData.v || 0) - halfH },
              { u: (pData.u || 0) + halfW, v: (pData.v || 0) + halfH },
              { u: (pData.u || 0) - halfW, v: (pData.v || 0) + halfH }
            ];
          }

          const myIndex = (pData.layoutIndex !== undefined) ? pData.layoutIndex : pIdx;
          const panelH = pData.h || 2.10;
          for (const quad of polyShadowQuads2D) {
            // Evitar que el panel se auto-sombre con su propia sombra arrojada o con módulos de su misma fila
            if (quad.sourcePanelIdx !== undefined) {
              if (quad.sourcePanelIdx === myIndex) continue;
              if (typeof quad.sourceU === 'number' && typeof quad.sourceV === 'number' && typeof pData.u === 'number' && typeof pData.v === 'number') {
                if (Math.abs(quad.sourceU - pData.u) < 0.05 && Math.abs(quad.sourceV - pData.v) < 0.05) continue;
                // Descarte por fila física transversal (gridA o proyección frame.Lu/Lv):
                const pGridA = (typeof pData.gridA === 'number') ? pData.gridA : ((pData.frame && typeof pData.frame.Lu === 'number') ? (pData.u * pData.frame.Lu + pData.v * pData.frame.Lv) : null);
                if (typeof quad.gridA === 'number' && typeof pGridA === 'number') {
                  if (Math.abs(quad.gridA - pGridA) < panelH * 0.40) continue;
                } else if (pData.frame && typeof pData.frame.Lu === 'number') {
                  const qRowProj = quad.sourceU * pData.frame.Lu + quad.sourceV * pData.frame.Lv;
                  const pRowProj = pData.u * pData.frame.Lu + pData.v * pData.frame.Lv;
                  if (Math.abs(qRowProj - pRowProj) < panelH * 0.40) continue;
                } else if (quad.frame && typeof quad.frame.Lu === 'number') {
                  const qRowProj = quad.sourceU * quad.frame.Lu + quad.sourceV * quad.frame.Lv;
                  const pRowProj = pData.u * quad.frame.Lu + pData.v * quad.frame.Lv;
                  if (Math.abs(qRowProj - pRowProj) < panelH * 0.40) continue;
                } else {
                  if (Math.abs(quad.sourceV - pData.v) < panelH * 0.40) continue;
                  if (Math.abs(quad.sourceU - pData.u) < (pData.w || 1.05) * 0.40) continue;
                }
              }
            }
            if (typeof polygonsIntersect2D === "function" && polygonsIntersect2D(panelPoly2D, quad)) {
              isShaded = true;
              break;
            }
          }
        }

        if (!isShaded && solarPos.isDaylight && sunDirWorld && pData.center) {
          const effPanelNorm = getPanelNormalWorld(pData, normWorld, transform);
          // [AAA FÍSICA SOLAR] Si el sol incide por la espalda del panel real (espalda al sol), sombra propia directa
          if (effPanelNorm && Cesium.Cartesian3.dot(effPanelNorm, sunDirWorld) <= 0.001) {
            isShaded = true;
          } else if (!poly.ignore3DTilesShadows && !(pInfo && pInfo.ignore3DTilesShadows) && typeof isPanelOccludedBy3DEnvironment === "function" && isPanelOccludedBy3DEnvironment(pData.center, effPanelNorm, sunDirWorld, pInfo)) {
            isShaded = true;
          }
        }

        pData.isShaded = isShaded;
        const annualLoss = (typeof pData.annualLossPct === 'number') ? pData.annualLossPct : 0;
        const requiresMLPE = (annualLoss >= 8.0) || (isShaded && window.solarProjectConfig && window.solarProjectConfig.shadingStrategy === 'mlpe');
        pData.hasMLPE = requiresMLPE;

        if (isShaded && pData.corners && pData.corners.length >= 3) {
          shadedCount++;

          if (requiresMLPE) {
            const badgeNorm = getPanelNormalWorld(pData, normWorld, transform) || normWorld;
            const badgePos = Cesium.Cartesian3.add(
              pData.center,
              Cesium.Cartesian3.multiplyByScalar(badgeNorm, 0.40, new Cesium.Cartesian3()),
              new Cesium.Cartesian3()
            );

            const mlpeText = (annualLoss >= 25.0)
              ? "⚠️ ELIMINAR (-" + annualLoss.toFixed(1) + "%)"
              : "⚡ MLPE (" + (poly.name || ("S" + (polyIdx + 1))) + (annualLoss > 0 ? " · -" + annualLoss.toFixed(1) + "%" : "") + ")";

            const addLbl = (typeof addLabelEntity === 'function') ? addLabelEntity : (typeof window !== 'undefined' ? window.addLabelEntity : null);
            if (addLbl) {
              const badgeEntity = addLbl(badgePos, mlpeText, -8, {
                bg: (annualLoss >= 25.0) ? 'rgba(239, 68, 68, 0.92)' : 'rgba(15, 23, 42, 0.92)',
                borderColor: (annualLoss >= 25.0) ? '#EF4444' : '#10B981',
                textColor: (annualLoss >= 25.0) ? '#FFFFFF' : '#34D399',
                font: "bold 10px 'JetBrains Mono', monospace",
                maxDist: 75.0
              });
              solarSimState.mlpeBadgeEntities.push(badgeEntity);
            }
          }
        }
      });
    });

    const shadedCountEl = document.getElementById("solar-telemetry-shaded") || document.getElementById("hud-shaded-count");
    const mlpeCountEl = document.getElementById("solar-telemetry-mlpe") || document.getElementById("hud-mlpe-count");
    const altEl = document.getElementById("solar-telemetry-alt");
    const azEl = document.getElementById("solar-telemetry-az");

    if (shadedCountEl) shadedCountEl.textContent = shadedCount + " / " + totalPanels + " mods";
    if (mlpeCountEl) mlpeCountEl.textContent = shadedCount + " optimizadores";

    const altVal = (typeof solarPos.elevationDeg === "number") ? solarPos.elevationDeg : (typeof solarPos.alt === "number" ? solarPos.alt : 0);
    const azVal = (typeof solarPos.azimuthDeg === "number") ? solarPos.azimuthDeg : (typeof solarPos.azN === "number" ? solarPos.azN : 0);

    let phaseLabel = "☀️ DÍA";
    let altColor = "var(--amber-400)";
    if (altVal <= -6.0) {
      phaseLabel = "🌙 NOCHE (Luna)";
      altColor = "#60a5fa";
    } else if (altVal <= 0.0) {
      phaseLabel = "🌆 CREPÚSCULO";
      altColor = "#818cf8";
    } else if (altVal <= 8.0) {
      phaseLabel = (azVal < 180) ? "🌅 AMANECER" : "🌇 ATARDECER";
      altColor = "#f97316";
    }

    if (altEl) {
      altEl.innerHTML = altVal.toFixed(1) + "° <span style='font-size: 10px;font-weight:600;opacity:0.9;'>(" + phaseLabel + ")</span>";
      altEl.style.color = altColor;
    }
    if (azEl) azEl.textContent = azVal.toFixed(1) + "° (" + getCompassDirection(azVal) + ")";

    const lossEl = document.getElementById("hud-loss-val");
    if (lossEl) {
      const lossPct = (totalPanels > 0) ? ((shadedCount / totalPanels) * 100).toFixed(1) : "0.0";
      lossEl.textContent = "-" + lossPct + "%";
    }

    if (viewer && viewer.scene && typeof viewer.scene.requestRender === "function") {
      viewer.scene.requestRender();
    }
  }

  // ── 3. DIAGNÓSTICO MLPE Y DECISIÓN DE HARDWARE (3 NIVELES) ─────────────────
  function wpEvaluateMLPENecessity(customWP = null) {
    const wpState = customWP || (typeof window !== 'undefined' && window.WP ? window.WP : null);
    const polylines = (wpState && Array.isArray(wpState.polylines)) ? wpState.polylines : [];

    let totalPanels = 0;
    let criticalCount = 0; // 8% - 24.9%
    let unviableCount = 0; // >= 25%
    const criticalPanels = [];
    const unviablePanels = [];

    polylines.forEach(poly => {
      const panels = Array.isArray(poly.panels) ? poly.panels : (poly.roofInfo && Array.isArray(poly.roofInfo.panels) ? poly.roofInfo.panels : []);
      panels.forEach(p => {
        if (!p || p.deleted || p.disabled || p.isGhost) return;
        totalPanels++;
        const loss = (typeof p.annualLossPct === 'number') ? p.annualLossPct : (p.isShaded ? 12.0 : 0.0);
        if (loss >= 25.0) {
          unviableCount++;
          unviablePanels.push(p);
        } else if (loss >= 8.0) {
          criticalCount++;
          criticalPanels.push(p);
        }
      });
    });

    let recommendation = 'all_clear';
    let recommendationMsg = 'Campo solar despejado. Funcionamiento óptimo en strings estándar sin necesidad de electrónica extra.';

    const affectedCount = criticalCount + unviableCount;
    if (affectedCount > 0) {
      const ratio = totalPanels > 0 ? (affectedCount / totalPanels) : 0;
      if (unviableCount > 0 && criticalCount === 0 && unviableCount <= 2) {
        recommendation = 'remove_unviable';
        recommendationMsg = `Se detectan ${unviableCount} módulo(s) con sombreado severo (>25%). Se aconseja eliminar esas placas del diseño para evitar sobrecostes innecesarios.`;
      } else if (ratio <= 0.35) {
        recommendation = 'selective_optimizers';
        recommendationMsg = `Se detectan ${criticalCount} paneles con pérdidas moderadas (8-25%)` + (unviableCount > 0 ? ` y ${unviableCount} inviables (>25%)` : '') + `. Se recomienda instalar Optimizadores DC selectivos (Tigo TS4-A-O / Huawei).`;
      } else {
        recommendation = 'microinverters_or_full_mlpe';
        recommendationMsg = `Más del 35% del campo solar sufre pérdidas críticas de irradiancia. Se aconseja topología descentralizada con Microinversores (Hoymiles / Enphase) para independizar cada panel.`;
      }
    }

    return {
      totalPanels,
      criticalLossPanelsCount: criticalCount,
      unviablePanelsCount: unviableCount,
      criticalPanels,
      unviablePanels,
      recommendation,
      recommendationMsg,
      applySelectiveOptimizers: function(targetWP = null) {
        const activeWP = targetWP || wpState;
        if (!activeWP || !Array.isArray(activeWP.polylines)) return;
        activeWP.polylines.forEach(poly => {
          const panels = Array.isArray(poly.panels) ? poly.panels : (poly.roofInfo && Array.isArray(poly.roofInfo.panels) ? poly.roofInfo.panels : []);
          panels.forEach(p => {
            const loss = (typeof p.annualLossPct === 'number') ? p.annualLossPct : (p.isShaded ? 12.0 : 0.0);
            if (loss >= 8.0 && loss < 25.0) {
              p.hasOptimizer = true;
              p.optimizerModelId = 'mlpe_tigo_ts4';
            }
          });
        });
        if (typeof window !== 'undefined' && window.BOMTreeEngine && typeof window.BOMTreeEngine.refresh === 'function') {
          window.BOMTreeEngine.refresh();
        }
      }
    };
  }

  // Token de generación para cancelación atómica de simulaciones obsoletas/concurrentes
  // Caché espacial de perfiles de horizonte 3D por geometría de cubierta (LRU máx. 64 cubiertas)
  const _horizonSpatialCache = new Map();

  /**
   * [AAA SELF-HEALING] Garantiza que poly.roofInfo tenga su marco geométrico 3D/ENU completo
   * (transform, invTransform, uVec, vVec, normal, poly2D, rangeU/V, coplanar) sin sobrescribir sus paneles.
   * Corrige proyectos importados cuyo roofInfo solo contenía { area, tilt, azimuth, panels }.
   */
  function ensureRoofGeometry(poly) {
    if (typeof rehydratePolylineRoofInfo === 'function') {
      return rehydratePolylineRoofInfo(poly, false);
    }
    return poly ? poly.roofInfo : null;
  }

  /**
   * Sondea el perfil de horizonte 3D espacial (Skyline 24 sectores / 15°) mediante búsqueda binaria
   * en elevación, poda hemisférica de sectores sin sol y caché por geometría de cubierta.
   * Interpola por distancia inversa (IDW) hacia cada módulo individual para capturar obstáculos
   * locales (árboles/edificios próximos) sin disparar N_paneles × N_horas rayos en el hilo principal.
   */
  async function computeFieldHorizonProfileAsync(cfgPolylines, latDeg, simGenerationId, progressFill, totalPanelsCount) {
    if (typeof viewer === 'undefined' || !viewer || !viewer.scene) return null;
    const scene = viewer.scene;
    const gTileset = (typeof google3DTileset !== 'undefined' && google3DTileset) || (typeof window !== 'undefined' && window.google3DTileset);
    const osmTileset = (typeof cesiumOsmBuildings !== 'undefined' && cesiumOsmBuildings) || (typeof window !== 'undefined' && window.cesiumOsmBuildings);
    if (!gTileset && !osmTileset && (!scene.primitives || scene.primitives.length === 0)) return null;

    const horizonMap = new Map();
    const NUM_SECTORS = 24;
    const SECTOR_DEG = 360 / NUM_SECTORS; // 15° (sector 0 = Norte 0° -> horario)
    const isNorthernHemisphere = (typeof latDeg === 'number' && !isNaN(latDeg)) ? (latDeg >= 0) : true;
    const toExclude = (typeof _getOcclusionExcludeList === 'function') ? _getOcclusionExcludeList(scene) : [];
    let lastYieldTs = (typeof performance !== 'undefined') ? performance.now() : 0;

    cfgPolylines.forEach(ensureRoofGeometry);

    for (let polyIdx = 0; polyIdx < cfgPolylines.length; polyIdx++) {
      const poly = cfgPolylines[polyIdx];
      const pInfo = poly.roofInfo || {};
      const transform = pInfo.transform;
      const pPanels = Array.isArray(poly.panels) ? poly.panels : (pInfo && Array.isArray(pInfo.panels) ? pInfo.panels : []);
      if (!pPanels || pPanels.length === 0) continue;

      if (poly.ignore3DTilesShadows || (pInfo && pInfo.ignore3DTilesShadows)) {
        const zeroElev = new Float32Array(NUM_SECTORS);
        pPanels.forEach((p, idx) => {
          const pId = p.panelId || p.id || ('pan_' + polyIdx + '_' + idx);
          horizonMap.set(pId, zeroElev);
        });
        continue;
      }

      // Clave determinista de caché basada en la huella geométrica de la cubierta y entorno 3D
      const ptsKey = Array.isArray(poly.points)
        ? poly.points.map(pt => pt ? `${Math.round(pt.x * 2)},${Math.round(pt.y * 2)},${Math.round(pt.z * 2)}` : '').join('|')
        : ('p' + polyIdx);
      const cacheKey = `${ptsKey}|${isNorthernHemisphere ? 'N' : 'S'}|${gTileset ? 1 : 0}${osmTileset ? 1 : 0}|v4`;

      let validPanels = [];
      let validPanelCenters = [];
      let roofCenter = null;
      pPanels.forEach(p => {
        if (!p || p.deleted || p.isGhost) return;
        const c = p.center || (Array.isArray(p.corners) && p.corners[0]);
        if (c && typeof Cesium !== 'undefined') {
          if (!roofCenter) roofCenter = new Cesium.Cartesian3(0, 0, 0);
          Cesium.Cartesian3.add(roofCenter, c, roofCenter);
          validPanelCenters.push(c);
          validPanels.push(p);
        }
      });
      if (!roofCenter || validPanelCenters.length === 0) continue;
      Cesium.Cartesian3.divideByScalar(roofCenter, validPanelCenters.length, roofCenter);

      let cachedAnchors = _horizonSpatialCache.get(cacheKey);
      if (!cachedAnchors) {
        const enuFrame = transform || Cesium.Transforms.eastNorthUpToFixedFrame(roofCenter);
        const upVec = Cesium.Matrix4.multiplyByPointAsVector(enuFrame, new Cesium.Cartesian3(0, 0, 1), new Cesium.Cartesian3());
        Cesium.Cartesian3.normalize(upVec, upVec);

        // Pre-recopilar huellas de TODOS los faldones del proyecto y obstáculos modelados
        // para que el raycast 3D Tiles no haga auto-colisión con vertientes vecinas ni doble-conteo de chimeneas.
        const allRoofContexts = [];
        let projectMaxRoofDot = -Infinity;
        for (let rIdx = 0; rIdx < cfgPolylines.length; rIdx++) {
          const rp = cfgPolylines[rIdx];
          const rInfo = rp && rp.roofInfo;
          if (!rInfo || !rInfo.invTransform) continue;
          allRoofContexts.push(rInfo);
          if (Array.isArray(rp.points)) {
            for (let k = 0; k < rp.points.length; k++) {
              if (rp.points[k]) {
                const hd = Cesium.Cartesian3.dot(Cesium.Cartesian3.subtract(rp.points[k], roofCenter, new Cesium.Cartesian3()), upVec);
                if (hd > projectMaxRoofDot) projectMaxRoofDot = hd;
              }
            }
          }
        }
        const modeledObstacles = getCombinedObstaclesAndTurbinesList() || [];
        const obsCenters3D = [];
        for (let oi = 0; oi < modeledObstacles.length; oi++) {
          const ob = modeledObstacles[oi];
          if (!ob || ob.deleted || ob.type === 'wind_turbine') continue;
          if (ob.cartesian) obsCenters3D.push({ pos: ob.cartesian, r: Math.max(2.0, Math.hypot(ob.w || 1, ob.l || 1) + 1.2) });
        }

        // Selección espacialmente balanceada de anclas (centroide + hasta 4 extremos en (u,v), independiente del orden del array)
        const anchorPts = [roofCenter];
        const spanU = (pInfo && typeof pInfo.rangeU === 'number') ? pInfo.rangeU : 0;
        const spanV = (pInfo && typeof pInfo.rangeV === 'number') ? pInfo.rangeV : 0;
        if ((spanU > 4.5 || spanV > 4.5) && validPanels.length >= 4) {
          let pMinU = null, pMaxU = null, pMinV = null, pMaxV = null;
          let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
          for (let pi = 0; pi < validPanels.length; pi++) {
            const vp = validPanels[pi];
            const vu = typeof vp.u === 'number' ? vp.u : 0;
            const vv = typeof vp.v === 'number' ? vp.v : 0;
            if (vu < minU) { minU = vu; pMinU = vp.center || validPanelCenters[pi]; }
            if (vu > maxU) { maxU = vu; pMaxU = vp.center || validPanelCenters[pi]; }
            if (vv < minV) { minV = vv; pMinV = vp.center || validPanelCenters[pi]; }
            if (vv > maxV) { maxV = vv; pMaxV = vp.center || validPanelCenters[pi]; }
          }
          const candidates = [pMinU, pMaxU, pMinV, pMaxV];
          for (let ci = 0; ci < candidates.length && anchorPts.length < 5; ci++) {
            const cand = candidates[ci];
            if (!cand) continue;
            let farEnough = true;
            for (let ai = 0; ai < anchorPts.length; ai++) {
              if (Cesium.Cartesian3.distance(cand, anchorPts[ai]) < 3.5) { farEnough = false; break; }
            }
            if (farEnough) anchorPts.push(cand);
          }
        }

        const dirScratch = new Cesium.Cartesian3();
        const dirWorldScratch = new Cesium.Cartesian3();
        const diffScratch = new Cesium.Cartesian3();
        const locScratch = new Cesium.Cartesian3();

        const isRayBlocked = (probeOrigin, azRad, elevDeg) => {
          const elevRad = (elevDeg * Math.PI) / 180;
          const cosE = Math.cos(elevRad);
          dirScratch.x = cosE * Math.sin(azRad);
          dirScratch.y = cosE * Math.cos(azRad);
          dirScratch.z = Math.sin(elevRad);
          Cesium.Matrix4.multiplyByPointAsVector(enuFrame, dirScratch, dirWorldScratch);
          Cesium.Cartesian3.normalize(dirWorldScratch, dirWorldScratch);
          try {
            const hit = scene.pickFromRay(new Cesium.Ray(probeOrigin, dirWorldScratch), toExclude);
            if (!hit || !Cesium.defined(hit.position) || !hit.object) return false;
            const objPrim = hit.object.primitive;
            const is3DTile = (
              (typeof Cesium.Cesium3DTileFeature !== "undefined" && hit.object instanceof Cesium.Cesium3DTileFeature) ||
              (typeof Cesium.Cesium3DTileset !== "undefined" && (objPrim instanceof Cesium.Cesium3DTileset || hit.object instanceof Cesium.Cesium3DTileset)) ||
              (objPrim && (objPrim === gTileset || objPrim === osmTileset)) ||
              (hit.object.tileset && (hit.object.tileset === gTileset || hit.object.tileset === osmTileset)) ||
              (hit.object.content && hit.object.content.tileset)
            );
            if (!is3DTile) return false;

            const dist = Cesium.Cartesian3.distance(probeOrigin, hit.position);
            if (dist <= 3.5 || dist >= 1200.0) return false;

            Cesium.Cartesian3.subtract(hit.position, probeOrigin, diffScratch);
            const hitRiseM = Cesium.Cartesian3.dot(diffScratch, upVec);
            if (dist < 6.0 && hitRiseM < 1.0) return false;

            // Ignorar auto-colisión con los obstáculos modelados en CAD (ya simulados exactamente en 2D)
            for (let oi = 0; oi < obsCenters3D.length; oi++) {
              if (Cesium.Cartesian3.distance(hit.position, obsCenters3D[oi].pos) < obsCenters3D[oi].r) {
                return false;
              }
            }

            // Ignorar auto-colisión con CUALQUIER faldón de la propia cubierta (no solo el activo)
            for (let rIdx = 0; rIdx < allRoofContexts.length; rIdx++) {
              const rCtx = allRoofContexts[rIdx];
              try {
                Cesium.Matrix4.multiplyByPoint(rCtx.invTransform, hit.position, locScratch);
                const u = Cesium.Cartesian3.dot(locScratch, rCtx.uVec || Cesium.Cartesian3.UNIT_X);
                const v = Cesium.Cartesian3.dot(locScratch, rCtx.vVec || Cesium.Cartesian3.UNIT_Y);
                const nDist = Cesium.Cartesian3.dot(locScratch, rCtx.normal || Cesium.Cartesian3.UNIT_Z);
                if (rCtx.poly2D && Math.abs(nDist) < 2.2 && typeof isPointInPolygon2D === 'function' && isPointInPolygon2D({ u, v }, rCtx.poly2D)) {
                  return false;
                }
                if (typeof rCtx.minU === 'number' && typeof rCtx.maxU === 'number' &&
                    typeof rCtx.minV === 'number' && typeof rCtx.maxV === 'number' &&
                    Math.abs(nDist) < 2.0 &&
                    u >= rCtx.minU - 1.5 && u <= rCtx.maxU + 1.5 && v >= rCtx.minV - 1.5 && v <= rCtx.maxV + 1.5) {
                  return false;
                }
              } catch (_) {}
            }
            return true;
          } catch (_) {
            return false;
          }
        };

        cachedAnchors = [];
        for (let ai = 0; ai < anchorPts.length; ai++) {
          const basePt = anchorPts[ai];
          // Cota física homogénea sobre cada ancla (+0.75 m por encima del plano del panel)
          const probeOrigin = Cesium.Cartesian3.add(
            basePt,
            Cesium.Cartesian3.multiplyByScalar(upVec, 0.75, new Cesium.Cartesian3()),
            new Cesium.Cartesian3()
          );
          const rawElevArr = new Float32Array(NUM_SECTORS);

          for (let s = 0; s < NUM_SECTORS; s++) {
            const azFromNorth = s * SECTOR_DEG;
            // Poda hemisférica: no sondear sectores donde el sol nunca transita (>45° del horizonte polar)
            if (isNorthernHemisphere && (azFromNorth < 45 || azFromNorth > 315)) continue;
            if (!isNorthernHemisphere && (azFromNorth > 135 && azFromNorth < 225)) continue;

            const azRad = (azFromNorth * Math.PI) / 180;
            // Barrido robusto en niveles clave para evitar falsos ceros por huecos en fotogrametría 3D Tiles
            const probeLevels = [6, 14, 24, 38, 54];
            let highestHitIdx = -1;
            for (let li = 0; li < probeLevels.length; li++) {
              if (isRayBlocked(probeOrigin, azRad, probeLevels[li])) {
                highestHitIdx = li;
              }
            }
            let foundElev = 0;
            if (highestHitIdx >= 0) {
              let lo = probeLevels[highestHitIdx];
              let hi = (highestHitIdx + 1 < probeLevels.length) ? probeLevels[highestHitIdx + 1] : 66;
              for (let iter = 0; iter < 3; iter++) {
                const mid = (lo + hi) * 0.5;
                if (isRayBlocked(probeOrigin, azRad, mid)) lo = mid;
                else hi = mid;
              }
              foundElev = Math.round(lo * 10) / 10;
            }
            rawElevArr[s] = foundElev;

            if (typeof performance !== 'undefined' && (performance.now() - lastYieldTs) > 12) {
              await new Promise(r => setTimeout(r, 0));
              if (simGenerationId && simGenerationId !== _activeSimGenerationId) return null;
              lastYieldTs = performance.now();
            }
          }

          // Suavizado angular circular [0.2, 0.6, 0.2] para filtrar picos espurios de malla 3D Tiles
          const smoothElevArr = new Float32Array(NUM_SECTORS);
          for (let s = 0; s < NUM_SECTORS; s++) {
            const prev = rawElevArr[(s - 1 + NUM_SECTORS) % NUM_SECTORS];
            const curr = rawElevArr[s];
            const next = rawElevArr[(s + 1) % NUM_SECTORS];
            smoothElevArr[s] = Math.round((prev * 0.2 + curr * 0.6 + next * 0.2) * 10) / 10;
          }
          cachedAnchors.push({ pos: basePt, elevations: smoothElevArr });
        }

        if (_horizonSpatialCache.size >= 64) {
          const firstKey = _horizonSpatialCache.keys().next().value;
          _horizonSpatialCache.delete(firstKey);
        }
        _horizonSpatialCache.set(cacheKey, cachedAnchors);
      }

      // Asignar perfil de horizonte a cada panel mediante IDW regularizado suave (sin salto duro en d < 0.25)
      pPanels.forEach((p, idx) => {
        const pId = p.panelId || p.id || ('pan_' + polyIdx + '_' + idx);
        if (cachedAnchors.length === 1 || !p.center) {
          horizonMap.set(pId, cachedAnchors[0].elevations);
          return;
        }
        const interp = new Float32Array(NUM_SECTORS);
        let wSum = 0;
        for (let ai = 0; ai < cachedAnchors.length; ai++) {
          const d = Cesium.Cartesian3.distance(p.center, cachedAnchors[ai].pos);
          const w = 1.0 / (d * d + 6.0);
          wSum += w;
          const src = cachedAnchors[ai].elevations;
          for (let s = 0; s < NUM_SECTORS; s++) interp[s] += src[s] * w;
        }
        if (wSum > 0) {
          for (let s = 0; s < NUM_SECTORS; s++) interp[s] /= wSum;
        }
        horizonMap.set(pId, interp);
      });

      const pct = Math.min(25, Math.round(((polyIdx + 1) / Math.max(1, cfgPolylines.length)) * 25));
      if (progressFill) progressFill.style.width = pct + '%';
    }

    return horizonMap;
  }

  let _activeSimGenerationId = 0;
  let _activeHeatmapWorker = null;

  /**
   * Ejecuta el cálculo masivo de 192 instantes en un Web Worker off-thread.
   * Evita congelar el render loop de CesiumJS (preserva 60 FPS estables).
   */
  async function runHeatmapInDedicatedWorker(cfg, onProgressCallback, progressBar, progressFill, totalPanelsCount) {
    let worker = null;
    try {
      if (_activeHeatmapWorker) {
        try { _activeHeatmapWorker.terminate(); } catch (_) {}
        _activeHeatmapWorker = null;
      }
      worker = new Worker('js/solar-worker.js?v=20261119_shadow_fix3');
      _activeHeatmapWorker = worker;
    } catch (err) {
      throw err;
    }

    // Configuración temporal compartida con el worker
    let monthsDoy = [15, 45, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349];
    let hours = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
    if (cfg.resolution === 'sketch') {
      hours = [8, 10, 12, 14, 16, 18];
    } else if (cfg.resolution === 'fast') {
      monthsDoy = [15, 105, 196, 288];
      hours = [9, 12, 15, 17];
    } else if (cfg.resolution === 'medium') {
      // Muestreo horario continuo (14h x 12m = 168 instantes, <20ms off-thread): elimina aliasing estroboscópico de sombras
      hours = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
    }
    const monthSpan = Math.max(1, Math.round(12 / monthsDoy.length));
    const preScanSteps = 0;
    const unifiedTotalSteps = monthsDoy.length;

    const _MONTH_START_DOY = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
    const doyToMonthIdx = (doy) => {
      let mi = 11;
      for (let k = 0; k < 12; k++) {
        if (doy >= _MONTH_START_DOY[k]) mi = k;
      }
      return mi;
    };
    const monthsReal = monthsDoy.map(doyToMonthIdx);

    // [ARQUITECTURA ULTRA-RÁPIDA] Horizonte espacial 24 sectores con búsqueda binaria y caché por cubierta.
    // Reemplaza el antiguo bombardeo N_paneles × N_horas de pickFromRay síncronos en el hilo principal (>20× más rápido).
    const panelHorizons = (cfg.resolution === 'sketch')
      ? null
      : await computeFieldHorizonProfileAsync(cfg.polylines, cfg.lat, cfg.simGenerationId, progressFill, totalPanelsCount);
    if (cfg.simGenerationId !== _activeSimGenerationId) {
      worker.terminate();
      throw new Error('Simulación cancelada');
    }

    return new Promise((resolve, reject) => {
      const panels = [];
      const faldones = [];

      cfg.polylines.forEach((poly, polyIdx) => {
        const pInfo = ensureRoofGeometry(poly) || poly.roofInfo || {};
        const uVec = pInfo.uVec ? { x: pInfo.uVec.x, y: pInfo.uVec.y, z: pInfo.uVec.z } : { x: 1, y: 0, z: 0 };
        const vVec = pInfo.vVec ? { x: pInfo.vVec.x, y: pInfo.vVec.y, z: pInfo.vVec.z } : { x: 0, y: 1, z: 0 };
        const norm = pInfo.normal ? { x: pInfo.normal.x, y: pInfo.normal.y, z: pInfo.normal.z } : { x: 0, y: 0, z: 1 };

        const effClearance = (poly.estructura && typeof poly.estructura.clearance === 'number')
          ? poly.estructura.clearance
          : (poly.modStructure === 'pergola' ? 1.80 : 0);
        const roofZ = (pInfo && pInfo.carto && typeof pInfo.carto.height === 'number') ? pInfo.carto.height : 0;

        const obstacles2D = [];
        const obsList = getCombinedObstaclesAndTurbinesList();
        if (obsList && obsList.length > 0) {
          const invT = pInfo.invTransform || (pInfo.transform && typeof Cesium !== 'undefined' && Cesium.Matrix4 ? Cesium.Matrix4.inverse(pInfo.transform, new Cesium.Matrix4()) : null);
          const pNorm = pInfo.normal;
          obsList.forEach(obs => {
            if (!obs || obs.deleted) return;
            let rawObsH = (typeof obs.h === 'number' ? obs.h : (obs.height || 1.2));
            if (obs.type === 'wind_turbine') {
              let turbineZ = 0;
              if (obs.positionCartographic && typeof obs.positionCartographic.altitudeM === 'number') {
                turbineZ = obs.positionCartographic.altitudeM;
              } else if (obs.cartesian && typeof Cesium !== 'undefined' && Cesium.Cartographic) {
                try { const cT = Cesium.Cartographic.fromCartesian(obs.cartesian); if (cT) turbineZ = cT.height; } catch (_) {}
              }
              const mastH = Math.max(obs.mastHeight || rawObsH || 6.0, 1.0);
              rawObsH = (turbineZ + mastH) - roofZ;
              if (rawObsH <= 0.2) return;
            } else {
              // [AAA FÍSICA SOLAR] Evitar fuga de sombra entre vertientes opuestas:
              // Calcular la cota real de la coronación del obstáculo respecto al plano inclinado del faldón activo.
              if (invT && pNorm && typeof Cesium !== 'undefined' && Cesium.Cartesian3) {
                let obsBaseC3 = obs.cartesian || null;
                if (!obsBaseC3 && typeof getObstacleWorldBaseCorners3D === 'function') {
                  const corners3D = getObstacleWorldBaseCorners3D(obs, 0.0);
                  if (corners3D && corners3D.length > 0) obsBaseC3 = corners3D[0];
                }
                if (obsBaseC3) {
                  const locBase = Cesium.Matrix4.multiplyByPoint(invT, obsBaseC3, new Cesium.Cartesian3());
                  const signedDistToPlane = Cesium.Cartesian3.dot(locBase, pNorm);
                  const upCos = Math.max(0.25, pNorm.z || 1.0);
                  const effTopAbovePlane = signedDistToPlane + rawObsH * upCos;
                  if (effTopAbovePlane <= effClearance + 0.12) return;
                  rawObsH = Math.max(0.10, (effTopAbovePlane - effClearance) / upCos);
                } else if (effClearance > 0) {
                  if (rawObsH <= effClearance + 0.10) return;
                  rawObsH = Math.max(0.10, rawObsH - effClearance);
                }
              } else if (effClearance > 0) {
                if (rawObsH <= effClearance + 0.10) return;
                rawObsH = Math.max(0.10, rawObsH - effClearance);
              }
            }
            const pts = (typeof getObstaclePolygon2DForRoof === 'function')
              ? getObstaclePolygon2DForRoof(obs, 0.0, pInfo)
              : ((obs.points2D && obs.points2D[polyIdx]) || obs.poly2D);
            if (pts && pts.length >= 3) {
              obstacles2D.push({
                height: rawObsH,
                points2D: pts.map(pt => ({ u: pt.u, v: pt.v }))
              });
            }
          });
        }

        const bldList = (typeof buildings !== 'undefined' && Array.isArray(buildings))
          ? buildings
          : ((typeof window !== 'undefined' && Array.isArray(window.buildings)) ? window.buildings : []);
        if (bldList && bldList.length > 0) {
          bldList.forEach(bld => {
            if (!bld || bld.visible === false || !bld.points || bld.points.length < 3) return;
            const bldObs = (typeof getBuildingPolygon2DForRoof === 'function')
              ? getBuildingPolygon2DForRoof(bld, pInfo, poly)
              : null;
            if (bldObs && bldObs.points2D && bldObs.points2D.length >= 3 && bldObs.height > 0.05) {
              obstacles2D.push({
                height: bldObs.height,
                points2D: bldObs.points2D.map(pt => ({ u: pt.u, v: pt.v })),
                isBuilding: true,
                buildingId: bld.id
              });
            }
          });
        }

        const pList = Array.isArray(poly.panels) ? poly.panels : (pInfo.panels || []);
        const interRowEdges = [];
        const structType = pInfo.structureType || (pInfo.estructura && pInfo.estructura.tipo);
        const pergSubtype = pInfo.pergolaSubtype || (pInfo.estructura && pInfo.estructura.subtype) || 'continuous';
        const isContinuousPergola = (structType === 'pergola' && pergSubtype !== 'spaced_rows');
        const hasPergolaSpacedRows = (structType === 'pergola' && pergSubtype === 'spaced_rows');
        if ((!pInfo.coplanar && (!isContinuousPergola || hasPergolaSpacedRows)) && pList.length >= 2) {
          let hModGlobal = 0;
          if (typeof pInfo.moduleTiltDeg === 'number' && pInfo.moduleTiltDeg > 5) {
            const deltaTilt = Math.max(0, pInfo.moduleTiltDeg - (pInfo.tiltDeg || 0));
            hModGlobal = (pList[0].h || 2.10) * Math.sin(deltaTilt * Math.PI / 180);
          } else if (pInfo.structureType && (pInfo.structureType.includes('triangle') || pInfo.structureType.includes('east_west'))) {
            hModGlobal = (pList[0].h || 2.10) * Math.sin(15 * Math.PI / 180);
          }
          if (hModGlobal >= 0.04) {
            const invT = pInfo.invTransform || (pInfo.transform && typeof Cesium !== 'undefined' && Cesium.Matrix4 ? Cesium.Matrix4.inverse(pInfo.transform, new Cesium.Matrix4()) : null);
            pList.forEach((p, pIdx) => {
              if (!p || p.deleted || p.disabled || p.isGhost) return;
              const myLayoutIdx = (p.layoutIndex !== undefined) ? p.layoutIndex : pIdx;
              let topU1, topV1, topU2, topV2;
              let effHMod = hModGlobal;
              if (Array.isArray(p.corners) && p.corners.length === 4 && invT && pInfo.uVec && pInfo.vVec && pInfo.normal) {
                const pts = p.corners.map(c => {
                  const loc = Cesium.Matrix4.multiplyByPoint(invT, c, new Cesium.Cartesian3());
                  return {
                    u: Cesium.Cartesian3.dot(loc, pInfo.uVec),
                    v: Cesium.Cartesian3.dot(loc, pInfo.vVec),
                    h: Cesium.Cartesian3.dot(loc, pInfo.normal)
                  };
                });
                pts.sort((a, b) => b.h - a.h);
                const hTop = (pts[0].h + pts[1].h) / 2;
                const hBot = (pts[2].h + pts[3].h) / 2;
                effHMod = hTop - hBot;
                topU1 = pts[0].u;
                topV1 = pts[0].v;
                topU2 = pts[1].u;
                topV2 = pts[1].v;
              } else {
                const halfW = (p.w || 1.05) / 2;
                const halfH = (p.h || 2.10) / 2;
                topU1 = p.u - halfW;
                topV1 = p.v + halfH;
                topU2 = p.u + halfW;
                topV2 = p.v + halfH;
              }
              if (effHMod >= 0.04) {
                interRowEdges.push({
                  u1: topU1, v1: topV1,
                  u2: topU2, v2: topV2,
                  effHMod: effHMod,
                  sourceIdx: myLayoutIdx,
                  sourceU: p.u,
                  sourceV: p.v,
                  gridA: (typeof p.gridA === 'number') ? p.gridA : ((p.frame && typeof p.frame.Lu === 'number') ? (p.u * p.frame.Lu + p.v * p.frame.Lv) : null),
                  frame: p.frame ? { Lu: p.frame.Lu, Lv: p.frame.Lv, Wu: p.frame.Wu, Wv: p.frame.Wv } : null
                });
              }
            });
          }
        }

        faldones.push({
          polyIdx,
          uVec,
          vVec,
          normalENU: norm,
          normalWorld: norm,
          ignore3DTilesShadows: !!(poly.ignore3DTilesShadows || (pInfo && pInfo.ignore3DTilesShadows)),
          obstacles2D,
          interRowEdges
        });

        const fallbackModWp = (cfg.moduleProps && typeof cfg.moduleProps.wp === 'number' && cfg.moduleProps.wp > 0) ? cfg.moduleProps.wp : 450;
        const polyWp = (typeof wpGetPolyWp === 'function') ? wpGetPolyWp(poly) : fallbackModWp;

        pList.forEach((p, idx) => {
          if (!p || p.deleted || p.disabled || p.isGhost) return;
          const pId = p.panelId || p.id || ('pan_' + polyIdx + '_' + idx);
          const u = typeof p.u === 'number' ? p.u : 0;
          const v = typeof p.v === 'number' ? p.v : 0;
          const w = p.w || 1.05;
          const h = p.h || 2.15;
          const halfW = w / 2;
          const halfH = h / 2;
          let poly2D = null;
          const invT = pInfo.invTransform || (pInfo.transform && typeof Cesium !== 'undefined' && Cesium.Matrix4 ? Cesium.Matrix4.inverse(pInfo.transform, new Cesium.Matrix4()) : null);
          if (Array.isArray(p.corners) && p.corners.length === 4 && invT && pInfo.uVec && pInfo.vVec) {
            poly2D = p.corners.map(c => {
              const loc = Cesium.Matrix4.multiplyByPoint(invT, c, new Cesium.Cartesian3());
              return {
                u: Cesium.Cartesian3.dot(loc, pInfo.uVec),
                v: Cesium.Cartesian3.dot(loc, pInfo.vVec)
              };
            });
          } else if (p.corners2D && Array.isArray(p.corners2D) && p.corners2D.length >= 3) {
            poly2D = p.corners2D.map(pt => ({ u: pt.u, v: pt.v }));
          } else if (p.poly2D && Array.isArray(p.poly2D) && p.poly2D.length >= 3) {
            poly2D = p.poly2D.map(pt => ({ u: pt.u, v: pt.v }));
          } else {
            poly2D = [
              { u: u - halfW, v: v - halfH },
              { u: u + halfW, v: v - halfH },
              { u: u + halfW, v: v + halfH },
              { u: u - halfW, v: v + halfH }
            ];
          }

          const roofSlopeVal = (pInfo && typeof pInfo.tiltDeg === 'number') ? pInfo.tiltDeg : 0;
          let tiltVal = p.tiltDeg !== undefined ? p.tiltDeg : (pInfo.moduleTiltDeg !== undefined ? pInfo.moduleTiltDeg : (pInfo.tiltDeg || 20));
          if (tiltVal === 0 && roofSlopeVal > 3) {
            tiltVal = roofSlopeVal;
          }
          const azVal = p.azimuthDeg !== undefined
            ? (((180 + p.azimuthDeg) % 360 + 360) % 360)
            : (p.azDeg !== undefined
                ? p.azDeg
                : (pInfo.moduleAzimuthDeg !== undefined
                    ? (((180 + pInfo.moduleAzimuthDeg) % 360 + 360) % 360)
                    : (pInfo.azDeg || 180)));

          const pNormWorld = (typeof getPanelNormalWorld === 'function')
            ? getPanelNormalWorld(p, norm, pInfo.transform)
            : norm;

          let normalENU;
          if (pNormWorld && pInfo && pInfo.center && typeof Cesium !== 'undefined' && Cesium.Transforms && Cesium.Matrix4) {
            const enuFrame = Cesium.Transforms.eastNorthUpToFixedFrame(pInfo.center);
            const invENU = Cesium.Matrix4.inverse(enuFrame, new Cesium.Matrix4());
            const nENU = Cesium.Matrix4.multiplyByPointAsVector(invENU, pNormWorld, new Cesium.Cartesian3());
            Cesium.Cartesian3.normalize(nENU, nENU);
            normalENU = { x: nENU.x, y: nENU.y, z: nENU.z };
          } else {
            const tiltR = (tiltVal * Math.PI) / 180;
            const azR = (azVal * Math.PI) / 180;
            normalENU = {
              x: Math.sin(tiltR) * Math.sin(azR),
              y: Math.sin(tiltR) * Math.cos(azR),
              z: Math.cos(tiltR)
            };
          }

          panels.push({
            id: pId,
            polyIdx,
            layoutIndex: p.layoutIndex !== undefined ? p.layoutIndex : idx,
            u: u,
            v: v,
            h: h,
            w: w,
            wp: (typeof p.wp === 'number' && p.wp > 0) ? p.wp : polyWp,
            areaM2: p.areaM2 || (w * h),
            tiltDeg: tiltVal,
            azDeg: azVal,
            coplanar: !!(pInfo && pInfo.coplanar),
            clearance: effClearance,
            hasOptimizer: !!(p.hasOptimizer || p.optimizerModelId),
            poly2D: poly2D,
            gridA: (typeof p.gridA === 'number') ? p.gridA : ((p.frame && typeof p.frame.Lu === 'number') ? (p.u * p.frame.Lu + p.v * p.frame.Lv) : null),
            frame: p.frame ? { Lu: p.frame.Lu, Lv: p.frame.Lv, Wu: p.frame.Wu, Wv: p.frame.Wv } : null,
            normalWorld: pNormWorld,
            normalENU: normalENU,
            horizon: (panelHorizons && panelHorizons.get(pId)) || null,
            occlusion3D: null
          });
        });
      });

      worker.onmessage = function(e) {
        if (cfg.simGenerationId !== _activeSimGenerationId) {
          worker.terminate();
          resolve(null);
          return;
        }
        const msg = e.data;
        if (!msg) return;

        if (msg.type === 'PROGRESS') {
          const currentRealMonth = (typeof msg.monthReal === 'number') ? msg.monthReal : (monthsReal[msg.mIdx] !== undefined ? monthsReal[msg.mIdx] : msg.mIdx);
          if (typeof updateSolarCalcHUD === 'function') {
            updateSolarCalcHUD(msg.progressPct, currentRealMonth, totalPanelsCount, {
              stepIndex: preScanSteps + ((typeof msg.stepIndex === 'number') ? msg.stepIndex : (msg.mIdx + 1)),
              totalStepsCount: unifiedTotalSteps,
              monthSpan: monthSpan,
              phaseText: 'Simulación'
            });
          }
          if (progressFill) progressFill.style.width = msg.progressPct + '%';
          if (typeof onProgressCallback === 'function') {
            onProgressCallback(msg.progressPct, currentRealMonth, totalPanelsCount);
          }
        } else if (msg.type === 'DONE') {
          msg.unifiedTotalSteps = unifiedTotalSteps;
          msg.preScanSteps = preScanSteps;
          worker.terminate();
          if (_activeHeatmapWorker === worker) _activeHeatmapWorker = null;
          resolve(msg);
        }
      };

      worker.onerror = function(err) {
        worker.terminate();
        if (_activeHeatmapWorker === worker) _activeHeatmapWorker = null;
        reject(err);
      };

      const transferList = [];
      const seenBuffers = new Set();
      panels.forEach(p => {
        if (p && p.occlusion3D && p.occlusion3D.buffer && !seenBuffers.has(p.occlusion3D.buffer)) {
          seenBuffers.add(p.occlusion3D.buffer);
          transferList.push(p.occlusion3D.buffer);
        }
      });

      worker.postMessage({
        type: 'START_HEATMAP',
        simGenerationId: cfg.simGenerationId,
        lat: cfg.lat,
        lng: cfg.lng,
        resolution: cfg.resolution,
        detailedBypass: cfg.detailedBypass,
        shadowSimConfig: cfg.shadowSimConfig || { includeObstacles: true, includeBuildings: true, includeInterRow: true, shadowWeightPct: 100 },
        basePct: panelHorizons ? 25 : 0,
        panels,
        faldones,
        climaticZone: cfg.climaticZone,
        moduleProps: cfg.moduleProps,
        monthlyGHI: cfg.monthlyGHI
      }, transferList);
    });
  }

  function applyWorkerHeatmapResults(polylines, results, monthlyNetWh, targetMonthlyNetWh) {
    const map = new Map();
    results.forEach(r => {
      if (r && r.id) {
        map.set(r.id, r);
        if (r.polyIdx !== undefined && r.layoutIndex !== undefined) {
          map.set(`${r.polyIdx}_${r.layoutIndex}`, r);
          map.set(`pan_${r.polyIdx}_${r.layoutIndex}`, r);
          map.set(`panel_${r.polyIdx}_${r.layoutIndex}`, r);
        }
      }
    });

    polylines.forEach((poly, polyIdx) => {
      const panels = Array.isArray(poly.panels) ? poly.panels : (poly.roofInfo && Array.isArray(poly.roofInfo.panels) ? poly.roofInfo.panels : []);
      panels.forEach((p, idx) => {
        if (!p || p.deleted || p.disabled || p.isGhost) return;
        const pId = p.panelId || p.id || ('panel_' + polyIdx + '_' + idx);
        const lIdx = p.layoutIndex !== undefined ? p.layoutIndex : idx;
        const res = map.get(pId) ||
          (p.id ? map.get(p.id) : null) ||
          (p.panelId ? map.get(p.panelId) : null) ||
          map.get('panel_' + polyIdx + '_' + lIdx) ||
          map.get('pan_' + polyIdx + '_' + lIdx) ||
          map.get(`${polyIdx}_${lIdx}`) ||
          map.get('panel_' + polyIdx + '_' + idx) ||
          map.get('pan_' + polyIdx + '_' + idx);
        if (res) {
          p.annualTotalPotential = res.annualTotalPotential;
          p.annualShadedLoss = res.annualShadedLoss;
          p.annualLossPct = res.annualLossPct;
          p.annualYieldPct = res.annualYieldPct;
          p.shadowHits = res.shadowHits;
          p.activeDiodesHits = res.activeDiodesHits;
          p.heatmapColor = (typeof getActiveHeatmapColorForPanel === 'function')
            ? getActiveHeatmapColorForPanel(p)
            : ((typeof getHeatmapColor === 'function') ? getHeatmapColor(res.annualLossPct || 0) : { hex: '#10b981' });
        }
      });
    });

    if (monthlyNetWh && Array.isArray(monthlyNetWh) && targetMonthlyNetWh) {
      for (let k = 0; k < 12; k++) {
        targetMonthlyNetWh[k] = monthlyNetWh[k] || 0;
      }
    }
  }

  async function computeAnnualSolarHeatmap(onProgressCallback) {
    if (typeof wpClearAllPlaneGizmos === "function") { try { wpClearAllPlaneGizmos(); } catch (_) {} }
    if (typeof wpClearDynamicShadows === "function") {
      try { wpClearDynamicShadows(); } catch (_) {}
    } else if (typeof window !== "undefined" && window.wpClearDynamicShadows) {
      try { window.wpClearDynamicShadows(); } catch (_) {}
    }
    const simGenerationId = ++_activeSimGenerationId;
    try {
    if (typeof window !== 'undefined' && window.solarSimState) {
      window.solarSimState.currentSimGenerationId = simGenerationId;
      // [B4] Marca global de "simulación en curso" para bloquear la generación de PDF en falso.
      window.solarSimState.isCalculatingHeatmap = true;
    }

    const wpState = (typeof window !== 'undefined' && window.WP ? window.WP : null);
    const polylines = (wpState && Array.isArray(wpState.polylines)) ? wpState.polylines : [];

    // Sincronizar y enlazar referencias de paneles antes de iniciar el cómputo
    const livePanels = (typeof window !== 'undefined' && Array.isArray(window.allRenderedPanels) && window.allRenderedPanels.length > 0)
      ? window.allRenderedPanels
      : null;

    polylines.forEach((poly, polyIdx) => {
      if (!poly.roofInfo && typeof computeSinglePolylineRoofInfo === 'function') {
        poly.roofInfo = computeSinglePolylineRoofInfo(poly.points, poly);
        if (poly.roofInfo) poly.roofInfo.ignore3DTilesShadows = !!poly.ignore3DTilesShadows;
      } else {
        ensureRoofGeometry(poly);
      }
      if (livePanels) {
        const matchingLive = livePanels.filter(lp => lp && !lp.isGhost && !lp.deleted && (lp.polyIdx === polyIdx || (!lp.polyIdx && polyIdx === 0)));
        if (matchingLive.length > 0) {
          if (!poly.roofInfo) {
            poly.roofInfo = (typeof computeSinglePolylineRoofInfo === 'function')
              ? computeSinglePolylineRoofInfo(poly.points, poly) || {}
              : {};
          }
          poly.roofInfo.panels = matchingLive;
          poly.panels = matchingLive;
        }
      }
      if (poly.roofInfo && Array.isArray(poly.roofInfo.panels)) {
        poly.panels = poly.roofInfo.panels;
      }
    });

    // Localizar módulo activo para verificar bifacialidad
    let activeModule = null;
    const cat = (typeof equipmentCatalog !== 'undefined' && equipmentCatalog) ? equipmentCatalog : window.equipmentCatalog;
    const selModId = window.solarProjectConfig ? window.solarProjectConfig.selectedModuleId : null;
    if (cat && Array.isArray(cat.modules) && selModId) {
      activeModule = cat.modules.find(m => m.id === selModId) || cat.modules[0];
    }

    // 1. Verificación Pre-Flight de Bifacialidad
    const bifacialConfig = await wpEnsureBifacialConfig(activeModule);
    if (simGenerationId !== _activeSimGenerationId) return; // Abortado por nuevo cálculo concurrente

    const isBifacial = bifacialConfig.isBifacial;
    const bifacialityFactor = bifacialConfig.bifacialityFactor;

    // 2. Activar HUD Cinematográfico de progreso
      if (typeof showSolarCalcHUD === 'function') {
        showSolarCalcHUD('Simulación Térmico-Astronómica', 'Escaneando radiación directa, difusa y sombras...');
      }
    const progressBar = document.getElementById('heatmap-progress-bar');
    const progressFill = document.getElementById('heatmap-progress-fill');
    const diagText = document.getElementById('mlpe-diagnostic-text');
    if (progressBar) progressBar.style.display = 'block';
    if (progressFill) progressFill.style.width = '0%';
    if (diagText) {
      diagText.textContent = "Calculando modelo astronómico (192 instantes nominales, 6:00-21:00; sol ≥ 5°)...";
      diagText.style.color = "var(--sky-400)";
    }

    // 3. Inicializar acumuladores de energía por panel
    let totalPanelsCount = 0;
    polylines.forEach(poly => {
      const panels = Array.isArray(poly.panels) ? poly.panels : (poly.roofInfo && Array.isArray(poly.roofInfo.panels) ? poly.roofInfo.panels : []);
      panels.forEach(p => {
        if (!p || p.deleted || p.disabled || p.isGhost) return;
        totalPanelsCount++;
        p.annualTotalPotential = 0;
        p.annualShadedLoss = 0;
        p.annualLossPct = 0;
        p.annualYieldPct = 100;
        p.shadowHits = 0;
        p.activeDiodesHits = 0;
      });
    });
    // ── FASE 4 · Muestreo representativo en plantas grandes ──
    // El ray-tracing 3D por panel × 192 instantes no escala a ~MWp (horas de cálculo).
    // Por encima de 400 paneles se simula una muestra uniforme (paso = N) y el resto
    // hereda el resultado del panel muestreado más cercano en su faldón (misma retícula).
    const heatmapStride = (totalPanelsCount > 400) ? Math.ceil(totalPanelsCount / 400) : 1;
    let _sampleCounter = 0;
    polylines.forEach(poly => {
      const panels = Array.isArray(poly.panels) ? poly.panels : (poly.roofInfo && Array.isArray(poly.roofInfo.panels) ? poly.roofInfo.panels : []);
      panels.forEach(p => {
        if (!p || p.deleted || p.disabled || p.isGhost) return;
        p.heatmapSample = (heatmapStride === 1) ? true : ((_sampleCounter++) % heatmapStride === 0);
        p.heatmapInterpolated = false;
      });
    });

    if (totalPanelsCount === 0) {
      if (typeof hideSolarCalcHUD === 'function') hideSolarCalcHUD();
      if (progressBar) progressBar.style.display = 'none';
      if (diagText) diagText.textContent = "No hay paneles generados en la cubierta.";
      if (typeof window !== 'undefined' && window.solarSimState) window.solarSimState.isCalculatingHeatmap = false;
      return;
    }

    // 4. Parámetros geográficos y temporales configurados desde ShadowSettings
    const shadowCfg = (typeof window !== 'undefined' && window.ShadowSettings) ? window.ShadowSettings.getSettings() : {};
    const simResolution = shadowCfg.simResolution || window.raHeatmapResolution || 'medium';
    window.raHeatmapResolution = simResolution;
    const detailedBypass = (shadowCfg.detailedBypass !== undefined) ? shadowCfg.detailedBypass : true;

    let monthsDoy = [15, 45, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349];
    let monthDaysW = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let hours = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]; // 192 instantes (Ultra)

    if (simResolution === 'sketch') {
      // Modo Skyline 360° instantáneo (<0.1s): 12 meses x 6 horas de cálculo puro
      hours = [8, 10, 12, 14, 16, 18];
    } else if (simResolution === 'fast') {
      // Modo Rápida Solsticios (Opción 3): 4 fechas cardinales x 4 horas = 16 instantes (~0.3s)
      monthsDoy = [15, 105, 196, 288];
      monthDaysW = [90, 91, 92, 92];
      hours = [9, 12, 15, 17];
    } else if (simResolution === 'medium') {
      hours = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]; // 168 instantes horarios continuos (elimina aliasing)
    }
    // [B3] Paso de integración = intervalo REAL entre muestras (antes 16/N desajustaba el peso temporal).
    const hourStepDt = (hours.length > 1) ? (hours[hours.length - 1] - hours[0]) / (hours.length - 1) : 1.0;
    // [B3] Mes calendario real (0-11) de cada instante muestreado: en calidad media/rápida se
    // usaba el índice de bloque (mIdx) como si fuese el mes, falseando GHI y derating térmico.
    const _MONTH_START_DOY = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
    const doyToMonthIdx = (doy) => { let mi = 11; for (let k = 0; k < 12; k++) { if (doy >= _MONTH_START_DOY[k]) mi = k; } return mi; };
    const monthsReal = monthsDoy.map(doyToMonthIdx);
    // [B6] Acumulador de energía neta real por mes calendario (reparto mensual de los documentos).
    const _monthlyNetWh = new Array(12).fill(0);
    let lat = (window.solarProjectConfig && typeof window.solarProjectConfig.lat === 'number') ? window.solarProjectConfig.lat : null;
    let lng = (window.solarProjectConfig && typeof window.solarProjectConfig.lng === 'number') ? window.solarProjectConfig.lng : null;
    if (lat === null && typeof polygonAnalysis === 'function') {
      const pa = polygonAnalysis();
      if (pa && typeof pa.latDeg === 'number') { lat = pa.latDeg; lng = pa.lonDeg; }
    }
    if (lat === null) { lat = 41.3851; lng = 2.1734; }

    const totalSteps = monthsDoy.length * hours.length; // 192 instantes en calidad estándar
    const monthSpan = Math.max(1, Math.round(12 / monthsDoy.length));
    let unifiedTotalSteps = monthsDoy.length;
    let currentStep = 0;
    let frameStartTime = performance.now();

    function shrinkPolyInward(poly, marginM) {
      if (!poly || poly.length < 3 || marginM <= 0) return poly;
      let cx = 0, cy = 0;
      for (let i = 0; i < poly.length; i++) { cx += poly[i].u; cy += poly[i].v; }
      cx /= poly.length; cy /= poly.length;
      return poly.map(pt => {
        const du = pt.u - cx, dv = pt.v - cy;
        const len = Math.hypot(du, dv);
        if (len <= marginM * 1.5) return pt;
        const scale = Math.max(0.5, (len - marginM) / len);
        return { u: cx + du * scale, v: cy + dv * scale };
      });
    }

    // 5. Bucle Time-Sliced con presupuesto de 15ms (SSOT: RA.Radiation & polygon-shadow-math.js)
    const _radM = (typeof window !== 'undefined' && window.RA && window.RA.Radiation) ? window.RA.Radiation : null;
    const climaticZone = (typeof getClimaticZone === 'function') ? getClimaticZone(lat, lng) : 'interior';
    const noctModule = (activeModule && (activeModule.noct || activeModule.NOCT)) || 45;
    const rawGamma = (activeModule && (activeModule.tempCoeffPmax || activeModule.gammaPmp || (activeModule.tecnologia && activeModule.tecnologia.includes('N-Type') ? -0.0028 : -0.0034))) || -0.0034;
    const gammaCoeff = (Math.abs(rawGamma) > 0.05) ? rawGamma / 100.0 : rawGamma; // normaliza si viene en %/°C
    const raShadowSimCfg = (typeof window !== 'undefined' && window.raShadowSimConfig)
      ? {
          includeObstacles: window.raShadowSimConfig.includeObstacles !== false,
          includeBuildings: window.raShadowSimConfig.includeBuildings !== false,
          includeInterRow: window.raShadowSimConfig.includeInterRow !== false,
          shadowWeightPct: (typeof window.raShadowSimConfig.shadowWeightPct === 'number') ? window.raShadowSimConfig.shadowWeightPct : 100
        }
      : { includeObstacles: true, includeBuildings: true, includeInterRow: true, shadowWeightPct: 100 };
    // [MEJORA 3 AAA]: Delegación al Web Worker dedicado off-thread (60 FPS puros sin micro-tirones)
    let workerHandled = false;
    if (typeof Worker !== 'undefined' && typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http')) {
      try {
        const workerResults = await runHeatmapInDedicatedWorker({
          simGenerationId,
          lat,
          lng,
          resolution: simResolution,
          detailedBypass: detailedBypass,
          shadowSimConfig: raShadowSimCfg,
          polylines,
          climaticZone,
          moduleProps: {
            wp: (activeModule && activeModule.wp) || 450,
            noct: noctModule,
            gammaCoeff: gammaCoeff,
            isBifacial: isBifacial,
            bifacialityFactor: bifacialityFactor,
            iamB0: (activeModule && (activeModule.iamB0 || activeModule.b0)) || 0.05
          },
          monthlyGHI: (typeof getRobustMonthlyGHI === 'function')
            ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(m => getRobustMonthlyGHI(lat, lng, m))
            : null
        }, onProgressCallback, progressBar, progressFill, totalPanelsCount);

        if (simGenerationId !== _activeSimGenerationId) return;
        if (workerResults && workerResults.simGenerationId === _activeSimGenerationId) {
          if (typeof workerResults.unifiedTotalSteps === 'number') {
            unifiedTotalSteps = workerResults.unifiedTotalSteps;
          }
          applyWorkerHeatmapResults(polylines, workerResults.results, workerResults.monthlyNetWh, _monthlyNetWh);
          workerHandled = true;
          if (typeof window !== 'undefined' && window.RA && window.RA.log) {
            (typeof window.RA.log.info === 'function' ? window.RA.log.info : console.log)('[SOLAR WORKER] Simulación anual completada con éxito off-thread.');
          }
        }
      } catch (errWorker) {
        if (simGenerationId !== _activeSimGenerationId) return;
        console.warn('[SOLAR WORKER] Fallback al hilo principal:', errWorker);
      }
    }

    if (!workerHandled) {
      // Bucle Time-Sliced en hilo principal (Fallback garantizado)
      for (let mIdx = 0; mIdx < monthsDoy.length; mIdx++) {
      const m = monthsReal[mIdx];
      // Temperatura ambiente de diseño según zona climática y mes calendario REAL
      const tAmbMonth = _radM ? _radM.getAmbientTempMonth(climaticZone, m) : 15.0;
      const GHI_daily_Wh = (typeof getRobustMonthlyGHI === 'function')
        ? getRobustMonthlyGHI(lat, lng, m)
        : ((typeof estimateMonthlyGHI === 'function') ? estimateMonthlyGHI(lat, m) : (_radM ? _radM.estimateMonthlyGHI(lat, m) : 4600));

      // [C6] Distribución diurna específica del mes: se normaliza la curva seno para que la
      // energía integrada del mes sea EXACTAMENTE la insolación diaria real (antes se asumía
      // un día fijo de ~12 h → verano sobrestimado ~40% e invierno subestimado ~60%).
      // [B3] Hora solar astronómica determinista independiente de la zona horaria del PC del usuario
      const _gammaM = (2 * Math.PI / 365) * (monthsDoy[mIdx] - 1);
      const _EtM = 229.18 * (0.000075 + 0.001868 * Math.cos(_gammaM) - 0.032077 * Math.sin(_gammaM) - 0.014615 * Math.cos(2 * _gammaM) - 0.040849 * Math.sin(2 * _gammaM));

      let _sinAltSum = 0;
      if (typeof computeHighPrecisionSolarPosition === 'function') {
        for (let _hs = 0; _hs < hours.length; _hs++) {
          const _hsv = hours[_hs];
          const _utcPre = _hsv - (4 * lng + _EtM) / 60;
          const _spPre = computeHighPrecisionSolarPosition(lat, lng, monthsDoy[mIdx], _utcPre);
          if (_spPre && _spPre.isDay && _spPre.elevDeg >= 5.0) _sinAltSum += Math.sin(_spPre.elevDeg * Math.PI / 180);
        }
      }
      if (_sinAltSum <= 0) _sinAltSum = 1; // guarda ante latitudes polares / día nulo

      for (let hIdx = 0; hIdx < hours.length; hIdx++) {
        const h = hours[hIdx];
        currentStep++;

        // Hora solar nominal garantizada en el meridiano del proyecto (independiente de getTimezoneOffset del cliente)
        const utcHour = h - (4 * lng + _EtM) / 60;
        let solarPos = null;
        let dayLen = 12;
        if (typeof computeHighPrecisionSolarPosition === 'function') {
          const sp = computeHighPrecisionSolarPosition(lat, lng, monthsDoy[mIdx], utcHour);
          dayLen = (sp && sp.dayLengthHours) ? sp.dayLengthHours : 12;
          const elevRad_ = sp.elevRad;
          const azNRad = (sp.azDegFromNorth * Math.PI) / 180;
          const sunENU = new Cesium.Cartesian3(
            Math.cos(elevRad_) * Math.sin(azNRad),
            Math.cos(elevRad_) * Math.cos(azNRad),
            Math.sin(elevRad_)
          );
          const sDirHorizontal = new Cesium.Cartesian3(-sunENU.x, -sunENU.y, 0);
          if (Cesium.Cartesian3.magnitudeSquared(sDirHorizontal) > 1e-6) {
            Cesium.Cartesian3.normalize(sDirHorizontal, sDirHorizontal);
          }
          solarPos = {
            elevationDeg: sp.elevDeg,
            elevDeg: sp.elevDeg,
            isDaylight: sp.isDay,
            sunVecENU: sunENU,
            sDirENU: sDirHorizontal,
            // CTE DB-HE5: acotar longitud máxima de sombra a elevaciones solares útiles (evita artefactos asintóticos al amanecer/atardecer)
            shadowLenPerM: sp.elevDeg >= 5.0 ? Math.min(1 / Math.tan(elevRad_), 5.67) : 0
          };
        } else if (typeof computeSolarPosition === 'function') {
          const dLegacy = new Date(Date.UTC(2026, m, 15, Math.floor(utcHour), Math.floor((utcHour % 1) * 60)));
          solarPos = computeSolarPosition(dLegacy, lat, lng);
        }

        const elevation = solarPos ? solarPos.elevationDeg : -90;
        // CTE DB-HE5 / IDAE: descartar horas crepusculares extremas (elevación < 5.0°)
        if (!solarPos || !solarPos.isDaylight || !(elevation >= 5.0)) {
          continue;
        }

        const elevRad = Cesium.Math.toRadians(elevation);
        const sinAlt = Math.sin(elevRad);

        // [C6] Insolación instantánea conservando la energía diaria real del mes (integral = GHI_daily_Wh)
        const GHI_instant = Math.max(0, (GHI_daily_Wh / (_sinAltSum * hourStepDt)) * sinAlt);
        // [B2] Desagregación Erbs vía motor único de radiación (RA.Radiation)
        const _doyHeat = (typeof monthsDoy !== 'undefined' && monthsDoy[mIdx]) ? monthsDoy[mIdx] : 180;
        const _dec = _radM ? _radM.decomposeErbs(GHI_instant, elevation, _doyHeat) : { dhi: GHI_instant * 0.3, dni: Math.max(0, (GHI_instant * 0.7) / Math.max(sinAlt, 0.05)) };
        const G_dhi = _dec.dhi;
        const G_dni = _dec.dni;

        polylines.forEach(poly => {
          const pInfo = poly.roofInfo || (typeof computeSinglePolylineRoofInfo === "function" ? computeSinglePolylineRoofInfo(poly.points, poly) : null);
          if (!pInfo || !pInfo.panels) return;

          const uVec = pInfo.uVec || new Cesium.Cartesian3(1, 0, 0);
          const vVec = pInfo.vVec || new Cesium.Cartesian3(0, 1, 0);
          const norm = pInfo.normal || new Cesium.Cartesian3(0, 0, 1);
          const transform = pInfo.transform || Cesium.Transforms.eastNorthUpToFixedFrame(pInfo.center || new Cesium.Cartesian3(0,0,0));

          const sU = Cesium.Cartesian3.dot(solarPos.sDirENU, uVec);
          const sV = Cesium.Cartesian3.dot(solarPos.sDirENU, vVec);

          // Vector solar en coordenadas mundo (ECEF)
          let sunDirWorld = null;
          if (solarPos.sunVecENU && transform) {
            if (typeof Cesium.Matrix4.multiplyByPointAsVector === "function") {
              sunDirWorld = Cesium.Matrix4.multiplyByPointAsVector(transform, solarPos.sunVecENU, new Cesium.Cartesian3());
            } else if (typeof Cesium.Matrix4.multiplyByPoint === "function") {
              sunDirWorld = Cesium.Matrix4.multiplyByPoint(transform, solarPos.sunVecENU, new Cesium.Cartesian3());
            }
            if (sunDirWorld) Cesium.Cartesian3.normalize(sunDirWorld, sunDirWorld);
          }

          // Polígonos 2D de sombra de obstáculos
          const effClearance = (poly.estructura && typeof poly.estructura.clearance === 'number')
            ? poly.estructura.clearance
            : (poly.modStructure === 'pergola' ? 1.80 : 0);

          const shadowCfg = (typeof window !== 'undefined' && window.raShadowSimConfig)
            ? window.raShadowSimConfig
            : { includeObstacles: true, includeBuildings: true, includeInterRow: true, shadowWeightPct: 100 };

          const polyShadowQuads2D = [];
          const activeObstacles = getCombinedObstaclesAndTurbinesList();
          if (shadowCfg.includeObstacles !== false && activeObstacles && activeObstacles.length > 0) {
            activeObstacles.forEach(obs => {
              const obsH = typeof obs.h === 'number' ? obs.h : (obs.height || 0.5);
              if (effClearance > 0 && obsH <= effClearance + 0.10) return;
              if (typeof getObstacleShadowPolygons2DForRoof === "function") {
                const quads = getObstacleShadowPolygons2DForRoof(obs, pInfo, sU, sV, solarPos.shadowLenPerM);
                if (quads && quads.length > 0) polyShadowQuads2D.push(...quads);
              }
            });
          }
          if (shadowCfg.includeBuildings !== false && typeof buildings !== "undefined" && buildings && buildings.length > 0) {
            buildings.forEach(bld => {
              if (typeof getBuildingShadowPolygons2DForRoof === "function") {
                const quads = getBuildingShadowPolygons2DForRoof(bld, pInfo, sU, sV, solarPos.shadowLenPerM, poly);
                if (quads && quads.length > 0) polyShadowQuads2D.push(...quads);
              }
            });
          }
          // Sombra inter-filas entre paneles de la misma cubierta (Self-Shading)
          const interRowQuads = (shadowCfg.includeInterRow !== false)
            ? generateInterRowShadowQuads2D(pInfo, sU, sV, solarPos.shadowLenPerM)
            : [];
          if (interRowQuads.length > 0) {
            polyShadowQuads2D.push(...interRowQuads);
          }
          // Precalcular AABBs de los quads de sombra una vez por faldón/hora (SSOT: polygon-shadow-math.js)
          for (let qi = 0; qi < polyShadowQuads2D.length; qi++) {
            const q = polyShadowQuads2D[qi];
            if (!q || q.length === 0 || q.uMin !== undefined) continue;
            if (typeof precalcQuadAABB === 'function') precalcQuadAABB(q);
          }

          pInfo.panels.forEach((pData, pIdx) => {
            const mw = monthDaysW[mIdx] || 30;
            if (!pData || pData.deleted || pData.disabled || pData.isGhost || !pData.heatmapSample) return;

            // 1. Vector normal 3D del panel específico + paridad SVF / penumbra con Worker
            const panelNormWorld = getPanelNormalWorld(pData, norm, transform);
            const up = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(pData.center || (pData.corners && pData.corners[0]), new Cesium.Cartesian3());
            const cosSlope = Math.max(0, Math.min(1, Cesium.Cartesian3.dot(panelNormWorld, up)));
            const tiltRad = Math.acos(cosSlope);

            let diffuseOcclusion = 0.0;
            let minObsDist = Infinity;
            if (shadowCfg.includeObstacles !== false && activeObstacles && activeObstacles.length > 0 && typeof pData.u === 'number' && typeof pData.v === 'number') {
              for (let oi = 0; oi < activeObstacles.length; oi++) {
                const o = activeObstacles[oi];
                const oPts = (typeof getObstaclePolygon2DForRoof === 'function') ? getObstaclePolygon2DForRoof(o, 0.0, pInfo) : null;
                if (!oPts || oPts.length === 0) continue;
                let cU = 0, cV = 0;
                for (let k = 0; k < oPts.length; k++) { cU += oPts[k].u; cV += oPts[k].v; }
                cU /= oPts.length; cV /= oPts.length;
                const dObs = Math.hypot(pData.u - cU, pData.v - cV);
                if (dObs < minObsDist) minObsDist = dObs;
                const oH = typeof o.h === 'number' ? o.h : (o.height || 1.2);
                if (dObs > 0.1 && dObs < 25.0) {
                  diffuseOcclusion += (1 - Math.cos(Math.atan2(oH, dObs))) * 0.5;
                }
              }
            }
            const svfAmbient = Math.max(0.20, Math.min(1.0, 1.0 - diffuseOcclusion));
            let penumbraAttenuation = 1.0;
            if (minObsDist < Infinity && minObsDist > 0.5) {
              const penumbraWidth = minObsDist * 0.00925;
              if (penumbraWidth > 0.08) penumbraAttenuation = Math.max(0.85, 1.0 - (penumbraWidth / 2.0));
            }

            // 2. Ángulo de incidencia panel-sol
            const cosIncidence = sunDirWorld ? Cesium.Cartesian3.dot(sunDirWorld, panelNormWorld) : 0;

            // 3. Transposición física POA (W/m²) por módulo — motor único RA.Radiation (Perez 1990 anisotrópico)
            const moduleB0 = (activeModule && (activeModule.iamB0 || activeModule.b0)) || 0.05;
            const _tp = _radM
              ? _radM.transposeComponents({
                  ghi: GHI_instant, dhi: G_dhi, dni: G_dni,
                  cosTheta: cosIncidence, tiltRad: tiltRad,
                  albedo: 0.20, iamB0: moduleB0, sunElevDeg: elevation,
                  dayOfYear: _doyHeat,
                  diffuseModel: 'perez'
                })
              : { G_b_eff: Math.max(0, G_dni * cosIncidence), G_d_eff: G_dhi, G_r_eff: 0 };
            const G_beam = (_tp.G_b_eff !== undefined) ? _tp.G_b_eff : (_tp.G_b * _tp.iamBlend);
            const G_diffuse = ((_tp.G_d_eff !== undefined) ? _tp.G_d_eff : (_tp.G_d * _tp.iamBlend)) * svfAmbient;
            const G_albedo = (_tp.G_r_eff !== undefined) ? _tp.G_r_eff : (_tp.G_r * _tp.iamBlend);

            // Bifacialidad: factor de vista hacia cubierta/suelo con función coseno² escalada por altura libre
            const isRaised = !(pInfo && pInfo.coplanar) || (effClearance >= 0.25);
            const clearanceFactor = isRaised
              ? (effClearance >= 0.8 ? 0.72 : (effClearance >= 0.25 ? 0.55 : 0.35))
              : 0;
            const rearViewFactor = isRaised
              ? Math.max(0.06, Math.min(0.85, clearanceFactor * Math.pow(Math.cos(tiltRad / 2), 2)))
              : 0.04;
            const albedoGain = isBifacial ? (GHI_instant * 0.20 * rearViewFactor * bifacialityFactor) : 0;

            // Derating térmico físico continuo según radiación incidente sobre el módulo y temperatura ambiente (NOCT/IEC 61215)
            const G_poa_total = G_beam + G_diffuse + G_albedo;
            const tCellInst = (typeof calcTcell === 'function')
              ? calcTcell(tAmbMonth, G_poa_total, noctModule)
              : (tAmbMonth + (noctModule - 20) * (G_poa_total / 800));
            const tempFactor = Math.max(0.65, Math.min(1.18, 1 + gammaCoeff * (tCellInst - 25)));

            const instantPotentialW = (G_beam + G_diffuse + G_albedo + albedoGain) * tempFactor;
            pData.annualTotalPotential += instantPotentialW * mw * hourStepDt;

            // 4. Sombreado 2D (obstáculos) y 3D (Google 3D Tiles) con modelo de 3 sub-strings y diodos de bypass
            let isShaded = false;
            let shadedSubstringsCount = 0;
            if (polyShadowQuads2D.length > 0) {
              let panelPoly2D = null;
              if (Array.isArray(pData.corners) && pData.corners.length === 4 && pInfo && pInfo.invTransform && pInfo.uVec && pInfo.vVec) {
                panelPoly2D = pData.corners.map(c => {
                  const loc = Cesium.Matrix4.multiplyByPoint(pInfo.invTransform, c, new Cesium.Cartesian3());
                  return {
                    u: Cesium.Cartesian3.dot(loc, pInfo.uVec),
                    v: Cesium.Cartesian3.dot(loc, pInfo.vVec)
                  };
                });
              } else if (typeof pData.u === 'number' && typeof pData.v === 'number') {
                const halfW = (pData.w || 1.05) / 2;
                const halfH = (pData.h || 2.10) / 2;
                panelPoly2D = [
                  { u: pData.u - halfW, v: pData.v - halfH },
                  { u: pData.u + halfW, v: pData.v - halfH },
                  { u: pData.u + halfW, v: pData.v + halfH },
                  { u: pData.u - halfW, v: pData.v + halfH }
                ];
              }

              if (panelPoly2D && panelPoly2D.length >= 3) {
                let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
                for (let pi = 0; pi < panelPoly2D.length; pi++) {
                  const ppt = panelPoly2D[pi];
                  if (ppt.u < uMin) uMin = ppt.u;
                  if (ppt.u > uMax) uMax = ppt.u;
                  if (ppt.v < vMin) vMin = ppt.v;
                  if (ppt.v > vMax) vMax = ppt.v;
                }

                // Área celular activa (descontando ~4.5 cm del marco de aluminio inactivo) para paridad exacta con el Worker
                const activeCellPoly = shrinkPolyInward(panelPoly2D, 0.045);
                // Discretización física en 3 sub-cadenas (diodos de bypass IEC 61215)
                const subStrings = (detailedBypass && activeCellPoly.length === 4)
                  ? dividePanelIntoSubstrings2D(activeCellPoly)
                  : [activeCellPoly];
                const subShaded = new Array(subStrings.length).fill(false);

                for (const quad of polyShadowQuads2D) {
                  if (!quad || quad.length === 0) continue;

                  // DESCARTE DE AUTO-SOMBREADO INTER-FILAS:
                  if (quad.sourcePanelIdx !== undefined) {
                    const curIdx = (pData.layoutIndex !== undefined) ? pData.layoutIndex : pIdx;
                    if (quad.sourcePanelIdx === curIdx) continue; // Un panel jamás se hace sombra a sí mismo

                    const pGridA = (typeof pData.gridA === 'number') ? pData.gridA : ((pData.frame && typeof pData.frame.Lu === 'number') ? (pData.u * pData.frame.Lu + pData.v * pData.frame.Lv) : null);
                    if (typeof quad.gridA === 'number' && typeof pGridA === 'number') {
                      if (Math.abs(quad.gridA - pGridA) < (pData.h || 2.10) * 0.40) continue;
                    } else if (pData.frame && typeof pData.frame.Lu === 'number') {
                      const qRowProj = quad.sourceU * pData.frame.Lu + quad.sourceV * pData.frame.Lv;
                      const pRowProj = pData.u * pData.frame.Lu + pData.v * pData.frame.Lv;
                      if (Math.abs(qRowProj - pRowProj) < (pData.h || 2.10) * 0.40) continue;
                    } else if (quad.frame && typeof quad.frame.Lu === 'number') {
                      const qRowProj = quad.sourceU * quad.frame.Lu + quad.sourceV * quad.frame.Lv;
                      const pRowProj = pData.u * quad.frame.Lu + pData.v * quad.frame.Lv;
                      if (Math.abs(qRowProj - pRowProj) < (pData.h || 2.10) * 0.40) continue;
                    } else {
                      if (Math.abs(quad.sourceV - pData.v) < (pData.h || 2.10) * 0.40) continue;
                      if (Math.abs(quad.sourceU - pData.u) < (pData.w || 1.05) * 0.40) continue;
                    }
                  }

                  // AABB Broadphase check usando AABB precalculada una vez por hora
                  if (uMax < quad.uMin || uMin > quad.uMax || vMax < quad.vMin || vMin > quad.vMax) {
                    continue; // Sin solapamiento en bounding box
                  }

                  if (typeof polygonsIntersect2D === "function") {
                    for (let sIdx = 0; sIdx < subStrings.length; sIdx++) {
                      if (!subShaded[sIdx] && polygonsIntersect2D(subStrings[sIdx], quad)) {
                        subShaded[sIdx] = true;
                      }
                    }
                    if (subShaded.every(s => s)) break;
                  }
                }

                shadedSubstringsCount = (!detailedBypass && subShaded.some(Boolean))
                  ? 3
                  : subShaded.filter(Boolean).length;
                if (shadedSubstringsCount > 0) {
                  isShaded = true;
                }
              }
            }

            // Raycast sincrono eliminado en hilo principal para evitar congelacion de la app

            // Fracción física de pérdida de haz según sub-strings bajo sombra (ajustada por peso manual del usuario)
            const shadowWeightFactor = Math.max(0, Math.min(1, ((typeof shadowCfg.shadowWeightPct === 'number') ? shadowCfg.shadowWeightPct : 100) / 100.0));
            const beamShadedFraction = ((shadedSubstringsCount > 0)
              ? (shadedSubstringsCount / 3.0)
              : (isShaded ? 1.0 : 0.0)) * shadowWeightFactor;

            // Topología eléctrica unificada con solar-worker.js (half-cut suavizado):
            const hasOpt = !!(pData.hasOptimizer || pData.optimizerModelId);
            let effectiveLossFraction = beamShadedFraction;
            if (!hasOpt && shadedSubstringsCount > 0) {
              const mismatchBonus = (shadedSubstringsCount === 1) ? 0.10 : (shadedSubstringsCount === 2 ? 0.14 : 0.0);
              effectiveLossFraction = Math.min(1.0, beamShadedFraction * (1.0 + mismatchBonus));
            }

            // Separación física: el obstáculo bloquea la radiación directa (G_beam).
            // La radiación difusa y albedo persisten salvo la fracción geométrica aislada por bypass.
            const beamLossW = (isShaded && effectiveLossFraction > 0) ? (G_beam * tempFactor * effectiveLossFraction * penumbraAttenuation) : 0;
            const diffuseLossW = (!hasOpt && shadedSubstringsCount > 0)
              ? ((G_diffuse + G_albedo + albedoGain) * tempFactor * (beamShadedFraction * 0.12))
              : 0;
            const instantLossW = beamLossW + diffuseLossW;

            if (isShaded && instantLossW > 0) {
              pData.shadowHits = (pData.shadowHits || 0) + mw * hourStepDt;
              pData.activeDiodesHits = (pData.activeDiodesHits || 0) + shadedSubstringsCount * mw * hourStepDt;
              pData.annualShadedLoss += instantLossW * mw * hourStepDt;
            }

            // [B6] Energía neta real del mes calendario (escalada por kWp individual del módulo).
            const effectiveLossW = (isShaded && instantLossW > 0) ? instantLossW : 0;
            const _fallbackWp = (activeModule && activeModule.wp) || 450;
            const _polyWp = (typeof wpGetPolyWp === 'function') ? wpGetPolyWp(poly) : _fallbackWp;
            const _pKwpIndiv = ((typeof pData.wp === 'number' && pData.wp > 0) ? pData.wp : _polyWp) / 1000.0;
            _monthlyNetWh[m] += (instantPotentialW - effectiveLossW) * mw * hourStepDt * _pKwpIndiv;
          });
        });

        // ⏱️ TIME-SLICING: Ceder control al navegador si se supera el presupuesto de 15ms
        if (performance.now() - frameStartTime > 15) {
          if (simGenerationId !== _activeSimGenerationId) {
            // Abortar silenciosamente esta tarea en segundo plano porque se lanzó una nueva
            return;
          }
          const progressPct = Math.min(99, Math.round((currentStep / totalSteps) * 100));
          const currentRealMonth = (monthsReal && monthsReal[mIdx] !== undefined) ? monthsReal[mIdx] : mIdx;
          if (typeof updateSolarCalcHUD === 'function') {
            updateSolarCalcHUD(progressPct, currentRealMonth, totalPanelsCount, {
              stepIndex: mIdx + 1,
              totalStepsCount: monthsDoy.length,
              monthSpan: monthSpan,
              phaseText: 'Cálculo analítico'
            });
          }
          if (progressFill) progressFill.style.width = progressPct + '%';
          if (typeof onProgressCallback === 'function') {
            onProgressCallback(progressPct, currentRealMonth, totalPanelsCount);
          }
          await new Promise(resolve => setTimeout(resolve, 0));
          if (simGenerationId !== _activeSimGenerationId) return;
          frameStartTime = performance.now();
        }
      }
      if (simGenerationId !== _activeSimGenerationId) return;
      const stepPct = Math.min(99, Math.round(((mIdx + 1) / monthsDoy.length) * 100));
      if (typeof updateSolarCalcHUD === 'function') {
        updateSolarCalcHUD(stepPct, m, totalPanelsCount, {
          stepIndex: mIdx + 1,
          totalStepsCount: monthsDoy.length,
          monthSpan: monthSpan,
          phaseText: 'Cálculo analítico'
        });
      }
      if (progressFill) progressFill.style.width = stepPct + '%';
      await new Promise(resolve => setTimeout(resolve, 0));
      if (simGenerationId !== _activeSimGenerationId) return;
      frameStartTime = performance.now();
    }
  }

    if (simGenerationId !== _activeSimGenerationId) return;

    // 6. Cálculo final de porcentajes, producción anual en kWh y clasificación
    const pNomW = (activeModule && activeModule.wp) || 450;
    const prCalc = (typeof window !== 'undefined' && typeof window.raCalculateSystemPR === 'function')
      ? window.raCalculateSystemPR(0.925)
      : { prTotal: 0.84, prBOS: 0.885 };
    // Dado que el modelo por instantes ya integra las pérdidas angulares (IAM), térmicas (tempFactor)
    // y de sombreado/bypass por sub-strings en cada hora, se excluye `bypass` de prBOS para evitar doble descuento.
    let prSys = (typeof prCalc.prBOS === 'number') ? prCalc.prBOS : (prCalc.prTotal / (0.925 * (1 - 0.028)));
    if (prCalc.factors && typeof prCalc.factors.bypass === 'number' && prCalc.factors.bypass > 0 && prCalc.factors.bypass < 1) {
      prSys = prSys / (1 - prCalc.factors.bypass);
    }

    let maxNetWh = 0;
    polylines.forEach(poly => {
      const panels = Array.isArray(poly.panels) ? poly.panels : (poly.roofInfo && Array.isArray(poly.roofInfo.panels) ? poly.roofInfo.panels : []);
      panels.forEach(p => {
        if (!p || p.deleted || p.disabled || p.isGhost) return;
        const netWh = Math.max(0, p.annualTotalPotential - (p.annualShadedLoss || 0));
        if (netWh > maxNetWh) maxNetWh = netWh;
      });
    });
    if (maxNetWh <= 0) maxNetWh = 1;

    polylines.forEach(poly => {
      const polyWp = (typeof wpGetPolyWp === 'function') ? wpGetPolyWp(poly) : pNomW;
      const panels = Array.isArray(poly.panels) ? poly.panels : (poly.roofInfo && Array.isArray(poly.roofInfo.panels) ? poly.roofInfo.panels : []);
      panels.forEach(p => {
        if (!p || p.deleted || p.disabled || p.isGhost) return;
        const lossPct = (p.annualTotalPotential > 0)
          ? (p.annualShadedLoss / p.annualTotalPotential) * 100
          : 0;
        p.annualLossPct = Math.round(lossPct * 10) / 10;
        p.annualYieldPct = Math.max(0, Math.round((100 - p.annualLossPct) * 10) / 10);

        const netWh = Math.max(0, p.annualTotalPotential - (p.annualShadedLoss || 0));
        const panelKwp = ((typeof p.wp === 'number' && p.wp > 0) ? p.wp : polyWp) / 1000.0;
        // Generación bruta anual fotovoltaica y generación neta tras PR de sistema
        p.annualGrossKwh = (netWh / 1000.0) * panelKwp;
        p._lastPrSys = prSys;
        p.annualKwh = Math.round(p.annualGrossKwh * prSys);
        p.annualTotalInsolation = Math.round(netWh / 1000.0);

        // Rendimiento comparativo relativo al módulo óptimo de la instalación
        const relativeYield = netWh / maxNetWh;
        p.relativeYieldPct = Math.round(relativeYield * 1000) / 10;

        // Gradiente cromático (Relativo vs. Líder o Pérdidas por Sombra según configuración)
        const heatCol = (typeof getActiveHeatmapColorForPanel === 'function')
          ? getActiveHeatmapColorForPanel(p)
          : ((typeof getHeatmapColor === 'function') ? getHeatmapColor(p.annualLossPct) : null);
        let hexColor = heatCol ? heatCol.hex : '#10b981';
        if (!heatCol) {
          if (p.annualLossPct <= 2.0) hexColor = '#059669';
          else if (p.annualLossPct <= 4.0) hexColor = '#10b981';
          else if (p.annualLossPct <= 6.0) hexColor = '#84cc16';
          else if (p.annualLossPct <= 8.0) hexColor = '#a3e635';
          else if (p.annualLossPct <= 11.0) hexColor = '#facc15';
          else if (p.annualLossPct <= 15.0) hexColor = '#f59e0b';
          else if (p.annualLossPct <= 20.0) hexColor = '#f97316';
          else if (p.annualLossPct <= 25.0) hexColor = '#ea580c';
          else if (p.annualLossPct <= 35.0) hexColor = '#ef4444';
          else hexColor = '#991b1b';
        }
        p.heatmapColor = heatCol || { hex: hexColor };

        p.isNormal = p.annualLossPct < 8.0;
        p.requiresMLPE = p.annualLossPct >= 8.0;
        p.isUnviable = p.annualLossPct >= 25.0;
      });
    });

    // [B6] Reparto mensual canónico (kWh) derivado de la SIMULACIÓN REAL. En calidad media/rápida
    // se muestrean bloques multi-mes; cada bloque se reparte entre sus meses según el modelo de
    // radiación, de modo que Σ meses = producción anual y la memoria/oferta cuadran entre sí.
    try {
      const _ghiW = new Array(12).fill(0);
      for (let _k = 0; _k < 12; _k++) {
        const _days = (typeof MONTH_DAYS !== 'undefined' && MONTH_DAYS[_k]) ? MONTH_DAYS[_k] : [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][_k];
        _ghiW[_k] = ((typeof estimateMonthlyGHI === 'function') ? estimateMonthlyGHI(lat, _k) : 1) * _days;
      }
      const _monthlyKwhOut = new Array(12).fill(0);
      for (let _i = 0; _i < monthsReal.length; _i++) {
        const _start = (_i === 0) ? 0 : monthsReal[_i];
        const _end = (_i + 1 < monthsReal.length) ? monthsReal[_i + 1] : 12;
        const effStride = workerHandled ? 1 : (heatmapStride || 1);
        const _blockVal = (_monthlyNetWh[monthsReal[_i]] * effStride) / 1000.0 * prSys;
        let _wSum = 0;
        for (let _k = _start; _k < _end; _k++) _wSum += _ghiW[_k];
        if (_wSum <= 0) _wSum = (_end - _start) || 1;
        for (let _k = _start; _k < _end; _k++) _monthlyKwhOut[_k] = Math.round(_blockVal * _ghiW[_k] / _wSum);
      }
      if (!window.solarSimState) window.solarSimState = {};
      window.solarSimState.monthlyKwh = _monthlyKwhOut;
      window.solarSimState.monthlyKwhAt = Date.now();
    } catch (eMonthly) { /* reparto mensual opcional: nunca bloquear la simulación */ }

    // ── Interpolación de paneles no muestreados: heredan del panel muestreado más
    // cercano dentro de su mismo faldón (misma retícula ⇒ sombreado similar) ──
    if (heatmapStride > 1 && !workerHandled) {
      polylines.forEach(poly => {
        const panels = Array.isArray(poly.panels) ? poly.panels : (poly.roofInfo && Array.isArray(poly.roofInfo.panels) ? poly.roofInfo.panels : []);
        const samples = panels.filter(p => p.heatmapSample && typeof p.annualLossPct === 'number');
        if (samples.length === 0) return;
        panels.forEach(p => {
          if (p.heatmapSample || typeof p.u !== 'number') return;
          let mejor = null, mejorD = Infinity;
          for (const s of samples) {
            const d = (s.u - p.u) * (s.u - p.u) + (s.v - p.v) * (s.v - p.v);
            if (d < mejorD) { mejorD = d; mejor = s; }
          }
          if (mejor) {
            p.annualLossPct = mejor.annualLossPct;
            p.annualYieldPct = mejor.annualYieldPct;
            p.annualKwh = mejor.annualKwh;
            // Heredar también la base bruta simulada: sin esto el panel conserva la bruta
            // paramétrica previa (sin sombras) y, al recalcular pérdidas, la producción sube.
            p.annualGrossKwh = mejor.annualGrossKwh;
            p._lastPrSys = mejor._lastPrSys;
            p.annualTotalPotential = mejor.annualTotalPotential;
            p.annualShadedLoss = mejor.annualShadedLoss;
            p.relativeYieldPct = mejor.relativeYieldPct;
            p.heatmapColor = mejor.heatmapColor;
            p.annualTotalInsolation = mejor.annualTotalInsolation;
            p.isNormal = mejor.isNormal;
            p.requiresMLPE = mejor.requiresMLPE;
            p.isUnviable = mejor.isUnviable;
            p.heatmapInterpolated = true;
          }
        });
      });
    }

    // Sincronizar métricas de calor calculadas hacia window.allRenderedPanels si difieren (O(1) Map Lookup)
    if (typeof window !== 'undefined' && Array.isArray(window.allRenderedPanels) && window.allRenderedPanels.length > 0) {
      const liveMap = new Map();
      window.allRenderedPanels.forEach(lp => {
        if (!lp) return;
        if (lp.panelId) liveMap.set(lp.panelId, lp);
        if (lp.layoutIndex !== undefined && lp.polyIdx !== undefined) {
          liveMap.set(lp.polyIdx + '_' + lp.layoutIndex, lp);
        }
      });
      polylines.forEach(poly => {
        const panels = Array.isArray(poly.panels) ? poly.panels : (poly.roofInfo && Array.isArray(poly.roofInfo.panels) ? poly.roofInfo.panels : []);
        panels.forEach(p => {
          const match = liveMap.get(p.panelId) || liveMap.get(p.polyIdx + '_' + p.layoutIndex);
          if (match && match !== p) {
            match.annualLossPct = p.annualLossPct;
            match.annualYieldPct = p.annualYieldPct;
            match.annualGrossKwh = p.annualGrossKwh;
            match._lastPrSys = p._lastPrSys;
            match.annualKwh = p.annualKwh;
            match.relativeYieldPct = p.relativeYieldPct;
            match.heatmapColor = p.heatmapColor;
            match.annualTotalPotential = p.annualTotalPotential;
            match.annualShadedLoss = p.annualShadedLoss;
            match.annualTotalInsolation = p.annualTotalInsolation;
            match.isNormal = p.isNormal;
            match.requiresMLPE = p.requiresMLPE;
            match.isUnviable = p.isUnviable;
          }
        });
      });
    }

    // 6.2 Almacenar caché SSOT persistente e inmutable en solarSimState.panelCache
    if (!window.solarSimState) window.solarSimState = {};
    const panelCache = new Map();
    polylines.forEach((poly, polyIdx) => {
      const panels = Array.isArray(poly.panels) ? poly.panels : (poly.roofInfo && Array.isArray(poly.roofInfo.panels) ? poly.roofInfo.panels : []);
      panels.forEach((p, idx) => {
        const pId = p.panelId || ('pan_' + polyIdx + '_' + (p.layoutIndex ?? idx));
        const keyCoord = polyIdx + '_' + (p.layoutIndex ?? idx);
        const data = {
          annualLossPct: p.annualLossPct,
          annualYieldPct: p.annualYieldPct,
          annualGrossKwh: p.annualGrossKwh,
          _lastPrSys: p._lastPrSys,
          annualKwh: p.annualKwh,
          relativeYieldPct: p.relativeYieldPct,
          heatmapColor: p.heatmapColor,
          annualTotalPotential: p.annualTotalPotential,
          annualShadedLoss: p.annualShadedLoss,
          annualTotalInsolation: p.annualTotalInsolation,
          annualShadedInsolation: p.annualShadedInsolation,
          shadowHits: p.shadowHits,
          isNormal: p.isNormal,
          requiresMLPE: p.requiresMLPE,
          isUnviable: p.isUnviable
        };
        panelCache.set(pId, data);
        panelCache.set(keyCoord, data);
      });
    });
    window.solarSimState.panelCache = panelCache;
    if (typeof solarSimState !== 'undefined' && solarSimState && solarSimState !== window.solarSimState) {
      solarSimState.panelCache = panelCache;
    }

    // 7. Evaluar diagnóstico y actualizar telemetría
    const diag = wpEvaluateMLPENecessity();
    const p2LossBadge = document.getElementById('p2-shading-loss-badge');
    if (p2LossBadge) {
      const affected = (diag.unviablePanelsCount || 0) + (diag.criticalLossPanelsCount || 0);
      if (affected > 0) {
        p2LossBadge.textContent = affected + ' CON SOMBRA';
        p2LossBadge.style.background = 'rgba(239,68,68,0.2)';
        p2LossBadge.style.color = '#F87171';
      } else {
        p2LossBadge.textContent = '0% SOMBRA (OPTIMO)';
        p2LossBadge.style.background = 'rgba(16,185,129,0.2)';
        p2LossBadge.style.color = '#34D399';
      }
    }
    if (diagText) {
      let iconColor = "var(--emerald-400)";
      if (diag.unviablePanelsCount > 0) iconColor = "var(--rose-400)";
      else if (diag.criticalLossPanelsCount > 0) iconColor = "var(--amber-400)";

      diagText.innerHTML = `
        <div style="font-weight:700;color:${iconColor};margin-bottom:4px;">
          ✓ Simulación anual completada (192 instantes nominales, 6:00-21:00; sol ≥ 5°${heatmapStride > 1 ? ', muestreo 1 de ' + heatmapStride + ' paneles' : ''})
        </div>
        <div style="font-size: 10px;line-height:1.35;color:var(--text-slate-300);">
          ${diag.recommendationMsg}
        </div>
      `;
      if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
    }

    // 8. Marcar 100% completado en HUD y ceder un fotograma antes del reconstruido 3D
    if (typeof updateSolarCalcHUD === 'function') {
      updateSolarCalcHUD(100, 11, totalPanelsCount, {
        stepIndex: unifiedTotalSteps,
        totalStepsCount: unifiedTotalSteps,
        monthSpan: 1,
        phaseText: 'Completado'
      });
    }
    if (progressFill) progressFill.style.width = '100%';
    await new Promise(r => {
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(r);
      else setTimeout(r, 0);
    });
    if (simGenerationId !== _activeSimGenerationId) return;

    // 9. Actualizar visuales 3D al modo Heatmap
    if (!window.solarSimState) window.solarSimState = {};
    window.solarSimState.viewMode = 'heatmap';
    window.solarSimState.annualHeatmapData = true;
    window.solarSimState.annualHeatmapDirty = false;
    window.solarSimState.isCalculatingHeatmap = false; // [B4] fin de simulación: desbloquear documentos
    if (typeof solarSimState !== 'undefined' && solarSimState && solarSimState !== window.solarSimState) {
      solarSimState.viewMode = 'heatmap';
      solarSimState.annualHeatmapData = true;
      solarSimState.annualHeatmapDirty = false;
      solarSimState.isCalculatingHeatmap = false;
    }

    if (typeof wpFastRenderSimulatedPanels === 'function') {
      await wpFastRenderSimulatedPanels(true);
    }
    if (typeof wpRenderHeatmapVisuals === 'function') {
      wpRenderHeatmapVisuals();
    }
    if (typeof recalculateSolarYield === 'function') {
      recalculateSolarYield();
    }
    if (typeof wpUpdateStep3DirtyAlert === 'function') {
      wpUpdateStep3DirtyAlert();
    }
    if (typeof wpUpdateShadedCleanupUI === 'function') {
      wpUpdateShadedCleanupUI();
    }
    if (typeof wpUpdateCommercialPathsUI === 'function') {
      wpUpdateCommercialPathsUI();
    }

    // 10. Ocultar HUDs de carga tras completar el repintado 3D
    if (typeof hideSolarCalcHUD === 'function') hideSolarCalcHUD();
    if (progressBar) {
      setTimeout(() => { progressBar.style.display = 'none'; }, 1500);
    }
    } finally {
      if (simGenerationId === _activeSimGenerationId) {
        if (typeof window !== 'undefined' && window.solarSimState) {
          window.solarSimState.isCalculatingHeatmap = false;
        }
        if (typeof hideSolarCalcHUD === 'function') hideSolarCalcHUD();
      }
    }
  }

  // ── 5. EXPORTACIÓN CANÓNICA ───────────────────────────────────────────────
  window.wpUpdatePanelShadingAndMLPE = wpUpdatePanelShadingAndMLPE;
  window.wpEvaluateMLPENecessity = wpEvaluateMLPENecessity;
  let _lastInvalToastTs = 0;
  window.wpInvalidateHeatmap = function(reason) {
    _activeSimGenerationId++; // Cancelación atómica inmediata de cualquier simulación asíncrona en curso
    try { _horizonSpatialCache.clear(); } catch (_) {}
    if (_activeHeatmapWorker) {
      try { _activeHeatmapWorker.terminate(); } catch (_) {}
      _activeHeatmapWorker = null;
    }
    if (typeof window !== 'undefined' && window.RAProduction && typeof window.RAProduction.clearCache === 'function') {
      window.RAProduction.clearCache();
    }
    if (typeof hideSolarCalcHUD === 'function') hideSolarCalcHUD();
    // Reactividad en vivo: si el modo Live Heatmap está activo, reevaluar en caliente
    if (typeof window !== 'undefined' && window.LiveSolarProbe && window.LiveSolarProbe.enabled) {
      window.LiveSolarProbe.evaluate();
    }
    const wasHeatmapMode = !!(
      (window.solarSimState && window.solarSimState.viewMode === 'heatmap') ||
      (typeof solarSimState !== 'undefined' && solarSimState && solarSimState.viewMode === 'heatmap')
    );
    if (window.solarSimState) {
      window.solarSimState.annualHeatmapData = null;
      window.solarSimState.annualHeatmapDirty = true;
      window.solarSimState.panelCache = null;
      window.solarSimState._lastInvalReason = reason || 'Cubierta modificada';
      window.solarSimState.annualHeatmapInvalidatedAt = Date.now();
      window.solarSimState.isCalculatingHeatmap = false;
      window.solarSimState.monthlyKwh = null; // [B6] invalidar reparto mensual derivado
      window.solarSimState.viewMode = 'normal';
    }
    if (typeof solarSimState !== 'undefined' && solarSimState && solarSimState !== window.solarSimState) {
      solarSimState.annualHeatmapData = null;
      solarSimState.annualHeatmapDirty = true;
      solarSimState.panelCache = null;
      solarSimState._lastInvalReason = reason || 'Cubierta modificada';
      solarSimState.annualHeatmapInvalidatedAt = Date.now();
      solarSimState.isCalculatingHeatmap = false;
      solarSimState.monthlyKwh = null;
      solarSimState.viewMode = 'normal';
    }
    if (window.solarSimState) {
      if (window.solarSimState.obstacleShadowSurfaceEntities && Array.isArray(window.solarSimState.obstacleShadowSurfaceEntities)) {
        if (typeof viewer !== 'undefined' && viewer && viewer.entities) {
          window.solarSimState.obstacleShadowSurfaceEntities.forEach(e => {
            try { viewer.entities.remove(e); } catch(_) {}
          });
        }
        window.solarSimState.obstacleShadowSurfaceEntities = [];
      }
      if (window.solarSimState.mlpeBadgeEntities && Array.isArray(window.solarSimState.mlpeBadgeEntities)) {
        if (typeof viewer !== 'undefined' && viewer && viewer.entities) {
          window.solarSimState.mlpeBadgeEntities.forEach(e => {
            try { viewer.entities.remove(e); } catch(_) {}
          });
        }
        window.solarSimState.mlpeBadgeEntities = [];
      }
    }

    // 1. Purgar caché de rendimiento e irradiancia de TODOS los paneles en memoria
    const purgePanel = function(p) {
      if (!p) return;
      delete p.annualLossPct;
      delete p.annualYieldPct;
      delete p.annualKwh;
      delete p.relativeYieldPct;
      delete p.heatmapColor;
      delete p.annualTotalPotential;
      delete p.annualShadedLoss;
      delete p.annualTotalInsolation;
      delete p.annualShadedInsolation;
      delete p.shadowHits;
      delete p.heatmapSample;
      delete p.heatmapInterpolated;
      p.isNormal = true;
      p.requiresMLPE = false;
      p.isUnviable = false;
    };

    if (window.WP && Array.isArray(window.WP.polylines)) {
      window.WP.polylines.forEach(pl => {
        if (pl && pl.roofInfo && Array.isArray(pl.roofInfo.panels)) pl.roofInfo.panels.forEach(purgePanel);
        if (pl && Array.isArray(pl.panels)) pl.panels.forEach(purgePanel);
      });
    }
    if (typeof lastRoofInfo !== 'undefined' && lastRoofInfo && Array.isArray(lastRoofInfo.panels)) {
      lastRoofInfo.panels.forEach(purgePanel);
    }
    if (Array.isArray(window.allRenderedPanels)) {
      window.allRenderedPanels.forEach(purgePanel);
    }

    if (window.RAMeasureTool && typeof window.RAMeasureTool.invalidateSnapCandidates === 'function') {
      window.RAMeasureTool.invalidateSnapCandidates();
    }

    // 2. Si estaba en modo heatmap visual, limpiar las etiquetas 3D de producción
    if (window.solarSimState && window.solarSimState.heatmapLabelEntities && Array.isArray(window.solarSimState.heatmapLabelEntities)) {
      if (typeof viewer !== 'undefined' && viewer && viewer.entities) {
        window.solarSimState.heatmapLabelEntities.forEach(e => {
          if (e && e.id) {
            try { viewer.entities.remove(e); } catch(errRem) { if (window.RA_ErrorHandler) window.RA_ErrorHandler.handle(errRem, 'Entidad/Primitiva Cesium'); }
          } else if (e && e.label && window._solarHeatmapLabelCollection) {
            try { window._solarHeatmapLabelCollection.remove(e.label); } catch(errRem) { if (window.RA_ErrorHandler) window.RA_ErrorHandler.handle(errRem, 'Entidad/Primitiva Cesium'); }
          }
        });
      }
      window.solarSimState.heatmapLabelEntities = [];
    }
    if (window._solarHeatmapLabelCollection) {
      try { window._solarHeatmapLabelCollection.removeAll(); } catch(errRem) { if (window.RA_ErrorHandler) window.RA_ErrorHandler.handle(errRem, 'Entidad/Primitiva Cesium'); }
    }
    if (window.solarSimState && window.solarSimState.mlpeBadgeEntities && Array.isArray(window.solarSimState.mlpeBadgeEntities)) {
      if (typeof viewer !== 'undefined' && viewer && viewer.entities) {
        window.solarSimState.mlpeBadgeEntities.forEach(e => {
          try { viewer.entities.remove(e); } catch(_) {}
        });
      }
      window.solarSimState.mlpeBadgeEntities = [];
    }

    // 3. Actualizar la UI y badges de pérdidas a estado pendiente/obsoleto
    const p2LossBadge = document.getElementById('p2-shading-loss-badge');
    if (p2LossBadge) {
      p2LossBadge.textContent = '⚠ ANÁLISIS OBSOLETO';
      p2LossBadge.style.background = 'rgba(245,158,11,0.2)';
      p2LossBadge.style.color = '#F59E0B';
    }

    const btnHeatmap = document.getElementById('btn-run-annual-heatmap');
    if (btnHeatmap) {
      btnHeatmap.style.borderColor = '#F59E0B';
      btnHeatmap.style.color = '#F59E0B';
      btnHeatmap.innerHTML = '<i data-lucide="refresh-cw" class="icon-sm"></i> ⚠ RECALCULAR MAPA DE CALOR 3D (DATOS OBSOLETOS)';
      if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
    }

    const diagText = document.getElementById('mlpe-diagnostic-text');
    if (diagText) {
      diagText.innerHTML = `
        <div style="font-weight:700;color:#F59E0B;margin-bottom:4px;">
          ⚠ Análisis solar desactualizado
        </div>
        <div style="font-size: 10px;line-height:1.35;color:var(--text-slate-300);">
          ${reason ? reason + '. ' : ''}La geometría o parámetros han cambiado. Pulsa en <b>Recalcular Mapa de Calor</b> para computar sombras y kWh reales.
        </div>
      `;
      if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
    }

    // 4. Refrescar producción en el balance global
    if (typeof recalculateSolarYield === 'function') {
      recalculateSolarYield();
    }

    // 5. Avisar visualmente al usuario SOLO si ya existía una simulación previa de heatmap y no estamos en fase de diseño inicial (Paso 1)
    const currentStep = (typeof wpCurrentStep !== 'undefined') ? wpCurrentStep : 1;
    const shouldNotify = wasHeatmapMode || (currentStep >= 3);
    if (shouldNotify) {
      if (typeof window.showToast === 'function' && (Date.now() - _lastInvalToastTs) > 6000) {
        _lastInvalToastTs = Date.now();
        window.showToast('ANÁLISIS SOLAR OBSOLETO', (reason ? reason + '. ' : '') + 'Pulsa en "Recalcular Mapa de Calor" en el Paso 3 para actualizar.', 'warning', 3500);
      } else if (typeof showStatus === 'function') {
        showStatus('<i data-lucide="alert-triangle" class="icon-sm"></i> ' + (reason ? reason.toUpperCase() + ': ' : '') + 'ANÁLISIS SOLAR DESACTUALIZADO', 2500);
      }
    }

    // 6. Si estaba en modo heatmap, forzar un refresco visual para volver al tinte normal de strings
    if (wasHeatmapMode && typeof wpFastRenderSimulatedPanels === 'function') {
      wpFastRenderSimulatedPanels();
    }

    if (typeof wpUpdateStep3DirtyAlert === 'function') {
      wpUpdateStep3DirtyAlert(reason);
    }
    if (typeof wpUpdateShadedCleanupUI === 'function') {
      wpUpdateShadedCleanupUI();
    }
  };

  window.computeAnnualSolarHeatmap = computeAnnualSolarHeatmap;

  // ── 6. ESTRATEGIA COMERCIAL, LIMPIEZA DE SOMBRAS & ALERTAS ──────────────────

  /**
   * Actualiza el banner de alerta de cálculo de sombras desactualizado
   */
  function wpUpdateStep3DirtyAlert(reason) {
    const alertEl = document.getElementById('step3-heatmap-dirty-alert');
    if (!alertEl) return;
    const isDirty = !!(window.solarSimState && window.solarSimState.annualHeatmapDirty);
    if (isDirty) {
      alertEl.style.display = 'block';
      const reasonBadge = document.getElementById('step3-dirty-reason-badge');
      if (reasonBadge) {
        if (reason) reasonBadge.textContent = reason;
        else if (window.solarSimState && window.solarSimState._lastInvalReason) reasonBadge.textContent = window.solarSimState._lastInvalReason;
        else reasonBadge.textContent = 'Cubierta modificada';
      }
    } else {
      alertEl.style.display = 'none';
    }
    if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
  }
  window.wpUpdateStep3DirtyAlert = wpUpdateStep3DirtyAlert;

  /**
   * Conmuta la estrategia comercial entre Camino A (Ahorro Justo) y Camino B (Tejado Completo)
   */
  function wpSelectCommercialPath(pathKey) {
    if (!window.solarProjectConfig) window.solarProjectConfig = {};

    const prevObj = window.solarProjectConfig.selectedObjective;
    const targetObj = (pathKey === 'just_saving') ? 'target_kwh' : 'max_roof';

    if (pathKey === 'just_saving') {
      const billAuditorState = (typeof window.RABillAuditor !== 'undefined' && window.RABillAuditor.getState) ? window.RABillAuditor.getState() : null;
      const hasBill = !!(billAuditorState && billAuditorState.currentBill);
      const hasTargetKwp = !!(window.solarProjectConfig.targetKwp && window.solarProjectConfig.targetKwp > 0);

      // Si no hay factura ni meta de potencia, abrir el auditor modal para guiar al usuario
      if (!hasBill && !hasTargetKwp && typeof window.openBillAuditorModal === 'function') {
        window.openBillAuditorModal();
      }
    }

    // Sincronizar radio buttons del formulario técnico
    const radios = document.getElementsByName('project_objective');
    for (let r of radios) {
      r.checked = (r.value === targetObj);
    }

    if (prevObj !== targetObj) {
      if (typeof step4UpdateObjective === 'function') {
        step4UpdateObjective();
      } else {
        window.solarProjectConfig.selectedObjective = targetObj;
        if (typeof wpFastRenderSimulatedPanels === 'function') wpFastRenderSimulatedPanels();
        if (typeof recalculateSolarYield === 'function') recalculateSolarYield();
      }
    } else {
      // Si ya era el mismo objetivo pero se volvió a pulsar (o se actualizó la factura), forzar refresco
      if (typeof roofPanelsCache !== 'undefined' && roofPanelsCache) {
        roofPanelsCache.sig = "";
        roofPanelsCache.data = null;
      }
      if (typeof wpFastRenderSimulatedPanels === 'function') {
        wpFastRenderSimulatedPanels();
      }
      if (typeof recalculateSolarYield === 'function') {
        recalculateSolarYield();
      }
    }

    wpUpdateCommercialPathsUI();
  }
  window.wpSelectCommercialPath = wpSelectCommercialPath;

  /**
   * Refresca la apariencia y valores de las tarjetas de los dos caminos comerciales
   */
  function wpUpdateCommercialPathsUI() {
    const cardJustSaving = document.getElementById('path-card-just-saving');
    const cardMaxProd = document.getElementById('path-card-max-prod');
    const badgeJustSaving = document.getElementById('badge-path-just-saving');
    const badgeMaxProd = document.getElementById('badge-path-max-prod');
    const valJustSaving = document.getElementById('path-val-just-saving');
    const valMaxProd = document.getElementById('path-val-max-prod');

    const curObj = (window.solarProjectConfig && window.solarProjectConfig.selectedObjective) || 'optimal_inv';
    const isJustSaving = (curObj === 'target_kwh');
    const isMaxProd = (curObj === 'max_roof');

    if (cardJustSaving) {
      if (isJustSaving) {
        cardJustSaving.style.borderColor = '#c084fc';
        cardJustSaving.style.background = 'rgba(168,85,247,0.18)';
        cardJustSaving.style.boxShadow = '0 0 12px rgba(168,85,247,0.3)';
        if (badgeJustSaving) {
          badgeJustSaving.style.display = 'inline-block';
          badgeJustSaving.textContent = 'ACTIVO';
        }
      } else {
        cardJustSaving.style.borderColor = 'rgba(168,85,247,0.3)';
        cardJustSaving.style.background = 'rgba(168,85,247,0.05)';
        cardJustSaving.style.boxShadow = 'none';
        if (badgeJustSaving) badgeJustSaving.style.display = 'none';
      }
    }

    if (cardMaxProd) {
      if (isMaxProd) {
        cardMaxProd.style.borderColor = '#38BDF8';
        cardMaxProd.style.background = 'rgba(56,189,248,0.18)';
        cardMaxProd.style.boxShadow = '0 0 12px rgba(56,189,248,0.3)';
        if (badgeMaxProd) {
          badgeMaxProd.style.display = 'inline-block';
          badgeMaxProd.textContent = 'ACTIVO';
        }
      } else {
        cardMaxProd.style.borderColor = 'rgba(56,189,248,0.3)';
        cardMaxProd.style.background = 'rgba(56,189,248,0.05)';
        cardMaxProd.style.boxShadow = 'none';
        if (badgeMaxProd) badgeMaxProd.style.display = 'none';
      }
    }

    const modWp = (typeof panelConfig !== 'undefined' && panelConfig.potencia) ? panelConfig.potencia : 450;

    // Valores dinámicos Camino A: Ahorro Justo
    if (valJustSaving) {
      const billAuditorState = (typeof window.RABillAuditor !== 'undefined' && window.RABillAuditor.getState) ? window.RABillAuditor.getState() : null;
      const comp = billAuditorState && billAuditorState.comparison;
      const hasBill = !!(comp && comp.consumoAnualKWh);
      const targetKwp = (window.solarProjectConfig && window.solarProjectConfig.targetKwp) || (hasBill ? (comp.consumoAnualKWh / 1450) : 0);

      if (hasBill || targetKwp > 0) {
        const demandKwh = hasBill ? Math.round(comp.consumoAnualKWh) : Math.round(targetKwp * 1450);
        const reqModules = Math.max(1, Math.round((targetKwp * 1000) / modWp));
        const realTargetKwp = (reqModules * modWp) / 1000;
        valJustSaving.innerHTML = `${demandKwh.toLocaleString()} kWh/año <span style="font-size: 10px;color:#c084fc;font-weight:normal;">(${reqModules} mods · ${realTargetKwp.toFixed(2)} kWp)</span>`;
      } else {
        valJustSaving.innerHTML = '<span style="color:#d8b4fe;">Sin factura (importar)</span>';
      }
    }

    // Valores dinámicos Camino B: Tejado Completo
    if (valMaxProd) {
      let totalMaxModules = 0;
      if (window.WP && Array.isArray(window.WP.polylines) && window.WP.polylines.length > 0) {
        window.WP.polylines.forEach(pl => {
          if (pl && pl.roofInfo && Array.isArray(pl.roofInfo.panels)) {
            totalMaxModules += pl.roofInfo.panels.length;
          } else if (pl && Array.isArray(pl.panels)) {
            totalMaxModules += pl.panels.length;
          }
        });
      }
      if (totalMaxModules === 0 && Array.isArray(window.allRenderedPanels) && window.allRenderedPanels.length > 0) {
        totalMaxModules = window.allRenderedPanels.length;
      }

      if (totalMaxModules > 0) {
        const fullKwp = (totalMaxModules * modWp) / 1000;
        const estKwh = Math.round(fullKwp * 1450);
        valMaxProd.innerHTML = `${fullKwp.toFixed(2)} kWp <span style="font-size: 10px;color:#7dd3fc;font-weight:normal;">(${totalMaxModules} mods · ${estKwh.toLocaleString()} kWh)</span>`;
      } else {
        valMaxProd.textContent = '-- kWp';
      }
    }
    // Actualizar Banner Interactivo de Comunidad Energética Local (CEL · RDL 7/2026)
    const celBanner = document.getElementById('cel-opportunity-banner');
    if (celBanner) {
      let ghostCount = 0;
      let activeCount = 0;
      if (Array.isArray(window.allRenderedPanels)) {
        window.allRenderedPanels.forEach(p => {
          if (!p || p.deleted) return;
          if (p.isGhost) ghostCount++;
          else activeCount++;
        });
      }

      if (isJustSaving && ghostCount > 0) {
        celBanner.style.display = 'block';
        const ghostKwp = ((ghostCount * modWp) / 1000).toFixed(2);
        const ghostGenKwh = Math.round(ghostKwp * 1450);
        const ghostCelEur = Math.round(ghostGenKwh * (0.11 - 0.05)); // Margen neto CEL vs pool

        const countEl = document.getElementById('cel-banner-ghost-count');
        const kwpEl = document.getElementById('cel-banner-ghost-kwp');
        const eurEl = document.getElementById('cel-banner-ghost-eur');
        if (countEl) countEl.textContent = ghostCount;
        if (kwpEl) kwpEl.textContent = ghostKwp + ' kWp';
        if (eurEl) eurEl.textContent = '+' + ghostCelEur.toLocaleString('es-ES') + ' €/año';
      } else {
        celBanner.style.display = 'none';
      }
    }

    if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
  }
  window.wpUpdateCommercialPathsUI = wpUpdateCommercialPathsUI;

  /**
   * Filtra los módulos de un faldón de acuerdo con el objetivo del proyecto (target_kwh, optimal_inv, zero_shades, max_roof).
   * Para target_kwh y optimal_inv con múltiples faldones, realiza una distribución global equitativa y ordenada por menor sombra.
   */
  function wpFilterPanelsForPolyline(poly, polyIdx, polylinesList, obj, options = {}) {
    const polyPanels = options.polyPanels || (poly && poly.roofInfo && poly.roofInfo.panels) || [];
    if (!Array.isArray(polyPanels) || polyPanels.length === 0) return [];

    if (obj === 'max_roof') {
      return [...polyPanels];
    }

    if (obj === 'zero_shades') {
      return polyPanels.filter(p => !p.isShaded && (!p.annualLossPct || p.annualLossPct <= 5.0));
    }

    const modWp = options.modWp || ((typeof panelConfig !== 'undefined' && panelConfig.potencia) ? panelConfig.potencia : 450);
    const targetKwp = options.targetKwp || ((window.solarProjectConfig && window.solarProjectConfig.targetKwp) || 5.0);
    const maxTotalModules = options.maxTotalModules;
    const isAnalyzingSolar = !!options.isAnalyzingSolar;

    const isAutoSizingInverters = !(window.solarProjectConfig && window.solarProjectConfig.autoSizing && window.solarProjectConfig.autoSizing.inverters && window.solarProjectConfig.autoSizing.inverters.isManual);
    let limitModules = Infinity;
    if (obj === 'target_kwh') {
      const rawModules = Math.max(1, Math.round((targetKwp * 1000) / modWp));
      const limits = (window.solarProjectConfig && window.solarProjectConfig.calculatedLimits) || {};
      const nsMin = limits.nMinString || 6;
      const nsMax = limits.nMaxString || 18;
      const invCount = (window.solarProjectConfig && window.solarProjectConfig.autoSizing && window.solarProjectConfig.autoSizing.inverters && window.solarProjectConfig.autoSizing.inverters.count) || 1;
      const mpptCount = (limits.inverter && limits.inverter.mppt ? limits.inverter.mppt : 2) * invCount;
      const maxStrings = mpptCount * (limits.inverter && limits.inverter.inputsPerMppt ? limits.inverter.inputsPerMppt : 1);
      
      const snapHelper = (typeof getNearestValidStringModuleCount === 'function')
        ? getNearestValidStringModuleCount
        : ((typeof window !== 'undefined' && window.RA && window.RA.Electrical && window.RA.Electrical.getNearestValidStringModuleCount) || null);
      limitModules = (typeof snapHelper === 'function')
        ? snapHelper(rawModules, nsMin, nsMax, maxStrings)
        : rawModules;
    } else if (obj === 'optimal_inv' && Number.isFinite(maxTotalModules) && maxTotalModules > 0 && !isAnalyzingSolar && !isAutoSizingInverters) {
      limitModules = maxTotalModules;
    }

    if (!Number.isFinite(limitModules) || limitModules <= 0) {
      return [...polyPanels];
    }

    // [FORCED-PANELS] Identificadores de módulos forzados por el usuario
    const forcedList = (window.solarProjectConfig && Array.isArray(window.solarProjectConfig.forcedPanelIds)) ? window.solarProjectConfig.forcedPanelIds : [];
    const forcedSet = new Set(forcedList);

    // Caso A: Único faldón
    const listLen = Array.isArray(polylinesList) ? polylinesList.length : 1;
    if (listLen <= 1) {
      if (polyPanels.length > limitModules) {
        const sorted = [...polyPanels].sort((a, b) => {
          const aForced = forcedSet.has(a.panelId) ? 1 : 0;
          const bForced = forcedSet.has(b.panelId) ? 1 : 0;
          if (aForced !== bForced) return bForced - aForced; // Forzados van primero
          return (a.annualLossPct || 0) - (b.annualLossPct || 0);
        });
        const activeSlice = sorted.slice(0, limitModules);
        const activeIds = new Set(activeSlice.map(p => p.panelId));
        return polyPanels.map(p => {
          if (!activeIds.has(p.panelId)) {
            p.isGhost = true;
          } else {
            delete p.isGhost;
          }
          return p;
        });
      }
      polyPanels.forEach(p => { delete p.isGhost; });
      return [...polyPanels];
    }

    // Caso B: Múltiples faldones — Selección global coordinada equitativa (sin inanición de faldones)
    if (polyIdx === 0 || !window._raGlobalObjectiveSelectedIds) {
      const candidatesByPoly = new Map();
      let totalAllCandidates = 0;
      polylinesList.forEach((pl, plIdx) => {
        let pList = (pl && pl.roofInfo && Array.isArray(pl.roofInfo.panels)) ? pl.roofInfo.panels : (pl && Array.isArray(pl.panels) ? pl.panels : []);
        if (pList.length === 0 && pl && Array.isArray(pl.points) && pl.points.length >= 3 && typeof computeSinglePolylineRoofInfo === 'function') {
          try {
            const fresh = computeSinglePolylineRoofInfo(pl.points, pl);
            if (fresh && Array.isArray(fresh.panels)) {
              pl.roofInfo = fresh;
              pList = fresh.panels;
            }
          } catch(ePl) {}
        }
        const polyCand = [];
        pList.forEach((p, pIdx) => {
          if (!p.deleted) {
            polyCand.push({ p, plIdx, panelId: p.panelId || ('pan_' + plIdx + '_' + (p.layoutIndex ?? p.localIdx ?? pIdx)) });
          }
        });
        candidatesByPoly.set(plIdx, polyCand);
        totalAllCandidates += polyCand.length;
      });

      if (totalAllCandidates > limitModules) {
        // Asignación equitativa y proporcional por faldón: NUNCA dejar un faldón activo a 0
        const selectedIds = new Set();
        let remainingQuota = limitModules;

        // Paso 1: Asegurar cuota proporcional según capacidad geométrica de cada faldón
        const activePolys = Array.from(candidatesByPoly.keys()).filter(k => candidatesByPoly.get(k).length > 0);
        
        activePolys.forEach(k => {
          const cands = candidatesByPoly.get(k);
          const faldonShare = Math.round(limitModules * (cands.length / totalAllCandidates));
          const minPerPoly = Math.max(1, Math.min(cands.length, faldonShare));
          cands.sort((a, b) => (a.p.annualLossPct || 0) - (b.p.annualLossPct || 0) || (b.p.annualKwh || 0) - (a.p.annualKwh || 0));
          const baseTake = Math.min(cands.length, minPerPoly);
          for (let i = 0; i < baseTake && remainingQuota > 0; i++) {
            selectedIds.add(cands[i].panelId);
            cands[i]._allocated = true;
            remainingQuota--;
          }
        });

        // Paso 2: Repartir el remanente globalmente según menor sombra / mayor producción
        if (remainingQuota > 0) {
          const leftover = [];
          candidatesByPoly.forEach(cands => {
            cands.forEach(c => { if (!c._allocated) leftover.push(c); });
          });
          leftover.sort((a, b) => (a.p.annualLossPct || 0) - (b.p.annualLossPct || 0) || (b.p.annualKwh || 0) - (a.p.annualKwh || 0));
          for (let i = 0; i < leftover.length && remainingQuota > 0; i++) {
            selectedIds.add(leftover[i].panelId);
            remainingQuota--;
          }
        }
        window._raGlobalObjectiveSelectedIds = selectedIds;
      } else {
        const allIds = new Set();
        candidatesByPoly.forEach(cands => cands.forEach(c => allIds.add(c.panelId)));
        window._raGlobalObjectiveSelectedIds = allIds;
      }
    }

    const selectedSet = window._raGlobalObjectiveSelectedIds;
    let filtered = polyPanels;
    if (selectedSet) {
      filtered = polyPanels.map((p, pIdx) => {
        const id = p.panelId || ('pan_' + polyIdx + '_' + (p.layoutIndex ?? p.localIdx ?? pIdx));
        if (forcedSet && forcedSet.has(id)) {
          delete p.isGhost;
        } else if (!selectedSet.has(id)) {
          p.isGhost = true;
        } else {
          delete p.isGhost;
        }
        return p;
      });
    } else {
      polyPanels.forEach(p => { delete p.isGhost; });
    }

    // Limpieza al terminar el último faldón
    if (polyIdx === listLen - 1) {
      delete window._raGlobalObjectiveSelectedIds;
    }

    return filtered;
  }
  window.wpFilterPanelsForPolyline = wpFilterPanelsForPolyline;

  /**
   * Obtiene la lista de paneles con pérdida crítica por sombra (≥ 15% o inviables)
   */
  function wpGetCriticalShadedPanels() {
    const critical = [];
    if (window.WP && Array.isArray(window.WP.polylines)) {
      window.WP.polylines.forEach((poly, polyIdx) => {
        if (poly && poly.roofInfo && Array.isArray(poly.roofInfo.panels)) {
          poly.roofInfo.panels.forEach((p, pIdx) => {
            if (!p.deleted && (p.isUnviable || (typeof p.annualLossPct === 'number' && p.annualLossPct >= 15.0))) {
              critical.push({ poly, polyIdx, panel: p, panelIdx: pIdx });
            }
          });
        }
      });
    }
    return critical;
  }
  window.wpGetCriticalShadedPanels = wpGetCriticalShadedPanels;

  /**
   * Actualiza el badge y visibilidad del limpiador de paneles sombreados
   */
  function wpUpdateShadedCleanupUI() {
    const box = document.getElementById('step3-shade-cleanup-box');
    const badge = document.getElementById('step3-shaded-count-badge');
    if (!box) return;

    // Solo se evalúa si hay simulación de sombras ejecutada
    const hasSim = !!(window.solarSimState && window.solarSimState.annualHeatmapData && !window.solarSimState.annualHeatmapDirty);
    if (!hasSim) {
      box.style.display = 'none';
      return;
    }

    const critical = wpGetCriticalShadedPanels();
    if (critical.length > 0) {
      box.style.display = 'block';
      if (badge) badge.textContent = critical.length + (critical.length === 1 ? ' PANEL' : ' PANELES');
    } else {
      box.style.display = 'none';
    }
    if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
  }
  window.wpUpdateShadedCleanupUI = wpUpdateShadedCleanupUI;

  /**
   * Retira de la cubierta todos los paneles con sombra crítica (≥ 15%) en 1 clic
   */
  async function wpCleanCriticalShadedPanels() {
    const critical = wpGetCriticalShadedPanels();
    if (critical.length === 0) {
      if (typeof showToast === 'function') {
        showToast('SOMBRAS ÓPTIMAS', 'No hay ningún panel con pérdidas críticas por sombra (≥15%).', 'success', 3000);
      }
      return;
    }

    const count = critical.length;
    // Registrar exclusiones persistentes en cada faldón
    critical.forEach(item => {
      const poly = item.poly;
      const p = item.panel;
      p.deleted = true;
      if (p.rawPanel) p.rawPanel.deleted = true;

      if (poly) {
        if (!Array.isArray(poly.deletedPanels)) poly.deletedPanels = [];
        poly.deletedPanels.push({
          u: (typeof p.u === 'number') ? p.u : (p.rawPanel && p.rawPanel.u),
          v: (typeof p.v === 'number') ? p.v : (p.rawPanel && p.rawPanel.v),
          center: p.center ? Cesium.Cartesian3.clone(p.center) : null
        });
        if (poly.roofInfo && Array.isArray(poly.roofInfo.panels)) {
          poly.roofInfo.panels = poly.roofInfo.panels.filter(x => x !== p && !x.deleted);
        }
      }
    });

    // Limpiar de allRenderedPanels
    if (Array.isArray(window.allRenderedPanels)) {
      window.allRenderedPanels = window.allRenderedPanels.filter(p => !p.deleted);
    }

    // Re-renderizado de paneles e invalidación SSOT
    if (typeof window.wpInvalidateHeatmap === 'function') {
      window.wpInvalidateHeatmap('Poda de paneles sombreados');
    }
    if (typeof wpFastRenderSimulatedPanels === 'function') {
      await wpFastRenderSimulatedPanels();
    }
    if (typeof recalculateSolarYield === 'function') {
      recalculateSolarYield();
    }
    if (typeof wpUpdateStep3UI === 'function') {
      wpUpdateStep3UI();
    }

    wpUpdateShadedCleanupUI();
    wpUpdateCommercialPathsUI();

    if (typeof showToast === 'function') {
      showToast('CUBIERTA OPTIMIZADA', 'Se han retirado ' + count + (count === 1 ? ' panel sombreado' : ' paneles sombreados') + ' para maximizar la producción neta.', 'success', 4000);
    }
  }
  window.wpCleanCriticalShadedPanels = wpCleanCriticalShadedPanels;
  window.applyWorkerHeatmapResults = applyWorkerHeatmapResults;

  if (!window.RA) window.RA = {};
  window.RA.solarHeatmap = {
    update: wpUpdatePanelShadingAndMLPE,
    evaluateMLPE: wpEvaluateMLPENecessity,
    computeHeatmap: computeAnnualSolarHeatmap,
    applyWorkerHeatmapResults: applyWorkerHeatmapResults,
    invalidate: window.wpInvalidateHeatmap,
    updateDirtyAlert: wpUpdateStep3DirtyAlert,
    selectCommercialPath: wpSelectCommercialPath,
    updateCommercialPathsUI: wpUpdateCommercialPathsUI,
    getCriticalShadedPanels: wpGetCriticalShadedPanels,
    updateShadedCleanupUI: wpUpdateShadedCleanupUI,
    cleanCriticalShadedPanels: wpCleanCriticalShadedPanels,
    filterPanelsForPolyline: wpFilterPanelsForPolyline
  };

  window.raShadowSimConfig = window.raShadowSimConfig || {
    includeObstacles: true,
    includeBuildings: true,
    includeInterRow: true,
    shadowWeightPct: 100
  };
  window.raUpdateShadowSimConfig = function() {
    const cObs = document.getElementById('sim-cfg-obstacles');
    const cBld = document.getElementById('sim-cfg-buildings');
    const cRow = document.getElementById('sim-cfg-interrow');
    const rWgt = document.getElementById('sim-cfg-shadow-weight');
    window.raShadowSimConfig = {
      includeObstacles: cObs ? !!cObs.checked : true,
      includeBuildings: cBld ? !!cBld.checked : true,
      includeInterRow: cRow ? !!cRow.checked : true,
      shadowWeightPct: rWgt ? Math.max(0, Math.min(100, Number(rWgt.value) || 0)) : 100
    };
    if (typeof window.wpInvalidateHeatmap === 'function') {
      window.wpInvalidateHeatmap('Parámetros manuales de sombras actualizados');
    }
  };

})();
