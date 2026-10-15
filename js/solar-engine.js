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

  const SOLAR_ENGINE_CONSTANTS = {
    RHO_CU_20: 0.017241,
    ALPHA_CU: 0.00393,
    RHO_CU_90: 0.023,    // [P1] valor unificado del proyecto (antes 0.02244; AGENTS.md §8)
    RHO_AL_90: 0.03620,
    G_STC: 1000,
    T_STC: 25,
    T_MIN_SPAIN: -10,
    T_AMB_MAX_SPAIN: 40,
    CO2_FACTOR_SPAIN: 0.259
  };
  const GE_EPSILON = 1e-6;

  // Constantes de simulación (espejo de las definidas en financials.js; este
  // módulo debe ser autónomo y no depender del orden de carga de otros módulos)
  const SOLAR_CONST = 1367; // W/m² Constante Solar (WMO)
  const MONTH_DAYS_SIM = [31,28,31,30,31,30,31,31,30,31,30,31];
  const T_AMB_MONTHLY_ESP = {
    costal_med: [11.0,12.0,14.0,16.0,20.0,25.0,28.0,28.5,24.0,19.0,14.0,11.0],
    interior:   [5.0, 7.0,10.0,12.0,17.0,23.0,27.0,27.0,22.0,15.0, 9.0, 5.0],
    atlantico:  [9.0,10.0,12.0,13.0,16.0,19.0,21.0,21.5,19.0,15.0,11.0, 9.0]
  };
  const PVGIS_PROXIES = {
    allorigins: 'https://api.allorigins.win/raw?url=',
    codetabs: 'https://api.codetabs.com/v1/proxy?quest=',
    corsproxy: 'https://corsproxy.io/?url='
  };
  function getShadingStrategy() { return _seShadingStrategy; }
  let _seShadingStrategy = 'mlpe';
  let lastAnalysisResults = null;

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
  const phi = degToRad(latDeg);
  const delta = degToRad(declDeg);
  const omega = degToRad(haDeg);
  // sin(δ)·cos(φ) − cos(δ)·sin(φ)·cos(ω) = cos(alt)·cos(Az) — el numerador
  // debe llevar cos(alt)·sin(Az) = −sin(ω)·cos(δ). Sin el cos(δ) el acimut
  // desviaba ~2-3° en solsticios y latitudes altas.
  const A = Math.atan2(
    -Math.sin(omega) * Math.cos(delta),
    Math.sin(delta) * Math.cos(phi) - Math.cos(delta) * Math.sin(phi) * Math.cos(omega)
  );
  return normalizeAzimuth(radToDeg(A));
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

function computeHighPrecisionSolarPosition(latDeg, lonDeg, doy, solarDecimalHour) {
  const latRad = (typeof Cesium !== 'undefined' && Cesium.Math) ? Cesium.Math.toRadians(latDeg) : (latDeg * Math.PI) / 180;
  const gamma = (2 * Math.PI / 365) * (doy - 1 + (solarDecimalHour - 12) / 24);

  // Ecuación del Tiempo (Et en minutos)
  const Et = 229.18 * (
    0.000075 +
    0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma) -
    0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma)
  );

  // Declinación Solar precisa (Spencer)
  const declRad = 0.006918 -
    0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);

  // Tiempo Solar Verdadero y Ángulo Horario (omega)
  const solarTime = solarDecimalHour + (4 * lonDeg + Et) / 60;
  const omegaRad = ((solarTime - 12) * 15 * Math.PI) / 180;

  // Altitud Solar (Elevación)
  const sinElev = Math.sin(latRad) * Math.sin(declRad) + Math.cos(latRad) * Math.cos(declRad) * Math.cos(omegaRad);
  const elevRad = Math.asin(Math.max(-1, Math.min(1, sinElev)));
  const elevDeg = (elevRad * 180) / Math.PI;

  // Acimut Solar (0° = Sur, Este = -90°, Oeste = +90°)
  let azRad = 0;
  if (elevDeg > 0.01) {
    const cosAz = (Math.sin(declRad) * Math.cos(latRad) - Math.cos(declRad) * Math.sin(latRad) * Math.cos(omegaRad)) / Math.cos(elevRad);
    const safeCos = Math.max(-1, Math.min(1, cosAz));
    azRad = Math.acos(safeCos);
    if (Math.sin(omegaRad) > 0) azRad = 2 * Math.PI - azRad;
  }
  const azDegFromNorth = (azRad * 180) / Math.PI;
  const azDegFromSouth = azDegFromNorth > 180 ? azDegFromNorth - 360 : azDegFromNorth;

  return {
    elevDeg: Math.max(0, elevDeg),
    elevRad: elevRad,
    azDegFromSouth: azDegFromSouth,
    azDegFromNorth: azDegFromNorth,
    declDeg: (declRad * 180) / Math.PI,
    EtMinutes: Et,
    isDay: elevDeg > 0
  };
}

function computePOAIrradiance(G_ghi, latDeg, tiltDeg, azSurDeg, sunElevDeg, sunAzSurDeg, albedo = 0.20) {
  // [B2] Motor único de radiación (Erbs + Hay-Davies) — SSOT en js/radiation-engine.js
  if (typeof global !== 'undefined' && global.RA && global.RA.Radiation && typeof global.RA.Radiation.poa === 'function') {
    return global.RA.Radiation.poa(G_ghi, latDeg, tiltDeg, azSurDeg, sunElevDeg, sunAzSurDeg, albedo);
  }
  // Fallback para entornos sin el módulo (p. ej. tests aislados)
  if (sunElevDeg <= 0 || G_ghi <= 0) return { G_poa: 0, G_b: 0, G_d: 0, G_r: 0, iamFactor: 1 };

  const tiltRad = (tiltDeg * Math.PI) / 180;
  const sunElevRad = (sunElevDeg * Math.PI) / 180;
  const deltaAzRad = ((sunAzSurDeg - azSurDeg) * Math.PI) / 180;

  // Coseno del ángulo de incidencia solar (theta) sobre el módulo
  const cosIncidence = Math.sin(sunElevRad) * Math.cos(tiltRad) +
                       Math.cos(sunElevRad) * Math.sin(tiltRad) * Math.cos(deltaAzRad);
  const cosTheta = Math.max(0, Math.min(1, cosIncidence));
  const incAngleDeg = (Math.acos(cosTheta) * 180) / Math.PI;

  // Separación empírica Erbs
  const kt = Math.min(0.85, Math.max(0.1, G_ghi / (1367 * Math.sin(sunElevRad) + 1e-3)));
  let df = 0.22;
  if (kt < 0.22) df = 1.0 - 0.09 * kt;
  else if (kt < 0.80) df = 0.9511 - 0.1604 * kt + 4.388 * Math.pow(kt, 2) - 16.638 * Math.pow(kt, 3) + 12.336 * Math.pow(kt, 4);
  else df = 0.165;

  const G_dhi = G_ghi * df;
  const G_dni = (G_ghi - G_dhi) / (Math.sin(sunElevRad) + 1e-4);

  // Componente Directa (Beam)
  const G_b_poa = Math.max(0, G_dni * cosTheta);

  // Componente Difusa Anisotrópica (Hay-Davies)
  const Ai = G_dni / 1367;
  const G_d_poa = G_dhi * (Ai * (cosTheta / Math.sin(sunElevRad)) + (1 - Ai) * ((1 + Math.cos(tiltRad)) / 2));

  // Componente Reflejada (Albedo)
  const G_r_poa = G_ghi * albedo * ((1 - Math.cos(tiltRad)) / 2);

  // Modificador de Ángulo de Incidencia (IAM - ASHRAE)
  const b0 = 0.05;
  const iamFactor = (cosTheta > 0.01) ? Math.max(0, 1 - b0 * ((1 / cosTheta) - 1)) : 0;

  const G_poa_raw = G_b_poa + G_d_poa + G_r_poa;
  const G_poa_effective = G_poa_raw * (0.85 + 0.15 * iamFactor);

  return {
    G_poa: G_poa_effective,
    G_b: G_b_poa,
    G_d: G_d_poa,
    G_r: G_r_poa,
    incAngleDeg: incAngleDeg,
    iamFactor: iamFactor
  };
}

function computeCellTemperature(T_amb, G_poa, isRoofMounted = true, windSpeed = 1.5) {
  const u0 = isRoofMounted ? 26.0 : 29.0;
  const u1 = isRoofMounted ? 1.3 : 1.5;
  const eta_stc = 0.215;
  return T_amb + (G_poa / (u0 + u1 * windSpeed)) * (1 - eta_stc / 0.9);
}

function solarDeclination(dayOfYear) {
  const B = (2 * Math.PI / 365) * (dayOfYear - 1);
  return 23.45 * Math.sin((2 * Math.PI / 365) * (284 + dayOfYear));
}

function hourAngle(hourSolar) {
  return 15 * (hourSolar - 12); // degrees
}

function solarAltitude(latDeg, declDeg, haDeg) {
  const lat = latDeg * Math.PI / 180;
  const decl = declDeg * Math.PI / 180;
  const ha = haDeg * Math.PI / 180;
  const sinAlt = Math.sin(lat)*Math.sin(decl) + Math.cos(lat)*Math.cos(decl)*Math.cos(ha);
  return Math.asin(Math.max(Math.min(sinAlt, 1), -1)) * 180 / Math.PI;
}

