/**
 * RA — Controlador de Encuadre Dron y Captura de Informe 3D (Extraído de app-main.js · F4-07)
 */
(function(window) {
  "use strict";

// ── Guardia de cámara dron (Fase 4): impedir atravesar el terreno ──
// Clampea la altura de cámara a (terreno DTM + 2.5 m) en cada frame. La colisión
// ── wpEnfoqueDron: encuadre 3/4 tipo dron de los paneles/faldones activos ──
// Esfera envolvente de los paneles renderizados, cámara a pitch -32°, distancia
// 2.5×radio y clamp de altura sobre el terreno.
window.wpEnfoqueDron = function(polyIdx) {
  if (typeof viewer === 'undefined' || !viewer || typeof WP === 'undefined' || !WP) return;
  let targets = [];
  if (typeof polyIdx === 'number' && WP.polylines[polyIdx] && WP.polylines[polyIdx].roofInfo && WP.polylines[polyIdx].roofInfo.panels) {
    targets = WP.polylines[polyIdx].roofInfo.panels;
  } else if (window.allRenderedPanels && window.allRenderedPanels.length > 0) {
    targets = window.allRenderedPanels;
  } else if (WP.polylines.length > 0) {
    targets = WP.polylines.reduce((acc, p) => acc.concat(p.points || []), []);
  }
  if (targets.length === 0) return;
  const positions = targets.map(t => t.center || t).filter(p => p && isFinite(p.x) && isFinite(p.y) && isFinite(p.z));
  if (positions.length === 0) return;
  // centroide manual: BoundingSphere puede fallar con posiciones degeneradas
  let cx = 0, cy = 0, cz = 0, radius = 0;
  positions.forEach(p => { cx += p.x; cy += p.y; cz += p.z; });
  cx /= positions.length; cy /= positions.length; cz /= positions.length;
  const center = new Cesium.Cartesian3(cx, cy, cz);
  positions.forEach(p => { radius = Math.max(radius, Cesium.Cartesian3.distance(p, center)); });
  const cartoC = Cesium.Cartographic.fromCartesian(center);
  if (!cartoC) return;
  // En el motor Google 3D, globe.getHeight devuelve la ELIPSOIDE (0 m): la malla real de
  // edificios está mucho más alta. scene.sampleHeight muestrea la geometría renderizada.
  let groundH = 0;
  try { groundH = viewer.scene.sampleHeight(cartoC, [viewer.camera]); } catch (e) {}
  if (typeof groundH !== 'number' || isNaN(groundH)) {
    try { groundH = viewer.scene.globe.getHeight(cartoC) || 0; } catch (e) { groundH = 0; }
  }
  const range = Math.max(radius * 2.5, 12);
  const pitch = Cesium.Math.toRadians(-32);
  // El DTM no conoce los edificios 3D: el dron vuela a ~0.9×radio sobre el centro
  const camH = cartoC.height + Math.sin(-pitch) * range * 0.55 + range * 0.75;
  const minCamH = groundH + 3.0;
  const bearing = Cesium.Math.toRadians(-40);
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromRadians(
      cartoC.longitude - Math.cos(bearing) * range * 0.000011,
      cartoC.latitude - Math.sin(bearing) * range * 0.000011,
      Math.max(camH, minCamH)),
    orientation: { heading: bearing, pitch: pitch, roll: 0 }
  });
  viewer.scene.requestRender();
  if (typeof showStatus === 'function') showStatus('<i data-lucide="camera" class="icon-sm"></i> VISTA DRON · ' + (typeof polyIdx === 'number' ? 'FALDÓN #' + (polyIdx + 1) : 'PROYECTO'), 2000);
};

