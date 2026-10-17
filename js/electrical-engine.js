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
    const modW = modParams.potencia || modParams.power || pCfg.potencia || 450;
    const Voc_STC = modParams.Voc || modParams.voc || pCfg.voc || (modW >= 500 ? 50.0 : 49.5);
    const Vmp_STC = modParams.Vmp || modParams.vmp || pCfg.vmp || (modW >= 500 ? 42.0 : 41.5);
    const rawBeta = modParams.betaVoc || modParams.tempCoeffVoc || pCfg.betaVoc || pCfg.tempCoeffVoc || -0.0027;
    const betaVoc = Math.abs(rawBeta) > 0.05 ? rawBeta / 100.0 : rawBeta;
    const rawGamma = modParams.gammaPmp || modParams.tempCoeffPmax || pCfg.gammaPmp || pCfg.tempCoeffPmax || (pCfg.tecnologia && pCfg.tecnologia.includes('N-Type') ? -0.0029 : -0.0035);
    const gammaPmp = Math.abs(rawGamma) > 0.05 ? rawGamma / 100.0 : rawGamma;

    // Inversor real del catálogo (calculatedLimits se puebla en el Paso 3/4);
    // si no hay selección, cae a los defaults normativos 1000/200/850 V.
    const liveInv = (root.solarProjectConfig && root.solarProjectConfig.calculatedLimits &&
                     root.solarProjectConfig.calculatedLimits.inverter) || null;
    const Vmax_inv   = invParams.Vmax     || invParams.vDcMax || invParams.vMax || (liveInv ? (liveInv.vDcMax || liveInv.vMax || 1000) : 1000.0);
    const Vmppt_min  = invParams.VmpptMin || invParams.vMpptMin || invParams.vMpptNomMin || (liveInv ? (liveInv.vMpptNomMin || liveInv.vMpptMin || 200) : 200.0);
    const Vmppt_max  = invParams.VmpptMax || invParams.vMpptMax || invParams.vMpptNomMax || (liveInv ? (liveInv.vMpptNomMax || liveInv.vMpptMax || 850) : 850.0);

    // Zonificación térmica peninsular de diseño en frío (CTE DB-HE1 / UNE 206007 / IDAE)
    function getCTEZonificationTmin(lat, lng, altitudM) {
      if (typeof lat !== 'number') return ELEC_CONSTANTS.T_MIN_SPAIN;
      const altitude = (typeof altitudM === 'number') ? altitudM : 600;
      if ((lat < 39.0 && lng > -4.5) || (lng > -0.5 && lat < 42.0)) return -4.0; // Costal Mediterráneo / Sur
      if (lat > 42.8 && lng < -1.5 && altitude < 400) return -6.0;               // Cornisa Cantábrica
      if (altitude > 900 || (lat > 40.0 && lat < 42.5 && lng > -5.5 && lng < -1.5)) return -14.0; // Meseta Central elevada
      return ELEC_CONSTANTS.T_MIN_SPAIN;
    }

    const projLat = climParams.lat || (root.solarProjectConfig && root.solarProjectConfig.lat);
    const projLng = climParams.lng || (root.solarProjectConfig && root.solarProjectConfig.lng);
    const defaultTmin = (projLat != null) ? getCTEZonificationTmin(Number(projLat), Number(projLng)) : ELEC_CONSTANTS.T_MIN_SPAIN;

    const Tmin = climParams.Tmin !== undefined ? climParams.Tmin : (climParams.tMinCold !== undefined ? climParams.tMinCold : defaultTmin);
    const Tmax_cell = climParams.TmaxCell !== undefined ? climParams.TmaxCell : (climParams.tMaxHot !== undefined ? climParams.tMaxHot : 70.0);

    const Voc_Tmin = Voc_STC * (1 + betaVoc * (Tmin - 25.0));
    const Vmp_Tmax = Vmp_STC * (1 + gammaPmp * (Tmax_cell - 25.0));
    const Vmp_Tmin = Vmp_STC * (1 + gammaPmp * (Tmin - 25.0));

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
   * Ajusta un número objetivo de módulos al múltiplo válido más cercano
   * que cumpla la ventana de strings admisibles [Ns_min, Ns_max] sin dejar cadenas fuera de rango.
   * @param {number} targetCount Número de módulos deseado
   * @param {number} [nsMin=6] Mínimo de módulos por string (Vmp caliente >= Vmppt_min)
   * @param {number} [nsMax=18] Máximo de módulos por string (Voc frío <= Vmax_inv)
   * @param {number} [maxStrings=4] Capacidad máxima de strings del inversor
   * @returns {number} Número óptimo de módulos que forma strings válidos
   */
  function getNearestValidStringModuleCount(targetCount, nsMin = 6, nsMax = 18, maxStrings = 4) {
    if (!targetCount || targetCount <= 0) return 0;
    const minM = Math.max(1, nsMin || 6);
    const maxM = Math.max(minM, nsMax || 18);
    const limitStrings = Math.max(1, maxStrings || 4);

    let bestCount = targetCount;
    let minDiff = Infinity;

    for (let s = 1; s <= limitStrings; s++) {
      const minPossible = s * minM;
      const maxPossible = s * maxM;
      const clamped = Math.max(minPossible, Math.min(maxPossible, targetCount));
      const diff = Math.abs(clamped - targetCount);
      if (diff < minDiff) {
        minDiff = diff;
        bestCount = clamped;
      }
    }
    return bestCount;
  }

  /**
   * Ordena un conjunto de paneles en una secuencia física continua Snake (boustrophedon)
   * de instalador profesional: recorre fila a fila o columna a columna de forma contigua
   * minimizando saltos y longitud de conductores MC4 (UNE-EN 62305 / IEC 62548).
   */
  const getU = (p) => (typeof p.gridB === 'number') ? p.gridB : ((p.center2D && typeof p.center2D.u === 'number') ? p.center2D.u : (p.u || 0));
  const getV = (p) => (typeof p.gridA === 'number') ? p.gridA : ((p.center2D && typeof p.center2D.v === 'number') ? p.center2D.v : (p.v || 0));

  function clusterPanels(panels) {
    if (!panels || panels.length === 0) return [];
    const firstP = panels[0] || {};
    const pW = firstP.w || 1.05;
    const pH = firstP.h || 2.10;
    const threshold = Math.max(pW, pH) * 1.8; 
    const clusters = [];
    const visited = new Set();
    panels.forEach(p => {
      if (!p || visited.has(p)) return;
      const cluster = [];
      const queue = [p];
      visited.add(p);
      while (queue.length > 0) {
        const curr = queue.shift();
        cluster.push(curr);
        panels.forEach(other => {
          if (other && !visited.has(other)) {
            if (Math.hypot(getU(curr) - getU(other), getV(curr) - getV(other)) <= threshold) {
              visited.add(other);
              queue.push(other);
            }
          }
        });
      }
      clusters.push(cluster);
    });
    return clusters;
  }

  /**
   * Obtiene la posición 3D objetivo del equipo DC (Inversor o Cuadro DC) para optimizar
   * el inicio/fin de strings minimizando tiradas de cable homerun en el tejado.
   */
  function getDCEquipmentTargetPosition() {
    try {
      const sState = (typeof window !== 'undefined' && window.inverterEquipmentState) ? window.inverterEquipmentState : null;
      if (!sState) return null;
      if (sState.combinerBox && sState.combinerBox.position && sState.combinerBox.isEnabled) {
        return sState.combinerBox.position;
      }
      if (sState.dcProtectionPosition) {
        return sState.dcProtectionPosition;
      }
      if (sState.position) {
        return sState.position;
      }
      const WP = (typeof window !== 'undefined') ? window.WP : null;
      if (WP && Array.isArray(WP.polylines) && WP.polylines.length > 0 && WP.polylines[0] && Array.isArray(WP.polylines[0].points) && WP.polylines[0].points.length > 0) {
        return WP.polylines[0].points[0];
      }
    } catch (e) {}
    return null;
  }

  function getPanelDistanceToTarget(panel, targetPos) {
    if (!panel || !targetPos) return 0;
    const pPos = panel.center || panel.center3D || (panel.corners && panel.corners[0]);
    if (pPos && typeof pPos.x === 'number' && typeof targetPos.x === 'number') {
      return Math.hypot(pPos.x - targetPos.x, pPos.y - targetPos.y, (pPos.z || 0) - (targetPos.z || 0));
    }
    return 0;
  }

  function applyRowBasedLeapfrog(clusterPanels, options = {}) {
    if (!clusterPanels || clusterPanels.length === 0) return [];
    const firstP = clusterPanels[0] || {};
    const pW = firstP.w || 1.05;
    const pH = firstP.h || 2.10;
    const sortedByV = [...clusterPanels].filter(Boolean).sort((a, b) => getV(b) - getV(a));
    if (sortedByV.length === 0) return [];
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

    // Optimización: Orientar el orden de hileras hacia el equipo DC más cercano
    const eqPos = (options && options.targetPosition) || getDCEquipmentTargetPosition();
    if (eqPos && rows.length > 1) {
      const dFirstRow = getPanelDistanceToTarget(rows[0].panels[0], eqPos);
      const dLastRow = getPanelDistanceToTarget(rows[rows.length - 1].panels[0], eqPos);
      if (dLastRow < dFirstRow) {
        rows.reverse();
      }
    }

    const wiringTopology = (options && options.wiringTopology) ||
      ((typeof window !== 'undefined' && window.solarProjectConfig && window.solarProjectConfig.stringWiringTopology) ? window.solarProjectConfig.stringWiringTopology : 'leapfrog');
    
    let ordered = [];
    rows.forEach((rObj, rIdx) => {
      const pList = [...rObj.panels].sort((a, b) => getU(a) - getU(b));
      if (pList.length === 0) return;

      // Determinar qué extremo de la hilera está más cercano al equipo DC
      let startFromLeft = true;
      if (eqPos && pList.length > 1) {
        const dLeft = getPanelDistanceToTarget(pList[0], eqPos);
        const dRight = getPanelDistanceToTarget(pList[pList.length - 1], eqPos);
        if (dRight < dLeft) {
          startFromLeft = false;
        }
      }
      const pRow = startFromLeft ? pList : [...pList].reverse();

      if (wiringTopology === 'daisy_chain') {
        // Guirnalda continua: conectar secuencialmente (boustrophedon alterna para minimizar puente entre filas)
        if (rIdx % 2 === 0) {
          ordered.push(...pRow);
        } else {
          ordered.push(...[...pRow].reverse());
        }
      } else {
        // Salto de Rana (Leapfrog UNE-EN 62305 anti-bucle): pares ida, impares vuelta
        if (pRow.length > 2) {
          const evens = [];
          const odds = [];
          for (let i = 0; i < pRow.length; i++) {
            if (i % 2 === 0) evens.push(pRow[i]);
            else odds.push(pRow[i]);
          }
          ordered.push(...evens, ...odds.reverse());
        } else {
          ordered.push(...pRow);
        }
      }
    });
    return ordered;
  }

  function connectClustersTSP(orderedClusters) {
    const finalOrder = [];
    if (!orderedClusters || orderedClusters.length === 0) return finalOrder;
    const validClusters = orderedClusters.filter(c => Array.isArray(c) && c.length > 0);
    if (validClusters.length === 0) return finalOrder;
    
    const eqPos = getDCEquipmentTargetPosition();
    if (eqPos) {
      validClusters.sort((a, b) => getPanelDistanceToTarget(a[0], eqPos) - getPanelDistanceToTarget(b[0], eqPos));
    } else {
      validClusters.sort((a, b) => (getV(b[0]) || 0) - (getV(a[0]) || 0));
    }
    finalOrder.push(...validClusters[0]);
    const unvisitedClusters = new Set(validClusters.slice(1));

    while (unvisitedClusters.size > 0) {
      let nearestCluster = null;
      let minDist = Infinity;
      let reverseNearest = false;
      const lastPanel = finalOrder[finalOrder.length - 1];

      unvisitedClusters.forEach(candCluster => {
        const firstCand = candCluster[0];
        const lastCand = candCluster[candCluster.length - 1];
        if (!firstCand || !lastCand) return;
        const dToFirst = Math.hypot(getU(lastPanel) - getU(firstCand), getV(lastPanel) - getV(firstCand));
        const dToLast = Math.hypot(getU(lastPanel) - getU(lastCand), getV(lastPanel) - getV(lastCand));
        
        if (dToFirst < minDist) { minDist = dToFirst; nearestCluster = candCluster; reverseNearest = false; }
        if (dToLast < minDist) { minDist = dToLast; nearestCluster = candCluster; reverseNearest = true; }
      });
      if (nearestCluster) {
        if (reverseNearest) nearestCluster.reverse();
        finalOrder.push(...nearestCluster);
        unvisitedClusters.delete(nearestCluster);
      } else {
        const fallback = unvisitedClusters.values().next().value;
        if (fallback) {
          finalOrder.push(...fallback);
          unvisitedClusters.delete(fallback);
        } else {
          break;
        }
      }
    }
    return finalOrder;
  }

  function getSnakeOrderedPanels(panels, options = {}) {
    if (!panels || panels.length <= 1) return panels || [];
    try {
      const clusters = clusterPanels(panels);
      const orderedClusters = clusters.map(c => applyRowBasedLeapfrog(c, options));
      const res = connectClustersTSP(orderedClusters);
      return (res && res.length > 0) ? res : panels;
    } catch (err) {
      console.warn('[RA.Electrical] Error en getSnakeOrderedPanels, retornando lista original:', err);
      return panels;
    }
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

    try {
      const total = panels.length;
      const limits = calculateDynamicMPPTStringLimits();
      const maxPerString = (typeof userMax === 'number' && userMax > 0) ? userMax : limits.Ns_max;
      const minPerString = (typeof userMin === 'number' && userMin > 0) ? userMin : limits.Ns_min;

    if (total <= maxPerString) {
      let orderedAll = getSnakeOrderedPanels(panels);
      const eqPos = getDCEquipmentTargetPosition();
      if (eqPos && orderedAll.length > 1) {
        const dStart = getPanelDistanceToTarget(orderedAll[0], eqPos);
        const dEnd = getPanelDistanceToTarget(orderedAll[orderedAll.length - 1], eqPos);
        if (dEnd < dStart) {
          orderedAll = [...orderedAll].reverse();
        }
      }
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
      const curH = (p.orientation === 'landscape' || (p.w && p.h && p.w > p.h)) ? (p.w || pW) : (p.h || pH);
      const effTol = Math.max(0.30, Math.min(rowTol, curH * 0.45));
      let foundRow = physicalRows.find(r => Math.abs(r.vKey - pv) <= effTol);
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

    // Optimización: Si el equipo DC está más cerca del borde inferior del tejado,
    // procesamos las hileras empezando por la más cercana al inversor.
    const eqPos = getDCEquipmentTargetPosition();
    if (eqPos && physicalRows.length > 1) {
      const dFirst = getPanelDistanceToTarget(physicalRows[0].panels[0], eqPos);
      const dLast = getPanelDistanceToTarget(physicalRows[physicalRows.length - 1].panels[0], eqPos);
      if (dLast < dFirst) {
        physicalRows.reverse();
      }
    }

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
        let finalBucket = applyRowBasedLeapfrog(bucketPanels);
        if (!finalBucket || finalBucket.length === 0) finalBucket = bucketPanels;
        // Orientar el string para que [+ IN] (panel 0) nazca en el extremo más cercano al cuadro
        if (eqPos && finalBucket.length > 1) {
          const dStart = getPanelDistanceToTarget(finalBucket[0], eqPos);
          const dEnd = getPanelDistanceToTarget(finalBucket[finalBucket.length - 1], eqPos);
          if (dEnd < dStart) {
            finalBucket = [...finalBucket].reverse();
          }
        }
        strings.push({
          stringSuffix: '.' + (s + 1),
          stringName: 'S' + (s + 1),
          panels: finalBucket,
          numPanels: finalBucket.length,
          Voc_Tmin: finalBucket.length * limits.Voc_Tmin,
          Vmp_Tmax: finalBucket.length * limits.Vmp_Tmax,
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
      let slice = orderedAll.slice(startIndex, startIndex + stringSize);
      if (eqPos && slice.length > 1) {
        const dStart = getPanelDistanceToTarget(slice[0], eqPos);
        const dEnd = getPanelDistanceToTarget(slice[slice.length - 1], eqPos);
        if (dEnd < dStart) {
          slice = [...slice].reverse();
        }
      }
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
    } catch (err) {
      console.warn('[RA.Electrical] Error en partición de strings, aplicando fallback seguro:', err);
      return [{
        stringSuffix: '',
        stringName: 'S1',
        panels: panels || [],
        numPanels: (panels && panels.length) || 0,
        isCompliant: true
      }];
    }
  }

  /**
   * [C3/G4] Fase real del inversor como DATO propio (NO adivinada del texto del tipo).
   * Prioridad: inv.phases (1|3) → potencia nominal (umbral legal habitual 6 kW) → texto del tipo.
   * Así un inversor importado con otro nombre no fuerza un cálculo trifásico erróneo.
   */
  function raInverterPhases(inv) {
    if (inv && (inv.phases === 1 || inv.phases === 3)) return inv.phases;
    if (inv && typeof inv.kw === 'number' && isFinite(inv.kw)) return inv.kw <= 6.0 ? 1 : 3;
    var t = (inv && inv.type) ? String(inv.type).toLowerCase() : '';
    if (t.indexOf('mono') !== -1 || t.indexOf('1f') !== -1 || t.indexOf('1p') !== -1) return 1;
    return 3;
  }

  function matchInvertersFromCatalog(options = {}) {
    const catalog = options.invertersCatalog || [];
    const moduleSpec = options.module || {};
    const totalPanels = options.totalPanels || 0;
    const totalKwp = options.totalKwp || (totalPanels * (moduleSpec.wp || 450) / 1000.0);
    const roofs = options.roofs || [];
    const gridSupply = options.gridSupply || 'three_phase';

    const distinctOrientations = Math.max(1, options.distinctOrientations || 1);
    const shading = options.shadingDiagnostics || null;

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
      // La corriente de diseño se calcula por cada canal MPPT disponible
      const _modsPerString = options.modulesPerString || 12;
      const _nStrings = Math.max(1, Math.ceil(totalPanels / _modsPerString));
      const _inputsPerMppt = inv.inputsPerMppt || 1;
      const _mpptCount = inv.mppt || inv.mpptCount || 2;
      const _totalMppts = _mpptCount * invCount;
      const _stringsPerMppt = Math.max(1, Math.ceil(_nStrings / _totalMppts));
      const _iscPerMppt = (moduleSpec.isc || 14.0) * 1.25 * _stringsPerMppt;
      const isCurrentSafe = !inv.iMaxScA || (_iscPerMppt <= inv.iMaxScA);
      const hasPhaseUnbalance = (gridSupply === 'three_phase' && isInvSinglePhase && (inv.kw * invCount) > 5.0);

      // Comprobación de canales MPPT mínimos frente a orientaciones distintas de cubierta
      const hasEnoughMppts = _totalMppts >= distinctOrientations;

      // Criterio de fragmentación máxima admisible según potencia unitaria
      const maxUnitsAllowed = inv.kw <= 8.0 ? 2 : (inv.kw <= 15.0 ? 4 : (inv.kw <= 35.0 ? 6 : 8));
      const isExcessiveFragmentation = invCount > maxUnitsAllowed;

      const isMatch = !isExcessiveFragmentation && actualOverload >= 0.75 && actualOverload <= (maxAllowedOverload + 0.12) && isCurrentSafe && !hasPhaseUnbalance;

      if (isMatch) {
        compatible.push({
          inverter: inv,
          count: invCount,
          overloadPct: parseFloat((actualOverload * 100).toFixed(1)),
          totalAcKw: invCount * inv.kw,
          mpptCount: _totalMppts,
          hasEnoughMppts: hasEnoughMppts,
          totalCostEur: invCount * (inv.price || 1500)
        });
      }
    });

    // Helper de modelos comerciales recomendados segun potencia y fase
    function getSuggestedCommercialModels(targetKw, phase) {
      if (phase === 'single_phase' || targetKw <= 6.0) {
        const kwR = Math.min(6, Math.max(2, Math.round(targetKw)));
        return [
          { brand: 'Huawei', model: `SUN2000-${kwR}KTL-L1`, kw: kwR, mppt: 2 },
          { brand: 'Fronius', model: `Primo GEN24 ${kwR}.0 Plus`, kw: kwR, mppt: 2 },
          { brand: 'SMA', model: `Sunny Boy ${Math.min(5, kwR)}.0`, kw: Math.min(5, kwR), mppt: 2 },
          { brand: 'SolarEdge', model: `Home Wave SE${kwR}000H`, kw: kwR, mppt: 1 }
        ];
      } else if (targetKw <= 20.0) {
        const kwR = Math.min(20, Math.max(8, Math.round(targetKw / 2) * 2));
        return [
          { brand: 'Huawei', model: `SUN2000-${kwR}KTL-M2`, kw: kwR, mppt: 2 },
          { brand: 'Fronius', model: `Symo GEN24 10.0 Plus`, kw: 10, mppt: 2 },
          { brand: 'Sungrow', model: `SG${kwR}RT`, kw: kwR, mppt: 2 },
          { brand: 'SMA', model: `Sunny Tripower X ${Math.min(20, Math.max(12, kwR))}`, kw: Math.min(20, Math.max(12, kwR)), mppt: 3 }
        ];
      } else if (targetKw <= 60.0) {
        const kwR = Math.min(50, Math.max(25, Math.round(targetKw / 5) * 5));
        return [
          { brand: 'Huawei', model: `SUN2000-${kwR}KTL-M3`, kw: kwR, mppt: 4 },
          { brand: 'Sungrow', model: `SG${Math.min(50, Math.max(33, kwR))}CX-P2`, kw: Math.min(50, Math.max(33, kwR)), mppt: 3 },
          { brand: 'SMA', model: 'Sunny Tripower CORE1 (50 kW)', kw: 50, mppt: 6 },
          { brand: 'Kostal', model: 'PIKO CI 50/60', kw: 50, mppt: 4 }
        ];
      } else {
        return [
          { brand: 'Huawei', model: 'SUN2000-100KTL-M2 (100 kW)', kw: 100, mppt: 10 },
          { brand: 'Sungrow', model: 'SG110CX (110 kW)', kw: 110, mppt: 9 },
          { brand: 'SMA', model: 'Sunny Tripower CORE2 (110 kW)', kw: 110, mppt: 12 },
          { brand: 'Ingeteam', model: 'Ingecon Sun 100TL (100 kW)', kw: 100, mppt: 1 }
        ];
      }
    }

    let bottleneckReason = null;
    let virtualInverterMatch = null;
    let suggestedCommercialModels = [];

    if (compatible.length === 0) {
      // Diagnóstico físico de cuello de botella:
      if (!catalog || catalog.length === 0) {
        bottleneckReason = 'El catálogo de inversores está vacío. No hay ningún inversor registrado en la base de datos.';
      } else {
        let countPhaseMismatch = 0;
        let countCurrentMismatch = 0;
        catalog.forEach(inv => {
          const isInvThreePhase = inv.type && inv.type.includes('Trifásico');
          if (gridSupply === 'single_phase' && isInvThreePhase) countPhaseMismatch++;
          const _modsPerString = options.modulesPerString || 12;
          const _nStrings = Math.max(1, Math.ceil(totalPanels / _modsPerString));
          const _mpptCount = inv.mppt || inv.mpptCount || 2;
          const _invCount = Math.max(1, Math.round(totalKwp / (inv.kw * 1.15)));
          const _stringsPerMppt = Math.max(1, Math.ceil(_nStrings / (_mpptCount * _invCount)));
          const _isc = (moduleSpec.isc || 14.0) * 1.25 * _stringsPerMppt;
          if (inv.iMaxScA && _isc > inv.iMaxScA) countCurrentMismatch++;
        });

        if (countPhaseMismatch === catalog.length) {
          bottleneckReason = 'Todos los inversores del catálogo son trifásicos, pero el suministro configurado es monofásico (≤6 kWp).';
        } else if (countCurrentMismatch >= Math.ceil(catalog.length / 2)) {
          bottleneckReason = `La corriente Isc acumulada por MPPT (${((moduleSpec.isc || 14.0) * 2).toFixed(1)} A) excede la capacidad de entrada admisible de los inversores en catálogo.`;
        } else if (totalKwp > 80.0) {
          bottleneckReason = `Potencia instalada de ${totalKwp.toFixed(1)} kWp superior al rango unitario de los inversores disponibles en catálogo (requiere potencia industrial).`;
        } else {
          bottleneckReason = `Potencia (${totalKwp.toFixed(1)} kWp) u orientaciones (${distinctOrientations}) fuera de la envolvente de sobrecarga o canales MPPT de los equipos del catálogo.`;
        }
      }

      // Generar Inversor Paramétrico Virtual Ideal
      const isThreePhase = (gridSupply === 'three_phase' || totalKwp > 6.0);
      const targetOverload = 1.18;
      let idealKw = Math.max(1.0, Math.round((totalKwp / targetOverload) * 10) / 10);
      let invCount = 1;
      let unitKw = idealKw;

      if (idealKw > 120.0) {
        invCount = Math.ceil(idealKw / 100.0);
        unitKw = Math.round((idealKw / invCount) * 10) / 10;
      }

      const mpptReq = Math.max(distinctOrientations, isThreePhase ? (unitKw >= 25 ? 4 : 2) : 2);
      const _modsPerString = options.modulesPerString || 14;
      const _nStrings = Math.max(1, Math.ceil(totalPanels / _modsPerString));
      const inputsPerMppt = Math.max(1, Math.ceil(_nStrings / (mpptReq * invCount)));

      const estimatedUnitPrice = isThreePhase
        ? Math.round(unitKw * (unitKw >= 50 ? 45 : (unitKw >= 20 ? 55 : 75)))
        : Math.round(200 + unitKw * 110);

      suggestedCommercialModels = getSuggestedCommercialModels(unitKw, isThreePhase ? 'three_phase' : 'single_phase');

      const virtualInv = {
        id: `inv_virtual_ideal_${Math.round(unitKw)}kw`,
        brand: 'Paramétrico (Auto-Generado)',
        model: `Inversor Ideal ${unitKw} kW (${mpptReq} MPPT)`,
        kw: unitKw,
        type: isThreePhase ? 'Trifásico Industrial' : 'Monofásico Residencial',
        mppt: mpptReq,
        inputsPerMppt: inputsPerMppt,
        vDcMax: isThreePhase ? 1100 : 600,
        vStart: isThreePhase ? 200 : 100,
        vMpptNomMin: isThreePhase ? 250 : 120,
        vMpptNomMax: isThreePhase ? 850 : 500,
        iMaxOperA: Math.round((moduleSpec.imp || 13.0) * inputsPerMppt * 1.15 * 10) / 10,
        iMaxScA: Math.round((moduleSpec.isc || 14.0) * inputsPerMppt * 1.35 * 10) / 10,
        maxOverload: 1.35,
        eff: 98.6,
        price: estimatedUnitPrice,
        isVirtual: true,
        suggestedCommercialModels: suggestedCommercialModels
      };

      const actualOverload = totalKwp / (unitKw * invCount);

      virtualInverterMatch = {
        inverter: virtualInv,
        count: invCount,
        overloadPct: parseFloat((actualOverload * 100).toFixed(1)),
        totalAcKw: Math.round(unitKw * invCount * 10) / 10,
        mpptCount: mpptReq * invCount,
        hasEnoughMppts: true,
        totalCostEur: estimatedUnitPrice * invCount,
        isVirtual: true,
        bottleneckReason: bottleneckReason,
        suggestedCommercialModels: suggestedCommercialModels
      };
    }

    // Ordenar priorizando:
    // 1. Que cubra los MPPTs requeridos para las orientaciones de cubierta
    // 2. Cercanía a sobrecarga óptima (118%)
    // 3. Menor número de inversores (preferir 1 inversor robusto antes que múltiples si la potencia lo permite)
    compatible.sort((a, b) => {
      if (a.hasEnoughMppts !== b.hasEnoughMppts) return a.hasEnoughMppts ? -1 : 1;
      const scoreA = Math.abs(a.overloadPct - 118) + (a.count > 1 ? 5 : 0);
      const scoreB = Math.abs(b.overloadPct - 118) + (b.count > 1 ? 5 : 0);
      return scoreA - scoreB;
    });

    const singleInvMatch = compatible.find(c => c.count === 1 && c.hasEnoughMppts) || compatible.find(c => c.count === 1) || compatible[0] || (virtualInverterMatch && virtualInverterMatch.count === 1 ? virtualInverterMatch : null);
    const multiInvMatch = compatible.find(c => c.count >= 2 && c.hasEnoughMppts) || compatible.find(c => c.count >= 2) || (virtualInverterMatch && virtualInverterMatch.count > 1 ? virtualInverterMatch : null) || (singleInvMatch ? {
      inverter: singleInvMatch.inverter,
      count: Math.max(2, Math.ceil(singleInvMatch.count * 2)),
      overloadPct: parseFloat((singleInvMatch.overloadPct / 2).toFixed(1)),
      totalAcKw: singleInvMatch.totalAcKw * 2,
      mpptCount: singleInvMatch.mpptCount * 2,
      hasEnoughMppts: true,
      totalCostEur: singleInvMatch.totalCostEur * 2,
      isVirtual: !!singleInvMatch.isVirtual
    } : null);

    const scenarioC = {
      type: 'MLPE',
      description: 'Microinversores 2-en-1 o Arquitectura Optimizada',
      estimatedUnits: Math.ceil(totalPanels / 2),
      totalAcKw: totalKwp * 0.95,
      estimatedCostEur: Math.ceil(totalPanels / 2) * 175
    };

    // Matriz de decisión de Topología según Física Solar y Sombras:
    let recommendedTopology = 'inverter';
    let topologyRationale = 'Campo solar despejado: Inversor central de alta eficiencia con strings balanceados.';

    if (shading) {
      if (shading.recommendation === 'microinverters_or_full_mlpe') {
        recommendedTopology = 'microinverter';
        topologyRationale = 'Sombreado severo en >35% del campo: Topología descentralizada con Microinversores para desacoplar el sombreado mutuo.';
      } else if (shading.recommendation === 'selective_optimizers') {
        recommendedTopology = 'optimizer';
        topologyRationale = `Sombreado parcial en ${shading.criticalLossPanelsCount || 'varios'} módulos: Inversor de red con Optimizadores DC selectivos (Tigo / Huawei).`;
      } else if (distinctOrientations >= 3) {
        recommendedTopology = 'microinverter';
        topologyRationale = `Cubierta compleja con ${distinctOrientations} orientaciones distintas: Los microinversores proporcionan seguimiento MPPT individual por módulo.`;
      }
    } else if (distinctOrientations >= 3) {
      recommendedTopology = 'microinverter';
      topologyRationale = `Cubierta con ${distinctOrientations} faldones de orientación distinta: Microinversores recomendados para evitar pérdidas por mismatch de string.`;
    }

    return {
      totalKwp: totalKwp,
      distinctOrientations: distinctOrientations,
      compatible: compatible,
      hasCatalogMatch: compatible.length > 0,
      virtualInverterMatch: virtualInverterMatch,
      bottleneckReason: bottleneckReason,
      suggestedCommercialModels: suggestedCommercialModels,
      recommendedTopology: recommendedTopology,
      topologyRationale: topologyRationale,
      recommendedScenarioA: singleInvMatch,
      recommendedScenarioB: multiInvMatch,
      recommendedScenarioC: scenarioC
    };
  }

  /**
   * Calcula la caída de tensión y valida el cumplimiento según REBT ITC-BT-40 e IEC 62548.
   * Límite normativo reglamentario: ΔV <= 1.5% tanto en continua (CC) como en alterna (CA).
   */
  function calculateVoltageDrop({ lengthM, currentA, sectionMm2, voltageV, isThreePhase = false, isAC = false, conductor = 'Cu', tempC = 90, cosPhi = 0.98, reactancePerKm = 0.08 }) {
    const rho = (conductor === 'Al') ? 0.036 : (tempC >= 90 ? ELEC_CONSTANTS.RHO_CU_90 : 0.018);
    const factorPhase = isThreePhase ? Math.sqrt(3) : 2.0;
    const l = Math.max(lengthM, 0.1);
    const i = Math.max(currentA, 0.01);
    const s = Math.max(sectionMm2, 0.5);

    let deltaV;
    if (isAC) {
      // Alterna AC: impedancia Z = (rho/S)*cosPhi + X*sinPhi (REBT ITC-BT-40)
      const cosP = Math.min(Math.max(cosPhi, 0.70), 1.0);
      const sinP = Math.sqrt(Math.max(0, 1.0 - cosP * cosP));
      const xMeter = (reactancePerKm || 0.08) / 1000.0;
      deltaV = factorPhase * i * l * ((rho / s) * cosP + xMeter * sinP);
    } else {
      // Continua DC: puramente resistiva óhmica
      deltaV = (factorPhase * rho * l * i) / s;
    }

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
    let targetPanels = Array.isArray(panels) && panels.length > 0 ? panels : null;
    if (!targetPanels && typeof window !== 'undefined') {
      if (Array.isArray(window.allRenderedPanels) && window.allRenderedPanels.length > 0) {
        targetPanels = window.allRenderedPanels;
      } else if (window.WP && Array.isArray(window.WP.polylines)) {
        const collected = [];
        window.WP.polylines.forEach(pl => {
          const arr = (pl && pl.roofInfo && Array.isArray(pl.roofInfo.panels)) ? pl.roofInfo.panels : (pl && Array.isArray(pl.panels) ? pl.panels : null);
          if (arr) arr.forEach(p => collected.push(p));
        });
        if (collected.length > 0) targetPanels = collected;
      }
    }
    if (!Array.isArray(targetPanels) || targetPanels.length === 0) return { changed: 0, reason: 'sin_paneles' };
    panels = targetPanels;
    const invCfg = (typeof window !== 'undefined' && window.solarProjectConfig &&
                    window.solarProjectConfig.calculatedLimits &&
                    window.solarProjectConfig.calculatedLimits.inverter) || null;
    const invCount = (typeof window !== 'undefined' && window.solarProjectConfig &&
                      window.solarProjectConfig.autoSizing && window.solarProjectConfig.autoSizing.inverters &&
                      Number.isFinite(window.solarProjectConfig.autoSizing.inverters.count))
                      ? Math.max(1, window.solarProjectConfig.autoSizing.inverters.count) : 1;
    const mpptPerInv = (invCfg && Number.isFinite(invCfg.mppt) && invCfg.mppt > 0) ? invCfg.mppt : 0;
    const mpptCount = mpptPerInv * invCount;
    if (!mpptCount) return { changed: 0, reason: 'sin_inversor' };
    const capPer = (invCfg && Number.isFinite(invCfg.inputsPerMppt) && invCfg.inputsPerMppt > 0) ? invCfg.inputsPerMppt : 1;

    // 1. Strings en orden de creación (un string pertenece siempre a un solo faldón)
    const stringOrder = [];
    const byName = new Map();
    const stringPanels = new Map();
    panels.forEach(p => {
      if (!p || !p.stringName) return;
      if (!byName.has(p.stringName)) {
        byName.set(p.stringName, { name: p.stringName, polyIdx: p.polyIdx });
        stringOrder.push(p.stringName);
      }
      if (!stringPanels.has(p.stringName)) stringPanels.set(p.stringName, []);
      stringPanels.get(p.stringName).push(p);
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
      const strLens = strs.map(n => (stringPanels.get(n) || []).length);
      const isHomogeneous = strLens.every(len => len === strLens[0]);
      let ch = (isHomogeneous || mpptCount === 1) ? remaining.findIndex(r => r >= strs.length) : -1;
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

    const homogeneity = validateMPPTHomogeneity(panels);
    if (!homogeneity.valid && typeof window !== 'undefined' && typeof window.showToast === 'function') {
      window.showToast('⚠️ ' + homogeneity.violations[0].msg, 'warning');
    }

    return {
      changed,
      mpptCount,
      capPer,
      totalStrings,
      overflow: totalStrings > mpptCount * capPer,
      valid: homogeneity.valid,
      violations: homogeneity.violations
    };
  }

  /**
   * Valida la homogeneidad de orientación de strings en paralelo sobre el mismo canal MPPT.
   * Regla dura IEC 62548:
   * Si dos strings en paralelo en el mismo MPPT difieren en inclinación (|Δβ| > 5°)
   * o azimut (|Δγ| > 10°), genera alerta y marca valid: false.
   */
  function validateMPPTHomogeneity(panels) {
    let targetPanels = Array.isArray(panels) && panels.length > 0 ? panels : null;
    if (!targetPanels && typeof window !== 'undefined') {
      if (Array.isArray(window.allRenderedPanels) && window.allRenderedPanels.length > 0) {
        targetPanels = window.allRenderedPanels;
      } else if (window.WP && Array.isArray(window.WP.polylines)) {
        const collected = [];
        window.WP.polylines.forEach(pl => {
          const arr = (pl && pl.roofInfo && Array.isArray(pl.roofInfo.panels)) ? pl.roofInfo.panels : (pl && Array.isArray(pl.panels) ? pl.panels : null);
          if (arr) arr.forEach(p => collected.push(p));
        });
        if (collected.length > 0) targetPanels = collected;
      }
    }
    if (!Array.isArray(targetPanels) || targetPanels.length === 0) {
      return { valid: true, violations: [] };
    }

    // Agrupar strings por canal MPPT
    const mpptGroups = new Map();
    targetPanels.forEach(p => {
      if (!p || !p.stringName || !p.mpptId) return;
      if (!mpptGroups.has(p.mpptId)) mpptGroups.set(p.mpptId, new Map());
      const strMap = mpptGroups.get(p.mpptId);
      if (!strMap.has(p.stringName)) {
        let tilt = typeof p.tiltDeg === 'number' ? p.tiltDeg : null;
        let az = typeof p.azimuthDeg === 'number' ? p.azimuthDeg : null;
        if ((tilt == null || az == null) && typeof window !== 'undefined' && window.WP && Array.isArray(window.WP.polylines)) {
          const poly = window.WP.polylines[p.polyIdx];
          if (poly) {
            if (tilt == null) tilt = (poly.roofInfo && typeof poly.roofInfo.tiltDeg === 'number') ? poly.roofInfo.tiltDeg : (poly.tiltDeg || 0);
            if (az == null) az = (poly.roofInfo && typeof poly.roofInfo.azimuthDeg === 'number') ? poly.roofInfo.azimuthDeg : (poly.azimuthDeg || 0);
          }
        }
        strMap.set(p.stringName, {
          tilt: tilt || 0,
          az: az || 0,
          polyIdx: p.polyIdx,
          panelCount: 1
        });
      } else {
        strMap.get(p.stringName).panelCount++;
      }
    });

    const violations = [];
    mpptGroups.forEach((strMap, mpptId) => {
      const strings = Array.from(strMap.entries());
      if (strings.length <= 1) return;
      for (let i = 0; i < strings.length; i++) {
        for (let j = i + 1; j < strings.length; j++) {
          const [nameA, dataA] = strings[i];
          const [nameB, dataB] = strings[j];
          const deltaTilt = Math.abs(dataA.tilt - dataB.tilt);
          let deltaAz = Math.abs(dataA.az - dataB.az);
          if (deltaAz > 180) deltaAz = 360 - deltaAz;
          const deltaCount = Math.abs(dataA.panelCount - dataB.panelCount);

          if (deltaCount > 0 && dataA.panelCount > 1 && dataB.panelCount > 1) {
            const msg = `Incompatibilidad MPPT en Canal ${mpptId}: Strings '${nameA}' (${dataA.panelCount} módulos) y '${nameB}' (${dataB.panelCount} módulos) en paralelo tienen diferente longitud (ΔN = ${deltaCount}). Provoca desbalance de tensión y corrientes inversas (IEC 62548).`;
            violations.push({
              mpptId,
              stringA: nameA,
              stringB: nameB,
              deltaTilt,
              deltaAz,
              deltaCount,
              msg
            });
          } else if (deltaTilt > 5.0 || deltaAz > 10.0) {
            const msg = `Incompatibilidad MPPT en Canal ${mpptId}: Strings '${nameA}' y '${nameB}' en paralelo difieren en orientación (Δβ = ${deltaTilt.toFixed(1)}°, Δγ = ${deltaAz.toFixed(1)}°). Produce recirculación y pérdida de tracking (IEC 62548).`;
            violations.push({
              mpptId,
              stringA: nameA,
              stringB: nameB,
              deltaTilt,
              deltaAz,
              deltaCount: 0,
              msg
            });
          }
        }
      }
    });

    return {
      valid: violations.length === 0,
      violations
    };
  }

  /**
   * Modela la curva de rendimiento del inversor y recorte dinámico de potencia (Clipping).
   * @param {Object} opts
   * @param {number} opts.pDcW Potencia DC instantánea total (W)
   * @param {number} opts.pAcNomW Potencia nominal AC del inversor (W)
   * @param {number} [opts.pAcMaxW] Potencia máxima AC de salida admisible (W)
   * @param {number} [opts.euroEfficiency] Rendimiento pico/europeo (default 0.975)
   */
  function calculateInverterEfficiencyAndClipping(opts) {
    const pDc = Math.max(0, (opts && opts.pDcW) || 0);
    const pAcNom = Math.max(100, (opts && opts.pAcNomW) || 5000);
    const pAcMax = Math.max(pAcNom, (opts && opts.pAcMaxW) || pAcNom);
    const etaEuro = (opts && typeof opts.euroEfficiency === 'number' && opts.euroEfficiency > 0) ? opts.euroEfficiency : 0.975;

    if (pDc <= 0) {
      return { eta: 0, pAcTeorica: 0, pAcNet: 0, pClipping: 0, isClipping: false };
    }

    const pr = pDc / pAcNom;
    let eta = etaEuro;
    if (pr < 0.05) {
      eta = 0; // Umbral de arranque (cut-in)
    } else if (pr <= 0.10) {
      eta = etaEuro * (0.80 + 2.0 * (pr - 0.05));
    } else if (pr <= 0.20) {
      eta = etaEuro * 0.94;
    } else if (pr <= 0.50) {
      eta = etaEuro * 0.985;
    } else if (pr <= 1.00) {
      eta = etaEuro * 1.0;
    } else {
      eta = etaEuro * 0.995; // Saturación térmica
    }

    const pAcTeorica = pDc * eta;
    const pAcNet = Math.min(pAcTeorica, pAcMax);
    const pClipping = Math.max(0, pAcTeorica - pAcMax);

    return {
      eta,
      pAcTeorica,
      pAcNet,
      pClipping,
      isClipping: pClipping > 0
    };
  }

  // ── 7. ASISTENTE PROACTIVO DE INVERSORES Y GUÍA VISUAL DEL CONTADOR ─────────

  /**
   * Actualiza el asistente proactivo de inversores en el Paso 4
   * Revisa si el inversor se queda corto o largo respecto al número real de placas,
   * y ofrece la sustitución directa en 1 clic.
   */
  function wpUpdateInverterSmartAssistantUI() {
    const container = document.getElementById('step4-inverter-smart-assistant');
    if (!container) return;

    const catalog = (typeof root.equipmentCatalog !== 'undefined' && root.equipmentCatalog && root.equipmentCatalog.inverters)
      ? root.equipmentCatalog.inverters
      : [];
    if (catalog.length === 0) {
      container.style.display = 'none';
      return;
    }

    const cfg = root.solarProjectConfig || {};
    const topology = cfg.selectedTopology || 'inverter';

    // Conteo real de módulos
    let totalPanels = 0;
    if (Array.isArray(root.allRenderedPanels) && root.allRenderedPanels.length > 0) {
      totalPanels = root.allRenderedPanels.filter(p => p && !p.deleted).length;
    }
    if (totalPanels === 0 && root.WP && Array.isArray(root.WP.polylines)) {
      root.WP.polylines.forEach(p => {
        if (p && p.roofInfo && Array.isArray(p.roofInfo.panels)) {
          totalPanels += p.roofInfo.panels.filter(x => !x.deleted).length;
        }
      });
    }

    if (totalPanels === 0) {
      container.style.display = 'none';
      return;
    }

    const pCfg = (typeof root.panelConfig !== 'undefined' && root.panelConfig) ? root.panelConfig : {};
    const modWp = pCfg.potencia || pCfg.wp || 450;
    const totalKwp = (totalPanels * modWp) / 1000.0;

    // Caso A: Topología Microinversores MLPE
    if (topology === 'microinverter') {
      const microCatalog = (root.equipmentCatalog && root.equipmentCatalog.microinverters) ? root.equipmentCatalog.microinverters : [];
      const selectedMicroId = cfg.selectedMicroinverterId || (microCatalog[0] ? microCatalog[0].id : null);
      const currentMicro = microCatalog.find(m => m.id === selectedMicroId) || microCatalog[0];
      const inputs = (currentMicro && currentMicro.inputs) ? currentMicro.inputs : 2;
      const count = Math.ceil(totalPanels / inputs);
      const microBrand = currentMicro ? `${currentMicro.brand} ${currentMicro.model}` : 'Microinversor MLPE';

      container.style.display = 'block';
      container.innerHTML = `
        <div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.35);border-radius:7px;padding:7px 9px;display:flex;flex-direction:column;gap:4px;">
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <span style="font-size:9.5px;font-weight:900;color:#34D399;display:flex;align-items:center;gap:4px;">
              <i data-lucide="cpu" class="icon-sm"></i> Topología Microinversores MLPE (${count} Uds)
            </span>
            <span class="card-tag" style="background:rgba(16,185,129,0.2);color:#34D399;font-size:8px;font-weight:800;">
              ${inputs} entradas/ud
            </span>
          </div>
          <div style="font-size:8.5px;color:var(--text-slate-200);line-height:1.3;">
            <b>${totalPanels} paneles (${totalKwp.toFixed(1)} kWp)</b> gestionados por <b>${count} microinversores ${microBrand}</b>. Cada panel dispone de MPPT independiente en cubierta, inmune a sombras cruzadas y sin cableado DC de alta tensión.
          </div>
        </div>
      `;
      if (root.lucide && typeof root.lucide.createIcons === 'function') root.lucide.createIcons();
      return;
    }

    // Caso B: Inversor Central / String
    const selectedInvId = cfg.selectedInverterId || (catalog[0] ? catalog[0].id : null);
    const currentInv = catalog.find(i => i.id === selectedInvId) || catalog[0];

    const invNomKw = currentInv.kw || 5.0;
    const maxOverloadRatio = currentInv.maxOverload || 1.30;
    const maxCapacityKwp = invNomKw * maxOverloadRatio;
    const autoInverters = Math.max(1, Math.ceil(totalKwp / maxCapacityKwp));

    // Evaluar si se queda corto (potencia total supera la capacidad con margen del 5%)
    const isUndersized = totalKwp > (maxCapacityKwp * 1.05);

    // Evaluar si está sobredimensionado en exceso (potencia total < 50% del inversor)
    const isOversized = totalKwp < (invNomKw * 0.50) && totalKwp >= 1.0;

    if (isUndersized) {
      // Buscar el mejor inversor de 1 unidad que admita esta potencia
      const candidates = catalog.filter(inv => {
        const cap = (inv.kw || 5.0) * (inv.maxOverload || 1.30);
        return cap >= totalKwp;
      });

      if (candidates.length > 0) {
        // Ordenar por cercanía al 115-125% de sobrecarga
        candidates.sort((a, b) => {
          const ratioA = totalKwp / a.kw;
          const ratioB = totalKwp / b.kw;
          return Math.abs(ratioA - 1.20) - Math.abs(ratioB - 1.20);
        });

        const best = candidates[0];
        if (best && best.id !== currentInv.id) {
          container.style.display = 'block';
          container.innerHTML = `
            <div style="background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.45);border-radius:7px;padding:8px;display:flex;flex-direction:column;gap:5px;">
              <div style="display:flex;align-items:center;justify-content:space-between;">
                <span style="font-size:10px;font-weight:900;color:#F59E0B;display:flex;align-items:center;gap:4px;">
                  <i data-lucide="alert-triangle" class="icon-sm"></i> Inversor Insuficiente para ${totalPanels} Placas
                </span>
                <span class="card-tag" style="background:rgba(245,158,11,0.25);color:#FBBF24;font-size:8px;font-weight:800;">
                  ${totalKwp.toFixed(1)} kWp / ${invNomKw} kW AC
                </span>
              </div>
              <div style="font-size:8.5px;color:var(--text-slate-200);line-height:1.3;">
                El modelo actual de <b>${invNomKw} kW</b> se queda corto (${((totalKwp / invNomKw) * 100).toFixed(0)}% carga). Te recomendamos el modelo superior <b>${best.brand} ${best.model} (${best.kw} kW)</b> para abastecer toda la instalación con un único equipo.
              </div>
              <button type="button" onclick="wpApplyRecommendedInverter('${best.id}')" style="background:linear-gradient(135deg,#F59E0B,#D97706);border:none;color:#0F172A;font-size:9.5px;font-weight:900;padding:6px 10px;border-radius:5px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;box-shadow:0 0 10px rgba(245,158,11,0.3);margin-top:2px;">
                <i data-lucide="zap" class="icon-sm"></i> Cambiar a ${best.brand} ${best.kw} kW en 1 Clic
              </button>
            </div>
          `;
          if (root.lucide && typeof root.lucide.createIcons === 'function') root.lucide.createIcons();
          return;
        }
      }

      // Si ningún inversor individual del catálogo alcanza la potencia requerida:
      // Se requiere multi-inversor en paralelo
      const maxInvInCatalog = [...catalog].sort((a, b) => (b.kw || 0) - (a.kw || 0))[0];
      const optCount = maxInvInCatalog ? Math.ceil(totalKwp / ((maxInvInCatalog.kw || 5.0) * (maxInvInCatalog.maxOverload || 1.30))) : autoInverters;

      container.style.display = 'block';
      container.innerHTML = `
        <div style="background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.45);border-radius:7px;padding:8px;display:flex;flex-direction:column;gap:5px;">
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <span style="font-size:10px;font-weight:900;color:#F59E0B;display:flex;align-items:center;gap:4px;">
              <i data-lucide="layers" class="icon-sm"></i> Multi-Inversor Requerido (${autoInverters} Uds)
            </span>
            <span class="card-tag" style="background:rgba(245,158,11,0.25);color:#FBBF24;font-size:8px;font-weight:800;">
              ${totalKwp.toFixed(1)} kWp / Multi-Equipo
            </span>
          </div>
          <div style="font-size:8.5px;color:var(--text-slate-200);line-height:1.3;">
            La potencia de <b>${totalPanels} placas (${totalKwp.toFixed(1)} kWp)</b> excede la capacidad de un único equipo comercial. Se auto-dimensionan <b>${autoInverters} inversores en paralelo de ${currentInv.kw} kW</b> para repartir los strings con seguridad normativa (REBT / IEC 62548).
          </div>
          ${maxInvInCatalog && maxInvInCatalog.id !== currentInv.id ? `
            <button type="button" onclick="wpApplyRecommendedInverter('${maxInvInCatalog.id}')" style="background:linear-gradient(135deg,#F59E0B,#D97706);border:none;color:#0F172A;font-size:9.5px;font-weight:900;padding:6px 10px;border-radius:5px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;box-shadow:0 0 10px rgba(245,158,11,0.3);margin-top:2px;">
              <i data-lucide="zap" class="icon-sm"></i> Optimizar a ${maxInvInCatalog.brand} ${maxInvInCatalog.kw} kW (${optCount} Uds)
            </button>
          ` : ''}
        </div>
      `;
      if (root.lucide && typeof root.lucide.createIcons === 'function') root.lucide.createIcons();
      return;
    } else if (isOversized) {
      // Buscar el inversor más ajustado y económico
      const candidates = catalog.filter(inv => {
        const cap = (inv.kw || 5.0) * (inv.maxOverload || 1.30);
        return cap >= totalKwp && inv.kw < currentInv.kw;
      });

      candidates.sort((a, b) => {
        const ratioA = totalKwp / a.kw;
        const ratioB = totalKwp / b.kw;
        return Math.abs(ratioA - 1.20) - Math.abs(ratioB - 1.20);
      });

      const best = candidates[0];
      if (best && best.id !== currentInv.id) {
        container.style.display = 'block';
        container.innerHTML = `
          <div style="background:rgba(56,189,248,0.1);border:1px solid rgba(56,189,248,0.4);border-radius:7px;padding:8px;display:flex;flex-direction:column;gap:5px;">
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <span style="font-size:10px;font-weight:900;color:var(--sky-400);display:flex;align-items:center;gap:4px;">
                <i data-lucide="info" class="icon-sm"></i> Inversor Más Grande de lo Necesario
              </span>
              <span class="card-tag" style="background:rgba(56,189,248,0.2);color:#38BDF8;font-size:8px;font-weight:800;">
                ${totalKwp.toFixed(1)} kWp / ${invNomKw} kW AC
              </span>
            </div>
            <div style="font-size:8.5px;color:var(--text-slate-200);line-height:1.3;">
              Para solo <b>${totalPanels} placas (${totalKwp.toFixed(1)} kWp)</b>, el modelo de <b>${invNomKw} kW</b> encarece el presupuesto sin necesidad. Con el modelo <b>${best.brand} ${best.model} (${best.kw} kW)</b> ahorras costes de equipo sin perder rendimiento.
            </div>
            <button type="button" onclick="wpApplyRecommendedInverter('${best.id}')" style="background:rgba(56,189,248,0.25);border:1px solid #38BDF8;color:#BAE6FD;font-size:9.5px;font-weight:900;padding:5px 10px;border-radius:5px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;margin-top:2px;">
              <i data-lucide="check" class="icon-sm"></i> Ajustar a ${best.brand} ${best.kw} kW en 1 Clic
            </button>
          </div>
        `;
        if (root.lucide && typeof root.lucide.createIcons === 'function') root.lucide.createIcons();
        return;
      }
    }

    // Si está perfectamente ajustado
    container.style.display = 'block';
    container.innerHTML = `
      <div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.3);border-radius:6px;padding:5px 8px;display:flex;align-items:center;justify-content:space-between;">
        <span style="font-size:9px;font-weight:800;color:#34D399;display:flex;align-items:center;gap:4px;">
          <i data-lucide="check-circle" class="icon-sm"></i> Inversor perfectamente ajustado
        </span>
        <span style="font-size:8.5px;color:rgba(255,255,255,0.7);">
          ${totalKwp.toFixed(1)} kWp · ${((totalKwp / invNomKw) * 100).toFixed(0)}% carga óptima
        </span>
      </div>
    `;
    if (root.lucide && typeof root.lucide.createIcons === 'function') root.lucide.createIcons();
  }
  root.wpUpdateInverterSmartAssistantUI = wpUpdateInverterSmartAssistantUI;

  /**
   * Aplica directamente el inversor recomendado en 1 clic
   */
  function wpApplyRecommendedInverter(invId) {
    const sel = document.getElementById('step3-sel-inverter');
    if (sel) sel.value = invId;
    if (root.solarProjectConfig) root.solarProjectConfig.selectedInverterId = invId;
    if (typeof root.step3UpdateHardwareSelection === 'function') root.step3UpdateHardwareSelection();
    wpUpdateInverterSmartAssistantUI();
    if (typeof root.showToast === 'function') {
      const catalog = (root.equipmentCatalog && root.equipmentCatalog.inverters) ? root.equipmentCatalog.inverters : [];
      const inv = catalog.find(i => i.id === invId);
      const name = inv ? `${inv.brand} ${inv.kw} kW` : invId;
      root.showToast('INVERSOR ACTUALIZADO', `Se ha seleccionado el modelo ${name} para un ajuste perfecto con tus paneles.`, 'success', 3500);
    }
  }
  root.wpApplyRecommendedInverter = wpApplyRecommendedInverter;

  /**
   * Actualiza la guía visual del contador / acometida de la vivienda
   */
  function wpUpdateMeterPlacementGuideUI() {
    const container = document.getElementById('step4-meter-placement-guide');
    if (!container) return;

    const s = root.inverterEquipmentState || {};
    const hasInverter = !!(s.position);
    const hasMeter = !!(s.gridMeter && s.gridMeter.position);
    const measuredDc = (typeof s.L_dc_measured === 'number' && s.L_dc_measured > 0) ? s.L_dc_measured : 0;
    const measuredAc = (typeof s.L_ac_measured === 'number' && s.L_ac_measured > 0) ? s.L_ac_measured : 0;

    if (hasInverter && hasMeter) {
      container.innerHTML = `
        <div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.35);border-radius:7px;padding:7px 9px;display:flex;flex-direction:column;gap:4px;">
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <span style="font-size:9.5px;font-weight:900;color:#34D399;display:flex;align-items:center;gap:4px;">
              <i data-lucide="check-circle-2" class="icon-sm"></i> Infraestructura Eléctrica Medida en 3D
            </span>
            <div style="display:flex;gap:4px;">
              <button type="button" onclick="wpStartInverterPlacement()" class="doc-mini-btn" style="font-size:8px;padding:2px 5px;color:#F59E0B;border-color:rgba(245,158,11,0.4);" title="Mover inversor">
                <i data-lucide="zap" class="icon-sm"></i> Inversor
              </button>
              <button type="button" onclick="wpStartGridMeterPlacement()" class="doc-mini-btn" style="font-size:8px;padding:2px 5px;color:#38BDF8;border-color:rgba(56,189,248,0.4);" title="Mover contador">
                <i data-lucide="plug" class="icon-sm"></i> Contador
              </button>
            </div>
          </div>
          <div style="font-size:8.5px;color:var(--text-slate-300);line-height:1.3;">
            Tirada DC (cubierta → inversor): <b>${measuredDc > 0 ? measuredDc.toFixed(1) + ' m' : 'calculada'}</b> · Acometida AC (inversor → contador): <b>${measuredAc > 0 ? measuredAc.toFixed(1) + ' m' : 'calculada'}</b>. Metros de cable y caída de tensión REBT exactos al centímetro.
          </div>
        </div>
      `;
    } else if (hasInverter && !hasMeter) {
      container.innerHTML = `
        <div style="background:rgba(56,189,248,0.08);border:1px solid rgba(56,189,248,0.35);border-radius:7px;padding:8px 9px;display:flex;flex-direction:column;gap:4px;">
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <span style="font-size:9.5px;font-weight:900;color:var(--sky-400);display:flex;align-items:center;gap:4px;">
              <i data-lucide="plug" class="icon-sm"></i> Paso Necesario: Ubicar el Contador de Luz
            </span>
            <span class="card-tag" style="background:rgba(56,189,248,0.2);color:#38BDF8;font-size:8px;font-weight:800;">PENDIENTE AC</span>
          </div>
          <div style="font-size:8.5px;color:var(--text-slate-300);line-height:1.3;">
            El inversor ya está fijado en pared. Toca en la fachada de la casa donde esté el contador o cuadro general (CGMP) para medir la línea exacta de evacuación AC hasta la red.
          </div>
          <button type="button" onclick="wpStartGridMeterPlacement()" style="background:rgba(56,189,248,0.25);border:1px solid #38BDF8;color:#BAE6FD;font-size:9px;font-weight:900;padding:5px 8px;border-radius:5px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;margin-top:2px;">
            <i data-lucide="map-pin" class="icon-sm"></i> Tocar en la Pared para Situar el Contador
          </button>
        </div>
      `;
    } else if (!hasInverter && hasMeter) {
      container.innerHTML = `
        <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.35);border-radius:7px;padding:8px 9px;display:flex;flex-direction:column;gap:4px;">
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <span style="font-size:9.5px;font-weight:900;color:#F59E0B;display:flex;align-items:center;gap:4px;">
              <i data-lucide="zap" class="icon-sm"></i> Paso Necesario: Ubicar el Inversor
            </span>
            <span class="card-tag" style="background:rgba(245,158,11,0.2);color:#FBBF24;font-size:8px;font-weight:800;">PENDIENTE DC</span>
          </div>
          <div style="font-size:8.5px;color:var(--text-slate-300);line-height:1.3;">
            Contador ubicado. Toca en la pared o fachada donde se colocará el inversor y el cuadro DC para conectar los strings de paneles con la vivienda.
          </div>
          <button type="button" onclick="wpStartInverterPlacement()" style="background:linear-gradient(135deg,#F59E0B,#D97706);border:none;color:#0F172A;font-size:9px;font-weight:900;padding:5px 8px;border-radius:5px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;margin-top:2px;">
            <i data-lucide="map-pin" class="icon-sm"></i> Tocar en la Pared para Situar el Inversor
          </button>
        </div>
      `;
    } else {
      container.innerHTML = `
        <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.12);border-radius:7px;padding:8px 9px;display:flex;flex-direction:column;gap:5px;">
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <span style="font-size:9.5px;font-weight:900;color:var(--text-slate-200);display:flex;align-items:center;gap:4px;">
              <i data-lucide="route" class="icon-sm"></i> Guía Visual: Ubicación de Equipos 3D
            </span>
            <span class="card-tag" style="background:rgba(255,255,255,0.1);color:var(--text-slate-300);font-size:8px;">2 PASOS</span>
          </div>
          <div style="font-size:8.5px;color:var(--text-slate-400);line-height:1.3;">
            Sitúa los equipos en fachada para medir al centímetro las tiradas reales de cable y evitar costes de obra estimados en la oferta:
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:2px;">
            <button type="button" onclick="wpStartInverterPlacement()" style="background:linear-gradient(135deg,#F59E0B,#D97706);border:none;color:#0F172A;font-size:8.5px;font-weight:900;padding:5px 6px;border-radius:4px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;">
              <i data-lucide="zap" class="icon-sm"></i> 1. Situar Inversor
            </button>
            <button type="button" onclick="wpStartGridMeterPlacement()" style="background:rgba(56,189,248,0.2);border:1px solid #38BDF8;color:#BAE6FD;font-size:8.5px;font-weight:900;padding:5px 6px;border-radius:4px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;">
              <i data-lucide="plug" class="icon-sm"></i> 2. Situar Contador
            </button>
          </div>
        </div>
      `;
    }
    if (root.lucide && typeof root.lucide.createIcons === 'function') root.lucide.createIcons();
  }
  function wpSetStringWiringTopology(topology) {
    if (typeof root === 'undefined') return;
    if (!root.solarProjectConfig) root.solarProjectConfig = {};
    root.solarProjectConfig.stringWiringTopology = topology;

    const descEl = (typeof document !== 'undefined') ? document.getElementById('step4-string-wiring-desc') : null;
    if (descEl) {
      if (topology === 'leapfrog') {
        descEl.textContent = 'Conecta paneles alternos (pares a la ida, impares a la vuelta). Cancela bucles inductivos frente a rayos (UNE-EN 62305). Requiere latiguillos alargadores MC4 presupuestados en el BOM.';
      } else {
        descEl.textContent = 'Conexión secuencial placa a placa en línea directa (1-2-3...). Requiere tender un cable de retorno compensado paralelo pegado a la fila para cerrar el circuito.';
      }
    }

    if (typeof root.updateConfigAndSimulate === 'function') {
      root.updateConfigAndSimulate();
    } else if (typeof root.wpFastRenderSimulatedPanels === 'function') {
      root.wpFastRenderSimulatedPanels();
    }

    if (root.RACableEngine && typeof root.RACableEngine.redrawAll === 'function') {
      root.RACableEngine.redrawAll();
    } else if (root.RACableEngine && typeof root.RACableEngine.renderAllCables === 'function') {
      root.RACableEngine.renderAllCables();
    }
    if (root.BOMTreeEngine && typeof root.BOMTreeEngine.refresh === 'function') {
      root.BOMTreeEngine.refresh();
    }
  }

  root.wpUpdateMeterPlacementGuideUI = wpUpdateMeterPlacementGuideUI;
  root.wpSetStringWiringTopology = wpSetStringWiringTopology;

  // Exportar al ámbito global y Window
  root.ELEC_CONSTANTS = ELEC_CONSTANTS;
  root.getPolylineStringColor = getPolylineStringColor;
  root.calculateDynamicMPPTStringLimits = calculateDynamicMPPTStringLimits;
  root.getNearestValidStringModuleCount = getNearestValidStringModuleCount;
  root.getSnakeOrderedPanels = getSnakeOrderedPanels;
  root.generateSnakeWiringPositions = generateSnakeWiringPositions;
  root.partitionPanelsIntoMPPTStrings = partitionPanelsIntoMPPTStrings;
  root.matchInvertersFromCatalog = matchInvertersFromCatalog;
  root.calculateVoltageDrop = calculateVoltageDrop;
  root.rebalanceMPPTAssignment = rebalanceMPPTAssignment;
  root.validateMPPTHomogeneity = validateMPPTHomogeneity;
  root.calculateInverterEfficiencyAndClipping = calculateInverterEfficiencyAndClipping;
  root.raInverterPhases = raInverterPhases;

  if (!root.RA) root.RA = {};
  root.RA.Electrical = {
    constants: ELEC_CONSTANTS,
    getPolylineStringColor: getPolylineStringColor,
    calculateDynamicMPPTStringLimits: calculateDynamicMPPTStringLimits,
    getNearestValidStringModuleCount: getNearestValidStringModuleCount,
    getSnakeOrderedPanels: getSnakeOrderedPanels,
    generateSnakeWiringPositions: generateSnakeWiringPositions,
    partitionPanelsIntoMPPTStrings: partitionPanelsIntoMPPTStrings,
    matchInvertersFromCatalog: matchInvertersFromCatalog,
    calculateVoltageDrop: calculateVoltageDrop,
    rebalanceMPPTAssignment: rebalanceMPPTAssignment,
    validateMPPTHomogeneity: validateMPPTHomogeneity,
    calculateInverterEfficiencyAndClipping: calculateInverterEfficiencyAndClipping,
    raInverterPhases: raInverterPhases,
    updateInverterAssistant: wpUpdateInverterSmartAssistantUI,
    applyRecommendedInverter: wpApplyRecommendedInverter,
    updateMeterPlacementGuide: wpUpdateMeterPlacementGuideUI,
    setStringWiringTopology: wpSetStringWiringTopology
  };

})(typeof window !== 'undefined' ? window : globalThis);