function solarAzimuth(latDeg, declDeg, haDeg, altDeg) {
  const lat = latDeg * Math.PI / 180;
  const decl = declDeg * Math.PI / 180;
  const ha = haDeg * Math.PI / 180;
  const alt = altDeg * Math.PI / 180;
  if (Math.cos(alt) < 0.001) return 0;
  let cosAz = (Math.sin(decl) - Math.sin(alt)*Math.sin(lat)) / (Math.cos(alt)*Math.cos(lat));
  cosAz = Math.max(Math.min(cosAz, 1), -1);
  let az = Math.acos(cosAz) * 180 / Math.PI;
  if (ha > 0) az = 360 - az;
  return az;
}

function calcPOA(GHI, DHI, latDeg, tiltDeg, azimutPanelDeg, dayOfYear, hourSolar) {
  if (GHI <= 0) return 0;
  // [B2] Motor único de radiación: calcular geometría solar y delegar en RA.Radiation.poa
  if (typeof global !== 'undefined' && global.RA && global.RA.Radiation && typeof global.RA.Radiation.poa === 'function') {
    const decl = solarDeclination(dayOfYear);
    const ha = hourAngle(hourSolar);
    const altDeg = solarAltitude(latDeg, decl, ha);
    if (altDeg <= 0) return 0;
    const azFromNorth = solarAzimuthAtan2(latDeg, decl, ha);
    // Compass (0°=N, 180°=S) → convención Sur del motor (0°=S, -90°=E, +90°=O). Rango [-180,180).
    const sunAzSur = azFromNorth - 180;
    // azimutPanelDeg llega en convención brújula (180°=Sur); el motor usa 0°=Sur
    const panelAzSur = azimutPanelDeg - 180;
    return global.RA.Radiation.poa(GHI, latDeg, tiltDeg, panelAzSur, altDeg, sunAzSur, 0.20).G_poa;
  }
  // Fallback legacy (Perez simplificado) para entornos sin el módulo
  const DNI = Math.max((GHI - DHI) / Math.max(Math.sin(solarAltitude(latDeg, solarDeclination(dayOfYear), hourAngle(hourSolar)) * Math.PI / 180), 0.01), 0);

  const tilt = tiltDeg * Math.PI / 180;
  const decl = solarDeclination(dayOfYear) * Math.PI / 180;
  const ha   = hourAngle(hourSolar) * Math.PI / 180;
  const lat  = latDeg * Math.PI / 180;

  // Incidence angle on tilted plane
  // Convención Duffie & Beckman: gamma = 0° es Sur, +90° Oeste, -90° Este, 180° Norte.
  // La aplicación utiliza la convención náutica / brújula: 0° Norte, 90° Este, 180° Sur, 270° Oeste.
  // Transformación canónica: gamma_Duffie = azimutPanelDeg - 180°.
  const azPanel = (azimutPanelDeg - 180) * Math.PI / 180;
  const cosTheta = (
    Math.sin(decl)*Math.sin(lat)*Math.cos(tilt)
    - Math.sin(decl)*Math.cos(lat)*Math.sin(tilt)*Math.cos(azPanel)
    + Math.cos(decl)*Math.cos(lat)*Math.cos(tilt)*Math.cos(ha)
    + Math.cos(decl)*Math.sin(lat)*Math.sin(tilt)*Math.cos(azPanel)*Math.cos(ha)
    + Math.cos(decl)*Math.sin(tilt)*Math.sin(azPanel)*Math.sin(ha)
  );

  // Rb = ratio de haz (cosθ inclinado / cosθ horizontal = cos cenital).
  // El cos cenital REQUIERE el factor cos(ω); sin él solo es válido a mediodía.
  // NOTA: Rb no se usa en el retorno (el directo va con DNI·cosTheta);
  // se mantiene corregido como referencia del ratio de haz.
  const Rb = Math.max(cosTheta, 0) / Math.max(Math.sin(lat)*Math.sin(decl) + Math.cos(lat)*Math.cos(decl)*Math.cos(ha), 0.01);

  // Perez diffuse model (simplified F1/F2 coefficients)
  const eps = (DNI > 1) ? (DHI + DNI) / DHI + 5.535e-6 * Math.pow(hourAngle(hourSolar), 3) : 1.0;
  const Delta = DHI / SOLAR_CONST * (1 + 0.033 * Math.cos(2 * Math.PI * dayOfYear / 365));
  const F1 = Math.max(0.041 * (eps - 1) - 0.002 * Delta, 0);
  const F2 = 0.012 * (eps - 1) - 0.011 * Delta;

  const a = Math.max(cosTheta, 0);
  const b = Math.max(Math.cos(85 * Math.PI / 180), 0.087);
  const skyDiffuse = DHI * ((1 - F1) * (1 + Math.cos(tilt)) / 2 + F1 * (a / b) + F2 * Math.sin(tilt));

  const albedo = 0.20;
  const groundReflected = GHI * albedo * (1 - Math.cos(tilt)) / 2;

  return Math.max(DNI * Math.max(cosTheta, 0) + skyDiffuse + groundReflected, 0);
}

function calcIAM(cosTheta) {
  const b0 = 0.05;
  if (cosTheta <= 0) return 0;
  const theta = Math.acos(Math.min(cosTheta, 1));
  return Math.max(1 - b0 * (1 / Math.cos(theta) - 1), 0);
}

function calcTcell(Tamb, GPOA, NOCT=45) {
  return Tamb + (NOCT - 20) * GPOA / 800;
}

function calcPpanel(Pstc, GPOA, Tcell, gamma=-0.0034) {
  if (GPOA <= 10) return 0;
  const kT = 1 + gamma * (Tcell - 25);
  const kG = GPOA / 1000;
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
  if (lonDeg > -2 && latDeg < 42) return 'costal_med';
  if (lonDeg > -5 && latDeg < 40) return 'interior';
  return 'atlantico';
}

function estimateMonthlyGHI(latDeg, monthIdx) {
  // Simplified monthly clearness index model (Kt) for Spain
  const KT_BASE = [0.55,0.58,0.60,0.60,0.60,0.64,0.68,0.68,0.62,0.57,0.52,0.50];
  // En el hemisferio norte, la radiación solar horizontal decrece con la latitud (+Norte)
  const latFactor = 1 - (latDeg - 40) * 0.008;
  const extraterrestrial = []; // Extraterrestrial on horizontal
  const midDay = [17,47,75,105,135,162,198,228,258,288,318,344];
  for (let m = 0; m < 12; m++) {
    const doy = midDay[m];
    const decl = solarDeclination(doy) * Math.PI / 180;
    const lat = latDeg * Math.PI / 180;
    const ws = Math.acos(-Math.tan(lat) * Math.tan(decl));
    const Ho = (24 / Math.PI) * SOLAR_CONST * (1 + 0.033 * Math.cos(2 * Math.PI * doy / 365))
              * (ws * Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.sin(ws));
    extraterrestrial.push(Ho);
  }
  return extraterrestrial[monthIdx] * KT_BASE[monthIdx] * latFactor;
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
  const loss_wiring   = _lc ? _lc.wiring : 0.015;
  const loss_mismatch = _lc ? _lc.mismatch : 0.020;
  const loss_soiling  = _lc ? _lc.soiling : 0.025;
  const loss_avail    = _lc ? _lc.availability : 0.005;
  const _seShade = getShadingStrategy();
  const loss_mlpe_bonus = (_seShade === 'mlpe' && lastAnalysisResults && lastAnalysisResults.mlpeCount > 0) ? 0.005 : 0;

  let monthlyYields = [];
  let totalAnnualWh = 0;
  let totalTempLoss = 0, totalIAMLoss = 0, totalSoilingLoss = 0;
  let totalGPOA = 0, totalGSTC = 0;
  let totalClippedWh = 0;

  const HOURS_PER_DAY = 24;
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
    const sunriseHour = 12 - (Math.acos(-Math.tan(latDeg * Math.PI / 180) * Math.tan(decl * Math.PI / 180)) * 180 / Math.PI) / 15;
    const sunsetHour = 24 - sunriseHour;

    for (let h = Math.floor(sunriseHour); h <= Math.ceil(sunsetHour); h++) {
      const ha = hourAngle(h);
      const altDeg = solarAltitude(latDeg, decl, ha);
      if (altDeg <= 0) continue;

      const sinAlt = Math.sin(altDeg * Math.PI / 180);
      // GHI_monthly está en Wh/m²/día. Distribución sinusoidal diurna (integral diurna = GHI_monthly):
      const dayLen = Math.max(sunsetHour - sunriseHour, 1);
      const GHI_instant = Math.max((GHI_monthly / dayLen) * (Math.PI / 2) * sinAlt, 0); // W/m²

      // [B2] Motor único de radiación (Erbs + Hay-Davies). Geometría del azimut solar desde el Sur.
      const azFromNorth = solarAzimuthAtan2(latDeg, decl, ha);
      // Compass (0°=N, 180°=S) → convención Sur del motor (0°=S, -90°=E, +90°=O). Rango [-180,180).
      const azSur = azFromNorth - 180;
      // azimutDeg llega en convención brújula (180°=Sur); el motor usa 0°=Sur
      const poa = computePOAIrradiance(GHI_instant, latDeg, tiltDeg, azimutDeg - 180, altDeg, azSur, 0.20);
      const GPOA = poa.G_poa;
      const iamFactor = poa.iamFactor;
      const Tcell = calcTcell(tAmb[m], GPOA, NOCT);

      const P_raw = calcPpanel(Pstc * kwp * 1000 / Pstc, GPOA, Tcell, gamma);
      const tempLossW = calcPpanel(Pstc * kwp * 1000 / Pstc, GPOA, 25, gamma) - P_raw;

      const loadFrac = P_raw / (kwp * 1000 * 1.1);
      const eta_inv = invEfficiency(loadFrac);
      let P_ac = P_raw * (1 - loss_wiring) * (1 - loss_mismatch) * (1 - loss_soiling) * (1 - loss_avail) * eta_inv;
      if (pAcNominal > 0 && P_ac > pAcNominal) {
        totalClippedWh += P_ac - pAcNominal;
        P_ac = pAcNominal;
      }

      monthlyWh += P_ac;
      totalGPOA += GPOA * nDays;
      totalGSTC += 1000 * nDays;
      if (GHI_instant > 10) {
        mTempLoss += tempLossW;
        mIAMLoss += P_raw * (1 - iamFactor);
      }
    }

    const monthlyKWh = monthlyWh * nDays / 1000;
    monthlyYields.push(Math.round(monthlyKWh));
    totalAnnualWh += monthlyWh * nDays;
    totalTempLoss += mTempLoss * nDays;
    totalIAMLoss += mIAMLoss * nDays;
    totalSoilingLoss += monthlyWh * nDays * loss_soiling;
  }

  const annualKWh = totalAnnualWh / 1000;
  const PR = annualKWh / (kwp * (totalGPOA / 1000 + 0.001));

  // Cascade losses (for waterfall chart)
  const stcNominal = kwp * 1000 * 8760 * 0.12; // rough nominal
  const cascadeLosses = {
    stc: kwp * 1000,
    irrad: -stcNominal * 0.08,
    temp: -totalTempLoss / 1000,
    iam: -totalIAMLoss / 1000,
    shading: -annualKWh * 0.03,
    soiling: -annualKWh * loss_soiling,
    mismatch: -annualKWh * loss_mismatch,
    wiring: -annualKWh * loss_wiring,
    inverter: -annualKWh * 0.025,
    net: annualKWh
  };

  return {
    annualKWh: Math.round(annualKWh),
    monthlyKWh: monthlyYields,
    PR: Math.max(Math.min(PR, 0.90), 0.60),
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

    return { monthlyGHI_kWhm2: monthlyGHI, source: 'NASA POWER (20 años)' };
  } catch(e) {
    clearTimeout(timer);
    return { error: e.message || 'Timeout', source: 'NASA POWER' };
  }
}

