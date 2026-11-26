/**
 * ============================================================================
 * ☀️ MOTOR DE FÍSICA SOLAR Y ALGORITMOS ASTRONÓMICOS AAA — PROYECTO RA
 * ============================================================================
 * Módulo independiente desacoplado para cálculos astronómicos de alta precisión,
 * modelos de radiación (Perez/Hay-Davies), sombras en cubierta e inter-filas.
 * Normativa: CTE DB-HE5 (2022) · REBT ITC-BT-40 · UNE-EN 61724-1 · UNE-HD 60364-5-52
 */
(function(global) {
  'use strict';

  const SOLAR_ENGINE_CONSTANTS = Object.freeze({
    RHO_CU_20: 0.017241,
    ALPHA_CU: 0.00393,
    RHO_CU_90: 0.023,    // [P1] valor unificado del proyecto (antes 0.02244; AGENTS.md §8)
    RHO_AL_90: 0.03620,
    G_STC: 1000,
    T_STC: 25,
    T_MIN_SPAIN: -10,
    T_AMB_MAX_SPAIN: 40,
    CO2_FACTOR_SPAIN: 0.259
  });
  const GE_EPSILON = 1e-6;

  // SSOT de física solar y constantes climáticas: delega en js/radiation-engine.js (cargado antes en index.html)
  function _getRad() {
    return (typeof global !== 'undefined' && global.RA && global.RA.Radiation) ? global.RA.Radiation : null;
  }
  const SOLAR_CONST = (_getRad() && _getRad().SOLAR_CONST_WM2) || 1367;
  const MONTH_DAYS_SIM = (_getRad() && _getRad().MONTH_DAYS) || [31,28,31,30,31,30,31,31,30,31,30,31];
  const T_AMB_MONTHLY_ESP = (_getRad() && _getRad().T_AMB_MONTHLY_ESP) || {
    interior: [5.0, 7.0, 10.0, 12.0, 17.0, 23.0, 27.0, 27.0, 22.0, 15.0, 9.0, 5.0]
  };
  const PVGIS_PROXIES = {
    allorigins: 'https://api.allorigins.win/raw?url=',
    codetabs: 'https://api.codetabs.com/v1/proxy?quest=',
    corsproxy: 'https://corsproxy.io/?url='
  };
  function getShadingStrategy() { return _seShadingStrategy; }
  let _seShadingStrategy = 'mlpe';

function degToRad(deg) { return deg * Math.PI / 180; }

function radToDeg(rad) { return rad * 180 / Math.PI; }

function normalizeAzimuth(angle) { return ((angle % 360) + 360) % 360; }

function clampGE(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function v3(x, y, z) { return { x, y, z }; }

function v3Sub(a, b) { return v3(a.x - b.x, a.y - b.y, a.z - b.z); }

function v3Scale(a, s) { return v3(a.x * s, a.y * s, a.z * s); }

function v3Dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }

function v3Cross(a, b) { return v3(a.y*b.z - a.z*b.y, a.z*b.x - a.x*b.z, a.x*b.y - a.y*b.x); }

function v3Len(a) { return Math.sqrt(v3Dot(a, a)); }

function v3Norm(a) { const l = v3Len(a); return l > GE_EPSILON ? v3Scale(a, 1/l) : v3(0,0,0); }

function normalFromTiltAzimuth(tiltDeg, azimuthDeg) {
  const beta = degToRad(tiltDeg);
  const gamma = degToRad(azimuthDeg);
  return v3Norm(v3(
    Math.sin(beta) * Math.sin(gamma),
    Math.sin(beta) * Math.cos(gamma),
    Math.cos(beta)
  ));
}

function planeNormalFromThreePoints(P1, P2, P3) {
  const a = v3Sub(P2, P1);
  const b = v3Sub(P3, P1);
  const n = v3Norm(v3Cross(a, b));
  return n.z < 0 ? v3Scale(n, -1) : n;
}

function slopeFromNormal(n) {
  return radToDeg(Math.acos(clampGE(Math.abs(n.z), 0, 1)));
}

function slopeFromThreePoints(P1, P2, P3) {
  return slopeFromNormal(planeNormalFromThreePoints(P1, P2, P3));
}

function azimuthFromNormal(n) {
  let nn = n;
  if (nn.z < 0) nn = v3Scale(nn, -1);
  const beta = Math.sqrt(nn.x * nn.x + nn.y * nn.y);
  if (beta < GE_EPSILON) return 0; // plano horizontal
  return normalizeAzimuth(radToDeg(Math.atan2(nn.x, nn.y)));
}

function azimuthFromLine(P1, P2) {
  const dE = P2.x - P1.x;
  const dN = P2.y - P1.y;
  return normalizeAzimuth(radToDeg(Math.atan2(dE, dN)));
}

function getDayOfYear(date) {
  const d = date || new Date();
  const start = new Date(d.getFullYear(), 0, 0);
  const diff = d - start + ((start.getTimezoneOffset() - d.getTimezoneOffset()) * 60000);
  return Math.floor(diff / 86400000);
}

function solarAzimuthAtan2(latDeg, declDeg, haDeg) {
  const rad = _getRad();
  if (rad && typeof rad.solarAzimuthAtan2 === 'function') {
    return rad.solarAzimuthAtan2(latDeg, declDeg, haDeg);
  }
  throw new Error('Módulo RA.Radiation no cargado');
}

function sunVector(elevationDeg, azimuthDeg) {
  const alpha = degToRad(elevationDeg);
  const A = degToRad(azimuthDeg);
  return v3(
    Math.cos(alpha) * Math.sin(A),
    Math.cos(alpha) * Math.cos(A),
    Math.sin(alpha)
  );
}

function solarPosition(latDeg, declDeg, haDeg) {
  const alt = solarAltitude(latDeg, declDeg, haDeg);
  const az = solarAzimuthAtan2(latDeg, declDeg, haDeg);
  return { elevationDeg: alt, azimuthDeg: az, sunVector: sunVector(alt, az) };
}

function incidenceAngle(roofNormal, sunVec) {
  const cosTheta = clampGE(v3Dot(v3Norm(roofNormal), v3Norm(sunVec)), -1, 1);
  return { cosTheta, thetaDeg: radToDeg(Math.acos(cosTheta)) };
}

function moduleProjectedSize(lengthM, widthM, deltaTiltDeg) {
  const k = Math.cos(degToRad(deltaTiltDeg));
  return { projectedLengthM: lengthM * k, projectedWidthM: widthM };
}

function rowSpacing(moduleLengthM, moduleTiltDeg, solarElevationDeg, safetyMarginM) {
  const moduleHeight = moduleLengthM * Math.sin(degToRad(moduleTiltDeg));
  const shadowLength = moduleHeight / Math.max(Math.tan(degToRad(solarElevationDeg)), GE_EPSILON);
  return moduleLengthM * Math.cos(degToRad(moduleTiltDeg)) + shadowLength + (safetyMarginM || 0);
}

function gapBetweenRows(rowSpacingM, projectedModuleDepthM) {
  return rowSpacingM - projectedModuleDepthM;
}

function computeInterRowPitch(params = {}) {
  const modLen = params.moduleLength || 2.20;
  const tiltDeg = params.tiltDeg !== undefined ? params.tiltDeg : 30.0;
  const azDeg = params.azimuthDeg !== undefined ? params.azimuthDeg : 180.0;
  const lat = params.latitude !== undefined ? params.latitude : 40.41;
  const margin = params.safetyMarginM !== undefined ? params.safetyMarginM : 0.10;
  const useCTEWindow = params.useCTEWindow !== false; // CTE DB-HE5 / IDAE ventana 4h solsticio invierno (10:00 - 14:00 solar)

  const declinationWinter = -23.45;
  const declRad = degToRad(declinationWinter);
  const latRad = degToRad(lat);

  // 1. Elevación solar a mediodía (12:00 solar)
  const solarElevationNoon = Math.max(5.0, 90.0 - Math.abs(lat) + declinationWinter);

  // 2. Cálculo según normativa CTE DB-HE5 e IDAE:
  // Se dimensiona la distancia inter-filas para garantizar al menos 4 horas libres de sombra
  // centradas en el mediodía solar (de 10:00 a 14:00 hora solar, ángulo horario omega = ±30°)
  // en el día más desfavorable del año (Solsticio de invierno, 21 de diciembre).
  let solarElevationDesign = solarElevationNoon;
  let shadowFactor = 1.0 / Math.max(Math.tan(degToRad(solarElevationNoon)), GE_EPSILON);

  if (useCTEWindow) {
    const omegaRad = degToRad(30.0); // 2 horas antes/después del mediodía solar (10:00 ó 14:00)
    const sinAlpha = Math.sin(latRad) * Math.sin(declRad) + Math.cos(latRad) * Math.cos(declRad) * Math.cos(omegaRad);
    const alphaRad = Math.asin(Math.max(-1, Math.min(1, sinAlpha)));
    const alphaDeg = radToDeg(alphaRad);
    solarElevationDesign = Math.max(5.0, alphaDeg);

    // Azimut solar en la ventana de las 10:00 / 14:00:
    // cos(delta_gamma) = (sin(alpha) * sin(lat) - sin(decl)) / (cos(alpha) * cos(lat))
    const cosDeltaGamma = (sinAlpha * Math.sin(latRad) - Math.sin(declRad)) / Math.max(Math.cos(alphaRad) * Math.cos(latRad), GE_EPSILON);
    const deltaGammaRad = Math.acos(Math.max(-1, Math.min(1, cosDeltaGamma))); // Desviación del sol respecto al Sur (~±29.3° en España)

    // Desviación entre la orientación de los paneles y el sol
    const azPanelDevRad = degToRad(Math.abs(azDeg - 180.0));
    const effectiveAngleRad = Math.abs(deltaGammaRad - azPanelDevRad);
    const cosProjection = Math.max(0.20, Math.cos(effectiveAngleRad));

    // Distancia perpendicular mínima según fórmula canónica CTE / IDAE: d = h * cos(delta_gamma) / tan(alpha)
    shadowFactor = cosProjection / Math.max(Math.tan(alphaRad), GE_EPSILON);
  }

  const modHeight = modLen * Math.sin(degToRad(tiltDeg));
  const modProjWidth = modLen * Math.cos(degToRad(tiltDeg));

  const shadowLen = modHeight * shadowFactor;
  const totalPitch = modProjWidth + shadowLen + margin;
  const clearSpacing = shadowLen + margin;
  const selfCleaningWarning = (tiltDeg < 10.0);

  return {
    moduleLengthM: modLen,
    tiltDeg: tiltDeg,
    solarElevationWinterDeg: parseFloat(solarElevationDesign.toFixed(1)),
    solarElevationNoonDeg: parseFloat(solarElevationNoon.toFixed(1)),
    moduleHeightM: parseFloat(modHeight.toFixed(3)),
    projectedWidthM: parseFloat(modProjWidth.toFixed(3)),
    shadowLengthM: parseFloat(shadowLen.toFixed(3)),
    clearSpacingM: parseFloat(clearSpacing.toFixed(3)),
    totalPitchM: parseFloat(totalPitch.toFixed(3)),
    standard: useCTEWindow ? 'CTE DB-HE5 / IDAE (Ventana 4h Solsticio Invierno 10:00-14:00)' : 'Solsticio Mediodía Solar',
    selfCleaningWarning: selfCleaningWarning,
    warningMsg: selfCleaningWarning ? '⚠️ Inclinación < 10°: Riesgo de sedimentación de polvo, acumulación de fango y puntos calientes (hot spots). Se recomienda mínimo 10° salvo coplanar.' : null
  };
}

function computeTiltYieldCurve(lat, lon, azimuthDeg) {
  const latitude = lat !== undefined ? lat : 40.41;
  const az = azimuthDeg !== undefined ? azimuthDeg : 180.0;
  const optimalTilt = Math.round(3.7 + 0.69 * Math.abs(latitude));

  const samples = [];
  for (let beta = 0; beta <= 60; beta += 2) {
    const deltaBeta = beta - optimalTilt;
    const deltaAz = (az - 180.0);
    const lossPct = Math.min(45.0, (0.016 * Math.pow(deltaBeta, 2)) + (0.004 * Math.pow(deltaAz, 2)));
    const relYield = Math.max(55.0, 100.0 - lossPct);
    samples.push({ tiltDeg: beta, relativeYieldPct: parseFloat(relYield.toFixed(1)) });
  }

  const maxDensityTilt = 12.0;
  const maxDensityLoss = Math.min(45.0, 0.016 * Math.pow(maxDensityTilt - optimalTilt, 2));

  return {
    latitude: latitude,
    azimuthDeg: az,
    optimalTilt: optimalTilt,
    curve: samples,
    presets: {
      max_annual: { tiltDeg: optimalTilt, relativeYieldPct: 100.0, description: 'Máxima generación anual (kWh/kWp óptimo)' },
      max_density: { tiltDeg: maxDensityTilt, relativeYieldPct: parseFloat((100.0 - maxDensityLoss).toFixed(1)), description: 'Máxima potencia en cubierta (mínimo lastre y menor separación)' },
      east_west_dome: { tiltDeg: 10.0, relativeYieldPct: 91.5, description: 'Configuración Este-Oeste (curva diurna simétrica y aplanada)' },
      coplanar: { tiltDeg: 0.0, relativeYieldPct: 88.0, description: 'Coplanar adosado a faldón' }
    }
  };
}

function obstacleShadowLength(heightM, solarElevationDeg) {
  if (solarElevationDeg < 0.5) return 0;
  const tanElev = Math.tan(degToRad(solarElevationDeg));
  // Acotado a ratio máximo 5.67 (CTE DB-HE5 / elevación útil >= 10°) para evitar sombras de 300m al amanecer/atardecer
  const shadowRatio = Math.min(1.0 / Math.max(tanElev, GE_EPSILON), 5.67);
  return heightM * shadowRatio;
}

function obstacleShadowVector(heightM, solarElevationDeg, solarAzimuthDeg) {
  const len = obstacleShadowLength(heightM, solarElevationDeg);
  const az = normalizeAzimuth(solarAzimuthDeg + 180);
  return { x: len * Math.sin(degToRad(az)), y: len * Math.cos(degToRad(az)), length: len };
}

function projectShadowPolygon(obstaclePolygon, sunVec, roofNormal, roofPoint) {
  const n = v3Norm(roofNormal);
  const d = -v3Dot(n, roofPoint);
  const denom = v3Dot(n, sunVec);
  if (Math.abs(denom) < GE_EPSILON) return null;
  return obstaclePolygon.map(P => {
    const t = (v3Dot(n, P) + d) / denom;
    return v3Sub(P, v3Scale(sunVec, t));
  });
}

function rayHitsAABB(origin, dir, minP, maxP) {
  let tmin = -Infinity, tmax = Infinity;
  const axes = ['x', 'y', 'z'];
  for (let i = 0; i < 3; i++) {
    const a = axes[i];
    if (Math.abs(dir[a]) < GE_EPSILON) {
      if (origin[a] < minP[a] || origin[a] > maxP[a]) return false;
    } else {
      let t1 = (minP[a] - origin[a]) / dir[a];
      let t2 = (maxP[a] - origin[a]) / dir[a];
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return false;
    }
  }
  return tmax >= 0;
}

function rayCastingIsShaded(modulePoint, sunVec, obstacleBoxes) {
  const dir = v3Norm(sunVec); // rayo trazado desde el panel hacia el Sol
  for (const box of obstacleBoxes) {
    if (rayHitsAABB(modulePoint, dir, box.min, box.max)) return true;
  }
  return false;
}

function computeHighPrecisionSolarPosition(latDeg, lonDeg, doy, solarDecimalHour, isUtc = true) {
  const rad = _getRad();
  if (rad && typeof rad.computeSolarPosition === 'function') {
    return rad.computeSolarPosition(latDeg, lonDeg, doy, solarDecimalHour, isUtc);
  }
  throw new Error('Módulo RA.Radiation no cargado');
}

function computePOAIrradiance(G_ghi, latDeg, tiltDeg, azSurDeg, sunElevDeg, sunAzSurDeg, albedo = 0.20, dayOfYear = null) {
  const rad = _getRad();
  if (rad && typeof rad.poa === 'function') {
    return rad.poa(G_ghi, latDeg, tiltDeg, azSurDeg, sunElevDeg, sunAzSurDeg, albedo, dayOfYear);
  }
  throw new Error('Módulo RA.Radiation no cargado');
}

function computeCellTemperature(T_amb, G_poa, isRoofMounted = true, windSpeed = 1.5) {
  const u0 = isRoofMounted ? 26.0 : 29.0;
  const u1 = isRoofMounted ? 1.3 : 1.5;
  const eta_stc = 0.215;
  const safeWind = Math.max(0, Number.isFinite(windSpeed) ? windSpeed : 1.5);
  const denom = Math.max(10.0, u0 + u1 * safeWind);
  const safeG = (Number.isFinite(G_poa) && G_poa > 0) ? Math.min(1500, G_poa) : 0;
  const safeTamb = Number.isFinite(T_amb) ? T_amb : 25;
  const tCell = safeTamb + (safeG / denom) * (1 - eta_stc / 0.9);
  return Math.max(-20, Math.min(95, tCell));
}

function solarDeclination(dayOfYear, solarDecimalHour) {
  const rad = _getRad();
  if (rad && typeof rad.solarDeclination === 'function') {
    return rad.solarDeclination(dayOfYear, solarDecimalHour);
  }
  throw new Error('Módulo RA.Radiation no cargado');
}

function hourAngle(hourSolar) {
  const rad = _getRad();
  if (rad && typeof rad.hourAngle === 'function') {
    return rad.hourAngle(hourSolar);
  }
  return 15 * (hourSolar - 12);
}

function solarAltitude(latDeg, declDeg, haDeg) {
  const rad = _getRad();
  if (rad && typeof rad.solarAltitude === 'function') {
    return rad.solarAltitude(latDeg, declDeg, haDeg);
  }
  throw new Error('Módulo RA.Radiation no cargado');
}

function solarAzimuth(latDeg, declDeg, haDeg, altDeg) {
  const lat = latDeg * Math.PI / 180;
  const decl = declDeg * Math.PI / 180;
  const ha = haDeg * Math.PI / 180;
  const alt = altDeg * Math.PI / 180;
  const denom = Math.cos(alt) * Math.cos(lat);
  if (Math.abs(denom) < 1e-4) return (ha > 0 ? 270 : 90);
  let cosAz = (Math.sin(decl) - Math.sin(alt)*Math.sin(lat)) / denom;
  cosAz = Math.max(Math.min(cosAz, 1), -1);
  let az = Math.acos(cosAz) * 180 / Math.PI;
  if (ha > 0) az = 360 - az;
  return az;
}

function calcPOA(GHI, DHI, latDeg, tiltDeg, azimutPanelDeg, dayOfYear, hourSolar, azimuthConvention) {
  if (GHI <= 0) return 0;
  const _radMod = _getRad();
  if (!_radMod || typeof _radMod.poa !== 'function') {
    throw new Error('Módulo RA.Radiation no cargado');
  }
  const panelAzSur = _radMod.normalizePanelAzSur(azimutPanelDeg, azimuthConvention || 'auto');
  const decl = _radMod.solarDeclination(dayOfYear, hourSolar);
  const ha = _radMod.hourAngle(hourSolar);
  const altDeg = _radMod.solarAltitude(latDeg, decl, ha);
  if (altDeg <= 0) return 0;
  const azFromNorth = _radMod.solarAzimuthAtan2(latDeg, decl, ha);
  const sunAzSur = azFromNorth - 180;
  const explicitDhi = (typeof DHI === 'number' && Number.isFinite(DHI) && DHI >= 0) ? DHI : undefined;
  return _radMod.poa(GHI, latDeg, tiltDeg, panelAzSur, altDeg, sunAzSur, 0.20, dayOfYear, explicitDhi).G_poa;
}

function calcIAM(cosTheta) {
  const b0 = 0.05;
  if (cosTheta <= 0) return 0;
  const theta = Math.acos(Math.min(cosTheta, 1));
  return Math.max(1 - b0 * (1 / Math.cos(theta) - 1), 0);
}

function calcTcell(Tamb, GPOA, NOCT=45) {
  const safeG = (Number.isFinite(GPOA) && GPOA > 0) ? Math.min(1500, GPOA) : 0;
  const safeTamb = Number.isFinite(Tamb) ? Tamb : 25;
  const tCell = safeTamb + (NOCT - 20) * safeG / 800;
  return Math.max(-20, Math.min(95, tCell));
}

function calcPpanel(Pstc, GPOA, Tcell, gamma=-0.0034) {
  if (!Number.isFinite(GPOA) || GPOA <= 10) return 0;
  const safeT = Number.isFinite(Tcell) ? Tcell : 25;
  const kT = Math.max(0.65, Math.min(1.20, 1 + gamma * (safeT - 25)));
  const kG = Math.min(1.5, GPOA / 1000);
  return Math.max(Pstc * kG * kT, 0);
}

function invEfficiency(loadFraction) {
  if (loadFraction <= 0) return 0;
  const eta_max = 0.975;
  const p_th = 0.01;
  const k = 0.035;
  return Math.min(eta_max * loadFraction / (loadFraction + p_th + k * loadFraction * loadFraction), 0.98);
}

function getClimaticZone(latDeg, lonDeg) {
  if (latDeg < 30) return 'canarias';
  if (lonDeg > -2 && latDeg < 42) return 'costal_med';
  if (lonDeg > -5 && latDeg < 40) return 'interior';
  return 'atlantico';
}

function estimateMonthlyGHI(latDeg, monthIdx) {
  const rad = _getRad();
  if (rad && typeof rad.estimateMonthlyGHI === 'function') {
    return rad.estimateMonthlyGHI(latDeg, monthIdx);
  }
  throw new Error('Módulo RA.Radiation no cargado');
}

/**
 * Resuelve la radiación GHI diaria (Wh/m²/día) priorizando:
 * 1. Lista mensual explícita (p. ej. NASA POWER o PVGIS en ejecución activa).
 * 2. Caché local persistente de NASA POWER (30 días de validez offline).
 * 3. Fallback al modelo sintético Kt estático por latitud.
 */
function getRobustMonthlyGHI(latDeg, lonDeg, monthIdx, customGHIList) {
  if (Array.isArray(customGHIList) && customGHIList.length === 12 && typeof customGHIList[monthIdx] === 'number' && customGHIList[monthIdx] > 0) {
    const val = customGHIList[monthIdx];
    return val < 25 ? val * 1000 : val; // Convierte de kWh/m²/día a Wh/m²/día si viene en kWh
  }
  try {
    if (typeof localStorage !== 'undefined') {
      const cacheKey = `ra_nasa_ghi_${Number(latDeg).toFixed(2)}_${Number(lonDeg).toFixed(2)}`;
      const item = localStorage.getItem(cacheKey);
      if (item) {
        const parsed = JSON.parse(item);
        if (parsed && Array.isArray(parsed.data) && typeof parsed.data[monthIdx] === 'number') {
          const val = parsed.data[monthIdx];
          return val < 25 ? val * 1000 : val;
        }
      }
    }
  } catch(e) {}
  return estimateMonthlyGHI(latDeg, monthIdx);
}

function runPhysicalModel(kwp, latDeg, lonDeg, tiltDeg, azimutDeg, cfg, customMonthlyGHI) {
  // Clipping: techo de potencia AC en el inversor (cfg.pAcNominalW). Sin esto, los
  // ratios DC/AC > 1.2 sobrestiman la producción en horas de sol pleno.
  const pAcNominal = (cfg && cfg.pAcNominalW > 0) ? cfg.pAcNominalW : 0;
  const zone = getClimaticZone(latDeg, lonDeg);
  const tAmb = T_AMB_MONTHLY_ESP[zone];
  const gamma = cfg && cfg.tecnologia && cfg.tecnologia.includes('N-Type') ? -0.0028 : -0.0034;
  const NOCT = 45;
  const Pstc = (cfg && cfg.potencia) || 450;
  const targetGHIList = (cfg && cfg.monthlyGHI) || customMonthlyGHI || null;

  // System losses (cascade)
  // Árbol de pérdidas configurable (Paso 4 · ventana Pérdidas del Sistema)
  const _lc = (typeof window !== 'undefined' && window.solarLossConfig) ? window.solarLossConfig : null;
  const loss_wiring   = (_lc && typeof _lc.wiring === 'number') ? _lc.wiring : 0.015;
  const loss_mismatch = (_lc && typeof _lc.mismatch === 'number') ? _lc.mismatch : 0.020;
  const loss_soiling  = (_lc && typeof _lc.soiling === 'number') ? _lc.soiling : 0.025;
  const loss_avail    = (_lc && typeof _lc.availability === 'number') ? _lc.availability : 0.005;
  let monthlyYields = [];
  let totalAnnualWh = 0;
  let totalTempLoss = 0, totalIAMLoss = 0, totalSoilingLoss = 0, totalWiringLoss = 0, totalMismatchLoss = 0, totalInvLoss = 0, totalAvailLoss = 0;
  let totalGPOA = 0, totalGPOA_raw = 0, totalGSTC = 0;
  let totalClippedWh = 0;

  const midDay = [17,47,75,105,135,162,198,228,258,288,318,344]; // representative day of each month

  let usedNasaCache = false;
  for (let m = 0; m < 12; m++) {
    const doy = midDay[m];
    const nDays = MONTH_DAYS_SIM[m];
    const GHI_monthly = getRobustMonthlyGHI(latDeg, lonDeg, m, targetGHIList);
    if (!targetGHIList && typeof localStorage !== 'undefined') {
      try {
        if (localStorage.getItem(`ra_nasa_ghi_${Number(latDeg).toFixed(2)}_${Number(lonDeg).toFixed(2)}`)) {
          usedNasaCache = true;
        }
      } catch(e) {}
    }
    const decl = solarDeclination(doy);

    let monthlyWh = 0;
    let mTempLoss = 0, mIAMLoss = 0;

    // Simplified hourly integration using sine approximation for month
    const wsArg = Math.max(-1, Math.min(1, -Math.tan(latDeg * Math.PI / 180) * Math.tan(decl * Math.PI / 180)));
    const sunriseHour = 12 - (Math.acos(wsArg) * 180 / Math.PI) / 15;
    const sunsetHour = 24 - sunriseHour;

    // Normalización de la curva de insolación diaria: integral horaria = GHI_monthly
    let sinAltSum = 0;
    for (let h = Math.floor(sunriseHour); h <= Math.ceil(sunsetHour); h++) {
      const alt = solarAltitude(latDeg, decl, hourAngle(h));
      if (alt > 0) sinAltSum += Math.sin(alt * Math.PI / 180);
    }
    if (sinAltSum <= 0) sinAltSum = 1;

    for (let h = Math.floor(sunriseHour); h <= Math.ceil(sunsetHour); h++) {
      const ha = hourAngle(h);
      const altDeg = solarAltitude(latDeg, decl, ha);
      if (altDeg <= 0) continue;

      const sinAlt = Math.sin(altDeg * Math.PI / 180);
      // GHI_monthly está en Wh/m²/día. Distribución normalizada para que la suma horaria sea exactamente GHI_monthly:
      const GHI_instant = Math.max(0, (GHI_monthly / sinAltSum) * sinAlt); // W/m²

      // [B2] Motor único de radiación (Erbs + Hay-Davies). Geometría del azimut solar desde el Sur.
      const azFromNorth = solarAzimuthAtan2(latDeg, decl, ha);
      // Compass (0°=N, 180°=S) → convención Sur del motor (0°=S, -90°=E, +90°=O). Rango [-180,180).
      const azSur = azFromNorth - 180;
      const _radModRM = (typeof global !== 'undefined' && global.RA && global.RA.Radiation) ? global.RA.Radiation : null;
      const azSurModule = (_radModRM && typeof _radModRM.normalizePanelAzSur === 'function')
        ? _radModRM.normalizePanelAzSur(azimutDeg, (cfg && cfg.azimuthConvention) || 'auto')
        : ((azimutDeg > 90 && azimutDeg <= 360) ? (((azimutDeg - 180) % 360 + 540) % 360 - 180) : (azimutDeg || 0));
      const poa = computePOAIrradiance(GHI_instant, latDeg, tiltDeg, azSurModule, altDeg, azSur, 0.20, doy);
      const GPOA = poa.G_poa;
      const GPOA_raw = (typeof poa.G_poa_raw === 'number') ? poa.G_poa_raw : GPOA;
      const iamFactor = poa.iamFactor;
      // [F2-02] Perfil térmico diurno + modelo Faiman (computeCellTemperature) diferenciando coplanar vs open-rack
      const tAmbHour = tAmb[m] + 5.0 * Math.sin(((h - 9.0) / 24.0) * 2 * Math.PI);
      const isCoplanarMount = !(cfg && (cfg.mountingType === 'open_rack' || cfg.mountingType === 'elevada' || cfg.mountingType === 'pergola'));
      const windSpeedEst = (cfg && typeof cfg.avgWindSpeedMs === 'number' && cfg.avgWindSpeedMs > 0) ? cfg.avgWindSpeedMs : 2.2;
      const Tcell = (typeof computeCellTemperature === 'function')
        ? computeCellTemperature(tAmbHour, GPOA, isCoplanarMount, windSpeedEst)
        : calcTcell(tAmbHour, GPOA, NOCT);

      const P_raw = calcPpanel(Pstc * kwp * 1000 / Pstc, GPOA, Tcell, gamma);
      const tempLossW = calcPpanel(Pstc * kwp * 1000 / Pstc, GPOA, 25, gamma) - P_raw;
      const iamLossW = Math.max(0, calcPpanel(Pstc * kwp * 1000 / Pstc, GPOA_raw, Tcell, gamma) - P_raw);

      const loadFrac = P_raw / (pAcNominal > 0 ? pAcNominal * 1.1 : kwp * 1000 * 1.1);
      const eta_inv = invEfficiency(loadFrac);
      const P_dc_net = P_raw * (1 - loss_wiring) * (1 - loss_mismatch) * (1 - loss_soiling) * (1 - loss_avail);
      let P_ac = P_dc_net * eta_inv;
      const invLossW = Math.max(0, P_dc_net - P_ac);
      if (pAcNominal > 0 && P_ac > pAcNominal) {
        totalClippedWh += P_ac - pAcNominal;
        P_ac = pAcNominal;
      }

      monthlyWh += P_ac;
      totalGPOA += GPOA * nDays;
      totalGPOA_raw += GPOA_raw * nDays;
      totalGSTC += 1000 * nDays;
      if (GHI_instant > 10) {
        mTempLoss += tempLossW;
        mIAMLoss += iamLossW;
        totalWiringLoss += P_raw * loss_wiring * nDays;
        totalMismatchLoss += P_raw * (1 - loss_wiring) * loss_mismatch * nDays;
        totalSoilingLoss += P_raw * (1 - loss_wiring) * (1 - loss_mismatch) * loss_soiling * nDays;
        totalAvailLoss += P_raw * (1 - loss_wiring) * (1 - loss_mismatch) * (1 - loss_soiling) * loss_avail * nDays;
        totalInvLoss += invLossW * nDays;
      }
    }

    const monthlyKWh = monthlyWh * nDays / 1000;
    monthlyYields.push(Math.round(monthlyKWh));
    totalAnnualWh += monthlyWh * nDays;
    totalTempLoss += mTempLoss * nDays;
    totalIAMLoss += mIAMLoss * nDays;
  }

  const annualKWh = totalAnnualWh / 1000;
  const PR = annualKWh / (kwp * (totalGPOA / 1000 + 0.001));

  // Cascade losses reales en kWh (base = energía ideal sin pérdidas sobre POA bruto)
  const poaIdealKWh = kwp * (totalGPOA_raw / 1000);
  const cascadeLosses = {
    stc: Math.round(poaIdealKWh),
    irrad: 0,
    temp: -Math.round(totalTempLoss / 1000),
    iam: -Math.round(totalIAMLoss / 1000),
    shading: 0,
    soiling: -Math.round(totalSoilingLoss / 1000),
    mismatch: -Math.round(totalMismatchLoss / 1000),
    wiring: -Math.round(totalWiringLoss / 1000),
    inverter: -Math.round((totalInvLoss + totalClippedWh + totalAvailLoss) / 1000),
    net: Math.round(annualKWh)
  };

  // [AUD-2026 · D-03] El PR es un indicador de salud: no se recorta en silencio.
  // Antes se publicaba siempre entre 0,60 y 0,90, ocultando diseños malos (0,52) o
  // datos incoherentes (0,95). Ahora se devuelve el valor real y un aviso explícito.
  const prRaw = Number.isFinite(PR) ? Math.round(PR * 1000) / 1000 : 0;
  const prWarning = (prRaw < 0.60 || prRaw > 0.90)
    ? `PR fuera de rango razonable (${(prRaw * 100).toFixed(1)} %): revisar sombras, suciedad, temperatura o datos de irradiancia.`
    : null;
  return {
    annualKWh: Math.round(annualKWh),
    monthlyKWh: monthlyYields,
    PR: prRaw,
    prWarning: prWarning,
    cascadeLosses: cascadeLosses,
    clippingKWh: Math.round(totalClippedWh / 1000),
    clippingPct: (annualKWh + totalClippedWh / 1000) > 0 ? Math.round((totalClippedWh / 1000) / (annualKWh + totalClippedWh / 1000) * 1000) / 10 : 0,
    sigma: annualKWh * 0.07, // ±7% physical uncertainty
    ghiSource: targetGHIList ? 'NASA POWER (Satelital Directo)' : (usedNasaCache ? 'NASA POWER (Caché Offline)' : 'Modelo Sintético (Kt Estático)')
  };
}

async function runPVGISCalc(kwp, latDeg, lonDeg, tiltDeg, azimutDeg, lossPercent=14) {
  const params = new URLSearchParams({
    lat: latDeg.toFixed(4),
    lon: lonDeg.toFixed(4),
    peakpower: kwp.toFixed(2),
    loss: lossPercent.toFixed(1),
    angle: tiltDeg.toFixed(0),
    aspect: azimutDeg.toFixed(0),
    pvtechchoice: 'crystSi',
    mountingplace: 'building',
    outputformat: 'json'
  });
  const endpoint = 'https://re.jrc.ec.europa.eu/api/v5_3/PVcalc?' + params.toString();

  const proxySel = document.getElementById('cfg-pvgis-proxy');
  const proxyMode = (proxySel && proxySel.value) || 'auto';
  const customSel = document.getElementById('cfg-pvgis-custom');
  const customPrefix = customSel ? customSel.value.trim() : '';

  // Desde file:// el origen es 'null' y ningún proxy público lo acepta: la vía
  // fiable es servir la app por HTTP (localhost) donde corsproxy.io sí opera.
  const isFileProto = typeof window !== 'undefined' && window.location && window.location.protocol === 'file:';

  // Cadena de conexión: directo (solo si no es file://, pues ahí CORS falla
  // siempre) y luego proxys CORS en orden de fiabilidad.
  const candidates = [];
  if (!isFileProto && (proxyMode === 'auto' || proxyMode === 'direct')) candidates.push(endpoint);
  if (proxyMode === 'custom' && customPrefix) candidates.push(customPrefix + encodeURIComponent(endpoint));
  const proxyChain = proxyMode === 'auto'
    ? ['corsproxy', 'allorigins', 'codetabs']
    : (PVGIS_PROXIES[proxyMode] ? [proxyMode] : []);
  proxyChain.forEach(p => candidates.push(PVGIS_PROXIES[p] + encodeURIComponent(endpoint)));

  let lastErr = 'Sin conexión';
  for (let attempt = 0; attempt < 2; attempt++) {
    for (const url of candidates) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      try {
        const resp = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);
        if (!resp.ok) { lastErr = 'PVGIS HTTP ' + resp.status; continue; }
        const data = await resp.json();
        if (!data.outputs || !data.outputs.totals) { lastErr = 'Respuesta PVGIS inválida'; continue; }

        const totals = data.outputs.totals.fixed;
        const monthly = data.outputs.monthly.fixed;
        const annualKWh = totals.E_y;
        const PR = totals.PR / 100;
        const monthlyKWh = monthly.map(m => Math.round(m.E_m));

        const via = url === endpoint ? 'directo' : 'proxy ' + (Object.keys(PVGIS_PROXIES).find(p => url.startsWith(PVGIS_PROXIES[p])) || proxyMode);
        return {
          source: 'PVGIS v5.3 · SARAH-3 (JRC Europa) · ' + via,
          annualKWh: Math.round(annualKWh),
          monthlyKWh: monthlyKWh,
          PR: PR,
          irrad_opt: totals.H_i_opt || 0,
          sigma: annualKWh * 0.05 // PVGIS states ~5% uncertainty
        };
      } catch(e) {
        clearTimeout(timer);
        lastErr = e.name === 'AbortError' ? 'Timeout (8s)' : 'CORS / ' + (e.message || 'red');
        if (window.RA_ErrorHandler) window.RA_ErrorHandler.handleAsyncAPI(e, 'PVGIS API');
      }
    }
  }
  return { error: lastErr, source: 'PVGIS' };
}

