/**
 * js/a11y-dialogs.js — Accesibilidad WCAG 2.1 AA/AAA, Focus Trap y Diálogos Asíncronos No Bloqueantes
 * ===================================================================================================
 * Arquitectura AAA (Proyecto RA · Track 6):
 *  - Sustituye window.alert / window.confirm bloqueantes (que congelan Cesium WebGL) por raAlert y raConfirmAsync.
 *  - Vincula automáticamente <label for>, aria-label y soporte de teclado (role="button", tabindex="0", Enter/Space).
 *  - Instala Focus Trap (Tab / Shift+Tab), cierre por Escape y restauración de foco en todos los modales críticos.
 */
(function(global) {
  'use strict';

  var _autoIdSeq = 0;
  var _activeModalStack = [];
  var _openerByModal = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  var _enhanceTimer = null;

  var TOP_MODAL_SELECTOR = [
    '#ra-equipment-catalog-modal',
    '#ra-cost-breakdown-modal',
    '#ra-company-branding-modal',
    '#ra-doc-modal',
    '#ra-projects-modal',
    '#ra-proposal-style-studio-modal',
    '#ra-bill-auditor-modal',
    '#ra-bifacial-modal',
    '#ra-async-confirm-modal',
    '[role="dialog"][aria-modal="true"]',
    '[role="alertdialog"][aria-modal="true"]'
  ].join(',');

  var FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  function _cleanText(str) {
    return String(str || '').replace(/\s+/g, ' ').trim();
  }

  function _humanizeId(id) {
    if (!id) return '';
    return _cleanText(
      String(id)
        .replace(/^(modal-|cfg-|step\d+-|doc-|pricing-|pss-|bill-|ra-|btn-|tag-)/i, '')
        .replace(/[-_]+/g, ' ')
    );
  }

  function _ensureControlId(ctrl) {
    if (ctrl.id) return ctrl.id;
    _autoIdSeq += 1;
    ctrl.id = 'ra-a11y-ctrl-' + _autoIdSeq;
    return ctrl.id;
  }

  function _deriveButtonLabel(btn) {
    var t = btn.getAttribute('title');
    if (t) return _cleanText(t);
    var icon = btn.querySelector('[data-lucide]');
    if (icon) {
      var icName = icon.getAttribute('data-lucide');
      var map = {
        x: 'Cerrar ventana',
        close: 'Cerrar ventana',
        trash: 'Eliminar',
        'trash-2': 'Eliminar',
        edit: 'Editar',
        'edit-2': 'Editar',
        'edit-3': 'Editar',
        settings: 'Ajustes',
        plus: 'Añadir',
        minus: 'Reducir',
        save: 'Guardar',
        download: 'Descargar',
        upload: 'Subir archivo',
        search: 'Buscar',
        refresh: 'Actualizar',
        'refresh-cw': 'Actualizar',
        copy: 'Copiar',
        eye: 'Mostrar u ocultar',
        help: 'Ayuda',
        'help-circle': 'Ayuda'
      };
      if (map[icName]) return map[icName];
      if (icName) return 'Acción: ' + icName.replace(/[-_]+/g, ' ');
    }
    var h = _humanizeId(btn.id);
    return h || 'Botón de acción';
  }

  function enhanceContainer(root) {
    if (typeof document === 'undefined') return;
    var scope = root && root.querySelectorAll ? root : document.body;
    if (!scope) return;

    // 1. Vincular <label> sin atributo `for` cuando exista control asociado cercano
    var labels = scope.querySelectorAll('label:not([for])');
    for (var i = 0; i < labels.length; i++) {
      var lbl = labels[i];
      var target = lbl.querySelector('input, select, textarea');
      if (!target && lbl.parentElement) {
        target = lbl.parentElement.querySelector('input, select, textarea');
      }
      if (!target && lbl.nextElementSibling && /^(INPUT|SELECT|TEXTAREA)$/.test(lbl.nextElementSibling.tagName)) {
        target = lbl.nextElementSibling;
      }
      if (target) {
        lbl.setAttribute('for', _ensureControlId(target));
      }
    }

    // 2. Garantizar aria-label en controles de formulario sin etiqueta accesible
    var inputs = scope.querySelectorAll('input:not([type="hidden"]), select, textarea');
    for (var j = 0; j < inputs.length; j++) {
      var inp = inputs[j];
      if (inp.hasAttribute('aria-label') || inp.hasAttribute('aria-labelledby')) continue;
      var derived = '';
      if (inp.id) {
        var matchingLbl = scope.querySelector('label[for="' + CSS.escape(inp.id) + '"]');
        if (matchingLbl) derived = _cleanText(matchingLbl.textContent);
      }
      if (!derived && inp.parentElement) {
        var wrapLbl = inp.parentElement.querySelector('label');
        if (wrapLbl) derived = _cleanText(wrapLbl.textContent);
      }
      if (!derived) derived = _cleanText(inp.getAttribute('placeholder'));
      if (!derived) derived = _cleanText(inp.getAttribute('title'));
      if (!derived) derived = _humanizeId(inp.id) || (inp.tagName.toLowerCase() === 'select' ? 'Selector' : 'Campo de entrada');
      if (derived) inp.setAttribute('aria-label', derived);
    }

    // 3. Garantizar aria-label en botones de icono / sin texto visible
    var buttons = scope.querySelectorAll('button:not([aria-label])');
    for (var k = 0; k < buttons.length; k++) {
      var btn = buttons[k];
      var txt = _cleanText(btn.textContent);
      if (!txt) {
        btn.setAttribute('aria-label', _deriveButtonLabel(btn));
      }
    }

    // 4. Hacer accesibles por teclado los <div> / <span> interactivos con onclick
    var interactiveEls = scope.querySelectorAll('div[onclick], span[onclick]');
    for (var m = 0; m < interactiveEls.length; m++) {
      var el = interactiveEls[m];
      if (el.id && /modal$/i.test(el.id)) continue; // overlays backdrop (Escape cierra)
      if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
      if (!el.dataset.raKbdBound) {
        el.dataset.raKbdBound = '1';
        el.addEventListener('keydown', function(ev) {
          if (ev.key === 'Enter' || ev.key === ' ') {
            if (ev.target && ev.target.closest('input, select, textarea, button, a')) return;
            ev.preventDefault();
            this.click();
          }
        });
      }
    }

    // 5. Marcar overlays de modales con role="dialog" + aria-modal="true"
    var modals = scope.querySelectorAll('#ra-equipment-catalog-modal, #ra-cost-breakdown-modal, #ra-company-branding-modal, #ra-doc-modal, #ra-projects-modal, #ra-proposal-style-studio-modal, #ra-bill-auditor-modal, #ra-bifacial-modal');
    for (var q = 0; q < modals.length; q++) {
      var mdl = modals[q];
      if (!mdl.hasAttribute('role')) mdl.setAttribute('role', 'dialog');
      if (!mdl.hasAttribute('aria-modal')) mdl.setAttribute('aria-modal', 'true');
    }
  }

  function _isVisible(el) {
    if (!el || !el.isConnected) return false;
    var st = global.getComputedStyle ? global.getComputedStyle(el) : null;
    if (st && (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0')) return false;
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  }

  function _getTopVisibleModal() {
    if (typeof document === 'undefined') return null;
    var candidates = Array.from(document.querySelectorAll(TOP_MODAL_SELECTOR)).filter(_isVisible);
    if (candidates.length === 0) return null;
    candidates.sort(function(a, b) {
      var za = parseInt((global.getComputedStyle ? global.getComputedStyle(a).zIndex : a.style.zIndex) || '0', 10) || 0;
      var zb = parseInt((global.getComputedStyle ? global.getComputedStyle(b).zIndex : b.style.zIndex) || '0', 10) || 0;
      return za - zb;
    });
    return candidates[candidates.length - 1];
  }

  function _closeModalElement(modal) {
    if (!modal) return;
    if (modal.id === 'ra-async-confirm-modal' && typeof modal._raCancel === 'function') {
      modal._raCancel();
      return;
    }
    var closeSelectors = [
      '[data-ra-modal-close]',
      '#pss-btn-close',
      '.doc-modal-close',
      '.bill-close-btn',
      '.modal-close-btn',
      'button[aria-label*="Cerrar" i]',
      'button[title*="Cerrar" i]'
    ];
    for (var i = 0; i < closeSelectors.length; i++) {
      var btn = modal.querySelector(closeSelectors[i]);
      if (btn && _isVisible(btn)) {
        btn.click();
        _restoreOpenerFocus(modal);
        return;
      }
    }
    if (modal.id === 'ra-cost-breakdown-modal' && typeof global.closeCostBreakdownModal === 'function') {
      global.closeCostBreakdownModal();
    } else if (modal.id === 'ra-company-branding-modal' && typeof global.closeCompanyBrandingModal === 'function') {
      global.closeCompanyBrandingModal();
    } else if (modal.id === 'ra-doc-modal' && typeof global.closeDocModal === 'function') {
      global.closeDocModal();
    } else if (modal.id === 'ra-projects-modal' && typeof global.raCloseProjectsModal === 'function') {
      global.raCloseProjectsModal();
    } else if (modal.id === 'ra-equipment-catalog-modal' && typeof global.closeEquipmentCatalogModal === 'function') {
      global.closeEquipmentCatalogModal();
    } else if (modal.id === 'ra-proposal-style-studio-modal') {
      modal.remove();
    } else {
      modal.style.display = 'none';
    }
    _restoreOpenerFocus(modal);
  }

  function _restoreOpenerFocus(modal) {
    if (_openerByModal && _openerByModal.has(modal)) {
      var prev = _openerByModal.get(modal);
      _openerByModal.delete(modal);
      if (prev && prev.isConnected && typeof prev.focus === 'function') {
        try { prev.focus(); } catch (_) {}
      }
    }
  }

  function _syncActiveModalFocus() {
    var topModal = _getTopVisibleModal();
    var lastTop = _activeModalStack.length ? _activeModalStack[_activeModalStack.length - 1] : null;
    if (topModal && topModal !== lastTop) {
      if (_openerByModal && !_openerByModal.has(topModal) && document.activeElement && !topModal.contains(document.activeElement)) {
        _openerByModal.set(topModal, document.activeElement);
      }
      _activeModalStack = _activeModalStack.filter(function(m) { return m !== topModal && _isVisible(m); });
      _activeModalStack.push(topModal);
      if (!topModal.contains(document.activeElement)) {
        var focusables = Array.from(topModal.querySelectorAll(FOCUSABLE_SELECTOR)).filter(_isVisible);
        if (focusables.length > 0) {
          try { focusables[0].focus(); } catch (_) {}
        }
      }
    } else if (!topModal && lastTop) {
      _activeModalStack = [];
      _restoreOpenerFocus(lastTop);
    }
  }

  function raAlert(message, type) {
    var text = String(message == null ? '' : message).trim();
    if (!text) return;
    var level = type || (/error|no se pudo|inválid|obligatorio/i.test(text) ? 'error' : (/aviso|recuerda|permite|espera|pega/i.test(text) ? 'warning' : 'info'));
    if (typeof global.showToast === 'function') {
      var titles = { error: 'ATENCIÓN', warning: 'AVISO', success: 'LISTO', info: 'INFORMACIÓN' };
      global.showToast(titles[level] || 'INFORMACIÓN', text, level, 5000);
      return;
    }
    if (typeof document === 'undefined') return;
    var host = document.getElementById('ra-nonblocking-toast-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'ra-nonblocking-toast-host';
      host.setAttribute('role', 'status');
      host.setAttribute('aria-live', 'polite');
      host.style.cssText = 'position:fixed;top:16px;right:16px;z-index:1000010;display:flex;flex-direction:column;gap:8px;max-width:400px;pointer-events:none;';
      document.body.appendChild(host);
    }
    var card = document.createElement('div');
    var borderCol = level === 'error' ? '#ef4444' : (level === 'warning' ? '#f59e0b' : '#10b981');
    card.style.cssText = 'pointer-events:auto;background:#0f172a;color:#f8fafc;border:1px solid ' + borderCol + ';border-left:4px solid ' + borderCol + ';padding:10px 14px;border-radius:8px;font-size:12px;line-height:1.4;box-shadow:0 12px 30px rgba(0,0,0,0.45);display:flex;align-items:flex-start;justify-content:space-between;gap:10px;';
    var msgSpan = document.createElement('span');
    msgSpan.textContent = text;
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Cerrar notificación');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = 'background:transparent;border:none;color:#94a3b8;font-size:16px;line-height:1;cursor:pointer;padding:0 2px;';
    closeBtn.onclick = function() { card.remove(); };
    card.appendChild(msgSpan);
    card.appendChild(closeBtn);
    host.appendChild(card);
    setTimeout(function() { if (card.isConnected) card.remove(); }, 5000);
  }

  function raConfirmAsync(message, titleOrOpts) {
    if (typeof document === 'undefined') return Promise.resolve(false);
    var opts = (typeof titleOrOpts === 'object' && titleOrOpts) ? titleOrOpts : { title: titleOrOpts };
    var title = opts.title || 'Confirmar acción';
    var confirmLabel = opts.confirmText || 'Confirmar';
    var cancelLabel = opts.cancelText || 'Cancelar';
    var prevFocus = document.activeElement;

    var existing = document.getElementById('ra-async-confirm-modal');
    if (existing) existing.remove();

    return new Promise(function(resolve) {
      var resolved = false;
      function finish(val) {
        if (resolved) return;
        resolved = true;
        if (overlay.isConnected) overlay.remove();
        if (prevFocus && prevFocus.isConnected && typeof prevFocus.focus === 'function') {
          try { prevFocus.focus(); } catch (_) {}
        }
        resolve(val);
      }

      var overlay = document.createElement('div');
      overlay.id = 'ra-async-confirm-modal';
      overlay.setAttribute('role', 'alertdialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-labelledby', 'ra-confirm-title');
      overlay.setAttribute('aria-describedby', 'ra-confirm-msg');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(2,6,23,0.78);backdrop-filter:blur(6px);z-index:1000020;display:flex;align-items:center;justify-content:center;padding:16px;';

      var box = document.createElement('div');
      box.style.cssText = 'background:#0f172a;border:1px solid rgba(56,189,248,0.35);border-radius:12px;max-width:440px;width:100%;padding:20px;box-shadow:0 24px 60px rgba(0,0,0,0.7);color:#f8fafc;font-family:Inter,system-ui,sans-serif;';

      var h3 = document.createElement('h3');
      h3.id = 'ra-confirm-title';
      h3.textContent = title;
      h3.style.cssText = 'margin:0 0 10px 0;font-size:15px;font-weight:800;color:#fff;';

      var p = document.createElement('p');
      p.id = 'ra-confirm-msg';
      p.textContent = String(message || '');
      p.style.cssText = 'margin:0 0 18px 0;font-size:13px;line-height:1.5;color:#cbd5e1;white-space:pre-line;';

      var actions = document.createElement('div');
      actions.style.cssText = 'display:flex;justify-content:flex-end;gap:10px;';

      var btnCancel = document.createElement('button');
      btnCancel.type = 'button';
      btnCancel.textContent = cancelLabel;
      btnCancel.style.cssText = 'padding:8px 14px;border-radius:7px;background:#1e293b;border:1px solid #475569;color:#e2e8f0;font-size:12px;font-weight:700;cursor:pointer;';
      btnCancel.onclick = function() { finish(false); };

      var btnOk = document.createElement('button');
      btnOk.type = 'button';
      btnOk.textContent = confirmLabel;
      btnOk.style.cssText = 'padding:8px 16px;border-radius:7px;background:#059669;border:1px solid #10b981;color:#fff;font-size:12px;font-weight:800;cursor:pointer;';
      btnOk.onclick = function() { finish(true); };

      overlay._raCancel = function() { finish(false); };
      overlay.onclick = function(ev) { if (ev.target === overlay) finish(false); };

      actions.appendChild(btnCancel);
      actions.appendChild(btnOk);
      box.appendChild(h3);
      box.appendChild(p);
      box.appendChild(actions);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      setTimeout(function() { try { btnOk.focus(); } catch (_) {} }, 10);
    });
  }

  function initA11yDialogs() {
    if (typeof document === 'undefined') return;
    enhanceContainer(document.body);

    document.addEventListener('keydown', function(ev) {
      var topModal = _getTopVisibleModal();
      if (!topModal) return;

      if (ev.key === 'Escape') {
        ev.preventDefault();
        ev.stopPropagation();
        _closeModalElement(topModal);
        return;
      }

      if (ev.key === 'Tab') {
        var focusables = Array.from(topModal.querySelectorAll(FOCUSABLE_SELECTOR)).filter(_isVisible);
        if (focusables.length === 0) return;
        var first = focusables[0];
        var last = focusables[focusables.length - 1];
        if (ev.shiftKey) {
          if (document.activeElement === first || !topModal.contains(document.activeElement)) {
            ev.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last || !topModal.contains(document.activeElement)) {
            ev.preventDefault();
            first.focus();
          }
        }
      }
    }, true);

    if (typeof MutationObserver !== 'undefined') {
      var observer = new MutationObserver(function() {
        if (_enhanceTimer) return;
        _enhanceTimer = setTimeout(function() {
          _enhanceTimer = null;
          enhanceContainer(document.body);
          _syncActiveModalFocus();
        }, 60);
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class', 'hidden']
      });
    }
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initA11yDialogs);
    } else {
      initA11yDialogs();
    }
  }

  global.RAA11y = {
    enhanceContainer: enhanceContainer,
    alert: raAlert,
    confirmAsync: raConfirmAsync
  };
  global.raAlert = raAlert;
  global.raConfirmAsync = raConfirmAsync;
  global.RA = global.RA || {};
  global.RA.ui = global.RA.ui || {};
  global.RA.ui.alert = raAlert;
  global.RA.ui.confirmAsync = raConfirmAsync;
})(typeof window !== 'undefined' ? window : this);
