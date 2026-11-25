// ===============================================================================
// MODULO CAD: EDICIÓN INTERACTIVA DE HUELLA Y GESTIÓN DE EDIFICIOS 3D (CAD-GRADE)
// Extraído para arquitectura modular desacoplada según norma ISO/IEC 25010
// ===============================================================================

const bldFootprintState = {
  editing: false,
  selectedVtxIdx: -1,
  hoveredVtxIdx: -1,
  isDragging: false,
  dragStartPos: null,
  activeBuildingId: null
};
window.bldFootprintState = bldFootprintState;
window.selectBuildingVertex = selectBuildingVertex;
window.toggleBuildingFootprintEditing = toggleBuildingFootprintEditing;

window._redrawingBuildingId = null;

function toggleBuildingFootprintEditing(forceState) {
  if (!selectedBuildingId) {
    showToast('AVISO', 'Selecciona primero un edificio para editar su huella.', 'info', 2000);
    return;
  }
  const bld = buildings.find(b => b.id === selectedBuildingId);
  if (!bld) return;

  bldFootprintState.editing = (typeof forceState === 'boolean') ? forceState : !bldFootprintState.editing;
  bldFootprintState.activeBuildingId = selectedBuildingId;
  if (!bldFootprintState.editing) {
    bldFootprintState.selectedVtxIdx = -1;
  } else if (bldFootprintState.selectedVtxIdx < 0 && bld.points && bld.points.length > 0) {
    bldFootprintState.selectedVtxIdx = 0;
  }

  const btn = document.getElementById('bld-edit-footprint-btn');
  const subpanel = document.getElementById('bld-vtx-edit-subpanel');
  if (btn) {
    btn.style.background = bldFootprintState.editing ? 'rgba(16, 185, 129, 0.35)' : 'rgba(2, 132, 199, 0.25)';
    btn.style.borderColor = bldFootprintState.editing ? 'var(--emerald-400)' : 'var(--sky-400)';
    btn.style.color = bldFootprintState.editing ? '#34d399' : '#38bdf8';
    btn.innerHTML = bldFootprintState.editing ? '<span><i data-lucide=\"check\" class=\"icon-sm\"></i> Editando Huella</span>' : '<span><i data-lucide=\"edit-2\" class=\"icon-sm\"></i> Editar Vértices</span>';
  }
  if (subpanel) {
    subpanel.style.display = bldFootprintState.editing ? 'flex' : 'none';
  }

  updateBuildingFootprintUI();
  render3DBuildingsInCesium();
  if (typeof renderTriad2D === 'function') renderTriad2D();

  if (bldFootprintState.editing) {
    showToast('MODO EDICIÓN DE HUELLA ACTIVADO', 'Haz clic y arrastra cualquier vértice o usa la Tríada 3D para modificar el contorno.', 'info', 3000);
  }
}

function selectBuildingVertex(vtxIdx) {
  if (!selectedBuildingId) return;
  const bld = buildings.find(b => b.id === selectedBuildingId);
  if (!bld || !bld.points || vtxIdx < 0 || vtxIdx >= bld.points.length) {
    bldFootprintState.selectedVtxIdx = -1;
  } else {
    bldFootprintState.selectedVtxIdx = vtxIdx;
    bldFootprintState.editing = true;
    if (typeof selectedObstacleId !== 'undefined') selectedObstacleId = null;
    if (typeof selectedPanelIndex !== 'undefined') selectedPanelIndex = -1;
    if (typeof selectedElectricalId !== 'undefined') selectedElectricalId = null;
    const btn = document.getElementById('bld-edit-footprint-btn');
    const subpanel = document.getElementById('bld-vtx-edit-subpanel');
    if (btn) {
      btn.style.background = 'rgba(16, 185, 129, 0.35)';
      btn.style.borderColor = 'var(--emerald-400)';
      btn.style.color = '#34d399';
      btn.innerHTML = '<span><i data-lucide=\"check\" class=\"icon-sm\"></i> Editando Huella</span>';
    }
    if (subpanel) subpanel.style.display = 'flex';
  }
  updateBuildingFootprintUI();
  render3DBuildingsInCesium();
  if (typeof renderTriad2D === 'function') renderTriad2D();
  try { 
    if (typeof renderUniversalGizmo2D === 'function') renderUniversalGizmo2D();
  } catch(_e) {
    if (typeof window.RA !== 'undefined' && window.RA.log) window.RA.log.warn('Error in hideGizmo/renderUniversalGizmo2D', _e);
  }
}

function updateBuildingFootprintUI() {
  if (!selectedBuildingId) return;
  const bld = buildings.find(b => b.id === selectedBuildingId);
  if (!bld || !bld.points) return;

  const countBadge = document.getElementById('bld-vtx-count-badge');
  const vtxLabel = document.getElementById('bld-active-vtx-label');
  if (countBadge) {
    countBadge.textContent = bld.points.length + ' VÉRTICES';
  }
  if (vtxLabel) {
    vtxLabel.textContent = (bldFootprintState.selectedVtxIdx >= 0)
      ? ('Vértice #' + (bldFootprintState.selectedVtxIdx + 1) + ' / ' + bld.points.length)
      : 'Ningún vértice seleccionado';
  }
}

function deleteSelectedBuildingVertex() {
  if (!selectedBuildingId) return;
  const bld = buildings.find(b => b.id === selectedBuildingId);
  if (!bld || !bld.points) return;

  if (bld.points.length <= 3) {
    showToast('AVISO', 'Un edificio debe tener al menos 3 vértices en su huella.', 'warning', 2500);
    return;
  }

  const vIdx = bldFootprintState.selectedVtxIdx;
  if (vIdx < 0 || vIdx >= bld.points.length) {
    showToast('AVISO', 'Selecciona primero el vértice que deseas eliminar.', 'info', 2000);
    return;
  }

  if (window.RAundo && typeof window.RAundo.snapBuildings === 'function') {
    window.RAundo.snapBuildings('Eliminar vértice de ' + (bld.name || 'Edificio'));
  }

  bld.points.splice(vIdx, 1);
  bldFootprintState.selectedVtxIdx = Math.min(vIdx, bld.points.length - 1);
  updateBuildingFootprintUI();
  render3DBuildingsInCesium();
  if (typeof renderTriad2D === 'function') renderTriad2D();
  showToast('VÉRTICE ELIMINADO', 'Quedan ' + bld.points.length + ' vértices en la huella.', 'info', 2000);
}

