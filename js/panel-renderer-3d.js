// ============================================================================
// js/panel-renderer-3d.js — Controlador de Renderizado Rápido 3D (Fase B3)
// ============================================================================
function wpFastRenderSimulatedPanels(immediate = false, targetPolyIdx = null) {
  if (window._wpFastRenderDebounceTimer) {
    clearTimeout(window._wpFastRenderDebounceTimer);
    window._wpFastRenderDebounceTimer = null;
  }
  if (immediate !== true) {
    // Devuelve promesa: resuelve cuando el layout completo (faldones + cables) está renderizado
    return new Promise(resolve => {
      window._wpFastRenderDebounceTimer = setTimeout(() => {
        window._wpFastRenderDebounceTimer = null;
        resolve(wpFastRenderSimulatedPanels(true, targetPolyIdx));
      }, 250);
    });
  }
  return wpFastRenderSimulatedPanelsAsync(true, targetPolyIdx);
}
if (typeof window !== 'undefined') window.wpFastRenderSimulatedPanels = wpFastRenderSimulatedPanels;
