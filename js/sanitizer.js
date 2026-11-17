/**
 * ============================================================================
 * 🛡️ RA · SANITIZADOR DE TEXTO ENRIQUECIDO
 * ============================================================================
 * Archivo: js/sanitizer.js
 * Rol: única puerta de entrada para HTML generado por IA o por datos de usuario
 *      que deba renderizarse como texto enriquecido (resúmenes comerciales,
 *      toasts, notas editables).
 *
 * [AUD-2026 · B-08] Motivo: `modalAiSummaryBox.innerHTML = text` permitía que una
 * factura manipulada (prompt injection) inyectara `<img onerror=…>` y exfiltrara
 * `localStorage` (incluida la clave de Gemini). El saneado debe ser por allowlist,
 * no por lista negra.
 *
 * API:
 *   RASanitize.richText(html)  → HTML con solo etiquetas/atributos permitidos
 *   RASanitize.plain(text)     → texto plano escapado
 * ============================================================================
 */
(function (root) {
  'use strict';

  var ALLOWED_TAGS = {
    B: 1, STRONG: 1, I: 1, EM: 1, U: 1, BR: 1, P: 1,
    UL: 1, OL: 1, LI: 1, SPAN: 1, DIV: 1, H3: 1, H4: 1, SMALL: 1
  };

  function plain(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function stripDangerousBlocks(html) {
    return String(html == null ? '' : html)
      .replace(/<(script|style|iframe|object|embed|svg|math|template|link|meta)\b[\s\S]*?<\/\1\s*>/gi, '')
      .replace(/<(script|style|iframe|object|embed|svg|math|template|link|meta)\b[^>]*\/?>/gi, '');
  }

  function safeImageSrc(src) {
    var s = String(src == null ? '' : src).trim();
    if (!s || /["'<>\\`\r\n]/.test(s)) return '';
    if (/^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(s)) {
      return s;
    }
    if (/^assets\/[A-Za-z0-9_.\-\/]+\.(?:png|jpe?g|webp|gif)$/i.test(s) && s.indexOf('..') === -1) {
      return s;
    }
    return '';
  }

  function safeCssUrl(src) {
    var safe = safeImageSrc(src);
    if (!safe || /[()]/.test(safe)) return '';
    return safe;
  }

  function richText(html) {
    var source = stripDangerousBlocks(html);

    // Sin DOM (Node/tests): se degrada a texto plano seguro.
    if (typeof root.DOMParser !== 'function' || !root.document) return plain(source);

    var doc;
    try {
      doc = new root.DOMParser().parseFromString(source, 'text/html');
    } catch (e) {
      return plain(source);
    }
    var host = doc && doc.body;
    if (!host) return plain(source);

    var walk = function (node) {
      var children = Array.prototype.slice.call(node.childNodes || []);
      for (var i = 0; i < children.length; i++) {
        var child = children[i];
        if (child.nodeType === 8) { // comentario
          node.removeChild(child);
          continue;
        }
        if (child.nodeType !== 1) continue; // texto: se conserva

        var tag = String(child.tagName || '').toUpperCase();
        if (!ALLOWED_TAGS[tag]) {
          // Se desenvuelve: conserva el texto, elimina la etiqueta y sus atributos.
          var textNode = doc.createTextNode(child.textContent || '');
          if (child.parentNode) child.parentNode.replaceChild(textNode, child);
          continue;
        }
        var attrs = Array.prototype.slice.call(child.attributes || []);
        for (var a = 0; a < attrs.length; a++) child.removeAttribute(attrs[a].name);
        walk(child);
      }
    };
    walk(host);
    return host.innerHTML;
  }

  var api = { richText: richText, plain: plain, safeImageSrc: safeImageSrc, safeCssUrl: safeCssUrl };
  if (!root.RA) root.RA = {};
  root.RASanitize = api;
  root.RA.Sanitize = api;
})(typeof window !== 'undefined' ? window : this);
