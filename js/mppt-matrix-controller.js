/**
 * ============================================================================
 * RA - CONTROLADOR INTERACTIVO DE MATRIZ INVERSOR / MPPT / STRINGS (FASE 4)
 * ============================================================================
 * Archivo: js/mppt-matrix-controller.js
 * Rol: Supervisión manual y libertad total de diseño de strings por inversor
 *      y canal MPPT: arrastrar/soltar, fusión multi-faldón, división a medida,
 *      pincel 3D sobre placas, inversión de polaridad, renombrado/color,
 *      optimizadores por string, equilibrado rápido, semáforo eléctrico y
 *      resaltado bidireccional en el visor 3D Cesium.
 * ============================================================================
 */
(function (root) {
  'use strict';

  let _rafId = null;
  let _delegatedBound = false;
  let _escapeBound = false;
  let _isSyncing = false;
  let _highlightEntities = [];
  let _selectedStrings = new Set();
  let _draggingString = null;
  let _brushString = null;
  let _splitEditorString = null;
  let _splitEditorCount = null;
  let _renameEditorString = null;
  let _renameDraft = '';

  function escapeHtml(str) {
    return window.RASanitize.escapeHtml(str);
  }

  function normalizeHexColor(hex, fallback) {
    if (typeof hex === 'string' && /^#[0-9a-fA-F]{6}$/.test(hex.trim())) {
      return hex.trim();
    }
    return fallback || '#00F0FF';
  }

  function pickPaletteColor(index) {
    if (typeof root.getPolylineStringColor === 'function') {
      return normalizeHexColor(root.getPolylineStringColor(index), '#38BDF8');
    }
    const fallback = ['#00F0FF', '#F59E0B', '#10B981', '#EC4899', '#8B5CF6', '#3B82F6', '#EF4444'];
    return fallback[index % fallback.length];
  }

  function ensureManualConfig() {
    if (!root.solarProjectConfig) root.solarProjectConfig = {};
    if (!root.solarProjectConfig.mpptManualConfig || typeof root.solarProjectConfig.mpptManualConfig !== 'object') {
      root.solarProjectConfig.mpptManualConfig = {
        locked: false,
        stringToMppt: {},
        customStrings: []
      };
    }
    const mc = root.solarProjectConfig.mpptManualConfig;
    if (!mc.stringToMppt || typeof mc.stringToMppt !== 'object') mc.stringToMppt = {};
    if (!Array.isArray(mc.customStrings)) mc.customStrings = [];
    return mc;
  }

  function getActivePanels() {
    if (Array.isArray(root.allRenderedPanels) && root.allRenderedPanels.length > 0) {
      return root.allRenderedPanels.filter(p => p && !p.isGhost && !p.deleted && !p.disabled);
    }
    if (root.WP && Array.isArray(root.WP.polylines)) {
      const collected = [];
      root.WP.polylines.forEach((pl, polyIdx) => {
        const arr = (pl && pl.roofInfo && Array.isArray(pl.roofInfo.panels))
          ? pl.roofInfo.panels
          : (pl && Array.isArray(pl.panels) ? pl.panels : null);
        if (arr) {
          arr.forEach((p, idx) => {
            if (!p || p.isGhost || p.deleted || p.disabled) return;
            collected.push(Object.assign({ polyIdx: polyIdx, localIdx: idx }, p));
          });
        }
      });
      return collected;
    }
    return [];
  }

  function getPanelKey(p) {
    if (root.RA && root.RA.Electrical && typeof root.RA.Electrical.getPanelManualKey === 'function') {
      return root.RA.Electrical.getPanelManualKey(p);
    }
    const pIdx = (p && p.polyIdx != null) ? p.polyIdx : 0;
    const lIdx = (p && typeof p.localIdx === 'number')
      ? p.localIdx
      : ((p && typeof p.layoutIndex === 'number') ? p.layoutIndex : ((p && typeof p.pIdx === 'number') ? p.pIdx : 0));
    return String(pIdx) + ':' + String(lIdx);
  }

  function getHardwareContext() {
    const cfg = root.solarProjectConfig || {};
    const limits = cfg.calculatedLimits || {};
    const catalog = root.equipmentCatalog || null;
    const inv = limits.inverter ||
      (catalog && Array.isArray(catalog.inverters) && catalog.inverters.find(i => i.id === cfg.selectedInverterId)) ||
      (catalog && Array.isArray(catalog.inverters) && catalog.inverters[0]) ||
      { brand: 'Inversor', model: 'Estándar', kw: 5, mppt: 2, inputsPerMppt: 1, vDcMax: 1000, vMpptMin: 200, vMpptMax: 850, iMaxOperA: 15, iMaxScA: 20 };

    const mod = limits.module ||
      (catalog && Array.isArray(catalog.modules) && catalog.modules.find(m => m.id === cfg.selectedModuleId)) ||
      (catalog && Array.isArray(catalog.modules) && catalog.modules[0]) ||
      (root.panelConfig || {});

    const invCount = (cfg.autoSizing && cfg.autoSizing.inverters && Number.isFinite(cfg.autoSizing.inverters.count))
      ? Math.max(1, cfg.autoSizing.inverters.count)
      : Math.max(1, cfg.inverterCount || 1);

    const mpptPerInv = Math.max(1, Number(inv.mppt) || 2);
    const inputsPerMppt = Math.max(1, Number(inv.inputsPerMppt) || 1);

    let dynLim = null;
    if (typeof root.calculateDynamicMPPTStringLimits === 'function') {
      dynLim = root.calculateDynamicMPPTStringLimits(mod, inv);
    }

    const modWp = Number(mod.wp || mod.potencia || mod.power || 450);
    const vocColdPerMod = dynLim ? dynLim.vocCold : (Number(mod.voc || 49.5) * 1.10);
    const vmpHotPerMod = dynLim ? dynLim.vmpHot : (Number(mod.vmp || 41.5) * 0.85);
    const impMod = Number(mod.imp || (root.panelConfig && root.panelConfig.imp) || 13.0);
    const iscMod = Number(mod.isc || (root.panelConfig && root.panelConfig.isc) || 13.8);

    return {
      cfg,
      inv,
      mod,
      invCount,
      mpptPerInv,
      totalMppt: invCount * mpptPerInv,
      inputsPerMppt,
      hasOptimizer: cfg.selectedTopology === 'optimizer',
      modWp,
      vocColdPerMod,
      vmpHotPerMod,
      impMod,
      iscMod,
      invVmax: Number(inv.vDcMax || inv.vMax || 1000),
      invVmpptMin: Number(inv.vMpptMin || inv.vMpptNomMin || 200),
      invVmpptMax: Number(inv.vMpptMax || inv.vMpptNomMax || 850),
      invImaxOper: Number(inv.iMaxOperA || (inv.iMaxScA ? inv.iMaxScA * 0.75 : 26)),
      invImaxSc: Number(inv.iMaxScA || 0),
      iscChannelFactor: (mod.bifacial || mod.isBifacial || (mod.bifacialityFactor > 0)) ? 1.15 : 1.0,
      invKw: Number(inv.kw || 5)
    };
  }

  function buildStringsMap(panels, hw) {
    const map = new Map();
    const order = [];
    const polylines = (root.WP && Array.isArray(root.WP.polylines)) ? root.WP.polylines : [];
    const mc = ensureManualConfig();
    const customMeta = new Map();
    if (mc.locked && Array.isArray(mc.customStrings)) {
      mc.customStrings.forEach(cs => { if (cs && cs.id) customMeta.set(cs.id, cs); });
    }

    panels.forEach(p => {
      const sName = p.stringName || ('S' + ((p.polyIdx || 0) + 1));
      if (!map.has(sName)) {
        map.set(sName, {
          name: sName,
          color: p.stringColor || '#00F0FF',
          mpptId: Number(p.mpptId) || 1,
          panels: [],
          polySet: new Set(),
          orientations: []
        });
        order.push(sName);
      }
      const entry = map.get(sName);
      entry.panels.push(p);
      if (p.mpptId) entry.mpptId = Number(p.mpptId);
      const polyIdx = (p.polyIdx != null) ? p.polyIdx : 0;
      entry.polySet.add(polyIdx);

      const poly = polylines[polyIdx];
      const tilt = (typeof p.tiltDeg === 'number') ? p.tiltDeg
        : ((poly && poly.roofInfo && typeof poly.roofInfo.tiltDeg === 'number') ? poly.roofInfo.tiltDeg : (poly && poly.tiltDeg || 0));
      const az = (typeof p.azimuthDeg === 'number') ? p.azimuthDeg
        : ((poly && poly.roofInfo && typeof poly.roofInfo.azimuthDeg === 'number') ? poly.roofInfo.azimuthDeg : (poly && poly.azimuthDeg || 0));
      entry.orientations.push({ tilt, az, polyIdx, pIdx: Number(p.pIdx) || 0 });
    });

    const result = [];
    order.forEach(name => {
      const s = map.get(name);
      const sortedPanels = s.panels.slice().sort((a, b) => (Number(a.pIdx) || 0) - (Number(b.pIdx) || 0));
      const count = sortedPanels.length;
      const firstOri = s.orientations[0] || { tilt: 0, az: 0 };
      let mixedOrientation = false;
      for (let i = 1; i < s.orientations.length; i++) {
        const o = s.orientations[i];
        let dAz = Math.abs(o.az - firstOri.az);
        if (dAz > 180) dAz = 360 - dAz;
        if (Math.abs(o.tilt - firstOri.tilt) > 5.0 || dAz > 10.0) {
          mixedOrientation = true;
          break;
        }
      }
      const roofLabels = Array.from(s.polySet).sort((a, b) => a - b).map(i => 'F' + (i + 1));
      const meta = customMeta.get(s.name);
      const allPanelMLPE = sortedPanels.every(p => p.hasMLPE === true);
      const effectiveMLPE = (meta && typeof meta.hasMLPE === 'boolean')
        ? meta.hasMLPE
        : (hw.hasOptimizer || allPanelMLPE);

      result.push({
        name: s.name,
        color: (meta && meta.color) ? meta.color : s.color,
        mpptId: Math.max(1, Math.min(hw.totalMppt, s.mpptId)),
        panels: sortedPanels,
        panelKeys: sortedPanels.map(getPanelKey),
        count,
        kwp: (count * hw.modWp) / 1000,
        roofLabel: roofLabels.join('+'),
        tilt: firstOri.tilt,
        az: firstOri.az,
        mixedOrientation,
        reversed: !!(meta && meta.reversed),
        hasMLPE: effectiveMLPE,
        isEmpty: false
      });
    });

    // Incluir strings vacíos recién creados para pintar con pincel 3D
    if (mc.locked && Array.isArray(mc.customStrings)) {
      mc.customStrings.forEach(cs => {
        if (!cs || !cs.id || map.has(cs.id)) return;
        const m = Math.max(1, Math.min(hw.totalMppt, Number(mc.stringToMppt[cs.id]) || 1));
        result.push({
          name: cs.id,
          color: cs.color || '#38BDF8',
          mpptId: m,
          panels: [],
          panelKeys: [],
          count: 0,
          kwp: 0,
          roofLabel: 'VACÍO',
          tilt: 0,
          az: 0,
          mixedOrientation: false,
          reversed: !!cs.reversed,
          hasMLPE: (typeof cs.hasMLPE === 'boolean') ? cs.hasMLPE : hw.hasOptimizer,
          isEmpty: true
        });
      });
    }

    return result;
  }

  function evaluateChannelHealth(channelStrings, hw) {
    const populated = (channelStrings || []).filter(s => s.count > 0);
    if (populated.length === 0) {
      return {
        level: 'empty',
        badge: (channelStrings && channelStrings.length > 0) ? 'VACÍO' : 'LIBRE',
        color: '#64748B',
        issues: [],
        vocColdMax: 0,
        vmpHotMin: 0,
        impTotal: 0,
        canEqualize: false
      };
    }

    const issues = [];
    let level = 'ok';
    const escalate = (nextLevel, msg) => {
      issues.push(msg);
      if (nextLevel === 'red') level = 'red';
      else if (nextLevel === 'amber' && level !== 'red') level = 'amber';
    };

    if (populated.length > hw.inputsPerMppt) {
      escalate('red', `Capacidad excedida (${populated.length}/${hw.inputsPerMppt} entradas)`);
    }

    const counts = populated.map(s => s.count);
    const maxLen = Math.max(...counts);
    const minLen = Math.min(...counts);
    const vocColdMax = maxLen * hw.vocColdPerMod;
    const vmpHotMin = minLen * hw.vmpHotPerMod;
    const impTotal = populated.length * hw.impMod;
    const iscTotal = populated.length * hw.iscMod * 1.25 * (hw.iscChannelFactor || 1.0);

    if (vocColdMax > hw.invVmax) {
      escalate('red', `Sobretensión en frío (${vocColdMax.toFixed(0)}V > ${hw.invVmax}V)`);
    } else if (vocColdMax > hw.invVmpptMax) {
      escalate('amber', `Voc frío (${vocColdMax.toFixed(0)}V) supera ventana MPPT (${hw.invVmpptMax}V)`);
    }

    if (vmpHotMin < hw.invVmpptMin) {
      escalate('amber', `Tensión mínima caliente baja (${vmpHotMin.toFixed(0)}V < ${hw.invVmpptMin}V)`);
    }

    if (hw.invImaxSc > 0 && iscTotal > hw.invImaxSc) {
      escalate('red', `Cortocircuito Isc (${iscTotal.toFixed(1)}A > ${hw.invImaxSc.toFixed(1)}A máx inversor)`);
    } else if (impTotal > hw.invImaxOper) {
      escalate('amber', `Corriente Imp (${impTotal.toFixed(1)}A > ${hw.invImaxOper.toFixed(1)}A, recorte)`);
    }

    for (let i = 0; i < populated.length; i++) {
      const sA = populated[i];
      if (sA.mixedOrientation && !sA.hasMLPE) {
        escalate('amber', `String ${sA.name} mezcla orientaciones distintas sin optimizador (activa ⚡)`);
      }
      for (let j = i + 1; j < populated.length; j++) {
        const sB = populated[j];
        if (sA.count !== sB.count) {
          escalate('red', `Desbalance paralelo ΔN=${Math.abs(sA.count - sB.count)} (${sA.name} vs ${sB.name})`);
        } else {
          const dTilt = Math.abs(sA.tilt - sB.tilt);
          let dAz = Math.abs(sA.az - sB.az);
          if (dAz > 180) dAz = 360 - dAz;
          if ((dTilt > 5.0 || dAz > 10.0) && !(sA.hasMLPE && sB.hasMLPE)) {
            escalate('red', `Orientación dispar (${sA.name} vs ${sB.name}: Δβ ${dTilt.toFixed(0)}° / Δγ ${dAz.toFixed(0)}°)`);
          }
        }
      }
    }

    const badgeMap = {
      ok: { badge: 'OK', color: '#10B981' },
      amber: { badge: 'AVISO', color: '#F59E0B' },
      red: { badge: 'ERROR', color: '#EF4444' }
    };
    const meta = badgeMap[level] || badgeMap.ok;

    return {
      level,
      badge: meta.badge,
      color: meta.color,
      issues: Array.from(new Set(issues)),
      vocColdMax,
      vmpHotMin,
      impTotal,
      canEqualize: populated.length >= 2 && (maxLen - minLen) > 0
    };
  }

  function snapshotStringToMppt(stringsList) {
    const mc = ensureManualConfig();
    stringsList.forEach(s => {
      if (!mc.stringToMppt[s.name]) {
        mc.stringToMppt[s.name] = s.mpptId;
      }
    });
    return mc;
  }

  function materializeUneditedStrings(strings, mc) {
    const existingById = new Map();
    mc.customStrings.forEach(cs => { if (cs && cs.id) existingById.set(cs.id, cs); });

    strings.forEach((s, idx) => {
      if (existingById.has(s.name)) return;
      const entry = {
        id: s.name,
        color: s.color,
        panelKeys: s.panelKeys.slice(),
        sortIdx: idx,
        reversed: !!s.reversed
      };
      if (s.hasMLPE && !root.solarProjectConfig?.selectedTopology?.includes('optimizer')) {
        entry.hasMLPE = true;
      }
      mc.customStrings.push(entry);
    });
  }

  function clearHighlight3D() {
    const v = root.viewer;
    if (v && v.entities && _highlightEntities.length > 0) {
      _highlightEntities.forEach(ent => {
        try { v.entities.remove(ent); } catch (_) {}
      });
      _highlightEntities = [];
      if (v.scene && typeof v.scene.requestRender === 'function') {
        v.scene.requestRender();
      }
    }
  }

  function highlight3DByFilter(predicate, hexColor) {
    clearHighlight3D();
    const v = root.viewer;
    if (!v || !v.entities || typeof Cesium === 'undefined') return;
    const panels = getActivePanels().filter(predicate);
    if (panels.length === 0) return;

    const cssColor = hexColor || '#38BDF8';
    const fillColor = Cesium.Color.fromCssColorString(cssColor).withAlpha(0.35);
    const lineColor = Cesium.Color.fromCssColorString('#FFFFFF').withAlpha(0.95);

    panels.forEach(p => {
      if (!Array.isArray(p.corners) || p.corners.length < 4) return;
      const lifted = p.corners.map(c => {
        const pt = new Cesium.Cartesian3(c.x, c.y, c.z);
        const dir = Cesium.Cartesian3.normalize(pt, new Cesium.Cartesian3());
        return Cesium.Cartesian3.add(pt, Cesium.Cartesian3.multiplyByScalar(dir, 0.08, new Cesium.Cartesian3()), new Cesium.Cartesian3());
      });
      const loop = [lifted[0], lifted[1], lifted[2], lifted[3], lifted[0]];
      try {
        const ent = v.entities.add({
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy(lifted),
            perPositionHeight: true,
            material: fillColor
          },
          polyline: {
            positions: loop,
            width: 2.5,
            material: lineColor
          }
        });
        _highlightEntities.push(ent);
      } catch (_) {}
    });

    if (v.scene && typeof v.scene.requestRender === 'function') {
      v.scene.requestRender();
    }
  }

  async function applyAndSync(rebuildGeometry) {
    _isSyncing = true;
    try {
      if (rebuildGeometry && typeof root.wpFastRenderSimulatedPanels === 'function') {
        try {
          await Promise.resolve(root.wpFastRenderSimulatedPanels(true));
        } catch (e) {
          console.warn('[MPPTMatrix] Error en render paneles:', e);
        }
      } else if (root.RA && root.RA.Electrical && typeof root.RA.Electrical.rebalanceMPPTAssignment === 'function') {
        root.RA.Electrical.rebalanceMPPTAssignment(root.allRenderedPanels);
      }

      const step = (typeof root.wpCurrentStep !== 'undefined') ? root.wpCurrentStep : 1;
      if (step >= 4 && root.RACableEngine && typeof root.RACableEngine.renderAllCables === 'function') {
        try { root.RACableEngine.renderAllCables(); } catch (e) { console.warn('[MPPTMatrix] Error en cables:', e); }
      }

      if (typeof root.wpRenderStep4SingleLineDiagramUI === 'function') {
        try { root.wpRenderStep4SingleLineDiagramUI(); } catch (_) {}
      }
      if (typeof root.wpRenderStep4RoofScopeUI === 'function') {
        try { root.wpRenderStep4RoofScopeUI(); } catch (_) {}
      }
      if (typeof root.step3UpdateHardwareSelection === 'function') {
        try { root.step3UpdateHardwareSelection(); } catch (_) {}
      }
    } finally {
      _isSyncing = false;
    }

    render();
    if (isBrushActive()) {
      const hw = getHardwareContext();
      const target = buildStringsMap(getActivePanels(), hw).find(s => s.name === _brushString);
      highlight3DByFilter(p => p.stringName === _brushString, target ? target.color : '#38BDF8');
    }
  }

  function isBrushActive() {
    if (!_brushString) return false;
    const mc = ensureManualConfig();
    if (!mc.locked) {
      _brushString = null;
      return false;
    }
    const existsInCustom = mc.customStrings.some(cs => cs && cs.id === _brushString);
    const existsInPanels = getActivePanels().some(p => p.stringName === _brushString);
    if (!existsInCustom && !existsInPanels) {
      _brushString = null;
      return false;
    }
    return true;
  }

  function toggleBrush(stringName) {
    if (_brushString === stringName) {
      _brushString = null;
      clearHighlight3D();
      render();
      if (typeof root.showStatus === 'function') {
        root.showStatus('Pincel 3D desactivado.', 1800);
      }
      return;
    }
    const hw = getHardwareContext();
    const panels = getActivePanels();
    const strings = buildStringsMap(panels, hw);
    const mc = snapshotStringToMppt(strings);
    mc.locked = true;
    materializeUneditedStrings(strings, mc);

    _brushString = stringName;
    _splitEditorString = null;
    _renameEditorString = null;
    render();
    const target = strings.find(s => s.name === stringName);
    highlight3DByFilter(p => p.stringName === stringName, target ? target.color : '#38BDF8');
    if (typeof root.showStatus === 'function') {
      root.showStatus(`🖌️ PINCEL 3D ACTIVO → Haz clic en placas para asignarlas a ${stringName} (Esc para salir)`, 3500);
    }
  }

  function createEmptyString(globalMppt) {
    const hw = getHardwareContext();
    const panels = getActivePanels();
    const strings = buildStringsMap(panels, hw);
    const mc = snapshotStringToMppt(strings);
    mc.locked = true;
    materializeUneditedStrings(strings, mc);

    const usedIds = new Set(mc.customStrings.map(c => c.id));
    strings.forEach(s => usedIds.add(s.name));
    let k = 1;
    while (usedIds.has('M' + k)) k++;
    const newId = 'M' + k;
    const color = pickPaletteColor(mc.customStrings.length + 2);

    mc.customStrings.push({ id: newId, color, panelKeys: [] });
    mc.stringToMppt[newId] = Math.max(1, Math.min(hw.totalMppt, Number(globalMppt) || 1));

    _brushString = newId;
    _splitEditorString = null;
    _renameEditorString = null;
    applyAndSync(false);
    if (typeof root.showStatus === 'function') {
      root.showStatus(`🖌️ Nuevo string ${newId} listo en MPPT ${mc.stringToMppt[newId]}. Haz clic en las placas 3D para rellenarlo.`, 3500);
    }
  }

  function handlePanelBrushClick(panelIdx) {
    if (!isBrushActive()) return false;
    const list = root.allRenderedPanels;
    if (!Array.isArray(list) || !list[panelIdx]) return false;
    const picked = list[panelIdx];
    if (picked.isGhost || picked.deleted || picked.disabled) return false;

    const pKey = getPanelKey(picked);
    const hw = getHardwareContext();
    const panels = getActivePanels();
    const strings = buildStringsMap(panels, hw);
    const mc = snapshotStringToMppt(strings);
    mc.locked = true;
    materializeUneditedStrings(strings, mc);

    const targetCs = mc.customStrings.find(cs => cs.id === _brushString);
    if (!targetCs) {
      _brushString = null;
      render();
      return false;
    }

    if (targetCs.panelKeys.includes(pKey)) {
      if (typeof root.showStatus === 'function') {
        root.showStatus(`Ese módulo ya pertenece a ${_brushString}.`, 1600);
      }
      return true;
    }

    // Extraer de su string anterior conservando orden
    mc.customStrings.forEach(cs => {
      if (cs.id === _brushString) return;
      cs.panelKeys = cs.panelKeys.filter(k => k !== pKey);
    });

    targetCs.panelKeys.push(pKey);

    // Eliminar strings vacíos que no son el pincel activo
    const dropped = [];
    mc.customStrings = mc.customStrings.filter(cs => {
      if (cs.id !== _brushString && cs.panelKeys.length === 0) {
        dropped.push(cs.id);
        return false;
      }
      return true;
    });
    dropped.forEach(id => { delete mc.stringToMppt[id]; });

    applyAndSync(true);
    if (typeof root.showStatus === 'function') {
      root.showStatus(`🖌️ Módulo añadido a ${_brushString} (${targetCs.panelKeys.length} módulos). Esc para finalizar.`, 2200);
    }
    return true;
  }

  function moveStringToMppt(stringName, targetMppt) {
    const hw = getHardwareContext();
    const mpptNum = Math.max(1, Math.min(hw.totalMppt, Number(targetMppt) || 1));
    const panels = getActivePanels();
    const strings = buildStringsMap(panels, hw);
    const mc = snapshotStringToMppt(strings);
    mc.locked = true;
    mc.stringToMppt[stringName] = mpptNum;
    applyAndSync(false);
  }

  function toggleLock() {
    const hw = getHardwareContext();
    const panels = getActivePanels();
    const strings = buildStringsMap(panels, hw);
    const mc = ensureManualConfig();
    if (!mc.locked) {
      mc.stringToMppt = {};
      snapshotStringToMppt(strings);
      mc.locked = true;
    } else {
      mc.locked = false;
      mc.stringToMppt = {};
      _brushString = null;
      _splitEditorString = null;
      _renameEditorString = null;
      _renameDraft = '';
      clearHighlight3D();
    }
    applyAndSync(mc.customStrings.length > 0);
  }

  function resetToAuto() {
    const mc = ensureManualConfig();
    mc.locked = false;
    mc.stringToMppt = {};
    mc.customStrings = [];
    _selectedStrings.clear();
    _brushString = null;
    _splitEditorString = null;
    _renameEditorString = null;
    _renameDraft = '';
    clearHighlight3D();
    applyAndSync(true);
  }

  function clearCustomStrings() {
    const mc = ensureManualConfig();
    mc.customStrings = [];
    mc.stringToMppt = {};
    _selectedStrings.clear();
    _brushString = null;
    _splitEditorString = null;
    _renameEditorString = null;
    _renameDraft = '';
    clearHighlight3D();
    applyAndSync(true);
  }

  function mergeSelectedStrings() {
    if (_selectedStrings.size < 2) return;
    const hw = getHardwareContext();
    const panels = getActivePanels();
    const strings = buildStringsMap(panels, hw);
    const mc = snapshotStringToMppt(strings);
    mc.locked = true;
    materializeUneditedStrings(strings, mc);

    const toMergeNames = new Set(_selectedStrings);
    const targets = strings.filter(s => toMergeNames.has(s.name));
    if (targets.length < 2) return;

    const mergedKeys = [];
    targets.forEach(s => s.panelKeys.forEach(k => mergedKeys.push(k)));
    const firstMppt = mc.stringToMppt[targets[0].name] || targets[0].mpptId || 1;
    const anyMlpe = targets.some(t => t.hasMLPE) && !hw.hasOptimizer;

    const existingIds = new Set(mc.customStrings.map(c => c.id));
    let mIdx = 1;
    while (existingIds.has('M' + mIdx) || strings.some(s => s.name === 'M' + mIdx && !toMergeNames.has(s.name))) {
      mIdx++;
    }
    const newId = 'M' + mIdx;

    mc.customStrings = mc.customStrings.filter(cs => !toMergeNames.has(cs.id));
    mc.customStrings.push({
      id: newId,
      color: targets[0].color || '#38BDF8',
      panelKeys: mergedKeys,
      hasMLPE: anyMlpe ? true : undefined
    });

    targets.forEach(s => { delete mc.stringToMppt[s.name]; });
    mc.stringToMppt[newId] = firstMppt;
    if (toMergeNames.has(_brushString)) _brushString = null;
    _selectedStrings.clear();
    applyAndSync(true);
  }

  function openSplitEditor(stringName) {
    if (_splitEditorString === stringName) {
      _splitEditorString = null;
      render();
      return;
    }
    const hw = getHardwareContext();
    const strings = buildStringsMap(getActivePanels(), hw);
    const target = strings.find(s => s.name === stringName);
    if (!target || target.count < 2) return;
    _splitEditorString = stringName;
    _splitEditorCount = Math.ceil(target.count / 2);
    _renameEditorString = null;
    render();
  }

  function confirmSplitString(stringName, countA) {
    const hw = getHardwareContext();
    const panels = getActivePanels();
    const strings = buildStringsMap(panels, hw);
    const target = strings.find(s => s.name === stringName);
    if (!target || target.count < 2) return;

    const splitAt = Math.max(1, Math.min(target.count - 1, Number(countA) || Math.ceil(target.count / 2)));
    const mc = snapshotStringToMppt(strings);
    mc.locked = true;
    materializeUneditedStrings(strings, mc);

    const origCs = mc.customStrings.find(cs => cs.id === stringName);
    const orderedKeys = origCs ? origCs.panelKeys.slice() : target.panelKeys.slice();
    const keysA = orderedKeys.slice(0, splitAt);
    const keysB = orderedKeys.slice(splitAt);

    const existingIds = new Set(mc.customStrings.map(c => c.id));
    const pickName = (base, suffix) => {
      let cand = base + suffix;
      let n = 2;
      while (existingIds.has(cand) && cand !== stringName) {
        cand = base + suffix + n;
        n++;
      }
      existingIds.add(cand);
      return cand;
    };

    const idA = pickName(stringName, 'a');
    const idB = pickName(stringName, 'b');

    const curMppt = mc.stringToMppt[stringName] || target.mpptId || 1;
    let mpptB = curMppt;
    if (hw.totalMppt > 1) {
      const occupancy = new Array(hw.totalMppt + 1).fill(0);
      strings.forEach(s => {
        const m = mc.stringToMppt[s.name] || s.mpptId || 1;
        if (s.name !== stringName && occupancy[m] != null) occupancy[m]++;
      });
      occupancy[curMppt]++;
      let freeCh = -1;
      for (let m = 1; m <= hw.totalMppt; m++) {
        if (occupancy[m] < hw.inputsPerMppt && m !== curMppt) {
          freeCh = m;
          break;
        }
      }
      mpptB = freeCh !== -1 ? freeCh : ((curMppt % hw.totalMppt) + 1);
    }

    const baseMlpe = origCs && typeof origCs.hasMLPE === 'boolean' ? origCs.hasMLPE : undefined;
    mc.customStrings = mc.customStrings.filter(cs => cs.id !== stringName);
    mc.customStrings.push(
      { id: idA, color: target.color, panelKeys: keysA, hasMLPE: baseMlpe },
      { id: idB, color: pickPaletteColor(mc.customStrings.length + 1), panelKeys: keysB, hasMLPE: baseMlpe }
    );
    delete mc.stringToMppt[stringName];
    mc.stringToMppt[idA] = curMppt;
    mc.stringToMppt[idB] = mpptB;
    if (_brushString === stringName) _brushString = null;
    _selectedStrings.delete(stringName);
    _splitEditorString = null;
    applyAndSync(true);
  }

  function reverseString(stringName) {
    const hw = getHardwareContext();
    const strings = buildStringsMap(getActivePanels(), hw);
    const mc = snapshotStringToMppt(strings);
    mc.locked = true;
    materializeUneditedStrings(strings, mc);

    const cs = mc.customStrings.find(c => c.id === stringName);
    if (!cs) return;
    cs.reversed = !cs.reversed;
    applyAndSync(true);
  }

  function toggleStringMLPE(stringName) {
    const hw = getHardwareContext();
    const strings = buildStringsMap(getActivePanels(), hw);
    const target = strings.find(s => s.name === stringName);
    if (!target) return;

    const mc = snapshotStringToMppt(strings);
    mc.locked = true;
    materializeUneditedStrings(strings, mc);

    const cs = mc.customStrings.find(c => c.id === stringName);
    if (!cs) return;
    const curState = (typeof cs.hasMLPE === 'boolean') ? cs.hasMLPE : target.hasMLPE;
    cs.hasMLPE = !curState;
    applyAndSync(true);
  }

  function openRenameEditor(stringName) {
    if (_renameEditorString === stringName) {
      _renameEditorString = null;
      _renameDraft = '';
      render();
      return;
    }
    _renameEditorString = stringName;
    _renameDraft = stringName;
    _splitEditorString = null;
    render();
  }

  function updateStringColor(stringName, newColor) {
    const hw = getHardwareContext();
    const strings = buildStringsMap(getActivePanels(), hw);
    const mc = snapshotStringToMppt(strings);
    mc.locked = true;
    materializeUneditedStrings(strings, mc);

    const cs = mc.customStrings.find(c => c.id === stringName);
    if (!cs) return;
    cs.color = normalizeHexColor(newColor, cs.color);
    applyAndSync(true);
  }

  function deleteEmptyString(stringName) {
    const mc = ensureManualConfig();
    const target = mc.customStrings.find(c => c.id === stringName);
    if (target && Array.isArray(target.panelKeys) && target.panelKeys.length > 0) return;

    mc.customStrings = mc.customStrings.filter(c => c.id !== stringName);
    delete mc.stringToMppt[stringName];
    _selectedStrings.delete(stringName);
    if (_brushString === stringName) {
      _brushString = null;
      clearHighlight3D();
    }
    if (_renameEditorString === stringName) {
      _renameEditorString = null;
      _renameDraft = '';
    }
    if (_splitEditorString === stringName) {
      _splitEditorString = null;
    }
    applyAndSync(false);
  }

  function confirmRenameString(oldName, rawNewName, newColor) {
    const cleanName = String(rawNewName || '').trim().replace(/\s+/g, '-');
    if (!cleanName) return;

    const hw = getHardwareContext();
    const strings = buildStringsMap(getActivePanels(), hw);
    const mc = snapshotStringToMppt(strings);
    mc.locked = true;
    materializeUneditedStrings(strings, mc);

    if (cleanName !== oldName && (mc.customStrings.some(c => c.id === cleanName) || strings.some(s => s.name === cleanName))) {
      if (typeof root.showToast === 'function') {
        root.showToast('NOMBRE DUPLICADO', `Ya existe otro string llamado "${cleanName}".`, 'warning', 2400);
      }
      return;
    }

    const cs = mc.customStrings.find(c => c.id === oldName);
    if (!cs) return;
    cs.id = cleanName;
    if (newColor) cs.color = normalizeHexColor(newColor, cs.color);

    if (cleanName !== oldName) {
      if (mc.stringToMppt[oldName] != null) {
        mc.stringToMppt[cleanName] = mc.stringToMppt[oldName];
        delete mc.stringToMppt[oldName];
      }
      if (_brushString === oldName) _brushString = cleanName;
      if (_selectedStrings.has(oldName)) {
        _selectedStrings.delete(oldName);
        _selectedStrings.add(cleanName);
      }
    }

    _renameEditorString = null;
    _renameDraft = '';
    applyAndSync(true);
  }

  function equalizeMpptStrings(globalMppt) {
    const hw = getHardwareContext();
    const strings = buildStringsMap(getActivePanels(), hw);
    const mc = snapshotStringToMppt(strings);
    mc.locked = true;
    materializeUneditedStrings(strings, mc);

    const inChannel = strings.filter(s => s.mpptId === Number(globalMppt) && s.count > 0);
    if (inChannel.length < 2) return;

    const allKeys = [];
    inChannel.forEach(s => {
      const cs = mc.customStrings.find(c => c.id === s.name);
      const keys = (cs && Array.isArray(cs.panelKeys) && cs.panelKeys.length > 0) ? cs.panelKeys : s.panelKeys;
      keys.forEach(k => allKeys.push(k));
    });

    const kCount = inChannel.length;
    const base = Math.floor(allKeys.length / kCount);
    const rem = allKeys.length % kCount;
    let offset = 0;

    inChannel.forEach((s, idx) => {
      const take = base + (idx < rem ? 1 : 0);
      const slice = allKeys.slice(offset, offset + take);
      offset += take;
      const cs = mc.customStrings.find(c => c.id === s.name);
      if (cs) {
        cs.panelKeys = slice;
        cs.reversed = false;
      }
    });

    applyAndSync(true);
    if (typeof root.showStatus === 'function') {
      root.showStatus(`⚖️ Strings del MPPT #${globalMppt} igualados automáticamente.`, 2400);
    }
  }

  function bindGlobalEscape() {
    if (_escapeBound || typeof document === 'undefined') return;
    _escapeBound = true;
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && _brushString) {
        _brushString = null;
        clearHighlight3D();
        render();
      }
    });
  }

  function render() {
    const container = document.getElementById('step4-mppt-matrix-card');
    if (!container) return;
    bindGlobalEscape();

    const hw = getHardwareContext();
    const panels = getActivePanels();
    if (panels.length === 0 || hw.cfg.selectedTopology === 'microinverter') {
      container.style.display = 'none';
      _brushString = null;
      clearHighlight3D();
      return;
    }

    const mc = ensureManualConfig();
    const strings = buildStringsMap(panels, hw);
    if (strings.length === 0) {
      container.style.display = 'none';
      _brushString = null;
      clearHighlight3D();
      return;
    }

    const activeNames = new Set(strings.map(s => s.name));
    Array.from(_selectedStrings).forEach(n => {
      if (!activeNames.has(n)) _selectedStrings.delete(n);
    });
    if (_brushString && !activeNames.has(_brushString)) _brushString = null;
    if (_splitEditorString && !activeNames.has(_splitEditorString)) _splitEditorString = null;
    if (_renameEditorString && !activeNames.has(_renameEditorString)) _renameEditorString = null;

    container.style.display = 'block';
    container.style.background = 'rgba(0,0,0,0.4)';
    container.style.border = mc.locked
      ? '1px solid rgba(245,158,11,0.45)'
      : '1px solid rgba(56,189,248,0.25)';
    container.style.borderRadius = '7px';
    container.style.padding = '8px';

    const mpptBuckets = Array.from({ length: hw.totalMppt + 1 }, () => []);
    strings.forEach(s => {
      const m = Math.max(1, Math.min(hw.totalMppt, s.mpptId || 1));
      mpptBuckets[m].push(s);
    });

    const channelOptions = [];
    for (let g = 1; g <= hw.totalMppt; g++) {
      const iIdx = Math.floor((g - 1) / hw.mpptPerInv) + 1;
      const lIdx = ((g - 1) % hw.mpptPerInv) + 1;
      const label = hw.invCount > 1 ? `INV${iIdx} · MPPT${lIdx}` : `MPPT ${lIdx}`;
      channelOptions.push({ globalMppt: g, label });
    }

    const lockBtnStyle = mc.locked
      ? 'background:rgba(245,158,11,0.2);border:1px solid #F59E0B;color:#FBBF24;'
      : 'background:rgba(56,189,248,0.14);border:1px solid rgba(56,189,248,0.4);color:#38BDF8;';
    const lockLabel = mc.locked ? '🔒 MODO MANUAL' : '🔓 MODO AUTO';

    let selectedModCount = 0;
    strings.forEach(s => { if (_selectedStrings.has(s.name)) selectedModCount += s.count; });

    const brushBannerHtml = _brushString ? `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:7px;padding:6px 8px;background:rgba(56,189,248,0.16);border:1px solid #38BDF8;border-radius:5px;">
        <span style="font-size:9px;font-weight:800;color:#E0F2FE;">
          🖌️ Pincel 3D en <b>${escapeHtml(_brushString)}</b>: haz clic en las placas 3D
        </span>
        <button type="button" data-action="stop-brush" style="padding:2px 7px;border-radius:4px;font-size:8.5px;font-weight:900;cursor:pointer;background:#0F172A;border:1px solid #38BDF8;color:#38BDF8;">
          Finalizar (Esc)
        </button>
      </div>
    ` : '';

    const showActionBar = (_selectedStrings.size >= 2) || (mc.customStrings.length > 0);
    const actionBarHtml = showActionBar ? `
      <div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center;margin-bottom:7px;padding:5px 7px;background:rgba(15,23,42,0.85);border:1px solid rgba(255,255,255,0.08);border-radius:5px;">
        ${_selectedStrings.size >= 2 ? `
          <button type="button" data-action="merge-selected" style="padding:3px 8px;border-radius:4px;font-size:9px;font-weight:800;cursor:pointer;background:rgba(16,185,129,0.2);border:1px solid #10B981;color:#34D399;">
            🔗 Unir ${_selectedStrings.size} seleccionadas (${selectedModCount} mod)
          </button>
        ` : `<span style="font-size:8.5px;color:#94A3B8;">Marca 2+ casillas para fusionar entre faldones</span>`}
        ${mc.customStrings.length > 0 ? `
          <button type="button" data-action="clear-custom" style="margin-left:auto;padding:3px 7px;border-radius:4px;font-size:8.5px;font-weight:800;cursor:pointer;background:rgba(244,63,94,0.12);border:1px solid rgba(244,63,94,0.4);color:#FDA4AF;">
            ↩️ Restaurar partición
          </button>
        ` : ''}
      </div>
    ` : '';

    let invertersHtml = '';
    for (let invIdx = 0; invIdx < hw.invCount; invIdx++) {
      let invKwp = 0;
      let traysHtml = '';

      for (let localM = 1; localM <= hw.mpptPerInv; localM++) {
        const gMppt = invIdx * hw.mpptPerInv + localM;
        const bucket = mpptBuckets[gMppt] || [];
        bucket.forEach(s => { invKwp += s.kwp; });

        const health = evaluateChannelHealth(bucket, hw);
        const capColor = bucket.filter(s => s.count > 0).length > hw.inputsPerMppt ? '#EF4444' : '#94A3B8';

        const stringsHtml = bucket.length === 0
          ? `<div style="font-size:8.5px;color:#64748B;font-style:italic;padding:3px 0;">Arrastra aquí un string o pulsa + String</div>`
          : bucket.map(s => {
            const isChecked = _selectedStrings.has(s.name);
            const isBrushingThis = (_brushString === s.name);
            const isSplitting = (_splitEditorString === s.name && s.count >= 2);
            const isRenaming = (_renameEditorString === s.name);
            const azStr = Math.round(s.az);
            const tiltStr = Math.round(s.tilt);
            const safeHex = normalizeHexColor(s.color, '#00F0FF');
            const selOpts = channelOptions.map(opt =>
              `<option value="${opt.globalMppt}" ${opt.globalMppt === gMppt ? 'selected' : ''}>${escapeHtml(opt.label)}</option>`
            ).join('');

            const brushBtnStyle = isBrushingThis
              ? 'background:#38BDF8;border:1px solid #E0F2FE;color:#0F172A;'
              : 'background:rgba(56,189,248,0.12);border:1px solid rgba(56,189,248,0.3);color:#38BDF8;';
            const revBtnStyle = s.reversed
              ? 'background:rgba(168,85,247,0.25);border:1px solid #C084FC;color:#E9D5FF;'
              : 'background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);color:#CBD5E1;';
            const mlpeBtnStyle = s.hasMLPE
              ? 'background:rgba(245,158,11,0.25);border:1px solid #F59E0B;color:#FBBF24;'
              : 'background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);color:#94A3B8;';

            const splitEditorHtml = isSplitting ? `
              <div class="ra-mppt-inline-editor" data-split-box="${escapeHtml(s.name)}" style="margin-top:4px;padding:5px 6px;background:rgba(2,6,23,0.9);border:1px solid rgba(56,189,248,0.35);border-radius:4px;">
                <div style="display:flex;justify-content:space-between;font-size:8.5px;color:#E2E8F0;margin-bottom:3px;">
                  <span>Punto de corte:</span>
                  <b data-role="split-preview">A: ${_splitEditorCount}m · B: ${s.count - _splitEditorCount}m</b>
                </div>
                <input type="range" min="1" max="${s.count - 1}" value="${_splitEditorCount}" data-action="split-range" data-string="${escapeHtml(s.name)}" data-total="${s.count}" style="width:100%;accent-color:#38BDF8;cursor:pointer;" />
                <div style="display:flex;gap:4px;margin-top:4px;">
                  <button type="button" data-action="confirm-split" data-string="${escapeHtml(s.name)}" style="flex:1;padding:2px 6px;border-radius:3px;font-size:8.5px;font-weight:800;cursor:pointer;background:rgba(16,185,129,0.2);border:1px solid #10B981;color:#34D399;">Dividir</button>
                  <button type="button" data-action="cancel-split" style="padding:2px 6px;border-radius:3px;font-size:8.5px;font-weight:800;cursor:pointer;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);color:#CBD5E1;">✕</button>
                </div>
              </div>
            ` : '';

            const renameVal = _renameDraft || s.name;
            const renameEditorHtml = isRenaming ? `
              <div class="ra-mppt-inline-editor" data-rename-box="${escapeHtml(s.name)}" style="display:flex;align-items:center;gap:4px;margin-top:4px;padding:4px 6px;background:rgba(2,6,23,0.9);border:1px solid rgba(245,158,11,0.35);border-radius:4px;">
                <input type="color" data-role="color-input" data-string="${escapeHtml(s.name)}" value="${safeHex}" title="Color del string" style="width:22px;height:20px;border:none;background:transparent;padding:0;cursor:pointer;" />
                <input type="text" data-role="rename-input" data-string="${escapeHtml(s.name)}" value="${escapeHtml(renameVal)}" maxlength="16" style="flex:1;min-width:0;background:#0F172A;color:#F8FAFC;border:1px solid rgba(255,255,255,0.2);border-radius:3px;font-size:9px;padding:2px 5px;" />
                <button type="button" data-action="confirm-rename" data-string="${escapeHtml(s.name)}" style="padding:2px 6px;border-radius:3px;font-size:8.5px;font-weight:800;cursor:pointer;background:rgba(16,185,129,0.2);border:1px solid #10B981;color:#34D399;">OK</button>
                <button type="button" data-action="cancel-rename" style="padding:2px 5px;border-radius:3px;font-size:8.5px;font-weight:800;cursor:pointer;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);color:#CBD5E1;">✕</button>
              </div>
            ` : '';

            return `
              <div class="ra-mppt-string-pill" draggable="true" data-string="${escapeHtml(s.name)}" data-color="${escapeHtml(safeHex)}"
                   style="padding:4px 5px;background:rgba(15,23,42,0.92);border:1px solid ${isBrushingThis ? '#38BDF8' : 'rgba(255,255,255,0.1)'};border-left:3px solid ${escapeHtml(safeHex)};border-radius:4px;cursor:grab;font-size:9px;margin-top:3px;">
                <div style="display:flex;align-items:center;gap:4px;">
                  ${s.count > 0 ? `
                    <input type="checkbox" data-action="toggle-select" data-string="${escapeHtml(s.name)}" ${isChecked ? 'checked' : ''}
                           title="Seleccionar para unir con otro string o faldón"
                           style="margin:0;cursor:pointer;accent-color:#10B981;" />
                  ` : ''}
                  <div style="flex:1;min-width:0;">
                    <div style="display:flex;align-items:center;gap:4px;font-weight:800;color:#F1F5F9;flex-wrap:wrap;">
                      <span>${escapeHtml(s.name)}</span>
                      <span style="background:rgba(255,255,255,0.08);padding:0 4px;border-radius:3px;font-size:8px;color:#CBD5E1;">${s.count}m · ${s.kwp.toFixed(1)}kW</span>
                      <span style="color:#FBBF24;font-size:8px;">${escapeHtml(s.roofLabel)}</span>
                    </div>
                    <div style="font-size:8px;color:#94A3B8;">
                      ${s.count > 0 ? `${tiltStr}° incl · ${azStr}° az${s.mixedOrientation ? ' · mixta' : ''}${s.reversed ? ' · INV' : ''}` : 'Haz clic en módulos 3D para poblar'}
                    </div>
                  </div>
                  <select data-action="move-select" data-string="${escapeHtml(s.name)}" title="Mover a otro MPPT / Inversor"
                          style="background:#020617;color:#CBD5E1;border:1px solid rgba(255,255,255,0.14);border-radius:3px;font-size:8px;padding:2px 2px;max-width:74px;cursor:pointer;">
                    ${selOpts}
                  </select>
                </div>
                <div style="display:flex;align-items:center;gap:3px;margin-top:4px;padding-top:3px;border-top:1px dashed rgba(255,255,255,0.07);">
                  <button type="button" data-action="toggle-brush" data-string="${escapeHtml(s.name)}" title="Pintar módulos en el mapa 3D hacia este string"
                          style="padding:1px 5px;border-radius:3px;font-size:8.5px;cursor:pointer;${brushBtnStyle}">🖌️</button>
                  <button type="button" data-action="open-rename" data-string="${escapeHtml(s.name)}" title="Renombrar y cambiar color"
                          style="padding:1px 5px;border-radius:3px;font-size:8.5px;cursor:pointer;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);color:#CBD5E1;">✏️</button>
                  ${s.count > 0 ? `
                    <button type="button" data-action="reverse-string" data-string="${escapeHtml(s.name)}" title="Invertir polaridad [+ IN] ↔ [- OUT]"
                            style="padding:1px 5px;border-radius:3px;font-size:8.5px;cursor:pointer;${revBtnStyle}">⇄</button>
                    <button type="button" data-action="toggle-mlpe" data-string="${escapeHtml(s.name)}" title="Activar/desactivar optimizador por string"
                            style="padding:1px 5px;border-radius:3px;font-size:8.5px;cursor:pointer;${mlpeBtnStyle}">⚡${s.hasMLPE ? ' MLPE' : ''}</button>
                  ` : `
                    <button type="button" data-action="delete-empty" data-string="${escapeHtml(s.name)}" title="Eliminar string vacío"
                            style="margin-left:auto;padding:1px 5px;border-radius:3px;font-size:8.5px;cursor:pointer;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.35);color:#FCA5A5;">🗑️</button>
                  `}
                  ${s.count >= 2 ? `
                    <button type="button" data-action="open-split" data-string="${escapeHtml(s.name)}" title="Dividir string eligiendo módulo exacto"
                            style="margin-left:auto;padding:1px 5px;border-radius:3px;font-size:8.5px;cursor:pointer;background:rgba(56,189,248,0.12);border:1px solid rgba(56,189,248,0.3);color:#38BDF8;">✂️</button>
                  ` : ''}
                </div>
                ${splitEditorHtml}
                ${renameEditorHtml}
              </div>
            `;
          }).join('');

        const telemetryHtml = health.vocColdMax > 0 ? `
          <span style="font-size:8px;color:#94A3B8;font-family:monospace;">
            ${health.vocColdMax.toFixed(0)}V/${health.vmpHotMin.toFixed(0)}V · ${health.impTotal.toFixed(1)}A
          </span>
        ` : '';

        const issuesHtml = health.issues.length > 0 ? `
          <div style="margin-top:3px;font-size:8px;color:${health.color};line-height:1.3;font-weight:700;">
            ${health.issues.map(msg => `• ${escapeHtml(msg)}`).join('<br>')}
          </div>
        ` : '';

        const eqBtnHtml = health.canEqualize ? `
          <button type="button" data-action="equalize-mppt" data-mppt="${gMppt}" title="Igualar número de módulos entre los strings paralelos de este MPPT"
                  style="padding:1px 5px;border-radius:3px;font-size:8px;font-weight:800;cursor:pointer;background:rgba(245,158,11,0.18);border:1px solid #F59E0B;color:#FBBF24;">
            ⚖️ Igualar
          </button>
        ` : '';

        traysHtml += `
          <div class="ra-mppt-tray" data-mppt="${gMppt}"
               style="background:rgba(2,6,23,0.65);border:1px dashed ${health.level === 'red' ? '#EF4444' : (health.level === 'amber' ? '#F59E0B' : 'rgba(148,163,184,0.28)')};border-radius:5px;padding:5px 6px;margin-top:5px;transition:border-color 0.15s, background 0.15s;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:4px;flex-wrap:wrap;">
              <div style="display:flex;align-items:center;gap:4px;">
                <span style="font-size:9px;font-weight:900;color:#E2E8F0;">MPPT ${localM}</span>
                <span style="font-size:8px;font-weight:800;color:${capColor};background:rgba(255,255,255,0.06);padding:1px 4px;border-radius:3px;">${bucket.filter(s => s.count > 0).length}/${hw.inputsPerMppt}</span>
                ${telemetryHtml}
              </div>
              <div style="display:flex;align-items:center;gap:3px;">
                ${eqBtnHtml}
                <button type="button" data-action="new-string" data-mppt="${gMppt}" title="Crear string nuevo y poblarlo haciendo clic en placas 3D"
                        style="padding:1px 5px;border-radius:3px;font-size:8px;font-weight:800;cursor:pointer;background:rgba(56,189,248,0.14);border:1px solid rgba(56,189,248,0.35);color:#38BDF8;">
                  + String
                </button>
                <span style="font-size:8px;font-weight:900;color:${health.color};background:rgba(0,0,0,0.45);border:1px solid ${health.color};padding:1px 5px;border-radius:3px;">
                  ${escapeHtml(health.badge)}
                </span>
              </div>
            </div>
            ${stringsHtml}
            ${issuesHtml}
          </div>
        `;
      }

      const ratio = hw.invKw > 0 ? (invKwp / hw.invKw) : 0;
      let ratioColor = '#10B981';
      if (ratio > 1.5 || (invKwp > 0 && ratio < 0.7)) ratioColor = '#EF4444';
      else if (ratio > 1.3 || (invKwp > 0 && ratio < 0.9)) ratioColor = '#F59E0B';

      const invTitle = `${hw.inv.brand || 'Inversor'} ${hw.inv.model || ''}`.trim();

      invertersHtml += `
        <div style="background:rgba(15,23,42,0.72);border:1px solid rgba(255,255,255,0.09);border-radius:6px;padding:6px 7px;margin-top:6px;">
          <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(255,255,255,0.07);padding-bottom:4px;">
            <div style="min-width:0;">
              <div style="font-size:9.5px;font-weight:900;color:#34D399;">INVERSOR ${invIdx + 1} · ${hw.invKw} kW AC</div>
              <div style="font-size:8px;color:#94A3B8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:175px;">${escapeHtml(invTitle)}</div>
            </div>
            <div style="text-align:right;flex-shrink:0;">
              <div style="font-size:9px;font-weight:800;color:#E2E8F0;">${invKwp.toFixed(2)} kWp DC</div>
              <span style="font-size:8px;font-weight:900;color:${ratioColor};">DC/AC ${(ratio * 100).toFixed(0)}%</span>
            </div>
          </div>
          ${traysHtml}
        </div>
      `;
    }

    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:5px;">
        <div style="display:flex;align-items:center;gap:5px;">
          <span style="font-size:10px;font-weight:900;color:#38BDF8;">⚡ MATRIZ INVERSOR / MPPT</span>
        </div>
        <div style="display:flex;align-items:center;gap:4px;">
          <button type="button" data-action="toggle-lock" style="padding:2px 6px;border-radius:4px;font-size:8.5px;font-weight:900;cursor:pointer;${lockBtnStyle}">
            ${lockLabel}
          </button>
          <button type="button" data-action="reset-auto" title="Restaurar reparto automático equilibrado"
                  style="padding:2px 6px;border-radius:4px;font-size:8.5px;font-weight:800;cursor:pointer;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.16);color:#CBD5E1;">
            ↺ Auto
          </button>
        </div>
      </div>
      ${brushBannerHtml}
      ${actionBarHtml}
      <div style="font-size:8px;color:#94A3B8;margin-bottom:2px;">
        Arrastra strings o usa las herramientas (🖌️ pincel 3D · ⇄ invertir · ✏️ nombre/color · ⚡ optimizador · ✂️ corte exacto).
      </div>
      ${invertersHtml}
    `;

    bindDelegatedEvents(container);
  }

  function bindDelegatedEvents(container) {
    if (_delegatedBound || !container) return;
    _delegatedBound = true;

    container.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const act = btn.getAttribute('data-action');
      const sName = btn.getAttribute('data-string');

      if (act === 'toggle-lock') toggleLock();
      else if (act === 'reset-auto') resetToAuto();
      else if (act === 'merge-selected') mergeSelectedStrings();
      else if (act === 'clear-custom') clearCustomStrings();
      else if (act === 'stop-brush') { _brushString = null; clearHighlight3D(); render(); }
      else if (act === 'toggle-brush' && sName) toggleBrush(sName);
      else if (act === 'new-string') createEmptyString(btn.getAttribute('data-mppt'));
      else if (act === 'reverse-string' && sName) reverseString(sName);
      else if (act === 'toggle-mlpe' && sName) toggleStringMLPE(sName);
      else if (act === 'equalize-mppt') equalizeMpptStrings(btn.getAttribute('data-mppt'));
      else if (act === 'open-split' && sName) openSplitEditor(sName);
      else if (act === 'cancel-split') { _splitEditorString = null; render(); }
      else if (act === 'confirm-split' && sName) confirmSplitString(sName, _splitEditorCount);
      else if (act === 'open-rename' && sName) openRenameEditor(sName);
      else if (act === 'delete-empty' && sName) deleteEmptyString(sName);
      else if (act === 'cancel-rename') { _renameEditorString = null; _renameDraft = ''; render(); }
      else if (act === 'confirm-rename' && sName) {
        const box = btn.closest('[data-rename-box]');
        const txt = box ? box.querySelector('[data-role="rename-input"]') : null;
        const col = box ? box.querySelector('[data-role="color-input"]') : null;
        confirmRenameString(sName, txt ? txt.value : '', col ? col.value : '');
      }
    });

    container.addEventListener('input', (e) => {
      const el = e.target;
      const role = el.getAttribute('data-role');
      if (el.getAttribute('data-action') === 'split-range') {
        const val = Number(el.value) || 1;
        const total = Number(el.getAttribute('data-total')) || 2;
        _splitEditorCount = val;
        const box = el.closest('[data-split-box]');
        const preview = box ? box.querySelector('[data-role="split-preview"]') : null;
        if (preview) preview.textContent = `A: ${val}m · B: ${total - val}m`;
      } else if (role === 'rename-input') {
        _renameDraft = el.value;
      } else if (role === 'color-input') {
        const pill = el.closest('.ra-mppt-string-pill');
        if (pill) {
          pill.style.borderLeftColor = el.value;
          pill.setAttribute('data-color', el.value);
        }
      }
    });

    container.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.getAttribute('data-role') === 'rename-input') {
        e.preventDefault();
        const sName = e.target.getAttribute('data-string');
        const box = e.target.closest('[data-rename-box]');
        const col = box ? box.querySelector('[data-role="color-input"]') : null;
        confirmRenameString(sName, e.target.value, col ? col.value : '');
      }
    });

    container.addEventListener('change', (e) => {
      const el = e.target;
      const act = el.getAttribute('data-action');
      const role = el.getAttribute('data-role');
      if (act === 'move-select') {
        const sName = el.getAttribute('data-string');
        if (sName) moveStringToMppt(sName, el.value);
      } else if (act === 'toggle-select') {
        const sName = el.getAttribute('data-string');
        if (!sName) return;
        if (el.checked) _selectedStrings.add(sName);
        else _selectedStrings.delete(sName);
        render();
      } else if (role === 'color-input') {
        const sName = el.getAttribute('data-string');
        if (sName) updateStringColor(sName, el.value);
      }
    });

    container.addEventListener('dragstart', (e) => {
      if (e.target && e.target.closest('.ra-mppt-inline-editor')) {
        e.preventDefault();
        return;
      }
      const pill = e.target.closest('.ra-mppt-string-pill');
      if (!pill) return;
      _draggingString = pill.getAttribute('data-string');
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', _draggingString || '');
      }
      pill.style.opacity = '0.5';
    });

    container.addEventListener('dragend', (e) => {
      const pill = e.target.closest('.ra-mppt-string-pill');
      if (pill) pill.style.opacity = '1';
      _draggingString = null;
      container.querySelectorAll('.ra-mppt-tray').forEach(t => {
        t.style.background = 'rgba(2,6,23,0.65)';
      });
    });

    container.addEventListener('dragover', (e) => {
      const tray = e.target.closest('.ra-mppt-tray');
      if (!tray) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      tray.style.background = 'rgba(56,189,248,0.12)';
    });

    container.addEventListener('dragleave', (e) => {
      const tray = e.target.closest('.ra-mppt-tray');
      if (tray && !tray.contains(e.relatedTarget)) {
        tray.style.background = 'rgba(2,6,23,0.65)';
      }
    });

    container.addEventListener('drop', (e) => {
      const tray = e.target.closest('.ra-mppt-tray');
      if (!tray) return;
      e.preventDefault();
      tray.style.background = 'rgba(2,6,23,0.65)';
      const sName = _draggingString || (e.dataTransfer ? e.dataTransfer.getData('text/plain') : '');
      const targetMppt = Number(tray.getAttribute('data-mppt'));
      _draggingString = null;
      if (sName && targetMppt >= 1) {
        moveStringToMppt(sName, targetMppt);
      }
    });

    container.addEventListener('mouseover', (e) => {
      if (_draggingString || isBrushActive()) return;
      const pill = e.target.closest('.ra-mppt-string-pill');
      if (pill) {
        const sName = pill.getAttribute('data-string');
        const color = pill.getAttribute('data-color');
        if (sName) highlight3DByFilter(p => p.stringName === sName, color);
        return;
      }
      const tray = e.target.closest('.ra-mppt-tray');
      if (tray) {
        const mNum = Number(tray.getAttribute('data-mppt'));
        if (mNum >= 1) highlight3DByFilter(p => Number(p.mpptId) === mNum, '#F59E0B');
      }
    });

    container.addEventListener('mouseleave', () => {
      if (isBrushActive()) return;
      clearHighlight3D();
    });
  }

  function scheduleRender() {
    if (_isSyncing || _renameEditorString || _splitEditorString) return;
    if (_rafId !== null) return;
    if (typeof requestAnimationFrame === 'function') {
      _rafId = requestAnimationFrame(() => {
        _rafId = null;
        if (_renameEditorString || _splitEditorString) return;
        render();
      });
    } else {
      render();
    }
  }

  const api = {
    render,
    scheduleRender,
    isBrushActive,
    handlePanelBrushClick,
    toggleBrush,
    createEmptyString,
    deleteEmptyString,
    moveStringToMppt,
    mergeSelectedStrings,
    splitString: openSplitEditor,
    openSplitEditor,
    confirmSplitString,
    reverseString,
    openRenameEditor,
    confirmRenameString,
    updateStringColor,
    toggleStringMLPE,
    equalizeMpptStrings,
    clearCustomStrings,
    toggleLock,
    resetToAuto,
    clearHighlight3D
  };

  let _lifecycleBound = false;
  function initLifecycle() {
    if (_lifecycleBound) return;
    _lifecycleBound = true;

    const hookAll = () => {
      if (root.WorkflowOrchestrator && typeof root.WorkflowOrchestrator.on === 'function') {
        root.WorkflowOrchestrator.on('step_changed', () => scheduleRender());
      }
      if (typeof root.step3UpdateHardwareSelection === 'function' && !root.step3UpdateHardwareSelection._raMpptWrapped) {
        const origHw = root.step3UpdateHardwareSelection;
        const wrappedHw = function () {
          const res = origHw.apply(this, arguments);
          scheduleRender();
          return res;
        };
        wrappedHw._raMpptWrapped = true;
        root.step3UpdateHardwareSelection = wrappedHw;
      }
      scheduleRender();
    };

    if (typeof document !== 'undefined' && document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', hookAll);
    } else {
      hookAll();
    }
  }

  root.RAMPPTMatrix = api;
  if (!root.RA) root.RA = {};
  root.RA.MPPTMatrix = api;
  initLifecycle();
})(typeof window !== 'undefined' ? window : globalThis);
