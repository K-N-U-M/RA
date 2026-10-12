// ============================================================================
// RA-BILL-AUDITOR — MÓDULO INDEPENDIENTE DE AUDITORÍA Y COMPARATIVA DE FACTURAS
// Calidad AAA: Regex multiformato (Iberdrola, Endesa, Naturgy, PVPC, TotalEnergies),
// soporte CSV (Datadis), UI Modal Glassmorphic, Gráficos comparativos SVG interactivos,
// sincronización no invasiva con el motor financiero (calculateFinancialModel / PDF).
// ============================================================================
(function() {
  'use strict';

  // Namespace seguro
  window.RA = window.RA || {};

  const BILL_AUDITOR_STATE = {
    currentBill: null,       // Datos de la factura analizada
    comparison: null,        // Comparativa técnica/económica con el sistema FV
    modalOpen: false
  };

  /**
   * 1. PARSER MULTIFORMATO DE FACTURAS ELÉCTRICAS (ESPAÑA)
   */
  const BillParser = {
    cleanText(raw) {
      return raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    },

    parseText(text) {
      const clean = this.cleanText(text);
      const data = {
        cups: null,
        distribuidora: 'Desconocida',
        comercializadora: 'Desconocida',
        tarifaAcceso: '2.0TD',
        periodoInicio: null,
        periodoFin: null,
        diasFactura: 30,
        potenciasContratadasKW: { p1: 0, p2: 0 },
        costePotenciaEUR: 0,
        consumosKWh: { p1: 0, p2: 0, p3: 0, total: 0 },
        preciosEnergiaEURKWh: { p1: 0, p2: 0, p3: 0 },
        costeEnergiaEUR: 0,
        impuestoElectricoEUR: 0,
        alquilerContadorEUR: 0,
        ivaEUR: 0,
        totalFacturaEUR: 0,
        rawSnippet: clean.slice(0, 300)
      };

      // 1. Detección de CUPS
      const cupsMatch = clean.match(/ES\s*([0-9]{16}[A-Za-z0-9]{2,6})/i) || clean.match(/(ES[0-9]{16,20}[A-Za-z]{2})/i);
      if (cupsMatch) {
        data.cups = cupsMatch[0].replace(/\s+/g, '').toUpperCase();
      }

      // 2. Detección de Comercializadora
      if (/iberdrola/i.test(clean)) data.comercializadora = 'Iberdrola';
      else if (/endesa/i.test(clean)) data.comercializadora = 'Endesa';
      else if (/naturgy/i.test(clean)) data.comercializadora = 'Naturgy';
      else if (/totalenergies/i.test(clean)) data.comercializadora = 'TotalEnergies';
      else if (/repsol/i.test(clean)) data.comercializadora = 'Repsol';
      else if (/curenergia|energia\s*xxi|gas\s*&\s*power|baser/i.test(clean) || /pvpc/i.test(clean)) data.comercializadora = 'Mercado Regulado (PVPC)';

      // 3. Tarifa de Acceso
      const peajeMatch = clean.match(/peajes*(?:des*acceso|transporte)?[:s]*([0-9].[0-9][A-Za-z]*)/i) || clean.match(/(2.0TD|3.0TD|6.1TD)/i);
      if (peajeMatch) {
        data.tarifaAcceso = peajeMatch[1].toUpperCase();
      }

      // 4. Importe Total de la Factura (€)
      const totalMatch = clean.match(/(?:TOTAL\s*FACTURA|TOTAL\s*IMPORTE|IMPORTE\s*TOTAL|TOTAL\s*A\s*PAGAR)[^0-9\n]{0,30}([0-9]{1,4}[,.]\d{2})\s*€?/i) ||
                         clean.match(/(?:TOTAL|IMPORTE)[^0-9\n]{0,20}([0-9]{1,4}[,.]\d{2})\s*€/i) ||
                         clean.match(/([0-9]{1,4}[,.]\d{2})\s*€/i);
      if (totalMatch) {
        let numStr = totalMatch[1].trim();
        if (numStr.includes(',') && numStr.includes('.')) {
          numStr = numStr.replace(/\./g, '').replace(',', '.');
        } else if (numStr.includes(',')) {
          numStr = numStr.replace(',', '.');
        }
        data.totalFacturaEUR = parseFloat(numStr);
      }

      // 5. Consumo Total de Energía (kWh)
      const kwhMatches = clean.match(/(?:total\s*energ[ií]a|consumo\s*total|consumo\s*facturado)[^0-9\n]{0,30}([0-9]{1,5}(?:[,.]\d{1,2})?)\s*kWh/i) ||
                         clean.match(/([0-9]{1,5}(?:[,.]\d{1,2})?)\s*kWh/i);
      if (kwhMatches) {
        data.consumosKWh.total = parseFloat(kwhMatches[1].replace(',', '.'));
      }

      // Consumos por periodo
      const p1Match = clean.match(/P1[^0-9\n]{0,20}([0-9]{1,4}(?:[,.]\d{1,2})?)\s*kWh/i);
      const p2Match = clean.match(/P2[^0-9\n]{0,20}([0-9]{1,4}(?:[,.]\d{1,2})?)\s*kWh/i);
      const p3Match = clean.match(/P3[^0-9\n]{0,20}([0-9]{1,4}(?:[,.]\d{1,2})?)\s*kWh/i);
      if (p1Match) data.consumosKWh.p1 = parseFloat(p1Match[1].replace(',', '.'));
      if (p2Match) data.consumosKWh.p2 = parseFloat(p2Match[1].replace(',', '.'));
      if (p3Match) data.consumosKWh.p3 = parseFloat(p3Match[1].replace(',', '.'));
      if (!data.consumosKWh.total && (data.consumosKWh.p1 || data.consumosKWh.p2 || data.consumosKWh.p3)) {
        data.consumosKWh.total = data.consumosKWh.p1 + data.consumosKWh.p2 + data.consumosKWh.p3;
      }

      // 6. Potencias Contratadas (kW)
      const potP1 = clean.match(/(?:potencia|punta|p1)[^0-9\n]{0,20}([0-9]{1,2}(?:[,.]\d{1,3})?)\s*kW/i);
      const potP2 = clean.match(/(?:valle|p2)[^0-9\n]{0,20}([0-9]{1,2}(?:[,.]\d{1,3})?)\s*kW/i);
      if (potP1) data.potenciasContratadasKW.p1 = parseFloat(potP1[1].replace(',', '.'));
      if (potP2) data.potenciasContratadasKW.p2 = parseFloat(potP2[1].replace(',', '.'));
      if (!data.potenciasContratadasKW.p2 && data.potenciasContratadasKW.p1) {
        data.potenciasContratadasKW.p2 = data.potenciasContratadasKW.p1;
      }

      // 7. Estimación de precios de energía
      if (data.consumosKWh.total > 0 && data.totalFacturaEUR > 0) {
        const estPrecioKwh = (data.totalFacturaEUR * 0.65) / data.consumosKWh.total;
        data.preciosEnergiaEURKWh.p1 = parseFloat((estPrecioKwh * 1.25).toFixed(4));
        data.preciosEnergiaEURKWh.p2 = parseFloat((estPrecioKwh * 1.00).toFixed(4));
        data.preciosEnergiaEURKWh.p3 = parseFloat((estPrecioKwh * 0.65).toFixed(4));
        data.costeEnergiaEUR = parseFloat((data.totalFacturaEUR * 0.65).toFixed(2));
        data.costePotenciaEUR = parseFloat((data.totalFacturaEUR * 0.25).toFixed(2));
      } else if (data.consumosKWh.total > 0 && !data.totalFacturaEUR) {
        data.preciosEnergiaEURKWh.p1 = 0.22;
        data.preciosEnergiaEURKWh.p2 = 0.17;
        data.preciosEnergiaEURKWh.p3 = 0.12;
        data.totalFacturaEUR = parseFloat((data.consumosKWh.total * 0.18 + 25).toFixed(2));
      } else if (data.totalFacturaEUR > 0 && !data.consumosKWh.total) {
        data.consumosKWh.total = Math.round((data.totalFacturaEUR * 0.70) / 0.18);
      }

      return data;
    },

    parseCSV(csvText) {
      const lines = csvText.split(/\r?\n/).filter(l => l.trim().length > 0);
      let totalKwh = 0;
      let cups = null;
      let countHours = 0;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!cups) {
          const m = line.match(/(ES[0-9]{16,20}[A-Za-z]{2})/i);
          if (m) cups = m[1].toUpperCase();
        }
        const parts = line.split(/[;,]/);
        // Buscar cualquier columna que sea un número flotante de consumo (e.g. 0.45)
        for (let p = parts.length - 1; p >= 0; p--) {
          const valCandidate = parseFloat(parts[p].trim().replace(',', '.'));
          if (!isNaN(valCandidate) && valCandidate >= 0 && valCandidate < 500 && parts[p].trim().match(/^[0-9]+([.,][0-9]+)?$/)) {
            totalKwh += valCandidate;
            countHours++;
            break;
          }
        }
      }

      const days = Math.max(Math.round(countHours / 24), 30);
      const totalEur = totalKwh * 0.18 + (days * 0.85);

      return {
        cups: cups || 'ES0021000000000000XX',
        distribuidora: 'Distribuidora (Datadis)',
        comercializadora: 'Archivo Horario CSV',
        tarifaAcceso: '2.0TD',
        diasFactura: days,
        potenciasContratadasKW: { p1: 4.6, p2: 4.6 },
        costePotenciaEUR: parseFloat((days * 0.85).toFixed(2)),
        consumosKWh: {
          p1: parseFloat((totalKwh * 0.35).toFixed(2)),
          p2: parseFloat((totalKwh * 0.30).toFixed(2)),
          p3: parseFloat((totalKwh * 0.35).toFixed(2)),
          total: parseFloat(totalKwh.toFixed(2))
        },
        preciosEnergiaEURKWh: { p1: 0.22, p2: 0.17, p3: 0.11 },
        costeEnergiaEUR: parseFloat((totalKwh * 0.18).toFixed(2)),
        impuestoElectricoEUR: parseFloat((totalEur * 0.05112).toFixed(2)),
        alquilerContadorEUR: 0.85,
        ivaEUR: parseFloat((totalEur * 0.21).toFixed(2)),
        totalFacturaEUR: parseFloat(totalEur.toFixed(2))
      };
    },

    parseJSON(jsonStr) {
      try {
        const obj = JSON.parse(jsonStr);
        return {
          cups: obj.cups || null,
          distribuidora: obj.distribuidora || 'Importado JSON',
          comercializadora: obj.comercializadora || 'Importado JSON',
          tarifaAcceso: obj.tarifaAcceso || '2.0TD',
          diasFactura: obj.diasFactura || 30,
          potenciasContratadasKW: obj.potenciasContratadasKW || { p1: 4.6, p2: 4.6 },
          costePotenciaEUR: obj.costePotenciaEUR || 20,
          consumosKWh: obj.consumosKWh || { total: obj.consumoTotal || 350, p1: 120, p2: 110, p3: 120 },
          preciosEnergiaEURKWh: obj.preciosEnergiaEURKWh || { p1: 0.22, p2: 0.17, p3: 0.11 },
          costeEnergiaEUR: obj.costeEnergiaEUR || 60,
          impuestoElectricoEUR: obj.impuestoElectricoEUR || 4,
          alquilerContadorEUR: obj.alquilerContadorEUR || 0.85,
          ivaEUR: obj.ivaEUR || 18,
          totalFacturaEUR: obj.totalFacturaEUR || 102.85
        };
      } catch (e) {
        return null;
      }
    }
  };

  /**
   * 2. MOTOR DE COMPARATIVA FOTOVOLTAICA (BEFORE VS AFTER SOLAR)
   */
  function computeComparison(bill) {
    if (!bill) return null;

    let kwp = 4.5;
    let annualYieldKWh = 6500;
    let batCap = 0;

    if (typeof getProjectCalcs === 'function') {
      const d = getProjectCalcs();
      if (d && d.numPanels > 0) {
        kwp = (d.numPanels * (d.cfg.potencia || 450)) / 1000.0;
        annualYieldKWh = d.annualKWh || (kwp * 1450); // [P0] getProjectCalcs canónico devuelve annualKWh (antes annualYieldKWh → SIEMPRE caía a kwp×1450)
      }
    }
    const batEl = document.getElementById('cfg-pres-bat-opt');
    if (batEl) batCap = parseFloat(batEl.value) || 0;

    const days = bill.diasFactura || 30;
    const factorAnual = 365.0 / Math.max(days, 1);
    const consumoAnualKWh = bill.consumosKWh.total > 0 ? (bill.consumosKWh.total * factorAnual) : 4500;
    const gastoAnualActualEUR = bill.totalFacturaEUR > 0 ? (bill.totalFacturaEUR * factorAnual) : (consumoAnualKWh * 0.22);
    const gastoMensualActualEUR = gastoAnualActualEUR / 12.0;

    // [P1] Modelo financiero propio (despacho horario TOU): única fuente de autarquía y
    // precio de compensación de excedentes. Fallback: límite físico producción/consumo.
    let _fin = null;
    if (typeof calculateFinancialModel === 'function') {
      try { _fin = calculateFinancialModel(); } catch (errFin) {
        if (window.RA && window.RA.log) window.RA.log.warn('calculateFinancialModel no disponible para comparativa', errFin);
      }
    }
    let baseAutarquia = Math.min(0.95, annualYieldKWh / Math.max(consumoAnualKWh, 1));
    if (_fin && Number.isFinite(_fin.autarquiaPct) && _fin.autarquiaPct > 0) {
      baseAutarquia = Math.max(0.05, Math.min(0.95, _fin.autarquiaPct / 100));
    }
    const autarquiaReal = Math.min(baseAutarquia, annualYieldKWh / Math.max(consumoAnualKWh, 1));
    const autoconsumoAnualKWh = consumoAnualKWh * autarquiaReal;
    const excedenteAnualKWh = Math.max(annualYieldKWh - autoconsumoAnualKWh, 0);

    const precioMedioCompra = (bill.consumosKWh.total > 0 && bill.costeEnergiaEUR > 0)
      ? (bill.costeEnergiaEUR / bill.consumosKWh.total)
      : 0.19;
    const precioCompensacion = (_fin && Number.isFinite(_fin.precioCompensacionEUR)) ? _fin.precioCompensacionEUR : 0.09;

    const costeTerminoFijoAnual = (bill.costePotenciaEUR > 0 ? (bill.costePotenciaEUR * factorAnual) : 220) + (12 * 10);
    const energiaCompradaRedAnualKWh = Math.max(consumoAnualKWh - autoconsumoAnualKWh, 0);
    const costeEnergiaRedAnual = energiaCompradaRedAnualKWh * precioMedioCompra;
    const ingresoCompensacionExcedenteAnual = excedenteAnualKWh * precioCompensacion;

    const costeEnergiaNetoAnual = Math.max(costeEnergiaRedAnual - ingresoCompensacionExcedenteAnual, 0);
    const subtotalConSolar = costeTerminoFijoAnual + costeEnergiaNetoAnual;
    const ivaConSolar = subtotalConSolar * 0.21;
    const gastoAnualConSolarEUR = subtotalConSolar + ivaConSolar;
    const gastoMensualConSolarEUR = gastoAnualConSolarEUR / 12.0;

    const ahorroAnualEUR = Math.max(gastoAnualActualEUR - gastoAnualConSolarEUR, 0);
    const ahorroMensualEUR = ahorroAnualEUR / 12.0;
    const porcentajeAhorro = gastoAnualActualEUR > 0 ? Math.round((ahorroAnualEUR / gastoAnualActualEUR) * 100) : 70;

    let cuotaFinanciacionMensual = 0;
    let balanceNetoConFinanciacion = ahorroMensualEUR;
    if (_fin && _fin.cuotaMensual) {
      cuotaFinanciacionMensual = _fin.cuotaMensual;
      balanceNetoConFinanciacion = ahorroMensualEUR - cuotaFinanciacionMensual;
    }

    return {
      consumoAnualKWh: Math.round(consumoAnualKWh),
      gastoAnualActualEUR: Math.round(gastoAnualActualEUR),
      gastoMensualActualEUR: Math.round(gastoMensualActualEUR),
      gastoAnualConSolarEUR: Math.round(gastoAnualConSolarEUR),
      gastoMensualConSolarEUR: Math.round(gastoMensualConSolarEUR),
      ahorroAnualEUR: Math.round(ahorroAnualEUR),
      ahorroMensualEUR: Math.round(ahorroMensualEUR),
      porcentajeAhorro: Math.min(porcentajeAhorro, 95),
      autoconsumoAnualKWh: Math.round(autoconsumoAnualKWh),
      excedenteAnualKWh: Math.round(excedenteAnualKWh),
      autarquiaPct: Math.round(autarquiaReal * 100),
      cuotaFinanciacionMensual: Math.round(cuotaFinanciacionMensual),
      balanceNetoConFinanciacion: Math.round(balanceNetoConFinanciacion),
      kwp: kwp,
      annualYieldKWh: Math.round(annualYieldKWh),
      batCap: batCap
    };
  }

  /**
   * 3. RENDERIZADO DEL MODAL GLASSMORFICO DE AUDITORÍA
   */
  function ensureModalDOM() {
    let modal = document.getElementById('ra-bill-auditor-modal');
    if (modal) return modal;

    const modalHTML = `
      <div id="ra-bill-auditor-modal" style="display:none;position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(5,10,20,0.82);backdrop-filter:blur(8px);z-index:999999;align-items:center;justify-content:center;font-family:var(--font-sans, system-ui, -apple-system, sans-serif);">
        <div style="width:920px;max-width:95vw;max-height:92vh;background:linear-gradient(135deg, rgba(15,23,42,0.96) 0%, rgba(30,41,59,0.94) 100%);border:1px solid rgba(245,158,11,0.35);box-shadow:0 25px 60px rgba(0,0,0,0.6), 0 0 30px rgba(245,158,11,0.15);border-radius:14px;overflow:hidden;display:flex;flex-direction:column;color:#fff;">
          
          <!-- Header -->
          <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 24px;border-bottom:1px solid rgba(255,255,255,0.08);background:rgba(0,0,0,0.25);">
            <div style="display:flex;align-items:center;gap:12px;">
              <div style="width:36px;height:36px;border-radius:8px;background:linear-gradient(135deg,#f59e0b,#d97706);display:flex;align-items:center;justify-content:center;box-shadow:0 0 12px rgba(245,158,11,0.4);">
                <span style="font-size:18px;">📄</span>
              </div>
              <div>
                <h3 style="margin:0;font-size:15px;font-weight:800;letter-spacing:-0.3px;color:#fff;text-transform:uppercase;">Auditoría de Factura Eléctrica &amp; Comparativa de Ahorro</h3>
                <span style="font-size:10px;color:rgba(255,255,255,0.6);font-weight:600;">Contraste de consumo y coste real del cliente vs producción fotovoltaica 3D</span>
              </div>
            </div>
            <button id="btn-close-bill-modal" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:#fff;width:32px;height:32px;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px;transition:all 0.2s;">✕</button>
          </div>

          <!-- Body (Grid 2 columnas) -->
          <div style="display:grid;grid-template-columns:1.05fr 1fr;gap:20px;padding:20px 24px;overflow-y:auto;flex:1;">
            
            <!-- Columna Izquierda: Subida y Datos Factura -->
            <div style="display:flex;flex-direction:column;gap:14px;">
              
              <!-- Dropzone -->
              <div id="bill-dropzone" style="border:2px dashed rgba(245,158,11,0.45);background:rgba(245,158,11,0.04);border-radius:10px;padding:18px;text-align:center;cursor:pointer;transition:all 0.2s;display:flex;flex-direction:column;align-items:center;gap:6px;">
                <input type="file" id="bill-file-input" accept=".txt,.csv,.json,.pdf,.xml" style="display:none;">
                <span style="font-size:26px;">⚡</span>
                <span style="font-size:12px;font-weight:800;color:#f59e0b;">Arrastra tu factura eléctrica aquí o haz clic para subir</span>
                <span style="font-size:9.5px;color:rgba(255,255,255,0.6);">Formatos soportados: TXT / CSV (Curvas Datadis) / JSON / Facturas digitales</span>
              </div>

              <!-- Pegar texto directo opcional -->
              <div style="display:flex;flex-direction:column;gap:6px;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <span style="font-size:10px;font-weight:700;color:rgba(255,255,255,0.7);text-transform:uppercase;">O pega el texto de la factura / datos rápidos:</span>
                  <button id="btn-parse-pasted-text" style="font-size:9px;background:rgba(14,165,233,0.2);border:1px solid #0ea5e9;color:#38bdf8;padding:2px 8px;border-radius:4px;cursor:pointer;">Analizar Texto</button>
                </div>
                <textarea id="bill-raw-textarea" rows="3" placeholder="Pega aquí el texto copiado de tu factura (Endesa, Iberdrola, Naturgy, etc.)..." style="width:100%;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:#fff;font-size:9.5px;font-family:monospace;padding:8px;resize:none;box-sizing:border-box;"></textarea>
              </div>

              <!-- Formulario de Campos Auditados / Editables -->
              <div style="background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:8px;">
                <div style="font-size:10px;font-weight:800;color:#f59e0b;text-transform:uppercase;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:4px;display:flex;justify-content:space-between;">
                  <span>Datos Extraídos de la Factura</span>
                  <span id="bill-detected-company" style="color:#38bdf8;font-weight:700;">Sin factura</span>
                </div>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                  <div>
                    <label style="font-size:9px;color:rgba(255,255,255,0.6);display:block;margin-bottom:2px;">CUPS:</label>
                    <input type="text" id="bill-edit-cups" value="" placeholder="ES0021..." style="width:100%;background:rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.15);color:#fff;font-size:10px;padding:4px 6px;border-radius:4px;box-sizing:border-box;">
                  </div>
                  <div>
                    <label style="font-size:9px;color:rgba(255,255,255,0.6);display:block;margin-bottom:2px;">Tarifa Acceso:</label>
                    <input type="text" id="bill-edit-tarifa" value="2.0TD" style="width:100%;background:rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.15);color:#fff;font-size:10px;padding:4px 6px;border-radius:4px;box-sizing:border-box;">
                  </div>
                </div>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                  <div>
                    <label style="font-size:9px;color:rgba(255,255,255,0.6);display:block;margin-bottom:2px;">Importe Factura (€):</label>
                    <input type="number" id="bill-edit-total" value="125.00" step="1" style="width:100%;background:rgba(0,0,0,0.5);border:1px solid rgba(245,158,11,0.5);color:#f59e0b;font-weight:800;font-size:11px;padding:4px 6px;border-radius:4px;box-sizing:border-box;">
                  </div>
                  <div>
                    <label style="font-size:9px;color:rgba(255,255,255,0.6);display:block;margin-bottom:2px;">Consumo Facturado (kWh):</label>
                    <input type="number" id="bill-edit-kwh" value="450" step="10" style="width:100%;background:rgba(0,0,0,0.5);border:1px solid rgba(14,165,233,0.5);color:#38bdf8;font-weight:800;font-size:11px;padding:4px 6px;border-radius:4px;box-sizing:border-box;">
                  </div>
                </div>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                  <div>
                    <label style="font-size:9px;color:rgba(255,255,255,0.6);display:block;margin-bottom:2px;">Días Periodo Facturado:</label>
                    <input type="number" id="bill-edit-days" value="30" step="1" style="width:100%;background:rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.15);color:#fff;font-size:10px;padding:4px 6px;border-radius:4px;box-sizing:border-box;">
                  </div>
                  <div>
                    <label style="font-size:9px;color:rgba(255,255,255,0.6);display:block;margin-bottom:2px;">Potencia P1 / P2 (kW):</label>
                    <input type="text" id="bill-edit-pot" value="4.6 kW" style="width:100%;background:rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.15);color:#fff;font-size:10px;padding:4px 6px;border-radius:4px;box-sizing:border-box;">
                  </div>
                </div>

                <button id="btn-recalculate-bill" style="background:rgba(245,158,11,0.2);border:1px solid #f59e0b;color:#fbbf24;font-size:10px;font-weight:800;padding:6px;border-radius:5px;cursor:pointer;margin-top:4px;">
                  🔄 Actualizar Comparativa de Ahorro
                </button>
              </div>

            </div>

            <!-- Columna Derecha: Comparativa Antes vs Con Solar & Gráficos -->
            <div style="display:flex;flex-direction:column;gap:12px;">
              
              <!-- Tarjeta de Resumen de Impacto -->
              <div style="background:linear-gradient(135deg, rgba(16,185,129,0.12), rgba(5,150,105,0.05));border:1px solid rgba(16,185,129,0.35);border-radius:10px;padding:14px;display:flex;justify-content:space-between;align-items:center;">
                <div>
                  <div style="font-size:9.5px;color:rgba(255,255,255,0.7);font-weight:700;text-transform:uppercase;">Ahorro Anual Estimado</div>
                  <div id="bill-resumen-ahorro-anual" style="font-size:22px;font-weight:900;color:#10b981;">0 € / año</div>
                  <div id="bill-resumen-ahorro-mes" style="font-size:11px;color:#34d399;font-weight:700;">0 € / mes de reducción</div>
                </div>
                <div style="text-align:right;">
                  <div style="font-size:9.5px;color:rgba(255,255,255,0.7);font-weight:700;text-transform:uppercase;">Reducción en Factura</div>
                  <div id="bill-resumen-pct-ahorro" style="font-size:24px;font-weight:900;color:#fbbf24;">-0%</div>
                  <div id="bill-resumen-autarquia" style="font-size:10px;color:rgba(255,255,255,0.8);font-weight:600;">Autarquía: 0%</div>
                </div>
              </div>

              <!-- Gráfico SVG Comparativo: Factura Actual vs Con Solar -->
              <div style="background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:12px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                  <span style="font-size:10px;font-weight:800;color:#fff;text-transform:uppercase;">Comparativa Mensual (€/mes)</span>
                  <span style="font-size:9px;color:#10b981;font-weight:700;">Antes vs Después</span>
                </div>
                <div id="bill-comparison-chart-wrap" style="height:140px;width:100%;position:relative;">
                  <!-- SVG Inyectado dinámicamente -->
                </div>
              </div>

              <!-- Desglose Comparativo en Tabla -->
              <div style="background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:10px;font-size:10px;">
                <table style="width:100%;border-collapse:collapse;">
                  <thead>
                    <tr style="border-bottom:1px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.6);">
                      <th style="text-align:left;padding:4px;">Concepto</th>
                      <th style="text-align:right;padding:4px;color:#ef4444;">Sin Solar</th>
                      <th style="text-align:right;padding:4px;color:#10b981;">Con Solar 3D</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
                      <td style="padding:4px;">Gasto Mensual Medio</td>
                      <td id="table-val-gasto-sin" style="text-align:right;padding:4px;font-weight:700;">125 €</td>
                      <td id="table-val-gasto-con" style="text-align:right;padding:4px;font-weight:700;color:#10b981;">35 €</td>
                    </tr>
                    <tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
                      <td style="padding:4px;">Gasto Anual Acumulado</td>
                      <td id="table-val-anual-sin" style="text-align:right;padding:4px;font-weight:700;">1.500 €</td>
                      <td id="table-val-anual-con" style="text-align:right;padding:4px;font-weight:700;color:#10b981;">420 €</td>
                    </tr>
                    <tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
                      <td style="padding:4px;">Consumo Red (kWh/año)</td>
                      <td id="table-val-kwh-sin" style="text-align:right;padding:4px;">5.450 kWh</td>
                      <td id="table-val-kwh-con" style="text-align:right;padding:4px;color:#38bdf8;">1.635 kWh</td>
                    </tr>
                    <tr>
                      <td style="padding:4px;">Balance Neto (con cuota fin.)</td>
                      <td style="text-align:right;padding:4px;color:rgba(255,255,255,0.5);">-</td>
                      <td id="table-val-balance-fin" style="text-align:right;padding:4px;font-weight:800;color:#fbbf24;">+38 €/mes</td>
                    </tr>
                  </tbody>
                </table>
              </div>

            </div>

          </div>

          <!-- Footer Acciones -->
          <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 24px;border-top:1px solid rgba(255,255,255,0.08);background:rgba(0,0,0,0.3);">
            <div style="font-size:9.5px;color:rgba(255,255,255,0.5);">
              Los datos auditados se aplican automáticamente al modelo financiero y a la propuesta PDF.
            </div>
            <div style="display:flex;gap:10px;">
              <button id="btn-cancel-bill-modal" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:#fff;font-size:11px;font-weight:700;padding:8px 16px;border-radius:6px;cursor:pointer;">
                Cerrar
              </button>
              <button id="btn-apply-bill-data" style="background:linear-gradient(135deg,#10b981,#059669);border:1px solid #10b981;color:#fff;font-size:11px;font-weight:800;padding:8px 20px;border-radius:6px;cursor:pointer;box-shadow:0 0 12px rgba(16,185,129,0.35);">
                ✓ Aplicar Datos Reales al Presupuesto
              </button>
            </div>
          </div>

        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    modal = document.getElementById('ra-bill-auditor-modal');
    setupModalEvents(modal);
    return modal;
  }

  /**
   * 4. RENDERIZADO DEL GRÁFICO COMPARATIVO EN SVG
   */
  function renderComparisonSVG(comp) {
    const wrap = document.getElementById('bill-comparison-chart-wrap');
    if (!wrap) return;

    if (!comp) {
      wrap.innerHTML = '<div style="height:100%;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.4);font-size:11px;">Sube una factura para generar el gráfico comparativo</div>';
      return;
    }

    const sin = comp.gastoMensualActualEUR || 120;
    const con = comp.gastoMensualConSolarEUR || 35;
    const maxVal = Math.max(sin, con, 150) * 1.2;

    const barHeightSin = Math.round((sin / maxVal) * 90);
    const barHeightCon = Math.round((con / maxVal) * 90);

    const svgHTML = `
      <svg viewBox="0 0 380 130" style="width:100%;height:100%;overflow:visible;">
        <line x1="40" y1="20" x2="360" y2="20" stroke="rgba(255,255,255,0.06)" stroke-dasharray="3,3" />
        <line x1="40" y1="65" x2="360" y2="65" stroke="rgba(255,255,255,0.06)" stroke-dasharray="3,3" />
        <line x1="40" y1="110" x2="360" y2="110" stroke="rgba(255,255,255,0.15)" />

        <g>
          <rect x="90" y="${110 - barHeightSin}" width="65" height="${barHeightSin}" rx="4" fill="url(#gradSinSolar)" />
          <text x="122.5" y="${102 - barHeightSin}" fill="#f87171" font-size="11" font-weight="900" text-anchor="middle">${sin} €/mes</text>
          <text x="122.5" y="124" fill="rgba(255,255,255,0.7)" font-size="9" font-weight="700" text-anchor="middle">FACTURA ACTUAL</text>
        </g>

        <g>
          <rect x="225" y="${110 - barHeightCon}" width="65" height="${barHeightCon}" rx="4" fill="url(#gradConSolar)" />
          <text x="257.5" y="${102 - barHeightCon}" fill="#34d399" font-size="11" font-weight="900" text-anchor="middle">${con} €/mes</text>
          <text x="257.5" y="124" fill="#10b981" font-size="9" font-weight="800" text-anchor="middle">CON SOLAR 3D</text>
        </g>

        <path d="M 160 50 Q 190 35 220 50" fill="none" stroke="#fbbf24" stroke-width="2" stroke-dasharray="2,2" />
        <text x="190" y="32" fill="#fbbf24" font-size="9.5" font-weight="800" text-anchor="middle">-${comp.porcentajeAhorro}%</text>

        <defs>
          <linearGradient id="gradSinSolar" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#ef4444" stop-opacity="0.9"/>
            <stop offset="100%" stop-color="#b91c1c" stop-opacity="0.7"/>
          </linearGradient>
          <linearGradient id="gradConSolar" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#10b981" stop-opacity="0.95"/>
            <stop offset="100%" stop-color="#047857" stop-opacity="0.75"/>
          </linearGradient>
        </defs>
      </svg>
    `;

    wrap.innerHTML = svgHTML;
  }

  /**
   * 5. ACTUALIZAR INTERFAZ DEL MODAL CON LOS DATOS DE FACTURA
   */
  function updateModalUI(bill, comp) {
    if (!bill) return;

    const companyEl = document.getElementById('bill-detected-company');
    if (companyEl) companyEl.textContent = bill.comercializadora + (bill.tarifaAcceso ? ' (' + bill.tarifaAcceso + ')' : '');

    const cupsEl = document.getElementById('bill-edit-cups');
    if (cupsEl && bill.cups) cupsEl.value = bill.cups;

    const tarifaEl = document.getElementById('bill-edit-tarifa');
    if (tarifaEl && bill.tarifaAcceso) tarifaEl.value = bill.tarifaAcceso;

    const totalEl = document.getElementById('bill-edit-total');
    if (totalEl) totalEl.value = bill.totalFacturaEUR ? bill.totalFacturaEUR.toFixed(2) : '125.00';

    const kwhEl = document.getElementById('bill-edit-kwh');
    if (kwhEl) kwhEl.value = bill.consumosKWh.total ? bill.consumosKWh.total : '450';

    const daysEl = document.getElementById('bill-edit-days');
    if (daysEl) daysEl.value = bill.diasFactura || 30;

    const potEl = document.getElementById('bill-edit-pot');
    if (potEl) potEl.value = (bill.potenciasContratadasKW.p1 || 4.6) + ' kW';

    if (comp) {
      const ahorroAnualEl = document.getElementById('bill-resumen-ahorro-anual');
      if (ahorroAnualEl) ahorroAnualEl.textContent = comp.ahorroAnualEUR.toLocaleString('es-ES') + ' € / año';

      const ahorroMesEl = document.getElementById('bill-resumen-ahorro-mes');
      if (ahorroMesEl) ahorroMesEl.textContent = comp.ahorroMensualEUR.toLocaleString('es-ES') + ' € / mes de reducción';

      const pctAhorroEl = document.getElementById('bill-resumen-pct-ahorro');
      if (pctAhorroEl) pctAhorroEl.textContent = '-' + comp.porcentajeAhorro + '%';

      const autarquiaEl = document.getElementById('bill-resumen-autarquia');
      if (autarquiaEl) autarquiaEl.textContent = 'Autarquía: ' + comp.autarquiaPct + '%';

      const gastoSin = document.getElementById('table-val-gasto-sin');
      if (gastoSin) gastoSin.textContent = comp.gastoMensualActualEUR + ' €';

      const gastoCon = document.getElementById('table-val-gasto-con');
      if (gastoCon) gastoCon.textContent = comp.gastoMensualConSolarEUR + ' €';

      const anualSin = document.getElementById('table-val-anual-sin');
      if (anualSin) anualSin.textContent = comp.gastoAnualActualEUR.toLocaleString('es-ES') + ' €';

      const anualCon = document.getElementById('table-val-anual-con');
      if (anualCon) anualCon.textContent = comp.gastoAnualConSolarEUR.toLocaleString('es-ES') + ' €';

      const kwhSin = document.getElementById('table-val-kwh-sin');
      if (kwhSin) kwhSin.textContent = comp.consumoAnualKWh.toLocaleString('es-ES') + ' kWh';

      const kwhCon = document.getElementById('table-val-kwh-con');
      if (kwhCon) kwhCon.textContent = Math.round(comp.consumoAnualKWh * (1 - comp.autarquiaPct / 100)).toLocaleString('es-ES') + ' kWh';

      const balFin = document.getElementById('table-val-balance-fin');
      if (balFin) balFin.textContent = (comp.balanceNetoConFinanciacion >= 0 ? '+' : '') + comp.balanceNetoConFinanciacion + ' €/mes';

      renderComparisonSVG(comp);
    }
  }

  /**
   * 6. EVENTOS DEL MODAL
   */
  function setupModalEvents(modal) {
    const closeBtn = document.getElementById('btn-close-bill-modal');
    const cancelBtn = document.getElementById('btn-cancel-bill-modal');
    const dropzone = document.getElementById('bill-dropzone');
    const fileInput = document.getElementById('bill-file-input');
    const parsePastedBtn = document.getElementById('btn-parse-pasted-text');
    const recalculateBtn = document.getElementById('btn-recalculate-bill');
    const applyBtn = document.getElementById('btn-apply-bill-data');

    const closeModal = () => {
      modal.style.display = 'none';
      BILL_AUDITOR_STATE.modalOpen = false;
    };

    if (closeBtn) closeBtn.onclick = closeModal;
    if (cancelBtn) cancelBtn.onclick = closeModal;

    if (dropzone && fileInput) {
      dropzone.onclick = () => fileInput.click();

      dropzone.ondragover = (e) => {
        e.preventDefault();
        dropzone.style.background = 'rgba(245,158,11,0.12)';
        dropzone.style.borderColor = '#fbbf24';
      };
      dropzone.ondragleave = () => {
        dropzone.style.background = 'rgba(245,158,11,0.04)';
        dropzone.style.borderColor = 'rgba(245,158,11,0.45)';
      };
      dropzone.ondrop = (e) => {
        e.preventDefault();
        dropzone.style.background = 'rgba(245,158,11,0.04)';
        dropzone.style.borderColor = 'rgba(245,158,11,0.45)';
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          handleUploadedFile(e.dataTransfer.files[0]);
        }
      };

      fileInput.onchange = (e) => {
        if (e.target.files && e.target.files.length > 0) {
          handleUploadedFile(e.target.files[0]);
        }
      };
    }

    if (parsePastedBtn) {
      parsePastedBtn.onclick = () => {
        const area = document.getElementById('bill-raw-textarea');
        if (area && area.value.trim().length > 0) {
          processRawContent(area.value, 'pasted-bill.txt');
        }
      };
    }

    if (recalculateBtn) {
      recalculateBtn.onclick = () => {
        const total = parseFloat(document.getElementById('bill-edit-total').value) || 0;
        const kwh = parseFloat(document.getElementById('bill-edit-kwh').value) || 0;
        const days = parseInt(document.getElementById('bill-edit-days').value) || 30;
        const cups = document.getElementById('bill-edit-cups').value || '';
        const tarifa = document.getElementById('bill-edit-tarifa').value || '2.0TD';

        BILL_AUDITOR_STATE.currentBill = {
          cups: cups,
          distribuidora: 'Ajuste Manual',
          comercializadora: 'Personalizado',
          tarifaAcceso: tarifa,
          diasFactura: days,
          potenciasContratadasKW: { p1: 4.6, p2: 4.6 },
          costePotenciaEUR: parseFloat((total * 0.25).toFixed(2)),
          consumosKWh: { total: kwh, p1: kwh * 0.35, p2: kwh * 0.30, p3: kwh * 0.35 },
          preciosEnergiaEURKWh: { p1: 0.22, p2: 0.17, p3: 0.11 },
          costeEnergiaEUR: parseFloat((total * 0.65).toFixed(2)),
          totalFacturaEUR: total
        };

        BILL_AUDITOR_STATE.comparison = computeComparison(BILL_AUDITOR_STATE.currentBill);
        updateModalUI(BILL_AUDITOR_STATE.currentBill, BILL_AUDITOR_STATE.comparison);
      };
    }

    if (applyBtn) {
      applyBtn.onclick = () => {
        applyBillToBudget();
        closeModal();
      };
    }
  }

  /**
   * 7. PROCESAMIENTO DE ARCHIVO SUBIDO
   */
  function handleUploadedFile(file) {
    const reader = new FileReader();
    const fileName = file.name || '';
    const isJSON = fileName.toLowerCase().endsWith('.json');
    const isCSV = fileName.toLowerCase().endsWith('.csv');

    reader.onload = (e) => {
      const content = e.target.result;
      processRawContent(content, fileName, isJSON, isCSV);
    };

    reader.readAsText(file);
  }

  function processRawContent(content, fileName, isJSON, isCSV) {
    let bill = null;

    if (isJSON || (fileName && fileName.endsWith('.json'))) {
      bill = BillParser.parseJSON(content);
    } else if (isCSV || (fileName && fileName.endsWith('.csv')) || content.includes(';Hora;')) {
      bill = BillParser.parseCSV(content);
    } else {
      bill = BillParser.parseText(content);
    }

    if (!bill) {
      alert('No se pudieron reconocer datos válidos en el archivo. Puedes ingresar los importes manualmente en el formulario.');
      return;
    }

    BILL_AUDITOR_STATE.currentBill = bill;
    BILL_AUDITOR_STATE.comparison = computeComparison(bill);
    updateModalUI(bill, BILL_AUDITOR_STATE.comparison);

    if (typeof showToast === 'function') {
      showToast('Factura procesada: ' + bill.totalFacturaEUR + ' € · ' + bill.consumosKWh.total + ' kWh', 'success');
    }
  }

  /**
   * 8. APLICAR DATOS DE FACTURA AL PRESUPUESTO & ESTUDIO DE LA APLICACIÓN
   */
  function applyBillToBudget() {
    const bill = BILL_AUDITOR_STATE.currentBill;
    const comp = BILL_AUDITOR_STATE.comparison;
    if (!bill || !comp) return;

    const facturaInput = document.getElementById('cfg-pres-factura-mes');
    if (facturaInput) {
      facturaInput.value = Math.round(comp.gastoMensualActualEUR);
      facturaInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    const consumoInput = document.getElementById('cfg-pres-consumo-anual');
    if (consumoInput) {
      consumoInput.value = Math.round(comp.consumoAnualKWh);
      consumoInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    if (bill.cups) {
      const titularCups = document.getElementById('tit-cups');
      if (titularCups) titularCups.value = bill.cups;
    }

    // Sincronizar targetKwp en solarProjectConfig según el consumo anual auditado
    if (!window.solarProjectConfig) window.solarProjectConfig = {};
    const hspEst = (window.solarYieldResults && window.solarYieldResults.hsp) || 1450;
    const targetKwp = Math.max(0.5, Math.round((comp.consumoAnualKWh / hspEst) * 100) / 100);
    window.solarProjectConfig.targetKwp = targetKwp;

    // Si el usuario tiene activo el criterio de ajuste por consumo, regenerar layout con la nueva meta
    const radios = document.getElementsByName('project_objective');
    let isTargetKwh = false;
    for (let r of radios) {
      if (r.checked && r.value === 'target_kwh') {
        isTargetKwh = true;
        break;
      }
    }

    if (isTargetKwh || window.solarProjectConfig.selectedObjective === 'target_kwh') {
      if (typeof roofPanelsCache !== 'undefined' && roofPanelsCache) {
        roofPanelsCache.sig = "";
        roofPanelsCache.data = null;
      }
      if (typeof wpFastRenderSimulatedPanels === 'function') {
        wpFastRenderSimulatedPanels();
      } else if (typeof step5RegenerateLayout === 'function') {
        step5RegenerateLayout();
      }
      if (typeof recalculateSolarYield === 'function') {
        recalculateSolarYield();
      }
      if (typeof wpUpdateStep3UI === 'function') {
        wpUpdateStep3UI();
      }
    }

    if (typeof updateBudgetUI === 'function') {
      updateBudgetUI();
    }

    if (typeof showToast === 'function') {
      showToast('¡Datos de la factura sincronizados! Meta: ' + targetKwp + ' kWp (' + Math.round(comp.consumoAnualKWh) + ' kWh/año).', 'success', 4000);
    }
  }

  /**
   * 9. APERTURA Y CONTROL EXTERNO DEL MODAL
   */
  function openBillAuditorModal() {
    const modal = ensureModalDOM();
    modal.style.display = 'flex';
    BILL_AUDITOR_STATE.modalOpen = true;

    if (!BILL_AUDITOR_STATE.currentBill) {
      const curFactura = parseFloat((document.getElementById('cfg-pres-factura-mes') || {}).value) || 125;
      const curConsumo = parseFloat((document.getElementById('cfg-pres-consumo-anual') || {}).value) || 5450;
      BILL_AUDITOR_STATE.currentBill = {
        cups: 'ES0021000000000000XX',
        distribuidora: 'Distribuidora',
        comercializadora: 'Mercado Libre / Regulado',
        tarifaAcceso: '2.0TD',
        diasFactura: 30,
        potenciasContratadasKW: { p1: 4.6, p2: 4.6 },
        costePotenciaEUR: 28.50,
        consumosKWh: { total: Math.round(curConsumo / 12), p1: 150, p2: 120, p3: 180 },
        preciosEnergiaEURKWh: { p1: 0.22, p2: 0.17, p3: 0.11 },
        costeEnergiaEUR: curFactura * 0.65,
        totalFacturaEUR: curFactura
      };
    }
    BILL_AUDITOR_STATE.comparison = computeComparison(BILL_AUDITOR_STATE.currentBill);
    updateModalUI(BILL_AUDITOR_STATE.currentBill, BILL_AUDITOR_STATE.comparison);
  }

  window.RA.billAuditor = {
    openModal: openBillAuditorModal,
    parseText: (txt) => BillParser.parseText(txt),
    parseCSV: (csv) => BillParser.parseCSV(csv),
    parseJSON: (j) => BillParser.parseJSON(j),
    computeComparison: computeComparison,
    getState: () => BILL_AUDITOR_STATE,
    applyToBudget: applyBillToBudget,
    get currentBill() { return BILL_AUDITOR_STATE.currentBill; },
    get comparison() { return BILL_AUDITOR_STATE.comparison; }
  };

  window.openBillAuditorModal = openBillAuditorModal;
  window.RABillAuditor = window.RA.billAuditor;

})();
