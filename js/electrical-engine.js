/**
 * ============================================================================
 * ⚡ ELECTRICAL ENGINE & REBT CABLING MODULE — PROYECTO RA (CALIDAD AAA)
 * ============================================================================
 * Arquitectura Modular Desacoplada:
 * - Dimensionamiento de Strings por ventana térmica MPPT (-10°C a +65°C, IEC 62548).
 * - Enrutamiento continuo en serpiente (Snake routing leapfrog anti-bucle inductivo UNE-EN 62305).
 * - Trazado físico 3D de cableado DC y AC con curvas catenarias.
 * - Dimensionamiento de sección comercial de conductores (ZZ-F 1500V DC y RV-K 0.6/1kV AC)
 *   y verificación estricta de caída de tensión (ΔV ≤ 1.5% según REBT ITC-BT-40).
 * ============================================================================
 */

(function(root) {
  'use strict';

  // Constantes de ingeniería eléctrica normalizadas (REBT ITC-BT-40 / UNE-HD 60364-5-52)
  const ELEC_CONSTANTS = {
    RHO_CU_20: 0.017241,
    RHO_CU_90: 0.023,         // [P1] Resistividad del cobre a 90°C — valor único del proyecto (antes 0.02244; AGENTS.md §8)
    RHO_AL_90: 0.03620,
    T_MIN_SPAIN: -10,         // Temperatura mínima de diseño peninsular en frío CTE/UNE
    T_AMB_MAX_SPAIN: 40,      // Temperatura ambiente máxima en verano peninsular
    DV_MAX_DC_PCT: 1.5,       // Caída de tensión máxima admisible DC
    DV_MAX_AC_PCT: 1.5,       // Caída de tensión máxima admisible AC
    SEC_DC_AVAIL: [4, 6, 10, 16, 25],
    IMAX_DC_ZZF:  [44, 58, 80, 107, 138],
    SEC_AC_AVAIL: [2.5, 4, 6, 10, 16, 25, 35, 50],
    IMAX_AC_RVK:  [29, 38, 49, 68, 91, 119, 146, 178]
  };

  /**
   * Paleta de colores profesionales para identificar visualmente cada String en 3D
   */
  function getPolylineStringColor(index) {
    if (typeof RA_STRING_PALETTE !== 'undefined' && Array.isArray(RA_STRING_PALETTE) && RA_STRING_PALETTE.length > 0) {
      const item = RA_STRING_PALETTE[index % RA_STRING_PALETTE.length];
      if (item && item.hex) return item.hex;
    }
    const palette = [
      '#00F0FF', '#F59E0B', '#10B981', '#EC4899', '#8B5CF6',
      '#3B82F6', '#EF4444', '#14B8A6', '#F97316', '#6366F1'
    ];
    return palette[index % palette.length];
  }

  /**
   * Calcula los límites normativos admisibles de módulos por String
   * según tensiones en frío (-10°C) y arranque MPPT en caliente (+70°C).
   */
  function calculateDynamicMPPTStringLimits(modParams = {}, invParams = {}, climParams = {}) {
    const pCfg = (typeof root.panelConfig !== 'undefined' && root.panelConfig) ? root.panelConfig : {};
    const modW = pCfg.potencia || 450;
    const Voc_STC = modParams.Voc || pCfg.voc || (modW >= 500 ? 50.0 : 49.5);
    const Vmp_STC = modParams.Vmp || pCfg.vmp || (modW >= 500 ? 42.0 : 41.5);
    const betaVoc = modParams.betaVoc || pCfg.betaVoc || -0.0027;
    const gammaPmp = modParams.gammaPmp || pCfg.gammaPmp || (pCfg.tecnologia && pCfg.tecnologia.includes('N-Type') ? -0.0029 : -0.0035);

    // Inversor real del catálogo (calculatedLimits se puebla en el Paso 3/4);
    // si no hay selección, cae a los defaults normativos 1000/200/850 V.
    const liveInv = (root.solarProjectConfig && root.solarProjectConfig.calculatedLimits &&
                     root.solarProjectConfig.calculatedLimits.inverter) || null;
    const Vmax_inv   = invParams.Vmax     || (liveInv ? (liveInv.vDcMax || 1000) : 1000.0);
    const Vmppt_min  = invParams.VmpptMin || (liveInv ? (liveInv.vMpptNomMin || liveInv.vMpptMin || 200) : 200.0);
    const Vmppt_max  = invParams.VmpptMax || (liveInv ? (liveInv.vMpptNomMax || liveInv.vMpptMax || 850) : 850.0);

    const Tmin = climParams.Tmin !== undefined ? climParams.Tmin : ELEC_CONSTANTS.T_MIN_SPAIN;
    const Tmax_cell = climParams.TmaxCell !== undefined ? climParams.TmaxCell : 70.0;

    const Voc_Tmin = Voc_STC * (1 + betaVoc * (Tmin - 25.0));
    const Vmp_Tmax = Vmp_STC * (1 + gammaPmp * (Tmax_cell - 25.0));
    const Vmp_Tmin = Vmp_STC * (1 + betaVoc * (Tmin - 25.0));

    const Ns_max_voc = Math.floor(Vmax_inv / Voc_Tmin);
    const Ns_max_mppt = Math.floor(Vmppt_max / Vmp_Tmin);
    const Ns_max = Math.max(1, Math.min(Ns_max_voc, Ns_max_mppt));
    const Ns_min = Math.max(1, Math.ceil(Vmppt_min / Vmp_Tmax));

    return {
      Ns_max,
      Ns_min,
      Voc_Tmin,
      Vmp_Tmax,
      Vmp_Tmin
    };
  }

  /**
   * Ordena un conjunto de paneles en una secuencia física continua Snake (boustrophedon)
   * de instalador profesional: recorre fila a fila o columna a columna de forma contigua
   * minimizando saltos y longitud de conductores MC4 (UNE-EN 62305 / IEC 62548).
   */
  function getSnakeOrderedPanels(panels) {
    if (!panels || panels.length <= 1) return panels || [];

    const getU = (p) => (typeof p.gridB === 'number') ? p.gridB : ((p.center2D && typeof p.center2D.u === 'number') ? p.center2D.u : (p.u || 0));
    const getV = (p) => (typeof p.gridA === 'number') ? p.gridA : ((p.center2D && typeof p.center2D.v === 'number') ? p.center2D.v : (p.v || 0));
    
    // 1. Clustering Espacial: Agrupar paneles cercanos (islas) para evitar saltos caóticos
    const pW = panels[0].w || 1.05;
    const pH = panels[0].h || 2.10;
    const threshold = Math.max(pW, pH) * 1.8; 

    const clusters = [];
    const visited = new Set();

    panels.forEach(p => {
      if (visited.has(p)) return;
      
      const cluster = [];
      const queue = [p];
      visited.add(p);

      while (queue.length > 0) {
        const curr = queue.shift();
        cluster.push(curr);

        panels.forEach(other => {
          if (!visited.has(other)) {
            const dist = Math.hypot(getU(curr) - getU(other), getV(curr) - getV(other));
            if (dist <= threshold) {
              visited.add(other);
              queue.push(other);
            }
          }
        });
      }
      clusters.push(cluster);
    });

    // 2. Ordenar DENTRO de cada cluster (Snake clásico)
    const snakeCluster = (clusterPanels) => {
        const sortedByV = [...clusterPanels].sort((a, b) => getV(b) - getV(a));
        const rows = [];
        const rowTol = Math.min(pW, pH) * 0.45;
        sortedByV.forEach(p => {
          let foundRow = rows.find(r => Math.abs(r.vKey - getV(p)) <= rowTol);
          if (!foundRow) {
            foundRow = { vKey: getV(p), panels: [] };
            rows.push(foundRow);
          }
          foundRow.panels.push(p);
          foundRow.vKey = foundRow.panels.reduce((sum, item) => sum + getV(item), 0) / foundRow.panels.length;
        });
        
        rows.sort((a, b) => b.vKey - a.vKey);
        
        let ordered = [];
        rows.forEach((rObj, idx) => {
          const isL2R = (idx % 2 === 0);
          const pList = [...rObj.panels].sort((a, b) => isL2R ? (getU(a) - getU(b)) : (getU(b) - getU(a)));
          ordered.push(...pList);
        });
        return ordered;
    };

    const orderedClusters = clusters.map(c => snakeCluster(c));

    // 3. Conectar los clusters mediante Nearest Neighbor
    const finalOrder = [];
    if (orderedClusters.length > 0) {
      orderedClusters.sort((a, b) => getV(b[0]) - getV(a[0]));
      
      let currentCluster = orderedClusters[0];
      finalOrder.push(...currentCluster);
      const unvisitedClusters = new Set(orderedClusters.slice(1));

      while (unvisitedClusters.size > 0) {
        let nearestCluster = null;
        let minDist = Infinity;
        let reverseNearest = false;

        const lastPanel = finalOrder[finalOrder.length - 1];

        unvisitedClusters.forEach(candCluster => {
          const firstCand = candCluster[0];
          const lastCand = candCluster[candCluster.length - 1];
          
          const dToFirst = Math.hypot(getU(lastPanel) - getU(firstCand), getV(lastPanel) - getV(firstCand));
          const dToLast = Math.hypot(getU(lastPanel) - getU(lastCand), getV(lastPanel) - getV(lastCand));
          
          if (dToFirst < minDist) {
            minDist = dToFirst;
            nearestCluster = candCluster;
            reverseNearest = false;
          }
          if (dToLast < minDist) {
            minDist = dToLast;
            nearestCluster = candCluster;
            reverseNearest = true;
          }
        });

        if (reverseNearest) nearestCluster.reverse();
        finalOrder.push(...nearestCluster);
        unvisitedClusters.delete(nearestCluster);
      }
    }

    // 4. Leapfrog Routing (UNE-EN 62305)
    if (finalOrder.length > 2) {
      const evens = [];
      const odds = [];
      for (let i = 0; i < finalOrder.length; i++) {
        if (i % 2 === 0) evens.push(finalOrder[i]);
        else odds.push(finalOrder[i]);
      }
      return [...evens, ...odds.reverse()];
    }

    return finalOrder;
  }

  function generateSnakeWiringPositions(panels) {
    const ordered = getSnakeOrderedPanels(panels);
    return ordered.map(p => p.center).filter(Boolean);
  }

  /**
   * Particiona los módulos de un faldón en Strings balanceados cumpliendo límites MPPT.
   * Criterio de Instalador Profesional (UNE-EN 62305 / IEC 62548):
   * Asigna HILERAS FÍSICAS COMPLETAS a cada string para evitar cortes a mitad de fila
   * y puentes antiestéticos o saltos caóticos en la cubierta.
   */
  function partitionPanelsIntoMPPTStrings(panels, userMax = null, userMin = null) {
    if (!panels || panels.length === 0) return [];

    const total = panels.length;
    const limits = calculateDynamicMPPTStringLimits();
    const maxPerString = (typeof userMax === 'number' && userMax > 0) ? userMax : limits.Ns_max;
    const minPerString = (typeof userMin === 'number' && userMin > 0) ? userMin : limits.Ns_min;

    if (total <= maxPerString) {
      const orderedAll = getSnakeOrderedPanels(panels);
      return [{
        stringSuffix: '',
        stringName: 'S1',
        panels: orderedAll,
        numPanels: total,
        Voc_Tmin: total * limits.Voc_Tmin,
        Vmp_Tmax: total * limits.Vmp_Tmax,
        isCompliant: total >= minPerString && total <= maxPerString
      }];
    }

    // 1. Extraer hileras físicas agrupadas
    const firstP = panels[0];
    const pW = firstP.w || 1.05;
    const pH = firstP.h || 2.10;
    const isLandscape = (firstP.orientation === 'landscape' || pW > pH);
    const rowTol = (isLandscape ? pW : pH) * 0.45;

    const sortedByV = [...panels].sort((a, b) => {
      const vA = (typeof a.gridA === 'number') ? a.gridA : ((a.center2D && typeof a.center2D.v === 'number') ? a.center2D.v : (a.v || 0));
      const vB = (typeof b.gridA === 'number') ? b.gridA : ((b.center2D && typeof b.center2D.v === 'number') ? b.center2D.v : (b.v || 0));
      return vB - vA;
    });

    const physicalRows = [];
    sortedByV.forEach(p => {
      const pv = (typeof p.gridA === 'number') ? p.gridA : ((p.center2D && typeof p.center2D.v === 'number') ? p.center2D.v : (p.v || 0));
      let foundRow = physicalRows.find(r => Math.abs(r.vKey - pv) <= rowTol);
      if (!foundRow) {
        foundRow = { vKey: pv, panels: [] };
        physicalRows.push(foundRow);
      }
      foundRow.panels.push(p);
      foundRow.vKey = foundRow.panels.reduce((sum, item) => {
        const v = (typeof item.gridA === 'number') ? item.gridA : ((item.center2D && typeof item.center2D.v === 'number') ? item.center2D.v : (item.v || 0));
        return sum + v;
      }, 0) / foundRow.panels.length;
    });
    physicalRows.sort((a, b) => b.vKey - a.vKey);

    // Ordenar paneles dentro de cada hilera en serpentina alterna (boustrophedon)
    physicalRows.forEach((rObj, rIdx) => {
      const isL2R = (rIdx % 2 === 0);
      rObj.panels.sort((a, b) => {
        const uA = (typeof a.gridB === 'number') ? a.gridB : ((a.center2D && typeof a.center2D.u === 'number') ? a.center2D.u : (a.u || 0));
        const uB = (typeof b.gridB === 'number') ? b.gridB : ((b.center2D && typeof b.center2D.u === 'number') ? b.center2D.u : (b.u || 0));
        return isL2R ? (uA - uB) : (uB - uA);
      });
    });

    const numStrings = Math.max(1, Math.ceil(total / maxPerString));
    const targetSize = total / numStrings;

    // 2. Particionamiento guiado por hileras completas
    const stringRowBuckets = [];
    let curRowIdx = 0;
    let canKeepRowsIntact = true;

    for (let s = 0; s < numStrings; s++) {
      const isLast = (s === numStrings - 1);
      if (isLast) {
        const remRows = physicalRows.slice(curRowIdx);
        const remPanels = remRows.flatMap(r => r.panels);
        if (remPanels.length > maxPerString || remPanels.length < minPerString) {
          canKeepRowsIntact = false;
        }
        stringRowBuckets.push(remPanels);
        break;
      }

      let bestCut = curRowIdx + 1;
      let bestDiff = Infinity;
      let curAccum = 0;

      for (let r = curRowIdx; r < physicalRows.length - (numStrings - 1 - s); r++) {
        curAccum += physicalRows[r].panels.length;
        const remAfter = physicalRows.slice(r + 1).reduce((sum, item) => sum + item.panels.length, 0);
        const remStrings = numStrings - 1 - s;
        const remMin = remStrings * minPerString;
        const remMax = remStrings * maxPerString;

        if (curAccum <= maxPerString && curAccum >= minPerString && remAfter >= remMin && remAfter <= remMax) {
          const diff = Math.abs(curAccum - targetSize);
          if (diff < bestDiff) {
            bestDiff = diff;
            bestCut = r + 1;
          }
        }
      }

      if (bestDiff === Infinity) {
        canKeepRowsIntact = false;
        break;
      }

      const assignedPanels = physicalRows.slice(curRowIdx, bestCut).flatMap(r => r.panels);
      stringRowBuckets.push(assignedPanels);
      curRowIdx = bestCut;
    }

    const strings = [];

    // 3. Si las hileras completas encajan limpiamente en la ventana MPPT, usar la agrupación por filas
    if (canKeepRowsIntact && stringRowBuckets.length === numStrings && stringRowBuckets.every(b => b.length >= minPerString && b.length <= maxPerString)) {
      stringRowBuckets.forEach((bucketPanels, s) => {
        strings.push({
          stringSuffix: '.' + (s + 1),
          stringName: 'S' + (s + 1),
          panels: bucketPanels,
          numPanels: bucketPanels.length,
          Voc_Tmin: bucketPanels.length * limits.Voc_Tmin,
          Vmp_Tmax: bucketPanels.length * limits.Vmp_Tmax,
          isCompliant: true
        });
      });
      return strings;
    }

    // 4. Fallback seguro: particionamiento matemático continuo sobre la serpentina global
    const orderedAll = getSnakeOrderedPanels(panels);
    const baseSize = Math.floor(total / numStrings);
    const remainder = total % numStrings;
    let startIndex = 0;

    for (let s = 0; s < numStrings; s++) {
      const stringSize = baseSize + (s < remainder ? 1 : 0);
      const slice = orderedAll.slice(startIndex, startIndex + stringSize);
      strings.push({
        stringSuffix: '.' + (s + 1),
        stringName: 'S' + (s + 1),
        panels: slice,
        numPanels: stringSize,
        Voc_Tmin: stringSize * limits.Voc_Tmin,
        Vmp_Tmax: stringSize * limits.Vmp_Tmax,
        isCompliant: stringSize >= minPerString && stringSize <= maxPerString
      });
      startIndex += stringSize;
    }
    return strings;
  }

  function matchInvertersFromCatalog(options = {}) {
    const catalog = options.invertersCatalog || [];
    const moduleSpec = options.module || {};
    const totalPanels = options.totalPanels || 0;
    const totalKwp = options.totalKwp || (totalPanels * (moduleSpec.wp || 450) / 1000.0);
    const roofs = options.roofs || [];
    const gridSupply = options.gridSupply || 'three_phase';

    const compatible = [];

    catalog.forEach(inv => {
      const isInvSinglePhase = inv.type && inv.type.includes('Monofásico');
      const isInvThreePhase = inv.type && inv.type.includes('Trifásico');

      if (gridSupply === 'single_phase' && isInvThreePhase) {
        return;
      }

      const maxAllowedOverload = inv.maxOverload || 1.35;
      const invCount = Math.max(1, Math.round(totalKwp / (inv.kw * 1.15)));
      const actualOverload = totalKwp / (invCount * inv.kw);
      const isCurrentSafe = !inv.iMaxScA || ((moduleSpec.isc || 14.0) <= inv.iMaxScA);
      const hasPhaseUnbalance = (gridSupply === 'three_phase' && isInvSinglePhase && (inv.kw * invCount) > 5.0);

      const isMatch = actualOverload >= 0.80 && actualOverload <= (maxAllowedOverload + 0.10) && isCurrentSafe && !hasPhaseUnbalance;

      if (isMatch) {
        compatible.push({
          inverter: inv,
          count: invCount,
          overloadPct: parseFloat((actualOverload * 100).toFixed(1)),
          totalAcKw: invCount * inv.kw,
          mpptCount: (inv.mppt || 2) * invCount,
          totalCostEur: invCount * (inv.price || 1500)
        });
      }
    });

    compatible.sort((a, b) => Math.abs(a.overloadPct - 118) - Math.abs(b.overloadPct - 118));

    const singleInvMatch = compatible.find(c => c.count === 1) || compatible[0] || null;
    const multiInvMatch = compatible.find(c => c.count >= 2) || (singleInvMatch ? {
      inverter: singleInvMatch.inverter,
      count: Math.max(2, Math.ceil(singleInvMatch.count * 2)),
      overloadPct: parseFloat((singleInvMatch.overloadPct / 2).toFixed(1)),
      totalAcKw: singleInvMatch.totalAcKw * 2,
      mpptCount: singleInvMatch.mpptCount * 2,
      totalCostEur: singleInvMatch.totalCostEur * 2
    } : null);

    const scenarioC = {
      type: 'MLPE',
      description: 'Microinversores 2-en-1 o Arquitectura Optimizada',
      estimatedUnits: Math.ceil(totalPanels / 2),
      totalAcKw: totalKwp * 0.95,
      estimatedCostEur: Math.ceil(totalPanels / 2) * 175
    };

    return {
      totalKwp: totalKwp,
      compatible: compatible,
      recommendedScenarioA: singleInvMatch,
      recommendedScenarioB: multiInvMatch,
      recommendedScenarioC: scenarioC
    };
  }

  /**
   * Calcula la caída de tensión y valida el cumplimiento según REBT ITC-BT-40 e IEC 62548.
   * Límite normativo reglamentario: ΔV <= 1.5% tanto en continua (CC) como en alterna (CA).
   */
  function calculateVoltageDrop({ lengthM, currentA, sectionMm2, voltageV, isThreePhase = false, conductor = 'Cu', tempC = 90 }) {
    const rho = (conductor === 'Al') ? 0.036 : (tempC >= 90 ? ELEC_CONSTANTS.RHO_CU_90 : 0.018);
    const factorPhase = isThreePhase ? Math.sqrt(3) : 2.0;
    const deltaV = (factorPhase * rho * Math.max(lengthM, 0.1) * Math.max(currentA, 0.01)) / Math.max(sectionMm2, 0.5);
    const pct = (deltaV / Math.max(voltageV, 1.0)) * 100.0;
    return {
      deltaV: Math.round(deltaV * 100) / 100,
      pct: Math.round(pct * 100) / 100,
      valid: pct <= 1.5,
      limitPct: 1.5
    };
  }

  // [P0-MPPT] Auto-reasignación balanceada de strings entre canales MPPT.
  // Sustituye la política "faldón entero → canal fijo" (polyIdx % mpptCount) que
  // concentraba un tejado completo en un solo MPPT y desbordaba entradas físicas.
  // Estrategia: los strings de un mismo faldón permanecen en un canal si cabe entero
  // (first-fit); si no, se reparten string a string al canal con más hueco. El aviso de
  // sobrecarga (index.html, validación 7b) sigue activo cuando el total excede la capacidad.
  function rebalanceMPPTAssignment(panels) {
    if (!Array.isArray(panels) || panels.length === 0) return { changed: 0, reason: 'sin_paneles' };
    const invCfg = (typeof window !== 'undefined' && window.solarProjectConfig &&
                    window.solarProjectConfig.calculatedLimits &&
                    window.solarProjectConfig.calculatedLimits.inverter) || null;
    const mpptCount = (invCfg && Number.isFinite(invCfg.mppt) && invCfg.mppt > 0) ? invCfg.mppt : 0;
    if (!mpptCount) return { changed: 0, reason: 'sin_inversor' };
    const capPer = (invCfg && Number.isFinite(invCfg.inputsPerMppt) && invCfg.inputsPerMppt > 0) ? invCfg.inputsPerMppt : 1;

    // 1. Strings en orden de creación (un string pertenece siempre a un solo faldón)
    const stringOrder = [];
    const byName = new Map();
    panels.forEach(p => {
      if (!p || !p.stringName) return;
      if (!byName.has(p.stringName)) {
        byName.set(p.stringName, { name: p.stringName, polyIdx: p.polyIdx });
        stringOrder.push(p.stringName);
      }
    });
    const totalStrings = stringOrder.length;
    if (totalStrings === 0) return { changed: 0, reason: 'sin_strings' };

    // 2. Faldones en orden de primera aparición con sus strings
    const roofOrder = [];
    const roofStrings = new Map();
    stringOrder.forEach(n => {
      const s = byName.get(n);
      if (!roofStrings.has(s.polyIdx)) { roofStrings.set(s.polyIdx, []); roofOrder.push(s.polyIdx); }
      roofStrings.get(s.polyIdx).push(s.name);
    });

    // 3. Asignación balanceada por capacidad
    const remaining = new Array(mpptCount).fill(capPer);
    const assign = new Map();
    roofOrder.forEach(pi => {
      const strs = roofStrings.get(pi);
      let ch = remaining.findIndex(r => r >= strs.length);
      if (ch !== -1) {
        strs.forEach(n => { assign.set(n, ch + 1); remaining[ch] = Math.max(0, remaining[ch] - 1); });
      } else {
        strs.forEach(n => {
          let best = 0;
          for (let c = 1; c < mpptCount; c++) if (remaining[c] > remaining[best]) best = c;
          assign.set(n, best + 1);
          remaining[best] = Math.max(0, remaining[best] - 1);
        });
      }
    });

    // 4. Aplicar a los paneles (mpptId + etiqueta "MPPTn:...")
    let changed = 0;
    panels.forEach(p => {
      if (!p || !p.stringName) return;
      const m = assign.get(p.stringName);
      if (!m) return;
      if (p.mpptId !== m) { p.mpptId = m; changed++; }
      if (typeof p.tag === 'string' && p.tag.indexOf(':') !== -1) {
        p.tag = 'MPPT' + m + ':' + p.tag.slice(p.tag.indexOf(':') + 1);
      }
    });

    return { changed, mpptCount, capPer, totalStrings, overflow: totalStrings > mpptCount * capPer };
  }

  // Exportar al ámbito global y Window
  root.ELEC_CONSTANTS = ELEC_CONSTANTS;
  root.getPolylineStringColor = getPolylineStringColor;
  root.calculateDynamicMPPTStringLimits = calculateDynamicMPPTStringLimits;
  root.getSnakeOrderedPanels = getSnakeOrderedPanels;
  root.generateSnakeWiringPositions = generateSnakeWiringPositions;
  root.partitionPanelsIntoMPPTStrings = partitionPanelsIntoMPPTStrings;
  root.matchInvertersFromCatalog = matchInvertersFromCatalog;
  root.calculateVoltageDrop = calculateVoltageDrop;
  root.rebalanceMPPTAssignment = rebalanceMPPTAssignment;

  if (!root.RA) root.RA = {};
  root.RA.Electrical = {
    constants: ELEC_CONSTANTS,
    getPolylineStringColor: getPolylineStringColor,
    calculateDynamicMPPTStringLimits: calculateDynamicMPPTStringLimits,
    getSnakeOrderedPanels: getSnakeOrderedPanels,
    generateSnakeWiringPositions: generateSnakeWiringPositions,
    partitionPanelsIntoMPPTStrings: partitionPanelsIntoMPPTStrings,
    matchInvertersFromCatalog: matchInvertersFromCatalog,
    calculateVoltageDrop: calculateVoltageDrop,
    rebalanceMPPTAssignment: rebalanceMPPTAssignment
  };

})(typeof window !== 'undefined' ? window : globalThis);

