// ===============================================================================
// MODULO DE CABLEADO Y CANALIZACIONES 3D (BANDEJAS Y TUBOS DE FACHADA)
// Extraído para arquitectura modular desacoplada según norma ISO/IEC 25010
// ===============================================================================

// ═════════════════════════════════════════════════════════════════
// GESTIÓN DE CANALIZACIONES Y TRAZADO 3D (BANDEJAS Y TUBOS DE FACHADA)
// ═════════════════════════════════════════════════════════════════
window.cableRoutingState = {
  active: false,
  type: null, // 'dc' | 'ac'
  points: [],
  previewEntities: []
};
window.selectedRouteVertex = null;

function wpToggleCableRouting(type) {
  if (window.cableRoutingState && window.cableRoutingState.active) {
    if (window.cableRoutingState.type === type) {
      wpFinishCableRouting();
      return;
    }
    wpCancelCableRouting();
  }
  wpStartCableRouting(type);
}
window.wpToggleCableRouting = wpToggleCableRouting;

function wpStartCableRouting(type) {
  if (typeof viewer === 'undefined' || !viewer) return;
  if (!window.inverterEquipmentState) window.inverterEquipmentState = {};
  if (!window.inverterEquipmentState.routes) window.inverterEquipmentState.routes = { dc: [], ac: [] };

  window.cableRoutingState = {
    active: true,
    type: type,
    points: [],
    previewEntities: []
  };

  const tb = document.getElementById('cable-routing-toolbar');
  if (tb) tb.style.display = 'flex';

  const titleEl = document.getElementById('cable-routing-title');
  if (titleEl) {
    titleEl.innerHTML = type === 'dc'
      ? '<span style="color:#F59E0B;"><i data-lucide="route" class="icon-sm"></i> BANDEJA DC: CUBIERTA ➔ FACHADA ➔ INVERSOR</span>'
      : '<span style="color:#38BDF8;"><i data-lucide="route" class="icon-sm"></i> TUBO AC: INVERSOR ➔ CONTADOR/RED</span>';
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
  }

  const cntEl = document.getElementById('cable-routing-count');
  if (cntEl) cntEl.textContent = '0 puntos';

  const btnDC = document.getElementById('btn-route-dc');
  const btnAC = document.getElementById('btn-route-ac');
  if (btnDC) {
    btnDC.style.background = type === 'dc' ? 'var(--amber-500)' : 'rgba(239,68,68,0.15)';
    btnDC.style.color = type === 'dc' ? '#0F172A' : '#FCA5A5';
  }
  if (btnAC) {
    btnAC.style.background = type === 'ac' ? 'var(--sky-400)' : 'rgba(56,189,248,0.15)';
    btnAC.style.color = type === 'ac' ? '#0F172A' : '#7DD3FC';
  }

  if (viewer.scene && viewer.scene.canvas) {
    viewer.scene.canvas.style.cursor = 'crosshair';
  }

  showStatus('<i data-lucide="route" class="icon-sm"></i> TRAZADO ' + type.toUpperCase() + ': HAZ CLIC EN CUBIERTA O FACHADA PARA FIJAR PUNTOS DE BANDEJA (INTRO O DOBLE CLIC PARA FIJAR)', 4500);
  if (typeof showToast === 'function') {
    showToast('TRAZAR ' + (type === 'dc' ? 'BANDEJA DC' : 'TUBO AC'), 'Haz clic en el modelo 3D para definir la ruta rígida de tubos/bandejas. Pulsa Intro o doble clic para terminar.', 'info', 4000);
  }
}
window.wpStartCableRouting = wpStartCableRouting;

