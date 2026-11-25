/**
 * js/pvsyst-pan-ond-parser.js — Importador Nativo de Archivos .PAN y .OND (PVsyst) [F7-07]
 * ========================================================================================
 * Parsea ficheros técnicos oficiales de fabricantes en formato PVsyst (.PAN para módulos FV
 * y .OND para inversores), normaliza coeficientes térmicos (mV/°C o %/°C) y añade el equipo
 * directamente al catálogo canónico `window.equipmentCatalog`.
 */
(function (global) {
  'use strict';

  function _parseKeyValueLines(rawText) {
    var map = Object.create(null);
    var lines = String(rawText || '').split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line || line.startsWith('#') || line.startsWith('//') || line.startsWith('PVObject_') || line.startsWith('End of')) continue;
      var eqIdx = line.indexOf('=');
      if (eqIdx <= 0) continue;
      var key = line.slice(0, eqIdx).trim();
      var val = line.slice(eqIdx + 1).trim();
      if (!(key in map)) map[key] = val;
    }
    return map;
  }

  function _num(map, keys, fallback) {
    for (var i = 0; i < keys.length; i++) {
      var raw = map[keys[i]];
      if (raw !== undefined && raw !== '') {
        var parsed = parseFloat(String(raw).replace(',', '.'));
        if (Number.isFinite(parsed)) return parsed;
      }
    }
    return fallback;
  }

  function _str(map, keys, fallback) {
    for (var i = 0; i < keys.length; i++) {
      var raw = map[keys[i]];
      if (raw && String(raw).trim()) return String(raw).trim();
    }
    return fallback;
  }

  /**
   * Parsea un archivo .PAN (módulo fotovoltaico PVsyst) a contrato de catálogo RA.
   */
  function parsePanFile(text, filename) {
    var kv = _parseKeyValueLines(text);
    var brand = _str(kv, ['Manufacturer', 'Brand'], 'Fabricante PVsyst');
    var model = _str(kv, ['Model', 'Comment'], (filename || 'Modulo').replace(/\.pan$/i, ''));
    var wp = _num(kv, ['PNom', 'Pnom'], 0);
    var vmp = _num(kv, ['Vmp', 'Vmpp'], 0);
    var imp = _num(kv, ['Imp', 'Impp'], 0);
    var voc = _num(kv, ['Voc'], 0);
    var isc = _num(kv, ['Isc'], 0);
    if (!(wp > 0) && vmp > 0 && imp > 0) wp = Math.round(vmp * imp);
    if (!(wp > 0) || !(voc > 0) || !(isc > 0)) {
      throw new Error('El archivo .PAN no contiene parámetros eléctricos mínimos (PNom, Voc, Isc).');
    }

    var widthM = _num(kv, ['Width'], 1.134);
    var heightM = _num(kv, ['Height'], 1.762);
    if (widthM > 20) widthM = widthM / 1000;
    if (heightM > 20) heightM = heightM / 1000;
    var weightKg = _num(kv, ['Weight'], 21.5);
    var bifaciality = _num(kv, ['BifacialityFactor'], 0);

    // Coeficientes térmicos: PVsyst expresa muVocSpec en mV/°C y muPmpReq en %/°C
    var muVocMv = _num(kv, ['muVocSpec'], NaN);
    var tempCoeffVoc = Number.isFinite(muVocMv) && voc > 0
      ? Number(((muVocMv / 1000 / voc) * 100).toFixed(3))
      : -0.26;
    if (tempCoeffVoc > 0) tempCoeffVoc = -tempCoeffVoc;

    var muPmpPct = _num(kv, ['muPmpReq', 'mPmpp'], -0.30);
    if (typeof global.normalizeThermalCoeff === 'function') {
      muPmpPct = global.normalizeThermalCoeff(muPmpPct, -0.30);
    }

    var area = widthM * heightM;
    var eff = area > 0 ? Number(((wp / (area * 1000)) * 100).toFixed(1)) : 21.5;
    var safeId = 'pan_' + (brand + '_' + model).toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 36) + '_' + Date.now().toString(36).slice(-4);

    return {
      category: 'modules',
      item: {
        id: safeId,
        brand: brand,
        model: model,
        wp: Math.round(wp),
        vmp: Number((vmp || voc * 0.83).toFixed(2)),
        imp: Number((imp || (wp / Math.max(vmp || voc * 0.83, 1))).toFixed(2)),
        voc: Number(voc.toFixed(2)),
        isc: Number(isc.toFixed(2)),
        w: Number(Math.min(widthM, heightM).toFixed(3)),
        l: Number(Math.max(widthM, heightM).toFixed(3)),
        eff: eff,
        weight: Number(weightKg.toFixed(1)),
        tempCoeffVoc: tempCoeffVoc,
        tempCoeffPmax: Number(muPmpPct.toFixed(3)),
        bifacial: bifaciality > 0.1,
        bifaciality: Number(bifaciality.toFixed(2)),
        ncels: _num(kv, ['NCelS'], 108),
        nbDiode: _num(kv, ['NbDiode'], 3),
        rShunt: _num(kv, ['RShunt'], 400),
        rSerie: _num(kv, ['RSerie'], 0.25),
        price: Math.round(wp * 0.22),
        source: 'PVsyst .PAN'
      }
    };
  }

  /**
   * Parsea un archivo .OND (inversor PVsyst) a contrato de catálogo RA.
   */
  function parseOndFile(text, filename) {
    var kv = _parseKeyValueLines(text);
    var brand = _str(kv, ['Manufacturer', 'Brand'], 'Fabricante PVsyst');
    var model = _str(kv, ['Model', 'Comment'], (filename || 'Inversor').replace(/\.ond$/i, ''));
    var kwNom = _num(kv, ['PNomConv', 'PMaxOUT'], 0);
    if (kwNom > 1000) kwNom = kwNom / 1000; // W -> kW si viene en W
    if (!(kwNom > 0)) {
      throw new Error('El archivo .OND no contiene potencia nominal válida (PNomConv).');
    }

    var vMpptMin = _num(kv, ['VMppMin'], 120);
    var vMpptMax = _num(kv, ['VMPPMax'], 850);
    var vAbsMax = _num(kv, ['VAbsMax', 'VMaxAbs'], Math.max(1000, vMpptMax + 100));
    var iMaxDc = _num(kv, ['IMaxDC', 'IMaxDC_MPPT'], 16);
    var nbMppt = Math.max(1, Math.round(_num(kv, ['NbMPPT'], 2)));
    var nbInputs = Math.max(nbMppt, Math.round(_num(kv, ['NbInputs'], nbMppt)));
    var effMax = _num(kv, ['EfficMax', 'EuroEta'], 98.0);
    var phaseRaw = _str(kv, ['ModeOper', 'Phase', 'Tri'], '');
    var isThreePhase = /tri|3/i.test(phaseRaw) || kwNom > 6.5;
    var safeId = 'ond_' + (brand + '_' + model).toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 36) + '_' + Date.now().toString(36).slice(-4);

    return {
      category: 'inverters',
      item: {
        id: safeId,
        brand: brand,
        model: model,
        kw: Number(kwNom.toFixed(2)),
        phases: isThreePhase ? 3 : 1,
        type: isThreePhase ? 'Trifásico 400V' : 'Monofásico 230V',
        mppt: nbMppt,
        inputsPerMppt: Math.max(1, Math.round(nbInputs / nbMppt)),
        mpptMin: Math.round(vMpptMin),
        mpptMax: Math.round(vMpptMax),
        vDcMax: Math.round(vAbsMax),
        maxDcV: Math.round(vAbsMax),
        iMaxMppt: Number(iMaxDc.toFixed(1)),
        iMaxScA: Number((iMaxDc * 1.25).toFixed(1)),
        eff: Number(effMax.toFixed(1)),
        maxOverload: 1.35,
        price: Math.round(650 + kwNom * 115),
        source: 'PVsyst .OND'
      }
    };
  }

  function importTextFile(text, filename) {
    var lower = String(filename || '').toLowerCase();
    var res = (lower.endsWith('.ond') || /PVObject_=pvGInverter|PNomConv=/i.test(text))
      ? parseOndFile(text, filename)
      : parsePanFile(text, filename);

    var cat = global.equipmentCatalog;
    if (cat && Array.isArray(cat[res.category])) {
      cat[res.category].unshift(res.item);
      if (typeof global.saveEquipmentCatalog === 'function') global.saveEquipmentCatalog();
      if (typeof global.populateEquipmentModalUI === 'function') global.populateEquipmentModalUI();
      if (typeof global.populateHardwareSelectors === 'function') global.populateHardwareSelectors();
      if (typeof global.switchCatalogTab === 'function') global.switchCatalogTab(res.category);
    }
    return res;
  }

  function triggerFileImport() {
    if (typeof document === 'undefined') return;
    var inp = document.getElementById('ra-pvsyst-file-input');
    if (!inp) {
      inp = document.createElement('input');
      inp.id = 'ra-pvsyst-file-input';
      inp.type = 'file';
      inp.accept = '.pan,.ond,.PAN,.OND,.txt';
      inp.style.display = 'none';
      inp.addEventListener('change', function (ev) {
        var file = ev.target.files && ev.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          try {
            var res = importTextFile(String(reader.result || ''), file.name);
            var label = res.category === 'modules'
              ? (res.item.brand + ' ' + res.item.model + ' (' + res.item.wp + ' Wp)')
              : (res.item.brand + ' ' + res.item.model + ' (' + res.item.kw + ' kW · ' + res.item.mppt + ' MPPT)');
            if (typeof global.showToast === 'function') {
              global.showToast('PVSYST IMPORTADO', label + ' añadido al catálogo oficial.', 'success', 4200);
            }
          } catch (err) {
            if (typeof global.raAlert === 'function') {
              global.raAlert('No se pudo importar ' + file.name + ': ' + (err.message || err), 'error');
            }
          } finally {
            inp.value = '';
          }
        };
        reader.readAsText(file);
      });
      document.body.appendChild(inp);
    }
    inp.click();
  }

  function injectCatalogButton() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('cat-tab-btn-pvsyst_import')) return;
    var aiBtn = document.getElementById('cat-tab-btn-ai_import');
    if (!aiBtn || !aiBtn.parentNode) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'cat-tab-btn-pvsyst_import';
    btn.className = 'cat-nav-pill cat-nav-action';
    btn.style.cssText = 'color:#34D399;border-color:rgba(16,185,129,0.45);background:rgba(16,185,129,0.12);';
    btn.title = 'Importar ficha oficial de módulo (.PAN) o inversor (.OND) en formato PVsyst';
    btn.innerHTML = '<i data-lucide="file-up" class="icon-sm"></i> .PAN / .OND';
    btn.addEventListener('click', triggerFileImport);
    aiBtn.parentNode.insertBefore(btn, aiBtn.nextSibling);
    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      try { global.lucide.createIcons({ root: btn }); } catch (_) {}
    }
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectCatalogButton);
    else injectCatalogButton();
  }

  var api = {
    parsePanFile: parsePanFile,
    parseOndFile: parseOndFile,
    importTextFile: importTextFile,
    triggerFileImport: triggerFileImport
  };
  global.RAPVsystImport = api;
  global.RA = global.RA || {};
  global.RA.PVsystImport = api;
})(typeof window !== 'undefined' ? window : globalThis);
