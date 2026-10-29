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
          const match = renderedForPoly.find(rp => (p.panelId && rp.panelId === p.panelId) || (typeof p.layoutIndex === 'number' && (rp.layoutIndex === p.layoutIndex || rp.localIdx === p.layoutIndex))) || renderedForPoly[idx];
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
    version: '2.3',
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
      selectedTopology: window.solarProjectConfig.selectedTopology || null,
      selectedObjective: window.solarProjectConfig.selectedObjective || null,
      targetKwp: window.solarProjectConfig.targetKwp || null,
      autoSizing: window.solarProjectConfig.autoSizing || null,
      calculatedLimits: window.solarProjectConfig.calculatedLimits || null,
      inverterCapacityWarning: window.solarProjectConfig.inverterCapacityWarning || null
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
        try { return readTitular(); } catch (_) { return null; }
      }
      return null;
    })(),
    financialSettings: (() => {
      const g = (id, def) => {
        const el = document.getElementById(id);
        return el ? (parseFloat(el.value) || def) : def;
      };
      return {
        plazoMeses: g('fin-plazo-meses', 120),
        tinPct: g('fin-tin-pct', 5.95)
      };
    })(),
    pricingOverrides: (() => {
      try {
        const pricing = (typeof RAPricing !== 'undefined') ? RAPricing.getDefaults() : null;
        const commCfg = (typeof RAPricing !== 'undefined' && typeof RAPricing.getCommercialConfig === 'function')
          ? RAPricing.getCommercialConfig()
          : null;
        const customSummary = (typeof window !== 'undefined' && typeof window.getCustomCommercialSummary === 'function')
          ? window.getCustomCommercialSummary()
          : null;
        return {
          pricing: pricing ? Object.assign({}, pricing) : null,
          commercialConfig: commCfg ? JSON.parse(JSON.stringify(commCfg)) : null,
          customCommercialSummary: customSummary || null
        };
      } catch(ePr) { return null; }
    })()
  };
}

