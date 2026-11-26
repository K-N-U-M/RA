/**
 * @fileoverview Comparador de Escenarios A/B (Tarea 5.4 · FASE-5 UI/UX AAA).
 * Módulo desacoplado que captura instantáneas de `window.getProjectCalcs()`
 * y renderiza un modal limpio comparando Escenario A vs Escenario B lado a lado.
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'ra_scenario_comparator_v1';
  var MODAL_ID = 'ra-scenario-comparator-modal';
  var STYLE_ID = 'ra-scenario-comparator-style';
  var BTN_ID = 'ra-btn-compare-scenarios';

  var scenarios = {
    A: null,
    B: null
  };

  function loadFromStorage() {
    try {
      if (!global.localStorage) return;
      var raw = global.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        if (parsed.A) scenarios.A = parsed.A;
        if (parsed.B) scenarios.B = parsed.B;
      }
    } catch (e) {
      // Silencioso si localStorage no está disponible
    }
  }

  function persistToStorage() {
    try {
      if (!global.localStorage) return;
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(scenarios));
    } catch (e) {
      // Silencioso
    }
  }

  function toNum(val, fallback) {
    var n = Number(val);
    return Number.isFinite(n) ? n : (fallback !== undefined ? fallback : 0);
  }

  function captureSnapshot(slot, customName) {
    var d = {};
    if (typeof global.getProjectCalcs === 'function') {
      try {
        d = global.getProjectCalcs() || {};
      } catch (e) {
        d = {};
      }
    }

    var fin = (d && d.financials) || {};
    var kwp = toNum(d.kwp, 0);
    var annualKwh = toNum(d.annualKwh != null ? d.annualKwh : (d.annualProductionKwh != null ? d.annualProductionKwh : d.totalKwh), 0);
    var selfConsumptionPct = toNum(d.selfConsumptionPct != null ? d.selfConsumptionPct : (fin.selfConsumptionPct != null ? fin.selfConsumptionPct : d.autoconsumoPct), 0);
    var capex = toNum(d.capex != null ? d.capex : (fin.capex != null ? fin.capex : d.totalCapex), 0);
    var van = toNum(d.van != null ? d.van : (fin.van != null ? fin.van : d.npv), 0);
    var tir = toNum(d.tir != null ? d.tir : (fin.tir != null ? fin.tir : d.irr), 0);
    var payback = toNum(d.payback != null ? d.payback : (fin.payback != null ? fin.payback : d.paybackYears), 0);

    var defaultName = 'Escenario ' + slot;
    var name = (customName && String(customName).trim()) || (d.projectName && String(d.projectName).trim()) || defaultName;

    return {
      name: name,
      kwp: kwp,
      annualKwh: annualKwh,
      selfConsumptionPct: selfConsumptionPct,
      capex: capex,
      van: van,
      tir: tir,
      payback: payback,
      savedAt: new Date().toISOString()
    };
  }

  function saveScenario(slot, customName) {
    var key = String(slot || 'A').toUpperCase() === 'B' ? 'B' : 'A';
    scenarios[key] = captureSnapshot(key, customName);
    persistToStorage();
    renderModalBody();
    return scenarios[key];
  }

  function clearScenarios() {
    scenarios.A = null;
    scenarios.B = null;
    persistToStorage();
    renderModalBody();
  }

  function getScenarios() {
    return {
      A: scenarios.A ? Object.assign({}, scenarios.A) : null,
      B: scenarios.B ? Object.assign({}, scenarios.B) : null
    };
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmt(val, decimals, suffix) {
    if (val == null || !Number.isFinite(Number(val))) return '—';
    return Number(val).toLocaleString('es-ES', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }) + (suffix ? ' ' + suffix : '');
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '#' + MODAL_ID + ' { position: fixed; inset: 0; z-index: 99990; display: none; align-items: center; justify-content: center; background: rgba(2, 6, 23, 0.72); backdrop-filter: blur(4px); font-family: system-ui, -apple-system, sans-serif; }',
      '#' + MODAL_ID + '.open { display: flex; }',
      '#' + MODAL_ID + ' .ra-sc-card { width: min(760px, 94vw); max-height: 88vh; overflow: auto; background: #0f172a; color: #e2e8f0; border: 1px solid #334155; border-radius: 14px; box-shadow: 0 24px 60px rgba(0,0,0,0.55); padding: 20px 22px; }',
      '#' + MODAL_ID + ' .ra-sc-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 1px solid #1e293b; padding-bottom: 12px; margin-bottom: 14px; }',
      '#' + MODAL_ID + ' .ra-sc-title { margin: 0; font-size: 16px; font-weight: 700; color: #f8fafc; }',
      '#' + MODAL_ID + ' .ra-sc-close { background: transparent; border: 1px solid #334155; color: #94a3b8; border-radius: 8px; padding: 4px 10px; cursor: pointer; font-size: 14px; }',
      '#' + MODAL_ID + ' .ra-sc-close:hover { color: #f8fafc; border-color: #64748b; }',
      '#' + MODAL_ID + ' .ra-sc-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }',
      '#' + MODAL_ID + ' .ra-sc-btn { background: #1e293b; color: #e2e8f0; border: 1px solid #334155; border-radius: 8px; padding: 6px 12px; font-size: 12px; font-weight: 600; cursor: pointer; }',
      '#' + MODAL_ID + ' .ra-sc-btn:hover { background: #334155; }',
      '#' + MODAL_ID + ' .ra-sc-btn-primary { background: #0284c7; border-color: #0ea5e9; color: #ffffff; }',
      '#' + MODAL_ID + ' .ra-sc-btn-primary:hover { background: #0369a1; }',
      '#' + MODAL_ID + ' .ra-sc-table { width: 100%; border-collapse: collapse; font-size: 13px; }',
      '#' + MODAL_ID + ' .ra-sc-table th, #' + MODAL_ID + ' .ra-sc-table td { padding: 9px 10px; border-bottom: 1px solid #1e293b; text-align: left; }',
      '#' + MODAL_ID + ' .ra-sc-table th { color: #94a3b8; font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; }',
      '#' + MODAL_ID + ' .ra-sc-best { color: #34d399; font-weight: 700; }',
      '#' + MODAL_ID + ' .ra-sc-empty { padding: 20px; text-align: center; color: #94a3b8; font-size: 13px; background: #1e293b55; border-radius: 10px; }',
      '#' + BTN_ID + ' { position: fixed; bottom: 56px; right: 16px; z-index: 9990; background: rgba(15, 23, 42, 0.88); color: #e2e8f0; border: 1px solid #334155; border-radius: 999px; padding: 7px 13px; font-size: 12px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,0.35); backdrop-filter: blur(6px); }',
      '#' + BTN_ID + ':hover { background: #1e293b; border-color: #38bdf8; color: #ffffff; }'
    ].join('\n');
    document.head.appendChild(style);
  }

  function ensureModal() {
    injectStyles();
    var modal = document.getElementById(MODAL_ID);
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Comparador de Escenarios A/B');

    modal.innerHTML = [
      '<div class="ra-sc-card">',
      '  <div class="ra-sc-header">',
      '    <h3 class="ra-sc-title">Comparador de Escenarios (A vs B)</h3>',
      '    <button type="button" class="ra-sc-close" data-sc-close aria-label="Cerrar">✕</button>',
      '  </div>',
      '  <div class="ra-sc-actions">',
      '    <button type="button" class="ra-sc-btn ra-sc-btn-primary" data-sc-save="A">Guardar actual como A</button>',
      '    <button type="button" class="ra-sc-btn ra-sc-btn-primary" data-sc-save="B">Guardar actual como B</button>',
      '    <button type="button" class="ra-sc-btn" data-sc-clear>Limpiar</button>',
      '  </div>',
      '  <div id="ra-sc-body"></div>',
      '</div>'
    ].join('');

    modal.addEventListener('click', function (ev) {
      if (ev.target === modal || ev.target.closest('[data-sc-close]')) {
        closeModal();
        return;
      }
      var saveBtn = ev.target.closest('[data-sc-save]');
      if (saveBtn) {
        saveScenario(saveBtn.getAttribute('data-sc-save'));
        return;
      }
      if (ev.target.closest('[data-sc-clear]')) {
        clearScenarios();
      }
    });

    document.body.appendChild(modal);
    return modal;
  }

  function renderModalBody() {
    var body = document.getElementById('ra-sc-body');
    if (!body) return;

    var a = scenarios.A;
    var b = scenarios.B;

    if (!a && !b) {
      body.innerHTML = '<div class="ra-sc-empty">Guarda el diseño actual como <strong>Escenario A</strong> y luego realiza cambios para guardarlo como <strong>Escenario B</strong> y compararlos lado a lado.</div>';
      return;
    }

    var rows = [
      { label: 'Nombre', key: 'name', type: 'text' },
      { label: 'Potencia Pico', key: 'kwp', dec: 2, unit: 'kWp', better: 'max' },
      { label: 'Producción Anual', key: 'annualKwh', dec: 0, unit: 'kWh/año', better: 'max' },
      { label: 'Autoconsumo', key: 'selfConsumptionPct', dec: 1, unit: '%', better: 'max' },
      { label: 'CAPEX', key: 'capex', dec: 0, unit: '€', better: 'min' },
      { label: 'VAN', key: 'van', dec: 0, unit: '€', better: 'max' },
      { label: 'TIR', key: 'tir', dec: 1, unit: '%', better: 'max' },
      { label: 'Payback', key: 'payback', dec: 1, unit: 'años', better: 'min' }
    ];

    var html = '<table class="ra-sc-table"><thead><tr><th>Métrica</th><th>Escenario A</th><th>Escenario B</th></tr></thead><tbody>';
    rows.forEach(function (r) {
      var va = a ? a[r.key] : null;
      var vb = b ? b[r.key] : null;
      var clsA = '';
      var clsB = '';

      if (r.type !== 'text' && a && b && Number.isFinite(Number(va)) && Number.isFinite(Number(vb)) && Number(va) !== Number(vb)) {
        if (r.better === 'max') {
          if (Number(va) > Number(vb)) clsA = 'ra-sc-best'; else clsB = 'ra-sc-best';
        } else if (r.better === 'min') {
          if (Number(va) < Number(vb)) clsA = 'ra-sc-best'; else clsB = 'ra-sc-best';
        }
      }

      var dispA = a ? (r.type === 'text' ? escapeHtml(va) : fmt(va, r.dec, r.unit)) : '—';
      var dispB = b ? (r.type === 'text' ? escapeHtml(vb) : fmt(vb, r.dec, r.unit)) : '—';

      html += '<tr><td>' + escapeHtml(r.label) + '</td><td class="' + clsA + '">' + dispA + '</td><td class="' + clsB + '">' + dispB + '</td></tr>';
    });
    html += '</tbody></table>';
    body.innerHTML = html;
  }

  function openModal() {
    var modal = ensureModal();
    renderModalBody();
    modal.classList.add('open');
  }

  function closeModal() {
    var modal = document.getElementById(MODAL_ID);
    if (modal) modal.classList.remove('open');
  }

  function mountButton() {
    if (typeof document === 'undefined' || !document.body) return null;
    injectStyles();
    var existing = document.getElementById(BTN_ID);
    if (existing) return existing;

    var btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.type = 'button';
    btn.title = 'Comparar Escenarios A/B';
    btn.textContent = '⚖️ Comparar A/B';
    btn.addEventListener('click', openModal);
    document.body.appendChild(btn);
    return btn;
  }

  loadFromStorage();

  if (typeof document !== 'undefined') {
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') {
        var modal = document.getElementById(MODAL_ID);
        if (modal && modal.classList.contains('open')) {
          closeModal();
        }
      }
    });
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mountButton);
    } else {
      mountButton();
    }
  }

  global.RAScenarioComparator = {
    saveScenario: saveScenario,
    openModal: openModal,
    closeModal: closeModal,
    mountButton: mountButton,
    getScenarios: getScenarios,
    clearScenarios: clearScenarios
  };
})(typeof window !== 'undefined' ? window : globalThis);