async function runNASAPower(latDeg, lonDeg) {
  const url = new URL('https://power.larc.nasa.gov/api/temporal/monthly/point');
  url.searchParams.set('parameters', 'ALLSKY_SFC_SW_DWN');
  url.searchParams.set('community', 'RE');
  url.searchParams.set('longitude', lonDeg.toFixed(4));
  url.searchParams.set('latitude', latDeg.toFixed(4));
  url.searchParams.set('start', '2001');
  url.searchParams.set('end', '2022');
  url.searchParams.set('format', 'JSON');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const resp = await fetch(url.toString(), { signal: controller.signal });
    clearTimeout(timer);
    if (!resp.ok) throw new Error('NASA HTTP ' + resp.status);
    const data = await resp.json();
    const props = data.properties.parameter.ALLSKY_SFC_SW_DWN;

    // Average over years by month
    let monthlyGHI = Array(12).fill(0);
    let yearCount = Array(12).fill(0);
    Object.entries(props).forEach(([key, val]) => {
      if (val === -999) return;
      const month = parseInt(key.slice(-2)) - 1;
      if (month >= 0 && month < 12) {
        monthlyGHI[month] += val;
        yearCount[month]++;
      }
    });
    monthlyGHI = monthlyGHI.map((v, i) => yearCount[i] > 0 ? v / yearCount[i] : 0);

    try {
      if (typeof localStorage !== 'undefined') {
        const cacheKey = `ra_nasa_ghi_${Number(latDeg).toFixed(2)}_${Number(lonDeg).toFixed(2)}`;
        localStorage.setItem(cacheKey, JSON.stringify({ data: monthlyGHI, ts: Date.now() }));
      }
    } catch(e) {}
    if (typeof global !== 'undefined' && global.RAProduction && typeof global.RAProduction.clearCache === 'function') {
      global.RAProduction.clearCache();
    }

    return { monthlyGHI_kWhm2: monthlyGHI, source: 'NASA POWER (20 años)' };
  } catch(e) {
    clearTimeout(timer);
    return { error: e.message || 'Timeout', source: 'NASA POWER' };
  }
}

