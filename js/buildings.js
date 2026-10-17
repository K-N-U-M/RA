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
      if (Array.isArray(bld.points)) bld.points.reverse();
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
      const eps = ridgeSpan * 0.05;
      const hastialMinPts = pEaves.filter((_, i) => projR[i] <= minR + eps);
      const hastialMaxPts = pEaves.filter((_, i) => projR[i] >= maxR - eps);
      fanTriangles([...hastialMinPts, r1], hastialColor);
      fanTriangles([...hastialMaxPts, r2], hastialColor);

      // ── Muros verticales segmentados por cara plana ───────────────
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
            id: (bld.id || 'bld') + '_gable_wall_' + i
          }));
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
      const slopePositions = roofCartoList.map(c => {
        const dx = (c.longitude - cLon) * R_EARTH * cosLat;
        const dy = (c.latitude - cLat) * R_EARTH;
        const proj = dx * dirX + dy * dirY;
        const vHeight = roofHeight + proj * Math.tan(pitchRad);
        return Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, Math.max(vHeight, avgBaseHeight + 1.0));
      });

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
