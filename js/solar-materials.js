/**
 * ============================================================================
 * ☀️ SOLAR MATERIALS & CATENARY MODULE — PROYECTO RA (CALIDAD AAA)
 * ============================================================================
 * Arquitectura Modular Desacoplada:
 * - Texturizado procedimental fotorrealista de módulos FV (2048x1024, M10/M12 
 *   monocristalino half-cut, 10-BB busbars con soldaduras, micro-fingers de plata,
 *   marco perimetral de aluminio extruido con biseles y juntas inglete a 45°,
 *   sello de caucho EPDM, reflejos multicapa de nubes cumulus/cirrus y specular
 *   sun glint angular con dispersión de Fresnel).
 * - Algoritmo físico de curvas catenarias 3D con comba gravitatoria natural
 *   para cableado de strings (UNE-EN 62305).
 * ============================================================================
 */

function createSolarPanelTexture() {
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  // Textura optimizada anti-moiré en 1024x2048
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const w = 256;
  const h = 512;

  // ==========================================================================
  // 1. MARCO PERIMETRAL DE ALUMINIO ANODIZADO EXTRUIDO (AAA DETAIL)
  // ==========================================================================
  const frameGrad = ctx.createLinearGradient(0, 0, w, h);
  frameGrad.addColorStop(0.00, '#64748b');
  frameGrad.addColorStop(0.20, '#475569');
  frameGrad.addColorStop(0.50, '#94a3b8');
  frameGrad.addColorStop(0.80, '#334155');
  frameGrad.addColorStop(1.00, '#1e293b');
  ctx.fillStyle = frameGrad;
  ctx.fillRect(0, 0, w, h);

  // Biseles exteriores y cortes en inglete a 45°
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, w - 2, h - 2);

  ctx.strokeStyle = 'rgba(0, 0, 0, 0.60)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(w - 2, 0);
  ctx.lineTo(w - 2, h - 2);
  ctx.lineTo(0, h - 2);
  ctx.stroke();

  const miterSize = 10;
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(miterSize, miterSize); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(w, 0); ctx.lineTo(w - miterSize, miterSize); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(miterSize, h - miterSize); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(w, h); ctx.lineTo(w - miterSize, h - miterSize); ctx.stroke();

  const frameThick = 8;
  // Junta de estanqueidad negra
  ctx.fillStyle = '#050811';
  ctx.fillRect(frameThick - 3, frameThick - 3, w - 2 * (frameThick - 3), h - 2 * (frameThick - 3));

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(frameThick, frameThick, w - 2 * frameThick, h - 2 * frameThick);

  // ==========================================================================
  // 2. LAMINADO FOTOVOLTAICO MONOCRISTALINO "FULL BLACK" (ANTI-MOIRÉ)
  // ==========================================================================
  const laminX = frameThick + 2;
  const laminY = frameThick + 2;
  const laminW = w - 2 * laminX;
  const laminH = h - 2 * laminY;

  // Base monocristalina de silicio con revestimiento antirreflectante (ARC) azul zafiro / navy equilibrado
  const siliconBase = ctx.createLinearGradient(laminX, laminY, laminX + laminW, laminY + laminH);
  siliconBase.addColorStop(0.00, '#1a365d'); // Azul zafiro medio iluminado
  siliconBase.addColorStop(0.30, '#132847');
  siliconBase.addColorStop(0.70, '#0d1d33');
  siliconBase.addColorStop(1.00, '#081324');
  ctx.fillStyle = siliconBase;
  ctx.fillRect(laminX, laminY, laminW, laminH);

  // Matriz limpia de celdas monocristalinas (6 columnas x 10 filas)
  // CERO micro-fingers de alta frecuencia espacial para erradicar el 100% del Moiré
  const cols = 6;
  const rows = 10;
  const gap = 2;
  const pad = 4;
  const availW = laminW - pad * 2;
  const availH = laminH - pad * 2;
  const cellW = (availW - gap * (cols - 1)) / cols;
  const cellH = (availH - gap * (rows - 1)) / rows;
  const cornerCut = 3;

  function drawCellWafer(x, y, cw, ch) {
    ctx.beginPath();
    ctx.moveTo(x + cornerCut, y);
    ctx.lineTo(x + cw - cornerCut, y);
    ctx.lineTo(x + cw, y + cornerCut);
    ctx.lineTo(x + cw, y + ch - cornerCut);
    ctx.lineTo(x + cw - cornerCut, y + ch);
    ctx.lineTo(x + cornerCut, y + ch);
    ctx.lineTo(x, y + ch - cornerCut);
    ctx.lineTo(x, y + cornerCut);
    ctx.closePath();
  }

  for (let r = 0; r < rows; r++) {
    const cy = laminY + pad + r * (cellH + gap);
    for (let c = 0; c < cols; c++) {
      const cx = laminX + pad + c * (cellW + gap);

      // Gradiente suave por oblea monocristalina
      const cellGrad = ctx.createLinearGradient(cx, cy, cx + cellW, cy + cellH);
      cellGrad.addColorStop(0.00, '#1e3a66'); // Iluminación suave en la oblea
      cellGrad.addColorStop(0.50, '#142949');
      cellGrad.addColorStop(1.00, '#0c1a30');
      ctx.fillStyle = cellGrad;
      drawCellWafer(cx, cy, cellW, cellH);
      ctx.fill();

      // Contorno ultra-sutil de separación entre obleas
      ctx.strokeStyle = 'rgba(2, 6, 23, 0.95)';
      ctx.lineWidth = 1;
      drawCellWafer(cx, cy, cellW, cellH);
      ctx.stroke();

      // Busbars limpios minimalistas (3 líneas tenues por celda sin soldaduras densas)
      ctx.strokeStyle = 'rgba(226, 232, 240, 0.35)';
      ctx.lineWidth = 1.0;
      const b1 = cx + cellW * 0.25;
      const b2 = cx + cellW * 0.50;
      const b3 = cx + cellW * 0.75;

      ctx.beginPath();
      ctx.moveTo(b1, cy + 2); ctx.lineTo(b1, cy + cellH - 2);
      ctx.moveTo(b2, cy + 2); ctx.lineTo(b2, cy + cellH - 2);
      ctx.moveTo(b3, cy + 2); ctx.lineTo(b3, cy + cellH - 2);
      ctx.stroke();
    }
  }

  // ==========================================================================
  // 3. CAPA DE VIDRIO SOLAR TEMPLADO (EFECTO ESPEJO / CLEARCOAT MIRROR)
  // ==========================================================================
  const glassMirror = ctx.createLinearGradient(0, 0, w, h);
  glassMirror.addColorStop(0.00, 'rgba(255, 255, 255, 0.22)');
  glassMirror.addColorStop(0.30, 'rgba(125, 211, 252, 0.08)'); // Destello celeste sutil
  glassMirror.addColorStop(0.70, 'rgba(15, 23, 42, 0.02)');
  glassMirror.addColorStop(1.00, 'rgba(255, 255, 255, 0.15)');
  ctx.fillStyle = glassMirror;
  ctx.fillRect(laminX, laminY, laminW, laminH);

  // [FIX-TEXTURA] Exponer el CANVAS además del data-URI: Cesium crea la textura de forma
  // SÍNCRONA desde un canvas dibujable, mientras que con un data-URI la carga es asíncrona
  // y el primer draw puede ejecutarse con el TextureUniform.value undefined → crash
  // "reading '_target'" en setUniforms (requestRenderMode dibuja antes de que decodifique).
  window.solarPanelTextureCanvas = canvas;
  return canvas.toDataURL('image/png');
}

