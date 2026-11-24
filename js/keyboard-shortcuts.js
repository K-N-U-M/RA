/**
 * RA — Gestor Global de Atajos de Teclado CAD (Extraído de app-main.js · F4-07)
 */
(function(window) {
  "use strict";

// ── ATAJOS DE TECLADO CAD PROFESIONALES ──────────────────────────────────────
// ── HELPER UNIVERSAL: COMPROBACIÓN DE CAMPOS DE TEXTO ACTIVOS ──
function isTextInputActive(target) {
  const el = target || (typeof document !== 'undefined' ? document.activeElement : null);
  if (!el) return false;
  const tag = el.tagName ? el.tagName.toUpperCase() : '';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable) {
    return true;
  }
  if (typeof el.closest === 'function' && el.closest('[contenteditable="true"]')) {
    return true;
  }
  return false;
}

addEventListener('keydown', function(e) {
  // No capturar teclas si el usuario está escribiendo en un campo de texto activo
  if (isTextInputActive(e.target)) return;

  // Atajo de cierre inmediato para dibujo de canalizaciones 3D (Bandeja DC / Tubo AC)
  if (window.cableRoutingState && window.cableRoutingState.active) {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      wpFinishCableRouting();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      wpCancelCableRouting();
      return;
    }
    if (e.key === 'Backspace' || ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z'))) {
      e.preventDefault();
      e.stopPropagation();
      wpUndoLastCableRoutePoint();
      return;
    }
  }

  // Atajo de cierre inmediato para dibujo de edificios 3D
  if (typeof WP !== 'undefined' && WP.mode === 'draw-building-rect') {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (typeof finishBuildingRect === 'function') finishBuildingRect();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (typeof cancelBuildingRect === 'function') cancelBuildingRect();
      return;
    }
  }
  if (typeof WP !== 'undefined' && WP.mode === 'draw-building') {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (activeBuildingPts.length >= 3) {
        finishActiveBuilding();
      } else {
        showToast('AVISO', 'Marca al menos 3 esquinas en el terreno para extruir el edificio.', 'info', 2500);
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cancelActiveBuilding();
      return;
    }
  }

  // 1. Tecla ESCAPE (Cancelar colocación / deseleccionar sin disparar cascadas en otros listeners)
  if (e.key === 'Escape' || e.keyCode === 27) {
    if (window.RAWindUI && typeof window.RAWindUI.isPlacementActive === 'function' && window.RAWindUI.isPlacementActive()) {
      e.stopPropagation();
      window.RAWindUI.cancelPlacement();
      return;
    }
    if (typeof obsPlacement !== 'undefined' && obsPlacement && obsPlacement.active) {
      e.stopPropagation();
      cancelObstaclePlacement();
      showToast('COLOCACIÓN', 'Colocación de obstáculo cancelada.', 'info', 2000);
      return;
    }
    if (typeof WP !== 'undefined' && WP) {
      if (WP.mode === 'stamp-poly') {
        e.stopPropagation();
        if (typeof wpCancelStampPolyline === 'function') wpCancelStampPolyline();
        if (typeof WP !== 'undefined' && WP && WP.movePolyGizmoIdx >= 0) {
          WP.movePolyGizmoIdx = -1;
          if (typeof renderUniversalGizmo2D === 'function') renderUniversalGizmo2D();
        }
        return;
      }
      if (WP.mode === 'draw-poly') {
        e.stopPropagation();
        wpCancelDrawPoly();
        showToast('EDICIÓN', 'Modo de dibujo cancelado.', 'info', 2000);
        return;
      }
      if (WP.selectedVtxIdx >= 0 || WP.selectedVertexIdx >= 0) {
        e.stopPropagation();
        WP.selectedVtxIdx = -1;
        WP.selectedVertexIdx = -1;
        if (typeof window.selectedVertexIndex !== "undefined") window.selectedVertexIndex = -1;
        if (typeof renderTriad2D === 'function') renderTriad2D();
        if (typeof wpSyncVertexInputs === 'function') wpSyncVertexInputs();
        if (typeof wpRenderAllPolylines === 'function') wpRenderAllPolylines();
        showToast('SELECCIÓN', 'Vértice deseleccionado.', 'info', 1500);
        return;
      }
    }
    if (typeof selectedPanelIndex !== 'undefined' && (selectedPanelIndex >= 0 || (Array.isArray(window.selectedPanelIndices) && window.selectedPanelIndices.length > 0))) {
      e.stopPropagation();
      selectPanel(-1);
      showToast('SELECCIÓN', 'Módulos FV deseleccionados.', 'info', 1500);
      return;
    }
    if (typeof selectedElectricalId !== 'undefined' && selectedElectricalId) {
      e.stopPropagation();
      if (typeof selectElectricalObject === 'function') selectElectricalObject(null);
      showToast('SELECCIÓN', 'Equipo eléctrico deseleccionado.', 'info', 1500);
      return;
    }
    if (typeof selectedObstacleId !== 'undefined' && selectedObstacleId) {
      e.stopPropagation();
      window.selectedObstacleId = null;
      if (typeof render3DObstaclesInCesium === 'function') render3DObstaclesInCesium();
      if (typeof render3DBuildingsInCesium === 'function') render3DBuildingsInCesium();
      showToast('SELECCIÓN', 'Obstáculo deseleccionado.', 'info', 1500);
      return;
    }
  }

  // [P0] SUPR/DELETE consolidado en _raKeydown2 (despachador único): antes, tres
  // listeners solapados procesaban la misma pulsación y borraban 2 objetos de golpe.

  // 2.5. CTRL + D (Duplicar faldón / polilínea en modo estampar interactivo)
  if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D' || e.code === 'KeyD')) {
    if (typeof WP !== 'undefined' && WP && typeof WP.selectedPolyIdx === 'number' && WP.selectedPolyIdx >= 0) {
      e.preventDefault();
      if (typeof wpStartStampPolyline === 'function') wpStartStampPolyline(WP.selectedPolyIdx);
      return;
    }
  }

  // 2.6. M (Mover faldón / polilínea seleccionada con su contenido sobre el mismo plano)
  if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'm' || e.key === 'M' || e.code === 'KeyM')) {
    const activeTag = (document.activeElement && document.activeElement.tagName) ? document.activeElement.tagName.toUpperCase() : '';
    if (activeTag !== 'INPUT' && activeTag !== 'TEXTAREA' && activeTag !== 'SELECT') {
      if (typeof WP !== 'undefined' && WP && typeof WP.selectedPolyIdx === 'number' && WP.selectedPolyIdx >= 0) {
        e.preventDefault();
        if (typeof wpStartMovePolyline === 'function') wpStartMovePolyline(WP.selectedPolyIdx);
        return;
      }
    }
  }

  // 3. CTRL + Z / CTRL + Y / CTRL + SHIFT + Z (Sistema Universal de Deshacer / Rehacer)
  if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z' || e.key === 'y' || e.key === 'Y' || e.code === 'KeyZ' || e.code === 'KeyY')) {
    const isRedo = (e.key === 'y' || e.key === 'Y' || e.code === 'KeyY' || e.shiftKey);

    // Prioridad A: Modos de dibujo interactivo activos (sólo para deshacer)
    if (!isRedo && typeof WP !== 'undefined' && WP) {
      if (WP.mode === 'draw-poly' && typeof wpUndoLastPolylinePoint === 'function' && wpUndoLastPolylinePoint()) {
        e.preventDefault();
        return;
      }
      if (WP.mode === 'draw-building' && typeof undoLastBuildingPoint === 'function' && typeof activeBuildingPts !== 'undefined' && activeBuildingPts.length > 0) {
        e.preventDefault();
        undoLastBuildingPoint();
        return;
      }
      if (WP.mode === 'define-plane' && typeof wpUndoLastPlanePoint === 'function' && wpUndoLastPlanePoint()) {
        e.preventDefault();
        return;
      }
    }

    // Prioridad B: Deshacer / Rehacer universal del proyecto (RAundo)
    if (window.RAundo) {
      if (isRedo) {
        if (window.RAundo.canRedo()) {
          e.preventDefault();
          window.RAundo.redo();
          return;
        }
      } else {
        if (window.RAundo.canUndo()) {
          e.preventDefault();
          window.RAundo.undo();
          return;
        }
      }
    }
  }
});
window.isTextInputActive = isTextInputActive;

})(typeof window !== "undefined" ? window : globalThis);
