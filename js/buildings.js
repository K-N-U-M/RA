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

  // Asegurar registro defensivo de selección de edificios en window
  if (typeof window !== 'undefined') {
    window.selectedBuildingId = (typeof window.selectedBuildingId !== 'undefined') ? window.selectedBuildingId : null;
  }

  // ── SHADER ARQUITECTÓNICO MATE (Zero-Specular / Físico Solar) ───────────────
  // Erradica los artefactos Phong (reflejos plásticos, bandas diagonales de brillo y luz de linterna)
  const BUILDINGS_MATTE_FS = `
    in vec3 v_positionEC;
    in vec3 v_normalEC;
    in vec4 v_color;

    void main()
    {
        // Flat Shading analítico estricto por cara plana (BIM / CAD):
        // Elimina al 100% pliegues diagonales, arrugas de triangulación y sombras falsas
        vec3 dX = dFdx(v_positionEC);
        vec3 dY = dFdy(v_positionEC);
        vec3 faceNormalEC = cross(dX, dY);
        float lenSq = dot(faceNormalEC, faceNormalEC);
        vec3 normalEC = (lenSq > 1e-8) ? normalize(faceNormalEC) : normalize(v_normalEC);

    #ifdef FACE_FORWARD
        normalEC = faceforward(normalEC, vec3(0.0, 0.0, 1.0), -normalEC);
    #endif

        // Asegurar orientación hacia el observador
        if (dot(normalEC, -v_positionEC) < 0.0) {
            normalEC = -normalEC;
        }

        vec4 color = czm_gammaCorrect(v_color);

        // Iluminación solar arquitectónica mate limpia
        float nDotL = max(dot(normalEC, czm_sunDirectionEC), 0.0);
        float ambient = 0.45 + 0.15 * max(normalEC.z, 0.0);
        vec3 litColor = color.rgb * (ambient + 0.50 * nDotL * czm_lightColor);

        out_FragColor = vec4(litColor, color.a);
    }
  `;

  function createBuildingMatteAppearance(closed) {
    return new Cesium.PerInstanceColorAppearance({
      translucent: false,
      closed: (closed !== false),
      flat: false,
      renderState: { polygonOffset: true, polygonOffsetFactor: 2.0, polygonOffsetUnits: 2.0 },
      fragmentShaderSource: BUILDINGS_MATTE_FS
    });
  }

