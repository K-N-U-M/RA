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

  // --- 2. PRE-SELECCIÓN / HOVER FEEDBACK ENGINE ---
  let _hoverRafId = null;
  let _lastHoverX = -1;
  let _lastHoverY = -1;

  function updateCADHover(screenPos) {
    if (!screenPos) return;
    const viewer = global.viewer;
    if (!viewer || !viewer.scene) return;
    const scene = viewer.scene;

    // No evaluar hover si la cámara está navegando, si hay un gizmo arrastrándose o dibujando
    if (global.universalGizmoState && global.universalGizmoState.active) return;
    if (global.cadMarqueeState.active) return;
    if (global.WP && (global.WP.mode === 'draw-poly' || global.WP.mode === 'draw-building' || global.WP.mode === 'place-obs' || global.WP.mode === 'stamp-poly')) return;

    _lastHoverX = screenPos.x;
    _lastHoverY = screenPos.y;

    if (_hoverRafId) cancelAnimationFrame(_hoverRafId);
    _hoverRafId = requestAnimationFrame(() => {
      evaluateHoverTarget(screenPos, scene);
    });
  }

  function evaluateHoverTarget(screenPos, scene) {
    let target = null;

    // A. Detectar vértice de polilínea activa
    if (global.WP && global.WP.polylines && global.WP.selectedPolyIdx >= 0) {
      const activePoly = global.WP.polylines[global.WP.selectedPolyIdx];
      if (activePoly && activePoly.visible !== false && Array.isArray(activePoly.points)) {
        for (let vi = 0; vi < activePoly.points.length; vi++) {
          const ptWin = Cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, activePoly.points[vi]);
          if (ptWin && Math.hypot(screenPos.x - ptWin.x, screenPos.y - ptWin.y) < 14) {
            target = {
              type: 'vertex',
              polyIdx: global.WP.selectedPolyIdx,
              vIdx: vi,
              screenPos: ptWin,
              point3D: activePoly.points[vi]
            };
            break;
          }
        }
      }
    }

    // B. Detectar panel solar bajo el cursor
    if (!target && typeof global.pickPanelUnderCursor === 'function') {
      const pIdx = global.pickPanelUnderCursor(screenPos);
      if (pIdx >= 0 && Array.isArray(global.allRenderedPanels) && global.allRenderedPanels[pIdx]) {
        const pan = global.allRenderedPanels[pIdx];
        if (pan && pan.corners && pan.corners.length === 4) {
          target = {
            type: 'panel',
            index: pIdx,
            panel: pan
          };
        }
      }
    }

    // C. Detectar obstáculo o faldón por scene.pick
    if (!target && typeof scene.pick === 'function') {
      try {
        const picked = scene.pick(screenPos);
        if (picked && picked.id) {
          const idStr = (typeof picked.id === 'string') ? picked.id : (picked.id.id || '');
          if (idStr.startsWith('obs_') || (global.obstacles && global.obstacles.some(o => o.id === idStr))) {
            target = { type: 'obstacle', id: idStr };
          } else if (idStr.startsWith('wp_poly_fill_') || idStr.startsWith('wp_poly_line_')) {
            const prefix = idStr.startsWith('wp_poly_fill_') ? 'wp_poly_fill_' : 'wp_poly_line_';
            const polyIdx = parseInt(idStr.replace(prefix, '').split('_')[0], 10);
            if (!isNaN(polyIdx) && global.WP.polylines && global.WP.polylines[polyIdx]) {
              target = { type: 'polyline', index: polyIdx, poly: global.WP.polylines[polyIdx] };
            }
          }
        }
      } catch (_) {}
    }

    global.cadHoverTarget = target;
    if (scene.canvas) {
      if (target) {
        scene.canvas.style.cursor = 'pointer';
      } else if (!scene.canvas.style.cursor || scene.canvas.style.cursor === 'pointer') {
        scene.canvas.style.cursor = 'default';
      }
    }

    // Forzar redibujado de la capa 2D de overlays
    if (typeof global.renderTriad2D === 'function') {
      global.renderTriad2D();
    }
  }

  // Renderizar feedback visual del Hover en el canvas 2D
  function renderCADHoverOverlay(ctx, scene) {
    const t = global.cadHoverTarget;
    if (!t || !ctx || !scene) return;

    ctx.save();
    if (t.type === 'vertex' && t.screenPos) {
      // Anillo cian radiante con pulso sutil
      ctx.beginPath();
      ctx.arc(t.screenPos.x, t.screenPos.y, 8, 0, Math.PI * 2);
      ctx.strokeStyle = '#38BDF8';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = '#00F0FF';
      ctx.shadowBlur = 8;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(t.screenPos.x, t.screenPos.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();

      // Etiqueta tooltip flotante
      ctx.font = 'bold 9px "JetBrains Mono", monospace';
      const label = `VÉRTICE #${t.vIdx + 1}`;
      const textW = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(15,23,42,0.85)';
      ctx.fillRect(t.screenPos.x + 12, t.screenPos.y - 12, textW + 8, 16);
      ctx.strokeStyle = 'rgba(56,189,248,0.6)';
      ctx.lineWidth = 1;
      ctx.strokeRect(t.screenPos.x + 12, t.screenPos.y - 12, textW + 8, 16);
      ctx.fillStyle = '#38BDF8';
      ctx.fillText(label, t.screenPos.x + 16, t.screenPos.y);

    } else if (t.type === 'panel' && t.panel && Array.isArray(t.panel.corners)) {
      // Marco sutil cian pre-selección sobre las 4 esquinas proyectadas
      const scrCorners = t.panel.corners.map(c => Cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, c)).filter(Boolean);
      if (scrCorners.length === 4) {
        ctx.beginPath();
        ctx.moveTo(scrCorners[0].x, scrCorners[0].y);
        ctx.lineTo(scrCorners[1].x, scrCorners[1].y);
        ctx.lineTo(scrCorners[2].x, scrCorners[2].y);
        ctx.lineTo(scrCorners[3].x, scrCorners[3].y);
        ctx.closePath();
        ctx.fillStyle = 'rgba(56,189,248,0.12)';
        ctx.fill();
        ctx.strokeStyle = '#38BDF8';
        ctx.lineWidth = 2.0;
        ctx.shadowColor = '#38BDF8';
        ctx.shadowBlur = 6;
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  global.renderCADHoverOverlay = renderCADHoverOverlay;

  // --- 3. CICLO DE CLIC EN PROFUNDIDAD (TAB-CYCLING) ---
  function getCandidateEntitiesUnderScreenPos(screenPos) {
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
        if (Array.isArray(drilled)) {
          drilled.forEach(item => {
            if (!item || !item.id) return;
            const idStr = (typeof item.id === 'string') ? item.id : (item.id.id || '');
            if (global.obstacles && global.obstacles.some(o => o.id === idStr)) {
              const obsObj = global.obstacles.find(o => o.id === idStr);
              if (!candidates.some(c => c.type === 'obstacle' && c.id === idStr)) {
                candidates.push({
                  type: 'obstacle',
                  id: idStr,
                  label: `Obstáculo: ${obsObj ? obsObj.name : 'Chimenea/Casetón'}`
                });
              }
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
    // Tecla Tab para ciclar en profundidad
    window.addEventListener('keydown', function(e) {
      if (e.key === 'Tab') {
        const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
        if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') return;

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
      } else if ((e.key === 'f' || e.key === 'F') && e.shiftKey) {
        // Atajo Shift + F: Alternar Modo Foco
        const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
        if (activeTag !== 'input' && activeTag !== 'textarea') {
          e.preventDefault();
          toggleCADFocusMode();
        }
      }
    });

    // Clics consecutivos en el mismo punto para alternar capas
    window.addEventListener('pointerdown', function(e) {
      if (e.target && e.target.id === 'cesiumContainer' || (e.target && e.target.tagName === 'CANVAS')) {
        const now = Date.now();
        const pos = { x: e.clientX, y: e.clientY };
        const s = global.cadCyclingState;

        if (s.lastClickPos && Math.hypot(pos.x - s.lastClickPos.x, pos.y - s.lastClickPos.y) < 6 && (now - s.lastClickTime) < 1200) {
          // Es un clic sucesivo en el mismo píxel: ciclar profundidad
          if (s.candidates && s.candidates.length > 1) {
            cycleNextCADSelection(false);
          }
        } else {
          // Nuevo clic en punto diferente: regenerar lista de candidatos
          s.lastClickPos = pos;
          s.lastClickTime = now;
          s.candidates = getCandidateEntitiesUnderScreenPos(pos);
          s.candidateIdx = 0;
        }
      }
    });
  }

  // --- 4. SELECCIÓN POR VENTANA / MARCO (MARQUEE BOX SELECTION) ---
  function initCADMarqueeListeners() {
    const container = document.getElementById('cesiumContainer') || document.body;

    window.addEventListener('pointerdown', function(e) {
      // Activar con Shift + Drag O arrastrar en vacío con botón izquierdo
      if (e.button !== 0) return;
      const targetTag = e.target ? e.target.tagName.toLowerCase() : '';
      if (targetTag !== 'canvas' && e.target.id !== 'cesiumContainer') return;

      // No activar si estamos dibujando polilíneas o colocando objetos
      if (global.WP && (global.WP.mode === 'draw-poly' || global.WP.mode === 'draw-building' || global.WP.mode === 'place-obs')) return;
      if (global.universalGizmoState && global.universalGizmoState.active) return;

      const hitGizmo = (typeof global.checkUniversalGizmoHit === 'function') ? global.checkUniversalGizmoHit(e.clientX, e.clientY) : null;
      if (hitGizmo) return;

      // Si pulsamos Shift O es un clic sin elemento directo detectado
      const shouldStartMarquee = e.shiftKey;
      if (shouldStartMarquee) {
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
    });

    window.addEventListener('pointermove', function(e) {
      updateCADHover({ x: e.clientX, y: e.clientY });

      if (global.cadMarqueeState.active) {
        global.cadMarqueeState.currentX = e.clientX;
        global.cadMarqueeState.currentY = e.clientY;
        if (typeof global.renderTriad2D === 'function') {
          global.renderTriad2D();
        }
      }
    });

    window.addEventListener('pointerup', function(e) {
      if (global.cadMarqueeState.active) {
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

        const dx = m.currentX - m.startX;
        const dy = m.currentY - m.startY;
        if (Math.hypot(dx, dy) > 8) {
          executeMarqueeBoxSelection(m.startX, m.startY, m.currentX, m.currentY, e.ctrlKey || e.metaKey);
        }

        if (typeof global.renderTriad2D === 'function') {
          global.renderTriad2D();
        }
      }
    });
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

    const panels = (Array.isArray(global.allRenderedPanels) && global.allRenderedPanels.length > 0)
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
    } else {
      if (!isAdditive) {
        if (typeof global.selectPanel === 'function') global.selectPanel(-1);
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

  // --- INICIALIZACIÓN AUTOMÁTICA AL CARGAR EL DOM ---
  function initCADSelectionSuite() {
    initCADCyclingListeners();
    initCADMarqueeListeners();
    console.log('[CAD Suite] Módulos de Hover, Tab-Cycling, Modo Foco y Ventana inicializados correctamente.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCADSelectionSuite);
  } else {
    initCADSelectionSuite();
  }

})(typeof window !== 'undefined' ? window : this);
