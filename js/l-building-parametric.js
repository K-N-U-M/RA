// ============================================================================
// MÓDULO PARAMÉTRICO DE EDIFICIOS EN L & CATÁLOGO ARQUITECTÓNICO DE CUBIERTAS
// Geometría analítica ENU exacta (45°-165°), alas asimétricas y extracción solar
// ============================================================================
(function (global) {
  'use strict';

  var R_EARTH = 6378137.0;

  var L_ROOF_DESIGNS = [
    { id: 'l_gable',     label: 'Dos Aguas Cruzadas (Cumbrera + Limahoya)' },
    { id: 'l_hip',       label: 'Cuatro Aguas / Pabellón (Limatesas + Limahoya)' },
    { id: 'l_mixed',     label: 'Mixta (Ala A Dos Aguas + Ala B Plana)' },
    { id: 'l_shed',      label: 'A 1 Agua Continua (Monopitch en L)' },
    { id: 'l_stepped',   label: 'Plana con Petos / Dos Niveles Escalonados' },
    { id: 'l_butterfly', label: 'Mariposa / Invertida (Canalón Interior en L)' }
  ];

  var L_PLANT_PRESETS = {
    classic_90:  { label: '90° Clásica',     angleDeg: 90,  wingALength: 24, wingAWidth: 10, wingBLength: 22, wingBWidth: 10, mirrored: false, wingBHeightDelta: 0 },
    chamfer_135: { label: '135° Chaflán',    angleDeg: 135, wingALength: 22, wingAWidth: 9,  wingBLength: 20, wingBWidth: 9,  mirrored: false, wingBHeightDelta: 0 },
    acute_60:    { label: '60° Cerrada',     angleDeg: 60,  wingALength: 26, wingAWidth: 9,  wingBLength: 24, wingBWidth: 9,  mirrored: false, wingBHeightDelta: 0 },
    main_annex:  { label: 'Nave + Anexo',    angleDeg: 90,  wingALength: 28, wingAWidth: 12, wingBLength: 20, wingBWidth: 7,  mirrored: false, wingBHeightDelta: 0 }
  };

  function clamp(v, minV, maxV) {
    return Math.max(minV, Math.min(maxV, v));
  }

  function normDeg(deg) {
    var d = deg % 360;
    return d < 0 ? d + 360 : d;
  }

  function defaultLParams(cLon, cLat, h) {
    return {
      isLParametric: true,
      roofDesign: 'l_gable',
      angleDeg: 90,
      wingALength: 24,
      wingAWidth: 10,
      wingBLength: 22,
      wingBWidth: 10,
      rotationDeg: 90, // 90° = Ala A hacia Este (+X), Ala B hacia Norte (+Y)
      mirrored: false,
      wingBHeightDelta: 0,
      anchorCarto: { longitude: cLon, latitude: cLat, height: h || 0 }
    };
  }

  // Convierte azimut geográfico (0=N, 90=E, 180=S, 270=W) a ángulo matemático CCW desde Este
  function azToMathRad(azDeg) {
    return ((90 - azDeg) * Math.PI) / 180;
  }

  // Calcula huella ENU exacta en metros [P0, P1, P2, P3, P4, P5] en sentido CCW
  // P0 = esquina exterior de intersección; P3 = vértice cóncavo interior (reflex)
  function computeLFootprintENU(rawParams) {
    var p = rawParams || {};
    var angleDeg = clamp(parseFloat(p.angleDeg) || 90, 45, 165);
    var theta = (angleDeg * Math.PI) / 180;
    var sinT = Math.sin(theta);
    var cosT = Math.cos(theta);

    var wA = clamp(parseFloat(p.wingAWidth) || 10, 3, 120);
    var wB = clamp(parseFloat(p.wingBWidth) || 10, 3, 120);

    // Mínimos geométricos para evitar colapso o auto-intersección para cualquier ángulo 45°..165°
    var aP3 = (wB + wA * cosT) / sinT;
    var bP3 = (wA + wB * cosT) / sinT;
    var minLenA = Math.max(4.5, aP3 + 3.0);
    var minLenB = Math.max(4.5, bP3 + 3.0);

    var lenA = clamp(parseFloat(p.wingALength) || 24, minLenA, 300);
    var lenB = clamp(parseFloat(p.wingBLength) || 22, minLenB, 300);
    var rotDeg = normDeg(typeof p.rotationDeg === 'number' ? p.rotationDeg : 90);
    var mirrored = !!p.mirrored;
    var s = mirrored ? -1 : 1;

    var alphaA = azToMathRad(rotDeg);
    var uA = { x: Math.cos(alphaA), y: Math.sin(alphaA) };
    var nA = { x: -s * Math.sin(alphaA), y: s * Math.cos(alphaA) };

    var uB = {
      x: cosT * uA.x + sinT * nA.x,
      y: cosT * uA.y + sinT * nA.y
    };
    var nB = {
      x: sinT * uA.x - cosT * nA.x,
      y: sinT * uA.y - cosT * nA.y
    };

    var P0 = { x: 0, y: 0 };
    var P1 = { x: lenA * uA.x, y: lenA * uA.y };
    var P2 = { x: lenA * uA.x + wA * nA.x, y: lenA * uA.y + wA * nA.y };
    var P3 = { x: aP3 * uA.x + wA * nA.x, y: aP3 * uA.y + wA * nA.y };
    var P4 = { x: lenB * uB.x + wB * nB.x, y: lenB * uB.y + wB * nB.y };
    var P5 = { x: lenB * uB.x, y: lenB * uB.y };

    var pts = [P0, P1, P2, P3, P4, P5];
    var reflexIdx = 3;
    if (mirrored) {
      // Al espejar se invierte la orientación; revertir para mantener sentido CCW estricto [P0, P5, P4, P3, P2, P1]
      pts.reverse();
      reflexIdx = 3; // Índice 3 tras invertir [0,1,2,3,4,5] -> [5,4,3,2,1,0] => ojo: es 2!
    }

    return {
      pts: pts,
      reflexIdx: mirrored ? 2 : 3,
      p0Idx: mirrored ? 5 : 0,
      uA: uA,
      nA: nA,
      uB: uB,
      nB: nB,
      effective: {
        angleDeg: angleDeg,
        wingALength: lenA,
        wingAWidth: wA,
        wingBLength: lenB,
        wingBWidth: wB,
        rotationDeg: rotDeg,
        mirrored: mirrored
      }
    };
  }

  function enuToCartographic(xM, yM, anchorCarto) {
    var cosLat = Math.cos(anchorCarto.latitude) || 1;
    return {
      longitude: anchorCarto.longitude + xM / (R_EARTH * cosLat),
      latitude: anchorCarto.latitude + yM / R_EARTH,
      height: anchorCarto.height || 0
    };
  }

  function enuToCartesian(xM, yM, heightM, anchorCarto) {
    var c = enuToCartographic(xM, yM, anchorCarto);
    return Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, heightM);
  }

  function buildCartesianPoints(params) {
    var geom = computeLFootprintENU(params);
    var anchor = params.anchorCarto || { longitude: 0, latitude: 0, height: 0 };
    return geom.pts.map(function (pt) {
      return enuToCartesian(pt.x, pt.y, anchor.height || 0, anchor);
    });
  }

  // Reconstruye lParams razonables si un edificio L existente o dibujado a mano no los tenía aún
  function ensureLParamsFromBuilding(bld) {
    if (!bld) return null;
    if (bld.lParams && bld.lParams.isLParametric) {
      if (!bld.lParams.anchorCarto && Array.isArray(bld.points) && bld.points[0]) {
        var c0 = Cesium.Cartographic.fromCartesian(bld.points[0]);
        if (c0) bld.lParams.anchorCarto = { longitude: c0.longitude, latitude: c0.latitude, height: c0.height || 0 };
      }
      if (!bld.lParams.roofDesign) bld.lParams.roofDesign = 'l_gable';
      return bld.lParams;
    }

    var pts = Array.isArray(bld.points) ? bld.points : [];
    var anchor = { longitude: 0, latitude: 0, height: 0 };
    var estLenA = 24, estWA = 10, estLenB = 22, estWB = 10, estAz = 90;

    if (pts.length >= 3 && typeof Cesium !== 'undefined' && Cesium.Cartographic) {
      var cartos = pts.map(function (p) { return Cesium.Cartographic.fromCartesian(p); }).filter(Boolean);
      if (cartos.length >= 3) {
        anchor = { longitude: cartos[0].longitude, latitude: cartos[0].latitude, height: cartos[0].height || 0 };
        var cosLat = Math.cos(anchor.latitude) || 1;
        var enu = cartos.map(function (c) {
          return {
            x: (c.longitude - anchor.longitude) * R_EARTH * cosLat,
            y: (c.latitude - anchor.latitude) * R_EARTH
          };
        });
        var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        enu.forEach(function (q) {
          if (q.x < minX) minX = q.x;
          if (q.x > maxX) maxX = q.x;
          if (q.y < minY) minY = q.y;
          if (q.y > maxY) maxY = q.y;
        });
        estLenA = Math.max(12, Math.round((maxX - minX) || 24));
        estLenB = Math.max(12, Math.round((maxY - minY) || 22));
        estWA = Math.max(5, Math.round(estLenB * 0.42));
        estWB = Math.max(5, Math.round(estLenA * 0.42));
        // Centrar ligeramente el ancla P0 respecto al centroide previo
        var cx = (minX + maxX) * 0.5;
        var cy = (minY + maxY) * 0.5;
        anchor = enuToCartographic(cx - estLenA * 0.35, cy - estLenB * 0.35, anchor);
      }
    }

    bld.lParams = {
      isLParametric: true,
      roofDesign: bld.lRoofDesign || 'l_gable',
      angleDeg: 90,
      wingALength: estLenA,
      wingAWidth: estWA,
      wingBLength: estLenB,
      wingBWidth: estWB,
      rotationDeg: estAz,
      mirrored: false,
      wingBHeightDelta: 0,
      anchorCarto: anchor
    };
    bld.lRoofDesign = bld.lParams.roofDesign;
    return bld.lParams;
  }

  function syncAnchorFromPoints(bld) {
    if (!bld || !bld.lParams || !bld.lParams.isLParametric || !Array.isArray(bld.points) || bld.points.length < 6) return;
    var p0Idx = bld.lParams.mirrored ? 5 : 0;
    var p1Idx = bld.lParams.mirrored ? 4 : 1;
    var c0 = Cesium.Cartographic.fromCartesian(bld.points[p0Idx]);
    var c1 = Cesium.Cartographic.fromCartesian(bld.points[p1Idx]);
    if (c0) {
      bld.lParams.anchorCarto = { longitude: c0.longitude, latitude: c0.latitude, height: c0.height || 0 };
      if (c1) {
        var dx = (c1.longitude - c0.longitude) * R_EARTH * Math.cos(c0.latitude);
        var dy = (c1.latitude - c0.latitude) * R_EARTH;
        if (Math.hypot(dx, dy) > 0.5) {
          bld.lParams.rotationDeg = Math.round(normDeg(90 - (Math.atan2(dy, dx) * 180 / Math.PI)));
        }
      }
    }
  }

  function updateFromParams(bld, patch, opts) {
    if (!bld) return false;
    var lp = ensureLParamsFromBuilding(bld);
    if (!lp) return false;

    if (patch && typeof patch === 'object') {
      Object.keys(patch).forEach(function (k) {
        if (patch[k] !== undefined) lp[k] = patch[k];
      });
    }
    lp.angleDeg = clamp(parseFloat(lp.angleDeg) || 90, 45, 165);
    lp.rotationDeg = normDeg(parseFloat(lp.rotationDeg));
    if (!Number.isFinite(lp.rotationDeg)) lp.rotationDeg = 90;
    lp.wingBHeightDelta = clamp(parseFloat(lp.wingBHeightDelta) || 0, -10, 10);

    var geom = computeLFootprintENU(lp);
    lp.wingALength = Number(geom.effective.wingALength.toFixed(2));
    lp.wingAWidth = Number(geom.effective.wingAWidth.toFixed(2));
    lp.wingBLength = Number(geom.effective.wingBLength.toFixed(2));
    lp.wingBWidth = Number(geom.effective.wingBWidth.toFixed(2));

    bld.roofType = 'l_shape';
    bld.lRoofDesign = lp.roofDesign || 'l_gable';
    bld.points = buildCartesianPoints(lp);

    if (typeof global.computeBuildingConstructionAxes === 'function') {
      var axes = global.computeBuildingConstructionAxes(bld);
      if (axes && typeof axes.normalAzimuthDeg === 'number') {
        bld.roofAzimuth = Math.round(axes.normalAzimuthDeg);
      }
    }

    var shouldRender = !(opts && opts.skipRender);
    if (shouldRender) {
      if (typeof global.wpInvalidateHeatmap === 'function') global.wpInvalidateHeatmap('Edificio en L actualizado');
      if (typeof global.render3DBuildingsInCesium === 'function') global.render3DBuildingsInCesium();
      if (typeof global.renderTriad2D === 'function') global.renderTriad2D();
      syncInspectorUI(bld);
    }
    return true;
  }

  function createDefaultLBuilding(cLon, cLat, h) {
    var lp = defaultLParams(cLon, cLat, h);
    var pts3D = buildCartesianPoints(lp);
    return {
      id: 'bld_l_' + Date.now(),
      name: 'Edificio en L #' + ((global.buildings ? global.buildings.length : 0) + 1),
      points: pts3D,
      height: 6.5,
      roofType: 'l_shape',
      lRoofDesign: lp.roofDesign,
      lParams: lp,
      axisMode: 'wall',
      refEdgeIdx: 0,
      roofPitch: 25,
      roofAzimuth: 180,
      parapetHeight: 0.6,
      parapetWidth: 0.25,
      roofThickness: 0.20,
      overhang: 0.25,
      facadeColor: '#F1F5F9',
      roofColor: '#E2E8F0',
      edgeColor: '#334155',
      visible: true
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GEOMETRÍA 3D COMÚN PARA RENDERIZADO Y EXTRACCIÓN SOLAR DE LOS 6 DISEÑOS
  // ─────────────────────────────────────────────────────────────────────────

  // Identifica índices canónicos [P0, P1, P2, P3, P4, P5] incluso si un edificio fue espejo/reordenado
  function getCanonicalCornerIndices(N, bld) {
    if (bld && bld.lParams && bld.lParams.isLParametric && N === 6) {
      if (bld.lParams.mirrored) {
        // Espejado y revertido: P0=5, P1=4, P2=3, P3=2, P4=1, P5=0 -> no, espera:
        // [P0,P1,P2,P3,P4,P5] reversed => [P5,P4,P3,P2,P1,P0], así que:
        // index 5=P0, 4=P1, 3=P2, 2=P3, 1=P4, 0=P5 (y en CCW el vecino izq de P0 es 0=P5 y der es 4=P1)
        // Mapeamos manteniendo sentido CCW local alrededor de P3!
        // Orden CCW real de vértices en el array si mirrored=true es [P5, P4, P3, P2, P1, P0]:
        // Tomamos Wing1 = [P0(5)->P5(0)->P4(1)->P3(2)] y Wing2 = [P3(2)->P2(3)->P1(4)->P0(5)]!
        return { p0: 5, p1: 0, p2: 1, p3: 2, p4: 3, p5: 4, isCCWCanonical: true };
      }
      return { p0: 0, p1: 1, p2: 2, p3: 3, p4: 4, p5: 5, isCCWCanonical: true };
    }
    return null;
  }

  function findReflexCornerIndex(cartoList) {
    var N = cartoList.length;
    var cLon = 0, cLat = 0;
    cartoList.forEach(function (c) { cLon += c.longitude; cLat += c.latitude; });
    cLon /= N; cLat /= N;
    var cosLat = Math.cos(cLat) || 1;
    var pts = cartoList.map(function (c) {
      return { x: (c.longitude - cLon) * R_EARTH * cosLat, y: (c.latitude - cLat) * R_EARTH };
    });
    var reflexIdx = 0;
    var minCross = 0;
    for (var i = 0; i < N; i++) {
      var prev = pts[(i - 1 + N) % N];
      var curr = pts[i];
      var next = pts[(i + 1) % N];
      var cross = (curr.x - prev.x) * (next.y - curr.y) - (curr.y - prev.y) * (next.x - curr.x);
      if (cross < minCross) {
        minCross = cross;
        reflexIdx = i;
      }
    }
    return reflexIdx;
  }

  function resolveCanonicalCartos(roofCartoList, baseCartoList, bld) {
    var N = roofCartoList.length;
    var map = getCanonicalCornerIndices(N, bld);
    if (!map && N === 6) {
      // Fallback para edificios L heredados de 6 vértices (P3 = reflex corner, opuesto = P0)
      var rIdx = findReflexCornerIndex(roofCartoList);
      map = {
        p3: rIdx,
        p4: (rIdx + 1) % 6,
        p5: (rIdx + 2) % 6,
        p0: (rIdx + 3) % 6,
        p1: (rIdx + 4) % 6,
        p2: (rIdx + 5) % 6
      };
    }
    if (!map) return null;

    function pick(arr, idx) { return arr[idx]; }
    return {
      roof: [pick(roofCartoList, map.p0), pick(roofCartoList, map.p1), pick(roofCartoList, map.p2), pick(roofCartoList, map.p3), pick(roofCartoList, map.p4), pick(roofCartoList, map.p5)],
      base: [pick(baseCartoList, map.p0), pick(baseCartoList, map.p1), pick(baseCartoList, map.p2), pick(baseCartoList, map.p3), pick(baseCartoList, map.p4), pick(baseCartoList, map.p5)]
    };
  }

  function midpointCarto(cA, cB, h) {
    return Cesium.Cartesian3.fromRadians((cA.longitude + cB.longitude) * 0.5, (cA.latitude + cB.latitude) * 0.5, h);
  }

  function cartoDistM(cA, cB) {
    var cosLat = Math.cos((cA.latitude + cB.latitude) * 0.5) || 1;
    var dx = (cB.longitude - cA.longitude) * R_EARTH * cosLat;
    var dy = (cB.latitude - cA.latitude) * R_EARTH;
    return Math.hypot(dx, dy);
  }

  function lerpCartesian(pA, pB, t) {
    return Cesium.Cartesian3.lerp(pA, pB, t, new Cesium.Cartesian3());
  }

  // Calcula planos 3D y líneas estructurales para cualquier diseño arquitectónico L
  function buildLRoofGeometry(bld, cartoList, roofCartoList, avgBaseHeight, bldHeight) {
    var design = (bld && bld.lParams && bld.lParams.roofDesign) || (bld && bld.lRoofDesign) || 'l_gable';
    var pitch = (bld && typeof bld.roofPitch === 'number') ? bld.roofPitch : 25;
    var pitchRad = (pitch * Math.PI) / 180;
    var roofHeight = avgBaseHeight + bldHeight;
    var overhang = (bld && typeof bld.overhang === 'number') ? bld.overhang : 0;
    var parH = (bld && typeof bld.parapetHeight === 'number' && bld.parapetHeight > 0) ? bld.parapetHeight : 0;
    var parW = (bld && typeof bld.parapetWidth === 'number' && bld.parapetWidth > 0) ? bld.parapetWidth : 0.25;
    var roofThk = Math.max(0.05, (bld && bld.roofThickness) || 0.20);

    var canon = resolveCanonicalCartos(roofCartoList, cartoList, bld);
    if (!canon) return null;

    var E = canon.roof; // [E0, E1, E2, E3, E4, E5] carto con voladizo
    var B = canon.base; // [B0, B1, B2, B3, B4, B5] carto base de muro

    var pEaves = E.map(function (c) { return Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, roofHeight); });
    var wallBase = B.map(function (c) { return Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, avgBaseHeight); });
    var wallTop = B.map(function (c) { return Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, roofHeight); });

    // Anchos reales de cada ala para adaptar altura/limahoya en alas desiguales
    var wA = Math.max(2.0, cartoDistM(E[1], E[2]));
    var wB = Math.max(2.0, cartoDistM(E[4], E[5]));
    var maxHalfW = Math.max(wA, wB) * 0.5;
    var ridgeHeight = roofHeight + maxHalfW * Math.tan(pitchRad);

    var rHub = midpointCarto(E[0], E[3], ridgeHeight);
    var rA = midpointCarto(E[1], E[2], ridgeHeight);
    var rB = midpointCarto(E[4], E[5], ridgeHeight);

    var faces = [];        // { name, pts3D, isSolar }
    var gables = [];       // triángulos/polígonos de hastial o desnivel en hastialColor
    var wallTopHeights = [roofHeight, roofHeight, roofHeight, roofHeight, roofHeight, roofHeight];
    var ridgeLines = [];   // [pA, pB]
    var hipLines = [];     // [pA, pB]
    var valleyLines = [];  // [pA, pB]
    var stepWalls = [];    // { pA, pB, minH, maxH, isFacade }
    var parapets = [];     // array de { polyCartos, floorH, topH, widthM }
    var customEaves = pEaves;
    var extraEaveRings = null;

    if (design === 'l_gable') {
      faces.push(
        { name: 'Ala A Exterior', pts3D: [pEaves[0], pEaves[1], rA, rHub], isSolar: true },
        { name: 'Ala A Interior', pts3D: [pEaves[2], pEaves[3], rHub, rA], isSolar: true },
        { name: 'Ala B Interior', pts3D: [pEaves[3], pEaves[4], rB, rHub], isSolar: true },
        { name: 'Ala B Exterior', pts3D: [pEaves[5], pEaves[0], rHub, rB], isSolar: true }
      );
      gables.push(
        [wallTop[1], wallTop[2], midpointCarto(B[1], B[2], ridgeHeight)],
        [wallTop[4], wallTop[5], midpointCarto(B[4], B[5], ridgeHeight)]
      );
      ridgeLines.push([rHub, rA], [rHub, rB]);
      hipLines.push([pEaves[0], rHub]);
      valleyLines.push([pEaves[3], rHub]);
    } else if (design === 'l_hip') {
      var lenWingA = Cesium.Cartesian3.distance(rHub, rA);
      var lenWingB = Cesium.Cartesian3.distance(rHub, rB);
      var insetFracA = lenWingA > 0.5 ? Math.min(0.65, (wA * 0.5) / lenWingA) : 0.35;
      var insetFracB = lenWingB > 0.5 ? Math.min(0.65, (wB * 0.5) / lenWingB) : 0.35;
      var rAHip = lerpCartesian(rA, rHub, insetFracA);
      var rBHip = lerpCartesian(rB, rHub, insetFracB);

      faces.push(
        { name: 'Ala A Exterior', pts3D: [pEaves[0], pEaves[1], rAHip, rHub], isSolar: true },
        { name: 'Ala A Interior', pts3D: [pEaves[2], pEaves[3], rHub, rAHip], isSolar: true },
        { name: 'Faldón Testero A', pts3D: [pEaves[1], pEaves[2], rAHip], isSolar: true },
        { name: 'Ala B Interior', pts3D: [pEaves[3], pEaves[4], rBHip, rHub], isSolar: true },
        { name: 'Ala B Exterior', pts3D: [pEaves[5], pEaves[0], rHub, rBHip], isSolar: true },
        { name: 'Faldón Testero B', pts3D: [pEaves[4], pEaves[5], rBHip], isSolar: true }
      );
      ridgeLines.push([rHub, rAHip], [rHub, rBHip]);
      hipLines.push([pEaves[0], rHub], [pEaves[1], rAHip], [pEaves[2], rAHip], [pEaves[4], rBHip], [pEaves[5], rBHip]);
      valleyLines.push([pEaves[3], rHub]);
    } else if (design === 'l_mixed') {
      // Ala A [0,1,2,3] a dos aguas completa; Ala B [3,4,5,0] cubierta plana con peto perimetral
      var ridgeA0 = midpointCarto(E[0], E[3], roofHeight + (wA * 0.5) * Math.tan(pitchRad));
      var ridgeA1 = midpointCarto(E[1], E[2], roofHeight + (wA * 0.5) * Math.tan(pitchRad));
      var bRidge0 = midpointCarto(B[0], B[3], roofHeight + (wA * 0.5) * Math.tan(pitchRad));
      var bRidge1 = midpointCarto(B[1], B[2], roofHeight + (wA * 0.5) * Math.tan(pitchRad));

      faces.push(
        { name: 'Ala A Faldón Exterior', pts3D: [pEaves[0], pEaves[1], ridgeA1, ridgeA0], isSolar: true },
        { name: 'Ala A Faldón Interior', pts3D: [pEaves[2], pEaves[3], ridgeA0, ridgeA1], isSolar: true },
        { name: 'Ala B Terraza Plana',   pts3D: [wallTop[0], wallTop[3], wallTop[4], wallTop[5]], isSolar: true }
      );
      gables.push(
        [wallTop[1], wallTop[2], bRidge1],
        [wallTop[3], wallTop[0], bRidge0]
      );
      ridgeLines.push([ridgeA0, ridgeA1]);
      if (parH > 0) {
        parapets.push({
          polyCartos: [B[3], B[4], B[5], B[0]],
          openEdgesOnly: [true, true, true, false], // no poner pretil en la diagonal B[0]->B[3] contra hastial
          floorH: roofHeight,
          topH: roofHeight + parH,
          widthM: parW
        });
      }
    } else if (design === 'l_shed') {
      var az = (typeof bld.roofAzimuth === 'number') ? bld.roofAzimuth : 180;
      var azRad = (az * Math.PI) / 180;
      var dirX = Math.sin(azRad), dirY = Math.cos(azRad);
      var cLon = 0, cLat = 0;
      E.forEach(function (c) { cLon += c.longitude; cLat += c.latitude; });
      cLon /= E.length; cLat /= E.length;
      var cosLat = Math.cos(cLat) || 1;
      var rawH = E.map(function (c) {
        var dx = (c.longitude - cLon) * R_EARTH * cosLat;
        var dy = (c.latitude - cLat) * R_EARTH;
        return roofHeight + (dx * dirX + dy * dirY) * Math.tan(pitchRad);
      });
      var minH = Math.min.apply(null, rawH);
      var lift = Math.max(0, (avgBaseHeight + 1.0) - minH);
      var slopedPts = E.map(function (c, i) {
        return Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, rawH[i] + lift);
      });
      customEaves = slopedPts;
      wallTopHeights = B.map(function (c) {
        var dx = (c.longitude - cLon) * R_EARTH * cosLat;
        var dy = (c.latitude - cLat) * R_EARTH;
        return roofHeight + (dx * dirX + dy * dirY) * Math.tan(pitchRad) + lift;
      });
      // Triangulación en estrella desde el vértice cóncavo P3 (siempre dentro de la L)
      faces.push(
        { name: 'Faldón Único A', pts3D: [slopedPts[3], slopedPts[0], slopedPts[1]], isSolar: false },
        { name: 'Faldón Único B', pts3D: [slopedPts[3], slopedPts[1], slopedPts[2]], isSolar: false },
        { name: 'Faldón Único C', pts3D: [slopedPts[3], slopedPts[5], slopedPts[0]], isSolar: false },
        { name: 'Faldón Único D', pts3D: [slopedPts[3], slopedPts[4], slopedPts[5]], isSolar: false },
        { name: 'Cubierta Continua en L', pts3D: slopedPts, isSolar: true, renderSkip: true }
      );
    } else if (design === 'l_stepped') {
      var deltaH = (bld.lParams && typeof bld.lParams.wingBHeightDelta === 'number') ? bld.lParams.wingBHeightDelta : 0;
      var hA = roofHeight;
      var hB = avgBaseHeight + Math.max(1.5, bldHeight + deltaH);

      if (Math.abs(hB - hA) < 0.05) {
        var flatTop = B.map(function (c) { return Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, hA); });
        customEaves = flatTop;
        faces.push(
          { name: 'Terraza L A', pts3D: [flatTop[3], flatTop[0], flatTop[1]], isSolar: false },
          { name: 'Terraza L B', pts3D: [flatTop[3], flatTop[1], flatTop[2]], isSolar: false },
          { name: 'Terraza L C', pts3D: [flatTop[3], flatTop[5], flatTop[0]], isSolar: false },
          { name: 'Terraza L D', pts3D: [flatTop[3], flatTop[4], flatTop[5]], isSolar: false },
          { name: 'Cubierta Plana en L', pts3D: flatTop, isSolar: true, renderSkip: true }
        );
        if (parH > 0) {
          wallTopHeights = [hA + parH, hA + parH, hA + parH, hA + parH, hA + parH, hA + parH];
          parapets.push({
            polyCartos: B,
            floorH: hA,
            topH: hA + parH,
            widthM: parW
          });
        }
      } else {
        // Dos niveles escalonados independientes unidos por muro de salto en P0 -> P3
        var topA = [B[0], B[1], B[2], B[3]].map(function (c) { return Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, hA); });
        var topB = [B[0], B[3], B[4], B[5]].map(function (c) { return Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, hB); });
        wallTopHeights = [
          Math.max(hA, hB) + parH,
          hA + parH,
          hA + parH,
          Math.max(hA, hB) + parH,
          hB + parH,
          hB + parH
        ];
        faces.push(
          { name: 'Ala A Plana (' + (hA - avgBaseHeight).toFixed(1) + 'm)', pts3D: topA, isSolar: true },
          { name: 'Ala B Plana (' + (hB - avgBaseHeight).toFixed(1) + 'm)', pts3D: topB, isSolar: true }
        );
        // Muro vertical cerrado del salto entre niveles
        stepWalls.push({
          pA: Cesium.Cartesian3.fromRadians(B[0].longitude, B[0].latitude, avgBaseHeight),
          pB: Cesium.Cartesian3.fromRadians(B[3].longitude, B[3].latitude, avgBaseHeight),
          minH: Math.min(hA, hB),
          maxH: Math.max(hA, hB) + parH,
          isFacade: true
        });
        if (parH > 0) {
          parapets.push({
            polyCartos: [B[0], B[1], B[2], B[3]],
            openEdgesOnly: [true, true, true, false],
            floorH: hA,
            topH: hA + parH,
            widthM: parW
          });
          parapets.push({
            polyCartos: [B[3], B[4], B[5], B[0]],
            openEdgesOnly: [true, true, true, false],
            floorH: hB,
            topH: hB + parH,
            widthM: parW
          });
        }
        customEaves = [];
        extraEaveRings = [topA, topB];
      }
    } else if (design === 'l_butterfly') {
      // Mariposa: aleros exteriores altos (outerH) convergiendo al canalón central bajo (roofHeight)
      var outerH = roofHeight + maxHalfW * Math.tan(pitchRad);
      var pHigh = E.map(function (c) { return Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, outerH); });
      var gHub = midpointCarto(E[0], E[3], roofHeight);
      var gA = midpointCarto(E[1], E[2], roofHeight);
      var gB = midpointCarto(E[4], E[5], roofHeight);
      var bGA = midpointCarto(B[1], B[2], roofHeight);
      var bGB = midpointCarto(B[4], B[5], roofHeight);
      var bHigh = B.map(function (c) { return Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, outerH); });

      customEaves = pHigh;
      wallTopHeights = [outerH, roofHeight, roofHeight, outerH, roofHeight, roofHeight];
      // Muros laterales a outerH; hastiales extremos rebajados en V hasta canalón + triángulos de esquina
      stepWalls.push(
        { pA: wallBase[0], pB: wallBase[1], minH: avgBaseHeight, maxH: outerH, isFacade: true },
        { pA: wallBase[2], pB: wallBase[3], minH: avgBaseHeight, maxH: outerH, isFacade: true },
        { pA: wallBase[3], pB: wallBase[4], minH: avgBaseHeight, maxH: outerH, isFacade: true },
        { pA: wallBase[5], pB: wallBase[0], minH: avgBaseHeight, maxH: outerH, isFacade: true },
        { pA: wallBase[1], pB: wallBase[2], minH: avgBaseHeight, maxH: roofHeight, isFacade: true },
        { pA: wallBase[4], pB: wallBase[5], minH: avgBaseHeight, maxH: roofHeight, isFacade: true }
      );
      gables.push(
        [wallTop[1], bHigh[1], bGA],
        [wallTop[2], bGA, bHigh[2]],
        [wallTop[4], bHigh[4], bGB],
        [wallTop[5], bGB, bHigh[5]]
      );
      faces.push(
        { name: 'Ala A Mariposa Ext', pts3D: [pHigh[0], pHigh[1], gA, gHub], isSolar: true },
        { name: 'Ala A Mariposa Int', pts3D: [pHigh[2], pHigh[3], gHub, gA], isSolar: true },
        { name: 'Ala B Mariposa Int', pts3D: [pHigh[3], pHigh[4], gB, gHub], isSolar: true },
        { name: 'Ala B Mariposa Ext', pts3D: [pHigh[5], pHigh[0], gHub, gB], isSolar: true }
      );
      valleyLines.push([gHub, gA], [gHub, gB], [pHigh[3], gHub]);
      hipLines.push([pHigh[0], gHub]);
    }

    return {
      design: design,
      E: E,
      B: B,
      avgBaseHeight: avgBaseHeight,
      roofHeight: roofHeight,
      roofThk: roofThk,
      overhang: overhang,
      wallBase: wallBase,
      wallTop: wallTop,
      wallTopHeights: wallTopHeights,
      customEaves: customEaves,
      extraEaveRings: extraEaveRings,
      faces: faces,
      gables: gables,
      ridgeLines: ridgeLines,
      hipLines: hipLines,
      valleyLines: valleyLines,
      stepWalls: stepWalls,
      parapets: parapets
    };
  }

  // Renderizado completo 3D Cesium reutilizando colores y apariencia estándar
  function renderLBuilding(ctx) {
    var bld = ctx.bld;
    var geom = buildLRoofGeometry(bld, ctx.cartoList, ctx.roofCartoList, ctx.avgBaseHeight, ctx.bldHeight);
    if (!geom) return false;

    var viewer = ctx.viewer;
    var addTri = function (A, B, C, color) {
      if (!A || !B || !C) return;
      if (Cesium.Cartesian3.distance(A, B) < 0.02 || Cesium.Cartesian3.distance(B, C) < 0.02 || Cesium.Cartesian3.distance(A, C) < 0.02) return;
      var ab = Cesium.Cartesian3.subtract(B, A, new Cesium.Cartesian3());
      var ac = Cesium.Cartesian3.subtract(C, A, new Cesium.Cartesian3());
      if (Cesium.Cartesian3.magnitude(Cesium.Cartesian3.cross(ab, ac, new Cesium.Cartesian3())) < 1e-4) return;
      try {
        var inst = new Cesium.GeometryInstance({
          geometry: Cesium.PolygonGeometry.fromPositions({ positions: [A, B, C], perPositionHeight: true }),
          attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(color) }
        });
        global._buildingPrimitives.push(viewer.scene.primitives.add(new Cesium.Primitive({
          geometryInstances: inst,
          appearance: ctx.createAppearance(true),
          shadows: Cesium.ShadowMode.ENABLED,
          asynchronous: false
        })));
      } catch (_) {}
    };

    var addQuadOrFan = function (pts, color) {
      if (!pts || pts.length < 3) return;
      for (var i = 1; i < pts.length - 1; i++) {
        addTri(pts[0], pts[i], pts[i + 1], color);
      }
    };

    // 1. Muros perimetrales
    try {
      var wallInstances = [];
      if (geom.stepWalls.length > 0 && geom.design === 'l_butterfly') {
        geom.stepWalls.forEach(function (sw, idx) {
          wallInstances.push(new Cesium.GeometryInstance({
            geometry: new Cesium.WallGeometry({ positions: [sw.pA, sw.pB], minimumHeights: [sw.minH, sw.minH], maximumHeights: [sw.maxH, sw.maxH] }),
            attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(ctx.facadeColor) },
            id: (bld.id || 'bld') + '_l_bwall_' + idx
          }));
        });
      } else {
        for (var i = 0; i < 6; i++) {
          var nextI = (i + 1) % 6;
          var minH = geom.avgBaseHeight;
          var maxA = geom.wallTopHeights[i];
          var maxB = geom.wallTopHeights[nextI];
          if (geom.design === 'l_stepped' && Math.abs(geom.wallTopHeights[1] - geom.wallTopHeights[4]) > 0.05) {
            // Para 2 niveles: aristas 0-2 pertenecen a Ala A, aristas 3-5 pertenecen a Ala B
            var hEdge = (i < 3) ? geom.wallTopHeights[1] : geom.wallTopHeights[4];
            maxA = hEdge;
            maxB = hEdge;
          }
          wallInstances.push(new Cesium.GeometryInstance({
            geometry: new Cesium.WallGeometry({
              positions: [geom.wallBase[i], geom.wallBase[nextI]],
              minimumHeights: [minH, minH],
              maximumHeights: [maxA, maxB]
            }),
            attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(ctx.facadeColor) },
            id: (bld.id || 'bld') + '_l_wall_' + i
          }));
        }
        // Muro de salto vertical en escalonados
        geom.stepWalls.forEach(function (sw, sIdx) {
          wallInstances.push(new Cesium.GeometryInstance({
            geometry: new Cesium.WallGeometry({ positions: [sw.pA, sw.pB], minimumHeights: [sw.minH, sw.minH], maximumHeights: [sw.maxH, sw.maxH] }),
            attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(ctx.hastialColor) },
            id: (bld.id || 'bld') + '_l_stepwall_' + sIdx
          }));
        });
      }
      if (wallInstances.length > 0) {
        global._buildingPrimitives.push(viewer.scene.primitives.add(new Cesium.Primitive({
          geometryInstances: wallInstances,
          appearance: ctx.createAppearance(true),
          shadows: Cesium.ShadowMode.ENABLED,
          asynchronous: false
        })));
      }
    } catch (_) {}

    // 2. Hastiales de cierre
    geom.gables.forEach(function (gPts) {
      addQuadOrFan(gPts, ctx.hastialColor);
    });

    // 3. Faldones de cubierta
    geom.faces.forEach(function (f) {
      if (f.renderSkip) return;
      addQuadOrFan(f.pts3D, ctx.roofColor);
    });

    // 4. Pretiles en cubiertas planas / mixtas / escalonadas
    geom.parapets.forEach(function (par) {
      var nP = par.polyCartos.length;
      for (var k = 0; k < nP; k++) {
        if (par.openEdgesOnly && !par.openEdgesOnly[k]) continue;
        var nk = (k + 1) % nP;
        var cA = par.polyCartos[k];
        var cB = par.polyCartos[nk];
        var pTopA = Cesium.Cartesian3.fromRadians(cA.longitude, cA.latitude, par.topH);
        var pTopB = Cesium.Cartesian3.fromRadians(cB.longitude, cB.latitude, par.topH);
        try {
          var wInst = new Cesium.GeometryInstance({
            geometry: new Cesium.WallGeometry({ positions: [pTopA, pTopB], minimumHeights: [par.floorH, par.floorH], maximumHeights: [par.topH, par.topH] }),
            attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(ctx.hastialColor) }
          });
          global._buildingPrimitives.push(viewer.scene.primitives.add(new Cesium.Primitive({
            geometryInstances: wInst,
            appearance: ctx.createAppearance(true),
            shadows: Cesium.ShadowMode.DISABLED,
            asynchronous: false
          })));
        } catch (_) {}
      }
    });

    // 5. Canto de alero perimetral (en tipologías inclinadas con alero)
    if (geom.design !== 'l_stepped' && geom.design !== 'l_mixed') {
      var eavesArr = geom.customEaves;
      var eavesUnder = eavesArr.map(function (p) {
        var c = Cesium.Cartographic.fromCartesian(p);
        return Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, Math.max(geom.avgBaseHeight + 0.4, c.height - geom.roofThk));
      });
      for (var ei = 0; ei < eavesArr.length; ei++) {
        var eni = (ei + 1) % eavesArr.length;
        addTri(eavesArr[ei], eavesArr[eni], eavesUnder[eni], ctx.edgeColor);
        addTri(eavesArr[ei], eavesUnder[eni], eavesUnder[ei], ctx.edgeColor);
        if (geom.overhang > 0 && geom.design !== 'l_butterfly') {
          var wtA = Cesium.Cartesian3.fromRadians(geom.B[ei].longitude, geom.B[ei].latitude, geom.wallTopHeights[ei]);
          var wtB = Cesium.Cartesian3.fromRadians(geom.B[eni].longitude, geom.B[eni].latitude, geom.wallTopHeights[eni]);
          addTri(wtA, wtB, eavesUnder[eni], ctx.facadeColor);
          addTri(wtA, eavesUnder[eni], eavesUnder[ei], ctx.facadeColor);
        }
      }
    }

    // 6. Líneas CAD diferenciadas: Cumbreras, Limatesas, Limahoyas y Aleros
    function elevateLine(pts) {
      return pts.map(function (p) {
        var c = Cesium.Cartographic.fromCartesian(p);
        return Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, c.height + 0.08);
      });
    }
    geom.ridgeLines.forEach(function (pair) {
      global._buildingEntities.push(viewer.entities.add({
        name: (bld.name || 'Edificio L') + ' - Cumbrera',
        polyline: { positions: elevateLine(pair), width: 4.5, material: ctx.ridgeColor, arcType: Cesium.ArcType.NONE, clampToGround: false, disableDepthTestDistance: Number.POSITIVE_INFINITY }
      }));
    });
    geom.hipLines.forEach(function (pair) {
      global._buildingEntities.push(viewer.entities.add({
        name: (bld.name || 'Edificio L') + ' - Limatesa',
        polyline: { positions: elevateLine(pair), width: 3.5, material: ctx.ridgeColor, arcType: Cesium.ArcType.NONE, clampToGround: false, disableDepthTestDistance: Number.POSITIVE_INFINITY }
      }));
    });
    geom.valleyLines.forEach(function (pair) {
      global._buildingEntities.push(viewer.entities.add({
        name: (bld.name || 'Edificio L') + ' - Limahoya',
        polyline: { positions: elevateLine(pair), width: 4.5, material: Cesium.Color.fromCssColorString('#38bdf8'), arcType: Cesium.ArcType.NONE, clampToGround: false, disableDepthTestDistance: Number.POSITIVE_INFINITY }
      }));
    });
    if (geom.customEaves && geom.customEaves.length >= 3) {
      var eRing = elevateLine(geom.customEaves);
      global._buildingEntities.push(viewer.entities.add({
        polyline: { positions: eRing.concat([eRing[0]]), width: ctx.isSel ? 4.0 : 3.0, material: ctx.edgeColor, arcType: Cesium.ArcType.NONE, clampToGround: false, disableDepthTestDistance: Number.POSITIVE_INFINITY }
      }));
    }
    if (Array.isArray(geom.extraEaveRings)) {
      geom.extraEaveRings.forEach(function (ring) {
        if (!Array.isArray(ring) || ring.length < 3) return;
        var eR = elevateLine(ring);
        global._buildingEntities.push(viewer.entities.add({
          polyline: { positions: eR.concat([eR[0]]), width: ctx.isSel ? 4.0 : 3.0, material: ctx.edgeColor, arcType: Cesium.ArcType.NONE, clampToGround: false, disableDepthTestDistance: Number.POSITIVE_INFINITY }
        }));
      });
    }
    return true;
  }

  // Extrae todos los paños solares válidos (coplanares exactos) para conversión en 1 clic
  function extractSolarFaces(bld) {
    if (!bld || !Array.isArray(bld.points) || bld.points.length < 3) return [];
    var cartoList = bld.points.map(function (p) { return Cesium.Cartographic.fromCartesian(p); }).filter(Boolean);
    if (cartoList.length < 3) return [];
    var avgBase = 0;
    cartoList.forEach(function (c) { avgBase += (c.height || 0); });
    avgBase /= cartoList.length;
    var bldH = Math.max(bld.height || 6.5, 1.0);
    var geom = buildLRoofGeometry(bld, cartoList, cartoList, avgBase, bldH);
    if (!geom) return [];

    return geom.faces.filter(function (f) { return f.isSolar && Array.isArray(f.pts3D) && f.pts3D.length >= 3; });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SINCRONIZACIÓN DE INSPECTOR UI
  // ─────────────────────────────────────────────────────────────────────────
  function syncInspectorUI(bld) {
    if (typeof document === 'undefined') return;
    var box = document.getElementById('bld-l-parametric-box');
    if (!box) return;

    var isL = !!(bld && (bld.roofType === 'l_shape' || (bld.lParams && bld.lParams.isLParametric)));
    box.style.display = isL ? 'flex' : 'none';
    if (!isL) return;

    var lp = ensureLParamsFromBuilding(bld);
    if (!lp) return;

    var designSel = document.getElementById('bld-l-roof-design');
    if (designSel) designSel.value = lp.roofDesign || 'l_gable';

    var angSlider = document.getElementById('bld-l-angle-slider');
    var angNum = document.getElementById('bld-l-angle-num');
    var angBadge = document.getElementById('bld-l-angle-badge');
    var angVal = Math.round(lp.angleDeg || 90);
    if (angSlider && document.activeElement !== angSlider) angSlider.value = angVal;
    if (angNum && document.activeElement !== angNum) angNum.value = angVal;
    if (angBadge) angBadge.textContent = angVal + '°';

    var inLa = document.getElementById('bld-l-wing-a-len');
    var inWa = document.getElementById('bld-l-wing-a-wid');
    var inLb = document.getElementById('bld-l-wing-b-len');
    var inWb = document.getElementById('bld-l-wing-b-wid');
    var inRot = document.getElementById('bld-l-rot');
    var chkMir = document.getElementById('bld-l-mirror');
    var stepRow = document.getElementById('bld-l-step-delta-row');
    var inDelta = document.getElementById('bld-l-wing-b-delta');

    if (inLa && document.activeElement !== inLa) inLa.value = (lp.wingALength || 24).toFixed(1);
    if (inWa && document.activeElement !== inWa) inWa.value = (lp.wingAWidth || 10).toFixed(1);
    if (inLb && document.activeElement !== inLb) inLb.value = (lp.wingBLength || 22).toFixed(1);
    if (inWb && document.activeElement !== inWb) inWb.value = (lp.wingBWidth || 10).toFixed(1);
    if (inRot && document.activeElement !== inRot) inRot.value = Math.round(lp.rotationDeg != null ? lp.rotationDeg : 90);
    if (chkMir) chkMir.checked = !!lp.mirrored;
    if (stepRow) stepRow.style.display = (lp.roofDesign === 'l_stepped') ? 'flex' : 'none';
    if (inDelta && document.activeElement !== inDelta) inDelta.value = (lp.wingBHeightDelta || 0).toFixed(1);
  }

  function applyLiveChange(patch) {
    var bldId = (typeof global.selectedBuildingId !== 'undefined') ? global.selectedBuildingId : null;
    var arr = Array.isArray(global.buildings) ? global.buildings : [];
    var bld = arr.find(function (b) { return b && b.id === bldId; });
    if (!bld) return false;
    return updateFromParams(bld, patch);
  }

  function beginUndoSnap(undoLabel) {
    if (global.RAundo && typeof global.RAundo.snapBuildings === 'function') {
      global.RAundo.snapBuildings(undoLabel || 'Personalizar edificio en L');
    }
  }

  function applyControlChange(patch, undoLabel) {
    beginUndoSnap(undoLabel);
    return applyLiveChange(patch);
  }

  function applyPreset(presetKey) {
    var preset = L_PLANT_PRESETS[presetKey];
    if (!preset) return false;
    return applyControlChange({
      angleDeg: preset.angleDeg,
      wingALength: preset.wingALength,
      wingAWidth: preset.wingAWidth,
      wingBLength: preset.wingBLength,
      wingBWidth: preset.wingBWidth,
      mirrored: preset.mirrored,
      wingBHeightDelta: preset.wingBHeightDelta
    }, 'Plantilla L: ' + preset.label);
  }

  // Datos para el tirador 3D de ángulo en el visor
  function getAngleHandle3D(bld) {
    if (!bld || !(bld.roofType === 'l_shape' || (bld.lParams && bld.lParams.isLParametric))) return null;
    var lp = ensureLParamsFromBuilding(bld);
    if (!lp || !lp.anchorCarto || !Array.isArray(bld.points) || bld.points.length < 6) return null;
    var geom = computeLFootprintENU(lp);
    var anchor = lp.anchorCarto;
    var hBase = anchor.height || 0;
    var hRoof = hBase + Math.max(bld.height || 6.5, 1.0);

    var p0Idx = lp.mirrored ? 5 : 0;
    var p5Idx = lp.mirrored ? 0 : 5;
    var p1Idx = lp.mirrored ? 4 : 1;
    var cornerPos = bld.points[p0Idx];
    var wingBTip = bld.points[p5Idx];
    var wingATip = bld.points[p1Idx];
    if (!cornerPos || !wingBTip || !wingATip) return null;

    var cP0 = Cesium.Cartographic.fromCartesian(cornerPos);
    var cTip = Cesium.Cartographic.fromCartesian(wingBTip);
    var cA = Cesium.Cartographic.fromCartesian(wingATip);
    if (!cP0 || !cTip || !cA) return null;

    return {
      cornerPos: Cesium.Cartesian3.fromRadians(cP0.longitude, cP0.latitude, hRoof),
      handlePos: Cesium.Cartesian3.fromRadians(cTip.longitude, cTip.latitude, hRoof),
      wingAPos: Cesium.Cartesian3.fromRadians(cA.longitude, cA.latitude, hRoof),
      planeHeight: hBase,
      angleDeg: geom.effective.angleDeg,
      mirrored: lp.mirrored,
      uA: geom.uA,
      nA: geom.nA
    };
  }

  global.RALBuilding = {
    ROOF_DESIGNS: L_ROOF_DESIGNS,
    PRESETS: L_PLANT_PRESETS,
    defaultLParams: defaultLParams,
    ensureLParamsFromBuilding: ensureLParamsFromBuilding,
    syncAnchorFromPoints: syncAnchorFromPoints,
    computeLFootprintENU: computeLFootprintENU,
    buildCartesianPoints: buildCartesianPoints,
    updateFromParams: updateFromParams,
    createDefaultLBuilding: createDefaultLBuilding,
    renderLBuilding: renderLBuilding,
    extractSolarFaces: extractSolarFaces,
    syncInspectorUI: syncInspectorUI,
    beginUndoSnap: beginUndoSnap,
    applyLiveChange: applyLiveChange,
    applyControlChange: applyControlChange,
    applyPreset: applyPreset,
    getAngleHandle3D: getAngleHandle3D
  };
})(typeof window !== 'undefined' ? window : this);
