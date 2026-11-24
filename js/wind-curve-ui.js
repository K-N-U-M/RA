/**
 * RA — Controlador UI de Curvas y Área de Aerogeneradores (Extraído de app-main.js · F4-07)
 */
(function(window) {
  "use strict";

// [F3-09] Helpers parametrizados para curvas y área de aerogeneradores (Edit / New)
function _autoCalibrateWindCurve(prefix) {
  const kw = Math.max(0.1, parseFloat(document.getElementById(prefix + '-wt-kw').value) || 10.0);
  const diam = Math.max(0.5, parseFloat(document.getElementById(prefix + '-wt-diameter').value) || 5.0);
  const type = document.getElementById(prefix + '-wt-type').value || 'HAWT';
  const bladeH = parseFloat(document.getElementById(prefix + '-wt-blade-height').value) || (type === 'VAWT' ? diam * 1.4 : diam / 2);
  const cutin = parseFloat(document.getElementById(prefix + '-wt-cutin').value) || 2.5;
  const rated = parseFloat(document.getElementById(prefix + '-wt-ratedspeed').value) || 11.0;
  const cutout = parseFloat(document.getElementById(prefix + '-wt-cutout').value) || 25.0;
  const mock = {
    ratedPowerW: Math.round(kw * 1000), rotorDiameterM: diam, bladeHeightM: bladeH, bladeLength: bladeH,
    type: type, cutInSpeedMs: cutin, ratedSpeedMs: rated, cutOutSpeedMs: cutout, powerCurve: []
  };
  if (window.RAWindCatalog && typeof window.RAWindCatalog.calibratePowerCurveToBetz === 'function') {
    window.RAWindCatalog.calibratePowerCurveToBetz(mock, type === 'VAWT' ? 0.35 : 0.42);
    const txtArea = document.getElementById(prefix + '-wt-curve-text');
    if (txtArea && typeof window.RAWindCatalog.formatPowerCurveText === 'function') {
      txtArea.value = window.RAWindCatalog.formatPowerCurveText(mock.powerCurve);
    }
  }
  _auditWindCurve(prefix);
}

function _auditWindCurve(prefix) {
  const txtArea = document.getElementById(prefix + '-wt-curve-text');
  const badge = document.getElementById(prefix + '-wt-curve-audit-badge');
  if (!txtArea || !badge) return;
  const pts = (window.RAWindCatalog && typeof window.RAWindCatalog.parsePowerCurveText === 'function')
    ? window.RAWindCatalog.parsePowerCurveText(txtArea.value) : [];
  const diam = Math.max(0.5, parseFloat(document.getElementById(prefix + '-wt-diameter').value) || 5.0);
  const type = document.getElementById(prefix + '-wt-type').value || 'HAWT';
  const bladeH = parseFloat(document.getElementById(prefix + '-wt-blade-height').value) || (type === 'VAWT' ? diam * 1.4 : diam / 2);
  const mock = { rotorDiameterM: diam, bladeHeightM: bladeH, bladeLength: bladeH, type: type, powerCurve: pts };
  const audit = (window.RAWindCatalog && typeof window.RAWindCatalog.validatePowerCurve === 'function')
    ? window.RAWindCatalog.validatePowerCurve(mock) : { valid: true, maxCp: 0.38 };
  if (pts.length === 0) {
    badge.innerHTML = 'Auditoría de curva: <b style="color:#F59E0B;">Curva vacía (se autocalculará al guardar)</b>';
  } else if (!audit.valid) {
    badge.innerHTML = 'Auditoría de curva: <b style="color:#EF4444;">Incompatible con Betz (Cp_máx = ' + audit.maxCp + ' > 0,593)</b>';
  } else {
    badge.innerHTML = 'Auditoría de curva: <b style="color:#34D399;">Físicamente viable (Cp_máx = ' + audit.maxCp + ') · ' + pts.length + ' puntos</b>';
  }
}

function _updateWindTurbineAreaPreview(prefix, isTypeToggle) {
  const typeIn = document.getElementById(prefix + '-wt-type');
  const diamIn = document.getElementById(prefix + '-wt-diameter');
  const bladeIn = document.getElementById(prefix + '-wt-blade-height');
  const lbl = document.getElementById(prefix + '-wt-blade-label');
  const areaVal = document.getElementById(prefix + '-wt-area-val');
  const pill = document.getElementById(prefix + '-wt-area-calc-pill');
  if (!typeIn || !diamIn) return;
  const isVawt = (typeIn.value === 'VAWT' || typeIn.value === 'vawt');
  const D = Math.max(0.1, parseFloat(diamIn.value) || 0);
  if (isTypeToggle && bladeIn) {
    bladeIn.value = (Math.round((isVawt ? D * 1.4 : D / 2) * 10) / 10).toFixed(1);
  }
  let H = parseFloat(bladeIn ? bladeIn.value : 0);
  if (!(H > 0)) {
    H = isVawt ? (Math.round(D * 1.4 * 10) / 10) : (Math.round(D / 2 * 10) / 10);
    if (bladeIn) bladeIn.value = H.toFixed(1);
  }
  if (lbl) {
    lbl.textContent = isVawt ? 'Altura Pala Vertical (H, en m):' : 'Longitud de Pala (Radio ≈ Ø / 2, en m):';
  }
  const area = isVawt ? (D * H) : (Math.PI * D * D / 4);
  const formulaText = isVawt
    ? (area.toFixed(2) + ' m² (Cilindro de captación: Ø ' + D.toFixed(1) + 'm × H ' + H.toFixed(1) + 'm)')
    : (area.toFixed(2) + ' m² (Círculo de barrido: π × Ø² / 4)');
  if (pill) {
    pill.textContent = isVawt ? 'VAWT CILÍNDRICO (Ø × H)' : 'HAWT CIRCULAR (π·Ø²/4)';
    pill.style.background = isVawt ? '#8B5CF6' : '#0284C7';
  }
  if (areaVal) areaVal.textContent = formulaText;
}

window.autoCalibrateCurveInEdit = function() { _autoCalibrateWindCurve('edit'); };
window.auditCurveInEdit = function() { _auditWindCurve('edit'); };
window.autoCalibrateCurveInNew = function() { _autoCalibrateWindCurve('new'); };
window.auditCurveInNew = function() { _auditWindCurve('new'); };
window.updateNewWindTurbineAreaPreview = function(isTypeToggle) { _updateWindTurbineAreaPreview('new', isTypeToggle); };
window.updateWindTurbineAreaPreview = function(isTypeToggle) { _updateWindTurbineAreaPreview('edit', isTypeToggle); };
})(typeof window !== "undefined" ? window : globalThis);
