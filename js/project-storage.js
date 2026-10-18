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
let _raCurrentProjectName = 'Nuevo_Proyecto_Solar';
let _isImportingActive = false;
let _importGenerationId = 0;

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
    version: '2.2',
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
        battery: {
          position: s.batteryPosition ? { x: s.batteryPosition.x, y: s.batteryPosition.y, z: s.batteryPosition.z } : null,
          carto: s.batteryCarto || null,
          rotation: s.batteryRotation || 0
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
const RA_PROJECT_CURRENT_VERSION = '2.2';

/**
 * Parser de versionado semántico formal [major, minor, patch] para migraciones de esquema
 */
function _parseSemver(vStr) {
  if (typeof vStr !== 'string') vStr = String(vStr || '1.0');
  const parts = vStr.split('.').map(n => parseInt(n, 10) || 0);
  return {
    major: parts[0] || 0,
    minor: parts[1] || 0,
    patch: parts[2] || 0,
    compare(other) {
      if (this.major !== other.major) return this.major - other.major;
      if (this.minor !== other.minor) return this.minor - other.minor;
      return this.patch - other.patch;
    }
  };
}

/**
 * [C5/M9] Migración de esquema de los archivos .raproject (retrocompatibilidad al abrir).
 * Aplica valores por defecto seguros a los campos que faltan según la versión del archivo,
 * de modo que un proyecto viejo se cargue sin romper el flujo de 5 pasos.
 */
function raMigrateProjectData(projectData) {
  if (!projectData || typeof projectData !== 'object') return projectData;
  const fromVer = _parseSemver(projectData.version);
  const toVer = _parseSemver(RA_PROJECT_CURRENT_VERSION);

  // v1.x → contenedores normalizados (< 2.0.0)
  if (fromVer.compare(_parseSemver('2.0')) < 0) {
    if (!projectData.workPlanes && Array.isArray(projectData.planes)) {
      projectData.workPlanes = { planes: projectData.planes, activePlaneIdx: projectData.activePlaneIdx || 0 };
    }
    if (!Array.isArray(projectData.polylines)) projectData.polylines = [];
    if (!Array.isArray(projectData.obstacles)) projectData.obstacles = [];
    if (!Array.isArray(projectData.buildings)) projectData.buildings = [];
  }

  // v2.0 → v2.1: faldones/paneles con estructura, orientación y MLPE (< 2.1.0)
  if (fromVer.compare(_parseSemver('2.1')) < 0) {
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

  // v2.1 → v2.2: estado de simulación unificado (< 2.2.0)
  if (fromVer.compare(_parseSemver('2.2')) < 0) {
    if (!projectData.solarSimState || typeof projectData.solarSimState !== 'object') {
      projectData.solarSimState = { monthIdx: 5, hour: 12, viewMode: 'heatmap' };
    }
  }

  projectData.__migratedFrom = fromVer.compare(toVer) < 0 ? projectData.version : undefined;
  projectData.version = RA_PROJECT_CURRENT_VERSION;
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

async function raImportProjectData(projectData, options = {}) {
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
      setTimeout(function() {
        try {
          raImportProjectData(projectData, options);
        } catch(eDef) {
          if (window.RA_ErrorHandler) window.RA_ErrorHandler.handle(eDef, 'import diferido');
        }
      }, 200);
      return true;
    } else {
      delete projectData.__raImportRetryCount;
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

  const currentImportGen = ++_importGenerationId;
  _isImportingActive = true;

  const projName = (projectData && projectData.metadata && projectData.metadata.name) || _raCurrentProjectName || 'Proyecto Solar';
  raShowProjectLoadingHUD(projName);

  try {
    if (!projectData || (projectData.format !== 'RA_SOLAR_PROJECT' && !projectData.polylines && !projectData.planes)) {
      throw new Error('El archivo no tiene un formato .raproject válido');
    }

    // Fase 1: Migración y verificación de esquema
    raUpdateProjectLoadingProgress(15, 'Validando estructura del archivo .raproject...', 'Comprobando esquema y versión ' + (projectData.version || '1.0'));
    await new Promise(r => setTimeout(r, 160));
    if (_importGenerationId !== currentImportGen) return false;

    // [C5/M9] Migrar esquema de versiones antiguas antes de restaurar
    projectData = raMigrateProjectData(projectData);

    if (typeof showStatus === 'function') showStatus('RESTAURANDO PROYECTO 3D...', 3000);

    // Fase 2: Limpieza de escena previa y cámara 3D
    raUpdateProjectLoadingProgress(35, 'Limpiando escena y orientando cámara 3D...', 'Posicionando vista y frustum');
    await new Promise(r => setTimeout(r, 180));
    if (_importGenerationId !== currentImportGen) return false;

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
    if (window.RAWindTurbine && typeof window.RAWindTurbine.cleanAll === 'function') {
      try { window.RAWindTurbine.cleanAll(); } catch(eWt) {}
    }
    if ((!options || !options.preserveUndoHistory) && window.RAundo && typeof window.RAundo.clear === 'function') {
      window.RAundo.clear();
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

    // Fase 3: Restaurar Planos de Trabajo, Faldones y Obstáculos 3D
    raUpdateProjectLoadingProgress(58, 'Reconstruyendo faldones y obstáculos 3D...', 'Cargando planos CAD y geometría volumétrica');
    await new Promise(r => setTimeout(r, 180));
    if (_importGenerationId !== currentImportGen) return false;

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
              isManual: !!p.isManual,
              rot: p.rot || 0,
              panelId: p.panelId,
              hasMLPE: !!p.hasMLPE,
              isShaded: !!p.isShaded,
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

    // Fase 4: Re-renderizado de escena y módulos fotovoltaicos
    raUpdateProjectLoadingProgress(78, 'Renderizando módulos fotovoltaicos...', 'Generando layout, sombras y métricas');
    await new Promise(r => setTimeout(r, 180));

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
      }
      if (elec.battery && elec.battery.position && typeof Cesium !== 'undefined' && window.inverterEquipmentState) {
        const s = window.inverterEquipmentState;
        const batPt = new Cesium.Cartesian3(elec.battery.position.x, elec.battery.position.y, elec.battery.position.z);
        s.batteryPosition = batPt;
        if (elec.battery.carto) s.batteryCarto = elec.battery.carto;
        if (typeof elec.battery.rotation === 'number') s.batteryRotation = elec.battery.rotation;
        if (s.batteryEntity) s.batteryEntity.position = new Cesium.ConstantPositionProperty(batPt);
        if (s.batteryLabel2D) s.batteryLabel2D.position = batPt;
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
      if (typeof window !== 'undefined' && window.WorkflowOrchestrator && typeof window.WorkflowOrchestrator.refreshGating === 'function') {
        window.WorkflowOrchestrator.refreshGating();
      }
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
    if (typeof showToast === 'function') {
      showToast('ERROR AL ABRIR', err.message || 'No se pudo leer el archivo.', 'error', 5000);
    }
    return false;
  } finally {
    if (_importGenerationId === currentImportGen) {
      _isImportingActive = false;
    }
  }
}

// 3. Guardar en Disco (File System Access API con Fallback a Descarga)
async function raSaveProjectToFile(saveAs = false) {
  const projectData = raExportProjectData();
  const jsonStr = JSON.stringify(projectData, null, 2);
  const defaultFileName = (_raCurrentProjectName || 'Proyecto_Solar').replace(/[^a-zA-Z0-9_-]/g, '_') + '.raproject';

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
      if (Array.isArray(storageData.polylines)) {
        storageData.polylines.forEach(poly => {
          if (poly && poly.roofInfo && Array.isArray(poly.roofInfo.panels)) {
            poly.roofInfo.panels.forEach(p => {
              delete p.corners;
              delete p.center;
            });
          }
        });
      }
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
        // Degradar primero los proyectos más antiguos a solo-metadatos para ahorrar cuota
        let degraded = false;
        for (let i = trimmed.length - 1; i >= 1; i--) {
          if (trimmed[i].data) {
            trimmed[i].data = null;
            trimmed[i].isMetadataOnly = true;
            degraded = true;
            break;
          }
        }
        if (!degraded) {
          trimmed = trimmed.slice(0, trimmed.length - 1);
        }
      }
    }
    if (!saved && typeof showToast === 'function') {
      showToast('HISTORIAL NO GUARDADO', 'El diseño supera la cuota del navegador. Expórtalo a archivo .raproject para conservarlo.', 'warning', 6000);
    }
    raRenderRecentProjectsList();
  } catch(e) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(e, 'Almacenamiento local (proyectos recientes)'); }
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
          <span style="font-size:9.5px;color:var(--text-slate-400);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"><i data-lucide="map-pin" class="icon-sm"></i> ${proj.address}</span>
          <span style="font-size:9px;color:var(--amber-400);font-family:var(--font-mono);"><i data-lucide="zap" class="icon-sm"></i> ${proj.totalKwp} kWp (${proj.totalPanels} paneles) · ${dStr}</span>
        </div>
        <div style="display:flex;gap:4px;flex-shrink:0;">
          <button onclick="raLoadRecentProjectByIndex(${idx})" class="doc-mini-btn" style="padding:4px 8px;font-size:9.5px;border-color:var(--emerald-500);color:var(--emerald-400);">Cargar</button>
          <button onclick="raDeleteRecentProjectByIndex(${idx})" style="background:none;border:none;color:var(--text-slate-500);font-size:12px;cursor:pointer;padding:2px 4px;" title="Eliminar de recientes"><i data-lucide="x" class="icon-sm"></i></button>
        </div>
      </div>
    `;
  });

  listEl.innerHTML = html;
}

function raLoadRecentProjectByIndex(idx) {
  const recents = raGetRecentProjects();
  if (!recents[idx]) return;
  if (!recents[idx].data) {
    if (typeof showToast === 'function') {
      showToast('DATOS DEPURADOS POR CUOTA', 'Los datos completos de este proyecto se purgaron por límite de cuota del navegador. Ábrelo desde su archivo .raproject.', 'warning', 5000);
    }
    return;
  }
  const projName = recents[idx].name || 'Proyecto Reciente';
  raCloseProjectsModal();
  raShowProjectLoadingHUD(projName);
  raUpdateProjectLoadingProgress(5, 'Cargando proyecto desde almacenamiento local...', projName);
  raImportProjectData(recents[idx].data);
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
    if (typeof wpClearInverterAndCables === 'function') wpClearInverterAndCables();
    if (window.RAWindTurbine && typeof window.RAWindTurbine.cleanAll === 'function') {
      try { window.RAWindTurbine.cleanAll(); } catch(eWt) {}
    }
    if (typeof window !== 'undefined') window.allRenderedPanels = [];
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
    // Limpieza de selecciones activas y canalizaciones residuales
    if (typeof window !== 'undefined') {
      window.selectedBuildingId = null;
      window.selectedObstacleId = null;
      window._universalGizmoTarget = null;
      if (typeof selectedBuildingId !== 'undefined') selectedBuildingId = null;
      if (typeof selectedObstacleId !== 'undefined') selectedObstacleId = null;
      if (window._raCableEnginePrimitives && typeof viewer !== 'undefined' && viewer && viewer.scene) {
        try { window._raCableEnginePrimitives.removeAll(); } catch(eCb) {}
      }
      if (window.cableRoutingState) {
        if (Array.isArray(window.cableRoutingState.previewEntities) && typeof viewer !== 'undefined' && viewer && viewer.entities) {
          window.cableRoutingState.previewEntities.forEach(ent => {
            try { viewer.entities.remove(ent); } catch(eEnt) {}
          });
        }
        window.cableRoutingState = { active: false, points: [], previewEntities: [] };
      }
      if (Array.isArray(window.polygonPoints)) {
        window.polygonPoints.length = 0;
      }
      if (typeof polygonPoints !== 'undefined' && Array.isArray(polygonPoints)) {
        polygonPoints.length = 0;
      }
    }
    try { localStorage.removeItem('ra_solar_project_autosave'); } catch(e) {}
    if (window.RAundo && typeof window.RAundo.clear === 'function') {
      window.RAundo.clear();
    }
    if (typeof window !== 'undefined' && window.ProjectHierarchy && typeof window.ProjectHierarchy.notify === 'function') {
      window.ProjectHierarchy.notify('project_reset');
    }
    if (typeof window !== 'undefined' && window.WorkflowOrchestrator) {
      if (typeof window.WorkflowOrchestrator.goToStep === 'function') window.WorkflowOrchestrator.goToStep(1, true);
      if (typeof window.WorkflowOrchestrator.refreshGating === 'function') window.WorkflowOrchestrator.refreshGating();
    }
    _raCurrentFileHandle = null;
    _raCurrentProjectName = 'Nuevo_Proyecto_Solar';
    raCloseProjectsModal();
    if (typeof showToast === 'function') showToast('NUEVO PROYECTO', 'Lienzo listo para nuevo diseño.', 'info', 2500);
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
        reader.onload = (ev) => {
          try {
            const data = JSON.parse(ev.target.result);
            raImportProjectData(data);
          } catch (err) {
            raHideProjectLoadingHUD();
            if (typeof showToast === 'function') showToast('ERROR', 'Archivo JSON no válido.', 'error', 3000);
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
    setCurrentProjectName: function(name) { _raCurrentProjectName = name; },
    isImportingActive: function() { return _isImportingActive; }
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
