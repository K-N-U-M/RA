/**
 * ============================================================================
 * 📄 RA · RUNTIME COMPARTIDO DE VISORES Y EDITORES DE DOCUMENTOS (SSOT)
 * ============================================================================
 * Archivo: js/doc-popup-runtime.js
 * Rol: Consolida la lógica común de las ventanas emergentes/iframes de documentos
 *      (Memoria Técnica, Presupuesto, Propuesta Comercial y Dossier Landscape):
 *      notificaciones, confirmaciones modales, captura 3D, exportación DOCX/HTML,
 *      barra de formato contextual y drag/resize de bloques.
 * ============================================================================
 */
(function (root) {
  'use strict';

  function getWin(win) {
    return win || root;
  }

  function getOpenerWindow(win) {
    var w = getWin(win);
    try {
      if (w && w.opener && !w.opener.closed && w.opener.document) return w.opener;
    } catch (e) {}
    try {
      if (w && w.parent && w.parent !== w && w.parent.document) return w.parent;
    } catch (e2) {}
    return null;
  }

  function notify(msg, win) {
    var w = getWin(win);
    var doc = w && w.document;
    try {
      var ow = getOpenerWindow(w);
      if (ow && typeof ow.raAlert === 'function') {
        ow.raAlert(msg);
        return;
      }
    } catch (e) {}
    if (!doc || !doc.body) return;
    var n = doc.createElement('div');
    n.setAttribute('role', 'status');
    n.style.cssText = 'position:fixed;top:14px;right:14px;z-index:999999;background:#0f172a;color:#fff;padding:10px 14px;border-radius:8px;font-size:12px;box-shadow:0 8px 24px rgba(0,0,0,0.4);max-width:360px;';
    n.textContent = String(msg == null ? '' : msg);
    doc.body.appendChild(n);
    setTimeout(function () {
      if (n.parentNode) n.parentNode.removeChild(n);
    }, 4500);
  }

  function confirmAsync(msg, optsOrWin, maybeWin) {
    var opts = {};
    var win = maybeWin;
    if (optsOrWin && typeof optsOrWin === 'object' && optsOrWin.document) {
      win = optsOrWin;
    } else if (optsOrWin && typeof optsOrWin === 'object') {
      opts = optsOrWin;
    }
    var w = getWin(win);
    var doc = w && w.document;
    var title = opts.title || 'Confirmar';
    var confirmLabel = opts.confirmLabel || 'Eliminar';

    try {
      var ow = getOpenerWindow(w);
      if (ow && typeof ow.raConfirmAsync === 'function') {
        return ow.raConfirmAsync(msg, title);
      }
    } catch (e) {}

    if (!doc || !doc.body) return Promise.resolve(false);
    return new Promise(function (res) {
      var ov = doc.createElement('div');
      ov.style.cssText = 'position:fixed;inset:0;background:rgba(2,6,23,0.75);z-index:999999;display:flex;align-items:center;justify-content:center;';
      ov.innerHTML = '<div style="background:#0f172a;color:#fff;padding:18px;border-radius:10px;max-width:380px;font-family:sans-serif;"><div style="font-size:13px;margin-bottom:14px;"></div><div style="display:flex;justify-content:flex-end;gap:8px;"><button type="button" data-c="0" style="padding:6px 12px;border-radius:6px;border:1px solid #475569;background:#1e293b;color:#fff;cursor:pointer;">Cancelar</button><button type="button" data-c="1" style="padding:6px 12px;border-radius:6px;border:none;background:#059669;color:#fff;font-weight:700;cursor:pointer;"></button></div></div>';
      ov.firstChild.firstChild.textContent = String(msg == null ? '' : msg);
      var btnOk = ov.querySelector('[data-c="1"]');
      if (btnOk) btnOk.textContent = confirmLabel;
      ov.querySelector('[data-c="0"]').onclick = function () { ov.remove(); res(false); };
      ov.querySelector('[data-c="1"]').onclick = function () { ov.remove(); res(true); };
      doc.body.appendChild(ov);
    });
  }

  function capture3DCanvas(win) {
    var w = getWin(win);
    var ow = getOpenerWindow(w) || (w && w.viewer ? w : null);
    if (!ow) return null;
    var canvas = null;
    if (ow.viewer && ow.viewer.scene && ow.viewer.scene.canvas) {
      try { ow.viewer.scene.render(); } catch (e) {}
      canvas = ow.viewer.scene.canvas;
    } else if (ow.document) {
      canvas = ow.document.querySelector('canvas');
    }
    if (!canvas || typeof canvas.toDataURL !== 'function') return null;
    return canvas.toDataURL('image/jpeg', 0.92);
  }

  async function resolveDocxExporter(win) {
    var w = getWin(win);
    var ow = getOpenerWindow(w);
    var exporter = (ow && ow.RADocxExporter) || (w && w.RADocxExporter) || root.RADocxExporter || null;
    if (!exporter && ow && ow.RALazyLoader && typeof ow.RALazyLoader.loadDocxExporter === 'function') {
      exporter = await ow.RALazyLoader.loadDocxExporter();
    } else if (!exporter && w && w.RALazyLoader && typeof w.RALazyLoader.loadDocxExporter === 'function') {
      exporter = await w.RALazyLoader.loadDocxExporter();
    } else if (!exporter && root.RALazyLoader && typeof root.RALazyLoader.loadDocxExporter === 'function') {
      exporter = await root.RALazyLoader.loadDocxExporter();
    }
    return exporter;
  }

  async function rasterizeSvgsFallback(container, doc, win) {
    var w = win || root;
    var XMLSer = w.XMLSerializer || (typeof XMLSerializer !== 'undefined' ? XMLSerializer : null);
    if (!XMLSer) return;
    var svgs = Array.prototype.slice.call(container.querySelectorAll('svg'));
    for (var i = 0; i < svgs.length; i++) {
      var svgEl = svgs[i];
      try {
        var svgData = new XMLSer().serializeToString(svgEl);
        var svgB64 = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
        var imgEl = doc.createElement('img');
        imgEl.src = svgB64;
        imgEl.style.cssText = svgEl.style.cssText || 'display:block;max-width:100%;';
        if (svgEl.getAttribute('width')) imgEl.setAttribute('width', svgEl.getAttribute('width'));
        if (svgEl.getAttribute('height')) imgEl.setAttribute('height', svgEl.getAttribute('height'));
        if (svgEl.parentNode) svgEl.parentNode.replaceChild(imgEl, svgEl);
      } catch (eSvg) {
        if (typeof console !== 'undefined' && typeof console.debug === 'function') {
          console.debug('[RADocRuntime.rasterizeSvgsFallback]', eSvg);
        }
      }
    }
  }

  function sanitizeExportNode(node, cleanSelector) {
    if (!node) return node;
    if (cleanSelector) {
      node.querySelectorAll(cleanSelector).forEach(function (el) { el.remove(); });
    }
    node.querySelectorAll('[contenteditable]').forEach(function (el) { el.removeAttribute('contenteditable'); });
    node.querySelectorAll('.editable-field').forEach(function (el) { el.classList.remove('editable-field'); });
    node.querySelectorAll('[data-editable-box]').forEach(function (el) {
      el.removeAttribute('draggable');
      el.removeAttribute('data-editable-box');
    });
    if (typeof node.removeAttribute === 'function') node.removeAttribute('contenteditable');
    return node;
  }

  async function exportDocx(opts) {
    opts = opts || {};
    var w = getWin(opts.win);
    var doc = w.document;
    var btn = opts.buttonEl || (opts.buttonId ? doc.getElementById(opts.buttonId) : null);
    var origText = btn ? btn.innerHTML : '';
    if (btn) {
      btn.innerHTML = opts.loadingHtml || '⏳ GENERANDO DOCX...';
      btn.disabled = true;
    }

    try {
      var targetNode = null;
      var cleanSelector = opts.cleanSelector || '.doc-top-bar, #doc-format-toolbar, #prop-format-toolbar, .no-print, .ra-edit-del-btn, .ra-gap-handle, #ra-gap-tooltip';

      if (opts.sheets && opts.sheets.length > 0) {
        targetNode = doc.createElement('div');
        Array.prototype.forEach.call(opts.sheets, function (s) {
          var c = sanitizeExportNode(s.cloneNode(true), cleanSelector);
          targetNode.appendChild(c);
        });
      } else if (opts.rootEl) {
        targetNode = sanitizeExportNode(opts.rootEl.cloneNode(true), cleanSelector);
      } else {
        throw new Error('No se encontró contenido para exportar');
      }

      var exporter = await resolveDocxExporter(w);
      if (exporter && typeof exporter.rasterizeSvgsToPng === 'function') {
        await exporter.rasterizeSvgsToPng(targetNode);
      } else {
        await rasterizeSvgsFallback(targetNode, doc, w);
      }

      var stylesEl = doc.querySelector('style');
      var styles = stylesEl ? stylesEl.innerHTML : '';
      var htmlBody = opts.useOuterHtml ? targetNode.outerHTML : targetNode.innerHTML;
      var docxBlob = null;

      if (exporter && typeof exporter.buildDocxBlobFromHtml === 'function') {
        docxBlob = exporter.buildDocxBlobFromHtml(htmlBody, {
          orientation: opts.orientation || 'portrait',
          styles: styles,
          title: opts.title || doc.title || 'Documento'
        });
      } else if (typeof w.buildDocxBlobFromHtml === 'function') {
        docxBlob = w.buildDocxBlobFromHtml(htmlBody, {
          orientation: opts.orientation || 'portrait',
          styles: styles,
          title: opts.title || doc.title || 'Documento'
        });
      } else if (opts.allowWordHtmlFallback) {
        var wordHtml = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><style>' + styles + '</style></head><body>' + htmlBody + '</body></html>';
        docxBlob = new w.Blob(['\ufeff', wordHtml], { type: 'application/msword' });
      } else {
        throw new Error('Módulo RADocxExporter no disponible');
      }

      var a = doc.createElement('a');
      a.href = w.URL.createObjectURL(docxBlob);
      a.download = opts.filename || 'Documento.docx';
      doc.body.appendChild(a);
      a.click();
      doc.body.removeChild(a);
      setTimeout(function () {
        try { w.URL.revokeObjectURL(a.href); } catch (e) {}
      }, 30000);
    } catch (errDocx) {
      if (typeof console !== 'undefined' && typeof console.error === 'function') {
        console.error('Error exportando documento DOCX:', errDocx);
      }
      notify('No se pudo generar el archivo DOCX: ' + (errDocx && errDocx.message ? errDocx.message : errDocx), w);
    } finally {
      if (btn) {
        btn.innerHTML = origText || opts.defaultHtml || '📝 WORD (.DOCX)';
        btn.disabled = false;
      }
    }
  }

  function exportHtml(opts) {
    opts = opts || {};
    var w = getWin(opts.win);
    var doc = w.document;
    var cleanSelector = opts.cleanSelector || '.doc-top-bar, #doc-format-toolbar, #prop-format-toolbar, .no-print, .ra-edit-del-btn, .ra-gap-handle, #ra-gap-tooltip';
    var clone = sanitizeExportNode(doc.documentElement.cloneNode(true), cleanSelector);
    var blob = new w.Blob(['\ufeff' + clone.outerHTML], { type: 'text/html;charset=utf-8' });
    var a = doc.createElement('a');
    a.href = w.URL.createObjectURL(blob);
    a.download = opts.filename || 'Documento.html';
    doc.body.appendChild(a);
    a.click();
    doc.body.removeChild(a);
    setTimeout(function () {
      try { w.URL.revokeObjectURL(a.href); } catch (e) {}
    }, 30000);
  }

  function bindSelectionToolbar(opts) {
    opts = opts || {};
    var w = getWin(opts.win);
    var doc = w.document;
    var toolbarId = opts.toolbarId || 'doc-format-toolbar';
    var activeClass = opts.activeClass || 'mode-edit-layout';
    var sheetSelector = opts.sheetSelector || '#editable-doc-sheet';

    if (doc.__raSelectionToolbarBound) return;
    doc.__raSelectionToolbarBound = true;

    doc.addEventListener('selectionchange', function () {
      var tb = doc.getElementById(toolbarId);
      if (!tb || !doc.body.classList.contains(activeClass)) {
        if (tb) tb.style.display = 'none';
        return;
      }
      var sel = w.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) {
        tb.style.display = 'none';
        return;
      }
      var range = sel.getRangeAt(0);
      var sheets = doc.querySelectorAll(sheetSelector);
      var insideSheet = false;
      sheets.forEach(function (s) {
        if (s.contains(range.commonAncestorContainer)) insideSheet = true;
      });
      if (!insideSheet) {
        tb.style.display = 'none';
        return;
      }
      var rect = range.getBoundingClientRect();
      if (rect.width === 0) {
        tb.style.display = 'none';
        return;
      }
      tb.style.display = 'flex';
      tb.style.left = Math.max(10, Math.min(w.innerWidth - 380, rect.left + w.scrollX + (rect.width / 2) - 180)) + 'px';
      tb.style.top = Math.max(54, rect.top + w.scrollY - 44) + 'px';
    });
  }

  function setupDocDraggableBlocks(opts) {
    opts = opts || {};
    var w = getWin(opts.win);
    var doc = w.document;
    var sheet = doc.getElementById(opts.sheetId || 'editable-doc-sheet');
    if (!sheet) return;
    var activeClass = opts.activeClass || 'mode-edit-layout';
    var confirmMsg = opts.confirmMsg || '¿Eliminar este bloque del presupuesto?';

    if (!w.__raDocDragState) w.__raDocDragState = { active: null };
    var dragState = w.__raDocDragState;

    var candidates = sheet.querySelectorAll('.doc-box, .doc-grid-4, .doc-table, .doc-section-title, .doc-img-resizable, .kpi-card');
    candidates.forEach(function (el) {
      if (el.hasAttribute('data-has-drag')) return;
      el.setAttribute('data-has-drag', 'true');
      el.classList.add('ra-draggable-block');

      var delBtn = doc.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'ra-block-del-btn no-print';
      delBtn.title = 'Eliminar este bloque';
      delBtn.innerHTML = '✕';
      delBtn.onclick = async function (ev) {
        ev.stopPropagation();
        if (await confirmAsync(confirmMsg, w)) {
          el.remove();
        }
      };
      el.appendChild(delBtn);

      var handle = doc.createElement('div');
      handle.className = 'ra-block-drag-handle no-print';
      handle.title = 'Arrastra para mover este bloque arriba o abajo';
      handle.innerHTML = '⠿';
      el.appendChild(handle);

      el.setAttribute('draggable', 'true');

      el.addEventListener('dragstart', function (ev) {
        if (!doc.body.classList.contains(activeClass)) {
          ev.preventDefault();
          return;
        }
        dragState.active = el;
        ev.dataTransfer.effectAllowed = 'move';
        try { ev.dataTransfer.setData('text/plain', ''); } catch (e) {}
        el.style.opacity = '0.4';
      });

      el.addEventListener('dragend', function () {
        if (dragState.active) dragState.active.style.opacity = '1';
        dragState.active = null;
      });

      el.addEventListener('dragover', function (ev) {
        if (!doc.body.classList.contains(activeClass) || !dragState.active || dragState.active === el) return;
        ev.preventDefault();
        ev.dataTransfer.dropEffect = 'move';
      });

      el.addEventListener('drop', function (ev) {
        if (!doc.body.classList.contains(activeClass) || !dragState.active || dragState.active === el) return;
        ev.preventDefault();
        ev.stopPropagation();
        var parent = el.parentNode;
        if (!parent) return;
        var rect = el.getBoundingClientRect();
        var next = (ev.clientY - rect.top) > (rect.height / 2);
        parent.insertBefore(dragState.active, next ? el.nextSibling : el);
      });
    });
  }

  function setupProposalInteractiveBoxes(opts) {
    opts = opts || {};
    var w = getWin(opts.win);
    var doc = w.document;
    var activeClass = opts.activeClass || 'mode-edit-layout';
    var confirmMsg = opts.confirmMsg || '¿Eliminar este bloque del documento?';

    if (!w.__raPropEditState) w.__raPropEditState = { dragged: null, selected: null };
    var state = w.__raPropEditState;

    var selectors = opts.selectors || [
      '.hero-card', '.closer-hero-card', '.decision-card', '.chart-box', '.tech-card',
      '.sig-card', '.cover-spec-card', '.photo-card-hero', '.photo-card-sub', '.cover-photo-card',
      '.kpi-strip', '.dcard', '.closer-cta-box', '.cel-card', 'table', 'p', 'h2', 'h3'
    ];
    var sheets = doc.querySelectorAll(opts.sheetSelector || '.page-sheet');
    sheets.forEach(function (sheet) {
      selectors.forEach(function (sel) {
        sheet.querySelectorAll(sel).forEach(function (el) {
          if (el.hasAttribute('data-editable-box')) return;
          el.setAttribute('data-editable-box', 'true');

          var delBtn = doc.createElement('button');
          delBtn.type = 'button';
          delBtn.className = 'ra-edit-del-btn no-print';
          delBtn.title = 'Eliminar este elemento';
          delBtn.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
          delBtn.onclick = async function (ev) {
            ev.stopPropagation();
            ev.preventDefault();
            if (await confirmAsync(confirmMsg, w)) {
              el.remove();
            }
          };
          el.appendChild(delBtn);

          var handleCorner = doc.createElement('div');
          handleCorner.className = 'ra-resize-handle ra-resize-corner no-print';
          handleCorner.title = 'Arrastra para redimensionar ancho y alto';
          handleCorner.innerHTML = '◢';
          el.appendChild(handleCorner);

          var handleHeight = doc.createElement('div');
          handleHeight.className = 'ra-resize-handle ra-resize-height no-print';
          handleHeight.title = 'Arrastra hacia arriba o abajo para ajustar la altura del bloque';
          handleHeight.innerHTML = '⇕ Alto';
          el.appendChild(handleHeight);

          handleHeight.addEventListener('mousedown', function (e) {
            e.stopPropagation();
            e.preventDefault();
            var startY = e.clientY;
            var startH = el.offsetHeight;
            var tt = doc.getElementById('ra-gap-tooltip');
            var radarInner = el.querySelector('.cel-radar-inner') || (el.classList.contains('cel-radar-inner') ? el : null);
            var startInnerH = radarInner ? radarInner.offsetHeight : 0;

            function onMoveH(ev) {
              var deltaY = ev.clientY - startY;
              var newH = Math.max(60, Math.round(startH + deltaY));
              el.style.height = newH + 'px';
              if (radarInner && startInnerH > 0) {
                radarInner.style.height = Math.max(80, Math.round(startInnerH + deltaY)) + 'px';
              }
              if (tt) {
                tt.style.display = 'block';
                tt.style.left = (ev.clientX + 14) + 'px';
                tt.style.top = (ev.clientY - 12) + 'px';
                tt.innerHTML = '⇕ Altura bloque: <b>' + newH + ' px</b>';
              }
            }
            function onUpH() {
              w.removeEventListener('mousemove', onMoveH);
              w.removeEventListener('mouseup', onUpH);
              if (tt) tt.style.display = 'none';
            }
            w.addEventListener('mousemove', onMoveH);
            w.addEventListener('mouseup', onUpH);
          });

          handleCorner.addEventListener('mousedown', function (e) {
            e.stopPropagation();
            e.preventDefault();
            var startX = e.clientX;
            var startY = e.clientY;
            var startW = el.offsetWidth;
            var startH = el.offsetHeight;
            var tt = doc.getElementById('ra-gap-tooltip');
            var radarInner = el.querySelector('.cel-radar-inner') || (el.classList.contains('cel-radar-inner') ? el : null);
            var startInnerH = radarInner ? radarInner.offsetHeight : 0;

            function onMoveC(ev) {
              var newW = Math.max(100, Math.round(startW + (ev.clientX - startX)));
              var deltaY = ev.clientY - startY;
              var newH = Math.max(60, Math.round(startH + deltaY));
              el.style.width = newW + 'px';
              el.style.height = newH + 'px';
              if (radarInner && startInnerH > 0) {
                radarInner.style.height = Math.max(80, Math.round(startInnerH + deltaY)) + 'px';
              }
              if (tt) {
                tt.style.display = 'block';
                tt.style.left = (ev.clientX + 14) + 'px';
                tt.style.top = (ev.clientY - 12) + 'px';
                tt.innerHTML = '⤡ Tamaño: <b>' + newW + ' × ' + newH + ' px</b>';
              }
            }
            function onUpC() {
              w.removeEventListener('mousemove', onMoveC);
              w.removeEventListener('mouseup', onUpC);
              if (tt) tt.style.display = 'none';
            }
            w.addEventListener('mousemove', onMoveC);
            w.addEventListener('mouseup', onUpC);
          });

          var handleX = doc.createElement('div');
          handleX.className = 'ra-gap-handle ra-gap-handle-x no-print';
          handleX.title = 'Arrastra horizontalmente para separar o acercar lateralmente (↔ Margen)';
          handleX.innerHTML = '↔';
          el.appendChild(handleX);

          var handleY = doc.createElement('div');
          handleY.className = 'ra-gap-handle ra-gap-handle-y no-print';
          handleY.title = 'Arrastra verticalmente para separar o acercar entre filas (↕ Margen)';
          handleY.innerHTML = '↕';
          el.appendChild(handleY);

          handleX.addEventListener('mousedown', function (e) {
            e.stopPropagation();
            e.preventDefault();
            var startX = e.clientX;
            var startMarginR = parseFloat(w.getComputedStyle(el).marginRight) || 0;
            var tt = doc.getElementById('ra-gap-tooltip');

            function onMoveX(ev) {
              var newMargin = Math.max(0, Math.round(startMarginR + (ev.clientX - startX)));
              el.style.marginRight = newMargin + 'px';
              if (tt) {
                tt.style.display = 'block';
                tt.style.left = (ev.clientX + 14) + 'px';
                tt.style.top = (ev.clientY - 12) + 'px';
                tt.innerHTML = '↔ Margen H: <b>' + newMargin + ' px</b> (~' + (newMargin * 0.264583).toFixed(1) + ' mm)';
              }
            }
            function onUpX() {
              w.removeEventListener('mousemove', onMoveX);
              w.removeEventListener('mouseup', onUpX);
              if (tt) tt.style.display = 'none';
            }
            w.addEventListener('mousemove', onMoveX);
            w.addEventListener('mouseup', onUpX);
          });

          handleY.addEventListener('mousedown', function (e) {
            e.stopPropagation();
            e.preventDefault();
            var startY = e.clientY;
            var startMarginB = parseFloat(w.getComputedStyle(el).marginBottom) || 0;
            var tt = doc.getElementById('ra-gap-tooltip');

            function onMoveY(ev) {
              var newMargin = Math.max(0, Math.round(startMarginB + (ev.clientY - startY)));
              el.style.marginBottom = newMargin + 'px';
              if (tt) {
                tt.style.display = 'block';
                tt.style.left = (ev.clientX + 14) + 'px';
                tt.style.top = (ev.clientY - 12) + 'px';
                tt.innerHTML = '↕ Margen V: <b>' + newMargin + ' px</b> (~' + (newMargin * 0.264583).toFixed(1) + ' mm)';
              }
            }
            function onUpY() {
              w.removeEventListener('mousemove', onMoveY);
              w.removeEventListener('mouseup', onUpY);
              if (tt) tt.style.display = 'none';
            }
            w.addEventListener('mousemove', onMoveY);
            w.addEventListener('mouseup', onUpY);
          });

          el.addEventListener('click', function (ev) {
            if (!doc.body.classList.contains(activeClass)) return;
            ev.stopPropagation();
            if (state.selected) state.selected.classList.remove('selected-edit-box');
            state.selected = el;
            el.classList.add('selected-edit-box');
          });

          el.addEventListener('mousedown', function (ev) {
            if (!doc.body.classList.contains(activeClass)) return;
            if (ev.target.closest('.ra-edit-del-btn') || ev.target.closest('.ra-gap-handle') || ev.target.closest('.ra-resize-handle')) return;
            if (ev.target.tagName === 'INPUT' || ev.target.tagName === 'TEXTAREA') return;

            var rect = el.getBoundingClientRect();
            if ((ev.clientX >= rect.right - 18) && (ev.clientY >= rect.bottom - 18)) {
              el.removeAttribute('draggable');
              return;
            }
            el.setAttribute('draggable', 'true');
          });

          el.addEventListener('dragstart', function (ev) {
            if (!doc.body.classList.contains(activeClass)) return;
            state.dragged = el;
            ev.dataTransfer.effectAllowed = 'move';
            try { ev.dataTransfer.setData('text/plain', ''); } catch (e) {}
            setTimeout(function () {
              if (state.dragged) state.dragged.style.opacity = '0.4';
            }, 0);
          });

          el.addEventListener('dragend', function () {
            if (state.dragged) state.dragged.style.opacity = '1';
            state.dragged = null;
            doc.querySelectorAll('.drag-over-active').forEach(function (item) { item.classList.remove('drag-over-active'); });
          });

          el.addEventListener('dragover', function (ev) {
            if (!doc.body.classList.contains(activeClass) || !state.dragged || state.dragged === el) return;
            ev.preventDefault();
            ev.dataTransfer.dropEffect = 'move';
          });

          el.addEventListener('dragenter', function () {
            if (!doc.body.classList.contains(activeClass) || !state.dragged || state.dragged === el) return;
            el.classList.add('drag-over-active');
          });

          el.addEventListener('dragleave', function () {
            el.classList.remove('drag-over-active');
          });

          el.addEventListener('drop', function (ev) {
            if (!doc.body.classList.contains(activeClass) || !state.dragged || state.dragged === el) return;
            ev.preventDefault();
            ev.stopPropagation();
            el.classList.remove('drag-over-active');
            var parent = el.parentNode;
            if (!parent) return;
            var rect = el.getBoundingClientRect();
            var next = (ev.clientY - rect.top) > (rect.height / 2) || (ev.clientX - rect.left) > (rect.width / 2);
            parent.insertBefore(state.dragged, next ? el.nextSibling : el);
          });
        });
      });
    });

    if (!doc.__raPropBoxKeyBound) {
      doc.__raPropBoxKeyBound = true;
      doc.addEventListener('keydown', function (ev) {
        if (!doc.body.classList.contains(activeClass) || !state.selected) return;
        if (ev.target && ev.target.isContentEditable && ev.target !== state.selected) return;
        if (ev.key === 'Delete') {
          state.selected.remove();
          state.selected = null;
          return;
        }
        if (ev.altKey) {
          var stepPx = 4;
          var computed = w.getComputedStyle(state.selected);
          if (ev.key === 'ArrowRight') {
            ev.preventDefault();
            state.selected.style.marginRight = ((parseFloat(computed.marginRight) || 0) + stepPx) + 'px';
          } else if (ev.key === 'ArrowLeft') {
            ev.preventDefault();
            state.selected.style.marginRight = Math.max(0, (parseFloat(computed.marginRight) || 0) - stepPx) + 'px';
          } else if (ev.key === 'ArrowDown') {
            ev.preventDefault();
            state.selected.style.marginBottom = ((parseFloat(computed.marginBottom) || 0) + stepPx) + 'px';
          } else if (ev.key === 'ArrowUp') {
            ev.preventDefault();
            state.selected.style.marginBottom = Math.max(0, (parseFloat(computed.marginBottom) || 0) - stepPx) + 'px';
          }
        }
      });
    }
  }

  function setupDossierCardDragAndResize(opts) {
    opts = opts || {};
    var w = getWin(opts.win);
    var doc = w.document;
    var isEditModeFn = typeof opts.isEditMode === 'function' ? opts.isEditMode : function () { return false; };
    var onMutateFn = typeof opts.onMutate === 'function' ? opts.onMutate : function () {};

    doc.querySelectorAll('.card').forEach(function (card) {
      var dh = card.querySelector('.dossier-drag-handle');
      if (dh) {
        dh.onmousedown = function (e) {
          if (!isEditModeFn()) return;
          e.preventDefault();
          e.stopPropagation();

          var startX = e.clientX;
          var startY = e.clientY;
          var transform = card.style.transform || '';
          var curX = 0, curY = 0;
          var match = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(transform);
          if (match) {
            curX = parseFloat(match[1]);
            curY = parseFloat(match[2]);
          }
          card.style.zIndex = '1000';

          function onMouseMove(moveEvent) {
            var targetX = Math.max(-250, Math.min(250, curX + (moveEvent.clientX - startX)));
            var targetY = Math.max(-180, Math.min(180, curY + (moveEvent.clientY - startY)));
            card.style.transform = 'translate(' + targetX + 'px, ' + targetY + 'px)';
          }
          function onMouseUp() {
            doc.removeEventListener('mousemove', onMouseMove);
            doc.removeEventListener('mouseup', onMouseUp);
            card.style.zIndex = '';
            onMutateFn();
          }
          doc.addEventListener('mousemove', onMouseMove);
          doc.addEventListener('mouseup', onMouseUp);
        };
      }

      var rh = card.querySelector('.dossier-resize-handle');
      if (rh) {
        rh.onmousedown = function (e) {
          if (!isEditModeFn()) return;
          e.preventDefault();
          e.stopPropagation();

          var startX = e.clientX;
          var startY = e.clientY;
          var startW = card.offsetWidth;
          var startH = card.offsetHeight;
          var parentSheet = card.closest('.sheet');
          var maxW = parentSheet ? (parentSheet.clientWidth - 50) : 950;
          var maxH = parentSheet ? (parentSheet.clientHeight - 80) : 650;
          card.style.flex = 'none';

          function onMouseMove(moveEvent) {
            var newW = Math.max(80, Math.min(maxW, startW + (moveEvent.clientX - startX)));
            var newH = Math.max(40, Math.min(maxH, startH + (moveEvent.clientY - startY)));
            card.style.width = newW + 'px';
            card.style.height = newH + 'px';
          }
          function onMouseUp() {
            doc.removeEventListener('mousemove', onMouseMove);
            doc.removeEventListener('mouseup', onMouseUp);
            onMutateFn();
          }
          doc.addEventListener('mousemove', onMouseMove);
          doc.addEventListener('mouseup', onMouseUp);
        };
      }
    });
  }

  var api = {
    getOpenerWindow: getOpenerWindow,
    notify: notify,
    confirmAsync: confirmAsync,
    capture3DCanvas: capture3DCanvas,
    exportDocx: exportDocx,
    exportHtml: exportHtml,
    bindSelectionToolbar: bindSelectionToolbar,
    setupDocDraggableBlocks: setupDocDraggableBlocks,
    setupProposalInteractiveBoxes: setupProposalInteractiveBoxes,
    setupDossierCardDragAndResize: setupDossierCardDragAndResize
  };

  root.RADocRuntime = api;
  if (!root.RA) root.RA = {};
  root.RA.DocRuntime = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