function runPVsystCompatible(kwp, latDeg, lonDeg, tiltDeg, azimutDeg, cfg, physicalResult) {
  if (!physicalResult || !physicalResult.annualKWh) return null;

  // Apply additional PVsyst-specific correction factors (IAM ya aplicado por componente en runPhysicalModel/RA.Radiation)
  const _lc2 = (typeof window !== 'undefined' && window.solarLossConfig) ? window.solarLossConfig : null;
  const loss_iam_angular = 0;
  const loss_spectral    = _lc2 ? _lc2.spectral : 0.010;    // configurable (Paso 4)
  const loss_bypass      = getShadingStrategy() === 'mlpe' ? (_lc2 ? _lc2.bypassMlpe : 0.005) : (_lc2 ? _lc2.bypass : 0.025);
  const loss_lid         = cfg.tecnologia && cfg.tecnologia.includes('N-Type') ? 0.000 : 0.015; // LID only in p-type

  const totalExtraLoss = loss_spectral + loss_bypass + loss_lid;
  const annualKWh = physicalResult.annualKWh * (1 - totalExtraLoss);
  const monthlyKWh = physicalResult.monthlyKWh.map(m => Math.round(m * (1 - totalExtraLoss)));
  const PR = physicalResult.PR * (1 - totalExtraLoss);

  return {
    source: 'Modelo PVsyst-Compatible (IEC 62548)',
    annualKWh: Math.round(annualKWh),
    monthlyKWh: monthlyKWh,
    PR: PR,
    sigma: annualKWh * 0.06,
    extraLosses: { loss_iam_angular, loss_spectral, loss_bypass, loss_lid }
  };
}

