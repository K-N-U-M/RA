// ═══════════════════════════════════════════════════════════════════════════
// GEOMETRÍA 2D Y PROYECCIÓN DE SOMBRAS DE EDIFICIOS (MODULARIZADO)
// ═══════════════════════════════════════════════════════════════════════════

function segmentsIntersect2D(p1, p2, p3, p4) {
  function orient(p, q, r) {
    const val = (q.v - p.v) * (r.u - q.u) - (q.u - p.u) * (r.v - q.v);
    if (Math.abs(val) < 1e-9) return 0;
    return (val > 0) ? 1 : 2;
  }
  function onSeg(p, q, r) {
    return q.u <= Math.max(p.u, r.u) && q.u >= Math.min(p.u, r.u) &&
           q.v <= Math.max(p.v, r.v) && q.v >= Math.min(p.v, r.v);
  }
  const o1 = orient(p1, p2, p3);
  const o2 = orient(p1, p2, p4);
  const o3 = orient(p3, p4, p1);
  const o4 = orient(p3, p4, p2);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSeg(p1, p3, p2)) return true;
  if (o2 === 0 && onSeg(p1, p4, p2)) return true;
  if (o3 === 0 && onSeg(p3, p1, p4)) return true;
  if (o4 === 0 && onSeg(p3, p2, p4)) return true;
  return false;
}

function polygonsIntersect2D(polyA, polyB) {
  if (!polyA || !polyB || polyA.length < 3 || polyB.length < 3) return false;
  for (let i = 0; i < polyA.length; i++) {
    if (isPointInPolygon2D(polyA[i], polyB)) return true;
  }
  for (let i = 0; i < polyB.length; i++) {
    if (isPointInPolygon2D(polyB[i], polyA)) return true;
  }
  for (let i = 0; i < polyA.length; i++) {
    const a1 = polyA[i];
    const a2 = polyA[(i + 1) % polyA.length];
    for (let j = 0; j < polyB.length; j++) {
      const b1 = polyB[j];
      const b2 = polyB[(j + 1) % polyB.length];
      if (segmentsIntersect2D(a1, a2, b1, b2)) return true;
    }
  }
  return false;
}