function redrawSelectedBuildingFootprint() {
  if (!selectedBuildingId) return;
  const bld = buildings.find(b => b.id === selectedBuildingId);
  if (!bld) return;

  window._redrawingBuildingId = bld.id;
  bldFootprintState.editing = false;
  bldFootprintState.selectedVtxIdx = -1;
  if (typeof invalidateRoofPanelsCache === 'function') invalidateRoofPanelsCache();

  // Iniciar trazado nuevo manteniendo metadatos
  startDrawingBuilding();
  showToast('REDIBUJAR HUELLA', 'Haz clic en el visor para marcar las nuevas esquinas de ' + bld.name + '. Se conservará su altura y configuración de tejado.', 'info', 4000);
}

window._raIsShiftDown = false;
window._raOrthoMode = false;
window.addEventListener('keydown', function(e) { 
  if (e.key === 'Shift') window._raIsShiftDown = true; 
  if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.code === 'KeyO' || e.key === 'o' || e.key === 'O')) {
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT' || activeEl.isContentEditable || (activeEl.closest && activeEl.closest('[contenteditable="true"]')))) return;
    window._raOrthoMode = !window._raOrthoMode;
    showToast('MODO ORTOGONAL', window._raOrthoMode ? 'ACTIVADO (Teclado: O)' : 'DESACTIVADO', 'info', 2000);
  }
});
window.addEventListener('keyup', function(e) { if (e.key === 'Shift') window._raIsShiftDown = false; });
window.addEventListener('blur', function() { window._raIsShiftDown = false; });
document.addEventListener('visibilitychange', function() { if (document.hidden) window._raIsShiftDown = false; });

function getOrthogonalSnap(cartesian, pts) {
  if (!cartesian || !pts || pts.length < 2) return cartesian;
  if (!window._raIsShiftDown && !window._raOrthoMode) return cartesian;
  const pPrev = pts[pts.length - 1];
  const pPrev2 = pts[pts.length - 2];
  
  const enu = Cesium.Transforms.eastNorthUpToFixedFrame(pPrev);
  const inv = Cesium.Matrix4.inverse(enu, new Cesium.Matrix4());
  
  const vPrev2 = Cesium.Matrix4.multiplyByPoint(inv, pPrev2, new Cesium.Cartesian3());
  const vCurr = Cesium.Matrix4.multiplyByPoint(inv, cartesian, new Cesium.Cartesian3());
  
  const anglePrev = Math.atan2(vPrev2.y, vPrev2.x);
  const angleCurr = Math.atan2(vCurr.y, vCurr.x);
  
  let diff = angleCurr - anglePrev;
  const snapDiff = Math.round(diff / (Math.PI / 2)) * (Math.PI / 2);
  const newAngle = anglePrev + snapDiff;
  
  const dist = Math.hypot(vCurr.x, vCurr.y);
  const snappedLocal = new Cesium.Cartesian3(Math.cos(newAngle) * dist, Math.sin(newAngle) * dist, (typeof vCurr.z === 'number') ? vCurr.z : 0);
  
  return Cesium.Matrix4.multiplyByPoint(enu, snappedLocal, new Cesium.Cartesian3());
}

function startDrawingBuilding() {
  if (typeof closeActiveDrawMenu === 'function') closeActiveDrawMenu();
  if (typeof setAppMode === 'function') setAppMode('draw');
  
  WP.mode = 'draw-building';
  activeBuildingPts = [];
  window._bldCursorPos = null;
  if (typeof scene !== 'undefined' && scene && scene.screenSpaceCameraController) {
    scene.screenSpaceCameraController.enableLook = false; // Fix: Shift+Move orbitaba la cámara
  }

  // Limpiar entidades temporales previas
  if (window._tempBuildingEntities) {
    window._tempBuildingEntities.forEach(e => { try { viewer.entities.remove(e); } catch(err) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(err, 'Entidad/Primitiva Cesium'); } });
    window._tempBuildingEntities = [];
  }
  if (window._tempBuildingLineEntity) {
    try { viewer.entities.remove(window._tempBuildingLineEntity); } catch(err) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(err, 'Entidad/Primitiva Cesium'); }
    window._tempBuildingLineEntity = null;
  }
  
  const confBar = document.getElementById('ra-confirm-bar');
  if (confBar) {
    confBar.style.display = 'flex';
    setElemText('confirm-bar-text', '<i data-lucide=\"building\" class=\"icon-sm\"></i> DIBUJANDO EDIFICIO 3D: Haz clics en el terreno para marcar las esquinas. [Doble Clic o ENTER] para extruir.');
  }

  const cancelBldBtn = document.getElementById('btn-cancel-building-panel');
  if (cancelBldBtn) cancelBldBtn.style.display = 'inline-flex';

  if (typeof wpUpdateCanvasHUD === 'function') wpUpdateCanvasHUD();
  showStatus('<i data-lucide=\"building\" class=\"icon-sm\"></i> MODO EDIFICIO 3D ACTIVO: Haz clic en el terreno para marcar esquinas', 3000);
}

