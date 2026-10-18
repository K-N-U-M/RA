/**
 * ============================================================================
 * 🧱 SISTEMA MODULAR DE OBSTÁCULOS 3D, SOMBRAS Y GIZMOS — PROYECTO RA
 * ============================================================================
 * Manejo de chimeneas, casetones, árboles (copa elipsoidal), muretes y sombras
 * en tiempo real con integración Cesium 3D Tiles y geometría analítica.
 */
(function(global) {
  'use strict';

  // ── ESTADO GLOBAL COMPARTIDO DE OBSTÁCULOS Y GEOMETRÍA ─────────────────────
  global.obstacles = global.obstacles || [];
  global.polygonPoints = global.polygonPoints || [];
  global._obsPrimitives = global._obsPrimitives || [];
  global._obsLabelCollection = global._obsLabelCollection || null;
  global.selectedObstacleIndex = typeof global.selectedObstacleIndex !== 'undefined' ? global.selectedObstacleIndex : -1;
  global.selectedObstacleId = typeof global.selectedObstacleId !== 'undefined' ? global.selectedObstacleId : null;
  global.activeObstaclePlacing = global.activeObstaclePlacing || null;

  var obstacles = global.obstacles;
  var selectedObstacleId = global.selectedObstacleId;
  var polygonPoints = global.polygonPoints;

  global.obsPlacement = global.obsPlacement || {
    active: false,
    type: null,
    ghost: [],
    cursor: [],
    lastX: 0,
    lastY: 0
  };
  var obsPlacement = global.obsPlacement;

  const OBSTACLE_DEFS = {
    chimenea: { name: 'Chimenea', w: 0.6, l: 0.6, h: 1.2, alignment: 'vertical' },
    caseton: { name: 'Casetón', w: 2.5, l: 2.0, h: 2.2, alignment: 'vertical' },
    hvac: { name: 'Climatización HVAC', w: 1.8, l: 1.2, h: 1.4, alignment: 'vertical' },
    custom: { name: 'Obstáculo Personalizado', w: 1.0, l: 1.0, h: 1.0, alignment: 'vertical' },
    tree: { name: 'Árbol', radius: 2.5, h: 6.0, trunkH: 2.0, w: 5.0, l: 5.0, alignment: 'vertical' }
  };


function getObstacleActivePlane(optPolyOrPlaneIdx) {
  // 1. Si se especificó un planeIdx numérico directo o si viene un obstáculo con planeIdx
  if (typeof WP !== "undefined" && WP && Array.isArray(WP.planes) && WP.planes.length > 0) {
    let targetPlaneIdx = -1;
    if (typeof optPolyOrPlaneIdx === 'number') {
      if (optPolyOrPlaneIdx >= 0 && optPolyOrPlaneIdx < WP.planes.length) {
        targetPlaneIdx = optPolyOrPlaneIdx;
      }
    } else if (optPolyOrPlaneIdx && typeof optPolyOrPlaneIdx === 'object') {
      if (typeof optPolyOrPlaneIdx.planeIdx === 'number' && optPolyOrPlaneIdx.planeIdx >= 0 && optPolyOrPlaneIdx.planeIdx < WP.planes.length) {
        targetPlaneIdx = optPolyOrPlaneIdx.planeIdx;
      } else if (typeof optPolyOrPlaneIdx.polyIdx === 'number' && Array.isArray(WP.polylines) && WP.polylines[optPolyOrPlaneIdx.polyIdx]) {
        targetPlaneIdx = WP.polylines[optPolyOrPlaneIdx.polyIdx].planeIdx;
      }
    }
    if (targetPlaneIdx >= 0 && WP.planes[targetPlaneIdx] && WP.planes[targetPlaneIdx].normal && WP.planes[targetPlaneIdx].origin) {
      const p = WP.planes[targetPlaneIdx];
      const origin = Cesium.Cartesian3.clone(p.origin);
      const normal = Cesium.Cartesian3.normalize(p.normal, new Cesium.Cartesian3());
      const uVec = Cesium.Cartesian3.normalize(p.uVec, new Cesium.Cartesian3());
      const vVec = Cesium.Cartesian3.normalize(p.vVec, new Cesium.Cartesian3());
      return { origin, normal, uVec, vVec, plane: { origin, normal } };
    }
  }

  // 2. Plano activo de trabajo
  const wpPlane = (typeof wpGetActivePlane === 'function') ? wpGetActivePlane() : null;
  if (wpPlane && wpPlane.normal && wpPlane.origin) {
    const origin = Cesium.Cartesian3.clone(wpPlane.origin);
    const normal = Cesium.Cartesian3.normalize(wpPlane.normal, new Cesium.Cartesian3());
    const uVec = Cesium.Cartesian3.normalize(wpPlane.uVec, new Cesium.Cartesian3());
    const vVec = Cesium.Cartesian3.normalize(wpPlane.vVec, new Cesium.Cartesian3());
    return { origin, normal, uVec, vVec, plane: { origin, normal } };
  }

  // 3. Fallback a primer plano en WP.planes
  if (typeof WP !== "undefined" && WP && Array.isArray(WP.planes) && WP.planes.length > 0 && WP.planes[0].normal && WP.planes[0].origin) {
    const p0 = WP.planes[0];
    const origin = Cesium.Cartesian3.clone(p0.origin);
    const normal = Cesium.Cartesian3.normalize(p0.normal, new Cesium.Cartesian3());
    const uVec = Cesium.Cartesian3.normalize(p0.uVec, new Cesium.Cartesian3());
    const vVec = Cesium.Cartesian3.normalize(p0.vVec, new Cesium.Cartesian3());
    return { origin, normal, uVec, vVec, plane: { origin, normal } };
  }

  // 4. Fallback a polilínea activa o especificada en WP.polylines
  if (typeof WP !== "undefined" && WP && Array.isArray(WP.polylines) && WP.polylines.length > 0) {
    let pIdx = -1;
    if (typeof optPolyOrPlaneIdx === 'number' && optPolyOrPlaneIdx >= 0 && optPolyOrPlaneIdx < WP.polylines.length) {
      pIdx = optPolyOrPlaneIdx;
    } else if (optPolyOrPlaneIdx && typeof optPolyOrPlaneIdx === 'object' && typeof optPolyOrPlaneIdx.polyIdx === 'number' && optPolyOrPlaneIdx.polyIdx >= 0 && optPolyOrPlaneIdx.polyIdx < WP.polylines.length) {
      pIdx = optPolyOrPlaneIdx.polyIdx;
    } else {
      pIdx = (WP.selectedPolyIdx >= 0 && WP.selectedPolyIdx < WP.polylines.length) ? WP.selectedPolyIdx : 0;
    }
    const poly = WP.polylines[pIdx];
    if (poly) {
      if (poly.roofInfo && poly.roofInfo.normal && poly.roofInfo.origin && poly.roofInfo.uVec && poly.roofInfo.vVec) {
        const origin = Cesium.Cartesian3.clone(poly.roofInfo.origin);
        const normal = Cesium.Cartesian3.normalize(poly.roofInfo.normal, new Cesium.Cartesian3());
        const uVec = Cesium.Cartesian3.normalize(poly.roofInfo.uVec, new Cesium.Cartesian3());
        const vVec = Cesium.Cartesian3.normalize(poly.roofInfo.vVec, new Cesium.Cartesian3());
        return { origin, normal, uVec, vVec, plane: { origin, normal } };
      }
      if (poly.points && poly.points.length >= 3 && typeof polygonAnalysis === 'function') {
        const pa = polygonAnalysis(poly.points);
        if (pa && pa.center && pa.normal) {
          const worldNormal = Cesium.Cartesian3.normalize(
            Cesium.Matrix4.multiplyByPointAsVector(pa.transform, pa.normal, new Cesium.Cartesian3()),
            new Cesium.Cartesian3()
          );
          const uVec = Cesium.Cartesian3.normalize(
            Cesium.Matrix4.multiplyByPointAsVector(pa.transform, pa.uVec, new Cesium.Cartesian3()),
            new Cesium.Cartesian3()
          );
          const vVec = Cesium.Cartesian3.normalize(
            Cesium.Matrix4.multiplyByPointAsVector(pa.transform, pa.vVec, new Cesium.Cartesian3()),
            new Cesium.Cartesian3()
          );
          return { origin: pa.center, normal: worldNormal, uVec, vVec, plane: { origin: pa.center, normal: worldNormal } };
        }
      }
    }
  }

  // 3. Fallback a polygonPoints global
  if (typeof polygonAnalysis === 'function') {
    const pa = polygonAnalysis();
    if (pa && pa.center && pa.normal) {
      const worldNormal = Cesium.Cartesian3.normalize(
        Cesium.Matrix4.multiplyByPointAsVector(pa.transform, pa.normal, new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
      );
      const uVec = Cesium.Cartesian3.normalize(
        Cesium.Matrix4.multiplyByPointAsVector(pa.transform, pa.uVec, new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
      );
      const vVec = Cesium.Cartesian3.normalize(
        Cesium.Matrix4.multiplyByPointAsVector(pa.transform, pa.vVec, new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
      );
      return { origin: pa.center, normal: worldNormal, uVec, vVec, plane: { origin: pa.center, normal: worldNormal } };
    }
  }

  return null;
}

function obsComputeUV(screenPos) {
  let wp = (typeof getObstacleActivePlane === 'function') ? getObstacleActivePlane() : null;

  let hit = null;
  if (wp && wp.plane && typeof viewer !== "undefined" && viewer && viewer.camera) {
    try {
      const ray = viewer.camera.getPickRay(screenPos);
      if (ray) {
        hit = wpRayPlane(ray, wp.plane);
      }
    } catch(eRay) { window.RA && window.RA.log && window.RA.log.warn('[catch silenciado]', eRay); }
  }

  // Fallback 1: Posición geométrica 3D del visor (Google 3D Tiles / Edificios OSM)
  if (!hit && typeof get3DPosition === "function") {
    try {
      hit = get3DPosition(screenPos);
    } catch(ePick) { window.RA && window.RA.log && window.RA.log.warn('[catch silenciado]', ePick); }
  }

  // Fallback 2: Pick sobre el elipsoide WGS84
  if (!hit && typeof viewer !== "undefined" && viewer.camera) {
    try {
      hit = viewer.camera.pickEllipsoid(screenPos, viewer.scene.globe ? viewer.scene.globe.ellipsoid : Cesium.Ellipsoid.WGS84);
    } catch(eEll) { window.RA && window.RA.log && window.RA.log.warn('[catch silenciado]', eEll); }
  }

  if (!hit) return null;

  if (wp && wp.origin && wp.uVec && wp.vVec) {
    const diff = Cesium.Cartesian3.subtract(hit, wp.origin, new Cesium.Cartesian3());
    const u = Cesium.Cartesian3.dot(diff, wp.uVec);
    const v = Cesium.Cartesian3.dot(diff, wp.vVec);
    return { u, v, hit, wp };
  } else {
    // Si no hay plano previo, crear un marco local ortonormal en el punto de impacto
    const normal = Cesium.Cartesian3.normalize(hit, new Cesium.Cartesian3());
    let uVec = Cesium.Cartesian3.cross(normal, Cesium.Cartesian3.UNIT_Z, new Cesium.Cartesian3());
    if (Cesium.Cartesian3.magnitude(uVec) < 0.01) {
      uVec = Cesium.Cartesian3.cross(normal, Cesium.Cartesian3.UNIT_X, new Cesium.Cartesian3());
    }
    uVec = Cesium.Cartesian3.normalize(uVec, uVec);
    const vVec = Cesium.Cartesian3.normalize(Cesium.Cartesian3.cross(normal, uVec, new Cesium.Cartesian3()), new Cesium.Cartesian3());
    const fallbackWp = { origin: hit, normal: normal, uVec: uVec, vVec: vVec };
    return { u: 0, v: 0, hit: hit, wp: fallbackWp };
  }
}

function getSelectedObstacle() {
  if (!selectedObstacleId || !Array.isArray(obstacles)) return null;
  return obstacles.find(o => o.id === selectedObstacleId) || null;
}

function renderObstacleGizmo2D() {
  if (!triadCtx || !triadCanvas || !scene) return;
  const obs = getSelectedObstacle();
  if (!obs) return;
  const wp = (typeof getObstacleActivePlane === 'function') ? getObstacleActivePlane(obs) : null;

  let baseCenter = null;
  let normal = null;
  let uVec = null;
  let vVec = null;

  if (wp && wp.origin && wp.normal && wp.uVec && wp.vVec) {
    normal = Cesium.Cartesian3.normalize(wp.normal, new Cesium.Cartesian3());
    uVec = Cesium.Cartesian3.normalize(wp.uVec, new Cesium.Cartesian3());
    vVec = Cesium.Cartesian3.normalize(wp.vVec, new Cesium.Cartesian3());
    baseCenter = Cesium.Cartesian3.add(
      wp.origin,
      Cesium.Cartesian3.add(
        Cesium.Cartesian3.add(
          Cesium.Cartesian3.multiplyByScalar(uVec, obs.u || 0, new Cesium.Cartesian3()),
          Cesium.Cartesian3.multiplyByScalar(vVec, obs.v || 0, new Cesium.Cartesian3()),
          new Cesium.Cartesian3()
        ),
        Cesium.Cartesian3.multiplyByScalar(normal, obs.elevation || 0, new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
      ),
      new Cesium.Cartesian3()
    );
  } else if (obs.cartesian) {
    baseCenter = (obs.cartesian instanceof Cesium.Cartesian3) ? obs.cartesian : new Cesium.Cartesian3(obs.cartesian.x, obs.cartesian.y, obs.cartesian.z);
    normal = Cesium.Cartesian3.normalize(baseCenter, new Cesium.Cartesian3());
    uVec = Cesium.Cartesian3.cross(normal, Cesium.Cartesian3.UNIT_Z, new Cesium.Cartesian3());
    if (Cesium.Cartesian3.magnitude(uVec) < 0.01) {
      uVec = Cesium.Cartesian3.cross(normal, Cesium.Cartesian3.UNIT_X, new Cesium.Cartesian3());
    }
    uVec = Cesium.Cartesian3.normalize(uVec, uVec);
    vVec = Cesium.Cartesian3.normalize(Cesium.Cartesian3.cross(normal, uVec, new Cesium.Cartesian3()), new Cesium.Cartesian3());
  }

  if (!baseCenter || !normal || !uVec || !vVec) return;

  const rotRad = Cesium.Math.toRadians(obs.rot || 0);
  const cosR = Math.cos(rotRad);
  const sinR = Math.sin(rotRad);

  // Ejes U y V locales del obstáculo
  const uRot = Cesium.Cartesian3.add(
    Cesium.Cartesian3.multiplyByScalar(uVec, cosR, new Cesium.Cartesian3()),
    Cesium.Cartesian3.multiplyByScalar(vVec, sinR, new Cesium.Cartesian3()),
    new Cesium.Cartesian3()
  );
  const vRot = Cesium.Cartesian3.add(
    Cesium.Cartesian3.multiplyByScalar(uVec, -sinR, new Cesium.Cartesian3()),
    Cesium.Cartesian3.multiplyByScalar(vVec, cosR, new Cesium.Cartesian3()),
    new Cesium.Cartesian3()
  );

  // Centro en el techo superior del obstáculo
  const topCenter = Cesium.Cartesian3.add(
    baseCenter,
    Cesium.Cartesian3.multiplyByScalar(normal, (obs.h || 1.2) + 0.15, new Cesium.Cartesian3()),
    new Cesium.Cartesian3()
  );

  const pCenter = Cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, topCenter);
  if (!pCenter || typeof pCenter.x !== 'number') return;

  const camPos = (camera && camera.positionWC) ? camera.positionWC : ((camera && camera.position) ? camera.position : null);
  const dist = camPos ? Cesium.Cartesian3.distance(camPos, topCenter) : 100;
  const distScale = Math.min(2.5, Math.max(0.7, Math.sqrt(dist / 50.0)));
  const scale = distScale * (triadState.scale || 1.0);

  const armLen = Math.max(dist * 0.04, 1.8) * scale;
  const tipU3D = Cesium.Cartesian3.add(topCenter, Cesium.Cartesian3.multiplyByScalar(uRot, armLen, new Cesium.Cartesian3()), new Cesium.Cartesian3());
  const tipV3D = Cesium.Cartesian3.add(topCenter, Cesium.Cartesian3.multiplyByScalar(vRot, armLen, new Cesium.Cartesian3()), new Cesium.Cartesian3());

  const pU = Cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, tipU3D);
  const pV = Cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, tipV3D);

  const ox = pCenter.x;
  const oy = pCenter.y;

  // Guardar datos geométricos proyectados para Hit-Testing con el ratón
  obsGizmoState.screen = {
    ox, oy, scale,
    pU: pU || { x: ox + 50 * scale, y: oy },
    pV: pV || { x: ox, y: oy - 50 * scale },
    ringRadius: Math.max(45 * scale, 35)
  };

  const hPart = obsGizmoState.hoveredPart || obsGizmoState.mode;

  // 1. ANILLO DE ROTACIÓN CON DISCO GRÁFICO
  const rRad = obsGizmoState.screen.ringRadius;
  triadCtx.beginPath();
  triadCtx.arc(ox, oy, rRad, 0, 2 * Math.PI);
  triadCtx.strokeStyle = (hPart === 'rotate-ring') ? '#F59E0B' : 'rgba(251, 191, 36, 0.65)';
  triadCtx.lineWidth = (hPart === 'rotate-ring') ? 4.5 : 2.5;
  triadCtx.stroke();

  // Tiradores angulares cardinales del anillo (0°, 90°, 180°, 270°)
  for (let ang = 0; ang < 360; ang += 45) {
    const aRad = Cesium.Math.toRadians(ang) - rotRad;
    const ax = ox + rRad * Math.cos(aRad);
    const ay = oy + rRad * Math.sin(aRad);
    triadCtx.beginPath();
    triadCtx.arc(ax, ay, (ang % 90 === 0 ? 3.5 : 2.0) * scale, 0, 2 * Math.PI);
    triadCtx.fillStyle = (hPart === 'rotate-ring') ? '#F59E0B' : '#FCD34D';
    triadCtx.fill();
  }

  // 2. FLECHAS DE TRASLACIÓN U (ROJA) Y V (VERDE)
  drawProjectedTriadAxis(ox, oy, obsGizmoState.screen.pU, (hPart === 'u-axis') ? '#FF2E2E' : '#EF4444', 'U', scale * ((hPart === 'u-axis') ? 1.2 : 1.0));
  drawProjectedTriadAxis(ox, oy, obsGizmoState.screen.pV, (hPart === 'v-axis') ? '#10B981' : '#22C55E', 'V', scale * ((hPart === 'v-axis') ? 1.2 : 1.0));

  // 3. DIANA CENTRAL DE ARRASTRE LIBRE 2D
  triadCtx.beginPath();
  triadCtx.arc(ox, oy, 14 * scale, 0, 2 * Math.PI);
  triadCtx.fillStyle = (hPart === 'center-drag') ? 'rgba(56, 189, 248, 0.45)' : 'rgba(255, 255, 255, 0.15)';
  triadCtx.fill();
  triadCtx.strokeStyle = (hPart === 'center-drag') ? '#38BDF8' : 'rgba(255, 255, 255, 0.8)';
  triadCtx.lineWidth = (hPart === 'center-drag') ? 3.0 : 1.5;
  triadCtx.stroke();

  triadCtx.beginPath();
  triadCtx.arc(ox, oy, 4.5 * scale, 0, 2 * Math.PI);
  triadCtx.fillStyle = '#FFFFFF';
  triadCtx.fill();

  // 4. BADGE HUD FLOTANTE SOBRE EL GIZMO
  const badgeText = obs.name + ' · ' + (obs.rot || 0) + '° · U:' + (obs.u || 0).toFixed(2) + ' V:' + (obs.v || 0).toFixed(2);
  triadCtx.font = 'bold ' + Math.round(10 * Math.max(scale, 0.9)) + 'px sans-serif';
  const tw = triadCtx.measureText(badgeText).width;
  const bx = ox - tw / 2 - 8;
  const by = oy - rRad - 26 * scale;

  triadCtx.fillStyle = 'rgba(15, 23, 42, 0.92)';
  triadCtx.strokeStyle = '#F59E0B';
  triadCtx.lineWidth = 1.5;
  triadCtx.beginPath();
  if (triadCtx.roundRect) {
    triadCtx.roundRect(bx, by, tw + 16, 20 * scale + 4, 4);
  } else {
    triadCtx.rect(bx, by, tw + 16, 20 * scale + 4);
  }
  triadCtx.fill();
  triadCtx.stroke();

  triadCtx.fillStyle = '#FCD34D';
  triadCtx.fillText(badgeText, bx + 8, by + 14 * scale);
}

function checkObstacleGizmoHit(mx, my) {
  const obs = getSelectedObstacle();
  if (!obs || !obsGizmoState.screen) return null;
  const s = obsGizmoState.screen;
  const dx = mx - s.ox;
  const dy = my - s.oy;
  const distCenter = Math.sqrt(dx * dx + dy * dy);

  // 1. Centroide (Arrastre Libre 2D)
  if (distCenter <= 16 * s.scale) {
    return 'center-drag';
  }

  // 2. Anillo de rotación (Banda toroidal)
  if (Math.abs(distCenter - s.ringRadius) <= 12 * s.scale) {
    return 'rotate-ring';
  }

  // 3. Eje U
  const duX = s.pU.x - s.ox;
  const duY = s.pU.y - s.oy;
  const lenU = Math.sqrt(duX * duX + duY * duY);
  if (lenU > 1) {
    const projU = (dx * duX + dy * duY) / lenU;
    const perpU = Math.abs(-dx * duY + dy * duX) / lenU;
    if (projU >= 0 && projU <= lenU + 10 && perpU <= 14 * s.scale) {
      return 'u-axis';
    }
  }

  // 4. Eje V
  const dvX = s.pV.x - s.ox;
  const dvY = s.pV.y - s.oy;
  const lenV = Math.sqrt(dvX * dvX + dvY * dvY);
  if (lenV > 1) {
    const projV = (dx * dvX + dy * dvY) / lenV;
    const perpV = Math.abs(-dx * dvY + dy * dvX) / lenV;
    if (projV >= 0 && projV <= lenV + 10 && perpV <= 14 * s.scale) {
      return 'v-axis';
    }
  }

  return null;
}

function pickObstacleUnderCursor(screenPos) {
  if (!Array.isArray(obstacles) || obstacles.length === 0) return null;

  // A. Primero intentar pick 3D nativo de Cesium (entidades de caja, árbol o etiquetas)
  try {
    const pickedObj = scene.pick(screenPos);
    if (pickedObj && pickedObj.id) {
      const entId = typeof pickedObj.id === 'string' ? pickedObj.id : (pickedObj.id.id || '');
      if (entId.startsWith('obs_box_') || entId.startsWith('obs_box_prim_') || entId.startsWith('obs_entity_') ||
          entId.startsWith('obs_tree_trunk_prim_') || entId.startsWith('obs_tree_canopy_prim_') ||
          entId.startsWith('obs_label_')) {
        // [P2] Coincidencia por sufijo exacto (includes podía cruzar ids con prefijos comunes)
        const found = obstacles.find(o => entId === o.id || entId.endsWith('_' + o.id));
        if (found) return found;
      }
    }
  } catch(err) { window.RA && window.RA.log && window.RA.log.warn('[catch silenciado]', err); }

  // B. Proyección de rayo al plano UV de cubierta
  const res = obsComputeUV(screenPos);
  if (res) {
    const activePlIdx = (typeof WP !== 'undefined' && WP) ? WP.activePlaneIdx : -1;
    for (let i = obstacles.length - 1; i >= 0; i--) {
      const obs = obstacles[i];
      if (obs.planeIdx !== undefined && activePlIdx >= 0 && obs.planeIdx !== activePlIdx) continue;
      const du = res.u - (obs.u || 0);
      const dv = res.v - (obs.v || 0);
      const rotRad = Cesium.Math.toRadians(obs.rot || 0);
      const cosR = Math.cos(-rotRad);
      const sinR = Math.sin(-rotRad);
      const locU = du * cosR - dv * sinR;
      const locV = du * sinR + dv * cosR;
      const hw = (obs.w || 1.0) / 2 + 0.4;
      const hl = (obs.l || 1.0) / 2 + 0.4;

      if (Math.abs(locU) <= hw && Math.abs(locV) <= hl) {
        return obs;
      }
    }
  }

  // C. Fallback por proximidad en pantalla con prioridad por tamaño (sin enmascaramiento de obstáculos pequeños)
  let bestCandidate = null;
  let bestScore = Infinity;
  for (let i = obstacles.length - 1; i >= 0; i--) {
    const obs = obstacles[i];
    let pos3D = obs.cartesian || null;
    if (!pos3D) {
      const wp = (typeof getObstacleActivePlane === 'function') ? getObstacleActivePlane(obs) : null;
      if (wp && wp.origin && wp.uVec && wp.vVec) {
        pos3D = Cesium.Cartesian3.add(
          wp.origin,
          Cesium.Cartesian3.add(
            Cesium.Cartesian3.multiplyByScalar(wp.uVec, obs.u || 0, new Cesium.Cartesian3()),
            Cesium.Cartesian3.multiplyByScalar(wp.vVec, obs.v || 0, new Cesium.Cartesian3()),
            new Cesium.Cartesian3()
          ),
          new Cesium.Cartesian3()
        );
      }
    }
    if (pos3D) {
      const pWin = Cesium.SceneTransforms.wgs84ToWindowCoordinates(scene, pos3D);
      if (pWin) {
        const d = Math.hypot(screenPos.x - pWin.x, screenPos.y - pWin.y);
        const radiusPx = Math.max(20, Math.min(50, (obs.w || 1.0) * 12));
        if (d <= radiusPx) {
          const areaScore = (obs.w || 1.0) * (obs.l || 1.0);
          const score = d + areaScore * 2.0;
          if (score < bestScore) {
            bestScore = score;
            bestCandidate = obs;
          }
        }
      }
    }
  }
  if (bestCandidate) return bestCandidate;

  return null;
}

function getObstacleOrientationAxes(baseCenter, roofUVec, isVertical) {
  if (!isVertical || !baseCenter || typeof Cesium === 'undefined') return null;
  const upVec = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(baseCenter, new Cesium.Cartesian3());
  let uHoriz = null;
  if (roofUVec) {
    const dotU = Cesium.Cartesian3.dot(roofUVec, upVec);
    uHoriz = Cesium.Cartesian3.subtract(
      roofUVec,
      Cesium.Cartesian3.multiplyByScalar(upVec, dotU, new Cesium.Cartesian3()),
      new Cesium.Cartesian3()
    );
  }
  if (!uHoriz || Cesium.Cartesian3.magnitude(uHoriz) < 0.001) {
    const enuMat = Cesium.Transforms.eastNorthUpToFixedFrame(baseCenter);
    uHoriz = new Cesium.Cartesian3(enuMat[0], enuMat[1], enuMat[2]);
  }
  uHoriz = Cesium.Cartesian3.normalize(uHoriz, uHoriz);
  const vHoriz = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.cross(upVec, uHoriz, new Cesium.Cartesian3()),
    new Cesium.Cartesian3()
  );
  return { upVec, uHoriz, vHoriz };
}
global.getObstacleOrientationAxes = getObstacleOrientationAxes;
if (typeof window !== 'undefined') window.getObstacleOrientationAxes = getObstacleOrientationAxes;

function computeObstacleRotationMatrix(obs, uVec, vVec, normal) {
  if (!obs || !uVec || !vVec || !normal) return new Cesium.Matrix3();
  const rotDeg = (obs.rot !== undefined ? obs.rot : (obs.rotZ || 0));
  const rotRad = Cesium.Math.toRadians(rotDeg);
  const cosR = Math.cos(rotRad);
  const sinR = Math.sin(rotRad);

  const uRot = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.add(
      Cesium.Cartesian3.multiplyByScalar(uVec, cosR, new Cesium.Cartesian3()),
      Cesium.Cartesian3.multiplyByScalar(vVec, sinR, new Cesium.Cartesian3()),
      new Cesium.Cartesian3()
    ),
    new Cesium.Cartesian3()
  );
  const vRot = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.add(
      Cesium.Cartesian3.multiplyByScalar(uVec, -sinR, new Cesium.Cartesian3()),
      Cesium.Cartesian3.multiplyByScalar(vVec, cosR, new Cesium.Cartesian3()),
      new Cesium.Cartesian3()
    ),
    new Cesium.Cartesian3()
  );
  const normVec = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.cross(uRot, vRot, new Cesium.Cartesian3()),
    new Cesium.Cartesian3()
  );

  if (Cesium.Cartesian3.dot(normVec, normal) < 0) {
    Cesium.Cartesian3.negate(normVec, normVec);
  }

  // Soporte de Rotación 3D Multieje (Roll y Pitch)
  if (obs.rotU) {
    const qU = Cesium.Quaternion.fromAxisAngle(uRot, Cesium.Math.toRadians(obs.rotU));
    const mU = Cesium.Matrix3.fromQuaternion(qU);
    Cesium.Matrix3.multiplyByVector(mU, vRot, vRot);
    Cesium.Matrix3.multiplyByVector(mU, normVec, normVec);
  }
  if (obs.rotV) {
    const qV = Cesium.Quaternion.fromAxisAngle(vRot, Cesium.Math.toRadians(obs.rotV));
    const mV = Cesium.Matrix3.fromQuaternion(qV);
    Cesium.Matrix3.multiplyByVector(mV, uRot, uRot);
    Cesium.Matrix3.multiplyByVector(mV, normVec, normVec);
  }

  Cesium.Cartesian3.normalize(uRot, uRot);
  Cesium.Cartesian3.normalize(vRot, vRot);
  Cesium.Cartesian3.cross(uRot, vRot, normVec);
  if (Cesium.Cartesian3.dot(normVec, normal) < 0) {
    Cesium.Cartesian3.negate(vRot, vRot);
    Cesium.Cartesian3.cross(uRot, vRot, normVec);
  }
  Cesium.Cartesian3.normalize(normVec, normVec);

  return new Cesium.Matrix3(
    uRot.x, vRot.x, normVec.x,
    uRot.y, vRot.y, normVec.y,
    uRot.z, vRot.z, normVec.z
  );
}

