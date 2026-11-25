/**
 * RA — Comparador de Escenarios y UI del Árbol de Pérdidas (Extraído de app-main.js · F4-07)
 */
(function(window) {
  "use strict";

// ── COMPARADOR DE ESCENARIOS (Paso 5) ──
// E1: diseño actual · E2: microinversores (MLPE) · E3: optimización angular.
// Producción: runPhysicalModel + runPVsystCompatible POR FALDÓN (tilt/azimut propios).
// CAPEX: precios del catálogo. Rentabilidad: VAN 4% a 25 años + TIR por bisección.
function wpCompararEscenarios(triggerBtn) {
  const btn = triggerBtn || document.getElementById('btn-compare-scenarios');
  const runCompare = async () => {
    await new Promise(r => setTimeout(r, 20));
    _wpCompararEscenariosCore();
  };
  if (window.RA && typeof window.RA.withButtonLoading === 'function') {
    return window.RA.withButtonLoading(btn, 'Calculando escenarios...', runCompare);
  }
  return runCompare();
}

function _wpCompararEscenariosCore() {
  const container = document.getElementById('comparador-escenarios-container');
  if (!container) return;
  if (typeof WP === 'undefined' || !WP.polylines || WP.polylines.length === 0) {
    if (typeof showToast === 'function') showToast('SIN FALDONES', 'Genera primero el layout en el Paso 2.', 'warning', 3000);
    return;
  }

  const d = (typeof getProjectCalcs === 'function') ? getProjectCalcs() : {};
  const catalog = window.equipmentCatalog;
  const cfgS = window.solarProjectConfig;
  if (!catalog || !cfgS) return;
  const mod = catalog.modules.find(m => m.id === cfgS.selectedModuleId) || catalog.modules[0];
  const inv = catalog.inverters.find(i => i.id === cfgS.selectedInverterId) || catalog.inverters[0];
  const mi = catalog.microinverters.find(m => m.id === cfgS.selectedMicroinverterId) || catalog.microinverters[0];

  // faldones: conteo, tilt y azimut reales
  const tiltOptimal = Math.min(35, Math.max(15, Math.round(3.7 + 0.69 * Math.abs(d.latDeg || 40.4))));
  const faldones = WP.polylines.map(p => {
    const roofInfo = p.roofInfo || (typeof computeSinglePolylineRoofInfo === 'function' ? computeSinglePolylineRoofInfo(p.points, p) : null);
    return {
      paneles: roofInfo && roofInfo.panels ? roofInfo.panels.length : 0,
      tilt: (typeof p.modTilt === 'number') ? p.modTilt : (p.modTilt === 'auto' ? (roofInfo ? roofInfo.tiltDeg : 25) : parseFloat(p.modTilt) || 25),
      az: (typeof p.modAzimuth === 'number') ? p.modAzimuth : (roofInfo ? (roofInfo.azimuthN || 180) : 180)
    };
  });
  const totalPaneles = faldones.reduce((s, f) => s + f.paneles, 0);
  if (totalPaneles === 0) { if (typeof showToast === 'function') showToast('SIN PANELES', 'Regenera el layout (Paso 2).', 'warning', 3000); return; }

  const kwpPorPanel = (mod.wp || 450) / 1000;

  // producción por escenario: suma por faldón con los motores reales
  const producir = (variante) => {
    let kwhTotal = 0;
    faldones.forEach(f => {
      const kwpF = f.paneles * kwpPorPanel;
      const tiltS = variante === 'optimo' ? tiltOptimal : f.tilt;
      const azS = variante === 'optimo' ? 180 : f.az;
      const phys = (typeof runPhysicalModel === 'function') ? runPhysicalModel(kwpF, d.latDeg || 40.4, d.lonDeg || -3.7, tiltS, azS, { pAcNominalW: 0, azimuthConvention: 'compass' }) : { annualKWh: kwpF * 1450 };
      // PVsyst-compatible: el bypass por diodos depende de la topología (MLPE pierde menos con sombra)
      const lc = window.solarLossConfig || {};
      const esMlpe = variante === 'micros';
      const lossBypass = esMlpe ? (lc.bypassMlpe || 0.005) : (lc.bypass || 0.025);
      let kwh = phys.annualKWh;
      if (typeof runPVsystCompatible === 'function') {
        const pv = runPVsystCompatible(kwpF, d.latDeg || 40.4, d.lonDeg || -3.7, tiltS, azS, {}, phys);
        if (pv && pv.annualKWh) kwh = pv.annualKWh;
      } else {
        kwh = kwh * (1 - lossBypass);
      }
      kwhTotal += kwh;
    });
    return Math.round(kwhTotal);
  };

  // CAPEX de equipamiento por escenario (precios de catálogo)
  const invCountActual = (cfgS.autoSizing && cfgS.autoSizing.inverters && cfgS.autoSizing.inverters.count) || 1;
  const miRatio = ((mi.model || '') + (mi.type || '')).includes('4') ? 4 : 2;
  const miCount = Math.ceil(totalPaneles / miRatio);
  const capexInversores = invCountActual * (inv.price || 1100);
  const capexMicros = miCount * (mi.price || 175);
  const modPrecio = mod.price || d.cfg.precio || 125;
  const capexBase = totalPaneles * modPrecio + capexInversores;

  const scenarios = [
    { nombre: 'E1 · Diseño actual', desc: invCountActual + '× ' + inv.model, paneles: totalPaneles, kwp: totalPaneles * kwpPorPanel, kwh: producir('actual'), capexEq: capexBase },
    { nombre: 'E2 · Microinversores', desc: miCount + '× ' + mi.model, paneles: totalPaneles, kwp: totalPaneles * kwpPorPanel, kwh: producir('micros'), capexEq: totalPaneles * modPrecio + capexMicros },
    { nombre: 'E3 · Ángulo óptimo', desc: 'todos los faldones a ' + tiltOptimal + '° sur', paneles: totalPaneles, kwp: totalPaneles * kwpPorPanel, kwh: producir('optimo'), capexEq: capexBase }
  ];

  // rentabilidad: ahorro base del modelo financiero escalado por kWh; VAN 4% · TIR bisección
  const fin = (typeof calculateFinancialModel === 'function') ? (function() { try { return calculateFinancialModel(); } catch (e) { return null; } })() : null;
  const ahorroBase = fin ? fin.ahorroLuzAnio1 : 0;
  const kWhBase = scenarios[0].kwh || 1;
  // instalación fija (igual en todos los escenarios): est + bat + cab + mo + leg del presupuesto real
  const val = (id, def) => {
    const el = document.getElementById('modal-' + id) || document.getElementById(id);
    return el ? (parseFloat(el.value) || def) : def;
  };
  const instalacionFija = fin
    ? (fin.estCost + fin.batCost + fin.cabCost + fin.moCost + fin.legCost)
    : (val('cfg-pres-est', 450) + val('cfg-pres-bat', 0) + val('cfg-pres-cab', 350) + val('cfg-pres-mo', 1400) + val('cfg-pres-leg', 500));
  const marginFactor = 1 + ((fin && typeof fin.marginPct === 'number' ? fin.marginPct : 20) / 100.0);
  const ivaFactor = (fin && typeof fin.ivaRate === 'number' && isFinite(fin.ivaRate)) ? (1 + fin.ivaRate) : 1.21;

  scenarios.forEach(s => {
    s.ahorro = ahorroBase > 0 ? Math.round(ahorroBase * (s.kwh / kWhBase)) : Math.round(s.kwh * 0.15);
    // Si es E1 o E3 y disponemos de fin.capexBruto exacto, usarlo directamente para 100% coherencia con Paso 5
    if (fin && (s.nombre.indexOf('E1') === 0 || s.nombre.indexOf('E3') === 0)) {
      s.capex = Math.round(fin.capexBruto);
    } else {
      s.capex = Math.round((s.capexEq + instalacionFija) * marginFactor * ivaFactor);
    }
    // flujo 25 años con degradación 0.45%/año; VAN al 4%
    let van = -s.capex, flujo = s.ahorro;
    let npvLow = -0.1, npvHigh = 5.0, tir = null;
    const npv = (r) => { let v = -s.capex; for (let t = 1; t <= 25; t++) v += (s.ahorro * Math.pow(0.9955, t)) / Math.pow(1 + r, t); return v; };
    van = npv(0.04);
    const vLo = npv(npvLow), vHi = npv(npvHigh);
    if (vLo * vHi < 0) {
      let lo = npvLow, hi = npvHigh;
      for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; const v = npv(mid); if (v > 0) lo = mid; else hi = mid; tir = (lo + hi) / 2; }
    } else if (vHi > 0) {
      tir = 5.0; // Rentabilidad extraordinaria > 500%
    }
    s.van = Math.round(van);
    s.tir = tir != null ? (tir * 100) : null;
    s.tirString = tir != null ? (tir >= 5.0 ? '> 500%' : (tir * 100).toFixed(1) + '%') : (vHi > 0 ? '> 100%' : 'N/D');
    s.payback = s.ahorro > 0 ? (s.capex / s.ahorro) : Infinity;
  });

  // render de la tabla
  const mejor = [...scenarios].sort((a, b) => (b.van - a.van))[0];
  const fila = (s, mejorFlag) => `
    <tr style="background:${mejorFlag ? 'rgba(16,185,129,0.12)' : 'transparent'};border-bottom:1px solid rgba(255,255,255,0.06);">
      <td style="padding:5px 6px;font-weight:${mejorFlag ? '900' : '600'};color:${mejorFlag ? '#34D399' : '#E2E8F0'};">${s.nombre}${mejorFlag ? ' ★' : ''}</td>
      <td style="padding:5px 6px;text-align:right;color:var(--text-slate-300);">${s.kwh.toLocaleString('es-ES')}</td>
      <td style="padding:5px 6px;text-align:right;color:#FBBF24;">${s.capex.toLocaleString('es-ES')} €</td>
      <td style="padding:5px 6px;text-align:right;color:var(--text-slate-300);">${s.ahorro.toLocaleString('es-ES')} €</td>
      <td style="padding:5px 6px;text-align:right;color:${s.payback < 8 ? '#34D399' : '#FBBF24'};">${isFinite(s.payback) ? s.payback.toFixed(1) + ' a' : '—'}</td>
      <td style="padding:5px 6px;text-align:right;color:${s.van > 0 ? '#34D399' : '#F87171'};">${s.van.toLocaleString('es-ES')} €</td>
      <td style="padding:5px 6px;text-align:right;color:var(--text-slate-300);">${s.tirString || (s.tir != null ? s.tir.toFixed(1) + '%' : 'N/D')}</td>
    </tr>`;
  container.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size: 11px;">
      <thead><tr style="color:var(--text-slate-400);border-bottom:1px solid rgba(255,255,255,0.12);">
        <th style="text-align:left;padding:4px 6px;">Escenario</th>
        <th style="text-align:right;padding:4px 6px;">kWh/año</th>
        <th style="text-align:right;padding:4px 6px;">CAPEX</th>
        <th style="text-align:right;padding:4px 6px;">Ahorro/año</th>
        <th style="text-align:right;padding:4px 6px;">Payback</th>
        <th style="text-align:right;padding:4px 6px;">VAN 4%</th>
        <th style="text-align:right;padding:4px 6px;">TIR</th>
      </tr></thead>
      <tbody>${scenarios.map(s => fila(s, s === mejor)).join('')}</tbody>
    </table>
    <div style="font-size: 11px;color:#64748b;margin-top:5px;">
      ★ mejor VAN. CAPEX = equipamiento de catálogo + instalación fija. Ahorro escalado del modelo financiero por kWh producido. TIR a 25 años con degradación 0,45%/año.
    </div>`;
  container.style.display = 'block';
  if (typeof showToast === 'function') showToast('COMPARATIVA LISTA', 'Mejor VAN: ' + mejor.nombre, 'success', 3500);
  // Persistir para el anexo del PDF de memoria/presupuesto
  window.ultimoComparativo = {
    fecha: new Date().toLocaleDateString('es-ES'),
    lat: d.latDeg || 40.4,
    escenarios: scenarios.map(s => ({ nombre: s.nombre, desc: s.desc, kwh: s.kwh, capex: s.capex, ahorro: s.ahorro, payback: (isFinite(s.payback) ? s.payback : null), van: s.van, tir: s.tir }))
  };
  if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
}
window.wpCompararEscenarios = wpCompararEscenarios;

// ── UI del árbol de pérdidas configurables (Paso 4) ──
var RA_LOSS_FIELDS = [
  { key: 'soiling', label: 'Suciedad (soiling)' },
  { key: 'wiring', label: 'Óhmicas DC (cableado)' },
  { key: 'mismatch', label: 'Mismatch entre módulos' },
  { key: 'availability', label: 'Disponibilidad/paradas' },
  { key: 'iamAngular', label: 'IAM angular (incidencia)' },
  { key: 'spectral', label: 'Espectral' },
  { key: 'bypass', label: 'Bypass diodos (sin MLPE)' },
  { key: 'bypassMlpe', label: 'Bypass diodos (con MLPE)' }
];
function raApplyLossesRealtime() {
  if (typeof window !== 'undefined' && window.RAProduction && typeof window.RAProduction.clearCache === 'function') {
    window.RAProduction.clearCache();
  }
  if (typeof recalculateSolarYield === 'function') {
    try { recalculateSolarYield(); } catch (e) { console.warn('[RA-Losses] Error recalculando producción:', e); }
  }
  if (typeof window.dispatchEvent === 'function') {
    if (window.RA && window.RA.EventBus) {
      window.RA.EventBus.emit(window.RA.Events.PROJECT_UPDATED, { reason: 'losses_updated' });
    }
  }
}
window.raApplyLossesRealtime = raApplyLossesRealtime;

function raRenderLossFields() {
  const grid = document.getElementById('loss-fields-grid');
  if (!grid || typeof window.solarLossConfig === 'undefined') return;
  grid.innerHTML = RA_LOSS_FIELDS.map(f => {
    const pct = ((window.solarLossConfig[f.key] || 0) * 100);
    return '<div style="display:flex;align-items:center;justify-content:space-between;gap:4px;">' +
      '<span>' + f.label + '</span>' +
      '<input type="number" min="0" max="30" step="0.1" value="' + pct.toFixed(1) + '" ' +
        'oninput="raSetLossUI(\'' + f.key + '\', this.value, true)" ' +
        'onchange="raSetLossUI(\'' + f.key + '\', this.value, false)" ' +
        'style="width:52px;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.15);border-radius:4px;color:#FBBF24;font-size: 11px;padding:2px 4px;text-align:right;"> %</div>';
  }).join('');
  const total = RA_LOSS_FIELDS.reduce((s, f) => s + (window.solarLossConfig[f.key] || 0), 0);
  const totalEl = document.getElementById('loss-total-pct');
  if (totalEl) { totalEl.textContent = (total * 100).toFixed(1) + ' %'; totalEl.style.color = total > 0.14 ? '#F87171' : '#34D399'; }
}
function raSetLossUI(key, valPct, isLive) {
  if (typeof window.solarLossConfig === 'undefined') return;
  const v = parseFloat(valPct);
  if (isNaN(v) || v < 0) return;
  window.solarLossConfig[key] = v / 100;
  if (key === 'wiring') window.solarLossConfig.userCustomizedWiring = true;
  if (typeof window.raSaveLossConfig === 'function') window.raSaveLossConfig();
  
  const total = RA_LOSS_FIELDS.reduce((s, f) => s + (window.solarLossConfig[f.key] || 0), 0);
  const totalEl = document.getElementById('loss-total-pct');
  if (totalEl) { totalEl.textContent = (total * 100).toFixed(1) + ' %'; totalEl.style.color = total > 0.14 ? '#F87171' : '#34D399'; }
  
  raApplyLossesRealtime();
  if (!isLive && typeof showToast === 'function') showToast('PÉRDIDAS ACTUALIZADAS', 'Sincronizado en tiempo real con visor y cálculos.', 'info', 2000);
}
function raApplyLossPresetUI(key) {
  if (!key || typeof window.raApplyLossPreset !== 'function') return;
  window.raApplyLossPreset(key);
  raRenderLossFields();
  raApplyLossesRealtime();
  if (typeof showToast === 'function') showToast('PRESET APLICADO', 'Pérdidas del sistema actualizadas en tiempo real.', 'success', 2000);
}
function raResetLossesUI() {
  if (typeof window.raGetLossDefaults !== 'function') return;
  Object.assign(window.solarLossConfig, window.raGetLossDefaults());
  if (typeof window.raSaveLossConfig === 'function') window.raSaveLossConfig();
  raRenderLossFields();
  raApplyLossesRealtime();
  if (typeof showToast === 'function') showToast('VALORES POR DEFECTO', 'Restauradas pérdidas estándar.', 'info', 2000);
}
window.raSetLossUI = raSetLossUI;
window.raApplyLossPresetUI = raApplyLossPresetUI;
window.raResetLossesUI = raResetLossesUI;
window.raRenderLossFields = raRenderLossFields;
// Render inicial cuando la tarjeta esté en el DOM
setTimeout(raRenderLossFields, 1200);
})(typeof window !== "undefined" ? window : globalThis);