function runPVsystCompatible(kwp, latDeg, lonDeg, tiltDeg, azimutDeg, cfg, physicalResult) {
  if (!physicalResult || !physicalResult.annualKWh) return null;

  // Apply additional PVsyst-specific correction factors
  const _lc2 = (typeof window !== 'undefined' && window.solarLossConfig) ? window.solarLossConfig : null;
  const loss_iam_angular = _lc2 ? _lc2.iamAngular : 0.028;  // configurable (Paso 4)
  const loss_spectral    = _lc2 ? _lc2.spectral : 0.010;    // configurable (Paso 4)
  const loss_bypass      = getShadingStrategy() === 'mlpe' ? (_lc2 ? _lc2.bypassMlpe : 0.005) : (_lc2 ? _lc2.bypass : 0.025);
  const loss_lid         = cfg.tecnologia && cfg.tecnologia.includes('N-Type') ? 0.000 : 0.015; // LID only in p-type

  const totalExtraLoss = loss_iam_angular + loss_spectral + loss_bypass + loss_lid;
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

async function runEnergyComparison() {
  if (polygonPoints.length < 3) {
    showToast('POLÍGONO REQUERIDO', 'Traza primero el polígono de la cubierta para obtener los parámetros.', 'warning');
    switchSidebarTab('geometria');
    return;
  }

  const btn = document.getElementById('btn-run-analysis');
  if (btn) { btn.textContent = '⏳ ANALIZANDO... CONSULTANDO APIs'; btn.disabled = true; }

  const d = getProjectCalcs();
  const kwp = d.kwp || 5.0;
  const latDeg = d.latDeg || 40.4;
  const lonDeg = d.lonDeg || -3.7;
  const tiltDeg = d.tiltDeg || 30;
  const azimutDeg = d.azimutDeg || 0;
  const cfg = d.cfg;

  // Loss percentage for PVGIS (all system losses)
  const lossPercent = 14;

  showStatus('CONSULTANDO PVGIS API v5 (JRC EUROPA)...', 3000);

  // Run all engines concurrently
  const [pvgisResult, nasaResult] = await Promise.all([
    runPVGISCalc(kwp, latDeg, lonDeg, tiltDeg, azimutDeg, lossPercent),
    runNASAPower(latDeg, lonDeg)
  ]);

  const nasaGHI = (nasaResult && !nasaResult.error && Array.isArray(nasaResult.monthlyGHI_kWhm2)) ? nasaResult.monthlyGHI_kWhm2 : null;
  const physicalResult = runPhysicalModel(kwp, latDeg, lonDeg, tiltDeg, azimutDeg, cfg, nasaGHI);
  const pvsystResult = runPVsystCompatible(kwp, latDeg, lonDeg, tiltDeg, azimutDeg, cfg, physicalResult);

  // Current motor (existing simple model)
  const simpleAnnual = d.annualYieldKWh;
  const simpleResult = {
    source: 'Estimación Paramétrica (Motor Actual)',
    annualKWh: Math.round(simpleAnnual),
    PR: 0.80,
    sigma: simpleAnnual * 0.20
  };

  lastAnalysisResults = {
    pvgis: pvgisResult,
    physical: physicalResult,
    pvsyst: pvsystResult,
    simple: simpleResult,
    nasa: nasaResult,
    kwp, latDeg, lonDeg, tiltDeg, azimutDeg,
    mlpeCount: d.mlpeCount || 0
  };

  // Aviso contextual si PVGIS no pudo conectarse
  const pvgisHint = document.getElementById('cfg-pvgis-hint');
  if (pvgisHint) {
    if (pvgisResult && pvgisResult.error) {
      const fileMode = typeof window !== 'undefined' && window.location && window.location.protocol === 'file:';
      pvgisHint.style.display = 'block';
      pvgisHint.innerHTML = fileMode
        ? '⚠ PVGIS sin conexión: la app se abre como archivo local (<b>file://</b>) y el navegador bloquea CORS hacia PVGIS (origen null). Sirve la carpeta por HTTP (<b>python -m http.server</b> → http://localhost:8000) o usa un proxy propio en "Prefijo proxy".'
        : '⚠ PVGIS sin conexión (' + (pvgisResult.error || 'error') + '). Prueba otro proxy en el desplegable o sirve la app por HTTPS para conectar directo.';
    } else {
      pvgisHint.style.display = 'none';
    }
  }

  if (btn) { btn.textContent = '⚡ EJECUTAR ANÁLISIS COMPARATIVO ENERGÉTICO'; btn.disabled = false; }

  renderAnalysisResults(lastAnalysisResults);
  showStatus('✓ ANÁLISIS COMPARATIVO COMPLETADO', 3000);
}

function renderAnalysisResults(r) {
  // Show all cards
  ['analysis-confidence-bar','analysis-results-card','analysis-waterfall-card','analysis-daily-card','analysis-p50p90-card','analysis-geometry-card'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'flex';
  });

  // Motor geométrico y solar (algoritmos del documento RA)
  renderGeometryAnalysis(r);

  const pvgisOK = r.pvgis && !r.pvgis.error;
  const nasaOK = r.nasa && !r.nasa.error;
  const reference = pvgisOK ? r.pvgis.annualKWh : r.physical.annualKWh;

  // Confidence badge
  const badgeEl = document.getElementById('analysis-confidence-badge');
  const detailEl = document.getElementById('analysis-confidence-detail');
  if (badgeEl) {
    if (pvgisOK) {
      badgeEl.textContent = '● ALTA CONFIANZA (PVGIS + Físico)';
      badgeEl.style.background = '#10b981';
    } else {
      badgeEl.textContent = '⚠ MEDIA (Físico offline — sin PVGIS)';
      badgeEl.style.background = '#f59e0b';
      badgeEl.style.color = '#000';
    }
  }
  if (detailEl) {
    detailEl.textContent = `PVGIS: ${pvgisOK ? '✓' : '✗ ' + (r.pvgis.error || 'Offline')} | NASA POWER: ${nasaOK ? '✓ (20 años)' : '✗ Offline'} | Modelo Físico IEC: ✓ | PVsyst-Compat: ✓`;
  }

  // Comparative Table
  const tableWrap = document.getElementById('analysis-table-wrap');
  if (tableWrap) {
    const motors = [
      { name: 'Estimación Paramétrica', icon: '📊', kwh: r.simple.annualKWh, pr: r.simple.PR, sigma: r.simple.sigma, ok: true },
      { name: 'PVGIS v5 · SARAH-3 (JRC)', icon: '🛰', kwh: pvgisOK ? r.pvgis.annualKWh : null, pr: pvgisOK ? r.pvgis.PR : null, sigma: pvgisOK ? r.pvgis.sigma : null, ok: pvgisOK },
      { name: 'Modelo Físico IEC 61724' + (r.physical.clippingPct > 0.5 ? ' (clip ' + r.physical.clippingPct + '%)' : ''), icon: '⚛', kwh: r.physical.annualKWh, pr: r.physical.PR, sigma: r.physical.sigma, ok: true },
      { name: 'PVsyst-Compatible (IEC 62548)', icon: '🔬', kwh: r.pvsyst ? r.pvsyst.annualKWh : null, pr: r.pvsyst ? r.pvsyst.PR : null, sigma: r.pvsyst ? r.pvsyst.sigma : null, ok: !!r.pvsyst }
    ];

    let tableHTML = `<table style="width:100%;border-collapse:collapse;font-size:9.5px;margin:4px 0;">
      <thead>
        <tr style="background:rgba(0,0,0,0.4);color:var(--text-slate-300);">
          <th style="padding:6px 8px;text-align:left;border-bottom:1px solid rgba(255,255,255,0.1);">Motor</th>
          <th style="padding:6px 8px;text-align:right;">kWh/año</th>
          <th style="padding:6px 8px;text-align:right;">PR</th>
          <th style="padding:6px 8px;text-align:right;">vs PVGIS</th>
          <th style="padding:6px 8px;text-align:right;">P90</th>
        </tr>
      </thead><tbody>`;

    motors.forEach(m => {
      if (!m.ok || m.kwh === null) {
        tableHTML += `<tr style="opacity:0.5;"><td style="padding:6px 8px;"><span>${m.icon} ${m.name}</span></td><td colspan="4" style="text-align:center;color:var(--text-slate-400);">Sin conexión / offline</td></tr>`;
        return;
      }
      const diff = reference > 0 ? ((m.kwh - reference) / reference * 100) : 0;
      const diffColor = Math.abs(diff) < 5 ? '#10b981' : (Math.abs(diff) < 15 ? '#f59e0b' : '#ef4444');
      const p90 = Math.round(m.kwh - 1.28 * m.sigma);
      tableHTML += `<tr style="border-bottom:1px solid rgba(255,255,255,0.06);">
        <td style="padding:6px 8px;font-weight:600;">${m.icon} ${m.name}</td>
        <td style="padding:6px 8px;text-align:right;font-family:var(--font-mono);color:#fff;">${m.kwh.toLocaleString('es-ES')}</td>
        <td style="padding:6px 8px;text-align:right;font-family:var(--font-mono);">${(m.pr * 100).toFixed(1)}%</td>
        <td style="padding:6px 8px;text-align:right;font-weight:800;color:${diffColor};">${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%</td>
        <td style="padding:6px 8px;text-align:right;font-family:var(--font-mono);color:var(--amber-400);">${p90.toLocaleString('es-ES')}</td>
      </tr>`;
    });

    tableHTML += '</tbody></table>';
    tableWrap.innerHTML = tableHTML;
  }

  // Waterfall chart
  renderWaterfallChart(r.physical.cascadeLosses, r.physical.annualKWh);

  // Daily curves
  showDailyCurve('summer');

  // P50/P90 indicators — Monte Carlo simulation
  const baseKWh = pvgisOK ? r.pvgis.annualKWh : r.physical.annualKWh;

  // Run Monte Carlo simulation (5000 iterations)
  function runMonteCarloP50P90(baseAnnual, sources) {
    const mcSamples = [];
    const numIterations = 5000;

    // Uncertainty sources (relative % standard deviation)
    const uncertaintySources = {
      irradiance: 0.045,  // ±4.5% solar resource (PVGIS)
      temperature: 0.015, // ±1.5% temperature effect
      inverter: 0.012,    // ±1.2% inverter efficiency
      soiling: 0.020,     // ±2.0% soiling variability
      degradation: 0.008, // ±0.8% annual degradation uncertainty
      model: 0.030        // ±3.0% model uncertainty
    };

    // Weighted aggregate uncertainty (quadrature sum)
    let aggregateSigma = 0;
    Object.values(uncertaintySources).forEach(s => {
      aggregateSigma += s * s;
    });
    aggregateSigma = Math.sqrt(aggregateSigma);

    // Scale by source count: more sources = more confidence
    const sourceFactor = Math.max(0.6, 1.0 - (sources * 0.05));
    aggregateSigma *= sourceFactor;

    // Monte Carlo draws with correlated random values
    const pLat = (r && r.latDeg) || 40.41;
    const pLon = (r && r.lonDeg) || -3.70;
    const pKwp = (r && r.kwp) || 5.0;
    let seed = Math.abs(Math.floor(pLat * 10000 + pLon * 1000 + pKwp * 100)) || 42;
    function mulberry32(a) {
      return function() {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      };
    }
    const rng = mulberry32(seed);

    // Box-Muller transform for Gaussian distribution
    function gaussianRandom() {
      let u = 0, v = 0;
      while (u === 0) u = rng();
      while (v === 0) v = rng();
      return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    }

    for (let i = 0; i < numIterations; i++) {
      // Aggregate loss factor with gaussian noise
      const randomFactor = 1.0 + gaussianRandom() * aggregateSigma;
      const sample = baseAnnual * randomFactor;
      mcSamples.push(sample);
    }

    mcSamples.sort((a, b) => a - b);

    const p50 = mcSamples[Math.floor(mcSamples.length * 0.50)];
    // Convención de energía (bankable): P90 = valor superado el 90% del tiempo = percentil 10.
    // P10 = escenario favorable = percentil 90.
    const p90 = mcSamples[Math.floor(mcSamples.length * 0.10)];
    const p10 = mcSamples[Math.floor(mcSamples.length * 0.90)];

    // Empirical sigma from distribution
    const mean = mcSamples.reduce((s, v) => s + v, 0) / mcSamples.length;
    const variance = mcSamples.reduce((s, v) => s + (v - mean) * (v - mean), 0) / mcSamples.length;
    const sigma = Math.sqrt(variance);

    return { p50, p90, p10, sigma, aggregateSigma, samples: mcSamples };
  }

  // Count how many data sources are available
  let sourceCount = 1; // At minimum the physical model
  if (pvgisOK) sourceCount++;
  if (r.nasa && !r.nasa.error) sourceCount++;
  if (r.pvsyst) sourceCount++;

  const mc = runMonteCarloP50P90(baseKWh, sourceCount);
  const prDisplay = pvgisOK ? r.pvgis.PR : r.physical.PR;

  setElemText('analysis-p50', Math.round(mc.p50).toLocaleString('es-ES') + ' kWh/año');
  setElemText('analysis-p90', Math.round(mc.p90).toLocaleString('es-ES') + ' kWh/año');
  setElemText('analysis-pr', (prDisplay * 100).toFixed(1) + ' %');
  setElemText('analysis-sigma', '± ' + (mc.aggregateSigma * 100).toFixed(1) + ' % (1σ) · MC ' + mc.samples.length + ' iteraciones');

  // Also update main solar panel metrics with best result
  const bestKWh = pvgisOK ? r.pvgis.annualKWh : r.physical.annualKWh;
  setElemText('sol-annual-yield', bestKWh.toLocaleString('es-ES') + ' kWh/año');
  if (pvgisOK && r.pvgis.monthlyKWh) renderSolarBarChart(r.pvgis.monthlyKWh);

  // Render Monte Carlo distribution histogram
  renderMonteCarloHistogram(mc);

  // Expose extra context for the exporter (botón EXPORTAR ANÁLISIS)
  lastAnalysisResults.mc = mc;
  lastAnalysisResults.reference = reference;
  lastAnalysisResults.sourceCount = sourceCount;
  lastAnalysisResults.pvgisOK = pvgisOK;
  lastAnalysisResults.nasaOK = nasaOK;
  lastAnalysisResults.prDisplay = prDisplay;
  lastAnalysisResults.fecha = new Date().toLocaleString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' }) + ' · ' + new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function exportEnergyAnalysis() {
  const r = lastAnalysisResults;
  if (!r) {
    showToast('ANÁLISIS REQUERIDO', 'Ejecuta primero el análisis comparativo energético.', 'info');
    return;
  }
  const d = getProjectCalcs();
  const pvgisOK = r.pvgisOK !== undefined ? r.pvgisOK : (r.pvgis && !r.pvgis.error);
  const reference = r.reference || (pvgisOK ? r.pvgis.annualKWh : r.physical.annualKWh);

  const motors = [
    { name: 'Estimación Paramétrica (Motor Actual)', kwh: r.simple.annualKWh, pr: r.simple.PR, sigma: r.simple.sigma, ok: true },
    { name: 'PVGIS v5.3 · SARAH-3 (JRC Europa)', kwh: pvgisOK ? r.pvgis.annualKWh : null, pr: pvgisOK ? r.pvgis.PR : null, sigma: pvgisOK ? r.pvgis.sigma : null, ok: pvgisOK },
    { name: 'Modelo Físico IEC 61724', kwh: r.physical.annualKWh, pr: r.physical.PR, sigma: r.physical.sigma, ok: true },
    { name: 'PVsyst-Compatible (IEC 62548)', kwh: r.pvsyst ? r.pvsyst.annualKWh : null, pr: r.pvsyst ? r.pvsyst.PR : null, sigma: r.pvsyst ? r.pvsyst.sigma : null, ok: !!r.pvsyst }
  ];

  const tableRows = motors.map(m => {
    if (!m.ok || m.kwh === null) {
      return '<tr><td><b>' + m.name + '</b></td><td colspan="4" style="text-align:center;color:#94a3b8;">Sin conexión / offline</td></tr>';
    }
    const diff = reference > 0 ? ((m.kwh - reference) / reference * 100) : 0;
    const diffColor = Math.abs(diff) < 5 ? '#059669' : (Math.abs(diff) < 15 ? '#d97706' : '#dc2626');
    const p90 = Math.round(m.kwh - 1.28 * m.sigma);
    return '<tr>' +
      '<td><b>' + m.name + '</b></td>' +
      '<td style="text-align:right;font-weight:700;">' + m.kwh.toLocaleString('es-ES') + ' kWh</td>' +
      '<td style="text-align:right;">' + (m.pr * 100).toFixed(1) + ' %</td>' +
      '<td style="text-align:right;font-weight:800;color:' + diffColor + ';">' + (diff >= 0 ? '+' : '') + diff.toFixed(1) + ' %</td>' +
      '<td style="text-align:right;">' + p90.toLocaleString('es-ES') + ' kWh</td></tr>';
  }).join('');

  const monthly = (pvgisOK && r.pvgis.monthlyKWh) ? r.pvgis.monthlyKWh : r.physical.monthlyKWh;
  const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const monthlyRows = monthly.map((kwh, i) =>
    '<tr><td>' + meses[i] + '</td><td style="text-align:right;">' + kwh.toLocaleString('es-ES') + ' kWh</td></tr>'
  ).join('');

  const mc = r.mc;
  const prDisplay = r.prDisplay || (pvgisOK ? r.pvgis.PR : r.physical.PR);
  const sigmaPct = mc ? (mc.aggregateSigma * 100).toFixed(1) : '—';
  const refNum = 'ANE-' + new Date().getFullYear() + '-' + String(Math.floor(Math.random() * 900 + 100));
  const ubicacion = (d.tit && d.tit.dir ? d.tit.dir + ', ' : '') + (d.tit && d.tit.mun ? d.tit.mun + ' ' : '') + (d.tit && d.tit.prov ? d.tit.prov : '');

  const body = `
    <div class="hdr">
      <div class="hdr-l">
        <div class="badge">INFORME TÉCNICO · ANÁLISIS COMPARATIVO ENERGÉTICO</div>
        <h1>Comparativa de Métodos de Cálculo Fotovoltaico</h1>
        <p>Informe generado el <b>${r.fecha || '—'}</b> · Referencia <b>${refNum}</b></p>
      </div>
      <div class="hdr-r"><strong>${(d.kwp || r.kwp || 5).toFixed(2)} kWp</strong>Instalación FV · ${d.numPanels || 0} módulos</div>
    </div>

    <div class="info"><b>Localización:</b> ${ubicacion || '—'} · lat ${(r.latDeg || 0).toFixed(5)}° · lon ${(r.lonDeg || 0).toFixed(5)}° · Inclinación módulo ${(r.tiltDeg || 0).toFixed(1)}° · Azimut ${(r.azimutDeg || 0).toFixed(1)}° (convención Sur=0)</div>

    <h2>1 · Calidad del análisis</h2>
    <div class="dgrid">
      <div class="dcard"><label>Estado</label><value>${pvgisOK ? 'ALTA CONFIANZA (PVGIS + Físico)' : 'MEDIA (Físico offline, sin PVGIS)'}</value></div>
      <div class="dcard"><label>Fuentes de datos</label><value>${r.sourceCount || 1} motores activos</value></div>
      <div class="dcard"><label>PR estimado</label><value>${(prDisplay * 100).toFixed(1)} %</value></div>
      <div class="dcard"><label>Incertidumbre</label><value>± ${sigmaPct} % (1σ)</value></div>
    </div>

    <h2>2 · Tabla comparativa de motores</h2>
    <table>
      <thead><tr><th>Motor</th><th style="text-align:right;">kWh/año</th><th style="text-align:right;">PR</th><th style="text-align:right;">vs PVGIS</th><th style="text-align:right;">P90</th></tr></thead>
      <tbody>${tableRows}</tbody>
    </table>

    <h2>3 · Producción probabilística (Monte Carlo)</h2>
    <div class="dgrid">
      <div class="dcard"><label>P50 · Media esperada</label><value>${mc ? Math.round(mc.p50).toLocaleString('es-ES') : '—'} kWh/año</value></div>
      <div class="dcard"><label>P90 · Mínimo garantizado</label><value>${mc ? Math.round(mc.p90).toLocaleString('es-ES') : '—'} kWh/año</value></div>
      <div class="dcard"><label>P10 · Escenario favorable</label><value>${mc ? Math.round(mc.p10).toLocaleString('es-ES') : '—'} kWh/año</value></div>
      <div class="dcard"><label>Sigma empírica</label><value>${mc ? '± ' + (mc.sigma / mc.p50 * 100).toFixed(1) + ' %' : '—'}</value></div>
    </div>
    <p class="warn">Base de cálculo: <b>${Math.round(reference).toLocaleString('es-ES')} kWh/año</b>. Simulación de Monte Carlo con ${mc ? mc.samples.length : 0} iteraciones y ruido gaussiano correlacionado sobre las fuentes de incertidumbre (recurso solar, temperatura, inversor, ensuciamiento, degradación, modelo).</p>

    <h2>4 · Producción mensual estimada (${pvgisOK ? 'PVGIS SARAH-3' : 'Modelo físico IEC'})</h2>
    <table><thead><tr><th>Mes</th><th style="text-align:right;">Energía</th></tr></thead><tbody>${monthlyRows}</tbody></table>

    <div class="sig-row">
      <div class="sig">El Ingeniero Técnico / Instalador<br><br><br><b>Fdo.: ___________________</b></div>
      <div class="sig">Fecha: ${r.fecha || '—'}</div>
      <div class="sig">Sello de la empresa<br><br><br><b>${ubicacion || ''}</b></div>
    </div>
    <div class="footer">Documento generado por RA Renewable Architecture · Análisis comparativo según IEC 61724, IEC 62548 y PVsyst · Fuentes meteorológicas: PVGIS v5.3 (JRC Europa, SARAH-3) y NASA POWER (20 años). Este informe es una estimación técnica y no constituye garantía de producción.</div>
  `;

  docWindow('ANÁLISIS ENERGÉTICO — ' + refNum, body, true);
}