function updateObstacleLiveModelMatrix(obs, target) {
  if (!obs || !window._obsPrimitives || !window._obsPrimitives.length) return;
  const wp = (target && target.wp && target.wp.roofWp) || (target && target.wp) || (typeof getObstacleActivePlane === 'function' ? getObstacleActivePlane(obs) : null);
  let baseCenter = null, normal = null, uVec = null, vVec = null;
  if (obs.cartesian) {
    baseCenter = (obs.cartesian instanceof Cesium.Cartesian3) ? obs.cartesian : new Cesium.Cartesian3(obs.cartesian.x, obs.cartesian.y, obs.cartesian.z);
    if (wp && wp.normal && wp.uVec && wp.vVec) {
      normal = Cesium.Cartesian3.normalize(wp.normal, new Cesium.Cartesian3());
      uVec = Cesium.Cartesian3.normalize(wp.uVec, new Cesium.Cartesian3());
      vVec = Cesium.Cartesian3.normalize(wp.vVec, new Cesium.Cartesian3());
    } else {
      normal = Cesium.Cartesian3.normalize(baseCenter, new Cesium.Cartesian3());
      uVec = Cesium.Cartesian3.cross(normal, Cesium.Cartesian3.UNIT_Z, new Cesium.Cartesian3());
      if (Cesium.Cartesian3.magnitude(uVec) < 0.01) {
        uVec = Cesium.Cartesian3.cross(normal, Cesium.Cartesian3.UNIT_X, new Cesium.Cartesian3());
      }
      uVec = Cesium.Cartesian3.normalize(uVec, uVec);
      vVec = Cesium.Cartesian3.normalize(Cesium.Cartesian3.cross(normal, uVec, new Cesium.Cartesian3()), new Cesium.Cartesian3());
    }
  } else if (wp && wp.origin && wp.normal && wp.uVec && wp.vVec) {
    normal = Cesium.Cartesian3.normalize(wp.normal, new Cesium.Cartesian3());
    uVec = Cesium.Cartesian3.normalize(wp.uVec, new Cesium.Cartesian3());
    vVec = Cesium.Cartesian3.normalize(wp.vVec, new Cesium.Cartesian3());
    baseCenter = Cesium.Cartesian3.add(
      wp.origin,
      Cesium.Cartesian3.add(
        Cesium.Cartesian3.multiplyByScalar(uVec, obs.u || 0, new Cesium.Cartesian3()),
        Cesium.Cartesian3.multiplyByScalar(vVec, obs.v || 0, new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
      ),
      new Cesium.Cartesian3()
    );
    if (obs.elevation) {
      baseCenter = Cesium.Cartesian3.add(
        baseCenter,
        Cesium.Cartesian3.multiplyByScalar(normal, obs.elevation, new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
      );
    }
  }
  if (!baseCenter || !normal || !uVec || !vVec) return;

  const isTree = (obs.type === 'tree' || obs.isTree);
  const w = Math.max(obs.w || (isTree ? 3.0 : 1.0), 0.2);
  const l = Math.max(obs.l || (isTree ? 3.0 : 1.0), 0.2);
  const h = Math.max(obs.h || (isTree ? 5.0 : 1.2), 0.2);

  const isVertical = (obs.alignment !== 'coplanar');
  const vertAxes = getObstacleOrientationAxes(baseCenter, uVec, isVertical);
  const effNormal = (isVertical && vertAxes) ? vertAxes.upVec : normal;
  const effUVec = (isVertical && vertAxes) ? vertAxes.uHoriz : uVec;
  const effVVec = (isVertical && vertAxes) ? vertAxes.vHoriz : vVec;

  let sinkOffset = 0;
  if (isVertical && vertAxes) {
    const cosTheta = Math.min(1.0, Math.max(0.0, Math.abs(Cesium.Cartesian3.dot(effNormal, normal))));
    const sinTheta = Math.sqrt(Math.max(0.0, 1.0 - cosTheta * cosTheta));
    sinkOffset = isTree ? 0.35 : Math.max(0.0, 0.5 * Math.hypot(w, l) * sinTheta);
  }

  const rotMatrix = computeObstacleRotationMatrix(obs, effUVec, effVVec, effNormal);

  // 1. Matriz para Caja Estándar
  const boxCenter = Cesium.Cartesian3.add(
    baseCenter,
    Cesium.Cartesian3.multiplyByScalar(effNormal, ((h - sinkOffset) / 2) + 0.05, new Cesium.Cartesian3()),
    new Cesium.Cartesian3()
  );
  const boxMat4 = Cesium.Matrix4.fromRotationTranslation(rotMatrix, boxCenter, new Cesium.Matrix4());

  // 2. Matrices para Árbol (Tronco + Copa)
  let trunkMat4 = null;
  let canopyMat4 = null;
  if (isTree) {
    const trunkH = (h * 0.35) + sinkOffset;
    const canopyH = h * 0.70;
    const trunkCenter = Cesium.Cartesian3.add(
      baseCenter,
      Cesium.Cartesian3.multiplyByScalar(effNormal, ((trunkH - sinkOffset) / 2) + 0.05, new Cesium.Cartesian3()),
      new Cesium.Cartesian3()
    );
    const canopyCenter = Cesium.Cartesian3.add(
      baseCenter,
      Cesium.Cartesian3.multiplyByScalar(effNormal, (h * 0.35) + (canopyH / 2), new Cesium.Cartesian3()),
      new Cesium.Cartesian3()
    );
    trunkMat4 = Cesium.Matrix4.fromRotationTranslation(rotMatrix, trunkCenter, new Cesium.Matrix4());
    canopyMat4 = Cesium.Matrix4.fromRotationTranslation(rotMatrix, canopyCenter, new Cesium.Matrix4());
  }

  // 3. Matriz para Buffer / Retranqueo
  const bufferCenter = Cesium.Cartesian3.add(
    baseCenter,
    Cesium.Cartesian3.multiplyByScalar(normal, 0.025, new Cesium.Cartesian3()),
    new Cesium.Cartesian3()
  );
  const bufferMat4 = Cesium.Matrix4.fromRotationTranslation(rotMatrix, bufferCenter, new Cesium.Matrix4());

  for (let p of window._obsPrimitives) {
    if (p && !p.isDestroyed()) {
      if (p._obsId === obs.id) {
        if (p._isSetbackBuffer) {
          p.modelMatrix = bufferMat4;
        } else if (p._isTreeTrunk) {
          if (trunkMat4) p.modelMatrix = trunkMat4;
        } else if (p._isTreeCanopy) {
          if (canopyMat4) p.modelMatrix = canopyMat4;
        } else {
          p.modelMatrix = boxMat4;
        }
      }
    }
  }
  if (typeof wpCheckObstacleInsideRoof === 'function') {
    wpCheckObstacleInsideRoof(obs);
  }
}
global.updateObstacleLiveModelMatrix = updateObstacleLiveModelMatrix;
if (typeof window !== 'undefined') window.updateObstacleLiveModelMatrix = updateObstacleLiveModelMatrix;

function render3DObstaclesInCesium() {
  if (typeof viewer === 'undefined' || !viewer || !viewer.scene || !viewer.scene.primitives) return;

  if (window._obsEntities) {
    window._obsEntities.forEach(e => {
      try { viewer.entities.remove(e); } catch(err) { window.RA && window.RA.log && window.RA.log.warn('[catch silenciado]', err); }
    });
  }
  window._obsEntities = [];

  window._obsPrimitives = window._obsPrimitives || [];

  if (!Array.isArray(obstacles) || obstacles.length === 0) {
    window._obsPrimitives.forEach(p => {
      try {
        if (p && !p.isDestroyed()) {
          viewer.scene.primitives.remove(p);
        }
      } catch(err) { window.RA && window.RA.log && window.RA.log.warn('[catch silenciado]', err); }
    });
    window._obsPrimitives = [];
    if (viewer.scene && typeof viewer.scene.requestRender === 'function') viewer.scene.requestRender();
    return;
  }

  // 1. Limpiar primitivas huérfanas de obstáculos eliminados
  const activeIds = new Set(obstacles.map(o => o.id));
  const remainingPrimitives = [];
  window._obsPrimitives.forEach(p => {
    if (p && !p.isDestroyed()) {
      if (activeIds.has(p._obsId)) {
        remainingPrimitives.push(p);
      } else {
        try {
          viewer.scene.primitives.remove(p);
        } catch(err) { window.RA && window.RA.log && window.RA.log.warn('[catch silenciado]', err); }
      }
    }
  });
  window._obsPrimitives = remainingPrimitives;

  // 2. Reconciliar o instanciar primitivas para cada obstáculo
  obstacles.forEach((obs, idx) => {
    // Obstáculos especiales delegados a submódulos dedicados
    if (obs.type === 'wind_turbine') return;

    let wp = (typeof getObstacleActivePlane === 'function') ? getObstacleActivePlane(obs) : null;
    
    // Obtener centro base (directo desde obs.cartesian o proyectado en el plano de trabajo)
    let baseCenter = null;
    let normal = null;
    let uVec = null;
    let vVec = null;

    if (wp && wp.origin && wp.normal && wp.uVec && wp.vVec) {
      normal = Cesium.Cartesian3.normalize(wp.normal, new Cesium.Cartesian3());
      uVec = Cesium.Cartesian3.normalize(wp.uVec, new Cesium.Cartesian3());
      vVec = Cesium.Cartesian3.normalize(wp.vVec, new Cesium.Cartesian3());
      baseCenter = Cesium.Cartesian3.add(
        wp.origin,
        Cesium.Cartesian3.add(
          Cesium.Cartesian3.multiplyByScalar(uVec, obs.u || 0, new Cesium.Cartesian3()),
          Cesium.Cartesian3.multiplyByScalar(vVec, obs.v || 0, new Cesium.Cartesian3()),
          new Cesium.Cartesian3()
        ),
        new Cesium.Cartesian3()
      );
      if (obs.elevation) {
        baseCenter = Cesium.Cartesian3.add(
          baseCenter,
          Cesium.Cartesian3.multiplyByScalar(normal, obs.elevation, new Cesium.Cartesian3()),
          new Cesium.Cartesian3()
        );
      }
    } else if (obs.cartesian) {
      baseCenter = (obs.cartesian instanceof Cesium.Cartesian3) ? obs.cartesian : new Cesium.Cartesian3(obs.cartesian.x, obs.cartesian.y, obs.cartesian.z);
      normal = Cesium.Cartesian3.normalize(baseCenter, new Cesium.Cartesian3());
      uVec = Cesium.Cartesian3.cross(normal, Cesium.Cartesian3.UNIT_Z, new Cesium.Cartesian3());
      if (Cesium.Cartesian3.magnitude(uVec) < 0.01) {
        uVec = Cesium.Cartesian3.cross(normal, Cesium.Cartesian3.UNIT_X, new Cesium.Cartesian3());
      }
      uVec = Cesium.Cartesian3.normalize(uVec, uVec);
      vVec = Cesium.Cartesian3.normalize(Cesium.Cartesian3.cross(normal, uVec, new Cesium.Cartesian3()), new Cesium.Cartesian3());
    }

    if (!baseCenter || !normal || !uVec || !vVec) return;

    const isSel = obs.id === selectedObstacleId;
    const isTree = (obs.type === 'tree' || obs.isTree);
    const w = Math.max(obs.w || (isTree ? 3.0 : 1.0), 0.2);
    const l = Math.max(obs.l || (isTree ? 3.0 : 1.0), 0.2);
    const h = Math.max(obs.h || (isTree ? 5.0 : 1.2), 0.2);
    const setbackInput = (typeof document !== 'undefined') ? document.getElementById('cfg-obstacle-setback') : null;
    const defaultSetback = setbackInput ? parseFloat(setbackInput.value) || 0.50 : 0.50;
    const obsSetback = (typeof obs.setback === 'number' && !isNaN(obs.setback)) ? obs.setback : defaultSetback;

    const isVertical = (obs.alignment !== 'coplanar');
    const vertAxes = getObstacleOrientationAxes(baseCenter, uVec, isVertical);
    const effNormal = (isVertical && vertAxes) ? vertAxes.upVec : normal;
    const effUVec = (isVertical && vertAxes) ? vertAxes.uHoriz : uVec;
    const effVVec = (isVertical && vertAxes) ? vertAxes.vHoriz : vVec;

    let sinkOffset = 0;
    if (isVertical && vertAxes) {
      const cosTheta = Math.min(1.0, Math.max(0.0, Math.abs(Cesium.Cartesian3.dot(effNormal, normal))));
      const sinTheta = Math.sqrt(Math.max(0.0, 1.0 - cosTheta * cosTheta));
      sinkOffset = isTree ? 0.35 : Math.max(0.0, 0.5 * Math.hypot(w, l) * sinTheta);
    }
    const effectiveH = h + sinkOffset;

    const alignSig = isVertical ? 'v' : 'c';
    const geomSig = `${obs.type || 'box'}_${w.toFixed(2)}_${l.toFixed(2)}_${effectiveH.toFixed(2)}_${obsSetback.toFixed(2)}_${alignSig}_${isSel ? '1' : '0'}`;

    // Buscar si ya existen primitivas activas para este obstáculo con geometría idéntica
    const existing = window._obsPrimitives.filter(p => p && !p.isDestroyed() && p._obsId === obs.id);
    if (existing.length > 0 && existing[0]._geomSig === geomSig) {
      // Reconciliación: la geometría y materiales son idénticos, actualizar modelMatrix en GPU
      updateObstacleLiveModelMatrix(obs);
      return;
    }

    // Si la firma geométrica cambió, purgar de forma segura las primitivas viejas de este obstáculo
    if (existing.length > 0) {
      existing.forEach(p => {
        try {
          viewer.scene.primitives.remove(p);
        } catch(err) { window.RA && window.RA.log && window.RA.log.warn('[catch silenciado]', err); }
        const pIdx = window._obsPrimitives.indexOf(p);
        if (pIdx >= 0) window._obsPrimitives.splice(pIdx, 1);
      });
    }

    // Cálculo unificado de Matriz de Rotación 3D (Roll, Pitch, Yaw)
    const rotMatrix = computeObstacleRotationMatrix(obs, effUVec, effVVec, effNormal);

    if (isTree) {
      // ══════════════════════════════════════════════════════════════════════
      // 🌳 RENDERIZADO VOLUMÉTRICO GPU DE ÁRBOL (TRONCO + COPA)
      // ══════════════════════════════════════════════════════════════════════
      const trunkH = (h * 0.35) + sinkOffset;
      const trunkW = Math.max(w * 0.20, 0.25);
      const trunkL = Math.max(l * 0.20, 0.25);
      const canopyH = h * 0.70;

      const trunkCenter = Cesium.Cartesian3.add(
        baseCenter,
        Cesium.Cartesian3.multiplyByScalar(effNormal, ((trunkH - sinkOffset) / 2) + 0.05, new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
      );

      const canopyCenter = Cesium.Cartesian3.add(
        baseCenter,
        Cesium.Cartesian3.multiplyByScalar(effNormal, (h * 0.35) + (canopyH / 2), new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
      );

      const trunkColor = Cesium.Color.fromCssColorString('#5C4033').withAlpha(0.95);
      const canopyColor = isSel
        ? Cesium.Color.fromCssColorString('#F59E0B').withAlpha(0.90)
        : Cesium.Color.fromCssColorString('#16A34A').withAlpha(0.88);

      // 1. Tronco Primitive (Cilíndrico realista de madera)
      if (typeof Cesium.Matrix4 !== "undefined" && typeof Cesium.Matrix4.fromRotationTranslation === "function") {
        try {
          const trunkMat4 = Cesium.Matrix4.fromRotationTranslation(rotMatrix, trunkCenter, new Cesium.Matrix4());
          const trunkGeom = (typeof Cesium.CylinderGeometry !== "undefined")
            ? new Cesium.CylinderGeometry({
                length: trunkH,
                topRadius: trunkW / 2,
                bottomRadius: (trunkW * 1.25) / 2,
                vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT
              })
            : Cesium.BoxGeometry.fromDimensions({
                vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
                dimensions: new Cesium.Cartesian3(trunkW, trunkL, trunkH)
              });

          const trunkInst = new Cesium.GeometryInstance({
            id: "obs_tree_trunk_prim_" + obs.id,
            geometry: trunkGeom,
            attributes: {
              color: Cesium.ColorGeometryInstanceAttribute.fromColor(trunkColor)
            }
          });
          const trunkPrim = viewer.scene.primitives.add(new Cesium.Primitive({
            geometryInstances: trunkInst,
            modelMatrix: trunkMat4,
            appearance: new Cesium.PerInstanceColorAppearance({ translucent: false, closed: true }),
            shadows: Cesium.ShadowMode.ENABLED,
            asynchronous: false
          }));
          trunkPrim._obsId = obs.id;
          trunkPrim._isTreeTrunk = true;
          trunkPrim._geomSig = geomSig;
          window._obsPrimitives.push(trunkPrim);

          // 2. Copa Primitive con Forma de Huevo / Ovoide (EllipsoidGeometry) en Verde Follaje
          const canopyMat4 = Cesium.Matrix4.fromRotationTranslation(rotMatrix, canopyCenter, new Cesium.Matrix4());
          const canopyGeom = (typeof Cesium.EllipsoidGeometry !== "undefined")
            ? new Cesium.EllipsoidGeometry({
                radii: new Cesium.Cartesian3(w / 2, l / 2, canopyH / 2),
                vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT
              })
            : Cesium.BoxGeometry.fromDimensions({
                vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
                dimensions: new Cesium.Cartesian3(w, l, canopyH)
              });

          const canopyInst = new Cesium.GeometryInstance({
            id: "obs_tree_canopy_prim_" + obs.id,
            geometry: canopyGeom,
            attributes: {
              color: Cesium.ColorGeometryInstanceAttribute.fromColor(canopyColor)
            }
          });
          const canopyPrim = viewer.scene.primitives.add(new Cesium.Primitive({
            geometryInstances: canopyInst,
            modelMatrix: canopyMat4,
            appearance: new Cesium.PerInstanceColorAppearance({ translucent: false, closed: true }),
            shadows: Cesium.ShadowMode.ENABLED,
            asynchronous: false
          }));
          canopyPrim._obsId = obs.id;
          canopyPrim._isTreeCanopy = true;
          canopyPrim._geomSig = geomSig;
          window._obsPrimitives.push(canopyPrim);
        } catch(ePrim) {
          window.RA && window.RA.log && window.RA.log.debug("[3D Tree] Error creating GPU Primitive:", ePrim);
        }
      }

      // [AAA GIZMO UNIFICADO]: Las etiquetas interactivas se gestionan exclusivamente en renderUniversalGizmo2D

    } else {
      // ══════════════════════════════════════════════════════════════════════
      // 🧱 RENDERIZADO GPU DE OBSTÁCULOS ESTÁNDAR (CASETÓN, CHIMENEA, HVAC)
      // ══════════════════════════════════════════════════════════════════════
      const boxCenter = Cesium.Cartesian3.add(
        baseCenter,
        Cesium.Cartesian3.multiplyByScalar(effNormal, ((h - sinkOffset) / 2) + 0.05, new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
      );

      let hexColor = '#DC2626';
      if (obs.type === 'caseton') hexColor = '#2563EB';
      else if (obs.type === 'hvac') hexColor = '#059669';
      else if (obs.type === 'custom') hexColor = '#7C3AED';
      if (isSel) hexColor = '#F59E0B';

      const boxColor = Cesium.Color.fromCssColorString(hexColor).withAlpha(0.88);

      if (typeof Cesium.Matrix4 !== "undefined" && typeof Cesium.Matrix4.fromRotationTranslation === "function") {
        try {
          const boxMat4 = Cesium.Matrix4.fromRotationTranslation(rotMatrix, boxCenter, new Cesium.Matrix4());
          const boxInst = new Cesium.GeometryInstance({
            id: "obs_box_prim_" + obs.id,
            geometry: Cesium.BoxGeometry.fromDimensions({
              vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
              dimensions: new Cesium.Cartesian3(w, l, effectiveH)
            }),
            attributes: {
              color: Cesium.ColorGeometryInstanceAttribute.fromColor(boxColor)
            }
          });
          const boxPrim = viewer.scene.primitives.add(new Cesium.Primitive({
            geometryInstances: boxInst,
            modelMatrix: boxMat4,
            appearance: new Cesium.PerInstanceColorAppearance({ translucent: false, closed: true }),
            shadows: Cesium.ShadowMode.ENABLED,
            asynchronous: false
          }));
          boxPrim._obsId = obs.id;
          boxPrim._geomSig = geomSig;
          window._obsPrimitives.push(boxPrim);
        } catch(eBoxPrim) {
          window.RA && window.RA.log && window.RA.log.debug("[3D Obstacle] Error creating GPU Primitive:", eBoxPrim);
        }
      }

      // [AAA GIZMO UNIFICADO]: Las etiquetas interactivas se gestionan exclusivamente en renderUniversalGizmo2D
    }

    // ══════════════════════════════════════════════════════════════════════
    // 🛡️ ZONA DE EXCLUSIÓN 3D (BUFFER DE SEGURIDAD / RETRANQUEO NORMATIVO)
    // ══════════════════════════════════════════════════════════════════════

    if (obsSetback > 0.01 && typeof Cesium.Matrix4 !== 'undefined' && typeof Cesium.Matrix4.fromRotationTranslation === 'function') {
      try {
        const bufferCenter = Cesium.Cartesian3.add(
          baseCenter,
          Cesium.Cartesian3.multiplyByScalar(normal, 0.025, new Cesium.Cartesian3()),
          new Cesium.Cartesian3()
        );
        const bufferMat4 = Cesium.Matrix4.fromRotationTranslation(rotMatrix, bufferCenter, new Cesium.Matrix4());

        let bufferGeom;
        if (isTree && typeof Cesium.CylinderGeometry !== 'undefined') {
          bufferGeom = new Cesium.CylinderGeometry({
            length: 0.04,
            topRadius: (w / 2) + obsSetback,
            bottomRadius: (w / 2) + obsSetback,
            vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT
          });
        } else {
          bufferGeom = Cesium.BoxGeometry.fromDimensions({
            vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
            dimensions: new Cesium.Cartesian3(w + 2 * obsSetback, l + 2 * obsSetback, 0.04)
          });
        }

        const bufferColor = isSel
          ? Cesium.Color.fromCssColorString('#F59E0B').withAlpha(0.26)
          : Cesium.Color.fromCssColorString('#F59E0B').withAlpha(0.14);

        const bufferInst = new Cesium.GeometryInstance({
          id: 'obs_buffer_prim_' + obs.id,
          geometry: bufferGeom,
          attributes: {
            color: Cesium.ColorGeometryInstanceAttribute.fromColor(bufferColor)
          }
        });

        const bufferPrim = viewer.scene.primitives.add(new Cesium.Primitive({
          geometryInstances: bufferInst,
          modelMatrix: bufferMat4,
          appearance: new Cesium.PerInstanceColorAppearance({ translucent: true, closed: true }),
          shadows: Cesium.ShadowMode.DISABLED,
          asynchronous: false
        }));
        bufferPrim._obsId = obs.id;
        bufferPrim._isSetbackBuffer = true;
        bufferPrim._geomSig = geomSig;
        window._obsPrimitives.push(bufferPrim);
      } catch(eBuf) {
        window.RA && window.RA.log && window.RA.log.debug('[3D Obstacle Buffer] Error creating GPU Primitive:', eBuf);
      }
    }
  });

  if (typeof window !== "undefined" && window.RAWindTurbine && typeof window.RAWindTurbine.renderAll === "function") {
    window.RAWindTurbine.renderAll();
  }

  if (typeof viewer !== "undefined" && viewer.scene && typeof viewer.scene.requestRender === "function") {
    viewer.scene.requestRender();
  }
}

function scaleSelectedObstacleAxis(axis, factor) {
  if (!selectedObstacleId) return;
  const obs = obstacles.find(o => o.id === selectedObstacleId);
  if (!obs) return;

  if (obs.type === 'wind_turbine' && typeof window !== 'undefined' && window.RAWindTurbine && typeof window.RAWindTurbine.applyScaleAxis === 'function') {
    window.RAWindTurbine.applyScaleAxis(obs, axis, factor);
    return;
  }

  if (axis === 'x') {
    obs.w = Math.max(0.2, Math.round((obs.w || 1.0) * factor * 10) / 10);
  } else if (axis === 'y') {
    obs.l = Math.max(0.2, Math.round((obs.l || 1.0) * factor * 10) / 10);
  } else if (axis === 'z') {
    obs.h = Math.max(0.2, Math.round((obs.h || 1.2) * factor * 10) / 10);
  }

  const wEl = document.getElementById('obs-width');
  const lEl = document.getElementById('obs-length');
  const hEl = document.getElementById('obs-height');
  if (wEl) wEl.value = (obs.w || 1.0).toFixed(2);
  if (lEl) lEl.value = (obs.l || 1.0).toFixed(2);
  if (hEl) hEl.value = (obs.h || 1.2).toFixed(2);

  const sumEl = document.getElementById('obs-scale-summary');
  if (sumEl) sumEl.textContent = obs.w.toFixed(1) + 'm · ' + obs.l.toFixed(1) + 'm · ' + obs.h.toFixed(1) + 'm';

  render3DObstaclesInCesium();
  if (typeof wpUpdateSolarSimulation === 'function') wpUpdateSolarSimulation();
  if (typeof window !== 'undefined' && typeof window.wpInvalidateHeatmap === 'function') {
    window.wpInvalidateHeatmap('Escala de obstáculo modificada');
  }
  showStatus('ESCALA ' + axis.toUpperCase() + ' AJUSTADA: ' + (axis === 'x' ? obs.w : (axis === 'y' ? obs.l : obs.h)).toFixed(2) + 'm', 1200);
}

function nudgeSelectedObstacleDim(dim, delta) {
  if (!selectedObstacleId) return;
  const obs = obstacles.find(o => o.id === selectedObstacleId);
  if (!obs) return;

  if (obs.type === 'wind_turbine' && typeof window !== 'undefined' && window.RAWindTurbine && typeof window.RAWindTurbine.applyNudgeDim === 'function') {
    window.RAWindTurbine.applyNudgeDim(obs, dim, delta);
    return;
  }

  if (dim === 'w') {
    obs.w = Math.max(0.2, Math.round(((obs.w || 1.0) + delta) * 10) / 10);
  } else if (dim === 'l') {
    obs.l = Math.max(0.2, Math.round(((obs.l || 1.0) + delta) * 10) / 10);
  } else if (dim === 'h') {
    obs.h = Math.max(0.2, Math.round(((obs.h || 1.2) + delta) * 10) / 10);
  }

  const wEl = document.getElementById('obs-width');
  const lEl = document.getElementById('obs-length');
  const hEl = document.getElementById('obs-height');
  if (wEl) wEl.value = (obs.w || 1.0).toFixed(2);
  if (lEl) lEl.value = (obs.l || 1.0).toFixed(2);
  if (hEl) hEl.value = (obs.h || 1.2).toFixed(2);

  const sumEl = document.getElementById('obs-scale-summary');
  if (sumEl) sumEl.textContent = obs.w.toFixed(1) + 'm · ' + obs.l.toFixed(1) + 'm · ' + obs.h.toFixed(1) + 'm';

  render3DObstaclesInCesium();
  if (typeof wpUpdateSolarSimulation === 'function') wpUpdateSolarSimulation();
  if (typeof window !== 'undefined' && typeof window.wpInvalidateHeatmap === 'function') {
    window.wpInvalidateHeatmap('Dimensión de obstáculo ajustada');
  }
  showStatus('DIMENSIÓN ' + dim.toUpperCase() + ' AJUSTADA: ' + (dim === 'w' ? obs.w : (dim === 'l' ? obs.l : obs.h)).toFixed(2) + 'm', 1200);
}

function rotateSelectedObstacle(degDelta) {
  if (!selectedObstacleId) return;
  const obs = obstacles.find(o => o.id === selectedObstacleId);
  if (!obs) return;
  obs.rot = ((obs.rot || 0) + degDelta) % 360;
  if (obs.rot < 0) obs.rot += 360;
  const rotLbl = document.getElementById('obs-selected-rot-lbl');
  if (rotLbl) rotLbl.textContent = 'Giro: ' + obs.rot + '°';
  recalculateLayoutAndObstacles();
  showStatus('OBSTÁCULO ROTADO A ' + obs.rot + '°', 1500);
}

function nudgeSelectedObstacle(axis, meters) {
  if (!selectedObstacleId) return;
  const obs = obstacles.find(o => o.id === selectedObstacleId);
  if (!obs) return;
  if (axis === 'u') obs.u = (obs.u || 0) + meters;
  if (axis === 'v') obs.v = (obs.v || 0) + meters;
  recalculateLayoutAndObstacles();
  showStatus('OBSTÁCULO DESPLAZADO ' + (meters > 0 ? '+' : '') + meters + 'm EN EJE ' + axis.toUpperCase(), 1500);
}

function selectObstacle(obsId) {
  selectedObstacleId = obsId;
  global.selectedObstacleId = obsId;
  if (typeof window !== 'undefined') window.selectedObstacleId = obsId;

  if (obsId) {
    if (typeof global.selectedPanelIndex !== 'undefined') global.selectedPanelIndex = -1;
    if (typeof window !== 'undefined' && typeof window.selectedPanelIndex !== 'undefined') window.selectedPanelIndex = -1;
    if (typeof global.selectedElectricalId !== 'undefined') global.selectedElectricalId = null;
    if (typeof window !== 'undefined' && typeof window.selectedElectricalId !== 'undefined') window.selectedElectricalId = null;
    if (typeof global.selectedBuildingId !== 'undefined') global.selectedBuildingId = null;
    if (typeof window !== 'undefined' && typeof window.selectedBuildingId !== 'undefined') window.selectedBuildingId = null;
    if (typeof WP !== 'undefined' && WP) { WP.selectedVtxIdx = -1; }
    if (typeof global.selectedVertexIndex !== 'undefined') global.selectedVertexIndex = -1;
    if (typeof window !== 'undefined' && typeof window.selectedVertexIndex !== 'undefined') window.selectedVertexIndex = -1;
    if (typeof wpSyncVertexInputs === 'function') wpSyncVertexInputs();
  }

  const obs = obstacles.find(o => o.id === obsId);
  const ed = document.getElementById('obstacle-selected-editor');
  const dropdown = document.getElementById('wp-obstacles-dropdown');
  const rotLbl = document.getElementById('obs-selected-rot-lbl');

  if (dropdown && obsId) dropdown.value = obsId;

  if (!obs) {
    if (ed) ed.style.display = 'none';
    render3DObstaclesInCesium();
    if (typeof renderTriad2D === 'function') renderTriad2D();
    return;
  }

  if (ed) ed.style.display = 'flex';
  setElemText('obs-selected-title', (obs.name || 'OBSTÁCULO').toUpperCase());
  if (rotLbl) rotLbl.textContent = 'Giro: ' + (obs.rot || 0) + '°';

  const wEl = document.getElementById('obs-width');
  const lEl = document.getElementById('obs-length');
  const hEl = document.getElementById('obs-height');
  if (wEl) wEl.value = (obs.w || 1.0).toFixed(2);
  if (lEl) lEl.value = (obs.l || 1.0).toFixed(2);
  if (hEl) hEl.value = (obs.h || 1.2).toFixed(2);

  const btnVert = document.getElementById('obs-align-vertical-btn');
  const btnCopl = document.getElementById('obs-align-coplanar-btn');
  const isVert = (obs.alignment !== 'coplanar');
  if (btnVert) {
    btnVert.style.background = isVert ? 'var(--amber-400)' : '';
    btnVert.style.color = isVert ? '#0F172A' : '';
    btnVert.style.borderColor = isVert ? 'var(--amber-400)' : '';
    btnVert.style.fontWeight = isVert ? 'bold' : 'normal';
  }
  if (btnCopl) {
    btnCopl.style.background = !isVert ? 'var(--amber-400)' : '';
    btnCopl.style.color = !isVert ? '#0F172A' : '';
    btnCopl.style.borderColor = !isVert ? 'var(--amber-400)' : '';
    btnCopl.style.fontWeight = !isVert ? 'bold' : 'normal';
  }

  render3DObstaclesInCesium();
  if (typeof renderTriad2D === 'function') renderTriad2D();
  if (typeof wpCheckObstacleInsideRoof === 'function') wpCheckObstacleInsideRoof(obs);
  showStatus('OBSTÁCULO "' + (obs.name || '').toUpperCase() + '" SELECCIONADO', 1800);
}

function setSelectedObstacleAlignment(alignment) {
  if (!selectedObstacleId) return;
  const obs = obstacles.find(o => o.id === selectedObstacleId);
  if (!obs) return;
  obs.alignment = (alignment === 'coplanar') ? 'coplanar' : 'vertical';
  selectObstacle(obs.id);
  recalculateLayoutAndObstacles();
  showStatus('ALINEACIÓN CAMBIADA A: ' + (obs.alignment === 'vertical' ? '🏛️ A PLOMO' : '📐 COPLANAR'), 1800);
}
global.setSelectedObstacleAlignment = setSelectedObstacleAlignment;
if (typeof window !== 'undefined') window.setSelectedObstacleAlignment = setSelectedObstacleAlignment;

let _obsPropsDebounceTimer = null;

function updateSelectedObstacleProps() {
  if (!selectedObstacleId) return;
  const obs = obstacles.find(o => o.id === selectedObstacleId);
  if (!obs) return;

  if (obs.type === 'wind_turbine' && typeof window !== 'undefined' && window.RAWindTurbine && typeof window.RAWindTurbine.onGeneralDimInput === 'function') {
    window.RAWindTurbine.onGeneralDimInput(obs);
    return;
  }

  const wEl = document.getElementById('obs-width');
  const lEl = document.getElementById('obs-length');
  const hEl = document.getElementById('obs-height');
  if (wEl) obs.w = Math.max(parseFloat(wEl.value) || 0.5, 0.1);
  if (lEl) obs.l = Math.max(parseFloat(lEl.value) || 0.5, 0.1);
  if (hEl) obs.h = Math.max(parseFloat(hEl.value) || 1.0, 0.1);

  // 1. Actualización visual inmediata y ligera del modelo 3D del obstáculo
  if (typeof render3DObstaclesInCesium === 'function') {
    render3DObstaclesInCesium();
  }

  // 2. Debounce del recálculo pesado de layout de paneles e invalidación solar (180ms)
  if (_obsPropsDebounceTimer) {
    clearTimeout(_obsPropsDebounceTimer);
  }
  _obsPropsDebounceTimer = setTimeout(() => {
    _obsPropsDebounceTimer = null;
    if (typeof window !== 'undefined' && typeof window.wpInvalidateHeatmap === 'function') {
      window.wpInvalidateHeatmap('Dimensiones de obstáculo modificadas');
    }
    recalculateLayoutAndObstacles();
  }, 180);
}

function deleteSelectedObstacle() {
  if (!selectedObstacleId) return;
  const name = (obstacles.find(o => o.id === selectedObstacleId) || {}).name || 'OBSTÁCULO';
  if (global.RAundo) global.RAundo.snapObstacles();
  obstacles = obstacles.filter(o => o.id !== selectedObstacleId);
  global.obstacles = obstacles;
  if (typeof window !== 'undefined') window.obstacles = obstacles;
  // [P0] Sin auto-selección del siguiente obstáculo: con Supr repetido se borraba
  // toda la lista en cascada sin re-selección explícita del usuario.
  selectedObstacleId = null;
  global.selectedObstacleId = null;
  if (typeof window !== 'undefined') window.selectedObstacleId = null;
  if (typeof render3DObstaclesInCesium === 'function') render3DObstaclesInCesium();
  recalculateLayoutAndObstacles();
  if (typeof ProjectHierarchy !== 'undefined' && ProjectHierarchy && typeof ProjectHierarchy.notify === 'function') {
    ProjectHierarchy.notify('obstacle_deleted');
  }
  showStatus('🗑 ' + name.toUpperCase() + ' ELIMINADO · CTRL+Z PARA DESHACER', 2600);
}

function startObstaclePlacement(type) {
  const plane = (typeof wpGetActivePlane === 'function') ? wpGetActivePlane() : null;
  if (!plane) {
    cancelObstaclePlacement();
    if (typeof showToast === 'function') {
      showToast('PLANO DE TRABAJO REQUERIDO', 'Para colocar objetos 3D, primero define el plano de la cubierta en 3 clics (P1, P2, P3).', 'info', 4500);
    }
    showStatus('🎯 PASO 1: HAZ CLIC EN 3 PUNTOS SOBRE LA CUBIERTA (P1, P2, P3) PARA CREAR EL PLANO', 4500);
    if (typeof wpGoToStep === 'function') wpGoToStep(1);
    if (typeof wpStartDefinePlane === 'function') wpStartDefinePlane();
    return;
  }

  wpAutoMinimizeSolarHUD('obs-placement');

  // Si había una polilínea abierta con ≥3 vértices, cerrarla automáticamente
  if (typeof WP !== 'undefined' && WP) {
    if (WP.mode === 'draw-poly' && WP.activePolyPts && WP.activePolyPts.length >= 3) {
      wpCloseActivePolyline();
    } else if (WP.mode !== 'idle') {
      wpCancelCurrentMode();
    }
    WP.mode = 'place-obs';
  }
  if (typeof appMode !== 'undefined' && appMode === 'draw') {
    if (typeof setAppMode === 'function') setAppMode('navigate', false);
    else appMode = 'navigate';
  }

  if (obsPlacement.active && obsPlacement.type === type) {
    cancelObstaclePlacement();
    return;
  }
  cancelObstaclePlacement();
  if (typeof selectObstacle === 'function') selectObstacle(null);
  if (typeof selectPanel === 'function') selectPanel(-1);
  if (typeof selectElectricalObject === 'function') selectElectricalObject(null);
  if (typeof selectBuilding === 'function') selectBuilding(null);
  obsPlacement.active = true;
  obsPlacement.type = type;
  if (scene && scene.screenSpaceCameraController) {
    scene.screenSpaceCameraController.enableRotate = true;
    scene.screenSpaceCameraController.enableTranslate = true;
  }
  updateObstaclePlacementUI();
  const defName = (OBSTACLE_DEFS[type] ? OBSTACLE_DEFS[type].name : type).toUpperCase();
  showStatus('COLOCA ' + defName + ': MUEVE EL RATÓN SOBRE LA CUBIERTA Y HAZ CLIC PARA FIJARLO', 5000);
}

function cancelObstaclePlacement() {
  obsPlacement.active = false;
  wpAutoRestoreSolarHUD('obs-placement-cancelled');
  obsPlacement.type = null;
  obsClearGhost();
  if (typeof WP !== "undefined" && WP && WP.mode === 'place-obs') {
    WP.mode = 'idle';
  }
  if (typeof appMode !== "undefined" && appMode === 'draw') {
    if (typeof setAppMode === 'function') setAppMode('navigate', false);
    else appMode = 'navigate';
  }
  if (scene && scene.screenSpaceCameraController) {
    scene.screenSpaceCameraController.enableRotate = true;
    scene.screenSpaceCameraController.enableTranslate = true;
  }
  updateObstaclePlacementUI();
}

function updateObstaclePlacementUI() {
  const hint = document.getElementById('obstacle-placement-hint');
  if (hint) hint.style.display = obsPlacement.active ? 'flex' : 'none';
  ['chimenea', 'caseton', 'hvac', 'tree', 'custom'].forEach(t => {
    const btn = document.getElementById('obs-btn-' + t);
    if (btn) btn.style.background = (obsPlacement.active && obsPlacement.type === t) ? 'var(--amber-400)' : '';
  });

  const selectorContainer = document.getElementById('wp-obstacles-selector-container');
  const dropdown = document.getElementById('wp-obstacles-dropdown');
  const countPill = document.getElementById('wp-obstacles-count-pill');
  if (selectorContainer && dropdown) {
    if (obstacles.length > 0) {
      selectorContainer.style.display = 'block';
      if (countPill) countPill.textContent = obstacles.length + (obstacles.length === 1 ? ' OBSTÁCULO' : ' OBSTÁCULOS');
      dropdown.innerHTML = obstacles.map((obs, idx) =>
        '<option value="' + obs.id + '"' + (obs.id === selectedObstacleId ? ' selected' : '') + '>' +
          (obs.id === selectedObstacleId ? '★ ' : '') + '#' + (idx + 1) + ' ' + obs.name + ' (' + obs.w + '×' + obs.l + '×' + obs.h + 'm · ' + (obs.rot || 0) + '°)' +
        '</option>'
      ).join('');
    } else {
      selectorContainer.style.display = 'none';
    }
  }
}

function obsClearGhost() {
  obsPlacement.ghost.forEach(e => viewer.entities.remove(e));
  obsPlacement.ghost = [];
  obsPlacement.cursor.forEach(e => viewer.entities.remove(e));
  obsPlacement.cursor = [];
}

function obsRenderGhost() {
  // [P3] Coalescing por frame: antes hacía clear + re-add de ~7 entidades en CADA
  // MOUSE_MOVE. Con rAF solo se redibuja una vez por frame con las últimas coords.
  if (global._obsGhostRafPending) return;
  global._obsGhostRafPending = true;
  const raf = (typeof requestAnimationFrame === 'function') ? requestAnimationFrame : function(fn) { fn(); };
  raf(function() {
    global._obsGhostRafPending = false;
    obsRenderGhostNow();
  });
}

function obsRenderGhostNow() {
  obsClearGhost();
  const res = obsComputeUV({ x: obsPlacement.lastX, y: obsPlacement.lastY });
  if (!res) return;
  const def = OBSTACLE_DEFS[obsPlacement.type] || OBSTACLE_DEFS.custom;
  const isVertical = (def.alignment !== 'coplanar');
  const hw = def.w / 2, hl = def.l / 2, h = def.h;

  const baseCenter = Cesium.Cartesian3.add(
    res.wp.origin,
    Cesium.Cartesian3.add(
      Cesium.Cartesian3.multiplyByScalar(res.wp.uVec, res.u, new Cesium.Cartesian3()),
      Cesium.Cartesian3.multiplyByScalar(res.wp.vVec, res.v, new Cesium.Cartesian3()),
      new Cesium.Cartesian3()
    ),
    new Cesium.Cartesian3()
  );
  const vertAxes = getObstacleOrientationAxes(baseCenter, res.wp.uVec, isVertical);
  const upVec = (isVertical && vertAxes) ? vertAxes.upVec : res.wp.normal;

  const localCorners = [
    { u: -hw, v: -hl },
    { u:  hw, v: -hl },
    { u:  hw, v:  hl },
    { u: -hw, v:  hl }
  ];

  const basePts = localCorners.map(c => {
    const ptOnPlane = Cesium.Cartesian3.add(
      res.wp.origin,
      Cesium.Cartesian3.add(
        Cesium.Cartesian3.multiplyByScalar(res.wp.uVec, res.u + c.u, new Cesium.Cartesian3()),
        Cesium.Cartesian3.multiplyByScalar(res.wp.vVec, res.v + c.v, new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
      ),
      new Cesium.Cartesian3()
    );
    return Cesium.Cartesian3.add(ptOnPlane, Cesium.Cartesian3.multiplyByScalar(res.wp.normal, 0.03, new Cesium.Cartesian3()), new Cesium.Cartesian3());
  });
  const topPts = basePts.map(bp => Cesium.Cartesian3.add(bp, Cesium.Cartesian3.multiplyByScalar(upVec, h, new Cesium.Cartesian3()), new Cesium.Cartesian3()));

  const ghostMat = Cesium.Color.fromCssColorString('#38BDF8').withAlpha(0.45);
  obsPlacement.ghost.push(viewer.entities.add({
    polygon: { hierarchy: new Cesium.PolygonHierarchy(basePts), material: ghostMat, perPositionHeight: true }
  }));
  obsPlacement.ghost.push(viewer.entities.add({
    polygon: { hierarchy: new Cesium.PolygonHierarchy(topPts), material: ghostMat, perPositionHeight: true }
  }));
  for (let i = 0; i < 4; i++) {
    const next = (i + 1) % 4;
    obsPlacement.ghost.push(viewer.entities.add({
      polygon: { hierarchy: new Cesium.PolygonHierarchy([basePts[i], basePts[next], topPts[next], topPts[i]]), material: ghostMat, perPositionHeight: true }
    }));
  }
}

function obsPlaceAt(screenPos) {
  // Guardia: sin colocación activa no hay tipo ni dimensiones — ignorar el clic
  if (!obsPlacement || !obsPlacement.active || !obsPlacement.type) return false;
  const res = obsComputeUV(screenPos);
  if (!res) return false;
  const def = OBSTACLE_DEFS[obsPlacement.type] || OBSTACLE_DEFS.custom;
  const obs = {
    id: "obs_" + Date.now() + "-" + (global._obsIdSeq = (global._obsIdSeq || 0) + 1), // [P2] id único garantizado (antes colisionaban ids del mismo ms)
    name: def.name + " #" + (obstacles.length + 1),
    type: obsPlacement.type,
    planeIdx: (typeof WP !== "undefined" ? WP.activePlaneIdx : -1),
    polyIdx: (typeof WP !== "undefined" ? WP.selectedPolyIdx : -1),
    cartesian: res.hit ? Cesium.Cartesian3.clone(res.hit) : null,
    u: res.u,
    v: res.v,
    w: def.w,
    l: def.l,
    h: def.h,
    rot: 0,
    alignment: def.alignment || 'vertical'
  };
  if (global.RAundo && typeof global.RAundo.snapObstacles === 'function') {
    global.RAundo.snapObstacles('Añadir ' + (def.name || 'obstáculo'));
  }
  obstacles.push(obs);
  selectedObstacleId = obs.id;
  recalculateLayoutAndObstacles();
  selectObstacle(obs.id);
  cancelObstaclePlacement();
  if (typeof WP !== "undefined" && WP) {
    WP.mode = 'idle';
  }
  if (typeof appMode !== "undefined" && appMode === 'draw') {
    if (typeof setAppMode === 'function') setAppMode('navigate', false);
    else appMode = 'navigate';
  }
  wpAutoRestoreSolarHUD('obs-placed');
  if (typeof ProjectHierarchy !== 'undefined' && ProjectHierarchy && typeof ProjectHierarchy.notify === 'function') {
    ProjectHierarchy.notify('obstacle_placed', { obstacle: obs });
  }
  showStatus("✓ " + obs.name.toUpperCase() + " FIJADO SOBRE LA CUBIERTA", 2500);
  return true;
}

function recalculateLayoutAndObstacles() {
  updateObstaclePlacementUI();
  setElemText('obstacles-count-badge', `${obstacles.length} OBSTÁCULO${obstacles.length === 1 ? '' : 'S'}`);

  // 🚀 SINCRONIZACIÓN 3D REACTIVA: Asegurar que obs.cartesian siempre refleje los valores actuales de (u, v)
  if (Array.isArray(obstacles)) {
    obstacles.forEach(obs => {
      if (typeof obs.u === 'number' && typeof obs.v === 'number') {
        const wp = (typeof getObstacleActivePlane === 'function') ? getObstacleActivePlane(obs) : null;
        if (wp && wp.origin && wp.uVec && wp.vVec) {
          let newCart = Cesium.Cartesian3.add(
            wp.origin,
            Cesium.Cartesian3.add(
              Cesium.Cartesian3.multiplyByScalar(wp.uVec, obs.u, new Cesium.Cartesian3()),
              Cesium.Cartesian3.multiplyByScalar(wp.vVec, obs.v, new Cesium.Cartesian3()),
              new Cesium.Cartesian3()
            ),
            new Cesium.Cartesian3()
          );
          if (obs.elevation && wp.normal) {
            newCart = Cesium.Cartesian3.add(
              newCart,
              Cesium.Cartesian3.multiplyByScalar(wp.normal, obs.elevation, new Cesium.Cartesian3()),
              new Cesium.Cartesian3()
            );
          }
          obs.cartesian = newCart;
        }
      }
    });
  }

  render3DObstaclesInCesium();

  // [P0] La geometría cambió (obstáculo añadido/movido/editado): invalidar el heatmap anual
  if (typeof window.wpInvalidateHeatmap === 'function') window.wpInvalidateHeatmap('Obstáculos o trazado modificados');

  // 🚀 INVALIDACIÓN DE CACHÉ DE PANELES (Garantiza re-filtrado de colisiones 2D/3D con obstáculos)
  if (typeof roofPanelsCache !== 'undefined' && roofPanelsCache) {
    roofPanelsCache.sig = '';
    roofPanelsCache.data = null;
  }
  if (typeof WP !== 'undefined' && WP && Array.isArray(WP.polylines)) {
    WP.polylines.forEach(pl => { if (pl) pl.roofInfo = null; });
  }

  const hasPolys = typeof WP !== 'undefined' && WP && Array.isArray(WP.polylines) && WP.polylines.some(pl => pl && pl.points && pl.points.length >= 3);
  const hasPolygonPts = typeof polygonPoints !== 'undefined' && Array.isArray(polygonPoints) && polygonPoints.length >= 3;

  if (hasPolys || hasPolygonPts) {
    const hasPanelsInScene = (typeof simulatedPanelEntities !== 'undefined' && Array.isArray(simulatedPanelEntities) && simulatedPanelEntities.length > 0) ||
                             (typeof window !== 'undefined' && window.simulatedPanelsPrimitive);
    const shouldSimulatePanels = hasPanelsInScene || (typeof isPolygonDesignConfirmed !== 'undefined' && isPolygonDesignConfirmed) || (typeof wpCurrentStep !== 'undefined' && wpCurrentStep >= 2);

    if (shouldSimulatePanels) {
      if (typeof recalculateSolarYield === 'function') {
        recalculateSolarYield();
      }
      if (typeof wpFastRenderSimulatedPanels === 'function') {
        wpFastRenderSimulatedPanels();
      } else if (typeof startSolarPanelsSimulation === 'function') {
        startSolarPanelsSimulation();
      }
    } else {
      if (typeof updateBudgetUI === 'function') updateBudgetUI();
    }
  }

  if (selectedObstacleId) {
    const curObs = obstacles.find(o => o.id === selectedObstacleId);
    if (curObs && typeof wpCheckObstacleInsideRoof === 'function') {
      wpCheckObstacleInsideRoof(curObs);
    }
  }
}

function updateObstacleInsideRoofBadge(isInside, roofName) {
  const badge = document.getElementById('obs-inside-roof-badge');
  const snapBtn = document.getElementById('obs-snap-roof-btn');
  if (badge) {
    if (isInside) {
      badge.textContent = '✓ En cubierta' + (roofName ? ' (' + roofName + ')' : '');
      badge.style.background = 'rgba(16, 185, 129, 0.2)';
      badge.style.color = '#34D399';
      badge.style.border = '1px solid rgba(16, 185, 129, 0.4)';
      badge.title = 'El obstáculo está correctamente situado dentro del perímetro de la cubierta.';
    } else {
      badge.textContent = '⚠️ Fuera de cubierta';
      badge.style.background = 'rgba(239, 68, 68, 0.2)';
      badge.style.color = '#F87171';
      badge.style.border = '1px solid rgba(239, 68, 68, 0.4)';
      badge.title = 'Aviso: el obstáculo se encuentra fuera del perímetro del tejado.';
    }
  }
  if (snapBtn) {
    snapBtn.style.display = isInside ? 'none' : 'block';
  }
}

function wpCheckObstacleInsideRoof(optObs, notifyIfOutside) {
  const curSelId = (typeof selectedObstacleId !== 'undefined' ? selectedObstacleId : (typeof window !== 'undefined' ? window.selectedObstacleId : null));
  const obs = optObs || (curSelId ? obstacles.find(o => o.id === curSelId) : null);
  if (!obs) return { isInside: false, polyName: null, polyIdx: -1 };

  if (typeof WP === 'undefined' || !WP || !Array.isArray(WP.polylines) || WP.polylines.length === 0) {
    updateObstacleInsideRoofBadge(false, null);
    return { isInside: false, polyName: null, polyIdx: -1 };
  }

  function ptInPoly(pt, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].u, yi = poly[i].v;
      const xj = poly[j].u, yj = poly[j].v;
      const intersect = ((yi > pt.v) !== (yj > pt.v)) && (pt.u < (xj - xi) * (pt.v - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  let insideResult = false;
  let matchingPoly = null;
  let matchingPolyIdx = -1;

  for (let idx = 0; idx < WP.polylines.length; idx++) {
    const poly = WP.polylines[idx];
    if (!poly || !poly.points || poly.points.length < 3) continue;

    const planeIdx = (typeof poly.planeIdx === 'number' && poly.planeIdx >= 0 && WP.planes && WP.planes[poly.planeIdx])
      ? poly.planeIdx
      : (typeof WP.activePlaneIdx === 'number' ? WP.activePlaneIdx : 0);
    const plane = (WP.planes && WP.planes[planeIdx]) ? WP.planes[planeIdx] : null;

    let poly2D = null;
    if (plane && plane.origin && plane.uVec && plane.vVec && Array.isArray(poly.points)) {
      poly2D = poly.points.map(pt => {
        const rel = Cesium.Cartesian3.subtract(pt, plane.origin, new Cesium.Cartesian3());
        return {
          u: Cesium.Cartesian3.dot(rel, plane.uVec),
          v: Cesium.Cartesian3.dot(rel, plane.vVec)
        };
      });
    } else if (poly.roofInfo && Array.isArray(poly.roofInfo.poly2D) && poly.roofInfo.poly2D.length >= 3) {
      poly2D = poly.roofInfo.poly2D;
    }

    if (!poly2D || poly2D.length < 3) continue;

    let obsU = obs.u;
    let obsV = obs.v;

    if (plane && plane.origin && plane.uVec && plane.vVec && obs.cartesian) {
      const relObs = Cesium.Cartesian3.subtract(obs.cartesian, plane.origin, new Cesium.Cartesian3());
      if (plane.normal) {
        const distToPlane = Math.abs(Cesium.Cartesian3.dot(relObs, plane.normal));
        if (distToPlane > 0.40) continue; // Descartar si el obstáculo dista más de 40 cm del plano 3D del faldón
      }
      obsU = Cesium.Cartesian3.dot(relObs, plane.uVec);
      obsV = Cesium.Cartesian3.dot(relObs, plane.vVec);
    }

    if (typeof obsU === 'number' && typeof obsV === 'number' && !isNaN(obsU) && !isNaN(obsV)) {
      if (ptInPoly({ u: obsU, v: obsV }, poly2D)) {
        insideResult = true;
        matchingPoly = poly;
        matchingPolyIdx = idx;
        break;
      }
    }
  }

  if (!obs.id || obs.id === curSelId) {
    updateObstacleInsideRoofBadge(insideResult, matchingPoly ? (matchingPoly.name || ('Faldón #' + (matchingPolyIdx + 1))) : null);
  }

  if (notifyIfOutside && !insideResult && typeof showToast === 'function') {
    showToast('OBSTÁCULO FUERA', 'El obstáculo ha quedado fuera del tejado. Pulsa "Atraer a Cubierta" para devolverlo.', 'warning', 3500);
  }

  return {
    isInside: insideResult,
    polyName: matchingPoly ? (matchingPoly.name || ('Faldón #' + (matchingPolyIdx + 1))) : null,
    polyIdx: matchingPolyIdx
  };
}

function wpSnapObstacleToRoof(obsId) {
  const targetId = obsId || (typeof selectedObstacleId !== 'undefined' ? selectedObstacleId : (typeof window !== 'undefined' ? window.selectedObstacleId : null));
  if (!targetId) return;
  const obs = obstacles.find(o => o.id === targetId);
  if (!obs) return;

  let targetPoly = null;
  if (typeof WP !== 'undefined' && WP && Array.isArray(WP.polylines) && WP.polylines.length > 0) {
    if (typeof WP.selectedPolyIdx === 'number' && WP.selectedPolyIdx >= 0 && WP.polylines[WP.selectedPolyIdx]) {
      targetPoly = WP.polylines[WP.selectedPolyIdx];
    } else {
      targetPoly = WP.polylines[0];
    }
  }

  if (!targetPoly || !targetPoly.points || targetPoly.points.length < 3) {
    if (typeof showToast === 'function') {
      showToast('SIN CUBIERTA', 'No hay ningún faldón cerrado sobre el que situar el obstáculo.', 'warning', 3000);
    }
    return;
  }

  let centroid = new Cesium.Cartesian3(0, 0, 0);
  targetPoly.points.forEach(pt => {
    centroid = Cesium.Cartesian3.add(centroid, pt, centroid);
  });
  centroid = Cesium.Cartesian3.multiplyByScalar(centroid, 1.0 / targetPoly.points.length, centroid);

  const planeIdx = (typeof targetPoly.planeIdx === 'number' && targetPoly.planeIdx >= 0 && WP.planes && WP.planes[targetPoly.planeIdx])
    ? targetPoly.planeIdx
    : (typeof WP.activePlaneIdx === 'number' ? WP.activePlaneIdx : 0);
  const plane = (WP.planes && WP.planes[planeIdx]) ? WP.planes[planeIdx] : null;

  obs.cartesian = Cesium.Cartesian3.clone(centroid);
  obs.planeIdx = planeIdx;
  obs.polyIdx = (WP.polylines.indexOf(targetPoly) >= 0) ? WP.polylines.indexOf(targetPoly) : 0;

  const wp = (typeof getObstacleActivePlane === 'function') ? getObstacleActivePlane(obs) : null;
  if (wp && wp.origin && wp.uVec && wp.vVec) {
    const rel = Cesium.Cartesian3.subtract(centroid, wp.origin, new Cesium.Cartesian3());
    obs.u = Cesium.Cartesian3.dot(rel, wp.uVec);
    obs.v = Cesium.Cartesian3.dot(rel, wp.vVec);
  } else if (plane && plane.origin && plane.uVec && plane.vVec) {
    const rel = Cesium.Cartesian3.subtract(centroid, plane.origin, new Cesium.Cartesian3());
    obs.u = Cesium.Cartesian3.dot(rel, plane.uVec);
    obs.v = Cesium.Cartesian3.dot(rel, plane.vVec);
  }

  recalculateLayoutAndObstacles();
  selectObstacle(obs.id);
  if (typeof renderTriad2D === 'function') renderTriad2D();
  if (typeof showToast === 'function') {
    showToast('IMÁN A CUBIERTA', 'El obstáculo ha sido atraído al centro del faldón.', 'success', 3000);
  }
}

  // ── EXPORTACIÓN AL NAMESPACE GLOBAL Y WINDOW.RA ─────────────────────────────
  global.RA = global.RA || {};
  global.RA.obstacles = {
    getObstacleActivePlane: getObstacleActivePlane,
    obsComputeUV: obsComputeUV,
    getSelectedObstacle: getSelectedObstacle,
    renderObstacleGizmo2D: renderObstacleGizmo2D,
    checkObstacleGizmoHit: checkObstacleGizmoHit,
    pickObstacleUnderCursor: pickObstacleUnderCursor,
    computeObstacleRotationMatrix: computeObstacleRotationMatrix,
    updateObstacleLiveModelMatrix: updateObstacleLiveModelMatrix,
    render3DObstaclesInCesium: render3DObstaclesInCesium,
    scaleSelectedObstacleAxis: scaleSelectedObstacleAxis,
    nudgeSelectedObstacleDim: nudgeSelectedObstacleDim,
    rotateSelectedObstacle: rotateSelectedObstacle,
    nudgeSelectedObstacle: nudgeSelectedObstacle,
    selectObstacle: selectObstacle,
    updateSelectedObstacleProps: updateSelectedObstacleProps,
    deleteSelectedObstacle: deleteSelectedObstacle,
    startObstaclePlacement: startObstaclePlacement,
    cancelObstaclePlacement: cancelObstaclePlacement,
    updateObstaclePlacementUI: updateObstaclePlacementUI,
    obsClearGhost: obsClearGhost,
    obsRenderGhost: obsRenderGhost,
    obsPlaceAt: obsPlaceAt,
    setSelectedObstacleAlignment: setSelectedObstacleAlignment,
    getObstacleOrientationAxes: getObstacleOrientationAxes,
    recalculateLayoutAndObstacles: recalculateLayoutAndObstacles,
    wpCheckObstacleInsideRoof: wpCheckObstacleInsideRoof,
    updateObstacleInsideRoofBadge: updateObstacleInsideRoofBadge,
    wpSnapObstacleToRoof: wpSnapObstacleToRoof
  };

  global.getObstacleActivePlane = getObstacleActivePlane;
  global.obsComputeUV = obsComputeUV;
  global.getSelectedObstacle = getSelectedObstacle;
  global.renderObstacleGizmo2D = renderObstacleGizmo2D;
  global.checkObstacleGizmoHit = checkObstacleGizmoHit;
  global.pickObstacleUnderCursor = pickObstacleUnderCursor;
  global.render3DObstaclesInCesium = render3DObstaclesInCesium;
  global.scaleSelectedObstacleAxis = scaleSelectedObstacleAxis;
  global.nudgeSelectedObstacleDim = nudgeSelectedObstacleDim;
  global.rotateSelectedObstacle = rotateSelectedObstacle;
  global.nudgeSelectedObstacle = nudgeSelectedObstacle;
  global.selectObstacle = selectObstacle;
  global.updateSelectedObstacleProps = updateSelectedObstacleProps;
  global.deleteSelectedObstacle = deleteSelectedObstacle;
  global.startObstaclePlacement = startObstaclePlacement;
  global.cancelObstaclePlacement = cancelObstaclePlacement;
  global.updateObstaclePlacementUI = updateObstaclePlacementUI;
  global.obsClearGhost = obsClearGhost;
  global.obsRenderGhost = obsRenderGhost;
  global.obsPlaceAt = obsPlaceAt;
  global.setSelectedObstacleAlignment = setSelectedObstacleAlignment;
  global.getObstacleOrientationAxes = getObstacleOrientationAxes;
  global.recalculateLayoutAndObstacles = recalculateLayoutAndObstacles;
  global.wpCheckObstacleInsideRoof = wpCheckObstacleInsideRoof;
  global.updateObstacleInsideRoofBadge = updateObstacleInsideRoofBadge;
  global.wpSnapObstacleToRoof = wpSnapObstacleToRoof;

})(typeof window !== 'undefined' ? window : globalThis);
