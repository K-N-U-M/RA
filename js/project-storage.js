/**
 * ============================================================================
 * 💾 GESTOR DE PERSISTENCIA Y ARCHIVOS DE PROYECTO (.raproject) — PROYECTO RA
 * ============================================================================
 * Módulo autónomo de almacenamiento y serialización (Fase 2, Bloque 2.2).
 * Responsabilidades:
 *   - Serialización canónica y sanitizada del proyecto solar (cero refs circulares)
 *   - Guardado en disco local con File System Access API y fallback a descarga
 *   - Lectura e importación íntegra de proyectos (geometría, equipos, strings, cables)
 *   - Historial de proyectos recientes en localStorage ('ra_solar_recent_projects_v2')
 *   - Modal de proyectos y confirmación de nuevo diseño
 *   - Drag & Drop de archivos .raproject sobre el lienzo 3D
 *   - Atajo de teclado global Ctrl+S / Cmd+S
 * ============================================================================
 */
(function(global) {
  'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// <i data-lucide=\"save\" class=\"icon-sm\"></i> SISTEMA INTEGRAL DE PERSISTENCIA Y ARCHIVOS DE PROYECTO (.raproject)
// ═══════════════════════════════════════════════════════════════════════════

let _raCurrentFileHandle = null;
let _raCurrentProjectName = 'Proyecto_Solar';
let _raImportInProgress = false;
// [A6 FIX] Validación de coordenadas numéricas finitas para prevenir DeveloperError en bucle de render Cesium
function _raIsValidCoord(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function _raIsValidCartesian(pt) {
  return pt && _raIsValidCoord(pt.x) && _raIsValidCoord(pt.y) && _raIsValidCoord(pt.z);
}

function _raToCartesian3(pt) {
  if (typeof Cesium === 'undefined' || !_raIsValidCartesian(pt)) return null;
  return new Cesium.Cartesian3(pt.x, pt.y, pt.z);
}


// [AUDIT-SAVE] Sanitizador: elimina referencias GPU/DOM (entity, primitivas, props _*)
// del estado serializado. Antes JSON.stringify(obstacles) arrastraba el grafo completo
// del Entity de Cesium (archivos enormes y riesgo de excepción por referencias circulares).
function _raSanitizeForExport(obj, depth) {
  if (depth > 10) return null;
  if (Array.isArray(obj)) return obj.map(v => _raSanitizeForExport(v, depth + 1));
  if (obj && typeof obj === 'object') {
    if (typeof Cesium !== 'undefined' && Cesium.Cartesian3 && obj instanceof Cesium.Cartesian3) return { x: obj.x, y: obj.y, z: obj.z };
    if (typeof obj.x === 'number' && typeof obj.y === 'number' && typeof obj.z === 'number' && Object.keys(obj).length === 3) return { x: obj.x, y: obj.y, z: obj.z };
    if (obj instanceof Date) return obj.toISOString();
    const out = {};
    for (const k in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
      // [A5 FIX] Preservar explícitamente _position para permitir migración de turbinas legadas
      if (k === 'entity' || k === 'entities' || k === 'primitive' || k === 'primitives') continue;
      if (k && k.charAt && k.charAt(0) === '_' && k !== '_position') continue;
      const v = obj[k];
      if (typeof v === 'function') continue;
      out[k] = _raSanitizeForExport(v, depth + 1);
    }
    return out;
  }
  return obj;
}

// 1. Serializar el estado vivo del proyecto
function raExportProjectData() {
  const currentAddress = (document.getElementById('nav-info-address') ? document.getElementById('nav-info-address').textContent : '') ||
                         (document.getElementById('ra-search-input') ? document.getElementById('ra-search-input').value : '') ||
                         'Ubicación Solar';

  let camData = null;
  if (typeof viewer !== 'undefined' && viewer && viewer.camera) {
    const cam = viewer.camera;
    camData = {
      position: { x: cam.position.x, y: cam.position.y, z: cam.position.z },
      direction: { x: cam.direction.x, y: cam.direction.y, z: cam.direction.z },
      up: { x: cam.up.x, y: cam.up.y, z: cam.up.z },
      heading: cam.heading,
      pitch: cam.pitch,
      roll: cam.roll
    };
    if (cam.positionCartographic) {
      camData.cartographic = {
        longitude: (typeof Cesium !== 'undefined' && Cesium.Math) ? Cesium.Math.toDegrees(cam.positionCartographic.longitude) : cam.positionCartographic.longitude,
        latitude: (typeof Cesium !== 'undefined' && Cesium.Math) ? Cesium.Math.toDegrees(cam.positionCartographic.latitude) : cam.positionCartographic.latitude,
        height: cam.positionCartographic.height
      };
    }
  }

  const serializedPlanes = (typeof WP !== 'undefined' && WP && Array.isArray(WP.planes))
    ? WP.planes.map(p => ({
        id: p.id,
        name: p.name,
        buildingId: p.buildingId || null,
        isRoof: !!p.isRoof,
        p1: p.p1 ? { x: p.p1.x, y: p.p1.y, z: p.p1.z } : null,
        p2: p.p2 ? { x: p.p2.x, y: p.p2.y, z: p.p2.z } : null,
        p3: p.p3 ? { x: p.p3.x, y: p.p3.y, z: p.p3.z } : null,
        pts3D: Array.isArray(p.pts3D) ? p.pts3D.map(pt => ({ x: pt.x, y: pt.y, z: pt.z })) : null,
        origin: p.origin ? { x: p.origin.x, y: p.origin.y, z: p.origin.z } : null,
        normal: p.normal ? { x: p.normal.x, y: p.normal.y, z: p.normal.z } : null,
        uVec: p.uVec ? { x: p.uVec.x, y: p.uVec.y, z: p.uVec.z } : null,
        vVec: p.vVec ? { x: p.vVec.x, y: p.vVec.y, z: p.vVec.z } : null,
        tiltDeg: p.tiltDeg,
        azimuthDeg: p.azimuthDeg,
        area: p.area
      }))
    : [];

  // [MANUAL-PANELS-SYNC] Sincronizar paneles activos desde window.allRenderedPanels hacia poly.roofInfo.panels
  if (typeof WP !== 'undefined' && WP && Array.isArray(WP.polylines) && typeof window !== 'undefined' && Array.isArray(window.allRenderedPanels) && window.allRenderedPanels.length > 0) {
    WP.polylines.forEach((poly, polyIdx) => {
      if (!poly || !poly.roofInfo || !Array.isArray(poly.roofInfo.panels)) return;
      const renderedForPoly = window.allRenderedPanels.filter(rp => rp && (rp.polyIdx === polyIdx || (!rp.polyIdx && polyIdx === 0)));
      if (renderedForPoly.length > 0) {
        poly.roofInfo.panels.forEach((p, idx) => {
          const match = renderedForPoly.find(rp => (p.panelId && (rp.panelId === p.panelId || rp.id === p.panelId)) || (typeof p.layoutIndex === 'number' && (rp.layoutIndex === p.layoutIndex || rp.localIdx === p.layoutIndex))) || renderedForPoly[idx];
          if (match && (match.isManual || (match.rawPanel && match.rawPanel.isManual))) {
            p.isManual = true;
            if (match.center) p.center = { x: match.center.x, y: match.center.y, z: match.center.z };
            if (Array.isArray(match.corners)) p.corners = match.corners.map(c => ({ x: c.x, y: c.y, z: c.z }));
            if (typeof match.rot === 'number') p.rot = match.rot;
            if (typeof match.u === 'number') p.u = match.u;
            if (typeof match.v === 'number') p.v = match.v;
            poly._hasManualPanels = true;
          }
        });
      }
    });
  }

  const serializedPolylines = (typeof WP !== 'undefined' && WP && Array.isArray(WP.polylines))
    ? WP.polylines.map((poly, pIdx) => ({
        id: poly.id || ('wp_poly_' + Date.now() + '_' + pIdx),
        name: poly.name || ('Faldon #' + (pIdx + 1)),
        buildingId: poly.buildingId || null,
        isRoof: !!poly.isRoof,
        assignedTopology: poly.assignedTopology || null,
        optimizerCoverage: poly.optimizerCoverage || null,
        panelsDisabled: !!poly.panelsDisabled,
        visible: poly.visible !== false,
        panelsVisible: poly.panelsVisible !== false,
        points: Array.isArray(poly.points) ? poly.points.map(pt => ({ x: pt.x, y: pt.y, z: pt.z })) : [],
        color: poly.color,
        hasManualPanels: !!(poly._hasManualPanels || (poly.roofInfo && Array.isArray(poly.roofInfo.panels) && poly.roofInfo.panels.some(p => p && p.isManual))),
        preserveImportedPanels: !!(poly._preserveImportedPanels || poly._hasManualPanels || (poly.roofInfo && Array.isArray(poly.roofInfo.panels) && poly.roofInfo.panels.some(p => p && p.isManual))),
        planeIdx: (typeof poly.planeIdx === 'number') ? poly.planeIdx : 0,
        structureType: poly.structureType || 'coplanar_teja',
        estructura: poly.estructura ? JSON.parse(JSON.stringify(poly.estructura)) : null,
        moduleId: poly.moduleId || null,
        arrangementMode: poly.arrangementMode || null,
        alignToPlane: poly.alignToPlane !== false,
        hasWalkway: !!poly.hasWalkway,
        walkwayWidth: (typeof poly.walkwayWidth === 'number') ? poly.walkwayWidth : 0.80,
        orientationPref: poly.orientationPref || 'portrait',
        matrixShiftA: (typeof poly.matrixShiftA === 'number') ? poly.matrixShiftA : 0,
        matrixShiftB: (typeof poly.matrixShiftB === 'number') ? poly.matrixShiftB : 0,
        modTilt: poly.modTilt || 'auto',
        modAzimuth: poly.modAzimuth || 'auto',
        lockRowPitch: !!poly.lockRowPitch,
        lockedRowPitchM: (typeof poly.lockedRowPitchM === 'number') ? poly.lockedRowPitchM : 0,
        manualClearSpacingM: (typeof poly.manualClearSpacingM === 'number') ? poly.manualClearSpacingM : null,
        rowPitchDesignWindowH: (typeof poly.rowPitchDesignWindowH === 'number') ? poly.rowPitchDesignWindowH : 2.0,
        ignore3DTilesShadows: !!poly.ignore3DTilesShadows,
        area: (typeof poly.area === 'number') ? poly.area : (poly.roofInfo && typeof poly.roofInfo.area === 'number' ? poly.roofInfo.area : 0),
        deletedPanels: Array.isArray(poly.deletedPanels) ? poly.deletedPanels.map(dp => ({
          panelId: dp.panelId || null,
          layoutIndex: (typeof dp.layoutIndex === 'number') ? dp.layoutIndex : null,
          localIdx: (typeof dp.localIdx === 'number') ? dp.localIdx : null,
          u: dp.u,
          v: dp.v,
          center: dp.center ? { x: dp.center.x, y: dp.center.y, z: dp.center.z } : null
        })) : [],
        roofInfo: poly.roofInfo ? {
          area: poly.roofInfo.area,
          tilt: poly.roofInfo.tilt,
          azimuth: poly.roofInfo.azimuth,
          ignore3DTilesShadows: !!poly.roofInfo.ignore3DTilesShadows,
          panelCount: poly.roofInfo.panels ? poly.roofInfo.panels.length : 0,
          panels: poly.roofInfo.panels ? poly.roofInfo.panels.map((p, idx) => ({
            u: p.u, v: p.v, w: p.w, h: p.h,
            gridA: (typeof p.gridA === 'number') ? p.gridA : null,
            gridB: (typeof p.gridB === 'number') ? p.gridB : null,
            layoutIndex: (typeof p.layoutIndex === 'number') ? p.layoutIndex : idx,
            localIdx: (typeof p.localIdx === 'number') ? p.localIdx : idx,
            polyIdx: (typeof p.polyIdx === 'number') ? p.polyIdx : pIdx,
            orientation: p.orientation,
            tiltDeg: p.tiltDeg,
            azimuthDeg: p.azimuthDeg,
            stringId: p.stringId,
            isManual: !!p.isManual,
            rot: p.rot || 0,
            panelId: p.panelId,
            hasMLPE: !!p.hasMLPE,
            isShaded: !!p.isShaded,
            annualKwh: p.annualKwh || null,
            shadePct: (typeof p.shadePct === 'number') ? p.shadePct : null,
            center: p.center ? { x: p.center.x, y: p.center.y, z: p.center.z } : null,
            corners: Array.isArray(p.corners) ? p.corners.map(c => ({ x: c.x, y: c.y, z: c.z })) : []
          })) : []
        } : null
      }))
    : [];

  // [A3 FIX] Leer paneles activos de allRenderedPanels con fallback a simulatedPanelEntities
  const totalPanels = (typeof window !== 'undefined' && Array.isArray(window.allRenderedPanels) && window.allRenderedPanels.length > 0)
    ? window.allRenderedPanels.filter(p => p && !p.deleted).length
    : ((typeof simulatedPanelEntities !== 'undefined' && simulatedPanelEntities) ? simulatedPanelEntities.length : 0);

  // [AUDIT-SAVE] CRÍTICO: el flujo legacy (P1/P2/P3 + trazar + confirmar) genera paneles
  // SIN crear entradas en WP.polylines — el .raproject guardaba 0 faldones y al cargar el
  // proyecto no había nada que regenerar ("los elementos no responden"). Si el diseño vivo
  // es legacy (polygonPoints + lastRoofInfo), sintetizar la polilínea equivalente.
  if (serializedPolylines.length === 0 && typeof polygonPoints !== 'undefined' &&
      Array.isArray(polygonPoints) && polygonPoints.length >= 3 &&
      ((typeof lastRoofInfo !== 'undefined' && lastRoofInfo && Array.isArray(lastRoofInfo.panels) && lastRoofInfo.panels.length > 0) || totalPanels > 0)) {
    const _lr = (typeof lastRoofInfo !== 'undefined') ? lastRoofInfo : null;
    serializedPolylines.push({
      name: 'Faldón #1',
      planeIdx: (typeof WP !== 'undefined' && WP && typeof WP.activePlaneIdx === 'number' && WP.activePlaneIdx >= 0) ? WP.activePlaneIdx : 0,
      points: polygonPoints.map(pt => ({ x: pt.x, y: pt.y, z: pt.z })),
      color: '#38bdf8',
      orientationPref: (typeof panelConfig !== 'undefined' && panelConfig && panelConfig.orientationPref) || 'portrait',
      modTilt: (_lr && typeof _lr.modTilt === 'string') ? _lr.modTilt : 'auto',
      modAzimuth: (_lr && typeof _lr.modAzimuth === 'string') ? _lr.modAzimuth : 'auto',
      deletedPanels: [],
      roofInfo: (_lr && Array.isArray(_lr.panels)) ? {
        area: _lr.area,
        tilt: _lr.tilt,
        azimuth: _lr.azimuth,
        panels: _lr.panels.map((p, idx) => ({
          u: p.u, v: p.v, w: p.w, h: p.h,
          gridA: (typeof p.gridA === 'number') ? p.gridA : null,
          gridB: (typeof p.gridB === 'number') ? p.gridB : null,
          layoutIndex: (typeof p.layoutIndex === 'number') ? p.layoutIndex : idx,
          localIdx: (typeof p.localIdx === 'number') ? p.localIdx : idx,
          polyIdx: 0,
          orientation: p.orientation,
          tiltDeg: p.tiltDeg,
          azimuthDeg: p.azimuthDeg,
          isManual: !!p.isManual,
          rot: p.rot || 0,
          panelId: p.panelId,
          hasMLPE: !!p.hasMLPE,
          isShaded: !!p.isShaded,
          center: p.center ? { x: p.center.x, y: p.center.y, z: p.center.z } : null,
          corners: Array.isArray(p.corners) ? p.corners.map(c => ({ x: c.x, y: c.y, z: c.z })) : []
        }))
      } : null
    });
  }
  // [AUDIT-SAVE] panelConfig.power no existe (el campo real es potencia) — el totalKwp
  // de los metadatos caía siempre al fallback 450 W.
  const modPower = (typeof panelConfig !== 'undefined' && panelConfig && panelConfig.potencia) ? panelConfig.potencia : 450;
  const totalKwp = (totalPanels * modPower / 1000).toFixed(2);

  return {
    format: 'RA_SOLAR_PROJECT',
    version: '2.4',
    timestamp: new Date().toISOString(),
    metadata: {
      name: _raCurrentProjectName || 'Instalación Solar',
      address: currentAddress,
      totalPanels: totalPanels,
      totalKwp: parseFloat(totalKwp),
      currentStep: (typeof wpCurrentStep !== 'undefined') ? wpCurrentStep : 2
    },
    camera: camData,
    workPlanes: {
      planes: serializedPlanes,
      activePlaneIdx: (typeof WP !== 'undefined' && WP) ? WP.activePlaneIdx : 0,
      selectedPolyIdx: (typeof WP !== 'undefined' && WP) ? WP.selectedPolyIdx : 0
    },
    polylines: serializedPolylines,
    obstacles: (typeof obstacles !== 'undefined' && Array.isArray(obstacles)) ? _raSanitizeForExport(obstacles, 0) : [],
    windTurbines: (typeof window !== 'undefined' && window.RAWind && window.RAWind.Entity && typeof window.RAWind.Entity.serializeAll === 'function')
      ? window.RAWind.Entity.serializeAll()
      : ((typeof window !== 'undefined' && Array.isArray(window.windTurbines))
          ? window.windTurbines.map(function(t) {
              return {
                id: t.id,
                catalogId: t.catalogId,
                name: t.name,
                positionCartographic: t.positionCartographic,
                mountingType: t.mountingType,
                supportStructure: t.supportStructure,
                orientationRad: t.orientationRad,
                operationalState: t.operationalState
              };
            })
          : []),
    windResourceConfig: (typeof window !== 'undefined' && window.RAWind && window.RAWind.Resource && typeof window.RAWind.Resource.getConfig === 'function')
      ? window.RAWind.Resource.getConfig()
      : null,
    buildings: (typeof buildings !== 'undefined' && Array.isArray(buildings)) ? _raSanitizeForExport(buildings, 0) : [],
    panelConfig: (typeof panelConfig !== 'undefined' && panelConfig) ? _raSanitizeForExport(panelConfig, 0) : null,
    // [AUDIT-SAVE] Selecciones de catálogo y auto-dimensionado: sin esto, tras cargar un
    // proyecto se perdía el inversor/módulo/batería elegidos → Paso 5 bloqueado por el
    // guard y motor de strings sin límites reales.
    projectConfig: (typeof window !== 'undefined' && window.solarProjectConfig) ? {
      selectedModuleId: window.solarProjectConfig.selectedModuleId || null,
      selectedInverterId: window.solarProjectConfig.selectedInverterId || null,
      selectedMicroinverterId: window.solarProjectConfig.selectedMicroinverterId || null,
      selectedBatteryId: window.solarProjectConfig.selectedBatteryId || null,
      selectedOptimizerId: window.solarProjectConfig.selectedOptimizerId || null,
      selectedProtectionDcId: window.solarProjectConfig.selectedProtectionDcId || null,
      selectedProtectionAcId: window.solarProjectConfig.selectedProtectionAcId || null,
      selectedCableDcId: window.solarProjectConfig.selectedCableDcId || null,
      selectedCableAcId: window.solarProjectConfig.selectedCableAcId || null,
      selectedTopology: window.solarProjectConfig.selectedTopology || null,
      selectedObjective: window.solarProjectConfig.selectedObjective || null,
      targetKwp: window.solarProjectConfig.targetKwp || null,
      lastEstimatedPanels: window.solarProjectConfig.lastEstimatedPanels || null,
      autoSizing: window.solarProjectConfig.autoSizing ? JSON.parse(JSON.stringify(window.solarProjectConfig.autoSizing)) : null,
      calculatedLimits: window.solarProjectConfig.calculatedLimits ? JSON.parse(JSON.stringify(window.solarProjectConfig.calculatedLimits)) : null,
      inverterCapacityWarning: window.solarProjectConfig.inverterCapacityWarning ? JSON.parse(JSON.stringify(window.solarProjectConfig.inverterCapacityWarning)) : null,
      inverters: (Array.isArray(window.solarProjectConfig.inverters) && window.solarProjectConfig.inverters.length > 0) ? JSON.parse(JSON.stringify(window.solarProjectConfig.inverters)) : null,
      selectedInverters: (Array.isArray(window.solarProjectConfig.selectedInverters) && window.solarProjectConfig.selectedInverters.length > 0) ? JSON.parse(JSON.stringify(window.solarProjectConfig.selectedInverters)) : null,
      batteries: (Array.isArray(window.solarProjectConfig.batteries) && window.solarProjectConfig.batteries.length > 0) ? JSON.parse(JSON.stringify(window.solarProjectConfig.batteries)) : null,
      selectedBatteries: (Array.isArray(window.solarProjectConfig.selectedBatteries) && window.solarProjectConfig.selectedBatteries.length > 0) ? JSON.parse(JSON.stringify(window.solarProjectConfig.selectedBatteries)) : null,
      userManuallySelectedInverter: !!window.solarProjectConfig.userManuallySelectedInverter,
      userManuallySelectedBattery: !!window.solarProjectConfig.userManuallySelectedBattery,
      stringWiringTopology: window.solarProjectConfig.stringWiringTopology || 'leapfrog',
      mpptManualConfig: window.solarProjectConfig.mpptManualConfig ? JSON.parse(JSON.stringify(window.solarProjectConfig.mpptManualConfig)) : null,
      hasExternalLightningRod: !!window.solarProjectConfig.hasExternalLightningRod,
      includeBackupBox: (window.solarProjectConfig.includeBackupBox !== false),
      manualAnnualConsumptionKWh: window.solarProjectConfig.manualAnnualConsumptionKWh || null,
      billCostMonth: window.solarProjectConfig.billCostMonth || null,
      gridSupply: window.solarProjectConfig.gridSupply || null,
      taxSettings: (() => {
        const soilEl = (typeof document !== 'undefined') ? (document.getElementById('tax-soil-type') || document.getElementById('modal-tax-soil-type')) : null;
        const profileEl = (typeof document !== 'undefined') ? (document.getElementById('tax-profile-opt') || document.getElementById('modal-tax-profile-opt')) : null;
        const ivaEl = (typeof document !== 'undefined') ? (document.getElementById('modal-tax-iva-opt')) : null;
        const ivaHomeAgeEl = (typeof document !== 'undefined') ? (document.getElementById('modal-tax-iva-home-age')) : null;
        const ivaMarginLaborEl = (typeof document !== 'undefined') ? (document.getElementById('modal-tax-iva-margin-labor')) : null;
        const ibiCEl = (typeof document !== 'undefined') ? (document.getElementById('tax-ibi-cuota') || document.getElementById('modal-tax-ibi-cuota')) : null;
        const ibiOEl = (typeof document !== 'undefined') ? (document.getElementById('tax-ibi-opt') || document.getElementById('modal-tax-ibi-opt')) : null;
        const irpfOEl = (typeof document !== 'undefined') ? (document.getElementById('tax-irpf-opt') || document.getElementById('modal-tax-irpf-opt')) : null;
        const isOEl = (typeof document !== 'undefined') ? (document.getElementById('tax-is-opt') || document.getElementById('modal-tax-is-opt')) : null;
        const icioOEl = (typeof document !== 'undefined') ? (document.getElementById('tax-icio-opt') || document.getElementById('modal-tax-icio-opt')) : null;
        const regEl = (typeof document !== 'undefined') ? (document.getElementById('tax-region-opt') || document.getElementById('modal-tax-region-opt')) : null;
        const caeEl = (typeof document !== 'undefined') ? (document.getElementById('tax-cae-eur') || document.getElementById('modal-tax-cae-eur')) : null;

        const prev = window.solarProjectConfig.taxSettings || {};
        const parsedIvaRate = (ivaEl && ivaEl.value !== '') ? parseFloat(ivaEl.value) : NaN;
        return {
          soilType: (soilEl && soilEl.value) || prev.soilType || 'urbano',
          profile: (profileEl && profileEl.value) || prev.profile || 'particular',
          ivaOpt: (ivaEl && ivaEl.value) || prev.ivaOpt || String(prev.ivaRate != null ? prev.ivaRate : 0.21),
          ivaRate: Number.isFinite(parsedIvaRate) ? parsedIvaRate : (prev.ivaRate != null ? prev.ivaRate : 0.21),
          ivaHomeAge2Years: ivaHomeAgeEl ? Boolean(ivaHomeAgeEl.checked) : (typeof prev.ivaHomeAge2Years === 'boolean' ? prev.ivaHomeAge2Years : true),
          ivaMarginLaborOnly: ivaMarginLaborEl ? Boolean(ivaMarginLaborEl.checked) : (typeof prev.ivaMarginLaborOnly === 'boolean' ? prev.ivaMarginLaborOnly : false),
          ibiCuota: (ibiCEl && parseFloat(ibiCEl.value)) || (prev.ibiCuota != null ? prev.ibiCuota : 650),
          ibiOpt: (ibiOEl && ibiOEl.value) || prev.ibiOpt || '0.50_3',
          irpfOpt: (irpfOEl && irpfOEl.value) || prev.irpfOpt || '0.40',
          isRate: (isOEl && parseFloat(isOEl.value)) || (prev.isRate != null ? prev.isRate : 0.25),
          icioOpt: (icioOEl && parseFloat(icioOEl.value)) || (prev.icioOpt != null ? prev.icioOpt : 0.95),
          regionOpt: (regEl && regEl.value) || prev.regionOpt || 'estatal_only',
          caeEur: (caeEl && parseFloat(caeEl.value)) || (prev.caeEur != null ? prev.caeEur : 0)
        };
      })()
    } : null,
    solarSimState: (typeof solarSimState !== 'undefined' && solarSimState) ? {
      monthIdx: solarSimState.monthIdx,
      hour: solarSimState.hour,
      hourFloat: (typeof solarSimState.hourFloat === 'number') ? solarSimState.hourFloat : solarSimState.hour,
      viewMode: solarSimState.viewMode
    } : null,
    electricalInfrastructure: (() => {
      const s = (typeof window !== 'undefined' && window.inverterEquipmentState) ? window.inverterEquipmentState : null;
      const cfg = (typeof window !== 'undefined' && window.solarProjectConfig) ? window.solarProjectConfig : null;
      if (!s) return null;
      return {
        inverter: {
          position: s.position ? { x: s.position.x, y: s.position.y, z: s.position.z } : null,
          carto: s.carto || null,
          rotation: s.rotation || 0
        },
        dcProtection: {
          position: (s.dcProtectionPosition) ? { x: s.dcProtectionPosition.x, y: s.dcProtectionPosition.y, z: s.dcProtectionPosition.z } : null,
          carto: s.dcProtectionCarto || null,
          rotation: s.dcProtectionRotation || 0
        },
        battery: {
          position: s.batteryPosition ? { x: s.batteryPosition.x, y: s.batteryPosition.y, z: s.batteryPosition.z } : null,
          carto: s.batteryCarto || null,
          rotation: s.batteryRotation || 0
        },
        gridMeter: {
          position: (s.gridMeter && s.gridMeter.position) ? { x: s.gridMeter.position.x, y: s.gridMeter.position.y, z: s.gridMeter.position.z } : null,
          carto: (s.gridMeter && s.gridMeter.carto) || null,
          rotation: (s.gridMeter && typeof s.gridMeter.rotation === 'number') ? s.gridMeter.rotation : 0
        },
        combinerBox: {
          isEnabled: !!(s.combinerBox && s.combinerBox.isEnabled),
          position: (s.combinerBox && s.combinerBox.position) ? { x: s.combinerBox.position.x, y: s.combinerBox.position.y, z: s.combinerBox.position.z } : null,
          carto: (s.combinerBox && s.combinerBox.carto) || null,
          rotation: (s.combinerBox && typeof s.combinerBox.rotation === 'number') ? s.combinerBox.rotation : 0
        },
        routingStrategy: s.routingStrategy || 'auto',
        routes: (s.routes) ? {
          dc: Array.isArray(s.routes.dc) ? s.routes.dc.map(p => ({ x: p.x, y: p.y, z: p.z })) : [],
          ac: Array.isArray(s.routes.ac) ? s.routes.ac.map(p => ({ x: p.x, y: p.y, z: p.z })) : []
        } : null,
        cabling: {
          L_dc_measured: s.L_dc_measured || 0,
          L_ac_measured: s.L_ac_measured || 0,
          S_dc_recommended: s.S_dc_recommended || 6,
          S_ac_recommended: s.S_ac_recommended || 10,
          dV_dc_pct: s.dV_dc_pct || 0,
          dV_ac_pct: s.dV_ac_pct || 0
        },
        selections: {
          selectedProtectionDcId: (cfg && cfg.selectedProtectionDcId) || 'panel_dc_2mppt',
          selectedProtectionAcId: (cfg && cfg.selectedProtectionAcId) || 'panel_ac_tri_25a',
          selectedCableDcId: (cfg && cfg.selectedCableDcId) || 'cable_dc_zzf_6',
          selectedCableAcId: (cfg && cfg.selectedCableAcId) || 'cable_ac_rvk_5g10'
        }
      };
    })(),
    // [AUDIT v2.3] Persistencia integral de subsistemas para cero pérdida de datos
    measurements: (typeof window !== 'undefined' && window.RAMeasureTool && typeof window.RAMeasureTool.serialize === 'function')
      ? window.RAMeasureTool.serialize()
      : [],
    // [AUDIT v2.5] Persistencia integral de Factura & Consumo Eléctrico
    step3BillData: (() => {
      const g = (id, def) => {
        const el = document.getElementById(id);
        return el ? (parseFloat(el.value) || def) : def;
      };
      const gStr = (id) => {
        const el = document.getElementById(id);
        return el ? el.value.trim() : '';
      };
      const comp = (window.RA && window.RA.billAuditor && window.RA.billAuditor.comparison) ? window.RA.billAuditor.comparison : {};
      const cfg = window.solarProjectConfig || {};
      return {
        costMonth: g('step3-bill-cost-month', comp.gastoMensualActualEUR || cfg.billCostMonth || 125),
        kwhYear: g('step3-bill-kwh-year', comp.consumoAnualKWh || cfg.manualAnnualConsumptionKWh || 5450),
        potContr: g('step3-bill-pot-contr', comp.potenciaContratadaP1 || 5.75),
        priceKwh: g('step3-bill-price-kwh', comp.precioMedioKWh || 0.18),
        cups: gStr('step3-bill-cups') || comp.cups || '',
        titular: gStr('step3-bill-titular') || comp.titular || '',
        tariff: gStr('step3-bill-tariff') || '2.0TD'
      };
    })(),
    billAudit: (typeof window !== 'undefined' && window.RA && window.RA.billAuditor && typeof window.RA.billAuditor.getState === 'function')
      ? (() => {
          const bSt = window.RA.billAuditor.getState();
          return (bSt && bSt.currentBill) ? JSON.parse(JSON.stringify(bSt.currentBill)) : null;
        })()
      : null,
    commercialProposal: (typeof window !== 'undefined' && window.CommercialProposalDossier && typeof window.CommercialProposalDossier.getConfig === 'function')
      ? window.CommercialProposalDossier.getConfig()
      : null,
    clientDetails: (() => {
      if (typeof readTitular === 'function') {
        try {
          const rawTit = readTitular();
          if (rawTit && typeof window !== 'undefined' && window.RASanitize && typeof window.RASanitize.unescapePlain === 'function') {
            const cleanTit = {};
            Object.keys(rawTit).forEach(k => {
              cleanTit[k] = (typeof rawTit[k] === 'string') ? window.RASanitize.unescapePlain(rawTit[k]) : rawTit[k];
            });
            return cleanTit;
          }
          return rawTit;
        } catch (_) { return null; }
      }
      return null;
    })(),
    financialSettings: (() => {
      const g = (id, def) => {
        const el = document.getElementById(id) || document.getElementById('modal-' + id);
        return el ? (parseFloat(el.value) || def) : def;
      };
      const gStr = (id, def) => {
        const el = document.getElementById(id) || document.getElementById('modal-' + id);
        return el ? (el.value || def) : def;
      };
      return {
        mode: gStr('fin-mode', 'both'),
        entradaEur: g('fin-entrada-eur', 0),
        plazoMeses: g('fin-plazo-meses', 120),
        tinPct: g('fin-tin-pct', 5.95),
        aperturaPct: g('fin-apertura-pct', 1.0),
        carenciaMeses: g('fin-carencia-meses', 0),
        seguroMensual: g('fin-seguro-mensual', 0),
        notariaEur: g('fin-notaria-eur', 0)
      };
    })(),
    pricingOverrides: (() => {
      try {
        const hasSession = (typeof RAPricing !== 'undefined' && !!RAPricing.currentSessionPricing);
        const pricing = (typeof RAPricing !== 'undefined') ? (RAPricing.currentSessionPricing || RAPricing.getDefaults()) : null;
        const design = (typeof RAPricing !== 'undefined' && typeof RAPricing.computeDesignCosts === 'function')
          ? RAPricing.computeDesignCosts()
          : null;
        let pricingToSave = null;
        if (pricing) {
          const _num = (v, fb) => (typeof v === 'number' && Number.isFinite(v) && v >= 0) ? v : (typeof fb === 'number' && Number.isFinite(fb) && fb >= 0 ? fb : 0);
          pricingToSave = Object.assign({}, pricing, {
            panelPrice: _num(pricing.panelPrice, design ? design.panelPrice : 125),
            estPrice: _num(pricing.estPrice, design ? design.estPrice : 0),
            invPrice: _num(pricing.invPrice, design ? design.invPrice : 0),
            batPrice: _num(pricing.batPrice, design ? design.batPrice : 0),
            cabPrice: _num(pricing.cabPrice, design ? design.cabPrice : 0),
            moPrice: _num(pricing.moPrice, design ? design.moPrice : 0),
            legPrice: _num(pricing.legPrice, design ? design.legPrice : 0),
            windPrice: _num(pricing.windPrice, design ? design.windPrice : 0),
            marginPct: _num(pricing.marginPct, 20),
            isManualOverride: hasSession ? true : Boolean(pricing.isManualOverride)
          });
          if (!pricingToSave.projectFingerprint && typeof RAPricing.getProjectFingerprint === 'function') {
            pricingToSave.projectFingerprint = RAPricing.getProjectFingerprint();
          }
        }
        const commCfg = (typeof RAPricing !== 'undefined' && typeof RAPricing.getCommercialConfig === 'function')
          ? RAPricing.getCommercialConfig()
          : null;
        const customSummary = (typeof window !== 'undefined' && typeof window.getCustomCommercialSummary === 'function')
          ? window.getCustomCommercialSummary()
          : null;
        return {
          pricing: pricingToSave,
          commercialConfig: commCfg ? JSON.parse(JSON.stringify(commCfg)) : null,
          customCommercialSummary: customSummary || null
        };
      } catch(ePr) { return null; }
    })(),
    lastVirtualInverter: (typeof window !== 'undefined' && window.lastVirtualInverter) ? JSON.parse(JSON.stringify(window.lastVirtualInverter)) : null,
    solarLossConfig: (typeof window !== 'undefined' && window.solarLossConfig) ? JSON.parse(JSON.stringify(window.solarLossConfig)) : null,
    // [AUDIT v2.4] Persistencia completa de Maquetación, Personalización de Catálogo, Fotos y Marca
    proposalStyleStudio: (() => {
      try {
        if (typeof window !== 'undefined' && window.RAProposalStyleStudio && typeof window.RAProposalStyleStudio.getFullStudioState === 'function') {
          return window.RAProposalStyleStudio.getFullStudioState();
        }
        if (typeof localStorage !== 'undefined') {
          const raw = localStorage.getItem('ra_proposal_style_studio_v1');
          return raw ? JSON.parse(raw) : null;
        }
      } catch (eStudio) { console.warn('[RA Storage] Error exportando proposalStyleStudio:', eStudio); }
      return null;
    })(),
    customEquipment: (() => {
      try {
        const cat = (typeof window !== 'undefined' && window.equipmentCatalog) ? window.equipmentCatalog : null;
        const res = {};
        if (cat) {
          const defMods = (typeof DEFAULT_EQUIPMENT_CATALOG !== 'undefined' && Array.isArray(DEFAULT_EQUIPMENT_CATALOG.modules))
            ? DEFAULT_EQUIPMENT_CATALOG.modules.map(m => m.id) : [];
          const defInvs = (typeof DEFAULT_EQUIPMENT_CATALOG !== 'undefined' && Array.isArray(DEFAULT_EQUIPMENT_CATALOG.inverters))
            ? DEFAULT_EQUIPMENT_CATALOG.inverters.map(i => i.id) : [];
          const defBats = (typeof DEFAULT_EQUIPMENT_CATALOG !== 'undefined' && Array.isArray(DEFAULT_EQUIPMENT_CATALOG.batteries))
            ? DEFAULT_EQUIPMENT_CATALOG.batteries.map(b => b.id) : [];
          const defMicros = (typeof DEFAULT_EQUIPMENT_CATALOG !== 'undefined' && Array.isArray(DEFAULT_EQUIPMENT_CATALOG.microinverters))
            ? DEFAULT_EQUIPMENT_CATALOG.microinverters.map(m => m.id) : [];

          if (Array.isArray(cat.modules)) res.modules = cat.modules.filter(m => m && !defMods.includes(m.id));
          if (Array.isArray(cat.inverters)) res.inverters = cat.inverters.filter(i => i && !defInvs.includes(i.id));
          if (Array.isArray(cat.batteries)) res.batteries = cat.batteries.filter(b => b && !defBats.includes(b.id));
          if (Array.isArray(cat.microinverters)) res.microinverters = cat.microinverters.filter(m => m && !defMicros.includes(m.id));
        }
        if (typeof window !== 'undefined' && window.RAWindCatalog && typeof window.RAWindCatalog.getAll === 'function') {
          const allTurbines = window.RAWindCatalog.getAll();
          const defTurbineIds = ['bornay-wind-25.3', 'bornay-wind-13plus', 'enair-70pro', 'kliux-geo-4k'];
          res.windTurbines = allTurbines.filter(t => t && !defTurbineIds.includes(t.id));
        }
        return res;
      } catch (eCat) { return null; }
    })(),
    proposalPhotos: (() => {
      try {
        const mem = (typeof window !== 'undefined' && window.RA && window.RA._proposalCustomPhotos) ? window.RA._proposalCustomPhotos : null;
        if (mem) return JSON.parse(JSON.stringify(mem));
        if (typeof sessionStorage !== 'undefined') {
          const ss = sessionStorage.getItem('ra_proposal_custom_photos');
          return ss ? JSON.parse(ss) : null;
        }
      } catch (ePhotos) { return null; }
      return null;
    })(),
    companyBranding: (() => {
      try {
        if (typeof localStorage !== 'undefined') {
          const branding = localStorage.getItem('ra_company_branding');
          const logo = localStorage.getItem('ra_company_logo');
          return {
            branding: branding ? JSON.parse(branding) : null,
            logo: logo || null
          };
        }
      } catch (eBrand) { return null; }
      return null;
    })()
  };
}

// 2. Deserializar e Importar Proyecto Completo
const RA_PROJECT_CURRENT_VERSION = '2.4';

/**
 * [C5/M9] Migración de esquema de los archivos .raproject (retrocompatibilidad al abrir).
 * Aplica valores por defecto seguros a los campos que faltan según la versión del archivo,
 * de modo que un proyecto viejo se cargue sin romper el flujo de 5 pasos.
 */
function raMigrateProjectData(projectData) {
  if (!projectData || typeof projectData !== 'object') return projectData;
  const fromVer = parseFloat(projectData.version) || 1.0;
  const toVer = parseFloat(RA_PROJECT_CURRENT_VERSION);

  // [A7 FIX] Control de versiones futuras: evitar corrupción si el archivo proviene de una versión más reciente
  if (fromVer > toVer) {
    console.warn('[RA Storage] Advertencia: El archivo .raproject tiene versión ' + projectData.version + ', superior a la soportada (' + RA_PROJECT_CURRENT_VERSION + ').');
    if (typeof showToast === 'function') {
      showToast('VERSIÓN NUEVA', 'El archivo fue creado con una versión superior (' + projectData.version + '). Algunas funciones avanzadas podrían no cargarse.', 'warning', 6000);
    }
    // No degradar ciegamente la versión para no perder trazabilidad
    projectData.__futureVersionWarning = true;
  }

  // v1.x → contenedores normalizados
  if (fromVer < 2.0) {
    if (!projectData.workPlanes && Array.isArray(projectData.planes)) {
      projectData.workPlanes = { planes: projectData.planes, activePlaneIdx: projectData.activePlaneIdx || 0 };
    }
    if (!Array.isArray(projectData.polylines)) projectData.polylines = [];
    if (!Array.isArray(projectData.obstacles)) projectData.obstacles = [];
    if (!Array.isArray(projectData.buildings)) projectData.buildings = [];
  }

  // v2.0 → v2.1: faldones/paneles con estructura, orientación y MLPE
  if (fromVer < 2.1) {
    (Array.isArray(projectData.polylines) ? projectData.polylines : []).forEach(poly => {
      if (!poly || typeof poly !== 'object') return;
      if (!poly.structureType) poly.structureType = 'coplanar_teja';
      if (!poly.orientationPref) poly.orientationPref = 'portrait';
      if (!Array.isArray(poly.deletedPanels)) poly.deletedPanels = [];
      const panels = (poly.roofInfo && Array.isArray(poly.roofInfo.panels)) ? poly.roofInfo.panels : [];
      panels.forEach(p => {
        if (!p || typeof p !== 'object') return;
        if (typeof p.isManual !== 'boolean') p.isManual = false;
        if (typeof p.rot !== 'number') p.rot = 0;
        if (typeof p.hasMLPE !== 'boolean') p.hasMLPE = false;
        if (typeof p.isShaded !== 'boolean') p.isShaded = false;
      });
    });
  }

  // v2.1 → v2.2: estado de simulación unificado
  if (fromVer < 2.2) {
    if (!projectData.solarSimState || typeof projectData.solarSimState !== 'object') {
      projectData.solarSimState = { monthIdx: 5, hour: 12, viewMode: 'heatmap' };
    }
  }

  projectData.__migratedFrom = (isFinite(fromVer) && fromVer < toVer) ? fromVer : undefined;
  if (!projectData.__futureVersionWarning) {
    projectData.version = RA_PROJECT_CURRENT_VERSION;
  }
  return projectData;
}

// ─────────────────────────────────────────────────────────────────────────────
// ⏳ HUD Y CONTADOR VISUAL DE CARGA DE PROYECTOS (.raproject)
// ─────────────────────────────────────────────────────────────────────────────

function raEnsureLoadingHUDElements() {
  if (typeof document === 'undefined') return null;
  let hud = document.getElementById('ra-project-loading-hud');
  if (hud) return hud;

  if (!document.getElementById('ra-hud-spin-keyframes')) {
    const st = document.createElement('style');
    st.id = 'ra-hud-spin-keyframes';
    st.textContent = '@keyframes raHudSpin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }';
    document.head.appendChild(st);
  }

  hud = document.createElement('div');
  hud.id = 'ra-project-loading-hud';
  hud.style.cssText = 'display:none;position:fixed;inset:0;width:100vw;height:100vh;background:rgba(231,234,238,0.82);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);z-index:10000000;align-items:center;justify-content:center;font-family:var(--font-sans,system-ui,-apple-system,sans-serif);opacity:0;transition:opacity 0.25s ease-out;pointer-events:auto;user-select:none;';

  hud.innerHTML = `
    <div style="background:linear-gradient(145deg,#f3f5f8,#ebedf0);border:1px solid rgba(255,255,255,0.75);border-radius:18px;box-shadow:12px 12px 28px rgba(163,173,188,0.48),-12px -12px 28px rgba(255,255,255,0.9);padding:32px 36px;width:440px;max-width:90vw;display:flex;flex-direction:column;align-items:center;gap:20px;box-sizing:border-box;position:relative;overflow:hidden;">
      <div style="position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#e8a204,#f97316,#e8a204);"></div>
      <div style="display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;">
        <div style="position:relative;width:52px;height:52px;display:flex;align-items:center;justify-content:center;">
          <svg viewBox="0 0 52 52" style="width:100%;height:100%;animation:raHudSpin 3s linear infinite;">
            <circle cx="26" cy="26" r="22" fill="none" stroke="rgba(30,36,43,0.1)" stroke-width="3"></circle>
            <circle cx="26" cy="26" r="22" fill="none" stroke="#e8a204" stroke-width="3" stroke-dasharray="35 110" stroke-linecap="round"></circle>
          </svg>
          <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#e8a204;">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
            </svg>
          </div>
        </div>
        <div>
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#e8a204;">CARGANDO PROYECTO SOLAR</div>
          <div id="ra-load-hud-title" style="font-size:15px;font-weight:700;color:#1e242b;margin-top:2px;max-width:360px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Cargando...</div>
        </div>
      </div>
      <div style="display:flex;align-items:baseline;gap:4px;">
        <span id="ra-load-hud-pct" style="font-size:44px;font-weight:800;font-family:var(--font-mono,monospace);color:#e8a204;text-shadow:0 2px 10px rgba(232, 162, 4,0.18);line-height:1;">0</span>
        <span style="font-size:22px;font-weight:700;color:#57606a;font-family:var(--font-mono,monospace);">%</span>
      </div>
      <div style="width:100%;display:flex;flex-direction:column;gap:8px;">
        <div style="width:100%;height:8px;background:#dfe3e8;border-radius:999px;overflow:hidden;border:1px solid rgba(255,255,255,0.5);box-shadow:inset 2px 2px 5px rgba(163,173,188,0.5),inset -2px -2px 5px rgba(255,255,255,0.8);">
          <div id="ra-load-hud-bar" style="width:0%;height:100%;background:linear-gradient(90deg,#e8a204,#f97316);border-radius:999px;transition:width 0.12s ease-out;box-shadow:0 0 8px rgba(232, 162, 4,0.35);"></div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;width:100%;">
          <span id="ra-load-hud-status" style="font-size:12px;font-weight:600;color:#1e242b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:280px;">Iniciando carga...</span>
          <span id="ra-load-hud-detail" style="font-size:10.5px;color:#57606a;font-family:var(--font-mono,monospace);flex-shrink:0;">Fase 1/6</span>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(hud);
  return hud;
}

function raShowProjectLoadingHUD(projectName) {
  if (typeof document === 'undefined') return;
  const hud = raEnsureLoadingHUDElements();
  if (!hud) return;

  const titleEl = document.getElementById('ra-load-hud-title');
  const pctEl = document.getElementById('ra-load-hud-pct');
  const barEl = document.getElementById('ra-load-hud-bar');
  const statusEl = document.getElementById('ra-load-hud-status');
  const detailEl = document.getElementById('ra-load-hud-detail');

  if (titleEl) titleEl.textContent = projectName || 'Proyecto Solar';
  if (pctEl) pctEl.textContent = '0';
  if (barEl) barEl.style.width = '0%';
  if (statusEl) statusEl.textContent = 'Iniciando carga...';
  if (detailEl) detailEl.textContent = 'Preparando entorno...';

  hud.style.display = 'flex';
  setTimeout(() => {
    if (hud) hud.style.opacity = '1';
  }, 10);
}

function raUpdateProjectLoadingProgress(percent, statusText, detailText) {
  if (typeof document === 'undefined') return;
  raEnsureLoadingHUDElements();

  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const pctEl = document.getElementById('ra-load-hud-pct');
  const barEl = document.getElementById('ra-load-hud-bar');
  const statusEl = document.getElementById('ra-load-hud-status');
  const detailEl = document.getElementById('ra-load-hud-detail');

  if (pctEl) pctEl.textContent = String(clamped);
  if (barEl) barEl.style.width = clamped + '%';
  if (statusEl && statusText) statusEl.textContent = statusText;
  if (detailEl && detailText) detailEl.textContent = detailText;
}

function raHideProjectLoadingHUD() {
  if (typeof document === 'undefined') return;
  const hud = document.getElementById('ra-project-loading-hud');
  if (!hud) return;

  hud.style.opacity = '0';
  setTimeout(() => {
    if (hud && hud.style.opacity === '0') {
      hud.style.display = 'none';
    }
  }, 260);
}

/**
 * [CAM-RESTORE] Restaura de forma robusta la cámara de Cesium a partir de datos serializados.
 * Prioriza heading/pitch/roll para orientación astronómica/geodésica libre de deformaciones.
 */
function _raApplyCamera(camData) {
  if (!camData || typeof viewer === 'undefined' || !viewer || !viewer.camera || typeof Cesium === 'undefined') return;
  try {
    const pos = _raToCartesian3(camData.position);
    if (!pos) return;

    if (typeof camData.heading === 'number' && typeof camData.pitch === 'number' && isFinite(camData.heading) && isFinite(camData.pitch)) {
      viewer.camera.setView({
        destination: pos,
        orientation: {
          heading: camData.heading,
          pitch: camData.pitch,
          roll: (typeof camData.roll === 'number' && isFinite(camData.roll)) ? camData.roll : 0
        }
      });
    } else if (camData.direction && camData.up) {
      const cDir = _raToCartesian3(camData.direction);
      const cUp = _raToCartesian3(camData.up);
      if (cDir && cUp) {
        viewer.camera.setView({
          destination: pos,
          orientation: { direction: cDir, up: cUp }
        });
      } else {
        viewer.camera.setView({ destination: pos });
      }
    } else {
      viewer.camera.setView({ destination: pos });
    }
  } catch (eCam) {
    window.RA && window.RA.log && window.RA.log.debug('Error restaurando cámara:', eCam);
  }
}

async function raImportProjectData(projectData, options = {}) {
  // [C4 FIX] Mutex de concurrencia: evitar importaciones simultáneas (D&D doble, Ctrl+S durante import)
  if (_raImportInProgress && (!options || !options.isRollback)) {
    console.warn('[RA Storage] Importación en curso ignorada: otra operación de importación está activa.');
    if (typeof showToast === 'function') {
      showToast('OPERACIÓN EN CURSO', 'Ya hay una carga de proyecto ejecutándose.', 'warning', 2500);
    }
    return false;
  }
  if (!options || !options.isRollback) {
    _raImportInProgress = true;
    if (typeof window !== 'undefined') window._raImportInProgress = true;
  }

  // [P0.2] Carrera de arranque y espera determinista: si el visor Cesium o el subsistema WP
  // aún no existen o están inicializándose, reintentar de forma controlada hasta 25 veces (5 segundos).
  if (typeof viewer === 'undefined' || !viewer || typeof WP === 'undefined' || !WP) {
    var _retryCount = (projectData.__raImportRetryCount || 0) + 1;
    projectData.__raImportRetryCount = _retryCount;
    if (_retryCount <= 25) {
      raEnsureLoadingHUDElements();
      raShowProjectLoadingHUD(projectData.metadata && projectData.metadata.name);
      raUpdateProjectLoadingProgress(
        Math.min(25, _retryCount * 2),
        'ESPERANDO INICIALIZACIÓN DEL VISOR 3D (' + _retryCount + '/25)...',
        'Iniciando motor CesiumJS'
      );
      if (typeof showStatus === 'function') {
        showStatus('ESPERANDO INICIALIZACIÓN DEL VISOR 3D (' + _retryCount + '/25)...', 1500);
      }
      return new Promise(function(resolve) {
        setTimeout(async function() {
          try {
            _raImportInProgress = false; // reset para el reintento
            const res = await raImportProjectData(projectData, options);
            resolve(res);
          } catch(eDef) {
            _raImportInProgress = false;
            if (window.RA_ErrorHandler) window.RA_ErrorHandler.handle(eDef, 'import diferido');
            resolve(false);
          }
        }, 200);
      });
    } else {
      delete projectData.__raImportRetryCount;
      _raImportInProgress = false;
      raHideProjectLoadingHUD();
      console.error('[RA Storage] Timeout: El visor 3D o WP no se inicializaron a tiempo.');
      if (typeof showToast === 'function') {
        showToast('ERROR AL ABRIR', 'El visor 3D no respondió a tiempo. Intente de nuevo tras cargar el mapa.', 'error', 5000);
      }
      return false;
    }
  }
  delete projectData.__raImportRetryCount;
  delete projectData.__raImportDeferred;

  const projName = (projectData && projectData.metadata && projectData.metadata.name) || _raCurrentProjectName || 'Proyecto Solar';
  raShowProjectLoadingHUD(projName);

  // Snapshot previo para rollback transaccional ante archivos corruptos o excepciones
  let preImportSnapshot = null;
  if (!options || !options.isRollback) {
    try {
      if (typeof raExportProjectData === 'function') {
        preImportSnapshot = raExportProjectData();
      }
    } catch (eSnap) {
      console.warn('[RA Storage] No se pudo generar snapshot previo:', eSnap);
    }
  }

  try {
    if (!projectData || (projectData.format !== 'RA_SOLAR_PROJECT' && !projectData.polylines && !projectData.planes)) {
      throw new Error('El archivo no tiene un formato .raproject válido');
    }

    // Fase 1: Migración y verificación de esquema
    raUpdateProjectLoadingProgress(15, 'Validando estructura del archivo .raproject...', 'Comprobando esquema y versión ' + (projectData.version || '1.0'));
    await new Promise(r => setTimeout(r, 160));

    // [C5/M9] Migrar esquema de versiones antiguas antes de restaurar
    projectData = raMigrateProjectData(projectData);

    if (typeof showStatus === 'function') showStatus('RESTAURANDO PROYECTO 3D...', 3000);

    // Fase 2: Limpieza de escena previa y cámara 3D
    raUpdateProjectLoadingProgress(35, 'Limpiando escena y orientando cámara 3D...', 'Posicionando vista y frustum');
    await new Promise(r => setTimeout(r, 180));

    // 1. Limpieza de estado previo segura
    if (typeof clearSimulatedPV === 'function') clearSimulatedPV();
    if (window._obsEntities && typeof viewer !== 'undefined' && viewer && viewer.entities) {
      window._obsEntities.forEach(e => {
        try { viewer.entities.remove(e); } catch(errRemove) {}
      });
      window._obsEntities = [];
    }
    if (window._obsPrimitives && typeof viewer !== 'undefined' && viewer && viewer.scene && viewer.scene.primitives) {
      window._obsPrimitives.forEach(p => {
        try { if (p && !p.isDestroyed()) viewer.scene.primitives.remove(p); } catch(errRemove) {}
      });
      window._obsPrimitives = [];
    }
    if (window._buildingEntities && typeof viewer !== 'undefined' && viewer && viewer.entities) {
      window._buildingEntities.forEach(e => {
        try { viewer.entities.remove(e); } catch(errRemove) {}
      });
      window._buildingEntities = [];
    }
    if (window._buildingPrimitives && typeof viewer !== 'undefined' && viewer && viewer.scene && viewer.scene.primitives) {
      window._buildingPrimitives.forEach(p => {
        try { if (p && !p.isDestroyed()) viewer.scene.primitives.remove(p); } catch(errRemove) {}
      });
      window._buildingPrimitives = [];
    }
    if (window._bldEntities && typeof viewer !== 'undefined' && viewer && viewer.entities) {
      window._bldEntities.forEach(e => {
        try { viewer.entities.remove(e); } catch(errRemove) {}
      });
      window._bldEntities = [];
    }
    if (typeof wpClearDynamicShadows === 'function') {
      try { wpClearDynamicShadows(); } catch(eShd) {}
    } else if (typeof window !== 'undefined' && window.wpClearDynamicShadows) {
      try { window.wpClearDynamicShadows(); } catch(eShd) {}
    }
    if (typeof wpClearInverterAndCables === 'function') {
      try { wpClearInverterAndCables(); } catch(eClr) {}
    }
    if (window.RAWindTurbine && typeof window.RAWindTurbine.cleanAll === 'function') {
      try { window.RAWindTurbine.cleanAll(); } catch(eWt) {}
    }
    // [C2 FIX] Limpiar todas las primitivas y anillos de aerogeneradores de la GPU antes de deserializar
    if (window.RAWindVisualizer && typeof window.RAWindVisualizer.clearAll === 'function') {
      try { window.RAWindVisualizer.clearAll(); } catch(eWvc) {}
    }
    if (typeof window !== 'undefined') {
      window.windTurbines = [];
      window.windParkSummary = null;
      window.inverterEquipmentState = {
        position: null,
        carto: null,
        rotation: 0,
        dcProtectionPosition: null,
        dcProtectionCarto: null,
        dcProtectionRotation: 0,
        batteryPosition: null,
        batteryCarto: null,
        batteryRotation: 0,
        gridMeter: { position: null, carto: null, rotation: 0 },
        combinerBox: { isEnabled: false, position: null, carto: null, rotation: 0 },
        routes: { dc: [], ac: [] },
        cabling: null
      };
    }
    if ((!options || !options.preserveUndoHistory) && window.RAundo && typeof window.RAundo.clear === 'function') {
      window.RAundo.clear();
    }

    // [AUDIT v2.6] Restaurar Equipos Personalizados en el Catálogo local TEMPRANO (antes de geometrías, 3D y selectores)
    if (projectData.customEquipment && typeof window !== 'undefined') {
      try {
        const ce = projectData.customEquipment;
        const cat = window.equipmentCatalog;
        let modified = false;
        if (cat) {
          ['modules', 'inverters', 'batteries', 'microinverters'].forEach(catKey => {
            if (Array.isArray(ce[catKey]) && Array.isArray(cat[catKey])) {
              ce[catKey].forEach(item => {
                if (item && item.id && !cat[catKey].some(existing => existing.id === item.id)) {
                  cat[catKey].push(item);
                  modified = true;
                }
              });
            }
          });
          if (modified && typeof window.saveEquipmentCatalog === 'function') {
            window.saveEquipmentCatalog();
          }
        }
        if (Array.isArray(ce.windTurbines) && window.RAWindCatalog && typeof window.RAWindCatalog.upsert === 'function') {
          ce.windTurbines.forEach(t => {
            if (t && t.id) window.RAWindCatalog.upsert(t);
          });
        }
      } catch (eCat) { console.warn('[RA Storage] Error restaurando customEquipment temprano:', eCat); }
    }

    // 2. Restaurar Cámara (Fase temprana: orienta frustum y activa streaming 3D)
    _raApplyCamera(projectData.camera);

    // Fase 3: Restaurar Planos de Trabajo, Faldones y Obstáculos 3D
    raUpdateProjectLoadingProgress(58, 'Reconstruyendo faldones y obstáculos 3D...', 'Cargando planos CAD y geometría volumétrica');
    await new Promise(r => setTimeout(r, 180));

    // 3. Restaurar Planos de Trabajo
    if (typeof WP !== 'undefined') {
      WP.planes = [];
      const inPlanes = (projectData.workPlanes && Array.isArray(projectData.workPlanes.planes))
        ? projectData.workPlanes.planes
        : (Array.isArray(projectData.planes) ? projectData.planes : []);

      inPlanes.forEach(p => {
        const pt1 = _raToCartesian3(p.p1);
        const pt2 = _raToCartesian3(p.p2);
        const pt3 = _raToCartesian3(p.p3);
        
        // Reconstrucción del array canónico con validación estricta de números finitos
        const pts3D = (p.pts3D && Array.isArray(p.pts3D)) 
           ? p.pts3D.map(_raToCartesian3).filter(Boolean) 
           : [pt1, pt2, pt3].filter(Boolean);

        WP.planes.push({
          id: p.id || ('wp_plane_' + Date.now()),
          name: p.name || 'Plano de Trabajo',
          buildingId: p.buildingId || null,
          isRoof: !!p.isRoof,
          p1: pt1,
          p2: pt2,
          p3: pt3,
          pts3D: pts3D,
          origin: _raToCartesian3(p.origin),
          normal: _raToCartesian3(p.normal),
          uVec: _raToCartesian3(p.uVec),
          vVec: _raToCartesian3(p.vVec),
          tiltDeg: _raIsValidCoord(p.tiltDeg) ? p.tiltDeg : 0,
          azimuthDeg: _raIsValidCoord(p.azimuthDeg) ? p.azimuthDeg : 0,
          area: _raIsValidCoord(p.area) ? p.area : 0
        });
      });
      WP.activePlaneIdx = (projectData.workPlanes && typeof projectData.workPlanes.activePlaneIdx === 'number')
        ? projectData.workPlanes.activePlaneIdx
        : 0;
    }

    // 4. Restaurar Polilíneas
    if (typeof WP !== 'undefined') {
      WP.polylines = [];
      const inPolys = Array.isArray(projectData.polylines) ? projectData.polylines : [];
      inPolys.forEach((poly, pIdx) => {
        const pts = Array.isArray(poly.points) ? poly.points.map(_raToCartesian3).filter(Boolean) : [];
        let rInfo = null;
        if (poly.roofInfo) {
          rInfo = {
            area: poly.roofInfo.area,
            tilt: poly.roofInfo.tilt,
            azimuth: poly.roofInfo.azimuth,
            panels: Array.isArray(poly.roofInfo.panels) ? poly.roofInfo.panels.map((p, pPanIdx) => ({
              u: p.u, v: p.v, w: p.w, h: p.h,
              gridA: (typeof p.gridA === 'number') ? p.gridA : null,
              gridB: (typeof p.gridB === 'number') ? p.gridB : null,
              layoutIndex: (typeof p.layoutIndex === 'number') ? p.layoutIndex : pPanIdx,
              localIdx: (typeof p.localIdx === 'number') ? p.localIdx : pPanIdx,
              polyIdx: (typeof p.polyIdx === 'number') ? p.polyIdx : pIdx,
              orientation: p.orientation,
              tiltDeg: p.tiltDeg,
              azimuthDeg: p.azimuthDeg,
              stringId: p.stringId,
              isManual: !!p.isManual,
              rot: p.rot || 0,
              panelId: p.panelId || ('pan_' + pIdx + '_' + pPanIdx),
              hasMLPE: !!p.hasMLPE,
              isShaded: !!p.isShaded,
              annualKwh: p.annualKwh || null,
              shadePct: (typeof p.shadePct === 'number') ? p.shadePct : null,
              center: _raToCartesian3(p.center),
              corners: Array.isArray(p.corners) ? p.corners.map(_raToCartesian3).filter(Boolean) : []
            })) : []
          };
        }
        const polyArea = (poly.roofInfo && typeof poly.roofInfo.area === 'number')
          ? poly.roofInfo.area
          : (typeof poly.area === 'number'
            ? poly.area
            : (typeof wpPolylineArea3D === 'function' && pts.length >= 3 ? (wpPolylineArea3D(pts) || 0) : 0));

        WP.polylines.push({
          id: poly.id || ('wp_poly_' + Date.now() + '_' + pIdx),
          name: poly.name || ('Faldon #' + (pIdx + 1)),
          buildingId: poly.buildingId || null,
          isRoof: !!poly.isRoof,
          assignedTopology: poly.assignedTopology || null,
          optimizerCoverage: poly.optimizerCoverage || null,
          panelsDisabled: !!poly.panelsDisabled,
          visible: poly.visible !== false,
          panelsVisible: poly.panelsVisible !== false,
          planeIdx: (typeof poly.planeIdx === 'number') ? poly.planeIdx : (WP.activePlaneIdx || 0),
          structureType: poly.structureType || 'coplanar_teja',
          estructura: poly.estructura ? JSON.parse(JSON.stringify(poly.estructura)) : (poly.structureType && poly.structureType.includes('pergola') ? { tipo: 'pergola', clearance: 1.80 } : (poly.structureType && poly.structureType.includes('triangle') ? { tipo: 'balasto', clearance: 0.20 } : { tipo: 'coplanar', clearance: 0.05 })),
          moduleId: poly.moduleId || null,
          arrangementMode: poly.arrangementMode || null,
          alignToPlane: poly.alignToPlane !== false,
          hasWalkway: !!poly.hasWalkway,
          walkwayWidth: (typeof poly.walkwayWidth === 'number') ? poly.walkwayWidth : 0.80,
          points: pts,
          area: polyArea,
          color: poly.color || '#38bdf8',
          orientationPref: poly.orientationPref || 'portrait',
          modTilt: poly.modTilt || 'auto',
          modAzimuth: poly.modAzimuth || 'auto',
          lockRowPitch: !!poly.lockRowPitch,
        lockedRowPitchM: (typeof poly.lockedRowPitchM === 'number') ? poly.lockedRowPitchM : 0,
        manualClearSpacingM: (typeof poly.manualClearSpacingM === 'number') ? poly.manualClearSpacingM : null,
        rowPitchDesignWindowH: (typeof poly.rowPitchDesignWindowH === 'number') ? poly.rowPitchDesignWindowH : 2.0,
          ignore3DTilesShadows: !!(poly.ignore3DTilesShadows || (poly.roofInfo && poly.roofInfo.ignore3DTilesShadows)),
          matrixShiftA: (typeof poly.matrixShiftA === 'number') ? poly.matrixShiftA : ((typeof poly.matrixShiftU === 'number') ? poly.matrixShiftU : 0),
          matrixShiftB: (typeof poly.matrixShiftB === 'number') ? poly.matrixShiftB : ((typeof poly.matrixShiftV === 'number') ? poly.matrixShiftV : 0),
          matrixShiftU: (typeof poly.matrixShiftA === 'number') ? poly.matrixShiftA : ((typeof poly.matrixShiftU === 'number') ? poly.matrixShiftU : 0),
          matrixShiftV: (typeof poly.matrixShiftB === 'number') ? poly.matrixShiftB : ((typeof poly.matrixShiftV === 'number') ? poly.matrixShiftV : 0),
          deletedPanels: Array.isArray(poly.deletedPanels) ? poly.deletedPanels.map(dp => ({
            panelId: dp.panelId || null,
            layoutIndex: (typeof dp.layoutIndex === 'number') ? dp.layoutIndex : null,
            localIdx: (typeof dp.localIdx === 'number') ? dp.localIdx : null,
            u: dp.u,
            v: dp.v,
            center: _raToCartesian3(dp.center)
          })) : [],
          roofInfo: rInfo,
          hasManualPanels: !!(poly.hasManualPanels || (rInfo && Array.isArray(rInfo.panels) && rInfo.panels.some(p => p && p.isManual))),
          _hasManualPanels: !!(poly.hasManualPanels || (rInfo && Array.isArray(rInfo.panels) && rInfo.panels.some(p => p && p.isManual))),
          _preserveImportedPanels: !!(poly.preserveImportedPanels || poly.hasManualPanels || (rInfo && Array.isArray(rInfo.panels) && rInfo.panels.some(p => p && p.isManual))),
          _fromProjectImport: true
        });
      });

      // [REHYDRATE-GEOMETRY] Reconstruir base ortonormal (transform, invTransform, uVec, vVec, normal, poly2D, coplanar)
      // en cada poly.roofInfo importado vía SSOT js/polygon-shadow-math.js.
      try {
        if (typeof rehydratePolylineRoofInfo === 'function') {
          WP.polylines.forEach((poly) => rehydratePolylineRoofInfo(poly, true));
        }
      } catch (eGeoReh) {
        console.warn('[RA Storage] Aviso rehidratando geometría de roofInfo:', eGeoReh);
      }

      // [REHYDRATE-MANUAL-PANELS] Inmediatamente rehidratar window.allRenderedPanels y lastRoofInfo
      try {
        if (typeof window !== 'undefined') {
          const importedAllPanels = [];
          WP.polylines.forEach((poly, polyI) => {
            if (poly.roofInfo && Array.isArray(poly.roofInfo.panels)) {
              poly.roofInfo.panels.forEach((pan, panI) => {
                pan.polyIdx = polyI;
                pan.globalIdx = importedAllPanels.length;
                importedAllPanels.push(pan);
              });
            }
          });
          if (importedAllPanels.length > 0) {
            window.allRenderedPanels = importedAllPanels;
            if (WP.polylines[0] && WP.polylines[0].roofInfo) {
              window.lastRoofInfo = WP.polylines[0].roofInfo;
              if (typeof lastRoofInfo !== 'undefined') lastRoofInfo = WP.polylines[0].roofInfo;
            }
          }
        }
      } catch (rehydrateErr) {
        console.warn('[STORAGE] Error rehidratando allRenderedPanels:', rehydrateErr);
      }

      WP.selectedPolyIdx = (projectData.workPlanes && typeof projectData.workPlanes.selectedPolyIdx === 'number' && projectData.workPlanes.selectedPolyIdx < WP.polylines.length)
        ? projectData.workPlanes.selectedPolyIdx
        : (WP.polylines.length > 0 ? 0 : -1);
    }

    // 5. Restaurar Obstáculos — Rehidratación Cartesian3 e in-place update
    if (Array.isArray(projectData.obstacles)) {
      const _obsClean = JSON.parse(JSON.stringify(projectData.obstacles, (k, v) => (k === 'entity' || (k && k.charAt && k.charAt(0) === '_')) ? undefined : v));
      const _arrObs = (typeof window !== 'undefined' && Array.isArray(window.obstacles)) ? window.obstacles : (typeof obstacles !== 'undefined' && Array.isArray(obstacles) ? obstacles : []);
      _arrObs.length = 0;
      _obsClean.forEach(o => {
        if (!o) return;
        if (o.cartesian) o.cartesian = _raToCartesian3(o.cartesian);
        if (o.center) o.center = _raToCartesian3(o.center);
        if (Array.isArray(o.points)) o.points = o.points.map(_raToCartesian3).filter(Boolean);
        if (o.type === 'wind_turbine' && window.RAWindTurbine && typeof window.RAWindTurbine.ensureProps === 'function') {
          window.RAWindTurbine.ensureProps(o);
        }
        _arrObs.push(o);
      });
      obstacles = _arrObs;
      if (typeof window !== 'undefined') window.obstacles = _arrObs;
      window.selectedObstacleId = null;
    }

    // 5.b Restaurar Edificios 3D — Rehidratación Cartesian3 e in-place update
    if (Array.isArray(projectData.buildings)) {
      const _bldClean = JSON.parse(JSON.stringify(projectData.buildings, (k, v) => (k === 'entity' || (k && k.charAt && k.charAt(0) === '_')) ? undefined : v));
      const _arrBld = (typeof window !== 'undefined' && Array.isArray(window.buildings)) ? window.buildings : (typeof buildings !== 'undefined' && Array.isArray(buildings) ? buildings : []);
      _arrBld.length = 0;
      _bldClean.forEach(b => {
        if (!b) return;
        if (Array.isArray(b.points)) b.points = b.points.map(_raToCartesian3).filter(Boolean);
        if (b.center) b.center = _raToCartesian3(b.center);
        _arrBld.push(b);
      });
      buildings = _arrBld;
      if (typeof window !== 'undefined') window.buildings = _arrBld;
    }

    // 6. Restaurar Configuración de Paneles y Metadatos
    if (projectData.panelConfig && typeof panelConfig !== 'undefined') {
      Object.assign(panelConfig, projectData.panelConfig);
    }

    if (projectData.metadata && projectData.metadata.name) {
      _raCurrentProjectName = projectData.metadata.name;
    }
    if (projectData.metadata && projectData.metadata.address) {
      const searchInp = document.getElementById('ra-search-input');
      if (searchInp) searchInp.value = projectData.metadata.address;
      const navAddr = document.getElementById('nav-info-address');
      if (navAddr) navAddr.textContent = projectData.metadata.address;
    }

    // Fase 4: Re-renderizado de escena y módulos fotovoltaicos
    raUpdateProjectLoadingProgress(78, 'Renderizando módulos fotovoltaicos...', 'Generando layout, sombras y métricas');
    await new Promise(r => setTimeout(r, 180));

    // 7. Re-renderizar Todo
    if (typeof isPolygonDesignConfirmed !== 'undefined') isPolygonDesignConfirmed = true;
    if (typeof wpRenderAllPolylines === 'function') wpRenderAllPolylines();
    let previewTargetStep = (projectData.metadata && typeof projectData.metadata.currentStep === 'number')
      ? projectData.metadata.currentStep
      : (typeof projectData.currentStep === 'number' ? projectData.currentStep : 2);
    if (previewTargetStep <= 1 && typeof wpRenderActivePlaneGizmo === 'function') {
      wpRenderActivePlaneGizmo();
    } else if (typeof wpClearAllPlaneGizmos === 'function') {
      wpClearAllPlaneGizmos();
    }
    if (typeof render3DObstaclesInCesium === 'function') render3DObstaclesInCesium();
    if (window.RAWindTurbine && typeof window.RAWindTurbine.renderAll === 'function') window.RAWindTurbine.renderAll();

    // 5.c Restaurar y migrar Aerogeneradores RA-Wind
    if (typeof window !== 'undefined' && window.RAWind && window.RAWind.Entity) {
      if (projectData.windResourceConfig && window.RAWind.Resource && typeof window.RAWind.Resource.updateConfig === 'function') {
        try { window.RAWind.Resource.updateConfig(projectData.windResourceConfig); } catch(eWrc) {}
      } else if (!projectData.windResourceConfig && window.RAWind.Resource && typeof window.RAWind.Resource.updateConfig === 'function') {
        // [A4 FIX] Si el proyecto no tiene windResourceConfig, restablecer a valores por defecto
        try {
          var _defSectors = (window.RAWind.Resource.DEFAULT_SECTORS) ? JSON.parse(JSON.stringify(window.RAWind.Resource.DEFAULT_SECTORS)) : null;
          window.RAWind.Resource.updateConfig({
            sourceName: 'Manual / IDAE (Por defecto)',
            vMeanRefMs: 5.5,
            vMean50mMs: 7.2,
            refHeightM: 10.0,
            weibullK: 2.0,
            roughnessLengthM: 0.10,
            shearExponentAlpha: 0.143,
            prevailingWindDirDeg: 270,
            autoYawToWind: true,
            ambientTempC: 15.0,
            siteAltitudeM: 100.0,
            receptorDistanceM: 35.0,
            availabilityFactor: 0.97,
            electricalEfficiency: 0.95,
            sectors: _defSectors
          });
        } catch(eWrcDef) {}
      }
      if (Array.isArray(projectData.windTurbines)) {
        window.RAWind.Entity.deserializeAll(projectData.windTurbines);
      }
      try { window.RAWind.Entity.migrateLegacyObstacles(); } catch(eMig) {}
      if (window.RAWindVisualizer && typeof window.RAWindVisualizer.renderAll === 'function') {
        try { window.RAWindVisualizer.renderAll(); } catch(eWv) {}
      }
      if (window.RAWindUI && typeof window.RAWindUI.renderStep2Panel === 'function') {
        try { window.RAWindUI.renderStep2Panel(); } catch(eWu) {}
      }
    }
    if (typeof render3DBuildingsInCesium === 'function') render3DBuildingsInCesium();
    if (typeof wpFastRenderSimulatedPanels === 'function') wpFastRenderSimulatedPanels();
    if (typeof recalculateSolarYield === 'function') recalculateSolarYield();
    if (typeof wpUpdateUI === 'function') wpUpdateUI();
    if (typeof wpUpdateAllMetrics === 'function') wpUpdateAllMetrics();
    if (typeof window.wpInvalidateHeatmap === 'function') window.wpInvalidateHeatmap('Proyecto cargado: recalcular análisis solar');

    // Fase 5: Restaurar Gemelo Digital Eléctrico (Inversor, Cuadros, Contador, Cables)
    raUpdateProjectLoadingProgress(92, 'Generando gemelo digital eléctrico y cableado...', 'Restaurando inversor, protecciones y REBT');
    await new Promise(r => setTimeout(r, 180));

    // 8. Restaurar Gemelo Digital Eléctrico (Inversor, Cuadros, Contador, Cables)
    if (projectData.electricalInfrastructure && typeof window !== 'undefined') {
      const elec = projectData.electricalInfrastructure;
      if (!window.inverterEquipmentState) window.inverterEquipmentState = {};
      if (elec.selections && window.solarProjectConfig) {
        Object.assign(window.solarProjectConfig, elec.selections);
      }
      const _applyEntityHeading = function(ent, pos, deg) {
        if (!ent || !pos || typeof deg !== 'number' || typeof Cesium === 'undefined') return;
        try {
          const hpr = new Cesium.HeadingPitchRoll(Cesium.Math.toRadians(deg), 0, 0);
          ent.orientation = Cesium.Transforms.headingPitchRollQuaternion(pos, hpr);
        } catch (eRot) {}
      };

      if (elec.inverter && elec.inverter.position && typeof Cesium !== 'undefined') {
        const invPt = new Cesium.Cartesian3(elec.inverter.position.x, elec.inverter.position.y, elec.inverter.position.z);
        if (typeof elec.inverter.rotation === 'number' && window.inverterEquipmentState) {
          window.inverterEquipmentState.rotation = elec.inverter.rotation;
        }
        if (typeof wpPlaceInverterAtPosition === 'function') wpPlaceInverterAtPosition(invPt);
        if (window.inverterEquipmentState && typeof elec.inverter.rotation === 'number') {
          window.inverterEquipmentState.rotation = elec.inverter.rotation;
          _applyEntityHeading(window.inverterEquipmentState.entity, invPt, elec.inverter.rotation);
        }
      }
      if (elec.dcProtection && elec.dcProtection.position && typeof Cesium !== 'undefined' && window.inverterEquipmentState) {
        const s = window.inverterEquipmentState;
        const dcPt = new Cesium.Cartesian3(elec.dcProtection.position.x, elec.dcProtection.position.y, elec.dcProtection.position.z);
        s.dcProtectionPosition = dcPt;
        if (elec.dcProtection.carto) s.dcProtectionCarto = elec.dcProtection.carto;
        if (typeof elec.dcProtection.rotation === 'number') s.dcProtectionRotation = elec.dcProtection.rotation;
        if (!s.dcProtectionEntity && typeof wpPlaceInverterAtPosition === 'function' && s.position) {
          // Si no se colocó aún la entidad DC, regenerarla desde wpPlaceInverterAtPosition si procede
          wpPlaceInverterAtPosition(s.position);
          s.dcProtectionPosition = dcPt;
        }
        if (s.dcProtectionEntity) {
          s.dcProtectionEntity.position = new Cesium.ConstantPositionProperty(dcPt);
          if (typeof elec.dcProtection.rotation === 'number') {
            _applyEntityHeading(s.dcProtectionEntity, dcPt, elec.dcProtection.rotation);
          }
        }
        if (s.dcProtectionLabel2D) s.dcProtectionLabel2D.position = dcPt;
      }
      if (elec.battery && elec.battery.position && typeof Cesium !== 'undefined' && window.inverterEquipmentState) {
        const s = window.inverterEquipmentState;
        const batPt = new Cesium.Cartesian3(elec.battery.position.x, elec.battery.position.y, elec.battery.position.z);
        s.batteryPosition = batPt;
        if (elec.battery.carto) s.batteryCarto = elec.battery.carto;
        if (typeof elec.battery.rotation === 'number') s.batteryRotation = elec.battery.rotation;
        if (typeof wpRenderBattery3D === 'function') {
          wpRenderBattery3D();
        } else {
          if (s.batteryEntity) s.batteryEntity.position = new Cesium.ConstantPositionProperty(batPt);
          if (s.batteryLabel2D) s.batteryLabel2D.position = batPt;
        }
        if (typeof elec.battery.rotation === 'number') {
          _applyEntityHeading(s.batteryEntity, batPt, elec.battery.rotation);
        }
      }
      if (elec.gridMeter && elec.gridMeter.position && typeof Cesium !== 'undefined') {
        const meterPt = new Cesium.Cartesian3(elec.gridMeter.position.x, elec.gridMeter.position.y, elec.gridMeter.position.z);
        if (typeof elec.gridMeter.rotation === 'number' && window.inverterEquipmentState && window.inverterEquipmentState.gridMeter) {
          window.inverterEquipmentState.gridMeter.rotation = elec.gridMeter.rotation;
        }
        if (typeof wpPlaceGridMeterAtPosition === 'function') wpPlaceGridMeterAtPosition(meterPt);
        if (typeof elec.gridMeter.rotation === 'number' && window.inverterEquipmentState && window.inverterEquipmentState.gridMeter) {
          window.inverterEquipmentState.gridMeter.rotation = elec.gridMeter.rotation;
          _applyEntityHeading(window.inverterEquipmentState.gridMeter.entity, meterPt, elec.gridMeter.rotation);
        }
      }
      if (elec.combinerBox && elec.combinerBox.isEnabled && elec.combinerBox.position && typeof Cesium !== 'undefined') {
        const cbPt = new Cesium.Cartesian3(elec.combinerBox.position.x, elec.combinerBox.position.y, elec.combinerBox.position.z);
        if (typeof elec.combinerBox.rotation === 'number' && window.inverterEquipmentState && window.inverterEquipmentState.combinerBox) {
          window.inverterEquipmentState.combinerBox.rotation = elec.combinerBox.rotation;
        }
        if (typeof wpPlaceCombinerBoxAtPosition === 'function') wpPlaceCombinerBoxAtPosition(cbPt);
        if (typeof elec.combinerBox.rotation === 'number' && window.inverterEquipmentState && window.inverterEquipmentState.combinerBox) {
          window.inverterEquipmentState.combinerBox.rotation = elec.combinerBox.rotation;
          _applyEntityHeading(window.inverterEquipmentState.combinerBox.entity, cbPt, elec.combinerBox.rotation);
        }
      }
      if (elec.cabling && window.inverterEquipmentState) {
        if (typeof elec.cabling.L_dc_measured === 'number') window.inverterEquipmentState.L_dc_measured = elec.cabling.L_dc_measured;
        if (typeof elec.cabling.L_ac_measured === 'number') window.inverterEquipmentState.L_ac_measured = elec.cabling.L_ac_measured;
        if (typeof elec.cabling.S_dc_recommended === 'number') window.inverterEquipmentState.S_dc_recommended = elec.cabling.S_dc_recommended;
        if (typeof elec.cabling.S_ac_recommended === 'number') window.inverterEquipmentState.S_ac_recommended = elec.cabling.S_ac_recommended;
        if (typeof elec.cabling.dV_dc_pct === 'number') window.inverterEquipmentState.dV_dc_pct = elec.cabling.dV_dc_pct;
        if (typeof elec.cabling.dV_ac_pct === 'number') window.inverterEquipmentState.dV_ac_pct = elec.cabling.dV_ac_pct;
      }
      if (elec.routingStrategy && window.inverterEquipmentState) {
        window.inverterEquipmentState.routingStrategy = elec.routingStrategy;
      }
      if (elec.routes && typeof Cesium !== 'undefined') {
        window.inverterEquipmentState.routes = {
          dc: Array.isArray(elec.routes.dc) ? elec.routes.dc.map(p => new Cesium.Cartesian3(p.x, p.y, p.z)) : [],
          ac: Array.isArray(elec.routes.ac) ? elec.routes.ac.map(p => new Cesium.Cartesian3(p.x, p.y, p.z)) : []
        };
      }
      if (typeof wpCalculateAndRenderInverterCables === 'function') {
        try { wpCalculateAndRenderInverterCables(); } catch(eCbl) { console.warn('[RA Storage] Error en wpCalculateAndRenderInverterCables:', eCbl); }
      }
      if (window.RACableEngine && typeof window.RACableEngine.renderAllCables === 'function') {
        try { window.RACableEngine.renderAllCables(); } catch(eCbl) { console.warn('[RA Storage] Error en RACableEngine.renderAllCables:', eCbl); }
      }
      if (typeof wpUpdateCableRoutesUI === 'function') {
        try { wpUpdateCableRoutesUI(); } catch(eUi) {}
      }
      if (typeof populateStep3EquipmentSelectors === 'function') {
        try { populateStep3EquipmentSelectors(); } catch(eEq) {}
      }
    }

    // [AUDIT-SAVE] Restaurar selecciones de catálogo / auto-dimensionado / límites AL FINAL:
    // el pipeline anterior (generación de layout, auto-sizing de equipo, populate de
    // selectores) sobrescribía selectedInverterId/selectedModuleId con defaults del
    // catálogo si se restauraban antes → el proyecto cargado "no respondía" con el
    // equipo que el usuario había elegido.
    if (projectData.projectConfig && typeof window !== 'undefined') {
      if (!window.solarProjectConfig) window.solarProjectConfig = {};
      Object.assign(window.solarProjectConfig, projectData.projectConfig);
      window.solarProjectConfig.mpptManualConfig = projectData.projectConfig.mpptManualConfig
        ? JSON.parse(JSON.stringify(projectData.projectConfig.mpptManualConfig))
        : null;
      // [LOCK-HARDWARE] Bloquear explícitamente sobreescrituras automáticas para proyectos importados
      window.solarProjectConfig.userManuallySelectedInverter = true;
      if (typeof window.wpSyncProtectionOptionsUI === 'function') {
        try { window.wpSyncProtectionOptionsUI(); } catch (_) {}
      }
      if (projectData.projectConfig.selectedBatteryId) {
        window.solarProjectConfig.userManuallySelectedBattery = true;
      }
      if (projectData.projectConfig.taxSettings && typeof document !== 'undefined') {
        const t = projectData.projectConfig.taxSettings;
        const setVal = function(id, val) {
          const el1 = document.getElementById(id);
          if (el1 && val != null) el1.value = String(val);
          const el2 = document.getElementById('modal-' + id);
          if (el2 && val != null) el2.value = String(val);
        };
        const pEl = document.getElementById('modal-tax-profile-opt') || document.getElementById('tax-profile-opt');
        if (pEl && t.profile) pEl.value = t.profile;
        const soilEl = document.getElementById('modal-tax-soil-type') || document.getElementById('tax-soil-type');
        if (soilEl && t.soilType) soilEl.value = t.soilType;
        const ivaEl = document.getElementById('modal-tax-iva-opt');
        if (ivaEl) {
          if (t.ivaOpt) ivaEl.value = String(t.ivaOpt);
          else if (t.ivaRate != null) ivaEl.value = String(t.ivaRate);
        }
        const ivaHomeAgeEl = document.getElementById('modal-tax-iva-home-age');
        if (ivaHomeAgeEl && typeof t.ivaHomeAge2Years === 'boolean') ivaHomeAgeEl.checked = t.ivaHomeAge2Years;
        const ivaMarginLaborEl = document.getElementById('modal-tax-iva-margin-labor');
        if (ivaMarginLaborEl && typeof t.ivaMarginLaborOnly === 'boolean') ivaMarginLaborEl.checked = t.ivaMarginLaborOnly;
        setVal('tax-ibi-cuota', t.ibiCuota);
        setVal('tax-ibi-opt', t.ibiOpt);
        setVal('tax-irpf-opt', t.irpfOpt);
        setVal('tax-is-opt', t.isRate);
        setVal('tax-icio-opt', t.icioOpt);
        setVal('tax-region-opt', t.regionOpt);
        setVal('tax-cae-eur', t.caeEur);

        if (typeof syncModalTaxProfile === 'function') {
          syncModalTaxProfile(pEl ? pEl.value : 'particular');
        }
      }
      if (typeof window.populateStep3EquipmentSelectors === 'function') {
        try { window.populateStep3EquipmentSelectors(); } catch(eEq2) {}
      }
      // [AUDIT v2.6] Sincronizar topología visual de arquitectura (inversor central / microinversores / optimizadores)
      if (projectData.projectConfig.selectedTopology && typeof window.step3SetTopology === 'function') {
        try { window.step3SetTopology(projectData.projectConfig.selectedTopology); } catch(eTopo) {}
      }
      // [AUDIT v2.6] Forzar actualización de selecciones hardware, sincronización de costes de presupuesto y modelo 3D de batería
      if (typeof window.step3UpdateHardwareSelection === 'function') {
        try { window.step3UpdateHardwareSelection(); } catch(eHw) {}
      }
      if (typeof window.wpRenderBattery3D === 'function') {
        try { window.wpRenderBattery3D(); } catch(eBat3d) {}
      }
      if (typeof BOMTreeEngine !== 'undefined' && typeof BOMTreeEngine.refresh === 'function') {
        try { BOMTreeEngine.refresh(); } catch(eBom) {}
      }
      if (typeof wpFastRenderSimulatedPanels === 'function') {
        try { wpFastRenderSimulatedPanels(); } catch(ePanels) {}
      }
      if (typeof window !== 'undefined' && window.WorkflowOrchestrator && typeof window.WorkflowOrchestrator.refreshGating === 'function') {
        try { window.WorkflowOrchestrator.refreshGating(); } catch(eGating) {}
      }
    }

    // Restaurar estado de simulación solar y hora/mes
    if (projectData.solarSimState && typeof solarSimState !== 'undefined') {
      if (typeof projectData.solarSimState.monthIdx === 'number') solarSimState.monthIdx = projectData.solarSimState.monthIdx;
      if (typeof projectData.solarSimState.hour === 'number') solarSimState.hour = projectData.solarSimState.hour;
      // [A2 FIX] Restaurar hourFloat si está guardado o calcular desde hour
      if (typeof projectData.solarSimState.hourFloat === 'number') {
        solarSimState.hourFloat = projectData.solarSimState.hourFloat;
      } else if (typeof projectData.solarSimState.hour === 'number') {
        solarSimState.hourFloat = projectData.solarSimState.hour;
      }
      if (projectData.solarSimState.viewMode) solarSimState.viewMode = projectData.solarSimState.viewMode;
      if (typeof updateSolarTimeUI === 'function') updateSolarTimeUI();
      if (typeof updateSolarPosition === 'function') updateSolarPosition();
    }

    // [AUDIT v2.5] Restaurar inversor virtual y configuracion de perdidas solares
    if (projectData.lastVirtualInverter && typeof window !== 'undefined') {
      window.lastVirtualInverter = JSON.parse(JSON.stringify(projectData.lastVirtualInverter));
    }
    if (projectData.solarLossConfig && typeof window !== 'undefined') {
      window.solarLossConfig = JSON.parse(JSON.stringify(projectData.solarLossConfig));
    }

    // [AUDIT v2.3] Restaurar cotas y mediciones 3D
    if (Array.isArray(projectData.measurements) && typeof window !== 'undefined' && window.RAMeasureTool && typeof window.RAMeasureTool.deserialize === 'function') {
      try { window.RAMeasureTool.deserialize(projectData.measurements); } catch (eMeas) { console.warn('[RA Storage] Error restaurando mediciones:', eMeas); }
    }

    // [AUDIT v2.5] Restaurar auditoría, factura analizada y datos de tarjeta Paso 3 (SSOT)
    if (typeof window !== 'undefined' && window.RA && window.RA.billAuditor) {
      try {
        const bSt = (typeof window.RA.billAuditor.getState === 'function') ? window.RA.billAuditor.getState() : null;
        if (bSt && projectData.billAudit) {
          bSt.currentBill = JSON.parse(JSON.stringify(projectData.billAudit));
          if (typeof window.RA.billAuditor.computeComparison === 'function') {
            bSt.comparison = window.RA.billAuditor.computeComparison(bSt.currentBill);
          }
        }
      } catch (eBill) { console.warn('[RA Storage] Error restaurando factura:', eBill); }
    }

    if (projectData.step3BillData && typeof document !== 'undefined') {
      try {
        const bd = projectData.step3BillData;
        const setVal = (id, val) => {
          const el = document.getElementById(id);
          if (el && val != null) el.value = val;
        };
        setVal('step3-bill-cost-month', bd.costMonth);
        setVal('step3-bill-kwh-year', bd.kwhYear);
        setVal('step3-bill-pot-contr', bd.potContr);
        setVal('step3-bill-price-kwh', bd.priceKwh);
        setVal('step3-bill-cups', bd.cups);
        setVal('step3-bill-titular', bd.titular);
        setVal('step3-bill-tariff', bd.tariff);

        if (!window.solarProjectConfig) window.solarProjectConfig = {};
        if (bd.kwhYear) window.solarProjectConfig.manualAnnualConsumptionKWh = bd.kwhYear;
        if (bd.costMonth) window.solarProjectConfig.billCostMonth = bd.costMonth;
        if (bd.gridSupply) window.solarProjectConfig.gridSupply = bd.gridSupply;

        if (window.RA && window.RA.billAuditor) {
          if (!window.RA.billAuditor.comparison) window.RA.billAuditor.comparison = {};
          if (bd.kwhYear) window.RA.billAuditor.comparison.consumoAnualKWh = bd.kwhYear;
          if (bd.costMonth) window.RA.billAuditor.comparison.gastoMensualActualEUR = bd.costMonth;
          if (bd.potContr) window.RA.billAuditor.comparison.potenciaContratadaP1 = bd.potContr;
          if (bd.priceKwh) window.RA.billAuditor.comparison.precioMedioKWh = bd.priceKwh;
          if (bd.cups) window.RA.billAuditor.comparison.cups = bd.cups;
          if (bd.titular) window.RA.billAuditor.comparison.titular = bd.titular;
        }

        if (typeof wpSyncStep3BillParams === 'function') {
          wpSyncStep3BillParams();
        }
        if (bd.gridSupply) {
          window.solarProjectConfig.gridSupply = bd.gridSupply;
          if (typeof wpSetGridSupply === 'function') wpSetGridSupply(bd.gridSupply, true);
        }
      } catch (eStep3Bill) { console.warn('[RA Storage] Error restaurando step3BillData:', eStep3Bill); }
    }

    // [AUDIT v2.3] Restaurar configuración y personalizaciones del Dossier Comercial
    if (projectData.commercialProposal && typeof window !== 'undefined' && window.CommercialProposalDossier && typeof window.CommercialProposalDossier.setConfig === 'function') {
      try { window.CommercialProposalDossier.setConfig(projectData.commercialProposal); } catch (eDossier) { console.warn('[RA Storage] Error restaurando dossier:', eDossier); }
    }

    // [AUDIT v2.3] Restaurar datos administrativos de cliente y titular del suministro
    if (projectData.clientDetails && typeof document !== 'undefined') {
      try {
        const _dec = (v) => (typeof v === 'string' && typeof window !== 'undefined' && window.RASanitize && typeof window.RASanitize.unescapePlain === 'function')
          ? window.RASanitize.unescapePlain(v) : v;
        const cd = {};
        Object.keys(projectData.clientDetails).forEach(k => {
          cd[k] = _dec(projectData.clientDetails[k]);
        });
        const setVal = (id, val) => {
          const el = document.getElementById(id);
          if (el && val != null) el.value = val;
        };
        setVal('doc-nombre', cd.nombre);
        setVal('doc-nif', cd.nif);
        setVal('doc-tel', cd.tel);
        setVal('doc-email', cd.email);
        setVal('doc-dir', cd.dir);
        setVal('doc-mun', cd.mun);
        setVal('doc-prov', cd.prov);
        setVal('doc-cp', cd.cp);
        setVal('doc-cups', cd.cups);
        setVal('doc-potcontr', cd.potContr);
        setVal('doc-dist', cd.dist);
        setVal('doc-modalidad', cd.modalidad);
        setVal('doc-tecnico', cd.tecnico);
        setVal('doc-titulacion', cd.titulacion);
        setVal('doc-ncol', cd.ncol);
        if (window.solarProjectConfig) {
          window.solarProjectConfig.clientInfo = JSON.parse(JSON.stringify(cd));
        }
      } catch (eClient) { console.warn('[RA Storage] Error restaurando cliente:', eClient); }
    }

    // [AUDIT v2.3] Restaurar parámetros financieros (plazo, TIN, entrada, carencia, apertura, seguro)
    if (projectData.financialSettings && typeof document !== 'undefined') {
      try {
        const fs = projectData.financialSettings;
        const setFinVal = (id, val) => {
          if (val === undefined || val === null) return;
          const el1 = document.getElementById(id);
          if (el1) el1.value = val;
          const el2 = document.getElementById('modal-' + id);
          if (el2) el2.value = val;
        };
        setFinVal('fin-mode', fs.mode);
        setFinVal('fin-entrada-eur', fs.entradaEur);
        setFinVal('fin-plazo-meses', fs.plazoMeses);
        setFinVal('fin-tin-pct', fs.tinPct);
        setFinVal('fin-apertura-pct', fs.aperturaPct);
        setFinVal('fin-carencia-meses', fs.carenciaMeses);
        setFinVal('fin-seguro-mensual', fs.seguroMensual);
        setFinVal('fin-notaria-eur', fs.notariaEur);
      } catch (eFin) {}
    }

    // [AUDIT v2.4] Restaurar precios personalizados de partidas y resumen comercial con IA
    if (projectData.pricingOverrides) {
      try {
        const po = projectData.pricingOverrides;
        if (po.pricing && typeof RAPricing !== 'undefined') {
          // Reconstruir huella fresca del proyecto si faltaba para garantizar persistencia activa
          if (!po.pricing.projectFingerprint && typeof RAPricing.getProjectFingerprint === 'function') {
            po.pricing.projectFingerprint = RAPricing.getProjectFingerprint();
          }
          RAPricing.currentSessionPricing = Object.assign({}, po.pricing, { isManualOverride: (po.pricing.isManualOverride !== false) });
          const setVal = function(id, val) {
            const el1 = document.getElementById(id);
            if (el1) el1.value = val;
            const el2 = document.getElementById('modal-' + id);
            if (el2) el2.value = val;
          };
          if (typeof po.pricing.estPrice === 'number') setVal('cfg-pres-est', po.pricing.estPrice);
          if (typeof po.pricing.invPrice === 'number') setVal('cfg-pres-inv', po.pricing.invPrice);
          if (typeof po.pricing.batPrice === 'number') setVal('cfg-pres-bat', po.pricing.batPrice);
          if (typeof po.pricing.cabPrice === 'number') setVal('cfg-pres-cab', po.pricing.cabPrice);
          if (typeof po.pricing.moPrice === 'number') setVal('cfg-pres-mo', po.pricing.moPrice);
          if (typeof po.pricing.legPrice === 'number') setVal('cfg-pres-leg', po.pricing.legPrice);
          if (typeof po.pricing.windPrice === 'number') setVal('cfg-pres-wind', po.pricing.windPrice);
          if (typeof wpUpdateStep5PricingBadge === 'function') wpUpdateStep5PricingBadge();
        }
        if (po.commercialConfig && typeof RAPricing !== 'undefined' && typeof RAPricing.saveCommercialConfig === 'function') {
          RAPricing.saveCommercialConfig(po.commercialConfig);
        }
        if (po.customCommercialSummary && typeof window.setCustomCommercialSummary === 'function') {
          window.setCustomCommercialSummary(po.customCommercialSummary);
        }
      } catch (ePricing) { console.warn('[RA Storage] Error restaurando pricingOverrides:', ePricing); }
    }

    // [AUDIT v2.4] Restaurar Estudio de Estilo y Maquetación de Propuesta
    if (projectData.proposalStyleStudio && typeof window !== 'undefined' && window.RAProposalStyleStudio && typeof window.RAProposalStyleStudio.setFullStudioState === 'function') {
      try {
        window.RAProposalStyleStudio.setFullStudioState(projectData.proposalStyleStudio);
        if (typeof window.RAProposalStyleStudio.updateStep5IndicatorUI === 'function') {
          window.RAProposalStyleStudio.updateStep5IndicatorUI();
        }
      } catch (eStudio) { console.warn('[RA Storage] Error restaurando proposalStyleStudio:', eStudio); }
    }

    // [AUDIT v2.4] Restaurar Equipos Personalizados en el Catálogo local
    if (projectData.customEquipment && typeof window !== 'undefined') {
      try {
        const ce = projectData.customEquipment;
        const cat = window.equipmentCatalog;
        let modified = false;
        if (cat) {
          ['modules', 'inverters', 'batteries', 'microinverters'].forEach(catKey => {
            if (Array.isArray(ce[catKey]) && Array.isArray(cat[catKey])) {
              ce[catKey].forEach(item => {
                if (item && item.id && !cat[catKey].some(existing => existing.id === item.id)) {
                  cat[catKey].push(item);
                  modified = true;
                }
              });
            }
          });
          if (modified && typeof window.saveEquipmentCatalog === 'function') {
            window.saveEquipmentCatalog();
          }
        }
        if (Array.isArray(ce.windTurbines) && window.RAWindCatalog && typeof window.RAWindCatalog.upsert === 'function') {
          ce.windTurbines.forEach(t => {
            if (t && t.id) window.RAWindCatalog.upsert(t);
          });
        }
      } catch (eCat) { console.warn('[RA Storage] Error restaurando customEquipment:', eCat); }
    }

    // [AUDIT v2.4] Restaurar Fotografías Reales de la Propuesta
    if (projectData.proposalPhotos) {
      try {
        if (typeof window !== 'undefined') {
          if (!window.RA) window.RA = {};
          window.RA._proposalCustomPhotos = JSON.parse(JSON.stringify(projectData.proposalPhotos));
        }
        if (typeof window !== 'undefined' && window.RAStorageCache && typeof window.RAStorageCache.cacheAssetAsync === 'function') {
          window.RAStorageCache.cacheAssetAsync('ra_proposal_custom_photos', projectData.proposalPhotos).catch(function() {});
        }
        if (typeof sessionStorage !== 'undefined') {
          try { sessionStorage.setItem('ra_proposal_custom_photos', JSON.stringify(projectData.proposalPhotos)); } catch (eQuotaSS) {}
        }
      } catch (ePhotos) { console.warn('[RA Storage] Error restaurando proposalPhotos:', ePhotos); }
    }

    // [AUDIT v2.4] Restaurar Identidad Corporativa y Logotipo de Empresa
    if (projectData.companyBranding && projectData.companyBranding.branding && typeof localStorage !== 'undefined') {
      try {
        try {
          localStorage.setItem('ra_company_branding', JSON.stringify(projectData.companyBranding.branding));
        } catch (eQuota) {
          console.warn('[RA Storage] No se pudo guardar branding en localStorage:', eQuota);
          if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
            window.showToast('Espacio local lleno: no se pudo guardar la identidad corporativa.', 'warning');
          }
        }
        if (projectData.companyBranding.logo) {
          try {
            localStorage.setItem('ra_company_logo', projectData.companyBranding.logo);
          } catch (eLogoQuota) {
            console.warn('[RA Storage] No se pudo guardar el logotipo en localStorage:', eLogoQuota);
            if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
              window.showToast('Logotipo demasiado pesado para almacenamiento local.', 'warning');
            }
          }
        }
        if (typeof window !== 'undefined' && window.RACompanyBranding) {
          if (typeof window.RACompanyBranding.loadCompanyBranding === 'function') {
            window.RACompanyBranding.loadCompanyBranding();
          }
          if (typeof window.RACompanyBranding.updateLogoPreview === 'function') {
            window.RACompanyBranding.updateLogoPreview();
          }
        }
      } catch (eBrand) { console.warn('[RA Storage] Error restaurando companyBranding:', eBrand); }
    }

    // Navegar al paso correspondiente del proyecto
    let targetStep = (projectData.metadata && typeof projectData.metadata.currentStep === 'number')
      ? projectData.metadata.currentStep
      : (typeof projectData.currentStep === 'number' ? projectData.currentStep : 2);
    if (targetStep >= 2 && (typeof WP !== 'undefined' && (!WP.polylines || WP.polylines.length === 0 || !WP.polylines.some(p => p.points && p.points.length >= 3)))) {
      targetStep = 1;
    }
    if (typeof wpCurrentStep !== 'undefined') wpCurrentStep = targetStep;
    if (typeof wpGoToStep === 'function') {
      try { await wpGoToStep(targetStep, true); } catch (eStep) { window.RA && window.RA.log && window.RA.log.debug('Paso ' + targetStep + ' activado tras importación:', eStep); }
    }

    // [AUDIT-LOCK] Re-asegurar que tras la navegación de paso no se hayan alterado los equipos importados
    if (projectData.projectConfig && window.solarProjectConfig) {
      if (projectData.projectConfig.selectedInverterId) {
        window.solarProjectConfig.selectedInverterId = projectData.projectConfig.selectedInverterId;
        const invEl = document.getElementById('step3-sel-inverter');
        if (invEl) invEl.value = projectData.projectConfig.selectedInverterId;
      }
      if (projectData.projectConfig.selectedBatteryId) {
        window.solarProjectConfig.selectedBatteryId = projectData.projectConfig.selectedBatteryId;
        const batEl = document.getElementById('step3-sel-battery');
        if (batEl) batEl.value = projectData.projectConfig.selectedBatteryId;
      }
      if (projectData.projectConfig.selectedMicroinverterId) {
        window.solarProjectConfig.selectedMicroinverterId = projectData.projectConfig.selectedMicroinverterId;
        const miEl = document.getElementById('step3-sel-microinverter');
        if (miEl) miEl.value = projectData.projectConfig.selectedMicroinverterId;
      }
      if (projectData.projectConfig.selectedTopology && typeof window.step3SetTopology === 'function') {
        try { window.step3SetTopology(projectData.projectConfig.selectedTopology); } catch(eT) {}
      }
      if (typeof window.step3UpdateHardwareSelection === 'function') {
        try { window.step3UpdateHardwareSelection(); } catch(eHw2) {}
      }
    }
    
    if (typeof ProjectHierarchy !== 'undefined' && ProjectHierarchy.notify) {
      try { ProjectHierarchy.notify('project_loaded'); } catch(eNotify) { console.warn('[RA Storage] Error en notify project_loaded:', eNotify); }
    }
    if (typeof UIOutliner !== 'undefined') {
      try {
        if (typeof UIOutliner.update === 'function') UIOutliner.update();
        else if (typeof UIOutliner.render === 'function') UIOutliner.render();
      } catch(eOutliner) {}
    }

    // [CÁMARA FINAL-LOCK] Aplicar cámara guardada al final absoluto
    // Esto garantiza que ningún re-render, selección o navegación de paso
    // pueda desorientar o desplazar la vista exacta guardada por el usuario.
    _raApplyCamera(projectData.camera);

    // [AUDIT-LOCK] Re-reforzar precios personalizados tras navegación y sincronización
    if (projectData.pricingOverrides && projectData.pricingOverrides.pricing && typeof RAPricing !== 'undefined') {
      try {
        if (!RAPricing.currentSessionPricing || RAPricing.currentSessionPricing !== projectData.pricingOverrides.pricing) {
          RAPricing.currentSessionPricing = Object.assign({}, projectData.pricingOverrides.pricing, { isManualOverride: (projectData.pricingOverrides.pricing.isManualOverride !== false) });
          if (typeof RAPricing.getProjectFingerprint === 'function') {
            RAPricing.currentSessionPricing.projectFingerprint = RAPricing.getProjectFingerprint();
          }
        }
        if (typeof wpUpdateStep5PricingBadge === 'function') wpUpdateStep5PricingBadge();
      } catch(eReBgt) {}
    }

    if (typeof wpPopulateStep3BillFromSSOT === 'function') {
      try { wpPopulateStep3BillFromSSOT(); } catch (ePop) {}
    }

    raSaveToRecentProjects(projectData);
    raCloseProjectsModal();

    if (viewer && viewer.scene && typeof viewer.scene.requestRender === 'function') {
      viewer.scene.requestRender();
    }

    // Fase 6: Carga completa
    raUpdateProjectLoadingProgress(100, '¡Proyecto cargado con éxito!', 'Sincronización completada');
    await new Promise(r => setTimeout(r, 550));
    raHideProjectLoadingHUD();

    if (typeof showToast === 'function') {
      const pName = (projectData.metadata && projectData.metadata.name) ? projectData.metadata.name : 'Proyecto';
      showToast('PROYECTO CARGADO', pName + ' cargado correctamente.', 'success', 3500);
    }

    return true;
  } catch (err) {
    raHideProjectLoadingHUD();
    console.error('Error importando proyecto:', err);
    const hadPriorGeometry = preImportSnapshot && (
      (Array.isArray(preImportSnapshot.polylines) && preImportSnapshot.polylines.length > 0) ||
      (preImportSnapshot.workPlanes && Array.isArray(preImportSnapshot.workPlanes.planes) && preImportSnapshot.workPlanes.planes.length > 0) ||
      (Array.isArray(preImportSnapshot.buildings) && preImportSnapshot.buildings.length > 0)
    );
    if (hadPriorGeometry && (!options || !options.isRollback)) {
      try {
        console.warn('[RA Storage] Error en importación. Ejecutando rollback transaccional al proyecto previo...');
        // [C3 FIX] Añadir await a la ejecución del rollback
        await raImportProjectData(preImportSnapshot, { isRollback: true });
        if (typeof showToast === 'function') {
          showToast('IMPORTACIÓN FALLIDA · RESTAURADO', 'El archivo no es válido. Se ha restaurado el proyecto anterior intacto.', 'warning', 6000);
        }
        _raImportInProgress = false;
        return false;
      } catch (eRoll) {
        console.error('[RA Storage] Error crítico durante rollback:', eRoll);
      }
    }
    _raImportInProgress = false;
    if (typeof showToast === 'function') {
      showToast('ERROR AL ABRIR', err.message || 'No se pudo leer el archivo.', 'error', 5000);
    }
    return false;
  } finally {
    if (!options || !options.isRollback) {
      _raImportInProgress = false;
    }
  }
}

// 3. Guardar en Disco (File System Access API con Fallback a Descarga)
async function raSaveProjectToFile(saveAs = false) {
  const projectData = raExportProjectData();
  const jsonStr = JSON.stringify(projectData, null, 2);
  const defaultFileName = (_raCurrentProjectName || 'Proyecto_Solar').replace(/[^a-zA-Z0-9_-]/g, '_') + '.raproject';

  // [A1 FIX] Si no se solicita "Guardar Como" y ya poseemos un handle abierto con permiso de escritura,
  // reutilizarlo directamente sin abrir diálogo modal (Ctrl+S fluido estándar)
  if (!saveAs && _raCurrentFileHandle) {
    try {
      if (typeof _raCurrentFileHandle.queryPermission === 'function') {
        let perm = await _raCurrentFileHandle.queryPermission({ mode: 'readwrite' });
        if (perm !== 'granted' && typeof _raCurrentFileHandle.requestPermission === 'function') {
          perm = await _raCurrentFileHandle.requestPermission({ mode: 'readwrite' });
        }
        if (perm === 'granted') {
          const writable = await _raCurrentFileHandle.createWritable();
          await writable.write(jsonStr);
          await writable.close();
          raSaveToRecentProjects(projectData);
          if (typeof raCloseProjectsModal === 'function') raCloseProjectsModal();
          if (typeof showToast === 'function') {
            showToast('GUARDADO', 'Proyecto actualizado en disco.', 'success', 2000);
          }
          return;
        }
      }
    } catch (eReuse) {
      console.warn('[RA Storage] Falló escritura en handle existente, solicitando selector:', eReuse);
      _raCurrentFileHandle = null;
    }
  }

  // Opción A: File System Access API nativa (Ventana modal de selección de carpeta/archivo)
  if (typeof window.showSaveFilePicker === 'function') {
    try {
      _raCurrentFileHandle = await window.showSaveFilePicker({
        suggestedName: defaultFileName,
        types: [{
          description: 'Proyecto Solar RA (*.raproject)',
          accept: { 'application/json': ['.raproject', '.json'] }
        }]
      });
      const writable = await _raCurrentFileHandle.createWritable();
      await writable.write(jsonStr);
      await writable.close();

      raSaveToRecentProjects(projectData);
      if (typeof raCloseProjectsModal === 'function') raCloseProjectsModal();
      if (typeof showToast === 'function') {
        showToast('GUARDADO CON ÉXITO', 'Proyecto guardado en la carpeta seleccionada.', 'success', 2500);
      }
      return;
    } catch (ePicker) {
      if (ePicker.name === 'AbortError') return; // Usuario canceló diálogo
      window.RA && window.RA.log && window.RA.log.debug('Fallback a descarga directa tras error en FilePicker:', ePicker);
    }
  }

  // Opción B: Fallback mediante descarga directa (Blob)
  try {
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = defaultFileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);

    raSaveToRecentProjects(projectData);
    if (typeof showToast === 'function') {
      showToast('PROYECTO DESCARGADO', 'Archivo ' + defaultFileName + ' descargado.', 'success', 2500);
    }
  } catch (eBlob) {
    console.error('Error al guardar archivo:', eBlob);
  }
}

// 4. Manejador de selección de archivo local
function raHandleFileSelect(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const fileName = file.name.replace(/\.[^/.]+$/, '');
  _raCurrentProjectName = fileName;
  raCloseProjectsModal();
  raShowProjectLoadingHUD(file.name);
  raUpdateProjectLoadingProgress(5, 'Leyendo archivo de proyecto...', file.name);

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const parsed = JSON.parse(e.target.result);
      if (!parsed.metadata) parsed.metadata = {};
      parsed.metadata.fileName = file.name;
      raImportProjectData(parsed);
    } catch (err) {
      raHideProjectLoadingHUD();
      if (typeof showToast === 'function') {
        showToast('ERROR DE ARCHIVO', 'El archivo no contiene un JSON válido.', 'error', 4000);
      }
    }
  };
  reader.onerror = function() {
    raHideProjectLoadingHUD();
    if (typeof showToast === 'function') {
      showToast('ERROR DE LECTURA', 'No se pudo leer el archivo seleccionado.', 'error', 4000);
    }
  };
  reader.readAsText(file);
  event.target.value = ''; // Reset
}

// 5. Historial de Proyectos Recientes (IndexedDB vía RAStorageCache + índice ligero en LocalStorage)
const RA_RECENT_PROJECTS_KEY = 'ra_solar_recent_projects_v2';

function raGetRecentProjects() {
  try {
    const raw = localStorage.getItem(RA_RECENT_PROJECTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

async function raSaveToRecentProjects(projectData) {
  try {
    const recents = raGetRecentProjects();
    let storageData = projectData;
    try {
      storageData = JSON.parse(JSON.stringify(projectData));
      if (storageData.simulationCache) delete storageData.simulationCache;
      if (storageData.solarSimState) delete storageData.solarSimState;
      if (storageData.annualHeatmapData) delete storageData.annualHeatmapData;
    } catch (_) { storageData = projectData; }

    const _extractProjectCoords = (pd) => {
      try {
        if (pd && pd.metadata && typeof pd.metadata.lat === 'number' && typeof pd.metadata.lon === 'number') {
          return { lat: pd.metadata.lat, lon: pd.metadata.lon };
        }
        const rawPt = (pd && Array.isArray(pd.polylines) && pd.polylines[0] && Array.isArray(pd.polylines[0].points) && pd.polylines[0].points[0])
          || (pd && pd.workingPlane && Array.isArray(pd.workingPlane.polylines) && pd.workingPlane.polylines[0] && Array.isArray(pd.workingPlane.polylines[0].points) && pd.workingPlane.polylines[0].points[0])
          || (pd && pd.camera && pd.camera.position)
          || (typeof viewer !== 'undefined' && viewer && viewer.camera && viewer.camera.positionWC)
          || null;
        if (rawPt && typeof rawPt.x === 'number' && typeof Cesium !== 'undefined' && Cesium.Cartographic) {
          const c3 = new Cesium.Cartesian3(rawPt.x, rawPt.y, rawPt.z);
          const carto = Cesium.Cartographic.fromCartesian(c3);
          if (carto) {
            return {
              lat: Number(Cesium.Math.toDegrees(carto.latitude).toFixed(4)),
              lon: Number(Cesium.Math.toDegrees(carto.longitude).toFixed(4))
            };
          }
        }
      } catch (_) {}
      return null;
    };

    const coords = _extractProjectCoords(projectData);
    const rawFileName = (_raCurrentFileHandle && _raCurrentFileHandle.name)
      || (projectData.metadata && projectData.metadata.fileName)
      || (_raCurrentProjectName && _raCurrentProjectName !== 'Proyecto_Solar' ? _raCurrentProjectName : null)
      || ((projectData.metadata && projectData.metadata.name) ? projectData.metadata.name : 'Proyecto_Solar');
    const cleanFileName = /\.raproject$/i.test(rawFileName) ? rawFileName : (rawFileName + '.raproject');

    const projId = 'proj_' + Date.now();
    const fullItem = {
      id: projId,
      name: (projectData.metadata && projectData.metadata.name) || 'Proyecto Solar',
      fileName: cleanFileName,
      address: (projectData.metadata && projectData.metadata.address) || 'Ubicación',
      lat: coords ? coords.lat : null,
      lon: coords ? coords.lon : null,
      totalKwp: (projectData.metadata && projectData.metadata.totalKwp) || 0,
      totalPanels: (projectData.metadata && projectData.metadata.totalPanels) || 0,
      timestamp: new Date().toISOString(),
      data: storageData
    };

    const evicted = recents.filter(r => r && r.address === fullItem.address && r.name === fullItem.name);
    const filtered = recents.filter(r => r.address !== fullItem.address || r.name !== fullItem.name);
    const useIdb = (typeof window !== 'undefined' && window.RAStorageCache && typeof window.RAStorageCache.saveProjectAsync === 'function');

    let idbSaved = false;
    if (useIdb) {
      try {
        idbSaved = Boolean(await window.RAStorageCache.saveProjectAsync(projId, storageData));
      } catch (_) {
        idbSaved = false;
      }
      if (typeof window.RAStorageCache.deleteProjectAsync === 'function') {
        for (let ei = 0; ei < evicted.length; ei++) {
          if (evicted[ei] && evicted[ei].id) {
            try { await window.RAStorageCache.deleteProjectAsync(evicted[ei].id); } catch (_) {}
          }
        }
      }
    }

    // Guardar en localStorage solo el índice ligero si IndexedDB almacena el payload completo (evita QuotaExceededError)
    const indexEntry = idbSaved ? Object.assign({}, fullItem, { data: null, inIndexedDB: true }) : fullItem;
    filtered.unshift(indexEntry);
    let trimmed = filtered.slice(0, 6);

    let saved = false;
    while (trimmed.length > 0 && !saved) {
      try {
        localStorage.setItem(RA_RECENT_PROJECTS_KEY, JSON.stringify(trimmed));
        saved = true;
      } catch (eQuota) {
        trimmed = trimmed.slice(0, trimmed.length - 1);
      }
    }
    if (useIdb && typeof window.RAStorageCache.purgeOrphanedProjectsAsync === 'function') {
      const validIds = trimmed.filter(r => r && r.inIndexedDB && r.id).map(r => r.id);
      try { await window.RAStorageCache.purgeOrphanedProjectsAsync(validIds); } catch (_) {}
    }
    if (!saved && !idbSaved && typeof showToast === 'function') {
      showToast('HISTORIAL NO GUARDADO', 'El diseño supera la cuota del navegador. Expórtalo a archivo .raproject para conservarlo.', 'warning', 6000);
    }
    raRenderRecentProjectsList();
  } catch(e) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(e, 'Almacenamiento local (proyectos recientes)'); }
}

function _escapeHtml(str) {
  if (typeof window !== 'undefined' && window.RASanitize && typeof window.RASanitize.plain === 'function') {
    return window.RASanitize.plain(str);
  }
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function raRenderRecentProjectsList() {
  const listEl = document.getElementById('ra-recent-projects-list');
  if (!listEl) return;

  const recents = raGetRecentProjects();
  if (recents.length === 0) {
    listEl.innerHTML = '<div style="font-size:10px;color:var(--text-slate-500);text-align:center;padding:12px 0;">No hay proyectos recientes guardados aún.</div>';
    return;
  }

  let html = '';
  recents.forEach((proj, idx) => {
    const dStr = new Date(proj.timestamp).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    const rawFile = proj.fileName || ((proj.name || 'Proyecto_Solar') + '.raproject');
    const cleanFile = _escapeHtml(/\.raproject$/i.test(rawFile) ? rawFile : (rawFile + '.raproject'));
    const rawAddr = (proj.address || '').trim();
    const isGenericAddr = !rawAddr || /^ubicaci[oó]n(\s+solar)?$/i.test(rawAddr);
    let coordsStr = '';
    if (typeof proj.lat === 'number' && typeof proj.lon === 'number' && Number.isFinite(proj.lat) && Number.isFinite(proj.lon)) {
      coordsStr = proj.lat.toFixed(4) + '°, ' + proj.lon.toFixed(4) + '°';
    }
    const locDisplay = !isGenericAddr
      ? (_escapeHtml(rawAddr) + (coordsStr ? ' · ' + coordsStr : ''))
      : (coordsStr || 'Ubicación no especificada');
    const safeKwp = Number(proj.totalKwp || 0).toFixed(2);
    const safePanels = parseInt(proj.totalPanels || 0, 10);
    html += `
      <div style="background:rgba(255,255,255,0.04);border:1px solid var(--border-subtle);border-radius:6px;padding:8px 10px;display:flex;justify-content:space-between;align-items:center;transition:all 0.15s ease;">
        <div style="display:flex;flex-direction:column;gap:2px;overflow:hidden;margin-right:8px;">
          <span style="font-size:11px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${cleanFile}</span>
          <span style="font-size: 10px;color:var(--text-slate-400);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"><i data-lucide="map-pin" class="icon-sm"></i> ${locDisplay}</span>
          <span style="font-size: 10px;color:var(--amber-400);font-family:var(--font-mono);"><i data-lucide="zap" class="icon-sm"></i> ${safeKwp} kWp (${safePanels} paneles) · ${dStr}</span>
        </div>
        <div style="display:flex;gap:4px;flex-shrink:0;">
          <button onclick="raLoadRecentProjectByIndex(${idx})" class="doc-mini-btn" style="padding:4px 8px;font-size: 10px;border-color:var(--emerald-500);color:var(--emerald-400);">Cargar</button>
          <button onclick="raDeleteRecentProjectByIndex(${idx})" style="background:none;border:none;color:var(--text-slate-500);font-size:12px;cursor:pointer;padding:2px 4px;" title="Eliminar de recientes"><i data-lucide="x" class="icon-sm"></i></button>
        </div>
      </div>
    `;
  });

  listEl.innerHTML = html;
}

async function raLoadRecentProjectByIndex(idx) {
  const recents = raGetRecentProjects();
  const entry = recents[idx];
  if (!entry) return;
  const projName = entry.name || 'Proyecto Reciente';
  let dataToImport = entry.data;
  if (!dataToImport && entry.inIndexedDB && entry.id && typeof window !== 'undefined' && window.RAStorageCache && typeof window.RAStorageCache.loadProjectAsync === 'function') {
    dataToImport = await window.RAStorageCache.loadProjectAsync(entry.id);
  }
  if (dataToImport) {
    raCloseProjectsModal();
    raShowProjectLoadingHUD(projName);
    raUpdateProjectLoadingProgress(5, 'Cargando proyecto desde almacenamiento local...', projName);
    raImportProjectData(dataToImport);
  } else {
    // Purgar entrada huérfana cuyo payload ya no existe en IndexedDB
    recents.splice(idx, 1);
    try { localStorage.setItem(RA_RECENT_PROJECTS_KEY, JSON.stringify(recents)); } catch (_) {}
    raRenderRecentProjectsList();
    if (typeof showToast === 'function') {
      showToast('PROYECTO NO ENCONTRADO', 'La copia local estaba incompleta o caducó y se limpió del historial.', 'warning', 4500);
    }
  }
}

async function raDeleteRecentProjectByIndex(idx) {
  const recents = raGetRecentProjects();
  const removed = recents[idx];
  if (removed && removed.id && typeof window !== 'undefined' && window.RAStorageCache && typeof window.RAStorageCache.deleteProjectAsync === 'function') {
    try { await window.RAStorageCache.deleteProjectAsync(removed.id); } catch (_) {}
  }
  recents.splice(idx, 1);
  try { localStorage.setItem(RA_RECENT_PROJECTS_KEY, JSON.stringify(recents)); } catch (_) {}
  raRenderRecentProjectsList();
}

async function raClearRecentProjects() {
  const ok = (typeof raConfirmAsync === 'function')
    ? await raConfirmAsync('¿Deseas vaciar el historial de proyectos recientes?', 'Vaciar historial')
    : true;
  if (ok) {
    const recents = raGetRecentProjects();
    if (typeof window !== 'undefined' && window.RAStorageCache) {
      if (typeof window.RAStorageCache.deleteProjectAsync === 'function') {
        for (let i = 0; i < recents.length; i++) {
          const r = recents[i];
          if (r && r.id) {
            try { await window.RAStorageCache.deleteProjectAsync(r.id); } catch (_) {}
          }
        }
      }
      if (typeof window.RAStorageCache.purgeOrphanedProjectsAsync === 'function') {
        try { await window.RAStorageCache.purgeOrphanedProjectsAsync([]); } catch (_) {}
      }
    }
    localStorage.removeItem(RA_RECENT_PROJECTS_KEY);
    raRenderRecentProjectsList();
  }
}

// 6. Diálogos UI de Proyectos
function raShowProjectsModal() {
  const modal = document.getElementById('ra-projects-modal');
  if (modal) {
    modal.style.display = 'flex';
    try {
      raRenderRecentProjectsList();
    } catch (eRec) {
      window.RA && window.RA.log && window.RA.log.warn('Error al renderizar proyectos recientes:', eRec);
    }
  }
}
window.raShowProjectsModal = raShowProjectsModal;

function raCloseProjectsModal() {
  const modal = document.getElementById('ra-projects-modal');
  if (modal) modal.style.display = 'none';
}
window.raCloseProjectsModal = raCloseProjectsModal;

async function raNewProjectConfirm() {
  const ok = (typeof raConfirmAsync === 'function')
    ? await raConfirmAsync('¿Deseas iniciar un nuevo proyecto desde cero? Se limpiará toda la escena 3D, equipos, faldones, simulación solar, mediciones y datos de documentos/facturas.', 'Nuevo proyecto')
    : true;
  if (!ok) {
    return;
  }

  // 1. Cancelar autosave pendiente
  if (typeof _wpAutoSaveTimer !== 'undefined' && _wpAutoSaveTimer) {
    clearTimeout(_wpAutoSaveTimer);
    _wpAutoSaveTimer = null;
  }

  var curViewer = (typeof viewer !== 'undefined' && viewer) ? viewer : (window.viewer || null);

  // 2. Limpieza completa de paneles y soportes simulados (entidades y primitivas GPU)
  if (typeof clearSimulatedPV === 'function') {
    try { clearSimulatedPV(); } catch(e) {}
  } else if (typeof window.clearSimulatedPV === 'function') {
    try { window.clearSimulatedPV(); } catch(e) {}
  }

  // 3. Limpieza de cables y canalizaciones (RACableEngine + primitivas)
  if (typeof RACableEngine !== 'undefined' && typeof RACableEngine.clearAllCables === 'function') {
    try { RACableEngine.clearAllCables(); } catch(e) {}
  }
  if (typeof wpClearInverterAndCables === 'function') {
    try { wpClearInverterAndCables(); } catch(e) {}
  }
  if (window._raCableEnginePrimitives && curViewer && curViewer.scene && curViewer.scene.primitives) {
    try { window._raCableEnginePrimitives.removeAll(); } catch(e) {}
  }
  if (window._raCableJunctionPoints && curViewer && curViewer.scene && curViewer.scene.primitives) {
    try { window._raCableJunctionPoints.removeAll(); } catch(e) {}
  }
  if (window.cableRoutingState) {
    if (Array.isArray(window.cableRoutingState.previewEntities) && curViewer && curViewer.entities) {
      window.cableRoutingState.previewEntities.forEach(function(ent) {
        try { curViewer.entities.remove(ent); } catch(e) {}
      });
    }
    window.cableRoutingState = { active: false, type: null, points: [], previewEntities: [] };
  }

  // 4. Reseteo de equipos eléctricos e inversor (para que no queden métricas residuales en el árbol ni memoria)
  if (window.inverterEquipmentState) {
    window.inverterEquipmentState = {
      position: null,
      carto: null,
      entity: null,
      label2D: null,
      dcProtectionPosition: null,
      dcProtectionCarto: null,
      dcProtectionEntity: null,
      dcProtectionLabel2D: null,
      batteryPosition: null,
      batteryCarto: null,
      batteryEntity: null,
      batteryLabel2D: null,
      dcCableEntities: [],
      routes: { dc: [], ac: [] },
      L_dc_measured: 0,
      L_ac_measured: 0,
      S_dc_recommended: 6.0,
      S_ac_recommended: 10.0,
      gridMeter: { position: null, entity: null, acCableEntity: null },
      combinerBox: { isEnabled: false, position: null, entity: null }
    };
  }
  window.selectedElectricalId = null;

  // 5. Limpieza de superposiciones del mapa de calor y sombras solares
  if (window.solarSimState) {
    var ss = window.solarSimState;
    if (Array.isArray(ss.obstacleShadowSurfaceEntities)) {
      if (curViewer && curViewer.entities) {
        ss.obstacleShadowSurfaceEntities.forEach(function(e) {
          try { curViewer.entities.remove(e); } catch(_) {}
        });
      }
      ss.obstacleShadowSurfaceEntities = [];
    }
    if (Array.isArray(ss.mlpeBadgeEntities)) {
      if (curViewer && curViewer.entities) {
        ss.mlpeBadgeEntities.forEach(function(e) {
          try { curViewer.entities.remove(e); } catch(_) {}
        });
      }
      ss.mlpeBadgeEntities = [];
    }
    if (Array.isArray(ss.heatmapLabelEntities)) {
      if (curViewer && curViewer.entities) {
        ss.heatmapLabelEntities.forEach(function(e) {
          try { curViewer.entities.remove(e); } catch(_) {}
        });
      }
      ss.heatmapLabelEntities = [];
    }
    if (window._solarHeatmapLabelCollection && curViewer && curViewer.scene && curViewer.scene.primitives) {
      try { window._solarHeatmapLabelCollection.removeAll(); } catch(_) {}
    }
    ss.annualHeatmapData = null;
    ss.annualHeatmapDirty = true;
    ss.monthlyKwh = null;
    ss.hourlyHeatmapData = null;
  }

  // 6. Limpieza de aerogeneradores
  if (window.RAWindTurbine && typeof window.RAWindTurbine.cleanAll === 'function') {
    try { window.RAWindTurbine.cleanAll(); } catch(eWt) {}
  }
  // [C1 FIX] Limpiar todas las primitivas y visualizaciones eólicas de la GPU y memoria
  if (window.RAWindVisualizer && typeof window.RAWindVisualizer.clearAll === 'function') {
    try { window.RAWindVisualizer.clearAll(); } catch(eWvc) {}
  }
  if (typeof window !== 'undefined') {
    window.windTurbines = [];
    window.windParkSummary = null;
    if (window.RAWind && window.RAWind.Resource && typeof window.RAWind.Resource.updateConfig === 'function') {
      try {
        var _defSectors = (window.RAWind.Resource.DEFAULT_SECTORS) ? JSON.parse(JSON.stringify(window.RAWind.Resource.DEFAULT_SECTORS)) : null;
        window.RAWind.Resource.updateConfig({
          sourceName: 'Manual / IDAE (Por defecto)',
          vMeanRefMs: 5.5,
          vMean50mMs: 7.2,
          refHeightM: 10.0,
          weibullK: 2.0,
          roughnessLengthM: 0.10,
          shearExponentAlpha: 0.143,
          prevailingWindDirDeg: 270,
          autoYawToWind: true,
          ambientTempC: 15.0,
          siteAltitudeM: 100.0,
          receptorDistanceM: 35.0,
          availabilityFactor: 0.97,
          electricalEfficiency: 0.95,
          sectors: _defSectors
        });
      } catch(eWrcDef) {}
    }
    if (window.RAWindUI && typeof window.RAWindUI.renderStep2Panel === 'function') {
      try { window.RAWindUI.renderStep2Panel(); } catch(eWui) {}
    }
  }

  // 7. Limpieza de paneles en memoria y faldones/polilíneas
  window.allRenderedPanels = [];
  if (typeof WP !== 'undefined') {
    // BUG FIX: Eliminar explícitamente entidades 3D de cada polilínea antes de resetear el array
    if (Array.isArray(WP.polylines) && curViewer && curViewer.entities) {
      WP.polylines.forEach(function(p) {
        if (!p) return;
        if (p.lineEnt) try { curViewer.entities.remove(p.lineEnt); } catch(_) {}
        if (p.fillEnt) try { curViewer.entities.remove(p.fillEnt); } catch(_) {}
        if (Array.isArray(p.vtxEnts)) {
          p.vtxEnts.forEach(function(v) { try { curViewer.entities.remove(v); } catch(_) {} });
        }
        if (p.badgeEnt) try { curViewer.entities.remove(p.badgeEnt); } catch(_) {}
      });
    }
    if (typeof wpClearEntGroup === 'function') {
      try { wpClearEntGroup('polys'); } catch(_) {}
      try { wpClearEntGroup('planes'); } catch(_) {}
      try { wpClearEntGroup('grid'); } catch(_) {}
      try { wpClearEntGroup('triad'); } catch(_) {}
      try { wpClearEntGroup('gizmo'); } catch(_) {}
    }
    WP.planes = [];
    WP.polylines = [];
    WP.activePlaneIdx = -1;
    WP.selectedPolyIdx = -1;
    WP.selectedVtxIdx = -1;
    if (typeof wpRenderAllPolylines === 'function') wpRenderAllPolylines();
    if (typeof wpRenderActivePlaneGizmo === 'function') wpRenderActivePlaneGizmo();
    if (typeof wpUpdateUI === 'function') wpUpdateUI();
  }

  // 8. Limpieza de obstáculos 3D
  var _arrObs = (typeof window !== 'undefined' && Array.isArray(window.obstacles)) ? window.obstacles : (typeof obstacles !== 'undefined' ? obstacles : null);
  if (Array.isArray(_arrObs)) {
    if (curViewer && curViewer.entities) {
      _arrObs.forEach(function(obs) {
        if (!obs) return;
        if (obs.entity) try { curViewer.entities.remove(obs.entity); } catch(_) {}
        if (obs.fillEntity) try { curViewer.entities.remove(obs.fillEntity); } catch(_) {}
        if (obs.outlineEntity) try { curViewer.entities.remove(obs.outlineEntity); } catch(_) {}
      });
    }
    _arrObs.length = 0;
    if (typeof render3DObstaclesInCesium === 'function') render3DObstaclesInCesium();
  }

  // 9. Limpieza de edificios 3D
  var _arrBld = (typeof window !== 'undefined' && Array.isArray(window.buildings)) ? window.buildings : (typeof buildings !== 'undefined' ? buildings : null);
  if (Array.isArray(_arrBld)) {
    if (curViewer && curViewer.entities) {
      _arrBld.forEach(function(bld) {
        if (!bld) return;
        if (bld.entity) try { curViewer.entities.remove(bld.entity); } catch(_) {}
        if (bld.roofEntity) try { curViewer.entities.remove(bld.roofEntity); } catch(_) {}
        if (bld.outlineEntity) try { curViewer.entities.remove(bld.outlineEntity); } catch(_) {}
      });
    }
    _arrBld.length = 0;
    if (typeof render3DBuildingsInCesium === 'function') render3DBuildingsInCesium();
  }

  // 10. Reseteo de selecciones, gizmos y puntos de dibujo
  window.selectedBuildingId = null;
  window.selectedObstacleId = null;
  window._universalGizmoTarget = null;
  if (typeof selectedBuildingId !== 'undefined') selectedBuildingId = null;
  if (typeof selectedObstacleId !== 'undefined') selectedObstacleId = null;
  if (Array.isArray(window.polygonPoints)) window.polygonPoints.length = 0;
  if (typeof polygonPoints !== 'undefined' && Array.isArray(polygonPoints)) polygonPoints.length = 0;
  window.isPolygonDesignConfirmed = false;
  if (typeof isPolygonDesignConfirmed !== 'undefined') isPolygonDesignConfirmed = false;
  window.roofPanelsCache = null;
  window.lastRoofInfo = null;
  if (typeof lastRoofInfo !== 'undefined') lastRoofInfo = null;

  // 11. Reseteo de Facturas y Auditor de Facturas (SSOT)
  if (window.RA && window.RA.billAuditor && typeof window.RA.billAuditor.getState === 'function') {
    try {
      var bSt = window.RA.billAuditor.getState();
      if (bSt) {
        bSt.currentBill = null;
        bSt.comparison = null;
        bSt.pendingFile = null;
        bSt.isAnalyzing = false;
      }
    } catch(eB) {}
  }

  // 12. Reseteo de Configuración del Proyecto, Equipos, Precios y Mediciones (SSOT)
  if (window.RAMeasureTool) {
    if (typeof window.RAMeasureTool.clearAll === 'function') {
      try { window.RAMeasureTool.clearAll(); } catch(_) {}
    } else if (typeof window.RAMeasureTool.clear === 'function') {
      try { window.RAMeasureTool.clear(); } catch(_) {}
    } else if (typeof window.RAMeasureTool.restore === 'function') {
      try { window.RAMeasureTool.restore([]); } catch(_) {}
    }
  }
  if (window.RAPricing) {
    window.RAPricing.currentSessionPricing = null;
    try { localStorage.removeItem('ra_pricing_session_override'); } catch(_) {}
  }
  if (window.RA) {
    window.RA._proposalCustomPhotos = null;
  }
  try { if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('ra_proposal_custom_photos'); } catch(_) {}
  if (window.RAStorageCache && typeof window.RAStorageCache.deleteCachedAssetAsync === 'function') {
    window.RAStorageCache.deleteCachedAssetAsync('ra_proposal_custom_photos').catch(function() {});
  }
  if (window.solarProjectConfig) {
    window.solarProjectConfig.clientInfo = null;
    window.solarProjectConfig.clientDetails = null;
    window.solarProjectConfig.annualConsumptionKwh = null;
    window.solarProjectConfig.manualAnnualConsumptionKWh = null;
    window.solarProjectConfig.billMonthlyConsumptionKWh = null;
    window.solarProjectConfig.billCostMonth = null;
    window.solarProjectConfig.targetKwp = 5.0;
    window.solarProjectConfig.address = '';
    window.solarProjectConfig.selectedModuleId = 'ja_550';
    window.solarProjectConfig.selectedInverterId = 'inv_huawei_5k';
    window.solarProjectConfig.selectedBatteryId = 'bat_none';
    window.solarProjectConfig.userManuallySelectedInverter = false;
    window.solarProjectConfig.userManuallySelectedBattery = false;
    window.solarProjectConfig.userManuallySelectedGridSupply = false;
    window.solarProjectConfig.gridSupply = 'three_phase';
    window.solarProjectConfig.selectedTopology = 'inverter';
    window.solarProjectConfig.autoSizing = {
      inverters: { count: 1, autoCount: 1, isManual: false },
      microinverters: { count: 0, autoCount: 0, isManual: false },
      batteries: { count: 0, autoCount: 0, isManual: false }
    };
  }
  if (typeof populateStep3EquipmentSelectors === 'function') {
    try { populateStep3EquipmentSelectors(); } catch(_) {}
  }

  // 13. Reseteo de formularios y campos de documentos y presupuesto del cliente en el DOM (Paso 5 / Titular)
  var docFieldsToClear = [
    'doc-nombre', 'doc-nif', 'doc-tel', 'doc-email',
    'doc-dir', 'doc-mun', 'doc-prov', 'doc-cp', 'doc-cups',
    'doc-potcontr', 'doc-dist', 'doc-modalidad',
    'doc-tecnico', 'doc-titulacion', 'doc-ncol',
    'pricing-cust-nombre', 'pricing-cust-nif', 'pricing-cust-tel', 'pricing-cust-email',
    'pricing-cust-dir', 'pricing-cust-mun', 'pricing-cust-prov', 'pricing-cust-cp',
    'pricing-cust-cups', 'pricing-cust-consumo', 'pricing-cust-potcontr', 'pricing-cust-precio-kwh'
  ];
  docFieldsToClear.forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });
  var prDistEl = document.getElementById('pricing-cust-dist');
  if (prDistEl && prDistEl.options && prDistEl.options.length > 0) prDistEl.selectedIndex = 0;

  // Limpiar overrides del Dossier Comercial
  if (window.CommercialProposalDossier) {
    window.CommercialProposalDossier.overrides = {};
    window.CommercialProposalDossier.renderSnapshot = null;
  }

  // 14. Reseteo de HUD de energía, dashboard y métricas
  if (typeof resetSolarDashboard === 'function') {
    try { resetSolarDashboard(); } catch(eDash) {}
  }
  var hudEnergy = document.getElementById('ra-hud-energy');
  if (hudEnergy) hudEnergy.style.display = 'none';

  // 15. Limpieza de Undo/Redo y almacenamiento local
  try { localStorage.removeItem('ra_solar_project_autosave'); } catch(e) {}
  try { localStorage.removeItem('ra_solar_project_last'); } catch(e) {}
  if (window.RAundo && typeof window.RAundo.clear === 'function') {
    window.RAundo.clear();
  }

  // 16. Actualización reactiva de árboles de proyecto (Árbol BIM y Outliner)
  if (window.ProjectHierarchy && typeof window.ProjectHierarchy.notify === 'function') {
    window.ProjectHierarchy.notify('item_deleted', { type: 'all' });
  }
  if (window.UIOutliner && typeof window.UIOutliner.render === 'function') {
    try { window.UIOutliner.render(); } catch(eOut) {}
  }
  if (window.BOMTree && typeof window.BOMTree.render === 'function') {
    try { window.BOMTree.render(); } catch(eBom) {}
  }
  if (typeof ProjectStatusHUD !== 'undefined' && ProjectStatusHUD && typeof ProjectStatusHUD.update === 'function') {
    try { ProjectStatusHUD.update(); } catch(eHud) {}
  } else if (typeof RAProjectStatusHUD !== 'undefined' && RAProjectStatusHUD && typeof RAProjectStatusHUD.update === 'function') {
    try { RAProjectStatusHUD.update(); } catch(eHud) {}
  }

  // 17. Regreso forzado al Paso 1 con gating desbloqueado
  if (typeof window.WorkflowOrchestrator !== 'undefined') {
    if (typeof window.WorkflowOrchestrator.goToStep === 'function') {
      window.WorkflowOrchestrator.goToStep(1, true);
    }
    if (typeof window.WorkflowOrchestrator.refreshGating === 'function') {
      window.WorkflowOrchestrator.refreshGating();
    }
  }
  if (typeof wpGoToStep === 'function') {
    try { wpGoToStep(1); } catch(_) {}
  }

  // 18. Refresco del motor de render Cesium
  if (curViewer && curViewer.scene && typeof curViewer.scene.requestRender === 'function') {
    try { curViewer.scene.requestRender(); } catch(eR) {}
  }

  _raCurrentFileHandle = null;
  _raCurrentProjectName = 'Nuevo_Proyecto_Solar';
  raCloseProjectsModal();

  if (typeof showToast === 'function') {
    showToast('NUEVO PROYECTO INICIADO', 'Escena 3D, cálculos, facturas y documentos reiniciados desde cero.', 'success', 3000);
  }
}

// 7. Drag & Drop Global sobre el Visor 3D y Atajos de Teclado
(function setupDragAndDrop() {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;

  window.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const overlay = document.getElementById('ra-drop-overlay');
    if (overlay) overlay.style.display = 'flex';
  });

  window.addEventListener('dragleave', (e) => {
    if (e.clientX === 0 || e.clientY === 0) {
      const overlay = document.getElementById('ra-drop-overlay');
      if (overlay) overlay.style.display = 'none';
    }
  });

  window.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const overlay = document.getElementById('ra-drop-overlay');
    if (overlay) overlay.style.display = 'none';

    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith('.raproject') || file.name.endsWith('.json')) {
        const fileName = file.name.replace(/\.[^/.]+$/, '');
        _raCurrentProjectName = fileName;
        raShowProjectLoadingHUD(file.name);
        raUpdateProjectLoadingProgress(5, 'Leyendo archivo soltado...', file.name);
        const reader = new FileReader();
        reader.onload = async (ev) => {
          try {
            const data = JSON.parse(ev.target.result);
            if (!data.metadata) data.metadata = {};
            data.metadata.fileName = file.name;
            await raImportProjectData(data);
          } catch (err) {
            raHideProjectLoadingHUD();
            if (typeof showToast === 'function') showToast('ERROR', 'Archivo JSON no válido: ' + (err.message || ''), 'error', 4000);
          }
        };
        reader.onerror = () => {
          raHideProjectLoadingHUD();
        };
        reader.readAsText(file);
      } else {
        if (typeof showToast === 'function') showToast('FORMATO NO VÁLIDO', 'Por favor arrastra un archivo .raproject o .json', 'warning', 3000);
      }
    }
  });

  // Atajos de teclado globales Ctrl+B / Ctrl+S (respetando editores rich-text contenteditable)
  window.addEventListener('keydown', (e) => {
    const active = (typeof document !== 'undefined') ? document.activeElement : null;
    const isRichEditable = Boolean(
      (e.target && (e.target.isContentEditable || (e.target.closest && e.target.closest('[contenteditable="true"]')))) ||
      (active && (active.isContentEditable || (active.closest && active.closest('[contenteditable="true"]'))))
    );
    const isInput = isRichEditable || ((typeof isTextInputActive === 'function')
      ? isTextInputActive(e.target)
      : (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')));
    if (isInput) return;
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      if (typeof toggleSidebarCollapse === 'function') toggleSidebarCollapse();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key && e.key.toLowerCase() === 's') {
      e.preventDefault();
      raSaveProjectToFile(false);
    }
  });
})();

  // ── OBJETO CANÓNICO DE PROYECTO STORAGE ──────────────────────────────────
  const RAProjectStorage = {
    exportProjectData: raExportProjectData,
    importProjectData: raImportProjectData,
    saveProjectToFile: raSaveProjectToFile,
    handleFileSelect: raHandleFileSelect,
    ensureLoadingHUDElements: raEnsureLoadingHUDElements,
    showProjectLoadingHUD: raShowProjectLoadingHUD,
    updateProjectLoadingProgress: raUpdateProjectLoadingProgress,
    hideProjectLoadingHUD: raHideProjectLoadingHUD,
    getRecentProjects: raGetRecentProjects,
    saveToRecentProjects: raSaveToRecentProjects,
    renderRecentProjectsList: raRenderRecentProjectsList,
    loadRecentProjectByIndex: raLoadRecentProjectByIndex,
    deleteRecentProjectByIndex: raDeleteRecentProjectByIndex,
    clearRecentProjects: raClearRecentProjects,
    showProjectsModal: raShowProjectsModal,
    closeProjectsModal: raCloseProjectsModal,
    newProjectConfirm: raNewProjectConfirm,
    getCurrentProjectName: function() { return _raCurrentProjectName; },
    setCurrentProjectName: function(name) { _raCurrentProjectName = name; }
  };

  global.RAProjectStorage = RAProjectStorage;
  if (!global.RA) global.RA = {};

  // Hooks requeridos en window para interacción inline y compatibilidad total
  global.raExportProjectData = raExportProjectData;
  global.raImportProjectData = raImportProjectData;
  global.raSaveProjectToFile = raSaveProjectToFile;
  global.raHandleFileSelect = raHandleFileSelect;
  global.raEnsureLoadingHUDElements = raEnsureLoadingHUDElements;
  global.raShowProjectLoadingHUD = raShowProjectLoadingHUD;
  global.raUpdateProjectLoadingProgress = raUpdateProjectLoadingProgress;
  global.raHideProjectLoadingHUD = raHideProjectLoadingHUD;
  global.raGetRecentProjects = raGetRecentProjects;
  global.raSaveToRecentProjects = raSaveToRecentProjects;
  global.raRenderRecentProjectsList = raRenderRecentProjectsList;
  global.raLoadRecentProjectByIndex = raLoadRecentProjectByIndex;
  global.raDeleteRecentProjectByIndex = raDeleteRecentProjectByIndex;
  global.raClearRecentProjects = raClearRecentProjects;
  global.raShowProjectsModal = raShowProjectsModal;
  global.raCloseProjectsModal = raCloseProjectsModal;
  global.raNewProjectConfirm = raNewProjectConfirm;

})(typeof window !== 'undefined' ? window : this);