function renderGeometryAnalysis(r) {
  const wrap = document.getElementById('analysis-geometry-wrap');
  if (!wrap) return;

  const roofInfo = computeRoofPanelsData();
  if (!roofInfo || polygonPoints.length < 3) {
    wrap.innerHTML = '<div style="color:var(--text-slate-400)">Traza el polígono de la cubierta en el visor 3D para ejecutar el motor geométrico.</div>';
    return;
  }

  const tiltDeg = roofInfo.tiltDeg;
  const azimuthDeg = roofInfo.azimuthDeg; // convención local existente (Sur = 0)
  const azimuthN = roofInfo.azimuthN !== undefined ? roofInfo.azimuthN : normalizeAzimuth(180 - azimuthDeg);

  // Normal del plano en terna Este/Norte/Arriba (ENU) — azimut en convención N=0
  const normal = normalFromTiltAzimuth(tiltDeg, azimuthN);

  // Posición solar: solsticio de invierno 21-dic, 12h solar (caso crítico CTE)
  const doy = 355;
  const decl = solarDeclination(doy);
  const ha = hourAngle(12);
  const latDeg = roofInfo.latDeg;
  const altWinter = solarAltitude(latDeg, decl, ha);
  const azWinter = solarAzimuthAtan2(latDeg, decl, ha);
  const sunW = sunVector(altWinter, azWinter);

  // Ángulo de incidencia sobre el plano
  const inc = incidenceAngle(normal, sunW);

  // Módulo colocado: inclinación real, huella y separación entre filas (§17/§18)
  const modLen = roofInfo.orientation === 'landscape' ? (panelConfig.ancho || 1.05) : (panelConfig.largo || 2.1);
  const modTilt = roofInfo.moduleTiltDeg;
  const rs = roofInfo.rowPitch || rowSpacing(modLen, modTilt, altWinter, 0.30);
  const footprint = roofInfo.footprintA || (modLen * Math.cos(degToRad(Math.max(modTilt - tiltDeg, 0))));
  const gapRows = roofInfo.gapBetweenRowsM;

  // Longitud de sombra de obstáculo medio
  const obsH = 1.2;
  const obsShadow = obstacleShadowLength(obsH, altWinter);

  // Ray casting de sombra para un módulo de ejemplo
  const sampleBoxes = [
    { min: v3(-2.5, 4.0, 0), max: v3(-1.0, 5.5, obsH) }
  ];
  const shaded = rayCastingIsShaded(v3(0, 2, 0), sunW, sampleBoxes);

  // Auto-test del motor (§37)
  const selftest = runEngineSelfTests();
  const selftestHtml = selftest.results.map(r =>
    '<div><span style="color:' + (r.pass ? '#10b981' : '#f43f5e') + '">' + (r.pass ? '✓' : '✗') + '</span> ' + r.name + '</div>'
  ).join('');

  const cardinals = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SO', 270: 'O', 315: 'NO' };
  let cardinal = 'N';
  Object.entries(cardinals).forEach(([deg, name]) => {
    if (Math.abs(normalizeAzimuth(azimuthN - parseInt(deg))) < 22.5) cardinal = name;
  });

  // Comparación de orientaciones con la colocación real (inclinación + filas + sombras)
  const layoutRows = (roofInfo.layouts || []).map(l => {
    const selected = l.id === roofInfo.selectedLayoutId;
    return '<tr' + (selected ? ' style="background:rgba(16,185,129,0.12);"' : '') + '>' +
      '<td style="padding:3px 6px;color:#38bdf8">' + (selected ? '✓ ' : '') + l.orientation +
      (l.coplanar ? ' <span style="color:#64748b">(coplanar)</span>' : ' <span style="color:#f59e0b">(inclinado)</span>') + '</td>' +
      '<td style="padding:3px 6px;text-align:right">' + l.moduleCount + ' ud</td>' +
      '<td style="padding:3px 6px;text-align:right">' + (l.installedPowerWp / 1000).toFixed(2) + ' kWp</td>' +
      '<td style="padding:3px 6px;text-align:right">' + l.rowPitch.toFixed(2) + ' m</td>' +
      '<td style="padding:3px 6px;text-align:right">' + l.footprintA.toFixed(2) + ' m</td></tr>';
  }).join('');

  const orientLabel = roofInfo.orientation === 'landscape' ? 'HORIZONTAL (LANDSCAPE)' : 'VERTICAL (PORTRAIT)';

  wrap.innerHTML =
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px;">' +
    '<div style="background:rgba(0,0,0,0.3);padding:6px 8px;border-radius:6px;">' +
    '<div style="color:var(--text-slate-400);font-size:8px;">INCLINACIÓN CUBIERTA (normal)</div>' +
    '<b>' + tiltDeg.toFixed(1) + '°</b> · Normal n=(' + normal.x.toFixed(3) + ', ' + normal.y.toFixed(3) + ', ' + normal.z.toFixed(3) + ')' +
    '</div>' +
    '<div style="background:rgba(0,0,0,0.3);padding:6px 8px;border-radius:6px;">' +
    '<div style="color:var(--text-slate-400);font-size:8px;">AZIMUT CUBIERTA (N=0 → E=90 → S=180 → O=270)</div>' +
    '<b>' + azimuthN.toFixed(1) + '° (' + cardinal + ')</b>' +
    '</div>' +
    '<div style="background:rgba(0,0,0,0.3);padding:6px 8px;border-radius:6px;">' +
    '<div style="color:var(--text-slate-400);font-size:8px;">MÓDULO INSTALADO · ' + orientLabel + '</div>' +
    'Inclinación módulo <b>' + modTilt.toFixed(1) + '°</b>' +
    (roofInfo.coplanar ? ' <span style="color:#64748b">(coplanar)</span>' : ' <span style="color:#f59e0b">(estructura inclinada)</span>') +
    ' · Azimut módulo <b>' + roofInfo.moduleAzimuthDeg.toFixed(1) + '°</b> (Sur=0)<br>' +
    'Panel colocado: <b>' + modLen.toFixed(2) + ' m</b> (largo) × <b>' + (roofInfo.orientation === 'landscape' ? (panelConfig.largo || 2.1) : (panelConfig.ancho || 1.05)).toFixed(2) + ' m</b>' +
    '</div>' +
    '<div style="background:rgba(0,0,0,0.3);padding:6px 8px;border-radius:6px;">' +
    '<div style="color:var(--text-slate-400);font-size:8px;">SOL 21-DIC 12h · vector unitario</div>' +
    'Altura <b>' + altWinter.toFixed(1) + '°</b> · Azimut <b>' + azWinter.toFixed(1) + '°</b><br>' +
    'S=(' + sunW.x.toFixed(3) + ', ' + sunW.y.toFixed(3) + ', ' + sunW.z.toFixed(3) + ')' +
    '</div>' +
    '<div style="background:rgba(0,0,0,0.3);padding:6px 8px;border-radius:6px;">' +
    '<div style="color:var(--text-slate-400);font-size:8px;">INCIDENCIA · SOMBRA OBSTÁCULO 1,2 m</div>' +
    'cosΘ=' + inc.cosTheta.toFixed(3) + ' → <b>' + inc.thetaDeg.toFixed(1) + '°</b><br>' +
    'Longitud sombra: <b>' + obsShadow.toFixed(2) + ' m</b>' +
    '</div>' +
    '<div style="background:rgba(0,0,0,0.3);padding:6px 8px;border-radius:6px;grid-column:1/-1;">' +
    '<div style="color:var(--text-slate-400);font-size:8px;">SEPARACIÓN ENTRE FILAS (§18 · solsticio invierno)</div>' +
    'rowSpacing = L·cos(βm) + H/tan(α) + margen = <b>' + rs.toFixed(2) + ' m</b> (paso entre filas)<br>' +
    'Huella proyectada L·cos(Δβ) = <b>' + footprint.toFixed(2) + ' m</b> · Holgura entre filas = <b>' + gapRows.toFixed(2) + ' m</b>' +
    '</div>' +
    '<div style="background:rgba(0,0,0,0.3);padding:6px 8px;border-radius:6px;grid-column:1/-1;">' +
    '<div style="color:var(--text-slate-400);font-size:8px;">ALGORITMO DE ORIENTACIÓN (§25/§26) · se elige la colocación más eficiente</div>' +
    '<table style="width:100%;border-collapse:collapse;margin-top:4px;font-size:8.5px;">' +
    '<tr style="color:var(--text-slate-400);"><td>Orientación</td><td style="text-align:right">Módulos</td><td style="text-align:right">Potencia</td><td style="text-align:right">Paso fila</td><td style="text-align:right">Huella</td></tr>' +
    layoutRows +
    '</table>' +
    '<div style="margin-top:6px;color:var(--text-slate-400);font-size:8px;">' +
    'Decisión: <b style="color:#10b981">' + orientLabel + '</b>' +
    (roofInfo.coplanar ? ' · coplanar con cubierta' : ' · estructura inclinada ' + modTilt.toFixed(1) + '°') +
    ' · Ray casting (obstáculo +X): módulo de prueba ' + (shaded ? '<b style="color:#f59e0b">SOMBREADO</b>' : '<b style="color:#10b981">SIN SOMBRA</b>') + '</div>' +
    '</div>' +
    '<div style="background:rgba(0,0,0,0.3);padding:6px 8px;border-radius:6px;grid-column:1/-1;">' +
    '<div style="color:var(--text-slate-400);font-size:8px;">AUTO-TEST DEL MOTOR (§37 del documento)</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 10px;margin-top:4px;font-size:8px;">' +
    selftestHtml +
    '</div>' +
    '</div>' +
    '</div>';
}