function handleBuildingClick(cartesian) {
  if (!cartesian || !viewer) return;
  var osnapApplied = false;
  if (typeof window !== 'undefined' && window.RACadOsnap && typeof window.RACadOsnap.resolveSnapWorld === 'function' && activeBuildingPts.length > 0) {
    var snapRes = window.RACadOsnap.resolveSnapWorld(cartesian, activeBuildingPts[activeBuildingPts.length - 1]);
    if (snapRes && snapRes.snapped && snapRes.worldPos) {
      cartesian = snapRes.worldPos;
      osnapApplied = true;
    }
  }
  if (!osnapApplied) cartesian = getOrthogonalSnap(cartesian, activeBuildingPts);
  if (activeBuildingPts.length > 0) {
    const lastBldPt = activeBuildingPts[activeBuildingPts.length - 1];
    if (Cesium.Cartesian3.distance(cartesian, lastBldPt) < 0.35) return;
  }
  activeBuildingPts.push(cartesian);
  window._lastBldVtxTime = performance.now();
  
  // Renderizar punto temporal reutilizando el método canónico de polilíneas
  const ptEnt = (typeof addPointEntity === 'function')
    ? addPointEntity(cartesian, '#38BDF8', 9, '#FFFFFF', 2, 'temp_bld_pt_' + activeBuildingPts.length + '_' + Date.now())
    : viewer.entities.add({
        position: cartesian,
        point: {
          pixelSize: 9,
          color: Cesium.Color.fromCssColorString('#38BDF8'),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
      });
  if (!window._tempBuildingEntities) window._tempBuildingEntities = [];
  window._tempBuildingEntities.push(ptEnt);

  // Renderizar o actualizar polilínea de trazado con línea elástica (ConstantProperty sin CallbackProperty idle)
  const _computeBldPreviewPts = () => {
    if (!activeBuildingPts || activeBuildingPts.length === 0) return [];
    const pts = [...activeBuildingPts];
    if (window._bldCursorPos) pts.push(window._bldCursorPos);
    if (pts.length >= 3) pts.push(pts[0]);
    if (pts.length === 1) pts.push(Cesium.Cartesian3.clone(pts[0]));
    return pts;
  };
  window.syncBuildingPreviewLine = () => {
    if (!window._tempBuildingLineEntity || !window._tempBuildingLineEntity.polyline) return;
    window._tempBuildingLineEntity.polyline.positions = new Cesium.ConstantProperty(_computeBldPreviewPts());
  };
  if (activeBuildingPts.length >= 1) {
    if (window._tempBuildingLineEntity) {
      try { viewer.entities.remove(window._tempBuildingLineEntity); } catch(e) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(e, 'Entidad/Primitiva Cesium'); }
    }
    const staticPositions = new Cesium.ConstantProperty(_computeBldPreviewPts());

    window._tempBuildingLineEntity = (typeof addPolylineEntity === 'function')
      ? addPolylineEntity(staticPositions, '#38BDF8', 3.5, 0.85, 1.0, 'temp_bld_line_preview')
      : viewer.entities.add({
          polyline: {
            positions: staticPositions,
            width: 3.5,
            material: new Cesium.ColorMaterialProperty(Cesium.Color.fromCssColorString('#38BDF8')),
            // depthFailMaterial removed,
            clampToGround: false,
            arcType: (typeof Cesium !== "undefined" && Cesium.ArcType) ? Cesium.ArcType.NONE : undefined
          }
        });
  }

  if (typeof wpUpdateCanvasHUD === 'function') wpUpdateCanvasHUD();
  showStatus('VÉRTICE EDIFICIO #' + activeBuildingPts.length + ' REGISTRADO (' + activeBuildingPts.length + ' pts)', 1500);

  // [SYNC] Solicitar render inmediato para reflejar el nuevo vértice sin mover la cámara
  if (viewer && viewer.scene && typeof viewer.scene.requestRender === 'function') {
    viewer.scene.requestRender();
  }
}

function undoLastBuildingPoint() {
  if (activeBuildingPts && activeBuildingPts.length > 0) {
    activeBuildingPts.pop();
    if (window._tempBuildingEntities && window._tempBuildingEntities.length > 0) {
      const ent = window._tempBuildingEntities.pop();
      try { viewer.entities.remove(ent); } catch(e) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(e, 'Entidad/Primitiva Cesium'); }
    }
    if (activeBuildingPts.length < 1 && window._tempBuildingLineEntity) {
      try { viewer.entities.remove(window._tempBuildingLineEntity); } catch(e) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(e, 'Entidad/Primitiva Cesium'); }
      window._tempBuildingLineEntity = null;
    }
    showStatus('ÚLTIMO VÉRTICE DESHECHO (' + activeBuildingPts.length + ' pts)', 1200);
    if (typeof wpUpdateCanvasHUD === 'function') wpUpdateCanvasHUD();

    // [SYNC] Solicitar render inmediato
    if (viewer && viewer.scene && typeof viewer.scene.requestRender === 'function') {
      viewer.scene.requestRender();
    }
  }
}

