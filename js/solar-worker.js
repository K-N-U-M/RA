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

const SOLAR_CONST = 1367;

const _T_AMB_TABLE = {
  costal_med: [11.0, 12.0, 14.0, 16.0, 20.0, 25.0, 28.0, 28.5, 24.0, 19.0, 14.0, 11.0],
  costa_med:  [11.0, 12.0, 14.0, 16.0, 20.0, 25.0, 28.0, 28.5, 24.0, 19.0, 14.0, 11.0],
  interior:   [5.0,  7.0,  10.0, 12.0, 17.0, 23.0, 27.0, 27.0, 22.0, 15.0,  9.0,  5.0],
  atlantico:  [9.0,  10.0, 12.0, 13.0, 16.0, 19.0, 21.0, 21.5, 19.0, 15.0, 11.0,  9.0],
  canarias:   [18.0, 18.5, 19.0, 20.0, 21.5, 23.5, 25.0, 26.0, 25.5, 23.5, 21.0, 19.0]
};

// ── 1. GEOMETRÍA 2D OFF-THREAD ───────────────────────────────────────────────

function isPointInPolygon2D(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].u, yi = poly[i].v;
    const xj = poly[j].u, yj = poly[j].v;
    const intersect = ((yi > pt.v) !== (yj > pt.v)) &&
      (pt.u < (xj - xi) * (pt.v - yi) / (yj - yi + 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function segmentsIntersect2D(p1, p2, p3, p4) {
  function ccw(A, B, C) {
    return (C.v - A.v) * (B.u - A.u) > (B.v - A.v) * (C.u - A.u);
  }
  return (ccw(p1, p3, p4) !== ccw(p2, p3, p4)) && (ccw(p1, p2, p3) !== ccw(p1, p2, p4));
}

function polygonsIntersect2D(polyA, polyB) {
  if (!polyA || !polyB || polyA.length < 3 || polyB.length < 3) return false;
  for (let i = 0; i < polyA.length; i++) {
    if (isPointInPolygon2D(polyA[i], polyB)) return true;
  }
  for (let i = 0; i < polyB.length; i++) {
    if (isPointInPolygon2D(polyB[i], polyA)) return true;
  }
  for (let i = 0; i < polyA.length; i++) {
    const a1 = polyA[i];
    const a2 = polyA[(i + 1) % polyA.length];
    for (let j = 0; j < polyB.length; j++) {
      const b1 = polyB[j];
      const b2 = polyB[(j + 1) % polyB.length];
      if (segmentsIntersect2D(a1, a2, b1, b2)) return true;
    }
  }
  return false;
}

function convexHull2D(points) {
  if (!points || points.length <= 3) return points || [];
  const pts = points.slice().sort((a, b) => a.u === b.u ? a.v - b.v : a.u - b.u);
  function cross(o, a, b) {
    return (a.u - o.u) * (b.v - o.v) - (a.v - o.v) * (b.u - o.u);
  }
  const lower = [];
  for (let p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 1e-9) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 1e-9) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function dividePanelIntoSubstrings2D(quad) {
  if (!quad || quad.length !== 4) return quad ? [quad] : [];
  const p0 = quad[0], p1 = quad[1], p2 = quad[2], p3 = quad[3];
  const d01 = Math.hypot(p1.u - p0.u, p1.v - p0.v);
  const d12 = Math.hypot(p2.u - p1.u, p2.v - p1.v);

  const lerp = (a, b, t) => ({ u: a.u + (b.u - a.u) * t, v: a.v + (b.v - a.v) * t });

  if (d12 >= d01) {
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

// ── 2. FÍSICA SOLAR Y MODELO DE RADIACIÓN ───────────────────────────────────

function computeSolarPositionWorker(latDeg, lonDeg, dayOfYear, utcHour) {
  const gamma = (2 * Math.PI / 365) * (dayOfYear - 1 + (utcHour - 12) / 24);
  const eqtime = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma)
    - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));

  const declRad = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma)
    - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma)
    - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);

  const timeOffset = eqtime + 4 * lonDeg;
  const tst = utcHour * 60 + timeOffset;
  const haRad = ((tst / 4) - 180) * Math.PI / 180;

  const latRad = latDeg * Math.PI / 180;
  const sinLat = Math.sin(latRad), cosLat = Math.cos(latRad);
  const sinDec = Math.sin(declRad), cosDec = Math.cos(declRad);
  const cosHa = Math.cos(haRad);

  const sinElev = sinLat * sinDec + cosLat * cosDec * cosHa;
  const elevRad = Math.asin(Math.max(-1, Math.min(1, sinElev)));
  const elevDeg = elevRad * 180 / Math.PI;

  let azDegFromNorth = 180;
  if (elevDeg > -89.9 && elevDeg < 89.9) {
    const cosAz = (sinDec - sinLat * sinElev) / (cosLat * Math.cos(elevRad) + 1e-12);
    const clampedCosAz = Math.max(-1, Math.min(1, cosAz));
    let az = Math.acos(clampedCosAz) * 180 / Math.PI;
    if (Math.sin(haRad) > 0) az = 360 - az;
    azDegFromNorth = az;
  }

  const elevRad_ = Math.max(0, elevRad);
  const azNRad = (azDegFromNorth * Math.PI) / 180;
  const sunVecENU = {
    x: Math.cos(elevRad_) * Math.sin(azNRad),
    y: Math.cos(elevRad_) * Math.cos(azNRad),
    z: Math.sin(elevRad_)
  };

  const sDirHorizontal = { x: -sunVecENU.x, y: -sunVecENU.y, z: 0 };
  const magH = Math.hypot(sDirHorizontal.x, sDirHorizontal.y);
  if (magH > 1e-6) {
    sDirHorizontal.x /= magH;
    sDirHorizontal.y /= magH;
  }

  return {
    elevDeg,
    elevRad,
    azDegFromNorth,
    isDay: elevDeg > 0,
    sunVecENU,
    sDirENU: sDirHorizontal,
    shadowLenPerM: elevDeg >= 10.0 ? Math.min(1 / Math.tan(elevRad_), 5.67) : 0
  };
}

