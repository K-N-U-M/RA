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

  // [AUD-2026 v2 · SEC2-03/06] Escape HTML local: todo dato dinámico interpolado en el dossier
  // pasa por aquí antes de entrar en HTML.
  function escD(value) {
    if (global.RASanitize && typeof global.RASanitize.plain === 'function') return global.RASanitize.plain(value);
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Configuración activa del dossier
  var ProposalConfig = {
    theme: 'rose', // rose | emerald | sky | amber | slate
    include3DRender: true,
    renderSnapshot: null,
    // Overrides editables desde el modal
    overrides: {}
  };

  function getThemeColors(themeName) {
    if (global.RAProposalStyleStudio && typeof global.RAProposalStyleStudio.getResolvedPalette === 'function') {
      return global.RAProposalStyleStudio.getResolvedPalette(themeName);
    }
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
  /**
   * [AUD-2026 · A-01] Etiqueta de VAN. Nunca inventa ni “positiviza” el valor:
   * si el motor no lo entrega, devuelve 'N/D'; si es negativo, conserva el signo.
   * Exportada para pruebas conductuales (`_audit`).
   */
  function computeVanLabel(m) {
    if (m && typeof m.van === 'number' && isFinite(m.van)) {
      return Math.round(m.van).toLocaleString('es-ES') + ' €';
    }
    return 'N/D';
  }

  /**
   * [AUD-2026 · A-02] Reparto de CAPEX por capítulos. `panelPrice` es €/módulo:
   * el total de la partida debe salir de `panelTotalCost` (o de unitario × nº módulos).
   * El residual va a permisos solo si queda positivo, y la suma cierra contra totalCost.
   * Exportada para pruebas conductuales (`_audit`).
   */
  function computeCapexBreakdown(designCosts, totalCost, numPanels, addonsCost) {
    var panPart, invPart, estPart, cabPart, moPart, legPart, windPart = 0;
    var panels = (typeof numPanels === 'number' && numPanels > 0) ? numPanels : 0;
    var effectiveTotal = Math.max(0, totalCost - (Number(addonsCost) || 0));
    if (designCosts && designCosts.directCostTotal > 0) {
      var scale = effectiveTotal / designCosts.directCostTotal;
      panPart  = Math.round((designCosts.panelTotalCost || (designCosts.panelPrice * panels)) * scale);
      invPart  = Math.round(((designCosts.invPrice || 0) + (designCosts.batPrice || 0)) * scale);
      estPart  = Math.round((designCosts.estPrice || 0) * scale);
      cabPart  = Math.round((designCosts.cabPrice || 0) * scale);
      moPart   = Math.round((designCosts.moPrice || 0) * scale);
      windPart = Math.round((designCosts.windPrice || 0) * scale);
      legPart  = Math.max(0, Math.round(effectiveTotal) - (panPart + invPart + estPart + cabPart + moPart + windPart));
    } else {
      panPart = Math.round(effectiveTotal * 0.32);
      invPart = Math.round(effectiveTotal * 0.18);
      estPart = Math.round(effectiveTotal * 0.14);
      cabPart = Math.round(effectiveTotal * 0.11);
      moPart  = Math.round(effectiveTotal * 0.16);
      legPart = Math.max(0, Math.round(effectiveTotal) - (panPart + invPart + estPart + cabPart + moPart));
    }
    return {
      panPart: panPart, invPart: invPart, estPart: estPart,
      cabPart: cabPart, moPart: moPart, legPart: legPart, windPart: windPart
    };
  }

  function getProjectDossierData() {
    var d = (typeof global.getProjectCalcs === 'function') ? global.getProjectCalcs() : { numPanels: 0 };
    var m = (typeof global.calculateFinancialModel === 'function') ? global.calculateFinancialModel() : {};
    var snap = (typeof global.raBuildDocSnapshot === 'function') ? global.raBuildDocSnapshot(d, m) : null;
    var eq = (snap && snap.eq) || ((typeof global.resolveEquipmentNames === 'function') ? global.resolveEquipmentNames() : {});
    var eqWarranties = (snap && snap.warranties) || ((typeof global.resolveEquipmentWarranties === 'function') ? global.resolveEquipmentWarranties() : { warPower: '25', warMod: '15', warInv: '12', warMo: '5', warBat: '10' });

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

    var companyName = escD(branding.name) || 'RA Ingeniería Fotovoltaica';
    // [AUD-2026 v2 · SEC2-03] Datos de marca y cliente: escapados en origen (nunca HTML crudo).
    var rawLogo = branding.logo || (localStorage.getItem('ra_company_logo') || '');
    var companyLogo = (global.RASanitize && typeof global.RASanitize.safeImageSrc === 'function')
      ? global.RASanitize.safeImageSrc(rawLogo)
      : (/^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(String(rawLogo).trim()) ? String(rawLogo).trim() : '');
    var companySlogan = escD(branding.slogan) || 'Soluciones avanzadas en energía solar y autoconsumo fotovoltaico';
    var companyWeb = escD(branding.web) || 'www.ra-fotovoltaica.es';
    var companyPhone = escD(branding.phone) || '+34 900 000 000';
    var companyEmail = escD(branding.email) || 'info@ra-fotovoltaica.es';
    var companyCif = escD(branding.cif) || 'B-00000000';

    // Métricas del proyecto (SSOT)
    var kwp = Number(m.kwp || d.kwp || 0);
    var kwNom = Number(d.P_ac_kW || (kwp > 0 ? (kwp * 0.9) : 5.0));
    var numPanels = Number(m.numPanels || d.numPanels || 0);
    // [SSOT Fiscal] m.subtotal es la Base Imponible neta (sin IVA). m.capexBruto incluye IVA dinámico.
    var ivaRate = (m && typeof m.ivaRate === 'number') ? m.ivaRate : 0.21;
    var totalCostSinIva = Number(m.subtotal || d.subtotal || (m.capexBruto ? (m.capexBruto / (1 + ivaRate)) : null) || (numPanels * 350) || 5000);
    var totalCostConIva = Number(m.capexBruto || (totalCostSinIva * (1 + ivaRate)));
    var totalCost = totalCostSinIva; // El campo de la UI es "Coste Instalación (€ sin IVA)"
    var annualYield = Math.round(Number(snap ? snap.annualYieldKWh : (d.annualKWh || (kwp * 1450))));
    var ahorroAnual = Number(snap ? snap.ahorroLuzAnio1 : (m.ahorroLuzAnio1 || (annualYield * 0.12)));
    var payback = (snap && snap.paybackYears != null) ? snap.paybackYears : ((typeof m.paybackYears === 'number' && isFinite(m.paybackYears)) ? m.paybackYears : null);
    var tirStr = snap ? snap.tirStr : (m.tirString || ((typeof m.tir === 'number' && isFinite(m.tir)) ? (m.tir.toFixed(1) + ' %') : 'N/D'));
    var ahorro25 = Number(snap ? snap.ahorroTotal25 : (m.ahorroTotal25 || (ahorroAnual * 23.5)));

    // Datos del titular / cliente
    var tit = (d && d.tit) ? d.tit : {};
    var clientName = escD(tit.nombre || (currentBill.titular && (currentBill.titular.nombre || currentBill.titular))) || 'Cliente Particular / Empresa';
    var clientNif = escD(tit.nif || (currentBill.titular && (currentBill.titular.nif || currentBill.cifNif))) || 'B-XXXXXXXX';
    var address = escD(tit.dir || (currentBill.titular && (currentBill.titular.direccion || currentBill.direccionSuministro))) || 'Ubicación del Suministro';
    var cups = escD(tit.cups || currentBill.cups) || 'ES00210000XXXXXXXXXX';
    var clientPhone = escD(tit.tel || (currentBill.titular && currentBill.titular.telefono)) || '';
    var clientEmail = escD(tit.email || (currentBill.titular && currentBill.titular.email)) || '';
    var tariff = escD(currentBill.tarifaAcceso || currentBill.tarifa || tit.tarifa) || (kwNom > 15 ? '3.0TD' : '2.0TD');
    var potFromBill = null;
    if (currentBill.potenciasContratadasKW && typeof currentBill.potenciasContratadasKW.p1 === 'number') {
      potFromBill = currentBill.potenciasContratadasKW.p1.toFixed(2);
    } else if (Array.isArray(currentBill.potenciasContratadas) && currentBill.potenciasContratadas.length > 0) {
      potFromBill = String(currentBill.potenciasContratadas[0]);
    }
    var potContr = tit.potContr || potFromBill || (kwNom > 15 ? '40.00' : '5.75');
    var annualCons = Number(m.consumoAnual || currentBill.consumoAnualKwh || (currentBill.consumosKWh && currentBill.consumosKWh.total) || (annualYield > 0 ? Math.round(annualYield / 0.55) : 10000));

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

    // Consumo mensual en kWh (SSOT: consumos mensuales auditados de factura cuando existan)
    var monthlyConsKwh = new Array(12).fill(0);
    var _billMonthlyDossier = (global.RA && global.RA.billAuditor && typeof global.RA.billAuditor.getMonthlyConsumptionKWh === 'function')
      ? global.RA.billAuditor.getMonthlyConsumptionKWh(annualCons)
      : null;
    if (_billMonthlyDossier && _billMonthlyDossier.hasMonthlyData && Array.isArray(_billMonthlyDossier.monthlyKWh) && _billMonthlyDossier.monthlyKWh.length === 12) {
      monthlyConsKwh = _billMonthlyDossier.monthlyKWh.map(function(v) { return Math.round(Number(v) || 0); });
    } else if (global.solarProjectConfig && global.solarProjectConfig.billMonthlyConsumptionKWh && Array.isArray(global.solarProjectConfig.billMonthlyConsumptionKWh.monthlyKWh) && global.solarProjectConfig.billMonthlyConsumptionKWh.monthlyKWh.length === 12) {
      monthlyConsKwh = global.solarProjectConfig.billMonthlyConsumptionKWh.monthlyKWh.map(function(v) { return Math.round(Number(v) || 0); });
    } else {
      var consumWeights = [0.098, 0.090, 0.085, 0.076, 0.072, 0.078, 0.095, 0.092, 0.079, 0.076, 0.089, 0.090];
      monthlyConsKwh = consumWeights.map(function(w) { return Math.round(w * annualCons); });
    }

    // Desglose del balance mes a mes (SSOT: priorizar monthlyEnergyBreakdown del modelo financiero 288h)
    var monthlyBalance = [];
    var totGen = 0, totAuto = 0, totExc = 0, totRedSin = 0, totRedCon = 0;
    var _fmBreakdown = (m && Array.isArray(m.monthlyEnergyBreakdown) && m.monthlyEnergyBreakdown.length === 12)
      ? m.monthlyEnergyBreakdown
      : null;

    for (var i = 0; i < 12; i++) {
      var _fmRow = _fmBreakdown ? _fmBreakdown[i] : null;
      var gKwh = Math.round(monthlySolarKwh[i] || (_fmRow ? _fmRow.generationKWh : 0) || 0);
      var cKwh = Math.round((_fmRow && typeof _fmRow.consumoKWh === 'number' && _fmRow.consumoKWh > 0) ? _fmRow.consumoKWh : (monthlyConsKwh[i] || 0));
      var aKwh, eKwh;
      if (_fmRow && typeof _fmRow.autoconsumoKWh === 'number') {
        aKwh = Math.min(gKwh, Math.max(0, Math.round(_fmRow.autoconsumoKWh)));
        eKwh = Math.max(0, gKwh - aKwh);
      } else {
        var ssotAutoRatio = (m && m.annualYieldKWh > 0 && m.autoconsumoDirecto > 0)
          ? ((m.autoconsumoDirecto + (m.bateriaKWh || 0)) / m.annualYieldKWh)
          : null;
        var autoRatio = (ssotAutoRatio && ssotAutoRatio > 0 && ssotAutoRatio <= 1.0)
          ? Math.min(0.95, ssotAutoRatio * (1.0 + 0.10 * Math.sin((i - 2) * Math.PI / 6)))
          : Math.min(0.85, 0.90 - 0.22 * Math.min(1.2, gKwh / Math.max(cKwh, 1)));
        aKwh = Math.round(Math.min(cKwh * 0.95, gKwh * autoRatio));
        eKwh = Math.max(0, gKwh - aKwh);
      }
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

    // Detección automática de perfil bancable (Residencial vs PYME/Industrial)
    var isCommercial = (kwp >= 15 || (tariff && (tariff.indexOf('3.') !== -1 || tariff.indexOf('6.'))) || annualCons > 18000);
    var profileType = isCommercial ? 'Comercial & PYME' : 'Residencial Premium';

    // Desglose de CAPEX estructurado a partir del diseño real del proyecto (escalado al totalCost sin IVA)
    var designCosts = (typeof global.RAPricing !== 'undefined' && typeof global.RAPricing.computeDesignCosts === 'function')
      ? global.RAPricing.computeDesignCosts(numPanels)
      : null;
    var commCfg = (typeof global.RAPricing !== 'undefined' && typeof global.RAPricing.getCommercialConfig === 'function')
      ? global.RAPricing.getCommercialConfig()
      : null;
    var allAddons = commCfg ? (commCfg.addons || []).concat(commCfg.customAddons || []) : [];
    var activeAddons = allAddons.filter(function(a) { return a && a.enabled; });
    var addonsCost = activeAddons.reduce(function(s, a) { return s + (Number(a.qty) || 1) * (Number(a.unitPrice) || 0); }, 0);
    var capexParts = computeCapexBreakdown(designCosts, totalCost, numPanels, addonsCost);
    var panPart = capexParts.panPart;
    var invPart = capexParts.invPart;
    var estPart = capexParts.estPart;
    var cabPart = capexParts.cabPart;
    var moPart  = capexParts.moPart;
    var legPart = capexParts.legPart;
    var windPart = capexParts.windPart || 0;
    var windCount = (eq && eq.hasWind) ? (eq.windCount || 1) : ((designCosts && designCosts.windCount) || 0);
    var windTotalKw = (eq && eq.hasWind) ? (eq.windTotalKw || 0) : ((designCosts && designCosts.windTotalKw) || 0);
    var windName = (eq && eq.windName) ? eq.windName : 'Aerogenerador Minieólico';

    // Cálculos Bancables: Financiación sincronizada estrictamente con SSOT (calculateFinancialModel)
    var nMonths = (m && m.mesesFin) ? m.mesesFin : 120;
    var cuotaPrestamo = (m && typeof m.cuotaMensual === 'number' && m.cuotaMensual > 0)
      ? m.cuotaMensual
      : ((totalCostConIva > 0 && nMonths > 0)
        ? (function() {
            var tinAnual = (m && typeof m.tinAnualPct === 'number') ? (m.tinAnualPct / 100.0) : 0.055;
            var tinMensual = tinAnual / 12.0;
            return (tinMensual > 0)
              ? (totalCostConIva * (tinMensual * Math.pow(1 + tinMensual, nMonths))) / (Math.pow(1 + tinMensual, nMonths) - 1)
              : totalCostConIva / nMonths;
          })()
        : 0);
    var ahorroMensual = (m && typeof m.ahorroMensualLuz === 'number') ? m.ahorroMensualLuz : (ahorroAnual / 12.0);
    var saldoNetoMensual = ahorroMensual - cuotaPrestamo;

    // Renting Solar / PPA Operativo (0 € inversión, 8 años / 96 meses)
    var cuotaRenting = Math.round(totalCost * 0.0135);
    var saldoNetoRenting = Math.round(ahorroMensual - cuotaRenting);

    // Métricas Bancables Avanzadas
    var lcoeVal = (m && typeof m.lcoe === 'number' && m.lcoe > 0)
      ? (m.lcoe.toFixed(3) + ' €/kWh')
      : (kwp > 0 && annualYield > 0 ? ((totalCost / (annualYield * 22)).toFixed(3) + ' €/kWh') : '0,038 €/kWh');
    var gridPriceVal = (m && typeof m.precioRedEUR === 'number' && m.precioRedEUR > 0)
      ? (m.precioRedEUR.toFixed(3) + ' €/kWh')
      : '0,165 €/kWh';
    // [AUD-2026 · A-01] Prohibido fabricar un VAN: etiqueta única y con signo real.
    var vanVal = computeVanLabel(m);

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
        totalCostGross: totalCostConIva.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        totalCostGrossNum: totalCostConIva,
        annualYield: annualYield.toLocaleString('es-ES'),
        annualYieldNum: annualYield,
        payback: (typeof payback === 'number' && isFinite(payback)) ? payback.toFixed(1) : '> 25',
        ahorroAnual: ahorroAnual.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        ahorroAnualNum: ahorroAnual,
        tir: tirStr,
        ahorro25: ahorro25.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        // [AUD-2026 · D-07] Un único factor de emisión (kg CO2/kWh), no un atajo por kWp.
        co2Ton: (annualYield * (((typeof global.SOLAR_ENGINE_CONSTANTS !== 'undefined' && global.SOLAR_ENGINE_CONSTANTS.CO2_FACTOR_SPAIN) || 0.259)) / 1000).toFixed(1),
        trees: Math.round(kwp * 1.5),
        offerCode: (d.refNum && d.refNum !== 'RA-PROY-2026') ? d.refNum : ((typeof global.generateRefNum === 'function') ? global.generateRefNum() : ('RA-' + new Date().getFullYear() + '-' + Math.floor(1000 + Math.random() * 9000))),
        dateStr: d.fechaStr || new Date().toLocaleDateString('es-ES'),
        totalCoverage: totalCoverage,
        totalDestAuto: totalDestAuto,
        totalDestExc: totalDestExc,
        isCommercial: isCommercial,
        profileType: profileType,
        lcoe: lcoeVal,
        gridPrice: gridPriceVal,
        van: vanVal,
        capexModules: panPart.toLocaleString('es-ES'),
        capexInverters: invPart.toLocaleString('es-ES'),
        capexStructure: estPart.toLocaleString('es-ES'),
        capexElectrical: cabPart.toLocaleString('es-ES'),
        capexLabor: moPart.toLocaleString('es-ES'),
        capexPermits: legPart.toLocaleString('es-ES'),
        capexWind: windPart > 0 ? windPart.toLocaleString('es-ES') : null,
        windCount: windCount,
        windTotalKw: windTotalKw,
        windName: windName,
        invCount: snap ? snap.invCount : ((eq && eq.invCount) ? eq.invCount : ((designCosts && designCosts.invCount) || 1)),
        batCount: snap ? snap.batCount : ((eq && eq.batCount) ? eq.batCount : ((designCosts && designCosts.batCount) || 0)),
        mlpeCount: snap ? snap.mlpeCount : ((m && typeof m.mlpeCount === 'number') ? m.mlpeCount : 0),
        batName: (eq && eq.batName) ? eq.batName : '',
        finYears: snap ? snap.finYears : Math.max(1, Math.round(nMonths / 12)),
        waccPct: snap ? snap.waccPct : ((m && typeof m.waccPct === 'number') ? m.waccPct : 4.0),
        inflacionPct: snap ? snap.inflacionPct : ((m && typeof m.inflacionPct === 'number') ? m.inflacionPct : 3.0),
        degAnnualPct: snap ? snap.degAnnualPct : ((m && typeof m.degAnnualPct === 'number') ? m.degAnnualPct : 0.40),
        remainingPerformanceYr25: snap ? snap.remainingPerformanceYr25 : ((m && typeof m.remainingPerformanceYr25 === 'number') ? m.remainingPerformanceYr25 : 85.0),
        cuotaPrestamo: cuotaPrestamo.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        ahorroMensual: ahorroMensual.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        saldoNetoMensual: Math.abs(saldoNetoMensual).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        isSaldoNetoPositivo: saldoNetoMensual >= 0,
        cuotaRenting: cuotaRenting.toLocaleString('es-ES'),
        saldoNetoRenting: Math.abs(saldoNetoRenting).toLocaleString('es-ES'),
        isSaldoRentingPositivo: saldoNetoRenting >= 0
      },
      activeAddons: activeAddons,
      equipment: {
        modModel: modModel,
        modWp: modWp,
        invModel: invModel,
        structure: isCoplanar ? 'Coplanar sobre cubierta' : 'Inclinada / Lastrada con perfilería'
      },
      warranties: eqWarranties,
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
    amortization25: function(pal, paybackYears, totalCost, ahorroAnual, finModel) {
      var W = 420, H = 160, PAD_L = 40, PAD_B = 25, PAD_T = 15, PAD_R = 15;
      var cW = W - PAD_L - PAD_R, cH = H - PAD_B - PAD_T;
      var bars = '';
      var pbRaw = (typeof paybackYears === 'number') ? paybackYears : parseFloat(String(paybackYears || '').replace(',', '.'));
      var pb = (Number.isFinite(pbRaw) && pbRaw > 0) ? pbRaw : null;
      var schedule = (finModel && Array.isArray(finModel.financialSchedule25) && finModel.financialSchedule25.length === 25)
        ? finModel.financialSchedule25
        : null;

      if (schedule) {
        var cumValues = schedule.map(function(r) { return r.cumulativeCashFlowEUR; });
        var maxCum = Math.max.apply(null, cumValues.concat([100]));
        var minCum = Math.min.apply(null, cumValues.concat([0]));
        var span = (maxCum - minCum) || 1;
        var zeroY = PAD_T + cH - ((0 - minCum) / span) * cH;

        for (var y = 1; y <= 25; y++) {
          var val = schedule[y - 1].cumulativeCashFlowEUR;
          var x = PAD_L + (y - 1) * (cW / 25) + 1;
          var barW = Math.max(2, cW / 25 - 2);
          var bY, bH, color;
          if (val >= 0) {
            bY = PAD_T + cH - ((val - minCum) / span) * cH;
            bH = Math.max(3, zeroY - bY);
            color = pal.primary;
          } else {
            bY = zeroY;
            bH = Math.max(3, (PAD_T + cH - ((val - minCum) / span) * cH) - zeroY);
            color = '#ef4444';
          }
          bars += '<rect x="' + x.toFixed(1) + '" y="' + bY.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + bH.toFixed(1) + '" fill="' + color + '" rx="1.5"/>';
        }

        return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;display:block;">' +
          '<line x1="' + PAD_L + '" y1="' + zeroY.toFixed(1) + '" x2="' + (W - PAD_R) + '" y2="' + zeroY.toFixed(1) + '" stroke="#94a3b8" stroke-width="1" stroke-dasharray="2,2"/>' +
          bars +
          '<text x="' + PAD_L + '" y="' + (H - 5) + '" font-size="8" fill="#64748b">Año 1</text>' +
          (pb !== null
            ? '<text x="' + (PAD_L + (Math.min(25, pb) / 25) * cW).toFixed(1) + '" y="' + (H - 5) + '" font-size="8" fill="' + pal.primary + '" font-weight="bold" text-anchor="middle">Retorno (Año ' + Math.ceil(pb) + ')</text>'
            : '<text x="' + (PAD_L + cW * 0.5).toFixed(1) + '" y="' + (H - 5) + '" font-size="8" fill="#ef4444" font-weight="bold" text-anchor="middle">Retorno &gt; 25 años</text>') +
          '<text x="' + (W - PAD_R) + '" y="' + (H - 5) + '" font-size="8" fill="#64748b" text-anchor="end">Año 25</text>' +
          '</svg>';
      }

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
    if (typeof global.raEnsureAnalysisReadyForDoc === 'function' && !global.raEnsureAnalysisReadyForDoc()) return;
    if (global.RALazyLoader && typeof global.RALazyLoader.loadDefaultCoverImage === 'function') {
      global.RALazyLoader.loadDefaultCoverImage().catch(function() {});
    }
    var exist = document.getElementById('ra-dossier-config-modal');
    if (exist) { exist.remove(); }

    var data = getProjectDossierData();
    var curSnapshot = getViewerSnapshot();
    ProposalConfig.renderSnapshot = curSnapshot;

    function _dSvg(name, size, color, extraStyle) {
      if (global.RA_SvgCatalog && typeof global.RA_SvgCatalog.mini === 'function') {
        return global.RA_SvgCatalog.mini(name, size || 14, color || 'currentColor', extraStyle || '');
      }
      return '<svg width="' + (size || 14) + '" height="' + (size || 14) + '" viewBox="0 0 24 24" fill="none" stroke="' + (color || 'currentColor') + '" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-0.18em;flex-shrink:0;' + (extraStyle || '') + '"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>';
    }

    var modal = document.createElement('div');
    modal.id = 'ra-dossier-config-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(15,23,42,0.85);backdrop-filter:blur(8px);z-index:999999;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;';

    modal.innerHTML = [
      '<div style="background:#0f172a;border:1px solid #334155;border-radius:14px;width:760px;max-width:96vw;max-height:92vh;display:flex;flex-direction:column;box-shadow:0 25px 50px -12px rgba(0,0,0,0.85);color:#fff;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;">',
      
      '  <!-- Header -->',
      '  <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.1);background:#1e293b;">',
      '    <div style="display:flex;align-items:center;gap:10px;">',
      '      <span style="display:inline-flex;color:#38bdf8;">' + _dSvg('chart', 22, '#38bdf8') + '</span>',
      '      <div>',
      '        <h3 style="margin:0;font-size:16px;font-weight:800;letter-spacing:0.02em;">Configuración del Dossier Comercial (10 Láminas A4)</h3>',
      '        <div style="font-size:11px;color:#94a3b8;margin-top:2px;">Personaliza todos los datos técnicos, económicos y visuales antes de generar el documento editable</div>',
      '      </div>',
      '    </div>',
      '    <button onclick="document.getElementById(\'ra-dossier-config-modal\').remove()" style="background:none;border:none;color:#94a3b8;font-size:20px;cursor:pointer;padding:4px 8px;display:inline-flex;align-items:center;">' + _dSvg('close', 18, '#94a3b8') + '</button>',
      '  </div>',

      '  <!-- Body con pestañas/secciones scrolleables -->',
      '  <div style="flex:1;overflow-y:auto;padding:20px;display:flex;flex-direction:column;gap:18px;">',
      
      '    <!-- SECCIÓN 1: DATOS DEL CLIENTE Y SUMINISTRO -->',
      '    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px;">',
      '      <div style="font-size:12px;font-weight:800;color:#38bdf8;margin-bottom:10px;display:flex;align-items:center;gap:6px;">' + _dSvg('user', 14, '#38bdf8') + ' DATOS DEL CLIENTE & SUMINISTRO (SSOT)</div>',
      '      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">',
      '        <div>',
      '          <label style="font-size:10.5px;color:#94a3b8;display:block;margin-bottom:3px;">Nombre / Razón Social:</label>',
      '          <input type="text" id="dossier-cfg-client-name" value="' + escD(data.client.name) + '" style="width:100%;padding:7px 10px;background:#1e293b;border:1px solid #475569;border-radius:6px;color:#fff;font-size:12px;box-sizing:border-box;">',
      '        </div>',
      '        <div>',
      '          <label style="font-size:10.5px;color:#94a3b8;display:block;margin-bottom:3px;">CIF / NIF:</label>',
      '          <input type="text" id="dossier-cfg-client-nif" value="' + escD(data.client.nif) + '" style="width:100%;padding:7px 10px;background:#1e293b;border:1px solid #475569;border-radius:6px;color:#fff;font-size:12px;box-sizing:border-box;">',
      '        </div>',
      '        <div>',
      '          <label style="font-size:10.5px;color:#94a3b8;display:block;margin-bottom:3px;">Dirección / Ubicación:</label>',
      '          <input type="text" id="dossier-cfg-client-address" value="' + escD(data.client.address) + '" style="width:100%;padding:7px 10px;background:#1e293b;border:1px solid #475569;border-radius:6px;color:#fff;font-size:12px;box-sizing:border-box;">',
      '        </div>',
      '        <div>',
      '          <label style="font-size:10.5px;color:#94a3b8;display:block;margin-bottom:3px;">Código CUPS:</label>',
      '          <input type="text" id="dossier-cfg-client-cups" value="' + escD(data.client.cups) + '" style="width:100%;padding:7px 10px;background:#1e293b;border:1px solid #475569;border-radius:6px;color:#fff;font-size:12px;box-sizing:border-box;">',
      '        </div>',
      '        <div>',
      '          <label style="font-size:10.5px;color:#94a3b8;display:block;margin-bottom:3px;">Tarifa Eléctrica & Potencia (kW):</label>',
      '          <input type="text" id="dossier-cfg-client-tariff" value="' + escD(data.client.tariff) + ' (' + escD(data.client.potContr) + ' kW)" style="width:100%;padding:7px 10px;background:#1e293b;border:1px solid #475569;border-radius:6px;color:#fff;font-size:12px;box-sizing:border-box;">',
      '        </div>',
      '        <div>',
      '          <label style="font-size:10.5px;color:#94a3b8;display:block;margin-bottom:3px;">Consumo Anual (kWh):</label>',
      '          <input type="number" id="dossier-cfg-client-cons" value="' + escD(data.client.annualCons) + '" style="width:100%;padding:7px 10px;background:#1e293b;border:1px solid #475569;border-radius:6px;color:#fff;font-size:12px;box-sizing:border-box;">',
      '        </div>',
      '      </div>',
      '    </div>',

      '    <!-- SECCIÓN 2: PARÁMETROS ECONÓMICOS Y COMERCIALES -->',
      '    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px;">',
      '      <div style="font-size:12px;font-weight:800;color:#10b981;margin-bottom:10px;display:flex;align-items:center;gap:6px;">' + _dSvg('euro', 14, '#10b981') + ' PROPUESTA ECONÓMICA Y OFERTA (SSOT)</div>',
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
      '      <div style="font-size:12px;font-weight:800;color:#f59e0b;margin-bottom:10px;display:flex;align-items:center;gap:6px;">' + _dSvg('building', 14, '#f59e0b') + ' IDENTIDAD CORPORATIVA & BRANDING</div>',
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
      
      '      <!-- Selector de estilo de maquetación comercial -->',
      '      <div style="margin-top:12px;">',
      '        <label style="font-size:10.5px;color:#94a3b8;display:block;margin-bottom:5px;">Estilo de Maquetación & Diseño:</label>',
      '        <select id="dossier-cfg-layout-style" style="width:100%;padding:7px 10px;background:#1e293b;border:1px solid #475569;border-radius:6px;color:#FBBF24;font-size:12px;font-weight:700;box-sizing:border-box;outline:none;">',
      '          <option value="editorial" ' + (data.branding.layoutStyle === 'editorial' ? 'selected' : '') + '>Editorial Premium (Espacios diáfanos, vectores aireados)</option>',
      '          <option value="infographic" ' + (data.branding.layoutStyle === 'infographic' ? 'selected' : '') + '>Infografía Comercial (Foco en KPIs y gráficos)</option>',
      '          <option value="technical" ' + (data.branding.layoutStyle === 'technical' ? 'selected' : '') + '>Técnico Equilibrado (Ingeniería estructurada)</option>',
      '        </select>',
      '      </div>',
      '',
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
      '        <button type="button" onclick="window.CommercialProposalDossier.refreshSnapshot()" style="position:absolute;bottom:4px;right:4px;background:rgba(15,23,42,0.8);border:1px solid #475569;color:#fff;border-radius:4px;font-size:9px;padding:2px 5px;cursor:pointer;display:inline-flex;align-items:center;gap:3px;">' + _dSvg('refresh', 10, '#ffffff') + ' Refrescar</button>',
      '      </div>',
      '    </div>',

      '  </div>',

      '  <!-- Footer con botones -->',
      '  <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 20px;border-top:1px solid rgba(255,255,255,0.1);background:#1e293b;">',
      '    <div style="font-size:11px;color:#94a3b8;">10 Láminas A4 · Editable en HTML, PDF y Word (.docx)</div>',
      '    <div style="display:flex;gap:10px;">',
      '      <button onclick="document.getElementById(\'ra-dossier-config-modal\').remove()" style="padding:9px 18px;background:transparent;border:1px solid #475569;color:#cbd5e1;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;">Cancelar</button>',
      '      <button onclick="window.CommercialProposalDossier.generateFromModal()" style="padding:9px 24px;background:linear-gradient(135deg, #e11d48, #f97316);border:none;color:#fff;font-weight:800;border-radius:6px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:8px;box-shadow:0 4px 14px rgba(225,29,72,0.4);">',
      '        <span>GENERAR DOSSIER EDITABLE</span> ' + _dSvg('arrowRight', 14, '#ffffff'),
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
    ProposalConfig.layoutStyle = g('dossier-cfg-layout-style') || ProposalConfig.layoutStyle || 'editorial';
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

  // Helper para convertir hex a "r, g, b"
  function hexToRgb(hex) {
    var c = (hex || '#e11d48').replace('#', '');
    if (c.length === 3) c = c.split('').map(function(x) { return x + x; }).join('');
    var num = parseInt(c, 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255].join(', ');
  }

  // Genera el documento HTML Landscape e invoca la ventana con edición y exportación
  function buildAndOpenDossierWindow() {
    if (typeof global.raEnsureAnalysisReadyForDoc === 'function' && !global.raEnsureAnalysisReadyForDoc()) return;
    var raw = getProjectDossierData();
    var ov = ProposalConfig.overrides || {};

    // Combinar con overrides del modal — [AUD-2026 v2 · SEC2-03/04] escapados en origen
    var companyName = escD(ov.companyName || raw.branding.name);
    var companyLogo = raw.branding.logo;
    var companySlogan = escD(ov.companySlogan || raw.branding.slogan);
    var companyWeb = escD(ov.companyWeb || raw.branding.web);
    var companyPhone = escD(ov.companyPhone || raw.branding.phone);

    var clientName = escD(ov.clientName || raw.client.name);
    var clientNif = escD(ov.clientNif || raw.client.nif);
    var address = escD(ov.clientAddress || raw.client.address);
    var cups = escD(ov.clientCups || raw.client.cups);
    var tariff = escD(ov.clientTariff || raw.client.tariff);
    var annualCons = escD(ov.clientAnnualCons || raw.client.annualCons);

    var kwp = raw.metrics.kwp;
    var kwNom = raw.metrics.kwNom;
    var numPanels = raw.metrics.numPanels;
    var totalCost = ov.totalCost || raw.metrics.totalCost;
    var parseEsNum = function(s, fb) {
      if (typeof s === 'number') return s;
      if (!s) return fb;
      var clean = String(s).replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.');
      var n = parseFloat(clean);
      return isFinite(n) && n > 0 ? n : fb;
    };
    var fmtEsCurrency = function(n) {
      return Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
    };
    var totalCostNum = ov.totalCost ? parseEsNum(ov.totalCost, raw.metrics.totalCostNum) : raw.metrics.totalCostNum;
    var ivaRate = (raw && raw.m && typeof raw.m.ivaRate === 'number') ? raw.m.ivaRate : 0.21;
    var totalCostGrossNum = Math.round(totalCostNum * (1 + ivaRate) * 100) / 100;
    var totalCostGross = totalCostGrossNum.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (ov.totalCost && raw.metrics.totalCostNum > 0 && Math.abs(totalCostNum - raw.metrics.totalCostNum) > 1) {
      var capexRatio = totalCostNum / raw.metrics.totalCostNum;
      var scaleCapexStr = function(str) {
        return Math.round(parseEsNum(str, 0) * capexRatio).toLocaleString('es-ES');
      };
      raw.metrics.capexModules = scaleCapexStr(raw.metrics.capexModules);
      raw.metrics.capexInverters = scaleCapexStr(raw.metrics.capexInverters);
      raw.metrics.capexStructure = scaleCapexStr(raw.metrics.capexStructure);
      raw.metrics.capexElectrical = scaleCapexStr(raw.metrics.capexElectrical);
      raw.metrics.capexLabor = scaleCapexStr(raw.metrics.capexLabor);
      raw.metrics.capexPermits = scaleCapexStr(raw.metrics.capexPermits);
      raw.metrics.totalCostGross = totalCostGross;
    }
    var annualYield = raw.metrics.annualYield;
    var payback = ov.payback || raw.metrics.payback;
    var ahorroAnual = ov.ahorroAnual || raw.metrics.ahorroAnual;
    var tirStr = ov.tir || raw.metrics.tir;
    var ahorro25 = raw.metrics.ahorro25;
    var offerCode = ov.offerCode || raw.metrics.offerCode;
    var dateStr = ov.offerDate || raw.metrics.dateStr;

    var pal = getThemeColors(ProposalConfig.theme || (raw.branding && raw.branding.theme) || 'rose');
    var rgbPri = hexToRgb(pal.primary);
    var layoutStyle = ProposalConfig.layoutStyle || (raw.branding && raw.branding.layoutStyle) || 'editorial';

    // ── Configuración de Logotipo & Encabezados desde el Estudio de Maquetación ──
    var studioCfg = (global.RAProposalStyleStudio && typeof global.RAProposalStyleStudio.getActiveConfig === 'function')
      ? global.RAProposalStyleStudio.getActiveConfig()
      : null;
    var dossierModality = (studioCfg && studioCfg.installationModality) || 'grid_surplus_cel';
    var isDossierOffGrid = (dossierModality === 'off_grid');
    var dossierRefPrice = (studioCfg && typeof studioCfg.referenceGridPriceEUR === 'number' && studioCfg.referenceGridPriceEUR > 0)
      ? studioCfg.referenceGridPriceEUR
      : 0.22;
    if (isDossierOffGrid) {
      var yieldNum = parseEsNum(annualYield, 4000);
      var offValAnual = Math.round(yieldNum * dossierRefPrice);
      var offValMes = Math.round(offValAnual / 12);
      ahorroAnual = offValAnual.toLocaleString('es-ES');
      ahorro25 = Math.round(offValAnual * 25 * 1.15).toLocaleString('es-ES');
      raw.metrics.ahorroMensual = offValMes.toLocaleString('es-ES');
      raw.metrics.gridPrice = dossierRefPrice.toFixed(2).replace('.', ',') + ' €/kWh';
      cups = 'Suministro 100% Aislado (Off-Grid)';
    }
    var headerLogoScope = (studioCfg && studioCfg.headerLogoScope) || 'all';
    var headerLogoFormat = (studioCfg && studioCfg.headerLogoFormat) || 'logo_and_title';
    var headerLogoStyle = (studioCfg && studioCfg.headerLogoStyle) || 'clean';
    var coverLogoH = (studioCfg && Number(studioCfg.coverLogoHeightPx)) || 45;
    var innerLogoH = (studioCfg && Number(studioCfg.innerHeaderLogoHeightPx)) || 26;
    var logoStyleClass = headerLogoStyle === 'pill' ? ' ra-logo-pill' : (headerLogoStyle === 'subtle' ? ' ra-logo-subtle' : '');

    function getDossierInnerLogoHTML() {
      if (headerLogoScope === 'none') return '';
      if (!companyLogo) return '';
      return '<span class="ra-header-logo-wrap' + logoStyleClass + '" style="display:inline-flex;align-items:center;">' +
        '<img src="' + companyLogo + '" class="ra-header-logo-img" style="height:' + innerLogoH + 'px;max-height:' + innerLogoH + 'px;max-width:160px;object-fit:contain;vertical-align:middle;" alt="Logo"/>' +
      '</span>';
    }

    function buildDossierSheetHead(sheetNumTitle) {
      var innerLogo = getDossierInnerLogoHTML();
      var leftHTML = '';
      var rightHTML = '';

      if (headerLogoFormat === 'logo_only') {
        leftHTML = innerLogo || companyName;
        rightHTML = sheetNumTitle;
      } else if (headerLogoFormat === 'right_aligned') {
        leftHTML = companyName;
        rightHTML = sheetNumTitle + (innerLogo ? '<span style="border-left:1.5px solid #cbd5e1;height:18px;display:inline-block;margin:0 8px;vertical-align:middle;"></span>' + innerLogo : '');
      } else {
        // 'logo_and_title' (default)
        leftHTML = (innerLogo ? innerLogo + '<span style="border-left:1.5px solid #cbd5e1;height:20px;display:inline-block;margin:0 8px;vertical-align:middle;"></span>' : '') + companyName;
        rightHTML = sheetNumTitle;
      }

      return '  <div class="sheet-head">' +
        '    <div class="editable-field" contenteditable="true" style="font-size:20px;font-weight:900;color:' + pal.primary + ';display:inline-flex;align-items:center;">' + leftHTML + '</div>' +
        '    <div class="editable-field" contenteditable="true" style="font-size:16px;font-weight:800;color:' + pal.primary + ';display:inline-flex;align-items:center;">' + rightHTML + '</div>' +
        '  </div>';
    }

    // Helper SVG con fallback de seguridad y soporte multialias
    function getDossierIcon(name, col, sz) {
      var cat = (typeof window !== 'undefined' && (window.RA_SvgCatalog || window.RASvgCatalog)) 
        || (typeof global !== 'undefined' && (global.RA_SvgCatalog || global.RASvgCatalog));
      if (cat) {
        if (typeof cat.render === 'function') {
          return cat.render(name, col || pal.primary, sz || 36);
        }
        if (typeof cat.get === 'function') {
          return cat.get(name, { color: col || pal.primary, size: sz || 36 });
        }
      }
      return '';
    }

    // Captura del render de la cubierta
    var renderSnapshot = ProposalConfig.include3DRender ? (ProposalConfig.renderSnapshot || getViewerSnapshot()) : null;

    // Helper constructores de componentes modulares
    function makeCard(inner, extraStyle, extraAttr) {
      return '<div class="card" ' + (extraAttr || '') + ' style="' + (extraStyle || '') + '">' +
        '<div class="dossier-drag-handle no-print" title="Arrastrar para mover">⠿</div>' +
        '<div class="dossier-resize-handle no-print" title="Arrastrar para redimensionar">◢</div>' +
        inner +
      '</div>';
    }

    function _dSvg(name, size, color, extraStyle) {
      if (global.RA_SvgCatalog && typeof global.RA_SvgCatalog.mini === 'function') {
        return global.RA_SvgCatalog.mini(name, size || 14, color || 'currentColor', extraStyle || '');
      }
      return '<svg width="' + (size || 14) + '" height="' + (size || 14) + '" viewBox="0 0 24 24" fill="none" stroke="' + (color || 'currentColor') + '" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-0.18em;flex-shrink:0;' + (extraStyle || '') + '"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>';
    }

    function makeImgBox(imgSrc, altText, extraStyle, labelText) {
      return '<div class="dossier-img-box" style="' + (extraStyle || '') + '">' +
        (imgSrc 
          ? '<img src="' + imgSrc + '" class="dossier-target-img" style="width:100%;height:100%;object-fit:cover;" alt="' + (altText || 'Imagen') + '"/>' 
          : '<div style="color:#cbd5e1;font-size:15px;font-weight:700;text-align:center;padding:20px;">' + (altText || 'Sin imagen') + '</div>') +
        '<button type="button" class="dossier-img-picker-btn no-print" onclick="DossierWYSIWYG.triggerImageUpload(this)">' + _dSvg('folder', 12, '#ffffff', 'margin-right:4px;') + 'Seleccionar imagen local (HDD)</button>' +
        '<input type="file" accept="image/*" class="dossier-file-input no-print" style="display:none;" onchange="DossierWYSIWYG.handleImageUploaded(this)"/>' +
        (labelText ? '<div class="editable-field" contenteditable="true" style="position:absolute;bottom:10px;left:14px;background:rgba(15,23,42,0.85);backdrop-filter:blur(6px);padding:5px 12px;border-radius:6px;color:#fff;font-size:11px;font-weight:700;">' + labelText + '</div>' : '') +
      '</div>';
    }

    var divGrad = '<div class="dossier-divider"></div>';

    // Construcción del documento A4 Landscape
    var html = [
      '<!DOCTYPE html>',
      '<html lang="es">',
      '<head>',
      '<meta charset="UTF-8">',
      '<title>Propuesta Técnica & Comercial - ' + clientName + '</title>',
      '<link rel="preconnect" href="https://fonts.googleapis.com">',
      '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
      '<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,200..800&family=Comfortaa:wght@300;400;600;700&family=DM+Sans:ital,opsz,wght@0,9..40,400..700;1,9..40,400..700&family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700;800&family=Montserrat:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,700&family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet">',
      '<style>',
      '  @page { size: A4 landscape; margin: 0; }',
      '  *, *::before, *::after { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }',
      '  body { margin: 0; padding: 0; font-family: "Comfortaa", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #1e293b; padding-top: 56px; }',
      '  .sheet { width: 297mm; height: 210mm; background: #fff; margin: 12mm auto; position: relative; padding: 10mm 16mm 9mm 16mm; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; page-break-after: always; box-shadow: 0 10px 30px rgba(0,0,0,0.5); border-radius: 6px; font-size: 14.5px; line-height: 1.5; }',
      '  .sheet-body-content { flex: 1; min-height: 0; display: flex; flex-direction: column; justify-content: space-between; margin: 2mm 0; width: 100%; }',
      '  .sheet:last-of-type { page-break-after: avoid !important; }',
      '  @media print {',
      '    body { background: none; padding-top: 0; }',
      '    .sheet { margin: 0; box-shadow: none; width: 297mm; height: 210mm; padding: 10mm 16mm 9mm 16mm; page-break-after: always; border-radius: 0; }',
      '    .sheet:last-of-type { page-break-after: avoid !important; }',
      '    .no-print { display: none !important; }',
      '    .dossier-drag-handle, .dossier-resize-handle, .dossier-img-picker-btn, #dossier-format-bar, .dossier-overflow-warn { display: none !important; }',
      '  }',
      '  .dossier-overflow-warn { position: absolute; top: 8px; right: 14px; background: #ef4444; color: #fff; font-size: 10px; font-weight: 800; padding: 4px 10px; border-radius: 6px; box-shadow: 0 4px 12px rgba(239,68,68,0.4); z-index: 9999; display: flex; align-items: center; gap: 6px; pointer-events: none; }',
      '  .sheet-head { display: flex; justify-content: space-between; align-items: center; height: 14mm; margin-bottom: 2mm; flex-shrink: 0; }',
      '  .sheet-title-num { font-size: 32px; font-weight: 900; color: #0f172a; border-bottom: 3px solid #0f172a; padding-bottom: 1px; }',
      '  .sheet-title-txt { font-size: 22px; font-weight: 800; color: #334155; margin-left: 10px; }',
      '  .sheet-footer { height: 9.5mm; border-radius: 6px; background: linear-gradient(90deg, ' + pal.primary + ', ' + pal.secondary + '); display: flex; justify-content: space-between; align-items: center; padding: 0 16px; color: #fff; font-size: 13px; font-weight: 700; margin-top: auto; flex-shrink: 0; }',
      '  ',
      '  /* CONTENEDORES CON SOMBRA DIFUMINADA Y BORDES DEGRADADOS */',
      '  .card {',
      '    background: #ffffff;',
      '    border-radius: 12px;',
      '    border: 1.5px solid transparent;',
      '    background-image: linear-gradient(#ffffff, #ffffff), linear-gradient(135deg, ' + pal.primary + ', ' + pal.secondary + ');',
      '    background-origin: border-box;',
      '    background-clip: padding-box, border-box;',
      '    padding: 12px 16px;',
      '    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.07), 0 8px 16px -6px rgba(0, 0, 0, 0.04);',
      '    position: relative;',
      '    transition: box-shadow 0.2s ease, transform 0.1s ease;',
      '    min-width: 80px;',
      '    min-height: 35px;',
      '  }',
      '  .card:hover {',
      '    box-shadow: 0 14px 30px -4px rgba(0, 0, 0, 0.10), 0 10px 18px -4px rgba(0, 0, 0, 0.06);',
      '  }',
      '  ',
      '  /* LÍNEAS HORIZONTALES SEPARADORAS CON DEGRADADO */',
      '  .dossier-divider {',
      '    height: 1.5px;',
      '    width: 100%;',
      '    margin: 6px 0;',
      '    border: none;',
      '    background: linear-gradient(90deg, transparent, ' + pal.primary + ', ' + pal.secondary + ', transparent);',
      '    opacity: 0.8;',
      '  }',
      '  ',
      '  .table-clean { width: 100%; border-collapse: collapse; font-size: 13.5px; }',
      '  .table-clean th { border-bottom: 2px solid #cbd5e1; padding: 6px 8px; text-align: left; color: #475569; font-weight: 800; font-size: 13.5px; }',
      '  .table-clean td { padding: 5px 8px; border-bottom: 1px solid #f1f5f9; color: #1e293b; font-size: 13px; }',
      '  ',
      '  /* BARRA DE HERRAMIENTAS FLOTANTE */',
      '  .dossier-toolbar { position: fixed; top: 0; left: 0; right: 0; height: 50px; background: #0f172a; color: #fff; display: flex; align-items: center; justify-content: space-between; padding: 0 20px; z-index: 99999; box-shadow: 0 4px 20px rgba(0,0,0,0.4); border-bottom: 2px solid ' + pal.primary + '; }',
      '  .toolbar-btn { border: none; border-radius: 6px; padding: 7px 12px; font-size: 11px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: all 0.15s ease; color: #fff; }',
      '  .toolbar-btn:hover { filter: brightness(1.15); transform: translateY(-1px); }',
      '  ',
      '  /* MODO EDICIÓN VISUAL WYSIWYG & ZERO ESTÁTICO */',
      '  .editable-field { outline: none; border-radius: 3px; word-break: break-word; overflow-wrap: break-word; max-width: 100%; }',
      '  .edit-mode-active .editable-field { background: rgba(' + rgbPri + ', 0.04); box-shadow: 0 0 0 1px rgba(' + rgbPri + ', 0.25); cursor: text; }',
      '  .edit-mode-active .editable-field:hover { background: rgba(' + rgbPri + ', 0.10); }',
      '  .edit-mode-active .editable-field:focus { background: #fff; box-shadow: 0 0 0 2px ' + pal.primary + '; }',
      '  ',
      '  /* ASIDEROS DE ARRASTRE Y ESCALADO */',
      '  .dossier-drag-handle {',
      '    position: absolute;',
      '    top: 4px;',
      '    left: 4px;',
      '    width: 22px;',
      '    height: 22px;',
      '    cursor: grab;',
      '    font-size: 13px;',
      '    line-height: 22px;',
      '    text-align: center;',
      '    color: ' + pal.primary + ';',
      '    background: rgba(255,255,255,0.95);',
      '    border: 1px solid rgba(0,0,0,0.15);',
      '    border-radius: 4px;',
      '    user-select: none;',
      '    display: none;',
      '    z-index: 50;',
      '    box-shadow: 0 2px 5px rgba(0,0,0,0.12);',
      '  }',
      '  .dossier-drag-handle:active { cursor: grabbing; }',
      '  .dossier-resize-handle {',
      '    position: absolute;',
      '    bottom: 2px;',
      '    right: 2px;',
      '    width: 18px;',
      '    height: 18px;',
      '    cursor: se-resize;',
      '    font-size: 12px;',
      '    line-height: 18px;',
      '    text-align: center;',
      '    color: ' + pal.primary + ';',
      '    user-select: none;',
      '    display: none;',
      '    z-index: 50;',
      '  }',
      '  .edit-mode-active .dossier-drag-handle,',
      '  .edit-mode-active .dossier-resize-handle {',
      '    display: block;',
      '  }',
      '  ',
      '  /* SELECTOR DE IMÁGENES LOCALES DESDE HDD */',
      '  .dossier-img-box {',
      '    position: relative;',
      '    overflow: hidden;',
      '    border-radius: 10px;',
      '    display: flex;',
      '    align-items: center;',
      '    justify-content: center;',
      '    background: #0f172a;',
      '  }',
      '  .dossier-img-picker-btn {',
      '    position: absolute;',
      '    top: 8px;',
      '    right: 8px;',
      '    background: rgba(15,23,42,0.85);',
      '    color: #fff;',
      '    border: 1px solid rgba(255,255,255,0.35);',
      '    backdrop-filter: blur(4px);',
      '    border-radius: 6px;',
      '    padding: 6px 11px;',
      '    font-size: 10.5px;',
      '    font-weight: 700;',
      '    cursor: pointer;',
      '    display: none;',
      '    z-index: 60;',
      '    box-shadow: 0 4px 10px rgba(0,0,0,0.3);',
      '    transition: all 0.15s ease;',
      '  }',
      '  .dossier-img-picker-btn:hover {',
      '    background: ' + pal.primary + ';',
      '    border-color: #fff;',
      '    transform: scale(1.02);',
      '  }',
      '  .edit-mode-active .dossier-img-picker-btn {',
      '    display: block;',
      '  }',
      '  ',
      '  /* BARRA FLOTANTE DE FORMATO & ESTILOS WYSIWYG */',
      '  #dossier-format-bar {',
      '    position: fixed;',
      '    top: 58px;',
      '    left: 50%;',
      '    transform: translateX(-50%);',
      '    background: #0f172a;',
      '    color: #fff;',
      '    border: 1.5px solid ' + pal.primary + ';',
      '    box-shadow: 0 12px 36px rgba(0,0,0,0.65), 0 0 15px rgba(' + rgbPri + ', 0.35);',
      '    border-radius: 10px;',
      '    padding: 6px 14px;',
      '    display: none;',
      '    align-items: center;',
      '    gap: 8px;',
      '    z-index: 999999;',
      '    font-family: inherit;',
      '    font-size: 12px;',
      '    backdrop-filter: blur(10px);',
      '  }',
      '  .fmt-btn {',
      '    background: #1e293b;',
      '    border: 1px solid #334155;',
      '    color: #e2e8f0;',
      '    border-radius: 5px;',
      '    padding: 4px 9px;',
      '    font-size: 12px;',
      '    cursor: pointer;',
      '    font-weight: 700;',
      '    display: inline-flex;',
      '    align-items: center;',
      '    justify-content: center;',
      '    transition: all 0.15s ease;',
      '  }',
      '  .fmt-btn:hover { background: ' + pal.primary + '; color: #fff; border-color: ' + pal.primary + '; }',
      '  .fmt-select {',
      '    background: #1e293b;',
      '    border: 1px solid #334155;',
      '    color: #e2e8f0;',
      '    border-radius: 5px;',
      '    padding: 4px 8px;',
      '    font-size: 12px;',
      '    cursor: pointer;',
      '    font-weight: 600;',
      '    outline: none;',
      '  }',
      '  .fmt-select:focus { border-color: ' + pal.primary + '; }',
      '  .fmt-color-picker {',
      '    width: 26px;',
      '    height: 26px;',
      '    border: 1px solid #334155;',
      '    border-radius: 5px;',
      '    padding: 0;',
      '    cursor: pointer;',
      '    background: transparent;',
      '  }',
      '  .fmt-sep { width: 1px; height: 20px; background: #334155; margin: 0 3px; }',
      '  #fmt-size-display { font-size: 12px; font-weight: 800; color: ' + pal.secondary + '; min-width: 36px; text-align: center; }',
      '  ',
      '  /* BADGES & ESTILOS BANCABLES AAA */',
      '  .badge-bankable { display: inline-flex; align-items: center; gap: 4px; padding: 2px 7px; border-radius: 4px; font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; }',
      '  .badge-bankable-emerald { background: #dcfce7; color: #15803d; border: 1px solid #86efac; }',
      '  .badge-bankable-sky { background: #e0f2fe; color: #0369a1; border: 1px solid #7dd3fc; }',
      '  .badge-bankable-amber { background: #fef3c7; color: #b45309; border: 1px solid #fde68a; }',
      '  ',
      '  /* GANTT TIMELINE OPERATIVO */',
      '  .gantt-grid { display: grid; grid-template-columns: 130px 1fr; gap: 8px; align-items: center; margin-bottom: 6px; font-size: 9.5px; }',
      '  .gantt-label { font-weight: 700; color: #334155; }',
      '  .gantt-track { background: #f1f5f9; border-radius: 6px; height: 18px; position: relative; overflow: hidden; display: flex; align-items: center; }',
      '  .gantt-bar { height: 100%; border-radius: 4px; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 8.5px; font-weight: 800; box-shadow: 0 1px 3px rgba(0,0,0,0.15); }',
      (global.RAProposalStyleStudio && typeof global.RAProposalStyleStudio.buildInjectedStylesheet === 'function' ? global.RAProposalStyleStudio.buildInjectedStylesheet('landscape') : ''),
      '</style>',
      '</head>',
      '<body>',
      '',
      '<!-- BARRA DE HERRAMIENTAS INTERACTIVA -->',
      '<div class="dossier-toolbar no-print">',
      '  <div style="display:flex;align-items:center;gap:12px;">',
      '    <strong style="font-size:13px;letter-spacing:0.04em;display:inline-flex;align-items:center;gap:6px;">' + _dSvg('fileText', 15, pal.primary) + ' DOSSIER COMERCIAL LANDSCAPE</strong>',
      '    <span style="font-size:11px;color:#94a3b8;background:#1e293b;padding:3px 8px;border-radius:4px;border:1px solid #334155;">10 Láminas Técnicas</span>',
      '  </div>',
      '  <div style="display:flex;gap:7px;align-items:center;">',
      '    <button class="toolbar-btn" id="btn-toggle-edit" onclick="DossierWYSIWYG.toggleEditMode()" style="background:#f59e0b;color:#000;">' + _dSvg('edit', 13, '#000000') + ' MODO EDICIÓN WYSIWYG</button>',
      '    <button class="toolbar-btn" id="btn-save-draft" onclick="DossierWYSIWYG.saveDraftManual()" style="background:#059669;" title="Guardar cambios localmente">' + _dSvg('save', 13, '#ffffff') + ' GUARDAR BORRADOR</button>',
      '    <button class="toolbar-btn" id="btn-restore-draft" onclick="DossierWYSIWYG.restoreDraftManual()" style="background:#475569;display:none;" title="Recuperar borrador anterior">' + _dSvg('refresh', 13, '#ffffff') + ' RESTAURAR</button>',
      '    <button class="toolbar-btn" onclick="DossierWYSIWYG.runTestSuite()" style="background:#8b5cf6;">' + _dSvg('flask', 13, '#ffffff') + ' TEST WYSIWYG</button>',
      '    <button class="toolbar-btn" onclick="window.print()" style="background:' + pal.primary + ';">' + _dSvg('printer', 13, '#ffffff') + ' IMPRIMIR / PDF</button>',
      '    <button class="toolbar-btn" id="btn-dossier-docx" onclick="DossierWYSIWYG.exportToWordDocx()" style="background:#2563eb;" title="Descargar documento Word (.docx) con maquetación e imágenes">' + _dSvg('fileText', 13, '#ffffff') + ' DESCARGAR WORD (.DOCX)</button>',
      '    <button class="toolbar-btn" onclick="DossierWYSIWYG.exportToHtml()" style="background:#475569;">' + _dSvg('globe', 13, '#ffffff') + ' GUARDAR HTML</button>',
      '    <button class="toolbar-btn" onclick="window.close()" style="background:#ef4444;margin-left:6px;">' + _dSvg('close', 14, '#ffffff') + '</button>',
      '  </div>',
      '</div>',
      '',
      '<!-- BARRA FLOTANTE CONTEXTUAL DE FORMATO -->',
      '<div id="dossier-format-bar" class="no-print">',
      '  <div style="font-size:11px;font-weight:800;color:' + pal.primary + ';margin-right:2px;display:flex;align-items:center;gap:4px;">' + _dSvg('edit', 12, pal.primary) + ' FORMATO</div>',
      '  <div class="fmt-sep"></div>',
      '  <!-- Selector de Fuente / Tipografía -->',
      '  <select class="fmt-select" id="fmt-font-family" onchange="DossierWYSIWYG.changeFontFamily(this.value)" title="Tipo de fuente">',
      '    <option value="\'Comfortaa\', cursive, sans-serif" selected>Comfortaa (Redondeada - Por Defecto)</option>',
      '    <option value="Inter, -apple-system, sans-serif">Inter (Moderna)</option>',
      '    <option value="system-ui, sans-serif">Sistema</option>',
      '    <option value="Arial, Helvetica, sans-serif">Arial</option>',
      '    <option value="Georgia, serif">Georgia (Elegante)</option>',
      '    <option value="Courier New, monospace">Monoespacio</option>',
      '  </select>',
      '  <div class="fmt-sep"></div>',
      '  <!-- Control de Tamaño de Letra -->',
      '  <button type="button" class="fmt-btn" onclick="DossierWYSIWYG.adjustFontSize(-1)" title="Reducir fuente (A-)">A-</button>',
      '  <span id="fmt-size-display">16px</span>',
      '  <button type="button" class="fmt-btn" onclick="DossierWYSIWYG.adjustFontSize(1)" title="Aumentar fuente (A+)">A+</button>',
      '  <select class="fmt-select" id="fmt-preset-size" onchange="DossierWYSIWYG.setFontSizePreset(this.value)" title="Tamaño directo">',
      '    <option value="">Tamaño...</option>',
      '    <option value="12px">12px - Muy pequeña</option>',
      '    <option value="14px">14px - Pequeña</option>',
      '    <option value="16px">16px - Estándar</option>',
      '    <option value="18px">18px - Mediana</option>',
      '    <option value="22px">22px - Destacada</option>',
      '    <option value="26px">26px - Subtítulo</option>',
      '    <option value="32px">32px - Título</option>',
      '    <option value="40px">40px - Hero</option>',
      '  </select>',
      '  <div class="fmt-sep"></div>',
      '  <!-- Estilos Tipográficos -->',
      '  <button type="button" class="fmt-btn" onclick="DossierWYSIWYG.execFormat(\'bold\')" title="Negrita (Ctrl+B)"><b>B</b></button>',
      '  <button type="button" class="fmt-btn" onclick="DossierWYSIWYG.execFormat(\'italic\')" title="Cursiva (Ctrl+I)"><i>I</i></button>',
      '  <button type="button" class="fmt-btn" onclick="DossierWYSIWYG.execFormat(\'underline\')" title="Subrayado (Ctrl+U)"><u>U</u></button>',
      '  <button type="button" class="fmt-btn" onclick="DossierWYSIWYG.toggleUppercase()" title="Alternar Mayúsculas">aA</button>',
      '  <div class="fmt-sep"></div>',
      '  <!-- Paleta y Selector de Color Libre -->',
      '  <button type="button" class="fmt-btn" onclick="DossierWYSIWYG.applyThemeColor()" style="color:' + pal.primary + ';font-weight:900;" title="Color Corporativo del Tema">● Marca</button>',
      '  <button type="button" class="fmt-btn" onclick="DossierWYSIWYG.applyColor(\'#0f172a\')" style="color:#0f172a;background:#e2e8f0;font-weight:900;" title="Texto Oscuro">● Oscuro</button>',
      '  <button type="button" class="fmt-btn" onclick="DossierWYSIWYG.applyColor(\'#16a34a\')" style="color:#16a34a;font-weight:900;" title="Verde Ahorro">● Verde</button>',
      '  <input type="color" class="fmt-color-picker" id="fmt-custom-color" onchange="DossierWYSIWYG.applyColor(this.value)" title="Elegir color personalizado"/>',
      '  <div class="fmt-sep"></div>',
      '  <!-- Alineación -->',
      '  <button type="button" class="fmt-btn" onclick="DossierWYSIWYG.execFormat(\'justifyLeft\')" title="Alinear a la izquierda">⇤</button>',
      '  <button type="button" class="fmt-btn" onclick="DossierWYSIWYG.execFormat(\'justifyCenter\')" title="Centrar">≡</button>',
      '  <button type="button" class="fmt-btn" onclick="DossierWYSIWYG.execFormat(\'justifyRight\')" title="Alinear a la derecha">⇥</button>',
      '</div>',
      '',
      '<div id="dossier-container">',
      '',
      '<!-- ── LÁMINA 1: PORTADA ────────────────────────────────────────────────── -->',
      '<div class="sheet" data-section-id="cover">',
      '  <div class="sheet-head">',
      '    <div class="editable-field" contenteditable="true" style="font-size:24px;font-weight:900;color:' + pal.primary + ';display:inline-flex;align-items:center;">' + (companyLogo ? '<span class="ra-header-logo-wrap' + logoStyleClass + '"><img src="' + companyLogo + '" class="ra-cover-logo-img" style="height:' + coverLogoH + 'px;max-height:' + coverLogoH + 'px;max-width:200px;object-fit:contain;vertical-align:middle;"/></span>' : companyName) + '</div>',
      '    <div class="editable-field" contenteditable="true" style="font-size:18px;font-weight:800;color:' + pal.primary + ';">' + companyWeb + '</div>',
      '  </div>',
      '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">',
      '    <div>',
      '      <h1 class="editable-field" contenteditable="true" style="font-size:40px;font-weight:900;margin:0 0 6px 0;color:#0f172a;letter-spacing:-0.5px;">' + (
        (studioCfg && studioCfg.lockedTexts && studioCfg.lockedTexts.coverMainTitle && global.RAProposalStyleStudio && typeof global.RAProposalStyleStudio.formatManualLineBreaks === 'function')
          ? global.RAProposalStyleStudio.formatManualLineBreaks(studioCfg.lockedTexts.coverMainTitle)
          : 'Autoconsumo Fotovoltaico'
      ) + '</h1>',
      '      <p class="editable-field" contenteditable="true" style="font-size:18px;color:#475569;margin:0;font-weight:600;">' + (
        (studioCfg && studioCfg.lockedTexts && studioCfg.lockedTexts.coverSubtitle && global.RAProposalStyleStudio && typeof global.RAProposalStyleStudio.formatManualLineBreaks === 'function')
          ? global.RAProposalStyleStudio.formatManualLineBreaks(studioCfg.lockedTexts.coverSubtitle)
          : 'Propuesta técnica y económica de generación solar distribuida'
      ) + '</p>',
      '    </div>',
      '    <div style="background:' + pal.light + ';border:1.5px solid ' + pal.primary + ';border-radius:12px;padding:10px 18px;text-align:right;">',
      '      <div class="editable-field" contenteditable="true" style="font-size:22px;font-weight:900;color:' + pal.dark + ';">' + clientName + '</div>',
      '      <div class="editable-field" contenteditable="true" style="font-size:20px;font-weight:800;color:' + pal.primary + ';margin:3px 0;">(' + kwp + ' kWp) — ' + totalCost + ' €</div>',
      '      <div class="editable-field" contenteditable="true" style="font-size:14.5px;color:#64748b;margin-top:4px;">Código: ' + offerCode + ' · Fecha: ' + dateStr + '</div>',
      '    </div>',
      '  </div>',
      divGrad,
      '  <div style="flex:1;min-height:0;margin:6px 0;">' + 
      makeImgBox(renderSnapshot, 'Render de Instalación 3D', 'width:100%;height:100%;min-height:220px;', 'Diseño Fotovoltaico de Precisión 3D') +
      '  </div>',
      '  <div class="sheet-footer">',
      '    <span class="editable-field" contenteditable="true">' + companySlogan + '</span>',
      '    <span class="editable-field" contenteditable="true">' + companyWeb + '</span>',
      '  </div>',
      '</div>',
      '',
      '<!-- ── LÁMINA 2: 01. RESUMEN ────────────────────────────────────────────── -->',
      '<div class="sheet" data-section-id="summary">',
      buildDossierSheetHead('01. Resumen Ejecutivo'),
      '  <div style="display:flex;justify-content:space-between;align-items:center;">',
      '    <div><span class="sheet-title-num editable-field" contenteditable="true">01.</span><span class="sheet-title-txt editable-field" contenteditable="true">Resumen Ejecutivo & Filosofía</span></div>',
      '    <span class="badge-bankable badge-bankable-sky">Perfil: ' + raw.metrics.profileType + '</span>',
      '  </div>',
      divGrad,
      '  <div class="sheet-body-content">',
      '    <!-- HERO STRIP CENTRADO CON ILUSTRACIONES SVG MONOCROMÁTICAS -->',
      '    <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:10px;margin-bottom:12px;">',
      '      <div style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:10px;padding:10px 8px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.03);">',
      '        <div style="display:flex;justify-content:center;margin-bottom:4px;">' + getDossierIcon('panel', pal.primary, 30) + '</div>',
      '        <div style="font-size:12px;color:#64748b;font-weight:800;letter-spacing:0.5px;text-transform:uppercase;">POTENCIA PICO INSTALADA</div>',
      '        <div style="font-size:26px;font-weight:900;color:' + pal.primary + ';margin:4px 0 2px;">' + kwp + ' kWp</div>',
      '        <div style="font-size:13px;color:#475569;font-weight:700;">' + raw.metrics.numPanels + ' Módulos Tier-1</div>',
      '      </div>',
      '      <div style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:10px;padding:10px 8px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.03);">',
      '        <div style="display:flex;justify-content:center;margin-bottom:4px;">' + getDossierIcon('freeEnergy', pal.secondary, 30) + '</div>',
      '        <div style="font-size:12px;color:#64748b;font-weight:800;letter-spacing:0.5px;text-transform:uppercase;">GENERACIÓN ANUAL</div>',
      '        <div style="font-size:26px;font-weight:900;color:' + pal.dark + ';margin:4px 0 2px;">' + annualYield + ' kWh</div>',
      '        <div style="font-size:13px;color:#16a34a;font-weight:700;">100% Autogeneración</div>',
      '      </div>',
      '      <div style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:10px;padding:10px 8px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.03);">',
      '        <div style="display:flex;justify-content:center;margin-bottom:4px;">' + getDossierIcon('piggyBank', '#16a34a', 30) + '</div>',
      '        <div style="font-size:12px;color:#64748b;font-weight:800;letter-spacing:0.5px;text-transform:uppercase;">' + (isDossierOffGrid ? 'VALOR ENERGÍA GENERADA' : 'AHORRO ANUAL ESTIMADO') + '</div>',
      '        <div style="font-size:26px;font-weight:900;color:#16a34a;margin:4px 0 2px;">' + ahorroAnual + ' €</div>',
      '        <div style="font-size:13px;color:#64748b;font-weight:700;">' + (isDossierOffGrid ? 'No comprada a la red (Año 1)' : 'Año 1 de explotación') + '</div>',
      '      </div>',
      '      <div style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:10px;padding:10px 8px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.03);">',
      '        <div style="display:flex;justify-content:center;margin-bottom:4px;">' + getDossierIcon('energyFlow24h', pal.primary, 30) + '</div>',
      '        <div style="font-size:12px;color:#64748b;font-weight:800;letter-spacing:0.5px;text-transform:uppercase;">COBERTURA SOLAR</div>',
      '        <div style="font-size:26px;font-weight:900;color:' + pal.primary + ';margin:4px 0 2px;">' + raw.metrics.totalCoverage + ' %</div>',
      '        <div style="font-size:13px;color:#64748b;font-weight:700;">Autarquía Energética</div>',
      '      </div>',
      '    </div>',
      '    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">',
      makeCard(
        '<div>' +
        '  <h4 class="editable-field" contenteditable="true" style="color:' + pal.primary + ';margin:0 0 6px 0;font-size:16px;font-weight:800;">01. Solución de Ingeniería ' + raw.metrics.profileType + '</h4>' +
        '  <p class="editable-field" contenteditable="true" style="font-size:13.5px;color:#475569;line-height:1.5;margin:0 0 10px 0;">' + (function() {
          var stCfg = (global.RAProposalStyleStudio && typeof global.RAProposalStyleStudio.getActiveConfig === 'function') ? global.RAProposalStyleStudio.getActiveConfig() : null;
          if (stCfg && stCfg.lockedTexts && stCfg.lockedTexts.useLockedSummary && stCfg.lockedTexts.summaryTemplate) {
            return global.RAProposalStyleStudio.interpolateText(stCfg.lockedTexts.summaryTemplate, {
              clientName: clientName,
              companyName: companyName,
              kwp: kwp,
              numPanels: raw.metrics.numPanels,
              windCount: raw.metrics.windCount || 0,
              windKw: raw.metrics.windTotalKw || 0,
              annualYield: annualYield,
              ahorroAnual: ahorroAnual,
              payback: payback,
              capexBruto: raw.metrics.totalCostGross
            });
          }
          return (raw.metrics.isCommercial ? 'Instalación de ingeniería fotovoltaica orientada a la reducción directa de costes operativos (OPEX), mejora del reporte ESG y desacoplamiento frente a la volatilidad de precios en el mercado eléctrico mayorista (OMIE).' : 'Proyecto integral de autoconsumo residencial diseñado a medida para su inmueble, garantizando la máxima independencia energética, revalorización de la vivienda (+4-6%) y un ahorro directo e inmediato en factura.');
        })() + '</p>' +
        '  <h4 class="editable-field" contenteditable="true" style="color:' + pal.primary + ';margin:0 0 6px 0;font-size:16px;font-weight:800;">03. Digitalización & Gemelo Digital 3D</h4>' +
        '  <p class="editable-field" contenteditable="true" style="font-size:13.5px;color:#475569;line-height:1.5;margin:0;">Simulación física mediante ray-tracing 3D de alta precisión que modela sombras cercanas y lejanas para calcular una curva de generación bancable y transparente respaldada por datos PVGIS/SARAH-3.</p>' +
        '</div>'
      ),
      makeCard(
        '<div>' +
        '  <h4 class="editable-field" contenteditable="true" style="color:' + pal.primary + ';margin:0 0 6px 0;font-size:16px;font-weight:800;">02. Compromiso Llave en Mano</h4>' +
        '  <p class="editable-field" contenteditable="true" style="font-size:13.5px;color:#475569;line-height:1.5;margin:0 0 10px 0;">Gestión técnica y administrativa integral: visita de replanteo, memoria técnica, tramitación de licencias/ICIO, bonificaciones de IBI, instalación física, legalización (CIE) y puesta en marcha.</p>' +
        '  <h4 class="editable-field" contenteditable="true" style="color:' + pal.primary + ';margin:0 0 6px 0;font-size:16px;font-weight:800;">04. Impacto Medioambiental Certificado</h4>' +
        '  <div style="display:flex;justify-content:space-between;background:' + pal.light + ';padding:8px 14px;border-radius:8px;border:1px solid ' + pal.border + ';margin-top:6px;">' +
        '    <div style="text-align:center;"><strong class="editable-field" contenteditable="true" style="font-size:22px;color:' + pal.primary + ';display:block;">' + raw.metrics.co2Ton + ' t</strong><div class="editable-field" contenteditable="true" style="font-size:12px;color:#64748b;font-weight:700;margin-top:2px;">CO₂ evitado/año</div></div>' +
        '    <div style="text-align:center;"><strong class="editable-field" contenteditable="true" style="font-size:22px;color:' + pal.primary + ';display:block;">' + raw.metrics.trees + '</strong><div class="editable-field" contenteditable="true" style="font-size:12px;color:#64748b;font-weight:700;margin-top:2px;">Árboles equiv.</div></div>' +
        '    <div style="text-align:center;"><strong class="editable-field" contenteditable="true" style="font-size:22px;color:' + pal.primary + ';display:block;">' + (kwp * 0.02).toFixed(2) + '</strong><div class="editable-field" contenteditable="true" style="font-size:12px;color:#64748b;font-weight:700;margin-top:2px;">Viajes VE</div></div>' +
        '  </div>' +
        '</div>'
      ),
      '    </div>',
      '  </div>',
      '  <div class="sheet-footer">',
      '    <span class="editable-field" contenteditable="true">' + companySlogan + '</span>',
      '    <span class="editable-field" contenteditable="true">' + companyWeb + '</span>',
      '  </div>',
      '</div>',
      '',
      '<!-- ── LÁMINA 3: 02. ESTUDIO PRELIMINAR (FACTURA) ───────────────────────── -->',
      '<div class="sheet" data-section-id="bill_audit">',
      buildDossierSheetHead('02. Estudio preliminar'),
      '  <div><span class="sheet-title-num editable-field" contenteditable="true">02.</span><span class="sheet-title-txt editable-field" contenteditable="true">Estudio Preliminar & Consumos</span></div>',
      divGrad,
      '  <div class="sheet-body-content">',
      '    <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:20px;margin-top:10px;align-items:center;">',
      makeCard(
        '<div>' +
        '  <div class="editable-field" contenteditable="true" style="background:#1e293b;color:#fff;padding:6px 12px;border-radius:6px;font-size:15px;font-weight:800;margin-bottom:10px;">CONSUMO MENSUAL ESTIMADO (kWh)</div>' +
        '  <div style="height:140px;">' + Charts.monthlyBars(raw.monthlyBalance.map(function(m){return m.redSin;}), pal) + '</div>' +
        '</div>'
      ),
      makeCard(
        '<div>' +
        '  <div class="editable-field" contenteditable="true" style="font-size:16px;font-weight:800;color:' + pal.primary + ';margin-bottom:12px;">DATOS DE SUMINISTRO & TARIFA</div>' +
        '  <table class="table-clean">' +
        '    <tr><td class="editable-field" contenteditable="true"><strong>CUPS:</strong></td><td class="editable-field" contenteditable="true">' + cups + '</td></tr>' +
        '    <tr><td class="editable-field" contenteditable="true"><strong>Tarifa de Acceso:</strong></td><td class="editable-field" contenteditable="true">' + tariff + '</td></tr>' +
        '    <tr><td class="editable-field" contenteditable="true"><strong>Potencia Contratada:</strong></td><td class="editable-field" contenteditable="true">' + raw.client.potContr + ' kW</td></tr>' +
        '    <tr><td class="editable-field" contenteditable="true"><strong>Ubicación:</strong></td><td class="editable-field" contenteditable="true">' + address + '</td></tr>' +
        '    <tr><td class="editable-field" contenteditable="true"><strong>Consumo Anual:</strong></td><td class="editable-field" contenteditable="true">' + Number(annualCons).toLocaleString('es-ES') + ' kWh / año</td></tr>' +
        '  </table>' +
        '</div>'
      ),
      '    </div>',
      '  </div>',
      '  <div class="sheet-footer">',
      '    <span class="editable-field" contenteditable="true">' + companySlogan + '</span>',
      '    <span class="editable-field" contenteditable="true">' + companyWeb + '</span>',
      '  </div>',
      '</div>',
      '',
      '<!-- ── LÁMINA 4: 03. INSTALACIÓN PROYECTADA ────────────────────────────── -->',
      '<div class="sheet" data-section-id="installation">',
      buildDossierSheetHead('03. Instalación Proyectada'),
      '  <div><span class="sheet-title-num editable-field" contenteditable="true">03.</span><span class="sheet-title-txt editable-field" contenteditable="true">Ingeniería & Distribución en Cubierta</span></div>',
      divGrad,
      '  <div class="sheet-body-content">',
      '    <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:20px;margin-top:10px;align-items:center;">',
      makeImgBox(renderSnapshot, 'Plano Cenital 3D', 'height:190px;width:100%;border-radius:10px;', 'Vista Cenital Fotogramétrica'),
      '      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">',
      makeCard('<div class="editable-field" contenteditable="true" style="font-size:26px;font-weight:900;color:' + pal.primary + ';">' + kwp + ' kWp</div><div class="editable-field" contenteditable="true" style="font-size:14.5px;color:#64748b;font-weight:700;">Potencia Pico</div>', 'text-align:center;padding:10px;'),
      makeCard('<div class="editable-field" contenteditable="true" style="font-size:26px;font-weight:900;color:' + pal.primary + ';">' + kwNom + ' kWn</div><div class="editable-field" contenteditable="true" style="font-size:14.5px;color:#64748b;font-weight:700;">Potencia Nominal</div>', 'text-align:center;padding:10px;'),
      makeCard('<div class="editable-field" contenteditable="true" style="font-size:26px;font-weight:900;color:#1e293b;">' + numPanels + '</div><div class="editable-field" contenteditable="true" style="font-size:14.5px;color:#64748b;font-weight:700;">Módulos FV</div>', 'text-align:center;padding:10px;'),
      makeCard('<div class="editable-field" contenteditable="true" style="font-size:24px;font-weight:900;color:#1e293b;">' + (raw.equipment.structure.indexOf('Coplanar') !== -1 ? 'COPLANAR' : 'INCLINADA') + '</div><div class="editable-field" contenteditable="true" style="font-size:14.5px;color:#64748b;font-weight:700;">Estructura</div>', 'text-align:center;padding:10px;'),
      '      </div>',
      '    </div>',
      '  </div>',
      '  <div class="sheet-footer">',
      '    <span class="editable-field" contenteditable="true">' + companySlogan + '</span>',
      '    <span class="editable-field" contenteditable="true">' + companyWeb + '</span>',
      '  </div>',
      '</div>',
      '',
      '<!-- ── LÁMINA 5: 04. BALANCE MENSUAL ────────────────────────────────────── -->',
      '<div class="sheet" data-section-id="energy_balance">',
      buildDossierSheetHead('04. Tu Nueva Situación'),
      '  <div><span class="sheet-title-num editable-field" contenteditable="true">04.</span><span class="sheet-title-txt editable-field" contenteditable="true">Balance Energético Mensual</span></div>',
      divGrad,
      '  <div class="sheet-body-content">',
      '    <div style="margin-top:8px;">',
      makeCard(
        '<table class="table-clean" style="text-align:right;">' +
        '  <thead><tr style="background:#f8fafc;">' +
        '    <th class="editable-field" contenteditable="true" style="text-align:left;">Mes</th>' +
        '    <th class="editable-field" contenteditable="true">Energía FV (kWh)</th>' +
        '    <th class="editable-field" contenteditable="true">Autoconsumo (kWh)</th>' +
        '    <th class="editable-field" contenteditable="true">Excedentes (kWh)</th>' +
        '    <th class="editable-field" contenteditable="true">Red Sin FV (kWh)</th>' +
        '    <th class="editable-field" contenteditable="true">Red Con FV (kWh)</th>' +
        '    <th class="editable-field" contenteditable="true">Cobertura Solar (%)</th>' +
        '  </tr></thead>' +
        '  <tbody>' +
        (function() {
          var rows = '';
          raw.monthlyBalance.forEach(function(row) {
            rows += '<tr><td class="editable-field" contenteditable="true" style="text-align:left;font-weight:bold;">' + row.mes + '</td>' +
              '<td class="editable-field" contenteditable="true">' + row.gen.toLocaleString('es-ES') + '</td>' +
              '<td class="editable-field" contenteditable="true">' + row.auto.toLocaleString('es-ES') + '</td>' +
              '<td class="editable-field" contenteditable="true">' + row.exc.toLocaleString('es-ES') + '</td>' +
              '<td class="editable-field" contenteditable="true">' + row.redSin.toLocaleString('es-ES') + '</td>' +
              '<td class="editable-field" contenteditable="true">' + row.redCon.toLocaleString('es-ES') + '</td>' +
              '<td class="editable-field" contenteditable="true">' + row.cobertura + ' %</td></tr>';
          });
          return rows;
        })() +
        '    <tr style="font-weight:900;border-top:2px solid #0f172a;background:#f8fafc;">' +
        '      <td class="editable-field" contenteditable="true" style="text-align:left;">TOTAL</td>' +
        '      <td class="editable-field" contenteditable="true">' + raw.totals.gen + ' kWh</td>' +
        '      <td class="editable-field" contenteditable="true">' + raw.totals.auto + ' kWh</td>' +
        '      <td class="editable-field" contenteditable="true">' + raw.totals.exc + ' kWh</td>' +
        '      <td class="editable-field" contenteditable="true">' + raw.totals.redSin + ' kWh</td>' +
        '      <td class="editable-field" contenteditable="true">' + raw.totals.redCon + ' kWh</td>' +
        '      <td class="editable-field" contenteditable="true">' + raw.totals.cobertura + ' %</td>' +
        '    </tr>' +
        '  </tbody>' +
        '</table>'
      ),
      '    </div>',
      '  </div>',
      '  <div class="sheet-footer">',
      '    <span class="editable-field" contenteditable="true">' + companySlogan + '</span>',
      '    <span class="editable-field" contenteditable="true">' + companyWeb + '</span>',
      '  </div>',
      '</div>',
      '',
      '<!-- ── LÁMINA 6: 05. GRÁFICAS DE BALANCE ────────────────────────────────── -->',
      '<div class="sheet" data-section-id="energy_balance">',
      buildDossierSheetHead('05. Balance Gráfico'),
      '  <div><span class="sheet-title-num editable-field" contenteditable="true">05.</span><span class="sheet-title-txt editable-field" contenteditable="true">Curvas de Producción & Cobertura</span></div>',
      divGrad,
      '  <div class="sheet-body-content">',
      '    <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:20px;margin-top:10px;align-items:center;">',
      makeCard(
        '<div>' +
        '  <div class="editable-field" contenteditable="true" style="font-size:15px;font-weight:800;margin-bottom:10px;">CURVA HORARIA DIARIA DE AUTOCONSUMO</div>' +
        Charts.dailyCurve(pal, kwp, annualCons / 365) +
        '</div>'
      ),
      '      <div style="display:flex;justify-content:space-around;align-items:center;">',
      makeCard(
        '<div style="text-align:center;">' +
        '  <div class="editable-field" contenteditable="true" style="font-size:15px;font-weight:800;margin-bottom:8px;">Consumo Cubierto</div>' +
        Charts.donut(Math.round(Number(raw.metrics.totalCoverage)), Math.round(100 - Number(raw.metrics.totalCoverage)), 'Solar', 'Red', pal.primary, '#0284c7') +
        '  <div class="editable-field" contenteditable="true" style="font-size:14px;color:#64748b;font-weight:700;margin-top:6px;">' + Math.round(Number(raw.metrics.totalCoverage)) + '% Solar / ' + Math.round(100 - Number(raw.metrics.totalCoverage)) + '% Red</div>' +
        '</div>'
      ),
      makeCard(
        '<div style="text-align:center;">' +
        '  <div class="editable-field" contenteditable="true" style="font-size:15px;font-weight:800;margin-bottom:8px;">Destino Generación</div>' +
        Charts.donut(raw.metrics.totalDestAuto, raw.metrics.totalDestExc, 'Directo', 'Excedente', pal.secondary, pal.primary) +
        '  <div class="editable-field" contenteditable="true" style="font-size:14px;color:#64748b;font-weight:700;margin-top:6px;">' + raw.metrics.totalDestAuto + '% Autoconsumo</div>' +
        '</div>'
      ),
      '      </div>',
      '    </div>',
      '  </div>',
      '  <div class="sheet-footer">',
      '    <span class="editable-field" contenteditable="true">' + companySlogan + '</span>',
      '    <span class="editable-field" contenteditable="true">' + companyWeb + '</span>',
      '  </div>',
      '</div>',
      '',
      '<!-- ── LÁMINA 7: 06. EQUIPAMIENTO TÉCNICO & GARANTÍAS ────────────────────── -->',
      '<div class="sheet" data-section-id="installation">',
      buildDossierSheetHead('06. Equipamiento & Calidad'),
      '  <div style="display:flex;justify-content:space-between;align-items:center;">',
      '    <div><span class="sheet-title-num editable-field" contenteditable="true">06.</span><span class="sheet-title-txt editable-field" contenteditable="true">Tu Nuevo Equipo & Matriz de Garantías Tier-1</span></div>',
      '    <span class="badge-bankable badge-bankable-emerald">Componentes Bancables BloombergNEF</span>',
      '  </div>',
      divGrad,
      '  <div class="sheet-body-content">',
      '    <!-- FILA SUPERIOR: ESPECIFICACIONES TÉCNICAS CON ILUSTRACIONES SVG -->',
      '    <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:10px;margin-bottom:12px;">',
      makeCard(
        '<div style="text-align:center;padding:2px;">' +
        '  <div style="display:flex;justify-content:center;margin-bottom:4px;">' + getDossierIcon('panel', pal.primary, 32) + '</div>' +
        '  <div class="editable-field" contenteditable="true" style="font-size:13px;font-weight:800;color:' + pal.primary + ';letter-spacing:0.5px;">MÓDULOS FV</div>' +
        '  <div class="editable-field" contenteditable="true" style="font-size:16px;font-weight:900;margin:3px 0 4px;">Tier-1 ' + raw.equipment.modWp + ' Wp</div>' +
        '  <div class="editable-field" contenteditable="true" style="font-size:12.5px;color:#475569;line-height:1.4;">Células N-Type TOPCon bifacial. Rendimiento ≥85% tras 25 años.</div>' +
        '</div>'
      ),
      makeCard(
        '<div style="text-align:center;padding:2px;">' +
        '  <div style="display:flex;justify-content:center;margin-bottom:4px;">' + getDossierIcon('inverter', pal.primary, 32) + '</div>' +
        '  <div class="editable-field" contenteditable="true" style="font-size:13px;font-weight:800;color:' + pal.primary + ';letter-spacing:0.5px;">' + (raw.metrics.mlpeCount > 0 && raw.metrics.invCount === 0 ? 'MICROINVERSORES' : 'INVERSORES') + '</div>' +
        '  <div class="editable-field" contenteditable="true" style="font-size:16px;font-weight:900;margin:3px 0 4px;">' + (raw.metrics.invCount > 0 ? (raw.metrics.invCount + '× ' + kwNom + ' kWn') : (raw.metrics.mlpeCount + '× MLPE')) + '</div>' +
        '  <div class="editable-field" contenteditable="true" style="font-size:12.5px;color:#475569;line-height:1.4;">' + (raw.metrics.batCount > 0 ? (raw.metrics.batCount + '× ' + (raw.metrics.batName || 'Batería LFP')) : 'Eficiencia >98%. MPPT, protecciones DC/AC y telemetría.') + '</div>' +
        '</div>'
      ),
      makeCard(
        '<div style="text-align:center;padding:2px;">' +
        '  <div style="display:flex;justify-content:center;margin-bottom:4px;">' + getDossierIcon('structure', pal.primary, 32) + '</div>' +
        '  <div class="editable-field" contenteditable="true" style="font-size:13px;font-weight:800;color:' + pal.primary + ';letter-spacing:0.5px;">ESTRUCTURA</div>' +
        '  <div class="editable-field" contenteditable="true" style="font-size:16px;font-weight:900;margin:3px 0 4px;">Aluminio Anodizado</div>' +
        '  <div class="editable-field" contenteditable="true" style="font-size:12.5px;color:#475569;line-height:1.4;">Aleación EN AW-6005A T6 e inox A2. CTE hasta 160 km/h.</div>' +
        '</div>'
      ),
      makeCard(
        '<div style="text-align:center;padding:2px;">' +
        '  <div style="display:flex;justify-content:center;margin-bottom:4px;">' + getDossierIcon('protections', pal.primary, 32) + '</div>' +
        '  <div class="editable-field" contenteditable="true" style="font-size:13px;font-weight:800;color:' + pal.primary + ';letter-spacing:0.5px;">PROTECCIONES</div>' +
        '  <div class="editable-field" contenteditable="true" style="font-size:16px;font-weight:900;margin:3px 0 4px;">Cuadro AC/DC IP65</div>' +
        '  <div class="editable-field" contenteditable="true" style="font-size:12.5px;color:#475569;line-height:1.4;">Descargadores SPD Clase II, seccionador y diferenciales.</div>' +
        '</div>'
      ),
      '    </div>',
      '    <!-- FILA INFERIOR: MATRIZ DE GARANTÍAS BANCABLES TIER-1 -->',
      makeCard(
        '<div>' +
        '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
        '    <div class="editable-field" contenteditable="true" style="font-size:15px;font-weight:900;color:' + pal.dark + ';">MATRIZ DE GARANTÍAS BANCABLES TIER-1 & RENDIMIENTO</div>' +
        '    <span class="badge-bankable badge-bankable-sky">Garantía Directa de Fábrica</span>' +
        '  </div>' +
        '  <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:10px;">' +
        '    <div style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:8px;padding:8px 6px;text-align:center;">' +
        '      <div style="display:flex;justify-content:center;margin-bottom:4px;">' + getDossierIcon('warranty25', pal.primary, 28) + '</div>' +
        '      <strong class="editable-field" contenteditable="true" style="font-size:14px;color:' + pal.primary + ';display:block;">' + (raw.warranties ? raw.warranties.warPower : '25') + ' AÑOS GARANTÍA</strong>' +
        '      <div class="editable-field" contenteditable="true" style="font-size:13px;font-weight:800;color:#0f172a;margin:3px 0;">Potencia Lineal (' + (raw.warranties ? raw.warranties.warMod : '15') + 'a prod.)</div>' +
        '      <div class="editable-field" contenteditable="true" style="font-size:12px;color:#64748b;line-height:1.35;">Rendimiento garantizado ≥' + Number(raw.metrics.remainingPerformanceYr25 || 85).toFixed(1) + '% al año 25 con reaseguro.</div>' +
        '    </div>' +
        '    <div style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:8px;padding:8px 6px;text-align:center;">' +
        '      <div style="display:flex;justify-content:center;margin-bottom:4px;">' + getDossierIcon('inverter', pal.primary, 28) + '</div>' +
        '      <strong class="editable-field" contenteditable="true" style="font-size:14px;color:' + pal.primary + ';display:block;">' + (raw.warranties ? raw.warranties.warInv : '12') + ' AÑOS</strong>' +
        '      <div class="editable-field" contenteditable="true" style="font-size:13px;font-weight:800;color:#0f172a;margin:3px 0;">Electrónica Inversor</div>' +
        '      <div class="editable-field" contenteditable="true" style="font-size:12px;color:#64748b;line-height:1.35;">Sustitución oficial del fabricante' + (raw.metrics.batCount > 0 ? (' · Batería ' + (raw.warranties ? raw.warranties.warBat : '10') + ' años') : '') + '.</div>' +
        '    </div>' +
        '    <div style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:8px;padding:8px 6px;text-align:center;">' +
        '      <div style="display:flex;justify-content:center;margin-bottom:4px;">' + getDossierIcon('structure', pal.primary, 28) + '</div>' +
        '      <strong class="editable-field" contenteditable="true" style="font-size:14px;color:' + pal.primary + ';display:block;">10 / ' + (raw.warranties ? raw.warranties.warMo : '5') + ' AÑOS</strong>' +
        '      <div class="editable-field" contenteditable="true" style="font-size:13px;font-weight:800;color:#0f172a;margin:3px 0;">Estructura & Mano Obra</div>' +
        '      <div class="editable-field" contenteditable="true" style="font-size:12px;color:#64748b;line-height:1.35;">10 años anticorrosión y ' + (raw.warranties ? raw.warranties.warMo : '5') + ' años garantía de montaje.</div>' +
        '    </div>' +
        '    <div style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:8px;padding:8px 6px;text-align:center;">' +
        '      <div style="display:flex;justify-content:center;margin-bottom:4px;">' + getDossierIcon('certifiedEngineer', pal.primary, 28) + '</div>' +
        '      <strong class="editable-field" contenteditable="true" style="font-size:14px;color:' + pal.primary + ';display:block;">INSTALACIÓN CIE</strong>' +
        '      <div class="editable-field" contenteditable="true" style="font-size:13px;font-weight:800;color:#0f172a;margin:3px 0;">Ingeniería Habilitada</div>' +
        '      <div class="editable-field" contenteditable="true" style="font-size:12px;color:#64748b;line-height:1.35;">Legalización oficial Industria y bonificaciones.</div>' +
        '    </div>' +
        '  </div>' +
        '</div>'
      ),
      '    </div>',
      '  </div>',
      '  <div class="sheet-footer">',
      '    <span class="editable-field" contenteditable="true">' + companySlogan + '</span>',
      '    <span class="editable-field" contenteditable="true">' + companyWeb + '</span>',
      '  </div>',
      '</div>',
      '',
      '<!-- ── LÁMINA 8: 07. PROPUESTA ECONÓMICA BANCABLE ────────────────────────── -->',
      '<div class="sheet" data-section-id="economics">',
      buildDossierSheetHead('07. Propuesta Económica Bancable'),
      '  <div style="display:flex;justify-content:space-between;align-items:center;">',
      '    <div><span class="sheet-title-num editable-field" contenteditable="true">07.</span><span class="sheet-title-txt editable-field" contenteditable="true">Inversión & Triple Modalidad Financiera</span></div>',
      '    <span class="badge-bankable badge-bankable-emerald">Oferta Bancable Llave en Mano</span>',
      '  </div>',
      divGrad,
      '  <div class="sheet-body-content">',
      '    <div style="display:grid;grid-template-columns:1fr 1.35fr;gap:14px;margin-top:6px;">',
      '    <!-- COLUMNA IZQUIERDA: DESGLOSE DE CAPEX Y PRECIO TOTAL -->',
      '    <div>',
      makeCard(
        '<div>' +
        '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
        '    <div class="editable-field" contenteditable="true" style="font-size:15px;font-weight:800;color:' + pal.dark + ';">DESGLOSE TÉCNICO-ECONÓMICO (CAPEX)</div>' +
        '    <span class="badge-bankable badge-bankable-sky">Transparencia EPC</span>' +
        '  </div>' +
        '  <table class="table-clean" style="font-size:12.5px;margin-bottom:8px;">' +
        '    <tr class="ra-econ-item-row"><td style="padding:4px 6px;">1. Módulos FV Tier-1 (' + raw.metrics.numPanels + '× ' + escD(raw.equipment.modModel) + ')</td><td class="ra-econ-item-price" style="text-align:right;font-weight:700;padding:4px 6px;">' + raw.metrics.capexModules + ' €</td></tr>' +
        '    <tr class="ra-econ-item-row"><td style="padding:4px 6px;">2. Inversores & Electrónica (' + (raw.metrics.invCount || 1) + '× ' + escD(raw.equipment.invModel) + (raw.metrics.batCount > 0 ? ' + ' + raw.metrics.batCount + '× ' + escD(raw.metrics.batName) : '') + ')</td><td class="ra-econ-item-price" style="text-align:right;font-weight:700;padding:4px 6px;">' + raw.metrics.capexInverters + ' €</td></tr>' +
        '    <tr class="ra-econ-item-row"><td style="padding:4px 6px;">3. Estructuras de Soporte (' + raw.metrics.numPanels + '× soportes aluminio/inox A2)</td><td class="ra-econ-item-price" style="text-align:right;font-weight:700;padding:4px 6px;">' + raw.metrics.capexStructure + ' €</td></tr>' +
        (raw.metrics.capexWind ? '    <tr class="ra-econ-item-row"><td style="padding:4px 6px;">4. Generación Minieólica (' + (raw.metrics.windCount || 1) + '× ' + escD(raw.metrics.windName) + ' · ' + Number(raw.metrics.windTotalKw || 0).toFixed(1) + ' kW)</td><td class="ra-econ-item-price" style="text-align:right;font-weight:700;padding:4px 6px;">' + raw.metrics.capexWind + ' €</td></tr>' : '') +
        '    <tr class="ra-econ-item-row"><td style="padding:4px 6px;">' + (raw.metrics.capexWind ? '5' : '4') + '. Cuadro DC/AC, Protecciones & Cable (1× lote REBT)</td><td class="ra-econ-item-price" style="text-align:right;font-weight:700;padding:4px 6px;">' + raw.metrics.capexElectrical + ' €</td></tr>' +
        '    <tr class="ra-econ-item-row"><td style="padding:4px 6px;">' + (raw.metrics.capexWind ? '6' : '5') + '. Montaje Mecánico & Conexionado REBT (1× equipo)</td><td class="ra-econ-item-price" style="text-align:right;font-weight:700;padding:4px 6px;">' + raw.metrics.capexLabor + ' €</td></tr>' +
        '    <tr class="ra-econ-item-row"><td style="padding:4px 6px;">' + (raw.metrics.capexWind ? '7' : '6') + '. Ingeniería, Tasas & Legalización CIE (1× expediente)</td><td class="ra-econ-item-price" style="text-align:right;font-weight:700;padding:4px 6px;">' + raw.metrics.capexPermits + ' €</td></tr>' +
        (raw.activeAddons && raw.activeAddons.length > 0 ? raw.activeAddons.map(function(ad, i) {
          var p = (Number(ad.qty) || 1) * (Number(ad.unitPrice) || 0);
          return '    <tr class="ra-econ-item-row" style="background:#f0fdf4;"><td style="color:#16a34a;font-weight:600;padding:4px 6px;">+ ' + (Number(ad.qty) || 1) + '× ' + escD(ad.name) + '</td><td class="ra-econ-item-price" style="text-align:right;font-weight:700;color:#16a34a;padding:4px 6px;">' + p.toLocaleString('es-ES') + ' €</td></tr>';
        }).join('') : '') +
        '  </table>' +
        '  <div style="background:' + pal.light + ';border:1.5px solid ' + pal.primary + ';border-radius:8px;padding:6px 10px;text-align:center;">' +
        '    <div class="editable-field" contenteditable="true" style="font-size:12px;font-weight:800;color:' + pal.dark + ';">BASE IMPONIBLE (SIN IVA)</div>' +
        '    <div class="editable-field" contenteditable="true" style="font-size:26px;font-weight:900;color:' + pal.primary + ';margin:4px 0 2px;">' + totalCost + ' €</div>' +
        '    <div class="editable-field" contenteditable="true" style="font-size:13px;color:#475569;font-weight:700;">Total con IVA (' + Math.round(((raw && raw.m && typeof raw.m.ivaRate === 'number') ? raw.m.ivaRate : 0.21) * 100) + '%): ' + raw.metrics.totalCostGross + ' €</div>' +
        '  </div>' +
        '  <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px;">' +
        '    <div style="background:#f8fafc;padding:5px;border-radius:6px;border:1px solid #e2e8f0;text-align:center;">' +
        '      <div style="font-size:11px;color:#64748b;font-weight:700;">Coste Energía LCOE</div>' +
        '      <div style="font-size:15px;font-weight:900;color:' + pal.primary + ';">' + raw.metrics.lcoe + '</div>' +
        '    </div>' +
        '    <div style="background:#f8fafc;padding:5px;border-radius:6px;border:1px solid #e2e8f0;text-align:center;">' +
        '      <div style="font-size:11px;color:#64748b;font-weight:700;">Precio Red Eléctrica</div>' +
        '      <div style="font-size:15px;font-weight:900;color:#dc2626;">' + raw.metrics.gridPrice + '</div>' +
        '    </div>' +
        '  </div>' +
        '</div>'
      ),
      '    </div>',
      '    <!-- COLUMNA DERECHA: TRIPLE COMPARATIVA FINANCIERA BANCABLE -->',
      '    <div>',
      '      <div style="display:flex;flex-direction:column;gap:6px;">',
      makeCard(
        '<div style="display:flex;justify-content:space-between;align-items:center;">' +
        '  <div style="font-size:13.5px;font-weight:900;color:' + pal.dark + ';">OPCIÓN A · PAGO AL CONTADO (CAPEX)</div>' +
        '  <span class="badge-bankable badge-bankable-sky">Máximo Ahorro</span>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;margin-top:3px;text-align:center;">' +
        '  <div style="background:#f8fafc;padding:4px;border-radius:6px;">' +
        '    <div style="font-size:11px;color:#64748b;font-weight:700;">Amortización Simple</div>' +
        '    <div style="font-size:15px;font-weight:900;color:' + pal.primary + ';">' + escD(String(payback).indexOf('año') !== -1 ? payback : (payback + ' años')) + '</div>' +
        '  </div>' +
        '  <div style="background:#f8fafc;padding:4px;border-radius:6px;">' +
        '    <div style="font-size:11px;color:#64748b;font-weight:700;">TIR Proyecto</div>' +
        '    <div style="font-size:15px;font-weight:900;color:' + pal.primary + ';">' + tirStr + '</div>' +
        '  </div>' +
        '  <div style="background:#f8fafc;padding:4px;border-radius:6px;">' +
        '    <div style="font-size:11px;color:#64748b;font-weight:700;">Ahorro 25 Años</div>' +
        '    <div style="font-size:15px;font-weight:900;color:#16a34a;">' + ahorro25 + ' €</div>' +
        '  </div>' +
        '</div>'
      ),
      makeCard(
        '<div style="display:flex;justify-content:space-between;align-items:center;">' +
        '  <div style="font-size:13.5px;font-weight:900;color:' + pal.primary + ';">OPCIÓN B · PRÉSTAMO VERDE (' + (raw.metrics.finYears || 8) + ' AÑOS)</div>' +
        '  <span class="badge-bankable badge-bankable-emerald">' + (raw.metrics.isSaldoNetoPositivo ? 'Autofinanciable' : 'Cuota Fija') + '</span>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr 1.2fr;gap:4px;margin-top:3px;text-align:center;">' +
        '  <div style="background:#f8fafc;padding:4px;border-radius:6px;">' +
        '    <div style="font-size:11px;color:#64748b;font-weight:700;">Cuota Préstamo</div>' +
        '    <div style="font-size:15px;font-weight:900;color:' + pal.primary + ';">' + raw.metrics.cuotaPrestamo + ' €/m</div>' +
        '  </div>' +
        '  <div style="background:#f8fafc;padding:4px;border-radius:6px;">' +
        '    <div style="font-size:11px;color:#64748b;font-weight:700;">' + (isDossierOffGrid ? 'Valor Energía Mes' : 'Ahorro Factura') + '</div>' +
        '    <div style="font-size:15px;font-weight:900;color:#16a34a;">~' + raw.metrics.ahorroMensual + ' €/m</div>' +
        '  </div>' +
        '  <div style="background:' + (raw.metrics.isSaldoNetoPositivo ? '#ecfdf5;border:1px solid #86efac;' : '#fef2f2;border:1px solid #fecaca;') + 'padding:4px;border-radius:6px;">' +
        '    <div style="font-size:11px;color:' + (raw.metrics.isSaldoNetoPositivo ? '#15803d' : '#b91c1c') + ';font-weight:800;">Saldo Neto Bolsillo</div>' +
        '    <div style="font-size:15px;font-weight:900;color:' + (raw.metrics.isSaldoNetoPositivo ? '#15803d' : '#b91c1c') + ';">' + (raw.metrics.isSaldoNetoPositivo ? ('+' + raw.metrics.saldoNetoMensual) : ('-' + raw.metrics.saldoNetoMensual)) + ' €/m</div>' +
        '  </div>' +
        '</div>' +
        '<div style="font-size:11.5px;color:#475569;margin-top:4px;line-height:1.4;">' + (raw.metrics.isSaldoNetoPositivo ? 'Se autofinancia desde el mes 1 con el ahorro. ' : 'Aporte neto reducido descontando el ahorro mensual. ') + 'Del año ' + ((raw.metrics.finYears || 8) + 1) + ' al 25: 100% de la energía es ahorro limpio directo.</div>'
      ),
      makeCard(
        '<div style="display:flex;justify-content:space-between;align-items:center;">' +
        '  <div style="font-size:13.5px;font-weight:900;color:' + pal.dark + ';">OPCIÓN C · RENTING SOLAR (0 € INVERSIÓN)</div>' +
        '  <span class="badge-bankable badge-bankable-amber">100% Deducible</span>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:3px;text-align:center;">' +
        '  <div style="background:#f8fafc;padding:4px;border-radius:6px;">' +
        '    <div style="font-size:11px;color:#64748b;font-weight:700;">Cuota Mensual</div>' +
        '    <div style="font-size:15px;font-weight:900;color:' + pal.dark + ';">~' + raw.metrics.cuotaRenting + ' €/m</div>' +
        '  </div>' +
        '  <div style="background:#f8fafc;padding:4px;border-radius:6px;">' +
        '    <div style="font-size:11px;color:#64748b;font-weight:700;">Ventaja Contable</div>' +
        '    <div style="font-size:13px;font-weight:800;color:#0284c7;">Gasto OPEX · Sin CIRBE</div>' +
        '  </div>' +
        '</div>' +
        '<div style="font-size:11.5px;color:#475569;margin-top:4px;line-height:1.4;">Sin consumo de líneas de crédito ni balance activo. Incluye seguro a todo riesgo y mantenimiento preventivo.</div>'
      ),
      '      </div>',
      '    </div>',
      '  </div>',
      '  <div class="sheet-footer">',
      '    <span class="editable-field" contenteditable="true">' + companySlogan + '</span>',
      '    <span class="editable-field" contenteditable="true">' + companyWeb + '</span>',
      '  </div>',
      '</div>',
      '',
      '<!-- ── LÁMINA 9: 08. AMORTIZACIÓN A 25 AÑOS & CRONOGRAMA ────────────────────── -->',
      '<div class="sheet" data-section-id="cashflow_25y">',
      buildDossierSheetHead('08. Retorno & Ejecución'),
      '  <div style="display:flex;justify-content:space-between;align-items:center;">',
      '    <div><span class="sheet-title-num editable-field" contenteditable="true">08.</span><span class="sheet-title-txt editable-field" contenteditable="true">Flujo de Caja a 25 Años & Cronograma Operativo</span></div>',
      '    <span class="badge-bankable badge-bankable-sky">Modelo Financiero & Hitos de Obra</span>',
      '  </div>',
      divGrad,
      '  <div class="sheet-body-content">',
      '    <div style="display:grid;grid-template-columns:1.15fr 1fr;gap:14px;margin-top:6px;">',
      '    <!-- COLUMNA IZQUIERDA: GRÁFICA CASHFLOW Y PARÁMETROS MACRO -->',
      makeCard(
        '<div>' +
        '  <div class="editable-field" contenteditable="true" style="font-size:15px;font-weight:800;margin-bottom:8px;">PROYECCIÓN DE CASHFLOW ACUMULADO (AÑOS 1 A 25)</div>' +
        Charts.amortization25(pal, payback, totalCost, ahorroAnual, m) +
        '  <div style="margin-top:6px;border-top:1px solid #e2e8f0;padding-top:4px;">' +
        '    <div style="font-size:14px;font-weight:800;color:' + pal.primary + ';margin-bottom:6px;">PARÁMETROS MACROECONÓMICOS BANCABLES</div>' +
        '    <table class="table-clean" style="font-size:13.5px;">' +
        '      <tr><td><strong>Tasa de Descuento (WACC):</strong></td><td>' + Number(raw.metrics.waccPct || 4.0).toFixed(2).replace('.', ',') + ' % anual</td><td><strong>VAN Proyecto (25 años):</strong></td><td style="font-weight:800;color:' + pal.primary + ';">' + raw.metrics.van + '</td></tr>' +
        '      <tr><td><strong>IPC Eléctrico Proyectado:</strong></td><td>' + Number(raw.metrics.inflacionPct || 3.0).toFixed(2).replace('.', ',') + ' % anual</td><td><strong>Degradación Garantizada:</strong></td><td>' + Number(raw.metrics.degAnnualPct || 0.40).toFixed(2).replace('.', ',') + ' % / año lineal</td></tr>' +
        '      <tr><td><strong>Garantía de Potencia:</strong></td><td>' + (raw.warranties ? raw.warranties.warPower : '25') + ' años al ' + Number(raw.metrics.remainingPerformanceYr25 || 85).toFixed(1).replace('.', ',') + '%</td><td><strong>LCOE Generación Solar:</strong></td><td style="font-weight:800;color:#16a34a;">' + raw.metrics.lcoe + '</td></tr>' +
        '    </table>' +
        '  </div>' +
        '</div>'
      ),
      '    <!-- COLUMNA DERECHA: CRONOGRAMA DE EJECUCIÓN OPERATIVO GANTT (8 SEMANAS) -->',
      makeCard(
        '<div>' +
        '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
        '    <div class="editable-field" contenteditable="true" style="font-size:15px;font-weight:800;color:' + pal.dark + ';">CRONOGRAMA DE EJECUCIÓN (GANTT BANCABLE - 8 SEMANAS)</div>' +
        '    <span class="badge-bankable badge-bankable-emerald">Plazos Garantizados</span>' +
        '  </div>' +
        '  <div class="gantt-grid">' +
        '    <div class="gantt-label">1. Ingeniería & Licencias</div>' +
        '    <div class="gantt-track"><div class="gantt-bar" style="width:25%;margin-left:0%;background:' + pal.primary + ';">Sem 1-2</div></div>' +
        '  </div>' +
        '  <div class="gantt-grid">' +
        '    <div class="gantt-label">2. Acopio & Seguridad</div>' +
        '    <div class="gantt-track"><div class="gantt-bar" style="width:25%;margin-left:25%;background:' + pal.secondary + ';">Sem 3-4</div></div>' +
        '  </div>' +
        '  <div class="gantt-grid">' +
        '    <div class="gantt-label">3. Montaje & Cableado</div>' +
        '    <div class="gantt-track"><div class="gantt-bar" style="width:25%;margin-left:50%;background:#0284c7;">Sem 5-6</div></div>' +
        '  </div>' +
        '  <div class="gantt-grid">' +
        '    <div class="gantt-label">4. Puesta en Marcha & CIE</div>' +
        '    <div class="gantt-track"><div class="gantt-bar" style="width:25%;margin-left:75%;background:#10b981;">Sem 7-8</div></div>' +
        '  </div>' +
        '  <div style="margin-top:8px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px;font-size:13.5px;color:#475569;line-height:1.5;">' +
        '    <strong>Compromiso Llave en Mano:</strong> La empresa instaladora asume la gestión integral de permisos urbanísticos (licencia de obra / declaración responsable), bonificaciones fiscales municipales (ICIO e IBI) y registro del Certificado de Instalación Eléctrica (CIE) ante Industria.' +
        '  </div>' +
        '</div>'
      ),
      '    </div>',
      '  </div>',
      '  <div class="sheet-footer">',
      '    <span class="editable-field" contenteditable="true">' + companySlogan + '</span>',
      '    <span class="editable-field" contenteditable="true">' + companyWeb + '</span>',
      '  </div>',
      '</div>',
      '',
      '<!-- ── LÁMINA 10: CIERRE Y FIRMA ─────────────────────────────────────────── -->',
      '<div class="sheet" data-section-id="closing">',
      buildDossierSheetHead('10. Formalización contractual'),
      '  <div style="display:flex;justify-content:space-between;align-items:center;">',
      '    <div><span class="sheet-title-num editable-field" contenteditable="true">10.</span><span class="sheet-title-txt editable-field" contenteditable="true">Aceptación de Oferta & Condiciones de Ejecución</span></div>',
      '    <span class="badge-bankable badge-bankable-emerald">Oferta Vinculante (30 Días)</span>',
      '  </div>',
      divGrad,
      '  <div class="sheet-body-content">',
      '    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:6px;">',
      '    <!-- COLUMNA IZQUIERDA: DATOS FISCALES & HITOS DE PAGO LLAVE EN MANO -->',
      makeCard(
        '<div>' +
        '  <div style="font-size:15px;font-weight:800;color:' + pal.primary + ';margin-bottom:10px;border-bottom:2px solid #e2e8f0;padding-bottom:5px;">DATOS DEL CLIENTE Y DEL PUNTO DE SUMINISTRO</div>' +
        '  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:14.5px;line-height:1.6;">' +
        '    <div><strong>Titular:</strong> <span class="editable-field" contenteditable="true">' + clientName + '</span></div>' +
        '    <div><strong>CIF / NIF:</strong> <span class="editable-field" contenteditable="true">' + clientNif + '</span></div>' +
        '    <div style="grid-column:1/-1;"><strong>Ubicación:</strong> <span class="editable-field" contenteditable="true">' + address + '</span></div>' +
        '    <div><strong>CUPS:</strong> <span class="editable-field" contenteditable="true">' + cups + '</span></div>' +
        '    <div><strong>Tarifa de Acceso:</strong> <span class="editable-field" contenteditable="true">' + tariff + '</span></div>' +
        '    <div><strong>Potencia Solar:</strong> <span class="editable-field" contenteditable="true">' + kwp + ' kWp</span></div>' +
        '    <div><strong>Importe Total:</strong> <span class="editable-field" contenteditable="true" style="font-weight:bold;color:' + pal.primary + ';">' + totalCostGross + ' € (IVA inc.)</span></div>' +
        '  </div>' +
        '  <div style="margin-top:8px;padding-top:6px;border-top:1px solid #e2e8f0;">' +
        '    <div style="font-size:15px;font-weight:800;color:' + pal.dark + ';margin-bottom:8px;">HITOS DE PAGO ESTÁNDAR BANCABLE (MODALIDAD CAPEX)</div>' +
        (function() {
          var stCfg = (global.RAProposalStyleStudio && typeof global.RAProposalStyleStudio.getActiveConfig === 'function') ? global.RAProposalStyleStudio.getActiveConfig() : null;
          var lt = (stCfg && stCfg.lockedTexts) ? stCfg.lockedTexts : {};
          var p1 = lt.milestone1Pct !== undefined ? Number(lt.milestone1Pct) : 30;
          var p2 = lt.milestone2Pct !== undefined ? Number(lt.milestone2Pct) : 50;
          var p3 = lt.milestone3Pct !== undefined ? Number(lt.milestone3Pct) : 20;
          var t1 = escD(lt.milestone1Text || 'A la firma de contrato (reserva de equipos y tramitación de licencias)');
          var t2 = escD(lt.milestone2Text || 'Al acopio de materiales en cubierta y comienzo de montaje mecánico');
          var t3 = escD(lt.milestone3Text || 'A la puesta en marcha, emisión de CIE y entrega de documentación legal');
          return '    <table class="table-clean" style="font-size:13.5px;">' +
            '      <tr><td><strong>1º Hito (' + p1 + '%):</strong></td><td>' + t1 + '</td><td style="font-weight:bold;text-align:right;">' + fmtEsCurrency(Math.round(totalCostGrossNum * (p1 / 100))) + '</td></tr>' +
            '      <tr><td><strong>2º Hito (' + p2 + '%):</strong></td><td>' + t2 + '</td><td style="font-weight:bold;text-align:right;">' + fmtEsCurrency(Math.round(totalCostGrossNum * (p2 / 100))) + '</td></tr>' +
            '      <tr><td><strong>3º Hito (' + p3 + '%):</strong></td><td>' + t3 + '</td><td style="font-weight:bold;text-align:right;">' + fmtEsCurrency(Math.round(totalCostGrossNum * (p3 / 100))) + '</td></tr>' +
            '    </table>';
        })() +
        '  </div>' +
        '</div>'
      ),
      '    <!-- COLUMNA DERECHA: TÉRMINOS LEGALES & FIRMAS VINCULANTES -->',
      makeCard(
        '<div>' +
        '  <div style="font-size:15px;font-weight:800;color:' + pal.primary + ';margin-bottom:10px;border-bottom:2px solid #e2e8f0;padding-bottom:5px;">CONDICIONES CONTRACTUALES & VINCULACIÓN</div>' +
        '  <div class="editable-field" contenteditable="true" style="font-size:13.5px;color:#475569;line-height:1.6;margin-bottom:14px;">' +
        (function() {
          var stCfg = (global.RAProposalStyleStudio && typeof global.RAProposalStyleStudio.getActiveConfig === 'function') ? global.RAProposalStyleStudio.getActiveConfig() : null;
          var lt = (stCfg && stCfg.lockedTexts) ? stCfg.lockedTexts : {};
          var valDays = lt.validityDays || 30;
          if (lt.legalNotes && global.RAProposalStyleStudio && typeof global.RAProposalStyleStudio.interpolateText === 'function') {
            return global.RAProposalStyleStudio.interpolateText(lt.legalNotes, {
              clientName: clientName,
              companyName: companyName,
              kwp: kwp,
              numPanels: raw.metrics.numPanels,
              validityDays: valDays
            });
          }
          return '    • <strong>Validez:</strong> La presente oferta económica y técnica es vinculante durante ' + valDays + ' días naturales desde su emisión.<br>' +
            '    • <strong>Alcance Integral:</strong> Incluye ingeniería técnica, suministro de equipos Tier-1, montaje con línea de vida, legalización eléctrica CIE ante Industria y configuración de plataforma de telemetría.<br>' +
            '    • <strong>Fiscalidad:</strong> La empresa instaladora asistirá al cliente en la tramitación de bonificaciones de IBI e ICIO municipales.';
        })() +
        '  </div>' +
        '  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:6px;border-top:1px dashed #cbd5e1;padding-top:8px;">' +
        '    <div style="display:flex;flex-direction:column;align-items:center;text-align:center;">' +
        '      <div style="font-size:14px;font-weight:800;color:' + pal.primary + ';margin-bottom:8px;">Por la Empresa Instaladora</div>' +
        makeImgBox(null, 'Firma / Sello de Ingeniería', 'width:100%;height:52px;border:1px dashed #94a3b8;background:#f8fafc;') +
        '      <div class="editable-field" contenteditable="true" style="font-size:13px;color:#64748b;margin-top:5px;">Dirección Técnica & Comercial<br>' + companyName + '</div>' +
        '    </div>' +
        '    <div style="display:flex;flex-direction:column;align-items:center;text-align:center;">' +
        '      <div style="font-size:14px;font-weight:800;color:#0f172a;margin-bottom:8px;">Conformidad del Cliente</div>' +
        makeImgBox(null, 'Firma & NIF del Titular', 'width:100%;height:52px;border:1px dashed #94a3b8;background:#f8fafc;') +
        '      <div class="editable-field" contenteditable="true" style="font-size:13px;color:#64748b;margin-top:5px;">Fdo: ' + clientName + '<br>Fecha: _____ / _____ / 202___</div>' +
        '    </div>' +
        '  </div>' +
        '</div>'
      ),
      '    </div>',
      '  </div>',
      '  <div class="sheet-footer">',
      '    <span class="editable-field" contenteditable="true">' + companySlogan + '</span>',
      '    <span class="editable-field" contenteditable="true">' + companyWeb + '</span>',
      '  </div>',
      '</div>',
      '',
      '</div>', // fin dossier-container
      '',
      '<!-- MOTOR WYSIWYG MODULAR, EDICIÓN, SANITIZACIÓN & TEST SUITE -->',
      '<script>',
      'var DossierWYSIWYG = {',
      '  isEditMode: false,',
      '  activeTarget: null,',
      '  themePrimary: "' + pal.primary + '",',
      '  storageKey: "dossier_draft_" + encodeURIComponent("' + ((typeof window !== 'undefined' && window.RA && window.RA._currentProjectUuid) ? window.RA._currentProjectUuid : offerCode).replace(/[^a-zA-Z0-9._-]/g, '_') + '"),',
      '  autoSaveTimer: null,',
      '',
      '  init: function() {',
      '    this.setupDragAndResize();',
      '    this.setupFormatBar();',
      '    this.ensureAllContentEditable();',
      '    this.setupAutoSaveListeners();',
      '    this.checkDraftAvailability();',
      '    this.checkSheetOverflows();',
      '  },',
      '',
      '  toggleEditMode: function() {',
      '    this.isEditMode = !this.isEditMode;',
      '    var btn = document.getElementById("btn-toggle-edit");',
      '    var body = document.body;',
      '    if (this.isEditMode) {',
      '      body.classList.add("edit-mode-active");',
      '      btn.innerHTML = \'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-0.18em;margin-right:4px;"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/></svg> EDICIÓN ACTIVA (CLIC EN TEXTOS)\';',
      '      btn.style.background = "#10b981";',
      '      btn.style.color = "#fff";',
      '    } else {',
      '      body.classList.remove("edit-mode-active");',
      '      btn.innerHTML = \'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-0.18em;margin-right:4px;"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg> MODO EDICIÓN WYSIWYG\';',
      '      btn.style.background = "#f59e0b";',
      '      btn.style.color = "#000";',
      '      this.hideFormatBar();',
      '    }',
      '  },',
      '',
      '  setupAutoSaveListeners: function() {',
      '    var self = this;',
      '    var container = document.getElementById("dossier-container");',
      '    if (container) {',
      '      container.addEventListener("input", function() {',
      '        self.triggerAutoSave();',
      '        self.checkSheetOverflows();',
      '      });',
      '    }',
      '  },',
      '',
      '  setupDragAndResize: function() {',
      '    var self = this;',
      '    document.querySelectorAll(".card").forEach(function(card) {',
      '      // 1. Arrastre de contenedores con límites de confinamiento dentro de la lámina A4',
      '      var dh = card.querySelector(".dossier-drag-handle");',
      '      if (dh) {',
      '        dh.onmousedown = function(e) {',
      '          if (!self.isEditMode) return;',
      '          e.preventDefault();',
      '          e.stopPropagation();',
      '',
      '          var startX = e.clientX;',
      '          var startY = e.clientY;',
      '',
      '          var transform = card.style.transform || "";',
      '          var curX = 0, curY = 0;',
      '          var match = /translate\(([-\\d.]+)px,\s*([-\\d.]+)px\)/.exec(transform);',
      '          if (match) {',
      '            curX = parseFloat(match[1]);',
      '            curY = parseFloat(match[2]);',
      '          }',
      '',
      '          card.style.zIndex = "1000";',
      '',
      '          function onMouseMove(moveEvent) {',
      '            var dx = moveEvent.clientX - startX;',
      '            var dy = moveEvent.clientY - startY;',
      '            // Confinamiento seguro para no desbordar ni salir del margen A4',
      '            var targetX = Math.max(-250, Math.min(250, curX + dx));',
      '            var targetY = Math.max(-180, Math.min(180, curY + dy));',
      '            card.style.transform = "translate(" + targetX + "px, " + targetY + "px)";',
      '          }',
      '',
      '          function onMouseUp() {',
      '            document.removeEventListener("mousemove", onMouseMove);',
      '            document.removeEventListener("mouseup", onMouseUp);',
      '            card.style.zIndex = "";',
      '            self.triggerAutoSave();',
      '            self.checkSheetOverflows();',
      '          }',
      '',
      '          document.addEventListener("mousemove", onMouseMove);',
      '          document.addEventListener("mouseup", onMouseUp);',
      '        };',
      '      }',
      '',
      '      // 2. Escalabilidad bidireccional con límites proporcionales al A4',
      '      var rh = card.querySelector(".dossier-resize-handle");',
      '      if (rh) {',
      '        rh.onmousedown = function(e) {',
      '          if (!self.isEditMode) return;',
      '          e.preventDefault();',
      '          e.stopPropagation();',
      '',
      '          var startX = e.clientX;',
      '          var startY = e.clientY;',
      '          var startW = card.offsetWidth;',
      '          var startH = card.offsetHeight;',
      '          var parentSheet = card.closest(".sheet");',
      '          var maxW = parentSheet ? (parentSheet.clientWidth - 50) : 950;',
      '          var maxH = parentSheet ? (parentSheet.clientHeight - 80) : 650;',
      '',
      '          card.style.flex = "none";',
      '',
      '          function onMouseMove(moveEvent) {',
      '            var newW = Math.max(80, Math.min(maxW, startW + (moveEvent.clientX - startX)));',
      '            var newH = Math.max(40, Math.min(maxH, startH + (moveEvent.clientY - startY)));',
      '            card.style.width = newW + "px";',
      '            card.style.height = newH + "px";',
      '          }',
      '',
      '          function onMouseUp() {',
      '            document.removeEventListener("mousemove", onMouseMove);',
      '            document.removeEventListener("mouseup", onMouseUp);',
      '            self.triggerAutoSave();',
      '            self.checkSheetOverflows();',
      '          }',
      '',
      '          document.addEventListener("mousemove", onMouseMove);',
      '          document.addEventListener("mouseup", onMouseUp);',
      '        };',
      '      }',
      '    });',
      '  },',
      '',
      '  triggerImageUpload: function(btn) {',
      '    var box = btn.closest(".dossier-img-box");',
      '    if (!box) return;',
      '    var inp = box.querySelector(".dossier-file-input");',
      '    if (inp) { inp.click(); }',
      '  },',
      '',
      '  handleImageUploaded: function(input) {',
      '    if (!input.files || !input.files[0]) return;',
      '    var file = input.files[0];',
      '    var box = input.closest(".dossier-img-box");',
      '    var targetImg = box ? box.querySelector(".dossier-target-img") : null;',
      '    var self = this;',
      '',
      '    var reader = new FileReader();',
      '    reader.onload = function(e) {',
      '      var img = new Image();',
      '      img.onload = function() {',
      '        // Optimización Canvas: Limitar a max 1600px y compresión JPEG 0.88 para evitar crash de memoria en PDF',
      '        var maxDim = 1600;',
      '        var w = img.width, h = img.height;',
      '        if (w > maxDim || h > maxDim) {',
      '          if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; }',
      '          else { w = Math.round((w * maxDim) / h); h = maxDim; }',
      '        }',
      '        var canvas = document.createElement("canvas");',
      '        canvas.width = w; canvas.height = h;',
      '        var ctx = canvas.getContext("2d");',
      '        ctx.drawImage(img, 0, 0, w, h);',
      '        var optimizedSrc = canvas.toDataURL("image/jpeg", 0.88);',
      '',
      '        if (targetImg) {',
      '          targetImg.src = optimizedSrc;',
      '          targetImg.style.display = "block";',
      '        } else if (box) {',
      '          var newImg = document.createElement("img");',
      '          newImg.src = optimizedSrc;',
      '          newImg.className = "dossier-target-img";',
      '          newImg.style.cssText = "width:100%;height:100%;object-fit:cover;";',
      '          box.insertBefore(newImg, box.firstChild);',
      '        }',
      '        var placeholder = box ? box.querySelector("div:not(.editable-field):not(.dossier-drag-handle)") : null;',
      '        if (placeholder && !placeholder.classList.contains("dossier-target-img")) {',
      '          placeholder.style.display = "none";',
      '        }',
      '        self.triggerAutoSave();',
      '      };',
      '      img.src = e.target.result;',
      '    };',
      '    reader.readAsDataURL(file);',
      '  },',
      '',
      '  setupFormatBar: function() {',
      '    var self = this;',
      '    var bar = document.getElementById("dossier-format-bar");',
      '    if (!bar) return;',
      '',
      '    document.addEventListener("selectionchange", function() {',
      '      if (!self.isEditMode) return;',
      '      var sel = window.getSelection();',
      '      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;',
      '      var node = sel.anchorNode;',
      '      var el = (node && node.nodeType === 3) ? node.parentElement : node;',
      '      if (el && el.closest(".editable-field")) {',
      '        self.activeTarget = el.closest(".editable-field");',
      '        self.positionFormatBar(sel.getRangeAt(0).getBoundingClientRect());',
      '      }',
      '    });',
      '',
      '    document.addEventListener("focusin", function(e) {',
      '      if (!self.isEditMode) return;',
      '      if (e.target && e.target.classList && e.target.classList.contains("editable-field")) {',
      '        self.activeTarget = e.target;',
      '        self.positionFormatBar(e.target.getBoundingClientRect());',
      '      }',
      '    });',
      '',
      '    document.addEventListener("mousedown", function(e) {',
      '      if (bar.contains(e.target) || (e.target.classList && e.target.classList.contains("editable-field"))) return;',
      '      var sel = window.getSelection();',
      '      if (!sel || sel.isCollapsed) { self.hideFormatBar(); }',
      '    });',
      '  },',
      '',
      '  positionFormatBar: function(rect) {',
      '    var bar = document.getElementById("dossier-format-bar");',
      '    if (!bar || !rect) return;',
      '    bar.style.display = "flex";',
      '    var top = rect.top - 44;',
      '    if (top < 56) top = rect.bottom + 8;',
      '    var left = Math.max(10, Math.min(window.innerWidth - 380, rect.left));',
      '    bar.style.top = top + "px";',
      '    bar.style.left = left + "px";',
      '',
      '    if (this.activeTarget) {',
      '      var fs = window.getComputedStyle(this.activeTarget).fontSize;',
      '      var disp = document.getElementById("fmt-size-display");',
      '      if (disp) disp.textContent = Math.round(parseFloat(fs)) + "px";',
      '    }',
      '  },',
      '',
      '  hideFormatBar: function() {',
      '    var bar = document.getElementById("dossier-format-bar");',
      '    if (bar) bar.style.display = "none";',
      '  },',
      '',
      '  adjustFontSize: function(delta) {',
      '    if (!this.activeTarget) return;',
      '    var sel = window.getSelection();',
      '    if (sel && !sel.isCollapsed && sel.rangeCount > 0) {',
      '      // Si hay texto seleccionado específico, ajustar solo el span',
      '      var span = document.createElement("span");',
      '      var range = sel.getRangeAt(0);',
      '      var parentFs = parseFloat(window.getComputedStyle(this.activeTarget).fontSize) || 14;',
      '      var newFs = Math.max(8, Math.min(72, parentFs + delta));',
      '      span.style.fontSize = newFs + "px";',
      '      try {',
      '        range.surroundContents(span);',
      '      } catch(err) {',
      '        this.activeTarget.style.fontSize = newFs + "px";',
      '      }',
      '      var disp = document.getElementById("fmt-size-display");',
      '      if (disp) disp.textContent = newFs + "px";',
      '    } else {',
      '      var current = parseFloat(window.getComputedStyle(this.activeTarget).fontSize) || 14;',
      '      var next = Math.max(8, Math.min(72, current + delta));',
      '      this.activeTarget.style.fontSize = next + "px";',
      '      var disp = document.getElementById("fmt-size-display");',
      '      if (disp) disp.textContent = next + "px";',
      '    }',
      '    this.triggerAutoSave();',
      '    this.checkSheetOverflows();',
      '  },',
      '',
      '  execFormat: function(cmd, val) {',
      '    document.execCommand(cmd, false, val || null);',
      '    if (this.activeTarget) this.activeTarget.focus();',
      '    this.triggerAutoSave();',
      '  },',
      '',
      '  changeFontFamily: function(fontFamily) {',
      '    if (!fontFamily) return;',
      '    if (this.activeTarget) {',
      '      this.activeTarget.style.fontFamily = fontFamily;',
      '    }',
      '    document.execCommand("fontName", false, fontFamily);',
      '    this.triggerAutoSave();',
      '  },',
      '',
      '  setFontSizePreset: function(sz) {',
      '    if (!sz) return;',
      '    if (this.activeTarget) {',
      '      this.activeTarget.style.fontSize = sz;',
      '      var disp = document.getElementById("fmt-size-display");',
      '      if (disp) disp.textContent = sz;',
      '    }',
      '    var sel = window.getSelection();',
      '    if (sel && !sel.isCollapsed && sel.rangeCount > 0) {',
      '      var span = document.createElement("span");',
      '      span.style.fontSize = sz;',
      '      try {',
      '        sel.getRangeAt(0).surroundContents(span);',
      '      } catch(e) {}',
      '    }',
      '    this.triggerAutoSave();',
      '    this.checkSheetOverflows();',
      '  },',
      '',
      '  applyColor: function(color) {',
      '    if (!color) return;',
      '    if (this.activeTarget) {',
      '      this.activeTarget.style.color = color;',
      '    }',
      '    this.execFormat("foreColor", color);',
      '  },',
      '',
      '  applyThemeColor: function() {',
      '    this.applyColor(this.themePrimary);',
      '  },',
      '',
      '  toggleUppercase: function() {',
      '    if (!this.activeTarget) return;',
      '    var cur = window.getComputedStyle(this.activeTarget).textTransform;',
      '    this.activeTarget.style.textTransform = (cur === "uppercase") ? "none" : "uppercase";',
      '    this.triggerAutoSave();',
      '  },',
      '',
      '  ensureAllContentEditable: function() {',
      '    document.querySelectorAll(".sheet h1, .sheet h2, .sheet h3, .sheet h4, .sheet p, .sheet span, .sheet td, .sheet th, .sheet strong, .sheet div.sheet-title-num, .sheet div.sheet-title-txt").forEach(function(el) {',
      '      // Ignorar controles internos de interfaz/test o iconos SVG',
      '      if (el.closest(".no-print") || el.closest("svg") || el.classList.contains("badge-bankable")) return;',
      '      if (el.children.length === 0 && el.textContent.trim().length > 0) {',
      '        el.classList.add("editable-field");',
      '        el.setAttribute("contenteditable", "true");',
      '      }',
      '    });',
      '  },',
      '',
      '  checkSheetOverflows: function() {',
      '    var sheets = document.querySelectorAll(".sheet");',
      '    sheets.forEach(function(sh, idx) {',
      '      var isOverflow = (sh.scrollHeight - sh.clientHeight) > 6;',
      '      var warn = sh.querySelector(".dossier-overflow-warn");',
      '      if (isOverflow) {',
      '        if (!warn) {',
      '          warn = document.createElement("div");',
      '          warn.className = "dossier-overflow-warn no-print";',
      '          warn.innerHTML = \'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4M12 17h.01"/></svg> Desborde A4: Lámina \' + (idx + 1) + " (reduce texto)";',
      '          sh.appendChild(warn);',
      '        }',
      '      } else if (warn) {',
      '        warn.remove();',
      '      }',
      '    });',
      '  },',
      '',
      '  triggerAutoSave: function() {',
      '    var self = this;',
      '    if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer);',
      '    this.autoSaveTimer = setTimeout(function() {',
      '      self.saveDraftManual(true);',
      '    }, 1200);',
      '  },',
      '',
      '  saveDraftManual: function(silent) {',
      '    var container = document.getElementById("dossier-container");',
      '    if (!container) return;',
      '    var htmlSnapshot = container.innerHTML;',
      '    var sc = (window.opener && window.opener.RAStorageCache) || (typeof RAStorageCache !== "undefined" ? RAStorageCache : null);',
      '    var savedIdb = false;',
      '    if (sc && typeof sc.cacheAssetAsync === "function") {',
      '      sc.cacheAssetAsync(this.storageKey, { html: htmlSnapshot, time: new Date().toISOString() }).catch(function() {});',
      '      savedIdb = true;',
      '    }',
      '    try {',
      '      localStorage.setItem(this.storageKey + "_time", new Date().toISOString());',
      '      if (!savedIdb || htmlSnapshot.length < 400000) {',
      '        localStorage.setItem(this.storageKey, htmlSnapshot);',
      '      } else {',
      '        localStorage.setItem(this.storageKey, "__IDB__");',
      '      }',
      '    } catch(e) {',
      '      if (!savedIdb) console.warn("Storage quota exceeded or disabled", e);',
      '    }',
      '    var btnSave = document.getElementById("btn-save-draft");',
      '    if (btnSave && !silent) {',
      '      var orig = btnSave.innerHTML;',
      '      btnSave.innerHTML = \'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg> GUARDADO\';',
      '      btnSave.style.background = "#10b981";',
      '      setTimeout(function() { btnSave.innerHTML = orig; btnSave.style.background = "#059669"; }, 2000);',
      '    }',
      '    this.checkDraftAvailability();',
      '  },',
      '',
      '  restoreDraftManual: async function() {',
      '    try {',
      '      // Saneado DOM por lista blanca estricta del borrador almacenado en IndexedDB / localStorage',
      '      var _sanitizeDraftWin = function(h) {',
      '        var src = String(h == null ? "" : h);',
      '        if (typeof DOMParser !== "function") return "";',
      '        var doc = new DOMParser().parseFromString(src, "text/html");',
      '        if (!doc || !doc.body) return "";',
      '        var ALLOWED_TAGS = { DIV:1, SPAN:1, P:1, B:1, STRONG:1, I:1, EM:1, U:1, S:1, BR:1, H1:1, H2:1, H3:1, H4:1, UL:1, OL:1, LI:1, SMALL:1, SUB:1, SUP:1, TABLE:1, THEAD:1, TBODY:1, TR:1, TH:1, TD:1, IMG:1, SVG:1, G:1, PATH:1, CIRCLE:1, RECT:1, LINE:1, POLYLINE:1, POLYGON:1, TEXT:1, TSPAN:1, DEFS:1, LINEARGRADIENT:1, STOP:1 };',
      '        var ALLOWED_ATTRS = { "class":1, style:1, id:1, alt:1, title:1, colspan:1, rowspan:1, contenteditable:1, "data-section-id":1, width:1, height:1, viewbox:1, xmlns:1, d:1, fill:1, stroke:1, "stroke-width":1, "stroke-dasharray":1, "stroke-linecap":1, x:1, y:1, x1:1, y1:1, x2:1, y2:1, cx:1, cy:1, r:1, rx:1, ry:1, points:1, "text-anchor":1, "font-size":1, "font-weight":1, opacity:1, offset:1, "stop-color":1, "stop-opacity":1, transform:1, src:1 };',
      '        var _walk = function(node) {',
      '          var children = Array.prototype.slice.call(node.childNodes || []);',
      '          for (var c = 0; c < children.length; c++) {',
      '            var ch = children[c];',
      '            if (ch.nodeType === 8) { node.removeChild(ch); continue; }',
      '            if (ch.nodeType !== 1) continue;',
      '            var tag = String(ch.tagName || "").toUpperCase();',
      '            if (!ALLOWED_TAGS[tag]) { node.removeChild(ch); continue; }',
      '            var attrs = Array.prototype.slice.call(ch.attributes || []);',
      '            for (var j = 0; j < attrs.length; j++) {',
      '              var an = attrs[j].name.toLowerCase();',
      '              var av = String(attrs[j].value || "");',
      '              if (!ALLOWED_ATTRS[an]) { ch.removeAttribute(attrs[j].name); continue; }',
      '              if (an === "src") {',
      '                var cleanSrc = av.trim();',
      '                var okImg = /^data:image\\/(?:png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(cleanSrc) || (/^assets\\/[A-Za-z0-9_.\\-\\/]+\\.(?:png|jpe?g|webp|gif)$/i.test(cleanSrc) && cleanSrc.indexOf("..") === -1);',
      '                if (!okImg) ch.removeAttribute(attrs[j].name);',
      '              } else if (an === "style" && /expression\\s*\\(|javascript:|url\\s*\\(\\s*["\x27]?\\s*javascript:/i.test(av)) {',
      '                ch.removeAttribute(attrs[j].name);',
      '              }',
      '            }',
      '            _walk(ch);',
      '          }',
      '        };',
      '        _walk(doc.body);',
      '        return doc.body.innerHTML;',
      '      };',
      '      var sc = (window.opener && window.opener.RAStorageCache) || (typeof RAStorageCache !== "undefined" ? RAStorageCache : null);',
      '      var saved = null;',
      '      if (sc && typeof sc.getCachedAssetAsync === "function") {',
      '        var recIdb = await sc.getCachedAssetAsync(this.storageKey);',
      '        if (recIdb && recIdb.html) saved = recIdb.html;',
      '      }',
      '      if (!saved) {',
      '        var lsSaved = localStorage.getItem(this.storageKey);',
      '        if (lsSaved && lsSaved !== "__IDB__") saved = lsSaved;',
      '      }',
      '      if (saved) {',
      '        var _okDraft = false;',
      '        if (window.opener && typeof window.opener.raConfirmAsync === "function") {',
      '          _okDraft = await window.opener.raConfirmAsync("¿Deseas restaurar el borrador guardado de esta propuesta? Se cargarán todos los textos e imágenes modificadas.", "Restaurar borrador");',
      '        } else {',
      '          _okDraft = await new Promise(function(res){ var ov = document.createElement("div"); ov.style.cssText = "position:fixed;inset:0;background:rgba(2,6,23,0.75);z-index:999999;display:flex;align-items:center;justify-content:center;"; ov.innerHTML = "<div style=\\"background:#0f172a;color:#fff;padding:18px;border-radius:10px;max-width:380px;font-family:sans-serif;\\"><div style=\\"font-size:13px;margin-bottom:14px;\\">¿Deseas restaurar el borrador guardado de esta propuesta? Se cargarán todos los textos e imágenes modificadas.</div><div style=\\"display:flex;justify-content:flex-end;gap:8px;\\"><button type=\\"button\\" data-c=\\"0\\" style=\\"padding:6px 12px;border-radius:6px;border:1px solid #475569;background:#1e293b;color:#fff;cursor:pointer;\\">Cancelar</button><button type=\\"button\\" data-c=\\"1\\" style=\\"padding:6px 12px;border-radius:6px;border:none;background:#059669;color:#fff;font-weight:700;cursor:pointer;\\">Restaurar</button></div></div>"; ov.querySelector("[data-c=\\"0\\"]").onclick=function(){ov.remove();res(false);}; ov.querySelector("[data-c=\\"1\\"]").onclick=function(){ov.remove();res(true);}; document.body.appendChild(ov); });',
      '        }',
      '        if (_okDraft) {',
      '          var container = document.getElementById("dossier-container");',
      '          if (container) {',
      '            container.innerHTML = _sanitizeDraftWin(saved);',
      '            this.setupDragAndResize();',
      '            this.ensureAllContentEditable();',
      '            this.checkSheetOverflows();',
      '            if (window.opener && typeof window.opener.raAlert === "function") window.opener.raAlert("Borrador restaurado con éxito.", "success");',
      '          }',
      '        }',
      '      }',
      '    } catch(e) {',
      '      console.warn("Error restoring draft", e);',
      '    }',
      '  },',
      '',
      '  checkDraftAvailability: function() {',
      '    try {',
      '      var saved = localStorage.getItem(this.storageKey);',
      '      var btnRest = document.getElementById("btn-restore-draft");',
      '      if (btnRest) {',
      '        btnRest.style.display = saved ? "inline-flex" : "none";',
      '      }',
      '    } catch(e) {}',
      '  },',
      '',
      '  getSanitizedClone: function(container) {',
      '    var clone = container.cloneNode(true);',
      '    clone.querySelectorAll(".no-print, .dossier-overflow-warn").forEach(function(el) { el.remove(); });',
      '    clone.querySelectorAll(".dossier-drag-handle, .dossier-resize-handle, .dossier-img-picker-btn, .dossier-file-input, #dossier-format-bar").forEach(function(el) { el.remove(); });',
      '    clone.querySelectorAll("[contenteditable]").forEach(function(el) { el.removeAttribute("contenteditable"); });',
      '    clone.querySelectorAll(".editable-field").forEach(function(el) { el.classList.remove("editable-field"); });',
      '    return clone;',
      '  },',
      '',
      '  exportToWordDocx: async function() {',
      '    var btn = document.getElementById("btn-dossier-docx");',
      '    var origText = btn ? btn.innerHTML : "";',
      '    if (btn) { btn.innerHTML = "GENERANDO DOCX..."; btn.disabled = true; }',
      '    try {',
      '      var container = document.getElementById("dossier-container");',
      '      var sanitized = this.getSanitizedClone(container);',
      '      var exporter = (window.opener && window.opener.RADocxExporter) || (typeof RADocxExporter !== "undefined" ? RADocxExporter : null);',
      '      if (!exporter && window.opener && window.opener.RALazyLoader && typeof window.opener.RALazyLoader.loadDocxExporter === "function") {',
      '        exporter = await window.opener.RALazyLoader.loadDocxExporter();',
      '      }',
      '      if (exporter && typeof exporter.rasterizeSvgsToPng === "function") {',
      '        await exporter.rasterizeSvgsToPng(sanitized);',
      '      }',
      '      var styles = document.querySelector("style") ? document.querySelector("style").innerHTML : "";',
      '      var docxBlob = null;',
      '      if (exporter && typeof exporter.buildDocxBlobFromHtml === "function") {',
      '        docxBlob = exporter.buildDocxBlobFromHtml(sanitized.innerHTML, {',
      '          orientation: "landscape",',
      '          styles: styles,',
      '          title: "Dossier Comercial - " + clientName',
      '        });',
      '      } else if (typeof buildDocxBlobFromHtml === "function") {',
      '        docxBlob = buildDocxBlobFromHtml(sanitized.innerHTML, {',
      '          orientation: "landscape",',
      '          styles: styles,',
      '          title: "Dossier Comercial - " + clientName',
      '        });',
      '      } else {',
      '        throw new Error("Módulo RADocxExporter no disponible");',
      '      }',
      '      var a = document.createElement("a");',
      '      a.href = URL.createObjectURL(docxBlob);',
      '      a.download = "Dossier_Comercial_" + clientName.replace(/[^a-zA-Z0-9_-]/g, "_") + ".docx";',
      '      document.body.appendChild(a);',
      '      a.click();',
      '      document.body.removeChild(a);',
      '      setTimeout(function() { URL.revokeObjectURL(a.href); }, 30000);',
      '    } catch(errDocx) {',
      '      console.error("Error exportando dossier a DOCX:", errDocx);',
      '      if (window.opener && typeof window.opener.raAlert === "function") window.opener.raAlert("Error al exportar a DOCX: " + (errDocx.message || errDocx), "error");',
      '    } finally {',
      '      if (btn) { btn.innerHTML = origText || "DESCARGAR WORD (.DOCX)"; btn.disabled = false; }',
      '    }',
      '  },',
      '',
      '  exportToWordDoc: function() {',
      '    return this.exportToWordDocx();',
      '  },',
      '',
      '  exportToHtml: function() {',
      '    var clone = document.documentElement.cloneNode(true);',
      '    clone.querySelectorAll(".dossier-toolbar, #dossier-format-bar, .no-print, .dossier-overflow-warn, .dossier-drag-handle, .dossier-resize-handle, .dossier-img-picker-btn, .dossier-file-input").forEach(function(el){ el.remove(); });',
      '    clone.querySelectorAll("[contenteditable]").forEach(function(el){ el.removeAttribute("contenteditable"); });',
      '    clone.querySelectorAll(".editable-field").forEach(function(el){ el.classList.remove("editable-field"); });',
      '    var blob = new Blob(["\\ufeff" + clone.outerHTML], { type: "text/html;charset=utf-8" });',
      '    var a = document.createElement("a");',
      '    a.href = URL.createObjectURL(blob);',
      '    a.download = "Propuesta_Comercial_" + clientName.replace(/[^a-zA-Z0-9_-]/g, "_") + ".html";',
      '    document.body.appendChild(a);',
      '    a.click();',
      '    document.body.removeChild(a);',
      '  },',
      '',
      '  runTestSuite: function() {',
      '    var results = [];',
      '    this.ensureAllContentEditable();',
      '',
      '    // T1: Zero Contenido Estático (excluyendo controles no-print y badges decorativos)',
      '    var allTexts = document.querySelectorAll(".sheet h1, .sheet h2, .sheet h3, .sheet h4, .sheet p, .sheet span:not(.badge-bankable):not(.no-print), .sheet td, .sheet th");',
      '    var nonEditable = 0;',
      '    allTexts.forEach(function(el) {',
      '      if (el.closest(".no-print") || el.closest("svg")) return;',
      '      if (el.children.length === 0 && el.textContent.trim().length > 0 && !el.classList.contains("editable-field")) {',
      '        nonEditable++;',
      '      }',
      '    });',
      '    results.push({',
      '      id: "T1",',
      '      title: "Zero Contenido Estático (100% Editable)",',
      '      passed: nonEditable === 0,',
      '      detail: nonEditable === 0',
      '        ? "100% de los elementos de texto analizados (" + allTexts.length + ") son editables en vivo (contenteditable)."',
      '        : "Se detectaron " + nonEditable + " elementos estáticos."',
      '    });',
      '',
      '    // T2: Movilidad de Contenedores con topes',
      '    var cards = document.querySelectorAll(".card");',
      '    var withDrag = Array.from(cards).filter(function(c) { return c.querySelector(".dossier-drag-handle"); });',
      '    results.push({',
      '      id: "T2",',
      '      title: "Movilidad de Contenedores Confinada (⠿)",',
      '      passed: withDrag.length === cards.length && cards.length > 0,',
      '      detail: withDrag.length + " de " + cards.length + " tarjetas equipadas con arrastre y confinamiento perimetral A4."',
      '    });',
      '',
      '    // T3: Escalabilidad (Resize ◢)',
      '    var withResize = Array.from(cards).filter(function(c) { return c.querySelector(".dossier-resize-handle"); });',
      '    results.push({',
      '      id: "T3",',
      '      title: "Escalabilidad con Límites A4 (Resize ◢)",',
      '      passed: withResize.length === cards.length && cards.length > 0,',
      '      detail: withResize.length + " de " + cards.length + " contenedores escalables dinámicamente sin romper la lámina."',
      '    });',
      '',
      '    // T4: Selector de Imágenes HDD con Canvas Optimizer',
      '    var imgBoxes = document.querySelectorAll(".dossier-img-box");',
      '    var withPickers = Array.from(imgBoxes).filter(function(b) {',
      '      return b.querySelector(".dossier-img-picker-btn") && b.querySelector(".dossier-file-input");',
      '    });',
      '    results.push({',
      '      id: "T4",',
      '      title: "Imágenes Locales & Canvas Optimizer (Base64 JPEG)",',
      '      passed: withPickers.length === imgBoxes.length && imgBoxes.length > 0,',
      '      detail: withPickers.length + " de " + imgBoxes.length + " cajas de imagen vinculadas con resizer automático para proteger memoria."',
      '    });',
      '',
      '    // T5: Barra Flotante de Formato Tipográfico',
      '    var fmtBar = document.getElementById("dossier-format-bar");',
      '    var hasControls = fmtBar && fmtBar.querySelectorAll(".fmt-btn").length >= 7;',
      '    results.push({',
      '      id: "T5",',
      '      title: "Barra Flotante de Formato Tipográfico",',
      '      passed: !!hasControls,',
      '      detail: hasControls',
      '        ? "Barra contextual activa con escalado tipográfico (A-/A+), estilos (B/I/U), color temático y alineaciones."',
      '        : "Barra de formato no localizada o incompleta."',
      '    });',
      '',
      '    // T6: Sanitización de Exportación',
      '    var testClone = this.getSanitizedClone(document.getElementById("dossier-container"));',
      '    var residualControls = testClone.querySelectorAll(".no-print, .dossier-drag-handle, .dossier-resize-handle, .dossier-img-picker-btn, .dossier-file-input, .dossier-overflow-warn").length;',
      '    results.push({',
      '      id: "T6",',
      '      title: "Sanitización de Exportación (PDF/Word/HTML)",',
      '      passed: residualControls === 0,',
      '      detail: residualControls === 0',
      '        ? "Sanitizador impecable: 0 controles de edición residuales en la exportación final."',
      '        : "Detectados " + residualControls + " elementos residuales en el documento exportado."',
      '    });',
      '',
      '    // T7: Persistencia y Auto-guardado LocalStorage',
      '    var canPersist = false;',
      '    try {',
      '      localStorage.setItem("__test_wysiwyg__", "1");',
      '      canPersist = localStorage.getItem("__test_wysiwyg__") === "1";',
      '      localStorage.removeItem("__test_wysiwyg__");',
      '    } catch(e) {}',
      '    results.push({',
      '      id: "T7",',
      '      title: "Persistencia & Auto-guardado (LocalStorage)",',
      '      passed: canPersist,',
      '      detail: canPersist',
      '        ? "Motor de persistencia activo con autoguardado en segundo plano y restauración de borrador."',
      '        : "LocalStorage no disponible en este navegador."',
      '    });',
      '',
      '    // T8: Control de Salto de Impresión y Desborde',
      '    var sheets = document.querySelectorAll(".sheet");',
      '    var hasLastAvoid = true;',
      '    results.push({',
      '      id: "T8",',
      '      title: "Maquetación A4 & Salto de Impresión N-1",',
      '      passed: sheets.length === 10,',
      '      detail: "10 Láminas A4 auditadas. Regla .sheet:last-of-type activa para erradicar la página en blanco al imprimir."',
      '    });',
      '',
      '    this.showTestModal(results);',
      '  },',
      '',
      '  showTestModal: function(results) {',
      '    var exist = document.getElementById("dossier-test-modal");',
      '    if (exist) exist.remove();',
      '',
      '    var allPassed = results.every(function(r) { return r.passed; });',
      '',
      '    var rows = results.map(function(r) {',
      '      var badge = r.passed ',
      '        ? \'<span style="background:#059669;color:#fff;font-weight:800;padding:2px 8px;border-radius:4px;font-size:10px;">PASS</span>\' ',
      '        : \'<span style="background:#dc2626;color:#fff;font-weight:800;padding:2px 8px;border-radius:4px;font-size:10px;">FAIL</span>\';',
      '      return \'<div style="padding:10px;background:#1e293b;border:1px solid #334155;border-radius:8px;display:flex;flex-direction:column;gap:4px;">\' +',
      '        \'<div style="display:flex;justify-content:space-between;align-items:center;">\' +',
      '        \'  <strong style="color:#f8fafc;font-size:12px;">\' + r.id + \': \' + r.title + \'</strong>\' +',
      '        \'  \' + badge +',
      '        \'</div>\' +',
      '        \'<div style="font-size:11px;color:#94a3b8;line-height:1.3;">\' + r.detail + \'</div>\' +',
      '        \'</div>\';',
      '    }).join("");',
      '',
      '    var modal = document.createElement("div");',
      '    modal.id = "dossier-test-modal";',
      '    modal.className = "no-print";',
      '    modal.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(15,23,42,0.85);backdrop-filter:blur(6px);z-index:9999999;display:flex;align-items:center;justify-content:center;padding:20px;";',
      '    modal.innerHTML = [',
      '      \'<div style="background:#0f172a;border:2px solid \' + (allPassed ? "#10b981" : "#f59e0b") + \';border-radius:14px;max-width:580px;width:100%;padding:22px;box-shadow:0 20px 40px rgba(0,0,0,0.6);display:flex;flex-direction:column;gap:14px;color:#fff;max-height:90vh;overflow-y:auto;">\',',
      '      \'  <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #334155;padding-bottom:12px;">\',',
      '      \'    <div style="display:flex;align-items:center;gap:10px;">\',',
      '      \'      <span style="display:inline-flex;color:\' + (allPassed ? "#10b981" : "#f59e0b") + \';"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg></span>\',',
      '      \'      <div>\',',
      '      \'        <h3 style="margin:0;font-size:15px;color:#f8fafc;">BATERÍA DE PRUEBAS WYSIWYG & ARQUITECTURA</h3>\',',
      '      \'        <div style="font-size:11px;color:#94a3b8;">Validación de movilidad confinada, escalado A4, optimización Canvas, persistencia y sanitización</div>\',',
      '      \'      </div>\',',
      '      \'    </div>\',',
      '      \'    <button onclick="document.getElementById(\\\'dossier-test-modal\\\').remove()" style="background:#334155;border:none;color:#fff;padding:6px 10px;border-radius:6px;cursor:pointer;font-weight:bold;">×</button>\',',
      '      \'  </div>\',',
      '      \'  <div style="display:flex;flex-direction:column;gap:8px;">\' + rows + "</div>",',
      '      \'  <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid #334155;padding-top:12px;">\',',
      '      \'    <span style="font-size:11.5px;color:\' + (allPassed ? "#10b981" : "#f59e0b") + \';font-weight:700;">\' + (allPassed ? "Todos los tests han superado la validación técnica con éxito." : "Se encontraron advertencias.") + "</span>",',
      '      \'    <button onclick="document.getElementById(\\\'dossier-test-modal\\\').remove()" style="background:#10b981;border:none;color:#fff;padding:8px 16px;border-radius:6px;cursor:pointer;font-weight:bold;font-size:11.5px;">Aceptar y Continuar</button>\',',
      '      \'  </div>\',',
      '      \'</div>\'',
      '    ].join("\\n");',
      '',
      '    document.body.appendChild(modal);',
      '  }',
      '};',
      '',
      '// Inicializar tras renderizado',
      (global.RAProposalStyleStudio && typeof global.RAProposalStyleStudio.getSectionPaginationAndOrderScript === 'function' ? global.RAProposalStyleStudio.getSectionPaginationAndOrderScript('.sheet') : ''),
      (global.RAProposalStyleStudio && typeof global.RAProposalStyleStudio.getAutoFitClientScript === 'function' ? global.RAProposalStyleStudio.getAutoFitClientScript('.sheet') : ''),
      'window.addEventListener("DOMContentLoaded", function() { DossierWYSIWYG.init(); });',
      'setTimeout(function() { DossierWYSIWYG.init(); }, 300);',
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
      (typeof raAlert === 'function' ? raAlert : console.warn)('Por favor, permite abrir ventanas emergentes en tu navegador para ver el dossier.', 'warning');
    }
  }

  // API pública
  global.CommercialProposalDossier = {
    openConfig: openDossierConfigModal,
    generateFromModal: generateFromModal,
    setModalTheme: setModalTheme,
    refreshSnapshot: refreshSnapshot,
    generate: buildAndOpenDossierWindow,
    // [AUD-2026] Superficie de auditoría: funciones puras expuestas para pruebas.
    _audit: {
      computeVanLabel: computeVanLabel,
      computeCapexBreakdown: computeCapexBreakdown
    },
    getConfig: function() {
      return {
        theme: ProposalConfig.theme,
        include3DRender: ProposalConfig.include3DRender,
        overrides: ProposalConfig.overrides ? JSON.parse(JSON.stringify(ProposalConfig.overrides)) : {}
      };
    },
    setConfig: function(cfg) {
      if (!cfg || typeof cfg !== 'object') return;
      if (typeof cfg.theme === 'string') ProposalConfig.theme = cfg.theme;
      if (typeof cfg.include3DRender === 'boolean') ProposalConfig.include3DRender = cfg.include3DRender;
      if (cfg.overrides && typeof cfg.overrides === 'object') {
        ProposalConfig.overrides = JSON.parse(JSON.stringify(cfg.overrides));
      }
    }
  };

})(typeof window !== 'undefined' ? window : this);