function wpToggleCableAuditElevation(forceVal) {
  if (!window.RACableEngine || typeof window.RACableEngine.toggleAuditElevation !== 'function') return false;
  const active = window.RACableEngine.toggleAuditElevation(forceVal);

  const floatBtn = document.getElementById('btn-toggle-cable-audit');
  const floatTag = document.getElementById('tag-cable-audit-status');
  if (floatBtn) {
    floatBtn.style.borderColor = active ? 'rgba(16,185,129,0.75)' : 'rgba(245,158,11,0.4)';
    floatBtn.style.background = active ? 'rgba(6,78,59,0.92)' : 'rgba(15,23,42,0.88)';
  }
  if (floatTag) {
    floatTag.textContent = active ? '+24cm' : 'OFF';
    floatTag.style.background = active ? 'rgba(16,185,129,0.3)' : 'rgba(100,116,139,0.25)';
    floatTag.style.color = active ? '#34D399' : '#94A3B8';
  }

  const s4Btn = document.getElementById('btn-toggle-cable-audit-step4');
  if (s4Btn) {
    s4Btn.style.background = active ? 'rgba(16,185,129,0.25)' : 'rgba(15,23,42,0.7)';
    s4Btn.style.borderColor = active ? '#10B981' : 'rgba(148,163,184,0.35)';
    s4Btn.style.color = active ? '#34D399' : '#CBD5E1';
    s4Btn.innerHTML = active
      ? '<span><i data-lucide="eye" class="icon-sm"></i> AUDITORÍA CABLES (+24 cm): ON</span>'
      : '<span><i data-lucide="eye" class="icon-sm"></i> AUDITAR CABLES (+24 cm)</span>';
    if (typeof lucide !== 'undefined' && lucide.createIcons) try { lucide.createIcons(); } catch (_) {}
  }

  if (typeof showToast === 'function') {
    showToast(
      active ? 'AUDITORÍA DE CABLEADO ACTIVA' : 'VISTA FÍSICA REALISTA RESTAURADA',
      active
        ? 'Cables proyectados visualmente +24 cm sobre cubierta para inspección. Mediciones reales intactas.'
        : 'Los conductos vuelven a su cota constructiva real bajo estructura.',
      'info',
      3000
    );
  }
  return active;
}
window.wpToggleCableAuditElevation = wpToggleCableAuditElevation;

function wpEditCableRouteVertices(type) {
  const rType = (type === 'ac') ? 'ac' : 'dc';
  if (window.RACableEngine && typeof window.RACableEngine.materializeEditableRoute === 'function') {
    const pts = window.RACableEngine.materializeEditableRoute(rType);
    if (Array.isArray(pts) && pts.length > 0) {
      if (typeof showStatus === 'function') {
        showStatus('CODOS EDITABLES ' + rType.toUpperCase() + ' LISTOS · ARRASTRA UN CODO (Shift: Ortogonal 90° | Clic verde +: Partir | Supr/Doble clic: Borrar)', 4200);
      }
      return pts;
    }
  }
  return wpStartCableRouting(rType);
}
window.wpEditCableRouteVertices = wpEditCableRouteVertices;

function wpNudgeRouteVertexHeight(deltaM) {
  if (window.RACableEngine && typeof window.RACableEngine.nudgeSelectedVertexElevation === 'function') {
    const ok = window.RACableEngine.nudgeSelectedVertexElevation(deltaM);
    if (ok && typeof showStatus === 'function') {
      showStatus((deltaM >= 0 ? 'SALTO DE PETO +' : 'BAJADA COTA ') + Math.round(deltaM * 100) + ' cm APLICADO AL CODO', 2000);
    }
    return ok;
  }
  return false;
}
window.wpNudgeRouteVertexHeight = wpNudgeRouteVertexHeight;