function convexHull2D(points) {
  if (!points || points.length <= 3) return points || [];
  const pts = points.slice().sort((a, b) => a.u === b.u ? a.v - b.v : a.u - b.u);
  function cross(o, a, b) {
    return (a.u - o.u) * (b.v - o.v) - (a.v - o.v) * (b.u - o.u);
  }
  const lower = [];
  for (let p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 1e-9) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 1e-9) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function getBuildingPolygon2DForRoof(building, roof, poly) {
  if (!building || !building.points || building.points.length < 3) return null;
  if (!roof) return null;

  const rawCartoList = [];
  building.points.forEach(p => {
    if (p) {
      const c = Cesium.Cartographic.fromCartesian(p);
      if (c) rawCartoList.push(c);
    }
  });
  if (rawCartoList.length < 3) return null;

  let avgBaseHeight = 0;
  rawCartoList.forEach(c => { avgBaseHeight += (c.height || 0); });
  avgBaseHeight /= rawCartoList.length;

  const bldHeight = Math.max(building.height || 6.0, 1.0);
  const coronacionHeight = avgBaseHeight + bldHeight;

  let roofZ = avgBaseHeight;
  let roofCenterCarto = null;
  if (roof.carto && typeof roof.carto.height === 'number') {
    roofZ = roof.carto.height;
    roofCenterCarto = roof.carto;
  } else if (roof.center && typeof Cesium !== 'undefined' && Cesium.Cartographic) {
    const c = Cesium.Cartographic.fromCartesian(roof.center);
    if (c) {
      roofZ = c.height;
      roofCenterCarto = c;
    }
  } else if (roof.origin && typeof Cesium !== 'undefined' && Cesium.Cartographic) {
    const c = Cesium.Cartographic.fromCartesian(roof.origin);
    if (c) {
      roofZ = c.height;
      roofCenterCarto = c;
    }
  } else if (poly && poly.points && poly.points.length > 0 && typeof Cesium !== 'undefined' && Cesium.Cartographic) {
    const c = Cesium.Cartographic.fromCartesian(poly.points[0]);
    if (c) {
      roofZ = c.height;
      roofCenterCarto = c;
    }
  }

  // Comprobar si el faldón o cubierta pertenece a este mismo edificio
  let isSameBuilding = false;
  if (roof.buildingId && roof.buildingId === building.id) {
    isSameBuilding = true;
  } else if (poly && poly.buildingId && poly.buildingId === building.id) {
    isSameBuilding = true;
  } else if (typeof roof.planeIdx === 'number' && typeof WP !== 'undefined' && WP && WP.planes && WP.planes[roof.planeIdx] && WP.planes[roof.planeIdx].buildingId === building.id) {
    isSameBuilding = true;
  } else if (poly && typeof poly.planeIdx === 'number' && typeof WP !== 'undefined' && WP && WP.planes && WP.planes[poly.planeIdx] && WP.planes[poly.planeIdx].buildingId === building.id) {
    isSameBuilding = true;
  } else if (roofCenterCarto && rawCartoList.length >= 3) {
    // Salvaguarda geométrica: si el centroide de la cubierta está dentro de la huella 2D del edificio
    const roofPt2D = { u: roofCenterCarto.longitude, v: roofCenterCarto.latitude };
    const bldPoly2D = rawCartoList.map(c => ({ u: c.longitude, v: c.latitude }));
    if (typeof isPointInPolygon2D === 'function' && isPointInPolygon2D(roofPt2D, bldPoly2D)) {
      // Si la cota de la cubierta está a la coronación o por encima del edificio (con holgura de 2.5m hacia abajo o cualquier altura superior)
      if (roofZ >= (coronacionHeight - 2.5)) {
        isSameBuilding = true;
      }
    }
  }

  let effectiveHeight = 0;
  if (isSameBuilding) {
    // Un edificio jamás arroja sombra masiva sobre los paneles de su propia cubierta superior.
    // Solo un parapeto o casetón perimetral proyecta sombras locales internas, si se modela como obstáculo.
    return null;
  } else {
    // Para un edificio colindante o vecino, la altura efectiva que arroja sombra sobre este tejado
    // es la diferencia entre la coronación del edificio vecino y la cota de la cubierta baja
    effectiveHeight = coronacionHeight - roofZ;
  }

  const SHADOW_OFFSET_START_M = 0.05;
  if (effectiveHeight <= SHADOW_OFFSET_START_M) return null;

  const uVec = roof.uVec || new Cesium.Cartesian3(1, 0, 0);
  const vVec = roof.vVec || new Cesium.Cartesian3(0, 1, 0);
  const invT = roof.invTransform || (roof.transform && typeof Cesium !== 'undefined' && Cesium.Matrix4
    ? Cesium.Matrix4.inverse(roof.transform, new Cesium.Matrix4())
    : (roof.center && typeof Cesium !== 'undefined' && Cesium.Transforms
      ? Cesium.Matrix4.inverse(Cesium.Transforms.eastNorthUpToFixedFrame(roof.center), new Cesium.Matrix4())
      : null));

  const roofOrigin = roof.origin || roof.center || (roof.points && roof.points[0]) || building.points[0];

  // Proyectar la huella del edificio en el plano local 2D (U, V) de la cubierta
  const basePoly = rawCartoList.map(c => {
    const wallAtRoofZ = Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, roofZ);
    if (invT) {
      const locPt = Cesium.Matrix4.multiplyByPoint(invT, wallAtRoofZ, new Cesium.Cartesian3());
      return {
        u: Cesium.Cartesian3.dot(locPt, uVec),
        v: Cesium.Cartesian3.dot(locPt, vVec)
      };
    } else {
      const diff = Cesium.Cartesian3.subtract(wallAtRoofZ, roofOrigin, new Cesium.Cartesian3());
      return {
        u: Cesium.Cartesian3.dot(diff, uVec),
        v: Cesium.Cartesian3.dot(diff, vVec)
      };
    }
  });

  if (!basePoly || basePoly.length < 3) return null;

  return {
    height: effectiveHeight,
    points2D: basePoly,
    isBuilding: true,
    buildingId: building.id
  };
}

