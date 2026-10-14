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

// [AUDIT-SAVE] Sanitizador: elimina referencias GPU/DOM (entity, primitivas, props _*)
// del estado serializado. Antes JSON.stringify(obstacles) arrastraba el grafo completo
// del Entity de Cesium (archivos enormes y riesgo de excepción por referencias circulares).
function _raSanitizeForExport(obj, depth) {
  if (depth > 10) return null;
  if (Array.isArray(obj)) return obj.map(v => _raSanitizeForExport(v, depth + 1));
  if (obj && typeof obj === 'object') {
    if (obj instanceof Cesium.Cartesian3) return { x: obj.x, y: obj.y, z: obj.z };
    if (obj instanceof Date) return obj.toISOString();
    const out = {};
    for (const k in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
      if (k === 'entity' || k === 'entities' || k === 'primitive' || k === 'primitives' || k.charAt(0) === '_') continue;
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

  const serializedPolylines = (typeof WP !== 'undefined' && WP && Array.isArray(WP.polylines))
    ? WP.polylines.map(poly => ({
        points: Array.isArray(poly.points) ? poly.points.map(pt => ({ x: pt.x, y: pt.y, z: pt.z })) : [],
        color: poly.color,
        planeIdx: (typeof poly.planeIdx === 'number') ? poly.planeIdx : 0,
        structureType: poly.structureType || 'coplanar_teja',
        orientationPref: poly.orientationPref || 'portrait',
        modTilt: poly.modTilt || 'auto',
        modAzimuth: poly.modAzimuth || 'auto',
        deletedPanels: Array.isArray(poly.deletedPanels) ? poly.deletedPanels.map(dp => ({
          u: dp.u,
          v: dp.v,
          center: dp.center ? { x: dp.center.x, y: dp.center.y, z: dp.center.z } : null
        })) : [],
        roofInfo: poly.roofInfo ? {
          area: poly.roofInfo.area,
          tilt: poly.roofInfo.tilt,
          azimuth: poly.roofInfo.azimuth,
          panelCount: poly.roofInfo.panels ? poly.roofInfo.panels.length : 0,
          panels: poly.roofInfo.panels ? poly.roofInfo.panels.map(p => ({
            u: p.u, v: p.v, w: p.w, h: p.h,
            orientation: p.orientation,
            tiltDeg: p.tiltDeg,
            azimuthDeg: p.azimuthDeg,
            stringId: p.stringId,
            isManual: !!p.isManual,
            rot: p.rot || 0,
            panelId: p.panelId,
            hasMLPE: !!p.hasMLPE,
            isShaded: !!p.isShaded,
            center: p.center ? { x: p.center.x, y: p.center.y, z: p.center.z } : null,
            corners: Array.isArray(p.corners) ? p.corners.map(c => ({ x: c.x, y: c.y, z: c.z })) : []
          })) : []
        } : null
      }))
    : [];

  const totalPanels = (typeof simulatedPanelEntities !== 'undefined' && simulatedPanelEntities) ? simulatedPanelEntities.length : 0;

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
        panels: _lr.panels.map(p => ({
          u: p.u, v: p.v, w: p.w, h: p.h,
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
    version: '2.1',
    timestamp: new Date().toISOString(),
    metadata: {
      name: _raCurrentProjectName || 'Instalación Solar',
      address: currentAddress,
      totalPanels: totalPanels,
      totalKwp: parseFloat(totalKwp)
    },
    camera: camData,
    workPlanes: {
      planes: serializedPlanes,
      activePlaneIdx: (typeof WP !== 'undefined' && WP) ? WP.activePlaneIdx : 0
    },
    polylines: serializedPolylines,
    obstacles: (typeof obstacles !== 'undefined' && Array.isArray(obstacles)) ? _raSanitizeForExport(obstacles, 0) : [],
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
        gridMeter: {
          position: (s.gridMeter && s.gridMeter.position) ? { x: s.gridMeter.position.x, y: s.gridMeter.position.y, z: s.gridMeter.position.z } : null,
          carto: (s.gridMeter && s.gridMeter.carto) || null
        },
        combinerBox: {
          isEnabled: !!(s.combinerBox && s.combinerBox.isEnabled),
          position: (s.combinerBox && s.combinerBox.position) ? { x: s.combinerBox.position.x, y: s.combinerBox.position.y, z: s.combinerBox.position.z } : null,
          carto: (s.combinerBox && s.combinerBox.carto) || null
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
    })()
  };
}

// 2. Deserializar e Importar Proyecto Completo
function raImportProjectData(projectData) {
  // [P0.2] Carrera de arranque y espera determinista: si el visor Cesium o el subsistema WP
  // aún no existen o están inicializándose, reintentar de forma controlada hasta 25 veces (5 segundos).
  if (typeof viewer === 'undefined' || !viewer || typeof WP === 'undefined' || !WP) {
    var _retryCount = (projectData.__raImportRetryCount || 0) + 1;
    projectData.__raImportRetryCount = _retryCount;
    if (_retryCount <= 25) {
      if (typeof showStatus === 'function') {
        showStatus('ESPERANDO INICIALIZACIÓN DEL VISOR 3D (' + _retryCount + '/25)...', 1500);
      }
      setTimeout(function() {
        try {
          raImportProjectData(projectData);
        } catch(eDef) {
          if (window.RA_ErrorHandler) window.RA_ErrorHandler.handle(eDef, 'import diferido');
        }
      }, 200);
      return true;
    } else {
      delete projectData.__raImportRetryCount;
      console.error('[RA Storage] Timeout: El visor 3D o WP no se inicializaron a tiempo.');
      if (typeof showToast === 'function') {
        showToast('ERROR AL ABRIR', 'El visor 3D no respondió a tiempo. Intente de nuevo tras cargar el mapa.', 'error', 5000);
      }
      return false;
    }
  }
  delete projectData.__raImportRetryCount;
  delete projectData.__raImportDeferred;
  try {
    if (!projectData || (projectData.format !== 'RA_SOLAR_PROJECT' && !projectData.polylines && !projectData.planes)) {
      throw new Error('El archivo no tiene un formato .raproject válido');
    }

    if (typeof showStatus === 'function') showStatus('RESTAURANDO PROYECTO 3D...', 3000);

    // 1. Limpieza de estado previo segura
    if (typeof clearSimulatedPV === 'function') clearSimulatedPV();
    if (window._obsEntities && typeof viewer !== 'undefined' && viewer && viewer.entities) {
      window._obsEntities.forEach(e => {
        try { viewer.entities.remove(e); } catch(errRemove) {}
      });
      window._obsEntities = [];
    }
    if (window._bldEntities && typeof viewer !== 'undefined' && viewer && viewer.entities) {
      window._bldEntities.forEach(e => {
        try { viewer.entities.remove(e); } catch(errRemove) {}
      });
      window._bldEntities = [];
    }
    if (typeof wpClearInverterAndCables === 'function') {
      try { wpClearInverterAndCables(); } catch(eClr) {}
    }

    // 2. Restaurar Cámara
    if (projectData.camera && typeof viewer !== 'undefined' && viewer && viewer.camera) {
      try {
        const c = projectData.camera;
        viewer.camera.setView({
          destination: new Cesium.Cartesian3(c.position.x, c.position.y, c.position.z),
          orientation: {
            direction: new Cesium.Cartesian3(c.direction.x, c.direction.y, c.direction.z),
            up: new Cesium.Cartesian3(c.up.x, c.up.y, c.up.z)
          }
        });
      } catch (eCam) {
        window.RA && window.RA.log && window.RA.log.debug('Error restaurando cámara:', eCam);
      }
    }

    // 3. Restaurar Planos de Trabajo
    if (typeof WP !== 'undefined') {
      WP.planes = [];
      const inPlanes = (projectData.workPlanes && Array.isArray(projectData.workPlanes.planes))
        ? projectData.workPlanes.planes
        : (Array.isArray(projectData.planes) ? projectData.planes : []);

      inPlanes.forEach(p => {
        const pt1 = p.p1 ? new Cesium.Cartesian3(p.p1.x, p.p1.y, p.p1.z) : null;
        const pt2 = p.p2 ? new Cesium.Cartesian3(p.p2.x, p.p2.y, p.p2.z) : null;
        const pt3 = p.p3 ? new Cesium.Cartesian3(p.p3.x, p.p3.y, p.p3.z) : null;
        
        // Reconstrucción del array canónico (Opciones de retrocompatibilidad)
        const pts3D = (p.pts3D && Array.isArray(p.pts3D)) 
           ? p.pts3D.map(pt => new Cesium.Cartesian3(pt.x, pt.y, pt.z)) 
           : [pt1, pt2, pt3].filter(Boolean);

        WP.planes.push({
          id: p.id || ('wp_plane_' + Date.now()),
          name: p.name || 'Plano de Trabajo',
          p1: pt1,
          p2: pt2,
          p3: pt3,
          pts3D: pts3D,
          origin: p.origin ? new Cesium.Cartesian3(p.origin.x, p.origin.y, p.origin.z) : null,
          normal: p.normal ? new Cesium.Cartesian3(p.normal.x, p.normal.y, p.normal.z) : null,
          uVec: p.uVec ? new Cesium.Cartesian3(p.uVec.x, p.uVec.y, p.uVec.z) : null,
          vVec: p.vVec ? new Cesium.Cartesian3(p.vVec.x, p.vVec.y, p.vVec.z) : null,
          tiltDeg: p.tiltDeg,
          azimuthDeg: p.azimuthDeg,
          area: p.area
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
        const pts = Array.isArray(poly.points) ? poly.points.map(pt => new Cesium.Cartesian3(pt.x, pt.y, pt.z)) : [];
        let rInfo = null;
        if (poly.roofInfo) {
          rInfo = {
            area: poly.roofInfo.area,
            tilt: poly.roofInfo.tilt,
            azimuth: poly.roofInfo.azimuth,
            panels: Array.isArray(poly.roofInfo.panels) ? poly.roofInfo.panels.map(p => ({
              u: p.u, v: p.v, w: p.w, h: p.h,
              orientation: p.orientation,
              tiltDeg: p.tiltDeg,
              azimuthDeg: p.azimuthDeg,
              stringId: p.stringId,
              center: p.center ? new Cesium.Cartesian3(p.center.x, p.center.y, p.center.z) : null,
              corners: Array.isArray(p.corners) ? p.corners.map(c => new Cesium.Cartesian3(c.x, c.y, c.z)) : []
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
          planeIdx: (typeof poly.planeIdx === 'number') ? poly.planeIdx : (WP.activePlaneIdx || 0),
          structureType: poly.structureType || 'coplanar_teja',
          points: pts,
          area: polyArea,
          color: poly.color || '#38bdf8',
          orientationPref: poly.orientationPref || 'portrait',
          modTilt: poly.modTilt || 'auto',
          modAzimuth: poly.modAzimuth || 'auto',
          deletedPanels: Array.isArray(poly.deletedPanels) ? poly.deletedPanels.map(dp => ({
            u: dp.u,
            v: dp.v,
            center: dp.center ? new Cesium.Cartesian3(dp.center.x, dp.center.y, dp.center.z) : null
          })) : [],
          roofInfo: rInfo
        });
      });
      WP.selectedPolyIdx = WP.polylines.length > 0 ? 0 : -1;
    }

    // 5. Restaurar Obstáculos — [AUDIT-SAVE] IN-PLACE: reasignar `obstacles = ...` rompía
    // el alias del módulo (obstacles.js capturó global.obstacles al cargar) → los obstáculos
    // cargados no respondían a selección/borrado/picking. Mutar el array compartido.
    if (Array.isArray(projectData.obstacles)) {
      const _obsClean = JSON.parse(JSON.stringify(projectData.obstacles, (k, v) => (k === 'entity' || (k && k.charAt && k.charAt(0) === '_')) ? undefined : v));
      const _arrObs = (typeof window !== 'undefined' && Array.isArray(window.obstacles)) ? window.obstacles : obstacles;
      if (Array.isArray(_arrObs)) {
        _arrObs.length = 0;
        _obsClean.forEach(o => { if (o) _arrObs.push(o); });
        obstacles = _arrObs;
        if (typeof window !== 'undefined') window.obstacles = _arrObs;
      } else {
        obstacles = _obsClean;
        if (typeof window !== 'undefined') window.obstacles = _obsClean;
      }
      window.selectedObstacleId = null;
    }

    // 5.b Restaurar Edificios 3D — mismo criterio in-place (alias window.buildings)
    if (Array.isArray(projectData.buildings)) {
      const _bldClean = JSON.parse(JSON.stringify(projectData.buildings, (k, v) => (k === 'entity' || (k && k.charAt && k.charAt(0) === '_')) ? undefined : v));
      const _arrBld = (typeof window !== 'undefined' && Array.isArray(window.buildings)) ? window.buildings : buildings;
      if (Array.isArray(_arrBld)) {
        _arrBld.length = 0;
        _bldClean.forEach(b => { if (b) _arrBld.push(b); });
        buildings = _arrBld;
        if (typeof window !== 'undefined') window.buildings = _arrBld;
      } else {
        buildings = _bldClean;
        if (typeof window !== 'undefined') window.buildings = _bldClean;
      }
    }

    // 6. Restaurar Configuración de Paneles
    if (projectData.panelConfig && typeof panelConfig !== 'undefined') {
      Object.assign(panelConfig, projectData.panelConfig);
    }

    if (projectData.metadata && projectData.metadata.name) {
      _raCurrentProjectName = projectData.metadata.name;
    }

    // [AUDIT-SAVE] Las selecciones de catálogo se restauran al FINAL del import
    // (ver bloque tras el Gemelo Digital): restaurarlas antes era inútil porque el
    // pipeline de re-render y el auto-dimensionado las sobrescribían con defaults.

    // 7. Re-renderizar Todo y sincronizar con Stepper (Paso 2: Generador)
    // [AUDIT-SAVE] wpRenderPolylines NO EXISTE (typeof lo saltaba en silencio y los faldones
    // cargados quedaban sin dibujar) → wpRenderAllPolylines + gizmo del plano + métricas.
    if (typeof isPolygonDesignConfirmed !== 'undefined') isPolygonDesignConfirmed = true;
    if (typeof wpCurrentStep !== 'undefined') wpCurrentStep = 2;
    if (typeof wpRenderAllPolylines === 'function') wpRenderAllPolylines();
    if (typeof wpRenderActivePlaneGizmo === 'function') wpRenderActivePlaneGizmo();
    if (typeof render3DObstaclesInCesium === 'function') render3DObstaclesInCesium();
    if (typeof render3DBuildingsInCesium === 'function') render3DBuildingsInCesium();
    if (typeof wpFastRenderSimulatedPanels === 'function') wpFastRenderSimulatedPanels();
    if (typeof recalculateSolarYield === 'function') recalculateSolarYield();
    if (typeof wpUpdateUI === 'function') wpUpdateUI();
    if (typeof wpUpdateAllMetrics === 'function') wpUpdateAllMetrics();
    if (typeof updateBudgetUI === 'function') updateBudgetUI();
    // [AUDIT-SAVE] El heatmap no se serializa: marcarlo obsoleto para que Paso 3 y PDFs avisen
    if (typeof window.wpInvalidateHeatmap === 'function') window.wpInvalidateHeatmap('Proyecto cargado: recalcular análisis solar');
    if (typeof wpGoToStep === 'function') {
      try { wpGoToStep(2); } catch (eStep) { window.RA && window.RA.log && window.RA.log.debug('Paso 2 activado tras importación:', eStep); }
    }
    
    if (typeof ProjectHierarchy !== 'undefined' && ProjectHierarchy.notify) {
      ProjectHierarchy.notify('project_loaded');
    }

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
      }
      if (elec.gridMeter && elec.gridMeter.position && typeof Cesium !== 'undefined') {
        const meterPt = new Cesium.Cartesian3(elec.gridMeter.position.x, elec.gridMeter.position.y, elec.gridMeter.position.z);
        if (typeof wpPlaceGridMeterAtPosition === 'function') wpPlaceGridMeterAtPosition(meterPt);
      }
      if (elec.combinerBox && elec.combinerBox.isEnabled && elec.combinerBox.position && typeof Cesium !== 'undefined') {
        const cbPt = new Cesium.Cartesian3(elec.combinerBox.position.x, elec.combinerBox.position.y, elec.combinerBox.position.z);
        if (typeof wpPlaceCombinerBoxAtPosition === 'function') wpPlaceCombinerBoxAtPosition(cbPt);
      }
      if (elec.routes && typeof Cesium !== 'undefined') {
        window.inverterEquipmentState.routes = {
          dc: Array.isArray(elec.routes.dc) ? elec.routes.dc.map(p => new Cesium.Cartesian3(p.x, p.y, p.z)) : [],
          ac: Array.isArray(elec.routes.ac) ? elec.routes.ac.map(p => new Cesium.Cartesian3(p.x, p.y, p.z)) : []
        };
      }
      if (typeof wpCalculateAndRenderInverterCables === 'function') {
        wpCalculateAndRenderInverterCables();
      }
      if (typeof wpUpdateCableRoutesUI === 'function') {
        wpUpdateCableRoutesUI();
      }
      if (typeof populateStep3EquipmentSelectors === 'function') {
        populateStep3EquipmentSelectors();
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
      if (typeof window.populateStep3EquipmentSelectors === 'function') window.populateStep3EquipmentSelectors();
      // El layout se regeneró con el módulo default del catálogo (la config se restaura
      // después): re-renderizar para que los paneles usen el módulo/inversor del proyecto.
      if (typeof wpFastRenderSimulatedPanels === 'function') wpFastRenderSimulatedPanels();
    }

    raSaveToRecentProjects(projectData);
    raCloseProjectsModal();

    if (viewer && viewer.scene && typeof viewer.scene.requestRender === 'function') {
      viewer.scene.requestRender();
    }

    if (typeof showToast === 'function') {
      const pName = (projectData.metadata && projectData.metadata.name) ? projectData.metadata.name : 'Proyecto';
      showToast('PROYECTO CARGADO', pName + ' cargado correctamente.', 'success', 3500);
    }

    return true;
  } catch (err) {
    console.error('Error importando proyecto:', err);
    if (typeof showToast === 'function') {
      showToast('ERROR AL ABRIR', err.message || 'No se pudo leer el archivo.', 'error', 5000);
    }
    return false;
  }
}

// 3. Guardar en Disco (File System Access API con Fallback a Descarga)
async function raSaveProjectToFile(saveAs = false) {
  const projectData = raExportProjectData();
  const jsonStr = JSON.stringify(projectData, null, 2);
  const defaultFileName = (_raCurrentProjectName || 'Proyecto_Solar').replace(/[^a-zA-Z0-9_-]/g, '_') + '.raproject';

  // Opción A: File System Access API nativa (Guardado directo sin duplicados)
  if (typeof window.showSaveFilePicker === 'function' && (!saveAs && _raCurrentFileHandle || saveAs)) {
    try {
      if (!_raCurrentFileHandle || saveAs) {
        _raCurrentFileHandle = await window.showSaveFilePicker({
          suggestedName: defaultFileName,
          types: [{
            description: 'Proyecto Solar RA (*.raproject)',
            accept: { 'application/json': ['.raproject', '.json'] }
          }]
        });
      }
      const writable = await _raCurrentFileHandle.createWritable();
      await writable.write(jsonStr);
      await writable.close();

      raSaveToRecentProjects(projectData);
      if (typeof showToast === 'function') {
        showToast('GUARDADO CON ÉXITO', 'Proyecto guardado en tu disco local.', 'success', 2500);
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

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const parsed = JSON.parse(e.target.result);
      _raCurrentProjectName = file.name.replace(/\.[^/.]+$/, '');
      raImportProjectData(parsed);
    } catch (err) {
      if (typeof showToast === 'function') {
        showToast('ERROR DE ARCHIVO', 'El archivo no contiene un JSON válido.', 'error', 4000);
      }
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
    const item = {
      id: 'proj_' + Date.now(),
      name: (projectData.metadata && projectData.metadata.name) || 'Proyecto Solar',
      address: (projectData.metadata && projectData.metadata.address) || 'Ubicación',
      totalKwp: (projectData.metadata && projectData.metadata.totalKwp) || 0,
      totalPanels: (projectData.metadata && projectData.metadata.totalPanels) || 0,
      timestamp: new Date().toISOString(),
      data: projectData
    };

    // Evitar duplicados por dirección o nombre
    const filtered = recents.filter(r => r.address !== item.address || r.name !== item.name);
    filtered.unshift(item);
    const trimmed = filtered.slice(0, 6); // Mantener últimos 6

    localStorage.setItem(RA_RECENT_PROJECTS_KEY, JSON.stringify(trimmed));
    raRenderRecentProjectsList();
  } catch(e) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(e, 'Entidad/Primitiva Cesium'); }
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
    html += `
      <div style="background:rgba(255,255,255,0.04);border:1px solid var(--border-subtle);border-radius:6px;padding:8px 10px;display:flex;justify-content:space-between;align-items:center;transition:all 0.15s ease;">
        <div style="display:flex;flex-direction:column;gap:2px;overflow:hidden;margin-right:8px;">
          <span style="font-size:11px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${proj.name}</span>
          <span style="font-size:9.5px;color:var(--text-slate-400);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"><i data-lucide=\"map-pin\" class=\"icon-sm\"></i> ${proj.address}</span>
          <span style="font-size:9px;color:var(--amber-400);font-family:var(--font-mono);"><i data-lucide=\"zap\" class=\"icon-sm\"></i> ${proj.totalKwp} kWp (${proj.totalPanels} paneles) · ${dStr}</span>
        </div>
        <div style="display:flex;gap:4px;flex-shrink:0;">
          <button onclick="raLoadRecentProjectByIndex(${idx})" class="doc-mini-btn" style="padding:4px 8px;font-size:9.5px;border-color:var(--emerald-500);color:var(--emerald-400);">Cargar</button>
          <button onclick="raDeleteRecentProjectByIndex(${idx})" style="background:none;border:none;color:var(--text-slate-500);font-size:12px;cursor:pointer;padding:2px 4px;" title="Eliminar de recientes"><i data-lucide=\"x\" class=\"icon-sm\"></i></button>
        </div>
      </div>
    `;
  });

  listEl.innerHTML = html;
}

function raLoadRecentProjectByIndex(idx) {
  const recents = raGetRecentProjects();
  if (recents[idx] && recents[idx].data) {
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
  if (confirm('¿Deseas iniciar un nuevo proyecto? Se limpiará la geometría y paneles actuales.')) {
    // 1. Cancelar autosave pendiente para evitar que sobreescriba el nuevo proyecto
    if (typeof _wpAutoSaveTimer !== 'undefined' && _wpAutoSaveTimer) {
      clearTimeout(_wpAutoSaveTimer);
      _wpAutoSaveTimer = null;
    }
    if (typeof clearSimulatedPV === 'function') clearSimulatedPV();
    if (typeof WP !== 'undefined') {
      WP.planes = [];
      WP.polylines = [];
      WP.activePlaneIdx = -1;
      WP.selectedPolyIdx = -1;
      if (typeof wpRenderAllPolylines === 'function') wpRenderAllPolylines();
      if (typeof wpRenderActivePlaneGizmo === 'function') wpRenderActivePlaneGizmo();
    }
    // Mutación in-place para no romper la referencia compartida de obstacles
    var _arrObs = (typeof window !== 'undefined' && Array.isArray(window.obstacles)) ? window.obstacles : (typeof obstacles !== 'undefined' ? obstacles : null);
    if (Array.isArray(_arrObs)) {
      _arrObs.length = 0;
      if (typeof render3DObstaclesInCesium === 'function') render3DObstaclesInCesium();
    }
    // Mutación in-place para edificios
    var _arrBld = (typeof window !== 'undefined' && Array.isArray(window.buildings)) ? window.buildings : (typeof buildings !== 'undefined' ? buildings : null);
    if (Array.isArray(_arrBld)) {
      _arrBld.length = 0;
      if (typeof render3DBuildingsInCesium === 'function') render3DBuildingsInCesium();
    }
    try { localStorage.removeItem('ra_solar_project_autosave'); } catch(e) {}
    _raCurrentFileHandle = null;
    _raCurrentProjectName = 'Nuevo_Proyecto_Solar';
    raCloseProjectsModal();
    if (typeof showToast === 'function') showToast('NUEVO PROYECTO', 'Lienzo listo para nuevo diseño.', 'info', 2500);
  }
}

// 7. Drag & Drop Global sobre el Visor 3D
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
        const reader = new FileReader();
        reader.onload = (ev) => {
          try {
            const data = JSON.parse(ev.target.result);
            _raCurrentProjectName = file.name.replace(/\.[^/.]+$/, '');
            raImportProjectData(data);
          } catch (err) {
            if (typeof showToast === 'function') showToast('ERROR', 'Archivo JSON no válido.', 'error', 3000);
          }
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
  global.RA.projectStorage = RAProjectStorage;

  // Hooks requeridos en window para interacción inline y compatibilidad total
  global.raExportProjectData = raExportProjectData;
  global.raImportProjectData = raImportProjectData;
  global.raSaveProjectToFile = raSaveProjectToFile;
  global.raHandleFileSelect = raHandleFileSelect;
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