function wpAddCableRoutePoint(pos3D, eventModifiers) {
  if (!window.cableRoutingState || !window.cableRoutingState.active) return;
  if (!pos3D || typeof viewer === 'undefined' || !viewer) return;

  // [SNAP INTELIGENTE] Si es el primer punto de trazado DC, imantar al terminal de string o nodo Y
  let snapLabel = null;
  if (window.cableRoutingState.points.length === 0 && window.cableRoutingState.type === 'dc' &&
      window.RACableEngine && typeof window.RACableEngine.findSnapTarget === 'function') {
    const snapPt = window.RACableEngine.findSnapTarget(pos3D, 3.0);
    if (snapPt) {
      pos3D = snapPt;
      snapLabel = 'Terminal de string';
      if (typeof showToast === 'function') {
        showToast('ORIGEN FIJADO', 'Conectado magnéticamente al string de paneles.', 'info', 2000);
      }
    }
  } else if (window.RACableEngine && typeof window.RACableEngine.snapRoutePoint === 'function') {
    const prevPt = window.cableRoutingState.points.length > 0
      ? window.cableRoutingState.points[window.cableRoutingState.points.length - 1]
      : null;
    const orthoLock = Boolean((eventModifiers && eventModifiers.shiftKey) || (typeof window !== 'undefined' && window._raShiftKeyDown));
    const snapRes = window.RACableEngine.snapRoutePoint(pos3D, { prevPoint: prevPt, orthogonalLock: orthoLock });
    if (snapRes && snapRes.cartesian) {
      pos3D = snapRes.cartesian;
      snapLabel = snapRes.snapTag || null;
    }
  }

  // Elevar ligeramente el punto sobre la superficie de la pared o fachada para visibilidad total
  let elevated = pos3D;
  try {
    const carto = Cesium.Cartographic.fromCartesian(pos3D);
    elevated = Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, carto.height + 0.15);
  } catch(e) { elevated = pos3D; }

  window.cableRoutingState.points.push(elevated);

  const type = window.cableRoutingState.type;
  const colorHex = (type === 'dc') ? '#F59E0B' : '#38BDF8';

  // Marcador visual de codo / quiebro
  const ptEnt = viewer.entities.add({
    position: elevated,
    point: {
      pixelSize: 10,
      color: Cesium.Color.fromCssColorString(colorHex),
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 2,
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    }
  });
  window.cableRoutingState.previewEntities.push(ptEnt);

  // Línea preview entre los puntos trazados
  if (window.cableRoutingState.points.length >= 2) {
    if (!window.cableRoutingState.previewLine) {
      window.cableRoutingState.previewLine = viewer.entities.add({
        polyline: {
          positions: new Cesium.CallbackProperty(() => window.cableRoutingState.points, false),
          width: 5.0,
          arcType: (typeof Cesium !== 'undefined' && Cesium.ArcType) ? Cesium.ArcType.NONE : undefined,
          material: new Cesium.ColorMaterialProperty(Cesium.Color.fromCssColorString(colorHex)
          ),
          // depthFailMaterial removed
        }
      });
      window.cableRoutingState.previewEntities.push(window.cableRoutingState.previewLine);
    }
  }

  // Calcular longitud acumulada
  let cumDist = 0;
  for (let i = 0; i < window.cableRoutingState.points.length - 1; i++) {
    cumDist += Cesium.Cartesian3.distance(window.cableRoutingState.points[i], window.cableRoutingState.points[i + 1]);
  }

  const cntEl = document.getElementById('cable-routing-count');
  if (cntEl) cntEl.textContent = window.cableRoutingState.points.length + ' pts · ' + cumDist.toFixed(1) + ' m';

  showStatus('<i data-lucide="route" class="icon-sm"></i> VÉRTICE #' + window.cableRoutingState.points.length + ' AÑADIDO (' + cumDist.toFixed(1) + ' m)' + (snapLabel ? ' [' + snapLabel + ']' : '') + ' — SHIFT: ORTOGONAL 90° · INTRO PARA FIJAR', 2500);

  if (viewer.scene && viewer.scene.requestRender) viewer.scene.requestRender();
}
window.wpAddCableRoutePoint = wpAddCableRoutePoint;

function wpUndoLastCableRoutePoint() {
  if (!window.cableRoutingState || !window.cableRoutingState.active) return;
  if (window.cableRoutingState.points.length === 0) return;

  window.cableRoutingState.points.pop();

  // Eliminar última entidad de punto
  for (let i = window.cableRoutingState.previewEntities.length - 1; i >= 0; i--) {
    const ent = window.cableRoutingState.previewEntities[i];
    if (ent && ent.point) {
      viewer.entities.remove(ent);
      window.cableRoutingState.previewEntities.splice(i, 1);
      break;
    }
  }

  let cumDist = 0;
  for (let i = 0; i < window.cableRoutingState.points.length - 1; i++) {
    cumDist += Cesium.Cartesian3.distance(window.cableRoutingState.points[i], window.cableRoutingState.points[i + 1]);
  }
  const cntEl = document.getElementById('cable-routing-count');
  if (cntEl) cntEl.textContent = window.cableRoutingState.points.length + ' pts · ' + cumDist.toFixed(1) + ' m';

  if (viewer.scene && viewer.scene.requestRender) viewer.scene.requestRender();
}
window.wpUndoLastCableRoutePoint = wpUndoLastCableRoutePoint;

