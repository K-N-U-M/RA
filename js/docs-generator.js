'use strict';

function openDocModal() {
  const m = document.getElementById('ra-doc-modal');
  if (m) m.classList.add('open');
  if (typeof document !== 'undefined') {
    const munInput = document.getElementById('doc-mun');
    const provInput = document.getElementById('doc-prov');
    if (munInput && provInput && (!munInput.value || munInput.value === 'Madrid') && window.solarProjectConfig && window.solarProjectConfig.address) {
      const parts = window.solarProjectConfig.address.split(',').map(s => s.trim());
      if (parts.length >= 2) {
        munInput.value = parts[0];
        provInput.value = parts[1];
      } else if (parts.length === 1 && parts[0]) {
        munInput.value = parts[0];
      }
    }
  }
  showStatus('MÓDULO DE DOCUMENTACIÓN TÉCNICA PV ABIERTO', 2000);
}
function closeDocModal() {
  const m = document.getElementById('ra-doc-modal');
  if (m) m.classList.remove('open');
}

// [B4] Bloquea la entrega (PDF) si la simulación anual está en curso o si la geometría
// cambió desde el último mapa de calor válido (evita emitir documentos con cifras caducas).
function raEnsureAnalysisReadyForDoc() {
  const ss = (typeof window !== 'undefined') ? window.solarSimState : null;
  if (ss && ss.isCalculatingHeatmap) {
    if (typeof showToast === 'function') showToast('ANÁLISIS EN CURSO', 'La simulación anual está calculándose. Espera a que termine antes de generar documentos.', 'warning', 5000);
    return false;
  }
  const hasPanels = (typeof window !== 'undefined' && Array.isArray(window.allRenderedPanels) && window.allRenderedPanels.some(p => p && !p.deleted && !p.disabled));
  if (ss && ss.annualHeatmapDirty && (ss.annualHeatmapData || hasPanels)) {
    if (typeof showToast === 'function') showToast('ANÁLISIS OBSOLETO', 'La cubierta o los obstáculos cambiaron desde el último mapa de calor. Recalcula en el Paso 3 antes de generar documentos para evitar cifras caducas.', 'warning', 6000);
    return false;
  }
  return true;
}

// [B6] Devuelve el reparto mensual real (12 kWh) de la simulación si está disponible y es válido.
function raGetSimulatedMonthlyKwh() {
  const ss = (typeof window !== 'undefined') ? window.solarSimState : null;
  if (!ss || ss.annualHeatmapDirty) return null;
  const mk = ss.monthlyKwh;
  if (!Array.isArray(mk) || mk.length !== 12) return null;
  if (!mk.some(v => typeof v === 'number' && v > 0)) return null;
  return mk;
}