function getBuildingShadowPolygons2DForRoof(building, roof, sU, sV, shadowLenPerM, poly) {
  const bldObs = getBuildingPolygon2DForRoof(building, roof, poly);
  if (!bldObs) return null;

  const effectiveHeight = bldObs.height;
  // Limitar longitud de sombra para evitar planos infinitos o aberrantes con sol rasante
  const maxShadowLen = Math.min(shadowLenPerM || 0, 50.0);
  const shadowLen = Math.min(effectiveHeight * maxShadowLen, 120.0);
  const SHADOW_OFFSET_START_M = 0.05;
  if (shadowLen <= SHADOW_OFFSET_START_M || !isFinite(shadowLen)) return null;

  const basePoly = bldObs.points2D;
  const deltaUStart = sU * SHADOW_OFFSET_START_M;
  const deltaVStart = sV * SHADOW_OFFSET_START_M;
  const startShadowPoly = basePoly.map(p => ({ u: p.u + deltaUStart, v: p.v + deltaVStart }));

  const deltaU = sU * shadowLen;
  const deltaV = sV * shadowLen;
  const topShadowPoly = basePoly.map(p => ({ u: p.u + deltaU, v: p.v + deltaV }));

  // Silueta unificada convexa: Elimina solapamientos internos y artefactos
  const unifiedShadow = (typeof convexHull2D === 'function')
    ? convexHull2D([...startShadowPoly, ...topShadowPoly])
    : null;
  if (!unifiedShadow || unifiedShadow.length < 3) return null;

  return [unifiedShadow];
}
window.getObstaclePolygon2DForRoof = getObstaclePolygon2DForRoof;
window.getObstacleShadowPolygons2DForRoof = getObstacleShadowPolygons2DForRoof;
window.getBuildingPolygon2DForRoof = getBuildingPolygon2DForRoof;
window.getBuildingShadowPolygons2DForRoof = getBuildingShadowPolygons2DForRoof;

function getObstacleShadowPolygons2DForRoof(obs, roof, sU, sV, shadowLenPerM) {
  // Para aerogeneradores, la sombra sobre cubierta proviene del fuste/mástil cilíndrico esbelto
  const isTurbine = (obs.type === 'wind_turbine');
  const h = isTurbine ? (Math.max(obs.mastHeight || 6.0, 1.0)) : Math.max(obs.h || 1.2, 0.2);
  const shadowLen = h * (shadowLenPerM || 0);
  
  // <i data-lucide=\"zap\" class=\"icon-sm\"></i> SEPARACIÓN DE SEGURIDAD (5 cm): Iniciar la sombra a 0.05m del obstáculo para erradicar artefactos y shadow acne
  const SHADOW_OFFSET_START_M = 0.05;
  if (shadowLen <= SHADOW_OFFSET_START_M) return null;

  const basePoly = getObstaclePolygon2DForRoof(obs, 0.0, roof);
  if (!basePoly || basePoly.length < 3) return null;

  // Inicio de la sombra desplazado 5 cm en la dirección del vector solar proyectado
  const deltaUStart = sU * SHADOW_OFFSET_START_M;
  const deltaVStart = sV * SHADOW_OFFSET_START_M;
  const startShadowPoly = basePoly.map(p => ({ u: p.u + deltaUStart, v: p.v + deltaVStart }));

  // Extremo de la sombra proyectada
  const deltaU = sU * shadowLen;
  const deltaV = sV * shadowLen;
  const topShadowPoly = basePoly.map(p => ({ u: p.u + deltaU, v: p.v + deltaV }));

  // Silueta unificada convexa: Elimina solapamientos internos, costuras dobles y artefactos de alpha blending
  const unifiedShadow = convexHull2D([...startShadowPoly, ...topShadowPoly]);
  if (!unifiedShadow || unifiedShadow.length < 3) return null;

  return [unifiedShadow];
}

