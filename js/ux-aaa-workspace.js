/**
 * js/ux-aaa-workspace.js — Workspace UX Profesional AAA [F7-13]
 * =============================================================
 * Módulo autónomo que añade:
 *  1. Command Palette universal (`Ctrl+K` / `Cmd+K`) con búsqueda difusa sobre acciones, pasos, catálogo y cubiertas.
 *  2. Chuleta interactiva de atajos de teclado (`?`).
 *  3. Selector de Modo Dual (`Comercial` vs `Experto`) en cabecera del sidebar.
 *  4. Cajón Inferior Redimensionable (`#ra-engineering-drawer`) sincronizado para:
 *     - Matriz MPPT & Strings en formato amplio legible
 *     - Esquema Unifilar Vivo en pantalla ancha
 *     - Análisis Financiero Bancable P50 / P75 / P90 / P99 (25 años)
 */
(function (global) {
  'use strict';

  var UI_MODE_KEY = 'ra_ui_workspace_mode';
  var _currentUiMode = 'expert';
  var _drawerOpen = false;
  var _drawerTab = 'mppt';
  var _drawerHeightPx = 310;
  var _paletteSelectedIdx = 0;
  var _paletteFiltered = [];

  function _esc(v) {
    if (global.RASanitize && typeof global.RASanitize.plain === 'function') return global.RASanitize.plain(v);
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ── 1. MODO DUAL: COMERCIAL VS EXPERTO ──────────────────────────────────────
  function applyUiMode(mode, silent) {
    _currentUiMode = (mode === 'commercial') ? 'commercial' : 'expert';
    if (typeof document !== 'undefined' && document.body) {
      document.body.dataset.raUiMode = _currentUiMode;
    }
    try { localStorage.setItem(UI_MODE_KEY, _currentUiMode); } catch (_) {}

    var btn = document.getElementById('btn-ra-ui-mode');
    if (btn) {
      var isComm = _currentUiMode === 'commercial';
      btn.textContent = isComm ? 'COMERCIAL' : 'EXPERTO';
      btn.setAttribute('aria-pressed', isComm ? 'true' : 'false');
      btn.title = isComm
        ? 'Modo Comercial activo (vista simplificada para presentaciones). Clic para cambiar a Experto.'
        : 'Modo Experto activo (ingeniería completa REBT/CFD). Clic para simplificar en presentaciones comerciales.';
      btn.classList.toggle('is-commercial', isComm);
    }

    if (!silent && typeof global.showToast === 'function') {
      global.showToast(
        _currentUiMode === 'commercial' ? 'MODO COMERCIAL' : 'MODO EXPERTO',
        _currentUiMode === 'commercial'
          ? 'Vista simplificada enfocada a presentación con cliente final.'
          : 'Vista técnica completa con parámetros avanzados de ingeniería REBT.',
        'info',
        2600
      );
    }
  }

  function toggleUiMode() {
    applyUiMode(_currentUiMode === 'commercial' ? 'expert' : 'commercial', false);
  }

  // ── 2. COMMAND PALETTE (Ctrl+K / Cmd+K) ─────────────────────────────────────
  function _buildCommandCatalog() {
    var cmds = [
      { id: 'step1', group: 'Flujo', title: 'Ir a Paso 1 — Emplazamiento y Cubiertas', kbd: '1', run: function () { if (typeof global.wpGoToStep === 'function') global.wpGoToStep(1); } },
      { id: 'step2', group: 'Flujo', title: 'Ir a Paso 2 — Campo Solar y Malla 3D', kbd: '2', run: function () { if (typeof global.wpGoToStep === 'function') global.wpGoToStep(2); } },
      { id: 'step3', group: 'Flujo', title: 'Ir a Paso 3 — Análisis Solar y Factura', kbd: '3', run: function () { if (typeof global.wpGoToStep === 'function') global.wpGoToStep(3); } },
      { id: 'step4', group: 'Flujo', title: 'Ir a Paso 4 — Ingeniería Eléctrica REBT', kbd: '4', run: function () { if (typeof global.wpGoToStep === 'function') global.wpGoToStep(4); } },
      { id: 'step5', group: 'Flujo', title: 'Ir a Paso 5 — Entrega, Presupuesto y PDF', kbd: '5', run: function () { if (typeof global.wpGoToStep === 'function') global.wpGoToStep(5); } },

      { id: 'drawer-mppt', group: 'Workspace AAA', title: 'Abrir Cajón Inferior: Matriz MPPT y Strings', kbd: 'Ctrl+J', run: function () { openEngineeringDrawer('mppt'); } },
      { id: 'drawer-autostring', group: 'Ingeniería 7B', title: 'Auto-Stringing Inteligente Consciente de Sombras 3D', kbd: '', run: function () { openEngineeringDrawer('autostring'); } },
      { id: 'drawer-bishop', group: 'Ingeniería 7B', title: 'Simulador Horario 8760h + Curva I-V Bishop Multi-Pico', kbd: '', run: function () { openEngineeringDrawer('bishop'); } },
      { id: 'drawer-datadis', group: 'Ingeniería 7B', title: 'Gemelo 8760h Datadis CSV + Optimizador Potencias P1..P6', kbd: '', run: function () { openEngineeringDrawer('datadis'); } },
      { id: 'drawer-unifilar', group: 'Workspace AAA', title: 'Abrir Cajón Inferior: Esquema Unifilar Vivo', kbd: '', run: function () { openEngineeringDrawer('unifilar'); } },
      { id: 'drawer-p50', group: 'Workspace AAA', title: 'Abrir Cajón Inferior: Riesgo Bancable P50/P75/P90/P99', kbd: '', run: function () { openEngineeringDrawer('bankable'); } },
      { id: 'toggle-mode', group: 'Workspace AAA', title: 'Alternar Modo Comercial / Experto', kbd: '', run: toggleUiMode },
      { id: 'shortcuts', group: 'Workspace AAA', title: 'Ver Chuleta Interactiva de Atajos de Teclado', kbd: '?', run: openShortcutsModal },

      { id: 'catalog', group: 'Equipos y Fichas', title: 'Abrir Catálogo Oficial de Equipos FV / Eólicos', kbd: '', run: function () { if (typeof global.openEquipmentCatalogModal === 'function') global.openEquipmentCatalogModal(); } },
      { id: 'import-pan', group: 'Equipos y Fichas', title: 'Importar Ficha PVsyst (.PAN módulo / .OND inversor)', kbd: '', run: function () { if (global.RAPVsystImport) global.RAPVsystImport.triggerFileImport(); } },
      { id: 'bill', group: 'Finanzas y Docs', title: 'Abrir Auditoría de Factura Eléctrica (IA + CSV)', kbd: '', run: function () { if (global.RA && global.RA.billAuditor) global.RA.billAuditor.open(); } },
      { id: 'style-studio', group: 'Finanzas y Docs', title: 'Abrir Estudio Maestro de Maquetación (Live Preview)', kbd: '', run: function () { if (global.RAProposalStyleStudio) global.RAProposalStyleStudio.openModal(); } },
      { id: 'cost-modal', group: 'Finanzas y Docs', title: 'Abrir Estudio Económico y Desglose CAPEX/Fiscalidad', kbd: '', run: function () { if (typeof global.openCostBreakdownModal === 'function') global.openCostBreakdownModal(); } },
      { id: 'branding', group: 'Finanzas y Docs', title: 'Configurar Identidad Corporativa y Logotipo', kbd: '', run: function () { if (typeof global.openCompanyBrandingModal === 'function') global.openCompanyBrandingModal(); } },
      { id: 'compare', group: 'Finanzas y Docs', title: 'Ejecutar Comparador de Escenarios (String vs MLPE)', kbd: '', run: function () { if (typeof global.wpCompararEscenarios === 'function') global.wpCompararEscenarios(); } },
      { id: 'delivery-pack', group: 'Finanzas y Docs', title: 'Generar Pack Completo de Entrega ZIP', kbd: '', run: function () { if (typeof global.generateDeliveryPack === 'function') global.generateDeliveryPack(); } },
      { id: 'proposal-pdf', group: 'Finanzas y Docs', title: 'Emitir Propuesta Comercial (Dossier / Vertical)', kbd: '', run: function () { if (typeof global.wpDownloadSelectedProposal === 'function') global.wpDownloadSelectedProposal(); } },

      { id: 'heatmap', group: 'Simulación 3D', title: 'Calcular Mapa de Calor Anual y Sombras 3D', kbd: '', run: function () { if (typeof global.wpRunHeatmapAndActivateView === 'function') global.wpRunHeatmapAndActivateView(true); } },
      { id: 'measure', group: 'Herramientas CAD', title: 'Activar / Desactivar Cinta Métrica 3D', kbd: 'M', run: function () { if (typeof global.toggleMeasureTool === 'function') global.toggleMeasureTool(); } },
      { id: 'labels', group: 'Herramientas CAD', title: 'Mostrar / Ocultar Etiquetas 3D y Cotas', kbd: 'L', run: function () { if (typeof global.toggleLabelsVisibility === 'function') global.toggleLabelsVisibility(); } },
      { id: 'pbr', group: 'Herramientas CAD', title: 'Alternar Textura Fotorrealista PBR / Analítica', kbd: 'T', run: function () { if (typeof global.togglePhotorealisticPanelsTexture === 'function') global.togglePhotorealisticPanelsTexture(); } },
      { id: 'focus', group: 'Herramientas CAD', title: 'Alternar Modo Foco CAD', kbd: 'Shift+F', run: function () { if (typeof global.toggleCADFocusMode === 'function') global.toggleCADFocusMode(); } },
      { id: 'outliner', group: 'Herramientas CAD', title: 'Abrir / Cerrar Árbol de Proyecto (Outliner)', kbd: '', run: function () { if (global.UIOutliner) global.UIOutliner.toggle(); } },
      { id: 'bom', group: 'Herramientas CAD', title: 'Abrir / Cerrar Árbol de Mediciones (BOM)', kbd: '', run: function () { if (global.BOMTreeEngine && typeof global.BOMTreeEngine.toggleVisibility === 'function') global.BOMTreeEngine.toggleVisibility(); } },
      { id: 'save-file', group: 'Proyecto', title: 'Guardar Proyecto (.raproject)', kbd: 'Ctrl+S', run: function () { if (typeof global.raSaveProjectToFile === 'function') global.raSaveProjectToFile(false); } },
      { id: 'open-projects', group: 'Proyecto', title: 'Abrir Gestor de Proyectos y Recientes', kbd: '', run: function () { if (typeof global.raShowProjectsModal === 'function') global.raShowProjectsModal(); } },
      { id: 'sidebar-toggle', group: 'Vista', title: 'Plegar / Desplegar Barra Lateral', kbd: 'Ctrl+B', run: function () { if (typeof global.toggleSidebarCollapse === 'function') global.toggleSidebarCollapse(); } }
    ];

    // Añadir dinámicamente cubiertas/faldones activos del proyecto
    if (global.WP && Array.isArray(global.WP.polylines)) {
      global.WP.polylines.forEach(function (poly, idx) {
        var name = (poly && poly.name) || ('Faldón #' + (idx + 1));
        cmds.push({
          id: 'poly-' + idx,
          group: 'Cubiertas Activas',
          title: 'Seleccionar ' + name,
          kbd: '3D',
          run: function () { if (typeof global.wpSelectPolyline === 'function') global.wpSelectPolyline(idx); }
        });
      });
    }
    return cmds;
  }

  function _renderPaletteList(query) {
    var listEl = document.getElementById('ra-cmd-palette-list');
    if (!listEl) return;
    var q = String(query || '').trim().toLowerCase();
    var all = _buildCommandCatalog();
    _paletteFiltered = !q ? all : all.filter(function (c) {
      var hay = (c.group + ' ' + c.title + ' ' + (c.kbd || '')).toLowerCase();
      return q.split(/\s+/).every(function (tok) { return hay.indexOf(tok) !== -1; });
    });
    if (_paletteSelectedIdx >= _paletteFiltered.length) _paletteSelectedIdx = 0;

    if (_paletteFiltered.length === 0) {
      listEl.innerHTML = '<div style="padding:18px;text-align:center;color:#94A3B8;font-size:12px;">Sin comandos coincidentes para "' + _esc(query) + '".</div>';
      return;
    }

    listEl.innerHTML = _paletteFiltered.map(function (c, idx) {
      var isSel = idx === _paletteSelectedIdx;
      return '<button type="button" class="ra-cmd-item' + (isSel ? ' is-selected' : '') + '" data-cmd-idx="' + idx + '">' +
        '<span class="ra-cmd-group">' + _esc(c.group) + '</span>' +
        '<span class="ra-cmd-title">' + _esc(c.title) + '</span>' +
        (c.kbd ? '<kbd class="ra-cmd-kbd">' + _esc(c.kbd) + '</kbd>' : '') +
      '</button>';
    }).join('');
  }

  function _executePaletteIdx(idx) {
    var item = _paletteFiltered[idx];
    closeCommandPalette();
    if (item && typeof item.run === 'function') {
      try { item.run(); } catch (err) {
        if (global.RA && global.RA.log) global.RA.log.warn('Error ejecutando comando palette', err);
      }
    }
  }

  function closeCommandPalette() {
    var modal = document.getElementById('ra-command-palette-modal');
    if (modal) modal.style.display = 'none';
  }

  function openCommandPalette() {
    if (typeof document === 'undefined') return;
    var modal = document.getElementById('ra-command-palette-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'ra-command-palette-modal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('aria-labelledby', 'ra-cmd-palette-title');
      modal.className = 'ra-aaa-overlay';
      modal.innerHTML =
        '<div class="ra-cmd-box">' +
          '<div class="ra-cmd-head">' +
            '<h2 id="ra-cmd-palette-title" class="sr-only">Paleta rápida de comandos</h2>' +
            '<input id="ra-cmd-palette-input" type="text" autocomplete="off" placeholder="Escribe un comando, paso, herramienta o cubierta... (Esc para cerrar)" aria-label="Buscar comando">' +
            '<button type="button" id="ra-cmd-palette-close" class="ra-aaa-close-btn" aria-label="Cerrar paleta de comandos">✕</button>' +
          '</div>' +
          '<div id="ra-cmd-palette-list" class="ra-cmd-list" role="listbox" aria-label="Lista de comandos"></div>' +
          '<div class="ra-cmd-foot"><span>↑↓ Navegar · Intro Ejecutar · Esc Cerrar</span><span>Atajo: Ctrl+K</span></div>' +
        '</div>';
      document.body.appendChild(modal);

      var input = document.getElementById('ra-cmd-palette-input');
      var listEl = document.getElementById('ra-cmd-palette-list');
      var closeBtn = document.getElementById('ra-cmd-palette-close');
      if (closeBtn) closeBtn.onclick = closeCommandPalette;
      if (input) {
        input.addEventListener('input', function () {
          _paletteSelectedIdx = 0;
          _renderPaletteList(input.value);
        });
        input.addEventListener('keydown', function (ev) {
          if (ev.key === 'ArrowDown') {
            ev.preventDefault();
            if (_paletteFiltered.length > 0) {
              _paletteSelectedIdx = (_paletteSelectedIdx + 1) % _paletteFiltered.length;
              _renderPaletteList(input.value);
            }
          } else if (ev.key === 'ArrowUp') {
            ev.preventDefault();
            if (_paletteFiltered.length > 0) {
              _paletteSelectedIdx = (_paletteSelectedIdx - 1 + _paletteFiltered.length) % _paletteFiltered.length;
              _renderPaletteList(input.value);
            }
          } else if (ev.key === 'Enter') {
            ev.preventDefault();
            _executePaletteIdx(_paletteSelectedIdx);
          }
        });
      }
      if (listEl) {
        listEl.addEventListener('click', function (ev) {
          var btn = ev.target && ev.target.closest ? ev.target.closest('[data-cmd-idx]') : null;
          if (!btn) return;
          _executePaletteIdx(parseInt(btn.getAttribute('data-cmd-idx'), 10));
        });
      }
    }

    _paletteSelectedIdx = 0;
    modal.style.display = 'flex';
    var inp = document.getElementById('ra-cmd-palette-input');
    if (inp) {
      inp.value = '';
      _renderPaletteList('');
      setTimeout(function () { try { inp.focus(); } catch (_) {} }, 15);
    }
  }

  // ── 3. CHULETA INTERACTIVA DE ATAJOS (?) ────────────────────────────────────
  function closeShortcutsModal() {
    var modal = document.getElementById('ra-shortcuts-modal');
    if (modal) modal.style.display = 'none';
  }

  function openShortcutsModal() {
    if (typeof document === 'undefined') return;
    var modal = document.getElementById('ra-shortcuts-modal');
    if (!modal) {
      var rows = [
        ['Ctrl + K', 'Abrir Paleta Rápida de Comandos'],
        ['Ctrl + J', 'Abrir / Cerrar Cajón Inferior (MPPT · Unifilar · P50/P90)'],
        ['Ctrl + B', 'Plegar / Desplegar barra lateral'],
        ['Ctrl + S', 'Guardar proyecto (.raproject)'],
        ['Ctrl + Z / Y', 'Deshacer / Rehacer operación CAD'],
        ['Q / Shift + Q', 'Ciclar selección de capas CAD superpuestas'],
        ['Flechas / Shift + Flechas', 'Desplazar placas ±1 cm / ±10 cm'],
        ['M / L / T / H', 'Cinta métrica / Etiquetas / PBR / Sondeo solar en vivo'],
        ['F / Shift + F', 'Filtro de puntería CAD / Modo Foco'],
        ['C / Shift + C', 'Modo Captura Limpia / Auditoría elevada de cables'],
        ['Esc', 'Cerrar ventana superior o cancelar herramienta activa'],
        ['?', 'Mostrar esta chuleta de atajos']
      ];
      modal = document.createElement('div');
      modal.id = 'ra-shortcuts-modal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('aria-labelledby', 'ra-shortcuts-title');
      modal.className = 'ra-aaa-overlay';
      modal.innerHTML =
        '<div class="ra-cmd-box" style="max-width:560px;">' +
          '<div class="ra-cmd-head" style="justify-content:space-between;">' +
            '<h2 id="ra-shortcuts-title" style="margin:0;font-size:14px;font-weight:900;color:#F8FAFC;">ATAJOS DE TECLADO · WORKSPACE CAD</h2>' +
            '<button type="button" id="ra-shortcuts-close" class="ra-aaa-close-btn" aria-label="Cerrar chuleta de atajos">✕</button>' +
          '</div>' +
          '<div style="padding:14px 18px;max-height:70vh;overflow-y:auto;">' +
            '<table style="width:100%;border-collapse:collapse;font-size:12px;">' +
              '<thead><tr style="color:#94A3B8;text-align:left;border-bottom:1px solid rgba(255,255,255,0.1);"><th scope="col" style="padding:6px 8px;">Atajo</th><th scope="col" style="padding:6px 8px;">Acción</th></tr></thead>' +
              '<tbody>' + rows.map(function (r) {
                return '<tr style="border-bottom:1px solid rgba(255,255,255,0.06);"><td style="padding:7px 8px;"><kbd class="ra-cmd-kbd">' + _esc(r[0]) + '</kbd></td><td style="padding:7px 8px;color:#E2E8F0;">' + _esc(r[1]) + '</td></tr>';
              }).join('') + '</tbody>' +
            '</table>' +
          '</div>' +
        '</div>';
      document.body.appendChild(modal);
      var closeBtn = document.getElementById('ra-shortcuts-close');
      if (closeBtn) closeBtn.onclick = closeShortcutsModal;
    }
    modal.style.display = 'flex';
  }

  // ── 4. CAJÓN INFERIOR REDIMENSIONABLE (MPPT · UNIFILAR · P50/P90) ───────────
  function _ensureEngineeringDrawer() {
    var drawer = document.getElementById('ra-engineering-drawer');
    if (drawer) return drawer;

    drawer = document.createElement('section');
    drawer.id = 'ra-engineering-drawer';
    drawer.setAttribute('aria-label', 'Panel inferior de ingeniería ampliada');
    drawer.hidden = true;
    drawer.innerHTML =
      '<div id="ra-drawer-resizer" title="Arrastra verticalmente para ajustar altura"></div>' +
      '<div class="ra-drawer-head">' +
        '<div class="ra-drawer-tabs" role="tablist">' +
          '<button type="button" role="tab" class="ra-drawer-tab active" data-drawer-tab="mppt" aria-selected="true">Matriz MPPT</button>' +
          '<button type="button" role="tab" class="ra-drawer-tab" data-drawer-tab="autostring" aria-selected="false">Auto-Stringing 3D</button>' +
          '<button type="button" role="tab" class="ra-drawer-tab" data-drawer-tab="bishop" aria-selected="false">Curva I-V Bishop</button>' +
          '<button type="button" role="tab" class="ra-drawer-tab" data-drawer-tab="datadis" aria-selected="false">Datadis P1–P6</button>' +
          '<button type="button" role="tab" class="ra-drawer-tab" data-drawer-tab="unifilar" aria-selected="false">Unifilar</button>' +
          '<button type="button" role="tab" class="ra-drawer-tab" data-drawer-tab="bankable" aria-selected="false">P50/P90</button>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:6px;">' +
          '<button type="button" id="ra-drawer-refresh" class="doc-mini-btn" style="font-size:11px;padding:4px 9px;">Actualizar</button>' +
          '<button type="button" id="ra-drawer-close" class="ra-aaa-close-btn" aria-label="Cerrar panel inferior">✕</button>' +
        '</div>' +
      '</div>' +
      '<div id="ra-drawer-body" class="ra-drawer-body"></div>';
    document.body.appendChild(drawer);

    drawer.querySelectorAll('[data-drawer-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        _drawerTab = btn.getAttribute('data-drawer-tab') || 'mppt';
        renderEngineeringDrawerContent();
      });
    });
    var refBtn = document.getElementById('ra-drawer-refresh');
    if (refBtn) refBtn.onclick = renderEngineeringDrawerContent;
    var clsBtn = document.getElementById('ra-drawer-close');
    if (clsBtn) clsBtn.onclick = closeEngineeringDrawer;

    // Redimensionado vertical por arrastre
    var resizer = document.getElementById('ra-drawer-resizer');
    if (resizer) {
      var dragging = false;
      var startY = 0;
      var startH = _drawerHeightPx;
      resizer.addEventListener('pointerdown', function (ev) {
        dragging = true;
        startY = ev.clientY;
        startH = drawer.getBoundingClientRect().height || _drawerHeightPx;
        ev.preventDefault();
      });
      global.addEventListener('pointermove', function (ev) {
        if (!dragging) return;
        var nextH = Math.max(190, Math.min(Math.round(global.innerHeight * 0.72), Math.round(startH + (startY - ev.clientY))));
        _drawerHeightPx = nextH;
        drawer.style.height = nextH + 'px';
      });
      global.addEventListener('pointerup', function () { dragging = false; });
    }
    return drawer;
  }

  function renderEngineeringDrawerContent() {
    var drawer = document.getElementById('ra-engineering-drawer');
    var body = document.getElementById('ra-drawer-body');
    if (!drawer || !body || !_drawerOpen) return;

    drawer.querySelectorAll('[data-drawer-tab]').forEach(function (btn) {
      var isAct = btn.getAttribute('data-drawer-tab') === _drawerTab;
      btn.classList.toggle('active', isAct);
      btn.setAttribute('aria-selected', isAct ? 'true' : 'false');
    });

    if (_drawerTab === 'autostring') {
      if (!global.RAShadowAutoStringer) {
        body.innerHTML = '<div style="color:#94A3B8;font-size:12px;">Motor de Auto-Stringing 3D no disponible.</div>';
        return;
      }
      var prop = global.RAShadowAutoStringer.analyze();
      body.innerHTML =
        '<div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;">' +
          '<span style="font-size:12px;color:#CBD5E1;font-weight:700;">Agrupación inteligente por clúster de sombras 3D, ventana eléctrica e entradas por MPPT</span>' +
          '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
            '<button type="button" id="ra-as-apply" class="doc-mini-btn" style="background:#059669;border-color:#10B981;color:#fff;font-weight:800;padding:5px 12px;"' + (prop.empty ? ' disabled' : '') + '>Aplicar a Matriz MPPT</button>' +
            '<button type="button" id="ra-as-reset" class="doc-mini-btn" style="padding:5px 10px;">Restaurar Automático</button>' +
          '</div>' +
        '</div>' +
        global.RAShadowAutoStringer.buildReportHTML(prop);
      var btnApply = document.getElementById('ra-as-apply');
      if (btnApply) btnApply.onclick = function () {
        global.RAShadowAutoStringer.applyProposal(prop);
        renderEngineeringDrawerContent();
      };
      var btnReset = document.getElementById('ra-as-reset');
      if (btnReset) btnReset.onclick = function () {
        if (global.RAMPPTMatrix && typeof global.RAMPPTMatrix.resetToAuto === 'function') global.RAMPPTMatrix.resetToAuto();
        renderEngineeringDrawerContent();
      };
      return;
    }

    if (_drawerTab === 'bishop') {
      if (!global.RABishopIVEngine) {
        body.innerHTML = '<div style="color:#94A3B8;font-size:12px;">Motor Bishop I-V 8760h no disponible.</div>';
        return;
      }
      var sim = global.RABishopIVEngine.runAnnualSimulation();
      body.innerHTML =
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;">' +
          '<span style="font-size:12px;color:#CBD5E1;font-weight:700;">Simulación horaria anual 8760h · Curva I-V Bishop 3 sub-strings + barrido MPPT multi-pico</span>' +
          '<button type="button" id="ra-bishop-recalc" class="doc-mini-btn" style="background:#0369A1;border-color:#38BDF8;color:#fff;font-weight:700;padding:5px 12px;">Recalcular I-V</button>' +
        '</div>' +
        global.RABishopIVEngine.buildSummaryHTML(sim);
      var btnRec = document.getElementById('ra-bishop-recalc');
      if (btnRec) btnRec.onclick = renderEngineeringDrawerContent;
      return;
    }

    if (_drawerTab === 'datadis') {
      if (!global.RADatadisOptimizer) {
        body.innerHTML = '<div style="color:#94A3B8;font-size:12px;">Optimizador Datadis 8760h no disponible.</div>';
        return;
      }
      var lastRes = global.RADatadisOptimizer.getLastResult();
      body.innerHTML =
        '<div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;">' +
          '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
            '<label for="ra-datadis-file" class="doc-mini-btn" style="background:#0369A1;border-color:#38BDF8;color:#fff;font-weight:800;padding:5px 12px;cursor:pointer;">Cargar CSV Datadis / Distribuidora</label>' +
            '<input id="ra-datadis-file" type="file" accept=".csv,.txt" style="display:none;">' +
            '<button type="button" id="ra-datadis-sample" class="doc-mini-btn" style="padding:5px 10px;color:#7DD3FC;border-color:rgba(56,189,248,0.4);">Cargar muestra industrial 3.0TD</button>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:11px;color:#CBD5E1;">' +
            '<label for="ra-datadis-tariff">Tarifa:</label>' +
            '<select id="ra-datadis-tariff" style="background:#0F172A;border:1px solid #475569;color:#F8FAFC;border-radius:6px;padding:4px 8px;font-size:11px;">' +
              '<option value="">Auto</option><option value="2.0TD">2.0TD</option><option value="3.0TD">3.0TD</option><option value="6.1TD">6.1TD</option>' +
            '</select>' +
            '<label style="display:inline-flex;align-items:center;gap:4px;cursor:pointer;"><input type="checkbox" id="ra-datadis-zero"> Inyección cero</label>' +
          '</div>' +
        '</div>' +
        '<div id="ra-datadis-output">' + global.RADatadisOptimizer.buildReportHTML(lastRes) + '</div>';

      var runOnText = function (csvText) {
        try {
          var parsed = global.RADatadisOptimizer.parseCsv(csvText);
          var tSel = document.getElementById('ra-datadis-tariff');
          var zChk = document.getElementById('ra-datadis-zero');
          var res = global.RADatadisOptimizer.simulateAndOptimize(parsed, {
            tariff: (tSel && tSel.value) || undefined,
            zeroExport: Boolean(zChk && zChk.checked)
          });
          var out = document.getElementById('ra-datadis-output');
          if (out) out.innerHTML = global.RADatadisOptimizer.buildReportHTML(res);
          if (global.showToast) {
            global.showToast('CURVA 8760h PROCESADA', res.tariff + ' · Ahorro estimado ' + res.totalAnnualSavingsEur.toLocaleString('es-ES') + ' €/año (energía + potencia).', 'success', 3200);
          }
        } catch (err) {
          if (global.showToast) global.showToast('ERROR CSV DATADIS', String(err && err.message ? err.message : err), 'warning', 3500);
        }
      };

      var fileInp = document.getElementById('ra-datadis-file');
      if (fileInp) {
        fileInp.onchange = function () {
          var f = fileInp.files && fileInp.files[0];
          if (!f) return;
          var reader = new FileReader();
          reader.onload = function () { runOnText(String(reader.result || '')); };
          reader.readAsText(f, 'UTF-8');
        };
      }
      var btnSample = document.getElementById('ra-datadis-sample');
      if (btnSample) {
        btnSample.onclick = function () {
          runOnText(global.RADatadisOptimizer.generateSampleIndustrialCsv());
        };
      }
      return;
    }

    if (_drawerTab === 'bankable') {
      if (global.RABankableRisk && typeof global.RABankableRisk.buildTableHTML === 'function') {
        body.innerHTML = global.RABankableRisk.buildTableHTML(global.RABankableRisk.evaluate());
      } else {
        body.innerHTML = '<div style="color:#94A3B8;font-size:12px;">Motor probabilístico P50/P90 no disponible.</div>';
      }
      return;
    }

    if (_drawerTab === 'unifilar') {
      var livePanel = document.getElementById('step4-live-topology-svg') || document.getElementById('step4-unifilar-preview');
      if (livePanel && livePanel.innerHTML && livePanel.innerHTML.trim().length > 40) {
        body.innerHTML = '<div style="background:#0B1120;border:1px solid rgba(56,189,248,0.25);border-radius:10px;padding:12px;overflow:auto;">' + livePanel.innerHTML + '</div>';
      } else if (typeof global.generateUnifilar === 'function') {
        body.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px;background:rgba(15,23,42,0.7);border:1px solid rgba(56,189,248,0.25);border-radius:10px;">' +
          '<span style="color:#CBD5E1;font-size:12px;">Genera un campo solar (Paso 2) o abre el esquema unifilar completo en formato vectorial SVG/DXF.</span>' +
          '<button type="button" class="doc-mini-btn" onclick="generateUnifilar()" style="background:#0369A1;color:#fff;border:none;padding:7px 14px;font-weight:800;">Abrir Unifilar Completo</button>' +
        '</div>';
      } else {
        body.innerHTML = '<div style="color:#94A3B8;font-size:12px;">Sin datos de topología eléctrica todavía.</div>';
      }
      return;
    }

    // Tab MPPT: resumen tabular amplio + estado eléctrico por faldón
    var calcs = null;
    try { if (typeof global.getProjectCalcs === 'function') calcs = global.getProjectCalcs(); } catch (_) {}
    var mpptDom = document.getElementById('step4-mppt-matrix-container') || document.getElementById('step3-mppt-matrix-container');
    var summaryBar = calcs && calcs.numPanels > 0
      ? '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-bottom:10px;">' +
          '<div class="ra-drawer-kpi"><span>Módulos / Potencia DC</span><strong>' + calcs.numPanels + ' uds · ' + Number(calcs.P_dc_kW || 0).toFixed(2) + ' kWp</strong></div>' +
          '<div class="ra-drawer-kpi"><span>Strings / Inversor AC</span><strong>' + (calcs.numStrings || 0) + ' strings · ' + Number(calcs.P_ac_kW || 0).toFixed(2) + ' kW AC</strong></div>' +
          '<div class="ra-drawer-kpi"><span>Voc Frío / Vmp String</span><strong>' + Math.round(calcs.Voc_str_cold || 0) + ' V / ' + Math.round(calcs.Vmp || 0) + ' V</strong></div>' +
          '<div class="ra-drawer-kpi"><span>Caída ΔV DC / AC</span><strong>' + Number(calcs.dVdc_p || 0).toFixed(2) + '% / ' + Number(calcs.dVac_p || 0).toFixed(2) + '%</strong></div>' +
        '</div>'
      : '';
    var matrixHtml = (mpptDom && mpptDom.innerHTML && mpptDom.innerHTML.trim().length > 20)
      ? '<div style="background:rgba(15,23,42,0.7);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px;">' + mpptDom.innerHTML + '</div>'
      : '<div style="padding:14px;border:1px dashed rgba(255,255,255,0.16);border-radius:8px;color:#94A3B8;font-size:12px;">Define al menos un faldón con placas en el Paso 2 para inspeccionar aquí la matriz MPPT en vista panorámica.</div>';
    body.innerHTML = summaryBar + matrixHtml;
  }

  function openEngineeringDrawer(tab) {
    var drawer = _ensureEngineeringDrawer();
    if (tab) _drawerTab = tab;
    _drawerOpen = true;
    drawer.hidden = false;
    drawer.style.display = 'flex';
    drawer.style.height = _drawerHeightPx + 'px';
    renderEngineeringDrawerContent();
  }

  function closeEngineeringDrawer() {
    _drawerOpen = false;
    var drawer = document.getElementById('ra-engineering-drawer');
    if (drawer) {
      drawer.hidden = true;
      drawer.style.display = 'none';
    }
  }

  function toggleEngineeringDrawer(tab) {
    if (_drawerOpen && (!tab || tab === _drawerTab)) closeEngineeringDrawer();
    else openEngineeringDrawer(tab);
  }

  // ── 5. INYECCIÓN EN CABECERA Y ESCUCHA GLOBAL DE ATAJOS ────────────────────
  function injectWorkspaceHeaderControls() {
    if (typeof document === 'undefined') return;
    var actions = document.querySelector('#ra-sidebar .sb-header-actions');
    if (actions && !document.getElementById('btn-ra-cmd-palette')) {
      var btnCmd = document.createElement('button');
      btnCmd.type = 'button';
      btnCmd.id = 'btn-ra-cmd-palette';
      btnCmd.className = 'doc-mini-btn';
      btnCmd.title = 'Paleta rápida de comandos [Ctrl+K]';
      btnCmd.setAttribute('aria-label', 'Abrir paleta rápida de comandos');
      btnCmd.style.cssText = 'border-color:rgba(56,189,248,0.45);background:rgba(56,189,248,0.14);color:#7DD3FC;font-size:11px;font-weight:800;padding:3px 6px;';
      btnCmd.textContent = '⌘K';
      btnCmd.onclick = openCommandPalette;
      actions.insertBefore(btnCmd, actions.firstChild);
    }

    var stepperWrap = document.getElementById('wp-stepper-fixed-container');
    if (stepperWrap && !document.getElementById('ra-aaa-mode-bar')) {
      var bar = document.createElement('div');
      bar.id = 'ra-aaa-mode-bar';
      bar.innerHTML =
        '<div style="display:flex;align-items:center;gap:6px;">' +
          '<span style="font-size:11px;color:#94A3B8;font-weight:700;">VISTA:</span>' +
          '<button type="button" id="btn-ra-ui-mode" class="ra-mode-chip" aria-pressed="false">EXPERTO</button>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:5px;">' +
          '<button type="button" id="btn-ra-open-drawer" class="ra-mode-chip" title="Abrir Cajón Inferior Panorámico (MPPT · Unifilar · P50/P90) [Ctrl+J]">Panel MPPT/P90</button>' +
          '<button type="button" id="btn-ra-shortcuts-help" class="ra-mode-chip" aria-label="Ver atajos de teclado" title="Chuleta de atajos de teclado [?]">?</button>' +
        '</div>';
      stepperWrap.appendChild(bar);

      var modeBtn = document.getElementById('btn-ra-ui-mode');
      if (modeBtn) modeBtn.onclick = toggleUiMode;
      var drwBtn = document.getElementById('btn-ra-open-drawer');
      if (drwBtn) drwBtn.onclick = function () { toggleEngineeringDrawer('mppt'); };
      var helpBtn = document.getElementById('btn-ra-shortcuts-help');
      if (helpBtn) helpBtn.onclick = openShortcutsModal;
    }

    // Restaurar modo comercial/experto guardado
    var savedMode = 'expert';
    try { savedMode = localStorage.getItem(UI_MODE_KEY) || 'expert'; } catch (_) {}
    applyUiMode(savedMode, true);
  }

  function initGlobalShortcuts() {
    if (typeof document === 'undefined') return;
    document.addEventListener('keydown', function (ev) {
      if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'k' || ev.key === 'K')) {
        ev.preventDefault();
        openCommandPalette();
        return;
      }
      if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'j' || ev.key === 'J')) {
        ev.preventDefault();
        toggleEngineeringDrawer();
        return;
      }
      var active = document.activeElement;
      var tag = active && active.tagName ? active.tagName.toLowerCase() : '';
      var isTyping = tag === 'input' || tag === 'textarea' || tag === 'select' || (active && active.isContentEditable);
      if (!isTyping && !ev.ctrlKey && !ev.metaKey && !ev.altKey && ev.key === '?') {
        ev.preventDefault();
        openShortcutsModal();
      }
    });

    // Sincronizar cajón inferior ante eventos de proyecto
    if (global.RA && global.RA.EventBus && global.RA.Events) {
      global.RA.EventBus.on(global.RA.Events.PROJECT_UPDATED, function () {
        if (_drawerOpen) renderEngineeringDrawerContent();
      });
    }
  }

  function init() {
    injectWorkspaceHeaderControls();
    initGlobalShortcuts();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }

  var api = {
    openCommandPalette: openCommandPalette,
    closeCommandPalette: closeCommandPalette,
    openShortcutsModal: openShortcutsModal,
    closeShortcutsModal: closeShortcutsModal,
    openEngineeringDrawer: openEngineeringDrawer,
    closeEngineeringDrawer: closeEngineeringDrawer,
    toggleEngineeringDrawer: toggleEngineeringDrawer,
    applyUiMode: applyUiMode,
    toggleUiMode: toggleUiMode
  };
  global.RAWorkspaceAAA = api;
  global.RA = global.RA || {};
  global.RA.Workspace = api;
})(typeof window !== 'undefined' ? window : globalThis);
