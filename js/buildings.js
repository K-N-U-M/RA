/**
 * js/buildings.js — Motor de Renderizado 3D de Edificios Modelados
 * ================================================================
 * Módulo extraído de index.html (Fase 8 — Arquitectura AAA v2)
 * 
 * Dependencias en runtime:
 *   - window.viewer (Cesium.Viewer)
 *   - window.WP (WorkingPlane state)
 *   - window.addPolygonEntity (helper de entidades)
 *   - window.Cesium (global)
 *
 * Uso: este módulo se carga DESPUÉS de index.html y sobrescribe
 *      la función render3DBuildingsInCesium con esta versión modular.
 */
(function() {
  'use strict';

function render3DBuildingsInCesium() {
  // 1. Limpiar Primitivas WebGL directas previas
  if (window._buildingPrimitives && Array.isArray(window._buildingPrimitives)) {
    window._buildingPrimitives.forEach(p => {
      try {
        if (p && !p.isDestroyed()) {
          if (p.shadows !== undefined && typeof Cesium !== 'undefined' && Cesium.ShadowMode) {
            p.shadows = Cesium.ShadowMode.DISABLED;
          }
          viewer.scene.primitives.remove(p);
        }
      } catch(err) { window.RA && window.RA.log && window.RA.log.warn('[catch silenciado]', err); }
    });
  }
  window._buildingPrimitives = [];

  // 2. Limpiar Entidades previas
  if (window._buildingEntities && Array.isArray(window._buildingEntities)) {
    window._buildingEntities.forEach(e => {
      try { viewer.entities.remove(e); } catch(err) { window.RA && window.RA.log && window.RA.log.warn('[catch silenciado]', err); }
    });
  }
  window._buildingEntities = [];
  window._selectedVtxHandle = null; // [P2] ref al handle del vértice seleccionado (se recrea más abajo)

  if (!Array.isArray(buildings) || buildings.length === 0) {
    if (viewer && viewer.scene && typeof viewer.scene.requestRender === 'function') {
      viewer.scene.requestRender();
    }
    return;
  }

  buildings.forEach(bld => {
    if (!bld.points || bld.points.length < 3 || bld.visible === false) return;
    const isSel = (bld.id === selectedBuildingId);
    const baseHex = bld.facadeColor || '#FFFFFF';
    const roofHex = bld.roofColor || '#FF6400';

    // Usar SIEMPRE el color real elegido por el usuario para fachada y cubierta
    const facadeColor = Cesium.Color.fromCssColorString(baseHex).withAlpha(0.92);
    const roofColor = Cesium.Color.fromCssColorString(roofHex).withAlpha(0.96);

    // 🎨 ESTILOS CAD: Aristas oscuras y definidas para distinguir planos claramente
    const edgeColor = isSel ? Cesium.Color.fromCssColorString('#0F172A').withAlpha(0.95) : Cesium.Color.fromCssColorString('#334155').withAlpha(0.6);
    const ridgeColor = isSel ? Cesium.Color.fromCssColorString('#000000').withAlpha(0.95) : Cesium.Color.fromCssColorString('#1E293B').withAlpha(0.7);
    const xRayDash = new Cesium.PolylineDashMaterialProperty({ color: isSel ? Cesium.Color.fromCssColorString('#0F172A').withAlpha(0.2) : Cesium.Color.fromCssColorString('#334155').withAlpha(0.1) });

    // [P2] Si fromCartesian falla (punto degenerado), antes se dibujaba un vértice en
    // lat/lon 0 (Golfo de Guinea) en silencio. Ahora se descarta el vértice y se avisa.
    let _degenerateVtx = false;
    const rawCartoList = [];
    bld.points.forEach(p => {
      const c = Cesium.Cartographic.fromCartesian(p);
      if (c) rawCartoList.push(c); else _degenerateVtx = true;
    });
    if (_degenerateVtx && typeof window !== 'undefined' && typeof window.showToast === 'function') {
      window.showToast('GEOMETRÍA INVÁLIDA', (bld.name || 'Edificio') + ' tiene vértices con coordenadas inválidas y fueron descartados. Redibuja la huella si falta geometría.', 'warning', 4500);
    }

    // Filtro estricto anti-colapso WebGL: Eliminar vértices idénticos/coincidentes (distancia < 0.05 metros)
    let cartoList = [];
    for (let i = 0; i < rawCartoList.length; i++) {
      if (cartoList.length > 0) {
        const last = cartoList[cartoList.length - 1];
        const dLon = rawCartoList[i].longitude - last.longitude;
        const dLat = rawCartoList[i].latitude - last.latitude;
        if (Math.hypot(dLon, dLat) < 1e-7) continue; 
      }
      cartoList.push(rawCartoList[i]);
    }
    // Asegurar que el último y el primero no coincidan
    if (cartoList.length > 2) {
      const dLon = cartoList[0].longitude - cartoList[cartoList.length - 1].longitude;
      const dLat = cartoList[0].latitude - cartoList[cartoList.length - 1].latitude;
      if (Math.hypot(dLon, dLat) < 1e-7) cartoList.pop();
    }
    if (cartoList.length < 3) return;

    let signedArea = 0;
    for (let i = 0; i < cartoList.length; i++) {
      const j = (i + 1) % cartoList.length;
      signedArea += (cartoList[i].longitude * cartoList[j].latitude - cartoList[j].longitude * cartoList[i].latitude);
    }
    if (signedArea < 0) {
      cartoList.reverse();
    }

    let avgBaseHeight = 0;
    cartoList.forEach(c => { avgBaseHeight += (c.height || 0); });
    avgBaseHeight /= cartoList.length;

    const bldHeight = Math.max(bld.height || 6.0, 1.0);
    const roofHeight = avgBaseHeight + bldHeight;
    const rType = bld.roofType || 'flat';
    const pitch = (typeof bld.roofPitch === 'number') ? bld.roofPitch : 25;
    const pitchRad = (pitch * Math.PI) / 180;
    const overhang = (typeof bld.overhang === 'number') ? bld.overhang : 0.0;

    const basePositions = cartoList.map(c => Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, avgBaseHeight));

    // Calcular footprint expandido para cubiertas con voladizo
    let roofCartoList = cartoList;
    if (overhang > 0 && rType !== 'flat') {
      roofCartoList = [];
      const N = cartoList.length;
      const R_EARTH = 6378137.0; // Radio ecuatorial en metros (WGS84)
      for (let i = 0; i < N; i++) {
        const c0 = cartoList[(i - 1 + N) % N];
        const c1 = cartoList[i];
        const c2 = cartoList[(i + 1) % N];

        // Proyección equirectangular local (1 unidad = 1 metro)
        const p0x = c0.longitude * R_EARTH * Math.cos(c0.latitude), p0y = c0.latitude * R_EARTH;
        const p1x = c1.longitude * R_EARTH * Math.cos(c1.latitude), p1y = c1.latitude * R_EARTH;
        const p2x = c2.longitude * R_EARTH * Math.cos(c2.latitude), p2y = c2.latitude * R_EARTH;

        const dx1 = p1x - p0x, dy1 = p1y - p0y;
        const len1 = Math.hypot(dx1, dy1) || 1;
        const nx1 = dy1/len1, ny1 = -dx1/len1; // Normal exterior derecha (polígono CCW)

        const dx2 = p2x - p1x, dy2 = p2y - p1y;
        const len2 = Math.hypot(dx2, dy2) || 1;
        const nx2 = dy2/len2, ny2 = -dx2/len2; // Normal exterior derecha

        let nx = nx1 + nx2, ny = ny1 + ny2;
        const nlen = Math.hypot(nx, ny);
        if (nlen > 1e-6) {
          nx /= nlen; ny /= nlen;
          let dot = nx * nx1 + ny * ny1;
          if (dot < 0.2) dot = 0.2; // Evitar explosión de distancia si el ángulo es muy agudo
          const disp = overhang / dot;
          const ox = p1x + nx * disp, oy = p1y + ny * disp;
          roofCartoList.push({
            longitude: ox / (R_EARTH * Math.cos(c1.latitude)),
            latitude: oy / R_EARTH,
            height: c1.height
          });
        } else {
          roofCartoList.push(c1);
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────
    // A. CUBIERTA PLANA (FLAT)
    // ─────────────────────────────────────────────────────────────────
    if (rType === 'flat') {
      const roofPositions = roofCartoList.map(c => Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, roofHeight));
      const wallPositions = [...basePositions, basePositions[0]];
      const minHeights = wallPositions.map(() => avgBaseHeight);
      const maxHeights = wallPositions.map(() => roofHeight);

      // Muros Verticales
      try {
        const wallInst = new Cesium.GeometryInstance({
          geometry: new Cesium.WallGeometry({
            positions: wallPositions,
            minimumHeights: minHeights,
            maximumHeights: maxHeights
          }),
          attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(facadeColor) },
          id: (bld.id || 'bld') + '_wall_prim'
        });
        const wallPrim = viewer.scene.primitives.add(new Cesium.Primitive({
          geometryInstances: wallInst,
          appearance: new Cesium.PerInstanceColorAppearance({ translucent: false, closed: true, flat: true, renderState: { polygonOffset: true, polygonOffsetFactor: 2.0, polygonOffsetUnits: 2.0 } }),
          shadows: Cesium.ShadowMode.ENABLED,
          asynchronous: false
        }));
        window._buildingPrimitives.push(wallPrim);
      } catch(e) { window.RA && window.RA.log && window.RA.log.warn('[catch silenciado]', e); }

      // Tapa de Cubierta
      try {
        const roofInst = new Cesium.GeometryInstance({
          geometry: Cesium.PolygonGeometry.fromPositions({
            positions: roofPositions,
            perPositionHeight: true
          }),
          attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(roofColor) },
          id: (bld.id || 'bld') + '_roof_prim'
        });
        const roofPrim = viewer.scene.primitives.add(new Cesium.Primitive({
          geometryInstances: roofInst,
          appearance: new Cesium.PerInstanceColorAppearance({ translucent: false, closed: true, flat: true, renderState: { polygonOffset: true, polygonOffsetFactor: 2.0, polygonOffsetUnits: 2.0 } }),
          shadows: Cesium.ShadowMode.ENABLED,
          asynchronous: false
        }));
        window._buildingPrimitives.push(roofPrim);
      } catch(e) { window.RA && window.RA.log && window.RA.log.warn('[catch silenciado]', e); }

      // Peto Perimetral
      if ((bld.parapetHeight || 0) > 0) {
        try {
          const parH = bld.parapetHeight;
          const parInst = new Cesium.GeometryInstance({
            geometry: new Cesium.WallGeometry({
              positions: wallPositions,
              minimumHeights: wallPositions.map(() => roofHeight),
              maximumHeights: wallPositions.map(() => roofHeight + parH)
            }),
            attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(facadeColor) }
          });
          const parPrim = viewer.scene.primitives.add(new Cesium.Primitive({
            geometryInstances: parInst,
            appearance: new Cesium.PerInstanceColorAppearance({
              translucent: false,
              closed: false,
              renderState: { cull: { enabled: false } }
            }),
            shadows: Cesium.ShadowMode.ENABLED,
            asynchronous: false
          }));
          window._buildingPrimitives.push(parPrim);
        } catch(e) { window.RA && window.RA.log && window.RA.log.warn('[catch silenciado]', e); }
      }

      // Aristas de Tejado Resaltadas en Color Contrastado Elevadas (+0.08m)
      try {
        const elevatedRoofPositions = cartoList.map(c => Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, roofHeight + 0.08));
        const rOutline = viewer.entities.add({
          name: (bld.name || 'Edificio 3D') + ' - Aristas Tejado',
          polyline: {
            positions: [...elevatedRoofPositions, elevatedRoofPositions[0]],
            width: isSel ? 4.5 : 3.5,
            material: edgeColor,
            
             arcType: Cesium.ArcType.NONE,
            clampToGround: false, disableDepthTestDistance: Number.POSITIVE_INFINITY
          }
        });
        window._buildingEntities.push(rOutline);
      } catch(e) { window.RA && window.RA.log && window.RA.log.warn('[catch silenciado]', e); }

    // ─────────────────────────────────────────────────────────────────
    // B. CUBIERTA A DOS AGUAS — malla triangular explícita + PCA/slider
    // ─────────────────────────────────────────────────────────────────
    } else if (rType === 'gable') {

      // ── Centroide ────────────────────────────────────────────────
      let cLon = 0, cLat = 0;
      roofCartoList.forEach(c => { cLon += c.longitude; cLat += c.latitude; });
      cLon /= roofCartoList.length;  cLat /= roofCartoList.length;

      const R_EARTH = 6378137.0;
      const cosLat = Math.cos(cLat);
      const localPts = roofCartoList.map(c => ({
        x: (c.longitude - cLon) * R_EARTH * cosLat,
        y: (c.latitude  - cLat) * R_EARTH
      }));

      // ── Dirección del agua: PCA del eje corto o slider ───────────
      let sX, sY;
      if (typeof bld.roofAzimuth === 'number') {
        const azRad = bld.roofAzimuth * Math.PI / 180;
        sX = Math.sin(azRad); sY = Math.cos(azRad);
      } else {
        // PCA 2D: eigenvector del eigenvalue menor = eje corto = dirección del agua
        let sxx = 0, syy = 0, sxy = 0;
        localPts.forEach(p => { sxx += p.x*p.x; syy += p.y*p.y; sxy += p.x*p.y; });
        const tr = sxx + syy;
        const disc = Math.sqrt(Math.max(0, tr*tr/4 - (sxx*syy - sxy*sxy)));
        const lam2 = tr/2 - disc;
        // Eigenvector de λ2 — fila 0: (sxy, λ2-sxx); si es cero, fila 1: (λ2-syy, sxy)
        let evX = sxy, evY = lam2 - sxx;
        if (Math.hypot(evX, evY) < 1e-9) { evX = lam2 - syy; evY = sxy; }
        const evLen = Math.hypot(evX, evY);
        sX = evLen > 1e-9 ? evX/evLen : 1; // fallback: eje Este
        sY = evLen > 1e-9 ? evY/evLen : 0;
      }
      const rX = sY, rY = -sX; // eje de cumbrera (perpendicular al agua)

      // ── Proyecciones ─────────────────────────────────────────────
      const projS = localPts.map(p => p.x*sX + p.y*sY);
      const projR = localPts.map(p => p.x*rX + p.y*rY);
      const midS  = (Math.max(...projS) + Math.min(...projS)) / 2;
      const halfW = (Math.max(...projS) - Math.min(...projS)) / 2;
      const ridgeHeight = roofHeight + halfW * Math.tan(pitchRad);
      const maxR = Math.max(...projR), minR = Math.min(...projR);

      // ── Extremos de la cumbrera (Cartesian3) ────────────────────
      const mkRidge = (pr) => Cesium.Cartesian3.fromRadians(
        cLon + pr*rX/(R_EARTH * cosLat), cLat + pr*rY/R_EARTH, ridgeHeight);
      const r1 = mkRidge(minR), r2 = mkRidge(maxR);

      const pEaves = roofCartoList.map(c =>
        Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, roofHeight));

      // ── Helper: triángulo → PolygonGeometry (patrón idéntico al HIP) ──
      // PolygonGeometry.fromPositions con perPositionHeight:true solo funciona
      // correctamente para polígonos de 3 vértices. Es exactamente el patrón
      // que usa la cubierta a cuatro aguas (HIP) que sí renderiza bien.
      function addRoofTriangle(A, B, C, color) {
        if (!A || !B || !C) return;
        if (Cesium.Cartesian3.distance(A, B) < 0.01 || 
            Cesium.Cartesian3.distance(B, C) < 0.01 || 
            Cesium.Cartesian3.distance(A, C) < 0.01) return; // Fix: Prevenir triángulos degenerados (_target error)
        try {
          const inst = new Cesium.GeometryInstance({
            geometry: Cesium.PolygonGeometry.fromPositions({
              positions: [A, B, C],
              perPositionHeight: true
            }),
            attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(color) }
          });
          const prim = viewer.scene.primitives.add(new Cesium.Primitive({
            geometryInstances: inst,
            appearance: new Cesium.PerInstanceColorAppearance({ translucent: false, closed: true, flat: true, renderState: { polygonOffset: true, polygonOffsetFactor: 2.0, polygonOffsetUnits: 2.0 } }),
            shadows: Cesium.ShadowMode.ENABLED,
            asynchronous: false
          }));
          window._buildingPrimitives.push(prim);
        } catch(e) { window.RA && window.RA.log && window.RA.log.warn('[gable tri]', e); }
      }

      // Fan de triángulos desde el primer punto del array
      function fanTriangles(pts, color) {
        for (let i = 1; i < pts.length - 1; i++) {
          addRoofTriangle(pts[0], pts[i], pts[i + 1], color);
        }
      }

      // ── Partición faldones ────────────────────────────────────────
      const grpA = projS.map((s,i) => ({i, r: projR[i]})).filter(v => projS[v.i] >= midS)
                        .sort((a,b) => a.r - b.r).map(v => pEaves[v.i]);
      const grpB = projS.map((s,i) => ({i, r: projR[i]})).filter(v => projS[v.i] <  midS)
                        .sort((a,b) => b.r - a.r).map(v => pEaves[v.i]);

      // Faldón A: eaves asc por ridge + r2 + r1 → fan desde eave[0]
      fanTriangles([...grpA, r2, r1], roofColor);
      // Faldón B: eaves desc por ridge + r1 + r2 → fan desde eave[0]
      fanTriangles([...grpB, r1, r2], roofColor);

      // ── Hastiales triangulares (frontones) ───────────────────────
      const ridgeSpan = maxR - minR;
      const eps = ridgeSpan * 0.05;
      const hastialMinPts = pEaves.filter((_, i) => projR[i] <= minR + eps);
      const hastialMaxPts = pEaves.filter((_, i) => projR[i] >= maxR - eps);
      fanTriangles([...hastialMinPts, r1], facadeColor);
      fanTriangles([...hastialMaxPts, r2], facadeColor);

      // ── Muros verticales ─────────────────────────────────────────
      const wallPosGable = [...basePositions, basePositions[0]];
      try {
        const wi = new Cesium.GeometryInstance({
          geometry: new Cesium.WallGeometry({
            positions: wallPosGable,
            minimumHeights: wallPosGable.map(() => avgBaseHeight),
            maximumHeights: wallPosGable.map(() => roofHeight)
          }),
          attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(facadeColor) }
        });
        window._buildingPrimitives.push(viewer.scene.primitives.add(new Cesium.Primitive({
          geometryInstances: wi,
          appearance: new Cesium.PerInstanceColorAppearance({ translucent: false, closed: true, flat: true, renderState: { polygonOffset: true, polygonOffsetFactor: 2.0, polygonOffsetUnits: 2.0 } }),
          shadows: Cesium.ShadowMode.ENABLED, asynchronous: false
        })));
      } catch(e) { window.RA && window.RA.log && window.RA.log.warn('[wall gable]', e); }

      // ── Cumbrera + aristas ────────────────────────────────────────
      try {
        const r1E = mkRidge(minR); const c1 = Cesium.Cartographic.fromCartesian(r1E);
        const r2E = mkRidge(maxR); const c2 = Cesium.Cartographic.fromCartesian(r2E);
        const r1El = Cesium.Cartesian3.fromRadians(c1.longitude, c1.latitude, ridgeHeight+0.08);
        const r2El = Cesium.Cartesian3.fromRadians(c2.longitude, c2.latitude, ridgeHeight+0.08);
        const pEl  = cartoList.map(c => Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, roofHeight+0.08));

        window._buildingEntities.push(viewer.entities.add({
          name: (bld.name||'Edificio 3D')+' - Cumbrera',
          polyline: { positions:[r1El,r2El], width:5.0, material:ridgeColor,
            
             arcType: Cesium.ArcType.NONE, clampToGround: false, disableDepthTestDistance: Number.POSITIVE_INFINITY }
        }));
        window._buildingEntities.push(viewer.entities.add({
          name: (bld.name||'Edificio 3D')+' - Aristas Alero',
          polyline: { positions:[...pEl,pEl[0]], width: isSel?4.0:3.0, material:edgeColor,
            
             arcType: Cesium.ArcType.NONE, clampToGround: false, disableDepthTestDistance: Number.POSITIVE_INFINITY }
        }));
        pEl.forEach((p, vi) => {
          const nearR1 = Math.abs(projR[vi]-minR) <= Math.abs(projR[vi]-maxR);
          window._buildingEntities.push(viewer.entities.add({
            polyline: { positions:[p, nearR1?r1El:r2El], width:2.5,
              material:edgeColor.withAlpha(0.85),
               arcType: Cesium.ArcType.NONE, clampToGround: false, disableDepthTestDistance: Number.POSITIVE_INFINITY }
          }));
        });
      } catch(e) { window.RA && window.RA.log && window.RA.log.warn('[gable edges]', e); }



    // ─────────────────────────────────────────────────────────────────
    // C. CUBIERTA A UN AGUA (SHED / MONOPITCH)
    // ─────────────────────────────────────────────────────────────────
    } else if (rType === 'shed') {
      const az = (typeof bld.roofAzimuth === 'number') ? bld.roofAzimuth : 180;
      const azRad = (az * Math.PI) / 180;
      const dirX = Math.sin(azRad);
      const dirY = Math.cos(azRad);

      let cLon = 0, cLat = 0;
      roofCartoList.forEach(c => { cLon += c.longitude; cLat += c.latitude; });
      cLon /= roofCartoList.length;
      cLat /= roofCartoList.length;

      const R_EARTH = 6378137.0;
      const cosLat = Math.cos(cLat);
      const slopePositions = roofCartoList.map(c => {
        const dx = (c.longitude - cLon) * R_EARTH * cosLat;
        const dy = (c.latitude - cLat) * R_EARTH;
        const proj = dx * dirX + dy * dirY;
        const vHeight = roofHeight + proj * Math.tan(pitchRad);
        return Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, Math.max(vHeight, avgBaseHeight + 1.0));
      });

      const wallPositions = [...basePositions, basePositions[0]];
      const maxHeights = [...slopePositions.map(p => Cesium.Cartographic.fromCartesian(p).height), Cesium.Cartographic.fromCartesian(slopePositions[0]).height];

      try {
        const wallInst = new Cesium.GeometryInstance({
          geometry: new Cesium.WallGeometry({
            positions: wallPositions,
            minimumHeights: wallPositions.map(() => avgBaseHeight),
            maximumHeights: maxHeights
          }),
          attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(facadeColor) }
        });
        const wallPrim = viewer.scene.primitives.add(new Cesium.Primitive({
          geometryInstances: wallInst,
          appearance: new Cesium.PerInstanceColorAppearance({ translucent: false, closed: true, flat: true, renderState: { polygonOffset: true, polygonOffsetFactor: 2.0, polygonOffsetUnits: 2.0 } }),
          shadows: Cesium.ShadowMode.ENABLED,
          asynchronous: false
        }));
        window._buildingPrimitives.push(wallPrim);
      } catch(e) { window.RA && window.RA.log && window.RA.log.warn('[catch silenciado]', e); }

      try {
        const roofInst = new Cesium.GeometryInstance({
          geometry: Cesium.PolygonGeometry.fromPositions({
            positions: slopePositions,
            perPositionHeight: true
          }),
          attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(roofColor) },
          id: (bld.id || 'bld') + '_shed_prim'
        });
        const roofPrim = viewer.scene.primitives.add(new Cesium.Primitive({
          geometryInstances: roofInst,
          appearance: new Cesium.PerInstanceColorAppearance({ translucent: false, closed: true, flat: true, renderState: { polygonOffset: true, polygonOffsetFactor: 2.0, polygonOffsetUnits: 2.0 } }),
          shadows: Cesium.ShadowMode.ENABLED,
          asynchronous: false
        }));
        window._buildingPrimitives.push(roofPrim);
      } catch(e) { window.RA && window.RA.log && window.RA.log.warn('[catch silenciado]', e); }

      try {
        const elevatedSlopePositions = slopePositions.map(p => {
          const c = Cesium.Cartographic.fromCartesian(p);
          return Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, c.height + 0.08);
        });
        const rOutline = viewer.entities.add({
          name: (bld.name || 'Edificio 3D') + ' - Aristas Monopitch',
          polyline: {
            positions: [...elevatedSlopePositions, elevatedSlopePositions[0]],
            width: isSel ? 4.5 : 3.5,
            material: edgeColor,
            
             arcType: Cesium.ArcType.NONE,
            clampToGround: false, disableDepthTestDistance: Number.POSITIVE_INFINITY
          }
        });
        window._buildingEntities.push(rOutline);
      } catch(e) { window.RA && window.RA.log && window.RA.log.warn('[catch silenciado]', e); }

    // ─────────────────────────────────────────────────────────────────
    // D. CUBIERTA A CUATRO AGUAS (HIP / PABELLÓN)
    // ─────────────────────────────────────────────────────────────────
    } else if (rType === 'hip') {
      let cLon = 0, cLat = 0;
      roofCartoList.forEach(c => { cLon += c.longitude; cLat += c.latitude; });
      cLon /= roofCartoList.length;
      cLat /= roofCartoList.length;

      let perim = 0;
      let area2 = 0;
      const R_EARTH = 6378137.0;
      for (let i = 0; i < roofCartoList.length; i++) {
        const j = (i + 1) % roofCartoList.length;
        const x1 = roofCartoList[i].longitude * R_EARTH * Math.cos(roofCartoList[i].latitude);
        const y1 = roofCartoList[i].latitude * R_EARTH;
        const x2 = roofCartoList[j].longitude * R_EARTH * Math.cos(roofCartoList[j].latitude);
        const y2 = roofCartoList[j].latitude * R_EARTH;
        perim += Math.hypot(x2 - x1, y2 - y1);
        area2 += (x1 * y2 - x2 * y1);
      }
      const inradius = (perim > 0) ? Math.abs(area2) / perim : 3.5;
      const apexHeight = roofHeight + inradius * Math.tan(pitchRad);
      const apex = Cesium.Cartesian3.fromRadians(cLon, cLat, apexHeight);
      const pEaves = roofCartoList.map(c => Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, roofHeight));

      const wallPositions = [...basePositions, basePositions[0]];
      try {
        const wallInst = new Cesium.GeometryInstance({
          geometry: new Cesium.WallGeometry({
            positions: wallPositions,
            minimumHeights: wallPositions.map(() => avgBaseHeight),
            maximumHeights: wallPositions.map(() => roofHeight)
          }),
          attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(facadeColor) }
        });
        const wallPrim = viewer.scene.primitives.add(new Cesium.Primitive({
          geometryInstances: wallInst,
          appearance: new Cesium.PerInstanceColorAppearance({ translucent: false, closed: true, flat: true, renderState: { polygonOffset: true, polygonOffsetFactor: 2.0, polygonOffsetUnits: 2.0 } }),
          shadows: Cesium.ShadowMode.ENABLED,
          asynchronous: false
        }));
        window._buildingPrimitives.push(wallPrim);
      } catch(e) { window.RA && window.RA.log && window.RA.log.warn('[catch silenciado]', e); }

      for (let i = 0; i < pEaves.length; i++) {
        const nextI = (i + 1) % pEaves.length;
        const A = pEaves[i], B = pEaves[nextI], C = apex;
        if (Cesium.Cartesian3.distance(A, B) < 0.01 ||
            Cesium.Cartesian3.distance(B, C) < 0.01 ||
            Cesium.Cartesian3.distance(A, C) < 0.01) continue; // Prevenir colapso total de geometría
        
        const triPts = [A, B, C];
        try {
          const triInst = new Cesium.GeometryInstance({
            geometry: Cesium.PolygonGeometry.fromPositions({
              positions: triPts,
              perPositionHeight: true
            }),
            attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(roofColor) },
            id: (bld.id || 'bld') + '_hip_' + i
          });
          const triPrim = viewer.scene.primitives.add(new Cesium.Primitive({
            geometryInstances: triInst,
            appearance: new Cesium.PerInstanceColorAppearance({ translucent: false, closed: true, flat: true, renderState: { polygonOffset: true, polygonOffsetFactor: 2.0, polygonOffsetUnits: 2.0 } }),
            shadows: Cesium.ShadowMode.ENABLED,
            asynchronous: false
          }));
          window._buildingPrimitives.push(triPrim);
        } catch(e) { window.RA && window.RA.log && window.RA.log.warn('[catch silenciado]', e); }
      }

      const elevatedApex = Cesium.Cartesian3.fromRadians(cLon, cLat, apexHeight + 0.08);
      const elevatedPEaves = roofCartoList.map(c => Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, roofHeight + 0.08));

      elevatedPEaves.forEach(p => {
        try {
          const hipLine = viewer.entities.add({
            name: (bld.name || 'Edificio 3D') + ' - Limatesa',
            polyline: {
              positions: [p, elevatedApex],
              width: 3.5,
              material: ridgeColor,
              
               arcType: Cesium.ArcType.NONE,
              clampToGround: false, disableDepthTestDistance: Number.POSITIVE_INFINITY
            }
          });
          window._buildingEntities.push(hipLine);
        } catch(e) { window.RA && window.RA.log && window.RA.log.warn('[catch silenciado]', e); }
      });

      try {
        const eavesOutline = viewer.entities.add({
          polyline: {
            positions: [...elevatedPEaves, elevatedPEaves[0]],
            width: isSel ? 4.0 : 3.0,
            material: edgeColor,
             arcType: Cesium.ArcType.NONE,
            clampToGround: false, disableDepthTestDistance: Number.POSITIVE_INFINITY
          }
        });
        window._buildingEntities.push(eavesOutline);
      } catch(e) { window.RA && window.RA.log && window.RA.log.warn('[catch silenciado]', e); }
    }

    // Aristas Base Comunes y Columnas
    try {
      const baseOutline = viewer.entities.add({
        name: (bld.name || 'Edificio 3D') + ' - Base',
        polyline: {
          positions: [...basePositions, basePositions[0]],
          width: isSel ? 3.0 : 2.0,
          material: edgeColor,
           arcType: Cesium.ArcType.NONE,
          clampToGround: false, disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
      });
      window._buildingEntities.push(baseOutline);
    } catch(err) { window.RA && window.RA.log && window.RA.log.warn('[catch silenciado]', err); }

    basePositions.forEach((bPos, vi) => {
      const c = cartoList[vi];
      const rPos = Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, roofHeight);
      try {
        const colEnt = viewer.entities.add({
          name: (bld.name || 'Edificio 3D') + ' - Columna #' + (vi + 1),
          polyline: {
            positions: [bPos, rPos],
            width: isSel ? 3.0 : 2.0,
            material: edgeColor,
             arcType: Cesium.ArcType.NONE,
            clampToGround: false, disableDepthTestDistance: Number.POSITIVE_INFINITY
          }
        });
        window._buildingEntities.push(colEnt);
      } catch(err) { window.RA && window.RA.log && window.RA.log.warn('[catch silenciado]', err); }

      // Vértices de Control Interactivos de la Huella (Esferas de manipulación CAD)
      if (isSel) {
        const bldState = (typeof window !== 'undefined' && window.bldFootprintState) || (typeof bldFootprintState !== 'undefined' ? bldFootprintState : null);
        const isVtxSel = (bldState && bldState.selectedVtxIdx === vi);
        const vtxHandleColor = isVtxSel ? Cesium.Color.fromCssColorString('#F59E0B') : Cesium.Color.fromCssColorString('#38BDF8');
        try {
          const vtxHandle = viewer.entities.add({
            id: 'bld_vtx_handle_' + bld.id + '_' + vi,
            name: (bld.name || 'Edificio') + ' - Vértice Huella #' + (vi + 1),
            position: Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, avgBaseHeight + 0.1),
            point: {
              pixelSize: isVtxSel ? 16 : 11,
              color: vtxHandleColor,
              outlineColor: Cesium.Color.WHITE,
              outlineWidth: isVtxSel ? 3 : 2,
              disableDepthTestDistance: Number.POSITIVE_INFINITY
            }
          });
          window._buildingEntities.push(vtxHandle);
          if (isVtxSel) window._selectedVtxHandle = vtxHandle; // [P2] actualización barata durante drag
        } catch(e) { window.RA && window.RA.log && window.RA.log.warn('[catch silenciado]', e); }
      }
    });
  });

  if (viewer && viewer.scene && typeof viewer.scene.requestRender === 'function') {
    viewer.scene.requestRender();
  }
}

  // [P0] deleteBuilding: antes no existía en ninguna parte — el despachador universal
  // (index.html, rama 'building') comprobaba typeof deleteBuilding === 'function', siempre
  // falso, y los edificios NO se podían borrar con la tecla Supr.
  function deleteBuilding(bldId) {
    const arr = (typeof window !== 'undefined' && Array.isArray(window.buildings)) ? window.buildings : [];
    const idx = arr.findIndex(b => b && b.id === bldId);
    if (idx === -1) return false;
    if (window.RAundo) window.RAundo.snapBuildings();
    arr.splice(idx, 1);
    if (typeof window.selectedBuildingId !== 'undefined') window.selectedBuildingId = null;
    if (typeof window.wpInvalidateHeatmap === 'function') window.wpInvalidateHeatmap('Edificio eliminado');
    if (typeof window.render3DBuildingsInCesium === 'function') window.render3DBuildingsInCesium();
    if (typeof window.recalculateLayoutAndObstacles === 'function') window.recalculateLayoutAndObstacles();
    if (typeof window.showToast === 'function') window.showToast('EDIFICIO ELIMINADO', 'Edificio eliminado del proyecto. CTRL+Z para deshacer.', 'info', 2600);
    return true;
  }
  window.deleteBuilding = deleteBuilding;

  // Exportar al namespace global
  window.render3DBuildingsInCesium = render3DBuildingsInCesium;

  // Registrar en RA namespace
  if (window.RA) {
    window.RA.buildings = { render: render3DBuildingsInCesium, deleteBuilding: deleteBuilding };
  }
})();
