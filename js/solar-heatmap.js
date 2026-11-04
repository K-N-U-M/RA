
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

      const cleanup = (res) => {
        modal.style.display = 'none';
        activeModule.isBifacial = res.isBifacial;
        activeModule.bifacialityFactor = res.bifacialityFactor;
        resolve(res);
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
          mastHeight: hubH + rotorR,
          h: hubH + rotorR,
          w: 1.5,
          l: 1.5,
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

    // En cubiertas coplanares o marquesinas continuas (tejadillo corrido sin desnivel entre filas),
    // si no hay desnivel geométrico en vértices 3D, no hay autosombreado inter-filas
    const hasPergolaTilt = (structType === 'pergola' && typeof pInfo.moduleTiltDeg === 'number' && pInfo.moduleTiltDeg > 2);
    if ((pInfo.coplanar || isContinuousPergola) && !hasPergolaTilt) return [];

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

    if (!curSimState.panelShadowOverlayPool) {
      curSimState.panelShadowOverlayPool = new Map();
    } else if (curSimState.panelShadowOverlayPool.size > 0) {
      curSimState.panelShadowOverlayPool.forEach(ent => {
        try { viewer.entities.remove(ent); } catch(e) {}
      });
      curSimState.panelShadowOverlayPool.clear();
    }
    const overlayPool = curSimState.panelShadowOverlayPool;
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

      let normWorld = new Cesium.Cartesian3();
      if (norm && Cesium.Cartesian3.magnitude(norm) > 0.5) {
        normWorld = Cesium.Cartesian3.clone(norm);
      } else if (transform && norm) {
        if (typeof Cesium.Matrix4.multiplyByPointAsVector === "function") {
          normWorld = Cesium.Matrix4.multiplyByPointAsVector(transform, norm, normWorld);
        } else if (typeof Cesium.Matrix4.multiplyByPoint === "function") {
          normWorld = Cesium.Matrix4.multiplyByPoint(transform, norm, normWorld);
        }
        Cesium.Cartesian3.normalize(normWorld, normWorld);
      } else {
        normWorld = new Cesium.Cartesian3(0, 0, 1);
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
            // Evitar que el panel se auto-sombre con su propia sombra arrojada
            if (quad.sourcePanelIdx !== undefined) {
              if (quad.sourcePanelIdx === myIndex) continue;
              if (typeof quad.sourceU === 'number' && typeof quad.sourceV === 'number' && typeof pData.u === 'number' && typeof pData.v === 'number') {
                if (Math.abs(quad.sourceU - pData.u) < 0.05 && Math.abs(quad.sourceV - pData.v) < 0.05) continue;
                // Si ambos módulos pertenecen a la misma fila física (misma cota V dentro del 40% del panel)
                if (Math.abs(quad.sourceV - pData.v) < panelH * 0.40) continue;
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
          } else if (!poly.ignore3DTilesShadows && !(pInfo && pInfo.ignore3DTilesShadows) && typeof isPanelOccludedBy3DEnvironment === "function" && isPanelOccludedBy3DEnvironment(pData.center, effPanelNorm, sunDirWorld)) {
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
            const badgePos = Cesium.Cartesian3.add(
              pData.center,
              Cesium.Cartesian3.multiplyByScalar(norm, 0.40, new Cesium.Cartesian3()),
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
  let _activeSimGenerationId = 0;

  /**
   * Ejecuta el cálculo masivo de 192 instantes en un Web Worker off-thread.
   * Evita congelar el render loop de CesiumJS (preserva 60 FPS estables).
   */
  function runHeatmapInDedicatedWorker(cfg, onProgressCallback, progressBar, progressFill, totalPanelsCount) {
    return new Promise((resolve, reject) => {
      let worker;
      try {
        worker = new Worker('js/solar-worker.js?v=20261104a');
      } catch (err) {
        return reject(err);
      }

      const panels = [];
      const faldones = [];

      cfg.polylines.forEach((poly, polyIdx) => {
        const pInfo = poly.roofInfo || {};
        const uVec = pInfo.uVec ? { x: pInfo.uVec.x, y: pInfo.uVec.y, z: pInfo.uVec.z } : { x: 1, y: 0, z: 0 };
        const vVec = pInfo.vVec ? { x: pInfo.vVec.x, y: pInfo.vVec.y, z: pInfo.vVec.z } : { x: 0, y: 1, z: 0 };
        const norm = pInfo.normal ? { x: pInfo.normal.x, y: pInfo.normal.y, z: pInfo.normal.z } : { x: 0, y: 0, z: 1 };

        const obstacles2D = [];
        const obsList = (typeof obstacles !== 'undefined' && Array.isArray(obstacles))
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
            let cart = null;
            if (t.cartesian) cart = t.cartesian;
            else if (t.positionCartographic && typeof Cesium !== 'undefined' && Cesium.Cartesian3) {
              try {
                cart = Cesium.Cartesian3.fromRadians(t.positionCartographic.longitudeRad, t.positionCartographic.latitudeRad, t.positionCartographic.altitudeM || 0);
              } catch (eC) {}
            }
            obsList.push({
              id: t.id,
              type: 'wind_turbine',
              name: t.name || 'Aerogenerador',
              mastHeight: hubH + rotorR,
              h: hubH + rotorR,
              w: 1.5,
              l: 1.5,
              cartesian: cart,
              positionCartographic: t.positionCartographic,
              isTurbine: true
            });
          });
        }
        if (obsList && obsList.length > 0) {
          obsList.forEach(obs => {
            if (!obs || obs.deleted) return;
            const pts = (typeof getObstaclePolygon2DForRoof === 'function')
              ? getObstaclePolygon2DForRoof(obs, 0.0, pInfo)
              : ((obs.points2D && obs.points2D[polyIdx]) || obs.poly2D);
            if (pts && pts.length >= 3) {
              obstacles2D.push({
                height: (typeof obs.h === 'number' ? obs.h : (obs.height || 1.2)),
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
        const hasPergolaTilt = (structType === 'pergola' && typeof pInfo.moduleTiltDeg === 'number' && pInfo.moduleTiltDeg > 2);
        if ((!pInfo.coplanar && !isContinuousPergola || hasPergolaTilt) && pList.length >= 2) {
          let hModGlobal = 0;
          if (typeof pInfo.moduleTiltDeg === 'number' && pInfo.moduleTiltDeg > 5) {
            const deltaTilt = Math.max(0, pInfo.moduleTiltDeg - (pInfo.tiltDeg || 0));
            hModGlobal = (pList[0].h || 2.10) * Math.sin(deltaTilt * Math.PI / 180);
          } else if (pInfo.structureType && (pInfo.structureType.includes('triangle') || pInfo.structureType.includes('east_west'))) {
            hModGlobal = (pList[0].h || 2.10) * Math.sin(15 * Math.PI / 180);
          }
          if (hModGlobal >= 0.04) {
            pList.forEach((p, pIdx) => {
              const halfW = (p.w || 1.05) / 2;
              const halfH = (p.h || 2.10) / 2;
              const myLayoutIdx = (p.layoutIndex !== undefined) ? p.layoutIndex : pIdx;
              interRowEdges.push({
                u1: p.u - halfW, v1: p.v + halfH,
                u2: p.u + halfW, v2: p.v + halfH,
                effHMod: hModGlobal,
                sourceIdx: myLayoutIdx,
                sourceU: p.u,
                sourceV: p.v
              });
            });
          }
        }

        faldones.push({
          polyIdx,
          uVec,
          vVec,
          normalWorld: norm,
          ignore3DTilesShadows: !!(poly.ignore3DTilesShadows || (pInfo && pInfo.ignore3DTilesShadows)),
          obstacles2D,
          interRowEdges
        });

        pList.forEach((p, idx) => {
          const pId = p.panelId || p.id || ('panel_' + polyIdx + '_' + idx);
          const u = typeof p.u === 'number' ? p.u : 0;
          const v = typeof p.v === 'number' ? p.v : 0;
          const w = p.w || 1.05;
          const h = p.h || 2.15;
          const halfW = w / 2;
          const halfH = h / 2;
          const poly2D = (p.poly2D && p.poly2D.length >= 3)
            ? p.poly2D.map(pt => ({ u: pt.u, v: pt.v }))
            : [
                { u: u - halfW, v: v - halfH },
                { u: u + halfW, v: v - halfH },
                { u: u + halfW, v: v + halfH },
                { u: u - halfW, v: v + halfH }
              ];

          const tiltVal = p.tiltDeg !== undefined ? p.tiltDeg : (pInfo.moduleTiltDeg !== undefined ? pInfo.moduleTiltDeg : (pInfo.tiltDeg || 20));
          const azVal = p.azimuthDeg !== undefined ? (180 - p.azimuthDeg) : (p.azDeg !== undefined ? p.azDeg : (pInfo.moduleAzimuthDeg !== undefined ? (180 - pInfo.moduleAzimuthDeg) : (pInfo.azDeg || 180)));
          const tiltR = (tiltVal * Math.PI) / 180;
          const azR = (azVal * Math.PI) / 180;
          const normalENU = {
            x: Math.sin(tiltR) * Math.sin(azR),
            y: Math.sin(tiltR) * Math.cos(azR),
            z: Math.cos(tiltR)
          };

          const pNormWorld = (typeof getPanelNormalWorld === 'function')
            ? getPanelNormalWorld(p, norm, pInfo.transform)
            : norm;

          panels.push({
            id: pId,
            polyIdx,
            layoutIndex: p.layoutIndex !== undefined ? p.layoutIndex : idx,
            u: u,
            v: v,
            h: h,
            w: w,
            areaM2: p.areaM2 || (w * h),
            tiltDeg: tiltVal,
            azDeg: azVal,
            hasOptimizer: !!(p.hasOptimizer || p.optimizerModelId),
            poly2D: poly2D,
            normalWorld: pNormWorld,
            normalENU: normalENU
          });
        });
      });

      worker.onmessage = function(e) {
        const msg = e.data;
        if (!msg) return;

        if (msg.type === 'PROGRESS') {
          if (typeof updateSolarCalcHUD === 'function') {
            updateSolarCalcHUD(msg.progressPct, msg.mIdx, totalPanelsCount);
          }
          if (progressFill) progressFill.style.width = msg.progressPct + '%';
          if (typeof onProgressCallback === 'function') {
            onProgressCallback(msg.progressPct, msg.mIdx, totalPanelsCount);
          }
        } else if (msg.type === 'DONE') {
          worker.terminate();
          resolve(msg);
        }
      };

      worker.onerror = function(err) {
        worker.terminate();
        reject(err);
      };

      worker.postMessage({
        type: 'START_HEATMAP',
        simGenerationId: cfg.simGenerationId,
        lat: cfg.lat,
        lng: cfg.lng,
        resolution: cfg.resolution,
        panels,
        faldones,
        climaticZone: cfg.climaticZone,
        moduleProps: cfg.moduleProps,
        monthlyGHI: cfg.monthlyGHI
      });
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
          p.heatmapColor = (typeof getHeatmapColor === 'function')
            ? getHeatmapColor(res.annualLossPct || 0)
            : { hex: '#10b981' };
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
      }
      if (livePanels) {
        const matchingLive = livePanels.filter(lp => lp && (lp.polyIdx === polyIdx || (!lp.polyIdx && polyIdx === 0)));
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
    try {
      if (typeof showSolarCalcHUD === 'function') {
        showSolarCalcHUD('Simulación Térmico-Astronómica', 'Escaneando radiación directa, difusa y sombras...');
      }
    const progressBar = document.getElementById('heatmap-progress-bar');
    const progressFill = document.getElementById('heatmap-progress-fill');
    const diagText = document.getElementById('mlpe-diagnostic-text');
    if (progressBar) progressBar.style.display = 'block';
    if (progressFill) progressFill.style.width = '0%';
    if (diagText) {
      diagText.textContent = "Calculando modelo astronómico (192 instantes nominales, 6:00-21:00; sol ≥ 10°)...";
      diagText.style.color = "var(--sky-400)";
    }

    // 3. Inicializar acumuladores de energía por panel
    let totalPanelsCount = 0;
    polylines.forEach(poly => {
      const panels = Array.isArray(poly.panels) ? poly.panels : (poly.roofInfo && Array.isArray(poly.roofInfo.panels) ? poly.roofInfo.panels : []);
      totalPanelsCount += panels.length;
      panels.forEach(p => {
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

    // 4. Parámetros geográficos y temporales
    let monthsDoy = [15, 45, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349];
    let monthDaysW = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let hours = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];

    if (window.raHeatmapResolution === 'medium') {
      monthsDoy = [15, 74, 135, 196, 258, 319];
      monthDaysW = [59, 61, 61, 62, 61, 61]; 
      hours = [7, 9, 11, 13, 15, 17, 19];
    } else if (window.raHeatmapResolution === 'fast') {
      monthsDoy = [45, 135, 227, 319]; 
      monthDaysW = [90, 92, 92, 91];
      hours = [8, 11, 14, 17];
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
    let currentStep = 0;
    let frameStartTime = performance.now();

    const _scratchV1 = new Cesium.Cartesian3();
    const _scratchV2 = new Cesium.Cartesian3();
    const _scratchUp = new Cesium.Cartesian3();

    function getPanelNormalWorld(pData, roofNorm, transform) {
      if (pData.corners && pData.corners.length >= 3) {
        const c0 = pData.corners[0];
        const c1 = pData.corners[1];
        const c3 = pData.corners[3];
        Cesium.Cartesian3.subtract(c1, c0, _scratchV1);
        Cesium.Cartesian3.subtract(c3, c0, _scratchV2);
        const n = Cesium.Cartesian3.cross(_scratchV1, _scratchV2, new Cesium.Cartesian3());
        if (Cesium.Cartesian3.magnitude(n) > 1e-6) {
          Cesium.Cartesian3.normalize(n, n);
          const up = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(pData.center || c0, _scratchUp);
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

    /**
     * Discretiza un cuadrilátero 2D de panel en 3 sub-cadenas (sub-strings S1, S2, S3)
     * representativas de las 3 ramas de diodos de bypass de un módulo comercial estándar / half-cut.
     * En módulos fotovoltaicos comerciales estándar (IEC 61215), los 3 diodos dividen el ancho del
     * panel en 3 columnas que recorren toda la longitud larga del módulo.
     * @param {Array<{u:number,v:number}>} quad 4 vértices del módulo
     * @returns {Array<Array<{u:number,v:number}>>} 3 sub-polígonos
     */
    function dividePanelIntoSubstrings2D(quad) {
      if (!quad || quad.length !== 4) return quad ? [quad] : [];
      const p0 = quad[0], p1 = quad[1], p2 = quad[2], p3 = quad[3];
      const d01 = Math.hypot(p1.u - p0.u, p1.v - p0.v);
      const d12 = Math.hypot(p2.u - p1.u, p2.v - p1.v);

      const lerp = (a, b, t) => ({ u: a.u + (b.u - a.u) * t, v: a.v + (b.v - a.v) * t });

      if (d12 >= d01) {
        // La dimensión larga es p1->p2 y p0->p3. Los diodos dividen la dimensión corta (p0->p1 y p3->p2)
        // generando 3 columnas longitudinales completas a lo largo de la altura del módulo.
        const a0 = p0, b0 = p3;
        const a1 = lerp(p0, p1, 1 / 3), b1 = lerp(p3, p2, 1 / 3);
        const a2 = lerp(p0, p1, 2 / 3), b2 = lerp(p3, p2, 2 / 3);
        const a3 = p1, b3 = p2;
        return [
          [a0, a1, b1, b0],
          [a1, a2, b2, b1],
          [a2, a3, b3, b2]
        ];
      } else {
        // La dimensión larga es p0->p1 y p3->p2. Los diodos dividen la dimensión corta (p0->p3 y p1->p2).
        const a0 = p0, b0 = p1;
        const a1 = lerp(p0, p3, 1 / 3), b1 = lerp(p1, p2, 1 / 3);
        const a2 = lerp(p0, p3, 2 / 3), b2 = lerp(p1, p2, 2 / 3);
        const a3 = p3, b3 = p2;
        return [
          [a0, b0, b1, a1],
          [a1, b1, b2, a2],
          [a2, b2, b3, a3]
        ];
      }
    }

    // 5. Bucle Time-Sliced con presupuesto de 15ms
    const _T_AMB_TABLE = {
      costal_med: [11.0, 12.0, 14.0, 16.0, 20.0, 25.0, 28.0, 28.5, 24.0, 19.0, 14.0, 11.0],
      costa_med:  [11.0, 12.0, 14.0, 16.0, 20.0, 25.0, 28.0, 28.5, 24.0, 19.0, 14.0, 11.0],
      interior:   [5.0,  7.0,  10.0, 12.0, 17.0, 23.0, 27.0, 27.0, 22.0, 15.0,  9.0,  5.0],
      atlantico:  [9.0,  10.0, 12.0, 13.0, 16.0, 19.0, 21.0, 21.5, 19.0, 15.0, 11.0,  9.0],
      canarias:   [18.0, 18.5, 19.0, 20.0, 21.5, 23.5, 25.0, 26.0, 25.5, 23.5, 21.0, 19.0]
    };
    const climaticZone = (typeof getClimaticZone === 'function') ? getClimaticZone(lat, lng) : 'interior';
    const noctModule = (activeModule && (activeModule.noct || activeModule.NOCT)) || 45;
    const rawGamma = (activeModule && (activeModule.tempCoeffPmax || activeModule.gammaPmp || (activeModule.tecnologia && activeModule.tecnologia.includes('N-Type') ? -0.0028 : -0.0034))) || -0.0034;
    const gammaCoeff = (Math.abs(rawGamma) > 0.05) ? rawGamma / 100.0 : rawGamma; // normaliza si viene en %/°C
    // [MEJORA 3 AAA]: Delegación al Web Worker dedicado off-thread (60 FPS puros sin micro-tirones)
    let workerHandled = false;
    if (typeof Worker !== 'undefined' && typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http')) {
      try {
        const workerResults = await runHeatmapInDedicatedWorker({
          simGenerationId,
          lat,
          lng,
          resolution: window.raHeatmapResolution || 'ultra',
          polylines,
          climaticZone,
          moduleProps: {
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

        if (workerResults && workerResults.simGenerationId === _activeSimGenerationId) {
          applyWorkerHeatmapResults(polylines, workerResults.results, workerResults.monthlyNetWh, _monthlyNetWh);
          workerHandled = true;
          if (typeof window !== 'undefined' && window.RA && window.RA.log) {
            (typeof window.RA.log.info === 'function' ? window.RA.log.info : console.log)('[SOLAR WORKER] Simulación anual completada con éxito off-thread.');
          }
        }
      } catch (errWorker) {
        console.warn('[SOLAR WORKER] Fallback al hilo principal:', errWorker);
      }
    }

    if (!workerHandled) {
      // Bucle Time-Sliced en hilo principal (Fallback garantizado)
      for (let mIdx = 0; mIdx < monthsDoy.length; mIdx++) {
      const m = monthsReal[mIdx];
      // Temperatura ambiente de diseño según zona climática y mes calendario REAL
      const tAmbMonth = (_T_AMB_TABLE[climaticZone] || _T_AMB_TABLE.interior)[m];
      const GHI_daily_Wh = (typeof getRobustMonthlyGHI === 'function')
        ? getRobustMonthlyGHI(lat, lng, m)
        : ((typeof estimateMonthlyGHI === 'function') ? estimateMonthlyGHI(lat, m) : (4600 * (1 + 0.32 * Math.sin((m - 2) * Math.PI / 6))));

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
          if (_spPre && _spPre.isDay && _spPre.elevDeg > 0.0) _sinAltSum += Math.sin(_spPre.elevDeg * Math.PI / 180);
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
            shadowLenPerM: sp.elevDeg >= 10.0 ? Math.min(1 / Math.tan(elevRad_), 5.67) : 0
          };
        } else if (typeof computeSolarPosition === 'function') {
          const dLegacy = new Date(Date.UTC(2026, m, 15, Math.floor(utcHour), Math.floor((utcHour % 1) * 60)));
          solarPos = computeSolarPosition(dLegacy, lat, lng);
        }

        const elevation = solarPos ? solarPos.elevationDeg : -90;
        // CTE DB-HE5 / IDAE: descartar horas de radiación marginal (elevación < 10.0° / Air Mass > 5.8)
        if (!solarPos || !solarPos.isDaylight || !(elevation >= 10.0)) {
          continue;
        }

        const elevRad = Cesium.Math.toRadians(elevation);
        const sinAlt = Math.sin(elevRad);

        // [C6] Insolación instantánea conservando la energía diaria real del mes (integral = GHI_daily_Wh)
        const GHI_instant = Math.max(0, (GHI_daily_Wh / (_sinAltSum * hourStepDt)) * sinAlt);
        // [B2] Desagregación Erbs vía motor único de radiación (RA.Radiation). Fallback inline si el módulo no está.
        let G_dhi, G_dni;
        // [AUD-2026 · D-04] Día del año para corregir la excentricidad orbital en Erbs.
        const _doyHeat = (typeof monthsDoy !== 'undefined' && monthsDoy[mIdx]) ? monthsDoy[mIdx] : 180;
        if (typeof window !== 'undefined' && window.RA && window.RA.Radiation && typeof window.RA.Radiation.decomposeErbs === 'function') {
          const _dec = window.RA.Radiation.decomposeErbs(GHI_instant, elevation, _doyHeat);
          G_dhi = _dec.dhi;
          G_dni = _dec.dni;
        } else {
          const _kt = Math.min(0.85, Math.max(0.1, GHI_instant / (1367 * sinAlt + 1e-3)));
          let DHI_fraction;
          if (_kt < 0.22) DHI_fraction = 1.0 - 0.09 * _kt;
          else if (_kt < 0.80) DHI_fraction = 0.9511 - 0.1604 * _kt + 4.388 * _kt * _kt - 16.638 * Math.pow(_kt, 3) + 12.336 * Math.pow(_kt, 4);
          else DHI_fraction = 0.165;
          G_dhi = GHI_instant * DHI_fraction;
          G_dni = Math.max(0, (GHI_instant - G_dhi) / Math.max(sinAlt, 0.05));
        }

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

          const polyShadowQuads2D = [];
          const activeObstacles = getCombinedObstaclesAndTurbinesList();
          if (activeObstacles && activeObstacles.length > 0) {
            activeObstacles.forEach(obs => {
              const obsH = typeof obs.h === 'number' ? obs.h : (obs.height || 0.5);
              if (effClearance > 0 && obsH <= effClearance + 0.10) return;
              if (typeof getObstacleShadowPolygons2DForRoof === "function") {
                const quads = getObstacleShadowPolygons2DForRoof(obs, pInfo, sU, sV, solarPos.shadowLenPerM);
                if (quads && quads.length > 0) polyShadowQuads2D.push(...quads);
              }
            });
          }
          if (typeof buildings !== "undefined" && buildings && buildings.length > 0) {
            buildings.forEach(bld => {
              if (typeof getBuildingShadowPolygons2DForRoof === "function") {
                const quads = getBuildingShadowPolygons2DForRoof(bld, pInfo, sU, sV, solarPos.shadowLenPerM, poly);
                if (quads && quads.length > 0) polyShadowQuads2D.push(...quads);
              }
            });
          }
          // Sombra inter-filas entre paneles de la misma cubierta (Self-Shading)
          const interRowQuads = generateInterRowShadowQuads2D(pInfo, sU, sV, solarPos.shadowLenPerM);
          if (interRowQuads.length > 0) {
            polyShadowQuads2D.push(...interRowQuads);
          }

          pInfo.panels.forEach((pData, pIdx) => {
            const mw = monthDaysW[mIdx] || 30;
            if (!pData.heatmapSample) return;

            // 1. Vector normal 3D del panel específico
            const panelNormWorld = getPanelNormalWorld(pData, norm, transform);
            const up = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(pData.center || (pData.corners && pData.corners[0]), new Cesium.Cartesian3());
            const cosSlope = Math.max(0, Math.min(1, Cesium.Cartesian3.dot(panelNormWorld, up)));
            const tiltRad = Math.acos(cosSlope);
            const svf = (1 + cosSlope) / 2;

            // 2. Ángulo de incidencia panel-sol
            const cosIncidence = sunDirWorld ? Cesium.Cartesian3.dot(sunDirWorld, panelNormWorld) : 0;

            // 3. Transposición física POA (W/m²) por módulo — motor único RA.Radiation (Perez 1990 anisotrópico)
            const moduleB0 = (activeModule && (activeModule.iamB0 || activeModule.b0)) || 0.05;
            let G_beam = 0, G_diffuse = 0, G_albedo = 0;
            if (typeof window !== 'undefined' && window.RA && window.RA.Radiation && typeof window.RA.Radiation.transposeComponents === 'function') {
              const _tp = window.RA.Radiation.transposeComponents({
                ghi: GHI_instant, dhi: G_dhi, dni: G_dni,
                cosTheta: cosIncidence, tiltRad: tiltRad,
                albedo: 0.20, iamB0: moduleB0, sunElevDeg: elevation,
                diffuseModel: 'perez'
              });
              // Componentes físicas con IAM selectivo (haz, difusa celeste y albedo)
              G_beam = (_tp.G_b_eff !== undefined) ? _tp.G_b_eff : (_tp.G_b * _tp.iamBlend);
              G_diffuse = (_tp.G_d_eff !== undefined) ? _tp.G_d_eff : (_tp.G_d * _tp.iamBlend);
              G_albedo = (_tp.G_r_eff !== undefined) ? _tp.G_r_eff : (_tp.G_r * _tp.iamBlend);
            } else {
              // Fallback legacy: difusa isótropa + IAM solo en haz
              if (cosIncidence > 0.005) {
                const iam = Math.max(0, 1 - 0.05 * (1 / Math.max(cosIncidence, 0.01) - 1));
                G_beam = G_dni * cosIncidence * iam;
              }
              G_diffuse = G_dhi * svf;
              G_albedo = GHI_instant * 0.20 * ((1 - cosSlope) / 2);
            }

            // Bifacialidad: factor de vista hacia cubierta/suelo con difusión perimetral mínima (0.04) para coplanares
            const rearViewFactor = Math.max(0.04, Math.pow(Math.sin(tiltRad / 2), 2));
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

                // Discretización física en 3 sub-cadenas (diodos de bypass IEC 61215)
                const subStrings = (panelPoly2D.length === 4)
                  ? dividePanelIntoSubstrings2D(panelPoly2D)
                  : [panelPoly2D];
                const subShaded = new Array(subStrings.length).fill(false);

                for (const quad of polyShadowQuads2D) {
                  if (!quad || quad.length === 0) continue;

                  // DESCARTE DE AUTO-SOMBREADO INTER-FILAS:
                  if (quad.sourcePanelIdx !== undefined) {
                    const curIdx = (pData.layoutIndex !== undefined) ? pData.layoutIndex : pIdx;
                    if (quad.sourcePanelIdx === curIdx) continue; // Un panel jamás se hace sombra a sí mismo

                    // Si ambos paneles están en la misma fila (misma cota V dentro del 40% de la altura del panel)
                    if (Math.abs(quad.sourceV - pData.v) < (pData.h || 2.10) * 0.40) continue;
                  }

                  // AABB Broadphase check: si la caja envolvente de la sombra no toca la del panel, descartar inmediatamente
                  let qUMin = Infinity, qUMax = -Infinity, qVMin = Infinity, qVMax = -Infinity;
                  for (let qi = 0; qi < quad.length; qi++) {
                    const qpt = quad[qi];
                    if (qpt.u < qUMin) qUMin = qpt.u;
                    if (qpt.u > qUMax) qUMax = qpt.u;
                    if (qpt.v < qVMin) qVMin = qpt.v;
                    if (qpt.v > qVMax) qVMax = qpt.v;
                  }
                  if (uMax < qUMin || uMin > qUMax || vMax < qVMin || vMin > qVMax) {
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

                shadedSubstringsCount = subShaded.filter(Boolean).length;
                if (shadedSubstringsCount > 0) {
                  isShaded = true;
                }
              }
            }

            if (shadedSubstringsCount < 3 && G_beam > 0.1 && sunDirWorld && pData.center) {
              const shouldCheck3DTiles = !poly.ignore3DTilesShadows && !(pInfo && pInfo.ignore3DTilesShadows);
              if (shouldCheck3DTiles && typeof isPanelOccludedBy3DEnvironment === "function" && isPanelOccludedBy3DEnvironment(pData.center, panelNormWorld, sunDirWorld)) {
                isShaded = true;
                shadedSubstringsCount = 3;
              }
            }

            // Fracción física de pérdida de haz según sub-strings bajo sombra
            const beamShadedFraction = (shadedSubstringsCount > 0)
              ? (shadedSubstringsCount / 3.0)
              : (isShaded ? 1.0 : 0.0);

            // Separación física: el obstáculo bloquea la radiación directa (G_beam).
            // La radiación difusa y albedo persisten salvo la fracción geométrica aislada por bypass.
            const beamLossW = (isShaded && beamShadedFraction > 0) ? (G_beam * tempFactor * beamShadedFraction) : 0;
            const diffuseLossW = (!pData.hasOptimizer && shadedSubstringsCount > 0)
              ? ((G_diffuse + G_albedo + albedoGain) * tempFactor * (beamShadedFraction / 3.0))
              : 0;
            const instantLossW = beamLossW + diffuseLossW;

            if (isShaded && instantLossW > 0) {
              pData.shadowHits = (pData.shadowHits || 0) + mw * hourStepDt;
              pData.activeDiodesHits = (pData.activeDiodesHits || 0) + shadedSubstringsCount * mw * hourStepDt;
              pData.annualShadedLoss += instantLossW * mw * hourStepDt;
            }

            // [B6] Energía neta real del mes calendario (para el reparto mensual de la memoria/oferta).
            const effectiveLossW = (isShaded && instantLossW > 0) ? instantLossW : 0;
            _monthlyNetWh[m] += (instantPotentialW - effectiveLossW) * mw * hourStepDt;
          });
        });

        // ⏱️ TIME-SLICING: Ceder control al navegador si se supera el presupuesto de 15ms
        if (performance.now() - frameStartTime > 15) {
          if (simGenerationId !== _activeSimGenerationId) {
            // Abortar silenciosamente esta tarea en segundo plano porque se lanzó una nueva
            return;
          }
          const progressPct = Math.min(100, Math.round((currentStep / totalSteps) * 100));
          if (typeof updateSolarCalcHUD === 'function') {
            updateSolarCalcHUD(progressPct, mIdx, totalPanelsCount);
          }
          if (progressFill) progressFill.style.width = progressPct + '%';
          if (typeof onProgressCallback === 'function') {
            onProgressCallback(progressPct, mIdx, totalPanelsCount);
          }
          await new Promise(resolve => setTimeout(resolve, 0));
          if (simGenerationId !== _activeSimGenerationId) return;
          frameStartTime = performance.now();
        }
      }
    }
  }

    if (simGenerationId !== _activeSimGenerationId) return;

    // 6. Cálculo final de porcentajes, producción anual en kWh y clasificación
    const pNomW = (activeModule && activeModule.wp) || 450;
    const pKwp = pNomW / 1000.0;
    const prCalc = (typeof window !== 'undefined' && typeof window.raCalculateSystemPR === 'function')
      ? window.raCalculateSystemPR(0.925)
      : { prTotal: 0.84, prBOS: 0.885 };
    // Dado que el modelo por instantes ya integra las pérdidas angulares (IAM) y térmicas (tempFactor)
    // paso a paso en cada hora, el factor de rendimiento de balance de planta (BOS) evita descontar dos veces calor e IAM.
    const prSys = (typeof prCalc.prBOS === 'number') ? prCalc.prBOS : (prCalc.prTotal / (0.925 * (1 - 0.028)));

    let maxNetWh = 0;
    polylines.forEach(poly => {
      const panels = Array.isArray(poly.panels) ? poly.panels : (poly.roofInfo && Array.isArray(poly.roofInfo.panels) ? poly.roofInfo.panels : []);
      panels.forEach(p => {
        const netWh = Math.max(0, p.annualTotalPotential - (p.annualShadedLoss || 0));
        if (netWh > maxNetWh) maxNetWh = netWh;
      });
    });
    if (maxNetWh <= 0) maxNetWh = 1;

    polylines.forEach(poly => {
      const panels = Array.isArray(poly.panels) ? poly.panels : (poly.roofInfo && Array.isArray(poly.roofInfo.panels) ? poly.roofInfo.panels : []);
      panels.forEach(p => {
        const lossPct = (p.annualTotalPotential > 0)
          ? (p.annualShadedLoss / p.annualTotalPotential) * 100
          : 0;
        p.annualLossPct = Math.round(lossPct * 10) / 10;
        p.annualYieldPct = Math.max(0, Math.round((100 - p.annualLossPct) * 10) / 10);

        const netWh = Math.max(0, p.annualTotalPotential - (p.annualShadedLoss || 0));
        // Generación bruta anual fotovoltaica y generación neta tras PR de sistema
        p.annualGrossKwh = (netWh / 1000.0) * pKwp;
        p._lastPrSys = prSys;
        p.annualKwh = Math.round(p.annualGrossKwh * prSys);
        p.annualTotalInsolation = Math.round(netWh / 1000.0);

        // Rendimiento comparativo relativo al módulo óptimo de la instalación
        const relativeYield = netWh / maxNetWh;
        p.relativeYieldPct = Math.round(relativeYield * 1000) / 10;

        // [OPCIÓN A] Gradiente cromático canónico basado estrictamente en Pérdidas por Sombra (SSOT getHeatmapColor)
        const heatCol = (typeof getHeatmapColor === 'function')
          ? getHeatmapColor(p.annualLossPct)
          : null;
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
        const _blockVal = (_monthlyNetWh[monthsReal[_i]] * effStride) / 1000.0 * pKwp * prSys;
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
          ✓ Simulación anual completada (192 instantes nominales, 6:00-21:00; sol ≥ 10°${heatmapStride > 1 ? ', muestreo 1 de ' + heatmapStride + ' paneles' : ''})
        </div>
        <div style="font-size: 10px;line-height:1.35;color:var(--text-slate-300);">
          ${diag.recommendationMsg}
        </div>
      `;
      if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
    }

    // 8. Ocultar HUDs de carga
    if (typeof hideSolarCalcHUD === 'function') hideSolarCalcHUD();
    if (progressBar) {
      setTimeout(() => { progressBar.style.display = 'none'; }, 1500);
    }

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
      if (window.solarSimState.panelShadowOverlayPool) {
        if (typeof viewer !== 'undefined' && viewer && viewer.entities) {
          window.solarSimState.panelShadowOverlayPool.forEach(e => {
            try { viewer.entities.remove(e); } catch(_) {}
          });
        }
        window.solarSimState.panelShadowOverlayPool.clear();
      }
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

    // Re-renderizado de paneles
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

})();
