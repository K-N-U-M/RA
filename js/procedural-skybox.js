// ═══════════════════════════════════════════════════════════════════════════
// SKYBOX PROCEDURAL FOTORREALISTA AAA (MODULARIZADO)
// ═══════════════════════════════════════════════════════════════════════════

const _raSkyboxCache = {};
let _raCurrentSkyMode = 'day';
let _raCurrentSkyZenith = null;
let _raSkyboxMoveBound = false;

function _resolveSkyboxZenithTeme(refCartesian) {
  let ux = 0, uy = 0, uz = 1;
  if (typeof Cesium === 'undefined') return { x: ux, y: uy, z: uz };

  let pos = refCartesian || null;
  if (!pos && typeof WP !== 'undefined' && WP && WP.origin) pos = WP.origin;
  if (!pos && typeof viewer !== 'undefined' && viewer && viewer.camera && viewer.camera.positionWC) {
    pos = viewer.camera.positionWC;
  }

  let upFixed = null;
  if (pos && Cesium.Ellipsoid && Cesium.Ellipsoid.WGS84 && typeof Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal === 'function') {
    try {
      upFixed = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(pos, new Cesium.Cartesian3());
    } catch (_) { upFixed = null; }
  }
  if (!upFixed && pos) {
    const magP = Cesium.Cartesian3.magnitude(pos);
    if (magP > 1.0) {
      upFixed = Cesium.Cartesian3.normalize(pos, new Cesium.Cartesian3());
    }
  }
  if (!upFixed) return { x: ux, y: uy, z: uz };

  // Cesium.SkyBox muestrea v_texCoord en el marco TEME tras rotar por czm_temeToPseudoFixed.
  // Transformamos el cenit topocéntrico ENU local (Fixed/ECEF) al marco TEME del cubemap.
  let upTeme = upFixed;
  if (Cesium.Transforms && typeof Cesium.Transforms.computeTemeToPseudoFixedMatrix === 'function' && Cesium.Matrix3) {
    try {
      const julianTime = (typeof viewer !== 'undefined' && viewer && viewer.clock && viewer.clock.currentTime)
        ? viewer.clock.currentTime
        : Cesium.JulianDate.now();
      const temeToFixed = Cesium.Transforms.computeTemeToPseudoFixedMatrix(julianTime, new Cesium.Matrix3());
      if (temeToFixed) {
        const fixedToTeme = Cesium.Matrix3.transpose(temeToFixed, new Cesium.Matrix3());
        upTeme = Cesium.Matrix3.multiplyByVector(fixedToTeme, upFixed, new Cesium.Cartesian3());
        Cesium.Cartesian3.normalize(upTeme, upTeme);
      }
    } catch (_) { upTeme = upFixed; }
  }
  return { x: upTeme.x, y: upTeme.y, z: upTeme.z };
}

