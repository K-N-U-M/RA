/**
 * ═══════════════════════════════════════════════════════════════════════
 * wind-constants.js — Constantes físicas, normativas y coeficientes
 *                     del módulo eólico RA-Wind
 * ═══════════════════════════════════════════════════════════════════════
 * @version 1.0.0  2026-10-22
 */
(function (global) {
  'use strict';

  var RAWind = global.RAWind || (global.RAWind = {});

  RAWind.CONSTANTS = {
    // ── Física del aire ──────────────────────────────────────────────
    AIR_DENSITY_STD: 1.225,        // kg/m³ a 15°C y nivel del mar (ISO 2533)
    GAS_CONSTANT_DRY_AIR: 287.05,  // J/(kg·K)
    GRAVITY: 9.80665,              // m/s²

    // ── Límites normativos españoles ─────────────────────────────────
    REBT_MAX_VOLTAGE_DROP_PCT: 1.5,          // % caída de tensión máxima (ITC-BT-40)
    ACOUSTIC_LIMIT_DAY_DBA: 45,              // dB(A) en lindero de día (RD 1367/2007)
    ACOUSTIC_LIMIT_NIGHT_DBA: 35,            // dB(A) en lindero de noche
    SHADOW_FLICKER_LIMIT_HOURS_YEAR: 30,     // h/año máximas sobre receptor (Guía IDAE)
    MIN_ROTOR_CLEARANCE_GROUND_M: 0.20,      // margen mínimo pala-suelo (m)
    SAFETY_FALL_RADIUS_FACTOR: 1.1,          // factor radio de caída libre (1.1 × H_punta)
    MIN_INTER_ROTOR_DISTANCE_DIAMETERS: 3.0, // distancia mínima entre rotores en diámetros (3D)

    // ── Velocidades de viento de referencia (m/s) ───────────────────
    CUT_IN_DEFAULT_MS: 2.5,
    RATED_DEFAULT_MS: 11.0,
    CUT_OUT_DEFAULT_MS: 25.0,
    SURVIVAL_DEFAULT_MS: 59.5,    // Ve50 clase III IEC 61400-2

    // ── Parámetros eléctricos eólicos ────────────────────────────────
    DUMP_LOAD_MARGIN_FACTOR: 1.20,     // sobredimensionamiento freno reostático (120%)
    DUMP_LOAD_DURATION_MIN: 30,        // duración mínima del frenado continuo (min)
    CABLE_RESISTIVITY_CU: 0.0175,      // Ω·mm²/m para cobre a 70°C
    CABLE_RESISTIVITY_AL: 0.0280,      // Ω·mm²/m para aluminio a 70°C

    // ── Aerodinámica (modelo de burbuja de cubierta — Wilson 1979) ──
    ROOFTOP_BUBBLE_LENGTH_COEF: 0.9,   // Lc = 0.9 · Sc
    ROOFTOP_BUBBLE_HEIGHT_COEF: 0.22,  // Hc = 0.22 · Sc
    ROOFTOP_SPEEDUP_MAX: 1.30,         // aceleración máxima en borde barlovento (+30%)
    ROOFTOP_INSIDE_BUBBLE_SPEEDUP: 0.35, // penalización dentro de la burbuja

    // ── Weibull ────────────────────────────────────────────────────
    WEIBULL_K_DEFAULT: 2.0,            // factor de forma Weibull (k=2 = Rayleigh)
    WIND_SHEAR_EXPONENT: 0.143,        // exponente de perfil de cizalladura (1/7)

    // ── Colores de interfaz eólica ────────────────────────────────
    COLOR_WIND_PRIMARY: '#38BDF8',     // azul cielo
    COLOR_WIND_ACCENT: '#7DD3FC',
    COLOR_ACOUSTIC_HOT: '#EF4444',     // rojo (zona ruidosa)
    COLOR_ACOUSTIC_MID: '#F59E0B',     // ámbar (zona media)
    COLOR_ACOUSTIC_COOL: '#10B981',    // verde (zona silenciosa)
    COLOR_WIND_TURBINE_3D: '#94A3B8'   // gris galvanizado para el mástil
  };

  // Compatibilidad Node.js (tests)
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = RAWind.CONSTANTS;
  }

})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : global));