function runEngineSelfTestsOnCard() {
  const t = runEngineSelfTests();
  const selftestHtml = t.results.map(r =>
    '<div><span style="color:' + (r.pass ? '#10b981' : '#f43f5e') + '">' + (r.pass ? '✓' : '✗') + '</span> ' + r.name + '</div>'
  ).join('');
  const card = document.getElementById('analysis-geometry-card');
  if (card) {
    card.querySelectorAll('.selftest-row').forEach(el => el.remove());
    const div = document.createElement('div');
    div.className = 'selftest-row';
    div.style.cssText = 'margin-top:6px;font-size:8px;color:' + (t.passed === t.total ? 'var(--emerald-500)' : '#f43f5e') + ';';
    div.textContent = 'RESULTADO: ' + t.passed + '/' + t.total + ' TESTS SUPERADOS';
    card.appendChild(div);
  }
}

function renderMonteCarloHistogram(mc) {
  const svg = document.getElementById('mc-dist-svg');
  if (!svg) return;
  svg.innerHTML = '';

  const samples = mc.samples;
  if (!samples || samples.length === 0) return;

  const min = Math.min(...samples);
  const max = Math.max(...samples);
  const range = max - min || 1;

  const numBins = 24;
  const bins = new Array(numBins).fill(0);
  samples.forEach(s => {
    let binIdx = Math.min(Math.floor((s - min) / range * numBins), numBins - 1);
    bins[binIdx]++;
  });

  const maxBin = Math.max(...bins);
  const W = 320, H = 120, padL = 8, padR = 8, padT = 14, padB = 22;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const barW = plotW / numBins;

  // Determine bin index of P50, P90 for color coding
  const p50Bin = Math.min(Math.floor((mc.p50 - min) / range * numBins), numBins - 1);
  const p90Bin = Math.min(Math.floor((mc.p90 - min) / range * numBins), numBins - 1);

  bins.forEach((count, i) => {
    const x = padL + i * barW;
    const h = (count / maxBin) * plotH;
    const y = padT + plotH - h;

    let fill;
    if (i >= p90Bin) {
      fill = '#10b981'; // P90 and above (bankable guaranteed zone)
    } else if (i >= p50Bin) {
      fill = '#f59e0b'; // P50 to P90
    } else {
      fill = '#64748b'; // Below P50
    }

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', x);
    rect.setAttribute('y', y);
    rect.setAttribute('width', Math.max(barW - 1, 1));
    rect.setAttribute('height', Math.max(h, 1));
    rect.setAttribute('fill', fill);
    rect.setAttribute('opacity', '0.85');
    rect.setAttribute('rx', '1');
    svg.appendChild(rect);
  });

  // P50 and P90 vertical markers
  function addMarker(value, color, label) {
    const x = padL + ((value - min) / range) * plotW;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x);
    line.setAttribute('y1', padT);
    line.setAttribute('x2', x);
    line.setAttribute('y2', padT + plotH);
    line.setAttribute('stroke', color);
    line.setAttribute('stroke-width', '1.5');
    line.setAttribute('stroke-dasharray', '4,3');
    svg.appendChild(line);

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', x);
    text.setAttribute('y', padT + plotH + 13);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('font-size', '7');
    text.setAttribute('font-weight', '800');
    text.setAttribute('fill', color);
    text.textContent = label;
    svg.appendChild(text);
  }

  addMarker(mc.p50, '#f59e0b', 'P50');
  addMarker(mc.p90, '#10b981', 'P90');

  // Info line
  const infoEl = document.getElementById('mc-dist-info');
  if (infoEl) {
    infoEl.textContent = `σ=${(mc.aggregateSigma * 100).toFixed(1)}% · Rango ${Math.round(min).toLocaleString('es-ES')}–${Math.round(max).toLocaleString('es-ES')} kWh`;
  }
}

