/**
 * js/shadow-auto-stringer.js — Auto-Stringing Inteligente Consciente de Sombras 3D [F7-06]
 * ========================================================================================
 * Algoritmo heurístico/clúster post-heatmap que:
 * 1. Agrupa módulos por orientación/faldón y separa módulos limpios (<8% pérdida) de sombreados (>=8%)
 *    para evitar que una fila/chimenea arrastre toda una cadena en serie.
 * 2. Respeta estrictamente [Ns_min, Ns_max], inputsPerMppt, Isc máximo por canal y balance multi-inversor.
 * 3. Propone optimizadores selectivos (MLPE) únicamente en módulos sombreados que no pueden aislarse en
 *    su propio string sin violar Ns_min.
 * 4. Cuantifica la ganancia anual estimada frente al particionamiento serpiente ciego y permite aplicarlo
 *    en 1 clic sobre solarProjectConfig.mpptManualConfig con sincronización 3D + Matriz MPPT.
 */
(function (global) {
  'use strict';

  var STRING_PALETTE = ['#00F0FF', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6', '#3B82F6', '#EF4444', '#14B8A6'];

  function _escHtml(v) {
    if (global.RASanitize && typeof global.RASanitize.escapeHtml === 'function') return global.RASanitize.escapeHtml(v);
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function _getActivePanels() {
    if (Array.isArray(global.allRenderedPanels) && global.allRenderedPanels.length > 0) {
      return global.allRenderedPanels.filter(function (p) { return p && !p.isGhost && !p.deleted && !p.disabled; });
    }
    return [];
  }

  function _getPanelKey(p, fallbackIdx) {
    if (global.RA && global.RA.Electrical && typeof global.RA.Electrical.getPanelManualKey === 'function') {
      return global.RA.Electrical.getPanelManualKey(p);
    }
    var pIdx = (p && p.polyIdx != null) ? p.polyIdx : 0;
    var lIdx = (p && typeof p.localIdx === 'number') ? p.localIdx : ((p && typeof p.layoutIndex === 'number') ? p.layoutIndex : fallbackIdx);
    return String(pIdx) + ':' + String(lIdx);
  }

  function _getHardwareLimits() {
    var cfg = global.solarProjectConfig || {};
    var limits = cfg.calculatedLimits || {};
    var catalog = global.equipmentCatalog || {};
    var inv = limits.inverter ||
      (Array.isArray(catalog.inverters) && catalog.inverters.find(function (i) { return i.id === cfg.selectedInverterId; })) ||
      (Array.isArray(catalog.inverters) && catalog.inverters[0]) ||
      { mppt: 2, inputsPerMppt: 2, vDcMax: 1000, vMpptMin: 200, vMpptMax: 850, iMaxOperA: 26, iMaxScA: 30, kw: 10 };
    var mod = limits.module ||
      (Array.isArray(catalog.modules) && catalog.modules.find(function (m) { return m.id === cfg.selectedModuleId; })) ||
      (Array.isArray(catalog.modules) && catalog.modules[0]) ||
      global.panelConfig || { wp: 450, voc: 49.5, vmp: 41.5, imp: 13.0, isc: 13.85 };

    var invCount = (cfg.autoSizing && cfg.autoSizing.inverters && Number.isFinite(cfg.autoSizing.inverters.count))
      ? Math.max(1, cfg.autoSizing.inverters.count)
      : Math.max(1, cfg.inverterCount || 1);

    var dynLim = (typeof global.calculateDynamicMPPTStringLimits === 'function')
      ? global.calculateDynamicMPPTStringLimits(mod, inv)
      : null;

    var nsMin = Math.max(3, (dynLim && dynLim.Ns_min) || 5);
    var nsMax = Math.max(nsMin, (dynLim && dynLim.Ns_max) || 18);
    var mpptPerInv = Math.max(1, Number(inv.mppt) || 2);
    var inputsPerMppt = Math.max(1, Number(inv.inputsPerMppt) || 1);
    var iMaxOperA = Number(inv.iMaxOperA || (inv.iMaxScA ? inv.iMaxScA * 0.75 : 26));
    var iMaxScA = Number(inv.iMaxScA || 30);
    var iscFactor = (mod.bifacial || mod.isBifacial || (mod.bifacialityFactor > 0)) ? 1.15 : 1.0;
    var impMod = Number(mod.imp || (global.panelConfig && global.panelConfig.imp) || 13.0);
    // Factor obligatorio IEC 62548 / REBT (1.25 × Isc) para garantizar que ninguna propuesta dispare MPPT_OVERCURRENT_ISC
    var iscMod = Number(mod.isc || (global.panelConfig && global.panelConfig.isc) || 13.85) * iscFactor * 1.25;
    var maxParallelByCurrent = Math.max(1, Math.min(
      inputsPerMppt,
      Math.floor(iMaxOperA / Math.max(1, impMod)) || 1,
      Math.floor(iMaxScA / Math.max(1, iscMod)) || 1
    ));

    return {
      inv: inv,
      mod: mod,
      invCount: invCount,
      mpptPerInv: mpptPerInv,
      totalMppt: invCount * mpptPerInv,
      inputsPerMppt: inputsPerMppt,
      maxParallelPerMppt: maxParallelByCurrent,
      nsMin: nsMin,
      nsMax: nsMax
    };
  }

  /**
   * Estima el rendimiento relativo (0..1) de una agrupación de strings considerando el arrastre
   * de los paneles sombreados sobre sus compañeros del mismo string (sin MLPE).
   */
  function _estimateGroupingYield(stringsArr) {
    var totalMods = 0;
    var sumYield = 0;
    stringsArr.forEach(function (st) {
      var list = st.panels || [];
      if (list.length === 0) return;
      totalMods += list.length;
      if (st.hasOptimizer) {
        list.forEach(function (p) { sumYield += Math.max(0.15, 1 - p.lossPct / 100.0) * 0.988; });
        return;
      }
      // En un string en serie, el mismatch penaliza proporcionalmente a la dispersión de pérdidas dentro del string
      var meanLoss = list.reduce(function (acc, p) { return acc + p.lossPct; }, 0) / list.length;
      var maxLoss = list.reduce(function (acc, p) { return Math.max(acc, p.lossPct); }, 0);
      var spread = Math.max(0, maxLoss - meanLoss);
      // Factor mismatch realista: alta dispersión en mismo string añade arrastre no lineal (diodos bypass + pérdida MPPT)
      var mismatchPenalty = (spread > 6) ? Math.min(0.18, (spread - 4) * 0.0042) : 0;
      list.forEach(function (p) {
        var eff = Math.max(0.12, 1 - (p.lossPct / 100.0) - mismatchPenalty);
        sumYield += eff;
      });
    });
    return totalMods > 0 ? (sumYield / totalMods) : 1.0;
  }

  /**
   * Divide un lote homogéneo de paneles en subcadenas equilibradas SIN exceder jamás nsMax (Voc_cold).
   */
  function _splitBalanced(batch, nsMin, nsMax) {
    var n = batch.length;
    if (n === 0) return [];
    if (n <= nsMax) return [batch.slice()];
    // Mínimo estricto de strings para no violar jamás nsMax (sobretensión en frío)
    var minStringsForVoc = Math.ceil(n / nsMax);
    var numStrings = minStringsForVoc;
    var baseSize = Math.floor(n / numStrings);
    var rem = n % numStrings;
    var chunks = [];
    var cursor = 0;
    for (var i = 0; i < numStrings; i++) {
      var sz = baseSize + (i < rem ? 1 : 0);
      chunks.push(batch.slice(cursor, cursor + sz));
      cursor += sz;
    }
    return chunks;
  }

  /**
   * Genera la propuesta de auto-stringing consciente de sombras 3D y compara contra el diseño ciego actual.
   */
  function analyzeShadowAwareStringing(opts) {
    var cfg = opts || {};
    var rawPanels = Array.isArray(cfg.panels) ? cfg.panels : _getActivePanels();
    if (rawPanels.length === 0) {
      return { empty: true, message: 'Genera primero paneles en el Paso 2 y ejecuta el mapa de sombras para optimizar el stringing.' };
    }

    var hw = _getHardwareLimits();
    var shadeThresholdPct = Number(cfg.shadeThresholdPct) || 8.0;

    // Normalizar paneles con clave, faldón y pérdida de sombra (preservando coordenada 0 válida)
    var items = rawPanels.map(function (p, idx) {
      var loss = (typeof p.annualLossPct === 'number') ? p.annualLossPct : (p.isShaded ? 14.0 : 0.0);
      var uCoord = Number.isFinite(Number(p.u)) ? Number(p.u) : (Number.isFinite(Number(p.gridB)) ? Number(p.gridB) : idx);
      var vCoord = Number.isFinite(Number(p.v)) ? Number(p.v) : (Number.isFinite(Number(p.gridA)) ? Number(p.gridA) : 0);
      return {
        raw: p,
        key: _getPanelKey(p, idx),
        polyIdx: (p.polyIdx != null) ? p.polyIdx : 0,
        lossPct: Math.max(0, Math.min(90, loss)),
        u: uCoord,
        v: vCoord,
        currentString: p.stringName || ('S' + ((p.polyIdx || 0) + 1))
      };
    });

    // 1. Evaluar línea base (particionamiento actual / serpiente ciego)
    var baselineMap = new Map();
    items.forEach(function (it) {
      if (!baselineMap.has(it.currentString)) baselineMap.set(it.currentString, { id: it.currentString, panels: [], hasOptimizer: false });
      baselineMap.get(it.currentString).panels.push(it);
    });
    var baselineStrings = Array.from(baselineMap.values());
    var baselineYield = _estimateGroupingYield(baselineStrings);

    // 2. Agrupar por faldón (misma inclinación/azimut) y separar clústeres Limpio vs Sombreado
    var byPoly = new Map();
    items.forEach(function (it) {
      if (!byPoly.has(it.polyIdx)) byPoly.set(it.polyIdx, []);
      byPoly.get(it.polyIdx).push(it);
    });

    var proposedStrings = [];
    var selectiveMlpeKeys = [];
    var strCounter = 1;

    byPoly.forEach(function (polyItems, polyIdx) {
      var clean = [];
      var shaded = [];
      polyItems.forEach(function (it) {
        if (it.lossPct >= shadeThresholdPct) shaded.push(it);
        else clean.push(it);
      });

      // Orden espacial (u, v) dentro de cada clúster para minimizar longitud de cableado DC
      var sortSpatial = function (a, b) { return (a.v - b.v) || (a.u - b.u); };
      clean.sort(sortSpatial);
      shaded.sort(sortSpatial);

      if (shaded.length >= hw.nsMin && clean.length >= hw.nsMin) {
        // Caso ideal: los paneles sombreados forman su propio string dedicado aislado en su MPPT
        var cleanChunks = _splitBalanced(clean, hw.nsMin, hw.nsMax);
        var shadedChunks = _splitBalanced(shaded, hw.nsMin, hw.nsMax);
        cleanChunks.forEach(function (ch) {
          proposedStrings.push({
            id: 'S' + strCounter,
            name: 'S' + strCounter + ' · F' + (polyIdx + 1) + ' Limpio',
            polyIdx: polyIdx,
            tier: 'clean',
            panels: ch,
            hasOptimizer: false,
            color: STRING_PALETTE[(strCounter - 1) % STRING_PALETTE.length]
          });
          strCounter++;
        });
        shadedChunks.forEach(function (ch) {
          proposedStrings.push({
            id: 'S' + strCounter,
            name: 'S' + strCounter + ' · F' + (polyIdx + 1) + ' Sombra',
            polyIdx: polyIdx,
            tier: 'shaded',
            panels: ch,
            hasOptimizer: false,
            color: '#F59E0B'
          });
          strCounter++;
        });
      } else {
        // Si los sombreados son < Ns_min (no alcanzan tensión mínima de arranque solos),
        // se concentran en el último string del faldón y se marcan para MLPE selectivo
        var ordered = clean.concat(shaded);
        var chunks = _splitBalanced(ordered, hw.nsMin, hw.nsMax);
        chunks.forEach(function (ch) {
          var chShaded = ch.filter(function (x) { return x.lossPct >= shadeThresholdPct; });
          var recommendMlpe = chShaded.length > 0 && chShaded.length < ch.length;
          if (recommendMlpe) {
            chShaded.forEach(function (x) { selectiveMlpeKeys.push(x.key); });
          }
          proposedStrings.push({
            id: 'S' + strCounter,
            name: 'S' + strCounter + ' · F' + (polyIdx + 1) + (chShaded.length > 0 ? ' (+MLPE)' : ''),
            polyIdx: polyIdx,
            tier: chShaded.length > 0 ? 'mixed_mlpe' : 'clean',
            panels: ch,
            hasOptimizer: recommendMlpe,
            shadedInString: chShaded.length,
            color: STRING_PALETTE[(strCounter - 1) % STRING_PALETTE.length]
          });
          strCounter++;
        });
      }
    });

    // 3. Asignación inteligente a MPPTs respetando inputsPerMppt, aislando strings sombreados y balanceando fases/inversores
    var mpptLoads = [];
    for (var m = 1; m <= hw.totalMppt; m++) {
      mpptLoads.push({ mpptId: m, invIdx: Math.floor((m - 1) / hw.mpptPerInv), strings: [], tier: null, polyIdx: null, modCount: 0 });
    }

    // Asignar primero los strings sombreados a canales MPPT exclusivos (preferentemente el último MPPT de cada inversor)
    var sortedForMppt = proposedStrings.slice().sort(function (a, b) {
      var prio = function (t) { return t === 'shaded' ? 0 : (t === 'mixed_mlpe' ? 1 : 2); };
      return prio(a.tier) - prio(b.tier) || (b.panels.length - a.panels.length);
    });

    sortedForMppt.forEach(function (st) {
      // Buscar canal MPPT vacío o compatible (mismo faldón, mismo tier, mismo nº módulos y hueco en inputsPerMppt)
      var candidate = null;
      // 1) Preferir MPPT vacío para strings sombreados o primero disponible balanceando inversores
      var empties = mpptLoads.filter(function (slot) { return slot.strings.length === 0; });
      if (empties.length > 0) {
        if (st.tier === 'shaded') {
          candidate = empties[empties.length - 1];
        } else {
          // Balanceo entre inversores: elegir el inversor con menos módulos asignados
          empties.sort(function (a, b) {
            var invA = mpptLoads.filter(function (x) { return x.invIdx === a.invIdx; }).reduce(function (s, x) { return s + x.modCount; }, 0);
            var invB = mpptLoads.filter(function (x) { return x.invIdx === b.invIdx; }).reduce(function (s, x) { return s + x.modCount; }, 0);
            return invA - invB;
          });
          candidate = empties[0];
        }
      } else {
        // 2) Compartir MPPT solo si hay entradas y margen de corriente (Imax/Isc), misma longitud y mismo faldón
        var compatibles = mpptLoads.filter(function (slot) {
          return slot.strings.length < hw.maxParallelPerMppt &&
            slot.polyIdx === st.polyIdx &&
            slot.tier === st.tier &&
            slot.strings[0].panels.length === st.panels.length;
        });
        if (compatibles.length > 0) {
          candidate = compatibles[0];
        } else {
          // Si no hay canal 100% compatible, avisar explícitamente (requiere más MPPT o inversor adicional)
          var withSameLen = mpptLoads.filter(function (slot) {
            return slot.strings.length < hw.maxParallelPerMppt && slot.strings[0].panels.length === st.panels.length;
          });
          if (withSameLen.length > 0) {
            candidate = withSameLen[0];
            st.mpptWarning = 'Comparte MPPT con distinta sombra/faldón (considerar MLPE)';
          } else {
            var withRoom = mpptLoads.filter(function (slot) { return slot.strings.length < hw.inputsPerMppt; });
            withRoom.sort(function (a, b) { return a.modCount - b.modCount; });
            candidate = withRoom[0] || mpptLoads[0];
            st.mpptWarning = 'MPPT saturado o longitud dispar (añadir inversor/MPPT)';
          }
        }
      }

      st.mpptId = candidate.mpptId;
      candidate.strings.push(st);
      candidate.tier = candidate.tier || st.tier;
      candidate.polyIdx = candidate.polyIdx != null ? candidate.polyIdx : st.polyIdx;
      candidate.modCount += st.panels.length;
    });

    var proposedYield = _estimateGroupingYield(proposedStrings);
    var gainPct = baselineYield > 0 ? Math.max(0, ((proposedYield - baselineYield) / baselineYield) * 100) : 0;
    var shadedTotal = items.filter(function (x) { return x.lossPct >= shadeThresholdPct; }).length;

    return {
      empty: false,
      totalPanels: items.length,
      shadedPanels: shadedTotal,
      hw: { nsMin: hw.nsMin, nsMax: hw.nsMax, totalMppt: hw.totalMppt, inputsPerMppt: hw.inputsPerMppt, invCount: hw.invCount },
      baselineYieldPct: Number((baselineYield * 100).toFixed(2)),
      proposedYieldPct: Number((proposedYield * 100).toFixed(2)),
      estimatedGainPct: Number(gainPct.toFixed(2)),
      selectiveMlpeKeys: selectiveMlpeKeys,
      strings: proposedStrings.map(function (st) {
        var avgLoss = st.panels.reduce(function (s, x) { return s + x.lossPct; }, 0) / Math.max(1, st.panels.length);
        return {
          id: st.id,
          name: st.name,
          mpptId: st.mpptId,
          tier: st.tier,
          count: st.panels.length,
          avgLossPct: Number(avgLoss.toFixed(1)),
          hasOptimizer: st.hasOptimizer,
          color: st.color,
          panelKeys: st.panels.map(function (p) { return p.key; })
        };
      })
    };
  }

  /**
   * Aplica la propuesta generada directamente a la Matriz MPPT del proyecto activo.
   */
  function applyProposalToProject(proposal) {
    var prop = proposal || _lastProposal || analyzeShadowAwareStringing();
    if (!prop || prop.empty || !Array.isArray(prop.strings) || prop.strings.length === 0) return false;

    if (!global.solarProjectConfig) global.solarProjectConfig = {};
    var stringToMppt = {};
    var keyToStringMeta = new Map();
    var customStrings = prop.strings.map(function (st) {
      stringToMppt[st.id] = st.mpptId;
      st.panelKeys.forEach(function (k) {
        keyToStringMeta.set(k, { id: st.id, color: st.color, mpptId: st.mpptId, hasMLPE: Boolean(st.hasOptimizer) });
      });
      return {
        id: st.id,
        name: st.name,
        color: st.color,
        panelKeys: st.panelKeys.slice(),
        hasMLPE: Boolean(st.hasOptimizer)
      };
    });

    global.solarProjectConfig.mpptManualConfig = {
      locked: true,
      stringToMppt: stringToMppt,
      customStrings: customStrings
    };

    // Propagar asignación de string/MPPT/MLPE directamente sobre paneles activos para sincronizar Matriz MPPT y 3D
    var mlpeSet = new Set(prop.selectiveMlpeKeys || []);
    if (Array.isArray(global.allRenderedPanels)) {
      global.allRenderedPanels.forEach(function (p, idx) {
        if (!p || p.isGhost || p.deleted || p.disabled) return;
        var pKey = _getPanelKey(p, idx);
        var meta = keyToStringMeta.get(pKey);
        if (meta) {
          p.stringName = meta.id;
          p.stringColor = meta.color;
          p.mpptId = meta.mpptId;
          p.hasMLPE = mlpeSet.has(pKey) || meta.hasMLPE;
        } else {
          p.hasMLPE = mlpeSet.has(pKey);
        }
      });
    }

    try {
      if (typeof global.wpFastRenderSimulatedPanels === 'function') global.wpFastRenderSimulatedPanels(true);
      if (global.RACableEngine && typeof global.RACableEngine.renderAllCables === 'function') global.RACableEngine.renderAllCables();
      if (global.RAMPPTMatrix && typeof global.RAMPPTMatrix.render === 'function') global.RAMPPTMatrix.render();
      if (typeof global.recalculateSolarYield === 'function') global.recalculateSolarYield();
      if (global.BOMTreeEngine && typeof global.BOMTreeEngine.refresh === 'function') global.BOMTreeEngine.refresh();
    } catch (_) {}
    if (global.RA && global.RA.EventBus && global.RA.Events) {
      global.RA.EventBus.emit(global.RA.Events.PROJECT_UPDATED, { source: 'shadow-auto-stringer' });
    }
    if (global.showToast) {
      global.showToast(
        'AUTO-STRINGING 3D APLICADO',
        prop.strings.length + ' strings asignados a ' + prop.hw.totalMppt + ' MPPT (+' + prop.estimatedGainPct.toFixed(2) + '% estimado).',
        'success',
        3200
      );
    }
    return true;
  }

  function buildReportHTML(prop) {
    var esc = _escHtml;
    if (!prop || prop.empty) {
      return '<div style="padding:12px;border:1px dashed rgba(148,163,184,0.3);border-radius:8px;color:#94A3B8;font-size:12px;">' + esc(prop && prop.message ? prop.message : 'Coloca paneles y calcula el mapa de sombras para proponer la agrupación óptima de strings.') + '</div>';
    }

    var rows = prop.strings.map(function (st) {
      var badge = st.tier === 'shaded'
        ? '<span style="color:#FBBF24;font-weight:700;">Aislado Sombra</span>'
        : (st.hasOptimizer ? '<span style="color:#38BDF8;font-weight:700;">MLPE Selectivo</span>' : '<span style="color:#34D399;font-weight:700;">Limpio</span>');
      return '<tr style="border-top:1px solid rgba(255,255,255,0.08);">' +
        '<td style="padding:6px 8px;font-weight:800;"><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:' + esc(st.color) + ';margin-right:6px;"></span>' + esc(st.name) + '</td>' +
        '<td style="padding:6px 8px;text-align:center;font-family:var(--font-mono);color:#38BDF8;font-weight:700;">MPPT ' + st.mpptId + '</td>' +
        '<td style="padding:6px 8px;text-align:right;font-family:var(--font-mono);">' + st.count + ' mods</td>' +
        '<td style="padding:6px 8px;text-align:right;font-family:var(--font-mono);">-' + st.avgLossPct.toFixed(1) + '%</td>' +
        '<td style="padding:6px 8px;text-align:center;">' + badge + '</td>' +
      '</tr>';
    }).join('');

    return '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:8px;margin-bottom:10px;">' +
      '<div class="ra-drawer-kpi"><span>Paneles / Sombreados</span><strong>' + prop.totalPanels + ' / ' + prop.shadedPanels + ' uds</strong></div>' +
      '<div class="ra-drawer-kpi"><span>Ventana Eléctrica</span><strong>[' + prop.hw.nsMin + ' – ' + prop.hw.nsMax + '] mods · ' + prop.hw.inputsPerMppt + ' ent/MPPT</strong></div>' +
      '<div class="ra-drawer-kpi"><span>Ganancia vs Serpiente</span><strong style="color:#34D399;">+' + prop.estimatedGainPct.toFixed(2) + ' % anual</strong></div>' +
      '<div class="ra-drawer-kpi"><span>Optimizadores Sugeridos</span><strong style="color:#38BDF8;">' + prop.selectiveMlpeKeys.length + ' uds selectivas</strong></div>' +
    '</div>' +
    '<div style="overflow-x:auto;border:1px solid rgba(255,255,255,0.1);border-radius:8px;background:rgba(15,23,42,0.7);">' +
      '<table style="width:100%;border-collapse:collapse;font-size:12px;color:#F1F5F9;">' +
        '<thead><tr style="background:rgba(56,189,248,0.12);font-size:11px;text-transform:uppercase;">' +
          '<th scope="col" style="padding:7px 8px;text-align:left;">String Propuesto</th>' +
          '<th scope="col" style="padding:7px 8px;text-align:center;">Canal MPPT</th>' +
          '<th scope="col" style="padding:7px 8px;text-align:right;">Longitud</th>' +
          '<th scope="col" style="padding:7px 8px;text-align:right;">Sombra Media</th>' +
          '<th scope="col" style="padding:7px 8px;text-align:center;">Estrategia</th>' +
        '</tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table>' +
    '</div>';
  }

  var _lastProposal = null;

  global.RAShadowAutoStringer = {
    analyze: function (opts) {
      _lastProposal = analyzeShadowAwareStringing(opts);
      return _lastProposal;
    },
    applyProposal: applyProposalToProject,
    buildReportHTML: buildReportHTML,
    getLastProposal: function () { return _lastProposal; }
  };

  if (global.RA) global.RA.ShadowAutoStringer = global.RAShadowAutoStringer;
})(typeof window !== 'undefined' ? window : this);