function finishActiveBuilding() {
  if (typeof scene !== 'undefined' && scene && scene.screenSpaceCameraController) {
    scene.screenSpaceCameraController.enableLook = true;
  }
  if (activeBuildingPts.length < 3) {
    showToast('AVISO', 'Dibuja al menos 3 puntos para cerrar el edificio 3D', 'warning', 2500);
    return;
  }
  // [P2] Validación de auto-intersección (figura-8) de la huella
  if (activeBuildingPts.length >= 4 && typeof window.isSimplePolygon === 'function' && !window.isSimplePolygon(activeBuildingPts)) {
    showToast('HUELLA INVÁLIDA', 'La huella se auto-interseca (figura-8). Corrige los puntos antes de extruir el edificio.', 'warning', 4500);
    return;
  }

  // Normalizar sentido CCW solo al cerrar/confirmar la huella (nunca mutar durante renderizado)
  if (typeof Cesium !== 'undefined' && Cesium.Cartographic) {
    const closeCartos = activeBuildingPts.map(p => Cesium.Cartographic.fromCartesian(p));
    if (closeCartos.every(Boolean) && closeCartos.length >= 3) {
      let signedArea = 0;
      for (let i = 0; i < closeCartos.length; i++) {
        const j = (i + 1) % closeCartos.length;
        signedArea += (closeCartos[i].longitude * closeCartos[j].latitude - closeCartos[j].longitude * closeCartos[i].latitude);
      }
      if (signedArea < 0) activeBuildingPts.reverse();
    }
  }

  // Comprobar si estamos redibujando un edificio existente
  if (window._redrawingBuildingId) {
    const existingBld = buildings.find(b => b.id === window._redrawingBuildingId);
    if (existingBld) {
      if (window.RAundo && typeof window.RAundo.snapBuildings === 'function') {
        window.RAundo.snapBuildings('Redibujar huella de ' + (existingBld.name || 'Edificio'));
      }
      existingBld.points = [...activeBuildingPts];
      window._redrawingBuildingId = null;
      activeBuildingPts = [];
      if (window._tempBuildingEntities) {
        window._tempBuildingEntities.forEach(e => { try { viewer.entities.remove(e); } catch(err) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(err, 'Entidad/Primitiva Cesium'); } });
        window._tempBuildingEntities = [];
      }
      if (window._tempBuildingLineEntity) {
        try { viewer.entities.remove(window._tempBuildingLineEntity); } catch(err) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(err, 'Entidad/Primitiva Cesium'); }
        window._tempBuildingLineEntity = null;
      }
      window._bldCursorPos = null;
      if (typeof WP !== 'undefined' && WP) WP.mode = 'idle';
      if (typeof appMode !== 'undefined') appMode = 'navigate';
      selectBuilding(existingBld.id);
      render3DBuildingsInCesium();
      showToast('HUELLA ACTUALIZADA', 'La huella de ' + existingBld.name + ' ha sido actualizada conservando todas sus propiedades.', 'success', 3000);
      return;
    }
  }

  const bldCount = buildings.length + 1;
  const bldName = 'Edificio ' + bldCount;
  const bldId = 'bld_' + Date.now();

  const newBld = {
    id: bldId,
    name: bldName,
    height: 6.0,
    numFloors: 2,
    roofType: 'flat',
    roofPitch: 25,
    roofAzimuth: 180,
    axisMode: 'wall',
    parapetHeight: 0.6,
    parapetWidth: 0.25,
    overhang: 0.2,
    facadeColor: '#F1F5F9',
    roofColor: '#E2E8F0',
    edgeColor: '#334155',
    points: [...activeBuildingPts]
  };
  if (typeof computeBuildingConstructionAxes === 'function') {
    const _axes = computeBuildingConstructionAxes(newBld);
    if (_axes && typeof _axes.normalAzimuthDeg === 'number') {
      newBld.roofAzimuth = Math.round(_axes.normalAzimuthDeg);
      newBld.refEdgeIdx = _axes.edgeIdx;
    }
  }

  if (window.RAundo && typeof window.RAundo.snapBuildings === 'function') {
    window.RAundo.snapBuildings('Crear ' + bldName);
  }
  buildings.push(newBld);
  activeBuildingPts = [];

  // Limpiar entidades temporales
  if (window._tempBuildingEntities) {
    window._tempBuildingEntities.forEach(e => {
      try { viewer.entities.remove(e); } catch(err) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(err, 'Entidad/Primitiva Cesium'); }
    });
    window._tempBuildingEntities = [];
  }
  if (window._tempBuildingLineEntity) {
    try { viewer.entities.remove(window._tempBuildingLineEntity); } catch(err) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(err, 'Entidad/Primitiva Cesium'); }
    window._tempBuildingLineEntity = null;
  }
  window._bldCursorPos = null;

  if (typeof WP !== 'undefined' && WP) {
    WP.mode = 'idle';
  }
  if (typeof appMode !== 'undefined') {
    appMode = 'navigate';
  }

  // >>> FIX: Limpieza de herramientas de polígono cruzadas (faldones fantasma) <<<
  if (typeof isDrawingMode !== 'undefined') isDrawingMode = false;
  if (typeof activeShapeEntity !== 'undefined' && activeShapeEntity) {
    try { viewer.entities.remove(activeShapeEntity); } catch(e){}
    activeShapeEntity = null;
  }
  if (typeof vertexEntities !== 'undefined' && Array.isArray(vertexEntities)) {
    vertexEntities.forEach(e => { try { viewer.entities.remove(e); } catch(e){} });
    vertexEntities = [];
  }
  if (typeof polygonPoints !== 'undefined') {
    polygonPoints = [];
  }

  const btnDraw = document.getElementById('btn-draw-building');
  if (btnDraw) {
    btnDraw.classList.remove('active');
    btnDraw.style.background = '';
    btnDraw.style.borderColor = '';
  }

  const confBar = document.getElementById('ra-confirm-bar');
  if (confBar) {
    confBar.style.display = 'none';
    confBar.classList.remove('open');
  }

  try {
    selectBuilding(bldId);
  } catch(e) {
    window.RA && window.RA.log && window.RA.log.warn('[finishActiveBuilding] selectBuilding falló; se fuerza render directo', e);
  }
  try {
    if (typeof render3DBuildingsInCesium === 'function') render3DBuildingsInCesium();
    if (viewer.scene && typeof viewer.scene.requestRender === 'function') viewer.scene.requestRender();
  } catch(e) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(e, 'Entidad/Primitiva Cesium'); }
  try {
    if (typeof wpUpdateUI === 'function') wpUpdateUI();
  } catch(e) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(e, 'Entidad/Primitiva Cesium'); }
  if (typeof ProjectHierarchy !== 'undefined' && ProjectHierarchy && typeof ProjectHierarchy.notify === 'function') {
    ProjectHierarchy.notify('building_added', { building: newBld });
  }
  const cancelBtnFinish = document.getElementById('btn-cancel-building-panel');
  if (cancelBtnFinish) cancelBtnFinish.style.display = 'none';
  showToast('EDIFICIO 3D CREADO', 'Se ha generado el volumen sólido de ' + bldName + ' (' + newBld.height + 'm de altura). Recuerda definir un Plano de Trabajo para dibujar polilíneas o colocar módulos.', 'success', 4000);
}