function renderWaterfallChart(losses, netKWh) {
  const wrap = document.getElementById('analysis-waterfall-wrap');
  if (!wrap) return;

  const stages = [
    { label: 'Nominal\nSTC', value: null, type: 'base', pct: 100 },
    { label: 'Irrad.\nPOA', value: losses.irrad, type: 'loss', pct: -8.0 },
    { label: 'Temp.\nCélula', value: losses.temp, type: 'loss', pct: -4.2 },
    { label: 'IAM\nReflex.', value: losses.iam, type: 'loss', pct: -1.2 },
    { label: 'Sombras', value: losses.shading, type: 'loss', pct: -2.8 },
    { label: 'Suciedad', value: losses.soiling, type: 'loss', pct: -2.5 },
    { label: 'Mismatch', value: losses.mismatch, type: 'loss', pct: -2.0 },
    { label: 'Cableado', value: losses.wiring, type: 'loss', pct: -1.5 },
    { label: 'Inversor', value: losses.inverter, type: 'loss', pct: -2.5 },
    { label: 'AC NETA', value: null, type: 'net', pct: 75.3 }
  ];

  const W = 310, barW = 22, gap = 8, H = 100, padB = 28, padT = 10;
  const plotH = H - padB - padT;

  let svg = `<svg viewBox="0 0 ${W} ${H + 5}" style="width:100%;display:block;">`;

  let cumPct = 100;
  stages.forEach((s, i) => {
    const x = 8 + i * (barW + gap);
    let barH, y, color;

    if (s.type === 'base') {
      barH = plotH * (s.pct / 100);
      y = padT + plotH - barH;
      color = '#6366f1';
    } else if (s.type === 'net') {
      barH = plotH * (s.pct / 100);
      y = padT + plotH - barH;
      color = '#10b981';
    } else {
      const prevPct = cumPct;
      cumPct += s.pct;
      barH = plotH * (Math.abs(s.pct) / 100);
      y = padT + plotH - prevPct / 100 * plotH;
      color = '#ef4444';
    }

    svg += `<rect x="${x}" y="${y}" width="${barW}" height="${Math.max(barH, 2)}" fill="${color}" rx="2" opacity="0.9"/>`;

    // Connector line
    if (i > 0 && s.type === 'loss') {
      const prevX = 8 + (i-1) * (barW + gap) + barW;
      svg += `<line x1="${prevX}" y1="${y}" x2="${x}" y2="${y}" stroke="rgba(255,255,255,0.2)" stroke-dasharray="2,2"/>`;
    }

    // Label
    const labelLines = s.label.split('\n');
    labelLines.forEach((line, li) => {
      svg += `<text x="${x + barW/2}" y="${H - 12 + li * 9}" text-anchor="middle" font-size="6.5" fill="rgba(255,255,255,0.7)">${line}</text>`;
    });

    // Percentage
    svg += `<text x="${x + barW/2}" y="${y - 3}" text-anchor="middle" font-size="7" font-weight="700" fill="${color}">${s.type === 'loss' ? s.pct.toFixed(1)+'%' : s.pct.toFixed(1)+'%'}</text>`;
  });

  svg += '</svg>';
  wrap.innerHTML = svg;
}