// ── wpCapturaInforme (presupuesto): imagen dron realista + vista de irradiación ──
// Captura el canvas WebGL en el mismo tick de render (patrón Cesium), compone una
// leyenda 2D (escala de pérdida, datos del proyecto) y devuelve dataURLs JPEG.
window.wpCapturaInforme = async function() {
  const _conTimeout = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r(null), ms))]);
  let _ratio = 0.63; // proporción real de la composición (alto+leyenda)/ancho
  if (typeof viewer === 'undefined' || !viewer) return null;
  const scene = viewer.scene;
  const capturarCanvas = () => {
    scene.render(); // render síncrono: el buffer está fresco en este tick
    return scene.canvas.toDataURL('image/jpeg', 0.92);
  };
  const componer = (imgDataUrl, modo, extra) => new Promise(resolve => {
    const img = new Image();
    img.onload = () => { try {
      const W = 1280;
      const H = Math.round(W * img.height / img.width);
      const cv = document.createElement('canvas');
      _ratio = (H + 84) / W;
      cv.width = W; cv.height = H + 84;
      const ctx = cv.getContext('2d');
      ctx.drawImage(img, 0, 0, W, H);
      // barra de leyenda inferior
      ctx.fillStyle = 'rgba(10, 15, 30, 0.94)';
      ctx.fillRect(0, H, W, 84);
      const d = extra || {}; // d se calcula fuera del onload (antes fallaba en silencio)
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 26px Inter, sans-serif';
      ctx.fillText('RA · Informe Fotovoltaico — ' + (modo === 'heatmap' ? 'IRRADIACIÓN ANUAL' : 'VISTA DEL PROYECTO'), 24, 34);
      ctx.font = '20px Inter, sans-serif';
      ctx.fillStyle = '#94A3B8';
      const kwp = Number(d.kwp || 0).toFixed(2); // kwp llega como string desde getProjectCalcs
      ctx.fillText((d.numPanels || 0) + ' módulos · ' + kwp + ' kWp · ' + new Date().toLocaleDateString('es-ES'), 24, 62);
      if (modo === 'heatmap') {
        // escala de pérdida anual (verde → ámbar → rojo)
        const gx = W - 470, gy = H + 44;
        const grad = ctx.createLinearGradient(gx, 0, gx + 360, 0);
        grad.addColorStop(0, '#10B981'); grad.addColorStop(0.5, '#F97316'); grad.addColorStop(1, '#EF4444');
        ctx.fillStyle = grad; ctx.fillRect(gx, gy, 360, 16);
        ctx.fillStyle = '#CBD5E1'; ctx.font = '16px Inter, sans-serif';
        ctx.fillText('0%', gx - 8, gy - 6); ctx.fillText('8%', gx + 165, gy - 6); ctx.fillText('≥25% pérdida anual', gx + 330, gy - 6);
      } else {
        ctx.fillStyle = '#CBD5E1'; ctx.font = '16px Inter, sans-serif';
        ctx.fillText('Google 3D Tiles · captura del visor RA', W - 400, H + 52);
      }
      resolve(cv.toDataURL('image/jpeg', 0.9));
      } catch (eComp) { window.__eComp = (eComp && eComp.message) || String(eComp); resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = imgDataUrl;
  });

  const modoPrevio = (typeof solarSimState !== 'undefined' && solarSimState) ? solarSimState.viewMode : 'sol';
  const camPrevia = viewer.camera.positionCartographic.clone();
  const oriPrev = { heading: viewer.camera.heading, pitch: viewer.camera.pitch, roll: viewer.camera.roll };

  // 1. vista realista con encuadre dron
  if (typeof wpEnfoqueDron === 'function') wpEnfoqueDron();
  if (typeof wpSetShadowViewMode === 'function') { try { await _conTimeout(wpSetShadowViewMode('sol'), 4000); } catch (e) {} }
  scene.render();
  const realistaBase = capturarCanvas();

  // 2. vista de irradiación (heatmap)
  if (typeof wpSetShadowViewMode === 'function') { try { await _conTimeout(wpSetShadowViewMode('heatmap'), 4000); } catch (e) {} }
  scene.render();
  const heatBase = capturarCanvas();

  // restaurar
  if (typeof wpSetShadowViewMode === 'function') { try { await _conTimeout(wpSetShadowViewMode(modoPrevio), 4000); } catch (e) {} }
  viewer.camera.setView({ destination: Cesium.Cartographic.toCartesian(camPrevia), orientation: oriPrev });

  const dInfo = (typeof getProjectCalcs === 'function') ? (function() { try { return getProjectCalcs(); } catch (e) { return {}; } })() : {};
  const realista = await componer(realistaBase, 'realista', dInfo);
  const heatmap = await componer(heatBase, 'heatmap', dInfo);
  const ratio = _ratio;
  window.raCapturasInforme = { realista: realista, heatmap: heatmap, ratio: ratio, fecha: new Date().toISOString() };
  return window.raCapturasInforme;
};
})(typeof window !== "undefined" ? window : globalThis);