function render3DBuildingsInCesium() {
  if (typeof window !== 'undefined' && window.RAMeasureTool && typeof window.RAMeasureTool.invalidateSnapCandidates === 'function') {
    window.RAMeasureTool.invalidateSnapCandidates();
  }
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

  const bldList = (typeof buildings !== 'undefined' && Array.isArray(buildings)) ? buildings : (typeof window !== 'undefined' && Array.isArray(window.buildings) ? window.buildings : []);
  if (bldList.length === 0) {
    if (viewer && viewer.scene && typeof viewer.scene.requestRender === 'function') {
      viewer.scene.requestRender();
    }
    return;
  }

  const curSelBldId = (typeof selectedBuildingId !== 'undefined') ? selectedBuildingId : (typeof window !== 'undefined' ? window.selectedBuildingId : null);

  bldList.forEach(bld => {
    if (!bld.points || bld.points.length < 3 || bld.visible === false) return;
    const isSel = (bld && bld.id === curSelBldId);
    const baseHex = bld.facadeColor || '#F1F5F9'; // Blanco roto / panel arquitectónico por defecto
    const roofHex = bld.roofColor || '#E2E8F0';   // Cubierta técnica clara por defecto (evita quemado)

    // Usar SIEMPRE el color real elegido por el usuario para fachada y cubierta
    const facadeColor = Cesium.Color.fromCssColorString(baseHex).withAlpha(0.96);
    const roofColor = Cesium.Color.fromCssColorString(roofHex).withAlpha(0.98);

    // Matiz arquitectónico para frontones/hastiales (ligeramente sombreado para dar profundidad de contacto bajo el tejado)
    const hastialColor = facadeColor.darken(0.08, new Cesium.Color());

    // 🎨 ESTILOS CAD: Respetar fielmente el color de aristas elegido por el usuario
    const customEdgeHex = bld.edgeColor || '#334155';
    const edgeColor = Cesium.Color.fromCssColorString(customEdgeHex).withAlpha(0.95);
    const ridgeColor = Cesium.Color.fromCssColorString(customEdgeHex).withAlpha(0.95);
    const xRayDash = new Cesium.PolylineDashMaterialProperty({ color: Cesium.Color.fromCssColorString(customEdgeHex).withAlpha(0.15) });

    // [P2] Si fromCartesian falla (punto degenerado), antes se dibujaba un vértice en
    // lat/lon 0 (Golfo de Guinea) en silencio. Ahora se descarta el vértice y se avisa.
    let _degenerateVtx = false;
    const rawItems = [];
    bld.points.forEach((p, origIdx) => {
      const c = Cesium.Cartographic.fromCartesian(p);
      if (c) rawItems.push({ carto: c, origIdx: origIdx }); else _degenerateVtx = true;
    });
    if (_degenerateVtx && typeof window !== 'undefined' && typeof window.showToast === 'function') {
      window.showToast('GEOMETRÍA INVÁLIDA', (bld.name || 'Edificio') + ' tiene vértices con coordenadas inválidas y fueron descartados. Redibuja la huella si falta geometría.', 'warning', 4500);
    }

    // Filtro estricto anti-colapso WebGL: Eliminar vértices idénticos/coincidentes (distancia < 0.05 metros)
    let cartoItems = [];
    for (let i = 0; i < rawItems.length; i++) {
      if (cartoItems.length > 0) {
        const last = cartoItems[cartoItems.length - 1].carto;
        const dLon = rawItems[i].carto.longitude - last.longitude;
        const dLat = rawItems[i].carto.latitude - last.latitude;
        if (Math.hypot(dLon, dLat) < 1e-7) continue; 
      }
      cartoItems.push(rawItems[i]);
    }
    // Asegurar que el último y el primero no coincidan
    if (cartoItems.length > 2) {
      const dLon = cartoItems[0].carto.longitude - cartoItems[cartoItems.length - 1].carto.longitude;
      const dLat = cartoItems[0].carto.latitude - cartoItems[cartoItems.length - 1].carto.latitude;
      if (Math.hypot(dLon, dLat) < 1e-7) cartoItems.pop();
    }
    if (cartoItems.length < 3) return;

    let signedArea = 0;
    for (let i = 0; i < cartoItems.length; i++) {
      const j = (i + 1) % cartoItems.length;
      signedArea += (cartoItems[i].carto.longitude * cartoItems[j].carto.latitude - cartoItems[j].carto.longitude * cartoItems[i].carto.latitude);
    }
    if (signedArea < 0) {
      // Invertir solo la lista local de renderizado CCW; jamás mutar bld.points en render
      cartoItems.reverse();
    }
    const cartoList = cartoItems.map(item => item.carto);
    const origIndices = cartoItems.map(item => item.origIdx);

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
      const parH = (typeof bld.parapetHeight === 'number' && bld.parapetHeight > 0) ? bld.parapetHeight : 0;
      const parW = (typeof bld.parapetWidth === 'number' && bld.parapetWidth > 0) ? bld.parapetWidth : 0.25;
      const wallTopHeight = roofHeight + parH;
      const roofPositions = roofCartoList.map(c => Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, roofHeight));
      const nWalls = basePositions.length;

      // 1. Muros Exteriores Monolíticos (desde avgBaseHeight hasta wallTopHeight en una sola pieza continua)
      try {
        const wallInstances = [];
        for (let i = 0; i < nWalls; i++) {
          const pA = basePositions[i];
          const pB = basePositions[(i + 1) % nWalls];
          wallInstances.push(new Cesium.GeometryInstance({
            geometry: new Cesium.WallGeometry({
              positions: [pA, pB],
              minimumHeights: [avgBaseHeight, avgBaseHeight],
              maximumHeights: [wallTopHeight, wallTopHeight]
            }),
            attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(facadeColor) },
            id: (bld.id || 'bld') + '_wall_' + i
          }));
        }
        const wallPrim = viewer.scene.primitives.add(new Cesium.Primitive({
          geometryInstances: wallInstances,
          appearance: createBuildingMatteAppearance(true),
          shadows: Cesium.ShadowMode.ENABLED,
          asynchronous: false
        }));
        window._buildingPrimitives.push(wallPrim);
      } catch(e) { window.RA && window.RA.log && window.RA.log.warn('[catch silenciado]', e); }

      // 2. Pretil: Coronación superior plana y muros interiores con sombras de contacto
      let innerRoofPositions = null;
      let innerTopPositions = null;
      const outerTopPositions = cartoList.map(c => Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, wallTopHeight));

      if (parH > 0) {
        try {
          const R_EARTH = 6378137.0;
          const N = cartoList.length;
          const innerCartoList = [];
          for (let i = 0; i < N; i++) {
            const c0 = cartoList[(i - 1 + N) % N], c1 = cartoList[i], c2 = cartoList[(i + 1) % N];
            const p0x = c0.longitude * R_EARTH * Math.cos(c0.latitude), p0y = c0.latitude * R_EARTH;
            const p1x = c1.longitude * R_EARTH * Math.cos(c1.latitude), p1y = c1.latitude * R_EARTH;
            const p2x = c2.longitude * R_EARTH * Math.cos(c2.latitude), p2y = c2.latitude * R_EARTH;
            const dx1 = p1x - p0x, dy1 = p1y - p0y; const len1 = Math.hypot(dx1, dy1) || 1;
            const nx1 = -dy1/len1, ny1 = dx1/len1; // Normal interior para polígono CCW
            const dx2 = p2x - p1x, dy2 = p2y - p1y; const len2 = Math.hypot(dx2, dy2) || 1;
            const nx2 = -dy2/len2, ny2 = dx2/len2;
            let nx = nx1 + nx2, ny = ny1 + ny2; const nlen = Math.hypot(nx, ny);
            if (nlen > 1e-6) {
              nx /= nlen; ny /= nlen; let dot = nx * nx1 + ny * ny1; if (dot < 0.2) dot = 0.2;
              const disp = parW / dot;
              const ox = p1x + nx * disp, oy = p1y + ny * disp;
              innerCartoList.push({
                longitude: ox / (R_EARTH * Math.cos(c1.latitude)),
                latitude: oy / R_EARTH
              });
            } else {
              innerCartoList.push({ longitude: c1.longitude, latitude: c1.latitude });
            }
          }

          innerRoofPositions = innerCartoList.map(c => Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, roofHeight));
          innerTopPositions  = innerCartoList.map(c => Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, wallTopHeight));

          // A) Coronación superior horizontal (Coping) entre outerTop e innerTop
          const copingInstances = [];
          for (let i = 0; i < N; i++) {
            const nextI = (i + 1) % N;
            copingInstances.push(new Cesium.GeometryInstance({
              geometry: Cesium.PolygonGeometry.fromPositions({
                positions: [
                  outerTopPositions[i],
                  outerTopPositions[nextI],
                  innerTopPositions[nextI],
                  innerTopPositions[i]
                ],
                perPositionHeight: true
              }),
              attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(facadeColor) },
              id: (bld.id || 'bld') + '_coping_' + i
            }));
          }
          const copingPrim = viewer.scene.primitives.add(new Cesium.Primitive({
            geometryInstances: copingInstances,
            appearance: createBuildingMatteAppearance(true),
            shadows: Cesium.ShadowMode.ENABLED,
            asynchronous: false
          }));
          window._buildingPrimitives.push(copingPrim);

          // B) Muros interiores del pretil (con normal apuntando hacia la azotea y matiz hastialColor para sombra de contacto)
          const innerWallInstances = [];
          for (let i = 0; i < N; i++) {
            const nextI = (i + 1) % N;
            // Orden inverso [nextI, i] para que la normal de WallGeometry mire al interior de la azotea
            innerWallInstances.push(new Cesium.GeometryInstance({
              geometry: new Cesium.WallGeometry({
                positions: [innerRoofPositions[nextI], innerRoofPositions[i]],
                minimumHeights: [roofHeight, roofHeight],
                maximumHeights: [wallTopHeight, wallTopHeight]
              }),
              attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(hastialColor) },
              id: (bld.id || 'bld') + '_inner_wall_' + i
            }));
          }
          const innerWallPrim = viewer.scene.primitives.add(new Cesium.Primitive({
            geometryInstances: innerWallInstances,
            appearance: createBuildingMatteAppearance(true),
            shadows: Cesium.ShadowMode.DISABLED, // Desactivado para eliminar shadow acne y moiré interior
            asynchronous: false
          }));
          window._buildingPrimitives.push(innerWallPrim);

        } catch(e) { window.RA && window.RA.log && window.RA.log.warn('Error Pretil Monolítico:', e); }
      }

      // 3. Suelo de Cubierta (dentro del pretil si parH > 0)
      try {
        const floorPositions = (parH > 0 && innerRoofPositions && innerRoofPositions.length >= 3)
          ? innerRoofPositions
          : roofPositions;

        const roofInst = new Cesium.GeometryInstance({
          geometry: Cesium.PolygonGeometry.fromPositions({
            positions: floorPositions,
            perPositionHeight: true
          }),
          attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(roofColor) },
          id: (bld.id || 'bld') + '_roof_prim'
        });
        const roofPrim = viewer.scene.primitives.add(new Cesium.Primitive({
          geometryInstances: roofInst,
          appearance: createBuildingMatteAppearance(true),
          shadows: Cesium.ShadowMode.ENABLED,
          asynchronous: false
        }));
        window._buildingPrimitives.push(roofPrim);
      } catch(e) { window.RA && window.RA.log && window.RA.log.warn('[catch silenciado]', e); }

      // 4. Aristas y Bordes CAD (Outlines)
      try {
        const lineW = isSel ? 3.5 : 2.5;

        // A) Arista exterior en coronación
        const outerEdgePos = outerTopPositions.map(p => {
          const c = Cesium.Cartographic.fromCartesian(p);
          return Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, c.height + 0.05);
        });
        const rOutline = viewer.entities.add({
          name: (bld.name || 'Edificio 3D') + ' - Aristas Coronación',
          polyline: {
            positions: [...outerEdgePos, outerEdgePos[0]],
            width: lineW,
            material: edgeColor,
            arcType: Cesium.ArcType.NONE,
            clampToGround: false
          }
        });
        window._buildingEntities.push(rOutline);

        // B) Aristas verticales en las esquinas de fachada
        const nVtx = cartoList.length;
        for (let i = 0; i < nVtx; i++) {
          const cB = Cesium.Cartographic.fromCartesian(basePositions[i]);
          const cT = Cesium.Cartographic.fromCartesian(outerTopPositions[i]);
          const vBottom = Cesium.Cartesian3.fromRadians(cB.longitude, cB.latitude, cB.height + 0.04);
          const vTop    = Cesium.Cartesian3.fromRadians(cT.longitude, cT.latitude, cT.height + 0.04);
          const vCorner = viewer.entities.add({
            name: (bld.name || 'Edificio 3D') + ' - Esquina Fachada ' + i,
            polyline: {
              positions: [vBottom, vTop],
              width: lineW,
              material: edgeColor,
              arcType: Cesium.ArcType.NONE,
              clampToGround: false
            }
          });
          window._buildingEntities.push(vCorner);
        }

        // C) Si hay pretil: arista interior, ingletes de coronación y encuentro azotea
        if (parH > 0 && innerTopPositions && innerRoofPositions) {
          const innerTopEdgePos = innerTopPositions.map(p => {
            const c = Cesium.Cartographic.fromCartesian(p);
            return Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, c.height + 0.05);
          });
          const innerTopOutline = viewer.entities.add({
            name: (bld.name || 'Edificio 3D') + ' - Aristas Pretil Interior',
            polyline: {
              positions: [...innerTopEdgePos, innerTopEdgePos[0]],
              width: lineW,
              material: edgeColor,
              arcType: Cesium.ArcType.NONE,
              clampToGround: false
            }
          });
          window._buildingEntities.push(innerTopOutline);

          // Ingletes en las esquinas de la corona superior
          for (let i = 0; i < nVtx; i++) {
            const miterOutline = viewer.entities.add({
              name: (bld.name || 'Edificio 3D') + ' - Inglete Coronación ' + i,
              polyline: {
                positions: [outerEdgePos[i], innerTopEdgePos[i]],
                width: lineW,
                material: edgeColor,
                arcType: Cesium.ArcType.NONE,
                clampToGround: false
              }
            });
            window._buildingEntities.push(miterOutline);
          }

          // Línea de encuentro perimetral en la base del pretil sobre el suelo de la azotea
          const innerBaseEdgePos = innerRoofPositions.map(p => {
            const c = Cesium.Cartographic.fromCartesian(p);
            return Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, c.height + 0.03);
          });
          const innerBaseOutline = viewer.entities.add({
            name: (bld.name || 'Edificio 3D') + ' - Aristas Encuentro Azotea',
            polyline: {
              positions: [...innerBaseEdgePos, innerBaseEdgePos[0]],
              width: 1.5,
              material: edgeColor.withAlpha(0.40),
              arcType: Cesium.ArcType.NONE,
              clampToGround: false
            }
          });
          window._buildingEntities.push(innerBaseOutline);
        }
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
        cLon + (midS * sX + pr * rX) / (R_EARTH * cosLat),
        cLat + (midS * sY + pr * rY) / R_EARTH,
        ridgeHeight
      );
      const r1 = mkRidge(minR), r2 = mkRidge(maxR);

      const pEaves = roofCartoList.map(c =>
        Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, roofHeight));
      const nVtx = cartoList.length;
      const wallTopPositions = cartoList.map(c => Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, roofHeight));

      // ── Helper: triángulo → PolygonGeometry (patrón idéntico al HIP) ──
      // PolygonGeometry.fromPositions con perPositionHeight:true solo funciona
      // correctamente para polígonos de 3 vértices. Es exactamente el patrón
      // que usa la cubierta a cuatro aguas (HIP) que sí renderiza bien.
      function addRoofTriangle(A, B, C, color) {
        if (!A || !B || !C) return;
        if (Cesium.Cartesian3.distance(A, B) < 0.01 || 
            Cesium.Cartesian3.distance(B, C) < 0.01 || 
            Cesium.Cartesian3.distance(A, C) < 0.01) return; // Fix: Prevenir triángulos degenerados (_target error)
        const ab = Cesium.Cartesian3.subtract(B, A, new Cesium.Cartesian3());
        const ac = Cesium.Cartesian3.subtract(C, A, new Cesium.Cartesian3());
        if (Cesium.Cartesian3.magnitude(Cesium.Cartesian3.cross(ab, ac, new Cesium.Cartesian3())) < 1e-4) return;
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
            appearance: createBuildingMatteAppearance(true),
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
      const eps = Math.max(ridgeSpan * 0.05, 0.05);
      const hastialMinPts = pEaves.filter((_, i) => projR[i] <= minR + eps);
      const hastialMaxPts = pEaves.filter((_, i) => projR[i] >= maxR - eps);
      fanTriangles([...hastialMinPts, r1], hastialColor);
      fanTriangles([...hastialMaxPts, r2], hastialColor);

      // Cierre hermético de hastiales y tímpanos (Opción B)
      // Conectar vértice superior de cumbrera r1 y r2 con cada arista perimétrica
      for (let i = 0; i < nVtx; i++) {
        const nextI = (i + 1) % nVtx;
        const e1 = pEaves[i];
        const e2 = pEaves[nextI];
        const rMid = (projR[i] + projR[nextI]) / 2;
        if (Math.abs(rMid - minR) < ridgeSpan * 0.35) {
          addRoofTriangle(e1, e2, r1, hastialColor);
        } else if (Math.abs(rMid - maxR) < ridgeSpan * 0.35) {
          addRoofTriangle(e1, e2, r2, hastialColor);
        }
      }

      // ── Canto de losa y sofito inferior de alero (Propuesta 1) ────
      const roofThk = Math.max(0.05, bld.roofThickness || 0.20);
      const eavesUnder = roofCartoList.map(c =>
        Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, Math.max(avgBaseHeight + 0.5, roofHeight - roofThk)));
      const r1Under = Cesium.Cartesian3.fromRadians(cLon + (midS * sX + minR * rX) / (R_EARTH * cosLat), cLat + (midS * sY + minR * rY) / R_EARTH, ridgeHeight - roofThk);
      const r2Under = Cesium.Cartesian3.fromRadians(cLon + (midS * sX + maxR * rX) / (R_EARTH * cosLat), cLat + (midS * sY + maxR * rY) / R_EARTH, ridgeHeight - roofThk);

      // Fascia perimetral (borde de alero con grosor)
      for (let i = 0; i < nVtx; i++) {
        const nextI = (i + 1) % nVtx;
        addRoofTriangle(pEaves[i], pEaves[nextI], eavesUnder[nextI], edgeColor);
        addRoofTriangle(pEaves[i], eavesUnder[nextI], eavesUnder[i], edgeColor);
      }

      // Sofito de cierre entre fachada base y voladizo
      if (overhang > 0) {
        for (let i = 0; i < nVtx; i++) {
          const nextI = (i + 1) % nVtx;
          const wA = wallTopPositions[i];
          const wB = wallTopPositions[nextI];
          const eA = eavesUnder[i];
          const eB = eavesUnder[nextI];
          addRoofTriangle(wA, wB, eB, facadeColor);
          addRoofTriangle(wA, eB, eA, facadeColor);
        }
      }

      // ── Lucernarios y Buhardillas paramétricas (Propuesta 2) ──────
      const numSkylights = parseInt(bld.skylightCount, 10) || 0;
      if (numSkylights > 0) {
        const skyCol = Cesium.Color.fromCssColorString('#0284c7').withAlpha(0.85);
        const frameCol = Cesium.Color.fromCssColorString('#0f172a');
        const sOffsetA = midS + halfW * 0.5;
        const sOffsetB = midS - halfW * 0.5;
        const rDeltas = (numSkylights === 1) ? [0] : (numSkylights === 2 ? [-ridgeSpan * 0.22, ridgeSpan * 0.22] : [-ridgeSpan * 0.25, ridgeSpan * 0.25]);

        rDeltas.forEach((dr, sIdx) => {
          const sSide = (numSkylights === 1 || sIdx % 2 === 0) ? sOffsetA : sOffsetB;
          const sDist = Math.abs(sSide - midS);
          const zBase = roofHeight + (halfW - sDist) * Math.tan(pitchRad) + 0.05;
          const cX = (sSide * sX + ((minR + maxR) / 2 + dr) * rX);
          const cY = (sSide * sY + ((minR + maxR) / 2 + dr) * rY);
          const skyW = 0.9, skyL = 1.3;
          const p1 = Cesium.Cartesian3.fromRadians(cLon + (cX - sX*skyW/2 - rX*skyL/2)/(R_EARTH*cosLat), cLat + (cY - sY*skyW/2 - rY*skyL/2)/R_EARTH, zBase);
          const p2 = Cesium.Cartesian3.fromRadians(cLon + (cX + sX*skyW/2 - rX*skyL/2)/(R_EARTH*cosLat), cLat + (cY + sY*skyW/2 - rY*skyL/2)/R_EARTH, zBase + skyW*Math.tan(pitchRad)*0.5);
          const p3 = Cesium.Cartesian3.fromRadians(cLon + (cX + sX*skyW/2 + rX*skyL/2)/(R_EARTH*cosLat), cLat + (cY + sY*skyW/2 + rY*skyL/2)/R_EARTH, zBase + skyW*Math.tan(pitchRad)*0.5);
          const p4 = Cesium.Cartesian3.fromRadians(cLon + (cX - sX*skyW/2 + rX*skyL/2)/(R_EARTH*cosLat), cLat + (cY - sY*skyW/2 + rY*skyL/2)/R_EARTH, zBase);
          addRoofTriangle(p1, p2, p3, skyCol);
          addRoofTriangle(p1, p3, p4, skyCol);
          addRoofTriangle(p1, p2, Cesium.Cartesian3.fromRadians(cLon + cX/(R_EARTH*cosLat), cLat + cY/R_EARTH, zBase + 0.15), frameCol);
        });
      }

      // ── Muros verticales perimetrales con hastiales integrados (CAD AAA) ───
      try {
        const wallInstances = [];
        const nWalls = basePositions.length;
        for (let i = 0; i < nWalls; i++) {
          const nextI = (i + 1) % nWalls;
          const pA = basePositions[i];
          const pB = basePositions[nextI];
          const sA = projS[i], sB = projS[nextI];
          const sDiff = sB - sA;

          // Un muro es testero / hastial si su segmento cruza el plano del eje de cumbrera (midS)
          if ((sA - midS) * (sB - midS) <= 1e-6 && Math.abs(sDiff) > 1e-4) {
            const t = (midS - sA) / sDiff;
            const cA = cartoList[i];
            const cB = cartoList[nextI];
            const pRidgeBase = Cesium.Cartesian3.fromRadians(
              cA.longitude + t * (cB.longitude - cA.longitude),
              cA.latitude  + t * (cB.latitude  - cA.latitude),
              avgBaseHeight
            );

            // Muro continuo de 3 vértices: asciende triangularmente hasta ridgeHeight en el cruce de cumbrera
            wallInstances.push(new Cesium.GeometryInstance({
              geometry: new Cesium.WallGeometry({
                positions: [pA, pRidgeBase, pB],
                minimumHeights: [avgBaseHeight, avgBaseHeight, avgBaseHeight],
                maximumHeights: [roofHeight, ridgeHeight, roofHeight]
              }),
              attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(facadeColor) },
              id: (bld.id || 'bld') + '_gable_hastial_wall_' + i
            }));

            // Cierre hermético del tímpano triangular sobre el plano de fachada (hastial completo)
            const pATop = wallTopPositions[i];
            const pBTop = wallTopPositions[nextI];
            const pRidgeTop = Cesium.Cartesian3.fromRadians(
              cA.longitude + t * (cB.longitude - cA.longitude),
              cA.latitude  + t * (cB.latitude  - cA.latitude),
              ridgeHeight
            );
            // Triangulación frontal y dorsal para garantizar visibilidad sin backface culling
            addRoofTriangle(pATop, pRidgeTop, pBTop, facadeColor);
            addRoofTriangle(pATop, pBTop, pRidgeTop, facadeColor);

            // Sellar también el contacto con el sofito / losa del alero superior
            const rMidPoint = Math.abs(projR[i] - minR) <= Math.abs(projR[i] - maxR) ? r1 : r2;
            addRoofTriangle(pATop, rMidPoint, pRidgeTop, facadeColor);
            addRoofTriangle(pBTop, rMidPoint, pRidgeTop, facadeColor);
          } else {
            // Muro lateral longitudinal (paralelo a cumbrera, cota constante roofHeight)
            wallInstances.push(new Cesium.GeometryInstance({
              geometry: new Cesium.WallGeometry({
                positions: [pA, pB],
                minimumHeights: [avgBaseHeight, avgBaseHeight],
                maximumHeights: [roofHeight, roofHeight]
              }),
              attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(facadeColor) },
              id: (bld.id || 'bld') + '_gable_wall_' + i
            }));
          }
        }
        window._buildingPrimitives.push(viewer.scene.primitives.add(new Cesium.Primitive({
          geometryInstances: wallInstances,
          appearance: createBuildingMatteAppearance(true),
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
      const rawSlopeHeights = roofCartoList.map(c => {
        const dx = (c.longitude - cLon) * R_EARTH * cosLat;
        const dy = (c.latitude - cLat) * R_EARTH;
        const proj = dx * dirX + dy * dirY;
        return roofHeight + proj * Math.tan(pitchRad);
      });
      // Desplazar rígidamente todo el faldón si el alero bajo cae de la cota mínima (evita alabeo por clamp individual)
      const minSlopeH = rawSlopeHeights.length > 0 ? Math.min(...rawSlopeHeights) : roofHeight;
      const shedLift = Math.max(0, (avgBaseHeight + 1.0) - minSlopeH);
      const slopePositions = roofCartoList.map((c, idx) =>
        Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, rawSlopeHeights[idx] + shedLift)
      );

      try {
        const wallInstances = [];
        const nWalls = basePositions.length;
        for (let i = 0; i < nWalls; i++) {
          const pA = basePositions[i];
          const pB = basePositions[(i + 1) % nWalls];
          const hA = Cesium.Cartographic.fromCartesian(slopePositions[i]).height;
          const hB = Cesium.Cartographic.fromCartesian(slopePositions[(i + 1) % nWalls]).height;
          wallInstances.push(new Cesium.GeometryInstance({
            geometry: new Cesium.WallGeometry({
              positions: [pA, pB],
              minimumHeights: [avgBaseHeight, avgBaseHeight],
              maximumHeights: [hA, hB]
            }),
            attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(facadeColor) },
            id: (bld.id || 'bld') + '_shed_wall_' + i
          }));
        }
        const wallPrim = viewer.scene.primitives.add(new Cesium.Primitive({
          geometryInstances: wallInstances,
          appearance: createBuildingMatteAppearance(true),
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
          appearance: createBuildingMatteAppearance(true),
          shadows: Cesium.ShadowMode.ENABLED,
          asynchronous: false
        }));
        window._buildingPrimitives.push(roofPrim);
      } catch(e) { window.RA && window.RA.log && window.RA.log.warn('[catch silenciado]', e); }

      try {
        const roofThk = Math.max(0.05, bld.roofThickness || 0.20);
        const slopeUnder = slopePositions.map(p => {
          const c = Cesium.Cartographic.fromCartesian(p);
          return Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, Math.max(avgBaseHeight + 0.5, c.height - roofThk));
        });

        // Fascia perimetral de canto
        const fasciaInstances = [];
        const nShed = slopePositions.length;
        for (let i = 0; i < nShed; i++) {
          const nextI = (i + 1) % nShed;
          fasciaInstances.push(new Cesium.GeometryInstance({
            geometry: Cesium.PolygonGeometry.fromPositions({
              positions: [slopePositions[i], slopePositions[nextI], slopeUnder[nextI]],
              perPositionHeight: true
            }),
            attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(edgeColor) }
          }));
          fasciaInstances.push(new Cesium.GeometryInstance({
            geometry: Cesium.PolygonGeometry.fromPositions({
              positions: [slopePositions[i], slopeUnder[nextI], slopeUnder[i]],
              perPositionHeight: true
            }),
            attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(edgeColor) }
          }));
        }
        if (fasciaInstances.length > 0) {
          window._buildingPrimitives.push(viewer.scene.primitives.add(new Cesium.Primitive({
            geometryInstances: fasciaInstances,
            appearance: createBuildingMatteAppearance(true),
            shadows: Cesium.ShadowMode.ENABLED,
            asynchronous: false
          })));
        }

        // Lucernario en monopitch
        const numSkylights = parseInt(bld.skylightCount, 10) || 0;
        if (numSkylights > 0 && nShed >= 3) {
          const skyCol = Cesium.Color.fromCssColorString('#0284c7').withAlpha(0.85);
          const cCarto = Cesium.Cartographic.fromRadians(cLon, cLat, roofHeight + 0.5);
          const cCenter = Cesium.Cartesian3.fromRadians(cLon, cLat, roofHeight + 0.5);
          const skyInst = new Cesium.GeometryInstance({
            geometry: Cesium.PolygonGeometry.fromPositions({
              positions: [
                Cesium.Cartesian3.fromRadians(cLon - 0.00001, cLat - 0.00001, roofHeight + 0.6),
                Cesium.Cartesian3.fromRadians(cLon + 0.00001, cLat - 0.00001, roofHeight + 0.7),
                Cesium.Cartesian3.fromRadians(cLon + 0.00001, cLat + 0.00001, roofHeight + 0.7),
                Cesium.Cartesian3.fromRadians(cLon - 0.00001, cLat + 0.00001, roofHeight + 0.6)
              ],
              perPositionHeight: true
            }),
            attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(skyCol) }
          });
          window._buildingPrimitives.push(viewer.scene.primitives.add(new Cesium.Primitive({
            geometryInstances: skyInst,
            appearance: createBuildingMatteAppearance(true),
            shadows: Cesium.ShadowMode.ENABLED,
            asynchronous: false
          })));
        }
      } catch(eThk) { window.RA && window.RA.log && window.RA.log.warn('[shed thickness]', eThk); }

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

      try {
        const wallInstances = [];
        const nWalls = basePositions.length;
        for (let i = 0; i < nWalls; i++) {
          const pA = basePositions[i];
          const pB = basePositions[(i + 1) % nWalls];
          wallInstances.push(new Cesium.GeometryInstance({
            geometry: new Cesium.WallGeometry({
              positions: [pA, pB],
              minimumHeights: [avgBaseHeight, avgBaseHeight],
              maximumHeights: [roofHeight, roofHeight]
            }),
            attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(facadeColor) },
            id: (bld.id || 'bld') + '_hip_wall_' + i
          }));
        }
        const wallPrim = viewer.scene.primitives.add(new Cesium.Primitive({
          geometryInstances: wallInstances,
          appearance: createBuildingMatteAppearance(true),
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
            appearance: createBuildingMatteAppearance(true),
            shadows: Cesium.ShadowMode.ENABLED,
            asynchronous: false
          }));
          window._buildingPrimitives.push(triPrim);
        } catch(e) { window.RA && window.RA.log && window.RA.log.warn('[catch silenciado]', e); }
      }

      const roofThk = Math.max(0.05, bld.roofThickness || 0.20);
      const eavesUnder = roofCartoList.map(c =>
        Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, Math.max(avgBaseHeight + 0.5, roofHeight - roofThk)));
      const apexUnder = Cesium.Cartesian3.fromRadians(cLon, cLat, Math.max(avgBaseHeight + 0.5, apexHeight - roofThk));

      // Fascia perimetral de alero (canto del faldón hip)
      for (let i = 0; i < pEaves.length; i++) {
        const nextI = (i + 1) % pEaves.length;
        try {
          const f1 = new Cesium.GeometryInstance({
            geometry: Cesium.PolygonGeometry.fromPositions({
              positions: [pEaves[i], pEaves[nextI], eavesUnder[nextI]],
              perPositionHeight: true
            }),
            attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(edgeColor) }
          });
          const f2 = new Cesium.GeometryInstance({
            geometry: Cesium.PolygonGeometry.fromPositions({
              positions: [pEaves[i], eavesUnder[nextI], eavesUnder[i]],
              perPositionHeight: true
            }),
            attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(edgeColor) }
          });
          window._buildingPrimitives.push(viewer.scene.primitives.add(new Cesium.Primitive({
            geometryInstances: [f1, f2],
            appearance: createBuildingMatteAppearance(true),
            shadows: Cesium.ShadowMode.ENABLED,
            asynchronous: false
          })));
        } catch(eFascia) {}
      }

      // Sofito de cierre entre fachada base y voladizo
      if (overhang > 0) {
        const wallTopPos = cartoList.map(c => Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, roofHeight));
        for (let i = 0; i < wallTopPos.length; i++) {
          const nextI = (i + 1) % wallTopPos.length;
          try {
            const s1 = new Cesium.GeometryInstance({
              geometry: Cesium.PolygonGeometry.fromPositions({
                positions: [wallTopPos[i], wallTopPos[nextI], eavesUnder[nextI]],
                perPositionHeight: true
              }),
              attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(facadeColor) }
            });
            const s2 = new Cesium.GeometryInstance({
              geometry: Cesium.PolygonGeometry.fromPositions({
                positions: [wallTopPos[i], eavesUnder[nextI], eavesUnder[i]],
                perPositionHeight: true
              }),
              attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(facadeColor) }
            });
            window._buildingPrimitives.push(viewer.scene.primitives.add(new Cesium.Primitive({
              geometryInstances: [s1, s2],
              appearance: createBuildingMatteAppearance(true),
              shadows: Cesium.ShadowMode.ENABLED,
              asynchronous: false
            })));
          } catch(eSof) {}
        }
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

    // ─────────────────────────────────────────────────────────────────
    // E. CUBIERTA EN FORMA DE L (CATÁLOGO ARQUITECTÓNICO & ÁNGULO VARIABLE)
    // ─────────────────────────────────────────────────────────────────
    } else if (rType === 'l_shape') {
      let handledL = false;
      if (typeof window !== 'undefined' && window.RALBuilding && typeof window.RALBuilding.renderLBuilding === 'function') {
        handledL = !!window.RALBuilding.renderLBuilding({
          bld: bld,
          viewer: viewer,
          cartoList: cartoList,
          roofCartoList: roofCartoList,
          avgBaseHeight: avgBaseHeight,
          bldHeight: bldHeight,
          isSel: isSel,
          facadeColor: facadeColor,
          roofColor: roofColor,
          hastialColor: hastialColor,
          edgeColor: edgeColor,
          ridgeColor: ridgeColor,
          createAppearance: createBuildingMatteAppearance
        });
      }
      if (!handledL) {
      const N = cartoList.length;
      let cLon = 0, cLat = 0;
      roofCartoList.forEach(c => { cLon += c.longitude; cLat += c.latitude; });
      cLon /= roofCartoList.length;
      cLat /= roofCartoList.length;

      const R_EARTH = 6378137.0;
      const cosLat = Math.cos(cLat);
      const localPts = roofCartoList.map(c => ({
        x: (c.longitude - cLon) * R_EARTH * cosLat,
        y: (c.latitude  - cLat) * R_EARTH
      }));

      // 1. Identificar el vértice de esquina cóncava interior (esquina de la L)
      let reflexIdx = -1;
      let minCross = 0;
      for (let i = 0; i < N; i++) {
        const prev = localPts[(i - 1 + N) % N];
        const curr = localPts[i];
        const next = localPts[(i + 1) % N];
        const dx1 = curr.x - prev.x, dy1 = curr.y - prev.y;
        const dx2 = next.x - curr.x, dy2 = next.y - curr.y;
        const cross = dx1 * dy2 - dy1 * dx2;
        if (cross < minCross) {
          minCross = cross;
          reflexIdx = i;
        }
      }
      if (reflexIdx < 0) reflexIdx = 0; // Fallback por convexidad suave

      // 2. Muros perimetrales del volumen completo en L
      try {
        const wallInstances = [];
        const nWalls = basePositions.length;
        for (let i = 0; i < nWalls; i++) {
          const pA = basePositions[i];
          const pB = basePositions[(i + 1) % nWalls];
          wallInstances.push(new Cesium.GeometryInstance({
            geometry: new Cesium.WallGeometry({
              positions: [pA, pB],
              minimumHeights: [avgBaseHeight, avgBaseHeight],
              maximumHeights: [roofHeight, roofHeight]
            }),
            attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(facadeColor) },
            id: (bld.id || 'bld') + '_l_wall_' + i
          }));
        }
        window._buildingPrimitives.push(viewer.scene.primitives.add(new Cesium.Primitive({
          geometryInstances: wallInstances,
          appearance: createBuildingMatteAppearance(true),
          shadows: Cesium.ShadowMode.ENABLED,
          asynchronous: false
        })));
      } catch(eLWall) { window.RA && window.RA.log && window.RA.log.warn('[L wall]', eLWall); }

      // 3. Geometría de cubiertas: cumbreras de ala 1 y ala 2 con unión en limahoya
      const pEaves = roofCartoList.map(c => Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, roofHeight));
      const roofThk = Math.max(0.05, bld.roofThickness || 0.20);
      const eavesUnder = roofCartoList.map(c =>
        Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, Math.max(avgBaseHeight + 0.5, roofHeight - roofThk)));

      // Centro del encuentro y nudo de limahoya
      const reflexPt = pEaves[reflexIdx];
      const oppIdx = (reflexIdx + Math.floor(N / 2)) % N;
      const oppPt = pEaves[oppIdx];

      // Altura de cumbrera principal basada en la luz transversal del ala
      const avgWingSpan = Math.max(3.0, Cesium.Cartesian3.distance(reflexPt, oppPt) * 0.45);
      const ridgeHeight = roofHeight + avgWingSpan * Math.tan(pitchRad);

      // Cumbrera central de unión (nodo de cumbrera)
      const c1 = Cesium.Cartographic.fromCartesian(reflexPt);
      const c2 = Cesium.Cartographic.fromCartesian(oppPt);
      const ridgeHub = Cesium.Cartesian3.fromRadians(
        (c1.longitude + c2.longitude) / 2,
        (c1.latitude + c2.latitude) / 2,
        ridgeHeight
      );

      // Triangulación de faldones hacia las cumbreras articuladas
      for (let i = 0; i < N; i++) {
        const nextI = (i + 1) % N;
        const A = pEaves[i];
        const B = pEaves[nextI];
        const C = ridgeHub;

        if (Cesium.Cartesian3.distance(A, B) > 0.05) {
          try {
            const triInst = new Cesium.GeometryInstance({
              geometry: Cesium.PolygonGeometry.fromPositions({
                positions: [A, B, C],
                perPositionHeight: true
              }),
              attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(roofColor) },
              id: (bld.id || 'bld') + '_l_roof_' + i
            });
            window._buildingPrimitives.push(viewer.scene.primitives.add(new Cesium.Primitive({
              geometryInstances: triInst,
              appearance: createBuildingMatteAppearance(true),
              shadows: Cesium.ShadowMode.ENABLED,
              asynchronous: false
            })));

            // Canto de alero en el perímetro
            const f1 = new Cesium.GeometryInstance({
              geometry: Cesium.PolygonGeometry.fromPositions({
                positions: [A, B, eavesUnder[nextI]],
                perPositionHeight: true
              }),
              attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(edgeColor) }
            });
            const f2 = new Cesium.GeometryInstance({
              geometry: Cesium.PolygonGeometry.fromPositions({
                positions: [A, eavesUnder[nextI], eavesUnder[i]],
                perPositionHeight: true
              }),
              attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(edgeColor) }
            });
            window._buildingPrimitives.push(viewer.scene.primitives.add(new Cesium.Primitive({
              geometryInstances: [f1, f2],
              appearance: createBuildingMatteAppearance(true),
              shadows: Cesium.ShadowMode.ENABLED,
              asynchronous: false
            })));
          } catch(eTriL) {}
        }
      }

      // Sofito de cierre inferior si hay voladizo
      if (overhang > 0) {
        const wallTopPos = cartoList.map(c => Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, roofHeight));
        for (let i = 0; i < N; i++) {
          const nextI = (i + 1) % N;
          try {
            const s1 = new Cesium.GeometryInstance({
              geometry: Cesium.PolygonGeometry.fromPositions({
                positions: [wallTopPos[i], wallTopPos[nextI], eavesUnder[nextI]],
                perPositionHeight: true
              }),
              attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(facadeColor) }
            });
            const s2 = new Cesium.GeometryInstance({
              geometry: Cesium.PolygonGeometry.fromPositions({
                positions: [wallTopPos[i], eavesUnder[nextI], eavesUnder[i]],
                perPositionHeight: true
              }),
              attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(facadeColor) }
            });
            window._buildingPrimitives.push(viewer.scene.primitives.add(new Cesium.Primitive({
              geometryInstances: [s1, s2],
              appearance: createBuildingMatteAppearance(true),
              shadows: Cesium.ShadowMode.ENABLED,
              asynchronous: false
            })));
          } catch(eSofL) {}
        }
      }

      // Limahoya en el rincón entrante (valle que desagua hacia el vértice cóncavo)
      try {
        const valleyLine = viewer.entities.add({
          name: (bld.name || 'Edificio 3D') + ' - Limahoya (Valle)',
          polyline: {
            positions: [reflexPt, ridgeHub],
            width: 4.5,
            material: Cesium.Color.fromCssColorString('#38bdf8'),
            arcType: Cesium.ArcType.NONE,
            clampToGround: false,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          }
        });
        window._buildingEntities.push(valleyLine);

        const hubElevated = Cesium.Cartesian3.fromRadians(
          Cesium.Cartographic.fromCartesian(ridgeHub).longitude,
          Cesium.Cartographic.fromCartesian(ridgeHub).latitude,
          Cesium.Cartographic.fromCartesian(ridgeHub).height + 0.08
        );
        const pEavesElevated = pEaves.map(p => {
          const c = Cesium.Cartographic.fromCartesian(p);
          return Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, c.height + 0.08);
        });

        const eavesOutline = viewer.entities.add({
          polyline: {
            positions: [...pEavesElevated, pEavesElevated[0]],
            width: isSel ? 4.0 : 3.0,
            material: edgeColor,
            arcType: Cesium.ArcType.NONE,
            clampToGround: false,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          }
        });
        window._buildingEntities.push(eavesOutline);
      } catch(eVal) {}
      }
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
      const realIdx = (Array.isArray(origIndices) && typeof origIndices[vi] === 'number') ? origIndices[vi] : vi;
      const rPos = Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, roofHeight);
      try {
        const colEnt = viewer.entities.add({
          name: (bld.name || 'Edificio 3D') + ' - Columna #' + (realIdx + 1),
          polyline: {
            positions: [bPos, rPos],
            width: isSel ? 3.5 : 2.5,
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
        const isVtxSel = (bldState && bldState.selectedVtxIdx === realIdx);
        const vtxHandleColor = isVtxSel ? Cesium.Color.fromCssColorString('#F59E0B') : Cesium.Color.fromCssColorString('#38BDF8');
        try {
          const vtxHandle = viewer.entities.add({
            id: 'bld_vtx_handle_' + bld.id + '_' + realIdx,
            name: (bld.name || 'Edificio') + ' - Vértice Huella #' + (realIdx + 1),
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

    // ── Indicador Visual de Lado Guía / Ejes de Construcción (CAD Local Frame) ──
    if (isSel && typeof computeBuildingConstructionAxes === 'function') {
      try {
        const bAxes = computeBuildingConstructionAxes(bld);
        if (bAxes && bAxes.axisMode === 'wall' && typeof bAxes.edgeIdx === 'number' && Array.isArray(bld.points) && bld.points[bAxes.edgeIdx]) {
          const eIdx = bAxes.edgeIdx;
          const nextIdx = (eIdx + 1) % bld.points.length;
          const c1 = Cesium.Cartographic.fromCartesian(bld.points[eIdx]);
          const c2 = Cesium.Cartographic.fromCartesian(bld.points[nextIdx]);
          if (c1 && c2) {
          const refP1 = Cesium.Cartesian3.fromRadians(c1.longitude, c1.latitude, avgBaseHeight + 0.14);
          const refP2 = Cesium.Cartesian3.fromRadians(c2.longitude, c2.latitude, avgBaseHeight + 0.14);

          const refWallEnt = viewer.entities.add({
            name: (bld.name || 'Edificio') + ' - Muro Guía Eje X/U (Lado #' + (eIdx + 1) + ')',
            polyline: {
              positions: [refP1, refP2],
              width: 5.5,
              material: new Cesium.PolylineGlowMaterialProperty({
                glowPower: 0.25,
                color: Cesium.Color.fromCssColorString('#EF4444')
              }),
              arcType: Cesium.ArcType.NONE,
              clampToGround: false,
              disableDepthTestDistance: Number.POSITIVE_INFINITY
            }
          });
          window._buildingEntities.push(refWallEnt);

          // Escuadra ortogonal Eje V (Verde) en la esquina de origen del muro guía
          const vLen = Math.min(Math.max(bAxes.edgeLength * 0.25, 1.5), 4.5);
          const refPV = Cesium.Cartesian3.add(
            refP1,
            Cesium.Cartesian3.multiplyByScalar(bAxes.vVec, vLen, new Cesium.Cartesian3()),
            new Cesium.Cartesian3()
          );
          const refOrthoEnt = viewer.entities.add({
            name: (bld.name || 'Edificio') + ' - Eje V Ortogonal (Fondo 90°)',
            polyline: {
              positions: [refP1, refPV],
              width: 4.5,
              material: new Cesium.PolylineGlowMaterialProperty({
                glowPower: 0.22,
                color: Cesium.Color.fromCssColorString('#10B981')
              }),
              arcType: Cesium.ArcType.NONE,
              clampToGround: false,
              disableDepthTestDistance: Number.POSITIVE_INFINITY
            }
          });
          window._buildingEntities.push(refOrthoEnt);
          }
        }
      } catch(eAxesVis) { window.RA && window.RA.log && window.RA.log.warn('[catch silenciado]', eAxesVis); }
    }
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
    const bld = arr[idx];
    if (window.RAundo && typeof window.RAundo.snapProject === 'function') {
      window.RAundo.snapProject('Eliminar edificio ' + (bld.name || bldId));
    } else if (window.RAundo && typeof window.RAundo.snapBuildings === 'function') {
      window.RAundo.snapBuildings('Eliminar edificio ' + (bld.name || bldId));
    }

    // 1. Limpieza en cascada in-place de planos de cubierta y faldones/paneles asociados
    if (typeof window.WP !== 'undefined' && window.WP) {
      const wp = window.WP;
      const oldPlanes = Array.isArray(wp.planes) ? wp.planes : [];
      const removedPlaneIndices = new Set();
      const indexMap = new Map();
      let nextPlaneIdx = 0;
      for (let i = 0; i < oldPlanes.length; i++) {
        const pl = oldPlanes[i];
        if (!pl || pl.buildingId === bldId || (pl.id && (pl.id.startsWith('plane_roof_' + bldId) || pl.id.includes(bldId)))) {
          removedPlaneIndices.add(i);
        } else {
          indexMap.set(i, nextPlaneIdx++);
        }
      }
      if (Array.isArray(wp.planes)) {
        for (let i = wp.planes.length - 1; i >= 0; i--) {
          if (removedPlaneIndices.has(i)) wp.planes.splice(i, 1);
        }
        if (wp.activePlaneIdx >= wp.planes.length) wp.activePlaneIdx = Math.max(-1, wp.planes.length - 1);
        if (wp.activePlaneIdx < 0 && wp.planes.length > 0) wp.activePlaneIdx = 0;
      }
      if (Array.isArray(wp.polylines)) {
        for (let i = wp.polylines.length - 1; i >= 0; i--) {
          const poly = wp.polylines[i];
          if (!poly || poly.buildingId === bldId || removedPlaneIndices.has(poly.planeIdx)) {
            wp.polylines.splice(i, 1);
          } else if (typeof poly.planeIdx === 'number' && indexMap.has(poly.planeIdx)) {
            poly.planeIdx = indexMap.get(poly.planeIdx);
          }
        }
        if (wp.selectedPolyIdx >= wp.polylines.length) wp.selectedPolyIdx = Math.max(-1, wp.polylines.length - 1);
      }
    }

    // 2. Limpieza en cascada in-place de obstáculos asociados (preserva alias de array compartido)
    if (typeof window.obstacles !== 'undefined' && Array.isArray(window.obstacles)) {
      for (let i = window.obstacles.length - 1; i >= 0; i--) {
        const obs = window.obstacles[i];
        if (!obs || obs.buildingId === bldId || (obs.planeId && obs.planeId.includes(bldId))) {
          window.obstacles.splice(i, 1);
        }
      }
    }

    // 3. Eliminar edificio
    arr.splice(idx, 1);
    if (typeof window.selectedBuildingId !== 'undefined') window.selectedBuildingId = null;

    // 4. Refrescar escena y motores
    if (typeof window.wpClearAllPlaneGizmos === 'function') window.wpClearAllPlaneGizmos();
    if (typeof window.wpRenderAllPolylines === 'function') window.wpRenderAllPolylines();
    if (typeof window.wpFastRenderSimulatedPanels === 'function') window.wpFastRenderSimulatedPanels();
    if (typeof window.render3DBuildingsInCesium === 'function') window.render3DBuildingsInCesium();
    if (typeof window.render3DObstaclesInCesium === 'function') window.render3DObstaclesInCesium();
    if (typeof window.recalculateLayoutAndObstacles === 'function') window.recalculateLayoutAndObstacles();
    if (typeof window.wpInvalidateHeatmap === 'function') window.wpInvalidateHeatmap('Edificio y faldones eliminados');
    if (typeof window.wpUpdateUI === 'function') window.wpUpdateUI();
    if (typeof window.showToast === 'function') window.showToast('EDIFICIO ELIMINADO', 'Edificio y faldones asociados eliminados en cascada. CTRL+Z para deshacer.', 'info', 2600);
    return true;
  }
  window.deleteBuilding = deleteBuilding;

  // ── RECTÁNGULO CAD ASISTIDO (Opción 2: P1 -> P2 [Fachada] -> Fondo Lado B) ──
  const bldRectState = {
    active: false,
    step: 0, // 0: esperando P1, 1: esperando P2, 2: esperando fondo Lado B
    p1: null,
    p2: null,
    p3: null,
    p4: null,
    ladoA: 0,
    ladoB: 0,
    dirU: null,
    dirV: null,
    normalUp: null,
    cursorPos: null,
    previewLine: null,
    previewRect: null,
    tempEntities: []
  };

  function clearBuildingRectTempEntities() {
    if (typeof window !== 'undefined' && window.viewer && bldRectState.tempEntities.length > 0) {
      bldRectState.tempEntities.forEach(e => {
        try { window.viewer.entities.remove(e); } catch(err) {}
      });
      bldRectState.tempEntities = [];
    }
    bldRectState.previewLine = null;
    bldRectState.previewRect = null;
  }

  function getBuildingRectHudElement() {
    if (typeof document === 'undefined') return null;
    let el = document.getElementById('ra-bld-rect-hud');
    if (!el) {
      el = document.createElement('div');
      el.id = 'ra-bld-rect-hud';
      el.style.cssText = 'display:none;position:fixed;top:65px;left:50%;transform:translateX(-50%);background:rgba(15,23,42,0.95);border:1px solid #818cf8;box-shadow:0 12px 30px -4px rgba(0,0,0,0.7),0 0 20px rgba(99,102,241,0.35);border-radius:10px;padding:12px 18px;z-index:99999;backdrop-filter:blur(10px);color:#f8fafc;font-family:inherit;min-width:340px;pointer-events:auto;';
      el.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <span style="font-size:11px;font-weight:800;color:#818cf8;display:flex;align-items:center;gap:6px;">
            <span>📐</span> RECTÁNGULO CAD ASISTIDO
          </span>
          <span id="ra-bld-rect-step-badge" style="font-size: 10px;padding:2px 8px;border-radius:4px;background:#4338ca;color:#e0e7ff;font-weight:bold;">
            PASO 1 DE 2
          </span>
        </div>
        <div id="ra-bld-rect-help-text" style="font-size:10px;color:#cbd5e1;margin-bottom:10px;line-height:1.4;">
          Haz clic en el terreno para marcar la primera esquina de la nave (P1).
        </div>
        <div style="display:flex;gap:8px;margin-bottom:10px;">
          <div style="flex:1;">
            <label style="font-size: 10px;color:#94a3b8;display:block;margin-bottom:2px;">Fachada / Lado A (m):</label>
            <input type="number" id="ra-bld-rect-input-a" min="1" max="1000" step="0.5" value="0.0" style="width:100%;background:rgba(0,0,0,0.5);border:1px solid #6366f1;color:#fff;font-size:11px;padding:4px 6px;border-radius:4px;text-align:right;font-weight:bold;" readonly>
          </div>
          <div style="flex:1;">
            <label style="font-size: 10px;color:#94a3b8;display:block;margin-bottom:2px;">Fondo / Lado B (m):</label>
            <input type="number" id="ra-bld-rect-input-b" min="1" max="1000" step="0.5" value="0.0" style="width:100%;background:rgba(0,0,0,0.5);border:1px solid #6366f1;color:#fff;font-size:11px;padding:4px 6px;border-radius:4px;text-align:right;font-weight:bold;">
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid rgba(255,255,255,0.1);padding-top:8px;">
          <span id="ra-bld-rect-area-label" style="font-size:10px;color:#38bdf8;font-weight:bold;">Área: 0.0 m²</span>
          <div style="display:flex;gap:6px;">
            <button type="button" id="ra-bld-rect-cancel-btn" style="padding:4px 10px;font-size: 10px;background:rgba(239,68,68,0.25);border:1px solid #ef4444;color:#fca5a5;border-radius:4px;cursor:pointer;">Cancelar (Esc)</button>
            <button type="button" id="ra-bld-rect-confirm-btn" style="padding:4px 12px;font-size: 10px;background:linear-gradient(135deg, #4f46e5, #4338ca);border:1px solid #818cf8;color:#fff;border-radius:4px;font-weight:bold;cursor:pointer;">Confirmar (Enter)</button>
          </div>
        </div>
      `;
      document.body.appendChild(el);

      const cancelBtn = el.querySelector('#ra-bld-rect-cancel-btn');
      if (cancelBtn) cancelBtn.onclick = () => cancelBuildingRect();

      const confirmBtn = el.querySelector('#ra-bld-rect-confirm-btn');
      if (confirmBtn) {
        confirmBtn.onclick = () => {
          const inB = parseFloat(document.getElementById('ra-bld-rect-input-b').value) || 0;
          finishBuildingRect(inB > 0 ? inB : null);
        };
      }

      const inputB = el.querySelector('#ra-bld-rect-input-b');
      if (inputB) {
        inputB.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            const val = parseFloat(inputB.value) || 0;
            finishBuildingRect(val > 0 ? val : null);
          } else if (e.key === 'Escape') {
            cancelBuildingRect();
          }
        });
        inputB.addEventListener('input', () => {
          const val = parseFloat(inputB.value) || 0;
          if (bldRectState.step === 2 && val > 0 && bldRectState.p1 && bldRectState.p2 && bldRectState.dirV) {
            updateBuildingRectWithDistance(val);
          }
        });
      }
    }
    return el;
  }

  function startDrawingBuildingRect() {
    if (typeof window.closeActiveDrawMenu === 'function') window.closeActiveDrawMenu();
    if (typeof window.setAppMode === 'function') window.setAppMode('draw');
    if (typeof window.WP !== 'undefined' && window.WP) {
      window.WP.mode = 'draw-building-rect';
    }
    bldRectState.active = true;
    bldRectState.step = 0;
    bldRectState.p1 = null;
    bldRectState.p2 = null;
    bldRectState.p3 = null;
    bldRectState.p4 = null;
    bldRectState.ladoA = 0;
    bldRectState.ladoB = 0;
    clearBuildingRectTempEntities();

    const hud = getBuildingRectHudElement();
    if (hud) {
      hud.style.display = 'block';
      const badge = hud.querySelector('#ra-bld-rect-step-badge');
      if (badge) { badge.textContent = 'PASO 1/2'; badge.style.background = '#4338ca'; }
      const help = hud.querySelector('#ra-bld-rect-help-text');
      if (help) help.textContent = 'Haz clic en el terreno para marcar la primera esquina de la nave o edificio (P1).';
      const inA = hud.querySelector('#ra-bld-rect-input-a');
      if (inA) inA.value = '0.0';
      const inB = hud.querySelector('#ra-bld-rect-input-b');
      if (inB) inB.value = '0.0';
      const area = hud.querySelector('#ra-bld-rect-area-label');
      if (area) area.textContent = 'Área: 0.0 m²';
    }

    const confBar = (typeof document !== 'undefined') ? document.getElementById('ra-confirm-bar') : null;
    if (confBar) {
      confBar.style.display = 'flex';
      if (typeof window.setElemText === 'function') {
        window.setElemText('confirm-bar-text', '📐 HUELLA RECTANGULAR CAD: Clic 1 (P1) -> Clic 2 (P2 / Fachada) -> Fondo (Lado B en metros o Clic 3).');
      }
    }
    const cancelBldBtn = (typeof document !== 'undefined') ? document.getElementById('btn-cancel-building-panel') : null;
    if (cancelBldBtn) cancelBldBtn.style.display = 'inline-flex';

    if (window.viewer && window.viewer.scene && window.viewer.scene.screenSpaceCameraController) {
      window.viewer.scene.screenSpaceCameraController.enableLook = false;
    }
    if (typeof window.showStatus === 'function') {
      window.showStatus('📐 MODO RECTÁNGULO CAD ACTIVO: Marca la primera esquina (P1)', 3500);
    }
    if (window.viewer && window.viewer.scene) window.viewer.scene.requestRender();
  }

  function handleBuildingRectClick(pos3D) {
    if (!pos3D || !window.viewer) return;
    const Cesium = window.Cesium;
    if (!Cesium) return;

    if (bldRectState.step === 0) {
      bldRectState.p1 = Cesium.Cartesian3.clone(pos3D);
      bldRectState.normalUp = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(bldRectState.p1);
      bldRectState.step = 1;

      // Entidad visual en P1
      const p1Ent = window.viewer.entities.add({
        position: bldRectState.p1,
        point: {
          pixelSize: 11,
          color: Cesium.Color.fromCssColorString('#818CF8'),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
      });
      bldRectState.tempEntities.push(p1Ent);

      const hud = getBuildingRectHudElement();
      if (hud) {
        const badge = hud.querySelector('#ra-bld-rect-step-badge');
        if (badge) { badge.textContent = 'PASO 2/2'; badge.style.background = '#0284c7'; }
        const help = hud.querySelector('#ra-bld-rect-help-text');
        if (help) help.textContent = 'Mueve el cursor hacia la segunda esquina para definir la fachada (Lado A) y haz clic en P2.';
      }
      if (typeof window.showStatus === 'function') {
        window.showStatus('📐 P1 FIJADO: Mueve el cursor y haz clic en P2 para definir la fachada (Lado A)', 3000);
      }
      window.viewer.scene.requestRender();
      return;
    }

    if (bldRectState.step === 1) {
      const dist = Cesium.Cartesian3.distance(bldRectState.p1, pos3D);
      if (dist < 0.5) return;

      bldRectState.p2 = Cesium.Cartesian3.clone(pos3D);
      bldRectState.ladoA = dist;

      // Vectores ortogonales puros a 90°
      const dirU = Cesium.Cartesian3.subtract(bldRectState.p2, bldRectState.p1, new Cesium.Cartesian3());
      Cesium.Cartesian3.normalize(dirU, dirU);
      bldRectState.dirU = dirU;

      const dirV = Cesium.Cartesian3.cross(bldRectState.normalUp, dirU, new Cesium.Cartesian3());
      Cesium.Cartesian3.normalize(dirV, dirV);
      bldRectState.dirV = dirV;

      // Entidad visual en P2
      const p2Ent = window.viewer.entities.add({
        position: bldRectState.p2,
        point: {
          pixelSize: 11,
          color: Cesium.Color.fromCssColorString('#38BDF8'),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
      });
      bldRectState.tempEntities.push(p2Ent);

      bldRectState.step = 2;

      const hud = getBuildingRectHudElement();
      if (hud) {
        const badge = hud.querySelector('#ra-bld-rect-step-badge');
        if (badge) { badge.textContent = 'FONDO / LADO B'; badge.style.background = '#059669'; }
        const help = hud.querySelector('#ra-bld-rect-help-text');
        if (help) help.innerHTML = 'Fachada fijada. Mueve el ratón para dar profundidad al fondo, o escribe los metros en <b>Lado B</b> y pulsa Enter.';
        const inA = hud.querySelector('#ra-bld-rect-input-a');
        if (inA) inA.value = bldRectState.ladoA.toFixed(2);
        const inB = hud.querySelector('#ra-bld-rect-input-b');
        if (inB) {
          inB.focus();
          inB.select();
        }
      }

      if (typeof window.showStatus === 'function') {
        window.showStatus(`📐 FACHADA FIJADA (${bldRectState.ladoA.toFixed(2)}m): Mueve el cursor para fondo o introduce metros y pulsa Enter`, 3500);
      }
      window.viewer.scene.requestRender();
      return;
    }

    if (bldRectState.step === 2) {
      finishBuildingRect();
    }
  }

  function updateBuildingRectPreview(pos3D) {
    if (!bldRectState.active || !pos3D || !window.viewer) return;
    const Cesium = window.Cesium;
    if (!Cesium) return;

    if (bldRectState.step === 1 && bldRectState.p1) {
      const dist = Cesium.Cartesian3.distance(bldRectState.p1, pos3D);
      const hud = getBuildingRectHudElement();
      if (hud) {
        const inA = hud.querySelector('#ra-bld-rect-input-a');
        if (inA) inA.value = dist.toFixed(2);
      }

      bldRectState.cursorPos = Cesium.Cartesian3.clone(pos3D);
      if (!bldRectState.previewLine) {
        bldRectState.previewLine = window.viewer.entities.add({
          polyline: {
            positions: new Cesium.CallbackProperty(() => {
              if (!bldRectState.p1 || !bldRectState.cursorPos) return [];
              return [bldRectState.p1, bldRectState.cursorPos];
            }, false),
            width: 3.5,
            material: new Cesium.ColorMaterialProperty(Cesium.Color.fromCssColorString('#818CF8')),
            arcType: Cesium.ArcType.NONE,
            clampToGround: false
          }
        });
        bldRectState.tempEntities.push(bldRectState.previewLine);
      }
      window.viewer.scene.requestRender();
      return;
    }

    if (bldRectState.step === 2 && bldRectState.p1 && bldRectState.p2 && bldRectState.dirV) {
      const vDiff = Cesium.Cartesian3.subtract(pos3D, bldRectState.p1, new Cesium.Cartesian3());
      const dFondo = Cesium.Cartesian3.dot(vDiff, bldRectState.dirV);
      updateBuildingRectWithDistance(dFondo);
      window.viewer.scene.requestRender();
    }
  }

  function updateBuildingRectWithDistance(dFondo) {
    const Cesium = window.Cesium;
    if (!Cesium || !bldRectState.p1 || !bldRectState.p2 || !bldRectState.dirV) return;

    const sign = (dFondo >= 0) ? 1 : -1;
    const mag = Math.max(0.5, Math.abs(dFondo));
    const effectiveDist = sign * mag;

    const offsetV = Cesium.Cartesian3.multiplyByScalar(bldRectState.dirV, effectiveDist, new Cesium.Cartesian3());
    const p3 = Cesium.Cartesian3.add(bldRectState.p2, offsetV, new Cesium.Cartesian3());
    const p4 = Cesium.Cartesian3.add(bldRectState.p1, offsetV, new Cesium.Cartesian3());

    bldRectState.p3 = p3;
    bldRectState.p4 = p4;
    bldRectState.ladoB = mag;

    const hud = getBuildingRectHudElement();
    if (hud) {
      const inB = hud.querySelector('#ra-bld-rect-input-b');
      if (inB && document.activeElement !== inB) {
        inB.value = mag.toFixed(2);
      }
      const area = hud.querySelector('#ra-bld-rect-area-label');
      if (area) {
        area.textContent = `Área: ${(bldRectState.ladoA * mag).toFixed(1)} m²`;
      }
    }

    if (!bldRectState.previewRect) {
      bldRectState.previewRect = window.viewer.entities.add({
        polygon: {
          hierarchy: new Cesium.CallbackProperty(() => {
            if (!bldRectState.p1 || !bldRectState.p2 || !bldRectState.p3 || !bldRectState.p4) return new Cesium.PolygonHierarchy([]);
            return new Cesium.PolygonHierarchy([bldRectState.p1, bldRectState.p2, bldRectState.p3, bldRectState.p4]);
          }, false),
          material: Cesium.Color.fromCssColorString('#818CF8').withAlpha(0.35),
          perPositionHeight: true,
          arcType: Cesium.ArcType.NONE
        },
        polyline: {
          positions: new Cesium.CallbackProperty(() => {
            if (!bldRectState.p1 || !bldRectState.p2 || !bldRectState.p3 || !bldRectState.p4) return [];
            return [bldRectState.p1, bldRectState.p2, bldRectState.p3, bldRectState.p4, bldRectState.p1];
          }, false),
          width: 3.5,
          material: new Cesium.ColorMaterialProperty(Cesium.Color.fromCssColorString('#38BDF8')),
          arcType: Cesium.ArcType.NONE,
          clampToGround: false
        }
      });
      bldRectState.tempEntities.push(bldRectState.previewRect);
    }
  }

  function finishBuildingRect(manualLadoB) {
    if (!bldRectState.active || !bldRectState.p1 || !bldRectState.p2) {
      cancelBuildingRect();
      return;
    }
    const Cesium = window.Cesium;
    if (!Cesium) return;

    if (typeof manualLadoB === 'number' && manualLadoB > 0) {
      updateBuildingRectWithDistance(manualLadoB);
    }

    if (!bldRectState.p3 || !bldRectState.p4) {
      updateBuildingRectWithDistance(12.0);
    }

    const pts = [bldRectState.p1, bldRectState.p2, bldRectState.p3, bldRectState.p4];
    const bldCount = (Array.isArray(window.buildings) ? window.buildings.length : 0) + 1;
    const bldName = 'Nave ' + bldCount;
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
      refEdgeIdx: 0,
      parapetHeight: 0.6,
      parapetWidth: 0.25,
      overhang: 0.2,
      facadeColor: '#F1F5F9',
      roofColor: '#E2E8F0',
      edgeColor: '#334155',
      points: pts,
      isRectangular: true,
      ladoA: bldRectState.ladoA,
      ladoB: bldRectState.ladoB
    };
    const _initAxes = computeBuildingConstructionAxes(newBld);
    if (_initAxes && typeof _initAxes.normalAzimuthDeg === 'number') {
      newBld.roofAzimuth = Math.round(_initAxes.normalAzimuthDeg);
    }

    if (window.RAundo && typeof window.RAundo.snapBuildings === 'function') {
      window.RAundo.snapBuildings('Crear ' + bldName);
    }

    if (!Array.isArray(window.buildings)) window.buildings = [];
    window.buildings.push(newBld);

    clearBuildingRectTempEntities();
    bldRectState.active = false;
    bldRectState.step = 0;
    bldRectState.p1 = null;
    bldRectState.p2 = null;
    bldRectState.p3 = null;
    bldRectState.p4 = null;

    const hud = getBuildingRectHudElement();
    if (hud) hud.style.display = 'none';

    const confBar = (typeof document !== 'undefined') ? document.getElementById('ra-confirm-bar') : null;
    if (confBar) {
      confBar.style.display = 'none';
      confBar.classList.remove('open');
    }
    const cancelBldBtn = (typeof document !== 'undefined') ? document.getElementById('btn-cancel-building-panel') : null;
    if (cancelBldBtn) cancelBldBtn.style.display = 'none';

    if (typeof window.WP !== 'undefined' && window.WP) window.WP.mode = 'idle';
    if (typeof window.appMode !== 'undefined') window.appMode = 'navigate';

    if (window.viewer && window.viewer.scene && window.viewer.scene.screenSpaceCameraController) {
      window.viewer.scene.screenSpaceCameraController.enableLook = true;
    }

    if (typeof window.selectBuilding === 'function') {
      window.selectBuilding(newBld.id);
    }
    if (typeof window.render3DBuildingsInCesium === 'function') {
      window.render3DBuildingsInCesium();
    }

    const areaTotal = (newBld.ladoA * newBld.ladoB).toFixed(1);
    if (typeof window.showToast === 'function') {
      window.showToast('EDIFICIO RECTANGULAR CREADO', `${bldName}: ${newBld.ladoA.toFixed(1)}m × ${newBld.ladoB.toFixed(1)}m (${areaTotal} m²). Ángulos de 90° exactos.`, 'success', 4500);
    }
  }

  function cancelBuildingRect() {
    clearBuildingRectTempEntities();
    bldRectState.active = false;
    bldRectState.step = 0;
    bldRectState.p1 = null;
    bldRectState.p2 = null;
    bldRectState.p3 = null;
    bldRectState.p4 = null;

    const hud = getBuildingRectHudElement();
    if (hud) hud.style.display = 'none';

    const confBar = (typeof document !== 'undefined') ? document.getElementById('ra-confirm-bar') : null;
    if (confBar) {
      confBar.style.display = 'none';
      confBar.classList.remove('open');
    }
    const cancelBldBtn = (typeof document !== 'undefined') ? document.getElementById('btn-cancel-building-panel') : null;
    if (cancelBldBtn) cancelBldBtn.style.display = 'none';

    if (typeof window.WP !== 'undefined' && window.WP) window.WP.mode = 'idle';
    if (typeof window.appMode !== 'undefined') window.appMode = 'navigate';

    if (window.viewer && window.viewer.scene && window.viewer.scene.screenSpaceCameraController) {
      window.viewer.scene.screenSpaceCameraController.enableLook = true;
    }
    if (window.viewer && window.viewer.scene) window.viewer.scene.requestRender();
    if (typeof window.showStatus === 'function') {
      window.showStatus('Trazado de rectángulo cancelado', 1500);
    }
  }

  // ── INSPECTOR PARAMÉTRICO DE DIMENSIONES (LADO A & LADO B) ─────────────────
  function getBuildingRectDimensions(bld) {
    if (!bld || !Array.isArray(bld.points) || bld.points.length !== 4) return null;
    const Cesium = window.Cesium;
    if (!Cesium) return null;

    const d12 = Cesium.Cartesian3.distance(bld.points[0], bld.points[1]);
    const d23 = Cesium.Cartesian3.distance(bld.points[1], bld.points[2]);
    const d34 = Cesium.Cartesian3.distance(bld.points[2], bld.points[3]);
    const d41 = Cesium.Cartesian3.distance(bld.points[3], bld.points[0]);

    const isRect = bld.isRectangular || (Math.abs(d12 - d34) < 1.0 && Math.abs(d23 - d41) < 1.0);
    if (!isRect) return null;

    return {
      ladoA: (d12 + d34) / 2,
      ladoB: (d23 + d41) / 2,
      area: ((d12 + d34) / 2) * ((d23 + d41) / 2)
    };
  }

  function updateBuildingRectDimensions(bldId, newLadoA, newLadoB) {
    const arr = (typeof window !== 'undefined' && Array.isArray(window.buildings)) ? window.buildings : [];
    const bld = arr.find(b => b && b.id === bldId);
    if (!bld || !Array.isArray(bld.points) || bld.points.length !== 4) return false;
    const Cesium = window.Cesium;
    if (!Cesium) return false;

    newLadoA = parseFloat(newLadoA);
    newLadoB = parseFloat(newLadoB);
    if (isNaN(newLadoA) || newLadoA <= 0 || isNaN(newLadoB) || newLadoB <= 0) return false;

    if (window.RAundo && typeof window.RAundo.snapBuildings === 'function') {
      window.RAundo.snapBuildings('Redimensionar ' + (bld.name || 'Edificio'));
    }

    const p1 = bld.points[0];
    const p2Old = bld.points[1];
    const p4Old = bld.points[3];

    const dirU = Cesium.Cartesian3.subtract(p2Old, p1, new Cesium.Cartesian3());
    Cesium.Cartesian3.normalize(dirU, dirU);

    const dirV = Cesium.Cartesian3.subtract(p4Old, p1, new Cesium.Cartesian3());
    Cesium.Cartesian3.normalize(dirV, dirV);

    const p2New = Cesium.Cartesian3.add(p1, Cesium.Cartesian3.multiplyByScalar(dirU, newLadoA, new Cesium.Cartesian3()), new Cesium.Cartesian3());
    const p4New = Cesium.Cartesian3.add(p1, Cesium.Cartesian3.multiplyByScalar(dirV, newLadoB, new Cesium.Cartesian3()), new Cesium.Cartesian3());
    const p3New = Cesium.Cartesian3.add(p2New, Cesium.Cartesian3.multiplyByScalar(dirV, newLadoB, new Cesium.Cartesian3()), new Cesium.Cartesian3());

    bld.points = [p1, p2New, p3New, p4New];
    bld.isRectangular = true;
    bld.ladoA = newLadoA;
    bld.ladoB = newLadoB;

    if (typeof window.render3DBuildingsInCesium === 'function') window.render3DBuildingsInCesium();
    if (typeof window.recalculateLayoutAndObstacles === 'function') window.recalculateLayoutAndObstacles();
    if (typeof window.wpInvalidateHeatmap === 'function') window.wpInvalidateHeatmap('Edificio redimensionado paramétricamente');

    syncRectInspectorUI(bld);
    return true;
  }

  function syncRectInspectorUI(bld) {
    if (typeof document === 'undefined') return;
    const box = document.getElementById('bld-rect-dimensions-box');
    if (box) {
      if (!bld) {
        box.style.display = 'none';
      } else {
        const dims = getBuildingRectDimensions(bld);
        if (!dims) {
          box.style.display = 'none';
        } else {
          box.style.display = 'block';
          const inA = document.getElementById('bld-rect-lado-a');
          const inB = document.getElementById('bld-rect-lado-b');
          const badge = document.getElementById('bld-rect-area-badge');

          if (inA) inA.value = dims.ladoA.toFixed(2);
          if (inB) inB.value = dims.ladoB.toFixed(2);
          if (badge) badge.textContent = `${dims.area.toFixed(1)} m²`;
        }
      }
    }
    syncBuildingAxesInspectorUI(bld);
  }

  // ── SISTEMA DE EJES DE COORDENADAS ALINEADOS A LOS LADOS DE CONSTRUCCIÓN ──
  function computeBuildingConstructionAxes(bld, optVtxIdx) {
    const Cesium = (typeof window !== 'undefined' && window.Cesium) ? window.Cesium : (typeof globalThis !== 'undefined' ? globalThis.Cesium : null);
    if (!Cesium || !bld) return null;
    const pts = bld.points || bld.polygon;
    if (!Array.isArray(pts) || pts.length < 3) return null;

    const N = pts.length;
    // 1. Centroide 3D
    let sum = new Cesium.Cartesian3(0, 0, 0);
    for (let i = 0; i < N; i++) {
      sum = Cesium.Cartesian3.add(sum, pts[i], sum);
    }
    const center = Cesium.Cartesian3.multiplyByScalar(sum, 1.0 / N, new Cesium.Cartesian3());

    // 2. Base local ENU en el punto de referencia (vértice o centroide)
    const refOrigin = (typeof optVtxIdx === 'number' && optVtxIdx >= 0 && optVtxIdx < N && pts[optVtxIdx])
      ? pts[optVtxIdx]
      : center;

    let east, north, up;
    if (typeof Cesium.Transforms !== 'undefined' && typeof Cesium.Transforms.eastNorthUpToFixedFrame === 'function') {
      const enuMat = Cesium.Transforms.eastNorthUpToFixedFrame(refOrigin);
      east  = Cesium.Cartesian3.normalize(new Cesium.Cartesian3(enuMat[0], enuMat[1], enuMat[2]), new Cesium.Cartesian3());
      north = Cesium.Cartesian3.normalize(new Cesium.Cartesian3(enuMat[4], enuMat[5], enuMat[6]), new Cesium.Cartesian3());
      up    = Cesium.Cartesian3.normalize(new Cesium.Cartesian3(enuMat[8], enuMat[9], enuMat[10]), new Cesium.Cartesian3());
    } else {
      up = Cesium.Cartesian3.normalize(refOrigin, new Cesium.Cartesian3());
      east = Cesium.Cartesian3.cross(Cesium.Cartesian3.UNIT_Z, up, new Cesium.Cartesian3());
      if (Cesium.Cartesian3.magnitude(east) < 1e-4) {
        east = Cesium.Cartesian3.cross(Cesium.Cartesian3.UNIT_X, up, new Cesium.Cartesian3());
      }
      Cesium.Cartesian3.normalize(east, east);
      north = Cesium.Cartesian3.normalize(Cesium.Cartesian3.cross(up, east, new Cesium.Cartesian3()), new Cesium.Cartesian3());
    }

    const axisMode = (bld.axisMode === 'compass') ? 'compass' : 'wall';

    // 3. Longitudes de cada lado de construcción
    const edgeLengths = [];
    let longestIdx = 0;
    let maxLen = -1;
    for (let i = 0; i < N; i++) {
      const pA = pts[i];
      const pB = pts[(i + 1) % N];
      const d = Cesium.Cartesian3.distance(pA, pB);
      edgeLengths.push(d);
      if (d > maxLen) {
        maxLen = d;
        longestIdx = i;
      }
    }

    // 4. Si está en modo Brújula (Norte-Sur / Este-Oeste), devolver marco ENU clásico
    if (axisMode === 'compass') {
      return {
        origin: refOrigin,
        center: center,
        normal: up,
        uVec: east,
        vVec: north,
        axisMode: 'compass',
        edgeIdx: longestIdx,
        edgeCount: N,
        edgeLength: edgeLengths[longestIdx] || 0,
        edgeLengths: edgeLengths,
        wallAzimuthDeg: 90,
        normalAzimuthDeg: 180
      };
    }

    // 5. Modo Muros del Edificio ('wall'): elegir el lado constructivo guía
    let edgeIdx = longestIdx;
    if (typeof bld.refEdgeIdx === 'number' && bld.refEdgeIdx >= 0 && bld.refEdgeIdx < N) {
      edgeIdx = bld.refEdgeIdx;
    } else if (bld.isRectangular && N === 4) {
      edgeIdx = 0; // P1 -> P2 (Fachada Principal Lado A)
    } else {
      bld.refEdgeIdx = longestIdx;
    }

    const pStart = pts[edgeIdx];
    const pEnd   = pts[(edgeIdx + 1) % N];
    const rawEdge = Cesium.Cartesian3.subtract(pEnd, pStart, new Cesium.Cartesian3());
    const edgeLen = Cesium.Cartesian3.magnitude(rawEdge);

    // Proyectar vector del muro sobre el plano horizontal local (perpendicular a 'up')
    const dotUp = Cesium.Cartesian3.dot(rawEdge, up);
    const horizEdge = Cesium.Cartesian3.subtract(
      rawEdge,
      Cesium.Cartesian3.multiplyByScalar(up, dotUp, new Cesium.Cartesian3()),
      new Cesium.Cartesian3()
    );

    let uVec;
    if (Cesium.Cartesian3.magnitude(horizEdge) > 1e-4) {
      uVec = Cesium.Cartesian3.normalize(horizEdge, new Cesium.Cartesian3());
    } else {
      uVec = Cesium.Cartesian3.clone(east);
    }

    // Eje V ortogonal a 90° exactos sobre el plano horizontal: cross(up, uVec)
    let vVec = Cesium.Cartesian3.normalize(
      Cesium.Cartesian3.cross(up, uVec, new Cesium.Cartesian3()),
      new Cesium.Cartesian3()
    );

    // Verificar que vVec apunte hacia el interior del edificio (desde el muro guía hacia el centroide)
    const edgeMid = Cesium.Cartesian3.multiplyByScalar(
      Cesium.Cartesian3.add(pStart, pEnd, new Cesium.Cartesian3()),
      0.5,
      new Cesium.Cartesian3()
    );
    const toCenter = Cesium.Cartesian3.subtract(center, edgeMid, new Cesium.Cartesian3());
    if (Cesium.Cartesian3.dot(toCenter, vVec) < -1e-4) {
      vVec = Cesium.Cartesian3.negate(vVec, new Cesium.Cartesian3());
    }

    // Calcular azimut geográfico del muro (uVec) y de su normal de fachada (hacia afuera = -vVec)
    const uEast  = Cesium.Cartesian3.dot(uVec, east);
    const uNorth = Cesium.Cartesian3.dot(uVec, north);
    const wallAzimuthDeg = ((Math.atan2(uEast, uNorth) * 180 / Math.PI) % 360 + 360) % 360;

    const outVec = Cesium.Cartesian3.negate(vVec, new Cesium.Cartesian3());
    const nEast  = Cesium.Cartesian3.dot(outVec, east);
    const nNorth = Cesium.Cartesian3.dot(outVec, north);
    const normalAzimuthDeg = ((Math.atan2(nEast, nNorth) * 180 / Math.PI) % 360 + 360) % 360;

    return {
      origin: refOrigin,
      center: center,
      normal: up,
      uVec: uVec,
      vVec: vVec,
      axisMode: 'wall',
      edgeIdx: edgeIdx,
      edgeCount: N,
      edgeLength: edgeLen,
      edgeLengths: edgeLengths,
      wallAzimuthDeg: wallAzimuthDeg,
      normalAzimuthDeg: normalAzimuthDeg
    };
  }

  function syncBuildingAxesInspectorUI(bld) {
    if (typeof document === 'undefined') return;
    const targetBld = bld || ((typeof window !== 'undefined' && window.selectedBuildingId && Array.isArray(window.buildings))
      ? window.buildings.find(b => b && b.id === window.selectedBuildingId)
      : null);
    if (!targetBld) return;

    const axes = computeBuildingConstructionAxes(targetBld);
    if (!axes) return;

    const btnWall = document.getElementById('bld-axis-mode-wall');
    const btnCompass = document.getElementById('bld-axis-mode-compass');
    const wallControls = document.getElementById('bld-axis-wall-controls');
    const edgeLabel = document.getElementById('bld-axis-edge-label');
    const azBadge = document.getElementById('bld-axis-azimuth-badge');

    const isWall = (axes.axisMode !== 'compass');
    if (btnWall) {
      btnWall.style.background = isWall ? 'rgba(16, 185, 129, 0.25)' : 'rgba(15, 23, 42, 0.6)';
      btnWall.style.borderColor = isWall ? '#10b981' : 'rgba(255,255,255,0.12)';
      btnWall.style.color = isWall ? '#6ee7b7' : '#94a3b8';
    }
    if (btnCompass) {
      btnCompass.style.background = !isWall ? 'rgba(56, 189, 248, 0.25)' : 'rgba(15, 23, 42, 0.6)';
      btnCompass.style.borderColor = !isWall ? '#38bdf8' : 'rgba(255,255,255,0.12)';
      btnCompass.style.color = !isWall ? '#7dd3fc' : '#94a3b8';
    }
    if (wallControls) {
      wallControls.style.display = isWall ? 'flex' : 'none';
    }
    if (edgeLabel) {
      if (isWall) {
        edgeLabel.textContent = `Muro #${axes.edgeIdx + 1} de ${axes.edgeCount} (${axes.edgeLength.toFixed(1)} m)`;
      } else {
        edgeLabel.textContent = 'Brújula Geográfica (Este-Norte)';
      }
    }
    if (azBadge) {
      azBadge.textContent = isWall
        ? `Eje X: ${Math.round(axes.wallAzimuthDeg)}°`
        : 'Eje X: 90° (E)';
    }
  }

  function setBuildingAxisMode(mode, optEdgeIdx) {
    const bldId = (typeof window !== 'undefined') ? window.selectedBuildingId : null;
    const arr = (typeof window !== 'undefined' && Array.isArray(window.buildings)) ? window.buildings : [];
    const bld = arr.find(b => b && b.id === bldId);
    if (!bld) return false;

    bld.axisMode = (mode === 'compass') ? 'compass' : 'wall';
    if (typeof optEdgeIdx === 'number' && optEdgeIdx >= 0 && Array.isArray(bld.points) && optEdgeIdx < bld.points.length) {
      bld.refEdgeIdx = optEdgeIdx;
    }

    const axes = computeBuildingConstructionAxes(bld);
    // Sincronizar también cualquier plano solar asociado a este edificio
    if (axes && typeof window.WP !== 'undefined' && window.WP && Array.isArray(window.WP.planes)) {
      window.WP.planes.forEach(pl => {
        if (pl && pl.buildingId === bld.id) {
          pl.uVec = axes.uVec;
          pl.vVec = axes.vVec;
          pl.normal = axes.normal;
        }
      });
    }

    syncBuildingAxesInspectorUI(bld);
    if (typeof window.render3DBuildingsInCesium === 'function') window.render3DBuildingsInCesium();
    if (typeof window.renderTriad2D === 'function') window.renderTriad2D();
    if (window.viewer && window.viewer.scene) window.viewer.scene.requestRender();
    return true;
  }

  function cycleBuildingReferenceWall(step) {
    const bldId = (typeof window !== 'undefined') ? window.selectedBuildingId : null;
    const arr = (typeof window !== 'undefined' && Array.isArray(window.buildings)) ? window.buildings : [];
    const bld = arr.find(b => b && b.id === bldId);
    if (!bld || !Array.isArray(bld.points) || bld.points.length < 3) return false;

    const N = bld.points.length;
    const curAxes = computeBuildingConstructionAxes(bld);
    const curIdx = (curAxes && typeof curAxes.edgeIdx === 'number') ? curAxes.edgeIdx : 0;
    const delta = (typeof step === 'number' && step !== 0) ? step : 1;
    const nextIdx = ((curIdx + delta) % N + N) % N;

    bld.axisMode = 'wall';
    bld.refEdgeIdx = nextIdx;

    const newAxes = computeBuildingConstructionAxes(bld);
    if (newAxes && typeof window.bldSyncAzimuth === 'function') {
      window.bldSyncAzimuth(Math.round(newAxes.normalAzimuthDeg));
    } else if (newAxes) {
      bld.roofAzimuth = Math.round(newAxes.normalAzimuthDeg);
    }

    // Sincronizar plano de cubierta solar si existe
    if (newAxes && typeof window.WP !== 'undefined' && window.WP && Array.isArray(window.WP.planes)) {
      window.WP.planes.forEach(pl => {
        if (pl && pl.buildingId === bld.id) {
          pl.uVec = newAxes.uVec;
          pl.vVec = newAxes.vVec;
          pl.normal = newAxes.normal;
        }
      });
      if (typeof window.wpFastRenderSimulatedPanels === 'function') {
        window.wpFastRenderSimulatedPanels();
      }
    }

    syncBuildingAxesInspectorUI(bld);
    if (typeof window.render3DBuildingsInCesium === 'function') window.render3DBuildingsInCesium();
    if (typeof window.renderTriad2D === 'function') window.renderTriad2D();
    if (typeof window.showToast === 'function' && newAxes) {
      window.showToast(
        'EJE ALINEADO AL MURO #' + (nextIdx + 1),
        `Lado guía: ${newAxes.edgeLength.toFixed(1)}m · Eje X a ${Math.round(newAxes.wallAzimuthDeg)}°`,
        'info',
        2200
      );
    }
    return true;
  }

  // ─────────────────────────────────────────────────────────────────
  // PROPUESTA 4: GENERACIÓN AUTOMÁTICA DE PLANO DE TRABAJO SOLAR
  // Convierte la cubierta o faldón activo del edificio en Plano FV con 1 Clic
  // ─────────────────────────────────────────────────────────────────
  function createSolarPlaneFromBuildingRoof() {
    const bldId = (typeof window !== 'undefined') ? window.selectedBuildingId : null;
    const arr = (typeof window !== 'undefined' && Array.isArray(window.buildings)) ? window.buildings : [];
    const bld = arr.find(b => b && b.id === bldId);
    if (!bld || !Array.isArray(bld.points) || bld.points.length < 3) {
      if (typeof window.showToast === 'function') {
        window.showToast('SELECCIÓN REQUERIDA', 'Selecciona primero un edificio 3D con huella válida.', 'warning', 3000);
      }
      return false;
    }

    if (typeof window.WP === 'undefined' || !window.WP) {
      if (typeof window.showToast === 'function') {
        window.showToast('ERROR', 'Módulo de planos de trabajo no disponible.', 'error', 3000);
      }
      return false;
    }

    const WP = window.WP;
    const rType = bld.roofType || 'flat';
    const pitch = (typeof bld.roofPitch === 'number') ? bld.roofPitch : (rType === 'flat' ? 0 : 25);
    const azimuth = (typeof bld.roofAzimuth === 'number') ? bld.roofAzimuth : 180;

    // Extracción multifaldón en 1 clic para edificios paramétricos en L (6 diseños arquitectónicos)
    if ((rType === 'l_shape' || (bld.lParams && bld.lParams.isLParametric)) &&
        typeof window.RALBuilding !== 'undefined' && typeof window.RALBuilding.extractSolarFaces === 'function') {
      const solarFaces = window.RALBuilding.extractSolarFaces(bld);
      if (Array.isArray(solarFaces) && solarFaces.length > 0) {
        if (window.RAundo && typeof window.RAundo.snapProject === 'function') {
          window.RAundo.snapProject('Extraer faldones solares de ' + (bld.name || 'Edificio en L'));
        }

        // Reemplazar en sitio planos y polilíneas previos vinculados a este edificio para evitar duplicados
        const oldPlanes = Array.isArray(WP.planes) ? WP.planes : [];
        const removedP = new Set();
        const pMap = new Map();
        let nextIdx = 0;
        for (let pi = 0; pi < oldPlanes.length; pi++) {
          const pl = oldPlanes[pi];
          if (!pl || pl.buildingId === bld.id || (pl.id && pl.id.indexOf('plane_roof_' + bld.id) === 0)) {
            removedP.add(pi);
          } else {
            pMap.set(pi, nextIdx++);
          }
        }
        if (Array.isArray(WP.polylines)) {
          for (let li = WP.polylines.length - 1; li >= 0; li--) {
            const ply = WP.polylines[li];
            if (!ply || ply.buildingId === bld.id || removedP.has(ply.planeIdx)) {
              WP.polylines.splice(li, 1);
            } else if (typeof ply.planeIdx === 'number' && pMap.has(ply.planeIdx)) {
              ply.planeIdx = pMap.get(ply.planeIdx);
            }
          }
        }
        if (Array.isArray(WP.planes)) {
          for (let pi = WP.planes.length - 1; pi >= 0; pi--) {
            if (removedP.has(pi)) WP.planes.splice(pi, 1);
          }
        }

        const firstAddedPlaneIdx = WP.planes.length;
        const firstAddedPolyIdx = WP.polylines.length;
        const baseTs = Date.now();

        solarFaces.forEach(function(face, fIdx) {
          const pts3D = face.pts3D;
          if (!Array.isArray(pts3D) || pts3D.length < 3) return;
          let pData = null;
          if (typeof window.wpComputePlaneFrom3Points === 'function') {
            pData = window.wpComputePlaneFrom3Points(pts3D[0], pts3D[1], pts3D[2], 'p1p2');
          }
          if (!pData) {
            const up = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(pts3D[0], new Cesium.Cartesian3());
            const v1 = Cesium.Cartesian3.subtract(pts3D[1], pts3D[0], new Cesium.Cartesian3());
            const uV = Cesium.Cartesian3.normalize(v1, new Cesium.Cartesian3());
            const vV = Cesium.Cartesian3.normalize(Cesium.Cartesian3.cross(up, uV, new Cesium.Cartesian3()), new Cesium.Cartesian3());
            pData = { origin: pts3D[0], normal: up, uVec: uV, vVec: vV, tiltDeg: 0, azimuthDeg: azimuth };
          }
          const planeObj = Object.assign({
            id: 'plane_roof_' + bld.id + '_' + baseTs + '_' + fIdx,
            name: (bld.name || 'Edificio L') + ' · ' + (face.name || ('Faldón ' + (fIdx + 1))) + ' (' + pData.tiltDeg.toFixed(0) + '°)',
            pts3D: [pts3D[0], pts3D[1], pts3D[2]],
            buildingId: bld.id
          }, pData);

          WP.planes.push(planeObj);
          const pIdxAdded = WP.planes.length - 1;
          const areaCalc = (typeof window.wpPolylineArea3D === 'function') ? window.wpPolylineArea3D(pts3D) : 25;
          WP.polylines.push({
            id: 'wp_poly_roof_' + baseTs + '_' + fIdx,
            name: (bld.name || 'Edificio L') + ' · ' + (face.name || ('Faldón ' + (fIdx + 1))),
            planeIdx: pIdxAdded,
            buildingId: bld.id,
            points: pts3D.map(function(p) { return Cesium.Cartesian3.clone(p); }),
            area: areaCalc,
            alignToPlane: true,
            orientationPref: (typeof window.userPanelOrientationPref !== 'undefined') ? window.userPanelOrientationPref : 'portrait',
            modTilt: 'auto',
            modAzimuth: 'auto',
            lineEnt: null,
            fillEnt: null
          });
        });

        WP.activePlaneIdx = firstAddedPlaneIdx;
        WP.selectedPolyIdx = firstAddedPolyIdx;
        if (typeof window.wpRenderActivePlaneGizmo === 'function') window.wpRenderActivePlaneGizmo();
        if (typeof window.wpRenderAllPolylines === 'function') window.wpRenderAllPolylines();
        if (typeof window.wpUpdateUI === 'function') window.wpUpdateUI();
        if (typeof window.wpUpdateControlsAvailability === 'function') window.wpUpdateControlsAvailability();
        if (typeof window.wpFastRenderSimulatedPanels === 'function') window.wpFastRenderSimulatedPanels();
        if (window.viewer && window.viewer.scene) window.viewer.scene.requestRender();
        if (typeof window.showToast === 'function') {
          window.showToast('FALDONES EN L EXTRAÍDOS', 'Se han generado ' + solarFaces.length + ' superficies solares independientes desde ' + (bld.name || 'el edificio en L') + '.', 'success', 4500);
        }
        return true;
      }
    }

    // Obtener los 3 puntos representativos de la superficie superior
    const rawCartoList = bld.points.map(p => Cesium.Cartographic.fromCartesian(p)).filter(Boolean);
    if (rawCartoList.length < 3) return false;

    let avgBaseHeight = 0;
    rawCartoList.forEach(c => { avgBaseHeight += (c.height || 0); });
    avgBaseHeight /= rawCartoList.length;
    const roofHeight = avgBaseHeight + Math.max(bld.height || 6.0, 1.0);

    const c1 = rawCartoList[0];
    const c2 = rawCartoList[1];
    const c3 = rawCartoList[2];

    const p1 = Cesium.Cartesian3.fromRadians(c1.longitude, c1.latitude, roofHeight);
    const p2 = Cesium.Cartesian3.fromRadians(c2.longitude, c2.latitude, roofHeight);
    const p3 = Cesium.Cartesian3.fromRadians(c3.longitude, c3.latitude, roofHeight);

    let planeData = null;
    if (typeof window.wpComputePlaneFrom3Points === 'function') {
      planeData = window.wpComputePlaneFrom3Points(p1, p2, p3, 'p1p2');
    }

    if (!planeData) {
      const up = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(p1, new Cesium.Cartesian3());
      const v1 = Cesium.Cartesian3.subtract(p2, p1, new Cesium.Cartesian3());
      const uVec = Cesium.Cartesian3.normalize(v1, new Cesium.Cartesian3());
      const vVec = Cesium.Cartesian3.normalize(Cesium.Cartesian3.cross(up, uVec, new Cesium.Cartesian3()), new Cesium.Cartesian3());
      planeData = {
        origin: p1,
        normal: up,
        uVec: uVec,
        vVec: vVec,
        tiltDeg: pitch,
        azimuthDeg: azimuth
      };
    } else {
      if (rType !== 'flat') {
        planeData.tiltDeg = pitch;
        planeData.azimuthDeg = azimuth;
      }
    }

    const planeObj = Object.assign({
      id: 'plane_roof_' + bld.id + '_' + Date.now(),
      name: 'Cubierta ' + (bld.name || 'Edificio') + ' (' + planeData.tiltDeg.toFixed(0) + '°)',
      pts3D: [p1, p2, p3],
      origin: planeData.origin,
      normal: planeData.normal,
      uVec: planeData.uVec,
      vVec: planeData.vVec,
      tiltDeg: planeData.tiltDeg,
      azimuthDeg: planeData.azimuthDeg,
      buildingId: bld.id
    }, planeData);

    if (window.RAundo && typeof window.RAundo.snapPlanes === 'function') {
      window.RAundo.snapPlanes('Crear ' + planeObj.name);
    }
    WP.planes.push(planeObj);
    WP.activePlaneIdx = WP.planes.length - 1;

    // Crear automáticamente el polígono contorno útil de la cubierta
    const roof3DPts = rawCartoList.map(c => Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, roofHeight));
    const areaCalc = (typeof window.wpPolylineArea3D === 'function') ? window.wpPolylineArea3D(roof3DPts) : 50;

    const polyObj = {
      id: 'wp_poly_roof_' + Date.now(),
      name: 'Faldón ' + (bld.name || 'Edificio'),
      planeIdx: WP.activePlaneIdx,
      buildingId: bld.id,
      points: roof3DPts,
      area: areaCalc,
      alignToPlane: true,
      orientationPref: (typeof window.userPanelOrientationPref !== 'undefined') ? window.userPanelOrientationPref : 'portrait',
      modTilt: 'auto',
      modAzimuth: 'auto',
      lineEnt: null,
      fillEnt: null
    };

    if (window.RAundo && typeof window.RAundo.snapPolylines === 'function') {
      window.RAundo.snapPolylines('Crear ' + polyObj.name);
    }
    WP.polylines.push(polyObj);
    WP.selectedPolyIdx = WP.polylines.length - 1;

    if (typeof window.wpRenderActivePlaneGizmo === 'function') window.wpRenderActivePlaneGizmo();
    if (typeof window.wpRenderAllPolylines === 'function') window.wpRenderAllPolylines();
    if (typeof window.wpUpdateUI === 'function') window.wpUpdateUI();
    if (typeof window.wpUpdateControlsAvailability === 'function') window.wpUpdateControlsAvailability();
    if (typeof window.wpFastRenderSimulatedPanels === 'function') window.wpFastRenderSimulatedPanels();

    if (typeof window.showToast === 'function') {
      window.showToast('PLANO Y FALDON CREADOS', 'Cubierta vinculada al estudio solar. Contorno útil: ' + areaCalc.toFixed(1) + ' m².', 'success', 4000);
    }

    const brushPanel = document.getElementById('ra-brush-panel') || document.getElementById('btn-draw-polyline');
    if (brushPanel) brushPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });

    if (window.viewer && window.viewer.scene) window.viewer.scene.requestRender();
    return true;
  }

  // ─────────────────────────────────────────────────────────────────
  // PLANTA EN L PARAMÉTRICA (CAD AAA)
  // Genera automáticamente una huella en forma de L de 6 vértices
  // ─────────────────────────────────────────────────────────────────
  function startDrawingBuildingL() {
    if (typeof viewer === 'undefined' || !viewer || !viewer.scene) {
      if (typeof window.showToast === 'function') window.showToast('AVISO', 'Visor 3D no inicializado.', 'warning', 2500);
      return;
    }
    const camCarto = viewer.scene.camera.positionCartographic;
    if (!camCarto) return;

    const R_EARTH = 6378137.0;
    let targetCarto = null;
    try {
      const sc = viewer.scene;
      const canvas = sc.canvas;
      if (canvas && canvas.clientWidth > 0 && canvas.clientHeight > 0) {
        const centerPx = new Cesium.Cartesian2(canvas.clientWidth * 0.5, canvas.clientHeight * 0.5);
        let hitPos = null;
        if (sc.pickPositionSupported) {
          try { hitPos = sc.pickPosition(centerPx); } catch (_) { hitPos = null; }
        }
        if (!hitPos && sc.globe) {
          const ray = sc.camera.getPickRay(centerPx);
          if (ray) hitPos = sc.globe.pick(ray, sc);
        }
        if (!hitPos) {
          hitPos = sc.camera.pickEllipsoid(centerPx, Cesium.Ellipsoid.WGS84);
        }
        if (hitPos) {
          targetCarto = Cesium.Cartographic.fromCartesian(hitPos);
        }
      }
    } catch (_) { targetCarto = null; }

    const cLon = targetCarto ? targetCarto.longitude : camCarto.longitude;
    const cLat = targetCarto ? targetCarto.latitude : camCarto.latitude;
    const cosLat = Math.cos(cLat);

    let h = (targetCarto && Number.isFinite(targetCarto.height)) ? targetCarto.height : NaN;
    if (!Number.isFinite(h) && viewer.scene.globe && typeof viewer.scene.globe.getHeight === 'function') {
      try {
        const gh = viewer.scene.globe.getHeight(new Cesium.Cartographic(cLon, cLat, 0));
        if (Number.isFinite(gh)) h = gh;
      } catch (_) {}
    }
    if (!Number.isFinite(h) && Array.isArray(window.buildings) && window.buildings.length > 0 && Array.isArray(window.buildings[0].points) && window.buildings[0].points[0]) {
      const bc = Cesium.Cartographic.fromCartesian(window.buildings[0].points[0]);
      if (bc && Number.isFinite(bc.height)) h = bc.height;
    }
    if (!Number.isFinite(h) && typeof WP !== 'undefined' && WP && WP.origin) {
      const wc = Cesium.Cartographic.fromCartesian(WP.origin);
      if (wc && Number.isFinite(wc.height)) h = wc.height;
    }
    if (!Number.isFinite(h)) h = 0;

    let newBld;
    if (typeof window !== 'undefined' && window.RALBuilding && typeof window.RALBuilding.createDefaultLBuilding === 'function') {
      newBld = window.RALBuilding.createDefaultLBuilding(cLon, cLat, h);
    } else {
      // Dimensiones proporcionales en metros (Ala principal 24x10m, Ala secundaria 14x10m)
      const ptsOffsets = [
        { x: -12, y: -10 },
        { x:  12, y: -10 },
        { x:  12, y:   2 },
        { x:   0, y:   2 },  // Vértice cóncavo interior reflexivo
        { x:   0, y:  14 },
        { x: -12, y:  14 }
      ];

      const pts3D = ptsOffsets.map(off => Cesium.Cartesian3.fromRadians(
        cLon + off.x / (R_EARTH * cosLat),
        cLat + off.y / R_EARTH,
        h
      ));

      newBld = {
        id: 'bld_l_' + Date.now(),
        name: 'Edificio en L #' + ((window.buildings ? window.buildings.length : 0) + 1),
        points: pts3D,
        height: 6.5,
        roofType: 'l_shape',
        roofPitch: 25,
        roofAzimuth: 180,
        roofThickness: 0.20,
        overhang: 0.25,
        facadeColor: '#F1F5F9',
        roofColor: '#E2E8F0',
        edgeColor: '#334155',
        visible: true
      };
    }

    if (!Array.isArray(window.buildings)) window.buildings = [];
    if (window.RAundo && typeof window.RAundo.snapBuildings === 'function') {
      window.RAundo.snapBuildings('Crear ' + newBld.name);
    }
    window.buildings.push(newBld);
    window.selectedBuildingId = newBld.id;

    if (typeof window.selectBuilding === 'function') {
      window.selectBuilding(newBld.id);
    } else {
      render3DBuildingsInCesium();
    }

    if (typeof window.showToast === 'function') {
      window.showToast('EDIFICIO EN L CREADO', 'Se ha posicionado una nave en L con cubierta adaptada y limahoya en el centro de tu vista.', 'success', 4500);
    }
  }

  // Exportar funciones del Rectángulo CAD y Ejes Constructivos
  window.startDrawingBuildingRect = startDrawingBuildingRect;
  window.startDrawingBuildingL = startDrawingBuildingL;
  window.handleBuildingRectClick = handleBuildingRectClick;
  window.updateBuildingRectPreview = updateBuildingRectPreview;
  window.finishBuildingRect = finishBuildingRect;
  window.cancelBuildingRect = cancelBuildingRect;
  window.getBuildingRectDimensions = getBuildingRectDimensions;
  window.updateBuildingRectDimensions = updateBuildingRectDimensions;
  window.syncRectInspectorUI = syncRectInspectorUI;
  window.computeBuildingConstructionAxes = computeBuildingConstructionAxes;
  window.syncBuildingAxesInspectorUI = syncBuildingAxesInspectorUI;
  window.setBuildingAxisMode = setBuildingAxisMode;
  window.cycleBuildingReferenceWall = cycleBuildingReferenceWall;
  window.createSolarPlaneFromBuildingRoof = createSolarPlaneFromBuildingRoof;

  // Exportar al namespace global
  window.render3DBuildingsInCesium = render3DBuildingsInCesium;

  // Registrar en RA namespace
  if (window.RA) {
    window.RA.buildings = {
      render: render3DBuildingsInCesium,
      deleteBuilding: deleteBuilding,
      startDrawingBuildingRect: startDrawingBuildingRect,
      handleBuildingRectClick: handleBuildingRectClick,
      updateBuildingRectPreview: updateBuildingRectPreview,
      finishBuildingRect: finishBuildingRect,
      cancelBuildingRect: cancelBuildingRect,
      getDimensions: getBuildingRectDimensions,
      updateDimensions: updateBuildingRectDimensions,
      syncUI: syncRectInspectorUI,
      computeAxes: computeBuildingConstructionAxes,
      setAxisMode: setBuildingAxisMode,
      cycleReferenceWall: cycleBuildingReferenceWall,
      createSolarPlaneFromRoof: createSolarPlaneFromBuildingRoof
    };
  }

  // Protección contra scroll accidental de ratón en inputs numéricos de edificios
  if (typeof document !== 'undefined') {
    document.addEventListener('wheel', function(e) {
      if (e.target && e.target.tagName === 'INPUT' && e.target.type === 'number' && e.target.closest('#ra-building-panel')) {
        if (document.activeElement === e.target) {
          e.target.blur();
        }
      }
    }, { passive: true });
  }

})();
