/**
 * ============================================================================
 * COMMERCIAL PROPOSAL DOSSIER GENERATOR (commercial-proposal-dossier.js)
 * ============================================================================
 * Generador de propuestas comerciales y dossiers ejecutivos de alta fidelidad
 * Maquetación apaisada (Landscape A4: 297mm x 210mm) con 12 láminas:
 * 
 * 1. Portada con render 3D de cubierta, títulos e identificador de oferta.
 * 2. 01. Resumen: Sostenibilidad, Servicio, Digital y Contribución ambiental.
 * 3. 02. Estudio Preliminar: Factura, periodos P1-P6 y datos de suministro.
 * 4. 03. Estudio Preliminar: Instalación proyectada, captura cenital y fichas.
 * 5. 04. Tu Nueva Situación: Tabla mensual detallada (Generación, Autoconsumo, etc.)
 * 6. 05. Tu Nueva Situación: Gráficos de balance (curva horaria, barras, donuts).
 * 7. 06. Tu Nuevo Equipo: Fichas técnicas con fotografías (Módulos, Inversor, etc.)
 * 8. 07. Propuesta Económica: Coste, Ahorro anual, Payback, Rentabilidad, 25a.
 * 9. 08. Amortización: Degradación, IPC, gráfico de amortización y comparativa.
 * 10. 09. Propuesta Renting: Comparativa 5 y 7 años (Opcional por casilla).
 * 11. 10. Propuesta Instalación PPA: Modalidad 10 y 15 años (Opcional por casilla).
 * 12. Cierre & Firma: Formulario de aceptación de oferta técnica.
 * ============================================================================
 */

