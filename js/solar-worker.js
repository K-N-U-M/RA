/**
 * js/solar-worker.js — Web Worker Dedicado para Simulación Térmico-Astronómica Solar (192 Instantes)
 * =================================================================================================
 * Arquitectura de Rendimiento AAA (Proyecto RA)
 * - Ejecución off-thread en un hilo secundario de la CPU para mantener el visor 3D a 60 FPS estables.
 * - Algoritmo astronómico Spencer/Michalsky, modelo de radiación Erbs + Hay-Davies POA.
 * - Detección de sombras 2D sobre cubierta con filtrado AABB broadphase y diodos de bypass (3 sub-strings).
 * - Cero dependencias de DOM o WebGL.
 */

'use strict';

try {
  importScripts('radiation-engine.js?v=20261118_t3');
} catch (eRadImport) {
  console.error('[solar-worker] Error cargando radiation-engine.js:', eRadImport);
}
try {
  importScripts('polygon-shadow-math.js?v=20261126_f3');
} catch (ePolyImport) {
  console.error('[solar-worker] Error cargando polygon-shadow-math.js:', ePolyImport);
}

const _T_AMP_TABLE = {
  costal_med: 4.5,
  costa_med:  4.5,
  interior:   7.5,
  atlantico:  4.0,
  canarias:   3.5
};

// ── 1. GEOMETRÍA 2D Y RADIACIÓN OFF-THREAD (SSOT: polygon-shadow-math.js & radiation-engine.js) ──
// dividePanelIntoSubstrings2D, precalcQuadAABB, convexHull2D y polygonsIntersect2D llegan de polygon-shadow-math.js.
// RA.Radiation (computeSolarPosition, decomposeErbs, transposeComponents, estimateMonthlyGHI, getAmbientTempMonth) llega de radiation-engine.js.

// ── 2. EJECUCIÓN PRINCIPAL DEL SIMULADOR ────────────────────────────────────

