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

  /**
   * Transposición física de componentes (Hay-Davies anisotrópica + IAM ASHRAE).
   * @param {Object} o
   * @param {number} o.ghi       Irradiancia global horizontal (W/m²)
   * @param {number} o.dhi       Irradiancia difusa horizontal (W/m²)
   * @param {number} o.dni       Irradiancia directa normal (W/m²)
   * @param {number} o.cosTheta  Coseno del ángulo de incidencia (puede ser negativo)
   * @param {number} o.tiltRad   Inclinación del plano en radianes
   * @param {number} [o.albedo]  Albedo del entorno (default 0.20)
   * @param {number} [o.iamB0]   Coeficiente ASHRAE (default 0.05)
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

    // Componente difusa anisotrópica (Hay-Davies)
    const Ai = dni / SOLAR_CONST_WM2;
    const G_d = dhi * (Ai * (cosTheta / sinElev) + (1 - Ai) * ((1 + Math.cos(tiltRad)) / 2));

    // Componente reflejada (albedo)
    const G_r = ghi * albedo * ((1 - Math.cos(tiltRad)) / 2);

    // Modificador de ángulo de incidencia (IAM ASHRAE)
    const iamFactor = (cosTheta > 0.01) ? Math.max(0, 1 - b0 * ((1 / cosTheta) - 1)) : 0;
    const iamBlend = 0.85 + 0.15 * iamFactor;

    const G_poa_raw = G_b + G_d + G_r;
    const G_poa = G_poa_raw * iamBlend;

    return {
      G_b: G_b,
      G_d: G_d,
      G_r: G_r,
      G_poa_raw: G_poa_raw,
      G_poa: G_poa,
      iamFactor: iamFactor,
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

  const RARadiation = {
    decomposeErbs,
    incidenceCos,
    transposeComponents,
    poa,
    SOLAR_CONST_WM2
  };

  if (!root.RA) root.RA = {};
  root.RA.Radiation = RARadiation;
  root.RARadiation = RARadiation;

})(typeof window !== 'undefined' ? window : this);