// 2. Deserializar e Importar Proyecto Completo
const RA_PROJECT_CURRENT_VERSION = '2.3';

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
  hud.style.cssText = 'display:none;position:fixed;inset:0;width:100vw;height:100vh;background:rgba(8,14,26,0.82);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);z-index:10000000;align-items:center;justify-content:center;font-family:var(--font-sans,system-ui,-apple-system,sans-serif);opacity:0;transition:opacity 0.25s ease-out;pointer-events:auto;user-select:none;';

  hud.innerHTML = `
    <div style="background:linear-gradient(145deg,rgba(15,23,42,0.96),rgba(30,41,59,0.92));border:1px solid rgba(56,189,248,0.35);border-radius:16px;box-shadow:0 25px 60px -15px rgba(0,0,0,0.7),0 0 35px rgba(56,189,248,0.18);padding:32px 36px;width:440px;max-width:90vw;display:flex;flex-direction:column;align-items:center;gap:20px;box-sizing:border-box;position:relative;overflow:hidden;">
      <div style="position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#38bdf8,#818cf8,#f59e0b);"></div>
      <div style="display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;">
        <div style="position:relative;width:52px;height:52px;display:flex;align-items:center;justify-content:center;">
          <svg viewBox="0 0 52 52" style="width:100%;height:100%;animation:raHudSpin 3s linear infinite;">
            <circle cx="26" cy="26" r="22" fill="none" stroke="rgba(56,189,248,0.18)" stroke-width="3"></circle>
            <circle cx="26" cy="26" r="22" fill="none" stroke="#38bdf8" stroke-width="3" stroke-dasharray="35 110" stroke-linecap="round"></circle>
          </svg>
          <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#38bdf8;">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
            </svg>
          </div>
        </div>
        <div>
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#38bdf8;">CARGANDO PROYECTO SOLAR</div>
          <div id="ra-load-hud-title" style="font-size:15px;font-weight:700;color:#f8fafc;margin-top:2px;max-width:360px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Cargando...</div>
        </div>
      </div>
      <div style="display:flex;align-items:baseline;gap:4px;">
        <span id="ra-load-hud-pct" style="font-size:44px;font-weight:800;font-family:var(--font-mono,monospace);color:#38bdf8;text-shadow:0 0 20px rgba(56,189,248,0.45);line-height:1;">0</span>
        <span style="font-size:22px;font-weight:700;color:rgba(56,189,248,0.7);font-family:var(--font-mono,monospace);">%</span>
      </div>
      <div style="width:100%;display:flex;flex-direction:column;gap:8px;">
        <div style="width:100%;height:8px;background:rgba(255,255,255,0.06);border-radius:999px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);box-shadow:inset 0 1px 3px rgba(0,0,0,0.5);">
          <div id="ra-load-hud-bar" style="width:0%;height:100%;background:linear-gradient(90deg,#0284c7,#38bdf8,#818cf8);border-radius:999px;transition:width 0.12s ease-out;box-shadow:0 0 12px rgba(56,189,248,0.75);"></div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;width:100%;">
          <span id="ra-load-hud-status" style="font-size:12px;font-weight:600;color:#e2e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:280px;">Iniciando carga...</span>
          <span id="ra-load-hud-detail" style="font-size:10.5px;color:#94a3b8;font-family:var(--font-mono,monospace);flex-shrink:0;">Fase 1/6</span>
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
    }
    if ((!options || !options.preserveUndoHistory) && window.RAundo && typeof window.RAundo.clear === 'function') {
      window.RAundo.clear();
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
    if (typeof updateBudgetUI === 'function') updateBudgetUI();
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
      if (elec.inverter && elec.inverter.position && typeof Cesium !== 'undefined') {
        const invPt = new Cesium.Cartesian3(elec.inverter.position.x, elec.inverter.position.y, elec.inverter.position.z);
        if (typeof wpPlaceInverterAtPosition === 'function') wpPlaceInverterAtPosition(invPt);
        if (typeof elec.inverter.rotation === 'number' && window.inverterEquipmentState) {
          window.inverterEquipmentState.rotation = elec.inverter.rotation;
        }
      }
      if (elec.dcProtection && elec.dcProtection.position && typeof Cesium !== 'undefined' && window.inverterEquipmentState) {
        const s = window.inverterEquipmentState;
        const dcPt = new Cesium.Cartesian3(elec.dcProtection.position.x, elec.dcProtection.position.y, elec.dcProtection.position.z);
        s.dcProtectionPosition = dcPt;
        if (elec.dcProtection.carto) s.dcProtectionCarto = elec.dcProtection.carto;
        if (typeof elec.dcProtection.rotation === 'number') s.dcProtectionRotation = elec.dcProtection.rotation;
        if (s.dcProtectionEntity) s.dcProtectionEntity.position = new Cesium.ConstantPositionProperty(dcPt);
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
      }
      if (elec.gridMeter && elec.gridMeter.position && typeof Cesium !== 'undefined') {
        const meterPt = new Cesium.Cartesian3(elec.gridMeter.position.x, elec.gridMeter.position.y, elec.gridMeter.position.z);
        if (typeof wpPlaceGridMeterAtPosition === 'function') wpPlaceGridMeterAtPosition(meterPt);
        if (typeof elec.gridMeter.rotation === 'number' && window.inverterEquipmentState && window.inverterEquipmentState.gridMeter) {
          window.inverterEquipmentState.gridMeter.rotation = elec.gridMeter.rotation;
        }
      }
      if (elec.combinerBox && elec.combinerBox.isEnabled && elec.combinerBox.position && typeof Cesium !== 'undefined') {
        const cbPt = new Cesium.Cartesian3(elec.combinerBox.position.x, elec.combinerBox.position.y, elec.combinerBox.position.z);
        if (typeof wpPlaceCombinerBoxAtPosition === 'function') wpPlaceCombinerBoxAtPosition(cbPt);
        if (typeof elec.combinerBox.rotation === 'number' && window.inverterEquipmentState && window.inverterEquipmentState.combinerBox) {
          window.inverterEquipmentState.combinerBox.rotation = elec.combinerBox.rotation;
        }
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
      if (typeof window.populateStep3EquipmentSelectors === 'function') {
        try { window.populateStep3EquipmentSelectors(); } catch(eEq2) {}
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

    // [AUDIT v2.3] Restaurar cotas y mediciones 3D
    if (Array.isArray(projectData.measurements) && typeof window !== 'undefined' && window.RAMeasureTool && typeof window.RAMeasureTool.deserialize === 'function') {
      try { window.RAMeasureTool.deserialize(projectData.measurements); } catch (eMeas) { console.warn('[RA Storage] Error restaurando mediciones:', eMeas); }
    }

    // [AUDIT v2.3] Restaurar auditoría y factura analizada (SSOT)
    if (projectData.billAudit && typeof window !== 'undefined' && window.RA && window.RA.billAuditor) {
      try {
        const bSt = (typeof window.RA.billAuditor.getState === 'function') ? window.RA.billAuditor.getState() : null;
        if (bSt) {
          bSt.currentBill = JSON.parse(JSON.stringify(projectData.billAudit));
          if (typeof window.RA.billAuditor.syncWithProjectCalcs === 'function') {
            window.RA.billAuditor.syncWithProjectCalcs();
          }
        }
      } catch (eBill) { console.warn('[RA Storage] Error restaurando factura:', eBill); }
    }

    // [AUDIT v2.3] Restaurar configuración y personalizaciones del Dossier Comercial
    if (projectData.commercialProposal && typeof window !== 'undefined' && window.CommercialProposalDossier && typeof window.CommercialProposalDossier.setConfig === 'function') {
      try { window.CommercialProposalDossier.setConfig(projectData.commercialProposal); } catch (eDossier) { console.warn('[RA Storage] Error restaurando dossier:', eDossier); }
    }

    // [AUDIT v2.3] Restaurar datos administrativos de cliente y titular del suministro
    if (projectData.clientDetails && typeof document !== 'undefined') {
      try {
        const cd = projectData.clientDetails;
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

    // [AUDIT v2.3] Restaurar parámetros financieros (plazo, TIN)
    if (projectData.financialSettings && typeof document !== 'undefined') {
      try {
        const fs = projectData.financialSettings;
        const elPlazo = document.getElementById('fin-plazo-meses');
        if (elPlazo && typeof fs.plazoMeses === 'number') elPlazo.value = fs.plazoMeses;
        const elTin = document.getElementById('fin-tin-pct');
        if (elTin && typeof fs.tinPct === 'number') elTin.value = fs.tinPct;
      } catch (eFin) {}
    }

    // [AUDIT v2.4] Restaurar precios personalizados de partidas y resumen comercial con IA
    if (projectData.pricingOverrides) {
      try {
        const po = projectData.pricingOverrides;
        if (po.pricing && typeof RAPricing !== 'undefined') {
          RAPricing.currentSessionPricing = Object.assign({}, po.pricing);
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
          if (typeof updateBudgetUI === 'function') updateBudgetUI();
        }
        if (po.commercialConfig && typeof RAPricing !== 'undefined' && typeof RAPricing.saveCommercialConfig === 'function') {
          RAPricing.saveCommercialConfig(po.commercialConfig);
        }
        if (po.customCommercialSummary && typeof window.setCustomCommercialSummary === 'function') {
          window.setCustomCommercialSummary(po.customCommercialSummary);
        }
      } catch (ePricing) { console.warn('[RA Storage] Error restaurando pricingOverrides:', ePricing); }
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

// 5. Historial de Proyectos Recientes (LocalStorage)
const RA_RECENT_PROJECTS_KEY = 'ra_solar_recent_projects_v2';

function raGetRecentProjects() {
  try {
    const raw = localStorage.getItem(RA_RECENT_PROJECTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function raSaveToRecentProjects(projectData) {
  try {
    const recents = raGetRecentProjects();
    // Sanitizar datos del proyecto para almacenamiento local: omitir cachés pesadas que se recalculan en vivo
    let storageData = projectData;
    try {
      storageData = JSON.parse(JSON.stringify(projectData));
      if (storageData.simulationCache) delete storageData.simulationCache;
      if (storageData.solarSimState) delete storageData.solarSimState;
      if (storageData.annualHeatmapData) delete storageData.annualHeatmapData;
    } catch (_) { storageData = projectData; }

    const item = {
      id: 'proj_' + Date.now(),
      name: (projectData.metadata && projectData.metadata.name) || 'Proyecto Solar',
      address: (projectData.metadata && projectData.metadata.address) || 'Ubicación',
      totalKwp: (projectData.metadata && projectData.metadata.totalKwp) || 0,
      totalPanels: (projectData.metadata && projectData.metadata.totalPanels) || 0,
      timestamp: new Date().toISOString(),
      data: storageData
    };

    // Evitar duplicados por dirección o nombre
    const filtered = recents.filter(r => r.address !== item.address || r.name !== item.name);
    filtered.unshift(item);
    let trimmed = filtered.slice(0, 4); // Mantener últimos 4 proyectos optimizados

    // [m2] Cuota de localStorage: con diseños grandes puede fallar en silencio.
    // Recortar el historial de recientes y avisar al usuario si el diseño no cabe.
    let saved = false;
    while (trimmed.length > 0 && !saved) {
      try {
        localStorage.setItem(RA_RECENT_PROJECTS_KEY, JSON.stringify(trimmed));
        saved = true;
      } catch (eQuota) {
        trimmed = trimmed.slice(0, trimmed.length - 1);
      }
    }
    if (!saved && typeof showToast === 'function') {
      showToast('HISTORIAL NO GUARDADO', 'El diseño supera la cuota del navegador. Expórtalo a archivo .raproject para conservarlo.', 'warning', 6000);
    }
    raRenderRecentProjectsList();
  } catch(e) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(e, 'Almacenamiento local (proyectos recientes)'); }
}

function _escapeHtml(str) {
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
    const cleanName = _escapeHtml(proj.name || 'Proyecto sin nombre');
    const cleanAddr = _escapeHtml(proj.address || 'Ubicación no especificada');
    const safeKwp = Number(proj.totalKwp || 0).toFixed(2);
    const safePanels = parseInt(proj.totalPanels || 0, 10);
    html += `
      <div style="background:rgba(255,255,255,0.04);border:1px solid var(--border-subtle);border-radius:6px;padding:8px 10px;display:flex;justify-content:space-between;align-items:center;transition:all 0.15s ease;">
        <div style="display:flex;flex-direction:column;gap:2px;overflow:hidden;margin-right:8px;">
          <span style="font-size:11px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${cleanName}</span>
          <span style="font-size: 10px;color:var(--text-slate-400);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"><i data-lucide="map-pin" class="icon-sm"></i> ${cleanAddr}</span>
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