function decomposeErbsWorker(ghi, elevation, dayOfYear) {
  const elevRad = Math.max(0.01, elevation * Math.PI / 180);
  const sinAlt = Math.sin(elevRad);
  // [AUD-2026 · D-04] Excentricidad orbital: I0(n) = 1367·(1 + 0,033·cos(360·n/365)).
  const e0 = (typeof dayOfYear === 'number' && isFinite(dayOfYear) && dayOfYear >= 1)
    ? (1 + 0.033 * Math.cos(2 * Math.PI * (dayOfYear - 1) / 365)) : 1;
  const kt = Math.min(1.0, Math.max(0.0, ghi / (SOLAR_CONST * e0 * sinAlt + 1e-3)));
  let DHI_fraction;
  if (kt < 0.22) DHI_fraction = 1.0 - 0.09 * kt;
  else if (kt < 0.80) DHI_fraction = 0.9511 - 0.1604 * kt + 4.388 * kt * kt - 16.638 * Math.pow(kt, 3) + 12.336 * Math.pow(kt, 4);
  else DHI_fraction = 0.165;
  const dhi = ghi * DHI_fraction;
  const dni = Math.max(0, (ghi - dhi) / sinAlt);
  return { dhi, dni, kt };
}

// ── 3. EJECUCIÓN PRINCIPAL DEL SIMULADOR ────────────────────────────────────

