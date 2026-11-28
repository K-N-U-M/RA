// ============================================================================
// SUITE DE SELECCIÓN Y MODELADO CAD / BIM PROFESIONAL
// 1. Pre-selección / Hover Feedback inteligente (60 FPS throttled)
// 2. Ciclo en Profundidad (Tab-Cycling y clics sucesivos)
// 3. Modo Foco / Ghosting de planos de trabajo inactivos
// 4. Selección por Ventana / Marco (Ventana Azul vs Ventana Verde)
// ============================================================================

(function(global) {
  'use strict';

  // --- ESTADO GLOBAL DE LA SUITE CAD ---
  global.cadFocusMode = true; // Por defecto activado: planos inactivos en modo ghosting
  global.cadSelectionFilter = 'all'; // Filtro de puntería: 'all' | 'panels' | 'vertices' | 'obstacles' | 'polylines'
  global.cadHoverTarget = null;
  global.cadCyclingState = {
    lastClickPos: null,
    lastClickTime: 0,
    candidates: [],
    candidateIdx: -1
  };
  global.cadMarqueeState = {
    active: false,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    isShift: false
  };

  // --- 0. FILTROS DE PUNTERÍA CAD (TARGET FILTERS) ---
  const CAD_FILTERS = [
    { id: 'all', label: 'TODO', desc: 'Selección universal multiescala' },
    { id: 'panels', label: 'PLACAS', desc: 'Selección exclusiva de paneles solares FV' },
    { id: 'vertices', label: 'VÉRTICES', desc: 'Selección exclusiva de esquinas y vértices 3D' },
    { id: 'obstacles', label: 'OBSTÁCULOS', desc: 'Selección exclusiva de chimeneas y casetones' },
    { id: 'polylines', label: 'FALDONES', desc: 'Selección exclusiva de contornos y faldones' }
  ];

  function setCADSelectionFilter(filterId) {
    const found = CAD_FILTERS.find(f => f.id === filterId);
    if (!found) return;
    global.cadSelectionFilter = found.id;
    updateCADFilterUI(found);
  }
  global.setCADSelectionFilter = setCADSelectionFilter;

  function cycleCADSelectionFilter() {
    const curIdx = CAD_FILTERS.findIndex(f => f.id === (global.cadSelectionFilter || 'all'));
    const nextIdx = (curIdx + 1) % CAD_FILTERS.length;
    const nextF = CAD_FILTERS[nextIdx];
    global.cadSelectionFilter = nextF.id;
    updateCADFilterUI(nextF);
  }
  global.cycleCADSelectionFilter = cycleCADSelectionFilter;

  function updateCADFilterUI(filterObj) {
    const tag = document.getElementById('tag-cad-filter');
    const btn = document.getElementById('btn-cad-filter');
    if (tag) {
      tag.textContent = filterObj.label;
      if (filterObj.id === 'all') {
        tag.style.background = 'rgba(56,189,248,0.2)';
        tag.style.color = '#38BDF8';
      } else {
        tag.style.background = 'rgba(245,158,11,0.25)';
        tag.style.color = '#FBBF24';
      }
    }
    if (btn) {
      btn.style.borderColor = (filterObj.id === 'all') ? 'rgba(56,189,248,0.4)' : 'rgba(245,158,11,0.6)';
    }
    if (typeof global.showToast === 'function') {
      global.showToast(
        `FILTRO CAD: ${filterObj.label}`,
        filterObj.desc + ' (Atajo: F)',
        (filterObj.id === 'all') ? 'info' : 'warning',
        2000
      );
    }
    if (typeof global.requestTriadRedraw === 'function') {
      global.requestTriadRedraw();
    } else if (typeof global.renderTriad2D === 'function') {
      global.renderTriad2D();
    }
  }

  // --- 1. MODO FOCO (GHOSTING DE PLANOS INACTIVOS) ---
  function toggleCADFocusMode() {
    global.cadFocusMode = !global.cadFocusMode;
    const btn = document.getElementById('btn-toggle-cad-focus');
    const tag = document.getElementById('tag-focus-status');
    if (tag) {
      tag.textContent = global.cadFocusMode ? 'ON' : 'OFF';
      tag.style.background = global.cadFocusMode ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)';
      tag.style.color = global.cadFocusMode ? '#34D399' : '#EF4444';
    }
    if (btn) {
      btn.style.borderColor = global.cadFocusMode ? 'rgba(56,189,248,0.5)' : 'rgba(255,255,255,0.15)';
    }

    // Refrescar polilíneas y paneles con el nuevo estado de foco
    if (typeof global.wpRenderAllPolylines === 'function') {
      global.wpRenderAllPolylines();
    }
    if (typeof global.wpFastRenderSimulatedPanels === 'function') {
      global.wpFastRenderSimulatedPanels(true);
    }
    if (typeof global.showToast === 'function') {
      global.showToast(
        global.cadFocusMode ? 'MODO FOCO ACTIVADO' : 'MODO FOCO DESACTIVADO',
        global.cadFocusMode ? 'Las cubiertas inactivas se atenúan para centrar el trabajo en el plano activo.' : 'Todas las cubiertas se muestran con opacidad y color completo.',
        'info',
        2500
      );
    }
  }
  global.toggleCADFocusMode = toggleCADFocusMode;

  // --- REGISTRO CENTRALIZADO DE LISTENERS PARA DESTROY / CLEANUP ---
  const _cadSuiteCleanup = [];
  let _cadSuiteInitialized = false;
  function _addManagedListener(target, type, handler, options) {
    if (!target || typeof target.addEventListener !== 'function') return;
    target.addEventListener(type, handler, options);
    _cadSuiteCleanup.push(function () {
      try {
        if (typeof target.removeEventListener === 'function') {
          target.removeEventListener(type, handler, options);
        }
      } catch (_) {}
    });
  }

  // --- 2. PRE-SELECCIÓN / HOVER FEEDBACK ENGINE ---
  let _hoverRafId = null;
  let _lastHoverX = -1;
  let _lastHoverY = -1;

  function _isMeasureToolActive() {
    return Boolean(global.RAMeasureTool && typeof global.RAMeasureTool.isActive === 'function' && global.RAMeasureTool.isActive());
  }

  function initCADSafeguardListeners() {
    if (typeof window === 'undefined') return;
    // Safeguard global: evitar que _isPointerButtonsDown quede bloqueado si se suelta el botón fuera del canvas
    _addManagedListener(window, 'pointerup', () => { global._isPointerButtonsDown = false; }, true);
    _addManagedListener(window, 'blur', () => { global._isPointerButtonsDown = false; global._isCameraMoving = false; });
  }

  function updateCADHover(screenPos) {
    if (!screenPos || typeof screenPos.x !== 'number' || typeof screenPos.y !== 'number') return;

    // Pausar completamente el hover (y cualquier pick/drillPick) cuando la cinta métrica 3D está activa
    if (_isMeasureToolActive()) {
      if (_hoverRafId) {
        cancelAnimationFrame(_hoverRafId);
        _hoverRafId = null;
      }
      if (global.cadHoverTarget) {
        global.cadHoverTarget = null;
        if (typeof global.requestTriadRedraw === 'function') global.requestTriadRedraw();
        else if (typeof global.renderTriad2D === 'function') global.renderTriad2D();
      }
      return;
    }

    const viewer = global.viewer;
    if (!viewer || !viewer.scene) return;
    const scene = viewer.scene;

    // [PERF AAA] Congelar hover completamente si la cámara está en movimiento, con botón pulsado o arrastrando gizmo
    if (global._isCameraMoving || global._isPointerButtonsDown) return;
    if (global.universalGizmoState && global.universalGizmoState.active) return;
    if (global.cadMarqueeState.active) return;
    if (global.WP && (global.WP.mode === 'draw-poly' || global.WP.mode === 'draw-building' || global.WP.mode === 'place-obs' || global.WP.mode === 'stamp-poly')) return;

    // Clonar coordenadas (Cesium reutiliza el objeto movement.endPosition entre frames)
    const posSnap = { x: screenPos.x, y: screenPos.y };

    // Descarte sub-píxel: si el ratón se movió menos de 1.5px, no re-evaluar
    if (Math.abs(posSnap.x - _lastHoverX) < 1.5 && Math.abs(posSnap.y - _lastHoverY) < 1.5) return;

    _lastHoverX = posSnap.x;
    _lastHoverY = posSnap.y;

    if (_hoverRafId) cancelAnimationFrame(_hoverRafId);
    _hoverRafId = requestAnimationFrame(() => {
      _hoverRafId = null;
      if (_isMeasureToolActive() || global._isCameraMoving || global._isPointerButtonsDown) return;
      evaluateHoverTarget(posSnap, scene);
    });
  }

  function evaluateHoverTarget(screenPos, scene) {
    let target = null;
    const filter = global.cadSelectionFilter || 'all';

    // ── NIVEL 2: VÉRTICES Y PUNTOS (DIMENSIÓN 0 · IMÁN UNIFICADO DE 20px)
    if (filter === 'all' || filter === 'vertices') {
      // A. Vértice de plano de trabajo activo (Paso 1)
      const curStepForHover = (typeof global.wpCurrentStep !== 'undefined') ? global.wpCurrentStep : ((typeof global.WP !== 'undefined' && global.WP) ? global.WP.step : 1);
      if (curStepForHover === 1 && global.WP && typeof global.wpGetActivePlane === 'function') {
        const actPl = global.wpGetActivePlane();
        if (actPl && Array.isArray(actPl.pts3D) && actPl.pts3D.length >= 3 && actPl.visible !== false) {
          for (let vi = 0; vi < 3; vi++) {
            const pt = actPl.pts3D[vi];
            if (!pt) continue;
            const ptWin = Cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, pt);
            if (ptWin && Math.hypot(screenPos.x - ptWin.x, screenPos.y - ptWin.y) <= 20) {
              const vtxLabels = ['P1 (Origen)', 'P2 (Eje X)', 'P3 (Eje Y)'];
              target = {
                type: 'vertex',
                subType: 'plane_vertex',
                vIdx: vi,
                label: `VÉRTICE PLANO #${vi + 1} (${vtxLabels[vi]})`,
                screenPos: ptWin,
                point3D: pt
              };
              break;
            }
          }
        }
      }

      // B. Vértice de polilínea / faldón (activa o visibles)
      if (!target && global.WP && global.WP.polylines && global.WP.polylines.length > 0) {
        const selIdx = (typeof global.WP.selectedPolyIdx === 'number') ? global.WP.selectedPolyIdx : -1;
        const searchList = (selIdx >= 0 && global.WP.polylines[selIdx])
          ? [ { poly: global.WP.polylines[selIdx], idx: selIdx } ]
          : global.WP.polylines.map((p, i) => ({ poly: p, idx: i }));

        for (const item of searchList) {
          const poly = item.poly;
          if (!poly || poly.visible === false || !Array.isArray(poly.points)) continue;
          for (let vi = 0; vi < poly.points.length; vi++) {
            const pt = poly.points[vi];
            if (!pt) continue;
            const ptWin = Cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, pt);
            if (ptWin && Math.hypot(screenPos.x - ptWin.x, screenPos.y - ptWin.y) <= 20) {
              target = {
                type: 'vertex',
                subType: 'polyline_vertex',
                polyIdx: item.idx,
                vIdx: vi,
                label: `VÉRTICE FALFÓN #${vi + 1}`,
                screenPos: ptWin,
                point3D: pt
              };
              break;
            }
          }
          if (target) break;
        }
      }

      // C. Vértice de huella de edificio (base y coronación)
      if (!target && Array.isArray(global.buildings) && global.buildings.length > 0) {
        const selBld = (typeof global.selectedBuildingId !== 'undefined' && global.selectedBuildingId)
          ? global.buildings.find(b => b.id === global.selectedBuildingId)
          : null;
        const bldList = selBld ? [selBld] : global.buildings;
        for (const b of bldList) {
          if (!b.points || b.visible === false) continue;
          const bH = b.height || 6.0;
          for (let vi = 0; vi < b.points.length; vi++) {
            const ptBase = b.points[vi];
            if (!ptBase) continue;
            const ptWin = Cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, ptBase);
            if (ptWin && Math.hypot(screenPos.x - ptWin.x, screenPos.y - ptWin.y) <= 20) {
              target = {
                type: 'vertex',
                subType: 'building_vertex',
                bldId: b.id,
                vIdx: vi,
                label: `VÉRTICE EDIFICIO #${vi + 1}`,
                screenPos: ptWin,
                point3D: ptBase
              };
              break;
            }
            const c = Cesium.Cartographic.fromCartesian(ptBase);
            if (c) {
              const ptRoof = Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, c.height + bH);
              const ptWinRoof = Cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, ptRoof);
              if (ptWinRoof && Math.hypot(screenPos.x - ptWinRoof.x, screenPos.y - ptWinRoof.y) <= 20) {
                target = {
                  type: 'vertex',
                  subType: 'building_vertex',
                  bldId: b.id,
                  vIdx: vi,
                  label: `VÉRTICE ALERO #${vi + 1}`,
                  screenPos: ptWinRoof,
                  point3D: ptBase
                };
                break;
              }
            }
          }
          if (target) break;
        }
      }
    }

    // ── NIVEL 3: OBJETOS COMPACTOS (PANELES, AEROGENERADORES, EQUIPOS ELÉCTRICOS, OBSTÁCULOS)
    // [PERF AAA · ZERO-READPIXELS]: Durante hover continuo usamos proyección matemática 2D pura (0 ms GPU stall).
    // A. Detectar panel solar bajo el cursor (pasando true para omitir scene.pick/drillPick)
    if (!target && (filter === 'all' || filter === 'panels') && typeof global.pickPanelUnderCursor === 'function') {
      const pIdx = global.pickPanelUnderCursor(screenPos, true);
      if (pIdx >= 0 && Array.isArray(global.allRenderedPanels) && global.allRenderedPanels[pIdx]) {
        const pan = global.allRenderedPanels[pIdx];
        if (pan && pan.corners && pan.corners.length === 4) {
          target = {
            type: 'panel',
            index: pIdx,
            panel: pan,
            label: `MÓDULO FV #${pIdx + 1}`
          };
        }
      }
    }

    // B. Detectar obstáculo 3D (modo analítico 2D/UV sin bloquear GPU)
    if (!target && (filter === 'all' || filter === 'obstacles') && typeof global.pickObstacleUnderCursor === 'function') {
      const obs = global.pickObstacleUnderCursor(screenPos, true);
      if (obs) {
        target = {
          type: 'obstacle',
          id: obs.id,
          label: `OBSTÁCULO: ${obs.name || 'Chimenea'}`
        };
      }
    }

    // C. Detectar equipamiento eléctrico (modo analítico 2D en pantalla sin bloquear GPU)
    if (!target && filter === 'all' && typeof global.pickElectricalObjectUnderCursor === 'function') {
      const elec = global.pickElectricalObjectUnderCursor(screenPos, true);
      if (elec) {
        target = {
          type: 'electrical',
          id: elec.id,
          label: `EQUIPO: ${elec.name || 'Inversor'}`
        };
      }
    }

    // ── NIVEL 4: SUPERFICIES Y CONTORNOS (POLILÍNEAS / FALDONES Y PLANOS · TEST 2D PURO)
    if (!target && (filter === 'all' || filter === 'polylines')) {
      if (global.WP && Array.isArray(global.WP.polylines)) {
        for (let pi = 0; pi < global.WP.polylines.length; pi++) {
          const poly = global.WP.polylines[pi];
          if (!poly || poly.visible === false || !Array.isArray(poly.points) || poly.points.length < 3) continue;
          const scrPts = poly.points.map(p => Cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, p)).filter(Boolean);
          if (scrPts.length >= 3 && isPointIn2DPolygon(screenPos, scrPts)) {
            target = {
              type: 'polyline',
              index: pi,
              poly: poly,
              label: poly.name || `Faldón #${pi + 1}`
            };
            break;
          }
        }
      }
    }

    // ── NIVEL 5: VOLÚMENES ARQUITECTÓNICOS (EDIFICIOS COMPLETOS)
    if (!target && filter === 'all') {
      const activeStep = (typeof global.wpCurrentStep !== 'undefined')
        ? global.wpCurrentStep
        : ((typeof global.WP !== 'undefined' && global.WP && typeof global.WP.step !== 'undefined') ? global.WP.step : 1);
      if (activeStep <= 1 && Array.isArray(global.buildings)) {
        for (const b of global.buildings) {
          if (!b || b.visible === false || !Array.isArray(b.points) || b.points.length < 3) continue;
          const scrPts = b.points.map(p => Cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, p)).filter(Boolean);
          if (scrPts.length >= 3 && isPointIn2DPolygon(screenPos, scrPts)) {
            target = {
              type: 'building',
              id: b.id,
              label: `Edificio: ${b.name}`
            };
            break;
          }
        }
      }
    }

    // Renderizar en el canvas 2D solo si el objetivo de hover ha cambiado respecto al frame previo
    const prevT = global.cadHoverTarget;
    const changed = (!prevT && !!target) || (!!prevT && !target) ||
      (prevT && target && (prevT.type !== target.type || prevT.index !== target.index || prevT.id !== target.id || prevT.vIdx !== target.vIdx));
    global.cadHoverTarget = target;
    if (scene.canvas) {
      if (target) {
        scene.canvas.style.cursor = 'pointer';
      } else if (!scene.canvas.style.cursor || scene.canvas.style.cursor === 'pointer') {
        scene.canvas.style.cursor = 'default';
      }
    }

    if (changed && typeof global.renderTriad2D === 'function') {
      global.renderTriad2D();
    }
  }

  // Renderizar feedback visual del Hover en el canvas 2D (Zero-ShadowBlur Hardware Accelerated)
  function renderCADHoverOverlay(ctx, scene) {
    const t = global.cadHoverTarget;
    if (!t || !ctx || !scene) return;

    ctx.save();
    if (t.type === 'vertex' && t.screenPos) {
      // Halo exterior translúcido rápido (sustituye shadowBlur por software)
      ctx.beginPath();
      ctx.arc(t.screenPos.x, t.screenPos.y, 11, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.28)';
      ctx.lineWidth = 4.0;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(t.screenPos.x, t.screenPos.y, 8, 0, Math.PI * 2);
      ctx.strokeStyle = '#38BDF8';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(t.screenPos.x, t.screenPos.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();

      // Etiqueta tooltip flotante
      ctx.font = 'bold 9px "JetBrains Mono", monospace';
      const label = t.label || ((t.subType === 'building_vertex') ? `EDIFICIO #${t.vIdx + 1}` : `VÉRTICE #${t.vIdx + 1}`);
      const textW = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(15,23,42,0.88)';
      ctx.fillRect(t.screenPos.x + 12, t.screenPos.y - 12, textW + 8, 16);
      ctx.strokeStyle = 'rgba(56,189,248,0.6)';
      ctx.lineWidth = 1;
      ctx.strokeRect(t.screenPos.x + 12, t.screenPos.y - 12, textW + 8, 16);
      ctx.fillStyle = '#38BDF8';
      ctx.fillText(label, t.screenPos.x + 16, t.screenPos.y);

    } else if (t.type === 'panel' && t.panel && Array.isArray(t.panel.corners)) {
      // Marco sutil cian pre-selección sobre las 4 esquinas proyectadas (sin shadowBlur)
      const scrCorners = t.panel.corners.map(c => Cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, c)).filter(Boolean);
      if (scrCorners.length === 4) {
        ctx.beginPath();
        ctx.moveTo(scrCorners[0].x, scrCorners[0].y);
        ctx.lineTo(scrCorners[1].x, scrCorners[1].y);
        ctx.lineTo(scrCorners[2].x, scrCorners[2].y);
        ctx.lineTo(scrCorners[3].x, scrCorners[3].y);
        ctx.closePath();
        ctx.fillStyle = 'rgba(56,189,248,0.14)';
        ctx.fill();
        ctx.strokeStyle = '#38BDF8';
        ctx.lineWidth = 2.0;
        ctx.stroke();
      }
    } else if (t.type === 'polyline' && t.poly && Array.isArray(t.poly.points) && t.poly.points.length >= 3) {
      // Contorno suave animado del faldón
      const scrPts = t.poly.points.map(p => Cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, p)).filter(Boolean);
      if (scrPts.length >= 3) {
        ctx.beginPath();
        ctx.moveTo(scrPts[0].x, scrPts[0].y);
        for (let i = 1; i < scrPts.length; i++) {
          ctx.lineTo(scrPts[i].x, scrPts[i].y);
        }
        ctx.closePath();
        ctx.strokeStyle = '#38BDF8';
        ctx.lineWidth = 2.0;
        ctx.setLineDash([6, 4]);
        ctx.fillStyle = 'rgba(56, 189, 248, 0.08)';
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  global.renderCADHoverOverlay = renderCADHoverOverlay;

  // --- 3. CICLO DE CLIC EN PROFUNDIDAD (TAB-CYCLING) ---
  function getCandidateEntitiesUnderScreenPos(screenPos) {
    if (_isMeasureToolActive()) return [];
    const viewer = global.viewer;
    if (!viewer || !viewer.scene) return [];
    const scene = viewer.scene;
    const candidates = [];

    // 1. Panel solar
    if (typeof global.pickPanelUnderCursor === 'function') {
      const pIdx = global.pickPanelUnderCursor(screenPos);
      if (pIdx >= 0) {
        const pan = global.allRenderedPanels && global.allRenderedPanels[pIdx];
        const fName = pan && typeof pan.polyIdx === 'number' && global.WP && global.WP.polylines && global.WP.polylines[pan.polyIdx]
          ? global.WP.polylines[pan.polyIdx].name : ('Faldón #' + ((pan ? pan.polyIdx : 0) + 1));
        candidates.push({
          type: 'panel',
          index: pIdx,
          label: `Placa #${pIdx + 1} (${fName})`
        });
      }
    }

    // 2. Obstáculos
    if (typeof scene.drillPick === 'function') {
      try {
        const drilled = scene.drillPick(screenPos, 20);
        if (Array.isArray(drilled) && Array.isArray(global.obstacles) && global.obstacles.length > 0) {
          const obsMap = new Map();
          for (let oi = 0; oi < global.obstacles.length; oi++) {
            const o = global.obstacles[oi];
            if (o && o.id !== undefined) obsMap.set(o.id, o);
          }
          const seenObsIds = new Set();
          drilled.forEach(item => {
            if (!item || !item.id) return;
            const rawId = (typeof item.id === 'string') ? item.id : (item.id.id || '');
            const idStr = rawId.replace(/^(obs_box_prim_|obs_tree_trunk_prim_|obs_tree_canopy_prim_|obs_buffer_prim_)/, '');
            const obsObj = obsMap.get(idStr);
            if (obsObj && !seenObsIds.has(idStr)) {
              seenObsIds.add(idStr);
              candidates.push({
                type: 'obstacle',
                id: idStr,
                label: `Obstáculo: ${obsObj.name || 'Chimenea/Casetón'}`
              });
            }
          });
        }
      } catch (_) {}
    }

    // 3. Faldón / Polilínea
    if (global.WP && Array.isArray(global.WP.polylines)) {
      global.WP.polylines.forEach((poly, polyIdx) => {
        if (!poly || poly.visible === false || !Array.isArray(poly.points) || poly.points.length < 3) return;
        // Test rápido de punto interior en polígono 2D de pantalla
        const scrPts = poly.points.map(p => Cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, p)).filter(Boolean);
        if (scrPts.length >= 3 && isPointIn2DPolygon(screenPos, scrPts)) {
          if (!candidates.some(c => c.type === 'polyline' && c.index === polyIdx)) {
            candidates.push({
              type: 'polyline',
              index: polyIdx,
              label: `${poly.name || ('Faldón #' + (polyIdx + 1))}`
            });
          }
        }
      });
    }

    // 4. Edificio
    if (global.buildings && Array.isArray(global.buildings)) {
      global.buildings.forEach(b => {
        if (!b || b.visible === false || !Array.isArray(b.points) || b.points.length < 3) return;
        const scrPts = b.points.map(p => Cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, p)).filter(Boolean);
        if (scrPts.length >= 3 && isPointIn2DPolygon(screenPos, scrPts)) {
          if (!candidates.some(c => c.type === 'building' && c.id === b.id)) {
            candidates.push({
              type: 'building',
              id: b.id,
              label: `Edificio: ${b.name}`
            });
          }
        }
      });
    }

    // 5. Plano de trabajo activo
    if (global.WP && Array.isArray(global.WP.planes) && global.WP.activePlaneIdx >= 0 && global.WP.planes[global.WP.activePlaneIdx]) {
      const pl = global.WP.planes[global.WP.activePlaneIdx];
      candidates.push({
        type: 'plane',
        index: global.WP.activePlaneIdx,
        label: `Plano: ${pl.name || ('Plano #' + (global.WP.activePlaneIdx + 1))}`
      });
    }

    return candidates;
  }

  function executeCADSelectionCandidate(cand) {
    if (!cand) return;
    if (cand.type === 'panel') {
      if (typeof global.selectPanel === 'function') global.selectPanel(cand.index);
    } else if (cand.type === 'obstacle') {
      if (typeof global.selectObstacle === 'function') global.selectObstacle(cand.id);
    } else if (cand.type === 'polyline') {
      if (typeof global.wpSelectPolyline === 'function') global.wpSelectPolyline(cand.index);
    } else if (cand.type === 'building') {
      if (typeof global.selectBuilding === 'function') global.selectBuilding(cand.id);
    } else if (cand.type === 'plane') {
      if (typeof global.wpSelectActivePlane === 'function') global.wpSelectActivePlane(cand.index, false);
    }
  }

  function cycleNextCADSelection(reverse = false) {
    const s = global.cadCyclingState;
    if (!s.candidates || s.candidates.length <= 1) return false;

    if (reverse) {
      s.candidateIdx = (s.candidateIdx - 1 + s.candidates.length) % s.candidates.length;
    } else {
      s.candidateIdx = (s.candidateIdx + 1) % s.candidates.length;
    }

    const nextTarget = s.candidates[s.candidateIdx];
    executeCADSelectionCandidate(nextTarget);

    if (typeof global.showStatus === 'function') {
      global.showStatus(
        `<i data-lucide="layers" class="icon-sm"></i> [TAB] CICLO CAD (${s.candidateIdx + 1}/${s.candidates.length}): ${nextTarget.label}`,
        2000
      );
    }
    return true;
  }

  function initCADCyclingListeners() {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    // Tecla Tab para ciclar en profundidad
    _addManagedListener(window, 'keydown', function(e) {
      const isEditingText = (function () {
        if (typeof global.isTextInputActive === 'function' && global.isTextInputActive(e.target)) return true;
        const active = document.activeElement;
        if (!active) return false;
        const tag = active.tagName ? active.tagName.toLowerCase() : '';
        return tag === 'input' || tag === 'textarea' || tag === 'select' || active.isContentEditable || (typeof active.closest === 'function' && Boolean(active.closest('[contenteditable="true"]')));
      })();
      if (isEditingText) return;

      if (e.key === 'Tab') {
        if (_isMeasureToolActive()) return;
        // Si el ratón está en la escena, interceptar Tab para ciclar capas CAD
        const mousePos = { x: _lastHoverX, y: _lastHoverY };
        if (mousePos.x > 0 && mousePos.y > 0) {
          e.preventDefault();
          const candidates = getCandidateEntitiesUnderScreenPos(mousePos);
          if (candidates.length > 1) {
            global.cadCyclingState.candidates = candidates;
            cycleNextCADSelection(e.shiftKey);
          }
        }
      } else if (!e.ctrlKey && !e.altKey && !e.metaKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        // Desplazamiento de precisión de placas (Opción 2) si hay placas seleccionadas o faldón activo
        const hasSelectedPanels = (Array.isArray(global.selectedPanelIndices) && global.selectedPanelIndices.length > 0) || (typeof global.selectedPanelIndex === 'number' && global.selectedPanelIndex >= 0);
        const activePolyIdx = (global.WP && typeof global.WP.selectedPolyIdx === 'number') ? global.WP.selectedPolyIdx : -1;

        if ((hasSelectedPanels || activePolyIdx >= 0) && typeof global.wpShiftPolylinePanels === 'function') {
          // Determinar target polyIdx
          let targetPoly = activePolyIdx;
          if (targetPoly < 0 && hasSelectedPanels && Array.isArray(global.allRenderedPanels)) {
            const firstIdx = (global.selectedPanelIndices && global.selectedPanelIndices.length > 0) ? global.selectedPanelIndices[0] : global.selectedPanelIndex;
            const p = global.allRenderedPanels[firstIdx];
            if (p && typeof p.polyIdx === 'number') targetPoly = p.polyIdx;
          }

          if (targetPoly >= 0 && global.WP && global.WP.polylines && global.WP.polylines[targetPoly]) {
            e.preventDefault();
            e.stopPropagation();

            const step = e.shiftKey ? 0.10 : 0.01; // 10cm con Shift, 1cm por defecto
            let deltaA = 0;
            let deltaB = 0;

            if (e.key === 'ArrowLeft') deltaA = -step;
            else if (e.key === 'ArrowRight') deltaA = step;
            else if (e.key === 'ArrowUp') deltaB = step;
            else if (e.key === 'ArrowDown') deltaB = -step;

            global.wpShiftPolylinePanels(targetPoly, deltaA, deltaB);
            return;
          }
        }
      } else if ((e.key === 'f' || e.key === 'F') && e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
        // Atajo Shift + F: Alternar Modo Foco
        e.preventDefault();
        toggleCADFocusMode();
      } else if ((e.key === 'f' || e.key === 'F') && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
        // Atajo F: Ciclar Filtro de Puntería CAD
        const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
        if (activeTag !== 'input' && activeTag !== 'textarea' && activeTag !== 'select') {
          e.preventDefault();
          cycleCADSelectionFilter();
        }
      }
    });

    // Clics consecutivos en el mismo punto para alternar capas
    _addManagedListener(window, 'pointerdown', function(e) {
      global._isPointerButtonsDown = true;
      if (_isMeasureToolActive()) return;
      if ((e.target && e.target.id === 'cesiumContainer') || (e.target && e.target.tagName === 'CANVAS')) {
        const now = Date.now();
        const pos = { x: e.clientX, y: e.clientY };
        const s = global.cadCyclingState;

        if (s.lastClickPos && Math.hypot(pos.x - s.lastClickPos.x, pos.y - s.lastClickPos.y) < 6 && (now - s.lastClickTime) < 1200) {
          // Es un clic sucesivo en el mismo píxel: regenerar candidatos perezosamente solo si aún no se calcularon
          if (!s.candidates || s.candidates.length === 0) {
            s.candidates = getCandidateEntitiesUnderScreenPos(pos);
            s.candidateIdx = 0;
          }
          if (s.candidates && s.candidates.length > 1) {
            cycleNextCADSelection(false);
          }
        } else {
          // Nuevo clic: guardar posición sin ejecutar drillPick en pointerdown (0 ms bloqueo al iniciar giro de cámara)
          s.lastClickPos = pos;
          s.lastClickTime = now;
          s.candidates = null;
          s.candidateIdx = 0;
        }
      }
    });
    _addManagedListener(window, 'pointerup', function() {
      global._isPointerButtonsDown = false;
    });
    _addManagedListener(window, 'pointercancel', function() {
      global._isPointerButtonsDown = false;
    });
  }

  // --- 4. SELECCIÓN POR VENTANA / MARCO (MARQUEE BOX SELECTION) ---
  function initCADMarqueeListeners() {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;

    _addManagedListener(window, 'pointerdown', function(e) {
      if (_isMeasureToolActive()) return;
      // Activar con Shift + Drag O arrastrar en vacío con botón izquierdo
      if (e.button !== 0) return;
      const targetTag = e.target ? e.target.tagName.toLowerCase() : '';
      if (targetTag !== 'canvas' && e.target.id !== 'cesiumContainer') return;

      // No activar si estamos dibujando polilíneas o colocando objetos
      if (global.WP && (global.WP.mode === 'draw-poly' || global.WP.mode === 'draw-building' || global.WP.mode === 'place-obs')) return;
      if (global.universalGizmoState && global.universalGizmoState.active) return;

      const hitGizmo = (typeof global.checkUniversalGizmoHit === 'function') ? global.checkUniversalGizmoHit(e.clientX, e.clientY) : null;
      if (hitGizmo) return;

      // Si pulsamos Shift sobre el canvas sin arrastrar gizmo -> iniciar Marquee sin choque con órbita Cesium
      const shouldStartMarquee = e.shiftKey;
      if (shouldStartMarquee) {
        e.stopPropagation();
        global.cadMarqueeState.active = true;
        global.cadMarqueeState.startX = e.clientX;
        global.cadMarqueeState.startY = e.clientY;
        global.cadMarqueeState.currentX = e.clientX;
        global.cadMarqueeState.currentY = e.clientY;
        global.cadMarqueeState.isShift = e.shiftKey;

        // Congelar cámara durante el trazado del marco
        const scene = global.viewer ? global.viewer.scene : null;
        if (scene && scene.screenSpaceCameraController) {
          scene.screenSpaceCameraController.enableRotate = false;
          scene.screenSpaceCameraController.enableTranslate = false;
          scene.screenSpaceCameraController.enableZoom = false;
          scene.screenSpaceCameraController.enableTilt = false;
        }
      }
    }, true);

    _addManagedListener(window, 'pointermove', function(e) {
      updateCADHover({ x: e.clientX, y: e.clientY });

      if (global.cadMarqueeState.active) {
        global.cadMarqueeState.currentX = e.clientX;
        global.cadMarqueeState.currentY = e.clientY;
        if (typeof global.requestTriadRedraw === 'function') {
          global.requestTriadRedraw();
        } else if (typeof global.renderTriad2D === 'function') {
          global.renderTriad2D();
        }
      }
    });

    function finishOrCancelMarquee(e, cancelled) {
      if (!global.cadMarqueeState.active) return;
      const m = global.cadMarqueeState;
      m.active = false;

      // Restaurar navegación de cámara
      const scene = global.viewer ? global.viewer.scene : null;
      if (scene && scene.screenSpaceCameraController) {
        scene.screenSpaceCameraController.enableRotate = true;
        scene.screenSpaceCameraController.enableTranslate = true;
        scene.screenSpaceCameraController.enableZoom = true;
        scene.screenSpaceCameraController.enableTilt = true;
      }

      if (!cancelled) {
        const dx = m.currentX - m.startX;
        const dy = m.currentY - m.startY;
        if (Math.hypot(dx, dy) > 8) {
          m._justFinishedAt = Date.now();
          executeMarqueeBoxSelection(m.startX, m.startY, m.currentX, m.currentY, e && (e.ctrlKey || e.metaKey));
        }
      }

      if (typeof global.requestTriadRedraw === 'function') {
        global.requestTriadRedraw();
      } else if (typeof global.renderTriad2D === 'function') {
        global.renderTriad2D();
      }
    }

    _addManagedListener(window, 'pointerup', function(e) { finishOrCancelMarquee(e, false); });
    _addManagedListener(window, 'pointercancel', function(e) { finishOrCancelMarquee(e, true); });
  }

  function executeMarqueeBoxSelection(x1, y1, x2, y2, isAdditive) {
    const viewer = global.viewer;
    if (!viewer || !viewer.scene) return;
    const scene = viewer.scene;

    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);

    // Regla de Oro CAD:
    // x2 >= x1: Arrastre Izquierda -> Derecha: Ventana Azul (Inclusión 100%)
    // x2 < x1:  Arrastre Derecha -> Izquierda: Ventana Verde (Intersección / Cruce)
    const isWindowInclusion = (x2 >= x1);

    const filter = global.cadSelectionFilter || 'all';
    const panels = (filter === 'all' || filter === 'panels') && Array.isArray(global.allRenderedPanels) && global.allRenderedPanels.length > 0
      ? global.allRenderedPanels : [];

    const matchedIndices = [];

    panels.forEach((p, idx) => {
      if (!p || p.visible === false || !Array.isArray(p.corners) || p.corners.length !== 4) return;
      if (typeof p.polyIdx === 'number' && global.WP && global.WP.polylines && global.WP.polylines[p.polyIdx] && global.WP.polylines[p.polyIdx].panelsVisible === false) return;

      const scrCorners = p.corners.map(c => Cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, c)).filter(Boolean);
      if (scrCorners.length !== 4) return;

      if (isWindowInclusion) {
        // Ventana Azul: Todas las 4 esquinas deben estar dentro del marco
        const allInside = scrCorners.every(pt => pt.x >= minX && pt.x <= maxX && pt.y >= minY && pt.y <= maxY);
        if (allInside) matchedIndices.push(idx);
      } else {
        // Ventana Verde: Al menos una esquina, el centro o cruce de aristas
        const anyInside = scrCorners.some(pt => pt.x >= minX && pt.x <= maxX && pt.y >= minY && pt.y <= maxY);
        if (anyInside) {
          matchedIndices.push(idx);
        } else if (p.center) {
          const scCenter = Cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, p.center);
          if (scCenter && scCenter.x >= minX && scCenter.x <= maxX && scCenter.y >= minY && scCenter.y <= maxY) {
            matchedIndices.push(idx);
          }
        }
      }
    });

    // Detectar obstáculos dentro del marco
    const matchedObs = [];
    if ((filter === 'all' || filter === 'obstacles') && Array.isArray(global.obstacles) && global.obstacles.length > 0) {
      global.obstacles.forEach(o => {
        if (!o || o.visible === false || !o.cartesian) return;
        const sc = Cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, o.cartesian);
        if (sc && sc.x >= minX && sc.x <= maxX && sc.y >= minY && sc.y <= maxY) {
          matchedObs.push(o);
        }
      });
    }

    if (matchedIndices.length > 0) {
      if (isAdditive && Array.isArray(global.selectedPanelIndices)) {
        matchedIndices.forEach(idx => {
          if (!global.selectedPanelIndices.includes(idx)) global.selectedPanelIndices.push(idx);
        });
      } else {
        global.selectedPanelIndices = matchedIndices;
      }
      global.selectedPanelIndex = global.selectedPanelIndices[global.selectedPanelIndices.length - 1];

      if (typeof global.updatePanelSelectionUI === 'function') global.updatePanelSelectionUI();
      if (typeof global.showStatus === 'function') {
        const typeStr = isWindowInclusion ? 'VENTANA AZUL (INCLUSIÓN)' : 'VENTANA VERDE (CRUCE)';
        global.showStatus(
          `<i data-lucide="scan" class="icon-sm"></i> ${matchedIndices.length} PANELES SELECCIONADOS POR ${typeStr}`,
          2500
        );
      }
    } else if (matchedObs.length > 0) {
      if (typeof global.selectObstacle === 'function') {
        global.selectObstacle(matchedObs[0].id);
      }
      if (typeof global.showStatus === 'function') {
        global.showStatus(`<i data-lucide="box" class="icon-sm"></i> OBSTÁCULO SELECCIONADO POR MARCO: ${matchedObs[0].name || 'Chimenea'}`, 2500);
      }
    } else {
      if (!isAdditive) {
        if (typeof global.clearAllCADSelection === 'function') {
          global.clearAllCADSelection(false);
        } else if (typeof global.selectPanel === 'function') {
          global.selectPanel(-1);
        }
      }
    }
  }

  // Renderizar el marco de selección 2D en el canvas de overlays
  function renderCADMarqueeOverlay(ctx) {
    const m = global.cadMarqueeState;
    if (!m.active || !ctx) return;

    const x1 = m.startX;
    const y1 = m.startY;
    const x2 = m.currentX;
    const y2 = m.currentY;

    const w = x2 - x1;
    const h = y2 - y1;

    // x2 >= x1: Ventana Azul / x2 < x1: Ventana Verde
    const isWindow = (x2 >= x1);

    ctx.save();
    if (isWindow) {
      // Ventana Azul: Contorno continuo, relleno azul traslúcido
      ctx.fillStyle = 'rgba(59, 130, 246, 0.22)';
      ctx.strokeStyle = '#38BDF8';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([]);
    } else {
      // Ventana Verde: Contorno discontinuo, relleno verde esmeralda traslúcido
      ctx.fillStyle = 'rgba(16, 185, 129, 0.22)';
      ctx.strokeStyle = '#34D399';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
    }

    ctx.fillRect(x1, y1, w, h);
    ctx.strokeRect(x1, y1, w, h);

    // Insignia CAD flotante indicativa en la esquina superior del marco
    const label = isWindow ? 'VENTANA AZUL (INCLUSIÓN 100%)' : 'VENTANA VERDE (CRUCE)';
    ctx.font = 'bold 9px "JetBrains Mono", monospace';
    ctx.setLineDash([]);
    const badgeW = ctx.measureText(label).width + 12;
    const badgeX = Math.min(x1, x2) + 4;
    const badgeY = Math.min(y1, y2) - 18;

    ctx.fillStyle = 'rgba(15,23,42,0.90)';
    ctx.fillRect(badgeX, badgeY, badgeW, 16);
    ctx.strokeStyle = isWindow ? '#38BDF8' : '#34D399';
    ctx.lineWidth = 1;
    ctx.strokeRect(badgeX, badgeY, badgeW, 16);

    ctx.fillStyle = isWindow ? '#38BDF8' : '#34D399';
    ctx.fillText(label, badgeX + 6, badgeY + 11);

    ctx.restore();
  }
  global.renderCADMarqueeOverlay = renderCADMarqueeOverlay;

  // Utilidad auxiliar: test de punto en polígono 2D (Ray Casting 2D)
  function isPointIn2DPolygon(point, vs) {
    const x = point.x, y = point.y;
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
      const xi = vs[i].x, yi = vs[i].y;
      const xj = vs[j].x, yj = vs[j].y;
      const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }
  global.isPointIn2DPolygon = isPointIn2DPolygon;

  // --- INICIALIZACIÓN Y DESTRUCCIÓN LIMPIA ---
  function destroyCADSelectionSuite() {
    if (_hoverRafId) {
      cancelAnimationFrame(_hoverRafId);
      _hoverRafId = null;
    }
    while (_cadSuiteCleanup.length > 0) {
      const unsub = _cadSuiteCleanup.pop();
      try {
        if (typeof unsub === 'function') unsub();
      } catch (_) {}
    }
    _cadSuiteInitialized = false;
  }

  function initCADSelectionSuite() {
    if (_cadSuiteInitialized) {
      destroyCADSelectionSuite();
    }
    _cadSuiteInitialized = true;
    initCADSafeguardListeners();
    initCADCyclingListeners();
    initCADMarqueeListeners();
    console.log('[CAD Suite] Módulos de Hover, Tab-Cycling, Modo Foco y Ventana inicializados correctamente.');
  }

  global.initCADSelectionSuite = initCADSelectionSuite;
  global.destroyCADSelectionSuite = destroyCADSelectionSuite;
  global.RACADSelectionSuite = {
    init: initCADSelectionSuite,
    destroy: destroyCADSelectionSuite,
    updateHover: updateCADHover
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      _addManagedListener(document, 'DOMContentLoaded', initCADSelectionSuite, { once: true });
    } else {
      initCADSelectionSuite();
    }
  }

})(typeof window !== 'undefined' ? window : this);