function _zenithDot(a, b) {
  if (!a || !b) return -1;
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

// ☀️ SKYBOX ESFÉRICO TOPOCÉNTRICO ANALÍTICO AAA (SEAMLESS CONTINUO & LUMINOSO)
// Proyecta el color respecto al vector cenit topocéntrico ENU local real en cualquier coordenada:
// Garantiza continuidad matemática exacta C^inf en las 6 aristas del cubo y horizonte horizontal real.
function createProceduralSkybox(mode, refCartesian) {
  mode = mode || 'day';
  const zenith = _resolveSkyboxZenithTeme(refCartesian);
  const cached = _raSkyboxCache[mode];
  if (cached && cached.sources && _zenithDot(cached.up, zenith) >= 0.9994) {
    _raCurrentSkyZenith = cached.up;
    return new Cesium.SkyBox({ sources: cached.sources });
  }

  const size = 128; // Resolución ultra-ligera (0 ms) con interpolación bilineal suave en GPU
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Paleta fotométrica fotovoltaica diurna, hora dorada, crepúsculo y noche
  const palettes = {
    day: {
      zenith:    [14, 165, 233],  // #0ea5e9 (Azul cielo diurno saturado y radiante)
      midSky:    [56, 189, 248],  // #38bdf8 (Celeste luminoso radiante)
      horizon:   [224, 242, 254], // #e0f2fe (Bruma clara de horizonte)
      ground:    [100, 116, 139]  // #64748b (Tierra neutra diurna)
    },
    golden: {
      zenith:    [37, 99, 235],   // #2563eb (Azul cobalto luminoso cálido)
      midSky:    [217, 119, 6],   // #d97706 (Dorado ámbar cálido)
      horizon:   [251, 146, 60],  // #fb923c (Ámbar solar radiante en el horizonte)
      ground:    [51, 65, 85]     // #334155 (Tierra cálida)
    },
    twilight: {
      zenith:    [30, 58, 138],   // #1e3a8a (Azul noche crepuscular luminoso)
      midSky:    [112, 26, 117],  // #701a75 (Púrpura crepuscular)
      horizon:   [234, 88, 12],   // #ea580c (Naranja crepuscular en el horizonte)
      ground:    [30, 41, 59]     // #1e293b (Sombra crepuscular)
    },
    night: {
      zenith:    [2, 6, 23],      // #020617 (Espacio profundo)
      midSky:    [4, 9, 28],      // #04091c (Azul oscuro estelar)
      horizon:   [10, 22, 56],    // #0a1638 (Horizonte nocturno)
      ground:    [2, 4, 9]        // #020409 (Tierra nocturna)
    }
  };
  const pal = palettes[mode] || palettes.day;

  function renderSide(face) {
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;

    let pIdx = 0;
    for (let j = 0; j < size; j++) {
      const v = 1.0 - 2.0 * ((j + 0.5) / size);
      for (let i = 0; i < size; i++) {
        const u = 2.0 * ((i + 0.5) / size) - 1.0;

        // Vector 3D WebGL CubeMap canónico de Cesium (dz = vertical universal)
        let vx = 0, vy = 0, vz = 0;
        if (face === 'posX') { vx =  1.0; vy = -v;   vz = -u;   }
        else if (face === 'negX') { vx = -1.0; vy = -v;   vz =  u;   }
        else if (face === 'posY') { vx =  u;   vy =  1.0; vz =  v;   }
        else if (face === 'negY') { vx =  u;   vy = -1.0; vz = -v;   }
        else if (face === 'posZ') { vx =  u;   vy = -v;   vz =  1.0; }
        else if (face === 'negZ') { vx = -u;   vy = -v;   vz = -1.0; }

        const mag = Math.hypot(vx, vy, vz) || 1.0;
        const dx = vx / mag;
        const dy = vy / mag;
        const dz = vz / mag;

        // Altitud cenital sobre el horizonte topocéntrico ENU local (producto escalar con cenit)
        const sinElev = dx * zenith.x + dy * zenith.y + dz * zenith.z;

        let r, g, b;
        if (sinElev >= 0) {
          const t = Math.min(1.0, Math.max(0.0, sinElev));
          if (t > 0.4) {
            const f = (t - 0.4) / 0.6;
            r = Math.round(pal.midSky[0] * (1 - f) + pal.zenith[0] * f);
            g = Math.round(pal.midSky[1] * (1 - f) + pal.zenith[1] * f);
            b = Math.round(pal.midSky[2] * (1 - f) + pal.zenith[2] * f);
          } else {
            const f = t / 0.4;
            r = Math.round(pal.horizon[0] * (1 - f) + pal.midSky[0] * f);
            g = Math.round(pal.horizon[1] * (1 - f) + pal.midSky[1] * f);
            b = Math.round(pal.horizon[2] * (1 - f) + pal.midSky[2] * f);
          }
        } else {
          const t = Math.min(1.0, Math.max(0.0, -sinElev / 0.35));
          r = Math.round(pal.horizon[0] * (1 - t) + pal.ground[0] * t);
          g = Math.round(pal.horizon[1] * (1 - t) + pal.ground[1] * t);
          b = Math.round(pal.horizon[2] * (1 - t) + pal.ground[2] * t);
        }

        if (mode === 'night' && sinElev > 0.12) {
          const hash = Math.sin(dx * 127.1 + dy * 311.7 + dz * 74.3) * 43758.5453;
          const starVal = hash - Math.floor(hash);
          if (starVal > 0.985) {
            const starBrite = Math.min(255, Math.floor(180 + starVal * 75));
            r = Math.max(r, starBrite);
            g = Math.max(g, starBrite);
            b = Math.max(b, 255);
          }
        }

        data[pIdx]     = r;
        data[pIdx + 1] = g;
        data[pIdx + 2] = b;
        data[pIdx + 3] = 255;
        pIdx += 4;
      }
    }

    ctx.putImageData(imgData, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.92);
  }

  const sources = {
    positiveX: renderSide('posX'),
    negativeX: renderSide('negX'),
    positiveY: renderSide('posY'),
    negativeY: renderSide('negY'),
    positiveZ: renderSide('posZ'),
    negativeZ: renderSide('negZ')
  };
  _raSkyboxCache[mode] = { up: zenith, sources: sources };
  _raCurrentSkyZenith = zenith;

  return new Cesium.SkyBox({ sources: sources });
}

function _bindSkyboxMoveListener() {
  if (_raSkyboxMoveBound || typeof viewer === 'undefined' || !viewer || !viewer.camera || !viewer.camera.moveEnd) return;
  _raSkyboxMoveBound = true;
  try {
    viewer.camera.moveEnd.addEventListener(function() {
      const sc = viewer && viewer.scene;
      if (!sc) return;
      const curZenith = _resolveSkyboxZenithTeme();
      if (!_raCurrentSkyZenith || _zenithDot(_raCurrentSkyZenith, curZenith) < 0.9994) {
        try {
          if (sc.skyBox && typeof sc.skyBox.destroy === 'function' && !sc.skyBox.isDestroyed()) {
            sc.skyBox.destroy();
          }
          sc.skyBox = createProceduralSkybox(_raCurrentSkyMode || 'day');
          if (sc.skyBox) sc.skyBox.show = true;
          if (typeof sc.requestRender === 'function') sc.requestRender();
        } catch (_) {}
      }
    });
  } catch (_) {}
}

window.wpUpdateAtmosphericSky = function(alt) {
  if (typeof viewer === 'undefined' || !viewer || !viewer.scene) return;
  const sc = viewer.scene;
  _bindSkyboxMoveListener();
  
  // Modos reactivos según la física solar
  let targetMode = 'day';
  if (alt <= -6.0) {
    targetMode = 'night';
  } else if (alt < 0.0) {
    targetMode = 'twilight';
  } else if (alt <= 12.0) {
    targetMode = 'golden';
  } else {
    targetMode = 'day';
  }

  const curZenith = _resolveSkyboxZenithTeme();
  const zenithChanged = !_raCurrentSkyZenith || _zenithDot(_raCurrentSkyZenith, curZenith) < 0.9994;
  if (_raCurrentSkyMode !== targetMode || !sc.skyBox || zenithChanged) {
    _raCurrentSkyMode = targetMode;
    try {
      if (sc.skyBox && typeof sc.skyBox.destroy === 'function' && !sc.skyBox.isDestroyed()) {
        sc.skyBox.destroy();
      }
      sc.skyBox = createProceduralSkybox(targetMode);
      sc.skyBox.show = true;
    } catch (e) {
      if (window.RA && window.RA.log) window.RA.log.debug('Error actualizando skyBox:', e);
    }
  }

  if (sc.skyBox) {
    sc.skyBox.show = true;
  }

  const at = sc.skyAtmosphere;
  const gl = sc.globe;
  if (targetMode === 'day') {
    if (at) {
      at.show = true;
      at.atmosphereLightIntensity = 3.5;
      at.brightnessShift = 0.05;
      at.saturationShift = 0.05;
    }
    if (gl) gl.showGroundAtmosphere = true;
    sc.backgroundColor = Cesium.Color.fromCssColorString('#0ea5e9');
  } else if (targetMode === 'golden') {
    if (at) {
      at.show = true;
      at.atmosphereLightIntensity = 3.8;
      at.brightnessShift = 0.02;
      at.saturationShift = 0.20;
    }
    if (gl) gl.showGroundAtmosphere = true;
    sc.backgroundColor = Cesium.Color.fromCssColorString('#2563eb');
  } else if (targetMode === 'twilight') {
    if (at) {
      at.show = true;
      at.atmosphereLightIntensity = 2.2;
      at.brightnessShift = 0.0;
      at.saturationShift = 0.15;
    }
    if (gl) gl.showGroundAtmosphere = true;
    sc.backgroundColor = Cesium.Color.fromCssColorString('#1e3a8a');
  } else {
    if (at) {
      at.show = false;
    }
    if (gl) gl.showGroundAtmosphere = false;
    sc.backgroundColor = Cesium.Color.fromCssColorString('#020617');
  }

  if (typeof sc.requestRender === 'function') {
    sc.requestRender();
  }
};

if (typeof window !== 'undefined') {
  window.createProceduralSkybox = createProceduralSkybox;
  window.updateSkyboxMode = window.wpUpdateAtmosphericSky;
}