function escapeHtml(str) {
  if (typeof window !== 'undefined' && window.RASanitize && typeof window.RASanitize.plain === 'function') {
    return window.RASanitize.plain(str);
  }
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
if (typeof window !== 'undefined' && !window.escapeHtml) {
  window.escapeHtml = escapeHtml;
}

function readTitular() {
  const g = (id, def) => (document.getElementById(id) || {value: def || ''}).value || def || '';
  return {
    nombre:    escapeHtml(g('doc-nombre', 'Titular de la Instalación')),
    nif:       escapeHtml(g('doc-nif',    'XXXXXXXXX')),
    tel:       escapeHtml(g('doc-tel',    '')),
    email:     escapeHtml(g('doc-email',  '')),
    dir:       escapeHtml(g('doc-dir',    '')),
    mun:       escapeHtml(g('doc-mun',    '')),
    prov:      escapeHtml(g('doc-prov',   '')),
    cp:        escapeHtml(g('doc-cp',     '')),
    cups:      escapeHtml(g('doc-cups',   'ES00210000XXXXXXXXXX')),
    potContr:  parseFloat(g('doc-potcontr', '5.75')) || 5.75,
    dist:      escapeHtml(g('doc-dist',   'e-distribución (Endesa)')),
    modalidad: escapeHtml(g('doc-modalidad', 'sin')),
    tecnico:   escapeHtml(g('doc-tecnico',   'Técnico Proyectista')),
    titulacion:escapeHtml(g('doc-titulacion','Ingeniero Industrial')),
    ncol:      escapeHtml(g('doc-ncol',      'XXXXX'))
  };
}

function _docGetProjectCalcs() {
  if (typeof RA !== 'undefined' && RA.ProjectCalcs && typeof RA.ProjectCalcs.getProjectCalcs === 'function') {
    return RA.ProjectCalcs.getProjectCalcs();
  }
  if (typeof window !== 'undefined' && typeof window._canonicalGetProjectCalcs === 'function') {
    return window._canonicalGetProjectCalcs();
  }
  if (typeof window !== 'undefined' && typeof window.getProjectCalcs === 'function') {
    return window.getProjectCalcs();
  }
  if (typeof window !== 'undefined' && window.RA && window.RA.log) {
    window.RA.log.warn('_docGetProjectCalcs: motor canónico no disponible aún');
  }
  return {
    numPanels: 0, monthly: [], annualKWh: 0, hspAnual: 0, kwp: 0,
    cfg: { potencia: 450, largo: 2.10, ancho: 1.05, modelo: '—' },
    tit: (typeof readTitular === 'function') ? readTitular() : {},
    fechaStr: '', refNum: ''
  };
}
// ── Helper: generar PDF o ventana imprimible ──────────────────────────────────────────
// ============================================================================
// SUITE DE DOCUMENTACIÓN: OPENDOC / WORD (.DOC), PDF VECTORIAL Y EDICIÓN EN VIVO
// ============================================================================

function docWindow(title, body, opt) {
  const safeTitle = escapeHtml(title);
  const safeFileBase = String(title || 'documento').replace(/[^a-z0-9_\-\.]/gi, '_');
  const htmlContent = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>${safeTitle}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,200..800&family=Comfortaa:wght@300;400;600;700&family=DM+Sans:ital,opsz,wght@0,9..40,400..700;1,9..40,400..700&family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700;800&family=Montserrat:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,700&family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 10pt; color: #1e293b; background: #f8fafc; line-height: 1.6; padding-top: 54px; }
    @page { size: A4 portrait; margin: 12mm 14mm 12mm 14mm; }
    *, *::before, *::after { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .doc-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0d2b45; padding-bottom: 12px; margin-bottom: 16px; }
    .doc-header-left { display: flex; align-items: center; gap: 12px; }
    .doc-logo-box { display: flex; align-items: center; gap: 10px; }
    .doc-logo-icon { font-size: 26pt; }
    .doc-logo-title { font-size: 13pt; font-weight: 900; color: #0d2b45; letter-spacing: -0.3px; }
    .doc-logo-sub { font-size: 8pt; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
    .doc-header-right { text-align: right; font-size: 8pt; color: #475569; border: 1px solid #cbd5e1; padding: 6px 10px; min-width: 170px; background: #f8fafc; border-radius: 4px; }
    .doc-meta-item { line-height: 1.4; }
    .doc-section-title { font-size: 10.5pt; font-weight: 800; color: #0d2b45; border-left: 4px solid #3b82f6; padding-left: 8px; margin: 16px 0 8px; text-transform: uppercase; letter-spacing: 0.3px; }
    .doc-box { border: 1px solid #e2e8f0; border-radius: 4px; padding: 10px 12px; background: #f8fafc; margin-bottom: 12px; font-size: 8.5pt; }
    .doc-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .doc-grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
    .doc-grid-span2 { grid-column: span 2; }
    .kpi-card { border: 1px solid #cbd5e1; background: #ffffff; border-radius: 4px; padding: 8px; text-align: center; }
    .kpi-val { font-size: 13pt; font-weight: 900; color: #0d2b45; }
    .kpi-lbl { font-size: 7.5pt; color: #64748b; text-transform: uppercase; font-weight: 700; margin-top: 2px; }
    .doc-table { width: 100%; border-collapse: collapse; margin: 8px 0 14px; font-size: 8.5pt; }
    .trow-total td { background: #eff6ff !important; font-weight: 800; }
    @media print {
      body { background: #fff; padding-top: 0; }
      .doc-top-bar { display: none !important; }
      .doc-sheet { box-shadow: none !important; margin: 0 !important; padding: 0 !important; width: 100% !important; border-radius: 0 !important; }
      .no-print { display: none !important; }
      thead { display: table-header-group; }
      tr, .sig-row, .dcard, .info, .warn, .doc-chart-box { page-break-inside: avoid; break-inside: avoid; }
      h1, h2, h3 { page-break-after: avoid; break-after: avoid; }
    }
    .doc-top-bar { position: fixed; top: 0; left: 0; right: 0; height: 50px; background: #0f172a; color: #fff; display: flex; align-items: center; justify-content: space-between; padding: 0 20px; z-index: 99999; box-shadow: 0 4px 20px rgba(0,0,0,0.3); border-bottom: 2px solid #f59e0b; }
    .doc-bar-title { font-weight: 800; font-size: 12px; color: #f8fafc; letter-spacing: 0.5px; display: flex; align-items: center; gap: 8px; }
    .doc-bar-title span { color: #f59e0b; font-family: monospace; font-size: 11px; }
    .doc-bar-btns { display: flex; gap: 8px; align-items: center; }
    .doc-btn { border: none; border-radius: 6px; padding: 7px 14px; font-size: 11px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: all 0.15s ease; }
    .doc-btn-print { background: #10b981; color: #fff; }
    .doc-btn-print:hover { background: #059669; }
    .doc-btn-word { background: #2563eb; color: #fff; }
    .doc-btn-word:hover { background: #1d4ed8; }
    .doc-btn-html { background: #475569; color: #fff; }
    .doc-btn-html:hover { background: #334155; }
    .doc-btn-edit { background: #f59e0b; color: #000; }
    .doc-btn-edit:hover { background: #d97706; }
    .doc-btn-close { background: #ef4444; color: #fff; }
    .doc-btn-close:hover { background: #dc2626; }
    .doc-sheet { width: 840px; margin: 25px auto; background: #fff; padding: 45px 50px; box-shadow: 0 10px 35px rgba(0,0,0,0.08); border-radius: 6px; }
    h1 { font-size: 15pt; color: #0d2b45; border-bottom: 3px solid #3b82f6; padding-bottom: 6px; margin-bottom: 14px; }
    h2 { font-size: 12pt; color: #0d2b45; border-left: 4px solid #f59e0b; padding-left: 10px; margin: 20px 0 8px; text-transform: uppercase; letter-spacing: 0.5px; }
    h3 { font-size: 10.5pt; color: #334155; margin: 14px 0 6px; font-weight: 700; }
    p { margin: 4px 0 8px; text-align: justify; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0 16px; font-size: 9pt; }
    th { background: #0d2b45; color: #fff; padding: 6px 8px; text-align: left; font-size: 8.5pt; font-weight: 700; }
    td { padding: 5px 8px; border: 1px solid #e2e8f0; vertical-align: top; }
    tr:nth-child(even) td { background: #f8fafc; }
    .hdr { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 20px; padding-bottom: 12px; border-bottom: 2px solid #0d2b45; }
    .hdr-l p { font-size: 8.5pt; color: #64748b; margin: 2px 0 0; }
    .hdr-r { text-align: right; font-size: 8pt; color: #475569; border: 1px solid #cbd5e1; padding: 8px 12px; min-width: 180px; background: #f8fafc; border-radius: 4px; }
    .hdr-r strong { color: #0f172a; display: block; font-size: 10.5pt; margin-bottom: 2px; }
    .badge { display: inline-block; background: #3b82f6; color: #fff; font-size: 8.5pt; font-weight: 800; padding: 3px 10px; margin-bottom: 6px; letter-spacing: 1px; border-radius: 3px; }
    .info { background: #eff6ff; border: 1px solid #93c5fd; border-left: 4px solid #3b82f6; padding: 8px 12px; margin: 10px 0; font-size: 9pt; border-radius: 2px; }
    .warn { background: #fefce8; border: 1px solid #fcd34d; border-left: 4px solid #f59e0b; padding: 8px 12px; margin: 10px 0; font-size: 9pt; border-radius: 2px; }
    .dgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 10px 0; }
    .dcard { border: 1px solid #e2e8f0; padding: 8px 12px; border-radius: 4px; background: #f8fafc; }
    .dcard label { font-size: 7.5pt; color: #64748b; display: block; text-transform: uppercase; font-weight: 600; }
    .dcard value { font-size: 11pt; font-weight: 800; color: #0f172a; display: block; margin-top: 2px; }
    .trow-total td { font-weight: 800; background: #eff6ff !important; border-top: 2px solid #3b82f6; }
    .trow-grand td { font-weight: 900; background: #0d2b45 !important; color: #fff; font-size: 11pt; }
    .sig-row { display: flex; justify-content: space-between; margin-top: 40px; gap: 25px; }
    .sig { border-top: 1px dashed #94a3b8; padding-top: 8px; font-size: 8.5pt; text-align: center; flex: 1; }
    .footer { margin-top: 25px; padding-top: 10px; border-top: 1px solid #e2e8f0; font-size: 7.5pt; color: #94a3b8; text-align: center; }

    /* ── BARRA FLOTANTE DE FORMATO Y ESTILOS DE EDICIÓN AVANZADA ── */
    #doc-format-toolbar {
      position: fixed;
      display: none;
      background: #0f172a;
      border: 1px solid #334155;
      box-shadow: 0 10px 25px rgba(0,0,0,0.4);
      border-radius: 8px;
      padding: 5px 8px;
      z-index: 100000;
      align-items: center;
      gap: 6px;
      font-family: system-ui, sans-serif;
    }
    #doc-format-toolbar button, #doc-format-toolbar select {
      background: #1e293b;
      border: 1px solid #475569;
      color: #fff;
      border-radius: 4px;
      padding: 3px 7px;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
      outline: none;
    }
    #doc-format-toolbar button:hover {
      background: #334155;
    }
    #doc-format-toolbar input[type="color"] {
      width: 24px;
      height: 22px;
      padding: 0;
      border: 1px solid #475569;
      border-radius: 4px;
      cursor: pointer;
      background: transparent;
    }
    .doc-img-resizable {
      position: relative;
      display: inline-block;
      max-width: 100%;
      margin: 10px 0;
      user-select: none;
    }
    .doc-img-resizable img {
      width: 100%;
      height: auto;
      display: block;
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }
    .doc-img-handle-del {
      position: absolute;
      top: 6px;
      right: 6px;
      background: #ef4444;
      color: #fff;
      border: none;
      border-radius: 50%;
      width: 22px;
      height: 22px;
      font-size: 11px;
      font-weight: 900;
      cursor: pointer;
      display: none;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    }
    .doc-img-resizable:hover .doc-img-handle-del {
      display: flex;
    }
    .ra-draggable-block {
      position: relative;
      transition: background-color 0.2s, outline 0.2s;
    }
    .mode-edit-layout .ra-draggable-block {
      outline: 1px dashed rgba(59, 130, 246, 0.4);
      outline-offset: 4px;
      margin-bottom: 8px;
    }
    .mode-edit-layout .ra-draggable-block:hover {
      outline: 2px dashed #3b82f6;
      background-color: rgba(59, 130, 246, 0.03);
    }
    .ra-block-del-btn {
      position: absolute;
      top: 0px;
      right: 0px;
      background: #ef4444;
      color: #fff;
      border: none;
      border-radius: 4px;
      width: 20px;
      height: 20px;
      font-size: 11px;
      font-weight: 900;
      cursor: pointer;
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 100;
    }
    .mode-edit-layout .ra-draggable-block:hover .ra-block-del-btn {
      display: flex;
    }
    .ra-block-drag-handle {
      position: absolute;
      top: 0px;
      left: -24px;
      background: #3b82f6;
      color: #fff;
      border-radius: 4px;
      width: 20px;
      height: 20px;
      font-size: 12px;
      display: none;
      align-items: center;
      justify-content: center;
      cursor: grab;
      z-index: 100;
    }
    .mode-edit-layout .ra-draggable-block:hover .ra-block-drag-handle {
      display: flex;
    }
  </style>
</head>
<body>
  <!-- BARRA FLOTANTE DE FORMATO -->
  <div id="doc-format-toolbar" class="no-print">
    <select id="fmt-font" onchange="applyDocFormat('fontName', this.value)" title="Tipografía">
      <option value="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif">Sistema / Sans</option>
      <option value="Inter, system-ui, sans-serif">Inter</option>
      <option value="'Comfortaa', cursive, sans-serif">Comfortaa (Redondeada)</option>
      <option value="Roboto, sans-serif">Roboto</option>
      <option value="'Space Grotesk', sans-serif">Space Grotesk</option>
      <option value="Georgia, serif">Georgia</option>
      <option value="'Courier New', monospace">Monospace</option>
    </select>
    <select id="fmt-size" onchange="applyDocFormat('fontSize', this.value)" title="Tamaño">
      <option value="2">Pequeño (10pt)</option>
      <option value="3" selected>Normal (12pt)</option>
      <option value="4">Medio (14pt)</option>
      <option value="5">Título H3 (18pt)</option>
      <option value="6">Título H2 (24pt)</option>
    </select>
    <button type="button" onclick="applyDocFormat('bold')" title="Negrita"><b>B</b></button>
    <button type="button" onclick="applyDocFormat('italic')" title="Cursiva"><i>I</i></button>
    <button type="button" onclick="applyDocFormat('underline')" title="Subrayado"><u>U</u></button>
    <button type="button" onclick="applyDocFormat('strikeThrough')" title="Tachado"><s>S</s></button>
    <input type="color" id="fmt-color" onchange="applyDocFormat('foreColor', this.value)" title="Color del texto" value="#0f172a">
    <button type="button" onclick="applyDocFormat('justifyLeft')" title="Alinear Izquierda">⇤</button>
    <button type="button" onclick="applyDocFormat('justifyCenter')" title="Centrar">≡</button>
    <button type="button" onclick="applyDocFormat('justifyRight')" title="Alinear Derecha">⇥</button>
  </div>

  <div class="doc-top-bar no-print">
    <div class="doc-bar-title"><span>DOCUMENTACIÓN FV</span> ${safeTitle}</div>
    <div class="doc-bar-btns">
      <input type="file" id="doc-img-upload-input" accept="image/png,image/jpeg,image/webp,image/gif" style="display:none;" onchange="handleDocImageInsert(this)">
      <button class="doc-btn" style="background:#0284c7;color:#fff;" onclick="triggerDocImageUpload()" title="Añadir una imagen desde tu equipo">🖼️ AÑADIR IMAGEN</button>
      <button class="doc-btn" style="background:#8b5cf6;color:#fff;" onclick="capture3DViewToDoc()" title="Capturar la vista 3D actual del proyecto e insertarla aquí">📸 CAPTURAR VISTA 3D</button>
      <button class="doc-btn doc-btn-edit" id="btn-edit-toggle" onclick="toggleEditMode()">✏️ MODO EDICIÓN</button>
      <button class="doc-btn doc-btn-print" onclick="window.print()">🖨 IMPRIMIR / PDF</button>
      <button class="doc-btn doc-btn-word" id="btn-doc-docx" onclick="exportToWordDocx()" title="Descargar documento Word (.docx) con maquetación e imágenes completas">📝 WORD (.DOCX)</button>
      <button class="doc-btn doc-btn-html" onclick="exportToHtml()">🌐 DESCARGAR HTML</button>
      <button class="doc-btn doc-btn-close" onclick="window.close()">✕</button>
    </div>
  </div>

  <div class="doc-sheet" id="editable-doc-sheet">
    ${body}
  </div>

  <script>
    let _activeDragBlock = null;

    function applyDocFormat(cmd, val) {
      document.execCommand(cmd, false, val || null);
    }

    function triggerDocImageUpload() {
      const input = document.getElementById('doc-img-upload-input');
      if (input) input.click();
    }

    function _docNotify(msg) {
      try {
        const ow = (window.opener && !window.opener.closed) ? window.opener : ((window.parent && window.parent !== window) ? window.parent : null);
        if (ow && typeof ow.raAlert === 'function') { ow.raAlert(msg); return; }
      } catch (_) {}
      const n = document.createElement('div');
      n.setAttribute('role', 'status');
      n.style.cssText = 'position:fixed;top:14px;right:14px;z-index:999999;background:#0f172a;color:#fff;padding:10px 14px;border-radius:8px;font-size:12px;box-shadow:0 8px 24px rgba(0,0,0,0.4);max-width:360px;';
      n.textContent = msg;
      document.body.appendChild(n);
      setTimeout(function() { if (n.parentNode) n.parentNode.removeChild(n); }, 4500);
    }

    function _docConfirmAsync(msg) {
      try {
        const ow = (window.opener && !window.opener.closed) ? window.opener : ((window.parent && window.parent !== window) ? window.parent : null);
        if (ow && typeof ow.raConfirmAsync === 'function') return ow.raConfirmAsync(msg, 'Confirmar');
      } catch (_) {}
      return new Promise(function(res) {
        const ov = document.createElement('div');
        ov.style.cssText = 'position:fixed;inset:0;background:rgba(2,6,23,0.75);z-index:999999;display:flex;align-items:center;justify-content:center;';
        ov.innerHTML = '<div style="background:#0f172a;color:#fff;padding:18px;border-radius:10px;max-width:360px;font-family:sans-serif;"><div style="font-size:13px;margin-bottom:14px;"></div><div style="display:flex;justify-content:flex-end;gap:8px;"><button type="button" data-c="0" style="padding:6px 12px;border-radius:6px;border:1px solid #475569;background:#1e293b;color:#fff;cursor:pointer;">Cancelar</button><button type="button" data-c="1" style="padding:6px 12px;border-radius:6px;border:none;background:#059669;color:#fff;font-weight:700;cursor:pointer;">Eliminar</button></div></div>';
        ov.firstChild.firstChild.textContent = msg;
        ov.querySelector('[data-c="0"]').onclick = function() { ov.remove(); res(false); };
        ov.querySelector('[data-c="1"]').onclick = function() { ov.remove(); res(true); };
        document.body.appendChild(ov);
      });
    }

    function handleDocImageInsert(input) {
      if (!input.files || !input.files[0]) return;
      const file = input.files[0];
      if (!/^image\/(png|jpeg|jpg|webp|gif)$/i.test(file.type || '')) {
        _docNotify('Formato no permitido. Usa únicamente imágenes PNG, JPG, WebP o GIF.');
        input.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = function(e) {
        insertImageIntoDoc(e.target.result, file.name);
      };
      reader.readAsDataURL(file);
      input.value = '';
    }

    function capture3DViewToDoc() {
      try {
        let canvas = null;
        if (window.opener) {
          if (window.opener.viewer && window.opener.viewer.scene && window.opener.viewer.scene.canvas) {
            window.opener.viewer.scene.render();
            canvas = window.opener.viewer.scene.canvas;
          } else {
            const el = window.opener.document.querySelector('canvas');
            if (el) canvas = el;
          }
        }
        if (canvas) {
          const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
          insertImageIntoDoc(dataUrl, 'Captura 3D del Proyecto');
        } else {
          _docNotify('No se pudo acceder al lienzo 3D de la ventana principal. Asegúrate de tener la ventana del proyecto abierta.');
        }
      } catch (err) {
        console.warn('Error capturando vista 3D:', err);
        _docNotify('Error capturando el lienzo 3D: ' + err.message);
      }
    }

    function insertImageIntoDoc(dataUrl, altText) {
      const s = String(dataUrl || '').trim();
      if (!/^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(s)) {
        _docNotify('Imagen inválida o formato no soportado.');
        return;
      }
      const wrapper = document.createElement('div');
      wrapper.className = 'doc-img-resizable ra-draggable-block';
      wrapper.setAttribute('draggable', 'true');
      wrapper.style.width = '100%';
      const img = document.createElement('img');
      img.src = s;
      img.alt = altText || 'Imagen';
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'doc-img-handle-del no-print';
      delBtn.title = 'Eliminar imagen';
      delBtn.textContent = '✕';
      delBtn.onclick = function() { if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper); };
      wrapper.appendChild(img);
      wrapper.appendChild(delBtn);
      
      const sheet = document.getElementById('editable-doc-sheet');
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && sheet.contains(sel.anchorNode)) {
        const range = sel.getRangeAt(0);
        range.insertNode(wrapper);
      } else {
        sheet.appendChild(wrapper);
      }
      setupDraggableBlocks();
    }

    function setupDraggableBlocks() {
      const sheet = document.getElementById('editable-doc-sheet');
      if (!sheet) return;
      const candidates = sheet.querySelectorAll('.doc-box, .doc-grid-4, .doc-table, .doc-section-title, .doc-img-resizable, .kpi-card');
      candidates.forEach(el => {
        if (el.hasAttribute('data-has-drag')) return;
        el.setAttribute('data-has-drag', 'true');
        el.classList.add('ra-draggable-block');

        // Botón de eliminar bloque
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'ra-block-del-btn no-print';
        delBtn.title = 'Eliminar este bloque';
        delBtn.innerHTML = '✕';
        delBtn.onclick = async function(ev) {
          ev.stopPropagation();
          if (await _docConfirmAsync('¿Eliminar este bloque del presupuesto?')) {
            el.remove();
          }
        };
        el.appendChild(delBtn);

        // Tirador de arrastre
        const handle = document.createElement('div');
        handle.className = 'ra-block-drag-handle no-print';
        handle.title = 'Arrastra para mover este bloque arriba o abajo';
        handle.innerHTML = '⠿';
        el.appendChild(handle);

        el.setAttribute('draggable', 'true');

        el.addEventListener('dragstart', function(ev) {
          if (!document.body.classList.contains('mode-edit-layout')) {
            ev.preventDefault();
            return;
          }
          _activeDragBlock = el;
          ev.dataTransfer.effectAllowed = 'move';
          try { ev.dataTransfer.setData('text/plain', ''); } catch(e) {}
          el.style.opacity = '0.4';
        });

        el.addEventListener('dragend', function() {
          if (_activeDragBlock) _activeDragBlock.style.opacity = '1';
          _activeDragBlock = null;
        });

        el.addEventListener('dragover', function(ev) {
          if (!document.body.classList.contains('mode-edit-layout') || !_activeDragBlock || _activeDragBlock === el) return;
          ev.preventDefault();
          ev.dataTransfer.dropEffect = 'move';
        });

        el.addEventListener('drop', function(ev) {
          if (!document.body.classList.contains('mode-edit-layout') || !_activeDragBlock || _activeDragBlock === el) return;
          ev.preventDefault();
          ev.stopPropagation();
          const parent = el.parentNode;
          if (!parent) return;
          const rect = el.getBoundingClientRect();
          const next = (ev.clientY - rect.top) > (rect.height / 2);
          parent.insertBefore(_activeDragBlock, next ? el.nextSibling : el);
        });
      });
    }

    // Manejo de selección para barra flotante de formato
    document.addEventListener('selectionchange', function() {
      const tb = document.getElementById('doc-format-toolbar');
      if (!tb || !document.body.classList.contains('mode-edit-layout')) {
        if (tb) tb.style.display = 'none';
        return;
      }
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) {
        tb.style.display = 'none';
        return;
      }
      const range = sel.getRangeAt(0);
      const sheet = document.getElementById('editable-doc-sheet');
      if (!sheet || !sheet.contains(range.commonAncestorContainer)) {
        tb.style.display = 'none';
        return;
      }
      const rect = range.getBoundingClientRect();
      if (rect.width === 0) {
        tb.style.display = 'none';
        return;
      }
      tb.style.display = 'flex';
      tb.style.left = Math.max(10, Math.min(window.innerWidth - 380, rect.left + window.scrollX + (rect.width / 2) - 180)) + 'px';
      tb.style.top = Math.max(54, rect.top + window.scrollY - 44) + 'px';
    });

    function toggleEditMode() {
      const sheet = document.getElementById('editable-doc-sheet');
      const btn = document.getElementById('btn-edit-toggle');
      const isEdit = document.body.classList.contains('mode-edit-layout');

      if (isEdit) {
        document.body.classList.remove('mode-edit-layout');
        sheet.contentEditable = 'false';
        btn.textContent = '✏️ MODO EDICIÓN';
        btn.style.background = '#f59e0b';
        btn.style.color = '#000';
        sheet.style.outline = 'none';
        const tb = document.getElementById('doc-format-toolbar');
        if (tb) tb.style.display = 'none';
      } else {
        document.body.classList.add('mode-edit-layout');
        sheet.contentEditable = 'true';
        btn.textContent = '💾 FINALIZAR EDICIÓN';
        btn.style.background = '#10b981';
        btn.style.color = '#fff';
        sheet.style.outline = '2px dashed #f59e0b';
        setupDraggableBlocks();
      }
    }

    async function exportToWordDocx() {
      const btnWord = document.getElementById('btn-doc-docx');
      const origText = btnWord ? btnWord.innerHTML : '';
      if (btnWord) { btnWord.innerHTML = '⏳ GENERANDO DOCX...'; btnWord.disabled = true; }

      try {
        const sheet = document.getElementById('editable-doc-sheet');
        if (!sheet) throw new Error('No se encontró la hoja de documento');
        const cloneSheet = sheet.cloneNode(true);
        cloneSheet.querySelectorAll('.doc-top-bar, #doc-format-toolbar, .no-print, .ra-edit-del-btn, .ra-gap-handle, #ra-gap-tooltip').forEach(el => el.remove());
        cloneSheet.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
        cloneSheet.querySelectorAll('.editable-field').forEach(el => el.classList.remove('editable-field'));
        cloneSheet.querySelectorAll('[data-editable-box]').forEach(el => {
          el.removeAttribute('draggable');
          el.removeAttribute('data-editable-box');
        });
        cloneSheet.removeAttribute('contenteditable');

        let exporter = (window.opener && window.opener.RADocxExporter) || (typeof RADocxExporter !== 'undefined' ? RADocxExporter : null);
        if (!exporter && window.opener && window.opener.RALazyLoader && typeof window.opener.RALazyLoader.loadDocxExporter === 'function') {
          exporter = await window.opener.RALazyLoader.loadDocxExporter();
        } else if (!exporter && typeof RALazyLoader !== 'undefined' && typeof RALazyLoader.loadDocxExporter === 'function') {
          exporter = await RALazyLoader.loadDocxExporter();
        }
        if (exporter && typeof exporter.rasterizeSvgsToPng === 'function') {
          await exporter.rasterizeSvgsToPng(cloneSheet);
        } else {
          // Convertir cualquier <svg> a <img> base64 si el módulo rasterizador no está accesible
          const svgs = Array.from(cloneSheet.querySelectorAll('svg'));
          for (let i = 0; i < svgs.length; i++) {
            const svgEl = svgs[i];
            try {
              const svgData = new XMLSerializer().serializeToString(svgEl);
              const svgB64 = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
              const imgEl = document.createElement('img');
              imgEl.src = svgB64;
              imgEl.style.cssText = svgEl.style.cssText || 'display:block;max-width:100%;';
              if (svgEl.getAttribute('width')) imgEl.setAttribute('width', svgEl.getAttribute('width'));
              if (svgEl.getAttribute('height')) imgEl.setAttribute('height', svgEl.getAttribute('height'));
              svgEl.parentNode.replaceChild(imgEl, svgEl);
            } catch(eSvg) {}
          }
        }

        const stylesEl = document.querySelector('style');
        const styles = stylesEl ? stylesEl.innerHTML : '';

        let docxBlob = null;
        if (exporter && typeof exporter.buildDocxBlobFromHtml === 'function') {
          docxBlob = exporter.buildDocxBlobFromHtml(cloneSheet.outerHTML, {
            orientation: 'portrait',
            styles: styles,
            title: document.title || ${JSON.stringify(String(title || ''))}
          });
        } else {
          throw new Error('Módulo RADocxExporter no disponible');
        }

        const a = document.createElement('a');
        a.href = URL.createObjectURL(docxBlob);
        a.download = '${safeFileBase}.docx';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(a.href), 30000);
      } catch(errDocx) {
        console.error('Error exportando documento DOCX:', errDocx);
        _docNotify('No se pudo generar el archivo DOCX: ' + (errDocx.message || errDocx));
      } finally {
        if (btnWord) { btnWord.innerHTML = origText || '📝 WORD (.DOCX)'; btnWord.disabled = false; }
      }
    }

    function exportToWord() {
      return exportToWordDocx();
    }

    function exportToHtml() {
      const clone = document.documentElement.cloneNode(true);
      clone.querySelectorAll('.doc-top-bar, #doc-format-toolbar, .no-print, .ra-edit-del-btn, .ra-gap-handle, #ra-gap-tooltip').forEach(el => el.remove());
      clone.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
      clone.querySelectorAll('.editable-field').forEach(el => el.classList.remove('editable-field'));
      clone.querySelectorAll('[data-editable-box]').forEach(el => {
        el.removeAttribute('draggable');
        el.removeAttribute('data-editable-box');
      });
      const blob = new Blob(['\\ufeff' + clone.outerHTML], { type: 'text/html;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '${safeFileBase}.html';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  <` + `/script>
</body>
</html>`;

  if (opt && typeof opt === 'object' && opt.returnHtmlOnly) {
    return htmlContent;
  }

  const w = window.open('', '_blank');
  if (!w) {
    // Si el navegador bloquea la ventana emergente, mostrar en visor modal incrustado
    showEmbeddedDocViewer(title, htmlContent);
    return null;
  }
  w.document.open();
  w.document.write(htmlContent);
  w.document.close();
  return w;
}

function showEmbeddedDocViewer(title, fullHtml) {
  let modal = document.getElementById('ra-embedded-doc-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'ra-embedded-doc-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);z-index:999999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;';
    document.body.appendChild(modal);
  }
  modal.innerHTML = `
    <div style="width:90%;max-width:960px;height:90vh;background:#fff;border-radius:10px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 25px 60px rgba(0,0,0,0.6);position:relative;">
      <div style="background:#0f172a;color:#fff;padding:8px 16px;display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #f59e0b;">
        <span style="font-size:11px;font-weight:800;letter-spacing:0.5px;">📄 ${title || 'DOCUMENTO'} (VISOR INTEGRADO)</span>
        <button type="button" onclick="document.getElementById('ra-embedded-doc-modal').style.display='none'" style="background:transparent;border:none;color:#94a3b8;font-size:18px;cursor:pointer;padding:2px 8px;font-weight:900;" title="Cerrar visor">✕</button>
      </div>
      <iframe id="ra-doc-iframe" style="width:100%;height:calc(100% - 40px);border:none;"></iframe>
    </div>
  `;
  modal.style.display = 'flex';
  const iframe = document.getElementById('ra-doc-iframe');
  if (iframe) {
    iframe.contentWindow.document.open();
    iframe.contentWindow.document.write(fullHtml);
    iframe.contentWindow.document.close();
  }
}
if (typeof window !== 'undefined') {
  window.showEmbeddedDocViewer = showEmbeddedDocViewer;
}

function buildMonthlyProductionSvg(monthlyData) {
  if (!Array.isArray(monthlyData) || monthlyData.length !== 12) return '';
  const width = 540;
  const height = 140;
  const padLeft = 45;
  const padRight = 15;
  const padTop = 20;
  const padBottom = 22;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const values = monthlyData.map(m => (typeof m.kwh === 'number' ? m.kwh : 0));
  const maxVal = Math.max(...values, 100);
  const ceilMax = Math.ceil(maxVal / 100) * 100;

  const monthLabels = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const barWidth = Math.floor(chartW / 12) - 8;

  let gridLines = '';
  for (let i = 0; i <= 4; i++) {
    const yVal = Math.round((ceilMax / 4) * i);
    const yPos = padTop + chartH - (yVal / ceilMax) * chartH;
    gridLines += '<line x1="' + padLeft + '" y1="' + yPos + '" x2="' + (width - padRight) + '" y2="' + yPos + '" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="' + (i === 0 ? '0' : '3,3') + '" />';
    gridLines += '<text x="' + (padLeft - 6) + '" y="' + (yPos + 3) + '" font-size="8" fill="#64748b" text-anchor="end" font-family="sans-serif">' + yVal + '</text>';
  }

  let bars = '';
  monthlyData.forEach((m, idx) => {
    const val = values[idx];
    const bH = Math.max(2, (val / ceilMax) * chartH);
    const x = padLeft + idx * (chartW / 12) + 4;
    const y = padTop + chartH - bH;
    bars += '<rect x="' + x + '" y="' + y + '" width="' + barWidth + '" height="' + bH + '" rx="2" fill="url(#monthlyGrad)" />';
    bars += '<text x="' + (x + barWidth / 2) + '" y="' + (y - 3) + '" font-size="7" font-weight="600" fill="#0f172a" text-anchor="middle" font-family="sans-serif">' + Math.round(val) + '</text>';
    bars += '<text x="' + (x + barWidth / 2) + '" y="' + (height - padBottom + 11) + '" font-size="7.5" fill="#475569" text-anchor="middle" font-family="sans-serif">' + monthLabels[idx] + '</text>';
  });

  return '<div class="doc-chart-box" style="margin:10px 0 14px;page-break-inside:avoid;text-align:center;">' +
    '<svg viewBox="0 0 ' + width + ' ' + height + '" style="width:100%;max-width:' + width + 'px;height:auto;display:inline-block;background:#ffffff;border:1px solid #e2e8f0;border-radius:6px;padding:6px;">' +
      '<defs>' +
        '<linearGradient id="monthlyGrad" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0%" stop-color="#38bdf8" />' +
          '<stop offset="100%" stop-color="#0284c7" />' +
        '</linearGradient>' +
      '</defs>' +
      gridLines +
      bars +
    '</svg>' +
    '<div style="font-size:7.5pt;color:#64748b;margin-top:2px;">Figura 5.1 — Histograma mensual de energía fotovoltaica generada (kWh/mes)</div>' +
  '</div>';
}

function buildAmortizationSvg(capex, schedule25) {
  if (!Array.isArray(schedule25) || schedule25.length < 25) return '';
  const width = 540;
  const height = 150;
  const padLeft = 60;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 22;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const points = [{ year: 0, cum: -Math.abs(capex) }];
  schedule25.forEach(row => {
    points.push({ year: row.year, cum: row.cumulativeCashFlowEUR });
  });

  const minVal = Math.min(...points.map(p => p.cum));
  const maxVal = Math.max(...points.map(p => p.cum));
  const range = (maxVal - minVal) || 1;

  const zeroY = padTop + chartH - ((0 - minVal) / range) * chartH;

  const polyPoints = points.map(p => {
    const x = padLeft + (p.year / 25) * chartW;
    const y = padTop + chartH - ((p.cum - minVal) / range) * chartH;
    return x.toFixed(1) + ',' + y.toFixed(1);
  }).join(' ');

  let xTicks = '';
  for (let yr = 0; yr <= 25; yr += 5) {
    const x = padLeft + (yr / 25) * chartW;
    xTicks += '<line x1="' + x + '" y1="' + padTop + '" x2="' + x + '" y2="' + (padTop + chartH) + '" stroke="#f1f5f9" stroke-width="1" />';
    xTicks += '<text x="' + x + '" y="' + (height - padBottom + 11) + '" font-size="7.5" fill="#64748b" text-anchor="middle" font-family="sans-serif">Año ' + yr + '</text>';
  }

  let yTicks =
    '<line x1="' + padLeft + '" y1="' + zeroY + '" x2="' + (width - padRight) + '" y2="' + zeroY + '" stroke="#94a3b8" stroke-width="1.2" stroke-dasharray="4,3" />' +
    '<text x="' + (padLeft - 6) + '" y="' + (zeroY + 3) + '" font-size="7.5" font-weight="700" fill="#475569" text-anchor="end" font-family="sans-serif">0 €</text>' +
    '<text x="' + (padLeft - 6) + '" y="' + (padTop + 8) + '" font-size="7.5" fill="#10b981" font-weight="700" text-anchor="end" font-family="sans-serif">+' + Math.round(maxVal).toLocaleString('es-ES') + ' €</text>' +
    '<text x="' + (padLeft - 6) + '" y="' + (padTop + chartH - 2) + '" font-size="7.5" fill="#ef4444" font-weight="700" text-anchor="end" font-family="sans-serif">-' + Math.round(Math.abs(minVal)).toLocaleString('es-ES') + ' €</text>';

  let paybackMarker = '';
  for (let i = 1; i < points.length; i++) {
    if (points[i - 1].cum < 0 && points[i].cum >= 0) {
      const frac = (0 - points[i - 1].cum) / (points[i].cum - points[i - 1].cum);
      const exactYr = (i - 1) + frac;
      const x = padLeft + (exactYr / 25) * chartW;
      paybackMarker =
        '<circle cx="' + x + '" cy="' + zeroY + '" r="4" fill="#f59e0b" stroke="#ffffff" stroke-width="1.5" />' +
        '<rect x="' + (x - 26) + '" y="' + (zeroY - 20) + '" width="52" height="14" rx="3" fill="#0f172a" opacity="0.85" />' +
        '<text x="' + x + '" y="' + (zeroY - 10) + '" font-size="7" font-weight="bold" fill="#f8fafc" text-anchor="middle" font-family="sans-serif">Payback ' + exactYr.toFixed(1) + 'a</text>';
      break;
    }
  }

  return '<div class="doc-chart-box" style="margin:12px 0 16px;page-break-inside:avoid;text-align:center;">' +
    '<svg viewBox="0 0 ' + width + ' ' + height + '" style="width:100%;max-width:' + width + 'px;height:auto;display:inline-block;background:#ffffff;border:1px solid #e2e8f0;border-radius:6px;padding:6px;">' +
      xTicks +
      yTicks +
      '<polyline points="' + polyPoints + '" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />' +
      paybackMarker +
    '</svg>' +
    '<div style="font-size:7.5pt;color:#64748b;margin-top:2px;">Curva de Cashflow Acumulado a 25 Años — Amortización y Retorno de Inversión</div>' +
  '</div>';
}

function generateMemoria(skipPricingModal, opt) {
  const returnHtmlOnly = !!(opt && typeof opt === 'object' && opt.returnHtmlOnly);
  // [B4] Bloquear entrega si el análisis solar está en curso u obsoleto
  if (!returnHtmlOnly && typeof raEnsureAnalysisReadyForDoc === 'function' && !raEnsureAnalysisReadyForDoc()) return;
  if (!returnHtmlOnly && !skipPricingModal && typeof wpOpenPricingReviewModal === 'function') {
    wpOpenPricingReviewModal(function() {
      generateMemoria(true);
    });
    return;
  }
  const d = _docGetProjectCalcs();
  const dcEs3D = !!d.L_dc_esMedida3D;
  const acEs3D = !!d.L_ac_esMedida3D;
  if (d.numPanels === 0) {
    (typeof raAlert === 'function' ? raAlert : console.warn)('Define primero el polígono de la instalación con al menos 3 vértices.', 'warning'); return;
  }
  const t = d.tit;
  const loc = (t.dir ? t.dir + ', ' : '') + (t.mun || '') + (t.prov ? ', ' + t.prov : '');
  const _eqWar = (typeof resolveEquipmentWarranties === 'function') ? resolveEquipmentWarranties() : { warMod: '15', warPower: '25', warInv: '12', warMo: '5', warBat: '10', hasBat: false, isMicro: false };

  // [B6] El reparto mensual del PDF se toma de la SIMULACIÓN REAL si está disponible.
  const _simMonthly = (typeof raGetSimulatedMonthlyKwh === 'function') ? raGetSimulatedMonthlyKwh() : null;
  const monthRows = d.monthly.map((m, i) =>
    '<tr><td>' + m.mes + '<\/td><td style="text-align:center">' + m.dias +
    '<\/td><td style="text-align:center">' + m.hsp +
    '<\/td><td style="text-align:right;font-weight:600">' + (_simMonthly ? _simMonthly[i] : m.kWh).toLocaleString('es-ES') + ' kWh<\/td><\/tr>'
  ).join('');
  const _monthlyTotal = _simMonthly ? _simMonthly.reduce((a, b) => a + b, 0) : d.annualKWh;

  const sState = (typeof window !== 'undefined' && window.inverterEquipmentState) ? window.inverterEquipmentState : null;
  const finM = (typeof calculateFinancialModel === 'function') ? (function() {
    try { return calculateFinancialModel(); } catch(e) { return null; }
  })() : null;

  // Telemetría de Strings para Anexo REBT ITC-BT-40
  let stringRowsHtml = '';
  if (sState && Array.isArray(sState.stringTelemetry) && sState.stringTelemetry.length > 0) {
    stringRowsHtml = sState.stringTelemetry.map(st => {
      const idx = st.index || 1;
      const nMods = st.numPanels || d.modsActual;
      const vmpHot = st.vmpHot ? st.vmpHot.toFixed(1) : (nMods * d.Vmp * 0.88).toFixed(1);
      const vocCold = st.vocCold ? st.vocCold.toFixed(1) : (nMods * d.Voc_cold).toFixed(1);
      const l3d = st.homerunLength ? st.homerunLength.toFixed(1) : d.L_dc.toFixed(1);
      const sec = st.recommendedSection || d.S_str;
      const dvV = st.voltageDropV ? st.voltageDropV.toFixed(2) : d.dV_dc.toFixed(2);
      const dvPct = st.voltageDropPct ? st.voltageDropPct.toFixed(2) : parseFloat(d.dVdc_p).toFixed(2);
      const ok = (parseFloat(dvPct) <= 1.5);
      return '<tr>' +
        '<td>String #' + idx + '<\/td>' +
        '<td style="text-align:center">' + nMods + ' mods<\/td>' +
        '<td style="text-align:center">' + vmpHot + ' V / ' + vocCold + ' V<\/td>' +
        '<td style="text-align:center">' + l3d + ' m<\/td>' +
        '<td style="text-align:center">' + sec + ' mm²<\/td>' +
        '<td style="text-align:center">' + dvV + ' V (' + dvPct + ' %)<\/td>' +
        '<td style="text-align:center;font-weight:700;color:' + (ok ? '#10b981' : '#ef4444') + '">' + (ok ? '✓ Conforme (≤1,5%)' : '✗ Aumentar sección') + '<\/td>' +
      '<\/tr>';
    }).join('');
  }
  if (!stringRowsHtml) {
    const okDc = (parseFloat(d.dVdc_p) <= 1.5);
    stringRowsHtml = '<tr>' +
      '<td>String Central (General)<\/td>' +
      '<td style="text-align:center">' + d.modsActual + ' mods<\/td>' +
      '<td style="text-align:center">' + (d.modsActual * d.Vmp * 0.88).toFixed(1) + ' V / ' + d.Voc_str_cold.toFixed(1) + ' V<\/td>' +
      '<td style="text-align:center">' + d.L_dc + ' m<\/td>' +
      '<td style="text-align:center">' + d.S_str + ' mm²<\/td>' +
      '<td style="text-align:center">' + d.dV_dc.toFixed(2) + ' V (' + parseFloat(d.dVdc_p).toFixed(2) + ' %)<\/td>' +
      '<td style="text-align:center;font-weight:700;color:' + (okDc ? '#10b981' : '#ef4444') + '">' + (okDc ? '✓ Conforme (≤1,5%)' : '✗ Aumentar sección') + '<\/td>' +
    '<\/tr>';
  }

  // Métricas financieras bancables a 25 años
  // [AUD-2026 · A-03] Sin modelo financiero NO se inventan métricas: se publica 'N/D'
  // y se marca el documento como no bancable (ver `FIN_MODEL_MISSING`).
  const FIN_MODEL_MISSING = !finM;
  const _snapMem = (typeof window !== 'undefined' && typeof window.raBuildDocSnapshot === 'function')
    ? window.raBuildDocSnapshot(d, finM)
    : null;
  const capexTot = _snapMem ? _snapMem.capexBruto : (finM ? finM.capexBruto : d.total);
  const vanVal = _snapMem ? (_snapMem.van != null ? Math.round(_snapMem.van) : 'N/D') : (finM ? (typeof finM.van === 'number' ? Math.round(finM.van) : finM.van) : 'N/D');
  const tirVal = _snapMem ? (_snapMem.tir != null ? _snapMem.tir.toFixed(1) : 'N/D') : (finM ? (typeof finM.tir === 'number' ? finM.tir.toFixed(1) : finM.tir) : 'N/D');
  const lcoeVal = _snapMem ? (_snapMem.lcoe != null ? _snapMem.lcoe.toFixed(3) : 'N/D') : (finM ? (typeof finM.lcoe === 'number' ? finM.lcoe.toFixed(3) : finM.lcoe) : 'N/D');
  const pbYears = _snapMem ? (_snapMem.paybackYears != null ? _snapMem.paybackYears.toFixed(1) : 'N/D') : (finM ? (typeof finM.paybackYears === 'number' ? finM.paybackYears.toFixed(1) : finM.paybackYears) : 'N/D');
  const ah1 = _snapMem ? Math.round(_snapMem.ahorroLuzAnio1) : (finM ? Math.round(finM.ahorroLuzAnio1) : d.ahorro_anual);
  const waccPctMem = _snapMem ? _snapMem.waccPct : ((finM && typeof finM.waccPct === 'number') ? finM.waccPct : 4.0);
  const ipcOpexMem = _snapMem ? _snapMem.ipcOpexPct : ((finM && typeof finM.ipcOpexPct === 'number') ? finM.ipcOpexPct : 2.0);
  const degAnnMem = _snapMem ? _snapMem.degAnnualPct : ((finM && typeof finM.degAnnualPct === 'number') ? finM.degAnnualPct : 0.40);
  const totalGen25Mem = (_snapMem && _snapMem.totalGenerado25) ? _snapMem.totalGenerado25 : ((finM && finM.totalGenerado25) ? finM.totalGenerado25 : Math.round(d.annualKWh * 23.2));

  const keyYears = [1, 5, 10, 15, 20, 25];
  let scheduleRowsHtml = '';
  if (finM && Array.isArray(finM.financialSchedule25) && finM.financialSchedule25.length >= 25) {
    scheduleRowsHtml = keyYears.map(y => {
      const row = finM.financialSchedule25[y - 1];
      if (!row) return '';
      return '<tr>' +
        '<td style="text-align:center;font-weight:600">Año ' + y + '<\/td>' +
        '<td style="text-align:center">' + row.degradationPct + ' %<\/td>' +
        '<td style="text-align:right">' + row.yieldKWh.toLocaleString('es-ES') + ' kWh<\/td>' +
        '<td style="text-align:right">' + row.savingsEUR.toLocaleString('es-ES') + ' €<\/td>' +
        '<td style="text-align:right">' + row.opexEUR.toLocaleString('es-ES') + ' €<\/td>' +
        '<td style="text-align:right;font-weight:700;color:' + (row.netCashFlowEUR >= 0 ? '#10b981' : '#ef4444') + '">' + row.netCashFlowEUR.toLocaleString('es-ES') + ' €<\/td>' +
        '<td style="text-align:right;font-weight:900">' + row.cumulativeCashFlowEUR.toLocaleString('es-ES') + ' €<\/td>' +
      '<\/tr>';
    }).join('');
  }

  const body =
    '<div class="hdr"><div class="hdr-l">' +
    '<span class="badge">MEMORIA TÉCNICA<\/span>' +
    '<h1>Instalación Fotovoltaica de Autoconsumo<\/h1>' +
    '<p>' + loc + '<\/p><\/div>' +
    '<div class="hdr-r"><strong>' + d.refNum + '<\/strong>Fecha: ' + d.fechaStr + '<br>Rev. R0 · Pág 1/1<\/div><\/div>' +
    (FIN_MODEL_MISSING
      ? '<div class="doc-warning" style="border:2px solid #ef4444;background:#fef2f2;color:#991b1b;padding:10px 14px;border-radius:6px;margin:10px 0;font-size:10pt;font-weight:700;">⚠️ DOCUMENTO EMITIDO SIN MODELO FINANCIERO: TIR, VAN, payback y LCOE figuran como «N/D» y no son válidos para financiación ni para comparación comercial.</div>'
      : '') +

    '<h2>1. OBJETO Y ANTECEDENTES<\/h2>' +
    '<p>El presente documento es la <strong>Memoria Técnica Descriptiva y de Cálculo<\/strong> de la instalación fotovoltaica de autoconsumo proyectada para <strong>' + t.nombre + '<\/strong> (NIF: ' + t.nif + '), en ' + (loc || 'la dirección indicada') + '.<\/p>' +
    '<p><strong>Modalidad:<\/strong> ' + d.modalTexto + '<\/p>' +
    // [AUD-2026 · D-01] Trazabilidad del dato de producción: simulación, motor físico o tabla.
    '<p><strong>Producción estimada:<\/strong> ' + Math.round(d.annualKWh).toLocaleString('es-ES') + ' kWh/año · <em>fuente: ' +
      ((d.productionSource === 'simulation') ? 'simulación por panel (sombras y pérdidas incluidas)'
        : (d.productionSource === 'physical') ? (d.productionSourceDetail || 'motor físico con datos del emplazamiento')
        : 'estimación estacional interna (pendiente de simulación)') +
      ' · reparto mensual: ' + ((finM && finM.monthlySource === 'simulation') ? 'simulación' : 'estimación estacional') + '<\/em><\/p>' +
    '<p><strong>CUPS:<\/strong> ' + t.cups + ' · <strong>Distribuidora:<\/strong> ' + t.dist + '<\/p>' +
    (typeof EngineeringExplainer !== 'undefined' && typeof EngineeringExplainer.generateExecutiveSummaryHTML === 'function' ? EngineeringExplainer.generateExecutiveSummaryHTML(d) : '') +

    '<h2>2. NORMATIVA APLICABLE<\/h2>' +
    '<table><tr><th>Referencia<\/th><th>Descripción<\/th><\/tr>' +
    '<tr><td>RD 842/2002 (REBT)<\/td><td>Reglamento Electrotécnico de Baja Tensión<\/td><\/tr>' +
    '<tr><td>ITC-BT-40<\/td><td>Instalaciones generadoras de baja tensión<\/td><\/tr>' +
    '<tr><td>RD 1699/2011 (mod. RD 244/2019)<\/td><td>Conexión a red de instalaciones de generación (Art. 12.2: Conexión trifásica obligatoria &gt; 15 kW y desequilibrio de fases &lt; 5 kW)<\/td><\/tr>' +
    '<tr><td>RD 244/2019<\/td><td>Condiciones técnicas y económicas del autoconsumo<\/td><\/tr>' +
    '<tr><td>RD 1183/2020<\/td><td>Acceso y conexión a redes de distribución<\/td><\/tr>' +
    '<tr><td>UNE-EN IEC 62446-1<\/td><td>Documentación de sistemas FV conectados a red<\/td><\/tr>' +
    '<tr><td>UNE-EN IEC 61215 / 61730<\/td><td>Cualificación y seguridad de módulos FV<\/td><\/tr>' +
    '<tr><td>ITC-BT-18<\/td><td>Puesta a tierra<\/td><\/tr>' +
    '<\/table>' +

    '<h2>3. EMPLAZAMIENTO<\/h2>' +
    '<div class="dgrid">' +
    '<div class="dcard"><label>Titular<\/label><value>' + t.nombre + '<\/value><\/div>' +
    '<div class="dcard"><label>NIF\/CIF<\/label><value>' + t.nif + '<\/value><\/div>' +
    '<div class="dcard"><label>Dirección<\/label><value>' + (t.dir || '—') + '<\/value><\/div>' +
    '<div class="dcard"><label>Municipio \/ Provincia<\/label><value>' + (t.mun || '—') + ' \/ ' + (t.prov || '—') + '<\/value><\/div>' +
    '<div class="dcard"><label>Latitud \/ Longitud<\/label><value>' + Number(d.latDeg).toFixed(4) + '° N \/ ' + Number(d.lonDeg).toFixed(4) + '° E<\/value><\/div>' +
    '<div class="dcard"><label>Superficie disponible (3D)<\/label><value>' + Number(d.area3D || 0).toFixed(1) + ' m²<\/value><\/div>' +
    '<div class="dcard"><label>Superficie útil FV (80 %)<\/label><value>' + d.usefulArea.toFixed(1) + ' m²<\/value><\/div>' +
    '<div class="dcard"><label>Potencia contratada<\/label><value>' + t.potContr + ' kW<\/value><\/div>' +
    '<\/div>' +

    '<h2>4. DESCRIPCIÓN DE LA INSTALACIÓN<\/h2>' +
    (function() {
      const mb = (d && d.modulesBreakdown) || (typeof window !== 'undefined' && window.RAModulesBreakdown && typeof window.RAModulesBreakdown.getProjectModulesBreakdown === 'function' ? window.RAModulesBreakdown.getProjectModulesBreakdown() : null);
      if (mb && mb.isMultiModule) {
        return '<h3>4.1 Módulos Fotovoltaicos (Configuración Multi-Modelo)<\/h3>' +
          '<p style="font-size:9pt;margin-bottom:8px;">La instalación cuenta con un campo generador optimizado con <strong>' + mb.uniqueModelsCount + ' modelos de módulos<\/strong> adaptados a cada faldón, sumando <strong>' + d.numPanels + ' módulos<\/strong> y <strong>' + d.P_dc_kW.toFixed(3) + ' kWp<\/strong>:<\/p>' +
          (window.RAModulesBreakdown ? window.RAModulesBreakdown.renderMultiModelSpecsTableHTML(mb) : '') +
          '<h3>4.1.b Subcampos Generadores y Distribución por Cubierta<\/h3>' +
          '<p style="font-size:9pt;margin-bottom:8px;">Distribución geométrica y estructural según estudio BIM 3D:<\/p>' +
          (window.RAModulesBreakdown ? window.RAModulesBreakdown.renderSubfieldsTableHTML(mb, { includeCost: false }) : '');
      }
      return '<h3>4.1 Módulos Fotovoltaicos<\/h3>' +
        '<table><tr><th>Parámetro<\/th><th>Valor<\/th><th>Condición<\/th><\/tr>' +
        '<tr><td>Marca \/ Modelo<\/td><td>' + d.cfg.modelo + '<\/td><td>—<\/td><\/tr>' +
        '<tr><td>Tecnología<\/td><td>' + d.cfg.tecnologia + '<\/td><td>—<\/td><\/tr>' +
        '<tr><td>Potencia pico (Pmax)<\/td><td>' + d.cfg.potencia + ' Wp<\/td><td>STC<\/td><\/tr>' +
        '<tr><td>Voc<\/td><td>' + d.Voc + ' V<\/td><td>STC<\/td><\/tr>' +
        '<tr><td>Isc<\/td><td>' + d.Isc + ' A<\/td><td>STC<\/td><\/tr>' +
        '<tr><td>Vmp<\/td><td>' + d.Vmp + ' V<\/td><td>MPP<\/td><\/tr>' +
        '<tr><td>Imp<\/td><td>' + d.Imp + ' A<\/td><td>MPP<\/td><\/tr>' +
        '<tr><td>Rendimiento<\/td><td>' + d.cfg.rendimiento + ' %<\/td><td>STC<\/td><\/tr>' +
        '<tr><td>Dimensiones<\/td><td>' + d.cfg.largo + ' × ' + d.cfg.ancho + ' m<\/td><td>—<\/td><\/tr>' +
        '<tr><td>Coef. temperatura Voc (β)<\/td><td>' + (d.betaVoc*100).toFixed(2) + ' %\/°C<\/td><td>—<\/td><\/tr>' +
        '<tr><td>Voc corregida (T_min = ' + d.T_min + ' °C)<\/td><td>' + d.Voc_cold.toFixed(2) + ' V<\/td><td>Máx. posible<\/td><\/tr>' +
        '<tr><td>Total módulos instalados<\/td><td><strong>' + d.numPanels + ' uds<\/strong><\/td><td>—<\/td><\/tr>' +
        '<\/table>';
    })() +

    '<h3>4.2 Inversor y Conversión de Potencia<\/h3>' +
    (function() {
      const inv = d.inverter || {};
      const invNomKw = (inv.kw || d.P_ac_kW || 5.0).toFixed(2);
      const invCount = inv.count || 1;
      const invTotalKw = (inv.totalKw || (invNomKw * invCount)).toFixed(2);
      const invPhases = d.monofasico ? 'Monofásico 230 V (F+N+PE)' : 'Trifásico 400 V (3F+N+PE)';
      const invMppts = inv.mpptCount || (d.numStrings > 1 ? 2 : 1);
      const invVmax = d.V_max_inv || 1000;
      const invVmpptMin = d.V_mppt_min || 160;
      const invVmpptMax = d.V_mppt_max || 850;
      const invEff = inv.efficiency || 98.4;
      return '<table><tr><th>Parámetro<\/th><th>Valor<\/th><th>Condición / Norma<\/th><\/tr>' +
        '<tr><td>Marca y Modelo<\/td><td><strong>' + (inv.fullName || 'Inversor Solar Central') + '</strong><\/td><td>Certificación RD 1699/2011 / UNE 217001<\/td><\/tr>' +
        '<tr><td>Potencia nominal AC<\/td><td><strong>' + invNomKw + ' kW' + (invCount > 1 ? ' (' + invCount + ' uds · ' + invTotalKw + ' kW total)' : '') + '</strong><\/td><td>Pn a cos φ = 1,0<\/td><\/tr>' +
        '<tr><td>Tensión y Tipo de Red<\/td><td>' + invPhases + '<\/td><td>50 Hz ± 1 Hz<\/td><\/tr>' +
        '<tr><td>Régimen de Conexión a Red<\/td><td><strong>' + (Number(invTotalKw) > 15.0 ? 'Conexión Trifásica 400 V Obligatoria (RD 1699/2011 Art. 12.2)' : (d.monofasico ? 'Monofásica 230 V (admisible Pn ≤ 15 kW)' : 'Trifásica 400 V (desequilibrio de fases &lt; 5 kW)')) + '<\/strong><\/td><td>RD 1699/2011 Art. 12.2 (mod. RD 244/2019)<\/td><\/tr>' +
        '<tr><td>Número de Entradas MPPT<\/td><td>' + invMppts + ' seguidor(es) MPPT independientes<\/td><td>Algoritmo de seguimiento continuo<\/td><\/tr>' +
        '<tr><td>Rango de tensión MPPT<\/td><td>' + invVmpptMin + ' V – ' + invVmpptMax + ' V CC<\/td><td>Ventana de tracking óptimo<\/td><\/tr>' +
        '<tr><td>Tensión máxima admisible (Vmax,dc)<\/td><td>' + invVmax + ' V CC<\/td><td>Límite destructivo de entrada<\/td><\/tr>' +
        '<tr><td>Rendimiento europeo (η)<\/td><td>' + invEff + ' %<\/td><td>Eficiencia ponderada europea<\/td><\/tr>' +
        '<tr><td>Grado de protección / Comunicación<\/td><td>IP65 (Apto intemperie) · Wi-Fi / Ethernet / RS485<\/td><td>Monitorización continua<\/td><\/tr>' +
        '<\/table>';
    })() +

    (d.hasBattery && d.battery ? (
      '<h3>4.3 Sistema de Almacenamiento Electroquímico (Batería LFP)<\/h3>' +
      '<p style="font-size:9pt;margin-bottom:8px;">La instalación incorpora acumulación electroquímica para maximizar el autoconsumo y la gestión horaria de excedentes:<\/p>' +
      '<table><tr><th>Parámetro<\/th><th>Valor<\/th><th>Condición / Norma<\/th><\/tr>' +
      '<tr><td>Marca y Modelo<\/td><td><strong>' + d.battery.fullName + '</strong><\/td><td>Certificación UNE-EN IEC 62619 / CEI 0-21<\/td><\/tr>' +
      '<tr><td>Capacidad Nominal Útil<\/td><td><strong>' + d.battery.totalKwh.toFixed(1) + ' kWh' + (d.battery.count > 1 ? ' (' + d.battery.count + ' módulos)' : '') + '</strong><\/td><td>DoD 90% útil<\/td><\/tr>' +
      '<tr><td>Tecnología electroquímica<\/td><td>' + (d.battery.technology || 'Litio-Ferrofosfato (LiFePO4)') + '<\/td><td>Alta estabilidad térmica y seguridad<\/td><\/tr>' +
      '<tr><td>Tensión nominal de trabajo<\/td><td>' + (d.battery.voltage || 400) + ' V CC<\/td><td>Acoplamiento directo CC al inversor híbrido<\/td><\/tr>' +
      '<tr><td>Rendimiento ciclo completo (Round-Trip)<\/td><td>≥ ' + (d.battery.efficiency || 95) + ' %<\/td><td>Eficiencia de carga y descarga<\/td><\/tr>' +
      '<tr><td>Sistema de Gestión (BMS)<\/td><td>BMS inteligente con comunicación CAN / RS485<\/td><td>Protección sobrecarga, sobretensión y temperatura<\/td><\/tr>' +
      '<tr><td>Vida útil y ciclos<\/td><td>> 6.000 ciclos (≥80% capacidad residual)<\/td><td>Garantía de rendimiento 10 años<\/td><\/tr>' +
      '<\/table>'
    ) : '') +

    '<h3>' + (d.hasBattery && d.battery ? '4.4' : '4.3') + ' Configuración del Generador<\/h3>' +
    (function() {
      const mb = (d && d.modulesBreakdown) || (typeof window !== 'undefined' && window.RAModulesBreakdown && typeof window.RAModulesBreakdown.getProjectModulesBreakdown === 'function' ? window.RAModulesBreakdown.getProjectModulesBreakdown() : null);
      if (mb && mb.isMultiModule) {
        return '<div class="info" style="margin:8px 0;padding:8px 10px;background:#f0fdf4;border-left:3px solid #16a34a;font-size:8.5pt;border-radius:4px;">' +
          '✓ <strong>Conformidad UNE-EN IEC 62548 &amp; REBT ITC-BT-40:<\/strong> Los módulos de diferentes modelos/potencias están segregados en strings físicamente homogéneos conectados a canales MPPT dedicados, previniendo pérdidas por desadaptación (mismatch).' +
          '<\/div>';
      }
      return '';
    })() +
    '<table><tr><th>Parámetro<\/th><th>Valor<\/th><th>Cálculo<\/th><\/tr>' +
    '<tr><td>Módulos por string<\/td><td>' + d.modsActual + ' uds<\/td><td>⌊' + d.V_max_inv + '\/' + d.Voc_cold.toFixed(2) + '⌋<\/td><\/tr>' +
    '<tr><td>Strings en paralelo<\/td><td>' + d.numStrings + '<\/td><td>⌈' + d.numPanels + '\/' + d.modsActual + '⌉<\/td><\/tr>' +
    '<tr><td>Voc string (STC)<\/td><td>' + d.Voc_string.toFixed(1) + ' V<\/td><td>' + d.modsActual + ' × ' + d.Voc + ' V<\/td><\/tr>' +
    '<tr><td>Voc string (T_min)<\/td><td>' + d.Voc_str_cold.toFixed(1) + ' V ' + (d.Voc_str_cold <= (d.V_max_inv || 1000) ? '✓ ≤ ' + (d.V_max_inv || 1000) + ' V' : '⚠️ > ' + (d.V_max_inv || 1000) + ' V') + '<\/td><td>' + d.modsActual + ' × ' + d.Voc_cold.toFixed(2) + ' V<\/td><\/tr>' +
    '<tr><td>Corriente Isc total DC<\/td><td>' + d.I_total_dc.toFixed(1) + ' A<\/td><td>' + d.numStrings + ' × ' + d.Isc + ' A<\/td><\/tr>' +
    '<tr><td>Potencia pico total<\/td><td><strong>' + d.P_dc_kW.toFixed(3) + ' kWp<\/strong><\/td><td>' + d.numPanels + ' × ' + d.cfg.potencia + ' W<\/td><\/tr>' +
    '<tr><td>Potencia AC nominal<\/td><td>' + d.P_ac_kW.toFixed(3) + ' kW<\/td><td>P_dc × 0,95<\/td><\/tr>' +
    '<\/table>' +

    '<h3>' + (d.hasBattery && d.battery ? '4.5' : '4.4') + ' Conductores (ITC-BT-40)<\/h3>' +
    '<table><tr><th>Tramo<\/th><th>Cable<\/th><th>Sección<\/th><th>Tensión nom.<\/th><th>I diseño<\/th><\/tr>' +
    '<tr><td>DC String → Combiner<\/td><td>ZZ-F Solar<\/td><td>' + d.S_str + ' mm²<\/td><td>1.800 V CC<\/td><td>' + (1.25*d.Isc).toFixed(1) + ' A<\/td><\/tr>' +
    '<tr><td>DC Combiner → Inversor<\/td><td>ZZ-F Solar<\/td><td>' + d.S_mdc + ' mm²<\/td><td>1.800 V CC<\/td><td>' + (1.25*d.I_total_dc).toFixed(1) + ' A<\/td><\/tr>' +
    '<tr><td>AC Inversor → Cuadro<\/td><td>RV-K 0,6\/1 kV<\/td><td>' + d.S_ac + ' mm²<\/td><td>1.000 V CA<\/td><td>' + d.I_ac_d.toFixed(1) + ' A<\/td><\/tr>' +
    '<\/table>' +

    '<h3>' + (d.hasBattery && d.battery ? '4.6' : '4.5') + ' Protecciones Eléctricas<\/h3>' +
    '<table><tr><th>Protección<\/th><th>Especificación<\/th><th>Ubicación<\/th><\/tr>' +
    (d.useFuses ? '<tr><td>Fusibles string gPV<\/td><td>' + d.fuse_std + ' A \/ 1.000 V CC (IEC 60269-6)<\/td><td>Caja conexiones DC<\/td><\/tr>' : '<tr><td colspan="3"><em>Sin fusibles de string (≤ 2 strings en paralelo)<\/em><\/td><\/tr>') +
    '<tr><td>Seccionador DC + SPD Clase II<\/td><td>Carga en carga \/ Up ≤ 2,5 kV<\/td><td>Junto al inversor<\/td><\/tr>' +
    '<tr><td>IGA<\/td><td>Curva C ' + d.I_iga + ' A ' + (d.monofasico ? '1P+N' : '3P+N') + '<\/td><td>Cuadro AC<\/td><\/tr>' +
    '<tr><td>Interruptor diferencial<\/td><td>' + (d.rcdSensMa || 30) + ' mA ' + (d.rcdType || 'Clase A') + ', ' + d.dif_amp + ' A ' + (d.monofasico ? '2P' : '4P') + '<\/td><td>Cuadro AC<\/td><\/tr>' +
    '<tr><td>SPD CA Clase II<\/td><td>Up ≤ 2,5 kV<\/td><td>Cuadro AC<\/td><\/tr>' +
    '<tr><td>Toma de tierra<\/td><td>R ≤ ' + d.R_tierra + ' Ω · Electrodos Cu<\/td><td>Instalación completa<\/td><\/tr>' +
    (d.hasBattery && d.battery ? ('<tr><td>Protección DC Batería<\/td><td>Seccionador bipolar CC + Fusibles gBat (IEC 60269-7)<\/td><td>Entre acumulador e inversor híbrido<\/td><\/tr>') : '') +
    '<\/table>' +

    (function() {
      var wList = (typeof window !== 'undefined' && Array.isArray(window.windTurbines)) ? window.windTurbines.filter(function(t){return t && (!t.operationalState || t.operationalState.enabled !== false);}) : [];
      if (wList.length === 0) return '';
      var wSum = (typeof window !== 'undefined' && window.windParkSummary) ? window.windParkSummary : { totalRatedKw: 0, totalAepNetKwh: 0 };
      var hHtml = '<h2>4.BIS. SUBSISTEMA DE GENERACI\u00d3N MINI-E\u00d3LICA & HIBRIDACI\u00d3N<\/h2>' +
        '<p style="font-size:9pt;margin-bottom:8px;">El proyecto integra generadores e\u00f3licos de peque\u00f1a potencia en acoplamiento paralelo AC seg\u00fan REBT ITC-BT-40, directrices del RD 1367/2007 de contaminaci\u00f3n ac\u00fastica y CTE DB-SE-AE:<\/p>' +
        '<table><tr><th>Par\u00e1metro / Equipo<\/th><th>Especificaci\u00f3n T\u00e9cnica<\/th><th>Conformidad Normativa<\/th><\/tr>' +
        '<tr><td>Potencia E\u00f3lica Instalada<\/td><td><strong>' + (wSum.totalRatedKw || 0) + ' kW (' + wList.length + ' aerogeneradores)<\/strong><\/td><td>Acoplamiento AC en Cuadro General<\/td><\/tr>' +
        '<tr><td>Producci\u00f3n E\u00f3lica Neta Estimada<\/td><td><strong>' + (wSum.totalAepNetKwh || 0).toLocaleString('es-ES') + ' kWh/a\u00f1o<\/strong><\/td><td>Distribuci\u00f3n Weibull + P\u00e9rdidas Estela Jensen<\/td><\/tr>';
      wList.forEach(function(t, idx) {
        var c = t._catalog || {};
        var st = t.supportStructure || {};
        var h = st.hubHeightM || 18;
        hHtml += '<tr><td>Aerogenerador #' + (idx+1) + ' (' + (t.name || c.model || 'Mini-E\u00f3lica') + ')<\/td>' +
          '<td>' + (c.ratedPowerW ? (c.ratedPowerW/1000) : 0) + ' kW · ' + (c.type || 'HAWT') + ' · Rotor D=' + (c.rotorDiameterM || 0) + 'm · M\u00e1stil ' + h + 'm<\/td>' +
          '<td>Freno Reost\u00e1tico 120% (Dump Load ' + ((c.ratedPowerW ? (c.ratedPowerW/1000)*1.2 : 0).toFixed(1)) + ' kW) + Dif. Clase B 300mA<\/td><\/tr>';
      });
      hHtml += '<\/table>';
      return hHtml;
    })() +
    '<h2>5. CÁLCULOS JUSTIFICATIVOS<\/h2>' +
    '<h3>5.1 Producción Energética — Método HSP (PR = ' + d.PR + ')<\/h3>' +
    '<table><tr><th>Mes<\/th><th>Días<\/th><th>HSP\/día (h)<\/th><th>Energía (kWh\/mes)<\/th><\/tr>' +
    monthRows +
    '<tr class="trow-total"><td colspan="3"><strong>TOTAL ANUAL<\/strong><\/td><td style="text-align:right;font-weight:900">' + _monthlyTotal.toLocaleString('es-ES') + ' kWh\/año<\/td><\/tr><\/table>' +
    buildMonthlyProductionSvg(d.monthly) +
    '<p><strong>Producción específica:<\/strong> ' + d.hspAnual.toLocaleString('es-ES') + ' kWh\/kWp·año<\/p>' +

    '<h3>5.2 Dimensionamiento Eléctrico y Caída de Tensión por String (REBT ITC-BT-40 / UNE-HD 60364-5-52)<\/h3>' +
    '<p>' + (dcEs3D ? 'Cálculo de secciones de conductores solares ZZ-F 1500V DC y evacuación AC (RV-K 0,6/1 kV) con verificación de caída de tensión máxima admisible según ITC-BT-40 (ΔV ≤ 1,5 %). Trazado homerun calculado con geometría 3D sobre cubierta.' : 'Cálculo de secciones de conductores solares ZZ-F 1500V DC y evacuación AC (RV-K 0,6/1 kV) con verificación de caída de tensión máxima admisible según ITC-BT-40 (ΔV ≤ 1,5 %). <b>Longitudes estimadas paramétricamente</b>: para longitudes definitivas, realizar el trazado homerun en el visor 3D (Paso 4).') + '<\/p>' +
    '<table><tr><th>Circuito / String<\/th><th>Módulos<\/th><th>Tensión Vmp / Voc,frío<\/th><th>Longitud L (m)<\/th><th>Sección Comercial<\/th><th>ΔV Calculada<\/th><th>Conformidad REBT<\/th><\/tr>' +
    stringRowsHtml +
    '<tr><td>AC Inversor → Cuadro General<\/td><td style="text-align:center">—<\/td><td style="text-align:center">' + (d.monofasico ? '230 V (1F)' : '400 V (3F)') + '<\/td><td style="text-align:center">' + d.L_ac + ' m<\/td><td style="text-align:center">' + d.S_ac + ' mm²<\/td><td style="text-align:center">' + d.dV_ac.toFixed(2) + ' V (' + parseFloat(d.dVac_p).toFixed(2) + ' %)<\/td><td style="text-align:center;font-weight:700;color:' + (d.dVac_p <= 1.5 ? '#10b981' : '#ef4444') + '">' + (d.dVac_p <= 1.5 ? '✓ Conforme (≤1,5%)' : '✗ Aumentar sección') + '<\/td><\/tr>' +
    '<\/table>' +
    '<p style="font-size:8pt;color:#64748b;margin-top:4px;">* Factores de corrección reglamentarios aplicados: Factor térmico a 50 °C en cubierta f_t = 0,82; Factor de agrupamiento en bandeja/tubo f_agrup = 0,80 (UNE-HD 60364-5-52). Cobre clase 5 con resistividad a 90 °C ρ = 0,023 Ω·mm²/m.<\/p>' +

    '<h3>5.3 Comprobación de Ventana MPPT y Sobrecarga Mecánica (IEC 62548 / CTE DB-SE-AE)<\/h3>' +
    (function() {
      var vocLimit = d.V_max_inv || 1000;
      var vocVal = d.Voc_str_cold || (d.modsActual * (d.Voc_mod_cold || (d.Voc_cold || 45)));
      var vocMargin = (vocLimit - vocVal).toFixed(1);
      var vocOk = vocVal <= vocLimit;

      var vmpMinLimit = d.V_mppt_min || 160.0;
      var vmpHotVal = d.Vmp_str_hot || (d.modsActual * d.Vmp * 0.88);
      var vmpOk = vmpHotVal >= vmpMinLimit;

      var iscLimit = (d.inverter && d.inverter.maxInputCurrent) ? d.inverter.maxInputCurrent : 15.0;
      var iscOk = d.Isc <= iscLimit;

      var wTot = 12.5;
      var wLimit = (window.RA && typeof window.RA.getCteRoofLoadLimitKgM2 === 'function')
        ? window.RA.getCteRoofLoadLimitKgM2('sandwich_metal', null)
        : 25.0;
      try {
        if (typeof BOMTreeEngine !== 'undefined' && typeof BOMTreeEngine.computeBOMTree === 'function') {
          var t = BOMTreeEngine.computeBOMTree();
          if (t && t.summary && t.summary.maxLoadKgM2 > 0) {
            wTot = t.summary.maxLoadKgM2;
          } else if (t && t.structuralLoads && t.structuralLoads.maxWeightPerSqmKg) {
            wTot = t.structuralLoads.maxWeightPerSqmKg;
          }
          if (t && t.summary && t.summary.maxAllowedLoadKgM2 > 0) {
            wLimit = t.summary.maxAllowedLoadKgM2;
          }
        }
      } catch(e) {}
      var structOk = wTot <= wLimit;

      return '<table><tr><th>Comprobación Normativa<\/th><th>Parámetro Calculado<\/th><th>Criterio / Límite Admisible<\/th><th>Resultado<\/th><\/tr>' +
        '<tr><td>Tensión Máxima en Frío (-10 °C)<\/td><td>' + vocVal.toFixed(1) + ' V<\/td><td>≤ ' + vocLimit + ' V (IEC 62548 / Tensión máx. inversor)<\/td><td><strong style="color:' + (vocOk ? '#10b981' : '#ef4444') + '">' + (vocOk ? '✓ Conforme (Margen ' + vocMargin + ' V)' : '✗ No conforme (Sobretensión en frío)') + '<\/strong><\/td><\/tr>' +
        '<tr><td>Tensión Mínima MPPT en Calor (+65 °C)<\/td><td>' + vmpHotVal.toFixed(1) + ' V<\/td><td>≥ ' + vmpMinLimit.toFixed(1) + ' V (Tensión mínima de tracking MPPT)<\/td><td><strong style="color:' + (vmpOk ? '#10b981' : '#f59e0b') + '">' + (vmpOk ? '✓ Conforme (Rango óptimo)' : '⚠️ Tensión MPPT fuera de rango inferior') + '<\/strong><\/td><\/tr>' +
        '<tr><td>Corriente Máxima de Entrada<\/td><td>' + d.Isc.toFixed(1) + ' A<\/td><td>≤ ' + iscLimit.toFixed(1) + ' A (Isc admisible por entrada MPPT)<\/td><td><strong style="color:' + (iscOk ? '#10b981' : '#f59e0b') + '">' + (iscOk ? '✓ Conforme' : '⚠️ Supera corriente máx. inversor') + '<\/strong><\/td><\/tr>' +
        '<tr><td>Sobrecarga Estructural en Cubierta<\/td><td>' + wTot.toFixed(1) + ' kg/m² (Módulo + Estructura)<\/td><td>≤ ' + wLimit.toFixed(1) + ' kg/m² (CTE DB-SE-AE sobrecarga admisible)<\/td><td><strong style="color:' + (structOk ? '#10b981' : '#f59e0b') + '">' + (structOk ? '✓ Conforme (Sin refuerzo estructural)' : '⚠️ Requiere verificación de forjado') + '<\/strong><\/td><\/tr>' +
        '<\/table>';
    })() +

    '<h2>6. ANÁLISIS ECONÓMICO Y FINANCIERO BANCABLE (25 AÑOS)<\/h2>' +
    '<p>Evaluación financiera proyectada a 25 años bajo metodología de Flujos de Caja Descontados (DCF) con coste ponderado del capital WACC del ' + waccPctMem.toFixed(1) + ' %, degradación celular compuesta (' + degAnnMem.toFixed(2) + ' %/año) y mantenimiento anual indexado al IPC (' + ipcOpexMem.toFixed(1) + ' %/año).<\/p>' +
    '<div class="dgrid">' +
    '<div class="dcard"><label>Inversión Inicial (CAPEX Bruto)<\/label><value>' + capexTot.toLocaleString('es-ES',{minimumFractionDigits:2}) + ' €<\/value><\/div>' +
    '<div class="dcard"><label>Ahorro Anual (Año 1)<\/label><value style="color:#10b981">' + ah1.toLocaleString('es-ES') + ' €/año<\/value><\/div>' +
    '<div class="dcard"><label>Valor Actual Neto (VAN 25a · WACC ' + waccPctMem.toFixed(1) + '%)<\/label><value style="color:' + (typeof vanVal === 'number' && vanVal < 0 ? '#ef4444' : '#10b981') + '"><strong>' + (typeof vanVal === 'number' ? ((vanVal >= 0 ? '+' : '') + vanVal.toLocaleString('es-ES')) : vanVal) + ' €<\/strong><\/value><\/div>' +
    '<div class="dcard"><label>Tasa Interna de Retorno (TIR)<\/label><value style="color:#10b981"><strong>' + tirVal + ' %<\/strong><\/value><small style="display:block;font-size:8px;color:#64748b;">sobre desembolso inicial (CAPEX bruto)<\/small><\/div>' +
    '<div class="dcard"><label>Coste Nivelado (LCOE)<\/label><value>' + lcoeVal + ' €/kWh<\/value><\/div>' +
    '<div class="dcard"><label>Período de Retorno (Payback)<\/label><value><strong>' + pbYears + ' años<\/strong><\/value><small style="display:block;font-size:8px;color:#64748b;">sobre desembolso inicial (CAPEX bruto)<\/small><\/div>' +
    '<div class="dcard"><label>Emisiones CO₂ Evitadas<\/label><value>' + d.co2_evitado + ' t CO₂/año<\/value><\/div>' +
    '<div class="dcard"><label>Energía Limpia Total (25 años)<\/label><value>' + totalGen25Mem.toLocaleString('es-ES') + ' kWh<\/value><\/div>' +
    '<\/div>' +
    (scheduleRowsHtml ? (
      '<h4 style="margin-top:14px;">6.1 Matriz de Flujos de Caja Descontados (Hitos Quinquenales y Decenales)<\/h4>' +
      '<table><tr><th>Hito Temporal<\/th><th>Degradación Módulos<\/th><th>Producción Anual<\/th><th>Ahorro Factura<\/th><th>OPEX Mantenimiento<\/th><th>Flujo Neto Anual<\/th><th>Cashflow Acumulado<\/th><\/tr>' +
      scheduleRowsHtml +
      '<\/table>' +
      buildAmortizationSvg(capexTot, finM && finM.financialSchedule25)
    ) : '') +
    '<h2>7. CONCLUSIÓN<\/h2>' +
    '<p>La instalación fotovoltaica de autoconsumo de <strong>' + d.P_dc_kW.toFixed(2) + ' kWp<\/strong> (' + d.numPanels + ' módulos de ' + d.cfg.potencia + ' Wp con ' + (d.inverter ? d.inverter.fullName : ('inversor de ' + d.P_ac_kW.toFixed(2) + ' kW')) + (d.hasBattery && d.battery ? (' y sistema de almacenamiento en batería ' + d.battery.fullName + ' de ' + d.battery.totalKwh.toFixed(1) + ' kWh') : '') + ') es técnicamente viable y cumple la normativa española vigente. La producción estimada de <strong>' + d.annualKWh.toLocaleString('es-ES') + ' kWh\/año<\/strong> supone un ahorro anual de <strong>' + ah1.toLocaleString('es-ES') + ' €<\/strong> con un período de retorno de <strong>' + pbYears + ' años<\/strong> y una reducción de emisiones de <strong>' + d.co2_evitado + ' t CO₂\/año<\/strong>.<\/p>' +

    '<div class="sig-row"><div class="sig">El Titular<br><br><br>' + t.nombre + '<br>NIF: ' + t.nif + '<\/div>' +
    '<div class="sig">El Técnico Proyectista<br><br><br>' + t.tecnico + '<br>' + t.titulacion + ' — Col. ' + t.ncol + '<\/div>' +
    '<div class="sig">Lugar y Fecha<br><br><br>' + (t.mun || '___') + ', ' + d.fechaStr + '<\/div><\/div>' +
    '<div class="footer">' + d.refNum + ' — MEMORIA TÉCNICA — Rev. R0 — ' + d.fechaStr + ' — Generado por RA · Sistema de Diseño FV 3D<\/div>';

  // Try PDF first, fallback to printable window
  if (returnHtmlOnly) {
    return docWindow('MT — ' + d.refNum, body, { returnHtmlOnly: true });
  }
  docWindow('MT — ' + d.refNum, body);
}

// ============================================================================
// DOC 2 — PLIEGO DE CONDICIONES
// ============================================================================
function generatePliego(opt) {
  const returnHtmlOnly = !!(opt && typeof opt === 'object' && opt.returnHtmlOnly);
  if (!returnHtmlOnly && typeof raEnsureAnalysisReadyForDoc === 'function' && !raEnsureAnalysisReadyForDoc()) return;
  const d = _docGetProjectCalcs();
  const t = d.tit;
  const loc = (t.dir ? t.dir + ', ' : '') + (t.mun || '') + (t.prov ? ', ' + t.prov : '');

  const body =
    '<div class="hdr"><div class="hdr-l">' +
    '<span class="badge">PLIEGO DE CONDICIONES<\/span>' +
    '<h1>Instalación Fotovoltaica de Autoconsumo<\/h1>' +
    '<p>' + loc + '<\/p><\/div>' +
    '<div class="hdr-r"><strong>' + d.refNum + '<\/strong>Fecha: ' + d.fechaStr + '<br>Rev. R0<\/div><\/div>' +

    '<h2>CAPÍTULO I — CONDICIONES GENERALES<\/h2>' +
    '<h3>Artículo 1. Objeto<\/h3>' +
    '<p>El presente Pliego regula la ejecución de la instalación fotovoltaica de autoconsumo de <strong>' + d.P_dc_kW.toFixed(2) + ' kWp<\/strong> proyectada para ' + t.nombre + ' en ' + (loc || 'la ubicación indicada en la memoria técnica') + '. Son documentos contractuales: Memoria Técnica, Pliego, Presupuesto, Esquema Unifilar y Plano de Planta. Ante contradicciones prevalece este orden.<\/p>' +
    '<h3>Artículo 2. Normativa<\/h3>' +
    '<p>Obligatorio: RD 842/2002 (REBT) e ITC-BT correspondientes; RD 244/2019; RD 1183/2020; normas UNE de aplicación; ordenanzas municipales; prescripciones de ' + t.dist + '.<\/p>' +

    '<h2>CAPÍTULO II — CONDICIONES DE MATERIALES<\/h2>' +
    '<h3>Artículo 3. Módulos Fotovoltaicos<\/h3>' +
    '<p>Homologados conforme a <strong>UNE-EN IEC 61215<\/strong> (cualificación del diseño) y <strong>UNE-EN IEC 61730<\/strong> (seguridad), con marcado CE. Potencia mínima ' + d.cfg.potencia + ' Wp\/módulo. Garantía de potencia: ≥ 90 % a 12 años, ≥ 80 % a 25 años.<\/p>' +
    '<table><tr><th>Parámetro<\/th><th>Especificación mínima<\/th><\/tr>' +
    '<tr><td>Potencia pico<\/td><td>≥ ' + d.cfg.potencia + ' Wp (STC)<\/td><\/tr>' +
    '<tr><td>Eficiencia<\/td><td>≥ ' + d.cfg.rendimiento + ' %<\/td><\/tr>' +
    '<tr><td>Tensión máx. sistema<\/td><td>≥ 1.000 V CC<\/td><\/tr>' +
    '<tr><td>Clase de seguridad<\/td><td>Clase II (doble aislamiento)<\/td><\/tr>' +
    '<tr><td>Grado de protección (junction box)<\/td><td>IP 67 mínimo<\/td><\/tr>' +
    '<tr><td>Normas<\/td><td>IEC 61215, IEC 61730, IEC 61701 (corrosión salina)<\/td><\/tr>' +
    '<\/table>' +
    '<h3>Artículo 4. Inversor<\/h3>' +
    '<p>Inversor <strong>' + (d.inverter ? d.inverter.fullName : ('nominal ' + d.P_ac_kW.toFixed(2) + ' kW')) + '</strong> con seguidores MPPT independientes, protección anti-isla conforme a <strong>RD 1699\/2011<\/strong> y procedimiento <strong>UNE 217001<\/strong>, marcado CE y aceptación de ' + t.dist + '.<\/p>' +
    '<table><tr><th>Parámetro<\/th><th>Especificación del Proyecto<\/th><\/tr>' +
    '<tr><td>Marca y Modelo seleccionado<\/td><td><strong>' + (d.inverter ? d.inverter.fullName : 'Inversor Central Inteligente') + '</strong><\/td><\/tr>' +
    '<tr><td>Potencia nominal AC<\/td><td>' + (d.inverter ? d.inverter.kw : d.P_ac_kW.toFixed(2)) + ' kW (' + (d.monofasico ? 'Monofásico 230 V' : 'Trifásico 400 V') + ')<\/td><\/tr>' +
    '<tr><td>Tensión máx. entrada DC (Vmax,dc)<\/td><td>≥ ' + (d.V_max_inv || Math.ceil(d.Voc_str_cold)) + ' V CC<\/td><\/tr>' +
    '<tr><td>Rendimiento europeo<\/td><td>≥ ' + (d.inverter ? d.inverter.efficiency : 97) + ' %<\/td><\/tr>' +
    '<tr><td>Factor de potencia<\/td><td>cos φ ≥ 0,95 ind./cap. configurable<\/td><\/tr>' +
    '<tr><td>Grado de protección<\/td><td>IP 65 mínimo (Apto exterior)<\/td><\/tr>' +
    '<tr><td>Garantía de producto<\/td><td>≥ 10 años de garantía oficial<\/td><\/tr>' +
    '<\/table>' +
    (d.hasBattery && d.battery ? (
      '<h3>Artículo 4.b. Sistema de Almacenamiento (Batería LFP)<\/h3>' +
      '<p>Sistema de almacenamiento modular <strong>' + d.battery.fullName + '</strong> (' + d.battery.totalKwh.toFixed(1) + ' kWh útiles, tecnología ' + (d.battery.technology || 'LiFePO4') + '). Conforme a <strong>UNE-EN IEC 62619<\/strong> (seguridad en baterías industriales de litio) y <strong>CEI 0-21<\/strong>. Incluye BMS integrado con equilibrado dinámico de celdas, protección térmica integral, seccionamiento CC y comunicación CAN Bus / RS485 certificada con el inversor híbrido. Garantía mínima de 10 años o 6.000 ciclos de descarga al 90% DoD.<\/p>'
    ) : '') +
    '<h3>Artículo 5. Conductores<\/h3>' +
    '<p>DC: cable solar <strong>ZZ-F 1.800 V CC<\/strong>, libre de halógenos, UV, humedad (−40 °C a +90 °C). Conectores estancos tipo MC4 certificados. AC: <strong>RV-K 0,6\/1 kV<\/strong> libre de halógenos.<\/p>' +
    '<h3>Artículo 6. Estructura Soporte<\/h3>' +
    '<p>Aluminio anodizado o acero galvanizado en caliente, calculada para cargas de nieve y viento según <strong>CTE DB-SE-AE<\/strong>. Fijaciones al tejado estancas con sellado silicona neutra. No se admitirán anclajes que dañen la impermeabilización sin posterior reparación garantizada.<\/p>' +
    '<h3>Artículo 7. Protecciones<\/h3>' +
    '<p>Fusibles tipo <strong>gPV<\/strong> ≥ 1.000 V CC (IEC 60269-6) ' + (d.useFuses ? '(incorporados, > 2 strings en paralelo)' : '(no requeridos, ≤ 2 strings en paralelo)') + '. Diferencial <strong>' + (d.rcdType || 'Clase A') + '<\/strong> (' + ((d.rcdType === 'Clase B') ? 'sensible a componentes continuas y de alta frecuencia según UNE-EN 62423' : 'sensible a CA y CC pulsante según UNE-EN 61008') + '), ' + (d.rcdSensMa || 30) + ' mA. IGA curva C ' + d.I_iga + ' A, Icc ≥ 6 kA.<\/p>' +

    '<h2>CAPÍTULO III — EJECUCIÓN<\/h2>' +
    '<h3>Artículo 8. Empresa Instaladora<\/h3>' +
    '<p>Empresa habilitada como <strong>Instalador de BT Especialista en Instalaciones Fotovoltaicas<\/strong> (categoría ICAT), inscrita en el registro autonómico correspondiente.<\/p>' +
    '<h3>Artículo 9. Identificación de Conductores<\/h3>' +
    '<p>DC: rojo (+) / negro (−). AC: marrón (L1), negro (L2), gris (L3), azul (N), amarillo-verde (PE). Todos los conductores quedarán debidamente señalizados y protegidos en canalizaciones con pendiente al exterior.<\/p>' +
    '<h3>Artículo 10. Puesta a Tierra<\/h3>' +
    '<p>La instalación FV se conectará a tierra existente del inmueble o se instalará toma independiente con R ≤ ' + d.R_tierra + ' Ω (ITC-BT-18\/40). Masas metálicas (marcos, estructura, carcasa inversor) conectadas a tierra.<\/p>' +

    '<h2>CAPÍTULO IV — PRUEBAS Y RECEPCIÓN (UNE-EN 62446)<\/h2>' +
    '<table><tr><th>Ensayo<\/th><th>Criterio de aceptación<\/th><\/tr>' +
    '<tr><td>Inspección visual<\/td><td>Sin daños; correcta ID de conductores<\/td><\/tr>' +
    '<tr><td>Continuidad conductores de protección<\/td><td>R ≤ 0,5 Ω<\/td><\/tr>' +
    '<tr><td>Resistencia de aislamiento DC<\/td><td>R_iso ≥ 1 MΩ por string (500 V CC)<\/td><\/tr>' +
    '<tr><td>Resistencia de aislamiento AC<\/td><td>R_iso ≥ 0,5 MΩ (500 V CA)<\/td><\/tr>' +
    '<tr><td>Comprobación de polaridad DC<\/td><td>Polaridad correcta en todos los strings<\/td><\/tr>' +
    '<tr><td>Verificación función MPPT<\/td><td>Potencia ≥ 90 % de la teórica en condiciones normales<\/td><\/tr>' +
    '<tr><td>Verificación anti-islamiento<\/td><td>Disparo en t ≤ 200 ms<\/td><\/tr>' +
    '<tr><td>Resistencia de tierra<\/td><td>R ≤ ' + d.R_tierra + ' Ω<\/td><\/tr>' +
    '<\/table>' +

    '<h2>CAPÍTULO V — GARANTÍAS Y MANTENIMIENTO<\/h2>' +
    '<table><tr><th>Componente<\/th><th>Garantía mínima<\/th><\/tr>' +
    '<tr><td>Módulos FV (producto)<\/td><td>' + _eqWar.warMod + ' años oficial<\/td><\/tr>' +
    '<tr><td>Módulos FV (potencia lineal)<\/td><td>' + _eqWar.warPower + ' años (≥ 80 % Pnom)<\/td><\/tr>' +
    '<tr><td>Inversor & Conversión<\/td><td>' + _eqWar.warInv + ' años' + (_eqWar.isMicro ? ' (Microinversor oficial)' : ' (extensible)') + '<\/td><\/tr>' +
    (_eqWar.hasBat ? ('<tr><td>Batería de Acumulación (LiFePO4)<\/td><td>' + _eqWar.warBat + ' años o 6.000 ciclos<\/td><\/tr>') : '') +
    '<tr><td>Estructura soporte & Fijaciones<\/td><td>10 años inox A2<\/td><\/tr>' +
    '<tr><td>Mano de obra instalación<\/td><td>' + _eqWar.warMo + ' años (cobertura instalador)<\/td><\/tr>' +
    '<\/table>' +
    '<p>Se recomienda revisión anual: limpieza de módulos, inspección visual de cables y conectores, comprobación de aprietes, verificación de protecciones y análisis de producción vs. estimado.<\/p>' +
    '<p style="font-size:8pt;color:#6b7280;margin-top:8px;"><strong>Exclusiones de obra:<\/strong> Salvo expresa inclusión en el Capítulo de Equipamiento y Servicios Adicionales (CAP. EXT) del Presupuesto, quedan excluidas del alcance del instalador: el pago delegado de tasas e impuestos municipales (ICIO / licencia urbanística), tasas por ocupación de vía pública, medios de elevación extraordinarios no previstos y refuerzos estructurales de cubierta o forjado.<\/p>' +

    '<div class="sig-row"><div class="sig">El Titular<br><br><br>' + t.nombre + '<\/div>' +
    '<div class="sig">El Técnico<br><br><br>' + t.tecnico + '<\/div>' +
    '<div class="sig">Fecha<br><br><br>' + d.fechaStr + '<\/div><\/div>' +
    '<div class="footer">' + d.refNum + ' — PLIEGO DE CONDICIONES — Rev. R0 — ' + d.fechaStr + '<\/div>';

  if (returnHtmlOnly) {
    return docWindow('PC — ' + d.refNum, body, { returnHtmlOnly: true });
  }
  docWindow('PC — ' + d.refNum, body);
}


// ============================================================================
// DOC 3 — PRESUPUESTO DETALLADO
// ============================================================================
function generatePresupuesto(skipPricingModal, opt) {
  const returnHtmlOnly = !!(opt && typeof opt === 'object' && opt.returnHtmlOnly);
  if (!returnHtmlOnly && typeof raEnsureAnalysisReadyForDoc === 'function' && !raEnsureAnalysisReadyForDoc()) return;
  if (!returnHtmlOnly && !skipPricingModal && typeof wpOpenPricingReviewModal === 'function') {
    wpOpenPricingReviewModal(function() {
      generatePresupuesto(true);
    });
    return;
  }
  const d = _docGetProjectCalcs();
  const t = d.tit;
  const m = (typeof calculateFinancialModel === 'function') ? calculateFinancialModel() : null;

  // 📏 Metrado exacto de cableado medido en 3D
  // Honestidad documental: distinguir medición 3D real de estimación paramétrica
  const dcEs3D = !!d.L_dc_esMedida3D;
  const acEs3D = !!d.L_ac_esMedida3D;
  const origenDc = dcEs3D ? 'medición real 3D' : 'estimación paramétrica (trazado no realizado)';
  const origenAc = acEs3D ? 'medición real 3D' : 'estimación paramétrica (contador no ubicado en 3D)';
  const lDcReal = d.L_dc || 25.0;
  const lAcReal = d.L_ac || 15.0;
  const sDcReal = d.S_dc_real || d.S_str || 6;
  const sAcReal = d.S_ac_real || d.S_ac || 10;
  const sStateDoc = (typeof window !== 'undefined' && window.inverterEquipmentState) ? window.inverterEquipmentState : null;
  let totalMetrosDC = Math.round(lDcReal * Math.max(d.numStrings || 1, 1) * 2); // Polaridad (+) y (-)
  if (sStateDoc && sStateDoc.cableBreakdown && typeof sStateDoc.cableBreakdown.totalDcCableMeters === 'number' && sStateDoc.cableBreakdown.totalDcCableMeters > 0) {
    totalMetrosDC = Math.round(sStateDoc.cableBreakdown.totalDcCableMeters);
  } else if (sStateDoc && Array.isArray(sStateDoc.stringTelemetry) && sStateDoc.stringTelemetry.length > 0) {
    totalMetrosDC = Math.round(sStateDoc.stringTelemetry.reduce((acc, st) => acc + ((st.posHomerunLength || st.homerunLength || lDcReal) + (st.negHomerunLength || st.homerunLength || lDcReal) + (st.returnConductorLength || 0)), 0));
  }
  const totalMetrosAC = Math.round(lAcReal); // Metros lineales de manguera multipolar RV-K (ITC-BT-40)

  // Sincronización estricta con el Modelo Financiero SSOT
  const estCostTotal = (m && m.estCost > 0) ? m.estCost : (d.pres_est || (d.numPanels * 45.0));
  const puEstructuraPorModulo = d.numPanels > 0 ? (estCostTotal / d.numPanels) : 45.0;
  const isPergola = !!(typeof WP !== 'undefined' && WP && Array.isArray(WP.polylines) && WP.polylines.some(p => p && (p.structureType === 'pergola' || (p.estructura && p.estructura.tipo === 'pergola'))));
  const descEstructura = isPergola
    ? 'Estructura tipo Pérgola Elevada autoportante de aluminio/acero galvanizado con pilares anclados a forjado y vigas de dintel reforzadas'
    : (d.isCoplanar ? 'Estructura coplanar de aluminio anodizado EN AW-6063 T6 para fijación a cubierta inclinada' : 'Estructura soporte autoportante con perfilería continua de aluminio y fijaciones inox A2');

  const mb = (d && d.modulesBreakdown) || (typeof window !== 'undefined' && window.RAModulesBreakdown && typeof window.RAModulesBreakdown.getProjectModulesBreakdown === 'function' ? window.RAModulesBreakdown.getProjectModulesBreakdown() : null);
  let cap1Items = [];
  if (mb && mb.isMultiModule) {
    cap1Items = mb.byModel.map((mod, idx) => ({
      ref: '1.' + (idx + 1),
      desc: 'Módulo FV ' + mod.fullName + ' (' + mod.wp + ' Wp, ' + mod.technology + '). Eficiencia ' + mod.efficiency + '%, Vmp ' + mod.vmp.toFixed(1) + ' V, Imp ' + mod.imp.toFixed(1) + ' A. Certificaciones IEC 61215/61730. Subcampos: ' + mod.roofNames.join(', ') + '. Garantía de potencia 25 años.',
      ud: 'ud',
      q: mod.count,
      pu: mod.unitPrice
    }));
  } else {
    cap1Items = [
      { ref:'1.1', desc: 'Módulo FV ' + d.cfg.modelo + ' (' + d.cfg.potencia + ' Wp, ' + d.cfg.tecnologia + '). Certificaciones IEC 61215, IEC 61730 e ISO 9001. Garantía 12/25 años de producto y 25 años de producción lineal (≥84.8%).', ud:'ud', q: d.numPanels, pu: (m && m.panCost ? (m.panCost / d.numPanels) : (d.cfg.precio || 125.0)) }
    ];
  }

  const caps = [
    { titulo: 'CAP. 1 — MÓDULOS FOTOVOLTAICOS TIER-1' + (mb && mb.isMultiModule ? ' (DESGLOSE MULTI-MODELO)' : ''),
      items: cap1Items
    },
    { titulo: 'CAP. 2 — ESTRUCTURA SOPORTE (' + (d.isCoplanar ? 'COPLANAR A CUBIERTA' : 'PARAMÉTRICA / LASTRADA') + ')',
      items: [
        { ref:'2.1', desc: descEstructura + '. Incluso perfiles continuos, grapas de fijación inter-panel, tornillería A2 inox y juntas de estanqueidad EPDM calculadas por Árbol BIM.', ud:'ud mod', q: d.numPanels, pu: puEstructuraPorModulo }
      ]
    },
    { titulo: 'CAP. 3 — SISTEMA DE GENERACIÓN Y CONVERSIÓN',
      items: [
        { ref:'3.1', desc:'Inversor ' + (d.inverter ? d.inverter.fullName : (((typeof d.P_ac_kW === 'number') ? d.P_ac_kW.toFixed(2) : '5.00') + ' kW')) + ', ' + (d.monofasico ? 'monofásico 230 V' : 'trifásico 400 V') + ', ' + (d.numStrings > 1 ? 'doble seguidor MPPT independiente' : 'seguidor MPPT') + ', rendimiento europeo η > ' + ((d.inverter && d.inverter.efficiency) || 98.2) + '%, monitorización WiFi/Ethernet integrada y grado de protección IP65.', ud:'ud', q: (m && m.invCount && m.invCount > 0) ? m.invCount : 1, pu: (m && m.invCost ? (m.invCost / ((m.invCount && m.invCount > 0) ? m.invCount : 1)) : (d.pres_inv || 1100.0)) }
      ]
    }
  ];

  // Si existen optimizadores de potencia MLPE, incorporar su capítulo
  if (m && m.mlpeCost > 0) {
    const mlpeCount = m.mlpeCount || d.mlpeCount || 1;
    caps.push({
      titulo: 'CAP. OPT — OPTIMIZADORES DE POTENCIA A NIVEL DE MÓDULO (MLPE)',
      items: [
        { ref: 'OPT.1', desc: 'Optimizadores DC de punto de máxima potencia a nivel de módulo individual (MLPE) para mitigación de sombras y monitorización granular.', ud: 'ud', q: mlpeCount, pu: m.mlpeCost / mlpeCount }
      ]
    });
  }

  // Si existe sistema de almacenamiento (Batería LFP), incorporar su capítulo
  if (m && m.batCost > 0) {
    const batKwh = m.batCap || 5.12;
    caps.push({
      titulo: 'CAP. 4 — SISTEMA DE ALMACENAMIENTO ELECTROQUÍMICO (BATERÍA LFP)',
      items: [
        { ref:'4.1', desc:((d.battery && d.battery.fullName) ? (d.battery.fullName + ' de ' + batKwh.toFixed(1) + ' kWh de capacidad útil') : ('Sistema de acumulación modular de litio-ferrofosfato (LiFePO4) de ' + batKwh.toFixed(1) + ' kWh de capacidad útil')) + ', BMS integrado, DoD 90% y >6.000 ciclos de vida útil con comunicación CAN/RS485 y certificación UNE-EN IEC 62619.', ud:'ud', q: (m.batCount || 1), pu: m.batCost / (m.batCount || 1) }
      ]
    });
  }

  // Capítulos de cableado, mano de obra y legalización
  const capIdxOffset = (m && m.batCost > 0) ? 1 : 0;
  const numCap = (n) => 'CAP. ' + (n + capIdxOffset);

  const cabCostReal = (m && m.cabCost > 0) ? m.cabCost : (d.pres_cab || 350.0);
  const moCostReal  = (m && m.moCost > 0)  ? m.moCost  : (d.pres_mo  || 1400.0);
  const legCostReal = (m && m.legCost > 0) ? m.legCost : (d.pres_leg || 350.0);

  caps.push(
    { titulo: numCap(4) + ' — CABLEADO, CANALIZACIONES Y PROTECCIONES (REBT ITC-BT-40)',
      items: [
        { ref:'4.1', desc:'Líneas solares DC tipo ZZ-F 1.500 V CC de ' + sDcReal + ' mm² (' + origenDc + ': ' + totalMetrosDC + ' m acumulados) y evacuación RV-K 0,6/1 kV (' + origenAc + ': ' + totalMetrosAC + ' m). Incluso conectores MC4 y canalizaciones.', ud:'partida', q: 1, pu: cabCostReal * 0.40 },
        { ref:'4.2', desc:'Cuadros de protección normalizados DC (SPD Clase II + seccionador) y AC (IGA ' + d.I_iga + ' A + diferencial clase A superinmunizado + sobretensiones permanentes/transitorias) y puesta a tierra.', ud:'partida', q: 1, pu: cabCostReal * 0.60 }
      ]
    },
    { titulo: numCap(5) + ' — MANO DE OBRA ESPECIALIZADA, MONTAJE Y CERTIFICACIÓN',
      items: [
        { ref:'5.1', desc:'Montaje mecánico completo de subestructura y módulos, tendido de conducciones, conexionado eléctrico bajo normativa de seguridad en altura y puesta en servicio conforme a UNE-EN 62446-1.', ud:'ud', q:1, pu: moCostReal }
      ]
    },
    { titulo: numCap(6) + ' — INGENIERÍA, LEGALIZACIÓN Y TRAMITACIÓN ADMINISTRATIVA',
      items: [
        { ref:'6.1', desc:'Elaboración de Memoria Técnica de Diseño / Proyecto de Ejecución, tramitación del Certificado de Instalación Eléctrica (CIE / Boletín) en Industria y registro de autoconsumo en CCAA (RD 244/2019).', ud:'ud', q:1, pu: legCostReal }
      ]
    }
  );

  if (m && m.marginEur > 0) {
    caps.push({
      titulo: numCap(caps.length + 1) + ' — GASTOS GENERALES, BENEFICIO INDUSTRIAL Y MARGEN COMERCIAL',
      items: [
        { ref: (caps.length + 1) + '.1', desc: 'Gastos de gestión, coordinación de seguridad y salud, beneficio industrial y garantía comercial instalador.', ud: 'partida', q: 1, pu: m.marginEur }
      ]
    });
  }

  // Si existen aerogeneradores (Minieólica), incorporar su capítulo
  if (m && m.windCost > 0) {
    const windCount = (typeof window !== 'undefined' && Array.isArray(window.windTurbines))
      ? window.windTurbines.filter(t => t && (!t.operationalState || t.operationalState.enabled !== false)).length
      : 1;
    caps.push({
      titulo: 'CAP. EÓL — SISTEMA DE GENERACIÓN MINIEÓLICA URBANA / RURAL',
      items: [
        { ref: 'EOL.1', desc: 'Aerogenerador de minieólica de alta eficiencia con regulador de carga MPPT, freno electrodinámico y mástil autoportante certificado.', ud: 'ud', q: Math.max(windCount, 1), pu: m.windCost / Math.max(windCount, 1) }
      ]
    });
  }

  // Add-ons y Servicios Adicionales Comerciales
  const commCfg = (typeof RAPricing !== 'undefined' && typeof RAPricing.getCommercialConfig === 'function') ? RAPricing.getCommercialConfig() : null;
  const allAddons = commCfg ? (commCfg.addons || []).concat(commCfg.customAddons || []) : [];
  const activeAddons = allAddons.filter(a => a && a.enabled);
  if (activeAddons.length > 0) {
    caps.push({
      titulo: 'CAP. EXT — EQUIPAMIENTO Y SERVICIOS ADICIONALES (EXTRAS)',
      items: activeAddons.map((ad, idx) => ({
        ref: 'EXT.' + (idx + 1),
        desc: ad.name,
        ud: 'ud',
        q: Number(ad.qty) || 1,
        pu: Number(ad.unitPrice) || 0
      }))
    });
  }

  // Bonificación / Descuento Comercial
  if (m && m.discountEur > 0) {
    caps.push({
      titulo: 'CAP. PROM — BONIFICACIÓN Y PROMOCIÓN COMERCIAL APLICADA',
      items: [
        { ref: 'PROM.1', desc: (m.discountLabel || 'Promoción Comercial Especial'), ud: 'partida', q: 1, pu: -Math.round(m.discountEur) }
      ]
    });
  }

  let itemRows = '', sumRows = '';
  const totalCapsPEM = caps.reduce((accum, cap) => {
    return accum + cap.items.reduce((s, it) => s + (it.q * it.pu), 0);
  }, 0);
  let subtotalCalc = 0;
  caps.forEach(cap => {
    const capTotal = cap.items.reduce((s, it) => s + it.q * it.pu, 0);
    subtotalCalc += capTotal;
    itemRows += '<tr style="background:#dbeafe"><td colspan="6" style="font-weight:900;color:#0d2b45;padding:7px">' + cap.titulo + '</td></tr>';
    cap.items.forEach(it => {
      const imp = it.q * it.pu;
      itemRows += '<tr><td style="color:#6b7280;font-size:8pt">' + it.ref + '</td><td>' + it.desc +
        '</td><td style="text-align:center">' + it.ud +
        '</td><td style="text-align:right">' + (typeof it.q === 'number' ? it.q.toLocaleString('es-ES', {maximumFractionDigits:1}) : it.q) +
        '</td><td style="text-align:right">' + it.pu.toLocaleString('es-ES', {minimumFractionDigits:2}) + ' €' +
        '</td><td style="text-align:right;font-weight:700">' + imp.toLocaleString('es-ES', {minimumFractionDigits:2}) + ' €</td></tr>';
    });
    itemRows += '<tr class="trow-total"><td colspan="5" style="text-align:right">SUBTOTAL ' + cap.titulo.split('—')[0].trim() + '</td><td style="text-align:right;font-weight:900;color:#1d4ed8">' + capTotal.toLocaleString('es-ES', {minimumFractionDigits:2}) + ' €</td></tr>';
    const capPctOfTotal = (totalCapsPEM > 0) ? ((capTotal / totalCapsPEM) * 100).toFixed(1) : '0.0';
    sumRows += '<tr><td>' + cap.titulo + '</td><td style="text-align:right;font-weight:700">' + capTotal.toLocaleString('es-ES', {minimumFractionDigits:2}) + ' €</td><td style="text-align:right;color:#6b7280">' + capPctOfTotal + ' %</td></tr>';
  });

  // Sincronización milimétrica con el SSOT Financiero Bancable (evita redondeos flotantes divergentes)
  const _snapBud = (typeof window !== 'undefined' && typeof window.raBuildDocSnapshot === 'function')
    ? window.raBuildDocSnapshot(d, m)
    : null;
  const ivaRateBud = _snapBud ? _snapBud.ivaRate : ((m && typeof m.ivaRate === 'number') ? m.ivaRate : 0.21);
  const subtotalFinal = _snapBud ? _snapBud.subtotal : (m ? m.subtotal : Math.round(subtotalCalc));
  const iva = _snapBud ? _snapBud.iva : (m ? m.iva : Math.round(subtotalFinal * ivaRateBud));
  const capexBruto = _snapBud ? _snapBud.capexBruto : (m ? m.capexBruto : (subtotalFinal + iva));
  const degAnnBud = _snapBud ? _snapBud.degAnnualPct : ((m && typeof m.degAnnualPct === 'number') ? m.degAnnualPct : 0.40);
  const inflBud = _snapBud ? _snapBud.inflacionPct : ((m && typeof m.inflacionPct === 'number') ? m.inflacionPct : 3.0);

  // Incentivos y retorno bancable (25 años)
  // [AUD-2026 · A-03] Nunca sustituir por constantes de escaparate (16,4 % / 4,2 años).
  const FIN_MISSING_BUDGET = !m;
  const tirVal = m ? (typeof m.tir === 'number' ? m.tir.toFixed(1) : m.tir) : 'N/D';
  const vanVal = m ? ((typeof m.van === 'number' && isFinite(m.van)) ? Math.round(m.van).toLocaleString('es-ES') : 'N/D') : 'N/D';
  const lcoeVal = m ? ((typeof m.lcoe === 'number') ? m.lcoe.toFixed(3) : 'N/D') : 'N/D';
  const paybackVal = m ? ((typeof m.paybackYears === 'number') ? m.paybackYears.toFixed(1) : 'N/D') : 'N/D';
  const capexNeto = m ? m.capexNeto : capexBruto;
  const ahorroAnio1 = m ? Math.round(m.ahorroLuzAnio1).toLocaleString('es-ES') : (d.ahorro_anual > 0 ? Math.round(d.ahorro_anual).toLocaleString('es-ES') : 'N/D');

  const body = `
  ${FIN_MISSING_BUDGET ? '<div class="doc-warning" style="border:2px solid #ef4444;background:#fef2f2;color:#991b1b;padding:10px 14px;border-radius:6px;margin:10px 0;font-size:10pt;font-weight:700;">⚠️ PRESUPUESTO SIN MODELO FINANCIERO: los indicadores de rentabilidad figuran como «N/D».</div>' : ''}
  <div class="doc-sheet">
    <div class="doc-header">
      <div class="doc-header-left">
        <div class="doc-logo-box">
          <div class="doc-logo-icon">💶</div>
          <div>
            <div class="doc-logo-title">PRESUPUESTO DETALLADO DE EJECUCIÓN</div>
            <div class="doc-logo-sub">Medición Exacta 3D · BOM Normalizado · Modelo Financiero Bancable a 25 Años</div>
          </div>
        </div>
      </div>
      <div class="doc-header-right">
        <div class="doc-meta-item"><b>Ref.:</b> ${d.refNum}</div>
        <div class="doc-meta-item"><b>Fecha:</b> ${d.fechaStr}</div>
        <div class="doc-meta-item"><b>Validez:</b> 30 días naturales</div>
      </div>
    </div>

    <div class="doc-section-title">1. DATOS GENERALES DEL PROYECTO Y TITULAR</div>
    <div class="doc-box">
      <div class="doc-grid-3">
        <div><b>Titular:</b> ${t.nombre || 'Propiedad Privada'}</div>
        <div><b>NIF/CIF:</b> ${t.nif || 'B-12345678'}</div>
        <div><b>CUPS:</b> ${t.cups || 'ES0021...'}</div>
        <div class="doc-grid-span2"><b>Dirección:</b> ${t.dir || 'Ubicación seleccionada'}, ${t.mun || 'Madrid'} (${t.prov || 'Madrid'})</div>
        <div><b>Distribuidora:</b> ${t.dist || 'e-distribución'}</div>
      </div>
    </div>

    <div class="doc-section-title">2. RESUMEN TÉCNICO Y MEDICIONES CLAVE 3D</div>
    <div class="doc-grid-4" style="margin-bottom:12px">
      <div class="kpi-card"><div class="kpi-val">${d.kwp} kWp</div><div class="kpi-lbl">Potencia Pico Instalada</div></div>
      <div class="kpi-card"><div class="kpi-val">${d.numPanels} uds</div><div class="kpi-lbl">Módulos Fotovoltaicos</div></div>
      <div class="kpi-card"><div class="kpi-val">${totalMetrosDC} m</div><div class="kpi-lbl">Cable Solar ZZ-F (${sDcReal} mm²)</div></div>
      <div class="kpi-card"><div class="kpi-val">${totalMetrosAC} m</div><div class="kpi-lbl">Evacuación RV-K (${sAcReal} mm²)</div></div>
    </div>

    <div class="doc-section-title">3. DESGLOSE DETALLADO POR PARTIDAS Y CAPÍTULOS</div>
    <table class="doc-table">
      <thead>
        <tr>
          <th style="width:40px">CÓD.</th>
          <th>DESCRIPCIÓN DE LA UNIDAD DE OBRA</th>
          <th style="width:35px;text-align:center">UD.</th>
          <th style="width:50px;text-align:right">CANT.</th>
          <th style="width:75px;text-align:right">PRECIO UD.</th>
          <th style="width:85px;text-align:right">IMPORTE</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
    </table>

    ${(mb && mb.byRoof && mb.byRoof.length > 0)
      ? `<div class="doc-section-title" style="margin-top:16px">RESUMEN DE INVERSIÓN Y SUBDIVISIÓN POR CUBIERTA / FALDÓN</div>
         <p style="font-size:8.5pt;color:#64748b;margin-bottom:8px;">Desglose analítico de potencia instalada, modelo de módulo y estructura asignada a cada plano de cubierta según estudio BIM 3D.</p>
         ${(typeof window !== 'undefined' && window.RAModulesBreakdown)
           ? window.RAModulesBreakdown.renderSubfieldsTableHTML(mb, { includeCost: true })
           : ''}`
      : ''
    }

    <div class="doc-section-title" style="margin-top:16px">4. RESUMEN ECONÓMICO Y BALANCE FINANCIERO BANCABLE (25 AÑOS)</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">
      <table class="doc-table">
        <thead><tr><th>RESUMEN POR CAPÍTULOS</th><th style="text-align:right">IMPORTE</th><th style="text-align:right">%</th></tr></thead>
        <tbody>
          ${sumRows}
          <tr style="background:#f1f5f9;font-weight:700"><td>BASE IMPONIBLE (SUBTOTAL)</td><td style="text-align:right">${subtotalFinal.toLocaleString('es-ES', {minimumFractionDigits:2})} €</td><td style="text-align:right">100.0 %</td></tr>
          <tr><td>IVA REPERCUTIDO (${Math.round(ivaRateBud * 100)}%)</td><td style="text-align:right">${iva.toLocaleString('es-ES', {minimumFractionDigits:2})} €</td><td></td></tr>
          <tr style="background:#dbeafe;font-weight:900;font-size:11pt"><td>TOTAL PRESUPUESTO (CAPEX BRUTO)</td><td style="text-align:right;color:#1d4ed8">${capexBruto.toLocaleString('es-ES', {minimumFractionDigits:2})} €</td><td></td></tr>
          <tr style="background:#dcfce7;font-weight:800;color:#15803d"><td>COSTE NETO TRAS INCENTIVOS FISCALES</td><td style="text-align:right">${capexNeto.toLocaleString('es-ES', {minimumFractionDigits:2})} €</td><td></td></tr>
        </tbody>
      </table>

      <div class="doc-box" style="background:#f8fafc;border-color:#cbd5e1;display:flex;flex-direction:column;justify-content:space-between">
        <div>
          <div style="font-weight:800;font-size:10.5pt;color:#0f172a;margin-bottom:8px">📊 RENTABILIDAD Y VIABILIDAD FINANCIERA (VAN / TIR)</div>
          <div style="font-size:8.5pt;color:#475569;margin-bottom:10px">Modelo de flujo de caja descontado a 25 años considerando degradación de paneles (${degAnnBud.toFixed(2)}%/año), IPC eléctrico (${inflBud.toFixed(1)}%/año) y sustitución preventiva de inversor en año 12:</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div class="kpi-card" style="background:#fff"><div class="kpi-val" style="color:#10b981">${tirVal} %</div><div class="kpi-lbl">TIR (Rentabilidad Anual)</div></div>
            <div class="kpi-card" style="background:#fff"><div class="kpi-val" style="color:#0284c7">${vanVal} €</div><div class="kpi-lbl">VAN (Valor Actual Neto)</div></div>
            <div class="kpi-card" style="background:#fff"><div class="kpi-val" style="color:#8b5cf6">${lcoeVal} €/kWh</div><div class="kpi-lbl">LCOE (Coste Generación)</div></div>
            <div class="kpi-card" style="background:#fff"><div class="kpi-val" style="color:#f59e0b">${paybackVal} años</div><div class="kpi-lbl">Retorno de Inversión</div></div>
          </div>
        </div>
        <div style="margin-top:10px;padding:8px;background:rgba(16,185,129,0.08);border-left:3px solid #10b981;font-size:8.5pt;color:#065f46">
          💰 <b>Ahorro estimado Año 1:</b> ${ahorroAnio1} €/año frente a su factura actual. La energía fotovoltaica generada tiene un coste cerrado de <b>${lcoeVal} €/kWh</b> frente a los ~0.18 €/kWh de la red eléctrica convencional.
        </div>
      </div>
    </div>

    ${buildAmortizationSvg(capexBruto, m && m.financialSchedule25)}

    ${window.ultimoComparativo ? `
    <div style="margin-top:18px;page-break-inside:avoid;">
      <h2>COMPARATIVA DE ESCENARIOS — PRODUCCIÓN Y RENTABILIDAD</h2>
      <table>
        <tr><th>Escenario</th><th style="text-align:right">kWh/año</th><th style="text-align:right">CAPEX (€)</th><th style="text-align:right">Ahorro/año (€)</th><th style="text-align:right">Payback (años)</th><th style="text-align:right">VAN 4% (€)</th><th style="text-align:right">TIR 25a</th></tr>
        ${window.ultimoComparativo.escenarios.map(s => `
        <tr>
          <td><b>${s.nombre}</b><br><span style="font-size:7pt;color:#64748b">${s.desc || ''}</span></td>
          <td style="text-align:right">${s.kwh.toLocaleString('es-ES')}</td>
          <td style="text-align:right">${s.capex.toLocaleString('es-ES')}</td>
          <td style="text-align:right">${s.ahorro.toLocaleString('es-ES')}</td>
          <td style="text-align:right">${s.payback ? s.payback.toFixed(1) : '—'}</td>
          <td style="text-align:right;color:${s.van > 0 ? '#10b981' : '#ef4444'}">${s.van.toLocaleString('es-ES')}</td>
          <td style="text-align:right">${s.tir != null ? s.tir.toFixed(1) + '%' : 'N/D'}</td>
        </tr>`).join('')}
      </table>
      <p style="font-size:7.5pt;color:#64748b;margin-top:4px;">
        Comparativa generada con los motores de producción del visor (modelo físico + corrección PVsyst por faldón con su inclinación y orientación reales). CAPEX = equipamiento de catálogo + instalación fija. VAN al 4% a 25 años con degradación de paneles 0,45%/año. Generada el ${window.ultimoComparativo.fecha}.
      </p>
    </div>` : ''}
    <div class="doc-footer" style="margin-top:20px;border-top:1px solid #cbd5e1;padding-top:12px;font-size:8pt;color:#64748b;display:flex;justify-content:space-between">
      <div>Presupuesto técnico vinculante por 30 días. Conforme a normativa REBT ITC-BT-40, RD 244/2019 y CTE.</div>
      <div>Firma del Técnico Proyectista / Responsable</div>
    </div>
  </div>`;

  if (returnHtmlOnly) {
    return docWindow('Presupuesto Detallado y Estudio Bancable — ' + d.refNum, body, { returnHtmlOnly: true });
  }
  docWindow('Presupuesto Detallado y Estudio Bancable — ' + d.refNum, body);
}

function generateUnifilar() {
  if (typeof raEnsureAnalysisReadyForDoc === 'function' && !raEnsureAnalysisReadyForDoc()) return;
  const d = _docGetProjectCalcs();
  if (d.numPanels === 0) {
    (typeof raAlert === 'function' ? raAlert : console.warn)('Define primero el polígono de la instalación en el visor 3D.', 'warning');
    return;
  }

  const payload = {
    refNum: d.refNum,
    fechaStr: d.fechaStr,
    nombre: d.tit.nombre,
    nif: d.tit.nif,
    dir: d.tit.dir || 'Ubicación Instalación',
    mun: d.tit.mun || '',
    prov: d.tit.prov || '',
    cups: d.tit.cups,
    dist: d.tit.dist,
    tecnico: d.tit.tecnico,
    titulacion: d.tit.titulacion,
    ncol: d.tit.ncol,
    modalTexto: d.modalTexto,
    numPanels: d.numPanels,
    numStrings: d.numStrings,
    modsActual: d.modsActual,
    cfg_pot: d.cfg.potencia,
    cfg_mod: d.cfg.modelo,
    cfg_tec: d.cfg.tecnologia,
    Voc: d.Voc,
    Isc: d.Isc,
    Vmp: d.Vmp,
    Imp: d.Imp,
    Voc_string: d.Voc_string,
    Voc_str_cold: d.Voc_str_cold,
    I_total_dc: d.I_total_dc,
    P_dc_kW: d.P_dc_kW,
    P_ac_kW: d.P_ac_kW,
    inv_kW: d.inv_kW,
    monofasico: d.monofasico,
    V_ac: d.V_ac,
    I_ac: d.I_ac,
    I_ac_d: d.I_ac_d,
    S_str: d.S_str,
    S_mdc: d.S_mdc,
    S_ac: d.S_ac,
    useFuses: d.useFuses,
    mlpeCount: d.mlpeCount,
    obstacles: d.obstacles,
    fuse_std: d.fuse_std,
    I_iga: d.I_iga,
    dif_amp: d.dif_amp,
    R_tierra: d.R_tierra,
    L_dc: d.L_dc,
    L_ac: d.L_ac,
    dVdc_p: d.dVdc_p,
    dVac_p: d.dVac_p,
    inverter: d.inverter,
    battery: d.battery,
    hasBattery: d.hasBattery,
    V_max_inv: d.V_max_inv,
    V_mppt_min: d.V_mppt_min,
    V_mppt_max: d.V_mppt_max
  };

  const svgCode = buildUnifilarSvg(payload);

  const code = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Esquema Unifilar EPLAN IEC 60617 — ${d.refNum}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #1e293b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; flex-direction: column; align-items: center; padding: 15px; }
    .header-bar { width: 100%; max-width: 1400px; background: #0f172a; color: #fff; padding: 12px 24px; display: flex; justify-content: space-between; align-items: center; border: 1px solid #334155; margin-bottom: 14px; border-radius: 6px; box-shadow: 0 4px 15px rgba(0,0,0,0.3); }
    .header-bar h1 { font-size: 14px; font-weight: 700; letter-spacing: 0.5px; color: #38bdf8; display: flex; align-items: center; gap: 8px; }
    .header-bar h1 span { color: #f59e0b; font-family: monospace; font-size: 11px; }
    .action-btns { display: flex; gap: 10px; align-items: center; }
    .btn { border: none; border-radius: 4px; padding: 8px 16px; font-size: 11px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: all 0.15s ease; text-transform: uppercase; }
    .btn-svg { background: #0ea5e9; color: #fff; }
    .btn-svg:hover { background: #0284c7; }
    .btn-dxf { background: #10b981; color: #fff; }
    .btn-dxf:hover { background: #059669; }
    .btn-print { background: #f59e0b; color: #000; }
    .btn-print:hover { background: #d97706; }
    .svg-container { width: 100%; max-width: 1400px; background: #ffffff; box-shadow: 0 10px 35px rgba(0,0,0,0.4); border-radius: 4px; overflow: hidden; }
    .svg-container svg { width: 100%; height: auto; display: block; }
    @media print {
      body { background: #fff; padding: 0; }
      .header-bar { display: none !important; }
      .svg-container { box-shadow: none; border-radius: 0; max-width: 100%; }
      @page { size: A3 landscape; margin: 5mm; }
    }
  </style>
</head>
<body>
  <div class="header-bar">
    <h1>⚡ ESQUEMA UNIFILAR NORMALIZADO EPLAN / IEC 60617 · PROYECTO FV <span>${d.refNum}</span></h1>
    <div class="action-btns">
      <button class="btn btn-svg" onclick="downloadSvg()">📥 DESCARGAR SVG</button>
      <button class="btn btn-dxf" onclick="downloadDxf()">📐 DESCARGAR DXF (AUTOCAD)</button>
      <button class="btn btn-print" onclick="window.print()">🖨️ IMPRIMIR / PDF</button>
    </div>
  </div>

  <div class="svg-container" id="svgWrap">
    ${svgCode}
  </div>

  <script>
    const D = ${JSON.stringify(payload).replace(/<\/script>/gi, '<\\/script>')};

    function downloadSvg() {
      const svgEl = document.getElementById('svgWrap').querySelector('svg');
      const serializer = new XMLSerializer();
      let source = serializer.serializeToString(svgEl);
      if(!source.match(/^<\\?xml/)) {
        source = '<?xml version="1.0" standalone="no"?>\\r\\n' + source;
      }
      const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(source);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Esquema_Unifilar_EPLAN_' + D.refNum + '.svg';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }

    function downloadDxf() {
      const dxfStr = generateUnifilarDxfString(D);
      const blob = new Blob([dxfStr], { type: 'application/dxf;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Esquema_Unifilar_AutoCAD_' + D.refNum + '.dxf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    ${generateUnifilarDxfString.toString().replace(/<\/script>/gi, '<\\/script>')}
  ${'<'}/script>
</body>
</html>
`;

  const w = window.open('', '_blank');
  if (!w) {
    showEmbeddedDocViewer('Esquema Unifilar EPLAN IEC 60617 — ' + d.refNum, code);
    return;
  }
  w.document.open();
  w.document.write(code);
  w.document.close();
}

/**
 * Motor Vectorial SVG Puro para Esquema Unifilar Normalizado (EPLAN / IEC 60617 / ISO 7200)
 */
function buildUnifilarSvg(D) {
  const W = 1600, H = 1131;
  const mLeft = 40, mTop = 35, mRight = 40, mBottom = 35;
  const fW = W - mLeft - mRight;
  const fH = H - mTop - mBottom;

  // Grid coordinates
  const numCols = 8;
  const colW = (fW - 24) / numCols;
  let gridXml = '';
  for (let i = 0; i < numCols; i++) {
    const x = mLeft + 12 + i * colW + colW / 2;
    gridXml += `<text x="${x}" y="${mTop + 8}" font-family="monospace" font-size="9" font-weight="bold" fill="#000000" text-anchor="middle">${i + 1}</text>`;
    gridXml += `<text x="${x}" y="${mTop + fH - 4}" font-family="monospace" font-size="9" font-weight="bold" fill="#000000" text-anchor="middle">${i + 1}</text>`;
    if (i > 0) {
      const gx = mLeft + 12 + i * colW;
      gridXml += `<line x1="${gx}" y1="${mTop}" x2="${gx}" y2="${mTop + 12}" stroke="#000" stroke-width="1"/>`;
      gridXml += `<line x1="${gx}" y1="${mTop + fH - 12}" x2="${gx}" y2="${mTop + fH}" stroke="#000" stroke-width="1"/>`;
    }
  }

  const rowNames = ['A', 'B', 'C', 'D', 'E', 'F'];
  const rowH = (fH - 24) / rowNames.length;
  for (let j = 0; j < rowNames.length; j++) {
    const y = mTop + 12 + j * rowH + rowH / 2 + 3;
    gridXml += `<text x="${mLeft + 6}" y="${y}" font-family="monospace" font-size="9" font-weight="bold" fill="#000000" text-anchor="middle">${rowNames[j]}</text>`;
    gridXml += `<text x="${mLeft + fW - 6}" y="${y}" font-family="monospace" font-size="9" font-weight="bold" fill="#000000" text-anchor="middle">${rowNames[j]}</text>`;
    if (j > 0) {
      const gy = mTop + 12 + j * rowH;
      gridXml += `<line x1="${mLeft}" y1="${gy}" x2="${mLeft + 12}" y2="${gy}" stroke="#000" stroke-width="1"/>`;
      gridXml += `<line x1="${mLeft + fW - 12}" y1="${gy}" x2="${mLeft + fW}" y2="${gy}" stroke="#000" stroke-width="1"/>`;
    }
  }

  // Cartela ISO 7200
  const tbW = 460, tbH = 110;
  const tbX = mLeft + fW - 12 - tbW;
  const tbY = mTop + fH - 12 - tbH;

  const cartelaXml = `
    <g id="cartela_iso7200">
      <rect x="${tbX}" y="${tbY}" width="${tbW}" height="${tbH}" fill="#f8fafc" stroke="#000000" stroke-width="1.5"/>
      <line x1="${tbX}" y1="${tbY + 28}" x2="${tbX + tbW}" y2="${tbY + 28}" stroke="#000" stroke-width="1"/>
      <line x1="${tbX}" y1="${tbY + 68}" x2="${tbX + tbW}" y2="${tbY + 68}" stroke="#000" stroke-width="1"/>
      <line x1="${tbX + 260}" y1="${tbY}" x2="${tbX + 260}" y2="${tbY + 68}" stroke="#000" stroke-width="1"/>
      <line x1="${tbX + 130}" y1="${tbY + 68}" x2="${tbX + 130}" y2="${tbY + tbH}" stroke="#000" stroke-width="1"/>
      <line x1="${tbX + 260}" y1="${tbY + 68}" x2="${tbX + 260}" y2="${tbY + tbH}" stroke="#000" stroke-width="1"/>
      <line x1="${tbX + 360}" y1="${tbY + 68}" x2="${tbX + 360}" y2="${tbY + tbH}" stroke="#000" stroke-width="1"/>

      <text x="${tbX + 8}" y="${tbY + 11}" font-family="Arial, sans-serif" font-size="8" font-weight="bold" fill="#64748b">PROYECTO:</text>
      <text x="${tbX + 8}" y="${tbY + 22}" font-family="Arial, sans-serif" font-size="10" font-weight="bold" fill="#0f172a">INSTALACIÓN SOLAR FOTOVOLTAICA AUTOCONSUMO</text>

      <text x="${tbX + 8}" y="${tbY + 39}" font-family="Arial, sans-serif" font-size="8" font-weight="bold" fill="#64748b">TITULAR / PROMOTOR:</text>
      <text x="${tbX + 8}" y="${tbY + 51}" font-family="Arial, sans-serif" font-size="9.5" font-weight="bold" fill="#0f172a">${D.nombre} (${D.nif})</text>
      <text x="${tbX + 8}" y="${tbY + 62}" font-family="Arial, sans-serif" font-size="8" fill="#334155">${D.dir} ${D.mun}</text>

      <text x="${tbX + 268}" y="${tbY + 11}" font-family="Arial, sans-serif" font-size="8" font-weight="bold" fill="#64748b">DOCUMENTO:</text>
      <text x="${tbX + 268}" y="${tbY + 23}" font-family="Arial, sans-serif" font-size="11" font-weight="bold" fill="#0f172a">ESQUEMA UNIFILAR</text>

      <text x="${tbX + 268}" y="${tbY + 39}" font-family="Arial, sans-serif" font-size="8" font-weight="bold" fill="#64748b">REF. EXPEDIENTE:</text>
      <text x="${tbX + 268}" y="${tbY + 52}" font-family="Arial, sans-serif" font-size="10" font-weight="bold" fill="#0284c7">${D.refNum}</text>

      <text x="${tbX + 8}" y="${tbY + 78}" font-family="Arial, sans-serif" font-size="7.5" font-weight="bold" fill="#64748b">DISEÑADO POR:</text>
      <text x="${tbX + 8}" y="${tbY + 89}" font-family="Arial, sans-serif" font-size="8.5" font-weight="bold" fill="#0f172a">${D.tecnico}</text>
      <text x="${tbX + 8}" y="${tbY + 100}" font-family="Arial, sans-serif" font-size="7.5" fill="#334155">${D.titulacion} · Col. ${D.ncol}</text>

      <text x="${tbX + 138}" y="${tbY + 78}" font-family="Arial, sans-serif" font-size="7.5" font-weight="bold" fill="#64748b">FECHA:</text>
      <text x="${tbX + 138}" y="${tbY + 92}" font-family="Arial, sans-serif" font-size="9" font-weight="bold" fill="#0f172a">${D.fechaStr}</text>

      <text x="${tbX + 268}" y="${tbY + 78}" font-family="Arial, sans-serif" font-size="7.5" font-weight="bold" fill="#64748b">NORMATIVA:</text>
      <text x="${tbX + 268}" y="${tbY + 89}" font-family="Arial, sans-serif" font-size="8.5" font-weight="bold" fill="#0f172a">REBT ITC-BT-40</text>
      <text x="${tbX + 268}" y="${tbY + 100}" font-family="Arial, sans-serif" font-size="8" fill="#334155">RD 244/2019 · IEC 60617</text>

      <text x="${tbX + 368}" y="${tbY + 78}" font-family="Arial, sans-serif" font-size="7.5" font-weight="bold" fill="#64748b">HOJA / ESCALA:</text>
      <text x="${tbX + 368}" y="${tbY + 92}" font-family="Arial, sans-serif" font-size="9" font-weight="bold" fill="#0f172a">1 / 1 · S/E</text>
    </g>
  `;

  // Strings generation
  const genX = 140, genY = 160;
  const displayedStrings = Math.min(D.numStrings, 3);
  const strW = 105, strH = 120, strGap = 20;

  let stringsXml = '';
  for (let s = 0; s < displayedStrings; s++) {
    const sx = genX - 40 + s * (strW + strGap);
    stringsXml += `
      <g id="string_${s + 1}">
        <rect x="${sx}" y="${genY}" width="${strW}" height="${strH}" fill="#f0f9ff" stroke="#0284c7" stroke-width="1.5" rx="3"/>
        <line x1="${sx + 15}" y1="${genY + 20}" x2="${sx + strW - 15}" y2="${genY + 20}" stroke="#0284c7" stroke-width="1.5"/>
        <line x1="${sx + 15}" y1="${genY + 45}" x2="${sx + strW - 15}" y2="${genY + 45}" stroke="#0284c7" stroke-width="1.5"/>
        <line x1="${sx + 20}" y1="${genY + 8}" x2="${sx + 35}" y2="${genY + 20}" stroke="#0284c7" stroke-width="1.5"/>
        <line x1="${sx + 35}" y1="${genY + 8}" x2="${sx + 50}" y2="${genY + 20}" stroke="#0284c7" stroke-width="1.5"/>

        <text x="${sx + strW / 2}" y="${genY + 60}" font-family="Arial, sans-serif" font-size="9.5" font-weight="bold" fill="#0369a1" text-anchor="middle">-G${s + 1} · STRING ${s + 1}</text>
        <text x="${sx + strW / 2}" y="${genY + 75}" font-family="Arial, sans-serif" font-size="8.5" font-weight="bold" fill="#0f172a" text-anchor="middle">${D.modsActual} Módulos en Serie</text>
        <text x="${sx + strW / 2}" y="${genY + 89}" font-family="monospace" font-size="8" fill="#475569" text-anchor="middle">Voc(STC): ${D.Voc_string.toFixed(0)} V</text>
        <text x="${sx + strW / 2}" y="${genY + 101}" font-family="monospace" font-size="8" fill="#475569" text-anchor="middle">Voc(-10°C): ${D.Voc_str_cold.toFixed(0)} V</text>
        <text x="${sx + strW / 2}" y="${genY + 113}" font-family="monospace" font-size="8" fill="#475569" text-anchor="middle">Isc: ${D.Isc} A | Imp: ${D.Imp} A</text>

        <line x1="${sx + strW / 2}" y1="${genY + strH}" x2="${sx + strW / 2}" y2="${genY + strH + 45}" stroke="#000" stroke-width="2"/>
        <rect x="${sx + strW / 2 - 6}" y="${genY + strH + 15}" width="4" height="12" fill="#ef4444"/>
        <rect x="${sx + strW / 2 + 2}" y="${genY + strH + 15}" width="4" height="12" fill="#000000"/>
      </g>
    `;
  }

  // Si la instalación tiene más de 3 strings, representar los adicionales de forma explícita
  const hasExtraStrings = D.numStrings > 3;
  const remCount = D.numStrings - 3;
  if (hasExtraStrings) {
    const sx = genX - 40 + 3 * (strW + strGap);
    stringsXml += `
      <g id="string_additional">
        <rect x="${sx}" y="${genY}" width="${strW}" height="${strH}" fill="#f8fafc" stroke="#0284c7" stroke-width="1.5" stroke-dasharray="4 3" rx="3"/>
        <line x1="${sx + 15}" y1="${genY + 20}" x2="${sx + strW - 15}" y2="${genY + 20}" stroke="#0284c7" stroke-width="1.5" stroke-dasharray="3 2"/>
        <line x1="${sx + 15}" y1="${genY + 45}" x2="${sx + strW - 15}" y2="${genY + 45}" stroke="#0284c7" stroke-width="1.5" stroke-dasharray="3 2"/>

        <text x="${sx + strW / 2}" y="${genY + 60}" font-family="Arial, sans-serif" font-size="9.5" font-weight="bold" fill="#0369a1" text-anchor="middle">-G4..-G${D.numStrings} (+${remCount} STR)</text>
        <text x="${sx + strW / 2}" y="${genY + 75}" font-family="Arial, sans-serif" font-size="8.5" font-weight="bold" fill="#0f172a" text-anchor="middle">${remCount} Strings idénticos</text>
        <text x="${sx + strW / 2}" y="${genY + 89}" font-family="monospace" font-size="8" fill="#475569" text-anchor="middle">${D.modsActual} Mód/str (${remCount * D.modsActual} mód)</text>
        <text x="${sx + strW / 2}" y="${genY + 101}" font-family="monospace" font-size="8" fill="#475569" text-anchor="middle">Voc(-10°C): ${D.Voc_str_cold.toFixed(0)} V</text>
        <text x="${sx + strW / 2}" y="${genY + 113}" font-family="monospace" font-size="8" fill="#475569" text-anchor="middle">Isc total: ${(D.Isc * remCount).toFixed(1)} A</text>

        <line x1="${sx + strW / 2}" y1="${genY + strH}" x2="${sx + strW / 2}" y2="${genY + strH + 45}" stroke="#000" stroke-width="2" stroke-dasharray="4 2"/>
        <rect x="${sx + strW / 2 - 6}" y="${genY + strH + 15}" width="4" height="12" fill="#ef4444"/>
        <rect x="${sx + strW / 2 + 2}" y="${genY + strH + 15}" width="4" height="12" fill="#000000"/>
      </g>
    `;
  }

  // Bus collector line
  const totalSlots = hasExtraStrings ? 4 : displayedStrings;
  const colBusY = genY + strH + 45;
  const busStartX = genX - 40 + strW / 2;
  const busEndX = genX - 40 + (totalSlots - 1) * (strW + strGap) + strW / 2;
  const dcTrunkX = (busStartX + busEndX) / 2;
  const boxDcY = colBusY + 60;

  // DC Box (-XDC)
  const cdcW = 260, cdcH = 140;
  const cdcX = dcTrunkX - cdcW / 2;
  const cdcY = boxDcY;

  // Inverter (-T1)
  const dcOutY = cdcY + cdcH;
  const invY = dcOutY + 70;
  const invW = 280, invH = 130;
  const invX = dcTrunkX - invW / 2;

  // AC Box (-XAC)
  const acBoxX = invX + invW + 120;
  const acBoxY = invY - 20;
  const acBoxW = 340, acBoxH = 260;

  // Grid Box
  const gridX = acBoxX + acBoxW + 60;
  const gridY = acBoxY + 60;

  // Global Table
  const ntX = W - 490, ntY = mTop + 30;
  const iAcStr = (typeof D.I_ac === 'number' ? D.I_ac : (parseFloat(D.I_ac) || 0)).toFixed(1);
  const tableData = [
    ['Potencia Pico Campo FV:', D.P_dc_kW.toFixed(2) + ' kWp (' + D.numPanels + ' mód. ' + D.cfg_pot + 'W)'],
    ['Configuración del Generador:', D.numStrings + ' String(s) de ' + D.modsActual + ' módulos en serie'],
    ['Tensión Máx. Generador (Voc a -10°C):', D.Voc_str_cold.toFixed(1) + ' V CC (Límite: ' + (D.V_max_inv || 1000) + ' V)'],
    ['Inversor de Conexión a Red:', (D.inverter ? D.inverter.fullName : (D.P_ac_kW.toFixed(2) + ' kW')) + ' (' + (D.monofasico ? 'Monofásico' : 'Trifásico') + ')'],
    ['Sistema de Almacenamiento:', (D.hasBattery && D.battery) ? (D.battery.fullName + ' (' + D.battery.totalKwh.toFixed(1) + ' kWh LFP)') : 'Sin acumulación (Directo)'],
    ['Generación Eólica Híbrida:', (typeof window !== 'undefined' && window.windParkSummary && window.windParkSummary.totalRatedKw > 0) ? (window.windParkSummary.totalRatedKw + ' kW Mini-Eólica (Freno Dump Load REBT)') : 'No instalada'],
    ['Corriente Nominal Salida AC:', iAcStr + ' A (Protección IGA: ' + D.I_iga + ' A)'],
    ['Línea Continua (DC):', 'Cable ZZ-F ' + D.S_str + 'mm² / ' + D.S_mdc + 'mm² (1.8/3kV)'],
    ['Línea Alterna (AC):', 'Cable RV-K 0.6/1kV ' + D.S_ac + 'mm² Cu'],
    ['Caída de Tensión Calculada:', 'DC: ' + (D.dVdc_p ? parseFloat(D.dVdc_p).toFixed(2) + '%' : '≤1.5%') + ' | AC: ' + (D.dVac_p ? parseFloat(D.dVac_p).toFixed(2) + '%' : '≤1.5%') + ' (ITC-BT-40)']
  ];

  let tableXml = '';
  tableData.forEach((row, rIdx) => {
    const ry = ntY + 34 + rIdx * 14;
    tableXml += `
      <text x="${ntX + 12}" y="${ry}" font-family="Arial, sans-serif" font-size="8" fill="#475569">${row[0]}</text>
      <text x="${ntX + 220}" y="${ry}" font-family="Arial, sans-serif" font-size="8" font-weight="bold" fill="#0f172a">${row[1]}</text>
    `;
  });

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style="background:#ffffff;">
  <!-- Fondo y Marco EPLAN -->
  <rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>
  <rect x="${mLeft}" y="${mTop}" width="${fW}" height="${fH}" fill="none" stroke="#000000" stroke-width="2.5"/>
  <rect x="${mLeft + 12}" y="${mTop + 12}" width="${fW - 24}" height="${fH - 24}" fill="none" stroke="#000000" stroke-width="1"/>

  <!-- Cuadrícula de Coordenadas -->
  ${gridXml}

  <!-- Cartela Normalizada ISO 7200 -->
  ${cartelaXml}

  <!-- Tabla de Parámetros Globales -->
  <g id="tabla_parametros">
    <rect x="${ntX}" y="${ntY}" width="440" height="150" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1" rx="4"/>
    <text x="${ntX + 12}" y="${ntY + 18}" font-family="Arial, sans-serif" font-size="9.5" font-weight="bold" fill="#0f172a">PARÁMETROS DE DISEÑO Y CÁLCULO ELÉCTRICO</text>
    ${tableXml}
  </g>

  <!-- 1. CAMPO GENERADOR FOTOVOLTAICO -->
  <g id="campo_fv">
    <text x="${genX - 40}" y="${genY - 50}" font-family="Arial, sans-serif" font-size="12" font-weight="bold" fill="#0f172a">CAMPO GENERADOR FOTOVOLTAICO (CUBIERTA)</text>
    <text x="${genX - 40}" y="${genY - 34}" font-family="Arial, sans-serif" font-size="9.5" fill="#475569">Potencia Pico Total: ${D.P_dc_kW.toFixed(2)} kWp (${D.numPanels} mód. ${D.cfg_pot} Wp - ${D.cfg_tec})</text>
    ${stringsXml}
    <line x1="${busStartX}" y1="${colBusY}" x2="${busEndX}" y2="${colBusY}" stroke="#000" stroke-width="2.5"/>
    <line x1="${dcTrunkX}" y1="${colBusY}" x2="${dcTrunkX}" y2="${boxDcY}" stroke="#000" stroke-width="2"/>
    <text x="${dcTrunkX + 10}" y="${(colBusY + boxDcY) / 2}" font-family="monospace" font-size="8" font-weight="bold" fill="#0369a1">Cable Solar ZZ-F 1x${D.S_str}mm² (1.8/3kV)</text>
  </g>

  <!-- 2. CUADRO PROTECCIÓN DC (-XDC) -->
  <g id="cuadro_dc">
    <rect x="${cdcX}" y="${cdcY}" width="${cdcW}" height="${cdcH}" fill="#fffbeb" stroke="#d97706" stroke-width="2" stroke-dasharray="4,3" rx="4"/>
    <text x="${cdcX + 8}" y="${cdcY + 16}" font-family="Arial, sans-serif" font-size="9" font-weight="bold" fill="#b45309">CUADRO PROTECCIÓN DC (-XDC) · IP65 CUBIERTA</text>

    <!-- Fusible -F1 -->
    <rect x="${cdcX + 35}" y="${cdcY + 30}" width="35" height="24" fill="#ffffff" stroke="#000" stroke-width="1.5"/>
    <line x1="${cdcX + 35}" y1="${cdcY + 42}" x2="${cdcX + 70}" y2="${cdcY + 42}" stroke="#000" stroke-width="1.5"/>
    <text x="${cdcX + 52}" y="${cdcY + 27}" font-family="Arial, sans-serif" font-size="7.5" font-weight="bold" fill="#000" text-anchor="middle">-F1</text>
    <text x="${cdcX + 52}" y="${cdcY + 63}" font-family="Arial, sans-serif" font-size="7.5" fill="#000" text-anchor="middle">gPV ${D.fuse_std || 15}A</text>

    <!-- Sobretensiones SPD -F01 -->
    <rect x="${cdcX + 110}" y="${cdcY + 30}" width="40" height="45" fill="#ffffff" stroke="#000" stroke-width="1.5"/>
    <line x1="${cdcX + 118}" y1="${cdcY + 42}" x2="${cdcX + 142}" y2="${cdcY + 42}" stroke="#000" stroke-width="1.5"/>
    <line x1="${cdcX + 130}" y1="${cdcY + 42}" x2="${cdcX + 130}" y2="${cdcY + 62}" stroke="#000" stroke-width="1.5"/>
    <line x1="${cdcX + 122}" y1="${cdcY + 62}" x2="${cdcX + 138}" y2="${cdcY + 62}" stroke="#000" stroke-width="1.5"/>
    <text x="${cdcX + 130}" y="${cdcY + 27}" font-family="Arial, sans-serif" font-size="7.5" font-weight="bold" fill="#000" text-anchor="middle">-F01 (SPD)</text>
    <text x="${cdcX + 130}" y="${cdcY + 84}" font-family="Arial, sans-serif" font-size="7" fill="#000" text-anchor="middle">Tipo II DC</text>
    <text x="${cdcX + 130}" y="${cdcY + 93}" font-family="Arial, sans-serif" font-size="7" fill="#000" text-anchor="middle">Up≤2.5kV</text>

    <!-- Seccionador -Q1 -->
    <rect x="${cdcX + 190}" y="${cdcY + 30}" width="45" height="45" fill="#ffffff" stroke="#000" stroke-width="1.5"/>
    <circle cx="${cdcX + 200}" cy="${cdcY + 65}" r="2.5" fill="none" stroke="#000" stroke-width="1.5"/>
    <circle cx="${cdcX + 225}" cy="${cdcY + 65}" r="2.5" fill="none" stroke="#000" stroke-width="1.5"/>
    <line x1="${cdcX + 200}" y1="${cdcY + 65}" x2="${cdcX + 215}" y2="${cdcY + 45}" stroke="#000" stroke-width="1.5"/>
    <text x="${cdcX + 212}" y="${cdcY + 27}" font-family="Arial, sans-serif" font-size="7.5" font-weight="bold" fill="#000" text-anchor="middle">-Q1</text>
    <text x="${cdcX + 212}" y="${cdcY + 84}" font-family="Arial, sans-serif" font-size="7" fill="#000" text-anchor="middle">Seccionador</text>
    <text x="${cdcX + 212}" y="${cdcY + 93}" font-family="Arial, sans-serif" font-size="7" fill="#000" text-anchor="middle">1000V / 32A</text>

    <!-- Línea DC Saliente -->
    <line x1="${dcTrunkX}" y1="${dcOutY}" x2="${dcTrunkX}" y2="${invY}" stroke="#000" stroke-width="2"/>
    <text x="${dcTrunkX + 10}" y="${(dcOutY + invY) / 2}" font-family="monospace" font-size="8" font-weight="bold" fill="#0369a1">Línea Principal DC: ZZ-F ${D.S_mdc}mm² (Idc=${D.I_total_dc.toFixed(1)}A)</text>
  </g>

  <!-- 3. INVERSOR DC/AC (-T1) -->
  <g id="inversor_t1">
    <rect x="${invX}" y="${invY}" width="${invW}" height="${invH}" fill="#eff6ff" stroke="#1d4ed8" stroke-width="2.5" rx="4"/>
    <line x1="${invX}" y1="${invY + invH}" x2="${invX + invW}" y2="${invY}" stroke="#1d4ed8" stroke-width="1"/>
    <text x="${invX + 50}" y="${invY + invH - 25}" font-family="Arial, sans-serif" font-size="20" font-weight="bold" fill="#1e40af" text-anchor="middle">=</text>
    <text x="${invX + invW - 50}" y="${invY + 45}" font-family="Arial, sans-serif" font-size="20" font-weight="bold" fill="#1e40af" text-anchor="middle">~</text>

    <text x="${invX + invW / 2}" y="${invY + 22}" font-family="Arial, sans-serif" font-size="11" font-weight="bold" fill="#0f172a" text-anchor="middle">-T1 · INVERSOR DE CONEXIÓN A RED</text>
    <text x="${invX + invW / 2}" y="${invY + 40}" font-family="Arial, sans-serif" font-size="9.5" font-weight="bold" fill="#1e3a8a" text-anchor="middle">Potencia Nominal AC: ${D.P_ac_kW.toFixed(2)} kW (${D.monofasico ? '230V 1F+N' : '400V 3F+N'})</text>
    <text x="${invX + invW / 2}" y="${invY + 54}" font-family="Arial, sans-serif" font-size="8" fill="#475569" text-anchor="middle">MPPT Integrado · Eficiencia: 98.4% · cos φ = 1.0</text>
    <text x="${invX + invW / 2}" y="${invY + 66}" font-family="Arial, sans-serif" font-size="8" fill="#475569" text-anchor="middle">Protección Anti-isla RD 1699/2011 · UNE-EN 50549</text>
    <text x="${invX + invW / 2}" y="${invY + 78}" font-family="Arial, sans-serif" font-size="8" fill="#475569" text-anchor="middle">I_ac_max = ${iAcStr} A | Frecuencia: 50 Hz</text>

    <!-- Línea AC al Cuadro General -->
    <path d="M ${invX + invW / 2} ${invY + invH} L ${invX + invW / 2} ${invY + invH + 30} L ${acBoxX + 40} ${invY + invH + 30} L ${acBoxX + 40} ${acBoxY + acBoxH - 30}" fill="none" stroke="#15803d" stroke-width="2.5"/>
    <text x="${invX + invW / 2 + 10}" y="${invY + invH + 24}" font-family="monospace" font-size="8" font-weight="bold" fill="#166534">Línea AC: RV-K 0.6/1kV ${D.monofasico ? '3G' : '5G'}${D.S_ac}mm²</text>
  </g>

  ${(D.hasBattery && D.battery) ? `
  <!-- 3.b SISTEMA DE BATERÍAS (-BAT1) -->
  <g id="modulo_bateria">
    <line x1="${invX + 50}" y1="${invY + invH}" x2="${invX + 50}" y2="${invY + invH + 85}" stroke="#16a34a" stroke-width="2.5" stroke-dasharray="5,2"/>
    <rect x="${invX + 32}" y="${invY + invH + 25}" width="36" height="24" fill="#ffffff" stroke="#16a34a" stroke-width="1.5" rx="2"/>
    <text x="${invX + 50}" y="${invY + invH + 40}" font-family="Arial, sans-serif" font-size="7.5" font-weight="bold" fill="#166534" text-anchor="middle">-Q_BAT</text>
    <text x="${invX + 50}" y="${invY + invH + 58}" font-family="Arial, sans-serif" font-size="6.5" fill="#475569" text-anchor="middle">gBat 40A</text>

    <rect x="${invX - 10}" y="${invY + invH + 85}" width="250" height="95" fill="#f0fdf4" stroke="#16a34a" stroke-width="2" rx="4"/>
    <text x="${invX + 115}" y="${invY + invH + 105}" font-family="Arial, sans-serif" font-size="10" font-weight="bold" fill="#15803d" text-anchor="middle">-BAT1 · ALMACENAMIENTO LFP</text>
    <text x="${invX + 115}" y="${invY + invH + 122}" font-family="Arial, sans-serif" font-size="9" font-weight="bold" fill="#0f172a" text-anchor="middle">${D.battery.fullName}</text>
    <text x="${invX + 115}" y="${invY + invH + 138}" font-family="Arial, sans-serif" font-size="8" fill="#334155" text-anchor="middle">Capacidad: ${D.battery.totalKwh.toFixed(1)} kWh útiles (DoD 90%)</text>
    <text x="${invX + 115}" y="${invY + invH + 152}" font-family="Arial, sans-serif" font-size="8" fill="#334155" text-anchor="middle">Tensión: ${D.battery.voltage || 400}V CC · BMS CAN/RS485</text>
    <text x="${invX + 115}" y="${invY + invH + 167}" font-family="Arial, sans-serif" font-size="7" fill="#64748b" text-anchor="middle">UNE-EN IEC 62619 / CEI 0-21</text>
  </g>` : ''}

  <!-- 4. CUADRO GENERAL AC (-XAC) -->
  <g id="cuadro_ac">
    <rect x="${acBoxX}" y="${acBoxY}" width="${acBoxW}" height="${acBoxH}" fill="#f0fdf4" stroke="#16a34a" stroke-width="2" stroke-dasharray="4,3" rx="4"/>
    <text x="${acBoxX + 10}" y="${acBoxY + 16}" font-family="Arial, sans-serif" font-size="9.5" font-weight="bold" fill="#15803d">CUADRO GENERAL DE DISTRIBUCIÓN Y PROTECCIÓN AC</text>

    <!-- IGA PIA -F2 -->
    <rect x="${acBoxX + 30}" y="${acBoxY + 40}" width="65" height="55" fill="#ffffff" stroke="#000" stroke-width="1.5" rx="3"/>
    <text x="${acBoxX + 62}" y="${acBoxY + 34}" font-family="monospace" font-size="10" font-weight="bold" fill="#0284c7" text-anchor="middle">-F2</text>
    <text x="${acBoxX + 62}" y="${acBoxY + 54}" font-family="Arial, sans-serif" font-size="9" font-weight="bold" fill="#0f172a" text-anchor="middle">IGA (PIA)</text>
    <text x="${acBoxX + 62}" y="${acBoxY + 68}" font-family="Arial, sans-serif" font-size="8" fill="#475569" text-anchor="middle">${D.I_iga}A Curva C</text>
    <text x="${acBoxX + 62}" y="${acBoxY + 84}" font-family="Arial, sans-serif" font-size="7" fill="#64748b" text-anchor="middle">Icu ≥ 6kA</text>

    <!-- Diferencial -Q2 -->
    <rect x="${acBoxX + 115}" y="${acBoxY + 40}" width="75" height="55" fill="#ffffff" stroke="#000" stroke-width="1.5" rx="3"/>
    <text x="${acBoxX + 152}" y="${acBoxY + 34}" font-family="monospace" font-size="10" font-weight="bold" fill="#0284c7" text-anchor="middle">-Q2</text>
    <text x="${acBoxX + 152}" y="${acBoxY + 54}" font-family="Arial, sans-serif" font-size="9" font-weight="bold" fill="#0f172a" text-anchor="middle">Diferencial</text>
    <text x="${acBoxX + 152}" y="${acBoxY + 68}" font-family="Arial, sans-serif" font-size="8" fill="#475569" text-anchor="middle">30mA Cl. A/B</text>
    <text x="${acBoxX + 152}" y="${acBoxY + 84}" font-family="Arial, sans-serif" font-size="7" fill="#64748b" text-anchor="middle">${D.dif_amp}A Superinm.</text>

    <!-- SPD AC -F02 -->
    <rect x="${acBoxX + 210}" y="${acBoxY + 40}" width="65" height="55" fill="#ffffff" stroke="#000" stroke-width="1.5" rx="3"/>
    <text x="${acBoxX + 242}" y="${acBoxY + 34}" font-family="monospace" font-size="10" font-weight="bold" fill="#0284c7" text-anchor="middle">-F02</text>
    <text x="${acBoxX + 242}" y="${acBoxY + 54}" font-family="Arial, sans-serif" font-size="9" font-weight="bold" fill="#0f172a" text-anchor="middle">SPD AC</text>
    <text x="${acBoxX + 242}" y="${acBoxY + 68}" font-family="Arial, sans-serif" font-size="8" fill="#475569" text-anchor="middle">Tipo II (20kA)</text>
    <text x="${acBoxX + 242}" y="${acBoxY + 84}" font-family="Arial, sans-serif" font-size="7" fill="#64748b" text-anchor="middle">Up ≤ 1.5kV</text>

    <!-- SMART METER -P1 -->
    <rect x="${acBoxX + 115}" y="${acBoxY + 125}" width="110" height="50" fill="#ffffff" stroke="#000" stroke-width="1.5" rx="3"/>
    <text x="${acBoxX + 170}" y="${acBoxY + 119}" font-family="monospace" font-size="10" font-weight="bold" fill="#0284c7" text-anchor="middle">-P1</text>
    <text x="${acBoxX + 170}" y="${acBoxY + 143}" font-family="Arial, sans-serif" font-size="9" font-weight="bold" fill="#0f172a" text-anchor="middle">SMART METER</text>
    <text x="${acBoxX + 170}" y="${acBoxY + 158}" font-family="Arial, sans-serif" font-size="8" fill="#475569" text-anchor="middle">Bidireccional RS485</text>

    <!-- Embarrado Tierra PE -->
    <rect x="${acBoxX + 30}" y="${acBoxY + 200}" width="${acBoxW - 60}" height="26" fill="#fef08a" stroke="#ca8a04" stroke-width="1.5" rx="2"/>
    <text x="${acBoxX + 30 + (acBoxW - 60) / 2}" y="${acBoxY + 217}" font-family="Arial, sans-serif" font-size="8.5" font-weight="bold" fill="#854d0e" text-anchor="middle">EMBARRADO EQUIPOTENCIAL DE PUESTA A TIERRA (PE) · R ≤ ${D.R_tierra} Ω</text>

    <!-- Pica de Tierra -->
    <path d="M ${acBoxX + acBoxW / 2} ${acBoxY + 226} L ${acBoxX + acBoxW / 2} ${acBoxY + 251} M ${acBoxX + acBoxW / 2 - 18} ${acBoxY + 251} L ${acBoxX + acBoxW / 2 + 18} ${acBoxY + 251} M ${acBoxX + acBoxW / 2 - 12} ${acBoxY + 257} L ${acBoxX + acBoxW / 2 + 12} ${acBoxY + 257} M ${acBoxX + acBoxW / 2 - 6} ${acBoxY + 263} L ${acBoxX + acBoxW / 2 + 6} ${acBoxY + 263}" fill="none" stroke="#ca8a04" stroke-width="2"/>
    <text x="${acBoxX + acBoxW / 2}" y="${acBoxY + 276}" font-family="Arial, sans-serif" font-size="7.5" fill="#854d0e" text-anchor="middle">Pica de Cu 2m (ITC-BT-18)</text>
  </g>

  <!-- 5. RED DISTRIBUCIÓN PÚBLICA -->
  <g id="red_distribucion">
    <line x1="${acBoxX + acBoxW}" y1="${acBoxY + 65}" x2="${gridX}" y2="${gridY}" stroke="#000" stroke-width="2"/>
    <text x="${(acBoxX + acBoxW + gridX) / 2}" y="${gridY - 6}" font-family="monospace" font-size="8" font-weight="bold" fill="#0369a1" text-anchor="middle">Acometida ${D.monofasico ? '230V' : '400V'}</text>

    <rect x="${gridX}" y="${gridY - 45}" width="170" height="95" fill="#0f172a" stroke="#0284c7" stroke-width="2.5" rx="4"/>
    <text x="${gridX + 85}" y="${gridY - 24}" font-family="Arial, sans-serif" font-size="10" font-weight="bold" fill="#38bdf8" text-anchor="middle">RED DISTRIBUCIÓN BT</text>
    <text x="${gridX + 85}" y="${gridY - 8}" font-family="Arial, sans-serif" font-size="9" font-weight="bold" fill="#ffffff" text-anchor="middle">${D.dist}</text>
    <text x="${gridX + 85}" y="${gridY + 8}" font-family="Arial, sans-serif" font-size="8" fill="#94a3b8" text-anchor="middle">CUPS: ${D.cups}</text>
    <text x="${gridX + 85}" y="${gridY + 22}" font-family="Arial, sans-serif" font-size="8" fill="#94a3b8" text-anchor="middle">Modalidad: ${D.modalTexto.split('(')[0] || 'Autoconsumo'}</text>
    <text x="${gridX + 85}" y="${gridY + 36}" font-family="Arial, sans-serif" font-size="8" fill="#94a3b8" text-anchor="middle">Tensión Red: ${D.monofasico ? '230 V 50 Hz' : '400 V 50 Hz'}</text>
  </g>
</svg>`;
}

/**
 * Motor Exportador DXF ASCII Puro Compatible con AutoCAD R12 / 2000
 */
function generateUnifilarDxfString(D) {
  let dxf = '';
  const iAcStr = (typeof D.I_ac === 'number' ? D.I_ac : (parseFloat(D.I_ac) || 0)).toFixed(1);

  // Helpers DXF
  function addHeader() {
    dxf += '0\r\nSECTION\r\n2\r\nHEADER\r\n';
    dxf += '9\r\n$ACADVER\r\n1\r\nAC1009\r\n'; // AutoCAD R12 ASCII universal
    dxf += '9\r\n$INSUNITS\r\n70\r\n4\r\n';   // Millimeters
    dxf += '0\r\nENDSEC\r\n';
  }

  function addTables() {
    dxf += '0\r\nSECTION\r\n2\r\nTABLES\r\n';
    dxf += '0\r\nTABLE\r\n2\r\nLAYER\r\n70\r\n6\r\n';
    
    // Layers: 0_MARCO (7:blanco), 1_EQUIPOS (4:cyan), 2_DC (1:rojo), 3_AC (3:verde), 4_TIERRA (2:amarillo), 5_TEXTOS (7:blanco)
    const layers = [
      { name: '0_MARCO', color: 7 },
      { name: '1_EQUIPOS', color: 4 },
      { name: '2_DC', color: 1 },
      { name: '3_AC', color: 3 },
      { name: '4_TIERRA', color: 2 },
      { name: '5_TEXTOS', color: 7 }
    ];

    layers.forEach(l => {
      dxf += '0\r\nLAYER\r\n2\r\n' + l.name + '\r\n70\r\n0\r\n62\r\n' + l.color + '\r\n6\r\nCONTINUOUS\r\n';
    });

    dxf += '0\r\nENDTAB\r\n0\r\nENDSEC\r\n';
  }

  function line(layer, x1, y1, x2, y2) {
    // Invertimos Y para sistema de coordenadas CAD cartesiano estándar (Y hacia arriba)
    const Y1 = 1131 - y1;
    const Y2 = 1131 - y2;
    return '0\r\nLINE\r\n8\r\n' + layer + '\r\n10\r\n' + x1.toFixed(2) + '\r\n20\r\n' + Y1.toFixed(2) + '\r\n30\r\n0.0\r\n11\r\n' + x2.toFixed(2) + '\r\n21\r\n' + Y2.toFixed(2) + '\r\n31\r\n0.0\r\n';
  }

  function rect(layer, x, y, w, h) {
    return line(layer, x, y, x + w, y) +
           line(layer, x + w, y, x + w, y + h) +
           line(layer, x + w, y + h, x, y + h) +
           line(layer, x, y + h, x, y);
  }

  function circle(layer, cx, cy, r) {
    const Y = 1131 - cy;
    return '0\r\nCIRCLE\r\n8\r\n' + layer + '\r\n10\r\n' + cx.toFixed(2) + '\r\n20\r\n' + Y.toFixed(2) + '\r\n30\r\n0.0\r\n40\r\n' + r.toFixed(2) + '\r\n';
  }

  function text(layer, x, y, height, str) {
    const Y = 1131 - y;
    const cleanStr = String(str === undefined || str === null ? '' : str).replace(/[\r\n]+/g, ' ');
    return '0\r\nTEXT\r\n8\r\n' + layer + '\r\n10\r\n' + x.toFixed(2) + '\r\n20\r\n' + Y.toFixed(2) + '\r\n30\r\n0.0\r\n40\r\n' + height.toFixed(2) + '\r\n1\r\n' + cleanStr + '\r\n';
  }

  addHeader();
  addTables();

  dxf += '0\r\nSECTION\r\n2\r\nENTITIES\r\n';

  // 1. Marco y Cuadrícula
  dxf += rect('0_MARCO', 40, 35, 1520, 1061);
  dxf += rect('0_MARCO', 52, 47, 1496, 1037);

  // Cartela
  const tbW = 460, tbH = 110;
  const tbX = 1600 - 40 - 12 - tbW;
  const tbY = 1131 - 35 - 12 - tbH;
  dxf += rect('0_MARCO', tbX, tbY, tbW, tbH);
  dxf += line('0_MARCO', tbX, tbY + 28, tbX + tbW, tbY + 28);
  dxf += line('0_MARCO', tbX, tbY + 68, tbX + tbW, tbY + 68);
  dxf += line('0_MARCO', tbX + 260, tbY, tbX + 260, tbY + 68);
  dxf += line('0_MARCO', tbX + 130, tbY + 68, tbX + 130, tbY + tbH);
  dxf += line('0_MARCO', tbX + 260, tbY + 68, tbX + 260, tbY + tbH);
  dxf += line('0_MARCO', tbX + 360, tbY + 68, tbX + 360, tbY + tbH);

  dxf += text('5_TEXTOS', tbX + 8, tbY + 20, 4.5, 'PROYECTO: INSTALACION SOLAR FV ' + D.refNum);
  dxf += text('5_TEXTOS', tbX + 8, tbY + 50, 4.0, 'PROMOTOR: ' + D.nombre + ' (' + D.nif + ')');
  dxf += text('5_TEXTOS', tbX + 268, tbY + 22, 5.0, 'DOC: ESQUEMA UNIFILAR (IEC 60617)');
  dxf += text('5_TEXTOS', tbX + 8, tbY + 88, 3.5, 'TECNICO: ' + D.tecnico + ' (Col. ' + D.ncol + ')');
  dxf += text('5_TEXTOS', tbX + 138, tbY + 88, 3.5, 'FECHA: ' + D.fechaStr);
  dxf += text('5_TEXTOS', tbX + 268, tbY + 88, 3.5, 'NORMA: REBT ITC-BT-40');

  // 2. Generador FV
  const genX = 140, genY = 160;
  const displayedStrings = Math.min(D.numStrings, 3);
  const strW = 105, strH = 120, strGap = 20;

  dxf += text('5_TEXTOS', genX - 40, genY - 50, 5.0, 'CAMPO GENERADOR FOTOVOLTAICO');
  dxf += text('5_TEXTOS', genX - 40, genY - 34, 4.0, 'Pdc: ' + D.P_dc_kW.toFixed(2) + ' kWp (' + D.numPanels + ' modulos ' + D.cfg_pot + 'W)');

  for (let s = 0; s < displayedStrings; s++) {
    const sx = genX - 40 + s * (strW + strGap);
    dxf += rect('1_EQUIPOS', sx, genY, strW, strH);
    dxf += text('5_TEXTOS', sx + 10, genY + 30, 4.0, '-G' + (s + 1) + ' STRING ' + (s + 1));
    dxf += text('5_TEXTOS', sx + 10, genY + 50, 3.5, D.modsActual + ' Mods en serie');
    dxf += text('5_TEXTOS', sx + 10, genY + 70, 3.0, 'Voc(STC): ' + D.Voc_string.toFixed(0) + 'V');
    dxf += text('5_TEXTOS', sx + 10, genY + 85, 3.0, 'Voc(-10C): ' + D.Voc_str_cold.toFixed(0) + 'V');
    dxf += line('2_DC', sx + strW / 2, genY + strH, sx + strW / 2, genY + strH + 45);
  }

  const colBusY = genY + strH + 45;
  const busStartX = genX - 40 + strW / 2;
  const busEndX = genX - 40 + (displayedStrings - 1) * (strW + strGap) + strW / 2;
  const dcTrunkX = (busStartX + busEndX) / 2;
  const boxDcY = colBusY + 60;

  dxf += line('2_DC', busStartX, colBusY, busEndX, colBusY);
  dxf += line('2_DC', dcTrunkX, colBusY, dcTrunkX, boxDcY);
  dxf += text('5_TEXTOS', dcTrunkX + 8, (colBusY + boxDcY) / 2, 3.5, 'ZZ-F 1x' + D.S_str + 'mm2 (1.8/3kV)');

  // 3. Cuadro DC
  const cdcW = 260, cdcH = 140;
  const cdcX = dcTrunkX - cdcW / 2;
  const cdcY = boxDcY;
  dxf += rect('1_EQUIPOS', cdcX, cdcY, cdcW, cdcH);
  dxf += text('5_TEXTOS', cdcX + 8, cdcY + 16, 4.0, 'CUADRO PROTECCION DC (-XDC) IP65');
  dxf += rect('1_EQUIPOS', cdcX + 35, cdcY + 30, 35, 24);
  dxf += text('5_TEXTOS', cdcX + 40, cdcY + 45, 3.0, '-F1 gPV');
  dxf += rect('1_EQUIPOS', cdcX + 110, cdcY + 30, 40, 45);
  dxf += text('5_TEXTOS', cdcX + 115, cdcY + 45, 3.0, '-F01 SPD');
  dxf += rect('1_EQUIPOS', cdcX + 190, cdcY + 30, 45, 45);
  dxf += text('5_TEXTOS', cdcX + 195, cdcY + 45, 3.0, '-Q1 SEC');

  const dcOutY = cdcY + cdcH;
  const invY = dcOutY + 70;
  dxf += line('2_DC', dcTrunkX, dcOutY, dcTrunkX, invY);
  dxf += text('5_TEXTOS', dcTrunkX + 8, (dcOutY + invY) / 2, 3.5, 'ZZ-F ' + D.S_mdc + 'mm2');

  // 4. Inversor
  const invW = 280, invH = 130;
  const invX = dcTrunkX - invW / 2;
  dxf += rect('1_EQUIPOS', invX, invY, invW, invH);
  dxf += line('1_EQUIPOS', invX, invY + invH, invX + invW, invY);
  dxf += text('5_TEXTOS', invX + 20, invY + 25, 4.5, '-T1 INVERSOR CONEXION RED');
  dxf += text('5_TEXTOS', invX + 20, invY + 45, 4.0, 'Pac: ' + D.P_ac_kW.toFixed(2) + ' kW (' + (D.monofasico ? '230V 1F' : '400V 3F') + ')');
  dxf += text('5_TEXTOS', invX + 20, invY + 65, 3.5, 'I_ac_max = ' + iAcStr + ' A');

  // 5. Cuadro AC
  const acBoxX = invX + invW + 120;
  const acBoxY = invY - 20;
  const acBoxW = 340, acBoxH = 260;

  dxf += line('3_AC', invX + invW / 2, invY + invH, invX + invW / 2, invY + invH + 30);
  dxf += line('3_AC', invX + invW / 2, invY + invH + 30, acBoxX + 40, invY + invH + 30);
  dxf += line('3_AC', acBoxX + 40, invY + invH + 30, acBoxX + 40, acBoxY + acBoxH - 30);
  dxf += text('5_TEXTOS', invX + invW / 2 + 10, invY + invH + 24, 3.5, 'RV-K 0.6/1kV ' + D.S_ac + 'mm2');

  dxf += rect('1_EQUIPOS', acBoxX, acBoxY, acBoxW, acBoxH);
  dxf += text('5_TEXTOS', acBoxX + 10, acBoxY + 18, 4.0, 'CUADRO GENERAL DE PROTECCION AC (-XAC)');
  dxf += rect('1_EQUIPOS', acBoxX + 30, acBoxY + 40, 65, 55);
  dxf += text('5_TEXTOS', acBoxX + 35, acBoxY + 60, 3.5, '-F2 IGA ' + D.I_iga + 'A');
  dxf += rect('1_EQUIPOS', acBoxX + 115, acBoxY + 40, 75, 55);
  dxf += text('5_TEXTOS', acBoxX + 120, acBoxY + 60, 3.5, '-Q2 DIF 30mA');
  dxf += rect('1_EQUIPOS', acBoxX + 210, acBoxY + 40, 65, 55);
  dxf += text('5_TEXTOS', acBoxX + 215, acBoxY + 60, 3.5, '-F02 SPD AC');
  dxf += rect('1_EQUIPOS', acBoxX + 115, acBoxY + 125, 110, 50);
  dxf += text('5_TEXTOS', acBoxX + 125, acBoxY + 150, 3.5, '-P1 SMART METER');

  // Tierra PE
  dxf += rect('4_TIERRA', acBoxX + 30, acBoxY + 200, acBoxW - 60, 26);
  dxf += text('4_TIERRA', acBoxX + 40, acBoxY + 216, 3.5, 'EMBARRADO TIERRA (PE) R<=' + D.R_tierra + ' Ohm');
  dxf += line('4_TIERRA', acBoxX + acBoxW / 2, acBoxY + 226, acBoxX + acBoxW / 2, acBoxY + 251);

  // 6. Red
  const gridX = acBoxX + acBoxW + 60;
  const gridY = acBoxY + 60;
  dxf += line('3_AC', acBoxX + acBoxW, acBoxY + 65, gridX, gridY);
  dxf += rect('1_EQUIPOS', gridX, gridY - 45, 170, 95);
  dxf += text('5_TEXTOS', gridX + 10, gridY - 20, 4.0, 'RED DISTRIBUCION BT');
  dxf += text('5_TEXTOS', gridX + 10, gridY, 3.5, D.dist);
  dxf += text('5_TEXTOS', gridX + 10, gridY + 20, 3.0, 'CUPS: ' + D.cups);

  dxf += '0\r\nENDSEC\r\n0\r\nEOF\r\n';

  return dxf;
}


// ============================================================================
// DOC 5 — PLANO DE PLANTA ARQUITECTÓNICO / INGENIERÍA (100% FIEL AL VISOR 3D)
// ============================================================================
function generatePlanoPlanta() {
  if (typeof raEnsureAnalysisReadyForDoc === 'function' && !raEnsureAnalysisReadyForDoc()) return;
  const hasPolylines = (typeof WP !== 'undefined' && WP && Array.isArray(WP.polylines) && WP.polylines.some(p => Array.isArray(p.points) && p.points.length >= 3));
  const hasPolygon = (typeof polygonPoints !== 'undefined' && Array.isArray(polygonPoints) && polygonPoints.length >= 3);
  if (!hasPolylines && !hasPolygon) {
    (typeof raAlert === 'function' ? raAlert : console.warn)('Define primero el polígono de la instalación con al menos 3 vértices en el visor 3D.', 'warning');
    return;
  }

  const d = _docGetProjectCalcs();
  const roofData = computeRoofPanelsData();

  if (!roofData) {
    (typeof raAlert === 'function' ? raAlert : console.warn)('Error calculando la geometría de la cubierta.', 'error');
    return;
  }

  const payload = {
    refNum: d.refNum,
    fechaStr: d.fechaStr,
    nombre: d.tit.nombre,
    nif: d.tit.nif,
    dir: d.tit.dir || 'Ubicación de la Instalación',
    mun: d.tit.mun || '',
    prov: d.tit.prov || '',
    tecnico: d.tit.tecnico,
    titulacion: d.tit.titulacion,
    ncol: d.tit.ncol,
    cfg_pot: d.cfg.potencia,
    cfg_mod: d.cfg.modelo,
    cfg_tec: d.cfg.tecnologia,
    panelW: roofData.panelW,
    panelH: roofData.panelH,
    totalPanels: roofData.panels.length,
    peakPowerKW: (roofData.panels.length * d.cfg.potencia) / 1000,
    area3D: roofData.area3D,
    tiltDeg: roofData.tiltDeg,
    azimuthDeg: roofData.azimuthDeg,
    latDeg: roofData.latDeg,
    lonDeg: roofData.lonDeg,
    poly2D: roofData.poly2D,
    panels: roofData.panels, obstacles: (typeof obstacles !== 'undefined' && Array.isArray(obstacles)) ? obstacles.slice() : [],
    minU: roofData.minU,
    maxU: roofData.maxU,
    minV: roofData.minV,
    maxV: roofData.maxV,
    rangeU: roofData.rangeU,
    rangeV: roofData.rangeV,
    inverter: d.inverter,
    battery: d.battery,
    hasBattery: d.hasBattery,
    subfields: (roofData.polylinesData && roofData.polylinesData.length > 0)
      ? roofData.polylinesData.map((pl, pIdx) => ({
          id: pIdx + 1,
          name: (typeof WP !== 'undefined' && WP.polylines && WP.polylines[pIdx] && WP.polylines[pIdx].name) || ('Faldón ' + (pIdx + 1)),
          poly2D: pl.poly2D || [],
          panels: pl.panels || [],
          panelW: pl.panelW || roofData.panelW || 1.05,
          panelH: pl.panelH || roofData.panelH || 2.10,
          tiltDeg: pl.tiltDeg || 0,
          azimuthDeg: pl.azimuthDeg || 0,
          area3D: pl.area3D || 0,
          minU: pl.minU || 0, maxU: pl.maxU || 10, minV: pl.minV || 0, maxV: pl.maxV || 10,
          rangeU: pl.rangeU || 10, rangeV: pl.rangeV || 10
        }))
      : [{
          id: 1,
          name: 'Cubierta Principal',
          poly2D: roofData.poly2D || [],
          panels: roofData.panels || [],
          panelW: roofData.panelW || 1.05,
          panelH: roofData.panelH || 2.10,
          tiltDeg: roofData.tiltDeg || 0,
          azimuthDeg: roofData.azimuthDeg || 0,
          area3D: roofData.area3D || 0,
          minU: roofData.minU || 0, maxU: roofData.maxU || 10, minV: roofData.minV || 0, maxV: roofData.maxV || 10,
          rangeU: roofData.rangeU || 10, rangeV: roofData.rangeV || 10
        }]
  };

  const code = `
  <!DOCTYPE html>
  <html lang="es">
  <head>
    <meta charset="UTF-8">
    <title>Plano de Planta Fotovoltaico — ${d.refNum}</title>
    <style>
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      body { background: #1e293b; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; display: flex; flex-direction: column; align-items: center; padding: 15px; }
      .header-bar { width: 1120px; background: #0f172a; color: #fff; padding: 10px 20px; display: flex; justify-content: space-between; align-items: center; border: 1px solid #334155; margin-bottom: 12px; }
      .header-bar h1 { font-size: 13px; font-weight: 700; letter-spacing: 0.5px; color: #38bdf8; }
      .btn-print { background: #0284c7; color: #fff; border: none; padding: 8px 18px; font-weight: 700; font-size: 11px; cursor: pointer; border-radius: 2px; }
      .btn-print:hover { background: #0369a1; }
      canvas { background: #ffffff; box-shadow: 0 10px 30px rgba(0,0,0,0.5); display: block; }
      @media print {
        body { background: #fff; padding: 0; }
        .header-bar { display: none; }
        canvas { box-shadow: none; width: 100%; height: auto; }
      }
    </style>
  </head>
  <body>
    <div class="header-bar">
      <h1>📐 PLANO DE IMPLANTACIÓN Y DISTRIBUCIÓN DE MÓDULOS FV (LAYOUT REAL)</h1>
      <button class="btn-print" onclick="window.print()">🖨 IMPRIMIR / EXPORTAR A PDF</button>
    </div>

    <canvas id="plantCanvas" width="1600" height="1131"></canvas>

    <script>
      const D = ${JSON.stringify(payload)};
      const cv = document.getElementById('plantCanvas');
      const ctx = cv.getContext('2d');
      const W = cv.width, H = cv.height;

      // ── Background
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, W, H);

      // ── Margins and Drawing Area
      const mLeft = 40, mTop = 35, mRight = 40, mBottom = 35;
      const fW = W - mLeft - mRight;
      const fH = H - mTop - mBottom;

      // Border & Grid
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(mLeft, mTop, fW, fH);
      ctx.lineWidth = 1;
      ctx.strokeRect(mLeft + 12, mTop + 12, fW - 24, fH - 24);

      // ── Cartela Normalizada (Bottom Right)
      const tbW = 460, tbH = 115;
      const tbX = mLeft + fW - 12 - tbW;
      const tbY = mTop + fH - 12 - tbH;

      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(tbX, tbY, tbW, tbH);
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(tbX, tbY, tbW, tbH);

      ctx.beginPath();
      ctx.moveTo(tbX, tbY + 28); ctx.lineTo(tbX + tbW, tbY + 28);
      ctx.moveTo(tbX, tbY + 68); ctx.lineTo(tbX + tbW, tbY + 68);
      ctx.moveTo(tbX + 260, tbY); ctx.lineTo(tbX + 260, tbY + 68);
      ctx.moveTo(tbX + 130, tbY + 68); ctx.lineTo(tbX + 130, tbY + tbH);
      ctx.moveTo(tbX + 260, tbY + 68); ctx.lineTo(tbX + 260, tbY + tbH);
      ctx.moveTo(tbX + 360, tbY + 68); ctx.lineTo(tbX + 360, tbY + tbH);
      ctx.stroke();

      ctx.textAlign = 'left';
      ctx.font = 'bold 8px Arial';
      ctx.fillStyle = '#64748b';
      ctx.fillText('PROYECTO:', tbX + 8, tbY + 9);
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 9.5px Arial';
      ctx.fillText('IMPLANTACIÓN SOLAR FOTOVOLTAICA AUTOCONSUMO', tbX + 8, tbY + 20);

      ctx.font = 'bold 8px Arial';
      ctx.fillStyle = '#64748b';
      ctx.fillText('TITULAR / EMPLAZAMIENTO:', tbX + 8, tbY + 38);
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 9px Arial';
      ctx.fillText(D.nombre + ' · NIF: ' + D.nif, tbX + 8, tbY + 49);
      ctx.font = '8px Arial';
      ctx.fillText(D.dir + ' ' + D.mun + ' (' + D.prov + ')', tbX + 8, tbY + 60);

      ctx.fillStyle = '#64748b';
      ctx.font = 'bold 8px Arial';
      ctx.fillText('DOCUMENTO:', tbX + 268, tbY + 9);
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 11px Arial';
      ctx.fillText('PLANO DE PLANTA (LAYOUT)', tbX + 268, tbY + 22);

      ctx.fillStyle = '#64748b';
      ctx.font = 'bold 8px Arial';
      ctx.fillText('REF. PLANO:', tbX + 268, tbY + 38);
      ctx.fillStyle = '#0284c7';
      ctx.font = 'bold 10px Arial';
      ctx.fillText(D.refNum + '-PL01', tbX + 268, tbY + 50);

      ctx.fillStyle = '#64748b';
      ctx.font = 'bold 7.5px Arial';
      ctx.fillText('TÉCNICO PROYECTISTA:', tbX + 8, tbY + 77);
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 8.5px Arial';
      ctx.fillText(D.tecnico, tbX + 8, tbY + 89);
      ctx.font = '7.5px Arial';
      ctx.fillText(D.titulacion + ' · Col. ' + D.ncol, tbX + 8, tbY + 101);

      ctx.fillStyle = '#64748b';
      ctx.font = 'bold 7.5px Arial';
      ctx.fillText('FECHA:', tbX + 138, tbY + 77);
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 9px Arial';
      ctx.fillText(D.fechaStr, tbX + 138, tbY + 92);

      ctx.fillStyle = '#64748b';
      ctx.font = 'bold 7.5px Arial';
      ctx.fillText('SISTEMA / COORD:', tbX + 268, tbY + 77);
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 8px Arial';
      ctx.fillText('ETRS89 / WGS84', tbX + 268, tbY + 89);
      ctx.fillText(D.latDeg.toFixed(4) + '°N, ' + D.lonDeg.toFixed(4) + '°E', tbX + 268, tbY + 101);

      ctx.fillStyle = '#64748b';
      ctx.font = 'bold 7.5px Arial';
      ctx.fillText('ESCALA:', tbX + 368, tbY + 77);
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 9px Arial';
      ctx.fillText('ACORDE A FORMATO', tbX + 368, tbY + 92);

      // ── VIEWPORT & TRANSFORMATION SETUP
      const drawAreaW = W - 200;
      const drawAreaH = H - 240;
      const drawCenterX = mLeft + drawAreaW / 2 + 30;
      const drawCenterY = mTop + drawAreaH / 2 + 40;

      const scaleX = (drawAreaW * 0.70) / Math.max(D.rangeU, 5);
      const scaleY = (drawAreaH * 0.70) / Math.max(D.rangeV, 5);
      const scale = Math.min(scaleX, scaleY);

      const midU = (D.minU + D.maxU) / 2;
      const midV = (D.minV + D.maxV) / 2;

      function toScreen(u, v) {
        return {
          x: drawCenterX + (u - midU) * scale,
          y: drawCenterY - (v - midV) * scale
        };
      }

      // ── Architectural Grid Pattern
      ctx.strokeStyle = '#f1f5f9';
      ctx.lineWidth = 1;
      const gridStep = 5 * scale; // 5 meters grid
      if (gridStep > 20) {
        for (let gx = drawCenterX - 400; gx <= drawCenterX + 400; gx += gridStep) {
          ctx.beginPath(); ctx.moveTo(gx, mTop + 20); ctx.lineTo(gx, mTop + drawAreaH + 20); ctx.stroke();
        }
        for (let gy = drawCenterY - 300; gy <= drawCenterY + 300; gy += gridStep) {
          ctx.beginPath(); ctx.moveTo(mLeft + 20, gy); ctx.lineTo(mLeft + drawAreaW + 20, gy); ctx.stroke();
        }
      }

      // ── 1. DRAW POLYGON CONTOUR (ROOF PERIMETER)
      const polyPts = D.poly2D.map(p => toScreen(p.u, p.v));

      ctx.beginPath();
      ctx.moveTo(polyPts[0].x, polyPts[0].y);
      for (let i = 1; i < polyPts.length; i++) {
        ctx.lineTo(polyPts[i].x, polyPts[i].y);
      }
      ctx.closePath();

      // Hatching / fill for roof surface
      ctx.fillStyle = 'rgba(241, 245, 249, 0.85)';
      ctx.fill();
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 3.5;
      ctx.stroke();

      // ── DRAW 3D OBSTACLES (Casetones, Chimeneas, HVAC)
      if (D.obstacles && D.obstacles.length > 0) {
        D.obstacles.forEach((obs, obsIdx) => {
          const osc = toScreen(obs.u, obs.v);
          const oW = obs.w * scale;
          const oL = obs.l * scale;
          const ox = osc.x - oW / 2;
          const oy = osc.y - oL / 2;

          ctx.fillStyle = '#ef444422';
          ctx.fillRect(ox, oy, oW, oL);
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 2;
          ctx.strokeRect(ox, oy, oW, oL);

          // Diagonal cross
          ctx.beginPath();
          ctx.moveTo(ox, oy); ctx.lineTo(ox + oW, oy + oL);
          ctx.moveTo(ox + oW, oy); ctx.lineTo(ox, oy + oL);
          ctx.stroke();

          ctx.fillStyle = '#b91c1c';
          ctx.font = 'bold 8px Arial';
          ctx.textAlign = 'center';
          ctx.fillText(obs.name + ' (H=' + obs.h + 'm)', osc.x, osc.y - oL / 2 - 4);
        });
      }

      // Dimensioning along roof edges
      ctx.font = 'bold 9px Arial';
      ctx.fillStyle = '#475569';
      ctx.textAlign = 'center';
      for (let i = 0; i < D.poly2D.length; i++) {
        const p1 = D.poly2D[i];
        const p2 = D.poly2D[(i + 1) % D.poly2D.length];
        const edgeDist = Math.sqrt((p2.u - p1.u) ** 2 + (p2.v - p1.v) ** 2);

        const sp1 = polyPts[i];
        const sp2 = polyPts[(i + 1) % polyPts.length];
        const midX = (sp1.x + sp2.x) / 2;
        const midY = (sp1.y + sp2.y) / 2;

        // Vertex circle markers
        ctx.fillStyle = '#0284c7';
        ctx.beginPath();
        ctx.arc(sp1.x, sp1.y, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#0f172a';
        ctx.fillText('V' + (i + 1), sp1.x, sp1.y - 8);

        // Edge length label
        if (edgeDist > 1.5) {
          ctx.fillStyle = '#0284c7';
          ctx.fillText(edgeDist.toFixed(2) + ' m', midX, midY - 6);
        }
      }

      // ── 2. DRAW SOLAR PANELS (100% IDENTICAL TO 3D SIMULATION)
      const pW_screen = D.panelW * scale;
      const pH_screen = D.panelH * scale;

      D.panels.forEach((panel, pIdx) => {
        const sc = toScreen(panel.u, panel.v);
        const px = sc.x - pW_screen / 2;
        const py = sc.y - pH_screen / 2;

        // Panel frame
        ctx.fillStyle = '#0f2942';
        ctx.fillRect(px, py, pW_screen, pH_screen);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1;
        ctx.strokeRect(px, py, pW_screen, pH_screen);

        // Solar cells texture inside panel
        const numCellsX = 3, numCellsY = 6;
        const cW = (pW_screen - 2) / numCellsX;
        const cH = (pH_screen - 2) / numCellsY;
        ctx.fillStyle = '#1e3a8a';
        for (let cx = 0; cx < numCellsX; cx++) {
          for (let cy = 0; cy < numCellsY; cy++) {
            ctx.fillRect(px + 1 + cx * cW + 0.5, py + 1 + cy * cH + 0.5, cW - 1, cH - 1);
          }
        }

        // MLPE Highlight for shaded panels
        if (panel.hasMLPE) {
          ctx.strokeStyle = '#0284c7';
          ctx.lineWidth = 2.5;
          ctx.strokeRect(px, py, pW_screen, pH_screen);
        }

        // Panel numbering
        if (pW_screen > 16) {
          ctx.fillStyle = panel.hasMLPE ? '#38bdf8' : '#ffffff';
          ctx.font = 'bold ' + Math.max(Math.floor(pW_screen * 0.28), 7) + 'px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(panel.hasMLPE ? (pIdx + 1) + '*' : (pIdx + 1).toString(), sc.x, sc.y);
        }
      });

      // ── 3. STRING INTERCONNECTION WIRING PATH
      if (D.panels.length >= 2) {
        ctx.beginPath();
        const firstP = toScreen(D.panels[0].u, D.panels[0].v);
        ctx.moveTo(firstP.x, firstP.y);

        for (let i = 1; i < D.panels.length; i++) {
          const pt = toScreen(D.panels[i].u, D.panels[i].v);
          ctx.lineTo(pt.x, pt.y);
        }
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([5, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // ── 4. NORTH ARROW & ORIENTATION INDICATOR (Top Right of drawing area)
      const naX = W - 180, naY = 120;
      ctx.save();
      ctx.translate(naX, naY);
      // Azimuth rotation
      ctx.rotate((-D.azimuthDeg * Math.PI) / 180);

      ctx.beginPath();
      ctx.moveTo(0, -38); ctx.lineTo(12, 18); ctx.lineTo(0, 8); ctx.lineTo(-12, 18);
      ctx.closePath();
      ctx.fillStyle = '#0f172a';
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(0, -38); ctx.lineTo(-12, 18); ctx.lineTo(0, 8);
      ctx.closePath();
      ctx.fillStyle = '#ef4444';
      ctx.fill();

      ctx.font = 'bold 13px Arial';
      ctx.fillStyle = '#ef4444';
      ctx.textAlign = 'center';
      ctx.fillText('N', 0, -44);
      ctx.restore();

      ctx.font = 'bold 8.5px Arial';
      ctx.fillStyle = '#0f172a';
      ctx.textAlign = 'center';
      ctx.fillText('NORTE GEOGRÁFICO', naX, naY + 42);
      ctx.font = '8px Arial';
      ctx.fillStyle = '#64748b';
      ctx.fillText('Azimut: ' + (D.azimuthDeg >= 0 ? '+' : '') + D.azimuthDeg.toFixed(1) + '°', naX, naY + 54);
      ctx.fillText('Inclinación: ' + D.tiltDeg.toFixed(1) + '°', naX, naY + 65);

      // ── 5. TECHNICAL SUMMARY CARD (Top Left)
      const scX = mLeft + 25, scY = mTop + 25;
      const scW = 340, scH = 155;
      ctx.fillStyle = '#f8fafc';
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.fillRect(scX, scY, scW, scH);
      ctx.strokeRect(scX, scY, scW, scH);

      ctx.fillStyle = '#0284c7';
      ctx.font = 'bold 10px Arial';
      ctx.textAlign = 'left';
      ctx.fillText('RESUMEN DE IMPLANTACIÓN FOTOVOLTAICA', scX + 12, scY + 18);

      const infoRows = [
        ['Módulos Instalados:', D.totalPanels + ' unidades (' + D.cfg_mod + ')'],
        ['Potencia Pico Instalada:', D.peakPowerKW.toFixed(2) + ' kWp'],
        ['Dimensiones Módulo:', D.panelH.toFixed(2) + ' m × ' + D.panelW.toFixed(2) + ' m (' + (D.panelH * D.panelW).toFixed(2) + ' m²)'],
        ['Superficie Cubierta (3D):', D.area3D.toFixed(1) + ' m²'],
        ['Ocupación Fotovoltaica:', (D.totalPanels * D.panelH * D.panelW).toFixed(1) + ' m² (' + ((D.totalPanels * D.panelH * D.panelW / D.area3D) * 100).toFixed(1) + '% de cubierta)'],
        ['Orientación / Azimut:', (D.azimuthDeg >= 0 ? '+' : '') + D.azimuthDeg.toFixed(1) + '° | Inclinación: ' + D.tiltDeg.toFixed(1) + '°'],
        ['Distancia entre Filas:', '0.04 m (Coplanar sobre estructura)']
      ];

      ctx.font = '8.5px Arial';
      infoRows.forEach((row, idx) => {
        ctx.fillStyle = '#64748b';
        ctx.fillText(row[0], scX + 12, scY + 36 + idx * 16);
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 8.5px Arial';
        ctx.fillText(row[1], scX + 160, scY + 36 + idx * 16);
        ctx.font = '8.5px Arial';
      });

      // ── 6. LEYENDA (Bottom Left)
      const legX = mLeft + 25, legY = H - mBottom - 110;
      const legW = 340, legH = 85;
      ctx.fillStyle = '#f8fafc';
      ctx.strokeStyle = '#cbd5e1';
      ctx.fillRect(legX, legY, legW, legH);
      ctx.strokeRect(legX, legY, legW, legH);

      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 9px Arial';
      ctx.fillText('LEYENDA TÉCNICA', legX + 10, legY + 16);

      // Legend Item 1: Panel
      ctx.fillStyle = '#0f2942';
      ctx.fillRect(legX + 12, legY + 26, 18, 14);
      ctx.strokeStyle = '#38bdf8';
      ctx.strokeRect(legX + 12, legY + 26, 18, 14);
      ctx.fillStyle = '#0f172a';
      ctx.font = '8px Arial';
      ctx.fillText('Módulo Solar FV (' + D.cfg_pot + ' Wp)', legX + 38, legY + 36);

      // Legend Item 2: String Line
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(legX + 12, legY + 54); ctx.lineTo(legX + 30, legY + 54); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillText('Trazado de Interconexión en String (DC)', legX + 38, legY + 56);

      // Legend Item 3: Roof boundary
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(legX + 12, legY + 68, 18, 10);
      ctx.fillText('Límite Perimetral de la Cubierta', legX + 38, legY + 76);

    ${'<'}/script>
  </body>
  </html>
  `;

  const w = window.open('', '_blank');
  if (!w) {
    (typeof raAlert === 'function' ? raAlert : console.warn)('Por favor, activa las ventanas emergentes (popups) en tu navegador para visualizar el plano de planta.', 'warning');
    return;
  }
  w.document.open();
  w.document.write(code);
  w.document.close();
}


function generateFormulario(opt) {
  const returnHtmlOnly = !!(opt && typeof opt === 'object' && opt.returnHtmlOnly);
  if (!returnHtmlOnly && typeof raEnsureAnalysisReadyForDoc === 'function' && !raEnsureAnalysisReadyForDoc()) return;
  const d = _docGetProjectCalcs();
  const t = d.tit;
  const loc = (t.dir ? t.dir + ', ' : '') + (t.mun || '') + (t.prov ? ', ' + t.prov : '');

  const body =
    '<div class="hdr"><div class="hdr-l">' +
    '<span class="badge">FORMULARIO DE TRAMITACIÓN<\/span>' +
    '<h1>Solicitud de Autoconsumo Fotovoltaico<\/h1>' +
    '<p>RD 244\/2019 · RD 1183\/2020 · REBT ITC-BT-40<\/p><\/div>' +
    '<div class="hdr-r"><strong>' + d.refNum + '<\/strong>Fecha: ' + d.fechaStr + '<\/div><\/div>' +

    '<div class="info">Formulario de guía para la tramitación administrativa ante la distribuidora <strong>' + t.dist + '<\/strong> y la Consejería de Energía de la CCAA. Cada autonomía dispone de formularios específicos.<\/div>' +

    '<h2>A. DATOS DEL TITULAR<\/h2>' +
    '<table><tr><th style="width:40%">Campo<\/th><th>Valor<\/th><\/tr>' +
    '<tr><td>Nombre \/ Razón Social<\/td><td><strong>' + t.nombre + '<\/strong><\/td><\/tr>' +
    '<tr><td>NIF \/ CIF<\/td><td>' + t.nif + '<\/td><\/tr>' +
    '<tr><td>Dirección instalación<\/td><td>' + (t.dir || '—') + '<\/td><\/tr>' +
    '<tr><td>Municipio \/ Provincia \/ CP<\/td><td>' + (t.mun || '—') + ' \/ ' + (t.prov || '—') + ' \/ ' + (t.cp || '—') + '<\/td><\/tr>' +
    '<tr><td>Teléfono<\/td><td>' + (t.tel || '—') + '<\/td><\/tr>' +
    '<tr><td>Email<\/td><td>' + (t.email || '—') + '<\/td><\/tr>' +
    '<tr><td>CUPS<\/td><td><strong>' + t.cups + '<\/strong><\/td><\/tr>' +
    '<tr><td>Distribuidora<\/td><td>' + t.dist + '<\/td><\/tr>' +
    '<tr><td>Potencia contratada actual<\/td><td>' + t.potContr + ' kW<\/td><\/tr>' +
    '<\/table>' +

    '<h2>B. DATOS DEL TÉCNICO<\/h2>' +
    '<table><tr><th style="width:40%">Campo<\/th><th>Valor<\/th><\/tr>' +
    '<tr><td>Técnico proyectista<\/td><td>' + t.tecnico + '<\/td><\/tr>' +
    '<tr><td>Titulación<\/td><td>' + t.titulacion + '<\/td><\/tr>' +
    '<tr><td>Nº Colegiado<\/td><td>' + t.ncol + '<\/td><\/tr>' +
    '<\/table>' +

    '<h2>C. DATOS TÉCNICOS DE LA INSTALACIÓN<\/h2>' +
    '<table><tr><th style="width:55%">Parámetro<\/th><th>Valor<\/th><\/tr>' +
    '<tr><td>Modalidad de autoconsumo<\/td><td><strong>' + d.modalTexto + '<\/strong><\/td><\/tr>' +
    '<tr><td>Tipo de instalación<\/td><td>FV conectada a red interior BT<\/td><\/tr>' +
    '<tr><td>Potencia pico instalada (P_pico)<\/td><td><strong>' + d.P_dc_kW.toFixed(3) + ' kWp<\/strong><\/td><\/tr>' +
    '<tr><td>Potencia nominal AC del inversor<\/td><td><strong>' + d.P_ac_kW.toFixed(3) + ' kW<\/strong> (' + (d.inverter ? d.inverter.fullName : 'Inversor central') + ')<\/td><\/tr>' +
    (d.hasBattery && d.battery ? (
      '<tr><td>Sistema de almacenamiento<\/td><td><strong>Sí</strong> · Acumulación electroquímica LiFePO4<\/td><\/tr>' +
      '<tr><td>Fabricante y modelo batería<\/td><td><strong>' + d.battery.fullName + '</strong><\/td><\/tr>' +
      '<tr><td>Capacidad útil de batería<\/td><td><strong>' + d.battery.totalKwh.toFixed(1) + ' kWh</strong> (' + (d.battery.count || 1) + ' módulo/s)<\/td><\/tr>' +
      '<tr><td>Tensión de trabajo batería<\/td><td>' + (d.battery.voltage || 400) + ' V CC (Acoplamiento híbrido CC)<\/td><\/tr>'
    ) : ('<tr><td>Sistema de almacenamiento<\/td><td>Sin acumulación (Conexión directa)<\/td><\/tr>')) +
    '<tr><td>Nº módulos FV \/ Tecnología<\/td><td>' + d.numPanels + ' uds · ' + d.cfg.tecnologia + '<\/td><\/tr>' +
    '<tr><td>Modelo \/ Potencia unitaria<\/td><td>' + d.cfg.modelo + ' — ' + d.cfg.potencia + ' Wp<\/td><\/tr>' +
    '<tr><td>Tensión CC string<\/td><td>' + d.Voc_string.toFixed(0) + ' V CC<\/td><\/tr>' +
    '<tr><td>Conexión AC<\/td><td>' + (d.monofasico ? 'Monofásica 230 V \/ 50 Hz' : 'Trifásica 400 V \/ 50 Hz') + '<\/td><\/tr>' +
    '<tr><td>Latitud \/ Longitud<\/td><td>' + d.latDeg.toFixed(4) + '° N \/ ' + d.lonDeg.toFixed(4) + '° E<\/td><\/tr>' +
    '<tr><td>Producción anual estimada<\/td><td>' + d.annualKWh.toLocaleString('es-ES') + ' kWh\/año<\/td><\/tr>' +
    '<\/table>' +

    '<h2>D. DOCUMENTACIÓN A APORTAR<\/h2>' +
    '<table><tr><th>Documento<\/th><th style="width:100px">Obligatorio<\/th><th style="width:70px">☐ Aportado<\/th><\/tr>' +
    '<tr><td>Memoria técnica (ITC-BT-40 \/ UNE-EN 62446)<\/td><td>Sí<\/td><td>☐<\/td><\/tr>' +
    '<tr><td>Esquema unifilar<\/td><td>Sí<\/td><td>☐<\/td><\/tr>' +
    '<tr><td>Plano de planta con layout de módulos<\/td><td>Sí<\/td><td>☐<\/td><\/tr>' +
    '<tr><td>Fichas técnicas módulos e inversor<\/td><td>Sí<\/td><td>☐<\/td><\/tr>' +
    '<tr><td>Certificados homologación (IEC 61215 \/ IEC 61730)<\/td><td>Sí<\/td><td>☐<\/td><\/tr>' +
    '<tr><td>Boletín instalación eléctrica (instalador ICAT)<\/td><td>Sí<\/td><td>☐<\/td><\/tr>' +
    '<tr><td>Inscripción registro autoconsumo CCAA (RAAC)<\/td><td>Sí<\/td><td>☐<\/td><\/tr>' +
    '<tr><td>Declaración responsable RD 244\/2019 (≤ 100 kWp)<\/td><td>Sí<\/td><td>☐<\/td><\/tr>' +
    '<tr><td>Autorización administrativa (> 100 kWp)<\/td><td>Si aplica<\/td><td>☐<\/td><\/tr>' +
    '<tr><td>Solicitud acceso red RD 1183\/2020 (> 15 kW)<\/td><td>Si aplica<\/td><td>☐<\/td><\/tr>' +
    '<tr><td>Pliego de condiciones<\/td><td>Recomendado<\/td><td>☐<\/td><\/tr>' +
    '<tr><td>Estudio básico seguridad y salud<\/td><td>Recomendado<\/td><td>☐<\/td><\/tr>' +
    '<\/table>' +

    '<h2>E. PASOS DE TRAMITACIÓN (RD 244\/2019)<\/h2>' +
    '<table><tr><th style="width:35px">Paso<\/th><th>Acción<\/th><th style="width:160px">Organismo<\/th><th style="width:120px">Plazo orientativo<\/th><\/tr>' +
    '<tr><td>1<\/td><td>Contratación instalador habilitado (ICAT)<\/td><td>—<\/td><td>—<\/td><\/tr>' +
    '<tr><td>2<\/td><td>Solicitud condiciones técnicas de conexión a la distribuidora<\/td><td>' + t.dist + '<\/td><td>15 días hábiles<\/td><\/tr>' +
    '<tr><td>3<\/td><td>Ejecución de la instalación por empresa ICAT<\/td><td>Instalador<\/td><td>Según proyecto<\/td><\/tr>' +
    '<tr><td>4<\/td><td>Emisión boletín instalación eléctrica<\/td><td>Instalador ICAT<\/td><td>Tras puesta en marcha<\/td><\/tr>' +
    '<tr><td>5<\/td><td>Inscripción RAAC (Registro Autoconsumo CCAA)<\/td><td>Consejería Energía CCAA<\/td><td>1–3 meses<\/td><\/tr>' +
    '<tr><td>6<\/td><td>Comunicación a distribuidora \/ modificación contrato<\/td><td>' + t.dist + '<\/td><td>1 mes<\/td><\/tr>' +
    '<tr><td>7<\/td><td>Instalación contador bidireccional (si con excedentes)<\/td><td>' + t.dist + '<\/td><td>1 mes<\/td><\/tr>' +
    '<\/table>' +

    '<h2>F. DECLARACIÓN RESPONSABLE<\/h2>' +
    '<p>D.\/Dña. <strong>' + t.nombre + '<\/strong>, NIF <strong>' + t.nif + '<\/strong>, titular del CUPS <strong>' + t.cups + '<\/strong> en ' + (loc || '___') + ', <strong>DECLARA RESPONSABLEMENTE<\/strong> que:<\/p>' +
    '<ol style="margin:8px 0 8px 20px;line-height:2.2">' +
    '<li>Los datos aportados son verídicos y la instalación se ejecutará conforme a la documentación técnica adjunta.<\/li>' +
    '<li>La instalación cumple el REBT (RD 842\/2002) e ITC-BT-40.<\/li>' +
    '<li>Modalidad solicitada: <strong>' + d.modalTexto + '<\/strong>.<\/li>' +
    '<li>La instalación será ejecutada por empresa habilitada (ICAT), conforme al RD 244\/2019.<\/li>' +
    '<\/ol>' +

    '<div class="sig-row" style="margin-top:40px">' +
    '<div class="sig">El Titular<br><br><br><br>' + t.nombre + '<br>NIF: ' + t.nif + '<br>' + (t.mun || '___') + ', ' + d.fechaStr + '<\/div>' +
    '<div class="sig">El Técnico Proyectista<br><br><br><br>' + t.tecnico + '<br>' + t.titulacion + '<br>Col. nº ' + t.ncol + '<\/div><\/div>' +

    '<div class="footer">' + d.refNum + ' — FORMULARIO TRAMITACIÓN RD 244\/2019 — ' + d.fechaStr + ' — Generado por RA · Sistema de Diseño FV 3D<br>' +
    '⚠ Verificar con la normativa autonómica vigente antes de presentar ante la administración.<\/div>';

  if (returnHtmlOnly) {
    return docWindow('FORM — ' + d.refNum, body, { returnHtmlOnly: true });
  }

  docWindow('FORM — ' + d.refNum, body);
}

/**
 * 📦 PACK DE ENTREGA UNIFICADO (HITO 10)
 * Genera el conjunto documental integral para el cliente y la administración:
 * 1. Memoria Técnica Oficial (REBT / ITC-BT-40)
 * 2. Propuesta / Oferta Comercial Bancable (25 años)
 * 3. Formulario Administrativo RD 244/2019
 * 4. Análisis Comparativo Energético
 */
async function generateDeliveryPack(skipPricingModal) {
  if (typeof raEnsureAnalysisReadyForDoc === 'function' && !raEnsureAnalysisReadyForDoc()) {
    return;
  }
  if (!skipPricingModal && typeof wpOpenPricingReviewModal === 'function') {
    wpOpenPricingReviewModal(function() {
      generateDeliveryPack(true);
    });
    return;
  }

  const d = _docGetProjectCalcs();
  if (d.numPanels === 0) {
    (typeof raAlert === 'function' ? raAlert : console.warn)('Diseña primero el polígono de la instalación en el visor 3D.', 'warning');
    return;
  }

  if (typeof showToast === 'function') {
    showToast('PACK DE ENTREGA', 'Empaquetando toda la documentación técnica en formato ZIP...', 'info', 5000);
  }

  try {
    // 1. Cargar JSZip de forma perezosa
    const JSZipLib = (typeof window.ensureJSZipLoaded === 'function') ? await window.ensureJSZipLoaded() : window.JSZip;
    if (!JSZipLib) {
      throw new Error('Librería de compresión ZIP no disponible');
    }

    const zip = new JSZipLib();
    const ref = (d && d.refNum) ? d.refNum.replace(/[^a-zA-Z0-9_-]/g, '_') : 'PROYECTO_FV';
    const folder = zip.folder('Proyecto_' + ref);

    // 2. Generar Unifilar SVG y DXF
    const unifPayload = {
      refNum: d.refNum, fechaStr: d.fechaStr, nombre: d.tit.nombre, nif: d.tit.nif,
      dir: d.tit.dir || 'Ubicación Instalación', mun: d.tit.mun || '', prov: d.tit.prov || '',
      cups: d.tit.cups, dist: d.tit.dist, tecnico: d.tit.tecnico, titulacion: d.tit.titulacion,
      ncol: d.tit.ncol, modalTexto: d.modalTexto, numPanels: d.numPanels, numStrings: d.numStrings,
      modsActual: d.modsActual, cfg_pot: d.cfg.potencia, cfg_mod: d.cfg.modelo, cfg_tec: d.cfg.tecnologia,
      Voc: d.Voc, Isc: d.Isc, Vmp: d.Vmp, Imp: d.Imp, Voc_string: d.Voc_string,
      Voc_str_cold: d.Voc_str_cold, I_total_dc: d.I_total_dc, P_dc_kW: d.P_dc_kW, P_ac_kW: d.P_ac_kW,
      inv_kW: d.inv_kW, monofasico: d.monofasico, V_ac: d.V_ac, I_ac: d.I_ac, I_ac_d: d.I_ac_d,
      S_str: d.S_str, S_mdc: d.S_mdc, S_ac: d.S_ac, useFuses: d.useFuses, mlpeCount: d.mlpeCount,
      fuse_std: d.fuse_std, I_iga: d.I_iga, dif_amp: d.dif_amp, R_tierra: d.R_tierra,
      L_dc: d.L_dc, L_ac: d.L_ac, dVdc_p: d.dVdc_p, dVac_p: d.dVac_p,
      inverter: d.inverter, battery: d.battery, hasBattery: d.hasBattery, V_max_inv: d.V_max_inv
    };

    const unifilarSvg = buildUnifilarSvg(unifPayload);
    const unifilarDxf = generateUnifilarDxfString(unifPayload);
    const memoriaHtml = generateMemoria(true, { returnHtmlOnly: true });
    const pliegoHtml = generatePliego({ returnHtmlOnly: true });
    const presupuestoHtml = generatePresupuesto(true, { returnHtmlOnly: true });
    const formularioHtml = generateFormulario({ returnHtmlOnly: true });

    if (memoriaHtml) folder.file('01_Memoria_Tecnica_Oficial_' + ref + '.html', memoriaHtml);
    if (pliegoHtml) folder.file('02_Pliego_de_Condiciones_' + ref + '.html', pliegoHtml);
    if (presupuestoHtml) folder.file('03_Presupuesto_Detallado_' + ref + '.html', presupuestoHtml);
    folder.file('04_Esquema_Unifilar_' + ref + '.svg', unifilarSvg);
    folder.file('04_Esquema_Unifilar_' + ref + '.dxf', unifilarDxf);
    if (formularioHtml) folder.file('05_Formulario_Tramitacion_RD244_' + ref + '.html', formularioHtml);

    // 3. Crear archivo Léame / Índice documental
    const readmeText = 'PROYECTO TÉCNICO FOTOVOLTAICO ' + d.refNum + '\r\n' +
      '================================================================\r\n' +
      'Promotor: ' + d.tit.nombre + ' (' + d.tit.nif + ')\r\n' +
      'Ubicación: ' + (d.tit.dir || '') + ', ' + (d.tit.mun || '') + ' (' + (d.tit.prov || '') + ')\r\n' +
      'Potencia Pico: ' + d.P_dc_kW.toFixed(2) + ' kWp (' + d.numPanels + ' módulos ' + d.cfg.potencia + ' Wp)\r\n' +
      'Inversor: ' + (d.inverter ? d.inverter.fullName : (d.P_ac_kW.toFixed(2) + ' kW')) + '\r\n' +
      'Almacenamiento: ' + (d.hasBattery && d.battery ? (d.battery.fullName + ' · ' + d.battery.totalKwh.toFixed(1) + ' kWh') : 'Sin acumulación') + '\r\n' +
      'Fecha: ' + d.fechaStr + '\r\n\r\n' +
      'DOCUMENTOS INCLUIDOS EN ESTE PAQUETE:\r\n' +
      '1. 01_Memoria_Tecnica_Oficial (ITC-BT-40 / UNE-EN 62446)\r\n' +
      '2. 02_Pliego_de_Condiciones (REBT / CTE DB-SE-AE)\r\n' +
      '3. 03_Presupuesto_Detallado (Medición 3D y Flujo 25 años)\r\n' +
      '4. 04_Esquema_Unifilar (Formatos Vectorial SVG y AutoCAD DXF R12)\r\n' +
      '5. 05_Formulario_Tramitacion_RD244 (Distribuidora y CCAA)\r\n\r\n' +
      'Generado íntegramente por RA · Sistema de Diseño y Simulación Solar 3D.';
    folder.file('LEAME_INDICE_PROYECTO.txt', readmeText);

    // 4. Generar y descargar el Blob ZIP en un único click
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const downloadUrl = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = 'Pack_Documental_FV_' + ref + '.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 4000);

    if (typeof showToast === 'function') {
      showToast('ENTREGA COMPLETADA', '✓ Archivo ZIP con el paquete técnico completo descargado con éxito.', 'success', 5000);
    }
  } catch (err) {
    console.warn('[DeliveryPack] Fallback por error en ZIP:', err);
    if (typeof showToast === 'function') {
      showToast('DESCARGA', 'Generando documentos...', 'info', 3000);
    }
    if (typeof generateMemoria === 'function') generateMemoria(true);
    if (typeof generatePresupuesto === 'function') setTimeout(() => generatePresupuesto(true), 600);
  }
}

if (typeof window !== 'undefined') {
  window.generateMemoria = generateMemoria;
  window.generatePresupuesto = generatePresupuesto;
  window.generateDeliveryPack = generateDeliveryPack;
  if (!window.RA) window.RA = {};
  window.RA.generateMemoria = generateMemoria;
  window.RA.generatePresupuesto = generatePresupuesto;
  window.RA.generateDeliveryPack = generateDeliveryPack;
}
