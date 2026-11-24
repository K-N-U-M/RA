/**
 * ============================================================================
 * ⚡ ELECTRICAL ENGINE & REBT CABLING MODULE — PROYECTO RA (CALIDAD AAA)
 * ============================================================================
 * Arquitectura Modular Desacoplada:
 * - Dimensionamiento de Strings por ventana térmica MPPT (-10°C a +70°C, IEC 62548).
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
    DV_MAX_DC_PCT: 1.5,       // Caída de tensión máxima admisible DC (objetivo de diseño)
    DV_MAX_AC_PCT: 1.5,       // Caída de tensión máxima admisible AC (objetivo de diseño)
    DV_MAX_TOTAL_PCT: 2.5,    // [C-02] Restricción vinculante DC+AC (criterio de proyecto)
    SEC_DC_AVAIL: [4, 6, 10, 16, 25, 35, 50, 70],
    IMAX_DC_ZZF:  [44, 58, 80, 107, 138, 171, 209, 256],
    SEC_AC_AVAIL: [2.5, 4, 6, 10, 16, 25, 35, 50, 70],
    IMAX_AC_RVK:  [29, 38, 49, 68, 91, 119, 146, 178, 226]
  };

  /**
   * Normaliza coeficientes térmicos de catálogo (%/°C, ej. -0.35) o base unitaria (1/°C, ej. -0.0035)
   * garantizando siempre signo negativo en base 1/°C.
   */
  function normalizeThermalCoeff(raw, defaultVal = -0.0035) {
    const fallback = (typeof defaultVal === 'number' && Number.isFinite(defaultVal)) ? defaultVal : -0.0035;
    if (raw === null || raw === undefined || raw === '') return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n) || n === 0) return fallback;
    return -Math.abs(Math.abs(n) > 0.05 ? n / 100.0 : n);
  }

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
    const modW = modParams.potencia || modParams.power || modParams.wp || pCfg.potencia || 450;
    const Voc_STC = modParams.Voc || modParams.voc || pCfg.voc || (modW >= 500 ? 50.0 : 49.5);
    const Vmp_STC = modParams.Vmp || modParams.vmp || pCfg.vmp || (modW >= 500 ? 42.0 : 41.5);
    const rawBeta = modParams.betaVoc || modParams.gammaVoc || modParams.tempCoeffVoc || pCfg.betaVoc || pCfg.gammaVoc || pCfg.tempCoeffVoc || -0.0028;
    const betaVoc = normalizeThermalCoeff(rawBeta, -0.0028);
    const rawBetaVmp = modParams.betaVmp || modParams.gammaVmp || modParams.tempCoeffVmp || pCfg.betaVmp || (rawBeta * 1.05);
    const betaVmp = normalizeThermalCoeff(rawBetaVmp, betaVoc * 1.05);
    const rawGamma = modParams.gammaPmp || modParams.tempCoeffPmax || pCfg.gammaPmp || pCfg.tempCoeffPmax || (pCfg.tecnologia && pCfg.tecnologia.includes('N-Type') ? -0.0029 : -0.0035);
    const gammaPmp = normalizeThermalCoeff(rawGamma, -0.0035);

    // Inversor real del catálogo (calculatedLimits se puebla en el Paso 3/4);
    // si no hay selección, cae a los defaults normativos 1000/200/850 V.
    const liveInv = (root.solarProjectConfig && root.solarProjectConfig.calculatedLimits &&
                     root.solarProjectConfig.calculatedLimits.inverter) || null;
    const Vmax_inv   = invParams.Vmax     || invParams.vDcMax || invParams.vMax || (liveInv ? (liveInv.vDcMax || liveInv.vMax || 1000) : 1000.0);
    const Vmppt_min  = invParams.VmpptMin || invParams.vMpptMin || invParams.vMpptNomMin || (liveInv ? (liveInv.vMpptMin || liveInv.vMpptNomMin || 200) : 200.0);
    const Vmppt_max  = invParams.VmpptMax || invParams.vMpptMax || invParams.vMpptNomMax || (liveInv ? (liveInv.vMpptMax || liveInv.vMpptNomMax || 850) : 850.0);

    // Zonificación térmica peninsular de diseño en frío (CTE DB-HE1 / UNE 206007 / IDAE)
    function getCTEZonificationTmin(lat, lng, altitudM) {
      if (typeof lat !== 'number') return ELEC_CONSTANTS.T_MIN_SPAIN;
      const altitude = (typeof altitudM === 'number') ? altitudM : 600;
      if ((lat < 39.0 && lng > -4.5) || (lng > -0.5 && lat < 42.0)) return -4.0; // Costal Mediterráneo / Sur
      if (lat > 42.8 && lng < -1.5 && altitude < 400) return -6.0;               // Cornisa Cantábrica
      if (altitude > 900 || (lat > 40.0 && lat < 42.5 && lng > -5.5 && lng < -1.5)) return -14.0; // Meseta Central elevada
      return ELEC_CONSTANTS.T_MIN_SPAIN;
    }

    const projLat = climParams.lat ?? climParams.latitude ?? (root.solarProjectConfig && (root.solarProjectConfig.lat ?? root.solarProjectConfig.latitude));
    const projLng = climParams.lng ?? climParams.longitude ?? climParams.lon ?? (root.solarProjectConfig && (root.solarProjectConfig.lng ?? root.solarProjectConfig.longitude ?? root.solarProjectConfig.lon));
    const projAlt = climParams.altitudM ?? climParams.altitude ?? (root.solarProjectConfig && root.solarProjectConfig.altitude);
    const defaultTmin = (projLat != null && projLng != null) ? getCTEZonificationTmin(Number(projLat), Number(projLng), projAlt != null ? Number(projAlt) : undefined) : ELEC_CONSTANTS.T_MIN_SPAIN;

    const Tmin = climParams.Tmin !== undefined ? climParams.Tmin : (climParams.tMinCold !== undefined ? climParams.tMinCold : defaultTmin);
    const Tmax_cell = climParams.TmaxCell !== undefined ? climParams.TmaxCell : (climParams.tMaxHot !== undefined ? climParams.tMaxHot : 70.0);

    const Voc_Tmin = Voc_STC * (1 + betaVoc * (Tmin - 25.0));
    const Vmp_Tmax = Vmp_STC * (1 + betaVmp * (Tmax_cell - 25.0));
    const Vmp_Tmin = Vmp_STC * (1 + betaVmp * (Tmin - 25.0));

    const Ns_max_voc = Math.floor(Vmax_inv / Voc_Tmin);
    const Ns_max_mppt = Math.floor(Vmppt_max / Vmp_Tmin);
    const Ns_max = Math.max(1, Math.min(Ns_max_voc, Ns_max_mppt));
    const Ns_min = Math.max(1, Math.ceil(Vmppt_min / Vmp_Tmax));

    return {
      Ns_max,
      Ns_min,
      Voc_Tmin,
      Vmp_Tmax,
      Vmp_Tmin,
      Tmin,
      Tmax_cell,
      vocCold: Voc_Tmin,
      vmpHot: Vmp_Tmax,
      vmpCold: Vmp_Tmin
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

      // Continuidad serpenteante real (boustrophedon):
      // - En la primera fila, arrancar desde el extremo más cercano al equipo DC.
      // - En las filas siguientes, arrancar siempre desde el extremo más próximo al último panel de la fila anterior
      //   para eliminar saltos diagonales cruzados de punta a punta de la cubierta.
      let startFromLeft = true;
      if (rIdx === 0) {
        if (eqPos && pList.length > 1) {
          const dLeft = getPanelDistanceToTarget(pList[0], eqPos);
          const dRight = getPanelDistanceToTarget(pList[pList.length - 1], eqPos);
          if (dRight < dLeft) startFromLeft = false;
        }
      } else if (ordered.length > 0 && pList.length > 1) {
        const prevPanel = ordered[ordered.length - 1];
        const prevPos = prevPanel.center || prevPanel.center3D || (prevPanel.corners && prevPanel.corners[0]);
        if (prevPos) {
          const dLeft = getPanelDistanceToTarget(pList[0], prevPos);
          const dRight = getPanelDistanceToTarget(pList[pList.length - 1], prevPos);
          if (dRight < dLeft) startFromLeft = false;
        } else {
          startFromLeft = (rIdx % 2 === 0);
        }
      }
      const pRow = startFromLeft ? pList : [...pList].reverse();

      // Solo aplicar salto de rana alterno (evens/odds) en filas largas e ininterrumpidas (>= 6 módulos sin hueco de chimenea);
      // en filas residenciales cortas o partidas por obstáculos, usar serpiente continua sin cruces en Z.
      let hasRowGap = false;
      const gapLimit = Math.max(pW, pH) * 1.45;
      for (let gi = 0; gi < pRow.length - 1; gi++) {
        if (Math.hypot(getU(pRow[gi + 1]) - getU(pRow[gi]), getV(pRow[gi + 1]) - getV(pRow[gi])) > gapLimit) {
          hasRowGap = true;
          break;
        }
      }

      if (wiringTopology === 'leapfrog' && pRow.length >= 6 && !hasRowGap) {
        // Salto de Rana (Leapfrog UNE-EN 62305 anti-bucle) en mesa larga continua
        const evens = [];
        const odds = [];
        for (let i = 0; i < pRow.length; i++) {
          if (i % 2 === 0) evens.push(pRow[i]);
          else odds.push(pRow[i]);
        }
        ordered.push(...evens, ...odds.reverse());
      } else {
        // Serpiente continua limpia (cero cruces en Z ni saltos innecesarios sobre chimeneas)
        ordered.push(...pRow);
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

    // 3. Si las hileras completas encajan limpiamente en la ventana MPPT Y garantizan simetría eléctrica (ΔN = 0 cuando es divisible, o ΔN <= 1), usar la agrupación por filas
    const bucketLens = stringRowBuckets.map(b => b.length);
    const maxAllowedBucketDelta = (total % numStrings === 0) ? 0 : 1;
    const isRowBucketingSymmetric = bucketLens.length > 0 && (Math.max(...bucketLens) - Math.min(...bucketLens)) <= maxAllowedBucketDelta;
    if (canKeepRowsIntact && isRowBucketingSymmetric && stringRowBuckets.length === numStrings && stringRowBuckets.every(b => b.length >= minPerString && b.length <= maxPerString)) {
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
   * [C3/G4] Fase real del inversor como DATO propio.
   * Prioridad: inv.phases (1|3) → texto explícito del tipo/modelo → potencia nominal (umbral 6 kW).
   * Así un inversor monofásico de 8-10 kW no se clasifica erróneamente como trifásico.
   */
  function raInverterPhases(inv) {
    if (inv && (inv.phases === 1 || inv.phases === 3)) return inv.phases;
    var t = ((inv && inv.type) ? String(inv.type) : '') + ' ' + ((inv && inv.model) ? String(inv.model) : '');
    var tl = t.toLowerCase();
    if (tl.indexOf('mono') !== -1 || tl.indexOf('1f') !== -1 || tl.indexOf('1p') !== -1 || tl.indexOf('l1') !== -1) return 1;
    if (tl.indexOf('tri') !== -1 || tl.indexOf('3f') !== -1 || tl.indexOf('3p') !== -1) return 3;
    if (inv && typeof inv.kw === 'number' && isFinite(inv.kw)) return inv.kw <= 6.0 ? 1 : 3;
    return 3;
  }

  /**
   * Resuelve el número de fases efectivo (1 o 3) para cálculos de evacuación AC (230 V vs 400 V)
   * combinando acometida (gridSupply), topología, fases del inversor, nº de equipos y RD 1699 Art. 12.2.
   */
  function raResolveAcPhases(inv, invCount, cfg) {
    var count = (typeof invCount === 'number' && isFinite(invCount) && invCount > 0) ? Math.round(invCount) : 1;
    var unitKw = (inv && typeof inv.kw === 'number' && isFinite(inv.kw)) ? inv.kw : 5.0;
    var totalAcKw = unitKw * count;
    // RD 1699/2011 Art. 12.2: Pn > 15 kW AC exige siempre conexión trifásica
    if (totalAcKw > 15.0) return 3;

    var gridSupply = (cfg && cfg.gridSupply) ? cfg.gridSupply : null;
    var topo = (cfg && cfg.selectedTopology) ? cfg.selectedTopology : 'inverter';
    var invPhases = inv ? raInverterPhases(inv) : (unitKw <= 6.0 ? 1 : 3);

    if (gridSupply === 'single_phase') return 1;
    if (gridSupply === 'three_phase') {
      if (topo === 'microinverter' || invPhases === 3 || count >= 2) return 3;
      // 1 único inversor monofásico <= 5 kW conectado a una fase de red trifásica: su salida AC es 1F 230 V
      return 1;
    }
    return invPhases;
  }

  /**
   * Ratio unificado de módulos por unidad de microinversor (1/2/4-en-1).
   */
  function raGetMicroinverterRatio(miSpec) {
    if (miSpec && typeof miSpec.inputsPerUnit === 'number' && miSpec.inputsPerUnit >= 1) return Math.round(miSpec.inputsPerUnit);
    if (miSpec && typeof miSpec.modulesPerUnit === 'number' && miSpec.modulesPerUnit >= 1) return Math.round(miSpec.modulesPerUnit);
    const txt = (((miSpec && miSpec.model) || '') + ' ' + ((miSpec && miSpec.type) || '')).toLowerCase();
    if (txt.includes('4-en-1') || txt.includes('4 módulos') || txt.includes('4 modulos') || txt.includes('1600') || txt.includes('2000') || txt.includes('quad')) return 4;
    if (txt.includes('2-en-1') || txt.includes('2 módulos') || txt.includes('2 modulos') || txt.includes('dual') || txt.includes('800')) return 2;
    return 1;
  }

  /**
   * Cálculo consolidado de protección diferencial AC (REBT ITC-BT-40 / IEC 62109-2).
   * Calibre mínimo 25 A; Clase B si inversor sin transformador sin certificación RCMU <=6mA DC,
   * o en trifásico / potencia > 10 kW; Clase A-SI en microinversor o RCMU certificado monofásico <= 10 kW.
   */
  function raResolveRcdSpec(opts = {}) {
    const igaIn = Number(opts.igaIn) || 25;
    const isThreePhase = Boolean(opts.isThreePhase);
    const totalAcKw = Number(opts.totalAcKw) || 0;
    const topo = opts.topology || (typeof root !== 'undefined' && root.solarProjectConfig ? root.solarProjectConfig.selectedTopology : 'inverter');
    const inv = opts.inv || null;
    const rcmuCertified = (opts.rcmuCertified !== undefined)
      ? Boolean(opts.rcmuCertified)
      : Boolean(inv && (inv.rcmu === true || inv.hasRcmu === true || inv.rcmuCertified === true || inv.rcmuIntegrated === true));
    const isTransformerIsolatedMicro = (topo === 'microinverter');
    // IEC 62109-2 / REBT ITC-BT-40: Si el inversor integra supervisión RCMU certificada (corte < 6 mA DC)
    // o es microinversor con aislamiento galvánico HF, se admite Clase A-SI; solo se exige Clase B si carece de RCMU o lo fuerza opts.forceClassB.
    const requiresClassB = Boolean(opts.forceClassB) || (!isTransformerIsolatedMicro && !rcmuCertified);
    const rcdType = requiresClassB ? 'Clase B' : 'Clase A-SI';
    const sensMa = (opts.esIndustrial || (isThreePhase && (igaIn >= 63 || totalAcKw > 15.0))) ? 300 : 30;
    return {
      inA: Math.max(igaIn, 25),
      rcdType,
      sensibilidadMa: sensMa,
      rcmuCertified
    };
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
      const invPhases = raInverterPhases(inv);
      const isInvSinglePhase = (invPhases === 1);
      const isInvThreePhase = (invPhases === 3);

      if (gridSupply === 'single_phase' && isInvThreePhase) {
        return;
      }

      const maxAllowedOverload = inv.maxOverload || 1.35;
      // [AUD-2026 · H1] Los llamadores pasaban tempMinC/tempMaxCellC como claves de nivel
      // superior que el motor ignoraba (solo leía options.climParams). Ahora se traducen:
      // si vienen definidas, llegan al cálculo; si no, el motor aplica su Tmin zonal CTE.
      const climParams = options.climParams || {
        Tmin: options.tempMinC,
        TmaxCell: options.tempMaxCellC
      };
      const limits = calculateDynamicMPPTStringLimits(moduleSpec, inv, climParams);
      const _maxModsPerString = limits.Ns_max || 18;
      const _minModsPerString = limits.Ns_min || 5;
      const _modsPerString = options.modulesPerString || _maxModsPerString;
      const isMLPE = (options.selectedTopology === 'optimizer' || options.selectedTopology === 'microinverter');
      // Con Optimizadores DC (MLPE), los módulos de distintos faldones pueden conectarse en serie en la misma cadena
      // sin pérdidas por desadaptación ("mismatch"). Por tanto, el número de strings requeridos no está inflado por el número de orientaciones.
      const _nStrings = isMLPE
        ? Math.max(1, Math.ceil(totalPanels / _modsPerString))
        : Math.max(distinctOrientations, Math.ceil(totalPanels / _modsPerString));
      const _inputsPerMppt = inv.inputsPerMppt || 1;
      const _mpptCount = inv.mppt || inv.mpptCount || 2;

      // Evaluador interno de viabilidad técnica y normativa para un número de unidades invCount
      function evaluateConfiguration(invCount) {
        const actualOverload = totalKwp / (invCount * inv.kw);
        const _totalMppts = _mpptCount * invCount;
        const _stringsPerMppt = Math.max(1, Math.ceil(_nStrings / _totalMppts));
        const hasEnoughMpptInputs = (_stringsPerMppt <= _inputsPerMppt);
        const _iscPerMppt = (moduleSpec.isc || 14.0) * 1.25 * _stringsPerMppt;
        const _impPerMppt = (moduleSpec.imp || 13.0) * _stringsPerMppt;
        const isCurrentSafe = !inv.iMaxScA || (_iscPerMppt <= inv.iMaxScA);
        const hasImpClipping = !!(inv.iMaxOperA && _impPerMppt > inv.iMaxOperA);

        // Art. 12.2 RD 1699/2011 (modificado por RD 244/2019) y REBT ITC-BT-40:
        // 1) Si la potencia nominal AC supera 15 kW, la conexión será obligatoriamente trifásica.
        // 2) En conexión trifásica, la diferencia entre fases no debe superar 5 kW (<= 5.0 kW admisible).
        const exceedsSinglePhaseLimit = (gridSupply === 'single_phase' && ((invCount * inv.kw) > 15.0));
        const maxPhaseUnits = Math.ceil(invCount / 3);
        const minPhaseUnits = Math.floor(invCount / 3);
        const maxPhaseDeltaKw = (maxPhaseUnits - minPhaseUnits) * (inv.kw || 0);
        const hasPhaseUnbalance = (gridSupply === 'three_phase' && isInvSinglePhase && maxPhaseDeltaKw > 5.0);

        const isMLPE = (options.selectedTopology === 'optimizer' || options.selectedTopology === 'microinverter');
        const effectiveOrientations = isMLPE ? Math.min(distinctOrientations, 2) : distinctOrientations;
        const _minActiveStrings = Math.max(invCount, effectiveOrientations);
        const isVoltageSafe = options.modulesPerString ?
          (options.modulesPerString <= limits.Ns_max && options.modulesPerString >= limits.Ns_min) :
          (limits.Ns_max >= limits.Ns_min && (totalPanels === 0 || Math.floor(totalPanels / _minActiveStrings) >= limits.Ns_min));

        // En topología con Optimizadores DC (MLPE), los optimizadores desacoplan faldones y orientaciones,
        // por lo que no es obligatorio tener 1 MPPT por cada faldón/orientación física.
        const hasEnoughMppts = isMLPE ? (_totalMppts >= 1) : (_totalMppts >= distinctOrientations);

        // Criterio de fragmentación máxima admisible según potencia unitaria
        const maxUnitsAllowed = inv.kw <= 5.0 ? 3 : (inv.kw <= 10.0 ? 4 : (inv.kw <= 25.0 ? 6 : 8));
        const isExcessiveFragmentation = invCount > maxUnitsAllowed;

        // Filtro de viabilidad técnico-económica (Anti-Sobredimensionamiento):
        // En instalaciones modulares (invCount >= 2), se exige ratio DC/AC >= 75% para evitar
        // multiplicar inversores de gran potencia que quedarían infrautilizados.
        const minAcceptableRatio = invCount > 1 ? 0.75 : 0.65;

        const isMatch = !isExcessiveFragmentation &&
          actualOverload >= minAcceptableRatio &&
          actualOverload <= maxAllowedOverload &&
          hasEnoughMpptInputs &&
          isCurrentSafe &&
          isVoltageSafe &&
          !hasPhaseUnbalance &&
          !exceedsSinglePhaseLimit;

        if (!isMatch) return null;

        return {
          inverter: inv,
          count: invCount,
          overloadPct: parseFloat((actualOverload * 100).toFixed(1)),
          totalAcKw: Math.round(invCount * inv.kw * 10) / 10,
          mpptCount: _totalMppts,
          hasEnoughMppts: hasEnoughMppts,
          hasImpClipping: hasImpClipping,
          redundancyPct: invCount > 1 ? parseFloat(((invCount - 1) / invCount * 100).toFixed(1)) : 0,
          isDistributed: invCount > 1,
          totalCostEur: invCount * (inv.price || 1500)
        };
      }

      // 1) Evaluar como opción centralizada (1x)
      const singleMatch = evaluateConfiguration(1);
      if (singleMatch) {
        compatible.push(singleMatch);
      }

      // 2) Evaluar como opción modular distribuida (Nx con N >= 2)
      // Se calcula cuántos equipos hacen falta para satisfacer la potencia instalada
      const targetModularUnits = Math.max(2, Math.ceil(totalKwp / (inv.kw * 1.25)));
      if (targetModularUnits >= 2) {
        let multiMatch = evaluateConfiguration(targetModularUnits);
        if (!multiMatch && (totalKwp / (targetModularUnits * inv.kw)) > maxAllowedOverload) {
          multiMatch = evaluateConfiguration(targetModularUnits + 1);
        }
        if (multiMatch) {
          if (!compatible.some(c => c.inverter.id === inv.id && c.count === multiMatch.count)) {
            compatible.push(multiMatch);
          }
        }
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
          const isInvThreePhase = (raInverterPhases(inv) === 3);
          if (gridSupply === 'single_phase' && isInvThreePhase) countPhaseMismatch++;
          const _modsPerString = options.modulesPerString || 12;
          const _nStrings = Math.max(1, Math.ceil(totalPanels / _modsPerString));
          const _mpptCount = inv.mppt || inv.mpptCount || 2;
          const _invCount = Math.max(1, Math.round(totalKwp / (inv.kw * 1.15)));
          const _stringsPerMppt = Math.max(1, Math.ceil(_nStrings / (_mpptCount * _invCount)));
          const _isc = (moduleSpec.isc || 14.0) * 1.25 * _stringsPerMppt;
          if (inv.iMaxScA && _isc > inv.iMaxScA) countCurrentMismatch++;
        });

        if (gridSupply === 'single_phase' && totalKwp > 22.5) {
          bottleneckReason = `Potencia instalada de ${totalKwp.toFixed(1)} kWp superior a 22.5 kWp (> 15 kW nominales AC con sobrecarga máx 1.50): el Art. 12.2 del RD 1699/2011 (modificado por RD 244/2019) exige conexión trifásica con desequilibrio entre fases ≤ 5 kW.`;
        } else if (countPhaseMismatch === catalog.length) {
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
      const isThreePhase = (gridSupply === 'three_phase' || (gridSupply !== 'single_phase' && totalKwp > 6.0) || totalKwp > 22.5);
      const targetOverload = 1.18;
      let idealKw = Math.max(1.0, Math.round((totalKwp / targetOverload) * 10) / 10);
      if (gridSupply === 'single_phase' && idealKw > 15.0) {
        idealKw = 15.0; // RD 1699/2011 Art. 12.2: Límite nominal de 15 kW en AC para monofásica
      }
      let invCount = 1;
      let unitKw = idealKw;

      if (idealKw > 120.0) {
        invCount = Math.ceil(idealKw / 100.0);
        unitKw = Math.round((idealKw / invCount) * 10) / 10;
      }

      const isMLPEVirtual = (options.selectedTopology === 'optimizer' || options.selectedTopology === 'microinverter');
      const mpptReq = isMLPEVirtual ? 2 : Math.max(distinctOrientations, isThreePhase ? (unitKw >= 25 ? 4 : 2) : 2);
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
        phases: isThreePhase ? 3 : 1,
        type: isThreePhase ? ((unitKw * invCount) > 15.0 ? 'Trifásico (RD 1699/2011 Art. 12.2)' : 'Trifásico Industrial') : 'Monofásico Residencial',
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

    // Separar candidatos centralizados (1x) y modulares (Nx con N >= 2)
    const singleCandidates = compatible.filter(c => c.count === 1);
    const multiCandidates = compatible.filter(c => c.count >= 2);

    singleCandidates.sort((a, b) => {
      if (a.hasEnoughMppts !== b.hasEnoughMppts) return a.hasEnoughMppts ? -1 : 1;
      const clipA = a.hasImpClipping ? 8 : 0;
      const clipB = b.hasImpClipping ? 8 : 0;
      // Ponderar proximidad al ratio óptimo (118%), ausencia de clipping y coste económico
      const costPenaltyA = (a.totalCostEur || 1500) / 600;
      const costPenaltyB = (b.totalCostEur || 1500) / 600;
      const scoreA = Math.abs(a.overloadPct - 118) + clipA + costPenaltyA;
      const scoreB = Math.abs(b.overloadPct - 118) + clipB + costPenaltyB;
      return scoreA - scoreB;
    });

    multiCandidates.sort((a, b) => {
      if (a.hasEnoughMppts !== b.hasEnoughMppts) return a.hasEnoughMppts ? -1 : 1;
      // En suministro trifásico, priorizar inversores nativos trifásicos sobre agrupar 3 monofásicos de alto coste
      const phasePenaltyA = (gridSupply === 'three_phase' && a.inverter && a.inverter.phases === 1) ? 20 : 0;
      const phasePenaltyB = (gridSupply === 'three_phase' && b.inverter && b.inverter.phases === 1) ? 20 : 0;
      const fragPenaltyA = (a.count > 3 ? (a.count - 3) * 5 : 0) + (a.hasImpClipping ? 8 : 0) + phasePenaltyA;
      const fragPenaltyB = (b.count > 3 ? (b.count - 3) * 5 : 0) + (b.hasImpClipping ? 8 : 0) + phasePenaltyB;
      const costPenaltyA = (a.totalCostEur || 2500) / 600;
      const costPenaltyB = (b.totalCostEur || 2500) / 600;
      const scoreA = Math.abs(a.overloadPct - 118) + fragPenaltyA + costPenaltyA;
      const scoreB = Math.abs(b.overloadPct - 118) + fragPenaltyB + costPenaltyB;
      return scoreA - scoreB;
    });

    // Ordenar compatible global preservando compatibilidad y penalizando fragmentación innecesaria
    compatible.sort((a, b) => {
      if (a.hasEnoughMppts !== b.hasEnoughMppts) return a.hasEnoughMppts ? -1 : 1;
      // Penalización equilibrada a multi-inversor frente a 1 solo equipo
      const countPenaltyA = (a.count - 1) * 25;
      const countPenaltyB = (b.count - 1) * 25;
      const phasePenaltyA = (gridSupply === 'three_phase' && a.inverter && a.inverter.phases === 1) ? 15 : 0;
      const phasePenaltyB = (gridSupply === 'three_phase' && b.inverter && b.inverter.phases === 1) ? 15 : 0;
      const costPenaltyA = (a.totalCostEur || 1500) / 500;
      const costPenaltyB = (b.totalCostEur || 1500) / 500;
      const scoreA = Math.abs(a.overloadPct - 118) + countPenaltyA + (a.hasImpClipping ? 8 : 0) + phasePenaltyA + costPenaltyA;
      const scoreB = Math.abs(b.overloadPct - 118) + countPenaltyB + (b.hasImpClipping ? 8 : 0) + phasePenaltyB + costPenaltyB;
      return scoreA - scoreB;
    });

    // 1) Opción A: Inversor Centralizado (1x)
    let singleInvMatch = singleCandidates[0] || (virtualInverterMatch && virtualInverterMatch.count === 1 ? virtualInverterMatch : null);
    if (!singleInvMatch && totalKwp > 0) {
      const estAcKwA = totalKwp / 1.18;
      const isThreePhase = (gridSupply === 'three_phase' || (gridSupply !== 'single_phase' && estAcKwA > 6.0) || estAcKwA > 15.0);
      let unitKwA = Math.max(1.0, Math.round(estAcKwA * 10) / 10);
      if (gridSupply === 'single_phase' && unitKwA > 15.0) {
        unitKwA = 15.0; // RD 1699/2011 Art. 12.2: Límite nominal de 15 kW en AC para monofásica
      }
      const mpptReqA = Math.max(distinctOrientations, isThreePhase ? (unitKwA >= 25 ? 4 : 2) : 2);
      const estPriceA = isThreePhase
        ? Math.round(unitKwA * (unitKwA >= 50 ? 45 : (unitKwA >= 20 ? 55 : 75)))
        : Math.round(200 + unitKwA * 110);
      const commModelsA = getSuggestedCommercialModels(unitKwA, isThreePhase ? 'three_phase' : 'single_phase');
      singleInvMatch = {
        inverter: {
          id: `inv_virtual_1x_${Math.round(unitKwA)}kw`,
          brand: 'Paramétrico (Auto-Generado)',
          model: `Inversor Central ${unitKwA} kW (${mpptReqA} MPPT)`,
          kw: unitKwA,
          phases: isThreePhase ? 3 : 1,
          type: isThreePhase ? (unitKwA > 15.0 ? 'Trifásico (RD 1699/2011 Art. 12.2)' : 'Trifásico') : 'Monofásico',
          mppt: mpptReqA,
          vDcMax: isThreePhase ? 1100 : 600,
          price: estPriceA,
          isVirtual: true,
          suggestedCommercialModels: commModelsA
        },
        count: 1,
        overloadPct: parseFloat((totalKwp / unitKwA * 100).toFixed(1)),
        totalAcKw: unitKwA,
        mpptCount: mpptReqA,
        hasEnoughMppts: true,
        redundancyPct: 0,
        isDistributed: false,
        totalCostEur: estPriceA,
        isVirtual: true
      };
    }

    // 2) Opción B: Modular Distribuida (Nx con N >= 2 de equipos menores)
    let multiInvMatch = multiCandidates[0];
    if (!multiInvMatch && totalKwp > 0) {
      const estAcKwB = totalKwp / 1.18;
      const isThreePhase = (gridSupply === 'three_phase' || (gridSupply !== 'single_phase' && estAcKwB > 6.0) || estAcKwB > 15.0);
      const nUnitsB = totalKwp > 60.0 ? Math.max(2, Math.ceil(totalKwp / 45.0)) : 2;
      let unitKwB = Math.max(1.0, Math.round((totalKwp / (nUnitsB * 1.18)) * 10) / 10);
      if (gridSupply === 'single_phase' && (unitKwB * nUnitsB) > 15.0) {
        unitKwB = Math.round((15.0 / nUnitsB) * 10) / 10;
      }
      const mpptReqB = Math.max(2, Math.ceil(distinctOrientations / nUnitsB));
      const estPriceB = isThreePhase
        ? Math.round(unitKwB * (unitKwB >= 50 ? 45 : (unitKwB >= 20 ? 55 : 75)))
        : Math.round(200 + unitKwB * 110);
      const commModelsB = getSuggestedCommercialModels(unitKwB, isThreePhase ? 'three_phase' : 'single_phase');
      multiInvMatch = {
        inverter: {
          id: `inv_virtual_${nUnitsB}x_${Math.round(unitKwB)}kw`,
          brand: 'Paramétrico (Auto-Generado)',
          model: `Inversor Modular ${unitKwB} kW (${mpptReqB} MPPT)`,
          kw: unitKwB,
          phases: isThreePhase ? 3 : 1,
          type: isThreePhase ? ((unitKwB * nUnitsB) > 15.0 ? 'Trifásico (RD 1699/2011 Art. 12.2)' : 'Trifásico') : 'Monofásico',
          mppt: mpptReqB,
          vDcMax: isThreePhase ? 1100 : 600,
          price: estPriceB,
          isVirtual: true,
          suggestedCommercialModels: commModelsB
        },
        count: nUnitsB,
        overloadPct: parseFloat((totalKwp / (unitKwB * nUnitsB) * 100).toFixed(1)),
        totalAcKw: Math.round(unitKwB * nUnitsB * 10) / 10,
        mpptCount: mpptReqB * nUnitsB,
        hasEnoughMppts: true,
        redundancyPct: parseFloat(((nUnitsB - 1) / nUnitsB * 100).toFixed(1)),
        isDistributed: true,
        totalCostEur: estPriceB * nUnitsB,
        isVirtual: true
      };
    }

    const scenarioC = {
      type: 'MLPE',
      description: 'Microinversores 2-en-1 o Arquitectura Optimizada',
      estimatedUnits: Math.ceil(totalPanels / 2),
      totalAcKw: totalKwp * 0.95,
      estimatedCostEur: Math.ceil(totalPanels / 2) * 175
    };

    // Matriz de decisión de Topología según Física Solar, Sombras y Escala de Proyecto:
    let recommendedTopology = options.selectedTopology || 'inverter';
    let topologyRationale = 'Campo solar despejado: Inversor central de alta eficiencia con strings balanceados.';

    const isCommercialIndustrial = totalKwp > 25.0;
    const isMaxRoofFilling = (options.selectedObjective === 'max_roof');

    if (!options.selectedTopology) {
      if (shading) {
        if (shading.recommendation === 'microinverters_or_full_mlpe') {
          if (isCommercialIndustrial || isMaxRoofFilling) {
            recommendedTopology = 'inverter';
            topologyRationale = isCommercialIndustrial
              ? `Instalación Industrial (${totalKwp.toFixed(1)} kWp) con sombreado: Inversores String Multi-MPPT recomendados (descentralización MLPE con microinversores no viable a escala industrial).`
              : `Objetivo de Llenado Máximo con sombreado: Inversor String Multi-MPPT con particionado de strings para maximizar potencia de cubierta.`;
          } else {
            recommendedTopology = 'microinverter';
            topologyRationale = 'Sombreado severo en >35% del campo: Topología descentralizada con Microinversores para desacoplar el sombreado mutuo.';
          }
        } else if (shading.recommendation === 'selective_optimizers') {
          recommendedTopology = 'optimizer';
          topologyRationale = `Sombreado parcial en ${shading.criticalLossPanelsCount || 'varios'} módulos: Inversor de red con Optimizadores DC selectivos (Tigo / Huawei).`;
        } else if (distinctOrientations >= 3) {
          if (isCommercialIndustrial) {
            recommendedTopology = 'inverter';
            topologyRationale = `Cubierta C&I con ${distinctOrientations} orientaciones: Inversor String Multi-MPPT con canales MPPT dedicados por orientación.`;
          } else {
            recommendedTopology = 'microinverter';
            topologyRationale = `Cubierta compleja con ${distinctOrientations} orientaciones distintas: Los microinversores proporcionan seguimiento MPPT individual por módulo.`;
          }
        }
      } else if (distinctOrientations >= 3) {
        if (isCommercialIndustrial) {
          recommendedTopology = 'inverter';
          topologyRationale = `Cubierta C&I con ${distinctOrientations} orientaciones: Inversores String Multi-MPPT con canales MPPT dedicados por orientación.`;
        } else {
          recommendedTopology = 'microinverter';
          topologyRationale = `Cubierta con ${distinctOrientations} faldones de orientación distinta: Microinversores recomendados para evitar pérdidas por mismatch de string.`;
        }
      }
    } else {
      if (options.selectedTopology === 'inverter') {
        topologyRationale = (singleInvMatch && singleInvMatch.count > 1) || (multiInvMatch && multiInvMatch.count > 1)
          ? `Topología String Central activa: Distribución modular balanceada con canales MPPT independientes (${totalKwp.toFixed(1)} kWp).`
          : `Topología String Central activa: Inversor central de alta eficiencia con strings balanceados (${totalKwp.toFixed(1)} kWp).`;
      } else if (options.selectedTopology === 'optimizer') {
        topologyRationale = `Topología de Optimizadores DC activa: Inversores string coordinados con electrónica MLPE a nivel de módulo.`;
      } else if (options.selectedTopology === 'microinverter') {
        topologyRationale = `Topología MLPE Descentralizada activa: Microinversores para seguimiento y conversión independiente panel a panel.`;
      }
    }

    return {
      totalKwp: totalKwp,
      distinctOrientations: distinctOrientations,
      compatible: compatible,
      bestCatalogMatch: compatible[0] || null,
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
   * Dimensiona las protecciones eléctricas de continua (DC) y alterna (AC)
   * según REBT ITC-BT-40, ITC-BT-24, IEC 60947-3, IEC 61643-31, IEC 62548 y UNE-EN 50550.
   * @param {Object} params Parámetros de la instalación fotovoltaica
   * @returns {Object} Desglose completo de protecciones de continua y alterna
   */
  function calculateElectricalProtections(params = {}) {
    const mod = params.module || {};
    const inv = params.inverter || {};
    const clim = params.climParams || {};

    const stringModules = params.stringModules || params.ns || 12;
    const parallelStrings = Math.max(1, params.parallelStrings || params.stringsPerMppt || 1);
    const isc = params.isc || mod.isc || 14.0;
    const voc = params.voc || mod.voc || 49.5;

    // Tensión Voc en frío (-10°C / -14°C según zonificación CTE DB-HE / IEC 62548)
    let vocCold = params.vocCold || params.voc_cold;
    if (!vocCold) {
      const limits = calculateDynamicMPPTStringLimits({ ...mod, voc: voc }, inv, clim);
      vocCold = (limits && limits.Voc_Tmin) ? (limits.Voc_Tmin * stringModules) : (voc * 1.14 * stringModules);
    } else if (params.vocColdPerModule) {
      vocCold = params.vocCold * stringModules;
    }

    // 1. PROTECCIONES DC (Por cada entrada / canal MPPT)
    // Seccionador de corte en carga DC (IEC 60947-3 DC-PV2):
    // Ue >= 1.20 * Voc_cold (coeficiente de seguridad 1.20)
    const ueVocMin = vocCold * 1.20;
    const DC_VOLT_RATINGS = [600, 1000, 1200, 1500];
    const dcSwitchUe = DC_VOLT_RATINGS.find(v => v >= ueVocMin) || 1500;

    // Ie >= 1.56 * Isc * N_strings_paralelo (IEC 62548 cláusula 5.2.1: 1.25 seguridad × 1.25 sobreirradiación/albedo = 1.5625)
    const ieMin = isc * 1.56 * parallelStrings;
    const DC_CURR_RATINGS = [16, 25, 32, 40, 63, 80, 100, 125];
    const dcSwitchIe = DC_CURR_RATINGS.find(a => a >= ieMin) || Math.ceil(ieMin);

    const dcSwitch = {
      tipo: 'Seccionador de corte en carga DC',
      categoria: 'DC-PV2 (IEC 60947-3)',
      ueV: dcSwitchUe,
      ieA: dcSwitchIe,
      polos: '2P (bipolar)',
      descripcion: `Seccionador DC 2P ${dcSwitchIe}A / ${dcSwitchUe}V DC-PV2`
    };

    // Descargador de sobretensiones transitorias DC (SPD Tipo 2 estándar, o Tipo 1+2 si existe pararrayos exterior CTE SUA 8 / UNE-EN 62305)
    // Ucpv >= 1.20 * Voc_cold
    const hasLightningRod = (params.hasExternalLightningRod !== undefined)
      ? Boolean(params.hasExternalLightningRod)
      : Boolean(typeof root !== 'undefined' && root.solarProjectConfig && root.solarProjectConfig.hasExternalLightningRod);
    const spdDcUcpv = DC_VOLT_RATINGS.find(v => v >= ueVocMin) || 1200;
    const dcSpd = {
      tipo: 'Descargador de sobretensiones transitorias DC (SPD)',
      clase: hasLightningRod ? 'Tipo 1+2 (Clase I+II · Edificio con pararrayos)' : 'Clase II (Tipo 2) según IEC 61643-31',
      ucpvV: spdDcUcpv,
      inKa: 20,
      imaxKa: hasLightningRod ? 50 : 40,
      iimpKa: hasLightningRod ? 12.5 : 0,
      polos: '2P + Tierra por entrada MPPT (Y-configuration)',
      descripcion: hasLightningRod
        ? `SPD DC Tipo 1+2 Ucpv ${spdDcUcpv}V (Iimp=12.5kA / In=20kA)`
        : `SPD DC Clase II Ucpv ${spdDcUcpv}V (In=20kA / Imax=40kA)`
    };

    // Fusibles gPV de protección contra corrientes inversas (IEC 62548 cláusula 6.5.3 / IEC 60269-6):
    // Solo requeridos si hay >= 3 strings en paralelo por MPPT (1.56 * Isc <= In <= 2.4 * Isc)
    let dcFuses = null;
    const modMaxFuse = mod.seriesFuseRating || mod.maxOcpr || 25;
    const fuseInMin = Math.ceil(isc * 1.56);
    const fuseInMax = Math.min(Math.floor(isc * 2.4), modMaxFuse);
    const FUSE_RATINGS = [12, 15, 16, 20, 25, 30, 32];
    const fuseRating = FUSE_RATINGS.find(f => f >= fuseInMin && f <= fuseInMax) || fuseInMin;

    if (parallelStrings >= 3) {
      dcFuses = {
        requerido: true,
        tipo: 'Fusibles gPV cilíndricos 10x38',
        inA: fuseRating,
        ueV: dcSwitchUe,
        cantidad: parallelStrings * 2, // en polo positivo y polo negativo
        norma: 'IEC 60269-6 / IEC 62548',
        descripcion: `Fusibles gPV 10x38 ${fuseRating}A / ${dcSwitchUe}V (ambos polos)`
      };
    } else {
      dcFuses = {
        requerido: false,
        inA: fuseRating,
        motivo: 'No requerido: <= 2 strings en paralelo por MPPT (corriente inversa admisible segura según IEC 62548)',
        descripcion: 'Sin fusibles (configuración <= 2 strings en paralelo)'
      };
    }

    // Coordinación frente a la corriente de cortocircuito máxima admisible de la etapa MPPT del inversor
    const iscArrayMppt = parallelStrings * 1.25 * isc;
    const invMaxSc = inv.iMaxScA || (inv.maxShortCircuitCurrent ? inv.maxShortCircuitCurrent : null);
    const isInvScSafe = !invMaxSc || (iscArrayMppt <= invMaxSc);
    const mpptScCoordination = {
      isSafe: isInvScSafe,
      iscArrayMppt: Math.round(iscArrayMppt * 10) / 10,
      invMaxSc: invMaxSc,
      descripcion: isInvScSafe
        ? `Coordinación MPPT OK (Isc array ${iscArrayMppt.toFixed(1)}A <= Isc max inv ${invMaxSc || 'N/A'}A)`
        : `⚠️ Isc array (${iscArrayMppt.toFixed(1)}A) supera la corriente máxima de entrada MPPT (${invMaxSc}A)`
    };

    // 2. PROTECCIONES AC (Lado de evacuación / conexión a red)
    const gridSupply = params.gridSupply || (params.isThreePhase ? 'three_phase' : (raInverterPhases(inv) === 3 ? 'three_phase' : 'single_phase'));
    const isThreePhase = gridSupply === 'three_phase';
    const vac = isThreePhase ? 400 : 230;

    let iacMax = params.iacMax || inv.iAcMax || inv.maxAcCurrent;
    if (!iacMax) {
      const pNomKw = params.pAcNomKw || inv.kw || 5.0;
      iacMax = isThreePhase
        ? (pNomKw * 1000.0) / (Math.sqrt(3) * vac * 0.95)
        : (pNomKw * 1000.0) / (vac * 0.95);
    }

    // Interruptor General Automático (IGA AC / MCB según UNE-EN 60898-1):
    // In >= 1.25 * Iac_max
    const igaInMin = iacMax * 1.25;
    const AC_CURR_RATINGS = [10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125];
    const igaIn = AC_CURR_RATINGS.find(a => a >= igaInMin) || Math.ceil(igaInMin);
    const poderCorteKa = isThreePhase && igaIn >= 32 ? 10 : 6;
    const polosAc = isThreePhase ? '4P (3F+N)' : '2P (1F+N)';

    const acIga = {
      tipo: 'Interruptor General Automático (IGA)',
      curva: 'C',
      inA: igaIn,
      polos: polosAc,
      poderCorteKa: poderCorteKa,
      norma: 'UNE-EN 60898-1 / UNE-EN 60947-2',
      descripcion: `IGA Curva C ${polosAc} ${igaIn}A / ${poderCorteKa}kA`
    };

    // Interruptor Diferencial (RCD AC según REBT ITC-BT-40 e IEC 62109-2):
    // Si el inversor es sin transformador y no tiene separación galvánica:
    // Requiere Tipo B, O Tipo A Superinmunizado (A-SI / F) si el fabricante certifica que no inyecta CC > 6mA (RCMU).
    // [AUD-2026 · C-04] No se asume RCMU: sin dato explícito del datasheet, la protección
    // correcta para un inversor sin transformador es Tipo B. Antes se asumía "certificado"
    // para cualquier equipo y se especificaba Tipo A-SI sin verificar.
    const rcdSpec = raResolveRcdSpec({
      igaIn,
      isThreePhase,
      totalAcKw: params.pAcNomKw || inv.kw || 5.0,
      topology: params.topology,
      inv,
      rcmuCertified: params.rcmuCertified,
      esIndustrial: params.esIndustrial
    });
    const rcdType = rcdSpec.rcdType;
    const sensibilidadMa = rcdSpec.sensibilidadMa;

    const acRcd = {
      tipo: 'Interruptor Diferencial (RCD)',
      clase: rcdType,
      inA: rcdSpec.inA, // Calibre >= IGA y mínimo 25 A
      sensibilidadMa: sensibilidadMa,
      polos: polosAc,
      norma: 'REBT ITC-BT-40 / IEC 62109-2 / UNE-EN 61008-1',
      descripcion: `Diferencial ${polosAc} ${rcdSpec.inA}A / ${sensibilidadMa}mA ${rcdType}`
    };

    // Descargador de sobretensiones AC (SPD Clase II o Tipo 1+2 + POP según UNE-EN 50550 / REBT ITC-BT-23):
    const acSpd = {
      tipo: 'Protección contra sobretensiones transitorias y permanentes (SPD + POP)',
      clase: hasLightningRod ? 'Tipo 1+2 (Clase I+II) + Bobina POP permanentes' : 'Clase II (Tipo 2) transitorias + Bobina de disparo POP permanentes',
      ucV: isThreePhase ? 440 : 275,
      inKa: 20,
      imaxKa: hasLightningRod ? 50 : 40,
      iimpKa: hasLightningRod ? 12.5 : 0,
      polos: polosAc,
      asociadoA: 'Bobina de emisión conectada al IGA para desenganche automático',
      norma: 'UNE-EN 50550 / UNE-EN 61643-11 / REBT ITC-BT-23',
      descripcion: hasLightningRod
        ? `SPD AC Tipo 1+2 ${polosAc} (Iimp=12.5kA / In=20kA) + Protector Permanente (POP)`
        : `SPD AC Clase II ${polosAc} (In=20kA / Imax=40kA) + Protector Permanente (POP)`
    };

    return {
      dc: {
        seccionador: dcSwitch,
        spd: dcSpd,
        fusibles: dcFuses,
        mpptScCoordination: mpptScCoordination,
        vocCold: parseFloat(vocCold.toFixed(1)),
        iscString: parseFloat(isc.toFixed(2))
      },
      ac: {
        iga: acIga,
        rcd: acRcd,
        spdPop: acSpd,
        iacMax: parseFloat(iacMax.toFixed(2)),
        isThreePhase: isThreePhase
      }
    };
  }

  /**
   * Calcula la caída de tensión y valida el cumplimiento según REBT ITC-BT-40 e IEC 62548.
   * Límite normativo reglamentario: ΔV <= 1.5% tanto en continua (CC) como en alterna (CA).
   */
  function calculateVoltageDrop({ lengthM, currentA, sectionMm2, voltageV, isThreePhase = false, isAC = false, conductor = 'Cu', tempC = 90, cosPhi = 0.95, reactancePerKm = 0.08 }) {
    // [AUD-2026 · C-03] Resistividad corregida por temperatura de servicio real:
    // ρ(T) = ρ20 · (1 + α·(T−20)). Antes se usaba ρ a 20 °C para cualquier T < 90 °C,
    // subestimando la caída de tensión ~19 % en el caso dimensionante (celda a 70 °C).
    const rhoBase = (conductor === 'Al') ? 0.028264 : (ELEC_CONSTANTS.RHO_CU_20 || 0.017241);
    const alphaT = (conductor === 'Al') ? 0.00403 : 0.00393;
    const tCond = Math.max(20, Math.min(90, (typeof tempC === 'number' && isFinite(tempC)) ? tempC : 90));
    const rho = rhoBase * (1 + alphaT * (tCond - 20));
    const factorPhase = (isAC && isThreePhase) ? Math.sqrt(3) : 2.0;
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
      // Continua DC: circuito bifilar cerrado (+ y -) -> factor 2.0 estricto
      deltaV = (2.0 * rho * l * i) / s;
    }

    const pct = (deltaV / Math.max(voltageV, 1.0)) * 100.0;
    return {
      deltaV: Math.round(deltaV * 100) / 100,
      pct: Math.round(pct * 100) / 100,
      valid: pct <= 1.5,
      limitPct: 1.5
    };
  }

  /**
   * [AUD-2026 · C-02] Criterio de caída de tensión en dos niveles, explícito:
   *   1) Cada tramo (DC y AC) ≤ 1,5 % — objetivo de diseño del proyecto.
   *   2) La suma DC+AC ≤ 2,5 % — restricción vinculante (evita sobretensiones >253 V
   *      en bornes AC y deja margen al ITC-BT-19).
   * Las dos condiciones se cumplen a la vez (AND). Antes el 1,5 % se atribuía a la
   * ITC-BT-40, que no fija ese valor: es criterio de proyecto sobre la guía de aplicación.
   */
  function calculateGlobalVoltageDrop(dcDropPct, acDropPct) {
    const dPct = (typeof dcDropPct === 'number' && isFinite(dcDropPct)) ? dcDropPct : 0;
    const aPct = (typeof acDropPct === 'number' && isFinite(acDropPct)) ? acDropPct : 0;
    const totalPct = dPct + aPct;
    const limitTotal = ELEC_CONSTANTS.DV_MAX_TOTAL_PCT;
    const limitTramo = ELEC_CONSTANTS.DV_MAX_DC_PCT;
    const isCompliant = totalPct <= limitTotal;
    const tramoOver = (dPct > limitTramo) || (aPct > limitTramo);
    return {
      dcDropPct: Math.round(dPct * 100) / 100,
      acDropPct: Math.round(aPct * 100) / 100,
      totalPct: Math.round(totalPct * 100) / 100,
      limitPct: limitTotal,
      limitTramoPct: limitTramo,
      valid: isCompliant,
      tramoValid: !tramoOver,
      // Caso incómodo: cada tramo cumple su 1,5 % pero la suma incumple el 2,5 % global.
      tramosExcedenTotal: (!tramoOver) && (totalPct > limitTotal),
      descripcion: isCompliant
        ? `Caída de tensión global OK (${totalPct.toFixed(2)} % ≤ ${limitTotal} % acumulado DC+AC; tramos ≤ ${limitTramo} % cada uno)`
        : `⚠️ Caída de tensión acumulada (${totalPct.toFixed(2)} %) excede el ${limitTotal} % (DC ${dPct.toFixed(2)} % + AC ${aPct.toFixed(2)} %); revisar sección o longitud`
    };
  }

  // [P0-MPPT] Auto-reasignación balanceada de strings entre canales MPPT.
  // Sustituye la política "faldón entero → canal fijo" (polyIdx % mpptCount) que
  // concentraba un tejado completo en un solo MPPT y desbordaba entradas físicas.
  // Estrategia: los strings de un mismo faldón permanecen en un canal si cabe entero
  // (first-fit); si no, se reparten string a string al canal con más hueco. El aviso de
  // sobrecarga (index.html, validación 7b) sigue activo cuando el total excede la capacidad.
  let _isRebalancingMPPT = false;
  let _lastRebalanceTimestamp = 0;
  let _lastRebalanceResult = null;

  /**
   * Clave determinista e invariante para identificar un módulo entre re-renderizados 3D.
   */
  function getPanelManualKey(p) {
    if (!p) return '';
    const pIdx = (p.polyIdx != null) ? p.polyIdx : 0;
    const lIdx = (typeof p.localIdx === 'number')
      ? p.localIdx
      : ((typeof p.layoutIndex === 'number') ? p.layoutIndex : (typeof p.pIdx === 'number' ? p.pIdx : 0));
    return String(pIdx) + ':' + String(lIdx);
  }

  /**
   * Aplica strings personalizados (uniones entre faldones o divisiones manuales)
   * definidos en window.solarProjectConfig.mpptManualConfig sobre un array de paneles.
   */
  function applyCustomStringsToPanels(panels) {
    if (!Array.isArray(panels) || panels.length === 0) return { applied: false, customCount: 0 };
    const cfg = (typeof window !== 'undefined' && window.solarProjectConfig && window.solarProjectConfig.mpptManualConfig)
      ? window.solarProjectConfig.mpptManualConfig
      : ((typeof root !== 'undefined' && root.solarProjectConfig && root.solarProjectConfig.mpptManualConfig)
        ? root.solarProjectConfig.mpptManualConfig : null);

    const hasCustom = !!(cfg && cfg.locked && Array.isArray(cfg.customStrings) && cfg.customStrings.length > 0);
    if (!hasCustom) {
      let restored = 0;
      panels.forEach(p => {
        if (!p || p._origStringName === undefined) return;
        p.stringName = p._origStringName;
        p.stringColor = p._origStringColor;
        p.pIdx = p._origPIdx;
        p.tag = p._origTag;
        if (p._origHasMLPE !== undefined) {
          p.hasMLPE = p._origHasMLPE;
          delete p._origHasMLPE;
        }
        delete p._origStringName;
        delete p._origStringColor;
        delete p._origPIdx;
        delete p._origTag;
        restored++;
      });
      return { applied: false, restored, customCount: 0 };
    }

    const byKey = new Map();
    panels.forEach(p => {
      if (!p || p.isGhost || p.deleted || p.disabled) return;
      byKey.set(getPanelManualKey(p), p);
    });

    let customCount = 0;
    cfg.customStrings.forEach((cs, idx) => {
      if (!cs || !cs.id || !Array.isArray(cs.panelKeys) || cs.panelKeys.length === 0) return;
      const matched = [];
      cs.panelKeys.forEach(k => {
        const panel = byKey.get(String(k));
        if (panel) matched.push(panel);
      });
      if (matched.length === 0) return;
      if (cs.reversed === true) matched.reverse();
      const color = cs.color || getPolylineStringColor(idx + 5);
      matched.forEach((p, pOrd) => {
        if (p._origStringName === undefined) {
          p._origStringName = p.stringName;
          p._origStringColor = p.stringColor;
          p._origPIdx = p.pIdx;
          p._origTag = p.tag;
          p._origHasMLPE = p.hasMLPE;
        }
        p.stringName = cs.id;
        p.stringColor = color;
        p.pIdx = pOrd;
        if (typeof cs.hasMLPE === 'boolean') {
          p.hasMLPE = cs.hasMLPE;
        }
        const prefix = (pOrd === 0) ? '[+ IN] ' : ((pOrd === matched.length - 1) ? '[- OUT] ' : '');
        p.tag = prefix + cs.id + ':' + String(pOrd + 1).padStart(2, '0');
      });
      customCount++;
    });

    return { applied: customCount > 0, customCount };
  }

  function rebalanceMPPTAssignment(panels) {
    if (_isRebalancingMPPT) return { changed: 0, reason: 'reentrancy_prevented' };

    // Throttle / cache inteligente de 80ms para evitar bloqueos continuos en transformaciones 3D masivas
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (!panels && (now - _lastRebalanceTimestamp < 80) && _lastRebalanceResult) {
      return _lastRebalanceResult;
    }

    _isRebalancingMPPT = true;
    _lastRebalanceTimestamp = now;
    try {
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
    applyCustomStringsToPanels(panels);
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
      if (!p || !p.stringName || p.isGhost || p.deleted || p.disabled) return;
      if (!byName.has(p.stringName)) {
        let tilt = typeof p.tiltDeg === 'number' ? p.tiltDeg : null;
        let az = typeof p.azimuthDeg === 'number' ? p.azimuthDeg : null;
        if ((tilt == null || az == null) && typeof window !== 'undefined' && window.WP && Array.isArray(window.WP.polylines)) {
          const poly = window.WP.polylines[p.polyIdx];
          if (poly) {
            if (tilt == null) tilt = (poly.roofInfo && typeof poly.roofInfo.tiltDeg === 'number') ? poly.roofInfo.tiltDeg : (poly.tiltDeg || 0);
            if (az == null) az = (poly.roofInfo && typeof poly.roofInfo.azimuthDeg === 'number') ? poly.roofInfo.azimuthDeg : (poly.azimuthDeg || 0);
          }
        }
        byName.set(p.stringName, {
          name: p.stringName,
          polyIdx: p.polyIdx,
          tilt: typeof tilt === 'number' && !isNaN(tilt) ? tilt : 0,
          az: typeof az === 'number' && !isNaN(az) ? az : 0
        });
        stringOrder.push(p.stringName);
      }
      if (!stringPanels.has(p.stringName)) stringPanels.set(p.stringName, []);
      stringPanels.get(p.stringName).push(p);
    });
    const totalStrings = stringOrder.length;
    if (totalStrings === 0) return { changed: 0, reason: 'sin_strings' };

    function areOrientationsHomogeneous(o1, o2) {
      if (!o1 || !o2) return true;
      const deltaTilt = Math.abs(o1.tilt - o2.tilt);
      let deltaAz = Math.abs(o1.az - o2.az);
      if (deltaAz > 180) deltaAz = 360 - deltaAz;
      return deltaTilt <= 5.0 && deltaAz <= 10.0;
    }

    function getAngleDiff(o1, o2) {
      if (!o1 || !o2) return 0;
      const deltaTilt = Math.abs(o1.tilt - o2.tilt);
      let deltaAz = Math.abs(o1.az - o2.az);
      if (deltaAz > 180) deltaAz = 360 - deltaAz;
      return deltaTilt + deltaAz;
    }

    // 2. Faldones en orden de primera aparición con sus strings
    const roofOrder = [];
    const roofStrings = new Map();
    stringOrder.forEach(n => {
      const s = byName.get(n);
      if (!roofStrings.has(s.polyIdx)) { roofStrings.set(s.polyIdx, []); roofOrder.push(s.polyIdx); }
      roofStrings.get(s.polyIdx).push(s.name);
    });

    // 3. Asignación balanceada por capacidad respetando homogeneidad MPPT (IEC 62548)
    //    Si existe candado manual activo (mpptManualConfig.locked), respetar primero los pines manuales.
    const remaining = new Array(mpptCount).fill(capPer);
    const channelStrings = Array.from({ length: mpptCount }, () => []);
    const channelOrientation = new Array(mpptCount).fill(null);
    const channelStrLen = new Array(mpptCount).fill(null);
    const assign = new Map();

    const manualCfg = (typeof window !== 'undefined' && window.solarProjectConfig && window.solarProjectConfig.mpptManualConfig)
      ? window.solarProjectConfig.mpptManualConfig
      : ((typeof root !== 'undefined' && root.solarProjectConfig && root.solarProjectConfig.mpptManualConfig)
        ? root.solarProjectConfig.mpptManualConfig : null);
    const isLocked = !!(manualCfg && manualCfg.locked);

    if (isLocked && manualCfg.stringToMppt && typeof manualCfg.stringToMppt === 'object') {
      stringOrder.forEach(n => {
        const reqCh = Number(manualCfg.stringToMppt[n]);
        if (Number.isInteger(reqCh) && reqCh >= 1 && reqCh <= mpptCount) {
          const chIdx = reqCh - 1;
          const sData = byName.get(n);
          const sLen = (stringPanels.get(n) || []).length;
          assign.set(n, reqCh);
          remaining[chIdx] = Math.max(0, remaining[chIdx] - 1);
          channelStrings[chIdx].push(n);
          if (channelOrientation[chIdx] === null && sData) {
            channelOrientation[chIdx] = { tilt: sData.tilt, az: sData.az };
            channelStrLen[chIdx] = sLen;
          }
        }
      });
    }

    roofOrder.forEach(pi => {
      const strs = roofStrings.get(pi).filter(n => !assign.has(n));
      if (strs.length === 0) return;
      const strLens = strs.map(n => (stringPanels.get(n) || []).length);
      const isHomogeneous = strLens.every(len => len === strLens[0]);
      const faldonOrientation = byName.get(strs[0]);

      // Si el faldón cabe entero en un canal compatible o vacío:
      let ch = -1;
      if (isHomogeneous || mpptCount === 1) {
        ch = remaining.findIndex((r, idx) => {
          if (r < strs.length) return false;
          if (channelOrientation[idx] === null) return true;
          return areOrientationsHomogeneous(channelOrientation[idx], faldonOrientation) &&
                 (channelStrLen[idx] === null || channelStrLen[idx] === strLens[0]);
        });
      }

      if (ch !== -1) {
        strs.forEach(n => {
          assign.set(n, ch + 1);
          remaining[ch] = Math.max(0, remaining[ch] - 1);
          channelStrings[ch].push(n);
        });
        if (channelOrientation[ch] === null) {
          channelOrientation[ch] = { tilt: faldonOrientation.tilt, az: faldonOrientation.az };
          channelStrLen[ch] = strLens[0];
        }
      } else {
        // Asignación string a string con preservación estricta de orientación
        strs.forEach(n => {
          const sData = byName.get(n);
          const sLen = (stringPanels.get(n) || []).length;
          let bestChannel = -1;

          // Prioridad 1: Canal ya asignado con orientación compatible, LONGITUD IDÉNTICA (ΔN = 0) y hueco disponible
          let bestScore = -Infinity;
          for (let c = 0; c < mpptCount; c++) {
            if (channelOrientation[c] !== null &&
                areOrientationsHomogeneous(channelOrientation[c], sData) &&
                (channelStrLen[c] === null || channelStrLen[c] === sLen) &&
                remaining[c] > 0) {
              const score = remaining[c];
              if (score > bestScore) {
                bestScore = score;
                bestChannel = c;
              }
            }
          }

          // Prioridad 2: Canal completamente vacío
          if (bestChannel === -1) {
            for (let c = 0; c < mpptCount; c++) {
              if (channelStrings[c].length === 0) {
                bestChannel = c;
                break;
              }
            }
          }

          // Prioridad 3: Canal compatible aunque esté saturado (sobrecarga en su misma orientación, priorizando ΔN = 0)
          if (bestChannel === -1) {
            let minAssigned = Infinity;
            // 3a. Primero buscar canal compatible con longitud idéntica
            for (let c = 0; c < mpptCount; c++) {
              if (channelOrientation[c] !== null && areOrientationsHomogeneous(channelOrientation[c], sData) && channelStrLen[c] === sLen) {
                if (channelStrings[c].length < minAssigned) {
                  minAssigned = channelStrings[c].length;
                  bestChannel = c;
                }
              }
            }
            // 3b. Si no existe, cualquier canal de orientación compatible
            if (bestChannel === -1) {
              for (let c = 0; c < mpptCount; c++) {
                if (channelOrientation[c] !== null && areOrientationsHomogeneous(channelOrientation[c], sData)) {
                  if (channelStrings[c].length < minAssigned) {
                    minAssigned = channelStrings[c].length;
                    bestChannel = c;
                  }
                }
              }
            }
          }

          // Prioridad 4: Fallback absoluto cuando no hay canales compatibles ni vacíos
          if (bestChannel === -1) {
            let minAngle = Infinity;
            for (let c = 0; c < mpptCount; c++) {
              const diff = channelOrientation[c] ? getAngleDiff(channelOrientation[c], sData) : 0;
              if (diff < minAngle) {
                minAngle = diff;
                bestChannel = c;
              }
            }
            if (bestChannel === -1) bestChannel = 0;
          }

          assign.set(n, bestChannel + 1);
          remaining[bestChannel] = Math.max(0, remaining[bestChannel] - 1);
          channelStrings[bestChannel].push(n);
          if (channelOrientation[bestChannel] === null) {
            channelOrientation[bestChannel] = { tilt: sData.tilt, az: sData.az };
            channelStrLen[bestChannel] = sLen;
          }
        });
      }
    });

    // 4. Aplicar a los paneles (mpptId + etiqueta "MPPTn:...")
    let changed = 0;
    panels.forEach(p => {
      if (!p || !p.stringName || p.isGhost || p.deleted || p.disabled) return;
      const m = assign.get(p.stringName);
      if (!m) return;
      if (p.mpptId !== m) { p.mpptId = m; changed++; }
      if (typeof p.tag === 'string' && p.tag.length > 0) {
        const hasInPrefix = p.tag.indexOf('[+ IN]') !== -1;
        const bareTag = p.tag.replace(/^(\[\+\s*IN\]\s*)+/, '').replace(/^MPPT\d+:/i, '');
        p.tag = (hasInPrefix ? '[+ IN] ' : '') + 'MPPT' + m + ':' + bareTag;
      }
    });

    const homogeneity = validateMPPTHomogeneity(panels);
    if (typeof root !== 'undefined' && root.solarProjectConfig) {
      root.solarProjectConfig.mpptHomogeneity = homogeneity;
    } else if (typeof window !== 'undefined' && window.solarProjectConfig) {
      window.solarProjectConfig.mpptHomogeneity = homogeneity;
    }

    const res = {
      changed,
      mpptCount,
      capPer,
      totalStrings,
      overflow: totalStrings > mpptCount * capPer,
      valid: homogeneity.valid,
      violations: homogeneity.violations,
      manualLocked: isLocked
    };
    _lastRebalanceResult = res;
    if (typeof window !== 'undefined' && window.RAMPPTMatrix && typeof window.RAMPPTMatrix.scheduleRender === 'function') {
      window.RAMPPTMatrix.scheduleRender();
    }
    return res;
    } finally {
      _isRebalancingMPPT = false;
    }
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

    // Agrupar strings por canal MPPT respetando flag selectivo p.hasMLPE
    const cfgCtx = (typeof window !== 'undefined' && window.solarProjectConfig) ? window.solarProjectConfig : {};
    const hasOptTopo = cfgCtx.selectedTopology === 'optimizer';
    const mpptGroups = new Map();
    targetPanels.forEach(p => {
      if (!p || !p.stringName || !p.mpptId || p.isGhost || p.deleted || p.disabled) return;
      if (!mpptGroups.has(p.mpptId)) mpptGroups.set(p.mpptId, new Map());
      const strMap = mpptGroups.get(p.mpptId);
      const panelHasMlpe = (typeof p.hasMLPE === 'boolean') ? p.hasMLPE : hasOptTopo;
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
          panelCount: 1,
          hasMLPE: panelHasMlpe
        });
      } else {
        const curStr = strMap.get(p.stringName);
        curStr.panelCount++;
        curStr.hasMLPE = curStr.hasMLPE && panelHasMlpe;
      }
    });

    // Límites eléctricos de inversor/módulo activo (Voc frío, Isc×1.25 e inputsPerMppt)
    const catCtx = (typeof window !== 'undefined' && window.equipmentCatalog) ? window.equipmentCatalog : null;
    const invCtx = (cfgCtx.calculatedLimits && cfgCtx.calculatedLimits.inverter)
      || (catCtx && Array.isArray(catCtx.inverters) && catCtx.inverters.find(i => i && i.id === cfgCtx.selectedInverterId))
      || null;
    const modCtx = (cfgCtx.calculatedLimits && cfgCtx.calculatedLimits.module)
      || (catCtx && Array.isArray(catCtx.modules) && catCtx.modules.find(m => m && m.id === cfgCtx.selectedModuleId))
      || (typeof window !== 'undefined' && window.panelConfig)
      || {};
    const vDcMaxInv = (invCtx && (invCtx.vDcMax || invCtx.vMax || invCtx.vMaxDc)) ? Number(invCtx.vDcMax || invCtx.vMax || invCtx.vMaxDc) : 1000;
    const inputsPerMppt = (invCtx && Number(invCtx.inputsPerMppt) > 0) ? Number(invCtx.inputsPerMppt) : 1;
    const iMaxScInv = (invCtx && Number(invCtx.iMaxScA) > 0) ? Number(invCtx.iMaxScA) : 0;
    const iscMod = Number(modCtx.isc || 13.8);
    const isBifacialMod = !!(modCtx.bifacial || modCtx.isBifacial || (modCtx.bifacialityFactor > 0));
    const iscFactor = 1.25 * (isBifacialMod ? 1.15 : 1.0);
    const dynLimCheck = calculateDynamicMPPTStringLimits(modCtx, invCtx || { vDcMax: vDcMaxInv });
    const vocColdMod = (dynLimCheck && dynLimCheck.Voc_Tmin > 0) ? dynLimCheck.Voc_Tmin : (Number(modCtx.voc || 41.5) * 1.10);

    const violations = [];
    mpptGroups.forEach((strMap, mpptId) => {
      const strings = Array.from(strMap.entries());
      if (strings.length === 0) return;

      if (invCtx && strings.length > inputsPerMppt) {
        violations.push({
          mpptId,
          blocking: true,
          code: 'MPPT_INPUTS_EXCEEDED',
          msg: `⛔ BLOQUEO NORMATIVO MPPT en Canal ${mpptId}: ${strings.length} strings asignados superan las ${inputsPerMppt} entrada(s) física(s) del inversor (IEC 62548).`
        });
      }

      if (iMaxScInv > 0) {
        const iscChannel = strings.length * iscMod * iscFactor;
        if (iscChannel > iMaxScInv) {
          violations.push({
            mpptId,
            blocking: true,
            code: 'MPPT_OVERCURRENT_ISC',
            msg: `⛔ BLOQUEO NORMATIVO MPPT en Canal ${mpptId}: Corriente de cortocircuito en paralelo (${iscChannel.toFixed(1)} A incl. 1.25×) supera el límite Isc máx del inversor (${iMaxScInv.toFixed(1)} A).`
          });
        }
      }

      strings.forEach(([name, data]) => {
        const strVocCold = data.panelCount * vocColdMod;
        if (strVocCold > vDcMaxInv) {
          violations.push({
            mpptId,
            stringA: name,
            blocking: true,
            code: 'MPPT_OVERVOLTAGE',
            msg: `⛔ BLOQUEO NORMATIVO MPPT en Canal ${mpptId}: String '${name}' (${data.panelCount} placas) alcanza Voc frío = ${strVocCold.toFixed(0)} V > Vdc máx (${vDcMaxInv} V) (IEC 62548).`
          });
        }
      });

      if (strings.length <= 1) return;
      for (let i = 0; i < strings.length; i++) {
        for (let j = i + 1; j < strings.length; j++) {
          const [nameA, dataA] = strings[i];
          const [nameB, dataB] = strings[j];
          const deltaTilt = Math.abs(dataA.tilt - dataB.tilt);
          let deltaAz = Math.abs(dataA.az - dataB.az);
          if (deltaAz > 180) deltaAz = 360 - deltaAz;
          const deltaCount = Math.abs(dataA.panelCount - dataB.panelCount);

          if (deltaCount > 0 && !(dataA.hasMLPE && dataB.hasMLPE)) {
            const msg = `⛔ BLOQUEO NORMATIVO MPPT en Canal ${mpptId}: Strings '${nameA}' (${dataA.panelCount} módulos) y '${nameB}' (${dataB.panelCount} módulos) en paralelo tienen diferente longitud (ΔN = ${deltaCount}). Provoca desbalance severo de tensión Vmp y corrientes inversas destructivas (IEC 62548).`;
            violations.push({
              mpptId,
              stringA: nameA,
              stringB: nameB,
              deltaTilt,
              deltaAz,
              deltaCount,
              blocking: true,
              code: 'MPPT_ASYMMETRIC_STRING_LENGTH',
              msg
            });
          } else if ((deltaTilt > 5.0 || deltaAz > 10.0) && !(dataA.hasMLPE && dataB.hasMLPE)) {
            const msg = `⛔ BLOQUEO NORMATIVO MPPT en Canal ${mpptId}: Strings '${nameA}' y '${nameB}' en paralelo difieren en orientación (Δβ = ${deltaTilt.toFixed(1)}°, Δγ = ${deltaAz.toFixed(1)}°). Produce recirculación y pérdida de tracking (IEC 62548).`;
            violations.push({
              mpptId,
              stringA: nameA,
              stringB: nameB,
              deltaTilt,
              deltaAz,
              deltaCount: 0,
              blocking: true,
              code: 'MPPT_ORIENTATION_MISMATCH',
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
            <span style="font-size: 10px;font-weight:900;color:#34D399;display:flex;align-items:center;gap:4px;">
              <i data-lucide="cpu" class="icon-sm"></i> Topología Microinversores MLPE (${count} Uds)
            </span>
            <span class="card-tag" style="background:rgba(16,185,129,0.2);color:#34D399;font-size: 10px;font-weight:800;">
              ${inputs} entradas/ud
            </span>
          </div>
          <div style="font-size: 10px;color:var(--text-slate-200);line-height:1.3;">
            <b>${totalPanels} paneles (${totalKwp.toFixed(1)} kWp)</b> gestionados por <b>${count} microinversores ${microBrand}</b>. Cada panel dispone de MPPT independiente en cubierta, inmune a sombras cruzadas y sin cableado DC de alta tensión.
          </div>
        </div>
      `;
      if (root.lucide && typeof root.lucide.createIcons === 'function') root.lucide.createIcons();
      return;
    }

    // Caso B: Inversor Central / String
    const selectedInvId = cfg.selectedInverterId || (catalog[0] ? catalog[0].id : null);
    const currentInv = catalog.find(i => i.id === selectedInvId) || (cfg.lastVirtualInverter && cfg.lastVirtualInverter.id === selectedInvId ? cfg.lastVirtualInverter : null) || catalog[0];

    // Considerar multi-inversor si ya está dimensionado por wpComputeAutoSizing
    const invCount = (cfg.autoSizing && cfg.autoSizing.inverters && Number.isFinite(cfg.autoSizing.inverters.count) && cfg.autoSizing.inverters.count > 0)
      ? cfg.autoSizing.inverters.count
      : 1;

    const invNomKw = currentInv.kw || 5.0;
    const maxOverloadRatio = currentInv.maxOverload || 1.35;
    const singleMaxCapacityKwp = invNomKw * maxOverloadRatio;
    const totalInvNomKw = invNomKw * invCount;
    const totalMaxCapacityKwp = totalInvNomKw * maxOverloadRatio;
    const autoInverters = Math.max(1, Math.ceil(totalKwp / singleMaxCapacityKwp));

    // Evaluar si la instalación completa se queda corta considerando las unidades seleccionadas/auto
    const isUndersized = totalKwp > (totalMaxCapacityKwp * 1.05);

    // Evaluar si está sobredimensionado en exceso (potencia total < 50% de la potencia nominal instalada)
    const isOversized = totalKwp < (totalInvNomKw * 0.50) && totalKwp >= 1.0;

    // Caso C: Incompatibilidad MPPT en Strings (IEC 62548) — BLOQUEO DE CONFIGURACIÓN
    if (cfg.mpptHomogeneity && !cfg.mpptHomogeneity.valid && cfg.mpptHomogeneity.violations.length > 0) {
      const v = cfg.mpptHomogeneity.violations[0];
      const mpptReq = Math.max(2, (currentInv.mppt || 1) + 1);
      const candidates = catalog.filter(inv => (inv.mppt || 1) >= mpptReq && (inv.kw * (inv.maxOverload || 1.35)) >= totalKwp);
      let bestInv = null;
      if (candidates.length > 0) {
        candidates.sort((a, b) => Math.abs((totalKwp / a.kw) - 1.18) - Math.abs((totalKwp / b.kw) - 1.18));
        bestInv = candidates[0];
      }

      container.style.display = 'block';
      container.innerHTML = `
        <div style="background:rgba(239,68,68,0.16);border:2px solid #EF4444;border-radius:7px;padding:8px;display:flex;flex-direction:column;gap:5px;box-shadow:0 0 12px rgba(239,68,68,0.25);">
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <span style="font-size:10px;font-weight:900;color:#FCA5A5;display:flex;align-items:center;gap:4px;">
              <i data-lucide="shield-alert" class="icon-sm"></i> ⛔ CONFIGURACIÓN BLOQUEADA (IEC 62548)
            </span>
            <span class="card-tag" style="background:#EF4444;color:#fff;font-size: 9px;font-weight:900;">
              CANAL MPPT ${v.mpptId}
            </span>
          </div>
          <div style="font-size: 10px;color:#FECACA;line-height:1.35;font-weight:600;">
            ${v.msg}
          </div>
          <div style="font-size: 9.5px;color:#CBD5E1;line-height:1.3;">
            <b>Acción requerida para desbloquear Entrega (Paso 5):</b> Iguala el número de módulos por string en el faldón o añade canales MPPT independientes.
          </div>
          ${bestInv && bestInv.id !== currentInv.id ? `
            <button type="button" onclick="wpApplyRecommendedInverter('${bestInv.id}')" style="background:linear-gradient(135deg,#EF4444,#DC2626);border:none;color:#fff;font-size: 10px;font-weight:900;padding:6px 10px;border-radius:5px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;box-shadow:0 0 10px rgba(239,68,68,0.3);margin-top:2px;">
              <i data-lucide="zap" class="icon-sm"></i> Cambiar a ${bestInv.brand} ${bestInv.kw} kW (${bestInv.mppt} MPPTs) en 1 Clic
            </button>
          ` : `
            <button type="button" onclick="wpStepQuantity('inverters', 1)" style="background:linear-gradient(135deg,#EF4444,#DC2626);border:none;color:#fff;font-size: 10px;font-weight:900;padding:6px 10px;border-radius:5px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;box-shadow:0 0 10px rgba(239,68,68,0.3);margin-top:2px;">
              <i data-lucide="plus-circle" class="icon-sm"></i> Añadir +1 Inversor para Habilitar Más Canales MPPT
            </button>
          `}
        </div>
      `;
      if (root.lucide && typeof root.lucide.createIcons === 'function') root.lucide.createIcons();
      return;
    }

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
                <span class="card-tag" style="background:rgba(245,158,11,0.25);color:#FBBF24;font-size: 10px;font-weight:800;">
                  ${totalKwp.toFixed(1)} kWp / ${invNomKw} kW AC
                </span>
              </div>
              <div style="font-size: 10px;color:var(--text-slate-200);line-height:1.3;">
                El modelo actual de <b>${invNomKw} kW</b> se queda corto (${((totalKwp / invNomKw) * 100).toFixed(0)}% carga). Te recomendamos el modelo superior <b>${best.brand} ${best.model} (${best.kw} kW)</b> para abastecer toda la instalación con un único equipo.
              </div>
              <button type="button" onclick="wpApplyRecommendedInverter('${best.id}')" style="background:linear-gradient(135deg,#F59E0B,#D97706);border:none;color:#0F172A;font-size: 10px;font-weight:900;padding:6px 10px;border-radius:5px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;box-shadow:0 0 10px rgba(245,158,11,0.3);margin-top:2px;">
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
            <span class="card-tag" style="background:rgba(245,158,11,0.25);color:#FBBF24;font-size: 10px;font-weight:800;">
              ${totalKwp.toFixed(1)} kWp / Multi-Equipo
            </span>
          </div>
          <div style="font-size: 10px;color:var(--text-slate-200);line-height:1.3;">
            La potencia de <b>${totalPanels} placas (${totalKwp.toFixed(1)} kWp)</b> excede la capacidad de un único equipo comercial. Se auto-dimensionan <b>${autoInverters} inversores en paralelo de ${currentInv.kw} kW</b> para repartir los strings con seguridad normativa (REBT / IEC 62548).
          </div>
          ${maxInvInCatalog && maxInvInCatalog.id !== currentInv.id ? `
            <button type="button" onclick="wpApplyRecommendedInverter('${maxInvInCatalog.id}')" style="background:linear-gradient(135deg,#F59E0B,#D97706);border:none;color:#0F172A;font-size: 10px;font-weight:900;padding:6px 10px;border-radius:5px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;box-shadow:0 0 10px rgba(245,158,11,0.3);margin-top:2px;">
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
              <span class="card-tag" style="background:rgba(56,189,248,0.2);color:#38BDF8;font-size: 10px;font-weight:800;">
                ${totalKwp.toFixed(1)} kWp / ${invNomKw} kW AC
              </span>
            </div>
            <div style="font-size: 10px;color:var(--text-slate-200);line-height:1.3;">
              Para solo <b>${totalPanels} placas (${totalKwp.toFixed(1)} kWp)</b>, el modelo de <b>${invNomKw} kW</b> encarece el presupuesto sin necesidad. Con el modelo <b>${best.brand} ${best.model} (${best.kw} kW)</b> ahorras costes de equipo sin perder rendimiento.
            </div>
            <button type="button" onclick="wpApplyRecommendedInverter('${best.id}')" style="background:rgba(56,189,248,0.25);border:1px solid #38BDF8;color:#BAE6FD;font-size: 10px;font-weight:900;padding:5px 10px;border-radius:5px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;margin-top:2px;">
              <i data-lucide="check" class="icon-sm"></i> Ajustar a ${best.brand} ${best.kw} kW en 1 Clic
            </button>
          </div>
        `;
        if (root.lucide && typeof root.lucide.createIcons === 'function') root.lucide.createIcons();
        return;
      }
    }

    // Evaluar si es monofásico pero excede el límite habitual de 5 kW de inyección de distribuidora
    const isSinglePhase = (raInverterPhases(currentInv) === 1);
    const exceedsSinglePhase5kW = isSinglePhase && (currentInv.kw > 5.0);

    // Si está perfectamente ajustado
    const loadPercent = Math.round((totalKwp / totalInvNomKw) * 100);
    const invCountText = invCount > 1 ? `${invCount}x Inversores (${totalInvNomKw.toFixed(1)} kW AC total)` : `Inversor (${invNomKw} kW AC)`;

    // Desglose en vivo de conexión serie/paralelo por canal MPPT
    let mpptBreakdownHtml = '';
    const activePanelsList = Array.isArray(root.allRenderedPanels) ? root.allRenderedPanels.filter(p => p && !p.deleted && !p.disabled && p.stringName && p.mpptId) : [];
    if (activePanelsList.length > 0) {
      const mpptMap = new Map();
      activePanelsList.forEach(p => {
        if (!mpptMap.has(p.mpptId)) mpptMap.set(p.mpptId, new Map());
        const sMap = mpptMap.get(p.mpptId);
        sMap.set(p.stringName, (sMap.get(p.stringName) || 0) + 1);
      });
      const mpptPills = [];
      Array.from(mpptMap.keys()).sort((a, b) => a - b).forEach(mId => {
        const sMap = mpptMap.get(mId);
        const sNames = Array.from(sMap.keys());
        const isParallel = sNames.length > 1;
        const counts = sNames.map(s => sMap.get(s));
        const desc = isParallel
          ? `<b>${sNames.length} ramas en paralelo</b> (${sNames.map((n, idx) => n + ':' + counts[idx] + 'p').join(' // ')})`
          : `1 rama en serie (${sNames[0]}: ${counts[0]}p)`;
        const badgeColor = isParallel ? 'rgba(56,189,248,0.18)' : 'rgba(255,255,255,0.06)';
        const borderColor = isParallel ? 'rgba(56,189,248,0.45)' : 'rgba(255,255,255,0.12)';
        mpptPills.push(`<div style="background:${badgeColor};border:1px solid ${borderColor};border-radius:4px;padding:3px 6px;font-size:9px;display:flex;justify-content:space-between;align-items:center;"><span style="color:#38BDF8;font-weight:800;">MPPT ${mId}:</span><span style="color:#E2E8F0;font-family:monospace;">${desc}</span></div>`);
      });
      if (mpptPills.length > 0) {
        mpptBreakdownHtml = `<div style="display:flex;flex-direction:column;gap:3px;margin-top:3px;padding-top:4px;border-top:1px dashed rgba(255,255,255,0.12);"><div style="font-size:8.5px;color:#94A3B8;font-weight:700;text-transform:uppercase;">Reparto Serie / Paralelo por Canal MPPT:</div>${mpptPills.join('')}</div>`;
      }
    }
    container.style.display = 'block';
    container.innerHTML = `
      <div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.3);border-radius:6px;padding:5px 8px;display:flex;flex-direction:column;gap:4px;">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <span style="font-size: 10px;font-weight:800;color:#34D399;display:flex;align-items:center;gap:4px;">
            <i data-lucide="check-circle" class="icon-sm"></i> ${invCount > 1 ? 'Sistema multi-inversor perfectamente ajustado' : 'Inversor perfectamente ajustado'}
          </span>
          <span style="font-size: 10px;color:rgba(255,255,255,0.7);">
            ${totalKwp.toFixed(1)} kWp · ${loadPercent}% carga óptima
          </span>
        </div>
        <div style="font-size: 9.5px;color:var(--text-slate-300);">
          ${invCountText} · Capacidad máx admisible: ${totalMaxCapacityKwp.toFixed(1)} kWp
        </div>
        ${mpptBreakdownHtml}
        ${exceedsSinglePhase5kW && invCount === 1 ? `
          <div style="font-size: 9.5px;color:#FBBF24;background:rgba(245,158,11,0.15);border:1px solid rgba(245,158,11,0.3);padding:3px 6px;border-radius:4px;display:flex;align-items:center;gap:4px;">
            <i data-lucide="alert-triangle" class="icon-sm"></i> <b>Aviso Distribuidora:</b> Equipo monofásico > 5 kW (${currentInv.kw} kW). Las distribuidoras en España (Endesa/Iberdrola/UFD) suelen exigir acometida trifásica para P > 5 kW (REBT ITC-BT-40).
          </div>
        ` : ''}
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
    let hasInverter = !!(s.position);
    let hasMeter = !!(s.gridMeter && s.gridMeter.position);

    // Auto-resolución Zero-Click si estamos en el Paso 4 y aún no se han disparado posiciones por defecto
    if ((!hasInverter || !hasMeter) && typeof root.wpCableEngine !== 'undefined' && typeof root.wpCableEngine.ensureDefaultEquipmentPositions === 'function') {
      try {
        const allStrs = typeof root.wpCableEngine.gatherAllStrings === 'function' ? root.wpCableEngine.gatherAllStrings() : [];
        root.wpCableEngine.ensureDefaultEquipmentPositions(allStrs);
        hasInverter = !!(s.position);
        hasMeter = !!(s.gridMeter && s.gridMeter.position);
      } catch (eAuto) {}
    }

    const measuredDc = (typeof s.L_dc_measured === 'number' && s.L_dc_measured > 0) ? s.L_dc_measured : 0;
    const measuredAc = (typeof s.L_ac_measured === 'number' && s.L_ac_measured > 0) ? s.L_ac_measured : 0;

    if (hasInverter && hasMeter) {
      container.innerHTML = `
        <div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.35);border-radius:7px;padding:7px 9px;display:flex;flex-direction:column;gap:4px;">
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <span style="font-size: 10px;font-weight:900;color:#34D399;display:flex;align-items:center;gap:4px;">
              <i data-lucide="check-circle-2" class="icon-sm"></i> Infraestructura Eléctrica Medida en 3D
            </span>
            <div style="display:flex;gap:4px;">
              <button type="button" onclick="wpStartInverterPlacement()" class="doc-mini-btn" style="font-size: 10px;padding:2px 5px;color:#F59E0B;border-color:rgba(245,158,11,0.4);" title="Mover inversor">
                <i data-lucide="zap" class="icon-sm"></i> Inversor
              </button>
              <button type="button" onclick="wpStartGridMeterPlacement()" class="doc-mini-btn" style="font-size: 10px;padding:2px 5px;color:#38BDF8;border-color:rgba(56,189,248,0.4);" title="Mover contador">
                <i data-lucide="plug" class="icon-sm"></i> Contador
              </button>
              <button type="button" onclick="wpStartBatteryPlacement()" class="doc-mini-btn" style="font-size: 10px;padding:2px 5px;color:#34D399;border-color:rgba(16,185,129,0.4);" title="Mover batería">
                <i data-lucide="battery-charging" class="icon-sm"></i> Batería
              </button>
            </div>
          </div>
          <div style="font-size: 10px;color:var(--text-slate-300);line-height:1.3;">
            Tirada DC (cubierta → inversor): <b>${measuredDc > 0 ? measuredDc.toFixed(1) + ' m' : 'calculada'}</b> · Acometida AC (inversor → contador): <b>${measuredAc > 0 ? measuredAc.toFixed(1) + ' m' : 'calculada'}</b>. Metros de cable y caída de tensión REBT exactos al centímetro.
          </div>
        </div>
      `;
    } else if (hasInverter && !hasMeter) {
      container.innerHTML = `
        <div style="background:rgba(56,189,248,0.08);border:1px solid rgba(56,189,248,0.35);border-radius:7px;padding:8px 9px;display:flex;flex-direction:column;gap:4px;">
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <span style="font-size: 10px;font-weight:900;color:var(--sky-400);display:flex;align-items:center;gap:4px;">
              <i data-lucide="plug" class="icon-sm"></i> Paso Necesario: Ubicar el Contador de Luz
            </span>
            <span class="card-tag" style="background:rgba(56,189,248,0.2);color:#38BDF8;font-size: 10px;font-weight:800;">PENDIENTE AC</span>
          </div>
          <div style="font-size: 10px;color:var(--text-slate-300);line-height:1.3;">
            El inversor ya está fijado en pared. Toca en la fachada de la casa donde esté el contador o cuadro general (CGMP) para medir la línea exacta de evacuación AC hasta la red.
          </div>
          <button type="button" onclick="wpStartGridMeterPlacement()" style="background:rgba(56,189,248,0.25);border:1px solid #38BDF8;color:#BAE6FD;font-size: 10px;font-weight:900;padding:5px 8px;border-radius:5px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;margin-top:2px;">
            <i data-lucide="map-pin" class="icon-sm"></i> Tocar en la Pared para Situar el Contador
          </button>
        </div>
      `;
    } else if (!hasInverter && hasMeter) {
      container.innerHTML = `
        <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.35);border-radius:7px;padding:8px 9px;display:flex;flex-direction:column;gap:4px;">
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <span style="font-size: 10px;font-weight:900;color:#F59E0B;display:flex;align-items:center;gap:4px;">
              <i data-lucide="zap" class="icon-sm"></i> Paso Necesario: Ubicar el Inversor
            </span>
            <span class="card-tag" style="background:rgba(245,158,11,0.2);color:#FBBF24;font-size: 10px;font-weight:800;">PENDIENTE DC</span>
          </div>
          <div style="font-size: 10px;color:var(--text-slate-300);line-height:1.3;">
            Contador ubicado. Toca en la pared o fachada donde se colocará el inversor y el cuadro DC para conectar los strings de paneles con la vivienda.
          </div>
          <button type="button" onclick="wpStartInverterPlacement()" style="background:linear-gradient(135deg,#F59E0B,#D97706);border:none;color:#0F172A;font-size: 10px;font-weight:900;padding:5px 8px;border-radius:5px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;margin-top:2px;">
            <i data-lucide="map-pin" class="icon-sm"></i> Tocar en la Pared para Situar el Inversor
          </button>
        </div>
      `;
    } else {
      container.innerHTML = `
        <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.12);border-radius:7px;padding:8px 9px;display:flex;flex-direction:column;gap:5px;">
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <span style="font-size: 10px;font-weight:900;color:var(--text-slate-200);display:flex;align-items:center;gap:4px;">
              <i data-lucide="route" class="icon-sm"></i> Guía Visual: Ubicación de Equipos 3D
            </span>
            <span class="card-tag" style="background:rgba(255,255,255,0.1);color:var(--text-slate-300);font-size: 10px;">2 PASOS</span>
          </div>
          <div style="font-size: 10px;color:var(--text-slate-400);line-height:1.3;">
            Sitúa los equipos en fachada para medir al centímetro las tiradas reales de cable y evitar costes de obra estimados en la oferta:
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:2px;">
            <button type="button" onclick="wpStartInverterPlacement()" style="background:linear-gradient(135deg,#F59E0B,#D97706);border:none;color:#0F172A;font-size: 10px;font-weight:900;padding:5px 6px;border-radius:4px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;">
              <i data-lucide="zap" class="icon-sm"></i> 1. Situar Inversor
            </button>
            <button type="button" onclick="wpStartGridMeterPlacement()" style="background:rgba(56,189,248,0.2);border:1px solid #38BDF8;color:#BAE6FD;font-size: 10px;font-weight:900;padding:5px 6px;border-radius:4px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;">
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

/**
   * [AUD-2026 · F-01] Dimensionado eléctrico canónico (extraído del bloque inline).
   * Calcula strings, tensiones, secciones, ΔV y protecciones a partir del generador y
   * del catálogo. Mantiene el comportamiento exacto del código original.
   */
  function computeSizingEngineering(generator) {
  const { numPanels, cfg, tiltDeg, azimutDeg, latDeg } = generator;
  if (!numPanels || numPanels <= 0) {
    return {
      P_dc_kW: 0,
      P_ac_kW: 0,
      inv_kW: 0,
      monofasico: true,
      V_ac: 230,
      I_ac: 0,
      I_ac_design: 0,
      numStrings: 0,
      modsPerString: 0,
      minModsPerString: 0,
      maxModsPerString: 0,
      Voc_str_stc: 0,
      Voc_str_max: 0,
      Vmp_str_hot: 0,
      I_total_dc: 0,
      invCount: 1,
      S_str: 6,
      S_mdc: 10,
      dVdc_pct: 0,
      dV_dc: 0,
      dV_ac: 0,
      S_ac: 10,
      S_ac_branch: 10,
      S_earth: 6,
      dVac_pct: 0,
      I_iga: 16,
      dif_amp: 25,
      spdType: "Tipo 2 / Clase II (1000 V CC / 400 V AC - 40 kA)",
      spdClaseLabel: "Clase II (Tipo 2)",
      hasExternalLightningRod: false,
      isMicroinverter: false,
      includeBackupBox: false,
      needsExternalDcPanel: true,
      microBranches: 0,
      fuseExceedsModRating: false,
      PR: 0.80,
      lossTree: {
        soiling: 2.5,
        iam: 2.8,
        thermal: 7.5,
        mismatch: 2.0,
        dc_ohmic: 1.5,
        inverter: 2.5,
        ac_ohmic: 0.8,
        net_PR: 80.0
      }
    };
  }
  const P_dc_kW = (numPanels * cfg.potencia) / 1000;

  const Voc = cfg.voc || 41.5;
  const Vmp = cfg.vmp || 34.5;
  const Isc = cfg.isc || 13.8;
  const Imp = cfg.imp || 13.05;
  const rawBeta = cfg.betaVoc || cfg.gammaVoc || cfg.tempCoeffVoc || -0.0027;
  const betaVoc = normalizeThermalCoeff(rawBeta, -0.0027);
  const rawGamma = cfg.gammaPmp || cfg.tempCoeffPmax || -0.0035;
  const gammaPmp = normalizeThermalCoeff(rawGamma, -0.0035);

  const explicitTmin = (generator && typeof generator.Tmin === 'number')
    ? generator.Tmin
    : ((cfg && typeof cfg.tempMinC === 'number') ? cfg.tempMinC : undefined);
  let T_min = (explicitTmin !== undefined)
    ? explicitTmin
    : ((typeof SOLAR_ENGINE_CONSTANTS !== 'undefined' && SOLAR_ENGINE_CONSTANTS.T_MIN_SPAIN) ? SOLAR_ENGINE_CONSTANTS.T_MIN_SPAIN : -10);
  const T_amb_max = (typeof SOLAR_ENGINE_CONSTANTS !== 'undefined' && SOLAR_ENGINE_CONSTANTS.T_AMB_MAX_SPAIN)
    ? SOLAR_ENGINE_CONSTANTS.T_AMB_MAX_SPAIN
    : 40;
  // [AUD-2026 · F-01] Tolerancia a carga parcial: si `solar-engine` no está, no reventar.
  const T_cell_max = (typeof computeCellTemperature === 'function')
    ? computeCellTemperature(T_amb_max, 1000, true, 1.0)
    : (T_amb_max + 25);
  const betaVmp = normalizeThermalCoeff(cfg.betaVmp || gammaPmp, gammaPmp);

  // [P0.1] Desacoplar inversor: usar el inversor seleccionado del catálogo en lugar de 1000/200/850 fijos
  let activeInv = null;
  if (typeof window !== 'undefined' && window.solarProjectConfig && window.equipmentCatalog && Array.isArray(window.equipmentCatalog.inverters)) {
    const invId = window.solarProjectConfig.selectedInverterId;
    activeInv = window.equipmentCatalog.inverters.find(i => i && i.id === invId);
  }
  const V_dc_max   = (activeInv && (activeInv.vDcMax || activeInv.vMax || activeInv.vMaxDc)) ? (activeInv.vDcMax || activeInv.vMax || activeInv.vMaxDc) : 1000;
  const V_mppt_min = (activeInv && activeInv.vMpptMin) ? activeInv.vMpptMin : 200;
  const V_mppt_max = (activeInv && activeInv.vMpptMax) ? activeInv.vMpptMax : 850;

  let maxModsPerString = 20;
  let minModsPerString = 6;
  let Voc_cold = Voc * (1 + betaVoc * (T_min - 25));
  let Vmp_hot = Vmp * (1 + betaVmp * (T_cell_max - 25));
  let Vmp_cold = Vmp * (1 + betaVmp * (T_min - 25));

  if (typeof window !== 'undefined' && window.RA && window.RA.Electrical && typeof window.RA.Electrical.calculateDynamicMPPTStringLimits === 'function') {
    const limits = window.RA.Electrical.calculateDynamicMPPTStringLimits(
      { Voc, Vmp, betaVoc, betaVmp, gammaPmp },
      { Vmax: V_dc_max, VmpptMin: V_mppt_min, VmpptMax: V_mppt_max },
      { Tmin: explicitTmin, TmaxCell: T_cell_max }
    );
    maxModsPerString = limits.Ns_max;
    minModsPerString = limits.Ns_min;
    Voc_cold = limits.Voc_Tmin;
    Vmp_hot = limits.Vmp_Tmax;
    Vmp_cold = limits.Vmp_Tmin;
    if (typeof limits.Tmin === 'number' && Number.isFinite(limits.Tmin)) T_min = limits.Tmin;
  } else {
    const N_max_dc   = Math.floor(V_dc_max / Voc_cold);
    const N_max_mppt = Math.floor(V_mppt_max / Vmp_cold);
    const N_min_mppt = Math.ceil(V_mppt_min / Vmp_hot);
    maxModsPerString = Math.min(N_max_dc, N_max_mppt);
    minModsPerString = N_min_mppt;
  }

  let numStrings = Math.max(1, Math.ceil(numPanels / maxModsPerString));
  let modsPerString = Math.ceil(numPanels / numStrings);

  if (modsPerString < minModsPerString && numPanels >= minModsPerString) {
    const reducedStrings = Math.max(1, Math.floor(numPanels / minModsPerString));
    const reducedMods = Math.ceil(numPanels / reducedStrings);
    if (reducedMods <= maxModsPerString) {
      numStrings = reducedStrings;
      modsPerString = reducedMods;
    }
  }

  const Voc_str_stc = modsPerString * Voc;
  const Voc_str_max = modsPerString * Voc_cold;
  const Vmp_str_hot = modsPerString * Vmp_hot;
  const I_total_dc = numStrings * Isc;

  const activeInvKw = (activeInv && (activeInv.kw || activeInv.kw_nominal || activeInv.acKw)) ? (activeInv.kw || activeInv.kw_nominal || activeInv.acKw) : 0;
  const invCount = Math.max(1, (generator && (generator.invCount || generator.inverterCount))
    || (cfg && (cfg.inverterCount || (cfg.autoSizing && cfg.autoSizing.inverters && cfg.autoSizing.inverters.count)))
    || (typeof window !== 'undefined' && window.solarProjectConfig && window.solarProjectConfig.autoSizing && window.solarProjectConfig.autoSizing.inverters && window.solarProjectConfig.autoSizing.inverters.count)
    || 1);
  const INV_SIZES = [0.6, 1.0, 1.5, 2.0, 3.0, 3.68, 4.0, 5.0, 6.0, 8.0, 10.0, 12.0, 15.0, 20.0, 25.0, 30.0, 50.0, 100.0];
  const P_ac_unit_target = activeInvKw > 0 ? activeInvKw : ((P_dc_kW / 1.15) / invCount);
  const inv_kW = activeInvKw > 0 ? activeInvKw : (INV_SIZES.find(s => s >= P_ac_unit_target) || Math.ceil(P_ac_unit_target));
  const P_ac_kW = inv_kW;
  const total_P_ac_kW = inv_kW * invCount;
  const total_ac_kW = total_P_ac_kW;
  const _cfgAc = (typeof window !== 'undefined' && window.solarProjectConfig) ? window.solarProjectConfig : null;
  const _selInv = (_cfgAc && _cfgAc.calculatedLimits && _cfgAc.calculatedLimits.inverter) || null;
  const _invCountAc = (_cfgAc && _cfgAc.autoSizing && _cfgAc.autoSizing.inverters && Number.isFinite(_cfgAc.autoSizing.inverters.count))
    ? Math.max(1, _cfgAc.autoSizing.inverters.count) : 1;
  const _resolvedInv = activeInv || _selInv || { kw: inv_kW };
  let monofasico = raResolveAcPhases(_resolvedInv, _invCountAc, _cfgAc) === 1;
  // Salvaguarda RD 1699/2011 Art. 12.2 (mod. RD 244/2019): Pn > 15 kW nominales AC exige conexión trifásica
  if (total_ac_kW > 15.0) {
    monofasico = false;
  }
  const V_ac = monofasico ? 230 : 400;
  // Factor de potencia de inyección (0.95 en baseline histórico; configurable si el inversor declara cosPhi)
  const cosPhiAc = (activeInv && typeof activeInv.cosPhi === 'number' && activeInv.cosPhi > 0) ? activeInv.cosPhi : 0.95;
  const I_ac = monofasico ? (total_ac_kW * 1000) / (V_ac * cosPhiAc) : (total_ac_kW * 1000) / (Math.sqrt(3) * V_ac * cosPhiAc);

  // [AUD-2026 · F-01] Sin la constante global, usar el valor normativo del proyecto
  // en lugar de propagar NaN a toda la tabla de secciones.
  const rho90 = (typeof SOLAR_ENGINE_CONSTANTS !== 'undefined' && SOLAR_ENGINE_CONSTANTS && Number(SOLAR_ENGINE_CONSTANTS.RHO_CU_90) > 0)
    ? SOLAR_ENGINE_CONSTANTS.RHO_CU_90
    : 0.023;
  const _sState = (typeof window !== 'undefined' && window.inverterEquipmentState) ? window.inverterEquipmentState : null;
  const L_dc_string = (_sState && _sState.L_dc_string_measured > 0)
    ? _sState.L_dc_string_measured
    : ((_sState && _sState.L_dc_measured > 0) ? _sState.L_dc_measured : 30);
  // Si L_dc_loop_measured existe, ya representa el lazo completo (DC+ + DC- + retorno + intermódulo): no multiplicar por 2.
  const L_dc_eff_loop = (_sState && _sState.L_dc_loop_measured > 0)
    ? _sState.L_dc_loop_measured
    : (2 * L_dc_string);
  const L_dc = (_sState && _sState.L_dc_measured > 0)
    ? _sState.L_dc_measured
    : 30;
  const L_mdc_meas = (_sState && _sState.L_dc_trunk_measured > 0)
    ? _sState.L_dc_trunk_measured
    : Math.max(5, Math.round(L_dc_string * 0.35));
  const L_ac = (_sState && _sState.L_ac_measured > 0)
    ? _sState.L_ac_measured
    : 15;

  // Factor de bifacialidad unificado bajo UNE-EN 62548 / IEC TS 60904-1-2 (+15% conservador aplicado a protecciones y caída DC)
  const isBifacialMod = !!(cfg && (cfg.bifacial || cfg.isBifacial || (cfg.bifacialityFactor && cfg.bifacialityFactor > 0)));
  const bifacialGainFactor = isBifacialMod ? 1.15 : 1.0;
  // IEC 62548 Clause 5.2.1: 1.56 × Isc (1.25 × 1.25) alineado con el motor de cableado 3D
  const I_dc_design = 1.56 * (Isc * bifacialGainFactor);
  const I_dc_working = Imp * bifacialGainFactor;
  // [AUD-2026 · C-05] Fuente única de secciones/ampacidad: js/electrical-engine.js.
  const _RA_SEC = (typeof window !== 'undefined' && window.RA && window.RA.Electrical && window.RA.Electrical.SECCIONES) || null;
  const SEC_DC_AVAIL = (_RA_SEC && Array.isArray(_RA_SEC.dc)) ? _RA_SEC.dc : [4, 6, 10, 16, 25, 35, 50, 70];
  const IMAX_DC_ZZF  = (_RA_SEC && Array.isArray(_RA_SEC.dcIz)) ? _RA_SEC.dcIz : [44, 58, 80, 107, 138, 171, 209, 256];

  // [C6/M6] Factores de corrección de ampacidad reales (REBT ITC-BT-19 / UNE-HD 60364-5-52):
  // temperatura ambiente 40–45 °C (0.90) × agrupamiento real kGroup según número de circuitos DC/AC
  const nCircDc = Math.max(1, numStrings);
  const kGroupDc = nCircDc === 1 ? 1.0 : (nCircDc === 2 ? 0.80 : (nCircDc === 3 ? 0.70 : (nCircDc <= 5 ? 0.65 : 0.55)));
  const K_AMPACITY_DC = 0.90 * kGroupDc;
  // Línea general AC hacia CGBT/contador es un único circuito agrupado (kGroupMain = 1.0);
  // kGroupAc aplica solo a las ramas paralelas Inversor -> Subcuadro Agrupador cuando invCount > 1.
  const K_AMPACITY_AC_MAIN = 0.90;
  const kGroupAc = invCount <= 1 ? 1.0 : (invCount === 2 ? 0.80 : (invCount === 3 ? 0.70 : 0.65));
  const K_AMPACITY_AC_BRANCH = 0.90 * kGroupAc;

  let S_str_opt = null;
  for (let i = 0; i < SEC_DC_AVAIL.length; i++) {
    const s = SEC_DC_AVAIL[i];
    const imax = IMAX_DC_ZZF[i];
    const dV = (rho90 * L_dc_eff_loop * I_dc_working) / s;
    const vStrBase = Math.max(Vmp_str_hot, 1.0);
    const dV_pct = (dV / vStrBase) * 100;
    if ((imax * K_AMPACITY_DC) >= I_dc_design && dV_pct <= 1.5) {
      S_str_opt = s;
      break;
    }
  }
  const isDcCompliant = (S_str_opt !== null);
  if (!S_str_opt) S_str_opt = SEC_DC_AVAIL[SEC_DC_AVAIL.length - 1];

  // Troncal DC desde Combiner Box / Nodo Paralelo Y -> Inversor (S_mdc)
  const isParallelTopo = !!(_cfgAc && (_cfgAc.dcTopology === 'parallel' || _cfgAc.dcTopology === 'parallel_y' || _cfgAc.selectedTopology === 'parallel' || _cfgAc.selectedTopology === 'parallel_y'));
  let S_mdc_opt = S_str_opt;
  if (numStrings > 2 || (isParallelTopo && numStrings >= 2)) {
    const mpptTotalMdc = Math.max(1, ((activeInv && activeInv.mppt) || 2) * invCount);
    const stringsPerTrunk = isParallelTopo
      ? Math.max(2, numStrings)
      : Math.max(2, Math.ceil(numStrings / mpptTotalMdc));
    const I_mdc_design = stringsPerTrunk * I_dc_design;
    const I_mdc_working = stringsPerTrunk * I_dc_working;
    const L_mdc = L_mdc_meas;
    const K_AMPACITY_DC_TRUNK = 0.75 * 0.88;
    let foundMdc = null;
    for (let i = 0; i < SEC_DC_AVAIL.length; i++) {
      const s = SEC_DC_AVAIL[i];
      const imax = IMAX_DC_ZZF[i];
      const dVm = (2 * rho90 * L_mdc * I_mdc_working) / s;
      const dVm_pct = (dVm / Math.max(Vmp_str_hot, 1.0)) * 100;
      if ((imax * K_AMPACITY_DC_TRUNK) >= I_mdc_design && dVm_pct <= 0.5) {
        foundMdc = s;
        break;
      }
    }
    S_mdc_opt = foundMdc || SEC_DC_AVAIL[SEC_DC_AVAIL.length - 1];
    if (S_mdc_opt < S_str_opt) S_mdc_opt = S_str_opt;
  }

  const dV_dc_str = (rho90 * L_dc_eff_loop * I_dc_working) / S_str_opt;
  const dV_dc_trk = (_sState && _sState.L_dc_trunk_measured > 0)
    ? ((2 * rho90 * _sState.L_dc_trunk_measured * (Math.max(1, isParallelTopo ? numStrings : 1) * I_dc_working)) / S_mdc_opt)
    : 0;
  const dV_dc = dV_dc_str + dV_dc_trk;
  const dVdc_pct = (dV_dc / Math.max(Vmp_str_hot, 1.0)) * 100;

  const I_ac_design = 1.25 * I_ac;
  // [AUD-2026 · C-05] Misma fuente única que el tramo DC.
  const SEC_AC_AVAIL = (_RA_SEC && Array.isArray(_RA_SEC.ac)) ? _RA_SEC.ac : [2.5, 4, 6, 10, 16, 25, 35, 50, 70];
  const IMAX_AC_RVK  = (_RA_SEC && Array.isArray(_RA_SEC.acIz)) ? _RA_SEC.acIz : [29, 38, 49, 68, 91, 119, 146, 178, 226];

  let S_ac_opt = null;
  for (let i = 0; i < SEC_AC_AVAIL.length; i++) {
    const s = SEC_AC_AVAIL[i];
    const imax = IMAX_AC_RVK[i];
    const xMeterAc = 0.08 / 1000.0;
    const cosPAc = 0.95;
    const sinPAc = Math.sqrt(Math.max(0, 1.0 - cosPAc * cosPAc));
    const factorPhase = monofasico ? 2.0 : Math.sqrt(3);
    const dV = factorPhase * I_ac * L_ac * ((rho90 / s) * cosPAc + xMeterAc * sinPAc);
    const dV_pct = (dV / V_ac) * 100;
    if ((imax * K_AMPACITY_AC_MAIN) >= I_ac_design && dV_pct <= 1.5) {
      S_ac_opt = s;
      break;
    }
  }
  const isAcCompliant = (S_ac_opt !== null);
  if (!S_ac_opt) S_ac_opt = SEC_AC_AVAIL[SEC_AC_AVAIL.length - 1];

  // Rama AC individual Inversor -> Subcuadro Agrupador cuando invCount > 1
  let S_ac_branch_opt = S_ac_opt;
  if (invCount > 1) {
    const I_ac_unit = I_ac / invCount;
    const I_ac_unit_design = 1.25 * I_ac_unit;
    const L_ac_branch = 5;
    let foundAcBranch = null;
    for (let i = 0; i < SEC_AC_AVAIL.length; i++) {
      const s = SEC_AC_AVAIL[i];
      const imax = IMAX_AC_RVK[i];
      const xMeterAc = 0.08 / 1000.0;
      const cosPAc = 0.95;
      const sinPAc = Math.sqrt(Math.max(0, 1.0 - cosPAc * cosPAc));
      const factorPhase = monofasico ? 2.0 : Math.sqrt(3);
      const dV = factorPhase * I_ac_unit * L_ac_branch * ((rho90 / s) * cosPAc + xMeterAc * sinPAc);
      const dV_pct = (dV / V_ac) * 100;
      if ((imax * K_AMPACITY_AC_BRANCH) >= I_ac_unit_design && dV_pct <= 1.5) {
        foundAcBranch = s;
        break;
      }
    }
    S_ac_branch_opt = foundAcBranch || SEC_AC_AVAIL[SEC_AC_AVAIL.length - 1];
  }

  const xMeterAcOpt = 0.08 / 1000.0;
  const cosPAcOpt = 0.95;
  const sinPAcOpt = Math.sqrt(Math.max(0, 1.0 - cosPAcOpt * cosPAcOpt));
  const factorPhaseOpt = monofasico ? 2.0 : Math.sqrt(3);
  const dV_ac = factorPhaseOpt * I_ac * L_ac * ((rho90 / S_ac_opt) * cosPAcOpt + xMeterAcOpt * sinPAcOpt);
  const dVac_pct = (dV_ac / V_ac) * 100;

  const isCompliantREBT = isDcCompliant && (dVdc_pct <= 1.5) && isAcCompliant && (dVac_pct <= 1.5);

  const STD_IGA = [16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250];
  const I_iga = STD_IGA.find(i => i >= I_ac_design) || (I_ac_design > 125 ? Math.ceil(I_ac_design / 10) * 10 : 63);
  const hasExternalLightningRod = !!(_cfgAc && _cfgAc.hasExternalLightningRod);
  const isMicroinverter = !!(_cfgAc && _cfgAc.selectedTopology === 'microinverter');
  const hasBatCfg = !!(_cfgAc && _cfgAc.selectedBatteryId && _cfgAc.selectedBatteryId !== 'bat_none');
  const includeBackupBox = !!(_cfgAc && _cfgAc.includeBackupBox !== false && hasBatCfg);
  const spdClaseLabel = hasExternalLightningRod ? "Clase I+II (Tipo 1+2 · CTE SUA 8)" : "Clase II (Tipo 2)";
  const spdType = hasExternalLightningRod
    ? "Tipo 1+2 / Clase I+II (1000 V CC / 400 V AC - Iimp 12,5 kA / Imax 40 kA)"
    : "Tipo 2 / Clase II (1000 V CC / 400 V AC - In 20 kA / Imax 40 kA)";
  const rcdSpec = raResolveRcdSpec({
    igaIn: I_iga,
    isThreePhase: !monofasico,
    totalAcKw: total_ac_kW,
    topology: isMicroinverter ? 'microinverter' : (_cfgAc && _cfgAc.selectedTopology),
    inv: activeInv || _selInv
  });
  const dif_amp = rcdSpec.inA;
  const rcdType = rcdSpec.rcdType;
  const rcdSensMa = rcdSpec.sensibilidadMa;

  // Cálculo de fusibles gPV por MPPT (>= 3 cadenas en paralelo en el mismo MPPT, IEC 62548 Cláusula 6.5.3)
  let stringsPerMpptMax = 1;
  const renderedActive = (typeof root !== 'undefined' && Array.isArray(root.allRenderedPanels))
    ? root.allRenderedPanels.filter(p => p && !p.deleted && !p.disabled && p.stringName && p.mpptId)
    : [];
  if (renderedActive.length > 0) {
    const perMpptStrings = new Map();
    renderedActive.forEach(p => {
      if (!perMpptStrings.has(p.mpptId)) perMpptStrings.set(p.mpptId, new Set());
      perMpptStrings.get(p.mpptId).add(p.stringName);
    });
    perMpptStrings.forEach(sSet => {
      if (sSet.size > stringsPerMpptMax) stringsPerMpptMax = sSet.size;
    });
  } else {
    const mpptTotal = Math.max(1, ((activeInv && activeInv.mppt) || 2) * invCount);
    stringsPerMpptMax = Math.max(1, Math.ceil(numStrings / mpptTotal));
  }
  const useFuses = !isMicroinverter && (stringsPerMpptMax >= 3);
  const fuseMinA = Math.ceil((Isc * bifacialGainFactor) * 1.56);
  const fuseRatings = [12, 15, 16, 20, 25, 30, 32];
  const fuse_std = useFuses ? (fuseRatings.find(f => f >= fuseMinA) || fuseMinA) : null;
  const maxModFuseA = Number(cfg && (cfg.maxSeriesFuseA || cfg.maxFuseA || 30)) || 30;
  const fuseExceedsModRating = Boolean(useFuses && fuse_std && fuse_std > maxModFuseA);
  const S_earth = hasExternalLightningRod ? 16 : 6;
  const microBranches = isMicroinverter ? Math.max(1, Math.ceil(total_ac_kW / (monofasico ? 3.68 : 11.0))) : 0;
  const hasIntegratedDcSwitch = !activeInv || (activeInv.integratedDcSwitch !== false);
  const needsExternalDcPanel = !isMicroinverter && (useFuses || hasExternalLightningRod || L_dc_string > 10 || !hasIntegratedDcSwitch);

  const prInfo = (typeof window !== 'undefined' && typeof window.raCalculateSystemPR === 'function')
    ? window.raCalculateSystemPR(1.0 - 0.075) // derating térmico estándar 7.5%
    : { prTotal: 0.80, factors: { soiling: 0.025, iamAngular: 0.028, mismatch: 0.020, wiring: 0.015, inverter: 0.025 } };

  const loss_soiling = prInfo.factors.soiling;
  const loss_iam = prInfo.factors.iamAngular;
  const loss_temp = 0.075;
  const loss_mismatch = prInfo.factors.mismatch;
  const loss_dc_ohmic = dVdc_pct > 0 ? (dVdc_pct / 100) : prInfo.factors.wiring;
  const loss_inverter = prInfo.factors.inverter;
  const loss_ac_ohmic = dVac_pct / 100;

  const total_eff = prInfo.prTotal;
  const PR_calc = Math.round(total_eff * 1000) / 1000;

  return {
    P_dc_kW,
    P_ac_kW: total_ac_kW,
    inv_kW,
    invCount,
    total_P_ac_kW,
    monofasico,
    V_ac,
    V_max_inv: V_dc_max,
    V_mppt_min: V_mppt_min,
    V_mppt_max: V_mppt_max,
    activeInv: activeInv,
    Voc_mod_cold: Math.round(Voc_cold * 100) / 100,
    I_ac: Math.round(I_ac * 10) / 10,
    I_ac_design: Math.round(I_ac_design * 10) / 10,
    rcdType,
    rcdSensMa,
    numStrings,
    stringsPerMpptMax,
    useFuses,
    fuse_std,
    modsPerString,
    minModsPerString,
    maxModsPerString,
    Voc_str_stc: Math.round(Voc_str_stc * 10) / 10,
    Voc_str_max: Math.round(Voc_str_max * 10) / 10,
    Vmp_str_hot: Math.round(Vmp_str_hot * 10) / 10,
    I_total_dc: Math.round(I_total_dc * 10) / 10,
    S_str: S_str_opt,
    S_mdc: S_mdc_opt,
    dVdc_pct: Math.round(dVdc_pct * 100) / 100,
    dV_dc: dV_dc,
    dV_ac: dV_ac,
    S_ac: S_ac_opt,
    S_ac_branch: S_ac_branch_opt,
    S_earth,
    dVac_pct: Math.round(dVac_pct * 100) / 100,
    isCompliantREBT,
    isDcCompliant: isDcCompliant && (dVdc_pct <= 1.5),
    isAcCompliant: isAcCompliant && (dVac_pct <= 1.5),
    rebtWarning: !isCompliantREBT ? (
      (dVdc_pct > 1.5)
        ? `REBT ITC-BT-40: Caída de tensión DC (${dVdc_pct.toFixed(2)}%) supera el 1.5% máximo permitido.`
        : `REBT ITC-BT-40: Caída de tensión AC (${dVac_pct.toFixed(2)}%) supera el 1.5% máximo permitido.`
    ) : null,
    I_iga,
    dif_amp,
    spdType,
    spdClaseLabel,
    hasExternalLightningRod,
    isMicroinverter,
    includeBackupBox,
    needsExternalDcPanel,
    microBranches,
    fuseExceedsModRating,
    PR: PR_calc,
    lossTree: {
      soiling: Math.round(loss_soiling * 1000) / 10,
      iam: Math.round(loss_iam * 1000) / 10,
      thermal: Math.round(loss_temp * 1000) / 10,
      mismatch: Math.round(loss_mismatch * 1000) / 10,
      dc_ohmic: Math.round(loss_dc_ohmic * 1000) / 10,
      inverter: Math.round(loss_inverter * 1000) / 10,
      ac_ohmic: Math.round(loss_ac_ohmic * 1000) / 10,
      net_PR: Math.round(PR_calc * 1000) / 10
    }
  };
}
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
  root.calculateGlobalVoltageDrop = calculateGlobalVoltageDrop;
  root.calculateElectricalProtections = calculateElectricalProtections;
  root.rebalanceMPPTAssignment = rebalanceMPPTAssignment;
  root.validateMPPTHomogeneity = validateMPPTHomogeneity;
  root.applyCustomStringsToPanels = applyCustomStringsToPanels;
  root.getPanelManualKey = getPanelManualKey;
  root.calculateInverterEfficiencyAndClipping = calculateInverterEfficiencyAndClipping;
  root.raInverterPhases = raInverterPhases;
  root.raResolveAcPhases = raResolveAcPhases;
  root.raGetMicroinverterRatio = raGetMicroinverterRatio;
  root.raResolveRcdSpec = raResolveRcdSpec;
  root.normalizeThermalCoeff = normalizeThermalCoeff;

  if (!root.RA) root.RA = {};
  root.RA.Electrical = {
    constants: ELEC_CONSTANTS,
    normalizeThermalCoeff: normalizeThermalCoeff,
    getPolylineStringColor: getPolylineStringColor,
    calculateDynamicMPPTStringLimits: calculateDynamicMPPTStringLimits,
    computeSizingEngineering: computeSizingEngineering,
    // [AUD-2026 · C-05] Tablas canónicas de secciones y ampacidad (fuente única).
    SECCIONES: {
      dc: ELEC_CONSTANTS.SEC_DC_AVAIL,
      dcIz: ELEC_CONSTANTS.IMAX_DC_ZZF,
      ac: ELEC_CONSTANTS.SEC_AC_AVAIL,
      acIz: ELEC_CONSTANTS.IMAX_AC_RVK
    },
    getNearestValidStringModuleCount: getNearestValidStringModuleCount,
    getSnakeOrderedPanels: getSnakeOrderedPanels,
    generateSnakeWiringPositions: generateSnakeWiringPositions,
    partitionPanelsIntoMPPTStrings: partitionPanelsIntoMPPTStrings,
    matchInvertersFromCatalog: matchInvertersFromCatalog,
    calculateVoltageDrop: calculateVoltageDrop,
    calculateGlobalVoltageDrop: calculateGlobalVoltageDrop,
    calculateElectricalProtections: calculateElectricalProtections,
    calculateProtections: calculateElectricalProtections,
    rebalanceMPPTAssignment: rebalanceMPPTAssignment,
    validateMPPTHomogeneity: validateMPPTHomogeneity,
    applyCustomStringsToPanels: applyCustomStringsToPanels,
    getPanelManualKey: getPanelManualKey,
    calculateInverterEfficiencyAndClipping: calculateInverterEfficiencyAndClipping,
    raInverterPhases: raInverterPhases,
    raResolveAcPhases: raResolveAcPhases,
    getMicroinverterRatio: raGetMicroinverterRatio,
    resolveRcdSpec: raResolveRcdSpec,
    updateInverterAssistant: wpUpdateInverterSmartAssistantUI,
    applyRecommendedInverter: wpApplyRecommendedInverter,
    updateMeterPlacementGuide: wpUpdateMeterPlacementGuideUI,
    setStringWiringTopology: wpSetStringWiringTopology
  };

})(typeof window !== 'undefined' ? window : globalThis);