function defaultPanelFilter(center, corners, dims, ctx) {
  const panelPoly = corners || [
    { u: center.u - dims.wid/2, v: center.v - dims.len/2 },
    { u: center.u + dims.wid/2, v: center.v - dims.len/2 },
    { u: center.u + dims.wid/2, v: center.v + dims.len/2 },
    { u: center.u - dims.wid/2, v: center.v + dims.len/2 }
  ];

  const obsSetback = typeof ctx.obsSetback === "number" ? ctx.obsSetback : 0.50;
  const roof = ctx.roof || null;
  let obstacleList = Array.isArray(ctx.obstacles) ? ctx.obstacles.slice() : ((typeof obstacles !== "undefined" && Array.isArray(obstacles)) ? obstacles.slice() : []);
  const turbines = (typeof windTurbines !== 'undefined' && Array.isArray(windTurbines))
    ? windTurbines
    : ((typeof window !== 'undefined' && Array.isArray(window.windTurbines)) ? window.windTurbines : []);

  if (turbines.length > 0) {
    turbines.forEach(t => {
      if (!t || (t.operationalState && t.operationalState.enabled === false)) return;
      const hubH = (t.supportStructure && t.supportStructure.hubHeightM) ? t.supportStructure.hubHeightM : 18;
      const rotorR = (t._catalog && t._catalog.rotorDiameterM) ? (t._catalog.rotorDiameterM / 2) : 3;
      let cartesian = null;
      if (t.cartesian) {
        cartesian = t.cartesian;
      } else if (t.positionCartographic && typeof Cesium !== 'undefined' && Cesium.Cartesian3) {
        try {
          cartesian = Cesium.Cartesian3.fromRadians(
            t.positionCartographic.longitudeRad,
            t.positionCartographic.latitudeRad,
            t.positionCartographic.altitudeM || 0
          );
        } catch (eC) {}
      }
      obstacleList.push({
        id: t.id,
        type: 'wind_turbine',
        name: t.name || 'Aerogenerador',
        mastHeight: hubH + rotorR,
        h: hubH + rotorR,
        w: 1.5,
        l: 1.5,
        cartesian: cartesian,
        positionCartographic: t.positionCartographic,
        isTurbine: true
      });
    });
  }

  // 1. Deteccion rigurosa de obstaculos y casetones 3D (excluir cualquier panel que colisione)
  for (const obs of obstacleList) {
    const obsPoly = getObstaclePolygon2DForRoof(obs, obsSetback, roof);
    if (!obsPoly || obsPoly.length < 3) continue;

    // A. Centro del panel dentro del perimetro del obstaculo
    if (center && isPointInPolygon2D(center, obsPoly)) {
      return { accept: false, isShaded: false };
    }
    // B. Algun vertice del panel dentro del perimetro del obstaculo
    for (const c of panelPoly) {
      if (isPointInPolygon2D(c, obsPoly)) {
        return { accept: false, isShaded: false };
      }
    }
    // C. Interseccion o solape entre el panel y el perimetro del obstaculo
    if (polygonsIntersect2D(panelPoly, obsPoly)) {
      return { accept: false, isShaded: false };
    }
    // D. Detección de contención bidireccional: si el obstáculo está dentro del panel FV
    for (const oc of obsPoly) {
      if (isPointInPolygon2D(oc, panelPoly)) {
        return { accept: false, isShaded: false };
      }
    }
  }

  // 2. Analisis de sombras 3D (CTE DB-HE5)
  let isShaded = false;
  for (const obs of obstacleList) {
    const shadowQuads = getObstacleShadowPolygons2DForRoof(obs, roof, ctx.sU || 0, ctx.sV || 0, ctx.shadowLenPerM || 0);
    if (shadowQuads) {
      for (const quad of shadowQuads) {
        if (polygonsIntersect2D(panelPoly, quad)) {
          isShaded = true;
          break;
        }
      }
      if (isShaded) break;
    }
  }

  if (isShaded && ctx.shadingStrategy === "exclude") {
    return { accept: false, isShaded: true };
  }

  return { accept: true, isShaded: isShaded };
}

if (typeof window !== 'undefined') {
  window.segmentsIntersect2D = segmentsIntersect2D;
  window.polygonsIntersect2D = polygonsIntersect2D;
  window.convexHull2D = convexHull2D;
  window.getBuildingPolygon2DForRoof = getBuildingPolygon2DForRoof;
  window.getBuildingShadowPolygons2DForRoof = getBuildingShadowPolygons2DForRoof;
  window.checkPanelObstacles = checkPanelObstacles;
}
