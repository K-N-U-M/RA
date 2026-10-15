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

  /**
   * Desagregación Erbs del índice de claridad kt → fracción difusa.
   * @param {number} ghi         Irradiancia global horizontal (W/m²)
   * @param {number} sunElevDeg  Elevación solar (grados)
   */
  function decomposeErbs(ghi, sunElevDeg) {
    const sinElev = Math.sin(sunElevDeg * Math.PI / 180);
    const kt = Math.min(0.85, Math.max(0.1, ghi / (SOLAR_CONST_WM2 * sinElev + 1e-3)));
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
    const dni = (ghi - dhi) / (sinElev + 1e-4);
    return { kt, dhiFraction, dhi, dni };
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
  function getPerezDiffuse(dhi, dni, ghi, sunElevDeg, tiltRad, cosTheta) {
    if (dhi <= 0) return 0;
    const elevRad = Math.max(0.01, (sunElevDeg || 0) * Math.PI / 180);
    const thetaZRad = Math.PI / 2 - elevRad;

    // Masa de aire óptica relativa (Kasten-Young 1989)
    const airMass = 1 / (Math.sin(elevRad) + 0.50572 * Math.pow(Math.max(0, (sunElevDeg || 0) + 6.07995), -1.6364));

    // Parámetro de brillo cenital Delta
    const delta = (dhi * airMass) / SOLAR_CONST_WM2;

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
      const Ai = dni / SOLAR_CONST_WM2;
      G_d = dhi * (Ai * (cosTheta / Math.max(sinElev, 1e-4)) + (1 - Ai) * ((1 + Math.cos(tiltRad)) / 2));
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
  function poa(ghi, latDeg, tiltDeg, azSurDeg, sunElevDeg, sunAzSurDeg, albedo) {
    const alb = (typeof albedo === 'number') ? albedo : 0.20;
    if (sunElevDeg <= 0 || ghi <= 0) {
      return { G_poa: 0, G_b: 0, G_d: 0, G_r: 0, incAngleDeg: 0, iamFactor: 1 };
    }
    const tiltRad = tiltDeg * Math.PI / 180;
    const cosTheta = Math.max(0, Math.min(1, incidenceCos(tiltDeg, azSurDeg, sunElevDeg, sunAzSurDeg)));
    const dec = decomposeErbs(ghi, sunElevDeg);
    const tp = transposeComponents({
      ghi: ghi, dhi: dec.dhi, dni: dec.dni,
      cosTheta: cosTheta, tiltRad: tiltRad, albedo: alb, sunElevDeg: sunElevDeg
    });
    const incAngleDeg = Math.acos(cosTheta) * 180 / Math.PI;
    return {
      G_poa: tp.G_poa,
      G_b: tp.G_b,
      G_d: tp.G_d,
      G_r: tp.G_r,
      incAngleDeg: incAngleDeg,
      iamFactor: tp.iamFactor
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
    SOLAR_CONST_WM2
  };

  if (!root.RA) root.RA = {};
  root.RA.Radiation = RARadiation;
  root.RARadiation = RARadiation;

})(typeof window !== 'undefined' ? window : this);
