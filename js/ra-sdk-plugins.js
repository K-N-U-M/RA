/**
 * js/ra-sdk-plugins.js — Headless SDK (@ra/sdk), Plugin API Multi-País y Comparador Multi-Variante [F7-11]
 * ==========================================================================================================
 * Módulo UMD puro sin dependencias DOM ni Cesium:
 *  - Ejecutable en navegador (`window.RAEngine`) y en Node.js headless (`require('./packages/ra-sdk')`).
 *  - Contrato extensible de plugins normativos multi-país: ES (REBT), PT (RTIEBT), FR (NF C 15-100).
 *  - Comparador paralelo/lote de variantes (String, MLPE, Híbrido+BESS, Ampliado) con vista Diff lado a lado.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    var api = factory();
    root.RAEngine = api;
    root.RA = root.RA || {};
    root.RA.Engine = api;
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var _countryPlugins = {};

  function _num(v, fb) {
    var n = Number(v);
    return Number.isFinite(n) ? n : fb;
  }

  function registerCountryPlugin(code, plugin) {
    var key = String(code || '').toUpperCase().trim();
    if (!key || !plugin || typeof plugin !== 'object') return false;
    _countryPlugins[key] = Object.assign({ code: key }, plugin);
    return true;
  }

  // ── PLUGINS NORMATIVOS OFICIALES (ES · PT · FR) ─────────────────────────────
  registerCountryPlugin('ES', {
    name: 'España · REBT + RD 244/2019',
    standard: 'UNE-HD 60364-7-712 / ITC-BT-40',
    singlePhaseMaxKw: 5.0,
    projectThresholdAcKw: 10.0,
    maxDropDcPct: 1.5,
    maxDropAcPct: 1.5,
    defaultVatPct: 21,
    defaultEnergyPriceEurKwh: 0.175,
    defaultSurplusPriceEurKwh: 0.065,
    defaultYieldKwhKwp: 1520,
    checkCompliance: function (ctx) {
      var notes = [];
      if (ctx.acKw > this.projectThresholdAcKw) notes.push('Requiere Proyecto Técnico visado (>10 kW AC REBT).');
      else notes.push('Tramitable mediante Memoria Técnica de Diseño (MTD <= 10 kW AC).');
      if (ctx.phases === 1 && ctx.acKw > this.singlePhaseMaxKw) notes.push('Aviso RD 1699: supera 5 kW en conexión monofásica.');
      notes.push(ctx.rcmuIntegrated ? 'RCD Tipo A válido (inversor con RCMU 6 mA integrado).' : 'Obligatorio RCD Clase B en salida AC.');
      return notes;
    }
  });

  registerCountryPlugin('PT', {
    name: 'Portugal · RTIEBT + DL 15/2022 (UPAC)',
    standard: 'RTIEBT Secção 712 / DGEG UPAC',
    singlePhaseMaxKw: 6.9,
    projectThresholdAcKw: 30.0,
    maxDropDcPct: 1.5,
    maxDropAcPct: 1.5,
    defaultVatPct: 6,
    defaultEnergyPriceEurKwh: 0.195,
    defaultSurplusPriceEurKwh: 0.055,
    defaultYieldKwhKwp: 1580,
    checkCompliance: function (ctx) {
      var notes = [];
      if (ctx.acKw <= 0.7) notes.push('UPAC <= 700 W: isento de registo prévio DGEG.');
      else if (ctx.acKw <= this.projectThresholdAcKw) notes.push('UPAC <= 30 kW: sujeito a Comunicação Prévia DGEG + certificado inspeção.');
      else notes.push('UPAC > 30 kW: requer Registo e Certificado de Exploração DGEG.');
      notes.push('IVA reduzido 6% aplicável a aquisição/instalação FV residencial (OE Portugal).');
      return notes;
    }
  });

  registerCountryPlugin('FR', {
    name: 'Francia · NF C 15-100 / UTE C 15-712-1',
    standard: 'NF C 15-100 / Consuel Bleu',
    singlePhaseMaxKw: 6.0,
    projectThresholdAcKw: 36.0,
    maxDropDcPct: 1.0,
    maxDropAcPct: 3.0,
    defaultVatPct: 20,
    defaultEnergyPriceEurKwh: 0.225,
    defaultSurplusPriceEurKwh: 0.127,
    defaultYieldKwhKwp: 1240,
    checkCompliance: function (ctx) {
      var notes = [];
      if (ctx.phases === 1 && ctx.acKw > this.singlePhaseMaxKw) notes.push('Enedis: raccordement triphasé obligatoire au-delà de 6 kVA.');
      notes.push(ctx.kwp <= 3.0 ? 'TVA réduite 10% éligible (<= 3 kWc résidentiel > 2 ans).' : 'TVA standard 20% (> 3 kWc).');
      notes.push('Attestation Consuel + coupure d\'urgence AC/DC signalisée obligatoires.');
      return notes;
    }
  });

  function _computeIrr(capex, annualCf, years) {
    if (!(capex > 0) || !(annualCf > 0)) return null;
    var lo = -0.9, hi = 4.0;
    var npv = function (r) {
      var v = -capex;
      for (var y = 1; y <= years; y++) v += (annualCf * Math.pow(0.9955, y - 1)) / Math.pow(1 + r, y);
      return v;
    };
    if (npv(lo) < 0) return null;
    for (var i = 0; i < 42; i++) {
      var mid = (lo + hi) * 0.5;
      if (npv(mid) > 0) lo = mid; else hi = mid;
    }
    return Number((((lo + hi) * 50)).toFixed(1));
  }

  /**
   * Evaluación headless completa de un proyecto FV (< 5 ms, sin DOM ni Cesium).
   */
  function evaluate(projectJson, opts) {
    var t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    var p = projectJson || {};
    var o = opts || {};
    var countryCode = String(o.country || p.country || 'ES').toUpperCase();
    var plugin = _countryPlugins[countryCode] || _countryPlugins.ES;

    var numPanels = Math.max(0, Math.round(_num(p.numPanels, 0)));
    var modWp = _num(p.moduleWp, 450);
    var kwp = _num(p.kwp, (numPanels * modWp) / 1000.0);
    if (numPanels === 0 && kwp > 0) numPanels = Math.max(1, Math.round((kwp * 1000) / modWp));

    var acKw = _num(p.acKw, Math.max(1.5, Number((kwp * 0.88).toFixed(2))));
    var phases = _num(p.phases, acKw > plugin.singlePhaseMaxKw ? 3 : 1);
    var bessKwh = Math.max(0, _num(p.bessKwh, 0));
    var hasMlpe = Boolean(p.hasMlpe);
    var shadeLossPct = Math.max(0, Math.min(60, _num(p.shadeLossPct, 4.0)));
    var effectiveShadeLoss = hasMlpe ? shadeLossPct * 0.55 : shadeLossPct;

    var prBase = _num(p.prBase, 0.835);
    var prNet = Math.max(0.45, Math.min(0.92, prBase * (1 - effectiveShadeLoss / 100.0) * (hasMlpe ? 1.015 : 1.0)));
    var specificYield = _num(p.specificYieldKwhKwp, plugin.defaultYieldKwhKwp * (prNet / 0.81));
    var annualKwh = _num(p.annualKWh, Math.round(kwp * specificYield));

    var annualDemandKwh = _num(p.annualDemandKwh, Math.max(annualKwh * 1.15, 4500));
    var baseSelfRatio = bessKwh > 0 ? Math.min(0.90, 0.54 + (bessKwh / Math.max(5, kwp * 2.5)) * 0.28) : 0.56;
    var selfConsumedKwh = Math.min(annualKwh, Math.round(Math.min(annualDemandKwh * 0.92, annualKwh * baseSelfRatio)));
    var surplusKwh = Math.max(0, annualKwh - selfConsumedKwh);

    var ePrice = _num(p.energyPriceEurKwh, plugin.defaultEnergyPriceEurKwh);
    var sPrice = _num(p.surplusPriceEurKwh, plugin.defaultSurplusPriceEurKwh);
    var year1SavingsEur = Math.round(selfConsumedKwh * ePrice + surplusKwh * sPrice);

    var unitCapexEurWp = kwp > 50 ? 0.78 : (kwp > 15 ? 0.95 : 1.18);
    var capexNet = _num(p.capexEur, Math.round(kwp * 1000 * unitCapexEurWp + bessKwh * 480 + (hasMlpe ? numPanels * 48 : 0)));
    var vatPct = _num(p.vatPct, plugin.defaultVatPct);
    var capexGross = Math.round(capexNet * (1 + vatPct / 100.0));

    var opexYear = Math.max(40, Math.round(kwp * 11));
    var netAnnualCf = Math.max(1, year1SavingsEur - opexYear);
    var horizon = 25;
    var discountRate = 0.04;
    var npv = -capexGross;
    var totalKwh25 = 0;
    for (var y = 1; y <= horizon; y++) {
      var deg = Math.pow(0.9955, y - 1);
      totalKwh25 += annualKwh * deg;
      npv += (netAnnualCf * deg * Math.pow(1.02, y - 1)) / Math.pow(1 + discountRate, y);
    }
    var irrPct = _computeIrr(capexGross, netAnnualCf, horizon);
    var paybackYears = netAnnualCf > 0 ? Number((capexGross / netAnnualCf).toFixed(1)) : null;
    var lcoeEurKwh = totalKwh25 > 0 ? Number(((capexGross + opexYear * horizon) / totalKwh25).toFixed(4)) : null;

    var compliance = typeof plugin.checkCompliance === 'function'
      ? plugin.checkCompliance({ kwp: kwp, acKw: acKw, phases: phases, rcmuIntegrated: Boolean(p.rcmuIntegrated) })
      : [];

    var t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

    return {
      country: plugin.code,
      regulation: plugin.name,
      standard: plugin.standard,
      numPanels: numPanels,
      kwp: Number(kwp.toFixed(2)),
      acKw: Number(acKw.toFixed(2)),
      phases: phases,
      bessKwh: bessKwh,
      hasMlpe: hasMlpe,
      prPct: Number((prNet * 100).toFixed(1)),
      annualKwh: Math.round(annualKwh),
      selfConsumedKwh: selfConsumedKwh,
      surplusKwh: surplusKwh,
      capexNetEur: capexNet,
      capexGrossEur: capexGross,
      vatPct: vatPct,
      year1SavingsEur: year1SavingsEur,
      npv25Eur: Math.round(npv),
      irrPct: irrPct,
      paybackYears: paybackYears,
      lcoeEurKwh: lcoeEurKwh,
      complianceNotes: compliance,
      elapsedMs: Number((t1 - t0).toFixed(2))
    };
  }

  /**
   * Extrae instantánea normalizada del proyecto activo en navegador (o devuelve defaults limpios).
   */
  function snapshotFromBrowser() {
    if (typeof window === 'undefined') return { kwp: 10, numPanels: 22, moduleWp: 450, shadeLossPct: 6 };
    var calcs = null;
    try { if (typeof window.getProjectCalcs === 'function') calcs = window.getProjectCalcs(); } catch (_) {}
    var cfg = window.solarProjectConfig || {};
    var panels = Array.isArray(window.allRenderedPanels)
      ? window.allRenderedPanels.filter(function (p) { return p && !p.isGhost && !p.deleted && !p.disabled; })
      : [];
    var avgShade = panels.length > 0
      ? panels.reduce(function (s, p) { return s + (Number(p.annualLossPct) || (p.isShaded ? 12 : 0)); }, 0) / panels.length
      : 5.0;

    return {
      numPanels: (calcs && calcs.numPanels) || panels.length || 20,
      kwp: (calcs && calcs.P_dc_kW) || 9.0,
      acKw: (calcs && calcs.P_ac_kW) || 8.0,
      annualKWh: (calcs && calcs.annualKWh) || undefined,
      bessKwh: (calcs && calcs.battery && calcs.battery.totalKwh) || 0,
      hasMlpe: cfg.selectedTopology === 'optimizer',
      shadeLossPct: Number(avgShade.toFixed(1))
    };
  }

  /**
   * Comparador Multi-Variante con Diff lado a lado.
   */
  function compareVariants(baseProject, countryCode) {
    var base = baseProject || snapshotFromBrowser();
    var cc = countryCode || base.country || 'ES';
    var variants = [
      { label: '1. Base String Puro', patch: { hasMlpe: false, bessKwh: 0 } },
      { label: '2. Con Optimizadores MLPE', patch: { hasMlpe: true, bessKwh: 0, annualKWh: undefined } },
      { label: '3. Híbrido + BESS 10 kWh', patch: { hasMlpe: false, bessKwh: Math.max(10, base.bessKwh || 10), annualKWh: undefined } },
      { label: '4. Ampliación +25% Campo', patch: { kwp: Number((base.kwp * 1.25).toFixed(2)), numPanels: Math.round((base.numPanels || 20) * 1.25), acKw: Number((base.acKw * 1.25).toFixed(2)), annualKWh: undefined } }
    ];

    var results = variants.map(function (v) {
      var merged = Object.assign({}, base, v.patch);
      var ev = evaluate(merged, { country: cc });
      return Object.assign({ variantLabel: v.label }, ev);
    });

    var ref = results[0];
    results.forEach(function (r) {
      r.deltaNpvEur = r.npv25Eur - ref.npv25Eur;
      r.deltaSavingsEur = r.year1SavingsEur - ref.year1SavingsEur;
    });
    return results;
  }

  return {
    version: '1.0.0',
    registerCountryPlugin: registerCountryPlugin,
    listCountryPlugins: function () { return Object.keys(_countryPlugins).map(function (k) { return _countryPlugins[k]; }); },
    evaluate: evaluate,
    snapshotFromBrowser: snapshotFromBrowser,
    compareVariants: compareVariants
  };
}));