function cancelActiveBuilding() {
  activeBuildingPts = [];
  if (window._tempBuildingEntities) {
    window._tempBuildingEntities.forEach(e => { try { viewer.entities.remove(e); } catch(err) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(err, 'Entidad/Primitiva Cesium'); } });
    window._tempBuildingEntities = [];
  }
  if (window._tempBuildingLineEntity) {
    try { viewer.entities.remove(window._tempBuildingLineEntity); } catch(err) { if(window.RA_ErrorHandler) window.RA_ErrorHandler.handle(err, 'Entidad/Primitiva Cesium'); }
    window._tempBuildingLineEntity = null;
  }
  window._bldCursorPos = null;
  WP.mode = 'idle';

  // >>> FIX: Limpieza cruzada <<<
  if (typeof isDrawingMode !== 'undefined') isDrawingMode = false;
  if (typeof activeShapeEntity !== 'undefined' && activeShapeEntity) {
    try { viewer.entities.remove(activeShapeEntity); } catch(e){}
    activeShapeEntity = null;
  }
  if (typeof vertexEntities !== 'undefined' && Array.isArray(vertexEntities)) {
    vertexEntities.forEach(e => { try { viewer.entities.remove(e); } catch(e){} });
    vertexEntities = [];
  }
  if (typeof polygonPoints !== 'undefined') {
    polygonPoints = [];
  }

  const confBar = document.getElementById('ra-confirm-bar');
  if (confBar) {
    confBar.style.display = 'none';
    confBar.classList.remove('open');
  }
  const cancelBldBtn = document.getElementById('btn-cancel-building-panel');
  if (cancelBldBtn) cancelBldBtn.style.display = 'none';
  if (typeof wpUpdateCanvasHUD === 'function') wpUpdateCanvasHUD();
  showStatus('Creación de edificio cancelada', 1500);
}