function showDailyCurve(mode) {
  currentDailyCurveMode = mode;
  const btnS = document.getElementById('btn-curve-summer');
  const btnW = document.getElementById('btn-curve-winter');
  const lbl = document.getElementById('daily-curve-label');
  if (btnS) btnS.classList.toggle('active', mode === 'summer');
  if (btnW) btnW.classList.toggle('active', mode === 'winter');
  if (lbl) lbl.textContent = mode === 'summer' ? 'VERANO · DÍA TÍPICO (21 JUN)' : 'INVIERNO · DÍA TÍPICO (21 DIC)';

  if (!lastAnalysisResults) return;

  const d = lastAnalysisResults;
  const kwp = d.kwp || 5;
  const latDeg = d.latDeg || 40.4;
  const tiltDeg = d.tiltDeg || 30;
  const azimutDeg = d.azimutDeg || 0;
  const doy = mode === 'summer' ? 172 : 355;
  const decl = solarDeclination(doy);

  const hours = [];
  const production = [];
  const consumption = [];

  for (let h = 5; h <= 21; h++) {
    hours.push(h);
    const altDeg = solarAltitude(latDeg, decl, hourAngle(h));
    let powerKW = 0;
    if (altDeg > 0) {
      const GHI = Math.max(kwp * 1000 * 1.15 * Math.sin(altDeg * Math.PI / 180), 0);
      const DHI = GHI * 0.30;
      const GPOA = calcPOA(GHI, DHI, latDeg, tiltDeg, azimutDeg, doy, h);
      const Tcell = calcTcell(mode === 'summer' ? 28 : 8, GPOA);
      const P = calcPpanel(kwp * 1000, GPOA, Tcell);
      powerKW = P * 0.92 / 1000; // With system losses
    }
    production.push(powerKW);
    // Typical residential consumption profile (kW)
    const consHour = (h >= 8 && h <= 10) ? 1.2 : (h >= 13 && h <= 15) ? 0.9 : (h >= 19 && h <= 22) ? 1.8 : 0.4;
    consumption.push(consHour);
  }

  renderDailyCurve(hours, production, consumption, mode);
}

function renderDailyCurve(hours, production, consumption, mode) {
  const svg = document.getElementById('daily-curve-svg');
  if (!svg) return;

  const W = 310, H = 120, padL = 30, padR = 10, padT = 8, padB = 22;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const maxVal = Math.max(...production, ...consumption, 0.5) * 1.15;
  const n = hours.length;

  const toX = i => padL + (i / (n - 1)) * plotW;
  const toY = v => padT + plotH - (v / maxVal) * plotH;

  let markup = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;display:block;">`;

  // Grid lines
  [0.25, 0.50, 0.75, 1.0].forEach(f => {
    const y = padT + plotH - f * plotH;
    markup += `<line x1="${padL}" y1="${y}" x2="${W-padR}" y2="${y}" stroke="rgba(255,255,255,0.07)" stroke-dasharray="3,3"/>`;
    markup += `<text x="${padL-4}" y="${y+3}" text-anchor="end" font-size="7" fill="rgba(255,255,255,0.4)">${(f * maxVal).toFixed(1)}</text>`;
  });

  // Excedente fill area (surplus: production > consumption)
  let surplusPath = `M ${toX(0)} ${toY(0)}`;
  production.forEach((p, i) => { surplusPath += ` L ${toX(i)} ${toY(p)}`; });
  surplusPath += ` L ${toX(n-1)} ${toY(0)} Z`;
  markup += `<path d="${surplusPath}" fill="rgba(99,102,241,0.15)"/>`;

  // Production curve
  let prodPath = production.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(p)}`).join(' ');
  markup += `<path d="${prodPath}" fill="none" stroke="#f59e0b" stroke-width="2.5" stroke-linejoin="round"/>`;

  // Consumption curve
  let consPath = consumption.map((c, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(c)}`).join(' ');
  markup += `<path d="${consPath}" fill="none" stroke="#10b981" stroke-width="1.5" stroke-dasharray="5,3" stroke-linejoin="round"/>`;

  // Hour labels
  hours.forEach((h, i) => {
    if (h % 3 === 0) {
      markup += `<text x="${toX(i)}" y="${H-4}" text-anchor="middle" font-size="7" fill="rgba(255,255,255,0.5)">${h}h</text>`;
    }
  });

  // Peak annotation
  const peakIdx = production.indexOf(Math.max(...production));
  markup += `<circle cx="${toX(peakIdx)}" cy="${toY(production[peakIdx])}" r="3" fill="#f59e0b"/>`;
  markup += `<text x="${toX(peakIdx)}" y="${toY(production[peakIdx])-6}" text-anchor="middle" font-size="7.5" font-weight="700" fill="#f59e0b">${production[peakIdx].toFixed(1)} kW</text>`;

  markup += '</svg>';
  svg.outerHTML = markup;

  // Re-query since we replaced it
  const newSvg = document.getElementById('daily-curve-svg');
  if (!newSvg) {
    const wrap = document.querySelector('#analysis-daily-card .solar-bar-chart');
    if (wrap) wrap.outerHTML = markup;
  }
}

