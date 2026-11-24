/**
 * ===============================================================================
 * RA - VISOR SOLAR 3D | SUBSISTEMA MODULAR: BUSCADOR WEB DE EQUIPOS CON IA
 * ===============================================================================
 * Archivo: js/equipment-web-search.js
 * Rol: Búsqueda asistida por IA en internet y bases de datos globales de
 *      fabricantes fotovoltaicos para incorporar equipos al catálogo oficial.
 * Normativas: IEC 62548, REBT ITC-BT-40, UNE-EN 62305.
 * Arquitectura: Totalmente desacoplada, modular y reactiva.
 * ===============================================================================
 */

(function (root) {
  'use strict';

  const RAEquipmentWebSearch = {
    state: {
      isSearching: false,
      lastQuery: '',
      activeFilter: 'all',
      lastResults: []
    },

    getApiKey: function () {
      return (root.RA && typeof root.RA.getGeminiApiKey === 'function')
        ? (root.RA.getGeminiApiKey() || '').trim()
        : '';
    },

    discoverAvailableModels: async function (apiKey) {
      if (root.RA && typeof root.RA.discoverGeminiModels === 'function') {
        try {
          const res = await root.RA.discoverGeminiModels(apiKey);
          if (Array.isArray(res) && res.length > 0) return res;
        } catch (e) {}
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
     * Construye el prompt técnico para extraer fichas comerciales de equipos solares
     */
    buildSearchPrompt: function (query, categoryFilter) {
      const catConstraint = categoryFilter && categoryFilter !== 'all'
        ? `IMPORTANTE: Limita los resultados estrictamente a la categoría '${categoryFilter}'.`
        : `Clasifica cada resultado en una de estas 5 categorías: 'modules', 'inverters', 'batteries', 'microinverters' o 'wind_turbines'.`;

      return `Actúa como un Ingeniero Senior de Proyectos Fotovoltaicos y Base de Datos Oficial de Equipos Solares.
El usuario desea buscar en internet y en la base técnica internacional de fabricantes fotovoltaicos modelos comerciales reales que coincidan con la búsqueda:
"${query}".

${catConstraint}

Devuelve de 1 a 6 modelos comerciales reales y precisos que mejor coincidan con la búsqueda.
Para cada equipo, debes incluir todas las especificaciones electrotécnicas y físicas reales según sus hojas de datos técnicas (datasheet del fabricante).

FORMATO DE SALIDA OBLIGATORIO:
Devuelve EXCLUSIVAMENTE un array JSON válido sin formato markdown ni bloques de código extra.
Ejemplo de estructura para cada tipo:

Si es Módulo ('modules'):
{
  "category": "modules",
  "brand": "Nombre de Fabricante",
  "model": "Denominación Comercial exacta",
  "wp": 450, // número entero o flotante en Wp
  "eff": 22.1, // porcentaje de rendimiento STC (ej 22.1)
  "l": 1.762, // longitud en metros (ej 1.76)
  "w": 1.134, // anchura en metros (ej 1.13)
  "th": 0.030, // grosor de marco en metros (ej 0.030)
  "voc": 41.8, // Tensión de circuito abierto en V
  "isc": 13.9, // Corriente de cortocircuito en A
  "vmp": 34.5, // Tensión a máxima potencia en V
  "imp": 13.05, // Corriente a máxima potencia en A
  "technology": "N-Type TOPCon / HJT / PERC",
  "price": 110 // precio estimado de mercado en España/Europa en euros
}

Si es Inversor ('inverters'):
{
  "category": "inverters",
  "brand": "Nombre de Fabricante",
  "model": "Modelo comercial exacto",
  "kw": 5.0, // potencia nominal AC en kW
  "mppt": 2, // número de seguidores MPPT independientes
  "inputsPerMppt": 1, // entradas DC por cada canal MPPT
  "vDcMax": 1000, // tensión máxima admisible DC en V
  "vStart": 120, // tensión de arranque en V
  "vMpptMin": 90, // límite inferior rango MPPT en V
  "vMpptMax": 850, // límite superior rango MPPT en V
  "vMpptNomMin": 150,
  "vMpptNomMax": 800,
  "iMaxOperA": 15.0, // corriente máxima operativa por MPPT en A
  "iMaxScA": 22.5, // corriente máxima de cortocircuito por MPPT en A
  "maxOverload": 1.30, // ratio de sobredimensionamiento DC/AC
  "type": "Monofásico Híbrido / Trifásico Red / etc.",
  "eff": 98.2, // eficiencia máxima europea en %
  "price": 1200 // precio estimado en euros
}

Si es Batería ('batteries'):
{
  "category": "batteries",
  "brand": "Nombre de Fabricante",
  "model": "Modelo comercial exacto",
  "kwh": 5.12, // capacidad nominal útil en kWh
  "type": "LFP Litio FerroFosfato Alta Tensión / Baja Tensión",
  "price": 2400 // precio estimado en euros
}

Si es Microinversor ('microinverters'):
{
  "category": "microinverters",
  "brand": "Nombre de Fabricante",
  "model": "Modelo comercial exacto",
  "kw": 0.38, // potencia de salida AC en kW
  "type": "Microinversor 1-en-1 / 2-en-1 / 4-en-1",
  "price": 160 // precio estimado en euros
}



Si es Aerogenerador ('wind_turbines'):
{
  "category": "wind_turbines",
  "brand": "Nombre de Fabricante (ej. Bornay, Enair, Kliux, Vestas)",
  "model": "Modelo comercial exacto",
  "type": "HAWT", // HAWT (eje horizontal) o VAWT (eje vertical)
  "ratedPowerW": 25000, // potencia nominal en W
  "rotorDiameterM": 6.4, // diámetro del rotor en metros
  "bladeCount": 3,
  "hubHeightsAvailableM": [12, 18, 24, 30],
  "cutInSpeedMs": 2.5,
  "ratedSpeedMs": 11.0,
  "cutOutSpeedMs": 25.0,
  "survivalSpeedMs": 59.5,
  "iecClass": "III",
  "acousticPowerLwaDba": 101,
  "generatorType": "PMSG",
  "outputVoltageV": 400,
  "rectifierIncluded": true,
  "dumpLoadRequiredKw": 30,
  "nacelleMassKg": 280,
  "rotorMassKg": 95,
  "price": 28000 // precio estimado en euros
}

REGLAS DE RIGOR TÉCNICO:
1. No inventes marcas ni modelos ficticios. Usa modelos reales de fabricantes como Aiko, Longi, Jinko, JA Solar, Trina, Canadian Solar, SunPower, Meyer Burger, Fronius, Huawei, SMA, Kostal, Deye, SolarEdge, Sungrow, Enphase, BYD, Pylontech, LG Energy, etc.
2. Asegura coherencia física: Voc > Vmp siempre, Isc > Imp siempre, las dimensiones l y w deben estar en metros (entre 1.6m y 2.5m).
3. Devuelve únicamente el array JSON: [ { ... }, { ... } ]`;
    },

    /**
     * Ejecuta la consulta a Gemini API
     */
    searchOnline: async function (query, categoryFilter = 'all') {
      const apiKey = this.getApiKey();
      if (!apiKey) {
        const err = new Error('No se ha configurado la API Key de Gemini en la aplicación.');
        err.code = 'NO_API_KEY';
        throw err;
      }

      const prompt = this.buildSearchPrompt(query, categoryFilter);
      const requestBody = {
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json'
        }
      };

      let models = await this.discoverAvailableModels(apiKey);
      if (!Array.isArray(models) || models.length === 0) {
        models = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-1.5-flash'];
      }
      if (root.RA && root.RA.geminiModel && !models.includes(root.RA.geminiModel)) {
        models.unshift(root.RA.geminiModel);
      }

      let lastError = null;
      let rawText = '';

      for (const model of models) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
          const res = await root.RA.geminiFetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
          }, 30000, apiKey);

          if (!res.ok) {
            const errText = await res.text();
            throw new Error(`[${model}] Error HTTP ${res.status}: ${errText.slice(0, 150)}`);
          }

          const data = await res.json();
          rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (rawText && rawText.trim()) {
            break;
          }
        } catch (e) {
          lastError = e;
        }
      }

      if (!rawText) {
        throw lastError || new Error('No se recibió respuesta válida del motor de IA.');
      }

      let items = [];
      try {
        const clean = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
        items = JSON.parse(clean);
        if (!Array.isArray(items)) {
          if (items && typeof items === 'object') {
            if (Array.isArray(items.items)) items = items.items;
            else if (Array.isArray(items.results)) items = items.results;
            else if (Array.isArray(items.models)) items = items.models;
            else items = [items];
          }
        }
      } catch (pe) {
        console.error('[RAEquipmentWebSearch] Error parseando JSON de Gemini:', pe, rawText);
        throw new Error('La respuesta de la IA no pudo ser interpretada como JSON válido.');
      }

      if (!Array.isArray(items) || items.length === 0) {
        return [];
      }

      // Validar y sanitizar cada elemento
      return items.map((item, idx) => this.sanitizeItem(item, idx)).filter(Boolean);
    },

    /**
     * Sanitiza y valida electrotécnicamente cada equipo devuelto
     */
    sanitizeItem: function (raw, idx) {
      if (!raw || typeof raw !== 'object') return null;

      const category = (raw.category || 'modules').toLowerCase();
      const brand = String(raw.brand || 'Fabricante Desconocido').trim();
      const model = String(raw.model || `Modelo ${idx + 1}`).trim();
      const price = Math.max(parseFloat(raw.price) || 100, 10);

      const base = {
        brand,
        model,
        price,
        isWebImported: true,
        source: 'Web Search AI'
      };

      if (category.includes('wind') || category.includes('eoli') || category.includes('turbin')) {
        const ratedPowerW = Math.max(parseFloat(raw.ratedPowerW) || (parseFloat(raw.kw) ? parseFloat(raw.kw) * 1000 : 10000), 500);
        const rotorDiameterM = Math.max(parseFloat(raw.rotorDiameterM) || (parseFloat(raw.diameter) || 5.0), 1.0);
        const type = (String(raw.type || 'HAWT').toUpperCase() === 'VAWT') ? 'VAWT' : 'HAWT';
        return {
          ...base,
          category: 'wind_turbines',
          type: type,
          ratedPowerW: ratedPowerW,
          rotorDiameterM: rotorDiameterM,
          bladeCount: parseInt(raw.bladeCount, 10) || 3,
          hubHeightsAvailableM: Array.isArray(raw.hubHeightsAvailableM) ? raw.hubHeightsAvailableM : [12, 18, 24],
          cutInSpeedMs: parseFloat(raw.cutInSpeedMs) || 2.5,
          ratedSpeedMs: parseFloat(raw.ratedSpeedMs) || 11.0,
          cutOutSpeedMs: parseFloat(raw.cutOutSpeedMs) || 25.0,
          survivalSpeedMs: parseFloat(raw.survivalSpeedMs) || 59.5,
          iecClass: String(raw.iecClass || 'III'),
          acousticPowerLwaDba: parseFloat(raw.acousticPowerLwaDba) || 98,
          generatorType: raw.generatorType || 'PMSG',
          outputVoltageV: parseFloat(raw.outputVoltageV) || 400,
          rectifierIncluded: raw.rectifierIncluded !== false,
          dumpLoadRequiredKw: parseFloat(raw.dumpLoadRequiredKw) || (ratedPowerW / 1000 * 1.2),
          nacelleMassKg: parseFloat(raw.nacelleMassKg) || 200,
          rotorMassKg: parseFloat(raw.rotorMassKg) || 80,
          price: Math.max(parseFloat(raw.price) || 15000, 500)
        };
      }

      if (category.includes('inv') && !category.includes('micro')) {
        const kw = Math.max(parseFloat(raw.kw) || 5.0, 0.5);
        const mppt = Math.max(parseInt(raw.mppt, 10) || 2, 1);
        const inputsPerMppt = Math.max(parseInt(raw.inputsPerMppt, 10) || 1, 1);
        const vDcMax = Math.max(parseFloat(raw.vDcMax) || 1000, 400);
        const vStart = Math.max(parseFloat(raw.vStart) || 120, 50);
        const vMpptMin = Math.max(parseFloat(raw.vMpptMin) || Math.round(vStart * 0.8), 50);
        const vMpptMax = Math.max(parseFloat(raw.vMpptMax) || Math.round(vDcMax * 0.85), vMpptMin + 50);
        const iMaxOperA = Math.max(parseFloat(raw.iMaxOperA) || 15.0, 5.0);
        const iMaxScA = Math.max(parseFloat(raw.iMaxScA) || Math.round(iMaxOperA * 1.5), iMaxOperA);

        return {
          ...base,
          category: 'inverters',
          kw,
          phases: parseInt(raw.phases, 10) || ((String(raw.type || '').toLowerCase().includes('trif') || kw > 6.0) ? 3 : 1),
          mppt,
          inputsPerMppt,
          inputs: mppt * inputsPerMppt,
          vDcMax,
          vStart,
          vMpptMin,
          vMpptMax,
          vMpptNomMin: Math.round(vStart * 1.1),
          vMpptNomMax: Math.round(vDcMax * 0.8),
          iMaxOperA,
          iMaxScA,
          maxOverload: parseFloat(raw.maxOverload) || 1.30,
          type: String(raw.type || 'Inversor de Red').trim(),
          eff: parseFloat(raw.eff) || 98.2
        };
      }

      if (category.includes('bat')) {
        const kwh = Math.max(parseFloat(raw.kwh) || 5.12, 0.5);
        return {
          ...base,
          category: 'batteries',
          kwh,
          type: String(raw.type || 'LFP Litio').trim()
        };
      }

      if (category.includes('micro')) {
        const kw = Math.max(parseFloat(raw.kw) || 0.38, 0.1);
        return {
          ...base,
          category: 'microinverters',
          kw,
          type: String(raw.type || 'Microinversor').trim()
        };
      }

      // Por defecto: Módulos FV
      let wp = Math.max(parseFloat(raw.wp) || 450, 100);
      let l = parseFloat(raw.l) || 2.10;
      let w = parseFloat(raw.w) || 1.05;
      if (l > 100) l = l / 1000.0;
      if (w > 100) w = w / 1000.0;
      l = Math.max(1.2, Math.min(2.8, l));
      w = Math.max(0.8, Math.min(1.5, w));

      let voc = parseFloat(raw.voc) || 41.5;
      let isc = parseFloat(raw.isc) || 13.8;
      let vmp = parseFloat(raw.vmp) || (voc * 0.84);
      let imp = parseFloat(raw.imp) || (isc * 0.94);
      if (voc <= vmp) voc = vmp * 1.18;
      if (isc <= imp) isc = imp * 1.07;

      return {
        ...base,
        category: 'modules',
        wp: Math.round(wp),
        eff: parseFloat(raw.eff) || 21.5,
        l: parseFloat(l.toFixed(3)),
        w: parseFloat(w.toFixed(3)),
        th: parseFloat(raw.th) || 0.030,
        voc: parseFloat(voc.toFixed(1)),
        isc: parseFloat(isc.toFixed(2)),
        vmp: parseFloat(vmp.toFixed(1)),
        imp: parseFloat(imp.toFixed(2)),
        tempCoeffVoc: parseFloat(raw.tempCoeffVoc) || -0.26,
        tempCoeffPmax: parseFloat(raw.tempCoeffPmax) || -0.32,
        bifacial: Boolean(raw.bifacial),
        bifacialityFactor: parseFloat(raw.bifacialityFactor) || 0.80,
        weightKg: parseFloat(raw.weightKg) || 22.0,
        technology: String(raw.technology || 'N-Type TOPCon').trim()
      };
    },

    /**
     * Incorpora el equipo al catálogo oficial en caliente y sincroniza reactivamente
     */
    addToCatalog: function (item) {
      const catalog = (typeof window !== 'undefined' && window.equipmentCatalog)
        ? window.equipmentCatalog
        : ((typeof equipmentCatalog !== 'undefined') ? equipmentCatalog : null);

      if (!catalog) {
        if (typeof showToast === 'function') showToast('ERROR', 'No se encontró el catálogo de equipos activo.', 'error', 3000);
        return false;
      }

      const category = item.category || 'modules';
      if (category === 'wind_turbines' && typeof window !== 'undefined' && window.RAWindCatalog && typeof window.RAWindCatalog.upsert === 'function') {
        const turbine = window.RAWindCatalog.normalizeImportedTurbine(item);
        window.RAWindCatalog.upsert(turbine);
        if (typeof root.showStatus === 'function') {
          const _esc = (root.RASanitize && typeof root.RASanitize.plain === 'function') ? root.RASanitize.plain : (s => String(s || ''));
          root.showStatus('<i data-lucide="check-circle" class="icon-sm"></i> AEROGENERADOR INCORPORADO: ' + _esc(item.brand) + ' ' + _esc(item.model), 3500);
        }
        if (typeof showToast === 'function') {
          showToast('EQUIPO AÑADIDO', item.brand + ' ' + item.model + ' guardado en el catálogo eólico.', 'success', 3000);
        }
        if (typeof root.switchCatalogTab === 'function') {
          root.switchCatalogTab('wind_turbines');
        }
        return turbine.id;
      }
      if (!Array.isArray(catalog[category])) {
        catalog[category] = [];
      }

      const prefixMap = {
        modules: 'mod_web_',
        inverters: 'inv_web_',
        batteries: 'bat_web_',
        microinverters: 'mi_web_'
      };

      const finalId = (prefixMap[category] || 'eq_web_') + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
      const toSave = Object.assign({}, item, { id: finalId });

      catalog[category].push(toSave);

      // Persistir catálogo y sincronizar reactivamente
      if (typeof root.saveEquipmentCatalog === 'function') {
        root.saveEquipmentCatalog();
      }

      if (typeof root.showStatus === 'function') {
        const _esc = (root.RASanitize && typeof root.RASanitize.plain === 'function') ? root.RASanitize.plain : (s => String(s || ''));
        root.showStatus(`EQUIPO AÑADIDO: ${_esc(toSave.brand)} ${_esc(toSave.model)}`, 2500);
      }
      if (typeof root.showToast === 'function') {
        root.showToast('CATÁLOGO ACTUALIZADO', `${toSave.brand} ${toSave.model} incorporado correctamente.`, 'success', 3000);
      }

      // Si es un módulo y se desea activar en Paso 2
      if (category === 'modules' && typeof root.onSelectModuleFromDropdown === 'function') {
        root.onSelectModuleFromDropdown(finalId);
      }

      return finalId;
    },

    /**
     * Renderiza la interfaz principal del buscador web en el contenedor
     */
    renderUI: function (containerEl) {
      if (!containerEl) return;
      const apiKey = this.getApiKey();

      containerEl.innerHTML = `
        <div style="max-width:820px;margin:0 auto;color:#fff;">
          
          <!-- Cabecera del Buscador -->
          <div style="background:linear-gradient(135deg, rgba(167,139,250,0.15), rgba(56,189,248,0.1));border:1px solid rgba(167,139,250,0.3);border-radius:12px;padding:18px 22px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;gap:16px;">
            <div style="display:flex;align-items:center;gap:14px;">
              <div style="width:44px;height:44px;border-radius:10px;background:rgba(167,139,250,0.2);display:flex;align-items:center;justify-content:center;color:#c084fc;font-size:22px;flex-shrink:0;">
                <i data-lucide="globe" style="width:24px;height:24px;"></i>
              </div>
              <div>
                <div style="font-weight:900;font-size:14px;color:#fff;letter-spacing:0.5px;display:flex;align-items:center;gap:8px;">
                  BUSCADOR WEB DE EQUIPOS CON INTELIGENCIA ARTIFICIAL
                  <span style="background:rgba(167,139,250,0.25);color:#d8b4fe;font-size: 10px;padding:2px 7px;border-radius:4px;border:1px solid rgba(167,139,250,0.4);font-weight:bold;">GEMINI AI</span>
                </div>
                <div style="font-size:10.5px;color:var(--text-slate-400);margin-top:2px;line-height:1.4;">
                  Encuentra modelos comerciales reales en la red e incorpóralos al catálogo con especificaciones electrotécnicas completas (IEC 62548 / REBT).
                </div>
              </div>
            </div>
          </div>

          ${!apiKey ? `
            <div style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:8px;padding:12px 16px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
              <div style="display:flex;align-items:center;gap:10px;">
                <i data-lucide="alert-triangle" style="width:20px;height:20px;color:var(--amber-400);flex-shrink:0;"></i>
                <div>
                  <div style="font-size:11px;font-weight:bold;color:var(--amber-400);">Clave de API de Gemini no configurada</div>
                  <div style="font-size:10px;color:var(--text-slate-400);">Configura tu clave gratuita de Google AI Studio para habilitar las búsquedas web con IA.</div>
                </div>
              </div>
              <button class="doc-mini-btn" onclick="if(window.openCompanyBrandingModal) window.openCompanyBrandingModal();" style="border-color:var(--amber-400);color:var(--amber-400);padding:5px 12px;font-size:10.5px;white-space:nowrap;">Configurar Clave</button>
            </div>
          ` : ''}

          <!-- Formulario de Búsqueda -->
          <div style="background:#0b1120;border:1px solid #334155;border-radius:10px;padding:16px;margin-bottom:16px;box-shadow:0 4px 15px rgba(0,0,0,0.4);">
            <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
              
              <!-- Input de búsqueda -->
              <div style="flex:1;min-width:260px;position:relative;">
                <input type="text" id="ai-web-search-input" placeholder="Ej. Aiko Neostar 455W, Fronius Primo 6kW, BYD HVS 10.2, Huawei 5KTL..." 
                  style="width:100%;background:#030712;border:1px solid #475569;border-radius:6px;padding:10px 14px 10px 36px;color:#fff;font-size:12px;outline:none;box-sizing:border-box;">
                <i data-lucide="search" style="position:absolute;left:11px;top:10px;width:16px;height:16px;color:var(--text-slate-400);"></i>
              </div>

              <!-- Filtro de Categoría -->
              <div style="min-width:160px;">
                <select id="ai-web-search-cat" style="width:100%;background:#030712;border:1px solid #475569;border-radius:6px;padding:10px 12px;color:#fff;font-size:11.5px;outline:none;box-sizing:border-box;cursor:pointer;">
                  <option value="all">🔍 Todas las categorías</option>
                  <option value="modules">☀️ Módulos FV</option>
                  <option value="inverters">⚡ Inversores</option>
                  <option value="batteries">🔋 Baterías LFP</option>
                  <option value="microinverters">🎛️ Microinversores</option>
                  <option value="wind_turbines">💨 Aerogeneradores</option>
                </select>
              </div>

              <!-- Botón de Acción -->
              <button type="button" id="ai-web-search-btn" class="btn-action-primary" 
                style="padding:10px 20px;font-size:12px;font-weight:900;background:linear-gradient(135deg, #8B5CF6, #6366F1);border:none;border-radius:6px;color:#fff;cursor:pointer;display:inline-flex;align-items:center;gap:6px;box-shadow:0 2px 8px rgba(139,92,246,0.3);">
                <i data-lucide="sparkles" class="icon-sm"></i> BUSCAR CON IA
              </button>
            </div>

            <!-- Sugerencias Rápidas -->
            <div style="margin-top:12px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:10px;color:var(--text-slate-400);">
              <span style="font-weight:bold;color:var(--text-slate-300);">Sugerencias:</span>
              <button type="button" class="ai-quick-tag" data-q="Aiko Neostar 2S+ 455W">Aiko Neostar 455W</button>
              <button type="button" class="ai-quick-tag" data-q="Longi Hi-MO 6 430W Explorer">Longi Hi-MO 6</button>
              <button type="button" class="ai-quick-tag" data-q="Fronius Primo GEN24 6.0 Plus">Fronius GEN24 6kW</button>
              <button type="button" class="ai-quick-tag" data-q="Huawei SUN2000-5KTL-L1">Huawei 5KTL</button>
              <button type="button" class="ai-quick-tag" data-q="BYD Battery-Box HVS 10.2">BYD HVS 10.2</button>
              <button type="button" class="ai-quick-tag" data-q="Enphase IQ8HC">Enphase IQ8HC</button>
              <button type="button" class="ai-quick-tag" data-q="Bornay Wind 25.3">Bornay Wind 25.3</button>
              <button type="button" class="ai-quick-tag" data-q="Enair 30L 30kW">Enair 30L</button>
            </div>
          </div>

          <!-- Contenedor Dinámico: Loading / Resultados / Vacío -->
          <div id="ai-web-search-results-area">
            ${this.renderIdleState()}
          </div>

        </div>
      `;

      if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
      }

      this.bindEvents(containerEl);
    },

    renderIdleState: function () {
      return `
        <div style="border:2px dashed #1e293b;border-radius:10px;padding:36px 20px;text-align:center;background:rgba(15,23,42,0.4);">
          <div style="width:48px;height:48px;border-radius:50%;background:rgba(167,139,250,0.1);display:inline-flex;align-items:center;justify-content:center;color:#a78bfa;margin-bottom:12px;">
            <i data-lucide="search" style="width:22px;height:22px;"></i>
          </div>
          <div style="font-size:13px;font-weight:700;color:#fff;margin-bottom:6px;">Escribe una marca, modelo o tipo de equipo fotovoltaico</div>
          <div style="font-size:11px;color:var(--text-slate-400);max-width:500px;margin:0 auto;line-height:1.5;">
            La Inteligencia Artificial consultará los datos de ingeniería de los fabricantes líderes para extraer parámetros certificados de potencia, tensión, rendimiento y dimensiones.
          </div>
        </div>
      `;
    },

    _esc: function (str) {
      if (root.RASanitize && typeof root.RASanitize.plain === 'function') {
        return root.RASanitize.plain(str);
      }
      return String(str == null ? '' : str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    },

    renderLoadingState: function (query) {
      return `
        <div style="border:1px solid #334155;border-radius:10px;padding:40px 20px;text-align:center;background:rgba(15,23,42,0.7);box-shadow:0 8px 25px rgba(0,0,0,0.5);">
          <div class="modal-spinner" style="width:44px;height:44px;border:3px solid rgba(167,139,250,0.2);border-top-color:#a78bfa;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 16px auto;"></div>
          <div style="font-size:14px;font-weight:bold;color:#fff;margin-bottom:6px;">Buscando equipos comerciales en la red...</div>
          <div style="font-size:11.5px;color:#c084fc;font-weight:600;margin-bottom:8px;">"${this._esc(query)}"</div>
          <div style="font-size:10.5px;color:var(--text-slate-400);line-height:1.4;max-width:480px;margin:0 auto;">
            Extrayendo curvas IV, coeficientes térmicos, rangos MPPT y dimensiones físicas bajo estándares IEC 62548.
          </div>
        </div>
      `;
    },

    renderResultsList: function (results) {
      if (!Array.isArray(results) || results.length === 0) {
        return `
          <div style="border:1px solid rgba(239,68,68,0.25);border-radius:10px;padding:32px 20px;text-align:center;background:rgba(239,68,68,0.05);">
            <i data-lucide="info" style="width:32px;height:32px;color:var(--rose-400);margin-bottom:8px;"></i>
            <div style="font-size:13px;font-weight:bold;color:#fff;margin-bottom:6px;">No se encontraron modelos comerciales para esta búsqueda</div>
            <div style="font-size:11px;color:var(--text-slate-400);">Prueba a buscar por nombre de fabricante (ej. JA Solar, Fronius, BYD) o cambia el filtro de categoría.</div>
          </div>
        `;
      }

      const catBadges = {
        modules: { label: 'MÓDULO FV', color: '#F59E0B', bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.4)', icon: 'sun' },
        inverters: { label: 'INVERSOR', color: '#38BDF8', bg: 'rgba(56,189,248,0.15)', border: 'rgba(56,189,248,0.4)', icon: 'zap' },
        batteries: { label: 'BATERÍA LFP', color: '#10B981', bg: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.4)', icon: 'battery-charging' },
        microinverters: { label: 'MICROINVERSOR', color: '#A78BFA', bg: 'rgba(167,139,250,0.15)', border: 'rgba(167,139,250,0.4)', icon: 'cpu' },
        wind_turbines: { label: 'AEROGENERADOR', color: '#38BDF8', bg: 'rgba(56,189,248,0.15)', border: 'rgba(56,189,248,0.4)', icon: 'wind' }
      };

      const cardsHtml = results.map((item, idx) => {
        const cat = catBadges[item.category] || catBadges.modules;
        const _e = (v) => this._esc(v);

        let specsPills = '';
        if (item.category === 'modules') {
          specsPills = `
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin:10px 0;">
              <span class="ai-spec-pill"><i data-lucide="zap" class="icon-sm" style="color:var(--amber-400);"></i> <b>${_e(item.wp)} Wp</b></span>
              <span class="ai-spec-pill"><i data-lucide="percent" class="icon-sm" style="color:#38BDF8;"></i> ${_e(item.eff)}% STC</span>
              <span class="ai-spec-pill"><i data-lucide="maximize" class="icon-sm" style="color:#10B981;"></i> ${_e(item.l)}×${_e(item.w)} m</span>
              <span class="ai-spec-pill">Voc: ${_e(item.voc)}V · Isc: ${_e(item.isc)}A</span>
              <span class="ai-spec-pill" style="color:var(--text-slate-400);">${_e(item.technology || 'N-Type')}</span>
            </div>
          `;
        } else if (item.category === 'inverters') {
          specsPills = `
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin:10px 0;">
              <span class="ai-spec-pill" style="color:#38BDF8;"><i data-lucide="zap" class="icon-sm"></i> <b>${_e(item.kw)} kW</b></span>
              <span class="ai-spec-pill">MPPT: ${_e(item.mppt)} (${_e(item.inputsPerMppt || 1)} entr/canal)</span>
              <span class="ai-spec-pill">VdcMax: ${_e(item.vDcMax)}V</span>
              <span class="ai-spec-pill">Rango MPPT: ${_e(item.vMpptMin)}-${_e(item.vMpptMax)}V</span>
              <span class="ai-spec-pill">${_e(item.type)}</span>
            </div>
          `;
        } else if (item.category === 'batteries') {
          specsPills = `
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin:10px 0;">
              <span class="ai-spec-pill" style="color:#10B981;"><i data-lucide="battery" class="icon-sm"></i> <b>${_e(item.kwh)} kWh</b></span>
              <span class="ai-spec-pill">${_e(item.type)}</span>
            </div>
          `;
        } else if (item.category === 'wind_turbines') {
          const kw = (item.ratedPowerW ? (Number(item.ratedPowerW) / 1000).toFixed(1) : '?');
          specsPills = `
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin:10px 0;">
              <span class="ai-spec-pill" style="color:#38BDF8;"><i data-lucide="wind" class="icon-sm"></i> <b>${_e(kw)} kW</b></span>
              <span class="ai-spec-pill"><i data-lucide="circle-dot" class="icon-sm" style="color:#FBBF24;"></i> Ø ${_e(item.rotorDiameterM)}m</span>
              <span class="ai-spec-pill">Tipo: ${_e(item.type)}</span>
              <span class="ai-spec-pill">V.Nominal: ${_e(item.ratedSpeedMs)} m/s</span>
              <span class="ai-spec-pill">LwA: ${_e(item.acousticPowerLwaDba)} dBA</span>
            </div>
          `;
        } else if (item.category === 'microinverters') {
          specsPills = `
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin:10px 0;">
              <span class="ai-spec-pill" style="color:#A78BFA;"><i data-lucide="cpu" class="icon-sm"></i> <b>${_e(item.kw)} kW</b></span>
              <span class="ai-spec-pill">${_e(item.type)}</span>
            </div>
          `;
        }

        return `
          <div class="ai-result-card" data-idx="${idx}" style="background:#0f172a;border:1px solid #334155;border-radius:10px;padding:14px 16px;display:flex;flex-direction:column;justify-content:space-between;transition:transform 0.15s ease, border-color 0.15s ease;">
            <div>
              <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
                <div>
                  <span style="display:inline-flex;align-items:center;gap:4px;font-size: 10px;font-weight:bold;color:${cat.color};background:${cat.bg};border:1px solid ${cat.border};padding:2px 8px;border-radius:4px;margin-bottom:6px;text-transform:uppercase;">
                    <i data-lucide="${cat.icon}" class="icon-sm"></i> ${cat.label}
                  </span>
                  <div style="font-size:13px;font-weight:900;color:#fff;">${_e(item.brand)}</div>
                  <div style="font-size:11.5px;color:var(--text-slate-300);">${_e(item.model)}</div>
                </div>
                <div style="text-align:right;flex-shrink:0;">
                  <div style="font-size:13px;font-weight:bold;color:var(--amber-400);font-family:monospace;">~${_e(item.price)} €</div>
                  <div style="font-size: 10px;color:var(--text-slate-400);">PVP est.</div>
                </div>
              </div>

              ${specsPills}
            </div>

            <div style="display:flex;justify-content:flex-end;margin-top:10px;border-top:1px solid rgba(255,255,255,0.06);padding-top:10px;">
              <button type="button" class="btn-add-to-cat" data-idx="${idx}" style="background:var(--emerald-600);border:1px solid var(--emerald-400);color:#fff;font-size:10.5px;font-weight:bold;padding:6px 14px;border-radius:6px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:all 0.2s ease;">
                <i data-lucide="plus" class="icon-sm"></i> AÑADIR AL CATÁLOGO
              </button>
            </div>
          </div>
        `;
      }).join('');

      return `
        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <div style="font-size:12px;font-weight:bold;color:#fff;">
              Resultados de la búsqueda: <span style="color:#c084fc;">${results.length} modelos comerciales encontrados</span>
            </div>
            <button type="button" id="ai-web-search-clear" class="doc-mini-btn" style="font-size: 10px;color:var(--text-slate-400);">
              Limpiar resultados
            </button>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(360px, 1fr));gap:12px;">
            ${cardsHtml}
          </div>
        </div>
      `;
    },

    bindEvents: function (containerEl) {
      const input = containerEl.querySelector('#ai-web-search-input');
      const catSelect = containerEl.querySelector('#ai-web-search-cat');
      const btnSearch = containerEl.querySelector('#ai-web-search-btn');
      const resultsArea = containerEl.querySelector('#ai-web-search-results-area');

      const doSearch = async (term) => {
        const q = (term || (input ? input.value : '')).trim();
        if (!q) {
          if (typeof root.showToast === 'function') root.showToast('AVISO', 'Introduce un término de búsqueda para buscar equipos.', 'warning', 2500);
          return;
        }

        const cat = catSelect ? catSelect.value : 'all';
        this.state.isSearching = true;
        this.state.lastQuery = q;

        resultsArea.innerHTML = this.renderLoadingState(q);
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();

        try {
          const results = await this.searchOnline(q, cat);
          this.state.lastResults = results;
          resultsArea.innerHTML = this.renderResultsList(results);
          if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
          this.bindResultCardEvents(containerEl);
        } catch (err) {
          console.error('[RAEquipmentWebSearch] Error en búsqueda:', err);
          resultsArea.innerHTML = `
            <div style="border:1px solid rgba(239,68,68,0.3);border-radius:10px;padding:30px 20px;text-align:center;background:rgba(239,68,68,0.08);">
              <i data-lucide="alert-circle" style="width:36px;height:36px;color:var(--rose-400);margin-bottom:10px;"></i>
              <div style="font-size:14px;font-weight:bold;color:#fff;margin-bottom:6px;">Error en la búsqueda web con IA</div>
              <div style="font-size:11px;color:var(--text-slate-300);max-width:500px;margin:0 auto 16px auto;line-height:1.5;">${this._esc(err.message || 'No se pudo conectar con el servicio de IA.')}</div>
              <button type="button" id="ai-web-retry-btn" class="doc-mini-btn" style="border-color:#a78bfa;color:#c084fc;padding:6px 16px;font-weight:bold;font-size:11px;">
                <i data-lucide="rotate-cw" class="icon-sm"></i> Reintentar
              </button>
            </div>
          `;
          if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
          const retryBtn = resultsArea.querySelector('#ai-web-retry-btn');
          if (retryBtn) retryBtn.addEventListener('click', () => doSearch(q));
        } finally {
          this.state.isSearching = false;
        }
      };

      if (btnSearch) {
        btnSearch.addEventListener('click', () => doSearch());
      }
      if (input) {
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            doSearch();
          }
        });
      }

      // Sugerencias rápidas
      const quickTags = containerEl.querySelectorAll('.ai-quick-tag');
      quickTags.forEach(tag => {
        tag.addEventListener('click', () => {
          const q = tag.getAttribute('data-q');
          if (input) input.value = q;
          doSearch(q);
        });
      });
    },

    bindResultCardEvents: function (containerEl) {
      const resultsArea = containerEl.querySelector('#ai-web-search-results-area');
      if (!resultsArea) return;

      const clearBtn = resultsArea.querySelector('#ai-web-search-clear');
      if (clearBtn) {
        clearBtn.addEventListener('click', () => {
          this.state.lastResults = [];
          resultsArea.innerHTML = this.renderIdleState();
          if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
        });
      }

      const addButtons = resultsArea.querySelectorAll('.btn-add-to-cat');
      addButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.getAttribute('data-idx'), 10);
          const item = this.state.lastResults[idx];
          if (!item) return;

          const savedId = this.addToCatalog(item);
          if (savedId) {
            btn.innerHTML = '<i data-lucide="check" class="icon-sm"></i> ✓ INCORPORADO';
            btn.style.background = 'rgba(16,185,129,0.2)';
            btn.style.borderColor = '#10B981';
            btn.style.color = '#34D399';
            btn.disabled = true;
            btn.style.cursor = 'default';
            if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
          }
        });
      });
    }
  };

  // Estilos CSS complementarios inyectados dinámicamente si no existen
  function _ensureStyles() {
    if (document.getElementById('ra-equipment-web-search-styles')) return;
    const style = document.createElement('style');
    style.id = 'ra-equipment-web-search-styles';
    style.textContent = `
      .ai-quick-tag {
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 4px;
        color: var(--text-slate-300);
        padding: 2px 7px;
        cursor: pointer;
        font-size: 10px;
        transition: all 0.15s ease;
      }
      .ai-quick-tag:hover {
        background: rgba(167,139,250,0.2);
        border-color: #a78bfa;
        color: #fff;
      }
      .ai-spec-pill {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        background: #030712;
        border: 1px solid #1e293b;
        border-radius: 4px;
        padding: 3px 6px;
        font-size: 10px;
        color: var(--text-slate-300);
        font-family: monospace;
      }
      .ai-result-card:hover {
        border-color: #475569 !important;
        transform: translateY(-2px);
      }
    `;
    document.head.appendChild(style);
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', _ensureStyles);
    } else {
      _ensureStyles();
    }
  }

  // Exportar al namespace global
  root.RAEquipmentWebSearch = RAEquipmentWebSearch;
  if (!root.RA) root.RA = {};
  root.RA.EquipmentWebSearch = RAEquipmentWebSearch;

})(typeof window !== 'undefined' ? window : global);
