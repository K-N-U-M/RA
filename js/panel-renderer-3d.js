// ============================================================================
// js/panel-renderer-3d.js — Controlador de Renderizado Rápido 3D (Fase B3 + Mutex Promise)
// ============================================================================
const _wpRenderWaiters = [];
let _wpRenderSerialChain = Promise.resolve();

function wpFastRenderSimulatedPanels(immediate = false, targetPolyIdx = null) {
  if (window._wpFastRenderDebounceTimer) {
    clearTimeout(window._wpFastRenderDebounceTimer);
    window._wpFastRenderDebounceTimer = null;
  }

  if (immediate !== true) {
    return new Promise(resolve => {
      _wpRenderWaiters.push(resolve);
      window._wpFastRenderDebounceTimer = setTimeout(() => {
        window._wpFastRenderDebounceTimer = null;
        const batchWaiters = _wpRenderWaiters.splice(0, _wpRenderWaiters.length);
        Promise.resolve(wpFastRenderSimulatedPanels(true, targetPolyIdx))
          .then(res => batchWaiters.forEach(r => r(res)))
          .catch(() => batchWaiters.forEach(r => r(undefined)));
      }, 250);
    });
  }

  // Cancelar cualquier debouncer pendiente y coalescer sus promesas hacia esta ejecución inmediata
  const pendingWaiters = _wpRenderWaiters.splice(0, _wpRenderWaiters.length);
  const nextRun = _wpRenderSerialChain
    .catch(() => {})
    .then(() => wpFastRenderSimulatedPanelsAsync(true, targetPolyIdx));
  _wpRenderSerialChain = nextRun.catch(() => {});

  if (pendingWaiters.length > 0) {
    nextRun
      .then(res => pendingWaiters.forEach(r => r(res)))
      .catch(() => pendingWaiters.forEach(r => r(undefined)));
  }
  return nextRun;
}
if (typeof window !== 'undefined') window.wpFastRenderSimulatedPanels = wpFastRenderSimulatedPanels;
