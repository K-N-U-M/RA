/**
 * ============================================================================
 * ☀️ RA - MOTOR DE RADIACIÓN SOLAR (FUENTE ÚNICA DE VERDAD)
 * ============================================================================
 * Archivo: js/radiation-engine.js
 * Rol: Único motor de desagregación y transposición de radiación solar.
 *      Consumido por:
 *        - solar-engine.js  → computePOAIrradiance(), calcPOA(), runPhysicalModel()
 *        - index.html       → getProjectCalcs() (producción canónica)
 *        - solar-heatmap.js → simulación anual por panel (192 instantes)
 *
 * Modelo: Erbs (desagregación GHI → DHI/DNI) + transposición Hay-Davies
 *         anisotrópica + modificador de ángulo de incidencia ASHRAE (b0 = 0.05).
 *
 * API pública (window.RA.Radiation / window.RARadiation):
 *   - decomposeErbs(ghi, sunElevDeg)                 → { kt, dhiFraction, dhi, dni }
 *   - incidenceCos(tiltDeg, azSurDeg, sunElevDeg, sunAzSurDeg) → cos(θ)
 *   - transposeComponents(opts)                      → { G_b, G_d, G_r, G_poa, iamFactor, iamBlend, incAngleDeg }
 *   - poa(ghi, latDeg, tiltDeg, azSurDeg, sunElevDeg, sunAzSurDeg, albedo) → igual que computePOAIrradiance
 *
 * Convención de acimut: azSurDeg es el acimut del panel respecto al Sur
 *   (0°=Sur, -90°=Este, +90°=Oeste), igual que computePOAIrradiance.
 * ============================================================================
 */
