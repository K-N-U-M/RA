/**
 * ============================================================================
 * MOTOR DE OPTIMIZACIÓN MULTIVARIABLE SOLAR Y EMPAQUETAMIENTO HÍBRIDO (RA)
 * js/solar-optimizer.js — v1.0 (2026)
 * ============================================================================
 * Capacidades:
 * 1. Empaquetamiento Mixto Híbrido (Vertical + Horizontal en el mismo faldón)
 *    con algoritmo Greedy Residual Fill y detección de colisión 2D (SAT/OBB).
 * 2. Optimizador Automático Multivariable de Producción Anual (kWh/año):
 *    Sondeo instantáneo de combinaciones (Inclinación × Azimut × Orientación)
 *    calculando paso inter-filas CTE DB-HE5, kWp, rendimiento unitario y kWh anuales.
 * 3. Modal de Benchmarking interactivo con podio visual y aplicación en 1 clic.
 */

(function(global) {
  'use strict';

  const RASolarOptimizer = {
    version: '1.0.0',

    // ── 1. UTILIDADES GEOMÉTRICAS 2D PARA COLISIONES Y CONTENCIÓN ───────────

    /**
     * Comprueba si dos rectángulos orientados 2D se intersecan con margen de separación (minGap).
     * Utiliza el Teorema de Ejes Separadores (SAT).
     */
    doRectanglesOverlap2D(cornersA, cornersB, minGap = 0.02) {
      if (!cornersA || cornersA.length < 4 || !cornersB || cornersB.length < 4) return false;

      // AABB Broadphase rápido para descartar el 90% de los casos
      let minU_A = Infinity, maxU_A = -Infinity, minV_A = Infinity, maxV_A = -Infinity;
      for (let i = 0; i < 4; i++) {
        const u = cornersA[i].u, v = cornersA[i].v;
        if (u < minU_A) minU_A = u;
        if (u > maxU_A) maxU_A = u;
        if (v < minV_A) minV_A = v;
        if (v > maxV_A) maxV_A = v;
      }

      let minU_B = Infinity, maxU_B = -Infinity, minV_B = Infinity, maxV_B = -Infinity;
      for (let i = 0; i < 4; i++) {
        const u = cornersB[i].u, v = cornersB[i].v;
        if (u < minU_B) minU_B = u;
        if (u > maxU_B) maxU_B = u;
        if (v < minV_B) minV_B = v;
        if (v > maxV_B) maxV_B = v;
      }

      if (maxU_A + minGap < minU_B || maxU_B + minGap < minU_A ||
          maxV_A + minGap < minV_B || maxV_B + minGap < minV_A) {
        return false;
      }

      // SAT Narrowphase: probar los ejes normales de ambos rectángulos
      const polygons = [cornersA, cornersB];
      for (let p = 0; p < 2; p++) {
        const poly = polygons[p];
        for (let i = 0; i < 4; i++) {
          const next = (i + 1) % 4;
          const edgeU = poly[next].u - poly[i].u;
          const edgeV = poly[next].v - poly[i].v;
          // Normal perpendicular (-edgeV, edgeU)
          const axisU = -edgeV;
          const axisV = edgeU;
          const len = Math.hypot(axisU, axisV);
          if (len < 1e-9) continue;
          const nx = axisU / len;
          const ny = axisV / len;

          // Proyección de cornersA sobre el eje
          let minA = Infinity, maxA = -Infinity;
          for (let j = 0; j < 4; j++) {
            const proj = cornersA[j].u * nx + cornersA[j].v * ny;
            if (proj < minA) minA = proj;
            if (proj > maxA) maxA = proj;
          }

          // Proyección de cornersB sobre el eje
          let minB = Infinity, maxB = -Infinity;
          for (let j = 0; j < 4; j++) {
            const proj = cornersB[j].u * nx + cornersB[j].v * ny;
            if (proj < minB) minB = proj;
            if (proj > maxB) maxB = proj;
          }

          // Si hay separación en esta proyección (incluyendo minGap), no hay colisión
          if (maxA + minGap < minB || maxB + minGap < minA) {
            return false;
          }
        }
      }

      return true; // Hay colisión o solapamiento
    },

    // ── 2. EMPAQUETAMIENTO RESIDUAL HÍBRIDO (VERTICAL + HORIZONTAL) ─────────

    /**
     * Genera un layout híbrido que combina la rejilla base principal con una pasada
     * voraz de relleno en orientación perpendicular en los huecos libres.
     */
    generateHybridLayout(roof, module, cfg, existingLayouts) {
      if (!roof || !roof.poly2D || roof.poly2D.length < 3 || !module) return null;
      if (!Array.isArray(existingLayouts) || existingLayouts.length === 0) return null;

      // 1. Tomar como base el mejor layout homogéneo (el que más paneles colocó)
      const sorted = [...existingLayouts].sort((a, b) => (b.moduleCount || 0) - (a.moduleCount || 0));
      const baseLayout = sorted[0];
      if (!baseLayout || !baseLayout.centers || baseLayout.centers.length === 0) return null;

      // ⚠️ REGLA FÍSICA INQUEBRANTABLE (CTE DB-HE5):
      // El empaquetamiento híbrido mixto (V+H) SOLO es físicamente admisible en cubiertas COPLANARES
      // (sin elevación relativa inter-filas, deltaTilt = 0).
      // En estructuras triangulares o balasto (deltaTilt >= 1), empaquetar paneles en orientación
      // perpendicular dentro del pasillo de sombra provoca un autosombreado severo e inaceptable.
      if (baseLayout.deltaTilt && baseLayout.deltaTilt >= 1.0 && !baseLayout.coplanar) {
        return null;
      }

      const baseOrient = baseLayout.orientation || 'portrait';
      const residualOrient = (baseOrient === 'portrait') ? 'landscape' : 'portrait';

      const poly = roof.poly2D;
      const setback = (typeof cfg.setback === 'number') ? cfg.setback : 0.35;
      const gap = (typeof cfg.gap === 'number') ? cfg.gap : 0.02;
      const safety = (typeof cfg.safetyMarginM === 'number') ? cfg.safetyMarginM : 0.20;

      const moduleLength = module.lengthM || 2.20;
      const moduleWidth = module.widthM || 1.13;

      // Dimensiones según orientación residual
      const resDims = residualOrient === 'landscape'
        ? { len: moduleWidth, wid: moduleLength }
        : { len: moduleLength, wid: moduleWidth };

      const resModLen = resDims.len;
      const resModWid = resDims.wid;
      const deltaTilt = baseLayout.deltaTilt || 0;
      const deltaTiltRad = (deltaTilt * Math.PI) / 180.0;

      const resHalfA = (resModLen / 2) * Math.cos(deltaTiltRad);
      const resHalfB = (resModWid / 2);
      const footprintA = 2 * resHalfA;

      // Paso inter-filas para la orientación residual
      let resRowPitch = baseLayout.coplanar
        ? (footprintA + gap)
        : (typeof global.calculatePVsystRowPitch === 'function'
            ? global.calculatePVsystRowPitch(resModLen, deltaTilt, roof.slopeDeg || 0, baseLayout.moduleAzimuthSur, roof.latDeg, safety)
            : (footprintA + 1.20));

      const resColPitch = resModWid + gap;

      const frame = baseLayout.frame || {};
      // Componentes 0 son válidas: no usar `||` como fallback (corrompía ejes alineados con u/v)
      const _hasA = (typeof frame.Lu === 'number' && typeof frame.Lv === 'number' && Math.hypot(frame.Lu, frame.Lv) > 1e-6);
      const _hasB = (typeof frame.Wu === 'number' && typeof frame.Wv === 'number' && Math.hypot(frame.Wu, frame.Wv) > 1e-6);
      const AuvN = _hasA ? { x: frame.Lu, y: frame.Lv } : { x: 1, y: 0 };
      const BuvN = _hasB ? { x: frame.Wu, y: frame.Wv } : { x: 0, y: 1 };

      // Bounding box en espacio (A, B)
      const aMin = Math.min(...poly.map(p => p.u * AuvN.x + p.v * AuvN.y));
      const aMax = Math.max(...poly.map(p => p.u * AuvN.x + p.v * AuvN.y));
      const bMin = Math.min(...poly.map(p => p.u * BuvN.x + p.v * BuvN.y));
      const bMax = Math.max(...poly.map(p => p.u * BuvN.x + p.v * BuvN.y));

      // Lista de paneles ya colocados (con sus 4 esquinas 2D)
      const placedPanels = [];
      for (const c of baseLayout.centers) {
        placedPanels.push({
          corners: c.corners,
          u: c.u,
          v: c.v,
          orient: baseOrient
        });
      }

      // Función de contención 2D estricta
      const fnContained = (typeof global.isPanelFullyContainedInPolygon2D === 'function')
        ? global.isPanelFullyContainedInPolygon2D
        : function() { return true; };


      // Muestreo con desfases de fase para explorar intersticios y seleccionar la mejor combinación
      const phaseShifts = [
        [0.0, 0.0],
        [0.5, 0.0],
        [0.0, 0.5],
        [0.5, 0.5]
      ];

      // Probar cada fase de inicio para evitar bloqueo voraz temprano y maximizar el empaquetamiento
      let bestResidualSet = [];

      for (const [initPoA, initPoB] of phaseShifts) {
        const currentPlaced = [...placedPanels];
        const currentResiduals = [];

        // Evaluar las fases empezando por la fase seleccionada
        const orderedPhases = [[initPoA, initPoB], ...phaseShifts.filter(([a, b]) => a !== initPoA || b !== initPoB)];

        for (const [poA, poB] of orderedPhases) {
          const startA = aMin + setback + resHalfA + poA * resRowPitch;
          const startB = bMin + setback + resHalfB + poB * resColPitch;

          for (let a = startA; a <= aMax - setback - resHalfA; a += resRowPitch) {
            for (let b = startB; b <= bMax - setback - resHalfB; b += resColPitch) {
              const cu = a * AuvN.x + b * BuvN.x;
              const cv = a * AuvN.y + b * BuvN.y;

              const candCorners = [];
              for (const [sx, sy] of [[-1, -1], [-1, 1], [1, 1], [1, -1]]) {
                candCorners.push({
                  u: cu + (sx * resHalfA) * AuvN.x + (sy * resHalfB) * BuvN.x,
                  v: cv + (sx * resHalfA) * AuvN.y + (sy * resHalfB) * BuvN.y
                });
              }

              // 1. Contención completa en faldón
              if (!fnContained(candCorners, poly, setback)) continue;

              // 2. Filtro de obstáculos si existe
              if (cfg.panelFilter) {
                const filt = cfg.panelFilter({ u: cu, v: cv }, candCorners, resDims, cfg.filterCtx || {});
                if (!filt.accept) continue;
              }

              // 3. Comprobar colisión contra TODOS los paneles ya colocados (base + residuales previos)
              let collides = false;
              for (let i = 0; i < currentPlaced.length; i++) {
                if (RASolarOptimizer.doRectanglesOverlap2D(candCorners, currentPlaced[i].corners, gap)) {
                  collides = true;
                  break;
                }
              }

              if (!collides) {
                const newPanel = {
                  a: a,
                  b: b,
                  u: cu,
                  v: cv,
                  corners: candCorners,
                  orient: residualOrient,
                  isHybridResidual: true
                };
                currentResiduals.push(newPanel);
                currentPlaced.push(newPanel);
              }
            }
          }
        }

        if (currentResiduals.length > bestResidualSet.length) {
          bestResidualSet = currentResiduals;
        }
      }

      // Si no cupo ningún panel residual adicional, el híbrido no aporta ventaja
      if (bestResidualSet.length === 0) return null;
      const residualCenters = bestResidualSet;

      const allCenters = [...baseLayout.centers.map(c => Object.assign({}, c, { orient: baseOrient })), ...residualCenters];

      return {
        orientation: 'hybrid',
        isHybrid: true,
        baseOrientation: baseOrient,
        residualOrientation: residualOrient,
        moduleCount: allCenters.length,
        baseModuleCount: baseLayout.centers.length,
        residualModuleCount: residualCenters.length,
        installedPowerWp: allCenters.length * (module.powerWp || 450),
        moduleLengthM: baseLayout.moduleLengthM,
        moduleWidthM: baseLayout.moduleWidthM,
        moduleTiltDeg: baseLayout.moduleTiltDeg,
        moduleAzimuthSur: baseLayout.moduleAzimuthSur,
        moduleAzimuthN: baseLayout.moduleAzimuthN,
        deltaTilt: baseLayout.deltaTilt,
        coplanar: baseLayout.coplanar,
        isEastWest: baseLayout.isEastWest,
        rowPitch: baseLayout.rowPitch,
        colPitch: baseLayout.colPitch,
        footprintA: baseLayout.footprintA,
        gapBetweenRowsM: baseLayout.gapBetweenRowsM,
        centers: allCenters,
        frame: baseLayout.frame,
        hybridBreakdown: {
          portrait: baseOrient === 'portrait' ? baseLayout.centers.length : residualCenters.length,
          landscape: baseOrient === 'landscape' ? baseLayout.centers.length : residualCenters.length
        }
      };
    },

    // ── 3. OPTIMIZADOR MULTIVARIABLE (BENCHMARK DE COMBINACIONES) ───────────

    /**
     * Evalúa una matriz completa de escenarios para un faldón y clasifica las mejores
     * combinaciones según producción neta anual (kWh/año), potencia (kWp) y rendimiento.
     */
    benchmarkFaldon(polyIdx) {
      if (typeof WP === 'undefined' || !WP.polylines || !WP.polylines[polyIdx]) {
        if (typeof showToast === 'function') showToast('AVISO', 'Selecciona primero un faldón cerrado.', 'warning', 3000);
        return null;
      }

      const poly = WP.polylines[polyIdx];
      const fnInfo = (typeof computeSinglePolylineRoofInfo === 'function')
        ? computeSinglePolylineRoofInfo
        : (typeof window !== 'undefined' && typeof window.computeSinglePolylineRoofInfo === 'function' ? window.computeSinglePolylineRoofInfo : null);

      if (!fnInfo) {
        console.warn('[SolarOptimizer] computeSinglePolylineRoofInfo no disponible.');
        return null;
      }

      const lat = (typeof solarProjectConfig !== 'undefined' && solarProjectConfig.latitude) ? solarProjectConfig.latitude : 40.41;
      const lon = (typeof solarProjectConfig !== 'undefined' && solarProjectConfig.longitude) ? solarProjectConfig.longitude : -3.70;

      // Inclinación óptima latitudinal teórica
      const optimalTilt = Math.min(35, Math.max(15, Math.round(3.7 + 0.69 * Math.abs(lat))));

      // Curva de rendimiento específico por inclinación
      const yieldCurve = (typeof computeTiltYieldCurve === 'function')
        ? computeTiltYieldCurve(lat, lon, 180)
        : null;

      // Escenarios de prueba exhaustivos
      const scenariosToTest = [
        { id: 'coplanar', title: 'Coplanar Integrado', tilt: 'coplanar', numTilt: 0, azimuth: 'auto', structureType: 'coplanar' },
        { id: 'triangles_10', title: 'Triángulos 10° Sur (Máx Densidad)', tilt: 10, numTilt: 10, azimuth: 180, structureType: 'triangles_custom' },
        { id: 'triangles_15', title: 'Triángulos 15° Sur (Equilibrado)', tilt: 15, numTilt: 15, azimuth: 180, structureType: 'triangles_custom' },
        { id: 'triangles_20', title: 'Triángulos 20° Sur', tilt: 20, numTilt: 20, azimuth: 180, structureType: 'triangles_custom' },
        { id: 'triangles_25', title: 'Triángulos 25° Sur', tilt: 25, numTilt: 25, azimuth: 180, structureType: 'triangles_custom' },
        { id: 'triangles_30', title: 'Triángulos 30° Sur (Estándar)', tilt: 30, numTilt: 30, azimuth: 180, structureType: 'triangles_30' },
        { id: 'triangles_opt', title: 'Inclinación Óptima (' + optimalTilt + '° Sur)', tilt: optimalTilt, numTilt: optimalTilt, azimuth: 180, structureType: 'triangles_custom' },
        { id: 'east_west_12', title: 'Este-Oeste V-Dome (12° E/W)', tilt: 12, numTilt: 12, azimuth: 'east_west', structureType: 'triangles_15_ew' }
      ];

      const orientationsToTest = ['portrait', 'landscape', 'hybrid'];
      const results = [];

      let modWp = 450;
      const effModId = poly.moduleId || (window.solarProjectConfig && window.solarProjectConfig.selectedModuleId) || '';
      if (typeof equipmentCatalog !== 'undefined' && equipmentCatalog && Array.isArray(equipmentCatalog.modules)) {
        const foundM = equipmentCatalog.modules.find(m => m.id === effModId);
        if (foundM && foundM.wp) modWp = foundM.wp;
      }

      // Radiación base anual adaptada a la localización geográfica (kWh/kWp)
      let baseSolarResource = 1520;
      const optLat = (typeof window !== 'undefined' && window.solarProjectConfig && window.solarProjectConfig.lat) || (poly && poly.roofInfo && poly.roofInfo.lat) || 40.4;
      const optLng = (typeof window !== 'undefined' && window.solarProjectConfig && window.solarProjectConfig.lng) || (poly && poly.roofInfo && poly.roofInfo.lng) || -3.7;
      if (typeof getRobustMonthlyGHI === 'function') {
        const mDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        let sumGhiKwh = 0;
        for (let m = 0; m < 12; m++) {
          sumGhiKwh += (getRobustMonthlyGHI(optLat, optLng, m) * mDays[m]) / 1000;
        }
        if (sumGhiKwh > 800) baseSolarResource = Math.round(sumGhiKwh * 0.80);
      }

      for (const sc of scenariosToTest) {
        // En cubiertas con inclinación sobre estructura (triángulos/balasto/E-W), SOLO
        // se permiten orientaciones puras (portrait o landscape) para respetar estrictamente
        // el paso inter-filas anti-sombra normativo (CTE DB-HE5).
        const allowedOrientations = (sc.id === 'coplanar')
          ? ['portrait', 'landscape', 'hybrid']
          : ['portrait', 'landscape'];

        for (const orient of allowedOrientations) {
          try {
            const testPolyOpts = Object.assign({}, poly, {
              modTilt: sc.tilt,
              modAzimuth: sc.azimuth,
              orientationPref: orient,
              structureType: sc.structureType
            });

            const info = fnInfo(poly.points, testPolyOpts);
            const count = (info && info.panels) ? info.panels.length : 0;
            if (count === 0) continue;

            const kwp = parseFloat(((count * modWp) / 1000.0).toFixed(2));
            const rowPitch = (info && typeof info.rowPitch === 'number') ? info.rowPitch : 0;

            // Factor de rendimiento físico según inclinación y acimut real
            let yieldFactor = 1.0;
            if (sc.id === 'coplanar') {
              const roofSlope = (info && typeof info.tiltDeg === 'number') ? info.tiltDeg : (poly.slopeDeg || 0);
              const roofAzSur = (info && typeof info.azimuthSur === 'number') ? info.azimuthSur : (poly.azimuthSur || 0); // 0 = Sur, ±90 = E/W, 180 = Norte
              const deltaB = roofSlope - optimalTilt;
              const tiltLoss = (0.016 * Math.pow(deltaB, 2)) / 100.0;
              // Factor azimutal: Sur (0°) = 1.0, Este/Oeste (±90°) ~ 0.88, Norte (180°) ~ 0.62
              const deltaAzRad = (roofAzSur * Math.PI) / 180.0;
              const azFactor = Math.max(0.55, 1.0 - (0.38 * Math.pow(Math.sin(deltaAzRad / 2.0), 2)));
              yieldFactor = Math.max(0.50, (1.0 - tiltLoss) * azFactor);
            } else if (sc.id === 'east_west_12') {
              yieldFactor = 0.915; // Pérdida geométrica simétrica ~8.5%
            } else {
              const deltaB = sc.numTilt - optimalTilt;
              yieldFactor = Math.max(0.80, 1.0 - (0.016 * Math.pow(deltaB, 2)) / 100.0);
            }

            // Descontar pérdidas reales por sombreado si existen obstáculos
            const shadedCount = (info && info.panels) ? info.panels.filter(p => p.isShaded).length : 0;
            const effectiveModules = Math.max(0, count - shadedCount * 0.70);
            const effectiveKwp = parseFloat(((effectiveModules * modWp) / 1000.0).toFixed(2));
            const specificKwhPerKwp = Math.round(baseSolarResource * yieldFactor);
            const totalKwhYear = Math.round(effectiveKwp * specificKwhPerKwp);

            const orientLabel = orient === 'portrait' ? 'Vertical' : (orient === 'landscape' ? 'Horizontal' : 'Híbrido (V+H)');

            results.push({
              scenarioId: sc.id,
              title: sc.title,
              tilt: sc.tilt,
              numTilt: sc.numTilt,
              azimuth: sc.azimuth,
              structureType: sc.structureType,
              orientation: orient,
              orientLabel: orientLabel,
              modules: count,
              kwp: kwp,
              rowPitchM: parseFloat(rowPitch.toFixed(2)),
              specificYield: specificKwhPerKwp,
              yieldFactorPct: parseFloat((yieldFactor * 100).toFixed(1)),
              kwhYear: totalKwhYear,
              isHybrid: (orient === 'hybrid' && info.isHybrid)
            });
          } catch(eBench) {
            // Continuar con los demás escenarios
          }
        }
      }

      if (results.length === 0) return null;

      // 1. Ordenar por Producción Neta Anual (kWh/año) descendente
      results.sort((a, b) => b.kwhYear - a.kwhYear);

      // 🥇 1º Puesto: Máxima Producción Anual Absoluta (kWh/año)
      const bestEnergy = results[0];

      // Función auxiliar para comparar si dos escenarios representan la misma solución
      const isSameConfig = (s1, s2) => {
        if (!s1 || !s2) return false;
        return s1.scenarioId === s2.scenarioId &&
               s1.orientation === s2.orientation &&
               s1.modules === s2.modules;
      };

      // 🥈 2º Puesto: Máxima Potencia (kWp) / Mayor Densidad ALTERNATIVA
      // Buscamos el escenario de mayor kWp que sea DISTINTO de bestEnergy
      const byPower = [...results].sort((a, b) => b.kwp - a.kwp || b.kwhYear - a.kwhYear);
      let bestPower = byPower.find(s => !isSameConfig(s, bestEnergy));

      if (!bestPower && results.length > 1) {
        bestPower = results[1];
      } else if (!bestPower) {
        bestPower = bestEnergy;
      }

      // 🥉 3º Puesto: Máxima Eficiencia Unitaria (kWh/kWp) ALTERNATIVA
      // Buscamos el escenario de mayor rendimiento unitario que sea DISTINTO de bestEnergy y de bestPower
      const byEfficiency = [...results].sort((a, b) => b.specificYield - a.specificYield || b.kwhYear - a.kwhYear);
      let bestEfficiency = byEfficiency.find(s => !isSameConfig(s, bestEnergy) && !isSameConfig(s, bestPower));

      if (!bestEfficiency && results.length > 2) {
        bestEfficiency = results.find(s => !isSameConfig(s, bestEnergy) && !isSameConfig(s, bestPower)) || results[2];
      } else if (!bestEfficiency) {
        bestEfficiency = (bestPower !== bestEnergy) ? bestPower : bestEnergy;
      }

      return {
        polyIdx: polyIdx,
        polyName: poly.name || ('Faldón #' + (polyIdx + 1)),
        faldonAreaM2: poly.area ? poly.area.toFixed(1) : '--',
        optimalTilt: optimalTilt,
        bestEnergy: bestEnergy,
        bestPower: bestPower,
        bestEfficiency: bestEfficiency,
        allScenarios: results
      };
    },

    // ── 4. MODAL UI DE BENCHMARKING Y OPTIMIZACIÓN EN 1 CLIC ────────────────

    openOptimizerModal(polyIdx) {
      const pIdx = (typeof polyIdx === 'number' && polyIdx >= 0)
        ? polyIdx
        : (typeof WP !== 'undefined' && WP.selectedPolyIdx >= 0 ? WP.selectedPolyIdx : 0);

      const benchmark = RASolarOptimizer.benchmarkFaldon(pIdx);
      if (!benchmark) return;

      let modal = document.getElementById('ra-solar-optimizer-modal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'ra-solar-optimizer-modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.style.cssText = 'display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(10,16,29,0.85);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);z-index:999999;align-items:center;justify-content:center;padding:16px;';
        document.body.appendChild(modal);
      }

      const bE = benchmark.bestEnergy;
      const bP = benchmark.bestPower;
      const bEf = benchmark.bestEfficiency;

      const bEIndex = benchmark.allScenarios.indexOf(bE);
      const bPIndex = benchmark.allScenarios.indexOf(bP);
      const bEfIndex = benchmark.allScenarios.indexOf(bEf);

      modal.innerHTML = `
        <div style="background:linear-gradient(135deg, rgba(15,23,42,0.98), rgba(30,41,59,0.98));border:1px solid rgba(56,189,248,0.3);box-shadow:0 20px 50px rgba(0,0,0,0.8), 0 0 30px rgba(56,189,248,0.15);border-radius:12px;width:100%;max-width:880px;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;font-family:system-ui,-apple-system,sans-serif;color:#E2E8F0;">
          
          <!-- Cabecera Modal -->
          <div style="padding:14px 18px;border-bottom:1px solid rgba(255,255,255,0.1);display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,0.02);">
            <div style="display:flex;align-items:center;gap:10px;">
              <div style="width:36px;height:36px;border-radius:8px;background:linear-gradient(135deg, #0284c7, #0369a1);display:flex;align-items:center;justify-content:center;color:#fff;font-size:18px;">
                ⚡
              </div>
              <div>
                <div style="font-size:14px;font-weight:bold;color:#F8FAFC;letter-spacing:0.3px;">AUTO-OPTIMIZADOR MULTIVARIABLE SOLAR</div>
                <div style="font-size:10px;color:#94A3B8;">Análisis comparativo de combinaciones para <b style="color:#38BDF8;">${benchmark.polyName}</b> (${benchmark.faldonAreaM2} m²)</div>
              </div>
            </div>
            <button onclick="document.getElementById('ra-solar-optimizer-modal').style.display='none'" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);color:#94A3B8;width:30px;height:30px;border-radius:6px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;">✕</button>
          </div>

          <!-- Contenido Scrolleable -->
          <div style="padding:16px 18px;overflow-y:auto;display:flex;flex-direction:column;gap:14px;">
            
            <!-- TARJETAS DEL PODIO (1º, 2º, 3º) -->
            <div style="display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:10px;">
              
              <!-- 🥇 1º MÁXIMA PRODUCCIÓN TOTAL (GANADOR RECOMENDADO) -->
              <div style="background:linear-gradient(135deg, rgba(16,185,129,0.15), rgba(6,78,59,0.25));border:1.5px solid #10B981;border-radius:10px;padding:12px;display:flex;flex-direction:column;justify-content:space-between;position:relative;box-shadow:0 0 20px rgba(16,185,129,0.2);">
                <div style="position:absolute;top:-8px;right:10px;background:#10B981;color:#0F172A;font-size: 10px;font-weight:900;padding:2px 8px;border-radius:10px;letter-spacing:0.5px;">🥇 MÁXIMA ENERGÍA ANUAL</div>
                <div>
                  <div style="font-size:11px;font-weight:bold;color:#A7F3D0;margin-top:4px;">${bE.title}</div>
                  <div style="font-size: 10px;color:#6EE7B7;margin-bottom:8px;">Disposición: <b>${bE.orientLabel}</b> · Paso: <b>${bE.rowPitchM}m</b></div>
                  <div style="display:flex;align-items:baseline;gap:6px;margin-bottom:4px;">
                    <span style="font-size:24px;font-weight:900;color:#FFFFFF;font-family:'JetBrains Mono',monospace;">${bE.kwhYear.toLocaleString()}</span>
                    <span style="font-size:10px;color:#A7F3D0;font-weight:bold;">kWh/año</span>
                  </div>
                  <div style="font-size:10px;color:#E2E8F0;">
                    <b>${bE.modules} placas</b> · <b style="color:#FBBF24;">${bE.kwp} kWp</b> · ${bE.specificYield} kWh/kWp
                  </div>
                </div>
                <button type="button" onclick="RASolarOptimizer.applyByIndex(${pIdx}, ${bEIndex >= 0 ? bEIndex : 0})" style="margin-top:10px;background:#10B981;color:#0F172A;border:none;border-radius:6px;padding:7px;font-size:10px;font-weight:900;cursor:pointer;width:100%;transition:all 0.2s;">
                  ✓ APLICAR GANADORA
                </button>
              </div>

              <!-- 🥈 2º MÁXIMA POTENCIA (kWp) -->
              <div style="background:rgba(56,189,248,0.08);border:1px solid rgba(56,189,248,0.3);border-radius:10px;padding:12px;display:flex;flex-direction:column;justify-content:space-between;position:relative;">
                <div style="position:absolute;top:-8px;right:10px;background:#0284C7;color:#fff;font-size: 10px;font-weight:bold;padding:1px 6px;border-radius:10px;">🥈 MÁX POTENCIA (kWp)</div>
                <div>
                  <div style="font-size:10.5px;font-weight:bold;color:#BAE6FD;margin-top:4px;">${bP.title}</div>
                  <div style="font-size: 10px;color:#7DD3FC;margin-bottom:6px;">Disposición: <b>${bP.orientLabel}</b></div>
                  <div style="display:flex;align-items:baseline;gap:4px;margin-bottom:2px;">
                    <span style="font-size:20px;font-weight:bold;color:#FFFFFF;font-family:'JetBrains Mono',monospace;">${bP.kwp}</span>
                    <span style="font-size:10px;color:#38BDF8;font-weight:bold;">kWp</span>
                  </div>
                  <div style="font-size: 10px;color:#94A3B8;">
                    <b>${bP.modules} placas</b> · ${bP.kwhYear.toLocaleString()} kWh/año
                  </div>
                </div>
                <button type="button" onclick="RASolarOptimizer.applyByIndex(${pIdx}, ${bPIndex >= 0 ? bPIndex : 0})" style="margin-top:8px;background:rgba(56,189,248,0.2);color:#38BDF8;border:1px solid rgba(56,189,248,0.4);border-radius:6px;padding:6px;font-size: 10px;font-weight:bold;cursor:pointer;width:100%;">
                  Aplicar esta
                </button>
              </div>

              <!-- 🥉 3º MÁXIMA EFICIENCIA UNITARIA (kWh/kWp) -->
              <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.3);border-radius:10px;padding:12px;display:flex;flex-direction:column;justify-content:space-between;position:relative;">
                <div style="position:absolute;top:-8px;right:10px;background:#D97706;color:#fff;font-size: 10px;font-weight:bold;padding:1px 6px;border-radius:10px;">🥉 MÁX RENDIMIENTO</div>
                <div>
                  <div style="font-size:10.5px;font-weight:bold;color:#FDE68A;margin-top:4px;">${bEf.title}</div>
                  <div style="font-size: 10px;color:#FCD34D;margin-bottom:6px;">Disposición: <b>${bEf.orientLabel}</b></div>
                  <div style="display:flex;align-items:baseline;gap:4px;margin-bottom:2px;">
                    <span style="font-size:20px;font-weight:bold;color:#FFFFFF;font-family:'JetBrains Mono',monospace;">${bEf.specificYield}</span>
                    <span style="font-size:10px;color:#F59E0B;font-weight:bold;">kWh/kWp</span>
                  </div>
                  <div style="font-size: 10px;color:#94A3B8;">
                    <b>${bEf.modules} placas</b> (${bEf.kwp} kWp) · ${bEf.kwhYear.toLocaleString()} kWh/a
                  </div>
                </div>
                <button type="button" onclick="RASolarOptimizer.applyByIndex(${pIdx}, ${bEfIndex >= 0 ? bEfIndex : 0})" style="margin-top:8px;background:rgba(245,158,11,0.2);color:#F59E0B;border:1px solid rgba(245,158,11,0.4);border-radius:6px;padding:6px;font-size: 10px;font-weight:bold;cursor:pointer;width:100%;">
                  Aplicar esta
                </button>
              </div>

            </div>

            <!-- MATRIZ DETALLADA DE ESCENARIOS EVALUADOS -->
            <div style="background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.08);border-radius:8px;overflow:hidden;">
              <div style="padding:8px 12px;background:rgba(255,255,255,0.03);border-bottom:1px solid rgba(255,255,255,0.08);font-size:10.5px;font-weight:bold;color:#94A3B8;display:flex;justify-content:space-between;">
                <span>MATRIZ COMPARATIVA DE COMBINACIONES EVALUADAS (${benchmark.allScenarios.length} CASOS)</span>
                <span style="color:#64748B;font-weight:normal;">Ordenado por Producción Neta Total</span>
              </div>
              <div style="max-height:260px;overflow-y:auto;">
                <table style="width:100%;border-collapse:collapse;font-size: 10px;text-align:left;">
                  <thead>
                    <tr style="color:#64748B;border-bottom:1px solid rgba(255,255,255,0.06);background:rgba(0,0,0,0.2);">
                      <th style="padding:6px 10px;">#</th>
                      <th style="padding:6px 10px;">Configuración</th>
                      <th style="padding:6px 10px;">Orientación</th>
                      <th style="padding:6px 10px;text-align:right;">Paso Fila</th>
                      <th style="padding:6px 10px;text-align:right;">Módulos</th>
                      <th style="padding:6px 10px;text-align:right;">kWp</th>
                      <th style="padding:6px 10px;text-align:right;">kWh/kWp</th>
                      <th style="padding:6px 10px;text-align:right;">kWh/año Total</th>
                      <th style="padding:6px 10px;text-align:center;">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${benchmark.allScenarios.map((s, idx) => `
                      <tr style="border-bottom:1px solid rgba(255,255,255,0.04);background:${idx === 0 ? 'rgba(16,185,129,0.08)' : (idx % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent')};">
                        <td style="padding:6px 10px;color:${idx === 0 ? '#10B981' : '#64748B'};font-weight:bold;">${idx === 0 ? '🥇 1' : (idx === 1 ? '🥈 2' : (idx === 2 ? '🥉 3' : (idx + 1)))}</td>
                        <td style="padding:6px 10px;font-weight:${idx === 0 ? 'bold' : 'normal'};color:${idx === 0 ? '#A7F3D0' : '#E2E8F0'};">${s.title}</td>
                        <td style="padding:6px 10px;">
                          <span style="padding:2px 5px;border-radius:4px;font-size: 10px;background:${s.isHybrid ? 'rgba(168,85,247,0.2)' : 'rgba(255,255,255,0.06)'};color:${s.isHybrid ? '#C084FC' : '#CBD5E1'};font-weight:${s.isHybrid ? 'bold' : 'normal'};">
                            ${s.orientLabel}
                          </span>
                        </td>
                        <td style="padding:6px 10px;text-align:right;color:#94A3B8;">${s.rowPitchM > 0 ? s.rowPitchM + ' m' : 'Coplanar'}</td>
                        <td style="padding:6px 10px;text-align:right;font-weight:bold;">${s.modules}</td>
                        <td style="padding:6px 10px;text-align:right;color:#FBBF24;">${s.kwp}</td>
                        <td style="padding:6px 10px;text-align:right;color:#38BDF8;">${s.specificYield}</td>
                        <td style="padding:6px 10px;text-align:right;font-weight:bold;color:${idx === 0 ? '#10B981' : '#F8FAFC'};font-family:'JetBrains Mono',monospace;">${s.kwhYear.toLocaleString()}</td>
                        <td style="padding:6px 10px;text-align:center;">
                          <button type="button" onclick="RASolarOptimizer.applyByIndex(${pIdx}, ${idx})" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:#E2E8F0;border-radius:4px;padding:2px 6px;font-size: 10px;cursor:pointer;">
                            Aplicar
                          </button>
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>

          </div>

          <!-- Pie de Modal -->
          <div style="padding:10px 18px;border-top:1px solid rgba(255,255,255,0.08);background:rgba(0,0,0,0.2);display:flex;justify-content:space-between;align-items:center;">
            <div style="font-size: 10px;color:#64748B;">
              Cálculo del paso inter-filas según normativa CTE DB-HE5 (Solsticio 21 Dic, 10:00-14:00 h).
            </div>
            <button type="button" onclick="document.getElementById('ra-solar-optimizer-modal').style.display='none'" style="background:rgba(255,255,255,0.08);color:#E2E8F0;border:1px solid rgba(255,255,255,0.15);border-radius:6px;padding:6px 14px;font-size:10px;cursor:pointer;">
              Cerrar
            </button>
          </div>

        </div>
      `;

      // Guardar benchmark en caché para accesos por índice
      RASolarOptimizer._lastBenchmark = benchmark;

      modal.style.display = 'flex';
    },

    // ── 5. APLICAR ESCENARIO SELECCIONADO ───────────────────────────────────

    applyByIndex(polyIdx, scenarioIndex) {
      if (!RASolarOptimizer._lastBenchmark || !RASolarOptimizer._lastBenchmark.allScenarios) return;
      const scenario = RASolarOptimizer._lastBenchmark.allScenarios[scenarioIndex];
      if (scenario) {
        RASolarOptimizer.applyScenario(polyIdx, scenario);
      }
    },

    applyScenario(polyIdx, scenario) {
      if (typeof WP === 'undefined' || !WP.polylines || !WP.polylines[polyIdx]) return;
      const poly = WP.polylines[polyIdx];

      poly.modTilt = scenario.tilt;
      poly.modAzimuth = scenario.azimuth;
      poly.orientationPref = scenario.orientation;

      // 1. Sincronizar estructura para motor 3D Cesium y cálculo geométrico de cubierta
      const tipoEst = (scenario.structureType === 'pergola') ? 'pergola' : ((scenario.structureType === 'coplanar') ? 'coplanar' : 'balasto');
      poly.estructura = poly.estructura || {};
      poly.estructura.tipo = tipoEst;
      poly.estructura.clearance = (tipoEst === 'coplanar') ? 0 : 0.20;

      // 2. Sincronizar structureConfig para BOMTreeEngine y catálogo
      poly.structureConfig = poly.structureConfig || {};
      poly.structureConfig.type = scenario.structureType || 'coplanar';
      poly.structureConfig.tiltDeg = scenario.numTilt || 0;
      poly.structureConfig.pitchMeters = scenario.rowPitchM || 0;
      poly.structureType = scenario.structureType || 'coplanar';

      // Cerrar modal
      const modal = document.getElementById('ra-solar-optimizer-modal');
      if (modal) modal.style.display = 'none';

      // Sincronizar selectores del sidebar
      const selEst = document.getElementById('cfg-p2-estructura');
      if (selEst) {
        if (scenario.structureType === 'pergola') selEst.value = 'pergola';
        else if (scenario.structureType === 'coplanar') selEst.value = 'coplanar';
        else selEst.value = 'balasto';
      }

      const tiltSlider = document.getElementById('cfg-p2-tilt-slider');
      const tiltVal = document.getElementById('cfg-p2-tilt-val');
      if (tiltSlider && typeof scenario.numTilt === 'number') {
        tiltSlider.value = scenario.numTilt;
        if (tiltVal) tiltVal.textContent = scenario.numTilt + '°';
      }

      // Invalidar caché y regenerar layout
      if (typeof roofPanelsCache !== 'undefined' && roofPanelsCache) roofPanelsCache.sig = '';
      if (typeof computeSinglePolylineRoofInfo === 'function') {
        poly.roofInfo = computeSinglePolylineRoofInfo(poly.points, poly);
      }

      if (typeof wpFastRenderSimulatedPanels === 'function') wpFastRenderSimulatedPanels();
      if (typeof wpUpdateUI === 'function') wpUpdateUI();
      if (typeof BOMTreeEngine !== 'undefined' && typeof BOMTreeEngine.refresh === 'function') BOMTreeEngine.refresh();
      if (typeof recalculateSolarYield === 'function') recalculateSolarYield();

      if (typeof showToast === 'function') {
        showToast(
          'CONFIGURACIÓN APLICADA',
          `Se ha aplicado "${scenario.title}" (${scenario.orientLabel}): ${scenario.modules} módulos, ${scenario.kwp} kWp y ${scenario.kwhYear.toLocaleString()} kWh/año estimados.`,
          'success',
          4000
        );
      }
    }
  };

  // Exportar a global y RA
  global.RASolarOptimizer = RASolarOptimizer;
  global.RA = global.RA || {};
  global.RA.SolarOptimizer = RASolarOptimizer;

})(typeof window !== 'undefined' ? window : globalThis);
