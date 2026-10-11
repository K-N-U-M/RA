/**
 * js/solar-heatmap.js — Motor de Simulación Anual de Sombras e Irradiancia (Arquitectura AAA v3)
 * ==============================================================================================
 * Física solar rigurosa, Time-Slicing dinámico (60 FPS sin congelación) y Diagnóstico MLPE.
 *
 * Características del motor:
 *   1. 192 instantes anuales (12 meses × 16 horas, de 6:00 a 21:00)
 *   2. Corte de horizonte astronómico (elevación solar ≥ 3º)
 *   3. Ley del Coseno (ángulo de incidencia real S · N) y derating térmico estacional
 *   4. Modelo de Transposición: Radiación Directa + Difusa Isotrópica (20%) + Albedo Trasero (Bifacial)
 *   5. Time-Slicing asíncrono con presupuesto de 15ms por frame
 *   6. HUD cinematográfico Glassmorphism con indicador mensual y barra fluida
 *   7. Diagnóstico tri-nivel: Óptimo (<8%) | MLPE Recomendado (8-25%) | Inviable (≥25%)
 */
(function() {
  'use strict';

  function getCompassDirection(deg) {
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'N'];
    return dirs[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
  }
  if (typeof window !== 'undefined') window.getCompassDirection = getCompassDirection;

  // ── 1. MODAL DE CONFIRMACIÓN DE BIFACIALIDAD (PRE-FLIGHT CHECK) ───────────
  async function wpEnsureBifacialConfig(activeModule) {
    if (!activeModule) return { isBifacial: false, bifacialityFactor: 0 };
    if (typeof activeModule.isBifacial === 'boolean') {
      return {
        isBifacial: activeModule.isBifacial,
        bifacialityFactor: activeModule.bifacialityFactor || (activeModule.isBifacial ? 0.75 : 0)
      };
    }

    return new Promise((resolve) => {
      let modal = document.getElementById('ra-bifacial-modal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'ra-bifacial-modal';
        modal.style.cssText = `
          position:fixed;top:0;left:0;width:100vw;height:100vh;
          background:rgba(10,16,29,0.78);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);
          display:flex;align-items:center;justify-content:center;z-index:99999;
          font-family:'Inter',system-ui,sans-serif;
        `;
        document.body.appendChild(modal);
      }

      const modName = (activeModule.brand ? activeModule.brand + ' ' : '') + (activeModule.model || 'Módulo FV');

      modal.innerHTML = `
        <div style="background:#0f172a;border:1px solid rgba(56,189,248,0.3);border-radius:14px;padding:22px;max-width:440px;width:90%;box-shadow:0 25px 50px -12px rgba(0,0,0,0.85);color:#fff;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
            <div style="background:rgba(56,189,248,0.15);border:1px solid #38bdf8;border-radius:8px;padding:6px;display:flex;align-items:center;justify-content:center;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
            </div>
            <div>
              <div style="font-size:12.5px;font-weight:800;letter-spacing:0.04em;color:#38bdf8;text-transform:uppercase;">Tecnología de Captación</div>
              <div style="font-size:10.5px;color:#94a3b8;">${modName}</div>
            </div>
          </div>
          <p style="font-size:10.5px;color:#cbd5e1;line-height:1.45;margin:0 0 16px 0;">
            El módulo del catálogo no especifica si capta radiación por la cara trasera (albedo). Selecciona el modo de simulación física:
          </p>
          <div style="display:flex;flex-direction:column;gap:8px;">
            <button id="ra-bif-mono-btn" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:10px 12px;color:#fff;cursor:pointer;text-align:left;display:flex;justify-content:space-between;align-items:center;transition:background 0.15s;">
              <div>
                <div style="font-size:11px;font-weight:700;color:#f8fafc;">⚪ Monofacial Estándar</div>
                <div style="font-size:9.5px;color:#94a3b8;">Captación solo por cara frontal (0% albedo trasero)</div>
              </div>
              <span style="font-size:9.5px;background:rgba(255,255,255,0.1);padding:2px 6px;border-radius:4px;color:#cbd5e1;">Por defecto</span>
            </button>
            <button id="ra-bif-std-btn" style="background:rgba(56,189,248,0.08);border:1px solid rgba(56,189,248,0.35);border-radius:8px;padding:10px 12px;color:#fff;cursor:pointer;text-align:left;display:flex;justify-content:space-between;align-items:center;transition:background 0.15s;">
              <div>
                <div style="font-size:11px;font-weight:700;color:#38bdf8;">🔵 Bifacial TOPCon / HJT</div>
                <div style="font-size:9.5px;color:#94a3b8;">Factor de bifacialidad 0.75 (ganancia real típica: +5-15% según albedo y altura de estructura)</div>
              </div>
              <span style="font-size:9.5px;background:rgba(56,189,248,0.2);color:#38bdf8;padding:2px 6px;border-radius:4px;">Recomendado</span>
            </button>
          </div>
        </div>
      `;

      modal.style.display = 'flex';

      const cleanup = (res) => {
        modal.style.display = 'none';
        activeModule.isBifacial = res.isBifacial;
        activeModule.bifacialityFactor = res.bifacialityFactor;
        resolve(res);
      };

      document.getElementById('ra-bif-mono-btn').onclick = () => cleanup({ isBifacial: false, bifacialityFactor: 0 });
      document.getElementById('ra-bif-std-btn').onclick = () => cleanup({ isBifacial: true, bifacialityFactor: 0.75 });
    });
  }

  // ── 2. ACTUALIZACIÓN VISUAL INSTANTÁNEA DE SOMBRAS Y MLPE ──────────────────
  function wpUpdatePanelShadingAndMLPE(solarPos) {
    if (typeof viewer === "undefined" || !viewer || !viewer.entities) return;

    if (!solarSimState) window.solarSimState = {};
    solarSimState.currentSolarPos = solarPos;

    if (solarSimState.mlpeBadgeEntities) {
      solarSimState.mlpeBadgeEntities.forEach(e => viewer.entities.remove(e));
    }
    solarSimState.mlpeBadgeEntities = [];

    if (solarSimState.panelShadowOverlayEntities) {
      solarSimState.panelShadowOverlayEntities.forEach(e => viewer.entities.remove(e));
    }
    solarSimState.panelShadowOverlayEntities = [];

    if (solarSimState.obstacleShadowSurfaceEntities) {
      solarSimState.obstacleShadowSurfaceEntities.forEach(e => viewer.entities.remove(e));
    }
    solarSimState.obstacleShadowSurfaceEntities = [];

    let shadedCount = 0;
    let totalPanels = 0;
    const hasPolys = typeof WP !== "undefined" && WP && WP.polylines && WP.polylines.length > 0;
    const polylinesList = hasPolys ? WP.polylines : (lastRoofInfo ? [{ points: polygonPoints, roofInfo: lastRoofInfo }] : []);

    let panelGlobalCounter = 0;

    polylinesList.forEach((poly, polyIdx) => {
      const pInfo = poly.roofInfo || (typeof computeSinglePolylineRoofInfo === "function" ? computeSinglePolylineRoofInfo(poly.points, poly) : null);
      if (!pInfo || !pInfo.panels) return;

      const uVec = pInfo.uVec || new Cesium.Cartesian3(1, 0, 0);
      const vVec = pInfo.vVec || new Cesium.Cartesian3(0, 1, 0);
      const norm = pInfo.normal || new Cesium.Cartesian3(0, 0, 1);
      const transform = pInfo.transform || Cesium.Transforms.eastNorthUpToFixedFrame(pInfo.center || new Cesium.Cartesian3(0,0,0));

      const sU = Cesium.Cartesian3.dot(solarPos.sDirENU, uVec);
      const sV = Cesium.Cartesian3.dot(solarPos.sDirENU, vVec);

      let sunDirWorld = null;
      if (solarPos.sunVecENU && transform) {
        if (typeof Cesium.Matrix4.multiplyByPointAsVector === "function") {
          sunDirWorld = Cesium.Matrix4.multiplyByPointAsVector(transform, solarPos.sunVecENU, new Cesium.Cartesian3());
        } else if (typeof Cesium.Matrix4.multiplyByPoint === "function") {
          sunDirWorld = Cesium.Matrix4.multiplyByPoint(transform, solarPos.sunVecENU, new Cesium.Cartesian3());
        }
        if (sunDirWorld) Cesium.Cartesian3.normalize(sunDirWorld, sunDirWorld);
      }

      let normWorld = new Cesium.Cartesian3();
      if (norm && Cesium.Cartesian3.magnitude(norm) > 0.5) {
        normWorld = Cesium.Cartesian3.clone(norm);
      } else if (transform && norm) {
        if (typeof Cesium.Matrix4.multiplyByPointAsVector === "function") {
          normWorld = Cesium.Matrix4.multiplyByPointAsVector(transform, norm, normWorld);
        } else if (typeof Cesium.Matrix4.multiplyByPoint === "function") {
          normWorld = Cesium.Matrix4.multiplyByPoint(transform, norm, normWorld);
        }
        Cesium.Cartesian3.normalize(normWorld, normWorld);
      } else {
        normWorld = new Cesium.Cartesian3(0, 0, 1);
      }

      const polyShadowQuads2D = [];
      if (solarPos.isDaylight && typeof obstacles !== "undefined" && obstacles && obstacles.length > 0) {
        obstacles.forEach(obs => {
          if (typeof getObstacleShadowPolygons2DForRoof === "function") {
            const quads = getObstacleShadowPolygons2DForRoof(obs, pInfo, sU, sV, solarPos.shadowLenPerM);
            if (quads && quads.length > 0) polyShadowQuads2D.push(...quads);
          }
        });
      }
      if (solarPos.isDaylight && typeof buildings !== "undefined" && buildings && buildings.length > 0) {
        buildings.forEach(bld => {
          if (typeof getBuildingShadowPolygons2DForRoof === "function") {
            const quads = getBuildingShadowPolygons2DForRoof(bld, pInfo, sU, sV, solarPos.shadowLenPerM);
            if (quads && quads.length > 0) polyShadowQuads2D.push(...quads);
          }
        });
      }

      pInfo.panels.forEach((pData) => {
        totalPanels++;
        const entIdx = panelGlobalCounter++;

        let isShaded = false;
        if (polyShadowQuads2D.length > 0) {
          const halfW = (pData.w || 1.05) / 2;
          const halfH = (pData.h || 2.10) / 2;
          const panelPoly2D = [
            { u: pData.u - halfW, v: pData.v - halfH },
            { u: pData.u + halfW, v: pData.v - halfH },
            { u: pData.u + halfW, v: pData.v + halfH },
            { u: pData.u - halfW, v: pData.v + halfH }
          ];

          for (const quad of polyShadowQuads2D) {
            if (typeof polygonsIntersect2D === "function" && polygonsIntersect2D(panelPoly2D, quad)) {
              isShaded = true;
              break;
            }
          }
        }

        if (!isShaded && solarPos.isDaylight && sunDirWorld && pData.center) {
          if (typeof isPanelOccludedBy3DEnvironment === "function" && isPanelOccludedBy3DEnvironment(pData.center, normWorld, sunDirWorld)) {
            isShaded = true;
          }
        }

        pData.isShaded = isShaded;
        const annualLoss = (typeof pData.annualLossPct === 'number') ? pData.annualLossPct : 0;
        const requiresMLPE = (annualLoss >= 8.0) || (isShaded && window.solarProjectConfig && window.solarProjectConfig.shadingStrategy === 'mlpe');
        pData.hasMLPE = requiresMLPE;

        if (isShaded && pData.corners && pData.corners.length >= 3) {
          shadedCount++;
          const tiltAngle = (typeof pInfo.tiltDeg === 'number') ? pInfo.tiltDeg : 15;
          const zOffset = 0.025 + 0.015 * Math.sin(Cesium.Math.toRadians(tiltAngle));
          const shadowCorners = pData.corners.map(c => {
            return Cesium.Cartesian3.add(c, Cesium.Cartesian3.multiplyByScalar(normWorld, zOffset, new Cesium.Cartesian3()), new Cesium.Cartesian3());
          });

          const shadowMatOverlay = Cesium.Color.fromCssColorString('#0f172a').withAlpha(0.75);
          const shadowOverlay = viewer.entities.add({
            id: "pv_panel_shadow_overlay_" + entIdx + "_" + Math.random().toString(36).substring(2, 6),
            show: true,
            polygon: {
              hierarchy: new Cesium.PolygonHierarchy(shadowCorners),
              material: shadowMatOverlay,
              perPositionHeight: true,
              arcType: (typeof Cesium !== 'undefined' && Cesium.ArcType && Cesium.ArcType.NONE) ? Cesium.ArcType.NONE : undefined
            }
          });
          solarSimState.panelShadowOverlayEntities.push(shadowOverlay);

          if (requiresMLPE) {
            const badgePos = Cesium.Cartesian3.add(
              pData.center,
              Cesium.Cartesian3.multiplyByScalar(norm, 0.40, new Cesium.Cartesian3()),
              new Cesium.Cartesian3()
            );

            const mlpeText = (annualLoss >= 25.0)
              ? "⚠️ ELIMINAR (-" + annualLoss.toFixed(1) + "%)"
              : "⚡ MLPE (" + (poly.name || ("S" + (polyIdx + 1))) + (annualLoss > 0 ? " · -" + annualLoss.toFixed(1) + "%" : "") + ")";

            const addLbl = (typeof addLabelEntity === 'function') ? addLabelEntity : (typeof window !== 'undefined' ? window.addLabelEntity : null);
            if (addLbl) {
              const badgeEntity = addLbl(badgePos, mlpeText, -8, {
                bg: (annualLoss >= 25.0) ? 'rgba(239, 68, 68, 0.92)' : 'rgba(15, 23, 42, 0.92)',
                borderColor: (annualLoss >= 25.0) ? '#EF4444' : '#10B981',
                textColor: (annualLoss >= 25.0) ? '#FFFFFF' : '#34D399',
                font: "bold 9.5px 'JetBrains Mono', monospace",
                maxDist: 75.0
              });
              solarSimState.mlpeBadgeEntities.push(badgeEntity);
            }
          }
        }
      });
    });

    const shadedCountEl = document.getElementById("solar-telemetry-shaded") || document.getElementById("hud-shaded-count");
    const mlpeCountEl = document.getElementById("solar-telemetry-mlpe") || document.getElementById("hud-mlpe-count");
    const altEl = document.getElementById("solar-telemetry-alt");
    const azEl = document.getElementById("solar-telemetry-az");

    if (shadedCountEl) shadedCountEl.textContent = shadedCount + " / " + totalPanels + " mods";
    if (mlpeCountEl) mlpeCountEl.textContent = shadedCount + " optimizadores";

    const altVal = (typeof solarPos.elevationDeg === "number") ? solarPos.elevationDeg : (typeof solarPos.alt === "number" ? solarPos.alt : 0);
    const azVal = (typeof solarPos.azimuthDeg === "number") ? solarPos.azimuthDeg : (typeof solarPos.azN === "number" ? solarPos.azN : 0);

    let phaseLabel = "☀️ DÍA";
    let altColor = "var(--amber-400)";
    if (altVal <= -6.0) {
      phaseLabel = "🌙 NOCHE (Luna)";
      altColor = "#60a5fa";
    } else if (altVal <= 0.0) {
      phaseLabel = "🌆 CREPÚSCULO";
      altColor = "#818cf8";
    } else if (altVal <= 8.0) {
      phaseLabel = "🌇 ATARDECER";
      altColor = "#f97316";
    }

    if (altEl) {
      altEl.innerHTML = altVal.toFixed(1) + "° <span style='font-size:8.5px;font-weight:600;opacity:0.9;'>(" + phaseLabel + ")</span>";
      altEl.style.color = altColor;
    }
    if (azEl) azEl.textContent = azVal.toFixed(1) + "° (" + getCompassDirection(azVal) + ")";

    const lossEl = document.getElementById("hud-loss-val");
    if (lossEl) {
      const lossPct = (totalPanels > 0) ? ((shadedCount / totalPanels) * 35).toFixed(1) : "0.0";
      lossEl.textContent = "-" + lossPct + "%";
    }

    if (viewer && viewer.scene && typeof viewer.scene.requestRender === "function") {
      viewer.scene.requestRender();
    }
  }

  // ── 3. DIAGNÓSTICO MLPE Y DECISIÓN DE HARDWARE (3 NIVELES) ─────────────────
  function wpEvaluateMLPENecessity(customWP = null) {
    const wpState = customWP || (typeof window !== 'undefined' && window.WP ? window.WP : null);
    const polylines = (wpState && Array.isArray(wpState.polylines)) ? wpState.polylines : [];

    let totalPanels = 0;
    let criticalCount = 0; // 8% - 24.9%
    let unviableCount = 0; // >= 25%
    const criticalPanels = [];
    const unviablePanels = [];

    polylines.forEach(poly => {
      const panels = Array.isArray(poly.panels) ? poly.panels : (poly.roofInfo && Array.isArray(poly.roofInfo.panels) ? poly.roofInfo.panels : []);
      panels.forEach(p => {
        totalPanels++;
        const loss = (typeof p.annualLossPct === 'number') ? p.annualLossPct : (p.isShaded ? 12.0 : 0.0);
        if (loss >= 25.0) {
          unviableCount++;
          unviablePanels.push(p);
        } else if (loss >= 8.0) {
          criticalCount++;
          criticalPanels.push(p);
        }
      });
    });

    let recommendation = 'all_clear';
    let recommendationMsg = 'Campo solar despejado. Funcionamiento óptimo en strings estándar sin necesidad de electrónica extra.';

    const affectedCount = criticalCount + unviableCount;
    if (affectedCount > 0) {
      const ratio = totalPanels > 0 ? (affectedCount / totalPanels) : 0;
      if (unviableCount > 0 && criticalCount === 0 && unviableCount <= 2) {
        recommendation = 'remove_unviable';
        recommendationMsg = `Se detectan ${unviableCount} módulo(s) con sombreado severo (>25%). Se aconseja eliminar esas placas del diseño para evitar sobrecostes innecesarios.`;
      } else if (ratio <= 0.35) {
        recommendation = 'selective_optimizers';
        recommendationMsg = `Se detectan ${criticalCount} paneles con pérdidas moderadas (8-25%)` + (unviableCount > 0 ? ` y ${unviableCount} inviables (>25%)` : '') + `. Se recomienda instalar Optimizadores DC selectivos (Tigo TS4-A-O / Huawei).`;
      } else {
        recommendation = 'microinverters_or_full_mlpe';
        recommendationMsg = `Más del 35% del campo solar sufre pérdidas críticas de irradiancia. Se aconseja topología descentralizada con Microinversores (Hoymiles / Enphase) para independizar cada panel.`;
      }
    }

    return {
      totalPanels,
      criticalLossPanelsCount: criticalCount,
      unviablePanelsCount: unviableCount,
      criticalPanels,
      unviablePanels,
      recommendation,
      recommendationMsg,
      applySelectiveOptimizers: function(targetWP = null) {
        const activeWP = targetWP || wpState;
        if (!activeWP || !Array.isArray(activeWP.polylines)) return;
        activeWP.polylines.forEach(poly => {
          const panels = Array.isArray(poly.panels) ? poly.panels : (poly.roofInfo && Array.isArray(poly.roofInfo.panels) ? poly.roofInfo.panels : []);
          panels.forEach(p => {
            const loss = (typeof p.annualLossPct === 'number') ? p.annualLossPct : (p.isShaded ? 12.0 : 0.0);
            if (loss >= 8.0 && loss < 25.0) {
              p.hasOptimizer = true;
              p.optimizerModelId = 'mlpe_tigo_ts4';
            }
          });
        });
        if (typeof window !== 'undefined' && window.BOMTreeEngine && typeof window.BOMTreeEngine.refresh === 'function') {
          window.BOMTreeEngine.refresh();
        }
      }
    };
  }

  // Token de generación para cancelación atómica de simulaciones obsoletas/concurrentes
  let _activeSimGenerationId = 0;

  async function computeAnnualSolarHeatmap(onProgressCallback) {
    const simGenerationId = ++_activeSimGenerationId;
    if (typeof window !== 'undefined' && window.solarSimState) {
      window.solarSimState.currentSimGenerationId = simGenerationId;
    }

    const wpState = (typeof window !== 'undefined' && window.WP ? window.WP : null);
    const polylines = (wpState && Array.isArray(wpState.polylines)) ? wpState.polylines : [];

    // Sincronizar y enlazar referencias de paneles antes de iniciar el cómputo
    polylines.forEach(poly => {
      if (!poly.roofInfo && typeof computeSinglePolylineRoofInfo === 'function') {
        poly.roofInfo = computeSinglePolylineRoofInfo(poly.points, poly);
      }
      if (poly.roofInfo && Array.isArray(poly.roofInfo.panels)) {
        poly.panels = poly.roofInfo.panels;
      }
    });

    // Localizar módulo activo para verificar bifacialidad
    let activeModule = null;
    const cat = (typeof equipmentCatalog !== 'undefined' && equipmentCatalog) ? equipmentCatalog : window.equipmentCatalog;
    const selModId = window.solarProjectConfig ? window.solarProjectConfig.selectedModuleId : null;
    if (cat && Array.isArray(cat.modules) && selModId) {
      activeModule = cat.modules.find(m => m.id === selModId) || cat.modules[0];
    }

    // 1. Verificación Pre-Flight de Bifacialidad
    const bifacialConfig = await wpEnsureBifacialConfig(activeModule);
    if (simGenerationId !== _activeSimGenerationId) return; // Abortado por nuevo cálculo concurrente

    const isBifacial = bifacialConfig.isBifacial;
    const bifacialityFactor = bifacialConfig.bifacialityFactor;

    // 2. Activar HUD Cinematográfico de progreso
    if (typeof showSolarCalcHUD === 'function') {
      showSolarCalcHUD('Simulación Térmico-Astronómica', 'Escaneando radiación directa, difusa y sombras...');
    }
    const progressBar = document.getElementById('heatmap-progress-bar');
    const progressFill = document.getElementById('heatmap-progress-fill');
    const diagText = document.getElementById('mlpe-diagnostic-text');
    if (progressBar) progressBar.style.display = 'block';
    if (progressFill) progressFill.style.width = '0%';
    if (diagText) {
      diagText.textContent = "Calculando modelo astronómico de 192 instantes (6:00 - 21:00)...";
      diagText.style.color = "var(--sky-400)";
    }

    // 3. Inicializar acumuladores de energía por panel
    let totalPanelsCount = 0;
    polylines.forEach(poly => {
      const panels = Array.isArray(poly.panels) ? poly.panels : (poly.roofInfo && Array.isArray(poly.roofInfo.panels) ? poly.roofInfo.panels : []);
      totalPanelsCount += panels.length;
      panels.forEach(p => {
        p.annualTotalPotential = 0;
        p.annualShadedLoss = 0;
        p.annualLossPct = 0;
        p.annualYieldPct = 100;
        p.shadowHits = 0;
      });
    });
    // ── FASE 4 · Muestreo representativo en plantas grandes ──
    // El ray-tracing 3D por panel × 192 instantes no escala a ~MWp (horas de cálculo).
    // Por encima de 400 paneles se simula una muestra uniforme (paso = N) y el resto
    // hereda el resultado del panel muestreado más cercano en su faldón (misma retícula).
    const heatmapStride = (totalPanelsCount > 400) ? Math.ceil(totalPanelsCount / 400) : 1;
    let _sampleCounter = 0;
    polylines.forEach(poly => {
      const panels = Array.isArray(poly.panels) ? poly.panels : (poly.roofInfo && Array.isArray(poly.roofInfo.panels) ? poly.roofInfo.panels : []);
      panels.forEach(p => {
        p.heatmapSample = (heatmapStride === 1) ? true : ((_sampleCounter++) % heatmapStride === 0);
        p.heatmapInterpolated = false;
      });
    });

    if (totalPanelsCount === 0) {
      if (typeof hideSolarCalcHUD === 'function') hideSolarCalcHUD();
      if (progressBar) progressBar.style.display = 'none';
      if (diagText) diagText.textContent = "No hay paneles generados en la cubierta.";
      return;
    }

    // 4. Parámetros geográficos y temporales
    let monthsDoy = [15, 45, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349];
    let monthDaysW = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let hours = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
    let hourStepDt = 1.0; // Anchura del intervalo horario en horas (16 horas evaluadas)
    
    if (window.raHeatmapResolution === 'medium') {
      monthsDoy = [15, 74, 135, 196, 258, 319];
      monthDaysW = [59, 61, 61, 62, 61, 61]; 
      hours = [7, 9, 11, 13, 15, 17, 19];
      hourStepDt = 16.0 / hours.length; // ~2.28h
    } else if (window.raHeatmapResolution === 'fast') {
      monthsDoy = [45, 135, 227, 319]; 
      monthDaysW = [90, 92, 92, 91];
      hours = [8, 11, 14, 17];
      hourStepDt = 16.0 / hours.length; // 4.0h
    }
    const year = new Date().getFullYear();

    const lat = (window.solarProjectConfig && window.solarProjectConfig.lat) ? window.solarProjectConfig.lat : 40.4168;
    const lng = (window.solarProjectConfig && window.solarProjectConfig.lng) ? window.solarProjectConfig.lng : -3.7038;

    const totalSteps = monthsDoy.length * hours.length; // 192 instantes en calidad estándar
    let currentStep = 0;
    let frameStartTime = performance.now();

    const _scratchV1 = new Cesium.Cartesian3();
    const _scratchV2 = new Cesium.Cartesian3();
    const _scratchUp = new Cesium.Cartesian3();

    function getPanelNormalWorld(pData, roofNorm, transform) {
      if (pData.corners && pData.corners.length >= 3) {
        const c0 = pData.corners[0];
        const c1 = pData.corners[1];
        const c3 = pData.corners[3];
        Cesium.Cartesian3.subtract(c1, c0, _scratchV1);
        Cesium.Cartesian3.subtract(c3, c0, _scratchV2);
        const n = Cesium.Cartesian3.cross(_scratchV1, _scratchV2, new Cesium.Cartesian3());
        if (Cesium.Cartesian3.magnitude(n) > 1e-6) {
          Cesium.Cartesian3.normalize(n, n);
          const up = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(pData.center || c0, _scratchUp);
          if (Cesium.Cartesian3.dot(n, up) < 0) {
            Cesium.Cartesian3.negate(n, n);
          }
          return n;
        }
      }
      // Si roofNorm ya tiene magnitud normalizada y está en ECEF
      if (roofNorm) {
        const mag = Cesium.Cartesian3.magnitude(roofNorm);
        if (mag > 0.5) return Cesium.Cartesian3.clone(roofNorm);
      }
      let nWorld = new Cesium.Cartesian3();
      if (transform && roofNorm) {
        if (typeof Cesium.Matrix4.multiplyByPointAsVector === "function") {
          nWorld = Cesium.Matrix4.multiplyByPointAsVector(transform, roofNorm, nWorld);
        } else {
          nWorld = Cesium.Matrix4.multiplyByPoint(transform, roofNorm, nWorld);
        }
        return Cesium.Cartesian3.normalize(nWorld, nWorld);
      }
      return roofNorm || new Cesium.Cartesian3(0, 0, 1);
    }

    // 5. Bucle Time-Sliced con presupuesto de 15ms
    for (let mIdx = 0; mIdx < monthsDoy.length; mIdx++) {
      const m = mIdx;
      // Derating térmico estacional
      const tempFactor = (mIdx >= 4 && mIdx <= 8) ? 0.93 : 0.98;
      const GHI_daily_Wh = (typeof estimateMonthlyGHI === 'function')
        ? estimateMonthlyGHI(lat, mIdx)
        : (4600 * (1 + 0.32 * Math.sin((mIdx - 2) * Math.PI / 6)));

      for (let hIdx = 0; hIdx < hours.length; hIdx++) {
        const h = hours[hIdx];
        currentStep++;

        // Hora local → hora UTC → hora solar vía EoT dentro del motor
        const d = new Date(year, m, 21, h, 0, 0);
        const utcHour = h + d.getTimezoneOffset() / 60;
        let solarPos = null;
        let dayLen = 12;
        if (typeof computeHighPrecisionSolarPosition === 'function') {
          const sp = computeHighPrecisionSolarPosition(lat, lng, monthsDoy[mIdx], utcHour);
          dayLen = (sp && sp.dayLengthHours) ? sp.dayLengthHours : 12;
          const elevRad_ = sp.elevRad;
          const azNRad = (sp.azDegFromNorth * Math.PI) / 180;
          const sunENU = new Cesium.Cartesian3(
            Math.cos(elevRad_) * Math.sin(azNRad),
            Math.cos(elevRad_) * Math.cos(azNRad),
            Math.sin(elevRad_)
          );
          solarPos = {
            elevationDeg: sp.elevDeg,
            elevDeg: sp.elevDeg,
            isDaylight: sp.isDay,
            sunVecENU: sunENU,
            sDirENU: new Cesium.Cartesian3(-sunENU.x, -sunENU.y, 0),
            shadowLenPerM: sp.elevDeg > 0.5 ? (1 / Math.tan(elevRad_)) : 100
          };
        } else if (typeof computeSolarPosition === 'function') {
          solarPos = computeSolarPosition(d, lat, lng);
        }

        const elevation = solarPos ? solarPos.elevationDeg : -90;
        if (!solarPos || !solarPos.isDaylight || !(elevation >= 3.0)) {
          continue;
        }

        const elevRad = Cesium.Math.toRadians(elevation);
        const sinAlt = Math.sin(elevRad);

        // Modelo de radiación astronómica instantánea (W/m²)
        const GHI_instant = Math.max(0, (GHI_daily_Wh / (dayLen * 0.5 * Math.PI / 2)) * (Math.PI / 2) * sinAlt);
        const DHI_fraction = 0.32;
        const G_dhi = GHI_instant * DHI_fraction;
        const G_dni = Math.max(0, (GHI_instant - G_dhi) / Math.max(sinAlt, 0.05));

        polylines.forEach(poly => {
          const pInfo = poly.roofInfo || (typeof computeSinglePolylineRoofInfo === "function" ? computeSinglePolylineRoofInfo(poly.points, poly) : null);
          if (!pInfo || !pInfo.panels) return;

          const uVec = pInfo.uVec || new Cesium.Cartesian3(1, 0, 0);
          const vVec = pInfo.vVec || new Cesium.Cartesian3(0, 1, 0);
          const norm = pInfo.normal || new Cesium.Cartesian3(0, 0, 1);
          const transform = pInfo.transform || Cesium.Transforms.eastNorthUpToFixedFrame(pInfo.center || new Cesium.Cartesian3(0,0,0));

          const sU = Cesium.Cartesian3.dot(solarPos.sDirENU, uVec);
          const sV = Cesium.Cartesian3.dot(solarPos.sDirENU, vVec);

          // Vector solar en coordenadas mundo (ECEF)
          let sunDirWorld = null;
          if (solarPos.sunVecENU && transform) {
            if (typeof Cesium.Matrix4.multiplyByPointAsVector === "function") {
              sunDirWorld = Cesium.Matrix4.multiplyByPointAsVector(transform, solarPos.sunVecENU, new Cesium.Cartesian3());
            } else if (typeof Cesium.Matrix4.multiplyByPoint === "function") {
              sunDirWorld = Cesium.Matrix4.multiplyByPoint(transform, solarPos.sunVecENU, new Cesium.Cartesian3());
            }
            if (sunDirWorld) Cesium.Cartesian3.normalize(sunDirWorld, sunDirWorld);
          }

          // Polígonos 2D de sombra de obstáculos
          const polyShadowQuads2D = [];
          if (typeof obstacles !== "undefined" && obstacles && obstacles.length > 0) {
            obstacles.forEach(obs => {
              if (typeof getObstacleShadowPolygons2DForRoof === "function") {
                const quads = getObstacleShadowPolygons2DForRoof(obs, pInfo, sU, sV, solarPos.shadowLenPerM);
                if (quads && quads.length > 0) polyShadowQuads2D.push(...quads);
              }
            });
          }
          if (typeof buildings !== "undefined" && buildings && buildings.length > 0) {
            buildings.forEach(bld => {
              if (typeof getBuildingShadowPolygons2DForRoof === "function") {
                const quads = getBuildingShadowPolygons2DForRoof(bld, pInfo, sU, sV, solarPos.shadowLenPerM);
                if (quads && quads.length > 0) polyShadowQuads2D.push(...quads);
              }
            });
          }

          pInfo.panels.forEach(pData => {
            const mw = monthDaysW[mIdx] || 30;
            if (!pData.heatmapSample) return;

            // 1. Vector normal 3D del panel específico
            const panelNormWorld = getPanelNormalWorld(pData, norm, transform);
            const up = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(pData.center || (pData.corners && pData.corners[0]), new Cesium.Cartesian3());
            const cosSlope = Math.max(0, Math.min(1, Cesium.Cartesian3.dot(panelNormWorld, up)));
            const tiltRad = Math.acos(cosSlope);
            const svf = (1 + cosSlope) / 2;

            // 2. Ángulo de incidencia panel-sol
            const cosIncidence = sunDirWorld ? Cesium.Cartesian3.dot(sunDirWorld, panelNormWorld) : 0;

            // 3. Transposición física POA (W/m²) por módulo
            let G_beam = 0;
            if (cosIncidence > 0.005) {
              const iam = Math.max(0, 1 - 0.05 * (1 / Math.max(cosIncidence, 0.01) - 1));
              G_beam = G_dni * cosIncidence * iam;
            }
            const G_diffuse = G_dhi * svf;
            const G_albedo = GHI_instant * 0.20 * ((1 - cosSlope) / 2);

            // Bifacialidad: factor de vista hacia cubierta/suelo con difusión perimetral mínima (0.04) para coplanares
            const rearViewFactor = Math.max(0.04, Math.pow(Math.sin(tiltRad / 2), 2));
            const albedoGain = isBifacial ? (GHI_instant * 0.20 * rearViewFactor * bifacialityFactor) : 0;

            const instantPotentialW = (G_beam + G_diffuse + G_albedo + albedoGain) * tempFactor;
            pData.annualTotalPotential += instantPotentialW * mw * hourStepDt;

            // 4. Sombreado 2D (obstáculos) y 3D (Google 3D Tiles)
            let isShaded = false;
            if (polyShadowQuads2D.length > 0 && typeof pData.u === 'number' && typeof pData.v === 'number') {
              const halfW = (pData.w || 1.05) / 2;
              const halfH = (pData.h || 2.10) / 2;
              const uMin = pData.u - halfW;
              const uMax = pData.u + halfW;
              const vMin = pData.v - halfH;
              const vMax = pData.v + halfH;
              
              const panelPoly2D = [
                { u: uMin, v: vMin },
                { u: uMax, v: vMin },
                { u: uMax, v: vMax },
                { u: uMin, v: vMax }
              ];
              for (const quad of polyShadowQuads2D) {
                if (!quad || quad.length === 0) continue;
                // AABB Broadphase check: si la caja envolvente de la sombra no toca la del panel, descartar inmediatamente
                let qUMin = Infinity, qUMax = -Infinity, qVMin = Infinity, qVMax = -Infinity;
                for (let qi = 0; qi < quad.length; qi++) {
                  const qpt = quad[qi];
                  if (qpt.u < qUMin) qUMin = qpt.u;
                  if (qpt.u > qUMax) qUMax = qpt.u;
                  if (qpt.v < qVMin) qVMin = qpt.v;
                  if (qpt.v > qVMax) qVMax = qpt.v;
                }
                if (uMax < qUMin || uMin > qUMax || vMax < qVMin || vMin > qVMax) {
                  continue; // Sin solapamiento en bounding box
                }

                if (typeof polygonsIntersect2D === "function" && polygonsIntersect2D(panelPoly2D, quad)) {
                  isShaded = true;
                  break;
                }
              }
            }

            if (!isShaded && sunDirWorld && pData.center) {
              if (typeof isPanelOccludedBy3DEnvironment === "function" && isPanelOccludedBy3DEnvironment(pData.center, panelNormWorld, sunDirWorld)) {
                isShaded = true;
              }
            }

            if (isShaded) {
              pData.shadowHits = (pData.shadowHits || 0) + mw * hourStepDt;
              // La sombra bloquea la componente de radiación directa incidente (G_beam), preservando la difusa
              const instantLossW = G_beam * tempFactor;
              pData.annualShadedLoss += instantLossW * mw * hourStepDt;
            }
          });
        });

        // ⏱️ TIME-SLICING: Ceder control al navegador si se supera el presupuesto de 15ms
        if (performance.now() - frameStartTime > 15) {
          if (simGenerationId !== _activeSimGenerationId) {
            // Abortar silenciosamente esta tarea en segundo plano porque se lanzó una nueva
            return;
          }
          const progressPct = Math.min(100, Math.round((currentStep / totalSteps) * 100));
          if (typeof updateSolarCalcHUD === 'function') {
            updateSolarCalcHUD(progressPct, mIdx, totalPanelsCount);
          }
          if (progressFill) progressFill.style.width = progressPct + '%';
          if (typeof onProgressCallback === 'function') {
            onProgressCallback(progressPct, mIdx, totalPanelsCount);
          }
          await new Promise(resolve => setTimeout(resolve, 0));
          if (simGenerationId !== _activeSimGenerationId) return;
          frameStartTime = performance.now();
        }
      }
    }

    // 6. Cálculo final de porcentajes, producción anual en kWh y clasificación
    const pNomW = (activeModule && activeModule.wp) || 450;
    const pKwp = pNomW / 1000.0;
    const prCalc = (typeof window !== 'undefined' && typeof window.raCalculateSystemPR === 'function')
      ? window.raCalculateSystemPR(0.925)
      : { prTotal: 0.84 };
    const prSys = prCalc.prTotal; // System Performance Ratio sincronizado con árbol de pérdidas y térmico

    let maxNetWh = 0;
    polylines.forEach(poly => {
      const panels = Array.isArray(poly.panels) ? poly.panels : (poly.roofInfo && Array.isArray(poly.roofInfo.panels) ? poly.roofInfo.panels : []);
      panels.forEach(p => {
        const netWh = Math.max(0, p.annualTotalPotential - (p.annualShadedLoss || 0));
        if (netWh > maxNetWh) maxNetWh = netWh;
      });
    });
    if (maxNetWh <= 0) maxNetWh = 1;

    polylines.forEach(poly => {
      const panels = Array.isArray(poly.panels) ? poly.panels : (poly.roofInfo && Array.isArray(poly.roofInfo.panels) ? poly.roofInfo.panels : []);
      panels.forEach(p => {
        const lossPct = (p.annualTotalPotential > 0)
          ? (p.annualShadedLoss / p.annualTotalPotential) * 100
          : 0;
        p.annualLossPct = Math.round(lossPct * 10) / 10;
        p.annualYieldPct = Math.max(0, Math.round((100 - p.annualLossPct) * 10) / 10);

        const netWh = Math.max(0, p.annualTotalPotential - (p.annualShadedLoss || 0));
        // Generación neta anual en kWh por panel
        p.annualKwh = Math.round((netWh / 1000.0) * pKwp * prSys);
        p.annualTotalInsolation = Math.round(netWh / 1000.0);

        // Rendimiento comparativo relativo al módulo óptimo de la instalación
        const relativeYield = netWh / maxNetWh;
        p.relativeYieldPct = Math.round(relativeYield * 1000) / 10;

        // Gradiente cromático: óptimo en verde, subóptimo en amarillo/naranja, sombra crítica en rojo
        let hexColor = '#10b981';
        if (p.annualLossPct >= 20 || relativeYield < 0.70) hexColor = '#ef4444';
        else if (p.annualLossPct >= 8 || relativeYield < 0.82) hexColor = '#f97316';
        else if (relativeYield < 0.92) hexColor = '#f59e0b';
        p.heatmapColor = { hex: hexColor };

        p.isNormal = p.annualLossPct < 8.0 && relativeYield >= 0.82;
        p.requiresMLPE = p.annualLossPct >= 8.0 || relativeYield < 0.82;
        p.isUnviable = p.annualLossPct >= 25.0 || relativeYield < 0.70;
      });
    });

    // ── Interpolación de paneles no muestreados: heredan del panel muestreado más
    // cercano dentro de su mismo faldón (misma retícula ⇒ sombreado similar) ──
    if (heatmapStride > 1) {
      polylines.forEach(poly => {
        const panels = Array.isArray(poly.panels) ? poly.panels : (poly.roofInfo && Array.isArray(poly.roofInfo.panels) ? poly.roofInfo.panels : []);
        const samples = panels.filter(p => p.heatmapSample && typeof p.annualLossPct === 'number');
        if (samples.length === 0) return;
        panels.forEach(p => {
          if (p.heatmapSample || typeof p.u !== 'number') return;
          let mejor = null, mejorD = Infinity;
          for (const s of samples) {
            const d = (s.u - p.u) * (s.u - p.u) + (s.v - p.v) * (s.v - p.v);
            if (d < mejorD) { mejorD = d; mejor = s; }
          }
          if (mejor) {
            p.annualLossPct = mejor.annualLossPct;
            p.annualYieldPct = mejor.annualYieldPct;
            p.annualKwh = mejor.annualKwh;
            p.relativeYieldPct = mejor.relativeYieldPct;
            p.heatmapColor = mejor.heatmapColor;
            p.annualTotalInsolation = mejor.annualTotalInsolation;
            p.isNormal = mejor.isNormal;
            p.requiresMLPE = mejor.requiresMLPE;
            p.isUnviable = mejor.isUnviable;
            p.heatmapInterpolated = true;
          }
        });
      });
    }

    // 7. Evaluar diagnóstico y actualizar telemetría
    const diag = wpEvaluateMLPENecessity();
    const p2LossBadge = document.getElementById('p2-shading-loss-badge');
    if (p2LossBadge) {
      const affected = (diag.unviablePanelsCount || 0) + (diag.criticalLossPanelsCount || 0);
      if (affected > 0) {
        p2LossBadge.textContent = affected + ' CON SOMBRA';
        p2LossBadge.style.background = 'rgba(239,68,68,0.2)';
        p2LossBadge.style.color = '#F87171';
      } else {
        p2LossBadge.textContent = '0% SOMBRA (OPTIMO)';
        p2LossBadge.style.background = 'rgba(16,185,129,0.2)';
        p2LossBadge.style.color = '#34D399';
      }
    }
    if (diagText) {
      let iconColor = "var(--emerald-400)";
      if (diag.unviablePanelsCount > 0) iconColor = "var(--rose-400)";
      else if (diag.criticalLossPanelsCount > 0) iconColor = "var(--amber-400)";

      diagText.innerHTML = `
        <div style="font-weight:700;color:${iconColor};margin-bottom:4px;">
          ✓ Simulación anual completada (192 instantes${heatmapStride > 1 ? ', muestreo 1 de ' + heatmapStride + ' paneles' : ''} analizados)
        </div>
        <div style="font-size:8.5px;line-height:1.35;color:var(--text-slate-300);">
          ${diag.recommendationMsg}
        </div>
      `;
      if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
    }

    // 8. Ocultar HUDs de carga
    if (typeof hideSolarCalcHUD === 'function') hideSolarCalcHUD();
    if (progressBar) {
      setTimeout(() => { progressBar.style.display = 'none'; }, 1500);
    }

    // 9. Actualizar visuales 3D al modo Heatmap
    if (!window.solarSimState) window.solarSimState = {};
    solarSimState.viewMode = 'heatmap';
    solarSimState.annualHeatmapData = true;
    solarSimState.annualHeatmapDirty = false;

    if (typeof wpFastRenderSimulatedPanels === 'function') {
      await wpFastRenderSimulatedPanels(true);
    }
    if (typeof wpRenderHeatmapVisuals === 'function') {
      wpRenderHeatmapVisuals();
    }
    if (typeof recalculateSolarYield === 'function') {
      recalculateSolarYield();
    }
  }

  // ── 5. EXPORTACIÓN CANÓNICA ───────────────────────────────────────────────
  window.wpUpdatePanelShadingAndMLPE = wpUpdatePanelShadingAndMLPE;
  window.wpEvaluateMLPENecessity = wpEvaluateMLPENecessity;
  let _lastInvalToastTs = 0;
  window.wpInvalidateHeatmap = function(reason) {
    const hasSimState = !!(window.solarSimState && (window.solarSimState.annualHeatmapData || window.solarSimState.viewMode === 'heatmap'));
    // Verificar también si algún panel ya tiene datos de irradiancia calculados
    let hasPanelsCalculated = false;
    if (window.WP && Array.isArray(window.WP.polylines)) {
      hasPanelsCalculated = window.WP.polylines.some(pl => pl.roofInfo && Array.isArray(pl.roofInfo.panels) && pl.roofInfo.panels.some(p => p.annualKwh > 0 || p.annualShadedLoss > 0));
    }
    const hadResults = hasSimState || hasPanelsCalculated;

    if (window.solarSimState) {
      window.solarSimState.annualHeatmapData = null;
      window.solarSimState.annualHeatmapDirty = true;
      window.solarSimState.annualHeatmapInvalidatedAt = Date.now();
    }

    const p2LossBadge = document.getElementById('p2-shading-loss-badge');
    if (p2LossBadge) {
      p2LossBadge.textContent = '⚠ ANÁLISIS OBSOLETO';
      p2LossBadge.style.background = 'rgba(245,158,11,0.2)';
      p2LossBadge.style.color = '#F59E0B';
    }

    const btnHeatmap = document.getElementById('btn-run-annual-heatmap');
    if (btnHeatmap) {
      btnHeatmap.style.borderColor = '#F59E0B';
      btnHeatmap.style.color = '#F59E0B';
      btnHeatmap.innerHTML = '<i data-lucide="refresh-cw" class="icon-sm"></i> ⚠ RECALCULAR MAPA DE CALOR 3D (DATOS OBSOLETOS)';
      if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
    }

    // Avisar visualmente al usuario
    if (typeof window.showToast === 'function' && (Date.now() - _lastInvalToastTs) > 3000) {
      _lastInvalToastTs = Date.now();
      window.showToast('ANÁLISIS SOLAR OBSOLETO', (reason ? reason + '. ' : '') + 'Pulsa en "Recalcular Mapa de Calor" en el Paso 3 para actualizar la irradiancia y sombras.', 'warning', 4000);
    } else if (typeof showStatus === 'function') {
      showStatus('<i data-lucide="alert-triangle" class="icon-sm"></i> ' + (reason ? reason.toUpperCase() + ': ' : '') + 'ANÁLISIS SOLAR DESACTUALIZADO', 2500);
    }
  };

  window.computeAnnualSolarHeatmap = computeAnnualSolarHeatmap;

  if (!window.RA) window.RA = {};
  window.RA.solarHeatmap = {
    update: wpUpdatePanelShadingAndMLPE,
    evaluateMLPE: wpEvaluateMLPENecessity,
    computeHeatmap: computeAnnualSolarHeatmap,
    invalidate: window.wpInvalidateHeatmap
  };

})();
