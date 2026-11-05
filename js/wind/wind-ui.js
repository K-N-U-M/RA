/**
 * ═══════════════════════════════════════════════════════════════════════
 * wind-ui.js — Capa de Interfaz de Usuario y Controlador de Ingeniería
 *              del Módulo Eólico RA-Wind (Fase 1 + Fase 2)
 * ═══════════════════════════════════════════════════════════════════════
 * Conecta el catálogo, las entidades WindTurbineInstance, CesiumJS y los
 * 5 motores numéricos de Fase 2:
 *   - Recurso Eólico (Weibull + Jensen + Extrapolación vertical z0)
 *   - Aerodinámica de Cubierta (Burbuja de Wilson 1979 + Speed-Up)
 *   - Acústica Ambiental (ISO 9613-2 + Cumplimiento RD 1367/2007 + Isófonas 3D)
 *   - Seguridad Estructural (CTE DB-SE-AE + IEC 61400-2 + Resonancia Campbell)
 *   - Ingeniería Eléctrica (REBT ITC-BT-40 ΔU ≤ 1,5% + Dump Load + Diferencial Clase B)
 * @version 2.0.0  2026-10-24
 */
(function (global) {
  'use strict';

  var RAWind = global.RAWind || (global.RAWind = {});

  var _placementActive = false;
  var _selectedTurbineForPlacement = null;
  var _selectedTurbineIdForInspect = null;
  var _selectedWindSource = 'era5';
  var _uiCalcCache = {
    optRec: null,
    optRecKey: '',
    dispatch: null,
    dispatchKey: '',
    flicker: null,
    flickerKey: ''
  };
  function _invalidateUiCalcCache() {
    _uiCalcCache.optRec = null;
    _uiCalcCache.optRecKey = '';
    _uiCalcCache.dispatch = null;
    _uiCalcCache.dispatchKey = '';
    _uiCalcCache.flicker = null;
    _uiCalcCache.flickerKey = '';
  }
  var _showAdvancedResource = false;
  var _resourceActiveMetrics = {
    wpd: true,
    profile: true,
    sectors: true,
    iec: true
  };

  function toggleAdvancedResource() {
    _showAdvancedResource = !_showAdvancedResource;
    renderStep2Panel();
  }

  function toggleResourceMetric(metricKey) {
    if (Object.prototype.hasOwnProperty.call(_resourceActiveMetrics, metricKey)) {
      _resourceActiveMetrics[metricKey] = !_resourceActiveMetrics[metricKey];
      renderStep2Panel();
    }
  }

  function _getYawCardinal(deg) {
    var d = ((Number(deg) % 360) + 360) % 360;
    if (d >= 337.5 || d < 22.5) return 'Norte';
    if (d >= 22.5 && d < 67.5) return 'Noreste';
    if (d >= 67.5 && d < 112.5) return 'Este';
    if (d >= 112.5 && d < 157.5) return 'Sureste';
    if (d >= 157.5 && d < 202.5) return 'Sur';
    if (d >= 202.5 && d < 247.5) return 'Suroeste';
    if (d >= 247.5 && d < 292.5) return 'Oeste';
    return 'Noroeste';
  }

  function _buildWindRoseSVG(sectors, prevailingDirDeg) {
    var secList = (Array.isArray(sectors) && sectors.length === 12)
      ? sectors
      : ((RAWind.Resource && RAWind.Resource.DEFAULT_SECTORS) || []);
    var cx = 56, cy = 56, maxR = 42;
    var maxFreq = 0.01;
    secList.forEach(function (s) {
      if (s && s.freq > maxFreq) maxFreq = s.freq;
    });

    var svg = '<svg width="112" height="112" viewBox="0 0 112 112" style="overflow:visible;flex-shrink:0;">';
    // Anillos concéntricos de referencia
    [0.33, 0.66, 1.0].forEach(function (f) {
      svg += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (maxR * f).toFixed(1) + '" fill="none" stroke="rgba(148,163,184,0.18)" stroke-width="0.8" stroke-dasharray="2,2"/>';
    });
    // Ejes N-S y E-O
    svg += '<line x1="' + cx + '" y1="' + (cy - maxR - 3) + '" x2="' + cx + '" y2="' + (cy + maxR + 3) + '" stroke="rgba(148,163,184,0.22)" stroke-width="0.8"/>';
    svg += '<line x1="' + (cx - maxR - 3) + '" y1="' + cy + '" x2="' + (cx + maxR + 3) + '" y2="' + cy + '" stroke="rgba(148,163,184,0.22)" stroke-width="0.8"/>';

    // Pétalos de los 12 sectores (30° cada uno)
    var halfSpanRad = (12.5 * Math.PI) / 180.0;
    secList.forEach(function (sec, idx) {
      var dirDeg = (sec && sec.dirDeg !== undefined) ? sec.dirDeg : (idx * 30);
      var freq = (sec && typeof sec.freq === 'number') ? sec.freq : 0.08;
      var normR = Math.max(0.12, Math.min(1.0, freq / maxFreq)) * maxR;
      // Convención náutica: 0° = Norte (arriba, -Y), 90° = Este (+X)
      var angRad = ((dirDeg - 90) * Math.PI) / 180.0;
      var x1 = cx + normR * Math.cos(angRad - halfSpanRad);
      var y1 = cy + normR * Math.sin(angRad - halfSpanRad);
      var x2 = cx + normR * Math.cos(angRad + halfSpanRad);
      var y2 = cy + normR * Math.sin(angRad + halfSpanRad);

      var isDominant = Math.abs(((dirDeg - prevailingDirDeg + 540) % 360) - 180) <= 15;
      var fillCol = isDominant ? 'rgba(245,158,11,0.65)' : 'rgba(56,189,248,0.38)';
      var strokeCol = isDominant ? '#FBBF24' : '#38BDF8';
      var pctStr = Math.round(freq * 100) + '%';
      svg += '<path d="M ' + cx + ' ' + cy + ' L ' + x1.toFixed(1) + ' ' + y1.toFixed(1) + ' A ' + normR.toFixed(1) + ' ' + normR.toFixed(1) + ' 0 0 1 ' + x2.toFixed(1) + ' ' + y2.toFixed(1) + ' Z" fill="' + fillCol + '" stroke="' + strokeCol + '" stroke-width="' + (isDominant ? '1.3' : '0.8') + '"><title>' + (sec.label || (dirDeg + '°')) + ': ' + pctStr + '</title></path>';
    });

    // Etiquetas cardinales
    svg += '<text x="' + cx + '" y="9" text-anchor="middle" fill="#F8FAFC" font-size="8.5" font-weight="800">N</text>';
    svg += '<text x="' + (cx + maxR + 8) + '" y="' + (cy + 3) + '" text-anchor="middle" fill="#94A3B8" font-size="8" font-weight="700">E</text>';
    svg += '<text x="' + cx + '" y="' + (cy + maxR + 11) + '" text-anchor="middle" fill="#94A3B8" font-size="8" font-weight="700">S</text>';
    svg += '<text x="' + (cx - maxR - 8) + '" y="' + (cy + 3) + '" text-anchor="middle" fill="#94A3B8" font-size="8" font-weight="700">O</text>';
    svg += '<circle cx="' + cx + '" cy="' + cy + '" r="2.2" fill="#FBBF24"/>';
    svg += '</svg>';
    return svg;
  }

  function init() {
    if (global._pendingWindTurbinePlacement) {
      var item = global._pendingWindTurbinePlacement;
      global._pendingWindTurbinePlacement = null;
      startTurbinePlacement(item);
    }
    if (RAWind.Entity && typeof RAWind.Entity.recalculateAllEngineering === 'function') {
      RAWind.Entity.recalculateAllEngineering();
    }
    renderStep2Panel();
  }

  function isPlacementActive() {
    return _placementActive;
  }

  function getPendingTurbine() {
    return _selectedTurbineForPlacement;
  }

  function startTurbinePlacement(catalogItem) {
    if (!catalogItem) return;
    _selectedTurbineForPlacement = catalogItem;
    _placementActive = true;
    showPlacementHint(catalogItem);

    if (typeof global.showToast === 'function') {
      global.showToast(
        'COLOCAR ' + (catalogItem.model || 'AEROGENERADOR').toUpperCase(),
        'Haz clic sobre el terreno o cubierta para ubicar el aerogenerador. ESC cancela.',
        'info',
        4000
      );
    }
    if (typeof global.showStatus === 'function') {
      global.showStatus('💨 HAZ CLIC EN EL MODELO 3D O TERRENO PARA UBICAR ' + (catalogItem.manufacturer + ' ' + catalogItem.model), 4000);
    }
  }

  function placeAtCartesian(cartesian) {
    if (!_placementActive || !_selectedTurbineForPlacement) return false;
    var Cesium = global.Cesium;
    if (!cartesian || !Cesium) return false;

    var carto = Cesium.Cartographic.fromCartesian(cartesian);
    var instance = RAWind.Entity.createInstance(_selectedTurbineForPlacement, {
      positionCartographic: {
        longitudeRad: carto.longitude,
        latitudeRad: carto.latitude,
        altitudeM: carto.height || 0
      }
    });

    var issues = RAWind.Entity.checkRotorClearance(instance);
    if (issues && issues.length > 0) {
      var msg = 'Aviso: La distancia al aerogenerador más cercano (' +
        issues[0].otherName + ' a ' + issues[0].distanceM + 'm) es inferior a los ' +
        issues[0].requiredM + 'm recomendados (3D).';
      if (typeof global.showToast === 'function') {
        global.showToast('DISTANCIA CRÍTICA', msg, 'warning', 4500);
      } else if (typeof global.showNotification === 'function') {
        global.showNotification(msg, 'warning');
      }
    }

    _selectedTurbineIdForInspect = instance.id;
    RAWind.Entity.addToScene(instance);
    if (global.RAWindVisualizer && typeof global.RAWindVisualizer.selectTurbine === 'function') {
      global.RAWindVisualizer.selectTurbine(instance.id);
    }

    _placementActive = false;
    _selectedTurbineForPlacement = null;
    hidePlacementHint();
    renderStep2Panel();

    if (typeof global.wpSwitchGenTab === 'function') {
      global.wpSwitchGenTab('wind');
    }

    if (typeof global.showToast === 'function') {
      global.showToast(
        'AEROGENERADOR INSTALADO',
        instance.name + ' fijado en la escena 3D con éxito.',
        'success',
        3500
      );
    }

    return true;
  }

  function cancelPlacement() {
    _placementActive = false;
    _selectedTurbineForPlacement = null;
    hidePlacementHint();
    if (typeof global.showToast === 'function') {
      global.showToast('COLOCACIÓN CANCELADA', 'Operación de aerogenerador abortada.', 'info', 2000);
    }
  }

  function showPlacementHint(turbine) {
    var hint = document.getElementById('ra-wind-placement-hint');
    if (!hint) {
      hint = document.createElement('div');
      hint.id = 'ra-wind-placement-hint';
      hint.style.cssText = 'position:fixed;top:70px;left:50%;transform:translateX(-50%);' +
        'background:rgba(15,23,42,0.92);color:#38BDF8;border:1px solid #0284C7;' +
        'padding:10px 20px;border-radius:8px;font-size:12px;font-weight:600;' +
        'z-index:99999;box-shadow:0 8px 24px rgba(0,0,0,0.5);display:flex;align-items:center;gap:12px;';
      document.body.appendChild(hint);
    }
    hint.innerHTML = '<span>💨 Haz clic en el terreno o cubierta para colocar <b>' +
      (turbine.manufacturer + ' ' + turbine.model) + '</b></span>' +
      '<button onclick="if(window.RAWindUI) window.RAWindUI.cancelPlacement()" style="background:#334155;color:#fff;border:none;border-radius:4px;padding:3px 8px;cursor:pointer;font-size:11px;">✕ Cancelar</button>';
    hint.style.display = 'flex';
  }

  function hidePlacementHint() {
    var hint = document.getElementById('ra-wind-placement-hint');
    if (hint) hint.style.display = 'none';
  }

  function selectTurbineForInspect(id) {
    _selectedTurbineIdForInspect = id || null;
    if (global.RAWindVisualizer && typeof global.RAWindVisualizer.selectTurbine === 'function') {
      global.RAWindVisualizer.selectTurbine(id || null);
    }
    renderStep2Panel();
  }

  function updateResourceParam(key, value) {
    if (!RAWind.Resource) return;
    var patch = {};
    patch[key] = Number(value);
    RAWind.Resource.updateConfig(patch);
    if (RAWind.Entity && typeof RAWind.Entity.recalculateAllEngineering === 'function') {
      RAWind.Entity.recalculateAllEngineering();
    }
    if (global.RAWindVisualizer && typeof global.RAWindVisualizer.renderAll === 'function') {
      global.RAWindVisualizer.renderAll();
    }
    renderStep2Panel();
  }

  function setWindSource(source) {
    _selectedWindSource = source || 'era5';
    if (_selectedWindSource === 'manual') {
      if (typeof global.showToast === 'function') {
        global.showToast('MODO MANUAL / IDAE', 'Edita directamente la velocidad media, Weibull k y rugosidad en los controles.', 'info', 3500);
      }
    }
  }

  async function fetchSelectedWindSource() {
    var selectElem = document.getElementById('wind-source-select');
    var source = selectElem ? selectElem.value : (_selectedWindSource || 'era5');
    _selectedWindSource = source;

    if (source === 'manual') {
      if (typeof global.showToast === 'function') {
        global.showToast('MODO MANUAL / IDAE', 'Configuración manual activa. Ajusta los parámetros en los campos inferiores.', 'info', 3500);
      }
      return;
    }

    var btn = document.getElementById('btn-fetch-selected-wind') || document.getElementById('btn-fetch-era5-wind');
    var origText = btn ? btn.innerHTML : '';
    if (btn) {
      btn.innerHTML = '<span>⏳ Obteniendo...</span>';
      btn.style.opacity = '0.7';
      btn.disabled = true;
    }

    // Obtener coordenadas del proyecto o cámara
    var latDeg = 41.38; // Coordenadas por defecto peninsulares
    var lonDeg = 2.17;
    var t0 = (Array.isArray(global.windTurbines) && global.windTurbines.length > 0) ? global.windTurbines[0] : null;

    if (t0 && t0.positionCartographic) {
      latDeg = t0.positionCartographic.latitudeRad * (180.0 / Math.PI);
      lonDeg = t0.positionCartographic.longitudeRad * (180.0 / Math.PI);
    } else if (global.solarProjectConfig && typeof global.solarProjectConfig.latitude === 'number') {
      latDeg = global.solarProjectConfig.latitude;
      lonDeg = global.solarProjectConfig.longitude;
    } else if (global.viewer && global.viewer.camera) {
      try {
        var carto = global.viewer.scene.globe.ellipsoid.cartesianToCartographic(global.viewer.camera.position);
        if (carto) {
          latDeg = carto.latitude * (180.0 / Math.PI);
          lonDeg = carto.longitude * (180.0 / Math.PI);
        }
      } catch (eCam) {}
    }

    try {
      if (!RAWind.Resource) {
        throw new Error('Módulo de recurso eólico no disponible');
      }

      if (source === 'era5') {
        if (typeof RAWind.Resource.fetchERA5WindResource !== 'function') {
          throw new Error('Función fetchERA5WindResource no disponible');
        }
        var dataERA5 = await RAWind.Resource.fetchERA5WindResource(latDeg, lonDeg);
        if (dataERA5 && dataERA5.vMeanRefMs > 0) {
          var v50Est = Number((dataERA5.vMeanRefMs * Math.pow(50.0 / 10.0, 0.143)).toFixed(2));
          RAWind.Resource.updateConfig({
            sourceName: 'Copernicus ERA5 (8.760h)',
            vMeanRefMs: dataERA5.vMeanRefMs,
            vMean50mMs: v50Est,
            weibullK: dataERA5.weibullK || 2.0,
            ambientTempC: dataERA5.ambientTempC || 15.0,
            prevailingWindDirDeg: dataERA5.prevailingWindDirDeg !== undefined ? dataERA5.prevailingWindDirDeg : 270,
            sectors: Array.isArray(dataERA5.sectors) && dataERA5.sectors.length === 12 ? dataERA5.sectors : undefined
          });

          if (RAWind.Resource.getConfig().autoYawToWind !== false && RAWind.Entity && typeof RAWind.Entity.orientAllToPrevailingWind === 'function') {
            RAWind.Entity.orientAllToPrevailingWind(dataERA5.prevailingWindDirDeg);
          }
          if (RAWind.Entity && typeof RAWind.Entity.recalculateAllEngineering === 'function') {
            RAWind.Entity.recalculateAllEngineering();
          }
          if (global.RAWindVisualizer && typeof global.RAWindVisualizer.renderAll === 'function') {
            global.RAWindVisualizer.renderAll();
          }

          if (typeof global.showToast === 'function') {
            global.showToast(
              'VIENTO COPERNICUS ERA5',
              'V_med=' + dataERA5.vMeanRefMs + ' m/s @10m (k=' + dataERA5.weibullK + ', Dir=' + dataERA5.prevailingWindDirDeg + '°). Góndolas orientadas automáticamente.',
              'success',
              5000
            );
          }
        }
      } else if (source === 'nasa') {
        if (typeof RAWind.Resource.fetchNASAWindResource !== 'function') {
          throw new Error('Función fetchNASAWindResource no disponible');
        }
        var dataNASA = await RAWind.Resource.fetchNASAWindResource(latDeg, lonDeg);
        if (dataNASA && dataNASA.vMeanRefMs > 0) {
          var updateObj = {
            sourceName: 'NASA POWER (Satelital 30a)',
            vMeanRefMs: dataNASA.vMeanRefMs,
            vMean50mMs: dataNASA.vMean50mMs || Number((dataNASA.vMeanRefMs * 1.25).toFixed(2)),
            weibullK: dataNASA.weibullK || 2.05,
            ambientTempC: dataNASA.ambientTempC || 15.0,
            prevailingWindDirDeg: dataNASA.prevailingWindDirDeg || 270
          };
          if (dataNASA.shearExponentAlpha) {
            updateObj.shearExponentAlpha = dataNASA.shearExponentAlpha;
          }
          RAWind.Resource.updateConfig(updateObj);

          if (RAWind.Resource.getConfig().autoYawToWind !== false && RAWind.Entity && typeof RAWind.Entity.orientAllToPrevailingWind === 'function') {
            RAWind.Entity.orientAllToPrevailingWind(updateObj.prevailingWindDirDeg);
          }
          if (RAWind.Entity && typeof RAWind.Entity.recalculateAllEngineering === 'function') {
            RAWind.Entity.recalculateAllEngineering();
          }
          if (global.RAWindVisualizer && typeof global.RAWindVisualizer.renderAll === 'function') {
            global.RAWindVisualizer.renderAll();
          }

          if (typeof global.showToast === 'function') {
            global.showToast(
              'VIENTO NASA POWER',
              'V_med=' + dataNASA.vMeanRefMs + ' m/s @10m (50m=' + dataNASA.vMean50mMs + ' m/s, α=' + dataNASA.shearExponentAlpha + '). Climatología satelital 30a aplicada.',
              'success',
              5000
            );
          }
        }
      } else if (source === 'gwa') {
        if (typeof RAWind.Resource.fetchGWAWindResource !== 'function') {
          throw new Error('Función fetchGWAWindResource no disponible');
        }
        var dataGWA = await RAWind.Resource.fetchGWAWindResource(latDeg, lonDeg);
        if (dataGWA && dataGWA.vMeanRefMs > 0) {
          var gwaSectors = null;
          if (Array.isArray(dataGWA.sectorFrequencies) && dataGWA.sectorFrequencies.length === 12) {
            var sLabels = ['N', 'NNE', 'ENE', 'E', 'ESE', 'SSE', 'S', 'SSW', 'WSW', 'W', 'WNW', 'NNW'];
            var fSum = dataGWA.sectorFrequencies.reduce(function (a, b) { return a + Number(b || 0); }, 0);
            var normFactor = fSum > 1.5 ? 100.0 : (fSum > 0 ? fSum : 1.0);
            gwaSectors = [];
            for (var si = 0; si < 12; si++) {
              var fq = Number(dataGWA.sectorFrequencies[si] || 0) / normFactor;
              var kSec = (Array.isArray(dataGWA.sectorK10) && dataGWA.sectorK10[si]) ? Number(dataGWA.sectorK10[si]) : (dataGWA.weibullK || 2.0);
              var aSec = (Array.isArray(dataGWA.sectorA10) && dataGWA.sectorA10[si]) ? Number(dataGWA.sectorA10[si]) : dataGWA.vMeanRefMs;
              var vScaleSec = dataGWA.vMeanRefMs > 0 ? Math.max(0.6, Math.min(1.5, (aSec * 0.886) / dataGWA.vMeanRefMs)) : 1.0;
              gwaSectors.push({
                dirDeg: si * 30,
                label: sLabels[si],
                freq: Number(fq.toFixed(3)),
                k: Number(kSec.toFixed(2)),
                vScale: Number(vScaleSec.toFixed(2))
              });
            }
          }

          var updateGWA = {
            sourceName: 'Global Wind Atlas 3.0 (DTU 250m)',
            vMeanRefMs: dataGWA.vMeanRefMs,
            vMean50mMs: dataGWA.vMean50mMs || Number((dataGWA.vMeanRefMs * 1.28).toFixed(2)),
            weibullK: dataGWA.weibullK || 2.0,
            ambientTempC: dataGWA.ambientTempC || 15.0,
            prevailingWindDirDeg: dataGWA.prevailingWindDirDeg !== undefined ? dataGWA.prevailingWindDirDeg : 270
          };
          if (dataGWA.shearExponentAlpha) {
            updateGWA.shearExponentAlpha = dataGWA.shearExponentAlpha;
          }
          if (gwaSectors) {
            updateGWA.sectors = gwaSectors;
          }
          RAWind.Resource.updateConfig(updateGWA);

          if (RAWind.Resource.getConfig().autoYawToWind !== false && RAWind.Entity && typeof RAWind.Entity.orientAllToPrevailingWind === 'function') {
            RAWind.Entity.orientAllToPrevailingWind(updateGWA.prevailingWindDirDeg);
          }
          if (RAWind.Entity && typeof RAWind.Entity.recalculateAllEngineering === 'function') {
            RAWind.Entity.recalculateAllEngineering();
          }
          if (global.RAWindVisualizer && typeof global.RAWindVisualizer.renderAll === 'function') {
            global.RAWindVisualizer.renderAll();
          }

          if (typeof global.showToast === 'function') {
            global.showToast(
              'GLOBAL WIND ATLAS (DTU/WB)',
              'V_med=' + dataGWA.vMeanRefMs + ' m/s @10m (50m=' + dataGWA.vMean50mMs + ' m/s, α=' + dataGWA.shearExponentAlpha + ', Dir=' + dataGWA.prevailingWindDirDeg + '°). Góndolas orientadas al viento.',
              'success',
              5500
            );
          }
        }
      }
    } catch (err) {
      console.warn('[RAWindUI] Error al consultar fuente meteorológica:', err);
      if (typeof global.showToast === 'function') {
        global.showToast('ERROR METEOROLÓGICO', 'No se pudo obtener datos de la fuente: ' + (err.message || 'Error de conexión'), 'error', 5000);
      }
    } finally {
      if (btn) {
        btn.innerHTML = origText;
        btn.style.opacity = '1.0';
        btn.disabled = false;
      }
      renderStep2Panel();
    }
  }

  function toggleRings3D() {
    if (global.RAWindVisualizer && typeof global.RAWindVisualizer.toggleOverlayRings === 'function') {
      global.RAWindVisualizer.toggleOverlayRings();
    }
    renderStep2Panel();
  }

  function updateVisualParam(key, value) {
    if (!global.RAWindVisualizer || typeof global.RAWindVisualizer.updateVisualConfig !== 'function') return;
    var patch = {};
    patch[key] = value;
    global.RAWindVisualizer.updateVisualConfig(patch);
    renderStep2Panel();
  }

  function renderStep2Panel() {
    var panel = document.getElementById('wp-step2-wind-panel');
    if (!panel) return;

    var turbines = Array.isArray(global.windTurbines) ? global.windTurbines : [];
    if (RAWind.Entity && typeof RAWind.Entity.recalculateAllEngineering === 'function' && turbines.length > 0) {
      RAWind.Entity.recalculateAllEngineering();
    }

    var totalKw = 0;
    turbines.forEach(function (t) {
      if (t.operationalState && t.operationalState.enabled === false) return;
      var p = (t._catalog && t._catalog.ratedPowerW) ? t._catalog.ratedPowerW : 0;
      totalKw += (p / 1000);
    });

    var resCfg = (RAWind.Resource && typeof RAWind.Resource.getConfig === 'function')
      ? RAWind.Resource.getConfig()
      : { vMeanRefMs: 5.5, roughnessLengthM: 0.10, weibullK: 2.0, receptorDistanceM: 35 };

    var parkSummary = global.windParkSummary || {
      totalAepNetKwh: 0,
      averageCapacityFactor: 0,
      equivalentHours: 0,
      parkWakeLossPercentage: 0
    };

    var ringsActive = (global.RAWindVisualizer && typeof global.RAWindVisualizer.isShowingOverlayRings === 'function')
      ? global.RAWindVisualizer.isShowingOverlayRings()
      : true;

    var html = '';

    // [AUD-2026 · E-01] Aviso visible si hay curvas rechazadas por el límite de Betz.
    if (parkSummary && parkSummary.hasInvalidCurves) {
      var _badNames = (parkSummary.invalidCurves || []).map(function(c) { return c.name || c.id; }).join(', ');
      html += '<div style="background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.5);border-radius:8px;padding:8px 10px;margin-bottom:8px;font-size:10px;color:#FCA5A5;line-height:1.4;">' +
        '<b>⚠️ Curva de potencia no válida:</b> ' + _badNames + '. El AEP de esos equipos se muestra como 0 kWh porque la curva declara más energía que la contenida en el viento (Cp &gt; 0,593).' +
        '<div style="margin-top:6px;display:flex;align-items:center;justify-content:space-between;gap:8px;">' +
        '<span style="font-size:9.5px;color:#FCA5A5;opacity:0.9;">Puedes auto-calibrar las curvas al límite físico realista (Cp ≤ 0,42) para desbloquear la producción.</span>' +
        '<button class="doc-mini-btn" onclick="if(window.RAWindUI&&typeof window.RAWindUI.autoCalibrateBetzViolations===\'function\'){window.RAWindUI.autoCalibrateBetzViolations();}" style="background:rgba(245,158,11,0.25);color:#FBBF24;border:1px solid rgba(245,158,11,0.6);font-weight:700;padding:4px 8px;font-size:10px;cursor:pointer;white-space:nowrap;">🔧 Calibrar y Desbloquear</button>' +
        '</div></div>';
    }

    // ── 1. Cabecera del Parque Mini-Eólico ─────────────────────────────
    html += '<div style="background:rgba(15,23,42,0.65);border:1px solid rgba(56,189,248,0.28);border-radius:8px;padding:10px 12px;margin-bottom:10px;">';
    html += '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">';
    html += '    <div>';
    html += '      <span style="font-size:11px;font-weight:700;color:#38BDF8;text-transform:uppercase;letter-spacing:0.5px;">💨 Parque Mini-Eólico</span>';
    var parkHoursText = parkSummary.annualOperatingHours ? (' | <b style="color:#38BDF8;">' + Number(parkSummary.annualOperatingHours).toLocaleString('es-ES') + ' h recurso/año</b>') : '';
    html += '      <div style="font-size:10px;color:var(--text-slate-400);">' + turbines.length + ' aerogenerador(es) | <b style="color:#FBBF24;">' + totalKw.toFixed(1) + ' kW</b> | <b style="color:#34D399;">' + (parkSummary.totalAepNetKwh || 0).toLocaleString('es-ES') + ' kWh/año</b>' + parkHoursText + '</div>';
    html += '    </div>';
    html += '    <button class="doc-mini-btn" onclick="if(typeof openEquipmentCatalogModal===\'function\'){openEquipmentCatalogModal(\'wind_turbines\');}" style="background:rgba(56,189,248,0.15);color:#38BDF8;border:1px solid rgba(56,189,248,0.45);font-weight:700;padding:4px 9px;font-size:10.5px;cursor:pointer;">+ Añadir Turbina</button>';
    html += '  </div>';

    // Barra rápida de recurso eólico local (Fase 2)
    html += '  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;background:rgba(2,6,23,0.45);padding:6px 8px;border-radius:6px;margin-bottom:6px;border:1px solid rgba(255,255,255,0.06);">';
    html += '    <div>';
    html += '      <label style="display:block;font-size:9px;color:var(--text-slate-400);">Viento medio (10m)</label>';
    html += '      <input type="number" step="0.1" min="1.0" max="18.0" value="' + resCfg.vMeanRefMs + '" onchange="if(window.RAWindUI)window.RAWindUI.updateResourceParam(\'vMeanRefMs\',this.value)" style="width:100%;background:#0F172A;color:#38BDF8;border:1px solid #334155;border-radius:4px;padding:2px 4px;font-size:10.5px;font-family:monospace;">';
    html += '    </div>';
    html += '    <div>';
    html += '      <label style="display:block;font-size:9px;color:var(--text-slate-400);">Rugosidad z₀</label>';
    html += '      <select onchange="if(window.RAWindUI)window.RAWindUI.updateResourceParam(\'roughnessLengthM\',this.value)" style="width:100%;background:#0F172A;color:#E2E8F0;border:1px solid #334155;border-radius:4px;padding:2px 2px;font-size:10px;">';
    html += '        <option value="0.03"' + (resCfg.roughnessLengthM <= 0.04 ? ' selected' : '') + '>Campo (0.03m)</option>';
    html += '        <option value="0.10"' + (resCfg.roughnessLengthM > 0.04 && resCfg.roughnessLengthM <= 0.20 ? ' selected' : '') + '>Periurbano (0.10m)</option>';
    html += '        <option value="0.40"' + (resCfg.roughnessLengthM > 0.20 ? ' selected' : '') + '>Urbano/Ind (0.40m)</option>';
    html += '      </select>';
    html += '    </div>';
    html += '    <div>';
    html += '      <label style="display:block;font-size:9px;color:var(--text-slate-400);">Dist. Lindero (m)</label>';
    html += '      <input type="number" step="5" min="5" max="500" value="' + resCfg.receptorDistanceM + '" onchange="if(window.RAWindUI)window.RAWindUI.updateResourceParam(\'receptorDistanceM\',this.value)" style="width:100%;background:#0F172A;color:#FBBF24;border:1px solid #334155;border-radius:4px;padding:2px 4px;font-size:10.5px;font-family:monospace;">';
    html += '    </div>';
    html += '  </div>';

    // Selector de fuente meteorológica externa y botón de adquisición
    html += '  <div style="margin-bottom:8px;background:rgba(15,23,42,0.65);border:1px solid rgba(56,189,248,0.25);border-radius:6px;padding:6px 8px;">';
    html += '    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">';
    html += '      <span style="font-size:9.5px;font-weight:700;color:#38BDF8;">🌐 FUENTE DE DATOS EÓLICOS</span>';
    html += '      <div style="display:flex;align-items:center;gap:6px;">';
    html += '        <span style="font-size:8.5px;color:#94A3B8;font-family:monospace;">' + (resCfg.sourceName || 'Manual / IDAE') + '</span>';
    html += '        <button type="button" onclick="if(window.RAWindUI)window.RAWindUI.toggleAdvancedResource()" style="background:' + (_showAdvancedResource ? 'rgba(56,189,248,0.25)' : 'rgba(255,255,255,0.06)') + ';border:1px solid ' + (_showAdvancedResource ? 'rgba(56,189,248,0.5)' : 'rgba(255,255,255,0.15)') + ';color:' + (_showAdvancedResource ? '#38BDF8' : '#CBD5E1') + ';border-radius:4px;padding:1px 6px;font-size:8.5px;font-weight:700;cursor:pointer;" title="Alternar panel de telemetría eólica avanzada">' + (_showAdvancedResource ? '▴ Resumen' : '▾ Avanzado') + '</button>';
    html += '      </div>';
    html += '    </div>';
    html += '    <div style="display:flex;gap:6px;margin-bottom:8px;">';
    html += '      <select id="wind-source-select" onchange="if(window.RAWindUI)window.RAWindUI.setWindSource(this.value)" style="flex:1;background:#0F172A;color:#E2E8F0;border:1px solid #334155;border-radius:4px;padding:3px 6px;font-size:10px;">';
    html += '        <option value="gwa"' + (_selectedWindSource === 'gwa' ? ' selected' : '') + '>🌍 Global Wind Atlas (DTU 250m WAsP)</option>';
    html += '        <option value="era5"' + (_selectedWindSource === 'era5' ? ' selected' : '') + '>🛰️ Copernicus ERA5 (8.760h Reanálisis)</option>';
    html += '        <option value="nasa"' + (_selectedWindSource === 'nasa' ? ' selected' : '') + '>🚀 NASA POWER (Satelital 10m/50m)</option>';
    html += '        <option value="manual"' + (_selectedWindSource === 'manual' ? ' selected' : '') + '>⚙️ Manual / IDAE (Local)</option>';
    html += '      </select>';
    html += '      <button type="button" id="btn-fetch-selected-wind" onclick="if(window.RAWindUI)window.RAWindUI.fetchSelectedWindSource()" style="background:rgba(56,189,248,0.15);border:1px solid rgba(56,189,248,0.45);color:#38BDF8;border-radius:4px;padding:3px 8px;font-size:10px;font-weight:700;cursor:pointer;white-space:nowrap;display:flex;align-items:center;gap:4px;">';
    html += '        <span>📥</span> <span>Obtener</span>';
    html += '      </button>';
    html += '    </div>';

    // Rosa de los Vientos polar (12 sectores) + Telemetría Climática Multi-Altura
    var prevDir = typeof resCfg.prevailingWindDirDeg === 'number' ? resCfg.prevailingWindDirDeg : 270;
    var v10 = Number(resCfg.vMeanRefMs) || 5.5;
    var alphaShear = Number(resCfg.shearExponentAlpha || 0.143);
    var v50Display = resCfg.vMean50mMs || Number((v10 * Math.pow(50.0 / 10.0, alphaShear)).toFixed(2));
    var rhoStdSite = (RAWind.Resource && typeof RAWind.Resource.calculateAirDensity === 'function')
      ? RAWind.Resource.calculateAirDensity(resCfg.siteAltitudeM || 100, resCfg.ambientTempC || 15)
      : 1.21;
    var autoYawOn = (resCfg.autoYawToWind !== false);

    var wK = Number(resCfg.weibullK || 2.0);
    var ke = Math.max(1.2, Math.min(3.5, 1.0 + 3.69 / (wK * wK)));
    var wpd10 = Math.round(ke * 0.5 * rhoStdSite * Math.pow(v10, 3));
    var wpd50 = Math.round(ke * 0.5 * rhoStdSite * Math.pow(v50Display, 3));
    var iecClass = (v50Display >= 8.5) ? 'Clase I' : (v50Display >= 7.5 ? 'Clase II' : (v50Display >= 6.0 ? 'Clase III' : 'Clase IV'));

    html += '    <div style="display:flex;align-items:center;gap:10px;background:rgba(2,6,23,0.55);border:1px solid rgba(255,255,255,0.07);border-radius:6px;padding:7px 8px;">';
    html += '      ' + _buildWindRoseSVG(resCfg.sectors, prevDir);
    html += '      <div style="flex:1;display:flex;flex-direction:column;gap:3px;font-size:9.5px;color:#CBD5E1;">';
    html += '        <div style="display:flex;justify-content:space-between;"><span>Rumbo Dominante:</span><b style="color:#FBBF24;font-family:monospace;">' + prevDir + '° (' + _getYawCardinal(prevDir) + ')</b></div>';
    html += '        <div style="display:flex;justify-content:space-between;"><span>V<sub>10m</sub> / V<sub>50m</sub>:</span><b style="color:#38BDF8;font-family:monospace;">' + Number(v10).toFixed(2) + ' / ' + Number(v50Display).toFixed(2) + ' m/s</b></div>';
    html += '        <div style="display:flex;justify-content:space-between;"><span>Weibull k / Cizalla α:</span><b style="color:#E2E8F0;font-family:monospace;">k=' + Number(wK).toFixed(2) + ' · α=' + Number(alphaShear).toFixed(3) + '</b></div>';
    if (_resourceActiveMetrics.wpd) {
      html += '        <div style="display:flex;justify-content:space-between;"><span>Potencia Viento:</span><b style="color:#F59E0B;font-family:monospace;">' + wpd10 + ' W/m² (10m)</b></div>';
    }
    html += '        <div style="display:flex;justify-content:space-between;"><span>Densidad ρ / Temp.:</span><b style="color:#34D399;font-family:monospace;">' + rhoStdSite + ' kg/m³ · ' + Number(resCfg.ambientTempC || 15).toFixed(1) + '°C</b></div>';
        if (parkSummary && parkSummary.annualOperatingHours) {
          html += '        <div style="display:flex;justify-content:space-between;"><span>Horas Viento Útil:</span><b style="color:#38BDF8;font-family:monospace;">' + Number(parkSummary.annualOperatingHours).toLocaleString('es-ES') + ' h/año (v ≥ v_arranque)</b></div>';
        }
    html += '        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:2px;padding-top:3px;border-top:1px dashed rgba(255,255,255,0.08);">';
    html += '          <label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:9px;color:#94A3B8;" title="Orientar automáticamente las turbinas nuevas y existentes al viento predominante">';
    html += '            <input type="checkbox" ' + (autoYawOn ? 'checked' : '') + ' onchange="if(window.RAWindUI)window.RAWindUI.toggleAutoYaw(this.checked)" style="accent-color:#FBBF24;"> Auto-Yaw';
    html += '          </label>';
    html += '          <button type="button" onclick="if(window.RAWindUI)window.RAWindUI.orientAllToWindNow()" style="background:rgba(245,158,11,0.16);border:1px solid rgba(245,158,11,0.45);color:#FBBF24;border-radius:4px;padding:1px 6px;font-size:8.5px;font-weight:700;cursor:pointer;" title="Girar ahora todas las góndolas hacia ' + prevDir + '°">🧭 Alinear (' + prevDir + '°)</button>';
    html += '        </div>';
    html += '      </div>';
    html += '    </div>';

    // Panel Desplegable de Telemetría Avanzada
    if (_showAdvancedResource) {
      var v20 = Number((v10 * Math.pow(20.0 / 10.0, alphaShear)).toFixed(2));
      var v30 = Number((v10 * Math.pow(30.0 / 10.0, alphaShear)).toFixed(2));
      var v100 = Number((v10 * Math.pow(100.0 / 10.0, alphaShear)).toFixed(2));
      var sortedSectors = (Array.isArray(resCfg.sectors) ? resCfg.sectors.slice() : []).sort(function(a, b) { return (b.freq || 0) - (a.freq || 0); }).slice(0, 3);

      html += '    <div style="margin-top:6px;padding-top:6px;border-top:1px dashed rgba(56,189,248,0.25);display:flex;flex-direction:column;gap:5px;">';
      html += '      <div style="display:flex;justify-content:space-between;align-items:center;">';
      html += '        <span style="font-size:8.5px;font-weight:700;color:#94A3B8;text-transform:uppercase;">Seleccionar Métricas:</span>';
      html += '        <div style="display:flex;gap:3px;">';
      html += '          <button type="button" onclick="if(window.RAWindUI)window.RAWindUI.toggleResourceMetric(\'wpd\')" style="background:' + (_resourceActiveMetrics.wpd ? 'rgba(245,158,11,0.22)' : 'rgba(255,255,255,0.04)') + ';border:1px solid ' + (_resourceActiveMetrics.wpd ? 'rgba(245,158,11,0.5)' : 'rgba(255,255,255,0.1)') + ';color:' + (_resourceActiveMetrics.wpd ? '#FBBF24' : '#64748B') + ';border-radius:3px;padding:1px 5px;font-size:8px;font-weight:700;cursor:pointer;" title="Conmutar densidad de potencia">⚡ Potencia</button>';
      html += '          <button type="button" onclick="if(window.RAWindUI)window.RAWindUI.toggleResourceMetric(\'profile\')" style="background:' + (_resourceActiveMetrics.profile ? 'rgba(56,189,248,0.22)' : 'rgba(255,255,255,0.04)') + ';border:1px solid ' + (_resourceActiveMetrics.profile ? 'rgba(56,189,248,0.5)' : 'rgba(255,255,255,0.1)') + ';color:' + (_resourceActiveMetrics.profile ? '#38BDF8' : '#64748B') + ';border-radius:3px;padding:1px 5px;font-size:8px;font-weight:700;cursor:pointer;" title="Conmutar perfil vertical">📈 Alturas</button>';
      html += '          <button type="button" onclick="if(window.RAWindUI)window.RAWindUI.toggleResourceMetric(\'sectors\')" style="background:' + (_resourceActiveMetrics.sectors ? 'rgba(52,211,153,0.22)' : 'rgba(255,255,255,0.04)') + ';border:1px solid ' + (_resourceActiveMetrics.sectors ? 'rgba(52,211,153,0.5)' : 'rgba(255,255,255,0.1)') + ';color:' + (_resourceActiveMetrics.sectors ? '#34D399' : '#64748B') + ';border-radius:3px;padding:1px 5px;font-size:8px;font-weight:700;cursor:pointer;" title="Conmutar top sectores">🧭 Sectores</button>';
      html += '        </div>';
      html += '      </div>';

      if (_resourceActiveMetrics.wpd) {
        html += '      <div style="background:rgba(15,23,42,0.8);border:1px solid rgba(245,158,11,0.25);border-radius:4px;padding:5px 6px;font-size:9px;">';
        html += '        <div style="display:flex;justify-content:space-between;margin-bottom:2px;">';
        html += '          <span style="color:#CBD5E1;">⚡ Densidad Potencia (WPD):</span>';
        html += '          <b style="color:#FBBF24;font-family:monospace;">' + wpd10 + ' W/m² (10m) · ' + wpd50 + ' W/m² (50m)</b>';
        html += '        </div>';
        html += '        <div style="display:flex;justify-content:space-between;">';
        html += '          <span style="color:#94A3B8;">Clasificación IEC 61400:</span>';
        html += '          <b style="color:#E2E8F0;">' + iecClass + '</b>';
        html += '        </div>';
        html += '      </div>';
      }

      if (_resourceActiveMetrics.profile) {
        html += '      <div style="background:rgba(15,23,42,0.8);border:1px solid rgba(56,189,248,0.25);border-radius:4px;padding:5px 6px;font-size:9px;">';
        html += '        <div style="color:#38BDF8;font-weight:700;margin-bottom:3px;font-size:8.5px;">📈 PERFIL VERTICAL DE VIENTO (CAPA LÍMITE)</div>';
        html += '        <div style="display:grid;grid-template-columns:repeat(5, 1fr);gap:4px;text-align:center;font-family:monospace;font-size:8.5px;">';
        html += '          <div style="background:rgba(2,6,23,0.5);padding:2px;border-radius:3px;"><div style="color:#94A3B8;">10m</div><b style="color:#E2E8F0;">' + v10 + '</b></div>';
        html += '          <div style="background:rgba(2,6,23,0.5);padding:2px;border-radius:3px;"><div style="color:#94A3B8;">20m</div><b style="color:#E2E8F0;">' + v20 + '</b></div>';
        html += '          <div style="background:rgba(2,6,23,0.5);padding:2px;border-radius:3px;"><div style="color:#94A3B8;">30m</div><b style="color:#E2E8F0;">' + v30 + '</b></div>';
        html += '          <div style="background:rgba(2,6,23,0.5);padding:2px;border-radius:3px;"><div style="color:#38BDF8;">50m</div><b style="color:#38BDF8;">' + v50Display + '</b></div>';
        html += '          <div style="background:rgba(2,6,23,0.5);padding:2px;border-radius:3px;"><div style="color:#94A3B8;">100m</div><b style="color:#E2E8F0;">' + v100 + '</b></div>';
        html += '        </div>';
        html += '      </div>';
      }

      if (_resourceActiveMetrics.sectors && sortedSectors.length > 0) {
        html += '      <div style="background:rgba(15,23,42,0.8);border:1px solid rgba(52,211,153,0.25);border-radius:4px;padding:5px 6px;font-size:9px;">';
        html += '        <div style="color:#34D399;font-weight:700;margin-bottom:2px;font-size:8.5px;">🧭 TOP SECTORES DOMINANTES</div>';
        html += '        <div style="display:flex;justify-content:space-between;font-size:8.5px;font-family:monospace;">';
        sortedSectors.forEach(function(sec, sIdx) {
          var pct = ((sec.freq || 0) * 100).toFixed(1);
          html += '          <span>#' + (sIdx + 1) + ' <b style="color:#FBBF24;">' + (sec.label || sec.dirDeg + '°') + '</b>: ' + pct + '%</span>';
        });
        html += '        </div>';
        html += '      </div>';
      }
      html += '    </div>';
    }
    html += '  </div>';

    if (turbines.length === 0) {
      html += '<div style="padding:14px;text-align:center;color:var(--text-slate-400);font-size:11px;border:1px dashed rgba(255,255,255,0.1);border-radius:6px;">';
      html += '  No hay aerogeneradores en la escena.<br>';
      html += '  <span style="font-size:10px;color:var(--text-slate-500);">Abre el catálogo para elegir un modelo (Bornay, Enair, Kliux) e instalarlo con un clic.</span>';
      html += '</div>';
      html += '</div>';
      panel.innerHTML = html;
      return;
    }

    // Comprobar si hay una turbina activa seleccionada para inspección
    var activeTurbine = null;
    if (_selectedTurbineIdForInspect) {
      activeTurbine = turbines.find(function (t) { return t.id === _selectedTurbineIdForInspect; }) || null;
      if (!activeTurbine) {
        _selectedTurbineIdForInspect = null;
      }
    }

    // ── 2. Lista de Aerogeneradores con Controles Rápidos ──────────────
    var visualCfg = (global.RAWindVisualizer && typeof global.RAWindVisualizer.getVisualConfig === 'function')
      ? global.RAWindVisualizer.getVisualConfig()
      : { style: 'neon', showFallRadius: true, showIso45Day: true, showIso35Night: true, opacity: 0.65 };

    html += '<div style="background:rgba(15,23,42,0.75);border:1px solid rgba(56,189,248,0.25);border-radius:6px;padding:8px;margin-bottom:8px;">';
    html += '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">';
    html += '    <span style="font-size:10px;font-weight:700;color:#38BDF8;">✨ VISOR 3D: AFECCIONES & ISÓFONAS</span>';
    html += '    <button onclick="if(window.RAWindUI)window.RAWindUI.toggleRings3D()" style="background:none;border:1px solid ' + (ringsActive ? 'rgba(56,189,248,0.5)' : 'rgba(148,163,184,0.25)') + ';color:' + (ringsActive ? '#38BDF8' : '#94A3B8') + ';border-radius:4px;padding:1px 6px;font-size:9.5px;cursor:pointer;">' + (ringsActive ? '◉ Anillos: ON' : '○ Anillos: OFF') + '</button>';
    html += '  </div>';

    if (ringsActive) {
    html += '  <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;">';
      html += '    <div>';
      html += '      <label style="display:block;font-size:8.5px;color:var(--text-slate-400);">Estilo Visual</label>';
      html += '      <select onchange="if(window.RAWindUI)window.RAWindUI.updateVisualParam(\'style\', this.value)" style="width:100%;background:#0F172A;color:#38BDF8;border:1px solid #334155;border-radius:4px;padding:2px 4px;font-size:9.5px;">';
      html += '        <option value="neon"' + (visualCfg.style === 'neon' ? ' selected' : '') + '>⚡ Neón Brillante</option>';
      html += '        <option value="pulse"' + (visualCfg.style === 'pulse' ? ' selected' : '') + '>📡 Pulso Radar</option>';
      html += '        <option value="dome"' + (visualCfg.style === 'dome' ? ' selected' : '') + '>🌐 Cúpula Holográfica</option>';
      html += '        <option value="cad"' + (visualCfg.style === 'cad' ? ' selected' : '') + '>📐 Línea CAD</option>';
      html += '      </select>';
      html += '    </div>';
      html += '    <div>';
      html += '      <label style="display:block;font-size:8.5px;color:var(--text-slate-400);">Brillo / Opacidad: ' + Math.round((visualCfg.opacity || 0.65) * 100) + '%</label>';
      html += '      <input type="range" min="0.1" max="1.0" step="0.05" value="' + (visualCfg.opacity || 0.65) + '" oninput="if(window.RAWindUI)window.RAWindUI.updateVisualParam(\'opacity\', parseFloat(this.value))" style="width:100%;height:14px;accent-color:#38BDF8;cursor:pointer;">';
      html += '    </div>';
      html += '  </div>';

      html += '  <div style="display:flex;flex-wrap:wrap;gap:8px;font-size:9px;color:var(--text-slate-300);padding-top:4px;border-top:1px dashed rgba(255,255,255,0.08);">';
      html += '    <label style="display:flex;align-items:center;gap:3px;cursor:pointer;">';
      html += '      <input type="checkbox" ' + (visualCfg.showFallRadius ? 'checked' : '') + ' onchange="if(window.RAWindUI)window.RAWindUI.updateVisualParam(\'showFallRadius\', this.checked)" style="accent-color:#00E5FF;">';
      html += '      <span style="color:#00E5FF;">●</span> Caída (1.1×H)';
      html += '    </label>';
      html += '    <label style="display:flex;align-items:center;gap:3px;cursor:pointer;">';
      html += '      <input type="checkbox" ' + (visualCfg.showIso45Day ? 'checked' : '') + ' onchange="if(window.RAWindUI)window.RAWindUI.updateVisualParam(\'showIso45Day\', this.checked)" style="accent-color:#FF9100;">';
      html += '      <span style="color:#FF9100;">●</span> 45 dBA (Día)';
      html += '    </label>';
      html += '    <label style="display:flex;align-items:center;gap:3px;cursor:pointer;">';
      html += '      <input type="checkbox" ' + (visualCfg.showIso35Night ? 'checked' : '') + ' onchange="if(window.RAWindUI)window.RAWindUI.updateVisualParam(\'showIso35Night\', this.checked)" style="accent-color:#F43F5E;">';
      html += '      <span style="color:#F43F5E;">●</span> 35 dBA (Noche)';
      html += '    </label>';
      html += '    <label style="display:flex;align-items:center;gap:3px;cursor:pointer;" title="Mostrar vector de viento dominante y cono 3D de estela turbulenta de Jensen (5D)">';
      html += '      <input type="checkbox" ' + (visualCfg.showWakeCone !== false ? 'checked' : '') + ' onchange="if(window.RAWindUI)window.RAWindUI.updateVisualParam(\'showWakeCone\', this.checked)" style="accent-color:#10B981;">';
      html += '      <span style="color:#10B981;">▲</span> Estela Jensen + Viento 3D';
      html += '    </label>';
      html += '  </div>';
    }
    html += '</div>';

    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">';
    html += '  <span style="font-size:9.5px;color:var(--text-slate-400);text-transform:uppercase;">Unidades instaladas (clic para inspeccionar)</span>';
    html += '</div>';

    html += '<div style="display:flex;flex-direction:column;gap:5px;max-height:190px;overflow-y:auto;margin-bottom:8px;">';
    turbines.forEach(function (t, idx) {
      var cat = t._catalog || {};
      var kw = (cat.ratedPowerW ? (cat.ratedPowerW / 1000).toFixed(1) : '?');
      var hubH = t.supportStructure ? t.supportStructure.hubHeightM : 18;
      var isEnabled = t.operationalState ? t.operationalState.enabled !== false : true;
      var isSel = (activeTurbine && t.id === activeTurbine.id);
      var aepKwh = (t.simulationResults && t.simulationResults.aepNetKwh) ? t.simulationResults.aepNetKwh : 0;

      html += '<div onclick="if(window.RAWindUI)window.RAWindUI.selectTurbineForInspect(\'' + t.id + '\')" style="display:flex;align-items:center;justify-content:space-between;background:' + (isSel ? 'rgba(56,189,248,0.14)' : 'rgba(30,41,59,0.7)') + ';padding:6px 8px;border-radius:6px;cursor:pointer;border:1px solid ' + (isSel ? '#38BDF8' : (isEnabled ? 'rgba(255,255,255,0.08)' : 'rgba(239,68,68,0.3)')) + ';">';
      html += '  <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:155px;">';
      html += '    <div style="font-weight:600;font-size:10.5px;color:#fff;">' + (t.name || ('Turbina #' + (idx + 1))) + '</div>';
      html += '    <div style="font-size:9.5px;color:var(--text-slate-400);">' + kw + ' kW · ' + cat.type + ' · H=' + hubH + 'm · <span style="color:#34D399;">' + aepKwh.toLocaleString('es-ES') + ' kWh/a</span></div>';
      html += '  </div>';
      html += '  <div style="display:flex;gap:3px;align-items:center;" onclick="event.stopPropagation();">';
      html += '    <button title="' + (isEnabled ? 'Desactivar' : 'Activar') + '" onclick="if(window.RAWind && window.RAWind.Entity){window.RAWind.Entity.updateProp(\'' + t.id + '\',\'enabled\',' + !isEnabled + ');}" style="background:none;border:none;color:' + (isEnabled ? '#10B981' : '#64748B') + ';cursor:pointer;font-size:11px;">' + (isEnabled ? '⚡' : '⚪') + '</button>';
      html += '    <button title="Centrar cámara" onclick="if(window.RAWindUI){window.RAWindUI.focusTurbine(\'' + t.id + '\');}" style="background:none;border:none;color:#38BDF8;cursor:pointer;font-size:11px;">🔍</button>';
      html += '    <button title="Eliminar" onclick="if(confirm(\'¿Eliminar aerogenerador?\')){if(window.RAWind && window.RAWind.Entity)window.RAWind.Entity.removeFromScene(\'' + t.id + '\');}" style="background:none;border:none;color:#EF4444;cursor:pointer;font-size:11px;">🗑</button>';
      html += '  </div>';
      html += '</div>';
    });
    html += '</div>';

    // ── 3. Inspector y Diagnóstico de Ingeniería Fase 2 de la Turbina Activa ──
    if (activeTurbine) {
      var actCat = activeTurbine._catalog || {};
    var availHeights = Array.isArray(actCat.hubHeightsAvailableM) && actCat.hubHeightsAvailableM.length > 0
      ? actCat.hubHeightsAvailableM
      : [6, 9, 12, 18, 24, 30];
    var actHubH = (activeTurbine.supportStructure && activeTurbine.supportStructure.hubHeightM) || 18;
    var actMount = activeTurbine.mountingType || 'ground';
    var actSim = activeTurbine.simulationResults || {};
    var actRoof = actSim.rooftopContext || { isRooftop: false, speedupFactor: 1.0, insideSeparationBubble: false };
    var actAcoustics = (RAWind.Acoustics && typeof RAWind.Acoustics.evaluateComplianceRD1367 === 'function')
      ? RAWind.Acoustics.evaluateComplianceRD1367(turbines, resCfg.receptorDistanceM)
      : null;
    var actStruct = activeTurbine._structuralReport || (RAWind.Structural ? RAWind.Structural.evaluateStructuralSafety(activeTurbine) : null);
    var actElec = activeTurbine._electricalReport || (RAWind.Electrical ? RAWind.Electrical.evaluateTurbineElectrical(activeTurbine) : null);

    // Selectores de Altura de Mástil, Tipo de Montaje y Orientación (Guiñada / Yaw)
    var yawDeg = Math.round(((activeTurbine.orientationRad || 0) * 180.0 / Math.PI) % 360);
    if (yawDeg < 0) yawDeg += 360;

    html += '<div style="background:rgba(2,6,23,0.55);border:1px solid rgba(56,189,248,0.22);border-radius:6px;padding:8px;margin-bottom:8px;">';
    html += '  <div style="font-size:10px;font-weight:700;color:#38BDF8;margin-bottom:6px;">⚙️ CONFIGURACIÓN: ' + activeTurbine.name + '</div>';
    html += '  <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;">';
    html += '    <div>';
    html += '      <label style="display:block;font-size:9px;color:var(--text-slate-400);">Altura de Buje (Mástil)</label>';
    html += '      <select onchange="if(window.RAWind && window.RAWind.Entity)window.RAWind.Entity.updateProp(\'' + activeTurbine.id + '\',\'hubHeightM\',Number(this.value))" style="width:100%;background:#0F172A;color:#fff;border:1px solid #334155;border-radius:4px;padding:3px 4px;font-size:10px;">';
    availHeights.forEach(function (h) {
      html += '        <option value="' + h + '"' + (Number(h) === Number(actHubH) ? ' selected' : '') + '>' + h + ' m</option>';
    });
    html += '      </select>';
    html += '    </div>';
    html += '    <div>';
    html += '      <label style="display:block;font-size:9px;color:var(--text-slate-400);">Cimentación / Apoyo</label>';
    html += '      <select onchange="if(window.RAWind && window.RAWind.Entity)window.RAWind.Entity.updateProp(\'' + activeTurbine.id + '\',\'mountingType\',this.value)" style="width:100%;background:#0F172A;color:#fff;border:1px solid #334155;border-radius:4px;padding:3px 4px;font-size:10px;">';
    html += '        <option value="ground"' + (actMount === 'ground' ? ' selected' : '') + '>⛰️ Suelo (Zapata HA-25)</option>';
    html += '        <option value="rooftop"' + (actMount === 'rooftop' ? ' selected' : '') + '>🏢 Cubierta (Bancada)</option>';
    html += '      </select>';
    html += '    </div>';
    html += '  </div>';

    // Controles de geometría interactiva de aerogenerador (VAWT / HAWT)
    var isVawt = (actCat.type === 'VAWT') || (activeTurbine.turbineType === 'vawt');
    var actRotorD = (typeof activeTurbine.rotorDiameterM === 'number' && activeTurbine.rotorDiameterM > 0)
      ? activeTurbine.rotorDiameterM
      : (actCat.rotorDiameterM || (isVawt ? 3.8 : 5.0));
    var actBladeL = (typeof activeTurbine.bladeLength === 'number' && activeTurbine.bladeLength > 0)
      ? activeTurbine.bladeLength
      : (actCat.bladeLength || (isVawt ? Math.round(actHubH * 0.55 * 10) / 10 : Math.round(actRotorD * 0.48 * 10) / 10));

    html += '  <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;background:rgba(56,189,248,0.08);padding:6px;border-radius:4px;border:1px dashed rgba(56,189,248,0.25);">';
    html += '    <div>';
    html += '      <label style="display:block;font-size:9px;color:#38BDF8;font-weight:600;">' + (isVawt ? 'Diámetro Rotor VAWT' : 'Diámetro Rotor') + '</label>';
    html += '      <div style="display:flex;align-items:center;gap:4px;">';
    html += '        <input type="number" min="0.5" max="30" step="0.1" value="' + actRotorD + '" onchange="if(window.RAWind && window.RAWind.Entity){ window.RAWind.Entity.updateProp(\'' + activeTurbine.id + '\',\'rotorDiameterM\',Number(this.value)); if(window.RAWindVisualizer){ window.RAWindVisualizer.renderAll(); } }" style="width:100%;background:#0F172A;color:#38BDF8;border:1px solid #0284C7;border-radius:4px;padding:3px 4px;font-size:10px;font-weight:700;">';
    html += '        <span style="font-size:9px;color:var(--text-slate-400);">m</span>';
    html += '      </div>';
    html += '    </div>';
    html += '    <div>';
    html += '      <label style="display:block;font-size:9px;color:#38BDF8;font-weight:600;">' + (isVawt ? 'Longitud Palas VAWT' : 'Longitud Pala') + '</label>';
    html += '      <div style="display:flex;align-items:center;gap:4px;">';
    html += '        <input type="number" min="0.5" max="30" step="0.1" value="' + actBladeL + '" onchange="if(window.RAWind && window.RAWind.Entity){ window.RAWind.Entity.updateProp(\'' + activeTurbine.id + '\',\'bladeLength\',Number(this.value)); if(window.RAWindVisualizer){ window.RAWindVisualizer.renderAll(); } }" style="width:100%;background:#0F172A;color:#38BDF8;border:1px solid #0284C7;border-radius:4px;padding:3px 4px;font-size:10px;font-weight:700;">';
    html += '        <span style="font-size:9px;color:var(--text-slate-400);">m</span>';
    html += '      </div>';
    html += '    </div>';
    html += '  </div>';

    html += '  <div style="border-top:1px dashed rgba(255,255,255,0.08);padding-top:6px;">';
    html += '    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">';
    html += '      <label style="font-size:9px;color:var(--text-slate-400);">Orientación Góndola (Guiñada / Yaw):</label>';
    html += '      <span id="wt-yaw-label" style="font-size:9.5px;font-weight:700;color:#FBBF24;font-family:monospace;">' + yawDeg + '° (' + _getYawCardinal(yawDeg) + ')</span>';
    html += '    </div>';
    html += '    <input type="range" min="0" max="359" step="5" value="' + yawDeg + '" oninput="document.getElementById(\'wt-yaw-label\').textContent = this.value + \'° (\' + (window.RAWindUI ? window.RAWindUI.getYawCardinal(this.value) : \'\') + \')\'; if(window.RAWind && window.RAWind.Entity){ window.RAWind.Entity.updateProp(\'' + activeTurbine.id + '\', \'orientationRad\', (Number(this.value) * Math.PI / 180.0)); if(window.RAWindVisualizer){ window.RAWindVisualizer.updateLiveModelMatrix(window.RAWind.Entity.getById(\'' + activeTurbine.id + '\')); } }" style="width:100%;height:14px;accent-color:#FBBF24;cursor:pointer;">';
    html += '  </div>';
    html += '</div>';

    // Tarjeta 1.5: Interferencia 3D con Obstáculos y Entorno (Árboles, Chimeneas, Muros)
    var obsEvalNow = (RAWind.ObstacleInterference && typeof RAWind.ObstacleInterference.evaluateTurbineObstacleInterference === 'function')
      ? RAWind.ObstacleInterference.evaluateTurbineObstacleInterference(activeTurbine, (resCfg && resCfg.prevailingWindDirDeg) || 270)
      : null;

    if (obsEvalNow) {
      var obColor = obsEvalNow.hasSevereInterference ? '#EF4444' : (obsEvalNow.hasModerateInterference ? '#F59E0B' : '#10B981');
      var obBadge = obsEvalNow.hasSevereInterference ? 'SOMBRA SEVERA' : (obsEvalNow.hasModerateInterference ? 'ESTELA TURBULENTA' : 'FLUJO DESPEJADO');
      var critName = obsEvalNow.criticalObstacle ? (obsEvalNow.criticalObstacle.name || 'Obstáculo próximo') : 'Ninguno';

      html += '<div style="background:rgba(15,23,42,0.8);border-left:3px solid ' + obColor + ';border-radius:4px;padding:7px 9px;margin-bottom:6px;font-size:10px;">';
      html += '  <div style="display:flex;justify-content:space-between;font-weight:700;color:' + obColor + ';margin-bottom:3px;">';
      html += '    <span>🌪️ INTERFERENCIA 3D ENTORNO</span>';
      html += '    <span>' + obBadge + '</span>';
      html += '  </div>';
      html += '  <div style="color:var(--text-slate-300);line-height:1.4;">';
      if (obsEvalNow.hasInterference) {
        html += '    Obstáculo crítico: <b style="color:#fff;">' + critName + '</b> | Pérdida velocidad: <b style="color:' + obColor + ';">-' + obsEvalNow.maxVelocityDeficitPct + '%</b><br>';
        html += '    Turbulencia inducida: <b>+' + (obsEvalNow.addedTurbulence * 100).toFixed(0) + '%</b> · V_efectiva: <b>' + (obsEvalNow.effectiveSpeedFactor * 100).toFixed(0) + '%</b>';
      } else {
        html += '    Sin obstáculos aguas arriba en el cono de incidencia. Flujo libre 100%.';
      }
      html += '  </div>';
      html += '</div>';
    }


    // Tarjeta 1: Producción AEP, Weibull, Estelas de Jensen y CFD Cubierta
    html += '<div style="background:rgba(15,23,42,0.8);border-left:3px solid #38BDF8;border-radius:4px;padding:7px 9px;margin-bottom:6px;font-size:10px;">';
    var operHours = actSim.operatingHoursPerYear || Math.round(8760 * ((actSim.operatingAvailabilityPct || 85.0) / 100));
    html += '  <div style="display:flex;justify-content:space-between;font-weight:700;color:#7DD3FC;margin-bottom:3px;">';
    html += '    <span>🌬️ RECURSO WEIBULL & ESTELAS JENSEN</span>';
    html += '    <span>FC: ' + (((actSim.capacityFactor || 0) * 100).toFixed(1)) + '% (' + (actSim.equivalentFullLoadHours || 0) + ' h equiv.)</span>';
    html += '  </div>';
    html += '  <div style="display:flex;justify-content:space-between;background:rgba(2,6,23,0.45);border-radius:3px;padding:2px 4px;margin-bottom:3px;font-size:9.5px;"><span>Horas Recurso Útil (anual):</span><b style="color:#38BDF8;font-family:monospace;">' + Number(operHours).toLocaleString('es-ES') + ' h/año (' + (actSim.operatingAvailabilityPct || ((operHours / 8760) * 100).toFixed(1)) + '%)</b></div>';
    html += '  <div style="color:var(--text-slate-300);line-height:1.4;">';
    html += '    V<sub>buje</sub>: <b>' + (actSim.hubWindSpeedMeanMs || 0) + ' m/s</b> (ρ=' + (actSim.airDensityKgM3 || 1.22) + ' kg/m³) · Pérdida estela: <b>' + (actSim.wakeLossPercentage || 0) + '%</b>';
    if (actMount === 'rooftop' && actRoof) {
      var bubbleColor = actRoof.insideSeparationBubble ? '#EF4444' : '#10B981';
      var bubbleMsg = actRoof.insideSeparationBubble
        ? ('⚠️ Dentro de burbuja turbulenta (H_vórtice=' + actRoof.bubbleHeightAtX + 'm). Sube mástil a ≥' + actRoof.minRecommendedHubHeightM + 'm.')
        : ('✓ Sobre burbuja (Speed-up ×' + actRoof.speedupFactor + ', ganancia ' + (actSim.rooftopSpeedupGainPercentage >= 0 ? '+' : '') + actSim.rooftopSpeedupGainPercentage + '%).');
      html += '<br><span style="color:' + bubbleColor + ';">' + bubbleMsg + '</span>';
    }
    html += '  </div>';
    html += '</div>';

    // Tarjeta 1B: Optimizador de Ingeniería (Altura Óptima de Mástil & Espaciado Anti-Estelas 5D×3D)
    if (RAWind.Resource && typeof RAWind.Resource.recommendOptimalMastAndSpacing === 'function') {
      var optRec = RAWind.Resource.recommendOptimalMastAndSpacing(activeTurbine, turbines, resCfg);
      if (optRec) {
        var needsUpgrade = optRec.recommendedHeightM !== optRec.currentHeightM && optRec.potentialGainPct > 1.0;
        var optBorder = needsUpgrade ? '#F59E0B' : '#10B981';
        html += '<div style="background:rgba(15,23,42,0.82);border-left:3px solid ' + optBorder + ';border-radius:4px;padding:7px 9px;margin-bottom:6px;font-size:10px;">';
        html += '  <div style="display:flex;justify-content:space-between;align-items:center;font-weight:700;color:' + (needsUpgrade ? '#FBBF24' : '#34D399') + ';margin-bottom:4px;">';
        html += '    <span>🎯 OPTIMIZADOR DE MÁSTIL & LAYOUT (5D×3D)</span>';
        if (needsUpgrade) {
          html += '    <button type="button" onclick="if(window.RAWind && window.RAWind.Entity){window.RAWind.Entity.updateProp(\'' + activeTurbine.id + '\',\'hubHeightM\',' + optRec.recommendedHeightM + ');}" style="background:rgba(245,158,11,0.2);border:1px solid #F59E0B;color:#FBBF24;border-radius:4px;padding:1px 6px;font-size:8.5px;font-weight:800;cursor:pointer;">⚡ Subir a ' + optRec.recommendedHeightM + 'm (+' + optRec.potentialGainPct + '%)</button>';
        } else {
          html += '    <span>ÓPTIMO (' + optRec.currentHeightM + 'm)</span>';
        }
        html += '  </div>';
        html += '  <div style="color:var(--text-slate-300);line-height:1.4;">';
        // Mini-tabla comparativa de alturas de mástil
        html += '    <div style="display:flex;gap:4px;overflow-x:auto;padding-bottom:3px;margin-bottom:3px;">';
        optRec.evaluations.forEach(function (ev) {
          var isCur = (ev.heightM === optRec.currentHeightM);
          var isRec = (ev.heightM === optRec.recommendedHeightM);
          var bgCell = isRec ? 'rgba(16,185,129,0.16)' : (isCur ? 'rgba(56,189,248,0.15)' : 'rgba(2,6,23,0.45)');
          var bdCell = isRec ? '#10B981' : (isCur ? '#38BDF8' : 'rgba(255,255,255,0.08)');
          html += '      <div onclick="if(window.RAWind && window.RAWind.Entity){window.RAWind.Entity.updateProp(\'' + activeTurbine.id + '\',\'hubHeightM\',' + ev.heightM + ');}" style="flex:1;min-width:52px;background:' + bgCell + ';border:1px solid ' + bdCell + ';border-radius:4px;padding:3px 4px;text-align:center;cursor:pointer;" title="Clic para aplicar mástil de ' + ev.heightM + ' m">';
          html += '        <div style="font-weight:800;font-size:9px;color:' + (isRec ? '#34D399' : '#E2E8F0') + ';">' + ev.heightM + 'm' + (isRec ? ' ★' : '') + '</div>';
          html += '        <div style="font-size:8.5px;color:#38BDF8;font-family:monospace;">' + ev.vHubMs + ' m/s</div>';
          html += '        <div style="font-size:8px;color:#94A3B8;">' + ev.aepNetKwh.toLocaleString('es-ES') + ' kWh</div>';
          html += '      </div>';
        });
        html += '    </div>';
        html += '    <div style="font-size:9px;color:#94A3B8;">📏 Regla anti-estela IEC (' + optRec.spacingRule.prevailingDirDeg + '°): separar <b>≥' + optRec.spacingRule.downwindSpacingM + ' m (5D)</b> a sotavento y <b>≥' + optRec.spacingRule.crosswindSpacingM + ' m (3D)</b> transversal.</div>';
        html += '  </div>';
        html += '</div>';
      }
    }

    // Tarjeta 2: Acústica ISO 9613-2 & RD 1367/2007
    if (actAcoustics) {
      var acColor = actAcoustics.compliesNight ? '#10B981' : (actAcoustics.compliesDay ? '#F59E0B' : '#EF4444');
      var acBadge = actAcoustics.compliesNight ? 'CUMPLE DÍA/NOCHE' : (actAcoustics.compliesDay ? 'EXCEDE NOCHE (>35 dBA)' : 'EXCEDE LÍMITE (>45 dBA)');
      var curtailed = !!(activeTurbine.operationalState && activeTurbine.operationalState.curtailmentRulesActive);
      html += '<div style="background:rgba(15,23,42,0.8);border-left:3px solid ' + acColor + ';border-radius:4px;padding:7px 9px;margin-bottom:6px;font-size:10px;">';
      html += '  <div style="display:flex;justify-content:space-between;font-weight:700;color:' + acColor + ';margin-bottom:3px;">';
      html += '    <span>🔊 ACÚSTICA ISO 9613-2 (RD 1367/2007)</span>';
      html += '    <span>' + acBadge + '</span>';
      html += '  </div>';
      html += '  <div style="color:var(--text-slate-300);line-height:1.4;">';
      html += '    Nivel en lindero (' + actAcoustics.receptorDistanceM + 'm): <b>' + actAcoustics.combinedLpDba + ' dB(A)</b> · Radio 45/35 dBA: <b>' + (activeTurbine._acousticAudit ? activeTurbine._acousticAudit.radiusDay45M : '?') + 'm / ' + (activeTurbine._acousticAudit ? activeTurbine._acousticAudit.radiusNight35M : '?') + 'm</b>';
      html += '    <div style="margin-top:3px;"><label style="cursor:pointer;color:#94A3B8;"><input type="checkbox" ' + (curtailed ? 'checked' : '') + ' onchange="if(window.RAWind && window.RAWind.Entity)window.RAWind.Entity.updateProp(\'' + activeTurbine.id + '\',\'curtailmentRulesActive\',this.checked)" style="vertical-align:middle;margin-right:4px;">Activar modo nocturno silencioso (-3.5 dBA en 23:00-07:00)</label></div>';
      html += '  </div>';
      html += '</div>';
    }

    // Tarjeta 3: Seguridad Estructural CTE DB-SE-AE & Resonancia Campbell
    if (actStruct) {
      var stColor = actStruct.isSafe ? '#10B981' : '#EF4444';
      var fallR = RAWind.Entity ? RAWind.Entity.getFallRadius(activeTurbine) : 20;
      html += '<div style="background:rgba(15,23,42,0.8);border-left:3px solid ' + stColor + ';border-radius:4px;padding:7px 9px;margin-bottom:6px;font-size:10px;">';
      html += '  <div style="display:flex;justify-content:space-between;font-weight:700;color:' + stColor + ';margin-bottom:3px;">';
      html += '    <span>🏗️ ESTRUCTURA CTE DB-SE-AE & CAMPBELL</span>';
      html += '    <span>' + (actStruct.isSafe ? 'ESTABLE' : 'REVISAR APOYO') + '</span>';
      html += '  </div>';
      html += '  <div style="color:var(--text-slate-300);line-height:1.4;">';
      html += '    Empuje máx: <b>' + actStruct.maxRotorThrustKn + ' kN</b> · M<sub>vuelco</sub>: <b>' + actStruct.overturningMomentCharKnm + ' kN·m</b> · Radio caída: <b>' + fallR + ' m</b><br>';
      if (actStruct.mountingType === 'ground') {
        var fsSlid = actStruct.foundation.safetyFactorSliding ? (' · FS_desliz=' + actStruct.foundation.safetyFactorSliding) : '';
        html += '    Zapata HA-25: <b>' + actStruct.foundation.footingLengthM + '×' + actStruct.foundation.footingLengthM + '×' + actStruct.foundation.footingDepthM + ' m</b> (' + actStruct.foundation.concreteVolumeM3 + ' m³, FS_vuelco=' + actStruct.foundation.safetyFactorOverturning + fsSlid + ')';
      } else {
        html += '    Carga en forjado: <b>' + actStruct.foundation.roofDistributedLoadKgM2 + ' kg/m²</b> ' + (actStruct.foundation.roofOverloadRisk ? '<span style="color:#EF4444;">(>200 kg/m² CTE: anclar a pilares)</span>' : '(OK)');
      }
      html += '<br>    Modo torre f<sub>n</sub>=<b>' + actStruct.campbell.towerNaturalFreqHz + ' Hz</b> vs 1P=' + actStruct.campbell.freq1PHz + ' Hz / 3P=' + actStruct.campbell.freqBladePassHz + ' Hz (' + actStruct.campbell.stiffnessRegime + ')';
      html += '  </div>';
      html += '</div>';
    }

    // Tarjeta 4: Ingeniería Eléctrica REBT ITC-BT-40 & Frenado Reostático
    if (actElec) {
      var elColor = actElec.cable.compliesREBT ? '#38BDF8' : '#EF4444';
      html += '<div style="background:rgba(15,23,42,0.8);border-left:3px solid ' + elColor + ';border-radius:4px;padding:7px 9px;margin-bottom:6px;font-size:10px;">';
      html += '  <div style="display:flex;justify-content:space-between;font-weight:700;color:' + elColor + ';margin-bottom:3px;">';
      html += '    <span>⚡ ELÉCTRICA REBT ITC-BT-40 & DUMP LOAD</span>';
      html += '    <span>ΔU = ' + actElec.cable.voltageDropPct + '% (≤1.5%)</span>';
      html += '  </div>';
      html += '  <div style="color:var(--text-slate-300);line-height:1.4;">';
      html += '    Línea (' + actElec.cable.lengthM + 'm): <b>' + actElec.cable.designation + '</b> (I<sub>n</sub>=' + actElec.nominalCurrentA + 'A)<br>';
      html += '    Freno Reostático (120%): <b>' + actElec.dumpLoad.requiredPowerKw + ' kW / ' + actElec.dumpLoad.equivalentResistanceOhm + ' Ω</b> (' + actElec.dumpLoad.dissipatedEnergy30MinKwh + ' kWh/30min)<br>';
      html += '    Protección: <b>Diferencial Clase B 300 mA</b> + SPD Tipo 1+2 base torre';
      html += '  </div>';
      html += '</div>';
    }

    // Tarjeta 5: Despacho Híbrido 8760h (Fase 3)
    if (global.RAWind && global.RAWind.HybridDispatch) {
      var solarAnnualKwh = 0;
      var solarMonthlyKwh = null;

      if (typeof global.getProjectCalcs === 'function') {
        try {
          var pCalcs = global.getProjectCalcs();
          if (pCalcs && typeof pCalcs.annualKWh === 'number' && pCalcs.annualKWh > 0) {
            solarAnnualKwh = pCalcs.annualKWh;
          } else if (pCalcs && typeof pCalcs.produccionAnual === 'number' && pCalcs.produccionAnual > 0) {
            solarAnnualKwh = pCalcs.produccionAnual;
          }
        } catch (eCalcs) {}
      }

      if (solarAnnualKwh <= 0 && global.solarSimState) {
        if (Array.isArray(global.solarSimState.monthlyKwh) && global.solarSimState.monthlyKwh.length === 12) {
          solarAnnualKwh = global.solarSimState.monthlyKwh.reduce(function (a, b) { return a + b; }, 0);
          solarMonthlyKwh = global.solarSimState.monthlyKwh;
        } else if (typeof global.solarSimState.annualKwh === 'number') {
          solarAnnualKwh = global.solarSimState.annualKwh;
        }
      }

      if (solarAnnualKwh <= 0 && Array.isArray(global.allRenderedPanels) && global.allRenderedPanels.length > 0) {
        var activePanels = global.allRenderedPanels.filter(function (p) { return p && !p.deleted; });
        if (activePanels.length > 0) {
          solarAnnualKwh = activePanels.reduce(function (acc, p) {
            return acc + (p.annualKwh || 550);
          }, 0);
        }
      }

      var windAnnualKwh = parkSummary.totalAepNetKwh || 0;
      var consAnnualKwh = (global.solarProjectConfig && global.solarProjectConfig.manualAnnualConsumptionKWh) || 35000;
      var battCapKwh = (global.inverterEquipmentState && global.inverterEquipmentState.batteryCapacityKwh) || 0;

      var dispatch = global.RAWind.HybridDispatch.simulateHybridDispatch8760({
        annualSolarKwh: solarAnnualKwh,
        monthlySolarKwh: solarMonthlyKwh,
        annualWindKwh: windAnnualKwh,
        annualConsumptionKwh: consAnnualKwh,
        batteryCapacityKwh: battCapKwh,
        capexSolarEur: (global._lastFinModel && global._lastFinModel.capexTotal) || 0,
        capexWindEur: (parkSummary.totalRatedKw || 0) * 1450
      });

      html += '<div style="background:rgba(15,23,42,0.85);border-left:3px solid #8B5CF6;border-radius:4px;padding:7px 9px;margin-bottom:6px;font-size:10px;">';
      html += '  <div style="display:flex;justify-content:space-between;font-weight:700;color:#C4B5FD;margin-bottom:3px;">';
      html += '    <span>⚖️ DESPACHO HÍBRIDO FV + VIENTO 8760h</span>';
      html += '    <span style="color:#A78BFA;">Autosuf: ' + Math.round(dispatch.selfSufficiencyRatio * 100) + '%</span>';
      html += '  </div>';
      html += '  <div style="color:var(--text-slate-300);line-height:1.4;">';
      html += '    Generación Híbrida Anual: <b>' + dispatch.annualHybridGenKwh.toLocaleString('es-ES') + ' kWh</b> (☀️ ' + dispatch.annualSolarKwh.toLocaleString('es-ES') + ' + 💨 ' + dispatch.annualWindKwh.toLocaleString('es-ES') + ')<br>';
      html += '    Autoconsumo Útil: <b>' + dispatch.totalSelfConsumptionKwh.toLocaleString('es-ES') + ' kWh</b> (' + Math.round(dispatch.selfConsumptionRatio * 100) + '% del total generado)<br>';
      html += '    Peak Shaving Potencia: <b style="color:#34D399;">-' + dispatch.peakShavingReductionKw + ' kW (-' + dispatch.peakShavingPct + '%)</b> en horas punta<br>';
      html += '    Ahorro Total Estimado: <b style="color:#FBBF24;">' + dispatch.annualSavingsEur.toLocaleString('es-ES') + ' €/año</b> · LCOE Híbrido: <b>' + dispatch.lcoeHybridEurKwh.toFixed(3) + ' €/kWh</b>';
      html += '  </div>';
      html += '</div>';
    }

    // Tarjeta 6: Parpadeo de Sombras (Shadow Flicker) sobre Paneles y Receptores
    if (global.RAWind && global.RAWind.ShadowFlicker && activeTurbine) {
      var solarTarget = null;
      if (Array.isArray(global.allRenderedPanels) && global.allRenderedPanels.length > 0) {
        var firstP = global.allRenderedPanels.find(function (p) { return p && !p.deleted && p.positionCartographic; });
        if (firstP && firstP.positionCartographic) {
          solarTarget = {
            latDeg: firstP.positionCartographic.latitude * (180.0 / Math.PI),
            lonDeg: firstP.positionCartographic.longitude * (180.0 / Math.PI),
            altitudeM: firstP.positionCartographic.height || 0
          };
        }
      }

      var flKey = (activeTurbine ? activeTurbine.id : '') + '_' + ((activeTurbine && activeTurbine.supportStructure) ? activeTurbine.supportStructure.hubHeightM : 0) + '_' + (solarTarget ? (solarTarget.latDeg.toFixed(4) + '_' + solarTarget.lonDeg.toFixed(4)) : 'none');
      if (_uiCalcCache.flickerKey !== flKey) {
        _uiCalcCache.flicker = global.RAWind.ShadowFlicker.evaluateAnnualShadowFlicker(activeTurbine, null, solarTarget);
        _uiCalcCache.flickerKey = flKey;
      }
      var flicker = _uiCalcCache.flicker;
      var flColor = flicker.isAcceptable ? '#10B981' : (flicker.compliesNorm30hYear ? '#F59E0B' : '#EF4444');
      var flBadge = flicker.isAcceptable ? 'CUMPLE NORMA (≤30h)' : (flicker.compliesNorm30hYear ? 'PICO DIARIO (>30m)' : 'EXCEDE 30 h/AÑO');

      html += '<div style="background:rgba(15,23,42,0.85);border-left:3px solid ' + flColor + ';border-radius:4px;padding:7px 9px;font-size:10px;">';
      html += '  <div style="display:flex;justify-content:space-between;font-weight:700;color:' + flColor + ';margin-bottom:3px;">';
      html += '    <span>🌓 SOMBRAS & SHADOW FLICKER (ASTRONÓMICO)</span>';
      html += '    <span>' + flBadge + '</span>';
      html += '  </div>';
      html += '  <div style="color:var(--text-slate-300);line-height:1.4;">';
      html += '    Receptor sensible (' + flicker.worstReceiverDistanceM + 'm): <b>' + flicker.worstHoursYear + ' h/año</b> (máx. <b>' + flicker.maxMinutesPerDay + ' min/día</b>)<br>';
      if (flicker.solarFieldShadowHours > 0) {
        html += '    Sombra sobre mesas FV: <b style="color:#FBBF24;">' + flicker.solarFieldShadowHours + ' h/año</b> (pérdida est. ~' + flicker.solarYieldLossPctEstimate + '%)<br>';
      } else {
        html += '    Sombra sobre mesas FV: <b style="color:#34D399;">0 h/año</b> (sin interferencia óptica directa)<br>';
      }
      html += '    Mitigación: ' + (flicker.curtailmentRecommended ? '<b style="color:#EF4444;">Parada programada recomendada en sol bajo</b>' : '<b style="color:#10B981;">No requiere paradas de rotor</b>');
      html += '  </div>';
      html += '</div>';
    }
  } else {
    html += '<div style="background:rgba(15,23,42,0.5);border:1px dashed rgba(148,163,184,0.2);border-radius:6px;padding:12px;text-align:center;margin-bottom:8px;">';
    html += '  <div style="color:#94A3B8;font-size:10px;font-weight:600;">Ningún aerogenerador seleccionado</div>';
    html += '  <div style="color:#64748B;font-size:9px;margin-top:2px;">Haz clic en una unidad de la lista o en el visor 3D para inspeccionar y configurar.</div>';
    html += '</div>';
  }

    html += '</div>';
    panel.innerHTML = html;
  }

  function focusTurbine(id) {
    var t = RAWind.Entity.getById(id);
    if (!t || !global.viewer || !global.Cesium) return;
    _selectedTurbineIdForInspect = id;
    var cartesian = global.Cesium.Cartesian3.fromRadians(
      t.positionCartographic.longitudeRad,
      t.positionCartographic.latitudeRad,
      t.positionCartographic.altitudeM + (t.supportStructure ? t.supportStructure.hubHeightM : 18)
    );
    global.viewer.camera.flyTo({
      destination: global.Cesium.Cartesian3.add(
        cartesian,
        new global.Cesium.Cartesian3(30, 30, 25),
        new global.Cesium.Cartesian3()
      ),
      orientation: {
        heading: global.Cesium.Math.toRadians(225),
        pitch: global.Cesium.Math.toRadians(-25),
        roll: 0.0
      },
      duration: 1.5
    });
    if (global.RAWindVisualizer) {
      global.RAWindVisualizer.selectTurbine(id);
    }
    renderStep2Panel();
  }

  function onTurbinesChanged(eventType, data) {
    _invalidateUiCalcCache();
    renderStep2Panel();
  }

  function toggleAutoYaw(enabled) {
    if (RAWind.Resource && typeof RAWind.Resource.updateConfig === 'function') {
      RAWind.Resource.updateConfig({ autoYawToWind: !!enabled });
      if (enabled && RAWind.Entity && typeof RAWind.Entity.orientAllToPrevailingWind === 'function') {
        RAWind.Entity.orientAllToPrevailingWind();
      }
    }
    renderStep2Panel();
  }

  function orientAllToWindNow() {
    if (RAWind.Entity && typeof RAWind.Entity.orientAllToPrevailingWind === 'function') {
      var deg = RAWind.Entity.orientAllToPrevailingWind();
      if (typeof global.showToast === 'function') {
        global.showToast('AUTO-YAW APLICADO', 'Todas las góndolas eólicas se han orientado hacia el viento dominante (' + deg + '° ' + _getYawCardinal(deg) + ').', 'success', 3000);
      }
    }
  }

  function autoCalibrateBetzViolations() {
    var turbList = global.windTurbines;
    if (!Array.isArray(turbList) || turbList.length === 0) return;
    var count = 0;
    turbList.forEach(function (t) {
      if (t && t._catalog) {
        var audit = t._catalog.cpAudit || (global.RAWindCatalog && global.RAWindCatalog.validatePowerCurve(t._catalog));
        if (!audit || !audit.valid) {
          if (global.RAWindCatalog && typeof global.RAWindCatalog.calibratePowerCurveToBetz === 'function') {
            global.RAWindCatalog.calibratePowerCurveToBetz(t._catalog, 0.42);
            t.cpAudit = t._catalog.cpAudit;
            count++;
          }
        }
      }
    });

    if (global.RAWind && global.RAWind.Entity && typeof global.RAWind.Entity.recalculateAllEngineering === 'function') {
      global.RAWind.Entity.recalculateAllEngineering();
    }
    renderStep2Panel();
    if (typeof global.showToast === 'function') {
      global.showToast('CURVAS CALIBRADAS', count + ' turbina(s) ajustada(s) al límite aerodinámico realista (Cp ≤ 0,42). Producción desbloqueada.', 'success', 4000);
    }
  }

  var RAWindUI = {
    init: init,
    isPlacementActive: isPlacementActive,
    getPendingTurbine: getPendingTurbine,
    startTurbinePlacement: startTurbinePlacement,
    placeAtCartesian: placeAtCartesian,
    cancelPlacement: cancelPlacement,
    showPlacementHint: showPlacementHint,
    hidePlacementHint: hidePlacementHint,
    selectTurbineForInspect: selectTurbineForInspect,
    getSelectedTurbineId: function () { return _selectedTurbineIdForInspect; },
    updateResourceParam: updateResourceParam,
    updateVisualParam: updateVisualParam,
    toggleRings3D: toggleRings3D,
    toggleAutoYaw: toggleAutoYaw,
    orientAllToWindNow: orientAllToWindNow,
    autoCalibrateBetzViolations: autoCalibrateBetzViolations,
    toggleAdvancedResource: toggleAdvancedResource,
    toggleResourceMetric: toggleResourceMetric,
    isAdvancedResourceOpen: function () { return _showAdvancedResource; },
    getResourceActiveMetrics: function () { return _resourceActiveMetrics; },
    setWindSource: setWindSource,
    fetchSelectedWindSource: fetchSelectedWindSource,
    fetchERA5WindData: fetchSelectedWindSource,
    getYawCardinal: _getYawCardinal,
    renderStep2Panel: renderStep2Panel,
    focusTurbine: focusTurbine,
    onTurbinesChanged: onTurbinesChanged
  };

  global.RAWindUI = RAWindUI;
  RAWind.UI = RAWindUI;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = RAWindUI;
  }

})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : global));
