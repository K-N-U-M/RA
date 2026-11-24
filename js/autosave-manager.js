/**
 * RA — Gestor de Autoguardado y Restauración de Sesión (Extraído de app-main.js · F4-07)
 */
(function(window) {
  "use strict";

// ── AUTOGUARDADO Y PERSISTENCIA DE PROYECTO EN LOCALSTORAGE / INDEXEDDB ────────
let _raLastQuotaToastTs = 0;
function _raNotifyAutosaveQuotaIssue(msg) {
  const now = Date.now();
  if (now - _raLastQuotaToastTs < 15000) return;
  _raLastQuotaToastTs = now;
  if (typeof showToast === 'function') {
    showToast('CUOTA DE AUTOGUARDADO', msg || 'El proyecto supera el límite localStorage. Usa Exportar (.raproject) para asegurar tus cambios.', 'warning', 6000);
  }
}

function wpAutoSaveProject() {
  try {
    if (window._raSuspendAutosave || window._raImportInProgress) return;
    if (typeof WP === 'undefined') return;
    // [AUDIT-SAVE] FORMATO ÚNICO: el autosave usa exactamente el mismo esquema que el
    // .raproject (raExportProjectData). El formato antiguo (planos sin p1/p2/p3/pts3D,
    // sin edificios, sin deletedPanels, sin roofInfo) producía restauraciones cojas:
    // planos sin gizmo ni métricas y faldones huérfanos.
    if (typeof raExportProjectData !== 'function') return;
    const projectState = raExportProjectData();
    projectState.timestamp = Date.now();

    // Guardia anti-vaciado: al arrancar, código temprano llama wpUpdateUI con el estado
    // aún vacío y el debounce sobrescribía la sesión guardada con 0 faldones (el usuario
    // perdía el proyecto sin avisar). Nunca guardar vacío si existe autosave con contenido.
    const tieneContenido = (projectState.workPlanes && projectState.workPlanes.planes && projectState.workPlanes.planes.length > 0) ||
      (projectState.polylines && projectState.polylines.length > 0) ||
      (projectState.obstacles && projectState.obstacles.length > 0) ||
      (projectState.buildings && projectState.buildings.length > 0);
    if (!tieneContenido) {
      const prev = localStorage.getItem('ra_solar_project_autosave');
      if (prev) {
        try {
          const p = JSON.parse(prev);
          if (p.__idbAutosave ||
              (p.workPlanes && p.workPlanes.planes && p.workPlanes.planes.length) ||
              (p.planes && p.planes.length) ||
              (p.polylines && p.polylines.length) ||
              (p.obstacles && p.obstacles.length)) {
            window.RA && window.RA.log && window.RA.log.warn('[autosave] Estado vacío: se conserva la sesión previa');
            return;
          }
        } catch (e) {}
      }
    }

    const useIdb = (typeof window !== 'undefined' && window.RAStorageCache && typeof window.RAStorageCache.saveProjectAsync === 'function');
    if (useIdb) {
      window.RAStorageCache.saveProjectAsync('autosave_current', projectState).catch(function() {});
    }

    const serialized = JSON.stringify(projectState);
    try {
      if (useIdb && serialized.length > 1200000) {
        localStorage.setItem('ra_solar_project_autosave', JSON.stringify({
          __idbAutosave: true,
          uuid: projectState.uuid || null,
          timestamp: projectState.timestamp
        }));
      } else {
        localStorage.setItem('ra_solar_project_autosave', serialized);
      }
    } catch (lsErr) {
      if (useIdb) {
        try {
          localStorage.setItem('ra_solar_project_autosave', JSON.stringify({
            __idbAutosave: true,
            uuid: projectState.uuid || null,
            timestamp: projectState.timestamp
          }));
        } catch (_) {
          _raNotifyAutosaveQuotaIssue('Espacio de navegador lleno; solo se respaldó en IndexedDB.');
        }
      } else {
        _raNotifyAutosaveQuotaIssue('El navegador rechazó el autoguardado por cuota llena. Exporta el proyecto (.raproject).');
      }
    }
  } catch(err) {
    _raNotifyAutosaveQuotaIssue();
    if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(err, 'autosave');
  }
}

// Autoguardado con debounce: se invoca desde wpUpdateUI (que corre tras cada mutación
// de UI/geomtría). Evita escrituras a localStorage en cada frame.
let _wpAutoSaveTimer = null;
function wpAutoSaveProjectDebounced(delayMs) {
  if (window._raSuspendAutosave || window._raImportInProgress) return;
  if (_wpAutoSaveTimer) clearTimeout(_wpAutoSaveTimer);
  _wpAutoSaveTimer = setTimeout(() => {
    _wpAutoSaveTimer = null;
    if (window._raSuspendAutosave || window._raImportInProgress) return;
    wpAutoSaveProject();
  }, delayMs || 1500);
}
window.wpAutoSaveProjectDebounced = wpAutoSaveProjectDebounced;

// Restauración real de la sesión autoguardada: reconstruye planos, faldones y
// obstáculos y devuelve al usuario al Paso 1 para continuar desde ahí.
async function wpRestoreAutosave() {
  try {
    const raw = localStorage.getItem('ra_solar_project_autosave');
    let saved = null;
    if (raw) {
      try { saved = JSON.parse(raw); } catch (_) { saved = null; }
    }
    if ((!saved || saved.__idbAutosave) && typeof window !== 'undefined' && window.RAStorageCache && typeof window.RAStorageCache.loadProjectAsync === 'function') {
      try {
        const idbSaved = await window.RAStorageCache.loadProjectAsync('autosave_current');
        if (idbSaved) saved = idbSaved;
      } catch (_) {}
    }
    if (!saved || saved.__idbAutosave) return;

    if (typeof WP === 'undefined') return;

    // [AUDIT-SAVE] Formato nuevo (esquema .raproject unificado): delegar en el importador
    // canónico — misma ruta de restauración que abrir un archivo, sin divergencias.
    if (saved.format === 'RA_SOLAR_PROJECT' && typeof raImportProjectData === 'function') {
      await raImportProjectData(saved);
      return;
    }
    // ── Formato legacy (autosaves anteriores a 29/09/2026): ruta antigua conservada ──
    WP.planes = (saved.planes || []).map(p => ({
      origin: new Cesium.Cartesian3(p.origin.x, p.origin.y, p.origin.z),
      uVec: new Cesium.Cartesian3(p.uVec.x, p.uVec.y, p.uVec.z),
      vVec: new Cesium.Cartesian3(p.vVec.x, p.vVec.y, p.vVec.z),
      normal: new Cesium.Cartesian3(p.normal.x, p.normal.y, p.normal.z),
      name: p.name
    }));
    WP.polylines = (saved.polylines || []).map(poly => ({
      name: poly.name,
      // Vinculación al plano de trabajo: sin esto el faldón restaurado queda huérfano
      // y computeSinglePolylineRoofInfo no puede regenerar el layout (paneles=0,
      // auto-dimensionado al fallback). Se re-vincula al plano activo si falta.
      planeIdx: (typeof poly.planeIdx === 'number' && poly.planeIdx < WP.planes.length && WP.planes[poly.planeIdx]) ? poly.planeIdx : 0,
      area: poly.area || 0,
      modTilt: poly.modTilt,
      modAzimuth: poly.modAzimuth,
      orientationPref: poly.orientationPref,
      estructura: poly.estructura || null,
      closed: true,
      points: (poly.points || []).map(pt => new Cesium.Cartesian3(pt.x, pt.y, pt.z))
    }));
    WP.selectedPolyIdx = WP.polylines.length > 0 ? 0 : -1;

    if (Array.isArray(saved.obstacles) && typeof obstacles !== 'undefined') {
      saved.obstacles.forEach(o => { if (o && !obstacles.some(x => x.id === o.id)) obstacles.push(o); });
      if (typeof render3DObstaclesInCesium === 'function') render3DObstaclesInCesium();
    }
    if (saved.panelConfig) {
      Object.assign(panelConfig, saved.panelConfig);
    }
    // Equipo eléctrico colocado (gemelo digital): re-crear entidades desde posiciones
    if (saved.equipment) {
      try {
        const s = window.inverterEquipmentState = window.inverterEquipmentState || { dcCableEntities: [] };
        const toC3 = p => (p ? new Cesium.Cartesian3(p.x, p.y, p.z) : null);
        const eq = saved.equipment;
        if (eq.inverter && typeof wpPlaceInverterAtPosition === 'function') wpPlaceInverterAtPosition(toC3(eq.inverter));
        if (eq.gridMeter && typeof wpPlaceGridMeterAtPosition === 'function') wpPlaceGridMeterAtPosition(toC3(eq.gridMeter), true);
        if (eq.combinerBox && typeof wpPlaceCombinerBoxAtPosition === 'function') wpPlaceCombinerBoxAtPosition(toC3(eq.combinerBox));
        if (typeof wpCalculateAndRenderInverterCables === 'function') wpCalculateAndRenderInverterCables();
      } catch(e) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(e, 'restore equipo'); }
    }
    if (WP.polylines.length > 0) {
      const clonedPts = WP.polylines[0].points.map(p => Cesium.Cartesian3.clone(p));
      if (Array.isArray(window.polygonPoints)) {
        window.polygonPoints.length = 0;
        clonedPts.forEach(p => window.polygonPoints.push(p));
      } else {
        window.polygonPoints = clonedPts;
      }
    }

    if (typeof wpUpdateUI === 'function') wpUpdateUI();
    if (typeof wpGoToStep === 'function') wpGoToStep(1);
    showToast('SESIÓN RESTAURADA', 'Proyecto recuperado del autoguardado. Regenera el layout en el Paso 2.', 'success', 5000);
  } catch(e) {
    window.RA && window.RA.log && window.RA.log.warn('[wpRestoreAutosave]', e);
    showToast('ERROR', 'No se pudo restaurar la sesión autoguardada.', 'error', 4000);
  }
}
window.wpRestoreAutosave = wpRestoreAutosave;

function wpCheckSavedProject() {
  try {
    const raw = localStorage.getItem('ra_solar_project_autosave');
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved && ((saved.planes && saved.planes.length > 0) || (saved.polylines && saved.polylines.length > 0))) {
      const dateStr = new Date(saved.timestamp).toLocaleString();
      // Banner clicable persistente: el toast con cursor:pointer no garantizaba una
      // acción de restauración — ahora el botón invoca wpRestoreAutosave() directamente.
      const banner = document.createElement('div');
      banner.id = 'ra-restore-autosave-banner';
      banner.style.cssText = 'position:fixed;top:64px;right:16px;z-index:9999;display:flex;align-items:center;gap:10px;' +
        'padding:10px 14px;border-radius:8px;background:rgba(15,23,42,0.95);border:1px solid rgba(56,189,248,0.5);' +
        'color:#fff;font-family:Inter,sans-serif;font-size:12px;box-shadow:0 10px 25px -5px rgba(0,0,0,0.6);';
      banner.innerHTML = '<span>Sesión previa encontrada (' + dateStr + ')</span>' +
        '<button onclick="wpRestoreAutosave(); this.parentNode.remove();" style="padding:4px 10px;border-radius:6px;' +
        'border:none;background:#38bdf8;color:#0f172a;font-weight:700;cursor:pointer;font-size:11px;">RESTAURAR</button>' +
        '<button onclick="this.parentNode.remove();" style="padding:4px 8px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);' +
        'background:transparent;color:#94a3b8;cursor:pointer;font-size:11px;">✕</button>';
      document.body.appendChild(banner);
      setTimeout(() => { if (banner.parentNode) banner.remove(); }, 20000);
    }
  } catch(e) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(e, 'Entidad/Primitiva Cesium'); }
}
window.wpCheckSavedProject = wpCheckSavedProject;
// Comprobar sesión previa una vez cargado el visor (con retardo para no competir con el arranque)
setTimeout(() => { if (typeof wpCheckSavedProject === 'function') wpCheckSavedProject(); }, 4000);
})(typeof window !== "undefined" ? window : globalThis);
