/**
 * ═══════════════════════════════════════════════════════════════════════
 * wind-resource.js — Motor de Recurso Eólico, Extrapolación Logarítmica,
 *                    Distribución de Weibull, Estelas de Jensen y AEP
 * ═══════════════════════════════════════════════════════════════════════
 * Calcula la producción anual de energía (AEP) de cada aerogenerador y
 * del parque completo integrando:
 *   - Corrección termodinámica de densidad del aire por altitud y temperatura (IEC 61400-12-1)
 *   - Extrapolación vertical de capa límite (perfil logarítmico z0 / ley exponencial)
 *   - Factor de aceleración sobre cubierta (Wilson 1979 vía wind-rooftop-cfd.js)
 *   - Modelo de estelas múltiples de Jensen (N.O. Jensen, 1983) con superposición cuadrática
 *   - Integración numérica de la función de densidad de probabilidad de Weibull con la curva P(v)
 * @version 2.0.0  2026-10-24
 */
(function (global) {
  'use strict';

  var RAWind = global.RAWind || (global.RAWind = {});

  var STORAGE_KEY = 'ra_wind_resource_cfg_v1';

  // Rosa de los vientos por defecto (12 sectores de 30°: N, NNE, ENE, E, ESE, SSE, S, SSW, WSW, W, WNW, NNW)
  var DEFAULT_SECTORS = [
    { dirDeg: 0,   label: 'N',   freq: 0.06, k: 2.0, vScale: 0.90 },
    { dirDeg: 30,  label: 'NNE', freq: 0.05, k: 2.0, vScale: 0.85 },
    { dirDeg: 60,  label: 'ENE', freq: 0.05, k: 1.9, vScale: 0.85 },
    { dirDeg: 90,  label: 'E',   freq: 0.07, k: 2.0, vScale: 0.95 },
    { dirDeg: 120, label: 'ESE', freq: 0.06, k: 1.9, vScale: 0.90 },
    { dirDeg: 150, label: 'SSE', freq: 0.06, k: 1.9, vScale: 0.90 },
    { dirDeg: 180, label: 'S',   freq: 0.08, k: 2.0, vScale: 0.95 },
    { dirDeg: 210, label: 'SSW', freq: 0.10, k: 2.1, vScale: 1.05 },
    { dirDeg: 240, label: 'WSW', freq: 0.14, k: 2.2, vScale: 1.12 },
    { dirDeg: 270, label: 'W',   freq: 0.16, k: 2.2, vScale: 1.15 },
    { dirDeg: 300, label: 'WNW', freq: 0.10, k: 2.1, vScale: 1.05 },
    { dirDeg: 330, label: 'NNW', freq: 0.07, k: 2.0, vScale: 0.95 }
  ];

  var DEFAULT_CONFIG = {
    sourceName: 'Manual / IDAE (Por defecto)',
    vMeanRefMs: 5.5,             // Velocidad media anual a altura de referencia (m/s)
    vMean50mMs: 7.2,             // Velocidad media anual a 50m (m/s)
    refHeightM: 10.0,            // Altura anemométrica de referencia (m)
    weibullK: 2.0,               // Factor de forma Weibull (k=2 equivale a Rayleigh)
    roughnessLengthM: 0.10,      // Longitud de rugosidad z0 (m): 0.03 campo abierto, 0.10 periurbano, 0.40 urbano/industrial
    shearExponentAlpha: 0.143,   // Exponente de Hellmann (1/7)
    prevailingWindDirDeg: 270,   // Dirección dominante del viento (270° = Oeste)
    autoYawToWind: true,         // Auto-orientar góndolas HAWT al viento predominante
    ambientTempC: 15.0,          // Temperatura media anual (°C)
    siteAltitudeM: 100.0,        // Altitud sobre el nivel del mar (m)
    receptorDistanceM: 35.0,     // Distancia al receptor / lindero más cercano para evaluación acústica (m)
    availabilityFactor: 0.97,    // Disponibilidad técnica anual (97%)
    electricalEfficiency: 0.95,  // Eficiencia global rectificador + inversor
    sectors: DEFAULT_SECTORS
  };

  function _initConfig() {
    if (global.windResourceConfig && typeof global.windResourceConfig === 'object') {
      if (!Array.isArray(global.windResourceConfig.sectors) || global.windResourceConfig.sectors.length !== 12) {
        global.windResourceConfig.sectors = JSON.parse(JSON.stringify(DEFAULT_SECTORS));
      }
      return global.windResourceConfig;
    }
    var cfg = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    try {
      if (typeof localStorage !== 'undefined') {
        var raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          var parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            Object.keys(DEFAULT_CONFIG).forEach(function (k) {
              if (k === 'sectors' && Array.isArray(parsed.sectors) && parsed.sectors.length === 12) {
                cfg.sectors = parsed.sectors;
              } else if (k === 'sourceName' && typeof parsed.sourceName === 'string') {
                cfg.sourceName = parsed.sourceName;
              } else if (k === 'autoYawToWind' && typeof parsed.autoYawToWind === 'boolean') {
                cfg.autoYawToWind = parsed.autoYawToWind;
              } else if (parsed[k] !== undefined && !isNaN(Number(parsed[k]))) {
                cfg[k] = Number(parsed[k]);
              }
            });
          }
        }
      }
    } catch (e) { /* ignore storage errors */ }
    global.windResourceConfig = cfg;
    return cfg;
  }

  function getConfig() {
    return _initConfig();
  }

  function updateConfig(partial) {
    var cfg = _initConfig();
    if (partial && typeof partial === 'object') {
      Object.keys(partial).forEach(function (k) {
        if (k === 'sectors' && Array.isArray(partial.sectors) && partial.sectors.length === 12) {
          cfg.sectors = partial.sectors;
        } else if (k === 'sourceName' && typeof partial.sourceName === 'string') {
          cfg.sourceName = partial.sourceName;
        } else if (k === 'autoYawToWind' && typeof partial.autoYawToWind === 'boolean') {
          cfg.autoYawToWind = partial.autoYawToWind;
        } else if (cfg[k] !== undefined && !isNaN(Number(partial[k]))) {
          cfg[k] = Number(partial[k]);
        }
      });
    }
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
      }
    } catch (e) { /* ignore */ }
    return cfg;
  }

  /**
   * Aproximación numérica de la función Gamma Γ(x) (fórmula de Lanczos/Stirling)
   * para calcular el parámetro de escala de Weibull c = vMean / Γ(1 + 1/k).
   */
  function gammaFunction(z) {
    if (z <= 0) return 1.0;
    // Para k=2 -> z = 1.5 -> Γ(1.5) = 0.8862269
    var g = 7;
    var p = [
      0.99999999999980993,
      676.5203681218851,
      -1259.1392167224028,
      771.32342877765313,
      -176.61502916214059,
      12.507343278686905,
      -0.13857109526572012,
      9.9843695780195716e-6,
      1.5056327351493116e-7
    ];
    if (z < 0.5) {
      return Math.PI / (Math.sin(Math.PI * z) * gammaFunction(1 - z));
    }
    z -= 1;
    var x = p[0];
    for (var i = 1; i < g + 2; i++) {
      x += p[i] / (z + i);
    }
    var t = z + g + 0.5;
    return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
  }

  /**
   * Calcula la densidad del aire corregida por altitud barométrica y temperatura (IEC 61400-12-1).
   * ρ(z, T) = (P0 / (R_d · T_K)) · exp(-g · z / (R_d · T_K))
   */
  function calculateAirDensity(altitudeM, tempC) {
    var z = Math.max(0, Number(altitudeM) || 0);
    var T = (Number(tempC) !== undefined && !isNaN(Number(tempC))) ? Number(tempC) : 15.0;
    var Tk = T + 273.15;
    var P0 = 101325.0; // Pa a nivel del mar
    var Rd = (RAWind.CONSTANTS && RAWind.CONSTANTS.GAS_CONSTANT_DRY_AIR) || 287.05;
    var g = (RAWind.CONSTANTS && RAWind.CONSTANTS.GRAVITY) || 9.80665;
    var rho = (P0 / (Rd * Tk)) * Math.exp((-g * z) / (Rd * Tk));
    return Number(Math.max(0.75, Math.min(1.40, rho)).toFixed(4));
  }

  /**
   * Extrapola la velocidad del viento desde la altura de referencia (zRef) hasta la altura del buje (zHub)
   * usando el perfil logarítmico de capa límite neutral con desplazamiento de plano cero (Monin-Obukhov):
   * v(z) = vRef · ln((z - d) / z0) / ln((zRef - d) / z0).
   */
  function extrapolateWindSpeed(vRef, zRef, zHub, z0, alpha, displacementHeightM) {
    vRef = Math.max(0, Number(vRef) || 0);
    zRef = Math.max(1.5, Number(zRef) || 10.0);
    zHub = Math.max(1.5, Number(zHub) || 18.0);
    z0 = Math.max(0.0002, Number(z0) || 0.10);

    // En entornos con rugosidad alta (urbano/industrial z0 >= 0.20m), las naves generan
    // una subcapa de rugosidad con plano de desplazamiento cero d ~ 0.7*H_nave
    var d = Math.max(0, Number(displacementHeightM) || (z0 >= 0.30 ? (z0 * 10.0 * 0.70) : 0));
    var effectiveZHub = Math.max(z0 * 1.5, zHub - d);
    var effectiveZRef = Math.max(z0 * 1.5, zRef - d);

    if (effectiveZHub > z0 * 1.5 && effectiveZRef > z0 * 1.5) {
      var ratioLog = Math.log(effectiveZHub / z0) / Math.log(effectiveZRef / z0);
      return vRef * Math.max(0.3, ratioLog);
    }
    var expAlpha = Number(alpha) || 0.143;
    return vRef * Math.pow(zHub / zRef, expAlpha);
  }

  /**
   * Función de densidad de probabilidad de Weibull f(v; k, c).
   */
  function weibullPdf(v, k, c) {
    if (v <= 0 || c <= 0 || k <= 0) return 0;
    var ratio = v / c;
    return (k / c) * Math.pow(ratio, k - 1) * Math.exp(-Math.pow(ratio, k));
  }

  function weibullCdf(v, k, c) {
    if (v <= 0 || c <= 0 || k <= 0) return 0;
    return 1.0 - Math.exp(-Math.pow(v / c, k));
  }

  /**
   * Interpola la potencia eléctrica P(v) y el coeficiente de empuje Ct(v) de la curva del fabricante,
   * escalando la velocidad efectiva o potencia según la relación de densidades IEC 61400-12-1.
   */
  function interpolatePowerCurve(powerCurve, vMs, airDensity, ratedPowerW, cutInMs, cutOutMs) {
    var rhoStd = (RAWind.CONSTANTS && RAWind.CONSTANTS.AIR_DENSITY_STD) || 1.225;
    var rho = Number(airDensity) || rhoStd;
    var cutIn = Number(cutInMs) || 2.5;
    var cutOut = Number(cutOutMs) || 25.0;
    var pRated = Number(ratedPowerW) || 10000;

    if (vMs < cutIn || vMs > cutOut) {
      return { powerW: 0, ct: 0.05 };
    }

    // Corrección IEC 61400-12-1 de velocidad equivalente para turbinas reguladas por pérdida o paso:
    // v_eq = v · (ρ / ρ_0)^(1/3)
    var vEq = vMs * Math.pow(rho / rhoStd, 1 / 3);

    if (!Array.isArray(powerCurve) || powerCurve.length === 0) {
      // Curva analítica cúbica de respaldo
      var vRated = 11.0;
      if (vEq >= vRated) return { powerW: pRated, ct: 0.32 };
      var norm = (vEq - cutIn) / Math.max(1.0, vRated - cutIn);
      var pEst = pRated * Math.min(1.0, Math.pow(Math.max(0, norm), 2.5));
      return { powerW: pEst, ct: 0.42 };
    }

    if (vEq <= powerCurve[0].v) {
      if (vEq < cutIn) return { powerW: 0, ct: 0.05 };
      var frac0 = (vEq - cutIn) / Math.max(0.1, powerCurve[0].v - cutIn);
      return {
        powerW: Math.max(0, powerCurve[0].p * Math.max(0, Math.min(1, frac0))),
        ct: powerCurve[0].ct || 0.40
      };
    }

    var last = powerCurve[powerCurve.length - 1];
    if (vEq >= last.v) {
      return { powerW: last.p, ct: last.ct || 0.20 };
    }

    for (var i = 0; i < powerCurve.length - 1; i++) {
      var p0 = powerCurve[i];
      var p1 = powerCurve[i + 1];
      if (vEq >= p0.v && vEq <= p1.v) {
        var t = (p1.v > p0.v) ? ((vEq - p0.v) / (p1.v - p0.v)) : 0;
        var pVal = p0.p + t * (p1.p - p0.p);
        var ctVal = (p0.ct || 0.40) + t * ((p1.ct || 0.40) - (p0.ct || 0.40));
        return {
          powerW: Math.min(pRated * 1.05, Math.max(0, pVal)),
          ct: Math.max(0.05, ctVal)
        };
      }
    }

    return { powerW: 0, ct: 0.35 };
  }

  /**
   * Calcula el déficit de velocidad fraccional δv (0 a 1) que la turbina aguas arriba (upTurbine)
   * provoca sobre la turbina aguas abajo (downTurbine) para una dirección de viento dada (modelo N.O. Jensen, 1983).
   */
  function calculateJensenWakeDeficit(upTurbine, downTurbine, windDirDeg, kWake) {
    if (!upTurbine || !downTurbine || upTurbine.id === downTurbine.id) return 0;
    if (upTurbine.operationalState && upTurbine.operationalState.enabled === false) return 0;

    var upPos = upTurbine.positionCartographic;
    var downPos = downTurbine.positionCartographic;
    if (!upPos || !downPos) return 0;

    var meanLat = 0.5 * ((upPos.latitudeRad || 0) + (downPos.latitudeRad || 0));
    var dxEast = ((downPos.longitudeRad || 0) - (upPos.longitudeRad || 0)) * 6371000 * Math.cos(meanLat);
    var dyNorth = ((downPos.latitudeRad || 0) - (upPos.latitudeRad || 0)) * 6371000;

    // El viento viene DESDE windDirDeg (ej. 270° = viene del Oeste y sopla hacia el Este).
    // Vector unitario hacia donde viaja el viento (aguas abajo):
    var radFrom = (Number(windDirDeg) || 0) * Math.PI / 180;
    var flowEast = -Math.sin(radFrom);
    var flowNorth = -Math.cos(radFrom);

    // Proyección longitudinal (xDown > 0 significa que downTurbine está aguas abajo de upTurbine)
    var xDown = dxEast * flowEast + dyNorth * flowNorth;
    if (xDown <= 1.0) return 0;

    // Distancia lateral perpendicular al eje de la estela (incluyendo diferencia de altura de buje)
    var latPerp = Math.abs(-dxEast * flowNorth + dyNorth * flowEast);
    var zUp = (upPos.altitudeM || 0) + ((upTurbine.supportStructure && upTurbine.supportStructure.hubHeightM) || 18);
    var zDown = (downPos.altitudeM || 0) + ((downTurbine.supportStructure && downTurbine.supportStructure.hubHeightM) || 18);
    var dz = zDown - zUp;
    var radialOffset = Math.sqrt(latPerp * latPerp + dz * dz);

    var dUp = (upTurbine._catalog && upTurbine._catalog.rotorDiameterM) || 6.0;
    var rUp = dUp / 2;
    var dDown = (downTurbine._catalog && downTurbine._catalog.rotorDiameterM) || 6.0;
    var rDown = dDown / 2;

    var kw = Number(kWake) || 0.075; // Constante de expansión de estela onshore
    var rWake = rUp + kw * xDown;    // Radio del cono de estela a la distancia xDown

    // Si los discos no se solapan, no hay pérdida por estela
    if (radialOffset >= rWake + rDown) return 0;

    // Fracción de solapamiento geométrico entre el rotor aguas abajo y el cono de estela
    var overlapFraction = 1.0;
    if (radialOffset > Math.abs(rWake - rDown)) {
      overlapFraction = Math.max(0, Math.min(1, (rWake + rDown - radialOffset) / (2 * rDown)));
    }

    var ct = 0.42; // Coeficiente de empuje medio en zona de operación
    var baseDeficit = (1 - Math.sqrt(1 - ct)) / Math.pow(1 + (2 * kw * xDown) / dUp, 2);
    return Math.max(0, Math.min(0.75, baseDeficit * overlapFraction));
  }

  /**
   * Calcula la producción anual de energía (AEP neta y bruta), factor de capacidad,
   * pérdidas por estela y ganancia/penalización de cubierta para una turbina.
   */
  function computeTurbineAEP(turbineInstance, allTurbines, resourceCfg, rooftopResult) {
    if (!turbineInstance) return null;
    var cfg = resourceCfg || getConfig();
    var cat = turbineInstance._catalog || {};
    var ratedPowerW = Number(cat.ratedPowerW) || 10000;
    var cutInMs = Number(cat.cutInSpeedMs) || 2.5;
    var cutOutMs = Number(cat.cutOutSpeedMs) || 25.0;
    var hubH = (turbineInstance.supportStructure && turbineInstance.supportStructure.hubHeightM) || 18;

    // Si la turbina está desactivada, AEP = 0
    if (turbineInstance.operationalState && turbineInstance.operationalState.enabled === false) {
      var disabledRes = {
        aepGrossKwh: 0,
        aepNetKwh: 0,
        capacityFactor: 0,
        equivalentFullLoadHours: 0,
        wakeLossPercentage: 0,
        rooftopSpeedupGainPercentage: 0,
        hubWindSpeedMeanMs: 0,
        airDensityKgM3: calculateAirDensity(cfg.siteAltitudeM, cfg.ambientTempC),
        isDirty: false
      };
      turbineInstance.simulationResults = disabledRes;
      return disabledRes;
    }

    // [AUD-2026 · E-01] Sin una curva físicamente válida no se publica AEP:
    // una curva con Cp > Betz produce energía inexistente. Se devuelve un resultado
    // explícito (0 kWh + motivo) en lugar de un número alto y creíble.
    var cpAudit = turbineInstance.cpAudit || (cat && cat.cpAudit) || null;
    if (cpAudit && cpAudit.valid === false) {
      var invalidRes = {
        aepGrossKwh: 0,
        aepNetKwh: 0,
        capacityFactor: 0,
        equivalentFullLoadHours: 0,
        wakeLossPercentage: 0,
        rooftopSpeedupGainPercentage: 0,
        hubWindSpeedMeanMs: 0,
        airDensityKgM3: 0,
        isDirty: false,
        invalidPowerCurve: true,
        cpMax: cpAudit.maxCp,
        warning: 'Curva de potencia inválida (Cp_máx = ' + cpAudit.maxCp + ' > 0,593). AEP no calculable hasta corregir el datasheet.'
      };
      turbineInstance.simulationResults = invalidRes;
      return invalidRes;
    }

        var siteBaseAlt = Number(cfg.siteAltitudeM) || 100;
    var turbAltitudeM = (turbineInstance.positionCartographic && typeof turbineInstance.positionCartographic.altitudeM === "number")
      ? turbineInstance.positionCartographic.altitudeM
      : siteBaseAlt;
    // Elevación neta vertical del aerogenerador sobre la rasante de referencia del terreno:
    var deltaZTerrain = Math.max(0, turbAltitudeM - siteBaseAlt);
    // Altura efectiva del buje respecto a la capa límite del suelo:
    var effectiveHubHeightM = Math.max(hubH, hubH + deltaZTerrain);

    var rho = calculateAirDensity(turbAltitudeM + hubH, cfg.ambientTempC);

    // Evaluar efecto de cubierta (Wilson 1979) si aplica
    var roofCtx = rooftopResult || (RAWind.RooftopCFD
      ? RAWind.RooftopCFD.evaluateTurbineRooftopContext(turbineInstance)
      : { speedupFactor: 1.0, insideSeparationBubble: false });
    var speedup = (roofCtx && roofCtx.speedupFactor) ? Number(roofCtx.speedupFactor) : 1.0;

    // Velocidad media libre en el buje extrapolada con la cota efectiva:
    var vHubFree = extrapolateWindSpeed(
      cfg.vMeanRefMs,
      cfg.refHeightM,
      effectiveHubHeightM,
      cfg.roughnessLengthM,
      cfg.shearExponentAlpha
    );
    var vHubWithRoof = vHubFree * speedup;

    var kBase = Math.max(1.2, Math.min(3.5, Number(cfg.weibullK) || 2.0));
    var gammaFactor = gammaFunction(1 + 1 / kBase);

    // Constante de expansión de estela de Jensen según rugosidad: k_wake ≈ 0.5 / ln(zHub / z0)
    var kWake = 0.075;
    if (hubH > cfg.roughnessLengthM * 2) {
      kWake = Math.max(0.04, Math.min(0.14, 0.5 / Math.log(hubH / cfg.roughnessLengthM)));
    }

    var peers = Array.isArray(allTurbines) ? allTurbines : (global.windTurbines || []);
    var grossPowerFreeAvgW = 0; // Sin speedup ni estelas (para medir ganancia de cubierta)
    var grossPowerRoofAvgW = 0; // Con speedup de cubierta, sin estelas
    var netPowerWakeAvgW = 0;   // Con speedup de cubierta y con estelas de Jensen
    var totalOperatingProb = 0; // Probabilidad acumulada en rango [cutIn, cutOut]

    // Integración direccional (12 sectores de 30°) y de velocidad (bins de 0.5 m/s de 0.5 a 30 m/s)
    var activeSectors = (Array.isArray(cfg.sectors) && cfg.sectors.length === 12)
      ? cfg.sectors
      : DEFAULT_SECTORS;
    var dv = 0.5;
    for (var s = 0; s < activeSectors.length; s++) {
      var sec = activeSectors[s];
      var freq = sec.freq;

      // Superposición cuadrática de déficits de estela de Jensen en este sector direccional
      var sumSqDeficit = 0;
      for (var pIdx = 0; pIdx < peers.length; pIdx++) {
        var peer = peers[pIdx];
        if (!peer || peer.id === turbineInstance.id) continue;
        var def = calculateJensenWakeDeficit(peer, turbineInstance, sec.dirDeg, kWake);
        if (def > 0) {
          sumSqDeficit += def * def;
        }
      }
      // Incorporar interferencia analítica de obstáculos 3D del entorno (árboles, chimeneas, edificios)
      var obsEval = (RAWind.ObstacleInterference && typeof RAWind.ObstacleInterference.evaluateTurbineObstacleInterference === "function")
        ? RAWind.ObstacleInterference.evaluateTurbineObstacleInterference(turbineInstance, sec.dirDeg)
        : null;
      var obsDeficit = (obsEval && obsEval.hasInterference) ? (1.0 - obsEval.effectiveSpeedFactor) : 0.0;
      if (obsDeficit > 0) {
        sumSqDeficit += obsDeficit * obsDeficit;
      }
      var totalWakeDeficit = Math.min(0.75, Math.sqrt(sumSqDeficit));

      var vSecFree = Math.max(0.5, vHubFree * sec.vScale);
      var vSecRoof = Math.max(0.5, vHubWithRoof * sec.vScale);
      var vSecWake = Math.max(0.5, vSecRoof * (1 - totalWakeDeficit));

      var cFree = vSecFree / gammaFactor;
      var cRoof = vSecRoof / gammaFactor;
      var cWake = vSecWake / gammaFactor;

      var secPFree = 0;
      var secPRoof = 0;
      var secPWake = 0;

      for (var v = 0.5; v <= 28.0; v += dv) {
        var pCurvePt = interpolatePowerCurve(cat.powerCurve, v, rho, ratedPowerW, cutInMs, cutOutMs);
        var pW = pCurvePt.powerW;
        if (pW <= 0) continue;

        secPFree += pW * weibullPdf(v, kBase, cFree) * dv;
        secPRoof += pW * weibullPdf(v, kBase, cRoof) * dv;
        secPWake += pW * weibullPdf(v, kBase, cWake) * dv;
      }

      grossPowerFreeAvgW += freq * secPFree;
      grossPowerRoofAvgW += freq * secPRoof;
      netPowerWakeAvgW += freq * secPWake;
      var secOperProb = Math.max(0, weibullCdf(cutOutMs, kBase, cWake) - weibullCdf(cutInMs, kBase, cWake));
      totalOperatingProb += freq * secOperProb;
    }

    var hoursPerYear = 8760;
    var lossFactor = (cfg.availabilityFactor || 0.97) * (cfg.electricalEfficiency || 0.95);

    var aepFreeKwh = (grossPowerFreeAvgW * hoursPerYear / 1000) * lossFactor;
    var aepGrossKwh = (grossPowerRoofAvgW * hoursPerYear / 1000) * lossFactor;
    var aepNetKwh = (netPowerWakeAvgW * hoursPerYear / 1000) * lossFactor;

    var wakeLossPct = aepGrossKwh > 1
      ? Math.max(0, ((aepGrossKwh - aepNetKwh) / aepGrossKwh) * 100)
      : 0;

    var rooftopGainPct = aepFreeKwh > 1
      ? (((aepGrossKwh - aepFreeKwh) / aepFreeKwh) * 100)
      : 0;

    var ratedKw = ratedPowerW / 1000;
    var eqHours = ratedKw > 0 ? (aepNetKwh / ratedKw) : 0;
    var capFactor = eqHours / hoursPerYear;
    var operatingHours = Math.round(hoursPerYear * Math.min(1.0, Math.max(0.0, totalOperatingProb)));

    var result = {
      aepGrossKwh: Math.round(aepGrossKwh),
      aepNetKwh: Math.round(aepNetKwh),
      capacityFactor: Number(capFactor.toFixed(3)),
      equivalentFullLoadHours: Math.round(eqHours),
      operatingHoursPerYear: operatingHours,
      operatingAvailabilityPct: Number((totalOperatingProb * 100).toFixed(1)),
      wakeLossPercentage: Number(wakeLossPct.toFixed(1)),
      rooftopSpeedupGainPercentage: Number(rooftopGainPct.toFixed(1)),
      hubWindSpeedMeanMs: Number(vHubWithRoof.toFixed(2)),
      freeWindSpeedMeanMs: Number(vHubFree.toFixed(2)),
      airDensityKgM3: rho,
      rooftopContext: roofCtx,
      isDirty: false
    };

    turbineInstance.simulationResults = result;
    return result;
  }

  /**
   * Calcula la producción agregada de todo el parque eólico y genera una curva
   * mensual/horaria sintética de 8760h lista para la Fase 3 (despacho híbrido FV + Eólico).
   */
  function computeParkAEP(turbines, resourceCfg) {
    var list = Array.isArray(turbines) ? turbines : (global.windTurbines || []);
    var cfg = resourceCfg || getConfig();

    var totalRatedKw = 0;
    var totalAepGrossKwh = 0;
    var totalAepNetKwh = 0;
    var perTurbine = [];

    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      if (!t) continue;
      var res = computeTurbineAEP(t, list, cfg);
      var isEn = !(t.operationalState && t.operationalState.enabled === false);
      var kw = (t._catalog && t._catalog.ratedPowerW) ? (t._catalog.ratedPowerW / 1000) : 0;
      if (isEn) {
        totalRatedKw += kw;
        totalAepGrossKwh += res.aepGrossKwh;
        totalAepNetKwh += res.aepNetKwh;
      }
      perTurbine.push({
        id: t.id,
        name: t.name,
        ratedKw: kw,
        enabled: isEn,
        results: res
      });
    }

    var avgCapFactor = (totalRatedKw > 0)
      ? (totalAepNetKwh / (totalRatedKw * 8760))
      : 0;
    var parkWakeLossPct = (totalAepGrossKwh > 1)
      ? (((totalAepGrossKwh - totalAepNetKwh) / totalAepGrossKwh) * 100)
      : 0;

    // Factores estacionales mensuales típicos en España (mayor recurso eólico en invierno/primavera)
    var monthlyWeights = [0.105, 0.098, 0.095, 0.088, 0.078, 0.068, 0.064, 0.064, 0.070, 0.082, 0.090, 0.098];
    var monthlyKwh = monthlyWeights.map(function (w) {
      return Math.round(totalAepNetKwh * w);
    });

    var summary = {
      turbineCount: list.length,
      enabledCount: perTurbine.filter(function (x) { return x.enabled; }).length,
      totalRatedKw: Number(totalRatedKw.toFixed(2)),
      totalAepGrossKwh: Math.round(totalAepGrossKwh),
      totalAepNetKwh: Math.round(totalAepNetKwh),
      averageCapacityFactor: Number(avgCapFactor.toFixed(3)),
      equivalentHours: totalRatedKw > 0 ? Math.round(totalAepNetKwh / totalRatedKw) : 0,
      annualOperatingHours: perTurbine.length > 0 ? Math.round(perTurbine.reduce(function(a, b){ return a + ((b.results && b.results.operatingHoursPerYear) || 0); }, 0) / perTurbine.length) : 0,
      parkWakeLossPercentage: Number(parkWakeLossPct.toFixed(1)),
      monthlyKwh: monthlyKwh,
      perTurbine: perTurbine,
      resourceConfig: cfg,
      // [AUD-2026 · E-01] Trazabilidad de curvas rechazadas.
      hasInvalidCurves: perTurbine.some(function (x) { return x.results && x.results.invalidPowerCurve; }),
      invalidCurves: perTurbine
        .filter(function (x) { return x.results && x.results.invalidPowerCurve; })
        .map(function (x) { return { id: x.id, name: x.name, cpMax: x.results.cpMax }; })
    };

    global.windParkSummary = summary;
    return summary;
  }

  /**
   * Consulta la API meteorológica de reanálisis ERA5 (Copernicus / Open-Meteo) para
   * obtener la velocidad media real del viento, distribución de Weibull y rosa de vientos
   * para las coordenadas geográficas exactas del proyecto.
   *
   * @param {number} latDeg Latitud WGS84
   * @param {number} lonDeg Longitud WGS84
   * @param {Function} [callback] Callback fn(err, weatherResult)
   * @returns {Promise<Object>}
   */
  async function fetchERA5WindResource(latDeg, lonDeg, callback) {
    var lat = Number(latDeg);
    var lon = Number(lonDeg);
    if (isNaN(lat) || isNaN(lon)) {
      var errCoords = new Error('Coordenadas geográficas inválidas para consulta eólica');
      if (typeof callback === 'function') callback(errCoords, null);
      throw errCoords;
    }

    var cacheKey = 'ra_era5_wind_' + lat.toFixed(2) + '_' + lon.toFixed(2);
    try {
      if (typeof localStorage !== 'undefined') {
        var cached = localStorage.getItem(cacheKey);
        if (cached) {
          var parsedCache = JSON.parse(cached);
          // Caché válida durante 14 días
          if (parsedCache && parsedCache.timestamp && (Date.now() - parsedCache.timestamp) < (14 * 86400 * 1000)) {
            if (typeof callback === 'function') callback(null, parsedCache.data);
            return parsedCache.data;
          }
        }
      }
    } catch (eCache) {}

    // Año canónico de reanálisis consolidado
    var targetYear = 2023;
    var url = 'https://archive-api.open-meteo.com/v1/era5?latitude=' + lat.toFixed(4) +
      '&longitude=' + lon.toFixed(4) +
      '&start_date=' + targetYear + '-01-01&end_date=' + targetYear + '-12-31' +
      '&hourly=wind_speed_10m,wind_direction_10m,temperature_2m';

    try {
      var resp = await fetch(url);
      if (!resp.ok) {
        throw new Error('Open-Meteo ERA5 HTTP ' + resp.status);
      }
      var json = await resp.json();
      if (!json || !json.hourly || !Array.isArray(json.hourly.wind_speed_10m)) {
        throw new Error('Respuesta inválida de API ERA5');
      }

      var speedsKmh = json.hourly.wind_speed_10m;
      var dirsDeg = json.hourly.wind_direction_10m;
      var tempsC = json.hourly.temperature_2m || [];
      var nHours = speedsKmh.length;

      // Conversión km/h a m/s (1 km/h = 1/3.6 m/s)
      var kmhToMs = 1.0 / 3.6;
      var sumSpeed = 0;
      var sumTemp = 0;
      var speedMsList = new Float32Array(nHours);

      // 12 sectores direccionales de 30°
      var sectorCounts = new Array(12).fill(0);
      var sectorSpeedSums = new Array(12).fill(0);

      for (var i = 0; i < nHours; i++) {
        var vMs = speedsKmh[i] * kmhToMs;
        speedMsList[i] = vMs;
        sumSpeed += vMs;
        sumTemp += (tempsC[i] !== undefined ? tempsC[i] : 15.0);

        var dDeg = dirsDeg[i] !== undefined ? dirsDeg[i] : 0;
        var sIdx = Math.floor(((dDeg + 15.0) % 360) / 30.0);
        if (sIdx >= 0 && sIdx < 12) {
          sectorCounts[sIdx]++;
          sectorSpeedSums[sIdx] += vMs;
        }
      }

      var vMean = Number((sumSpeed / nHours).toFixed(2));
      var tMean = Number((sumTemp / nHours).toFixed(1));

      // Estimación del factor de forma Weibull k por método de momentos
      var sumSqDiff = 0;
      for (var j = 0; j < nHours; j++) {
        var diff = speedMsList[j] - vMean;
        sumSqDiff += (diff * diff);
      }
      var variance = sumSqDiff / (nHours - 1);
      var sigma = Math.sqrt(variance);
      // Aproximación empírica k ≈ (sigma / vMean)^(-1.086) (Justus / Stevens 1978)
      var weibullK = 2.0;
      if (vMean > 0.5 && sigma > 0.1) {
        weibullK = Number(Math.pow(sigma / vMean, -1.086).toFixed(2));
        weibullK = Math.max(1.3, Math.min(3.5, weibullK));
      }

      // Reconstitución de rosa de vientos
      var sectors = [];
      var sectorLabels = ['N', 'NNE', 'ENE', 'E', 'ESE', 'SSE', 'S', 'SSW', 'WSW', 'W', 'WNW', 'NNW'];
      var maxSectorFreq = 0;
      var prevailingDir = 270;

      for (var s = 0; s < 12; s++) {
        var freq = sectorCounts[s] / nHours;
        var avgSecSpeed = sectorCounts[s] > 0 ? (sectorSpeedSums[s] / sectorCounts[s]) : vMean;
        var vScale = vMean > 0 ? Number((avgSecSpeed / vMean).toFixed(2)) : 1.0;
        var dirCenter = s * 30;

        if (freq > maxSectorFreq) {
          maxSectorFreq = freq;
          prevailingDir = dirCenter;
        }

        sectors.push({
          dirDeg: dirCenter,
          label: sectorLabels[s],
          freq: Number(freq.toFixed(3)),
          k: weibullK,
          vScale: Math.max(0.6, Math.min(1.5, vScale))
        });
      }

      var result = {
        source: 'Copernicus ERA5 Reanalysis (Open-Meteo)',
        latitude: lat,
        longitude: lon,
        elevationM: json.elevation || 0,
        yearAnalyzed: targetYear,
        vMeanRefMs: vMean,
        refHeightM: 10.0,
        weibullK: weibullK,
        ambientTempC: tMean,
        prevailingWindDirDeg: prevailingDir,
        sectors: sectors,
        hourlyCount: nHours
      };

      // Guardar en caché
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(cacheKey, JSON.stringify({
            data: result,
            timestamp: Date.now()
          }));
        }
      } catch (eSave) {}

      if (typeof callback === 'function') callback(null, result);
      return result;

    } catch (err) {
      if (typeof callback === 'function') callback(err, null);
      throw err;
    }
  }

  /**
   * Consulta la API satelital de NASA POWER (LaRC Langley Research Center) para
   * obtener la climatología de velocidad del viento a 10m y 50m.
   *
   * @param {number} latDeg Latitud WGS84
   * @param {number} lonDeg Longitud WGS84
   * @param {Function} [callback]
   * @returns {Promise<Object>}
   */
  async function fetchNASAWindResource(latDeg, lonDeg, callback) {
    var lat = Number(latDeg);
    var lon = Number(lonDeg);
    if (isNaN(lat) || isNaN(lon)) {
      var errCoords = new Error('Coordenadas geográficas inválidas para NASA POWER');
      if (typeof callback === 'function') callback(errCoords, null);
      throw errCoords;
    }

    var cacheKey = 'ra_nasa_wind_' + lat.toFixed(2) + '_' + lon.toFixed(2);
    try {
      if (typeof localStorage !== 'undefined') {
        var cached = localStorage.getItem(cacheKey);
        if (cached) {
          var parsedCache = JSON.parse(cached);
          if (parsedCache && parsedCache.timestamp && (Date.now() - parsedCache.timestamp) < (30 * 86400 * 1000)) {
            if (typeof callback === 'function') callback(null, parsedCache.data);
            return parsedCache.data;
          }
        }
      }
    } catch (eCache) {}

    var url = 'https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=WS10M,WS50M,T2M&community=RE&longitude=' +
      lon.toFixed(4) + '&latitude=' + lat.toFixed(4) + '&format=JSON';

    try {
      var resp = await fetch(url);
      if (!resp.ok) {
        throw new Error('NASA POWER HTTP ' + resp.status);
      }
      var json = await resp.json();
      var props = json && json.properties && json.properties.parameter;
      if (!props || !props.WS10M) {
        throw new Error('Respuesta inválida de NASA POWER');
      }

      var ws10Annual = Number(props.WS10M.ANN) || 4.0;
      var ws50Annual = Number(props.WS50M ? props.WS50M.ANN : 0) || (ws10Annual * 1.25);
      var tempAnnual = Number(props.T2M ? props.T2M.ANN : 15.0) || 15.0;

      // Calcular exponente de cizalladura Hellmann empírico a partir de 10m y 50m
      var alphaAlpha = (ws50Annual > ws10Annual && ws10Annual > 0)
        ? Math.log(ws50Annual / ws10Annual) / Math.log(50.0 / 10.0)
        : 0.143;
      alphaAlpha = Math.max(0.10, Math.min(0.35, alphaAlpha));

      var result = {
        source: 'NASA POWER (Satelital LaRC Langley - Climatología 30a)',
        latitude: lat,
        longitude: lon,
        elevationM: (json.geometry && json.geometry.coordinates && json.geometry.coordinates[2]) || 0,
        vMeanRefMs: Number(ws10Annual.toFixed(2)),
        refHeightM: 10.0,
        vMean50mMs: Number(ws50Annual.toFixed(2)),
        shearExponentAlpha: Number(alphaAlpha.toFixed(3)),
        weibullK: 2.05,
        ambientTempC: Number(tempAnnual.toFixed(1)),
        prevailingWindDirDeg: 270,
        monthlyWS10M: [
          props.WS10M.JAN, props.WS10M.FEB, props.WS10M.MAR, props.WS10M.APR,
          props.WS10M.MAY, props.WS10M.JUN, props.WS10M.JUL, props.WS10M.AUG,
          props.WS10M.SEP, props.WS10M.OCT, props.WS10M.NOV, props.WS10M.DEC
        ]
      };

      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(cacheKey, JSON.stringify({
            data: result,
            timestamp: Date.now()
          }));
        }
      } catch (eSave) {}

      if (typeof callback === 'function') callback(null, result);
      return result;

    } catch (err) {
      if (typeof callback === 'function') callback(err, null);
      throw err;
    }
  }

  /**
   * Parser client-side de archivos de clima eólico generalizado WAsP (.lib / GWC)
   * del Global Wind Atlas (DTU Wind Energy).
   * @param {string} libText Contenido en texto del archivo .lib
   * @returns {Object}
   */
  function parseWAsPLib(libText) {
    if (typeof libText !== 'string' || libText.trim().length === 0) {
      throw new Error('Archivo .lib vacío o inválido');
    }
    var lines = libText.trim().split(/\r?\n/).map(function (l) { return l.trim(); }).filter(function (l) { return l.length > 0; });
    if (lines.length < 5) throw new Error('Formato .lib de WAsP incompleto');

    var header = lines[0];
    var coordMatch = header.match(/<coordinates>([0-9.-]+),([0-9.-]+)/);
    var lon = coordMatch ? parseFloat(coordMatch[1]) : 0;
    var lat = coordMatch ? parseFloat(coordMatch[2]) : 0;

    var parts2 = lines[1].split(/\s+/).map(Number);
    var numRough = parts2[0], numHeights = parts2[1], numSectors = parts2[2];
    var roughnesses = lines[2].split(/\s+/).map(Number);
    var heights = lines[3].split(/\s+/).map(Number);

    var curLine = 4;
    var roughnessBlocks = [];
    for (var r = 0; r < numRough; r++) {
      var freqs = lines[curLine++].split(/\s+/).map(Number);
      var heightData = [];
      for (var h = 0; h < numHeights; h++) {
        var A = lines[curLine++].split(/\s+/).map(Number);
        var k = lines[curLine++].split(/\s+/).map(Number);
        var vMean = 0;
        for (var s = 0; s < numSectors; s++) {
          var vSec = A[s] * gammaFunction(1 + 1 / k[s]);
          vMean += (freqs[s] / 100) * vSec;
        }
        heightData.push({ heightM: heights[h], A: A, k: k, vMean: Number(vMean.toFixed(2)) });
      }
      roughnessBlocks.push({ z0: roughnesses[r], freqs: freqs, heightData: heightData });
    }

    // Rugosidad 0.03m (campo abierto / terreno estándar) o la más próxima
    var fieldBlock = roughnessBlocks.find(function (b) { return Math.abs(b.z0 - 0.03) < 0.01; }) || roughnessBlocks[1] || roughnessBlocks[0];
    var h10 = fieldBlock.heightData.find(function (d) { return d.heightM === 10; }) || fieldBlock.heightData[0];
    var h50 = fieldBlock.heightData.find(function (d) { return d.heightM === 50; }) || fieldBlock.heightData[1];
    var alpha = (h50.vMean > h10.vMean && h10.vMean > 0)
      ? Math.log(h50.vMean / h10.vMean) / Math.log(50 / 10)
      : 0.143;

    var maxFreq = -1;
    var prevailingSectorIdx = 0;
    for (var sec = 0; sec < numSectors; sec++) {
      if (fieldBlock.freqs[sec] > maxFreq) {
        maxFreq = fieldBlock.freqs[sec];
        prevailingSectorIdx = sec;
      }
    }
    var prevailingDeg = Math.round((prevailingSectorIdx * (360 / numSectors)) % 360);

    return {
      source: 'Global Wind Atlas 3.0 (DTU / World Bank 250m WAsP)',
      latitude: lat,
      longitude: lon,
      vMeanRefMs: h10.vMean,
      refHeightM: 10,
      vMean50mMs: h50.vMean,
      shearExponentAlpha: Number(Math.max(0.08, Math.min(0.40, alpha)).toFixed(3)),
      weibullK: Number(h10.k[prevailingSectorIdx].toFixed(2)),
      prevailingWindDirDeg: prevailingDeg,
      ambientTempC: 15.0,
      sectorFrequencies: fieldBlock.freqs,
      sectorA10: h10.A,
      sectorK10: h10.k,
      roughnesses: roughnesses,
      heights: heights
    };
  }

  /**
   * Consulta el Global Wind Atlas 3.0 (DTU Wind Energy / Banco Mundial) a través de la Cloud Function / proxy /api/gwa
   * @param {number} latDeg Latitud WGS84
   * @param {number} lonDeg Longitud WGS84
   * @param {Function} [callback]
   * @returns {Promise<Object>}
   */
  async function fetchGWAWindResource(latDeg, lonDeg, callback) {
    var lat = Number(latDeg);
    var lon = Number(lonDeg);
    if (isNaN(lat) || isNaN(lon)) {
      var errCoords = new Error('Coordenadas geográficas inválidas para Global Wind Atlas');
      if (typeof callback === 'function') callback(errCoords, null);
      throw errCoords;
    }

    var cacheKey = 'ra_gwa_wind_' + lat.toFixed(2) + '_' + lon.toFixed(2);
    try {
      if (typeof localStorage !== 'undefined') {
        var cached = localStorage.getItem(cacheKey);
        if (cached) {
          var parsedCache = JSON.parse(cached);
          if (parsedCache && parsedCache.timestamp && (Date.now() - parsedCache.timestamp) < (30 * 86400 * 1000)) {
            if (typeof callback === 'function') callback(null, parsedCache.data);
            return parsedCache.data;
          }
        }
      }
    } catch (eCache) {}

    var url = '/api/gwa?lat=' + lat.toFixed(4) + '&lon=' + lon.toFixed(4);

    try {
      var resp = await fetch(url);
      if (!resp.ok) {
        if (resp.status === 404) {
          throw new Error('La Cloud Function /api/gwa requiere activar el plan Blaze de Firebase o ejecutar en servidor local.');
        }
        var errBody = await resp.json().catch(function () { return {}; });
        throw new Error(errBody.error || ('GWA Cloud Function HTTP ' + resp.status));
      }

      var result = await resp.json();

      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(cacheKey, JSON.stringify({
            data: result,
            timestamp: Date.now()
          }));
        }
      } catch (eSave) {}

      if (typeof callback === 'function') callback(null, result);
      return result;

    } catch (err) {
      if (typeof callback === 'function') callback(err, null);
      throw err;
    }
  }

  var Resource = {
    getConfig: getConfig,
    updateConfig: updateConfig,
    calculateAirDensity: calculateAirDensity,
    extrapolateWindSpeed: extrapolateWindSpeed,
    weibullPdf: weibullPdf,
    weibullCdf: weibullCdf,
    interpolatePowerCurve: interpolatePowerCurve,
    calculateJensenWakeDeficit: calculateJensenWakeDeficit,
    computeTurbineAEP: computeTurbineAEP,
    computeParkAEP: computeParkAEP,
    recommendOptimalMastAndSpacing: function (turbineInstance, allTurbines, resourceCfg) {
      if (!turbineInstance) return null;
      var cfg = resourceCfg || getConfig();
      var cat = turbineInstance._catalog || {};
      var availHeights = Array.isArray(cat.hubHeightsAvailableM) && cat.hubHeightsAvailableM.length > 0
        ? cat.hubHeightsAvailableM.slice().sort(function (a, b) { return a - b; })
        : [6, 9, 12, 18, 24];
      var curH = (turbineInstance.supportStructure && turbineInstance.supportStructure.hubHeightM) || 18;
      var rotorD = Number(cat.rotorDiameterM) || 5.0;
      var basePrice = Number(cat.priceEur) || 15000;

      // Evaluar cada altura candidata clonando temporalmente hubHeightM
      var evaluations = [];
      var origH = curH;
      var bestScore = -Infinity;
      var recommendedH = curH;

      for (var i = 0; i < availHeights.length; i++) {
        var h = Number(availHeights[i]);
        if (turbineInstance.supportStructure) turbineInstance.supportStructure.hubHeightM = h;
        var roofCtx = (RAWind.RooftopCFD && typeof RAWind.RooftopCFD.evaluateTurbineRooftopContext === 'function')
          ? RAWind.RooftopCFD.evaluateTurbineRooftopContext(turbineInstance)
          : { isRooftop: false, speedupFactor: 1.0, insideSeparationBubble: false, minRecommendedHubHeightM: 6 };
        var sim = computeTurbineAEP(turbineInstance, allTurbines, cfg, roofCtx);
        // Sobrecoste estimado de mástil/zapata por cada metro extra sobre 12m (~220 €/m)
        var mastExtraCostEur = Math.max(0, (h - 10) * 220);
        var estTotalCostEur = basePrice + mastExtraCostEur;
        var kwhPerEur = estTotalCostEur > 0 ? (sim.aepNetKwh / estTotalCostEur) : 0;

        // Penalizar fuertemente si queda atrapado dentro de la burbuja turbulenta de cubierta
        var score = kwhPerEur * (roofCtx.insideSeparationBubble ? 0.35 : 1.0) + (sim.capacityFactor * 0.8);
        if (score > bestScore) {
          bestScore = score;
          recommendedH = h;
        }

        evaluations.push({
          heightM: h,
          vHubMs: sim.hubWindSpeedMeanMs,
          aepNetKwh: sim.aepNetKwh,
          capacityFactorPct: Number((sim.capacityFactor * 100).toFixed(1)),
          insideBubble: !!roofCtx.insideSeparationBubble,
          extraCostEur: Math.round(mastExtraCostEur),
          kwhPerEur: Number(kwhPerEur.toFixed(2))
        });
      }

      // Restaurar altura actual y recalcular estado real
      if (turbineInstance.supportStructure) turbineInstance.supportStructure.hubHeightM = origH;
      var curSim = computeTurbineAEP(turbineInstance, allTurbines, cfg);
      var recEntry = evaluations.find(function (e) { return e.heightM === recommendedH; }) || evaluations[0];
      var gainKwh = recEntry ? Math.max(0, recEntry.aepNetKwh - curSim.aepNetKwh) : 0;
      var gainPct = (curSim.aepNetKwh > 0 && gainKwh > 0)
        ? Number(((gainKwh / curSim.aepNetKwh) * 100).toFixed(1))
        : 0;

      // Directriz IEC 61400-2 de espaciado anti-estelas según dirección predominante:
      // 5D a 7D en la dirección del viento dominante (downwind), 3D en dirección transversal (crosswind)
      var prevDir = Number(cfg.prevailingWindDirDeg) || 270;
      var crossDir = (prevDir + 90) % 360;

      return {
        currentHeightM: origH,
        recommendedHeightM: recommendedH,
        potentialGainKwh: gainKwh,
        potentialGainPct: gainPct,
        evaluations: evaluations,
        spacingRule: {
          rotorDiameterM: rotorD,
          downwindSpacingM: Number((5.0 * rotorD).toFixed(1)),
          crosswindSpacingM: Number((3.0 * rotorD).toFixed(1)),
          prevailingDirDeg: prevDir,
          crosswindDirDeg: crossDir
        }
      };
    },
    fetchERA5WindResource: fetchERA5WindResource,
    fetchNASAWindResource: fetchNASAWindResource,
    fetchGWAWindResource: fetchGWAWindResource,
    parseWAsPLib: parseWAsPLib,
    DEFAULT_SECTORS: DEFAULT_SECTORS
  };

  RAWind.Resource = Resource;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Resource;
  }

})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : global));
