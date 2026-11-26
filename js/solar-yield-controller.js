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
        totalPanelsCount += pInf.panels.filter(p => p && !p.deleted && !p.disabled && !p.isGhost).length;
        if (!dominantRoofInfo) dominantRoofInfo = pInf;
      }
    });
  }

  const roofInfo = dominantRoofInfo || (hasPolys ? null : computeRoofPanelsData());
  const renderedPanelsCount = (typeof window.allRenderedPanels !== 'undefined' && Array.isArray(window.allRenderedPanels))
    ? window.allRenderedPanels.filter(p => p && !p.deleted && !p.disabled && !p.isGhost).length
    : 0;
  const numPanels = renderedPanelsCount > 0
    ? renderedPanelsCount
    : (totalPanelsCount > 0
        ? totalPanelsCount
        : (hasPolys ? 0 : ((roofInfo && roofInfo.panels && roofInfo.panels.length > 0)
            ? roofInfo.panels.filter(p => p && !p.deleted && !p.disabled && !p.isGhost).length
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

  // <i data-lucide="rocket" class="icon-sm"></i> MODELO TÉRMICO Y RADIACIÓN POR ZONA CLIMÁTICA + INTEGRACIÓN HORARIA POA
  const climaticZone = (typeof getClimaticZone === 'function') ? getClimaticZone(latDeg, lonDeg) : 'interior';
  const _tAmbTable = (typeof window !== 'undefined' && window.RA && window.RA.Radiation && window.RA.Radiation.T_AMB_MONTHLY_ESP)
    ? window.RA.Radiation.T_AMB_MONTHLY_ESP
    : ((typeof T_AMB_MONTHLY_ESP !== 'undefined') ? T_AMB_MONTHLY_ESP : {
        costal_med: [11.0, 12.0, 14.0, 16.0, 20.0, 25.0, 28.0, 28.5, 24.0, 19.0, 14.0, 11.0],
        costa_med:  [11.0, 12.0, 14.0, 16.0, 20.0, 25.0, 28.0, 28.5, 24.0, 19.0, 14.0, 11.0],
        interior:   [5.0,  7.0,  10.0, 12.0, 17.0, 23.0, 27.0, 27.0, 22.0, 15.0,  9.0,  5.0],
        atlantico:  [9.0,  10.0, 12.0, 13.0, 16.0, 19.0, 21.0, 21.5, 19.0, 15.0, 11.0,  9.0],
        canarias:   [18.0, 18.5, 19.0, 20.0, 21.5, 23.5, 25.0, 26.0, 25.5, 23.5, 21.0, 19.0]
      });
  const zoneMonthlyTamb = _tAmbTable[climaticZone] || _tAmbTable.interior;
  const noctC = Number(pCfg.noct || pCfg.NOCT) || 45.0;
  const _rawGammaPmp = Number(pCfg.tempCoeffPmax || pCfg.gammaPmp);
  const gammaPmp = (Number.isFinite(_rawGammaPmp) && _rawGammaPmp !== 0)
    ? (Math.abs(_rawGammaPmp) > 0.05 ? _rawGammaPmp / 100.0 : _rawGammaPmp)
    : ((pCfg.tecnologia && String(pCfg.tecnologia).includes('N-Type')) ? -0.0028 : -0.0035);

  const latFactor = Math.max(0.80, Math.min(1.25, 1.0 + (38.0 - latDeg) * 0.015));

  // <i data-lucide="sun" class="icon-sm"></i> FÍSICA SOLAR ESTACIONAL EN PLANO INCLINADO (INTEGRACIÓN HORARIA POA)
  const MONTHLY_DECLINATIONS = [-20.9, -13.0, -2.4, 9.4, 18.8, 23.1, 21.2, 13.5, 2.2, -9.6, -18.9, -23.0];
  const MONTHLY_MID_DOY = [17, 47, 75, 105, 135, 162, 198, 228, 258, 288, 318, 344];
  const latRad = latDeg * Math.PI / 180.0;

  // Desglose por subcampos (faldones) para que al cambiar βm o γ en un faldón responda con precisión exacta
  const subArrays = [];
  if (typeof WP !== 'undefined' && WP && Array.isArray(WP.polylines) && WP.polylines.length > 0) {
    WP.polylines.forEach((poly, pIdx) => {
      if (poly.panelsDisabled === true) return;
      const pInf = poly.roofInfo || (typeof computeSinglePolylineRoofInfo === 'function' ? computeSinglePolylineRoofInfo(poly.points, poly) : null);
      const pCount = (pInf && Array.isArray(pInf.panels)) ? pInf.panels.filter(p => p && !p.deleted && !p.disabled && !p.isGhost).length : 0;
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

  const _radApi = (typeof window !== 'undefined' && window.RA && window.RA.Radiation) ? window.RA.Radiation : null;
  const monthGrossList = [];
  let annualGrossYield = 0;
  const subArrayAnnualGross = new Map();
  let poaWeightedTempSum = 0;
  let poaWeightedIrradSum = 0;
  let poaWeightTotal = 0;

  for (let m = 0; m < 12; m++) {
    const doy = MONTHLY_MID_DOY[m];
    const declDeg = (typeof solarDeclination === 'function') ? solarDeclination(doy) : MONTHLY_DECLINATIONS[m];
    const declRad = declDeg * Math.PI / 180.0;
    const tAmbMonth = zoneMonthlyTamb[m] !== undefined ? zoneMonthlyTamb[m] : 18.0;

    // Recurso solar geolocalizado SSOT (getRobustMonthlyGHI): integra radiación horizontal real del emplazamiento
    const baseGHI_Wh = (typeof getRobustMonthlyGHI === 'function')
      ? getRobustMonthlyGHI(latDeg, lonDeg, m)
      : ((_radApi && typeof _radApi.estimateMonthlyGHI === 'function')
          ? _radApi.estimateMonthlyGHI(latDeg, m)
          : ((typeof SOLAR_RAD_MONTHLY_BASE !== 'undefined' ? SOLAR_RAD_MONTHLY_BASE[m] : 4.5) * 1000 * latFactor));

    // Integración horaria diurna (alba a ocaso) para calcular factor POA realista en cualquier orientación (N/S/E/O)
    const wsArg = Math.max(-1, Math.min(1, -Math.tan(latRad) * Math.tan(declRad)));
    const wsDeg = Math.acos(wsArg) * 180.0 / Math.PI;
    const sunriseH = Math.max(4, Math.floor(12 - wsDeg / 15.0));
    const sunsetH = Math.min(20, Math.ceil(12 + wsDeg / 15.0));

    const hourlySun = [];
    let sinAltSum = 0;
    for (let h = sunriseH; h <= sunsetH; h++) {
      const haDeg = 15.0 * (h - 12);
      const haRad = haDeg * Math.PI / 180.0;
      const sinAlt = Math.sin(latRad) * Math.sin(declRad) + Math.cos(latRad) * Math.cos(declRad) * Math.cos(haRad);
      if (sinAlt <= 0.03) continue;
      const elevDeg = Math.asin(Math.min(1.0, sinAlt)) * 180.0 / Math.PI;
      const azN = (typeof solarAzimuthAtan2 === 'function')
        ? solarAzimuthAtan2(latDeg, declDeg, haDeg)
        : ((((Math.atan2(
            -Math.sin(haRad) * Math.cos(declRad),
            Math.sin(declRad) * Math.cos(latRad) - Math.cos(declRad) * Math.sin(latRad) * Math.cos(haRad)
          ) * 180.0 / Math.PI) % 360) + 360) % 360);
      let sunAzSur = azN - 180.0;
      if (sunAzSur > 180) sunAzSur -= 360;
      if (sunAzSur <= -180) sunAzSur += 360;
      sinAltSum += sinAlt;
      hourlySun.push({ h, sinAlt, elevDeg, sunAzSur });
    }
    if (sinAltSum <= 0) sinAltSum = 1;

    // Pre-desagregación Erbs por hora
    const hourlyRad = hourlySun.map(slot => {
      const ghiH = Math.max(0, (baseGHI_Wh / sinAltSum) * slot.sinAlt);
      if (_radApi && typeof _radApi.decomposeErbs === 'function') {
        const dec = _radApi.decomposeErbs(ghiH, slot.elevDeg, doy);
        return { h: slot.h, sinAlt: slot.sinAlt, elevDeg: slot.elevDeg, sunAzSur: slot.sunAzSur, ghi: ghiH, dhi: dec.dhi, dni: dec.dni, e0: dec.e0 };
      }
      const e0 = 1 + 0.033 * Math.cos(2 * Math.PI * (doy - 1) / 365);
      const kt = Math.min(1.0, Math.max(0.0, ghiH / (1367 * e0 * slot.sinAlt + 1e-3)));
      let dhiFrac = 0.165;
      if (kt < 0.22) dhiFrac = 1.0 - 0.09 * kt;
      else if (kt < 0.80) dhiFrac = 0.9511 - 0.1604 * kt + 4.388 * kt * kt - 16.638 * kt * kt * kt + 12.336 * kt * kt * kt * kt;
      const dhi = ghiH * dhiFrac;
      const dni = Math.max(0, Math.min(1150, (ghiH - dhi) / Math.max(slot.sinAlt, 0.05)));
      return { h: slot.h, sinAlt: slot.sinAlt, elevDeg: slot.elevDeg, sunAzSur: slot.sunAzSur, ghi: ghiH, dhi, dni, e0 };
    });

    const evalRawPoaHour = (hr, tiltD, azSurD) => {
      const tiltR = tiltD * Math.PI / 180.0;
      if (_radApi && typeof _radApi.transposeComponents === 'function' && typeof _radApi.incidenceCos === 'function') {
        const cosT = Math.max(0, Math.min(1, _radApi.incidenceCos(tiltD, azSurD, hr.elevDeg, hr.sunAzSur)));
        const tp = _radApi.transposeComponents({
          ghi: hr.ghi, dhi: hr.dhi, dni: hr.dni,
          cosTheta: cosT, tiltRad: tiltR, albedo: 0.20,
          sunElevDeg: hr.elevDeg, dayOfYear: doy, e0: hr.e0
        });
        return (typeof tp.G_poa_raw === 'number') ? tp.G_poa_raw : tp.G_poa;
      }
      const elevR = hr.elevDeg * Math.PI / 180.0;
      const dAzR = (hr.sunAzSur - azSurD) * Math.PI / 180.0;
      const cosT = Math.max(0, Math.min(1, Math.sin(elevR) * Math.cos(tiltR) + Math.cos(elevR) * Math.sin(tiltR) * Math.cos(dAzR)));
      const Ai = Math.max(0, Math.min(1.0, hr.dni / (1367 * (hr.e0 || 1))));
      const G_b = hr.dni * cosT;
      const G_d = hr.dhi * (Ai * (cosT / Math.max(hr.sinAlt, 0.05)) + (1 - Ai) * ((1 + Math.cos(tiltR)) / 2));
      const G_r = hr.ghi * 0.20 * ((1 - Math.cos(tiltR)) / 2);
      return Math.max(0, G_b + G_d + G_r);
    };

    let monthGrossSum = 0;
    for (let s = 0; s < subArrays.length; s++) {
      const sa = subArrays[s];
      let saDailyPoaWh = 0;
      for (let hi = 0; hi < hourlyRad.length; hi++) {
        const hr = hourlyRad[hi];
        let gPoaRawH = 0;
        if (sa.isEastWest) {
          let azE = sa.azSurDeg - 90; while (azE < -180) azE += 360;
          let azW = sa.azSurDeg + 90; while (azW > 180) azW -= 360;
          gPoaRawH = 0.5 * (evalRawPoaHour(hr, sa.tiltDeg, azE) + evalRawPoaHour(hr, sa.tiltDeg, azW));
        } else {
          gPoaRawH = evalRawPoaHour(hr, sa.tiltDeg, sa.azSurDeg);
        }
        saDailyPoaWh += gPoaRawH;
        if (gPoaRawH > 10) {
          const w = gPoaRawH * sa.kwp * MONTH_DAYS[m];
          const tAmbHour = tAmbMonth + 2.5 * Math.sin(Math.max(0, Math.PI * (hr.h - 9) / 12));
          poaWeightedTempSum += tAmbHour * w;
          poaWeightedIrradSum += gPoaRawH * w;
          poaWeightTotal += w;
        }
      }
      const poaFactor = baseGHI_Wh > 0 ? (saDailyPoaWh / baseGHI_Wh) : 1.0;
      const dailyPoa = (baseGHI_Wh / 1000.0) * Math.max(0.15, poaFactor);
      const saMonthGross = sa.kwp * dailyPoa * MONTH_DAYS[m];
      monthGrossSum += saMonthGross;
      subArrayAnnualGross.set(sa.polyIdx, (subArrayAnnualGross.get(sa.polyIdx) || 0) + saMonthGross);
    }

    annualGrossYield += monthGrossSum;
    monthGrossList.push(monthGrossSum);
  }

  const avgAmbTempC = poaWeightTotal > 0
    ? (poaWeightedTempSum / poaWeightTotal)
    : (zoneMonthlyTamb.reduce((a, b) => a + b, 0) / Math.max(1, zoneMonthlyTamb.length));
  const avgPoaIrradW_m2 = poaWeightTotal > 0
    ? (poaWeightedIrradSum / poaWeightTotal)
    : (650.0 * latFactor);
  const cellTempC = avgAmbTempC + ((noctC - 20.0) / 800.0) * avgPoaIrradW_m2;
  const thermalDeratingFactor = Math.max(0.70, Math.min(1.10, 1.0 + gammaPmp * (cellTempC - 25.0)));

  const prObj = (typeof window !== 'undefined' && typeof window.raCalculateSystemPR === 'function')
    ? window.raCalculateSystemPR(thermalDeratingFactor)
    : { prTotal: 0.82 * thermalDeratingFactor };
  const pr = prObj.prTotal;

  let monthlyYields = monthGrossList.map(mg => Math.round(mg * pr));
  let annualYieldKWh = monthlyYields.reduce((a, b) => a + b, 0);
  
  // Calcular porcentaje de sombra medio de los paneles reales renderizados
  let avgShadowLossPct = 0;
  let sumPotentialWh = 0;
  let sumShadedLossWh = 0;
  let totalShadowLoss = 0;
  let totalPanelsCountForShadows = 0;

  const gatherPanelLoss = p => {
    if (!p || p.deleted || p.disabled || p.isGhost) return;
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
    const activeRendered = window.allRenderedPanels.filter(p => p && !p.deleted && !p.disabled && !p.isGhost);
    const nPanels = Math.max(1, activeRendered.length);
    const prBosRaw = (typeof prObj.prBOS === 'number') ? prObj.prBOS : (pr / (0.925 * (1 - 0.028)));
    // El bucle horario del heatmap/worker ya descuenta bypass por sub-strings: evitar doble descuento de bypass en prBOS.
    const prSys = (prObj.factors && typeof prObj.factors.bypass === 'number' && prObj.factors.bypass > 0 && prObj.factors.bypass < 1)
      ? (prBosRaw / (1 - prObj.factors.bypass))
      : prBosRaw;

    const hasSimulatedPanels = activeRendered.some(p =>
      !p._isParametricEstimate && (
        (typeof p.annualTotalPotential === 'number' && p.annualTotalPotential > 0) ||
        (typeof p.annualGrossKwh === 'number' && p.annualGrossKwh > 0) ||
        (typeof p.annualKwh === 'number' && p.annualKwh > 0)
      )
    );
    let simulatedTotalKWh = 0;
    let simulatedGrossKWh = 0;
    activeRendered.forEach(p => {
      const pYieldFactor = (typeof p.annualYieldPct === 'number') ? (p.annualYieldPct / 100.0) : shadowLossFactor;
      const pPolyIdx = (typeof p.polyIdx === 'number') ? p.polyIdx : 0;
      const sa = subArrays.find(s => s.polyIdx === pPolyIdx);
      const curTilt = (typeof p.tiltDeg === 'number') ? p.tiltDeg : (sa ? sa.tiltDeg : modTilt);
      const curAz = (typeof p.azimuthDeg === 'number') ? p.azimuthDeg : (sa ? sa.azSurDeg : modAzSigned);

      let basePanelGross = annualGrossKWh / nPanels;
      if (sa && sa.nPanels > 0 && subArrayAnnualGross.has(sa.polyIdx)) {
        basePanelGross = subArrayAnnualGross.get(sa.polyIdx) / sa.nPanels;
      }

      const panelHasHourlySim = !p._isParametricEstimate && (
        (typeof p.annualTotalPotential === 'number' && p.annualTotalPotential > 0) ||
        (typeof p.annualGrossKwh === 'number' && p.annualGrossKwh > 0) ||
        (typeof p.annualKwh === 'number' && p.annualKwh > 0)
      );

      if (hasSimulatedPanels && panelHasHourlySim) {
        // Base bruta coherente: si la bruta guardada no cuadra con la neta y el PR con que se
        // generó (o ya venía neta sin _lastPrSys), se recupera la bruta real sin volver a descontar prBOS.
        let storedGross = (typeof p.annualGrossKwh === 'number' && p.annualGrossKwh > 0) ? p.annualGrossKwh : 0;
        if (storedGross > 0 && typeof p.annualKwh === 'number' && p.annualKwh > 0) {
          if (typeof p._lastPrSys === 'number' && p._lastPrSys > 0) {
            const impliedGross = p.annualKwh / p._lastPrSys;
            if (Math.abs(storedGross - impliedGross) > Math.max(1, impliedGross * 0.02)) storedGross = impliedGross;
          } else if (Math.abs(storedGross - p.annualKwh) <= 1.0) {
            storedGross = p.annualKwh / (prSys || 0.90);
          }
        }
        const gross = storedGross > 0
          ? storedGross
          : (typeof p.annualKwh === 'number' && p.annualKwh > 0 ? (p.annualKwh / (p._lastPrSys || prSys || 0.90)) : (basePanelGross * pYieldFactor));

        p.annualGrossKwh = gross;
        p._poaTiltDeg = curTilt;
        p._poaAzDeg = curAz;
        p._lastPrSys = prSys;
        p._isParametricEstimate = false;
        p.annualKwh = Math.round(gross * prSys);
        simulatedGrossKWh += gross;
        simulatedTotalKWh += p.annualKwh;
      } else {
        // Panel sin simulación horaria: basePanelGross está antes de IAM/temperatura/BOS, aplicar pr completo
        const gross = basePanelGross * pYieldFactor;
        p.annualGrossKwh = gross;
        p._poaTiltDeg = curTilt;
        p._poaAzDeg = curAz;
        p._lastPrSys = pr;
        p._isParametricEstimate = true;
        p.annualKwh = Math.round(gross * pr);
        simulatedGrossKWh += gross;
        simulatedTotalKWh += p.annualKwh;
      }
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

  // Priorizar perfil mensual simulado por raycast si está vigente y escalado a annualYieldKWh
  const _simMK = (typeof window !== 'undefined' && window.solarSimState && !window.solarSimState.annualHeatmapDirty && Array.isArray(window.solarSimState.monthlyKwh) && window.solarSimState.monthlyKwh.length === 12 && window.solarSimState.monthlyKwh.some(v => v > 0))
    ? window.solarSimState.monthlyKwh
    : null;
  if (_simMK) {
    const _simSum = _simMK.reduce((a, b) => a + (Number(b) || 0), 0);
    const _simRatio = (_simSum > 0 && annualYieldKWh > 0) ? (annualYieldKWh / _simSum) : 1.0;
    monthlyYields = _simMK.map(v => Math.round((Number(v) || 0) * _simRatio));
  } else {
    monthlyYields = monthlyYields.map(v => Math.round(v * shadowLossFactor));
    const sumMonthly = monthlyYields.reduce((a, b) => a + b, 0);
    if (sumMonthly > 0 && annualYieldKWh > 0) {
      const ratio = annualYieldKWh / sumMonthly;
      monthlyYields = monthlyYields.map(v => Math.round(v * ratio));
    }
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
  const _hasSimPanels = (typeof window !== 'undefined' && Array.isArray(window.allRenderedPanels)) && window.allRenderedPanels.some(p => p && !p._isParametricEstimate && ((typeof p.annualTotalPotential === 'number' && p.annualTotalPotential > 0) || (typeof p.annualGrossKwh === 'number' && p.annualGrossKwh > 0) || (typeof p.annualKwh === 'number' && p.annualKwh > 0)));
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