function wpComputeInstantSolarPosition(monthIdx, hourFloat) {
  const m = Math.max(0, Math.min(11, monthIdx !== undefined ? monthIdx : solarSimState.monthIdx));
  const h = Math.max(6.0, Math.min(20.0, hourFloat !== undefined ? hourFloat : solarSimState.hourFloat));
  const doy = SOLAR_MONTH_DAYS[m];

  let latDeg = 40.4168, lngDeg = -3.7038;
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

  // Hora local del slider → hora UTC → hora solar (EoT + longitud) en el motor
  // de alta precisión. Antes se usaba la hora local como si fuera solar: las
  // sombras del visor podían desplazarse ~1h solar respecto a la hora mostrada.
  let alt, azN, decl;
  if (typeof computeHighPrecisionSolarPosition === "function") {
    const year = new Date().getFullYear();
    const dLocal = new Date(year, m, 21, Math.floor(h), Math.round((h % 1) * 60), 0);
    const utcHour = h + dLocal.getTimezoneOffset() / 60;
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

function wpSyncCesiumSun(solarPos) {
  if (typeof viewer === "undefined" || !viewer || !viewer.clock) return;
  const year = 2026;
  const month = (solarPos && solarPos.monthIdx !== undefined) ? solarPos.monthIdx : 11;
  const day = 21;
  const hourVal = (solarPos && solarPos.hourFloat !== undefined) ? solarPos.hourFloat : 12.0;
  const h = Math.floor(hourVal);
  const m = Math.floor((hourVal % 1) * 60);
  const s = Math.floor((((hourVal % 1) * 60) % 1) * 60);

  const dateObj = new Date(Date.UTC(year, month, day, h, m, s));
  if (typeof Cesium !== "undefined" && Cesium.JulianDate && typeof Cesium.JulianDate.fromDate === "function") {
    viewer.clock.currentTime = Cesium.JulianDate.fromDate(dateObj);
  }

  const alt = (solarPos && typeof solarPos.alt === 'number') ? solarPos.alt : 15.0;

  // ═══════════════════════════════════════════════════════════════════════════
  // 🌓 ILUMINACIÓN DINÁMICA: DÍA, ATARDECER, CREPÚSCULO Y LUZ DE LUNA
  // ═══════════════════════════════════════════════════════════════════════════
  try {
    if (viewer.scene) {
      const sc = viewer.scene;
      const gl = sc.globe;
      const canvas = viewer.canvas || (sc.canvas);

      if (alt > 0.0) {
        // ☀️ 1. DÍA PLENO Y ATARDECER / OCASO (Luz Solar Natural 100% con SunLight ECEF nativo)
        if (typeof Cesium.SunLight === "function") {
          sc.light = new Cesium.SunLight();
        }
        const isGoldenHour = alt <= 8.0;
        const t = isGoldenHour ? Math.max(0, Math.min(1, alt / 8.0)) : 1.0;

        if (gl) {
          gl.enableLighting = true;
          gl.shadows = Cesium.ShadowMode.DISABLED;
          gl.atmosphereLightIntensity = isGoldenHour ? (4.0 + 6.0 * t) : 10.0;
          gl.baseColor = isGoldenHour ? Cesium.Color.fromCssColorString('#181d2f') : Cesium.Color.fromCssColorString('#14213d');
        }
        if (sc.shadowMap) {
          if (typeof window.wpConfigureShadowMap === "function") {
            window.wpConfigureShadowMap(sc.shadowMap);
          } else {
            sc.shadowMap.enabled = true;
            sc.shadowMap.size = 4096;
            sc.shadowMap.maximumDistance = 2000.0;
            sc.shadowMap._fitNearFar = false;
            sc.shadowMap.softShadows = true;
            if (sc.shadowMap._primitiveBias) {
              sc.shadowMap._primitiveBias.polygonOffset = true;
              sc.shadowMap._primitiveBias.polygonOffsetFactor = 1.2;
              sc.shadowMap._primitiveBias.polygonOffsetUnits = 4.0;
              sc.shadowMap._primitiveBias.normalOffset = true;
              sc.shadowMap._primitiveBias.normalOffsetScale = 0.5;
              sc.shadowMap._primitiveBias.depthBias = 0.0006;
              sc.shadowMap._primitiveBias.normalShading = true;
              sc.shadowMap._primitiveBias.normalShadingSmooth = 0.3;
            }
          }
          sc.shadowMap.darkness = isGoldenHour ? 0.55 : 0.50;
        }
        sc.backgroundColor = Cesium.Color.fromCssColorString('#0a101a');

        if (canvas && canvas.style) {
          if (isGoldenHour) {
            const sepiaVal = ((1.0 - t) * 0.35).toFixed(2);
            const brightVal = (0.88 + 0.12 * t).toFixed(2);
            const satVal = (1.0 + (1.0 - t) * 0.25).toFixed(2);
            canvas.style.filter = 'brightness(' + brightVal + ') sepia(' + sepiaVal + ') saturate(' + satVal + ')';
          } else {
            canvas.style.filter = 'none';
          }
        }

      } else if (alt > -6.0) {
        // 🌆 3. CREPÚSCULO (Hora Azul / Twilight: Azul Cobalto y Desvanecimiento)
        const tDusk = Math.max(0, Math.min(1, (alt + 6.0) / 6.0)); // 1.0 = Horizonte, 0.0 = Noche
        const r = 0.38 + 0.55 * tDusk;
        const g = 0.50 + 0.40 * tDusk;
        const b = 0.95 + 0.05 * tDusk;
        const duskColor = new Cesium.Color(r, g, b, 1.0);

        if (typeof Cesium.DirectionalLight === "function") {
          sc.light = new Cesium.DirectionalLight({
            direction: new Cesium.Cartesian3(0.3, 0.3, -0.9),
            color: duskColor,
            intensity: 0.35 + 0.30 * tDusk
          });
        }
        if (gl) {
          gl.enableLighting = true;
          gl.atmosphereLightIntensity = 1.5 + 2.0 * tDusk;
          gl.baseColor = Cesium.Color.fromCssColorString('#0d1527');
        }
        if (sc.shadowMap) {
          sc.shadowMap.enabled = false;
        }

        if (canvas && canvas.style) {
          const brightVal = (0.45 + 0.40 * tDusk).toFixed(2);
          canvas.style.filter = 'brightness(' + brightVal + ') hue-rotate(190deg) saturate(1.20) contrast(1.08)';
        }

      } else {
        // 🌙 4. NOCHE PROFUNDA (Luz de Luna Suave / Moonlight Shading sobre Geometría)
        const moonColor = new Cesium.Color(0.42, 0.65, 0.98, 1.0);
        if (typeof Cesium.DirectionalLight === "function") {
          sc.light = new Cesium.DirectionalLight({
            direction: new Cesium.Cartesian3(0.25, 0.45, -0.86),
            color: moonColor,
            intensity: 0.26
          });
        }
        if (gl) {
          gl.enableLighting = true;
          gl.atmosphereLightIntensity = 0.8;
          gl.baseColor = Cesium.Color.fromCssColorString('#070b14');
        }
        if (sc.shadowMap) {
          sc.shadowMap.enabled = false;
        }
        sc.backgroundColor = Cesium.Color.fromCssColorString('#04070e');

        if (canvas && canvas.style) {
          canvas.style.filter = 'brightness(0.26) hue-rotate(185deg) saturate(1.25) contrast(1.15)';
        }
      }

      if (typeof sc.requestRender === "function") {
        sc.requestRender();
      }
    }

    const currentShadowMode = (alt > 0) ? Cesium.ShadowMode.ENABLED : Cesium.ShadowMode.DISABLED;
    if (google3DTileset) google3DTileset.shadows = currentShadowMode;
    if (cesiumOsmBuildings) cesiumOsmBuildings.shadows = currentShadowMode;

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
  } catch(eShadow) { window.RA && window.RA.log && window.RA.log.warn('[catch silenciado]', eShadow); }
}

function wpRenderDynamicObstacleShadows(solarPos) {
  if (typeof viewer === "undefined" || !viewer || !viewer.entities) return;

  if (!solarSimState) window.solarSimState = {};
  if (!solarSimState.dynamicShadowEntities) solarSimState.dynamicShadowEntities = [];
  const activeShadowIds = new Set();

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
  const shadowMatBld = shadowMatObs;

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
          const shadowQuads = getBuildingShadowPolygons2DForRoof(bld, pInfo, sU, sV, solarPos.shadowLenPerM);
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
    runEnergyComparison: runEnergyComparison,
    renderAnalysisResults: renderAnalysisResults,
    exportEnergyAnalysis: exportEnergyAnalysis,
    renderGeometryAnalysis: renderGeometryAnalysis,
    runEngineSelfTestsOnCard: runEngineSelfTestsOnCard,
    renderMonteCarloHistogram: renderMonteCarloHistogram,
    renderWaterfallChart: renderWaterfallChart,
    showDailyCurve: showDailyCurve,
    renderDailyCurve: renderDailyCurve,
    wpComputeInstantSolarPosition: wpComputeInstantSolarPosition,
    wpSyncCesiumSun: wpSyncCesiumSun,
    wpRenderDynamicObstacleShadows: wpRenderDynamicObstacleShadows,
    wpUpdateSolarSimulation: wpUpdateSolarSimulation,
    wpSetSolarMonth: wpSetSolarMonth,
    wpSetSolarHour: wpSetSolarHour,
    wpToggleSolarPlay: wpToggleSolarPlay,
    wpSetSolarSpeed: wpSetSolarSpeed
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
  global.runEnergyComparison = runEnergyComparison;
  global.setShadingStrategy = function(s) { _seShadingStrategy = (s === 'exclude') ? 'exclude' : 'mlpe'; };
  global.renderAnalysisResults = renderAnalysisResults;
  global.exportEnergyAnalysis = exportEnergyAnalysis;
  global.renderGeometryAnalysis = renderGeometryAnalysis;
  global.runEngineSelfTestsOnCard = runEngineSelfTestsOnCard;
  global.renderMonteCarloHistogram = renderMonteCarloHistogram;
  global.renderWaterfallChart = renderWaterfallChart;
  global.showDailyCurve = showDailyCurve;
  global.renderDailyCurve = renderDailyCurve;
  global.wpComputeInstantSolarPosition = wpComputeInstantSolarPosition;
  global.wpSyncCesiumSun = wpSyncCesiumSun;
  global.wpRenderDynamicObstacleShadows = wpRenderDynamicObstacleShadows;
  global.wpUpdateSolarSimulation = wpUpdateSolarSimulation;
  global.wpSetSolarMonth = wpSetSolarMonth;
  global.wpSetSolarHour = wpSetSolarHour;
  global.wpToggleSolarPlay = wpToggleSolarPlay;
  global.wpSetSolarSpeed = wpSetSolarSpeed;
  global.computeInterRowPitch = computeInterRowPitch;
  global.computeTiltYieldCurve = computeTiltYieldCurve;

})(typeof window !== 'undefined' ? window : globalThis);
