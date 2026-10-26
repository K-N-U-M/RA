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

    toast.innerHTML = `
      <span style="font-size:16px;line-height:1.2;margin-top:2px;">${icon}</span>
      <div style="flex:1;min-width:0;">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:${type === 'warning' ? '#FCD34D' : (type === 'success' ? '#86EFAC' : (type === 'error' ? '#FCA5A5' : '#7DD3FC'))};margin-bottom:2px;">${title}</div>
        <div style="font-size:11px;color:#E2E8F0;line-height:1.35;word-break:break-word;">${message}</div>
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
      }, 600);
    }
  }

  function show3DTilesLoading(msg, pendingCount) {
    const tilesLoadingEl = document.getElementById('ra-3d-tiles-loading');
    const tilesMsgEl = document.getElementById('ra-3d-tiles-msg');
    const tilesCountEl = document.getElementById('ra-3d-tiles-count');
    if (!tilesLoadingEl) return;
    if (tilesMsgEl && msg) tilesMsgEl.textContent = msg;
    if (tilesCountEl) {
      tilesCountEl.textContent = (typeof pendingCount === 'number' && pendingCount > 0) ? (pendingCount + ' tiles') : 'Renderizando 3D';
    }
    clearTimeout(tilesLoadHideTimer);
    tilesLoadingEl.classList.add('visible');
  }

  function hide3DTilesLoading(delayMs) {
    const tilesLoadingEl = document.getElementById('ra-3d-tiles-loading');
    if (!tilesLoadingEl) return;
    clearTimeout(tilesLoadHideTimer);
    tilesLoadHideTimer = setTimeout(() => {
      const el = document.getElementById('ra-3d-tiles-loading');
      if (el) el.classList.remove('visible');
    }, delayMs || 600);
  }

  // ── 3. ESTADO Y NOTIFICACIONES SUPERIORES (HUD) ─────────────────────────────
  function showStatus(msg, ms) {
    const statusEl = document.getElementById('ra-status');
    if (!statusEl) return;
    const duration = (typeof ms === 'number' && ms > 0) ? ms : 5000;
    const closeBtn = '<span onclick="hideStatus()" style="cursor:pointer; margin-left: 14px; padding-left: 14px; border-left: 1px solid rgba(245,158,11,0.3); font-size: 18px; line-height: 1; opacity: 0.8; display: flex; align-items: center;" title="Cerrar">&times;</span>';
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

  // ── 7. GESTIÓN UNIVERSAL DE MODALES (ESCAPE & CLIC EXTERIOR) ───────────────
  function closeAnyActiveModal() {
    if (typeof document === 'undefined') return false;

    const modalDefinitions = [
      { id: 'ra-equipment-catalog-modal', close: function() { if (typeof global.closeEquipmentCatalogModal === 'function') global.closeEquipmentCatalogModal(); } },
      { id: 'ra-cost-breakdown-modal', close: function() { if (typeof global.closeCostBreakdownModal === 'function') global.closeCostBreakdownModal(); } },
      { id: 'ra-company-branding-modal', close: function() { if (typeof global.closeCompanyBrandingModal === 'function') global.closeCompanyBrandingModal(); } },
      { id: 'ra-projects-modal', close: function() { if (typeof global.raCloseProjectsModal === 'function') global.raCloseProjectsModal(); } },
      { id: 'ra-doc-modal', close: function() { if (typeof global.closeDocModal === 'function') global.closeDocModal(); } },
      { id: 'ra-pricing-review-modal', close: function() { var btn = document.getElementById('btn-close-pricing-review') || document.getElementById('btn-cancel-pricing-review'); if (btn) btn.click(); } },
      { id: 'ra-bill-auditor-modal', close: function() { var btn = document.getElementById('btn-close-bill-modal') || document.getElementById('btn-cancel-bill-modal'); if (btn) btn.click(); } }
    ];

    for (var i = 0; i < modalDefinitions.length; i++) {
      var def = modalDefinitions[i];
      var el = document.getElementById(def.id);
      if (el && (el.classList.contains('open') || (el.style.display && el.style.display !== 'none'))) {
        try { def.close(); } catch(e) {}
        el.style.display = 'none';
        el.classList.remove('open');
        return true;
      }
    }
    return false;
  }

  function initUniversalModalHandlers() {
    if (typeof document === 'undefined') return;

    // 1. Cierre con tecla Escape en fase de captura (para priorizar sobre herramientas de dibujo 3D)
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' || e.keyCode === 27) {
        if (closeAnyActiveModal()) {
          e.preventDefault();
          e.stopPropagation();
        }
      }
    }, true);

    // 2. Cierre al hacer clic en el backdrop exterior del diálogo
    document.addEventListener('click', function(e) {
      var backdropIds = [
        'ra-equipment-catalog-modal',
        'ra-cost-breakdown-modal',
        'ra-company-branding-modal',
        'ra-projects-modal',
        'ra-doc-modal',
        'ra-pricing-review-modal',
        'ra-bill-auditor-modal'
      ];
      if (e.target && backdropIds.indexOf(e.target.id) !== -1) {
        closeAnyActiveModal();
      }
    });
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
      }, 150);
    }, { passive: true });
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() {
        initUniversalModalHandlers();
        initMobileResponsiveBehavior();
      });
    } else {
      initUniversalModalHandlers();
      initMobileResponsiveBehavior();
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
    hide3DTilesLoading,
    showStatus,
    hideStatus,
    togglePhotorealisticPanelsTexture,
    toggleLabelsVisibility,
    toggleSettingsPopover
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
  global.hide3DTilesLoading = hide3DTilesLoading;
  global.showStatus = showStatus;
  global.hideStatus = hideStatus;
  global.togglePhotorealisticPanelsTexture = togglePhotorealisticPanelsTexture;
  global.toggleLabelsVisibility = toggleLabelsVisibility;
  global.toggleSettingsPopover = toggleSettingsPopover;

})(typeof window !== 'undefined' ? window : this);