function wpCancelCableRouting() {
  if (!window.cableRoutingState) return;

  if (window.cableRoutingState.previewEntities && viewer && viewer.entities) {
    window.cableRoutingState.previewEntities.forEach(ent => {
      try { viewer.entities.remove(ent); } catch(e) {}
    });
  }
  window.cableRoutingState.previewEntities = [];
  window.cableRoutingState.previewLine = null;
  window.cableRoutingState.points = [];
  window.cableRoutingState.active = false;

  const tb = document.getElementById('cable-routing-toolbar');
  if (tb) tb.style.display = 'none';

  const btnDC = document.getElementById('btn-route-dc');
  const btnAC = document.getElementById('btn-route-ac');
  if (btnDC) {
    btnDC.style.background = 'rgba(239,68,68,0.15)';
    btnDC.style.color = '#FCA5A5';
  }
  if (btnAC) {
    btnAC.style.background = 'rgba(56,189,248,0.15)';
    btnAC.style.color = '#7DD3FC';
  }

  if (viewer && viewer.scene && viewer.scene.canvas) {
    viewer.scene.canvas.style.cursor = 'default';
  }
  if (viewer && viewer.scene && viewer.scene.requestRender) viewer.scene.requestRender();
}
window.wpCancelCableRouting = wpCancelCableRouting;

function wpFinishCableRouting() {
  if (!window.cableRoutingState || !window.cableRoutingState.active) return;

  const type = window.cableRoutingState.type;
  const pts = window.cableRoutingState.points;

  if (pts && pts.length >= 1) {
    if (!window.inverterEquipmentState) window.inverterEquipmentState = {};
    if (!window.inverterEquipmentState.routes) window.inverterEquipmentState.routes = { dc: [], ac: [] };

    window.inverterEquipmentState.routes[type] = pts.map(p => Cesium.Cartesian3.clone(p));

    let len = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      len += Cesium.Cartesian3.distance(pts[i], pts[i + 1]);
    }
    showToast('CANALIZACIÓN FIJADA', 'Ruta ' + type.toUpperCase() + ' (' + pts.length + ' codos, ' + len.toFixed(1) + 'm) guardada.', 'success', 3500);
  }

  wpCancelCableRouting();
  if (typeof wpCalculateAndRenderInverterCables === 'function') wpCalculateAndRenderInverterCables();
  wpUpdateCableRoutesUI();
}
window.wpFinishCableRouting = wpFinishCableRouting;

function wpClearCableRoute(type) {
  if (window.inverterEquipmentState && window.inverterEquipmentState.routes) {
    window.inverterEquipmentState.routes[type] = [];
  }
  if (typeof wpCalculateAndRenderInverterCables === 'function') wpCalculateAndRenderInverterCables();
  wpUpdateCableRoutesUI();
  showToast('CANALIZACIÓN RESETEADA', 'Trazado ' + type.toUpperCase() + ' restaurado a automático.', 'info', 2500);
}
window.wpClearCableRoute = wpClearCableRoute;

function wpDeleteSelectedRouteVertex() {
  if (!window.selectedRouteVertex) return false;
  const { type, index } = window.selectedRouteVertex;
  if (window.inverterEquipmentState && window.inverterEquipmentState.routes && window.inverterEquipmentState.routes[type]) {
    if (index >= 0 && index < window.inverterEquipmentState.routes[type].length) {
      window.inverterEquipmentState.routes[type].splice(index, 1);
      window.selectedRouteVertex = null;
      if (typeof wpCalculateAndRenderInverterCables === 'function') wpCalculateAndRenderInverterCables();
      wpUpdateCableRoutesUI();
      showToast('CODO ELIMINADO', 'Vértice de canalización ' + type.toUpperCase() + ' eliminado.', 'info', 2000);
      return true;
    }
  }
  return false;
}
window.wpDeleteSelectedRouteVertex = wpDeleteSelectedRouteVertex;