function raLoadRecentProjectByIndex(idx) {
  const recents = raGetRecentProjects();
  if (recents[idx] && recents[idx].data) {
    const projName = recents[idx].name || 'Proyecto Reciente';
    raCloseProjectsModal();
    raShowProjectLoadingHUD(projName);
    raUpdateProjectLoadingProgress(5, 'Cargando proyecto desde almacenamiento local...', projName);
    raImportProjectData(recents[idx].data);
  }
}

function raDeleteRecentProjectByIndex(idx) {
  const recents = raGetRecentProjects();
  recents.splice(idx, 1);
  localStorage.setItem(RA_RECENT_PROJECTS_KEY, JSON.stringify(recents));
  raRenderRecentProjectsList();
}

function raClearRecentProjects() {
  if (confirm('¿Deseas vaciar el historial de proyectos recientes?')) {
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

function raNewProjectConfirm() {
  if (!confirm('¿Deseas iniciar un nuevo proyecto desde cero? Se limpiará toda la escena 3D, equipos, faldones, simulación solar, mediciones y datos de documentos/facturas.')) {
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

  // 5. Limpieza de superposiciones del mapa de calor y sombras solares (panelShadowOverlayPool, etc.)
  if (window.solarSimState) {
    var ss = window.solarSimState;
    if (ss.panelShadowOverlayPool) {
      if (curViewer && curViewer.entities) {
        ss.panelShadowOverlayPool.forEach(function(ent) {
          try { curViewer.entities.remove(ent); } catch(_) {}
        });
      }
      ss.panelShadowOverlayPool.clear();
    }
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

  // 12. Reseteo de Configuración del Proyecto y Datos del Cliente (SSOT)
  if (window.solarProjectConfig) {
    window.solarProjectConfig.clientInfo = null;
    window.solarProjectConfig.annualConsumptionKwh = null;
    window.solarProjectConfig.targetKwp = 5.0;
    window.solarProjectConfig.address = '';
  }

  // 13. Reseteo de formularios y campos de documentos en el DOM (Paso 5 / Titular)
  var docFieldsToClear = [
    'doc-nombre', 'doc-nif', 'doc-tel', 'doc-email',
    'doc-dir', 'doc-mun', 'doc-prov', 'doc-cp', 'doc-cups',
    'doc-potcontr', 'doc-dist'
  ];
  docFieldsToClear.forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });

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

  // Atajo de teclado global Ctrl+S / Cmd+S
  window.addEventListener('keydown', (e) => {
    const isInput = (typeof isTextInputActive === 'function')
      ? isTextInputActive(e.target)
      : (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable));
    if (isInput) return;
    if ((e.ctrlKey || e.metaKey) && e.key && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      if (typeof toggleSidebarCollapse === 'function') toggleSidebarCollapse();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key && e.key.toLowerCase() === 's') {
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
