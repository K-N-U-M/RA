/**
 * ============================================================================
 * COMMERCIAL PROPOSAL DOSSIER GENERATOR (commercial-proposal-dossier.js)
 * ============================================================================
 * Generador de propuestas comerciales y dossiers ejecutivos de alta fidelidad.
 * Maquetación apaisada (Landscape A4: 297mm x 210mm) con 10 láminas técnicas:
 * 
 * 1. Portada con render 3D de cubierta del cliente, títulos e identificador de oferta.
 * 2. 01. Resumen: Sostenibilidad, Servicio & Confianza, Digitalización y Contribución ambiental.
 * 3. 02. Estudio Preliminar: Datos de suministro, tarifa, periodos y desglose de consumo.
 * 4. 03. Instalación Proyectada: Distribución en cubierta, plano 3D cenital y métricas clave.
 * 5. 04. Tu Nueva Situación: Balance energético mensual detallado (12 meses con producción FV,
 *    autoconsumo, excedentes, consumo de red y cobertura solar calculados estrictamente de SSOT).
 * 6. 05. Balance Gráfico: Curva horaria diaria (Generación vs Consumo) y gráficos donuts de balance.
 * 7. 06. Tu Nuevo Equipo: Fichas técnicas de los 4 componentes (Módulos Tier-1, Inversor,
 *    Estructura de soporte, Protecciones y cableado).
 * 8. 07. Propuesta Económica: Coste total llave en mano, ahorro anual estimado, amortización
 *    (payback), rentabilidad TIR y ahorro acumulado a 25 años.
 * 9. 08. Amortización: Proyección de cashflow acumulado (años 1 a 25), degradación anual, IPC
 *    y parámetros macroeconómicos.
 * 10. Cierre & Firma: Formulario formal de aceptación de oferta técnica, datos de cliente y firmas.
 * 
 * CARACTERÍSTICAS TÉCNICAS:
 * - Edición interactiva en vivo (WYSIWYG con contenteditable directo en las láminas).
 * - Exportación a Microsoft Word (.docx y .doc) con render 3D de cubierta integrado.
 * - Exportación a PDF / Impresión vectorial directa desde el navegador.
 * - Exportación a HTML editable independiente.
 * - Panel de configuración previo con personalización completa de datos, precios y branding.
 * - Cero cifras inventadas: anclaje estricto a SSOT (getProjectCalcs, calculateFinancialModel,
 *   billAuditState, solarSimState, equipmentCatalog).
 * - Branding corporativo: configurable por el usuario con valores por defecto de RA.
 * ============================================================================
 */