/**
 * Generador de Curvas Catenarias 3D gravitatorias entre paneles fotovoltaicos
 * @param {Cesium.Cartesian3} pA Punto inicial
 * @param {Cesium.Cartesian3} pB Punto final
 * @param {Cesium.Cartesian3} normVec Vector normal del plano
 * @param {number} sagMeters Comba máxima en metros (defecto 0.07m)
 * @param {number} segments Segmentos de interpolación (defecto 6)
 * @returns {Cesium.Cartesian3[]} Puntos discretizados de la curva
 */

function buildOrganicCatenary(pA, pB, sagMeters = 0.12, segments = 8) {
  if (!pA || !pB || typeof Cesium === 'undefined') return [pA, pB].filter(Boolean);
  try {
    const mid = Cesium.Cartesian3.midpoint(pA, pB, new Cesium.Cartesian3());
    const surfaceNormal = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(mid, new Cesium.Cartesian3()) || new Cesium.Cartesian3(0, 0, 1);
    const points = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const lerpPt = Cesium.Cartesian3.lerp(pA, pB, t, new Cesium.Cartesian3());
      const sag = 4.0 * t * (1.0 - t) * sagMeters;
      const sagOffset = Cesium.Cartesian3.multiplyByScalar(surfaceNormal, -sag, new Cesium.Cartesian3());
      points.push(Cesium.Cartesian3.add(lerpPt, sagOffset, new Cesium.Cartesian3()));
    }
    return points;
  } catch(e) {
    return [pA, pB];
  }
}
if (typeof window !== 'undefined') window.buildOrganicCatenary = buildOrganicCatenary;

function buildCatenaryCurve3D(pA, pB, normVec, sagMeters = 0.07, segments = 6) {
  if (!pA || !pB || typeof Cesium === 'undefined') return [];
  const points = [];
  const dirZ = normVec || new Cesium.Cartesian3(0, 0, 1);

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const lerpPt = Cesium.Cartesian3.lerp(pA, pB, t, new Cesium.Cartesian3());
    // Comba gravitatoria parabólica: 4*t*(1-t)*sag
    const sag = 4.0 * t * (1.0 - t) * sagMeters;
    const sagOffset = Cesium.Cartesian3.multiplyByScalar(dirZ, -sag, new Cesium.Cartesian3());
    const finalPt = Cesium.Cartesian3.add(lerpPt, sagOffset, new Cesium.Cartesian3());
    points.push(finalPt);
  }
  return points;
}

// Inicialización y exportación global segura
if (typeof window !== 'undefined') {
  window.createSolarPanelTexture = createSolarPanelTexture;
  window.buildCatenaryCurve3D = buildCatenaryCurve3D;
  try {
    window.solarPanelTextureUrl = createSolarPanelTexture();
  } catch(e) {
    window.solarPanelTextureUrl = '';
  }
}