self.onmessage = function(e) {
  const data = e.data;
  if (!data || data.type !== 'START_HEATMAP') return;

  const {
    simGenerationId,
    lat,
    lng,
    resolution,
    panels,
    faldones,
    climaticZone,
    moduleProps
  } = data;

  let monthsDoy = [15, 45, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349];
  let monthDaysW = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let hours = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];

  if (resolution === 'medium') {
    monthsDoy = [15, 74, 135, 196, 258, 319];
    monthDaysW = [59, 61, 61, 62, 61, 61];
    hours = [7, 9, 11, 13, 15, 17, 19];
  } else if (resolution === 'fast') {
    monthsDoy = [45, 135, 227, 319];
    monthDaysW = [90, 92, 92, 91];
    hours = [8, 11, 14, 17];
  }

  const hourStepDt = (hours.length > 1) ? (hours[hours.length - 1] - hours[0]) / (hours.length - 1) : 1.0;
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

  const totalSteps = monthsDoy.length * hours.length;
  let currentStep = 0;

  const noctModule = moduleProps.noct || 45;
  const gammaCoeff = moduleProps.gammaCoeff || -0.0034;
  const isBifacial = moduleProps.isBifacial || false;
  const bifacialityFactor = moduleProps.bifacialityFactor || 0.75;

  for (let mIdx = 0; mIdx < monthsDoy.length; mIdx++) {
    const m = monthsReal[mIdx];
    const tAmbMonth = (_T_AMB_TABLE[climaticZone] || _T_AMB_TABLE.interior)[m];
    const GHI_daily_Wh = 4600 * (1 + 0.32 * Math.sin((m - 2) * Math.PI / 6));

    const _gammaM = (2 * Math.PI / 365) * (monthsDoy[mIdx] - 1);
    const _EtM = 229.18 * (0.000075 + 0.001868 * Math.cos(_gammaM) - 0.032077 * Math.sin(_gammaM)
      - 0.014615 * Math.cos(2 * _gammaM) - 0.040849 * Math.sin(2 * _gammaM));

    let _sinAltSum = 0;
    for (let _hs = 0; _hs < hours.length; _hs++) {
      const _utcPre = hours[_hs] - (4 * lng + _EtM) / 60;
      const _spPre = computeSolarPositionWorker(lat, lng, monthsDoy[mIdx], _utcPre);
      if (_spPre && _spPre.isDay && _spPre.elevDeg > 0.0) {
        _sinAltSum += Math.sin(_spPre.elevDeg * Math.PI / 180);
      }
    }
    if (_sinAltSum <= 0) _sinAltSum = 1;

    for (let hIdx = 0; hIdx < hours.length; hIdx++) {
      const h = hours[hIdx];
      currentStep++;

      const utcHour = h - (4 * lng + _EtM) / 60;
      const sp = computeSolarPositionWorker(lat, lng, monthsDoy[mIdx], utcHour);

      if (!sp || !sp.isDay || sp.elevDeg < 10.0) {
        continue;
      }

      const elevRad = sp.elevRad;
      const sinAlt = Math.sin(elevRad);
      const GHI_instant = Math.max(0, (GHI_daily_Wh / (_sinAltSum * hourStepDt)) * sinAlt);
      const { dhi: G_dhi, dni: G_dni } = decomposeErbsWorker(GHI_instant, sp.elevDeg, monthsDoy[mIdx]);

      // Pre-calcular siluetas de sombra de obstáculos por faldón para esta hora (O(F) en vez de O(N*F))
      const faldonShadowQuads = new Map();
      faldones.forEach((faldon, fIdx) => {
        if (!faldon.obstacles2D || faldon.obstacles2D.length === 0) {
          faldonShadowQuads.set(fIdx, []);
          return;
        }
        const uVec = faldon.uVec || { x: 1, y: 0, z: 0 };
        const vVec = faldon.vVec || { x: 0, y: 1, z: 0 };
        const sDirENU = sp.sDirENU;
        const sU = sDirENU.x * uVec.x + sDirENU.y * uVec.y + sDirENU.z * uVec.z;
        const sV = sDirENU.x * vVec.x + sDirENU.y * vVec.y + sDirENU.z * vVec.z;
        const shadowLen = sp.shadowLenPerM;

        const quads = [];
        faldon.obstacles2D.forEach(obs => {
          const hObs = obs.height || 1.2;
          const dU = sU * shadowLen * hObs;
          const dV = sV * shadowLen * hObs;
          const basePoly = obs.points2D || [];
          if (basePoly.length >= 3) {
            const topPoly = basePoly.map(pt => ({ u: pt.u + dU, v: pt.v + dV }));
            const hull = convexHull2D([...basePoly, ...topPoly]);
            if (hull && hull.length >= 3) {
              quads.push(hull);
            } else {
              for (let i = 0; i < basePoly.length; i++) {
                const next = (i + 1) % basePoly.length;
                quads.push([basePoly[i], basePoly[next], topPoly[next], topPoly[i]]);
              }
            }
          }
        });
        faldonShadowQuads.set(fIdx, quads);
      });

      // Evaluación por panel
      panels.forEach(pData => {
        const res = panelResults.get(pData.id);
        if (!res) return;

        const faldon = faldones[pData.polyIdx] || faldones[0] || {};

        // Proyección de ángulo de incidencia cosTheta
        const pNorm = pData.normalWorld || { x: 0, y: 0, z: 1 };
        const cosTheta = Math.max(0, sp.sunVecENU.x * pNorm.x + sp.sunVecENU.y * pNorm.y + sp.sunVecENU.z * pNorm.z);

        // Modelo Hay-Davies
        const Rb = (sinAlt > 0.05) ? Math.max(0, cosTheta / sinAlt) : 0;
        const Ai = (GHI_instant > 10) ? Math.min(1.0, G_dni * sinAlt / GHI_instant) : 0;
        const tiltRad = (pData.tiltDeg || 20) * Math.PI / 180;
        const fViewSky = (1 + Math.cos(tiltRad)) / 2;
        const fViewGround = (1 - Math.cos(tiltRad)) / 2;

        const G_beam = G_dni * cosTheta;
        const G_diff = G_dhi * (Ai * Rb + (1 - Ai) * fViewSky);
        const G_refl = GHI_instant * 0.20 * fViewGround;
        let G_poa = G_beam + G_diff + G_refl;

        if (isBifacial && bifacialityFactor > 0) {
          G_poa += G_refl * bifacialityFactor;
        }

        // Derating térmico
        const tCell = tAmbMonth + (noctModule - 20) * (G_poa / 800);
        const thermalFactor = Math.max(0.70, 1.0 + gammaCoeff * (tCell - 25));

        // Potencia instantánea específica (W/m² efectiva) modulada por factor térmico
        const instantPotentialW = G_poa * thermalFactor;

        const mw = monthDaysW[mIdx];
        res.annualTotalPotential += instantPotentialW * mw * hourStepDt;

        // Evaluación de sombreado
        let isShaded = false;
        let shadedSubstringsCount = 0;

        const shadowQuads = faldonShadowQuads.get(pData.polyIdx) || [];
        const panelPoly = (pData.poly2D && pData.poly2D.length >= 3) ? pData.poly2D : [
          { u: pData.u - (pData.w || 1.05) / 2, v: pData.v - (pData.h || 2.15) / 2 },
          { u: pData.u + (pData.w || 1.05) / 2, v: pData.v - (pData.h || 2.15) / 2 },
          { u: pData.u + (pData.w || 1.05) / 2, v: pData.v + (pData.h || 2.15) / 2 },
          { u: pData.u - (pData.w || 1.05) / 2, v: pData.v + (pData.h || 2.15) / 2 }
        ];

        if (shadowQuads.length > 0 && panelPoly && panelPoly.length >= 3) {
          // Bounding box del panel
          let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
          panelPoly.forEach(pt => {
            if (pt.u < uMin) uMin = pt.u;
            if (pt.u > uMax) uMax = pt.u;
            if (pt.v < vMin) vMin = pt.v;
            if (pt.v > vMax) vMax = pt.v;
          });

          const subStrings = (panelPoly.length === 4)
            ? dividePanelIntoSubstrings2D(panelPoly)
            : [panelPoly];
          const subShaded = new Array(subStrings.length).fill(false);

          for (const quad of shadowQuads) {
            let qUMin = Infinity, qUMax = -Infinity, qVMin = Infinity, qVMax = -Infinity;
            for (let qi = 0; qi < quad.length; qi++) {
              const qpt = quad[qi];
              if (qpt.u < qUMin) qUMin = qpt.u;
              if (qpt.u > qUMax) qUMax = qpt.u;
              if (qpt.v < qVMin) qVMin = qpt.v;
              if (qpt.v > qVMax) qVMax = qpt.v;
            }
            if (uMax < qUMin || uMin > qUMax || vMax < qVMin || vMin > qVMax) continue;

            for (let sIdx = 0; sIdx < subStrings.length; sIdx++) {
              if (!subShaded[sIdx] && polygonsIntersect2D(subStrings[sIdx], quad)) {
                subShaded[sIdx] = true;
              }
            }
            if (subShaded.every(s => s)) break;
          }

          shadedSubstringsCount = subShaded.filter(Boolean).length;
          if (shadedSubstringsCount > 0) isShaded = true;
        }

        const beamShadedFraction = (shadedSubstringsCount > 0)
          ? (shadedSubstringsCount / 3.0)
          : (isShaded ? 1.0 : 0.0);

        if (isShaded && beamShadedFraction > 0) {
          res.shadowHits += mw * hourStepDt;
          res.activeDiodesHits += shadedSubstringsCount * mw * hourStepDt;
          const instantLossW = instantPotentialW * beamShadedFraction;
          res.annualShadedLoss += instantLossW * mw * hourStepDt;
        }

        const effectiveLossW = (isShaded && beamShadedFraction > 0) ? (instantPotentialW * beamShadedFraction) : 0;
        _monthlyNetWh[m] += (instantPotentialW - effectiveLossW) * mw * hourStepDt;
      });
    }

    // Progreso mensual
    const progressPct = Math.min(100, Math.round((currentStep / totalSteps) * 100));
    self.postMessage({
      type: 'PROGRESS',
      simGenerationId,
      progressPct,
      mIdx,
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