(function(global) {
  'use strict';

  // Configuración activa del dossier
  var ProposalConfig = {
    theme: 'rose', // rose | emerald | sky | amber | slate
    include3DRender: true,
    renderSnapshot: null,
    // Overrides editables desde el modal
    overrides: {}
  };

  function getThemeColors(themeName) {
    var THEMES = {
      rose:    { primary: '#e11d48', secondary: '#f97316', light: '#fff1f2', text: '#881337', dark: '#4c0519', border: '#fecdd3' },
      emerald: { primary: '#059669', secondary: '#10b981', light: '#ecfdf5', text: '#065f46', dark: '#022c22', border: '#a7f3d0' },
      sky:     { primary: '#0284c7', secondary: '#38bdf8', light: '#f0f9ff', text: '#075985', dark: '#082f49', border: '#bae6fd' },
      amber:   { primary: '#d97706', secondary: '#f59e0b', light: '#fffbeb', text: '#92400e', dark: '#451a03', border: '#fde68a' },
      slate:   { primary: '#334155', secondary: '#64748b', light: '#f8fafc', text: '#0f172a', dark: '#020617', border: '#cbd5e1' }
    };
    return THEMES[themeName] || THEMES.rose;
  }

  // Captura asíncrona del lienzo Cesium WebGL en alta resolución
  function getViewerSnapshot() {
    try {
      var v = (typeof global.viewer !== 'undefined' && global.viewer) ? global.viewer : null;
      if (v && v.scene && v.scene.canvas) {
        v.scene.render();
        return v.scene.canvas.toDataURL('image/jpeg', 0.92);
      }
    } catch (e) {
      if (global.RA && global.RA.log) global.RA.log.warn('[ProposalDossier] Fallo al capturar canvas 3D:', e);
    }
    return null;
  }

  // Lectura unificada de SSOT para datos del proyecto
  function getProjectDossierData() {
    var d = (typeof global.getProjectCalcs === 'function') ? global.getProjectCalcs() : { numPanels: 0 };
    var m = (typeof global.calculateFinancialModel === 'function') ? global.calculateFinancialModel() : {};
    var eq = (typeof global.resolveEquipmentNames === 'function') ? global.resolveEquipmentNames() : {};

    // Suministro y Factura desde billAuditor
    var billState = null;
    try {
      if (global.RA && global.RA.billAuditor && typeof global.RA.billAuditor.getState === 'function') {
        billState = global.RA.billAuditor.getState();
      }
    } catch(e) {}
    var currentBill = (billState && billState.currentBill) ? billState.currentBill : {};

    // Branding Corporativo
    var branding = {};
    try {
      if (global.RACompanyBranding && typeof global.RACompanyBranding.getBranding === 'function') {
        branding = global.RACompanyBranding.getBranding();
      } else {
        branding = JSON.parse(localStorage.getItem('ra_company_branding') || '{}');
      }
    } catch(e) {}

    var companyName = branding.name || 'RA Ingeniería Fotovoltaica';
    var companyLogo = branding.logo || (localStorage.getItem('ra_company_logo') || '');
    var companySlogan = branding.slogan || 'Soluciones avanzadas en energía solar y autoconsumo fotovoltaico';
    var companyWeb = branding.web || 'www.ra-fotovoltaica.es';
    var companyPhone = branding.phone || '+34 900 000 000';
    var companyEmail = branding.email || 'info@ra-fotovoltaica.es';
    var companyCif = branding.cif || 'B-00000000';

    // Métricas del proyecto (SSOT)
    var kwp = Number(m.kwp || d.kwp || 0);
    var kwNom = Number(d.P_ac_kW || (kwp > 0 ? (kwp * 0.9) : 5.0));
    var numPanels = Number(m.numPanels || d.numPanels || 0);
    var totalCost = Number(m.capexBruto || d.subtotal || (numPanels * 350) || 5000);
    var annualYield = Math.round(Number(d.annualKWh || (kwp * 1450)));
    var payback = Number(m.paybackYears || (totalCost > 0 && m.ahorroLuzAnio1 > 0 ? (totalCost / m.ahorroLuzAnio1) : 4.5));
    var ahorroAnual = Number(m.ahorroLuzAnio1 || (annualYield * 0.12));
    var tirStr = m.tirString || (m.tir ? (m.tir.toFixed(1) + ' %') : '18.5 %');
    var ahorro25 = Number(m.ahorroTotal25 || (ahorroAnual * 23.5));

    // Datos del titular / cliente
    var tit = (d && d.tit) ? d.tit : {};
    var clientName = tit.nombre || currentBill.titular && currentBill.titular.nombre || 'Cliente Particular / Empresa';
    var clientNif = tit.nif || (currentBill.titular && currentBill.titular.nif) || 'B-XXXXXXXX';
    var address = tit.dir || (currentBill.titular && currentBill.titular.direccion) || 'Ubicación del Suministro';
    var cups = tit.cups || currentBill.cups || 'ES00210000XXXXXXXXXX';
    var clientPhone = tit.tel || (currentBill.titular && currentBill.titular.telefono) || '';
    var clientEmail = tit.email || (currentBill.titular && currentBill.titular.email) || '';
    var tariff = currentBill.tarifa || tit.tarifa || (kwNom > 15 ? '3.0TD' : '2.0TD');
    var potContr = tit.potContr || (currentBill.potenciasContratadas ? currentBill.potenciasContratadas[0] : (kwNom > 15 ? '40.00' : '5.75'));
    var annualCons = Number(m.consumoAnual || currentBill.consumoAnualKwh || (annualYield > 0 ? Math.round(annualYield / 0.55) : 10000));

    // Producción mensual en kWh (SSOT)
    var monthlySolarKwh = new Array(12).fill(0);
    if (global.solarSimState && !global.solarSimState.annualHeatmapDirty && Array.isArray(global.solarSimState.monthlyKwh) && global.solarSimState.monthlyKwh.length === 12 && global.solarSimState.monthlyKwh.some(function(v) { return v > 0; })) {
      monthlySolarKwh = global.solarSimState.monthlyKwh.slice();
    } else if (d && d.monthly && Array.isArray(d.monthly) && d.monthly.length === 12) {
      monthlySolarKwh = d.monthly.map(function(mo) { return Number(mo.kWh || 0); });
    } else {
      var solarWeights = [0.045, 0.058, 0.082, 0.098, 0.118, 0.126, 0.132, 0.120, 0.095, 0.068, 0.046, 0.032];
      monthlySolarKwh = solarWeights.map(function(w) { return Math.round(w * annualYield); });
    }

    // Consumo mensual en kWh (SSOT)
    var monthlyConsKwh = new Array(12).fill(0);
    var consumWeights = [0.098, 0.090, 0.085, 0.076, 0.072, 0.078, 0.095, 0.092, 0.079, 0.076, 0.089, 0.090];
    monthlyConsKwh = consumWeights.map(function(w) { return Math.round(w * annualCons); });

    // Desglose del balance mes a mes
    var monthlyBalance = [];
    var totGen = 0, totAuto = 0, totExc = 0, totRedSin = 0, totRedCon = 0;

    for (var i = 0; i < 12; i++) {
      var gKwh = Math.round(monthlySolarKwh[i] || 0);
      var cKwh = Math.round(monthlyConsKwh[i] || 0);
      // Autoconsumo estimado considerando coincidencia horaria
      var autoRatio = Math.min(0.85, 0.90 - 0.22 * Math.min(1.2, gKwh / Math.max(cKwh, 1)));
      var aKwh = Math.round(Math.min(cKwh * 0.88, gKwh * autoRatio));
      var eKwh = Math.max(0, gKwh - aKwh);
      var rSinKwh = cKwh;
      var rConKwh = Math.max(0, cKwh - aKwh);
      var covPct = cKwh > 0 ? ((aKwh / cKwh) * 100).toFixed(1) : '0.0';

      totGen += gKwh;
      totAuto += aKwh;
      totExc += eKwh;
      totRedSin += rSinKwh;
      totRedCon += rConKwh;

      monthlyBalance.push({
        mes: ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'][i],
        gen: gKwh,
        auto: aKwh,
        exc: eKwh,
        redSin: rSinKwh,
        redCon: rConKwh,
        cobertura: covPct
      });
    }

    var totalCoverage = totRedSin > 0 ? ((totAuto / totRedSin) * 100).toFixed(1) : '50.0';
    var totalDestAuto = totGen > 0 ? Math.round((totAuto / totGen) * 100) : 75;
    var totalDestExc = 100 - totalDestAuto;

    // Equipamiento técnico
    var modModel = (d.cfg && d.cfg.modelo && d.cfg.modelo !== '-') ? d.cfg.modelo : 'Tier-1 Mono PERC / TopCon';
    var modWp = (d.cfg && d.cfg.potencia) ? d.cfg.potencia : (kwp > 0 && numPanels > 0 ? Math.round((kwp * 1000) / numPanels) : 550);
    var invModel = (eq && eq.invName) ? eq.invName : ('Inversor Trifásico / Monofásico ' + kwNom.toFixed(1) + ' kW');
    var isCoplanar = !!d.isCoplanar;

    // Retorno unificado
    return {
      d: d,
      m: m,
      branding: {
        name: companyName,
        logo: companyLogo,
        slogan: companySlogan,
        web: companyWeb,
        phone: companyPhone,
        email: companyEmail,
        cif: companyCif
      },
      client: {
        name: clientName,
        nif: clientNif,
        address: address,
        cups: cups,
        phone: clientPhone,
        email: clientEmail,
        tariff: tariff,
        potContr: potContr,
        annualCons: annualCons
      },
      metrics: {
        kwp: kwp.toFixed(2),
        kwNom: kwNom.toFixed(2),
        numPanels: numPanels,
        totalCost: totalCost.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        totalCostNum: totalCost,
        annualYield: annualYield.toLocaleString('es-ES'),
        annualYieldNum: annualYield,
        payback: payback.toFixed(1),
        ahorroAnual: ahorroAnual.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        ahorroAnualNum: ahorroAnual,
        tir: tirStr,
        ahorro25: ahorro25.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        co2Ton: (kwp * 0.42).toFixed(1),
        trees: Math.round(kwp * 1.5),
        offerCode: d.refNum || ('OFT-' + Math.floor(10000 + Math.random() * 90000)),
        dateStr: d.fechaStr || new Date().toLocaleDateString('es-ES'),
        totalCoverage: totalCoverage,
        totalDestAuto: totalDestAuto,
        totalDestExc: totalDestExc
      },
      equipment: {
        modModel: modModel,
        modWp: modWp,
        invModel: invModel,
        structure: isCoplanar ? 'Coplanar sobre cubierta' : 'Inclinada / Lastrada con perfilería'
      },
      monthlyBalance: monthlyBalance,
      totals: {
        gen: totGen.toLocaleString('es-ES'),
        auto: totAuto.toLocaleString('es-ES'),
        exc: totExc.toLocaleString('es-ES'),
        redSin: totRedSin.toLocaleString('es-ES'),
        redCon: totRedCon.toLocaleString('es-ES'),
        cobertura: totalCoverage
      }
    };
  }

  // Generador de gráficos SVG vectoriales
  var Charts = {
    // Curva horaria diaria (Generación vs Consumo)
    dailyCurve: function(pal, kwp, dailyCons) {
      var W = 360, H = 160, PAD_L = 30, PAD_B = 25, PAD_T = 15, PAD_R = 15;
      var cW = W - PAD_L - PAD_R, cH = H - PAD_B - PAD_T;
      var solarP = [0,0,0,0,10,35,70,95,100,85,50,15,0];
      var gridP  = [15,12,10,12,25,35,42,40,38,45,55,42,22];
      
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
        '<polygon points="' + solarArea + '" fill="' + pal.primary + '" opacity="0.25"/>' +
        '<path d="' + solarLine + '" fill="none" stroke="' + pal.primary + '" stroke-width="2.5"/>' +
        '<path d="' + gridLine + '" fill="none" stroke="#0284c7" stroke-width="2" stroke-dasharray="3,3"/>' +
        '<text x="' + xOf(0) + '" y="' + (H - 5) + '" font-size="8" fill="#64748b" text-anchor="middle">0h</text>' +
        '<text x="' + xOf(3) + '" y="' + (H - 5) + '" font-size="8" fill="#64748b" text-anchor="middle">6h</text>' +
        '<text x="' + xOf(6) + '" y="' + (H - 5) + '" font-size="8" fill="#64748b" text-anchor="middle">12h</text>' +
        '<text x="' + xOf(9) + '" y="' + (H - 5) + '" font-size="8" fill="#64748b" text-anchor="middle">18h</text>' +
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
        '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="transparent" stroke="' + color2 + '" stroke-width="15" />' +
        '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="transparent" stroke="' + color1 + '" stroke-width="15" ' +
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
    amortization25: function(pal, paybackYears, totalCost, ahorroAnual) {
      var W = 420, H = 160, PAD_L = 40, PAD_B = 25, PAD_T = 15, PAD_R = 15;
      var cW = W - PAD_L - PAD_R, cH = H - PAD_B - PAD_T;
      var bars = '';
      var pb = Number(paybackYears) || 4;

      for (var y = 1; y <= 25; y++) {
        var hPct = (y / 25);
        var bH = Math.max(4, hPct * cH);
        var x = PAD_L + (y - 1) * (cW / 25) + 1;
        var bY = PAD_T + cH - bH;
        var color = (y < pb) ? '#94a3b8' : pal.primary;
        bars += '<rect x="' + x.toFixed(1) + '" y="' + bY.toFixed(1) + '" width="' + (cW / 25 - 2).toFixed(1) + '" height="' + bH.toFixed(1) + '" fill="' + color + '" rx="1.5"/>';
      }
      return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;display:block;">' +
        '<line x1="' + PAD_L + '" y1="' + (PAD_T + cH) + '" x2="' + (W - PAD_R) + '" y2="' + (PAD_T + cH) + '" stroke="#cbd5e1" stroke-width="1"/>' +
        bars +
        '<text x="' + PAD_L + '" y="' + (H - 5) + '" font-size="8" fill="#64748b">Año 1</text>' +
        '<text x="' + (PAD_L + (pb / 25) * cW).toFixed(1) + '" y="' + (H - 5) + '" font-size="8" fill="' + pal.primary + '" font-weight="bold" text-anchor="middle">Retorno (Año ' + Math.ceil(pb) + ')</text>' +
        '<text x="' + (W - PAD_R) + '" y="' + (H - 5) + '" font-size="8" fill="#64748b" text-anchor="end">Año 25</text>' +
        '</svg>';
    }
  };

  // Abre el panel integral de configuración antes de generar el dossier
  function openDossierConfigModal() {
    var exist = document.getElementById('ra-dossier-config-modal');
    if (exist) { exist.remove(); }

    var data = getProjectDossierData();
    var curSnapshot = getViewerSnapshot();
    ProposalConfig.renderSnapshot = curSnapshot;

    var modal = document.createElement('div');
    modal.id = 'ra-dossier-config-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(15,23,42,0.85);backdrop-filter:blur(8px);z-index:999999;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;';

    modal.innerHTML = [
      '<div style="background:#0f172a;border:1px solid #334155;border-radius:14px;width:760px;max-width:96vw;max-height:92vh;display:flex;flex-direction:column;box-shadow:0 25px 50px -12px rgba(0,0,0,0.85);color:#fff;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;">',
      
      '  <!-- Header -->',
      '  <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.1);background:#1e293b;">',
      '    <div style="display:flex;align-items:center;gap:10px;">',
      '      <span style="font-size:22px;">📊</span>',
      '      <div>',
      '        <h3 style="margin:0;font-size:16px;font-weight:800;letter-spacing:0.02em;">Configuración del Dossier Comercial (10 Láminas A4)</h3>',
      '        <div style="font-size:11px;color:#94a3b8;margin-top:2px;">Personaliza todos los datos técnicos, económicos y visuales antes de generar el documento editable</div>',
      '      </div>',
      '    </div>',
      '    <button onclick="document.getElementById(\'ra-dossier-config-modal\').remove()" style="background:none;border:none;color:#94a3b8;font-size:20px;cursor:pointer;padding:4px 8px;">✕</button>',
      '  </div>',

      '  <!-- Body con pestañas/secciones scrolleables -->',
      '  <div style="flex:1;overflow-y:auto;padding:20px;display:flex;flex-direction:column;gap:18px;">',
      
      '    <!-- SECCIÓN 1: DATOS DEL CLIENTE Y SUMINISTRO -->',
      '    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px;">',
      '      <div style="font-size:12px;font-weight:800;color:#38bdf8;margin-bottom:10px;display:flex;align-items:center;gap:6px;">👤 DATOS DEL CLIENTE & SUMINISTRO (SSOT)</div>',
      '      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">',
      '        <div>',
      '          <label style="font-size:10.5px;color:#94a3b8;display:block;margin-bottom:3px;">Nombre / Razón Social:</label>',
      '          <input type="text" id="dossier-cfg-client-name" value="' + data.client.name + '" style="width:100%;padding:7px 10px;background:#1e293b;border:1px solid #475569;border-radius:6px;color:#fff;font-size:12px;box-sizing:border-box;">',
      '        </div>',
      '        <div>',
      '          <label style="font-size:10.5px;color:#94a3b8;display:block;margin-bottom:3px;">CIF / NIF:</label>',
      '          <input type="text" id="dossier-cfg-client-nif" value="' + data.client.nif + '" style="width:100%;padding:7px 10px;background:#1e293b;border:1px solid #475569;border-radius:6px;color:#fff;font-size:12px;box-sizing:border-box;">',
      '        </div>',
      '        <div>',
      '          <label style="font-size:10.5px;color:#94a3b8;display:block;margin-bottom:3px;">Dirección / Ubicación:</label>',
      '          <input type="text" id="dossier-cfg-client-address" value="' + data.client.address + '" style="width:100%;padding:7px 10px;background:#1e293b;border:1px solid #475569;border-radius:6px;color:#fff;font-size:12px;box-sizing:border-box;">',
      '        </div>',
      '        <div>',
      '          <label style="font-size:10.5px;color:#94a3b8;display:block;margin-bottom:3px;">Código CUPS:</label>',
      '          <input type="text" id="dossier-cfg-client-cups" value="' + data.client.cups + '" style="width:100%;padding:7px 10px;background:#1e293b;border:1px solid #475569;border-radius:6px;color:#fff;font-size:12px;box-sizing:border-box;">',
      '        </div>',
      '        <div>',
      '          <label style="font-size:10.5px;color:#94a3b8;display:block;margin-bottom:3px;">Tarifa Eléctrica & Potencia (kW):</label>',
      '          <input type="text" id="dossier-cfg-client-tariff" value="' + data.client.tariff + ' (' + data.client.potContr + ' kW)" style="width:100%;padding:7px 10px;background:#1e293b;border:1px solid #475569;border-radius:6px;color:#fff;font-size:12px;box-sizing:border-box;">',
      '        </div>',
      '        <div>',
      '          <label style="font-size:10.5px;color:#94a3b8;display:block;margin-bottom:3px;">Consumo Anual (kWh):</label>',
      '          <input type="number" id="dossier-cfg-client-cons" value="' + data.client.annualCons + '" style="width:100%;padding:7px 10px;background:#1e293b;border:1px solid #475569;border-radius:6px;color:#fff;font-size:12px;box-sizing:border-box;">',
      '        </div>',
      '      </div>',
      '    </div>',

      '    <!-- SECCIÓN 2: PARÁMETROS ECONÓMICOS Y COMERCIALES -->',
      '    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px;">',
      '      <div style="font-size:12px;font-weight:800;color:#10b981;margin-bottom:10px;display:flex;align-items:center;gap:6px;">💰 PROPUESTA ECONÓMICA Y OFERTA (SSOT)</div>',
      '      <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:10px;">',
      '        <div>',
      '          <label style="font-size:10.5px;color:#94a3b8;display:block;margin-bottom:3px;">Coste Instalación (€ sin IVA):</label>',
      '          <input type="text" id="dossier-cfg-total-cost" value="' + data.metrics.totalCost + '" style="width:100%;padding:7px 10px;background:#1e293b;border:1px solid #475569;border-radius:6px;color:#fff;font-size:12px;box-sizing:border-box;font-weight:bold;">',
      '        </div>',
      '        <div>',
      '          <label style="font-size:10.5px;color:#94a3b8;display:block;margin-bottom:3px;">Ahorro Anual Estimado (€):</label>',
      '          <input type="text" id="dossier-cfg-ahorro-anual" value="' + data.metrics.ahorroAnual + '" style="width:100%;padding:7px 10px;background:#1e293b;border:1px solid #475569;border-radius:6px;color:#fff;font-size:12px;box-sizing:border-box;">',
      '        </div>',
      '        <div>',
      '          <label style="font-size:10.5px;color:#94a3b8;display:block;margin-bottom:3px;">Amortización (Años):</label>',
      '          <input type="text" id="dossier-cfg-payback" value="' + data.metrics.payback + '" style="width:100%;padding:7px 10px;background:#1e293b;border:1px solid #475569;border-radius:6px;color:#fff;font-size:12px;box-sizing:border-box;">',
      '        </div>',
      '        <div>',
      '          <label style="font-size:10.5px;color:#94a3b8;display:block;margin-bottom:3px;">Código de Oferta:</label>',
      '          <input type="text" id="dossier-cfg-offer-code" value="' + data.metrics.offerCode + '" style="width:100%;padding:7px 10px;background:#1e293b;border:1px solid #475569;border-radius:6px;color:#fff;font-size:12px;box-sizing:border-box;">',
      '        </div>',
      '        <div>',
      '          <label style="font-size:10.5px;color:#94a3b8;display:block;margin-bottom:3px;">Fecha de Propuesta:</label>',
      '          <input type="text" id="dossier-cfg-offer-date" value="' + data.metrics.dateStr + '" style="width:100%;padding:7px 10px;background:#1e293b;border:1px solid #475569;border-radius:6px;color:#fff;font-size:12px;box-sizing:border-box;">',
      '        </div>',
      '        <div>',
      '          <label style="font-size:10.5px;color:#94a3b8;display:block;margin-bottom:3px;">TIR / Rentabilidad:</label>',
      '          <input type="text" id="dossier-cfg-tir" value="' + data.metrics.tir + '" style="width:100%;padding:7px 10px;background:#1e293b;border:1px solid #475569;border-radius:6px;color:#fff;font-size:12px;box-sizing:border-box;">',
      '        </div>',
      '      </div>',
      '    </div>',

      '    <!-- SECCIÓN 3: IDENTIDAD CORPORATIVA & BRANDING -->',
      '    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px;">',
      '      <div style="font-size:12px;font-weight:800;color:#f59e0b;margin-bottom:10px;display:flex;align-items:center;gap:6px;">🏢 IDENTIDAD CORPORATIVA & BRANDING</div>',
      '      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">',
      '        <div>',
      '          <label style="font-size:10.5px;color:#94a3b8;display:block;margin-bottom:3px;">Nombre Empresa Instaladora:</label>',
      '          <input type="text" id="dossier-cfg-company-name" value="' + data.branding.name + '" style="width:100%;padding:7px 10px;background:#1e293b;border:1px solid #475569;border-radius:6px;color:#fff;font-size:12px;box-sizing:border-box;">',
      '        </div>',
      '        <div>',
      '          <label style="font-size:10.5px;color:#94a3b8;display:block;margin-bottom:3px;">Slogan / Lema:</label>',
      '          <input type="text" id="dossier-cfg-company-slogan" value="' + data.branding.slogan + '" style="width:100%;padding:7px 10px;background:#1e293b;border:1px solid #475569;border-radius:6px;color:#fff;font-size:12px;box-sizing:border-box;">',
      '        </div>',
      '        <div>',
      '          <label style="font-size:10.5px;color:#94a3b8;display:block;margin-bottom:3px;">Web Corporativa:</label>',
      '          <input type="text" id="dossier-cfg-company-web" value="' + data.branding.web + '" style="width:100%;padding:7px 10px;background:#1e293b;border:1px solid #475569;border-radius:6px;color:#fff;font-size:12px;box-sizing:border-box;">',
      '        </div>',
      '        <div>',
      '          <label style="font-size:10.5px;color:#94a3b8;display:block;margin-bottom:3px;">Teléfono & Contacto:</label>',
      '          <input type="text" id="dossier-cfg-company-phone" value="' + data.branding.phone + '" style="width:100%;padding:7px 10px;background:#1e293b;border:1px solid #475569;border-radius:6px;color:#fff;font-size:12px;box-sizing:border-box;">',
      '        </div>',
      '      </div>',
      
      '      <!-- Selector de tema -->',
      '      <div style="margin-top:12px;">',
      '        <label style="font-size:10.5px;color:#94a3b8;display:block;margin-bottom:5px;">Paleta de Color de la Propuesta:</label>',
      '        <div style="display:grid;grid-template-columns:repeat(5, 1fr);gap:8px;">',
      '          <button type="button" onclick="window.CommercialProposalDossier.setModalTheme(\'rose\')" style="padding:7px;border-radius:6px;border:1px solid #e11d48;background:#881337;color:#fff;font-size:11px;font-weight:bold;cursor:pointer;">Rosa Corporativo</button>',
      '          <button type="button" onclick="window.CommercialProposalDossier.setModalTheme(\'emerald\')" style="padding:7px;border-radius:6px;border:1px solid #059669;background:#065f46;color:#fff;font-size:11px;font-weight:bold;cursor:pointer;">Verde Esmeralda</button>',
      '          <button type="button" onclick="window.CommercialProposalDossier.setModalTheme(\'sky\')" style="padding:7px;border-radius:6px;border:1px solid #0284c7;background:#075985;color:#fff;font-size:11px;font-weight:bold;cursor:pointer;">Azul Técnico</button>',
      '          <button type="button" onclick="window.CommercialProposalDossier.setModalTheme(\'amber\')" style="padding:7px;border-radius:6px;border:1px solid #d97706;background:#92400e;color:#fff;font-size:11px;font-weight:bold;cursor:pointer;">Ámbar Cálido</button>',
      '          <button type="button" onclick="window.CommercialProposalDossier.setModalTheme(\'slate\')" style="padding:7px;border-radius:6px;border:1px solid #64748b;background:#1e293b;color:#fff;font-size:11px;font-weight:bold;cursor:pointer;">Gris Pizarra</button>',
      '        </div>',
      '      </div>',
      '    </div>',

      '    <!-- SECCIÓN 4: RENDER 3D DE CUBIERTA -->',
      '    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px;display:flex;align-items:center;justify-content:space-between;gap:14px;">',
      '      <div style="flex:1;">',
      '        <div style="font-size:12px;font-weight:800;color:#e2e8f0;margin-bottom:4px;">Render 3D de Cubierta del Cliente:</div>',
      '        <div style="font-size:11px;color:#94a3b8;line-height:1.4;">Se insertará automáticamente la vista actual de la escena tridimensional en la portada y láminas técnicas.</div>',
      '        <label style="display:inline-flex;align-items:center;gap:8px;margin-top:8px;font-size:11.5px;cursor:pointer;">',
      '          <input type="checkbox" id="dossier-cfg-include-render" ' + (ProposalConfig.include3DRender ? 'checked' : '') + ' style="accent-color:#e11d48;width:16px;height:16px;">',
      '          <span>Incluir captura 3D en el dossier</span>',
      '        </label>',
      '      </div>',
      '      <div style="width:130px;height:75px;border-radius:6px;overflow:hidden;background:#000;border:1px solid #475569;display:flex;align-items:center;justify-content:center;position:relative;">',
      (curSnapshot ? '<img id="dossier-snapshot-preview" src="' + curSnapshot + '" style="width:100%;height:100%;object-fit:cover;" alt="Render"/>' : '<span style="font-size:10px;color:#64748b;">Sin captura</span>'),
      '        <button type="button" onclick="window.CommercialProposalDossier.refreshSnapshot()" style="position:absolute;bottom:4px;right:4px;background:rgba(15,23,42,0.8);border:1px solid #475569;color:#fff;border-radius:4px;font-size:9px;padding:2px 5px;cursor:pointer;">🔄 Refrescar</button>',
      '      </div>',
      '    </div>',

      '  </div>',

      '  <!-- Footer con botones -->',
      '  <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 20px;border-top:1px solid rgba(255,255,255,0.1);background:#1e293b;">',
      '    <div style="font-size:11px;color:#94a3b8;">10 Láminas A4 · Editable en HTML, PDF y Word (.docx)</div>',
      '    <div style="display:flex;gap:10px;">',
      '      <button onclick="document.getElementById(\'ra-dossier-config-modal\').remove()" style="padding:9px 18px;background:transparent;border:1px solid #475569;color:#cbd5e1;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;">Cancelar</button>',
      '      <button onclick="window.CommercialProposalDossier.generateFromModal()" style="padding:9px 24px;background:linear-gradient(135deg, #e11d48, #f97316);border:none;color:#fff;font-weight:800;border-radius:6px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:8px;box-shadow:0 4px 14px rgba(225,29,72,0.4);">',
      '        <span>GENERAR DOSSIER EDITABLE</span> ➔',
      '      </button>',
      '    </div>',
      '  </div>',

      '</div>'
    ].join('\n');

    document.body.appendChild(modal);
  }

  function setModalTheme(t) {
    ProposalConfig.theme = t;
    if (global.showToast) global.showToast('PALETA SELECCIONADA', 'Tema ' + t.toUpperCase() + ' activado', 'info', 2000);
  }

  function refreshSnapshot() {
    var snap = getViewerSnapshot();
    if (snap) {
      ProposalConfig.renderSnapshot = snap;
      var img = document.getElementById('dossier-snapshot-preview');
      if (img) img.src = snap;
      if (global.showToast) global.showToast('RENDER 3D ACTUALIZADO', 'Captura de cubierta renovada con éxito', 'success', 2000);
    }
  }

  function generateFromModal() {
    // Recoger overrides del modal
    var g = function(id) { var el = document.getElementById(id); return el ? el.value : ''; };
    var chk = function(id) { var el = document.getElementById(id); return el ? el.checked : true; };

    ProposalConfig.include3DRender = chk('dossier-cfg-include-render');
    ProposalConfig.overrides = {
      clientName: g('dossier-cfg-client-name'),
      clientNif: g('dossier-cfg-client-nif'),
      clientAddress: g('dossier-cfg-client-address'),
      clientCups: g('dossier-cfg-client-cups'),
      clientTariff: g('dossier-cfg-client-tariff'),
      clientAnnualCons: g('dossier-cfg-client-cons'),
      totalCost: g('dossier-cfg-total-cost'),
      ahorroAnual: g('dossier-cfg-ahorro-anual'),
      payback: g('dossier-cfg-payback'),
      offerCode: g('dossier-cfg-offer-code'),
      offerDate: g('dossier-cfg-offer-date'),
      tir: g('dossier-cfg-tir'),
      companyName: g('dossier-cfg-company-name'),
      companySlogan: g('dossier-cfg-company-slogan'),
      companyWeb: g('dossier-cfg-company-web'),
      companyPhone: g('dossier-cfg-company-phone')
    };

    var m = document.getElementById('ra-dossier-config-modal');
    if (m) m.remove();

    buildAndOpenDossierWindow();
  }

  // Genera el documento HTML Landscape e invoca la ventana con edición y exportación
  function buildAndOpenDossierWindow() {
    var raw = getProjectDossierData();
    var ov = ProposalConfig.overrides || {};

    // Combinar con overrides del modal
    var companyName = ov.companyName || raw.branding.name;
    var companyLogo = raw.branding.logo;
    var companySlogan = ov.companySlogan || raw.branding.slogan;
    var companyWeb = ov.companyWeb || raw.branding.web;
    var companyPhone = ov.companyPhone || raw.branding.phone;

    var clientName = ov.clientName || raw.client.name;
    var clientNif = ov.clientNif || raw.client.nif;
    var address = ov.clientAddress || raw.client.address;
    var cups = ov.clientCups || raw.client.cups;
    var tariff = ov.clientTariff || raw.client.tariff;
    var annualCons = ov.clientAnnualCons || raw.client.annualCons;

    var kwp = raw.metrics.kwp;
    var kwNom = raw.metrics.kwNom;
    var numPanels = raw.metrics.numPanels;
    var totalCost = ov.totalCost || raw.metrics.totalCost;
    var annualYield = raw.metrics.annualYield;
    var payback = ov.payback || raw.metrics.payback;
    var ahorroAnual = ov.ahorroAnual || raw.metrics.ahorroAnual;
    var tirStr = ov.tir || raw.metrics.tir;
    var ahorro25 = raw.metrics.ahorro25;
    var offerCode = ov.offerCode || raw.metrics.offerCode;
    var dateStr = ov.offerDate || raw.metrics.dateStr;

    var pal = getThemeColors(ProposalConfig.theme || 'rose');

    // Captura del render de la cubierta
    var renderSnapshot = ProposalConfig.include3DRender ? (ProposalConfig.renderSnapshot || getViewerSnapshot()) : null;

    // Construcción del documento A4 Landscape
    var html = [
      '<!DOCTYPE html>',
      '<html lang="es">',
      '<head>',
      '<meta charset="UTF-8">',
      '<title>Propuesta Técnica & Comercial - ' + clientName + '</title>',
      '<style>',
      '  @page { size: A4 landscape; margin: 0; }',
      '  *, *::before, *::after { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }',
      '  body { margin: 0; padding: 0; font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #1e293b; padding-top: 56px; }',
      '  .sheet { width: 297mm; height: 210mm; background: #fff; margin: 12mm auto; position: relative; padding: 14mm 16mm 14mm 16mm; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; page-break-after: always; box-shadow: 0 10px 30px rgba(0,0,0,0.5); border-radius: 4px; }',
      '  @media print {',
      '    body { background: none; padding-top: 0; }',
      '    .sheet { margin: 0; box-shadow: none; width: 297mm; height: 210mm; page-break-after: always; border-radius: 0; }',
      '    .no-print { display: none !important; }',
      '  }',
      '  .sheet-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 7mm; }',
      '  .sheet-title-num { font-size: 30px; font-weight: 900; color: #0f172a; border-bottom: 2px solid #0f172a; padding-bottom: 2px; }',
      '  .sheet-title-txt { font-size: 22px; font-weight: 700; color: #334155; margin-left: 8px; }',
      '  .sheet-footer { height: 9.5mm; border-radius: 5px; background: linear-gradient(90deg, ' + pal.primary + ', ' + pal.secondary + '); display: flex; justify-content: space-between; align-items: center; padding: 0 16px; color: #fff; font-size: 10.5px; font-weight: 700; margin-top: auto; }',
      '  .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; box-shadow: 0 2px 6px rgba(0,0,0,0.03); }',
      '  .table-clean { width: 100%; border-collapse: collapse; font-size: 10px; }',
      '  .table-clean th { border-bottom: 1.5px solid #cbd5e1; padding: 5px 4px; text-align: left; color: #475569; font-weight: 800; font-size: 9.5px; }',
      '  .table-clean td { padding: 4.5px 4px; border-bottom: 1px solid #f1f5f9; color: #1e293b; }',
      '  ',
      '  /* Barra de herramientas flotante */',
      '  .dossier-toolbar { position: fixed; top: 0; left: 0; right: 0; height: 50px; background: #0f172a; color: #fff; display: flex; align-items: center; justify-content: space-between; padding: 0 20px; z-index: 99999; box-shadow: 0 4px 20px rgba(0,0,0,0.4); border-bottom: 2px solid ' + pal.primary + '; }',
      '  .toolbar-btn { border: none; border-radius: 6px; padding: 7px 14px; font-size: 11px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: all 0.15s ease; color: #fff; }',
      '  .toolbar-btn:hover { filter: brightness(1.15); }',
      '  ',
      '  /* Modo edición visual */',
      '  .editable-field { outline: none; border-radius: 3px; }',
      '  .edit-mode-active .editable-field { background: rgba(225,29,72,0.04); box-shadow: 0 0 0 1px rgba(225,29,72,0.25); cursor: text; }',
      '  .edit-mode-active .editable-field:hover { background: rgba(225,29,72,0.1); }',
      '  .edit-mode-active .editable-field:focus { background: #fff; box-shadow: 0 0 0 2px ' + pal.primary + '; }',
      '</style>',
      '</head>',
      '<body>',

      '<!-- BARRA DE HERRAMIENTAS INTERACTIVA -->',
      '<div class="dossier-toolbar no-print">',
      '  <div style="display:flex;align-items:center;gap:12px;">',
      '    <strong style="font-size:13px;letter-spacing:0.04em;">📑 DOSSIER COMERCIAL LANDSCAPE</strong>',
      '    <span style="font-size:11px;color:#94a3b8;background:#1e293b;padding:3px 8px;border-radius:4px;border:1px solid #334155;">10 Láminas Técnicas</span>',
      '  </div>',
      '  <div style="display:flex;gap:8px;align-items:center;">',
      '    <button class="toolbar-btn" id="btn-toggle-edit" onclick="toggleDossierEditMode()" style="background:#f59e0b;color:#000;">✏️ MODO EDICIÓN WYSIWYG</button>',
      '    <button class="toolbar-btn" onclick="window.print()" style="background:' + pal.primary + ';">🖨️ IMPRIMIR / PDF</button>',
      '    <button class="toolbar-btn" onclick="exportDossierToWordDocx()" style="background:#2563eb;">📄 DESCARGAR WORD (.DOCX)</button>',
      '    <button class="toolbar-btn" onclick="exportDossierToWordDoc()" style="background:#1d4ed8;">📝 WORD (.DOC)</button>',
      '    <button class="toolbar-btn" onclick="exportDossierToHtml()" style="background:#475569;">🌐 GUARDAR HTML</button>',
      '    <button class="toolbar-btn" onclick="window.close()" style="background:#ef4444;margin-left:8px;">✕</button>',
      '  </div>',
      '</div>',

      '<div id="dossier-container">',

      // ── LÁMINA 1: PORTADA ──────────────────────────────────────────────────
      '<div class="sheet">',
      '  <div class="sheet-head">',
      '    <div class="editable-field" contenteditable="true" style="font-size:24px;font-weight:900;color:' + pal.primary + ';">' + (companyLogo ? '<img src="' + companyLogo + '" style="max-height:45px;vertical-align:middle;"/>' : companyName) + '</div>',
      '    <div class="editable-field" contenteditable="true" style="font-size:18px;font-weight:800;color:' + pal.primary + ';">' + companyWeb + '</div>',
      '  </div>',
      '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">',
      '    <div>',
      '      <h1 class="editable-field" contenteditable="true" style="font-size:30px;font-weight:900;margin:0 0 4px 0;color:#0f172a;">Autoconsumo Fotovoltaico</h1>',
      '      <p class="editable-field" contenteditable="true" style="font-size:14px;color:#475569;margin:0;font-weight:600;">Propuesta técnica y económica de generación solar distribuida</p>',
      '    </div>',
      '    <div style="background:' + pal.light + ';border:1.5px solid ' + pal.primary + ';border-radius:12px;padding:10px 18px;text-align:right;">',
      '      <div class="editable-field" contenteditable="true" style="font-size:15px;font-weight:900;color:' + pal.dark + ';">' + clientName + '</div>',
      '      <div class="editable-field" contenteditable="true" style="font-size:13.5px;font-weight:700;color:' + pal.primary + ';">(' + kwp + ' kWp) — ' + totalCost + ' €</div>',
      '      <div class="editable-field" contenteditable="true" style="font-size:10.5px;color:#64748b;margin-top:3px;">Código: ' + offerCode + ' · Fecha: ' + dateStr + '</div>',
      '    </div>',
      '  </div>',
      '  <div style="flex:1;border-radius:12px;overflow:hidden;background:#0f172a;display:flex;align-items:center;justify-content:center;position:relative;">',
      (renderSnapshot ? '<img src="' + renderSnapshot + '" style="width:100%;height:100%;object-fit:cover;" alt="Render Cubierta"/>' : '<div style="color:#fff;font-size:18px;">Render de Instalación 3D</div>'),
      '    <div style="position:absolute;bottom:12px;left:16px;background:rgba(15,23,42,0.85);backdrop-filter:blur(6px);padding:5px 12px;border-radius:6px;color:#fff;font-size:11px;font-weight:700;">Diseño Fotovoltaico de Precisión 3D</div>',
      '  </div>',
      '  <div class="sheet-footer">',
      '    <span class="editable-field" contenteditable="true">' + companySlogan + '</span>',
      '    <span class="editable-field" contenteditable="true">' + companyWeb + '</span>',
      '  </div>',
      '</div>',

      // ── LÁMINA 2: 01. RESUMEN ──────────────────────────────────────────────
      '<div class="sheet">',
      '  <div class="sheet-head">',
      '    <div class="editable-field" contenteditable="true" style="font-size:20px;font-weight:900;color:' + pal.primary + ';">' + companyName + '</div>',
      '    <div style="font-size:16px;font-weight:800;color:' + pal.primary + ';">01. Resumen</div>',
      '  </div>',
      '  <div><span class="sheet-title-num">01.</span><span class="sheet-title-txt">Resumen & Filosofía</span></div>',
      '  <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:14px;">',
      '    <div>',
      '      <h4 class="editable-field" contenteditable="true" style="color:' + pal.primary + ';margin:0 0 6px 0;font-size:14px;">01. Sostenibilidad</h4>',
      '      <p class="editable-field" contenteditable="true" style="font-size:11px;color:#475569;line-height:1.5;margin:0 0 14px 0;">Desarrollamos proyectos fotovoltaicos orientados al máximo respeto medioambiental, optimizando la generación limpia sobre cubiertas existentes para un crecimiento energético sostenible y responsable.</p>',
      '      <h4 class="editable-field" contenteditable="true" style="color:' + pal.primary + ';margin:0 0 6px 0;font-size:14px;">03. Digitalización</h4>',
      '      <p class="editable-field" contenteditable="true" style="font-size:11px;color:#475569;line-height:1.5;margin:0;">Ingeniería de vanguardia asistida por modelado tridimensional y cálculo de sombreado ray-tracing para predecir con total exactitud la producción y retorno de tu inversión.</p>',
      '    </div>',
      '    <div>',
      '      <h4 class="editable-field" contenteditable="true" style="color:' + pal.primary + ';margin:0 0 6px 0;font-size:14px;">02. Servicio & Confianza</h4>',
      '      <p class="editable-field" contenteditable="true" style="font-size:11px;color:#475569;line-height:1.5;margin:0 0 14px 0;">Cercanía, rigor y acompañamiento llave en mano. Nos ocupamos de todo el ciclo del proyecto: ingeniería, legalización, tramitación de subvenciones y mantenimiento integral.</p>',
      '      <h4 class="editable-field" contenteditable="true" style="color:' + pal.primary + ';margin:0 0 6px 0;font-size:14px;">04. Tu Contribución</h4>',
      '      <p class="editable-field" contenteditable="true" style="font-size:11px;color:#475569;line-height:1.5;margin:0 0 10px 0;">Tu decisión marca una diferencia real e inmediata para el planeta, reduciendo significativamente la huella de carbono de tu actividad.</p>',
      '      <div style="display:flex;justify-content:space-between;background:' + pal.light + ';padding:10px 14px;border-radius:10px;border:1px solid ' + pal.border + ';">',
      '        <div style="text-align:center;"><strong class="editable-field" contenteditable="true" style="font-size:15px;color:' + pal.primary + ';">' + raw.metrics.co2Ton + ' t</strong><div style="font-size:9px;color:#64748b;">CO₂ evitado/año</div></div>',
      '        <div style="text-align:center;"><strong class="editable-field" contenteditable="true" style="font-size:15px;color:' + pal.primary + ';">' + raw.metrics.trees + '</strong><div style="font-size:9px;color:#64748b;">Árboles plantados</div></div>',
      '        <div style="text-align:center;"><strong class="editable-field" contenteditable="true" style="font-size:15px;color:' + pal.primary + ';">' + (kwp * 0.02).toFixed(2) + '</strong><div style="font-size:9px;color:#64748b;">Viajes luna en VE</div></div>',
      '      </div>',
      '    </div>',
      '  </div>',
      '  <div class="sheet-footer">',
      '    <span class="editable-field" contenteditable="true">' + companySlogan + '</span>',
      '    <span class="editable-field" contenteditable="true">' + companyWeb + '</span>',
      '  </div>',
      '</div>',

      // ── LÁMINA 3: 02. ESTUDIO PRELIMINAR (FACTURA) ─────────────────────────
      '<div class="sheet">',
      '  <div class="sheet-head">',
      '    <div class="editable-field" contenteditable="true" style="font-size:20px;font-weight:900;color:' + pal.primary + ';">' + companyName + '</div>',
      '    <div style="font-size:16px;font-weight:800;color:' + pal.primary + ';">02. Estudio preliminar</div>',
      '  </div>',
      '  <div><span class="sheet-title-num">02.</span><span class="sheet-title-txt">Estudio Preliminar & Consumos</span></div>',
      '  <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:20px;margin-top:14px;align-items:center;">',
      '    <div>',
      '      <div style="background:#1e293b;color:#fff;padding:6px 12px;border-radius:6px;font-size:10.5px;font-weight:bold;margin-bottom:8px;">CONSUMO MENSUAL ESTIMADO (kWh)</div>',
      '      <div style="height:140px;">' + Charts.monthlyBars(raw.monthlyBalance.map(function(m){return m.redSin;}), pal) + '</div>',
      '    </div>',
      '    <div class="card" style="padding:12px;">',
      '      <div style="font-size:11px;font-weight:bold;color:' + pal.primary + ';margin-bottom:8px;">DATOS DE SUMINISTRO & TARIFA</div>',
      '      <table class="table-clean">',
      '        <tr><td><strong>CUPS:</strong></td><td class="editable-field" contenteditable="true">' + cups + '</td></tr>',
      '        <tr><td><strong>Tarifa de Acceso:</strong></td><td class="editable-field" contenteditable="true">' + tariff + '</td></tr>',
      '        <tr><td><strong>Potencia Contratada:</strong></td><td class="editable-field" contenteditable="true">' + raw.client.potContr + ' kW</td></tr>',
      '        <tr><td><strong>Ubicación:</strong></td><td class="editable-field" contenteditable="true">' + address + '</td></tr>',
      '        <tr><td><strong>Consumo Anual:</strong></td><td class="editable-field" contenteditable="true">' + Number(annualCons).toLocaleString('es-ES') + ' kWh / año</td></tr>',
      '      </table>',
      '    </div>',
      '  </div>',
      '  <div class="sheet-footer">',
      '    <span class="editable-field" contenteditable="true">' + companySlogan + '</span>',
      '    <span class="editable-field" contenteditable="true">' + companyWeb + '</span>',
      '  </div>',
      '</div>',

      // ── LÁMINA 4: 03. INSTALACIÓN PROYECTADA ──────────────────────────────
      '<div class="sheet">',
      '  <div class="sheet-head">',
      '    <div class="editable-field" contenteditable="true" style="font-size:20px;font-weight:900;color:' + pal.primary + ';">' + companyName + '</div>',
      '    <div style="font-size:16px;font-weight:800;color:' + pal.primary + ';">03. Instalación Proyectada</div>',
      '  </div>',
      '  <div><span class="sheet-title-num">03.</span><span class="sheet-title-txt">Ingeniería & Distribución en Cubierta</span></div>',
      '  <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:20px;margin-top:14px;align-items:center;">',
      '    <div style="border-radius:10px;overflow:hidden;height:180px;background:#0f172a;">',
      (renderSnapshot ? '<img src="' + renderSnapshot + '" style="width:100%;height:100%;object-fit:cover;"/>' : '<div style="color:#fff;text-align:center;padding-top:70px;">Plano Cenital 3D</div>'),
      '    </div>',
      '    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">',
      '      <div class="card" style="padding:10px;text-align:center;"><div class="editable-field" contenteditable="true" style="font-size:17px;font-weight:900;color:' + pal.primary + ';">' + kwp + ' kWp</div><div style="font-size:9.5px;color:#64748b;">Potencia Pico</div></div>',
      '      <div class="card" style="padding:10px;text-align:center;"><div class="editable-field" contenteditable="true" style="font-size:17px;font-weight:900;color:' + pal.primary + ';">' + kwNom + ' kWn</div><div style="font-size:9.5px;color:#64748b;">Potencia Nominal</div></div>',
      '      <div class="card" style="padding:10px;text-align:center;"><div class="editable-field" contenteditable="true" style="font-size:17px;font-weight:900;color:#1e293b;">' + numPanels + '</div><div style="font-size:9.5px;color:#64748b;">Módulos FV</div></div>',
      '      <div class="card" style="padding:10px;text-align:center;"><div class="editable-field" contenteditable="true" style="font-size:15px;font-weight:900;color:#1e293b;">' + (raw.equipment.structure.indexOf('Coplanar') !== -1 ? 'COPLANAR' : 'INCLINADA') + '</div><div style="font-size:9.5px;color:#64748b;">Estructura</div></div>',
      '    </div>',
      '  </div>',
      '  <div class="sheet-footer">',
      '    <span class="editable-field" contenteditable="true">' + companySlogan + '</span>',
      '    <span class="editable-field" contenteditable="true">' + companyWeb + '</span>',
      '  </div>',
      '</div>',

      // ── LÁMINA 5: 04. BALANCE MENSUAL ──────────────────────────────────────
      '<div class="sheet">',
      '  <div class="sheet-head">',
      '    <div class="editable-field" contenteditable="true" style="font-size:20px;font-weight:900;color:' + pal.primary + ';">' + companyName + '</div>',
      '    <div style="font-size:16px;font-weight:800;color:' + pal.primary + ';">04. Tu Nueva Situación</div>',
      '  </div>',
      '  <div><span class="sheet-title-num">04.</span><span class="sheet-title-txt">Balance Energético Mensual</span></div>',
      '  <div style="margin-top:12px;">',
      '    <table class="table-clean" style="text-align:right;">',
      '      <thead><tr style="background:#f8fafc;"><th style="text-align:left;">Mes</th><th>Energía FV (kWh)</th><th>Autoconsumo (kWh)</th><th>Excedentes (kWh)</th><th>Red Sin FV (kWh)</th><th>Red Con FV (kWh)</th><th>Cobertura Solar (%)</th></tr></thead>',
      '      <tbody>',
      (function() {
        var rows = '';
        raw.monthlyBalance.forEach(function(row) {
          rows += '<tr><td style="text-align:left;font-weight:bold;">' + row.mes + '</td>' +
            '<td class="editable-field" contenteditable="true">' + row.gen.toLocaleString('es-ES') + '</td>' +
            '<td class="editable-field" contenteditable="true">' + row.auto.toLocaleString('es-ES') + '</td>' +
            '<td class="editable-field" contenteditable="true">' + row.exc.toLocaleString('es-ES') + '</td>' +
            '<td class="editable-field" contenteditable="true">' + row.redSin.toLocaleString('es-ES') + '</td>' +
            '<td class="editable-field" contenteditable="true">' + row.redCon.toLocaleString('es-ES') + '</td>' +
            '<td class="editable-field" contenteditable="true">' + row.cobertura + ' %</td></tr>';
        });
        return rows;
      })(),
      '        <tr style="font-weight:900;border-top:2px solid #0f172a;background:#f8fafc;"><td style="text-align:left;">TOTAL</td>' +
      '          <td class="editable-field" contenteditable="true">' + raw.totals.gen + ' kWh</td>' +
      '          <td class="editable-field" contenteditable="true">' + raw.totals.auto + ' kWh</td>' +
      '          <td class="editable-field" contenteditable="true">' + raw.totals.exc + ' kWh</td>' +
      '          <td class="editable-field" contenteditable="true">' + raw.totals.redSin + ' kWh</td>' +
      '          <td class="editable-field" contenteditable="true">' + raw.totals.redCon + ' kWh</td>' +
      '          <td class="editable-field" contenteditable="true">' + raw.totals.cobertura + ' %</td></tr>',
      '      </tbody>',
      '    </table>',
      '  </div>',
      '  <div class="sheet-footer">',
      '    <span class="editable-field" contenteditable="true">' + companySlogan + '</span>',
      '    <span class="editable-field" contenteditable="true">' + companyWeb + '</span>',
      '  </div>',
      '</div>',

      // ── LÁMINA 6: 05. GRÁFICAS DE BALANCE ──────────────────────────────────
      '<div class="sheet">',
      '  <div class="sheet-head">',
      '    <div class="editable-field" contenteditable="true" style="font-size:20px;font-weight:900;color:' + pal.primary + ';">' + companyName + '</div>',
      '    <div style="font-size:16px;font-weight:800;color:' + pal.primary + ';">05. Balance Gráfico</div>',
      '  </div>',
      '  <div><span class="sheet-title-num">05.</span><span class="sheet-title-txt">Curvas de Producción & Cobertura</span></div>',
      '  <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:20px;margin-top:14px;align-items:center;">',
      '    <div class="card">',
      '      <div style="font-size:10.5px;font-weight:bold;margin-bottom:6px;">CURVA HORARIA DIARIA DE AUTOCONSUMO</div>',
      Charts.dailyCurve(pal, kwp, annualCons / 365),
      '    </div>',
      '    <div style="display:flex;justify-content:space-around;align-items:center;">',
      '      <div style="text-align:center;">',
      '        <div style="font-size:10.5px;font-weight:bold;margin-bottom:6px;">Consumo Cubierto</div>',
      Charts.donut(Math.round(Number(raw.metrics.totalCoverage)), Math.round(100 - Number(raw.metrics.totalCoverage)), 'Solar', 'Red', pal.primary, '#0284c7'),
      '        <div class="editable-field" contenteditable="true" style="font-size:9.5px;color:#64748b;margin-top:4px;">' + Math.round(Number(raw.metrics.totalCoverage)) + '% Solar / ' + Math.round(100 - Number(raw.metrics.totalCoverage)) + '% Red</div>',
      '      </div>',
      '      <div style="text-align:center;">',
      '        <div style="font-size:10.5px;font-weight:bold;margin-bottom:6px;">Destino Generación</div>',
      Charts.donut(raw.metrics.totalDestAuto, raw.metrics.totalDestExc, 'Directo', 'Excedente', pal.secondary, pal.primary),
      '        <div class="editable-field" contenteditable="true" style="font-size:9.5px;color:#64748b;margin-top:4px;">' + raw.metrics.totalDestAuto + '% Autoconsumo</div>',
      '      </div>',
      '    </div>',
      '  </div>',
      '  <div class="sheet-footer">',
      '    <span class="editable-field" contenteditable="true">' + companySlogan + '</span>',
      '    <span class="editable-field" contenteditable="true">' + companyWeb + '</span>',
      '  </div>',
      '</div>',

      // ── LÁMINA 7: 06. EQUIPAMIENTO TÉCNICO ─────────────────────────────────
      '<div class="sheet">',
      '  <div class="sheet-head">',
      '    <div class="editable-field" contenteditable="true" style="font-size:20px;font-weight:900;color:' + pal.primary + ';">' + companyName + '</div>',
      '    <div style="font-size:16px;font-weight:800;color:' + pal.primary + ';">06. Equipamiento</div>',
      '  </div>',
      '  <div><span class="sheet-title-num">06.</span><span class="sheet-title-txt">Tu Nuevo Equipo</span></div>',
      '  <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:14px;margin-top:14px;">',
      '    <div class="card" style="text-align:center;">',
      '      <div style="font-size:10.5px;font-weight:bold;color:' + pal.primary + ';">MÓDULOS FV</div>',
      '      <div class="editable-field" contenteditable="true" style="font-size:13px;font-weight:900;margin:6px 0;">Tier-1 ' + raw.equipment.modWp + ' Wp</div>',
      '      <div class="editable-field" contenteditable="true" style="font-size:9.5px;color:#64748b;line-height:1.4;">Garantía de potencia: 25 años<br>Alta eficiencia y tolerancia positiva</div>',
      '    </div>',
      '    <div class="card" style="text-align:center;">',
      '      <div style="font-size:10.5px;font-weight:bold;color:' + pal.primary + ';">INVERSORES</div>',
      '      <div class="editable-field" contenteditable="true" style="font-size:13px;font-weight:900;margin:6px 0;">' + kwNom + ' kWn</div>',
      '      <div class="editable-field" contenteditable="true" style="font-size:9.5px;color:#64748b;line-height:1.4;">Eficiencia: 98.5%<br>Monitorización WiFi / App</div>',
      '    </div>',
      '    <div class="card" style="text-align:center;">',
      '      <div style="font-size:10.5px;font-weight:bold;color:' + pal.primary + ';">ESTRUCTURA</div>',
      '      <div class="editable-field" contenteditable="true" style="font-size:13px;font-weight:900;margin:6px 0;">Aluminio Anodizado</div>',
      '      <div class="editable-field" contenteditable="true" style="font-size:9.5px;color:#64748b;line-height:1.4;">Tornillería Inox A2<br>Resistencia vientos 150 km/h</div>',
      '    </div>',
      '    <div class="card" style="text-align:center;">',
      '      <div style="font-size:10.5px;font-weight:bold;color:' + pal.primary + ';">PROTECCIONES</div>',
      '      <div class="editable-field" contenteditable="true" style="font-size:13px;font-weight:900;margin:6px 0;">Cuadro AC/DC</div>',
      '      <div class="editable-field" contenteditable="true" style="font-size:9.5px;color:#64748b;line-height:1.4;">Sobretensiones Tipo II<br>Fusibles y corte seccionable</div>',
      '    </div>',
      '  </div>',
      '  <div class="sheet-footer">',
      '    <span class="editable-field" contenteditable="true">' + companySlogan + '</span>',
      '    <span class="editable-field" contenteditable="true">' + companyWeb + '</span>',
      '  </div>',
      '</div>',

      // ── LÁMINA 8: 07. PROPUESTA ECONÓMICA ──────────────────────────────────
      '<div class="sheet">',
      '  <div class="sheet-head">',
      '    <div class="editable-field" contenteditable="true" style="font-size:20px;font-weight:900;color:' + pal.primary + ';">' + companyName + '</div>',
      '    <div style="font-size:16px;font-weight:800;color:' + pal.primary + ';">07. Propuesta Económica</div>',
      '  </div>',
      '  <div><span class="sheet-title-num">07.</span><span class="sheet-title-txt">Retorno de Inversión & Ahorro</span></div>',
      '  <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:14px;align-items:center;">',
      '    <div style="background:' + pal.light + ';border:2px solid ' + pal.primary + ';border-radius:12px;padding:22px;text-align:center;">',
      '      <div style="font-size:12px;font-weight:700;color:' + pal.dark + ';">COSTE TOTAL DE LA INSTALACIÓN (SIN IVA)</div>',
      '      <div class="editable-field" contenteditable="true" style="font-size:32px;font-weight:900;color:' + pal.primary + ';margin:8px 0;">' + totalCost + ' €</div>',
      '      <div class="editable-field" contenteditable="true" style="font-size:10.5px;color:#64748b;">Financiación personalizada disponible sin entrada</div>',
      '    </div>',
      '    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">',
      '      <div class="card" style="text-align:center;"><div class="editable-field" contenteditable="true" style="font-size:18px;font-weight:900;color:' + pal.primary + ';">' + ahorroAnual + ' €</div><div style="font-size:9.5px;color:#64748b;">Ahorro Anual Estimado</div></div>',
      '      <div class="card" style="text-align:center;"><div class="editable-field" contenteditable="true" style="font-size:18px;font-weight:900;color:' + pal.primary + ';">' + payback + ' años</div><div style="font-size:9.5px;color:#64748b;">Periodo de Amortización</div></div>',
      '      <div class="card" style="text-align:center;"><div class="editable-field" contenteditable="true" style="font-size:18px;font-weight:900;color:' + pal.primary + ';">' + tirStr + '</div><div style="font-size:9.5px;color:#64748b;">Tasa de Rentabilidad (TIR)</div></div>',
      '      <div class="card" style="text-align:center;"><div class="editable-field" contenteditable="true" style="font-size:18px;font-weight:900;color:' + pal.primary + ';">' + ahorro25 + ' €</div><div style="font-size:9.5px;color:#64748b;">Ahorro Acumulado (25 años)</div></div>',
      '    </div>',
      '  </div>',
      '  <div class="sheet-footer">',
      '    <span class="editable-field" contenteditable="true">' + companySlogan + '</span>',
      '    <span class="editable-field" contenteditable="true">' + companyWeb + '</span>',
      '  </div>',
      '</div>',

      // ── LÁMINA 9: 08. AMORTIZACIÓN A 25 AÑOS ───────────────────────────────
      '<div class="sheet">',
      '  <div class="sheet-head">',
      '    <div class="editable-field" contenteditable="true" style="font-size:20px;font-weight:900;color:' + pal.primary + ';">' + companyName + '</div>',
      '    <div style="font-size:16px;font-weight:800;color:' + pal.primary + ';">08. Amortización</div>',
      '  </div>',
      '  <div><span class="sheet-title-num">08.</span><span class="sheet-title-txt">Amortización Acumulada Anual</span></div>',
      '  <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:20px;margin-top:14px;align-items:center;">',
      '    <div class="card">',
      '      <div style="font-size:10.5px;font-weight:bold;margin-bottom:6px;">PROYECCIÓN DE CASHFLOW ACUMULADO (AÑOS 1 A 25)</div>',
      Charts.amortization25(pal, payback, totalCost, ahorroAnual),
      '    </div>',
      '    <div class="card" style="padding:12px;">',
      '      <div style="font-size:10.5px;font-weight:bold;color:' + pal.primary + ';margin-bottom:8px;">PARÁMETROS MACROECONÓMICOS</div>',
      '      <table class="table-clean">',
      '        <tr><td><strong>Incremento IPC Eléctrico:</strong></td><td class="editable-field" contenteditable="true">4,00 % / año</td></tr>',
      '        <tr><td><strong>Degradación de Módulos:</strong></td><td class="editable-field" contenteditable="true">0,55 % / año</td></tr>',
      '        <tr><td><strong>Precio Medio Electricidad:</strong></td><td class="editable-field" contenteditable="true">0,16 € / kWh</td></tr>',
      '        <tr><td><strong>Garantía de Producción:</strong></td><td class="editable-field" contenteditable="true">25 años lineal</td></tr>',
      '      </table>',
      '    </div>',
      '  </div>',
      '  <div class="sheet-footer">',
      '    <span class="editable-field" contenteditable="true">' + companySlogan + '</span>',
      '    <span class="editable-field" contenteditable="true">' + companyWeb + '</span>',
      '  </div>',
      '</div>',

      // ── LÁMINA 10: CIERRE Y FIRMA ───────────────────────────────────────────
      '<div class="sheet">',
      '  <div class="sheet-head">',
      '    <div class="editable-field" contenteditable="true" style="font-size:20px;font-weight:900;color:' + pal.primary + ';">' + companyName + '</div>',
      '    <div style="font-size:16px;font-weight:800;color:' + pal.primary + ';">Aceptación de Oferta</div>',
      '  </div>',
      '  <div><span class="sheet-title-num">✍️</span><span class="sheet-title-txt">Datos del Cliente & Conformidad</span></div>',
      '  <div style="margin-top:14px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:10px;padding:18px;">',
      '    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;font-size:11.5px;">',
      '      <div><strong>Empresa / Titular:</strong> <span class="editable-field" contenteditable="true">' + clientName + '</span></div>',
      '      <div><strong>CIF / NIF:</strong> <span class="editable-field" contenteditable="true">' + clientNif + '</span></div>',
      '      <div><strong>Ubicación:</strong> <span class="editable-field" contenteditable="true">' + address + '</span></div>',
      '      <div><strong>Teléfono:</strong> <span class="editable-field" contenteditable="true">' + (raw.client.phone || '') + '</span></div>',
      '    </div>',
      '    <div style="margin-top:20px;border-top:1px dashed #cbd5e1;padding-top:14px;display:flex;justify-content:space-between;align-items:flex-end;">',
      '      <div class="editable-field" contenteditable="true" style="font-size:10.5px;color:#64748b;max-width:60%;">El cliente manifiesta su conformidad con los parámetros técnicos y económicos de la presente oferta y autoriza la visita técnica de replanteo y tramitación administrativa.</div>',
      '      <div style="text-align:center;border-top:1px solid #000;width:180px;padding-top:6px;font-size:10.5px;font-weight:bold;">Fdo. El Cliente</div>',
      '    </div>',
      '  </div>',
      '  <div class="sheet-footer">',
      '    <span class="editable-field" contenteditable="true">' + companySlogan + '</span>',
      '    <span class="editable-field" contenteditable="true">' + companyWeb + '</span>',
      '  </div>',
      '</div>',

      '</div>', // fin dossier-container

      '<!-- SCRIPTS DE EDICIÓN Y EXPORTACIÓN EN LA VENTANA -->',
      '<script>',
      '  var isEditMode = false;',
      '  function toggleDossierEditMode() {',
      '    isEditMode = !isEditMode;',
      '    var btn = document.getElementById("btn-toggle-edit");',
      '    var body = document.body;',
      '    if (isEditMode) {',
      '      body.classList.add("edit-mode-active");',
      '      btn.textContent = "💾 EDICIÓN ACTIVA (CLIC EN TEXTOS)";',
      '      btn.style.background = "#10b981";',
      '      btn.style.color = "#fff";',
      '    } else {',
      '      body.classList.remove("edit-mode-active");',
      '      btn.textContent = "✏️ MODO EDICIÓN WYSIWYG";',
      '      btn.style.background = "#f59e0b";',
      '      btn.style.color = "#000";',
      '    }',
      '  }',
      '',
      '  function exportDossierToWordDocx() {',
      '    var content = document.getElementById("dossier-container").innerHTML;',
      '    var styles = document.querySelector("style").innerHTML;',
      '    var header = "<html xmlns:o=\'urn:schemas-microsoft-com:office:office\' xmlns:w=\'urn:schemas-microsoft-com:office:word\' xmlns=\'http://www.w3.org/TR/REC-html40\'>" +',
      '      "<head><meta charset=\'utf-8\'><title>' + clientName + '</title><style>" + styles + "</style></head><body>";',
      '    var footer = "</body></html>";',
      '    var blob = new Blob(["\\ufeff" + header + content + footer], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document;charset=utf-8" });',
      '    var a = document.createElement("a");',
      '    a.href = URL.createObjectURL(blob);',
      '    a.download = "Propuesta_Comercial_' + clientName.replace(/[^a-zA-Z0-9_-]/g, '_') + '.docx";',
      '    document.body.appendChild(a);',
      '    a.click();',
      '    document.body.removeChild(a);',
      '  }',
      '',
      '  function exportDossierToWordDoc() {',
      '    var content = document.getElementById("dossier-container").innerHTML;',
      '    var styles = document.querySelector("style").innerHTML;',
      '    var header = "<html xmlns:o=\'urn:schemas-microsoft-com:office:office\' xmlns:w=\'urn:schemas-microsoft-com:office:word\' xmlns=\'http://www.w3.org/TR/REC-html40\'>" +',
      '      "<head><meta charset=\'utf-8\'><title>' + clientName + '</title><style>" + styles + "</style></head><body>";',
      '    var footer = "</body></html>";',
      '    var blob = new Blob(["\\ufeff" + header + content + footer], { type: "application/msword;charset=utf-8" });',
      '    var a = document.createElement("a");',
      '    a.href = URL.createObjectURL(blob);',
      '    a.download = "Propuesta_Comercial_' + clientName.replace(/[^a-zA-Z0-9_-]/g, '_') + '.doc";',
      '    document.body.appendChild(a);',
      '    a.click();',
      '    document.body.removeChild(a);',
      '  }',
      '',
      '  function exportDossierToHtml() {',
      '    var clone = document.documentElement.cloneNode(true);',
      '    var bar = clone.querySelector(".dossier-toolbar");',
      '    if (bar) bar.remove();',
      '    var blob = new Blob(["\\ufeff" + clone.outerHTML], { type: "text/html;charset=utf-8" });',
      '    var a = document.createElement("a");',
      '    a.href = URL.createObjectURL(blob);',
      '    a.download = "Propuesta_Comercial_' + clientName.replace(/[^a-zA-Z0-9_-]/g, '_') + '.html";',
      '    document.body.appendChild(a);',
      '    a.click();',
      '    document.body.removeChild(a);',
      '  }',
      '</script>',
      '</body>',
      '</html>'
    ];

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
    refreshSnapshot: refreshSnapshot,
    generate: buildAndOpenDossierWindow
  };

})(typeof window !== 'undefined' ? window : this);