// [F3-06] Subsistema UI muerto Analisis Energetico Comparativo purgado.

function wpComputeInstantSolarPosition(monthIdx, hourFloat) {
  const m = Math.max(0, Math.min(11, monthIdx !== undefined ? monthIdx : solarSimState.monthIdx));
  const h = Math.max(6.0, Math.min(20.0, hourFloat !== undefined ? hourFloat : solarSimState.hourFloat));
  const doy = SOLAR_MONTH_DAYS[m];

  let latDeg = (typeof window !== "undefined" && window.solarProjectConfig && typeof window.solarProjectConfig.lat === 'number')
    ? window.solarProjectConfig.lat : 40.4168;
  let lngDeg = (typeof window !== "undefined" && window.solarProjectConfig && typeof window.solarProjectConfig.lng === 'number')
    ? window.solarProjectConfig.lng : -3.7038;
  if (typeof WP !== "undefined" && WP && WP.planes && WP.planes.length > 0 && WP.planes[0].centerCarto) {
    latDeg = Cesium.Math.toDegrees(WP.planes[0].centerCarto.latitude);
    lngDeg = Cesium.Math.toDegrees(WP.planes[0].centerCarto.longitude);
  } else if (typeof polygonPoints !== "undefined" && polygonPoints && polygonPoints.length > 0) {
    const carto = Cesium.Cartographic.fromCartesian(polygonPoints[0]);
    if (carto) {
      latDeg = Cesium.Math.toDegrees(carto.latitude);
      lngDeg = Cesium.Math.toDegrees(carto.longitude);
    }
  }

  // Hora local del slider → hora UTC astronómica determinista según huso geográfico y horario de verano
  let alt, azN, decl;
  if (typeof computeHighPrecisionSolarPosition === "function") {
    const baseTz = Math.round(lngDeg / 15);
    const isDst = (m >= 2 && m <= 9);
    const tzHours = (lngDeg >= -18.5 && lngDeg <= 4.5 && latDeg >= 27.5 && latDeg <= 44.0)
      ? (lngDeg < -10 ? (isDst ? 1 : 0) : (isDst ? 2 : 1))
      : (baseTz + (isDst ? 1 : 0));
    const utcHour = h - tzHours;
    const sp = computeHighPrecisionSolarPosition(latDeg, lngDeg, doy, utcHour);
    alt = sp.elevDeg;
    azN = sp.azDegFromNorth;
    decl = sp.declDeg;
  } else {
    decl = solarDeclination(doy);
    const ha = hourAngle(h);
    alt = solarAltitude(latDeg, decl, ha);
    azN = solarAzimuthAtan2(latDeg, decl, ha);
  }
  const shadowAzDeg = normalizeAzimuth(azN + 180);
  const shadowLenPerM = obstacleShadowLength(1.0, alt);

  // Vector solar 3D en coordenadas ENU
  const altRad = degToRad(alt);
  const azRad = degToRad(azN);
  const sunVecENU = new Cesium.Cartesian3(
    Math.cos(altRad) * Math.sin(azRad),
    Math.cos(altRad) * Math.cos(azRad),
    Math.sin(altRad)
  );

  const sDirENU = new Cesium.Cartesian3(
    Math.sin(degToRad(shadowAzDeg)),
    Math.cos(degToRad(shadowAzDeg)),
    0
  );

  return {
    monthIdx: m,
    hourFloat: h,
    doy: doy,
    latDeg: latDeg,
    alt: alt,
    azN: azN,
    sunVecENU: sunVecENU,
    shadowAzDeg: shadowAzDeg,
    shadowLenPerM: shadowLenPerM,
    sDirENU: sDirENU,
    isDaylight: alt > 0.5
  };
}