self.onmessage = async function(e) {
  const data = e.data;
  if (!data || data.type !== 'START_HEATMAP') return;

  const {
    simGenerationId,
    lat,
    lng,
    resolution,
    detailedBypass,
    shadowSimConfig,
    raShadowSimConfig,
    panels,
    faldones,
    climaticZone,
    moduleProps,
    monthlyGHI,
    horizonProfile,
    basePct
  } = data;
  const sSimCfg = shadowSimConfig || raShadowSimConfig || {};
  const includeObstacles = sSimCfg.includeObstacles !== false;
  const includeBuildings = sSimCfg.includeBuildings !== false;
  const includeInterRow = sSimCfg.includeInterRow !== false;
  const shadowWeightPct = (typeof sSimCfg.shadowWeightPct === 'number' && isFinite(sSimCfg.shadowWeightPct)) ? sSimCfg.shadowWeightPct : 100;
  const shadowWeightFactor = Math.max(0, Math.min(1, shadowWeightPct / 100.0));
  const horizonElevations = (Array.isArray(horizonProfile) && horizonProfile.length === 16) ? horizonProfile : null;
  const customMonthlyGHI = Array.isArray(monthlyGHI) ? monthlyGHI : null;
  const useDetailedBypass = (detailedBypass !== undefined) ? !!detailedBypass : true;

  // Configuración temporal adaptable según modo de resolución
  let monthsDoy = [15, 45, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349];
  let monthDaysW = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let hours = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]; // 16h = 192 instantes (Ultra)

  if (resolution === 'sketch') {
    // Modo Skyline 360° instantáneo (<0.1s): 12 meses x 6 horas de cálculo puro sin raycast previo por panel
    hours = [8, 10, 12, 14, 16, 18];
  } else if (resolution === 'fast') {
    // Modo Rápida Solsticios y Equinoccios (Opción 3): 4 fechas cardinales x 4 horas clave = 16 instantes (~0.3s)
    monthsDoy = [15, 105, 196, 288]; // Ene (Invierno), Abr (Primavera), Jul (Verano), Oct (Otoño)
    monthDaysW = [90, 91, 92, 92];    // Ponderación trimestral canónica
    hours = [9, 12, 15, 17];
  } else if (resolution === 'medium') {
    // 12 meses x 14 horas continuas = 168 instantes horarios (<20ms off-thread): evita aliasing estroboscópico de sombras
    hours = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
  }

  const hourWeights = hours.map((h, idx) => {
    if (hours.length <= 1) return 1.0;
    if (idx === 0) return (hours[1] - hours[0]) * 0.5;
    if (idx === hours.length - 1) return (hours[idx] - hours[idx - 1]) * 0.5;
    return (hours[idx + 1] - hours[idx - 1]) * 0.5;
  });
  const _MONTH_START_DOY = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
  const doyToMonthIdx = (doy) => {
    let mi = 11;
    for (let k = 0; k < 12; k++) {
      if (doy >= _MONTH_START_DOY[k]) mi = k;
    }
    return mi;
  };
  const monthsReal = monthsDoy.map(doyToMonthIdx);
  const _monthlyNetWh = new Array(12).fill(0);

  // Inicializar métricas acumuladas por panel
  const panelResults = new Map();
  panels.forEach(p => {
    panelResults.set(p.id, {
      id: p.id,
      polyIdx: p.polyIdx,
      annualTotalPotential: 0,
      annualShadedLoss: 0,
      annualLossPct: 0,
      annualYieldPct: 100,
      shadowHits: 0,
      activeDiodesHits: 0
    });
  });

  // [AAA ARCHITECTURE] Pre-cálculo estático del Factor de Visión de Cielo (SVF) y atenuación de penumbra por panel usando el centroide real de poly2D.
  const panelSvfMap = new Map();
  const panelPenumbraMap = new Map();
  panels.forEach(p => {
    const faldon = faldones[p.polyIdx] || faldones[0] || {};
    const obsList = faldon.obstacles2D || [];
    let diffuseOcclusion = 0.0;
    let minObsDist = Infinity;
    if (obsList.length > 0 && (includeObstacles || includeBuildings)) {
      let pu = p.u || 0, pv = p.v || 0;
      if (Array.isArray(p.poly2D) && p.poly2D.length >= 3) {
        let su = 0, sv = 0;
        for (let k = 0; k < p.poly2D.length; k++) { su += p.poly2D[k].u; sv += p.poly2D[k].v; }
        pu = su / p.poly2D.length;
        pv = sv / p.poly2D.length;
      }
      for (let oi = 0; oi < obsList.length; oi++) {
        const o = obsList[oi];
        if (o.isBuilding ? !includeBuildings : !includeObstacles) continue;
        const pts = o.points2D || [];
        if (pts.length === 0) continue;
        let cU = 0, cV = 0;
        for (let pi = 0; pi < pts.length; pi++) {
          cU += pts[pi].u;
          cV += pts[pi].v;
        }
        cU /= pts.length;
        cV /= pts.length;
        const dist = Math.hypot(pu - cU, pv - cV);
        if (dist < minObsDist) minObsDist = dist;
        const hObs = o.height || 1.2;
        if (dist > 0.1 && dist < 25.0) {
          const elevAng = Math.atan2(hObs, dist);
          const solidAngleFrac = (1 - Math.cos(elevAng)) * 0.5;
          diffuseOcclusion += solidAngleFrac;
        }
      }
    }
    const svf = Math.max(0.20, Math.min(1.0, 1.0 - diffuseOcclusion));
    panelSvfMap.set(p.id, svf);
    let penumbraAttenuation = 1.0;
    if (minObsDist < Infinity && minObsDist > 0.5) {
      const penumbraWidth = minObsDist * 0.00925;
      if (penumbraWidth > 0.08) penumbraAttenuation = Math.max(0.85, 1.0 - (penumbraWidth / 2.0));
    }
    panelPenumbraMap.set(p.id, penumbraAttenuation);
  });

  // [AAA ARCHITECTURE] Pre-cálculo estático geométrico de paneles (AABB, Substrings con margen de marco activo y Penumbra)
  // O(N) una sola vez durante el inicio, erradicando decenas de miles de operaciones innecesarias en los bucles horarios.
  const shrinkPolyInward = (poly, marginM) => {
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
  };

  const mp = moduleProps || {};
  const defaultModWp = (typeof mp.wp === 'number' && mp.wp > 0) ? mp.wp : 450;
  const noctModule = mp.noct || 45;
  const gammaCoeff = mp.gammaCoeff || -0.0034;
  const isBifacial = mp.isBifacial || false;
  const bifacialityFactor = mp.bifacialityFactor || 0.75;
  const iamB0 = mp.iamB0 || 0.05;

  const preparedPanels = panels.map(pData => {
    const w = pData.w || 1.05;
    const h = pData.h || 2.15;
    const halfW = w / 2;
    const halfH = h / 2;
    const panelPoly = (pData.poly2D && pData.poly2D.length >= 3) ? pData.poly2D : [
      { u: (pData.u || 0) - halfW, v: (pData.v || 0) - halfH },
      { u: (pData.u || 0) + halfW, v: (pData.v || 0) - halfH },
      { u: (pData.u || 0) + halfW, v: (pData.v || 0) + halfH },
      { u: (pData.u || 0) - halfW, v: (pData.v || 0) + halfH }
    ];

    let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
    let polyCu = 0, polyCv = 0;
    for (let pi = 0; pi < panelPoly.length; pi++) {
      const pt = panelPoly[pi];
      polyCu += pt.u;
      polyCv += pt.v;
      if (pt.u < uMin) uMin = pt.u;
      if (pt.u > uMax) uMax = pt.u;
      if (pt.v < vMin) vMin = pt.v;
      if (pt.v > vMax) vMax = pt.v;
    }
    polyCu /= panelPoly.length;
    polyCv /= panelPoly.length;

    // Área celular activa (descontando ~4.5 cm del marco de aluminio inactivo) para evitar falsos positivos al rozar 1 mm
    const activeCellPoly = shrinkPolyInward(panelPoly, 0.045);
    const rawSubStrings = (useDetailedBypass && activeCellPoly.length === 4)
      ? dividePanelIntoSubstrings2D(activeCellPoly)
      : [activeCellPoly];

    const subStrings = rawSubStrings.map(sub => {
      let suMin = Infinity, suMax = -Infinity, svMin = Infinity, svMax = -Infinity;
      for (let si = 0; si < sub.length; si++) {
        const spt = sub[si];
        if (spt.u < suMin) suMin = spt.u;
        if (spt.u > suMax) suMax = spt.u;
        if (spt.v < svMin) svMin = spt.v;
        if (spt.v > svMax) svMax = spt.v;
      }
      return { poly: sub, uMin: suMin, uMax: suMax, vMin: svMin, vMax: svMax };
    });

    const myIndex = (pData.layoutIndex !== undefined) ? pData.layoutIndex : (pData.idx !== undefined ? pData.idx : -1);
    const panelH = pData.h || 2.10;
    const pGridA = (typeof pData.gridA === 'number') ? pData.gridA : ((pData.frame && typeof pData.frame.Lu === 'number') ? ((pData.u || 0) * pData.frame.Lu + (pData.v || 0) * pData.frame.Lv) : null);

    const tiltDeg = (typeof pData.tiltDeg === 'number' && !isNaN(pData.tiltDeg)) ? pData.tiltDeg : 20;
    const tiltRad = tiltDeg * Math.PI / 180;
    const fViewSky = (1 + Math.cos(tiltRad)) / 2;
    const fViewGround = (1 - Math.cos(tiltRad)) / 2;
    const penumbraAttenuation = panelPenumbraMap.get(pData.id) || 1.0;

    return {
      id: pData.id,
      polyIdx: pData.polyIdx,
      myIndex: myIndex,
      u: pData.u || 0,
      v: pData.v || 0,
      w: w,
      h: panelH,
      wp: (typeof pData.wp === 'number' && pData.wp > 0) ? pData.wp : defaultModWp,
      uMin: uMin,
      uMax: uMax,
      vMin: vMin,
      vMax: vMax,
      pGridA: pGridA,
      frame: pData.frame || null,
      panelPoly: panelPoly,
      subStrings: subStrings,
      penumbraAttenuation: penumbraAttenuation,
      svfAmbient: panelSvfMap.get(pData.id) || 1.0,
      normalENU: pData.normalENU || pData.normalWorld || { x: 0, y: 0, z: 1 },
      tiltRad: tiltRad,
      coplanar: !!pData.coplanar,
      clearance: (typeof pData.clearance === 'number') ? pData.clearance : 0,
      fViewSky: fViewSky,
      fViewGround: fViewGround,
      hasOptimizer: !!pData.hasOptimizer,
      horizon: pData.horizon || null,
      occlusion3D: pData.occlusion3D || null
    };
  });

  const _radW = (typeof self !== 'undefined' && self.RA && self.RA.Radiation) ? self.RA.Radiation : null;
  if (!_radW) {
    self.postMessage({ type: 'ERROR', simGenerationId, error: 'RA.Radiation no cargado en solar-worker' });
    return;
  }

  const totalSteps = monthsDoy.length * hours.length;
  let currentStep = 0;

  for (let mIdx = 0; mIdx < monthsDoy.length; mIdx++) {
    const m = monthsReal[mIdx];
    const tAmbMonth = _radW.getAmbientTempMonth(climaticZone, m);
    const GHI_daily_Wh = (customMonthlyGHI && customMonthlyGHI[m] > 0)
      ? customMonthlyGHI[m]
      : _radW.estimateMonthlyGHI(lat, m);

    const _gammaM = (2 * Math.PI / 365) * (monthsDoy[mIdx] - 1);
    const _EtM = 229.18 * (0.000075 + 0.001868 * Math.cos(_gammaM) - 0.032077 * Math.sin(_gammaM)
      - 0.014615 * Math.cos(2 * _gammaM) - 0.040849 * Math.sin(2 * _gammaM));

    let _sinAltSum = 0;
    for (let _hs = 0; _hs < hours.length; _hs++) {
      const _utcPre = hours[_hs] - (4 * lng + _EtM) / 60;
      const _spPre = _radW.computeSolarPosition(lat, lng, monthsDoy[mIdx], _utcPre, true);
      if (_spPre && _spPre.isDay && _spPre.elevDeg >= 5.0) {
        _sinAltSum += Math.sin(_spPre.elevDeg * Math.PI / 180) * hourWeights[_hs];
      }
    }
    if (_sinAltSum <= 0) _sinAltSum = 1;

    for (let hIdx = 0; hIdx < hours.length; hIdx++) {
      const h = hours[hIdx];
      currentStep++;

      const utcHour = h - (4 * lng + _EtM) / 60;
      const sp = _radW.computeSolarPosition(lat, lng, monthsDoy[mIdx], utcHour, true);

      if (!sp || !sp.isDay || sp.elevDeg < 5.0) {
        continue;
      }

      const elevRad = sp.elevRad;
      const sinAlt = Math.sin(elevRad);
      const GHI_instant = Math.max(0, (GHI_daily_Wh / _sinAltSum) * sinAlt);
      const { dhi: G_dhi, dni: G_dni } = _radW.decomposeErbs(GHI_instant, sp.elevDeg, monthsDoy[mIdx]);

      // Pre-calcular siluetas de sombra de obstáculos por faldón para esta hora (O(F) en vez de O(N*F))
      const faldonShadowQuads = new Map();
      faldones.forEach((faldon, fIdx) => {
        const hasObs = (includeObstacles || includeBuildings) && Array.isArray(faldon.obstacles2D) &&
          faldon.obstacles2D.some(obs => obs && (obs.isBuilding ? includeBuildings : includeObstacles));
        const hasInterRow = includeInterRow && Array.isArray(faldon.interRowEdges) && faldon.interRowEdges.length > 0;
        if (!hasObs && !hasInterRow) {
          faldonShadowQuads.set(fIdx, []);
          return;
        }
        const uVec = faldon.uVec || { x: 1, y: 0, z: 0 };
        const vVec = faldon.vVec || { x: 0, y: 1, z: 0 };
        const nVec = faldon.normalENU || faldon.normalWorld || { x: 0, y: 0, z: 1 };
        const sDirENU = sp.sDirENU;
        const sunVec = sp.sunVecENU;
        const sU = sDirENU.x * uVec.x + sDirENU.y * uVec.y + sDirENU.z * uVec.z;
        const sV = sDirENU.x * vVec.x + sDirENU.y * vVec.y + sDirENU.z * vVec.z;
        const shadowLen = sp.shadowLenPerM;

        // Intersección rayo-plano exacta en cubierta inclinada:
        // Δ = h·Z - t·S con t = (h·Nz) / (S·N), garantizando Δ·N = 0 (proyección real sobre pendiente)
        const sDotN = sunVec.x * nVec.x + sunVec.y * nVec.y + sunVec.z * nVec.z;

        const quads = [];
        if (hasObs && sDotN > 0.02) {
          const nz = Math.max(0.15, nVec.z || 1.0);
          faldon.obstacles2D.forEach(obs => {
            if (!obs || (obs.isBuilding ? !includeBuildings : !includeObstacles)) return;
            const hObs = obs.height || 1.2;
            const maxObsShadowLen = 45.0; // Límite físico para evitar proyecciones infinitas
            const tRay = (hObs * nz) / sDotN;
            let dx = -tRay * sunVec.x;
            let dy = -tRay * sunVec.y;
            let dz = hObs - tRay * sunVec.z;
            const dMag = Math.hypot(dx, dy, dz);
            if (dMag > maxObsShadowLen && dMag > 1e-4) {
              const capScale = maxObsShadowLen / dMag;
              dx *= capScale; dy *= capScale; dz *= capScale;
            }
            const dU = dx * uVec.x + dy * uVec.y + dz * uVec.z;
            const dV = dx * vVec.x + dy * vVec.y + dz * vVec.z;
            const basePoly = obs.points2D || [];
            if (basePoly.length >= 3) {
              let obsCenterU = 0, obsCenterV = 0;
              for (let bi = 0; bi < basePoly.length; bi++) {
                obsCenterU += basePoly[bi].u;
                obsCenterV += basePoly[bi].v;
              }
              obsCenterU /= basePoly.length;
              obsCenterV /= basePoly.length;
              const topPoly = basePoly.map(pt => ({ u: pt.u + dU, v: pt.v + dV }));
              const hull = (typeof convexHull2D === 'function') ? convexHull2D([...basePoly, ...topPoly]) : null;
              if (hull && hull.length >= 3) {
                const q = precalcQuadAABB(hull);
                q.obsCenterU = obsCenterU;
                q.obsCenterV = obsCenterV;
                quads.push(q);
              } else {
                for (let i = 0; i < basePoly.length; i++) {
                  const next = (i + 1) % basePoly.length;
                  const q = precalcQuadAABB([basePoly[i], basePoly[next], topPoly[next], topPoly[i]]);
                  q.obsCenterU = obsCenterU;
                  q.obsCenterV = obsCenterV;
                  quads.push(q);
                }
              }
            }
          });
        }

        // Autosombreado Inter-filas entre paneles elevados de la misma cubierta
        if (hasInterRow) {
          faldon.interRowEdges.forEach(edge => {
            const dU = sU * edge.effHMod * shadowLen;
            const dV = sV * edge.effHMod * shadowLen;
            const dLen = Math.hypot(dU, dV);
            if (dLen >= 0.04) {
              const dirU = dU / dLen, dirV = dV / dLen;
              const offset = 0.06;
              const quad = [
                { u: edge.u1 + dirU * offset, v: edge.v1 + dirV * offset },
                { u: edge.u2 + dirU * offset, v: edge.v2 + dirV * offset },
                { u: edge.u2 + dU, v: edge.v2 + dV },
                { u: edge.u1 + dU, v: edge.v1 + dV }
              ];
              quad.sourcePanelIdx = edge.sourceIdx;
              quad.sourceU = edge.sourceU;
              quad.sourceV = edge.sourceV;
              quad.gridA = (typeof edge.gridA === 'number') ? edge.gridA : ((edge.frame && typeof edge.frame.Lu === 'number') ? (edge.sourceU * edge.frame.Lu + edge.sourceV * edge.frame.Lv) : null);
              quad.frame = edge.frame || null;
              quads.push(precalcQuadAABB(quad));
            }
          });
        }
        faldonShadowQuads.set(fIdx, quads);
      });

      const e0 = (1 + 0.033 * Math.cos(2 * Math.PI * (monthsDoy[mIdx] - 1) / 365));

      // Evaluación de alto rendimiento por panel (Broadphase O(1) + Narrowphase optimizada)
      preparedPanels.forEach(p => {
        const res = panelResults.get(p.id);
        if (!res) return;

        // Proyección de ángulo de incidencia cosTheta con vector normal en coordenadas ENU
        const pNorm = p.normalENU;
        const cosTheta = Math.max(0, sp.sunVecENU.x * pNorm.x + sp.sunVecENU.y * pNorm.y + sp.sunVecENU.z * pNorm.z);

        const _tp = _radW.transposeComponents({
          ghi: GHI_instant, dhi: G_dhi, dni: G_dni,
          cosTheta: cosTheta, tiltRad: p.tiltRad,
          albedo: 0.20, iamB0: iamB0, sunElevDeg: sp.elevDeg,
          dayOfYear: monthsDoy[mIdx], e0: e0,
          diffuseModel: 'perez'
        });
        const G_beam = _tp.G_b_eff;
        const G_diff = _tp.G_d_eff * p.svfAmbient;
        const G_refl = _tp.G_r_eff;

        const isRaised = !p.coplanar || (p.clearance >= 0.25);
        const clearanceFactor = isRaised
          ? (p.clearance >= 0.8 ? 0.72 : (p.clearance >= 0.25 ? 0.55 : 0.35))
          : 0;
        const rearViewFactor = isRaised
          ? Math.max(0.06, Math.min(0.85, clearanceFactor * Math.pow(Math.cos(p.tiltRad / 2), 2)))
          : 0.04;
        const albedoGain = (isBifacial && bifacialityFactor > 0) ? (GHI_instant * 0.20 * rearViewFactor * bifacialityFactor) : 0;
        const G_poa = G_beam + G_diff + G_refl + albedoGain;

        // Derating térmico: perfil diurno sinusoidal T_amb(h) + modelo Faiman
        const tAmp = _T_AMP_TABLE[climaticZone] || 5.0;
        const tAmbHour = tAmbMonth + tAmp * Math.sin(Math.PI * (h - 9) / 12);
        const vWind = (typeof data.windSpeed === 'number' && isFinite(data.windSpeed)) ? data.windSpeed : 2.0;
        const u0Faiman = (p.coplanar && p.clearance < 0.25) ? 20.0 : 25.0;
        const u1Faiman = 6.84;
        const tCell = tAmbHour + G_poa / (u0Faiman + u1Faiman * vWind);
        const thermalFactor = Math.max(0.70, 1.0 + gammaCoeff * (tCell - 25));

        // Potencia instantánea específica (W/m² efectiva) modulada por factor térmico
        const instantPotentialW = G_poa * thermalFactor;

        const mw = monthDaysW[mIdx];
        const dt = hourWeights[hIdx];
        res.annualTotalPotential += instantPotentialW * mw * dt;

        // Evaluación de sombreado
        let isShaded = false;
        let shadedSubstringsCount = 0;
        let minPenumbra = 1.0;

        const shadowQuads = faldonShadowQuads.get(p.polyIdx) || [];

        if (shadowQuads.length > 0) {
          const subStrings = p.subStrings;
          const subShaded = new Array(subStrings.length).fill(false);
          const myIndex = p.myIndex;
          const panelH = p.h;

          const computeQuadPenumbra = (q) => {
            if (typeof q.obsCenterU === 'number' && typeof q.obsCenterV === 'number') {
              const dObs = Math.hypot(p.u - q.obsCenterU, p.v - q.obsCenterV);
              if (dObs > 0.5) {
                const penumbraWidth = dObs * 0.00925;
                if (penumbraWidth > 0.08) return Math.max(0.85, 1.0 - (penumbraWidth / 2.0));
              }
            }
            return 1.0;
          };

          for (let qIdx = 0; qIdx < shadowQuads.length; qIdx++) {
            const quad = shadowQuads[qIdx];

            // [BROADPHASE ULTRA RÁPIDO]: Descarte de cajas delimitadoras en 4 operaciones escalares
            if (p.uMax < quad.uMin || p.uMin > quad.uMax || p.vMax < quad.vMin || p.vMin > quad.vMax) {
              continue;
            }

            // [AAA FÍSICA SOLAR] Descarte riguroso de auto-sombreado propio y de la misma fila:
            if (quad.sourcePanelIdx !== undefined) {
              if (quad.sourcePanelIdx === myIndex) continue; // Un panel jamás se hace sombra a sí mismo
              if (typeof quad.sourceU === 'number' && typeof quad.sourceV === 'number') {
                if (Math.abs(quad.sourceU - p.u) < 0.05 && Math.abs(quad.sourceV - p.v) < 0.05) continue;
                if (typeof quad.gridA === 'number' && typeof p.pGridA === 'number') {
                  if (Math.abs(quad.gridA - p.pGridA) < panelH * 0.40) continue;
                } else if (p.frame && typeof p.frame.Lu === 'number') {
                  const qRowProj = quad.sourceU * p.frame.Lu + quad.sourceV * p.frame.Lv;
                  const pRowProj = p.u * p.frame.Lu + p.v * p.frame.Lv;
                  if (Math.abs(qRowProj - pRowProj) < panelH * 0.40) continue;
                } else if (quad.frame && typeof quad.frame.Lu === 'number') {
                  const qRowProj = quad.sourceU * quad.frame.Lu + quad.sourceV * quad.frame.Lv;
                  const pRowProj = p.u * quad.frame.Lu + p.v * quad.frame.Lv;
                  if (Math.abs(qRowProj - pRowProj) < panelH * 0.40) continue;
                } else {
                  if (Math.abs(quad.sourceV - p.v) < panelH * 0.40) continue;
                  if (Math.abs(quad.sourceU - p.u) < p.w * 0.40) continue;
                }
              }
            }

            // [NARROWPHASE SUB-STRING / MONOLÍTICO]:
            if (useDetailedBypass) {
              let quadHit = false;
              for (let sIdx = 0; sIdx < subStrings.length; sIdx++) {
                if (subShaded[sIdx]) continue;
                const sub = subStrings[sIdx];
                if (sub.uMax < quad.uMin || sub.uMin > quad.uMax || sub.vMax < quad.vMin || sub.vMin > quad.vMax) continue;
                if (typeof polygonsIntersect2D === 'function' && polygonsIntersect2D(sub.poly, quad)) {
                  subShaded[sIdx] = true;
                  quadHit = true;
                }
              }
              if (quadHit) {
                const qp = computeQuadPenumbra(quad);
                if (qp < minPenumbra) minPenumbra = qp;
              }
              if (subShaded.every(s => s)) break;
            } else {
              if (typeof polygonsIntersect2D === 'function' && polygonsIntersect2D(p.panelPoly, quad)) {
                isShaded = true;
                const qp = computeQuadPenumbra(quad);
                if (qp < minPenumbra) minPenumbra = qp;
                break;
              }
            }
          }

          if (useDetailedBypass) {
            shadedSubstringsCount = subShaded.filter(Boolean).length;
            if (shadedSubstringsCount > 0) isShaded = true;
          } else {
            shadedSubstringsCount = isShaded ? 3 : 0;
          }
        }

        const beamShadedFraction = ((shadedSubstringsCount > 0)
          ? (shadedSubstringsCount / 3.0)
          : (isShaded ? 1.0 : 0.0)) * shadowWeightFactor;

        // Topología eléctrica: Suavizado físico realista para módulos half-cut (6 sub-cadenas / 3 diodos de bypass)
        // Evita el escalón artificial binario entre placas adyacentes cuando solo roza una esquina del módulo.
        const hasOpt = p.hasOptimizer;
        let effectiveLossFraction = beamShadedFraction;
        if (!hasOpt && shadedSubstringsCount > 0) {
          // En half-cut moderno, 1 substring rozado no tumba todo el módulo: la pérdida adicional por mismatch es moderada (10-15%)
          const mismatchBonus = (shadedSubstringsCount === 1) ? 0.10 : (shadedSubstringsCount === 2 ? 0.14 : 0.0);
          effectiveLossFraction = Math.min(1.0, beamShadedFraction * (1.0 + mismatchBonus));
        }

        // Separación física: transición continua de horizonte en el intervalo temporal (evita escalón binario 0%->100%)
        let horizonOcclusionFrac = 0.0;
        const effHorizon = p.horizon || horizonElevations;
        if (effHorizon && effHorizon.length >= 4 && sp && typeof sp.azDegFromNorth === 'number') {
          const nSec = effHorizon.length;
          let blockingAlt = 0;
          if (nSec === 16) {
            // Compatibilidad con perfiles heredados de 16 sectores centrados en el Sur
            const azSur = ((sp.azDegFromNorth - 180) % 360 + 360) % 360;
            const sectorIdx = Math.min(15, Math.floor((azSur + 11.25) / 22.5) % 16);
            blockingAlt = effHorizon[sectorIdx] || 0;
          } else {
            // Perfil espacial de 24 sectores (15°, 0° = Norte) con interpolación angular lineal
            const stepDeg = 360 / nSec;
            const azNorm = ((sp.azDegFromNorth % 360) + 360) % 360;
            const fIdx = azNorm / stepDeg;
            const i0 = Math.floor(fIdx) % nSec;
            const i1 = (i0 + 1) % nSec;
            const frac = fIdx - Math.floor(fIdx);
            blockingAlt = (effHorizon[i0] || 0) * (1 - frac) + (effHorizon[i1] || 0) * frac;
          }
          if (blockingAlt > 0.5) {
            const halfBand = Math.max(2.5, dt * 2.5);
            if (sp.elevDeg <= blockingAlt - halfBand) {
              horizonOcclusionFrac = 1.0;
            } else if (sp.elevDeg < blockingAlt + halfBand) {
              horizonOcclusionFrac = (blockingAlt + halfBand - sp.elevDeg) / (2.0 * halfBand);
            }
          }
        }

        const isOccludedBy3D = (p.occlusion3D && p.occlusion3D[currentStep - 1] === 1);
        const envOcclusionFrac = (isOccludedBy3D ? 1.0 : horizonOcclusionFrac) * shadowWeightFactor;
        const isEnvironmentOccluded = envOcclusionFrac > 0.01;

        const effectiveShaded = isShaded || isEnvironmentOccluded;
        const localBeamLossFrac = isShaded ? (effectiveLossFraction * minPenumbra) : 0.0;
        const totalEffectiveLossFraction = Math.max(localBeamLossFrac, envOcclusionFrac);

        const beamLossW = (effectiveShaded && totalEffectiveLossFraction > 0) ? (G_beam * thermalFactor * totalEffectiveLossFraction) : 0;
        const skyOcclusionFactor = envOcclusionFrac * 0.25;
        const diffuseLossLocal = (!hasOpt && shadedSubstringsCount > 0)
          ? ((G_diff + G_refl + albedoGain) * thermalFactor * (beamShadedFraction * 0.12))
          : 0;
        const diffuseLossEnv = isEnvironmentOccluded ? (G_diff * thermalFactor * skyOcclusionFactor) : 0;
        const diffuseLossW = Math.max(diffuseLossLocal, diffuseLossEnv);
        const instantLossW = beamLossW + diffuseLossW;

        if (effectiveShaded && instantLossW > 0) {
          res.shadowHits += mw * dt * totalEffectiveLossFraction;
          res.activeDiodesHits += Math.max(shadedSubstringsCount, envOcclusionFrac * 3) * mw * dt;
          res.annualShadedLoss += instantLossW * mw * dt;
        }

        const effectiveLossW = (effectiveShaded && instantLossW > 0) ? instantLossW : 0;
        _monthlyNetWh[m] += (instantPotentialW - effectiveLossW) * mw * dt * (p.wp / 1000.0);
      });
    }

    // Progreso mensual/trimestral (fase worker cubre desde startPct hasta 99%, reservando 100% para el cierre)
    const startPct = (typeof basePct === 'number') ? basePct : 35;
    const progressPct = Math.min(99, Math.round(startPct + (currentStep / totalSteps) * (100 - startPct)));
    self.postMessage({
      type: 'PROGRESS',
      simGenerationId,
      progressPct,
      mIdx,
      monthReal: m,
      stepIndex: mIdx + 1,
      totalStepsCount: monthsDoy.length,
      totalPanels: panels.length
    });
  }

  // Finalizar cálculos
  const finalResults = [];
  panelResults.forEach(res => {
    if (res.annualTotalPotential > 0) {
      res.annualLossPct = Math.round((res.annualShadedLoss / res.annualTotalPotential) * 1000) / 10;
      res.annualYieldPct = Math.max(0, Math.round((100 - res.annualLossPct) * 10) / 10);
    } else {
      res.annualLossPct = 0;
      res.annualYieldPct = 100;
    }
    finalResults.push(res);
  });

  self.postMessage({
    type: 'DONE',
    simGenerationId,
    results: finalResults,
    monthlyNetWh: _monthlyNetWh
  });
};
