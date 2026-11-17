// ============================================================================
// js/solar-yield-controller.js — Controlador de Producción Solar y HUD (Fase B3)
// ============================================================================
function recalculateSolarYield(force = false) {
  // [ZERO-LAG CAD · LAZY EVALUATION] En Pasos 1 y 2 solo actualizar métricas teóricas O(1)
  const currentStep = (typeof wpCurrentStep !== 'undefined') ? wpCurrentStep : ((typeof window !== 'undefined' && window.wpCurrentStep) || 1);
  if (!force && currentStep < 3) {
    if (typeof window !== 'undefined') {
      if (!window.solarSimState) window.solarSimState = {};
      window.solarSimState.solarYieldDirty = true;
    }
    if (typeof wpUpdateLayoutFastMetrics === 'function') {
      wpUpdateLayoutFastMetrics();
    }
    return;
  }

  let pa = polygonAnalysis();
  if (!pa && typeof WP !== 'undefined' && WP && WP.polylines && WP.polylines.length > 0) {
    const selIdx = (WP.selectedPolyIdx >= 0 && WP.selectedPolyIdx < WP.polylines.length) ? WP.selectedPolyIdx : 0;
    const selPoly = WP.polylines[selIdx] || WP.polylines[0];
    if (selPoly && selPoly.points && selPoly.points.length >= 3) {
      pa = polygonAnalysis(selPoly.points);
    }
  }
  if (!pa && (!WP || !WP.polylines || WP.polylines.length === 0)) {
    resetSolarDashboard();
    return;
  }
  const latDeg = pa ? pa.latDeg : ((typeof window.solarProjectConfig !== 'undefined' && typeof window.solarProjectConfig.lat === 'number') ? window.solarProjectConfig.lat : 41.3851);
  const lonDeg = pa ? (pa.lonDeg !== undefined ? pa.lonDeg : ((typeof window.solarProjectConfig !== 'undefined' && typeof window.solarProjectConfig.lng === 'number') ? window.solarProjectConfig.lng : 2.1734)) : 2.1734;

  if (pa && typeof window !== 'undefined' && window.solarProjectConfig) {
    window.solarProjectConfig.lat = latDeg;
    window.solarProjectConfig.lng = lonDeg;
    window.solarProjectConfig.latitude = latDeg;
    window.solarProjectConfig.longitude = lonDeg;
  }
  const azimuthDeg = pa ? pa.azimuthDeg : 0;
  const tiltDeg = pa ? pa.tiltDeg : 30;
  let area3D = 0;
  if (typeof WP !== 'undefined' && WP && Array.isArray(WP.polylines) && WP.polylines.length > 0) {
    WP.polylines.forEach(poly => {
      const pInf = poly.roofInfo || (typeof computeSinglePolylineRoofInfo === 'function' ? computeSinglePolylineRoofInfo(poly.points, poly) : null);
      if (pInf && typeof pInf.area3D === 'number' && pInf.area3D > 0) {
        area3D += pInf.area3D;
      } else if (typeof polygonAnalysis === 'function' && Array.isArray(poly.points) && poly.points.length >= 3) {
        const polyAnalysis = polygonAnalysis(poly.points);
        if (polyAnalysis && polyAnalysis.area3D) area3D += polyAnalysis.area3D;
      }
    });
  }
  if (area3D <= 0) {
    area3D = pa ? pa.area3D : 0;
  }
  const usefulArea = area3D * 0.80;
  const pCfg = (typeof panelConfig !== 'undefined' && panelConfig) ? panelConfig : {};
  const modulePowerW = pCfg.potencia || 450;
  const moduleArea = (pCfg.largo || 2.10) * (pCfg.ancho || 1.05);

  // <i data-lucide=\"rocket\" class=\"icon-sm\"></i> SOPORTE TOTAL MULTI-CUBIERTA / PLANOS DE TRABAJO (WP.polylines)
  let totalPanelsCount = 0;
  let dominantRoofInfo = null;
  const hasPolys = (typeof WP !== 'undefined' && WP && WP.polylines && WP.polylines.length > 0);
  if (hasPolys) {
    // Si hay un faldón seleccionado por el usuario y está activo, darle prioridad como faldón de referencia
    const selIdx = (WP.selectedPolyIdx >= 0 && WP.selectedPolyIdx < WP.polylines.length) ? WP.selectedPolyIdx : 0;
    const selPoly = WP.polylines[selIdx];
    if (selPoly && !selPoly.panelsDisabled) {
      dominantRoofInfo = selPoly.roofInfo || (typeof computeSinglePolylineRoofInfo === 'function' ? computeSinglePolylineRoofInfo(selPoly.points, selPoly) : null);
    }

    WP.polylines.forEach(poly => {
      if (poly.panelsDisabled === true) return;
      const pInf = poly.roofInfo || (typeof computeSinglePolylineRoofInfo === 'function' ? computeSinglePolylineRoofInfo(poly.points, poly) : null);
      if (pInf && pInf.panels) {
        totalPanelsCount += pInf.panels.filter(p => !p.deleted && !p.disabled).length;
        if (!dominantRoofInfo) dominantRoofInfo = pInf;
      }
    });
  }

  const roofInfo = dominantRoofInfo || (hasPolys ? null : computeRoofPanelsData());
  const renderedPanelsCount = (typeof window.allRenderedPanels !== 'undefined' && Array.isArray(window.allRenderedPanels))
    ? window.allRenderedPanels.filter(p => !p.deleted && !p.disabled).length
    : 0;
  const numPanels = renderedPanelsCount > 0
    ? renderedPanelsCount
    : (totalPanelsCount > 0
        ? totalPanelsCount
        : (hasPolys ? 0 : ((roofInfo && roofInfo.panels && roofInfo.panels.length > 0)
            ? roofInfo.panels.length
            : 0)));

  if (numPanels === 0) {
    resetSolarDashboard();
    if (typeof window !== 'undefined' && window.RA) {
      window.RA.solarStats = {
        numPanels: 0,
        peakPowerKW: 0,
        annualYieldKWh: 0,
        annualGrossKWh: 0,
        annualShadowLossKWh: 0,
        annualSystemLossKWh: 0,
        annualKWh: 0,
        theoreticalAnnualKWh: 0,
        performanceRatio: 0,
        co2AvoidedTonsYear: 0,
        treesEquivalent: 0,
        specificYield: 0,
        monthlyKWh: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
      };
    }
    if (typeof raUpdateEnergyHUD === 'function') {
      raUpdateEnergyHUD();
    }
    if (typeof ProjectStatusHUD !== 'undefined' && ProjectStatusHUD && typeof ProjectStatusHUD.update === 'function') {
      ProjectStatusHUD.update();
    } else if (typeof RAProjectStatusHUD !== 'undefined' && RAProjectStatusHUD && typeof RAProjectStatusHUD.update === 'function') {
      RAProjectStatusHUD.update();
    }
    return;
  }

  const modTilt = (roofInfo && roofInfo.moduleTiltDeg !== undefined) ? roofInfo.moduleTiltDeg : (tiltDeg >= 8 ? tiltDeg : 30);
  const modAzimuth = (roofInfo && roofInfo.moduleAzimuthDeg !== undefined) ? roofInfo.moduleAzimuthDeg : azimuthDeg;
  const orientationLabel = roofInfo && roofInfo.orientation === 'landscape' ? 'Landscape (H)' : 'Portrait (V)';
  const modAzSigned = modAzimuth > 180 ? modAzimuth - 360 : modAzimuth;

  let cardinal = 'Sur';
  if (Math.abs(modAzSigned) < 22.5) cardinal = 'Sur';
  else if (modAzSigned >= 22.5 && modAzSigned < 67.5) cardinal = 'Sur-Oeste';
  else if (modAzSigned >= 67.5 && modAzSigned < 112.5) cardinal = 'Oeste';
  else if (modAzSigned >= 112.5 && modAzSigned < 157.5) cardinal = 'Nor-Oeste';
  else if (modAzSigned <= -22.5 && modAzSigned > -67.5) cardinal = 'Sur-Este';
  else if (modAzSigned <= -67.5 && modAzSigned > -112.5) cardinal = 'Este';
  else if (modAzSigned <= -112.5 && modAzSigned > -157.5) cardinal = 'Nor-Este';
  else cardinal = 'Norte';

  const peakPowerKW = (numPanels * modulePowerW) / 1000.0;

  // <i data-lucide=\"rocket\" class=\"icon-sm\"></i> MODELO TÉRMICO PVSYST / SANDIA NATIONAL LABS (T_cell, NOCT 45°C, Gamma -0.35%/°C)
  const avgAmbTempC = 18.5; // Temperatura ambiente media anual en España
  const avgPoaIrradW_m2 = 650.0;
  const noctC = 45.0;
  const cellTempC = avgAmbTempC + ((noctC - 20.0) / 800.0) * avgPoaIrradW_m2;
  const gammaPmp = -0.0035; // -0.35%/°C (Silicio Monocristalino N-Type TOPCon/PERC)
  const thermalDeratingFactor = Math.max(0.70, 1.0 + gammaPmp * (cellTempC - 25.0));

  const latFactor = 1.0 + (38.0 - latDeg) * 0.015;
  const prObj = (typeof window !== 'undefined' && typeof window.raCalculateSystemPR === 'function')
    ? window.raCalculateSystemPR(thermalDeratingFactor)
    : { prTotal: 0.82 * thermalDeratingFactor };
  const pr = prObj.prTotal;

  // <i data-lucide=\"sun\" class=\"icon-sm\"></i> FÍSICA SOLAR ESTACIONAL EN PLANO INCLINADO (POA - HAY-DAVIES / LIU & JORDAN)
  // Declinaciones solares medias mensuales (°), correspondientes a los días representativos del año solar
  const MONTHLY_DECLINATIONS = [-20.9, -13.0, -2.4, 9.4, 18.8, 23.1, 21.2, 13.5, 2.2, -9.6, -18.9, -23.0];
  
  const latRad = latDeg * Math.PI / 180.0;

  // Desglose por subcampos (faldones) para que al cambiar βm o γ en un faldón responda con precisión exacta
  const subArrays = [];
  if (typeof WP !== 'undefined' && WP && Array.isArray(WP.polylines) && WP.polylines.length > 0) {
    WP.polylines.forEach((poly, pIdx) => {
      if (poly.panelsDisabled === true) return;
      const pInf = poly.roofInfo || (typeof computeSinglePolylineRoofInfo === 'function' ? computeSinglePolylineRoofInfo(poly.points, poly) : null);
      const pCount = (pInf && Array.isArray(pInf.panels)) ? pInf.panels.filter(p => !p.deleted && !p.disabled).length : 0;
      if (pCount <= 0) return;
      const pWp = (typeof wpGetPolyWp === 'function') ? wpGetPolyWp(poly) : modulePowerW;
      const roofSlope = (pInf && typeof pInf.tiltDeg === 'number') ? pInf.tiltDeg : ((poly.roofInfo && typeof poly.roofInfo.tiltDeg === 'number') ? poly.roofInfo.tiltDeg : 0);
      let pTilt = (pInf && typeof pInf.moduleTiltDeg === 'number')
        ? pInf.moduleTiltDeg
        : ((typeof poly.modTilt === 'number') ? poly.modTilt : modTilt);
      if (pTilt === 0 && roofSlope > 3) {
        pTilt = roofSlope;
      }
      let pAzSur = (pInf && typeof pInf.moduleAzimuthDeg === 'number')
        ? pInf.moduleAzimuthDeg
        : ((typeof poly.modAzimuth === 'number') ? (poly.modAzimuth - 180) : modAzSigned);
      while (pAzSur > 180) pAzSur -= 360;
      while (pAzSur < -180) pAzSur += 360;
      const isEW = !!(poly.estructura && poly.estructura.subtype === 'east_west');
      subArrays.push({
        polyIdx: pIdx,
        nPanels: pCount,
        kwp: (pCount * pWp) / 1000.0,
        tiltDeg: pTilt,
        azSurDeg: pAzSur,
        isEastWest: isEW
      });
    });
  }
  if (subArrays.length === 0) {
    subArrays.push({
      polyIdx: 0,
      nPanels: numPanels,
      kwp: peakPowerKW,
      tiltDeg: modTilt,
      azSurDeg: modAzSigned,
      isEastWest: false
    });
  }

  let monthlyYields = [];
  let annualYieldKWh = 0;
  let annualGrossYield = 0;
  const subArrayAnnualGross = new Map();

  for (let m = 0; m < 12; m++) {
    const declRad = MONTHLY_DECLINATIONS[m] * Math.PI / 180.0;

    // Altura solar al mediodía astronómico
    const sinAlphaMid = Math.sin(latRad) * Math.sin(declRad) + Math.cos(latRad) * Math.cos(declRad);
    const alphaMid = Math.asin(Math.max(0.02, Math.min(1.0, sinAlphaMid)));

    // Fracción difusa estacional (DHI/GHI) y albedo de suelo
    const dhiFrac = 0.32 + 0.06 * Math.cos((m - 6) * Math.PI / 6);
    const dniFrac = Math.max(0.0, 1.0 - dhiFrac);

    // Recurso solar geolocalizado SSOT (getRobustMonthlyGHI): integra radiación horizontal real del emplazamiento
    const baseGHI_Wh = (typeof getRobustMonthlyGHI === 'function')
      ? getRobustMonthlyGHI(latDeg, (pa && pa.lonDeg !== undefined ? pa.lonDeg : -3.7), m)
      : (SOLAR_RAD_MONTHLY_BASE[m] * 1000);

    let monthGrossSum = 0;
    for (let s = 0; s < subArrays.length; s++) {
      const sa = subArrays[s];
      const sTiltRad = sa.tiltDeg * Math.PI / 180.0;
      const sAzRad = sa.azSurDeg * Math.PI / 180.0;
      let poaFactor;
      if (sa.isEastWest) {
        const cosIncE = Math.sin(alphaMid) * Math.cos(sTiltRad) + Math.cos(alphaMid) * Math.sin(sTiltRad) * Math.cos(sAzRad - Math.PI / 2);
        const cosIncW = Math.sin(alphaMid) * Math.cos(sTiltRad) + Math.cos(alphaMid) * Math.sin(sTiltRad) * Math.cos(sAzRad + Math.PI / 2);
        const rbEW = 0.5 * (Math.max(0.05, cosIncE / Math.max(0.08, Math.sin(alphaMid))) + Math.max(0.05, cosIncW / Math.max(0.08, Math.sin(alphaMid))));
        poaFactor = (dniFrac * rbEW) + (dhiFrac * (1.0 + Math.cos(sTiltRad)) / 2.0) + (0.20 * (1.0 - Math.cos(sTiltRad)) / 2.0);
      } else {
        const cosIncMid = Math.sin(alphaMid) * Math.cos(sTiltRad) + Math.cos(alphaMid) * Math.sin(sTiltRad) * Math.cos(sAzRad);
        const rbMid = Math.max(0.05, cosIncMid / Math.max(0.08, Math.sin(alphaMid)));
        poaFactor = (dniFrac * rbMid) + (dhiFrac * (1.0 + Math.cos(sTiltRad)) / 2.0) + (0.20 * (1.0 - Math.cos(sTiltRad)) / 2.0);
      }
      const dailyPoa = (baseGHI_Wh / 1000.0) * Math.max(0.15, poaFactor);
      const saMonthGross = sa.kwp * dailyPoa * MONTH_DAYS[m];
      monthGrossSum += saMonthGross;
      subArrayAnnualGross.set(sa.polyIdx, (subArrayAnnualGross.get(sa.polyIdx) || 0) + saMonthGross);
    }

    annualGrossYield += monthGrossSum;
    const monthlyKWh = monthGrossSum * pr;
    monthlyYields.push(Math.round(monthlyKWh));
    annualYieldKWh += monthlyKWh;
  }
  
  // Calcular porcentaje de sombra medio de los paneles reales renderizados
  let avgShadowLossPct = 0;
  let sumPotentialWh = 0;
  let sumShadedLossWh = 0;
  let totalShadowLoss = 0;
  let totalPanelsCountForShadows = 0;

  const gatherPanelLoss = p => {
    if (!p || p.deleted || p.disabled) return;
    if (typeof p.annualTotalPotential === 'number' && p.annualTotalPotential > 0) {
      sumPotentialWh += p.annualTotalPotential;
      sumShadedLossWh += (p.annualShadedLoss || 0);
    }
    totalShadowLoss += (typeof p.annualLossPct === 'number' ? p.annualLossPct : 0);
    totalPanelsCountForShadows++;
  };

  if (typeof window.allRenderedPanels !== 'undefined' && Array.isArray(window.allRenderedPanels) && window.allRenderedPanels.length > 0) {
    window.allRenderedPanels.forEach(gatherPanelLoss);
  } else if (typeof window.WP !== 'undefined' && window.WP && window.WP.polylines) {
    window.WP.polylines.forEach(poly => {
      const panels = Array.isArray(poly.panels) ? poly.panels : (poly.roofInfo && Array.isArray(poly.roofInfo.panels) ? poly.roofInfo.panels : []);
      panels.forEach(gatherPanelLoss);
    });
  } else if (roofInfo && roofInfo.panels) {
    roofInfo.panels.forEach(gatherPanelLoss);
  }

  if (sumPotentialWh > 0) {
    avgShadowLossPct = (sumShadedLossWh / sumPotentialWh) * 100.0;
  } else if (totalPanelsCountForShadows > 0) {
    avgShadowLossPct = totalShadowLoss / totalPanelsCountForShadows;
  }
  
  // Aplicar pérdida por sombras al final yield
  const shadowLossFactor = 1.0 - (avgShadowLossPct / 100.0);
  
  // Desglose canónico puro (SSOT):
  let annualGrossKWh = Math.round(annualGrossYield);
  let theoreticalAnnualKWh = Math.round(annualGrossYield * pr);
  let annualShadowLossKWh = Math.round(annualGrossKWh * (avgShadowLossPct / 100.0));
  let energyAfterShadows = Math.max(0, annualGrossKWh - annualShadowLossKWh);
  let annualSystemLossKWh = Math.round(energyAfterShadows * (1.0 - pr));
  annualYieldKWh = Math.max(0, energyAfterShadows - annualSystemLossKWh);

  // Sincronizar reactivamente cada panel individual en 3D con el nuevo PR
  if (typeof window.allRenderedPanels !== 'undefined' && Array.isArray(window.allRenderedPanels) && window.allRenderedPanels.length > 0) {
    const nPanels = window.allRenderedPanels.length;
    const prSys = (typeof prObj.prBOS === 'number') ? prObj.prBOS : (pr / (0.925 * (1 - 0.028)));

    const hasSimulatedPanels = window.allRenderedPanels.some(p =>
      (typeof p.annualGrossKwh === 'number' && p.annualGrossKwh > 0) ||
      (typeof p.annualKwh === 'number' && p.annualKwh > 0)
    );
    let simulatedTotalKWh = 0;
    let simulatedGrossKWh = 0;
    window.allRenderedPanels.forEach(p => {
      if (!p || p.deleted || p.disabled) return;
      const pYieldFactor = (typeof p.annualYieldPct === 'number') ? (p.annualYieldPct / 100.0) : shadowLossFactor;
      const pPolyIdx = (typeof p.polyIdx === 'number') ? p.polyIdx : 0;
      const sa = subArrays.find(s => s.polyIdx === pPolyIdx);
      const curTilt = (typeof p.tiltDeg === 'number') ? p.tiltDeg : (sa ? sa.tiltDeg : modTilt);
      const curAz = (typeof p.azimuthDeg === 'number') ? p.azimuthDeg : (sa ? sa.azSurDeg : modAzSigned);

      let basePanelGross = annualGrossKWh / nPanels;
      if (sa && sa.nPanels > 0 && subArrayAnnualGross.has(sa.polyIdx)) {
        basePanelGross = subArrayAnnualGross.get(sa.polyIdx) / sa.nPanels;
      }

      // Base bruta coherente: si la bruta guardada no cuadra con la neta y el PR con que se
      // generó (bruta obsoleta de un cálculo paramétrico previo), manda la neta simulada.
      let storedGross = (typeof p.annualGrossKwh === 'number' && p.annualGrossKwh > 0) ? p.annualGrossKwh : 0;
      if (storedGross > 0 && typeof p.annualKwh === 'number' && p.annualKwh > 0 &&
          typeof p._lastPrSys === 'number' && p._lastPrSys > 0) {
        const impliedGross = p.annualKwh / p._lastPrSys;
        if (Math.abs(storedGross - impliedGross) > Math.max(1, impliedGross * 0.02)) storedGross = impliedGross;
      }
      const gross = hasSimulatedPanels
        ? (storedGross > 0
            ? storedGross
            : (typeof p.annualKwh === 'number' && p.annualKwh > 0 ? (p.annualKwh / (p._lastPrSys || prSys || 0.885)) : (basePanelGross * pYieldFactor)))
        : (basePanelGross * pYieldFactor);

      p.annualGrossKwh = gross;
      p._poaTiltDeg = curTilt;
      p._poaAzDeg = curAz;
      p._lastPrSys = prSys;
      p.annualKwh = Math.round(gross * prSys);
      simulatedGrossKWh += gross;
      simulatedTotalKWh += p.annualKwh;
    });

    if (simulatedTotalKWh > 0) {
      // Cascada física canónica (IEC 61724 / PVsyst) anclada a la simulación 3D:
      // 1. Energía tras sombras = suma de generación bruta real calculada panel a panel por raycast
      // 2. Pérdidas de sistema (PR) = Energía tras sombras × (1 - PR_sistema)
      // 3. Producción Neta = Energía tras sombras - Pérdidas de sistema (= simulatedTotalKWh)
      // 4. Producción Bruta potencial sin obstáculos y Pérdida por Sombras
      energyAfterShadows = Math.round(simulatedGrossKWh);
      annualYieldKWh = simulatedTotalKWh;
      annualSystemLossKWh = Math.max(0, energyAfterShadows - annualYieldKWh);

      if (avgShadowLossPct > 0 && avgShadowLossPct < 99.0) {
        annualGrossKWh = Math.round(energyAfterShadows / (1.0 - (avgShadowLossPct / 100.0)));
        annualShadowLossKWh = Math.max(0, annualGrossKWh - energyAfterShadows);
      } else {
        annualGrossKWh = Math.round(Math.max(energyAfterShadows, annualGrossYield));
        annualShadowLossKWh = Math.max(0, annualGrossKWh - energyAfterShadows);
      }
    }
  }

  // Apply shadow factor to monthly yields as well and scale to match annualYieldKWh
  monthlyYields = monthlyYields.map(v => Math.round(v * shadowLossFactor));
  const sumMonthly = monthlyYields.reduce((a, b) => a + b, 0);
  if (sumMonthly > 0 && annualYieldKWh > 0) {
    const ratio = annualYieldKWh / sumMonthly;
    monthlyYields = monthlyYields.map(v => Math.round(v * ratio));
  }

  const optTilt = Math.max(latDeg - 10, 25.0);
  const tiltFactor = Math.cos(Cesium.Math.toRadians(Math.abs(modTilt - optTilt) * 0.65));
  const azFactor   = Math.cos(Cesium.Math.toRadians(Math.abs(modAzSigned) * 0.55));
  const orientationEfficiency = Math.max(tiltFactor * azFactor, 0.45);

  const hsp = peakPowerKW > 0 ? Math.round(annualYieldKWh / peakPowerKW) : 0;
  const avgElectricityPrice = 0.16;
  const annualSavingsEUR = Math.round(annualYieldKWh * avgElectricityPrice);
  const co2AvoidedTons = (annualYieldKWh * 0.259 / 1000.0).toFixed(2);

  setElemText('sol-tilt', modTilt.toFixed(1) + '°');
  setElemText('sol-azimuth', `${modAzSigned >= 0 ? '+' : ''}${modAzSigned.toFixed(1)}° (${cardinal}) · ${orientationLabel}`);
  setElemText('sol-area-3d', area3D.toFixed(1) + ' m²');
  setElemText('sol-panels-count', `${numPanels} módulos`);
  setElemText('sol-peak-power', peakPowerKW.toFixed(2) + ' kWp');
  setElemText('sol-annual-yield', annualYieldKWh.toLocaleString('es-ES') + ' kWh/año');
  setElemText('sol-hsp', hsp.toLocaleString('es-ES') + ' h/año');
  setElemText('sol-efficiency-ratio', (orientationEfficiency * 100).toFixed(1) + '%');
  setElemText('sol-economic-savings', annualSavingsEUR.toLocaleString('es-ES') + ' €/año');
  setElemText('sol-co2-savings', co2AvoidedTons + ' t/año');
  const limits = (typeof calculateDynamicMPPTStringLimits === 'function')
    ? calculateDynamicMPPTStringLimits()
    : { Ns_max: 18, Ns_min: 6, Voc_Tmin: 54.0 };
  const modVoc = pCfg.voc || (pCfg.potencia >= 500 ? 50.0 : 49.5);
  const modImp = pCfg.imp || (pCfg.potencia >= 500 ? 13.5 : 10.8);
  let maxModPerString = 0;
  if (window.allRenderedPanels && window.allRenderedPanels.length > 0) {
    const stringMap = {};
    window.allRenderedPanels.forEach(p => {
      if (!p || p.deleted || p.disabled) return;
      const sId = p.stringId || p.stringName || 'S1';
      stringMap[sId] = (stringMap[sId] || 0) + 1;
    });
    const counts = Object.values(stringMap);
    if (counts.length > 0) {
      maxModPerString = Math.max(...counts);
    }
  }
  if (!maxModPerString && numPanels > 0) {
    const nsMax = limits.Ns_max || 18;
    maxModPerString = Math.min(numPanels, nsMax);
  }
  const stringVocEst = maxModPerString > 0 ? (maxModPerString * (limits.Voc_Tmin || (modVoc * 1.12))) : 0;
  setElemText('sol-string-voc', maxModPerString > 0 ? `${stringVocEst.toFixed(1)} V CC` : '— V CC');
  setElemText('sol-string-imp', `${modImp.toFixed(2)} A`);
  setElemText('p2-prod-annual-badge', `${annualYieldKWh.toLocaleString('es-ES')} kWh/año`);

  renderSolarBarChart(monthlyYields);

  // Update Breakdown UI
  const panelEl = document.getElementById('yield-breakdown-panel');
  if (panelEl) {
    panelEl.style.display = (numPanels > 0) ? 'flex' : 'none';
  }
  if (panelEl && numPanels > 0) {
    
    // Animate numbers if they changed significantly, or just set them
    
    // Update old elements (just in case they exist)
    setElemText('yb-bruta', annualGrossKWh.toLocaleString('es-ES') + ' kWh');
    
    // Update NEW HUD
    const hudEnergy = document.getElementById('ra-hud-energy');
    if (hudEnergy) {
      if (numPanels > 0) {
        hudEnergy.style.display = 'block';
        const isSimulated = Boolean(window.solarSimState && window.solarSimState.annualHeatmapData && !window.solarSimState.annualHeatmapDirty);

        const hudTitleLabel = document.getElementById('hud-title-label');
        if (hudTitleLabel) {
          hudTitleLabel.textContent = isSimulated ? 'Producci\u00f3n Neta Anual:' : 'Prod. Anual Estimada:';
        }
        const hudValNeta = document.getElementById('hud-val-neta');
        if (hudValNeta) {
          hudValNeta.style.color = isSimulated ? '#10B981' : '#38BDF8';
        }
        const hudIcon = document.getElementById('hud-icon-status');
        if (hudIcon) {
          hudIcon.style.color = isSimulated ? '#10B981' : '#38BDF8';
        }
        const hudPill = document.getElementById('ra-hud-pill');
        if (hudPill) {
          hudPill.style.borderColor = isSimulated ? 'rgba(16,185,129,0.4)' : 'rgba(56,189,248,0.45)';
        }

        setElemText('hud-val-neta', annualYieldKWh.toLocaleString('es-ES') + ' kWh/a\u00f1o');
        setElemText('hud-val-bruta', annualGrossKWh.toLocaleString('es-ES') + ' kWh');
        const shadowPctStr = avgShadowLossPct > 0 ? (' (' + avgShadowLossPct.toFixed(1) + '%)') : '';
        setElemText('hud-val-sombras', '-' + annualShadowLossKWh.toLocaleString('es-ES') + ' kWh' + shadowPctStr);
        const sysLossPct = ((1.0 - pr) * 100).toFixed(1);
        setElemText('hud-val-sistema', '-' + annualSystemLossKWh.toLocaleString('es-ES') + ' kWh (' + sysLossPct + '%)');
        
        // Punto terrestre
        const latStr = Math.abs(latDeg).toFixed(2) + '\u00b0' + (latDeg >= 0 ? 'N' : 'S');
        const lonStr = Math.abs(lonDeg).toFixed(2) + '\u00b0' + (lonDeg >= 0 ? 'E' : 'O');
        setElemText('hud-val-coords', `${latStr}, ${lonStr}`);

        const hudBadge = document.getElementById('hud-val-badge');
        const hudPreBadge = document.getElementById('hud-pre-badge');
        if (hudBadge) {
          hudBadge.style.display = isSimulated ? 'flex' : 'none';
        }
        if (hudPreBadge) {
          hudPreBadge.style.display = isSimulated ? 'none' : 'flex';
        }
        if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
      } else {
        hudEnergy.style.display = 'none';
      }
    }

    setElemText('yb-sistema', '-' + annualSystemLossKWh.toLocaleString('es-ES') + ' kWh');
    setElemText('yb-sombras', '-' + annualShadowLossKWh.toLocaleString('es-ES') + ' kWh');
    setElemText('yb-neta', annualYieldKWh.toLocaleString('es-ES') + ' kWh/a\u00f1o');

    // Reveal animation logic
    const rowSombras = document.getElementById('yb-row-sombras');
    const rowSistema = document.getElementById('yb-row-sistema');
    const rowNeta = document.getElementById('yb-row-neta');
    
    // Badge dinámico y robusto
      let badgeEl = document.getElementById('yb-bruta-badge');
      if (!badgeEl) {
        badgeEl = document.createElement('div');
        badgeEl.id = 'yb-bruta-badge';
        badgeEl.innerHTML = '✓ Recalibrado por Simulación 3D';
        badgeEl.style.cssText = 'display:none; font-size: 10px; background:#10B981; color:#ffffff; padding:3px 6px; border-radius:3px; font-weight:bold; margin-top:2px; margin-bottom: 4px; cursor:help; align-self:flex-end; box-shadow: 0 0 5px rgba(16,185,129,0.5);';
        badgeEl.title = 'La estimación teórica ha sido recalibrada usando la inclinación, orientación y sombras exactas.';
        const ybBrutaContainer = document.getElementById('yb-bruta').parentNode;
        ybBrutaContainer.parentNode.insertBefore(badgeEl, ybBrutaContainer.nextSibling);
      }
      
      if (window.solarSimState && window.solarSimState.annualHeatmapData) {
        badgeEl.style.display = 'inline-block';
        
        // Animacion llamativa
        badgeEl.animate([
          { transform: 'scale(0.8)', opacity: 0 },
          { transform: 'scale(1.1)', opacity: 1 },
          { transform: 'scale(1)', opacity: 1 }
        ], { duration: 500, easing: 'ease-out' });
      } else {
        badgeEl.style.display = 'none';
      }
      
      // Si ya se ha calculado la sombra al menos una vez
    if (avgShadowLossPct > 0 || (window.solarSimState && window.solarSimState.annualHeatmapData)) {
      setTimeout(() => { if (rowSombras) rowSombras.style.opacity = '1'; }, 100);
      setTimeout(() => { if (rowSistema) rowSistema.style.opacity = '1'; }, 300);
      setTimeout(() => { if (rowNeta) rowNeta.style.opacity = '1'; }, 500);
    } else {
      // Estado inicial (antes de calcular sombras)
      if (rowSombras) rowSombras.style.opacity = '0.3'; // Semi-transparente hasta que se calcule
      if (rowSistema) rowSistema.style.opacity = '1';
      if (rowNeta) rowNeta.style.opacity = '1';
    }
  }

  // Persistir en window.RA para consumo por financials.js (histograma PDF)
  window.RA = window.RA || {};
  const _hasSimPanels = (typeof window !== 'undefined' && Array.isArray(window.allRenderedPanels)) && window.allRenderedPanels.some(p => (typeof p.annualGrossKwh === 'number' && p.annualGrossKwh > 0) || (typeof p.annualKwh === 'number' && p.annualKwh > 0));
  window.RA.solarStats = {
    numPanels: numPanels,
    annualYieldKWh: annualYieldKWh,
    annualGrossKWh: annualGrossKWh,
    annualShadowLossKWh: annualShadowLossKWh,
    annualSystemLossKWh: annualSystemLossKWh,
    pr: pr,
    latDeg: latDeg,
    lonDeg: lonDeg,
    theoreticalAnnualKWh: theoreticalAnnualKWh,
    simulatedNetKWh: _hasSimPanels ? annualYieldKWh : null,
    hasSimulation: _hasSimPanels,
    avgShadowLossPct: avgShadowLossPct,
    monthlyYields: monthlyYields.slice(),
    peakPowerKW: peakPowerKW,
    hsp: hsp,
    annualSavingsEUR: annualSavingsEUR
  };
  if (typeof window.raUpdateEnergyHUD === 'function') {
    window.raUpdateEnergyHUD();
  }

  // Si el visor 3D se encuentra en modo Heatmap, refrescar las etiquetas 3D de producción por módulo
  if (typeof window.wpRenderHeatmapVisuals === 'function' && window.solarSimState && window.solarSimState.viewMode === 'heatmap') {
    window.wpRenderHeatmapVisuals();
  }

  if (typeof window !== 'undefined') {
    if (!window.solarSimState) window.solarSimState = {};
    window.solarSimState.solarYieldDirty = false;
  }
}
if (typeof window !== 'undefined') window.recalculateSolarYield = recalculateSolarYield;