// ── CÁLCULO ASTRONÓMICO DE AMANECER Y OCASO (SPENCER & DUFFIE-BECKMAN) ───────
function wpComputeSunTimes(latDeg, lonDeg, monthIdx) {
  const m = Math.max(0, Math.min(11, monthIdx !== undefined ? monthIdx : 11));
  const doy = SOLAR_MONTH_DAYS[m];
  const isDst = (m >= 2 && m <= 9);
  const tzHours = (lonDeg >= -18.5 && lonDeg <= 4.5 && latDeg >= 27.5 && latDeg <= 44.0)
    ? (lonDeg < -10 ? (isDst ? 1 : 0) : (isDst ? 2 : 1))
    : (Math.round(lonDeg / 15) + (isDst ? 1 : 0));

  const gamma = (2 * Math.PI / 365) * (doy - 1);
  const Et = 229.18 * (
    0.000075 +
    0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma) -
    0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma)
  );
  const latRad = (latDeg * Math.PI) / 180;
  const declRad = 0.006918 -
    0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);

  // Refracción atmosférica estándar en el horizonte (-0.833°)
  const h0Rad = (-0.833 * Math.PI) / 180;
  const cosWs = (Math.sin(h0Rad) - Math.sin(latRad) * Math.sin(declRad)) / Math.max(1e-5, Math.cos(latRad) * Math.cos(declRad));
  const safeCosWs = Math.max(-1, Math.min(1, cosWs));
  const wsDeg = (Math.acos(safeCosWs) * 180) / Math.PI;

  const solarSunrise = 12 - wsDeg / 15;
  const solarSunset = 12 + wsDeg / 15;

  const localSunriseDec = solarSunrise - (4 * lonDeg + Et) / 60 + tzHours;
  const localSunsetDec = solarSunset - (4 * lonDeg + Et) / 60 + tzHours;

  const formatH = (dec) => {
    let norm = (dec + 24) % 24;
    const hr = Math.floor(norm);
    const min = Math.round((norm - hr) * 60);
    return String(hr).padStart(2, "0") + ":" + String(min).padStart(2, "0");
  };

  return {
    monthIdx: m,
    doy: doy,
    tzHours: tzHours,
    localSunriseDec: localSunriseDec,
    localSunsetDec: localSunsetDec,
    sunriseStr: formatH(localSunriseDec),
    sunsetStr: formatH(localSunsetDec)
  };
}

