/**
 * ============================================================================
 * 🛡️ RA · HTML ESCAPE HELPER (vía única de interpolación)
 * ============================================================================
 * Archivo: js/html-sanitize.js
 * Rol: puerta única para interpolar datos (usuario, proyecto importado, IA,
 *      terceros como Nominatim/Catastro o proxies públicos) dentro de HTML.
 *      Complementa a RASanitize.sanitizer allowlist:
 *        - RAHtml.esc(x)   → texto segura (escape completo de & < > " ')
 *        - RAHtml.attr(x)  → atributo seguro (además comillas)
 *        - RAHtml.rich(h)  → HTML enriquecido (delegado a RASanitize.richText)
 *        - RAHtml.plain(t) → texto plano (delegado a RASanitize.plain)
 *
 * [AUD-2026 v2 · SEC2-02..15] Motivo: la ola comercial (style-studio + dossier)
 * interpolaba `{{clientName}}`, nombres de objetos y plantillas sin escapar.
 * Regla de proyecto: NADA entra en `innerHTML` sin pasar por RAHtml/RASanitize.
 * ============================================================================
 */
(function (root) {
  'use strict';

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function esc(value) {
    return escapeHtml(value);
  }

  function attr(value) {
    // Para entre comillas dobles siempre: además de escapar, no se permiten comillas
    return escapeHtml(value).replace(/`/g, '&#96;').replace(/\$/g, '$');
  }

  var rich = (typeof root.RASanitize === 'object' && root.RASanitize && typeof root.RASanitize.richText === 'function')
    ? root.RASanitize.richText
    : escapeHtml; // Degradación segura si RASanitize no está (tests headless)

  var plain = (typeof root.RASanitize === 'object' && root.RASanitize && typeof root.RASanitize.plain === 'function')
    ? root.RASanitize.plain
    : escapeHtml;

  var api = { esc: esc, attr: attr, rich: rich, plain: plain };
  if (!root.RA) root.RA = {};
  root.RAHtml = api;
  root.RA.Esc = api;
})(typeof window !== 'undefined' ? window : this);
