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
  let isCollapsed = false;
  let _renderPending = false;

  const UIOutliner = {
    init: function() {
      if (document.getElementById('ra-cad-outliner-panel')) return;

      container = document.createElement('div');
      container.id = 'ra-cad-outliner-panel';
      container.className = 'ra-cad-outliner';
      container.style.display = 'none';
      container.innerHTML = `
        <div class="outliner-header" onclick="UIOutliner.toggleCollapse(event)">
          <div style="display:flex;align-items:center;gap:6px;">
            <span class="outliner-icon">🗂️</span>
            <span class="outliner-title">ÁRBOL DE PROYECTO</span>
          </div>
          <div style="display:flex;align-items:center;gap:4px;">
            <span id="outliner-badge-totals" class="outliner-badge">0 kWp</span>
            <button type="button" class="outliner-toggle-btn" id="outliner-collapse-btn">▼</button>
            <button type="button" class="outliner-toggle-btn" onclick="UIOutliner.close(); event.stopPropagation();" style="font-weight:bold;font-size:11px;padding:2px 6px;margin-left:2px;color:#f87171;" title="Cerrar Árbol de Proyecto">✕</button>
          </div>
        </div>
        <div class="outliner-body" id="outliner-tree-content">
          <!-- Renderizado dinámico -->
        </div>
      `;

      this.injectStyles();
      document.body.appendChild(container);

      // Suscribirse a cambios en la jerarquía BIM
      if (global.ProjectHierarchy && typeof global.ProjectHierarchy.subscribe === 'function') {
        global.ProjectHierarchy.subscribe(function() {
          UIOutliner.render();
        });
      }

      this.render();
    },

    open: function() {
      if (!container) this.init();
      if (!container) return;
      container.style.display = 'flex';
      container.classList.add('mobile-active');
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
      if (container) {
        container.style.display = 'none';
        container.classList.remove('mobile-active');
      }
    },

    toggle: function() {
      if (!container) this.init();
      if (!container) return;
      if (container.style.display === 'none' || !container.style.display || !container.classList.contains('mobile-active')) {
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
      if (btn) btn.textContent = isCollapsed ? '▲' : '▼';
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

      const tree = global.ProjectHierarchy.getTree();

      // Actualizar badge global de cabecera
      if (badgeTotals) {
        if (tree.totals.totalKwp > 0) {
          badgeTotals.textContent = `${tree.totals.panelsCount} mod · ${tree.totals.totalKwp.toFixed(1)} kWp`;
        } else if (tree.totals.buildingsCount > 0 || tree.totals.planesCount > 0) {
          badgeTotals.textContent = `${tree.totals.buildingsCount} Edif · ${tree.totals.planesCount} Planos`;
        } else {
          badgeTotals.textContent = 'Vacío';
        }
      }

      const hasElements = (tree.buildings.length > 0 || tree.planes.length > 0 || tree.standalonePolylines.length > 0 || tree.obstacles.length > 0 || (tree.electrical && tree.electrical.length > 0));

      if (!hasElements) {
        treeContent.innerHTML = `
          <div class="outliner-empty-state">
            <span style="font-size:18px;">🏛️</span>
            <span style="font-weight:700;">Escena sin elementos.</span>
            <span style="font-size: 10px;color:#94a3b8;">Dibuja un edificio 3D o define un plano en el Paso 1.</span>
          </div>
        `;
        return;
      }

      let html = '';

      // ── 1. EDIFICIOS 3D Y SUS CUBIERTAS / FALDONES HIJOS ──
      if (tree.buildings.length > 0) {
        html += `<div class="outliner-group-title">🏢 EDIFICIOS 3D (${tree.buildings.length})</div>`;
        tree.buildings.forEach(function(bld) {
          const isSel = bld.isSelected ? 'active-node' : '';
          html += `
            <div class="outliner-bld-card ${isSel}">
              <div class="outliner-bld-header" onclick="ProjectHierarchy.selectBuilding('${bld.id}', true)">
                <div style="display:flex;align-items:center;gap:5px;flex:1;overflow:hidden;">
                  <span class="node-icon">🏢</span>
                  <span class="node-label bld-name" title="${bld.name}">${bld.name} (${bld.height}m)</span>
                </div>
                <div class="node-meta">
                  <span class="badge-stats">${bld.panelsCount} pl · ${bld.totalKwp.toFixed(1)} kWp</span>
                  <button type="button" class="node-action-btn" title="Alternar visibilidad" onclick="event.stopPropagation();ProjectHierarchy.toggleVisibility('building', '${bld.id}');">${bld.visible ? '👁️' : '🙈'}</button>
                  <button type="button" class="node-action-btn delete-btn" title="Eliminar edificio" onclick="event.stopPropagation();ProjectHierarchy.deleteItem('building', '${bld.id}');">🗑️</button>
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
              html += `
                <div class="outliner-plane-sub-card ${plActive}">
                  <div class="outliner-sub-header" onclick="ProjectHierarchy.selectPlane(${pl.index}, true)">
                    <div style="display:flex;align-items:center;gap:4px;flex:1;overflow:hidden;">
                      <span class="node-icon">🏠</span>
                      <span class="node-label sub-plane-name" title="${pl.name}">${pl.name}</span>
                    </div>
                    <div class="node-meta">
                      <span class="badge-angle">${pl.tiltDeg}° · ${pl.azimuthDeg}°</span>
                      <button type="button" class="node-action-btn" title="Alternar visibilidad" onclick="event.stopPropagation();ProjectHierarchy.toggleVisibility('plane', ${pl.index});">${pl.visible ? '👁️' : '🙈'}</button>
                    </div>
                  </div>
                  <div class="outliner-polylines-container">
              `;

              if (pl.polylines.length === 0) {
                html += `<div class="outliner-no-poly"><span>Sin faldones trazados.</span></div>`;
              } else {
                pl.polylines.forEach(function(poly) {
                  const polySel = poly.isSelected ? 'selected-poly' : '';
                  html += `
                    <div class="outliner-poly-item ${polySel}" onclick="ProjectHierarchy.selectPolyline(${poly.index}, true)">
                      <div style="display:flex;align-items:center;gap:4px;flex:1;overflow:hidden;">
                        <span class="node-bullet">└ ✏️</span>
                        <span class="node-label poly-name" title="${poly.name}">${poly.name}</span>
                      </div>
                      <div class="node-meta">
                        <span class="badge-stats" style="cursor:pointer;" title="Clic para seleccionar todas las placas de este faldón" onclick="event.stopPropagation();ProjectHierarchy.selectAllPanelsInPolyline(${poly.index});">${poly.panelsCount} pl · ${poly.kwp.toFixed(1)} kWp</span>
                        <button type="button" class="node-action-btn" title="Alternar visibilidad" onclick="event.stopPropagation();ProjectHierarchy.toggleVisibility('polyline', ${poly.index});">${poly.visible ? '👁️' : '🙈'}</button>
                        <button type="button" class="node-action-btn delete-btn" title="Eliminar faldón" onclick="event.stopPropagation();ProjectHierarchy.deleteItem('polyline', ${poly.index});">🗑️</button>
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
              html += `
                <div class="outliner-obs-item ${obsSel}" onclick="ProjectHierarchy.selectObstacle('${obs.id}', true)">
                  <div style="display:flex;align-items:center;gap:4px;flex:1;overflow:hidden;">
                    <span class="node-icon">📦</span>
                    <span class="node-label obs-name" title="${obs.name}">${obs.name}</span>
                  </div>
                  <div class="node-meta">
                    <span class="badge-dim">${obs.w}×${obs.l}×${obs.h}m</span>
                    <button type="button" class="node-action-btn" title="Alternar visibilidad" onclick="event.stopPropagation();ProjectHierarchy.toggleVisibility('obstacle', '${obs.id}');">${obs.visible ? '👁️' : '🙈'}</button>
                    <button type="button" class="node-action-btn delete-btn" title="Eliminar obstáculo" onclick="event.stopPropagation();ProjectHierarchy.deleteItem('obstacle', '${obs.id}');">🗑️</button>
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

      // ── 2. PLANOS DE CUBIERTA INDEPENDIENTES (SOBRE FOTOGRAMETRÍA 3D) ──
      if (tree.planes.length > 0) {
        html += `<div class="outliner-group-title">🏠 PLANOS INDEPENDIENTES (${tree.planes.length})</div>`;
        tree.planes.forEach(function(p) {
          const planeActive = p.isActive ? 'active-node' : '';
          html += `
            <div class="outliner-plane-card ${planeActive}">
              <div class="outliner-plane-header" onclick="ProjectHierarchy.selectPlane(${p.index}, true)">
                <div style="display:flex;align-items:center;gap:5px;flex:1;overflow:hidden;">
                  <span class="node-icon">🏠</span>
                  <span class="node-label plane-name" title="${p.name}">${p.name}</span>
                </div>
                <div class="node-meta">
                  <span class="badge-angle">${p.tiltDeg}° · ${p.azimuthDeg}°</span>
                  <button type="button" class="node-action-btn" title="Alternar visibilidad" onclick="event.stopPropagation();ProjectHierarchy.toggleVisibility('plane', ${p.index});">${p.visible ? '👁️' : '🙈'}</button>
                  <button type="button" class="node-action-btn delete-btn" title="Eliminar plano" onclick="event.stopPropagation();ProjectHierarchy.deleteItem('plane', ${p.index});">🗑️</button>
                </div>
              </div>
              <div class="outliner-polylines-container">
          `;

          if (p.polylines.length === 0) {
            html += `<div class="outliner-no-poly"><span>Sin faldones trazados.</span></div>`;
          } else {
            p.polylines.forEach(function(poly) {
              const polySel = poly.isSelected ? 'selected-poly' : '';
              html += `
                <div class="outliner-poly-item ${polySel}" onclick="ProjectHierarchy.selectPolyline(${poly.index}, true)">
                  <div style="display:flex;align-items:center;gap:4px;flex:1;overflow:hidden;">
                    <span class="node-bullet">└ ✏️</span>
                    <span class="node-label poly-name" title="${poly.name}">${poly.name}</span>
                  </div>
                  <div class="node-meta">
                    <span class="badge-stats" style="cursor:pointer;" title="Clic para seleccionar todas las placas de este faldón" onclick="event.stopPropagation();ProjectHierarchy.selectAllPanelsInPolyline(${poly.index});">${poly.panelsCount} pl · ${poly.kwp.toFixed(1)} kWp</span>
                    <button type="button" class="node-action-btn" title="Alternar visibilidad" onclick="event.stopPropagation();ProjectHierarchy.toggleVisibility('polyline', ${poly.index});">${poly.visible ? '👁️' : '🙈'}</button>
                    <button type="button" class="node-action-btn delete-btn" title="Eliminar faldón" onclick="event.stopPropagation();ProjectHierarchy.deleteItem('polyline', ${poly.index});">🗑️</button>
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

      // ── 3. FALDONES AUTÓNOMOS ──
      if (tree.standalonePolylines.length > 0) {
        html += `<div class="outliner-group-title">📐 FALDONES AUTÓNOMOS (${tree.standalonePolylines.length})</div>`;
        tree.standalonePolylines.forEach(function(poly) {
          const polySel = poly.isSelected ? 'selected-poly' : '';
          html += `
            <div class="outliner-poly-item ${polySel}" onclick="ProjectHierarchy.selectPolyline(${poly.index}, true)">
              <div style="display:flex;align-items:center;gap:4px;flex:1;overflow:hidden;">
                <span class="node-bullet">✏️</span>
                <span class="node-label poly-name" title="${poly.name}">${poly.name}</span>
              </div>
              <div class="node-meta">
                <span class="badge-stats" style="cursor:pointer;" title="Clic para seleccionar todas las placas de este faldón" onclick="event.stopPropagation();ProjectHierarchy.selectAllPanelsInPolyline(${poly.index});">${poly.panelsCount} pl · ${poly.kwp.toFixed(1)} kWp</span>
                <button type="button" class="node-action-btn" title="Alternar visibilidad" onclick="event.stopPropagation();ProjectHierarchy.toggleVisibility('polyline', ${poly.index});">${poly.visible ? '👁️' : '🙈'}</button>
                <button type="button" class="node-action-btn delete-btn" title="Eliminar faldón" onclick="event.stopPropagation();ProjectHierarchy.deleteItem('polyline', ${poly.index});">🗑️</button>
              </div>
            </div>
          `;
        });
      }

      // ── 4. OBSTÁCULOS EN TERRENO / GLOBALES ──
      if (tree.obstacles.length > 0) {
        html += `<div class="outliner-group-title">🧱 OBSTÁCULOS EN TERRENO (${tree.obstacles.length})</div>`;
        tree.obstacles.forEach(function(obs) {
          const obsSel = obs.isSelected ? 'selected-obs' : '';
          html += `
            <div class="outliner-obs-item ${obsSel}" onclick="ProjectHierarchy.selectObstacle('${obs.id}', true)">
              <div style="display:flex;align-items:center;gap:4px;flex:1;overflow:hidden;">
                <span class="node-icon">📦</span>
                <span class="node-label obs-name" title="${obs.name}">${obs.name}</span>
              </div>
              <div class="node-meta">
                <span class="badge-dim">${obs.w}×${obs.l}×${obs.h}m</span>
                <button type="button" class="node-action-btn" title="Alternar visibilidad" onclick="event.stopPropagation();ProjectHierarchy.toggleVisibility('obstacle', '${obs.id}');">${obs.visible ? '👁️' : '🙈'}</button>
                <button type="button" class="node-action-btn delete-btn" title="Eliminar obstáculo" onclick="event.stopPropagation();ProjectHierarchy.deleteItem('obstacle', '${obs.id}');">🗑️</button>
              </div>
            </div>
          `;
        });
      }

      // ── 5. EQUIPOS ELÉCTRICOS & CUADROS (PASO 4) ──
      if (tree.electrical && tree.electrical.length > 0) {
        html += `<div class="outliner-group-title">⚡ CUADROS & EQUIPOS ELÉCTRICOS (${tree.electrical.length})</div>`;
        tree.electrical.forEach(function(eq) {
          const eqSel = eq.isSelected ? 'selected-obs active-node' : '';
          if (eq.isCableMetric) {
            html += `
              <div class="outliner-obs-item" style="background:rgba(56,189,248,0.08);border-left:2px solid #38BDF8;cursor:default;">
                <div style="display:flex;align-items:center;gap:4px;flex:1;overflow:hidden;">
                  <span class="node-icon">${eq.icon}</span>
                  <span class="node-label obs-name" style="color:#BAE6FD;font-weight:700;" title="${eq.name}">${eq.name}</span>
                </div>
              </div>
            `;
          } else {
            html += `
              <div class="outliner-obs-item ${eqSel}" onclick="ProjectHierarchy.selectElectrical('${eq.id}', true)">
                <div style="display:flex;align-items:center;gap:4px;flex:1;overflow:hidden;">
                  <span class="node-icon">${eq.icon}</span>
                  <span class="node-label obs-name" title="${eq.name}">${eq.name}</span>
                </div>
                <div class="node-meta">
                  <button type="button" class="node-action-btn" title="Alternar visibilidad" onclick="event.stopPropagation();ProjectHierarchy.toggleVisibility('electrical', '${eq.id}');">${eq.visible ? '👁️' : '🙈'}</button>
                  <button type="button" class="node-action-btn delete-btn" title="Eliminar equipo" onclick="event.stopPropagation();ProjectHierarchy.deleteItem('electrical', '${eq.id}');">🗑️</button>
                </div>
              </div>
            `;
          }
        });
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
          top: 250px;
          right: 20px;
          width: 300px;
          max-height: calc(100vh - 280px);
          background: rgba(15, 23, 42, 0.92);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          border: 1px solid rgba(56, 189, 248, 0.35);
          border-radius: 12px;
          box-shadow: 0 10px 32px rgba(0, 0, 0, 0.70), 0 0 14px rgba(56, 189, 248, 0.15);
          display: flex;
          flex-direction: column;
          z-index: 9400;
          font-family: 'Inter', -apple-system, sans-serif;
          color: #f8fafc;
          overflow: hidden;
          transition: all 0.25s ease;
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
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.6px;
          color: #38bdf8;
        }

        .outliner-badge {
          font-size: 10px;
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
          font-size: 10px;
          cursor: pointer;
          padding: 2px 4px;
        }

        .outliner-body {
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding: 8px;
          overflow-y: auto;
          max-height: calc(100vh - 340px);
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
          font-size: 10px;
          color: #94a3b8;
        }

        .outliner-group-title {
          font-size: 10px;
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
          font-size: 10px;
          color: #94a3b8;
          font-style: italic;
          padding: 3px 6px;
        }

        .outliner-sub-label {
          font-size: 10px;
          font-weight: 700;
          color: #cbd5e1;
          margin-top: 4px;
          padding-left: 4px;
        }

        .node-label {
          font-size: 10px;
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
          font-size: 10px;
        }

        .poly-name {
          color: #e2e8f0;
          font-size: 10px;
        }

        .obs-name {
          color: #fbbf24;
          font-size: 10px;
        }

        .node-meta {
          display: flex;
          align-items: center;
          gap: 3px;
        }

        .badge-angle {
          font-size: 10px;
          color: #f59e0b;
          background: rgba(245, 158, 11, 0.12);
          padding: 1px 4px;
          border-radius: 3px;
        }

        .badge-stats {
          font-size: 10px;
          color: #10b981;
          background: rgba(16, 185, 129, 0.12);
          padding: 1px 4px;
          border-radius: 3px;
          font-weight: 700;
        }

        .badge-dim {
          font-size: 10px;
          color: #94a3b8;
          background: rgba(255, 255, 255, 0.05);
          padding: 1px 4px;
          border-radius: 3px;
        }

        .node-action-btn {
          background: transparent;
          border: none;
          font-size: 10px;
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
          font-size: 10px;
          color: #64748b;
          font-style: italic;
          padding: 2px 4px;
        }

        .outliner-poly-item, .outliner-obs-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 3px 6px;
          border-radius: 4px;
          background: rgba(255, 255, 255, 0.02);
          cursor: pointer;
          border: 1px solid transparent;
        }

        .outliner-poly-item:hover, .outliner-obs-item:hover {
          background: rgba(255, 255, 255, 0.06);
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