function wpSyncCesiumSun(solarPos) {
  if (typeof viewer === "undefined" || !viewer || !viewer.clock) return;
  const year = 2026;
  const month = (solarPos && solarPos.monthIdx !== undefined) ? solarPos.monthIdx : 11;
  const day = 21;
  const hourVal = (solarPos && solarPos.hourFloat !== undefined) ? solarPos.hourFloat : 12.0;

  const latDeg = (solarPos && typeof solarPos.latDeg === "number") ? solarPos.latDeg : 40.4168;
  const lngDeg = (typeof window !== "undefined" && window.solarProjectConfig && typeof window.solarProjectConfig.lng === "number")
    ? window.solarProjectConfig.lng : (typeof WP !== "undefined" && WP && WP.planes && WP.planes[0] && WP.planes[0].centerCarto ? Cesium.Math.toDegrees(WP.planes[0].centerCarto.longitude) : -3.7038);

  // Sincronización estricta con hora UTC real según huso horario geográfico y DST
  const baseTz = Math.round(lngDeg / 15);
  const isDst = (month >= 2 && month <= 9);
  const tzHours = (lngDeg >= -18.5 && lngDeg <= 4.5 && latDeg >= 27.5 && latDeg <= 44.0)
    ? (lngDeg < -10 ? (isDst ? 1 : 0) : (isDst ? 2 : 1))
    : (baseTz + (isDst ? 1 : 0));

  const utcMinutes = Math.round((hourVal - tzHours) * 60);
  const dateObj = new Date(Date.UTC(year, month, day, 0, 0, 0));
  dateObj.setUTCMinutes(utcMinutes);

  if (typeof Cesium !== "undefined" && Cesium.JulianDate && typeof Cesium.JulianDate.fromDate === "function") {
    viewer.clock.currentTime = Cesium.JulianDate.fromDate(dateObj);
  }

  const alt = (solarPos && typeof solarPos.alt === 'number') ? solarPos.alt : 15.0;

  // Erradicar esfera negra de la Luna en el cielo diurno (solo visible de noche)
  if (viewer.scene && viewer.scene.moon) {
    viewer.scene.moon.show = (alt <= 0.0);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 🌓 ILUMINACIÓN DINÁMICA: DÍA, ATARDECER, CREPÚSCULO Y LUZ DE LUNA
  // ═══════════════════════════════════════════════════════════════════════════
  try {
    if (viewer.scene) {
      const sc = viewer.scene;
      const gl = sc.globe;
      const canvas = viewer.canvas || (sc.canvas);

      // 1. Sincronizar Bóveda Celeste y Atmósfera Procedural Reactiva (Día, Ocaso, Noche estrellada)
      if (typeof window.wpUpdateAtmosphericSky === "function") {
        window.wpUpdateAtmosphericSky(alt);
      }

      // 2. Niebla y Profundidad Atmosférica
      if (sc.fog) {
        sc.fog.enabled = true;
        sc.fog.density = alt > 0 ? 0.00025 : 0.00015;
        sc.fog.screenSpaceErrorFactor = 2.0;
      }

      if (alt >= 0.0) {
        // ☀️ DÍA PLENO Y HORA DORADA / ATARDECER Y AMANECER (Coloreado Cálido y Atenuación Progresiva)
        const isGoldenHour = alt <= 12.0;
        const t = isGoldenHour ? Math.max(0, Math.min(1, alt / 12.0)) : 1.0;

        if (typeof Cesium.SunLight === "function") {
          const sunColor = isGoldenHour
            ? new Cesium.Color(1.0, 0.78 + 0.22 * t, 0.55 + 0.45 * t, 1.0)
            : Cesium.Color.WHITE;
          const sunIntensity = isGoldenHour ? (1.0 + 1.2 * t) : 2.2;
          try {
            sc.light = new Cesium.SunLight({ color: sunColor, intensity: sunIntensity });
          } catch(eL) {
            sc.light = new Cesium.SunLight();
          }
        }

        if (gl) {
          gl.enableLighting = true;
          const shadowCfg = (typeof window !== "undefined" && window.ShadowSettings)
            ? window.ShadowSettings.getSettings()
            : { terrainShadows: true, selfShadows: true };
          gl.shadows = (typeof Cesium !== "undefined" && Cesium.ShadowMode)
            ? (shadowCfg.terrainShadows ? Cesium.ShadowMode.ENABLED : Cesium.ShadowMode.RECEIVE_ONLY)
            : Cesium.ShadowMode.DISABLED;
          gl.atmosphereLightIntensity = isGoldenHour ? (4.0 + 6.0 * t) : 10.0;
          gl.baseColor = isGoldenHour ? Cesium.Color.fromCssColorString('#1e293b') : Cesium.Color.fromCssColorString('#0f172a');
        }

        if (sc.shadowMap) {
          if (typeof window !== "undefined" && window.ShadowSettings && typeof window.ShadowSettings.configureShadowMap === "function") {
            window.ShadowSettings.configureShadowMap(sc.shadowMap);
          } else if (typeof window.wpConfigureShadowMap === "function") {
            window.wpConfigureShadowMap(sc.shadowMap);
          } else {
            const shadowRadius = (typeof window !== "undefined" && window.ShadowSettings && typeof window.ShadowSettings.getSettings === "function")
              ? Number(window.ShadowSettings.getSettings().radius) || 400.0
              : 400.0;
            sc.shadowMap.enabled = true;
            sc.shadowMap.size = 4096;
            sc.shadowMap.maximumDistance = shadowRadius;
            sc.shadowMap._fitNearFar = true;
            sc.shadowMap.fadingEnabled = true;
            sc.shadowMap.softShadows = true;
            if (sc.shadowMap._primitiveBias) {
              sc.shadowMap._primitiveBias.polygonOffset = true;
              sc.shadowMap._primitiveBias.polygonOffsetFactor = 1.1;
              sc.shadowMap._primitiveBias.polygonOffsetUnits = 3.2;
              sc.shadowMap._primitiveBias.normalOffset = true;
              sc.shadowMap._primitiveBias.normalOffsetScale = 0.25;
              sc.shadowMap._primitiveBias.normalShading = false;
              sc.shadowMap._primitiveBias.depthBias = Math.max(0.00025, 0.08 / shadowRadius);
            }
          }
          // Transición continua de sombra: desvanecimiento suave a ras de horizonte (0° a 5°)
          const shadowFade = Math.max(0, Math.min(1, alt / 5.0));
          const targetDarkness = 0.50 * shadowFade;
          if (Math.abs((sc.shadowMap.darkness || 0) - targetDarkness) > 0.005) {
            sc.shadowMap.darkness = targetDarkness;
          }
        }
        // Color de cielo luminoso: transición suave desde azul cobalto amanecer/ocaso a azul celeste diurno
        sc.backgroundColor = isGoldenHour 
          ? Cesium.Color.fromCssColorString('#2563eb').lerp(Cesium.Color.fromCssColorString('#0ea5e9'), t, new Cesium.Color())
          : Cesium.Color.fromCssColorString('#0ea5e9');

        // Renderizado físico directo sin filtros CSS degradantes
        if (canvas && canvas.style) {
          canvas.style.filter = 'none';
        }

      } else if (alt > -6.0) {
        // 🌆 CREPÚSCULO (Hora Azul / Twilight: Azul Cobalto Cálido y Desvanecimiento Continuo)
        const tDusk = Math.max(0, Math.min(1, (alt + 6.0) / 6.0)); // 1.0 = Horizonte, 0.0 = Noche
        const r = 0.20 + 0.30 * tDusk;
        const g = 0.35 + 0.35 * tDusk;
        const b = 0.70 + 0.30 * tDusk;
        const duskColor = new Cesium.Color(r, g, b, 1.0);

        if (typeof Cesium.DirectionalLight === "function") {
          sc.light = new Cesium.DirectionalLight({
            direction: new Cesium.Cartesian3(0.25, 0.35, -0.90),
            color: duskColor,
            intensity: 0.30 + 0.70 * tDusk
          });
        }
        if (gl) {
          gl.enableLighting = true;
          gl.atmosphereLightIntensity = 1.5 + 2.5 * tDusk;
          gl.baseColor = Cesium.Color.fromCssColorString('#0f172a');
        }
        if (sc.shadowMap) {
          sc.shadowMap.enabled = false;
        }
        // Azul marino luminoso en crepúsculo (erradica negro carbón)
        sc.backgroundColor = Cesium.Color.fromCssColorString('#1e3a8a').lerp(Cesium.Color.fromCssColorString('#2563eb'), tDusk, new Cesium.Color());

        if (canvas && canvas.style) {
          canvas.style.filter = 'none';
        }

      } else {
        // 🌙 NOCHE PROFUNDA PBR (Luz de Luna Física con Intensidad 0.20)
        const moonColor = new Cesium.Color(0.65, 0.78, 1.0, 1.0);
        if (typeof Cesium.DirectionalLight === "function") {
          sc.light = new Cesium.DirectionalLight({
            direction: new Cesium.Cartesian3(0.28, 0.42, -0.87),
            color: moonColor,
            intensity: 0.20
          });
        }
        if (gl) {
          gl.enableLighting = true;
          gl.atmosphereLightIntensity = 0.8;
          gl.baseColor = Cesium.Color.fromCssColorString('#020617');
        }
        if (sc.shadowMap) {
          sc.shadowMap.enabled = false;
        }
        sc.backgroundColor = Cesium.Color.fromCssColorString('#020617');

        if (canvas && canvas.style) {
          canvas.style.filter = 'none';
        }
      }

      if (typeof sc.requestRender === "function") {
        sc.requestRender();
      }
    }

    const shadowCfg = (typeof window !== "undefined" && window.ShadowSettings)
      ? window.ShadowSettings.getSettings()
      : { selfShadows: true, terrainShadows: true };

    const tilesShadowMode = (alt > 0)
      ? ((typeof Cesium !== "undefined" && Cesium.ShadowMode)
          ? (shadowCfg.selfShadows ? Cesium.ShadowMode.ENABLED : Cesium.ShadowMode.RECEIVE_ONLY)
          : undefined)
      : ((typeof Cesium !== "undefined" && Cesium.ShadowMode) ? Cesium.ShadowMode.DISABLED : undefined);

    if (google3DTileset) google3DTileset.shadows = tilesShadowMode;
    if (cesiumOsmBuildings) cesiumOsmBuildings.shadows = tilesShadowMode;

    if (gl && typeof Cesium !== "undefined" && Cesium.ShadowMode) {
      gl.shadows = (alt > 0)
        ? (shadowCfg.terrainShadows ? Cesium.ShadowMode.ENABLED : Cesium.ShadowMode.RECEIVE_ONLY)
        : Cesium.ShadowMode.DISABLED;
    }

    const currentShadowMode = (alt > 0) ? Cesium.ShadowMode.ENABLED : Cesium.ShadowMode.DISABLED;

    // Sincronizar sombras GPU dinámicas para edificios 3D modelados
    if (window._buildingPrimitives && Array.isArray(window._buildingPrimitives)) {
      window._buildingPrimitives.forEach(prim => {
        if (prim && typeof prim.isDestroyed === "function" && !prim.isDestroyed()) prim.shadows = currentShadowMode;
      });
    }

    // Sincronizar sombras GPU dinámicas para obstáculos (árboles, casetones, chimeneas)
    if (window._obsPrimitives && Array.isArray(window._obsPrimitives)) {
      window._obsPrimitives.forEach(prim => {
        if (prim && typeof prim.isDestroyed === "function" && !prim.isDestroyed()) prim.shadows = currentShadowMode;
      });
    }

    // Sincronizar sombras en la primitiva de paneles fotovoltaicos
    if (window.simulatedPanelsPrimitive && typeof window.simulatedPanelsPrimitive.isDestroyed === "function" && !window.simulatedPanelsPrimitive.isDestroyed()) {
      window.simulatedPanelsPrimitive.shadows = currentShadowMode;
    }
    if (window._faldonPanelsPrimitives && typeof window._faldonPanelsPrimitives.forEach === "function") {
      window._faldonPanelsPrimitives.forEach(prim => {
        if (prim && typeof prim.isDestroyed === "function" && !prim.isDestroyed()) {
          prim.shadows = currentShadowMode;
        }
      });
    }
  } catch(eShadow) { window.RA && window.RA.log && window.RA.log.warn('[catch silenciado]', eShadow); }
}

function wpClearDynamicShadows() {
  if (typeof viewer === "undefined" || !viewer || !viewer.entities) return;
  if (typeof window !== "undefined" && window.solarSimState && Array.isArray(window.solarSimState.dynamicShadowEntities)) {
    window.solarSimState.dynamicShadowEntities.forEach(e => {
      try { viewer.entities.remove(e); } catch(err) {}
    });
    window.solarSimState.dynamicShadowEntities = [];
  }
}

function wpToggleShadowPlanes(forceVal) {
  if (!solarSimState) window.solarSimState = {};
  if (typeof forceVal === 'boolean') {
    solarSimState.showShadowPlanes = forceVal;
  } else {
    solarSimState.showShadowPlanes = !solarSimState.showShadowPlanes;
  }

  const btn = document.getElementById("btn-toggle-shadow-planes");
  const lbl = document.getElementById("shadow-planes-label");
  const isShown = !!solarSimState.showShadowPlanes;

  if (btn) {
    btn.classList.toggle("active", isShown);
    btn.style.borderColor = isShown ? '#38bdf8' : 'rgba(148,163,184,0.3)';
    btn.style.color = isShown ? '#38bdf8' : '#94a3b8';
  }
  if (lbl) {
    lbl.innerHTML = isShown
      ? '<i data-lucide="eye" class="icon-sm"></i> SOMBRAS 3D: ON'
      : '<i data-lucide="eye-off" class="icon-sm"></i> SOMBRAS 3D: OFF';
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  if (!isShown) {
    wpClearDynamicShadows();
  } else if (solarSimState.viewMode !== "heatmap" && solarSimState.currentSolarPos) {
    wpRenderDynamicObstacleShadows(solarSimState.currentSolarPos);
  }

  if (typeof showToast === 'function') {
    showToast(
      isShown ? 'PLANOS DE SOMBRA ACTIVADOS' : 'PLANOS DE SOMBRA OCULTOS',
      isShown ? 'Se muestran los conos analíticos de sombra sobre cubierta y terreno.' : 'Vista limpia: sombras analíticas translúcidas desactivadas.',
      'info',
      2500
    );
  }

  if (typeof viewer !== "undefined" && viewer && viewer.scene && typeof viewer.scene.requestRender === "function") {
    viewer.scene.requestRender();
  }
}

function wpRenderDynamicObstacleShadows(solarPos) {
  if (typeof viewer === "undefined" || !viewer || !viewer.entities) return;

  if (!solarSimState) window.solarSimState = {};
  if (!solarSimState.dynamicShadowEntities) solarSimState.dynamicShadowEntities = [];
  const activeShadowIds = new Set();

  // Si el usuario los ha desactivado o estamos en modo heatmap, limpiar y no proyectar
  if (solarSimState.showShadowPlanes !== true || solarSimState.viewMode === "heatmap") {
    if (solarSimState.dynamicShadowEntities.length > 0) {
      solarSimState.dynamicShadowEntities.forEach(e => {
        try { viewer.entities.remove(e); } catch(err) {}
      });
      solarSimState.dynamicShadowEntities = [];
    }
    return;
  }

  if (!solarPos || !solarPos.isDaylight || typeof obstacles === "undefined" || !obstacles || obstacles.length === 0) {
    if (solarSimState.dynamicShadowEntities.length > 0) {
      solarSimState.dynamicShadowEntities.forEach(e => {
        try { viewer.entities.remove(e); } catch(err) {}
      });
      solarSimState.dynamicShadowEntities = [];
    }
    return;
  }

  const shadowMatObs = Cesium.Color.fromCssColorString('#0B0F19').withAlpha(0.68);
  function _syncShadowEntity(entId, pts) {
    activeShadowIds.add(entId);
    let shadowEnt = viewer.entities.getById(entId);
    if (shadowEnt) {
      if (shadowEnt.polygon) {
        shadowEnt.polygon.hierarchy = new Cesium.PolygonHierarchy(pts);
      }
      shadowEnt.show = true;
    } else {
      shadowEnt = viewer.entities.add({
        id: entId,
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(pts),
          material: shadowMatObs,
          perPositionHeight: true,
          arcType: (typeof Cesium !== 'undefined' && Cesium.ArcType && Cesium.ArcType.NONE) ? Cesium.ArcType.NONE : undefined,
          zIndex: 15
        }
      });
      solarSimState.dynamicShadowEntities.push(shadowEnt);
    }
  }

  const hasPolys = typeof WP !== "undefined" && WP && WP.polylines && WP.polylines.length > 0;
  const polylinesList = hasPolys ? WP.polylines : (lastRoofInfo ? [{ points: polygonPoints, roofInfo: lastRoofInfo }] : []);

  // 1. Proyección analítica sobre polilíneas de cubierta
  if (polylinesList && polylinesList.length > 0) {
    polylinesList.forEach((poly, polyIdx) => {
      const pInfo = poly.roofInfo || (typeof computeSinglePolylineRoofInfo === "function" ? computeSinglePolylineRoofInfo(poly.points, poly) : null);
      if (!pInfo) return;

      const uVec = pInfo.uVec || new Cesium.Cartesian3(1, 0, 0);
      const vVec = pInfo.vVec || new Cesium.Cartesian3(0, 1, 0);
      const norm = pInfo.normal || new Cesium.Cartesian3(0, 0, 1);
      const transform = pInfo.transform || Cesium.Transforms.eastNorthUpToFixedFrame(pInfo.center || new Cesium.Cartesian3(0,0,0));

      const sU = Cesium.Cartesian3.dot(solarPos.sDirENU, uVec);
      const sV = Cesium.Cartesian3.dot(solarPos.sDirENU, vVec);

      // A. Proyección analítica de sombra de obstáculos 3D sobre cubierta
      obstacles.forEach((obs, obsIdx) => {
        const shadowQuads = getObstacleShadowPolygons2DForRoof(obs, pInfo, sU, sV, solarPos.shadowLenPerM);
        if (!shadowQuads || shadowQuads.length === 0) return;

        shadowQuads.forEach((quad2D, qIdx) => {
          if (!quad2D || quad2D.length < 3) return;

          // Convertir puntos 2D del faldón a coordenadas 3D mundo elevadas +4.5cm sobre la cubierta
          const worldPts = quad2D.map(p => {
            const lp = Cesium.Cartesian3.add(
              Cesium.Cartesian3.multiplyByScalar(uVec, p.u, new Cesium.Cartesian3()),
              Cesium.Cartesian3.multiplyByScalar(vVec, p.v, new Cesium.Cartesian3()),
              new Cesium.Cartesian3()
            );
            Cesium.Cartesian3.add(lp, Cesium.Cartesian3.multiplyByScalar(norm, 0.080, new Cesium.Cartesian3()), lp);
            return Cesium.Matrix4.multiplyByPoint(transform, lp, new Cesium.Cartesian3());
          });

          // Winding CCW garantizado respecto a la normal del faldón para evitar desvanecimientos
          const normWorld = (typeof Cesium.Matrix4.multiplyByPointAsVector === "function")
            ? Cesium.Matrix4.multiplyByPointAsVector(transform, norm, new Cesium.Cartesian3())
            : Cesium.Matrix4.multiplyByPoint(transform, norm, new Cesium.Cartesian3());
          const ccwWorldPts = (typeof wpEnsureCounterClockwisePoints === 'function')
            ? wpEnsureCounterClockwisePoints(worldPts, normWorld)
            : worldPts;

          _syncShadowEntity("dyn_obs_shadow_" + polyIdx + "_" + obsIdx + "_" + qIdx, ccwWorldPts);
        });
      });

      // B. Proyección analítica de sombra de edificios 3D / casetones sobre cubierta
      if (typeof buildings !== "undefined" && Array.isArray(buildings) && buildings.length > 0) {
        buildings.forEach((bld, bldIdx) => {
          const shadowQuads = getBuildingShadowPolygons2DForRoof(bld, pInfo, sU, sV, solarPos.shadowLenPerM, poly);
          if (!shadowQuads || shadowQuads.length === 0) return;

          shadowQuads.forEach((quad2D, qIdx) => {
            if (!quad2D || quad2D.length < 3) return;

            const worldPts = quad2D.map(p => {
              const lp = Cesium.Cartesian3.add(
                Cesium.Cartesian3.multiplyByScalar(uVec, p.u, new Cesium.Cartesian3()),
                Cesium.Cartesian3.multiplyByScalar(vVec, p.v, new Cesium.Cartesian3()),
                new Cesium.Cartesian3()
              );
              Cesium.Cartesian3.add(lp, Cesium.Cartesian3.multiplyByScalar(norm, 0.080, new Cesium.Cartesian3()), lp);
              return Cesium.Matrix4.multiplyByPoint(transform, lp, new Cesium.Cartesian3());
            });

            const normWorld = (typeof Cesium.Matrix4.multiplyByPointAsVector === "function")
              ? Cesium.Matrix4.multiplyByPointAsVector(transform, norm, new Cesium.Cartesian3())
              : Cesium.Matrix4.multiplyByPoint(transform, norm, new Cesium.Cartesian3());
            const ccwWorldPts = (typeof wpEnsureCounterClockwisePoints === 'function')
              ? wpEnsureCounterClockwisePoints(worldPts, normWorld)
              : worldPts;

            _syncShadowEntity("dyn_bld_shadow_" + polyIdx + "_" + bldIdx + "_" + qIdx, ccwWorldPts);
          });
        });
      }
    });
  } else {
    // 2. Proyección de sombra sobre el Plano de Trabajo o Terreno cuando no hay polilíneas creadas aún
    const activePlane = (typeof wpGetActivePlane === "function") ? wpGetActivePlane() : null;
    obstacles.forEach((obs, obsIdx) => {
      let baseCenter = null;
      let normal = null;
      let uVec = null;
      let vVec = null;

      if (activePlane && activePlane.origin && activePlane.normal) {
        normal = Cesium.Cartesian3.normalize(activePlane.normal, new Cesium.Cartesian3());
        uVec = Cesium.Cartesian3.normalize(activePlane.uVec || Cesium.Cartesian3.UNIT_X, new Cesium.Cartesian3());
        vVec = Cesium.Cartesian3.normalize(activePlane.vVec || Cesium.Cartesian3.UNIT_Y, new Cesium.Cartesian3());
        baseCenter = Cesium.Cartesian3.add(
          activePlane.origin,
          Cesium.Cartesian3.add(
            Cesium.Cartesian3.multiplyByScalar(uVec, obs.u || 0, new Cesium.Cartesian3()),
            Cesium.Cartesian3.multiplyByScalar(vVec, obs.v || 0, new Cesium.Cartesian3()),
            new Cesium.Cartesian3()
          ),
          new Cesium.Cartesian3()
        );
      } else if (obs.cartesian) {
        baseCenter = (obs.cartesian instanceof Cesium.Cartesian3) ? obs.cartesian : new Cesium.Cartesian3(obs.cartesian.x, obs.cartesian.y, obs.cartesian.z);
        normal = Cesium.Cartesian3.normalize(baseCenter, new Cesium.Cartesian3());
        uVec = Cesium.Cartesian3.cross(normal, Cesium.Cartesian3.UNIT_Z, new Cesium.Cartesian3());
        if (Cesium.Cartesian3.magnitude(uVec) < 0.01) {
          uVec = Cesium.Cartesian3.cross(normal, Cesium.Cartesian3.UNIT_X, new Cesium.Cartesian3());
        }
        uVec = Cesium.Cartesian3.normalize(uVec, uVec);
        vVec = Cesium.Cartesian3.normalize(Cesium.Cartesian3.cross(normal, uVec, new Cesium.Cartesian3()), new Cesium.Cartesian3());
      }

      if (!baseCenter || !normal || !uVec || !vVec) return;

      const w = Math.max(obs.w || 1.0, 0.4);
      const l = Math.max(obs.l || 1.0, 0.4);
      const h = Math.max(obs.h || 1.2, 0.4);

      const sU = Cesium.Cartesian3.dot(solarPos.sDirENU, uVec);
      const sV = Cesium.Cartesian3.dot(solarPos.sDirENU, vVec);
      const sLen = solarPos.shadowLenPerM || 1.5;
      const shadowDist = sLen * h;

      const SHADOW_OFFSET_START_M = 0.05;
      if (shadowDist <= SHADOW_OFFSET_START_M) return;

      const halfW = w / 2;
      const halfL = l / 2;
      const baseCorners = [
        { u: -halfW, v: -halfL },
        { u: halfW, v: -halfL },
        { u: halfW, v: halfL },
        { u: -halfW, v: halfL }
      ];

      const startU = sU * SHADOW_OFFSET_START_M;
      const startV = sV * SHADOW_OFFSET_START_M;
      const topU = sU * shadowDist;
      const topV = sV * shadowDist;

      const startPoly = baseCorners.map(pt => ({ u: pt.u + startU, v: pt.v + startV }));
      const topPoly = baseCorners.map(pt => ({ u: pt.u + topU, v: pt.v + topV }));

      const unifiedHull2D = (typeof convexHull2D === 'function')
        ? convexHull2D([...startPoly, ...topPoly])
        : [...startPoly, ...topPoly];
      if (!unifiedHull2D || unifiedHull2D.length < 3) return;

      const worldShadowPts = unifiedHull2D.map(pt => {
        const p = Cesium.Cartesian3.add(
          baseCenter,
          Cesium.Cartesian3.add(
            Cesium.Cartesian3.multiplyByScalar(uVec, pt.u, new Cesium.Cartesian3()),
            Cesium.Cartesian3.multiplyByScalar(vVec, pt.v, new Cesium.Cartesian3()),
            new Cesium.Cartesian3()
          ),
          new Cesium.Cartesian3()
        );
        return Cesium.Cartesian3.add(p, Cesium.Cartesian3.multiplyByScalar(normal, 0.045, new Cesium.Cartesian3()), new Cesium.Cartesian3());
      });

      const ccwShadowPts = (typeof wpEnsureCounterClockwisePoints === 'function')
        ? wpEnsureCounterClockwisePoints(worldShadowPts, normal)
        : worldShadowPts;

      _syncShadowEntity("dyn_obs_terrain_shadow_" + obsIdx, ccwShadowPts);
    });
  }

  // Purgar únicamente sombras que dejaron de existir en este frame
  if (solarSimState.dynamicShadowEntities.length > 0) {
    const retained = [];
    for (let i = 0; i < solarSimState.dynamicShadowEntities.length; i++) {
      const e = solarSimState.dynamicShadowEntities[i];
      if (e && e.id && activeShadowIds.has(e.id)) {
        retained.push(e);
      } else if (e) {
        try { viewer.entities.remove(e); } catch(errRem) {}
      }
    }
    solarSimState.dynamicShadowEntities = retained;
  }
}

function wpUpdateSolarSimulation() {
  if (!solarSimState) window.solarSimState = {};
  const curD = new Date();
  const curH = curD.getHours() + curD.getMinutes() / 60;
  const defH = Math.max(6.0, Math.min(20.0, Math.round(curH * 100) / 100));

  const monthIdx = (typeof solarSimState.monthIdx === "number" && !isNaN(solarSimState.monthIdx)) ? solarSimState.monthIdx : curD.getMonth();
  const hourFloat = (typeof solarSimState.hourFloat === "number" && !isNaN(solarSimState.hourFloat)) ? solarSimState.hourFloat : defH;

  solarSimState.monthIdx = monthIdx;
  solarSimState.hourFloat = hourFloat;
  solarSimState.currentHour = hourFloat;
  const solarPos = wpComputeInstantSolarPosition(monthIdx, hourFloat);
  wpSyncCesiumSun(solarPos);

  if (solarSimState.viewMode === "heatmap") {
    wpClearDynamicShadows();
    wpRenderHeatmapVisuals();
  } else {
    wpRenderDynamicObstacleShadows(solarPos);
    wpUpdatePanelShadingAndMLPE(solarPos);
  }

  // Actualizar FAB flotante y forzar renderizado reactivo en Cesium
  wpUpdateSolarFAB();
  if (typeof viewer !== "undefined" && viewer && viewer.scene && typeof viewer.scene.requestRender === "function") {
    viewer.scene.requestRender();
  }
}

function wpSetSolarMonth(monthIdx) {
  if (typeof monthIdx !== "number" || isNaN(monthIdx)) {
    const curD = new Date();
    monthIdx = (solarSimState && typeof solarSimState.monthIdx === "number") ? solarSimState.monthIdx : curD.getMonth();
  }
  if (!solarSimState) window.solarSimState = {};
  solarSimState.monthIdx = monthIdx;

  const buttons = document.querySelectorAll(".solar-month-btn");
  buttons.forEach((btn, idx) => {
    btn.classList.toggle("active", idx === monthIdx);
  });

  const monthNames = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
  const badge = document.getElementById("solar-season-badge");
  if (badge) {
    if (monthIdx === 11) badge.textContent = "❄️ SOLSTICIO INVIERNO (21 DIC)";
    else if (monthIdx === 5) badge.textContent = "☀️ SOLSTICIO VERANO (21 JUN)";
    else if (monthIdx === 2) badge.textContent = "🍂 EQUINOCCIO (21 MAR)";
    else badge.textContent = "📅 21 " + monthNames[monthIdx];
  }

  // Sincronizar dinámicamente horas reales de amanecer y ocaso en el HUD según coordenadas y mes
  try {
    const lat = (typeof WP !== "undefined" && WP && WP.planes && WP.planes[0] && WP.planes[0].centerCarto)
      ? Cesium.Math.toDegrees(WP.planes[0].centerCarto.latitude)
      : (typeof window !== "undefined" && window.solarProjectConfig && window.solarProjectConfig.lat ? window.solarProjectConfig.lat : 41.3851);
    const lon = (typeof WP !== "undefined" && WP && WP.planes && WP.planes[0] && WP.planes[0].centerCarto)
      ? Cesium.Math.toDegrees(WP.planes[0].centerCarto.longitude)
      : (typeof window !== "undefined" && window.solarProjectConfig && window.solarProjectConfig.lng ? window.solarProjectConfig.lng : 2.1734);

    const sunTimes = wpComputeSunTimes(lat, lon, monthIdx);
    const sunriseLabel = document.getElementById("solar-sunrise-label");
    const sunsetLabel = document.getElementById("solar-sunset-label");
    const slider = document.getElementById("solar-time-slider");

    if (sunriseLabel) sunriseLabel.textContent = sunTimes.sunriseStr + " (Amanecer)";
    if (sunsetLabel) sunsetLabel.textContent = sunTimes.sunsetStr + " (Ocaso)";

    if (slider) {
      const minH = Math.max(4.0, Math.floor(sunTimes.localSunriseDec - 0.5));
      const maxH = Math.min(23.5, Math.ceil(sunTimes.localSunsetDec + 0.5));
      slider.min = minH.toFixed(1);
      slider.max = maxH.toFixed(1);
    }
  } catch(eTimes) {
    if (window.RA && window.RA.log) window.RA.log.debug('Error actualizando sunTimes:', eTimes);
  }

  wpUpdateSolarSimulation();
}

function wpSetSolarHour(hourFloat) {
  if (typeof hourFloat !== "number" || isNaN(hourFloat)) {
    const curD = new Date();
    const curH = curD.getHours() + curD.getMinutes() / 60;
    hourFloat = (solarSimState && typeof solarSimState.hourFloat === "number") ? solarSimState.hourFloat : Math.max(6.0, Math.min(20.0, Math.round(curH * 100) / 100));
  }
  if (!solarSimState) window.solarSimState = {};
  solarSimState.hourFloat = hourFloat;
  solarSimState.currentHour = hourFloat;

  const slider = document.getElementById("solar-time-slider");
  if (slider && Math.abs(parseFloat(slider.value) - hourFloat) > 0.01) {
    slider.value = hourFloat.toFixed(2);
  }

  const display = document.getElementById("solar-time-display");
  if (display) {
    const h = Math.floor(hourFloat);
    const m = Math.floor((hourFloat % 1) * 60);
    const timeStr = String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
    display.textContent = timeStr + (h === 12 && m === 0 ? " h (Mediodía Solar)" : " h");
  }

  wpUpdateSolarSimulation();
}

function wpToggleSolarPlay() {
  if (!solarSimState) window.solarSimState = {};
  solarSimState.isPlaying = !solarSimState.isPlaying;

  const playBtn = document.getElementById("solar-play-btn");
  const playIcon = document.getElementById("solar-play-icon");
  const playText = document.getElementById("solar-play-text");

  if (solarSimState.isPlaying) {
    if (playBtn) playBtn.classList.add("playing");
    if (playIcon) playIcon.textContent = "⏸";
    if (playText) playText.textContent = "PAUSA";

    if (solarSimState.playInterval) clearInterval(solarSimState.playInterval);

    solarSimState.playInterval = setInterval(() => {
      let cur = (typeof solarSimState.hourFloat === "number" && !isNaN(solarSimState.hourFloat)) ? solarSimState.hourFloat : 12.0;
      let nextH = cur + (0.08 * (solarSimState.speed || solarSimState.playSpeed || 1));
      if (nextH > 20.0) nextH = 6.0;
      wpSetSolarHour(nextH);
    }, 40);
  } else {
    if (playBtn) playBtn.classList.remove("playing");
    if (playIcon) playIcon.textContent = "▶";
    if (playText) playText.textContent = "PLAY";

    if (solarSimState.playInterval) {
      clearInterval(solarSimState.playInterval);
      solarSimState.playInterval = null;
    }
  }
}

function wpSetSolarSpeed(spd) {
  if (!solarSimState) window.solarSimState = {};
  solarSimState.speed = spd;
  solarSimState.playSpeed = spd;
  [1, 3, 5].forEach(s => {
    const b = document.getElementById("btn-speed-" + s + "x");
    if (b) b.classList.toggle("active", s === spd);
  });
  showStatus("VELOCIDAD SOLAR: " + spd + "x", 1200);
}

  // ── EXPORTACIÓN AL NAMESPACE GLOBAL Y WINDOW.RA ─────────────────────────────
  global.RA = global.RA || {};
  global.RA.solar = {
    CONSTANTS: SOLAR_ENGINE_CONSTANTS,
    degToRad: degToRad,
    radToDeg: radToDeg,
    normalizeAzimuth: normalizeAzimuth,
    clampGE: clampGE,
    v3: v3,
    v3Sub: v3Sub,
    v3Scale: v3Scale,
    v3Dot: v3Dot,
    v3Cross: v3Cross,
    v3Len: v3Len,
    v3Norm: v3Norm,
    normalFromTiltAzimuth: normalFromTiltAzimuth,
    planeNormalFromThreePoints: planeNormalFromThreePoints,
    slopeFromNormal: slopeFromNormal,
    slopeFromThreePoints: slopeFromThreePoints,
    azimuthFromNormal: azimuthFromNormal,
    azimuthFromLine: azimuthFromLine,
    getDayOfYear: getDayOfYear,
    solarAzimuthAtan2: solarAzimuthAtan2,
    sunVector: sunVector,
    solarPosition: solarPosition,
    incidenceAngle: incidenceAngle,
    moduleProjectedSize: moduleProjectedSize,
    rowSpacing: rowSpacing,
    gapBetweenRows: gapBetweenRows,
    obstacleShadowLength: obstacleShadowLength,
    obstacleShadowVector: obstacleShadowVector,
    projectShadowPolygon: projectShadowPolygon,
    rayHitsAABB: rayHitsAABB,
    rayCastingIsShaded: rayCastingIsShaded,
    computeHighPrecisionSolarPosition: computeHighPrecisionSolarPosition,
    computePOAIrradiance: computePOAIrradiance,
    computeCellTemperature: computeCellTemperature,
    solarDeclination: solarDeclination,
    hourAngle: hourAngle,
    solarAltitude: solarAltitude,
    solarAzimuth: solarAzimuth,
    calcPOA: calcPOA,
    calcIAM: calcIAM,
    calcTcell: calcTcell,
    calcPpanel: calcPpanel,
    invEfficiency: invEfficiency,
    getClimaticZone: getClimaticZone,
    estimateMonthlyGHI: estimateMonthlyGHI,
    runPhysicalModel: runPhysicalModel,
    runPVGISCalc: runPVGISCalc,
    runNASAPower: runNASAPower,
    runPVsystCompatible: runPVsystCompatible,
    wpComputeInstantSolarPosition: wpComputeInstantSolarPosition,
    wpSyncCesiumSun: wpSyncCesiumSun,
    wpClearDynamicShadows: wpClearDynamicShadows,
    wpRenderDynamicObstacleShadows: wpRenderDynamicObstacleShadows,
    wpUpdateSolarSimulation: wpUpdateSolarSimulation,
    wpSetSolarMonth: wpSetSolarMonth,
    wpSetSolarHour: wpSetSolarHour,
    wpToggleSolarPlay: wpToggleSolarPlay,
    wpSetSolarSpeed: wpSetSolarSpeed,
    wpComputeSunTimes: wpComputeSunTimes
  };

  global.SOLAR_ENGINE_CONSTANTS = SOLAR_ENGINE_CONSTANTS;
  global.degToRad = degToRad;
  global.radToDeg = radToDeg;
  global.normalizeAzimuth = normalizeAzimuth;
  global.clampGE = clampGE;
  global.v3 = v3;
  global.v3Sub = v3Sub;
  global.v3Scale = v3Scale;
  global.v3Dot = v3Dot;
  global.v3Cross = v3Cross;
  global.v3Len = v3Len;
  global.v3Norm = v3Norm;
  global.normalFromTiltAzimuth = normalFromTiltAzimuth;
  global.planeNormalFromThreePoints = planeNormalFromThreePoints;
  global.slopeFromNormal = slopeFromNormal;
  global.slopeFromThreePoints = slopeFromThreePoints;
  global.azimuthFromNormal = azimuthFromNormal;
  global.azimuthFromLine = azimuthFromLine;
  global.getDayOfYear = getDayOfYear;
  global.solarAzimuthAtan2 = solarAzimuthAtan2;
  global.sunVector = sunVector;
  global.solarPosition = solarPosition;
  global.incidenceAngle = incidenceAngle;
  global.moduleProjectedSize = moduleProjectedSize;
  global.rowSpacing = rowSpacing;
  global.gapBetweenRows = gapBetweenRows;
  global.obstacleShadowLength = obstacleShadowLength;
  global.obstacleShadowVector = obstacleShadowVector;
  global.projectShadowPolygon = projectShadowPolygon;
  global.rayHitsAABB = rayHitsAABB;
  global.rayCastingIsShaded = rayCastingIsShaded;
  global.computeHighPrecisionSolarPosition = computeHighPrecisionSolarPosition;
  global.computePOAIrradiance = computePOAIrradiance;
  global.computeCellTemperature = computeCellTemperature;
  global.solarDeclination = solarDeclination;
  global.hourAngle = hourAngle;
  global.solarAltitude = solarAltitude;
  global.solarAzimuth = solarAzimuth;
  global.calcPOA = calcPOA;
  global.calcIAM = calcIAM;
  global.calcTcell = calcTcell;
  global.calcPpanel = calcPpanel;
  global.invEfficiency = invEfficiency;
  global.getClimaticZone = getClimaticZone;
  global.estimateMonthlyGHI = estimateMonthlyGHI;
  global.getRobustMonthlyGHI = getRobustMonthlyGHI;
  global.runPhysicalModel = runPhysicalModel;
  global.runPVGISCalc = runPVGISCalc;
  global.runNASAPower = runNASAPower;
  global.runPVsystCompatible = runPVsystCompatible;
  global.setShadingStrategy = function(s) {
    const clean = (s === 'exclude') ? 'exclude' : 'mlpe';
    _seShadingStrategy = clean;
    global.shadingStrategy = clean;
    if (global.solarProjectConfig) global.solarProjectConfig.shadingStrategy = clean;
  };
  global.wpComputeInstantSolarPosition = wpComputeInstantSolarPosition;
  global.wpSyncCesiumSun = wpSyncCesiumSun;
  global.wpClearDynamicShadows = wpClearDynamicShadows;
  global.wpToggleShadowPlanes = wpToggleShadowPlanes;
  global.wpRenderDynamicObstacleShadows = wpRenderDynamicObstacleShadows;
  global.wpUpdateSolarSimulation = wpUpdateSolarSimulation;
  global.wpSetSolarMonth = wpSetSolarMonth;
  global.wpSetSolarHour = wpSetSolarHour;
  global.wpToggleSolarPlay = wpToggleSolarPlay;
  global.wpSetSolarSpeed = wpSetSolarSpeed;
  global.computeInterRowPitch = computeInterRowPitch;
  global.computeTiltYieldCurve = computeTiltYieldCurve;
  global.wpComputeSunTimes = wpComputeSunTimes;

})(typeof window !== 'undefined' ? window : globalThis);