(function (root) {
  'use strict';

  var SOLAR_CONST_WM2 = 1367;
  var ALBEDO_DEFAULT = 0.20;
  const IAM_B0_DEFAULT = 0.05;
  const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const T_AMB_MONTHLY_ESP = {
    costal_med: [11.0, 12.0, 14.0, 16.0, 20.0, 25.0, 28.0, 28.5, 24.0, 19.0, 14.0, 11.0],
    costa_med:  [11.0, 12.0, 14.0, 16.0, 20.0, 25.0, 28.0, 28.5, 24.0, 19.0, 14.0, 11.0],
    interior:   [5.0,  7.0,  10.0, 12.0, 17.0, 23.0, 27.0, 27.0, 22.0, 15.0,  9.0,  5.0],
    atlantico:  [9.0,  10.0, 12.0, 13.0, 16.0, 19.0, 21.0, 21.5, 19.0, 15.0, 11.0,  9.0],
    canarias:   [18.0, 18.5, 19.0, 20.0, 21.5, 23.5, 25.0, 26.0, 25.5, 23.5, 21.0, 19.0]
  };

  function _wrap180(deg) {
    let x = (((Number(deg) || 0) % 360) + 360) % 360;
    if (x > 180) x -= 360;
    return x === 0 ? 0 : x;
  }

  /**
   * Normaliza el acimut del módulo a la convención física solar (0°=Sur, -90°=Este, +90°=Oeste, ±180°=Norte).
   * @param {number} azimutDeg
   * @param {'auto'|'solar'|'compass'} [convention='auto']
   */
  function normalizePanelAzSur(azimutDeg, convention) {
    const az = Number(azimutDeg);
    if (!Number.isFinite(az)) return 0;
    if (convention === 'compass') return _wrap180(az - 180);
    if (convention === 'solar') return _wrap180(az);
    if (az > 90 && az <= 360) return _wrap180(az - 180);
    return _wrap180(az);
  }

  function solarDeclination(dayOfYear, solarDecimalHour) {
    const hShift = (typeof solarDecimalHour === 'number' && Number.isFinite(solarDecimalHour)) ? (solarDecimalHour - 12) / 24 : 0;
    const gamma = (2 * Math.PI / 365) * ((dayOfYear || 1) - 1 + hShift);
    const declRad = 0.006918
      - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma)
      - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma)
      - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
    return (declRad * 180) / Math.PI;
  }

  function equationOfTimeMin(dayOfYear, solarDecimalHour) {
    const hShift = (typeof solarDecimalHour === 'number' && Number.isFinite(solarDecimalHour)) ? (solarDecimalHour - 12) / 24 : 0;
    const gamma = (2 * Math.PI / 365) * ((dayOfYear || 1) - 1 + hShift);
    return 229.18 * (
      0.000075
      + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma)
      - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma)
    );
  }

  function hourAngle(hourSolar) {
    return 15 * ((hourSolar || 0) - 12);
  }

  function solarAltitude(latDeg, declDeg, haDeg) {
    const lat = latDeg * Math.PI / 180;
    const decl = declDeg * Math.PI / 180;
    const ha = haDeg * Math.PI / 180;
    const sinAlt = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha);
    return Math.asin(Math.max(-1, Math.min(1, sinAlt))) * 180 / Math.PI;
  }

  function solarAzimuthAtan2(latDeg, declDeg, haDeg) {
    const phi = latDeg * Math.PI / 180;
    const delta = declDeg * Math.PI / 180;
    const omega = haDeg * Math.PI / 180;
    const A = Math.atan2(
      -Math.sin(omega) * Math.cos(delta),
      Math.sin(delta) * Math.cos(phi) - Math.cos(delta) * Math.sin(phi) * Math.cos(omega)
    );
    return (((A * 180 / Math.PI) % 360) + 360) % 360;
  }

  function computeSolarPosition(latDeg, lonDeg, doy, decimalHour, isUtc) {
    const useUtc = (isUtc !== false);
    const Et = equationOfTimeMin(doy, decimalHour);
    const declDeg = solarDeclination(doy, decimalHour);
    const solarTime = useUtc ? (decimalHour + (4 * lonDeg + Et) / 60) : decimalHour;
    const haDeg = hourAngle(solarTime);
    const rawElevDeg = solarAltitude(latDeg, declDeg, haDeg);
    const elevRad = rawElevDeg * Math.PI / 180;
    const azDegFromNorth = solarAzimuthAtan2(latDeg, declDeg, haDeg);
    const azDegFromSouth = _wrap180(azDegFromNorth - 180);

    const clampedElevRad = Math.max(0, elevRad);
    const azNRad = azDegFromNorth * Math.PI / 180;
    const sunVecENU = {
      x: Math.cos(clampedElevRad) * Math.sin(azNRad),
      y: Math.cos(clampedElevRad) * Math.cos(azNRad),
      z: Math.sin(clampedElevRad)
    };
    const sDirENU = { x: -sunVecENU.x, y: -sunVecENU.y, z: 0 };
    const magH = Math.hypot(sDirENU.x, sDirENU.y);
    if (magH > 1e-6) {
      sDirENU.x /= magH;
      sDirENU.y /= magH;
    }

    return {
      elevDeg: Math.max(0, rawElevDeg),
      rawElevDeg: rawElevDeg,
      elevRad: elevRad,
      azDegFromNorth: azDegFromNorth,
      azDegFromSouth: azDegFromSouth,
      declDeg: declDeg,
      EtMinutes: Et,
      isDay: rawElevDeg > 0,
      sunVecENU: sunVecENU,
      sDirENU: sDirENU,
      shadowLenPerM: rawElevDeg >= 5.0 ? Math.min(1 / Math.tan(clampedElevRad), 5.67) : 0
    };
  }

  function estimateMonthlyGHI(latDeg, monthIdx) {
    const KT_BASE = [0.55, 0.58, 0.60, 0.60, 0.60, 0.64, 0.68, 0.68, 0.62, 0.57, 0.52, 0.50];
    const lat = Number.isFinite(latDeg) ? latDeg : 40.4;
    const rawLatFactor = 1 - (lat - 40) * 0.008;
    const latFactor = Math.max(0.80, Math.min(1.25, rawLatFactor));
    const midDay = [17, 47, 75, 105, 135, 162, 198, 228, 258, 288, 318, 344];
    const m = Math.max(0, Math.min(11, monthIdx | 0));
    const doy = midDay[m];
    const decl = solarDeclination(doy) * Math.PI / 180;
    const latRad = lat * Math.PI / 180;
    const wsArg = Math.max(-1, Math.min(1, -Math.tan(latRad) * Math.tan(decl)));
    const ws = Math.acos(wsArg);
    const Ho = (24 / Math.PI) * SOLAR_CONST_WM2 * (1 + 0.033 * Math.cos(2 * Math.PI * doy / 365))
      * (ws * Math.sin(latRad) * Math.sin(decl) + Math.cos(latRad) * Math.cos(decl) * Math.sin(ws));
    return Math.max(0, Ho * KT_BASE[m] * latFactor);
  }

  function getAmbientTempMonth(climaticZone, monthIdx) {
    const table = T_AMB_MONTHLY_ESP[climaticZone] || T_AMB_MONTHLY_ESP.interior;
    return table[Math.max(0, Math.min(11, monthIdx | 0))];
  }

  /**
   * Desagregación Erbs del índice de claridad kt → fracción difusa.
   * @param {number} ghi         Irradiancia global horizontal (W/m²)
   * @param {number} sunElevDeg  Elevación solar (grados)
   * @param {number} [dayOfYear] Día del año (1-365). Si se indica, corrige la
   *                             excentricidad orbital (D-04): kt = GHI / (I0·cosθz)
   *                             con I0 = 1367·(1 + 0,033·cos(360·n/365)).
   */
  function decomposeErbs(ghi, sunElevDeg, dayOfYear) {
    if (!sunElevDeg || sunElevDeg <= 0 || !ghi || ghi <= 0) {
      return { kt: 0, dhiFraction: 1.0, dhi: 0, dni: 0, e0: 1 };
    }
    const sinElev = Math.max(0.017, Math.sin(sunElevDeg * Math.PI / 180));
    const e0 = (typeof dayOfYear === 'number' && isFinite(dayOfYear) && dayOfYear >= 1)
      ? (1 + 0.033 * Math.cos(2 * Math.PI * (dayOfYear - 1) / 365))
      : 1;
    // [AUD-2026 · D-05] kt es un índice físico en [0,1]; antes se recortaba a 0,85.
    const kt = Math.min(1.0, Math.max(0.0, ghi / (SOLAR_CONST_WM2 * e0 * sinElev + 1e-3)));
    let dhiFraction;
    if (kt < 0.22) {
      dhiFraction = 1.0 - 0.09 * kt;
    } else if (kt < 0.80) {
      dhiFraction = 0.9511 - 0.1604 * kt + 4.388 * Math.pow(kt, 2)
                  - 16.638 * Math.pow(kt, 3) + 12.336 * Math.pow(kt, 4);
    } else {
      dhiFraction = 0.165;
    }
    const dhi = ghi * dhiFraction;
    const maxDni = 1150; // Límite físico en superficie terrestre bajo cielo despejado (CTE/ASHRAE)
    const dni = Math.max(0, Math.min(maxDni, (ghi - dhi) / Math.max(sinElev, 0.05)));
    return { kt, dhiFraction, dhi, dni, e0 };
  }

  /**
   * Coseno del ángulo de incidencia (convención azimut desde el Sur).
   */
  function incidenceCos(tiltDeg, azSurDeg, sunElevDeg, sunAzSurDeg) {
    const tilt = tiltDeg * Math.PI / 180;
    const elev = sunElevDeg * Math.PI / 180;
    const dAz = (sunAzSurDeg - azSurDeg) * Math.PI / 180;
    return Math.sin(elev) * Math.cos(tilt)
         + Math.cos(elev) * Math.sin(tilt) * Math.cos(dAz);
  }

  const PEREZ_BINS = [
    { maxEps: 1.065, f: [-0.008,  0.588, -0.062, -0.060,  0.072, -0.022] },
    { maxEps: 1.230, f: [ 0.130,  0.683, -0.151, -0.019,  0.066, -0.029] },
    { maxEps: 1.500, f: [ 0.330,  0.487, -0.221,  0.055, -0.064, -0.026] },
    { maxEps: 1.950, f: [ 0.568,  0.187, -0.295,  0.109, -0.152, -0.014] },
    { maxEps: 2.800, f: [ 0.873, -0.392, -0.362,  0.226, -0.462,  0.001] },
    { maxEps: 4.500, f: [ 1.132, -1.237, -0.412,  0.288, -0.823,  0.056] },
    { maxEps: 6.200, f: [ 1.060, -1.600, -0.359,  0.264, -1.127,  0.131] },
    { maxEps: Infinity, f: [ 0.678, -0.327, -0.250, 0.156, -1.377,  0.251] }
  ];

  /**
   * Modelo de difusa anisotrópica de Perez (1990) con abrillantamiento circunsolar y de horizonte.
   */
  function getPerezDiffuse(dhi, dni, ghi, sunElevDeg, tiltRad, cosTheta, dayOfYear) {
    if (dhi <= 0) return 0;
    const elevRad = Math.max(0.01, (sunElevDeg || 0) * Math.PI / 180);
    const thetaZRad = Math.PI / 2 - elevRad;

    // Masa de aire óptica relativa (Kasten-Young 1989) con clamp seguro
    const rawAm = 1 / (Math.sin(elevRad) + 0.50572 * Math.pow(Math.max(0.01, (sunElevDeg || 0) + 6.07995), -1.6364));
    const airMass = Math.min(38.0, Math.max(1.0, rawAm));

    // [F2-02] Corrección por excentricidad orbital e0 en I0 extraterrestre
    const doy = (typeof dayOfYear === 'number' && dayOfYear >= 1 && dayOfYear <= 366) ? dayOfYear : 172;
    const e0 = 1.0 + 0.033 * Math.cos((2 * Math.PI * doy) / 365);
    const delta = (dhi * airMass) / (SOLAR_CONST_WM2 * e0);

    // Parámetro de claridad atmosférica Epsilon
    const kappa = 1.041;
    const thetaZ3 = Math.pow(thetaZRad, 3);
    const eps = ((dhi + dni) / (dhi + 1e-4) + kappa * thetaZ3) / (1 + kappa * thetaZ3);

    // Selección de coeficientes de brillo según bin de claridad
    let fCoeffs = PEREZ_BINS[PEREZ_BINS.length - 1].f;
    for (let i = 0; i < PEREZ_BINS.length; i++) {
      if (eps <= PEREZ_BINS[i].maxEps) {
        fCoeffs = PEREZ_BINS[i].f;
        break;
      }
    }

    // Factores F1 (circunsolar) y F2 (horizonte)
    const f1 = Math.max(0, fCoeffs[0] + fCoeffs[1] * delta + fCoeffs[2] * thetaZRad);
    const f2 = fCoeffs[3] + fCoeffs[4] * delta + fCoeffs[5] * thetaZRad;

    const a = Math.max(0, cosTheta);
    const b = Math.max(Math.cos(85 * Math.PI / 180), Math.sin(elevRad));

    const termIso = (1 - f1) * ((1 + Math.cos(tiltRad)) / 2);
    const termCirc = f1 * (a / b);
    const termHoriz = f2 * Math.sin(tiltRad);

    return dhi * Math.max(0, termIso + termCirc + termHoriz);
  }

  /**
   * Transposición física de componentes (Hay-Davies / Perez 1990 anisotrópica + IAM ASHRAE).
   * @param {Object} o
   * @param {number} o.ghi       Irradiancia global horizontal (W/m²)
   * @param {number} o.dhi       Irradiancia difusa horizontal (W/m²)
   * @param {number} o.dni       Irradiancia directa normal (W/m²)
   * @param {number} o.cosTheta  Coseno del ángulo de incidencia (puede ser negativo)
   * @param {number} o.tiltRad   Inclinación del plano en radianes
   * @param {number} [o.albedo]  Albedo del entorno (default 0.20)
   * @param {number} [o.iamB0]   Coeficiente ASHRAE (default 0.05)
   * @param {string} [o.diffuseModel] 'hay-davies' (default) o 'perez' (Perez 1990)
   * @returns {{G_b:number,G_d:number,G_r:number,G_poa:number,G_poa_raw:number,iamFactor:number,iamBlend:number}}
   */
  function transposeComponents(o) {
    const ghi = o.ghi || 0;
    const dhi = o.dhi || 0;
    const dni = o.dni || 0;
    const cosTheta = Math.max(0, Math.min(1, (typeof o.cosTheta === 'number') ? o.cosTheta : 0));
    const tiltRad = o.tiltRad || 0;
    const albedo = (typeof o.albedo === 'number') ? o.albedo : 0.20;
    const b0 = (typeof o.iamB0 === 'number') ? o.iamB0 : 0.05;
    const sinElev = Math.sin((o.sunElevDeg || 0) * Math.PI / 180);

    // Componente directa (beam)
    const G_b = Math.max(0, dni * cosTheta);

    // Componente difusa anisotrópica: Perez 1990 o Hay-Davies
    let G_d = 0;
    if (o.diffuseModel === 'perez') {
      G_d = getPerezDiffuse(dhi, dni, ghi, o.sunElevDeg || 0, tiltRad, cosTheta);
    } else {
      const Ai = Math.max(0, Math.min(1.0, dni / SOLAR_CONST_WM2));
      const termCirc = Ai * (cosTheta / Math.max(sinElev, 0.05));
      const termIso = (1 - Ai) * ((1 + Math.cos(tiltRad)) / 2);
      G_d = Math.max(0, dhi * (termCirc + termIso));
    }

    // Componente reflejada (albedo)
    const G_r = ghi * albedo * ((1 - Math.cos(tiltRad)) / 2);

    // Modificador de ángulo de incidencia físico por componente (ASHRAE / Duffie & Beckman)
    const iamFactor = (cosTheta > 0.01) ? Math.max(0, 1 - b0 * ((1 / cosTheta) - 1)) : 0;
    // Transmitancia angular integrada para difusa celeste (ángulo medio incidente ~60°)
    const iamDiff = Math.max(0, 1 - b0 * (1 / Math.cos(60 * Math.PI / 180) - 1));
    // Transmitancia angular integrada para albedo del suelo (ángulo medio incidente ~68°)
    const iamAlb = Math.max(0, 1 - b0 * (1 / Math.cos(68 * Math.PI / 180) - 1));

    const G_b_eff = G_b * iamFactor;
    const G_d_eff = G_d * iamDiff;
    const G_r_eff = G_r * iamAlb;

    const G_poa_raw = G_b + G_d + G_r;
    const G_poa = G_b_eff + G_d_eff + G_r_eff;
    const iamBlend = G_poa_raw > 0 ? G_poa / G_poa_raw : 1.0;

    return {
      G_b: G_b,
      G_d: G_d,
      G_r: G_r,
      G_b_eff: G_b_eff,
      G_d_eff: G_d_eff,
      G_r_eff: G_r_eff,
      G_poa_raw: G_poa_raw,
      G_poa: G_poa,
      iamFactor: iamFactor,
      iamDiff: iamDiff,
      iamAlb: iamAlb,
      iamBlend: iamBlend
    };
  }

  /**
   * POA completo (Erbs + Hay-Davies + IAM) — equivalente exacto de computePOAIrradiance.
   */
  function poa(ghi, latDeg, tiltDeg, azSurDeg, sunElevDeg, sunAzSurDeg, albedo, dayOfYear, explicitDhi, diffuseModel) {
    const alb = (typeof albedo === 'number') ? albedo : 0.20;
    if (sunElevDeg <= 0 || ghi <= 0) {
      return { G_poa: 0, G_poa_raw: 0, G_b: 0, G_d: 0, G_r: 0, incAngleDeg: 0, iamFactor: 1, iamBlend: 1 };
    }
    const tiltRad = tiltDeg * Math.PI / 180;
    const cosTheta = Math.max(0, Math.min(1, incidenceCos(tiltDeg, azSurDeg, sunElevDeg, sunAzSurDeg)));
    const sinElev = Math.max(0.05, Math.sin(sunElevDeg * Math.PI / 180));
    let dhi, dni;
    if (typeof explicitDhi === 'number' && Number.isFinite(explicitDhi) && explicitDhi >= 0) {
      dhi = Math.min(ghi, explicitDhi);
      dni = Math.max(0, Math.min(1150, (ghi - dhi) / sinElev));
    } else {
      const dec = decomposeErbs(ghi, sunElevDeg, dayOfYear);
      dhi = dec.dhi;
      dni = dec.dni;
    }
    const tp = transposeComponents({
      ghi: ghi, dhi: dhi, dni: dni,
      cosTheta: cosTheta, tiltRad: tiltRad, albedo: alb, sunElevDeg: sunElevDeg,
      diffuseModel: diffuseModel || 'hay-davies'
    });
    const incAngleDeg = Math.acos(cosTheta) * 180 / Math.PI;
    return {
      G_poa: tp.G_poa,
      G_poa_raw: tp.G_poa_raw,
      G_b: tp.G_b,
      G_d: tp.G_d,
      G_r: tp.G_r,
      incAngleDeg: incAngleDeg,
      iamFactor: tp.iamFactor,
      iamBlend: tp.iamBlend
    };
  }

  /**
   * Transposición directa usando el modelo anisotrópico de Perez (1990).
   */
  function transposePerez(o) {
    return transposeComponents(Object.assign({}, o, { diffuseModel: 'perez' }));
  }

  const RARadiation = {
    decomposeErbs,
    incidenceCos,
    transposeComponents,
    transposePerez,
    getPerezDiffuse,
    PEREZ_BINS,
    poa,
    SOLAR_CONST_WM2,
    MONTH_DAYS,
    T_AMB_MONTHLY_ESP,
    getAmbientTempMonth,
    normalizePanelAzSur,
    solarDeclination,
    equationOfTimeMin,
    hourAngle,
    solarAltitude,
    solarAzimuthAtan2,
    computeSolarPosition,
    estimateMonthlyGHI
  };

  if (!root.RA) root.RA = {};
  root.RA.Radiation = RARadiation;
  root.RARadiation = RARadiation;

})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : this));
