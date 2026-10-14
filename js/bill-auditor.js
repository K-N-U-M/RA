// ============================================================================
// RA-BILL-AUDITOR — MÓDULO INDEPENDIENTE DE AUDITORÍA Y COMPARATIVA DE FACTURAS
// Doble Motor Canónico:
// 1. Motor Local Determinista (Regex multiformato, CSV Curvas Datadis, JSON).
// 2. Motor IA Multimodal (Google Gemini API: PDFs digitales/escaneados, fotos móviles y texto).
// Calidad AAA: Selector de motor inteligente, UI Glassmorphic, Gráficos comparativos SVG,
// diagnóstico IA y sincronización no invasiva con el modelo financiero y presupuesto.
// ============================================================================
(function() {
  'use strict';

  // Namespace seguro
  window.RA = window.RA || {};

  const BILL_AUDITOR_STATE = {
    currentBill: null,       // Datos de la factura analizada
    comparison: null,        // Comparativa técnica/económica con el sistema FV
    modalOpen: false,
    activeEngine: 'auto',    // 'auto' | 'ai' | 'local'
    isAnalyzing: false,      // Estado de carga durante análisis IA
    pendingFile: null        // Archivo en espera si se requiere API Key
  };

  /**
   * 1. PARSER DETERMINISTA LOCAL DE FACTURAS ELÉCTRICAS (ESPAÑA)
   */
  const BillParser = {
    cleanText(raw) {
      return (raw || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
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
        potenciasContratadasKW: { p1: 0, p2: 0, p3: 0 },
        costePotenciaEUR: 0,
        consumosKWh: { p1: 0, p2: 0, p3: 0, total: 0 },
        preciosEnergiaEURKWh: { p1: 0, p2: 0, p3: 0 },
        costeEnergiaEUR: 0,
        impuestoElectricoEUR: 0,
        alquilerContadorEUR: 0,
        ivaEUR: 0,
        totalFacturaEUR: 0,
        historicoMensualKWh: null,
        consumoAnualEstimadoKWh: null,
        diagnosticoIA: null,
        fuente: 'local',
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
      else if (/octopus/i.test(clean)) data.comercializadora = 'Octopus Energy';
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
        potenciasContratadasKW: { p1: 4.6, p2: 4.6, p3: 0 },
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
        totalFacturaEUR: parseFloat(totalEur.toFixed(2)),
        historicoMensualKWh: null,
        consumoAnualEstimadoKWh: null,
        diagnosticoIA: null,
        fuente: 'local'
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
          potenciasContratadasKW: obj.potenciasContratadasKW || { p1: 4.6, p2: 4.6, p3: 0 },
          costePotenciaEUR: (typeof obj.costePotenciaEUR === 'number') ? obj.costePotenciaEUR : 20,
          consumosKWh: obj.consumosKWh || { total: (typeof obj.consumoTotal === 'number') ? obj.consumoTotal : 350, p1: 120, p2: 110, p3: 120 },
          preciosEnergiaEURKWh: obj.preciosEnergiaEURKWh || { p1: 0.22, p2: 0.17, p3: 0.11 },
          costeEnergiaEUR: obj.costeEnergiaEUR || 60,
          impuestoElectricoEUR: obj.impuestoElectricoEUR || 4,
          alquilerContadorEUR: obj.alquilerContadorEUR || 0.85,
          ivaEUR: obj.ivaEUR || 18,
          totalFacturaEUR: obj.totalFacturaEUR || 102.85,
          historicoMensualKWh: obj.historicoMensualKWh || null,
          consumoAnualEstimadoKWh: obj.consumoAnualEstimadoKWh || null,
          diagnosticoIA: obj.diagnosticoIA || null,
          fuente: 'local'
        };
      } catch (e) {
        return null;
      }
    }
  };

  /**
   * 1.1 MOTOR INTELIGENTE IA (GOOGLE GEMINI MULTIMODAL)
   */
  const AIBillParser = {
    getApiKey() {
      let key = '';
      try {
        key = (window.RA && window.RA.geminiApiKey)
          ? window.RA.geminiApiKey
          : (localStorage.getItem('ra_gemini_api_key') || '');
      } catch (e) { key = ''; }
      return (key || '').trim();
    },

    setApiKey(key) {
      const cleanKey = (key || '').trim();
      try {
        if (cleanKey) {
          localStorage.setItem('ra_gemini_api_key', cleanKey);
        } else {
          localStorage.removeItem('ra_gemini_api_key');
        }
      } catch (e) {}
      window.RA = window.RA || {};
      window.RA.geminiApiKey = cleanKey;
      return cleanKey;
    },

    async analyzeDocument({ base64Data, mimeType, textData, fileName }) {
      const apiKey = this.getApiKey();
      if (!apiKey) {
        const err = new Error('No se ha configurado la API Key de Google Gemini.');
        err.code = 'NO_API_KEY';
        throw err;
      }

      const prompt = `Eres un auditor energético experto en el mercado eléctrico español (tarifas 2.0TD, 3.0TD, 6.1TD, PVPC y mercado libre).
Analiza minuciosamente este documento de factura eléctrica (PDF, imagen fotográfica o texto).
Extrae todos los datos técnicos, contractuales y económicos con precisión.

Devuelve EXCLUSIVAMENTE un objeto JSON válido con la siguiente estructura exacta:
{
  "cups": "Código CUPS (e.g. ES0021000000000000XX) o null si no figura",
  "distribuidora": "Nombre de la distribuidora (i-DE, E-Distribución, UFD, E-Redes, etc.) o null",
  "comercializadora": "Nombre comercial de la comercializadora (Iberdrola, Endesa, Naturgy, TotalEnergies, Repsol, Octopus, Curenergía, etc.)",
  "tarifaAcceso": "2.0TD",
  "periodoInicio": "YYYY-MM-DD o null",
  "periodoFin": "YYYY-MM-DD o null",
  "diasFactura": 30,
  "potenciasContratadasKW": {
    "p1": 4.6,
    "p2": 4.6,
    "p3": 0.0
  },
  "costePotenciaEUR": 25.40,
  "consumosKWh": {
    "p1": 120.0,
    "p2": 95.0,
    "p3": 140.0,
    "total": 355.0
  },
  "preciosEnergiaEURKWh": {
    "p1": 0.185,
    "p2": 0.142,
    "p3": 0.098
  },
  "costeEnergiaEUR": 55.30,
  "impuestoElectricoEUR": 2.80,
  "alquilerContadorEUR": 0.85,
  "ivaEUR": 17.50,
  "totalFacturaEUR": 101.85,
  "historicoMensualKWh": null,
  "consumoAnualEstimadoKWh": null,
  "diagnosticoIA": "Diagnóstico breve (máx 35 palabras) evaluando si la potencia está sobredimensionada y la competitividad del precio por kWh para amortización solar."
}

Normas estrictas:
1. Si detectas el gráfico de barras de consumo mensual (los últimos 12 meses), extrae los 12 números de kWh en 'historicoMensualKWh' y su suma en 'consumoAnualEstimadoKWh'.
2. Si la factura indica expresamente el dato de 'Consumo acumulado último año' o similar, asígnalo a 'consumoAnualEstimadoKWh'.
3. Los importes y consumos deben ser números flotantes limpios (no strings con símbolos).
4. No inventes cifras. Si un dato no figura, usa 0 o null.
5. Devuelve solo el JSON puro sin bloques markdown ni texto conversational.`;

      const parts = [];
      if (base64Data) {
        parts.push({
          inlineData: {
            mimeType: mimeType || 'application/pdf',
            data: base64Data
          }
        });
      }
      if (textData) {
        parts.push({
          text: (base64Data ? 'Texto auxiliar:\n' : '') + textData
        });
      }
      parts.push({ text: prompt });

      const requestBody = {
        contents: [{ role: 'user', parts: parts }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json'
        }
      };

      const models = ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
      let lastError = null;

      for (const model of models) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
          const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
          });

          if (!resp.ok) {
            const errData = await resp.json().catch(() => ({}));
            const errMsg = (errData.error && errData.error.message) ? errData.error.message : `HTTP ${resp.status}`;
            throw new Error(errMsg);
          }

          const resData = await resp.json();
          let rawText = '';
          if (resData.candidates && resData.candidates[0] && resData.candidates[0].content &&
              resData.candidates[0].content.parts && resData.candidates[0].content.parts[0]) {
            rawText = resData.candidates[0].content.parts[0].text || '';
          }

          if (!rawText.trim()) throw new Error('Respuesta vacía del servicio de IA');

          const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
          const parsed = JSON.parse(cleaned);

          return this.normalizeAIData(parsed);
        } catch (e) {
          lastError = e;
          continue;
        }
      }

      throw lastError || new Error('No se pudo completar el análisis con IA.');
    },

    normalizeAIData(d) {
      const p1Pot = (d.potenciasContratadasKW && d.potenciasContratadasKW.p1) || 4.6;
      const p2Pot = (d.potenciasContratadasKW && d.potenciasContratadasKW.p2) || p1Pot;
      const p3Pot = (d.potenciasContratadasKW && d.potenciasContratadasKW.p3) || 0;

      const p1Kwh = (d.consumosKWh && d.consumosKWh.p1) || 0;
      const p2Kwh = (d.consumosKWh && d.consumosKWh.p2) || 0;
      const p3Kwh = (d.consumosKWh && d.consumosKWh.p3) || 0;
      let totalKwh = (d.consumosKWh && d.consumosKWh.total) || (p1Kwh + p2Kwh + p3Kwh);

      const totalEur = parseFloat(d.totalFacturaEUR) || 0;
      if (!totalKwh && totalEur > 0) totalKwh = Math.round((totalEur * 0.70) / 0.18);

      let histArray = null;
      if (Array.isArray(d.historicoMensualKWh) && d.historicoMensualKWh.length >= 6) {
        histArray = d.historicoMensualKWh.map(v => parseFloat(v) || 0);
      }

      let consumoAnualEst = parseFloat(d.consumoAnualEstimadoKWh) || 0;
      if (!consumoAnualEst && histArray && histArray.length === 12) {
        consumoAnualEst = histArray.reduce((acc, curr) => acc + curr, 0);
      }

      return {
        cups: d.cups ? String(d.cups).replace(/\s+/g, '').toUpperCase() : null,
        distribuidora: d.distribuidora || 'Distribuidora',
        comercializadora: d.comercializadora || 'Comercializadora Detectada',
        tarifaAcceso: (d.tarifaAcceso || '2.0TD').toUpperCase(),
        periodoInicio: d.periodoInicio || null,
        periodoFin: d.periodoFin || null,
        diasFactura: parseInt(d.diasFactura) || 30,
        potenciasContratadasKW: {
          p1: parseFloat(p1Pot) || 4.6,
          p2: parseFloat(p2Pot) || 4.6,
          p3: parseFloat(p3Pot) || 0
        },
        costePotenciaEUR: parseFloat(d.costePotenciaEUR) || parseFloat((totalEur * 0.25).toFixed(2)),
        consumosKWh: {
          p1: parseFloat(p1Kwh) || parseFloat((totalKwh * 0.35).toFixed(2)),
          p2: parseFloat(p2Kwh) || parseFloat((totalKwh * 0.30).toFixed(2)),
          p3: parseFloat(p3Kwh) || parseFloat((totalKwh * 0.35).toFixed(2)),
          total: Number.isFinite(parseFloat(totalKwh)) ? parseFloat(totalKwh) : 350
        },
        preciosEnergiaEURKWh: {
          p1: parseFloat((d.preciosEnergiaEURKWh && d.preciosEnergiaEURKWh.p1) || 0.20),
          p2: parseFloat((d.preciosEnergiaEURKWh && d.preciosEnergiaEURKWh.p2) || 0.15),
          p3: parseFloat((d.preciosEnergiaEURKWh && d.preciosEnergiaEURKWh.p3) || 0.10)
        },
        costeEnergiaEUR: parseFloat(d.costeEnergiaEUR) || parseFloat((totalEur * 0.65).toFixed(2)),
        impuestoElectricoEUR: parseFloat(d.impuestoElectricoEUR) || parseFloat((totalEur * 0.05).toFixed(2)),
        alquilerContadorEUR: parseFloat(d.alquilerContadorEUR) || 0.85,
        ivaEUR: parseFloat(d.ivaEUR) || parseFloat((totalEur * 0.21).toFixed(2)),
        totalFacturaEUR: totalEur,
        historicoMensualKWh: histArray,
        consumoAnualEstimadoKWh: consumoAnualEst > 0 ? Math.round(consumoAnualEst) : null,
        diagnosticoIA: d.diagnosticoIA || null,
        fuente: 'ia'
      };
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
        annualYieldKWh = d.annualKWh || (kwp * 1450);
      }
    }
    const batEl = document.getElementById('cfg-pres-bat-opt');
    if (batEl) batCap = parseFloat(batEl.value) || 0;

    const days = bill.diasFactura || 30;
    const factorAnual = 365.0 / Math.max(days, 1);

    // [SSOT Precisión]: Si la IA o factura extrajo consumo anual histórico real, usarlo directamente
    const consumoAnualKWh = (bill.consumoAnualEstimadoKWh && bill.consumoAnualEstimadoKWh > 0)
      ? bill.consumoAnualEstimadoKWh
      : (bill.consumosKWh.total > 0 ? (bill.consumosKWh.total * factorAnual) : 4500);

    const gastoAnualActualEUR = bill.totalFacturaEUR > 0 ? (bill.totalFacturaEUR * factorAnual) : (consumoAnualKWh * 0.22);
    const gastoMensualActualEUR = gastoAnualActualEUR / 12.0;

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
      <div id="ra-bill-auditor-modal" style="display:none;position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(5,10,20,0.85);backdrop-filter:blur(10px);z-index:999999;align-items:center;justify-content:center;font-family:var(--font-sans, system-ui, -apple-system, sans-serif);">
        <div style="width:960px;max-width:96vw;max-height:94vh;background:linear-gradient(135deg, rgba(15,23,42,0.98) 0%, rgba(30,41,59,0.96) 100%);border:1px solid rgba(245,158,11,0.35);box-shadow:0 25px 60px rgba(0,0,0,0.7), 0 0 35px rgba(245,158,11,0.18);border-radius:14px;overflow:hidden;display:flex;flex-direction:column;color:#fff;">
          
          <!-- Header -->
          <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 24px;border-bottom:1px solid rgba(255,255,255,0.08);background:rgba(0,0,0,0.3);">
            <div style="display:flex;align-items:center;gap:12px;">
              <div style="width:38px;height:38px;border-radius:9px;background:linear-gradient(135deg,#f59e0b,#d97706);display:flex;align-items:center;justify-content:center;box-shadow:0 0 14px rgba(245,158,11,0.45);">
                <span style="font-size:20px;">📄</span>
              </div>
              <div>
                <h3 style="margin:0;font-size:15px;font-weight:800;letter-spacing:-0.3px;color:#fff;text-transform:uppercase;">Auditoría de Factura Eléctrica &amp; Comparativa de Ahorro</h3>
                <span style="font-size:10.5px;color:rgba(255,255,255,0.65);font-weight:600;">Doble motor: IA Multimodal (PDF / Fotos) + Motor Local Offline (CSV / Reglas)</span>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:10px;">
              <div id="bill-ai-key-pill" style="display:flex;align-items:center;gap:6px;background:rgba(168,85,247,0.15);border:1px solid rgba(168,85,247,0.35);padding:4px 10px;border-radius:20px;font-size:10px;cursor:pointer;transition:all 0.2s;">
                <span id="bill-ai-key-dot" style="width:7px;height:7px;border-radius:50%;background:#a855f7;"></span>
                <span id="bill-ai-key-text" style="color:#d8b4fe;font-weight:700;">IA Gemini</span>
              </div>
              <button id="btn-close-bill-modal" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:#fff;width:32px;height:32px;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px;transition:all 0.2s;">✕</button>
            </div>
          </div>

          <!-- Body (Grid 2 columnas) -->
          <div style="display:grid;grid-template-columns:1.08fr 1fr;gap:20px;padding:20px 24px;overflow-y:auto;flex:1;">
            
            <!-- Columna Izquierda: Controles y Extracción -->
            <div style="display:flex;flex-direction:column;gap:14px;">
              
              <!-- Selector de Motor (Tabs Segmentados) -->
              <div style="display:flex;flex-direction:column;gap:6px;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <span style="font-size:10px;font-weight:800;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:0.5px;">Motor de Procesamiento:</span>
                  <span id="engine-hint-label" style="font-size:9.5px;color:#a855f7;font-weight:700;">Recomendado para PDFs y fotos</span>
                </div>
                <div style="display:grid;grid-template-columns:1.2fr 1.3fr 1.1fr;gap:6px;background:rgba(0,0,0,0.35);padding:4px;border-radius:8px;border:1px solid rgba(255,255,255,0.08);">
                  <button id="engine-tab-auto" type="button" style="background:rgba(245,158,11,0.25);border:1px solid #f59e0b;color:#fbbf24;font-size:10px;font-weight:800;padding:6px;border-radius:6px;cursor:pointer;transition:all 0.2s;">
                    🔄 Auto (Inteligente)
                  </button>
                  <button id="engine-tab-ai" type="button" style="background:transparent;border:1px solid transparent;color:rgba(255,255,255,0.6);font-size:10px;font-weight:700;padding:6px;border-radius:6px;cursor:pointer;transition:all 0.2s;">
                    🧠 Motor IA (Gemini)
                  </button>
                  <button id="engine-tab-local" type="button" style="background:transparent;border:1px solid transparent;color:rgba(255,255,255,0.6);font-size:10px;font-weight:700;padding:6px;border-radius:6px;cursor:pointer;transition:all 0.2s;">
                    ⚡ Local (CSV/Reglas)
                  </button>
                </div>
              </div>

              <!-- Mini Diálogo de Configuración de API Key (Oculto por defecto) -->
              <div id="bill-api-key-box" style="display:none;background:rgba(168,85,247,0.12);border:1px solid rgba(168,85,247,0.35);border-radius:8px;padding:10px;flex-direction:column;gap:6px;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <span style="font-size:10px;font-weight:800;color:#d8b4fe;">🔑 Configuración de Google Gemini API Key</span>
                  <button id="btn-close-key-box" type="button" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:11px;">✕</button>
                </div>
                <div style="font-size:9.5px;color:rgba(255,255,255,0.75);">
                  Introduce tu clave para habilitar la extracción multimodal (PDFs y fotos):
                </div>
                <div style="display:flex;gap:6px;">
                  <input type="password" id="bill-gemini-key-input" placeholder="AIzaSy..." style="flex:1;background:rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.15);color:#fff;font-size:10px;padding:5px 8px;border-radius:4px;">
                  <button id="btn-save-bill-gemini-key" type="button" style="background:#a855f7;border:none;color:#fff;font-size:10px;font-weight:800;padding:5px 12px;border-radius:4px;cursor:pointer;">Guardar</button>
                </div>
              </div>

              <!-- Dropzone Dual -->
              <div id="bill-dropzone" style="border:2px dashed rgba(245,158,11,0.45);background:rgba(245,158,11,0.04);border-radius:10px;padding:18px;text-align:center;cursor:pointer;transition:all 0.2s;display:flex;flex-direction:column;align-items:center;gap:6px;position:relative;">
                <input type="file" id="bill-file-input" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.json" style="display:none;">
                
                <div id="dropzone-idle-content" style="display:flex;flex-direction:column;align-items:center;gap:6px;">
                  <span style="font-size:28px;">📄⚡</span>
                  <span style="font-size:12px;font-weight:800;color:#f59e0b;">Arrastra tu factura aquí o haz clic para subir</span>
                  <span style="font-size:9.5px;color:rgba(255,255,255,0.7);">Soporta: <b>PDF oficial</b> · <b>Fotos del móvil (JPG/PNG)</b> · <b>CSV Datadis</b> · <b>TXT</b></span>
                </div>

                <div id="dropzone-loading-content" style="display:none;flex-direction:column;align-items:center;gap:10px;padding:6px 0;">
                  <div style="width:26px;height:26px;border:3px solid rgba(168,85,247,0.3);border-top-color:#c084fc;border-radius:50%;animation:billSpin 0.8s linear infinite;"></div>
                  <span id="dropzone-loading-msg" style="font-size:11.5px;font-weight:800;color:#d8b4fe;">Analizando factura con IA de Google Gemini...</span>
                  <span style="font-size:9.5px;color:rgba(255,255,255,0.65);">Extrayendo CUPS, potencias contratadas, consumos horarios y términos económicos...</span>
                </div>
              </div>

              <!-- Pegar texto directo opcional -->
              <div style="display:flex;flex-direction:column;gap:6px;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <span style="font-size:10px;font-weight:700;color:rgba(255,255,255,0.7);text-transform:uppercase;">O pega el texto copiado de la factura:</span>
                  <div style="display:flex;gap:6px;">
                    <button id="btn-parse-pasted-local" type="button" style="font-size:9px;background:rgba(245,158,11,0.18);border:1px solid #f59e0b;color:#fbbf24;padding:2px 8px;border-radius:4px;cursor:pointer;font-weight:700;">⚡ Analizar Local</button>
                    <button id="btn-parse-pasted-ai" type="button" style="font-size:9px;background:rgba(168,85,247,0.22);border:1px solid #a855f7;color:#d8b4fe;padding:2px 8px;border-radius:4px;cursor:pointer;font-weight:800;">🧠 Analizar con IA</button>
                  </div>
                </div>
                <textarea id="bill-raw-textarea" rows="2" placeholder="Pega aquí el texto copiado de tu factura (Endesa, Iberdrola, Naturgy, etc.)..." style="width:100%;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:#fff;font-size:9.5px;font-family:monospace;padding:8px;resize:none;box-sizing:border-box;"></textarea>
              </div>

              <!-- Formulario de Campos Auditados / Editables -->
              <div style="background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:8px;">
                <div style="font-size:10px;font-weight:800;color:#f59e0b;text-transform:uppercase;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:6px;display:flex;justify-content:space-between;align-items:center;">
                  <span>Datos Extraídos de la Factura</span>
                  <div style="display:flex;align-items:center;gap:6px;">
                    <span id="bill-detected-source-badge" style="display:none;background:rgba(16,185,129,0.2);border:1px solid #10b981;color:#34d399;font-size:9px;font-weight:800;padding:1px 6px;border-radius:4px;">🧠 IA</span>
                    <span id="bill-detected-company" style="color:#38bdf8;font-weight:700;">Sin factura</span>
                  </div>
                </div>

                <!-- Tarjeta de Diagnóstico Inteligente IA -->
                <div id="bill-ai-diag-card" style="display:none;background:linear-gradient(135deg, rgba(168,85,247,0.15), rgba(99,102,241,0.1));border:1px solid rgba(168,85,247,0.35);border-radius:6px;padding:8px 10px;gap:6px;align-items:flex-start;">
                  <span style="font-size:14px;">💡</span>
                  <div style="display:flex;flex-direction:column;gap:2px;">
                    <span style="font-size:9.5px;font-weight:800;color:#d8b4fe;text-transform:uppercase;">Diagnóstico Inteligente:</span>
                    <span id="bill-ai-diag-text" style="font-size:9.5px;color:rgba(255,255,255,0.9);line-height:1.35;">-</span>
                  </div>
                </div>

                <!-- Tarjeta de Histórico Anual Proyectado -->
                <div id="bill-ai-history-card" style="display:none;background:linear-gradient(135deg, rgba(14,165,233,0.15), rgba(16,185,129,0.1));border:1px solid rgba(14,165,233,0.35);border-radius:6px;padding:6px 10px;justify-content:space-between;align-items:center;">
                  <div style="display:flex;align-items:center;gap:6px;">
                    <span style="font-size:12px;">📊</span>
                    <span style="font-size:9.5px;font-weight:700;color:#7dd3fc;">Histórico Anual Detectado en Factura:</span>
                  </div>
                  <span id="bill-ai-history-kwh" style="font-size:11px;font-weight:900;color:#38bdf8;">0 kWh/año</span>
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
                    <label style="font-size:9px;color:rgba(255,255,255,0.6);display:block;margin-bottom:2px;">Días Facturados:</label>
                    <input type="number" id="bill-edit-days" value="30" step="1" style="width:100%;background:rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.15);color:#fff;font-size:10px;padding:4px 6px;border-radius:4px;box-sizing:border-box;">
                  </div>
                  <div>
                    <label style="font-size:9px;color:rgba(255,255,255,0.6);display:block;margin-bottom:2px;">Potencia P1 / P2 (kW):</label>
                    <input type="text" id="bill-edit-pot" value="4.6 kW" style="width:100%;background:rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.15);color:#fff;font-size:10px;padding:4px 6px;border-radius:4px;box-sizing:border-box;">
                  </div>
                </div>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                  <div>
                    <label style="font-size:9px;color:rgba(255,255,255,0.6);display:block;margin-bottom:2px;">Precio Energía P1 (€/kWh):</label>
                    <input type="number" id="bill-edit-price-p1" value="0.20" step="0.01" style="width:100%;background:rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.15);color:#fff;font-size:10px;padding:4px 6px;border-radius:4px;box-sizing:border-box;">
                  </div>
                  <div>
                    <label style="font-size:9px;color:rgba(255,255,255,0.6);display:block;margin-bottom:2px;">Precio Energía Valle P3 (€/kWh):</label>
                    <input type="number" id="bill-edit-price-p3" value="0.11" step="0.01" style="width:100%;background:rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.15);color:#fff;font-size:10px;padding:4px 6px;border-radius:4px;box-sizing:border-box;">
                  </div>
                </div>

                <button id="btn-recalculate-bill" style="background:rgba(245,158,11,0.2);border:1px solid #f59e0b;color:#fbbf24;font-size:10px;font-weight:800;padding:6px;border-radius:5px;cursor:pointer;margin-top:2px;">
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
      <style>
        @keyframes billSpin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      </style>
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

    // Badge comercializadora y tarifa
    const companyEl = document.getElementById('bill-detected-company');
    if (companyEl) companyEl.textContent = bill.comercializadora + (bill.tarifaAcceso ? ' (' + bill.tarifaAcceso + ')' : '');

    // Badge origen (IA / Local / Manual)
    const sourceBadge = document.getElementById('bill-detected-source-badge');
    if (sourceBadge) {
      sourceBadge.style.display = 'inline-block';
      if (bill.fuente === 'ia') {
        sourceBadge.textContent = '🧠 IA Gemini 2.0';
        sourceBadge.style.background = 'rgba(168,85,247,0.2)';
        sourceBadge.style.borderColor = '#a855f7';
        sourceBadge.style.color = '#d8b4fe';
      } else if (bill.fuente === 'local') {
        sourceBadge.textContent = '⚡ Motor Local';
        sourceBadge.style.background = 'rgba(245,158,11,0.2)';
        sourceBadge.style.borderColor = '#f59e0b';
        sourceBadge.style.color = '#fbbf24';
      } else {
        sourceBadge.textContent = '✏️ Manual';
        sourceBadge.style.background = 'rgba(148,163,184,0.2)';
        sourceBadge.style.borderColor = '#94a3b8';
        sourceBadge.style.color = '#cbd5e1';
      }
    }

    // Tarjeta Diagnóstico IA
    const diagCard = document.getElementById('bill-ai-diag-card');
    const diagText = document.getElementById('bill-ai-diag-text');
    if (diagCard && diagText) {
      if (bill.diagnosticoIA) {
        diagText.textContent = bill.diagnosticoIA;
        diagCard.style.display = 'flex';
      } else {
        diagCard.style.display = 'none';
      }
    }

    // Tarjeta Histórico 12 Meses
    const histCard = document.getElementById('bill-ai-history-card');
    const histText = document.getElementById('bill-ai-history-kwh');
    if (histCard && histText) {
      if (bill.consumoAnualEstimadoKWh && bill.consumoAnualEstimadoKWh > 0) {
        histText.textContent = bill.consumoAnualEstimadoKWh.toLocaleString('es-ES') + ' kWh/año';
        histCard.style.display = 'flex';
      } else {
        histCard.style.display = 'none';
      }
    }

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

    const priceP1El = document.getElementById('bill-edit-price-p1');
    if (priceP1El && bill.preciosEnergiaEURKWh && bill.preciosEnergiaEURKWh.p1) {
      priceP1El.value = bill.preciosEnergiaEURKWh.p1.toFixed(3);
    }

    const priceP3El = document.getElementById('bill-edit-price-p3');
    if (priceP3El && bill.preciosEnergiaEURKWh && bill.preciosEnergiaEURKWh.p3) {
      priceP3El.value = bill.preciosEnergiaEURKWh.p3.toFixed(3);
    }

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
   * 6. ACTUALIZAR ESTADO DE LA API KEY EN LA UI
   */
  function refreshApiKeyIndicator() {
    const key = AIBillParser.getApiKey();
    const pill = document.getElementById('bill-ai-key-pill');
    const dot = document.getElementById('bill-ai-key-dot');
    const txt = document.getElementById('bill-ai-key-text');
    if (!pill || !dot || !txt) return;

    if (key) {
      dot.style.background = '#10b981';
      dot.style.boxShadow = '0 0 8px #10b981';
      txt.textContent = 'IA Gemini Conectada';
      txt.style.color = '#6ee7b7';
      pill.style.background = 'rgba(16,185,129,0.12)';
      pill.style.borderColor = 'rgba(16,185,129,0.35)';
      pill.title = 'Haz clic para cambiar tu API Key de Gemini';
    } else {
      dot.style.background = '#f59e0b';
      dot.style.boxShadow = 'none';
      txt.textContent = 'Conectar IA Gemini';
      txt.style.color = '#fde68a';
      pill.style.background = 'rgba(245,158,11,0.12)';
      pill.style.borderColor = 'rgba(245,158,11,0.35)';
      pill.title = 'Haz clic para introducir tu API Key de Gemini';
    }
  }

  /**
   * 7. ESTADO DE CARGA DEL DROPZONE
   */
  function setDropzoneLoading(loading, message) {
    BILL_AUDITOR_STATE.isAnalyzing = loading;
    const idleEl = document.getElementById('dropzone-idle-content');
    const loadEl = document.getElementById('dropzone-loading-content');
    const msgEl = document.getElementById('dropzone-loading-msg');
    const dropzone = document.getElementById('bill-dropzone');

    if (idleEl) idleEl.style.display = loading ? 'none' : 'flex';
    if (loadEl) loadEl.style.display = loading ? 'flex' : 'none';
    if (msgEl && message) msgEl.textContent = message;

    if (dropzone) {
      if (loading) {
        dropzone.style.borderColor = '#c084fc';
        dropzone.style.background = 'rgba(168,85,247,0.1)';
        dropzone.style.cursor = 'wait';
      } else {
        dropzone.style.borderColor = 'rgba(245,158,11,0.45)';
        dropzone.style.background = 'rgba(245,158,11,0.04)';
        dropzone.style.cursor = 'pointer';
      }
    }
  }

  /**
   * 8. CONVERTIDOR DE ARCHIVO A BASE64
   */
  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result || '';
        const commaIdx = result.indexOf(',');
        if (commaIdx !== -1) {
          resolve(result.slice(commaIdx + 1));
        } else {
          resolve(result);
        }
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  }

  /**
   * 9. EVENTOS DEL MODAL
   */
  function setupModalEvents(modal) {
    const closeBtn = document.getElementById('btn-close-bill-modal');
    const cancelBtn = document.getElementById('btn-cancel-bill-modal');
    const dropzone = document.getElementById('bill-dropzone');
    const fileInput = document.getElementById('bill-file-input');
    const parseLocalBtn = document.getElementById('btn-parse-pasted-local');
    const parseAIBtn = document.getElementById('btn-parse-pasted-ai');
    const recalculateBtn = document.getElementById('btn-recalculate-bill');
    const applyBtn = document.getElementById('btn-apply-bill-data');

    const keyPill = document.getElementById('bill-ai-key-pill');
    const keyBox = document.getElementById('bill-api-key-box');
    const closeKeyBoxBtn = document.getElementById('btn-close-key-box');
    const saveKeyBtn = document.getElementById('btn-save-bill-gemini-key');
    const keyInput = document.getElementById('bill-gemini-key-input');

    const tabAuto = document.getElementById('engine-tab-auto');
    const tabAI = document.getElementById('engine-tab-ai');
    const tabLocal = document.getElementById('engine-tab-local');
    const engineHint = document.getElementById('engine-hint-label');

    const closeModal = () => {
      modal.style.display = 'none';
      BILL_AUDITOR_STATE.modalOpen = false;
    };

    if (closeBtn) closeBtn.onclick = closeModal;
    if (cancelBtn) cancelBtn.onclick = closeModal;

    // Selector de motor
    const setEngine = (engine) => {
      BILL_AUDITOR_STATE.activeEngine = engine;
      const tabs = [
        { btn: tabAuto, id: 'auto', text: '🔄 Auto: Enruta fotos/PDFs a IA y CSV a Local' },
        { btn: tabAI, id: 'ai', text: '🧠 IA Forzada: Todo documento o texto pasa por Gemini' },
        { btn: tabLocal, id: 'local', text: '⚡ Local: 100% offline (CSV Datadis / Reglas)' }
      ];
      tabs.forEach(t => {
        if (!t.btn) return;
        if (t.id === engine) {
          t.btn.style.background = 'rgba(245,158,11,0.25)';
          t.btn.style.borderColor = '#f59e0b';
          t.btn.style.color = '#fbbf24';
          t.btn.style.fontWeight = '800';
          if (engineHint) engineHint.textContent = t.text;
        } else {
          t.btn.style.background = 'transparent';
          t.btn.style.borderColor = 'transparent';
          t.btn.style.color = 'rgba(255,255,255,0.6)';
          t.btn.style.fontWeight = '700';
        }
      });
    };

    if (tabAuto) tabAuto.onclick = () => setEngine('auto');
    if (tabAI) tabAI.onclick = () => setEngine('ai');
    if (tabLocal) tabLocal.onclick = () => setEngine('local');

    // Configuración interactiva de la clave API
    if (keyPill && keyBox) {
      keyPill.onclick = () => {
        const isVisible = keyBox.style.display === 'flex';
        keyBox.style.display = isVisible ? 'none' : 'flex';
        if (!isVisible && keyInput) {
          keyInput.value = AIBillParser.getApiKey();
          keyInput.focus();
        }
      };
    }
    if (closeKeyBoxBtn && keyBox) {
      closeKeyBoxBtn.onclick = () => { keyBox.style.display = 'none'; };
    }
    if (saveKeyBtn && keyInput) {
      saveKeyBtn.onclick = () => {
        const val = keyInput.value.trim();
        AIBillParser.setApiKey(val);
        refreshApiKeyIndicator();
        if (keyBox) keyBox.style.display = 'none';
        if (typeof showToast === 'function') {
          showToast('CLAVE GUARDADA', val ? 'API Key de Gemini sincronizada.' : 'Clave de Gemini eliminada.', 'success', 2500);
        }
        if (BILL_AUDITOR_STATE.pendingFile) {
          const pending = BILL_AUDITOR_STATE.pendingFile;
          BILL_AUDITOR_STATE.pendingFile = null;
          handleUploadedFile(pending);
        }
      };
    }

    // Dropzone
    if (dropzone && fileInput) {
      dropzone.onclick = () => {
        if (!BILL_AUDITOR_STATE.isAnalyzing) fileInput.click();
      };

      dropzone.ondragover = (e) => {
        e.preventDefault();
        if (!BILL_AUDITOR_STATE.isAnalyzing) {
          dropzone.style.background = 'rgba(245,158,11,0.12)';
          dropzone.style.borderColor = '#fbbf24';
        }
      };
      dropzone.ondragleave = () => {
        if (!BILL_AUDITOR_STATE.isAnalyzing) {
          dropzone.style.background = 'rgba(245,158,11,0.04)';
          dropzone.style.borderColor = 'rgba(245,158,11,0.45)';
        }
      };
      dropzone.ondrop = (e) => {
        e.preventDefault();
        if (BILL_AUDITOR_STATE.isAnalyzing) return;
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

    // Botones de análisis de texto pegado
    if (parseLocalBtn) {
      parseLocalBtn.onclick = () => {
        const area = document.getElementById('bill-raw-textarea');
        if (area && area.value.trim().length > 0) {
          processRawContent(area.value, 'pasted-bill.txt', false, false);
        }
      };
    }

    if (parseAIBtn) {
      parseAIBtn.onclick = async () => {
        const area = document.getElementById('bill-raw-textarea');
        const text = area ? area.value.trim() : '';
        if (!text) {
          alert('Pega primero el texto de la factura en el cuadro de texto.');
          return;
        }
        const apiKey = AIBillParser.getApiKey();
        if (!apiKey) {
          if (keyBox) {
            keyBox.style.display = 'flex';
            if (keyInput) keyInput.focus();
          }
          alert('Para analizar con IA necesitas configurar tu Google Gemini API Key.');
          return;
        }

        setDropzoneLoading(true, 'Analizando texto con IA de Google Gemini...');
        try {
          const bill = await AIBillParser.analyzeDocument({ textData: text, fileName: 'texto-factura.txt' });
          BILL_AUDITOR_STATE.currentBill = bill;
          BILL_AUDITOR_STATE.comparison = computeComparison(bill);
          updateModalUI(bill, BILL_AUDITOR_STATE.comparison);
          if (typeof showToast === 'function') {
            showToast('Texto analizado con IA: ' + bill.comercializadora + ' · ' + bill.totalFacturaEUR + ' €', 'success', 3500);
          }
        } catch (err) {
          alert('Error en análisis IA: ' + (err.message || err));
        } finally {
          setDropzoneLoading(false);
        }
      };
    }

    // Recalcular manualmente
    if (recalculateBtn) {
      recalculateBtn.onclick = () => {
        const total = parseFloat(document.getElementById('bill-edit-total').value) || 0;
        const kwh = parseFloat(document.getElementById('bill-edit-kwh').value) || 0;
        const days = parseInt(document.getElementById('bill-edit-days').value) || 30;
        const cups = document.getElementById('bill-edit-cups').value || '';
        const tarifa = document.getElementById('bill-edit-tarifa').value || '2.0TD';
        const priceP1 = parseFloat(document.getElementById('bill-edit-price-p1').value) || 0.20;
        const priceP3 = parseFloat(document.getElementById('bill-edit-price-p3').value) || 0.11;

        // Conservar diagnóstico y consumo anual previo si existían
        const prev = BILL_AUDITOR_STATE.currentBill || {};

        BILL_AUDITOR_STATE.currentBill = {
          cups: cups,
          distribuidora: prev.distribuidora || 'Ajuste Manual',
          comercializadora: prev.comercializadora || 'Personalizado',
          tarifaAcceso: tarifa,
          diasFactura: days,
          potenciasContratadasKW: { p1: 4.6, p2: 4.6, p3: 0 },
          costePotenciaEUR: parseFloat((total * 0.25).toFixed(2)),
          consumosKWh: { total: kwh, p1: kwh * 0.35, p2: kwh * 0.30, p3: kwh * 0.35 },
          preciosEnergiaEURKWh: { p1: priceP1, p2: (priceP1 + priceP3) / 2, p3: priceP3 },
          costeEnergiaEUR: parseFloat((total * 0.65).toFixed(2)),
          totalFacturaEUR: total,
          historicoMensualKWh: prev.historicoMensualKWh || null,
          consumoAnualEstimadoKWh: prev.consumoAnualEstimadoKWh || null,
          diagnosticoIA: prev.diagnosticoIA || null,
          fuente: 'manual'
        };

        BILL_AUDITOR_STATE.comparison = computeComparison(BILL_AUDITOR_STATE.currentBill);
        updateModalUI(BILL_AUDITOR_STATE.currentBill, BILL_AUDITOR_STATE.comparison);
      };
    }

    // Aplicar al presupuesto
    if (applyBtn) {
      applyBtn.onclick = () => {
        applyBillToBudget();
        closeModal();
      };
    }
  }

  /**
   * 10. ENRUTADOR Y PROCESADOR DE ARCHIVOS SUBIDOS
   */
  async function handleUploadedFile(file) {
    if (!file) return;

    const fileName = file.name || '';
    const lowerName = fileName.toLowerCase();
    const isJSON = lowerName.endsWith('.json');
    const isCSV = lowerName.endsWith('.csv');
    const isPDF = lowerName.endsWith('.pdf') || (file.type === 'application/pdf');
    const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|webp|bmp)$/i.test(lowerName);

    const mode = BILL_AUDITOR_STATE.activeEngine; // 'auto' | 'ai' | 'local'

    // Caso A: Tabulares estructurados (CSV / JSON) → siempre motor local instantáneo
    if (isCSV || isJSON) {
      const reader = new FileReader();
      reader.onload = (e) => {
        processRawContent(e.target.result, fileName, isJSON, isCSV);
      };
      reader.readAsText(file);
      return;
    }

    // Caso B: Documentos visuales / multimodales (PDF o Fotos)
    if (isPDF || isImage) {
      if (mode === 'local') {
        alert('Los documentos en formato PDF o fotos requieren el Motor IA. Cambia al modo "🔄 Auto" o "🧠 Motor IA" para procesarlos.');
        return;
      }

      const apiKey = AIBillParser.getApiKey();
      if (!apiKey) {
        BILL_AUDITOR_STATE.pendingFile = file;
        const keyBox = document.getElementById('bill-api-key-box');
        if (keyBox) {
          keyBox.style.display = 'flex';
          const keyIn = document.getElementById('bill-gemini-key-input');
          if (keyIn) keyIn.focus();
        }
        alert('Para procesar facturas en PDF o fotos con IA es necesario conectar tu API Key de Google Gemini. Introdúcela en la ventana emergente.');
        return;
      }

      setDropzoneLoading(true, isPDF ? 'Analizando PDF de factura con IA de Google Gemini...' : 'Procesando foto de factura con visión artificial...');
      try {
        const base64Data = await readFileAsBase64(file);
        const mimeType = file.type || (isPDF ? 'application/pdf' : 'image/jpeg');
        const bill = await AIBillParser.analyzeDocument({
          base64Data,
          mimeType,
          fileName
        });

        BILL_AUDITOR_STATE.currentBill = bill;
        BILL_AUDITOR_STATE.comparison = computeComparison(bill);
        updateModalUI(bill, BILL_AUDITOR_STATE.comparison);

        if (typeof showToast === 'function') {
          showToast('Factura analizada con IA: ' + bill.comercializadora + ' · ' + bill.totalFacturaEUR + ' € · ' + bill.consumosKWh.total + ' kWh', 'success', 4000);
        }
      } catch (err) {
        console.error('Error en análisis IA de factura:', err);
        alert('No se pudo analizar el archivo con IA: ' + (err.message || err) + '\n\nPuedes ingresar los datos manualmente o usar el motor local.');
      } finally {
        setDropzoneLoading(false);
      }
      return;
    }

    // Caso C: Archivos de texto (.txt u otros)
    const reader = new FileReader();
    reader.onload = async (e) => {
      const content = e.target.result;
      if (mode === 'ai' && AIBillParser.getApiKey()) {
        setDropzoneLoading(true, 'Analizando texto con IA de Google Gemini...');
        try {
          const bill = await AIBillParser.analyzeDocument({ textData: content, fileName });
          BILL_AUDITOR_STATE.currentBill = bill;
          BILL_AUDITOR_STATE.comparison = computeComparison(bill);
          updateModalUI(bill, BILL_AUDITOR_STATE.comparison);
          if (typeof showToast === 'function') {
            showToast('Factura analizada con IA: ' + bill.comercializadora + ' · ' + bill.totalFacturaEUR + ' €', 'success', 4000);
          }
        } catch (err) {
          processRawContent(content, fileName, false, false);
        } finally {
          setDropzoneLoading(false);
        }
      } else {
        processRawContent(content, fileName, false, false);
      }
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
      showToast('Factura procesada (Local): ' + bill.totalFacturaEUR + ' € · ' + bill.consumosKWh.total + ' kWh', 'success', 3500);
    }
  }

  /**
   * 11. APLICAR DATOS DE FACTURA AL PRESUPUESTO & ESTUDIO DE LA APLICACIÓN
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

    if (typeof wpSelectCommercialPath === 'function') {
      wpSelectCommercialPath('just_saving');
    } else if (typeof wpUpdateCommercialPathsUI === 'function') {
      wpUpdateCommercialPathsUI();
    }

    if (typeof updateBudgetUI === 'function') {
      updateBudgetUI();
    }

    if (typeof showToast === 'function') {
      const detailStr = (bill.consumoAnualEstimadoKWh ? ' [Histórico 12m]' : '');
      showToast('¡Datos de factura aplicados al presupuesto! Meta: ' + targetKwp + ' kWp (' + Math.round(comp.consumoAnualKWh) + ' kWh/año)' + detailStr, 'success', 4500);
    }
  }

  /**
   * 12. APERTURA Y CONTROL EXTERNO DEL MODAL
   */
  function openBillAuditorModal() {
    const modal = ensureModalDOM();
    modal.style.display = 'flex';
    BILL_AUDITOR_STATE.modalOpen = true;

    refreshApiKeyIndicator();

    if (!BILL_AUDITOR_STATE.currentBill) {
      const curFactura = parseFloat((document.getElementById('cfg-pres-factura-mes') || {}).value) || 125;
      const curConsumo = parseFloat((document.getElementById('cfg-pres-consumo-anual') || {}).value) || 5450;
      BILL_AUDITOR_STATE.currentBill = {
        cups: 'ES0021000000000000XX',
        distribuidora: 'Distribuidora',
        comercializadora: 'Mercado Libre / Regulado',
        tarifaAcceso: '2.0TD',
        diasFactura: 30,
        potenciasContratadasKW: { p1: 4.6, p2: 4.6, p3: 0 },
        costePotenciaEUR: 28.50,
        consumosKWh: { total: Math.round(curConsumo / 12), p1: 150, p2: 120, p3: 180 },
        preciosEnergiaEURKWh: { p1: 0.22, p2: 0.17, p3: 0.11 },
        costeEnergiaEUR: curFactura * 0.65,
        totalFacturaEUR: curFactura,
        historicoMensualKWh: null,
        consumoAnualEstimadoKWh: null,
        diagnosticoIA: null,
        fuente: 'manual'
      };
    }
    BILL_AUDITOR_STATE.comparison = computeComparison(BILL_AUDITOR_STATE.currentBill);
    updateModalUI(BILL_AUDITOR_STATE.currentBill, BILL_AUDITOR_STATE.comparison);
  }

  // API pública canónica
  window.RA.billAuditor = {
    openModal: openBillAuditorModal,
    parseText: (txt) => BillParser.parseText(txt),
    parseCSV: (csv) => BillParser.parseCSV(csv),
    parseJSON: (j) => BillParser.parseJSON(j),
    analyzeWithAI: (params) => AIBillParser.analyzeDocument(params),
    computeComparison: computeComparison,
    getState: () => BILL_AUDITOR_STATE,
    applyToBudget: applyBillToBudget,
    setEngine: (eng) => { BILL_AUDITOR_STATE.activeEngine = eng; },
    get currentBill() { return BILL_AUDITOR_STATE.currentBill; },
    get comparison() { return BILL_AUDITOR_STATE.comparison; }
  };

  window.openBillAuditorModal = openBillAuditorModal;
  window.RABillAuditor = window.RA.billAuditor;

})();
