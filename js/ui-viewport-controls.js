/**
 * ============================================================================
 * 🖥️ RA · UI VIEWPORT CONTROLS & NOTIFICATIONS SYSTEM (Fase 2, Bloque 2.3)
 * ============================================================================
 * Módulo autónomo para:
 *   - Sistema interactivo de notificaciones tipo Toast (éxito, aviso, error, info)
 *   - Indicadores de carga y progreso de geometría / 3D Tiles de fotogrametría
 *   - Banners de estado superior (HUD de notificaciones persistentes)
 *   - Conmutación de texturas de paneles (Modo PBR fotorrealista vs analítico)
 *   - Conmutación de visibilidad de etiquetas 3D / 2D del visor
 *   - Control interactivo del popover flotante de ajustes y motores 3D
 * ============================================================================
 */
(function(global) {
  'use strict';

  // ── ESTADO Y VARIABLES DE MÓDULO ───────────────────────────────────────────
  let loadingHidden = false;
  let tilesLoadHideTimer = null;
  let tilesLoadIsError = false;
  let statusTimer = null;

  if (typeof global.isPhotorealisticTextureMode === 'undefined') {
    global.isPhotorealisticTextureMode = true;
  }
  if (typeof global.areLabelsVisible === 'undefined') {
    global.areLabelsVisible = true;
  }

  // ── 1. SISTEMA DE TOASTS INTERACTIVOS ──────────────────────────────────────
  function showToast(title, message, type = 'info', duration = 3800) {
    if (typeof message === 'undefined') {
      message = title;
      title = 'NOTIFICACIÓN';
    }
    const container = document.getElementById('ra-toast-container');
    if (!container) {
      if (typeof showStatus === 'function') showStatus(message, duration);
      return;
    }

    const toast = document.createElement('div');
    toast.style.pointerEvents = 'auto';
    toast.style.display = 'flex';
    toast.style.alignItems = 'flex-start';
    toast.style.gap = '10px';
    toast.style.padding = '10px 14px';
    toast.style.borderRadius = '8px';
    toast.style.backdropFilter = 'blur(12px)';
    toast.style.webkitBackdropFilter = 'blur(12px)';
    toast.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.1)';
    toast.style.fontFamily = 'Inter, -apple-system, sans-serif';
    toast.style.color = '#FFFFFF';
    toast.style.transform = 'translateX(100%)';
    toast.style.opacity = '0';
    toast.style.transition = 'all 0.28s cubic-bezier(0.16, 1, 0.3, 1)';
    toast.style.cursor = 'pointer';

    let icon = '<i data-lucide="info" class="icon-sm"></i>';
    let borderCol = 'rgba(56, 189, 248, 0.5)';
    let bgGradient = 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.92))';

    if (type === 'success') {
      icon = '<i data-lucide="check-circle" class="icon-sm"></i>';
      borderCol = 'rgba(34, 197, 94, 0.6)';
    } else if (type === 'warning') {
      icon = '<i data-lucide="alert-triangle" class="icon-sm"></i>';
      borderCol = 'rgba(245, 158, 11, 0.7)';
    } else if (type === 'error') {
      icon = '<i data-lucide="x-circle" class="icon-sm"></i>';
      borderCol = 'rgba(239, 68, 68, 0.7)';
    }

    toast.style.background = bgGradient;
    toast.style.borderLeft = '4px solid ' + borderCol;

    // [AUD-2026 · B-08] `title`/`message` pueden venir de datos del proyecto (nombre importado,
    // respuesta de IA). Se escapan antes de interpolar: antes `innerHTML` ejecutaba XSS
    // almacenado al guardar en nube un proyecto con `<img onerror>` en el nombre.
    const _toastEsc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));

    toast.innerHTML = `
      <span style="font-size:16px;line-height:1.2;margin-top:2px;">${icon}</span>
      <div style="flex:1;min-width:0;">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:${type === 'warning' ? '#FCD34D' : (type === 'success' ? '#86EFAC' : (type === 'error' ? '#FCA5A5' : '#7DD3FC'))};margin-bottom:2px;">${_toastEsc(title)}</div>
        <div style="font-size:11px;color:#E2E8F0;line-height:1.35;word-break:break-word;">${_toastEsc(message)}</div>
      </div>
    `;

    toast.onclick = () => {
      toast.style.transform = 'translateX(100%)';
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    };

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      try {
        window.lucide.createIcons({ root: toast });
      } catch (e) {
        window.lucide.createIcons();
      }
    }
    container.appendChild(toast);

    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        toast.style.transform = 'translateX(0)';
        toast.style.opacity = '1';
      });
    } else {
      setTimeout(() => {
        toast.style.transform = 'translateX(0)';
        toast.style.opacity = '1';
      }, 16);
    }

    setTimeout(() => {
      if (toast.parentElement) {
        toast.style.transform = 'translateX(100%)';
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
      }
    }, duration);
  }

  // ── 2. PANTALLA DE CARGA E INDICADORES DE GEOMETRÍA 3D ──────────────────────
  function setLoad(pct, msg) {
    const ldBar = document.getElementById('ld-bar');
    const ldMsg = document.getElementById('ld-msg');
    if (ldBar) ldBar.style.width = pct + '%';
    if (ldMsg && msg) ldMsg.textContent = msg;
  }

  function hideLoading() {
    if (loadingHidden) return;
    loadingHidden = true;
    const ldScreen = document.getElementById('ra-loading');
    if (ldScreen) {
      ldScreen.classList.add('fade-out');
      setTimeout(() => {
        if (ldScreen.parentNode) ldScreen.remove();
      }, 2100);
    }
  }

  function show3DTilesLoading(msg, pendingCount, opt) {
    const forceClearError = !!(opt && opt.forceClearError);
    if (tilesLoadIsError && !forceClearError) return;
    const tilesLoadingEl = document.getElementById('ra-3d-tiles-loading');
    const tilesMsgEl = document.getElementById('ra-3d-tiles-msg');
    const tilesCountEl = document.getElementById('ra-3d-tiles-count');
    const spinnerEl = document.getElementById('ra-3d-tiles-spinner') || (tilesLoadingEl ? tilesLoadingEl.querySelector('.tiles-spinner') : null);
    const errIconEl = document.getElementById('ra-3d-tiles-err-icon');
    const actionsEl = document.getElementById('ra-3d-tiles-actions');
    if (!tilesLoadingEl) return;

    tilesLoadIsError = false;
    tilesLoadingEl.classList.remove('is-error', 'has-actions');
    if (spinnerEl) spinnerEl.style.display = 'block';
    if (errIconEl) errIconEl.style.display = 'none';
    if (actionsEl) actionsEl.style.display = 'none';

    if (tilesMsgEl && msg) tilesMsgEl.textContent = msg;
    if (tilesCountEl) {
      tilesCountEl.textContent = (typeof pendingCount === 'number' && pendingCount > 0) ? (pendingCount + ' teselas') : 'Conectando 3D';
    }
    clearTimeout(tilesLoadHideTimer);
    tilesLoadingEl.classList.add('visible');
  }

  function show3DTilesError(msg, opt) {
    const o = opt || {};
    const tilesLoadingEl = document.getElementById('ra-3d-tiles-loading');
    const tilesMsgEl = document.getElementById('ra-3d-tiles-msg');
    const tilesCountEl = document.getElementById('ra-3d-tiles-count');
    const spinnerEl = document.getElementById('ra-3d-tiles-spinner') || (tilesLoadingEl ? tilesLoadingEl.querySelector('.tiles-spinner') : null);
    const errIconEl = document.getElementById('ra-3d-tiles-err-icon');
    const actionsEl = document.getElementById('ra-3d-tiles-actions');
    const fallbackBtn = document.getElementById('btn-fallback-cesium-3d');
    if (!tilesLoadingEl) return;

    tilesLoadIsError = true;
    clearTimeout(tilesLoadHideTimer);
    tilesLoadingEl.classList.add('visible', 'is-error');

    const showActions = (o.showActions !== false);
    if (actionsEl) actionsEl.style.display = showActions ? 'flex' : 'none';
    if (showActions) tilesLoadingEl.classList.add('has-actions');
    else tilesLoadingEl.classList.remove('has-actions');

    if (fallbackBtn) {
      fallbackBtn.style.display = (o.canSwitchCesium === false) ? 'none' : 'inline-flex';
    }
    if (spinnerEl) spinnerEl.style.display = o.isRetrying ? 'block' : 'none';
    if (errIconEl) errIconEl.style.display = o.isRetrying ? 'none' : 'inline';

    if (tilesMsgEl && msg) tilesMsgEl.textContent = msg;
    if (tilesCountEl) {
      if (o.badgeText) {
        tilesCountEl.textContent = o.badgeText;
      } else if (typeof o.failCount === 'number' && o.failCount > 0) {
        tilesCountEl.textContent = o.failCount + (o.failCount === 1 ? ' fallo' : ' fallos');
      } else {
        tilesCountEl.textContent = 'Error red';
      }
    }
  }

  function dismiss3DTilesLoading() {
    global.__raTilesDismissed = true;
    tilesLoadIsError = false;
    clearTimeout(tilesLoadHideTimer);
    const el = document.getElementById('ra-3d-tiles-loading');
    if (el) {
      el.classList.remove('visible', 'is-error', 'has-actions');
    }
  }

  function hide3DTilesLoading(delayMs, forceClear) {
    if (tilesLoadIsError && !forceClear) return;
    const tilesLoadingEl = document.getElementById('ra-3d-tiles-loading');
    if (!tilesLoadingEl) return;
    clearTimeout(tilesLoadHideTimer);
    tilesLoadHideTimer = setTimeout(() => {
      if (tilesLoadIsError && !forceClear) return;
      tilesLoadIsError = false;
      const el = document.getElementById('ra-3d-tiles-loading');
      if (el) el.classList.remove('visible', 'is-error', 'has-actions');
    }, delayMs || 600);
  }

  // ── 3. ESTADO Y NOTIFICACIONES SUPERIORES (HUD) ─────────────────────────────
  function showStatus(msg, ms) {
    const statusEl = document.getElementById('ra-status');
    if (!statusEl) return;
    const duration = (typeof ms === 'number' && ms > 0) ? ms : 5000;
    const closeBtn = '<button type="button" onclick="hideStatus()" aria-label="Cerrar notificación de estado" style="background:transparent;border:none;color:inherit;cursor:pointer;margin-left:14px;padding:0 0 0 14px;border-left:1px solid rgba(245,158,11,0.3);font-size:18px;line-height:1;opacity:0.85;display:inline-flex;align-items:center;" title="Cerrar">&times;</button>';
    statusEl.innerHTML = '<div style="display:flex; align-items:center;">' + msg + closeBtn + '</div>';
    statusEl.classList.add('visible');
    
    const hud = document.getElementById('ra-hud-energy');
    if (hud) hud.style.transform = 'translateX(-50%) translateY(45px)';

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      try {
        window.lucide.createIcons({ root: statusEl });
      } catch (e) {
        window.lucide.createIcons();
      }
    }
    clearTimeout(statusTimer);
    statusTimer = setTimeout(hideStatus, duration);
  }

  function hideStatus() {
    const statusEl = document.getElementById('ra-status');
    if (statusEl) statusEl.classList.remove('visible');
    const hud = document.getElementById('ra-hud-energy');
    if (hud) hud.style.transform = 'translateX(-50%) translateY(0)';
  }

  // ── 4. CONMUTACIÓN DE TEXTURA PBR FOTORREALISTA / ANALÍTICA ────────────────
  function togglePhotorealisticPanelsTexture() {
    global.isPhotorealisticTextureMode = !global.isPhotorealisticTextureMode;
    const isPbr = global.isPhotorealisticTextureMode;
    const btnTag = document.getElementById('tag-pbr-texture-status');
    const btnEl = document.getElementById('btn-toggle-pbr-texture');
    if (btnTag) {
      btnTag.textContent = isPbr ? '[T] ON' : '[T] OFF';
      btnTag.style.background = isPbr ? '#10B981' : 'rgba(255,255,255,0.08)';
      btnTag.style.color = isPbr ? '#0F172A' : 'var(--text-slate-300)';
      btnTag.style.fontWeight = isPbr ? '900' : 'normal';
    }
    if (btnEl) {
      btnEl.style.borderColor = isPbr ? '#10B981' : 'rgba(56,189,248,0.4)';
      btnEl.style.background = isPbr ? 'rgba(16,185,129,0.18)' : 'rgba(15,23,42,0.6)';
    }
    if (typeof global.wpFastRenderSimulatedPanels === 'function') {
      global.wpFastRenderSimulatedPanels();
    }
    if (typeof showStatus === 'function') {
      showStatus(isPbr ? '<i data-lucide="camera" class="icon-sm"></i> TEXTURA FOTORREALISTA PBR ACTIVADA [T] — Renderizado comercial' : '<i data-lucide="palette" class="icon-sm"></i> MODO ANALÍTICO ACTIVADO [T] — Tinte por Strings / Sombras', 2200);
    }
  }

  // ── 5. CONMUTACIÓN DE VISIBILIDAD DE ETIQUETAS 3D Y 2D ──────────────────────
  function toggleLabelsVisibility() {
    global.areLabelsVisible = !global.areLabelsVisible;
    const isVis = global.areLabelsVisible;

    // 1. Conmutar registro de etiquetas 2D (labels2DRegistry)
    if (typeof global.labels2DRegistry !== 'undefined' && Array.isArray(global.labels2DRegistry)) {
      global.labels2DRegistry.forEach(item => { if (item) item.show = isVis; });
    }

    // 2. Conmutar colección de números de paneles 3D y etiquetas de heatmap solar
    if (global._panelNumberLabelCollection && typeof global._panelNumberLabelCollection.show !== 'undefined') {
      global._panelNumberLabelCollection.show = isVis;
    }
    const vScene = (typeof global.viewer !== 'undefined' && global.viewer) ? global.viewer.scene : ((typeof viewer !== 'undefined' && viewer) ? viewer.scene : null);
    if (vScene && vScene.primitives) {
      try {
        for (let i = 0; i < vScene.primitives.length; i++) {
          const p = vScene.primitives.get(i);
          if (p && p._isPanelNumberCollection) {
            p.show = isVis;
          }
        }
      } catch(_) {}
    }
    if (global._solarHeatmapLabelCollection && typeof global._solarHeatmapLabelCollection.show !== 'undefined') {
      global._solarHeatmapLabelCollection.show = isVis;
    }

    // 3. Forzar repintado del canvas de badges y tríada (Triad2D)
    if (typeof global.renderTriad2D === 'function') {
      global.renderTriad2D();
    }

    // 4. Actualizar estado del botón en el panel de control
    const btnTag = document.getElementById('tag-labels-status');
    const btnEl = document.getElementById('btn-toggle-labels-visibility');
    if (btnTag) {
      btnTag.textContent = isVis ? '[L] ON' : '[L] OFF';
      btnTag.style.background = isVis ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)';
      btnTag.style.color = isVis ? '#34D399' : '#F87171';
    }
    if (btnEl) {
      btnEl.style.borderColor = isVis ? 'rgba(245,158,11,0.4)' : 'rgba(239,68,68,0.4)';
      btnEl.style.background = isVis ? 'rgba(15,23,42,0.6)' : 'rgba(239,68,68,0.12)';
    }

    // 5. Notificación al usuario
    if (typeof showStatus === 'function') {
      showStatus(isVis ? '<i data-lucide="tag" class="icon-sm"></i> ETIQUETAS 3D ACTIVADAS [L]' : '<i data-lucide="eye" class="icon-sm"></i>️ VISTA LIMPIA: ETIQUETAS 3D OCULTAS [L]', 2000);
    }

    const v = typeof global.viewer !== 'undefined' && global.viewer ? global.viewer : (typeof viewer !== 'undefined' ? viewer : null);
    if (v && v.scene && typeof v.scene.requestRender === 'function') {
      v.scene.requestRender();
    }
  }

  // ── 6. POPOVER DE AJUSTES Y MOTORES 3D ─────────────────────────────────────
  function toggleSettingsPopover(force) {
    const p = document.getElementById('ra-floating-settings-popover');
    const btn = document.getElementById('ra-floating-settings-btn');
    if (!p) return;
    const isOpen = p.classList.contains('open');
    const willOpen = (typeof force === 'boolean') ? force : !isOpen;
    if (willOpen) {
      p.classList.add('open');
      if (btn) btn.style.transform = 'rotate(45deg) scale(1.08)';
      if (window.RAShadowSettings && typeof window.RAShadowSettings.injectUI === 'function') {
        try { window.RAShadowSettings.injectUI(); } catch (e) {}
      }
      if (typeof window.raSyncShadowUI === 'function') {
        try { window.raSyncShadowUI(); } catch (e) {}
      }
      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        try {
          window.lucide.createIcons({ root: p });
        } catch (e) {
          window.lucide.createIcons();
        }
      }
    } else {
      p.classList.remove('open');
      if (btn) btn.style.transform = 'rotate(0deg) scale(1)';
    }
  }

  // ── 7. GESTIÓN DE MODALES CENTRALIZADA EN js/a11y-dialogs.js [F5-01] ───────

  // ── SISTEMA UNIVERSAL DE VENTANAS FLOTANTES DESPLAZABLES (DRAGGABLE) ───────
  // [F5-05] Confinado dentro de la banda --z-floating (200..289) para nunca pisar popovers (300) ni modales (500)
  let _topWindowZIndex = 205;

  function bringToFront(el) {
    if (!el) return;
    _topWindowZIndex += 1;
    if (_topWindowZIndex > 289) _topWindowZIndex = 210;
    el.style.zIndex = _topWindowZIndex;
  }

  function makeElementDraggable(panelEl, handleEl, storageKey) {
    if (!panelEl || !handleEl) return;
    if (panelEl._hasDraggableInitialized) return;
    panelEl._hasDraggableInitialized = true;

    // Restaurar posición guardada si existe y es válida
    if (storageKey) {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const pos = JSON.parse(raw);
          if (pos && Number.isFinite(pos.left) && Number.isFinite(pos.top)) {
            const panelW = panelEl.offsetWidth || 300;
            const maxL = Math.max(10, window.innerWidth - panelW - 10);
            const maxT = Math.max(10, window.innerHeight - 60);
            const clampL = Math.max(10, Math.min(maxL, pos.left));
            const clampT = Math.max(10, Math.min(maxT, pos.top));
            panelEl.style.position = 'fixed';
            panelEl.style.transform = 'none';
            panelEl.style.left = clampL + 'px';
            panelEl.style.top = clampT + 'px';
            panelEl.style.right = 'auto';
            panelEl.style.bottom = 'auto';
          }
        }
      } catch (e) {}
    }

    panelEl.addEventListener('pointerdown', function() {
      bringToFront(panelEl);
    }, { passive: true });

    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let elemStartX = 0;
    let elemStartY = 0;
    let hasMovedSignificantly = false;

    handleEl.style.cursor = 'grab';
    handleEl.style.userSelect = 'none';

    handleEl.addEventListener('pointerdown', function(e) {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      // Si el clic proviene de botones interactivos dentro de la cabecera, no iniciar drag
      if (e.target && (e.target.closest('button') || e.target.closest('input') || e.target.closest('select') || e.target.closest('a'))) {
        return;
      }
      isDragging = true;
      hasMovedSignificantly = false;
      dragStartX = e.clientX;
      dragStartY = e.clientY;

      const rect = panelEl.getBoundingClientRect();
      elemStartX = rect.left;
      elemStartY = rect.top;

      bringToFront(panelEl);
      handleEl.style.cursor = 'grabbing';
      if (typeof handleEl.setPointerCapture === 'function') {
        try { handleEl.setPointerCapture(e.pointerId); } catch(err) {}
      }
      e.stopPropagation();
    });

    window.addEventListener('pointermove', function(e) {
      if (!isDragging) return;
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;

      if (!hasMovedSignificantly && Math.hypot(dx, dy) > 4) {
        hasMovedSignificantly = true;
        // Congelar ancho explícito antes de desacoplar del centrado automático
        const currentWidth = panelEl.offsetWidth;
        if (currentWidth > 0 && !panelEl.style.width) {
          panelEl.style.width = currentWidth + 'px';
        }
        panelEl.style.position = 'fixed';
        panelEl.style.transform = 'none';
      }

      if (hasMovedSignificantly) {
        const panelWidth = panelEl.offsetWidth || 300;
        const panelHeight = panelEl.offsetHeight || 200;
        const maxLeft = Math.max(8, window.innerWidth - panelWidth - 8);
        const maxTop = Math.max(8, window.innerHeight - panelHeight - 8);

        const newLeft = Math.max(8, Math.min(maxLeft, elemStartX + dx));
        const newTop = Math.max(8, Math.min(maxTop, elemStartY + dy));

        panelEl.style.right = 'auto';
        panelEl.style.bottom = 'auto';
        panelEl.style.left = newLeft + 'px';
        panelEl.style.top = newTop + 'px';
      }
    }, { passive: false });

    function endDrag(e) {
      if (!isDragging) return;
      isDragging = false;
      handleEl.style.cursor = 'grab';
      if (typeof handleEl.releasePointerCapture === 'function' && e && e.pointerId != null) {
        try { handleEl.releasePointerCapture(e.pointerId); } catch(err) {}
      }
      if (hasMovedSignificantly) {
        const rect = panelEl.getBoundingClientRect();
        if (storageKey) {
          try {
            localStorage.setItem(storageKey, JSON.stringify({ left: Math.round(rect.left), top: Math.round(rect.top) }));
          } catch(err) {}
        }
      }
    }

    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
  }

  function initUniversalFloatingDraggables() {
    // 1. Árbol de Proyecto (CAD Outliner)
    const outlinerPanel = document.getElementById('ra-cad-outliner-panel');
    if (outlinerPanel) {
      const outlinerHeader = outlinerPanel.querySelector('.outliner-header');
      if (outlinerHeader) {
        makeElementDraggable(outlinerPanel, outlinerHeader, 'ra_outliner_pos');
      }
    }

    // 2. Árbol BIM y Mediciones (BOM)
    const bomPanel = document.getElementById('ra-bom-tree-hud');
    if (bomPanel) {
      const bomHeader = bomPanel.querySelector('.bom-hud-header');
      if (bomHeader) {
        makeElementDraggable(bomPanel, bomHeader, 'ra_bom_pos');
      }
    }

    // 3. Panel Solar & Sombras
    const solarHud = document.getElementById('ra-solar-time-hud');
    if (solarHud) {
      const solarHeader = solarHud.querySelector('.solar-hud-header');
      if (solarHeader) {
        makeElementDraggable(solarHud, solarHeader, 'ra_solar_hud_pos');
      }
    }

    // 4. Popover de Ajustes de Renderizado
    const settingsPopover = document.getElementById('ra-floating-settings-popover');
    if (settingsPopover) {
      const settingsHeader = settingsPopover.firstElementChild;
      if (settingsHeader) {
        makeElementDraggable(settingsPopover, settingsHeader, 'ra_settings_popover_pos');
      }
    }
  }

  // ── INICIALIZACIÓN RESPONSIVE PARA DISPOSITIVOS MÓVILES / TÁCTILES ───────────
  function initMobileResponsiveBehavior() {
    if (typeof window === 'undefined') return;
    const isMobile = window.innerWidth <= 768;

    const sb = document.getElementById('ra-sidebar');
    const btn = document.getElementById('btn-sidebar-toggle');
    const toggleIcon = document.getElementById('sidebar-toggle-icon');

    if (isMobile) {
      // 1. Sidebar colapsado al inicio en móvil
      if (sb) {
        sb.classList.add('collapsed');
        document.body.classList.remove('sb-open');
        if (btn) btn.textContent = '✕';
        if (toggleIcon) toggleIcon.textContent = '▶';
      }

      // 2. Panel solar minimizado al inicio
      if (typeof global.toggleSolarHUD === 'function') {
        global.toggleSolarHUD(false);
      } else {
        const solarHud = document.getElementById('ra-solar-time-hud');
        if (solarHud) solarHud.classList.add('solar-hud-minimized');
      }

      // 3. Árbol de proyecto (Outliner) cerrado al inicio
      if (global.UIOutliner && typeof global.UIOutliner.close === 'function') {
        global.UIOutliner.close();
      }

      // 4. Auto-cerrar sidebar al pulsar cualquier botón de acción de dibujo o CAD en móvil
      const tabContent = document.querySelector('.sb-tab-content');
      if (tabContent) {
        tabContent.addEventListener('click', function(e) {
          const target = e.target.closest('button, .wp-step-btn');
          if (target && !target.classList.contains('sb-collapse-btn')) {
            // Si pulsa un botón de acción como 'DEFINIR PLANO', 'TRAZAR', 'UBICAR', cerrar sidebar para ver el 3D
            const isActionBtn = target.classList.contains('btn-action-primary') ||
                                target.classList.contains('btn-action-blue') ||
                                target.classList.contains('btn-action-emerald') ||
                                target.id.indexOf('create') !== -1 ||
                                target.id.indexOf('btn-p1-') !== -1;
            if (isActionBtn && sb && !sb.classList.contains('collapsed')) {
              if (typeof global.toggleSidebarCollapse === 'function') {
                global.toggleSidebarCollapse();
              }
            }
          }
        }, { passive: true });
      }
    } else {
      // En desktop, mantener abierto por defecto
      if (sb) {
        sb.classList.remove('collapsed');
        document.body.classList.remove('sb-open');
        if (btn) btn.textContent = '◀';
        if (toggleIcon) toggleIcon.textContent = '◀';
      }
      // Asegurar que árboles flotantes no se abran automáticamente en arranque
      if (global.UIOutliner && typeof global.UIOutliner.close === 'function') {
        global.UIOutliner.close();
      }
      if (typeof global.BOMTreeEngine !== 'undefined' && typeof global.BOMTreeEngine.close === 'function') {
        global.BOMTreeEngine.close();
      }
    }

    // Vincular botón flotante del Árbol de Proyecto (UIOutliner)
    const outlinerFab = document.getElementById('ra-outliner-fab-btn');
    if (outlinerFab) {
      outlinerFab.onclick = function(e) {
        if (e) e.stopPropagation();
        if (global.UIOutliner && typeof global.UIOutliner.toggle === 'function') {
          global.UIOutliner.toggle();
        }
      };
    }

    // Vincular botón flotante del Árbol de Mediciones (BOMTreeEngine)
    const bomFab = document.getElementById('ra-bom-fab-btn');
    if (bomFab) {
      bomFab.onclick = function(e) {
        if (e) e.stopPropagation();
        if (typeof global.BOMTreeEngine !== 'undefined' && typeof global.BOMTreeEngine.toggleVisibility === 'function') {
          global.BOMTreeEngine.toggleVisibility();
        }
      };
    }

    // Al tocar el visor 3D en móvil, replegar paneles abiertos para dejar la vista limpia
    const cesiumCont = document.getElementById('cesiumContainer');
    if (cesiumCont) {
      cesiumCont.addEventListener('pointerdown', function() {
        if (window.innerWidth <= 768) {
          const sb = document.getElementById('ra-sidebar');
          if (sb && !sb.classList.contains('collapsed') && typeof global.toggleSidebarCollapse === 'function') {
            global.toggleSidebarCollapse();
          }
          if (global.UIOutliner && typeof global.UIOutliner.close === 'function') {
            global.UIOutliner.close();
          }
          if (typeof global.BOMTreeEngine !== 'undefined' && typeof global.BOMTreeEngine.close === 'function') {
            global.BOMTreeEngine.close();
          }
        }
      }, { passive: true });
    }

    // Listener para orientación y redimensión
    let resizeTimer = null;
    window.addEventListener('resize', function() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function() {
        const currentlyMobile = window.innerWidth <= 768;
        const backdrop = document.getElementById('ra-mobile-sidebar-backdrop');
        if (backdrop && !currentlyMobile) {
          backdrop.classList.remove('active');
        }
        if (typeof global.syncSidebarViewportVar === 'function') {
          global.syncSidebarViewportVar();
        }
      }, 150);
    }, { passive: true });
    if (typeof global.syncSidebarViewportVar === 'function') {
      global.syncSidebarViewportVar();
    }
  }

  // [F5-10] Operabilidad por teclado y clic en #ra-hud-energy y cierre Escape en tooltips
  function initAccessibleHudAndTooltips() {
    if (typeof document === 'undefined') return;
    const hudEnergy = document.getElementById('ra-hud-energy');
    const hudPill = document.getElementById('ra-hud-pill');
    const setHudOpen = (open) => {
      if (!hudEnergy || !hudPill) return;
      hudEnergy.classList.toggle('is-open', !!open);
      hudPill.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    if (hudEnergy && hudPill && !hudPill.dataset.raHudA11yBound) {
      hudPill.dataset.raHudA11yBound = '1';
      hudPill.addEventListener('click', function(ev) {
        if (ev.target && ev.target.closest('.tooltip-container')) return;
        setHudOpen(!hudEnergy.classList.contains('is-open'));
      });
      document.addEventListener('click', function(ev) {
        if (hudEnergy.classList.contains('is-open') && !hudEnergy.contains(ev.target)) {
          setHudOpen(false);
        }
      });
      document.addEventListener('keydown', function(ev) {
        if (ev.key === 'Escape') {
          if (hudEnergy.classList.contains('is-open')) {
            setHudOpen(false);
            if (typeof hudPill.focus === 'function') hudPill.focus();
          }
          const active = document.activeElement;
          if (active && typeof active.closest === 'function' && active.closest('.tooltip-container')) {
            if (typeof active.blur === 'function') active.blur();
          }
        }
      });
    }
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() {
        initMobileResponsiveBehavior();
        initUniversalFloatingDraggables();
        initAccessibleHudAndTooltips();
      });
    } else {
      initMobileResponsiveBehavior();
      initUniversalFloatingDraggables();
      initAccessibleHudAndTooltips();
    }
  }

  // Fallback de seguridad para ocultar pantalla de bienvenida
  if (typeof global.setTimeout === 'function') {
    global.setTimeout(hideLoading, 8000);
  }

  // ── EXPORTACIÓN DE MÓDULO Y HOOKS GLOBALES ──────────────────────────────────
  const UIViewportControls = {
    showToast,
    setLoad,
    hideLoading,
    show3DTilesLoading,
    show3DTilesError,
    dismiss3DTilesLoading,
    hide3DTilesLoading,
    showStatus,
    hideStatus,
    togglePhotorealisticPanelsTexture,
    toggleLabelsVisibility,
    toggleSettingsPopover,
    makeElementDraggable,
    bringToFront,
    initUniversalFloatingDraggables
  };

  global.UIViewportControls = UIViewportControls;
  if (!global.RA) global.RA = {};
  if (!global.RA.UI) global.RA.UI = {};
  Object.assign(global.RA.UI, UIViewportControls);

  // Hooks globales en window requeridos para eventos HTML y módulos existentes
  global.showToast = showToast;
  global.setLoad = setLoad;
  global.hideLoading = hideLoading;
  global.show3DTilesLoading = show3DTilesLoading;
  global.show3DTilesError = show3DTilesError;
  global.dismiss3DTilesLoading = dismiss3DTilesLoading;
  global.hide3DTilesLoading = hide3DTilesLoading;
  global.showStatus = showStatus;
  global.hideStatus = hideStatus;
  global.togglePhotorealisticPanelsTexture = togglePhotorealisticPanelsTexture;
  global.toggleLabelsVisibility = toggleLabelsVisibility;
  global.toggleSettingsPopover = toggleSettingsPopover;
  global.makeElementDraggable = makeElementDraggable;
  global.bringToFront = bringToFront;
  global.initUniversalFloatingDraggables = initUniversalFloatingDraggables;

})(typeof window !== 'undefined' ? window : this);