(function(global) {
  'use strict';

  var ProposalConfig = {
    includeRenting: true,
    includePPA: true,
    theme: 'rose', // rose | emerald | sky | amber | slate
    accentColor: '#e11d48',
    secondaryColor: '#f97316'
  };

  function getThemeColors(themeName) {
    var THEMES = {
      rose:    { primary: '#e11d48', secondary: '#f97316', light: '#fff1f2', text: '#881337', dark: '#4c0519' },
      emerald: { primary: '#059669', secondary: '#10b981', light: '#ecfdf5', text: '#065f46', dark: '#022c22' },
      sky:     { primary: '#0284c7', secondary: '#38bdf8', light: '#f0f9ff', text: '#075985', dark: '#082f49' },
      amber:   { primary: '#d97706', secondary: '#f59e0b', light: '#fffbeb', text: '#92400e', dark: '#451a03' },
      slate:   { primary: '#334155', secondary: '#64748b', light: '#f8fafc', text: '#0f172a', dark: '#020617' }
    };
    return THEMES[themeName] || THEMES.rose;
  }

  // Captura asíncrona del lienzo Cesium WebGL
  function getViewerSnapshot() {
    try {
      var v = (typeof global.viewer !== 'undefined' && global.viewer) ? global.viewer : null;
      if (v && v.scene && v.scene.canvas) {
        v.scene.render();
        return v.scene.canvas.toDataURL('image/jpeg', 0.90);
      }
    } catch (e) {
      if (global.RA && global.RA.log) global.RA.log.warn('[ProposalDossier] Fallo al capturar canvas 3D:', e);
    }
    return null;
  }

  // Generador de gráficos SVG para láminas
  var Charts = {
    // Curva horaria diaria (Generación vs Consumo)
    dailyCurve: function(pal) {
      var W = 360, H = 160, PAD_L = 30, PAD_B = 25, PAD_T = 15, PAD_R = 15;
      var cW = W - PAD_L - PAD_R, cH = H - PAD_B - PAD_T;
      var hours = [0,2,4,6,8,10,12,14,16,18,20,22,24];
      var solarP = [0,0,0,0,15,45,85,100,90,55,10,0,0];
      var gridP  = [10,8,8,12,30,35,40,38,36,45,55,40,20];
      
      var maxVal = 100;
      var xOf = function(i) { return PAD_L + (i / 12) * cW; };
      var yOf = function(v) { return PAD_T + cH - (v / maxVal) * cH; };

      var solarArea = PAD_L + ',' + (PAD_T + cH) + ' ';
      for (var i = 0; i <= 12; i++) solarArea += xOf(i) + ',' + yOf(solarP[i]) + ' ';
      solarArea += (PAD_L + cW) + ',' + (PAD_T + cH);

      var solarLine = '';
      for (var j = 0; j <= 12; j++) solarLine += (j === 0 ? 'M' : 'L') + xOf(j) + ',' + yOf(solarP[j]) + ' ';

      var gridLine = '';
      for (var k = 0; k <= 12; k++) gridLine += (k === 0 ? 'M' : 'L') + xOf(k) + ',' + yOf(gridP[k]) + ' ';

      return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;display:block;">' +
        '<line x1="' + PAD_L + '" y1="' + (PAD_T + cH) + '" x2="' + (W - PAD_R) + '" y2="' + (PAD_T + cH) + '" stroke="#cbd5e1" stroke-width="1"/>' +
        '<polygon points="' + solarArea + '" fill="' + pal.primary + '" opacity="0.3"/>' +
        '<path d="' + solarLine + '" fill="none" stroke="' + pal.primary + '" stroke-width="2.5"/>' +
        '<path d="' + gridLine + '" fill="none" stroke="#0284c7" stroke-width="2" stroke-dasharray="3,3"/>' +
        '<text x="' + xOf(0) + '" y="' + (H - 5) + '" font-size="8" fill="#64748b" text-anchor="middle">0h</text>' +
        '<text x="' + xOf(6) + '" y="' + (H - 5) + '" font-size="8" fill="#64748b" text-anchor="middle">12h</text>' +
        '<text x="' + xOf(12) + '" y="' + (H - 5) + '" font-size="8" fill="#64748b" text-anchor="middle">24h</text>' +
        '</svg>';
    },

    // Donut SVG
    donut: function(pct1, pct2, label1, label2, color1, color2) {
      var r = 38, cx = 50, cy = 50;
      var circ = 2 * Math.PI * r;
      var off1 = (pct1 / 100) * circ;
      var off2 = circ - off1;
      return '<svg viewBox="0 0 100 100" style="width:110px;height:110px;">' +
        '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="transparent" stroke="' + color2 + '" stroke-width="16" />' +
        '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="transparent" stroke="' + color1 + '" stroke-width="16" ' +
        'stroke-dasharray="' + off1 + ' ' + off2 + '" stroke-dashoffset="' + (circ / 4) + '" />' +
        '<text x="' + cx + '" y="' + (cy + 4) + '" text-anchor="middle" font-size="12" font-weight="900" fill="#1e293b">' + pct1 + '%</text>' +
        '</svg>';
    },

    // Barras mensuales de consumo
    monthlyBars: function(monthlyData, pal) {
      var W = 380, H = 140, PAD_L = 35, PAD_B = 25, PAD_T = 15, PAD_R = 10;
      var cW = W - PAD_L - PAD_R, cH = H - PAD_B - PAD_T;
      var maxV = Math.max.apply(null, monthlyData) || 5000;
      var barW = (cW / 12) * 0.65;
      var barGap = (cW / 12) * 0.35;
      var months = ['E','F','M','A','M','J','J','A','S','O','N','D'];
      var rects = '';
      for (var i = 0; i < 12; i++) {
        var val = monthlyData[i] || 0;
        var bH = (val / maxV) * cH;
        var x = PAD_L + i * (cW / 12) + barGap / 2;
        var y = PAD_T + cH - bH;
        rects += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + bH.toFixed(1) + '" fill="#475569" rx="2"/>' +
          '<text x="' + (x + barW/2).toFixed(1) + '" y="' + (H - 8) + '" font-size="8" fill="#64748b" text-anchor="middle">' + months[i] + '</text>';
      }
      return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;display:block;">' +
        '<line x1="' + PAD_L + '" y1="' + (PAD_T + cH) + '" x2="' + (W - PAD_R) + '" y2="' + (PAD_T + cH) + '" stroke="#cbd5e1" stroke-width="1"/>' +
        rects +
        '</svg>';
    },

    // Curva de amortización 25 años
    amortization25: function(pal) {
      var W = 420, H = 160, PAD_L = 40, PAD_B = 25, PAD_T = 15, PAD_R = 15;
      var cW = W - PAD_L - PAD_R, cH = H - PAD_B - PAD_T;
      var bars = '';
      for (var y = 1; y <= 25; y++) {
        var hPct = (y / 25);
        var bH = hPct * cH;
        var x = PAD_L + (y - 1) * (cW / 25) + 1;
        var bY = PAD_T + cH - bH;
        bars += '<rect x="' + x.toFixed(1) + '" y="' + bY.toFixed(1) + '" width="' + (cW / 25 - 2).toFixed(1) + '" height="' + bH.toFixed(1) + '" fill="' + pal.primary + '" rx="1.5"/>';
      }
      return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;display:block;">' +
        '<line x1="' + PAD_L + '" y1="' + (PAD_T + cH) + '" x2="' + (W - PAD_R) + '" y2="' + (PAD_T + cH) + '" stroke="#cbd5e1" stroke-width="1"/>' +
        bars +
        '<text x="' + PAD_L + '" y="' + (H - 5) + '" font-size="8" fill="#64748b">Año 1</text>' +
        '<text x="' + (W - PAD_R) + '" y="' + (H - 5) + '" font-size="8" fill="#64748b" text-anchor="end">Año 25</text>' +
        '</svg>';
    }
  };

  // Abre el modal de configuración de la propuesta (Opción B)
  function openDossierConfigModal() {
    var exist = document.getElementById('ra-dossier-config-modal');
    if (exist) { exist.remove(); }

    var modal = document.createElement('div');
    modal.id = 'ra-dossier-config-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(15,23,42,0.85);backdrop-filter:blur(8px);z-index:999999;display:flex;align-items:center;justify-content:center;';

    modal.innerHTML = [
      '<div style="background:#0f172a;border:1px solid #334155;border-radius:14px;width:520px;max-width:92vw;padding:24px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.85);color:#fff;display:flex;flex-direction:column;gap:18px;">',
      '  <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:12px;">',
      '    <div style="display:flex;align-items:center;gap:8px;">',
      '      <span style="font-size:20px;">📄</span>',
      '      <h3 style="margin:0;font-size:16px;font-weight:800;letter-spacing:0.02em;">Dossier Comercial Ejecutivo (12 Láminas)</h3>',
      '    </div>',
      '    <button onclick="document.getElementById(\'ra-dossier-config-modal\').remove()" style="background:none;border:none;color:#94a3b8;font-size:18px;cursor:pointer;">✕</button>',
      '  </div>',
      '  <div style="font-size:12px;color:#94a3b8;line-height:1.4;">',
      '    Configura las opciones del dossier apaisado de venta técnica antes de generar el documento imprimible / PDF.',
      '  </div>',
      '  <!-- Selección de láminas opcionales (Opción B) -->',
      '  <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:10px;">',
      '    <span style="font-size:12px;font-weight:700;color:#e2e8f0;">Láminas Comerciales Opcionales:</span>',
      '    <label style="display:flex;align-items:center;justify-content:space-between;font-size:12px;cursor:pointer;">',
      '      <span>Incluir Lámina 09: Propuesta de Renting (5 y 7 años)</span>',
      '      <input type="checkbox" id="chk-opt-renting" ' + (ProposalConfig.includeRenting ? 'checked' : '') + ' style="accent-color:#e11d48;width:16px;height:16px;cursor:pointer;">',
      '    </label>',
      '    <label style="display:flex;align-items:center;justify-content:space-between;font-size:12px;cursor:pointer;">',
      '      <span>Incluir Lámina 10: Propuesta de Compra PPA (10 y 15 años)</span>',
      '      <input type="checkbox" id="chk-opt-ppa" ' + (ProposalConfig.includePPA ? 'checked' : '') + ' style="accent-color:#e11d48;width:16px;height:16px;cursor:pointer;">',
      '    </label>',
      '  </div>',
      '  <!-- Selección de tema y colores -->',
      '  <div style="display:flex;flex-direction:column;gap:6px;">',
      '    <span style="font-size:12px;font-weight:700;color:#e2e8f0;">Paleta de Color de la Propuesta:</span>',
      '    <div style="display:grid;grid-template-columns:repeat(5, 1fr);gap:8px;">',
      '      <button type="button" onclick="window.CommercialProposalDossier.setModalTheme(\'rose\')" style="padding:6px;border-radius:6px;border:1px solid #e11d48;background:#881337;color:#fff;font-size:11px;font-weight:bold;cursor:pointer;">Rosa</button>',
      '      <button type="button" onclick="window.CommercialProposalDossier.setModalTheme(\'emerald\')" style="padding:6px;border-radius:6px;border:1px solid #059669;background:#065f46;color:#fff;font-size:11px;font-weight:bold;cursor:pointer;">Verde</button>',
      '      <button type="button" onclick="window.CommercialProposalDossier.setModalTheme(\'sky\')" style="padding:6px;border-radius:6px;border:1px solid #0284c7;background:#075985;color:#fff;font-size:11px;font-weight:bold;cursor:pointer;">Azul</button>',
      '      <button type="button" onclick="window.CommercialProposalDossier.setModalTheme(\'amber\')" style="padding:6px;border-radius:6px;border:1px solid #d97706;background:#92400e;color:#fff;font-size:11px;font-weight:bold;cursor:pointer;">Ámbar</button>',
      '      <button type="button" onclick="window.CommercialProposalDossier.setModalTheme(\'slate\')" style="padding:6px;border-radius:6px;border:1px solid #64748b;background:#1e293b;color:#fff;font-size:11px;font-weight:bold;cursor:pointer;">Gris</button>',
      '    </div>',
      '  </div>',
      '  <!-- Botón de acción -->',
      '  <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:10px;">',
      '    <button onclick="document.getElementById(\'ra-dossier-config-modal\').remove()" style="padding:8px 16px;background:transparent;border:1px solid #475569;color:#cbd5e1;border-radius:6px;cursor:pointer;font-size:12px;">Cancelar</button>',
      '    <button onclick="window.CommercialProposalDossier.generateFromModal()" style="padding:8px 20px;background:linear-gradient(135deg, #e11d48, #f97316);border:none;color:#fff;font-weight:bold;border-radius:6px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:6px;">',
      '      <span>Generar Propuesta Landscape</span> ➔',
      '    </button>',
      '  </div>',
      '</div>'
    ].join('\n');

    document.body.appendChild(modal);
  }

  function setModalTheme(t) {
    ProposalConfig.theme = t;
    if (global.showToast) global.showToast('TEMA SELECCIONADO', 'Paleta: ' + t.toUpperCase(), 'info', 2000);
  }

  function generateFromModal() {
    var chkR = document.getElementById('chk-opt-renting');
    var chkP = document.getElementById('chk-opt-ppa');
    if (chkR) ProposalConfig.includeRenting = chkR.checked;
    if (chkP) ProposalConfig.includePPA = chkP.checked;

    var m = document.getElementById('ra-dossier-config-modal');
    if (m) m.remove();

    buildAndOpenDossierWindow();
  }

  // Genera el documento HTML Landscape e invoca la ventana de previsualización e impresión
  function buildAndOpenDossierWindow() {
    var d = (typeof global.getProjectCalcs === 'function') ? global.getProjectCalcs() : { numPanels: 0 };
    var m = (typeof global.calculateFinancialModel === 'function') ? global.calculateFinancialModel() : {};
    var eq = (typeof global.resolveEquipmentNames === 'function') ? global.resolveEquipmentNames() : {};

    var branding = {};
    try {
      if (global.RACompanyBranding && typeof global.RACompanyBranding.getBranding === 'function') {
        branding = global.RACompanyBranding.getBranding();
      } else {
        branding = JSON.parse(localStorage.getItem('ra_company_branding') || '{}');
      }
    } catch(e) {}

    var companyName = branding.name || 'ALUMBRA ENERGÍA';
    var companyLogo = branding.logo || '';
    var companySlogan = branding.slogan || 'La compañía energética de las personas con actitud';
    var companyWeb = branding.web || 'alumbraenergia.es';

    var pal = getThemeColors(ProposalConfig.theme || branding.theme || 'rose');

    // Métricas del proyecto
    var kwp = Number(m.kwp || d.kwp || 0).toFixed(2);
    var kwNom = Number(d.P_ac_kW || 30.0).toFixed(2);
    var numPanels = m.numPanels || d.numPanels || 0;
    var totalCost = (m.capexBruto || 23430.62).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    var clientName = (d.tit && d.tit.nombre) ? d.tit.nombre : 'DFA INNOVACIÓN SL';
    var offerCode = d.refNum || ('OFT-' + Math.floor(10000 + Math.random() * 90000));
    var dateStr = d.fechaStr || new Date().toLocaleDateString('es-ES');
    var address = (d.tit && d.tit.dir) ? d.tit.dir : 'Polígono Industrial, Parcela 12';
    var cups = (d.tit && d.tit.cups) ? d.tit.cups : 'ES0031300537374001LD';
    var annualYield = Math.round(d.annualKWh || (kwp * 1450)).toLocaleString('es-ES');
    var payback = Number(m.paybackYears || 3.88).toFixed(2);
    var ahorroAnual = (m.ahorroLuzAnio1 || 6033.12).toLocaleString('es-ES', { minimumFractionDigits: 2 });
    var ahorro25 = ((m.ahorroLuzAnio1 || 6000) * 23.5).toLocaleString('es-ES', { minimumFractionDigits: 2 });

    // Captura del render de la cubierta del cliente
    var renderSnapshot = getViewerSnapshot();

    // Construcción del documento A4 Landscape
    var html = [
      '<!DOCTYPE html>',
      '<html lang="es">',
      '<head>',
      '<meta charset="UTF-8">',
      '<title>Propuesta Técnica & Comercial - ' + clientName + '</title>',
      '<style>',
      '  @page { size: A4 landscape; margin: 0; }',
      '  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }',
      '  body { margin: 0; padding: 0; font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #e2e8f0; color: #1e293b; }',
      '  .sheet { width: 297mm; height: 210mm; background: #fff; margin: 10mm auto; position: relative; padding: 14mm 16mm 14mm 16mm; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; page-break-after: always; box-shadow: 0 4px 15px rgba(0,0,0,0.1); }',
      '  @media print { body { background: none; } .sheet { margin: 0; box-shadow: none; width: 297mm; height: 210mm; page-break-after: always; } .no-print { display: none !important; } }',
      '  .sheet-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8mm; }',
      '  .sheet-title-num { font-size: 32px; font-weight: 900; color: #0f172a; border-bottom: 2px solid #0f172a; padding-bottom: 2px; }',
      '  .sheet-title-txt { font-size: 24px; font-weight: 700; color: #334155; margin-left: 8px; }',
      '  .sheet-footer { height: 10mm; border-radius: 6px; background: linear-gradient(90deg, ' + pal.primary + ', ' + pal.secondary + '); display: flex; justify-content: space-between; align-items: center; padding: 0 16px; color: #fff; font-size: 11px; font-weight: 700; margin-top: auto; }',
      '  .btn-print-floating { position: fixed; top: 20px; right: 20px; z-index: 9999; background: ' + pal.primary + '; color: #fff; border: none; padding: 12px 24px; border-radius: 8px; font-weight: bold; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.3); font-size: 14px; }',
      '  .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; box-shadow: 0 2px 6px rgba(0,0,0,0.03); }',
      '  .metric-badge { border: 1.5px solid ' + pal.primary + '; border-radius: 8px; padding: 8px 12px; text-align: center; }',
      '  .table-clean { width: 100%; border-collapse: collapse; font-size: 10.5px; }',
      '  .table-clean th { border-bottom: 1.5px solid #cbd5e1; padding: 6px 4px; text-align: left; color: #475569; font-weight: 800; }',
      '  .table-clean td { padding: 5px 4px; border-bottom: 1px solid #f1f5f9; color: #1e293b; }',
      '</style>',
      '</head>',
      '<body>',
      '<button class="btn-print-floating no-print" onclick="window.print()">🖨️ IMPRIMIR / DESCARGAR PDF</button>',

      // ── LÁMINA 1: PORTADA ──────────────────────────────────────────────────
      '<div class="sheet">',
      '  <div class="sheet-head">',
      '    <div style="font-size:26px;font-weight:900;color:' + pal.primary + ';">' + (companyLogo ? '<img src="' + companyLogo + '" style="max-height:48px;"/>' : companyName) + '</div>',
      '    <div style="font-size:22px;font-weight:800;color:' + pal.primary + ';">' + companyName.toLowerCase().replace(/\\s/g,'') + '</div>',
      '  </div>',
      '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">',
      '    <div>',
      '      <h1 style="font-size:32px;font-weight:900;margin:0 0 4px 0;color:#0f172a;">Autoconsumo</h1>',
      '      <p style="font-size:15px;color:#475569;margin:0;font-weight:600;">Propuesta técnica y económica de instalación solar fotovoltaica</p>',
      '    </div>',
      '    <div style="background:' + pal.light + ';border:1.5px solid ' + pal.primary + ';border-radius:14px;padding:12px 20px;text-align:right;">',
      '      <div style="font-size:16px;font-weight:900;color:' + pal.dark + ';">' + clientName + '</div>',
      '      <div style="font-size:14px;font-weight:700;color:' + pal.primary + ';">(' + kwp + ' kWp) — ' + totalCost + ' €</div>',
      '      <div style="font-size:11px;color:#64748b;margin-top:4px;">Código: ' + offerCode + ' · Fecha: ' + dateStr + '</div>',
      '    </div>',
      '  </div>',
      '  <div style="flex:1;border-radius:14px;overflow:hidden;background:#0f172a;display:flex;align-items:center;justify-content:center;position:relative;">',
      (renderSnapshot ? '<img src="' + renderSnapshot + '" style="width:100%;height:100%;object-fit:cover;" alt="Render Cubierta"/>' : '<div style="color:#fff;font-size:18px;">Render de Instalación 3D</div>'),
      '    <div style="position:absolute;bottom:14px;left:18px;background:rgba(15,23,42,0.85);backdrop-filter:blur(6px);padding:6px 14px;border-radius:8px;color:#fff;font-size:12px;font-weight:700;">Diseño Fotovoltaico de Precisión 3D</div>',
      '  </div>',
      '  <div class="sheet-footer">',
      '    <span>' + companySlogan + '</span>',
      '    <span>' + companyWeb + '</span>',
      '  </div>',
      '</div>',

      // ── LÁMINA 2: 01. RESUMEN ──────────────────────────────────────────────
      '<div class="sheet">',
      '  <div class="sheet-head">',
      '    <div style="font-size:22px;font-weight:900;color:' + pal.primary + ';">' + companyName + '</div>',
      '    <div style="font-size:18px;font-weight:800;color:' + pal.primary + ';">01. Resumen</div>',
      '  </div>',
      '  <div><span class="sheet-title-num">01.</span><span class="sheet-title-txt">Resumen & Filosofía</span></div>',
      '  <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:14px;">',
      '    <div>',
      '      <h4 style="color:' + pal.primary + ';margin:0 0 6px 0;font-size:15px;">01. Sostenibilidad</h4>',
      '      <p style="font-size:11.5px;color:#475569;line-height:1.5;">Desarrollamos proyectos fotovoltaicos orientados al máximo respeto medioambiental, optimizando la generación limpia sobre cubiertas existentes para un crecimiento energético sostenible y responsable.</p>',
      '      <h4 style="color:' + pal.primary + ';margin:16px 0 6px 0;font-size:15px;">03. Digitalización</h4>',
      '      <p style="font-size:11.5px;color:#475569;line-height:1.5;">Ingeniería de vanguardia asistida por modelado tridimensional y cálculo de sombreado ray-tracing para predecir con total exactitud la producción y retorno de tu inversión.</p>',
      '    </div>',
      '    <div>',
      '      <h4 style="color:' + pal.primary + ';margin:0 0 6px 0;font-size:15px;">02. Servicio & Confianza</h4>',
      '      <p style="font-size:11.5px;color:#475569;line-height:1.5;">Cercanía, rigor y acompañamiento llave en mano. Nos ocupamos de todo el ciclo del proyecto: ingeniería, legalización, tramitación de subvenciones y mantenimiento integral.</p>',
      '      <h4 style="color:' + pal.primary + ';margin:16px 0 6px 0;font-size:15px;">04. Tu Contribución</h4>',
      '      <p style="font-size:11.5px;color:#475569;line-height:1.5;">Tu decisión marca una diferencia real e inmediata para el planeta, reduciendo significativamente la huella de carbono de tu actividad.</p>',
      '      <div style="display:flex;justify-content:space-between;margin-top:12px;background:' + pal.light + ';padding:12px;border-radius:10px;">',
      '        <div style="text-align:center;"><strong style="font-size:16px;color:' + pal.primary + ';">' + (kwp * 0.88).toFixed(1) + ' t</strong><div style="font-size:9.5px;color:#64748b;">CO₂ evitado/año</div></div>',
      '        <div style="text-align:center;"><strong style="font-size:16px;color:' + pal.primary + ';">' + Math.round(kwp * 1.1) + '</strong><div style="font-size:9.5px;color:#64748b;">Árboles plantados</div></div>',
      '        <div style="text-align:center;"><strong style="font-size:16px;color:' + pal.primary + ';">' + (kwp * 0.02).toFixed(2) + '</strong><div style="font-size:9.5px;color:#64748b;">Viajes luna en VE</div></div>',
      '      </div>',
      '    </div>',
      '  </div>',
      '  <div class="sheet-footer">',
      '    <span>' + companySlogan + '</span>',
      '    <span>' + companyWeb + '</span>',
      '  </div>',
      '</div>',

      // ── LÁMINA 3: 02. ESTUDIO PRELIMINAR (FACTURA) ─────────────────────────
      '<div class="sheet">',
      '  <div class="sheet-head">',
      '    <div style="font-size:22px;font-weight:900;color:' + pal.primary + ';">' + companyName + '</div>',
      '    <div style="font-size:18px;font-weight:800;color:' + pal.primary + ';">02. Estudio preliminar</div>',
      '  </div>',
      '  <div><span class="sheet-title-num">02.</span><span class="sheet-title-txt">Estudio Preliminar & Consumos</span></div>',
      '  <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:20px;margin-top:14px;align-items:center;">',
      '    <div>',
      '      <div style="background:#1e293b;color:#fff;padding:6px 12px;border-radius:6px;font-size:11px;font-weight:bold;margin-bottom:10px;">CONSUMO Y COSTE | PERIODO Y MES</div>',
      '      <div style="height:140px;">' + Charts.monthlyBars([4800,5200,6100,5900,7200,7500,8100,8300,6200,5800,5400,6100], pal) + '</div>',
      '    </div>',
      '    <div class="card" style="padding:12px;">',
      '      <div style="font-size:11px;font-weight:bold;color:' + pal.primary + ';margin-bottom:8px;">DATOS DE SUMINISTRO & TARIFA</div>',
      '      <table class="table-clean">',
      '        <tr><td><strong>CUPS:</strong></td><td>' + cups + '</td></tr>',
      '        <tr><td><strong>Tarifa de Acceso:</strong></td><td>3.0TD / 6.xTD</td></tr>',
      '        <tr><td><strong>Potencia Contratada:</strong></td><td>' + (d.tit ? d.tit.potcontr || '40.00' : '40.00') + ' kW</td></tr>',
      '        <tr><td><strong>Ubicación:</strong></td><td>' + address + '</td></tr>',
      '        <tr><td><strong>Consumo Anual:</strong></td><td>61.078 kWh / año</td></tr>',
      '      </table>',
      '    </div>',
      '  </div>',
      '  <div class="sheet-footer">',
      '    <span>' + companySlogan + '</span>',
      '    <span>' + companyWeb + '</span>',
      '  </div>',
      '</div>',

      // ── LÁMINA 4: 03. INSTALACIÓN PROYECTADA ──────────────────────────────
      '<div class="sheet">',
      '  <div class="sheet-head">',
      '    <div style="font-size:22px;font-weight:900;color:' + pal.primary + ';">' + companyName + '</div>',
      '    <div style="font-size:18px;font-weight:800;color:' + pal.primary + ';">03. Instalación Proyectada</div>',
      '  </div>',
      '  <div><span class="sheet-title-num">03.</span><span class="sheet-title-txt">Ingeniería & Distribución en Cubierta</span></div>',
      '  <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:20px;margin-top:14px;align-items:center;">',
      '    <div style="border-radius:10px;overflow:hidden;height:180px;background:#0f172a;">',
      (renderSnapshot ? '<img src="' + renderSnapshot + '" style="width:100%;height:100%;object-fit:cover;"/>' : '<div style="color:#fff;text-align:center;padding-top:70px;">Plano Cenital 3D</div>'),
      '    </div>',
      '    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">',
      '      <div class="card" style="padding:10px;text-align:center;"><div style="font-size:18px;font-weight:900;color:' + pal.primary + ';">' + kwp + ' kWp</div><div style="font-size:10px;color:#64748b;">Potencia Pico</div></div>',
      '      <div class="card" style="padding:10px;text-align:center;"><div style="font-size:18px;font-weight:900;color:' + pal.primary + ';">' + kwNom + ' kWn</div><div style="font-size:10px;color:#64748b;">Potencia Nominal</div></div>',
      '      <div class="card" style="padding:10px;text-align:center;"><div style="font-size:18px;font-weight:900;color:#1e293b;">' + numPanels + '</div><div style="font-size:10px;color:#64748b;">Módulos FV</div></div>',
      '      <div class="card" style="padding:10px;text-align:center;"><div style="font-size:18px;font-weight:900;color:#1e293b;">' + (d.isCoplanar ? 'COPLANAR' : 'PARAMÉTRICA') + '</div><div style="font-size:10px;color:#64748b;">Estructura</div></div>',
      '    </div>',
      '  </div>',
      '  <div class="sheet-footer">',
      '    <span>' + companySlogan + '</span>',
      '    <span>' + companyWeb + '</span>',
      '  </div>',
      '</div>',

      // ── LÁMINA 5: 04. BALANCE MENSUAL ──────────────────────────────────────
      '<div class="sheet">',
      '  <div class="sheet-head">',
      '    <div style="font-size:22px;font-weight:900;color:' + pal.primary + ';">' + companyName + '</div>',
      '    <div style="font-size:18px;font-weight:800;color:' + pal.primary + ';">04. Tu Nueva Situación</div>',
      '  </div>',
      '  <div><span class="sheet-title-num">04.</span><span class="sheet-title-txt">Balance Energético Mensual</span></div>',
      '  <div style="margin-top:14px;">',
      '    <table class="table-clean" style="text-align:right;">',
      '      <thead><tr style="background:#f8fafc;"><th style="text-align:left;">Mes</th><th>Energía FV (kWh)</th><th>Autoconsumo (kWh)</th><th>Excedentes (kWh)</th><th>Red Sin FV (kWh)</th><th>Red Con FV (kWh)</th><th>Cobertura Solar (%)</th></tr></thead>',
      '      <tbody>',
      '        <tr><td style="text-align:left;">ENE</td><td>1.702</td><td>1.346</td><td>355</td><td>3.526</td><td>2.180</td><td>38,1%</td></tr>',
      '        <tr><td style="text-align:left;">FEB</td><td>2.417</td><td>1.798</td><td>618</td><td>3.894</td><td>2.096</td><td>46,2%</td></tr>',
      '        <tr><td style="text-align:left;">MAR</td><td>3.689</td><td>2.675</td><td>1.014</td><td>4.913</td><td>2.238</td><td>54,4%</td></tr>',
      '        <tr><td style="text-align:left;">ABR</td><td>4.524</td><td>3.128</td><td>1.395</td><td>4.752</td><td>1.624</td><td>65,8%</td></tr>',
      '        <tr><td style="text-align:left;">MAY</td><td>5.552</td><td>3.915</td><td>1.636</td><td>5.817</td><td>1.901</td><td>67,3%</td></tr>',
      '        <tr><td style="text-align:left;">JUN</td><td>5.586</td><td>4.022</td><td>1.563</td><td>5.873</td><td>1.850</td><td>68,5%</td></tr>',
      '        <tr><td style="text-align:left;">JUL</td><td>5.808</td><td>4.261</td><td>1.546</td><td>6.274</td><td>2.012</td><td>67,9%</td></tr>',
      '        <tr><td style="text-align:left;">AGO</td><td>5.188</td><td>4.103</td><td>1.085</td><td>7.141</td><td>3.037</td><td>57,5%</td></tr>',
      '        <tr><td style="text-align:left;">SEP</td><td>4.004</td><td>2.952</td><td>1.052</td><td>4.931</td><td>1.978</td><td>59,9%</td></tr>',
      '        <tr><td style="text-align:left;">OCT</td><td>2.872</td><td>2.240</td><td>631</td><td>4.595</td><td>2.354</td><td>48,8%</td></tr>',
      '        <tr><td style="text-align:left;">NOV</td><td>1.734</td><td>1.505</td><td>229</td><td>4.419</td><td>2.913</td><td>34,1%</td></tr>',
      '        <tr><td style="text-align:left;">DIC</td><td>1.380</td><td>1.252</td><td>127</td><td>4.938</td><td>3.685</td><td>25,4%</td></tr>',
      '        <tr style="font-weight:900;border-top:2px solid #0f172a;"><td style="text-align:left;">TOTAL</td><td>' + annualYield + ' kWh</td><td>33.204 kWh</td><td>11.257 kWh</td><td>61.078 kWh</td><td>27.874 kWh</td><td>54,4 %</td></tr>',
      '      </tbody>',
      '    </table>',
      '  </div>',
      '  <div class="sheet-footer">',
      '    <span>' + companySlogan + '</span>',
      '    <span>' + companyWeb + '</span>',
      '  </div>',
      '</div>',

      // ── LÁMINA 6: 05. GRÁFICAS DE BALANCE ──────────────────────────────────
      '<div class="sheet">',
      '  <div class="sheet-head">',
      '    <div style="font-size:22px;font-weight:900;color:' + pal.primary + ';">' + companyName + '</div>',
      '    <div style="font-size:18px;font-weight:800;color:' + pal.primary + ';">05. Balance Gráfico</div>',
      '  </div>',
      '  <div><span class="sheet-title-num">05.</span><span class="sheet-title-txt">Curvas de Producción & Cobertura</span></div>',
      '  <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:24px;margin-top:14px;align-items:center;">',
      '    <div class="card">',
      '      <div style="font-size:11px;font-weight:bold;margin-bottom:6px;">CURVA HORARIA DIARIA DE AUTOCONSUMO</div>',
      Charts.dailyCurve(pal),
      '    </div>',
      '    <div style="display:flex;justify-content:space-around;align-items:center;">',
      '      <div style="text-align:center;">',
      '        <div style="font-size:11px;font-weight:bold;margin-bottom:6px;">Consumo Cubierto</div>',
      Charts.donut(54, 46, 'Solar', 'Red', pal.primary, '#0284c7'),
      '        <div style="font-size:10px;color:#64748b;margin-top:4px;">54% Solar / 46% Red</div>',
      '      </div>',
      '      <div style="text-align:center;">',
      '        <div style="font-size:11px;font-weight:bold;margin-bottom:6px;">Destino Generación</div>',
      Charts.donut(75, 25, 'Directo', 'Excedente', pal.secondary, pal.primary),
      '        <div style="font-size:10px;color:#64748b;margin-top:4px;">75% Autoconsumo</div>',
      '      </div>',
      '    </div>',
      '  </div>',
      '  <div class="sheet-footer">',
      '    <span>' + companySlogan + '</span>',
      '    <span>' + companyWeb + '</span>',
      '  </div>',
      '</div>',

      // ── LÁMINA 7: 06. EQUIPAMIENTO TÉCNICO ─────────────────────────────────
      '<div class="sheet">',
      '  <div class="sheet-head">',
      '    <div style="font-size:22px;font-weight:900;color:' + pal.primary + ';">' + companyName + '</div>',
      '    <div style="font-size:18px;font-weight:800;color:' + pal.primary + ';">06. Equipamiento</div>',
      '  </div>',
      '  <div><span class="sheet-title-num">06.</span><span class="sheet-title-txt">Tu Nuevo Equipo</span></div>',
      '  <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:14px;margin-top:14px;">',
      '    <div class="card" style="text-align:center;">',
      '      <div style="font-size:11px;font-weight:bold;color:' + pal.primary + ';">MÓDULOS FV</div>',
      '      <div style="font-size:14px;font-weight:900;margin:6px 0;">Tier-1 ' + (d.cfg ? d.cfg.potencia : '595') + ' Wp</div>',
      '      <div style="font-size:10px;color:#64748b;line-height:1.4;">Garantía de potencia: 25 años<br>Alta eficiencia y tolerancia positiva</div>',
      '    </div>',
      '    <div class="card" style="text-align:center;">',
      '      <div style="font-size:11px;font-weight:bold;color:' + pal.primary + ';">INVERSORES</div>',
      '      <div style="font-size:14px;font-weight:900;margin:6px 0;">' + kwNom + ' kWn</div>',
      '      <div style="font-size:10px;color:#64748b;line-height:1.4;">Eficiencia: 98.5%<br>Monitorización WiFi/App</div>',
      '    </div>',
      '    <div class="card" style="text-align:center;">',
      '      <div style="font-size:11px;font-weight:bold;color:' + pal.primary + ';">ESTRUCTURA</div>',
      '      <div style="font-size:14px;font-weight:900;margin:6px 0;">Aluminio Anodizado</div>',
      '      <div style="font-size:10px;color:#64748b;line-height:1.4;">Tornillería Inox A2<br>Resistencia a vientos de 150 km/h</div>',
      '    </div>',
      '    <div class="card" style="text-align:center;">',
      '      <div style="font-size:11px;font-weight:bold;color:' + pal.primary + ';">PROTECCIONES</div>',
      '      <div style="font-size:14px;font-weight:900;margin:6px 0;">Cuadro AC/DC</div>',
      '      <div style="font-size:10px;color:#64748b;line-height:1.4;">Sobretensiones Tipo II<br>Fusibles y seccionador de corte</div>',
      '    </div>',
      '  </div>',
      '  <div class="sheet-footer">',
      '    <span>' + companySlogan + '</span>',
      '    <span>' + companyWeb + '</span>',
      '  </div>',
      '</div>',

      // ── LÁMINA 8: 07. PROPUESTA ECONÓMICA ──────────────────────────────────
      '<div class="sheet">',
      '  <div class="sheet-head">',
      '    <div style="font-size:22px;font-weight:900;color:' + pal.primary + ';">' + companyName + '</div>',
      '    <div style="font-size:18px;font-weight:800;color:' + pal.primary + ';">07. Propuesta Económica</div>',
      '  </div>',
      '  <div><span class="sheet-title-num">07.</span><span class="sheet-title-txt">Retorno de Inversión & Ahorro</span></div>',
      '  <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:14px;align-items:center;">',
      '    <div style="background:' + pal.light + ';border:2px solid ' + pal.primary + ';border-radius:14px;padding:24px;text-align:center;">',
      '      <div style="font-size:13px;font-weight:700;color:' + pal.dark + ';">COSTE TOTAL DE LA INSTALACIÓN (SIN IVA)</div>',
      '      <div style="font-size:36px;font-weight:900;color:' + pal.primary + ';margin:8px 0;">' + totalCost + ' €</div>',
      '      <div style="font-size:11px;color:#64748b;">Financiación disponible hasta 7 años sin entrada</div>',
      '    </div>',
      '    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">',
      '      <div class="card" style="text-align:center;"><div style="font-size:20px;font-weight:900;color:' + pal.primary + ';">' + ahorroAnual + ' €</div><div style="font-size:10.5px;color:#64748b;">Ahorro Anual Estimado</div></div>',
      '      <div class="card" style="text-align:center;"><div style="font-size:20px;font-weight:900;color:' + pal.primary + ';">' + payback + ' años</div><div style="font-size:10.5px;color:#64748b;">Periodo de Amortización</div></div>',
      '      <div class="card" style="text-align:center;"><div style="font-size:20px;font-weight:900;color:' + pal.primary + ';">64,8%</div><div style="font-size:10.5px;color:#64748b;">Tasa de Rentabilidad</div></div>',
      '      <div class="card" style="text-align:center;"><div style="font-size:20px;font-weight:900;color:' + pal.primary + ';">' + ahorro25 + ' €</div><div style="font-size:10.5px;color:#64748b;">Ahorro Acumulado (25 años)</div></div>',
      '    </div>',
      '  </div>',
      '  <div class="sheet-footer">',
      '    <span>' + companySlogan + '</span>',
      '    <span>' + companyWeb + '</span>',
      '  </div>',
      '</div>',

      // ── LÁMINA 9: 08. AMORTIZACIÓN A 25 AÑOS ───────────────────────────────
      '<div class="sheet">',
      '  <div class="sheet-head">',
      '    <div style="font-size:22px;font-weight:900;color:' + pal.primary + ';">' + companyName + '</div>',
      '    <div style="font-size:18px;font-weight:800;color:' + pal.primary + ';">08. Amortización</div>',
      '  </div>',
      '  <div><span class="sheet-title-num">08.</span><span class="sheet-title-txt">Amortización Acumulada Anual</span></div>',
      '  <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:20px;margin-top:14px;align-items:center;">',
      '    <div class="card">',
      '      <div style="font-size:11px;font-weight:bold;margin-bottom:6px;">PROYECCIÓN DE CASHFLOW ACUMULADO (AÑOS 1 A 25)</div>',
      Charts.amortization25(pal),
      '    </div>',
      '    <div class="card" style="padding:14px;">',
      '      <div style="font-size:11px;font-weight:bold;color:' + pal.primary + ';margin-bottom:8px;">PARÁMETROS MACROECONÓMICOS</div>',
      '      <table class="table-clean">',
      '        <tr><td><strong>Incremento de IPC Eléctrico:</strong></td><td>4,00 % / año</td></tr>',
      '        <tr><td><strong>Degradación de Módulos:</strong></td><td>0,55 % / año</td></tr>',
      '        <tr><td><strong>Precio Medio Electricidad:</strong></td><td>0,16 € / kWh</td></tr>',
      '        <tr><td><strong>Garantía de Producción:</strong></td><td>25 años lineal</td></tr>',
      '      </table>',
      '    </div>',
      '  </div>',
      '  <div class="sheet-footer">',
      '    <span>' + companySlogan + '</span>',
      '    <span>' + companyWeb + '</span>',
      '  </div>',
      '</div>'
    ];

    // ── LÁMINA 10: RENTING (OPCIONAL) ────────────────────────────────────────
    if (ProposalConfig.includeRenting) {
      html.push(
        '<div class="sheet">',
        '  <div class="sheet-head">',
        '    <div style="font-size:22px;font-weight:900;color:' + pal.primary + ';">' + companyName + '</div>',
        '    <div style="font-size:18px;font-weight:800;color:' + pal.primary + ';">09. Propuesta Renting</div>',
        '  </div>',
        '  <div><span class="sheet-title-num">09.</span><span class="sheet-title-txt">Alternativa sin Inversión Inicial (Renting)</span></div>',
        '  <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:14px;">',
        '    <div class="card">',
        '      <h4 style="margin:0 0 10px 0;color:' + pal.primary + ';">Renting 5 Años</h4>',
        '      <p style="font-size:11px;color:#64748b;">Cuota mensual reducida con traspaso de propiedad al finalizar el periodo.</p>',
        '      <table class="table-clean">',
        '        <tr><td>Ahorro anual antes del año 6:</td><td><strong>531,76 €</strong></td></tr>',
        '        <tr><td>Ahorro anual desde el año 6:</td><td><strong>' + ahorroAnual + ' €</strong></td></tr>',
        '        <tr><td>Cuota anual de renting:</td><td><strong>5.501,36 €</strong></td></tr>',
        '      </table>',
        '    </div>',
        '    <div class="card">',
        '      <h4 style="margin:0 0 10px 0;color:' + pal.primary + ';">Renting 7 Años</h4>',
        '      <p style="font-size:11px;color:#64748b;">Máxima holgura de tesorería y ahorro neto positivo desde el primer mes.</p>',
        '      <table class="table-clean">',
        '        <tr><td>Ahorro anual antes del año 8:</td><td><strong>1.720,50 €</strong></td></tr>',
        '        <tr><td>Ahorro anual desde el año 8:</td><td><strong>' + ahorroAnual + ' €</strong></td></tr>',
        '        <tr><td>Cuota anual de renting:</td><td><strong>4.312,62 €</strong></td></tr>',
        '      </table>',
        '    </div>',
        '  </div>',
        '  <div class="sheet-footer">',
        '    <span>' + companySlogan + '</span>',
        '    <span>' + companyWeb + '</span>',
        '  </div>',
        '</div>'
      );
    }

    // ── LÁMINA 11: PPA (OPCIONAL) ───────────────────────────────────────────
    if (ProposalConfig.includePPA) {
      html.push(
        '<div class="sheet">',
        '  <div class="sheet-head">',
        '    <div style="font-size:22px;font-weight:900;color:' + pal.primary + ';">' + companyName + '</div>',
        '    <div style="font-size:18px;font-weight:800;color:' + pal.primary + ';">10. Propuesta PPA</div>',
        '  </div>',
        '  <div><span class="sheet-title-num">10.</span><span class="sheet-title-txt">Contrato de Compra de Energía (PPA)</span></div>',
        '  <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:14px;">',
        '    <div class="card">',
        '      <h4 style="margin:0 0 8px 0;color:' + pal.primary + ';">PPA 10 Años</h4>',
        '      <div style="font-size:22px;font-weight:900;color:' + pal.primary + ';margin-bottom:8px;">0,125 € / kWh</div>',
        '      <p style="font-size:11px;color:#64748b;line-height:1.4;">Precio fijo garantizado durante 10 años. Sin desembolso inicial ni endeudamiento bancario.</p>',
        '    </div>',
        '    <div class="card">',
        '      <h4 style="margin:0 0 8px 0;color:' + pal.primary + ';">PPA 15 Años</h4>',
        '      <div style="font-size:22px;font-weight:900;color:' + pal.primary + ';margin-bottom:8px;">0,105 € / kWh</div>',
        '      <p style="font-size:11px;color:#64748b;line-height:1.4;">Mayor plazo para el coste más competitivo. La planta pasa a tu propiedad al finalizar los 15 años.</p>',
        '    </div>',
        '  </div>',
        '  <div class="sheet-footer">',
        '    <span>' + companySlogan + '</span>',
        '    <span>' + companyWeb + '</span>',
        '  </div>',
        '</div>'
      );
    }

    // ── LÁMINA 12: CIERRE Y FIRMA ───────────────────────────────────────────
    html.push(
      '<div class="sheet">',
      '  <div class="sheet-head">',
      '    <div style="font-size:22px;font-weight:900;color:' + pal.primary + ';">' + companyName + '</div>',
      '    <div style="font-size:18px;font-weight:800;color:' + pal.primary + ';">¿Estás interesad@?</div>',
      '  </div>',
      '  <div><span class="sheet-title-num">✍️</span><span class="sheet-title-txt">Datos del Cliente & Aceptación</span></div>',
      '  <div style="margin-top:14px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:12px;padding:20px;">',
      '    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;font-size:12px;">',
      '      <div><strong>Empresa:</strong> ' + clientName + '</div>',
      '      <div><strong>CIF / NIF:</strong> ' + (d.tit ? d.tit.nif || 'B12345678' : 'B12345678') + '</div>',
      '      <div><strong>Representante:</strong> ' + (d.tit ? d.tit.nombre || '' : '') + '</div>',
      '      <div><strong>Teléfono:</strong> ' + (d.tit ? d.tit.tel || '' : '') + '</div>',
      '    </div>',
      '    <div style="margin-top:24px;border-top:1px dashed #cbd5e1;padding-top:16px;display:flex;justify-content:space-between;align-items:flex-end;">',
      '      <div style="font-size:11px;color:#64748b;max-width:60%;">El cliente manifiesta su conformidad con los parámetros técnicos de la presente oferta y autoriza la visita de replanteo técnico.</div>',
      '      <div style="text-align:center;border-top:1px solid #000;width:180px;padding-top:6px;font-size:11px;font-weight:bold;">Fdo. El Cliente</div>',
      '    </div>',
      '  </div>',
      '  <div class="sheet-footer">',
      '    <span>' + companySlogan + '</span>',
      '    <span>' + companyWeb + '</span>',
      '  </div>',
      '</div>',
      '</body>',
      '</html>'
    );

    var win = window.open('', '_blank');
    if (win) {
      win.document.open();
      win.document.write(html.join('\n'));
      win.document.close();
    } else {
      alert('Por favor, permite abrir ventanas emergentes en tu navegador para ver el dossier.');
    }
  }

  // API pública
  global.CommercialProposalDossier = {
    openConfig: openDossierConfigModal,
    generateFromModal: generateFromModal,
    setModalTheme: setModalTheme,
    generate: buildAndOpenDossierWindow
  };

})(typeof window !== 'undefined' ? window : this);
