/**
 * ===============================================================================
 * RA - VISOR SOLAR 3D | SUBSISTEMA MODULAR: IMPORTADOR DE DATASHEETS CON IA
 * ===============================================================================
 * Archivo: js/equipment-ai-importer.js
 * Rol: Extracción, clasificación y validación física de fichas técnicas
 *      fotovoltaicas (PDF/imágenes) mediante IA Multimodal Gemini.
 * Arquitectura: Totalmente desacoplada, modular y reactiva.
 * ===============================================================================
 */

(function (root) {
  'use strict';

  // [D1+D2] Cliente IA unificado (cabecera x-goog-api-key, timeout y cancelación).
  // Delega en RA.geminiFetch cuando está disponible; si no, usa fetch nativo con cabecera.
  function _aiFetch(url, opts, timeoutMs, apiKey) {
    if (root.RA && typeof root.RA.geminiFetch === 'function') {
      return root.RA.geminiFetch(url, opts, timeoutMs, apiKey);
    }
    const cleanOpts = Object.assign({}, opts || {});
    cleanOpts.headers = Object.assign({}, cleanOpts.headers || {});
    if (apiKey) cleanOpts.headers['x-goog-api-key'] = apiKey;
    return fetch(url, cleanOpts);
  }

  const RAEquipmentAIImporter = {
    state: {
      isProcessing: false,
      lastExtracted: null,
      activeCategoryHint: 'auto'
    },

    /**
     * Obtiene la clave de API de Gemini configurada
     */
    getApiKey: function () {
      try {
        if (root.RA && typeof root.RA.getGeminiApiKey === 'function') {
          const unified = root.RA.getGeminiApiKey();
          if (unified && unified.trim()) return unified.trim();
        }
        if (root.RA && root.RA.geminiApiKey) return root.RA.geminiApiKey;
        const local = localStorage.getItem('ra_gemini_api_key') || '';
        if (local.startsWith('enc:')) {
          try { return decodeURIComponent(escape(atob(local.slice(4)))).trim(); } catch (e) { return local.slice(4).trim(); }
        }
        if (local && local.trim()) return local.trim();
      } catch (e) {}
      return '';
    },

    /**
     * Lee un objeto File de HTML5 como cadena Base64
     */
    readFileAsBase64: function (file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const res = reader.result;
          const base64Index = res.indexOf(';base64,');
          if (base64Index !== -1) {
            resolve(res.substring(base64Index + 8));
          } else {
            resolve(res);
          }
        };
        reader.onerror = (err) => reject(err);
        reader.readAsDataURL(file);
      });
    },

    /**
     * Genera el prompt de ingeniería electrotécnica con esquema JSON estricto
     */
    getExtractionPrompt: function (categoryHint) {
      return `Eres un ingeniero electrotécnico experto y auditor de homologación de componentes solares fotovoltaicos.
Analiza minuciosamente este documento técnico (ficha técnica / datasheet comercial / placa de características).

OBJETIVO:
1. Identifica el tipo de equipo:
   - "modules" (Panel solar / Módulo fotovoltaico)
   - "inverters" (Inversor de conexión a red, híbrido o central)
   - "batteries" (Batería de litio LFP / acumulador estacionario)
   - "microinverters" (Microinversor o Optimizador de potencia MLPE)
   - "wind_turbines" (Aerogenerador minieólica de eje horizontal HAWT o vertical VAWT)

2. Si el documento contiene varias potencias o modelos de una misma serie (ejemplo: 430W, 440W, 450W), SELECCIONA EL MODELO DE MAYOR POTENCIA o el más representativo de la ficha.

3. Extrae todos los parámetros físicos y eléctricos con máxima precisión técnica.

DEBES DEVOLVER EXCLUSIVAMENTE UN OBJETO JSON VÁLIDO CON LA SIGUIENTE ESTRUCTURA:

{
  "category": "modules" | "inverters" | "batteries" | "microinverters" | "wind_turbines",
  "brand": "Nombre del fabricante (ej. JA Solar, Longi, Huawei, Fronius, BYD, Enphase...)",
  "model": "Denominación comercial exacta del modelo (ej. JAM54D40-440/MB)",
  "specs": {
    /* SI ES "modules": */
    "wp": 440,                  // Potencia pico nominal STC en Wp (número entero)
    "eff": 22.0,                // Eficiencia del módulo en % (número flotante, ej. 22.0)
    "l": 1.762,                 // Longitud en METROS (ej. 1762 mm -> 1.762)
    "w": 1.134,                 // Anchura en METROS (ej. 1134 mm -> 1.134)
    "th": 0.030,                // Grosor del marco en METROS (ej. 30 mm -> 0.030)
    "voc": 39.10,               // Tensión circuito abierto Voc en V
    "isc": 14.15,               // Corriente cortocircuito Isc en A
    "vmp": 32.80,               // Tensión máxima potencia Vmp en V
    "imp": 13.41,               // Corriente máxima potencia Imp en A
    "tempCoeffPmax": -0.30,     // Coeficiente temperatura Pmax en %/°C
    "tempCoeffVoc": -0.25,      // Coeficiente temperatura Voc en %/°C
    "cellType": "TOPCon N-Type",// Tecnología (TOPCon, HJT, PERC, Monocristalino)
    "bifacial": true,           // Si es módulo bifacial (true/false)
    "bifacialityFactor": 0.80,  // Factor de bifacialidad (0.70 a 0.85) si aplica

    /* SI ES "inverters": */
    "kw": 5.0,                  // Potencia nominal AC en kW (ej. 5.0 para 5000W)
    "type": "Híbrido",          // "Híbrido", "Monofásico" o "Trifásico"
    "mppt": 2,                  // Número de seguidores MPPT independientes
    "inputsPerMppt": 1,         // Entradas de string por MPPT (1 o 2)
    "vMpptMin": 90,             // Tensión mínima de rango MPPT en V
    "vMpptMax": 560,            // Tensión máxima de rango MPPT en V
    "vDcMax": 600,              // Tensión máxima absoluta DC en V (ej. 600, 1000, 1100)
    "vStart": 100,              // Tensión de arranque en V
    "iMaxOperA": 16.0,          // Corriente máxima operativa de entrada por MPPT en A
    "iMaxScA": 22.5,            // Corriente máxima de cortocircuito por MPPT en A
    "effMax": 98.4,             // Eficiencia máxima en %

    /* SI ES "batteries": */
    "kwh": 10.0,                // Capacidad útil neta en kWh
    "kwhNominal": 10.24,        // Capacidad bruta nominal en kWh
    "type": "LFP Alto Voltaje", // "LFP Alto Voltaje", "LFP Bajo Voltaje" o "Modular"
    "vNom": 400,                // Tensión nominal en V
    "kwMax": 5.0,               // Potencia máx de carga/descarga en kW
    "dod": 95,                  // Profundidad de descarga DoD en %
    "cycles": 6000,             // Ciclos de vida garantizados

    /* SI ES "wind_turbines": */
    "ratedPowerW": 25000,       // Potencia nominal en W (ej. 25000 para 25 kW)
    "type": "HAWT",             // "HAWT" (eje horizontal) o "VAWT" (eje vertical)
    "rotorDiameterM": 6.4,      // Diámetro del rotor en metros
    "bladeCount": 3,            // Número de aspas/palas (3, 2, etc.)
    "hubHeightsAvailableM": [12, 18, 24], // Alturas de mástil disponibles en metros
    "cutInSpeedMs": 2.5,        // Velocidad de arranque cut-in en m/s
    "ratedSpeedMs": 11.0,       // Velocidad nominal en m/s
    "cutOutSpeedMs": 25.0,      // Velocidad de parada cut-out en m/s
    "survivalSpeedMs": 59.5,    // Velocidad de supervivencia en m/s
    "iecClass": "III",          // Clase IEC (I, II, III, IV, S)
    "acousticPowerLwaDba": 101, // Potencia sonora LwA en dBA
    "generatorType": "PMSG",    // Tipo generador: PMSG, IG, DFIG
    "outputVoltageV": 400,      // Tensión de salida en V
    "rectifierIncluded": true,  // Si incluye rectificador AC/DC
    "dumpLoadRequiredKw": 30,   // Potencia freno reostático en kW
    "nacelleMassKg": 280,       // Masa de la góndola en kg
    "rotorMassKg": 95,          // Masa del rotor en kg

    /* SI ES "microinverters": */
    "kw": 0.800,                // Potencia nominal AC en kW (ej. 0.800 para 800W)
    "type": "Microinversor 2-en-1", // "Microinversor 1-en-1", "Microinversor 2-en-1", "Optimizador DC"
    "mppt": 2,
    "vMpptMin": 16,
    "vMpptMax": 60
  },
  "priceEstimatedEur": 115,     // Precio estimado o de mercado si no figura en el catálogo
  "summaryNotes": "Resumen técnico en 1 o 2 líneas destacando características clave"
}

NORMAS ESTRICTAS DE EXTRACCIÓN:
- Medidas siempre en METROS (divide los milímetros entre 1000).
- Potencias de inversores siempre en KILOVATIOS (kW). Si pone 6000 W, pon 6.0.
- Potencias de paneles siempre en VATIOS pico (Wp).
- Voltajes y amperajes como números limpios sin caracteres ni unidades.
- No inventes cifras. Si un dato no figura, déjalo en null y el motor aplicará valores por defecto seguros.
- Devuelve SOLO el JSON sin delimitadores de markdown conversational.`;
    },

    /**
     * Descubre dinámicamente los modelos compatibles disponibles para esta API Key
     */
    discoverAvailableModels: async function (apiKey) {
      if (this._cachedAvailableModels && this._cachedAvailableModels.length > 0) {
        return this._cachedAvailableModels;
      }
      try {
        const url = 'https://generativelanguage.googleapis.com/v1beta/models';
        const resp = await _aiFetch(url, {}, 20000, apiKey);
        if (resp.ok) {
          const data = await resp.json();
          if (Array.isArray(data.models)) {
            // Filtrar únicamente modelos que soporten generación y excluir modelos especiales/pesados
            const blacklist = /deep-research|tts|transcribe|image|live|audio|embed/i;
            const valid = data.models
              .filter(m => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
              .map(m => m.name.replace(/^models\//, ''))
              .filter(name => !blacklist.test(name));

            const flash = valid.filter(n => /flash/i.test(n));
            const pro = valid.filter(n => !/flash/i.test(n) && /pro/i.test(n));

            flash.sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }));
            pro.sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }));

            const ordered = [...flash, ...pro];
            if (ordered.length > 0) {
              this._cachedAvailableModels = ordered;
              return ordered;
            }
          }
        }
      } catch (e) {
        console.warn('[RAEquipmentAIImporter] No se pudo listar modelos dinámicamente:', e);
      }
      return [
        'gemini-2.5-flash',
        'gemini-2.5-flash-lite',
        'gemini-2.0-flash',
        'gemini-1.5-flash',
        'gemini-3.8-flash',
        'gemini-3.5-flash'
      ];
    },

    /**
     * Llama al endpoint multimodal de Gemini
     */
    callGeminiAPI: async function ({ base64Data, mimeType, fileName }) {
      const apiKey = this.getApiKey();
      if (!apiKey) {
        const err = new Error('No se ha configurado la API Key de Gemini en la aplicación.');
        err.code = 'NO_API_KEY';
        throw err;
      }

      const prompt = this.getExtractionPrompt(this.state.activeCategoryHint);
      const parts = [];

      if (base64Data) {
        parts.push({
          inlineData: {
            mimeType: mimeType || 'application/pdf',
            data: base64Data
          }
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

      // Obtener lista de modelos compatibles para esta cuenta/clave
      let models = await this.discoverAvailableModels(apiKey);
      if (!Array.isArray(models) || models.length === 0) {
        models = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-3.8-flash', 'gemini-3.5-flash'];
      }

      // Si el usuario configuró un modelo manual en window.RA, priorizarlo
      if (root.RA && root.RA.geminiModel && !models.includes(root.RA.geminiModel)) {
        models.unshift(root.RA.geminiModel);
      }

      let lastError = null;
      const attemptErrors = [];

      for (const model of models) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
          const resp = await _aiFetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
          }, 90000, apiKey);

          if (!resp.ok) {
            const errData = await resp.json().catch(() => ({}));
            const errMsg = (errData.error && errData.error.message) ? errData.error.message : `HTTP ${resp.status}`;
            throw new Error(`[${model}] ${errMsg}`);
          }

          const resData = await resp.json();
          let rawText = '';
          if (resData.candidates && resData.candidates[0] && resData.candidates[0].content &&
              resData.candidates[0].content.parts && resData.candidates[0].content.parts[0]) {
            rawText = resData.candidates[0].content.parts[0].text || '';
          }

          if (!rawText.trim()) throw new Error(`[${model}] Respuesta vacía de la IA.`);

          const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
          const parsed = JSON.parse(cleaned);

          return this.sanitizeAndValidate(parsed, fileName);
        } catch (e) {
          attemptErrors.push(e.message);
          lastError = e;
          continue;
        }
      }

      throw lastError || new Error('No se pudo procesar la ficha técnica con ningún modelo disponible.');
    },

    /**
     * Inspector de coherencia física y electrotécnica
     */
    sanitizeAndValidate: function (raw, fileName) {
      if (!raw || typeof raw !== 'object') {
        throw new Error('El formato devuelto por la IA no es un objeto válido.');
      }

      let category = raw.category || 'modules';
      if (!['modules', 'inverters', 'batteries', 'microinverters', 'wind_turbines'].includes(category)) {
        category = 'modules';
      }

      const brand = (raw.brand || 'Fabricante Homologado').trim();
      const model = (raw.model || (fileName ? fileName.replace(/\.[^/.]+$/, '') : 'Modelo Estándar')).trim();
      const specs = raw.specs || {};
      const idPrefix = category === 'modules' ? 'mod_ai_' : (category === 'inverters' ? 'inv_ai_' : (category === 'batteries' ? 'bat_ai_' : (category === 'wind_turbines' ? 'wt_ai_' : 'mlpe_ai_')));
      const id = idPrefix + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 5);

      const validated = {
        id: id,
        category: category,
        brand: brand,
        model: model,
        summaryNotes: raw.summaryNotes || '',
        price: parseFloat(raw.priceEstimatedEur) || 0
      };

      // ── 1. VALIDACIÓN PARA MÓDULOS FV ──────────────────────────────────────
      if (category === 'modules') {
        let wp = parseInt(specs.wp, 10) || 450;
        let l = parseFloat(specs.l) || 1.76;
        let w = parseFloat(specs.w) || 1.13;
        let th = parseFloat(specs.th) || 0.030;

        // Si las medidas vienen en milímetros (> 100), convertirlas a metros
        if (l > 50) l = l / 1000;
        if (w > 50) w = w / 1000;
        if (th > 1) th = th / 1000;

        // Comprobación de límites dimensionales reales
        if (l < 1.0 || l > 3.0) l = 1.76;
        if (w < 0.6 || w > 1.6) w = 1.13;
        if (th < 0.02 || th > 0.06) th = 0.030;

        let voc = parseFloat(specs.voc) || 39.5;
        let isc = parseFloat(specs.isc) || 14.2;
        let vmp = parseFloat(specs.vmp) || 33.0;
        let imp = parseFloat(specs.imp) || 13.6;

        // Leyes de la física: Voc > Vmp y Isc > Imp
        if (voc <= vmp && voc > 0) {
          const temp = voc;
          voc = vmp * 1.18;
          vmp = temp;
        }
        if (isc <= imp && isc > 0) {
          const temp = isc;
          isc = imp * 1.06;
          imp = temp;
        }

        // Si la potencia no cuadraba con Vmp * Imp, ajustarla con tolerancia
        const calcPmp = vmp * imp;
        if (Math.abs(calcPmp - wp) > wp * 0.15 && calcPmp > 100) {
          wp = Math.round(calcPmp);
        }

        let eff = parseFloat(specs.eff) || Math.round((wp / (l * w * 1000)) * 1000) / 10;
        if (eff < 14 || eff > 26) eff = 21.5;

        if (!validated.price || validated.price <= 0) {
          validated.price = Math.round(wp * 0.22); // ~0.22 €/Wp
        }

        validated.wp = wp;
        validated.l = Math.round(l * 1000) / 1000;
        validated.w = Math.round(w * 1000) / 1000;
        validated.th = Math.round(th * 1000) / 1000;
        validated.eff = eff;
        validated.voc = Math.round(voc * 100) / 100;
        validated.isc = Math.round(isc * 100) / 100;
        validated.vmp = Math.round(vmp * 100) / 100;
        validated.imp = Math.round(imp * 100) / 100;
        validated.tempCoeffPmax = parseFloat(specs.tempCoeffPmax) || -0.32;
        validated.tempCoeffVoc = parseFloat(specs.tempCoeffVoc) || -0.26;
        validated.cellType = specs.cellType || 'TOPCon Monocristalino';
        validated.bifacial = Boolean(specs.bifacial);
        validated.bifacialityFactor = parseFloat(specs.bifacialityFactor) || 0.80;
      }

      // ── 2. VALIDACIÓN PARA INVERSORES ──────────────────────────────────────
      else if (category === 'inverters') {
        let kw = parseFloat(specs.kw) || 5.0;
        // Si el valor viene en W (> 50), convertir a kW
        if (kw > 50) kw = kw / 1000;
        if (kw < 0.5) kw = 0.5;

        let mppt = parseInt(specs.mppt, 10) || (kw >= 8 ? 2 : 1);
        if (mppt < 1) mppt = 1;
        if (mppt > 12) mppt = 4;

        let inputsPerMppt = parseInt(specs.inputsPerMppt, 10) || (kw >= 10 ? 2 : 1);
        let vMpptMin = parseInt(specs.vMpptMin, 10) || (kw >= 10 ? 200 : 90);
        let vMpptMax = parseInt(specs.vMpptMax, 10) || (kw >= 10 ? 950 : 560);
        let vDcMax = parseInt(specs.vDcMax, 10) || (kw >= 10 ? 1100 : 600);
        let vStart = parseInt(specs.vStart, 10) || Math.round(vMpptMin * 1.15);

        if (vMpptMin >= vMpptMax) {
          vMpptMin = 120;
          vMpptMax = 600;
        }
        if (vDcMax < vMpptMax) {
          vDcMax = Math.round(vMpptMax * 1.15);
        }

        let iMaxOperA = parseFloat(specs.iMaxOperA) || (kw >= 10 ? 30.0 : 16.0);
        let iMaxScA = parseFloat(specs.iMaxScA) || Math.round(iMaxOperA * 1.35 * 10) / 10;

        if (!validated.price || validated.price <= 0) {
          validated.price = Math.round(kw * 160 + 350);
        }

        validated.kw = Math.round(kw * 10) / 10;
        validated.type = specs.type || (kw > 6.0 ? 'Trifásico Híbrido' : 'Monofásico Híbrido');
        validated.mppt = mppt;
        validated.inputsPerMppt = inputsPerMppt;
        validated.vMpptMin = vMpptMin;
        validated.vMpptMax = vMpptMax;
        validated.vDcMax = vDcMax;
        validated.vStart = vStart;
        validated.iMaxOperA = Math.round(iMaxOperA * 10) / 10;
        validated.iMaxScA = Math.round(iMaxScA * 10) / 10;
        validated.effMax = parseFloat(specs.effMax) || 98.2;
      }

      // ── 3. VALIDACIÓN PARA BATERÍAS ────────────────────────────────────────
      else if (category === 'batteries') {
        let kwh = parseFloat(specs.kwh) || parseFloat(specs.kwhNominal) || 5.0;
        if (kwh < 1.0) kwh = 5.0;

        if (!validated.price || validated.price <= 0) {
          validated.price = Math.round(kwh * 420);
        }

        validated.kwh = Math.round(kwh * 100) / 100;
        validated.type = specs.type || 'LFP Alto Voltaje';
        validated.vNom = parseFloat(specs.vNom) || 400;
        validated.kwMax = parseFloat(specs.kwMax) || Math.min(Math.round(kwh * 0.6 * 10) / 10, 10.0);
        validated.dod = parseFloat(specs.dod) || 95;
        validated.cycles = parseInt(specs.cycles, 10) || 6000;
      }

      // ── 4. VALIDACIÓN PARA MICROINVERSORES / OPTIMIZADORES ──────────────────
      else if (category === 'microinverters') {
        let kw = parseFloat(specs.kw) || 0.800;
        if (kw > 20) kw = kw / 1000; // si viene en W

        if (!validated.price || validated.price <= 0) {
          validated.price = kw < 0.5 ? 65 : 185;
        }

        validated.kw = Math.round(kw * 1000) / 1000;
        validated.type = specs.type || (kw > 0.6 ? 'Microinversor 2-en-1' : 'Optimizador DC');
        validated.mppt = parseInt(specs.mppt, 10) || 2;
        validated.vMpptMin = parseInt(specs.vMpptMin, 10) || 16;
        validated.vMpptMax = parseInt(specs.vMpptMax, 10) || 60;
      }

      this.state.lastExtracted = validated;
      return validated;
    },

    /**
     * Procesa un archivo físico (PDF o Imagen)
     */
    processFile: async function (file) {
      // [D3/M13] Guardia anti doble análisis (doble clic / doble drop)
      if (this.state.isProcessing) return;
      if (!file) throw new Error('No se ha proporcionado ningún archivo.');

      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
      if (!allowedTypes.includes(file.type) && !file.name.match(/\.(pdf|jpe?g|png|webp)$/i)) {
        throw new Error('Formato no compatible. Por favor, sube un PDF o una imagen de la ficha técnica.');
      }

      const apiKey = this.getApiKey();
      if (!apiKey) {
        this.renderApiKeyWarning();
        return;
      }

      this.state.isProcessing = true;
      this.renderLoading('Leyendo ficha técnica y extrayendo parámetros...');

      try {
        const base64 = await this.readFileAsBase64(file);
        const result = await this.callGeminiAPI({
          base64Data: base64,
          mimeType: file.type || 'application/pdf',
          fileName: file.name
        });

        this.state.isProcessing = false;
        this.renderReviewCard(result);
      } catch (err) {
        this.state.isProcessing = false;
        // [D2/G10] Cancelación del usuario: volver al estado inicial sin mostrar error
        if (err && (err.name === 'AbortError' || /abort/i.test(err.message || ''))) {
          this.renderInitialUI(document.getElementById('cat-pane-ai_import'));
          return;
        }
        this.renderError(err.message || 'Error al procesar el documento con IA.');
      }
    },

    /**
     * Guarda el equipo validado en el catálogo permanente (localStorage + memoria)
     */
    commitToCatalog: function (item) {
      if (item && item.category === 'wind_turbines') {
        if (root.RAWindCatalog && typeof root.RAWindCatalog.upsert === 'function') {
          const turbine = {
            id: root.RAWindCatalog.generateId(item.brand, item.model),
            manufacturer: item.brand,
            model: item.model,
            type: item.type || 'HAWT',
            ratedPowerW: item.ratedPowerW || 10000,
            rotorDiameterM: item.rotorDiameterM || 5.0,
            bladeCount: item.bladeCount || 3,
            hubHeightsAvailableM: item.hubHeightsAvailableM || [12, 18, 24],
            cutInSpeedMs: item.cutInSpeedMs || 2.5,
            ratedSpeedMs: item.ratedSpeedMs || 11.0,
            cutOutSpeedMs: item.cutOutSpeedMs || 25.0,
            survivalSpeedMs: item.survivalSpeedMs || 59.5,
            iecClass: item.iecClass || 'III',
            acousticPowerLwaDba: item.acousticPowerLwaDba || 98,
            electrical: {
              generatorType: item.generatorType || 'PMSG',
              outputVoltageV: item.outputVoltageV || 400,
              rectifierIncluded: item.rectifierIncluded !== false,
              dumpLoadRequiredKw: item.dumpLoadRequiredKw || 12
            },
            structural: {
              nacelleMassKg: item.nacelleMassKg || 200,
              rotorMassKg: item.rotorMassKg || 80,
              maxThrustKn: 15,
              naturalFrequencyHz: 0.8
            },
            priceEur: item.price || 15000,
            powerCurve: []
          };
          root.RAWindCatalog.upsert(turbine);
          if (typeof root.switchCatalogTab === 'function') root.switchCatalogTab('wind_turbines');
          return turbine.id;
        }
      }
      if (!item || !item.category || !root.equipmentCatalog) {
        throw new Error('Error al guardar: el catálogo no está inicializado.');
      }

      const catList = root.equipmentCatalog[item.category];
      if (!Array.isArray(catList)) {
        throw new Error('Categoría de catálogo desconocida: ' + item.category);
      }

      // Preparar el objeto con la firma exacta requerida por el resto del sistema
      const toSave = {
        id: item.id,
        brand: item.brand,
        model: item.model,
        price: parseFloat(item.price) || 0
      };

      if (item.category === 'modules') {
        toSave.wp = item.wp;
        toSave.eff = item.eff;
        toSave.l = item.l;
        toSave.w = item.w;
        toSave.th = item.th;
        toSave.voc = item.voc;
        toSave.isc = item.isc;
        toSave.vmp = item.vmp;
        toSave.imp = item.imp;
        toSave.tempCoeffPmax = item.tempCoeffPmax;
        toSave.tempCoeffVoc = item.tempCoeffVoc;
        toSave.cellType = item.cellType;
        toSave.bifacial = item.bifacial;
      } else if (item.category === 'inverters') {
        toSave.kw = item.kw;
        toSave.type = item.type;
        toSave.mppt = item.mppt;
        toSave.inputsPerMppt = item.inputsPerMppt;
        toSave.vMpptMin = item.vMpptMin;
        toSave.vMpptMax = item.vMpptMax;
        toSave.vDcMax = item.vDcMax;
        toSave.vStart = item.vStart;
        toSave.iMaxOperA = item.iMaxOperA;
        toSave.iMaxScA = item.iMaxScA;
        toSave.effMax = item.effMax;
      } else if (item.category === 'batteries') {
        toSave.kwh = item.kwh;
        toSave.type = item.type;
        toSave.vNom = item.vNom;
        toSave.kwMax = item.kwMax;
        toSave.dod = item.dod;
      } else if (item.category === 'microinverters') {
        toSave.kw = item.kw;
        toSave.type = item.type;
        toSave.mppt = item.mppt;
      }

      // Evitar duplicados por ID
      const existingIdx = catList.findIndex(x => x.id === toSave.id);
      if (existingIdx !== -1) {
        catList[existingIdx] = toSave;
      } else {
        catList.push(toSave);
      }

      // Persistir y refrescar la aplicación
      if (typeof root.saveEquipmentCatalog === 'function') {
        root.saveEquipmentCatalog();
      }

      if (typeof root.showStatus === 'function') {
        root.showStatus('✨ NUEVO EQUIPO REGISTRADO: ' + toSave.brand + ' ' + toSave.model, 3500);
      }

      // Si hay un selector de módulo en Paso 2 y acabamos de agregar un módulo, seleccionarlo automáticamente
      if (item.category === 'modules' && typeof root.onSelectModuleFromDropdown === 'function') {
        root.onSelectModuleFromDropdown(toSave.id);
      } else if (item.category === 'inverters' && typeof root.applyInverterFromCatalog === 'function') {
        root.applyInverterFromCatalog(toSave.id);
      } else if (item.category === 'batteries' && typeof root.applyBatteryFromCatalog === 'function') {
        root.applyBatteryFromCatalog(toSave.id);
      }

      // Regresar a la pestaña correspondiente en el catálogo
      if (typeof root.switchCatalogTab === 'function') {
        root.switchCatalogTab(item.category);
      }
    },

    // ── RENDERIZADO VISUAL EN LA UI ──────────────────────────────────────────

    /**
     * Dibuja la zona de arrastre inicial
     */
    renderInitialUI: function (containerEl) {
      if (!containerEl) return;
      const apiKey = this.getApiKey();

      containerEl.innerHTML = `
        <div style="background:rgba(15,23,42,0.6);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:24px;max-width:720px;margin:0 auto;text-align:center;">
          <div style="display:inline-flex;align-items:center;justify-content:center;width:48px;height:48px;border-radius:12px;background:rgba(56,189,248,0.1);color:var(--sky-400);margin-bottom:12px;">
            <i data-lucide="sparkles" style="width:24px;height:24px;"></i>
          </div>
          <h3 style="margin:0 0 6px 0;font-size:15px;font-weight:700;color:#fff;">Importar Ficha Técnica con Inteligencia Artificial</h3>
          <p style="margin:0 0 20px 0;font-size:11px;color:var(--text-slate-400);line-height:1.5;">
            Arrastra el archivo PDF o imagen de la ficha comercial de cualquier fabricante.<br>
            La IA clasificará el componente, extraerá sus parámetros eléctricos y lo añadirá a tu catálogo.
          </p>

          ${!apiKey ? `
            <div style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:8px;padding:12px 16px;margin-bottom:16px;text-align:left;display:flex;align-items:center;justify-content:space-between;gap:12px;">
              <div>
                <div style="font-size:11px;font-weight:bold;color:var(--amber-400);">⚠️ Falta la Clave de API de Gemini</div>
                <div style="font-size:10px;color:var(--text-slate-400);">Necesitas configurar tu clave gratuita para activar el lector inteligente de documentos.</div>
              </div>
              <button class="doc-mini-btn" onclick="if(window.openCompanyBrandingModal) window.openCompanyBrandingModal();" style="border-color:var(--amber-400);color:var(--amber-400);padding:5px 10px;font-size:10px;white-space:nowrap;">Configurar Clave</button>
            </div>
          ` : ''}

          <!-- Dropzone -->
          <div id="ai-importer-dropzone" style="border:2px dashed rgba(56,189,248,0.35);border-radius:10px;padding:32px 20px;background:rgba(56,189,248,0.03);cursor:pointer;transition:all 0.2s ease;">
            <input type="file" id="ai-importer-file-input" accept=".pdf,image/png,image/jpeg,image/webp" style="display:none;">
            <i data-lucide="file-up" style="width:36px;height:36px;color:var(--sky-400);margin-bottom:10px;"></i>
            <div style="font-size:12px;font-weight:600;color:#fff;margin-bottom:4px;">Haz clic aquí o arrastra un PDF / imagen</div>
            <div style="font-size:10px;color:var(--text-slate-400);">Compatible con datasheets de Módulos FV, Inversores, Baterías y MLPE</div>
          </div>
        </div>
      `;

      if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
      }

      const dropzone = containerEl.querySelector('#ai-importer-dropzone');
      const fileInput = containerEl.querySelector('#ai-importer-file-input');

      if (dropzone && fileInput) {
        dropzone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
          if (e.target.files && e.target.files[0]) {
            this.processFile(e.target.files[0]);
          }
        });

        dropzone.addEventListener('dragover', (e) => {
          e.preventDefault();
          dropzone.style.borderColor = 'var(--sky-400)';
          dropzone.style.background = 'rgba(56,189,248,0.1)';
        });

        dropzone.addEventListener('dragleave', () => {
          dropzone.style.borderColor = 'rgba(56,189,248,0.35)';
          dropzone.style.background = 'rgba(56,189,248,0.03)';
        });

        dropzone.addEventListener('drop', (e) => {
          e.preventDefault();
          dropzone.style.borderColor = 'rgba(56,189,248,0.35)';
          dropzone.style.background = 'rgba(56,189,248,0.03)';
          if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            this.processFile(e.dataTransfer.files[0]);
          }
        });
      }
    },

    /**
     * Muestra estado de carga
     */
    renderLoading: function (msg) {
      const pane = document.getElementById('cat-pane-ai_import');
      if (!pane) return;

      pane.innerHTML = `
        <div style="text-align:center;padding:50px 20px;max-width:480px;margin:0 auto;">
          <div class="ra-spinner" style="width:36px;height:36px;border:3px solid rgba(56,189,248,0.2);border-top-color:var(--sky-400);border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 16px auto;"></div>
          <div style="font-size:13px;font-weight:700;color:#fff;margin-bottom:6px;">Analizando ficha técnica con IA</div>
          <div style="font-size:11px;color:var(--text-slate-400);line-height:1.4;">${this.escapeHtml(msg || 'Extrayendo parámetros de ingeniería...')}</div>
          <button class="doc-mini-btn" onclick="if(window.cancelGeminiAnalysis) window.cancelGeminiAnalysis();" style="margin-top:18px;border-color:var(--text-slate-400);color:var(--text-slate-400);padding:6px 14px;font-size:11px;">Cancelar</button>
        </div>
      `;
    },

    /**
     * Muestra error de lectura o aviso de cuota
     */
    renderError: function (errMsg) {
      const pane = document.getElementById('cat-pane-ai_import');
      if (!pane) return;

      const isQuota = /quota|exceeded|rate.?limit|429/i.test(errMsg);

      if (isQuota) {
        pane.innerHTML = `
          <div style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:10px;padding:24px;max-width:580px;margin:25px auto;text-align:center;">
            <i data-lucide="clock" style="width:36px;height:36px;color:var(--amber-400);margin-bottom:12px;"></i>
            <div style="font-size:14px;font-weight:bold;color:var(--amber-400);margin-bottom:8px;">Límite de cuota gratuita alcanzado temporalmente</div>
            <p style="font-size:11px;color:var(--text-slate-300);line-height:1.5;margin-bottom:14px;">
              Google limita las peticiones por minuto en su plan gratuito. Espera unos <b>20 segundos</b> antes de reintentar.
            </p>
            <div style="background:rgba(0,0,0,0.3);border-radius:6px;padding:10px 12px;margin-bottom:16px;font-size:10px;color:var(--text-slate-400);text-align:left;">
              💡 <b>¿Cómo evitar límites de cuota?</b><br>
              En <b>Google AI Studio</b> puedes activar el plan de <i>pago por uso (Pay-as-you-go)</i> vinculando una tarjeta. El coste es de apenas <b>~0,0003 € por ficha técnica</b> (1 € rinde para más de 3.000 fichas) y te da más de 1.000 peticiones por minuto sin esperas.
            </div>
            <div style="display:flex;justify-content:center;gap:10px;">
              <button class="doc-mini-btn" onclick="RAEquipmentAIImporter.renderInitialUI(document.getElementById('cat-pane-ai_import'))" style="border-color:var(--sky-400);color:var(--sky-400);padding:7px 16px;font-size:11px;font-weight:bold;">
                <i data-lucide="rotate-cw" class="icon-sm"></i> Reintentar ahora
              </button>
            </div>
          </div>
        `;
      } else {
        pane.innerHTML = `
          <div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:10px;padding:24px;max-width:550px;margin:30px auto;text-align:center;">
            <i data-lucide="alert-triangle" style="width:32px;height:32px;color:var(--rose-500);margin-bottom:10px;"></i>
            <div style="font-size:13px;font-weight:bold;color:var(--rose-400);margin-bottom:8px;">No se pudo extraer la información</div>
            <div style="font-size:11px;color:var(--text-slate-300);margin-bottom:20px;line-height:1.5;">${this.escapeHtml(errMsg)}</div>
            <button class="doc-mini-btn" onclick="RAEquipmentAIImporter.renderInitialUI(document.getElementById('cat-pane-ai_import'))" style="border-color:var(--sky-400);color:var(--sky-400);padding:6px 14px;font-size:11px;">Intentar de nuevo</button>
          </div>
        `;
      }
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    },

    /**
     * Muestra aviso de falta de clave
     */
    renderApiKeyWarning: function () {
      this.renderError('Se requiere la clave API de Gemini. Configúrala en la sección de Empresa para activar esta función.');
    },

    escapeHtml: function (str) {
      if (str == null) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    },

    /**
     * Muestra la tarjeta de revisión antes de incorporar al catálogo
     */
    renderReviewCard: function (data) {
      const pane = document.getElementById('cat-pane-ai_import');
      if (!pane) return;

      const catLabels = {
        modules: 'MÓDULO SOLAR FOTOVOLTAICO',
        inverters: 'INVERSOR DE RED / HÍBRIDO',
        batteries: 'BATERÍA DE ALMACENAMIENTO',
        microinverters: 'MICROINVERSOR / OPTIMIZADOR'
      };

      let specsHtml = '';

      if (data.category === 'modules') {
        specsHtml = `
          <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:10px;margin-bottom:14px;font-size:11px;">
            <div style="background:rgba(0,0,0,0.25);padding:8px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.05);">
              <span style="color:var(--text-slate-400);font-size: 10px;display:block;">Potencia Nominal</span>
              <b style="color:var(--emerald-400);font-size:14px;">${data.wp} Wp</b>
            </div>
            <div style="background:rgba(0,0,0,0.25);padding:8px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.05);">
              <span style="color:var(--text-slate-400);font-size: 10px;display:block;">Eficiencia STC</span>
              <b style="color:#fff;font-size:13px;">${data.eff} %</b>
            </div>
            <div style="background:rgba(0,0,0,0.25);padding:8px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.05);">
              <span style="color:var(--text-slate-400);font-size: 10px;display:block;">Dimensiones (L×W)</span>
              <b style="color:#fff;font-size:12px;font-family:monospace;">${data.l.toFixed(2)} × ${data.w.toFixed(2)} m</b>
            </div>
            <div style="background:rgba(0,0,0,0.25);padding:8px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.05);">
              <span style="color:var(--text-slate-400);font-size: 10px;display:block;">Tensión Voc / Vmp</span>
              <span style="color:#fff;font-size:11px;">${data.voc}V / ${data.vmp}V</span>
            </div>
            <div style="background:rgba(0,0,0,0.25);padding:8px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.05);">
              <span style="color:var(--text-slate-400);font-size: 10px;display:block;">Corriente Isc / Imp</span>
              <span style="color:#fff;font-size:11px;">${data.isc}A / ${data.imp}A</span>
            </div>
            <div style="background:rgba(0,0,0,0.25);padding:8px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.05);">
              <span style="color:var(--text-slate-400);font-size: 10px;display:block;">Coeficiente Temp. Pmax</span>
              <span style="color:#fff;font-size:11px;">${data.tempCoeffPmax} %/°C</span>
            </div>
          </div>
        `;
      } else if (data.category === 'inverters') {
        specsHtml = `
          <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:10px;margin-bottom:14px;font-size:11px;">
            <div style="background:rgba(0,0,0,0.25);padding:8px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.05);">
              <span style="color:var(--text-slate-400);font-size: 10px;display:block;">Potencia Nominal AC</span>
              <b style="color:var(--sky-400);font-size:14px;">${data.kw} kW</b>
            </div>
            <div style="background:rgba(0,0,0,0.25);padding:8px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.05);">
              <span style="color:var(--text-slate-400);font-size: 10px;display:block;">MPPTs / Entradas</span>
              <b style="color:#fff;font-size:12px;">${data.mppt} MPPT (${data.inputsPerMppt} str/mppt)</b>
            </div>
            <div style="background:rgba(0,0,0,0.25);padding:8px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.05);">
              <span style="color:var(--text-slate-400);font-size: 10px;display:block;">Tensión Máx / Rango</span>
              <b style="color:#fff;font-size:11px;font-family:monospace;">${data.vDcMax}V (${data.vMpptMin}-${data.vMpptMax}V)</b>
            </div>
            <div style="background:rgba(0,0,0,0.25);padding:8px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.05);">
              <span style="color:var(--text-slate-400);font-size: 10px;display:block;">Corrientes Ioper / Isc</span>
              <span style="color:#fff;font-size:11px;">${data.iMaxOperA}A / ${data.iMaxScA}A</span>
            </div>
            <div style="background:rgba(0,0,0,0.25);padding:8px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.05);">
              <span style="color:var(--text-slate-400);font-size: 10px;display:block;">Tipo de Red</span>
              <span style="color:#fff;font-size:11px;">${this.escapeHtml(data.type)}</span>
            </div>
            <div style="background:rgba(0,0,0,0.25);padding:8px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.05);">
              <span style="color:var(--text-slate-400);font-size: 10px;display:block;">Eficiencia Máx</span>
              <span style="color:#fff;font-size:11px;">${data.effMax} %</span>
            </div>
          </div>
        `;
      } else if (data.category === 'batteries') {
        specsHtml = `
          <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:10px;margin-bottom:14px;font-size:11px;">
            <div style="background:rgba(0,0,0,0.25);padding:8px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.05);">
              <span style="color:var(--text-slate-400);font-size: 10px;display:block;">Capacidad Útil</span>
              <b style="color:var(--emerald-400);font-size:14px;">${data.kwh} kWh</b>
            </div>
            <div style="background:rgba(0,0,0,0.25);padding:8px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.05);">
              <span style="color:var(--text-slate-400);font-size: 10px;display:block;">Potencia Descarga</span>
              <b style="color:#fff;font-size:13px;">${data.kwMax} kW</b>
            </div>
            <div style="background:rgba(0,0,0,0.25);padding:8px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.05);">
              <span style="color:var(--text-slate-400);font-size: 10px;display:block;">Química / Tipo</span>
              <b style="color:#fff;font-size:11px;">${this.escapeHtml(data.type)}</b>
            </div>
          </div>
        `;
      } else if (data.category === 'wind_turbines') {
        const kw = (data.ratedPowerW ? (data.ratedPowerW / 1000).toFixed(1) : '?');
        specsHtml = `
          <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:10px;margin-bottom:14px;font-size:11px;">
            <div style="background:rgba(0,0,0,0.25);padding:8px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.05);">
              <span style="color:var(--text-slate-400);font-size: 10px;display:block;">Potencia Nominal</span>
              <b style="color:#38BDF8;font-size:14px;">${this.escapeHtml(kw)} kW</b>
            </div>
            <div style="background:rgba(0,0,0,0.25);padding:8px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.05);">
              <span style="color:var(--text-slate-400);font-size: 10px;display:block;">Tipo & Rotor</span>
              <b style="color:#fff;font-size:12px;">${this.escapeHtml(data.type)} · Ø ${this.escapeHtml(data.rotorDiameterM)}m</b>
            </div>
            <div style="background:rgba(0,0,0,0.25);padding:8px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.05);">
              <span style="color:var(--text-slate-400);font-size: 10px;display:block;">Ruido & Clase</span>
              <b style="color:#FBBF24;font-size:12px;">${this.escapeHtml(data.acousticPowerLwaDba)} dBA · Clase ${this.escapeHtml(data.iecClass)}</b>
            </div>
          </div>
        `;
      } else if (data.category === 'microinverters') {
        specsHtml = `
          <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:10px;margin-bottom:14px;font-size:11px;">
            <div style="background:rgba(0,0,0,0.25);padding:8px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.05);">
              <span style="color:var(--text-slate-400);font-size: 10px;display:block;">Potencia Nominal</span>
              <b style="color:var(--emerald-400);font-size:14px;">${this.escapeHtml(data.kw * 1000)} W</b>
            </div>
            <div style="background:rgba(0,0,0,0.25);padding:8px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.05);">
              <span style="color:var(--text-slate-400);font-size: 10px;display:block;">Topología</span>
              <b style="color:#fff;font-size:11px;">${this.escapeHtml(data.type)}</b>
            </div>
            <div style="background:rgba(0,0,0,0.25);padding:8px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.05);">
              <span style="color:var(--text-slate-400);font-size: 10px;display:block;">Canales MPPT</span>
              <b style="color:#fff;font-size:11px;">${this.escapeHtml(data.mppt)} MPPT</b>
            </div>
          </div>
        `;
      }

      const safeBrand = this.escapeHtml(data.brand || '');
      const safeModel = this.escapeHtml(data.model || '');
      const safePrice = Number.isFinite(Number(data.price)) ? Number(data.price) : 0;
      const safeNotes = this.escapeHtml(data.summaryNotes || '');

      pane.innerHTML = `
        <div style="background:rgba(15,23,42,0.8);border:1px solid var(--border-subtle);border-radius:10px;padding:20px;max-width:700px;margin:0 auto;color:#fff;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:10px;">
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="display:inline-block;padding:3px 8px;border-radius:4px;background:rgba(16,185,129,0.15);color:var(--emerald-400);font-size: 10px;font-weight:bold;letter-spacing:0.5px;">
                ✓ PARÁMETROS HOMOLOGADOS
              </span>
              <span style="font-size:10px;color:var(--text-slate-400);text-transform:uppercase;">${this.escapeHtml(catLabels[data.category] || data.category)}</span>
            </div>
            <button class="doc-mini-btn" onclick="RAEquipmentAIImporter.renderInitialUI(document.getElementById('cat-pane-ai_import'))" style="font-size:10px;color:var(--text-slate-400);">
              ↺ Subir otro documento
            </button>
          </div>

          <!-- Campos Editables Rápidos -->
          <div style="display:grid;grid-template-columns:2fr 2fr 1fr;gap:10px;margin-bottom:14px;">
            <div class="doc-field">
              <label>Marca / Fabricante:</label>
              <input type="text" id="ai-review-brand" value="${safeBrand}" style="width:100%;background:#0b1120;border:1px solid #334155;color:#fff;padding:6px 8px;border-radius:4px;font-size:11px;">
            </div>
            <div class="doc-field">
              <label>Modelo:</label>
              <input type="text" id="ai-review-model" value="${safeModel}" style="width:100%;background:#0b1120;border:1px solid #334155;color:#fff;padding:6px 8px;border-radius:4px;font-size:11px;">
            </div>
            <div class="doc-field">
              <label>Precio (€):</label>
              <input type="number" id="ai-review-price" value="${safePrice}" step="5" style="width:100%;background:#0b1120;border:1px solid #334155;color:var(--amber-400);font-weight:bold;padding:6px 8px;border-radius:4px;font-size:11px;">
            </div>
          </div>

          <!-- Desglose de Parámetros de Ingeniería -->
          ${specsHtml}

          ${safeNotes ? `
            <div style="font-size:10.5px;color:var(--text-slate-400);font-style:italic;margin-bottom:16px;background:rgba(0,0,0,0.2);padding:6px 10px;border-radius:4px;">
              💡 <b>Nota del fabricante:</b> ${safeNotes}
            </div>
          ` : ''}

          <!-- Botones de Acción -->
          <div style="display:flex;justify-content:flex-end;gap:10px;border-top:1px solid rgba(255,255,255,0.08);padding-top:14px;">
            <button class="doc-mini-btn" onclick="RAEquipmentAIImporter.renderInitialUI(document.getElementById('cat-pane-ai_import'))" style="padding:6px 12px;font-size:11px;color:var(--text-slate-400);">Cancelar</button>
            <button class="doc-mini-btn" id="ai-btn-confirm-save" style="padding:8px 18px;font-size:11px;background:var(--emerald-500);border-color:var(--emerald-400);color:#fff;font-weight:bold;border-radius:6px;display:flex;align-items:center;gap:6px;">
              <i data-lucide="check" class="icon-sm"></i> AÑADIR AL CATÁLOGO AHORA
            </button>
          </div>
        </div>
      `;

      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();

      const btnSave = pane.querySelector('#ai-btn-confirm-save');
      if (btnSave) {
        btnSave.addEventListener('click', () => {
          const brandInput = pane.querySelector('#ai-review-brand');
          const modelInput = pane.querySelector('#ai-review-model');
          const priceInput = pane.querySelector('#ai-review-price');

          if (brandInput && brandInput.value) data.brand = brandInput.value.trim();
          if (modelInput && modelInput.value) data.model = modelInput.value.trim();
          if (priceInput && priceInput.value) data.price = parseFloat(priceInput.value) || data.price;

          this.commitToCatalog(data);
        });
      }
    }
  };

  // Exportación canónica global
  root.RAEquipmentAIImporter = RAEquipmentAIImporter;
  root.RA = root.RA || {};
  root.RA.EquipmentAI = RAEquipmentAIImporter;

})(typeof window !== 'undefined' ? window : global);