function wpUpdateCableRoutesUI() {
  const stratEl = document.getElementById('step4-cable-routing-strategy');
  if (stratEl && window.inverterEquipmentState && window.inverterEquipmentState.routingStrategy) {
    stratEl.value = window.inverterEquipmentState.routingStrategy;
  }

  const container = document.getElementById('cable-routes-summary');
  if (!container) return;

  const routes = (window.inverterEquipmentState && window.inverterEquipmentState.routes) ? window.inverterEquipmentState.routes : { dc: [], ac: [] };
  const hasDC = routes.dc && routes.dc.length > 0;
  const hasAC = routes.ac && routes.ac.length > 0;

  let html = '';
  if (!hasDC && !hasAC) {
    html = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:2px;">
        <button type="button" onclick="wpEditCableRouteVertices('dc')" class="doc-mini-btn" style="padding:3px 5px;font-size:10px;color:#FDE68A;border-color:rgba(245,158,11,0.35);" title="Convierte el trazado automático DC en nodos editables sobre cubierta">✂ Editar codos DC</button>
        <button type="button" onclick="wpEditCableRouteVertices('ac')" class="doc-mini-btn" style="padding:3px 5px;font-size:10px;color:#BAE6FD;border-color:rgba(56,189,248,0.35);" title="Convierte el trazado automático AC en nodos editables sobre fachada/suelo">✂ Editar codos AC</button>
      </div>
    `;
    container.innerHTML = html;
    return;
  }

  if (hasDC) {
    let dcL = 0;
    for (let i = 0; i < routes.dc.length - 1; i++) dcL += Cesium.Cartesian3.distance(routes.dc[i], routes.dc[i + 1]);
    html += `
      <div style="font-size: 10px;color:#FDE68A;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);padding:3px 6px;border-radius:4px;display:flex;justify-content:space-between;align-items:center;">
        <span><i data-lucide="check" class="icon-sm"></i> <b>Bandeja DC:</b> ${routes.dc.length} codos (${dcL.toFixed(1)} m)</span>
        <div style="display:flex;gap:3px;">
          <button type="button" onclick="wpStartCableRouting('dc')" class="doc-mini-btn" style="padding:1px 4px;font-size: 10px;" title="Retrazar">✎ Retrazar</button>
          <button type="button" onclick="wpClearCableRoute('dc')" class="doc-mini-btn" style="padding:1px 4px;font-size: 10px;color:#EF4444;" title="Volver a automático" aria-label="Borrar ruta DC">✕</button>
        </div>
      </div>
    `;
  } else {
    html += `<button type="button" onclick="wpEditCableRouteVertices('dc')" class="doc-mini-btn" style="padding:3px 5px;font-size:10px;color:#FDE68A;border-color:rgba(245,158,11,0.35);width:100%;margin-top:2px;">✂ Convertir bandeja DC a codos editables</button>`;
  }

  if (hasAC) {
    let acL = 0;
    for (let i = 0; i < routes.ac.length - 1; i++) acL += Cesium.Cartesian3.distance(routes.ac[i], routes.ac[i + 1]);
    html += `
      <div style="font-size: 10px;color:#BAE6FD;background:rgba(56,189,248,0.1);border:1px solid rgba(56,189,248,0.3);padding:3px 6px;border-radius:4px;display:flex;justify-content:space-between;align-items:center;margin-top:2px;">
        <span><i data-lucide="check" class="icon-sm"></i> <b>Tubo AC:</b> ${routes.ac.length} codos (${acL.toFixed(1)} m)</span>
        <div style="display:flex;gap:3px;">
          <button type="button" onclick="wpStartCableRouting('ac')" class="doc-mini-btn" style="padding:1px 4px;font-size: 10px;" title="Retrazar">✎ Retrazar</button>
          <button type="button" onclick="wpClearCableRoute('ac')" class="doc-mini-btn" style="padding:1px 4px;font-size: 10px;color:#EF4444;" title="Volver a automático" aria-label="Borrar ruta AC">✕</button>
        </div>
      </div>
    `;
  } else {
    html += `<button type="button" onclick="wpEditCableRouteVertices('ac')" class="doc-mini-btn" style="padding:3px 5px;font-size:10px;color:#BAE6FD;border-color:rgba(56,189,248,0.35);width:100%;margin-top:2px;">✂ Convertir tubo AC a codos editables</button>`;
  }

  if (window.selectedRouteVertex) {
    const rv = window.selectedRouteVertex;
    html += `
      <div style="font-size:10px;background:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.4);padding:4px 6px;border-radius:4px;display:flex;justify-content:space-between;align-items:center;margin-top:3px;gap:4px;">
        <span style="color:#34D399;font-weight:700;">Codo ${rv.type.toUpperCase()} #${rv.index + 1}</span>
        <div style="display:flex;gap:3px;">
          <button type="button" onclick="wpNudgeRouteVertexHeight(0.35)" class="doc-mini-btn" style="padding:1px 5px;font-size:10px;" title="Elevar codo +35 cm para saltar peto perimetral">+35cm Peto</button>
          <button type="button" onclick="wpNudgeRouteVertexHeight(-0.35)" class="doc-mini-btn" style="padding:1px 5px;font-size:10px;" title="Bajar codo -35 cm">-35cm</button>
          <button type="button" onclick="wpDeleteSelectedRouteVertex()" class="doc-mini-btn" style="padding:1px 5px;font-size:10px;color:#EF4444;" title="Eliminar este codo">Quitar</button>
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
  if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
}
window.wpUpdateCableRoutesUI = wpUpdateCableRoutesUI;
// [B1] wpCalculateAndRenderInverterCables se define de forma canónica en js/cable-engine.js
