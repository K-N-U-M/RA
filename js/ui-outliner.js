/**
 * ============================================================================
 * 🎛️ UI OUTLINER — RA SOLAR 3D (CAD/BIM SCENE TREE INSPECTOR)
 * Componente visual reactivo que muestra el árbol jerárquico BIM de la escena:
 * Proyecto -> Edificios 3D -> Cubiertas Solares -> Faldones -> Paneles FV
 *                          -> Obstáculos en Cubierta
 *          -> Planos Independientes -> Faldones
 *          -> Obstáculos en Terreno
 * ============================================================================
 */

(function(global) {
  'use strict';

  let container = null;
  let isOpen = false;
  let isCollapsed = false;
  let _renderPending = false;
  const sectionCollapsedState = {
    buildings: false,
    planes: false,
    standalone: false,
    obstacles: false,
    electrical: false,
    wind: false
  };

  const UIOutliner = {
    init: function() {
      if (document.getElementById('ra-cad-outliner-panel')) return;

      container = document.createElement('div');
      container.id = 'ra-cad-outliner-panel';
      container.className = 'ra-cad-outliner';
      container.hidden = true;
      container.style.display = 'none';
      container.innerHTML = `
        <div class="outliner-header">
          <div style="display:flex;align-items:center;gap:6px;">
            <span class="outliner-icon" aria-hidden="true">🗂️</span>
            <span class="outliner-title">ÁRBOL DE PROYECTO</span>
          </div>
          <div style="display:flex;align-items:center;gap:4px;">
            <span id="outliner-badge-totals" class="outliner-badge">0 kWp</span>
            <button type="button" class="outliner-toggle-btn" id="outliner-collapse-btn" onclick="UIOutliner.toggleCollapse(event)" aria-expanded="true" aria-controls="outliner-tree-content" aria-label="Contraer o expandir árbol de proyecto" title="Contraer o expandir árbol">▼</button>
            <button type="button" class="outliner-toggle-btn" id="outliner-close-btn" onclick="UIOutliner.close(); event.stopPropagation();" style="font-weight:bold;font-size:11px;padding:2px 6px;margin-left:2px;color:#f87171;" aria-label="Cerrar árbol de proyecto" title="Cerrar Árbol de Proyecto">✕</button>
          </div>
        </div>
        <div class="outliner-body" id="outliner-tree-content">
          <!-- Renderizado dinámico -->
        </div>
      `;

      this.injectStyles();
      document.body.appendChild(container);

      if (typeof global.makeElementDraggable === 'function') {
        const hdr = container.querySelector('.outliner-header');
        if (hdr) global.makeElementDraggable(container, hdr, 'ra_outliner_pos');
      }

      // Suscribirse a cambios en la jerarquía BIM y eventos eólicos
      if (global.ProjectHierarchy && typeof global.ProjectHierarchy.subscribe === 'function') {
        global.ProjectHierarchy.subscribe(function() {
          UIOutliner.render();
        });
      }
      if (global.RAWind && global.RAWind.Entity && typeof global.RAWind.Entity.subscribe === 'function') {
        global.RAWind.Entity.subscribe(function() {
          UIOutliner.render();
        });
      }

      this.render();
    },

    open: function() {
      if (!container) this.init();
      if (!container) return;
      isOpen = true;
      container.hidden = false;
      container.style.display = 'flex';
      container.classList.add('is-open');
      if (typeof global.bringToFront === 'function') global.bringToFront(container);
      if (typeof window !== 'undefined' && window.innerWidth <= 768) {
        const sb = document.getElementById('ra-sidebar');
        if (sb && !sb.classList.contains('collapsed') && typeof global.toggleSidebarCollapse === 'function') {
          global.toggleSidebarCollapse();
        }
        if (typeof global.toggleSolarHUD === 'function') {
          global.toggleSolarHUD(false);
        }
        if (global.BOMTreeEngine && typeof global.BOMTreeEngine.close === 'function') {
          global.BOMTreeEngine.close();
        }
      }
      this.render();
    },

    close: function() {
      isOpen = false;
      if (container) {
        container.hidden = true;
        container.style.display = 'none';
        container.classList.remove('is-open');
      }
    },

    isOpen: function() {
      return isOpen;
    },

    toggle: function() {
      if (!container) this.init();
      if (!container) return;
      if (!isOpen || container.hidden) {
        this.open();
      } else {
        this.close();
      }
    },

    toggleCollapse: function(e) {
      if (e) e.stopPropagation();
      isCollapsed = !isCollapsed;
      const body = document.getElementById('outliner-tree-content');
      const btn = document.getElementById('outliner-collapse-btn');
      if (body) body.style.display = isCollapsed ? 'none' : 'flex';
      if (btn) {
        btn.textContent = isCollapsed ? '▲' : '▼';
        btn.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
      }
    },

    toggleSection: function(sectionKey, e) {
      if (e) e.stopPropagation();
      sectionCollapsedState[sectionKey] = !sectionCollapsedState[sectionKey];
      const grp = document.getElementById('outliner-grp-' + sectionKey);
      const chevron = document.getElementById('outliner-chev-' + sectionKey);
      const isCol = !!sectionCollapsedState[sectionKey];
      if (grp) grp.style.display = isCol ? 'none' : 'flex';
      if (chevron) chevron.textContent = isCol ? '▶' : '▼';
    },

    render: function() {
      if (_renderPending) return;
      _renderPending = true;
      const self = this;
      (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : setTimeout)(function() {
        _renderPending = false;
        self._executeRender();
      });
    },

    _executeRender: function() {
      const treeContent = document.getElementById('outliner-tree-content');
      const badgeTotals = document.getElementById('outliner-badge-totals');
      if (!treeContent || !global.ProjectHierarchy) return;

      const _esc = function(v) {
        if (global.RASanitize && typeof global.RASanitize.plain === 'function') return global.RASanitize.plain(v);
        return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      };

      if (!treeContent.dataset.raOutlinerBound) {
        treeContent.dataset.raOutlinerBound = '1';
        treeContent.addEventListener('keydown', function(e) {
          if (e.key === 'Enter' || e.key === ' ') {
            const btn = e.target && e.target.closest ? e.target.closest('[data-outliner-act]') : null;
            if (btn && btn !== document.activeElement.closest('.node-action-btn')) {
              e.preventDefault();
              btn.click();
            }
          }
        });
        treeContent.addEventListener('click', function(e) {
          const btn = e.target && e.target.closest ? e.target.closest('[data-outliner-act]') : null;
          if (!btn || !global.ProjectHierarchy) return;
          const act = btn.getAttribute('data-outliner-act');
          if (btn.getAttribute('data-stop') === '1') e.stopPropagation();
          const id = btn.getAttribute('data-outliner-id');
          const type = btn.getAttribute('data-outliner-type');
          const idxRaw = btn.getAttribute('data-outliner-idx');
          const idx = idxRaw != null ? parseInt(idxRaw, 10) : NaN;
          if (act === 'selectBuilding') global.ProjectHierarchy.selectBuilding(id, true);
          else if (act === 'selectPlane' && !isNaN(idx)) global.ProjectHierarchy.selectPlane(idx, true);
          else if (act === 'selectPolyline' && !isNaN(idx)) global.ProjectHierarchy.selectPolyline(idx, true);
          else if (act === 'selectAllPanels' && !isNaN(idx)) global.ProjectHierarchy.selectAllPanelsInPolyline(idx);
          else if (act === 'togglePanelsActive' && !isNaN(idx)) global.ProjectHierarchy.togglePanelsActive(idx);
          else if (act === 'selectObstacle') global.ProjectHierarchy.selectObstacle(id, true);
          else if (act === 'selectElectrical') global.ProjectHierarchy.selectElectrical(id, true);
          else if (act === 'selectWind') global.ProjectHierarchy.selectWindTurbine(id, true);
          else if (act === 'toggleVis') {
            global.ProjectHierarchy.toggleVisibility(type, !isNaN(idx) ? idx : id);
          } else if (act === 'delete') {
            global.ProjectHierarchy.deleteItem(type, !isNaN(idx) ? idx : id);
          } else if (act === 'toggleSection') {
            if (global.UIOutliner && typeof global.UIOutliner.toggleSection === 'function') {
              global.UIOutliner.toggleSection(type, e);
            }
          }
        });
      }

      const tree = global.ProjectHierarchy.getTree();

      // Actualizar badge global de cabecera
      if (badgeTotals) {
        if (tree.totals.totalKwp > 0) {
          badgeTotals.textContent = `${tree.totals.panelsCount} mod · ${tree.totals.totalKwp.toFixed(2)} kWp`;
        } else if (tree.totals.buildingsCount > 0 || tree.totals.planesCount > 0) {
          badgeTotals.textContent = `${tree.totals.buildingsCount} Edif · ${tree.totals.planesCount} Planos`;
        } else {
          badgeTotals.textContent = 'Vacío';
        }
      }

      const hasElements = (tree.buildings.length > 0 || tree.planes.length > 0 || tree.standalonePolylines.length > 0 || tree.obstacles.length > 0 || (tree.electrical && tree.electrical.length > 0) || (tree.windTurbines && tree.windTurbines.length > 0));

      if (!hasElements) {
        treeContent.innerHTML = `
          <div class="outliner-empty-state">
            <span style="font-size:18px;">🏛️</span>
            <span style="font-weight:700;">Escena sin elementos.</span>
            <span style="font-size: 11px;color:#94a3b8;">Dibuja un edificio 3D o define un plano en el Paso 1.</span>
          </div>
        `;
        return;
      }

      let html = '';

      // ── 1. EDIFICIOS 3D Y SUS CUBIERTAS / FALDONES HIJOS ──
      if (tree.buildings.length > 0) {
        const bldCol = !!sectionCollapsedState.buildings;
        html += `
          <div class="outliner-accordion-group">
            <div class="outliner-group-header" role="button" tabindex="0" data-outliner-act="toggleSection" data-outliner-type="buildings">
              <div style="display:flex;align-items:center;gap:6px;">
                <span class="outliner-chevron" id="outliner-chev-buildings">${bldCol ? '▶' : '▼'}</span>
                <span>🏢 EDIFICIOS 3D (${tree.buildings.length})</span>
              </div>
              <span class="outliner-group-count">${tree.buildings.length}</span>
            </div>
            <div class="outliner-group-content" id="outliner-grp-buildings" style="display:${bldCol ? 'none' : 'flex'};">
        `;
        tree.buildings.forEach(function(bld) {
          const isSel = bld.isSelected ? 'active-node' : '';
          const bIdEsc = _esc(bld.id);
          const bNameEsc = _esc(bld.name);
          html += `
            <div class="outliner-bld-card ${isSel}">
              <div class="outliner-bld-header" role="button" tabindex="0" data-outliner-act="selectBuilding" data-outliner-id="${bIdEsc}">
                <div style="display:flex;align-items:center;gap:5px;flex:1;overflow:hidden;">
                  <span class="node-icon">🏢</span>
                  <span class="node-label bld-name" title="${bNameEsc}">${bNameEsc} (${bld.height}m)</span>
                </div>
                <div class="node-meta">
                  <span class="badge-stats">${bld.panelsCount} pl · ${bld.totalKwp.toFixed(1)} kWp</span>
                  <button type="button" class="node-action-btn" title="Alternar visibilidad" data-stop="1" data-outliner-act="toggleVis" data-outliner-type="building" data-outliner-id="${bIdEsc}">${bld.visible ? '👁️' : '🙈'}</button>
                  <button type="button" class="node-action-btn delete-btn" title="Eliminar edificio" data-stop="1" data-outliner-act="delete" data-outliner-type="building" data-outliner-id="${bIdEsc}">🗑️</button>
                </div>
              </div>
              <div class="outliner-nested-container">
          `;

          if (bld.planes.length === 0) {
            html += `
              <div class="outliner-hint-row">
                <span>Sin plano solar. Usa 'Convertir Cubierta en Plano'</span>
              </div>
            `;
          } else {
            bld.planes.forEach(function(pl) {
              const plActive = pl.isActive ? 'active-plane-sub' : '';
              const plNameEsc = _esc(pl.name);
              html += `
                <div class="outliner-plane-sub-card ${plActive}">
                  <div class="outliner-sub-header" role="button" tabindex="0" data-outliner-act="selectPlane" data-outliner-idx="${pl.index}">
                    <div style="display:flex;align-items:center;gap:4px;flex:1;overflow:hidden;">
                      <span class="node-icon">🏠</span>
                      <span class="node-label sub-plane-name" title="${plNameEsc}">${plNameEsc}</span>
                    </div>
                    <div class="node-meta">
                      <span class="badge-angle">${pl.tiltDeg}° · ${pl.azimuthDeg}°</span>
                      <button type="button" class="node-action-btn" title="Alternar visibilidad" data-stop="1" data-outliner-act="toggleVis" data-outliner-type="plane" data-outliner-idx="${pl.index}">${pl.visible ? '👁️' : '🙈'}</button>
                    </div>
                  </div>
                  <div class="outliner-polylines-container">
              `;

              if (pl.polylines.length === 0) {
                html += `<div class="outliner-no-poly"><span>Sin faldones trazados.</span></div>`;
              } else {
                pl.polylines.forEach(function(poly) {
                  const polySel = poly.isSelected ? 'selected-poly' : '';
                  const areaBadge = (typeof poly.areaM2 === 'number' && poly.areaM2 > 0) ? (poly.areaM2.toFixed(1) + ' m²') : 'CAD';
                  const pVis = poly.panelsVisible !== false;
                  const pDisabled = poly.panelsDisabled === true;
                  const pClass = (pVis ? '' : 'is-hidden-node') + (pDisabled ? ' is-deactivated-node' : '');
                  const polyNameEsc = _esc(poly.name);
                  const pBadge = pDisabled
                    ? `<span class="badge-stats is-deactivated" title="Mesa desactivada: excluida de mediciones y presupuestos">${poly.totalPanelsCount || poly.panelsCount} pl · OFF</span>`
                    : `<span class="badge-stats" title="Módulos y potencia instalada en ${polyNameEsc}">${poly.panelsCount} pl · ${poly.kwp.toFixed(2)} kWp</span>`;
                  html += `
                    <div class="outliner-poly-group">
                      <div class="outliner-poly-item ${polySel} ${poly.visible ? '' : 'is-hidden-node'}" data-outliner-act="selectPolyline" data-outliner-idx="${poly.index}">
                        <div style="display:flex;align-items:center;gap:4px;flex:1;overflow:hidden;">
                          <span class="node-bullet">└ ✏️</span>
                          <span class="node-label poly-name" title="${polyNameEsc}">${polyNameEsc}</span>
                        </div>
                        <div class="node-meta">
                          <span class="badge-dim" title="Superficie geométrica del faldón">${areaBadge}</span>
                          <button type="button" class="node-action-btn" title="Mostrar/Ocultar contorno CAD del faldón" data-stop="1" data-outliner-act="toggleVis" data-outliner-type="polyline" data-outliner-idx="${poly.index}">${poly.visible ? '👁️' : '🙈'}</button>
                          <button type="button" class="node-action-btn delete-btn" title="Eliminar faldón" data-stop="1" data-outliner-act="delete" data-outliner-type="polyline" data-outliner-idx="${poly.index}">🗑️</button>
                        </div>
                      </div>
                      <div class="outliner-panels-item ${pClass}" data-outliner-act="selectAllPanels" data-outliner-idx="${poly.index}">
                        <div style="display:flex;align-items:center;gap:4px;flex:1;overflow:hidden;padding-left:14px;">
                          <span class="node-bullet">└ ☀️</span>
                          <span class="node-label panels-node-name" title="Clic para seleccionar las placas FV de ${polyNameEsc}">Placas FV</span>
                        </div>
                        <div class="node-meta">
                          ${pBadge}
                          <button type="button" class="node-action-btn toggle-active-btn" title="${pDisabled ? 'Placas desactivadas. Clic para ACTIVAR e incluir en mediciones y presupuesto.' : 'Placas activas. Clic para DESACTIVAR y excluir de mediciones y presupuesto.'}" data-stop="1" data-outliner-act="togglePanelsActive" data-outliner-idx="${poly.index}">${pDisabled ? '<span style="color:#f87171;font-weight:bold;font-size:11px;padding:1px 4px;border-radius:2px;background:rgba(239,68,68,0.18);border:1px solid rgba(239,68,68,0.4);">OFF</span>' : '<span style="color:#34d399;font-weight:bold;font-size:11px;padding:1px 4px;border-radius:2px;background:rgba(16,185,129,0.18);border:1px solid rgba(16,185,129,0.4);">ON</span>'}</button>
                          <button type="button" class="node-action-btn" title="Mostrar/Ocultar placas FV en 3D" data-stop="1" data-outliner-act="toggleVis" data-outliner-type="poly_panels" data-outliner-idx="${poly.index}">${pVis ? '👁️' : '🙈'}</button>
                        </div>
                      </div>
                    </div>
                  `;
                });
              }

              html += `
                  </div>
                </div>
              `;
            });
          }

          // Obstáculos asociados a este edificio
          if (bld.obstacles.length > 0) {
            html += `<div class="outliner-sub-label">Obstáculos en cubierta:</div>`;
            bld.obstacles.forEach(function(obs) {
              const obsSel = obs.isSelected ? 'selected-obs' : '';
              const oIdEsc = _esc(obs.id);
              const oNameEsc = _esc(obs.name);
              html += `
                <div class="outliner-obs-item ${obsSel}" data-outliner-act="selectObstacle" data-outliner-id="${oIdEsc}">
                  <div style="display:flex;align-items:center;gap:4px;flex:1;overflow:hidden;">
                    <span class="node-icon">📦</span>
                    <span class="node-label obs-name" title="${oNameEsc}">${oNameEsc}</span>
                  </div>
                  <div class="node-meta">
                    <span class="badge-dim">${obs.w}×${obs.l}×${obs.h}m</span>
                    <button type="button" class="node-action-btn" title="Alternar visibilidad" data-stop="1" data-outliner-act="toggleVis" data-outliner-type="obstacle" data-outliner-id="${oIdEsc}">${obs.visible ? '👁️' : '🙈'}</button>
                    <button type="button" class="node-action-btn delete-btn" title="Eliminar obstáculo" data-stop="1" data-outliner-act="delete" data-outliner-type="obstacle" data-outliner-id="${oIdEsc}">🗑️</button>
                  </div>
                </div>
              `;
            });
          }

          html += `
              </div>
            </div>
          `;
        });
        html += `</div></div>`;
      }

      // ── 2. PLANOS DE CUBIERTA INDEPENDIENTES (SOBRE FOTOGRAMETRÍA 3D) ──
      if (tree.planes.length > 0) {
        const plCol = !!sectionCollapsedState.planes;
        html += `
          <div class="outliner-accordion-group">
            <div class="outliner-group-header" role="button" tabindex="0" data-outliner-act="toggleSection" data-outliner-type="planes">
              <div style="display:flex;align-items:center;gap:6px;">
                <span class="outliner-chevron" id="outliner-chev-planes">${plCol ? '▶' : '▼'}</span>
                <span>🏠 PLANOS INDEPENDIENTES (${tree.planes.length})</span>
              </div>
              <span class="outliner-group-count">${tree.planes.length}</span>
            </div>
            <div class="outliner-group-content" id="outliner-grp-planes" style="display:${plCol ? 'none' : 'flex'};">
        `;
        tree.planes.forEach(function(p) {
          const planeActive = p.isActive ? 'active-node' : '';
          const pNameEsc = _esc(p.name);
          html += `
            <div class="outliner-plane-card ${planeActive}">
              <div class="outliner-plane-header" role="button" tabindex="0" data-outliner-act="selectPlane" data-outliner-idx="${p.index}">
                <div style="display:flex;align-items:center;gap:5px;flex:1;overflow:hidden;">
                  <span class="node-icon">🏠</span>
                  <span class="node-label plane-name" title="${pNameEsc}">${pNameEsc}</span>
                </div>
                <div class="node-meta">
                  <span class="badge-angle">${p.tiltDeg}° · ${p.azimuthDeg}°</span>
                  <button type="button" class="node-action-btn" title="Alternar visibilidad" data-stop="1" data-outliner-act="toggleVis" data-outliner-type="plane" data-outliner-idx="${p.index}">${p.visible ? '👁️' : '🙈'}</button>
                  <button type="button" class="node-action-btn delete-btn" title="Eliminar plano" data-stop="1" data-outliner-act="delete" data-outliner-type="plane" data-outliner-idx="${p.index}">🗑️</button>
                </div>
              </div>
              <div class="outliner-polylines-container">
          `;

          if (p.polylines.length === 0) {
            html += `<div class="outliner-no-poly"><span>Sin faldones trazados.</span></div>`;
          } else {
            p.polylines.forEach(function(poly) {
              const polySel = poly.isSelected ? 'selected-poly' : '';
              const areaBadge = (typeof poly.areaM2 === 'number' && poly.areaM2 > 0) ? (poly.areaM2.toFixed(1) + ' m²') : 'CAD';
              const pVis = poly.panelsVisible !== false;
              const pDisabled = poly.panelsDisabled === true;
              const pClass = (pVis ? '' : 'is-hidden-node') + (pDisabled ? ' is-deactivated-node' : '');
              const polyNameEsc = _esc(poly.name);
              const pBadge = pDisabled
                ? `<span class="badge-stats is-deactivated" title="Mesa desactivada: excluida de mediciones y presupuestos">${poly.totalPanelsCount || poly.panelsCount} pl · OFF</span>`
                : `<span class="badge-stats" title="Módulos y potencia instalada en ${polyNameEsc}">${poly.panelsCount} pl · ${poly.kwp.toFixed(2)} kWp</span>`;
              html += `
                <div class="outliner-poly-group">
                  <div class="outliner-poly-item ${polySel} ${poly.visible ? '' : 'is-hidden-node'}" data-outliner-act="selectPolyline" data-outliner-idx="${poly.index}">
                    <div style="display:flex;align-items:center;gap:4px;flex:1;overflow:hidden;">
                      <span class="node-bullet">└ ✏️</span>
                      <span class="node-label poly-name" title="${polyNameEsc}">${polyNameEsc}</span>
                    </div>
                    <div class="node-meta">
                      <span class="badge-dim" title="Superficie geométrica del faldón">${areaBadge}</span>
                      <button type="button" class="node-action-btn" title="Mostrar/Ocultar contorno CAD del faldón" data-stop="1" data-outliner-act="toggleVis" data-outliner-type="polyline" data-outliner-idx="${poly.index}">${poly.visible ? '👁️' : '🙈'}</button>
                      <button type="button" class="node-action-btn delete-btn" title="Eliminar faldón" data-stop="1" data-outliner-act="delete" data-outliner-type="polyline" data-outliner-idx="${poly.index}">🗑️</button>
                    </div>
                  </div>
                  <div class="outliner-panels-item ${pClass}" data-outliner-act="selectAllPanels" data-outliner-idx="${poly.index}">
                    <div style="display:flex;align-items:center;gap:4px;flex:1;overflow:hidden;padding-left:14px;">
                      <span class="node-bullet">└ ☀️</span>
                      <span class="node-label panels-node-name" title="Clic para seleccionar las placas FV de ${polyNameEsc}">Placas FV</span>
                    </div>
                    <div class="node-meta">
                      ${pBadge}
                      <button type="button" class="node-action-btn toggle-active-btn" title="${pDisabled ? 'Placas desactivadas. Clic para ACTIVAR e incluir en mediciones y presupuesto.' : 'Placas activas. Clic para DESACTIVAR y excluir de mediciones y presupuesto.'}" data-stop="1" data-outliner-act="togglePanelsActive" data-outliner-idx="${poly.index}">${pDisabled ? '<span style="color:#f87171;font-weight:bold;font-size:11px;padding:1px 4px;border-radius:2px;background:rgba(239,68,68,0.18);border:1px solid rgba(239,68,68,0.4);">OFF</span>' : '<span style="color:#34d399;font-weight:bold;font-size:11px;padding:1px 4px;border-radius:2px;background:rgba(16,185,129,0.18);border:1px solid rgba(16,185,129,0.4);">ON</span>'}</button>
                      <button type="button" class="node-action-btn" title="Mostrar/Ocultar placas FV en 3D" data-stop="1" data-outliner-act="toggleVis" data-outliner-type="poly_panels" data-outliner-idx="${poly.index}">${pVis ? '👁️' : '🙈'}</button>
                    </div>
                  </div>
                </div>
              `;
            });
          }

          html += `
              </div>
            </div>
          `;
        });
        html += `</div></div>`;
      }

      // ── 3. FALDONES AUTÓNOMOS ──
      if (tree.standalonePolylines.length > 0) {
        const stdCol = !!sectionCollapsedState.standalone;
        html += `
          <div class="outliner-accordion-group">
            <div class="outliner-group-header" role="button" tabindex="0" data-outliner-act="toggleSection" data-outliner-type="standalone">
              <div style="display:flex;align-items:center;gap:6px;">
                <span class="outliner-chevron" id="outliner-chev-standalone">${stdCol ? '▶' : '▼'}</span>
                <span>📐 FALDONES AUTÓNOMOS (${tree.standalonePolylines.length})</span>
              </div>
              <span class="outliner-group-count">${tree.standalonePolylines.length}</span>
            </div>
            <div class="outliner-group-content" id="outliner-grp-standalone" style="display:${stdCol ? 'none' : 'flex'};">
        `;
        tree.standalonePolylines.forEach(function(poly) {
          const polySel = poly.isSelected ? 'selected-poly' : '';
          const areaBadge = (typeof poly.areaM2 === 'number' && poly.areaM2 > 0) ? (poly.areaM2.toFixed(1) + ' m²') : 'CAD';
          const pVis = poly.panelsVisible !== false;
          const pDisabled = poly.panelsDisabled === true;
          const pClass = (pVis ? '' : 'is-hidden-node') + (pDisabled ? ' is-deactivated-node' : '');
          const polyNameEsc = _esc(poly.name);
          const pBadge = pDisabled
            ? `<span class="badge-stats is-deactivated" title="Mesa desactivada: excluida de mediciones y presupuestos">${poly.totalPanelsCount || poly.panelsCount} pl · OFF</span>`
            : `<span class="badge-stats" title="Módulos y potencia instalada en ${polyNameEsc}">${poly.panelsCount} pl · ${poly.kwp.toFixed(2)} kWp</span>`;
          html += `
            <div class="outliner-poly-group">
              <div class="outliner-poly-item ${polySel} ${poly.visible ? '' : 'is-hidden-node'}" data-outliner-act="selectPolyline" data-outliner-idx="${poly.index}">
                <div style="display:flex;align-items:center;gap:4px;flex:1;overflow:hidden;">
                  <span class="node-bullet">✏️</span>
                  <span class="node-label poly-name" title="${polyNameEsc}">${polyNameEsc}</span>
                </div>
                <div class="node-meta">
                  <span class="badge-dim" title="Superficie geométrica del faldón">${areaBadge}</span>
                  <button type="button" class="node-action-btn" title="Mostrar/Ocultar contorno CAD del faldón" data-stop="1" data-outliner-act="toggleVis" data-outliner-type="polyline" data-outliner-idx="${poly.index}">${poly.visible ? '👁️' : '🙈'}</button>
                  <button type="button" class="node-action-btn delete-btn" title="Eliminar faldón" data-stop="1" data-outliner-act="delete" data-outliner-type="polyline" data-outliner-idx="${poly.index}">🗑️</button>
                </div>
              </div>
              <div class="outliner-panels-item ${pClass}" data-outliner-act="selectAllPanels" data-outliner-idx="${poly.index}">
                <div style="display:flex;align-items:center;gap:4px;flex:1;overflow:hidden;padding-left:12px;">
                  <span class="node-bullet">└ ☀️</span>
                  <span class="node-label panels-node-name" title="Clic para seleccionar las placas FV de ${polyNameEsc}">Placas FV</span>
                </div>
                <div class="node-meta">
                  ${pBadge}
                  <button type="button" class="node-action-btn toggle-active-btn" title="${pDisabled ? 'Placas desactivadas. Clic para ACTIVAR e incluir en mediciones y presupuesto.' : 'Placas activas. Clic para DESACTIVAR y excluir de mediciones y presupuesto.'}" data-stop="1" data-outliner-act="togglePanelsActive" data-outliner-idx="${poly.index}">${pDisabled ? '<span style="color:#f87171;font-weight:bold;font-size:11px;padding:1px 4px;border-radius:2px;background:rgba(239,68,68,0.18);border:1px solid rgba(239,68,68,0.4);">OFF</span>' : '<span style="color:#34d399;font-weight:bold;font-size:11px;padding:1px 4px;border-radius:2px;background:rgba(16,185,129,0.18);border:1px solid rgba(16,185,129,0.4);">ON</span>'}</button>
                  <button type="button" class="node-action-btn" title="Mostrar/Ocultar placas FV en 3D" data-stop="1" data-outliner-act="toggleVis" data-outliner-type="poly_panels" data-outliner-idx="${poly.index}">${pVis ? '👁️' : '🙈'}</button>
                </div>
              </div>
            </div>
          `;
        });
        html += `</div></div>`;
      }

      // ── 4. OBSTÁCULOS EN TERRENO / GLOBALES ──
      if (tree.obstacles.length > 0) {
        const obsCol = !!sectionCollapsedState.obstacles;
        html += `
          <div class="outliner-accordion-group">
            <div class="outliner-group-header" role="button" tabindex="0" data-outliner-act="toggleSection" data-outliner-type="obstacles">
              <div style="display:flex;align-items:center;gap:6px;">
                <span class="outliner-chevron" id="outliner-chev-obstacles">${obsCol ? '▶' : '▼'}</span>
                <span>🧱 OBSTÁCULOS EN TERRENO (${tree.obstacles.length})</span>
              </div>
              <span class="outliner-group-count">${tree.obstacles.length}</span>
            </div>
            <div class="outliner-group-content" id="outliner-grp-obstacles" style="display:${obsCol ? 'none' : 'flex'};">
        `;
        tree.obstacles.forEach(function(obs) {
          const obsSel = obs.isSelected ? 'selected-obs' : '';
          const oIdEsc = _esc(obs.id);
          const oNameEsc = _esc(obs.name);
          html += `
            <div class="outliner-obs-item ${obsSel}" data-outliner-act="selectObstacle" data-outliner-id="${oIdEsc}">
              <div style="display:flex;align-items:center;gap:4px;flex:1;overflow:hidden;">
                <span class="node-icon">📦</span>
                <span class="node-label obs-name" title="${oNameEsc}">${oNameEsc}</span>
              </div>
              <div class="node-meta">
                <span class="badge-dim">${obs.w}×${obs.l}×${obs.h}m</span>
                <button type="button" class="node-action-btn" title="Alternar visibilidad" data-stop="1" data-outliner-act="toggleVis" data-outliner-type="obstacle" data-outliner-id="${oIdEsc}">${obs.visible ? '👁️' : '🙈'}</button>
                <button type="button" class="node-action-btn delete-btn" title="Eliminar obstáculo" data-stop="1" data-outliner-act="delete" data-outliner-type="obstacle" data-outliner-id="${oIdEsc}">🗑️</button>
              </div>
            </div>
          `;
        });
        html += `</div></div>`;
      }

      // ── 5. EQUIPOS ELÉCTRICOS & CUADROS (PASO 4) ──
      if (tree.electrical && tree.electrical.length > 0) {
        const elCol = !!sectionCollapsedState.electrical;
        html += `
          <div class="outliner-accordion-group">
            <div class="outliner-group-header" role="button" tabindex="0" data-outliner-act="toggleSection" data-outliner-type="electrical">
              <div style="display:flex;align-items:center;gap:6px;">
                <span class="outliner-chevron" id="outliner-chev-electrical">${elCol ? '▶' : '▼'}</span>
                <span>⚡ CUADROS & EQUIPOS ELÉCTRICOS (${tree.electrical.length})</span>
              </div>
              <span class="outliner-group-count">${tree.electrical.length}</span>
            </div>
            <div class="outliner-group-content" id="outliner-grp-electrical" style="display:${elCol ? 'none' : 'flex'};">
        `;
        tree.electrical.forEach(function(eq) {
          const eqSel = eq.isSelected ? 'selected-obs active-node' : '';
          const eqIdEsc = _esc(eq.id);
          const eqNameEsc = _esc(eq.name);
          const eqIconEsc = _esc(eq.icon);
          if (eq.isCableMetric) {
            html += `
              <div class="outliner-obs-item" style="background:rgba(56,189,248,0.08);border-left:2px solid #38BDF8;cursor:default;">
                <div style="display:flex;align-items:center;gap:4px;flex:1;overflow:hidden;">
                  <span class="node-icon">${eqIconEsc}</span>
                  <span class="node-label obs-name" style="color:#BAE6FD;font-weight:700;" title="${eqNameEsc}">${eqNameEsc}</span>
                </div>
              </div>
            `;
          } else {
            html += `
              <div class="outliner-obs-item ${eqSel}" data-outliner-act="selectElectrical" data-outliner-id="${eqIdEsc}">
                <div style="display:flex;align-items:center;gap:4px;flex:1;overflow:hidden;">
                  <span class="node-icon">${eqIconEsc}</span>
                  <span class="node-label obs-name" title="${eqNameEsc}">${eqNameEsc}</span>
                </div>
                <div class="node-meta">
                  <button type="button" class="node-action-btn" title="Alternar visibilidad" data-stop="1" data-outliner-act="toggleVis" data-outliner-type="electrical" data-outliner-id="${eqIdEsc}">${eq.visible ? '👁️' : '🙈'}</button>
                  <button type="button" class="node-action-btn delete-btn" title="Eliminar equipo" data-stop="1" data-outliner-act="delete" data-outliner-type="electrical" data-outliner-id="${eqIdEsc}">🗑️</button>
                </div>
              </div>
            `;
          }
        });
        html += `</div></div>`;
      }

      // ── 6. AEROGENERADORES EÓLICOS 3D (RA-WIND) ──
      if (tree.windTurbines && tree.windTurbines.length > 0) {
        const windCol = !!sectionCollapsedState.wind;
        html += `
          <div class="outliner-accordion-group">
            <div class="outliner-group-header" role="button" tabindex="0" data-outliner-act="toggleSection" data-outliner-type="wind">
              <div style="display:flex;align-items:center;gap:6px;">
                <span class="outliner-chevron" id="outliner-chev-wind">${windCol ? '▶' : '▼'}</span>
                <span>💨 AEROGENERADORES (${tree.windTurbines.length})</span>
              </div>
              <span class="outliner-group-count">${tree.windTurbines.length}</span>
            </div>
            <div class="outliner-group-content" id="outliner-grp-wind" style="display:${windCol ? 'none' : 'flex'};">
        `;
        tree.windTurbines.forEach(function(wt) {
          const wtSel = wt.isSelected ? 'selected-obs active-node' : '';
          const wtVis = wt.visible !== false;
          const wtIdEsc = _esc(wt.id);
          const wtNameEsc = _esc(wt.name);
          html += `
            <div class="outliner-obs-item ${wtSel} ${wtVis ? '' : 'is-hidden-node'}" data-outliner-act="selectWind" data-outliner-id="${wtIdEsc}">
              <div style="display:flex;align-items:center;gap:4px;flex:1;overflow:hidden;">
                <span class="node-icon">💨</span>
                <span class="node-label obs-name" title="${wtNameEsc}">${wtNameEsc}</span>
              </div>
              <div class="node-meta">
                <span class="badge-dim">${wt.ratedPowerKw} kW · H:${wt.hubHeightM}m</span>
                <button type="button" class="node-action-btn" title="Alternar activación/visibilidad" data-stop="1" data-outliner-act="toggleVis" data-outliner-type="wind_turbine" data-outliner-id="${wtIdEsc}">${wtVis ? '👁️' : '🙈'}</button>
                <button type="button" class="node-action-btn delete-btn" title="Eliminar aerogenerador" data-stop="1" data-outliner-act="delete" data-outliner-type="wind_turbine" data-outliner-id="${wtIdEsc}">🗑️</button>
              </div>
            </div>
          `;
        });
        html += `</div></div>`;
      }

      treeContent.innerHTML = html;
    },

    injectStyles: function() {
      const styleId = 'ra-outliner-styles';
      if (document.getElementById(styleId)) return;

      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        .ra-cad-outliner {
          position: fixed;
          top: 190px;
          right: 76px;
          width: 320px;
          height: auto;
          max-height: calc(100vh - 230px);
          background: rgba(15, 23, 42, 0.94);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          border: 1px solid rgba(56, 189, 248, 0.45);
          border-radius: 12px;
          box-shadow: 0 10px 32px rgba(0, 0, 0, 0.75), 0 0 16px rgba(56, 189, 248, 0.20);
          display: flex;
          flex-direction: column;
          z-index: var(--z-floating, 200);
          font-family: 'Inter', -apple-system, sans-serif;
          color: #f8fafc;
          overflow: hidden;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }

        .outliner-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 12px;
          background: rgba(30, 41, 59, 0.90);
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          cursor: pointer;
          user-select: none;
        }

        .outliner-title {
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.6px;
          color: #38bdf8;
        }

        .outliner-badge {
          font-size: 11px;
          font-weight: 800;
          padding: 2px 6px;
          border-radius: 4px;
          background: rgba(56, 189, 248, 0.18);
          color: #38bdf8;
          border: 1px solid rgba(56, 189, 248, 0.3);
        }

        .outliner-toggle-btn {
          background: transparent;
          border: none;
          color: #94a3b8;
          font-size: 11px;
          cursor: pointer;
          padding: 2px 4px;
        }

        .outliner-body {
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding: 8px;
          overflow-y: auto;
          flex: 1 1 auto;
          min-height: 0;
        }

        .outliner-accordion-group {
          display: flex;
          flex-direction: column;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          overflow: hidden;
          background: rgba(15, 23, 42, 0.45);
        }

        .outliner-group-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 6px 8px;
          background: rgba(30, 41, 59, 0.65);
          cursor: pointer;
          user-select: none;
          font-size: 11px;
          font-weight: 800;
          color: #94a3b8;
          border-bottom: 1px solid rgba(255, 255, 255, 0.04);
          transition: background 0.15s ease, color 0.15s ease;
        }

        .outliner-group-header:hover {
          background: rgba(56, 189, 248, 0.15);
          color: #38bdf8;
        }

        .outliner-chevron {
          font-size: 11px;
          color: #38bdf8;
          width: 12px;
          display: inline-block;
          text-align: center;
        }

        .outliner-group-count {
          font-size: 11px;
          background: rgba(255, 255, 255, 0.1);
          color: #cbd5e1;
          padding: 1px 5px;
          border-radius: 10px;
        }

        .outliner-group-content {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 6px;
        }

        /* [FIX-SCROLL] Los hijos flex se comprimían (flex-shrink por defecto) cuando el
        contenido excedía el max-height: las filas de faldones quedaban reducidas a
        franjas de unos píxeles y no aparecía scrollbar. Con flex-shrink:0 el contenido
        desborda el body y activa el scroll vertical. */
        .outliner-body > * {
          flex: 0 0 auto;
        }

        .outliner-empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          padding: 16px 8px;
          text-align: center;
          font-size: 11px;
          color: #94a3b8;
        }

        .outliner-group-title {
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.5px;
          color: #94a3b8;
          padding: 4px 2px 2px 2px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        .outliner-bld-card, .outliner-plane-card {
          background: rgba(0, 0, 0, 0.35);
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 6px;
          overflow: hidden;
          transition: border-color 0.2s ease;
        }

        .outliner-bld-card.active-node, .outliner-plane-card.active-node {
          border-color: rgba(245, 158, 11, 0.7);
          box-shadow: 0 0 10px rgba(245, 158, 11, 0.2);
        }

        .outliner-bld-header, .outliner-plane-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 6px 8px;
          background: rgba(255, 255, 255, 0.03);
          cursor: pointer;
        }

        .outliner-bld-header:hover, .outliner-plane-header:hover {
          background: rgba(255, 255, 255, 0.06);
        }

        .outliner-nested-container {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 4px 6px 6px 10px;
          background: rgba(0, 0, 0, 0.15);
        }

        .outliner-plane-sub-card {
          background: rgba(255, 255, 255, 0.02);
          border: 1px dashed rgba(255, 255, 255, 0.1);
          border-radius: 4px;
          overflow: hidden;
        }

        .outliner-plane-sub-card.active-plane-sub {
          border-color: rgba(56, 189, 248, 0.5);
          background: rgba(56, 189, 248, 0.06);
        }

        .outliner-sub-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 4px 6px;
          cursor: pointer;
        }

        .outliner-hint-row {
          font-size: 11px;
          color: #94a3b8;
          font-style: italic;
          padding: 3px 6px;
        }

        .outliner-sub-label {
          font-size: 11px;
          font-weight: 700;
          color: #cbd5e1;
          margin-top: 4px;
          padding-left: 4px;
        }

        .node-label {
          font-size: 11px;
          font-weight: 700;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .bld-name, .plane-name {
          color: #f8fafc;
        }

        .sub-plane-name {
          color: #38bdf8;
          font-size: 11px;
        }

        .poly-name {
          color: #e2e8f0;
          font-size: 11px;
        }

        .obs-name {
          color: #fbbf24;
          font-size: 11px;
        }

        .node-meta {
          display: flex;
          align-items: center;
          gap: 3px;
        }

        .badge-angle {
          font-size: 11px;
          color: #f59e0b;
          background: rgba(245, 158, 11, 0.12);
          padding: 1px 4px;
          border-radius: 3px;
        }

        .badge-stats {
          font-size: 11px;
          color: #10b981;
          background: rgba(16, 185, 129, 0.12);
          padding: 1px 4px;
          border-radius: 3px;
          font-weight: 700;
        }

        .badge-dim {
          font-size: 11px;
          color: #94a3b8;
          background: rgba(255, 255, 255, 0.05);
          padding: 1px 4px;
          border-radius: 3px;
        }

        .node-action-btn {
          background: transparent;
          border: none;
          font-size: 11px;
          cursor: pointer;
          padding: 1px 3px;
          opacity: 0.75;
          transition: opacity 0.15s;
        }

        .node-action-btn:hover {
          opacity: 1;
        }

        .outliner-polylines-container {
          display: flex;
          flex-direction: column;
          padding: 2px 4px 4px 8px;
          gap: 2px;
        }

        .outliner-no-poly {
          font-size: 11px;
          color: #64748b;
          font-style: italic;
          padding: 2px 4px;
        }

        .outliner-poly-group {
          display: flex;
          flex-direction: column;
          gap: 1px;
        }

        .outliner-poly-item, .outliner-obs-item, .outliner-panels-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 3px 6px;
          border-radius: 4px;
          background: rgba(255, 255, 255, 0.02);
          cursor: pointer;
          border: 1px solid transparent;
          transition: background 0.15s ease, opacity 0.15s ease;
        }

        .outliner-panels-item {
          background: rgba(16, 185, 129, 0.04);
          border-left: 2px solid rgba(16, 185, 129, 0.35);
          margin-left: 6px;
        }

        .outliner-poly-item:hover, .outliner-obs-item:hover, .outliner-panels-item:hover {
          background: rgba(255, 255, 255, 0.06);
        }

        .outliner-panels-item:hover {
          background: rgba(16, 185, 129, 0.12);
          border-color: rgba(16, 185, 129, 0.45);
        }

        .panels-node-name {
          color: #6ee7b7;
          font-size: 11px;
        }

        .is-hidden-node {
          opacity: 0.48;
        }

        .is-deactivated-node {
          opacity: 0.58;
          border-left-color: #ef4444 !important;
          background: rgba(239, 68, 68, 0.05) !important;
        }

        .is-deactivated-node .panels-node-name {
          color: #fca5a5 !important;
          text-decoration: line-through;
        }

        .badge-stats.is-deactivated {
          background: rgba(239, 68, 68, 0.15) !important;
          color: #f87171 !important;
          border: 1px solid rgba(239, 68, 68, 0.35) !important;
        }

        .toggle-active-btn {
          padding: 1px 2px;
          cursor: pointer;
        }

        .outliner-poly-item.selected-poly {
          border-color: #38bdf8;
          background: rgba(56, 189, 248, 0.12);
        }

        .outliner-obs-item.selected-obs {
          border-color: #f59e0b;
          background: rgba(245, 158, 11, 0.12);
        }
      `;
      document.head.appendChild(style);
    }
  };

  global.UIOutliner = UIOutliner;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { UIOutliner.init(); });
  } else {
    setTimeout(function() { UIOutliner.init(); }, 300);
  }

})(typeof window !== 'undefined' ? window : this);