function findBuildingUnderPosition(pos3D) {
  if (!pos3D || !Array.isArray(buildings) || buildings.length === 0) return null;
  const carto = Cesium.Cartographic.fromCartesian(pos3D);
  if (!carto) return null;
  const px = carto.longitude;
  const py = carto.latitude;

  for (let bi = 0; bi < buildings.length; bi++) {
    const bld = buildings[bi];
    if (!bld.points || bld.points.length < 3 || bld.visible === false) continue;
    const pts = bld.points.map(p => Cesium.Cartographic.fromCartesian(p));
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i].longitude, yi = pts[i].latitude;
      const xj = pts[j].longitude, yj = pts[j].latitude;
      const intersect = ((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    if (inside) return bld;
  }
  return null;
}

function selectBuilding(bldId) {
  if (bldId) {
    const targetBld = Array.isArray(buildings) ? buildings.find(b => b.id === bldId) : null;
    if (targetBld && targetBld.visible === false) {
      if (typeof showToast === 'function') showToast('EDIFICIO OCULTO', 'Haz visible el edificio para poder seleccionarlo.', 'warning', 2500);
      return;
    }
  }
  selectedBuildingId = bldId;
  if (typeof window !== 'undefined') window.selectedBuildingId = bldId;

  if (bldId) {
    if (typeof selectedObstacleId !== 'undefined') selectedObstacleId = null;
    if (typeof window !== 'undefined') window.selectedObstacleId = null;
    if (typeof selectedPanelIndex !== 'undefined') selectedPanelIndex = -1;
    if (typeof window !== 'undefined') window.selectedPanelIndex = -1;
    if (typeof selectedElectricalId !== 'undefined') selectedElectricalId = null;
    if (typeof window !== 'undefined') window.selectedElectricalId = null;
  }

  const bld = buildings.find(b => b.id === bldId);
  const ed = document.getElementById('bld-editor-box');
  const dropdown = document.getElementById('bld-selected-dropdown');
  const countBadge = document.getElementById('buildings-count-badge');

  if (countBadge) {
    countBadge.textContent = buildings.length + ' EDIFICIO' + (buildings.length === 1 ? '' : 'S');
  }

  // Actualizar dropdown
  if (dropdown) {
    dropdown.innerHTML = '<option value="">(Ninguno)</option>' + buildings.map(b => 
      '<option value="' + b.id + '"' + (b.id === bldId ? ' selected' : '') + '>' + b.name + ' (' + b.height + 'm)</option>'
    ).join('');
  }

  if (!bld) {
    if (ed) ed.style.display = 'none';
    render3DBuildingsInCesium();
    return;
  }

  if (ed) ed.style.display = 'flex';
  setElemText('bld-selected-title', (bld.name || 'EDIFICIO').toUpperCase());

  const nameEl     = document.getElementById('bld-name');
  const hEl        = document.getElementById('bld-height');
  const roofEl     = document.getElementById('bld-roof-type');
  const pitchEl    = document.getElementById('bld-roof-pitch');
  const pitchNum   = document.getElementById('bld-roof-pitch-num');
  const pitchVal   = document.getElementById('bld-roof-pitch-val');
  const pitchRow   = document.getElementById('bld-pitch-row');
  const azEl       = document.getElementById('bld-roof-azimuth');
  const azNum      = document.getElementById('bld-roof-azimuth-num');
  const azVal      = document.getElementById('bld-roof-azimuth-val');
  const azRow      = document.getElementById('bld-azimuth-row');
  const parEl      = document.getElementById('bld-parapet-height');
  const parRow     = document.getElementById('bld-parapet-row');
  const parWEl     = document.getElementById('bld-parapet-width');
  const parWRow    = document.getElementById('bld-parapet-width-row');
  const ovhEl      = document.getElementById('bld-overhang');
  const ovhRow     = document.getElementById('bld-overhang-row');
  const thkEl      = document.getElementById('bld-roof-thickness');
  const thkRow     = document.getElementById('bld-thickness-row');
  const skyEl      = document.getElementById('bld-skylight-count');
  const skyRow     = document.getElementById('bld-skylights-row');
  const colorEl    = document.getElementById('bld-facade-color');
  const roofColEl  = document.getElementById('bld-roof-color');
  const edgeColEl  = document.getElementById('bld-edge-color');

  const rType = bld.roofType || 'flat';
  const rPitch = (typeof bld.roofPitch === 'number') ? bld.roofPitch : 25;
  const rAz = (typeof bld.roofAzimuth === 'number') ? bld.roofAzimuth : 180;

  if (nameEl) nameEl.value = bld.name;
  if (hEl) hEl.value = bld.height;
  if (roofEl) roofEl.value = rType;
  if (pitchEl) pitchEl.value = rPitch;
  if (pitchNum) pitchNum.value = rPitch;
  if (pitchVal) pitchVal.textContent = rPitch + '°';
  if (azEl) azEl.value = rAz;
  if (azNum) azNum.value = rAz;
  if (azVal) azVal.textContent = rAz + '° (' + getAzimuthCardinalShort(rAz) + ')';
  if (parEl) parEl.value = (typeof bld.parapetHeight === 'number') ? bld.parapetHeight : 0.6;
  if (parWEl) parWEl.value = (typeof bld.parapetWidth === 'number') ? bld.parapetWidth : 0.25;
  if (ovhEl) ovhEl.value = (typeof bld.overhang === 'number') ? bld.overhang : 0.2;
  if (thkEl) thkEl.value = (typeof bld.roofThickness === 'number') ? bld.roofThickness : 0.20;
  if (skyEl) skyEl.value = (typeof bld.skylightCount === 'number') ? bld.skylightCount : 0;
  if (colorEl) colorEl.value = bld.facadeColor || '#F1F5F9';
  if (roofColEl) roofColEl.value = bld.roofColor || '#E2E8F0';
  if (edgeColEl) edgeColEl.value = bld.edgeColor || '#334155';

  const lDesign = (bld.lParams && bld.lParams.roofDesign) || bld.lRoofDesign || 'l_gable';
  const isLStepped = (rType === 'l_shape' && lDesign === 'l_stepped');
  const isLMixed = (rType === 'l_shape' && lDesign === 'l_mixed');
  const isLShed = (rType === 'l_shape' && lDesign === 'l_shed');
  const isPitched = (rType === 'gable' || rType === 'shed' || rType === 'hip' || (rType === 'l_shape' && !isLStepped));
  if (pitchRow) pitchRow.style.display = isPitched ? 'flex' : 'none';
  if (azRow) azRow.style.display = (rType === 'shed' || rType === 'gable' || isLShed) ? 'flex' : 'none';
  if (ovhRow) ovhRow.style.display = isPitched ? 'flex' : 'none';
  if (thkRow) thkRow.style.display = isPitched ? 'flex' : 'none';
  if (skyRow) skyRow.style.display = (rType === 'gable' || rType === 'shed' || (rType === 'l_shape' && !isLStepped)) ? 'flex' : 'none';
  if (parRow) parRow.style.display = (rType === 'flat' || isLStepped || isLMixed) ? 'flex' : 'none';
  if (parWRow) parWRow.style.display = (rType === 'flat' || isLStepped || isLMixed) ? 'flex' : 'none';

  if (typeof syncRectInspectorUI === 'function') {
    syncRectInspectorUI(bld);
  }
  if (typeof window.RALBuilding !== 'undefined' && typeof window.RALBuilding.syncInspectorUI === 'function') {
    window.RALBuilding.syncInspectorUI(bld);
  }

  render3DBuildingsInCesium();
  if (typeof renderTriad2D === 'function') renderTriad2D();
}

function selectBuildingFromDropdown(bldId) {
  selectBuilding(bldId);
}

function setBuildingFloors(numFloors) {
  if (!selectedBuildingId) return;
  const bld = buildings.find(b => b.id === selectedBuildingId);
  if (!bld) return;
  bld.height = numFloors * 3.0;
  bld.numFloors = numFloors;
  const hEl = document.getElementById('bld-height');
  if (hEl) hEl.value = bld.height;
  updateSelectedBuildingProps();
}

function setBuildingHeightPreset(height, label) {
  if (!selectedBuildingId) return;
  const bld = buildings.find(b => b.id === selectedBuildingId);
  if (!bld) return;
  bld.height = parseFloat(height) || 6.0;
  const hEl = document.getElementById('bld-height');
  if (hEl) hEl.value = bld.height;
  updateSelectedBuildingProps();
  if (typeof showToast === 'function') {
    showToast('ALTURA ACTUALIZADA', (bld.name || 'Edificio') + ': ' + (label || '') + ' (' + bld.height + 'm)', 'info', 1800);
  }
}
window.setBuildingHeightPreset = setBuildingHeightPreset;

function bldSyncAzimuth(val) {
  const az = parseInt(val, 10) || 0;
  const norm = ((az % 360) + 360) % 360;
  const slider = document.getElementById('bld-roof-azimuth');
  const num = document.getElementById('bld-roof-azimuth-num');
  const lbl = document.getElementById('bld-roof-azimuth-val');
  if (slider && document.activeElement !== slider) slider.value = norm;
  if (num && document.activeElement !== num) num.value = norm;
  if (lbl) lbl.textContent = norm + '° (' + getAzimuthCardinalShort(norm) + ')';
  updateSelectedBuildingProps();
}

function updateSelectedBuildingProps() {
  if (!selectedBuildingId) return;
  const bld = buildings.find(b => b.id === selectedBuildingId);
  if (!bld) return;

  const nameEl    = document.getElementById('bld-name');
  const hEl       = document.getElementById('bld-height');
  const roofEl    = document.getElementById('bld-roof-type');
  const pitchEl   = document.getElementById('bld-roof-pitch');
  const pitchRow  = document.getElementById('bld-pitch-row');
  const azEl      = document.getElementById('bld-roof-azimuth');
  const azRow     = document.getElementById('bld-azimuth-row');
  const parEl     = document.getElementById('bld-parapet-height');
  const parRow    = document.getElementById('bld-parapet-row');
  const parWEl    = document.getElementById('bld-parapet-width');
  const parWRow   = document.getElementById('bld-parapet-width-row');
  const ovhEl     = document.getElementById('bld-overhang');
  const ovhRow    = document.getElementById('bld-overhang-row');
  const thkEl     = document.getElementById('bld-roof-thickness');
  const thkRow    = document.getElementById('bld-thickness-row');
  const skyEl     = document.getElementById('bld-skylight-count');
  const skyRow    = document.getElementById('bld-skylights-row');
  const colorEl   = document.getElementById('bld-facade-color');
  const roofColEl = document.getElementById('bld-roof-color');
  const edgeColEl = document.getElementById('bld-edge-color');

  if (nameEl) bld.name = nameEl.value;
  if (hEl) bld.height = parseFloat(hEl.value) || 6.0;
  if (roofEl) bld.roofType = roofEl.value;
  if (pitchEl) bld.roofPitch = parseFloat(pitchEl.value) || 25;
  if (azEl) bld.roofAzimuth = parseFloat(azEl.value) ?? 180;
  if (parEl) bld.parapetHeight = parseFloat(parEl.value) || 0;
  if (parWEl) bld.parapetWidth = parseFloat(parWEl.value) || 0.25;
  if (ovhEl) bld.overhang = parseFloat(ovhEl.value) || 0;
  if (thkEl) bld.roofThickness = parseFloat(thkEl.value) || 0.20;
  if (skyEl) bld.skylightCount = parseInt(skyEl.value, 10) || 0;
  if (colorEl) bld.facadeColor = colorEl.value;
  if (roofColEl) bld.roofColor = roofColEl.value;
  if (edgeColEl) bld.edgeColor = edgeColEl.value;

  // Sincronización reactiva en vivo del texto del dropdown y título
  const dd = document.getElementById('bld-selected-dropdown');
  if (dd) {
    const opt = dd.querySelector('option[value="' + bld.id + '"]');
    if (opt) {
      opt.textContent = bld.name + ' (' + bld.height + 'm)';
    }
  }
  setElemText('bld-selected-title', (bld.name || 'EDIFICIO').toUpperCase());

  const rType = bld.roofType || 'flat';
  const lDesign = (bld.lParams && bld.lParams.roofDesign) || bld.lRoofDesign || 'l_gable';
  const isLStepped = (rType === 'l_shape' && lDesign === 'l_stepped');
  const isLMixed = (rType === 'l_shape' && lDesign === 'l_mixed');
  const isLShed = (rType === 'l_shape' && lDesign === 'l_shed');
  const isPitched = (rType === 'gable' || rType === 'shed' || rType === 'hip' || (rType === 'l_shape' && !isLStepped));
  if (pitchRow) pitchRow.style.display = isPitched ? 'flex' : 'none';
  if (azRow) azRow.style.display = (rType === 'shed' || rType === 'gable' || isLShed) ? 'flex' : 'none';
  if (parRow) parRow.style.display = (rType === 'flat' || isLStepped || isLMixed) ? 'flex' : 'none';
  if (parWRow) parWRow.style.display = (rType === 'flat' || isLStepped || isLMixed) ? 'flex' : 'none';
  if (ovhRow) ovhRow.style.display = isPitched ? 'flex' : 'none';
  if (thkRow) thkRow.style.display = isPitched ? 'flex' : 'none';
  if (skyRow) skyRow.style.display = (rType === 'gable' || rType === 'shed' || (rType === 'l_shape' && !isLStepped)) ? 'flex' : 'none';

  if (typeof window.RALBuilding !== 'undefined' && typeof window.RALBuilding.syncInspectorUI === 'function') {
    window.RALBuilding.syncInspectorUI(bld);
  }

  if (typeof window.wpInvalidateHeatmap === 'function') window.wpInvalidateHeatmap('Configuración de edificio modificada');
  render3DBuildingsInCesium();
}

function deleteSelectedBuilding() {
  try {
    const dd = document.getElementById('bld-selected-dropdown');
    const bldId = (typeof selectedBuildingId !== 'undefined' && selectedBuildingId)
      ? selectedBuildingId
      : ((dd && dd.value) ? dd.value : ((typeof buildings !== 'undefined' && buildings && buildings.length > 0) ? buildings[0].id : null));

    if (!bldId) {
      showToast('AVISO', 'No hay ningún edificio para borrar.', 'info', 2000);
      return;
    }

    const bld = (typeof buildings !== 'undefined' && Array.isArray(buildings)) ? buildings.find(b => b && b.id === bldId) : null;
    const bldName = bld ? bld.name : 'Edificio';

    if (window.RAundo && typeof window.RAundo.snapProject === 'function') {
      window.RAundo.snapProject('Eliminar edificio ' + bldName);
    } else if (window.RAundo && typeof window.RAundo.snapBuildings === 'function') {
      window.RAundo.snapBuildings('Eliminar ' + bldName);
    }

    // 1. Resetear estado de edición de huella
    if (typeof bldFootprintState !== 'undefined' && bldFootprintState) {
      bldFootprintState.editing = false;
      bldFootprintState.selectedVtxIdx = -1;
      bldFootprintState.activeBuildingId = null;
    }

    // 2. Identificar y eliminar in-place Planos de Trabajo y faldones asociados al edificio
    if (typeof WP !== 'undefined' && WP && Array.isArray(WP.planes)) {
      const planeIndicesToRemove = new Set();
      const planeIndexMap = new Map();
      let nextPIdx = 0;
      WP.planes.forEach((p, pIdx) => {
        if (!p || p.buildingId === bldId || (p.id && (p.id.startsWith('plane_roof_' + bldId) || p.id.includes(bldId)))) {
          planeIndicesToRemove.add(pIdx);
        } else {
          planeIndexMap.set(pIdx, nextPIdx++);
        }
      });

      if (Array.isArray(WP.polylines)) {
        for (let i = WP.polylines.length - 1; i >= 0; i--) {
          const poly = WP.polylines[i];
          if (!poly || poly.buildingId === bldId || planeIndicesToRemove.has(poly.planeIdx)) {
            WP.polylines.splice(i, 1);
          } else if (typeof poly.planeIdx === 'number' && planeIndexMap.has(poly.planeIdx)) {
            poly.planeIdx = planeIndexMap.get(poly.planeIdx);
          }
        }
        WP.selectedPolyIdx = -1;
        WP.selectedVtxIdx = -1;
      }

      for (let i = WP.planes.length - 1; i >= 0; i--) {
        if (planeIndicesToRemove.has(i)) WP.planes.splice(i, 1);
      }
      WP.activePlaneIdx = WP.planes.length > 0 ? 0 : -1;
    }

    // 3. Limpiar Paneles Solares Simulados asociados
    if (typeof simulatedPanels !== 'undefined' && Array.isArray(simulatedPanels)) {
      simulatedPanels = simulatedPanels.filter(pan => pan && pan.bldId !== bldId && (!pan.planeId || !pan.planeId.includes(bldId)));
    }
    if (typeof window !== 'undefined' && window._simulatedPanels && Array.isArray(window._simulatedPanels)) {
      window._simulatedPanels = window._simulatedPanels.filter(pan => pan && pan.bldId !== bldId && (!pan.planeId || !pan.planeId.includes(bldId)));
    }
    if (typeof simulatedPanelEntities !== 'undefined' && Array.isArray(simulatedPanelEntities)) {
      simulatedPanelEntities = simulatedPanelEntities.filter(pan => pan && pan.bldId !== bldId);
    }
    
    if (typeof window !== 'undefined' && window.solarSimState && window.solarSimState.annualHeatmapData) {
      window.solarSimState.annualHeatmapData = null; // Invalida el estado térmico al borrar la cubierta
    }

    // 4. Limpiar Obstáculos colocados sobre el edificio
    // [C4/G3] Borrado in-place sobre la MISMA lista compartida (evita obstáculos fantasma).
    if (typeof obstacles !== 'undefined' && Array.isArray(obstacles)) {
      for (let _oi = obstacles.length - 1; _oi >= 0; _oi--) {
        const obs = obstacles[_oi];
        if (obs && (obs.buildingId === bldId || (obs.planeId && obs.planeId.includes(bldId)))) {
          obstacles.splice(_oi, 1);
        }
      }
    }

    // 5. Limpiar polígono activo
    if (typeof polygonPoints !== 'undefined') {
      polygonPoints = [];
    }
    if (typeof isPolygonDesignConfirmed !== 'undefined') {
      isPolygonDesignConfirmed = false;
    }

    // 6. Eliminar el edificio in-place (preserva alias del array compartido)
    if (typeof buildings !== 'undefined' && Array.isArray(buildings)) {
      for (let i = buildings.length - 1; i >= 0; i--) {
        if (!buildings[i] || buildings[i].id === bldId) buildings.splice(i, 1);
      }
    }
    if (typeof selectedBuildingId !== 'undefined') {
      selectedBuildingId = null;
    }

    // 7. Ocultar o actualizar caja de edición
    const ed = document.getElementById('bld-editor-box');
    if (ed) ed.style.display = 'none';

    const countBadge = document.getElementById('buildings-count-badge');
    if (countBadge && typeof buildings !== 'undefined') {
      countBadge.textContent = buildings.length + ' EDIFICIO' + (buildings.length === 1 ? '' : 'S');
    }

    if (dd && typeof buildings !== 'undefined') {
      dd.innerHTML = '<option value="">(Ninguno)</option>' + buildings.map(b => 
        '<option value="' + b.id + '">' + b.name + ' (' + b.height + 'm)</option>'
      ).join('');
      dd.value = '';
    }

    // 8. Re-seleccionar edificio restante o limpiar selección
    if (typeof selectBuilding === 'function') {
      if (typeof buildings !== 'undefined' && buildings.length > 0) {
        selectBuilding(buildings[0].id);
      } else {
        selectBuilding(null);
      }
    }

    // 9. Re-renderizar todos los elementos 3D
    if (typeof render3DBuildingsInCesium === 'function') render3DBuildingsInCesium();
    if (typeof wpRenderAllPolylines === 'function') wpRenderAllPolylines();
    if (typeof wpFastRenderSimulatedPanels === 'function') wpFastRenderSimulatedPanels();
    if (typeof render3DObstaclesInCesium === 'function') render3DObstaclesInCesium();
    if (typeof wpUpdateUI === 'function') wpUpdateUI();
    if (typeof updateAllVisuals === 'function') updateAllVisuals();
    if (typeof recalculateSolarYield === 'function') recalculateSolarYield();
    if (typeof renderTriad2D === 'function') renderTriad2D();

    if (typeof viewer !== 'undefined' && viewer && viewer.scene && typeof viewer.scene.requestRender === 'function') {
      viewer.scene.requestRender();
    }

    if (typeof ProjectHierarchy !== 'undefined' && ProjectHierarchy && typeof ProjectHierarchy.notify === 'function') {
      ProjectHierarchy.notify('building_deleted', { bldId: bldId });
    }
    showToast('EDIFICIO ELIMINADO', bldName + ' ha sido eliminado correctamente.', 'info', 2500);
  } catch (err) {
    console.error('Error al borrar edificio:', err);
    showToast('ERROR', 'No se pudo eliminar el edificio: ' + err.message, 'error', 3000);
  }
}

// [ARQUITECTURA v2] Versión canónica en js/buildings.js — este inline actúa como fallback
// [ARQUITECTURA AAA] render3DBuildingsInCesium delegada a js/buildings.js

// [B1] createSolarPlaneFromBuildingRoof reside de forma canónica en js/buildings.js
